import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PixelFrame } from './PixelFrame';
import { STAGE_BACKDROPS } from './stageBackdrops';
import { playSfx } from '../hooks/useSfx';
import type { BackdropId } from '../game/laneRun';

/**
 * 生存模式開頭的「本場地圖」。
 *
 * ## 為什麼生存模式的地圖要用抽的
 *
 * 一般模式的底圖綁大關(打到第幾關就在哪裡),那是進度的一部分。生存模式沒有進度——
 * 它從玩家目前的關卡一路連著跑,每一輪的差別只有「這次撐得比較久」。抽一張地圖等於
 * 給每一輪一個看得見的身分:玩家會記得「上次那場雪原」,而不是「上次那一場」。
 *
 * ## 為什麼是「抽好了再給重抽」,不是讓玩家自己按著抽
 *
 * 讓玩家按鈕停下輪盤會把開場變成一段必做的操作,而生存模式的節奏是**馬上開跑**。
 * 現在是抽好直接顯示,想換的人有 REDRAW_MS 可以按一次「重抽」,不按就自動開始。
 * 只給一次是刻意的:給無限次就等於「挑地圖」,那是另一個功能,而且會讓每一輪
 * 都從同一張常用地圖開始,抽籤的意義整個消失。
 *
 * ## 為什麼開著的時候跑圖要停住
 *
 * 這個面板是在跑道**上面**的,而跑道底下已經在跑了。不停的話,玩家在讀地圖名稱的
 * 這幾秒鐘會漏掉第一排閘門——第一排是整場唯一「起跑位置剛好在中間空隙上」的一排,
 * 漏掉它等於白白少一格。暫停由 LaneRunner 負責(跟設定面板同一條路徑)。
 */

/** 自動開始前留幾毫秒。夠讀完一行字並按一次按鈕,又不至於讓人等。 */
export const REDRAW_MS = 3000;

interface Props {
  backdrop: BackdropId;
  /** 重抽。呼叫端負責抽新的一張並換掉 backdrop——這裡不自己抽,免得兩邊各有一份亂數。 */
  onRedraw: () => void;
  /** 倒數結束或玩家按了「開始」。呼叫端收到之後才解除暫停。 */
  onDone: () => void;
}

export function MapDrawToast({ backdrop, onRedraw, onDone }: Props) {
  const [redrawn, setRedrawn] = useState(false);
  const [remain, setRemain] = useState(REDRAW_MS);
  // 倒數要能「重抽之後從頭再數」,所以起點是 state 不是掛載時間。
  const [countFrom, setCountFrom] = useState(() => Date.now());
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    playSfx('draw');
  }, [backdrop]);

  useEffect(() => {
    const id = setInterval(() => {
      const left = REDRAW_MS - (Date.now() - countFrom);
      if (left <= 0) {
        clearInterval(id);
        setRemain(0);
        doneRef.current();
        return;
      }
      setRemain(left);
    }, 100);
    return () => clearInterval(id);
  }, [countFrom]);

  const seconds = Math.ceil(remain / 1000);

  return (
    <View style={styles.overlay}>
      <PixelFrame style={styles.card}>
        <View style={styles.inner}>
          <Text style={styles.kicker}>生存模式 · 本場地圖</Text>
          <Text style={styles.name}>{STAGE_BACKDROPS[backdrop].name}</Text>

          {/* 倒數條:數字之外再給一條會縮短的橫槓。只有數字的話玩家得盯著讀,
              而他這時候的注意力應該在「要不要重抽」上面。 */}
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${(remain / REDRAW_MS) * 100}%` }]} />
          </View>

          <View style={styles.buttons}>
            <Pressable
              accessibilityLabel={redrawn ? '已重抽過' : '重抽地圖'}
              disabled={redrawn}
              style={[styles.redraw, redrawn && styles.redrawUsed]}
              onPress={() => {
                setRedrawn(true);
                onRedraw();
                // 重抽之後倒數從頭數:不重設的話玩家看新地圖只剩不到一秒。
                setCountFrom(Date.now());
                setRemain(REDRAW_MS);
              }}
            >
              <Text style={[styles.redrawLabel, redrawn && styles.redrawLabelUsed]}>
                {redrawn ? '已重抽' : '重抽(限一次)'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="開始生存"
              style={styles.go}
              onPress={() => {
                playSfx('click');
                onDone();
              }}
            >
              <Text style={styles.goLabel}>開始 {seconds}</Text>
            </Pressable>
          </View>
        </View>
      </PixelFrame>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16161cc0',
    zIndex: 55,
  },
  card: { minWidth: 250, maxWidth: '86%' },
  inner: { gap: 10, alignSelf: 'stretch' },
  kicker: { color: '#8a8a95', fontSize: 11, textAlign: 'center' },
  name: { color: '#e0a95c', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  barTrack: {
    height: 4, borderRadius: 2, backgroundColor: '#2a2a35', overflow: 'hidden', alignSelf: 'stretch',
  },
  barFill: { height: '100%', backgroundColor: '#9691a5' },
  buttons: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
  redraw: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#3a3448', borderWidth: 1, borderColor: '#9691a5',
  },
  redrawUsed: { backgroundColor: '#2a2a35', borderColor: '#3a3448' },
  redrawLabel: { color: '#f2f2f2', fontSize: 13, fontWeight: '700' },
  redrawLabelUsed: { color: '#8a8a95' },
  go: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#e0a95c',
  },
  goLabel: { color: '#16161c', fontSize: 13, fontWeight: '700' },
});
