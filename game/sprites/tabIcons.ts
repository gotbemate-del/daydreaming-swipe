// 分頁導覽用的小圖示,純程式產生像素格(跟 skillIcons.ts 同一套原則)。
// 新增分頁時只要在這裡多加一個 icon frame + 對應的 TabIconId,不用動 UI 元件本身。
export type TabIconId =
  | 'job'
  | 'equipment'
  | 'skill'
  | 'companion'
  | 'enhance'
  | 'socket'
  | 'codex'
  | 'achievement'
  | 'inventory'
  | 'dungeon'
  | 'ascension';

const ICON_COLOR = '#f2f2f2';
// 二階職業陰影色:跟主色同色系(莫蘭迪灰紫),只用在少數幾個 16x16 圖示上做淺淺的立體感,
// 不是新增獨立配色系統——舊的 12x12 單色圖示(enhance/socket/codex)不受影響,繼續只用 X。
const ICON_SHADE_COLOR = '#9691a5';

// 職業:公事包造型(提把+扣鎖+雙格),比舊版單純一條斜線更容易一眼認出「這是職業」。
const JOB_ICON_FRAME = [
  '................',
  '................',
  '................',
  '......XXX.......',
  '......X.X.......',
  '......XXX.......',
  '..XXXXXXXXXXX...',
  '..XDDDDDDDDDX...',
  '..XXXXXXXXXXX...',
  '..XDDDDDDDDDX...',
  '..XDDDDDDDDDX...',
  '..XDDDDDDDDDX...',
  '..XXXXXXXXXXX...',
  '................',
  '................',
  '................',
];

// 裝備:盾牌造型+中軸分色線,比舊版寶石輪廓更直接呼應「防具/裝備」的意象。
const EQUIPMENT_ICON_FRAME = [
  '................',
  '................',
  '.....XXXXXX.....',
  '...XXXXXXXXXX...',
  '...XXDDXXDDXX...',
  '...XXDDXXDDXX...',
  '...XXDDXXDDXX...',
  '...XXDDXXDDXX...',
  '...XXDDXXDDXX...',
  '....XXDXXDXX....',
  '.....XXXXXX.....',
  '......XXXX......',
  '.......XX.......',
  '................',
  '................',
  '................',
];

// 技能:閃電造型,拉高解析度後線條更俐落,尾端多一道小尖角呼應「爆發」的意象。
const SKILL_ICON_FRAME = [
  '................',
  '.........X......',
  '........X.......',
  '........X.......',
  '.......XX.......',
  '......XXX.......',
  '......XXXXXXX...',
  '.....XXXXXXX....',
  '....XXXXXXX.....',
  '.......XXX......',
  '.......XXX......',
  '.......XX.......',
  '.......X........',
  '.......X........',
  '................',
  '................',
];

// 寵物坐騎:肉球造型(掌墊+三趾),比舊版兩顆對稱橢圓更直接呼應「寵物」的意象。
const COMPANION_ICON_FRAME = [
  '................',
  '........X.......',
  '.......XXX......',
  '...XXXXXXXXXX...',
  '...XXX.XXXXXXX..',
  '..XXXXXXXXXXXX..',
  '...XXX....XXXX..',
  '....X.XXXX......',
  '....XXXXXXXX....',
  '....XXXXXXXX....',
  '...XXXXXXXXXX...',
  '....XXXXXXXX....',
  '....XXXXXXXX....',
  '......XXXX......',
  '................',
  '................',
];

// 強化:向上箭頭 + 兩側小閃光,呼應「提升等級」的意象。
const ENHANCE_ICON_FRAME = [
  '.....XX.....',
  '....XXXX....',
  '...XXXXXX...',
  '.....XX.....',
  '.....XX.....',
  '.....XX.....',
  '.....XX.....',
  '............',
  '..X......X..',
  '............',
  '............',
  '............',
];

// 鑲嵌:菱形寶石造型。
const SOCKET_ICON_FRAME = [
  '.....XX.....',
  '....XXXX....',
  '...XXXXXX...',
  '..XXXXXXXX..',
  '.XXXXXXXXXX.',
  '..XXXXXXXX..',
  '...XXXXXX...',
  '....XXXX....',
  '.....XX.....',
  '............',
  '............',
  '............',
];

