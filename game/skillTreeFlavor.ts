import { Archetype, JobBranch, JobTier } from './combat';
import {
  SKILL_SLOT_DESCRIPTIONS,
  SKILL_SLOT_NAMES,
  SkillSlotId,
} from './skillTree';

export interface TierSkillFlavor {
  name: string;
  description: string;
}

// tier1 沿用 game/skillTree.ts 既有的 SKILL_SLOT_NAMES/SKILL_SLOT_DESCRIPTIONS,這裡只需要 2~5 階。
// passive3(吸血+自動回血)刻意排除在外——這格名稱/敘述全職業全階級都是同一份鎖定文案
// (見 SKILL_SLOT_NAMES/SKILL_SLOT_DESCRIPTIONS 的 passive3),不像 passive1/passive2 每階
// 都要換一套「職業分支」敘述,所以不需要也不應該在這裡幫它多寫 2~5 階的版本。
type TierBranchSlotId = Exclude<SkillSlotId, 'passive3'>;
type TierBranchContent = Record<Exclude<JobTier, 1>, Record<TierBranchSlotId, TierSkillFlavor>>;
// 分支A/B從2階起才分岔(1階兩分支尚未分岔,共用同一套tier1內容),呼應
// game/combat.ts 的 JOB_TITLES 分支稱號設計。

// 每一階(2/3/4/5)6 個技能格描述,結尾都會統一附上該階新解鎖的疊加效果說明——
// 數值對應 game/skillTree.ts 的 TIER2_BONUS_COIN_MULT(10%)/TIER3_BONUS_EXP_MULT(10%)/
// TIER4_BONUS_FLAT_COINS(3 枚)/TIER5_EXTRA_DAMAGE_CHANCE(8%)+TIER5_EXTRA_DAMAGE_CUT_RATIO
// (50%),不可更改數字。
const TIER_STACK_NOTE: Record<Exclude<JobTier, 1>, string> = {
  2: '(這階起,主動技能觸發時額外多賺 10% 金幣)',
  3: '(這階起,主動技能觸發時額外多賺 10% 經驗值,跟2階的金幣加成疊加)',
  4: '(這階起,主動技能觸發時額外多進帳 3 枚金幣,前面幾階的加成全部疊加)',
  5: '(這階起,主動技能觸發時有 8% 機率額外對敵人造成一記重擊,削減這場戰鬥剩餘時間 50%,前面所有疊加效果全部保留)',
};

function withStack(tier: Exclude<JobTier, 1>, description: string): string {
  return `${description}${TIER_STACK_NOTE[tier]}`;
}

