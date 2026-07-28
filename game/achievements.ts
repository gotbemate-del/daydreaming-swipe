import { ENHANCE_MAX_LEVEL, GemType } from './equipment';
import { MaterialTier } from './materials';

// 成就系統:純函式,不依賴 React/RN,可在 Node 環境單獨測試(見 CLAUDE.md 分層鐵律)。
// 26 個手刻成就分 6 類(擊殺數/等級里程碑/裝備收集/強化鑲嵌/寵物坐騎/轉職)+ 76 個
// 「關卡里程碑」(stage,見下面 STAGE_MILESTONES)用資料表+迴圈生成,不逐筆手刻物件實字。
// 判定邏輯是「全量重新計算」(evaluateUnlockedAchievementIds),不是增量判定——
// 這樣舊存檔(功能上線前就已經達標)第一次載入時能立刻被追溯性授予,不會因為
// 「達標當下這個功能還不存在」而被擋下。
export type AchievementCategory = 'kills' | 'level' | 'equipment' | 'enhance' | 'companion' | 'transfer' | 'stage';

export interface AchievementReward {
  coins: number;
  exp?: number;
  enhanceStones?: number;
  skillBooks?: number;
  gems?: Partial<Record<GemType, number>>;
}

// tier(見 game/materials.ts 的 MaterialTier):這個成就大概對應玩家「成長到哪個階段」才會
// 達成,不是裝備/技能書本身的階級——用來決定 (1) 獎勵裡的強化石/技能書要發到哪一階
// (呼應「依對應等級提供同階素材」的需求,不再一律發初階),(2) 成就列表要依成長排序時的
// 主要排序鍵(見 components/AchievementPanel.tsx 的 sortAchievementsByGrowth)。
export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  tier: MaterialTier;
  title: string;
  description: string;
  reward: AchievementReward;
}

// 呼叫端(hooks/useGameState.ts)負責從即時狀態算出這份快照再傳進來,這個檔案本身不碰任何
// zustand store,維持純函式可測試性。
export interface AchievementProgress {
  killCount: number;
  level: number;
  unlockedPaidItemCount: number;
  totalPaidItemCount: number;
  maxEnhanceLevel: number;
  hasFullySocketedItem: boolean;
  companionUnlockedCount: number;
  totalCompanionCount: number;
  hasAssembledTransferProof: boolean;
  hasSwitchedJobOnce: boolean;
  // 這輩子累計清完的大關數(game/stages.ts 的 totalStagesCleared,永不因輪迴繞圈歸零)。
  totalStagesCleared: number;
}

// 關卡里程碑成就:呼應「勇者發呆中」的發呆主題,前段謙虛(剛睡醒)、中後段逐漸誇張到宇宙尺度。
// threshold 是「累計清完幾個大關」(=totalStagesCleared),對應的實際關卡數是 threshold*10——
// 第 1~20 關(小關計:第10~200關)每清1大關一個里程碑,第25關起(第250關起)每5大關一個,
// 呼應 game/stages.ts 的 300 大關 x 10 小關 = 3000 關設計。id 用實際關卡數命名(stage_N),
// 資料表只放創作內容(標題/描述),數值(reward)另外用公式算,不逐筆手刻,避免76筆手算出錯。
interface StageMilestoneDef {
  threshold: number;
  title: string;
  description: string;
}

