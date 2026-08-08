import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { COIN_ICON, QUEST_ICON } from './artAssets';
import { PixelFrame } from './PixelFrame';
import { playSfx } from '../hooks/useSfx';
import type { QuestView } from '../game/quests';

// 任務面板。主介面的橫幅點下去就是這裡。
//
// ## 為什麼是一整頁而不是一個下拉
//
// 任務在這款的角色是「介面導覽」——它要告訴玩家分頁列上那幾個鎖著的東西什麼時候開、
// 開了之後去哪裡點。導覽要能一次看完,而下拉選單一次只看得到三四行。
//
// ## 已完成的任務留在清單裡
//
// 領完就消失的話,玩家會覺得任務列越來越空(而它其實是越來越滿)。留著並且畫成暗色,
// 「我做完幾個了」本身就是進度感——這也是為什麼 `questViews` 不過濾已領的那些。
//
// ## 版面
//
// 整頁可捲動,而且**按鈕在最上面不在最下面**:這個專案踩過最貴的一個坑就是
// 小螢幕把最下面那一列切到畫面外(見 CLAUDE.md 的「版面」)。關閉鈕放在標題列,
// 不管清單多長、螢幕多矮,它永遠在看得到的地方。

interface Props {
  views: QuestView[];
  /** 領獎。呼叫端負責加金幣、寫存檔。 */
  onClaim: (id: string) => void;
  onDone: () => void;
}

export function Quests({ views, onClaim, onDone }: Props) {
  const claimable = views.filter((v) => v.claimable).length;
  const doneCount = views.filter((v) => v.claimed).length;

  return (
    <View style={styles.wrapper}>
      <View style={styles.topBar}>
        <View style={styles.titleBox}>
          <Image source={QUEST_ICON} resizeMode="contain" style={styles.titleIcon} />
          <Text style={styles.title}>任務</Text>
          <Text style={styles.subtitle}>
            已完成 {doneCount}/{views.length}
            {claimable > 0 ? ` · ${claimable} 個可領獎` : ''}
          </Text>
        </View>
        {/* ✕ 是純排版符號不是 emoji(見 CLAUDE.md 的圖示鐵則)。 */}
        <Pressable accessibilityLabel="關閉任務" style={styles.closeButton} onPress={onDone}>
          <Text style={styles.closeLabel}>✕</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {views.length === 0 && <Text style={styles.empty}>先跑一趟 1-1,任務就會出現</Text>}
        {/* PixelFrame 的 style 只吃單一個 ViewStyle(不是陣列),所以已領的那層暗色
            要展開合併,不能像其他元件那樣傳陣列進去。 */}
        {views.map((view) => (
          <PixelFrame
            key={view.quest.id}
            style={view.claimed ? { ...styles.card, ...styles.cardDone } : styles.card}
            padding={10}
          >
            {/* 行距靠這一層的 gap:PixelFrame 的 wrapper 裡面還有八張裝飾圖,
                gap 寫在那一層會連裝飾一起排。 */}
            <View style={styles.cardBody}>
            <View style={styles.cardHead}>
              <Text style={[styles.questName, view.claimed && styles.dimText]}>
                {/* ✓ 同上:純排版符號。 */}
                {view.claimed ? '✓ ' : ''}{view.quest.name}
              </Text>
              <View style={styles.rewardBox}>
                <Image source={COIN_ICON} resizeMode="contain" style={styles.coinIcon} />
                <Text style={[styles.rewardText, view.claimed && styles.dimText]}>{view.quest.coins}</Text>
              </View>
            </View>

            {/* 提示才是真正在做引導的那一行:它講的是「去哪裡點」。 */}
            <Text style={[styles.hint, view.claimed && styles.dimText]}>{view.quest.hint}</Text>

            {/* 進度條只在「要做好幾次」的任務上畫。target 是 1 的時候,一條 0% 或 100%
                的長條完全沒有資訊,只是多一行高度。 */}
            {view.quest.target > 1 && !view.claimed && (
              <View style={styles.progressRow}>
                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressFill, { width: `${(view.progress / view.quest.target) * 100}%` }]}
                  />
                </View>
                <Text style={styles.progressText}>{view.progress}/{view.quest.target}</Text>
              </View>
            )}

            {view.claimable && (
              <Pressable
                accessibilityLabel={`領獎 ${view.quest.name}`}
                style={styles.claimButton}
                onPress={() => { playSfx('skill'); onClaim(view.quest.id); }}
              >
                <Text style={styles.claimLabel}>領取 {view.quest.coins} 金幣</Text>
              </Pressable>
            )}
            </View>
          </PixelFrame>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', maxWidth: 520, flex: 1, gap: 8 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleBox: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  titleIcon: { width: 20, height: 20 },
  title: { color: '#e0a95c', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#8a8a95', fontSize: 12 },
  closeButton: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    backgroundColor: '#2a2a35', borderWidth: 1, borderColor: '#3a3448',
  },
  closeLabel: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },

  // flex:1 讓清單吃掉剩下的高度,周邊多一列少一列都不必改數字。
  list: { flex: 1, width: '100%' },
  listContent: { gap: 8, paddingBottom: 12 },
  empty: { color: '#8a8a95', fontSize: 13, textAlign: 'center', paddingVertical: 24 },

  card: { width: '100%' },
  cardBody: { gap: 6 },
  // 已領的整張壓暗但**不隱藏**:它是進度感的一部分。
  cardDone: { opacity: 0.5 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  questName: { color: '#f2f2f2', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  dimText: { color: '#8a8a95' },
  rewardBox: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  coinIcon: { width: 14, height: 14 },
  rewardText: { color: '#e0a95c', fontSize: 13, fontWeight: '600' },
  hint: { color: '#9691a5', fontSize: 12, lineHeight: 16 },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#2a2a35', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#5ec26a' },
  progressText: { color: '#8a8a95', fontSize: 11, minWidth: 44, textAlign: 'right' },

  claimButton: {
    backgroundColor: '#e0a95c', borderRadius: 8, paddingVertical: 8, alignItems: 'center',
  },
  claimLabel: { color: '#16161c', fontSize: 14, fontWeight: '700' },
});
