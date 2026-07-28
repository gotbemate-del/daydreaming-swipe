// 滑動戰鬥核心(純邏輯,禁止 import React)。
//
// 這是這款跟「勇者發呆中」最根本的分歧點。舊作的戰鬥是「連續進度條」:一場戰鬥只有
// fightElapsedMs / fightDurationMs 兩個數字,沒有任何一次獨立的攻擊事件——因為它是放置遊戲,
// 玩家不需要參與。這裡整個換掉:戰鬥由一連串「怪物出招 → 玩家滑動閃避 → 反擊」的離散事件組成。
//
// 設計上刻意只用「左/右」兩個方向,不做上下或四方向:
//   1. 單手拿手機時拇指的左右移動比上下自然、也比較快,反應窗才有辦法壓到 0.5 秒以內。
//   2. 兩個選項的錯誤率是 50%,四個是 75%——四方向在高速下會變成純運氣,不是反應力。
//   3. 美術上「怪物從左邊撲來 → 往右閃」的方向語意最直覺,不用教學。
//
// 判定寬容度隨關卡遞減(REACTION_WINDOW_START_MS → REACTION_WINDOW_FLOOR_MS),這是本作唯一的
// 難度曲線來源。裝備/技能提供的是傷害與血量,不會讓反應窗變寬——不然數值養成會直接吃掉操作
// 這個核心體驗,變回放置遊戲。

export type SwipeDirection = 'left' | 'right';

/** 怪物的一次出招:玩家要在 [telegraphAt, telegraphAt + windowMs] 內往 direction 滑。 */
export interface Threat {
  index: number;
  /** 出招動作開始播放的時間(毫秒,相對於這場戰鬥開始) */
  telegraphAt: number;
  /** 有效反應窗長度 */
  windowMs: number;
  /** 玩家該往哪邊滑才閃得掉 */
  direction: SwipeDirection;
}

export type SwipeQuality = 'perfect' | 'good' | 'miss';

export interface SwipeJudgement {
  quality: SwipeQuality;
  /** 反應時間(毫秒)。miss 時為 windowMs(視同用滿整個窗) */
  reactionMs: number;
}

// ---- 反應窗 ----
// 起手 900ms 是「看到動作再反應」還很輕鬆的長度;地板 380ms 已經逼近人類視覺反應極限
// (簡單視覺刺激約 250ms),再短就不是難度是懲罰。中間用線性內插,在第 60 關觸底。
export const REACTION_WINDOW_START_MS = 900;
export const REACTION_WINDOW_FLOOR_MS = 380;
export const REACTION_WINDOW_FLOOR_STAGE = 60;

export function reactionWindowMs(stage: number): number {
  const t = Math.min(1, Math.max(0, (stage - 1) / (REACTION_WINDOW_FLOOR_STAGE - 1)));
  return Math.round(
    REACTION_WINDOW_START_MS - t * (REACTION_WINDOW_START_MS - REACTION_WINDOW_FLOOR_MS)
  );
}

// 反應時間落在窗的前 45% 算 perfect。用比例而不是固定毫秒:後期窗只有 380ms,固定 300ms 的
// perfect 門檻會變成「幾乎一定 perfect」,難度曲線就失效了。
export const PERFECT_WINDOW_RATIO = 0.45;

export function judgeSwipe(
  threat: Threat,
  swipedAt: number | null,
  swipedDirection: SwipeDirection | null
): SwipeJudgement {
  // 沒滑、逾時、或滑錯邊都算 miss。三者合併成同一個結果是刻意的:玩家在意的是「這下有沒有
  // 閃掉」,細分成「太慢」跟「滑錯」只會讓失敗回饋變吵。
  if (swipedAt === null || swipedDirection === null) {
    return { quality: 'miss', reactionMs: threat.windowMs };
  }
  const reactionMs = swipedAt - threat.telegraphAt;
  if (reactionMs < 0 || reactionMs > threat.windowMs) {
    return { quality: 'miss', reactionMs: threat.windowMs };
  }
  if (swipedDirection !== threat.direction) {
    return { quality: 'miss', reactionMs };
  }
  return {
    quality: reactionMs <= threat.windowMs * PERFECT_WINDOW_RATIO ? 'perfect' : 'good',
    reactionMs,
  };
}

// ---- 連段 ----
// 每段 +5%,20 段封頂 = 最高 2.0 倍。封頂是必要的:不封頂的話高手可以無限疊,關卡數值
// 就得照最高倍率設計,反而讓一般玩家打不動。
export const COMBO_STEP = 0.05;
export const COMBO_CAP = 20;

export function comboMultiplier(combo: number): number {
  return 1 + Math.min(Math.max(0, combo), COMBO_CAP) * COMBO_STEP;
}

// perfect 的額外倍率。1.6 是「值得為了 perfect 冒險早滑」但「good 也不至於沒用」的平衡點。
export const PERFECT_DAMAGE_MULTIPLIER = 1.6;
export const GOOD_DAMAGE_MULTIPLIER = 1.0;

export function qualityMultiplier(quality: SwipeQuality): number {
  if (quality === 'perfect') return PERFECT_DAMAGE_MULTIPLIER;
  if (quality === 'good') return GOOD_DAMAGE_MULTIPLIER;
  return 0;
}

