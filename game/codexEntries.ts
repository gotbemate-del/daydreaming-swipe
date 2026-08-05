// 圖鑑條目(純邏輯,禁止 import React)。
//
// ## 一個條目 = 一張美術圖,底下的裝備就是它的「碎片」
//
// `assets/sprites/items` 有 **501 張**圖,而 `EQUIPMENT_ITEMS` 有 5668 件——
// 兩者不是一對一,是**一對多**:同一個(職業, 階級, 分支, 部位)的所有 bracket 共用一張圖。
// 每張圖背後 3~34 件,中位數 10 件。
//
// 這件事本來是個限制(「只有 501 張圖,5668 件沒辦法一件一張」),但把它翻過來看
// 剛好就是玩家要的碎片系統:**收集底下的裝備 = 湊那一件的碎片**,湊得越多等級越高。
// 好處是它完全不必發明新的儲存格式——碎片就是既有的 5668-bit bitset,
// 存檔一個欄位都不用改,舊存檔也不用遷移。
//
// ## 每一個條目綁一個屬性
//
// 湊到的等級換成「那個屬性的傷害 +N%」。為什麼安全:屬性只放大**元素與主動技能**,
// 而敵人戰力是照「最佳路線」算的,最佳路線是照 `attackMultiplier x heroMultiplier` 貪心挑——
// 元素與主動對那兩個數字的貢獻是 0。所以圖鑑收得再滿,敵人也不會跟著變強
//(見 game/collection.ts 的檔頭:**絕對不要讓圖鑑加戰力或加人數**)。
//
// 綁「單一屬性」而不是「全部屬性」是刻意的:它讓蒐集有方向感(「我還差雷的那幾件」),
// 而且每個屬性各自累積、各自封頂,不會出現「收滿一個屬性順便把八個都拉滿」。

import { EQUIPMENT_ITEMS, type EquipmentItem } from './equipment';
import { getCurrentTier } from './combat';
import { ELEMENTS, type RunSkillId } from './laneRunSkills';

export interface CodexEntry {
  /** 對應的美術圖檔名(不含副檔名)。跟 components/itemIcons.ts 的 key 是同一個字串。 */
  key: string;
  /** 顯示名稱(例如「八卦腰帶」)。 */
  name: string;
  /** 這一件放大哪一個屬性。 */
  element: RunSkillId;
  slot: string;
  /** 職業(學生/傳承款是 null)。 */
  archetype: string | null;
  /** 階級 1~5(學生/傳承款是 0)。 */
  tier: number;
  /** 底下有哪幾件裝備(EQUIPMENT_ITEMS 的索引 = bitset 的位置)。 */
  fragments: number[];
}

/**
 * 一件裝備屬於哪一個條目。**這個字串同時是圖檔名**,所以規則要跟
 * `assets/sprites/items` 的檔名完全對齊:
 *
 *   職業款   {archetype}_t{tier}_{slot}      A 分支與 tier1
 *   職業款   {archetype}_t{tier}_{slot}_b    B 分支(tier2 起才分岔)
 *   主手     {archetype}_t{tier}_1h / _2h    單手/雙手就是 A/B 的位置
 *   學生款   student_{slot} / legacy_sword
 */
export function entryKey(item: EquipmentItem): string {
  if (!item.archetype || item.requiredLevel === undefined) {
    return item.slot === 'mainhand' ? 'legacy_sword' : `student_${item.slot}`;
  }
  const tier = getCurrentTier(item.requiredLevel);
  const branch = tier === 1 || item.branch !== 'B' ? '' : '_b';
  const slot = item.slot === 'mainhand' ? (item.twoHanded ? '2h' : '1h') : `${item.slot}${branch}`;
  return `${item.archetype}_t${tier}_${slot}`;
}

