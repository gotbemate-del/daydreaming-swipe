import { Archetype, JobTier } from '../combat';
import { upscaleFrame } from './spriteScale';

// 武器外型吃「職業 + 職業階級(JobTier 1-5)+ 是否雙手」,呼應 game/equipment.ts 的
// WEAPON_NOUNS_BY_TIER——同一個職業在不同階級會掛不同的寫實物品名(例如 physicalMelee 從
// 1 階「工作手套/鐵鎚」一路換到 5 階「戰鬥匕首/突擊步槍」),所以每個「職業 x 階級 x 單雙手」
// 組合(6x5x2=60 款)都各自畫一款可辨識的專屬外型,不再是同職業全階級共用 2 款外型。顏色仍吃
// 該裝備自己的 item.color(隨等級檔漸亮),呼叫端(HeroSprite/equipmentIcons)會把 W 換成該裝
// 備當下的顏色,這裡只負責形狀。
// 形狀在 10x14 基礎網格畫(比舊的 6x10 寬鬆許多,不再侷促,讓每一款都能畫出可辨識的具體造型,
// 雙手款體型/細節明顯比單手款更誇張)。少數不同階級名稱其實對應同一件實體道具(例如
// physicalSupport 3 階雙手「點滴架」跟 magicSupport 2 階雙手「點滴架」),直接共用同一個陣列
// 參照,不重複手繪。
// 注意:SCALE 這裡刻意維持 2,不跟其他 sprite 檔案一樣用 3——game/equipment.ts 的
// SLOT_ANCHORS.mainhand 錨點({x:45,y:19})是拿舊版「6x10 底圖 x3 倍=18x30」的實際輸出尺寸
// 校準的,HeroSprite 疊圖時只用這個錨點的左上角定位、不會把武器拉伸/裁切成 rect.w/h,所以放大
// 倍率如果沒跟著底圖尺寸等比例收斂,武器會整個明顯超出勇者手部位置甚至超出勇者本體畫布。用
// SCALE=2 讓新底圖(10x14)放大後落在 20x28,跟舊的 18x30 錨定尺寸接近,不用去動 HeroSprite.tsx
// /game/equipment.ts 這些不在本次改動範圍內的呼叫端,細節提升但握持位置維持原本校準。
const BASE_WIDTH = 10;
const BASE_HEIGHT = 14;
const SCALE = 2;

function assertFrameShape(frame: string[], label: string): string[] {
  if (frame.length !== BASE_HEIGHT) throw new Error(`${label}: expected ${BASE_HEIGHT} rows, got ${frame.length}`);
  for (const row of frame) {
    if (row.length !== BASE_WIDTH) throw new Error(`${label}: expected row width ${BASE_WIDTH}, got "${row}"`);
  }
  return frame;
}

// ============================== physicalMelee(工地/搬運工風)==============================

// 1 階單手·工作手套:拳套形的厚實護拳 + 側凸拇指 + 寬版護腕。
const PHYSICAL_MELEE_T1_1H = assertFrameShape(
  [
    '..........',
    '..WWWWWW..',
    '.WWWWWWWW.',
    '.WWWWWWWW.',
    'WWWWWWWWW.',
    'WWWWWWWWW.',
    '.WWWWWWWW.',
    '.WWWWWWWW.',
    '..WWWWWW..',
    '..WWWWWW..',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
  ],
  'physicalMelee T1 1H 工作手套'
);

// 1 階雙手·鐵鎚:寬鎚頭滿版展開 + 收尖過渡 + 長柄,比拳套更巨大沉重。
const PHYSICAL_MELEE_T1_2H = assertFrameShape(
  [
    '..WWWWWW..',
    '.WWWWWWWW.',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    '.WWWWWWWW.',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
  ],
  'physicalMelee T1 2H 鐵鎚'
);

// 2 階單手·打包膠帶槍:膠帶環(中空甜甜圈)架在槍形機身上,握把垂在機身下方。
const PHYSICAL_MELEE_T2_1H = assertFrameShape(
  [
    '..........',
    '..WWWW....',
    '.W....W...',
    '.W....W...',
    '..WWWW....',
    '.WWWWWWWW.',
    '.WWWWWWWW.',
    'WWWWWWWWW.',
    '.....WWW..',
    '.....WWW..',
    '.....WWW..',
    '.....WWW..',
    '..........',
    '..........',
  ],
  'physicalMelee T2 1H 打包膠帶槍'
);

// 2 階雙手·貨物撬棍:一端捲勾爪、一端扁楔尖,滿版長桿以細桿為主、兩端加寬。
const PHYSICAL_MELEE_T2_2H = assertFrameShape(
  [
    '..WW......',
    '.WW.......',
    '.WW.......',
    '..WW......',
    '..WW......',
    '..WW......',
    '..WW......',
    '..WW......',
    '..WW......',
    '..WW......',
    '..WW......',
    '.WWWW.....',
    'WWWWWW....',
    'WWWWWW....',
  ],
  'physicalMelee T2 2H 貨物撬棍'
);

