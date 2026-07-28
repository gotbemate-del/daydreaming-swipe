import { Archetype, JobBranch, JobTier } from '../combat';

// 場景背景:6 職業各自一套配色+造型主題(呼應該職業的戰鬥風格),鍵值是(archetype, branch, tier)
// 而不是舊版的(archetype, stage)——對齊轉職系統(game/combat.ts 的 JOB_TITLES)而不是地城關卡
// 進度(game/stages.ts,那套系統完全沒動)。60 個場景(6 職業 x 2 分支 x 5 階)對應下面這張已
// 審過、避免重複的命名表,程式不會真的畫出「倉庫」「擂台」這些具體建築剪影,而是用配色+造型
// 元素密度組合出 60 種可辨識的場景,跟 game/sprites/equipmentIcons.ts、skillIcons.ts 同一套
// 「base + tier accent + variant」工程原則。1 階兩分支尚未分岔、共用同一顏色與造型,呼應
// JOB_TITLES 「1 階兩個分支共用同一稱號」的設計。
//
// 完整 60 場景命名表(A/B 分支 tier1 相同,故只列一次):
//   物理近戰 A: 倉庫棧板→貨車卸貨區→工地鷹架→消防車火場(暖紅)→戰術基地(冷灰)
//   物理近戰 B: 倉庫棧板→訓練沙包館→更衣室準備區→正式擂台→冠軍賽場
//   物理遠程 A: 機車街道(日)→計程車車陣(夜景霓虹)→派出所攔檢點→山林→都市制高點
//   物理遠程 B: 機車街道(日)→公路貨櫃車陣→VIP活動紅毯入口→片場攝影棚→西部荒野
//   物理輔助 A: 貨架收銀台→餐廳內場廚房→病房(平靜藍白)→健身房→急診室(警示紅燈)
//   物理輔助 B: 貨架收銀台→機艙→居家客廳→復健器材室→運動場邊
//   魔法近戰 A: 教室→夜市攤販→道觀正殿→命理館小舖→仙境雲霧
//   魔法近戰 B: 教室→廟會遊行陣頭→神壇密室→戶外風水堪輿→武學聖地
//   魔法遠程 A: 電競房(明亮RGB)→開放式辦公室(日光)→科學實驗室(無菌白藍)→駭客暗網(單一螢幕光暈)→伺服器機房(冷藍機櫃)
//   魔法遠程 B: 電競房(明亮RGB)→數據視覺化中心(藍綠圖表)→粒子加速器(環形隧道)→密碼牆(鎖頭+二進位)→頒獎典禮(明亮舞台)
//   魔法輔助 A: 藥局→診間→溫馨諮商沙發室(暖色)→中藥鋪(木藥櫃暖棕金)→仙醫殿堂
//   魔法輔助 B: 藥局→動物醫院→SPA芳療室→針灸診所(冷色治療床)→傳說診所(霓虹招牌)
const WIDTH = 40;
const HEIGHT = 17;
const GROUND_ROWS = 3;
const SKY_TOP_ROWS = 8;
const MOTIF_BASE_ROW = HEIGHT - GROUND_ROWS - 1;

type MotifShape = 'mountain' | 'tree' | 'pillar' | 'crystal' | 'ice' | 'cloud';

interface BackgroundTheme {
  skyTop: string;
  skyBottom: string;
  ground: string;
  motif: string;
  motifShape: MotifShape;
}

// 職業基底身分(=1 階兩分支共用的樣貌),延續舊版配色不變,玩家已經熟悉的視覺不會被打散。
const ARCHETYPE_THEMES: Record<Archetype, BackgroundTheme> = {
  physicalMelee: { skyTop: '#2a1a1a', skyBottom: '#4a2a20', ground: '#3a2418', motif: '#6b3a2a', motifShape: 'mountain' },
  physicalRanged: { skyTop: '#16241c', skyBottom: '#24382a', ground: '#1c2e20', motif: '#3a5a3a', motifShape: 'tree' },
  physicalSupport: { skyTop: '#2a2214', skyBottom: '#4a3a20', ground: '#3a3020', motif: '#c9a94f', motifShape: 'pillar' },
  magicMelee: { skyTop: '#1e1428', skyBottom: '#342248', ground: '#241a30', motif: '#8a5aaa', motifShape: 'crystal' },
  magicRanged: { skyTop: '#141e28', skyBottom: '#203040', ground: '#182430', motif: '#5a8aaa', motifShape: 'ice' },
  magicSupport: { skyTop: '#242030', skyBottom: '#3a3448', ground: '#2a2838', motif: '#e8d8a0', motifShape: 'cloud' },
};

