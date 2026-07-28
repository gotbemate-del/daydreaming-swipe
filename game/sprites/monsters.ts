// 怪物像素美術,跟 heroSilhouette.ts 同一套「半寬參數 + 中心對稱」產生手法,
// 差別是每種怪物的半寬序列(rows)手工設計,做出不同輪廓,而不是共用同一套身體。
// 配合勇者本體密度提升,getMonsterFrame 輸出時整張放大3倍,形狀本身不重新設計。
import { upscaleFrame } from './spriteScale';

const SCALE = 3;

export interface MonsterRowSpec {
  halfWidth: number;
  fill: string;
  eyes?: boolean;
}

interface MonsterVisualSpec {
  width: number;
  centerLeft: number;
  centerRight: number;
  outline: string;
  rows: (MonsterRowSpec | null)[];
  palette: Record<string, string>;
}

function buildRow(width: number, centerLeft: number, centerRight: number, spec: MonsterRowSpec | null, outline: string): string {
  if (spec === null) return '.'.repeat(width);
  // 每個 cell 只能塞一個字元,palette key 一定要是單一字元,不然拼出來的 row 長度會跑掉。
  if (spec.fill.length !== 1) throw new Error(`fill must be a single character, got "${spec.fill}"`);
  if (outline.length !== 1) throw new Error(`outline must be a single character, got "${outline}"`);
  const cells = new Array(width).fill('.');
  const fillLeft = centerLeft - spec.halfWidth + 1;
  const fillRight = centerRight + spec.halfWidth - 1;
  for (let c = fillLeft; c <= fillRight; c++) cells[c] = spec.fill;
  if (fillLeft - 1 >= 0) cells[fillLeft - 1] = outline;
  if (fillRight + 1 < width) cells[fillRight + 1] = outline;
  if (spec.eyes && spec.halfWidth >= 2) {
    cells[fillLeft + 1] = outline;
    cells[fillRight - 1] = outline;
  }
  return cells.join('');
}

function buildMonsterFrame(spec: MonsterVisualSpec): { frame: string[]; palette: Record<string, string> } {
  const frame = spec.rows.map((row) => buildRow(spec.width, spec.centerLeft, spec.centerRight, row, spec.outline));
  return { frame, palette: spec.palette };
}

const K = 'K'; // 固定外框字元(所有原型共用),實際顏色由下面的 TINTS 決定,不是寫死色碼。

// 12 種身體原型骨架:每種只手刻「一份輪廓」(跟舊版 7 隻怪物同一套手感),不是 120 份各自
// 獨立的手繪稿。輪廓固定用 A(主色)/B(副色)兩個 fill key + K 外框,顏色留給下面的 TINTS
// 決定——這樣同一副骨架套上不同 TINTS+縮放係數,就能長出「同一種怪、不同強度」的變體,
// 呼應 equipmentIcons.ts「少量手繪骨架 + 程式化疊加差異化」讓大量內容有辨識度的既有解法。
// 前 7 個(blob/flying/biped/fungal/undead/construct/dragon)沿用原本 slime/bat/goblin/
// mushroom/skeleton/golem/dragon 的輪廓不變(只是把各自獨立的 palette key 統一改名成 A/B),
// 後 5 個(quadruped/serpent/insect/aquatic/elemental)是新增的原型。
interface ArchetypeSpec {
  key: string;
  width: number;
  centerLeft: number;
  centerRight: number;
  rows: (MonsterRowSpec | null)[];
}

