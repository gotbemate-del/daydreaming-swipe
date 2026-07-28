import { JobTier } from './combat';

// 技能書/強化石的分階系統(初階+一階~五階,共6階),呼應職業轉職階級(JobTier 1-5)——
// 0 代表初階,對應「還沒選定主職(學生期)」或「不看階級一律能用」的最基礎材料。
// skillTree.ts/equipment.ts 各自有自己的一份 TieredMaterialCounts(技能書一份、強化石一份),
// 這個檔案只提供共用的階級形狀跟合成規則,不管「材料本身是什麼」。
export type MaterialTier = 0 | 1 | 2 | 3 | 4 | 5;
export const MATERIAL_TIERS: MaterialTier[] = [0, 1, 2, 3, 4, 5];

export const MATERIAL_TIER_LABELS: Record<MaterialTier, string> = {
  0: '初階',
  1: '一階',
  2: '二階',
  3: '三階',
  4: '四階',
  5: '五階',
};

// 階級識別色:給背包材料瀏覽頁(見 components/MaterialBrowserPanel.tsx)畫每一階的色塊用,
// 沒有專屬素材圖示時拿來當icon的替代——越後期越華麗(呼應 game/equipment.ts 武器分階配色
// 同樣的設計語言),刻意不用 #6ab0e0(全站保留給「互動中/選取中」訊號色,不能跟裝飾色混用)。
export const MATERIAL_TIER_COLORS: Record<MaterialTier, string> = {
  0: '#6a6a75',
  1: '#8b8698',
  2: '#7a9e7e',
  3: '#e0a05c',
  4: '#b389e0',
  5: '#c9a94f',
};

export type TieredMaterialCounts = Record<MaterialTier, number>;

export function createEmptyTieredMaterialCounts(): TieredMaterialCounts {
  return { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

// 舊存檔的單一數量(升級系統上線前的flat number)搬進新制:全部併入初階,不折算、不重新分配——
// 呼應「玩家已經囤的量不能平白消失」的既有慣例(見 lib/storage.ts 其他遷移註解的一貫做法)。
export function migrateFlatMaterialToTiered(flatCount: number): TieredMaterialCounts {
  return { ...createEmptyTieredMaterialCounts(), 0: flatCount };
}

// 目前角色能「使用/取得」的材料階級:直接對應職業轉職階級,不對應技能等級本身——
// 學生期(!hasChosenJob)固定是初階,呼應「維持現有掉落機制,初階不變」的既有設計決定。
export function currentMaterialTier(hasChosenJob: boolean, jobTier: JobTier): MaterialTier {
  return hasChosenJob ? jobTier : 0;
}

// 合成:兩本前一階換一本下一階,初階(0)不能合成,只能靠既有掉落機制取得。
export function canCraftMaterialTier(tier: MaterialTier, counts: TieredMaterialCounts): boolean {
  if (tier <= 0) return false;
  const prevTier = (tier - 1) as MaterialTier;
  return counts[prevTier] >= 2;
}

export function craftMaterialTier(tier: MaterialTier, counts: TieredMaterialCounts): TieredMaterialCounts {
  if (!canCraftMaterialTier(tier, counts)) return counts;
  const prevTier = (tier - 1) as MaterialTier;
  return { ...counts, [prevTier]: counts[prevTier] - 2, [tier]: counts[tier] + 1 };
}

// 6階加總:給常駐列這種「一眼掃過去有沒有東西」的簡略顯示用,不分階級細節——
// 真的要看各階數量去背包的技能書/強化石瀏覽頁(見 components/MaterialBrowserPanel.tsx)。
export function sumTieredMaterialCounts(counts: TieredMaterialCounts): number {
  return MATERIAL_TIERS.reduce<number>((sum, tier) => sum + counts[tier], 0);
}
