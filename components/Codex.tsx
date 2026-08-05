import { useMemo, useState } from 'react';
import { FlatList, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  bookDropChance, collectedCount, collectionScales, decodeCollection, entryProgress, TOTAL_ITEMS,
} from '../game/collection';
import { CODEX_ENTRIES, MAX_ELEMENT_BONUS, MAX_ENTRY_LEVEL } from '../game/codexEntries';
import { ELEMENTS } from '../game/laneRunSkills';
import { EQUIPMENT_SLOT_LABELS } from './slotLabels';
import { elementColor, elementLabel } from './artAssets';
import { itemIcon } from './itemIcons';

// 裝備圖鑑。**這裡不穿裝備,只看收集進度**——那 5668 件在這款是「內容」不是「數值棒」
// (為什麼:見 game/collection.ts 的檔頭)。
//
// ## 一格 = 一張美術圖,底下的裝備是它的碎片
//
// 5668 件共用 501 張圖(同一個職業/階級/分支/部位的所有 bracket 共畫一張),
// 所以圖鑑列的是**501 個條目**,每個底下 3~34 件裝備當碎片。這不是為了少畫幾格,
// 是因為「一格一張看得到的圖」才叫圖鑑——5668 個沒有圖的名字只是一張表。
// 而且碎片就是既有的 bitset,存檔一個欄位都不用改。
//
// ## 為什麼用 FlatList 而不是 ScrollView
//
// 501 格 x(圖 + 四行字)一次全部掛上去,開這一頁會卡住好幾秒。
// FlatList 只掛可視範圍附近的那幾格,捲動才跟得上手。

const COLUMNS = 3;
const ICON = 40;

interface Props {
  /** 存檔裡的圖鑑字串(base64 bitset)。 */
  collected: string;
  books: number;
  onDone: () => void;
}

/** 職業分頁。501 格一次列完捲不完,而且玩家找東西時想的就是「我那一套」。 */
const TABS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'physicalMelee', label: '物近' },
  { key: 'physicalRanged', label: '物遠' },
  { key: 'physicalSupport', label: '物輔' },
  { key: 'magicMelee', label: '魔近' },
  { key: 'magicRanged', label: '魔遠' },
  { key: 'magicSupport', label: '魔輔' },
  { key: 'student', label: '學生' },
];

