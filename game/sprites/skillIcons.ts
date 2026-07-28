import { Archetype, JobTier } from '../combat';
import { SkillSlotId } from '../skillTree';

// 6 職業 x 6 技能格 = 36 個獨立圖示,12x12 跟 tabIcons.ts 同一套畫布尺寸。
// 用座標點列表建構(而不是手打字串),每個 cell 由陣列固定寬度保證、不會出現 monsters.ts
// 那種「多字元 palette key 把整列拼歪」的問題。
const CANVAS = 12;

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

// 矩形邊框(只留四邊,不是實心)——tier5「鍍邊/描邊」增量常用這個 shape,呼應職業樹分階
// 「裝備精進」的視覺邏輯,不是隨便加角落點。
function outline(x0: number, y0: number, x1: number, y1: number, c: string): Mark[] {
  return rect(x0, y0, x1, y1, c).filter((m) => m.x === x0 || m.x === x1 || m.y === y0 || m.y === y1);
}

const PHYSICAL_COLOR = '#8b8698';
const MAGIC_COLOR = '#b389e0';
const RANGED_MAGIC_COLOR = '#6ab0e0';
const SUPPORT_MAGIC_COLOR = '#c9a94f';
const SPARK_COLOR = '#f2d675';
const HEAL_COLOR = '#9fd9a0';
const STAR_COLOR = '#ffffff';

// passive3(吸血+自動回血,見 game/skillTree.ts 的 passive3/lifeMastery):愛心剪影,象徵血量
// 恢復,6 個職業共用同一個形狀(統一用 HEAL_COLOR,呼應這個顏色本來就是「治療/回血」語意),
// 不像其餘 36 格各自量身訂做剪影——passive3 本身也沒有 tier2~5 專屬敘述(名稱/描述全職業
// 全階級固定不變,見 SKILL_SLOT_NAMES/SKILL_SLOT_DESCRIPTIONS),沒有 evolution 增量,
// 純靠 tierPalette 既有的「越高階越飽和明亮、5階混金」機制表現階級感就夠。
const HEART_PASSIVE3: Mark[] = [
  { x: 3, y: 2, c: 'H' }, { x: 4, y: 2, c: 'H' }, { x: 7, y: 2, c: 'H' }, { x: 8, y: 2, c: 'H' },
  ...rect(2, 3, 9, 4, 'H'),
  ...rect(3, 5, 8, 5, 'H'),
  ...rect(4, 6, 7, 6, 'H'),
  { x: 5, y: 7, c: 'H' }, { x: 6, y: 7, c: 'H' },
];

// ===== physicalMelee(工地/扛貨風味,身分軌跡:工讀生→搬運工→工地師傅→消防員→特種部隊)=====

// 扛貨練出的體感:紙箱剪影 + 一條斜背帶。
const PM_PASSIVE1: Mark[] = [...rect(2, 3, 9, 9, 'B'), { x: 2, y: 2, c: 'K' }, { x: 4, y: 4, c: 'K' }, { x: 6, y: 6, c: 'K' }, { x: 8, y: 8, c: 'K' }];
// tier2(搬運工):第二條反向背帶交叉成雙肩背架,裝備從單肩帶升級成專業揹架。
const PM_PASSIVE1_T2: Mark[] = [{ x: 9, y: 2, c: 'K' }, { x: 7, y: 4, c: 'K' }, { x: 5, y: 6, c: 'K' }, { x: 3, y: 8, c: 'K' }];
// tier3(工地師傅):箱角加防撞護角。
const PM_PASSIVE1_T3: Mark[] = [{ x: 2, y: 3, c: 'S' }, { x: 9, y: 3, c: 'S' }, { x: 2, y: 9, c: 'S' }, { x: 9, y: 9, c: 'S' }];
// tier4(消防員):貼上一條反光警示條。
const PM_PASSIVE1_T4: Mark[] = [{ x: 3, y: 7, c: 'S' }, { x: 4, y: 7, c: 'S' }, { x: 5, y: 7, c: 'S' }, { x: 7, y: 7, c: 'S' }, { x: 8, y: 7, c: 'S' }];
// tier5(特種部隊):整箱鍍金屬防護框。
const PM_PASSIVE1_T5: Mark[] = outline(1, 2, 10, 10, 'S');

// 工地行情摸透了:安全帽剪影(半圓頂 + 帽緣)。
const PM_PASSIVE2: Mark[] = [...rect(4, 2, 7, 2, 'B'), ...rect(3, 3, 8, 5, 'B'), ...rect(1, 6, 10, 7, 'B'), { x: 5, y: 3, c: 'K' }, { x: 6, y: 3, c: 'K' }];
// tier2(搬運工):加一條下巴扣帶,固定更牢。
const PM_PASSIVE2_T2: Mark[] = [{ x: 3, y: 8, c: 'K' }, { x: 3, y: 9, c: 'K' }, { x: 8, y: 8, c: 'K' }, { x: 8, y: 9, c: 'K' }];
// tier3(簡化版):帽頂加一道視線護目線。
const PM_PASSIVE2_T3: Mark[] = [{ x: 4, y: 4, c: 'K' }, { x: 5, y: 4, c: 'K' }, { x: 6, y: 4, c: 'K' }, { x: 7, y: 4, c: 'K' }];
// tier4(消防員):加一片下翻式防護面罩。
const PM_PASSIVE2_T4: Mark[] = [{ x: 4, y: 8, c: 'S' }, { x: 5, y: 8, c: 'S' }, { x: 6, y: 8, c: 'S' }, { x: 7, y: 8, c: 'S' }];
// tier5(簡化版):帽緣加寬、金色描邊。
const PM_PASSIVE2_T5: Mark[] = outline(1, 2, 10, 7, 'S');

// 爆擊一擊(維持原設計):斜劈刀鋒 + 命中十字火花。
const PM_ACTIVE1: Mark[] = [
  { x: 1, y: 10, c: 'B' }, { x: 2, y: 9, c: 'B' }, { x: 3, y: 8, c: 'B' }, { x: 4, y: 7, c: 'B' },
  { x: 5, y: 6, c: 'B' }, { x: 6, y: 5, c: 'B' }, { x: 7, y: 4, c: 'B' },
  { x: 8, y: 3, c: 'S' }, { x: 8, y: 1, c: 'S' }, { x: 8, y: 5, c: 'S' }, { x: 6, y: 3, c: 'S' }, { x: 10, y: 3, c: 'S' },
];
// tier2(搬運工的蠻力揮擊):火花多噴幾點。
const PM_ACTIVE1_T2: Mark[] = [{ x: 9, y: 1, c: 'S' }, { x: 9, y: 5, c: 'S' }, { x: 6, y: 1, c: 'S' }, { x: 10, y: 5, c: 'S' }];
// tier3(工地師傅的重擊):平行加一道線,刀鋒加粗一格。
const PM_ACTIVE1_T3: Mark[] = [
  { x: 1, y: 9, c: 'B' }, { x: 2, y: 8, c: 'B' }, { x: 3, y: 7, c: 'B' }, { x: 4, y: 6, c: 'B' },
  { x: 5, y: 5, c: 'B' }, { x: 6, y: 4, c: 'B' }, { x: 7, y: 3, c: 'B' },
];
// tier4(消防員的破壞衝擊):加一道殘影線。
const PM_ACTIVE1_T4: Mark[] = [{ x: 2, y: 10, c: 'B' }, { x: 3, y: 9, c: 'B' }, { x: 4, y: 8, c: 'B' }];
// tier5(特種部隊):火花整個變成放射狀爆發。
const PM_ACTIVE1_T5: Mark[] = [
  { x: 8, y: 0, c: 'S' }, { x: 8, y: 6, c: 'S' }, { x: 5, y: 3, c: 'S' }, { x: 11, y: 3, c: 'S' },
  { x: 6, y: 1, c: 'S' }, { x: 10, y: 1, c: 'S' }, { x: 6, y: 5, c: 'S' }, { x: 10, y: 5, c: 'S' },
];

// 連環出拳:兩個交錯的拳擊衝擊星,一前一後。
const PM_ACTIVE2: Mark[] = [
  { x: 2, y: 6, c: 'B' }, { x: 1, y: 5, c: 'S' }, { x: 3, y: 5, c: 'S' }, { x: 1, y: 7, c: 'S' }, { x: 3, y: 7, c: 'S' },
  { x: 8, y: 8, c: 'B' }, { x: 7, y: 7, c: 'S' }, { x: 9, y: 7, c: 'S' }, { x: 7, y: 9, c: 'S' }, { x: 9, y: 9, c: 'S' },
];
// tier2(搬運工):蠻力揮擊,兩拳外圍再炸開一圈拳風。
const PM_ACTIVE2_T2: Mark[] = [{ x: 0, y: 4, c: 'S' }, { x: 0, y: 8, c: 'S' }, { x: 10, y: 6, c: 'S' }, { x: 10, y: 10, c: 'S' }];
// tier3(簡化版):兩拳之間加一道連擊軌跡線。
const PM_ACTIVE2_T3: Mark[] = [{ x: 4, y: 6, c: 'B' }, { x: 5, y: 7, c: 'B' }, { x: 6, y: 8, c: 'B' }];
// tier4(消防員):破壞衝擊,命中點加密更猛烈。
const PM_ACTIVE2_T4: Mark[] = [{ x: 3, y: 6, c: 'B' }, { x: 7, y: 8, c: 'B' }, { x: 2, y: 8, c: 'S' }, { x: 8, y: 6, c: 'S' }];
// tier5(簡化版):外圍鍍金描邊。
const PM_ACTIVE2_T5: Mark[] = outline(1, 5, 9, 9, 'B');