const STAGE_MILESTONES: StageMilestoneDef[] = [
  { threshold: 1, title: '剛睡醒的勇者', description: '抵達第10關,眼睛還沒完全睜開就把敵人打趴了' },
  { threshold: 2, title: '呆滯戰鬥新手', description: '抵達第20關,一邊放空一邊揮劍,意外地順手' },
  { threshold: 3, title: '神遊起步', description: '抵達第30關,腦袋放假,身體還在加班' },
  { threshold: 4, title: '放空初心者', description: '抵達第40關,發呆的基本功練起來了' },
  { threshold: 5, title: '發呆也是修行', description: '抵達第50關,悟出「打怪跟放空可以同時進行」的道理' },
  { threshold: 6, title: '心不在焉流', description: '抵達第60關,靠本能反應打贏一半戰鬥' },
  { threshold: 7, title: '半夢半醒斬妖除魔', description: '抵達第70關,分不清是在打怪還是在做夢' },
  { threshold: 8, title: '恍神連擊', description: '抵達第80關,連續好幾場戰鬥都不記得怎麼贏的' },
  { threshold: 9, title: '發呆值全滿', description: '抵達第90關,專注力歸零,戰鬥力卻沒掉' },
  { threshold: 10, title: '百戰百「呆」', description: '抵達第100關,打了一百場都用同一種恍神表情應付' },
  { threshold: 11, title: '呆滯眼神鑑定合格', description: '抵達第110關,連怪物看了都覺得這眼神很專業' },
  { threshold: 12, title: '邊打邊放空', description: '抵達第120關,證明多工處理是可能的(前提是放空那項不用花力氣)' },
  { threshold: 13, title: '專業神遊選手', description: '抵達第130關,神遊技巧已經練到出神入化' },
  { threshold: 14, title: '呆到連自己都佩服', description: '抵達第140關,連自己都不知道剛剛在想什麼' },
  { threshold: 15, title: '半路殺出的發呆高手', description: '抵達第150關,靠純粹的放空撐過了半程' },
  { threshold: 16, title: '打怪打到出神', description: '抵達第160關,眼神空洞,劍法卻沒亂' },
  { threshold: 17, title: '發呆界新星', description: '抵達第170關,同期勇者都對這股恍神氣場甘拜下風' },
  { threshold: 18, title: '快畢業的發呆生', description: '抵達第180關,離「發呆學位」只差臨門一腳' },
  { threshold: 19, title: '發呆學分修好修滿', description: '抵達第190關,這輩子的放空額度都點滿了' },
  { threshold: 20, title: '職業發呆選手', description: '抵達第200關,官方認證的全職發呆型勇者' },
  { threshold: 25, title: '發呆宗師見習', description: '抵達第250關,開始有徒弟想拜師學放空' },
  { threshold: 30, title: '放空即戰力', description: '抵達第300關,證明了發呆本身就是一種戰鬥力' },
  { threshold: 35, title: '神遊戰場常勝軍', description: '抵達第350關,腦袋在別的次元,勝率卻沒掉過' },
  { threshold: 40, title: '恍神連勝紀錄保持人', description: '抵達第400關,打破自己上一次的恍神連勝紀錄' },
  { threshold: 45, title: '打瞌睡打出真本事', description: '抵達第450關,連打瞌睡都能打出真功夫' },
  { threshold: 50, title: '傳說發呆冒險者', description: '抵達第500關,故事開始在酒館裡流傳' },
  { threshold: 55, title: '半睡半醒踏破千軍', description: '抵達第550關,睡意跟戰意左右互搏,戰意驚險勝出' },
  { threshold: 60, title: '發呆界活傳奇', description: '抵達第600關,新人勇者都聽過這號人物' },
  { threshold: 65, title: '精神抽離戰鬥法', description: '抵達第650關,肉體在打怪,精神在放假' },
  { threshold: 70, title: '打瞌睡打出神級反射', description: '抵達第700關,眼睛閉著也能躲過攻擊' },
  { threshold: 75, title: '神遊天外還贏', description: '抵達第750關,腦袋飛去外太空,劍還是有刺中' },
  { threshold: 80, title: '傳說級恍神紀錄', description: '抵達第800關,連紀錄官都懶得再統計了' },
  { threshold: 85, title: '打怪如打呵欠', description: '抵達第850關,揮劍已經變成反射動作,跟打呵欠一樣自然' },
  { threshold: 90, title: '發呆宗師認證', description: '抵達第900關,官方頒發「發呆宗師」證書一張' },
  { threshold: 95, title: '千關不倒的恍神體', description: '抵達第950關,體力早就交給精神狀態去扛了' },
  { threshold: 100, title: '千關傳說', description: '抵達第1000關,正式邁入四位數關卡的傳說領域' },
  { threshold: 105, title: '超凡發呆入門', description: '抵達第1050關,凡人等級的發呆已經不夠形容' },
  { threshold: 110, title: '精神超載也淡定', description: '抵達第1100關,腦袋當機照樣過關' },
  { threshold: 115, title: '半神半呆', description: '抵達第1150關,戰鬥力逼近神格,恍神程度也是' },
  { threshold: 120, title: '超越常人的放空力', description: '抵達第1200關,一般勇者理解不了這種境界' },
  { threshold: 125, title: '意識飄移戰鬥術', description: '抵達第1250關,意識飄到半空中還能精準命中' },
  { threshold: 130, title: '打怪如呼吸', description: '抵達第1300關,揮劍已經比呼吸還不需要思考' },
  { threshold: 135, title: '超凡入聖的呆滯感', description: '抵達第1350關,呆滯到有種脫俗的美感' },
  { threshold: 140, title: '傳說中的傳說', description: '抵達第1400關,連傳說裡都開始傳說這個傳說' },
  { threshold: 145, title: '千四關不滅意志', description: '抵達第1450關,意志力比清醒度撐得更久' },
  { threshold: 150, title: '半程宇宙發呆使者', description: '抵達第1500關,正式進入宇宙尺度的發呆旅程' },
  { threshold: 155, title: '星際級放空力', description: '抵達第1550關,放空範圍已經不只地球' },
  { threshold: 160, title: '銀河等級恍神', description: '抵達第1600關,恍神程度連銀河系都感應得到' },
  { threshold: 165, title: '宇宙漫遊打怪王', description: '抵達第1650關,一邊神遊宇宙一邊順手清怪' },
  { threshold: 170, title: '星辰都為之發呆', description: '抵達第1700關,連星星看了都忍不住跟著放空' },
  { threshold: 175, title: '宇宙級發呆選手', description: '抵達第1750關,代表全宇宙出賽發呆項目' },
  { threshold: 180, title: '銀河發呆代表隊', description: '抵達第1800關,正式入選銀河等級代表隊' },
  { threshold: 185, title: '星際放空紀錄保持人', description: '抵達第1850關,紀錄刷新到連外星人都佩服' },
  { threshold: 190, title: '宇宙盡頭前的堅持', description: '抵達第1900關,快到盡頭了,恍神程度絲毫不減' },
  { threshold: 195, title: '準宇宙盡頭勇者', description: '抵達第1950關,只差臨門一腳就能抵達傳說終點' },
  { threshold: 200, title: '兩千關傳奇', description: '抵達第2000關,正式踏入兩千大關的傳說殿堂' },
  { threshold: 205, title: '時空發呆啟程', description: '抵達第2050關,發呆開始超越時間本身' },
  { threshold: 210, title: '穿越時空也要放空', description: '抵達第2100關,連時空跳躍都不影響放空節奏' },
  { threshold: 215, title: '時間感全面消失', description: '抵達第2150關,連時間流速都感覺不到了' },
  { threshold: 220, title: '時空亂流中的淡定', description: '抵達第2200關,時空再亂,恍神姿勢照樣標準' },
  { threshold: 225, title: '跨維度發呆使者', description: '抵達第2250關,連別的維度都感受得到這股呆氣' },
  { threshold: 230, title: '時光旅人的恍神', description: '抵達第2300關,穿越各個時代都保持同一種眼神' },
  { threshold: 235, title: '時空盡頭的守望者', description: '抵達第2350關,在時間盡頭默默放空守望' },
  { threshold: 240, title: '超越因果的放空力', description: '抵達第2400關,連因果律都拿這股呆氣沒轍' },
  { threshold: 245, title: '時空級傳說勇者', description: '抵達第2450關,傳說等級已經升級到時空規格' },
  { threshold: 250, title: '兩千五百關傳奇', description: '抵達第2500關,四分之三的旅程已經走完' },
  { threshold: 255, title: '終焉將近的堅持', description: '抵達第2550關,終點在望,恍神依舊不打折' },
  { threshold: 260, title: '最終章發呆勇者', description: '抵達第2600關,故事進入最終章節' },
  { threshold: 265, title: '逼近極限的放空力', description: '抵達第2650關,連放空能力都快要突破極限' },
  { threshold: 270, title: '終極恍神體', description: '抵達第2700關,恍神程度已經進化到終極形態' },
  { threshold: 275, title: '傳說盡頭的低語', description: '抵達第2750關,連傳說本身都開始向你低語致敬' },
  { threshold: 280, title: '最終發呆試煉', description: '抵達第2800關,正在經歷這趟旅程最後的試煉' },
  { threshold: 285, title: '終章前的寧靜', description: '抵達第2850關,暴風雨前的寧靜,只差最後衝刺' },
  { threshold: 290, title: '九分之一步之遙', description: '抵達第2900關,距離終點只剩最後一小段路' },
  { threshold: 295, title: '最終回合倒數', description: '抵達第2950關,倒數計時正式開始' },
  { threshold: 300, title: '宇宙盡頭的發呆冠軍', description: '抵達第3000關,把整個宇宙的發呆額度用完,正式封頂' },
];

