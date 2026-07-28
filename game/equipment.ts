import { Archetype, getCurrentTier, getJobTitle, JobBranch, JobTier } from './combat';
import { MAX_LEVEL } from './leveling';
import {
  canCraftMaterialTier,
  craftMaterialTier,
  createEmptyTieredMaterialCounts,
  MaterialTier,
  TieredMaterialCounts,
} from './materials';

export type EquipmentSlot =
  | 'back'
  | 'bottom'
  | 'top'
  | 'belt'
  | 'headwear'
  | 'face'
  | 'gloves'
  | 'offhand'
  | 'mainhand';

export type EquipmentBonusStat = 'exp' | 'coins' | 'speed';

export interface EquipmentBonus {
  stat: EquipmentBonusStat;
  value: number;
}

export interface EquipmentItem {
  id: string;
  slot: EquipmentSlot;
  name: string;
  color: string;
  price: number;
  bonus: EquipmentBonus;
  twoHanded?: boolean;
  // undefined = 不限職業(起始/性別預設款);有值 = 職業鎖裝,只有該職業能裝備。
  archetype?: Archetype;
  // undefined = 不限分支(起始/學生款,或 tier1——兩分支尚未分岔,見 JOB_TITLES 的說明);
  // 有值 = 只有選了該分支的玩家能裝備,呼應 tier2 起 A/B 分支各自的職業身分。
  branch?: JobBranch;
  // undefined = 無等級限制;有值 = 要練到這個等級才能購買/裝備。
  requiredLevel?: number;
  // undefined = 不限等級檔(起始/性別預設款);有值 = 生成式目錄的等級檔編號(1-50),
  // 圖示產生器(equipmentIcons.ts/weapons.ts)拿這個數字疊加「等級檔標記」,讓3000款裝備
  // 都有可辨識的視覺差異,不用真的手繪3000張圖。
  bracket?: number;
}

// 每插槽固定一種加成類型(此插槽兩款只差數值),數值 = 百分比加成(0.02 = +2%):
// 免費款(-01)給小加成,付費款(-02)給大加成,呼應現有定價邏輯。
// back/bottom/face/mainhand = speed(縮短戰鬥時間);top/headwear/gloves = exp;belt/offhand = coins。
// 這 18 款不限職業、不限等級,主要作為起始裝備跟性別預設外觀(見 GENDER_DEFAULT_LOADOUT),
// 在下方生成式的職業鎖裝目錄開放之前(Lv10 起)先讓角色有基礎樣貌跟些微加成。
// 顏色刻意避開 HERO_PALETTE(K/H/S/T/D/B/P/O,見 heroSilhouette.ts)裡的每一個色碼——
// 舊版這裡直接複製了角色本體的顏色(例如亞麻上衣 #8b8698 精準對上角色上衣的 T 色),
// 疊上去等於跟身體本色完全相同,裝備看起來像沒穿一樣,是「吃色」最嚴重的一批。
const LEGACY_EQUIPMENT_ITEMS: EquipmentItem[] = [
  { id: 'back-01', slot: 'back', name: '素色披風', color: '#5a6a7a', price: 0, bonus: { stat: 'speed', value: 0.02 } },
  { id: 'back-02', slot: 'back', name: '厚重斗篷', color: '#4a3528', price: 60, bonus: { stat: 'speed', value: 0.05 } },
  { id: 'bottom-01', slot: 'bottom', name: '粗布長褲', color: '#8a7550', price: 0, bonus: { stat: 'speed', value: 0.02 } },
  { id: 'bottom-02', slot: 'bottom', name: '皮革護腿', color: '#6b4a30', price: 60, bonus: { stat: 'speed', value: 0.05 } },
  { id: 'top-01', slot: 'top', name: '亞麻上衣', color: '#d8c8a0', price: 0, bonus: { stat: 'exp', value: 0.02 } },
  { id: 'top-02', slot: 'top', name: '皮甲背心', color: '#7a4a2a', price: 60, bonus: { stat: 'exp', value: 0.05 } },
  { id: 'belt-01', slot: 'belt', name: '麻繩腰帶', color: '#c9a94f', price: 0, bonus: { stat: 'coins', value: 0.02 } },
  { id: 'belt-02', slot: 'belt', name: '鉚釘皮帶', color: '#9c8a3f', price: 60, bonus: { stat: 'coins', value: 0.05 } },
  { id: 'headwear-01', slot: 'headwear', name: '布帽', color: '#c8b088', price: 0, bonus: { stat: 'exp', value: 0.02 } },
  { id: 'headwear-02', slot: 'headwear', name: '鐵盔', color: '#6a7078', price: 60, bonus: { stat: 'exp', value: 0.05 } },
  { id: 'face-01', slot: 'face', name: '眼罩', color: '#1a1a1a', price: 0, bonus: { stat: 'speed', value: 0.02 } },
  { id: 'face-02', slot: 'face', name: '護目鏡', color: '#6ab0e0', price: 60, bonus: { stat: 'speed', value: 0.05 } },
  { id: 'gloves-01', slot: 'gloves', name: '布手套', color: '#c8b088', price: 0, bonus: { stat: 'exp', value: 0.02 } },
  { id: 'gloves-02', slot: 'gloves', name: '皮革手套', color: '#7a4a2a', price: 60, bonus: { stat: 'exp', value: 0.05 } },
  { id: 'offhand-01', slot: 'offhand', name: '木盾', color: '#8a6030', price: 0, bonus: { stat: 'coins', value: 0.02 } },
  { id: 'offhand-02', slot: 'offhand', name: '厚重書冊', color: '#b389e0', price: 60, bonus: { stat: 'coins', value: 0.05 } },
  { id: 'mainhand-01', slot: 'mainhand', name: '短劍', color: '#b8b8c0', price: 0, bonus: { stat: 'speed', value: 0.02 } },
  {
    id: 'mainhand-02',
    slot: 'mainhand',
    name: '雙手大劍',
    color: '#b8b8c0',
    price: 60,
    bonus: { stat: 'speed', value: 0.05 },
    twoHanded: true,
  },
];

// 「學生」期(Lv1-29,見 hasChosenJob)第二組專屬裝備,呼應「10級做一組,共兩組」的需求——
// 填補 Lv10~29 的空窗,不限職業(學生還沒選職業,故意不設 archetype)、不設 bracket(不是生成式
// 目錄的一員)。加成比 LEGACY_EQUIPMENT_ITEMS 的 -02 付費款(0.05)高一點,體現「升級了」的
// 成長感,但明顯低於職業鎖裝 bracket1(Lv30)的成長曲線起點(見 bracketBonusValue),
// 避免學生期裝備蓋過畢業後職業裝的定位。命名走「國高中生」口吻,不是 -02 那套上班族語彙。
export const STUDENT_TIER2_LEVEL = 10;
const STUDENT_TIER2_BONUS_VALUE = 0.06;

const STUDENT_TIER2_EQUIPMENT_ITEMS: EquipmentItem[] = [
  {
    id: 'back-student2',
    slot: 'back',
    name: '帆布後背包',
    color: '#4a7a6a',
    price: 45,
    bonus: { stat: 'speed', value: STUDENT_TIER2_BONUS_VALUE },
    requiredLevel: STUDENT_TIER2_LEVEL,
  },
  {
    id: 'bottom-student2',
    slot: 'bottom',
    name: '運動長褲',
    color: '#2a4a6a',
    price: 42,
    bonus: { stat: 'speed', value: STUDENT_TIER2_BONUS_VALUE },
    requiredLevel: STUDENT_TIER2_LEVEL,
  },
  {
    id: 'top-student2',
    slot: 'top',
    name: '班服外套',
    color: '#c94a3a',
    price: 48,
    bonus: { stat: 'exp', value: STUDENT_TIER2_BONUS_VALUE },
    requiredLevel: STUDENT_TIER2_LEVEL,
  },
  {
    id: 'belt-student2',
    slot: 'belt',
    name: '悠遊卡腰包',
    color: '#3aa070',
    price: 44,
    bonus: { stat: 'coins', value: STUDENT_TIER2_BONUS_VALUE },
    requiredLevel: STUDENT_TIER2_LEVEL,
  },
  {
    id: 'headwear-student2',
    slot: 'headwear',
    name: '鴨舌帽',
    color: '#e0a030',
    price: 40,
    bonus: { stat: 'exp', value: STUDENT_TIER2_BONUS_VALUE },
    requiredLevel: STUDENT_TIER2_LEVEL,
  },
  {
    id: 'face-student2',
    slot: 'face',
    name: '粗框眼鏡',
    color: '#2a2520',
    price: 46,
    bonus: { stat: 'speed', value: STUDENT_TIER2_BONUS_VALUE },
    requiredLevel: STUDENT_TIER2_LEVEL,
  },
  {
    id: 'gloves-student2',
    slot: 'gloves',
    name: '半指手套',
    color: '#8a6a4a',
    price: 43,
    bonus: { stat: 'exp', value: STUDENT_TIER2_BONUS_VALUE },
    requiredLevel: STUDENT_TIER2_LEVEL,
  },
  {
    id: 'offhand-student2',
    slot: 'offhand',
    name: '精裝課本',
    color: '#d4622a',
    price: 47,
    bonus: { stat: 'coins', value: STUDENT_TIER2_BONUS_VALUE },
    requiredLevel: STUDENT_TIER2_LEVEL,
  },
  {
    id: 'mainhand-student2-1h',
    slot: 'mainhand',
    name: '木劍(升級版)',
    color: '#a87840',
    price: 45,
    bonus: { stat: 'speed', value: STUDENT_TIER2_BONUS_VALUE },
    requiredLevel: STUDENT_TIER2_LEVEL,
  },
  {
    id: 'mainhand-student2-2h',
    slot: 'mainhand',
    name: '竹槍',
    color: '#8fae4a',
    price: 50,
    bonus: { stat: 'speed', value: STUDENT_TIER2_BONUS_VALUE },
    requiredLevel: STUDENT_TIER2_LEVEL,
    twoHanded: true,
  },
];

// ---- 職業鎖裝生成式目錄 ----
// 9 個槽位(主手拆成單手/雙手兩條線)各自 50 個等級檔(Lv10~500,每 10 等一檔) × 6 職業,
// 單一槽位剛好 300 款,主手單手 300 款 + 雙手 300 款。用生成而非手打,避免 3000 筆物件字面量。
const ARCHETYPES: Archetype[] = [
  'physicalMelee',
  'physicalRanged',
  'physicalSupport',
  'magicMelee',
  'magicRanged',
  'magicSupport',
];

const JOB_BRANCHES: JobBranch[] = ['A', 'B'];

const BRACKET_COUNT = 50;

// 裝備本身沒有獨立的稀有度標籤(平衡數值走 bracket 連續分佈,不是離散稀有度),但「已裝備」
// 的介面呈現借用參考UI設計圖的稀有度四色框(普通/稀有/史詩/傳說),把 bracket(1~50)切成
// 四等分對應四種顏色——純粹是視覺分級,不影響任何數值計算,沒有 bracket 的道具(Lv10~29
// 空窗期免費款)視覺上當作最低一級。
export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary';

const RARITY_BORDER_COLOR: Record<ItemRarity, string> = {
  common: '#8a8a95',
  rare: '#4a8de6',
  epic: '#a66bff',
  legendary: '#f2c15a',
};

export function getItemRarity(bracket: number | undefined): ItemRarity {
  if (bracket === undefined) return 'common';
  const t = (bracket - 1) / (BRACKET_COUNT - 1);
  if (t < 0.25) return 'common';
  if (t < 0.5) return 'rare';
  if (t < 0.75) return 'epic';
  return 'legendary';
}

export function getItemRarityColor(bracket: number | undefined): string {
  return RARITY_BORDER_COLOR[getItemRarity(bracket)];
}

// 同一階(title+baseNoun)裡的 10 個等級檔,原本只靠「·LvN」數字區分,加一個品質詞前綴
// 讓名稱本身也看得出差異,不用點進去看等級數字才知道差在哪。依 bracket 循環,不特別對齊
// 職業階級邊界(職業階級已經用 title 表現了,這裡純粹補等級檔顆粒度)。
const QUALITY_WORDS = ['簡易', '耐用', '精良', '強化', '特製', '稀有', '精銳', '大師', '傳說', '究極'];

function qualityWordForBracket(bracket: number): string {
  return QUALITY_WORDS[(bracket - 1) % QUALITY_WORDS.length];
}
// 職業鎖裝呼應「畢業才穿職業裝」的身分設定,從 Lv30(畢業,見 TIER_UNLOCK_LEVELS[1])才開始解鎖,
// 50 個等級檔(bracket 1~50)平均分佈在 Lv30~MAX_LEVEL 之間,bracket1=Lv30、bracket50=MAX_LEVEL。
const MIN_BRACKET_LEVEL = 30;
const MAX_BRACKET_LEVEL = MAX_LEVEL;

