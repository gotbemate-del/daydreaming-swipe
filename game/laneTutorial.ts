// 教學關(1-1 ~ 1-5)的機制開放表。純邏輯層,**刻意不 import laneRun**——
// laneRun 要讀這一份,反過來就是循環相依(跟 laneJobs 那邊同一個坑)。
//
// ## 為什麼教學要「拿掉東西」而不是「放水」
//
// 第一大關本來就有一條放水的斜坡(laneRun 的 EASY_RATIO:1-1 最鬆、1-10 接近正式難度),
// 但放寬容錯只解決「學會之前先死掉」,解決不了另一件事:**第一場就有八種東西同時在動**。
// 閘門要選、石頭要閃、勇者波要躲、每打完一波還跳出三選一的技能面板——新玩家看到的是
// 一整片會動的東西,而不是一條「站左邊還是站右邊」的規則。他學不會的原因不是太難,
// 是**同時要學的事情太多**。
//
// 所以教學區的做法是逐關**開放**機制:1-1 只有閘門,之後一關加一兩樣。
// 每一關最多只新增兩種機制,而且成對出現的那兩種一定是**同一課**
// (石頭與勇者波都是「閃開」、爆發格與腰斬都是「這一格是用乘的」)。
// 前一關學的東西全部留著,所以每一關同時也是複習。
//
// ## 這樣不會破壞敵人曲線的結構保證
//
// 這是這個檔最重要的一句話。敵人戰力是 `createRun` **逐場模擬「這一場的最佳路線」**
// 算出來的,不是查一張表。所以拿掉爆發格、拿掉裝備閘門、拿掉場內技能之後,
// 最佳路線自己就變低了,敵人跟著變低——**「每一排都選對就一定過關」在教學關照樣成立**,
// 而且完全不需要手動補償任何數字。
//
// 反過來說:**任何教學規則都必須走 createRun 看得到的路徑**。如果哪天有人在畫面層
// 偷偷把石頭藏起來、卻沒有讓 createRun 知道,結構保證不會壞(石頭本來就不進理想路線),
// 但如果是把「場內技能」藏在畫面層而理想路線照算,玩家就會一路落後敵人,
// 而且看起來像是「這關特別難」——這個專案在「兩側必須同時算」上面摔過好幾次
// (見 CLAUDE.md 的場內技能與吸收那兩條)。
//
// ## 為什麼教學關比較短
//
// 一般小關是 10 波、3 分鐘,那是為「一場裡有好幾種東西輪流上場」設計的長度。
// 1-1 只有閘門,拿 3 分鐘去跑 20 個「+1 還是 -1」的二選一是純粹的耗時間——
// 玩家在第 5 個閘門就已經學會了,剩下 15 個是在等它結束。
// 所以教學關自己帶波數(5 → 6 → 8 → 10),而 `targetSecondsForStage` 讓每一波的秒數
// 維持在正常值(約 18 秒),關卡長度就跟著波數走:90 秒 → 108 → 144 → 180。
//
// 1-5 是例外,它照「編號是 5 的倍數就加倍長」的通則走 20 波。那是刻意的:
// 它是教學區的畢業考,也是玩家第一次碰到加倍長的小關,而「這一關特別長」本身
// 就是要教的事情之一。

/** 教學關一共幾個小關。1-1 ~ 1-5,第 6 小關之後全機制開放。 */
export const TUTORIAL_STAGES = 5;

/**
 * 一個教學小關開放了哪些機制。
 *
 * 全部是**布林開關而不是幅度**,這是刻意的:幅度型的旋鈕(放水)會讓玩家學到錯的東西——
 * 他以為自己看懂了,其實是這一關的閘門特別好。開關型的則是「這個東西還沒登場」,
 * 登場之後就是正式的樣子,沒有第二套規則要重新學。
 */
