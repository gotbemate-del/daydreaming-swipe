import { DamageType, JobTier } from './combat';
import { Rarity } from './trigger';

export interface MonsterSpec {
  id: string;
  name: string;
  rarity: Rarity;
  damageType: DamageType;
}

// 稀有度沿用 game/trigger.ts 的 Rarity,不另外發明新分級。damageType 為固定主題標記
// (物理/魔法系怪物/防禦系統對照用),非亂數決定。
//
// 12 種身體原型(見 game/sprites/monsters.ts 的 ARCHETYPES)x 10 個強度稱號 = 120 款怪物。
// 稀有度池大小只影響「抽到這個稀有度時看到哪一款造型」,不影響抽到各稀有度的機率
// (機率完全由 game/trigger.ts 的 rollTrigger 決定)——所以池子不必湊成 4 等分,common
// 玩家看最多次故意分配最多款式(4款/原型),legendary 反而最少(1款/原型)也不影響數值。
// id 命名規則 `${archetype}-${slot}`(slot 1~10)要跟 game/sprites/monsters.ts 的
// MONSTER_VISUALS 產生器保持一致,改動任一邊記得同步另一邊。
interface ArchetypeCatalogSpec {
  key: string;
  baseName: string;
  damageType: DamageType;
}

// 前 7 個沿用原本 slime/bat/goblin/mushroom/skeleton/golem/dragon 的角色設定,
// 後 5 個是新增原型。
const ARCHETYPE_CATALOG: ArchetypeCatalogSpec[] = [
  { key: 'blob', baseName: '史萊姆', damageType: 'magic' },
  { key: 'flying', baseName: '蝙蝠', damageType: 'physical' },
  { key: 'biped', baseName: '哥布林', damageType: 'physical' },
  { key: 'fungal', baseName: '菇菇怪', damageType: 'magic' },
  { key: 'undead', baseName: '骷髏戰士', damageType: 'physical' },
  { key: 'construct', baseName: '石魔像', damageType: 'magic' },
  { key: 'dragon', baseName: '幼龍', damageType: 'magic' },
  { key: 'quadruped', baseName: '野狼', damageType: 'physical' },
  { key: 'serpent', baseName: '巨蟒', damageType: 'magic' },
  { key: 'insect', baseName: '甲蟲', damageType: 'physical' },
  { key: 'aquatic', baseName: '深海魚', damageType: 'magic' },
  { key: 'elemental', baseName: '元素獸', damageType: 'magic' },
];

// 10 個強度稱號槽位,對應 game/sprites/monsters.ts 的 TINTS(同一個 index 兩邊要對得上)。
// 稱號當前綴掛在 baseName 前面,common4款/rare3款/epic2款/legendary1款,共10款。
const RARITY_SLOTS: { prefix: string; rarity: Rarity }[] = [
  { prefix: '小', rarity: 'common' },
  { prefix: '', rarity: 'common' },
  { prefix: '大', rarity: 'common' },
  { prefix: '兇暴', rarity: 'common' },
  { prefix: '精銳', rarity: 'rare' },
  { prefix: '鋼甲', rarity: 'rare' },
  { prefix: '疾風', rarity: 'rare' },
  { prefix: '魔化', rarity: 'epic' },
  { prefix: '暗影', rarity: 'epic' },
  { prefix: '王者', rarity: 'legendary' },
];

function buildMonsterCatalog(): MonsterSpec[] {
  const monsters: MonsterSpec[] = [];
  for (const archetype of ARCHETYPE_CATALOG) {
    RARITY_SLOTS.forEach((slot, index) => {
      monsters.push({
        id: `${archetype.key}-${index + 1}`,
        name: `${slot.prefix}${archetype.baseName}`,
        rarity: slot.rarity,
        damageType: archetype.damageType,
      });
    });
  }
  return monsters;
}

export const MONSTERS: MonsterSpec[] = buildMonsterCatalog();

export function getMonstersByRarity(rarity: Rarity): MonsterSpec[] {
  return MONSTERS.filter((monster) => monster.rarity === rarity);
}

// 關卡系統(game/stages.ts)第 10 小關強制生成的魔王,獨立於一般稀有度亂數池之外,
// rarity 標 legendary 只是借用它最高檔的戰鬥時長基準去換算獎勵,不代表跟一般傳說怪同一個抽獎池。
// 魔王造型依玩家當下的職業階級(JobTier,對照 game/combat.ts 的 getCurrentTier)分成5款,
// 呼應主畫面背景(game/sprites/backgrounds.ts)本來就依階級由樸素到華麗遞進的視覺基調——
// 不再是全部關卡共用同一隻「關卡魔王」。
export const STAGE_BOSS_MONSTERS: Record<JobTier, MonsterSpec> = {
  1: { id: 'stage_boss_tier1', name: '荒地首領', rarity: 'legendary', damageType: 'physical' },
  2: { id: 'stage_boss_tier2', name: '窖藏獸王', rarity: 'legendary', damageType: 'physical' },
  3: { id: 'stage_boss_tier3', name: '鏽甲督軍', rarity: 'legendary', damageType: 'physical' },
  4: { id: 'stage_boss_tier4', name: '幽夜魔君', rarity: 'legendary', damageType: 'magic' },
  5: { id: 'stage_boss_tier5', name: '巔峰宗師', rarity: 'legendary', damageType: 'physical' },
};
export const FINAL_BOSS_MONSTER: MonsterSpec = { id: 'final_boss', name: '大魔王', rarity: 'legendary', damageType: 'magic' };

export function getStageBossMonster(tier: JobTier): MonsterSpec {
  return STAGE_BOSS_MONSTERS[tier];
}

export function pickMonster(rarity: Rarity, rng: () => number = Math.random): MonsterSpec {
  const pool = getMonstersByRarity(rarity);
  const index = Math.min(Math.floor(rng() * pool.length), pool.length - 1);
  return pool[index];
}
