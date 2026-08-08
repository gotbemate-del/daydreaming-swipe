// 副本:三種各自產一樣東西的模式(純邏輯,禁止 import React)。
//
// ## 為什麼是三個而不是一個
//
// 副本分頁本來只有「生存模式」一種,而它同時被當成三件事在用:挑戰紀錄、技能書來源、
// 以及卡關時的替代進度。三件事擠在一個入口的後果是**玩家想要哪一樣都只能打同一場**——
// 想拿技能書就得去挑戰不能失手的連續闖關,而那兩件事的心情完全相反
// (一個是「這次要拚」,一個是「我想穩穩地拿到東西」)。
//
// 拆成三個之後,每一個副本回答一個問題:
//
//   無限副本   我最遠能撐到哪?      → 分數(累計波數),刷新紀錄才有獎勵
//   技能書副本 我想要技能書          → 通關必掉一本
//   裝備副本   我想補圖鑑            → 通關掉一整批碎片
//
// ## 鐵則:三種副本共用同一條敵人曲線
//
// 這一條是從 CLAUDE.md 搬過來的,而且是這個檔最容易被違反的地方。副本**不准**長出
// 自己的難度曲線——「兩條各走各的指數」這個專案已經摔過好幾次(敵人 vs 閘門、
// 生存模式 vs 一般模式)。三種副本用的都是 `createRun(seed, stage)` 產生的那一場,
// 差別只在:
//
//   1. **規則**(能不能重試、通關之後停不停下來)
//   2. **獎勵**(掉什麼)
//   3. **入場費**(花多少金幣)
//
// 一個都不准碰 stage 的數值。想讓某個副本「比較難」,正確的做法是讓它跑**更後面的關卡**,
// 不是另外調一組係數。
//
// ## 入場費:金幣的第一個去處
//
// 在此之前金幣是純粹的裝飾——跑圖會產出、狀態列會顯示,但沒有任何地方花得掉。
// 兩個單場副本收入場費,金幣才第一次變成資源。無限副本刻意**免費**:
// 它是挑戰模式,收費等於「想拚一次還要先繳錢」,而且它本來就有「死了就結束」的代價。

import type { RunSkillId } from './laneRunSkills';

/** 三種副本。`endless` 就是原本的生存模式(存檔裡的 bestSurvival 仍然是它的紀錄)。 */
export type DungeonId = 'endless' | 'grimoire' | 'armory';

/** 有「每日屬性 + 每日次數」的那兩個副本。無限副本不受限,它產的是紀錄不是資源。 */
export const DAILY_DUNGEONS: DungeonId[] = ['grimoire', 'armory'];
export function isDailyDungeon(id: DungeonId): boolean {
  return DAILY_DUNGEONS.includes(id);
}

export const DUNGEON_IDS: DungeonId[] = ['endless', 'grimoire', 'armory'];

export interface DungeonSpec {
  id: DungeonId;
  name: string;
  /** 一句話講清楚「這裡產什麼」。玩家在選擇畫面上讀的就是這一行。 */
  reward: string;
  /** 規則說明(能不能重試、跑幾關)。 */
  rule: string;
  /**
   * 連續闖關:通關不停下來,直接接下一關,死了才結束。
   * 只有無限副本是 true——另外兩個是單場,打完就結算。
   */
  continuous: boolean;
  /** 通關第幾個小關之後開放。0 = 一開始就開放。 */
  unlockStage: number;
}

/**
 * 開放時機刻意錯開,而且**全部排在教學區之後**。
 *
 * 教學區(1-1 ~ 1-5)的工作是把跑道本身教會,那五關裡玩家連分頁列都不該去點——
 * 一次丟三個副本給還不會拖曳的人,他只會學到「這遊戲東西很多」。
 * 之後每隔幾關開一個,每一次開放都是一個「又多了一件事可以做」的節點。
 */
const UNLOCK = {
  /** 教學結束(通關 1-5)。第一個開放的副本,因為它不需要任何額外概念——就是一直打下去。 */
  endless: 5,
  /** 通關第一個魔王(1-10)。技能書會放大場內技能,所以要先玩過幾場有技能的關卡。 */
  grimoire: 10,
  /** 進第 2 大關之後(2-3)。圖鑑是最慢熱的一層,放最後。 */
  armory: 13,
} as const;



