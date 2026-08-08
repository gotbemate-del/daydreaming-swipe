// 場內技能(純邏輯,禁止 import React)。
//
//
// **這一套是「這一場限定」的,跑完就沒了。** 跟 game/laneSkills.ts 的永久技能是兩件事:
//
//   laneSkills.ts    永久,每通過一關選一次,只調整**起跑數值**,幅度必須很小(+45% 上限)
//   laneRunSkills.ts 場內,每打完一波選一次,只影響**這一場**,幅度可以大得多
//
// 為什麼場內的可以大:它每場重置,不會累積到下一場,所以不存在「養成買到勝利」的問題。
// 玩家在一場之內從無到有堆出一套組合,下一場重來——這是 roguelite 的迴圈,
// 跟永久養成的迴圈可以並存,但**不能混在同一個系統裡**,不然幅度只能遷就比較嚴的那一邊。
//
// 未來的技能書(副本掉落)是第三層:它調的是「場內技能的等級上限」,不是直接給數值。
// 姊妹作的 game/skillTree.ts 已經有這套(SKILL_LEVEL_CAP 10 / MAX_EFFECTIVE_SKILL_LEVEL 50),
// 接的時候沿用那份,不要另外發明。
//
// ## 兩側必須同時算(踩過了,記在這裡)
//
// 敵人戰力是照「這一場的最佳路線」算的(見 laneRun 的 createRun),而場內技能會讓玩家
// 比「只吃閘門」更強。所以這兩件事**必須同時上**:
//
//   玩家側:useLaneRun 持有 RunSkillState[],選中的當下就把 runSkillEffects 結算進 RunState
//   敵人側:createRun 的理想路線用 runSkillOffersAt + bestRunSkillChoice 重播同一串選擇
//
// 只上敵人側的話,實測領先幅度會從 2.44x 掉到 0.50x,連「每排都挑最好」都過不了關
// (11 項驗證同時失敗)。只上玩家側則相反,領先幅度膨脹到 10x,中段又變成沒事做。
// 這就是 CLAUDE.md 記載的「兩條各走各的指數」在新系統上的翻版。
//
// 而且敵人側**不能用「平均的理想曲線」估**,要重播這一場真正開出來的選項:
// 四選三會漏掉一個,理由跟閘門那邊一模一樣(見 CLAUDE.md「用平均理想路線估敵人也不夠」)。

// 刻意不從 laneRun import 任何東西:laneRun 會 import 這個檔(理想路線要把場內技能算進去),
// 反向再 import 就是循環相依——實測會炸在「Cannot access 'GEAR_STEP' before initialization」,
// 而且是在模組載入時才炸,型別檢查完全看不出來。
export type RunSkillId =
  // 六元素 x 三階 = 18 款。**一階是被動,二三階是主動**(冷卻好了、而且畫面上有怪,
  // 就自己放出去),二三階全部造成傷害——只有木的一階例外,它是補人不是打人。
  //
  // 一階的 id 刻意維持沒有後綴(`fire` 而不是 `fire1`):圖鑑的 501 個條目、
  // 波次屬性、相剋表全部拿這六個字串當 key,加後綴等於要同時改存檔與圖鑑對應表。
  //
  // 鋒刃(每人攻擊力 +N%)與增殖(數量 +N%)已依指示移除。**那兩款是唯二進理想路線的**,
  // 所以現在場內技能對理想路線的貢獻是 0 —— 二三階雖然會殺怪,但殺的是「你漏掉的那幾隻」:
  // 理想玩家本來就全清,多給他清怪的能力等於零(見 RUN_SKILLS 上面的長註解)。
  | 'fire' | 'fire2' | 'fire3'
  | 'metal' | 'metal2' | 'metal3'
  | 'thunder' | 'thunder2' | 'thunder3'
  | 'ice' | 'ice2' | 'ice3'
  | 'wood' | 'wood2' | 'wood3'
  | 'earth' | 'earth2' | 'earth3';

/**
 * 這一款屬於哪一個元素(二三階回傳它的一階 id)。
 *
 * 相剋、圖鑑加成、屬性染色全部走這一支:`fire3` 對上木一樣要吃到剋制,
 * 圖鑑收滿火的那幾件也要一起放大火的三階。**不要用字串比對硬拆**——
 * 加一個新元素的時候會漏掉其中一處,而漏掉的那一處會安靜地永遠回傳 1。
 */
export function elementOf(id: RunSkillId): RunSkillId {
  return SKILL_TIERS[id].element;
}

/** 這一款是第幾階(1 = 被動,2/3 = 主動)。 */
export function skillTier(id: RunSkillId): 1 | 2 | 3 {
  return SKILL_TIERS[id].tier;
}

/**
 * id → (元素, 階級)。**這張表就是技能組的骨架**,新增技能只改這裡與 RUN_SKILLS。
 * 寫成查表而不是從字串推(`id.endsWith('2')`)是因為一階沒有後綴,
 * 用字串推就會需要一條特例,而特例正是以後漏掉的地方。
 */
const SKILL_TIERS: Record<RunSkillId, { element: RunSkillId; tier: 1 | 2 | 3 }> = {
  fire: { element: 'fire', tier: 1 }, fire2: { element: 'fire', tier: 2 }, fire3: { element: 'fire', tier: 3 },
  metal: { element: 'metal', tier: 1 }, metal2: { element: 'metal', tier: 2 }, metal3: { element: 'metal', tier: 3 },
  thunder: { element: 'thunder', tier: 1 }, thunder2: { element: 'thunder', tier: 2 }, thunder3: { element: 'thunder', tier: 3 },
  ice: { element: 'ice', tier: 1 }, ice2: { element: 'ice', tier: 2 }, ice3: { element: 'ice', tier: 3 },
  wood: { element: 'wood', tier: 1 }, wood2: { element: 'wood', tier: 2 }, wood3: { element: 'wood', tier: 3 },
  earth: { element: 'earth', tier: 1 }, earth2: { element: 'earth', tier: 2 }, earth3: { element: 'earth', tier: 3 },
};

/** 這一款的上一階(一階回傳 null)。選項池用它做「要先有前一階」的門檻。 */
export function previousTier(id: RunSkillId): RunSkillId | null {
  const { element, tier } = SKILL_TIERS[id];
  if (tier === 1) return null;
  return tier === 2 ? element : (`${element}2` as RunSkillId);
}

