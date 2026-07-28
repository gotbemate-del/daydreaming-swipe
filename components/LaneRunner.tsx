import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { gateLabel, LANE_COUNT, ROW_SPACING, runLength, type RunRow } from '../game/laneRun';
import { useLaneRun } from '../hooks/useLaneRun';

// 跑道畫面。角色固定在跑道底部,節點由上往下逼近——這是「角色在跑」最省效能的表現方式:
// 真的移動角色的話背景要跟著捲、視差要對齊,在 RN 上等於自己寫一個 2D 引擎;讓節點往下移
// 視覺上完全等價,而且每個節點只是一個絕對定位的方塊。
//
// 只畫「還沒通過而且離得夠近」的排:遠處的排就算畫出來玩家也看不清楚內容,徒增節點數。
const TRACK_HEIGHT = 380;
const NODE_HEIGHT = 54;
const VISIBLE_AHEAD = ROW_SPACING * 3.2;
const SWIPE_THRESHOLD_PX = 28;

interface Props {
  stage: number;
  onCleared: (stage: number) => void;
}

export function LaneRunner({ stage, onCleared }: Props) {
  const run = useLaneRun(stage);
  const { state, distance, upcoming, feedback, steer, restart } = run;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') steer('left');
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') steer('right');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steer]);

  const hpRatio = state.maxHp > 0 ? Math.max(0, state.hp / state.maxHp) : 0;
  const progress = Math.min(1, distance / runLength());

  let touchStartX = 0;

  function renderRow(row: RunRow) {
    const ahead = row.distance - distance;
    if (ahead > VISIBLE_AHEAD || ahead < -ROW_SPACING * 0.4) return null;
    // ahead 越大越遠 → 畫得越上面。0 就落在角色所在的那條線上。
    // ahead = VISIBLE_AHEAD(最遠)→ top 0(畫面最上);ahead = 0(抵達角色)→ top 落在角色那條線上。
    const top = (1 - ahead / VISIBLE_AHEAD) * (TRACK_HEIGHT - NODE_HEIGHT - 52);
    return (
      <View key={row.index} style={[styles.rowLayer, { top }]} pointerEvents="none">
        {row.nodes.map((node) => (
          <View
            key={node.lane}
            style={[
              styles.node,
              node.kind === 'enemy' && styles.nodeEnemy,
              node.kind === 'gate' && node.gate && isTrap(node.gate.op, node.gate.value)
                ? styles.nodeTrap
                : node.kind === 'gate' && styles.nodeGate,
            ]}
          >
            <Text style={styles.nodeText} numberOfLines={2}>
              {node.kind === 'enemy' ? `敵 ${node.enemy?.power}` : node.gate ? gateLabel(node.gate) : ''}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.hud}>
        <Text style={styles.hudStat}>攻擊 {state.attack}</Text>
        <Text style={styles.hudStat}>血量 {state.hp}/{state.maxHp}</Text>
        <Text style={styles.hudStat}>金幣 {state.coins}</Text>
      </View>
      <View style={styles.hpTrack}>
        <View style={[styles.hpFill, { width: `${hpRatio * 100}%` }, hpRatio <= 0.25 && styles.hpFillDanger]} />
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <View
        style={styles.track}
        onStartShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          touchStartX = e.nativeEvent.pageX;
        }}
        onResponderRelease={(e) => {
          const dx = e.nativeEvent.pageX - touchStartX;
          if (Math.abs(dx) >= SWIPE_THRESHOLD_PX) steer(dx < 0 ? 'left' : 'right');
        }}
      >
        <View style={styles.laneLines} pointerEvents="none">
          {Array.from({ length: LANE_COUNT }, (_, i) => (
            <View key={i} style={[styles.laneLine, state.lane === i && styles.laneLineActive]} />
          ))}
        </View>

        {upcoming.map(renderRow)}

        {/* 角色:固定在底部所在跑道 */}
        <View style={[styles.heroRow]} pointerEvents="none">
          {Array.from({ length: LANE_COUNT }, (_, i) => (
            <View key={i} style={styles.heroSlot}>
              {state.lane === i && (
                <View style={styles.hero}>
                  <Text style={styles.heroLabel}>勇</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.feedbackRow}>
        {feedback && feedback.message !== '' && (
          <Text
            key={feedback.key}
            style={[
              styles.feedbackText,
              feedback.hpDelta < 0 || feedback.attackDelta < 0 ? styles.feedbackBad : styles.feedbackGood,
            ]}
          >
            {feedback.message}
          </Text>
        )}
      </View>

      {state.phase === 'running' ? (
        <View style={styles.controls}>
          <Pressable style={styles.steerButton} onPress={() => steer('left')} accessibilityLabel="往左">
            <Text style={styles.steerLabel}>左</Text>
          </Pressable>
          <Text style={styles.hint}>第 {run.stage} 關 · 滑動、按鈕或方向鍵</Text>
          <Pressable style={styles.steerButton} onPress={() => steer('right')} accessibilityLabel="往右">
            <Text style={styles.steerLabel}>右</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.controls}>
          <Text style={state.phase === 'cleared' ? styles.resultWin : styles.resultLose}>
            {state.phase === 'cleared' ? '抵達終點' : '倒下了'}
          </Text>
          <Pressable
            style={styles.againButton}
            onPress={() => {
              if (state.phase === 'cleared') {
                onCleared(run.stage);
                restart(run.stage + 1);
              } else {
                restart(run.stage);
              }
            }}
          >
            <Text style={styles.againLabel}>{state.phase === 'cleared' ? '下一關' : '再來一次'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// 陷阱格用紅色標出來,但只標「乘法變小」與「扣血」這兩種真正的負面效果;
// 加值比較少的那格不算陷阱,那是玩家自己要判斷的取捨。
function isTrap(op: 'add' | 'mul', value: number): boolean {
  return (op === 'mul' && value < 1) || (op === 'add' && value < 0);
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', maxWidth: 380, alignSelf: 'center', gap: 8 },
  hud: { flexDirection: 'row', justifyContent: 'space-between' },
  hudStat: { color: '#f2f2f2', fontSize: 13, fontWeight: '700' },
  hpTrack: { height: 8, borderRadius: 4, backgroundColor: '#2a2a35', overflow: 'hidden' },
  hpFill: { height: '100%', backgroundColor: '#5ec26a' },
  hpFillDanger: { backgroundColor: '#e05050' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: '#2a2a35', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#e0a95c' },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: 12,
    backgroundColor: '#1c1c23',
    borderWidth: 1,
    borderColor: '#3a3a45',
    overflow: 'hidden',
  },
  laneLines: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  laneLine: { flex: 1, borderRightWidth: 1, borderRightColor: '#2a2a35', backgroundColor: '#1c1c23' },
  laneLineActive: { backgroundColor: '#23232e' },
  rowLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: NODE_HEIGHT,
    flexDirection: 'row',
    paddingHorizontal: 4,
    gap: 4,
  },
  node: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 2,
  },
  nodeGate: { backgroundColor: '#243a2a', borderColor: '#5ec26a' },
  nodeTrap: { backgroundColor: '#3a2323', borderColor: '#e05050' },
  nodeEnemy: { backgroundColor: '#3a3448', borderColor: '#9691a5' },
  nodeText: { color: '#f2f2f2', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  heroRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
    height: 44,
    flexDirection: 'row',
    paddingHorizontal: 4,
    gap: 4,
  },
  heroSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e0a95c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: { color: '#16161c', fontSize: 15, fontWeight: '700' },
  feedbackRow: { height: 22, alignItems: 'center', justifyContent: 'center' },
  feedbackText: { fontSize: 14, fontWeight: '700' },
  feedbackGood: { color: '#5ec26a' },
  feedbackBad: { color: '#e05050' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  steerButton: {
    width: 84,
    paddingVertical: 16,
    borderRadius: 10,
    backgroundColor: '#3a3448',
    alignItems: 'center',
  },
  steerLabel: { color: '#f2f2f2', fontSize: 20, fontWeight: '700' },
  hint: { flex: 1, color: '#8a8a95', fontSize: 10, textAlign: 'center' },
  resultWin: { color: '#5ec26a', fontSize: 18, fontWeight: '700' },
  resultLose: { color: '#e05050', fontSize: 18, fontWeight: '700' },
  againButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#e0a95c',
    alignItems: 'center',
  },
  againLabel: { color: '#16161c', fontSize: 15, fontWeight: '700' },
});
