import { JobTier } from './combat';

// 職業階級晉升(見 CLAUDE.md「轉職需要由玩家選擇」的設計決定,方案D):晉升不再是等級到門檻
// 就自動套用,改成玩家主動觸發一次「晉升試煉」——試煉沿用轉職副本同一組入場券池+難度公式
// (game/dungeon.ts 的 spendDungeonTicket/dungeonDifficultyMultiplier),打贏當下如果材料也
// 剛好夠付,才會真的把 jobTier 往上推一階;材料不夠或試煉輸了都不會升階(試煉輸了照樣扣一張
// 入場券,呼應既有轉職副本「有挑戰就算數,不看輸贏」的票務邏輯)。

// 晉升目標階級對應的材料門檻:直接沿用「目前材料階級 = 目前職業階級」的既有規則(見
// game/materials.ts 的 currentMaterialTier),數量隨目標階級遞增,呼應材料本身2:1合成比例
// 讓後期材料天然更稀有的節奏,不用另外校一組數字。
export function promotionMaterialCost(targetTier: JobTier): { skillBooks: number; enhanceStones: number } {
  const amount = targetTier * 3;
  return { skillBooks: amount, enhanceStones: amount };
}

export function nextJobTier(tier: JobTier): JobTier | null {
  return tier < 5 ? ((tier + 1) as JobTier) : null;
}
