// 存檔(純邏輯,禁止 import React,也禁止 import AsyncStorage)。
//
// 這一層只做三件事:**定義格式、驗證、遷移**。真正的讀寫在 hooks/useSave.ts,
// 因為儲存體是平台的東西(web 是 localStorage、原生是 AsyncStorage),而這個檔要能在 Node 單獨跑
// ——`scripts/verify-save.ts` 就是靠這一點在 CI 裡模擬「舊存檔載入」。
//
// ## 為什麼不沿用姊妹作的 v36
//
// 那份 schema 是為掛機迴圈長出來的:離線收益的時間戳、裝備背包、寵物、經驗值、輪迴次數……
// 這款一個都沒有(離線收益明文禁止、經驗值不做、裝備還沒接)。硬搬過來的話,
// 90% 的欄位是空的,而且每一個空欄位都是一個「以後會有人以為它有用」的陷阱。
// 從 v1 重新開始,欄位少到一眼看得完。
//
// ## 核心原則:**不信任存檔內容**
//
// 存檔在 web 上就是 localStorage,玩家(或任何一個分頁裡的 script)改得動。所以讀進來的東西
// 一律當成「來路不明的 JSON」:每個欄位各自驗證、各自夾回合法範圍,**壞掉的欄位只丟那一個,
// 不是整份丟掉**——整份丟掉的話,一個手滑的 coins 欄位會讓玩家失去 300 關的進度。
// 反過來,驗證失敗也絕對不能丟例外:存檔壞掉的症狀應該是「回到預設值」,不是白畫面。

import { LEVELS_PER_CHAPTER, TOTAL_CHAPTERS } from './laneRun';
import { MAX_SKILL_LEVEL, MAX_SKILL_SLOTS, SKILLS, type SkillId, type SkillState } from './laneSkills';
import { MAX_SKILL_BOOK_LEVEL } from './laneRunSkills';
import { decodeCollection, encodeCollection } from './collection';

/**
 * 存檔格式版本。**改動任何欄位的意義就要 +1,並在 MIGRATIONS 補一條。**
 * 只是新增一個「有預設值的欄位」不必升版:readSave 會幫沒有的欄位補預設值。
 */
export const SAVE_VERSION = 3;

/** localStorage / AsyncStorage 的 key。改這個等於讓所有人的存檔消失,不要改。 */
export const SAVE_KEY = 'daydreaming-swipe/save';

/** 一共幾個小關。存檔的 stage 不能超過這個數字(改過的存檔會被夾回來)。 */
export const TOTAL_STAGES = TOTAL_CHAPTERS * LEVELS_PER_CHAPTER;

const ARCHETYPE_IDS = [
  'physicalMelee', 'physicalRanged', 'physicalSupport',
  'magicMelee', 'magicRanged', 'magicSupport',
] as const;
export type SavedArchetype = (typeof ARCHETYPE_IDS)[number];

/**
 * 存檔裡的職業。刻意**用自己的型別而不是直接存 LaneJob**:
 * LaneJob 是 laneJobs 的內部型別,以後那邊改欄位不該讓所有人的存檔失效。
 * 這一層是邊界,兩邊各自演化,中間靠 readSave 轉換。
 */
export interface SavedJob {
  archetype: SavedArchetype;
  branch: 'A' | 'B';
  tier: 1 | 2 | 3 | 4 | 5;
}

/**
 * 存檔內容。**只存「跨場留下來的東西」**——跑圖中的狀態(波次、場內技能、飛行中的武器)
 * 一律不存:那些東西跑完就沒了,存下來只會製造「復原到一半的一場」這種永遠測不完的狀態。
 */
export interface SaveData {
  version: number;
  /** 目前打到第幾個小關(1 = 1-1)。通關才會 +1,陣亡維持不變。 */
  stage: number;
  /** 轉職結果。還沒轉職就是 null(學生)。 */
  job: SavedJob | null;
  /** 永久技能(每關通關三選一)。 */
  skills: SkillState[];
  /** 跨場累積的金幣。 */
  coins: number;
  /**
   * 技能書等級。生存模式掉的就是這個,**只往上開元素與主動的等級上限與選項保證**
   * (見 laneRunSkills 的 MAX_SKILL_BOOK_LEVEL)——它碰不到理想路線,所以敵人不會跟著變強。
   */
  books: number;
  /** 生存模式的最佳紀錄:連續過了幾關。純紀錄,不影響數值。 */
  bestSurvival: number;
  /**
   * 裝備圖鑑:5668 個 bit 壓成 base64(見 game/collection.ts)。
   * 存 id 陣列的話滿收會是幾萬個字,bitset 壓完約 950 字。
   */
  collected: string;
}

export const DEFAULT_SAVE: SaveData = {
  version: SAVE_VERSION,
  stage: 1,
  job: null,
  skills: [],
  coins: 0,
  books: 0,
  bestSurvival: 0,
  collected: '',
};

/** 全新的一份存檔。回傳新物件,呼叫端改它不會污染 DEFAULT_SAVE。 */
export function newSave(): SaveData {
  return { ...DEFAULT_SAVE, skills: [] };
}

// ---- 各欄位的驗證 ----
// 每一個都是「壞掉就回預設值」,不丟例外。

function readInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function readJob(value: unknown): SavedJob | null {
  if (value === null || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const archetype = ARCHETYPE_IDS.find((a) => a === raw.archetype);
  if (archetype === undefined) return null;
  const branch = raw.branch === 'B' ? 'B' : 'A';
  const tier = readInt(raw.tier, 1, 1, 5) as SavedJob['tier'];
  return { archetype, branch, tier };
}

/**
 * 技能清單。三件事同時擋:未知的 id、超過上限的等級、超過格數的清單。
 * **同一個 id 出現兩次也要擋**——`skillLevel` 只讀第一個,重複的那個會變成看不見的幽靈,
 * 而它在 `skillOffers` 那邊會佔掉一個格子。
 */
function readSkills(value: unknown): SkillState[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>(SKILLS.map((s) => s.id));
  const seen = new Set<string>();
  const out: SkillState[] = [];
  for (const item of value) {
    if (item === null || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.id !== 'string' || !known.has(raw.id) || seen.has(raw.id)) continue;
    const level = readInt(raw.level, 0, 0, MAX_SKILL_LEVEL);
    if (level <= 0) continue; // 0 級等於沒學,留著只是雜訊
    seen.add(raw.id);
    out.push({ id: raw.id as SkillId, level });
    if (out.length >= MAX_SKILL_SLOTS) break;
  }
  return out;
}

/**
 * 遷移表:`MIGRATIONS[n]` 把 **v(n) 的資料轉成 v(n+1)**。
 *
 * 目前是空的(v1 是第一版),但表本身要先存在:等到真的要升版的時候,
 * 有表就只是加一個函式,沒表就會有人在 readSave 裡塞 if-else,第三次升版之後沒人看得懂。
 * 遷移函式拿到的是**還沒驗證過**的 raw 物件,所以裡面一樣不能假設任何欄位存在。
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // v1 → v2:生存模式與技能書上線。兩個都是新欄位,舊存檔沒有就是 0,
  // 所以這一步其實只要改版號——但**還是要留這一條**,不然「v1 存檔」會走到
  // 「沒有對應遷移就直接跳版」那條路徑,以後真的需要轉換欄位時很容易漏掉。
  1: (raw) => ({ ...raw, version: 2, books: raw.books ?? 0, bestSurvival: raw.bestSurvival ?? 0 }),
  // v2 → v3:裝備圖鑑上線。舊存檔沒收過任何東西,所以是空字串。
  2: (raw) => ({ ...raw, version: 3, collected: raw.collected ?? '' }),
};

/**
 * 把存進去的字串讀回來。**任何情況都會回傳一份可用的存檔,不會丟例外。**
 *
 * 處理順序:解析 JSON → 依版本逐級遷移 → 逐欄位驗證。
 * 三個階段各自都可能失敗,失敗就退回預設值(整份或單一欄位)。
 *
 * `migrated` 告訴呼叫端「這份存檔被改寫過」,好讓它立刻寫回去——不寫回去的話,
 * 舊格式會一直留在硬碟上,每次開遊戲都遷移一次,而且下一版的遷移鏈會愈接愈長。
 */
export function readSave(text: string | null | undefined): { save: SaveData; migrated: boolean } {
  if (typeof text !== 'string' || text.trim() === '') return { save: newSave(), migrated: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // 壞掉的 JSON:當成沒有存檔。這裡刻意不丟例外——存檔壞掉的症狀應該是「重新開始」,
    // 不是白畫面(在 web 上白畫面等於玩家再也進不去,連清存檔的入口都沒有)。
    return { save: newSave(), migrated: true };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { save: newSave(), migrated: true };
  }

  let raw = parsed as Record<string, unknown>;
  // 沒有 version 欄位的一律當 v0(這款上線前的那些),讓它走一次完整的遷移鏈。
  let version = readInt(raw.version, 0, 0, Number.MAX_SAFE_INTEGER);
  let migrated = version !== SAVE_VERSION;

  // 比程式還新的存檔不要硬吃:它可能有這個版本讀不懂的欄位意義,照著讀會產生
  // 「看起來正常但其實錯了」的進度。整份重來雖然痛,但至少是看得見的。
  if (version > SAVE_VERSION) return { save: newSave(), migrated: true };

  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    // 沒有對應的遷移函式(例如 v0 → v1,因為 v1 之前根本沒有正式格式):
    // 不猜,直接往上跳一版,讓下面的逐欄位驗證去收拾——欄位名稱剛好對得上的就留著,
    // 對不上的各自退回預設值。這比整份丟掉溫和,也比亂猜安全。
    raw = step ? step(raw) : raw;
    version += 1;
  }

  return {
    save: {
      version: SAVE_VERSION,
      stage: readInt(raw.stage, 1, 1, TOTAL_STAGES),
      job: readJob(raw.job),
      skills: readSkills(raw.skills),
      coins: readInt(raw.coins, 0, 0, Number.MAX_SAFE_INTEGER),
      books: readInt(raw.books, 0, 0, MAX_SKILL_BOOK_LEVEL),
      bestSurvival: readInt(raw.bestSurvival, 0, 0, TOTAL_STAGES),
      // 圖鑑走 decode → encode 一圈:壞掉的字串會變成空圖鑑,超出總數的 bit 也會被清掉。
      collected: encodeCollection(decodeCollection(raw.collected)),
    },
    migrated,
  };
}

/** 存檔轉成要寫進去的字串。 */
/**
 * 生存模式撐過幾關換到幾級技能書。
 *
 * 門檻刻意用「連續過幾關」而不是「累積打了幾關」:生存模式的壓力就在**不能失手**,
 * 用累積的話它會退化成「多打幾次就有」,跟一般模式沒兩樣。
 */
export const SURVIVAL_BOOK_THRESHOLDS = [3, 6, 10, 15, 21];

/** 撐過 streak 關對應到的技能書等級(取歷史最好的那次,不是這一次)。 */
export function booksForSurvival(bestStreak: number): number {
  return SURVIVAL_BOOK_THRESHOLDS.filter((t) => bestStreak >= t).length;
}

export function writeSave(save: SaveData): string {
  return JSON.stringify({ ...save, version: SAVE_VERSION });
}
