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
 *
 * op 只有兩種:
 *   add  固定值加減(勇者 +N、裝備階級、扣血)
 *   mul  乘上去(勇者 x2、勇者 x0.5)
 *
 * 「勇者 +N」的 N 是**產生跑圖時就決定好的固定數字**,不是看玩家當下有幾隻算出來的。
 * 這條很重要:曾經做過比例制(N = 當下人數 x 60%),結果是同一排上的兩格會互相影響——
 * 場上有「+2」跟「+4」,吃掉 +2 之後 +4 會跟著長成 +6,戰力浮濫。固定值沒有這個問題,
 * 而且它自帶剎車:隊伍越大,同一個 +N 的相對收益越小,成長自然收斂。
 *
 * 固定值以前被拿掉過一次,理由是職業中立性(固定的 +5 對起跑 1 人的職業價值是起跑 6 人的
 * 6 倍)。那個理由現在不成立了——所有職業一律 1 人起跑(見 laneJobs 的說明),
 * 起跑的每人攻擊力對每個職業都一樣,固定 +N 對誰都一樣值。
 */
export interface GateEffect {
  stat: 'heroes' | 'gear' | 'hp';
  op: 'add' | 'mul';
  value: number;
}

/**
 * 陷阱格(畫面標紅的那一種)。只算真正的負面效果——加得比較少的那格不算陷阱,
 * 那是玩家自己要判斷的取捨。放在這裡而不是畫面層,是因為畫面曾經自己寫過一份同樣的判斷,
 * op 一加新的就會兩邊不同步。
 */