const ARCHETYPES: ArchetypeSpec[] = [
  {
    key: 'blob',
    width: 12,
    centerLeft: 5,
    centerRight: 6,
    rows: [
      null,
      { halfWidth: 1, fill: 'A' },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 4, fill: 'A' },
      { halfWidth: 5, fill: 'A', eyes: true },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 4, fill: 'A' },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 1, fill: 'B' },
      null,
    ],
  },
  {
    key: 'flying',
    width: 12,
    centerLeft: 5,
    centerRight: 6,
    rows: [
      null,
      { halfWidth: 1, fill: 'A' },
      { halfWidth: 2, fill: 'A', eyes: true },
      { halfWidth: 4, fill: 'B' },
      { halfWidth: 6, fill: 'B' },
      { halfWidth: 5, fill: 'B' },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 1, fill: 'A' },
      null,
      null,
      null,
    ],
  },
  {
    key: 'biped',
    width: 14,
    centerLeft: 6,
    centerRight: 7,
    rows: [
      null,
      { halfWidth: 1, fill: 'A' },
      { halfWidth: 2, fill: 'A', eyes: true },
      { halfWidth: 1, fill: 'A' },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 4, fill: 'A' },
      { halfWidth: 4, fill: 'A' },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 3, fill: 'B' },
      { halfWidth: 2, fill: 'B' },
      null,
      null,
      null,
    ],
  },
  {
    key: 'fungal',
    width: 14,
    centerLeft: 6,
    centerRight: 7,
    rows: [
      null,
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 6, fill: 'A' },
      { halfWidth: 7, fill: 'A', eyes: true },
      { halfWidth: 6, fill: 'A' },
      { halfWidth: 4, fill: 'A' },
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 1, fill: 'B' },
      { halfWidth: 2, fill: 'B' },
      { halfWidth: 2, fill: 'B' },
      { halfWidth: 2, fill: 'B' },
      { halfWidth: 1, fill: 'B' },
      null,
      null,
    ],
  },
  {
    key: 'undead',
    width: 16,
    centerLeft: 7,
    centerRight: 8,
    rows: [
      null,
      { halfWidth: 1, fill: 'A' },
      { halfWidth: 3, fill: 'A', eyes: true },
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 1, fill: 'A' },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 1, fill: 'A' },
      { halfWidth: 1, fill: 'A' },
      null,
      null,
      null,
    ],
  },
  {
    key: 'construct',
    width: 16,
    centerLeft: 7,
    centerRight: 8,
    rows: [
      null,
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 5, fill: 'A', eyes: true },
      { halfWidth: 7, fill: 'A' },
      { halfWidth: 6, fill: 'A' },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 5, fill: 'B' },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 4, fill: 'A' },
      { halfWidth: 4, fill: 'A' },
      { halfWidth: 4, fill: 'A' },
      { halfWidth: 3, fill: 'A' },
      null,
      null,
      null,
      null,
    ],
  },
  {
    key: 'dragon',
    width: 20,
    centerLeft: 9,
    centerRight: 10,
    rows: [
      null,
      { halfWidth: 1, fill: 'A' },
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 3, fill: 'A', eyes: true },
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 8, fill: 'B' },
      { halfWidth: 10, fill: 'B' },
      { halfWidth: 9, fill: 'B' },
      { halfWidth: 6, fill: 'B' },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 4, fill: 'A' },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 2, fill: 'B' },
      { halfWidth: 1, fill: 'B' },
      null,
      null,
    ],
  },
  {
    key: 'quadruped',
    width: 16,
    centerLeft: 7,
    centerRight: 8,
    rows: [
      null,
      { halfWidth: 1, fill: 'A' },
      { halfWidth: 1, fill: 'A' },
      { halfWidth: 2, fill: 'A', eyes: true },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 7, fill: 'A' },
      { halfWidth: 7, fill: 'A' },
      { halfWidth: 6, fill: 'A' },
      { halfWidth: 5, fill: 'B' },
      { halfWidth: 4, fill: 'B' },
      { halfWidth: 3, fill: 'B' },
      null,
      null,
    ],
  },
  {
    key: 'serpent',
    width: 10,
    centerLeft: 4,
    centerRight: 5,
    rows: [
      { halfWidth: 2, fill: 'A', eyes: true },
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 2, fill: 'B' },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 2, fill: 'B' },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 2, fill: 'B' },
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 2, fill: 'B' },
      { halfWidth: 1, fill: 'A' },
      { halfWidth: 1, fill: 'B' },
    ],
  },
  {
    key: 'insect',
    width: 14,
    centerLeft: 6,
    centerRight: 7,
    rows: [
      null,
      { halfWidth: 1, fill: 'A', eyes: true },
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 4, fill: 'B' },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 4, fill: 'B' },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 4, fill: 'B' },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 2, fill: 'A' },
      null,
      null,
    ],
  },
  {
    key: 'aquatic',
    width: 16,
    centerLeft: 7,
    centerRight: 8,
    rows: [
      null,
      { halfWidth: 1, fill: 'A', eyes: true },
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 6, fill: 'B' },
      { halfWidth: 7, fill: 'B' },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 3, fill: 'A' },
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 1, fill: 'B' },
      null,
      null,
    ],
  },
  {
    key: 'elemental',
    width: 14,
    centerLeft: 6,
    centerRight: 7,
    rows: [
      null,
      { halfWidth: 2, fill: 'A' },
      { halfWidth: 5, fill: 'A', eyes: true },
      { halfWidth: 3, fill: 'B' },
      { halfWidth: 6, fill: 'A' },
      { halfWidth: 2, fill: 'B' },
      { halfWidth: 5, fill: 'A' },
      { halfWidth: 3, fill: 'B' },
      { halfWidth: 4, fill: 'A' },
      { halfWidth: 1, fill: 'B' },
      null,
      null,
    ],
  },
];