// 順手清點庫存:清單框 + 三條打勾記號。
const PM_ACTIVE3: Mark[] = [
  ...rect(2, 1, 9, 10, 'K'), ...rect(3, 2, 8, 9, 'B'),
  { x: 4, y: 4, c: 'S' }, { x: 5, y: 5, c: 'S' }, { x: 4, y: 6, c: 'S' }, { x: 5, y: 7, c: 'S' }, { x: 4, y: 8, c: 'S' },
];
// tier2(搬運工):清單夾上一支筆,隨手就能記。
const PM_ACTIVE3_T2: Mark[] = [{ x: 5, y: 0, c: 'K' }, { x: 6, y: 0, c: 'K' }];
// tier3(簡化版):多加一條打勾記號(清點更仔細)。
const PM_ACTIVE3_T3: Mark[] = [{ x: 5, y: 9, c: 'S' }];
// tier4(消防員):側邊夾上警示標籤,清點更嚴謹。
const PM_ACTIVE3_T4: Mark[] = [{ x: 9, y: 4, c: 'S' }, { x: 9, y: 5, c: 'S' }, { x: 10, y: 4, c: 'S' }, { x: 10, y: 5, c: 'S' }];
// tier5(簡化版):右下角蓋上金色驗收章。
const PM_ACTIVE3_T5: Mark[] = [{ x: 7, y: 8, c: 'S' }, { x: 8, y: 8, c: 'S' }, { x: 7, y: 9, c: 'S' }, { x: 8, y: 9, c: 'S' }];

// 扎實的一天:太陽剪影,外圈放射光芒。
const PM_ACTIVE4: Mark[] = [
  ...rect(4, 4, 7, 7, 'S'),
  { x: 5, y: 1, c: 'B' }, { x: 6, y: 1, c: 'B' }, { x: 5, y: 10, c: 'B' }, { x: 6, y: 10, c: 'B' },
  { x: 1, y: 5, c: 'B' }, { x: 1, y: 6, c: 'B' }, { x: 10, y: 5, c: 'B' }, { x: 10, y: 6, c: 'B' },
  { x: 2, y: 2, c: 'B' }, { x: 9, y: 2, c: 'B' }, { x: 2, y: 9, c: 'B' }, { x: 9, y: 9, c: 'B' },
];
// tier2(搬運工):光芒更靠近核心,先補齊對角半程的光點。
const PM_ACTIVE4_T2: Mark[] = [{ x: 3, y: 3, c: 'B' }, { x: 8, y: 3, c: 'B' }, { x: 3, y: 8, c: 'B' }, { x: 8, y: 8, c: 'B' }];
// tier3(簡化版):光芒更密,補上缺口的短射線。
const PM_ACTIVE4_T3: Mark[] = [
  { x: 3, y: 1, c: 'B' }, { x: 8, y: 1, c: 'B' }, { x: 3, y: 10, c: 'B' }, { x: 8, y: 10, c: 'B' },
  { x: 1, y: 3, c: 'B' }, { x: 1, y: 8, c: 'B' }, { x: 10, y: 3, c: 'B' }, { x: 10, y: 8, c: 'B' },
];
// tier4(消防員):光芒衝出畫布邊緣,扎實的一天燒得更旺。
const PM_ACTIVE4_T4: Mark[] = [
  { x: 5, y: 0, c: 'B' }, { x: 6, y: 0, c: 'B' }, { x: 5, y: 11, c: 'B' }, { x: 6, y: 11, c: 'B' },
  { x: 0, y: 5, c: 'B' }, { x: 0, y: 6, c: 'B' }, { x: 11, y: 5, c: 'B' }, { x: 11, y: 6, c: 'B' },
];
// tier5(簡化版):太陽核心變大更旺。
const PM_ACTIVE4_T5: Mark[] = [
  { x: 4, y: 3, c: 'S' }, { x: 5, y: 3, c: 'S' }, { x: 6, y: 3, c: 'S' }, { x: 7, y: 3, c: 'S' },
  { x: 4, y: 8, c: 'S' }, { x: 5, y: 8, c: 'S' }, { x: 6, y: 8, c: 'S' }, { x: 7, y: 8, c: 'S' },
];

// ===== physicalRanged(外送/跑單風味,身分軌跡:外送員→計程車司機→警察→職業獵人→狙擊手)=====

// 抄近路練出的直覺:彎折捷徑路線圖。
const PR_PASSIVE1: Mark[] = [
  { x: 1, y: 9, c: 'A' }, { x: 2, y: 9, c: 'A' }, { x: 3, y: 9, c: 'A' }, { x: 3, y: 8, c: 'A' }, { x: 3, y: 7, c: 'A' },
  { x: 4, y: 6, c: 'A' }, { x: 5, y: 5, c: 'A' }, { x: 6, y: 4, c: 'A' }, { x: 7, y: 3, c: 'A' },
  { x: 8, y: 2, c: 'S' }, { x: 9, y: 2, c: 'S' }, { x: 8, y: 1, c: 'S' },
];
// tier2(計程車司機):多一條岔路,代表路線更複雜也更熟。
const PR_PASSIVE1_T2: Mark[] = [{ x: 2, y: 7, c: 'A' }, { x: 2, y: 6, c: 'A' }, { x: 3, y: 6, c: 'A' }];
// tier3(警察):巡邏路線加寬,主線旁加一條平行線。
const PR_PASSIVE1_T3: Mark[] = [{ x: 1, y: 10, c: 'A' }, { x: 2, y: 10, c: 'A' }, { x: 3, y: 10, c: 'A' }, { x: 3, y: 9, c: 'A' }];
// tier4(職業獵人):路線終點加個獵物標記。
const PR_PASSIVE1_T4: Mark[] = [{ x: 9, y: 4, c: 'A' }, { x: 10, y: 4, c: 'A' }];
// tier5(狙擊手):整條路線加金色瞄準光點。
const PR_PASSIVE1_T5: Mark[] = [{ x: 3, y: 9, c: 'S' }, { x: 5, y: 5, c: 'S' }, { x: 7, y: 3, c: 'S' }];

// 跑單跑出的效率:碼表剪影(圓框 + 指針)。
const PR_PASSIVE2: Mark[] = [
  ...rect(3, 3, 8, 8, 'A'), { x: 5, y: 1, c: 'A' }, { x: 6, y: 1, c: 'A' },
  { x: 5, y: 5, c: 'S' }, { x: 6, y: 4, c: 'S' }, { x: 7, y: 4, c: 'S' },
];
// tier2(計程車司機):錶面加刻度標記,跑單算得更細。
const PR_PASSIVE2_T2: Mark[] = [{ x: 3, y: 5, c: 'S' }, { x: 8, y: 5, c: 'S' }, { x: 5, y: 8, c: 'S' }, { x: 6, y: 8, c: 'S' }];
// tier3(簡化版):多一支指針,計時更精準。
const PR_PASSIVE2_T3: Mark[] = [{ x: 4, y: 6, c: 'S' }, { x: 4, y: 7, c: 'S' }];
// tier4(職業獵人):四角加防震護角,野外也耐用。
const PR_PASSIVE2_T4: Mark[] = [{ x: 2, y: 2, c: 'A' }, { x: 9, y: 2, c: 'A' }, { x: 2, y: 9, c: 'A' }, { x: 9, y: 9, c: 'A' }];
// tier5(簡化版):錶框鍍上金色鉻邊。
const PR_PASSIVE2_T5: Mark[] = outline(3, 3, 8, 8, 'S');

// 連續多重射擊(維持原設計):三支箭矢錯開角度飛出。
const PR_ACTIVE1: Mark[] = [
  { x: 5, y: 2, c: 'A' }, { x: 3, y: 1, c: 'A' }, { x: 3, y: 3, c: 'A' }, { x: 4, y: 2, c: 'A' },
  { x: 7, y: 5, c: 'A' }, { x: 5, y: 4, c: 'A' }, { x: 5, y: 6, c: 'A' }, { x: 6, y: 5, c: 'A' },
  { x: 9, y: 8, c: 'A' }, { x: 7, y: 7, c: 'A' }, { x: 7, y: 9, c: 'A' }, { x: 8, y: 8, c: 'A' },
];
// tier2(計程車司機):箭尾點燃火花尾焰。
const PR_ACTIVE1_T2: Mark[] = [{ x: 3, y: 1, c: 'S' }, { x: 5, y: 4, c: 'S' }, { x: 7, y: 7, c: 'S' }];
// tier3(警察):每支箭再延伸一格,射程更遠。
const PR_ACTIVE1_T3: Mark[] = [{ x: 6, y: 1, c: 'A' }, { x: 8, y: 4, c: 'A' }, { x: 10, y: 7, c: 'A' }];
// tier4(職業獵人):新增第四支箭。
const PR_ACTIVE1_T4: Mark[] = [{ x: 1, y: 0, c: 'A' }, { x: 0, y: 1, c: 'A' }, { x: 2, y: 1, c: 'A' }, { x: 1, y: 2, c: 'A' }];
// tier5(狙擊手):所有箭頭鍍金,一擊必殺的光澤。
const PR_ACTIVE1_T5: Mark[] = [{ x: 5, y: 2, c: 'S' }, { x: 7, y: 5, c: 'S' }, { x: 9, y: 8, c: 'S' }, { x: 1, y: 0, c: 'S' }, { x: 0, y: 2, c: 'S' }];

// 順路多接一單:外送箱剪影(方箱 + 頂部提把)。
const PR_ACTIVE2: Mark[] = [...rect(2, 4, 9, 9, 'A'), { x: 4, y: 2, c: 'S' }, { x: 4, y: 3, c: 'S' }, { x: 7, y: 2, c: 'S' }, { x: 7, y: 3, c: 'S' }];
// tier2(計程車司機):箱面貼上導航貼紙,順路多接一單。
const PR_ACTIVE2_T2: Mark[] = [{ x: 5, y: 6, c: 'S' }, { x: 6, y: 6, c: 'S' }, { x: 5, y: 7, c: 'S' }, { x: 6, y: 7, c: 'S' }];
// tier3(簡化版):提把之間加一根橫桿,變成手推車等級的裝備。
const PR_ACTIVE2_T3: Mark[] = [{ x: 4, y: 1, c: 'A' }, { x: 5, y: 1, c: 'A' }, { x: 6, y: 1, c: 'A' }, { x: 7, y: 1, c: 'A' }];
// tier4(職業獵人):箱底加一條防滑履帶,扛重物穿越野地。
const PR_ACTIVE2_T4: Mark[] = [
  { x: 2, y: 10, c: 'A' }, { x: 3, y: 10, c: 'A' }, { x: 4, y: 10, c: 'A' }, { x: 5, y: 10, c: 'A' },
  { x: 6, y: 10, c: 'A' }, { x: 7, y: 10, c: 'A' }, { x: 8, y: 10, c: 'A' }, { x: 9, y: 10, c: 'A' },
];
// tier5(簡化版):箱體鍍金描邊。
const PR_ACTIVE2_T5: Mark[] = outline(2, 4, 9, 9, 'S');

