// 技能(純邏輯,禁止 import React)。
//
// 每通過一關可以挑一個技能:沒帶過的就學起來,帶過的就升一級。**最多帶 3 組、每組最高 5 級**。
//
// 技能跟轉職受同一條鐵則管:只准調整「起跑數值」,不准碰跑速、閘門內容、陷阱數量。
// 但技能比轉職危險得多——轉職 5 關才一次(整場最多 5 次),技能是**每關一次**,所以幅度
// 必須壓得更小,而且要能算出上限:3 組 x 5 級全部點在戰力上,總共也只有 +45%。
// 這個上限是刻意留的,verify-lane-skills.ts 會盯著它:一旦技能能疊出兩三倍,
// 「養成買不到勝利」就守不住了(轉職那次已經踩過一遍,見 CLAUDE.md)。

import { DEFAULT_RUN_START, MAX_GEAR, type RunStart } from './laneRun';

export const MAX_SKILL_LEVEL = 5;
export const MAX_SKILL_SLOTS = 3;
/** 每次通關給幾個選項。三個剛好:夠有得挑,又不用讓玩家在關卡之間讀太久。 */
export const OFFERS_PER_CLEAR = 3;

export type SkillId = 'forge' | 'reinforce' | 'toughen' | 'craft';

export interface SkillSpec {
  id: SkillId;
  name: string;
  /** 一句話講清楚這級加什麼,玩家不必自己算 */
  describe: (level: number) => string;
}

export interface SkillState {
  id: SkillId;
  level: number;
}

/** 每級加多少。全部都是「起跑數值」,而且都很小。 */
const PER_LEVEL = {
  /** 鍛鍊:純戰力 */
  forgeAttack: 0.05,
  /** 增援:多一個人,外加一點戰力(人數本身不加戰力,只決定怎麼分配) */
  reinforceAttack: 0.02,
  /** 堅韌:血量 */
  toughenHp: 0.12,
  /** 精工:每 2 級升一階起跑武器,外加一點戰力 */
  craftAttack: 0.02,
};

export const SKILLS: SkillSpec[] = [
  {
    id: 'forge',
    name: '鍛鍊',
    describe: (level) => `起跑總戰力 +${Math.round(PER_LEVEL.forgeAttack * level * 100)}%`,
  },
  {
    id: 'reinforce',
    name: '增援',
    describe: (level) =>
      `起跑多 ${level} 個人,總戰力 +${Math.round(PER_LEVEL.reinforceAttack * level * 100)}%`,
  },
  {
    id: 'toughen',
    name: '堅韌',
    describe: (level) => `起跑血量 +${Math.round(PER_LEVEL.toughenHp * level * 100)}%`,
  },
  {
    id: 'craft',
    name: '精工',
    // 武器階級每 2 級才 +1,所以 1 級時不要寫「+0 階」——那看起來像沒效果。
    describe: (level) => {
      const tiers = Math.floor(level / 2);
      const attack = `總戰力 +${Math.round(PER_LEVEL.craftAttack * level * 100)}%`;
      return tiers > 0 ? `起跑武器 +${tiers} 階,${attack}` : `${attack}(每 2 級多一階起跑武器)`;
    },
  },
];

export function skillSpec(id: SkillId): SkillSpec {
  const found = SKILLS.find((s) => s.id === id);
  if (!found) throw new Error(`unknown skill: ${id}`);
  return found;
}

export function skillLevel(skills: SkillState[], id: SkillId): number {
  return skills.find((s) => s.id === id)?.level ?? 0;
}

/**
 * 這次通關可以挑什麼。
 * 規則:已經帶滿 3 組之後,只能升級手上這 3 組(不能再學新的);每組滿 5 級就不再出現。
 * 全部滿級就回傳空陣列——外層看到空的就直接跳過這個畫面,不要卡一個沒東西可選的頁面。
 */
export function skillOffers(skills: SkillState[], rng: () => number = Math.random): SkillState[] {
  const upgradable = skills.filter((s) => s.level < MAX_SKILL_LEVEL).map((s) => ({ id: s.id, level: s.level + 1 }));
  const canLearnNew = skills.length < MAX_SKILL_SLOTS;
  const fresh = canLearnNew
    ? SKILLS.filter((spec) => !skills.some((s) => s.id === spec.id)).map((spec) => ({ id: spec.id, level: 1 }))
    : [];

  const pool = [...upgradable, ...fresh];
  // 洗牌之後取前幾個。用傳進來的 rng,驗證腳本才能重現同一組選項。
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, OFFERS_PER_CLEAR);
}

/** 選了之後的技能組合。已經有的就換成新等級,沒有的就加進去(外層應該已經擋掉超過 3 組的情況)。 */
export function learnSkill(skills: SkillState[], choice: SkillState): SkillState[] {
  const existing = skills.find((s) => s.id === choice.id);
  if (existing) return skills.map((s) => (s.id === choice.id ? { ...s, level: choice.level } : s));
  if (skills.length >= MAX_SKILL_SLOTS) return skills;
  return [...skills, choice];
}

/**
 * 把技能疊到起跑數值上。轉職先算(RunStart),技能在上面乘——兩者相乘的總量就是養成的全部,
 * 所以只要這兩邊各自都小,合起來就還在可控範圍。
 */
export function applySkills(base: RunStart, skills: SkillState[]): RunStart {
  // 技能之間用「加起來」而不是「乘起來」:三個 +30% 相乘是 2.2 倍、相加是 1.9 倍,
  // 而且相加算得出上限、玩家看到的 +30% 就真的是 +30%。上限好算,守鐵則才守得住。
  let attackBonus = 0;
  let hpBonus = 0;
  let heroes = base.heroes;
  let gear = base.gear;

  for (const skill of skills) {
    const level = Math.min(MAX_SKILL_LEVEL, Math.max(0, skill.level));
    if (skill.id === 'forge') attackBonus += PER_LEVEL.forgeAttack * level;
    if (skill.id === 'reinforce') {
      attackBonus += PER_LEVEL.reinforceAttack * level;
      heroes += level;
    }
    if (skill.id === 'toughen') hpBonus += PER_LEVEL.toughenHp * level;
    if (skill.id === 'craft') {
      attackBonus += PER_LEVEL.craftAttack * level;
      gear = Math.min(MAX_GEAR, gear + Math.floor(level / 2));
    }
  }
  return {
    heroes,
    gear,
    attackMultiplier: base.attackMultiplier * (1 + attackBonus),
    hpMultiplier: base.hpMultiplier * (1 + hpBonus),
  };
}

/** 全部點滿戰力技能的上限。verify 會拿這個數字對照,確保未來加技能時不會不小心超過。 */
export function maxAttackMultiplierFromSkills(): number {
  const best = applySkills(DEFAULT_RUN_START, [
    { id: 'forge', level: MAX_SKILL_LEVEL },
    { id: 'reinforce', level: MAX_SKILL_LEVEL },
    { id: 'craft', level: MAX_SKILL_LEVEL },
  ]);
  return best.attackMultiplier;
}

export function describeSkill(choice: SkillState): string {
  return skillSpec(choice.id).describe(choice.level);
}