// 10 組共用色調(小/中/大/兇暴/精銳/鋼甲/疾風/魔化/暗影/王者,對應 game/monsters.ts 的
// RARITY_TIER_SLOTS 稀有度分佈),12 個原型共用同一組色調表——不是每個原型各自配色,
// 這樣 12 原型 x 10 色調 = 120 款,只需要手調 10 組顏色而不是 120 組。
interface Tint {
  k: string;
  a: string;
  b: string;
}

const TINTS: Tint[] = [
  { k: '#2e2a1c', a: '#8a9a86', b: '#5f6f56' }, // 1 小/common:原版史萊姆同色調,青綠
  { k: '#3a3542', a: '#9aab8a', b: '#6f7f5a' }, // 2 中/common:偏亮的黃綠
  { k: '#2a2820', a: '#7a8a72', b: '#4f5f46' }, // 3 大/common:壓深一階的橄欖綠
  { k: '#2a1c16', a: '#a06050', b: '#6b3a2a' }, // 4 兇暴/common:赭紅
  { k: '#161c2c', a: '#7a95c0', b: '#4a5a80' }, // 5 精銳/rare:鋼藍
  { k: '#1c1e20', a: '#9aa0aa', b: '#606870' }, // 6 鋼甲/rare:金屬灰
  { k: '#0e211c', a: '#7ad0c8', b: '#458a82' }, // 7 疾風/rare:青綠松石
  { k: '#1c0e26', a: '#9a5ac0', b: '#5a2a70' }, // 8 魔化/epic:紫魔
  { k: '#0e0c16', a: '#4a4258', b: '#2a2438' }, // 9 暗影/epic:暗灰紫
  { k: '#1c1608', a: '#c9a94f', b: '#8a6a2a' }, // 10 王者/legendary:金
];

function maxHalfWidthFor(spec: ArchetypeSpec): number {
  return Math.min(spec.centerLeft + 1, spec.width - spec.centerRight);
}

function buildVariantVisual(archetype: ArchetypeSpec, tintIndex: number, scaleFactor: number): MonsterVisualSpec {
  const tint = TINTS[tintIndex];
  const maxHalfWidth = maxHalfWidthFor(archetype);
  const rows = archetype.rows.map((row) => {
    if (row === null) return null;
    const halfWidth = Math.max(1, Math.min(maxHalfWidth, Math.round(row.halfWidth * scaleFactor)));
    return { halfWidth, fill: row.fill, eyes: row.eyes };
  });
  return {
    width: archetype.width,
    centerLeft: archetype.centerLeft,
    centerRight: archetype.centerRight,
    outline: K,
    palette: { [K]: tint.k, A: tint.a, B: tint.b },
    rows,
  };
}