// 關卡里程碑對應的成長階級:每50大關一階(threshold 1~300 分成6階),跟職業轉職階級
// (JobTier 1~5,見 game/materials.ts 的 currentMaterialTier)大致同步成長速度。
function stageMilestoneTier(threshold: number): MaterialTier {
  return Math.min(5, Math.floor((threshold - 1) / 50)) as MaterialTier;
}

// 獎勵公式(不逐筆手刻):金幣/經驗跟門檻(=大關數)成正比;強化石從第10大關起才開始給,
// 每10大關份量+1;技能書從第5大關起就開始給、份量是強化石的2倍(呼應「技能書掉率提高」的
// 整體經濟方向);每滿50大關(=每500關)額外給一批三色寶石,份量隨門檻線性成長——
// 呼應既有成就系統「越晚越稀有」的獎勵曲線(參照 KILL_THRESHOLDS 系列)。
function stageMilestoneReward(threshold: number): AchievementReward {
  const reward: AchievementReward = { coins: threshold * 100, exp: threshold * 50 };
  if (threshold >= 10) reward.enhanceStones = Math.floor(threshold / 10);
  if (threshold >= 5) reward.skillBooks = Math.floor(threshold / 5);
  if (threshold % 50 === 0) {
    const amount = threshold / 50;
    reward.gems = { expGem: amount, coinGem: amount, speedGem: amount };
  }
  return reward;
}

