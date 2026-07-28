// 世界地圖用的城鎮圖示,純程式產生像素格(跟 tabIcons.ts / uiIcons.ts 同一套原則)。
// 一律 16x16、共用同一組色盤,由 components/PixelSprite.tsx 渲染。絕對不用 emoji——理由見
// game/sprites/uiIcons.ts 檔頭與 CLAUDE.md 的「圖示鐵則」。
//
// 造型全部挑「一眼認得出的建築剪影」而不是寫實描繪:16x16 只有 256 格,校門就畫柵欄+拱門、
// 廟就畫翹起的屋簷+柱子,細節放進去只會糊成一團。
export type TownIconId =
  | 'school'
  | 'station'
  | 'apartment'
  | 'nightMarket'
  | 'riverPark'
  | 'office'
  | 'factory'
  | 'temple';

export const TOWN_ICON_PALETTE: Record<string, string> = {
  X: '#e0a95c',
  D: '#9691a5',
  L: '#f2f2f2',
  K: '#2a2a35',
  G: '#5ec26a',
};

// 校門口:拱門+柵欄。柵欄用灰色細直線,跟金色門框拉出對比,不然整塊會糊成一片實心。
const SCHOOL_FRAME = [
  '................',
  '................',
  '....XXXXXXXX....',
  '...X........X...',
  '..XXXXXXXXXXXX..',
  '..X..........X..',
  '..X.D.D.D.D..X..',
  '..X.D.D.D.D..X..',
  '..X.D.D.D.D..X..',
  '..X.D.D.D.D..X..',
  '..X.D.D.D.D..X..',
  '..XXXXXXXXXXXX..',
  '..X..........X..',
  '..XXXXXXXXXXXX..',
  '................',
  '................',
];

// 通勤車站:電聯車正面。兩片白色車窗是這顆圖示唯一的辨識點,拿掉就只剩一個方塊。
const STATION_FRAME = [
  '................',
  '................',
  '...XXXXXXXXXX...',
  '..XXXXXXXXXXXX..',
  '..XLLLLXXLLLLX..',
  '..XLLLLXXLLLLX..',
  '..XXXXXXXXXXXX..',
  '..XDDDDDDDDDDX..',
  '..XDDDDDDDDDDX..',
  '..XXXXXXXXXXXX..',
  '..X.XX....XX.X..',
  '...KKKK..KKKK...',
  '................',
  '................',
  '................',
  '................',
];

// 老公寓:三層樓、每層三戶亮窗,底下一個暗色騎樓入口。
const APARTMENT_FRAME = [
  '................',
  '..XXXXXXXXXXXX..',
  '..XLLXXLLXXLLX..',
  '..XLLXXLLXXLLX..',
  '..XXXXXXXXXXXX..',
  '..XLLXXLLXXLLX..',
  '..XLLXXLLXXLLX..',
  '..XXXXXXXXXXXX..',
  '..XLLXXLLXXLLX..',
  '..XLLXXLLXXLLX..',
  '..XXXXXXXXXXXX..',
  '..XXXXKKKKXXXX..',
  '..XXXXKKKKXXXX..',
  '..DDDDDDDDDDDD..',
  '................',
  '................',
];

// 夜市攤:白色遮雨棚 + 攤車。棚子畫成整條白線是刻意的,那是攤位在夜裡最醒目的部分。
const NIGHT_MARKET_FRAME = [
  '................',
  '.......X........',
  '.......X........',
  '..LLLLLLLLLLLL..',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '...X........X...',
  '...X..DDDD..X...',
  '...X..DDDD..X...',
  '...X..DDDD..X...',
  '...X........X...',
  '...XXXXXXXXXX...',
  '................',
  '................',
  '................',
  '................',
];

// 河堤公園:一棵樹 + 草地。全圖唯一用綠色的城鎮,在一排金色建築裡一眼就能認出來。
const RIVER_PARK_FRAME = [
  '................',
  '.......G........',
  '......GGG.......',
  '.....GGGGG......',
  '....GGGGGGG.....',
  '...GGGGGGGGG....',
  '....GGGGGGG.....',
  '.....GGGGG......',
  '.......D........',
  '.......D........',
  '.......D........',
  '..GGGGGGGGGGGG..',
  '..DDDDDDDDDDDD..',
  '................',
  '................',
  '................',
];

// 辦公大樓:密集小窗格 + 頂樓機房。窗格比公寓細一階,拉開「住宅 vs 辦公」的差別。
const OFFICE_FRAME = [
  '................',
  '.....XXXXXX.....',
  '.....XXXXXX.....',
  '..XXXXXXXXXXXX..',
  '..XLXLXLXLXLXX..',
  '..XXXXXXXXXXXX..',
  '..XLXLXLXLXLXX..',
  '..XXXXXXXXXXXX..',
  '..XLXLXLXLXLXX..',
  '..XXXXXXXXXXXX..',
  '..XLXLXLXLXLXX..',
  '..XXXXXXXXXXXX..',
  '..XXXXKKKKXXXX..',
  '..DDDDDDDDDDDD..',
  '................',
  '................',
];

// 工業園區:矮廠房 + 一支冒煙的煙囪。煙用灰色斜點往右飄,補上「這裡在運轉」的動態感。
const FACTORY_FRAME = [
  '................',
  '................',
  '....X...........',
  '....X...D.......',
  '....X..D........',
  '....X.DD........',
  '....XXX.........',
  '..XXXXXXXXXXXX..',
  '..XLLXXLLXXLLX..',
  '..XLLXXLLXXLLX..',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '..DDDDDDDDDDDD..',
  '................',
  '................',
  '................',
];

// 山上廟口:翹起的燕尾屋簷(最寬那一列刻意超出下面的牆體)+ 四根柱子。
const TEMPLE_FRAME = [
  '................',
  '.......X........',
  '......XXX.......',
  '.XXXXXXXXXXXXXX.',
  '..XXXXXXXXXXXX..',
  '...XXXXXXXXXX...',
  '..XXXXXXXXXXXX..',
  '..X..........X..',
  '..X..X.XX.X..X..',
  '..X..X.XX.X..X..',
  '..X..X.XX.X..X..',
  '..X..X.XX.X..X..',
  '..XXXXXXXXXXXX..',
  '..DDDDDDDDDDDD..',
  '................',
  '................',
];

const TOWN_ICON_FRAMES: Record<TownIconId, string[]> = {
  school: SCHOOL_FRAME,
  station: STATION_FRAME,
  apartment: APARTMENT_FRAME,
  nightMarket: NIGHT_MARKET_FRAME,
  riverPark: RIVER_PARK_FRAME,
  office: OFFICE_FRAME,
  factory: FACTORY_FRAME,
  temple: TEMPLE_FRAME,
};

export function getTownIcon(id: TownIconId): { frame: string[]; palette: Record<string, string> } {
  return { frame: TOWN_ICON_FRAMES[id], palette: TOWN_ICON_PALETTE };
}
