// 寵物/坐騎像素美術:每種 kind 底下再分「科屬」(寵物 8 種、坐騎 6 種),各科屬有自己的剪影
// 形狀(列數/耳朵或角的有無/尾巴或鰭的有無/圓潤或細長);同一科屬底下每一隻再各自配一個獨立顏色,
// 顏色軸(科屬配色)跟稀有度軸(尺寸+legendary 專屬外框光暈)刻意分開,不會混成同一條軸線沒有變化。
// 配合勇者本體密度提升,輸出時放大3倍(SCALE),延伸既有 buildRow/半寬(halfWidth)逐列堆疊的技法。
import { Rarity } from '../trigger';
import { CompanionKind, getCompanionById } from '../companions';
import { upscaleFrame } from './spriteScale';

const SCALE = 3;

const RARITY_SCALE: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 1,
  legendary: 2,
};

// legendary 專屬的外框光暈色,其餘稀有度共用一般深色外框——這是稀有度軸自己的裝飾性差異,
// 不跟科屬配色軸混在一起。
const DEFAULT_OUTLINE = '#3a3542';
const LEGENDARY_OUTLINE = '#f5d060';

// 給 UI(圖鑑格子邊框等)用的完整稀有度色階:common/legendary 直接沿用上面兩個既有外框色,
// rare/epic 從既有科屬色盤裡挑一個代表色(aquatic 的藍、mythic 的紫),不另外發明新色系。
export const RARITY_BORDER_COLOR: Record<Rarity, string> = {
  common: '#5a5a68',
  rare: '#3a7ac9',
  epic: '#8a5cd6',
  legendary: LEGENDARY_OUTLINE,
};

const K = 'K';

interface RowSpec {
  halfWidth: number;
}

function buildRow(width: number, centerLeft: number, centerRight: number, spec: RowSpec | null, fill: string): string {
  if (spec === null) return '.'.repeat(width);
  const cells = new Array(width).fill('.');
  const fillLeft = centerLeft - spec.halfWidth + 1;
  const fillRight = centerRight + spec.halfWidth - 1;
  for (let c = fillLeft; c <= fillRight; c++) cells[c] = fill;
  if (fillLeft - 1 >= 0) cells[fillLeft - 1] = K;
  if (fillRight + 1 < width) cells[fillRight + 1] = K;
  return cells.join('');
}

// 科屬形狀的每一列:base 是基礎半寬,scaled=true(預設)代表稀有度尺寸(RARITY_SCALE)會疊加
// 在這一列上;scaled=false 用在耳朵/長耳/角/鰭這類「裝飾性尖端」列,固定用 base=0 畫出純外框的
// 兩格細線條,不隨稀有度放大,純粹是形狀特徵,不是尺寸差異。null = 整列留空(身形中斷的間隔)。
interface ArchetypeRow {
  base: number;
  scaled: boolean;
}
type ArchetypeRowOrGap = ArchetypeRow | null;

function row(base: number, scaled: boolean = true): ArchetypeRow {
  return { base, scaled };
}

function buildFrame(
  width: number,
  centerLeft: number,
  centerRight: number,
  rows: ArchetypeRowOrGap[],
  scale: number,
  fill: string
): string[] {
  return rows.map((r) => {
    if (r === null) return buildRow(width, centerLeft, centerRight, null, fill);
    const halfWidth = r.scaled ? r.base + scale : r.base;
    return buildRow(width, centerLeft, centerRight, { halfWidth }, fill);
  });
}

// ---------------------------------------------------------------------------
// 寵物:8 種科屬,畫布統一 10 格寬,中心在 4/5。
// ---------------------------------------------------------------------------
export type PetArchetype = 'feline' | 'canine' | 'rabbit' | 'bird' | 'reptile' | 'aquatic' | 'rodent' | 'mythic';

const PET_WIDTH = 10;
const PET_CENTER_LEFT = 4;
const PET_CENTER_RIGHT = 5;

const PET_ARCHETYPE_ROWS: Record<PetArchetype, ArchetypeRowOrGap[]> = {
  // 貓科:尖耳(細線裝飾列)+ 細長身。
  feline: [null, row(0, false), row(1), row(2), row(2), row(1), null],
  // 犬科:圓耳、中等身型,列數比貓科少一列,身形較圓潤。
  canine: [null, row(1), row(2), row(3), row(2), null],
  // 兔類:兩列長耳朵裝飾線 + 圓身。
  rabbit: [row(0, false), row(0, false), row(1), row(3), row(3), row(2), null],
  // 鳥類:寬翅膀輪廓列,收尾在尖嘴裝飾線。
  bird: [null, row(3), row(1), row(2), row(1), row(0, false)],
  // 爬蟲類:每列半寬相同,扁平無收窄的硬邊輪廓,呼應「無毛感的硬邊」。
  reptile: [null, row(3), row(3), row(3), row(3), null],
  // 水棲類:圓潤流線身形,收尾在鰭的裝飾線。
  aquatic: [null, row(1), row(3), row(3), row(2), row(0, false)],
  // 嚙齒類:列數最少,小圓身、短尾,整體最迷你。
  rodent: [null, row(1), row(2), row(1), null],
  // 幻獸類:角的裝飾線起頭,多節構造逐列堆疊,列數最多、最華麗。
  mythic: [row(0, false), row(1), row(2), row(3), row(3), row(2), row(1)],
};

