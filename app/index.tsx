import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { JobChoice } from '../components/JobChoice';
import { LaneRunner } from '../components/LaneRunner';
import { isPromotionStage, jobTitle, tierAfter, type JobTier, type LaneJob } from '../game/laneJobs';

// 骨架階段的主畫面:跑圖 → 每 5 關轉職 → 下一關,不做選單。存檔還沒接上——先把「拉著勇者選閘門」
// 這件事做到能實際玩,再談外圍系統。
//
// 一場跑圖 = 一個 LaneRunner 實例,重跑與下一關都靠換 key 重新掛載。跑圖裡有一整套跑到一半的
// 狀態(波次、飛行中的武器、已結算的排、計時起點),在原地 reset 很容易漏掉其中一項,
// 症狀是「上一場的怪出現在這一場」——重新掛載沒有這個問題。
export default function HomeScreen() {
  const [stage, setStage] = useState(1);
  const [runKey, setRunKey] = useState(0);
  const [job, setJob] = useState<LaneJob>(null);
  const [promotionTier, setPromotionTier] = useState<JobTier | null>(null);

  function advance(nextStage: number) {
    setStage(nextStage);
    setRunKey((k) => k + 1);
  }

  if (promotionTier !== null) {
    return (
      <View style={styles.screen}>
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
      <View style={styles.header}>
        <Text style={styles.title}>滑動勇者</Text>
        <Text style={styles.subtitle}>第 {stage} 關 · {jobTitle(job)}</Text>
      </View>
      <LaneRunner
        key={`${stage}-${runKey}`}
        stage={stage}
        job={job}
        onCleared={() => {
          const tier = isPromotionStage(stage) ? tierAfter(stage) : null;
          if (tier !== null) setPromotionTier(tier);
          else advance(stage + 1);
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
    padding: 16,
    gap: 10,
  },
  header: {
    width: '100%',
    maxWidth: 380,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: { color: '#e0a95c', fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#8a8a95', fontSize: 13 },
});