// 縮放係數對應 10 個色調欄位(小/中/大/兇暴/精銳/鋼甲/疾風/魔化/暗影/王者),越後面的稱號
// 不見得體型越大,刻意讓體型/強度不是單純線性放大,看起來更像「同一種怪的不同個體」而不是
// 縮放特效。
const SCALE_FACTORS: number[] = [0.8, 0.95, 1.05, 1.15, 1.0, 1.1, 0.9, 1.15, 1.0, 1.3];

// 產生全部 120 款怪物的視覺定義:id 跟 game/monsters.ts 的 MONSTERS 陣列保持
// `${archetype}-${slot}`(slot 1~10)一致,兩邊各自維護但用同一套命名規則對齊,
// 改動任一邊記得同步另一邊。
const MONSTER_VISUALS: Record<string, MonsterVisualSpec> = {};
for (const archetype of ARCHETYPES) {
  for (let slot = 0; slot < TINTS.length; slot++) {
    const id = `${archetype.key}-${slot + 1}`;
    MONSTER_VISUALS[id] = buildVariantVisual(archetype, slot, SCALE_FACTORS[slot]);
  }
}

export type MonsterSpriteId = keyof typeof MONSTER_VISUALS;

export interface MonsterFrameData {
  frame: string[];
  palette: Record<string, string>;
}

// 魔王/大魔王不沿用上面「半寬序列」產生器(那套只做得出對稱的圓潤/獸型輪廓),
// 改用跟 equipmentIcons.ts/skillIcons.ts 同一套「座標點列表 → 固定尺寸網格」手法,
// 才能刻出「寬肩+雙角+斗篷」這種非對稱細節、且保證每列寬度一致不會拼歪。
interface Mark {
  x: number;
  y: number;
  c: string;
}