// 3 階單手·電鑽:三角鑽頭 + 圓柱夾頭機身 + 扳機握把垂下 + 底部電池匣。
const PHYSICAL_MELEE_T3_1H = assertFrameShape(
  [
    '....WW....',
    '...WWWW...',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '....WWW...',
    '....WWW...',
    '....WWW...',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '..........',
  ],
  'physicalMelee T3 1H 電鑽'
);

// 3 階雙手·電鋸:長導板一側帶鋸齒缺口 + 近端矮胖馬達機身握把。
const PHYSICAL_MELEE_T3_2H = assertFrameShape(
  [
    '.WWWWWWW..',
    '.WWWWWWW..',
    '.WWWWWW.W.',
    '.WWWWWWW..',
    '.WWWWWW.W.',
    '.WWWWWWW..',
    '.WWWWWW.W.',
    '.WWWWWWW..',
    '.WWWWWWWW.',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    '..WWWWWW..',
    '..WWWWWW..',
    '...WWWW...',
  ],
  'physicalMelee T3 2H 電鋸'
);

// 4 階單手·消防斧:一側寬楔刃、一側細尖鎬,斧眼下接長柄。
const PHYSICAL_MELEE_T4_1H = assertFrameShape(
  [
    '.WW.....W.',
    'WWWW....WW',
    'WWWWW..WW.',
    '..WWWWWW..',
    '...WWWW...',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '...WWWW...',
    '...WWWW...',
  ],
  'physicalMelee T4 1H 消防斧'
);

// 4 階雙手·破壞剪:頂端開口 V 型剪口收攏成樞紐,樞紐下兩支長柄平行延伸到底部握把。
const PHYSICAL_MELEE_T4_2H = assertFrameShape(
  [
    'W........W',
    '.W......W.',
    '..W....W..',
    '...W..W...',
    '....WW....',
    '....WW....',
    '...WWWW...',
    '..W....W..',
    '..W....W..',
    '..W....W..',
    '..W....W..',
    '..W....W..',
    '..WW..WW..',
    '..WW..WW..',
  ],
  'physicalMelee T4 2H 破壞剪'
);

// 5 階單手·戰鬥匕首:鋸齒背刃短刀身 + 一字護手 + 纏繩握把,比法術短刀更粗獷角銳。
const PHYSICAL_MELEE_T5_1H = assertFrameShape(
  [
    '....WW....',
    '...WWW....',
    '...WWW.W..',
    '...WWW....',
    '...WWW.W..',
    '...WWW....',
    'WWWWWWWWWW',
    '....WW....',
    '...WWWW...',
    '....WW....',
    '...WWWW...',
    '....WW....',
    '...WWWW...',
    '....WW....',
  ],
  'physicalMelee T5 1H 戰鬥匕首'
);

// 5 階雙手·突擊步槍:上段槍管機匣、中段彈匣下垂彎折、底部槍托。
const PHYSICAL_MELEE_T5_2H = assertFrameShape(
  [
    '.WWWWWWWW.',
    '.WWWWWWWW.',
    '.WWWWWWWW.',
    '.WWWWWWWW.',
    '.WW..WWWW.',
    '.WW..WWWW.',
    '.WW.WW....',
    '.WW.WW....',
    '.WW..WW...',
    '.WW...W...',
    '.WW.......',
    '.WWWW.....',
    '.WWWWWW...',
    '.WWWWWW...',
  ],
  'physicalMelee T5 2H 突擊步槍'
);

// ============================== physicalRanged(夜市/機車風)==============================

// 1 階單手·美工刀:矩形滑蓋刀身,近頂端斜角伸出梯形折斷式刀片。
const PHYSICAL_RANGED_T1_1H = assertFrameShape(
  [
    '.....WW...',
    '....WW....',
    '...WWWW...',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..........',
    '..........',
    '..........',
    '..........',
  ],
  'physicalRanged T1 1H 美工刀'
);

// 1 階雙手·U 型大鎖:開口 U 型鎖鉤扣進矩形鎖身barrel。
const PHYSICAL_RANGED_T1_2H = assertFrameShape(
  [
    '..WWWWWW..',
    '.WW....WW.',
    '.WW....WW.',
    '.WW....WW.',
    '.WW....WW.',
    '.WW....WW.',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    '.WWWWWWWW.',
    '..........',
    '..........',
  ],
  'physicalRanged T1 2H U 型大鎖'
);

// 2 階單手·方向盤鎖:直桿,兩端各朝相反方向捲成勾。
const PHYSICAL_RANGED_T2_1H = assertFrameShape(
  [
    '.WWWW.....',
    'WW..WW....',
    'WW........',
    '.WWW......',
    '..WW......',
    '..WW......',
    '..WW......',
    '..WW......',
    '..WW......',
    '..WW......',
    '......WWW.',
    '....WW..WW',
    '.....WWWW.',
    '..........',
  ],
  'physicalRanged T2 1H 方向盤鎖'
);