// 熟門熟路:地圖釘剪影(圓頭 + 尖端)。
const PR_ACTIVE3: Mark[] = [
  ...rect(4, 1, 7, 4, 'A'), { x: 5, y: 5, c: 'A' }, { x: 6, y: 5, c: 'A' },
  { x: 5, y: 6, c: 'S' }, { x: 6, y: 7, c: 'S' }, { x: 5, y: 8, c: 'S' },
];
// tier2(計程車司機):多記一條巷弄捷徑。
const PR_ACTIVE3_T2: Mark[] = [{ x: 2, y: 7, c: 'A' }, { x: 2, y: 8, c: 'A' }];
// tier3(簡化版):多一根小地標,認識的地點更多。
const PR_ACTIVE3_T3: Mark[] = [{ x: 9, y: 2, c: 'A' }, { x: 9, y: 3, c: 'A' }];
// tier4(職業獵人):地標下方多兩個獵物足跡。
const PR_ACTIVE3_T4: Mark[] = [{ x: 4, y: 9, c: 'S' }, { x: 7, y: 9, c: 'S' }, { x: 4, y: 10, c: 'S' }, { x: 7, y: 10, c: 'S' }];
// tier5(簡化版):主釘頭外圈加金色光環。
const PR_ACTIVE3_T5: Mark[] = outline(3, 0, 8, 5, 'S');

// 精準一擊:同心圓靶心。
const PR_ACTIVE4: Mark[] = [
  ...rect(1, 1, 10, 10, 'A').filter((m) => m.x === 1 || m.x === 10 || m.y === 1 || m.y === 10),
  ...rect(3, 3, 8, 8, 'A').filter((m) => m.x === 3 || m.x === 8 || m.y === 3 || m.y === 8),
  { x: 5, y: 5, c: 'S' }, { x: 6, y: 5, c: 'S' }, { x: 5, y: 6, c: 'S' }, { x: 6, y: 6, c: 'S' },
];
// tier2(計程車司機):外圈補上刻度標記,瞄準更有依據。
const PR_ACTIVE4_T2: Mark[] = [{ x: 0, y: 5, c: 'A' }, { x: 0, y: 6, c: 'A' }, { x: 11, y: 5, c: 'A' }, { x: 11, y: 6, c: 'A' }];
// tier3(簡化版):加一圈中間環,更精密的分數帶。
const PR_ACTIVE4_T3: Mark[] = outline(2, 2, 9, 9, 'A');
// tier4(職業獵人):上下加準星刻度,鎖定範圍更精準。
const PR_ACTIVE4_T4: Mark[] = [{ x: 5, y: 0, c: 'S' }, { x: 6, y: 0, c: 'S' }, { x: 5, y: 11, c: 'S' }, { x: 6, y: 11, c: 'S' }];
// tier5(簡化版):靶心整個放大。
const PR_ACTIVE4_T5: Mark[] = [{ x: 4, y: 4, c: 'S' }, { x: 7, y: 4, c: 'S' }, { x: 4, y: 7, c: 'S' }, { x: 7, y: 7, c: 'S' }];

// ===== physicalSupport(超商店員風味,身分軌跡:超商店員→餐廳服務生→護理師→健身教練→急診室王牌)=====

// 站櫃練出的觀察力:杏眼剪影 + 瞳孔。
const PS_PASSIVE1: Mark[] = [
  { x: 2, y: 5, c: 'R' }, { x: 3, y: 4, c: 'R' }, { x: 4, y: 4, c: 'R' }, { x: 7, y: 4, c: 'R' }, { x: 8, y: 4, c: 'R' }, { x: 9, y: 5, c: 'R' },
  { x: 3, y: 6, c: 'R' }, { x: 4, y: 7, c: 'R' }, { x: 7, y: 7, c: 'R' }, { x: 8, y: 6, c: 'R' },
  { x: 5, y: 5, c: 'H' }, { x: 6, y: 5, c: 'H' }, { x: 5, y: 6, c: 'H' }, { x: 6, y: 6, c: 'H' },
];
// tier2(餐廳服務生):加一條眉線,神情更專注。
const PS_PASSIVE1_T2: Mark[] = [{ x: 4, y: 3, c: 'R' }, { x: 5, y: 3, c: 'R' }, { x: 6, y: 3, c: 'R' }, { x: 7, y: 3, c: 'R' }];
// tier3(護理師):眼角拉長,觀察範圍更廣。
const PS_PASSIVE1_T3: Mark[] = [{ x: 1, y: 5, c: 'R' }, { x: 10, y: 5, c: 'R' }];
// tier4(健身教練):眼下加專注紋,判讀更精準。
const PS_PASSIVE1_T4: Mark[] = [{ x: 4, y: 8, c: 'H' }, { x: 7, y: 8, c: 'H' }];
// tier5(急診室王牌):四方射出洞察光芒,一眼看穿全場。
const PS_PASSIVE1_T5: Mark[] = [{ x: 5, y: 1, c: 'R' }, { x: 6, y: 1, c: 'R' }, { x: 5, y: 9, c: 'R' }, { x: 6, y: 9, c: 'R' }, { x: 0, y: 5, c: 'R' }, { x: 11, y: 5, c: 'R' }];

// 會員點數精算術:3x3 點數網格。
const PS_PASSIVE2: Mark[] = [
  { x: 3, y: 3, c: 'R' }, { x: 6, y: 3, c: 'R' }, { x: 9, y: 3, c: 'R' },
  { x: 3, y: 6, c: 'R' }, { x: 6, y: 6, c: 'R' }, { x: 9, y: 6, c: 'R' },
  { x: 3, y: 9, c: 'R' }, { x: 6, y: 9, c: 'R' }, { x: 9, y: 9, c: 'R' },
];
// tier2(餐廳服務生):中間欄補上點數,算得更勤快。
const PS_PASSIVE2_T2: Mark[] = [{ x: 6, y: 4, c: 'R' }, { x: 6, y: 5, c: 'R' }, { x: 6, y: 7, c: 'R' }, { x: 6, y: 8, c: 'R' }];
// tier3(簡化版):點數之間連線,算得更細。
const PS_PASSIVE2_T3: Mark[] = [{ x: 4, y: 6, c: 'R' }, { x: 5, y: 6, c: 'R' }, { x: 7, y: 6, c: 'R' }, { x: 8, y: 6, c: 'R' }];
// tier4(健身教練):中心點外圈加會員星標。
const PS_PASSIVE2_T4: Mark[] = [{ x: 5, y: 5, c: 'R' }, { x: 7, y: 5, c: 'R' }, { x: 5, y: 7, c: 'R' }, { x: 7, y: 7, c: 'R' }];
// tier5(簡化版):整張表格鍍金外框。
const PS_PASSIVE2_T5: Mark[] = outline(3, 3, 9, 9, 'R');

// 治療光環(維持原設計):外圈光環 + 中心十字。
const PS_ACTIVE1: Mark[] = [
  { x: 5, y: 1, c: 'R' }, { x: 6, y: 1, c: 'R' }, { x: 3, y: 2, c: 'R' }, { x: 8, y: 2, c: 'R' },
  { x: 2, y: 3, c: 'R' }, { x: 9, y: 3, c: 'R' }, { x: 1, y: 4, c: 'R' }, { x: 10, y: 4, c: 'R' },
  { x: 1, y: 5, c: 'R' }, { x: 10, y: 5, c: 'R' }, { x: 1, y: 6, c: 'R' }, { x: 10, y: 6, c: 'R' },
  { x: 2, y: 7, c: 'R' }, { x: 9, y: 7, c: 'R' }, { x: 3, y: 8, c: 'R' }, { x: 8, y: 8, c: 'R' },
  { x: 5, y: 9, c: 'R' }, { x: 6, y: 9, c: 'R' },
  { x: 5, y: 4, c: 'H' }, { x: 6, y: 4, c: 'H' }, { x: 5, y: 5, c: 'H' }, { x: 6, y: 5, c: 'H' },
  { x: 5, y: 6, c: 'H' }, { x: 6, y: 6, c: 'H' }, { x: 3, y: 5, c: 'H' }, { x: 4, y: 5, c: 'H' },
  { x: 7, y: 5, c: 'H' }, { x: 8, y: 5, c: 'H' },
];
// tier2(餐廳服務生):補滿光環間隙,環更完整。
const PS_ACTIVE1_T2: Mark[] = [{ x: 4, y: 2, c: 'R' }, { x: 7, y: 2, c: 'R' }, { x: 4, y: 8, c: 'R' }, { x: 7, y: 8, c: 'R' }];
// tier3(護理師):十字加粗,治療更扎實。
const PS_ACTIVE1_T3: Mark[] = [{ x: 4, y: 4, c: 'H' }, { x: 7, y: 4, c: 'H' }, { x: 4, y: 6, c: 'H' }, { x: 7, y: 6, c: 'H' }];
// tier4(健身教練):加一圈外環,範圍更大。
const PS_ACTIVE1_T4: Mark[] = outline(0, 0, 11, 11, 'R');
// tier5(急診室王牌):四角綻放最終光芒。
const PS_ACTIVE1_T5: Mark[] = [{ x: 0, y: 0, c: 'H' }, { x: 11, y: 0, c: 'H' }, { x: 0, y: 11, c: 'H' }, { x: 11, y: 11, c: 'H' }];

// 貼心的叮嚀:對話框剪影 + 尾巴。
const PS_ACTIVE2: Mark[] = [...rect(1, 1, 10, 6, 'R'), { x: 3, y: 7, c: 'R' }, { x: 4, y: 8, c: 'R' }, { x: 4, y: 3, c: 'H' }, { x: 5, y: 3, c: 'H' }, { x: 6, y: 3, c: 'H' }, { x: 7, y: 3, c: 'H' }];
// tier2(餐廳服務生):多補一句貼心話,先寫兩個字。
const PS_ACTIVE2_T2: Mark[] = [{ x: 4, y: 4, c: 'H' }, { x: 7, y: 4, c: 'H' }];
// tier3(簡化版):再加一行文字,叮嚀更仔細。
const PS_ACTIVE2_T3: Mark[] = [{ x: 4, y: 5, c: 'H' }, { x: 5, y: 5, c: 'H' }, { x: 6, y: 5, c: 'H' }, { x: 7, y: 5, c: 'H' }];
// tier4(健身教練):對話框尾巴加大,叮嚀範圍更廣。
const PS_ACTIVE2_T4: Mark[] = [{ x: 2, y: 7, c: 'R' }, { x: 2, y: 8, c: 'R' }];
// tier5(簡化版):對話框發光鑲邊。
const PS_ACTIVE2_T5: Mark[] = outline(1, 1, 10, 6, 'H');