const PET_ARCHETYPE_PALETTE: Record<PetArchetype, string[]> = {
  feline: ['#e08a3c', '#8b8b96', '#3a3a42', '#f0ede6', '#b5773c', '#e8d2a0', '#7a5230', '#b8c0c8', '#c96a2e', '#6c7a89'],
  canine: ['#c9622a', '#8a8478', '#d9a95c', '#4a4038', '#e6e2d8', '#6b4a35', '#c9a06a', '#8f3d1f', '#e0c9a0', '#514a44'],
  rabbit: ['#f2ede0', '#8a6a45', '#9a9488', '#3d3833', '#c9a878', '#e6d3a8', '#6e4423', '#b0aa9c', '#d8c3a0', '#5a3f26'],
  bird: ['#4c7fb0', '#c0392b', '#e0c23a', '#3f9e5c', '#8a5db0', '#8a6b4a', '#333333', '#eae6dc', '#d97a2b', '#2f9e93'],
  reptile: ['#4a8f4a', '#6e7a3a', '#8a5a3a', '#7a7a72', '#2f5c56', '#c9a86a', '#2a2a2a', '#a5432f', '#c9b23a', '#3a6ea5'],
  aquatic: ['#3a7ac9', '#2f9e93', '#7fd4b0', '#233a63', '#e0704f', '#3ec9c9', '#b8c8d0', '#6a4a8a', '#e0a83a', '#1f4a73'],
  rodent: ['#8a6a45', '#8b8b96', '#efeae0', '#c9a878', '#3d3833', '#d9b35c', '#e6d8bd', '#514a44', '#6e4423', '#b0aa9c'],
  mythic: ['#8a5cd6', '#e0b93a', '#d9502f', '#5ccbe0', '#3fbf7f', '#4a3a6e', '#e07fc0', '#eef0f8', '#2a1f3a', '#c9432f'],
};

// ---------------------------------------------------------------------------
// 坐騎:6 種科屬,畫布統一 14 格寬,中心在 6/7。
// ---------------------------------------------------------------------------
export type MountArchetype = 'equine' | 'boar' | 'wolf' | 'deer' | 'griffin' | 'dragon';

const MOUNT_WIDTH = 14;
const MOUNT_CENTER_LEFT = 6;
const MOUNT_CENTER_RIGHT = 7;

const MOUNT_ARCHETYPE_ROWS: Record<MountArchetype, ArchetypeRowOrGap[]> = {
  // 馬科:扁寬身形,沿用原本坐騎剪影的基礎比例。
  equine: [null, row(2), row(4), row(5), row(5), row(3)],
  // 野豬科:粗短、獠牙裝飾線收尾。
  boar: [null, row(4), row(5), row(5), row(0, false)],
  // 狼科:列數較多、修長,四肢感靠尾端逐漸收窄的兩列表現。
  wolf: [null, row(2), row(3), row(3), row(2), row(1), row(1)],
  // 鹿科:角的裝飾線起頭,身形收窄在細長腿。
  deer: [row(0, false), row(1), row(3), row(3), row(1), row(1)],
  // 獅鷲科:寬翅膀展開列 + 獸身,翅膀+獸身混合輪廓。
  griffin: [null, row(5), row(2), row(4), row(4), row(2)],
  // 龍科:角的裝飾線起頭,列數最多,翅膀/尾巴的誇張寬窄交錯。
  dragon: [row(0, false), row(3), row(5), row(4), row(5), row(3), row(1)],
};

