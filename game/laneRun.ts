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

import { FINAL_BOSS_MONSTER, getStageBossMonster, pickMonster } from './monsters';
import type { JobTier } from './combat';
import type { Rarity } from './trigger';

// 兩條跑道。三條的時候「中間」是個安全的預設位置,玩家不動也常常沒事;兩條沒有中立選項,
// 每一排都是二選一,一定要表態——這才是短影音廣告裡那種節奏。
export const LANE_COUNT = 2;
export type Lane = 0 | 1;

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

// ---- 閘門的寬度 ----
// 閘門不佔滿整條跑道:跑道寬 1/LANE_COUNT = 0.5,閘門只佔 GATE_WIDTH,左右各留一段空隙。
// 沒對準就整格漏掉——好處沒吃到,陷阱也沒踩到。這是刺激感的來源:光是「站對邊」還不夠,
// 手指得真的把勇者拉到那一格上面。
export const GATE_WIDTH = 0.34;

export function gateSpan(lane: Lane): { from: number; to: number } {
  const center = laneCenterOffset(lane);
  return { from: center - GATE_WIDTH / 2, to: center + GATE_WIDTH / 2 };
}

/** 勇者站在 offset 時有沒有真的踩到這一格的閘門。 */
export function hitsGate(offset: number, lane: Lane): boolean {
  const { from, to } = gateSpan(lane);
  const at = clampOffset(offset);
  return at >= from && at <= to;
}

export type NodeKind = 'gate' | 'enemy' | 'coin';

/**
 * 閘門效果。三種資源各有各的手感,混在一起玩家才需要真的比較:
 *   heroes 勇者人數——乘法成長最快,是畫面上最爽的那一種(一排變兩排)
 *   gear   裝備等級——每升一級全隊每個人都變強,乘上人數之後才是總戰力
 *   hp     血量——只讓你活著,不會讓你打得動
 * 加法給穩定成長、乘法給爆發,兩種混在同一排,玩家才需要真的算一下。
 */
export interface GateEffect {
  stat: 'heroes' | 'gear' | 'hp';
  op: 'add' | 'mul';
  value: number;
}

export interface WaveSpecies {
  /** 對應 game/monsters.ts 的 MonsterSpec.id,畫面拿它去抓既有的怪物素材 */
  id: string;
  name: string;
}

export interface EnemyEffect {
  power: number;
  reward: number;
  /** 大魔王排:一隻巨大的,不是一群小怪。畫面要畫大、要多打幾下才倒。 */
  boss?: boolean;
  /** 一隻要挨幾下才倒。不給就用 HITS_PER_MONSTER;大魔王要拖長,不然一擊就結束。 */
  hitsPerUnit?: number;
  /**
   * 這一波有哪幾種怪。一波只有一種的話,整關看起來就像同一隻複製貼上;混幾種進來,
   * 每一波的長相才不一樣。種類只影響外觀,戰力是整波共用一個數字。
   */
  species: WaveSpecies[];
  /** 給提示列用的代表名(species 的第一種)。 */
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
  /** 場上的勇者人數。閘門 x2 加的是這個——畫面上真的會多出一排人。 */
  heroes: number;
  /** 每名勇者的攻擊力。換裝備加的是這個,乘上人數才是總戰力。 */
  perHero: number;
  /** 裝備等級。只決定「拿哪一把武器」的外觀與升降級的落點,傷害本身看 perHero。 */
  gear: number;
  hp: number;
  maxHp: number;
  coins: number;
  rowIndex: number;
  phase: 'running' | 'cleared' | 'dead';
}

/**
 * 總戰力 = 人數 x 每人攻擊力。這是唯一拿去跟敵人比的數字。
 * 兩個乘數缺一不可:只堆人數沒換裝備,人再多也打不動後面的怪;只換裝備沒堆人數,
 * 一個人再強也擋不住一整波。玩家每一排都在決定要補哪一邊。
 */
export function totalAttack(state: Pick<RunState, 'heroes' | 'perHero'>): number {
  return Math.max(1, Math.round(state.heroes * state.perHero));
}

