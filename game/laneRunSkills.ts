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
  // 基礎被動:唯一兩款會加戰力的,也就是唯一兩款會被敵人曲線追平的(它們是「跟上」不是「變強」)
  | 'edge' | 'swarm'
  // 八元素:**全部只在你失誤的時候才生效**,所以完美玩家一個都用不到,
  // 也因此全部不進理想路線——敵人不會為了它們變強,幅度可以放心給(見下方 ELEMENTS)
  | 'fire' | 'metal' | 'thunder' | 'ice' | 'wood' | 'earth' | 'light' | 'dark'
  // 主動技能(有冷卻、有特效、造成固定效果)。冷卻一律以**波**為單位。
  | 'strike' | 'pierce' | 'rally' | 'aegis';

/**
 * 八元素。每一款的**規則**都不一樣(不是同一個東西換名字),而且互相剋制(見 ELEMENT_COUNTERS)。
 *
 * **八個都刻意只在你失誤時才生效**(漏接、被撞、快死),完美玩家全清不漏,一個都碰不到:
 * 這讓它們自動不進理想路線,敵人不會為了一個沒人用得到的東西變強——
 * 跟兌換率、主動技能同一個道理,也是這款所有「抬地板不抬天花板」機制的共同形狀。
 */
export const ELEMENTS: RunSkillId[] = ['fire', 'metal', 'thunder', 'ice', 'wood', 'earth', 'light', 'dark'];
export function isElement(id: RunSkillId): boolean {
  return ELEMENTS.includes(id);
}

/**
 * 相剋表:每個元素剋誰。**兩個閉環,所以每個元素剛好剋一個、也剛好被一個剋**——
 * 沒有「萬用元素」也沒有「廢元素」。
 *
 *   五行:金 → 木 → 土 → 冰 → 火 → 金
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
  metal: 'wood', wood: 'earth', earth: 'ice', ice: 'fire', fire: 'metal',
  light: 'dark', dark: 'thunder', thunder: 'light',
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
  if (!waveElement || !isElement(mine)) return 1;
  if (ELEMENT_COUNTERS[mine] === waveElement) return COUNTER_BONUS;
  if (ELEMENT_COUNTERS[waveElement] === mine) return 1 - COUNTERED_PENALTY;
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
export const ACTIVE_SKILL_IDS: RunSkillId[] = ['strike', 'pierce', 'rally', 'aegis'];
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
 * 技能書把元素/主動的效果放大多少。**只乘在元素與主動上**——
 * 鋒刃/增殖 是唯二進理想路線的,碰了敵人就會跟著變強。
 */
export function bookPowerScale(id: RunSkillId, bookLevel = 0, collectionScale = 1): number {
  // 鋒刃/增殖 一律 1:它們是唯二進理想路線的,碰了敵人就會跟著變強。
  if (!isElement(id) && !isActiveSkill(id)) return 1;
  const book = 1 + BOOK_POWER_PER_LEVEL * Math.min(MAX_SKILL_BOOK_LEVEL, Math.max(0, Math.floor(bookLevel)));
  return book * Math.max(1, collectionScale);
}

/**
 * 一場最多帶幾個技能。
 *
 * 10 格 x 一般小關 10 次選擇 = **剛好湊得滿**,而長關的 20 次讓玩家「湊滿再練深」。
 * 核心決策因此是**廣度 vs 深度**:每次都拿新的 = 10 個各 1 級,拿升級 = 例如 5 個各 2 級。
 */
export const MAX_RUN_SKILL_SLOTS = 10;
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
  edgeAttack: 0.18,
  /** 增殖:隊伍人數的幾成 */
  swarmHeroes: 0.25,
  // ---- 八元素(每一款的規則都不一樣,不是同一個東西換名字)----
  /** 火・燃燒:每一波額外燒掉固定幾隻(前期、小波最有感) */
  fireKills: 1,
  /** 金・穿透:每一波額外清掉整波的幾成(後期、大波才有感,跟火互補) */
  metalRatio: 0.06,
  /** 雷・連鎖:額外清掉「你自己打倒的隻數」的幾成(你越強放大越多) */
  thunderRatio: 0.08,
  /** 水・減速:怪衝得慢 = 撞上來的損失小,也就是兌換率 */
  iceTrade: 0.25,
  /** 木・再生:每一波把這一場**已經失去的人**補回來幾個(沒失去就沒得補) */
  woodRegen: 1,
  /** 土・護盾:每幾波擋下一整波的損失(冷卻以波計) */
  earthCooldown: 6,
  /** 光・復活:人數歸零時保住幾個人。一場只有一次。 */
  lightRevive: 3,
  /** 暗・吸取:漏過來的怪有幾成反而加入你(只有漏接時才有東西可吸) */
  darkLeech: 0.2,
  /** 爆裂(主動):每次觸發直接清掉幾隻(固定值,前期最有感) */
  strikeKills: 2,
  /** 貫穿(主動):清掉整波的幾成(比例值,後期大波才有感——跟爆裂互補) */
  pierceRatio: 0.12,
  /** 號令(主動):直接補幾個勇者 */
  rallyHeroes: 1,
};

