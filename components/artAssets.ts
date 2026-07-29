// 既有素材(assets/sprites 底下的手繪像素圖)對應表。
//
// 為什麼放在 components/ 而不是 game/:require() 進來的是 RN 的圖片資源,game/ 必須能在 Node
// 單獨跑(CLAUDE.md 的分層鐵律),不能碰到任何 RN API。所以 game/ 只吐 id,由這一層換成圖。
//
// require 的路徑一定要是字面字串,Metro 才打包得到——不能用樣板字串組出來,所以下面全部展開寫。
import type { ImageSourcePropType } from 'react-native';

/** 勇者。三張是同一個姿勢的睜眼/半闔/閉眼,拿來做眨眼,不是三個不同角色。 */
export const HERO_FRAMES: ImageSourcePropType[] = [
  require('../assets/sprites/hero/student.png'),
  require('../assets/sprites/hero/student_middle.png'),
  require('../assets/sprites/hero/student_click.png'),
];

// 由高度反推寬度用。刻意取「最寬的那一張」(職業立繪 458x746,學生只有 353x746):
// 所有立繪共用同一個框 + resizeMode contain,框比圖窄的話寬的那幾張會被縮到變矮一截,
// 轉職之後勇者突然變小隻。框取最寬的,窄的圖置中留白,高度就都一致了。
export const HERO_ASPECT = 458 / 746;

/** 勇者擲出去的武器。沿用既有的傳承之劍,不另外畫特效圖。 */
export const PROJECTILE_ART: ImageSourcePropType = require('../assets/sprites/items/legacy_sword.png');

// 12 種身體原型,對應 game/monsters.ts 的 ARCHETYPE_CATALOG.key。怪物 id 是 `${archetype}-${slot}`,
// slot(強度稱號)共用同一張原型圖——這跟 game/sprites/monsters.ts 的做法一致:一副骨架、多種強度。
const MONSTER_ART: Record<string, ImageSourcePropType> = {
  blob: require('../assets/sprites/monsters/ai/blob_open.png'),
  flying: require('../assets/sprites/monsters/ai/flying_open.png'),
  biped: require('../assets/sprites/monsters/ai/biped_open.png'),
  fungal: require('../assets/sprites/monsters/ai/fungal_open.png'),
  undead: require('../assets/sprites/monsters/ai/undead_open.png'),
  construct: require('../assets/sprites/monsters/ai/construct_open.png'),
  dragon: require('../assets/sprites/monsters/ai/dragon_open.png'),
  quadruped: require('../assets/sprites/monsters/ai/quadruped_open.png'),
  serpent: require('../assets/sprites/monsters/ai/serpent_open.png'),
  insect: require('../assets/sprites/monsters/ai/insect_open.png'),
  aquatic: require('../assets/sprites/monsters/ai/aquatic_open.png'),
  elemental: require('../assets/sprites/monsters/ai/elemental_open.png'),
  stage_boss_tier1: require('../assets/sprites/monsters/ai/boss_tier1_open.png'),
  stage_boss_tier2: require('../assets/sprites/monsters/ai/boss_tier2_open.png'),
  stage_boss_tier3: require('../assets/sprites/monsters/ai/boss_tier3_open.png'),
  stage_boss_tier4: require('../assets/sprites/monsters/ai/boss_tier4_open.png'),
  stage_boss_tier5: require('../assets/sprites/monsters/ai/boss_tier5_open.png'),
  final_boss: require('../assets/sprites/monsters/ai/boss_final_open.png'),
};

/** 拿不到就退回史萊姆:少一張圖不該讓整場跑圖開天窗。 */
export function monsterArt(monsterId: string): ImageSourcePropType {
  const archetype = monsterId.includes('-') ? monsterId.slice(0, monsterId.lastIndexOf('-')) : monsterId;
  return MONSTER_ART[archetype] ?? MONSTER_ART.blob;
}