function buildStageAchievements(): Record<string, AchievementDef> {
  const result: Record<string, AchievementDef> = {};
  for (const milestone of STAGE_MILESTONES) {
    const id = `stage_${milestone.threshold * 10}`;
    result[id] = {
      id,
      category: 'stage',
      tier: stageMilestoneTier(milestone.threshold),
      title: milestone.title,
      description: milestone.description,
      reward: stageMilestoneReward(milestone.threshold),
    };
  }
  return result;
}

export const ACHIEVEMENTS: Record<string, AchievementDef> = {
  kills_1: {
    id: 'kills_1',
    category: 'kills',
    tier: 0,
    title: '初次交手',
    description: '擊敗第一隻怪物',
    reward: { coins: 20, exp: 50 },
  },
  kills_10: {
    id: 'kills_10',
    category: 'kills',
    tier: 0,
    title: '小試身手',
    description: '累計擊敗10隻怪物',
    reward: { coins: 50, exp: 150 },
  },
  kills_100: {
    id: 'kills_100',
    category: 'kills',
    tier: 1,
    title: '熟能生巧',
    description: '累計擊敗100隻怪物',
    reward: { coins: 300, exp: 800, skillBooks: 1 },
  },
  kills_500: {
    id: 'kills_500',
    category: 'kills',
    tier: 2,
    title: '身經百戰',
    description: '累計擊敗500隻怪物',
    reward: { coins: 500, exp: 2000, enhanceStones: 1, skillBooks: 2 },
  },
  kills_1000: {
    id: 'kills_1000',
    category: 'kills',
    tier: 3,
    title: '千人斬',
    description: '累計擊敗1000隻怪物',
    reward: { coins: 1000, exp: 4000, enhanceStones: 2, skillBooks: 3 },
  },
  kills_5000: {
    id: 'kills_5000',
    category: 'kills',
    tier: 4,
    title: '屠戮無數',
    description: '累計擊敗5000隻怪物',
    reward: { coins: 3000, exp: 10000, enhanceStones: 5, skillBooks: 5, gems: { expGem: 1, coinGem: 1, speedGem: 1 } },
  },
  kills_10000: {
    id: 'kills_10000',
    category: 'kills',
    tier: 5,
    title: '傳說獵人',
    description: '累計擊敗10000隻怪物',
    reward: {
      coins: 6000,
      exp: 20000,
      enhanceStones: 10,
      skillBooks: 10,
      gems: { expGem: 3, coinGem: 3, speedGem: 3 },
    },
  },

  level_30: {
    id: 'level_30',
    category: 'level',
    tier: 1,
    title: '學生畢業',
    description: '等級達到30級,選定第一個主職',
    reward: { coins: 500, skillBooks: 2 },
  },
  level_80: {
    id: 'level_80',
    category: 'level',
    tier: 2,
    title: '三轉在望',
    description: '等級達到80級,解鎖雙職兼修',
    reward: { coins: 800, enhanceStones: 1, skillBooks: 3 },
  },
  level_120: {
    id: 'level_120',
    category: 'level',
    tier: 3,
    title: '資深冒險者',
    description: '等級達到120級',
    reward: { coins: 1500, enhanceStones: 2, skillBooks: 4 },
  },
  level_200: {
    id: 'level_200',
    category: 'level',
    tier: 4,
    title: '四轉高手',
    description: '等級達到200級',
    reward: { coins: 2500, enhanceStones: 3, skillBooks: 6, gems: { expGem: 1, coinGem: 1, speedGem: 1 } },
  },
  level_350: {
    id: 'level_350',
    category: 'level',
    tier: 5,
    title: '五轉大師',
    description: '等級達到350級,五階轉職全開',
    reward: { coins: 4000, enhanceStones: 5, skillBooks: 8, gems: { expGem: 2, coinGem: 2, speedGem: 2 } },
  },
  level_500: {
    id: 'level_500',
    category: 'level',
    tier: 5,
    title: '封頂',
    description: '等級達到最高等級500級',
    reward: { coins: 8000, enhanceStones: 10, skillBooks: 12, gems: { expGem: 5, coinGem: 5, speedGem: 5 } },
  },

  equip_10pct: {
    id: 'equip_10pct',
    category: 'equipment',
    tier: 0,
    title: '初嚐裝備',
    description: '解鎖10%的收費裝備款式',
    reward: { coins: 200, exp: 300 },
  },
  equip_25pct: {
    id: 'equip_25pct',
    category: 'equipment',
    tier: 1,
    title: '小小收藏家',
    description: '解鎖25%的收費裝備款式',
    reward: { coins: 500, exp: 800, enhanceStones: 1, skillBooks: 1 },
  },
  equip_50pct: {
    id: 'equip_50pct',
    category: 'equipment',
    tier: 2,
    title: '裝備半藏',
    description: '解鎖50%的收費裝備款式',
    reward: { coins: 1200, exp: 1800, enhanceStones: 3, skillBooks: 2 },
  },
  equip_75pct: {
    id: 'equip_75pct',
    category: 'equipment',
    tier: 3,
    title: '裝備收藏家',
    description: '解鎖75%的收費裝備款式',
    reward: {
      coins: 2500,
      exp: 3500,
      enhanceStones: 5,
      skillBooks: 4,
      gems: { expGem: 2, coinGem: 2, speedGem: 2 },
    },
  },
  equip_100pct: {
    id: 'equip_100pct',
    category: 'equipment',
    tier: 4,
    title: '裝備圖鑑大師',
    description: '解鎖100%的收費裝備款式',
    reward: {
      coins: 6000,
      exp: 8000,
      enhanceStones: 10,
      skillBooks: 6,
      gems: { expGem: 5, coinGem: 5, speedGem: 5 },
    },
  },

  enhance_first: {
    id: 'enhance_first',
    category: 'enhance',
    tier: 0,
    title: '初次強化',
    description: '第一次強化成功',
    reward: { coins: 100, exp: 150 },
  },
  enhance_max: {
    id: 'enhance_max',
    category: 'enhance',
    tier: 3,
    title: '強化極限',
    description: '任一件裝備強化到+10封頂',
    reward: { coins: 1000, exp: 2500, enhanceStones: 3, skillBooks: 3 },
  },
  socket_full: {
    id: 'socket_full',
    category: 'enhance',
    tier: 2,
    title: '寶石鑲滿',
    description: '任一件裝備所有插槽都鑲上寶石',
    reward: { coins: 300, exp: 800, skillBooks: 1, gems: { expGem: 1, coinGem: 1, speedGem: 1 } },
  },

  companion_first: {
    id: 'companion_first',
    category: 'companion',
    tier: 0,
    title: '初次相遇',
    description: '取得第一隻寵物或坐騎',
    reward: { coins: 200, exp: 300 },
  },
  companion_50pct: {
    id: 'companion_50pct',
    category: 'companion',
    tier: 2,
    title: '動物朋友',
    description: '收集50%的寵物坐騎圖鑑',
    reward: { coins: 800, exp: 1500, skillBooks: 2 },
  },
  companion_100pct: {
    id: 'companion_100pct',
    category: 'companion',
    tier: 4,
    title: '馴獸大師',
    description: '收集100%的寵物坐騎圖鑑',
    reward: { coins: 2000, exp: 4000, enhanceStones: 5, skillBooks: 5 },
  },

  transfer_first_proof: {
    id: 'transfer_first_proof',
    category: 'transfer',
    tier: 1,
    title: '轉職資格',
    description: '第一次集滿10個碎片、合成1個轉職證明',
    reward: { coins: 300, exp: 500, skillBooks: 1 },
  },
  transfer_first_switch: {
    id: 'transfer_first_switch',
    category: 'transfer',
    tier: 1,
    title: '改頭換面',
    description: '第一次真正換過不同的主職職業',
    reward: { coins: 500, exp: 700, skillBooks: 1 },
  },

  ...buildStageAchievements(),
};

