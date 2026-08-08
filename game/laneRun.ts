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
import {
  ACTIVE_SKILL_IDS, elementForRow,
  applyRunSkillPick, bestRunSkillChoice, learnRunSkill, runSkillOffersAt, runSkillPicksForWave,
  type RunSkillState, type RunSkillId,
} from './laneRunSkills';
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

export function gateSpan(lane: Lane, stage = 1): { from: number; to: number } {
  const center = laneCenterOffset(lane);
  const half = gateWidthForStage(stage) / 2;
  return { from: center - half, to: center + half };
}

// ---- 勇者的身體寬度 ----
//
// 判定是**身體碰到就算**,不是「中心點落在框裡」。舊版把勇者當成一個點,所以畫面上
// 明明半個身體壓在閘門上卻什麼都沒吃到——那是玩家看得見、但規則說不通的一種落空。
//
// ## 為什麼橫向隊形放在這一層
//
// 隊伍越多人站得越寬,而**判定寬度就是隊伍寬度**,所以「這一隻畫在哪」不再只是美術問題,
// 它直接決定吃不吃得到。畫面與判定各留一份座標的話,改了其中一份就會出現
// 「看起來碰到了但沒反應」——這款最不能有的那種 bug。所以橫向位置在這裡定義一次,
// 畫面照這一份畫(dy 與 scale 純視覺,留在 components)。
//
// 單位是 offset(0~1 的跑道寬度)不是像素:像素會隨螢幕寬變,難度就跟著螢幕變
//(窄螢幕的人判定框相對更寬)。距離與像素是兩個座標系,這個坑 CLAUDE.md 記過。
/** 隊形的橫向位置,相對於隊伍中心。索引 = 第幾隻(畫面上最多畫這麼多隻)。 */
export const SQUAD_DX: number[] = [
  0, -0.058, 0.058, -0.111, 0.111, -0.037, 0.037,
  -0.164, 0.164, -0.090, 0.090, 0, -0.138, 0.138,
];

/**
 * 一隻勇者自己的半寬。
 *
 * 0.075 是上限不是隨便挑的:**一個人站在起跑位置(0.5,兩格中間的空隙)必須兩邊都碰不到**。
 * 第 1 關的閘門左緣在 0.75 - 0.34/2 = 0.58,所以半寬要小於 0.08。
 * 「不動的話什麼都吃不到」是這款的第一課,守不住的話開場那一排就沒有在教任何東西了。
 *
 * 附帶結果是判定框比畫出來的史萊姆窄了約兩成。方向是對的——**寧可窄一點**:
 * 寬過頭會讓玩家吃到他覺得沒碰到的格子(包含陷阱),那比漏接更難接受。
 */
export const HERO_BODY_HALF = 0.075;

/** 畫面上最多畫幾隻(也是隊伍寬度的上限)。 */
export const MAX_DRAWN_HEROES = SQUAD_DX.length;

/**
 * 這麼多人的時候隊伍有多寬(半寬,offset 單位)。
 *
 * 人數超過 MAX_DRAWN_HEROES 就不再變寬:畫面上本來就只畫這麼多隻,再寬下去
 * 判定框會超出玩家看得到的身體——而「看不見的判定」正是這次要修掉的東西的反面。
 */
export function heroHalfSpan(heroes: number): number {
  const drawn = Math.min(MAX_DRAWN_HEROES, Math.max(1, Math.floor(heroes)));
  let spread = 0;
  for (let i = 0; i < drawn; i++) spread = Math.max(spread, Math.abs(SQUAD_DX[i]));
  return spread + HERO_BODY_HALF;
}

/** 隊伍現在佔住跑道的哪一段。畫面拿它畫隊形,判定拿它算重疊——同一個數字。 */
export function heroSpan(offset: number, heroes: number): { from: number; to: number } {
  const at = clampOffset(offset);
  const half = heroHalfSpan(heroes);
  return { from: at - half, to: at + half };
}

/**
 * 有沒有踩到這一格的閘門。**身體碰到就算**(兩段重疊),不是中心點落在框裡。
 *
 * 只會判到 `lane` 這一格:結算前 resolveRow 已經先用 laneFromOffset 挑好腳下那一格了,
 * 所以隊伍再寬也不可能同時吃到兩邊——寬度買到的是「站得偏一點也吃得到自己這一格」,
 * 不是「兩格通吃」。
 */
export function hitsGate(offset: number, lane: Lane, stage = 1, heroes = 1): boolean {
  const gate = gateSpan(lane, stage);
  const body = heroSpan(offset, heroes);
  return body.to >= gate.from && body.from <= gate.to;
}

export type NodeKind = 'gate' | 'enemy' | 'coin';

/**
 * 閘門效果。兩種資源各有各的手感,混在一起玩家才需要真的比較:
 *   heroes 勇者人數——乘法成長最快,是畫面上最爽的那一種(一排變兩排)
 *   gear   裝備等級——每升一級全隊每個人都變強,乘上人數之後才是總戰力
 * 加法給穩定成長、乘法給爆發,兩種混在同一排,玩家才需要真的算一下。
 *
 * **血量閘門已經拿掉了**:這一版沒有獨立的血量,人數就是血量(見 RunState.heroes),
 * 所以「扣血」這件事直接由「扣人」表達——同一個資源,少一層要玩家自己換算的抽象。
 *
 * op 只有兩種:
 *   add  固定值加減(勇者 +N / -N、裝備階級)
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
  stat: 'heroes' | 'gear';
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
  /** 精英排:一隻大的,不是一群小的。畫面要畫大,而且漏掉牠的代價是一整群的份。 */
  elite?: boolean;
  /**
   * 勇者波:敵方是**勇者**不是怪,會投擲武器。落點就是 hazards,站在裡面才會被砸中。
   *
   * 這不是走回頭路(廢掉的「定點閃避」是站著不動、看招式往反方向滑,滑動是**反應**);
   * 這裡滑動還是**位置管理**,跟閘門同一套連續位置判定,只是反過來用——
   * 閘門是「要踩上去」,投擲是「不能站在那裡」。
   */
  heroWave?: boolean;
  /**
   * 這是第幾排。勇者波要用它算落點——**落點不能在產生排的時候就固定**,
   * 因為丟的人是「還沒被打倒的那些」,而那取決於玩家當下的戰力(見 hazardsFor)。
   */
  rowIndex?: number;
  /** 這一波的屬性。帶著剋它的元素,那個元素的效果會放大(見 laneRunSkills 的 ELEMENT_COUNTERS)。 */
  element?: RunSkillId;
  /**
   * 每漏掉一隻要換掉幾個勇者。一般小怪是 1,**精英是一整群的份**——
   * 「大」在這個模型裡的意思就是這個:牠一隻抵一群,擋不下來就是一次大額兌換。
   */
  leakCost?: number;
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
   * 這是第幾個小關。放進 state 是因為**結算需要它**:閘門寬度隨關卡收窄
   * (見 gateWidthForStage),而 resolveRow 只拿得到 state 與 row。
   */
  stage: number;
  /**
   * 結算時腳下踩的那一格。畫面上的實際橫向位置是連續的、存在 hooks/useLaneRun.ts,
   * 這裡只保留「換算成格子」的結果——純邏輯層不需要知道手指拖到哪個像素。
   */
  lane: Lane;
  /**
   * 場上的勇者人數。閘門 x2 加的是這個——畫面上真的會多出一排人。
   *
   * **人數就是血量。** 沒有獨立的血條:打不掉的怪撞上來會換掉勇者(見 resolveEnemy),
   * 人數歸零就是死亡。這樣「我變強了」跟「我剛剛失誤了」在螢幕上都是看得見的一群人變多變少,
   * 而不是 HUD 上一個數字在跳(舊版最大的問題:成長與懲罰都是隱形的)。
   */
  heroes: number;
  /** 每名勇者的攻擊力。換裝備加的是這個,乘上人數才是總戰力。 */
  perHero: number;
  /** 裝備等級。只決定「拿哪一把武器」的外觀與升降級的落點,傷害本身看 perHero。 */
  gear: number;
  /**
   * 兌換率:一個勇者能換掉幾隻怪。這是**唯一的防禦軸**,取代舊版的血量。
   *
   * 為什麼防禦不是「多給人」:鐵則禁止養成給起跑人數(起跑總戰力固定,人數只決定怎麼拆,
   * 給人數等於稀釋 perHero,實測會讓點滿技能比裸裝還慘)。兌換率是乘數不是固定值,
   * 後期不會變零頭;而且**完全不失誤的玩家根本碰不到怪**,兌換率對他等於零效益——
   * 抬地板不抬天花板,所以幅度可以放心給,也不會被敵人曲線追平。
   */
  tradeRate: number;
  coins: number;
  rowIndex: number;
  phase: 'running' | 'cleared' | 'dead';
}

/** 兌換率的預設值:一個勇者換一隻怪。 */
export const BASE_TRADE_RATE = 1;

/**
 * 打倒的怪有多少比例會加入你的隊伍。
 *
 * 為什麼需要這個:
 * 1. **打完一波原本完全沒有正向回饋**,只有「有沒有活下來」。人群跑酷的爽點是隊伍越滾越大,
 *    而在這之前人數只能從閘門來,戰鬥純粹是消耗。
 * 2. **它是「左右不對稱」能成立的前提。** 兌換模型裡 kills 跟隻數無關,所以隻數少的那格
 *    永遠漏得少、永遠安全;多的那格要有「這一場之內有用」的報酬才會變成真的選擇,
 *    而這款唯一有用的東西就是人(見 docs/DESIGN.md §3.1a)。
 *
 * 幅度不會失控的原因是 `ABSORB_UNIT_CAP`(見下面):超過那個隻數之後吸收就變成
 * **固定 +N**,不再是複利——早期滾雪球(有感),後期只是涓滴(不膨脹)。
 *
 * **0.08 → 0.06 是隻數翻倍的連帶調整。** 吸收是照 `units` 算的,隻數一翻倍吸收也翻倍,
 * 加倍長的小關(20 波)實測把單場放大量從 662 推到 777 倍,越過「壓在 700 倍以內」那條線
 *(數字要停在看得懂的位數,見 CLAUDE.md「單場的戰力膨脹會吃掉整條養成曲線」)。
 * 0.06 讓每一波實際吸到的人數回到翻倍前的量級,終場人數也回到 60 幾人。
 */
export const ABSORB_RATIO = 0.06;

/**
 * 吸收**最多照幾隻算**。
 *
 * 這個上限原本長在 `waveSize` 上(`MAX_WAVE_SIZE = 48`),但它其實是為了這裡存在的:
 * 吸收會回頭餵大理想人數、理想人數又決定下一波幾隻,**那是一條複利迴圈**;
 * 沒有天花板的話加倍長的小關實測會把單場放大量從 662 推到 1666 倍(數字整個看不懂)。
 *
 * 把上限從「一波幾隻」搬到「吸收照幾隻算」之後,兩件事分開了:
 * **一波要畫幾隻可以一直長(那是演出),而吸收在 48 份之後就變成固定 +N(那是數值)。**
 * 早期照樣滾雪球、後期照樣只是涓滴,理想路線一格都沒動。
 *
 * **夾的是「隻數 x 份量」的乘積,不是隻數。** 只夾隻數的話精英波會漏掉:牠一隻抵 6 份,
 * 而牠的隻數也跟著解除上限了(舊制 48/6 = 8 隻 → 現在 25 隻),吸收會從 +3 變成 +9,
 * 實測把長關的放大量從 662 推到 693 倍。夾乘積之後兩種波共用同一個天花板,
 * 而且 48 這個數字剛好等於舊制的實際上限(一般波 48 x 1、精英波 8 x 6),所以理想路線完全沒動。
 */
export const ABSORB_UNIT_CAP = 48;

/**
 * 打贏這一波會補幾個人。精英一隻抵一群,所以牠的份量也照 leakCost 算。
 *
 * **無條件進位,所以全清一定至少 +1。** 用 floor 的話 9 隻以下都是 +0——
 * 早期(隻數少)跟精英(1 隻 x 6 份量 = 0.72)通通看不到效果,玩家會認定這機制不存在。
 * 而它最該有感的地方正是早期:那時候 +1 人是 +50% 戰力。
 *
 * 進位同時把成長從**複利**變成**加法**:每波固定 +1~2,而不是「人越多吸得越多」。
 * 複利版本(floor + 0.12)實測會把單場放大量推到 309 倍,逼得 GEAR_STEP 要壓到 1.04——
 * 那等於「裝備強化」只加 4%,核心閘門變成白給,拿閘門去換一個新機制完全不划算。
 */
