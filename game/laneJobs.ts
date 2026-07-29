// 轉職(純邏輯,禁止 import React)。
//
// 每 5 關一次轉職,每次從幾個職業裡挑一個。轉職是這款唯一的「養成」,所以它只准動一件事:
// **起跑時的人數、裝備等級、攻擊與血量倍率**(RunStart)。
//
// 鐵則(CLAUDE.md):轉職不放慢跑速、不減少陷阱、不放寬閘門。理由很實際——閘門的加成是
// 相對值(x2、裝備強化都是乘的),所以起跑數值再高,選錯閘門一樣會被拉下來;但只要讓養成
// 碰到「跑速」或「陷阱數量」,選擇就會變得可有可無,這款就退化成放置遊戲。
//
// 職業表直接沿用姊妹作的 game/combat.ts:6 大路線 x A/B 分支 x 5 階,連職稱都是同一份。
// 兩款共用資料層是專案前提,不在這裡另外發明一套職業。

import {
  calcCombatMultiplier,
  getArchetypeComposition,
  getJobTitle,
  type Archetype,
  type JobBranch,
  type JobTier,
} from './combat';
import { DEFAULT_RUN_START, type RunStart } from './laneRun';

export type { Archetype, JobBranch, JobTier };

/** 幾關轉一次職。 */
export const PROMOTION_EVERY = 5;

export interface JobState {
  archetype: Archetype;
  branch: JobBranch;
  tier: JobTier;
}

/** 還沒轉職的起手式:學生,沒有路線也沒有分支。 */
export type LaneJob = JobState | null;

export const ARCHETYPES: Archetype[] = [
  'physicalMelee',
  'physicalRanged',
  'physicalSupport',
  'magicMelee',
  'magicRanged',
  'magicSupport',
];

/** 通過第幾關之後可以轉職。第 5、10、15… 關,對應 1~5 階。 */
export function isPromotionStage(clearedStage: number): boolean {
  return clearedStage > 0 && clearedStage % PROMOTION_EVERY === 0 && tierAfter(clearedStage) !== null;
}

/** 通過這一關之後會轉到第幾階。超過 5 階就沒有下一階了(回傳 null)。 */
export function tierAfter(clearedStage: number): JobTier | null {
  const tier = Math.floor(clearedStage / PROMOTION_EVERY);
  return tier >= 1 && tier <= 5 ? (tier as JobTier) : null;
}

export interface JobChoice {
  job: JobState;
  title: string;
  /** 這個選項相對於現在的差異,直接寫給玩家看,不要他自己算 */
  summary: string;
}

/**
 * 這一次轉職可以選什麼。
 * 第 1 階:6 條路線隨你挑(還沒有分支,A/B 的 1 階職稱本來就相同)。
 * 第 2 階之後:路線已經定了,選的是 A/B 兩條分支——跟姊妹作的分歧點一致。
 */
export function jobChoices(current: LaneJob, tier: JobTier): JobChoice[] {
  if (current === null || tier === 1) {
    return ARCHETYPES.map((archetype) => {
      const job: JobState = { archetype, branch: 'A', tier: 1 };
      return { job, title: getJobTitle(archetype, 'A', 1), summary: describeStart(job) };
    });
  }
  return (['A', 'B'] as JobBranch[]).map((branch) => {
    const job: JobState = { archetype: current.archetype, branch, tier };
    return { job, title: getJobTitle(current.archetype, branch, tier), summary: describeStart(job) };
  });
}

// 三種路線給三種不同的起跑「樣子」,但總戰力幾乎一樣:
//   近戰 melee   :武器好(起跑就拿第 2 階武器),血中等
//   遠程 ranged  :戰力略高,血最薄
//   輔助 support :戰力略低,血最厚
// 差異放在「怎麼分配」而不是「給多少」,是因為閘門全是相對值(x2、裝備強化都是乘的),
// 起跑倍率一旦拉大就會一路放大到終點,變成養成買勝利。實測滿階起跑 7 倍時,第 25 關亂選的
// 過關率會從 38% 衝到 85%——所以總戰力倍率只由 calcCombatMultiplier 決定(1.0 → 1.5),
// 裝備完全不加碼。階級之間的成長節奏因此跟姊妹作是同一條曲線。
//
// **所有職業一律 1 人起跑**,轉職不會多給人。人數的成長只能來自跑道上的閘門——
// 一場跑圖就是「從一個人開始滾成一支隊伍」,這個弧線是本作的核心體感,起跑就先給一票人
// 會把它抹平。副作用是「勇者 +N」那種閘門變成完全職業中立:每個職業起跑的每人攻擊力
// 都等於總戰力(因為只有一個人),同一格對誰的價值都一樣。
export function runStartFor(job: LaneJob): RunStart {
  if (job === null) return DEFAULT_RUN_START;
  const multiplier = calcCombatMultiplier(job.archetype, job.tier);
  const { subtype } = getArchetypeComposition(job.archetype);
  // 分支 A 往「戰力」偏一點、B 往「耐打」偏一點,讓 2 階之後的選擇也有辨識度。
  // 以前這裡是「B 多一個人」,人數收回去之後改用這兩個小倍率——幅度刻意壓在 3%/5%,
  // 起跑差距會一路被閘門放大,不能大。
  const branchAttack = job.branch === 'A' ? 1.03 : 1;
  const branchHp = job.branch === 'B' ? 0.05 : 0;

  if (subtype === 'melee') {
    return {
      heroes: 1,
      gear: 2,
      attackMultiplier: multiplier * branchAttack,
      hpMultiplier: 1 + 0.04 * job.tier + branchHp,
    };
  }
  if (subtype === 'support') {
    return {
      heroes: 1,
      gear: 1,
      attackMultiplier: multiplier * 0.95 * branchAttack,
      hpMultiplier: 1 + 0.08 * job.tier + branchHp,
    };
  }
  return {
    heroes: 1,
    gear: 1,
    attackMultiplier: multiplier * 1.05 * branchAttack,
    hpMultiplier: 1 + 0.02 * job.tier + branchHp,
  };
}

// 人數不再列出來:每個職業都是 1 人起跑,印出來只是每一格都一樣的雜訊。
export function describeStart(job: LaneJob): string {
  const start = runStartFor(job);
  return `武器 ${start.gear} 階 · 戰力 x${start.attackMultiplier.toFixed(2)}`
    + ` · 血量 x${start.hpMultiplier.toFixed(2)}`;
}

export function jobTitle(job: LaneJob): string {
  return job === null ? '學生' : getJobTitle(job.archetype, job.branch, job.tier);
}
