export const MAX_LEVEL = 500;
export const EXP_BANK_CAP_MULTIPLIER = 30;

const BASE_EXP_PER_MIN = 10;
const EXP_PER_MIN_LEVEL_FACTOR = 0.05;

// exp_to_next 分 5 段,成長率依序遞減,轉折平滑不斷檔:
// Lv1-119(陡,衝前期爽感,~3.5 週到 Lv120) / Lv120-249 / Lv250-359 / Lv360-449 / Lv450-499(最平緩)。
// Lv120 之後的 4 段經過調整,是因為規劃中技能系統會共用這包經驗池:
// 5 個技能、每個技能花費是對應等級 exp_to_next 的 1/5,5 個一起剛好等於練等本身的花費,
// 「練等+5技能全部封頂」的總花費會變成單純練等的 2 倍。這裡把 Lv120 後的曲線壓低,
// 讓單純練等封頂降到 ~0.9 年,兩者相加(全部封頂)回到原本設計的 ~1.8 年;
// Lv120 前的早期節奏(~3.5 週到 Lv120)維持不變。全程節奏仍遠低於「20 等/週」上限。
const BASE_EXP_TO_NEXT = 100;

// Lv120 起的 4 段成長率整體再放大 GROWTH_SCALE 倍(對 growth-1 的超額部分放大,不是對 growth
// 本身放大),把「學生」畢業後(Lv30起)到封頂的節奏拉長。Lv1-119(tier 1)這段不受影響,
// 所以 Lv120 這個既有里程碑的累積時間幾乎不變(~24天,誤差幾小時內)。
const GROWTH_SCALE = 3.2277;

const EXP_TIERS: { startLevel: number; growth: number }[] = [
  { startLevel: 1, growth: 1.0615672364184165 },
  { startLevel: 120, growth: 1.0020178739248546 },
  { startLevel: 250, growth: 1.00184971776445 },
  { startLevel: 360, growth: 1.0016815616040453 },
  { startLevel: 450, growth: 1.001513405443641 },
];

interface ResolvedExpTier {
  startLevel: number;
  growth: number;
  referenceLevel: number;
  baseCost: number;
}

const RESOLVED_EXP_TIERS: ResolvedExpTier[] = EXP_TIERS.reduce<ResolvedExpTier[]>((resolved, tier, i) => {
  const growth = i === 0 ? tier.growth : 1 + (tier.growth - 1) * GROWTH_SCALE;
  if (i === 0) {
    resolved.push({ startLevel: tier.startLevel, growth, referenceLevel: 0, baseCost: BASE_EXP_TO_NEXT });
    return resolved;
  }
  const prev = resolved[i - 1];
  const referenceLevel = tier.startLevel - 1;
  const baseCost = Math.floor(prev.baseCost * Math.pow(prev.growth, referenceLevel - prev.referenceLevel));
  resolved.push({ startLevel: tier.startLevel, growth, referenceLevel, baseCost });
  return resolved;
}, []);

export interface LevelState {
  level: number;
  bankedExp: number;
}

export function createInitialLevelState(): LevelState {
  return { level: 1, bankedExp: 0 };
}

export function expPerMin(level: number): number {
  return BASE_EXP_PER_MIN * (1 + level * EXP_PER_MIN_LEVEL_FACTOR);
}

// Lv1-49 的花費砍半,讓練到 Lv50 的時間變成原本的一半;Lv50 起銜接回原曲線,不動後段任何節奏。
const FAST_START_LEVEL_CAP = 50;
const FAST_START_MULTIPLIER = 0.5;

// 「學生」期(Lv1-29,見 hasChosenJob)疊加在 FAST_START 之上的額外折扣,兩者相乘生效
// (0.5 * 0.1430 ≈ 0.0715),把 Lv30 畢業點壓到 ~30 分鐘。
const EARLY_LEVEL_CAP = 30;
const EARLY_MULT = 0.143;

export function expToNext(level: number): number {
  let tier = RESOLVED_EXP_TIERS[0];
  for (const t of RESOLVED_EXP_TIERS) {
    if (level >= t.startLevel) tier = t;
  }
  let scaled = tier.baseCost * Math.pow(tier.growth, level - tier.referenceLevel);
  if (level < EARLY_LEVEL_CAP) scaled *= EARLY_MULT;
  if (level < FAST_START_LEVEL_CAP) scaled *= FAST_START_MULTIPLIER;
  return Math.floor(scaled);
}

export function expBankCap(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return expToNext(level) * EXP_BANK_CAP_MULTIPLIER;
}

// capHours 預設24小時,轉生加成樹的「恆常離線效率」節點(見 game/ascension.ts 的
// offlineCap)可以延長這個上限,呼叫端(hooks/useGameState.ts 的 load())算好
// 24+節點加成的實際小時數再傳進來,這裡不用知道轉生系統的存在。
export function calcOfflineExp(level: number, elapsedMs: number, capHours: number = 24): number {
  const cappedMs = Math.min(elapsedMs, capHours * 60 * 60 * 1000);
  const minutes = cappedMs / 60000;
  return Math.floor(expPerMin(level) * minutes);
}

export function accumulateExp(state: LevelState, gainedExp: number): LevelState {
  if (state.level >= MAX_LEVEL || gainedExp <= 0) return state;
  const cap = expBankCap(state.level);
  const bankedExp = Math.min(state.bankedExp + gainedExp, cap);
  return { ...state, bankedExp };
}

export function canLevelUp(state: LevelState): boolean {
  return state.level < MAX_LEVEL && state.bankedExp >= expToNext(state.level);
}

// 銀行經驗值最多可以放到 expBankCap(單級所需的30倍),所以可能一次囤好幾級份——
// UI用這個算「現在點下去可以兌換幾級」,取代直接顯示囤積量對比單級所需的原始數字
// (那樣數字量級差太多,看起來像壞掉)。
export function levelsAvailable(state: LevelState): number {
  let level = state.level;
  let bankedExp = state.bankedExp;
  let count = 0;

  while (level < MAX_LEVEL) {
    const cost = expToNext(level);
    if (bankedExp < cost) break;
    bankedExp -= cost;
    level += 1;
    count += 1;
  }

  return count;
}

// 銀行經驗值累積後自動兌換等級(取代原本要玩家按「升1/5/10級」按鈕手動兌換的設計)——
// 累積/兌換的公式完全沒變(還是同一組 expToNext/expBankCap),差別只在「誰觸發兌換」:
// 呼叫端(hooks/useGameState.ts 的 tickBattle/load)在每次 accumulateExp 之後立刻呼叫這個
// 函式,有多少囤積經驗就兌換多少級,銀行不會再讓玩家自己選擇要不要先囤著。
export function autoLevelUp(state: LevelState): { state: LevelState; levelsGained: number } {
  let level = state.level;
  let bankedExp = state.bankedExp;
  let levelsGained = 0;

  while (level < MAX_LEVEL) {
    const cost = expToNext(level);
    if (bankedExp < cost) break;
    bankedExp -= cost;
    level += 1;
    levelsGained += 1;
  }

  return { state: { level, bankedExp }, levelsGained };
}