// 速戰速決:閃電剪影。
const PS_ACTIVE3: Mark[] = [
  { x: 6, y: 1, c: 'R' }, { x: 5, y: 2, c: 'R' }, { x: 4, y: 3, c: 'R' }, { x: 3, y: 4, c: 'R' }, { x: 5, y: 4, c: 'R' },
  { x: 4, y: 5, c: 'R' }, { x: 3, y: 6, c: 'R' }, { x: 2, y: 7, c: 'R' }, { x: 1, y: 8, c: 'R' },
  { x: 6, y: 5, c: 'H' }, { x: 7, y: 6, c: 'H' },
];
// tier2(餐廳服務生):出手更快,補上起手跟收尾的速度線。
const PS_ACTIVE3_T2: Mark[] = [{ x: 7, y: 0, c: 'R' }, { x: 0, y: 9, c: 'R' }];
// tier3(簡化版):第二道閃電並行劈下。
const PS_ACTIVE3_T3: Mark[] = [
  { x: 9, y: 1, c: 'R' }, { x: 8, y: 2, c: 'R' }, { x: 7, y: 3, c: 'R' }, { x: 6, y: 4, c: 'R' }, { x: 8, y: 4, c: 'R' },
  { x: 7, y: 5, c: 'R' }, { x: 6, y: 6, c: 'R' }, { x: 5, y: 7, c: 'R' }, { x: 4, y: 8, c: 'R' },
];
// tier4(健身教練):兩道閃電之間搭起能量橋接,雙重速戰速決。
const PS_ACTIVE3_T4: Mark[] = [{ x: 5, y: 3, c: 'H' }, { x: 6, y: 3, c: 'H' }];
// tier5(簡化版):兩道閃電都補上尾端火花。
const PS_ACTIVE3_T5: Mark[] = [{ x: 1, y: 4, c: 'H' }, { x: 8, y: 7, c: 'H' }];

// 雙倍關懷:兩顆愛心並排。
const PS_ACTIVE4: Mark[] = [
  { x: 2, y: 3, c: 'R' }, { x: 3, y: 2, c: 'R' }, { x: 4, y: 3, c: 'R' }, { x: 3, y: 4, c: 'R' }, { x: 3, y: 5, c: 'R' },
  { x: 7, y: 3, c: 'H' }, { x: 8, y: 2, c: 'H' }, { x: 9, y: 3, c: 'H' }, { x: 8, y: 4, c: 'H' }, { x: 8, y: 5, c: 'H' },
];
// tier2(餐廳服務生):兩顆心之間先冒出一絲暖意。
const PS_ACTIVE4_T2: Mark[] = [{ x: 5, y: 3, c: 'R' }, { x: 6, y: 3, c: 'H' }];
// tier3(簡化版):愛心變厚實。
const PS_ACTIVE4_T3: Mark[] = [{ x: 2, y: 2, c: 'R' }, { x: 4, y: 2, c: 'R' }, { x: 7, y: 2, c: 'H' }, { x: 9, y: 2, c: 'H' }];
// tier4(健身教練):兩顆心底部加強化紋,關懷更扎實。
const PS_ACTIVE4_T4: Mark[] = [{ x: 3, y: 6, c: 'R' }, { x: 8, y: 6, c: 'H' }];
// tier5(簡化版):兩顆心角上都冒出小火花。
const PS_ACTIVE4_T5: Mark[] = [{ x: 1, y: 2, c: 'R' }, { x: 1, y: 3, c: 'R' }, { x: 10, y: 2, c: 'H' }, { x: 10, y: 3, c: 'H' }];

// ===== magicMelee(修煉/廟宇風味,身分軌跡:中二國中生→阿志→道士/法師→命理師→得道仙人)=====

// 修煉日常:蓮花/火焰剪影。
const MM_PASSIVE1: Mark[] = [
  { x: 5, y: 1, c: 'M' }, { x: 6, y: 1, c: 'M' }, { x: 4, y: 2, c: 'M' }, { x: 7, y: 2, c: 'M' },
  { x: 3, y: 3, c: 'M' }, { x: 8, y: 3, c: 'M' }, { x: 2, y: 4, c: 'M' }, { x: 9, y: 4, c: 'M' },
  { x: 2, y: 5, c: 'M' }, { x: 9, y: 5, c: 'M' }, ...rect(3, 6, 8, 7, 'M'),
];
// tier2(阿志):火焰頂端拉高一節。
const MM_PASSIVE1_T2: Mark[] = [{ x: 5, y: 0, c: 'M' }, { x: 6, y: 0, c: 'M' }];
// tier3(道士/法師):兩側加分岔火苗。
const MM_PASSIVE1_T3: Mark[] = [{ x: 1, y: 3, c: 'M' }, { x: 10, y: 3, c: 'M' }];
// tier4(命理師):火焰底座加寬,修為更扎實。
const MM_PASSIVE1_T4: Mark[] = [{ x: 1, y: 7, c: 'M' }, { x: 10, y: 7, c: 'M' }];
// tier5(得道仙人):遠端飄出兩簇小火星,已臻化境。
const MM_PASSIVE1_T5: Mark[] = [{ x: 3, y: 1, c: 'M' }, { x: 8, y: 1, c: 'M' }, { x: 0, y: 4, c: 'M' }, { x: 11, y: 4, c: 'M' }];

// 香油錢緣分:銅錢剪影(圓框 + 方孔)。
const MM_PASSIVE2: Mark[] = [
  ...rect(3, 3, 8, 8, 'W').filter((m) => m.x === 3 || m.x === 8 || m.y === 3 || m.y === 8),
  { x: 5, y: 5, c: 'W' }, { x: 6, y: 5, c: 'W' }, { x: 5, y: 6, c: 'W' }, { x: 6, y: 6, c: 'W' },
];
// tier2(阿志):銅錢緣分更旺,旁邊多串一枚小錢。
const MM_PASSIVE2_T2: Mark[] = [{ x: 9, y: 9, c: 'W' }, { x: 10, y: 9, c: 'W' }, { x: 9, y: 10, c: 'W' }, { x: 10, y: 10, c: 'W' }];
// tier3(簡化版):銅錢紋路加細節。
const MM_PASSIVE2_T3: Mark[] = [{ x: 4, y: 4, c: 'W' }, { x: 7, y: 4, c: 'W' }, { x: 4, y: 7, c: 'W' }, { x: 7, y: 7, c: 'W' }];
// tier4(命理師):銅錢刻上八卦紋,緣分算得更準。
const MM_PASSIVE2_T4: Mark[] = [{ x: 4, y: 6, c: 'W' }, { x: 7, y: 6, c: 'W' }];
// tier5(簡化版):再加一圈外環,銅錢升級成大錢。
const MM_PASSIVE2_T5: Mark[] = outline(2, 2, 9, 9, 'W');

// 能量爆發斬(維持原設計):斜劈刀鋒(魔法色) + 四方向大星爆。
const MM_ACTIVE1: Mark[] = [
  { x: 1, y: 10, c: 'M' }, { x: 2, y: 9, c: 'M' }, { x: 3, y: 8, c: 'M' }, { x: 4, y: 7, c: 'M' },
  { x: 5, y: 6, c: 'M' }, { x: 6, y: 5, c: 'M' }, { x: 7, y: 4, c: 'M' },
  { x: 8, y: 3, c: 'W' }, { x: 8, y: 1, c: 'W' }, { x: 8, y: 5, c: 'W' }, { x: 6, y: 3, c: 'W' }, { x: 10, y: 3, c: 'W' },
  { x: 7, y: 2, c: 'W' }, { x: 9, y: 2, c: 'W' }, { x: 7, y: 4, c: 'W' }, { x: 9, y: 4, c: 'W' },
];
// tier2(阿志):爆發星芒補滿間隙。
const MM_ACTIVE1_T2: Mark[] = [{ x: 7, y: 1, c: 'W' }, { x: 9, y: 1, c: 'W' }, { x: 7, y: 5, c: 'W' }, { x: 9, y: 5, c: 'W' }];
// tier3(道士/法師):刀鋒加粗一格。
const MM_ACTIVE1_T3: Mark[] = [
  { x: 1, y: 9, c: 'M' }, { x: 2, y: 8, c: 'M' }, { x: 3, y: 7, c: 'M' }, { x: 4, y: 6, c: 'M' },
  { x: 5, y: 5, c: 'M' }, { x: 6, y: 4, c: 'M' }, { x: 7, y: 3, c: 'M' },
];
// tier4(命理師):加一道殘影。
const MM_ACTIVE1_T4: Mark[] = [{ x: 2, y: 10, c: 'M' }, { x: 3, y: 9, c: 'M' }, { x: 4, y: 8, c: 'M' }];
// tier5(得道仙人):星爆再往外擴散一圈。
const MM_ACTIVE1_T5: Mark[] = [{ x: 8, y: 0, c: 'W' }, { x: 8, y: 6, c: 'W' }, { x: 5, y: 3, c: 'W' }, { x: 11, y: 3, c: 'W' }];

// 連環符咒:兩張直立符紙,交錯排列。
const MM_ACTIVE2: Mark[] = [...rect(1, 2, 4, 9, 'M'), ...rect(6, 1, 9, 8, 'M'), { x: 2, y: 4, c: 'W' }, { x: 3, y: 6, c: 'W' }, { x: 7, y: 3, c: 'W' }, { x: 8, y: 5, c: 'W' }];
// tier2(阿志):符紙上多畫一道符文。
const MM_ACTIVE2_T2: Mark[] = [{ x: 3, y: 3, c: 'W' }, { x: 8, y: 7, c: 'W' }];
// tier3(簡化版):第三張符紙補在旁邊。
const MM_ACTIVE2_T3: Mark[] = [{ x: 10, y: 4, c: 'M' }, { x: 10, y: 5, c: 'M' }, { x: 10, y: 6, c: 'M' }, { x: 10, y: 7, c: 'M' }, { x: 10, y: 8, c: 'M' }];
// tier4(命理師):符紙封口綁上紅繩結。
const MM_ACTIVE2_T4: Mark[] = [{ x: 2, y: 1, c: 'W' }, { x: 3, y: 1, c: 'W' }, { x: 7, y: 0, c: 'W' }, { x: 8, y: 0, c: 'W' }];
// tier5(簡化版):符紙描上金邊,法力更純熟。
const MM_ACTIVE2_T5: Mark[] = outline(1, 2, 4, 9, 'W');

