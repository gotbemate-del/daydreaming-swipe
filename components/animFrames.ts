// 這個檔是 scripts/align-frames.py 產生的,不要手改——改了下次跑腳本就沒了。
//
// 每一組是「對齊過的兩格」+ 幾何比例。兩格共用同一張畫布(重心對齊、底邊對齊),
// 所以畫面端只要換 source 就好;比例是給畫框用的,見 align-frames.py 的說明。
import type { ImageSourcePropType } from 'react-native';

export interface AnimArt {
  /** 第 0 格是待機、第 1 格是動作。兩格畫布完全一樣。 */
  frames: ImageSourcePropType[];
  /** 框寬 = size * wRatio(size 就是原本那個 42/84/132) */
  wRatio: number;
  /** 框高 = size * hRatio */
  hRatio: number;
  /** 身體重心在框裡的水平位置(0~1)。左邊 = 中心 - 框寬 * anchor。 */
  anchor: number;
}

export const MONSTER_ANIM: Record<string, AnimArt> = {
  'aquatic': {
    frames: [require('../assets/sprites/anim/monsters/aquatic_0.png'), require('../assets/sprites/anim/monsters/aquatic_1.png')],
    wRatio: 1.0461, hRatio: 1.0276, anchor: 0.4919,
  },
  'biped': {
    frames: [require('../assets/sprites/anim/monsters/biped_0.png'), require('../assets/sprites/anim/monsters/biped_1.png')],
    wRatio: 1.3400, hRatio: 1.0397, anchor: 0.5123,
  },
  'blob': {
    frames: [require('../assets/sprites/anim/monsters/blob_0.png'), require('../assets/sprites/anim/monsters/blob_1.png')],
    wRatio: 1.1090, hRatio: 0.8511, anchor: 0.5012,
  },
  'boss_final': {
    frames: [require('../assets/sprites/anim/monsters/boss_final_0.png'), require('../assets/sprites/anim/monsters/boss_final_1.png')],
    wRatio: 0.6896, hRatio: 1.0396, anchor: 0.5050,
  },
  'boss_tier1': {
    frames: [require('../assets/sprites/anim/monsters/boss_tier1_0.png'), require('../assets/sprites/anim/monsters/boss_tier1_1.png')],
    wRatio: 1.0682, hRatio: 1.2588, anchor: 0.4820,
  },
  'boss_tier2': {
    frames: [require('../assets/sprites/anim/monsters/boss_tier2_0.png'), require('../assets/sprites/anim/monsters/boss_tier2_1.png')],
    wRatio: 0.9272, hRatio: 1.0395, anchor: 0.5324,
  },
  'boss_tier3': {
    frames: [require('../assets/sprites/anim/monsters/boss_tier3_0.png'), require('../assets/sprites/anim/monsters/boss_tier3_1.png')],
    wRatio: 0.8731, hRatio: 1.2401, anchor: 0.5050,
  },
  'boss_tier4': {
    frames: [require('../assets/sprites/anim/monsters/boss_tier4_0.png'), require('../assets/sprites/anim/monsters/boss_tier4_1.png')],
    wRatio: 0.9705, hRatio: 1.0399, anchor: 0.4514,
  },
  'boss_tier5': {
    frames: [require('../assets/sprites/anim/monsters/boss_tier5_0.png'), require('../assets/sprites/anim/monsters/boss_tier5_1.png')],
    wRatio: 0.8242, hRatio: 1.0392, anchor: 0.4688,
  },
  'construct': {
    frames: [require('../assets/sprites/anim/monsters/construct_0.png'), require('../assets/sprites/anim/monsters/construct_1.png')],
    wRatio: 1.0698, hRatio: 1.0395, anchor: 0.5106,
  },
  'dragon': {
    frames: [require('../assets/sprites/anim/monsters/dragon_0.png'), require('../assets/sprites/anim/monsters/dragon_1.png')],
    wRatio: 0.8225, hRatio: 1.0390, anchor: 0.4557,
  },
  'elemental': {
    frames: [require('../assets/sprites/anim/monsters/elemental_0.png'), require('../assets/sprites/anim/monsters/elemental_1.png')],
    wRatio: 0.7960, hRatio: 1.0829, anchor: 0.5503,
  },
  'flying': {
    frames: [require('../assets/sprites/anim/monsters/flying_0.png'), require('../assets/sprites/anim/monsters/flying_1.png')],
    wRatio: 1.0405, hRatio: 0.4825, anchor: 0.5062,
  },
  'fungal': {
    frames: [require('../assets/sprites/anim/monsters/fungal_0.png'), require('../assets/sprites/anim/monsters/fungal_1.png')],
    wRatio: 1.0412, hRatio: 0.9419, anchor: 0.4953,
  },
  'insect': {
    frames: [require('../assets/sprites/anim/monsters/insect_0.png'), require('../assets/sprites/anim/monsters/insect_1.png')],
    wRatio: 1.1885, hRatio: 0.8544, anchor: 0.5328,
  },
  'quadruped': {
    frames: [require('../assets/sprites/anim/monsters/quadruped_0.png'), require('../assets/sprites/anim/monsters/quadruped_1.png')],
    wRatio: 1.2324, hRatio: 0.8303, anchor: 0.4626,
  },
  'serpent': {
    frames: [require('../assets/sprites/anim/monsters/serpent_0.png'), require('../assets/sprites/anim/monsters/serpent_1.png')],
    wRatio: 1.0422, hRatio: 1.0378, anchor: 0.5010,
  },
  'undead': {
    frames: [require('../assets/sprites/anim/monsters/undead_0.png'), require('../assets/sprites/anim/monsters/undead_1.png')],
    wRatio: 0.7464, hRatio: 1.0393, anchor: 0.5657,
  },
};

