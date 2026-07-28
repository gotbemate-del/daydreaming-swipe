import { Rarity } from './trigger';

export type CompanionKind = 'pet' | 'mount';
export type CompanionBonusStat = 'exp' | 'coins' | 'speed';

export interface CompanionBonus {
  stat: CompanionBonusStat;
  value: number;
}

export interface CompanionSpec {
  id: string;
  kind: CompanionKind;
  name: string;
  rarity: Rarity;
  bonus: CompanionBonus;
  price: number;
}

// 寵物給經驗/金幣加成,坐騎給戰鬥速度加成,稀有度分佈 35/11/3/1(common/rare/epic/legendary),
// 數值/售價只跟「kind+rarity」掛勾,不跟個別寵物掛勾——同 kind 同 rarity 的每一筆數值都相同,
// 差異只在名字/外觀(見 game/sprites/companions.ts),不在數值,呼應「數值分化交給裝備系統」的設計。
//
// 這 8 筆是最早期上線就存在的資料,id/name/rarity/bonus/price 絕對不能改動——玩家存檔的
// unlockedIds/equippedPetId/equippedMountId 已經指向這些 id,改掉會讓老玩家的寵物憑空消失。
const LEGACY_COMPANIONS: CompanionSpec[] = [
  { id: 'pet-common-cat', kind: 'pet', name: '小貓', rarity: 'common', bonus: { stat: 'exp', value: 0.03 }, price: 30 },
  { id: 'pet-rare-fox', kind: 'pet', name: '狐狸', rarity: 'rare', bonus: { stat: 'coins', value: 0.06 }, price: 90 },
  { id: 'pet-epic-owl', kind: 'pet', name: '貓頭鷹', rarity: 'epic', bonus: { stat: 'exp', value: 0.1 }, price: 200 },
  {
    id: 'pet-legendary-phoenix',
    kind: 'pet',
    name: '幼鳳凰',
    rarity: 'legendary',
    bonus: { stat: 'coins', value: 0.2 },
    price: 500,
  },
  {
    id: 'mount-common-pony',
    kind: 'mount',
    name: '小馬',
    rarity: 'common',
    bonus: { stat: 'speed', value: 0.03 },
    price: 30,
  },
  {
    id: 'mount-rare-boar',
    kind: 'mount',
    name: '野豬',
    rarity: 'rare',
    bonus: { stat: 'speed', value: 0.06 },
    price: 90,
  },
  {
    id: 'mount-epic-wolf',
    kind: 'mount',
    name: '座狼',
    rarity: 'epic',
    bonus: { stat: 'speed', value: 0.1 },
    price: 200,
  },
  {
    id: 'mount-legendary-griffin',
    kind: 'mount',
    name: '幼獅鷲',
    rarity: 'legendary',
    bonus: { stat: 'speed', value: 0.2 },
    price: 500,
  },
];

// 各 kind+rarity 的數值模板,直接沿用上面 8 筆既有資料裡同 kind 同 rarity 那一筆的 bonus/price——
// 新增的每一筆都套用同一份模板,不為了「多樣性」另外調數值。
const PET_BONUS_TEMPLATE: Record<Rarity, CompanionBonus> = {
  common: { stat: 'exp', value: 0.03 },
  rare: { stat: 'coins', value: 0.06 },
  epic: { stat: 'exp', value: 0.1 },
  legendary: { stat: 'coins', value: 0.2 },
};
const MOUNT_BONUS_TEMPLATE: Record<Rarity, CompanionBonus> = {
  common: { stat: 'speed', value: 0.03 },
  rare: { stat: 'speed', value: 0.06 },
  epic: { stat: 'speed', value: 0.1 },
  legendary: { stat: 'speed', value: 0.2 },
};
const PRICE_TEMPLATE: Record<Rarity, number> = { common: 30, rare: 90, epic: 200, legendary: 500 };

interface CompanionSeed {
  slug: string;
  name: string;
  rarity: Rarity;
}

function buildCompanions(kind: CompanionKind, seeds: CompanionSeed[]): CompanionSpec[] {
  const bonusTemplate = kind === 'pet' ? PET_BONUS_TEMPLATE : MOUNT_BONUS_TEMPLATE;
  return seeds.map((seed) => ({
    id: `${kind}-${seed.rarity}-${seed.slug}`,
    kind,
    name: seed.name,
    rarity: seed.rarity,
    bonus: bonusTemplate[seed.rarity],
    price: PRICE_TEMPLATE[seed.rarity],
  }));
}

