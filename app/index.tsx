import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LaneRunner } from '../components/LaneRunner';

// 骨架階段的主畫面:直接進跑圖,不做選單。存檔與養成系統還沒接上——先把「左右滑選閘門」
// 這件事做到能實際玩,再談外圍系統。
export default function HomeScreen() {
  const [stage, setStage] = useState(1);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>滑動勇者</Text>
        <Text style={styles.subtitle}>第 {stage} 關</Text>
      </View>
      <LaneRunner key={stage} stage={stage} onCleared={(cleared) => setStage(cleared + 1)} />
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
    gap: 12,
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