/**
 * 六元素。每一款的**規則**都不一樣(不是同一個東西換名字),而且互相剋制(見 ELEMENT_COUNTERS)。
 *
 * **六個都刻意只在你失誤時才生效**(漏接、被撞、快死),完美玩家全清不漏,一個都碰不到:
 * 這讓它們自動不進理想路線,敵人不會為了一個沒人用得到的東西變強——
 * 跟兌換率、主動技能同一個道理,也是這款所有「抬地板不抬天花板」機制的共同形狀。
 *
 * 光(護盾)與暗(吸取)已移除。移除之後原本的第二個閉環(光→暗→雷)只剩雷一個,
 * 會變成沒有剋制對象的孤兒,所以雷併進五行環——見 ELEMENT_COUNTERS。
 */
export const ELEMENTS: RunSkillId[] = ['fire', 'metal', 'thunder', 'ice', 'wood', 'earth'];
export function isElement(id: RunSkillId): boolean {
  return ELEMENTS.includes(id);
}

/**
 * 相剋表:每個元素剋誰。**一個閉環,所以每個元素剛好剋一個、也剛好被一個剋**——
 * 沒有「萬用元素」也沒有「廢元素」。
 *
 *   金 → 木 → 土 → 冰 → 火 → 雷 → 金
 *
 * 雷原本在另一條環(光→暗→雷→光)上,光與暗移除之後那條環斷了,雷會變成孤兒
 * (剋不到人也不被剋 = 永遠 x1,等於一款沒有相剋的萬用元素,那正是相剋要避免的東西)。
 * 所以把雷插在火與金之間,六個元素併成單一閉環,「每個剛好剋一個」的性質保住。
 *   三才:光 → 暗 → 雷 → 光
 *
 * ## 相剋是**逐元素**的,不是整組的純量
 *
 * 剋中:那一個元素的效果 x COUNTER_BONUS。被剋:那一個元素的效果 x (1 - COUNTERED_PENALTY)。
 * 其他元素、主動技能、基礎戰力一律不動。
 *
 * 早期版本是「剋中就把身上所有元素一起放大」,那等於帶對屬性就整體 x2.5——
 * 是另一種形式的買到勝利,而且完全看不出「我是靠哪一個元素贏的」。逐元素之後,
 * 一波裡可能同時有一個元素被放大、另一個被削弱,面板才有東西可以顯示。
 *
 * ## 為什麼這樣做不會變成「查表」或「擲骰子」
 *
 * 這是原本反對相剋的兩個理由:看得到下一波屬性 ⇒ 挑剋它的那個,是查表不是決策;
 * 看不到 ⇒ 純運氣。解法是**把屬性公開**(進關卡前列出整關的順序,面板列接下來三波),
 * 於是決策變成:
 *
 *   押注:花一個格子點剋接下來幾波的元素,那幾波會非常好過,但之後可能用不到
 *   通用:點一個每一波都有用的(鋒刃/增殖/冰/木…),平均但不突出
 *
 * 10 個格子、14 種技能,**押錯就是浪費一格**——這才是取捨。而且被剋還要再扣一刀,
 * 所以「整組都點同一個環上的元素」會在特定幾波集體變弱,分散比集中安全。
 *
 * **勇者波是唯一不公開的**(見 laneRun 的 elementForRow salt):敵方是勇者不是怪,
 * 屬性另外抽、關卡前只標「?」——押注押得再準,每三波還是有一波要靠通用技能扛。
 *
 * ## 為什麼它不會破壞敵人的結構保證
 *
 * 相剋只放大「元素本來的效果」,而八元素全部只在**你已經失誤了**的時候才生效
 * (打不完、漏接、死過人)。完美玩家全清不漏,所以相剋對他一樣是零——
 * 它照樣不進理想路線,敵人不會為了它變強。被剋的那一半同理:扣的是本來就等於零的東西。
 */
export const ELEMENT_COUNTERS: Partial<Record<RunSkillId, RunSkillId>> = {
  metal: 'wood', wood: 'earth', earth: 'ice', ice: 'fire', fire: 'thunder', thunder: 'metal',
};

/** 剋中的時候,那一個元素的效果放大幾倍。 */
export const COUNTER_BONUS = 2.5;
/** 被剋的時候,那一個元素的效果扣掉幾成。 */
export const COUNTERED_PENALTY = 1 / 3;

/**
 * 我這一個元素碰上這一波的屬性,效果乘多少。
 * 剋中 x2.5、被剋 x2/3、其餘 x1。非元素(鋒刃/增殖/主動技能)一律 1。
 */
export function elementMatchup(mine: RunSkillId, waveElement?: RunSkillId): number {
  if (!waveElement) return 1;
  // 二三階走它的一階去查表:`fire3` 對上木一樣要剋中,不然「押對屬性」在高階就失效了。
  const el = elementOf(mine);
  if (ELEMENT_COUNTERS[el] === waveElement) return COUNTER_BONUS;
  if (ELEMENT_COUNTERS[waveElement] === el) return 1 - COUNTERED_PENALTY;
  return 1;
}

/**
 * 這一波是什麼屬性。用雜湊算,同一排永遠一樣(重播與驗證才對得起來)。
 *
 * salt 給勇者波用:它跟一般波各走一條,所以「關卡前公開的那一串」不會洩漏勇者波抽到什麼。
 */
export function elementForRow(rowIndex: number, salt = 0): RunSkillId {
  let h = Math.imul(rowIndex + 1, 0x9e3779b1) ^ (0x85ebca6b + Math.imul(salt, 0x7feb352d));
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ELEMENTS[((h ^ (h >>> 16)) >>> 0) % ELEMENTS.length];
}

/** 哪些是主動技能。轉職解鎖的就是這一串的前 N 款(見 laneJobs 的 activeSkillsForStage)。 */
/**
 * 哪些是主動技能 = **每個元素的二階與三階**(共 12 款)。
 *
 * 「有倒數的就是主動,沒有的就是被動」這條規則因此變成:一階全部沒有倒數,
 * 二三階全部有。玩家掃一眼技能列就分得出來(verify 有一項在盯)。
 */
export const ACTIVE_SKILL_IDS: RunSkillId[] = (Object.keys(SKILL_TIERS) as RunSkillId[])
  .filter((id) => SKILL_TIERS[id].tier > 1);
export function isActiveSkill(id: RunSkillId): boolean {
  return ACTIVE_SKILL_IDS.includes(id);
}

export interface RunSkillSpec {
  id: RunSkillId;
  name: string;
  describe: (level: number) => string;
}

export interface RunSkillState {
  id: RunSkillId;
  level: number;
}