function bracketRequiredLevel(bracket: number): number {
  return Math.round(MIN_BRACKET_LEVEL + ((bracket - 1) * (MAX_BRACKET_LEVEL - MIN_BRACKET_LEVEL)) / (BRACKET_COUNT - 1));
}

// 前快後慢(對數收斂):bracket=1(Lv10)貼近舊制免費款的 2%,bracket=50(Lv500)收斂到上限 30%。
const MIN_BONUS = 0.02;
const MAX_BONUS = 0.3;

// log(bracket)/log(50) 讓 bracket=1 精準落在 0(=MIN_BONUS)、bracket=50 精準落在 1(=MAX_BONUS),
// 不會像 log(1+bracket) 那樣在 bracket=1 就已經吃掉一大截成長量。
function bracketBonusValue(bracket: number): number {
  const t = Math.log(bracket) / Math.log(BRACKET_COUNT);
  const raw = MIN_BONUS + t * (MAX_BONUS - MIN_BONUS);
  return Math.round(raw * 1000) / 1000;
}

// 雙手武器犧牲副手格,單件加成用倍率補償,呼應「雙手武器賭大加成」的取捨。
const TWO_HANDED_BONUS_MULTIPLIER = 1.8;
const TWO_HANDED_PRICE_MULTIPLIER = 1.6;

const PRICE_BASE = 20;
const PRICE_EXPONENT = 1.6;

function bracketPrice(bracket: number): number {
  return Math.round(PRICE_BASE * Math.pow(bracket, PRICE_EXPONENT));
}

const SLOT_STAT: Record<EquipmentSlot, EquipmentBonusStat> = {
  back: 'speed',
  bottom: 'speed',
  face: 'speed',
  mainhand: 'speed',
  top: 'exp',
  headwear: 'exp',
  gloves: 'exp',
  belt: 'coins',
  offhand: 'coins',
};

// 每個職業的裝備名稱都對應「該轉職階段」現實中真的會用到的物品,不是整條 50 檔共用一個詞。
// 5 階對應 game/combat.ts JOB_TITLES 分支 A 的 5 個現實身分,裝備跟著身分換,例如
// physicalMelee 從「工讀生」的棉紗手套換到「特種部隊」的戰術手套,不是同一款東西穿到底。
type SlotNounsByTier = Record<JobTier, Partial<Record<EquipmentSlot, string>>>;

const SLOT_BASE_NOUN_BY_ARCHETYPE_TIER: Record<Archetype, SlotNounsByTier> = {
  // 工讀生 → 搬運工 → 工地師傅 → 消防員 → 特種部隊
  physicalMelee: {
    1: {
      back: '工作背帶',
      bottom: '工作褲',
      top: '反光背心',
      belt: '工具腰帶',
      headwear: '工地安全帽',
      face: '防塵口罩',
      gloves: '棉紗手套',
      offhand: '工具箱',
    },
    2: {
      back: '搬運護腰帶',
      bottom: '耐磨工作褲',
      top: '搬運背心',
      belt: '貨物固定帶',
      headwear: '針織帽',
      face: '防塵面罩',
      gloves: '防滑手套',
      offhand: '手推車',
    },
    3: {
      back: '工程背心',
      bottom: '工程長褲',
      top: '反光工程外套',
      belt: '電工腰帶',
      headwear: 'ABS 安全帽',
      face: '焊接面罩',
      gloves: '皮革工作手套',
      offhand: '對講機',
    },
    4: {
      back: '消防氧氣瓶',
      bottom: '防火褲',
      top: '消防衣',
      belt: '消防安全帶',
      headwear: '消防頭盔',
      face: '防毒面具',
      gloves: '消防手套',
      offhand: '滅火器',
    },
    5: {
      back: '戰術背包',
      bottom: '戰術長褲',
      top: '防彈背心',
      belt: '戰術腰帶',
      headwear: '戰術頭盔',
      face: '夜視鏡',
      gloves: '戰術手套',
      offhand: '閃光彈',
    },
  },
  // 外送員 → 計程車司機 → 警察 → 職業獵人 → 狙擊手
  physicalRanged: {
    1: {
      back: '外送保溫箱',
      bottom: '機車雨褲',
      top: '反光外送背心',
      belt: '證件腰包',
      headwear: '全罩安全帽',
      face: '防風鏡',
      gloves: '騎士手套',
      offhand: '對講機',
    },
    2: {
      back: '計程車座椅靠枕',
      bottom: '司機長褲',
      top: '計程車制服',
      belt: '零錢腰包',
      headwear: '司機帽',
      face: '太陽眼鏡',
      gloves: '排檔手套',
      offhand: '導航機',
    },
    3: {
      back: '警用背包',
      bottom: '警用長褲',
      top: '警用制服',
      belt: '警用勤務帶',
      headwear: '警帽',
      face: '防彈面罩',
      gloves: '防刺手套',
      offhand: '警用無線電',
    },
    4: {
      back: '獵人背包',
      bottom: '迷彩長褲',
      top: '迷彩獵裝',
      belt: '彈藥腰帶',
      headwear: '迷彩帽',
      face: '偽裝面罩',
      gloves: '狩獵手套',
      offhand: '誘鳥笛',
    },
    5: {
      back: '狙擊背包',
      bottom: '吉利服褲',
      top: '吉利服',
      belt: '彈匣腰帶',
      headwear: '狙擊頭套',
      face: '測距鏡',
      gloves: '狙擊手套',
      offhand: '風速計',
    },
  },
  // 超商店員 → 餐廳服務生 → 護理師 → 健身教練 → 急診室王牌護理長
  physicalSupport: {
    1: {
      back: '店員背包',
      bottom: '店員長褲',
      top: '店員制服',
      belt: '收銀腰包',
      headwear: '店員小帽',
      face: '口罩',
      gloves: '收銀手套',
      offhand: '條碼掃描器',
    },
    2: {
      back: '服務生圍裙背帶',
      bottom: '服務生長褲',
      top: '服務生背心',
      belt: '點餐機腰包',
      headwear: '服務生領結',
      face: '餐廳口罩',
      gloves: '上菜手套',
      offhand: '托盤',
    },
    3: {
      back: '急救後背包',
      bottom: '護理長褲',
      top: '護理師制服',
      belt: '工作圍裙',
      headwear: '護理帽',
      face: '醫療口罩',
      gloves: '拋棄式手套',
      offhand: '血氧機',
    },
    4: {
      back: '健身背心',
      bottom: '訓練短褲',
      top: '緊身運動衣',
      belt: '舉重腰帶',
      headwear: '運動頭帶',
      face: '運動墨鏡',
      gloves: '健身手套',
      offhand: '計時碼錶',
    },
    5: {
      back: '急診值班背包',
      bottom: '手術長褲',
      top: '手術服',
      belt: '急救腰包',
      headwear: '手術髮帽',
      face: '護目面罩',
      gloves: '無菌手套',
      offhand: '心臟去顫器',
    },
  },
  // 中二國中生 → 阿志 → 道士/法師 → 命理師 → 得道仙人
  magicMelee: {
    1: {
      back: '黑色連帽外套',
      bottom: '制服長褲',
      top: '制服襯衫',
      belt: '帆布腰帶',
      headwear: '單邊瀏海',
      face: '眼罩',
      gloves: '繃帶手套',
      offhand: '中二筆記本',
    },
    2: {
      back: '神轎背帶',
      bottom: '陣頭褲',
      top: '廟會背心',
      belt: '符令腰帶',
      headwear: '陣頭頭巾',
      face: '面繪',
      gloves: '白手套',
      offhand: '銅鑼',
    },
    3: {
      back: '符咒披風',
      bottom: '道士褲',
      top: '道袍',
      belt: '八卦腰帶',
      headwear: '道士帽',
      face: '護身符',
      gloves: '白棉手套',
      offhand: '桃木劍鞘',
    },
    4: {
      back: '卦攤布幔',
      bottom: '唐裝褲',
      top: '唐裝',
      belt: '銅錢腰帶',
      headwear: '瓜皮帽',
      face: '老花眼鏡',
      gloves: '占卜手套',
      offhand: '羅盤',
    },
    5: {
      back: '仙氣雲紋披風',
      bottom: '仙裙褲',
      top: '仙人白袍',
      belt: '玉帶',
      headwear: '蓮花冠',
      face: '仙氣面紗',
      gloves: '白玉護手',
      offhand: '拂塵',
    },
  },
  // 電競選手/實況主 → 軟體工程師 → 研究員/科學家 → 駭客 → AI 天才工程師
  magicRanged: {
    1: {
      back: '戰隊背包',
      bottom: '電競長褲',
      top: '連帽衛衣',
      belt: '隨身碟腰包',
      headwear: '電競耳機',
      face: '藍光眼鏡',
      gloves: '電競手套',
      offhand: '行動電源',
    },
    2: {
      back: '筆電後背包',
      bottom: '工程師長褲',
      top: '格子襯衫',
      belt: '識別證吊帶',
      headwear: '降噪耳機',
      face: '抗藍光眼鏡',
      gloves: '打字手套',
      offhand: '保溫咖啡杯',
    },
    3: {
      back: '實驗室背包',
      bottom: '實驗長褲',
      top: '白色實驗袍',
      belt: '儀器腰帶',
      headwear: '護目鏡頭帶',
      face: '實驗護目鏡',
      gloves: '丁腈手套',
      offhand: '試管架',
    },
    4: {
      back: '匿名背包',
      bottom: '黑色連帽長褲',
      top: '連帽外套',
      belt: '隨身硬碟腰帶',
      headwear: '面罩兜帽',
      face: '面具',
      gloves: '觸控手套',
      offhand: '隨身路由器',
    },
    5: {
      back: '量子背包',
      bottom: '未來科技長褲',
      top: '全息投影外套',
      belt: '神經連結腰帶',
      headwear: '腦機介面頭環',
      face: 'AR 智慧眼鏡',
      gloves: '觸覺回饋手套',
      offhand: '量子運算晶片',
    },
  },
  // 藥師 → 醫生 → 心理諮商師 → 老中醫 → 神醫/華佗再世
  magicSupport: {
    1: {
      back: '藥師背包',
      bottom: '藥局長褲',
      top: '藥師白袍',
      belt: '藥袋腰包',
      headwear: '藥師帽',
      face: '藥用口罩',
      gloves: '藥品手套',
      offhand: '藥杵藥臼',
    },
    2: {
      back: '醫師後背包',
      bottom: '白袍長褲',
      top: '白袍',
      belt: '聽診器',
      headwear: '手術髮帽',
      face: '醫療口罩',
      gloves: '乳膠手套',
      offhand: '血壓計',
    },
    3: {
      back: '諮商背包',
      bottom: '諮商師西裝褲',
      top: '針織開襟外套',
      belt: '筆記本腰包',
      headwear: '舒壓髮帶',
      face: '溫和款眼鏡',
      gloves: '無指手套',
      offhand: '沙盤玩具',
    },
    4: {
      back: '藥箱背帶',
      bottom: '唐裝褲',
      top: '中醫唐裝',
      belt: '脈枕腰帶',
      headwear: '瓜皮帽',
      face: '老花眼鏡',
      gloves: '把脈手套',
      offhand: '藥碾',
    },
    5: {
      back: '神醫藥箱背帶',
      bottom: '仙醫長袍褲',
      top: '神醫長袍',
      belt: '金針腰帶',
      headwear: '醫仙冠',
      face: '仙氣面紗',
      gloves: '金針手套',
      offhand: '再生藥丸',
    },
  },
};

