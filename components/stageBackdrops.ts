// **產生檔(scripts/shrink-backdrops.py),不要手改。**
//
// 大關底圖。原圖 20MB / 10 張放在 assets/sprites/backgrounds/stages-src,
// 跑道最寬只有 520px,所以另外縮一份 768px 的複本(留 1.5x 餘裕)。
//
// key 就是 game/laneRun.ts 的 BackdropId —— 那邊是純邏輯只吐 id,
// 圖片資源一律留在 components/ 這一層(CLAUDE.md 的分層鐵律)。
import type { ImageSourcePropType } from 'react-native';

import type { BackdropId } from '../game/laneRun';

/**
 * 底圖本身,加上三個由圖算出來的數字:
 *   aspect  長寬比(width / height)—— 畫面照這個比例鋪才不會被拉扁
 *   name    給玩家看的名字(生存模式抽地圖的 toast 會印出來)
 *   base    圖載進來之前的底色(整張的平均色壓暗)
 *   edge    兩條跑道之間的分隔線顏色(平均色提亮)
 *   scrim   罩在圖上的暗紗。**逐張不同**——這批圖本身的亮度差三倍以上,
 *           套同一個透明度的話,亮的那幾個大關前景會讀不出來(見 shrink-backdrops.py
 *           的 SCRIM_TARGET)。畫面只管照著疊,不要在那一層再調一次。
 */
export const STAGE_BACKDROPS: Record<
  BackdropId,
  {
    source: ImageSourcePropType;
    name: string;
    aspect: number;
    base: string;
    edge: string;
    scrim: string;
  }
> = {
  grass: {
    source: require('../assets/sprites/backgrounds/stages/grass.png'),
    name: '草原', aspect: 768 / 768,
    base: '#0e140a', edge: '#555e4e', scrim: '#0c0c102e',
  },
  jungle: {
    source: require('../assets/sprites/backgrounds/stages/jungle.png'),
    name: '叢林', aspect: 768 / 768,
    base: '#15140e', edge: '#5e5c51', scrim: '#0c0c1042',
  },
  sand: {
    source: require('../assets/sprites/backgrounds/stages/sand.png'),
    name: '荒漠', aspect: 768 / 768,
    base: '#2d2112', edge: '#b28a53', scrim: '#0c0c10b8',
  },
  snow: {
    source: require('../assets/sprites/backgrounds/stages/snow.png'),
    name: '雪原', aspect: 768 / 1152,
    base: '#2b2d2f', edge: '#acb2b9', scrim: '#0c0c10b8',
  },
  darkstone: {
    source: require('../assets/sprites/backgrounds/stages/darkstone.png'),
    name: '暗岩', aspect: 768 / 768,
    base: '#121216', edge: '#5b5b62', scrim: '#0c0c102e',
  },
  asphalt: {
    source: require('../assets/sprites/backgrounds/stages/asphalt.png'),
    name: '公路', aspect: 768 / 768,
    base: '#151411', edge: '#5e5b57', scrim: '#0c0c1040',
  },
  town: {
    source: require('../assets/sprites/backgrounds/stages/town.png'),
    name: '石板城鎮', aspect: 768 / 1152,
    base: '#181511', edge: '#615a53', scrim: '#0c0c1063',
  },
  alley: {
    source: require('../assets/sprites/backgrounds/stages/alley.png'),
    name: '舊城巷弄', aspect: 768 / 1152,
    base: '#171613', edge: '#5e5b55', scrim: '#0c0c1068',
  },
  nightmarket: {
    source: require('../assets/sprites/backgrounds/stages/nightmarket.png'),
    name: '夜市', aspect: 768 / 1152,
    base: '#171412', edge: '#605a57', scrim: '#0c0c1044',
  },
  sewer: {
    source: require('../assets/sprites/backgrounds/stages/sewer.png'),
    name: '下水道', aspect: 768 / 1536,
    base: '#151510', edge: '#5c5b52', scrim: '#0c0c1057',
  },
};
