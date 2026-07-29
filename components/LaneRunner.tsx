import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { jobTitle, type LaneJob } from '../game/laneJobs';
import {
  gateLabel,
  gateSpan,
  GATE_WIDTH,
  LANE_COUNT,
  MISS_MESSAGE,
  runLength,
  terrainForStage,
  totalAttack,
  VISIBLE_AHEAD,
  type RunRow,
  type RunStart,
  type TerrainId,
} from '../game/laneRun';
import { useLaneRun, type Projectile, type WaveView } from '../hooks/useLaneRun';
import { HERO_ASPECT, HERO_FRAMES, jobHeroArt, monsterArt, weaponArt } from './artAssets';

// 跑道畫面。角色固定在跑道底部、物件由上往下逼近——這是「角色在跑」最省效能的表現方式:
// 真的移動角色的話背景要跟著捲、視差要對齊,在 RN 上等於自己寫一個 2D 引擎;讓物件往下移
// 視覺上完全等價,而且每個物件只是一個絕對定位的圖。
//
// 橫向則相反:角色是真的跟著手指走的(見 panResponder),位置連續、不是三格跳。
// 跑道高度**不算、用量的**:跑道是 flex:1,實際多高由 onLayout 回報。
//
// 先前是「視窗高 - 固定的周邊高度」算出來的,結果第一關被壓縮:手機瀏覽器剛載入時網址列還在,
// 視窗矮,算出來的跑道就矮;之後玩家一滑、網址列收起來,視窗變高了,但第一關那個實例不會
// 重新掛載,跑道就一直維持矮的,上方留一大塊沒用到的空白。第二關因為換 key 重新掛載才正常。
// 改成量容器實際高度之後,網址列一收起來 onLayout 就會再觸發,跑道自己撐開——而且以後
// 周邊多一列少一列都不必再手動維護那個常數。
/** 再矮就看不到足夠的前方路況了。低於這個值寧可讓畫面捲動。 */
const TRACK_HEIGHT_MIN = 320;

const HERO_HEIGHT = 84;
const HERO_WIDTH = Math.round(HERO_HEIGHT * HERO_ASPECT);
const HERO_BOTTOM = 10;
/** 最高的物件高度。用來確保最遠的物件是從畫面外「冒出來」而不是憑空出現在上緣。 */
const SPAWN_MARGIN = 72;
/**
 * 物件通過判定線之後還畫多遠才收掉(單位是「距離」不是像素,這兩個值長得像但差 10 倍)。
 *
 * 0 = 碰到判定線就消失。閘門原本會再往下滑一小段才收,想做出「跑過一道門」的感覺,
 * 但實際玩起來是框整個套在勇者身上再慢慢滑走,玩家分不清「到底哪一刻算數」——
 * 已經結算完的框還黏在身上,看起來像還沒吃到、或是會再吃一次。
 * 現在框消失的那一刻 = 結算的那一刻,沒有第二種解讀。
 */
const GATE_CULL_PAST = 0;
const GATE_HEIGHT = 50;
const MONSTER_SIZE = 42;
/** 大魔王畫多大。要一眼看出「這不是小怪」,但不能寬到蓋掉兩條跑道。 */
const BOSS_SIZE = 132;
const PROJECTILE_SIZE = 30;

/** 眨眼:三張圖是睜眼→半闔→閉眼,不是三個動作,所以來回播而不是循環播。 */
const BLINK_SEQUENCE = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1];
const BLINK_MS = 160;

/**
 * 距離 → 物件底邊的 y。
 * ahead = 0 時底邊剛好落在勇者頭頂:玩家看到「頭碰到東西」的那一格,就是結算發生的那一格。
 * ahead = VISIBLE_AHEAD 時整個物件在畫面上緣之外。
 *
 * headY 要傳進來(不能用模組常數),因為跑道高度隨視窗變——但 VISIBLE_AHEAD 是距離單位、
 * 不隨畫面變,所以難度不受影響:矮螢幕只是把同樣的一段路畫得比較密。
 */