/** 場內技能的基本上限。技能書只往上開元素與主動,見 runSkillLevelCap。 */
export const MAX_RUN_SKILL_LEVEL = 5;

/**
 * 技能書等級(0 = 還沒有)。生存模式掉的就是這個,是這款的第三層養成。
 *
 * ## 它只准動「貪心看不到」的東西
 *
 * 敵人戰力是照「這一場的最佳路線」算的,而最佳路線(`bestRunSkillChoice`)是照
 * `attackMultiplier * heroMultiplier` 貪心挑——**只有鋒刃與增殖會動這兩個值**。
 * 元素與主動對這兩個數字的貢獻是 0,所以放大它們的幅度,理想路線一格都不會動。
 *
 * ## 三條試過但不成立的做法(不要再試一次)
 *
 * 1. **「選項變多」不行**:選項多了,貪心更容易抽到鋒刃/增殖,理想戰力跟著上升。
 * 2. **「保證選項裡有幾個元素/主動」也不行**:一次只有三個位置,保證兩個是元素等於
 *    **擠掉**鋒刃/增殖——實測 60 次選擇裡有 11 次讓貪心走到不同的組合。
 *    它不是多給玩家東西,是把戰力選項換成元素選項。
 * 3. **連「提高元素的等級上限」都不行**,而這條最不明顯:上限一開,已經滿級的元素
 *    **會繼續留在選項池裡**,把池子稀釋掉——同一顆 seed 抽出來的三個就不一樣了。
 *    「有沒有技能書」不該改變你看到哪三個選項。
 *
 * 共同的教訓:**只要動到「選項串」,玩家側的曲線就會偏離 createRun 假設的那一條**,
 * 而且方向還不固定(有時強有時弱)。所以技能書一律不碰選項,只碰效果的大小。
 *
 * 真要做「選項品質」,得做成**玩家自己決定的重抽**(花一次重抽換一個保證的元素):
 * 那是攤在檯面上的取捨,而不是暗中把選項換掉——留給之後做。
 */
export const MAX_SKILL_BOOK_LEVEL = 5;
/** 每一級技能書把元素與主動的效果放大幾成。 */
const BOOK_POWER_PER_LEVEL = 0.15;

/**
 * 圖鑑給的放大倍率:**技能 id → 倍率**。
 *
 * 從單一數字改成查表,是因為圖鑑改成「一個條目綁一個屬性」之後,八元素各自累積
 *(收滿雷的那幾件就是雷變強),而不再是「收集率一條線把八個一起拉」。
 * 查不到的 id 一律 1——鋒刃/增殖 永遠不在表裡,見下面。
 */
export type CollectionScales = Partial<Record<RunSkillId, number>>;

/**
 * 技能書 x 圖鑑把元素/主動的效果放大多少。**只乘在元素與主動上**——
 * 鋒刃/增殖 是唯二進理想路線的,碰了敵人就會跟著變強。
 */
export function bookPowerScale(id: RunSkillId, bookLevel = 0, collection: CollectionScales = {}): number {
  // 圖鑑照**元素**查,不照 id 查:圖鑑的 501 個條目綁的是六個元素,
  // 收滿火的那幾件本來就該一起放大 fire / fire2 / fire3。
  // 照 id 查的話二三階永遠查不到(表裡沒有那個 key),圖鑑對它們等於不存在——
  // 而那是「安靜地少了一半加成」,查起來完全看不出來。
  if (!isElement(id) && !isActiveSkill(id)) return 1;
  const book = 1 + BOOK_POWER_PER_LEVEL * Math.min(MAX_SKILL_BOOK_LEVEL, Math.max(0, Math.floor(bookLevel)));
  return book * Math.max(1, collection[elementOf(id)] ?? 1);
}

/**
 * 一場最多帶幾個技能。
 *
 * **格數必須少於技能總數**,不然「要不要拿新的」根本不是決策——反正全部都帶得下。
 * 鋒刃/增殖 移除之後只剩六元素,所以格數再從 6 降到 4:帶得下 4 款、有 6 款可挑,
 * 每一次「拿新的」都還是在放棄另一款。**留 6 格的話 6 款全部帶得下,取捨當場消失**
 *(這正是主動移除時把 10 降到 6 的同一個理由,少算一次就會重犯)。
 *
 * 核心決策因此仍然是**廣度 vs 深度**:每次都拿新的 = 4 個各 1 級,
 * 拿升級 = 例如 2 個各 2 級。一般小關 10 次選擇、長關 20 次,兩種走法都走得完。
 *
 * 而且元素之間有相剋(見 ELEMENT_COUNTERS),關卡前又公開整關的屬性順序——
 * 4 格逼玩家真的照那串順序去押注,6 格則是全帶了就不必看。
 */
export const MAX_RUN_SKILL_SLOTS = 4;
/** 一次給幾個選項。 */
export const RUN_SKILL_OFFERS = 3;

/**
 * 每級加多少。
 *
 * 幅度刻意比永久技能大一個量級(永久是每級 +5%,這裡是 +18%):場內技能每場重置,
 * 而且一場要選 5~10 次,幅度小的話玩家根本感覺不到自己在做選擇。
 */
const PER_LEVEL = {
  /** 鋒刃:每人攻擊力 */
  /** 增殖:隊伍人數的幾成 */
  // ---- 六元素(每一款的規則都不一樣,不是同一個東西換名字)----
  // 火沒有 fireKills 了:它現在**純粹是持續傷害**,不直接保證帶走幾隻(見 burnSpreadTargets)。
  /** 金・擴散:每一波額外清掉整波的幾成(後期、大波才有感) */
  metalRatio: 0.06,
  /** 雷・連鎖:額外清掉「你自己打倒的隻數」的幾成(你越強放大越多) */
  thunderRatio: 0.08,
  /** 冰・凍結:怪被凍住 = 撞上來的損失小,也就是兌換率 */
  iceTrade: 0.25,
  /** 木・再生:每一波把這一場**已經失去的人**補回來幾個(沒失去就沒得補) */
  woodRegen: 1,
  /** 土・遲滯:怪往你逼近的速度慢幾成(**演出**;實際的好處是下面那個固定值) */
  earthSlow: 0.12,
  /** 土・遲滯:怪衝得慢,每一波少損失幾個人(**固定值**,跟冰的乘數互補) */
  earthLossCut: 1,
  /** 金・擴散:命中時往旁邊各送一下的傷害佔一次命中的幾成(演出,見 metalSpreadTargets) */
  metalSpreadDamage: 0.5,
};