/**
 * 起跑數值。轉職之後由 game/laneJobs.ts 換算出來,是養成唯一能影響跑圖的地方。
 *
 * attackMultiplier 乘的是**總戰力**,不是每個人的攻擊力——heroes 與 gear 只決定這份總戰力
 * 怎麼分配(幾個人、拿第幾階武器),不會讓它變多。這條界線是整個養成系統的安全帶:
 * 讓人數與裝備各自再乘上去的話,滿階職業起跑就有 7 倍多,實測第 25 關「亂選」的過關率會從
 * 38% 衝到 85%——那就是養成買到了勝利,這款存在的意義也就沒了(見 CLAUDE.md 的鐵則)。
 */
export interface RunStart {
  /** 起跑幾個人。只影響總戰力怎麼拆,不影響總戰力多少。 */
  heroes: number;
  /** 起跑拿第幾階武器。決定外觀,以及之後吃到裝備閘門時的落點。 */
  gear: number;
  /** 總戰力倍率。這是轉職唯一真正加強的地方,幅度要小。 */
  attackMultiplier: number;
  hpMultiplier: number;
}

export const DEFAULT_RUN_START: RunStart = { heroes: 1, gear: 1, attackMultiplier: 1, hpMultiplier: 1 };

/** 起跑位置:跑道正中央。兩條跑道沒有「中立格」,站中間只是還沒表態,第一排之前一定要選邊。 */
export const START_OFFSET = 0.5;

/** 換一級裝備等於每個人的攻擊力乘/除這個數。 */
export const GEAR_STEP = 1.6;
export const MAX_GEAR = 5;

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

// ---- 地形 ----
// 每一關換一種地面。純粹是視覺,不影響任何數值——但少了它整條跑道就是一塊深色底,
// 玩家沒有「我在往前跑」以外的任何場景感,關卡之間也長得一模一樣。
export type TerrainId = 'grass' | 'dirt' | 'asphalt' | 'stone';
export const TERRAINS: TerrainId[] = ['grass', 'dirt', 'asphalt', 'stone'];
export function terrainForStage(stage: number): TerrainId {
  const index = Math.max(0, Math.floor((stage - 1) / 2)) % TERRAINS.length;
  return TERRAINS[index];
}

// ---- 大魔王 ----
// 每 10 關一場。放在整場跑圖的最後一排,所以前面的閘門怎麼選,到這裡一次結算。
// 造型沿用姊妹作的 STAGE_BOSS_MONSTERS(依階級 5 款)與 FINAL_BOSS_MONSTER。
export const BOSS_EVERY = 10;
/** 大魔王比同一排的一般波次強多少。太高會變成「沒滿裝就是死」,太低則感覺不出是魔王。 */
export const BOSS_POWER_MULTIPLIER = 1.45;
/** 大魔王要挨幾下才倒。一擊就倒的話沒有「打魔王」的過程。 */
export const BOSS_HITS = 12;

export function isBossStage(stage: number): boolean {
  return stage > 0 && stage % BOSS_EVERY === 0;
}

/** 第幾場魔王(1、2、3…),用來挑造型。 */
export function bossIndexForStage(stage: number): number {
  return Math.floor(stage / BOSS_EVERY);
}

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