// 新增的 46 隻寵物,依 8 種美術科屬(見 game/sprites/companions.ts 的 PetArchetype)分配,
// 每種科屬約 6-7 隻;稀有度合計:common 34、rare 10、epic 2(legendary 保留只有既有那 1 隻,
// 凸顯稀有感)。科屬對應順序:貓科 feline / 犬科 canine / 兔類 rabbit / 鳥類 bird /
// 爬蟲類 reptile / 水棲類 aquatic / 嚙齒類 rodent / 幻獸類 mythic。
const NEW_PET_SEEDS: CompanionSeed[] = [
  // 貓科(feline):common4 + rare2
  { slug: 'orangecat', name: '橘貓', rarity: 'common' },
  { slug: 'blackcat', name: '黑貓', rarity: 'common' },
  { slug: 'whitecat', name: '白貓', rarity: 'common' },
  { slug: 'calico', name: '三花貓', rarity: 'common' },
  { slug: 'bobcat', name: '山貓', rarity: 'rare' },
  { slug: 'leopardcat', name: '豹貓', rarity: 'rare' },
  // 犬科(canine):common4 + rare1
  { slug: 'puppy', name: '小狗', rarity: 'common' },
  { slug: 'shiba', name: '柴犬', rarity: 'common' },
  { slug: 'husky', name: '哈士奇', rarity: 'common' },
  { slug: 'gsd', name: '黑背犬', rarity: 'common' },
  { slug: 'arcticfox', name: '雪狐', rarity: 'rare' },
  // 兔類(rabbit):common4 + rare2
  { slug: 'whiterabbit', name: '白兔', rarity: 'common' },
  { slug: 'brownrabbit', name: '棕兔', rarity: 'common' },
  { slug: 'lopear', name: '垂耳兔', rarity: 'common' },
  { slug: 'grayrabbit', name: '灰兔', rarity: 'common' },
  { slug: 'snowhare', name: '雪兔', rarity: 'rare' },
  { slug: 'spottedrabbit', name: '花斑兔', rarity: 'rare' },
  // 鳥類(bird):common5 + rare1
  { slug: 'sparrow', name: '麻雀', rarity: 'common' },
  { slug: 'pigeon', name: '鴿子', rarity: 'common' },
  { slug: 'finch', name: '文鳥', rarity: 'common' },
  { slug: 'whiteeye', name: '綠繡眼', rarity: 'common' },
  { slug: 'egret', name: '白鷺', rarity: 'common' },
  { slug: 'parrot', name: '鸚鵡', rarity: 'rare' },
  // 爬蟲類(reptile):common4 + rare2
  { slug: 'gecko', name: '守宮', rarity: 'common' },
  { slug: 'iguana', name: '綠鬣蜥', rarity: 'common' },
  { slug: 'turtle', name: '巴西龜', rarity: 'common' },
  { slug: 'chameleon', name: '變色龍', rarity: 'common' },
  { slug: 'hornedlizard', name: '角蜥', rarity: 'rare' },
  { slug: 'firesalamander', name: '火蜥蜴', rarity: 'rare' },
  // 水棲類(aquatic):common5 + rare1
  { slug: 'koi', name: '錦鯉', rarity: 'common' },
  { slug: 'otter', name: '水獺', rarity: 'common' },
  { slug: 'pufferfish', name: '河豚', rarity: 'common' },
  { slug: 'babyseal', name: '小海豹', rarity: 'common' },
  { slug: 'tropicalfish', name: '熱帶魚', rarity: 'common' },
  { slug: 'babydolphin', name: '小海豚', rarity: 'rare' },
  // 嚙齒類(rodent):common5 + rare1
  { slug: 'hamster', name: '倉鼠', rarity: 'common' },
  { slug: 'chipmunk', name: '花栗鼠', rarity: 'common' },
  { slug: 'guineapig', name: '天竺鼠', rarity: 'common' },
  { slug: 'squirrel', name: '松鼠', rarity: 'common' },
  { slug: 'mouse', name: '老鼠', rarity: 'common' },
  { slug: 'chinchilla', name: '龍貓', rarity: 'rare' },
  // 幻獸類(mythic):common3 + epic2
  { slug: 'thunderspirit', name: '小雷靈', rarity: 'common' },
  { slug: 'earthspirit', name: '小土靈', rarity: 'common' },
  { slug: 'waterspirit', name: '小水靈', rarity: 'common' },
  { slug: 'unicorn', name: '幼獨角獸', rarity: 'epic' },
  { slug: 'ninetail', name: '幼九尾', rarity: 'epic' },
];