// 收驚順便收紅包:紅包袋剪影 + 金色封印點。
const MM_ACTIVE3: Mark[] = [...rect(2, 2, 9, 9, 'M'), { x: 5, y: 5, c: 'W' }, { x: 6, y: 5, c: 'W' }, { x: 5, y: 6, c: 'W' }, { x: 6, y: 6, c: 'W' }];
// tier2(阿志):紅包袋角落貼春字。
const MM_ACTIVE3_T2: Mark[] = [{ x: 3, y: 3, c: 'W' }, { x: 8, y: 3, c: 'W' }];
// tier3(簡化版):封印上再加吉祥紋樣。
const MM_ACTIVE3_T3: Mark[] = [{ x: 5, y: 3, c: 'W' }, { x: 6, y: 3, c: 'W' }, { x: 5, y: 8, c: 'W' }, { x: 6, y: 8, c: 'W' }];
// tier4(命理師):紅包袋燙金雙喜圖樣。
const MM_ACTIVE3_T4: Mark[] = [{ x: 3, y: 8, c: 'W' }, { x: 8, y: 8, c: 'W' }];
// tier5(簡化版):紅包整袋鍍金描邊。
const MM_ACTIVE3_T5: Mark[] = outline(2, 2, 9, 9, 'W');

// 頓悟時刻:光環爆發(圓心 + 放射短線)。
const MM_ACTIVE4: Mark[] = [
  ...rect(4, 4, 7, 7, 'W'),
  { x: 5, y: 1, c: 'M' }, { x: 6, y: 1, c: 'M' }, { x: 5, y: 10, c: 'M' }, { x: 6, y: 10, c: 'M' },
  { x: 1, y: 5, c: 'M' }, { x: 1, y: 6, c: 'M' }, { x: 10, y: 5, c: 'M' }, { x: 10, y: 6, c: 'M' },
  { x: 2, y: 2, c: 'M' }, { x: 9, y: 2, c: 'M' }, { x: 2, y: 9, c: 'M' }, { x: 9, y: 9, c: 'M' },
];
// tier2(阿志):光芒更近核心,先補齊對角半程的光點。
const MM_ACTIVE4_T2: Mark[] = [{ x: 3, y: 3, c: 'M' }, { x: 8, y: 3, c: 'M' }, { x: 3, y: 8, c: 'M' }, { x: 8, y: 8, c: 'M' }];
// tier3(簡化版):射線補滿間隙,頓悟更透徹。
const MM_ACTIVE4_T3: Mark[] = [
  { x: 3, y: 1, c: 'M' }, { x: 8, y: 1, c: 'M' }, { x: 3, y: 10, c: 'M' }, { x: 8, y: 10, c: 'M' },
  { x: 1, y: 3, c: 'M' }, { x: 1, y: 8, c: 'M' }, { x: 10, y: 3, c: 'M' }, { x: 10, y: 8, c: 'M' },
];
// tier4(命理師):光芒衝出畫布邊緣,頓悟已臻化境。
const MM_ACTIVE4_T4: Mark[] = [
  { x: 5, y: 0, c: 'M' }, { x: 6, y: 0, c: 'M' }, { x: 5, y: 11, c: 'M' }, { x: 6, y: 11, c: 'M' },
  { x: 0, y: 5, c: 'M' }, { x: 0, y: 6, c: 'M' }, { x: 11, y: 5, c: 'M' }, { x: 11, y: 6, c: 'M' },
];
// tier5(簡化版):圓心光核擴大。
const MM_ACTIVE4_T5: Mark[] = [
  { x: 4, y: 3, c: 'W' }, { x: 5, y: 3, c: 'W' }, { x: 6, y: 3, c: 'W' }, { x: 7, y: 3, c: 'W' },
  { x: 4, y: 8, c: 'W' }, { x: 5, y: 8, c: 'W' }, { x: 6, y: 8, c: 'W' }, { x: 7, y: 8, c: 'W' },
];

// ===== magicRanged(工程師風味,身分軌跡:電競選手/實況主→軟體工程師→研究員→駭客→AI天才工程師)=====

// 肝出來的手感:鍵盤剪影(小方格陣列)。
const MR_PASSIVE1: Mark[] = [
  ...rect(1, 4, 10, 8, 'O'),
  { x: 2, y: 5, c: 'K' }, { x: 4, y: 5, c: 'K' }, { x: 6, y: 5, c: 'K' }, { x: 8, y: 5, c: 'K' },
  { x: 2, y: 7, c: 'K' }, { x: 4, y: 7, c: 'K' }, { x: 6, y: 7, c: 'K' }, { x: 8, y: 7, c: 'K' },
];
// tier2(軟體工程師):中間補一排按鍵,手速更快。
const MR_PASSIVE1_T2: Mark[] = [{ x: 2, y: 6, c: 'K' }, { x: 4, y: 6, c: 'K' }, { x: 6, y: 6, c: 'K' }, { x: 8, y: 6, c: 'K' }];
// tier3(研究員/科學家):加一台小螢幕。
const MR_PASSIVE1_T3: Mark[] = rect(3, 1, 8, 3, 'O');
// tier4(駭客):再加一台副螢幕,雙螢幕作業。
const MR_PASSIVE1_T4: Mark[] = rect(9, 1, 10, 3, 'O');
// tier5(AI天才工程師):整組設備鍍上電競光邊。
const MR_PASSIVE1_T5: Mark[] = outline(0, 3, 11, 9, 'O');

// 接案眼光:放大鏡剪影。
const MR_PASSIVE2: Mark[] = [
  ...rect(2, 2, 6, 6, 'O').filter((m) => m.x === 2 || m.x === 6 || m.y === 2 || m.y === 6),
  { x: 7, y: 7, c: 'O' }, { x: 8, y: 8, c: 'O' }, { x: 9, y: 9, c: 'O' },
];
// tier2(軟體工程師):多看一眼細節,鏡片先冒出一點反光。
const MR_PASSIVE2_T2: Mark[] = [{ x: 5, y: 4, c: 'O' }, { x: 3, y: 5, c: 'O' }];
// tier3(簡化版):鏡片加反光細節。
const MR_PASSIVE2_T3: Mark[] = [{ x: 3, y: 3, c: 'O' }, { x: 4, y: 3, c: 'O' }];
// tier4(駭客):鏡片加一道數位掃描線。
const MR_PASSIVE2_T4: Mark[] = [{ x: 3, y: 4, c: 'O' }, { x: 4, y: 4, c: 'O' }];
// tier5(簡化版):鏡框外圍再加一圈,視野更廣。
const MR_PASSIVE2_T5: Mark[] = [{ x: 1, y: 4, c: 'O' }, { x: 7, y: 4, c: 'O' }, { x: 4, y: 1, c: 'O' }, { x: 4, y: 7, c: 'O' }];

// 法術齊射(維持原設計):三顆魔法彈由左上往右下墜落。
const MR_ACTIVE1: Mark[] = [
  { x: 2, y: 1, c: 'O' }, { x: 3, y: 1, c: 'O' }, { x: 2, y: 2, c: 'O' }, { x: 3, y: 2, c: 'O' }, { x: 1, y: 0, c: 'O' },
  { x: 5, y: 4, c: 'O' }, { x: 6, y: 4, c: 'O' }, { x: 5, y: 5, c: 'O' }, { x: 6, y: 5, c: 'O' }, { x: 4, y: 3, c: 'O' },
  { x: 8, y: 7, c: 'O' }, { x: 9, y: 7, c: 'O' }, { x: 8, y: 8, c: 'O' }, { x: 9, y: 8, c: 'O' }, { x: 7, y: 6, c: 'O' },
];
// tier2(軟體工程師):每顆彈加尾焰軌跡。
const MR_ACTIVE1_T2: Mark[] = [{ x: 1, y: 0, c: 'K' }, { x: 4, y: 3, c: 'K' }, { x: 7, y: 6, c: 'K' }];
// tier3(研究員/科學家):彈體加大一圈,法力更強。
const MR_ACTIVE1_T3: Mark[] = [{ x: 4, y: 1, c: 'O' }, { x: 7, y: 4, c: 'O' }, { x: 10, y: 7, c: 'O' }];
// tier4(駭客):新增第四顆彈幕。
const MR_ACTIVE1_T4: Mark[] = [{ x: 10, y: 0, c: 'O' }, { x: 11, y: 0, c: 'O' }, { x: 10, y: 1, c: 'O' }, { x: 11, y: 1, c: 'O' }];
// tier5(AI天才工程師):落點延伸,轟炸範圍更廣。
const MR_ACTIVE1_T5: Mark[] = [{ x: 3, y: 3, c: 'O' }, { x: 6, y: 6, c: 'O' }, { x: 9, y: 9, c: 'O' }];

// 業配置入:標籤牌剪影(五邊形 + 孔洞)。
const MR_ACTIVE2: Mark[] = [...rect(2, 3, 8, 8, 'O'), { x: 9, y: 4, c: 'O' }, { x: 10, y: 5, c: 'O' }, { x: 9, y: 6, c: 'O' }, { x: 3, y: 5, c: 'K' }];
// tier2(軟體工程師):標籤加QR碼小方塊,一掃就能接案。
const MR_ACTIVE2_T2: Mark[] = [{ x: 6, y: 5, c: 'K' }, { x: 7, y: 5, c: 'K' }, { x: 6, y: 6, c: 'K' }, { x: 7, y: 6, c: 'K' }];
// tier3(簡化版):孔洞加圈,吊掛更牢固。
const MR_ACTIVE2_T3: Mark[] = [{ x: 3, y: 6, c: 'K' }, { x: 4, y: 6, c: 'K' }];
// tier4(駭客):標籤牌加一條加密條碼。
const MR_ACTIVE2_T4: Mark[] = [{ x: 5, y: 4, c: 'K' }, { x: 5, y: 5, c: 'K' }, { x: 5, y: 6, c: 'K' }, { x: 5, y: 7, c: 'K' }];
// tier5(簡化版):標籤牌鍍上深色描邊。
const MR_ACTIVE2_T5: Mark[] = outline(2, 3, 8, 8, 'K');