// 每個裝備的顏色對應「現實中這件東西真正的顏色」,不是整個職業共用一種色相再調亮——
// 舊版做法會讓同職業所有部位都是同一色系(還可能剛好撞到 HERO_PALETTE 的身體色,例如
// physicalMelee 舊底色 #8b8698 直接等於角色上衣色,疊上去等於「吃色」看不見),
// 依現實物品配色之後,不同部位天生就會有足夠色相差異,不會互相吃色。
const SLOT_COLOR_BY_ARCHETYPE_TIER: Record<Archetype, SlotNounsByTier> = {
  physicalMelee: {
    1: {
      back: '#a89060',
      bottom: '#5a6b42',
      top: '#ff7518',
      belt: '#7a5030',
      headwear: '#f2c230',
      face: '#e8e2d0',
      gloves: '#d9c9a0',
      offhand: '#c0392b',
    },
    2: {
      back: '#3a3a3a',
      bottom: '#6b5a3a',
      top: '#d4e157',
      belt: '#e8b93a',
      headwear: '#2a3a5a',
      face: '#5a5a5a',
      gloves: '#2a2a2a',
      offhand: '#b0401a',
    },
    3: {
      back: '#ff5500',
      bottom: '#8a7040',
      top: '#f0e030',
      belt: '#2a2a2a',
      headwear: '#e8e8e0',
      face: '#1a1a1a',
      gloves: '#a87a4a',
      offhand: '#3a3a3a',
    },
    4: {
      back: '#e8c020',
      bottom: '#2a2a3a',
      top: '#c0281a',
      belt: '#1a1a1a',
      headwear: '#b02020',
      face: '#1a1a1a',
      gloves: '#3a3a2a',
      offhand: '#c0281a',
    },
    5: {
      back: '#5a5040',
      bottom: '#6b5a3a',
      top: '#2a2a28',
      belt: '#1a1a1a',
      headwear: '#4a4530',
      face: '#1a2a1a',
      gloves: '#1a1a1a',
      offhand: '#4a4a2a',
    },
  },
  physicalRanged: {
    1: {
      back: '#e91e63',
      bottom: '#2a2a2a',
      top: '#ff7518',
      belt: '#2a2a2a',
      headwear: '#1a1a1a',
      face: '#6ab0e0',
      gloves: '#2a2a2a',
      offhand: '#3a3a3a',
    },
    2: {
      back: '#f2c230',
      bottom: '#2a2a2a',
      top: '#f2c230',
      belt: '#7a5030',
      headwear: '#2a2a2a',
      face: '#1a1a1a',
      gloves: '#2a2a2a',
      offhand: '#4a4a4a',
    },
    3: {
      back: '#1a2a4a',
      bottom: '#1a2a4a',
      top: '#1a2a4a',
      belt: '#1a1a1a',
      headwear: '#1a2a4a',
      face: '#2a2a2a',
      gloves: '#1a1a1a',
      offhand: '#2a2a2a',
    },
    4: {
      back: '#4a5a30',
      bottom: '#4a5a30',
      top: '#4a5a30',
      belt: '#6b4a2a',
      headwear: '#4a5a30',
      face: '#3a4a28',
      gloves: '#6b4a2a',
      offhand: '#8a6a3a',
    },
    5: {
      back: '#4a4530',
      bottom: '#4a4a2a',
      top: '#4a4a2a',
      belt: '#1a1a1a',
      headwear: '#3a3a20',
      face: '#1a2a1a',
      gloves: '#1a1a1a',
      offhand: '#6a6a6a',
    },
  },
  physicalSupport: {
    1: {
      back: '#6a6a6a',
      bottom: '#2a2a2a',
      top: '#2e7d32',
      belt: '#2a2a2a',
      headwear: '#2e7d32',
      face: '#a8d0e8',
      gloves: '#e8e8e0',
      offhand: '#2a2a2a',
    },
    2: {
      back: '#2a2a2a',
      bottom: '#2a2a2a',
      top: '#6a1a2a',
      belt: '#2a2a2a',
      headwear: '#1a1a1a',
      face: '#e8e8e0',
      gloves: '#e8e2d0',
      offhand: '#a8a8a8',
    },
    3: {
      back: '#e8e2d0',
      bottom: '#a8c8e0',
      top: '#a8c8e0',
      belt: '#e8e2d0',
      headwear: '#f0f0e8',
      face: '#a8d0e8',
      gloves: '#a8d0e0',
      offhand: '#d8d8d0',
    },
    4: {
      back: '#2a2a2a',
      bottom: '#c0281a',
      top: '#c0281a',
      belt: '#2a2a2a',
      headwear: '#c0281a',
      face: '#1a1a1a',
      gloves: '#2a2a2a',
      offhand: '#3a3a3a',
    },
    5: {
      back: '#1a3a5a',
      bottom: '#2a6a5a',
      top: '#2a6a5a',
      belt: '#e8e2d0',
      headwear: '#2a6a5a',
      face: '#d0e8f0',
      gloves: '#c0dce8',
      offhand: '#f0a020',
    },
  },
  magicMelee: {
    1: {
      back: '#2a2a2a',
      bottom: '#1a2a4a',
      top: '#e8e8e0',
      belt: '#6a5a3a',
      headwear: '#1a1a1a',
      face: '#8a1a1a',
      gloves: '#e0d8c8',
      offhand: '#2a1a1a',
    },
    2: {
      back: '#a01818',
      bottom: '#8a1818',
      top: '#c02020',
      belt: '#e8c020',
      headwear: '#a01818',
      face: '#c02020',
      gloves: '#f0f0e8',
      offhand: '#c9a030',
    },
    3: {
      back: '#e0c030',
      bottom: '#1a2030',
      top: '#1a2a4a',
      belt: '#2a2a2a',
      headwear: '#1a1a1a',
      face: '#e0c030',
      gloves: '#e8e2d0',
      offhand: '#7a5a30',
    },
    4: {
      back: '#8a1a2a',
      bottom: '#1a1a1a',
      top: '#8a1a2a',
      belt: '#c9a030',
      headwear: '#1a1a1a',
      face: '#c9a030',
      gloves: '#e8e2d0',
      offhand: '#8a6a3a',
    },
    5: {
      back: '#f0e8d0',
      bottom: '#f0ece0',
      top: '#f0ece0',
      belt: '#7ab088',
      headwear: '#d4af37',
      face: '#e8e0d0',
      gloves: '#e0e8d8',
      offhand: '#e8e2d0',
    },
  },
  magicRanged: {
    1: {
      back: '#39ff14',
      bottom: '#2a2a2a',
      top: '#2a2a2a',
      belt: '#2a2a2a',
      headwear: '#00e5ff',
      face: '#e8d840',
      gloves: '#2a2a2a',
      offhand: '#d8d8d0',
    },
    2: {
      back: '#4a4a4a',
      bottom: '#a0885a',
      top: '#4a6a9a',
      belt: '#3a5a8a',
      headwear: '#2a2a2a',
      face: '#6a6a6a',
      gloves: '#7a7a7a',
      offhand: '#a8a8a8',
    },
    3: {
      back: '#6a6a6a',
      bottom: '#4a4a4a',
      top: '#f0f0e8',
      belt: '#6a6a6a',
      headwear: '#2a2a2a',
      face: '#6ab0e0',
      gloves: '#6a5a9a',
      offhand: '#6ab0e0',
    },
    4: {
      back: '#1a1a1a',
      bottom: '#1a1a1a',
      top: '#1a1a1a',
      belt: '#1a1a1a',
      headwear: '#1a1a1a',
      face: '#e8e8e0',
      gloves: '#1a1a1a',
      offhand: '#1a2a1a',
    },
    5: {
      back: '#d0d8e0',
      bottom: '#a0a8b0',
      top: '#40e0d0',
      belt: '#40e0d0',
      headwear: '#a0e8e0',
      face: '#80d8d0',
      gloves: '#c0e8e0',
      offhand: '#40a0e0',
    },
  },
  magicSupport: {
    1: {
      back: '#d0e0e8',
      bottom: '#e8e8e0',
      top: '#f0f0e8',
      belt: '#c0d8c0',
      headwear: '#f0f0e8',
      face: '#a8d0e8',
      gloves: '#a8d0e0',
      offhand: '#d8c8a8',
    },
    2: {
      back: '#2a3a5a',
      bottom: '#2a2a2a',
      top: '#f0f0e8',
      belt: '#4a4a4a',
      headwear: '#a8c8e0',
      face: '#a8d0e8',
      gloves: '#e0c8a8',
      offhand: '#d8d8d0',
    },
    3: {
      back: '#c0a880',
      bottom: '#4a4a4a',
      top: '#a8b090',
      belt: '#7a5a3a',
      headwear: '#b0a0c8',
      face: '#6a4a2a',
      gloves: '#8a8a80',
      offhand: '#d0b888',
    },
    4: {
      back: '#6a4a2a',
      bottom: '#2a3a5a',
      top: '#2a3a5a',
      belt: '#7a5a3a',
      headwear: '#1a1a1a',
      face: '#c9a030',
      gloves: '#e8e2d0',
      offhand: '#5a4a3a',
    },
    5: {
      back: '#8a6a30',
      bottom: '#2a6a5a',
      top: '#2a6a5a',
      belt: '#d4af37',
      headwear: '#d4af37',
      face: '#e8e0c0',
      gloves: '#e8dcc0',
      offhand: '#e04030',
    },
  },
};

// ---- 分支 B 裝備(tier2 起,呼應 game/combat.ts JOB_TITLES 的分支 B 職業身分)----
// tier1 兩分支尚未分岔(見 JOB_TITLES 的說明),所以這裡沒有 tier1,共用上面 SLOT_BASE_NOUN_BY_ARCHETYPE_TIER
// 跟 SLOT_COLOR_BY_ARCHETYPE_TIER 的 tier1 資料(=分支 A 的資料表同時也是兩分支共用的基底)。
type BranchBSlotNounsByTier = Partial<Record<Exclude<JobTier, 1>, Partial<Record<EquipmentSlot, string>>>>;

