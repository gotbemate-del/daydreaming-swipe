import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { jobTitle, runStartFor, type LaneJob } from '../game/laneJobs';
import {
  gateLabel,
  laneCenterOffset,
  LANE_COUNT,
  runLength,
  totalAttack,
  VISIBLE_AHEAD,
  type RunRow,
} from '../game/laneRun';
import { useLaneRun, type Projectile, type WaveView } from '../hooks/useLaneRun';
import { HERO_ASPECT, HERO_FRAMES, jobHeroArt, monsterArt, weaponArt } from './artAssets';

// 跑道畫面。角色固定在跑道底部、物件由上往下逼近——這是「角色在跑」最省效能的表現方式:
// 真的移動角色的話背景要跟著捲、視差要對齊,在 RN 上等於自己寫一個 2D 引擎;讓物件往下移
// 視覺上完全等價,而且每個物件只是一個絕對定位的圖。
//
// 橫向則相反:角色是真的跟著手指走的(見 panResponder),位置連續、不是三格跳。
const TRACK_HEIGHT = 500;
const HERO_HEIGHT = 84;
const HERO_WIDTH = Math.round(HERO_HEIGHT * HERO_ASPECT);
const HERO_BOTTOM = 10;
/** 勇者的頭頂。所有物件都是「底邊碰到這條線」的瞬間結算,跟 laneRun 的結算點對齊。 */
const HEAD_Y = TRACK_HEIGHT - HERO_BOTTOM - HERO_HEIGHT;
/** 最高的物件高度。用來確保最遠的物件是從畫面外「冒出來」而不是憑空出現在上緣。 */
const SPAWN_MARGIN = 72;
/**
 * 通過之後還畫多遠才收掉。單位是「距離」不是像素——這兩個值長得像但差 10 倍,
 * 拿像素當門檻的話閘門會在勇者身上多賴一秒才消失,看起來像卡住。
 * 閘門是跑過去的門,越過頭頂之後再滑一小段才收;小怪是撞上來的,碰到頭就該不見。
 */
const GATE_CULL_PAST = 25;
const GATE_HEIGHT = 50;
const MONSTER_SIZE = 42;
const PROJECTILE_SIZE = 30;

/** 眨眼:三張圖是睜眼→半闔→閉眼,不是三個動作,所以來回播而不是循環播。 */
const BLINK_SEQUENCE = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1];
const BLINK_MS = 160;

/**
 * 距離 → 物件底邊的 y。
 * ahead = 0 時底邊剛好落在勇者頭頂:玩家看到「頭碰到東西」的那一格,就是結算發生的那一格。
 * ahead = VISIBLE_AHEAD 時整個物件在畫面上緣之外。
 */
function bottomYFor(ahead: number): number {
  return HEAD_Y - (ahead / VISIBLE_AHEAD) * (HEAD_Y + SPAWN_MARGIN);
}

// 隊形:主角在最前面(畫面最下),其他人往後往兩側散開。畫面上最多畫這幾個,人數再多只加數字——
// 真的畫 64 個人的話一格會被塞滿、看不出跑道,而且每個 tick 要重排 64 個絕對定位的圖。
const SQUAD_SLOTS = [
  { dx: 0, dy: 0 },
  { dx: -20, dy: -13 },
  { dx: 20, dy: -13 },
  { dx: -38, dy: -25 },
  { dx: 38, dy: -25 },
  { dx: -13, dy: -30 },
  { dx: 13, dy: -30 },
];

interface Props {
  stage: number;
  job: LaneJob;
  onCleared: () => void;
  onRetry: () => void;
}

