// 場內技能(純邏輯,禁止 import React)。
//
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
// ## 兩側必須同時算(踩過了,記在這裡)
//
// 敵人戰力是照「這一場的最佳路線」算的(見 laneRun 的 createRun),而場內技能會讓玩家
// 比「只吃閘門」更強。所以這兩件事**必須同時上**:
//
//   玩家側:useLaneRun 持有 RunSkillState[],選中的當下就把 runSkillEffects 結算進 RunState
//   敵人側:createRun 的理想路線用 runSkillOffersAt + bestRunSkillChoice 重播同一串選擇
//
// 只上敵人側的話,實測領先幅度會從 2.44x 掉到 0.50x,連「每排都挑最好」都過不了關
// (11 項驗證同時失敗)。只上玩家側則相反,領先幅度膨脹到 10x,中段又變成沒事做。
// 這就是 CLAUDE.md 記載的「兩條各走各的指數」在新系統上的翻版。
//
// 而且敵人側**不能用「平均的理想曲線」估**,要重播這一場真正開出來的選項:
// 四選三會漏掉一個,理由跟閘門那邊一模一樣(見 CLAUDE.md「用平均理想路線估敵人也不夠」)。

// 刻意不從 laneRun import 任何東西:laneRun 會 import 這個檔(理想路線要把場內技能算進去),
// 反向再 import 就是循環相依——實測會炸在「Cannot access 'GEAR_STEP' before initialization」,
// 而且是在模組載入時才炸,型別檢查完全看不出來。
export type RunSkillId =
  | 'edge' | 'swarm' | 'bulwark' | 'focus'
  // 主動技能(有冷卻、有特效、造成固定效果)。冷卻一律以**波**為單位。
  | 'strike' | 'pierce' | 'rally' | 'aegis';

/** 哪些是主動技能。轉職解鎖的就是這一串的前 N 款(見 laneJobs 的 activeSkillsForStage)。 */
export const ACTIVE_SKILL_IDS: RunSkillId[] = ['strike', 'pierce', 'rally', 'aegis'];
export function isActiveSkill(id: RunSkillId): boolean {
  return ACTIVE_SKILL_IDS.includes(id);
}

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
/**
 * 一場最多帶幾個技能。
 *
 * 10 格 x 一般小關 10 次選擇 = **剛好湊得滿**,而長關的 20 次讓玩家「湊滿再練深」。
 * 核心決策因此是**廣度 vs 深度**:每次都拿新的 = 10 個各 1 級,拿升級 = 例如 5 個各 2 級。
 */
export const MAX_RUN_SKILL_SLOTS = 10;
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
  /** 壁壘:兌換率(一個勇者能換掉幾隻怪)。血量拿掉之後,防禦軸一律走這個。 */
  bulwarkTrade: 0.3,
  /** 專注:暴擊率(純演出,不影響擊殺數,見 laneRun 的 isCritHit) */
  focusCrit: 0.06,
  /** 爆裂(主動):每次觸發直接清掉幾隻(固定值,前期最有感) */
  strikeKills: 2,
  /** 貫穿(主動):清掉整波的幾成(比例值,後期大波才有感——跟爆裂互補) */
  pierceRatio: 0.12,
  /** 號令(主動):直接補幾個勇者 */
  rallyHeroes: 1,
};

/**
 * 主動技能的冷卻,單位是**波**不是秒。
 *
 * 綁秒會壞:跑速隨關卡從 45 爬到 111,「每 10 秒一次」在第 1 關是每 4.5 排、
 * 第 40 關是每 11 排——**越後面的關卡技能越弱**,而那不是設計決定的,
 * 純粹是兩個時鐘沒對齊(CLAUDE.md 的「兩條各走各的曲線」在新系統上的翻版)。
 */
export function strikeCooldownWaves(level: number): number {
  return Math.max(1, 4 - Math.floor(Math.max(0, level) / 2));
}