const SLOT_BASE_NOUN_BRANCH_B_BY_ARCHETYPE_TIER: Record<Archetype, BranchBSlotNounsByTier> = {
  // 拳擊館學員 → 拳擊教練 → 職業拳擊手 → 傳說拳王
  physicalMelee: {
    2: {
      back: '拳擊館置物袋背帶',
      bottom: '拳擊訓練短褲',
      top: '訓練背心',
      belt: '舉重護腰帶',
      headwear: '吸汗頭帶',
      face: '護齒套',
      gloves: '拳擊訓練手套',
      offhand: '速度球',
    },
    3: {
      back: '教練戰術包',
      bottom: '教練運動長褲',
      top: '教練 Polo 衫',
      belt: '戰術哨子腰包',
      headwear: '教練鴨舌帽',
      face: '教練墨鏡',
      gloves: '對打護具手靶',
      offhand: '訓練碼錶',
    },
    4: {
      back: '入場戰袍',
      bottom: '職業賽短褲',
      top: '隊服入場外套',
      belt: '拳手護腰帶',
      headwear: '訓練頭部護具',
      face: '止血凡士林棉棒',
      gloves: '職業賽拳套',
      offhand: '戰績紀錄板',
    },
    5: {
      back: '冠軍入場戰袍',
      bottom: '金色戰袍褲',
      top: '傳說戰袍',
      belt: '金腰帶',
      headwear: '桂冠頭巾',
      face: '傳奇墨鏡',
      gloves: '傳說金拳套',
      offhand: '金色獎盃',
    },
  },
  // 貨車司機 → 保鑣 → 特技替身演員 → 頂尖鏢客
  physicalRanged: {
    2: {
      back: '貨物固定網背帶',
      bottom: '貨運工作長褲',
      top: '貨運制服上衣',
      belt: '對講機腰包',
      headwear: '貨運鴨舌帽',
      face: '防曬太陽眼鏡',
      gloves: '搬貨手套',
      offhand: '隨車導航機',
    },
    3: {
      back: '防彈公事包背帶',
      bottom: '西裝長褲',
      top: '保鑣西裝外套',
      belt: '槍套腰帶',
      headwear: '隱藏式藍牙耳機',
      face: '黑色太陽眼鏡',
      gloves: '防滑皮手套',
      offhand: '對講機耳麥',
    },
    4: {
      back: '特技威亞背帶',
      bottom: '防護緩衝長褲',
      top: '特技護具背心',
      belt: '護具腰帶',
      headwear: '特技安全帽',
      face: '護目鏡',
      gloves: '抓握防護手套',
      offhand: '攝影機遙控器',
    },
    5: {
      back: '西部風長披風',
      bottom: '牛仔長褲',
      top: '鏢客皮背心',
      belt: '雙槍腰帶',
      headwear: '牛仔帽',
      face: '神秘面巾',
      gloves: '皮革射擊手套',
      offhand: '星形警徽',
    },
  },
  // 空服員 → 居家照護員 → 物理治療師 → 奧運隨隊防護員
  physicalSupport: {
    2: {
      back: '空服員拉桿箱',
      bottom: '空服員制服窄裙褲',
      top: '空服員制服上衣',
      belt: '安全示範腰帶',
      headwear: '空服員絲巾髮髻',
      face: '空服員淡妝眼鏡',
      gloves: '白手套',
      offhand: '服務推車手把',
    },
    3: {
      back: '居家照護包',
      bottom: '舒適工作長褲',
      top: '居家照護背心',
      belt: '隨身藥物腰包',
      headwear: '居家照護頭巾',
      face: '溫和款口罩',
      gloves: '看護用手套',
      offhand: '居家用血壓計',
    },
    4: {
      back: '治療師背包',
      bottom: '治療師運動長褲',
      top: '治療師運動 Polo 衫',
      belt: '彈力帶腰包',
      headwear: '治療師頭帶',
      face: '專業眼鏡',
      gloves: '按摩治療手套',
      offhand: '筋膜按摩滾筒',
    },
    5: {
      back: '國家隊防護背包',
      bottom: '隨隊運動長褲',
      top: '國家隊防護員外套',
      belt: '急救噴劑腰包',
      headwear: '隨隊工作證頭帶',
      face: '專業運動護目鏡',
      gloves: '高階運動貼紮手套',
      offhand: '奧運隊徽急救箱',
    },
  },
  // 八家將小將 → 乩童 → 風水師 → 一代宗師
  magicMelee: {
    2: {
      back: '神將背旗',
      bottom: '陣頭褲',
      top: '八家將臉譜背心',
      belt: '神將令牌腰帶',
      headwear: '神將帽飾',
      face: '八家將臉譜彩繪',
      gloves: '神將白手套',
      offhand: '神將令旗',
    },
    3: {
      back: '乩童紅布披風',
      bottom: '乩童赤足陣頭短褲',
      top: '乩童彩帶肩帶',
      belt: '神兵法器腰帶',
      headwear: '乩童散髮頭巾',
      face: '恍神狀態面容彩繪',
      gloves: '起乩護手',
      offhand: '七星劍鞘',
    },
    4: {
      back: '羅盤背袋',
      bottom: '風水師唐裝褲',
      top: '風水師唐裝外套',
      belt: '銅錢羅盤腰帶',
      headwear: '風水師禮帽',
      face: '看風水用老花眼鏡',
      gloves: '堪輿手套',
      offhand: '魯班尺',
    },
    5: {
      back: '宗師武學披風',
      bottom: '宗師長袍褲',
      top: '宗師武學長袍',
      belt: '宗師武學腰帶',
      headwear: '宗師髮髻冠',
      face: '宗師沉穩神情面紗',
      gloves: '宗師鐵砂掌護手',
      offhand: '宗師武學祕笈',
    },
  },
  // 資料科學家 → 量子物理博士生 → 密碼學專家 → 諾貝爾獎得主
  magicRanged: {
    2: {
      back: '資料科學家筆電包',
      bottom: '休閒工作長褲',
      top: '格紋襯衫',
      belt: '隨身硬碟腰帶',
      headwear: '降噪耳機',
      face: '圓框眼鏡',
      gloves: '觸控手套',
      offhand: '圖表分析平板',
    },
    3: {
      back: '實驗室背包',
      bottom: '研究生休閒長褲',
      top: '研究生連帽衫',
      belt: '識別證吊帶',
      headwear: '蓬亂研究生髮型頭套',
      face: '厚重近視眼鏡',
      gloves: '精密儀器手套',
      offhand: '量子力學筆記本',
    },
    4: {
      back: '加密隨身包',
      bottom: '深色連帽長褲',
      top: '密碼學專家連帽外套',
      belt: '加密硬體金鑰腰帶',
      headwear: '面罩兜帽',
      face: '反光防窺面罩',
      gloves: '加密鍵盤觸控手套',
      offhand: '量子加密終端機',
    },
    5: {
      back: '頒獎典禮西裝背帶',
      bottom: '諾貝爾獎典禮西裝褲',
      top: '諾貝爾獎典禮燕尾服',
      belt: '得獎者絲質腰帶',
      headwear: '學術界紳士帽',
      face: '學者金絲眼鏡',
      gloves: '頒獎白手套',
      offhand: '諾貝爾獎章',
    },
  },
  // 獸醫 → 芳療師 → 針灸師 → 都市傳說級神醫
  magicSupport: {
    2: {
      back: '獸醫出診包',
      bottom: '獸醫工作長褲',
      top: '獸醫白袍',
      belt: '獸醫器械腰包',
      headwear: '獸醫帽',
      face: '防抓咬護目鏡',
      gloves: '獸醫觸診手套',
      offhand: '寵物聽診器',
    },
    3: {
      back: '芳療師精油背包',
      bottom: '芳療師舒適長褲',
      top: '芳療師工作服',
      belt: '精油瓶腰包',
      headwear: '芳療頭巾',
      face: '舒壓眼罩',
      gloves: '按摩油護手',
      offhand: '精油按摩滾輪',
    },
    4: {
      back: '針灸師器械背包',
      bottom: '針灸師唐裝褲',
      top: '針灸師醫袍',
      belt: '銀針收納腰帶',
      headwear: '針灸師髮帽',
      face: '把脈用老花眼鏡',
      gloves: '精細銀針手套',
      offhand: '艾灸盒',
    },
    5: {
      back: '傳說神醫藥箱背帶',
      bottom: '神醫仙風長袍褲',
      top: '都市傳說神醫長袍',
      belt: '傳說金針腰帶',
      headwear: '神醫醫仙冠',
      face: '傳說神醫面紗',
      gloves: '神醫金針手套',
      offhand: '傳說再生藥丸',
    },
  },
};

const SLOT_COLOR_BRANCH_B_BY_ARCHETYPE_TIER: Record<Archetype, BranchBSlotNounsByTier> = {
  physicalMelee: {
    2: {
      back: '#7a3a3a',
      bottom: '#2a2a2a',
      top: '#6a6a6a',
      belt: '#1a1a1a',
      headwear: '#a02020',
      face: '#e8e8e0',
      gloves: '#c0281a',
      offhand: '#3a2a2a',
    },
    3: {
      back: '#2a3a5a',
      bottom: '#3a3a3a',
      top: '#2a3a5a',
      belt: '#1a1a1a',
      headwear: '#2a3a5a',
      face: '#1a1a1a',
      gloves: '#8a1a1a',
      offhand: '#a8a8a8',
    },
    4: {
      back: '#8a1a1a',
      bottom: '#c02020',
      top: '#8a1a1a',
      belt: '#1a1a1a',
      headwear: '#c0281a',
      face: '#e8d8c8',
      gloves: '#c0281a',
      offhand: '#6b4a2a',
    },
    5: {
      back: '#d4af37',
      bottom: '#c9a030',
      top: '#d4af37',
      belt: '#d4af37',
      headwear: '#e8c020',
      face: '#1a1a1a',
      gloves: '#d4af37',
      offhand: '#e8c020',
    },
  },
  physicalRanged: {
    2: {
      back: '#6a5a3a',
      bottom: '#3a3a3a',
      top: '#4a6a3a',
      belt: '#2a2a2a',
      headwear: '#4a6a3a',
      face: '#1a1a1a',
      gloves: '#6a5a3a',
      offhand: '#4a4a4a',
    },
    3: {
      back: '#1a1a1a',
      bottom: '#1a1a1a',
      top: '#1a1a1a',
      belt: '#2a2a2a',
      headwear: '#2a2a2a',
      face: '#1a1a1a',
      gloves: '#2a2a2a',
      offhand: '#3a3a3a',
    },
    4: {
      back: '#4a4a4a',
      bottom: '#3a3a3a',
      top: '#6a6a6a',
      belt: '#2a2a2a',
      headwear: '#c0281a',
      face: '#6ab0e0',
      gloves: '#3a3a3a',
      offhand: '#2a2a2a',
    },
    5: {
      back: '#6a4a2a',
      bottom: '#4a3a24',
      top: '#6a4a2a',
      belt: '#3a2a1a',
      headwear: '#8a6a3a',
      face: '#4a2a1a',
      gloves: '#6a4a2a',
      offhand: '#d4af37',
    },
  },
  physicalSupport: {
    2: {
      back: '#1a2a4a',
      bottom: '#1a2a4a',
      top: '#1a2a4a',
      belt: '#c9a94f',
      headwear: '#c02020',
      face: '#6a4a3a',
      gloves: '#f0f0e8',
      offhand: '#a8a8a8',
    },
    3: {
      back: '#6a8a6a',
      bottom: '#4a5a4a',
      top: '#6a8a6a',
      belt: '#e8e2d0',
      headwear: '#6a8a6a',
      face: '#a8d0e8',
      gloves: '#a8d0e0',
      offhand: '#d8d8d0',
    },
    4: {
      back: '#4a6a8a',
      bottom: '#2a2a2a',
      top: '#4a6a8a',
      belt: '#3a5a3a',
      headwear: '#4a6a8a',
      face: '#2a2a2a',
      gloves: '#4a6a8a',
      offhand: '#3a3a3a',
    },
    5: {
      back: '#1a3a6a',
      bottom: '#1a3a6a',
      top: '#1a3a6a',
      belt: '#c0281a',
      headwear: '#d4af37',
      face: '#6ab0e0',
      gloves: '#1a3a6a',
      offhand: '#d4af37',
    },
  },
  magicMelee: {
    2: {
      back: '#a01818',
      bottom: '#8a1818',
      top: '#c02020',
      belt: '#e8c020',
      headwear: '#a01818',
      face: '#c02020',
      gloves: '#f0f0e8',
      offhand: '#c9a030',
    },
    3: {
      back: '#a01818',
      bottom: '#8a1818',
      top: '#c02020',
      belt: '#2a2a2a',
      headwear: '#1a1a1a',
      face: '#e8c020',
      gloves: '#8a1a1a',
      offhand: '#7a5a30',
    },
    4: {
      back: '#8a6a3a',
      bottom: '#1a1a1a',
      top: '#2a3a5a',
      belt: '#c9a030',
      headwear: '#1a1a1a',
      face: '#c9a030',
      gloves: '#8a6a3a',
      offhand: '#6b4a2a',
    },
    5: {
      back: '#1a1a1a',
      bottom: '#1a1a1a',
      top: '#2a2a2a',
      belt: '#d4af37',
      headwear: '#d4af37',
      face: '#e8e0d0',
      gloves: '#4a3a2a',
      offhand: '#6b4a2a',
    },
  },
  magicRanged: {
    2: {
      back: '#3a5a5a',
      bottom: '#4a4a4a',
      top: '#3a5a5a',
      belt: '#2a2a2a',
      headwear: '#2a2a2a',
      face: '#4a4a4a',
      gloves: '#2a2a2a',
      offhand: '#3a5a5a',
    },
    3: {
      back: '#4a4a6a',
      bottom: '#4a4a4a',
      top: '#4a4a6a',
      belt: '#2a2a2a',
      headwear: '#2a2a2a',
      face: '#4a4a4a',
      gloves: '#6a6a8a',
      offhand: '#4a4a6a',
    },
    4: {
      back: '#1a1a1a',
      bottom: '#1a1a1a',
      top: '#1a1a1a',
      belt: '#1a1a1a',
      headwear: '#1a1a1a',
      face: '#2a2a2a',
      gloves: '#1a1a1a',
      offhand: '#1a2a1a',
    },
    5: {
      back: '#1a1a1a',
      bottom: '#1a1a1a',
      top: '#1a1a1a',
      belt: '#d4af37',
      headwear: '#1a1a1a',
      face: '#d4af37',
      gloves: '#f0f0e8',
      offhand: '#d4af37',
    },
  },
  magicSupport: {
    2: {
      back: '#4a6a4a',
      bottom: '#4a5a4a',
      top: '#f0f0e8',
      belt: '#4a6a4a',
      headwear: '#f0f0e8',
      face: '#a8d0e8',
      gloves: '#a8d0e0',
      offhand: '#4a6a4a',
    },
    3: {
      back: '#b0a0c8',
      bottom: '#a8b090',
      top: '#b0a0c8',
      belt: '#7a5a3a',
      headwear: '#b0a0c8',
      face: '#b0a0c8',
      gloves: '#d0b888',
      offhand: '#b0a0c8',
    },
    4: {
      back: '#2a6a5a',
      bottom: '#2a3a5a',
      top: '#2a6a5a',
      belt: '#a8a8a8',
      headwear: '#2a6a5a',
      face: '#c9a030',
      gloves: '#a8a8a8',
      offhand: '#6b4a2a',
    },
    5: {
      back: '#8a6a30',
      bottom: '#2a6a5a',
      top: '#2a6a5a',
      belt: '#d4af37',
      headwear: '#d4af37',
      face: '#e8e0c0',
      gloves: '#d4af37',
      offhand: '#e04030',
    },
  },
};