/**
 * 有冷卻的技能各自的基準冷卻(秒)與每級縮短多少。
 *
 * ## 為什麼現在可以綁秒了(這條推翻了 CLAUDE.md 原本的「冷卻要綁波不綁秒」)
 *
 * 舊結構是「一波 = 一排」,一排的時間 = 排距 / 跑速,而跑速隨關卡從 45 爬到 111——
 * 所以「每 10 秒一次」在第 1 關是每 4.5 排、第 40 關是每 11 排,**越後面技能越弱**。
 * 那是兩個時鐘沒對齊,不是設計決定的。
 *
 * 關卡結構改成「戰鬥段是時間不是排數」之後(見 laneRun 的 battleSecondsPerWave),
 * 這件事反過來了:一波的長度現在是**用秒回推距離**算出來的,所以它幾乎是常數——
 * 實測第 1 關 13.6 秒、第 40 關之後一路到第 3000 關都是 17.1 秒(1.26 倍差距,
 * 而且第 40 關就封頂了)。整個波週期更平:18.5 → 18.1 秒。
 * 綁秒現在反而比綁波穩定,而且**玩家看得到冷卻在走**——綁波的話畫面上只能寫
 *「還要 2 波」,那是一個玩家無法換算成時間的單位。
 *
 * `verify-lane-run.ts` 有一項在盯「一波的秒數在 3000 關之間的離散程度」,
 * 哪天結構又改回去,那一項會先紅。
 */
const COOLDOWN_SPEC: Partial<Record<RunSkillId, { base: number; perLevel: number; min: number }>> = (() => {
  const out: Partial<Record<RunSkillId, { base: number; perLevel: number; min: number }>> = {};
  for (const [id, { tier }] of Object.entries(SKILL_TIERS) as [RunSkillId, { tier: 1 | 2 | 3 }][]) {
    // **一階一款都不准有冷卻**:「有倒數的就是主動,沒有的就是被動」是玩家掃一眼
    // 就分得出來的規則,破一次例(土曾經是「每 N 秒擋一整波」)整條規則就沒人信了。
    if (tier === 1) continue;
    out[id] = tier === 2 ? { base: 15, perLevel: 1, min: 10 } : { base: 28, perLevel: 2, min: 18 };
  }
  return out;
})();

/** 這一款技能幾秒觸發一次。沒有冷卻的(被動)回傳 0。 */
export function skillCooldownSeconds(id: RunSkillId, level: number): number {
  const spec = COOLDOWN_SPEC[id];
  if (!spec) return 0;
  const l = Math.max(0, Math.min(MAX_RUN_SKILL_LEVEL, Math.floor(level)));
  if (l <= 0) return 0;
  return Math.max(spec.min, spec.base - spec.perLevel * l);
}

/** 這一款技能有沒有冷卻。沒有的就是純被動,技能列上不畫倒數。 */
export function hasCooldown(id: RunSkillId): boolean {
  return COOLDOWN_SPEC[id] !== undefined;
}

// ---- 三個「命中當下」的元素規則 ----
//
// 火/雷/冰改成**打中的那一刻就發生**,不再只是結算時多一個數字:
//   火・燃燒  命中後火焰燒到旁邊幾隻(那幾隻也跟著掉血)
//   雷・連鎖  每攻擊幾下觸發一次連鎖閃電,電到附近幾隻
//   冰・凍結  命中有機率把那一隻凍在原地(畫面上牠停住不再逼近)
//   交互      連鎖電到的目標**再各自吃一次**燃燒擴散與凍結判定
//
// **這三個函式只決定「演出長什麼樣」,不決定「總共多打倒幾隻」。**
// 能多打倒幾隻仍然是 burnKills / chainRatio / pierceRatio 那三個數字(完全沒動),
// 由 laneRun 的 extraKills 統一結算。分開的理由:擊殺數是難度,演出是體感,
// 混在一起的話「火燒得更漂亮」就會變成「難度悄悄降了」,而那不是設計決定的。

/**
 * 火・燃燒:一次命中把火**額外**燒到旁邊幾隻(不含被打中的那一隻,牠一定會燒)。
 *
 * 1 級是 0 —— **只有被打中的那一隻燒起來**,擴散是升級才長出來的東西。
 * 先前 1 級就直接燒到旁邊 1 隻,「升級」在畫面上只是多一隻在燒,分不出差別;
 * 從 0 開始的話第一次升級就是「火開始蔓延」,那是看得見的一步。
 *
 * 級數 1~5 → 0 / 1 / 1 / 2 / 2 隻。
 */
export function burnSpreadTargets(level: number): number {
  return level > 0 ? Math.floor(Math.min(MAX_RUN_SKILL_LEVEL, level) / 2) : 0;
}

/**
 * 金・擴散:一次命中往旁邊各送一下的目標數。
 *
 * 跟火的差別是**瞬間 vs 持續**:金是命中當下對旁邊各補一次傷害(半下,見 metalSpreadDamage),
 * 火是點燃之後慢慢啃。兩款都會讓旁邊掉血,但看起來完全不同,而且金對「快撞上來的那幾隻」
 * 立刻有效,火要等 3 秒。
 *
 * **它一樣不會多打倒任何一隻。** 畫面端的 isDown 只讓前 kills 隻倒下(見 useLaneRun),
 * 所以擴散傷害只會讓該倒的更早倒,擊殺數仍然只由 metalRatio 經 extraKills 決定。
 * 這一條是刻意的:CLAUDE.md 記過「火燒得更漂亮不該等於難度悄悄降了」。
 *
 * 級數 1~5 → 1 / 1 / 2 / 2 / 3 隻。
 */
export function metalSpreadTargets(level: number): number {
  return level > 0 ? 1 + Math.floor((Math.min(MAX_RUN_SKILL_LEVEL, level) - 1) / 2) : 0;
}

/**
 * 燃燒每秒燒掉目標**最大生命的幾成**。
 *
 * ## 為什麼是「每秒 5%」而不是「直接補一下」
 *
 * 第一版的燃燒擴散是 `hitsOn[j] += 1`——**等於白送一整下攻擊**。單獨看還好,
 * 配上雷就爆掉:連鎖閃電電到的每一隻會再各自觸發一次擴散(那是刻意設計的交互),
 * 所以一次命中可能瞬間送出十幾下,打得倒的那一批**同一瞬間全部消失**,
 * 畫面上看起來就是「一波怪憑空不見」——使用者說的「跟雷屬性搭配會無解」。
 *
 * 改成持續傷害之後,燃燒是**慢慢啃**:5%/秒表示光靠燒要 20 秒才燒得死一隻,
 * 而一整波的戰鬥段只有 13~17 秒。所以它永遠不會自己收掉一隻,只會把血條磨掉一截,
 * 跟雷疊起來也只是「燒到的目標變多」,不是「傷害翻十幾倍」。
 *
 * **注意這一直都不影響難度。** 能多打倒幾隻由 `burnKills`(每級每波 1 隻)經
 * laneRun 的 `extraKills` 決定,跟這裡的 DPS 一點關係都沒有——這裡調的是
 * 「血條掉得多快看起來像什麼」。兩組數字分開的理由見上面 burnSpreadTargets 那一段。
 */
