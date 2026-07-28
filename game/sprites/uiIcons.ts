// 介面用的小圖示,純程式產生像素格(跟 tabIcons.ts / skillIcons.ts 同一套原則)。
//
// 這批圖示是為了把畫面上殘留的 emoji(🎯🏆🎁🎉🔍🎲)全部換掉而畫的。emoji 不能當遊戲圖示的
// 理由不是美感偏好,是三個實際問題:
//   1. 每個平台/瀏覽器/系統版本的 emoji 字體都不一樣,同一顆 🎁 在 Android、iOS、Windows
//      長得完全不同,遊戲畫面在不同裝置上會不一致,也無從控制。
//   2. emoji 是全彩且高飽和,跟本作整體的莫蘭迪暗色像素風格衝突,一顆彩色 emoji 擺在深色
//      面板上會比旁邊真正重要的資訊還搶眼。
//   3. 它們不是我們的資產——改不動、調不了色、也沒辦法跟著解鎖狀態換樣式。
//
// 統一用 16x16、共用同一組色盤,由 components/PixelSprite.tsx 渲染。要新增圖示就往下加一組
// frame + 對應的 UiIconId,不用動任何 UI 元件。
export type UiIconId = 'goal' | 'achievement' | 'daily' | 'celebrate' | 'identify' | 'reroll';

// 全部圖示共用一組色盤,確保它們擺在一起時色調一致(強調金 + 莫蘭迪灰紫 + 前景白 + 面板深)。
export const UI_ICON_PALETTE: Record<string, string> = {
  X: '#e0a95c',
  D: '#9691a5',
  L: '#f2f2f2',
  K: '#2a2a35',
};

// 下一步指引:準心/靶心。同心圓比「箭頭射中靶」更好認——16x16 放不下箭矢,硬畫會糊成一團。
const GOAL_ICON_FRAME = [
  '................',
  '................',
  '.....XXXXXX.....',
  '...XX......XX...',
  '..X..........X..',
  '.X....DDDD....X.',
  '.X...D....D...X.',
  '.X...D.LL.D...X.',
  '.X...D.LL.D...X.',
  '.X...D....D...X.',
  '.X....DDDD....X.',
  '..X..........X..',
  '...XX......XX...',
  '.....XXXXXX.....',
  '................',
  '................',
];

// 成就:獎盃。兩側的灰把手刻意留空一格不接到杯身,不然在 20px 顯示尺寸下會糊成一塊實心方塊。
const ACHIEVEMENT_ICON_FRAME = [
  '................',
  '................',
  '..D..XXXXXX..D..',
  '..DD.XXXXXX.DD..',
  '...D.XXLLXX.D...',
  '...DDXXLLXXDD...',
  '....DXXXXXXD....',
  '.....XXXXXX.....',
  '......XXXX......',
  '.......XX.......',
  '......XXXX......',
  '.....DDDDDD.....',
  '....DDDDDDDD....',
  '................',
  '................',
  '................',
];

// 每日任務:禮物盒。白色緞帶貫穿盒身正中央,是這顆圖示在小尺寸下唯一的辨識特徵,不能省。
const DAILY_ICON_FRAME = [
  '................',
  '................',
  '................',
  '....LL....LL....',
  '...L..L..L..L...',
  '....LL.LL.LL....',
  '..XXXXXLLXXXXX..',
  '..XXXXXLLXXXXX..',
  '..DDDDDLLDDDDD..',
  '..DXXXXLLXXXXD..',
  '..DXXXXLLXXXXD..',
  '..DXXXXLLXXXXD..',
  '..DXXXXLLXXXXD..',
  '..DDDDDDDDDDDD..',
  '................',
  '................',
];

// 慶祝/限時活動:四角星爆。用星芒而不是彩帶,因為彩帶在 16x16 只會變成幾顆分不出形狀的色點。
// 橫向的芒直接畫滿整排,讓它在快速閃過的成長演出裡也能一眼認出是「有好事發生」。
const CELEBRATE_ICON_FRAME = [
  '................',
  '.......XX.......',
  '.......XX.......',
  '......XXXX......',
  '..D...XXXX...D..',
  '...D.XXXXXX.D...',
  'XXXXXXXLLXXXXXXX',
  'XXXXXXXLLXXXXXXX',
  '...D.XXXXXX.D...',
  '..D...XXXX...D..',
  '......XXXX......',
  '.......XX.......',
  '.......XX.......',
  '................',
  '................',
  '................',
];

// 鑑定隱藏素質:放大鏡。鏡片裡的白色高光是刻意的——沒有它,空心圓+斜柄容易被看成鑰匙。
const IDENTIFY_ICON_FRAME = [
  '................',
  '.....XXXX.......',
  '...XX....XX.....',
  '..X........X....',
  '..X..LL....X....',
  '..X..LL....X....',
  '..X........X....',
  '..X........X....',
  '...XX....XX.....',
  '.....XXXX.......',
  '........DDD.....',
  '.........DDD....',
  '..........DDD...',
  '...........DD...',
  '................',
  '................',
];

// 重擲隨機/隱藏素質:骰子五點。點數用 2x2 而不是 1x1——1x1 在實際顯示尺寸下會細到看不見。
const REROLL_ICON_FRAME = [
  '................',
  '................',
  '...XXXXXXXXXX...',
  '...XXXXXXXXXX...',
  '...XKKXXXXKKX...',
  '...XKKXXXXKKX...',
  '...XXXXXXXXXX...',
  '...XXXXKKXXXX...',
  '...XXXXKKXXXX...',
  '...XXXXXXXXXX...',
  '...XKKXXXXKKX...',
  '...XKKXXXXKKX...',
  '...XXXXXXXXXX...',
  '...DDDDDDDDDD...',
  '................',
  '................',
];

const UI_ICON_FRAMES: Record<UiIconId, string[]> = {
  goal: GOAL_ICON_FRAME,
  achievement: ACHIEVEMENT_ICON_FRAME,
  daily: DAILY_ICON_FRAME,
  celebrate: CELEBRATE_ICON_FRAME,
  identify: IDENTIFY_ICON_FRAME,
  reroll: REROLL_ICON_FRAME,
};

export function getUiIcon(id: UiIconId): { frame: string[]; palette: Record<string, string> } {
  return { frame: UI_ICON_FRAMES[id], palette: UI_ICON_PALETTE };
}
