// 寵物/坐騎裝備圖示:5 槽位(上身/下身/頭盔/鞋/武器)x 2 種(pet/mount)= 10 張獨立圖示。
// 這裡刻意不沿用 companions.ts 的「科屬剪影」系統(那是給寵物本體用的,10/14 格寬的細長身形
// 畫布,不適合拿來畫配件),改比照 equipmentIcons.ts/skillIcons.ts 這套「單一物品小圖示」的
// 慣例:12x12 座標點陣畫布 + Mark 陣列 + 放大 3 倍(SCALE),跟 UI 上其他裝備格圖示(見
// components/EquipmentPanel.tsx 的 ICON_PIXEL_SIZE = 2/3)是同一套視覺語言、同一個像素密度。
//
// pet 與 mount 同槽位刻意用不同剪影語彙拉開差異,不只是換色:
//   pet  = 小巧可愛的寵物配件——尺寸小、佔畫布中心一小塊、造型走可愛路線
//          (背心/短褲護環/派對小尖帽/迷你雙靴/掛繩小墜飾)。
//   mount = 厚重的乘騎裝具——尺寸大、幾乎撐滿整張畫布、造型走實用/軍武路線
//          (馬鞍胸甲/護腿馬靴/馬面甲+羽飾/蹄鐵/長柄武器)。
import { CompanionGearSlot, CompanionKind } from '../companions';
import { upscaleFrame } from './spriteScale';

const CANVAS = 12;
const SCALE = 3;

interface Mark {
  x: number;
  y: number;
  c: string;
}

function buildFrame(marks: Mark[]): string[] {
  const grid: string[][] = Array.from({ length: CANVAS }, () => new Array(CANVAS).fill('.'));
  for (const { x, y, c } of marks) {
    if (x >= 0 && x < CANVAS && y >= 0 && y < CANVAS) grid[y][x] = c;
  }
  return grid.map((row) => row.join(''));
}

function rect(x0: number, y0: number, x1: number, y1: number, c: string): Mark[] {
  const marks: Mark[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) marks.push({ x, y, c });
  }
  return marks;
}

// 扣掉某些座標不畫(拿來在實心矩形上挖洞/開叉,例如短褲的胯下開衩、面甲的眼孔)。
function without(marks: Mark[], remove: Array<[number, number]>): Mark[] {
  return marks.filter((m) => !remove.some(([x, y]) => m.x === x && m.y === y));
}

const F = 'F'; // 主體填色
const A = 'A'; // 配件強調色(釦子/鉚釘/滾邊)

// ---------------------------------------------------------------------------
// pet:小巧可愛的寵物配件,圖形集中在畫布中段,四周留白多。
// ---------------------------------------------------------------------------

// 上身:小背心——V領挖口 + 兩條肩帶 + 中線釦子。
const PET_TOP_MARKS: Mark[] = [
  { x: 4, y: 1, c: F }, { x: 4, y: 2, c: F },
  { x: 7, y: 1, c: F }, { x: 7, y: 2, c: F },
  ...without(rect(3, 3, 8, 9, F), [
    [5, 3], [6, 3],
  ]),
  { x: 5, y: 5, c: A }, { x: 5, y: 7, c: A },
];

// 下身:短褲護環——腰帶 + 兩截短褲管,中間開衩(胯下留空),整體矮小。
const PET_BOTTOM_MARKS: Mark[] = [
  ...without(rect(3, 5, 8, 6, F), [
    [5, 5], [6, 5],
  ]),
  { x: 5, y: 5, c: A }, { x: 6, y: 5, c: A },
  ...rect(3, 7, 4, 10, F),
  ...rect(7, 7, 8, 10, F),
];

// 頭盔:派對小尖帽——寬帽緣 + 逐漸收窄的錐體 + 頂端毛球。
const PET_HELMET_MARKS: Mark[] = [
  ...rect(2, 8, 9, 9, F),
  ...rect(3, 7, 8, 7, F),
  ...rect(4, 6, 7, 6, F),
  ...rect(5, 5, 6, 5, F),
  { x: 5, y: 4, c: F }, { x: 5, y: 3, c: F },
  { x: 4, y: 1, c: A }, { x: 5, y: 1, c: A }, { x: 4, y: 2, c: A }, { x: 5, y: 2, c: A },
];

