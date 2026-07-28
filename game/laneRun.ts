// 跑道闖關核心(純邏輯,禁止 import React)。
//
// 玩法:角色自動往前跑,玩家用手指把角色左右拉著移動。路上會一排一排出現節點——
// 閘門(加成/陷阱)、敵人、金幣——只有「角色當下站的那一格」的節點會生效。
// 核心決策是「下一排我要站哪一格」,在很短的時間內。
//
// 位置是連續的(見下方 clampOffset/laneFromOffset):手指拉到哪角色就在哪,不是三選一的跳格。
// 跑道只在「結算那一瞬間」有意義——腳踩在哪一格,就吃那一格的節點。
//
// 這一版取代了先前的「定點閃避」設計(game/swipeCombat.ts)。兩者都叫左右滑,但體驗完全不同:
//   - 定點閃避:滑動是「反應」,目標是躲開,滑對就沒事
//   - 跑道切換:滑動是「選擇」,目標是挑到更好的那一格,選錯不是受傷而是變弱
// 後者才是短影音廣告裡那種「左邊 x2 還是右邊 +50」的體感,也是使用者要的那一種。
//
// 難度來自兩件事,都不是數值能買掉的:
//   1. 跑速——越後面的關卡跑得越快,看到閘門到抵達的時間越短
//   2. 閘門的好壞差距——後期陷阱更毒,選錯一次就很難補回來

import { pickMonster } from './monsters';
import type { Rarity } from './trigger';

export const LANE_COUNT = 3;
export type Lane = 0 | 1 | 2;

// ---- 角色的橫向位置 ----
// offset 是連續值:0 = 跑道最左緣、1 = 最右緣。玩家是「拉著角色走」,所以中間任何位置都合法,
// 包含騎在兩格交界上;交界的歸屬由 laneFromOffset 決定(往左邊那格算),不會出現無主狀態。
export function clampOffset(offset: number): number {
  if (!Number.isFinite(offset)) return 0.5;
  return Math.min(1, Math.max(0, offset));
}

/** 某條跑道的正中央。按鈕/方向鍵是「移到隔壁跑道中央」,滑動則是任意位置。 */
export function laneCenterOffset(lane: Lane): number {
  return (lane + 0.5) / LANE_COUNT;
}

/** 角色站在 offset 時腳下踩的是哪一格。結算時才呼叫,平常不需要知道。 */
export function laneFromOffset(offset: number): Lane {
  const index = Math.floor(clampOffset(offset) * LANE_COUNT);
  return Math.min(LANE_COUNT - 1, Math.max(0, index)) as Lane;
}

export type NodeKind = 'gate' | 'enemy' | 'coin';

/** 閘門效果。加法給穩定成長,乘法給爆發——兩種混在同一排,玩家才需要真的算一下。 */
export interface GateEffect {
  stat: 'attack' | 'hp';
  op: 'add' | 'mul';
  value: number;
}

export interface EnemyEffect {
  power: number;
  reward: number;
  /** 對應 game/monsters.ts 的 MonsterSpec.id,畫面拿它去抓既有的怪物素材 */
  monsterId: string;
  name: string;
  /** 這一波總共幾隻小怪。戰力是指數成長的,數字看久了會無感,一波湧幾隻才看得出「這波比上一波難」。 */
  units: number;
}

export interface RunNode {
  lane: Lane;
  kind: NodeKind;
  gate?: GateEffect;
  enemy?: EnemyEffect;
  coins?: number;
}

/** 同一個距離上的一整排節點(每條跑道各一個)。 */
export interface RunRow {
  index: number;
  distance: number;
  nodes: RunNode[];
}

export interface RunState {
  /**
   * 結算時腳下踩的那一格。畫面上的實際橫向位置是連續的、存在 hooks/useLaneRun.ts,
   * 這裡只保留「換算成格子」的結果——純邏輯層不需要知道手指拖到哪個像素。
   */
  lane: Lane;
  attack: number;
  hp: number;
  maxHp: number;
  coins: number;
  rowIndex: number;
  phase: 'running' | 'cleared' | 'dead';
}

