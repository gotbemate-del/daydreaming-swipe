import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  bookDropChance, COLLECTION_FLAVOUR_BONUS, collectedCount, collectionFlavourScale,
  decodeCollection, hasItem, itemAt, TOTAL_ITEMS,
} from '../game/collection';
import { EQUIPMENT_SLOT_LABELS } from './slotLabels';

// 裝備圖鑑。**這裡不穿裝備,只看收集進度**——那 5668 件在這款是「內容」不是「數值棒」
// (為什麼:見 game/collection.ts 的檔頭)。
//
// 畫面只畫「每個部位收了幾件 + 現在的加成」,不逐件列出 5668 個格子:
// 一次渲染 5668 個 View 在手機上會直接卡住,而且玩家真正想知道的是「我離下一段有多遠」。
// 逐件的格子牆等之後有需求再做成分頁。

interface Props {
  /** 存檔裡的圖鑑字串(base64 bitset)。 */
  collected: string;
  books: number;
  onDone: () => void;
}

export function Codex({ collected, books, onDone }: Props) {
  const [bits] = useState(() => decodeCollection(collected));
  const stats = useMemo(() => {
    const perSlot = new Map<string, { own: number; total: number }>();
    for (let i = 0; i < TOTAL_ITEMS; i++) {
      const item = itemAt(i);
      if (!item) continue;
      const row = perSlot.get(item.slot) ?? { own: 0, total: 0 };
      row.total += 1;
      if (hasItem(bits, i)) row.own += 1;
      perSlot.set(item.slot, row);
    }
    return [...perSlot.entries()].sort((a, b) => b[1].own - a[1].own);
  }, [bits]);

  const own = collectedCount(bits);
  const ratio = TOTAL_ITEMS === 0 ? 0 : own / TOTAL_ITEMS;
  const flavour = collectionFlavourScale(bits);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>裝備圖鑑</Text>
      <Text style={styles.count}>{own} / {TOTAL_ITEMS}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(1, ratio * 100)}%` }]} />
      </View>

      {/* 圖鑑給的兩樣東西。兩個都刻意不加戰力——加了敵人會跟著長,
          玩家蒐集半天卻感覺不到差別(見 game/collection.ts)。 */}
      <View style={styles.bonusRow}>
        <View style={styles.bonusBox}>
          <Text style={styles.bonusValue}>+{Math.round((flavour - 1) * 100)}%</Text>
          <Text style={styles.bonusLabel}>屬性與主動技能效果</Text>
          <Text style={styles.bonusMax}>收滿 +{Math.round(COLLECTION_FLAVOUR_BONUS * 100)}%</Text>
        </View>
        <View style={styles.bonusBox}>
          <Text style={styles.bonusValue}>{(bookDropChance(bits) * 100).toFixed(0)}%</Text>
          <Text style={styles.bonusLabel}>每場通關掉技能書</Text>
          <Text style={styles.bonusMax}>目前技能書 {books} 級</Text>
        </View>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
        {stats.map(([slot, row]) => (
          <View key={slot} style={styles.slotRow}>
            <Text style={styles.slotName}>{EQUIPMENT_SLOT_LABELS[slot] ?? slot}</Text>
            <View style={styles.slotBarTrack}>
              <View style={[styles.slotBarFill, { width: `${(row.own / row.total) * 100}%` }]} />
            </View>
            <Text style={styles.slotCount}>{row.own}/{row.total}</Text>
          </View>
        ))}
        <Text style={styles.foot}>跑完一場就會撿到裝備,陣亡也撿得到(只是少一點)。</Text>
      </ScrollView>

      <Pressable style={styles.button} accessibilityLabel="回主介面" onPress={onDone}>
        <Text style={styles.buttonLabel}>回主介面</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', maxWidth: 520, flex: 1, alignItems: 'center', gap: 8 },
  title: { color: '#e0a95c', fontSize: 20, fontWeight: '700' },
  count: { color: '#f2f2f2', fontSize: 26, fontWeight: '700' },
  barTrack: { width: '100%', height: 8, backgroundColor: '#2a2a35', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#e0a95c' },

  bonusRow: { flexDirection: 'row', gap: 8, width: '100%' },
  bonusBox: {
    flex: 1,
    backgroundColor: '#2a2a35',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3a3448',
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  bonusValue: { color: '#5ec26a', fontSize: 20, fontWeight: '700' },
  bonusLabel: { color: '#f2f2f2', fontSize: 12, textAlign: 'center' },
  bonusMax: { color: '#8a8a95', fontSize: 11 },

  list: { width: '100%', flex: 1 },
  listInner: { gap: 6, paddingVertical: 6 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slotName: { color: '#f2f2f2', fontSize: 13, width: 56 },
  slotBarTrack: { flex: 1, height: 6, backgroundColor: '#2a2a35', borderRadius: 3, overflow: 'hidden' },
  slotBarFill: { height: '100%', backgroundColor: '#9691a5' },
  slotCount: { color: '#8a8a95', fontSize: 11, width: 64, textAlign: 'right' },
  foot: { color: '#8a8a95', fontSize: 11, marginTop: 8, textAlign: 'center' },

  button: {
    width: '100%',
    backgroundColor: '#e0a95c',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonLabel: { color: '#16161c', fontSize: 16, fontWeight: '700' },
});