// 鞋:迷你雙靴——左右兩個小靴筒 + 深色鞋底,分別擺在畫布左右兩側,中間大片留白。
const PET_SHOES_MARKS: Mark[] = [
  ...rect(2, 6, 3, 8, F),
  { x: 1, y: 9, c: A }, { x: 2, y: 9, c: A }, { x: 3, y: 9, c: A }, { x: 4, y: 9, c: A },
  ...rect(8, 6, 9, 8, F),
  { x: 7, y: 9, c: A }, { x: 8, y: 9, c: A }, { x: 9, y: 9, c: A }, { x: 10, y: 9, c: A },
];

// 武器:掛繩小墜飾——頂端中空掛環 + 短握把 + 十字護手 + 收尖成單點的迷你短刃。
const PET_WEAPON_MARKS: Mark[] = [
  { x: 5, y: 0, c: F }, { x: 6, y: 0, c: F },
  { x: 4, y: 1, c: F }, { x: 7, y: 1, c: F },
  { x: 4, y: 2, c: F }, { x: 7, y: 2, c: F },
  { x: 5, y: 3, c: F }, { x: 6, y: 3, c: F },
  { x: 5, y: 4, c: F }, { x: 6, y: 4, c: F },
  ...rect(3, 5, 8, 5, A),
  ...rect(4, 6, 7, 6, F),
  { x: 5, y: 7, c: F }, { x: 6, y: 7, c: F },
  { x: 5, y: 8, c: F },
];

// ---------------------------------------------------------------------------
// mount:厚重的乘騎裝具,幾乎撐滿整張畫布,帶垂掛的束帶/披掛物,呼應「乘載用具」的體積感。
// ---------------------------------------------------------------------------

// 上身:馬鞍胸甲——寬闊胸甲板(V領挖口延續同一視覺語彙但寬得多)+ 左右兩條垂掛肚帶 + 鉚釘。
const MOUNT_TOP_MARKS: Mark[] = [
  ...without(rect(1, 3, 10, 8, F), [
    [5, 3], [6, 3],
  ]),
  ...rect(2, 9, 3, 11, F),
  ...rect(8, 9, 9, 11, F),
  { x: 2, y: 4, c: A }, { x: 9, y: 4, c: A }, { x: 2, y: 7, c: A }, { x: 9, y: 7, c: A },
];

// 下身:護腿馬靴——寬腰帶 + 兩塊厚重護腿(比 pet 短褲寬、開衩窄很多),外加橫向束帶。
const MOUNT_BOTTOM_MARKS: Mark[] = [
  ...rect(1, 3, 10, 4, F),
  ...rect(1, 5, 4, 10, F),
  ...rect(7, 5, 10, 10, F),
  { x: 2, y: 7, c: A }, { x: 3, y: 7, c: A }, { x: 8, y: 7, c: A }, { x: 9, y: 7, c: A },
  { x: 2, y: 9, c: A }, { x: 3, y: 9, c: A }, { x: 8, y: 9, c: A }, { x: 9, y: 9, c: A },
];

// 頭盔:馬面甲+羽飾——上寬下窄的角形面甲(挖兩個眼孔)+ 頂端一撮直立羽飾,整體佔滿畫布上半。
const MOUNT_HELMET_MARKS: Mark[] = [
  ...rect(3, 3, 8, 3, F),
  ...rect(2, 4, 9, 5, F),
  ...rect(3, 6, 8, 6, F),
  ...rect(4, 7, 7, 7, F),
  { x: 5, y: 8, c: F }, { x: 6, y: 8, c: F },
  { x: 4, y: 5, c: A }, { x: 7, y: 5, c: A },
  { x: 5, y: 0, c: A }, { x: 6, y: 0, c: A }, { x: 5, y: 1, c: A }, { x: 6, y: 1, c: A }, { x: 5, y: 2, c: A },
];