// ---- 職業 ----
// 6 條路線 x A/B 分支 x 5 階,對應 game/laneJobs.ts。素材分四個資料夾,命名規則各不相同
// (jobs 沒有分支、jobs2 是 _A/_B、jobs3 與 jobs4 多了 _open 後綴),所以只能一條一條列。
// 第 5 階沒有獨立美術,沿用第 4 階——職稱與數值仍然不同,只有立繪重複。
const JOB_ART: Record<string, ImageSourcePropType> = {
  'physicalMelee-A-1': require('../assets/sprites/hero/jobs/physicalMelee.png'),
  'physicalMelee-B-1': require('../assets/sprites/hero/jobs/physicalMelee.png'),
  'physicalRanged-A-1': require('../assets/sprites/hero/jobs/physicalRanged.png'),
  'physicalRanged-B-1': require('../assets/sprites/hero/jobs/physicalRanged.png'),
  'physicalSupport-A-1': require('../assets/sprites/hero/jobs/physicalSupport.png'),
  'physicalSupport-B-1': require('../assets/sprites/hero/jobs/physicalSupport.png'),
  'magicMelee-A-1': require('../assets/sprites/hero/jobs/magicMelee.png'),
  'magicMelee-B-1': require('../assets/sprites/hero/jobs/magicMelee.png'),
  'magicRanged-A-1': require('../assets/sprites/hero/jobs/magicRanged.png'),
  'magicRanged-B-1': require('../assets/sprites/hero/jobs/magicRanged.png'),
  'magicSupport-A-1': require('../assets/sprites/hero/jobs/magicSupport.png'),
  'magicSupport-B-1': require('../assets/sprites/hero/jobs/magicSupport.png'),
  'physicalMelee-A-2': require('../assets/sprites/hero/jobs2/physicalMelee_A.png'),
  'physicalMelee-B-2': require('../assets/sprites/hero/jobs2/physicalMelee_B.png'),
  'physicalRanged-A-2': require('../assets/sprites/hero/jobs2/physicalRanged_A.png'),
  'physicalRanged-B-2': require('../assets/sprites/hero/jobs2/physicalRanged_B.png'),
  'physicalSupport-A-2': require('../assets/sprites/hero/jobs2/physicalSupport_A.png'),
  'physicalSupport-B-2': require('../assets/sprites/hero/jobs2/physicalSupport_B.png'),
  'magicMelee-A-2': require('../assets/sprites/hero/jobs2/magicMelee_A.png'),
  'magicMelee-B-2': require('../assets/sprites/hero/jobs2/magicMelee_B.png'),
  'magicRanged-A-2': require('../assets/sprites/hero/jobs2/magicRanged_A.png'),
  'magicRanged-B-2': require('../assets/sprites/hero/jobs2/magicRanged_B.png'),
  'magicSupport-A-2': require('../assets/sprites/hero/jobs2/magicSupport_A.png'),
  'magicSupport-B-2': require('../assets/sprites/hero/jobs2/magicSupport_B.png'),
  'physicalMelee-A-3': require('../assets/sprites/hero/jobs3/physicalMelee_A_open.png'),
  'physicalMelee-B-3': require('../assets/sprites/hero/jobs3/physicalMelee_B_open.png'),
  'physicalRanged-A-3': require('../assets/sprites/hero/jobs3/physicalRanged_A_open.png'),
  'physicalRanged-B-3': require('../assets/sprites/hero/jobs3/physicalRanged_B_open.png'),
  'physicalSupport-A-3': require('../assets/sprites/hero/jobs3/physicalSupport_A_open.png'),
  'physicalSupport-B-3': require('../assets/sprites/hero/jobs3/physicalSupport_B_open.png'),
  'magicMelee-A-3': require('../assets/sprites/hero/jobs3/magicMelee_A_open.png'),
  'magicMelee-B-3': require('../assets/sprites/hero/jobs3/magicMelee_B_open.png'),
  'magicRanged-A-3': require('../assets/sprites/hero/jobs3/magicRanged_A_open.png'),
  'magicRanged-B-3': require('../assets/sprites/hero/jobs3/magicRanged_B_open.png'),
  'magicSupport-A-3': require('../assets/sprites/hero/jobs3/magicSupport_A_open.png'),
  'magicSupport-B-3': require('../assets/sprites/hero/jobs3/magicSupport_B_open.png'),
  'physicalMelee-A-4': require('../assets/sprites/hero/jobs4/physicalMelee_A_open.png'),
  'physicalMelee-B-4': require('../assets/sprites/hero/jobs4/physicalMelee_B_open.png'),
  'physicalRanged-A-4': require('../assets/sprites/hero/jobs4/physicalRanged_A_open.png'),
  'physicalRanged-B-4': require('../assets/sprites/hero/jobs4/physicalRanged_B_open.png'),
  'physicalSupport-A-4': require('../assets/sprites/hero/jobs4/physicalSupport_A_open.png'),
  'physicalSupport-B-4': require('../assets/sprites/hero/jobs4/physicalSupport_B_open.png'),
  'magicMelee-A-4': require('../assets/sprites/hero/jobs4/magicMelee_A_open.png'),
  'magicMelee-B-4': require('../assets/sprites/hero/jobs4/magicMelee_B_open.png'),
  'magicRanged-A-4': require('../assets/sprites/hero/jobs4/magicRanged_A_open.png'),
  'magicRanged-B-4': require('../assets/sprites/hero/jobs4/magicRanged_B_open.png'),
  'magicSupport-A-4': require('../assets/sprites/hero/jobs4/magicSupport_A_open.png'),
  'magicSupport-B-4': require('../assets/sprites/hero/jobs4/magicSupport_B_open.png'),
  'physicalMelee-A-5': require('../assets/sprites/hero/jobs4/physicalMelee_A_open.png'),
  'physicalMelee-B-5': require('../assets/sprites/hero/jobs4/physicalMelee_B_open.png'),
  'physicalRanged-A-5': require('../assets/sprites/hero/jobs4/physicalRanged_A_open.png'),
  'physicalRanged-B-5': require('../assets/sprites/hero/jobs4/physicalRanged_B_open.png'),
  'physicalSupport-A-5': require('../assets/sprites/hero/jobs4/physicalSupport_A_open.png'),
  'physicalSupport-B-5': require('../assets/sprites/hero/jobs4/physicalSupport_B_open.png'),
  'magicMelee-A-5': require('../assets/sprites/hero/jobs4/magicMelee_A_open.png'),
  'magicMelee-B-5': require('../assets/sprites/hero/jobs4/magicMelee_B_open.png'),
  'magicRanged-A-5': require('../assets/sprites/hero/jobs4/magicRanged_A_open.png'),
  'magicRanged-B-5': require('../assets/sprites/hero/jobs4/magicRanged_B_open.png'),
  'magicSupport-A-5': require('../assets/sprites/hero/jobs4/magicSupport_A_open.png'),
  'magicSupport-B-5': require('../assets/sprites/hero/jobs4/magicSupport_B_open.png'),
};