// 每種造型用「相對於底部基準點」的座標偏移組成,dy=0 是貼地那一列,負值往上疊。
const SHAPE_OFFSETS: Record<MotifShape, { dx: number; dy: number }[]> = {
  mountain: [
    { dx: -1, dy: 0 },
    { dx: 0, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
  ],
  tree: [
    { dx: 0, dy: 0 },
    { dx: -1, dy: -1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: 0, dy: -2 },
  ],
  pillar: [
    { dx: 0, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: -2 },
  ],
  crystal: [
    { dx: 0, dy: 0 },
    { dx: -1, dy: -1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: 0, dy: -2 },
  ],
  ice: [
    { dx: 0, dy: 0 },
    { dx: -1, dy: -1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: -1 },
  ],
  cloud: [
    { dx: 0, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
  ],
};

// B 分支從 2 階起(1 階兩分支共用 ARCHETYPE_THEMES 的造型)換一種輪廓,讓兩條路線的剪影
// 結構不同,不只是換色——例如物理近戰 A 是擂台/戰場的 mountain(山脊般的堆疊),B 是拳擊場的
// pillar(角柱)。挑選原則是「跟 A 的既有造型不同」+「跟該分支後段場景的直覺聯想沾得上邊」。
const BRANCH_B_SHAPE: Record<Archetype, MotifShape> = {
  physicalMelee: 'pillar', // 擂台角柱(訓練沙包館→冠軍賽場)
  physicalRanged: 'crystal', // 鎂光燈/紅毯閃光(VIP紅毯→片場攝影棚)
  physicalSupport: 'cloud', // 機艙窗外雲層、居家客廳的軟性輪廓
  magicMelee: 'mountain', // 武學聖地的山門意象
  magicRanged: 'pillar', // 加速器環形隧道/頒獎舞台燈柱
  magicSupport: 'ice', // 針灸冷色治療床、傳說診所的冷調招牌
};

export interface BackgroundFrameData {
  frame: string[];
  palette: Record<string, string>;
}

// ---- HSL 小工具:tier/mood 的顏色推導都疊在既有 6 色基底上做 HSL 調整,不是憑空給新色。----

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, s));
  const light = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// 階數越高、飽和度與亮度越往上推一階,呼應「階數越高,氣勢/存在感越強」的整體規則;
// 幅度刻意保守(每階 +7% 飽和度、+2% 亮度),讓 60 格顏色仍然讀得出是同一個職業家族。
function applyTierVividness(hex: string, tier: JobTier): string {
  const [h, s, l] = hexToHsl(hex);
  const step = tier - 1; // 1 階 = 0,不變 = 跟舊版 stage1 的基底色完全一致
  return hslToHex(h, s + step * 0.07, l + step * 0.02);
}

type ThemeChannel = 'skyTop' | 'skyBottom' | 'ground' | 'motif';
type ChannelGroup = 'sky' | 'ground' | 'motif';

function channelGroup(channel: ThemeChannel): ChannelGroup {
  if (channel === 'ground') return 'ground';
  if (channel === 'motif') return 'motif';
  return 'sky';
}

interface MoodShift {
  channels: ChannelGroup[];
  hueTarget?: number; // 0-360,朝這個色相 blend 過去
  hueBlend?: number; // 0-1,預設 0.5
  satShift?: number; // 疊加在 tier 遞進之後的飽和度增減
  lightShift?: number; // 疊加在 tier 遞進之後的明度增減
}

function applyMoodShift(hex: string, shift: MoodShift): string {
  const [h, s, l] = hexToHsl(hex);
  let nextHue = h;
  if (shift.hueTarget !== undefined) {
    const blend = shift.hueBlend ?? 0.5;
    const diff = ((shift.hueTarget - h + 540) % 360) - 180; // 走最短路徑轉色相
    nextHue = h + diff * blend;
  }
  return hslToHex(nextHue, s + (shift.satShift ?? 0), l + (shift.lightShift ?? 0));
}