export const RUN_SKILLS: RunSkillSpec[] = [
  { id: 'edge', name: '鋒刃', describe: (l) => `每人攻擊力 +${Math.round(PER_LEVEL.edgeAttack * l * 100)}%` },
  { id: 'swarm', name: '增殖', describe: (l) => `勇者數量 +${Math.round(PER_LEVEL.swarmHeroes * l * 100)}%` },
  { id: 'bulwark', name: '壁壘', describe: (l) => `兌換率 +${Math.round(PER_LEVEL.bulwarkTrade * l * 100)}%` },
  { id: 'focus', name: '專注', describe: (l) => `暴擊率 +${Math.round(PER_LEVEL.focusCrit * l * 100)}%` },
  {
    id: 'strike',
    name: '爆裂',
    describe: (l) => `每 ${strikeCooldownWaves(l)} 波清掉 ${PER_LEVEL.strikeKills * l} 隻`,
  },
  {
    id: 'pierce',
    name: '貫穿',
    describe: (l) => `每 ${strikeCooldownWaves(l)} 波清掉整波的 ${Math.round(PER_LEVEL.pierceRatio * l * 100)}%`,
  },
  {
    id: 'rally',
    name: '號令',
    describe: (l) => `每 ${strikeCooldownWaves(l)} 波補 ${PER_LEVEL.rallyHeroes * l} 個勇者`,
  },
  {
    id: 'aegis',
    name: '壁障',
    describe: (l) => `每 ${strikeCooldownWaves(l) + 2} 波擋下一整波的損失`,
  },
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
  // 帶滿 10 格之後只能升級手上的——不然「廣度 vs 深度」那個決策不存在(永遠可以再拿新的)。
  const full = skills.length >= MAX_RUN_SKILL_SLOTS;
  const pool = RUN_SKILLS
    .filter((spec) => !full || skills.some((s) => s.id === spec.id))
    .map((spec) => ({ id: spec.id, level: runSkillLevel(skills, spec.id) + 1 }))
    .filter((o) => o.level <= MAX_RUN_SKILL_LEVEL);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, RUN_SKILL_OFFERS);
}

/**
 * 這一場的第 n 次選擇會開出哪三個。**由跑圖的 seed 決定,不是即時亂數。**
 *
 * 為什麼一定要可重現:敵人戰力是照「這一場的最佳路線」算的(laneRun 的 createRun),
 * 而最佳路線包含技能。四選三會漏掉一個,漏掉的剛好是「這次最該點的」時,
 * 玩家就走不到理想曲線上——用即時亂數的話 createRun 根本不知道漏了哪個,
 * 只能拿「假設永遠開得出最佳選項」的表去估,實測領先幅度會在 1.41x~2.70x 之間漂,
 * 結構保證(每一排都精確等於 1/ENEMY_POWER_RATIO)就沒了。
 * 綁 seed 之後 createRun 可以把同一組選項重播一次,理想路線才是真的「這一場」的上限。
 */
export function runSkillOffersAt(skills: RunSkillState[], seed: number, ordinal: number): RunSkillState[] {
  // 跟跑圖的閘門用不同的雜湊常數:共用一條的話,多開一次選單就會把後面所有閘門位移。
  let x = (Math.imul(seed ^ 0x5bf03635, 0x27d4eb2f) ^ Math.imul(ordinal + 1, 0x85ebca6b)) >>> 0;
  const rng = () => {
    x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return (x >>> 8) / 0x1000000;
  };
  return runSkillOffers(skills, rng);
}

/**
 * 「最會加戰力」的那個選項。理想路線與驗證腳本都用這一個函式,不要各自寫一份——
 * 兩邊的貪心規則只要差一點,敵人就是照另一個玩家算的。
 *
 * 比的是「選下去之後整組的總戰力倍率」,不是單一技能自己的幅度:技能之間相加不相乘,
 * 所以鋒刃 +18% 在攻擊已經堆高時的邊際效益會低於增殖 +25%,反之亦然——
 * 貪心的實際行為是把兩邊拉平,只看單項幅度會挑錯。
 */
export function bestRunSkillChoice(skills: RunSkillState[], offers: RunSkillState[]): RunSkillState {
  let best = offers[0];
  let bestGain = -1;
  for (const o of offers) {
    const e = runSkillEffects(learnRunSkill(skills, o));
    const gain = e.attackMultiplier * e.heroMultiplier;
    if (gain > bestGain) { bestGain = gain; best = o; }
  }
  return best;
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
  /** 兌換率乘這個 */
  tradeMultiplier: number;
  /** 額外暴擊率(純演出) */
  bonusCrit: number;
  /**
   * 目前帶著的主動技能,每一款各自的冷卻與效果。
   *
   * **主動技能一律是固定效果,不是百分比戰力。** 百分比會被敵人曲線完全吸收
   * (敵人照最佳路線算,而最佳路線包含技能),畫面很炫但難度一點沒動;固定效果對已經
   * 滾出 80 人的最佳玩家是零頭,對剩 12 個人的你是活下來——**越落後越有用**。
   * 也因為這樣它們**不進理想路線**(理想玩家全清,額外擊殺對他是浪費),
   * 不會讓敵人為了一個沒人用得到的東西變強(跟兌換率同一個道理)。
   */
  actives: ActiveTrigger[];
}