/** 職業立繪。還沒轉職(null)就是學生。 */
export function jobHeroArt(archetype: string | null, branch: string, tier: number): ImageSourcePropType {
  if (archetype === null) return HERO_FRAMES[0];
  return JOB_ART[`${archetype}-${branch}-${tier}`] ?? HERO_FRAMES[0];
}

// ---- 武器 ----
// 裝備等級 1~5 對應各路線的 t1~t5 單手武器。換裝備閘門吃下去之後手上的武器真的會換一把,
// 「傷害變高」不是只有數字動,畫面上看得到。還沒轉職的學生沿用傳承之劍。
const WEAPON_ART: Record<string, ImageSourcePropType> = {
  'physicalMelee-1': require('../assets/sprites/items/physicalMelee/physicalMelee_t1_1h.png'),
  'physicalMelee-2': require('../assets/sprites/items/physicalMelee/physicalMelee_t2_1h.png'),
  'physicalMelee-3': require('../assets/sprites/items/physicalMelee/physicalMelee_t3_1h.png'),
  'physicalMelee-4': require('../assets/sprites/items/physicalMelee/physicalMelee_t4_1h.png'),
  'physicalMelee-5': require('../assets/sprites/items/physicalMelee/physicalMelee_t5_1h.png'),
  'physicalRanged-1': require('../assets/sprites/items/physicalRanged/physicalRanged_t1_1h.png'),
  'physicalRanged-2': require('../assets/sprites/items/physicalRanged/physicalRanged_t2_1h.png'),
  'physicalRanged-3': require('../assets/sprites/items/physicalRanged/physicalRanged_t3_1h.png'),
  'physicalRanged-4': require('../assets/sprites/items/physicalRanged/physicalRanged_t4_1h.png'),
  'physicalRanged-5': require('../assets/sprites/items/physicalRanged/physicalRanged_t5_1h.png'),
  'physicalSupport-1': require('../assets/sprites/items/physicalSupport/physicalSupport_t1_1h.png'),
  'physicalSupport-2': require('../assets/sprites/items/physicalSupport/physicalSupport_t2_1h.png'),
  'physicalSupport-3': require('../assets/sprites/items/physicalSupport/physicalSupport_t3_1h.png'),
  'physicalSupport-4': require('../assets/sprites/items/physicalSupport/physicalSupport_t4_1h.png'),
  'physicalSupport-5': require('../assets/sprites/items/physicalSupport/physicalSupport_t5_1h.png'),
  'magicMelee-1': require('../assets/sprites/items/magicMelee/magicMelee_t1_1h.png'),
  'magicMelee-2': require('../assets/sprites/items/magicMelee/magicMelee_t2_1h.png'),
  'magicMelee-3': require('../assets/sprites/items/magicMelee/magicMelee_t3_1h.png'),
  'magicMelee-4': require('../assets/sprites/items/magicMelee/magicMelee_t4_1h.png'),
  'magicMelee-5': require('../assets/sprites/items/magicMelee/magicMelee_t5_1h.png'),
  'magicRanged-1': require('../assets/sprites/items/magicRanged/magicRanged_t1_1h.png'),
  'magicRanged-2': require('../assets/sprites/items/magicRanged/magicRanged_t2_1h.png'),
  'magicRanged-3': require('../assets/sprites/items/magicRanged/magicRanged_t3_1h.png'),
  'magicRanged-4': require('../assets/sprites/items/magicRanged/magicRanged_t4_1h.png'),
  'magicRanged-5': require('../assets/sprites/items/magicRanged/magicRanged_t5_1h.png'),
  'magicSupport-1': require('../assets/sprites/items/magicSupport/magicSupport_t1_1h.png'),
  'magicSupport-2': require('../assets/sprites/items/magicSupport/magicSupport_t2_1h.png'),
  'magicSupport-3': require('../assets/sprites/items/magicSupport/magicSupport_t3_1h.png'),
  'magicSupport-4': require('../assets/sprites/items/magicSupport/magicSupport_t4_1h.png'),
  'magicSupport-5': require('../assets/sprites/items/magicSupport/magicSupport_t5_1h.png'),
};

