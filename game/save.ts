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

import { LEVELS_PER_CHAPTER, LONG_LEVEL_WAVES, TOTAL_CHAPTERS, WAVES_PER_LEVEL } from './laneRun';
import { MAX_SKILL_LEVEL, MAX_SKILL_SLOTS, SKILLS, type SkillId, type SkillState } from './laneSkills';
import { MAX_SKILL_BOOK_LEVEL, rescaleLegacyBookLevel } from './laneRunSkills';
import { decodeCollection, encodeCollection } from './collection';
import { isQuestCounter, isQuestId, type QuestCounters } from './quests';

/**
 * 存檔格式版本。**改動任何欄位的意義就要 +1,並在 MIGRATIONS 補一條。**
 * 只是新增一個「有預設值的欄位」不必升版:readSave 會幫沒有的欄位補預設值。
 */
export const SAVE_VERSION = 6;

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
   * 技能書等級(0 ~ 100)。**放大元素與主動的效果幅度**,見 laneRunSkills 的 bookBonus。
   *
   * 主要來源是「每通一關給一本」,生存模式的門檻再給前面幾級當助跑。
   * 它碰不到理想路線(元素與主動全部在理想路線之外),所以敵人不會跟著變強——
   * 這也是它敢開到 100 級的原因,而永久技能只敢給 +45%。
   */
  books: number;
  /** 生存模式的最佳紀錄:一輪連續撐過幾**波**。純紀錄,不影響數值。 */
  bestSurvival: number;
  /**
   * 背景音樂關掉了沒。
   *
   * **這是唯一一個「不是進度」的存檔欄位**,而它非存不可:玩家關掉音樂之後
   * 每次重開又自己播起來,那比沒有音樂還糟。新增有預設值的欄位不必升版號
   *(readSave 會幫沒有的欄位補預設),所以舊存檔進來就是「開著」。
   */
  bgmOff: boolean;
  /**
   * 背景音樂與音效各自的音量(0~1)。
   *
   * 為什麼跟 bgmOff 並存而不是「音量 0 就等於關掉」:靜音是一個**要能立刻復原**的動作
   * (旁邊有人講話、進了會議),而音量是一個**偏好**。合成一個數字的話,玩家為了暫時靜音
   * 把滑桿拉到 0,之後想開回來只能憑記憶找回原本的位置。
   *
   * 兩條分開存也是因為它們的用途不同:音樂是可以完全不要的背景,音效是**回饋**
   * (被打中、通關、選到技能),不少人會把音樂關掉但把音效留著。
   */
  bgmVolume: number;
  sfxVolume: number;
  /**
   * 裝備圖鑑:5668 個 bit 壓成 base64(見 game/collection.ts)。
   * 存 id 陣列的話滿收會是幾萬個字,bitset 壓完約 950 字。
   */
  collected: string;
  /**
   * 任務:已經**領過獎**的任務 id。
   *
   * 存的是「領過獎」不是「達成了」,兩者刻意不同:達成與否一律**現算**
   * (見 game/quests.ts 的檔頭),存下來就會跟本尊不同步,而那種 bug 的症狀是
   * 「任務永遠完成不了」——玩家看得到卻做不到。只有「領過了沒」是真正的一次性事實,
   * 算不出來,非存不可。
   */
  questsClaimed: string[];
  /**
   * 任務的事件計數器(開過幾次設定、進過幾次裝備副本…)。
   *
   * 只有任務才在乎的東西才進這裡;打到第幾關、幾本技能書那些存檔本來就有,
   * 一律現算。加一個新的 key **不必升版號**——讀不到就是 0。
   */
  questCounters: QuestCounters;
}

/** 音量預設值。BGM 這一份的峰值很滿,1.0 會把音效整個蓋掉(見 hooks/useBgm.ts)。 */
export const DEFAULT_BGM_VOLUME = 0.35;
export const DEFAULT_SFX_VOLUME = 0.6;

export const DEFAULT_SAVE: SaveData = {
  version: SAVE_VERSION,
  stage: 1,
  job: null,
  skills: [],
  coins: 0,
  books: 0,
  bestSurvival: 0,
  bgmOff: false,
  bgmVolume: DEFAULT_BGM_VOLUME,
  sfxVolume: DEFAULT_SFX_VOLUME,
  collected: '',
  questsClaimed: [],
  questCounters: {},
};

/** 全新的一份存檔。回傳新物件,呼叫端改它不會污染 DEFAULT_SAVE。 */
export function newSave(): SaveData {
  // 三個可變的欄位各自給新的實體,不然呼叫端改它會污染 DEFAULT_SAVE
  // (症狀是「開新遊戲卻帶著上一輪的任務進度」,而且只在同一個分頁裡重開才會出現)。
  return { ...DEFAULT_SAVE, skills: [], questsClaimed: [], questCounters: {} };
}

// ---- 各欄位的驗證 ----
// 每一個都是「壞掉就回預設值」,不丟例外。

function readInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/** 音量:0~1 的小數,**不取整**(readInt 會把 0.35 變成 0)。壞掉就回預設值。 */
function readVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
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
 * 已領獎的任務 id。**不認得的 id 一律丟掉**——任務刪掉之後它的 id 就沒有意義了,
 * 留著只會讓 `questsClaimed.length` 這種數字慢慢失真。重複的也只留一個。
 */
function readQuestsClaimed(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === 'string' && isQuestId(item)) seen.add(item);
  }
  return [...seen];
}

/**
 * 任務計數器。逐 key 驗證:不認得的 key 丟掉、值不是數字或為負的一律當 0。
 *
 * 上限夾在一個很大的數字而不是不夾:計數器只拿來跟任務的 target 比大小,
 * 但改過的存檔塞一個 Infinity 進來的話,畫面上的進度條會算出 NaN。
 */