export function absorbedFrom(kills: number, leakCost = 1): number {
  if (kills <= 0) return 0;
  // 夾在 ABSORB_UNIT_CAP:超過之後吸收是固定值,不再是複利(見那個常數的說明)。
  // **夾的是「隻數 x 份量」的乘積**——只夾隻數的話精英波(一隻抵 6 份)會從天花板底下溜過去。
  const mass = Math.min(kills * Math.max(1, leakCost), ABSORB_UNIT_CAP);
  return Math.ceil(mass * ABSORB_RATIO);
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
  /**
   * 起跑的兌換率(取代舊版的 hpMultiplier)。1 = 一個勇者換一隻怪。
   * 耐打路線加的是這個——它只在「已經漏接了」的時候才生效,所以不會變成無腦的通關券,
   * 而且**不能算進理想路線**(理想玩家不被撞,算進去等於讓敵人為了一個沒人用到的東西變強)。
   */
  tradeRate: number;
}

export const DEFAULT_RUN_START: RunStart = {
  heroes: 1, gear: 1, attackMultiplier: 1, tradeRate: BASE_TRADE_RATE,
};

/** 起跑位置:跑道正中央。兩條跑道沒有「中立格」,站中間只是還沒表態,第一排之前一定要選邊。 */
export const START_OFFSET = 0.5;

/**
 * 換一級裝備等於每個人的攻擊力乘/除這個數。
 *
 * 1.6 → 1.22 是為了壓單場的戰力膨脹。1.6 的時候一場 15 個閘門會把戰力放大 2100~6900 倍
 * (第 1 關 10 → 24528),數字大到玩家分不出 13160 跟 67368 的差別,前半段的選擇在數值上
 * 被完全抹平,而且**單場的雪球比整條關卡進度大 460 倍**——養成做得再多都感覺不到。
 * 現在是 71~186 倍(第 1 關 10 → 705~1860),數字停在 4 位數,單場成長只比 25 關的進度大 29 倍。
 *
 * 難度不受影響:敵人是照這一場的最佳路線算的,閘門調小敵人自動跟著小(見 ENEMY_POWER_RATIO)。
 */
export const GEAR_STEP = 1.07;
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

// ---- 第 40 小關之後的難度分段 ----
//
// ## 為什麼跑速不能繼續加
//
// 跑速在第 40 小關封頂,不是忘了往上調——0.9 秒一排是「看清楚兩個選項 + 決定 + 滑過去」
// 的下限,再快就變成瞎猜,那不是難度是雜訊。**所以後面 260 個大關的難度不能再靠速度。**
// 這條走到底之後只剩兩個方向:要求更精準,以及讓失誤更貴。
//
// ## 一段只轉一顆旋鈕
//
// 三段各自只動一件事,而且各有各的「難在哪」:
//
//   小關 41~400     閘門變窄    難在**手要準**(選對邊還不夠,要真的踩上去)
//   小關 501~1200   陷阱變重    難在**失誤更貴**(踩錯一格掉的更多)
//   小關 1401 之後  勇者波變密  難在**閃的次數變多**(每 3 波一次 → 每 2 波一次)
//
// 混在一起轉的話,某一段變難了也講不出是哪一顆造成的,下次要調就只能整組亂試。
// **段與段之間刻意留空白**(401~500、1201~1400):兩顆同時在動的那幾關會變成
// 唯一一段「難度跳兩級」的地方,而那不是設計決定的,是兩條斜坡剛好重疊。
// verify 有一項在盯這件事(任何相鄰的兩關之間最多只有一顆旋鈕在動)。
//
// ## 三顆都不會破壞結構保證
//
// 完美玩家踩得準(閘門再窄也踩得到)、不吃陷阱、勇者波全清(全清就沒有武器飛過來),
// 所以三顆旋鈕對他**全部等於零**——敵人戰力照舊由理想路線推出來,「選對就一定過」不變。
// 動的只有「失誤的代價」與「要多會操作」,這正是後期該長的東西。

/** 閘門開始變窄的小關,以及窄到底的小關。 */
const GATE_NARROW_FROM = 41;
const GATE_NARROW_TO = 400;
/** 窄到底剩多寬。跑道半邊寬 0.5,所以 0.24 仍然是「站對邊再稍微對準」就踩得到。 */
export const GATE_WIDTH_MIN = 0.24;

/**
 * 這一關的閘門多寬。第 40 小關之前維持 GATE_WIDTH,之後線性收到 GATE_WIDTH_MIN。
 * **只影響「手準不準」**:站對邊而且拉到格子上的玩家永遠踩得到,窄的是容錯不是機率。
 */
export function gateWidthForStage(stage: number): number {
  const t = Math.min(1, Math.max(0, (stage - GATE_NARROW_FROM) / (GATE_NARROW_TO - GATE_NARROW_FROM)));
  return GATE_WIDTH + t * (GATE_WIDTH_MIN - GATE_WIDTH);
}

/** 陷阱開始變重的小關,以及重到底的小關。 */
const TRAP_HARSH_FROM = 501;
const TRAP_HARSH_TO = 1200;
/** 一開始/最後,三種陷阱裡最痛的那一種(勇者 x0.5)佔多少。 */
const TRAP_HALVE_WEIGHT = 0.45;
const TRAP_HALVE_WEIGHT_MAX = 0.80;

/**
 * 這一關抽到「勇者 x0.5」的機率。三種陷阱裡它最痛(一次腰斬),所以把它的比重往上推
 * 就等於把「踩錯一格」的代價往上推,而**完全不踩錯的人一點感覺都沒有**。
 */
export function trapHalveWeightForStage(stage: number): number {
  const t = Math.min(1, Math.max(0, (stage - TRAP_HARSH_FROM) / (TRAP_HARSH_TO - TRAP_HARSH_FROM)));
  return TRAP_HALVE_WEIGHT + t * (TRAP_HALVE_WEIGHT_MAX - TRAP_HALVE_WEIGHT);
}

/** 勇者波變密的起點。到這裡之後每 2 波一次(原本每 3 波)。 */
const HERO_WAVE_DENSE_FROM = 1401;

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

/**
 * 勇者從多遠開始朝一隻怪丟武器(佔視野的幾成)。
 *
 * ## 這是**演出**參數,不是難度旋鈕
 *
 * 打得倒幾隻完全由 `waveKillCount(戰力, 敵人戰力, 隻數)` 決定,跟射程、跟丟得多快
 * 一點關係都沒有。射程只決定「牠在畫面的哪個高度倒下」。
 *
 * ## 這個數字的來歷
 *
 * 最早是寫死的 260(= 視野的 81%),意思是怪一進到畫面最上緣就進入射程;而滿隊齊射
 * 打倒一隻只要 3 下 x 22ms = 67ms——**牠在冒出來的那個位置就死了**。
 * 玩家回報的「怪物永遠只顯示在畫面上方,一出現就都被消滅了」就是這個。
 *
 * 先降到 0.5(怪要走完一半畫面才挨第一下),玩家實際玩過之後定在 **0.7**:
 * 0.5 太短,勇者有很長一段時間看起來像沒在打。0.7 跟最初的 0.81 只差一點,
 * 但**現在有 ±15% 的逐隻抖動**(見 FIRE_RANGE_JITTER),所以倒下的位置是散開的一片
 * 而不是同一條線——原本那個「一冒出來就整排消失」的觀感是抖動修掉的,不只是距離。
 *
 * **緊張感歸緊張感,難度完全沒動**:打得倒幾隻由 waveKillCount 算,跟射程無關。
 * 真要調難度只有 `ENEMY_POWER_RATIO`。
 */
export const FIRE_RANGE_RATIO = 0.7;
/**
 * 每一隻各自的接戰距離抖動幅度(±15%)。
 * 沒有抖動的話整波會在同一條水平線上一隻一隻倒下,看起來像有一道看不見的牆。
 */
export const FIRE_RANGE_JITTER = 0.3;

/**
 * 這一隻要靠多近才會挨打。用雜湊不用亂數:這個判斷在每 33ms 的 tick 裡,
 * 用亂數的話同一隻會一下進射程一下出射程,武器會忽丟忽停。
 */
export function engageRange(rowIndex: number, index: number): number {
  const jitter = 1 - FIRE_RANGE_JITTER / 2 + hashFor(rowIndex, index, 41) * FIRE_RANGE_JITTER;
  return VISIBLE_AHEAD * FIRE_RANGE_RATIO * jitter;
}

// ---- 場景底圖 ----
// **一個大關一張底圖**(1-1 到 1-10 都是同一張,2-1 到 2-10 換下一張)。
// 純粹是視覺,不影響任何數值——但少了它整條跑道就是一塊深色底,
// 玩家沒有「我在往前跑」以外的任何場景感,關卡之間也長得一模一樣。
//
// 為什麼綁大關不綁小關:大關才是玩家心裡的「章節」(x-10 是魔王關,打完才換地方)。
// 綁小關的話一個章節裡場景換十次,反而讓「我還在同一個地方打」這件事消失。
// 上一版是每 2 個小關換一次配色,那個節奏對不上任何一條關卡結構的邊界。
//
// 只有 id 在這一層,圖片資源在 components/stageBackdrops.ts —— game/ 必須能在 Node
// 單獨跑,不准 import 任何 RN 資源(CLAUDE.md 的分層鐵律)。
export type BackdropId =
  | 'grass' | 'jungle' | 'sand' | 'snow' | 'darkstone'
  | 'asphalt' | 'town' | 'alley' | 'nightmarket' | 'sewer';