// 把命名表裡「有明確給情境色的格子」轉成 HSL 微調,疊在 tier 遞進色之上。只有表裡真的寫了
// 顏色/氛圍詞的格子才在這裡出現(例如「暖紅」「冷灰」「無菌白藍」);純造型描述(例如「環形
// 隧道」「鎖頭+二進位」)不影響配色,交給 motifShape/motifCount 表現就好。tier1 兩分支共用,
// 所以這裡沒有任何 tier 1 的項目。
// hueBlend 刻意調高(多數落在 0.85 上下):當基底色相跟目標色相差距大時(例如物理輔助 A 的
// 暖黃基底要轉去「平靜藍白」),半調(0.5 附近)的中繼色相常會落在不相干的第三色相(例如轉
// 出綠色而不是藍色)。blend 調高等於讓最終色相更靠近命名表指定的目標色,不留在過渡地帶。
const MOOD_SHIFTS: Partial<Record<Archetype, Partial<Record<JobBranch, Partial<Record<JobTier, MoodShift[]>>>>>> = {
  physicalMelee: {
    A: {
      4: [{ channels: ['sky', 'motif'], hueTarget: 6, hueBlend: 0.6, satShift: 0.18 }], // 消防車火場(暖紅)
      5: [{ channels: ['sky', 'ground', 'motif'], hueTarget: 220, hueBlend: 0.85, satShift: -0.45, lightShift: -0.04 }], // 戰術基地(冷灰)
    },
  },
  physicalRanged: {
    A: {
      2: [
        { channels: ['sky'], lightShift: -0.12 }, // 計程車車陣,夜景天空壓暗
        { channels: ['motif'], hueTarget: 320, hueBlend: 0.85, satShift: 0.35, lightShift: 0.05 }, // 霓虹招牌色的動線
      ],
    },
  },
  physicalSupport: {
    A: {
      3: [{ channels: ['sky', 'ground'], hueTarget: 200, hueBlend: 0.95, satShift: -0.3, lightShift: 0.28 }], // 病房(平靜藍白)
      5: [{ channels: ['motif'], hueTarget: 0, hueBlend: 0.7, satShift: 0.4, lightShift: 0.05 }], // 急診室(警示紅燈)
    },
  },
  magicRanged: {
    A: {
      3: [{ channels: ['sky', 'ground'], hueTarget: 205, hueBlend: 0.5, satShift: -0.1, lightShift: 0.18 }], // 科學實驗室(無菌白藍)
      4: [{ channels: ['motif'], hueTarget: 140, hueBlend: 0.5, satShift: 0.3 }], // 駭客暗網(單一螢幕光暈)
      5: [{ channels: ['sky', 'motif'], hueTarget: 215, hueBlend: 0.4, satShift: 0.15, lightShift: -0.05 }], // 伺服器機房(冷藍機櫃)
    },
    B: {
      2: [{ channels: ['sky', 'motif'], hueTarget: 170, hueBlend: 0.5, satShift: 0.2 }], // 數據視覺化中心(藍綠圖表)
      5: [{ channels: ['sky', 'motif'], hueTarget: 45, hueBlend: 0.9, satShift: 0.2, lightShift: 0.2 }], // 頒獎典禮(明亮舞台)
    },
  },
  magicSupport: {
    A: {
      3: [{ channels: ['sky', 'ground', 'motif'], hueTarget: 30, hueBlend: 0.85, satShift: 0.1, lightShift: 0.1 }], // 溫馨諮商沙發室(暖色)
      4: [{ channels: ['sky', 'ground', 'motif'], hueTarget: 35, hueBlend: 0.85, satShift: 0.15, lightShift: 0.05 }], // 中藥鋪(木藥櫃暖棕金)
    },
    B: {
      4: [{ channels: ['sky', 'ground'], hueTarget: 195, hueBlend: 0.5, satShift: -0.05, lightShift: 0.05 }], // 針灸診所(冷色治療床)
      5: [{ channels: ['motif'], hueTarget: 310, hueBlend: 0.85, satShift: 0.5, lightShift: -0.25 }], // 傳說診所(霓虹招牌)
    },
  },
};

function computeChannelColor(archetype: Archetype, branch: JobBranch, tier: JobTier, channel: ThemeChannel, baseHex: string): string {
  let color = applyTierVividness(baseHex, tier);
  const shifts = MOOD_SHIFTS[archetype]?.[branch]?.[tier];
  const group = channelGroup(channel);
  if (shifts) {
    for (const shift of shifts) {
      if (shift.channels.includes(group)) color = applyMoodShift(color, shift);
    }
  }
  return color;
}