export const ACHIEVEMENT_IDS: string[] = Object.keys(ACHIEVEMENTS);

// 依成長排序:主要排序鍵是 tier(對應玩家大概成長到哪個階段),同階內用獎勵金幣當次要排序鍵
// (同階裡通常越晚達成的門檻獎勵金幣也越高)——給 AchievementPanel 用單一連續清單取代
// 「先分類再列表」的舊排法,呼應「依照成長排列」的需求。純函式,排序穩定不修改輸入陣列。
export const ACHIEVEMENTS_BY_GROWTH: AchievementDef[] = Object.values(ACHIEVEMENTS).sort(
  (a, b) => a.tier - b.tier || a.reward.coins - b.reward.coins
);

// killCount 系門檻:達到即解鎖,單純門檻比較。
const KILL_THRESHOLDS: { id: string; threshold: number }[] = [
  { id: 'kills_1', threshold: 1 },
  { id: 'kills_10', threshold: 10 },
  { id: 'kills_100', threshold: 100 },
  { id: 'kills_500', threshold: 500 },
  { id: 'kills_1000', threshold: 1000 },
  { id: 'kills_5000', threshold: 5000 },
  { id: 'kills_10000', threshold: 10000 },
];

// 等級里程碑門檻:達到即解鎖,單純門檻比較。
const LEVEL_THRESHOLDS: { id: string; threshold: number }[] = [
  { id: 'level_30', threshold: 30 },
  { id: 'level_80', threshold: 80 },
  { id: 'level_120', threshold: 120 },
  { id: 'level_200', threshold: 200 },
  { id: 'level_350', threshold: 350 },
  { id: 'level_500', threshold: 500 },
];