export const BURN_DPS_RATIO = 0.05;
/**
 * 一次點燃燒多久。燒完就滅,除非又被燒到一次(重新計時)。
 *
 * 3 秒 x 5%/秒 = 一次點燃啃掉 15% 血量。太短會變成「看得到火但血條沒動」,
 * 太長則整波都在燒、火焰特效變成背景雜訊。
 */
export const BURN_DURATION_MS = 3000;
/** 雷・連鎖:每幾下攻擊觸發一次連鎖閃電(0 = 沒點)。 */
export function chainEveryHits(level: number): number {
  return level > 0 ? Math.max(3, 9 - Math.min(MAX_RUN_SKILL_LEVEL, level)) : 0;
}
/** 雷・連鎖:一次電到幾隻。 */
export function chainTargetCount(level: number): number {
  return level > 0 ? 1 + Math.floor((Math.min(MAX_RUN_SKILL_LEVEL, level) - 1) / 2) : 0;
}
/** 冰・凍結:一次命中把那一隻凍住的機率(吃相剋,所以剋中時凍得住的機會明顯變高)。 */
export function freezeChanceAt(level: number, matchup = 1): number {
  return level > 0 ? Math.min(0.6, 0.1 * Math.min(MAX_RUN_SKILL_LEVEL, level) * matchup) : 0;
}
/** 凍住多久(毫秒)。畫面與邏輯共用,不要各寫一份。 */
export const FREEZE_MS = 900;

/**
 * 土・遲滯:怪往你逼近的速度慢幾成。
 *
 * **上限 0.5**:超過一半就會變成「怪幾乎不動」,而牠的世界座標是固定的、往前跑的是玩家——
 * 慢到極限就是跟著玩家一起前進(那是冰的凍結),兩款元素會變成同一個東西的強弱版。
 * 土的識別度來自「整波一直慢下來」而不是「某幾隻完全停住」。
 */
export function earthSlowRatio(level: number): number {
  return level > 0 ? Math.min(0.5, PER_LEVEL.earthSlow * Math.min(MAX_RUN_SKILL_LEVEL, level)) : 0;
}

// ---- 二三階:主動技能 ----
//
// ## 為什麼「造成傷害」仍然不進理想路線
//
// 這是這個專案第四次用同一條規則,值得再寫一次:敵人戰力是照**這一場的最佳路線**算的,
// 而最佳路線假設玩家**每一波全清**。所以「多清掉 N 隻」對理想玩家的價值是 0 ——
// 他本來就把整波清光了,再給他清怪的能力,`extraKills` 也會被夾在整波隻數上。
// 真正吃到這幾款的是**漏了幾隻的你**:越落後越有用,抬地板不抬天花板。
//
// 也因此傷害一律給**固定隻數**,不給百分比:百分比會隨著理想戰力一起長,
// 等於偷偷變成一條跟敵人曲線平行的線;固定值對滾出 80 人的最佳玩家是零頭,
// 對剩 12 個人的你是活下來。
//
// ## 冷卻綁秒不綁波
//
// 沿用既有的規則(見 skillCooldownSeconds 上面的長註解):一波的秒數在 3000 關之間
// 差不到 1.6 倍,而綁秒玩家看得到倒數——綁波只寫得出「還要 2 波」,那不是時間單位。
//
// 二階 14→10 秒(一波 17 秒,所以一波放得出 1~2 次),三階 26→18 秒(兩波一次)。
// 三階冷卻比二階長,但單次的量大一個級距:二階是「常常有一小口」,三階是「等一下有一大口」。

/** 二階:每次清掉幾隻。等級提高的是量,不是頻率。 */
export function tier2Kills(level: number): number {
  return level > 0 ? 2 + Math.min(MAX_RUN_SKILL_LEVEL, level) : 0;
}
/** 三階:每次清掉幾隻。 */
export function tier3Kills(level: number): number {
  return level > 0 ? 5 + 2 * Math.min(MAX_RUN_SKILL_LEVEL, level) : 0;
}

/** 二三階各自的名字與一句話。用查表寫,因為 12 款的規則完全一樣、只有名字不同。 */
const ACTIVE_FLAVOUR: Record<string, { name: string; flavour: string }> = {
  fire2: { name: '火・爆炎', flavour: '腳邊炸開一圈火' },
  fire3: { name: '火・煉獄', flavour: '整條跑道燒起來' },
  metal2: { name: '金・碎片', flavour: '甩出一片金屬碎刃' },
  metal3: { name: '金・鋒暴', flavour: '碎刃繞著隊伍轉一圈' },
  thunder2: { name: '雷・落雷', flavour: '一道雷打在最前面那群' },
  thunder3: { name: '雷・雷暴', flavour: '連續落雷洗過整波' },
  ice2: { name: '冰・冰錐', flavour: '冰錐從地面刺出來' },
  ice3: { name: '冰・暴風雪', flavour: '暴風雪蓋住整條跑道' },
  wood2: { name: '木・荊棘', flavour: '荊棘從地面纏上來' },
  wood3: { name: '木・森羅', flavour: '巨木貫穿整條跑道' },
  earth2: { name: '土・落石', flavour: '前方砸下一批落石' },
  earth3: { name: '土・地裂', flavour: '地面裂開吞掉一整排' },
};

/** 12 款主動的規格,由 SKILL_TIERS 展開——名字以外的規則 12 款完全一樣,不要逐款手寫。 */
const ACTIVE_SPECS: RunSkillSpec[] = (Object.keys(ACTIVE_FLAVOUR) as RunSkillId[]).map((id) => {
  const tier = skillTier(id);
  const kills = tier === 2 ? tier2Kills : tier3Kills;
  const { name, flavour } = ACTIVE_FLAVOUR[id];
  return {
    id,
    name,
    describe: (l: number) =>
      `${flavour},每 ${skillCooldownSeconds(id, l)} 秒自動放一次,清掉 ${kills(l)} 隻`,
  };
});