const MOUNT_ARCHETYPE_PALETTE: Record<MountArchetype, string[]> = {
  equine: ['#8a5230', '#2e2a26', '#efeae0', '#9a9488', '#d9b35c', '#5a3a24', '#a5583a', '#e6d3a8', '#2a3a5a', '#b8bcc0'],
  boar: ['#5a3a24', '#6e6a62', '#2e2a26', '#8a4a2a', '#a5865a', '#3d3833', '#6b5a3a', '#7a2f22', '#7c7c74', '#4a3826'],
  wolf: ['#7a7a80', '#2a2a2e', '#e6e2d8', '#a8acb0', '#5a4a3a', '#3a4250', '#8a6b4a', '#454b52', '#cfd6dc', '#8f4a2f'],
  deer: ['#c9a06a', '#8a8478', '#e6ddc9', '#7a4a2a', '#5a3a24', '#d9be8f', '#4a453f', '#e8d8b8', '#b5732f', '#6b6f72'],
  griffin: ['#d9a93a', '#a5722f', '#b8bcc0', '#4c7fb0', '#a5332a', '#b5622f', '#eee6d8', '#5a5f66', '#c98f2f', '#5a3a24'],
  dragon: ['#c0392b', '#2f9e5c', '#2f6ea5', '#2a2a2e', '#d9a93a', '#7a4ab0', '#3f9e93', '#d97a2b', '#b8bcc0', '#1a1a1e'],
};

// 100 隻寵物/坐騎各自的美術科屬——8 筆既有資料照 CLAUDE 規格文件指定的科屬歸類
// (小貓/狐狸→貓科/犬科、貓頭鷹→鳥類、幼鳳凰→幻獸類、小馬→馬科、野豬→野豬科、
// 座狼→狼科、幼獅鷲→獅鷲科),其餘 92 筆是新增寵物,依 game/companions.ts 資料表的
// 科屬分區直接對應(順序完全比照該檔案 NEW_PET_SEEDS / NEW_MOUNT_SEEDS 的分組註解)。
const COMPANION_ARCHETYPE: Record<string, PetArchetype | MountArchetype> = {
  'pet-common-cat': 'feline',
  'pet-rare-fox': 'canine',
  'pet-epic-owl': 'bird',
  'pet-legendary-phoenix': 'mythic',
  'mount-common-pony': 'equine',
  'mount-rare-boar': 'boar',
  'mount-epic-wolf': 'wolf',
  'mount-legendary-griffin': 'griffin',

  // 貓科
  'pet-common-orangecat': 'feline',
  'pet-common-blackcat': 'feline',
  'pet-common-whitecat': 'feline',
  'pet-common-calico': 'feline',
  'pet-rare-bobcat': 'feline',
  'pet-rare-leopardcat': 'feline',
  // 犬科
  'pet-common-puppy': 'canine',
  'pet-common-shiba': 'canine',
  'pet-common-husky': 'canine',
  'pet-common-gsd': 'canine',
  'pet-rare-arcticfox': 'canine',
  // 兔類
  'pet-common-whiterabbit': 'rabbit',
  'pet-common-brownrabbit': 'rabbit',
  'pet-common-lopear': 'rabbit',
  'pet-common-grayrabbit': 'rabbit',
  'pet-rare-snowhare': 'rabbit',
  'pet-rare-spottedrabbit': 'rabbit',
  // 鳥類
  'pet-common-sparrow': 'bird',
  'pet-common-pigeon': 'bird',
  'pet-common-finch': 'bird',
  'pet-common-whiteeye': 'bird',
  'pet-common-egret': 'bird',
  'pet-rare-parrot': 'bird',
  // 爬蟲類
  'pet-common-gecko': 'reptile',
  'pet-common-iguana': 'reptile',
  'pet-common-turtle': 'reptile',
  'pet-common-chameleon': 'reptile',
  'pet-rare-hornedlizard': 'reptile',
  'pet-rare-firesalamander': 'reptile',
  // 水棲類
  'pet-common-koi': 'aquatic',
  'pet-common-otter': 'aquatic',
  'pet-common-pufferfish': 'aquatic',
  'pet-common-babyseal': 'aquatic',
  'pet-common-tropicalfish': 'aquatic',
  'pet-rare-babydolphin': 'aquatic',
  // 嚙齒類
  'pet-common-hamster': 'rodent',
  'pet-common-chipmunk': 'rodent',
  'pet-common-guineapig': 'rodent',
  'pet-common-squirrel': 'rodent',
  'pet-common-mouse': 'rodent',
  'pet-rare-chinchilla': 'rodent',
  // 幻獸類
  'pet-common-thunderspirit': 'mythic',
  'pet-common-earthspirit': 'mythic',
  'pet-common-waterspirit': 'mythic',
  'pet-epic-unicorn': 'mythic',
  'pet-epic-ninetail': 'mythic',

  // 馬科
  'mount-common-whitehorse': 'equine',
  'mount-common-blackhorse': 'equine',
  'mount-common-pinto': 'equine',
  'mount-common-brownhorse': 'equine',
  'mount-common-minihorse': 'equine',
  'mount-common-donkey': 'equine',
  'mount-rare-zebra': 'equine',
  'mount-rare-ferghana': 'equine',
  // 野豬科
  'mount-common-piglet': 'boar',
  'mount-common-warthog': 'boar',
  'mount-common-spottedpig': 'boar',
  'mount-common-blackpig': 'boar',
  'mount-common-micropig': 'boar',
  'mount-common-hairyboar': 'boar',
  'mount-rare-tuskedboar': 'boar',
  // 狼科
  'mount-common-graywolf': 'wolf',
  'mount-common-wolfpup': 'wolf',
  'mount-common-whitewolf': 'wolf',
  'mount-common-blackwolf': 'wolf',
  'mount-common-prairiewolf': 'wolf',
  'mount-common-forestwolf': 'wolf',
  'mount-rare-tundrawolf': 'wolf',
  // 鹿科
  'mount-common-fawn': 'deer',
  'mount-common-sika': 'deer',
  'mount-common-elk': 'deer',
  'mount-common-whitetail': 'deer',
  'mount-common-muntjac': 'deer',
  'mount-common-moose': 'deer',
  'mount-rare-spiritdeer': 'deer',
  'mount-rare-stagking': 'deer',
  // 獅鷲科
  'mount-common-prairiegriffin': 'griffin',
  'mount-common-rockgriffin': 'griffin',
  'mount-common-dunegriffin': 'griffin',
  'mount-common-forestgriffin': 'griffin',
  'mount-common-graygriffin': 'griffin',
  'mount-rare-silvergriffin': 'griffin',
  'mount-rare-flamegriffin': 'griffin',
  // 龍科
  'mount-common-skydrake': 'dragon',
  'mount-common-sanddrake': 'dragon',
  'mount-common-muddrake': 'dragon',
  'mount-common-grassdrake': 'dragon',
  'mount-common-stonedrake': 'dragon',
  'mount-rare-icedrake': 'dragon',
  'mount-rare-flamedrake': 'dragon',
  'mount-epic-firedragon': 'dragon',
  'mount-epic-icedragon': 'dragon',
};

