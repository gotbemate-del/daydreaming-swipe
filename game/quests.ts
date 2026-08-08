// 遊戲任務:引導玩家認識介面與功能(純邏輯,禁止 import React)。
//
// ## 這套東西要解決什麼
//
// 教學關(game/laneTutorial.ts)教的是**跑道本身**——怎麼拖、閘門怎麼算、什麼要閃。
// 但畫面上還有一整排玩家永遠不會自己去點的東西:設定齒輪、裝備圖鑑、三個副本、
// 永久技能、轉職。它們不在跑道上,所以教學關再怎麼設計都碰不到,而
// 「畫出來但沒人點」跟「還沒做」在玩家眼裡長得一模一樣。
//
// 任務就是那一層的教學:它不解釋功能,它給玩家**一個去點它的理由**。
//
// ## 為什麼進度是「衍生的」而不是「存起來的」
//
// 任務的判定分兩種來源:
//
//   1. **存檔裡本來就有的東西** —— 打到第幾關、幾本技能書、圖鑑收了幾件、轉職了沒
//   2. **只有任務才在乎的事件** —— 開過設定沒、進過裝備副本沒、挑過幾次場內技能
//
// 第 1 種一律**現算**(`progress(ctx)` 直接讀),不另外存一份。存一份的代價是它會跟
// 本尊不同步:玩家改過存檔、或哪天遷移邏輯動了 stage,任務進度就會停在舊值,
// 而那種 bug 的症狀是「任務永遠完成不了」——玩家看得到卻做不到,比沒有任務更糟。
//
// 第 2 種才進存檔,而且只存**計數器**(`Record<string, number>`)。用計數器不用布林陣列,
// 是因為「開過設定沒」跟「挑過 5 次技能」可以是同一種東西,加一個新任務就不必動存檔格式。
//
// ## 為什麼獎勵一律是金幣
//
// 金幣是唯一「不進理想路線」的資源:它不影響戰力、不影響人數,敵人不會為了它變強
// (CLAUDE.md 的鐵則:任何養成都不准給起跑人數/戰力)。任務是一次性的、而且是給
// 新手的,如果它給的是戰力,新手做完任務就等於買到了一段難度——那正是這個專案
// 反覆在避免的事。給金幣則剛好接上副本的入場費:任務教你副本在哪,順便給你第一次的門票。

import { isDungeonUnlocked, type DungeonId } from './dungeons';

/**
 * 只有任務在乎的事件計數器。
 *
 * **加新的 key 不必升存檔版本**:readSave 讀不到的 key 一律當 0
 * (見 game/save.ts 的 readCounters)。反過來,舊存檔裡有而這裡沒有的 key 會被丟掉,
 * 那也是對的——任務刪掉了,它的計數器就沒有意義。
 */
export type QuestCounter =
  /** 吃到幾個好閘門(不含陷阱、不含漏接)。 */
  | 'goodGates'
  /** 漏接幾次(兩格都沒碰到)。教學任務用它來教「不動什麼都吃不到」。 */
  | 'misses'
  /** 挑過幾次場內技能。 */
  | 'runSkillPicks'
  /** 學過幾個永久技能(每關通關三選一)。 */
  | 'skillsLearned'
  /** 閃過幾顆石頭(路上有、而且沒撞到)。 */
  | 'rocksDodged'
  /** 打倒過幾隻大魔王。 */
  | 'bossKills'
  /** 開過幾次設定面板。 */
  | 'settingsOpened'
  /** 看過幾次裝備圖鑑。 */
  | 'codexViewed'
  /** 三個副本各進過幾次。 */
  | 'endlessRuns'
  | 'grimoireRuns'
  | 'armoryRuns';

export type QuestCounters = Partial<Record<QuestCounter, number>>;

/**
 * 一場跑圖的統計。跑圖結束時由 `hooks/useLaneRun` 交出來,只給任務系統用。
 *
 * **刻意跟 `RunState` 分開。** RunState 是結算要用的東西(人數、裝備、金幣),
 * 每一格都會被讀好幾次;統計是「這一場發生過幾次某件事」,誰都不會拿它去算戰力。
 * 混在一起的話,`RunState` 會慢慢長出一堆跟結算無關的欄位,而那個型別是
 * `resolveRow`/`resolveEnemy` 的核心參數——多一個欄位就多一個「這個要不要跟著複製」的問題。
 */
