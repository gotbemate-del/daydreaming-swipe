export type Archetype =
  | 'physicalMelee'
  | 'physicalRanged'
  | 'physicalSupport'
  | 'magicMelee'
  | 'magicRanged'
  | 'magicSupport';

export type JobTier = 1 | 2 | 3 | 4 | 5;

export type Subtype = 'melee' | 'ranged' | 'support';
export type DamageType = 'physical' | 'magic';

const ARCHETYPE_COMPOSITION: Record<Archetype, { subtype: Subtype; damageType: DamageType }> = {
  physicalMelee: { subtype: 'melee', damageType: 'physical' },
  physicalRanged: { subtype: 'ranged', damageType: 'physical' },
  physicalSupport: { subtype: 'support', damageType: 'physical' },
  magicMelee: { subtype: 'melee', damageType: 'magic' },
  magicRanged: { subtype: 'ranged', damageType: 'magic' },
  magicSupport: { subtype: 'support', damageType: 'magic' },
};

// 5 階轉職的基準倍率。
// 6 條路線在滿階(5 階)時完全一致,路線差異只影響 1~4 階的節奏。
const BASE_MULTIPLIER: Record<JobTier, number> = { 1: 1.0, 2: 1.1, 3: 1.2, 4: 1.35, 5: 1.5 };

// 近戰前段衝快、遠程平均分散、輔助前段弱後段補回來;5 階時三者加成都收斂回 0。
const SUBTYPE_BONUS: Record<Subtype, Record<JobTier, number>> = {
  melee: { 1: 0.05, 2: 0.03, 3: 0, 4: 0, 5: 0 },
  ranged: { 1: 0.02, 2: 0.02, 3: 0.02, 4: 0, 5: 0 },
  support: { 1: -0.05, 2: -0.03, 3: 0.02, 4: 0.03, 5: 0 },
};

// 物理前段穩定、魔法前段偏弱但後段反超;5 階時兩者加成也收斂回 0。
const DAMAGE_TYPE_BONUS: Record<DamageType, Record<JobTier, number>> = {
  physical: { 1: 0.02, 2: 0.01, 3: 0, 4: 0, 5: 0 },
  magic: { 1: -0.02, 2: -0.01, 3: 0.01, 4: 0.02, 5: 0 },
};

export const TIER_UNLOCK_LEVELS: Record<JobTier, number> = { 1: 30, 2: 80, 3: 250, 4: 300, 5: 400 };

export function calcCombatMultiplier(archetype: Archetype, tier: JobTier): number {
  const { subtype, damageType } = ARCHETYPE_COMPOSITION[archetype];
  return BASE_MULTIPLIER[tier] + SUBTYPE_BONUS[subtype][tier] + DAMAGE_TYPE_BONUS[damageType][tier];
}

// 雙職兼修:Lv160 解鎖,可另選一個副職archetype。副職只吃自己那份倍率「超出 1.0 的部分」
// 的一半,不會整個疊上去,維持主職才是數值主力的定位。獨立於階級門檻(TIER_UNLOCK_LEVELS)之外,
// 純粹是留給雙職這個系統自己的解鎖等級。
export const DUAL_CLASS_UNLOCK_LEVEL = 160;
const SECONDARY_JOB_WEIGHT = 0.5;

export function canUnlockDualClass(level: number): boolean {
  return level >= DUAL_CLASS_UNLOCK_LEVEL;
}

export function calcSecondaryCombatBonus(archetype: Archetype, tier: JobTier): number {
  return SECONDARY_JOB_WEIGHT * (calcCombatMultiplier(archetype, tier) - 1);
}

// 給戰鬥視覺層(攻擊特效)用來判斷要畫近戰/遠程/輔助,物理/魔法哪一種呈現,純讀取不影響數值。
export function getArchetypeComposition(archetype: Archetype): { subtype: Subtype; damageType: DamageType } {
  return ARCHETYPE_COMPOSITION[archetype];
}

// 反查:職業樹UI用(damageType, subtype)兩軸畫節點,需要從組合反查回實際的 Archetype id。
const ARCHETYPE_BY_COMPOSITION: Record<DamageType, Record<Subtype, Archetype>> = {
  physical: { melee: 'physicalMelee', ranged: 'physicalRanged', support: 'physicalSupport' },
  magic: { melee: 'magicMelee', ranged: 'magicRanged', support: 'magicSupport' },
};

export function getArchetypeByComposition(damageType: DamageType, subtype: Subtype): Archetype {
  return ARCHETYPE_BY_COMPOSITION[damageType][subtype];
}

export function oppositeDamageType(damageType: DamageType): DamageType {
  return damageType === 'physical' ? 'magic' : 'physical';
}

export function canPromoteToTier(tier: JobTier, level: number): boolean {
  return level >= TIER_UNLOCK_LEVELS[tier];
}

// 轉職階數完全由等級決定,不需要另外存檔或手動升階。
export function getCurrentTier(level: number): JobTier {
  let currentTier: JobTier = 1;
  for (const tier of [1, 2, 3, 4, 5] as JobTier[]) {
    if (level >= TIER_UNLOCK_LEVELS[tier]) currentTier = tier;
  }
  return currentTier;
}

export type JobBranch = 'A' | 'B';

// 每階同一分支數值完全一樣(都吃 calcCombatMultiplier),稱號純粹是風味選擇。
// 1 階兩個分支尚未分岔,共用同一個稱號;分岔從 2 階開始。
export const JOB_TITLES: Record<Archetype, Record<JobBranch, Record<JobTier, string>>> = {
  physicalMelee: {
    A: { 1: '工讀生', 2: '搬運工', 3: '工地師傅', 4: '消防員', 5: '特種部隊' },
    B: { 1: '工讀生', 2: '拳擊館學員', 3: '拳擊教練', 4: '職業拳擊手', 5: '傳說拳王' },
  },
  physicalRanged: {
    A: { 1: '外送員', 2: '計程車司機', 3: '警察', 4: '職業獵人', 5: '狙擊手' },
    B: { 1: '外送員', 2: '貨車司機', 3: '保鑣', 4: '特技替身演員', 5: '頂尖鏢客' },
  },
  physicalSupport: {
    A: { 1: '超商店員', 2: '餐廳服務生', 3: '護理師', 4: '健身教練', 5: '急診室王牌護理長' },
    B: { 1: '超商店員', 2: '空服員', 3: '居家照護員', 4: '物理治療師', 5: '奧運隨隊防護員' },
  },
  magicMelee: {
    A: { 1: '中二國中生', 2: '阿志', 3: '道士/法師', 4: '命理師', 5: '得道仙人' },
    B: { 1: '中二國中生', 2: '八家將小將', 3: '乩童', 4: '風水師', 5: '一代宗師' },
  },
  magicRanged: {
    A: { 1: '電競選手/實況主', 2: '軟體工程師', 3: '研究員/科學家', 4: '駭客', 5: 'AI 天才工程師' },
    B: { 1: '電競選手/實況主', 2: '資料科學家', 3: '量子物理博士生', 4: '密碼學專家', 5: '諾貝爾獎得主' },
  },
  magicSupport: {
    A: { 1: '藥師', 2: '醫生', 3: '心理諮商師', 4: '老中醫', 5: '神醫/華佗再世' },
    B: { 1: '藥師', 2: '獸醫', 3: '芳療師', 4: '針灸師', 5: '都市傳說級神醫' },
  },
};

export function getJobTitle(archetype: Archetype, branch: JobBranch, tier: JobTier): string {
  return JOB_TITLES[archetype][branch][tier];
}