/**
 * 主動技能的冷卻,單位是**波**不是秒。
 *
 * 綁秒會壞:跑速隨關卡從 45 爬到 111,「每 10 秒一次」在第 1 關是每 4.5 排、
 * 第 40 關是每 11 排——**越後面的關卡技能越弱**,而那不是設計決定的,
 * 純粹是兩個時鐘沒對齊(CLAUDE.md 的「兩條各走各的曲線」在新系統上的翻版)。
 */
export function strikeCooldownWaves(level: number): number {
  return Math.max(1, 4 - Math.floor(Math.max(0, level) / 2));
}

export const RUN_SKILLS: RunSkillSpec[] = [
  { id: 'edge', name: '鋒刃', describe: (l) => `每人攻擊力 +${Math.round(PER_LEVEL.edgeAttack * l * 100)}%` },
  { id: 'swarm', name: '增殖', describe: (l) => `勇者數量 +${Math.round(PER_LEVEL.swarmHeroes * l * 100)}%` },
  // 八元素。說明一律寫「什麼時候有用」,不是只寫數字——玩家要在 2 秒內判斷該不該拿。
  { id: 'fire', name: '火・燃燒', describe: (l) => `每波多燒掉 ${PER_LEVEL.fireKills * l} 隻` },
  { id: 'metal', name: '金・穿透', describe: (l) => `每波多清掉整波的 ${Math.round(PER_LEVEL.metalRatio * l * 100)}%` },
  { id: 'thunder', name: '雷・連鎖', describe: (l) => `你打倒的每 ${Math.round(1 / (PER_LEVEL.thunderRatio * l))} 隻多帶走 1 隻` },
  { id: 'ice', name: '冰・凍結', describe: (l) => `怪衝得慢,兌換率 +${Math.round(PER_LEVEL.iceTrade * l * 100)}%` },
  { id: 'wood', name: '木・再生', describe: (l) => `每波補回 ${PER_LEVEL.woodRegen * l} 個失去的勇者` },
  { id: 'earth', name: '土・護盾', describe: (l) => `每 ${Math.max(2, PER_LEVEL.earthCooldown - l)} 波擋下一整波損失` },
  { id: 'light', name: '光・復活', describe: (l) => `倒下時保住 ${PER_LEVEL.lightRevive * l} 人(一場一次)` },
  { id: 'dark', name: '暗・吸取', describe: (l) => `漏過來的怪有 ${Math.round(PER_LEVEL.darkLeech * l * 100)}% 加入你` },
  {
    id: 'strike',
    name: '爆裂',
    describe: (l) => `每 ${strikeCooldownWaves(l)} 波清掉 ${PER_LEVEL.strikeKills * l} 隻`,
  },
  {
    id: 'pierce',
    name: '貫穿',
    describe: (l) => `每 ${strikeCooldownWaves(l)} 波清掉整波的 ${Math.round(PER_LEVEL.pierceRatio * l * 100)}%`,
  },
  {
    id: 'rally',
    name: '號令',
    describe: (l) => `每 ${strikeCooldownWaves(l)} 波補 ${PER_LEVEL.rallyHeroes * l} 個勇者`,
  },
  {
    id: 'aegis',
    name: '壁障',
    describe: (l) => `每 ${strikeCooldownWaves(l) + 2} 波擋下一整波的損失`,
  },
];

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
  // 還沒解鎖的主動技能不會出現。activeCount 由 laneRun 的 activeSkillCountForStage 給——
  // **轉職給的就是這個數字**(學生 1 款 → 5轉 全開),不是給倍率。
  const unlocked = new Set(ACTIVE_SKILL_IDS.slice(0, Math.max(1, activeCount)));
  const pool = RUN_SKILLS
    .filter((spec) => !isActiveSkill(spec.id) || unlocked.has(spec.id))
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
  /** 火・燃燒:每波額外燒掉幾隻 */
  burnKills: number;
  /** 金・穿透:每波額外清掉整波的幾成 */
  pierceRatio: number;
  /** 雷・連鎖:額外清掉「自己打倒的隻數」的幾成 */
  chainRatio: number;
  /** 木・再生:每波補回幾個「這一場已經失去的人」 */
  regen: number;
  /** 土・護盾:幾波擋一次(Infinity = 沒點) */
  shieldCooldown: number;
  /** 光・復活:倒下時保住幾個人(一場一次;0 = 沒點) */
  revive: number;
  /** 暗・吸取:漏過來的怪有幾成加入你 */
  leech: number;
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
  /** 幾波觸發一次 */
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
 * @param collectionScale 裝備圖鑑給的放大倍率(1 = 沒有)。跟技能書同一條軸——
 *   兩者都只乘在元素與主動上,所以都不進理想路線(見 game/collection.ts 的說明)。
 */