function bottomYFor(ahead: number, headY: number): number {
  return headY - (ahead / VISIBLE_AHEAD) * (headY + SPAWN_MARGIN);
}

// 隊形:主角在最前面(畫面最下),其他人往後往兩側散開成一團。人數再多只加數字——
// 真的畫 64 個人的話一格會被塞滿、看不出跑道,而且每個 tick 要重排 64 個絕對定位的圖。
// 後排刻意畫小一點(scale)並且各自用不同的相位晃動,看起來才像一群人在跑而不是貼圖陣列。
const SQUAD_SLOTS = [
  { dx: 0, dy: 0, scale: 1 },
  { dx: -22, dy: -12, scale: 0.94 },
  { dx: 22, dy: -12, scale: 0.94 },
  { dx: -42, dy: -22, scale: 0.88 },
  { dx: 42, dy: -22, scale: 0.88 },
  { dx: -14, dy: -26, scale: 0.86 },
  { dx: 14, dy: -26, scale: 0.86 },
  { dx: -62, dy: -34, scale: 0.8 },
  { dx: 62, dy: -34, scale: 0.8 },
  { dx: -34, dy: -38, scale: 0.78 },
  { dx: 34, dy: -38, scale: 0.78 },
  { dx: 0, dy: -42, scale: 0.76 },
  { dx: -52, dy: -50, scale: 0.72 },
  { dx: 52, dy: -50, scale: 0.72 },
];

// 地面。純視覺,每一關換一種,讓關卡之間不會長得一模一樣。
const TERRAIN_STYLE: Record<TerrainId, { base: string; speck: string; edge: string }> = {
  grass: { base: '#22301f', speck: '#33452b', edge: '#3d4a33' },
  dirt: { base: '#2e2620', speck: '#3d322a', edge: '#4a3c31' },
  asphalt: { base: '#20202a', speck: '#2a2a36', edge: '#46465a' },
  stone: { base: '#262630', speck: '#33333f', edge: '#454554' },
};
// 地面碎點:位置固定(不亂數),整片跟著跑動往下捲。密度夠看得出在前進就好,不必鋪滿。
const SPECKS = Array.from({ length: 26 }, (_, i) => ({
  x: ((i * 37) % 100) / 100,
  phase: (i * 61) % 520,
  size: 3 + (i % 3) * 2,
}));

interface Props {
  stage: number;
  job: LaneJob;
  /** 起跑數值(轉職 + 技能算完的結果)。畫面不自己算養成,由 app 層算好傳進來。 */
  start: RunStart;
  onCleared: () => void;
  onRetry: () => void;
}

