import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  describeSkill, MAX_SKILL_LEVEL, MAX_SKILL_SLOTS, skillLevel, skillSpec, type SkillState,
} from '../game/laneSkills';
import { stageLabel } from '../game/laneRun';
import { playSfx } from '../hooks/useSfx';

// 通關之後的技能選擇。每關一次,所以要能「看一眼就選」——
// 卡片只放三件事:名字、這一級加什麼、目前幾級。不放技能樹、不放說明文,那些會打斷跑圖的節奏。
//
// 等級用小方塊畫出來(亮的是已有的、暗的是還沒點的),不用文字「3/5」也不用 emoji:
// 一排方塊在餘光裡就看得懂,數字要讀。

interface Props {
  clearedStage: number;
  skills: SkillState[];
  offers: SkillState[];
  onChoose: (choice: SkillState) => void;
}

export function SkillChoice({ clearedStage, skills, offers, onChoose }: Props) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>{stageLabel(clearedStage)} 通過 · 學技能</Text>
      <Text style={styles.subtitle}>
        最多帶 {MAX_SKILL_SLOTS} 組,每組最高 {MAX_SKILL_LEVEL} 級 · 目前帶了 {skills.length} 組
      </Text>
      {/* 這一行是必要的:沒有它玩家會以為通關後就該直接進下一關,坐在這裡等,以為卡住了。 */}
      <Text style={styles.cta}>選一個繼續下一關</Text>
      <View style={styles.list}>
        {offers.map((offer) => {
          const spec = skillSpec(offer.id);
          const current = skillLevel(skills, offer.id);
          return (
            <Pressable
              key={offer.id}
              style={styles.card}
              onPress={() => { playSfx('skill'); onChoose(offer); }}
              accessibilityLabel={`學習 ${spec.name} 第 ${offer.level} 級`}
            >
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>{spec.name}</Text>
                <Text style={styles.cardTag}>{current === 0 ? '新技能' : `${current} 級 → ${offer.level} 級`}</Text>
              </View>
              <Text style={styles.cardBody}>{describeSkill(offer)}</Text>
              <View style={styles.pips}>
                {Array.from({ length: MAX_SKILL_LEVEL }, (_, i) => (
                  <View key={i} style={[styles.pip, i < offer.level && styles.pipOn]} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
      {skills.length > 0 && (
        <Text style={styles.owned}>
          已帶:{skills.map((s) => `${skillSpec(s.id).name} ${s.level}`).join(' · ')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 10 },
  title: { color: '#e0a95c', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#8a8a95', fontSize: 12, textAlign: 'center' },
  cta: { color: '#e0a95c', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  list: { gap: 10 },
  card: {
    borderRadius: 12,
    padding: 14,
    gap: 8,
    backgroundColor: '#2a2a35',
    borderWidth: 1,
    borderColor: '#3a3448',
  },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  cardTitle: { color: '#f2f2f2', fontSize: 17, fontWeight: '700' },
  cardTag: { color: '#9691a5', fontSize: 12 },
  cardBody: { color: '#f2f2f2', fontSize: 13 },
  pips: { flexDirection: 'row', gap: 4 },
  pip: { width: 26, height: 6, borderRadius: 3, backgroundColor: '#3a3448' },
  pipOn: { backgroundColor: '#e0a95c' },
  owned: { color: '#8a8a95', fontSize: 11, textAlign: 'center' },
});