// ---- 節奏 ----
// 一排到下一排的距離固定,難度靠跑速調。第 1 關 2.2 秒看一排,第 40 關壓到 0.9 秒。
// 0.9 秒是「看清楚三個選項的內容 + 決定 + 滑」的下限,再快就變成瞎猜。
export const ROW_SPACING = 100;
export const SPEED_START = 45; // 單位/秒 → 2.22 秒一排
export const SPEED_MAX = 111; // → 0.90 秒一排
export const SPEED_MAX_STAGE = 40;

export function runSpeed(stage: number): number {
  const t = Math.min(1, Math.max(0, (stage - 1) / (SPEED_MAX_STAGE - 1)));
  return SPEED_START + t * (SPEED_MAX - SPEED_START);
}

export function secondsPerRow(stage: number): number {
  return ROW_SPACING / runSpeed(stage);
}

/** 起跑到第一排之間的緩衝距離。玩家要先看到自己在哪條跑道才會開始想選哪條。 */
export const LEAD_IN_DISTANCE = 140;

/**
 * 玩家一次能看到多遠。這決定「看到 → 決定 → 拉過去」有多少反應時間,是設計數值不是畫面數值,
 * 所以放在這裡跟跑速一起管:改畫面高度不該影響難度,改這個數字才該。
 */
export const VISIBLE_AHEAD = ROW_SPACING * 3.2;

export const ROWS_PER_RUN = 12;
/** 每隔幾排出現一排敵人(敵人排三條跑道都是敵人,一定要正面對上)。 */
export const ENEMY_EVERY = 4;

export function createRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function initialRunState(stage: number): RunState {
  return {
    lane: 1,
    attack: baseAttackForStage(stage),
    hp: baseHpForStage(stage),
    maxHp: baseHpForStage(stage),
    coins: 0,
    rowIndex: 0,
    phase: 'running',
  };
}

// 起始數值只看關卡。玩家的養成(裝備/等級)之後會以「起始攻擊力/血量加成」的形式接進來,
// 但閘門的加成幅度是相對值(百分比與倍率),所以養成不會讓選擇變得無所謂。
export function baseAttackForStage(stage: number): number {
  return 10 + (stage - 1) * 2;
}
export function baseHpForStage(stage: number): number {
  return 100 + (stage - 1) * 10;
}

/**
 * 敵人戰力:設計成「一路都挑好閘門會贏、一路挑爛閘門會輸」。
 * 係數 GOOD_PATH_MARGIN 決定這條線畫在哪——越接近 1 越懲罰失誤。
 */
// 1.7 是掃參數挑的。0.62 時「隨便亂選」也有 89~95% 過關率,左右滑等於沒有意義;
// 一路加到 1.2 才降到 61~81%,曲線很平——因為亂選還是有 1/3 機率吃到 x2 閘門。
// 1.7 時亂選是第 1 關 56%、第 20 關 37%、第 100 關 33%:前期容錯、後期真的要看懂閘門,
// 而「每排都挑最好」在所有關卡仍是 100% 過關(選對就一定過,不靠運氣)。
export const GOOD_PATH_MARGIN = 1.7;

export function enemyPowerForRow(stage: number, rowIndex: number): number {
  const base = baseAttackForStage(stage);
  // 每經過一排敵人,期望玩家已經吃過 ENEMY_EVERY-1 排閘門,攻擊力大約翻一倍多一點。
  const expectedGrowth = Math.pow(1.9, Math.floor(rowIndex / ENEMY_EVERY) + 1);
  return Math.round(base * expectedGrowth * GOOD_PATH_MARGIN);
}