// 場景色調隨大關數緩慢漂移:職業階級只會變化4次(Lv80/250/300/400解鎖下一階),玩家在
// 同一階級裡可能要打完幾十甚至上百個大關,背景卻完全靜止,「持續前進」感只能靠關卡數字
// 文字傳達。這裡只微調天空色相(skyTop/skyBottom),不動 ground/motif,才不會打亂
// MOOD_SHIFTS 已經設計好的情境色識別度(地面/造型物是「這是哪個職業場景」的主要辨識線索,
// 天空是氛圍層,調它最安全)。60大關一個完整循環(呼應晝夜/四季更迭的意象),用 sin 波形
// 讓漂移平滑來回,不會在循環邊界跳色。
const STAGE_DRIFT_CYCLE = 60;
const STAGE_DRIFT_MAX_HUE = 18;

function applyStageDrift(hex: string, stage: number): string {
  const [h, s, l] = hexToHsl(hex);
  const progress = ((stage - 1) % STAGE_DRIFT_CYCLE) / STAGE_DRIFT_CYCLE;
  const hueOffset = Math.sin(progress * Math.PI * 2) * STAGE_DRIFT_MAX_HUE;
  return hslToHex(h + hueOffset, s, l);
}

// tier 1 兩分支共用同一份造型與配色(呼應 JOB_TITLES 的「1 階兩個分支共用同一稱號」);
// tier 2 起才切到各自分支的 motifShape 與情境色。
function computeTheme(archetype: Archetype, branch: JobBranch, tier: JobTier): BackgroundTheme {
  const base = ARCHETYPE_THEMES[archetype];
  const motifShape = tier === 1 ? base.motifShape : branch === 'A' ? base.motifShape : BRANCH_B_SHAPE[archetype];
  return {
    skyTop: computeChannelColor(archetype, branch, tier, 'skyTop', base.skyTop),
    skyBottom: computeChannelColor(archetype, branch, tier, 'skyBottom', base.skyBottom),
    ground: computeChannelColor(archetype, branch, tier, 'ground', base.ground),
    motif: computeChannelColor(archetype, branch, tier, 'motif', base.motif),
    motifShape,
  };
}

// tier 1..5,數字越大場景裡的造型元素越密集,呼應轉職階級遞進;元素數量 = tier。
// totalHeight 預設等於原本的戰鬥場景高度(HEIGHT);傳更大的值(給「主視覺延伸區」用)時,
// 超出原本地面之後的部分一律延續 skyBottom 色階往下鋪,不會重複畫地面,不然會看起來像整塊土台。
export function getJobBackground(
  archetype: Archetype,
  branch: JobBranch,
  tier: JobTier,
  totalHeight: number = HEIGHT,
  stage: number = 1
): BackgroundFrameData {
  const theme = computeTheme(archetype, branch, tier);
  const grid: string[][] = Array.from({ length: totalHeight }, (_, y) => {
    const rowChar = y < SKY_TOP_ROWS ? 'T' : y < HEIGHT - GROUND_ROWS ? 'B' : y < HEIGHT ? 'G' : 'B';
    return new Array(WIDTH).fill(rowChar);
  });

  const motifCount = Math.max(1, Math.min(5, tier));
  const spacing = Math.floor(WIDTH / (motifCount + 1));
  const offsets = SHAPE_OFFSETS[theme.motifShape];
  for (let i = 1; i <= motifCount; i++) {
    const baseX = spacing * i;
    for (const { dx, dy } of offsets) {
      const x = baseX + dx;
      const y = MOTIF_BASE_ROW + dy;
      if (x >= 0 && x < WIDTH && y >= 0 && y < totalHeight) grid[y][x] = 'M';
    }
  }

  const frame = grid.map((row) => row.join(''));
  const palette: Record<string, string> = {
    T: applyStageDrift(theme.skyTop, stage),
    B: applyStageDrift(theme.skyBottom, stage),
    G: theme.ground,
    M: theme.motif,
  };
  return { frame, palette };
}

// 主視覺延伸區用:圖片本身之外(超出 totalHeight 的殘留高度)要靠外層 View 的純色
// backgroundColor 接住,顏色跟圖片最底部的 skyBottom 一致才不會看到明顯接縫——這裡也要套
// 同一個 stage 漂移,不然接縫處會露出兩種色階。
export function getJobBackdropColor(archetype: Archetype, branch: JobBranch, tier: JobTier, stage: number = 1): string {
  return applyStageDrift(computeTheme(archetype, branch, tier).skyBottom, stage);
}