// 2 階雙手·千斤頂:上小平台與下寬底座之間夾一段菱形剪式格柵。
const PHYSICAL_RANGED_T2_2H = assertFrameShape(
  [
    '..WWWWWW..',
    '...WWWW...',
    '..W....W..',
    '.W......W.',
    '..W....W..',
    '...WWWW...',
    '..W....W..',
    '.W......W.',
    '..W....W..',
    '...WWWW...',
    '..W....W..',
    '.W......W.',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
  ],
  'physicalRanged T2 2H 千斤頂'
);

// 3 階單手·警棍:直桿下段三分之一處伸出垂直側柄,呈 T 字側握形。
const PHYSICAL_RANGED_T3_1H = assertFrameShape(
  [
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '..WWWWWW..',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
  ],
  'physicalRanged T3 1H 警棍'
);

// 3 階雙手·霰彈槍:長槍管 + 中段前推式泵動護木 + 底部槍托。
const PHYSICAL_RANGED_T3_2H = assertFrameShape(
  [
    '.WWWWWWWW.',
    '.WWWWWWWW.',
    '.WWWWWWWW.',
    '.WWWWWWWW.',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    '.WW.......',
    '.WW.......',
    '.WWW......',
    '.WWWW.....',
    '.WWWWW....',
    '.WWWWWW...',
    '.WWWWWW...',
    '.WWWWWW...',
  ],
  'physicalRanged T3 2H 霰彈槍'
);

// 4 階單手·獵刀:比戰鬥匕首更厚的刀身、削尖刀尖(clip point)、寬護指、粗握把。
const PHYSICAL_RANGED_T4_1H = assertFrameShape(
  [
    '...WW.....',
    '..WWWW....',
    '..WWWWW...',
    '..WWWWW...',
    '..WWWWW...',
    '..WWWWW...',
    'WWWWWWWW..',
    '...WWWW...',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '...WWWW...',
    '..........',
  ],
  'physicalRanged T4 1H 獵刀'
);

// 4 階雙手·獵槍:細槍管 + 中段側掛瞄準鏡管 + 槍機拉柄凸起 + 漸寬槍托。
const PHYSICAL_RANGED_T4_2H = assertFrameShape(
  [
    '..WW......',
    '..WW...WW.',
    '..WW...WW.',
    '..WW...WW.',
    '..WW......',
    '..WW......',
    '.WWWW.....',
    '..WW......',
    '..WW......',
    '..WWW.....',
    '..WWWW....',
    '..WWWWW...',
    '..WWWWWW..',
    '..WWWWWW..',
  ],
  'physicalRanged T4 2H 獵槍'
);

// 5 階單手·消音手槍:細長消音管接在緊湊槍機身上,握把垂於機身下方。
const PHYSICAL_RANGED_T5_1H = assertFrameShape(
  [
    '...WW.....',
    '...WW.....',
    '...WW.....',
    '...WW.....',
    '...WW.....',
    '..WWWW....',
    '.WWWWWW...',
    '.WWWWWW...',
    '.WWWWWW...',
    '....WWW...',
    '....WWW...',
    '....WWW...',
    '....WWW...',
    '..........',
  ],
  'physicalRanged T5 1H 消音手槍'
);

// 5 階雙手·狙擊步槍:槍口兩腳架外張 + 更大瞄準鏡管 + 最誇張加長槍托,雙手款最修長誇張。
const PHYSICAL_RANGED_T5_2H = assertFrameShape(
  [
    '..WW......',
    'W.WW......',
    '.WWW....W.',
    '..WW...WW.',
    '..WW...WW.',
    '..WW...WW.',
    '..WW...WW.',
    '..WW......',
    '..WW......',
    '..WWW.....',
    '..WWWW....',
    '..WWWWW...',
    '..WWWWWW..',
    '..WWWWWWW.',
  ],
  'physicalRanged T5 2H 狙擊步槍'
);

// ============================== physicalSupport(超商/看護風)==============================

// 1 階單手·御飯糰加熱夾:窄身,頂端樞紐銜接兩支彎弧夾臂向下張開。
const PHYSICAL_SUPPORT_T1_1H = assertFrameShape(
  [
    '...WWWW...',
    '...WWWW...',
    '..WW..WW..',
    '..WW..WW..',
    '.WW....WW.',
    '.WW....WW.',
    '.WW....WW.',
    'WW......WW',
    'WW......WW',
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
  ],
  'physicalSupport T1 1H 御飯糰加熱夾'
);

// 1 階雙手·補貨推車:頂端網格籃 + 中央推桿 + 底部兩顆小輪。
const PHYSICAL_SUPPORT_T1_2H = assertFrameShape(
  [
    '.WWWWWWWW.',
    '.W.W.W.W..',
    '.WWWWWWWW.',
    '.W.W.W.W..',
    '.WWWWWWWW.',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '.W......W.',
    '.W......W.',
  ],
  'physicalSupport T1 2H 補貨推車'
);

// 2 階單手·開瓶器:一端挖出勾爪缺口,接扁長條狀本體。
const PHYSICAL_SUPPORT_T2_1H = assertFrameShape(
  [
    '..WW......',
    '.WWW......',
    'WWWW......',
    '.WWW......',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..........',
    '..........',
  ],
  'physicalSupport T2 1H 開瓶器'
);

