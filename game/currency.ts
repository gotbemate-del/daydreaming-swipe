import { Rarity } from './trigger';

// 觸發事件掉落的貨幣量,稀有度越高掉越多。
export const RARITY_COIN_DROP: Record<Rarity, number> = {
  common: 1,
  rare: 3,
  epic: 8,
  legendary: 20,
};

export function coinsForRarity(rarity: Rarity): number {
  return RARITY_COIN_DROP[rarity];
}

// 金幣意外之財:跟裝備/寵物/強化石/寶石掉落同一套獨立判定模式,每次擊殺額外判定一次,
// 多數時候沒有,中了就是這次擊殺基礎金幣的倍數,營造「這隻怪身上多帶了一包錢」的驚喜感。
const COIN_WINDFALL_CHANCE = 0.05;
const COIN_WINDFALL_MULTIPLIER = 5;

export function rollCoinWindfall(baseCoins: number, rng: () => number = Math.random): number {
  if (rng() >= COIN_WINDFALL_CHANCE) return 0;
  return baseCoins * COIN_WINDFALL_MULTIPLIER;
}
