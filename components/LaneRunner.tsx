import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { gateLabel, LANE_COUNT, ROW_SPACING, runLength, type RunRow } from '../game/laneRun';
import { useLaneRun } from '../hooks/useLaneRun';
import { HERO_ASPECT, HERO_FRAMES, monsterArt } from './artAssets';

// 跑道畫面。角色固定在跑道底部、節點由上往下逼近——這是「角色在跑」最省效能的表現方式:
// 真的移動角色的話背景要跟著捲、視差要對齊,在 RN 上等於自己寫一個 2D 引擎;讓節點往下移
// 視覺上完全等價,而且每個節點只是一個絕對定位的方塊。
//
// 橫向則相反:角色是真的跟著手指走的(見 panResponder),位置連續、不是三格跳。
// 只畫「還沒通過而且離得夠近」的排:遠處的排就算畫出來玩家也看不清楚內容,徒增節點數。
const TRACK_HEIGHT = 400;
const NODE_HEIGHT = 66;
const VISIBLE_AHEAD = ROW_SPACING * 3.2;
const HERO_HEIGHT = 88;
const HERO_WIDTH = Math.round(HERO_HEIGHT * HERO_ASPECT);
const HERO_BOTTOM = 8;
/** 撞擊線:節點抵達這個 y 的時候剛好蓋在角色身上,跟結算的那一刻對齊。 */
const CONTACT_Y = TRACK_HEIGHT - HERO_BOTTOM - HERO_HEIGHT * 0.45;
const CONTACT_TOP = CONTACT_Y - NODE_HEIGHT / 2;
/** 眨眼:三張圖是睜眼→半闔→閉眼,不是三個動作,所以來回播而不是循環播。 */
const BLINK_SEQUENCE = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1];
const BLINK_MS = 160;

interface Props {
  stage: number;
  onCleared: (stage: number) => void;
}