/**
 * 一組同款裝備的顯示名稱。
 *
 * 生成式的名字長這樣:`{職稱}{品質詞}{基礎名詞}·Lv{等級}`,而同一個條目底下只有品質詞與
 * 等級會變——所以**取共同的後綴**就會剛好剩下基礎名詞(「八卦腰帶」「玉帶」)。
 *
 * 學生款與傳承款沒有這個結構(素色披風 / 厚重斗篷 完全不同字),共同後綴會是空字串,
 * 那時候退回**最短的那個名字**(布帽、眼罩),它們本來就已經是乾淨的名詞。
 */
function displayName(names: string[]): string {
  const stripped = names.map((n) => n.replace(/·Lv\d+$/, ''));
  let suffix = stripped[0];
  for (const n of stripped.slice(1)) {
    let k = 0;
    while (k < suffix.length && k < n.length && suffix[suffix.length - 1 - k] === n[n.length - 1 - k]) k += 1;
    suffix = suffix.slice(suffix.length - k);
  }
  if (suffix.length >= 2) return suffix;
  return stripped.reduce((a, b) => (b.length < a.length ? b : a));
}

/**
 * 這個條目綁哪一個屬性。用 key 的雜湊,所以**同一件永遠是同一個屬性**
 *(玩家記得住「這件是雷的」,而且重灌也一樣)。
 * 用雜湊而不是「照順序輪流」:照順序的話同一個職業的整排會落在連續的屬性上,
 * 看起來像「這個職業專出雷」,而八個屬性的收集難度就不一樣了。
 */
function elementForKey(key: string): RunSkillId {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ELEMENTS[((h ^ (h >>> 16)) >>> 0) % ELEMENTS.length];
}

function build(): CodexEntry[] {
  const groups = new Map<string, { indices: number[]; names: string[]; item: EquipmentItem }>();
  EQUIPMENT_ITEMS.forEach((item, index) => {
    const key = entryKey(item);
    const g = groups.get(key);
    if (g) { g.indices.push(index); g.names.push(item.name); }
    else groups.set(key, { indices: [index], names: [item.name], item });
  });
  return [...groups.entries()].map(([key, g]) => ({
    key,
    name: displayName(g.names),
    element: elementForKey(key),
    slot: g.item.slot,
    archetype: g.item.archetype ?? null,
    tier: g.item.requiredLevel === undefined ? 0 : getCurrentTier(g.item.requiredLevel),
    fragments: g.indices,
  }));
}

/** 全部條目。順序 = EQUIPMENT_ITEMS 第一次出現的順序,所以是穩定的。 */
export const CODEX_ENTRIES: CodexEntry[] = build();

/** 一件最多幾級。 */
export const MAX_ENTRY_LEVEL = 5;

/**
 * 湊到幾片 → 第幾級。0 片 = 還沒收到(0 級,不給加成)。
 * 用比例而不是固定片數:每一條目的碎片數差很多(3~34 件),固定片數會讓
 * 碎片少的那幾件一收到就滿級、碎片多的永遠升不上去。
 */
export function entryLevel(own: number, total: number): number {
  if (own <= 0 || total <= 0) return 0;
  return Math.min(MAX_ENTRY_LEVEL, Math.max(1, Math.round((MAX_ENTRY_LEVEL * own) / total)));
}

/** 每一級給那個屬性加幾成。 */
export const ENTRY_BONUS_PER_LEVEL = 0.01;
/**
 * 單一屬性最多加幾成。
 *
 * 每個屬性平均分到 63 個條目 x 5 級 = 理論上 +315%,所以**一定要封頂**,
 * 不然收滿的玩家會讓元素強到蓋過所有其他選擇。+100%(x2)是「看得出來但沒有壓過技能等級」
 * 的位置:元素本身一場能點到 5 級,圖鑑再乘 2 是「同一件事做得更好」,不是換一個遊戲。
 *
 * 封頂之後那個屬性再收就沒有加成了,這是刻意的——它把蒐集推向**分散**
 * (八個屬性各收一點)而不是「把某一個職業的裝備刷滿」。
 */
export const MAX_ELEMENT_BONUS = 1.0;