// ---- 產生一場跑圖 ----
// 每一排閘門刻意做成「一好、一普、一陷阱」,而不是三個都正面:三個都正面的話玩家隨便選都在變強,
// 左右滑就失去意義了。陷阱那格用扣除而不是歸零,選錯還有救,但會很痛。
function makeGateRow(rng: () => number, stage: number, rowIndex: number): RunNode[] {
  const tier = Math.floor(rowIndex / ENEMY_EVERY) + 1;
  const good: GateEffect =
    rng() < 0.5
      ? { stat: 'attack', op: 'mul', value: 2 }
      : { stat: 'attack', op: 'add', value: Math.round(baseAttackForStage(stage) * 1.2 * tier) };
  const fair: GateEffect =
    rng() < 0.5
      ? { stat: 'attack', op: 'add', value: Math.round(baseAttackForStage(stage) * 0.5 * tier) }
      : { stat: 'hp', op: 'add', value: Math.round(baseHpForStage(stage) * 0.25) };
  const trap: GateEffect =
    rng() < 0.5
      ? { stat: 'attack', op: 'mul', value: 0.5 }
      : { stat: 'hp', op: 'add', value: -Math.round(baseHpForStage(stage) * 0.3) };

  const effects = [good, fair, trap];
  // 洗牌,讓好格子不會固定出現在同一條跑道
  for (let i = effects.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [effects[i], effects[j]] = [effects[j], effects[i]];
  }
  return effects.map((gate, lane) => ({ lane: lane as Lane, kind: 'gate' as const, gate }));
}

// ---- 敵人波次 ----
// 一波敵人不是「三隻站在那裡等你撞上去」,而是一串小怪從遠處一隻一隻衝過來,勇者同時不斷
// 擲出武器把牠們打掉。打得完打不完由攻擊力決定(waveKillCount),打不完的那幾隻會衝到勇者
// 面前——那正好就是 resolveEnemy 算出來的那筆傷害,只是用「幾隻漏過來」演出來而不是只給數字。
//
// 結算本身沒有變:傷害仍然只在這一排的結算點算一次。小怪的生死是「把那個數字畫出來」,
// 不是另一套獨立的戰鬥判定——兩套判定會各自漂移,最後畫面演的跟實際扣的血對不起來。

/** 一波小怪散布的距離。最後一隻抵達的位置就是這一排的結算點,前面的排在它前方。 */
export const WAVE_LENGTH = 150;
/** 一波幾隻。越後面的波次越多隻,「一直冒出來」的壓迫感就是靠這個。 */
export const MAX_WAVE_SIZE = 9;
export function waveSize(rowIndex: number): number {
  return Math.min(MAX_WAVE_SIZE, 5 + Math.floor(rowIndex / ENEMY_EVERY) * 2);
}

export interface WaveMonster {
  index: number;
  lane: Lane;
  /** 這隻小怪在跑道上的絕對位置(跟 RunRow.distance 同一個座標系) */
  distance: number;
}

// 每隻散到哪一條跑道用雜湊算,不存也不抽:同一排永遠長一樣(重播、驗證都對得起來),
// 又不會出現「整波都在同一條」這種一眼看破的規律。
// 乘數要用 Math.imul(32 位元繞回)並且做一次位移混合,不能只是「兩個大數相加再取餘數」——
// 常數只要含有 LANE_COUNT 的因數,取餘數之後每一隻就會算出同一條跑道,整波擠成一直線。
function laneForWaveMonster(rowIndex: number, index: number): Lane {
  let h = Math.imul(rowIndex + 1, 374761393) ^ Math.imul(index + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % LANE_COUNT) as Lane;
}

export function waveMonsters(rowIndex: number, size: number, rowDistance: number): WaveMonster[] {
  return Array.from({ length: size }, (_, index) => ({
    index,
    lane: laneForWaveMonster(rowIndex, index),
    distance: rowDistance - (WAVE_LENGTH * (size - 1 - index)) / size,
  }));
}

/**
 * 這一波打得掉幾隻。攻擊力壓過戰力就全清,壓不過就照比例清掉一部分——比例跟 resolveEnemy
 * 算傷害的比例是同一條線,所以「漏過來幾隻」跟「扣多少血」永遠是同一件事的兩種說法。
 */