// 依分支查詢插槽名稱/顏色:tier1 或 branch A 直接吃基底表;branch B 的 tier2-5 才查專屬表
// (查不到就 fallback 回基底表,理論上不會發生,只是防呆)。
function slotBaseNounFor(archetype: Archetype, branch: JobBranch, tier: JobTier, slot: EquipmentSlot): string | undefined {
  if (tier === 1 || branch === 'A') return SLOT_BASE_NOUN_BY_ARCHETYPE_TIER[archetype][tier][slot];
  return SLOT_BASE_NOUN_BRANCH_B_BY_ARCHETYPE_TIER[archetype][tier]?.[slot] ?? SLOT_BASE_NOUN_BY_ARCHETYPE_TIER[archetype][tier][slot];
}

function slotColorFor(archetype: Archetype, branch: JobBranch, tier: JobTier, slot: EquipmentSlot): string | undefined {
  if (tier === 1 || branch === 'A') return SLOT_COLOR_BY_ARCHETYPE_TIER[archetype][tier][slot];
  return SLOT_COLOR_BRANCH_B_BY_ARCHETYPE_TIER[archetype][tier]?.[slot] ?? SLOT_COLOR_BY_ARCHETYPE_TIER[archetype][tier][slot];
}

// 武器一樣按 5 階換款,呼應各階現實身分(見上方 SLOT_BASE_NOUN_BY_ARCHETYPE_TIER 的職業世界觀)。
type WeaponNounsByTier = Record<JobTier, { oneHanded: string; twoHanded: string }>;

const WEAPON_NOUNS_BY_TIER: Record<Archetype, WeaponNounsByTier> = {
  physicalMelee: {
    1: { oneHanded: '工作手套', twoHanded: '鐵鎚' },
    2: { oneHanded: '打包膠帶槍', twoHanded: '貨物撬棍' },
    3: { oneHanded: '電鑽', twoHanded: '電鋸' },
    4: { oneHanded: '消防斧', twoHanded: '破壞剪' },
    5: { oneHanded: '戰鬥匕首', twoHanded: '突擊步槍' },
  },
  physicalRanged: {
    1: { oneHanded: '美工刀', twoHanded: 'U 型大鎖' },
    2: { oneHanded: '方向盤鎖', twoHanded: '千斤頂' },
    3: { oneHanded: '警棍', twoHanded: '霰彈槍' },
    4: { oneHanded: '獵刀', twoHanded: '獵槍' },
    5: { oneHanded: '消音手槍', twoHanded: '狙擊步槍' },
  },
  physicalSupport: {
    1: { oneHanded: '御飯糰加熱夾', twoHanded: '補貨推車' },
    2: { oneHanded: '開瓶器', twoHanded: '大托盤' },
    3: { oneHanded: '針筒', twoHanded: '點滴架' },
    4: { oneHanded: '啞鈴', twoHanded: '槓鈴' },
    5: { oneHanded: '急救剪', twoHanded: '急救推車' },
  },
  magicMelee: {
    1: { oneHanded: '木劍', twoHanded: '掃把' },
    2: { oneHanded: '七星劍', twoHanded: '關刀' },
    3: { oneHanded: '桃木劍', twoHanded: '拂塵杖' },
    4: { oneHanded: '銅錢劍', twoHanded: '招財貓棒' },
    5: { oneHanded: '仙劍', twoHanded: '如意金箍棒' },
  },
  magicRanged: {
    1: { oneHanded: '電競鍵盤', twoHanded: '電競滑鼠墊' },
    2: { oneHanded: '機械鍵盤', twoHanded: '雙螢幕支架' },
    3: { oneHanded: '雷射筆', twoHanded: '顯微鏡' },
    4: { oneHanded: '資安隨身碟', twoHanded: '伺服器主機' },
    5: { oneHanded: '神經連結手環', twoHanded: 'AI 核心終端機' },
  },
  magicSupport: {
    1: { oneHanded: '藥瓶', twoHanded: '藥箱權杖' },
    2: { oneHanded: '反射錘', twoHanded: '點滴架' },
    3: { oneHanded: '減壓筆', twoHanded: '沙發抱枕' },
    4: { oneHanded: '銀針', twoHanded: '藥杵' },
    5: { oneHanded: '華佗神針', twoHanded: '再世金刀' },
  },
};

// 武器同一階(單手+雙手)共用一個對應現實材質的顏色,例如鐵鎚/電鋸是鋼鐵灰、七星劍是青銅金,
// 不是整個職業共用一種色相。
const WEAPON_COLOR_BY_TIER: Record<Archetype, Record<JobTier, string>> = {
  physicalMelee: { 1: '#7a7a7a', 2: '#e8a020', 3: '#f2c230', 4: '#c0281a', 5: '#2a2a2a' },
  physicalRanged: { 1: '#9a9a9a', 2: '#c0281a', 3: '#2a2a2a', 4: '#6a5030', 5: '#1a1a1a' },
  physicalSupport: { 1: '#a8a8a8', 2: '#b8b8b8', 3: '#d8d8d0', 4: '#2a2a2a', 5: '#e04030' },
  magicMelee: { 1: '#8a6a3a', 2: '#c9a030', 3: '#a88050', 4: '#d4af37', 5: '#d4af37' },
  magicRanged: { 1: '#00e5ff', 2: '#3a3a3a', 3: '#a8a8a8', 4: '#1a2a1a', 5: '#40e0d0' },
  magicSupport: { 1: '#a86a20', 2: '#c0281a', 3: '#a0c0d8', 4: '#c0c0c0', 5: '#d4af37' },
};

// 武器分支 B(tier2 起),同樣 tier1 兩分支共用上面 WEAPON_NOUNS_BY_TIER/WEAPON_COLOR_BY_TIER 的資料。
type BranchBWeaponNounsByTier = Partial<Record<Exclude<JobTier, 1>, { oneHanded: string; twoHanded: string }>>;

const WEAPON_NOUNS_BRANCH_B_BY_TIER: Record<Archetype, BranchBWeaponNounsByTier> = {
  physicalMelee: {
    2: { oneHanded: '纏繞式拳擊繃帶', twoHanded: '訓練重沙包' },
    3: { oneHanded: '對打練習拳靶', twoHanded: '戰術訓練架' },
    4: { oneHanded: '職業比賽拳套', twoHanded: '開賽銅鑼' },
    5: { oneHanded: '拳王黃金拳套', twoHanded: '巨型冠軍獎盃' },
  },
  physicalRanged: {
    2: { oneHanded: '貨車鑰匙鏈', twoHanded: '液壓尾板控制桿' },
    3: { oneHanded: '消音手槍', twoHanded: '防爆盾牌' },
    4: { oneHanded: '特技道具槍', twoHanded: '威亞發射器' },
    5: { oneHanded: '左輪手槍', twoHanded: '溫徹斯特步槍' },
  },
  physicalSupport: {
    2: { oneHanded: '飲料推車拉桿', twoHanded: '緊急氧氣瓶' },
    3: { oneHanded: '血壓計壓脈帶', twoHanded: '輪椅' },
    4: { oneHanded: '貼紮繃帶', twoHanded: '治療床' },
    5: { oneHanded: '隨隊急救噴劑', twoHanded: '移動式治療推車' },
  },
  magicMelee: {
    2: { oneHanded: '七星步法令旗', twoHanded: '神將大關刀道具' },
    3: { oneHanded: '起乩七星劍', twoHanded: '五寶刺球' },
    4: { oneHanded: '羅盤權杖', twoHanded: '魯班尺長杖' },
    5: { oneHanded: '一代宗師之拳', twoHanded: '武學傳承棍' },
  },
  magicRanged: {
    2: { oneHanded: '資料視覺化手寫筆', twoHanded: '多螢幕工作站' },
    3: { oneHanded: '論文發表雷射筆', twoHanded: '粒子加速器模型' },
    4: { oneHanded: '加密硬體金鑰', twoHanded: '量子電腦主機' },
    5: { oneHanded: '諾貝爾獎章權杖', twoHanded: '頒獎典禮講台' },
  },
  magicSupport: {
    2: { oneHanded: '動物麻醉筆', twoHanded: '大型獸醫診療台' },
    3: { oneHanded: '精油滴管', twoHanded: '芳療按摩床' },
    4: { oneHanded: '針灸銀針', twoHanded: '艾灸架' },
    5: { oneHanded: '傳說神醫金針', twoHanded: '都市傳說神醫藥櫃' },
  },
};

const WEAPON_COLOR_BRANCH_B_BY_TIER: Record<Archetype, Partial<Record<Exclude<JobTier, 1>, string>>> = {
  physicalMelee: { 2: '#8a4a3a', 3: '#4a5a7a', 4: '#c0281a', 5: '#d4af37' },
  physicalRanged: { 2: '#6a6a6a', 3: '#2a2a2a', 4: '#4a4a4a', 5: '#6a4a2a' },
  physicalSupport: { 2: '#a8a8a8', 3: '#6a8a6a', 4: '#4a6a8a', 5: '#1a3a6a' },
  magicMelee: { 2: '#a01818', 3: '#8a1a1a', 4: '#8a6a3a', 5: '#1a1a1a' },
  magicRanged: { 2: '#3a5a5a', 3: '#4a4a6a', 4: '#1a1a1a', 5: '#d4af37' },
  magicSupport: { 2: '#4a6a4a', 3: '#b0a0c8', 4: '#2a6a5a', 5: '#d4af37' },
};

function weaponNounsFor(archetype: Archetype, branch: JobBranch, tier: JobTier): { oneHanded: string; twoHanded: string } {
  if (tier === 1 || branch === 'A') return WEAPON_NOUNS_BY_TIER[archetype][tier];
  return WEAPON_NOUNS_BRANCH_B_BY_TIER[archetype][tier] ?? WEAPON_NOUNS_BY_TIER[archetype][tier];
}

function weaponColorFor(archetype: Archetype, branch: JobBranch, tier: JobTier): string {
  if (tier === 1 || branch === 'A') return WEAPON_COLOR_BY_TIER[archetype][tier];
  return WEAPON_COLOR_BRANCH_B_BY_TIER[archetype][tier] ?? WEAPON_COLOR_BY_TIER[archetype][tier];
}

const ARCHETYPE_BASE_COLOR: Record<Archetype, string> = {
  physicalMelee: '#8b8698',
  physicalRanged: '#7a9e7e',
  physicalSupport: '#c9a94f',
  magicMelee: '#b389e0',
  magicRanged: '#6ab0e0',
  magicSupport: '#e0a0c0',
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
}

// 等級檔越高,顏色越往亮部靠(視覺上暗示「越後期越華麗」),幅度封頂在 35%。
function shiftColorForBracket(baseHex: string, bracket: number): string {
  const [r, g, b] = hexToRgb(baseHex);
  const t = (bracket - 1) / (BRACKET_COUNT - 1);
  const brighten = t * 0.35;
  return rgbToHex(r + (255 - r) * brighten, g + (255 - g) * brighten, b + (255 - b) * brighten);
}

function jobTierAndTitleAtLevel(archetype: Archetype, branch: JobBranch, level: number): { tier: JobTier; title: string } {
  const tier = getCurrentTier(level);
  return { tier, title: getJobTitle(archetype, branch, tier) };
}

// tier1(两分支尚未分岔)只生成一款不分支的道具,維持舊 id 格式(無 branch 區段),
// 現有玩家的 tier1 裝備 id 完全不受這次改動影響,不需要遷移。tier2 起才分別為 A/B
// 兩分支各自生成一款(id 加上 branch 區段),呼應 JOB_TITLES 從 tier2 起才分岔的設計。
function generateRegularSlotItems(slot: EquipmentSlot): EquipmentItem[] {
  const stat = SLOT_STAT[slot];
  const items: EquipmentItem[] = [];
  for (const archetype of ARCHETYPES) {
    for (let bracket = 1; bracket <= BRACKET_COUNT; bracket++) {
      const requiredLevel = bracketRequiredLevel(bracket);
      const tier = getCurrentTier(requiredLevel);
      if (tier === 1) {
        const { title } = jobTierAndTitleAtLevel(archetype, 'A', requiredLevel);
        const baseNoun = slotBaseNounFor(archetype, 'A', tier, slot);
        if (!baseNoun) continue;
        const tierColor = slotColorFor(archetype, 'A', tier, slot) ?? ARCHETYPE_BASE_COLOR[archetype];
        items.push({
          id: `${slot}-${archetype}-${bracket}`,
          slot,
          name: `${title}${qualityWordForBracket(bracket)}${baseNoun}·Lv${requiredLevel}`,
          color: shiftColorForBracket(tierColor, bracket),
          price: bracketPrice(bracket),
          bonus: { stat, value: bracketBonusValue(bracket) },
          archetype,
          requiredLevel,
          bracket,
        });
        continue;
      }
      for (const branch of JOB_BRANCHES) {
        const { title } = jobTierAndTitleAtLevel(archetype, branch, requiredLevel);
        const baseNoun = slotBaseNounFor(archetype, branch, tier, slot);
        if (!baseNoun) continue;
        const tierColor = slotColorFor(archetype, branch, tier, slot) ?? ARCHETYPE_BASE_COLOR[archetype];
        items.push({
          id: `${slot}-${archetype}-${branch}-${bracket}`,
          slot,
          name: `${title}${qualityWordForBracket(bracket)}${baseNoun}·Lv${requiredLevel}`,
          color: shiftColorForBracket(tierColor, bracket),
          price: bracketPrice(bracket),
          bonus: { stat, value: bracketBonusValue(bracket) },
          archetype,
          branch,
          requiredLevel,
          bracket,
        });
      }
    }
  }
  return items;
}