export function runSkillEffects(
  skills: RunSkillState[], waveElement?: RunSkillId, bookLevel = 0, collectionScale = 1,
): RunSkillEffects {
  let attack = 0;
  let heroes = 0;
  let trade = 0;
  let burnKills = 0;
  let pierceRatio = 0;
  let chainRatio = 0;
  let regen = 0;
  let shieldLevel = 0;
  let shieldShift = 0;
  let revive = 0;
  let leech = 0;
  const actives: ActiveTrigger[] = [];
  for (const s of skills) {
    const level = Math.min(MAX_RUN_SKILL_LEVEL, Math.max(0, s.level));
    if (s.id === 'edge') attack += PER_LEVEL.edgeAttack * level;
    if (s.id === 'swarm') heroes += PER_LEVEL.swarmHeroes * level;
    // 八元素:每一款的規則都不一樣,而且全部只在「失誤了」才生效。
    // mx 是這一個元素對上這一波屬性的倍率(剋中放大、被剋削弱),逐元素各算各的。
    // 相剋(逐元素)乘上技能書的放大。兩者都只碰元素/主動,所以都不進理想路線。
    const mx = elementMatchup(s.id, waveElement) * bookPowerScale(s.id, bookLevel, collectionScale);
    if (s.id === 'fire') burnKills += PER_LEVEL.fireKills * level * mx;
    if (s.id === 'metal') pierceRatio += PER_LEVEL.metalRatio * level * mx;
    if (s.id === 'thunder') chainRatio += PER_LEVEL.thunderRatio * level * mx;
    if (s.id === 'ice') trade += PER_LEVEL.iceTrade * level * mx;
    if (s.id === 'wood') regen += PER_LEVEL.woodRegen * level * mx;
    // 土是冷卻不是數值:剋中少等一波,被剋多等一波。
    if (s.id === 'earth') shieldLevel = Math.max(shieldLevel, level);
    if (s.id === 'earth') shieldShift = mx > 1 ? -1 : mx < 1 ? 1 : 0;
    if (s.id === 'light') revive += PER_LEVEL.lightRevive * level * mx;
    if (s.id === 'dark') leech += PER_LEVEL.darkLeech * level * mx;
    if (level <= 0) continue;
    // 主動技能吃技能書的放大,但**不吃相剋**(相剋只放大元素,見 elementMatchup)。
    const bk = bookPowerScale(s.id, bookLevel, collectionScale);
    if (s.id === 'strike') {
      actives.push({ id: s.id, name: '爆裂', cooldown: strikeCooldownWaves(level), kills: PER_LEVEL.strikeKills * level * bk });
    }
    if (s.id === 'pierce') {
      actives.push({ id: s.id, name: '貫穿', cooldown: strikeCooldownWaves(level), killRatio: PER_LEVEL.pierceRatio * level * bk });
    }
    if (s.id === 'rally') {
      actives.push({ id: s.id, name: '號令', cooldown: strikeCooldownWaves(level), heroes: PER_LEVEL.rallyHeroes * level * bk });
    }
    if (s.id === 'aegis') {
      actives.push({ id: s.id, name: '壁障', cooldown: strikeCooldownWaves(level) + 2, immune: true });
    }
  }
  return {
    attackMultiplier: 1 + attack,
    heroMultiplier: 1 + heroes,
    tradeMultiplier: 1 + trade,
    burnKills,
    pierceRatio,
    chainRatio,
    regen,
    shieldCooldown: shieldLevel > 0
      ? Math.max(1, Math.max(2, PER_LEVEL.earthCooldown - shieldLevel) + shieldShift)
      : Infinity,
    revive,
    leech,
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

/** 場內技能全部點滿時的總戰力倍率。給驗證腳本盯上限用。 */
export function maxRunSkillAttackMultiplier(): number {
  const maxed: RunSkillState[] = [
    { id: 'edge', level: MAX_RUN_SKILL_LEVEL },
    { id: 'swarm', level: MAX_RUN_SKILL_LEVEL },
  ];
  const e = runSkillEffects(maxed);
  return e.attackMultiplier * e.heroMultiplier;
}

export function describeRunSkill(choice: RunSkillState): string {
  return runSkillSpec(choice.id).describe(choice.level);
}
