import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AdSlot } from '../components/AdSlot';
import { JobChoice } from '../components/JobChoice';
import { LaneRunner } from '../components/LaneRunner';
import { SkillChoice } from '../components/SkillChoice';
import { isPromotionStage, jobTitle, runStartFor, tierAfter, type JobTier, type LaneJob } from '../game/laneJobs';
import { applySkills, learnSkill, skillOffers, type SkillState } from '../game/laneSkills';

// 骨架階段的主畫面。一關的流程:
//   跑圖 →(通關)→ 學技能 → 每 5 關再多一次轉職 → 下一關
// 技能每關都有、轉職 5 關一次,所以第 5/10/15… 關會連續出現兩個選擇畫面,先技能後轉職。
// 存檔還沒接上——這些選擇目前只活在記憶體裡,重新整理就沒了。
//
// 一場跑圖 = 一個 LaneRunner 實例,重跑與下一關都靠換 key 重新掛載。跑圖裡有一整套跑到一半的
// 狀態(波次、飛行中的武器、已結算的排、計時起點),在原地 reset 很容易漏掉其中一項,
// 症狀是「上一場的怪出現在這一場」——重新掛載沒有這個問題。
export default function HomeScreen() {
  const [stage, setStage] = useState(1);
  const [runKey, setRunKey] = useState(0);
  const [job, setJob] = useState<LaneJob>(null);
  const [skills, setSkills] = useState<SkillState[]>([]);
  const [promotionTier, setPromotionTier] = useState<JobTier | null>(null);
  const [offers, setOffers] = useState<SkillState[]>([]);

  function advance(nextStage: number) {
    setStage(nextStage);
    setRunKey((k) => k + 1);
  }

  /** 技能選完之後:該轉職就轉職,不然直接下一關。 */
  function afterSkill(nextSkills: SkillState[]) {
    setSkills(nextSkills);
    setOffers([]);
    const tier = isPromotionStage(stage) ? tierAfter(stage) : null;
    if (tier !== null) setPromotionTier(tier);
    else advance(stage + 1);
  }

  if (offers.length > 0) {
    return (
      <View style={styles.screen}>
        <AdSlot />
        <SkillChoice
          clearedStage={stage}
          skills={skills}
          offers={offers}
          onChoose={(choice) => afterSkill(learnSkill(skills, choice))}
        />
      </View>
    );
  }

  if (promotionTier !== null) {
    return (
      <View style={styles.screen}>
        <AdSlot />
        <JobChoice
          current={job}
          tier={promotionTier}
          clearedStage={stage}
          onChoose={(chosen) => {
            setJob(chosen);
            setPromotionTier(null);
            advance(stage + 1);
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* 廣告在最上面、跟跑道之間留安全距離,見 components/AdSlot.tsx 的說明 */}
      <AdSlot />
      <View style={styles.header}>
        <Text style={styles.title}>滑動勇者</Text>
        <Text style={styles.subtitle}>第 {stage} 關 · {jobTitle(job)}</Text>
      </View>
      <LaneRunner
        key={`${stage}-${runKey}`}
        stage={stage}
        job={job}
        start={applySkills(runStartFor(job), skills)}
        onCleared={() => {
          // 技能全滿之後就沒東西可選,直接跳過這個畫面,不要卡一個空頁面。
          const next = skillOffers(skills);
          if (next.length > 0) setOffers(next);
          else afterSkill(skills);
        }}
        onRetry={() => setRunKey((k) => k + 1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#16161c',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 12,
    gap: 10,
  },
  header: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: { color: '#e0a95c', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#8a8a95', fontSize: 13 },
});
