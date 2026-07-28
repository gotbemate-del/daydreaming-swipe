import { Archetype, getCurrentTier } from '../combat';
import { EquipmentItem, EquipmentSlot } from '../equipment';
import { upscaleFrame } from './spriteScale';
import { getWeaponFrame } from './weapons';

// 非武器 8 槽位的通用圖示,12x12 跟 tabIcons/skillIcons 同一套畫布尺寸。武器(mainhand)另外
// 用 game/sprites/weapons.ts 依職業給專屬造型。這裡的 8 個槽位圖示是「這個槽位類型長什麼樣」
// 的共用基礎剪影,疊上三層程式化標記讓 9 插槽x50 等級檔x6 職業=3000 款裝備都有可辨識的視覺
// 差異(不是手繪3000張圖):
//   1. 職業徽記(右上角3x3小圖騰,6職業各自造型,呼應skillIcons.ts已經建立的職業風味語彙)
//   2. 階級星標(左下角,職業階級1-5階,階數越高星標越多,呼應skillIcons.ts的tier accent手法)
//   3. 等級檔刻度(最底一排,1-10個小刻度循環,同一階內的10個等級檔也看得出差異)
// 配合勇者本體密度提升,輸出時放大3倍(SCALE),基礎剪影形狀不重新設計。
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

const FILL = 'E';

// 背飾:背包本體(挖出前袋接縫線)+ 寬頂蓋 + 提把 + 兩條肩帶。
const BACK_MARKS: Mark[] = [
  ...rect(3, 4, 8, 10, FILL).filter((m) => !(m.x >= 4 && m.x <= 7 && m.y === 7)),
  ...rect(2, 2, 9, 3, FILL),
  { x: 5, y: 1, c: FILL },
  { x: 6, y: 1, c: FILL },
  { x: 3, y: 0, c: FILL },
  { x: 3, y: 1, c: FILL },
  { x: 8, y: 0, c: FILL },
  { x: 8, y: 1, c: FILL },
];

// 下身:寬腰頭(含皮帶環)+ 從胯下挖開叉,分出左右兩條褲管。
const BOTTOM_MARKS: Mark[] = [
  ...rect(2, 1, 9, 3, FILL),
  { x: 3, y: 0, c: FILL },
  { x: 8, y: 0, c: FILL },
  ...rect(2, 4, 9, 10, FILL).filter((m) => !(m.x >= 5 && m.x <= 6 && m.y >= 5)),
];

// 上身:立領 + 軀幹(挖前襟釦孔,做出開襟感)+ 兩側短袖 + 袖口反摺。
const TOP_MARKS: Mark[] = [
  { x: 5, y: 0, c: FILL },
  { x: 6, y: 0, c: FILL },
  ...rect(4, 1, 7, 9, FILL).filter((m) => !(m.x === 5 && (m.y === 3 || m.y === 5 || m.y === 7))),
  ...rect(1, 2, 3, 5, FILL),
  ...rect(8, 2, 10, 5, FILL),
  { x: 1, y: 6, c: FILL },
  { x: 2, y: 6, c: FILL },
  { x: 9, y: 6, c: FILL },
  { x: 10, y: 6, c: FILL },
];

// 腰帶:橫帶(挖出等距皮帶孔)+ 中空方形扣環(像真的扣環一樣中間透空)。
const BELT_MARKS: Mark[] = [
  ...rect(1, 5, 10, 6, FILL).filter((m) => !(m.y === 5 && [2, 4, 7, 9].includes(m.x))),
  ...rect(4, 3, 7, 8, FILL).filter((m) => !(m.x >= 5 && m.x <= 6 && m.y >= 5 && m.y <= 6)),
];

// 頭飾:頂端釦 + 窄頂 + 帽身 + 寬帽緣(兩端微微下垂)。
const HEADWEAR_MARKS: Mark[] = [
  { x: 5, y: 1, c: FILL },
  { x: 6, y: 1, c: FILL },
  ...rect(4, 2, 7, 3, FILL),
  ...rect(3, 4, 8, 6, FILL),
  ...rect(1, 7, 10, 8, FILL),
  { x: 1, y: 9, c: FILL },
  { x: 10, y: 9, c: FILL },
];

// 面飾:兩片鏡片挖空成環狀(像真的護目鏡鏡框)+ 鼻樑橋 + 兩側綁帶。
const FACE_MARKS: Mark[] = [
  ...rect(1, 5, 4, 8, FILL).filter((m) => !(m.x >= 2 && m.x <= 3 && m.y >= 6 && m.y <= 7)),
  ...rect(7, 5, 10, 8, FILL).filter((m) => !(m.x >= 8 && m.x <= 9 && m.y >= 6 && m.y <= 7)),
  { x: 5, y: 6, c: FILL },
  { x: 6, y: 6, c: FILL },
  { x: 0, y: 6, c: FILL },
  { x: 11, y: 6, c: FILL },
];

// 手套:掌心(挖出四指分隔缺口)+ 拇指凸起 + 寬版手腕反摺。
const GLOVES_MARKS: Mark[] = [
  ...rect(4, 4, 9, 8, FILL).filter((m) => !(m.y === 4 && [5, 7, 9].includes(m.x))),
  ...rect(2, 6, 3, 7, FILL),
  ...rect(3, 9, 10, 10, FILL),
];