// 每一隻在自己科屬色盤裡的顏色索引——依 COMPANION_ARCHETYPE 的宣告順序,同科屬內第 N 次
// 出現就分到色盤的第 N 個顏色,保證同科屬底下不會有兩隻顏色完全相同(色盤每種都給了 10 色,
// 遠多於任一科屬目前的成員數上限)。
const COMPANION_COLOR_INDEX: Record<string, number> = (() => {
  const counters: Partial<Record<PetArchetype | MountArchetype, number>> = {};
  const result: Record<string, number> = {};
  for (const id of Object.keys(COMPANION_ARCHETYPE)) {
    const archetype = COMPANION_ARCHETYPE[id];
    const next = counters[archetype] ?? 0;
    result[id] = next;
    counters[archetype] = next + 1;
  }
  return result;
})();

function isPetArchetype(value: PetArchetype | MountArchetype): value is PetArchetype {
  return value in PET_ARCHETYPE_ROWS;
}

export interface CompanionFrameData {
  frame: string[];
  palette: Record<string, string>;
}

// 依寵物/坐騎 id 產生專屬 frame+palette:形狀由科屬決定,尺寸由稀有度決定(RARITY_SCALE),
// 顏色由「科屬色盤 + 這一隻在科屬內的順位」決定,三條軸各自獨立,不會互相混淆。
export function getCompanionFrame(id: string): CompanionFrameData {
  const companion = getCompanionById(id);
  const archetype = COMPANION_ARCHETYPE[id] ?? (companion?.kind === 'mount' ? 'equine' : 'feline');
  const rarity = companion?.rarity ?? 'common';
  const scale = RARITY_SCALE[rarity];
  const colorIndex = COMPANION_COLOR_INDEX[id] ?? 0;
  const outline = rarity === 'legendary' ? LEGENDARY_OUTLINE : DEFAULT_OUTLINE;

  if (isPetArchetype(archetype)) {
    const palette = PET_ARCHETYPE_PALETTE[archetype];
    const fill = palette[colorIndex % palette.length];
    const frame = buildFrame(PET_WIDTH, PET_CENTER_LEFT, PET_CENTER_RIGHT, PET_ARCHETYPE_ROWS[archetype], scale, 'F');
    return { frame: upscaleFrame(frame, SCALE), palette: { K: outline, F: fill } };
  }

  const palette = MOUNT_ARCHETYPE_PALETTE[archetype];
  const fill = palette[colorIndex % palette.length];
  const frame = buildFrame(MOUNT_WIDTH, MOUNT_CENTER_LEFT, MOUNT_CENTER_RIGHT, MOUNT_ARCHETYPE_ROWS[archetype], scale, 'F');
  return { frame: upscaleFrame(frame, SCALE), palette: { K: outline, F: fill } };
}

// 給驗證腳本/其他模組用:回傳某隻寵物/坐騎的美術科屬。
export function getCompanionArchetype(id: string): PetArchetype | MountArchetype | undefined {
  return COMPANION_ARCHETYPE[id];
}
