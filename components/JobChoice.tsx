import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { jobChoices, jobTitle, type JobTier, type LaneJob } from '../game/laneJobs';
import { jobHeroArt } from './artAssets';

// 轉職畫面。每 5 關出現一次,是這款唯一的養成介面。
//
// 刻意只給「起跑數值」的差異,而且直接把差異寫在選項上(起跑 N 人 · 裝備 N 階 · 血量 xN)——
// 玩家在這裡花的時間是從跑圖時間偷來的,不能讓他還要自己推算哪個比較好。
// 選項不做「推薦」標記:三條路線是取捨不是強弱,標了推薦就等於幫玩家決定,那不如不要選。

const CARD_HEIGHT = 132;

interface Props {
  current: LaneJob;
  tier: JobTier;
  clearedStage: number;
  onChoose: (job: NonNullable<LaneJob>) => void;
}

export function JobChoice({ current, tier, clearedStage, onChoose }: Props) {
  const choices = jobChoices(current, tier);
  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>第 {clearedStage} 關通過 · 轉職</Text>
      <Text style={styles.subtitle}>
        目前 {jobTitle(current)} · 選一條路線走第 {tier} 階
      </Text>
      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {choices.map((choice) => (
          <Pressable
            key={`${choice.job.archetype}-${choice.job.branch}`}
            style={styles.card}
            onPress={() => onChoose(choice.job)}
            accessibilityLabel={`轉職成 ${choice.title}`}
          >
            <Image
              source={jobHeroArt(choice.job.archetype, choice.job.branch, choice.job.tier)}
              resizeMode="contain"
              style={styles.portrait}
            />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={1}>{choice.title}</Text>
              <Text style={styles.cardSummary} numberOfLines={2}>{choice.summary}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', maxWidth: 380, alignSelf: 'center', gap: 8, flex: 1 },
  title: { color: '#e0a95c', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#8a8a95', fontSize: 12, textAlign: 'center' },
  grid: { gap: 8, paddingBottom: 8 },
  card: {
    height: CARD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#2a2a35',
    borderWidth: 1,
    borderColor: '#3a3448',
  },
  portrait: { width: 52, height: CARD_HEIGHT - 16 },
  cardText: { flex: 1, gap: 4 },
  cardTitle: { color: '#f2f2f2', fontSize: 16, fontWeight: '700' },
  cardSummary: { color: '#9691a5', fontSize: 12 },
});
