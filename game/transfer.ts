import { Archetype } from './combat';

// 轉職碎片/證明:6 種 archetype 各自獨立蒐集碎片,湊滿 TRANSFER_FRAGMENTS_PER_PROOF 自動兌換成
// 1 個「轉職證明」,證明是切換到不同主職 archetype 時要消耗的門票(見 hooks/useGameState.ts 的
// setJob——同一 archetype 內只是換分支 A/B 不受影響,維持原本零成本自由切換)。
// 名稱依 6 種 archetype 的風味各自命名,呼應「打工人生」的整體世界觀。
export const TRANSFER_FRAGMENT_NAMES: Record<Archetype, string> = {
  physicalMelee: '工地師傅簽名殘片',
  physicalRanged: '外送評價殘片',
  physicalSupport: '店長簽核殘片',
  magicMelee: '符咒殘片',
  magicRanged: '離職證明殘片',
  magicSupport: '值班簽到殘片',
};

export const TRANSFER_PROOF_NAMES: Record<Archetype, string> = {
  physicalMelee: '工地師傅推薦信',
  physicalRanged: '金牌外送證明',
  physicalSupport: '店長在職證明',
  magicMelee: '開光證書',
  magicRanged: '離職證明書',
  magicSupport: '在職證明書',
};

export const TRANSFER_FRAGMENTS_PER_PROOF = 10;

const TRANSFER_ARCHETYPES = Object.keys(TRANSFER_FRAGMENT_NAMES) as Archetype[];

// 掉落機率刻意壓得比裝備掉落(game/equipment.ts 的 EQUIPMENT_DROP_CHANCE = 0.05)明顯更稀有,
// 且只在打贏本輪 5 大關的最終大魔王那一擊才會判定(見 hooks/useGameState.ts tickBattle),
// 不是每隻小怪都能觸發,所以絕對值其實比 3% 這個數字看起來更稀有。
const TRANSFER_FRAGMENT_DROP_CHANCE = 0.03;

// 中了不看目前主職/副職,6 種 archetype 等機率隨機挑一種,讓玩家有機會提前為以後想轉的職業囤碎片。
export function rollTransferFragmentDrop(rng: () => number = Math.random): Archetype | null {
  if (rng() >= TRANSFER_FRAGMENT_DROP_CHANCE) return null;
  return TRANSFER_ARCHETYPES[Math.floor(rng() * TRANSFER_ARCHETYPES.length)];
}

// 碎片湊滿 TRANSFER_FRAGMENTS_PER_PROOF 自動兌換成 1 個證明,餘數保留不丟棄
// (例如原本 9 片、這次又掉 1 片湊到 10 片 → 1 個證明 + 0 碎片;13 片同理 → 1 證明 + 3 碎片)。
export function applyTransferFragmentGain(
  fragments: Partial<Record<Archetype, number>>,
  proofs: Partial<Record<Archetype, number>>,
  archetype: Archetype
): { fragments: Partial<Record<Archetype, number>>; proofs: Partial<Record<Archetype, number>> } {
  const nextCount = (fragments[archetype] ?? 0) + 1;
  if (nextCount >= TRANSFER_FRAGMENTS_PER_PROOF) {
    return {
      fragments: { ...fragments, [archetype]: nextCount - TRANSFER_FRAGMENTS_PER_PROOF },
      proofs: { ...proofs, [archetype]: (proofs[archetype] ?? 0) + 1 },
    };
  }
  return { fragments: { ...fragments, [archetype]: nextCount }, proofs };
}