const TIER_SKILL_FLAVOR: Record<Archetype, Record<JobBranch, TierBranchContent>> = {
  physicalMelee: {
    // branch A:1工讀生 2搬運工 3工地師傅 4消防員 5特種部隊
    A: {
    2: {
      passive1: { name: '扛出來的肌肉記憶', description: withStack(2, '搬久了東西,身體自然記住怎麼閃、怎麼發力,經驗值吸收得更快。') },
      passive2: { name: '搬運行情摸更透', description: withStack(2, '搬家公司跑多了,行情摸得比誰都熟,順手多賺一點。') },
      active1: { name: '一肩扛起全場', description: withStack(2, '扛著整組家具直接砸過去,狠狠痛擊要害,造成大量傷害。') },
      active2: { name: '搬運工的連續搬運', description: withStack(2, '一趟接一趟不停手,招式力道全開,對敵人造成沉重傷害。') },
      active3: { name: '順手多接一趟', description: withStack(2, '收工前順路再接一趟搬運,順勢補上一記,造成可觀傷害。') },
      active4: { name: '扎實搬完整棟樓', description: withStack(2, '扎實把整棟樓搬完才收工,抓準破綻補刀,造成額外傷害。') },
    },
    3: {
      passive1: { name: '工地老手的敏銳度', description: withStack(3, '在工地待久了,一眼就看穿怪物的破綻,經驗值吸收得更快。') },
      passive2: { name: '工班行情算到骨子裡', description: withStack(3, '跟工班打交道練出的精算功力,順手多賺一點工錢。') },
      active1: { name: '怪手一鏟到底', description: withStack(3, '操作怪手一鏟清空戰場,狠狠痛擊要害,造成大量傷害。') },
      active2: { name: '師傅連環指揮', description: withStack(3, '指揮工班一波接一波動工,招式力道全開,對敵人造成沉重傷害。') },
      active3: { name: '工地順手驗收', description: withStack(3, '驗收工程順便清點材料,順勢補上一記,造成可觀傷害。') },
      active4: { name: '扎實蓋好一層樓', description: withStack(3, '扎實把一層樓蓋好才收工,抓準破綻補刀,造成額外傷害。') },
    },
    4: {
      passive1: { name: '火場練出的判斷力', description: withStack(4, '在火場千鈞一髮練出的反應,經驗值吸收得更快。') },
      passive2: { name: '救援津貼精算術', description: withStack(4, '出勤津貼算得清清楚楚,順手多賺一點加給。') },
      active1: { name: '破門一擊', description: withStack(4, '斧頭破門直搗黃龍,狠狠痛擊要害,造成大量傷害。') },
      active2: { name: '水柱連發', description: withStack(4, '水柱一波接一波狂噴,招式力道全開,對敵人造成沉重傷害。') },
      active3: { name: '救援順手清點裝備', description: withStack(4, '救援結束順手清點裝備損耗,順勢補上一記,造成可觀傷害。') },
      active4: { name: '扎實完成一次出勤', description: withStack(4, '扎實完成整趟救援出勤,抓準破綻補刀,造成額外傷害。') },
    },
    5: {
      passive1: { name: '百戰練出的直覺', description: withStack(5, '身經百戰淬煉出的戰場直覺,經驗值吸收得更快。') },
      passive2: { name: '任務獎金精算術', description: withStack(5, '任務獎金算得比誰都精,順手多賺一筆津貼。') },
      active1: { name: '斬首行動', description: withStack(5, '一次斬首行動直取要害,狠狠痛擊要害,造成大量傷害。') },
      active2: { name: '特種連續突襲', description: withStack(5, '小隊連續突襲不留喘息,招式力道全開,對敵人造成沉重傷害。') },
      active3: { name: '任務順手清場', description: withStack(5, '任務結束順手清點戰利品,順勢補上一記,造成可觀傷害。') },
      active4: { name: '扎實完成一次任務', description: withStack(5, '扎實完成一次任務歸隊,抓準破綻補刀,造成額外傷害。') },
    },
    },
    // branch B:1工讀生 2拳擊館學員 3拳擊教練 4職業拳擊手 5傳說拳王
    B: {
      2: {
        passive1: { name: '打拳練出的反應', description: withStack(2, '整天打沙包練出的反應速度,經驗值吸收得更快。') },
        passive2: { name: '陪練費算盤', description: withStack(2, '陪練費算得清清楚楚,順手多賺一點。') },
        active1: { name: '直拳教學賽', description: withStack(2, '跟教練對打直拳,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '組合拳出擊', description: withStack(2, '左右開弓打出組合拳,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手擦個沙包', description: withStack(2, '訓練空檔順手保養沙包,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實練完一場', description: withStack(2, '扎實打完整堂課才收操,抓準破綻補刀,造成額外傷害。') },
      },
      3: {
        passive1: { name: '教學練出的觀察力', description: withStack(3, '教久了一眼看穿學員的破綻,經驗值吸收得更快。') },
        passive2: { name: '課程費算盤', description: withStack(3, '私人教練費算得精打細算,順手多賺一點課程費。') },
        active1: { name: '示範重拳', description: withStack(3, '親自示範一記重拳,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環靶手指導', description: withStack(3, '打靶手一組接一組連環指導,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手調整拳套', description: withStack(3, '課後順手幫學員調整拳套,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實帶完一堂課', description: withStack(3, '扎實帶完整堂教練課,抓準破綻補刀,造成額外傷害。') },
      },
      4: {
        passive1: { name: '擂台練出的直覺', description: withStack(4, '站上擂台練出的求生直覺,經驗值吸收得更快。') },
        passive2: { name: '出場費算盤', description: withStack(4, '出場費行情算得一清二楚,順手多賺一點獎金。') },
        active1: { name: '冠軍重拳', description: withStack(4, '揮出冠軍等級的重拳,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環組合重擊', description: withStack(4, '組合拳一波接一波連環重擊,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '賽後順手簽名', description: withStack(4, '賽後順手幫粉絲簽名收禮,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實打滿全場', description: withStack(4, '扎實打滿整場比賽才退場,抓準破綻補刀,造成額外傷害。') },
      },
      5: {
        passive1: { name: '封王淬煉出的直覺', description: withStack(5, '多年征戰淬煉出的王者直覺,經驗值吸收得更快。') },
        passive2: { name: '冠軍代言費算盤', description: withStack(5, '代言邀約算得比誰都精,順手多賺一筆代言費。') },
        active1: { name: '王者一擊', description: withStack(5, '揮出震撼全場的王者一擊,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環KO重擊', description: withStack(5, '重擊一拳接一拳連環擊倒,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手辦場慈善賽', description: withStack(5, '順手安排一場慈善義賽,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實衛冕成功', description: withStack(5, '扎實打完整場衛冕戰,抓準破綻補刀,造成額外傷害。') },
      },
    },
  },
  physicalRanged: {
    // branch A:1外送員 2計程車司機 3警察 4職業獵人 5狙擊手
    A: {
    2: {
      passive1: { name: '跑車跑出的路感', description: withStack(2, '天天在路上跑,對地形與怪物的反應更快,經驗值吸收得更快。') },
      passive2: { name: '跳錶行情摸透了', description: withStack(2, '跳錶算得滾瓜爛熟,順手多賺一點車資。') },
      active1: { name: '熟客連環載', description: withStack(2, '熟客一個接一個上車,招式力道全開,對敵人造成沉重傷害。') },
      active2: { name: '順路多繞一趟', description: withStack(2, '順路多繞一趟載客,順勢補上一記,造成可觀傷害。') },
      active3: { name: '熟門熟路抄捷徑', description: withStack(2, '抄近路練出的心得,抓準破綻補刀,造成額外傷害。') },
      active4: { name: '一腳踩到底', description: withStack(2, '油門一腳踩到底衝過終點,狠狠痛擊要害,造成大量傷害。') },
    },
    3: {
      passive1: { name: '巡邏練出的敏銳', description: withStack(3, '天天巡邏練出的敏銳直覺,經驗值吸收得更快。') },
      passive2: { name: '績效獎金算盤', description: withStack(3, '績效獎金算得精明,順手多賺一點獎金。') },
      active1: { name: '警網連環出動', description: withStack(3, '警網一波接一波出動,招式力道全開,對敵人造成沉重傷害。') },
      active2: { name: '順手臨檢', description: withStack(3, '下班前順手臨檢一輪,順勢補上一記,造成可觀傷害。') },
      active3: { name: '辦案熟門熟路', description: withStack(3, '辦案經驗越來越老道,抓準破綻補刀,造成額外傷害。') },
      active4: { name: '一槍制伏', description: withStack(3, '精準一槍當場制伏,狠狠痛擊要害,造成大量傷害。') },
    },
    4: {
      passive1: { name: '叢林練出的野性直覺', description: withStack(4, '長年在山林打滾練出的野性直覺,經驗值吸收得更快。') },
      passive2: { name: '獵物行情摸透了', description: withStack(4, '獵物行情摸得一清二楚,順手多賺一點收購金。') },
      active1: { name: '陷阱連環設下', description: withStack(4, '陷阱一個接一個佈下,招式力道全開,對敵人造成沉重傷害。') },
      active2: { name: '順手撿戰利品', description: withStack(4, '狩獵完順手撿些戰利品,順勢補上一記,造成可觀傷害。') },
      active3: { name: '追蹤熟門熟路', description: withStack(4, '追蹤獸跡的功夫越來越老練,抓準破綻補刀,造成額外傷害。') },
      active4: { name: '一箭穿心', description: withStack(4, '一箭精準穿心,狠狠痛擊要害,造成大量傷害。') },
    },
    5: {
      passive1: { name: '千米外練出的專注', description: withStack(5, '千米之外盯出來的極致專注,經驗值吸收得更快。') },
      passive2: { name: '任務津貼精算術', description: withStack(5, '任務津貼算得比誰都精,順手多賺一點獎金。') },
      active1: { name: '連續精準點殺', description: withStack(5, '一發接一發精準點殺,招式力道全開,對敵人造成沉重傷害。') },
      active2: { name: '順手清點彈藥', description: withStack(5, '任務結束順手清點裝備,順勢補上一記,造成可觀傷害。') },
      active3: { name: '潛伏練出的心得', description: withStack(5, '長時間潛伏練出的心得,抓準破綻補刀,造成額外傷害。') },
      active4: { name: '一發入魂', description: withStack(5, '屏息扣下扳機一發入魂,狠狠痛擊要害,造成大量傷害。') },
    },
    },
    // branch B:1外送員 2貨車司機 3保鑣 4特技替身演員 5頂尖鏢客
    B: {
      2: {
        passive1: { name: '跑貨練出的路感', description: withStack(2, '長途貨運跑出來的路感,經驗值吸收得更快。') },
        passive2: { name: '運費行情摸透了', description: withStack(2, '運費行情摸得一清二楚,順手多賺一點運費。') },
        active1: { name: '緊急煞車撞開', description: withStack(2, '緊急煞車硬是撞開路障,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環甩尾閃避', description: withStack(2, '甩尾閃過一台接一台來車,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手捎一趟貨', description: withStack(2, '回程順手捎帶一趟貨,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實跑完一趟', description: withStack(2, '扎實跑完整趟長途貨運,抓準破綻補刀,造成額外傷害。') },
      },
      3: {
        passive1: { name: '護衛練出的警覺', description: withStack(3, '貼身護衛練出的高度警覺,經驗值吸收得更快。') },
        passive2: { name: '保全費行情摸透了', description: withStack(3, '保全案行情摸得一清二楚,順手多賺一點保全費。') },
        active1: { name: '肉盾式格擋反擊', description: withStack(3, '用身體格擋後順勢反擊,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環驅離威嚇', description: withStack(3, '一個接一個驅離可疑人士,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手巡一輪場地', description: withStack(3, '交班前順手巡一輪場地,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實護送到底', description: withStack(3, '扎實護送雇主到目的地,抓準破綻補刀,造成額外傷害。') },
      },
      4: {
        passive1: { name: '特技練出的反射', description: withStack(4, '高難度特技練出的驚人反射,經驗值吸收得更快。') },
        passive2: { name: '片酬行情摸透了', description: withStack(4, '特技片酬行情摸得一清二楚,順手多賺一點片酬。') },
        active1: { name: '高空墜落反擊', description: withStack(4, '特技墜落後順勢反擊,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環翻滾特技', description: withStack(4, '翻滾特技一個接一個連環上演,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手客串一角', description: withStack(4, '拍攝空檔順手客串個小角色,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實拍完一場戲', description: withStack(4, '扎實拍完整場動作戲才收工,抓準破綻補刀,造成額外傷害。') },
      },
      5: {
        passive1: { name: '走鏢練出的膽識', description: withStack(5, '多年走鏢淬煉出的過人膽識,經驗值吸收得更快。') },
        passive2: { name: '鏢銀行情摸透了', description: withStack(5, '鏢銀行情算得比誰都精,順手多賺一筆鏢銀。') },
        active1: { name: '一鏢定江山', description: withStack(5, '一鏢出手直接定江山,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環護鏢反擊', description: withStack(5, '護鏢反擊一招接一招連環使出,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手接個私鏢', description: withStack(5, '官鏢之餘順手接個私人委託,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實走完一趟鏢', description: withStack(5, '扎實走完整趟鏢路才收工,抓準破綻補刀,造成額外傷害。') },
      },
    },
  },
  physicalSupport: {
    // branch A:1超商店員 2餐廳服務生 3護理師 4健身教練 5急診室王牌護理長
    A: {
    2: {
      passive1: { name: '外場練出的眼力', description: withStack(2, '外場跑久了,一眼看穿客人跟怪物的需求,經驗值吸收得更快。') },
      passive2: { name: '小費行情摸透了', description: withStack(2, '小費行情摸得一清二楚,順手多賺一點小費。') },
      active1: { name: '順手加點', description: withStack(2, '上菜順手推薦加點,順勢補上一記,造成可觀傷害。') },
      active2: { name: '貼心報菜名', description: withStack(2, '報菜名報得又快又順,抓準破綻補刀,造成額外傷害。') },
      active3: { name: '手腳俐落出餐', description: withStack(2, '手腳俐落一口氣出完餐,狠狠痛擊要害,造成大量傷害。') },
      active4: { name: '翻桌率全開', description: withStack(2, '翻桌翻得又快又順,招式力道全開,對敵人造成沉重傷害。') },
    },
    3: {
      passive1: { name: '臨床練出的觀察力', description: withStack(3, '臨床照護練出的敏銳觀察力,經驗值吸收得更快。') },
      passive2: { name: '班表津貼算盤', description: withStack(3, '輪班津貼算得精明,順手多賺一點加班費。') },
      active1: { name: '順手量個生命徵象', description: withStack(3, '巡房順手量個生命徵象,順勢補上一記,造成可觀傷害。') },
      active2: { name: '衛教說得仔細', description: withStack(3, '衛教叮嚀說得又細又清楚,抓準破綻補刀,造成額外傷害。') },
      active3: { name: '手腳俐落急救', description: withStack(3, '急救處置手腳俐落到位,狠狠痛擊要害,造成大量傷害。') },
      active4: { name: '雙倍照護到位', description: withStack(3, '照護加倍用心到位,招式力道全開,對敵人造成沉重傷害。') },
    },
    4: {
      passive1: { name: '帶課練出的判讀力', description: withStack(4, '帶課帶久了,一眼看穿姿勢跟破綻,經驗值吸收得更快。') },
      passive2: { name: '課程業績算盤', description: withStack(4, '課程業績算得精明,順手多賺一點業績獎金。') },
      active1: { name: '順手加開一堂課', description: withStack(4, '順手加開一堂體驗課,順勢補上一記,造成可觀傷害。') },
      active2: { name: '菜單調整到位', description: withStack(4, '訓練菜單調整得又細又到位,抓準破綻補刀,造成額外傷害。') },
      active3: { name: '一組全力衝刺', description: withStack(4, '喊口號帶一組全力衝刺收操,狠狠痛擊要害,造成大量傷害。') },
      active4: { name: '雙倍燃脂菜單', description: withStack(4, '雙倍強度菜單全開,招式力道全開,對敵人造成沉重傷害。') },
    },
    5: {
      passive1: { name: '急診練出的判斷力', description: withStack(5, '急診室千錘百鍊出的判斷力,經驗值吸收得更快。') },
      passive2: { name: '資深加給算盤', description: withStack(5, '資深加給算得一清二楚,順手多賺一筆津貼。') },
      active1: { name: '順手清點急救車', description: withStack(5, '交班前順手清點急救車存貨,順勢補上一記,造成可觀傷害。') },
      active2: { name: '帶教學弟妹', description: withStack(5, '順手帶教學弟妹的心得,抓準破綻補刀,造成額外傷害。') },
      active3: { name: '一聲令下全員就位', description: withStack(5, '一聲令下全員迅速就位處置,狠狠痛擊要害,造成大量傷害。') },
      active4: { name: '雙倍搶救效率', description: withStack(5, '帶隊搶救效率整組翻倍,招式力道全開,對敵人造成沉重傷害。') },
    },
    },
    // branch B:1超商店員 2空服員 3居家照護員 4物理治療師 5奧運隨隊防護員
    B: {
      2: {
        passive1: { name: '機艙練出的應變力', description: withStack(2, '機艙服務練出的臨場應變力,經驗值吸收得更快。') },
        passive2: { name: '免稅品業績算盤', description: withStack(2, '免稅品業績算得精打細算,順手多賺一點業績獎金。') },
        active1: { name: '緊急氧氣罩伺候', description: withStack(2, '緊急遞上氧氣罩順勢一推,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環送餐服務', description: withStack(2, '餐車一趟接一趟連環服務,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手多送份點心', description: withStack(2, '巡艙順手多送一份點心,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實飛完一趟航班', description: withStack(2, '扎實服務完整趟航班才下班,抓準破綻補刀,造成額外傷害。') },
      },
      3: {
        passive1: { name: '居家照護練出的細心', description: withStack(3, '長期居家照護練出的細膩觀察力,經驗值吸收得更快。') },
        passive2: { name: '照護鐘點算盤', description: withStack(3, '照護鐘點費算得精打細算,順手多賺一點鐘點費。') },
        active1: { name: '緊急扶抱處置', description: withStack(3, '緊急扶抱後順勢一推,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環翻身拍背', description: withStack(3, '翻身拍背一輪接一輪連環進行,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手整理居家環境', description: withStack(3, '照護空檔順手整理居家環境,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實顧完一整天', description: withStack(3, '扎實照護完整天才交班,抓準破綻補刀,造成額外傷害。') },
      },
      4: {
        passive1: { name: '治療練出的判斷力', description: withStack(4, '長期治療練出的精準判斷力,經驗值吸收得更快。') },
        passive2: { name: '治療鐘點算盤', description: withStack(4, '治療鐘點費算得精打細算,順手多賺一點治療費。') },
        active1: { name: '關節矯正一推', description: withStack(4, '關節矯正手法順勢一推,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環復健訓練', description: withStack(4, '復健動作一組接一組連環訓練,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手教個居家運動', description: withStack(4, '療程之餘順手教個居家運動,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實完成一個療程', description: withStack(4, '扎實完成整套復健療程,抓準破綻補刀,造成額外傷害。') },
      },
      5: {
        passive1: { name: '隨隊練出的敏銳度', description: withStack(5, '隨隊征戰練出的極致敏銳度,經驗值吸收得更快。') },
        passive2: { name: '隨隊津貼算盤', description: withStack(5, '隨隊出賽津貼算得比誰都精,順手多賺一筆津貼。') },
        active1: { name: '賽場緊急處置', description: withStack(5, '賽場緊急處置手法順勢一推,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環選手保養', description: withStack(5, '選手保養一位接一位連環進行,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手辦場衛教講座', description: withStack(5, '賽前順手辦一場衛教講座,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實隨隊完賽', description: withStack(5, '扎實隨隊完成整趟賽事,抓準破綻補刀,造成額外傷害。') },
      },
    },
  },
  magicMelee: {
    // branch A:1中二國中生 2阿志 3道士/法師 4命理師 5得道仙人
    A: {
    2: {
      passive1: { name: '混出來的江湖直覺', description: withStack(2, '在外面混出來的江湖直覺,經驗值吸收得更快。') },
      passive2: { name: '跑腿行情摸透了', description: withStack(2, '幫忙跑腿辦事練出的行情眼光,順手多賺一點。') },
      active1: { name: '一拳定江湖', description: withStack(2, '往前一拳直接定江湖,狠狠痛擊要害,造成大量傷害。') },
      active2: { name: '兄弟連環助陣', description: withStack(2, '兄弟一個接一個上前助陣,招式力道全開,對敵人造成沉重傷害。') },
      active3: { name: '順手喬事情', description: withStack(2, '順手幫忙喬點事情,順勢補上一記,造成可觀傷害。') },
      active4: { name: '扎實混一天', description: withStack(2, '扎實在外面混了一整天,抓準破綻補刀,造成額外傷害。') },
    },
    3: {
      passive1: { name: '唸咒練出的悟性', description: withStack(3, '日夜唸咒練出的悟性,經驗值吸收得更快。') },
      passive2: { name: '紅包行情摸透了', description: withStack(3, '辦法事的紅包行情摸得一清二楚,順手多收一點。') },
      active1: { name: '一道符鎮壓', description: withStack(3, '一道符咒直接鎮壓對手,狠狠痛擊要害,造成大量傷害。') },
      active2: { name: '連環作法', description: withStack(3, '法器一件接一件連環作法,招式力道全開,對敵人造成沉重傷害。') },
      active3: { name: '順手看個風水', description: withStack(3, '作法之餘順手看個風水,順勢補上一記,造成可觀傷害。') },
      active4: { name: '扎實做完一場法事', description: withStack(3, '扎實做完一整場法事,抓準破綻補刀,造成額外傷害。') },
    },
    4: {
      passive1: { name: '算命練出的洞察力', description: withStack(4, '看命盤看久了練出的洞察力,經驗值吸收得更快。') },
      passive2: { name: '問事行情摸透了', description: withStack(4, '問事收費行情摸得一清二楚,順手多賺一點。') },
      active1: { name: '一卦定生死', description: withStack(4, '一卦下去直接定生死,狠狠痛擊要害,造成大量傷害。') },
      active2: { name: '連環開示', description: withStack(4, '一句接一句連環開示點破,招式力道全開,對敵人造成沉重傷害。') },
      active3: { name: '順手改個名', description: withStack(4, '批完命盤順手幫忙改個名,順勢補上一記,造成可觀傷害。') },
      active4: { name: '扎實批完一輪命盤', description: withStack(4, '扎實批完一整輪命盤,抓準破綻補刀,造成額外傷害。') },
    },
    5: {
      passive1: { name: '得道練出的洞悉力', description: withStack(5, '得道多年練出的洞悉萬物之力,經驗值吸收得更快。') },
      passive2: { name: '香火緣分算透了', description: withStack(5, '香火緣分算得一清二楚,順手多收一點供養。') },
      active1: { name: '一指渡化', description: withStack(5, '仙指一點直接渡化敵人,狠狠痛擊要害,造成大量傷害。') },
      active2: { name: '連環顯化神通', description: withStack(5, '神通一招接一招連環顯化,招式力道全開,對敵人造成沉重傷害。') },
      active3: { name: '順手賜個福', description: withStack(5, '渡化之餘順手賜個福,順勢補上一記,造成可觀傷害。') },
      active4: { name: '扎實悟出一層道理', description: withStack(5, '扎實悟出新的一層道理,抓準破綻補刀,造成額外傷害。') },
    },
    },
    // branch B:1中二國中生 2八家將小將 3乩童 4風水師 5一代宗師
    B: {
      2: {
        passive1: { name: '陣頭練出的膽氣', description: withStack(2, '跟著陣頭出巡練出的膽氣,經驗值吸收得更快。') },
        passive2: { name: '香油錢行情摸透了', description: withStack(2, '陣頭香油錢行情摸得一清二楚,順手多收一點。') },
        active1: { name: '步伐一踏定神', description: withStack(2, '七星步一踏直接定住敵人,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環開路', description: withStack(2, '開路法器一件接一件連環揮舞,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手畫個平安符', description: withStack(2, '出巡空檔順手畫個平安符,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實出完一趟巡', description: withStack(2, '扎實出完整趟遶境巡演,抓準破綻補刀,造成額外傷害。') },
      },
      3: {
        passive1: { name: '起乩練出的直覺', description: withStack(3, '長年起乩練出的通靈直覺,經驗值吸收得更快。') },
        passive2: { name: '問事紅包行情摸透了', description: withStack(3, '問事紅包行情摸得一清二楚,順手多收一點。') },
        active1: { name: '神明附體一擊', description: withStack(3, '神明附體出手直接一擊,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環揮令旗', description: withStack(3, '令旗一揮接一揮連環作法,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手收個驚', description: withStack(3, '問事之餘順手幫忙收個驚,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實辦完一場法會', description: withStack(3, '扎實辦完整場法會才收壇,抓準破綻補刀,造成額外傷害。') },
      },
      4: {
        passive1: { name: '看風水練出的洞察力', description: withStack(4, '看風水看久了練出的洞察力,經驗值吸收得更快。') },
        passive2: { name: '堪輿費行情摸透了', description: withStack(4, '堪輿費行情摸得一清二楚,順手多賺一點堪輿費。') },
        active1: { name: '羅盤一轉定局', description: withStack(4, '羅盤一轉直接鎮定敵人,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環擺陣布局', description: withStack(4, '陣法一組接一組連環佈局,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手看個日子', description: withStack(4, '堪輿之餘順手幫忙看個好日子,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實勘完一整棟', description: withStack(4, '扎實勘完整棟房子的風水,抓準破綻補刀,造成額外傷害。') },
      },
      5: {
        passive1: { name: '宗師練出的洞悉力', description: withStack(5, '一代宗師練出的洞悉萬物之力,經驗值吸收得更快。') },
        passive2: { name: '拜師禮行情摸透了', description: withStack(5, '拜師禮行情摸得一清二楚,順手多收一點供養。') },
        active1: { name: '一代宗師一擊', description: withStack(5, '宗師出手一擊直接鎮壓全場,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環傳授絕學', description: withStack(5, '絕學招式一招接一招連環傳授,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手收個徒弟', description: withStack(5, '傳道之餘順手收個入門徒弟,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實開宗立派', description: withStack(5, '扎實把宗派根基打穩才罷手,抓準破綻補刀,造成額外傷害。') },
      },
    },
  },
  magicRanged: {
    // branch A:1電競選手/實況主 2軟體工程師 3研究員/科學家 4駭客 5AI天才工程師
    A: {
    2: {
      passive1: { name: '寫 code 練出的邏輯力', description: withStack(2, '每天寫 code 練出的邏輯思維,經驗值吸收得更快。') },
      passive2: { name: '接案行情摸透了', description: withStack(2, '接案行情摸得一清二楚,順手多賺一點外快。') },
      active1: { name: '連環部署上線', description: withStack(2, '功能一個接一個部署上線,招式力道全開,對敵人造成沉重傷害。') },
      active2: { name: '順手接個小案子', description: withStack(2, '下班前順手接個小案子,順勢補上一記,造成可觀傷害。') },
      active3: { name: '熬夜除錯的心得', description: withStack(2, '熬夜除錯練出的心得,抓準破綻補刀,造成額外傷害。') },
      active4: { name: '一鍵重構搞定', description: withStack(2, '一鍵重構直接搞定,狠狠痛擊要害,造成大量傷害。') },
    },
    3: {
      passive1: { name: '泡實驗室練出的直覺', description: withStack(3, '泡在實驗室練出的實驗直覺,經驗值吸收得更快。') },
      passive2: { name: '研究經費算盤', description: withStack(3, '研究經費算得精打細算,順手多爭取一點補助。') },
      active1: { name: '連環發表論文', description: withStack(3, '論文一篇接一篇連環發表,招式力道全開,對敵人造成沉重傷害。') },
      active2: { name: '順手申請個專利', description: withStack(3, '實驗之餘順手申請個專利,順勢補上一記,造成可觀傷害。') },
      active3: { name: '反覆實驗練出的心得', description: withStack(3, '反覆實驗累積出的心得,抓準破綻補刀,造成額外傷害。') },
      active4: { name: '一次實驗成功', description: withStack(3, '關鍵一次實驗直接成功,狠狠痛擊要害,造成大量傷害。') },
    },
    4: {
      passive1: { name: '潛伏練出的敏銳度', description: withStack(4, '長期潛伏系統練出的敏銳度,經驗值吸收得更快。') },
      passive2: { name: '賞金行情摸透了', description: withStack(4, '抓漏賞金行情摸得一清二楚,順手多賺一點賞金。') },
      active1: { name: '連環入侵防線', description: withStack(4, '防線一道接一道連環突破,招式力道全開,對敵人造成沉重傷害。') },
      active2: { name: '順手抓個漏洞', description: withStack(4, '入侵之餘順手抓個漏洞回報,順勢補上一記,造成可觀傷害。') },
      active3: { name: '破解練出的心得', description: withStack(4, '破解系統累積出的心得,抓準破綻補刀,造成額外傷害。') },
      active4: { name: '一次全面接管', description: withStack(4, '一次入侵直接全面接管,狠狠痛擊要害,造成大量傷害。') },
    },
    5: {
      passive1: { name: '訓練模型練出的直覺', description: withStack(5, '訓練模型調參練出的直覺,經驗值吸收得更快。') },
      passive2: { name: '授權金行情摸透了', description: withStack(5, '技術授權行情摸得一清二楚,順手多賺一筆授權金。') },
      active1: { name: '連環推論加速', description: withStack(5, '推論一輪接一輪連環加速,招式力道全開,對敵人造成沉重傷害。') },
      active2: { name: '順手接個顧問案', description: withStack(5, '研發之餘順手接個顧問案,順勢補上一記,造成可觀傷害。') },
      active3: { name: '煉模型練出的心得', description: withStack(5, '反覆煉模型累積出的心得,抓準破綻補刀,造成額外傷害。') },
      active4: { name: '一次推理秒殺', description: withStack(5, '模型一次推理直接秒殺對手,狠狠痛擊要害,造成大量傷害。') },
    },
    },
    // branch B:1電競選手/實況主 2資料科學家 3量子物理博士生 4密碼學專家 5諾貝爾獎得主
    B: {
      2: {
        passive1: { name: '跑模型練出的直覺', description: withStack(2, '反覆跑模型練出的資料直覺,經驗值吸收得更快。') },
        passive2: { name: '接案行情摸透了', description: withStack(2, '資料顧問案行情摸得一清二楚,順手多賺一點外快。') },
        active1: { name: '模型一鍵推論', description: withStack(2, '模型一鍵推論直接命中,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環跑批次任務', description: withStack(2, '批次任務一個接一個連環跑完,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手清理個資料集', description: withStack(2, '訓練空檔順手清理個資料集,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實跑完一輪訓練', description: withStack(2, '扎實跑完整輪模型訓練,抓準破綻補刀,造成額外傷害。') },
      },
      3: {
        passive1: { name: '泡實驗室練出的直覺', description: withStack(3, '泡在量子實驗室練出的直覺,經驗值吸收得更快。') },
        passive2: { name: '獎學金行情摸透了', description: withStack(3, '獎學金申請行情摸得一清二楚,順手多爭取一點補助。') },
        active1: { name: '量子糾纏一擊', description: withStack(3, '量子糾纏效應瞬間命中,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環做實驗', description: withStack(3, '實驗一組接一組連環進行,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手發個論文', description: withStack(3, '研究之餘順手發表個小論文,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實跑完一次觀測', description: withStack(3, '扎實跑完整套量子觀測實驗,抓準破綻補刀,造成額外傷害。') },
      },
      4: {
        passive1: { name: '破解練出的敏銳度', description: withStack(4, '長期破解密碼練出的敏銳度,經驗值吸收得更快。') },
        passive2: { name: '顧問費行情摸透了', description: withStack(4, '資安顧問費行情摸得一清二楚,順手多賺一點顧問費。') },
        active1: { name: '破解演算法一擊', description: withStack(4, '破解演算法瞬間找到弱點,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環暴力破解', description: withStack(4, '暴力破解一輪接一輪連環嘗試,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手修個漏洞', description: withStack(4, '破解之餘順手回報修補個漏洞,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實破完一套加密', description: withStack(4, '扎實破完整套加密系統,抓準破綻補刀,造成額外傷害。') },
      },
      5: {
        passive1: { name: '諾獎等級的洞察力', description: withStack(5, '諾貝爾獎等級淬煉出的洞察力,經驗值吸收得更快。') },
        passive2: { name: '獎金行情摸透了', description: withStack(5, '獎金加演講費行情算得一清二楚,順手多賺一筆。') },
        active1: { name: '劃時代理論一擊', description: withStack(5, '劃時代理論瞬間擊中要害,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環發表突破', description: withStack(5, '突破性研究一篇接一篇連環發表,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手指導個學生', description: withStack(5, '研究之餘順手指導個博士生,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實領完一次獎', description: withStack(5, '扎實走完整趟頒獎典禮,抓準破綻補刀,造成額外傷害。') },
      },
    },
  },
  magicSupport: {
    // branch A:1藥師 2醫生 3心理諮商師 4老中醫 5神醫/華佗再世
    A: {
    2: {
      passive1: { name: '問診練出的判斷力', description: withStack(2, '問診看久了練出的敏銳判斷力,經驗值吸收得更快。') },
      passive2: { name: '診療行情摸透了', description: withStack(2, '診療費行情摸得一清二楚,順手多賺一點診療費。') },
      active1: { name: '順手開個檢查單', description: withStack(2, '看診順手多開一張檢查單,順勢補上一記,造成可觀傷害。') },
      active2: { name: '衛教叮嚀到位', description: withStack(2, '衛教叮嚀交代得又細又到位,抓準破綻補刀,造成額外傷害。') },
      active3: { name: '一針見效', description: withStack(2, '對症下藥一針見效,狠狠痛擊要害,造成大量傷害。') },
      active4: { name: '雙倍藥效發揮', description: withStack(2, '藥效發揮加倍見效,招式力道全開,對敵人造成沉重傷害。') },
    },
    3: {
      passive1: { name: '傾聽練出的洞察力', description: withStack(3, '長期傾聽練出的敏銳洞察力,經驗值吸收得更快。') },
      passive2: { name: '諮商鐘點算盤', description: withStack(3, '諮商鐘點費算得精打細算,順手多賺一點鐘點費。') },
      active1: { name: '順手排個加談', description: withStack(3, '晤談之餘順手排個加談時段,順勢補上一記,造成可觀傷害。') },
      active2: { name: '同理心叮嚀', description: withStack(3, '同理心叮嚀說得又細又暖,抓準破綻補刀,造成額外傷害。') },
      active3: { name: '一句話點醒', description: withStack(3, '關鍵一句話直接點醒對方,狠狠痛擊要害,造成大量傷害。') },
      active4: { name: '雙倍療癒效果', description: withStack(3, '療癒效果加倍發揮作用,招式力道全開,對敵人造成沉重傷害。') },
    },
    4: {
      passive1: { name: '把脈練出的敏銳度', description: withStack(4, '把脈把久了練出的敏銳手感,經驗值吸收得更快。') },
      passive2: { name: '藥材行情摸透了', description: withStack(4, '藥材行情摸得一清二楚,順手多賺一點藥錢。') },
      active1: { name: '順手抓帖藥', description: withStack(4, '看診順手多抓一帖藥,順勢補上一記,造成可觀傷害。') },
      active2: { name: '食療叮嚀到位', description: withStack(4, '食療叮嚀交代得又細又到位,抓準破綻補刀,造成額外傷害。') },
      active3: { name: '一帖藥到病除', description: withStack(4, '一帖藥下去直接藥到病除,狠狠痛擊要害,造成大量傷害。') },
      active4: { name: '雙倍藥膳進補', description: withStack(4, '藥膳進補加倍見效,招式力道全開,對敵人造成沉重傷害。') },
    },
    5: {
      passive1: { name: '神乎其技的判斷力', description: withStack(5, '神乎其技的診斷功力,經驗值吸收得更快。') },
      passive2: { name: '義診名聲換來的緣分', description: withStack(5, '義診名聲累積出的行情,順手多收一點謝禮。') },
      active1: { name: '順手義診一輪', description: withStack(5, '看診之餘順手義診一輪,順勢補上一記,造成可觀傷害。') },
      active2: { name: '妙手叮嚀到位', description: withStack(5, '妙手叮嚀交代得又細又到位,抓準破綻補刀,造成額外傷害。') },
      active3: { name: '妙手回春', description: withStack(5, '妙手一出直接妙手回春,狠狠痛擊要害,造成大量傷害。') },
      active4: { name: '雙倍回春神效', description: withStack(5, '回春神效加倍發揮,招式力道全開,對敵人造成沉重傷害。') },
    },
    },
    // branch B:1藥師 2獸醫 3芳療師 4針灸師 5都市傳說級神醫
    B: {
      2: {
        passive1: { name: '看診練出的判斷力', description: withStack(2, '動物看診練出的敏銳判斷力,經驗值吸收得更快。') },
        passive2: { name: '診療費行情摸透了', description: withStack(2, '動物診療費行情摸得一清二楚,順手多賺一點診療費。') },
        active1: { name: '麻醉針一針見效', description: withStack(2, '麻醉針一針精準見效,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環巡房看診', description: withStack(2, '巡房看診一輪接一輪連環進行,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手幫忙剪指甲', description: withStack(2, '看診之餘順手幫忙剪個指甲,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實看完一輪門診', description: withStack(2, '扎實看完整輪門診才收工,抓準破綻補刀,造成額外傷害。') },
      },
      3: {
        passive1: { name: '按摩練出的手感', description: withStack(3, '長年按摩練出的敏銳手感,經驗值吸收得更快。') },
        passive2: { name: '精油行情摸透了', description: withStack(3, '精油療程行情摸得一清二楚,順手多賺一點療程費。') },
        active1: { name: '穴位一按見效', description: withStack(3, '精準按壓穴位一按見效,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環精油按摩', description: withStack(3, '按摩手法一輪接一輪連環進行,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手調配個精油', description: withStack(3, '療程之餘順手調配個專屬精油,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實做完一整套療程', description: withStack(3, '扎實做完整套芳療療程,抓準破綻補刀,造成額外傷害。') },
      },
      4: {
        passive1: { name: '把脈練出的敏銳度', description: withStack(4, '長年把脈練出的敏銳手感,經驗值吸收得更快。') },
        passive2: { name: '針灸費行情摸透了', description: withStack(4, '針灸療程費行情摸得一清二楚,順手多賺一點療程費。') },
        active1: { name: '銀針一針見血', description: withStack(4, '銀針精準下針一針見血,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環下針', description: withStack(4, '銀針一根接一根連環下針,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手拔個罐', description: withStack(4, '針灸之餘順手幫忙拔個罐,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實紮完一輪療程', description: withStack(4, '扎實紮完整輪針灸療程,抓準破綻補刀,造成額外傷害。') },
      },
      5: {
        passive1: { name: '神乎其技的判斷力', description: withStack(5, '都市傳說等級的診斷功力,經驗值吸收得更快。') },
        passive2: { name: '義診名聲換來的緣分', description: withStack(5, '神醫名聲累積出的行情,順手多收一點謝禮。') },
        active1: { name: '妙手回春一針', description: withStack(5, '妙手一出直接妙手回春,狠狠痛擊要害,造成大量傷害。') },
        active2: { name: '連環神乎奇技', description: withStack(5, '神乎其技的手法一招接一招連環使出,招式力道全開,對敵人造成沉重傷害。') },
        active3: { name: '順手義診一輪', description: withStack(5, '看診之餘順手義診一輪,順勢補上一記,造成可觀傷害。') },
        active4: { name: '扎實治癒一位疑難雜症', description: withStack(5, '扎實治好一位疑難雜症患者,抓準破綻補刀,造成額外傷害。') },
      },
    },
  },
};

// tier=1 時呼叫端應改用 game/skillTree.ts 的 SKILL_SLOT_NAMES/SKILL_SLOT_DESCRIPTIONS,這個函式只處理 2~5。
export function getTierSkillFlavor(
  archetype: Archetype,
  branch: JobBranch,
  tier: Exclude<JobTier, 1>,
  slot: SkillSlotId
): TierSkillFlavor {
  // passive3 沒有 tier2~5 專屬敘述(見上面 TierBranchSlotId 的說明),不管玩家目前在看哪一階,
  // 一律回傳 game/skillTree.ts 那份全職業全階級共用的鎖定文案。
  if (slot === 'passive3') {
    return { name: SKILL_SLOT_NAMES[archetype].passive3, description: SKILL_SLOT_DESCRIPTIONS[archetype].passive3 };
  }
  return TIER_SKILL_FLAVOR[archetype][branch][tier][slot];
}