export const RUN_SKILLS: RunSkillSpec[] = [
  // 六元素。說明一律寫「什麼時候有用」,不是只寫數字——玩家要在 2 秒內判斷該不該拿。
  {
    id: 'fire',
    name: '火・燃燒',
    describe: (l) => {
      const dps = `每秒 ${Math.round(BURN_DPS_RATIO * 100)}% 生命`;
      const spread = burnSpreadTargets(l);
      return spread > 0
        ? `命中的那隻燒起來,火再蔓延到旁邊 ${spread} 隻(${dps})`
        : `命中的那隻燒起來(${dps}),升級後火會蔓延`;
    },
  },
  {
    id: 'metal',
    name: '金・擴散',
    describe: (l) =>
      `命中時往旁邊 ${metalSpreadTargets(l)} 隻各擴散一次傷害,每波多清掉整波的 ${Math.round(PER_LEVEL.metalRatio * l * 100)}%`,
  },
  {
    id: 'thunder',
    name: '雷・連鎖',
    describe: (l) => `每攻擊 ${chainEveryHits(l)} 下觸發連鎖閃電(電 ${chainTargetCount(l)} 隻)`,
  },
  {
    id: 'ice',
    name: '冰・凍結',
    describe: (l) => `命中有 ${Math.round(freezeChanceAt(l) * 100)}% 機率凍住,兌換率 +${Math.round(PER_LEVEL.iceTrade * l * 100)}%`,
  },
  { id: 'wood', name: '木・再生', describe: (l) => `每波補回 ${PER_LEVEL.woodRegen * l} 個失去的同伴` },
  {
    id: 'earth',
    name: '土・遲滯',
    describe: (l) => `怪衝得慢 ${Math.round(earthSlowRatio(l) * 100)}%,每波少損失 ${PER_LEVEL.earthLossCut * l} 人`,
  },
];

/**
 * 爆裂/號令一次觸發的**整數**效果。
 *
 * 冷卻改成秒之後一波會觸發 1~2 次(舊制是 2~4 波才一次),所以每次的量要跟著縮小,
 * 一波下來的總量才跟改版前同一個量級(實測爆裂:舊 0.5~5 隻/波 → 新 0.9~7.5 隻/波)。
 * **至少 1**:算出 0 的話玩家會看到技能觸發了卻什麼都沒發生,直接認定它是壞的
 *(跟增殖「保證至少 +1 人」同一個理由)。
 */

RUN_SKILLS.push(...ACTIVE_SPECS);

export function runSkillSpec(id: RunSkillId): RunSkillSpec {
  const found = RUN_SKILLS.find((s) => s.id === id);
  if (!found) throw new Error(`unknown run skill: ${id}`);
  return found;
}

export function runSkillLevel(skills: RunSkillState[], id: RunSkillId): number {
  return skills.find((s) => s.id === id)?.level ?? 0;
}

/**
 * 這一場總共會給幾次選擇機會。
 *
 * 規則:每打完一波給 1 次,**最後一波之前再多給 1 次**。所以 5 波的小關是
 * 「1、2、3、4 波各一次 + 決戰前額外一次 = 5 次」,10 波則是 10 次。
 * 最後一波打完就結束了,不再給——那時候給也沒有東西可以用。
 */
export function runSkillPicksForWave(waveIndex: number, totalWaves: number): number {
  if (waveIndex >= totalWaves - 1) return 0; // 最後一波之後直接結算,不給
  return waveIndex === totalWaves - 2 ? 2 : 1; // 決戰前那一次給兩個
}

export function totalRunSkillPicks(totalWaves: number): number {
  let n = 0;
  for (let w = 0; w < totalWaves; w++) n += runSkillPicksForWave(w, totalWaves);
  return n;
}

/**
 * 這次可以挑什麼。已經滿級的不再出現;全部滿級就回傳空陣列(外層看到空的就跳過)。
 * 用傳進來的 rng,驗證腳本才能重現同一組選項。
 */
export function runSkillOffers(
  skills: RunSkillState[], rng: () => number = Math.random, activeCount = ACTIVE_SKILL_IDS.length,
): RunSkillState[] {
  // 帶滿 10 格之後只能升級手上的——不然「廣度 vs 深度」那個決策不存在(永遠可以再拿新的)。
  const full = skills.length >= MAX_RUN_SKILL_SLOTS;
  // 轉職給的是「**同時帶得動幾款主動**」,不是「解鎖清單的前 N 款」。
  //
  // 舊版是 `ACTIVE_SKILL_IDS.slice(0, activeCount)`,那在只有四款主動時還行;
  // 現在主動是六元素各兩款,切前 N 個等於**只解鎖火跟金**——
  // 「沒有萬用元素也沒有廢元素」當場失效,而那是六元素設計的地基。
  // 改成算持有數之後,轉職的獎勵仍然是實的(能同時掛幾款主動),而且對六元素完全中性。
  const activeCap = Math.max(1, Math.min(MAX_RUN_SKILL_SLOTS, activeCount));
  const activesHeld = skills.filter((s) => isActiveSkill(s.id)).length;
  const pool = RUN_SKILLS
    // 已經帶滿主動額度的話,只能升級手上那幾款,不能再拿新的主動。
    .filter((spec) => !isActiveSkill(spec.id) || activesHeld < activeCap
      || skills.some((s) => s.id === spec.id))
    // **要先有前一階**:二階要先有一階、三階要先有二階。這就是「依既有特性往上長」——
    // 沒有這條的話第一次選擇就可能開出三階,而三階的量級是為「已經投資過這個元素」設計的。
    .filter((spec) => {
      const prev = previousTier(spec.id);
      return prev === null || runSkillLevel(skills, prev) > 0;
    })
    .filter((spec) => !full || skills.some((s) => s.id === spec.id))
    .map((spec) => ({ id: spec.id, level: runSkillLevel(skills, spec.id) + 1 }))
    .filter((o) => o.level <= MAX_RUN_SKILL_LEVEL);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // **技能書刻意完全不出現在這裡。** 加量、換成元素、開等級上限,三種都會改變
  // 「同一顆 seed 抽出哪三個」,玩家側的曲線就會偏離 createRun 假設的那一條。
  return pool.slice(0, RUN_SKILL_OFFERS);
}