/** 大關順序。**這一串就是 scripts/shrink-backdrops.py 的 ORDER,兩邊要一致。** */
export const BACKDROPS: BackdropId[] = [
  'grass', 'jungle', 'sand', 'snow', 'darkstone',
  'asphalt', 'town', 'alley', 'nightmarket', 'sewer',
];
/** 大關編號 → 那個大關的底圖。用完 BACKDROPS.length 個大關就循環回第一張。 */
export function backdropForStage(stage: number): BackdropId {
  return BACKDROPS[(chapterOfStage(stage) - 1) % BACKDROPS.length];
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

// ---- 關卡結構 ----
//
//   大關 1 底下是 1-1、1-2 … 1-10,十個小關;打完 1-10 進入大關 2。
//   每個小關由「幾波敵人」組成,波與波之間夾 ENEMY_EVERY-1 排閘門。
//   小關編號是 5 的倍數(x-5、x-10)的那兩關**加倍長**,當作段落的中點與結尾。
//   x-10 同時是魔王關(BOSS_EVERY = LEVELS_PER_CHAPTER,兩者刻意對齊)。
//
// 所以一個大關的節奏是:短短短短長 短短短短長(魔王),十關剛好兩個小段落。

/** 一個大關幾個小關。 */
export const LEVELS_PER_CHAPTER = 10;
/** 總共幾個大關。 */
export const TOTAL_CHAPTERS = 300;
/**
 * 每一次轉職發生在**哪一個大關結束**(不是每 N 個小關一次)。
 *
 * 舊版是每 5 個**小關**轉一次(5/10/15/20/25),整條養成 25 關就走完了——
 * 但關卡總長是 300 大關 = 3000 小關,等於 99% 的旅程沒有任何轉職里程碑。
 *
 * 間隔逐次放大(5 → 25 → 50 → 80 → 100 個大關),因為越後期玩家的單位時間產出越高,
 * 里程碑之間拉長才維持得住「還有東西可以追」。
 *
 * ⚠ **轉職給的是「招式格」不是「倍率」。** 現在的帳:滿轉職 + 滿永久技能 = 起跑 x2.17,
 * 而容錯緩衝只有 1/ENEMY_POWER_RATIO ≈ 2.08x——**已經超支了**。曲線拉到 260 個大關之後,
 * 還想靠倍率給成長感的話平均每次只有 +15%,完全感覺不到。所以每一階解鎖的是
 * **多一款主動技能**(從 1 招到 4 招同時在轉冷卻,體感天差地遠),戰力倍率幾乎不動。
 */
export const PROMOTION_CHAPTERS = [5, 30, 80, 160, 260];

/** 目前是第幾階(通過了幾個轉職大關)。學生 = 0。 */
export function tierAtStage(stage: number): number {
  const chapter = chapterOfStage(stage);
  return PROMOTION_CHAPTERS.filter((c) => chapter > c).length;
}

/**
 * 這一關能開出哪幾款主動技能。**這就是轉職給的東西。**
 *
 * 學生(第 1~5 大關)只有 1 款,所以那 10 個技能格幾乎只能往深點——新手不用面對
 * 一整排選項,而「廣度 vs 深度」這個決策留到 1轉之後才登場。
 */
export function activeSkillCountForStage(stage: number): number {
  // 不夾 ACTIVE_SKILL_IDS.length:主動技能全部移除之後那是 0,整條階梯會被壓平。
  // 階梯本身是轉職的時程表(1/2/3/4/5 款),跟「現在有幾款可用」是兩件事——
  // 之後主動加回來就直接接得上。實際開出來幾款由呼叫端自己跟清單取交集。
  return 1 + tierAtStage(stage);
}
/** 一般小關幾波敵人。**每打完一波給一次技能選擇**,所以這個數字就是一場能挑幾次。 */
export const WAVES_PER_LEVEL = 10;
/** 加倍長的小關(編號是 5 的倍數)幾波敵人。 */
export const LONG_LEVEL_WAVES = 20;

/**
 * 一個一般小關要跑幾秒。長關是兩倍。
 *
 * 3 分鐘是刻意的:舊版一般小關只有 37~48 秒、5 次技能選擇,等於**每 9 秒被打斷一次**,
 * 玩家的原話是「好像是在選擇技能而不是在玩遊戲」。現在 10 波攤在 180 秒裡,
 * 兩次選擇之間有 18 秒,而且那 18 秒大部分是**打架**不是趕路(見下方 battleDistance)。
 */
export const TARGET_LEVEL_SECONDS = 180;

/** 第幾大關(從 1 開始)。 */
export function chapterOfStage(stage: number): number {
  return Math.floor((Math.max(1, stage) - 1) / LEVELS_PER_CHAPTER) + 1;
}
/** 在該大關裡的第幾小關(1~10)。 */
export function levelOfStage(stage: number): number {
  return ((Math.max(1, stage) - 1) % LEVELS_PER_CHAPTER) + 1;
}
/** 畫面上顯示的關卡編號,例如「2-7」。 */
export function stageLabel(stage: number): string {
  return `${chapterOfStage(stage)}-${levelOfStage(stage)}`;
}
/** 這一小關有幾波敵人。 */
export function wavesForStage(stage: number): number {
  return levelOfStage(stage) % 5 === 0 ? LONG_LEVEL_WAVES : WAVES_PER_LEVEL;
}
/**
 * 這一小關有幾排。每一波敵人前面固定墊 ENEMY_EVERY-1 排閘門,所以排數 = 波數 x ENEMY_EVERY,
 * 而且最後一排一定是敵人——小關永遠結束在一場戰鬥,不會結束在一個閘門上。
 */
export function rowsForStage(stage: number): number {
  return wavesForStage(stage) * enemyEveryForStage(stage);
}

/** 最長的小關有幾排。給查表預留長度用(取兩種節奏裡比較長的那個)。 */
export const MAX_ROWS_PER_RUN = LONG_LEVEL_WAVES * 2;
/**
 * 每隔幾排出現一排敵人:一般小關是「2 排閘門 + 1 排敵人」為一個波週期。
 *
 * **閘門總數是要被壓住的那個數字,不是排數。** 10 波 x 2 個閘門 = 20 個閘門,
 * 而閘門數量是指數的指數(CLAUDE.md:30 個閘門把放大倍率炸到 1833~4230 倍)。
 */
export const ENEMY_EVERY = 3;
/**
 * 加倍長的小關是「1 排閘門 + 1 排敵人」——**波數翻倍,閘門數不變**。
 *
 * 20 波照 3 排一波的話會是 40 個閘門,放大倍率直接爆掉,而那不是設計決定的,
 * 純粹是「路變長所以閘門變多」的副作用。改成 2 排一波之後,長關跟一般小關**同樣 20 個閘門**,
 * 它的「硬」來自敵人一波接一波(20 波)而不是數字又翻幾十倍。
 */
export const LONG_ENEMY_EVERY = 2;

/**
 * 一個波週期裡,**戰鬥段**佔多少距離。
 *
 * 這是這一版最重要的結構改動:舊版「一波 = 一排」,一瞬間結算完,所以想把關卡拉長
 * 只能塞更多排 = 更多閘門 = 膨脹爆掉。現在戰鬥段是**時間**(怪一路衝過來的那段路),
 * 排數不變、閘門不變,關卡卻可以拉到 3 分鐘——而且拉長的那段是打架,不是趕路。
 *
 * 用秒回推距離而不是寫死距離:跑速從 45 爬到 111,寫死的話後期小關會只剩一分半。
 */
export function battleSecondsPerWave(stage: number): number {
  const waves = wavesForStage(stage);
  const target = TARGET_LEVEL_SECONDS * (waves === LONG_LEVEL_WAVES ? 2 : 1);
  // **一個波週期就是整段戰鬥段。** 閘門排現在夾在戰鬥段裡面(見 rowDistances),
  // 不再另外佔一段時間,所以不用再扣 gateSeconds。
  return Math.max(2, target / waves);
}

/** 戰鬥段的距離(怪從多遠開始衝過來)。 */
export function battleDistance(stage: number): number {
  return battleSecondsPerWave(stage) * runSpeed(stage);
}

/** 這一小關每幾排一波敵人。 */
export function enemyEveryForStage(stage: number): number {
  return wavesForStage(stage) === LONG_LEVEL_WAVES ? LONG_ENEMY_EVERY : ENEMY_EVERY;
}

/** 這一排是不是敵人排。 */
export function isEnemyRowIndex(rowIndex: number, stage: number): boolean {
  return (rowIndex + 1) % enemyEveryForStage(stage) === 0;
}

/** 這一排之前總共經過幾排閘門。敵人戰力要跟「理想路線吃過幾格」對齊,靠的就是這個。 */
export function gatesBeforeRow(rowIndex: number, stage: number): number {
  return rowIndex - Math.floor(rowIndex / enemyEveryForStage(stage));
}

/**
 * 每一排落在哪個距離。**排距不再是固定的 ROW_SPACING**:
 * 閘門排之間是一排的距離(短、緊湊),敵人排前面是一整個戰鬥段(長)。
 *
 * 這就是「波與排拆開」的實作:排數(= 閘門數)不變,關卡長度靠戰鬥段拉,
 * 所以拉長關卡不會把單場的戰力膨脹一起拉大。
 */
export function rowDistances(stage: number): number[] {
  const battle = battleDistance(stage);
  const every = enemyEveryForStage(stage);
  const gateRows = every - 1;
  const out: number[] = [];
  let waveStart = LEAD_IN_DISTANCE;
  for (let i = 0; i < rowsForStage(stage); i++) {
    const slot = i % every; // 0..gateRows-1 是閘門排,最後一個是敵人排
    if (slot === gateRows) {
      out.push(waveStart + battle);
      waveStart += battle;
      continue;
    }
    // 閘門排均分在戰鬥段裡面。第一格不貼著波首、最後一格不貼著結算點:
    // 兩端各留一格的間距,所以 N 個閘門要切成 N+1 段。
    out.push(waveStart + (battle * (slot + 1)) / (gateRows + 1));
  }
  return out;
}

/** 一場跑完要幾秒(給驗證腳本量關卡長度用)。 */
export function runSeconds(stage: number): number {
  return runLength(stage) / runSpeed(stage);
}

export function createRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function initialRunState(stage: number, start: RunStart = DEFAULT_RUN_START): RunState {
  return {
    stage,
    lane: laneFromOffset(START_OFFSET),
    heroes: start.heroes,
    // 總戰力 = base x 倍率,再除以人數攤到每個人身上——所以起跑幾個人不會讓總戰力變多。
    perHero: Math.max(1, Math.round((baseAttackForStage(stage) * start.attackMultiplier) / start.heroes)),
    gear: start.gear,
    tradeRate: Math.max(BASE_TRADE_RATE, start.tradeRate),
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
 * 越大越懲罰失誤(1.0 = 一格都不能選錯),越小越寬鬆。1/ratio 就是最佳玩家的緩衝倍數。
 *
 * 掃出來的準確率曲線(第 20 關,準確率 → 過關率):
 *   100% → 100% | 95% → 85% | 90% → 63% | 85% → 46% | 80% → 27%
 * 0.25 時 90% 準確率有 83%(太鬆),0.40 時只剩 59%(太緊)。
 *
 * 「完全選對一定過關」是**結構保證**而不是掃參數的結果:敵人是照這一場實際的最佳路線
 * 算出來的(見 createRun),所以只要 ratio < 1,最佳玩家在每一排都恰好領先 1/ratio 倍。
 *
 * 這個值跟閘門幅度是綁在一起的:閘門調小,敵人自動跟著小(因為敵人照最佳路線走),
 * **難度不變,但失誤的相對代價會變**,所以每次動 GEAR_STEP / HERO_ADD_RATIO 都要重掃這個值。
 * 上一次重掃就是因為把單場膨脹從 2700 倍壓到 130 倍。
 *
 * **難度的目標是「90% 準確率 → 50% 過關」**,這個值是為了那個目標掃出來的,
 * 所以**任何會影響漏接量的改動都要回頭重掃它**。掃過兩次:
 *
 *   隻數上限 48 的時候:0.48 → 58%、0.50 → 53%、**0.51 → 50%**、0.55 → 42%
 *   隻數上限拿掉之後:  0.44 → 56%、0.46 → 54%、0.47 → 52%、**0.48 → 50%**、0.49 → 47%
 *
 * 第二次為什麼要往回掃:一波的**總戰力**不變、隻數變多 ⇒ 每一隻變弱 ⇒ 打得掉的隻數等比變多,
 * 但**漏掉的隻數也等比變多**,而損失是照漏幾隻算的。所以「隻數上限拿掉」本身就是一次
 * 難度上調(90% 從 50% 掉到 42%),不掃回來的話等於偷偷改了難度。
 *
 * 現行曲線(一般小關):100% → 100%、95% → 73%、90% → 50%、85% → 31%、80% → 18%。
 */
export const ENEMY_POWER_RATIO = 0.48;

/**
 * 第一大關刻意放寬。
 *
 * 這是玩家第一次接觸這個機制:要先看懂「閘門只有站上去才算數」「兩格一定一好一壞」
 * 「站中間什麼都吃不到」這三件事,才談得上比較好壞。用正式難度接待新手,學會之前就先死了。
 *
 * 從 EASY_RATIO 一路拉到正式值,1-1 最鬆、1-10(魔王)已經接近正式難度,
 * 進大關 2 之後就是正式值不再變動——難度的成長改由跑速接手(見 runSpeed)。
 *
 * 只動這個係數、不動閘門與跑速:跑速是「看得清楚嗎」,閘門是「選得對嗎」,
 * 這兩個是機制本身,放水會讓玩家學到錯的東西。放寬容錯是讓他有機會學,不是幫他過。
 */
export const EASY_RATIO = 0.18;

/**
 * 加倍長的小關要放寬多少。
 *
 * 長關的閘門比較多(20 個 vs 15 個),失誤是複利的,所以同樣的容錯係數下過關率會低一截——
 * 實測 90% 準確率是 56% vs 一般關的 80%。那個落差不是設計決定的,是「路比較長」的副作用。
 * 乘上這個係數把它補回來一部分:長關仍然比一般關硬(它是段落的中點與魔王關,本來就該硬),
 * 但硬的程度是選出來的,不是長度附贈的。
 */
export const LONG_LEVEL_RATIO_SCALE = 1;

export function enemyPowerRatioForStage(stage: number): number {
  const long = wavesForStage(stage) === LONG_LEVEL_WAVES ? LONG_LEVEL_RATIO_SCALE : 1;
  const chapter = chapterOfStage(stage);
  if (chapter > 1) return ENEMY_POWER_RATIO * long;
  const t = (levelOfStage(stage) - 1) / (LEVELS_PER_CHAPTER - 1);
  return (EASY_RATIO + t * (ENEMY_POWER_RATIO - EASY_RATIO)) * long;
}

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

/**
 * 「勇者 x2」每一場**固定出現幾次**,不是每格獨立去抽。
 *
 * 獨立抽的問題是離散度:15 個閘門、每格 12% 機率,運氣好的一場會抽到 4 個、壞的 0 個,
 * 而每個 x2 都是翻倍——實測同一關的單場放大量會差 2.4 倍(112x vs 270x)。
 * 玩家感覺到的不是「我選得好」而是「這場運氣好」,那跟這款「玩得好才打得贏」的前提相反。
 *
 * 固定次數之後,爆發格的**份量完全不變**(還是 x2),消失的只有「這場有沒有」的隨機性:
 * 每一場都保證有兩次翻倍的高光,只是不知道會落在第幾排。
 */
export const DOUBLE_GATES_PER_RUN = 2;
/** 爆發格佔全部閘門的比例。長關閘門比較多,要按比例給,不然長關的每格機率會被稀釋。 */
const DOUBLE_GATE_RATE = DOUBLE_GATES_PER_RUN / (WAVES_PER_LEVEL * (ENEMY_EVERY - 1));

export function doubleGatesForStage(stage: number): number {
  const totalGates = rowsForStage(stage) - wavesForStage(stage);
  return Math.max(1, Math.round(totalGates * DOUBLE_GATE_RATE));
}

/** 不是爆發格的時候,補人與補裝備的比重。兩者等值,差別只在成長方向。 */
export const GATE_WEIGHT_ADD = 0.45;
export const GATE_WEIGHT_GEAR = 0.55;

/**
 * 「勇者 +N」的 N 是理想路線在這個深度的人數的幾成。
 *
 * 為什麼跟深度綁而不是跟玩家當下的人數綁:跟玩家綁的話,同一排的兩格會互相影響
 * (吃掉 +2 之後 +4 會長成 +6),戰力浮濫。跟深度綁的話 N 在產生跑圖時就固定了,
 * 吃不吃都不會變——而且自帶追趕機制:落後的玩家拿到的 +N 相對自己是大補,
 * 領先的玩家拿到的只是零頭,成長自然收斂。
 */
export const HERO_ADD_RATIO = 0.08;

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
  // x2 現在是「每場固定幾次」,換算成每一格的期望比重才能往前推。
  const wDouble = Math.min(1, DOUBLE_GATE_RATE);
  const rest = 1 - wDouble;
  const w = GATE_WEIGHT_ADD + GATE_WEIGHT_GEAR;
  const [wAdd, wGear] = [rest * (GATE_WEIGHT_ADD / w), rest * (GATE_WEIGHT_GEAR / w)];
  const out: IdealStep[] = [];
  let heroes = 1;
  let perHero = 1;
  // 多算幾格當緩衝,免得之後把小關拉長就查表越界。
  for (let g = 0; g <= MAX_ROWS_PER_RUN + 8; g++) {
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

function pickGoodGate(rng: () => number, gateDepth: number, isDouble: boolean): GateEffect {
  if (isDouble) return { stat: 'heroes', op: 'mul', value: 2 };
  const roll = rng() * (GATE_WEIGHT_ADD + GATE_WEIGHT_GEAR);
  if (roll < GATE_WEIGHT_ADD) return { stat: 'heroes', op: 'add', value: idealStep(gateDepth).addN };
  return { stat: 'gear', op: 'add', value: 1 };
}

/** 這一場的哪幾格是爆發格。用跑圖自己的 rng,所以同一顆 seed 落點一樣。 */
function pickDoubleGateDepths(rng: () => number, totalGates: number, wanted: number): Set<number> {
  const picked = new Set<number>();
  // 第一格不當爆發格:起手只有 1 隻,x2 只是變成 2 隻,那個「翻倍」的畫面完全看不出來。
  const candidates = Array.from({ length: Math.max(0, totalGates - 1) }, (_, i) => i + 1);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const d of candidates.slice(0, wanted)) picked.add(d);
  return picked;
}

function makeGateRow(rng: () => number, stage: number, gateDepth: number, isDouble: boolean): RunNode[] {
  const good: GateEffect = pickGoodGate(rng, gateDepth, isDouble);
  const badRoll = rng();
  // 三種陷阱的痛法不一樣:x0.5 是一次腰斬(最痛)、裝備損壞打的是每人攻擊力、
  // 勇者 -N 是固定值(前期很痛、後期是零頭,自帶追趕)。舊版第三種是「血量 -30」,
  // 血量拿掉之後直接換成扣人——同一件事,少一層抽象。
  // 最痛的那一種(腰斬)的比重隨關卡往上推,見 trapHalveWeightForStage。
  // 另外兩種按原本的比例分掉剩下的,所以三種都不會消失。
  const halve = trapHalveWeightForStage(stage);
  const gearShare = (1 - halve) * 0.55;
  const bad: GateEffect =
    badRoll < halve
      ? { stat: 'heroes', op: 'mul', value: 0.5 }
      : badRoll < halve + gearShare
        ? { stat: 'gear', op: 'add', value: -1 }
        : { stat: 'heroes', op: 'add', value: -idealStep(gateDepth).addN };

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

/**
 * 一波小怪散布多長的距離。最後一隻抵達的位置就是這一排的結算點,前面的排在它前方。
 *
 * 從固定的 150 改成「整個戰鬥段」:一波要打 13 秒,怪卻擠在 150 距離內的話,
 * 玩家會看到一小撮怪衝過來、然後空等十秒——戰鬥段的長度必須真的由怪填滿。
 */
export const MONSTER_GAP = 78;
export function waveLength(stage: number, units = MAX_WAVE_SIZE): number {
  // 散布長度綁**隻數**,不是綁整個戰鬥段:3 隻怪攤在 527 距離上等於每 4.3 秒才過一隻,
  // 那不是一波敵人,是零星路過。綁隻數之後前期是短促的一陣、後期(20 幾隻)才拉成長長一串,
  // 而且密度固定——「這波比較難」看的是隻數,不是牠們排得多開。
  return Math.min(battleDistance(stage) * 0.9, Math.max(1, units) * MONSTER_GAP);
}
/**
 * 一波幾隻。**跟著理想路線的人數走**,不是跟著排數走。
 *
 * 人數變成血量之後,「漏了幾隻」直接換算成「少幾個人」,所以兩群的規模必須是同一個數量級——
 * 固定 5~9 隻的話,起跑 1 人的時候漏 5 隻是瞬間全滅,而後期滾出 50 人的時候漏 9 隻是搔癢。
 * 綁在理想人數上,完美玩家面對的永遠是「跟自己差不多大的一群」,失誤的代價在每個階段都一樣重。
 *
 * 順帶一個好處:這就是人群對撞的畫面——兩邊都是一大群,撞上去少一片。
 */
export const MIN_WAVE_SIZE = 3;
/**
 * 一波最多幾隻。
 *
 * **這不是設計上的天花板,是畫面的安全欄。** 真正需要天花板的是「吸收」那條複利迴圈,
 * 而那個上限已經搬到 `ABSORB_UNIT_CAP` 了(見那邊的說明)。這裡留一個很大的數字,
 * 只是避免哪天某個數值出錯時要求畫面畫出幾千隻怪、整個分頁當掉。
 * 正常玩到第 3000 關也碰不到它(實測終場 160 幾隻)。
 */
export const MAX_WAVE_SIZE = 400;
/**
 * 一波的隻數是理想人數的幾倍。**1 → 2 是為了打擊手感,不是為了難度**(實測過了)。
 *
 * 隻數翻倍**幾乎不會讓遊戲變難**:`absorbedFrom(units)` 也跟著翻倍,理想人數長 55%
 *(終場 62 → 96 人),敵人曲線自動追上去,90% 準確率的過關率只從 61% 掉到 57%。
 * 想調難度請轉 `ENEMY_POWER_RATIO`,不要轉這裡。
 *
 * 它真正買到的是**畫面密度**:第 12 關視野內同時 9 → 18 隻、第 102 關 4.7 → 9.5 隻。
 * 後期一波只剩四五隻在視野內的時候,火的燃燒擴散與雷的連鎖閃電經常找不到目標
 *(那兩個都是「找旁邊還站著的那幾隻」),十幾隻的時候才燒得成一片。
 *
 * **上限一定要跟著開。** 只改這個值、把 MAX_WAVE_SIZE 留在 24 的話,十波裡有六波直接封頂,
 * 難度與密度完全沒動——實測 90% 準確率 61% → 59%,等於白改。
 *
 * 投擲密度跟得上:終場 96 人的齊射倍率是 x4(volleyRate 封頂),實際 23ms 一發,
 * 一波丟得出 576 下而只需要 144 下。**注意 `fireIntervalMs` 的 90ms 下限不是真的下限**——
 * 它後面還要除以 volleyRate,只看那個常數會誤判成「打不完」。
 */
export const ENEMY_UNITS_PER_HERO = 1;
export function waveSize(idealHeroes: number): number {
  const n = Math.round(idealHeroes * ENEMY_UNITS_PER_HERO);
  return Math.min(MAX_WAVE_SIZE, Math.max(MIN_WAVE_SIZE, n));
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

/**
 * 勇者的射程寬度(offset 單位)。**站著不動只打得到跑道的一半。**
 *
 * 舊版的擊殺數跟位置完全無關(`waveKillCount(戰力, 敵人戰力, 隻數)`),所以站著不動
 * 也能把整條跑道的怪清光——使用者說的「角色都不用移動就能消滅所有怪物不合理」。
 * 加上寬度之後,散在跑道另一頭的那幾隻要**把勇者拉過去**才打得到。
 *
 * 0.75 的意思:站正中央覆蓋 [0.125, 0.875],而小怪散在 [0.08, 0.92](見 MONSTER_EDGE,
 * 散佈寬度 0.84),所以**站著不動大約蓋得到 89%**,兩端仍有一段非移動不可。
 * 一波怪是**陸續**抵達的(整個戰鬥段 18 秒),所以**完美玩家仍然掃得完全部**——
 * 這是結構保證的前提:理想路線照舊假設全清,敵人曲線一格都不用動。
 *
 * 為什麼不是 0.5:0.5 的話站著不動只覆蓋 60%,而「覆蓋率 → 過關率」那條曲線
 * 在 0.5~0.9 之間**不是單調的**(實測 0.9→96%、0.75→57%、0.5→85%),
 * 60% 會落在那段亂七八糟的區間裡,做出「半調子地掃比完全不掃還慘」的結果。
 * 拉到 0.75 之後真人的覆蓋率被推到 89% 以上,也就是曲線右端那段乾淨的部分。
 *
 * **那段非單調還沒查清楚**,只是被推出玩家會走到的範圍而已——要再往下動這個常數之前
 * 得先把它弄懂,不然又會踩回去。
 */
export const FIRE_WIDTH = 0.75;

/** 勇者站在 offset 時,打不打得到這個橫向位置的目標。 */
export function withinFireWidth(heroOffset: number, targetOffset: number): boolean {
  return Math.abs(clampOffset(heroOffset) - targetOffset) <= FIRE_WIDTH / 2;
}

/**
 * 小怪離跑道左右邊緣至少留多遠(offset 單位)。留這一段是為了整隻圖都在跑道內,
 * 不是為了難度——小怪畫 42px,在一般手機寬度上約佔 0.11,所以半個身體是 0.055。
 */
export const MONSTER_EDGE = 0.08;

/**
 * 這一隻站在跑道的哪個橫向位置。
 *
 * **不再是「挑一條跑道 + 抖動」。** 舊版是 `laneCenterOffset(lane) ± MONSTER_JITTER(0.11)`,
 * 兩條跑道的中心是 0.25 與 0.75,所以整波永遠只落在 [0.14, 0.36] 與 [0.64, 0.86] 兩塊,
 * **中間 [0.36, 0.64] 一隻都不會有**。玩家看到的是「怪明顯站左右兩側」,而且站在其中一側
 * 就能一直打同一個位置——使用者回報的「攻擊位置很單一」就是這個。
 *
 * 現在改成整條跑道均勻散開。用**黃金比例低差異序列**而不是純雜湊:
 * 純雜湊在隻數少的時候會結塊(3 隻可能全擠在左邊),而低差異序列保證任何隻數都鋪得開,
 * 同時仍然是確定值(同一排永遠長一樣,重播與驗證都對得起來)。
 * 每一排的起點由排號的雜湊決定,所以排跟排之間不會出現同一組位置。
 */
const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;
/**
 * 位置再加多少雜訊(以「平均間距」為單位)。
 *
 * 純黃金比例序列的間距是**固定的**,所以一波看久了會看出規律——每一隻都跟前一隻差
 * 同樣的距離,像一條斜線在跑。加上這一層雜訊之後間距忽寬忽窄,看起來才像一群怪
 * 各跑各的。
 *
 * 1.6 是量出來的:間距的變異係數 0.8→0.16、1.2→0.55、1.6→0.63、2.0→0.69,
 * 而覆蓋度到 2.0 都還是滿的(6 等分踩滿 6 段)。0.8 實機看起來仍然太整齊
 * (使用者回報「站位太規律」),1.6 已經明顯會結塊——而結塊正是「雜亂」該有的樣子,
 * 底層的低差異序列則保證它不會結塊到某一整段都沒有。
 */
const MONSTER_SCATTER = 1.6;
function offsetForWaveMonster(rowIndex: number, index: number, size: number): number {
  const base = hashFor(rowIndex, 0, 5);
  const spacing = 1 / Math.max(1, size);
  const noise = (hashFor(rowIndex, index, 7) - 0.5) * MONSTER_SCATTER * spacing;
  const t = ((base + index * GOLDEN_RATIO_CONJUGATE + noise) % 1 + 1) % 1;
  return MONSTER_EDGE + t * (1 - 2 * MONSTER_EDGE);
}

// 同一個雜湊源再取不同的位元,拿來決定抖動量與怪種——不另外開亂數,重播才對得起來。
function hashFor(rowIndex: number, index: number, salt: number): number {
  let h = Math.imul(rowIndex + 1, 374761393) ^ Math.imul(index + 1, 668265263) ^ Math.imul(salt + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

export function waveMonsters(
  rowIndex: number, size: number, rowDistance: number, speciesCount = 1, spread = 150,
): WaveMonster[] {
  return Array.from({ length: size }, (_, index) => {
    const offset = offsetForWaveMonster(rowIndex, index, size);
    return {
      index,
      // 跑道編號現在是**從位置推回來的**,不是先挑跑道再算位置(見 offsetForWaveMonster)。
      lane: laneFromOffset(offset),
      offset,
      speciesIndex: Math.min(speciesCount - 1, Math.floor(hashFor(rowIndex, index, 2) * speciesCount)),
      distance: rowDistance - (spread * (size - 1 - index)) / size,
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
 * 元素在「命中的那一刻」要不要觸發(冰・凍結用的骰子)。
 *
 * 跟暴擊同一個理由走雜湊不走 Math.random:這個判定在每 33ms 的 tick 迴圈裡,
 * 用亂數的話同一下會一直重抽,凍結會一格閃一格。
 */
export function procRoll(rowIndex: number, targetIndex: number, ordinal: number): number {
  return hashFor(rowIndex * 89 + targetIndex, ordinal, 23);
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

/**
 * 一波幾種怪。**1 種:提示列寫哪一隻,衝過來的就是哪一隻。**
 *
 * 早期版本是 3 種混在一起(想讓整關不要像同一隻複製貼上),但提示列只寫得下一個名字,
 * 寫的是第一種——於是玩家看到「鋼甲深海魚 x6」,畫面上卻是深海魚 + 蝙蝠 + 哥布林。
 * 那一行是玩家**唯一**能事先知道這一波是什麼的地方,它跟畫面對不上比「單調」嚴重得多。
 *
 * 變化改成跨波提供:每一波各自抽,一小關十波就有十種不同的怪,而且每一波都認得出來。
 */
export const SPECIES_PER_WAVE = 1;

// ---- 石頭(路障) ----
//
// 石頭放在**戰鬥段**——那是一整段沒有閘門的路(見 rowDistances),前幾個大關尤其空
// (第 1 關 13.6 秒的戰鬥段只有 3 隻怪,約 8 秒是純跑路,見 docs/DESIGN.md §10.6)。
// 石頭給那段路一個「要看路」的理由,而且**完全不增加閘門**——閘門數量是指數的指數
// (CLAUDE.md),想讓路上有事做絕對不能靠多塞閘門解決。
//
// ## 石頭跟閘門是兩種不同的東西,不要混
//
//   閘門 = 選擇。兩格一好一壞,一定要挑一邊,挑錯是「變弱」。
//   石頭 = 反應。它只有一顆,站哪裡都行,只要不是它那裡;撞到是「失誤」。
//
// 所以石頭不佔跑道格、不成排、也不參與 bestLane 的比較——它不是一個選項,
// 沒有「選石頭」這件事,只有「有沒有閃掉」。
//
// ## 為什麼石頭**不能**算進理想路線(這條最重要)
//
// 敵人戰力是照「這一場的最佳路線」算的(見 createRun),而最佳路線的玩家**閃得掉每一顆石頭**
// (石頭永遠只擋住跑道的一小段,見 ROCK_WIDTH)。把石頭算進去的話,敵人會為了一個
// 完美玩家根本不會付的代價而變強,真人反而更難——這跟 tradeRate 是同一條規則的第二次現身
// (見 RunState.tradeRate:抬地板不抬天花板的東西,兩邊都不准進理想路線)。
//
// 結果是結構保證原封不動:**每一排都選對、而且閃得掉石頭的玩家,領先幅度仍然恰好是
// 1/ENEMY_POWER_RATIO**。石頭只降地板,不降天花板。

export interface RunRock {
  index: number;
  /** 在跑道上的絕對位置(跟 RunRow.distance 同一個座標系)。 */
  distance: number;
  /** 橫向位置 0~1,跟勇者的 offset 同一個座標系。 */
  offset: number;
}

/**
 * 石頭的寬度(offset 單位)。**跟小怪同一個量級**——畫面上小怪是 MONSTER_SIZE(42px),
 * 在一般手機寬度上約佔 0.11,所以這裡取 0.11,視覺與判定才對得起來。
 *
 * 判定寬度要再加上勇者自己的體寬,不然會出現「圖明明擦過去了卻沒事」或反過來。
 */
export const ROCK_WIDTH = 0.11;
/** 勇者的體寬(offset 單位)。判定用,跟畫面上的 HERO_BODY_HEIGHT 對應。 */
export const HERO_HIT_WIDTH = 0.11;

/**
 * 撞到一顆石頭掉多少人。
 *
 * 用**比例**不用固定值,理由跟「勇者 x0.5」陷阱同一條:固定值在前期是滅頂、後期是零頭,
 * 而這一場的人數會從 1 滾到 100 以上。20% 在任何階段的痛感都一樣。
 */
export const ROCK_HERO_LOSS = 0.2;

/**
 * 一般小關放幾顆。**每場固定次數,不是每個戰鬥段獨立抽**——理由跟 DOUBLE_GATES_PER_RUN 一樣:
 * 獨立抽的話玩家感覺到的是「這場運氣好」,固定次數則是份量不變、隨機性只剩落點。
 */
export const ROCKS_PER_RUN_MIN = 2;
export const ROCKS_PER_RUN_MAX = 3;

/**
 * 石頭離**任何一排**(閘門排或敵人排)至少要隔這麼遠。
 *
 * 這一條原本是 VISIBLE_AHEAD(石頭要等閘門結算完才准進視野),理由是閘門是這款唯一的
 * 決策點,反應時間一秒都不能偷。**閘門排移進戰鬥段之後那個規則做不到了**:整段路上
 * 到處都是閘門,照 VISIBLE_AHEAD 算的話第 1 關根本沒有合法落點(680+320 > 830)。
 *
 * 而且「閘門與其他東西同時出現」現在是刻意的設計(見 rowDistances),所以這裡只保留
 * 最後一條底線:**不要跟任何一排在同一瞬間結算**。不隔開的話「撞上石頭 -N 人」跟
 * 「漏了 N 隻 -N 人」會同時跳出來,玩家分不清人數是被哪一件事扣掉的,兩筆懲罰疊在
 * 一起等於沒有回饋。
 */
const ROCK_ROW_CLEARANCE = 120;
/** 石頭的橫向落點範圍。不貼著最邊邊放:靠邊的石頭站另一邊就閃掉了,等於白放一顆。 */
const ROCK_OFFSET_MIN = 0.16;
const ROCK_OFFSET_MAX = 0.84;

/**
 * 這一小關放幾顆石頭。
 *
 * 長關(20 波)按比例加倍,跟 doubleGatesForStage 同一個理由:長關的路是兩倍長,
 * 顆數不跟著加的話密度就砍半,玩家在長關幾乎遇不到——「大約 2~3 顆」講的是密度不是總數。
 */
export function rocksForStage(stage: number, rng: () => number): number {
  const span = ROCKS_PER_RUN_MAX - ROCKS_PER_RUN_MIN;
  const base = ROCKS_PER_RUN_MIN + Math.round(rng() * span);
  const scale = wavesForStage(stage) / WAVES_PER_LEVEL;
  return Math.max(1, Math.round(base * scale));
}

/**
 * 產生這一場的石頭。**跟 createRun 用不同的亂數流**(跟挑怪造型同一個理由):
 * 共用一條的話,多放一顆石頭就會把後面所有閘門的內容整個位移,
 * 已經驗證過的過關率全部要重跑——而石頭刻意是不影響數值曲線的東西。
 */
export function createRocks(seed: number, stage: number): RunRock[] {
  const rng = createRng((seed ^ 0x5f356495) >>> 0);
  const distances = rowDistances(stage);

  // 候選位置 = **排與排之間的空隙**,兩端各讓出 ROCK_ROW_CLEARANCE。
  // (閘門排搬進戰鬥段之後,「一個戰鬥段一顆」已經不成立了——一個戰鬥段裡面就有好幾排。)
  const slots: { from: number; to: number }[] = [];
  let prev = LEAD_IN_DISTANCE;
  for (const d of distances) {
    const from = prev + ROCK_ROW_CLEARANCE;
    const to = d - ROCK_ROW_CLEARANCE;
    // 空隙太窄就跳過。放不下的時候寧可少一顆,也不要跟某一排同時結算。
    if (to > from) slots.push({ from, to });
    prev = d;
  }
  if (slots.length === 0) return [];

  // 洗牌之後取前幾個:同一個戰鬥段不會放到兩顆(擠在一起等於一顆比較胖的石頭)。
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const wanted = Math.min(slots.length, rocksForStage(stage, rng));
  return slots
    .slice(0, wanted)
    .map((slot) => ({
      distance: slot.from + rng() * (slot.to - slot.from),
      offset: ROCK_OFFSET_MIN + rng() * (ROCK_OFFSET_MAX - ROCK_OFFSET_MIN),
    }))
    // 依距離排序再重新編號:畫面與碰撞都是照「跑到哪了」在找下一顆,亂序會找錯。
    .sort((a, b) => a.distance - b.distance)
    .map((rock, index) => ({ index, ...rock }));
}

/** 勇者站在 offset 時會不會撞上這顆石頭。兩個體寬各算一半。 */
export function hitsRock(offset: number, rock: RunRock): boolean {
  return Math.abs(clampOffset(offset) - rock.offset) < (ROCK_WIDTH + HERO_HIT_WIDTH) / 2;
}

/**
 * 只剩 1 個人的時候撞到石頭的回饋文字。
 *
 * 畫面要拿它判斷「這次沒扣到東西,但也不是好事」——heroDelta 是 0,光看數字會被當成
 * 中性的好結果而畫成綠色。跟 MISS_MESSAGE 是同一個坑,原因也一樣。
 */
export const ROCK_GRAZE_MESSAGE = '撞上石頭';

/**
 * 撞上石頭:掉 ROCK_HERO_LOSS 的人。
 *
 * **下限是 1,石頭撞不死人**——跟閘門同一條規則(見 applyGate):死亡只發生在
 * 「怪撞上來換掉最後一個人」那一刻,那才看得懂發生了什麼事。被一顆路邊的石頭
 * 直接結束一場,玩家只會覺得是 bug。
 *
 * **但只要還有 2 個人以上,就至少掉 1 個**:20% 在 2~4 人的時候 round 完是 0,
 * 玩家會看到「撞上石頭」卻什麼都沒發生,直接認定判定是壞的。這跟 applyRunSkillPick
 * 保證「增殖至少 +1 人」是同一條規則的反面——有感的回饋比精確的百分比重要。
 */
export function applyRockHit(state: RunState): RowResolution {
  const before = totalAttack(state);
  const next = { ...state };
  const scaled = Math.round(next.heroes * (1 - ROCK_HERO_LOSS));
  // 夾在 [1, 原本人數 - 1]:撞不死人,但撞得到的時候一定看得出來。
  next.heroes = Math.max(1, Math.min(scaled, next.heroes - 1));
  const lost = state.heroes - next.heroes;
  return {
    state: next,
    message: lost > 0 ? `撞上石頭 -${lost} 人` : ROCK_GRAZE_MESSAGE,
    heroDelta: -lost,
    attackDelta: totalAttack(next) - before,
  };
}

/** 這一排是不是大魔王:魔王關的最後一排敵人。 */
/**
 * 精英排:每一小關的**中點**放一隻大的。
 *
 * 3 分鐘的小關如果十波都是同一種節奏,中段會很平。放一隻「大而慢」的在中點,
 * 整關就有了一個高潮:牠一隻抵一群(leakCost),要多打幾下才倒(hitsPerUnit),
 * 所以牠會在畫面上待很久——玩家有時間看清楚、有時間決定要不要硬吃。
 */
export function isEliteRow(stage: number, rowIndex: number): boolean {
  if (!isEnemyRowIndex(rowIndex, stage) || isBossRow(stage, rowIndex)) return false;
  const waveIndex = Math.floor(rowIndex / enemyEveryForStage(stage));
  return waveIndex === Math.floor(wavesForStage(stage) / 2) - 1;
}

/** 精英一隻抵幾隻小怪(同時是牠的 leakCost 與體型倍率的依據)。 */
export const ELITE_MASS = 6;
/** 精英要挨幾下才倒。介於小怪 3 下與魔王 12 下之間。 */
export const ELITE_HITS = 6;

/** 勇者波:每隔幾波來一次。太密會變成另一個遊戲,太疏又形同不存在。 */
export const HERO_WAVE_EVERY = 3;
/**
 * 勇者波的屬性走另一條雜湊。
 *
 * 關卡前會把整關的屬性順序公開(押注才成立),但勇者波刻意不公開——用同一條雜湊的話,
 * 玩家看得到前後兩波就等於也看得到它。分一條 salt,提示列就能誠實地標「?」。
 */
export const HERO_WAVE_ELEMENT_SALT = 0x51ed270b;

/**
 * 這一關每一波是什麼屬性,給「進關卡前的提示」用。
 *
 * `hidden` 的那幾波是勇者波:屬性照抽,但這裡不揭曉(見 HERO_WAVE_ELEMENT_SALT)。
 * 純函式、不需要 seed——屬性只跟排號有關,所以主介面在還沒開跑之前就算得出來。
 */
export function waveElementsForStage(stage: number): { element: RunSkillId; hidden: boolean; boss: boolean }[] {
  const out: { element: RunSkillId; hidden: boolean; boss: boolean }[] = [];
  for (let rowIndex = 0; rowIndex < rowsForStage(stage); rowIndex++) {
    if (!isEnemyRowIndex(rowIndex, stage)) continue;
    const hidden = isHeroWaveRow(stage, rowIndex);
    out.push({
      element: elementForRow(rowIndex, hidden ? HERO_WAVE_ELEMENT_SALT : 0),
      hidden,
      boss: isBossRow(stage, rowIndex),
    });
  }
  return out;
}
/** 一發砸多寬(offset 單位)。跑道總寬 1,閘門是 0.34,所以這個要比閘門窄一點才閃得掉。 */
export const HAZARD_WIDTH = 0.26;

/**
 * 被武器打中一下扣幾個人。**固定值,而且一波不設上限。**
 *
 * 舊版是「一波最多扣一次,扣掉當時人數的兩成」。比例值有一個講不通的地方:
 * 你滾出 137 人的時候被砸一下要掉 27 個,而那一下跟只有 3 個人時被砸的是同一把武器。
 * 改成固定 1 個之後,「被打到」在整場的意義是一致的——**一把武器換一個人**。
 *
 * 代價是它在前期很重(3 個人的時候被打兩下就掉三分之二),所以投擲頻率要跟著放慢
 * (見 ENEMY_THROW_INTERVAL_MS)。這兩個數字必須一起看:一個是單次的痛,
 * 一個是一波會痛幾次。
 */
export const HAZARD_LOSS_HEROES = 1;

/**
 * 輪到的那幾個人多久丟一次(毫秒)。**放在這裡而不是 hook**,因為模擬器也要用它
 * 換算「一波會被打幾下」——兩邊各寫一份的話,難度曲線量到的就不是玩家經歷的那件事。
 *
 * 從 620ms 放慢到這個值,是因為傷害改成「每一下都算、不設上限」:
 * 戰鬥段有 14~17 秒,620ms 一發代表站著不動會被打二十幾下,那不是難是直接出局。
 */
export const ENEMY_THROW_INTERVAL_MS = 1800;

/**
 * 站在危險線上的人,一波大概會被打中幾下。
 *
 * 遊戲裡是逐發判定(武器飛到你身上才算),但**模擬器沒有時間軸**——它一排只結算一次。
 * 所以模擬器改用這個期望值,而它是用**跟遊戲同一組常數**算出來的:
 * 戰鬥段幾秒 ÷ 投擲間隔 x「你的位置剛好在危險線上的比例」。
 *
 * HAZARD_COLUMN_ODDS 是實測值:同時只有 ACTIVE_THROWERS(2)條線危險,一條寬 0.26,
 * 而站著不動的人有大約這個比例的時間落在其中一條上。
 */
const HAZARD_COLUMN_ODDS = 0.45;
export function expectedHazardHits(stage: number): number {
  const throwsPerWave = battleSecondsPerWave(stage) / (ENEMY_THROW_INTERVAL_MS / 1000);
  return Math.max(1, Math.round(throwsPerWave * HAZARD_COLUMN_ODDS));
}

/**
 * 幾波來一次勇者波。第三段的旋鈕:到 HERO_WAVE_DENSE_FROM 之後從每 3 波變每 2 波,
 * 「要閃的次數」多一半。全清的人照樣一發都不用閃,所以它一樣不進理想路線。
 */
export function heroWaveEveryForStage(stage: number): number {
  return stage >= HERO_WAVE_DENSE_FROM ? HERO_WAVE_EVERY - 1 : HERO_WAVE_EVERY;
}

/** 這一排是不是勇者波(精英與魔王優先,不重疊)。 */
export function isHeroWaveRow(stage: number, rowIndex: number): boolean {
  if (!isEnemyRowIndex(rowIndex, stage) || isEliteRow(stage, rowIndex) || isBossRow(stage, rowIndex)) return false;
  const waveIndex = Math.floor(rowIndex / enemyEveryForStage(stage));
  return waveIndex > 0 && waveIndex % heroWaveEveryForStage(stage) === 0;
}

/**
 * 同一個瞬間最多幾個人在丟。
 *
 * **這個上限就是「還閃得掉」的保證。** 每個人的落點寬 HAZARD_WIDTH(0.26),
 * 兩個人最多蓋掉 0.52,跑道永遠留得下一段空的;放開讓十幾個人同時丟的話,
 * 整條跑道會被蓋滿,閃避就從「看得懂就躲得掉」變成「站哪都會被打」——
 * 那不只是難,而是**理想玩家也躲不掉**,敵人曲線的結構保證會跟著失效。
 *
 * 「每個人都要丟」靠的是**輪流**(見 activeThrowers):活著的人輪著上場,
 * 所以一波打下來每個人都丟過,但任何一個瞬間都只有兩條線是危險的。
 */
export const ACTIVE_THROWERS = 2;

/**
 * 勇者波最多幾個敵人。
 *
 * 一般波的隻數是**打擊手感**的旋鈕(多幾隻只是畫面密度,吸收也跟著長,難度幾乎不動);
 * 勇者波不是——**每一個還站著的敵人都在丟武器**,所以隻數直接換算成畫面上有幾條要閃的線。
 * 沒有上限的話第 1 關最後一波是 180 個勇者同時在丟,玩家看到的是一整片,
 * 分不出哪裡是安全的(使用者回報的「會攻擊的瞬間一大片」)。
 *
 * 24 是「還數得出來、也還看得出空隙」的量。ACTIVE_THROWERS 已經限制了**同時**只有
 * 兩條線是危險的,這個上限管的是**畫面上有多少個在動的敵人**——兩者管不同的事。
 */
export const MAX_HERO_WAVE_UNITS = 24;
/** 輪到下一組投擲者要多久(毫秒)。太短會像亂數閃爍,太長會變成只有固定那兩個人在丟。 */
export const THROWER_ROTATE_MS = 1400;

/**
 * 這個瞬間輪到誰丟。`alive` 是還站著的人的索引(由呼叫端給,因為「誰還活著」是即時的)。
 * 用輪替而不是抽籤:抽籤會出現同一個人連續被抽中,而其他人整波都沒動過。
 */
export function activeThrowers(alive: number[], slot: number): number[] {
  if (alive.length === 0) return [];
  const n = Math.min(ACTIVE_THROWERS, alive.length);
  return Array.from({ length: n }, (_, j) => alive[(slot * n + j) % alive.length]);
}

/**
 * 這一波的武器落在哪。**每一個還沒被打倒的勇者都在丟,落點就是他站的那一條線。**
 *
 * ## 為什麼是「還沒被打倒的」而不是固定一個人
 *
 * 舊版是「排一產生就選好一個投擲者」,於是有兩個講不通的地方:一是一整波二十個勇者
 * 只有一個在動,看起來像其他人只是背景;二是**被你打倒的人照樣在丟**——你打死他了,
 * 武器還是從他站的位置掉下來。
 *
 * 改成「活著的人都在丟」之後,這一波的威脅剛好等於「你沒打完的部分」:
 *
 *   - 全清 ⇒ 一發都沒有 ⇒ **完美玩家完全不受影響**,所以它照樣不進理想路線
 *   - 漏了 k 個 ⇒ 那 k 條線都危險 ⇒ 越打不動,能站的地方越少
 *
 * 這跟「打不完就會被撞」是同一件事的兩種說法,只是勇者波的版本**可以靠位置閃掉**——
 * 這正是勇者波跟小怪波的差別:小怪波拚戰力,勇者波拚戰力**加上**站對地方。
 *
 * ## 還躲得掉嗎
 *
 * 躲得掉,但會越來越窄:一條線寬 HAZARD_WIDTH(0.26),survivors 少的時候空隙很大,
 * 多到一定程度就整條跑道都被蓋住——那時候你本來也已經輸了。
 * 幅度因此從 0.25 降到 0.14(見 HAZARD_LOSS_RATIO)。
 *
 * survivors 用「前 kills 個倒下」這個約定(跟畫面的 isDown 同一條),所以還站著的是
 * 索引 kills..size-1。offset 直接取 waveMonsters 的同一組,邏輯與畫面是同一個算式,
 * 不會有「看起來閃掉了卻還是被砸中」。
 */
export function hazardsFor(rowIndex: number, size: number, survivors: number): { from: number; to: number }[] {
  const total = Math.max(1, size);
  const alive = Math.max(0, Math.min(total, survivors));
  if (alive <= 0) return [];
  // 只要 offset,距離與怪種在這裡用不到,所以 rowDistance/spread 給 0。
  const monsters = waveMonsters(rowIndex, total, 0, 1, 0);
  // **同時只取 ACTIVE_THROWERS 條線。** 遊戲裡本來就是輪流丟(見 activeThrowers),
  // 這裡以前卻把「所有還活著的人」全部當成同時在丟,兩邊的模型不一致。
  //
  // 站位改成雜亂之後這個不一致才浮出來:落點散得開,11 個活口的線就蓋滿整條跑道,
  // 站哪裡都會被打——**理想玩家也閃不掉**,而「閃得掉」正是勇者波的難度校準前提
  // (CLAUDE.md:同時投擲的人數上限就是「還閃得掉」的保證)。取最靠近勇者的那幾個:
  // 他們是下一個會出手的人,跟畫面上看到的那幾條線對得起來。
  return monsters.slice(total - alive).slice(-ACTIVE_THROWERS).map((m) => ({
    from: m.offset - HAZARD_WIDTH / 2,
    to: m.offset + HAZARD_WIDTH / 2,
  }));
}

/** 站在 offset 會不會被砸中。 */
export function hitByHazard(offset: number, hazards: { from: number; to: number }[] = []): boolean {
  const at = clampOffset(offset);
  return hazards.some((h) => at >= h.from && at <= h.to);
}

function isBossRow(stage: number, rowIndex: number): boolean {
  return isBossStage(stage) && rowIndex === lastEnemyRowIndex(stage);
}

/** 最後一排敵人的索引。排數 = 波數 x ENEMY_EVERY,所以最後一排永遠是敵人。 */
export function lastEnemyRowIndex(stage: number): number {
  return rowsForStage(stage) - 1;
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

function makeEnemyRow(
  rng: () => number, stage: number, rowIndex: number, idealAttack: number, idealHeroes: number,
): RunNode[] {
  const boss = isBossRow(stage, rowIndex);
  const power = Math.max(1,
    Math.round(idealAttack * enemyPowerRatioForStage(stage) * (boss ? BOSS_POWER_MULTIPLIER : 1)));
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
      // 魔王也有屬性,而且**它是最值得押注的一格**:同一關的魔王永遠是同一隻、
      // 同一個屬性,關卡前就看得到——「這關結尾是土,值得花一格點木」。
      element: elementForRow(rowIndex),
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
  const elite = isEliteRow(stage, rowIndex);
  const heroWave = isHeroWaveRow(stage, rowIndex);
  // 精英是「同樣的一波戰力,壓縮成少少幾隻」——總戰力不變,所以難度曲線完全不受影響,
  // 變的只有「擋不下來的時候一次掉多少人」以及畫面上的體感。
  const units = elite
    ? Math.max(1, Math.round(waveSize(idealHeroes) / ELITE_MASS))
    : heroWave
      // **勇者波另外設上限。** 一般波多幾隻只是視覺密度,勇者波不一樣:每一個還站著的
      // 敵人都在丟武器(見 hazardsFor),所以隻數直接換算成「畫面上同時有幾條武器線」。
      // 沒有上限的話第 1 關最後一波是 180 個勇者一起丟,那不是難,是看不出哪裡安全。
      ? Math.min(MAX_HERO_WAVE_UNITS, waveSize(idealHeroes))
      : waveSize(idealHeroes);
  const enemy: EnemyEffect = {
    power,
    reward: Math.round(power * (elite ? 0.6 : 0.4)),
    species: elite ? [species[0]] : species,
    name: species[0].name,
    units,
    ...(elite ? { elite: true, leakCost: ELITE_MASS, hitsPerUnit: ELITE_HITS } : {}),
    ...(heroWave ? { heroWave: true, rowIndex } : {}),
    // 一波怪共用一個屬性(不是一隻一個)——三種造型同一個顏色,一眼就分得出這波是什麼。
    // **勇者波走另一條 salt**:對面是勇者不是怪,屬性另外抽,而且關卡前的提示不公開它,
    // 所以每三波就有一波沒辦法事先押注,只能靠通用技能扛。
    element: elementForRow(rowIndex, heroWave ? HERO_WAVE_ELEMENT_SALT : 0),
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
  const distances = rowDistances(stage);
  // 最佳路線的模擬狀態。跟 RunState 一樣是「人數 x 每人攻擊力」,起手 1 人。
  let idealHeroes = 1;
  let idealPerHero = baseAttackForStage(stage);
  // 先決定這一場的爆發格落在第幾格,再一路產生——每場保證固定次數,不靠運氣。
  const rows_ = rowsForStage(stage);
  const totalGates = rows_ - Math.floor(rows_ / enemyEveryForStage(stage));
  const doubleDepths = pickDoubleGateDepths(rng, totalGates, doubleGatesForStage(stage));
  // 打完一波會給場內技能,理想路線必須把它算進去——不算的話玩家會越跑越超前敵人,
  // 領先幅度一路膨脹,ENEMY_POWER_RATIO 的結構保證就破了。反過來只算敵人側也會壞
  // (實測領先幅度掉到 0.50x,連最佳玩家都過不了關),兩側一定要同時改。
  //
  // 用的是「這一場真正會開出來的選項」(runSkillOffersAt 綁 seed),不是一條平均曲線:
  // 四選三會漏掉一個,漏掉最該點的那次,玩家就走不到平均曲線上(實測領先幅度漂到 1.41~2.70x)。
  const totalWaves = wavesForStage(stage);
  let waveIndex = 0;
  let skillOrdinal = 0;
  let idealSkills: RunSkillState[] = [];
  for (let i = 0; i < rows_; i++) {
    const isEnemy = isEnemyRowIndex(i, stage);
    if (isEnemy) {
      rows.push({
        index: i,
        distance: distances[i],
        nodes: makeEnemyRow(artRng, stage, i, idealHeroes * idealPerHero, idealHeroes),
      });
      // 理想玩家一定全清,所以一定吃到吸收——這條**必須**同步,不然玩家會越跑越超前敵人
      // (跟場內技能同一個道理,見 laneRunSkills 的「兩側必須同時算」)。
      const cleared = rows[rows.length - 1].nodes[0].enemy!;
      idealHeroes += absorbedFrom(cleared.units, cleared.leakCost);
      // 這一波之後玩家會拿到幾次選擇,理想路線照「每次都挑最能加戰力的」同步吃下去。
      // 人數與每人攻擊力分開乘,不是通通乘在戰力上:「勇者 +N」是固定值,
      // 人數被增殖拉高之後,後面每一格 +N 相對就變小了——合成一個數字會漏掉這層互動。
      const picks = runSkillPicksForWave(waveIndex, totalWaves);
      for (let k = 0; k < picks; k++) {
        const offers = runSkillOffersAt(idealSkills, seed, skillOrdinal, activeSkillCountForStage(stage));
        skillOrdinal += 1;
        if (offers.length === 0) break;
        const choice = bestRunSkillChoice(idealSkills, offers);
        // 兌換率刻意不進理想路線:理想玩家不漏接、碰不到怪,兌換率對他是零效益。
        // 算進去的話敵人會為了一個沒人用得到的東西變強,真人反而更難(見 RunState.tradeRate)。
        const grown = applyRunSkillPick(idealSkills, choice, {
          perHero: idealPerHero, heroes: idealHeroes, tradeRate: BASE_TRADE_RATE,
        });
        idealSkills = learnRunSkill(idealSkills, choice);
        idealPerHero = grown.perHero;
        idealHeroes = grown.heroes;
      }
      waveIndex += 1;
      continue;
    }
    const depth = gatesBeforeRow(i, stage);
    const nodes = makeGateRow(rng, stage, depth, doubleDepths.has(depth));
    // 好的那格就是「不是陷阱」的那格——兩格固定一好一壞,所以這樣認得出來。
    const good = nodes.find((n) => n.gate && !isTrapGate(n.gate))!.gate!;
    if (good.stat === 'heroes') {
      idealHeroes = good.op === 'mul' ? idealHeroes * good.value : idealHeroes + good.value;
    } else if (good.stat === 'gear') {
      // **跟 applyGate 用同一個取整**:理想路線用浮點、玩家用 Math.round 的話,
      // 二十個閘門累積下來領先幅度會漂到 ±6%,結構保證就只剩「大概」。
      idealPerHero = Math.max(1, Math.round(idealPerHero * Math.pow(GEAR_STEP, good.value)));
    }
    rows.push({ index: i, distance: distances[i], nodes });
  }
  return rows;
}

export function runLength(stage: number): number {
  // 最後一排(一定是敵人)之後再留一小段,不然剛打完就瞬間結算,看起來像被切掉。
  const d = rowDistances(stage);
  return d[d.length - 1] + ROW_SPACING;
}

// ---- 結算 ----
export interface RowResolution {
  state: RunState;
  /** 給畫面用的一句話回饋 */
  message: string;
  /** 人數變化。負的就是被撞掉了——這一版沒有血量,扣人就是扣血。 */
  heroDelta: number;
  attackDelta: number;
}

export function applyGate(state: RunState, gate: GateEffect): RunState {
  const next = { ...state };
  if (gate.stat === 'heroes') {
    next.heroes = gate.op === 'mul' ? next.heroes * gate.value : next.heroes + gate.value;
    // **閘門的人數下限是 1,碰撞才可以歸零。** 連吃幾次減半會趨近 0,被閘門直接扣死
    // 不是懲罰是卡死;死亡要發生在「怪撞上來換掉最後一個人」那一刻,那才看得懂發生了什麼事。
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
  }
  return next;
}

/**
 * 閘門上要印什麼字。數字在產生跑圖時就定好了,所以不需要知道玩家當下有幾隻。
 *
 * 「勇者 +N」印的是具體人數(「勇者 +8」)而不是百分比——玩家在 1 秒內要跟隔壁格比大小,
 * 百分比得先在腦子裡換算一次,具體數字才比得動。
 */
/**
 * 閘門上的字。
 *
 * 人數那一類寫「數量」不寫「勇者」:玩家操作的那一群是**史萊姆**,而「勇者」在這款
 * 另有所指——勇者波的敵人才是勇者(見 isHeroWaveRow)。同一個詞指兩邊會讓
 * 「勇者 +1」看起來像在幫敵人加人。
 */
export function gateLabel(gate: GateEffect): string {
  if (gate.stat === 'gear') return gate.value >= 0 ? '裝備強化' : '裝備損壞';
  if (gate.op === 'mul') return `數量 x${gate.value}`;
  return `數量 ${gate.value >= 0 ? '+' : ''}${gate.value}`;
}

/**
 * 漏接的回饋文字。畫面要拿它判斷「這次不是好事也不是壞事」——漏接的 hpDelta/attackDelta
 * 都是 0,光看數字會被當成中性的好結果而畫成綠色,實際上是「你什麼都沒吃到」。
 */
export const MISS_MESSAGE = '沒碰到';

/**
 * 撞上一波敵人:**人群對撞,按兌換率互換**。
 *
 *   kills  = 你的戰力打得掉幾隻(waveKillCount,跟畫面上倒下的隻數是同一個數字)
 *   leaked = 打不掉的,牠們會衝到勇者身上
 *   lost   = ceil(leaked / tradeRate)  換掉幾個勇者
 *
 * 舊版是「戰力差額直接換算成傷害扣血」。改成互換的三個理由:
 *   1. 看得見——螢幕上真的少掉幾隻史萊姆,不是 HUD 上一個數字變小
 *   2. 失誤會複利——被換掉的人下一波就不在了,戰力跟著掉,這是這款要的張力
 *   3. 少一個資源——人數同時是戰力與生命,玩家腦子裡只要算一件事
 *
 * **人數在這裡可以歸零**(閘門不行,見 applyGate):死亡發生在「最後一個人被換掉」那一刻。
 */
/**
 * 這一波帶進來的額外效果:主動技能(見 laneRunSkills 的 ActiveTrigger)+ 八元素。
 *
 * **八元素刻意全部只在「已經失誤了」的路徑上生效**——燒掉/穿透/連鎖只在你打不完時
 * 才減少漏接,再生只補「已經失去的」,吸取只吸漏過來的,復活只在歸零時。
 * 完美玩家全清不漏,八個一個都碰不到,所以它們全部**不進理想路線**:
 * 敵人不會為了一個沒人用得到的東西變強(跟兌換率、主動技能同一個形狀)。
 */
export interface WaveBoost {
  /**
   * 這裡**沒有相剋倍率**,而且是刻意的。相剋是逐元素的(剋中 x2.5、被剋 x2/3),
   * 所以放大與削弱在 runSkillEffects(skills, waveElement) 那一層就結算完了,
   * 傳到這裡的每一個數字都已經是「這一波實際生效的量」。
   *
   * 早期版本在這裡放過一個 counter 純量,結果是主動技能也被一起放大——
   * 帶對屬性等於整體 x2.5。純量會誘發這種錯誤,所以連欄位都不留。
   */
  /** 額外清掉幾隻(火・燃燒 + 主動) */
  kills?: number;
  /** 額外清掉整波的幾成(金・穿透 + 貫穿) */
  killRatio?: number;
  /** 額外清掉「自己打倒的隻數」的幾成(雷・連鎖) */
  chainRatio?: number;
  /** 額外補幾個勇者(號令) */
  heroes?: number;
  /** 補回幾個「這一場已經失去的人」(木・再生),上限是實際失去的數量 */
  regen?: number;
  /** 這一場到目前為止總共失去幾個人(給 regen 當上限用) */
  lostSoFar?: number;
  /** 這一波的損失少扣幾個人(土・遲滯:怪衝得慢,撞上來的比較少) */
  lossCut?: number;
  /**
   * 這一波有幾隻**曾經進到射程寬度內**(見 FIRE_WIDTH)。擊殺數會被它夾住:
   * 打不到的那幾隻,戰力再高也清不掉。
   *
   * 不給 = 不限制(舊行為)。完美玩家掃得完整條跑道,所以他的 coveredUnits 等於總隻數,
   * 理想路線一格都不用動——這是結構保證沒被這條規則破壞的原因。
   */
  coveredUnits?: number;
  /** 這一波的損失全擋下來(土・護盾 + 壁障) */
  immune?: boolean;
  /**
   * 勇者波的投擲傷害「已經在跑圖途中結算過了」。
   *
   * 遊戲裡武器是一路飛過來的,打到你的那一刻就該扣人——不能等到這一排結算才扣,
   * 不然玩家看著武器穿過身體卻什麼都沒發生(使用者回報的「被攻擊到沒有任何負面效果」)。
   * 所以 hook 在命中的當下就自己套用一次,並帶著這個旗標告訴 resolveEnemy 別再算一次。
   *
   * **模擬器不設這個旗標**,它沒有時間軸,照舊在結算的那一刻算——兩邊的規則與幅度
   * 完全一樣(同一個 HAZARD_LOSS_RATIO、同一組 hazardsFor),一波最多扣一次,
   * 所以難度曲線量到的東西跟玩家實際經歷的是同一件事。
   */
  hazardResolved?: boolean;
}

/**
 * 這一波額外清掉幾隻(主動技能與元素給的,不含自己的戰力)。
 *
 * **匯出給畫面用,不要在別的地方再寫一份。** 跑圖途中的演出(小怪一隻一隻倒下)
 * 跟這一排的結算必須是同一個數字:各寫一份的話,畫面上倒了 9 隻、結算卻算 8 隻,
 * 玩家會看到「明明都打完了還是漏了一隻」——而那是最難查的一種不一致,
 * 因為兩邊分開看都完全合理。
 */
export function extraKills(enemy: EnemyEffect, boost: WaveBoost, own: number): number {
  return Math.max(0, boost.kills ?? 0)
    + Math.ceil(enemy.units * Math.max(0, boost.killRatio ?? 0))
    + Math.ceil(own * Math.max(0, boost.chainRatio ?? 0));
}

export function resolveEnemy(
  state: RunState, enemy: EnemyEffect, boost: WaveBoost = {}, offset?: number,
): RowResolution {
  const at = offset ?? laneCenterOffset(state.lane);
  // 勇者波:**還沒被打倒的人才在丟**,所以要先算出你打倒了幾個,落點才知道有哪幾條。
  // 全清 ⇒ 一發都沒有 ⇒ 完美玩家完全不受影響,它照樣不進理想路線。
  // 閃掉也完全沒事;沒閃掉就削掉一部分隊伍——不是全滅,勇者是一群、散開有寬度。
  const heroWaveHazards = enemy.heroWave && !boost.immune && !boost.hazardResolved
    ? (() => {
        const own = waveKillCount(totalAttack(state), enemy.power, enemy.units);
        const killed = Math.min(enemy.units, own + Math.floor(extraKills(enemy, boost, own)));
        return hazardsFor(enemy.rowIndex ?? 0, enemy.units, enemy.units - killed);
      })()
    : [];
  if (heroWaveHazards.length > 0 && hitByHazard(at, heroWaveHazards)) {
    // 模擬器路徑:一波扣「期望被打中的次數」x 每下 1 個人。
    // 遊戲裡是逐發扣的(見 useLaneRun 的 EnemyShot),兩邊用同一組常數換算。
    const hit = Math.max(0, expectedHazardHits(state.stage) * HAZARD_LOSS_HEROES);
    if (hit <= 0) return resolveEnemy(state, { ...enemy, heroWave: false }, boost, at);
    const struck = { ...state, heroes: Math.max(0, state.heroes - hit) };
    if (struck.heroes <= 0) {
      struck.phase = 'dead';
      return { state: struck, message: `被武器砸中 -${hit} 人`, heroDelta: -hit, attackDelta: 0 };
    }
    // 砸中之後這一波照樣要打——傷害是額外的,不是取代。
    const after = resolveEnemy(struck, { ...enemy, heroWave: false }, boost, at);
    return {
      ...after,
      message: `被武器砸中 -${hit} 人`,
      heroDelta: after.heroDelta - hit,
    };
  }
  // 主動技能加在 kills 上而不是加在戰力上:固定效果才有「越落後越有用」的性質,
  // 而且理想玩家本來就全清,對他等於零——所以它不進理想路線,也就不會把敵人養大。
  // 相剋已經在 runSkillEffects 那一層逐元素結算過了,這裡拿到的就是最終值。
  const own = waveKillCount(totalAttack(state), enemy.power, enemy.units);
  // 射程寬度:**打不到的那幾隻,戰力再高也清不掉**(見 FIRE_WIDTH)。
  // coveredUnits 是「這一波有幾隻曾經進到射程內」,由跑圖端逐隻累積(見 useLaneRun),
  // 模擬器則用覆蓋率估。沒給就是不限制(舊行為),這樣單元測試與既有呼叫都不受影響。
  const covered = Math.min(enemy.units, Math.max(0, boost.coveredUnits ?? enemy.units));
  const kills = Math.min(covered, own + Math.floor(extraKills(enemy, boost, own)));
  //
  // **打不到的那幾隻不算漏接。**
  //
  // 它們既不扣人也不給吸收,就是從旁邊跑掉了——懲罰是「少賺」不是「掉人」。
  // 算成漏接的話會做出一道懸崖而不是斜坡:吸收是全有全無的(下面的 leaked === 0),
  // 所以只要有一隻打不到,「擊倒 +2 人」當場變成「漏了 1 隻 -1 人」,一波三個人的落差,
  // 十幾波複利下來就是死。實測覆蓋率 98% 還有 98% 過關,95% 直接掉到 0%——
  // 那不是「掃得越勤越好」,是「覆蓋 99% 以上否則死」。
  //
  // 現在 leaked 只算**打得到卻沒打掉的**(戰力壓不過的那部分),那才是真正的失誤。
  const leaked = Math.max(0, covered - kills);
  const missed = Math.max(0, enemy.units - covered);
  const next = { ...state };
  // 打倒的怪有一部分加入隊伍。放在「漏 0」那條路徑上而不是照 kills 給:
  // 半殘的一波已經在扣人了,再補回來會讓「擋不住」這件事變得模糊。
  // 木・再生:只補得回「已經失去的」,沒失去就沒得補——所以完美玩家拿它等於零。
  const regen = Math.min(Math.floor(Math.max(0, boost.regen ?? 0)), Math.max(0, boost.lostSoFar ?? 0));
  const rallied = Math.max(0, boost.heroes ?? 0) + regen;
  // **吸收要求「整波都清掉」,不是「射程內的都清掉」。**
  //
  // 中間試過「射程內清完就給吸收」,結果方向整個反了:打不到的怪不扣人,所以掃得越少
  // 反而越安全,實測覆蓋率 0.5 的過關率(72%)比全掃(55%)還高——站著不動變成最優解,
  // 那跟這一整條規則要達成的事正好相反。
  //
  // 現在是:掃不到的那幾隻**不扣你人,但會讓這一波不算全清**,所以整波的吸收都拿不到。
  // 懲罰因此是「成長變慢」而不是「當場掉人」——斜坡不是懸崖,而且方向是對的:
  // 掃得越勤,滾出來的隊伍越大。
  const sweptAll = covered >= enemy.units;
  if ((leaked === 0 && sweptAll) || boost.immune) {
    const joined = absorbedFrom(kills, enemy.leakCost) + rallied;
    next.coins += enemy.reward;
    next.heroes += joined;
    return {
      state: next,
      message: joined > 0
        ? `擊倒${enemy.name} +${joined} 人`
        : `擊倒${enemy.name} +${enemy.reward} 金幣`,
      heroDelta: joined,
      attackDelta: joined * next.perHero,
    };
  }
  const cost = Math.max(1, enemy.leakCost ?? 1);
  next.heroes += rallied;
  // 土・遲滯:怪衝得慢,撞上來的少幾個。**固定值**,跟冰的兌換率(乘數)互補——
  // 前期一波才三五隻的時候固定值最有感,後期大波則是乘數比較值錢。
  const lost = Math.max(
    0,
    Math.ceil((leaked * cost) / Math.max(BASE_TRADE_RATE, next.tradeRate))
      - Math.floor(Math.max(0, boost.lossCut ?? 0)),
  );
  const before = totalAttack(next);
  next.heroes = next.heroes - lost;
  // 這裡曾經有「光・復活」與「暗・吸取」。光與暗整組移除了,兩者都不要加回來:
  // 復活是**事後**把死亡取消掉,玩家看到的是「我死了但沒死」,那一刻沒有任何畫面可以演;
  // 吸取則是「漏接反而變強」,跟漏接該是懲罰這件事直接衝突。
  if (next.heroes <= 0) {
    next.heroes = 0;
    next.phase = 'dead';
  }
  const delta = next.heroes - (state.heroes);
  return {
    state: next,
    message: missed > 0
      ? `漏了 ${leaked} 隻 -${lost} 人(${missed} 隻沒掃到)`
      : `漏了 ${leaked} 隻 -${lost} 人`,
    heroDelta: delta,
    attackDelta: totalAttack(next) - before,
  };
}

/**
 * 走過一排:只有玩家所在跑道的節點會生效,而且閘門還要真的踩到(見 hitsGate)。
 * offset 不給的話當作站在該跑道正中央——驗證腳本用跑道模擬時就是這個意思。
 */
export function resolveRow(state: RunState, row: RunRow, offset?: number, boost: WaveBoost = {}): RowResolution {
  const at = offset ?? laneCenterOffset(state.lane);
  const node = row.nodes.find((n) => n.lane === state.lane);
  const advanced = { ...state, rowIndex: row.index + 1 };

  if (!node) {
    return { state: advanced, message: '', heroDelta: 0, attackDelta: 0 };
  }

  if (node.kind === 'enemy' && node.enemy) {
    const r = resolveEnemy(advanced, node.enemy, boost, at);
    return { ...r, state: { ...r.state, rowIndex: row.index + 1 } };
  }

  if (node.kind === 'coin' && node.coins) {
    return {
      state: { ...advanced, coins: advanced.coins + node.coins },
      message: `+${node.coins} 金幣`,
      heroDelta: 0,
      attackDelta: 0,
    };
  }

  if (node.kind === 'gate' && node.gate) {
    // 站在這一格,但沒踩在閘門上——整格漏掉。好處沒吃到,陷阱也沒踩到。
    // 人數要傳進去:判定寬度就是隊伍寬度(見 heroHalfSpan)。
    if (!hitsGate(at, node.lane, state.stage, state.heroes)) {
      return { state: advanced, message: MISS_MESSAGE, heroDelta: 0, attackDelta: 0 };
    }
    const after = applyGate(advanced, node.gate);
    return {
      state: after,
      message: gateLabel(node.gate),
      heroDelta: after.heroes - advanced.heroes,
      attackDelta: totalAttack(after) - totalAttack(advanced),
    };
  }

  return { state: advanced, message: '', heroDelta: 0, attackDelta: 0 };
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
    // 只看總戰力就夠了:人數同時是戰力與生命,被撞掉的人本來就會反映在總戰力上,
    // 不需要像舊版那樣再加權一個獨立的血量項(那時候兩個資源要換算才比得出好壞)。
    const score = laneScore(r.state);
    if (score > bestScore) {
      bestScore = score;
      best = node.lane;
    }
  }
  return best;
}

/** 一格值不值得選。死掉一律是最差,不然就比總戰力。 */
function laneScore(state: RunState): number {
  return state.phase === 'dead' ? -Infinity : totalAttack(state);
}

export function worstLane(state: RunState, row: RunRow): Lane {
  let worst: Lane = 0;
  let worstScore = Infinity;
  for (const node of row.nodes) {
    const r = resolveRow({ ...state, lane: node.lane }, row);
    const score = laneScore(r.state);
    if (score < worstScore) {
      worstScore = score;
      worst = node.lane;
    }
  }
  return worst;
}