// 圖鑑:書本造型,中央一條書脊線。
const CODEX_ICON_FRAME = [
  '............',
  '.XXXXXXXXXX.',
  '.X........X.',
  '.X...XX...X.',
  '.X...XX...X.',
  '.X...XX...X.',
  '.X...XX...X.',
  '.X...XX...X.',
  '.X...XX...X.',
  '.X........X.',
  '.XXXXXXXXXX.',
  '............',
];

// 成就:獎盃造型(杯身+雙耳把手+底座),拉高解析度後把手/底座線條更清楚,呼應「達成目標」的意象。
const ACHIEVEMENT_ICON_FRAME = [
  '................',
  '................',
  '..XXXXXXXXXXXX..',
  '.XXDXDDDDDDXDXX.',
  '.XXDDDDDDDDDDXX.',
  '.XXXXDDDDDDXXXX.',
  '.XXXXDDDDDDXXXX.',
  '..XXXXXXXXXXXX..',
  '.......XX.......',
  '.......XX.......',
  '....XXXXXXXX....',
  '....XXXXXXXX....',
  '...XXXXXXXXXX...',
  '................',
  '................',
  '................',
];

// 背包:提把弧線 + 袋身 + 中間扣具,跟裝備分頁裡的皮包/背飾造型呼應但更簡化,
// 拉高解析度後扣具用陰影色點出來,比舊版純外框更立體。
const INVENTORY_ICON_FRAME = [
  '................',
  '.....XXXXX......',
  '....XX...XX.....',
  '....X.....X.....',
  '................',
  '................',
  '..XXXXXXXXXXX...',
  '..XXDDDDDDDXX...',
  '..XDDDXXXDDDX...',
  '..XDDDXXXDDDX...',
  '..XDDDDDDDDDX...',
  '..XDDDDDDDDDX...',
  '..XXDDDDDDDXX...',
  '..XXXXXXXXXXX...',
  '................',
  '................',
];

// 副本:傳送門/地下城入口造型——外圈拱門輪廓 + 內圈陰影通道,呼應「走進去挑戰」的意象,
// 拉高解析度後拱形弧線更圓滑,不再是硬折角。
const DUNGEON_ICON_FRAME = [
  '................',
  '................',
  '.....XXXXX......',
  '....XXXXXXX.....',
  '...XXXXDXXXX....',
  '..XXXDDDDDXXX...',
  '..XXDDDDDDDXX...',
  '..XXDDDDDDDXX...',
  '..XXDDDDDDDXX...',
  '..XXDDDDDDDXX...',
  '..XXDDDDDDDXX...',
  '..XXDDDDDDDXX...',
  '..XXDDDDDDDXX...',
  '..XXDDDDDDDXX...',
  '................',
  '................',
];

// 轉生:雙箭頭環狀循環造型,拉高解析度後畫成兩段弧線+箭頭尖角,比舊版「缺一角的圓環」
// 更直接讀成「循環/輪迴」而不是壞掉的圈。
const ASCENSION_ICON_FRAME = [
  '................',
  '................',
  '.....XXXXX......',
  '....XXXXXXX..X..',
  '...XXX...XXXXX..',
  '..XXX.....XXX...',
  '..XX.......XX...',
  '..XX.......XX...',
  '..XX.......XX...',
  '..XXX.....XXX...',
  '.XXXXX...XXX....',
  '.X..XXXXXXX.....',
  '.....XXXXX......',
  '................',
  '................',
  '................',
];

const TAB_ICON_FRAMES: Record<TabIconId, string[]> = {
  job: JOB_ICON_FRAME,
  equipment: EQUIPMENT_ICON_FRAME,
  skill: SKILL_ICON_FRAME,
  companion: COMPANION_ICON_FRAME,
  enhance: ENHANCE_ICON_FRAME,
  socket: SOCKET_ICON_FRAME,
  codex: CODEX_ICON_FRAME,
  achievement: ACHIEVEMENT_ICON_FRAME,
  inventory: INVENTORY_ICON_FRAME,
  dungeon: DUNGEON_ICON_FRAME,
  ascension: ASCENSION_ICON_FRAME,
};

export interface TabIconData {
  frame: string[];
  palette: Record<string, string>;
}

export function getTabIcon(id: TabIconId): TabIconData {
  return { frame: TAB_ICON_FRAMES[id], palette: { X: ICON_COLOR, D: ICON_SHADE_COLOR } };
}