// ---- 每日屬性與次數 ----
//
// ## 為什麼要有「今天開哪一個」
//
// 技能書與圖鑑的加成都是**逐屬性**的(火的書只放大火系三階,火的裝備只放大火)。
// 如果兩個副本隨時都能打、而且六個屬性任選,玩家的最佳解永遠是「一路把最強的那個屬性
// 練到滿」——另外五個永遠不會被碰,而「沒有萬用元素也沒有廢元素」是六元素設計的地基。
//
// 每天固定開一個之後,養成的形狀變成**六條線輪流前進**:今天是火就推火,想推雷要等。
// 它同時給了「每天回來看一下」一個理由,而這個理由不是離線收益(那條是明文禁止的)——
// 沒登入的那幾天什麼都不會自己長,只是那幾天的額度沒用到而已。
//
// ## 日界線用本地時間
//
// 用 UTC 的話,亞洲的玩家會在早上八點換日——那是一個沒有人會覺得是「新的一天」的時刻。
// 本地午夜是唯一符合直覺的界線,代價是玩家改系統時鐘就能多打幾輪。
// 這款是單機、沒有付費、沒有排行榜,那個代價換到的體感遠比防弊值錢;
// 真要防也防不了(存檔本來就在 localStorage 裡,玩家改得動)。
//
// ## 次數存的是「哪一天 + 打了幾次」,不是「還剩幾次」
//
// 存剩餘次數的話,跨日要有人負責把它加回去——而那個「有人」只能是某次讀存檔或某個計時器,
// 兩個都會漏(玩家整天沒開遊戲、或開著遊戲跨過午夜)。存「哪一天」則是**自我修復**的:
// 只要今天的日期跟存檔裡的不一樣,今天的次數就是 0,不需要任何人去重設它。

/** 每天每個副本最多通關幾次。 */
export const DUNGEON_DAILY_CLEARS = 5;

/**
 * 每日屬性的輪替順序。**照相剋環走**(金→木→土→冰→火→雷),不是隨機也不是 ELEMENTS 的順序。
 *
 * 照環走的好處是它可預測:玩家看到今天是土,就知道明天是冰、後天是火——
 * 「我想練火,還要等兩天」是一句他自己算得出來的話。隨機的話每天都要重新查,
 * 而「等它輪到」這件事就無法規劃了。
 */
export const DAILY_ELEMENT_CYCLE: RunSkillId[] = ['metal', 'wood', 'earth', 'ice', 'fire', 'thunder'];

/**
 * 這個時間點是「第幾天」。**本地午夜換日**(見檔頭)。
 *
 * 用 `Date.UTC(年, 月, 日)` 而不是 `now / 86400000`:後者是 UTC 的日界線,
 * 而我們要的是本地日曆上的那一天。先把本地的年月日取出來、再當成 UTC 去算,
 * 就得到一個「本地日曆天」的序號——跨時區搬家不會憑空多一天或少一天。
 */