export const JOB_ANIM: Record<string, AnimArt> = {
  'jobs/magicMelee': {
    frames: [require('../assets/sprites/anim/jobs/magicMelee_0.png'), require('../assets/sprites/anim/jobs/magicMelee_1.png'), require('../assets/sprites/anim/jobs/magicMelee_2.png')],
    wRatio: 0.6744, hRatio: 1.0395, anchor: 0.5164,
  },
  'jobs/magicRanged': {
    frames: [require('../assets/sprites/anim/jobs/magicRanged_0.png'), require('../assets/sprites/anim/jobs/magicRanged_1.png'), require('../assets/sprites/anim/jobs/magicRanged_2.png')],
    wRatio: 0.6913, hRatio: 1.0656, anchor: 0.5207,
  },
  'jobs/magicSupport': {
    frames: [require('../assets/sprites/anim/jobs/magicSupport_0.png'), require('../assets/sprites/anim/jobs/magicSupport_1.png'), require('../assets/sprites/anim/jobs/magicSupport_2.png')],
    wRatio: 0.6872, hRatio: 1.0656, anchor: 0.4750,
  },
  'jobs/physicalMelee': {
    frames: [require('../assets/sprites/anim/jobs/physicalMelee_0.png'), require('../assets/sprites/anim/jobs/physicalMelee_1.png'), require('../assets/sprites/anim/jobs/physicalMelee_2.png')],
    wRatio: 0.6381, hRatio: 1.0402, anchor: 0.5090,
  },
  'jobs/physicalRanged': {
    frames: [require('../assets/sprites/anim/jobs/physicalRanged_0.png'), require('../assets/sprites/anim/jobs/physicalRanged_1.png'), require('../assets/sprites/anim/jobs/physicalRanged_2.png')],
    wRatio: 0.6166, hRatio: 1.0402, anchor: 0.4865,
  },
  'jobs/physicalSupport': {
    frames: [require('../assets/sprites/anim/jobs/physicalSupport_0.png'), require('../assets/sprites/anim/jobs/physicalSupport_1.png'), require('../assets/sprites/anim/jobs/physicalSupport_2.png')],
    wRatio: 0.6578, hRatio: 1.0573, anchor: 0.4958,
  },
  'jobs2/magicMelee_A': {
    frames: [require('../assets/sprites/anim/jobs2/magicMelee_A_0.png'), require('../assets/sprites/anim/jobs2/magicMelee_A_1.png'), require('../assets/sprites/anim/jobs2/magicMelee_A_2.png')],
    wRatio: 0.5995, hRatio: 1.0395, anchor: 0.5376,
  },
  'jobs2/magicMelee_B': {
    frames: [require('../assets/sprites/anim/jobs2/magicMelee_B_0.png'), require('../assets/sprites/anim/jobs2/magicMelee_B_1.png'), require('../assets/sprites/anim/jobs2/magicMelee_B_2.png')],
    wRatio: 0.6769, hRatio: 1.0399, anchor: 0.5117,
  },
  'jobs2/magicRanged_A': {
    frames: [require('../assets/sprites/anim/jobs2/magicRanged_A_0.png'), require('../assets/sprites/anim/jobs2/magicRanged_A_1.png'), require('../assets/sprites/anim/jobs2/magicRanged_A_2.png')],
    wRatio: 0.5926, hRatio: 1.0490, anchor: 0.4822,
  },
  'jobs2/magicRanged_B': {
    frames: [require('../assets/sprites/anim/jobs2/magicRanged_B_0.png'), require('../assets/sprites/anim/jobs2/magicRanged_B_1.png'), require('../assets/sprites/anim/jobs2/magicRanged_B_2.png')],
    wRatio: 0.6376, hRatio: 1.0395, anchor: 0.5431,
  },
  'jobs2/magicSupport_A': {
    frames: [require('../assets/sprites/anim/jobs2/magicSupport_A_0.png'), require('../assets/sprites/anim/jobs2/magicSupport_A_1.png'), require('../assets/sprites/anim/jobs2/magicSupport_A_2.png')],
    wRatio: 0.6322, hRatio: 1.0395, anchor: 0.5510,
  },
  'jobs2/magicSupport_B': {
    frames: [require('../assets/sprites/anim/jobs2/magicSupport_B_0.png'), require('../assets/sprites/anim/jobs2/magicSupport_B_1.png'), require('../assets/sprites/anim/jobs2/magicSupport_B_2.png')],
    wRatio: 0.6649, hRatio: 1.0395, anchor: 0.5204,
  },
  'jobs2/physicalMelee_A': {
    frames: [require('../assets/sprites/anim/jobs2/physicalMelee_A_0.png'), require('../assets/sprites/anim/jobs2/physicalMelee_A_1.png'), require('../assets/sprites/anim/jobs2/physicalMelee_A_2.png')],
    wRatio: 0.6810, hRatio: 1.0402, anchor: 0.5063,
  },
  'jobs2/physicalMelee_B': {
    frames: [require('../assets/sprites/anim/jobs2/physicalMelee_B_0.png'), require('../assets/sprites/anim/jobs2/physicalMelee_B_1.png'), require('../assets/sprites/anim/jobs2/physicalMelee_B_2.png')],
    wRatio: 0.6609, hRatio: 1.0402, anchor: 0.4776,
  },
  'jobs2/physicalRanged_A': {
    frames: [require('../assets/sprites/anim/jobs2/physicalRanged_A_0.png'), require('../assets/sprites/anim/jobs2/physicalRanged_A_1.png'), require('../assets/sprites/anim/jobs2/physicalRanged_A_2.png')],
    wRatio: 0.6608, hRatio: 1.0405, anchor: 0.5121,
  },
  'jobs2/physicalRanged_B': {
    frames: [require('../assets/sprites/anim/jobs2/physicalRanged_B_0.png'), require('../assets/sprites/anim/jobs2/physicalRanged_B_1.png'), require('../assets/sprites/anim/jobs2/physicalRanged_B_2.png')],
    wRatio: 0.6689, hRatio: 1.0405, anchor: 0.5313,
  },
  'jobs2/physicalSupport_A': {
    frames: [require('../assets/sprites/anim/jobs2/physicalSupport_A_0.png'), require('../assets/sprites/anim/jobs2/physicalSupport_A_1.png'), require('../assets/sprites/anim/jobs2/physicalSupport_A_2.png')],
    wRatio: 0.6689, hRatio: 1.0395, anchor: 0.5224,
  },
  'jobs2/physicalSupport_B': {
    frames: [require('../assets/sprites/anim/jobs2/physicalSupport_B_0.png'), require('../assets/sprites/anim/jobs2/physicalSupport_B_1.png'), require('../assets/sprites/anim/jobs2/physicalSupport_B_2.png')],
    wRatio: 0.5790, hRatio: 1.0395, anchor: 0.5212,
  },
  'jobs3/magicMelee_A': {
    frames: [require('../assets/sprites/anim/jobs3/magicMelee_A_0.png'), require('../assets/sprites/anim/jobs3/magicMelee_A_1.png'), require('../assets/sprites/anim/jobs3/magicMelee_A_2.png')],
    wRatio: 0.6596, hRatio: 1.0922, anchor: 0.5377,
  },
  'jobs3/magicMelee_B': {
    frames: [require('../assets/sprites/anim/jobs3/magicMelee_B_0.png'), require('../assets/sprites/anim/jobs3/magicMelee_B_1.png'), require('../assets/sprites/anim/jobs3/magicMelee_B_2.png')],
    wRatio: 0.6781, hRatio: 1.0401, anchor: 0.4914,
  },
  'jobs3/magicRanged_A': {
    frames: [require('../assets/sprites/anim/jobs3/magicRanged_A_0.png'), require('../assets/sprites/anim/jobs3/magicRanged_A_1.png'), require('../assets/sprites/anim/jobs3/magicRanged_A_2.png')],
    wRatio: 0.6746, hRatio: 1.0932, anchor: 0.5010,
  },
  'jobs3/magicRanged_B': {
    frames: [require('../assets/sprites/anim/jobs3/magicRanged_B_0.png'), require('../assets/sprites/anim/jobs3/magicRanged_B_1.png'), require('../assets/sprites/anim/jobs3/magicRanged_B_2.png')],
    wRatio: 0.6095, hRatio: 1.1036, anchor: 0.4745,
  },
  'jobs3/magicSupport_A': {
    frames: [require('../assets/sprites/anim/jobs3/magicSupport_A_0.png'), require('../assets/sprites/anim/jobs3/magicSupport_A_1.png'), require('../assets/sprites/anim/jobs3/magicSupport_A_2.png')],
    wRatio: 0.5888, hRatio: 1.0399, anchor: 0.5003,
  },
  'jobs3/magicSupport_B': {
    frames: [require('../assets/sprites/anim/jobs3/magicSupport_B_0.png'), require('../assets/sprites/anim/jobs3/magicSupport_B_1.png'), require('../assets/sprites/anim/jobs3/magicSupport_B_2.png')],
    wRatio: 0.6894, hRatio: 1.0395, anchor: 0.4605,
  },
  'jobs3/physicalMelee_A': {
    frames: [require('../assets/sprites/anim/jobs3/physicalMelee_A_0.png'), require('../assets/sprites/anim/jobs3/physicalMelee_A_1.png'), require('../assets/sprites/anim/jobs3/physicalMelee_A_2.png')],
    wRatio: 0.6662, hRatio: 1.0395, anchor: 0.4961,
  },
  'jobs3/physicalMelee_B': {
    frames: [require('../assets/sprites/anim/jobs3/physicalMelee_B_0.png'), require('../assets/sprites/anim/jobs3/physicalMelee_B_1.png'), require('../assets/sprites/anim/jobs3/physicalMelee_B_2.png')],
    wRatio: 0.6310, hRatio: 1.0662, anchor: 0.5243,
  },
  'jobs3/physicalRanged_A': {
    frames: [require('../assets/sprites/anim/jobs3/physicalRanged_A_0.png'), require('../assets/sprites/anim/jobs3/physicalRanged_A_1.png'), require('../assets/sprites/anim/jobs3/physicalRanged_A_2.png')],
    wRatio: 0.6229, hRatio: 1.0656, anchor: 0.5074,
  },
  'jobs3/physicalRanged_B': {
    frames: [require('../assets/sprites/anim/jobs3/physicalRanged_B_0.png'), require('../assets/sprites/anim/jobs3/physicalRanged_B_1.png'), require('../assets/sprites/anim/jobs3/physicalRanged_B_2.png')],
    wRatio: 0.6282, hRatio: 1.0662, anchor: 0.4970,
  },
  'jobs3/physicalSupport_A': {
    frames: [require('../assets/sprites/anim/jobs3/physicalSupport_A_0.png'), require('../assets/sprites/anim/jobs3/physicalSupport_A_1.png'), require('../assets/sprites/anim/jobs3/physicalSupport_A_2.png')],
    wRatio: 0.6465, hRatio: 1.0662, anchor: 0.4817,
  },
  'jobs3/physicalSupport_B': {
    frames: [require('../assets/sprites/anim/jobs3/physicalSupport_B_0.png'), require('../assets/sprites/anim/jobs3/physicalSupport_B_1.png'), require('../assets/sprites/anim/jobs3/physicalSupport_B_2.png')],
    wRatio: 0.6465, hRatio: 1.0662, anchor: 0.4875,
  },
  'jobs4/magicMelee_A': {
    frames: [require('../assets/sprites/anim/jobs4/magicMelee_A_0.png'), require('../assets/sprites/anim/jobs4/magicMelee_A_1.png'), require('../assets/sprites/anim/jobs4/magicMelee_A_2.png')],
    wRatio: 0.6239, hRatio: 1.0401, anchor: 0.4929,
  },
  'jobs4/magicMelee_B': {
    frames: [require('../assets/sprites/anim/jobs4/magicMelee_B_0.png'), require('../assets/sprites/anim/jobs4/magicMelee_B_1.png'), require('../assets/sprites/anim/jobs4/magicMelee_B_2.png')],
    wRatio: 0.5987, hRatio: 1.0401, anchor: 0.4879,
  },
  'jobs4/magicRanged_A': {
    frames: [require('../assets/sprites/anim/jobs4/magicRanged_A_0.png'), require('../assets/sprites/anim/jobs4/magicRanged_A_1.png'), require('../assets/sprites/anim/jobs4/magicRanged_A_2.png')],
    wRatio: 0.5700, hRatio: 1.0402, anchor: 0.4003,
  },
  'jobs4/magicRanged_B': {
    frames: [require('../assets/sprites/anim/jobs4/magicRanged_B_0.png'), require('../assets/sprites/anim/jobs4/magicRanged_B_1.png'), require('../assets/sprites/anim/jobs4/magicRanged_B_2.png')],
    wRatio: 0.5378, hRatio: 1.0490, anchor: 0.4445,
  },
  'jobs4/magicSupport_A': {
    frames: [require('../assets/sprites/anim/jobs4/magicSupport_A_0.png'), require('../assets/sprites/anim/jobs4/magicSupport_A_1.png'), require('../assets/sprites/anim/jobs4/magicSupport_A_2.png')],
    wRatio: 0.5634, hRatio: 1.0524, anchor: 0.4824,
  },
  'jobs4/magicSupport_B': {
    frames: [require('../assets/sprites/anim/jobs4/magicSupport_B_0.png'), require('../assets/sprites/anim/jobs4/magicSupport_B_1.png'), require('../assets/sprites/anim/jobs4/magicSupport_B_2.png')],
    wRatio: 0.6046, hRatio: 1.0401, anchor: 0.3988,
  },
  'jobs4/physicalMelee_A': {
    frames: [require('../assets/sprites/anim/jobs4/physicalMelee_A_0.png'), require('../assets/sprites/anim/jobs4/physicalMelee_A_1.png'), require('../assets/sprites/anim/jobs4/physicalMelee_A_2.png')],
    wRatio: 0.6602, hRatio: 1.0398, anchor: 0.4367,
  },
  'jobs4/physicalMelee_B': {
    frames: [require('../assets/sprites/anim/jobs4/physicalMelee_B_0.png'), require('../assets/sprites/anim/jobs4/physicalMelee_B_1.png'), require('../assets/sprites/anim/jobs4/physicalMelee_B_2.png')],
    wRatio: 0.5460, hRatio: 1.0402, anchor: 0.5221,
  },
  'jobs4/physicalRanged_A': {
    frames: [require('../assets/sprites/anim/jobs4/physicalRanged_A_0.png'), require('../assets/sprites/anim/jobs4/physicalRanged_A_1.png'), require('../assets/sprites/anim/jobs4/physicalRanged_A_2.png')],
    wRatio: 0.6053, hRatio: 1.0439, anchor: 0.4428,
  },
  'jobs4/physicalRanged_B': {
    frames: [require('../assets/sprites/anim/jobs4/physicalRanged_B_0.png'), require('../assets/sprites/anim/jobs4/physicalRanged_B_1.png'), require('../assets/sprites/anim/jobs4/physicalRanged_B_2.png')],
    wRatio: 0.7764, hRatio: 1.0401, anchor: 0.4437,
  },
  'jobs4/physicalSupport_A': {
    frames: [require('../assets/sprites/anim/jobs4/physicalSupport_A_0.png'), require('../assets/sprites/anim/jobs4/physicalSupport_A_1.png'), require('../assets/sprites/anim/jobs4/physicalSupport_A_2.png')],
    wRatio: 0.5591, hRatio: 1.0677, anchor: 0.5089,
  },
  'jobs4/physicalSupport_B': {
    frames: [require('../assets/sprites/anim/jobs4/physicalSupport_B_0.png'), require('../assets/sprites/anim/jobs4/physicalSupport_B_1.png'), require('../assets/sprites/anim/jobs4/physicalSupport_B_2.png')],
    wRatio: 0.5894, hRatio: 1.0401, anchor: 0.4290,
  },
};