// 新增的 46 隻坐騎,依 6 種美術科屬(見 game/sprites/companions.ts 的 MountArchetype)分配,
// 每種科屬約 8-9 隻;稀有度合計同上:common 34、rare 10、epic 2。科屬對應順序:
// 馬科 equine / 野豬科 boar / 狼科 wolf / 鹿科 deer / 獅鷲科 griffin / 龍科 dragon。
const NEW_MOUNT_SEEDS: CompanionSeed[] = [
  // 馬科(equine):common6 + rare2
  { slug: 'whitehorse', name: '白馬', rarity: 'common' },
  { slug: 'blackhorse', name: '黑馬', rarity: 'common' },
  { slug: 'pinto', name: '花斑馬', rarity: 'common' },
  { slug: 'brownhorse', name: '棕馬', rarity: 'common' },
  { slug: 'minihorse', name: '迷你馬', rarity: 'common' },
  { slug: 'donkey', name: '驢子', rarity: 'common' },
  { slug: 'zebra', name: '斑馬', rarity: 'rare' },
  { slug: 'ferghana', name: '汗血馬', rarity: 'rare' },
  // 野豬科(boar):common6 + rare1
  { slug: 'piglet', name: '小豬', rarity: 'common' },
  { slug: 'warthog', name: '疣豬', rarity: 'common' },
  { slug: 'spottedpig', name: '花豬', rarity: 'common' },
  { slug: 'blackpig', name: '黑豬', rarity: 'common' },
  { slug: 'micropig', name: '迷你豬', rarity: 'common' },
  { slug: 'hairyboar', name: '長毛豬', rarity: 'common' },
  { slug: 'tuskedboar', name: '巨牙野豬', rarity: 'rare' },
  // 狼科(wolf):common6 + rare1
  { slug: 'graywolf', name: '灰狼', rarity: 'common' },
  { slug: 'wolfpup', name: '小狼', rarity: 'common' },
  { slug: 'whitewolf', name: '白狼', rarity: 'common' },
  { slug: 'blackwolf', name: '黑狼', rarity: 'common' },
  { slug: 'prairiewolf', name: '草原狼', rarity: 'common' },
  { slug: 'forestwolf', name: '森林狼', rarity: 'common' },
  { slug: 'tundrawolf', name: '冰原狼', rarity: 'rare' },
  // 鹿科(deer):common6 + rare2
  { slug: 'fawn', name: '小鹿', rarity: 'common' },
  { slug: 'sika', name: '梅花鹿', rarity: 'common' },
  { slug: 'elk', name: '麋鹿', rarity: 'common' },
  { slug: 'whitetail', name: '白尾鹿', rarity: 'common' },
  { slug: 'muntjac', name: '山羌', rarity: 'common' },
  { slug: 'moose', name: '駝鹿', rarity: 'common' },
  { slug: 'spiritdeer', name: '精靈鹿', rarity: 'rare' },
  { slug: 'stagking', name: '角鹿王', rarity: 'rare' },
  // 獅鷲科(griffin):common5 + rare2
  { slug: 'prairiegriffin', name: '草原鷹獅', rarity: 'common' },
  { slug: 'rockgriffin', name: '岩鷹獅', rarity: 'common' },
  { slug: 'dunegriffin', name: '沙丘鷹獅', rarity: 'common' },
  { slug: 'forestgriffin', name: '林鷹獅', rarity: 'common' },
  { slug: 'graygriffin', name: '灰鷹獅', rarity: 'common' },
  { slug: 'silvergriffin', name: '銀鷹獅', rarity: 'rare' },
  { slug: 'flamegriffin', name: '焰鷹獅', rarity: 'rare' },
  // 龍科(dragon):common5 + rare2 + epic2
  { slug: 'skydrake', name: '小飛蜥', rarity: 'common' },
  { slug: 'sanddrake', name: '沙蜥龍', rarity: 'common' },
  { slug: 'muddrake', name: '泥蜥龍', rarity: 'common' },
  { slug: 'grassdrake', name: '草蜥龍', rarity: 'common' },
  { slug: 'stonedrake', name: '石蜥龍', rarity: 'common' },
  { slug: 'icedrake', name: '冰蜥龍', rarity: 'rare' },
  { slug: 'flamedrake', name: '焰蜥龍', rarity: 'rare' },
  { slug: 'firedragon', name: '幼火龍', rarity: 'epic' },
  { slug: 'icedragon', name: '幼冰龍', rarity: 'epic' },
];