/**
 * 這一場的第 n 次選擇會開出哪三個。**由跑圖的 seed 決定,不是即時亂數。**
 *
 * 為什麼一定要可重現:敵人戰力是照「這一場的最佳路線」算的(laneRun 的 createRun),
 * 而最佳路線包含技能。四選三會漏掉一個,漏掉的剛好是「這次最該點的」時,
 * 玩家就走不到理想曲線上——用即時亂數的話 createRun 根本不知道漏了哪個,
 * 只能拿「假設永遠開得出最佳選項」的表去估,實測領先幅度會在 1.41x~2.70x 之間漂,
 * 結構保證(每一排都精確等於 1/ENEMY_POWER_RATIO)就沒了。
 * 綁 seed 之後 createRun 可以把同一組選項重播一次,理想路線才是真的「這一場」的上限。
 */
export function runSkillOffersAt(
  skills: RunSkillState[], seed: number, ordinal: number, activeCount?: number,
): RunSkillState[] {
  // 跟跑圖的閘門用不同的雜湊常數:共用一條的話,多開一次選單就會把後面所有閘門位移。
  let x = (Math.imul(seed ^ 0x5bf03635, 0x27d4eb2f) ^ Math.imul(ordinal + 1, 0x85ebca6b)) >>> 0;
  const rng = () => {
    x = (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return (x >>> 8) / 0x1000000;
  };
  return runSkillOffers(skills, rng, activeCount);
}

/**
 * 「最會加戰力」的那個選項。理想路線與驗證腳本都用這一個函式,不要各自寫一份——
 * 兩邊的貪心規則只要差一點,敵人就是照另一個玩家算的。
 *
 * 比的是「選下去之後整組的總戰力倍率」,不是單一技能自己的幅度:技能之間相加不相乘,
 * 所以鋒刃 +18% 在攻擊已經堆高時的邊際效益會低於增殖 +25%,反之亦然——
 * 貪心的實際行為是把兩邊拉平,只看單項幅度會挑錯。
 */
export function bestRunSkillChoice(skills: RunSkillState[], offers: RunSkillState[]): RunSkillState {
  let best = offers[0];
  let bestGain = -1;
  for (const o of offers) {
    const e = runSkillEffects(learnRunSkill(skills, o));
    const gain = e.attackMultiplier * e.heroMultiplier;
    if (gain > bestGain) { bestGain = gain; best = o; }
  }
  return best;
}

export function learnRunSkill(skills: RunSkillState[], choice: RunSkillState): RunSkillState[] {
  const existing = skills.find((s) => s.id === choice.id);
  if (existing) return skills.map((s) => (s.id === choice.id ? { ...s, level: choice.level } : s));
  return [...skills, choice];
}

export interface RunSkillEffects {
  /** 每人攻擊力乘這個 */
  attackMultiplier: number;
  /** 隊伍人數乘這個 */
  heroMultiplier: number;
  /** 兌換率乘這個(水・減速) */
  tradeMultiplier: number;
  /** 金・擴散:每波額外清掉整波的幾成 */
  pierceRatio: number;
  /** 雷・連鎖:額外清掉「自己打倒的隻數」的幾成 */
  chainRatio: number;
  /** 木・再生:每波補回幾個「這一場已經失去的人」 */
  regen: number;
  /** 土・遲滯:怪往你逼近的速度慢幾成(演出) */
  slow: number;
  /** 土・遲滯:每一波少損失幾個人(這才是它的實際好處) */
  lossCut: number;
  // ---- 以下這幾個只決定「命中的那一刻演出什麼」,不決定總共多打倒幾隻 ----
  // 擊殺數一律由 pierceRatio / chainRatio 決定(見 laneRun 的 extraKills)。
  // 分開的理由寫在上面 burnSpreadTargets 那一段:演出變好看不該等於難度悄悄降低。
  /** 火・燃燒:一次命中把火額外燒到旁邊幾隻(不含被打中的那一隻) */
  burnSpread: number;
  /** 金・擴散:一次命中往旁邊幾隻各送一下 */
  metalSpread: number;
  /** 金・擴散:擴散出去的那一下佔一次命中的幾成 */
  metalSpreadDamage: number;
  /** 冰・凍結:一次命中把目標凍住的機率(已含相剋) */
  freezeChance: number;
  /** 雷・連鎖:每幾下觸發一次連鎖閃電(0 = 沒點) */
  chainEvery: number;
  /** 雷・連鎖:一次電到幾隻 */
  chainTargets: number;
  /**
   * 目前帶著的主動技能,每一款各自的冷卻與效果。
   *
   * **主動技能一律是固定效果,不是百分比戰力。** 百分比會被敵人曲線完全吸收
   * (敵人照最佳路線算,而最佳路線包含技能),畫面很炫但難度一點沒動;固定效果對已經
   * 滾出 80 人的最佳玩家是零頭,對剩 12 個人的你是活下來——**越落後越有用**。
   * 也因為這樣它們**不進理想路線**(理想玩家全清,額外擊殺對他是浪費),
   * 不會讓敵人為了一個沒人用得到的東西變強(跟兌換率同一個道理)。
   */
  actives: ActiveTrigger[];
}

/** 一款主動技能觸發時做什麼。 */
export interface ActiveTrigger {
  id: RunSkillId;
  name: string;
  /** 幾**秒**觸發一次(見 skillCooldownSeconds) */
  cooldown: number;
  /** 直接清掉幾隻(固定值) */
  kills?: number;
  /** 清掉整波的幾成(比例值) */
  killRatio?: number;
  /** 直接補幾個勇者 */
  heroes?: number;
  /** 擋下這一波的全部損失 */
  immune?: boolean;
}

/**
 * 目前帶的場內技能加起來是什麼效果。
 * 技能之間**相加不相乘**,跟永久技能同一個理由:相加算得出上限,而且玩家看到的 +18% 就真的是 +18%。
 *
 * `waveElement` 是「這一波的屬性」,給的話每一個元素各自照 elementMatchup 放大或削弱
 * (剋中 x2.5、被剋 x2/3)。**只動元素**——鋒刃/增殖與主動技能不受相剋影響,
 * 不然帶對屬性就變成整體 x2.5,是另一種買到勝利。
 *
 * 不給 waveElement 的地方(理想路線、貪心比較、上限驗證)拿到的就是沒有相剋的基準值,
 * 這正是我們要的:敵人曲線不能跟著相剋跑,不然它就變成「大家都有的東西」而不是選擇。
 */
/**
 * @param bookLevel 技能書等級(生存模式掉的)
 * @param collection 裝備圖鑑給的放大倍率(技能 id → 倍率,查不到就是 1)。跟技能書同一條軸——
 *   兩者都只乘在元素與主動上,所以都不進理想路線(見 game/collection.ts 的說明)。
 */
export function runSkillEffects(
  skills: RunSkillState[], waveElement?: RunSkillId, bookLevel = 0, collection: CollectionScales = {},
): RunSkillEffects {
  let attack = 0;
  let heroes = 0;
  let trade = 0;
  let pierceRatio = 0;
  let chainRatio = 0;
  let regen = 0;
  let slow = 0;
  let lossCut = 0;
  let burnSpread = 0;
  let metalSpread = 0;
  let freezeChance = 0;
  let chainEvery = 0;
  let chainTargets = 0;
  const actives: ActiveTrigger[] = [];
  for (const s of skills) {
    const level = Math.min(MAX_RUN_SKILL_LEVEL, Math.max(0, s.level));
    // 八元素:每一款的規則都不一樣,而且全部只在「失誤了」才生效。
    // mx 是這一個元素對上這一波屬性的倍率(剋中放大、被剋削弱),逐元素各算各的。
    // 相剋(逐元素)乘上技能書的放大。兩者都只碰元素/主動,所以都不進理想路線。
    const mx = elementMatchup(s.id, waveElement) * bookPowerScale(s.id, bookLevel, collection);
    // 火:純持續傷害,**不再保證每波帶走幾隻**(舊的 fireKills 已移除)。
    // 擴散隻數不吃相剋——它是演出,剋中就直接燒滿整波的話,「火燒得漂亮」又會等於難度降低。
    if (s.id === 'fire') burnSpread += burnSpreadTargets(level);
    if (s.id === 'metal') { pierceRatio += PER_LEVEL.metalRatio * level * mx; metalSpread += metalSpreadTargets(level); }
    if (s.id === 'thunder') {
      chainRatio += PER_LEVEL.thunderRatio * level * mx;
      chainEvery = chainEveryHits(level);
      chainTargets += chainTargetCount(level);
    }
    if (s.id === 'ice') { trade += PER_LEVEL.iceTrade * level * mx; freezeChance += freezeChanceAt(level, mx); }
    if (s.id === 'wood') regen += PER_LEVEL.woodRegen * level * mx;
    // 二三階:主動。**清掉固定隻數**,而且吃相剋與技能書(mx 已經把兩者乘完)。
    // 為什麼吃相剋:押對屬性要在高階更有感,不然「關卡前公開屬性順序」到後段就沒有意義了。
    // 為什麼仍然不進理想路線:理想玩家每一波全清,多給他清怪的能力等於 0(見上面的長註解)。
    const tier = skillTier(s.id);
    if (tier > 1 && level > 0) {
      const kills = (tier === 2 ? tier2Kills(level) : tier3Kills(level)) * mx;
      actives.push({
        id: s.id,
        name: runSkillSpec(s.id).name,
        cooldown: skillCooldownSeconds(s.id, level),
        kills,
      });
    }
    // 土・遲滯:減速是演出(所以不吃相剋,免得剋中就直接把整波定住),
    // 少損失幾個人才是它的實際好處(所以那個吃相剋)。
    if (s.id === 'earth') { slow += earthSlowRatio(level); lossCut += PER_LEVEL.earthLossCut * level * mx; }
  }
  return {
    attackMultiplier: 1 + attack,
    heroMultiplier: 1 + heroes,
    tradeMultiplier: 1 + trade,
    pierceRatio,
    chainRatio,
    regen,
    slow: Math.min(0.5, slow),
    lossCut,
    burnSpread,
    metalSpread,
    metalSpreadDamage: PER_LEVEL.metalSpreadDamage,
    freezeChance: Math.min(0.6, freezeChance),
    chainEvery,
    chainTargets,
    actives,
  };
}

/** 選一個技能會動到的三個數字。 */
export interface RunSkillStats {
  perHero: number;
  heroes: number;
  tradeRate: number;
}

/**
 * 選中一個技能之後,數值變成多少。**玩家側、模擬器、createRun 的理想路線一律走這一支。**
 *
 * 為什麼要共用而不是各自乘一次:人數是整數,乘完要取整,而**取整的方向會改變結果**——
 * 理想路線用浮點、玩家用 Math.round 的話,2 人吃到 +25% 是 round(2.5)=3(等於 +50%),
 * 實測領先幅度會從 2.43x 漂到 2.80x,結構保證就只剩「大概」。
 *
 * 增殖保證**至少 +1 人**:1 隻的時候 round(1 x 1.25) = 1,選了完全沒反應——
 * 玩家看到「勇者數量 +25%」卻什麼都沒發生,會直接認定這個技能是壞的。
 * 前段超額是這款一直以來的形狀(閘門的「勇者 +N」在 1 人的時候也是直接翻倍),
 * 而且敵人照同一條路線算,超額不會變成免費的難度折扣。
 */
export function applyRunSkillPick(
  skills: RunSkillState[],
  choice: RunSkillState,
  stats: RunSkillStats,
): RunSkillStats {
  const before = runSkillEffects(skills);
  const after = runSkillEffects(learnRunSkill(skills, choice));
  const atk = after.attackMultiplier / before.attackMultiplier;
  const her = after.heroMultiplier / before.heroMultiplier;
  const trade = after.tradeMultiplier / before.tradeMultiplier;
  return {
    perHero: Math.max(1, Math.round(stats.perHero * atk)),
    heroes: her > 1
      ? Math.max(stats.heroes + 1, Math.round(stats.heroes * her))
      : Math.max(1, Math.round(stats.heroes * her)),
    tradeRate: Math.max(1, stats.tradeRate * trade),
  };
}

/**
 * 場內技能全部點滿時的總戰力倍率。給驗證腳本盯上限用。
 *
 * 鋒刃/增殖 移除之後**這個值恆等於 1**:剩下的六元素一款都不加戰力。
 * 函式留著不是為了好看——驗證要能證明「場內技能一點戰力都沒加」,
 * 而那正是「敵人曲線不會為了技能變強」的前提。哪天又有人加了會加戰力的技能,
 * 這個值會自己跳起來,verify 就會紅。
 */
export function maxRunSkillAttackMultiplier(): number {
  const maxed: RunSkillState[] = RUN_SKILLS.map((spec) => ({ id: spec.id, level: MAX_RUN_SKILL_LEVEL }));
  const e = runSkillEffects(maxed);
  return e.attackMultiplier * e.heroMultiplier;
}

export function describeRunSkill(choice: RunSkillState): string {
  return runSkillSpec(choice.id).describe(choice.level);
}