export interface RunStats {
  /** 吃到幾個好閘門(踩上去而且不是陷阱)。 */
  goodGates: number;
  /** 漏接幾次(站在兩格中間的空隙上,什麼都沒碰到)。 */
  misses: number;
  /** 挑了幾次場內技能。 */
  runSkillPicks: number;
  /** 閃過幾顆石頭(路上有、而且沒撞到)。 */
  rocksDodged: number;
}

/** 一場跑完之後,各個計數器該加多少。`bossKilled` 由呼叫端判斷(它要知道關卡編號)。 */
export function runCounters(stats: RunStats, bossKilled: boolean): QuestCounters {
  return {
    goodGates: stats.goodGates,
    misses: stats.misses,
    runSkillPicks: stats.runSkillPicks,
    rocksDodged: stats.rocksDodged,
    ...(bossKilled ? { bossKills: 1 } : {}),
  };
}

/**
 * 把一批增量加進計數器。回傳新物件——直接改存檔裡那一份的話,React 會看不出東西變了
 * (同一個物件參考),畫面上的任務進度就會停在舊值,直到下一次因為別的原因重畫。
 */
export function addCounters(base: QuestCounters, delta: QuestCounters): QuestCounters {
  const out: QuestCounters = { ...base };
  for (const [key, value] of Object.entries(delta)) {
    if (!isQuestCounter(key) || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
    out[key] = (out[key] ?? 0) + Math.floor(value);
  }
  return out;
}

/** 判定任務進度需要知道的一切。**全部由呼叫端現算**,任務這一層不碰存檔。 */
export interface QuestContext {
  /** 目前打到第幾個小關(還沒通關的那一關)。所以「通關了 1-1」= stage > 1。 */
  stage: number;
  /** 技能書等級。 */
  books: number;
  /** 無限副本一輪最遠撐過幾波。 */
  bestSurvival: number;
  /** 圖鑑收到幾件裝備。 */
  collected: number;
  /** 轉職了沒。 */
  promoted: boolean;
  /** 事件計數器。 */
  counters: QuestCounters;
}

export interface Quest {
  id: string;
  /** 任務名稱。要寫成**動作**(「打開設定」)而不是狀態(「設定已開啟」)。 */
  name: string;
  /** 一句話說明去哪裡做這件事。這一行才是真正在做引導的東西。 */
  hint: string;
  /** 完成需要的量。1 就是「做過一次」。 */
  target: number;
  /** 目前做到多少。上限由呼叫端夾,這裡可以回傳超過 target 的值。 */
  progress: (ctx: QuestContext) => number;
  /** 獎勵金幣。 */
  coins: number;
  /**
   * 要通關第幾關之後這個任務才出現。
   *
   * 一次把二十個任務攤在玩家面前等於沒有引導——他會直接關掉那一頁。
   * 逐步出現的話,任務列永遠只有「現在做得到的那幾個」。
   */
  from: number;
}

/** 計數器的值(沒有就是 0)。 */
function count(ctx: QuestContext, key: QuestCounter): number {
  return Math.max(0, Math.floor(ctx.counters[key] ?? 0));
}

/** 「通關了第 n 個小關」= 目前的關卡已經走過它。 */
function cleared(ctx: QuestContext, stage: number): number {
  return ctx.stage > stage ? 1 : 0;
}

/**
 * 任務清單。**順序就是引導的順序**——畫面上只顯示「現在該做的那一個」(見 activeQuest)。
 *
 * 排法有兩條規則:
 *   1. 一個任務只指向一個地方。「打開設定並且看圖鑑」會讓玩家兩邊都不去。
 *   2. 每一個新功能開放之後,**下一個任務就是去用它**。功能開放的那一刻是玩家
 *      唯一會好奇的時候,錯過了就再也不會點。
 */
const QUESTS: Quest[] = [
  // --- 跑道本身。跟教學關一一對應,讓玩家知道「我剛剛學會的那件事有人在看」。 ---
  {
    id: 'clear-1-1',
    name: '跑完第一關',
    // 提示刻意跟教學關那一行(laneTutorial 的 lesson)講不同的事:兩列上下相鄰,
    // 寫一樣的話會讓玩家以為畫面重複了,而且等於浪費掉一次講話的機會。
    hint: '1-1 只有閘門,每一排挑一格站上去',
    target: 1,
    progress: (c) => cleared(c, 1),
    coins: 100,
    from: 0,
  },
  {
    id: 'miss-once',
    name: '故意漏接一次',
    // 這個任務刻意要玩家**做錯一次**。漏接是這款最重要的一條規則(站對邊還不夠,
    // 要真的把身體拉到框上面),而規則用讀的記不住,漏一次就記住了。
    hint: '兩格中間有空隙 —— 站在空隙上就什麼都吃不到',
    target: 1,
    progress: (c) => count(c, 'misses'),
    coins: 60,
    from: 0,
  },
  {
    id: 'good-gates-20',
    name: '吃到 20 個好閘門',
    hint: '每一排都有一好一壞,挑好的那一格站上去',
    target: 20,
    progress: (c) => count(c, 'goodGates'),
    coins: 150,
    from: 1,
  },
  {
    id: 'learn-skill',
    name: '學會第一個永久技能',
    hint: '每通關一關就能三選一,選完永遠帶著',
    target: 1,
    progress: (c) => count(c, 'skillsLearned'),
    coins: 120,
    from: 1,
  },
  {
    id: 'run-skills-5',
    name: '在一場裡挑 5 次技能',
    hint: '1-3 之後每打完一波就能挑一個,跑完那一場就沒了',
    target: 5,
    progress: (c) => count(c, 'runSkillPicks'),
    coins: 180,
    from: 2,
  },
  {
    id: 'dodge-rocks',
    name: '閃過 3 顆路障石頭',
    hint: '石頭不用選,站哪裡都行 —— 只要不是它那裡',
    target: 3,
    progress: (c) => count(c, 'rocksDodged'),
    coins: 150,
    from: 3,
  },
  // --- 介面上的東西。跑道教不到,只能靠任務把人帶過去。 ---
  {
    id: 'open-settings',
    name: '打開設定調音量',
    // 跑圖中的齒輪同時是暫停鍵,那是玩家最需要、卻最不會自己發現的一個功能。
    hint: '右上角的齒輪。跑圖中打開就是暫停',
    target: 1,
    progress: (c) => count(c, 'settingsOpened'),
    coins: 80,
    from: 2,
  },
  {
    id: 'graduate',
    name: '通過 1-5 畢業考',
    hint: '全部機制都上場了,而且這一關有兩倍長',
    target: 1,
    progress: (c) => cleared(c, 5),
    coins: 300,
    from: 4,
  },
  {
    id: 'enter-endless',
    name: '進一次無限副本',
    hint: '下方分頁列的「副本」→ 無限副本。一關接一關,死了就結束',
    target: 1,
    progress: (c) => count(c, 'endlessRuns'),
    coins: 200,
    from: 5,
  },
  {
    id: 'open-codex',
    name: '看一次裝備圖鑑',
    hint: '下方分頁列的「裝備」。跑圖撿到的裝備都收在那裡',
    target: 1,
    progress: (c) => count(c, 'codexViewed'),
    coins: 100,
    from: 5,
  },
  {
    id: 'collect-30',
    name: '收集 30 件裝備',
    hint: '每跑完一場都會撿到幾件,通關撿得比較多',
    target: 30,
    progress: (c) => c.collected,
    coins: 250,
    from: 6,
  },
  {
    id: 'beat-boss',
    name: '打倒第一個大魔王',
    hint: '每個大關的第 10 小關,魔王站在整場的最後一排',
    target: 1,
    progress: (c) => count(c, 'bossKills'),
    coins: 400,
    from: 8,
  },
  {
    id: 'enter-grimoire',
    name: '進一次技能書副本',
    hint: '「副本」→ 技能書副本。通關必得一本,要付入場費',
    target: 1,
    progress: (c) => count(c, 'grimoireRuns'),
    coins: 300,
    from: 10,
  },
  {
    id: 'enter-armory',
    name: '進一次裝備副本',
    hint: '「副本」→ 裝備副本。通關掉一整批圖鑑碎片',
    target: 1,
    progress: (c) => count(c, 'armoryRuns'),
    coins: 300,
    from: 13,
  },
  {
    id: 'survival-30',
    name: '無限副本撐過 30 波',
    hint: '撐得夠遠就換得到技能書,而技能書會放大元素技能的效果',
    target: 30,
    progress: (c) => c.bestSurvival,
    coins: 500,
    from: 13,
  },
  {
    id: 'promote',
    name: '第一次轉職',
    hint: '通關第 5 大關之後會出現轉職畫面,給的是起跑數值',
    target: 1,
    progress: (c) => (c.promoted ? 1 : 0),
    coins: 800,
    from: 20,
  },
];

/** 全部任務(唯讀)。畫面要列清單就用它。 */
export const ALL_QUESTS: readonly Quest[] = QUESTS;

export interface QuestView {
  quest: Quest;
  /** 目前進度,已經夾在 [0, target]。 */
  progress: number;
  /** 達成條件了沒(還沒領獎也算)。 */
  done: boolean;
  /** 領過獎了沒。 */
  claimed: boolean;
  /** 現在可以領獎嗎(達成了而且還沒領)。 */
  claimable: boolean;
}

/**
 * 這個玩家現在看得到哪些任務,各自什麼狀態。
 *
 * **已經領過獎的任務不會被過濾掉**,它們留在清單底部:任務列全空的話,玩家會以為
 * 這個功能壞了,而「我做完了幾個」本身就是進度感。畫面自己決定要不要收起來。
 */
export function questViews(ctx: QuestContext, claimed: readonly string[]): QuestView[] {
  const done = new Set(claimed);
  return QUESTS
    // 還沒開放的不顯示。**但已經領過的一律顯示**——不然改過的存檔會讓一個
    // 已完成的任務憑空消失,玩家會以為獎勵被吞了。
    .filter((q) => ctx.stage > q.from || done.has(q.id))
    .map((quest) => {
      const progress = Math.min(quest.target, Math.max(0, Math.floor(quest.progress(ctx))));
      const isDone = progress >= quest.target;
      const isClaimed = done.has(quest.id);
      return { quest, progress, done: isDone, claimed: isClaimed, claimable: isDone && !isClaimed };
    });
}

/**
 * 主介面橫幅上要顯示哪一個任務。
 *
 * 規則:**能領獎的優先,其次是最前面那個還沒做完的**。能領獎的排前面是因為
 * 「有東西可以拿」是唯一會讓玩家去點那一列的理由——把它排在第三個的話,
 * 玩家會一直看到一個做不完的任務,然後再也不點。全部做完就回傳 null(橫幅收起來)。
 */
export function activeQuest(ctx: QuestContext, claimed: readonly string[]): QuestView | null {
  const views = questViews(ctx, claimed);
  return views.find((v) => v.claimable) ?? views.find((v) => !v.claimed) ?? null;
}

/** 現在總共有幾個獎可以領。畫面拿它在分頁上點一個紅點。 */
export function claimableCount(ctx: QuestContext, claimed: readonly string[]): number {
  return questViews(ctx, claimed).filter((v) => v.claimable).length;
}

/**
 * 領獎:回傳「拿到幾金幣」與「新的已領清單」。
 *
 * 沒達成或已經領過都回 0 —— **不丟例外**。畫面按鈕理論上點不到那種狀態,
 * 但存檔是玩家改得動的,而「改壞的存檔讓遊戲丟例外」的症狀是白畫面
 * (見 game/save.ts 的檔頭:玩家會再也進不去,連清存檔的入口都沒有)。
 */
export function claimQuest(
  ctx: QuestContext, claimed: readonly string[], id: string,
): { coins: number; claimed: string[] } {
  const view = questViews(ctx, claimed).find((v) => v.quest.id === id);
  if (!view || !view.claimable) return { coins: 0, claimed: [...claimed] };
  return { coins: view.quest.coins, claimed: [...claimed, id] };
}

/** 存檔驗證用:這個 id 是現存的任務嗎(改過/舊版存檔裡的垃圾 id 要丟掉)。 */
export function isQuestId(id: string): boolean {
  return QUESTS.some((q) => q.id === id);
}

/** 存檔驗證用:這個 key 是現存的計數器嗎。 */
const COUNTER_KEYS = new Set<string>([
  'goodGates', 'misses', 'runSkillPicks', 'skillsLearned', 'rocksDodged', 'bossKills',
  'settingsOpened', 'codexViewed', 'endlessRuns', 'grimoireRuns', 'armoryRuns',
] satisfies QuestCounter[]);

export function isQuestCounter(key: string): key is QuestCounter {
  return COUNTER_KEYS.has(key);
}

/** 進副本要 +1 的那個計數器。三個副本各一個,不共用一個「進過副本」。 */
export function dungeonCounter(id: DungeonId): QuestCounter {
  return id === 'endless' ? 'endlessRuns' : id === 'grimoire' ? 'grimoireRuns' : 'armoryRuns';
}

/** 這個副本現在點得進去嗎(任務提示要用它判斷「要不要叫玩家去」)。 */
export function dungeonReady(id: DungeonId, stage: number): boolean {
  return isDungeonUnlocked(id, stage);
}