/** 一款主動技能觸發時做什麼。 */
export interface ActiveTrigger {
  id: RunSkillId;
  name: string;
  /** 幾波觸發一次 */
  cooldown: number;
  /** 直接清掉幾隻(固定值) */
  kills?: number;
  /** 清掉整波的幾成(比例值) */
  killRatio?: number;
  /** 直接補幾個勇者 */
  heroes?: number;
  /** 擋下這一波的全部損失 */
  immune?: boolean;
}

/**
 * 目前帶的場內技能加起來是什麼效果。
 * 技能之間**相加不相乘**,跟永久技能同一個理由:相加算得出上限,而且玩家看到的 +18% 就真的是 +18%。
 */
export function runSkillEffects(skills: RunSkillState[]): RunSkillEffects {
  let attack = 0;
  let heroes = 0;
  let trade = 0;
  let crit = 0;
  const actives: ActiveTrigger[] = [];
  for (const s of skills) {
    const level = Math.min(MAX_RUN_SKILL_LEVEL, Math.max(0, s.level));
    if (s.id === 'edge') attack += PER_LEVEL.edgeAttack * level;
    if (s.id === 'swarm') heroes += PER_LEVEL.swarmHeroes * level;
    if (s.id === 'bulwark') trade += PER_LEVEL.bulwarkTrade * level;
    if (s.id === 'focus') crit += PER_LEVEL.focusCrit * level;
    if (level <= 0) continue;
    if (s.id === 'strike') {
      actives.push({ id: s.id, name: '爆裂', cooldown: strikeCooldownWaves(level), kills: PER_LEVEL.strikeKills * level });
    }
    if (s.id === 'pierce') {
      actives.push({ id: s.id, name: '貫穿', cooldown: strikeCooldownWaves(level), killRatio: PER_LEVEL.pierceRatio * level });
    }
    if (s.id === 'rally') {
      actives.push({ id: s.id, name: '號令', cooldown: strikeCooldownWaves(level), heroes: PER_LEVEL.rallyHeroes * level });
    }
    if (s.id === 'aegis') {
      actives.push({ id: s.id, name: '壁障', cooldown: strikeCooldownWaves(level) + 2, immune: true });
    }
  }
  return {
    attackMultiplier: 1 + attack,
    heroMultiplier: 1 + heroes,
    tradeMultiplier: 1 + trade,
    bonusCrit: crit,
    actives,
  };
}

/** 選一個技能會動到的三個數字。 */
export interface RunSkillStats {
  perHero: number;
  heroes: number;
  tradeRate: number;
}

/**
 * 選中一個技能之後,數值變成多少。**玩家側、模擬器、createRun 的理想路線一律走這一支。**
 *
 * 為什麼要共用而不是各自乘一次:人數是整數,乘完要取整,而**取整的方向會改變結果**——
 * 理想路線用浮點、玩家用 Math.round 的話,2 人吃到 +25% 是 round(2.5)=3(等於 +50%),
 * 實測領先幅度會從 2.43x 漂到 2.80x,結構保證就只剩「大概」。
 *
 * 增殖保證**至少 +1 人**:1 隻的時候 round(1 x 1.25) = 1,選了完全沒反應——
 * 玩家看到「勇者數量 +25%」卻什麼都沒發生,會直接認定這個技能是壞的。
 * 前段超額是這款一直以來的形狀(閘門的「勇者 +N」在 1 人的時候也是直接翻倍),
 * 而且敵人照同一條路線算,超額不會變成免費的難度折扣。
 */
export function applyRunSkillPick(
  skills: RunSkillState[],
  choice: RunSkillState,
  stats: RunSkillStats,
): RunSkillStats {
  const before = runSkillEffects(skills);
  const after = runSkillEffects(learnRunSkill(skills, choice));
  const atk = after.attackMultiplier / before.attackMultiplier;
  const her = after.heroMultiplier / before.heroMultiplier;
  const trade = after.tradeMultiplier / before.tradeMultiplier;
  return {
    perHero: Math.max(1, Math.round(stats.perHero * atk)),
    heroes: her > 1
      ? Math.max(stats.heroes + 1, Math.round(stats.heroes * her))
      : Math.max(1, Math.round(stats.heroes * her)),
    tradeRate: Math.max(1, stats.tradeRate * trade),
  };
}

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
