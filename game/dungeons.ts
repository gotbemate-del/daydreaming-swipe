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

/** 三種副本。`endless` 就是原本的生存模式(存檔裡的 bestSurvival 仍然是它的紀錄)。 */
export type DungeonId = 'endless' | 'grimoire' | 'armory';

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

/**
 * 技能書副本通關給幾本。
 *
 * **必須大於 1,不然這個副本沒有存在的理由。** 一般跑圖通關本來就保證給一本
 * (見 app 的 rollRunDrops),所以給 1 本等於「跟再打一關一模一樣,但要多付入場費」。
 *
 * 3 本是「一場抵三關」:玩家用金幣換掉兩關的時間,而代價是**這一場不推進進度**——
 * 那才是這個副本真正的交換條件(想衝技能書就得原地打轉)。
 *
 * 不隨關卡成長:技能書上限是 100 級,而它碰不到理想路線(只放大元素與主動的效果幅度,
 * 見 laneRunSkills 的 bookBonus),所以給得快一點不會讓遊戲變簡單。
 * 固定值的好處是「一場換三本」這句話在第 3 關與第 3000 關都成立,玩家不必重新學一次匯率。
 */
export const GRIMOIRE_BOOKS = 3;

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
    reward: `通關必得技能書 ${GRIMOIRE_BOOKS} 本`,
    rule: '單場,打目前進度的那一關;不推進進度',
    continuous: false,
    unlockStage: UNLOCK.grimoire,
  },
  armory: {
    id: 'armory',
    name: '裝備副本',
    reward: '通關掉一整批裝備碎片',
    rule: '單場,打目前進度的那一關',
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
 * 裝備副本一場掉幾件碎片。
 *
 * 一般跑圖通關是 3 件(`dropCountForRun`),這裡給 12——**四倍,不是十倍**。
 * 圖鑑有 5668 件、501 個條目,給太多的話一個下午就收滿,而圖鑑是拿來給卡關的人
 * 長期有事做的東西(它抬地板:屬性加成與技能書掉落率,兩個都在理想路線之外)。
 * 四倍的意思是「想補圖鑑就來這裡,比亂打快很多,但還是要打很多場」。
 */
export const ARMORY_DROPS = 12;
/** 裝備副本陣亡也掉一些,理由跟一般跑圖一樣:完全不掉的話卡關的人會毫無進展。 */
export const ARMORY_DROPS_FAILED = 3;



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
