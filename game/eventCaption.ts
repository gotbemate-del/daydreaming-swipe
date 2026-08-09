import { getJobTitle } from './combat';
import type { Archetype, JobBranch, JobTier } from './combat';

/**
 * 彩蛋圖的說明。
 *
 * ## 為什麼一定要有這一行
 *
 * 翻出一張沒有說明的圖等於**沒有內容**:玩家看得到畫面,但不知道自己翻到了什麼、
 * 也不知道這張跟上一張差在哪。一行字就把「一張圖」變成「一則收藏」。
 *
 * ## 為什麼由檔名推,不另外維護一份文案表
 *
 * 604 張手寫文案是一件永遠不會做完的事,而且沒有人會記得補新加的那幾張。
 * 檔名本身就帶著全部的資訊——`job-<路線>-<階><分支>-<稀有度><流水號>`——
 * 而職業的中文名在 `getJobTitle` 已經有一份(轉職畫面在用同一支),
 * 所以這裡只做翻譯,不發明新的資料。
 *
 * 這一支放在 `game/` 而不是畫面層:它是純字串邏輯,沒有任何 React/RN 的東西,
 * 而且轉職的中文名也在這一層(兩邊用同一份才不會出現「同一個職業兩種叫法」)。
 */

/** `getJobTitle` 查得到的六條路線。查不到的(student)走下面那張表。 */
const JOB_LOOKUP: Record<string, true> = {
  physicalMelee: true, physicalRanged: true, physicalSupport: true,
  magicMelee: true, magicRanged: true, magicSupport: true,
};

/** 六條路線以外的:目前只有還沒轉職的「學生」。 */
const PLAIN_ARCHETYPE: Record<string, string> = { student: '學生' };

const RARITY: Record<string, string> = {
  c: '日常', common: '日常',
  r: '珍稀', rare: '珍稀',
  e: '史詩', epic: '史詩',
  l: '傳說', legendary: '傳說',
};

/** `job-magicMelee-2A-r03` / `common-07` → 一句話。 */
export function eventCaption(key: string): string {
  const generic = /^(common|rare|epic|legendary)-(\d+)$/.exec(key);
  if (generic) {
    const [, rarity, n] = generic;
    return `${RARITY[rarity] ?? '日常'}見聞 第 ${Number(n)} 則`;
  }
  // 第 1 階沒有分支(`job-magicMelee-1-c01`),之後才有 A/B——兩種格式都要吃。
  const job = /^job-([a-zA-Z]+)-(\d)([AB]?)-([crel])(\d+)$/.exec(key);
  if (job) {
    const [, archetype, tier, branchRaw, rarity, n] = job;
    const branch = branchRaw === '' ? 'A' : branchRaw;
    // 表裡沒有的路線(例如 `job-student-*`,那是還沒轉職的起手式)就用原始的字串,
    // **不要讓它整個掉到最後的 fallback**——那會把一句好好的說明換成一串檔名。
    const title = JOB_LOOKUP[archetype]
      ? getJobTitle(archetype as Archetype, branch as JobBranch, Number(tier) as JobTier)
      : (PLAIN_ARCHETYPE[archetype] ?? archetype);
    return `${title} · ${RARITY[rarity] ?? '日常'} 第 ${Number(n)} 則`;
  }
  // 認不出來的檔名照樣要給一句話——空白會被讀成「這張壞了」。
  return key;
}