export interface TutorialRules {
  /** 第幾個小關(1 ~ TUTORIAL_STAGES)。 */
  stage: number;
  /** 這一關幾波。教學關自己帶,不走 wavesForStage 的通則。 */
  waves: number;
  /** 有沒有「裝備強化 / 裝備損壞」這一類閘門。關掉的話兩格都是人數增減。 */
  gearGates: boolean;
  /** 有沒有爆發格(數量 x2)。 */
  doubleGates: boolean;
  /** 有沒有最痛的那種陷阱(數量 x0.5,一次腰斬)。 */
  halveTrap: boolean;
  /** 路障石頭。 */
  rocks: boolean;
  /** 勇者波(敵方投擲武器,要閃)。 */
  heroWaves: boolean;
  /** 精英(一隻抵一群)。 */
  elites: boolean;
  /** 場內技能(每打完一波三選一)。關掉的話跑圖中途完全不會暫停。 */
  runSkills: boolean;
  /**
   * 這一關的容錯係數(敵人戰力佔最佳路線的幾成)。**教學關自己指定,不走 EASY_RATIO 那條斜坡。**
   *
   * 為什麼要接管:那條斜坡是照**小關編號**線性內插的(1-1 最鬆、1-10 接近正式難度),
   * 它假設每一關的長度都一樣。1-5 是加倍長的小關(20 波、20 個閘門),而失誤是複利的——
   * 照斜坡給它 0.313 的話,實測 90% 準確率只有 29% 過關,**跟大魔王關 1-10(21%)幾乎一樣硬**。
   * 那不是設計決定的,是「路比較長」的副作用,而它剛好落在教學區的最後一關。
   *
   * 所以教學關的容錯係數是**量出來的**不是內插出來的:每一關都要滿足
   * 「90% 準確率 → 幾乎一定過」,而 1-5 因為多一倍長,同樣的體感需要更鬆的係數。
   * 1-6 之後回到 EASY_RATIO 的斜坡(0.347 → 0.48),跟這裡的 1-5 接得上、不會往下跳。
   * (`verify-lane-tutorial.ts` 有兩項在盯:單調上升,以及每一關的過關率曲線。)
   */
  enemyPowerRatio: number;
  /** 主介面上這一關的標題,例如「拉著史萊姆走」。 */
  title: string;
  /** 主介面上那一行:這一關要學什麼。 */
  lesson: string;
  /** 開跑之後浮在跑道上的那一句。要短——它跟前方的閘門在搶注意力。 */
  tip: string;
}

/**
 * 教學區的機制階梯。**索引 0 = 1-1。**
 *
 * 讀法是「這一關新增了什麼」:每一列跟上一列只差一兩個 true,而那一兩個就是
 * `lesson` 在講的東西。改動的時候要維持這個性質——一次開放兩三種機制的話,
 * 玩家又回到「同時要學好幾件事」,那正是這張表在解決的問題。
 * (`verify-lane-tutorial.ts` 有一項在盯「機制只會增加不會減少」。)
 */
