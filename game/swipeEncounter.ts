import {
  createThreatSequence,
  REACTION_WINDOW_FLOOR_STAGE,
  threatCountForEncounter,
  type HeroCombatStats,
  type MonsterCombatStats,
  type Threat,
} from './swipeCombat';

// 一場遭遇的數值。這裡的曲線跟姊妹作(勇者發呆中)完全脫鉤,不能沿用——姊妹作的攻防血是為
// 「掛機幾小時自動推進」設計的,一場戰鬥以秒計、玩家不參與;本作一場戰鬥是玩家連續反應
// 十來次的操作段落,長度要用「幾次反擊」來設計,不是幾秒。
//
// 第一版照姊妹作的寫法「血量每關 +10%、攻擊力隨等級線性成長」,結果第 200 關要打 84 下才死
// (第 1 關只要 7 下)——兩條線的成長率根本不同階,關卡越後面戰鬥越長到不能玩。
// 現在改成**直接以「打幾下」當設計單位**:怪物血量 = 該關基準攻擊力 × TARGET_HITS,
// 所以不管第幾關,打死一隻普通怪都是固定的下數,難度完全來自反應窗與失誤容忍度。

/** 全 good、沒有連段與爆擊加成時,打死一隻普通怪需要的反擊次數。 */
export const TARGET_HITS = 9;

// 失誤容忍度:這一關可以挨幾下才會倒。從第 1 關的 7 下壓到第 60 關的 4 下,跟反應窗同步收緊,
// 兩者一起構成難度曲線。低於 4 的話一次分神就直接結束,挫折感大於挑戰感。
export const MISS_TOLERANCE_START = 7;
export const MISS_TOLERANCE_FLOOR = 4;

export function missTolerance(stage: number): number {
  const t = Math.min(1, Math.max(0, (stage - 1) / (REACTION_WINDOW_FLOOR_STAGE - 1)));
  return MISS_TOLERANCE_START - t * (MISS_TOLERANCE_START - MISS_TOLERANCE_FLOOR);
}

export function heroStatsForLevel(level: number): HeroCombatStats {
  return {
    attackPower: 20 + level * 8,
    maxHp: 200 + level * 40,
    critRate: 0.12,
    critDamage: 1.7,
  };
}

/** 這一關「預期玩家練到幾級」。怪物數值全部從這個基準推,跟玩家實際等級無關——這樣練等才有意義。 */
export function expectedLevelForStage(stage: number): number {
  return Math.max(1, Math.ceil(stage / 3));
}

/**
 * 怪物數值只看關卡,不看玩家等級。這是「練等有意義」的關鍵:玩家超前練等時攻擊力變高
 * (打死得更快)、血量變厚(挨得起更多下),而怪物不會跟著長。
 */
export function monsterStatsForStage(stage: number): MonsterCombatStats {
  const baseline = heroStatsForLevel(expectedLevelForStage(stage));
  return {
    maxHp: Math.round(baseline.attackPower * TARGET_HITS),
    attackPower: Math.round(baseline.maxHp / missTolerance(stage)),
  };
}

export interface EncounterPlan {
  stage: number;
  hero: HeroCombatStats;
  monster: MonsterCombatStats;
  threats: Threat[];
}

export function createEncounterPlan(stage: number, level: number, seed: number): EncounterPlan {
  const hero = heroStatsForLevel(level);
  const monster = monsterStatsForStage(stage);
  const threats = createThreatSequence(seed, stage, threatCountForEncounter(hero, monster));
  return { stage, hero, monster, threats };
}