export function waveKillCount(attack: number, power: number, size: number): number {
  if (power <= 0) return size;
  return Math.max(0, Math.min(size, Math.round((attack / power) * size)));
}

/**
 * 一隻小怪要挨幾下才倒。設成 1 的話「打得掉幾隻」就等於「丟幾把武器」,一波只丟個位數次、
 * 中間一直在空等,看起來像沒在打;分成幾下之後同樣的結果會攤成一串連續的投擲。
 * 打掉的總隻數完全沒變(還是 waveKillCount),變的只有演出的密度。
 */
export const HITS_PER_MONSTER = 3;

/** 武器要在小怪撞到勇者之前丟完,所以間隔是「剩下的時間 ÷ 還要丟幾下」,不是固定值。 */
export const MIN_FIRE_INTERVAL_MS = 90;
export const MAX_FIRE_INTERVAL_MS = 360;
export function fireIntervalMs(msUntilLastKill: number, remainingShots: number): number {
  if (remainingShots <= 0) return Number.POSITIVE_INFINITY;
  const spread = msUntilLastKill / remainingShots;
  return Math.min(MAX_FIRE_INTERVAL_MS, Math.max(MIN_FIRE_INTERVAL_MS, spread));
}

/** 越後面的敵人挑越稀有的造型,讓「看起來更兇」跟「戰力更高」對得上。 */
export function enemyRarityForRow(rowIndex: number): Rarity {
  const tier = Math.floor(rowIndex / ENEMY_EVERY) + 1;
  if (tier <= 1) return 'common';
  if (tier === 2) return 'rare';
  if (tier === 3) return 'epic';
  return 'legendary';
}

function makeEnemyRow(rng: () => number, stage: number, rowIndex: number): RunNode[] {
  const power = enemyPowerForRow(stage, rowIndex);
  const monster = pickMonster(enemyRarityForRow(rowIndex), rng);
  const enemy: EnemyEffect = {
    power,
    reward: Math.round(power * 0.4),
    monsterId: monster.id,
    name: monster.name,
    units: waveSize(rowIndex),
  };
  return Array.from({ length: LANE_COUNT }, (_, lane) => ({
    lane: lane as Lane,
    kind: 'enemy' as const,
    enemy,
  }));
}

export function createRun(seed: number, stage: number): RunRow[] {
  const rng = createRng(seed);
  // 挑怪物造型用獨立的亂數流。混用同一條的話,加一次抽選就會把後面所有閘門的內容整個位移,
  // 已經驗證過的過關率(scripts/verify-lane-run.ts)全部要重跑——造型是外觀,不該動到數值。
  const artRng = createRng((seed ^ 0x9e3779b9) >>> 0);
  const rows: RunRow[] = [];
  for (let i = 0; i < ROWS_PER_RUN; i++) {
    const isEnemy = (i + 1) % ENEMY_EVERY === 0;
    rows.push({
      index: i,
      distance: LEAD_IN_DISTANCE + i * ROW_SPACING,
      nodes: isEnemy ? makeEnemyRow(artRng, stage, i) : makeGateRow(rng, stage, i),
    });
  }
  return rows;
}

export function runLength(): number {
  return LEAD_IN_DISTANCE + ROWS_PER_RUN * ROW_SPACING;
}

// ---- 結算 ----
export interface RowResolution {
  state: RunState;
  /** 給畫面用的一句話回饋 */
  message: string;
  hpDelta: number;
  attackDelta: number;
}

export function applyGate(state: RunState, gate: GateEffect): RunState {
  const next = { ...state };
  if (gate.stat === 'attack') {
    next.attack = gate.op === 'mul' ? next.attack * gate.value : next.attack + gate.value;
    // 攻擊力有下限 1:乘 0.5 連吃幾次會趨近 0,之後怎麼打都打不死敵人,那不是懲罰是卡死。
    next.attack = Math.max(1, Math.round(next.attack));
  } else {
    next.maxHp = gate.op === 'mul' ? Math.round(next.maxHp * gate.value) : next.maxHp + gate.value;
    next.maxHp = Math.max(1, next.maxHp);
    next.hp = Math.min(next.maxHp, next.hp + (gate.op === 'mul' ? 0 : gate.value));
    next.hp = Math.max(0, next.hp);
  }
  return next;
}