function pushMainhandPair(
  items: EquipmentItem[],
  archetype: Archetype,
  branch: JobBranch | undefined,
  bracket: number,
  requiredLevel: number,
  title: string,
  nouns: { oneHanded: string; twoHanded: string },
  color: string,
  stat: EquipmentBonusStat
): void {
  const oneHandedBonus = bracketBonusValue(bracket);
  const price = bracketPrice(bracket);
  const idSuffix = branch === undefined ? `${archetype}-${bracket}` : `${archetype}-${branch}-${bracket}`;

  items.push({
    id: `mainhand-1h-${idSuffix}`,
    slot: 'mainhand',
    name: `${title}${qualityWordForBracket(bracket)}${nouns.oneHanded}·Lv${requiredLevel}`,
    color,
    price,
    bonus: { stat, value: oneHandedBonus },
    archetype,
    branch,
    requiredLevel,
    bracket,
  });

  items.push({
    id: `mainhand-2h-${idSuffix}`,
    slot: 'mainhand',
    name: `${title}${qualityWordForBracket(bracket)}${nouns.twoHanded}·Lv${requiredLevel}(雙手)`,
    color,
    price: Math.round(price * TWO_HANDED_PRICE_MULTIPLIER),
    bonus: { stat, value: Math.round(oneHandedBonus * TWO_HANDED_BONUS_MULTIPLIER * 1000) / 1000 },
    archetype,
    branch,
    requiredLevel,
    bracket,
    twoHanded: true,
  });
}

// 跟 generateRegularSlotItems 同一套 tier1 不分支/tier2 起分支的規則,武器也是同一組 id 命名慣例
// (tier1 沿用舊格式無 branch 區段,舊玩家的 tier1 武器不受影響)。
function generateMainhandItems(): EquipmentItem[] {
  const stat = SLOT_STAT.mainhand;
  const items: EquipmentItem[] = [];
  for (const archetype of ARCHETYPES) {
    for (let bracket = 1; bracket <= BRACKET_COUNT; bracket++) {
      const requiredLevel = bracketRequiredLevel(bracket);
      const tier = getCurrentTier(requiredLevel);
      if (tier === 1) {
        const { title } = jobTierAndTitleAtLevel(archetype, 'A', requiredLevel);
        const nouns = weaponNounsFor(archetype, 'A', tier);
        const color = shiftColorForBracket(weaponColorFor(archetype, 'A', tier), bracket);
        pushMainhandPair(items, archetype, undefined, bracket, requiredLevel, title, nouns, color, stat);
        continue;
      }
      for (const branch of JOB_BRANCHES) {
        const { title } = jobTierAndTitleAtLevel(archetype, branch, requiredLevel);
        const nouns = weaponNounsFor(archetype, branch, tier);
        const color = shiftColorForBracket(weaponColorFor(archetype, branch, tier), bracket);
        pushMainhandPair(items, archetype, branch, bracket, requiredLevel, title, nouns, color, stat);
      }
    }
  }
  return items;
}

const GENERATED_REGULAR_SLOTS: EquipmentSlot[] = [
  'back',
  'bottom',
  'top',
  'belt',
  'headwear',
  'face',
  'gloves',
  'offhand',
];

const GENERATED_EQUIPMENT_ITEMS: EquipmentItem[] = [
  ...GENERATED_REGULAR_SLOTS.flatMap((slot) => generateRegularSlotItems(slot)),
  ...generateMainhandItems(),
];

export const EQUIPMENT_ITEMS: EquipmentItem[] = [
  ...LEGACY_EQUIPMENT_ITEMS,
  ...STUDENT_TIER2_EQUIPMENT_ITEMS,
  ...GENERATED_EQUIPMENT_ITEMS,
];

export type EquipmentLoadout = Partial<Record<EquipmentSlot, string>>;

export function createEmptyLoadout(): EquipmentLoadout {
  return {};
}

// 目錄有 3000+ 筆,查找一律走 Map,避免每次都線性掃描整個陣列。
const EQUIPMENT_ITEMS_BY_ID = new Map(EQUIPMENT_ITEMS.map((item) => [item.id, item]));
const EQUIPMENT_ITEMS_BY_SLOT = new Map<EquipmentSlot, EquipmentItem[]>();
for (const item of EQUIPMENT_ITEMS) {
  const list = EQUIPMENT_ITEMS_BY_SLOT.get(item.slot);
  if (list) list.push(item);
  else EQUIPMENT_ITEMS_BY_SLOT.set(item.slot, [item]);
}

export function getItemById(id: string): EquipmentItem | undefined {
  return EQUIPMENT_ITEMS_BY_ID.get(id);
}

export function getItemsForSlot(slot: EquipmentSlot): EquipmentItem[] {
  return EQUIPMENT_ITEMS_BY_SLOT.get(slot) ?? [];
}

export function isArchetypeCompatible(item: EquipmentItem, archetype: Archetype): boolean {
  return item.archetype === undefined || item.archetype === archetype;
}

// undefined = tier1 或不限分支的舊起始/學生款,兩分支都能穿;有值就只有選了同一分支的玩家能穿。
export function isBranchCompatible(item: EquipmentItem, branch: JobBranch): boolean {
  return item.branch === undefined || item.branch === branch;
}

export function isLevelSufficient(item: EquipmentItem, level: number): boolean {
  return item.requiredLevel === undefined || level >= item.requiredLevel;
}

export function canEquipItem(item: EquipmentItem, archetype: Archetype, branch: JobBranch, level: number): boolean {
  return isArchetypeCompatible(item, archetype) && isBranchCompatible(item, branch) && isLevelSufficient(item, level);
}

// 只回傳目前職業+分支能穿的款式(不限職業/分支的舊起始款 + 對應職業分支的鎖裝款),給 UI 篩選用。
export function getEquippableItemsForSlot(slot: EquipmentSlot, archetype: Archetype, branch: JobBranch): EquipmentItem[] {
  return getItemsForSlot(slot).filter((item) => isArchetypeCompatible(item, archetype) && isBranchCompatible(item, branch));
}

// 切職業/切分支後,原本裝備的職業鎖裝若跟新職業或新分支不符就直接卸下,不限職業/分支的款式不受影響。
export function filterLoadoutForJob(loadout: EquipmentLoadout, archetype: Archetype, branch: JobBranch): EquipmentLoadout {
  const next: EquipmentLoadout = {};
  for (const slot of Object.keys(loadout) as EquipmentSlot[]) {
    const itemId = loadout[slot];
    if (!itemId) continue;
    const item = getItemById(itemId);
    if (item && isArchetypeCompatible(item, archetype) && isBranchCompatible(item, branch)) next[slot] = itemId;
  }
  return next;
}

// 雙手武器裝備時副手鎖死清空;反過來裝備副手時,若目前主手是雙手武器也一併清空。
export function equipItem(loadout: EquipmentLoadout, itemId: string): EquipmentLoadout {
  const item = getItemById(itemId);
  if (!item) return loadout;

  const next: EquipmentLoadout = { ...loadout, [item.slot]: item.id };

  if (item.slot === 'mainhand' && item.twoHanded) {
    delete next.offhand;
  }

  if (item.slot === 'offhand') {
    const currentMainhand = next.mainhand ? getItemById(next.mainhand) : undefined;
    if (currentMainhand?.twoHanded) delete next.mainhand;
  }

  return next;
}

export function unequipSlot(loadout: EquipmentLoadout, slot: EquipmentSlot): EquipmentLoadout {
  const next = { ...loadout };
  delete next[slot];
  return next;
}

// 解鎖狀態:price 為 0 的起始裝一律視為已解鎖,不需要出現在清單裡。
export type UnlockedItemIds = string[];

export function createEmptyUnlockedItems(): UnlockedItemIds {
  return [];
}

export function isItemUnlocked(unlocked: UnlockedItemIds, itemId: string): boolean {
  const item = getItemById(itemId);
  if (!item) return false;
  return item.price === 0 || unlocked.includes(itemId);
}

export function unlockItem(unlocked: UnlockedItemIds, itemId: string): UnlockedItemIds {
  if (unlocked.includes(itemId)) return unlocked;
  return [...unlocked, itemId];
}

// 性別不做獨立身體變體,改用預設裝備組合(頭飾/下身/上身)區分外觀,對應 CLAUDE.md 規格。
export type Gender = 'male' | 'female';

export const GENDER_DEFAULT_LOADOUT: Record<Gender, Partial<Record<EquipmentSlot, string>>> = {
  male: { headwear: 'headwear-02', top: 'top-02', bottom: 'bottom-02' },
  female: { headwear: 'headwear-01', top: 'top-01', bottom: 'bottom-01' },
};

// 切換性別只覆蓋頭飾/上身/下身三格,武器、副手、腰帶等其餘裝備維持玩家原有選擇。
export function applyGenderDefault(loadout: EquipmentLoadout, gender: Gender): EquipmentLoadout {
  return { ...loadout, ...GENDER_DEFAULT_LOADOUT[gender] };
}

// 換性別是角色設定,不是商店消費;對應性別的頭飾/上身/下身即使原本要收費也強制免費解鎖。
export function getGenderUnlockItems(gender: Gender): string[] {
  return Object.values(GENDER_DEFAULT_LOADOUT[gender]);
}

// 座標系對應 game/sprites/heroSilhouette.ts 的原生 64 欄 x 56 列網格(密度提升後的版本,
// 原本是 20x24,座標依 x*3.2/y*2.33 等比例換算),僅以「normal」體型的輪廓比例校準;
// thin/fat 選擇時疊圖會有些微不貼合,屬於這個架構驗證階段可接受的簡化,尚未做到依體型即時縮放錨點。
//
// 座標是直接量測 buildHeroFrames('normal').open 每一列實際填色範圍校準的(不是舊錨點等比例
// 縮放算出來的——早一版直接用線性倍率換算,沒考慮到新輪廓多了手臂,肩寬佔比本來就比舊版
// 大,疊圖套上去比例會比身體本身還誇張、看起來「穿太大件」,所以改成量真實輪廓校準)。
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SLOT_ANCHORS: Record<EquipmentSlot, Rect[]> = {
  // 背飾:比肩寬(22-41)略寬,露出一點在身體兩側,做出斗篷飄出來的感覺。
  back: [{ x: 19, y: 23, w: 26, h: 16 }],
  // 下身:雙腿外框(26-37),扣掉腰帶/上衣範圍往下。
  bottom: [{ x: 26, y: 39, w: 12, h: 13 }],
  // 上身:軀幹布料核心寬度(22-41),往兩側各多蓋一點到袖口區(D遮蔽),不會露出沒穿到的縫隙。
  top: [{ x: 20, y: 25, w: 24, h: 12 }],
  // 腰帶:腰帶列本身寬度(26-37)。
  belt: [{ x: 26, y: 37, w: 12, h: 2 }],
  // 頭飾:蓋住頭髮最寬的上半段(row4-11,peak width 22),留下方2列頭髮當瀏海。
  headwear: [{ x: 21, y: 4, w: 22, h: 8 }],
  // 面飾:眼睛所在列(row16-17)附近的窄框。
  face: [{ x: 26, y: 15, w: 12, h: 4 }],
  gloves: [
    { x: 13, y: 28, w: 4, h: 4 },
    { x: 47, y: 28, w: 4, h: 4 },
  ],
  offhand: [{ x: 8, y: 24, w: 14, h: 14 }],
  // 跟武器外型(game/sprites/weapons.ts,放大3倍後 18x30)完全對齊,不拉伸變形。
  mainhand: [{ x: 45, y: 19, w: 18, h: 30 }],
};