export function initialRunState(stage: number, start: RunStart = DEFAULT_RUN_START): RunState {
  const hp = Math.round(baseHpForStage(stage) * start.hpMultiplier);
  return {
    lane: laneFromOffset(START_OFFSET),
    heroes: start.heroes,
    // 總戰力 = base x 倍率,再除以人數攤到每個人身上——所以起跑幾個人不會讓總戰力變多。
    perHero: Math.max(1, Math.round((baseAttackForStage(stage) * start.attackMultiplier) / start.heroes)),
    gear: start.gear,
    hp,
    maxHp: hp,
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
// 1.5 是掃參數挑的,而且是「兩條跑道」重掃過的值(三條跑道時是 1.7)。
// 跑道從三條減成兩條之後亂選的命中率從 1/3 變成 1/2,曲線整個往上平移,所以係數要跟著往下修:
// 1.7 時亂選只剩第 20 關 25%、第 100 關 21%,貼著「選擇有意義」的下限,再飄一點就變成
// 「亂選幾乎必死」——那不是難度是勸退。1.6 是 30%/24%,1.4 是 45%/35%(太寬鬆)。
// 1.5 時亂選是第 1 關 59%、第 20 關 35%、第 100 關 29%:前期容錯、後期真的要看懂閘門,
// 而「每排都挑最好」在所有關卡仍是 100% 過關(選對就一定過,不靠運氣)。
export const GOOD_PATH_MARGIN = 1.2;

export function enemyPowerForRow(stage: number, rowIndex: number): number {
  const base = baseAttackForStage(stage);
  // 每經過一排敵人,期望玩家已經吃過 ENEMY_EVERY-1 排閘門,攻擊力大約翻一倍多一點。
  const expectedGrowth = Math.pow(1.9, Math.floor(rowIndex / ENEMY_EVERY) + 1);
  return Math.round(base * expectedGrowth * GOOD_PATH_MARGIN);
}

// ---- 產生一場跑圖 ----
// 兩條跑道就是二選一,所以每一排固定「一好一壞」:兩格都正面的話玩家隨便選都在變強,
// 左右滑就失去意義了。陷阱那格用扣除而不是歸零,選錯還有救,但會很痛。
//
// 好的那格二選一,兩種都直接影響戰力,玩家要比的是「這排我缺人還是缺裝備」:
//   勇者 x2   —— 爆發,人數翻倍
//   裝備強化  —— 全隊每個人都變強,人越多越划算
//
// 曾經放過另外兩種好格,都拿掉了,理由記在這裡免得又被加回來:
//   勇者 +N —— 價值是 N x 每人攻擊力。轉職成「人多但每人較弱」的路線之後同一格收益縮水
//              好幾倍,變成「滿階職業反而比未轉職難過」。閘門好壞不該取決於玩家怎麼轉職。
//   血量 +N —— 不加戰力,吃了也打不動下一波,實際上是「這排跳過」。二選一的節奏下,
//              一個不影響戰力的選項等於沒得選。血量只留在陷阱那側(扣血)。
function makeGateRow(rng: () => number, stage: number, rowIndex: number): RunNode[] {
  const tier = Math.floor(rowIndex / ENEMY_EVERY) + 1;
  const good: GateEffect =
    rng() < 0.45
      ? { stat: 'heroes', op: 'mul', value: 2 }
      : { stat: 'gear', op: 'add', value: 1 };
  const badRoll = rng();
  const bad: GateEffect =
    badRoll < 0.45
      ? { stat: 'heroes', op: 'mul', value: 0.5 }
      : badRoll < 0.75
        ? { stat: 'gear', op: 'add', value: -1 }
        : { stat: 'hp', op: 'add', value: -Math.round(baseHpForStage(stage) * 0.3) };

  const effects = rng() < 0.5 ? [good, bad] : [bad, good];
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
  /** 橫向位置(0~1)。刻意不是跑道正中央——整波站成一直線看起來像閱兵,不像一群怪衝過來。 */
  offset: number;
  /** 這一隻長什麼樣:EnemyEffect.species 的索引 */
  speciesIndex: number;
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

/** 小怪可以偏離跑道中心多遠(offset 單位)。太大會跑到隔壁跑道上,看起來像站錯格。 */
export const MONSTER_JITTER = 0.11;

// 同一個雜湊源再取不同的位元,拿來決定抖動量與怪種——不另外開亂數,重播才對得起來。
function hashFor(rowIndex: number, index: number, salt: number): number {
  let h = Math.imul(rowIndex + 1, 374761393) ^ Math.imul(index + 1, 668265263) ^ Math.imul(salt + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

export function waveMonsters(rowIndex: number, size: number, rowDistance: number, speciesCount = 1): WaveMonster[] {
  return Array.from({ length: size }, (_, index) => {
    const lane = laneForWaveMonster(rowIndex, index);
    const jitter = (hashFor(rowIndex, index, 1) * 2 - 1) * MONSTER_JITTER;
    return {
      index,
      lane,
      offset: clampOffset(laneCenterOffset(lane) + jitter),
      speciesIndex: Math.min(speciesCount - 1, Math.floor(hashFor(rowIndex, index, 2) * speciesCount)),
      distance: rowDistance - (WAVE_LENGTH * (size - 1 - index)) / size,
    };
  });
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

/**
 * 人多就丟得密。開根號是為了讓 64 人不會變成一秒鐘 60 把武器——畫面會糊掉,而且結果不變
 * (打得掉幾隻仍然只看 waveKillCount)。人數是玩家最有感的成長,投擲密度要跟著長,
 * 不然「人變多了」在戰鬥畫面上完全看不出來。
 */
export const MAX_VOLLEY_RATE = 4;
export function volleyRate(heroes: number): number {
  return Math.min(MAX_VOLLEY_RATE, Math.max(1, Math.sqrt(Math.max(1, heroes))));
}

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

/** 一波混幾種怪。種類只影響外觀,不影響戰力——所以可以放心多抽幾種。 */
export const SPECIES_PER_WAVE = 3;

/** 這一排是不是大魔王:魔王關的最後一排敵人。 */
function isBossRow(stage: number, rowIndex: number): boolean {
  return isBossStage(stage) && rowIndex === lastEnemyRowIndex();
}

export function lastEnemyRowIndex(): number {
  return Math.floor(ROWS_PER_RUN / ENEMY_EVERY) * ENEMY_EVERY - 1;
}

/** 這一場的魔王長什麼樣。前 5 場用 5 款關卡魔王,第 6 場以後都是大魔王本尊。 */
export function bossSpeciesForStage(stage: number): WaveSpecies {
  const index = bossIndexForStage(stage);
  if (index >= 1 && index <= 5) {
    const spec = getStageBossMonster(index as JobTier);
    return { id: spec.id, name: spec.name };
  }
  return { id: FINAL_BOSS_MONSTER.id, name: FINAL_BOSS_MONSTER.name };
}

function makeEnemyRow(rng: () => number, stage: number, rowIndex: number): RunNode[] {
  const boss = isBossRow(stage, rowIndex);
  const power = Math.round(enemyPowerForRow(stage, rowIndex) * (boss ? BOSS_POWER_MULTIPLIER : 1));
  if (boss) {
    const species = bossSpeciesForStage(stage);
    const enemy: EnemyEffect = {
      power,
      reward: Math.round(power * 0.6),
      boss: true,
      hitsPerUnit: BOSS_HITS,
      species: [species],
      name: species.name,
      units: 1,
    };
    return Array.from({ length: LANE_COUNT }, (_, lane) => ({
      lane: lane as Lane,
      kind: 'enemy' as const,
      enemy,
    }));
  }
  const rarity = enemyRarityForRow(rowIndex);
  // 抽到重複的就換一階稀有度再抽,盡量湊滿不同的造型;湊不滿也不強求(池子有限)。
  const species: WaveSpecies[] = [];
  const rarities: Rarity[] = [rarity, 'common', 'rare', 'epic'];
  for (let i = 0; i < SPECIES_PER_WAVE; i++) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const m = pickMonster(rarities[(i + attempt) % rarities.length], rng);
      if (!species.some((sp) => sp.id === m.id)) {
        species.push({ id: m.id, name: m.name });
        break;
      }
    }
  }
  const enemy: EnemyEffect = {
    power,
    reward: Math.round(power * 0.4),
    species,
    name: species[0].name,
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
  if (gate.stat === 'heroes') {
    next.heroes = gate.op === 'mul' ? next.heroes * gate.value : next.heroes + gate.value;
    // 人數下限 1:連吃幾次減半會趨近 0,全隊死光之後怎麼跑都沒有意義,那不是懲罰是卡死。
    next.heroes = Math.max(1, Math.round(next.heroes));
  } else if (gate.stat === 'gear') {
    // 等級只是「拿哪一把武器」的外觀,夾在 1~5(只有 5 階武器美術);**傷害的增減照算,不受夾擠影響**。
    //
    // 先前是連傷害一起夾:結果 1 階的人吃到「裝備損壞」完全不痛(已經最低了),而起跑就 2 階的
    // 近戰職業會實打實被扣一次。實測滿階職業對亂選玩家反而是負的(-0.4 ~ -1.7 個百分點),
    // 因為「起跑裝備好」在這個規則下等於「更怕裝備損壞」——養成越高越吃虧,完全反了。
    // 現在等級與傷害分開算:等級到頂/到底只是圖不再換,閘門的效果永遠生效。
    next.gear = Math.min(MAX_GEAR, Math.max(1, next.gear + gate.value));
    next.perHero = Math.max(1, Math.round(next.perHero * Math.pow(GEAR_STEP, gate.value)));
  } else {
    next.maxHp = gate.op === 'mul' ? Math.round(next.maxHp * gate.value) : next.maxHp + gate.value;
    next.maxHp = Math.max(1, next.maxHp);
    next.hp = Math.min(next.maxHp, next.hp + (gate.op === 'mul' ? 0 : gate.value));
    next.hp = Math.max(0, next.hp);
  }
  return next;
}

export function gateLabel(gate: GateEffect): string {
  if (gate.stat === 'gear') return gate.value >= 0 ? '裝備強化' : '裝備損壞';
  const stat = gate.stat === 'heroes' ? '勇者' : '血量';
  if (gate.op === 'mul') return `${stat} x${gate.value}`;
  return `${stat} ${gate.value >= 0 ? '+' : ''}${gate.value}`;
}

/**
 * 漏接的回饋文字。畫面要拿它判斷「這次不是好事也不是壞事」——漏接的 hpDelta/attackDelta
 * 都是 0,光看數字會被當成中性的好結果而畫成綠色,實際上是「你什麼都沒吃到」。
 */
export const MISS_MESSAGE = '沒碰到';

/** 撞上敵人:攻擊力不足的部分直接換算成傷害。打得贏就零傷害並拿獎勵。 */
export function resolveEnemy(state: RunState, enemy: EnemyEffect): RowResolution {
  const shortfall = Math.max(0, enemy.power - totalAttack(state));
  const next = { ...state };
  if (shortfall === 0) {
    next.coins += enemy.reward;
    return { state: next, message: `擊倒${enemy.name} +${enemy.reward} 金幣`, hpDelta: 0, attackDelta: 0 };
  }
  next.hp = Math.max(0, next.hp - shortfall);
  if (next.hp <= 0) next.phase = 'dead';
  return { state: next, message: `戰力不足 -${shortfall} 血`, hpDelta: -shortfall, attackDelta: 0 };
}

/**
 * 走過一排:只有玩家所在跑道的節點會生效,而且閘門還要真的踩到(見 hitsGate)。
 * offset 不給的話當作站在該跑道正中央——驗證腳本用跑道模擬時就是這個意思。
 */
export function resolveRow(state: RunState, row: RunRow, offset?: number): RowResolution {
  const at = offset ?? laneCenterOffset(state.lane);
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
    // 站在這一格,但沒踩在閘門上——整格漏掉。好處沒吃到,陷阱也沒踩到。
    if (!hitsGate(at, node.lane)) {
      return { state: advanced, message: MISS_MESSAGE, hpDelta: 0, attackDelta: 0 };
    }
    const after = applyGate(advanced, node.gate);
    if (after.hp <= 0) after.phase = 'dead';
    return {
      state: after,
      message: gateLabel(node.gate),
      hpDelta: after.hp - advanced.hp,
      attackDelta: totalAttack(after) - totalAttack(advanced),
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
    // 戰力權重高於血量:血量只讓你活著,戰力決定你打不打得贏後面的敵人。
    const score = totalAttack(r.state) * 3 + r.state.hp;
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
    const score = totalAttack(r.state) * 3 + r.state.hp;
    if (score < worstScore) {
      worstScore = score;
      worst = node.lane;
    }
  }
  return worst;
}
