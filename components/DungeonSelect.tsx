import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BOOK_ICON, COIN_ICON, LOCK_ICON, TAB_ICONS } from './artAssets';
import { PixelFrame } from './PixelFrame';
import { playSfx } from '../hooks/useSfx';
import {
  canEnterDungeon, dungeonCost, dungeonSpec, DUNGEON_IDS, isDungeonUnlocked, type DungeonId,
} from '../game/dungeons';
import { stageLabel } from '../game/laneRun';

// 副本選擇。分頁列的「副本」點下去先到這裡,再選要進哪一個。
//
// ## 為什麼中間要多一頁
//
// 原本點「副本」就直接開跑(生存模式)。三種副本之後那樣行不通,而更重要的是:
// 這一頁本身就是**功能導覽**。三張卡片並排,玩家一眼看得到「這裡有三種東西可以拿」,
// 以及還沒開放的那幾個要打到第幾關才開——那是分頁列上一個鎖頭永遠講不清楚的事。
//
// ## 鎖著的也要畫出來
//
// 只畫開放的那幾個,玩家會以為副本只有一種。畫出來並且寫清楚解鎖條件,「還有東西可以追」
// 才成立(這跟主介面的分頁列畫出十個鎖著的功能是同一個理由)。

interface Props {
  /** 玩家目前打到第幾關。決定解鎖狀態,也決定副本要跑哪一關。 */
  stage: number;
  coins: number;
  /** 無限副本的最佳紀錄(波)。0 就不顯示。 */
  bestSurvival: number;
  onEnter: (id: DungeonId) => void;
  onDone: () => void;
}

/** 三個副本各自的圖示。全部取自 assets/sprites/ui(圖示鐵則:不用 emoji)。 */
const ICONS: Record<DungeonId, ReturnType<typeof iconFor>> = {
  endless: iconFor('dungeon'),
  grimoire: BOOK_ICON,
  armory: iconFor('equipment'),
};

function iconFor(tabId: string) {
  return TAB_ICONS.find((t) => t.id === tabId)!.art;
}