// 同一階還有雙手武器版本。一支隊伍丟出來的東西全部一模一樣會很平,交錯丟兩種就有「一群人
// 各拿各的武器」的感覺,而且不必另外畫圖。
const WEAPON_ART_2H: Record<string, ImageSourcePropType> = {
  'physicalMelee-1': require('../assets/sprites/items/physicalMelee/physicalMelee_t1_2h.png'),
  'physicalMelee-2': require('../assets/sprites/items/physicalMelee/physicalMelee_t2_2h.png'),
  'physicalMelee-3': require('../assets/sprites/items/physicalMelee/physicalMelee_t3_2h.png'),
  'physicalMelee-4': require('../assets/sprites/items/physicalMelee/physicalMelee_t4_2h.png'),
  'physicalMelee-5': require('../assets/sprites/items/physicalMelee/physicalMelee_t5_2h.png'),
  'physicalRanged-1': require('../assets/sprites/items/physicalRanged/physicalRanged_t1_2h.png'),
  'physicalRanged-2': require('../assets/sprites/items/physicalRanged/physicalRanged_t2_2h.png'),
  'physicalRanged-3': require('../assets/sprites/items/physicalRanged/physicalRanged_t3_2h.png'),
  'physicalRanged-4': require('../assets/sprites/items/physicalRanged/physicalRanged_t4_2h.png'),
  'physicalRanged-5': require('../assets/sprites/items/physicalRanged/physicalRanged_t5_2h.png'),
  'physicalSupport-1': require('../assets/sprites/items/physicalSupport/physicalSupport_t1_2h.png'),
  'physicalSupport-2': require('../assets/sprites/items/physicalSupport/physicalSupport_t2_2h.png'),
  'physicalSupport-3': require('../assets/sprites/items/physicalSupport/physicalSupport_t3_2h.png'),
  'physicalSupport-4': require('../assets/sprites/items/physicalSupport/physicalSupport_t4_2h.png'),
  'physicalSupport-5': require('../assets/sprites/items/physicalSupport/physicalSupport_t5_2h.png'),
  'magicMelee-1': require('../assets/sprites/items/magicMelee/magicMelee_t1_2h.png'),
  'magicMelee-2': require('../assets/sprites/items/magicMelee/magicMelee_t2_2h.png'),
  'magicMelee-3': require('../assets/sprites/items/magicMelee/magicMelee_t3_2h.png'),
  'magicMelee-4': require('../assets/sprites/items/magicMelee/magicMelee_t4_2h.png'),
  'magicMelee-5': require('../assets/sprites/items/magicMelee/magicMelee_t5_2h.png'),
  'magicRanged-1': require('../assets/sprites/items/magicRanged/magicRanged_t1_2h.png'),
  'magicRanged-2': require('../assets/sprites/items/magicRanged/magicRanged_t2_2h.png'),
  'magicRanged-3': require('../assets/sprites/items/magicRanged/magicRanged_t3_2h.png'),
  'magicRanged-4': require('../assets/sprites/items/magicRanged/magicRanged_t4_2h.png'),
  'magicRanged-5': require('../assets/sprites/items/magicRanged/magicRanged_t5_2h.png'),
  'magicSupport-1': require('../assets/sprites/items/magicSupport/magicSupport_t1_2h.png'),
  'magicSupport-2': require('../assets/sprites/items/magicSupport/magicSupport_t2_2h.png'),
  'magicSupport-3': require('../assets/sprites/items/magicSupport/magicSupport_t3_2h.png'),
  'magicSupport-4': require('../assets/sprites/items/magicSupport/magicSupport_t4_2h.png'),
  'magicSupport-5': require('../assets/sprites/items/magicSupport/magicSupport_t5_2h.png'),
};

/**
 * 擲出去的武器。variant 讓同一支隊伍交錯丟單手/雙手兩種,不是全部同一把。
 * 還沒轉職的學生沒有職業武器,沿用傳承之劍。
 */
export function weaponArt(archetype: string | null, gear: number, variant = 0): ImageSourcePropType {
  const tier = Math.min(5, Math.max(1, Math.round(gear)));
  if (archetype === null) return PROJECTILE_ART;
  const table = variant % 2 === 0 ? WEAPON_ART : WEAPON_ART_2H;
  return table[`${archetype}-${tier}`] ?? WEAPON_ART[`${archetype}-${tier}`] ?? PROJECTILE_ART;
}
