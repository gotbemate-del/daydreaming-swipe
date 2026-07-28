export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

interface RarityWeight {
  rarity: Rarity;
  probability: number;
}

const RARITY_TABLE: RarityWeight[] = [
  { rarity: 'common', probability: 0.7 },
  { rarity: 'rare', probability: 0.22 },
  { rarity: 'epic', probability: 0.07 },
  { rarity: 'legendary', probability: 0.01 },
];

const RARE_OR_ABOVE_TABLE: RarityWeight[] = RARITY_TABLE.filter((entry) => entry.rarity !== 'common');

export const PITY_THRESHOLD = 30;

export interface TriggerState {
  pityCounter: number;
}

export function createInitialTriggerState(): TriggerState {
  return { pityCounter: 0 };
}

export function isRareOrAbove(rarity: Rarity): boolean {
  return rarity !== 'common';
}

function pickFromTable(table: RarityWeight[], roll: number): Rarity {
  const totalWeight = table.reduce((sum, entry) => sum + entry.probability, 0);
  let cumulative = 0;
  for (const entry of table) {
    cumulative += entry.probability / totalWeight;
    if (roll < cumulative) return entry.rarity;
  }
  return table[table.length - 1].rarity;
}

export interface TriggerRoll {
  rarity: Rarity;
  state: TriggerState;
  pityTriggered: boolean;
}

// 點擊勇者算一次「觸發點擊」,直接推進保底計數器,讓下一次判定更接近(或直接落入)保底門檻,
// 藉此提高稀有以上結果的機率;沿用同一套保底邏輯,不是另開一條規則,夾住上限避免溢位。
export function bumpPityFromClick(state: TriggerState): TriggerState {
  return { pityCounter: Math.min(PITY_THRESHOLD, state.pityCounter + 1) };
}

export function rollTrigger(state: TriggerState, rng: () => number = Math.random): TriggerRoll {
  const pityTriggered = state.pityCounter >= PITY_THRESHOLD;
  const table = pityTriggered ? RARE_OR_ABOVE_TABLE : RARITY_TABLE;
  const rarity = pickFromTable(table, rng());

  const pityCounter = isRareOrAbove(rarity) ? 0 : state.pityCounter + 1;

  return { rarity, state: { pityCounter }, pityTriggered };
}