export function DungeonSelect({ stage, coins, bestSurvival, onEnter, onDone }: Props) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.topBar}>
        <View style={styles.titleBox}>
          <Text style={styles.title}>副本</Text>
          {/* 三個副本跑的都是**目前進度的那一關**,所以關卡編號要寫在最上面一次講完,
              不必在三張卡片上各寫一遍。 */}
          <Text style={styles.subtitle}>難度跟著進度走 · 目前 {stageLabel(stage)}</Text>
        </View>
        <View style={styles.headRight}>
          <View style={styles.coinBox}>
            <Image source={COIN_ICON} resizeMode="contain" style={styles.coinIcon} />
            <Text style={styles.coinText}>{coins}</Text>
          </View>
          <Pressable accessibilityLabel="關閉副本" style={styles.closeButton} onPress={onDone}>
            <Text style={styles.closeLabel}>✕</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {DUNGEON_IDS.map((id) => {
          const spec = dungeonSpec(id);
          const unlocked = isDungeonUnlocked(id, stage);
          const cost = dungeonCost(id, stage);
          const affordable = canEnterDungeon(id, stage, coins);
          return (
            // padding 要走 PixelFrame 的 prop,不能寫在 style 裡:style 給的是外框那一層,
            // 內容那一層另有自己的 padding(預設 20),兩層會疊起來,卡片高度多一倍。
            <PixelFrame key={id} style={styles.card} padding={10}>
              {/* 行距要靠這一層的 gap:PixelFrame 的 wrapper 裡面除了內容還有八張裝飾圖,
                  gap 寫在那一層會連裝飾一起排,框就散開了。 */}
              <View style={styles.cardBody}>
              <View style={styles.cardHead}>
                <View style={styles.nameBox}>
                  <View style={styles.iconBox}>
                    <Image source={ICONS[id]} resizeMode="contain" style={styles.icon} />
                    {!unlocked && <Image source={LOCK_ICON} resizeMode="contain" style={styles.lock} />}
                  </View>
                  <Text style={[styles.name, !unlocked && styles.dim]}>{spec.name}</Text>
                </View>
                {/* 入場費就寫在卡片上,不要等玩家按下去才說。無限副本免費,所以整個不畫——
                    寫「0 金幣」看起來像一個要付但剛好免費的東西。
                    錢不夠才標紅,而且**只在解鎖之後才判斷**:鎖著的副本標紅價錢會讓
                    玩家以為問題出在錢,但實際上他再有錢也進不去。 */}
                {cost > 0 && (
                  <View style={styles.costBox}>
                    <Image source={COIN_ICON} resizeMode="contain" style={styles.coinIcon} />
                    <Text style={[styles.costText, unlocked && !affordable && styles.costShort]}>{cost}</Text>
                  </View>
                )}
              </View>

              {/* 「這裡產什麼」放在最顯眼的位置——那是玩家選副本的唯一依據。 */}
              <Text style={[styles.reward, !unlocked && styles.dim]}>{spec.reward}</Text>
              <Text style={styles.rule}>{spec.rule}</Text>
              {id === 'endless' && bestSurvival > 0 && (
                <Text style={styles.record}>最佳紀錄 {bestSurvival} 波</Text>
              )}

              {unlocked ? (
                <Pressable
                  accessibilityLabel={`進入 ${spec.name}`}
                  disabled={!affordable}
                  style={affordable ? styles.enterButton : styles.enterButtonOff}
                  onPress={() => { playSfx('click'); onEnter(id); }}
                >
                  <Text style={affordable ? styles.enterLabel : styles.enterLabelOff}>
                    {affordable ? '進入' : '金幣不足'}
                  </Text>
                </Pressable>
              ) : (
                // 解鎖條件寫成「通關第幾關」而不是「等級不足」:玩家看得到自己離它多遠。
                <View style={styles.lockedRow}>
                  <Text style={styles.lockedText}>
                    通關 {stageLabel(spec.unlockStage)} 之後開放
                  </Text>
                </View>
              )}
              </View>
            </PixelFrame>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', maxWidth: 520, flex: 1, gap: 8 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleBox: { flexShrink: 1 },
  title: { color: '#e0a95c', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#8a8a95', fontSize: 11 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coinBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  coinIcon: { width: 14, height: 14 },
  coinText: { color: '#f2f2f2', fontSize: 13, fontWeight: '600' },
  closeButton: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    backgroundColor: '#2a2a35', borderWidth: 1, borderColor: '#3a3448',
  },
  closeLabel: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },

  list: { flex: 1, width: '100%' },
  listContent: { gap: 8, paddingBottom: 12 },

  card: { width: '100%' },
  cardBody: { gap: 5 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  nameBox: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  iconBox: { width: 28, height: 28 },
  icon: { width: 28, height: 28 },
  // 鎖頭壓在圖示右下角,不用 opacity 壓掉——鎖頭本身要看得清楚才讀得出「這是鎖住的」。
  lock: { position: 'absolute', right: -2, bottom: -2, width: 13, height: 13 },
  name: { color: '#f2f2f2', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  dim: { color: '#8a8a95' },
  costBox: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  costText: { color: '#e0a95c', fontSize: 13, fontWeight: '600' },
  // 錢不夠就標紅:玩家要在按下去之前就知道,不是按了才被擋。
  costShort: { color: '#e05050' },

  reward: { color: '#5ec26a', fontSize: 13, fontWeight: '600' },
  rule: { color: '#9691a5', fontSize: 12, lineHeight: 16 },
  record: { color: '#e0a95c', fontSize: 12 },

  enterButton: {
    backgroundColor: '#e0a95c', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 2,
  },
  enterButtonOff: {
    backgroundColor: '#2a2a35', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 2,
    borderWidth: 1, borderColor: '#3a3448',
  },
  enterLabel: { color: '#16161c', fontSize: 14, fontWeight: '700' },
  enterLabelOff: { color: '#8a8a95', fontSize: 13, fontWeight: '600' },

  lockedRow: { paddingVertical: 8, alignItems: 'center' },
  lockedText: { color: '#8a8a95', fontSize: 12 },
});