export function LaneRunner({ stage, job, start, onCleared, onRetry }: Props) {
  const run = useLaneRun(stage, start);
  const { state, distance, heroOffset, upcoming, wave, projectiles, feedback, steer, dragTo } = run;
  const heroArt = jobHeroArt(job?.archetype ?? null, job?.branch ?? 'A', job?.tier ?? 1);
  const attack = totalAttack(state);

  // 跑道的實際尺寸由 onLayout 回報(寬跟高都是)。高度沒量到之前不畫任何物件,
  // 免得用 0 去算位置、東西全部擠在最上面閃一下。
  const [trackSize, setTrackSize] = useState({ width: 0, height: 0 });
  const trackWidth = trackSize.width;
  const trackHeight = trackSize.height;
  const headY = trackHeight - HERO_BOTTOM - HERO_HEIGHT;
  const ready = trackWidth > 0 && trackHeight > 0;
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
  const terrain = TERRAIN_STYLE[terrainForStage(stage)];
  const incoming = wave ? upcoming.find((r) => r.index === wave.rowIndex)?.nodes[0].enemy : undefined;

  /**
   * 閘門排。每一格不佔滿整條跑道(見 laneRun 的 GATE_WIDTH),左右都留空隙——
   * 沒把勇者拉到框上面就整格漏掉,所以框畫多寬就必須等於判定多寬,不能為了好看畫大一點。
   */
  function renderGateRow(row: RunRow) {
    if (row.nodes[0]?.kind === 'enemy') return null; // 敵人排改由 renderWave 演出
    const ahead = row.distance - distance;
    if (ahead > VISIBLE_AHEAD || ahead < -GATE_CULL_PAST) return null;
    if (!ready) return null;
    const top = bottomYFor(ahead, headY) - GATE_HEIGHT;
    return row.nodes.map((node) => {
      const trap = node.gate ? isTrap(node.gate.op, node.gate.value) : false;
      const span = gateSpan(node.lane);
      return (
        <View
          key={`${row.index}-${node.lane}`}
          pointerEvents="none"
          style={[
            styles.gate,
            trap ? styles.gateTrap : styles.gateGood,
            { left: span.from * trackWidth, width: GATE_WIDTH * trackWidth, top, height: GATE_HEIGHT },
          ]}
        >
          <Text style={styles.gateText} numberOfLines={2}>
            {node.gate ? gateLabel(node.gate) : ''}
          </Text>
        </View>
      );
    });
  }

  /**
   * 一波小怪:一隻一隻從遠處衝過來,被打掉的就不再畫,漏過來的會走到勇者頭上。
   * 每隻的種類與橫向位置都由 laneRun 決定(混幾種怪、各自偏離跑道中心多少),
   * 這裡只負責畫——同一波不同長相、不站成一直線,看起來才像一群怪而不是閱兵。
   */
  function renderWave(w: WaveView) {
    if (!ready) return null;
    const size = w.boss ? BOSS_SIZE : MONSTER_SIZE;
    return w.monsters.map((m) => {
      if (w.down[m.index]) return null;
      const ahead = m.distance - distance;
      if (ahead > VISIBLE_AHEAD || ahead < 0) return null;
      const species = w.species[m.speciesIndex] ?? w.species[0];
      // 魔王固定站在跑道正中央:牠佔滿兩條跑道,躲不掉,也不該讓玩家以為躲得掉。
      const left = (w.boss ? 0.5 : m.offset) * trackWidth - size / 2;
      const top = bottomYFor(ahead, headY) - size;
      const hpLeft = Math.max(0, 1 - w.hitsOn[m.index] / w.hitsPerUnit);
      return (
        <View key={m.index} style={[styles.floating, { left, top, width: size }]} pointerEvents="none">
          <Image source={monsterArt(species.id)} resizeMode="contain" style={[styles.pixelArt, { width: size, height: size }]} />
          {w.boss && (
            <View style={styles.bossHpTrack}>
              <View style={[styles.bossHpFill, { width: `${hpLeft * 100}%` }]} />
            </View>
          )}
        </View>
      );
    });
  }

  /** 擲出去的武器。從擲出的位置往目標那一格斜著飛過去,所以 x 要跟著飛行進度內插。 */
  function renderProjectile(p: Projectile) {
    if (!ready || !wave) return null;
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
        source={weaponArt(job?.archetype ?? null, state.gear, p.id)}
        resizeMode="contain"
        style={[
          styles.pixelArt,
          styles.floating,
          {
            left: offset * trackWidth - PROJECTILE_SIZE / 2,
            top: bottomYFor(ahead, headY) - PROJECTILE_SIZE,
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
            {incoming.boss
              ? `大魔王 ${incoming.name} · 戰力 ${incoming.power}`
              : `來襲 ${incoming.name} x${incoming.units} · 戰力 ${incoming.power}`}
          </Text>
        )}
      </View>

      <View
        // 測試要抓跑道就用這個,不要靠「高度剛好是 500」之類的特徵去猜——那種選取器
        // 一改版面就失效,而且會靜靜地選到外層容器,量出一堆看起來合理但錯誤的數字。
        testID="lane-track"
        style={[styles.track, { backgroundColor: terrain.base }]}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          trackWidthRef.current = width;
          setTrackSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
        }}
        {...panResponder.panHandlers}
      >
        <View style={styles.laneLines} pointerEvents="none">
          {Array.from({ length: LANE_COUNT }, (_, i) => (
            <View
              key={i}
              style={[styles.laneLine, { borderRightColor: terrain.edge }, state.lane === i && styles.laneLineActive]}
            />
          ))}
        </View>

        {/* 判定線:所有物件的底邊碰到這條線就結算。畫出來玩家才知道要把勇者拉到哪裡去接,
            而且它是畫面上唯一靜止的東西——動的是物件,不是線。 */}
        <View style={[styles.contactLine, { top: headY }]} pointerEvents="none" />

        {/* 地面碎點:草皮的草叢、土地的石礫、柏油路的補丁。跟著跑動往下捲,是「地面在動」的主要線索。 */}
        <View style={styles.laneLines} pointerEvents="none">
          {SPECKS.map((sp, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: sp.x * trackWidth,
                top: ((distance * 1.6 + sp.phase) % (trackHeight + 40)) - 40,
                width: sp.size,
                height: Math.max(2, Math.round(sp.size * 0.6)),
                borderRadius: 1,
                backgroundColor: terrain.speck,
              }}
            />
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
                    backgroundColor: terrain.edge,
                    left: laneWidth * (i + 1) - 1,
                    top: ((distance * 1.6 + phase) % (trackHeight + DASH_LENGTH)) - DASH_LENGTH,
                  },
                ]}
              />
            )),
          )}
        </View>

        {upcoming.map(renderGateRow)}
        {wave && renderWave(wave)}
        {projectiles.map(renderProjectile)}

        {/* 結算回饋:直接浮在判定線上、勇者正上方。放在跑道外面的話,玩家要在「框消失」與
            「畫面下方跳出一行字」之間自己連連看;放在事發地點就不用連。 */}
        {feedback && feedback.message !== '' && ready && (
          <Text
            key={feedback.key}
            pointerEvents="none"
            style={[
              styles.feedbackFloat,
              {
                top: headY - 24,
                left: Math.min(Math.max(heroLeft + HERO_WIDTH / 2 - 70, 2), Math.max(2, trackWidth - 142)),
              },
              feedback.message === MISS_MESSAGE
                ? styles.feedbackMiss
                : feedback.hpDelta < 0 || feedback.attackDelta < 0
                  ? styles.feedbackBad
                  : styles.feedbackGood,
            ]}
          >
            {feedback.message}
          </Text>
        )}

        {/* 結果 toast:浮在跑道上,不佔版面高度。
            先前是畫面最下面獨立的一列,在矮螢幕會被切到畫面外,玩家按不到「下一關」就卡死。
            浮起來之後不管螢幕多矮都一定看得到,跑道也多拿回那一列的高度。 */}
        {state.phase !== 'running' && (
          <View style={styles.resultOverlay}>
            <View style={styles.resultCard}>
              <Text style={state.phase === 'cleared' ? styles.resultWin : styles.resultLose}>
                {state.phase === 'cleared' ? '抵達終點' : '倒下了'}
              </Text>
              <Text style={styles.resultSummary}>
                第 {stage} 關 · 勇者 {state.heroes} · 戰力 {attack} · 金幣 {state.coins}
              </Text>
              <Pressable
                style={styles.againButton}
                accessibilityLabel={state.phase === 'cleared' ? '下一關' : '再來一次'}
                onPress={() => (state.phase === 'cleared' ? onCleared() : onRetry())}
              >
                <Text style={styles.againLabel}>{state.phase === 'cleared' ? '下一關' : '再來一次'}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* 勇者群:橫向位置完全跟著手指(heroOffset),不吸附到跑道中央。
            由後往前畫,主角才會蓋在隊友上面。 */}
        {drawnSlots.map((slot, i) => {
          // 每個人用不同的相位晃動,整團才像各自在跑;同相位的話會像同一張圖被複製。
          const phase = distance / 7 + i * 1.7;
          const wanderX = Math.round(Math.sin(phase * 0.9) * 3);
          const wanderY = Math.round(Math.sin(phase) * 2);
          return (
            <Image
              key={i}
              source={job === null ? HERO_FRAMES[BLINK_SEQUENCE[blinkStep]] : heroArt}
              resizeMode="contain"
              style={[
                styles.hero,
                styles.pixelArt,
                {
                  left: heroLeft + slot.dx + wanderX,
                  bottom: HERO_BOTTOM + bob - slot.dy + wanderY,
                  width: Math.round(HERO_WIDTH * slot.scale),
                  height: Math.round(HERO_HEIGHT * slot.scale),
                  zIndex: i + 1,
                },
              ]}
            />
          );
        })}
        {state.heroes > SQUAD_SLOTS.length && (
          <Text style={[styles.squadCount, { left: heroLeft - 12, bottom: HERO_BOTTOM + HERO_HEIGHT - 6 }]}>
            x{state.heroes}
          </Text>
        )}
      </View>

      <Text style={styles.hint}>第 {stage} 關 · 拖著勇者左右移動</Text>
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
  // 寬度盡量吃滿。上限 520 是給桌機用的——再寬跑道會變成一片空地,兩條跑道之間離太遠,
  // 手指要移動的距離也跟著變長。
  // flex:1 讓跑道吃掉所有剩下的高度——周邊要多一列少一列都不必再改任何數字。
  wrapper: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', gap: 6 },
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
    flex: 1,
    minHeight: TRACK_HEIGHT_MIN,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3a45',
    overflow: 'hidden',
  },
  laneLines: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  laneLine: { flex: 1, borderRightWidth: 1 },
  laneLineActive: { backgroundColor: '#ffffff10' },
  dash: { position: 'absolute', width: 2, height: DASH_LENGTH, borderRadius: 1, backgroundColor: '#46465a' },
  gate: {
    position: 'absolute',
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
  bossHpTrack: {
    height: 6,
    borderRadius: 3,
    marginTop: 2,
    backgroundColor: '#2a2a35',
    borderWidth: 1,
    borderColor: '#e05050',
    overflow: 'hidden',
  },
  bossHpFill: { height: '100%', backgroundColor: '#e05050' },
  pixelArt: Platform.OS === 'web' ? ({ imageRendering: 'pixelated' } as object) : {},
  hero: { position: 'absolute' },
  contactLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#f2f2f230',
  },
  feedbackFloat: {
    position: 'absolute',
    width: 140,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    zIndex: 30,
  },
  feedbackGood: { color: '#5ec26a' },
  feedbackMiss: { color: '#8a8a95' },
  feedbackBad: { color: '#e05050' },
  resultOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // 壓在跑道上面,但不要整片黑:底下還在跑的畫面是「你剛剛打到哪裡」的資訊。
    backgroundColor: '#16161cb0',
    zIndex: 50,
  },
  resultCard: {
    minWidth: 240,
    maxWidth: '86%',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 14,
    backgroundColor: '#2a2a35',
    borderWidth: 1,
    borderColor: '#3a3448',
    alignItems: 'center',
    gap: 10,
  },
  resultSummary: { color: '#8a8a95', fontSize: 12 },
  hint: { color: '#8a8a95', fontSize: 11, textAlign: 'center' },
  resultWin: { color: '#5ec26a', fontSize: 18, fontWeight: '700' },
  resultLose: { color: '#e05050', fontSize: 18, fontWeight: '700' },
  againButton: {
    alignSelf: 'stretch',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: '#e0a95c',
    alignItems: 'center',
  },
  againLabel: { color: '#16161c', fontSize: 15, fontWeight: '700' },
});
