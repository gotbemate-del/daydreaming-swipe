// 裝備圖鑑(純邏輯,禁止 import React)。
//
// ## 為什麼是「圖鑑」而不是「穿裝備」
//
// `game/equipment.ts` 那 5668 件是為姊妹作的掛機迴圈長出來的,直接接過來有三個硬衝突:
// 加成只有 `speed`/`exp`/`coins`(speed 對應到跑速,而跑速是難度旋鈕,鐵則禁止養成碰)、
// `exp` 沒有對應物、5650 件綁 `requiredLevel` 而這款沒有等級。
//
// 改成圖鑑之後三個衝突同時消失:**圖鑑只在乎「這件有沒有收到」**,
// 原本那三個加成欄位一個都不用讀,`requiredLevel` 也不必換算成別的東西。
// 那 5668 件因此從「數值棒」變成「內容」——要蒐集的東西。
//
// ## 圖鑑給的兩樣東西,都刻意在理想路線之外
//
//   屬性加成    放大元素與主動的效果(跟技能書同一條軸)
//   技能書掉落率 完全不影響戰鬥
//
// 第一項安全的理由跟技能書一模一樣:敵人戰力照「最佳路線」算,而最佳路線是照
// attackMultiplier x heroMultiplier 貪心挑,元素與主動對這兩個數字的貢獻是 0。
// 第二項根本不進戰鬥。所以圖鑑收得再滿,敵人也不會跟著變強——
// 它抬的是地板(失誤之後救得回來多少),不是天花板。
//
// **絕對不要讓圖鑑加戰力或加人數。** 那兩個是貪心看得到的,敵人會立刻跟著長,
// 玩家蒐集了半天卻感覺不到差別(CLAUDE.md 記過三次同一個錯)。

import { EQUIPMENT_ITEMS } from './equipment';
import {
  CODEX_ENTRIES, ENTRY_BONUS_PER_LEVEL, entryLevel, MAX_ELEMENT_BONUS, type CodexEntry,
} from './codexEntries';
import { ACTIVE_SKILL_IDS, type RunSkillId } from './laneRunSkills';

/** 圖鑑總共幾件。 */
export const TOTAL_ITEMS = EQUIPMENT_ITEMS.length;

// ---- 收集狀態:5668 個 bit ----
//
// 存成「已收集的 id 陣列」的話,滿收的存檔會是幾萬個字;bitset 壓完是 709 bytes,
// 轉 base64 約 950 字,localStorage 完全吃得下,而且讀寫都是 O(1)。

const BYTES = Math.ceil(TOTAL_ITEMS / 8);
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** 每一件在 bitset 裡的位置。用陣列順序,所以**不要重排 EQUIPMENT_ITEMS**。 */
const INDEX_OF = new Map<string, number>(EQUIPMENT_ITEMS.map((item, i) => [item.id, i]));

export function itemIndex(id: string): number {
  return INDEX_OF.get(id) ?? -1;
}

export function emptyCollection(): Uint8Array {
  return new Uint8Array(BYTES);
}

export function hasItem(bits: Uint8Array, index: number): boolean {
  if (index < 0 || index >= TOTAL_ITEMS) return false;
  return (bits[index >> 3] & (1 << (index & 7))) !== 0;
}

/** 收下一件。回傳「這件本來沒有」,呼叫端拿它判斷是不是新發現。 */
export function addItem(bits: Uint8Array, index: number): boolean {
  if (index < 0 || index >= TOTAL_ITEMS) return false;
  if (hasItem(bits, index)) return false;
  bits[index >> 3] |= 1 << (index & 7);
  return true;
}

export function collectedCount(bits: Uint8Array): number {
  let n = 0;
  for (const byte of bits) {
    let v = byte;
    while (v) { n += v & 1; v >>= 1; }
  }
  return n;
}

/** 收集率 0~1。 */
export function collectionRatio(bits: Uint8Array): number {
  return TOTAL_ITEMS === 0 ? 0 : collectedCount(bits) / TOTAL_ITEMS;
}