/** 玩家這一場帶進來的數值(由裝備/技能/寵物坐騎算好後傳進來,這一層不關心怎麼算出來的)。 */
export interface HeroCombatStats {
  attackPower: number;
  maxHp: number;
  critRate: number;
  critDamage: number;
}

export interface MonsterCombatStats {
  maxHp: number;
  attackPower: number;
}

export interface BattleState {
  heroHp: number;
  monsterHp: number;
  combo: number;
  maxCombo: number;
  threatIndex: number;
  perfectCount: number;
  goodCount: number;
  missCount: number;
}

export function createBattleState(hero: HeroCombatStats, monster: MonsterCombatStats): BattleState {
  return {
    heroHp: hero.maxHp,
    monsterHp: monster.maxHp,
    combo: 0,
    maxCombo: 0,
    threatIndex: 0,
    perfectCount: 0,
    goodCount: 0,
    missCount: 0,
  };
}

export interface SwipeResolution {
  state: BattleState;
  damageDealt: number;
  damageTaken: number;
  isCrit: boolean;
  outcome: 'ongoing' | 'win' | 'lose';
}

/**
 * 結算一次出招。閃掉就反擊、沒閃掉就挨打並且連段歸零。
 * rng 由呼叫端傳入(預設 Math.random),方便測試時給固定序列。
 */
export function resolveSwipe(
  state: BattleState,
  judgement: SwipeJudgement,
  hero: HeroCombatStats,
  monster: MonsterCombatStats,
  rng: () => number = Math.random
): SwipeResolution {
  const next: BattleState = { ...state, threatIndex: state.threatIndex + 1 };

  if (judgement.quality === 'miss') {
    // 挨打:連段歸零。歸零而不是遞減,是為了讓「一路不失誤」真的有價值——遞減的話高段位
    // 玩家隨便失誤也無所謂,連段就失去意義了。
    next.missCount += 1;
    next.combo = 0;
    const damageTaken = Math.max(1, Math.round(monster.attackPower));
    next.heroHp = Math.max(0, next.heroHp - damageTaken);
    return {
      state: next,
      damageDealt: 0,
      damageTaken,
      isCrit: false,
      outcome: next.heroHp <= 0 ? 'lose' : 'ongoing',
    };
  }

  next.combo = state.combo + 1;
  next.maxCombo = Math.max(state.maxCombo, next.combo);
  if (judgement.quality === 'perfect') next.perfectCount += 1;
  else next.goodCount += 1;

  const isCrit = rng() < hero.critRate;
  const damageDealt = Math.max(
    1,
    Math.round(
      hero.attackPower *
        comboMultiplier(state.combo) *
        qualityMultiplier(judgement.quality) *
        (isCrit ? hero.critDamage : 1)
    )
  );
  next.monsterHp = Math.max(0, next.monsterHp - damageDealt);

  return {
    state: next,
    damageDealt,
    damageTaken: 0,
    isCrit,
    outcome: next.monsterHp <= 0 ? 'win' : 'ongoing',
  };
}

// ---- 出招序列 ----
// 用固定種子的 LCG 而不是 Math.random:同一場遭遇重打時招式順序一樣,玩家可以靠記憶進步,
// 而且回放/驗證都能重現。
export function createRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

// 出招間隔 = 反應窗 + 喘息時間。喘息時間隨關卡從 500ms 壓到 180ms,跟反應窗一起構成難度曲線。
export const BREATH_START_MS = 500;
export const BREATH_FLOOR_MS = 180;

export function breathMs(stage: number): number {
  const t = Math.min(1, Math.max(0, (stage - 1) / (REACTION_WINDOW_FLOOR_STAGE - 1)));
  return Math.round(BREATH_START_MS - t * (BREATH_START_MS - BREATH_FLOOR_MS));
}

/**
 * 產生一場遭遇的完整出招表。threatCount 由「打死這隻怪需要幾次反擊」反推(見 estimateThreatCount),
 * 多給一些餘裕讓玩家有失誤空間。
 */
export function createThreatSequence(seed: number, stage: number, threatCount: number): Threat[] {
  const rng = createRng(seed);
  const windowMs = reactionWindowMs(stage);
  const breath = breathMs(stage);
  const threats: Threat[] = [];
  let cursor = breath;
  for (let i = 0; i < threatCount; i++) {
    threats.push({
      index: i,
      telegraphAt: cursor,
      windowMs,
      direction: rng() < 0.5 ? 'left' : 'right',
    });
    cursor += windowMs + breath;
  }
  return threats;
}

/**
 * 這隻怪「全程 good、沒有爆擊、沒有連段加成」大約要幾次反擊才打得死——用來當出招表長度的下限。
 * 實際會乘上 THREAT_HEADROOM 給玩家失誤空間。
 */
export function estimateThreatCount(hero: HeroCombatStats, monster: MonsterCombatStats): number {
  const perHit = Math.max(1, hero.attackPower * GOOD_DAMAGE_MULTIPLIER);
  return Math.ceil(monster.maxHp / perHit);
}

export const THREAT_HEADROOM = 1.8;

export function threatCountForEncounter(hero: HeroCombatStats, monster: MonsterCombatStats): number {
  return Math.max(3, Math.ceil(estimateThreatCount(hero, monster) * THREAT_HEADROOM));
}
