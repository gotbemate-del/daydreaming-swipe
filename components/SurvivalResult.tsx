import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { stageLabel } from '../game/laneRun';
import { booksForSurvival, SURVIVAL_BOOK_THRESHOLDS } from '../game/save';
import { COIN_ICON } from './artAssets';
import { playSfx } from '../hooks/useSfx';
import { PixelFrame } from './PixelFrame';

// 生存模式的結算畫面。**它的重點是「下一級技能書還差幾波」**——
// 生存模式沒有進度可以推(關卡進度是一般模式的事),所以如果只顯示「你撐了 40 波」,
// 玩家不會知道自己離下一個東西有多遠,也就沒有再來一次的理由。

interface Props {
  /** 這一輪累計撐過幾波。**這才是分數**——生存模式是一條連續的跑圖。 */
  waves: number;
  /** 這一輪連過幾關(附註用的刻度,不是分數) */
  streak: number;
  /** 這一輪之前的最佳紀錄。用來標示有沒有破紀錄。 */
  previousBest: number;
  /** 死在哪一關 */
  diedAt: number;
  /** 這一輪賺到的金幣 */
  coins: number;
  onDone: () => void;
}

export function SurvivalResult({ waves, streak, previousBest, diedAt, coins, onDone }: Props) {
  const best = Math.max(waves, previousBest);
  const booksNow = booksForSurvival(best);
  const gained = booksNow - booksForSurvival(previousBest);
  const nextThreshold = SURVIVAL_BOOK_THRESHOLDS.find((t) => t > best);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>生存結束</Text>
      <PixelFrame style={styles.card}>
        <View style={styles.cardInner}>
        <Text style={styles.streak}>撐過 {waves} 波</Text>
        <Text style={styles.sub}>連過 {streak} 關 · 倒在 {stageLabel(diedAt)}</Text>
        {waves > previousBest && <Text style={styles.record}>新紀錄!(前一次 {previousBest} 波)</Text>}

        <View style={styles.row}>
          <Image source={COIN_ICON} resizeMode="contain" style={styles.coinIcon} />
          <Text style={styles.rowText}>+{coins}</Text>
        </View>

        {gained > 0 ? (
          <Text style={styles.book}>技能書 +{gained}(目前 {booksNow} 級)</Text>
        ) : (
          <Text style={styles.sub}>技能書 {booksNow} 級</Text>
        )}
        {nextThreshold !== undefined ? (
          <Text style={styles.next}>再撐到 {nextThreshold} 波就能拿下一級</Text>
        ) : (
          <Text style={styles.next}>技能書已經滿級了</Text>
        )}
        </View>
      </PixelFrame>
      <Pressable style={styles.button} accessibilityLabel="回主介面" onPress={() => { playSfx('click'); onDone(); }}>
        <Text style={styles.buttonLabel}>回主介面</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', maxWidth: 520, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  title: { color: '#e05050', fontSize: 22, fontWeight: '700' },
  // 外框走 PixelFrame(既有的 9-slice 像素框),所以這裡不再自己畫圓角與邊框。
  card: { width: '100%' },
  cardInner: { alignItems: 'center', gap: 8 },
  streak: { color: '#f2f2f2', fontSize: 28, fontWeight: '700' },
  sub: { color: '#8a8a95', fontSize: 13 },
  record: { color: '#e0a95c', fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  coinIcon: { width: 16, height: 16 },
  rowText: { color: '#f2f2f2', fontSize: 15, fontWeight: '600' },
  book: { color: '#5ec26a', fontSize: 15, fontWeight: '700' },
  next: { color: '#9691a5', fontSize: 12 },
  button: {
    width: '100%',
    backgroundColor: '#e0a95c',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonLabel: { color: '#16161c', fontSize: 17, fontWeight: '700' },
});