// base64 自己寫:RN 沒有 btoa/atob,而為了一個編碼多拉一個套件不值得。
export function encodeCollection(bits: Uint8Array): string {
  // 尾端的全 0 位元組不寫出來:新玩家的圖鑑是空的,不修的話每一份存檔都會多帶 950 個 'A'。
  let last = bits.length;
  while (last > 0 && bits[last - 1] === 0) last -= 1;
  bits = bits.subarray(0, last);
  let out = '';
  for (let i = 0; i < bits.length; i += 3) {
    const a = bits[i], b = bits[i + 1] ?? 0, c = bits[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  return out;
}

/**
 * base64 → bitset。**壞掉的字串一律當成空圖鑑,不丟例外**——存檔是玩家改得動的,
 * 而圖鑑壞掉的症狀應該是「重新收集」,不是白畫面(見 game/save.ts 的原則)。
 */
export function decodeCollection(text: unknown): Uint8Array {
  const bits = emptyCollection();
  if (typeof text !== 'string') return bits;
  let byte = 0;
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const v = B64.indexOf(text[i + k] ?? 'A');
      n = (n << 6) | (v < 0 ? 0 : v);
    }
    for (let k = 2; k >= 0; k--) {
      if (byte < BYTES) bits[byte++] = (n >> (k * 8)) & 255;
    }
  }
  // 超出總數的那幾個 bit 一律清掉,不然改過的存檔會讓 collectedCount 大於 TOTAL_ITEMS。
  const extra = BYTES * 8 - TOTAL_ITEMS;
  if (extra > 0) bits[BYTES - 1] &= 255 >> extra;
  return bits;
}

// ---- 圖鑑給的兩樣東西 ----

/** 圖鑑收滿時,**主動技能**的效果最多放大幾成(元素改走逐屬性,見下面)。 */
export const COLLECTION_FLAVOUR_BONUS = 0.5;
/**
 * 收集率 → 主動技能的放大倍率(1 = 沒有加成)。
 * 線性:蒐集是長期的事,前段就要看得到數字在動,不然沒有人會開始收。
 */
export function collectionFlavourScale(bits: Uint8Array): number {
  return 1 + COLLECTION_FLAVOUR_BONUS * collectionRatio(bits);
}

/** 一個圖鑑條目現在的進度。畫面與加成計算共用,不要各寫一份。 */
export interface EntryProgress {
  entry: CodexEntry;
  /** 湊到幾片 */
  own: number;
  /** 總共幾片 */
  total: number;
  /** 第幾級(0 = 還沒收到) */
  level: number;
  /** 這一件現在給那個屬性加幾成 */
  bonus: number;
}

export function entryProgress(bits: Uint8Array, entry: CodexEntry): EntryProgress {
  let own = 0;
  for (const index of entry.fragments) if (hasItem(bits, index)) own += 1;
  const level = entryLevel(own, entry.fragments.length);
  return { entry, own, total: entry.fragments.length, level, bonus: level * ENTRY_BONUS_PER_LEVEL };
}

/**
 * 圖鑑現在給每一個技能的放大倍率。
 *
 * **八元素各自累積**(綁在條目上的那個屬性),主動技能則吃整體收集率——
 * 主動只有四款,綁單一條目的話會出現「這四件特別重要」,而圖鑑不該有必收的單品。
 *
 * 回傳的是「技能 id → 倍率」,`runSkillEffects` 直接查表。
 * **鋒刃/增殖 不在表裡**(查不到就是 1):它們是唯二進理想路線的,
 * 碰了敵人就會跟著變強,玩家蒐集半天卻感覺不到差別(CLAUDE.md 記過三次同一個錯)。
 */
export function collectionScales(bits: Uint8Array): Partial<Record<RunSkillId, number>> {
  const perElement = new Map<RunSkillId, number>();
  for (const entry of CODEX_ENTRIES) {
    const { bonus } = entryProgress(bits, entry);
    if (bonus > 0) perElement.set(entry.element, (perElement.get(entry.element) ?? 0) + bonus);
  }
  const out: Partial<Record<RunSkillId, number>> = {};
  for (const [element, bonus] of perElement) out[element] = 1 + Math.min(MAX_ELEMENT_BONUS, bonus);
  const active = collectionFlavourScale(bits);
  for (const id of ACTIVE_SKILL_IDS) out[id] = active;
  return out;
}