// 熬夜肝出的心得:咖啡杯剪影 + 蒸氣。
const MR_ACTIVE3: Mark[] = [
  ...rect(3, 5, 8, 9, 'O'), { x: 9, y: 6, c: 'O' }, { x: 10, y: 6, c: 'O' }, { x: 10, y: 7, c: 'O' },
  { x: 4, y: 3, c: 'K' }, { x: 4, y: 4, c: 'K' }, { x: 7, y: 2, c: 'K' }, { x: 7, y: 3, c: 'K' },
];
// tier2(軟體工程師):多續一杯,側邊冒出第三道蒸氣。
const MR_ACTIVE3_T2: Mark[] = [{ x: 9, y: 3, c: 'K' }, { x: 9, y: 4, c: 'K' }];
// tier3(簡化版):蒸氣加密,熬更多夜。
const MR_ACTIVE3_T3: Mark[] = [{ x: 5, y: 3, c: 'K' }, { x: 5, y: 4, c: 'K' }, { x: 6, y: 2, c: 'K' }, { x: 6, y: 3, c: 'K' }];
// tier4(駭客):杯身貼上一小條程式碼貼紙。
const MR_ACTIVE3_T4: Mark[] = [{ x: 4, y: 7, c: 'K' }, { x: 5, y: 7, c: 'K' }];
// tier5(簡化版):杯緣加金屬光澤邊。
const MR_ACTIVE3_T5: Mark[] = [{ x: 3, y: 4, c: 'O' }, { x: 4, y: 4, c: 'O' }, { x: 5, y: 4, c: 'O' }, { x: 6, y: 4, c: 'O' }, { x: 7, y: 4, c: 'O' }, { x: 8, y: 4, c: 'O' }];

// 一鍵神操作:單一按鍵剪影 + 中心圓點。
const MR_ACTIVE4: Mark[] = [...rect(3, 3, 8, 8, 'O'), { x: 5, y: 5, c: 'K' }, { x: 6, y: 5, c: 'K' }, { x: 5, y: 6, c: 'K' }, { x: 6, y: 6, c: 'K' }];
// tier2(軟體工程師):按鍵加一顆LED狀態燈。
const MR_ACTIVE4_T2: Mark[] = [{ x: 5, y: 4, c: 'K' }, { x: 6, y: 4, c: 'K' }];
// tier3(簡化版):按鍵四角加標記細節。
const MR_ACTIVE4_T3: Mark[] = [{ x: 4, y: 4, c: 'K' }, { x: 7, y: 4, c: 'K' }, { x: 4, y: 7, c: 'K' }, { x: 7, y: 7, c: 'K' }];
// tier4(駭客):按鍵刻上快捷符號。
const MR_ACTIVE4_T4: Mark[] = [{ x: 5, y: 7, c: 'K' }, { x: 6, y: 7, c: 'K' }];
// tier5(簡化版):按鍵外圈鍍上機械鍵帽邊框。
const MR_ACTIVE4_T5: Mark[] = outline(3, 3, 8, 8, 'K');

// ===== magicSupport(醫護風味,身分軌跡:藥師→醫生→心理諮商師→老中醫→神醫/華佗再世)=====

// 臨床經驗:聽診器剪影(彎管 + 圓頭)。
const MS_PASSIVE1: Mark[] = [
  { x: 2, y: 1, c: 'G' }, { x: 2, y: 2, c: 'G' }, { x: 2, y: 3, c: 'G' }, { x: 3, y: 4, c: 'G' }, { x: 4, y: 5, c: 'G' },
  { x: 5, y: 5, c: 'G' }, { x: 6, y: 5, c: 'G' }, { x: 7, y: 4, c: 'G' }, { x: 8, y: 3, c: 'G' }, { x: 8, y: 2, c: 'G' }, { x: 8, y: 1, c: 'G' },
  ...rect(7, 6, 9, 8, 'G').filter((m) => m.x === 7 || m.x === 9 || m.y === 6 || m.y === 8),
];
// tier2(醫生):加上耳掛頭,裝備更專業。
const MS_PASSIVE1_T2: Mark[] = [{ x: 1, y: 0, c: 'G' }, { x: 3, y: 0, c: 'G' }];
// tier3(心理諮商師):胸件加內圈細節。
const MS_PASSIVE1_T3: Mark[] = [{ x: 8, y: 7, c: 'G' }];
// tier4(老中醫):管線加一條平行導管,經驗更老道。
const MS_PASSIVE1_T4: Mark[] = [{ x: 3, y: 1, c: 'G' }, { x: 3, y: 2, c: 'G' }, { x: 3, y: 3, c: 'G' }, { x: 4, y: 4, c: 'G' }, { x: 5, y: 4, c: 'G' }];
// tier5(神醫/華佗再世):整組聽診器鍍金框。
const MS_PASSIVE1_T5: Mark[] = outline(1, 0, 9, 8, 'G');

// 診間人脈:病歷夾剪影(方框 + 三條橫線)。
const MS_PASSIVE2: Mark[] = [...rect(2, 1, 9, 10, 'G'), { x: 4, y: 3, c: 'P' }, { x: 5, y: 3, c: 'P' }, { x: 6, y: 3, c: 'P' }, { x: 4, y: 5, c: 'P' }, { x: 5, y: 5, c: 'P' }, { x: 4, y: 7, c: 'P' }, { x: 5, y: 7, c: 'P' }, { x: 6, y: 7, c: 'P' }];
// tier2(醫生):夾子多加一頁初診資料。
const MS_PASSIVE2_T2: Mark[] = [{ x: 4, y: 2, c: 'P' }, { x: 5, y: 2, c: 'P' }];
// tier3(簡化版):再加一行資料,人脈更廣。
const MS_PASSIVE2_T3: Mark[] = [{ x: 4, y: 9, c: 'P' }, { x: 5, y: 9, c: 'P' }, { x: 6, y: 9, c: 'P' }];
// tier4(老中醫):多加一行把脈紀錄,經驗更老道。
const MS_PASSIVE2_T4: Mark[] = [{ x: 4, y: 8, c: 'P' }, { x: 5, y: 8, c: 'P' }, { x: 6, y: 8, c: 'P' }];
// tier5(簡化版):病歷夾鍍上金邊。
const MS_PASSIVE2_T5: Mark[] = outline(2, 1, 9, 10, 'P');

// 增幅祝福(維持原設計):向上箭頭 + 兩側閃光。
const MS_ACTIVE1: Mark[] = [
  { x: 5, y: 9, c: 'G' }, { x: 5, y: 8, c: 'G' }, { x: 5, y: 7, c: 'G' }, { x: 5, y: 6, c: 'G' }, { x: 5, y: 5, c: 'G' },
  { x: 5, y: 3, c: 'G' }, { x: 4, y: 4, c: 'G' }, { x: 6, y: 4, c: 'G' }, { x: 3, y: 5, c: 'G' }, { x: 7, y: 5, c: 'G' },
  { x: 1, y: 2, c: 'P' }, { x: 2, y: 1, c: 'P' }, { x: 2, y: 3, c: 'P' }, { x: 3, y: 2, c: 'P' },
  { x: 9, y: 2, c: 'P' }, { x: 10, y: 1, c: 'P' }, { x: 10, y: 3, c: 'P' }, { x: 8, y: 2, c: 'P' },
];
// tier2(醫生):兩側閃光再加外圈,祝福更強。
const MS_ACTIVE1_T2: Mark[] = [{ x: 0, y: 2, c: 'P' }, { x: 11, y: 2, c: 'P' }];
// tier3(心理諮商師):箭頭再往上延伸,祝福更高遠。
const MS_ACTIVE1_T3: Mark[] = [{ x: 5, y: 2, c: 'G' }, { x: 5, y: 1, c: 'G' }];
// tier4(老中醫):加第二支側邊箭頭,雙重加持。
const MS_ACTIVE1_T4: Mark[] = [{ x: 2, y: 7, c: 'G' }, { x: 2, y: 6, c: 'G' }, { x: 2, y: 5, c: 'G' }, { x: 2, y: 4, c: 'G' }];
// tier5(神醫/華佗再世):四角綻放最終祝福光芒。
const MS_ACTIVE1_T5: Mark[] = [{ x: 0, y: 0, c: 'P' }, { x: 11, y: 0, c: 'P' }, { x: 0, y: 11, c: 'P' }, { x: 11, y: 11, c: 'P' }];

// 衛教叮嚀:對話框剪影 + 十字。
const MS_ACTIVE2: Mark[] = [...rect(1, 1, 10, 6, 'G'), { x: 3, y: 7, c: 'G' }, { x: 4, y: 8, c: 'G' }, { x: 5, y: 3, c: 'P' }, { x: 5, y: 4, c: 'P' }, { x: 4, y: 3, c: 'P' }, { x: 6, y: 3, c: 'P' }];
// tier2(醫生):多補一句醫囑。
const MS_ACTIVE2_T2: Mark[] = [{ x: 5, y: 5, c: 'P' }, { x: 6, y: 5, c: 'P' }];
// tier3(簡化版):再加一個小十字,叮嚀更仔細。
const MS_ACTIVE2_T3: Mark[] = [{ x: 8, y: 3, c: 'P' }, { x: 8, y: 4, c: 'P' }, { x: 7, y: 3, c: 'P' }, { x: 9, y: 3, c: 'P' }];
// tier4(老中醫):再加一個小十字,經驗更老道。
const MS_ACTIVE2_T4: Mark[] = [{ x: 2, y: 4, c: 'P' }, { x: 1, y: 4, c: 'P' }, { x: 3, y: 4, c: 'P' }, { x: 2, y: 5, c: 'P' }];
// tier5(簡化版):對話框發光鑲邊。
const MS_ACTIVE2_T5: Mark[] = outline(1, 1, 10, 6, 'P');