export const COMPANIONS: CompanionSpec[] = [
  ...LEGACY_COMPANIONS,
  ...buildCompanions('pet', NEW_PET_SEEDS),
  ...buildCompanions('mount', NEW_MOUNT_SEEDS),
];

export function getCompanionById(id: string): CompanionSpec | undefined {
  return COMPANIONS.find((c) => c.id === id);
}

export function getCompanionsByKind(kind: CompanionKind): CompanionSpec[] {
  return COMPANIONS.filter((c) => c.kind === kind);
}

// 掉落用的獨立稀有度權重,刻意不共用 game/trigger.ts 的保底計數器——
// 保底是給主要稀有事件用的,審物/坐騎掉落只是額外小獎勵,不應該互相干擾。
const DROP_RARITY_WEIGHTS: { rarity: Rarity; probability: number }[] = [
  { rarity: 'common', probability: 0.7 },
  { rarity: 'rare', probability: 0.22 },
  { rarity: 'epic', probability: 0.07 },
  { rarity: 'legendary', probability: 0.01 },
];

function pickDropRarity(rng: () => number): Rarity {
  const roll = rng();
  let cumulative = 0;
  for (const entry of DROP_RARITY_WEIGHTS) {
    cumulative += entry.probability;
    if (roll < cumulative) return entry.rarity;
  }
  return DROP_RARITY_WEIGHTS[DROP_RARITY_WEIGHTS.length - 1].rarity;
}

const COMPANION_DROP_CHANCE = 0.03;

// 每次擊殺後呼叫一次;多數時候回傳 null(沒掉落)。
export function rollCompanionDrop(rng: () => number = Math.random): CompanionSpec | null {
  if (rng() >= COMPANION_DROP_CHANCE) return null;
  const kind: CompanionKind = rng() < 0.5 ? 'pet' : 'mount';
  const rarity = pickDropRarity(rng);
  const pool = COMPANIONS.filter((c) => c.kind === kind && c.rarity === rarity);
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}

export interface CompanionState {
  unlockedIds: string[];
  equippedPetId: string | null;
  equippedMountId: string | null;
}

export function createEmptyCompanionState(): CompanionState {
  return { unlockedIds: [], equippedPetId: null, equippedMountId: null };
}

export function isCompanionUnlocked(state: CompanionState, id: string): boolean {
  return state.unlockedIds.includes(id);
}

export function unlockCompanion(state: CompanionState, id: string): CompanionState {
  if (state.unlockedIds.includes(id)) return state;
  return { ...state, unlockedIds: [...state.unlockedIds, id] };
}

export function equipCompanion(state: CompanionState, id: string): CompanionState {
  const companion = getCompanionById(id);
  if (!companion) return state;
  if (companion.kind === 'pet') return { ...state, equippedPetId: id };
  return { ...state, equippedMountId: id };
}

export function unequipCompanion(state: CompanionState, kind: CompanionKind): CompanionState {
  if (kind === 'pet') return { ...state, equippedPetId: null };
  return { ...state, equippedMountId: null };
}

export interface CompanionBonusTotals {
  exp: number;
  coins: number;
  speed: number;
}

export function getCompanionBonusTotals(state: CompanionState): CompanionBonusTotals {
  const totals: CompanionBonusTotals = { exp: 0, coins: 0, speed: 0 };
  for (const id of [state.equippedPetId, state.equippedMountId]) {
    if (!id) continue;
    const companion = getCompanionById(id);
    if (!companion) continue;
    totals[companion.bonus.stat] += companion.bonus.value;
  }
  return totals;
}

// ---------------------------------------------------------------------------
// 寵物/坐騎專屬裝備系統:5 槽位(上身/下身/頭盔/鞋/武器),比照 game/skillTree.ts 的
// 「升級格子」模式——裝備綁在「寵物」跟「坐騎」這兩個身分上,不是綁在某一隻特定寵物身上,
// 換裝備哪隻寵物數值都一樣,避免每個科屬每個槽位各自一堆道具可換的規模爆炸。
// ---------------------------------------------------------------------------