/** 沒有圖鑑時,一場跑圖掉到技能書的機率。 */
export const BASE_BOOK_DROP = 0.02;
/** 圖鑑收滿時的機率。 */
export const MAX_BOOK_DROP = 0.12;
/** 這一場掉到技能書的機率。 */
export function bookDropChance(bits: Uint8Array): number {
  return BASE_BOOK_DROP + (MAX_BOOK_DROP - BASE_BOOK_DROP) * collectionRatio(bits);
}

/**
 * 一場跑圖掉幾件裝備。
 *
 * 通關掉得多、陣亡也掉得到(只是少)——**陣亡完全不掉的話,卡關的人會完全沒有進展**,
 * 而圖鑑正是拿來讓卡關的人有事做的(它抬地板)。
 */
export function dropCountForRun(cleared: boolean): number {
  return cleared ? 3 : 1;
}

/**
 * 這一場掉到哪幾件。**優先掉還沒收到的**——圖鑑的樂趣是「又多一件」,
 * 而 5668 件裡重複掉落的機率極高,不去重的話玩家會連續幾十場都看不到新的東西。
 *
 * 用傳進來的 rng(跑圖的 seed),所以同一場的掉落可以重現,驗證才對得起來。
 */
export function rollDrops(bits: Uint8Array, count: number, rng: () => number): number[] {
  const out: number[] = [];
  if (collectedCount(bits) >= TOTAL_ITEMS) return out;
  const taken = new Set<number>();
  // 隨機起點往後找第一個還沒收到的:比「重抽到沒收過為止」穩定(收到 99% 時不會退化成無限迴圈)。
  for (let k = 0; k < count; k++) {
    const start = Math.floor(rng() * TOTAL_ITEMS);
    for (let step = 0; step < TOTAL_ITEMS; step++) {
      const index = (start + step) % TOTAL_ITEMS;
      if (!hasItem(bits, index) && !taken.has(index)) {
        taken.add(index);
        out.push(index);
        break;
      }
    }
  }
  return out;
}

/**
 * 只從**某一個屬性**的條目裡抽掉落。裝備副本用的就是這一支。
 *
 * 為什麼不重用 `rollDrops` 再過濾:那一支是在**整個 5668 件的圈**上找下一個沒收到的,
 * 過濾之後會退化成「大部分的位置都不合格」——收到後期要繞幾千步才找得到一件,
 * 而且屬性越冷門繞得越久。這裡先把該屬性的碎片攤成一份候選清單再抽,
 * 步數只跟那個屬性的件數有關。
 *
 * 跟 `rollDrops` 一樣**優先掉還沒收到的**:圖鑑的樂趣是「又多一件」,
 * 而副本一次掉 5~15 件,不去重的話一整批可能全是重複的,玩家會以為副本壞了。
 * 那個屬性收滿了就回空陣列(呼叫端要看得出來,才能提示玩家換一天再來)。
 */
export function rollDropsForElement(
  bits: Uint8Array, count: number, element: RunSkillId, rng: () => number,
): number[] {
  const pool: number[] = [];
  for (const entry of CODEX_ENTRIES) {
    if (entry.element !== element) continue;
    for (const index of entry.fragments) if (!hasItem(bits, index)) pool.push(index);
  }
  if (pool.length === 0) return [];
  // 洗牌之後取前幾個。逐個亂數挑再去重的話,count 接近 pool.length 時會一直撞到重複。
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, Math.floor(count)));
}

/** 某一個屬性底下總共有幾件、收到幾件。畫面拿它顯示「火 132/940」。 */
export function elementProgress(bits: Uint8Array, element: RunSkillId): { got: number; total: number } {
  let got = 0;
  let total = 0;
  for (const entry of CODEX_ENTRIES) {
    if (entry.element !== element) continue;
    for (const index of entry.fragments) {
      total += 1;
      if (hasItem(bits, index)) got += 1;
    }
  }
  return { got, total };
}

/** 圖鑑裡的一件。畫面拿它顯示名稱與顏色。 */
export function itemAt(index: number) {
  return EQUIPMENT_ITEMS[index];
}