// 副手飾品:掛包本體(挖出翻蓋接縫線)+ 翻蓋 + 提把 + 兩側扣帶。
const OFFHAND_MARKS: Mark[] = [
  ...rect(3, 5, 8, 10, FILL).filter((m) => !(m.x >= 5 && m.x <= 6 && m.y === 7)),
  ...rect(2, 3, 9, 4, FILL),
  { x: 5, y: 1, c: FILL },
  { x: 6, y: 1, c: FILL },
  { x: 5, y: 2, c: FILL },
  { x: 6, y: 2, c: FILL },
  { x: 4, y: 8, c: FILL },
  { x: 7, y: 8, c: FILL },
];

const SLOT_ICON_MARKS: Partial<Record<EquipmentSlot, Mark[]>> = {
  back: BACK_MARKS,
  bottom: BOTTOM_MARKS,
  top: TOP_MARKS,
  belt: BELT_MARKS,
  headwear: HEADWEAR_MARKS,
  face: FACE_MARKS,
  gloves: GLOVES_MARKS,
  offhand: OFFHAND_MARKS,
};

// 職業徽記:右上角 3x3 小圖騰,呼應 skillIcons.ts 已經建立的職業風味(工地/外送/超商店員/
// 修煉廟宇/工程師/醫護),讓同一個插槽在不同職業手上看起來不是完全同一張圖。
const ARCHETYPE_EMBLEM_MARKS: Record<Archetype, Mark[]> = {
  // 安全帽尖頂,工地風味。
  physicalMelee: [{ x: 10, y: 1, c: FILL }, { x: 9, y: 2, c: FILL }, { x: 11, y: 2, c: FILL }],
  // 對角箭頭,外送奔跑風味。
  physicalRanged: [{ x: 9, y: 2, c: FILL }, { x: 10, y: 1, c: FILL }, { x: 11, y: 0, c: FILL }],
  // 四角散點,收銀台/會員點數風味。
  physicalSupport: [{ x: 9, y: 0, c: FILL }, { x: 11, y: 0, c: FILL }, { x: 9, y: 2, c: FILL }, { x: 11, y: 2, c: FILL }],
  // 菱形火光,修煉/香火風味。
  magicMelee: [{ x: 10, y: 0, c: FILL }, { x: 9, y: 1, c: FILL }, { x: 11, y: 1, c: FILL }, { x: 10, y: 2, c: FILL }],
  // 空心方框,螢幕/工程師風味。
  magicRanged: [
    { x: 9, y: 0, c: FILL }, { x: 10, y: 0, c: FILL }, { x: 11, y: 0, c: FILL },
    { x: 9, y: 1, c: FILL }, { x: 11, y: 1, c: FILL },
    { x: 9, y: 2, c: FILL }, { x: 10, y: 2, c: FILL }, { x: 11, y: 2, c: FILL },
  ],
  // 十字,醫護風味。
  magicSupport: [{ x: 10, y: 0, c: FILL }, { x: 9, y: 1, c: FILL }, { x: 10, y: 1, c: FILL }, { x: 11, y: 1, c: FILL }, { x: 10, y: 2, c: FILL }],
};

// 階級星標:左下角,職業階級(1-5)越高星標越多,呼應 skillIcons.ts 的 tier accent 手法。
function tierStarMarks(tier: number): Mark[] {
  const marks: Mark[] = [];
  const positions = [
    { x: 0, y: 10 },
    { x: 2, y: 10 },
    { x: 0, y: 8 },
    { x: 2, y: 8 },
  ];
  for (let i = 0; i < Math.min(tier - 1, positions.length); i++) {
    marks.push({ x: positions[i].x, y: positions[i].y, c: FILL });
  }
  return marks;
}

// 等級檔刻度:最底一排,依 bracket 循環出 1-10 個刻度,同一階內的 10 個等級檔也看得出差異。
function bracketTickMarks(bracket: number | undefined): Mark[] {
  if (bracket === undefined) return [];
  const count = ((bracket - 1) % 10) + 1;
  const marks: Mark[] = [];
  for (let i = 0; i < count; i++) marks.push({ x: i, y: 11, c: FILL });
  return marks;
}

export interface EquipmentIconData {
  frame: string[];
  fillKey: string;
}

export function getEquipmentSlotIcon(
  slot: EquipmentSlot,
  archetype?: Archetype,
  requiredLevel?: number,
  bracket?: number
): EquipmentIconData {
  const baseMarks = SLOT_ICON_MARKS[slot] ?? [];
  const archetypeMarks = archetype ? ARCHETYPE_EMBLEM_MARKS[archetype] : [];
  const tier = getCurrentTier(requiredLevel ?? 1);
  const marks = [...baseMarks, ...archetypeMarks, ...tierStarMarks(tier), ...bracketTickMarks(bracket)];
  return { frame: upscaleFrame(buildFrame(marks), SCALE), fillKey: FILL };
}

// 給裝備清單用的統一入口:主手武器吃 game/sprites/weapons.ts 的職業造型,其餘槽位吃這裡的通用圖示。
export function getItemIcon(item: EquipmentItem): EquipmentIconData {
  if (item.slot === 'mainhand') {
    const weapon = getWeaponFrame(item.archetype, item.twoHanded, getCurrentTier(item.requiredLevel ?? 1));
    return { frame: weapon.frame, fillKey: weapon.fillKey };
  }
  return getEquipmentSlotIcon(item.slot, item.archetype, item.requiredLevel, item.bracket);
}