// 2 階雙手·大托盤:寬邊框橢圓托盤(中空)+ 細柄貫穿到底。
const PHYSICAL_SUPPORT_T2_2H = assertFrameShape(
  [
    '.WWWWWWWW.',
    'W........W',
    'W........W',
    '.WWWWWWWW.',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
  ],
  'physicalSupport T2 2H 大托盤'
);

// 3 階單手·針筒:頂端細針 + 推桿伸出 + 指托兩翼 + 圓柱針筒。
const PHYSICAL_SUPPORT_T3_1H = assertFrameShape(
  [
    '....W.....',
    '....W.....',
    '....W.....',
    '....WW....',
    '....WW....',
    '..WWWWWW..',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '..........',
  ],
  'physicalSupport T3 1H 針筒'
);

// 3 階雙手·點滴架:頂端掛勾+點滴袋、細長桿、底部外張十字腳座(和 magicSupport 2 階雙手共用同一實體道具)。
const PHYSICAL_SUPPORT_T3_2H = assertFrameShape(
  [
    '...WW.....',
    '..W.......',
    '...WW.....',
    '..WWWW....',
    '..WWWW....',
    '...WW.....',
    '...WW.....',
    '...WW.....',
    '...WW.....',
    '...WW.....',
    '...WW.....',
    '...WW.....',
    '..WWWWW...',
    '.WWWWWWW..',
  ],
  'physicalSupport T3 2H 點滴架'
);

// 4 階單手·啞鈴:上下兩顆緊湊重量塊 + 短桿,對稱不佔滿整個畫布。
const PHYSICAL_SUPPORT_T4_1H = assertFrameShape(
  [
    '..........',
    '..........',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..........',
    '..........',
  ],
  'physicalSupport T4 1H 啞鈴'
);

// 4 階雙手·槓鈴:同樣概念拉滿整個畫布高度,兩端重量塊更厚更誇張。
const PHYSICAL_SUPPORT_T4_2H = assertFrameShape(
  [
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    '.WWWWWWWW.',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '...WWWW...',
    '.WWWWWWWW.',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
  ],
  'physicalSupport T4 2H 槓鈴'
);

// 5 階單手·急救剪:兩片刀尖頂端收攏 + 樞紐螺絲 + 底部指環雙孔。
const PHYSICAL_SUPPORT_T5_1H = assertFrameShape(
  [
    '..W....W..',
    '..W....W..',
    '...W..W...',
    '....WW....',
    '....WW....',
    '...WWWW...',
    '..W....W..',
    '..W....W..',
    '..W....W..',
    '..W....W..',
    '.WW....WW.',
    'W.WW..WW.W',
    'W.WW..WW.W',
    '.WW....WW.',
  ],
  'physicalSupport T5 1H 急救剪'
);

// 5 階雙手·急救推車:方正車身 + 頂端十字標記 + 多層抽屜橫線 + 底部兩顆小輪。
const PHYSICAL_SUPPORT_T5_2H = assertFrameShape(
  [
    '.WWWWWWWW.',
    '.W..WW..W.',
    '.WWWWWWWW.',
    '.W......W.',
    '.WWWWWWWW.',
    '.W......W.',
    '.WWWWWWWW.',
    '.W......W.',
    '.WWWWWWWW.',
    '.W......W.',
    '.WWWWWWWW.',
    '..........',
    '.W......W.',
    '.W......W.',
  ],
  'physicalSupport T5 2H 急救推車'
);

// ============================== magicMelee(廟宇/民俗風)==============================

// 1 階單手·木劍:直劍身 + 護手 + 握把,讀起來就是把簡樸單劍。
const MAGIC_MELEE_T1_1H = assertFrameShape(
  [
    '....WW....',
    '....WW....',
    '...WWWW...',
    '....WW....',
    '....WW....',
    '....WW....',
    'WWWWWWWWWW',
    '..WWWWWW..',
    '....WW....',
    '...WWWW...',
    '....WW....',
    '...WWWW...',
    '....WW....',
    '...WWWW...',
  ],
  'magicMelee T1 1H 木劍'
);

// 1 階雙手·掃把:細長柄貫穿大半畫布,底部散開多支斜線掃帚穗。
const MAGIC_MELEE_T1_2H = assertFrameShape(
  [
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '...WWWW...',
    '..W.WW.W..',
    '.W..WW..W.',
    'W...WW...W',
    'W..W..W..W',
  ],
  'magicMelee T1 2H 掃把'
);

// 2 階單手·七星劍:劍身中線帶星點凹刻 + 華麗護手 + 垂穗劍柄。
const MAGIC_MELEE_T2_1H = assertFrameShape(
  [
    '....WW....',
    '....WW....',
    '....W.....',
    '....WW....',
    '....WW....',
    '....W.....',
    '....WW....',
    'WWWWWWWWWW',
    '..WWWWWW..',
    '....WW....',
    '....WW....',
    '...WWWW...',
    '..W.W.W...',
    '.W.W.W....',
  ],
  'magicMelee T2 1H 七星劍'
);