export function LaneRunner({ stage, onCleared }: Props) {
  const run = useLaneRun(stage);
  const { state, distance, heroOffset, upcoming, feedback, steer, dragTo, restart } = run;

  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const offsetRef = useRef(heroOffset);
  offsetRef.current = heroOffset;
  const runningRef = useRef(true);
  runningRef.current = state.phase === 'running';

  // 拖曳用相對位移(按下的那一刻記住角色在哪,之後手指移多少角色就移多少),不是「手指落點 = 角色位置」。
  // 相對位移的好處是可以從畫面任何地方開始拖,不必精準按在角色身上——手機上角色只有 40 px 寬,
  // 要求按準等於逼玩家低頭找角色,而這遊戲的節奏不允許把視線從前方的閘門移開。
  const grabRef = useRef({ offset: 0.5 });
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          grabRef.current = { offset: offsetRef.current };
        },
        onPanResponderMove: (_e, gesture) => {
          if (!runningRef.current) return;
          const width = trackWidthRef.current;
          if (width <= 0) return;
          dragTo(grabRef.current.offset + gesture.dx / width);
        },
      }),
    [dragTo],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') steer('left');
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') steer('right');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steer]);

  const [blinkStep, setBlinkStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setBlinkStep((s) => (s + 1) % BLINK_SEQUENCE.length), BLINK_MS);
    return () => clearInterval(id);
  }, []);

  const hpRatio = state.maxHp > 0 ? Math.max(0, state.hp / state.maxHp) : 0;
  const progress = Math.min(1, distance / runLength());
  const laneWidth = trackWidth / LANE_COUNT;
  const heroLeft = Math.min(
    Math.max(heroOffset * trackWidth - HERO_WIDTH / 2, 2),
    Math.max(2, trackWidth - HERO_WIDTH - 2),
  );
  // 跑起來的上下微晃。用已跑距離當相位,所以跑得越快晃得越快,不必另外開一個計時器。
  const bob = state.phase === 'running' ? Math.round(Math.sin(distance / 7) * 2) : 0;

  function renderRow(row: RunRow) {
    const ahead = row.distance - distance;
    if (ahead > VISIBLE_AHEAD || ahead < -ROW_SPACING * 0.4) return null;
    // ahead 越大越遠 → 畫得越上面。ahead = 0(抵達角色)→ 落在撞擊線上;
    // ahead = VISIBLE_AHEAD(最遠)→ 整排剛好在畫面上緣外,是「冒出來」而不是「憑空出現」。
    const top = CONTACT_TOP - (ahead / VISIBLE_AHEAD) * (CONTACT_TOP + NODE_HEIGHT);
    return (
      <View key={row.index} style={[styles.rowLayer, { top }]} pointerEvents="none">
        {row.nodes.map((node) => {
          if (node.kind === 'enemy' && node.enemy) {
            // 一格塞越多隻,每隻就得畫小一點,不然三隻會擠出跑道外緣。
            const size = node.enemy.units === 1 ? 56 : node.enemy.units === 2 ? 46 : 36;
            return (
              <View key={node.lane} style={styles.enemyCell}>
                <View style={styles.enemySquad}>
                  {Array.from({ length: node.enemy.units }, (_, i) => (
                    <Image
                      key={i}
                      source={monsterArt(node.enemy!.monsterId)}
                      style={[styles.pixelArt, { width: size, height: size }]}
                      resizeMode="contain"
                    />
                  ))}
                </View>
                <Text style={styles.enemyPower} numberOfLines={1}>
                  戰力 {node.enemy.power}
                </Text>
              </View>
            );
          }
          const trap = node.gate ? isTrap(node.gate.op, node.gate.value) : false;
          return (
            <View key={node.lane} style={styles.cell}>
              <View style={[styles.gate, trap ? styles.gateTrap : styles.gateGood]}>
                <Text style={styles.gateText} numberOfLines={2}>
                  {node.gate ? gateLabel(node.gate) : ''}
                </Text>
              </View>
            </View>
          );
        })}
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
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          trackWidthRef.current = w;
          setTrackWidth(w);
        }}
        {...panResponder.panHandlers}
      >
        <View style={styles.laneLines} pointerEvents="none">
          {Array.from({ length: LANE_COUNT }, (_, i) => (
            <View key={i} style={[styles.laneLine, state.lane === i && styles.laneLineActive]} />
          ))}
        </View>

        {/* 往下流動的路面虛線:唯一在告訴玩家「角色正在前進」的東西,拿掉之後畫面會像靜止的。 */}
        <View style={styles.laneLines} pointerEvents="none">
          {Array.from({ length: LANE_COUNT - 1 }, (_, i) =>
            DASH_PHASES.map((phase) => (
              <View
                key={`${i}-${phase}`}
                style={[
                  styles.dash,
                  {
                    left: laneWidth * (i + 1) - 1,
                    top: ((distance * 1.6 + phase) % (TRACK_HEIGHT + DASH_LENGTH)) - DASH_LENGTH,
                  },
                ]}
              />
            )),
          )}
        </View>

        {upcoming.map(renderRow)}

        {/* 角色:橫向位置完全跟著手指(heroOffset),不吸附到跑道中央 */}
        <Image
          source={HERO_FRAMES[BLINK_SEQUENCE[blinkStep]]}
          resizeMode="contain"
          style={[
            styles.hero,
            styles.pixelArt,
            { left: heroLeft, bottom: HERO_BOTTOM + bob, width: HERO_WIDTH, height: HERO_HEIGHT },
          ]}
        />
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
          <Text style={styles.hint}>第 {run.stage} 關 · 拖著勇者左右移動</Text>
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

const DASH_LENGTH = 26;
const DASH_PHASES = [0, 70, 140, 210, 280, 350, 420];

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
  dash: { position: 'absolute', width: 2, height: DASH_LENGTH, borderRadius: 1, backgroundColor: '#46465a' },
  rowLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: NODE_HEIGHT,
    flexDirection: 'row',
    paddingHorizontal: 4,
    gap: 4,
  },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gate: {
    width: '100%',
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 2,
  },
  gateGood: { backgroundColor: '#243a2a', borderColor: '#5ec26a' },
  gateTrap: { backgroundColor: '#3a2323', borderColor: '#e05050' },
  gateText: { color: '#f2f2f2', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  enemyCell: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  enemySquad: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 1 },
  enemyPower: { color: '#e05050', fontSize: 11, fontWeight: '700', marginTop: 1 },
  pixelArt: Platform.OS === 'web' ? ({ imageRendering: 'pixelated' } as object) : {},
  hero: { position: 'absolute' },
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
