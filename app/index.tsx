import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SwipeArena } from '../components/SwipeArena';
import { expectedLevelForStage } from '../game/swipeEncounter';

// 骨架階段的主畫面:直接進戰鬥,不做選單。等級暫時由關卡推導(expectedLevelForStage),
// 存檔與養成系統還沒接上——先把「滑動戰鬥好不好玩」這件事做到能實際玩,再談外圍系統。
export default function HomeScreen() {
  const [stage, setStage] = useState(1);
  const level = expectedLevelForStage(stage);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>滑動勇者</Text>
        <Text style={styles.subtitle}>Lv.{level}</Text>
      </View>
      <SwipeArena
        key={stage}
        stage={stage}
        level={level}
        onCleared={(cleared) => setStage(cleared + 1)}
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
    padding: 18,
    gap: 14,
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