// 2 階雙手·關刀:頂端大弧月刀刃帶小背刺,長桿貫穿剩餘畫布。
const MAGIC_MELEE_T2_2H = assertFrameShape(
  [
    '.....WWW..',
    '....WW.WW.',
    '...WW...WW',
    '..WW....W.',
    '...WW.....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
  ],
  'magicMelee T2 2H 關刀'
);

// 3 階單手·桃木劍:纖細劍身 + 簡易護手 + 短握把,劍柄尾端飄出細穗流蘇。
const MAGIC_MELEE_T3_1H = assertFrameShape(
  [
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '...WWWW...',
    '....WW....',
    '....WW....',
    '....WW....',
    '...WWWW...',
    '..W..W....',
    '.W....W...',
    'W......W..',
  ],
  'magicMelee T3 1H 桃木劍'
);

// 3 階雙手·拂塵杖:頂端波浪拂塵穗散開成一叢,長桿貫穿畫布大半高度。
const MAGIC_MELEE_T3_2H = assertFrameShape(
  [
    'W.W.WW.W.W',
    '.W.WWWW.W.',
    '..WWWWWW..',
    '...WWWW...',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
  ],
  'magicMelee T3 2H 拂塵杖'
);

// 4 階單手·銅錢劍:劍身以一串銅錢圓環堆疊構成(圓孔交替鏤空),搭配簡易劍柄。
const MAGIC_MELEE_T4_1H = assertFrameShape(
  [
    '....WW....',
    '...WWWW...',
    '...W..W...',
    '...WWWW...',
    '...W..W...',
    '...WWWW...',
    '...W..W...',
    '...WWWW...',
    'WWWWWWWWWW',
    '....WW....',
    '....WW....',
    '....WW....',
    '...WWWW...',
    '..........',
  ],
  'magicMelee T4 1H 銅錢劍'
);

// 4 階雙手·招財貓棒:兩支尖耳 + 圓貓頭 + 頸部小舉爪凸起,長桿貫穿剩餘畫布。
const MAGIC_MELEE_T4_2H = assertFrameShape(
  [
    '..W....W..',
    '.WWW..WWW.',
    '.WWWWWWWW.',
    'WWWWWWWWWW',
    '.WWWWWWWW.',
    '...WWWW...',
    '..WWWWW...',
    '...WWWW...',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
  ],
  'magicMelee T4 2H 招財貓棒'
);

// 5 階單手·仙劍:magicMelee 系列最長的劍身 + 翼形展開護手(帶羽狀縫隙)+ 華麗垂穗劍柄。
const MAGIC_MELEE_T5_1H = assertFrameShape(
  [
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    'WW.WWWW.WW',
    '....WW....',
    '....WW....',
    '....WW....',
    '...WWWW...',
    '..W.WW.W..',
    '.W.W..W.W.',
  ],
  'magicMelee T5 1H 仙劍'
);

// 5 階雙手·如意金箍棒:粗桿貫穿整個畫布高度,頂端與底端各加粗兩節金箍,中段桿身樸素。
const MAGIC_MELEE_T5_2H = assertFrameShape(
  [
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    '.WWWWWWWW.',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '.WWWWWWWW.',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
  ],
  'magicMelee T5 2H 如意金箍棒'
);

// ============================== magicRanged(電競/科技風)==============================

// 1 階單手·電競鍵盤:扁平掃描面板,四角挖出接口孔洞 + 短握柄。
const MAGIC_RANGED_T1_1H = assertFrameShape(
  [
    '..........',
    '..WWWWWW..',
    '..WWWWWW..',
    '..W.WW.W..',
    '..WWWWWW..',
    '..W.WW.W..',
    '..WWWWWW..',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
  ],
  'magicRanged T1 1H 電競鍵盤'
);

// 1 階雙手·電競滑鼠墊:大面積圓角矩形墊面 + 底部中央小握把凸起。
const MAGIC_RANGED_T1_2H = assertFrameShape(
  [
    '..........',
    '..........',
    '..........',
    '.WWWWWWWW.',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    '.WWWWWWWW.',
    '....WW....',
    '....WW....',
    '..........',
  ],
  'magicRanged T1 2H 電競滑鼠墊'
);

// 2 階單手·機械鍵盤:上下加厚外框 + 內部棋盤格凸鍵紋理,比 1 階面板更厚實有質感。
const MAGIC_RANGED_T2_1H = assertFrameShape(
  [
    '..........',
    'WWWWWWWWWW',
    'W.W.W.W.W.',
    '.W.W.W.W.W',
    'W.W.W.W.W.',
    '.W.W.W.W.W',
    'W.W.W.W.W.',
    'WWWWWWWWWW',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '..........',
  ],
  'magicRanged T2 1H 機械鍵盤'
);

// 2 階雙手·雙螢幕支架:兩片對稱小螢幕方塊接橫向支臂,直桿下接底座。
const MAGIC_RANGED_T2_2H = assertFrameShape(
  [
    'WW......WW',
    'WW......WW',
    'WW......WW',
    'WWWWWWWWWW',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '...WWWW...',
    '...WWWW...',
  ],
  'magicRanged T2 2H 雙螢幕支架'
);