export type CompanionGearSlot = 'top' | 'bottom' | 'helmet' | 'shoes' | 'weapon';
export type CompanionGearLevels = Record<CompanionGearSlot, number>; // 0 = 尚未升級,1~10 = 目前階級

export function createEmptyCompanionGearLevels(): CompanionGearLevels {
  return { top: 0, bottom: 0, helmet: 0, shoes: 0, weapon: 0 };
}

export interface CompanionGearState {
  pet: CompanionGearLevels;
  mount: CompanionGearLevels;
}

export function createEmptyCompanionGearState(): CompanionGearState {
  return { pet: createEmptyCompanionGearLevels(), mount: createEmptyCompanionGearLevels() };
}

// 升級曲線直接沿用 game/equipment.ts 的 bracketPrice(PRICE_BASE=20、PRICE_EXPONENT=1.6),
// 這條曲線已經在主裝備系統驗證過是合理的,不重新調參數。
const COMPANION_GEAR_BRACKET_COUNT = 10;
const COMPANION_GEAR_PRICE_BASE = 20;
const COMPANION_GEAR_PRICE_EXPONENT = 1.6;
const COMPANION_GEAR_BONUS_PER_BRACKET = 0.015; // 每階 +1.5%,10 階封頂 15%

export function companionGearUpgradeRequiredLevel(bracket: number): number {
  return bracket * 10 - 5; // bracket1=Lv5, bracket2=Lv15, ..., bracket10=Lv95
}

export function companionGearUpgradeCoinCost(currentLevel: number): number {
  const nextBracket = currentLevel + 1;
  return Math.round(COMPANION_GEAR_PRICE_BASE * Math.pow(nextBracket, COMPANION_GEAR_PRICE_EXPONENT));
}

export function canUpgradeCompanionGearSlot(currentLevel: number, playerLevel: number, coins: number): boolean {
  if (currentLevel >= COMPANION_GEAR_BRACKET_COUNT) return false;
  if (playerLevel < companionGearUpgradeRequiredLevel(currentLevel + 1)) return false;
  return coins >= companionGearUpgradeCoinCost(currentLevel);
}

// 槽位對應的加成 stat,呼應「寵物給經驗/金幣加成、坐騎給速度加成」的既有定位:
// pet 的 top/helmet/weapon 三格 → exp,pet 的 bottom/shoes 兩格 → coins;mount 全部 5 格 → speed。
const PET_GEAR_SLOT_STAT: Record<CompanionGearSlot, 'exp' | 'coins'> = {
  top: 'exp',
  helmet: 'exp',
  weapon: 'exp',
  bottom: 'coins',
  shoes: 'coins',
};

export const COMPANION_GEAR_SLOTS: CompanionGearSlot[] = ['top', 'bottom', 'helmet', 'shoes', 'weapon'];
export const COMPANION_GEAR_MAX_LEVEL = COMPANION_GEAR_BRACKET_COUNT;

// 給 UI(components/CompanionPanel.tsx)用:某個 kind+slot 目前對應到哪個 stat、目前等級換算成
// 多少加成百分比,不用自己重算槽位對應表跟每階數值。
export function companionGearSlotStat(kind: CompanionKind, slot: CompanionGearSlot): CompanionBonusStat {
  return kind === 'mount' ? 'speed' : PET_GEAR_SLOT_STAT[slot];
}

export function companionGearSlotBonusValue(level: number): number {
  return level * COMPANION_GEAR_BONUS_PER_BRACKET;
}

export interface CompanionGearBonusTotals {
  exp: number;
  coins: number;
  speed: number;
}

export function getCompanionGearBonusTotals(gear: CompanionGearState): CompanionGearBonusTotals {
  const totals: CompanionGearBonusTotals = { exp: 0, coins: 0, speed: 0 };
  for (const slot of COMPANION_GEAR_SLOTS) {
    totals[PET_GEAR_SLOT_STAT[slot]] += gear.pet[slot] * COMPANION_GEAR_BONUS_PER_BRACKET;
    totals.speed += gear.mount[slot] * COMPANION_GEAR_BONUS_PER_BRACKET;
  }
  return totals;
}