// 裝備收藏比例門檻:達到即解鎖,比對「已解鎖收費裝備數 / 收費裝備總數」的比例。
const EQUIP_PCT_THRESHOLDS: { id: string; threshold: number }[] = [
  { id: 'equip_10pct', threshold: 0.1 },
  { id: 'equip_25pct', threshold: 0.25 },
  { id: 'equip_50pct', threshold: 0.5 },
  { id: 'equip_75pct', threshold: 0.75 },
  { id: 'equip_100pct', threshold: 1.0 },
];

// 寵物坐騎收藏比例門檻:同上,比對「已解鎖數 / 圖鑑總數」的比例。
const COMPANION_PCT_THRESHOLDS: { id: string; threshold: number }[] = [
  { id: 'companion_50pct', threshold: 0.5 },
  { id: 'companion_100pct', threshold: 1.0 },
];

// 關卡里程碑門檻:達到即解鎖,單純門檻比較,threshold 是「累計清完幾個大關」——
// 從 STAGE_MILESTONES 資料表衍生,id 命名規則(stage_{threshold*10})要跟 buildStageAchievements()
// 保持一致,不然這裡查不到對應的成就定義。
const STAGE_THRESHOLDS: { id: string; threshold: number }[] = STAGE_MILESTONES.map((milestone) => ({
  id: `stage_${milestone.threshold * 10}`,
  threshold: milestone.threshold,
}));