// 3 階單手·雷射筆:頂端小菱形發光尖 + 細長筆狀本體。
const MAGIC_RANGED_T3_1H = assertFrameShape(
  [
    '....W.....',
    '...WWW....',
    '....W.....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '..........',
  ],
  'magicRanged T3 1H 雷射筆'
);

// 3 階雙手·顯微鏡:頂端目鏡管 + 斜向機身 + 中段水平載物台橫桿 + 底部圓形底座。
const MAGIC_RANGED_T3_2H = assertFrameShape(
  [
    '....WW....',
    '....WW....',
    '...WW.....',
    '..WW......',
    '.WW.......',
    '.WW.......',
    'WWWWWWWW..',
    '.WW.......',
    '.WW.......',
    '.WWW......',
    '.WWWW.....',
    '.WWWWW....',
    'WWWWWWW...',
    'WWWWWWW...',
  ],
  'magicRanged T3 2H 顯微鏡'
);

// 4 階單手·資安隨身碟:頂端伸出接口小凸榫 + 矩形機身 + 中段鑰匙圈孔洞。
const MAGIC_RANGED_T4_1H = assertFrameShape(
  [
    '....WW....',
    '....WW....',
    '...WWWW...',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WW..WW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '...WWWW...',
    '..........',
    '..........',
    '..........',
  ],
  'magicRanged T4 1H 資安隨身碟'
);

// 4 階雙手·伺服器主機:高聳機殼,結構橫帶與散熱孔點陣交替排列,底部小支腳。
const MAGIC_RANGED_T4_2H = assertFrameShape(
  [
    '.WWWWWWWW.',
    '.W.W.W.W..',
    '.WWWWWWWW.',
    '.W.W.W.W..',
    '.WWWWWWWW.',
    '.W.W.W.W..',
    '.WWWWWWWW.',
    '.W.W.W.W..',
    '.WWWWWWWW.',
    '.W.W.W.W..',
    '.WWWWWWWW.',
    '.WWWWWWWW.',
    '.W......W.',
    '.W......W.',
  ],
  'magicRanged T4 2H 伺服器主機'
);

// 5 階單手·神經連結手環:開口環狀手環(C 型缺口),小巧不佔滿整個畫布。
const MAGIC_RANGED_T5_1H = assertFrameShape(
  [
    '..WWWW....',
    '.WW..WW...',
    'WW....WW..',
    'WW....W...',
    'WW........',
    'WW....W...',
    'WW....WW..',
    '.WW..WW...',
    '..WWWW....',
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
  ],
  'magicRanged T5 1H 神經連結手環'
);

// 5 階雙手·AI 核心終端機:頂端菱形發光核心 + 逐漸外擴的方尖碑機身(帶電路鏤空線)+ 最寬底座。
const MAGIC_RANGED_T5_2H = assertFrameShape(
  [
    '....WW....',
    '...WWWW...',
    '....WW....',
    '...WWWW...',
    '...WWWW...',
    '...W..W...',
    '...WWWW...',
    '..WWWWWW..',
    '..W....W..',
    '..WWWWWW..',
    '..WWWWWW..',
    '.WWWWWWWW.',
    '.WWWWWWWW.',
    'WWWWWWWWWW',
  ],
  'magicRanged T5 2H AI 核心終端機'
);

// ============================== magicSupport(中醫/藥膳風)==============================

// 1 階單手·藥瓶:軟木塞 + 窄頸 + 圓身,中段挖出一道刻度線代表藥液刻度。
const MAGIC_SUPPORT_T1_1H = assertFrameShape(
  [
    '..........',
    '....WW....',
    '....WW....',
    '...WWWW...',
    '..WWWWWW..',
    '..WWWWWW..',
    '..W....W..',
    '..WWWWWW..',
    '..WWWWWW..',
    '...WWWW...',
    '..........',
    '..........',
    '..........',
    '..........',
  ],
  'magicSupport T1 1H 藥瓶'
);

// 1 階雙手·藥箱權杖:頂端十字藥箱(鏤空十字標記)+ 長桿 + 加寬底座。
const MAGIC_SUPPORT_T1_2H = assertFrameShape(
  [
    '...WWWW...',
    '...W..W...',
    '...WWWW...',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '...WWWW...',
  ],
  'magicSupport T1 2H 藥箱權杖'
);

// 2 階單手·反射錘:頂端三角橡膠楔形錘頭 + 細桿手把 + 近頂端指環孔。
const MAGIC_SUPPORT_T2_1H = assertFrameShape(
  [
    '...WWWW...',
    '..WWWWWW..',
    '.WWWWWWWW.',
    '..WWWWWW..',
    '...WWWW...',
    '....WW....',
    '...W..W...',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
  ],
  'magicSupport T2 1H 反射錘'
);

// 2 階雙手·點滴架:跟 physicalSupport 3 階雙手是同一件實體道具,直接共用同一個外型陣列。
const MAGIC_SUPPORT_T2_2H = PHYSICAL_SUPPORT_T3_2H;