// 藥到病除:膠囊剪影(兩色分半)。
const MS_ACTIVE3: Mark[] = [...rect(1, 4, 5, 7, 'G'), ...rect(6, 4, 10, 7, 'P')];
// tier2(醫生):膠囊下緣先冒出一點光澤。
const MS_ACTIVE3_T2: Mark[] = [{ x: 3, y: 6, c: 'P' }, { x: 8, y: 6, c: 'G' }];
// tier3(簡化版):膠囊兩側加光澤線(異色反光,呼應藥師練出的辨色直覺)。
const MS_ACTIVE3_T3: Mark[] = [{ x: 2, y: 5, c: 'P' }, { x: 3, y: 5, c: 'P' }, { x: 7, y: 5, c: 'G' }, { x: 8, y: 5, c: 'G' }];
// tier4(老中醫):膠囊接縫蓋上古法配方印記。
const MS_ACTIVE3_T4: Mark[] = [{ x: 5, y: 4, c: 'P' }, { x: 6, y: 4, c: 'G' }];
// tier5(簡化版):膠囊外殼鍍上一圈鏡面邊。
const MS_ACTIVE3_T5: Mark[] = outline(1, 4, 10, 7, 'G');

// 雙倍療效:兩個十字並排。
const MS_ACTIVE4: Mark[] = [
  { x: 2, y: 1, c: 'G' }, { x: 2, y: 2, c: 'G' }, { x: 2, y: 3, c: 'G' }, { x: 1, y: 2, c: 'G' }, { x: 3, y: 2, c: 'G' },
  { x: 8, y: 5, c: 'P' }, { x: 8, y: 6, c: 'P' }, { x: 8, y: 7, c: 'P' }, { x: 7, y: 6, c: 'P' }, { x: 9, y: 6, c: 'P' },
];
// tier2(醫生):十字外圈加對角強化點,描邊更清楚。
const MS_ACTIVE4_T2: Mark[] = [{ x: 1, y: 1, c: 'G' }, { x: 3, y: 3, c: 'G' }, { x: 7, y: 5, c: 'P' }, { x: 9, y: 7, c: 'P' }];
// tier3(簡化版):十字臂各延伸一格,療效更強。
const MS_ACTIVE4_T3: Mark[] = [{ x: 2, y: 0, c: 'G' }, { x: 2, y: 4, c: 'G' }, { x: 8, y: 4, c: 'P' }, { x: 8, y: 8, c: 'P' }];
// tier4(老中醫):兩個十字之間搭起藥氣橋樑。
const MS_ACTIVE4_T4: Mark[] = [{ x: 4, y: 3, c: 'G' }, { x: 5, y: 4, c: 'P' }];
// tier5(簡化版):兩個十字旁都冒出療癒光點。
const MS_ACTIVE4_T5: Mark[] = [{ x: 0, y: 2, c: 'G' }, { x: 4, y: 2, c: 'G' }, { x: 6, y: 6, c: 'P' }, { x: 10, y: 6, c: 'P' }];

type EvolutionTier = Exclude<JobTier, 1>;

interface SkillIconSpec {
  marks: Mark[];
  palette: Record<string, string>;
  // 每一階(2/3/4/5)相對於前一階「新增」的 Mark,套用時由 tier2 開始累加到目前階級——
  // 呼應職業樹敘述「每階都是精進版身分」的邏輯,不是隨便加裝飾點。36 格(6職業x6格)
  // 全部都補齊 tier2~5 完整四階增量,每一階跟前一階的 frame(形狀)都不同。
  evolution?: Partial<Record<EvolutionTier, Mark[]>>;
}

const SKILL_ICON_SPECS: Record<Archetype, Record<SkillSlotId, SkillIconSpec>> = {
  physicalMelee: {
    passive1: {
      marks: PM_PASSIVE1,
      palette: { B: PHYSICAL_COLOR, K: '#3a3542' },
      evolution: { 2: PM_PASSIVE1_T2, 3: PM_PASSIVE1_T3, 4: PM_PASSIVE1_T4, 5: PM_PASSIVE1_T5 },
    },
    passive2: {
      marks: PM_PASSIVE2,
      palette: { B: PHYSICAL_COLOR, K: '#3a3542' },
      evolution: { 2: PM_PASSIVE2_T2, 3: PM_PASSIVE2_T3, 4: PM_PASSIVE2_T4, 5: PM_PASSIVE2_T5 },
    },
    passive3: {
      marks: HEART_PASSIVE3,
      palette: { H: HEAL_COLOR },
    },
    active1: {
      marks: PM_ACTIVE1,
      palette: { B: PHYSICAL_COLOR, S: SPARK_COLOR },
      evolution: { 2: PM_ACTIVE1_T2, 3: PM_ACTIVE1_T3, 4: PM_ACTIVE1_T4, 5: PM_ACTIVE1_T5 },
    },
    active2: {
      marks: PM_ACTIVE2,
      palette: { B: PHYSICAL_COLOR, S: SPARK_COLOR },
      evolution: { 2: PM_ACTIVE2_T2, 3: PM_ACTIVE2_T3, 4: PM_ACTIVE2_T4, 5: PM_ACTIVE2_T5 },
    },
    active3: {
      marks: PM_ACTIVE3,
      palette: { K: '#3a3542', B: PHYSICAL_COLOR, S: SPARK_COLOR },
      evolution: { 2: PM_ACTIVE3_T2, 3: PM_ACTIVE3_T3, 4: PM_ACTIVE3_T4, 5: PM_ACTIVE3_T5 },
    },
    active4: {
      marks: PM_ACTIVE4,
      palette: { S: SPARK_COLOR, B: PHYSICAL_COLOR },
      evolution: { 2: PM_ACTIVE4_T2, 3: PM_ACTIVE4_T3, 4: PM_ACTIVE4_T4, 5: PM_ACTIVE4_T5 },
    },
  },
  physicalRanged: {
    passive1: {
      marks: PR_PASSIVE1,
      palette: { A: PHYSICAL_COLOR, S: SPARK_COLOR },
      evolution: { 2: PR_PASSIVE1_T2, 3: PR_PASSIVE1_T3, 4: PR_PASSIVE1_T4, 5: PR_PASSIVE1_T5 },
    },
    passive2: {
      marks: PR_PASSIVE2,
      palette: { A: PHYSICAL_COLOR, S: SPARK_COLOR },
      evolution: { 2: PR_PASSIVE2_T2, 3: PR_PASSIVE2_T3, 4: PR_PASSIVE2_T4, 5: PR_PASSIVE2_T5 },
    },
    passive3: {
      marks: HEART_PASSIVE3,
      palette: { H: HEAL_COLOR },
    },
    active1: {
      marks: PR_ACTIVE1,
      palette: { A: PHYSICAL_COLOR },
      evolution: { 2: PR_ACTIVE1_T2, 3: PR_ACTIVE1_T3, 4: PR_ACTIVE1_T4, 5: PR_ACTIVE1_T5 },
    },
    active2: {
      marks: PR_ACTIVE2,
      palette: { A: PHYSICAL_COLOR, S: SPARK_COLOR },
      evolution: { 2: PR_ACTIVE2_T2, 3: PR_ACTIVE2_T3, 4: PR_ACTIVE2_T4, 5: PR_ACTIVE2_T5 },
    },
    active3: {
      marks: PR_ACTIVE3,
      palette: { A: PHYSICAL_COLOR, S: SPARK_COLOR },
      evolution: { 2: PR_ACTIVE3_T2, 3: PR_ACTIVE3_T3, 4: PR_ACTIVE3_T4, 5: PR_ACTIVE3_T5 },
    },
    active4: {
      marks: PR_ACTIVE4,
      palette: { A: PHYSICAL_COLOR, S: SPARK_COLOR },
      evolution: { 2: PR_ACTIVE4_T2, 3: PR_ACTIVE4_T3, 4: PR_ACTIVE4_T4, 5: PR_ACTIVE4_T5 },
    },
  },
  physicalSupport: {
    passive1: {
      marks: PS_PASSIVE1,
      palette: { R: PHYSICAL_COLOR, H: HEAL_COLOR },
      evolution: { 2: PS_PASSIVE1_T2, 3: PS_PASSIVE1_T3, 4: PS_PASSIVE1_T4, 5: PS_PASSIVE1_T5 },
    },
    passive2: {
      marks: PS_PASSIVE2,
      palette: { R: PHYSICAL_COLOR },
      evolution: { 2: PS_PASSIVE2_T2, 3: PS_PASSIVE2_T3, 4: PS_PASSIVE2_T4, 5: PS_PASSIVE2_T5 },
    },
    passive3: {
      marks: HEART_PASSIVE3,
      palette: { H: HEAL_COLOR },
    },
    active1: {
      marks: PS_ACTIVE1,
      palette: { R: PHYSICAL_COLOR, H: HEAL_COLOR },
      evolution: { 2: PS_ACTIVE1_T2, 3: PS_ACTIVE1_T3, 4: PS_ACTIVE1_T4, 5: PS_ACTIVE1_T5 },
    },
    active2: {
      marks: PS_ACTIVE2,
      palette: { R: PHYSICAL_COLOR, H: HEAL_COLOR },
      evolution: { 2: PS_ACTIVE2_T2, 3: PS_ACTIVE2_T3, 4: PS_ACTIVE2_T4, 5: PS_ACTIVE2_T5 },
    },
    active3: {
      marks: PS_ACTIVE3,
      palette: { R: PHYSICAL_COLOR, H: HEAL_COLOR },
      evolution: { 2: PS_ACTIVE3_T2, 3: PS_ACTIVE3_T3, 4: PS_ACTIVE3_T4, 5: PS_ACTIVE3_T5 },
    },
    active4: {
      marks: PS_ACTIVE4,
      palette: { R: PHYSICAL_COLOR, H: HEAL_COLOR },
      evolution: { 2: PS_ACTIVE4_T2, 3: PS_ACTIVE4_T3, 4: PS_ACTIVE4_T4, 5: PS_ACTIVE4_T5 },
    },
  },
  magicMelee: {
    passive1: {
      marks: MM_PASSIVE1,
      palette: { M: MAGIC_COLOR },
      evolution: { 2: MM_PASSIVE1_T2, 3: MM_PASSIVE1_T3, 4: MM_PASSIVE1_T4, 5: MM_PASSIVE1_T5 },
    },
    passive2: {
      marks: MM_PASSIVE2,
      palette: { W: STAR_COLOR },
      evolution: { 2: MM_PASSIVE2_T2, 3: MM_PASSIVE2_T3, 4: MM_PASSIVE2_T4, 5: MM_PASSIVE2_T5 },
    },
    passive3: {
      marks: HEART_PASSIVE3,
      palette: { H: HEAL_COLOR },
    },
    active1: {
      marks: MM_ACTIVE1,
      palette: { M: MAGIC_COLOR, W: STAR_COLOR },
      evolution: { 2: MM_ACTIVE1_T2, 3: MM_ACTIVE1_T3, 4: MM_ACTIVE1_T4, 5: MM_ACTIVE1_T5 },
    },
    active2: {
      marks: MM_ACTIVE2,
      palette: { M: MAGIC_COLOR, W: STAR_COLOR },
      evolution: { 2: MM_ACTIVE2_T2, 3: MM_ACTIVE2_T3, 4: MM_ACTIVE2_T4, 5: MM_ACTIVE2_T5 },
    },
    active3: {
      marks: MM_ACTIVE3,
      palette: { M: MAGIC_COLOR, W: STAR_COLOR },
      evolution: { 2: MM_ACTIVE3_T2, 3: MM_ACTIVE3_T3, 4: MM_ACTIVE3_T4, 5: MM_ACTIVE3_T5 },
    },
    active4: {
      marks: MM_ACTIVE4,
      palette: { M: MAGIC_COLOR, W: STAR_COLOR },
      evolution: { 2: MM_ACTIVE4_T2, 3: MM_ACTIVE4_T3, 4: MM_ACTIVE4_T4, 5: MM_ACTIVE4_T5 },
    },
  },
  magicRanged: {
    passive1: {
      marks: MR_PASSIVE1,
      palette: { O: RANGED_MAGIC_COLOR, K: '#3a3542' },
      evolution: { 2: MR_PASSIVE1_T2, 3: MR_PASSIVE1_T3, 4: MR_PASSIVE1_T4, 5: MR_PASSIVE1_T5 },
    },
    passive2: {
      marks: MR_PASSIVE2,
      palette: { O: RANGED_MAGIC_COLOR },
      evolution: { 2: MR_PASSIVE2_T2, 3: MR_PASSIVE2_T3, 4: MR_PASSIVE2_T4, 5: MR_PASSIVE2_T5 },
    },
    passive3: {
      marks: HEART_PASSIVE3,
      palette: { H: HEAL_COLOR },
    },
    active1: {
      marks: MR_ACTIVE1,
      palette: { O: RANGED_MAGIC_COLOR, K: '#3a3542' },
      evolution: { 2: MR_ACTIVE1_T2, 3: MR_ACTIVE1_T3, 4: MR_ACTIVE1_T4, 5: MR_ACTIVE1_T5 },
    },
    active2: {
      marks: MR_ACTIVE2,
      palette: { O: RANGED_MAGIC_COLOR, K: '#3a3542' },
      evolution: { 2: MR_ACTIVE2_T2, 3: MR_ACTIVE2_T3, 4: MR_ACTIVE2_T4, 5: MR_ACTIVE2_T5 },
    },
    active3: {
      marks: MR_ACTIVE3,
      palette: { O: RANGED_MAGIC_COLOR, K: '#3a3542' },
      evolution: { 2: MR_ACTIVE3_T2, 3: MR_ACTIVE3_T3, 4: MR_ACTIVE3_T4, 5: MR_ACTIVE3_T5 },
    },
    active4: {
      marks: MR_ACTIVE4,
      palette: { O: RANGED_MAGIC_COLOR, K: '#3a3542' },
      evolution: { 2: MR_ACTIVE4_T2, 3: MR_ACTIVE4_T3, 4: MR_ACTIVE4_T4, 5: MR_ACTIVE4_T5 },
    },
  },
  magicSupport: {
    passive1: {
      marks: MS_PASSIVE1,
      palette: { G: SUPPORT_MAGIC_COLOR },
      evolution: { 2: MS_PASSIVE1_T2, 3: MS_PASSIVE1_T3, 4: MS_PASSIVE1_T4, 5: MS_PASSIVE1_T5 },
    },
    passive2: {
      marks: MS_PASSIVE2,
      palette: { G: SUPPORT_MAGIC_COLOR, P: STAR_COLOR },
      evolution: { 2: MS_PASSIVE2_T2, 3: MS_PASSIVE2_T3, 4: MS_PASSIVE2_T4, 5: MS_PASSIVE2_T5 },
    },
    passive3: {
      marks: HEART_PASSIVE3,
      palette: { H: HEAL_COLOR },
    },
    active1: {
      marks: MS_ACTIVE1,
      palette: { G: SUPPORT_MAGIC_COLOR, P: STAR_COLOR },
      evolution: { 2: MS_ACTIVE1_T2, 3: MS_ACTIVE1_T3, 4: MS_ACTIVE1_T4, 5: MS_ACTIVE1_T5 },
    },
    active2: {
      marks: MS_ACTIVE2,
      palette: { G: SUPPORT_MAGIC_COLOR, P: STAR_COLOR },
      evolution: { 2: MS_ACTIVE2_T2, 3: MS_ACTIVE2_T3, 4: MS_ACTIVE2_T4, 5: MS_ACTIVE2_T5 },
    },
    active3: {
      marks: MS_ACTIVE3,
      palette: { G: SUPPORT_MAGIC_COLOR, P: STAR_COLOR },
      evolution: { 2: MS_ACTIVE3_T2, 3: MS_ACTIVE3_T3, 4: MS_ACTIVE3_T4, 5: MS_ACTIVE3_T5 },
    },
    active4: {
      marks: MS_ACTIVE4,
      palette: { G: SUPPORT_MAGIC_COLOR, P: STAR_COLOR },
      evolution: { 2: MS_ACTIVE4_T2, 3: MS_ACTIVE4_T3, 4: MS_ACTIVE4_T4, 5: MS_ACTIVE4_T5 },
    },
  },
};

