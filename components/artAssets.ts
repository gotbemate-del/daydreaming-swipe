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

export const HERO_ASPECT = 353 / 746; // 原圖尺寸,拿來由高度反推寬度

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