// 3 階單手·減壓筆:頂端按鍵鈕帽 + 側邊口袋夾線 + 細長筆身收尖成筆尖。
const MAGIC_SUPPORT_T3_1H = assertFrameShape(
  [
    '....WW....',
    '....WW....',
    '...WWWW...',
    '..WWWWW...',
    'W.WWWWW...',
    'W.WWWWW...',
    '..WWWWW...',
    '..WWWWW...',
    '..WWWWW...',
    '..WWWWW...',
    '..WWWWW...',
    '..WWWWW...',
    '...WWW....',
    '....W.....',
  ],
  'magicSupport T3 1H 減壓筆'
);

// 3 階雙手·沙發抱枕:大顆蓬鬆圓角方枕,中央帶縫線鈕扣紋理,底部收出被握住的小折角。
const MAGIC_SUPPORT_T3_2H = assertFrameShape(
  [
    '..........',
    '.WWWWWWWW.',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    'WW..WW..WW',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    'WW..WW..WW',
    'WWWWWWWWWW',
    'WWWWWWWWWW',
    '.WWWWWWWW.',
    '..WWWWWW..',
    '..WWWWWW..',
    '...WWWW...',
  ],
  'magicSupport T3 2H 沙發抱枕'
);

// 4 階單手·銀針:多支細針線從上方微微散開扇形,收攏到底部小巧針盒手柄。
const MAGIC_SUPPORT_T4_1H = assertFrameShape(
  [
    'W..W..W..W',
    'W..W..W..W',
    '.W.W..W.W.',
    '.W.W..W.W.',
    '..WW..WW..',
    '..WW..WW..',
    '...WWWW...',
    '...WWWW...',
    '..WWWWWW..',
    '..WWWWWW..',
    '..WWWWWW..',
    '..........',
    '..........',
    '..........',
  ],
  'magicSupport T4 1H 銀針'
);

// 4 階雙手·藥杵:頂端渾圓杵頭明顯比握柄粗,向下收窄成細長桿身,底部微微外張。
const MAGIC_SUPPORT_T4_2H = assertFrameShape(
  [
    '..WWWW....',
    '.WWWWWW...',
    'WWWWWWWW..',
    'WWWWWWWW..',
    '.WWWWWW...',
    '..WWWW....',
    '...WW.....',
    '...WW.....',
    '...WW.....',
    '...WW.....',
    '...WW.....',
    '...WW.....',
    '...WW.....',
    '..WWW.....',
  ],
  'magicSupport T4 2H 藥杵'
);

// 5 階單手·華佗神針:單支細長斜向針線 + 華麗纏繞紋理握柄,是 4 階針束的精緻單支版。
const MAGIC_SUPPORT_T5_1H = assertFrameShape(
  [
    '........W.',
    '.......W..',
    '......W...',
    '.....W....',
    '....W.....',
    '...W......',
    '..WWW.....',
    '.WWWWW....',
    '.W.W.W....',
    '.WWWWW....',
    '.W.W.W....',
    '.WWWWW....',
    '..WWW.....',
    '...W......',
  ],
  'magicSupport T5 1H 華佗神針'
);

// 5 階雙手·再世金刀:頂端不對稱弧月手術刀刃 + 下接纏繞紋理華麗握柄,跟 magicMelee 的直劍系列明顯不同。
const MAGIC_SUPPORT_T5_2H = assertFrameShape(
  [
    '.....WWW..',
    '....WW.W..',
    '...WW..W..',
    '..WW...W..',
    '..WW..W...',
    '...WW.....',
    '....WW....',
    '...WWWW...',
    '....WW....',
    '...WWWW...',
    '....WW....',
    '...WWWW...',
    '....WW....',
    '...WWWW...',
  ],
  'magicSupport T5 2H 再世金刀'
);

// ============================== 通用起始款 ==============================

// 起始款(不限職業的舊 18 款)沒有 archetype,給一款通用短劍外型,不依 tier 變化。
const GENERIC_1H = assertFrameShape(
  [
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '..WWWWWW..',
    '....WW....',
    '....WW....',
    '....WW....',
    '...WWWW...',
    '..........',
    '..........',
    '..........',
    '..........',
  ],
  'generic 1H'
);

// 通用大劍外型,比通用短劍更長更厚重。
const GENERIC_2H = assertFrameShape(
  [
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '..WWWWWW..',
    '....WW....',
    '....WW....',
    '....WW....',
    '....WW....',
    '...WWWW...',
    '..........',
    '..........',
  ],
  'generic 2H'
);

type WeaponHandedFrames = { oneHanded: string[]; twoHanded: string[] };
type WeaponFramesByTier = Record<JobTier, WeaponHandedFrames>;

