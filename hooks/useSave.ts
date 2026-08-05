import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { newSave, readSave, writeSave, SAVE_KEY, type SaveData } from '../game/save';

/**
 * 存檔的讀寫。**格式、驗證、遷移全部在 game/save.ts**,這裡只負責碰儲存體與時機。
 *
 * AsyncStorage 在 web 上其實就是 localStorage,但走同一個 API,所以原生版不必再寫一份。
 *
 * ## 為什麼要有 loaded
 *
 * 讀取是非同步的,而畫面在第一格就會 render。沒有 loaded 的話,玩家會先看到 1-1 的主介面
 * 閃一下才跳回真正的進度——更糟的是,如果他在那一瞬間按下「開始闖關」,就會用預設值開一場,
 * 結束時把 stage 1 寫回去,**300 關的進度就被一個 loading 閃爍蓋掉了**。
 * 所以 loaded 之前一律不畫遊戲,也一律不寫入。
 */
export interface SaveHandle {
  save: SaveData;
  /** 讀完了沒。false 的時候畫面應該顯示 loading,而且絕對不要讓玩家開始跑圖。 */
  loaded: boolean;
  /** 改存檔。傳函式,拿到的是最新的那一份(跟 setState 一樣)。 */
  update: (next: (prev: SaveData) => SaveData) => void;
  /** 清掉存檔,回到全新狀態。 */
  reset: () => void;
}

/**
 * 寫入節流。每次 update 都寫的話,一場結束的瞬間會連寫好幾次(金幣、技能、關卡各一次)。
 * 400ms 夠把同一批改動合成一次,又短到「按完就切出去」也來得及寫完。
 */
const WRITE_DEBOUNCE_MS = 400;

export function useSave(): SaveHandle {
  const [save, setSave] = useState<SaveData>(newSave);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<SaveData | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const data = pendingRef.current;
    pendingRef.current = null;
    if (data === null) return;
    // 寫入失敗不該讓遊戲當掉(無痕模式、儲存空間滿了都會失敗)。玩家這一場照樣玩得完,
    // 只是進度沒留下來——比整個畫面炸掉好。
    AsyncStorage.setItem(SAVE_KEY, writeSave(data)).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(SAVE_KEY)
      .then((text) => {
        if (!alive) return;
        const { save: loadedSave, migrated } = readSave(text);
        setSave(loadedSave);
        setLoaded(true);
        // 遷移過(或原本就是壞的)就立刻寫回去,不然舊格式會一直留著,
        // 每次開遊戲都遷移一次,而且下一版的遷移鏈只會愈接愈長。
        if (migrated) AsyncStorage.setItem(SAVE_KEY, writeSave(loadedSave)).catch(() => {});
      })
      .catch(() => {
        // 讀不到就當成新玩家。這條路徑在無痕模式與某些 WebView 裡是常態,不是例外。
        if (!alive) return;
        setSave(newSave());
        setLoaded(true);
      });
    return () => { alive = false; };
  }, []);

  // 切到背景 / 關分頁之前把還沒寫的那一份寫掉。手機瀏覽器切出去常常直接凍結分頁,
  // 節流中的那 400ms 就永遠不會到——玩家的體感是「我明明打完了卻沒存到」。
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  const update = useCallback((next: (prev: SaveData) => SaveData) => {
    setSave((prev) => {
      const value = next(prev);
      pendingRef.current = value;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const data = pendingRef.current;
        pendingRef.current = null;
        if (data !== null) AsyncStorage.setItem(SAVE_KEY, writeSave(data)).catch(() => {});
      }, WRITE_DEBOUNCE_MS);
      return value;
    });
  }, []);

  const reset = useCallback(() => {
    pendingRef.current = null;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSave(newSave());
    AsyncStorage.removeItem(SAVE_KEY).catch(() => {});
  }, []);

  return { save, loaded, update, reset };
}