export function LaneRunner({ stage, job, onCleared, onRetry }: Props) {
  const run = useLaneRun(stage, runStartFor(job));
  const { state, distance, heroOffset, upcoming, wave, projectiles, feedback, steer, dragTo } = run;
  const heroArt = jobHeroArt(job?.archetype ?? null, job?.branch ?? 'A', job?.tier ?? 1);
  const attack = totalAttack(state);

  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const offsetRef = useRef(heroOffset);
  offsetRef.current = heroOffset;
  const runningRef = useRef(true);
  runningRef.current = state.phase === 'running';

  // 拖曳用相對位移(按下的那一刻記住角色在哪,之後手指移多少角色就移多少),不是「手指落點 = 角色位置」。
  // 相對位移的好處是可以從畫面任何地方開始拖,不必精準按在角色身上——手機上角色只有 45 px 寬,
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
  // 由後往前畫(slice 之後 reverse),主角才會蓋在隊友上面而不是被壓在後面。
  const drawnSlots = SQUAD_SLOTS.slice(0, Math.min(state.heroes, SQUAD_SLOTS.length)).reverse();
  const incoming = wave ? upcoming.find((r) => r.index === wave.rowIndex)?.nodes[0].enemy : undefined;

  function renderGateRow(row: RunRow) {
    if (row.nodes[0]?.kind === 'enemy') return null; // 敵人排改由 renderWave 演出
    const ahead = row.distance - distance;
    if (ahead > VISIBLE_AHEAD || ahead < -GATE_CULL_PAST) return null;
    return (
      <View key={row.index} style={[styles.rowLayer, { top: bottomYFor(ahead) - GATE_HEIGHT }]} pointerEvents="none">
        {row.nodes.map((node) => {
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

  /** 一波小怪:一隻一隻從遠處衝過來,被打掉的就不再畫,漏過來的會走到勇者頭上。 */
  function renderWave(w: WaveView) {
    if (trackWidth <= 0) return null;
    return w.monsters.map((m) => {
      if (w.down[m.index]) return null;
      const ahead = m.distance - distance;
      if (ahead > VISIBLE_AHEAD || ahead < 0) return null;
      return (
        <Image
          key={m.index}
          source={monsterArt(w.monsterId)}
          resizeMode="contain"
          style={[
            styles.pixelArt,
            styles.floating,
            {
              left: laneCenterOffset(m.lane) * trackWidth - MONSTER_SIZE / 2,
              top: bottomYFor(ahead) - MONSTER_SIZE,
              width: MONSTER_SIZE,
              height: MONSTER_SIZE,
            },
          ]}
        />
      );
    });
  }

  /** 擲出去的武器。從擲出的位置往目標那一格斜著飛過去,所以 x 要跟著飛行進度內插。 */
  function renderProjectile(p: Projectile) {
    if (trackWidth <= 0 || !wave) return null;
    const target = wave.monsters[p.targetIndex];
    if (!target) return null;
    const span = Math.max(1, target.distance - p.fromDistance);
    const t = Math.min(1, Math.max(0, (p.distance - p.fromDistance) / span));
    const offset = p.fromOffset + (p.toOffset - p.fromOffset) * t;
    const ahead = p.distance - distance;
    if (ahead > VISIBLE_AHEAD) return null;
    return (
      <Image
        key={p.id}
        source={weaponArt(job?.archetype ?? null, state.gear)}
        resizeMode="contain"
        style={[
          styles.pixelArt,
          styles.floating,
          {
            left: offset * trackWidth - PROJECTILE_SIZE / 2,
            top: bottomYFor(ahead) - PROJECTILE_SIZE,
            width: PROJECTILE_SIZE,
            height: PROJECTILE_SIZE,
            transform: [{ rotate: '-45deg' }],
          },
        ]}
      />
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.hud}>
        <Text style={styles.hudStat}>勇者 {state.heroes}</Text>
        <Text style={styles.hudStat}>裝備 {state.gear} 階</Text>
        <Text style={styles.hudStat}>戰力 {attack}</Text>
      </View>
      <View style={styles.hud}>
        <Text style={styles.hudSub}>{jobTitle(job)}</Text>
        <Text style={styles.hudSub}>血量 {state.hp}/{state.maxHp}</Text>
        <Text style={styles.hudSub}>金幣 {state.coins}</Text>
      </View>
      <View style={styles.hpTrack}>
        <View style={[styles.hpFill, { width: `${hpRatio * 100}%` }, hpRatio <= 0.25 && styles.hpFillDanger]} />
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      {/* 高度固定佔著,有沒有敵人來都不會讓下面的跑道跳動 */}
      <View style={styles.alertRow}>
        {incoming && (
          <Text style={styles.alertText} numberOfLines={1}>
            來襲 {incoming.name} x{incoming.units} · 戰力 {incoming.power}
          </Text>
        )}
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

        {upcoming.map(renderGateRow)}
        {wave && renderWave(wave)}
        {projectiles.map(renderProjectile)}

        {/* 勇者群:橫向位置完全跟著手指(heroOffset),不吸附到跑道中央。
            由後往前畫,主角才會蓋在隊友上面。 */}
        {drawnSlots.map((slot, i) => (
          <Image
            key={i}
            source={job === null ? HERO_FRAMES[BLINK_SEQUENCE[blinkStep]] : heroArt}
            resizeMode="contain"
            style={[
              styles.hero,
              styles.pixelArt,
              {
                left: heroLeft + slot.dx,
                bottom: HERO_BOTTOM + bob - slot.dy,
                width: HERO_WIDTH,
                height: HERO_HEIGHT,
                zIndex: i + 1,
              },
            ]}
          />
        ))}
        {state.heroes > SQUAD_SLOTS.length && (
          <Text style={[styles.squadCount, { left: heroLeft - 12, bottom: HERO_BOTTOM + HERO_HEIGHT - 6 }]}>
            x{state.heroes}
          </Text>
        )}
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
        <Text style={styles.hint}>第 {stage} 關 · 拖著勇者左右移動</Text>
      ) : (
        <View style={styles.controls}>
          <Text style={state.phase === 'cleared' ? styles.resultWin : styles.resultLose}>
            {state.phase === 'cleared' ? '抵達終點' : '倒下了'}
          </Text>
          <Pressable
            style={styles.againButton}
            onPress={() => (state.phase === 'cleared' ? onCleared() : onRetry())}
          >
            <Text style={styles.againLabel}>{state.phase === 'cleared' ? '下一關' : '再來一次'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const DASH_LENGTH = 26;
const DASH_PHASES = [0, 70, 140, 210, 280, 350, 420, 490];

// 陷阱格用紅色標出來,但只標「乘法變小」與「扣血」這兩種真正的負面效果;
// 加值比較少的那格不算陷阱,那是玩家自己要判斷的取捨。
function isTrap(op: 'add' | 'mul', value: number): boolean {
  return (op === 'mul' && value < 1) || (op === 'add' && value < 0);
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', maxWidth: 380, alignSelf: 'center', gap: 6 },
  hud: { flexDirection: 'row', justifyContent: 'space-between' },
  hudStat: { color: '#f2f2f2', fontSize: 13, fontWeight: '700' },
  hudSub: { color: '#8a8a95', fontSize: 11 },
  squadCount: {
    position: 'absolute',
    color: '#e0a95c',
    fontSize: 15,
    fontWeight: '700',
    zIndex: 20,
  },
  hpTrack: { height: 8, borderRadius: 4, backgroundColor: '#2a2a35', overflow: 'hidden' },
  hpFill: { height: '100%', backgroundColor: '#5ec26a' },
  hpFillDanger: { backgroundColor: '#e05050' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: '#2a2a35', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#e0a95c' },
  alertRow: { height: 16, alignItems: 'center', justifyContent: 'center' },
  alertText: { color: '#e05050', fontSize: 12, fontWeight: '700' },
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
    height: GATE_HEIGHT,
    flexDirection: 'row',
    paddingHorizontal: 4,
    gap: 4,
  },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gate: {
    width: '100%',
    height: GATE_HEIGHT,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 2,
  },
  gateGood: { backgroundColor: '#243a2a', borderColor: '#5ec26a' },
  gateTrap: { backgroundColor: '#3a2323', borderColor: '#e05050' },
  gateText: { color: '#f2f2f2', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  floating: { position: 'absolute' },
  pixelArt: Platform.OS === 'web' ? ({ imageRendering: 'pixelated' } as object) : {},
  hero: { position: 'absolute' },
  feedbackRow: { height: 22, alignItems: 'center', justifyContent: 'center' },
  feedbackText: { fontSize: 14, fontWeight: '700' },
  feedbackGood: { color: '#5ec26a' },
  feedbackBad: { color: '#e05050' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hint: { color: '#8a8a95', fontSize: 11, textAlign: 'center' },
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