function readQuestCounters(value: unknown): QuestCounters {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: QuestCounters = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isQuestCounter(key)) continue;
    const n = readInt(raw, 0, 0, Number.MAX_SAFE_INTEGER);
    if (n > 0) out[key] = n;
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
  // v3 → v4:生存模式改成「一條連續的跑圖」,分數的單位從**關**變成**波**。
  // 舊存檔的 bestSurvival 是關數,乘上一關的波數才是等值的波數——不換算的話,
  // 撐過 21 關的老玩家會突然變成「撐過 21 波」,技能書等級當場從 5 級掉到 0 級。
  3: (raw) => ({
    ...raw,
    version: 4,
    bestSurvival: Math.round(readNumber(raw.bestSurvival, 0) * WAVES_PER_LEVEL),
  }),
  // v4 → v5:技能書上限從 5 級開到 100 級,而且曲線換成冪次(見 laneRunSkills 的 bookBonus)。
  // **舊等級要換算成「放大倍率相同」的新等級**:直接沿用數字的話,舊玩家的滿書
  // 會從 x1.75 掉到 x1.18,那是一次他完全不知道原因的削弱。
  // (5 級 → 37 級、3 級 → 19 級、1 級 → 5 級。)
  4: (raw) => ({
    ...raw,
    version: 5,
    books: rescaleLegacyBookLevel(readNumber(raw.books, 0)),
  }),
  // v5 → v6:任務系統與三種副本上線。兩個都是新欄位,舊存檔沒有就是「一個都沒領、
  // 計數器全 0」,所以這一步只要補空值。
  //
  // **為什麼是 v6 而不是把任務欄位塞進 v5**:v5 已經上線了(技能書上限那一版),
  // 玩家硬碟上真的有 v5 的存檔。同一個版號給兩種意義的話,遷移鏈就再也分不出
  // 「這份 v5 有沒有跑過技能書換算」——而那一步是不可重入的(換算兩次會把 5 級變成 100 級)。
  // 版號寧可多跳一格,也不要讓一個號碼代表兩件事。
  //
  // **刻意不幫老玩家把已經達成的任務標成已領**:達成與否是現算的,所以打到第 50 關的
  // 老玩家一載入就會看到前面十幾個任務全部亮著「可領獎」——那是對的,那些獎勵他本來
  // 就該拿。反過來把它們標成「已領」的話,等於在升版的瞬間默默沒收一批獎勵。
  5: (raw) => ({ ...raw, version: 6, questsClaimed: raw.questsClaimed ?? [], questCounters: raw.questCounters ?? {} }),
};

/** 遷移用的寬鬆數字讀取。遷移函式拿到的是還沒驗證過的 raw,所以不能假設型別。 */
function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

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
      // 上限是「全部小關 x 一關最多幾波」——改過的存檔會被夾回來。
      bestSurvival: readInt(raw.bestSurvival, 0, 0, TOTAL_STAGES * LONG_LEVEL_WAVES),
      // 不是 true 就一律當成「開著」——壞掉的欄位要退回「有音樂」,那是預設的體驗。
      bgmOff: raw.bgmOff === true,
      // 音量壞掉要退回預設值(不是退回 0)。退回 0 的話症狀是「遊戲沒聲音」,
      // 而玩家不會聯想到存檔壞掉,只會覺得音效功能是壞的。
      bgmVolume: readVolume(raw.bgmVolume, DEFAULT_BGM_VOLUME),
      sfxVolume: readVolume(raw.sfxVolume, DEFAULT_SFX_VOLUME),
      // 圖鑑走 decode → encode 一圈:壞掉的字串會變成空圖鑑,超出總數的 bit 也會被清掉。
      collected: encodeCollection(decodeCollection(raw.collected)),
      questsClaimed: readQuestsClaimed(raw.questsClaimed),
      questCounters: readQuestCounters(raw.questCounters),
    },
    migrated,
  };
}

/** 存檔轉成要寫進去的字串。 */
/**
 * 生存模式撐過幾**波**換到幾級技能書。
 *
 * 單位是波不是關:生存模式改成一條連續的跑圖之後,「關」只是中途換難度的刻度,
 * 玩家心裡數的是「我撐過幾波」——分數的單位要跟玩家數的東西一致。
 * 門檻是舊版關數門檻 [3, 6, 10, 15, 21] x 一關 10 波,難度完全沒動。
 *
 * 而且刻意用「一輪連續撐過幾波」而不是「累積打了幾波」:生存模式的壓力就在**不能失手**,
 * 用累積的話它會退化成「多打幾次就有」,跟一般模式沒兩樣。
 */
/**
 * 生存模式的技能書門檻(撐過幾波)。
 *
 * 技能書上限從 5 級變成 100 級之後,這一串只給得起前面幾級——**那是刻意的**:
 * 主要來源改成「每通一關給一本」(見 app 的 rollRunDrops),生存模式給的是
 * **前期的一段助跑**,讓還沒累積很多通關數的人也有東西可拿。
 * 門檻本身沒動,只是它在整條 100 級的曲線上佔的比例變小了。
 */
export const SURVIVAL_BOOK_THRESHOLDS = [30, 60, 100, 150, 210];

/** 撐過 waves 波對應到的技能書等級(取歷史最好的那次,不是這一次)。 */
export function booksForSurvival(bestWaves: number): number {
  return SURVIVAL_BOOK_THRESHOLDS.filter((t) => bestWaves >= t).length;
}

export function writeSave(save: SaveData): string {
  return JSON.stringify({ ...save, version: SAVE_VERSION });
}