// 鞋:蹄鐵——單一置中的 U 形鐵環(開口朝下),沿邊釘上釘孔,跟 pet 左右分置的雙靴完全不同構圖。
const MOUNT_SHOES_MARKS: Mark[] = [
  ...rect(3, 2, 8, 3, F),
  ...rect(2, 4, 3, 8, F),
  ...rect(8, 4, 9, 8, F),
  { x: 4, y: 2, c: A }, { x: 7, y: 2, c: A }, { x: 2, y: 5, c: A }, { x: 9, y: 5, c: A }, { x: 2, y: 7, c: A }, { x: 9, y: 7, c: A },
];

// 武器:側掛長矛——從左上到右下貫穿整張畫布的長柄斜線(比 pet 掛繩短刃長得多),矛尖收窄、
// 尾端加粗,握把處纏一圈強調色布條。
const MOUNT_WEAPON_MARKS: Mark[] = [
  { x: 0, y: 0, c: F }, { x: 1, y: 0, c: F }, { x: 0, y: 1, c: F },
  { x: 2, y: 1, c: F }, { x: 3, y: 2, c: F }, { x: 4, y: 3, c: F },
  { x: 5, y: 4, c: A }, { x: 6, y: 5, c: A },
  { x: 7, y: 6, c: F }, { x: 8, y: 7, c: F }, { x: 9, y: 8, c: F },
  { x: 10, y: 9, c: F }, { x: 11, y: 10, c: F }, { x: 10, y: 10, c: F }, { x: 11, y: 9, c: F },
];

const PET_SLOT_MARKS: Record<CompanionGearSlot, Mark[]> = {
  top: PET_TOP_MARKS,
  bottom: PET_BOTTOM_MARKS,
  helmet: PET_HELMET_MARKS,
  shoes: PET_SHOES_MARKS,
  weapon: PET_WEAPON_MARKS,
};

const MOUNT_SLOT_MARKS: Record<CompanionGearSlot, Mark[]> = {
  top: MOUNT_TOP_MARKS,
  bottom: MOUNT_BOTTOM_MARKS,
  helmet: MOUNT_HELMET_MARKS,
  shoes: MOUNT_SHOES_MARKS,
  weapon: MOUNT_WEAPON_MARKS,
};

// pet 走暖色系/粉彩(可愛配件感),mount 走重色系/皮革金屬(裝具感),同槽位色調也刻意不同。
const PET_SLOT_PALETTE: Record<CompanionGearSlot, { F: string; A: string }> = {
  top: { F: '#e07a9c', A: '#f2d675' },
  bottom: { F: '#6ab0e0', A: '#f2d675' },
  helmet: { F: '#b389e0', A: '#f2d675' },
  shoes: { F: '#e08a3c', A: '#3a3542' },
  weapon: { F: '#c9a94f', A: '#8b8698' },
};

const MOUNT_SLOT_PALETTE: Record<CompanionGearSlot, { F: string; A: string }> = {
  top: { F: '#7a4a2a', A: '#d9a93a' },
  bottom: { F: '#5a4a3a', A: '#8a8478' },
  helmet: { F: '#6e7a3a', A: '#eae6dc' },
  shoes: { F: '#b8bcc0', A: '#4a453f' },
  weapon: { F: '#8a5230', A: '#4c7fb0' },
};

export interface CompanionGearIconData {
  frame: string[];
  palette: Record<string, string>;
}

// 依 kind(pet/mount)+ slot 產生對應圖示:形狀由 kind 決定(可愛配件 vs 乘騎裝具兩套語彙),
// 顏色由 kind+slot 各自的專屬色盤決定,同槽位 pet/mount 保證形狀與顏色都不同。
export function getCompanionGearIcon(kind: CompanionKind, slot: CompanionGearSlot): CompanionGearIconData {
  const marks = kind === 'pet' ? PET_SLOT_MARKS[slot] : MOUNT_SLOT_MARKS[slot];
  const colors = kind === 'pet' ? PET_SLOT_PALETTE[slot] : MOUNT_SLOT_PALETTE[slot];
  const frame = upscaleFrame(buildFrame(marks), SCALE);
  return { frame, palette: { [F]: colors.F, [A]: colors.A } };
}