export interface SkillIconData {
  frame: string[];
  palette: Record<string, string>;
}

// 技能等級對照 5 個視覺階段(呼應 skillSlotLevelCap 的 tier*60 分段)。呼叫端一律直接傳真正的
// JobTier(見 game/combat.ts 的 getCurrentTier),不再從技能等級數字反推——「這格技能長怎樣」
// 現在完全由「玩家轉職到第幾階」決定,跟這一格技能本身練到幾級是兩件事(等級數字另外顯示)。
function applyTierEvolution(spec: SkillIconSpec, tier: JobTier): Mark[] {
  if (tier === 1 || !spec.evolution) return spec.marks;
  let marks = spec.marks;
  for (let t = 2; t <= tier; t++) {
    const increment = spec.evolution[t as EvolutionTier];
    if (increment) marks = [...marks, ...increment];
  }
  return marks;
}

// ===== 顏色漸進工具:tier1 用原色,tier2 起逐階把每個 palette 顏色的飽和度/明度稍微推高,
// tier5 額外把整組顏色往金色(TIER_ACCENT_COLOR)混一點——不是只加一個新色鍵,是整組色票
// 都跟著精進,呼應「裝備/技藝隨階級升級」的要求。=====
const TIER_ACCENT_COLOR = '#f2d675';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function adjustHsl(hex: string, satDelta: number, liteDelta: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const ns = Math.max(0, Math.min(1, s + satDelta));
  const nl = Math.max(0, Math.min(1, l + liteDelta));
  const [nr, ng, nb] = hslToRgb(h, ns, nl);
  return rgbToHex(nr, ng, nb);
}

function mixHex(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

// 階2的飽和度/明度增量原本只有0.04/0.02,疊代形狀本身變化也很小(見 applyTierEvolution),
// 兩者加起來在實際顯示尺寸下幾乎看不出跟階1的差異——拉大整條階梯(尤其階2起跳的幅度),
// 讓「升階了、圖示真的不一樣」肉眼就分辨得出來,不用兩張並排比對才看得出。
const TIER_SAT_DELTA: Record<JobTier, number> = { 1: 0, 2: 0.09, 3: 0.15, 4: 0.22, 5: 0.28 };
const TIER_LITE_DELTA: Record<JobTier, number> = { 1: 0, 2: 0.05, 3: 0.08, 4: 0.11, 5: 0.14 };

function tierPalette(base: Record<string, string>, tier: JobTier): Record<string, string> {
  if (tier === 1) return base;
  const satDelta = TIER_SAT_DELTA[tier];
  const liteDelta = TIER_LITE_DELTA[tier];
  const result: Record<string, string> = {};
  for (const key of Object.keys(base)) {
    let color = adjustHsl(base[key], satDelta, liteDelta);
    if (tier === 5) color = mixHex(color, TIER_ACCENT_COLOR, 0.3);
    result[key] = color;
  }
  return result;
}

export function getSkillIcon(archetype: Archetype, slot: SkillSlotId, tier: JobTier): SkillIconData {
  const spec = SKILL_ICON_SPECS[archetype][slot];
  const marks = applyTierEvolution(spec, tier);
  const palette = tierPalette(spec.palette, tier);
  return { frame: buildFrame(marks), palette };
}

// ===== 學生格子的圖示(見 components/JobSelector.tsx 的 ArchetypeGrid):不屬於上面 6 職業 x
// 6格的體系,單獨一顆固定圖示,不分階級演變——畢業帽剪影(金色扣飾+流蘇,呼應「畢業」主題)。
const STUDENT_ICON_MARKS: Mark[] = [
  ...rect(1, 3, 10, 4, 'B'),
  { x: 5, y: 2, c: 'G' },
  { x: 6, y: 2, c: 'G' },
  ...rect(4, 5, 7, 7, 'H'),
  { x: 6, y: 5, c: 'G' },
  { x: 7, y: 6, c: 'G' },
  { x: 8, y: 7, c: 'G' },
  ...rect(8, 8, 9, 9, 'G'),
];

const STUDENT_ICON_PALETTE: Record<string, string> = { B: '#3a3542', H: PHYSICAL_COLOR, G: '#c9a94f' };

export function getStudentIcon(): SkillIconData {
  return { frame: buildFrame(STUDENT_ICON_MARKS), palette: STUDENT_ICON_PALETTE };
}
