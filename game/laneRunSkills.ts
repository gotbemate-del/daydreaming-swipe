// 場內技能(純邏輯,禁止 import React)。
//
// ⚠ **這個模組還沒接上遊戲。** 只有設計與數值,沒有任何地方 import 它。
//    要接的時候必須「玩家側」與「敵人側」**同時**上,見下方「接線時的順序」。
//
// **這一套是「這一場限定」的,跑完就沒了。** 跟 game/laneSkills.ts 的永久技能是兩件事:
//
//   laneSkills.ts    永久,每通過一關選一次,只調整**起跑數值**,幅度必須很小(+45% 上限)
//   laneRunSkills.ts 場內,每打完一波選一次,只影響**這一場**,幅度可以大得多
//
// 為什麼場內的可以大:它每場重置,不會累積到下一場,所以不存在「養成買到勝利」的問題。
// 玩家在一場之內從無到有堆出一套組合,下一場重來——這是 roguelite 的迴圈,
// 跟永久養成的迴圈可以並存,但**不能混在同一個系統裡**,不然幅度只能遷就比較嚴的那一邊。
//
// 未來的技能書(副本掉落)是第三層:它調的是「場內技能的等級上限」,不是直接給數值。
// 姊妹作的 game/skillTree.ts 已經有這套(SKILL_LEVEL_CAP 10 / MAX_EFFECTIVE_SKILL_LEVEL 50),
// 接的時候沿用那份,不要另外發明。
//
// ## 接線時的順序(踩過了,記在這裡)
//
// 敵人戰力是照「這一場的最佳路線」算的(見 laneRun 的 createRun),而場內技能會讓玩家
// 比「只吃閘門」更強。所以這兩件事**必須同時上**:
//
//   玩家側:useLaneRun 持有 RunSkillState[],把 runSkillEffects 套到 RunState
//   敵人側:createRun 的理想路線在每一波之後乘上 RUN_SKILL_GROWTH_PER_PICK ^ 該波給的次數
//
// 只上敵人側的話,實測領先幅度會從 2.44x 掉到 0.50x,連「每排都挑最好」都過不了關
// (11 項驗證同時失敗)。只上玩家側則相反,領先幅度膨脹到 10x,中段又變成沒事做。
// 這就是 CLAUDE.md 記載的「兩條各走各的指數」在新系統上的翻版。

// 刻意不從 laneRun import 任何東西:laneRun 會 import 這個檔(理想路線要把場內技能算進去),
// 反向再 import 就是循環相依——實測會炸在「Cannot access 'GEAR_STEP' before initialization」,
// 而且是在模組載入時才炸,型別檢查完全看不出來。
export type RunSkillId = 'edge' | 'swarm' | 'bulwark' | 'focus';

export interface RunSkillSpec {
  id: RunSkillId;
  name: string;
  describe: (level: number) => string;
}

export interface RunSkillState {
  id: RunSkillId;
  level: number;
}

/** 場內技能最高幾級。之後接技能書的時候,這個值會變成「由技能書決定的上限」。 */
export const MAX_RUN_SKILL_LEVEL = 5;
/** 一次給幾個選項。 */
export const RUN_SKILL_OFFERS = 3;

/**
 * 每級加多少。
 *
 * 幅度刻意比永久技能大一個量級(永久是每級 +5%,這裡是 +18%):場內技能每場重置,
 * 而且一場要選 5~10 次,幅度小的話玩家根本感覺不到自己在做選擇。
 */
const PER_LEVEL = {
  /** 鋒刃:每人攻擊力 */
  edgeAttack: 0.18,
  /** 增殖:隊伍人數的幾成 */
  swarmHeroes: 0.25,
  /** 壁壘:血量上限(同時補滿等量的血) */
  bulwarkHp: 0.3,
  /** 專注:暴擊率(純演出,不影響擊殺數,見 laneRun 的 isCritHit) */
  focusCrit: 0.06,
};

export const RUN_SKILLS: RunSkillSpec[] = [
  { id: 'edge', name: '鋒刃', describe: (l) => `每人攻擊力 +${Math.round(PER_LEVEL.edgeAttack * l * 100)}%` },
  { id: 'swarm', name: '增殖', describe: (l) => `勇者數量 +${Math.round(PER_LEVEL.swarmHeroes * l * 100)}%` },
  { id: 'bulwark', name: '壁壘', describe: (l) => `血量上限 +${Math.round(PER_LEVEL.bulwarkHp * l * 100)}%` },
  { id: 'focus', name: '專注', describe: (l) => `暴擊率 +${Math.round(PER_LEVEL.focusCrit * l * 100)}%` },
];

export function runSkillSpec(id: RunSkillId): RunSkillSpec {
  const found = RUN_SKILLS.find((s) => s.id === id);
  if (!found) throw new Error(`unknown run skill: ${id}`);
  return found;
}

