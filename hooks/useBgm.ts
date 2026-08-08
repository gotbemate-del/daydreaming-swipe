import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAudioPlayer } from 'expo-audio';

// 背景音樂。**用既有的那一份** `assets/sounds/bgm.wav`(20 秒、22kHz 單聲道),循環播放。
//
// ## 為什麼放在 app 層而不是 LaneRunner 裡
//
// LaneRunner **每一關都換 key 重新掛載**(生存模式尤其:一關接一關),
// 播放器掛在裡面的話音樂會每十波從頭開始播一次——那比沒有音樂還糟。
// 掛在 app/index.tsx 的話它跨越主介面 / 跑圖 / 圖鑑 / 轉職都是同一個實例。
//
// ## 瀏覽器不讓你自動播,而且**接不住那個錯**
//
// Chrome/Safari 都擋「使用者還沒互動過就出聲」。麻煩的是 expo-audio 的 web 實作
// (`AudioPlayerWeb.play()`)裡面是 `this.media.play()` —— **它沒有回傳那個 promise**,
// 所以呼叫端根本沒有東西可以 `.catch()`,被擋下來就是一行紅色的 unhandled rejection
// (實測:`play() failed because the user didn't interact with the document first`)。
//
// 所以解法不是「呼叫了再接錯」,而是**在網頁上根本不要在互動之前呼叫**:
// 先掛一次性的 pointerdown/keydown,玩家第一次碰畫面才開播。原生平台沒有這條限制,直接播。
//
// gestureSeen 放模組層而不是元件層:玩家中途關掉音樂再打開時,那時候早就互動過了,
// 應該立刻出聲而不是再等他多點一下。
//
// ## 音量
//
// 音量由玩家決定(設定面板的滑桿,存進存檔),預設 `DEFAULT_BGM_VOLUME` = 0.35。
// 0.35 不是隨便挑的:這份 bgm 的峰值很滿,1.0 會蓋掉音效
//(被武器砸中、技能觸發那類提示)的空間,而且手機外放時 0.35 已經聽得很清楚。
//
// **音量要另外一個 effect 去套,不能跟「播/停」擠在同一個。** 擠在一起的話,
// 拖滑桿的每一格都會重跑一次 `player.play()`——網頁上那是一次 seek + 重新解碼,
// 拖動時聲音會一直斷。現在拖滑桿只動 `player.volume`,播放本身完全沒被碰到。

const BGM = require('../assets/sounds/bgm.wav');

/** 這一輪頁面有沒有被碰過。網頁的自動播放政策看的就是這件事。 */
let gestureSeen = Platform.OS !== 'web';

/**
 * @param enabled 要不要播(玩家把音樂關掉就是 false)。
 * @param volume  0~1。玩家在設定面板拖的那一條。
 */
export function useBgm(enabled: boolean, volume: number): void {
  const player = useAudioPlayer(BGM);
  const wantsRef = useRef(enabled);
  wantsRef.current = enabled;

  useEffect(() => {
    player.loop = true;
  }, [player]);

  // 音量獨立一個 effect,拖滑桿才不會順便重啟播放(見上面的註解)。
  useEffect(() => {
    player.volume = Math.min(1, Math.max(0, volume));
  }, [player, volume]);

  useEffect(() => {
    if (!enabled) {
      player.pause();
      return;
    }
    if (gestureSeen) {
      player.play();
      return;
    }
    // 還沒互動過:掛一次性的監聽,碰到畫面再開播。
    // **一定要用 once**:留著監聽的話,之後每一次點擊都會再呼叫一次 play()。
    if (typeof window === 'undefined') return;
    const onGesture = () => {
      gestureSeen = true;
      if (wantsRef.current) player.play();
    };
    window.addEventListener('pointerdown', onGesture, { once: true });
    window.addEventListener('keydown', onGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [enabled, player]);
}