const WEAPON_FRAMES: Record<Archetype, WeaponFramesByTier> = {
  physicalMelee: {
    1: { oneHanded: PHYSICAL_MELEE_T1_1H, twoHanded: PHYSICAL_MELEE_T1_2H },
    2: { oneHanded: PHYSICAL_MELEE_T2_1H, twoHanded: PHYSICAL_MELEE_T2_2H },
    3: { oneHanded: PHYSICAL_MELEE_T3_1H, twoHanded: PHYSICAL_MELEE_T3_2H },
    4: { oneHanded: PHYSICAL_MELEE_T4_1H, twoHanded: PHYSICAL_MELEE_T4_2H },
    5: { oneHanded: PHYSICAL_MELEE_T5_1H, twoHanded: PHYSICAL_MELEE_T5_2H },
  },
  physicalRanged: {
    1: { oneHanded: PHYSICAL_RANGED_T1_1H, twoHanded: PHYSICAL_RANGED_T1_2H },
    2: { oneHanded: PHYSICAL_RANGED_T2_1H, twoHanded: PHYSICAL_RANGED_T2_2H },
    3: { oneHanded: PHYSICAL_RANGED_T3_1H, twoHanded: PHYSICAL_RANGED_T3_2H },
    4: { oneHanded: PHYSICAL_RANGED_T4_1H, twoHanded: PHYSICAL_RANGED_T4_2H },
    5: { oneHanded: PHYSICAL_RANGED_T5_1H, twoHanded: PHYSICAL_RANGED_T5_2H },
  },
  physicalSupport: {
    1: { oneHanded: PHYSICAL_SUPPORT_T1_1H, twoHanded: PHYSICAL_SUPPORT_T1_2H },
    2: { oneHanded: PHYSICAL_SUPPORT_T2_1H, twoHanded: PHYSICAL_SUPPORT_T2_2H },
    3: { oneHanded: PHYSICAL_SUPPORT_T3_1H, twoHanded: PHYSICAL_SUPPORT_T3_2H },
    4: { oneHanded: PHYSICAL_SUPPORT_T4_1H, twoHanded: PHYSICAL_SUPPORT_T4_2H },
    5: { oneHanded: PHYSICAL_SUPPORT_T5_1H, twoHanded: PHYSICAL_SUPPORT_T5_2H },
  },
  magicMelee: {
    1: { oneHanded: MAGIC_MELEE_T1_1H, twoHanded: MAGIC_MELEE_T1_2H },
    2: { oneHanded: MAGIC_MELEE_T2_1H, twoHanded: MAGIC_MELEE_T2_2H },
    3: { oneHanded: MAGIC_MELEE_T3_1H, twoHanded: MAGIC_MELEE_T3_2H },
    4: { oneHanded: MAGIC_MELEE_T4_1H, twoHanded: MAGIC_MELEE_T4_2H },
    5: { oneHanded: MAGIC_MELEE_T5_1H, twoHanded: MAGIC_MELEE_T5_2H },
  },
  magicRanged: {
    1: { oneHanded: MAGIC_RANGED_T1_1H, twoHanded: MAGIC_RANGED_T1_2H },
    2: { oneHanded: MAGIC_RANGED_T2_1H, twoHanded: MAGIC_RANGED_T2_2H },
    3: { oneHanded: MAGIC_RANGED_T3_1H, twoHanded: MAGIC_RANGED_T3_2H },
    4: { oneHanded: MAGIC_RANGED_T4_1H, twoHanded: MAGIC_RANGED_T4_2H },
    5: { oneHanded: MAGIC_RANGED_T5_1H, twoHanded: MAGIC_RANGED_T5_2H },
  },
  magicSupport: {
    1: { oneHanded: MAGIC_SUPPORT_T1_1H, twoHanded: MAGIC_SUPPORT_T1_2H },
    2: { oneHanded: MAGIC_SUPPORT_T2_1H, twoHanded: MAGIC_SUPPORT_T2_2H },
    3: { oneHanded: MAGIC_SUPPORT_T3_1H, twoHanded: MAGIC_SUPPORT_T3_2H },
    4: { oneHanded: MAGIC_SUPPORT_T4_1H, twoHanded: MAGIC_SUPPORT_T4_2H },
    5: { oneHanded: MAGIC_SUPPORT_T5_1H, twoHanded: MAGIC_SUPPORT_T5_2H },
  },
};

const WEAPON_FILL_KEY = 'W';

export interface WeaponFrameData {
  frame: string[];
  fillKey: string;
}

// archetype 是 undefined 時代表舊有不限職業的起始武器,給通用外型(不吃 tier)。
// archetype 有值時依「職業 + 階級(JobTier)+ 是否雙手」查出專屬外型,對應
// game/equipment.ts 的 WEAPON_NOUNS_BY_TIER 命名表,不同階級的同職業武器不再共用同一個外型。
export function getWeaponFrame(
  archetype: Archetype | undefined,
  twoHanded: boolean | undefined,
  tier: JobTier = 1
): WeaponFrameData {
  if (archetype === undefined) {
    return { frame: upscaleFrame(twoHanded ? GENERIC_2H : GENERIC_1H, SCALE), fillKey: WEAPON_FILL_KEY };
  }
  const set = WEAPON_FRAMES[archetype][tier];
  return { frame: upscaleFrame(twoHanded ? set.twoHanded : set.oneHanded, SCALE), fillKey: WEAPON_FILL_KEY };
}