// 疊圖繪製順序,對應 CLAUDE.md 文件的 z-order:背飾→下身→上身→腰帶→頭飾→面飾→手套→副手→主手武器。
export const SLOT_Z_ORDER: EquipmentSlot[] = [
  'back',
  'bottom',
  'top',
  'belt',
  'headwear',
  'face',
  'gloves',
  'offhand',
  'mainhand',
];

export interface EquipmentOverlay {
  rect: Rect;
  color: string;
  slot: EquipmentSlot;
  item: EquipmentItem;
}

export function getEquippedOverlays(loadout: EquipmentLoadout): EquipmentOverlay[] {
  const overlays: EquipmentOverlay[] = [];
  for (const slot of SLOT_Z_ORDER) {
    const itemId = loadout[slot];
    if (!itemId) continue;
    const item = getItemById(itemId);
    if (!item) continue;
    for (const rect of SLOT_ANCHORS[slot]) {
      overlays.push({ rect, color: item.color, slot, item });
    }
  }
  return overlays;
}

export interface EquipmentBonusTotals {
  exp: number;
  coins: number;
  speed: number;
}

// 裝備加成總和(百分比),供 game/battle.ts 換算成擊殺獎勵/戰鬥時長的乘數;只算目前已裝備的項目。
export function getEquipmentBonusTotals(loadout: EquipmentLoadout): EquipmentBonusTotals {
  const totals: EquipmentBonusTotals = { exp: 0, coins: 0, speed: 0 };
  for (const slot of Object.keys(loadout) as EquipmentSlot[]) {
    const itemId = loadout[slot];
    if (!itemId) continue;
    const item = getItemById(itemId);
    if (!item) continue;
    totals[item.bonus.stat] += item.bonus.value;
  }
  return totals;
}

// ---- 隨機素質 / 隱藏素質 ----
// 每件裝備第一次裝備時額外擲兩條這個池子裡的素質:一條「隨機素質」立即生效,一條「隱藏素質」
// 要花錢鑑定過才會生效,鑑定前數值未知。跟主加成(exp/coins/speed)是完全獨立的維度,
// critRate 影響戰鬥擊殺獎勵翻倍機率,resistance 留給強化系統用來降低失敗率。
export type SubstatType =
  | 'critRate' | 'resistance' // 舊版素質,只留給改版前已擲出的老裝備讀取,不再新擲出
  | 'physicalResistance' | 'magicResistance'
  | 'physicalCritRate' | 'physicalCritDamage'
  | 'magicCritRate' | 'magicCritDamage'
  | 'physicalAttack' | 'magicAttack'
  // 吸血/回血(見 game/heroHealth.ts):跟其餘素質不同,不分物理/魔法,是全職業共用的單一維度。
  | 'lifesteal' | 'hpRegen';

export interface Substat {
  type: SubstatType;
  value: number;
}

// 鑲入插槽的寶石不只記種類,還要記是第幾階(見下方鑲嵌系統),拔除才能原樣退回對應階級的庫存,
// 不會退成一律歸零階或直接消失。
export interface SocketedGem {
  type: GemType;
  tier: MaterialTier;
}

export interface ItemInstanceData {
  randomSubstat: Substat;
  hiddenSubstat: Substat;
  identified: boolean;
  enhanceLevel: number;
  socketedGems: (SocketedGem | null)[];
}

const SUBSTAT_TYPES: SubstatType[] = [
  'physicalResistance', 'magicResistance',
  'physicalCritRate', 'physicalCritDamage',
  'magicCritRate', 'magicCritDamage',
  'physicalAttack', 'magicAttack',
  'lifesteal', 'hpRegen',
];
const SUBSTAT_MAGNITUDE = 0.6; // 副素質整體比主加成弱一截,不會喧賓奪主
const SUBSTAT_VARIANCE_MIN = 0.7;
const SUBSTAT_VARIANCE_RANGE = 0.6; // 實際擲出 0.7~1.3 倍的隨機區間

function rollSubstat(bracket: number, rng: () => number): Substat {
  const type = SUBSTAT_TYPES[Math.floor(rng() * SUBSTAT_TYPES.length)];
  const base = bracketBonusValue(bracket) * SUBSTAT_MAGNITUDE;
  const variance = SUBSTAT_VARIANCE_MIN + rng() * SUBSTAT_VARIANCE_RANGE;
  const value = Math.round(base * variance * 1000) / 1000;
  return { type, value };
}

// 第一次裝備某款裝備時呼叫一次,擲出這件的隨機/隱藏素質並固定下來,之後不會再重擲。
export function rollItemInstance(item: EquipmentItem, rng: () => number = Math.random): ItemInstanceData {
  // 生成式目錄的裝備一律已經帶著自己的 bracket 序數(1-50),直接用它算副素質強度;
  // 不限等級檔的起始款/學生款(bracket undefined)一律當 bracket=1 處理。
  // (bracketRequiredLevel 調整成 Lv30起跳的非等距公式後,不能再用 requiredLevel 反推 bracket。)
  const bracket = item.bracket ?? 1;
  return {
    randomSubstat: rollSubstat(bracket, rng),
    hiddenSubstat: rollSubstat(bracket, rng),
    identified: false,
    enhanceLevel: 0,
    socketedGems: new Array(getSocketCount(item)).fill(null),
  };
}

export type ItemInstances = Record<string, ItemInstanceData>;

// v12 存檔的 itemInstances 沒有 enhanceLevel/socketedGems(強化/鑲嵌系統還沒出生),
// 遷移到 v13 時用這個補齊:強化 0 級、插槽依裝備當下的規則清空。
export function upgradeItemInstancesToV13(
  instances: Record<string, { randomSubstat: Substat; hiddenSubstat: Substat; identified: boolean }>
): ItemInstances {
  const upgraded: ItemInstances = {};
  for (const [id, data] of Object.entries(instances)) {
    const item = getItemById(id);
    upgraded[id] = {
      ...data,
      enhanceLevel: 0,
      socketedGems: new Array(item ? getSocketCount(item) : 1).fill(null),
    };
  }
  return upgraded;
}

export function createEmptyItemInstances(): ItemInstances {
  return {};
}

export interface SubstatTotals {
  physicalResistance: number;
  magicResistance: number;
  physicalCritRate: number;
  physicalCritDamage: number;
  magicCritRate: number;
  magicCritDamage: number;
  physicalAttack: number;
  magicAttack: number;
  lifesteal: number;
  hpRegen: number;
}

function addSubstatToTotals(totals: SubstatTotals, substat: Substat): void {
  switch (substat.type) {
    case 'physicalResistance': totals.physicalResistance += substat.value; break;
    case 'magicResistance': totals.magicResistance += substat.value; break;
    case 'physicalCritRate': totals.physicalCritRate += substat.value; break;
    case 'physicalCritDamage': totals.physicalCritDamage += substat.value; break;
    case 'magicCritRate': totals.magicCritRate += substat.value; break;
    case 'magicCritDamage': totals.magicCritDamage += substat.value; break;
    case 'physicalAttack': totals.physicalAttack += substat.value; break;
    case 'magicAttack': totals.magicAttack += substat.value; break;
    case 'lifesteal': totals.lifesteal += substat.value; break;
    case 'hpRegen': totals.hpRegen += substat.value; break;
    // 舊資料相容:改版前掉落的裝備只有籠統的「抗性」/「爆擊率」,兩池都算數,
    // 老玩家的既有投資不會因為改版突然貶值。
    case 'resistance':
      totals.physicalResistance += substat.value;
      totals.magicResistance += substat.value;
      break;
    case 'critRate':
      totals.physicalCritRate += substat.value;
      totals.magicCritRate += substat.value;
      break;
  }
}

// 只算目前已裝備的項目;隱藏素質要鑑定過(identified)才計入。
// 素質類鑲嵌石(見下方鑲嵌系統)直接疊加進同一組總表,跟裝備本身的隨機/隱藏素質是同一個維度——
// 對戰鬥計算/UI顯示來說「這件裝備+鑲的石頭」本來就該是同一份合計,不需要另外拆一份
// getSubstatTotalsFull。
export function getSubstatTotals(loadout: EquipmentLoadout, instances: ItemInstances): SubstatTotals {
  const totals: SubstatTotals = {
    physicalResistance: 0, magicResistance: 0,
    physicalCritRate: 0, physicalCritDamage: 0,
    magicCritRate: 0, magicCritDamage: 0,
    physicalAttack: 0, magicAttack: 0,
    lifesteal: 0, hpRegen: 0,
  };
  for (const slot of Object.keys(loadout) as EquipmentSlot[]) {
    const itemId = loadout[slot];
    if (!itemId) continue;
    const instance = instances[itemId];
    if (!instance) continue;
    addSubstatToTotals(totals, instance.randomSubstat);
    if (instance.identified) addSubstatToTotals(totals, instance.hiddenSubstat);
    for (const socketed of instance.socketedGems) {
      if (!socketed) continue;
      const spec = GEM_SPECS[socketed.type];
      if (spec.kind === 'substat') {
        addSubstatToTotals(totals, { type: spec.stat, value: gemValueAtTier(spec.baseValue, socketed.tier) });
      }
    }
  }
  return totals;
}

const IDENTIFY_COST_MULTIPLIER = 0.5;

// 鑑定花費跟這件裝備的原價掛勾,越貴的裝備鑑定費越高。
export function getIdentifyCost(item: EquipmentItem): number {
  return Math.max(1, Math.round(item.price * IDENTIFY_COST_MULTIPLIER));
}

// 重擲隨機/隱藏素質:比鑑定貴(裝備/技能/寵物都點滿之後金幣缺乏長期去化管道,這裡故意訂得
// 比鑑定費高一截,才撐得起「無底洞消耗」的定位,不會變成隨手就能重擲的廉價操作)。
const REROLL_COST_MULTIPLIER = 1.5;

export function getRerollCost(item: EquipmentItem): number {
  return Math.max(1, Math.round(item.price * REROLL_COST_MULTIPLIER));
}

// 花金幣把已擁有裝備的隨機+隱藏素質一起重擲(不能只挑一項重擲),強化等級/鑲嵌/鑑定狀態
// 全部維持原樣——重擲賭的是「素質種類/數值運氣」,不影響玩家已經投入的其他資源。
export function rerollItemSubstats(
  item: EquipmentItem,
  instance: ItemInstanceData,
  rng: () => number = Math.random
): ItemInstanceData {
  const bracket = item.bracket ?? 1;
  return {
    ...instance,
    randomSubstat: rollSubstat(bracket, rng),
    hiddenSubstat: rollSubstat(bracket, rng),
  };
}

// ---- 強化系統 ----
// 花金幣 + 強化石把裝備從 +0 強化到 +10,每級疊加主加成的固定比例。Lv1~5 是安全區,失敗只
// 浪費資源;Lv6~10 失敗有機會降級或直接損毀裝備,抗性素質(見上方隨機/隱藏素質)降低失敗率。
export const ENHANCE_MAX_LEVEL = 10;
export const ENHANCE_STONE_PRICE = 50; // 商店直接用金幣買強化石的價格(掉落是另一條免費取得的路)
const ENHANCE_BONUS_PER_LEVEL = 0.08;
const ENHANCE_SAFE_LEVEL = 5;
const ENHANCE_BASE_FAIL_CHANCE = 0.05;
const ENHANCE_FAIL_CHANCE_PER_LEVEL = 0.05;
const ENHANCE_MAX_FAIL_CHANCE = 0.6;
const ENHANCE_MIN_FAIL_CHANCE = 0.01;
const ENHANCE_DESTROY_SHARE = 0.5; // 危險區失敗時,一半機率降級、一半機率損毀

// 強化後的實際加成值(疊加在裝備原本的主加成上),UI/戰鬥計算都要用這個而不是 item.bonus.value。
export function getEnhancedBonusValue(item: EquipmentItem, instance: ItemInstanceData | undefined): number {
  const level = instance?.enhanceLevel ?? 0;
  return Math.round(item.bonus.value * (1 + level * ENHANCE_BONUS_PER_LEVEL) * 1000) / 1000;
}

export function getEnhanceCoinCost(item: EquipmentItem, currentLevel: number): number {
  return Math.round(item.price * (0.3 + currentLevel * 0.15));
}

export function getEnhanceStoneCost(currentLevel: number): number {
  return currentLevel + 1;
}

function itemInstanceResistance(instance: ItemInstanceData): number {
  const isResistance = (s: Substat) =>
    s.type === 'resistance' || s.type === 'physicalResistance' || s.type === 'magicResistance';
  let total = 0;
  if (isResistance(instance.randomSubstat)) total += instance.randomSubstat.value;
  if (instance.identified && isResistance(instance.hiddenSubstat)) total += instance.hiddenSubstat.value;
  return total;
}