const TUTORIAL: TutorialRules[] = [
  {
    stage: 1,
    waves: 5,
    gearGates: false,
    doubleGates: false,
    halveTrap: false,
    rocks: false,
    heroWaves: false,
    elites: false,
    runSkills: false,
    enemyPowerRatio: 0.18,
    title: '拉著史萊姆走',
    // 第一關只教操作。閘門兩格是「數量 +N」與「數量 -N」,好壞一眼看得出來,
    // 所以玩家要練的不是判斷而是**手**:把史萊姆真的拉到那一格上面。
    lesson: '按著畫面把史萊姆拖到想吃的那一格',
    // 「不動什麼都吃不到」是這款的第一課,而起跑位置剛好就在兩格中間的空隙上,
    // 所以這句話講完玩家馬上就會驗證到它。
    tip: '起跑在正中間 —— 不動的話兩格都吃不到',
  },
  {
    stage: 2,
    waves: 6,
    gearGates: true,
    doubleGates: false,
    halveTrap: false,
    rocks: false,
    heroWaves: false,
    elites: false,
    runSkills: false,
    enemyPowerRatio: 0.21,
    title: '人數與裝備',
    // 裝備閘門一登場,閘門就從「好 vs 壞」變成「我這一排缺人還是缺裝備」——
    // 那才是這款真正的決策。放在第二關是因為它需要第一關的操作當基礎。
    lesson: '戰力 = 人數 x 每人攻擊力,兩邊都要顧',
    tip: '裝備強化是全隊一起變強 —— 人越多越划算',
  },
  {
    stage: 3,
    waves: 8,
    gearGates: true,
    doubleGates: false,
    halveTrap: false,
    rocks: false,
    heroWaves: false,
    elites: true,
    runSkills: true,
    enemyPowerRatio: 0.25,
    title: '這一場的技能',
    // 場內技能是第一個「跑圖會停下來」的東西,而且它同時把六元素與相剋帶進來。
    // 前兩關完全不停,所以玩家第一次看到面板時會知道那是一件新的事。
    // 精英也排在這一關:牠是「一波只有一隻大的」,跟技能面板一樣屬於「波與波之間」
    // 的事情——玩家要先看過兩關正常的小怪,才分得出「這波怪比較少」不是「這波比較弱」。
    lesson: '每打完一波挑一個技能,只在這一場有效',
    tip: '挑技能時跑圖會暫停 —— 慢慢看沒關係',
  },
  {
    stage: 4,
    waves: 10,
    gearGates: true,
    doubleGates: false,
    halveTrap: false,
    rocks: true,
    heroWaves: true,
    elites: true,
    runSkills: true,
    enemyPowerRatio: 0.28,
    title: '要閃的東西',
    // 石頭與勇者波是這一關的主題,它們跟閘門是**相反**的操作:閘門要踩上去,
    // 這兩個要避開。一起放進來是因為它們教的是同一件事(反應,不是選擇)。
    lesson: '石頭與敵方勇者的武器 —— 站哪裡都行,只要不是那裡',
    tip: '這兩樣不用選 —— 閃開就好',
  },
  {
    stage: 5,
    // 1-5 照通則是加倍長的小關(編號是 5 的倍數),這裡不做例外:
    // 「有些關特別長」本身就是要教的事。
    waves: 20,
    gearGates: true,
    doubleGates: true,
    halveTrap: true,
    rocks: true,
    heroWaves: true,
    elites: true,
    runSkills: true,
    // 0.20 是量出來的:它讓 1-5 的過關率曲線**剛好等於 1-6**(90% 準確率 → 約 67%),
    // 也就是「畢業考的難度 = 畢業之後的第一關」。
    // 數字比 1-4(0.28)低不代表它比較簡單——1-5 有兩倍的波數,失誤是複利的,
    // 同一個係數在 20 波下會硬得多(0.28 實測只剩 29% 過關,跟大魔王關 1-10 差不多)。
    // **教學關之間不能拿這個數字互相比較,要比就比過關率曲線**(verify 盯的就是曲線)。
    enemyPowerRatio: 0.20,
    title: '畢業考',
    // 這一關新增的兩格都是**乘法**:爆發格 x2 與腰斬 x0.5。前四關的閘門全是加減,
    // 所以「有些格子是用乘的」是一課,兩格一起登場才講得清楚。
    lesson: '爆發格 x2 與腰斬 x0.5 —— 有些格子是用乘的',
    tip: '這關有兩倍長 —— 爆發格每場兩個,別跟腰斬搞混',
  },
];

/**
 * 這一小關的教學規則。**不是教學關就回 null**,呼叫端看到 null 就走正常的通則。
 *
 * 判斷條件刻意寫成 `stage <= TUTORIAL_STAGES` 而不是 `chapterOfStage(stage) === 1 && ...`:
 * 那兩個函式在 laneRun,import 進來就是循環相依。而第 1 大關就是第 1~10 小關,
 * 所以 1~5 這五個數字本身已經精確等於「1-1 ~ 1-5」。
 */
export function tutorialRulesFor(stage: number): TutorialRules | null {
  if (!Number.isFinite(stage)) return null;
  const index = Math.floor(stage) - 1;
  return index >= 0 && index < TUTORIAL.length ? TUTORIAL[index] : null;
}

/** 這一關是不是教學關。 */
export function isTutorialStage(stage: number): boolean {
  return tutorialRulesFor(stage) !== null;
}

/**
 * 全部機制都開放的那一份規則,給驗證腳本當「畢業之後長什麼樣」的對照組。
 * 導出的是最後一關(1-5)——它本來就是全開的那一列。
 */
export const FULL_RULES: TutorialRules = TUTORIAL[TUTORIAL.length - 1];

/** 機制開關的欄位名。驗證腳本靠它掃「只會增加不會減少」,不必手動列一遍。 */
export const MECHANIC_KEYS = [
  'gearGates', 'doubleGates', 'halveTrap', 'rocks', 'heroWaves', 'elites', 'runSkills',
] as const satisfies readonly (keyof TutorialRules)[];