export function isTrapGate(gate: GateEffect): boolean {
  return gate.op === 'mul' ? gate.value < 1 : gate.value < 0;
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

/**
 * 一場跑幾排。12 排的時候一關只有 30 秒(第 40 關剩 12 秒),而且只有 3 排敵人——
 * 前 3 個閘門就把勝負決定完了,剩下的路是在跑完流程而不是在玩。20 排讓一關變成
 * 約 48 秒 / 19 秒,敵人排從 3 排變成 5 排,中後段才有「還要再撐幾波」的感覺。
 *
 * 加長之所以安全,是因為敵人戰力現在直接跟著好閘門的成長走(見 enemyPowerForRow):
 * 排數變多不會讓玩家越跑越無敵,只是同一種張力多維持幾波。以前不是這樣——12 排就已經
 * 讓最佳玩家從領先 3.5 倍膨脹到 17.6 倍,再加長只會讓後半段更沒事做。
 */
export const ROWS_PER_RUN = 20;
/** 每隔幾排出現一排敵人(敵人排三條跑道都是敵人,一定要正面對上)。 */
export const ENEMY_EVERY = 4;

/** 這一排之前總共經過幾排閘門。敵人戰力要跟「理想路線吃過幾格」對齊,靠的就是這個。 */
export function gatesBeforeRow(rowIndex: number): number {
  return rowIndex - Math.floor(rowIndex / ENEMY_EVERY);
}

/** 一場跑完要幾秒(給驗證腳本量關卡長度用)。 */
export function runSeconds(stage: number): number {
  return runLength() / runSpeed(stage);
}

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
 * 敵人戰力 = 「理想路線跑到這一排時的戰力」x ENEMY_POWER_RATIO。
 *
 * 以前是兩條各走各的指數:玩家每格 x1.6~x2、敵人每 4 排 x1.9。兩個數字看起來都合理,
 * 湊在一起卻是災難——最佳玩家的領先幅度每過一排敵人就再乘 3 倍,實測第 10 關是
 * 第 3 排領先 3.5 倍 → 第 7 排 9.5 倍 → 第 11 排(魔王)17.6 倍。也就是說前三個閘門
 * 決定勝負,之後整場都在跑完流程。這是「同一關卡中段就沒有挑戰性」的真正原因,
 * 不是閘門用乘法本身的錯。
 *
 * 現在敵人直接照 GOOD_GATE_GROWTH 走同一條曲線,領先幅度**結構上是常數**:
 * 好閘門怎麼調(換組成、改倍率),敵人自動跟上,不必再手動重掃第二條曲線。
 * 這也是為什麼排數可以放心加長——多跑幾排不會多送玩家一份無敵。
 */

/**
 * 敵人戰力佔「這一場最佳路線戰力」的比例。這是唯一的難度旋鈕:
 * 越大越懲罰失誤(1.0 = 一格都不能選錯),越小越寬鬆。1/ratio 就是最佳玩家的緩衝倍數,
 * 0.25 等於「大約可以選錯兩格」。
 *
 * 掃出來的準確率曲線(第 20 關,準確率 → 過關率):
 *   100% → 100% | 95% → 82% | 90% → 63% | 85% → 46% | 80% → 29%
 * 0.34 時 90% 準確率只剩 49%(太緊),0.16 時 80% 準確率還有 48%(太鬆)。
 *
 * 「完全選對一定過關」現在是**結構保證**而不是掃參數的結果:敵人是照這一場實際的最佳路線
 * 算出來的(見 createRun),所以只要 ratio < 1,最佳玩家在每一排都恰好領先 1/ratio 倍。
 * 以前用「平均理想路線」估的時候不是這樣——抽牌運差的場次會讓最佳玩家也過不了關。
 *
 * 注意:這裡**不用「亂選過關率」當基準**。跑道 20 排之後亂選在任何 ratio 下都是 0~2%
 * (15 個二選一),拿它當指標只會逼著把難度調到沒有意義的低點。
 */
export const ENEMY_POWER_RATIO = 0.25;

// 敵人戰力不在這裡算——它是產生跑圖時逐場模擬出來的(見 createRun)。
// 這裡曾經有 idealAttackForRow / enemyPowerForRow 兩個「平均理想路線」的函式,
// 固定 +N 之後平均值不再能代表個別場次,留著只會誤導。

// ---- 產生一場跑圖 ----
// 兩條跑道就是二選一,所以每一排固定「一好一壞」:兩格都正面的話玩家隨便選都在變強,
// 左右滑就失去意義了。陷阱那格用扣除而不是歸零,選錯還有救,但會很痛。
//
// 好的那格三選一,全部直接影響戰力,玩家要比的是「這排我缺人還是缺裝備」:
//   勇者 x2   —— 爆發,人數翻倍。整場最爽的一格,所以留著,但**刻意調得很少見**。
//   勇者 +N   —— 穩定補人。N 是產生跑圖時就決定好的固定數字(見 GateEffect)。
//   裝備強化  —— 全隊每個人都變強,人越多越划算
//
// 為什麼 x2 這麼少見:每格都翻倍的話,一場 15 個閘門就是 2^15,敵人怎麼追都追不上,
// 中後段整個空掉(見 enemyPowerForRow 的註解與實測數字)。把大部分的格子換成幅度較小的
// 「+N / 裝備」之後,爆發格才有「這次抽到好東西」的份量,而不是每一排都在翻倍。
//
// 另一種曾經放過又拿掉、不要再加回來的:
//   血量 +N —— 不加戰力,吃了也打不動下一波,實際上是「這排跳過」。二選一的節奏下,
//              一個不影響戰力的選項等於沒得選。血量只留在陷阱那側(扣血)。

/** 好閘門的抽中權重。x2 是爆發格,壓到一成出頭才有「抽到了」的份量。 */
export const GATE_WEIGHT_DOUBLE = 0.12;
export const GATE_WEIGHT_ADD = 0.4;
export const GATE_WEIGHT_GEAR = 0.48;

/**
 * 「勇者 +N」的 N 是理想路線在這個深度的人數的幾成。
 *
 * 為什麼跟深度綁而不是跟玩家當下的人數綁:跟玩家綁的話,同一排的兩格會互相影響
 * (吃掉 +2 之後 +4 會長成 +6),戰力浮濫。跟深度綁的話 N 在產生跑圖時就固定了,
 * 吃不吃都不會變——而且自帶追趕機制:落後的玩家拿到的 +N 相對自己是大補,
 * 領先的玩家拿到的只是零頭,成長自然收斂。
 */
export const HERO_ADD_RATIO = 0.6;

/**
 * 理想路線的模擬:每一格都吃到好閘門,人數與每人攻擊力各自怎麼長。
 *
 * perHero 正規化成 1(= baseAttackForStage 的倍率)。整條路線跟關卡無關——
 * 所有效果不是乘就是「加上 N x perHero」,兩邊都跟 base 成正比,所以算一次就能重複用。
 *
 * 用期望值往前推(三種好格各自的結果 x 權重),不是隨機模擬:敵人戰力必須是確定值,
 * 同一關每次跑都要一樣。
 */
interface IdealStep {
  heroes: number;
  perHero: number;
  /** 在這個深度的「勇者 +N」要給幾隻 */
  addN: number;
}

const IDEAL_PATH: IdealStep[] = (() => {
  const w = GATE_WEIGHT_DOUBLE + GATE_WEIGHT_ADD + GATE_WEIGHT_GEAR;
  const [wDouble, wAdd, wGear] = [GATE_WEIGHT_DOUBLE / w, GATE_WEIGHT_ADD / w, GATE_WEIGHT_GEAR / w];
  const out: IdealStep[] = [];
  let heroes = 1;
  let perHero = 1;
  // 多算幾格當緩衝,免得之後把 ROWS_PER_RUN 調大就查表越界。
  for (let g = 0; g <= ROWS_PER_RUN + 8; g++) {
    const addN = Math.max(1, Math.round(heroes * HERO_ADD_RATIO));
    out.push({ heroes, perHero, addN });
    heroes = wDouble * (heroes * 2) + wAdd * (heroes + addN) + wGear * heroes;
    perHero = wDouble * perHero + wAdd * perHero + wGear * (perHero * GEAR_STEP);
  }
  return out;
})();

/** 理想路線走過 g 格閘門之後的狀態。超出表格就用最後一格(不會發生,防呆用)。 */
function idealStep(gates: number): IdealStep {
  return IDEAL_PATH[Math.min(Math.max(0, gates), IDEAL_PATH.length - 1)];
}

/** 吃到一格好閘門,總戰力平均乘多少。給驗證腳本看趨勢用,不再拿來推敵人曲線。 */
export function goodGateGrowthAt(gates: number): number {
  const a = idealStep(gates);
  const b = idealStep(gates + 1);
  return (b.heroes * b.perHero) / (a.heroes * a.perHero);
}

function pickGoodGate(rng: () => number, gateDepth: number): GateEffect {
  const total = GATE_WEIGHT_DOUBLE + GATE_WEIGHT_ADD + GATE_WEIGHT_GEAR;
  const roll = rng() * total;
  if (roll < GATE_WEIGHT_DOUBLE) return { stat: 'heroes', op: 'mul', value: 2 };
  if (roll < GATE_WEIGHT_DOUBLE + GATE_WEIGHT_ADD) {
    return { stat: 'heroes', op: 'add', value: idealStep(gateDepth).addN };
  }
  return { stat: 'gear', op: 'add', value: 1 };
}

function makeGateRow(rng: () => number, stage: number, gateDepth: number): RunNode[] {
  const good: GateEffect = pickGoodGate(rng, gateDepth);
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

// ---- 打擊數值與暴擊 ----
// 命中的瞬間在怪物身上跳一個傷害數字,偶爾是金色的暴擊。
//
// **這一整組是演出,不影響勝負。** 打得掉幾隻仍然只看 waveKillCount,暴擊不會多打死一隻。
// 這條界線跟波次演出是同一條(見上方「一波敵人不是三隻站著等你撞」那段):結算只在
// 這一排的結算點算一次,畫面負責把那個結果演出來。讓暴擊真的去改擊殺數的話,就變成
// 兩套各自漂移的判定,最後畫面演的跟實際扣的血對不起來——而且這一版的難度曲線
// (ENEMY_POWER_RATIO)是照 waveKillCount 校準的,暴擊插進去等於整條重來。
//
// 暴擊要不要「其實有加成」?不要。要加成的話期望值得併進 totalAttack,那就是動平衡;
// 現在的做法是「同樣的結果,演得比較好看」——爽感來自數字跳動與金色,不是來自偷偷變強。

/** 幾成的命中是暴擊。太高就沒有「中了!」的感覺,太低玩家整場看不到一次。 */
export const CRIT_CHANCE = 0.22;
/** 暴擊的數字放大幾倍。只影響顯示的數字。 */
export const CRIT_MULTIPLIER = 2;

/**
 * 這一下是不是暴擊。用雜湊而不是 Math.random:同一場重播要長一樣,
 * 而且畫面每個 tick 都會重算,用亂數的話同一下會一下暴擊一下不暴擊,數字會閃爍。
 */
export function isCritHit(rowIndex: number, targetIndex: number, hitOrdinal: number): boolean {
  return hashFor(rowIndex * 97 + targetIndex, hitOrdinal, 7) < CRIT_CHANCE;
}

/**
 * 命中時跳出來的數字。一隻要挨 hitsPerUnit 下才倒,所以一下的傷害就是總戰力攤到每一下上。
 * 這個數字是給玩家看「我這一下有多痛」的,不是結算用的數字。
 */
export function hitDamage(attack: number, hitsPerUnit: number, crit: boolean): number {
  const per = Math.max(1, Math.round(attack / Math.max(1, hitsPerUnit)));
  return crit ? Math.round(per * CRIT_MULTIPLIER) : per;
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

function makeEnemyRow(rng: () => number, stage: number, rowIndex: number, idealAttack: number): RunNode[] {
  const boss = isBossRow(stage, rowIndex);
  const power = Math.max(1, Math.round(idealAttack * ENEMY_POWER_RATIO * (boss ? BOSS_POWER_MULTIPLIER : 1)));
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

/**
 * 產生一場跑圖。
 *
 * 敵人戰力用的是**這一場實際的最佳路線**,不是「平均的理想路線」:一邊產生閘門,
 * 一邊模擬「每一格都吃到好的」會走到什麼數值,走到敵人排就照那個數字乘上 ENEMY_POWER_RATIO。
 *
 * 為什麼不能用平均值:固定 +N 之後成長不再是等比,各場的抽牌差異會被放大——用平均值估的話,
 * 抽到一堆裝備格(人數停在低點)的那幾場,敵人會相對過強,實測最佳玩家的領先幅度在
 * 第 10 關會從 8.6x 掉到 1.8x,同一顆 seed 甚至會讓「每排都挑最好」也過不了關。
 * 改成逐場模擬之後,最佳玩家的領先幅度**每一排、每一場都精確等於 1/ENEMY_POWER_RATIO**,
 * 「選對就一定過、不靠運氣」這條保證才是結構上的,不是靠參數掃出來的。
 *
 * 模擬用的是不含轉職/技能加成的基準值(baseAttackForStage),所以養成不會把敵人一起養大——
 * 用玩家的實際起跑值去算的話,轉職越高敵人越強,養成就完全白做了。
 */
export function createRun(seed: number, stage: number): RunRow[] {
  const rng = createRng(seed);
  // 挑怪物造型用獨立的亂數流。混用同一條的話,加一次抽選就會把後面所有閘門的內容整個位移,
  // 已經驗證過的過關率(scripts/verify-lane-run.ts)全部要重跑——造型是外觀,不該動到數值。
  const artRng = createRng((seed ^ 0x9e3779b9) >>> 0);
  const rows: RunRow[] = [];
  // 最佳路線的模擬狀態。跟 RunState 一樣是「人數 x 每人攻擊力」,起手 1 人。
  let idealHeroes = 1;
  let idealPerHero = baseAttackForStage(stage);
  for (let i = 0; i < ROWS_PER_RUN; i++) {
    const isEnemy = (i + 1) % ENEMY_EVERY === 0;
    if (isEnemy) {
      rows.push({
        index: i,
        distance: LEAD_IN_DISTANCE + i * ROW_SPACING,
        nodes: makeEnemyRow(artRng, stage, i, idealHeroes * idealPerHero),
      });
      continue;
    }
    const nodes = makeGateRow(rng, stage, gatesBeforeRow(i));
    // 好的那格就是「不是陷阱」的那格——兩格固定一好一壞,所以這樣認得出來。
    const good = nodes.find((n) => n.gate && !isTrapGate(n.gate))!.gate!;
    if (good.stat === 'heroes') {
      idealHeroes = good.op === 'mul' ? idealHeroes * good.value : idealHeroes + good.value;
    } else if (good.stat === 'gear') {
      idealPerHero *= Math.pow(GEAR_STEP, good.value);
    }
    rows.push({ index: i, distance: LEAD_IN_DISTANCE + i * ROW_SPACING, nodes });
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

/**
 * 閘門上要印什麼字。數字在產生跑圖時就定好了,所以不需要知道玩家當下有幾隻。
 *
 * 「勇者 +N」印的是具體人數(「勇者 +8」)而不是百分比——玩家在 1 秒內要跟隔壁格比大小,
 * 百分比得先在腦子裡換算一次,具體數字才比得動。
 */
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