export function gateLabel(gate: GateEffect): string {
  const stat = gate.stat === 'attack' ? '攻擊' : '血量';
  if (gate.op === 'mul') return `${stat} x${gate.value}`;
  return `${stat} ${gate.value >= 0 ? '+' : ''}${gate.value}`;
}

/** 撞上敵人:攻擊力不足的部分直接換算成傷害。打得贏就零傷害並拿獎勵。 */
export function resolveEnemy(state: RunState, enemy: EnemyEffect): RowResolution {
  const shortfall = Math.max(0, enemy.power - state.attack);
  const next = { ...state };
  if (shortfall === 0) {
    next.coins += enemy.reward;
    return { state: next, message: `擊倒${enemy.name} +${enemy.reward} 金幣`, hpDelta: 0, attackDelta: 0 };
  }
  next.hp = Math.max(0, next.hp - shortfall);
  if (next.hp <= 0) next.phase = 'dead';
  return { state: next, message: `戰力不足 -${shortfall} 血`, hpDelta: -shortfall, attackDelta: 0 };
}

/** 走過一排:只有玩家所在跑道的節點會生效。 */
export function resolveRow(state: RunState, row: RunRow): RowResolution {
  const node = row.nodes.find((n) => n.lane === state.lane);
  const advanced = { ...state, rowIndex: row.index + 1 };

  if (!node) {
    return { state: advanced, message: '', hpDelta: 0, attackDelta: 0 };
  }

  if (node.kind === 'enemy' && node.enemy) {
    const r = resolveEnemy(advanced, node.enemy);
    return { ...r, state: { ...r.state, rowIndex: row.index + 1 } };
  }

  if (node.kind === 'coin' && node.coins) {
    return {
      state: { ...advanced, coins: advanced.coins + node.coins },
      message: `+${node.coins} 金幣`,
      hpDelta: 0,
      attackDelta: 0,
    };
  }

  if (node.kind === 'gate' && node.gate) {
    const after = applyGate(advanced, node.gate);
    if (after.hp <= 0) after.phase = 'dead';
    return {
      state: after,
      message: gateLabel(node.gate),
      hpDelta: after.hp - advanced.hp,
      attackDelta: after.attack - advanced.attack,
    };
  }

  return { state: advanced, message: '', hpDelta: 0, attackDelta: 0 };
}

export function moveLane(lane: Lane, direction: 'left' | 'right'): Lane {
  const next = direction === 'left' ? lane - 1 : lane + 1;
  return Math.min(LANE_COUNT - 1, Math.max(0, next)) as Lane;
}

/** 這一排哪一格最值得選——給驗證腳本與(未來的)新手提示用,不是遊戲內自動幫玩家選。 */
export function bestLane(state: RunState, row: RunRow): Lane {
  let best: Lane = 0;
  let bestScore = -Infinity;
  for (const node of row.nodes) {
    const r = resolveRow({ ...state, lane: node.lane }, row);
    // 攻擊力權重高於血量:血量只讓你活著,攻擊力決定你打不打得贏後面的敵人。
    const score = r.state.attack * 3 + r.state.hp;
    if (score > bestScore) {
      bestScore = score;
      best = node.lane;
    }
  }
  return best;
}

export function worstLane(state: RunState, row: RunRow): Lane {
  let worst: Lane = 0;
  let worstScore = Infinity;
  for (const node of row.nodes) {
    const r = resolveRow({ ...state, lane: node.lane }, row);
    const score = r.state.attack * 3 + r.state.hp;
    if (score < worstScore) {
      worstScore = score;
      worst = node.lane;
    }
  }
  return worst;
}
