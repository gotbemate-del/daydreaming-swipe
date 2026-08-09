import type { ImageSourcePropType } from 'react-native';

/**
 * 彩蛋圖。**產生檔**(scripts/shrink-events.py),不要手改。
 *
 * 主畫面點史萊姆會隨機翻出一張(見 MainMenu)。只收通用的 34 張:
 * 另外 570 張是職業專屬的,而這款的主角永遠是史萊姆——轉職不換造型,
 * 所以那些圖在畫面上沒有對應的東西可以配。
 */
export const EVENT_ART: ImageSourcePropType[] = [
  require('../assets/sprites/events-small/common-01.png'),
  require('../assets/sprites/events-small/common-02.png'),
  require('../assets/sprites/events-small/common-03.png'),
  require('../assets/sprites/events-small/common-04.png'),
  require('../assets/sprites/events-small/common-05.png'),
  require('../assets/sprites/events-small/common-06.png'),
  require('../assets/sprites/events-small/common-07.png'),
  require('../assets/sprites/events-small/common-08.png'),
  require('../assets/sprites/events-small/common-09.png'),
  require('../assets/sprites/events-small/common-10.png'),
  require('../assets/sprites/events-small/common-11.png'),
  require('../assets/sprites/events-small/common-12.png'),
  require('../assets/sprites/events-small/common-13.png'),
  require('../assets/sprites/events-small/common-14.png'),
  require('../assets/sprites/events-small/common-15.png'),
  require('../assets/sprites/events-small/common-16.png'),
  require('../assets/sprites/events-small/common-17.png'),
  require('../assets/sprites/events-small/common-18.png'),
  require('../assets/sprites/events-small/common-19.png'),
  require('../assets/sprites/events-small/common-20.png'),
  require('../assets/sprites/events-small/epic-01.png'),
  require('../assets/sprites/events-small/epic-02.png'),
  require('../assets/sprites/events-small/epic-03.png'),
  require('../assets/sprites/events-small/epic-04.png'),
  require('../assets/sprites/events-small/legendary-01.png'),
  require('../assets/sprites/events-small/legendary-02.png'),
  require('../assets/sprites/events-small/rare-01.png'),
  require('../assets/sprites/events-small/rare-02.png'),
  require('../assets/sprites/events-small/rare-03.png'),
  require('../assets/sprites/events-small/rare-04.png'),
  require('../assets/sprites/events-small/rare-05.png'),
  require('../assets/sprites/events-small/rare-06.png'),
  require('../assets/sprites/events-small/rare-07.png'),
  require('../assets/sprites/events-small/rare-08.png'),
];