export function dayIndex(now: number = Date.now()): number {
  const d = new Date(now);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/** 今天開哪一個屬性。 */
export function elementOfDay(day: number = dayIndex()): RunSkillId {
  const n = DAILY_ELEMENT_CYCLE.length;
  return DAILY_ELEMENT_CYCLE[((Math.floor(day) % n) + n) % n];
}

/** 第 n 天之後開哪一個屬性。畫面用它寫「火要等 2 天」。 */
export function elementInDays(ahead: number, day: number = dayIndex()): RunSkillId {
  return elementOfDay(day + Math.max(0, Math.floor(ahead)));
}

/** 想練這個屬性還要等幾天(今天就開的話是 0)。 */
export function daysUntilElement(element: RunSkillId, day: number = dayIndex()): number {
  const n = DAILY_ELEMENT_CYCLE.length;
  for (let i = 0; i < n; i++) if (elementOfDay(day + i) === element) return i;
  return 0;
}

/**
 * 今天這個副本已經打完幾次。
 *
 * `savedDay` 跟今天對不上就是 0 —— **包含存檔比今天新的情況**(玩家把時鐘往回調)。
 * 「不一樣就歸零」比「只有變新才歸零」單純,而且不會產生「次數卡在用完的狀態回不來」
 * 這種修不好的存檔。
 */
export function clearsToday(
  savedDay: number, clears: Partial<Record<DungeonId, number>>, id: DungeonId, today: number = dayIndex(),
): number {
  if (savedDay !== today) return 0;
  return Math.max(0, Math.floor(clears[id] ?? 0));
}

/** 今天這個副本還剩幾次。沒有每日限制的副本回 Infinity。 */
export function clearsLeft(
  savedDay: number, clears: Partial<Record<DungeonId, number>>, id: DungeonId, today: number = dayIndex(),
): number {
  if (!isDailyDungeon(id)) return Infinity;
  return Math.max(0, DUNGEON_DAILY_CLEARS - clearsToday(savedDay, clears, id, today));
}

/**
 * 一次通關給幾本 / 幾件。
 *
 * 5~15 的區間是刻意的:固定值的話「今天打完了」就只是一個算得出來的數字,
 * 而每一場都有一點落差,五場下來才有「今天手氣不錯」。
 * **這個隨機性放在這裡是安全的**——它完全不進理想路線(技能書與圖鑑都只放大元素,
 * 而元素在理想路線之外),所以它動的只有獎勵,一格難度都沒碰到。
 * 對比之下,閘門的爆發格就**不准**這樣抽(見 laneRun 的 DOUBLE_GATES_PER_RUN:
 * 那個會讓玩家覺得「這場運氣好」而不是「我選得好」)。
 */
export const DUNGEON_REWARD_MIN = 5;
export const DUNGEON_REWARD_MAX = 15;

export function rollDungeonReward(rng: () => number = Math.random): number {
  const span = DUNGEON_REWARD_MAX - DUNGEON_REWARD_MIN;
  return DUNGEON_REWARD_MIN + Math.floor(Math.max(0, Math.min(0.999999, rng())) * (span + 1));
}

const SPECS: Record<DungeonId, DungeonSpec> = {
  endless: {
    id: 'endless',
    name: '無限副本',
    reward: '刷新最遠紀錄換技能書',
    // 「死了就結束」是它唯一的壓力來源,所以要寫在最前面。
    rule: '從目前進度一關接一關,死了就結束',
    continuous: true,
    unlockStage: UNLOCK.endless,
  },
  grimoire: {
    id: 'grimoire',
    name: '技能書副本',
    reward: `通關得當日屬性的技能書 ${DUNGEON_REWARD_MIN}~${DUNGEON_REWARD_MAX} 本`,
    rule: `每天開一個屬性,最多通關 ${DUNGEON_DAILY_CLEARS} 次;不推進進度`,
    continuous: false,
    unlockStage: UNLOCK.grimoire,
  },
  armory: {
    id: 'armory',
    name: '裝備副本',
    reward: `通關掉當日屬性的裝備 ${DUNGEON_REWARD_MIN}~${DUNGEON_REWARD_MAX} 件`,
    rule: `每天開一個屬性,最多通關 ${DUNGEON_DAILY_CLEARS} 次;不推進進度`,
    continuous: false,
    unlockStage: UNLOCK.armory,
  },
};

export function dungeonSpec(id: DungeonId): DungeonSpec {
  return SPECS[id];
}

/** 這個副本開放了沒。`stage` 是玩家目前打到第幾關(存檔裡的 stage)。 */
export function isDungeonUnlocked(id: DungeonId, stage: number): boolean {
  return stage > SPECS[id].unlockStage;
}



/**
 * 入場費。**跟關卡走,不是固定值**——金幣的產出是隨關卡成長的(敵人的 reward 綁戰力),
 * 固定價在第 3 關是一道門檻、在第 300 關是零頭,那等於後期免費。
 *
 * 係數是照「一場跑圖大概賺多少」定的:單場副本的入場費約等於**一場的收入**,
 * 所以玩家的節奏會是「打一場一般關卡,再拿那筆錢去打一場副本」,而不是無限刷。
 * 無限副本免費(見檔頭)。
 */
export function dungeonCost(id: DungeonId, stage: number): number {
  if (id === 'endless') return 0;
  const base = id === 'grimoire' ? 120 : 80;
  return Math.round(base * (1 + (Math.max(1, stage) - 1) * 0.12));
}

/** 錢夠不夠進去。金幣不足時畫面要擋下來,不然玩家會打完一場才發現沒有獎勵。 */
export function canEnterDungeon(id: DungeonId, stage: number, coins: number): boolean {
  return isDungeonUnlocked(id, stage) && coins >= dungeonCost(id, stage);
}