// 純函式,全量重新計算(不是增量判定):傳入目前的完整進度快照,回傳「目前應該全部解鎖」的
// 成就 id 清單。呼叫端拿這份結果跟已持久化的 unlockedAchievementIds 做 diff 來找出「這次新解鎖」的項目。
export function evaluateUnlockedAchievementIds(progress: AchievementProgress): string[] {
  const unlocked: string[] = [];

  for (const { id, threshold } of KILL_THRESHOLDS) {
    if (progress.killCount >= threshold) unlocked.push(id);
  }

  for (const { id, threshold } of LEVEL_THRESHOLDS) {
    if (progress.level >= threshold) unlocked.push(id);
  }

  const equipPct = progress.totalPaidItemCount > 0 ? progress.unlockedPaidItemCount / progress.totalPaidItemCount : 0;
  for (const { id, threshold } of EQUIP_PCT_THRESHOLDS) {
    if (equipPct >= threshold) unlocked.push(id);
  }

  if (progress.maxEnhanceLevel >= 1) unlocked.push('enhance_first');
  if (progress.maxEnhanceLevel >= ENHANCE_MAX_LEVEL) unlocked.push('enhance_max');
  if (progress.hasFullySocketedItem) unlocked.push('socket_full');

  if (progress.companionUnlockedCount >= 1) unlocked.push('companion_first');
  const companionPct =
    progress.totalCompanionCount > 0 ? progress.companionUnlockedCount / progress.totalCompanionCount : 0;
  for (const { id, threshold } of COMPANION_PCT_THRESHOLDS) {
    if (companionPct >= threshold) unlocked.push(id);
  }

  if (progress.hasAssembledTransferProof) unlocked.push('transfer_first_proof');
  if (progress.hasSwitchedJobOnce) unlocked.push('transfer_first_switch');

  for (const { id, threshold } of STAGE_THRESHOLDS) {
    if (progress.totalStagesCleared >= threshold) unlocked.push(id);
  }

  return unlocked;
}

export interface AchievementProgressDisplay {
  current: number;
  target: number;
}

// 只給「單純累積量對比單一數字門檻」的成就(擊殺數/等級/裝備收藏比例/寵物坐騎收藏比例)
// 回傳可顯示的進度(例如 87/100),給 UI 畫進度條用。其餘(enhance_first/enhance_max/
// socket_full/companion_first/transfer_*)本質是「某件裝備或某個事件是否發生過」,不是
// 單純的累積量,回傳 null——UI 端對這些只畫鎖定/解鎖兩態,不用硬湊一個進度數字。
export function getAchievementProgressDisplay(id: string, progress: AchievementProgress): AchievementProgressDisplay | null {
  const kill = KILL_THRESHOLDS.find((t) => t.id === id);
  if (kill) return { current: Math.min(progress.killCount, kill.threshold), target: kill.threshold };

  const level = LEVEL_THRESHOLDS.find((t) => t.id === id);
  if (level) return { current: Math.min(progress.level, level.threshold), target: level.threshold };

  const equipPct = EQUIP_PCT_THRESHOLDS.find((t) => t.id === id);
  if (equipPct) {
    const target = Math.max(1, Math.ceil(equipPct.threshold * progress.totalPaidItemCount));
    return { current: Math.min(progress.unlockedPaidItemCount, target), target };
  }

  const companionPct = COMPANION_PCT_THRESHOLDS.find((t) => t.id === id);
  if (companionPct) {
    const target = Math.max(1, Math.ceil(companionPct.threshold * progress.totalCompanionCount));
    return { current: Math.min(progress.companionUnlockedCount, target), target };
  }

  const stage = STAGE_THRESHOLDS.find((t) => t.id === id);
  if (stage) return { current: Math.min(progress.totalStagesCleared, stage.threshold), target: stage.threshold };

  return null;
}

// 成就永久加成:每領取1個成就永久+0.1%經驗/金幣(共102個成就,全部領完約+10.2%)——
// 獨立於 game/ascension.ts 那條「破輪迴」的永久加成軸線之外,讓成就本身也有超越一次性
// 貨幣獎勵的長期價值,不用重新設計每個成就各自的獎勵內容,跟轉生加成一樣不受裝備/
// 寵物坐騎更換影響。
const ACHIEVEMENT_BONUS_PER_CLAIM = 0.001;

export function getAchievementBonusMultiplier(claimedCount: number): number {
  return claimedCount * ACHIEVEMENT_BONUS_PER_CLAIM;
}