export function Codex({ collected, books, onDone }: Props) {
  const [bits] = useState(() => decodeCollection(collected));
  const [tab, setTab] = useState('all');

  // 501 個條目各自的進度算一次就好(每格自己算的話捲動時會重算幾百次)。
  const rows = useMemo(() => CODEX_ENTRIES.map((entry) => entryProgress(bits, entry)), [bits]);
  const scales = useMemo(() => collectionScales(bits), [bits]);
  const shown = useMemo(
    () => rows.filter((r) => tab === 'all'
      || (tab === 'student' ? r.entry.archetype === null : r.entry.archetype === tab)),
    [rows, tab],
  );

  const own = collectedCount(bits);
  const ratio = TOTAL_ITEMS === 0 ? 0 : own / TOTAL_ITEMS;
  const done = rows.filter((r) => r.level >= MAX_ENTRY_LEVEL).length;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>裝備圖鑑</Text>
      <Text style={styles.count}>{done} / {CODEX_ENTRIES.length} 件湊齊</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(1, ratio * 100)}%` }]} />
      </View>
      <Text style={styles.sub}>碎片 {own} / {TOTAL_ITEMS} · 每場跑完都會撿到,陣亡也撿得到</Text>

      {/*
        屬性加成一欄一個屬性。**加成是逐屬性的**(每個條目綁一個屬性),
        所以這一排同時是「我還差哪一種」的地圖——只寫一個總和的話,
        玩家不會知道該往哪裡收(見 game/codexEntries.ts)。
      */}
      <View style={styles.elementRow}>
        {ELEMENTS.map((id) => {
          const bonus = Math.round(((scales[id] ?? 1) - 1) * 100);
          return (
            <View key={id} style={styles.elementBox}>
              <Text style={[styles.elementName, { color: elementColor(id) }]}>{elementLabel(id)}</Text>
              <Text style={[styles.elementValue, bonus > 0 && styles.elementValueOn]}>+{bonus}%</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.sub}>
        屬性傷害加成,每件湊齊 +{MAX_ENTRY_LEVEL}%,單一屬性最多 +{Math.round(MAX_ELEMENT_BONUS * 100)}%
        {'  ·  '}技能書掉落 {(bookDropChance(bits) * 100).toFixed(0)}%(目前 {books} 級)
      </Text>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            accessibilityLabel={`圖鑑分頁 ${t.label}`}
            style={[styles.tab, tab === t.key && styles.tabOn]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        style={styles.list}
        data={shown}
        numColumns={COLUMNS}
        keyExtractor={(r) => r.entry.key}
        initialNumToRender={18}
        windowSize={5}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridInner}
        renderItem={({ item }) => {
          const art = itemIcon(item.entry.key);
          const tint = elementColor(item.entry.element);
          return (
            <View
              accessibilityLabel={`圖鑑 ${item.entry.name} ${item.own}/${item.total}`}
              style={[styles.cell, item.level >= MAX_ENTRY_LEVEL && { borderColor: tint ?? '#3a3448' }]}
            >
              {/* 還沒收到的畫成剪影:圖鑑的樂趣是「看得到輪廓但還沒拿到」,
                  整格空白的話玩家不知道自己在找什麼。 */}
              {art && (
                <Image
                  source={art}
                  resizeMode="contain"
                  style={[
                    styles.icon, styles.pixelArt,
                    item.own === 0 ? { tintColor: '#3a3448', opacity: 0.9 } : null,
                  ]}
                />
              )}
              <Text style={styles.cellName} numberOfLines={2}>{item.entry.name}</Text>
              <Text style={styles.cellSlot} numberOfLines={1}>
                {EQUIPMENT_SLOT_LABELS[item.entry.slot] ?? item.entry.slot}
                {item.entry.tier > 0 ? ` ${item.entry.tier} 階` : ''}
              </Text>
              <Text style={styles.cellFrag}>
                {item.own}/{item.total}{item.level > 0 ? ` · Lv${item.level}` : ''}
              </Text>
              <Text style={[styles.cellBonus, { color: item.level > 0 ? tint : '#5a5a66' }]} numberOfLines={1}>
                {elementLabel(item.entry.element)}屬 +{Math.round(item.bonus * 100)}%
              </Text>
            </View>
          );
        }}
      />

      <Pressable style={styles.button} accessibilityLabel="回主介面" onPress={onDone}>
        <Text style={styles.buttonLabel}>回主介面</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', maxWidth: 520, flex: 1, alignItems: 'center', gap: 6 },
  title: { color: '#e0a95c', fontSize: 20, fontWeight: '700' },
  count: { color: '#f2f2f2', fontSize: 22, fontWeight: '700' },
  barTrack: { width: '100%', height: 8, backgroundColor: '#2a2a35', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#e0a95c' },
  sub: { color: '#8a8a95', fontSize: 11, textAlign: 'center' },

  elementRow: { flexDirection: 'row', gap: 3, width: '100%' },
  elementBox: {
    flex: 1, alignItems: 'center', paddingVertical: 4,
    backgroundColor: '#2a2a35', borderRadius: 6,
  },
  elementName: { fontSize: 13, fontWeight: '700' },
  elementValue: { color: '#5a5a66', fontSize: 10 },
  elementValueOn: { color: '#5ec26a', fontWeight: '700' },

  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  tab: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, backgroundColor: '#2a2a35' },
  tabOn: { backgroundColor: '#e0a95c' },
  tabLabel: { color: '#8a8a95', fontSize: 12 },
  tabLabelOn: { color: '#16161c', fontWeight: '700' },

  list: { width: '100%', flex: 1 },
  gridInner: { gap: 6, paddingVertical: 6 },
  gridRow: { gap: 6 },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#2a2a35',
    borderWidth: 1,
    borderColor: '#3a3448',
    gap: 1,
  },
  icon: { width: ICON, height: ICON },
  pixelArt: Platform.OS === 'web' ? ({ imageRendering: 'pixelated' } as object) : {},
  cellName: { color: '#f2f2f2', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  cellSlot: { color: '#8a8a95', fontSize: 9 },
  cellFrag: { color: '#e0a95c', fontSize: 10, fontWeight: '700' },
  cellBonus: { fontSize: 9 },

  button: {
    width: '100%',
    backgroundColor: '#e0a95c',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonLabel: { color: '#16161c', fontSize: 16, fontWeight: '700' },
});