function buildMarkFrame(size: number, marks: Mark[]): string[] {
  const grid: string[][] = Array.from({ length: size }, () => new Array(size).fill('.'));
  for (const { x, y, c } of marks) {
    if (x >= 0 && x < size && y >= 0 && y < size) grid[y][x] = c;
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

// 5 款關卡魔王依玩家目前的職業階級(JobTier)分開造型,呼應主畫面背景(backgrounds.ts)本來就
// 依階級由樸素到華麗遞進的視覺基調——不再是全部關卡共用同一隻「關卡魔王」。體型都比一般怪物
// (最大 20 寬的幼龍)更壯碩醒目,但輪廓/配色各自設計出區別(角/獠牙/披風/翅膀/皇冠依序遞增)。

const BOSS_TIER1_CANVAS = 20;

// Tier1 荒地首領:雙角、寬肩斗篷、紅色發光雙眼——最初階、造型最簡樸的魔王。
const BOSS_TIER1_MARKS: Mark[] = [
  ...rect(5, 0, 6, 1, 'K'),
  ...rect(13, 0, 14, 1, 'K'),
  ...rect(6, 2, 13, 6, 'H'),
  { x: 8, y: 4, c: 'R' },
  { x: 11, y: 4, c: 'R' },
  ...rect(7, 7, 12, 7, 'K'),
  ...rect(2, 8, 17, 10, 'C'),
  ...rect(6, 8, 13, 10, 'B'),
  ...rect(6, 10, 13, 15, 'B'),
  ...rect(6, 16, 8, 19, 'B'),
  ...rect(11, 16, 13, 19, 'B'),
  ...rect(6, 18, 8, 19, 'K'),
  ...rect(11, 18, 13, 19, 'K'),
];

const BOSS_TIER1_PALETTE: Record<string, string> = {
  K: '#2a1a1a',
  H: '#7a4a4a',
  R: '#e05050',
  C: '#4a2a3a',
  B: '#6b3a4a',
};

const BOSS_TIER2_CANVAS = 20;

// Tier2 窖藏獸王:寬臉獠牙、毛皮肩甲,獸化路線,棕橙色調跟 tier1 的暗紅拉開差異。
const BOSS_TIER2_MARKS: Mark[] = [
  ...rect(4, 1, 5, 2, 'K'),
  ...rect(14, 1, 15, 2, 'K'),
  ...rect(5, 2, 14, 7, 'H'),
  { x: 7, y: 5, c: 'R' },
  { x: 12, y: 5, c: 'R' },
  { x: 7, y: 7, c: 'W' },
  { x: 12, y: 7, c: 'W' },
  ...rect(3, 8, 16, 10, 'C'),
  ...rect(5, 10, 14, 16, 'B'),
  ...rect(5, 17, 8, 19, 'B'),
  ...rect(11, 17, 14, 19, 'B'),
  ...rect(5, 18, 8, 19, 'K'),
  ...rect(11, 18, 14, 19, 'K'),
];

const BOSS_TIER2_PALETTE: Record<string, string> = {
  K: '#241c14',
  H: '#8a6a42',
  R: '#e0a050',
  C: '#4a3a24',
  B: '#6b5230',
  W: '#f2ead8',
};

const BOSS_TIER3_CANVAS = 22;

// Tier3 鏽甲督軍:尖刺頭盔、方正護肩、鏽蝕金屬色,走「重裝軍將」路線。
const BOSS_TIER3_MARKS: Mark[] = [
  ...rect(9, 0, 12, 1, 'K'),
  ...rect(7, 1, 14, 6, 'H'),
  { x: 9, y: 4, c: 'R' },
  { x: 12, y: 4, c: 'R' },
  ...rect(8, 5, 13, 5, 'K'),
  ...rect(2, 7, 19, 9, 'C'),
  ...rect(4, 7, 7, 9, 'M'),
  ...rect(14, 7, 17, 9, 'M'),
  ...rect(7, 9, 14, 16, 'B'),
  ...rect(9, 10, 12, 12, 'M'),
  ...rect(7, 17, 10, 21, 'B'),
  ...rect(11, 17, 14, 21, 'B'),
  ...rect(7, 19, 10, 21, 'K'),
  ...rect(11, 19, 14, 21, 'K'),
];

const BOSS_TIER3_PALETTE: Record<string, string> = {
  K: '#1c1a18',
  H: '#7a5a4a',
  R: '#e07a40',
  C: '#3a3632',
  B: '#5a4438',
  M: '#9a6a48',
};

const BOSS_TIER4_CANVAS = 22;

// Tier4 幽夜魔君:雙翼展開、下半身化為虛影,深紫色調,走「幽冥系」路線。
const BOSS_TIER4_MARKS: Mark[] = [
  { x: 8, y: 0, c: 'K' },
  { x: 13, y: 0, c: 'K' },
  ...rect(8, 1, 13, 6, 'H'),
  { x: 9, y: 4, c: 'R' },
  { x: 12, y: 4, c: 'R' },
  ...rect(0, 6, 6, 10, 'W'),
  ...rect(15, 6, 21, 10, 'W'),
  ...rect(7, 7, 14, 9, 'K'),
  ...rect(6, 9, 15, 15, 'B'),
  ...rect(8, 10, 13, 12, 'C'),
  ...rect(8, 16, 13, 18, 'B'),
  ...rect(9, 19, 12, 21, 'B'),
];

const BOSS_TIER4_PALETTE: Record<string, string> = {
  K: '#140a1c',
  H: '#3a1e4a',
  R: '#c060f0',
  W: '#241436',
  B: '#2a1638',
  C: '#4a2860',
};

const BOSS_TIER5_CANVAS = 24;

// Tier5 巔峰宗師:皇冠、寬幅披風、金白配色,循環進度最頂端的魔王——比 tier1~4 更華麗,
// 但走「聖騎士式的莊嚴」路線,跟大魔王(FINAL_BOSS_MARKS 的雙翼魔王路線)刻意做出區隔。
const BOSS_TIER5_MARKS: Mark[] = [
  ...rect(10, 0, 13, 1, 'Y'),
  { x: 9, y: 1, c: 'Y' },
  { x: 14, y: 1, c: 'Y' },
  { x: 11, y: 0, c: 'W' },
  { x: 12, y: 0, c: 'W' },
  ...rect(9, 2, 14, 7, 'H'),
  { x: 10, y: 4, c: 'R' },
  { x: 13, y: 4, c: 'R' },
  ...rect(1, 8, 22, 13, 'C'),
  ...rect(4, 8, 19, 12, 'B'),
  ...rect(9, 8, 14, 16, 'B'),
  ...rect(10, 9, 13, 9, 'Y'),
  ...rect(10, 14, 13, 14, 'Y'),
  ...rect(8, 17, 11, 22, 'B'),
  ...rect(12, 17, 15, 22, 'B'),
  ...rect(8, 20, 11, 22, 'K'),
  ...rect(12, 20, 15, 22, 'K'),
];

const BOSS_TIER5_PALETTE: Record<string, string> = {
  K: '#241c10',
  H: '#8a7248',
  R: '#f2d675',
  C: '#3a3020',
  B: '#5a4a2a',
  Y: '#c9a94f',
  W: '#f2ead8',
};

const FINAL_BOSS_CANVAS = 24;

// 大魔王:在魔王的基礎上加金冠、雙翼,配色改金黑對比,體型再放大一圈,一眼看得出是整組循環的最終王。
const FINAL_BOSS_MARKS: Mark[] = [
  ...rect(10, 0, 13, 1, 'Y'),
  { x: 9, y: 1, c: 'Y' },
  { x: 14, y: 1, c: 'Y' },
  ...rect(8, 2, 15, 6, 'H'),
  { x: 10, y: 4, c: 'R' },
  { x: 13, y: 4, c: 'R' },
  ...rect(9, 7, 14, 7, 'K'),
  ...rect(0, 8, 6, 12, 'W'),
  ...rect(17, 8, 23, 12, 'W'),
  ...rect(6, 8, 17, 12, 'C'),
  ...rect(9, 8, 14, 12, 'B'),
  ...rect(8, 12, 15, 18, 'B'),
  ...rect(8, 19, 11, 23, 'B'),
  ...rect(12, 19, 15, 23, 'B'),
  ...rect(8, 22, 11, 23, 'K'),
  ...rect(12, 22, 15, 23, 'K'),
];

const FINAL_BOSS_PALETTE: Record<string, string> = {
  K: '#1a1410',
  H: '#3a3020',
  R: '#f2d675',
  C: '#2a2015',
  B: '#4a3a1a',
  W: '#2a2015',
  Y: '#c9a94f',
};

const CUSTOM_MONSTER_FRAMES: Record<string, MonsterFrameData> = {
  stage_boss_tier1: { frame: buildMarkFrame(BOSS_TIER1_CANVAS, BOSS_TIER1_MARKS), palette: BOSS_TIER1_PALETTE },
  stage_boss_tier2: { frame: buildMarkFrame(BOSS_TIER2_CANVAS, BOSS_TIER2_MARKS), palette: BOSS_TIER2_PALETTE },
  stage_boss_tier3: { frame: buildMarkFrame(BOSS_TIER3_CANVAS, BOSS_TIER3_MARKS), palette: BOSS_TIER3_PALETTE },
  stage_boss_tier4: { frame: buildMarkFrame(BOSS_TIER4_CANVAS, BOSS_TIER4_MARKS), palette: BOSS_TIER4_PALETTE },
  stage_boss_tier5: { frame: buildMarkFrame(BOSS_TIER5_CANVAS, BOSS_TIER5_MARKS), palette: BOSS_TIER5_PALETTE },
  final_boss: { frame: buildMarkFrame(FINAL_BOSS_CANVAS, FINAL_BOSS_MARKS), palette: FINAL_BOSS_PALETTE },
};

export function getMonsterFrame(id: string): MonsterFrameData {
  const custom = CUSTOM_MONSTER_FRAMES[id];
  if (custom) return { frame: upscaleFrame(custom.frame, SCALE), palette: custom.palette };
  const spec = MONSTER_VISUALS[id];
  if (!spec) throw new Error(`No monster visual defined for id: ${id}`);
  const built = buildMonsterFrame(spec);
  return { frame: upscaleFrame(built.frame, SCALE), palette: built.palette };
}

export function hasMonsterVisual(id: string): boolean {
  return id in MONSTER_VISUALS || id in CUSTOM_MONSTER_FRAMES;
}
