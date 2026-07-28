import { StyleSheet, Text, View } from 'react-native';

import {
  breathMs,
  COMBO_CAP,
  comboMultiplier,
  PERFECT_DAMAGE_MULTIPLIER,
  reactionWindowMs,
} from '../game/swipeCombat';

// 骨架階段的暫時畫面:只把 game/swipeCombat.ts 的難度曲線印出來,確認資料層真的接得起來、
// GitHub Pages 部署鏈路是通的。滑動手勢層與戰鬥畫面是下一步,會整個取代這一頁。
const PREVIEW_STAGES = [1, 15, 30, 45, 60];

export default function HomeScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>滑動勇者</Text>
      <Text style={styles.subtitle}>骨架建置中 — 數值層已就緒</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>難度曲線(反應窗 / 喘息)</Text>
        {PREVIEW_STAGES.map((stage) => (
          <Text key={stage} style={styles.row}>
            第 {stage} 關 — 反應窗 {reactionWindowMs(stage)}ms、喘息 {breathMs(stage)}ms
          </Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>連段</Text>
        <Text style={styles.row}>
          每段 +5%,{COMBO_CAP} 段封頂 = {comboMultiplier(COMBO_CAP).toFixed(1)} 倍
        </Text>
        <Text style={styles.row}>完美閃避額外 {PERFECT_DAMAGE_MULTIPLIER} 倍</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#16161c',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    color: '#e0a95c',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#8a8a95',
    fontSize: 13,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#22222b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3a45',
    padding: 14,
    gap: 6,
  },
  cardTitle: {
    color: '#f2f2f2',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  row: {
    color: '#9691a5',
    fontSize: 12,
    lineHeight: 18,
  },
});