export function runSkillLevel(skills: RunSkillState[], id: RunSkillId): number {
  return skills.find((s) => s.id === id)?.level ?? 0;
}

/**
 * 這一場總共會給幾次選擇機會。
 *
 * 規則:每打完一波給 1 次,**最後一波之前再多給 1 次**。所以 5 波的小關是
 * 「1、2、3、4 波各一次 + 決戰前額外一次 = 5 次」,10 波則是 10 次。
 * 最後一波打完就結束了,不再給——那時候給也沒有東西可以用。
 */
export function runSkillPicksForWave(waveIndex: number, totalWaves: number): number {
  if (waveIndex >= totalWaves - 1) return 0; // 最後一波之後直接結算,不給
  return waveIndex === totalWaves - 2 ? 2 : 1; // 決戰前那一次給兩個
}

export function totalRunSkillPicks(totalWaves: number): number {
  let n = 0;
  for (let w = 0; w < totalWaves; w++) n += runSkillPicksForWave(w, totalWaves);
  return n;
}

/**
 * 這次可以挑什麼。已經滿級的不再出現;全部滿級就回傳空陣列(外層看到空的就跳過)。
 * 用傳進來的 rng,驗證腳本才能重現同一組選項。
 */
export function runSkillOffers(skills: RunSkillState[], rng: () => number = Math.random): RunSkillState[] {
  const pool = RUN_SKILLS
    .map((spec) => ({ id: spec.id, level: runSkillLevel(skills, spec.id) + 1 }))
    .filter((o) => o.level <= MAX_RUN_SKILL_LEVEL);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, RUN_SKILL_OFFERS);
}

export function learnRunSkill(skills: RunSkillState[], choice: RunSkillState): RunSkillState[] {
  const existing = skills.find((s) => s.id === choice.id);
  if (existing) return skills.map((s) => (s.id === choice.id ? { ...s, level: choice.level } : s));
  return [...skills, choice];
}

export interface RunSkillEffects {
  /** 每人攻擊力乘這個 */
  attackMultiplier: number;
  /** 隊伍人數乘這個 */
  heroMultiplier: number;
  /** 血量上限乘這個 */
  hpMultiplier: number;
  /** 額外暴擊率(純演出) */
  bonusCrit: number;
}

/**
 * 目前帶的場內技能加起來是什麼效果。
 * 技能之間**相加不相乘**,跟永久技能同一個理由:相加算得出上限,而且玩家看到的 +18% 就真的是 +18%。
 */
export function runSkillEffects(skills: RunSkillState[]): RunSkillEffects {
  let attack = 0;
  let heroes = 0;
  let hp = 0;
  let crit = 0;
  for (const s of skills) {
    const level = Math.min(MAX_RUN_SKILL_LEVEL, Math.max(0, s.level));
    if (s.id === 'edge') attack += PER_LEVEL.edgeAttack * level;
    if (s.id === 'swarm') heroes += PER_LEVEL.swarmHeroes * level;
    if (s.id === 'bulwark') hp += PER_LEVEL.bulwarkHp * level;
    if (s.id === 'focus') crit += PER_LEVEL.focusCrit * level;
  }
  return {
    attackMultiplier: 1 + attack,
    heroMultiplier: 1 + heroes,
    hpMultiplier: 1 + hp,
    bonusCrit: crit,
  };
}

/**
 * 一次選擇平均讓總戰力乘多少——**敵人戰力要靠這個數字跟上**。
 *
 * 這是整套的關鍵:場內技能會讓玩家比「只吃閘門」更強,如果敵人不跟著算,
 * 最佳玩家的領先幅度會一路膨脹,`ENEMY_POWER_RATIO` 的結構保證就破了
 * (跟 CLAUDE.md 記載的「兩條各走各的指數」是同一個坑)。
 *
 * 四個選項裡只有兩個加戰力(鋒刃 +18%、增殖 +25%),壁壘與專注不加。
 * 取「會加戰力的那些」的平均:玩家真的想變強就會挑那兩個,而挑防禦的人是自己選擇了
 * 用戰力換生存——那跟閘門的取捨是同一種,不需要另外補償。
 */
export const RUN_SKILL_GROWTH_PER_PICK =
  1 + (PER_LEVEL.edgeAttack + PER_LEVEL.swarmHeroes) / 2;

/** 場內技能全部點滿時的總戰力倍率。給驗證腳本盯上限用。 */
export function maxRunSkillAttackMultiplier(): number {
  const maxed: RunSkillState[] = [
    { id: 'edge', level: MAX_RUN_SKILL_LEVEL },
    { id: 'swarm', level: MAX_RUN_SKILL_LEVEL },
  ];
  const e = runSkillEffects(maxed);
  return e.attackMultiplier * e.heroMultiplier;
}

export function describeRunSkill(choice: RunSkillState): string {
  return runSkillSpec(choice.id).describe(choice.level);
}