// 目標等級(currentLevel+1)決定基礎失敗率,裝備自己的抗性素質(不是全身加總)拉低失敗率。
export function getEnhanceFailChance(instance: ItemInstanceData, currentLevel: number): number {
  const base = Math.min(ENHANCE_MAX_FAIL_CHANCE, ENHANCE_BASE_FAIL_CHANCE + currentLevel * ENHANCE_FAIL_CHANCE_PER_LEVEL);
  const reduced = base - itemInstanceResistance(instance);
  return Math.max(ENHANCE_MIN_FAIL_CHANCE, reduced);
}

export type EnhanceOutcome = 'success' | 'fail_safe' | 'fail_downgrade' | 'fail_destroy';

// 純函式,方便測試:傳固定 rng 就能重現結果。丟出這次強化(currentLevel -> currentLevel+1)的結果,
// 呼叫端負責照結果更新/刪除 instance。
export function rollEnhanceOutcome(
  instance: ItemInstanceData,
  currentLevel: number,
  rng: () => number = Math.random
): EnhanceOutcome {
  const failChance = getEnhanceFailChance(instance, currentLevel);
  if (rng() >= failChance) return 'success';
  const targetLevel = currentLevel + 1;
  if (targetLevel <= ENHANCE_SAFE_LEVEL) return 'fail_safe';
  return rng() < ENHANCE_DESTROY_SHARE ? 'fail_destroy' : 'fail_downgrade';
}

// ---- 鑲嵌系統 ----
// 寶石鑲入裝備插槽,分兩大類:exp/coins/speed(跟裝備主加成同一個維度)+ 素質類(跟裝備
// 隨機/隱藏素質同一個維度,見上方 SubstatType,涵蓋物理/魔法抗性、爆擊率、爆擊傷害、攻擊力、
// 吸血、回血共10種)。插槽數依裝備階級(1~5階對應1~3格)。每種寶石各自走「初階~五階」分階制
// (見 game/materials.ts 的 TieredMaterialCounts/canCraftMaterialTier/craftMaterialTier,
// 直接沿用同一套2:1合成規則,不重新發明),數值隨階級遞增。雙軌取得:戰鬥獨立掉落+商店用金幣買
// (兩者都固定初階,更高階只能自己合成),拔除寶石不會損毀、原樣退回對應階級的庫存。
export type GemType =
  | 'expGem' | 'coinGem' | 'speedGem'
  | 'physicalResistanceGem' | 'magicResistanceGem'
  | 'physicalCritRateGem' | 'physicalCritDamageGem'
  | 'magicCritRateGem' | 'magicCritDamageGem'
  | 'physicalAttackGem' | 'magicAttackGem'
  | 'lifestealGem' | 'hpRegenGem';

type GemSpec =
  | { kind: 'bonus'; stat: EquipmentBonusStat; baseValue: number; price: number; name: string }
  | { kind: 'substat'; stat: SubstatType; baseValue: number; price: number; name: string };

export const GEM_SPECS: Record<GemType, GemSpec> = {
  expGem: { kind: 'bonus', stat: 'exp', baseValue: 0.03, price: 80, name: '經驗石' },
  coinGem: { kind: 'bonus', stat: 'coins', baseValue: 0.03, price: 80, name: '金幣石' },
  speedGem: { kind: 'bonus', stat: 'speed', baseValue: 0.03, price: 80, name: '速度石' },
  physicalResistanceGem: { kind: 'substat', stat: 'physicalResistance', baseValue: 0.03, price: 80, name: '物理抗性石' },
  magicResistanceGem: { kind: 'substat', stat: 'magicResistance', baseValue: 0.03, price: 80, name: '魔法抗性石' },
  physicalCritRateGem: { kind: 'substat', stat: 'physicalCritRate', baseValue: 0.03, price: 80, name: '物理爆擊率石' },
  physicalCritDamageGem: { kind: 'substat', stat: 'physicalCritDamage', baseValue: 0.03, price: 80, name: '物理爆擊傷害石' },
  magicCritRateGem: { kind: 'substat', stat: 'magicCritRate', baseValue: 0.03, price: 80, name: '魔法爆擊率石' },
  magicCritDamageGem: { kind: 'substat', stat: 'magicCritDamage', baseValue: 0.03, price: 80, name: '魔法爆擊傷害石' },
  physicalAttackGem: { kind: 'substat', stat: 'physicalAttack', baseValue: 0.03, price: 80, name: '物理攻擊石' },
  magicAttackGem: { kind: 'substat', stat: 'magicAttack', baseValue: 0.03, price: 80, name: '魔法攻擊石' },
  lifestealGem: { kind: 'substat', stat: 'lifesteal', baseValue: 0.03, price: 80, name: '吸血石' },
  hpRegenGem: { kind: 'substat', stat: 'hpRegen', baseValue: 0.03, price: 80, name: '回血石' },
};

export const GEM_TYPES: GemType[] = [
  'expGem', 'coinGem', 'speedGem',
  'physicalResistanceGem', 'magicResistanceGem',
  'physicalCritRateGem', 'physicalCritDamageGem',
  'magicCritRateGem', 'magicCritDamageGem',
  'physicalAttackGem', 'magicAttackGem',
  'lifestealGem', 'hpRegenGem',
];

// 階級對數值的加成:跟強化系統(ENHANCE_BONUS_PER_LEVEL)同一種「基準值 * (1 + 階級*係數)」寫法,
// 五階(tier5)剛好是基準值的兩倍。
const GEM_TIER_VALUE_STEP = 0.2;

export function gemValueAtTier(baseValue: number, tier: MaterialTier): number {
  return Math.round(baseValue * (1 + tier * GEM_TIER_VALUE_STEP) * 10000) / 10000;
}

// 強化石/寶石掉落:跟寵物/坐騎掉落一樣,每次擊殺獨立判定一次,互不干擾、多數時候不會掉落。
// 強化石從4%拉到8%(技能書同步從8%拉到15%,見 game/skillTree.ts 的 SKILL_BOOK_DROP_CHANCE)
// 回應取得量太慢的回饋;寶石維持4%不變(取得速度另外靠新增的鑲嵌石副本補)。
// 兩個常數 export 出去給 game/offlineProgress.ts 算離線期間的期望值掉落用,單一真相來源。
export const ENHANCE_STONE_DROP_CHANCE = 0.08;
export const GEM_DROP_CHANCE = 0.04;

export function rollEnhanceStoneDrop(rng: () => number = Math.random): boolean {
  return rng() < ENHANCE_STONE_DROP_CHANCE;
}

// 掉落固定初階(tier 0),跟技能書/強化石既有掉落機制一致,更高階只能靠合成。
export function rollGemDrop(rng: () => number = Math.random): GemType | null {
  if (rng() >= GEM_DROP_CHANCE) return null;
  return GEM_TYPES[Math.floor(rng() * GEM_TYPES.length)];
}

// 裝備掉落:跟上面幾種掉落同一套獨立判定模式,中了直接免費解鎖一件目前職業/等級穿得下的
// 付費款(不含 price=0 的起始款,那些本來就已解鎖),優先掉還沒解鎖過的款式讓抽到的東西
// 對玩家有意義;真的全部解鎖完了(邊緣情況)才會允許重複掉落,純粹避免回傳 null。
// export 出去給 game/offlineProgress.ts 算離線期間的期望值掉落次數用,單一真相來源。
export const EQUIPMENT_DROP_CHANCE = 0.05;

function pickEquipmentDrop(
  archetype: Archetype,
  branch: JobBranch,
  level: number,
  unlockedItemIds: UnlockedItemIds,
  rng: () => number
): EquipmentItem | null {
  const eligible = EQUIPMENT_ITEMS.filter((item) => item.price > 0 && canEquipItem(item, archetype, branch, level));
  if (eligible.length === 0) return null;
  const notYetUnlocked = eligible.filter((item) => !isItemUnlocked(unlockedItemIds, item.id));
  const pool = notYetUnlocked.length > 0 ? notYetUnlocked : eligible;
  return pool[Math.floor(rng() * pool.length)];
}

export function rollEquipmentDrop(
  archetype: Archetype,
  branch: JobBranch,
  level: number,
  unlockedItemIds: UnlockedItemIds,
  rng: () => number = Math.random
): EquipmentItem | null {
  if (rng() >= EQUIPMENT_DROP_CHANCE) return null;
  return pickEquipmentDrop(archetype, branch, level, unlockedItemIds, rng);
}

// 離線期間用:呼叫端已經用「擊殺數×EQUIPMENT_DROP_CHANCE」算好期望掉落次數(dropCount),
// 這裡不用再擲一次「有沒有掉」的亂數,只需要逐次決定「掉到哪一件」——每次都用當下最新的
// unlockedItemIds 判斷優先度,模擬連續多次掉落時「優先掉還沒解鎖過的」跟即時戰鬥同樣的體感。
export function rollOfflineEquipmentDrops(
  dropCount: number,
  archetype: Archetype,
  branch: JobBranch,
  level: number,
  unlockedItemIds: UnlockedItemIds,
  rng: () => number = Math.random
): EquipmentItem[] {
  const drops: EquipmentItem[] = [];
  let currentUnlocked = unlockedItemIds;
  for (let i = 0; i < dropCount; i++) {
    const picked = pickEquipmentDrop(archetype, branch, level, currentUnlocked, rng);
    if (!picked) break;
    drops.push(picked);
    currentUnlocked = unlockItem(currentUnlocked, picked.id);
  }
  return drops;
}

export function getSocketCount(item: EquipmentItem): number {
  const tier = getCurrentTier(item.requiredLevel ?? 1);
  return Math.ceil(tier / 2);
}

// 每種寶石各自一份「初階~五階」持有量,跟技能書/強化石的 TieredMaterialCounts 同一套形狀。
export type GemCounts = Record<GemType, TieredMaterialCounts>;

export function createEmptyGemCounts(): GemCounts {
  const empty = {} as GemCounts;
  for (const gemType of GEM_TYPES) empty[gemType] = createEmptyTieredMaterialCounts();
  return empty;
}

// 商店買寶石固定拿初階(tier 0),跟強化石購買同一套規則,更高階只能自己合成。
export function grantGemDrop(counts: GemCounts, gemType: GemType): GemCounts {
  return { ...counts, [gemType]: { ...counts[gemType], 0: counts[gemType][0] + 1 } };
}

export function canCraftGemTier(gemType: GemType, tier: MaterialTier, counts: GemCounts): boolean {
  return canCraftMaterialTier(tier, counts[gemType]);
}

export function craftGemTier(gemType: GemType, tier: MaterialTier, counts: GemCounts): GemCounts {
  return { ...counts, [gemType]: craftMaterialTier(tier, counts[gemType]) };
}

// 只算目前已裝備項目上鑲嵌的加成類(exp/coins/speed)寶石,跟裝備主加成/強化是同一個維度,
// 直接相加;素質類寶石併進 getSubstatTotals 那份總表,不是同一個維度不能混在一起加。
export function getGemBonusTotals(loadout: EquipmentLoadout, instances: ItemInstances): EquipmentBonusTotals {
  const totals: EquipmentBonusTotals = { exp: 0, coins: 0, speed: 0 };
  for (const slot of Object.keys(loadout) as EquipmentSlot[]) {
    const itemId = loadout[slot];
    if (!itemId) continue;
    const instance = instances[itemId];
    if (!instance) continue;
    for (const socketed of instance.socketedGems) {
      if (!socketed) continue;
      const spec = GEM_SPECS[socketed.type];
      if (spec.kind === 'bonus') totals[spec.stat] += gemValueAtTier(spec.baseValue, socketed.tier);
    }
  }
  return totals;
}

// 裝備主加成(含強化)+鑲嵌寶石的完整加總,取代單純只看 item.bonus.value 的 getEquipmentBonusTotals。
export function getEquipmentBonusTotalsFull(loadout: EquipmentLoadout, instances: ItemInstances): EquipmentBonusTotals {
  const totals: EquipmentBonusTotals = { exp: 0, coins: 0, speed: 0 };
  for (const slot of Object.keys(loadout) as EquipmentSlot[]) {
    const itemId = loadout[slot];
    if (!itemId) continue;
    const item = getItemById(itemId);
    if (!item) continue;
    totals[item.bonus.stat] += getEnhancedBonusValue(item, instances[itemId]);
  }
  const gemTotals = getGemBonusTotals(loadout, instances);
  totals.exp += gemTotals.exp;
  totals.coins += gemTotals.coins;
  totals.speed += gemTotals.speed;
  return totals;
}
