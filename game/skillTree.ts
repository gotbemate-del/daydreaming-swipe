import { Archetype, JobTier } from './combat';
import { currentMaterialTier, MaterialTier } from './materials';

// 每個職業 7 個技能欄位:3 被動(永久數值加成)+ 4 主動(各自獨立冷卻,同時運作)。
// passive3 是吸血(lifesteal)+回血(hpRegen)雙效合一的通用被動,見 getPassiveEffectKind 的
// 'lifeMastery' 分類與 game/heroHealth.ts 的實際套用點。
export type SkillSlotId = 'passive1' | 'passive2' | 'passive3' | 'active1' | 'active2' | 'active3' | 'active4';
export type ActiveSkillSlotId = 'active1' | 'active2' | 'active3' | 'active4';

export const PASSIVE_SLOT_IDS: SkillSlotId[] = ['passive1', 'passive2', 'passive3'];
export const ACTIVE_SLOT_IDS: ActiveSkillSlotId[] = ['active1', 'active2', 'active3', 'active4'];
export const SKILL_SLOT_IDS: SkillSlotId[] = [...PASSIVE_SLOT_IDS, ...ACTIVE_SLOT_IDS];

export function isPassiveSlot(slot: SkillSlotId): boolean {
  return PASSIVE_SLOT_IDS.includes(slot);
}

// 每個職業階級(1~5)各自獨立一組0-10級的技能等級,不會因為升階就作廢或鎖住——玩家可以
// 在晉升到2階之後,依然回頭把1階那組繼續點滿(用1階自己的書),呼應「每階職業技能分開
// 計算」的需求。戰鬥中的實際效果不是只看「目前這階」的數字,而是累加所有已投資階級
// (見 effectiveSkillLevel),晉升不會讓之前的投資變得毫無意義。
export type SkillTreeLevels = Record<Archetype, Record<JobTier, Record<SkillSlotId, number>>>;

function createEmptySkillSlots(): Record<SkillSlotId, number> {
  return { passive1: 0, passive2: 0, passive3: 0, active1: 0, active2: 0, active3: 0, active4: 0 };
}

function createEmptySkillTiers(): Record<JobTier, Record<SkillSlotId, number>> {
  return { 1: createEmptySkillSlots(), 2: createEmptySkillSlots(), 3: createEmptySkillSlots(), 4: createEmptySkillSlots(), 5: createEmptySkillSlots() };
}

export function createInitialSkillTreeLevels(): SkillTreeLevels {
  return {
    physicalMelee: createEmptySkillTiers(),
    physicalRanged: createEmptySkillTiers(),
    physicalSupport: createEmptySkillTiers(),
    magicMelee: createEmptySkillTiers(),
    magicRanged: createEmptySkillTiers(),
    magicSupport: createEmptySkillTiers(),
  };
}

// 戰鬥中主動技能的觸發間隔/削減比例、被動加成的實際效果,吃的是「累加全部已投資階級」的
// 總和(1階練滿10級+2階練滿10級=有效20級)——目前只有「副職(雙職兼修)」還在用這個函式
// (見 game/skillTree.ts 的 secondaryActiveSkillTriggerIntervalSeconds 呼叫端),主職技能欄
// 已經改用下面的 resolveSkillLevel(每階/學生各自獨立、不疊加,見該函式說明)。
export function effectiveSkillLevel(
  archetypeLevels: Record<JobTier, Record<SkillSlotId, number>>,
  currentTier: JobTier,
  slot: SkillSlotId
): number {
  let total = 0;
  for (let t = 1; t <= currentTier; t++) {
    total += archetypeLevels[t as JobTier][slot];
  }
  return total;
}

// 技能欄選擇機制(3被動+4主動,共7格):每一階(1~5)、每個職業的每一格技能,都是完全獨立的
// 技能——不會像舊制那樣把各階等級加總成一個數字。source='student' 代表學生技能樹(見
// game/studentSkillTree.ts),那套沒有分階存檔,tier 欄位對學生技能沒有意義、固定填1。
// null=這個欄位空著,行為等同 Lv.0(不參與倒數、不能點擊)。
export type SkillSource = Archetype | 'student';
export type PassiveSlotId = 'passive1' | 'passive2' | 'passive3';

export interface ActiveSkillRef {
  source: SkillSource;
  tier: number;
  sourceSlot: ActiveSkillSlotId;
}
export interface PassiveSkillRef {
  source: SkillSource;
  tier: number;
  sourceSlot: PassiveSlotId;
}
export type ActiveSkillLoadout = Record<ActiveSkillSlotId, ActiveSkillRef | null>;
export type PassiveSkillLoadout = Record<PassiveSlotId, PassiveSkillRef | null>;

// 依 ref 直接讀「那一階/那個來源自己」的原始等級,不加總——ref 是 null 或指到 Lv.0 的格子都
// 回傳0(呼應「空格=不參與倒數」的既有防呆)。studentSkillTree 是單一扁平7格(沒有分階),
// 不看 ref.tier。放在這裡(不是 game/studentSkillTree.ts)是為了讓 game/skillTree.ts 保持
// 自成一體、不用反過來 import 學生那份檔案造成循環依賴。
export function resolveSkillLevel(
  ref: { source: SkillSource; tier: number; sourceSlot: SkillSlotId } | null,
  skillTree: SkillTreeLevels,
  studentSkillTree: Record<SkillSlotId, number>
): number {
  if (!ref) return 0;
  if (ref.source === 'student') return studentSkillTree[ref.sourceSlot];
  return skillTree[ref.source][ref.tier as JobTier][ref.sourceSlot];
}

// 預設配置=目前身份指定階級自己的7格技能(這個機制上線前的固定行為，只是現在要多指定
// tier)。玩家不特地去改配置的話畫面上看到的東西不會有任何變化。tier 預設1是為了相容
// lib/storage.ts 一大票「舊存檔沒有這個欄位,補一份預設值」的歷史遷移呼叫,那些呼叫端
// 沒有(也不需要)額外的 tier 資訊。參數型別是 SkillSource(不是單純 Archetype)——全新存檔
// (畢業前)要能傳入 'student' 當預設身份,不然預設值填的是職業佔位技能,會被
// enforceLoadoutIdentityCap(身份='student')判定成「借用別的來源」而誤清空(見
// lib/storage.ts 的 createInitialSaveData)。
export function createInitialActiveSkillLoadout(identity: SkillSource, tier: JobTier = 1): ActiveSkillLoadout {
  const loadout = {} as ActiveSkillLoadout;
  ACTIVE_SLOT_IDS.forEach((slot) => {
    loadout[slot] = { source: identity, tier, sourceSlot: slot };
  });
  return loadout;
}

export function createInitialPassiveSkillLoadout(identity: SkillSource, tier: JobTier = 1): PassiveSkillLoadout {
  const loadout = {} as PassiveSkillLoadout;
  (PASSIVE_SLOT_IDS as PassiveSlotId[]).forEach((slot) => {
    loadout[slot] = { source: identity, tier, sourceSlot: slot };
  });
  return loadout;
}

// 職業認同上限:4格主動自選欄位最多只能有2格塞「不是目前職業」的技能(別的職業任一階,或
// 學生技能)——完全自由配置會讓技能欄跟目前職業脫鉤,稀釋掉「你現在是什麼職業」的認同感。
// 注意:選自己職業的其他階(例如目前5階,選自己1階的版本)不算借用,只看 source 是不是
// 目前職業,不看 tier。空格(null)不算借用,不佔用這個上限。3個被動欄位比照辦理,但因為
// 格數更少,上限壓在1格(至少2/3是目前職業自己的技能)。
export const MAX_BORROWED_ACTIVE_SLOTS = 2;
export const MAX_BORROWED_PASSIVE_SLOTS = 1;

// identity 是目前的「身份」——已畢業則是 job.archetype,還是學生則是 'student'(見呼叫端
// hasChosenJob 判斷)。用 SkillSource(而不是單純 Archetype)當型別,才能讓 'student' 也算一種
// 合法的「目前身份」,不會被誤判成「借用別的來源」。
export function countBorrowedActiveSlots(loadout: ActiveSkillLoadout, identity: SkillSource): number {
  return ACTIVE_SLOT_IDS.filter((slot) => {
    const ref = loadout[slot];
    return ref !== null && ref.source !== identity;
  }).length;
}

export function countBorrowedPassiveSlots(loadout: PassiveSkillLoadout, identity: SkillSource): number {
  return (PASSIVE_SLOT_IDS as PassiveSlotId[]).filter((slot) => {
    const ref = loadout[slot];
    return ref !== null && ref.source !== identity;
  }).length;
}

// setActiveSkillLoadout/setPassiveSkillLoadout action 呼叫這兩個先檢查合不合法——清空或放
// 自己身份(畢業前是學生技能、畢業後是目前職業)的技能永遠合法,放別的來源才要看目前已經
// 借了幾格。
export function canSetLoadoutSlot(
  loadout: ActiveSkillLoadout,
  identity: SkillSource,
  position: ActiveSkillSlotId,
  ref: ActiveSkillRef | null
): boolean {
  if (ref === null || ref.source === identity) return true;
  const currentRef = loadout[position];
  const alreadyBorrowedHere = currentRef !== null && currentRef.source !== identity;
  const borrowedCount = countBorrowedActiveSlots(loadout, identity);
  return (alreadyBorrowedHere ? borrowedCount : borrowedCount + 1) <= MAX_BORROWED_ACTIVE_SLOTS;
}

export function canSetPassiveLoadoutSlot(
  loadout: PassiveSkillLoadout,
  identity: SkillSource,
  position: PassiveSlotId,
  ref: PassiveSkillRef | null
): boolean {
  if (ref === null || ref.source === identity) return true;
  const currentRef = loadout[position];
  const alreadyBorrowedHere = currentRef !== null && currentRef.source !== identity;
  const borrowedCount = countBorrowedPassiveSlots(loadout, identity);
  return (alreadyBorrowedHere ? borrowedCount : borrowedCount + 1) <= MAX_BORROWED_PASSIVE_SLOTS;
}

// 轉職後身份基準跟著換了,原本合法的配置可能瞬間超標——從後面的欄位往前依序清空超標的
// 借用格,直到符合上限,避免轉職後直接卡在一個「不合法」的狀態,但不會動到玩家其他仍合法
// 的自選配置(呼應「轉職後仍可保留其他階/學生技能」的需求,只清超標的部分)。load() 讀舊
// 存檔、setJob 換職業時都要跑一次,兩邊都可能讓既有配置瞬間超標。
export function enforceLoadoutIdentityCap(loadout: ActiveSkillLoadout, identity: SkillSource): ActiveSkillLoadout {
  const next = { ...loadout };
  let borrowedCount = countBorrowedActiveSlots(next, identity);
  for (let i = ACTIVE_SLOT_IDS.length - 1; i >= 0 && borrowedCount > MAX_BORROWED_ACTIVE_SLOTS; i--) {
    const slot = ACTIVE_SLOT_IDS[i];
    const ref = next[slot];
    if (ref !== null && ref.source !== identity) {
      next[slot] = null;
      borrowedCount--;
    }
  }
  return next;
}

export function enforcePassiveLoadoutIdentityCap(loadout: PassiveSkillLoadout, identity: SkillSource): PassiveSkillLoadout {
  const slots = PASSIVE_SLOT_IDS as PassiveSlotId[];
  const next = { ...loadout };
  let borrowedCount = countBorrowedPassiveSlots(next, identity);
  for (let i = slots.length - 1; i >= 0 && borrowedCount > MAX_BORROWED_PASSIVE_SLOTS; i--) {
    const slot = slots[i];
    const ref = next[slot];
    if (ref !== null && ref.source !== identity) {
      next[slot] = null;
      borrowedCount--;
    }
  }
  return next;
}

// 同一顆技能(同一個 source+tier+sourceSlot)不能同時裝進兩個以上的欄位——精確比對三個
// 欄位,「自己職業目前這一階的 active1」跟「自己職業目前這一階的 active2」雖然都是同一個
// archetype+tier,但 sourceSlot 不同,不算重複;真正重複的是同一格技能被放進兩個不同的
// 裝備位置。
function isSameSkillRef(
  a: { source: SkillSource; tier: number; sourceSlot: SkillSlotId },
  b: { source: SkillSource; tier: number; sourceSlot: SkillSlotId }
): boolean {
  return a.source === b.source && a.tier === b.tier && a.sourceSlot === b.sourceSlot;
}

// setActiveSkillLoadout/setPassiveSkillLoadout action 呼叫這個判斷「這顆技能是不是已經裝在
// 別的欄位」,position 是正要設定的那一格,不跟自己比較。UI(SkillLoadoutEditor.tsx)也呼叫
// 這個把選單裡「已經裝備在別格」的選項鎖住,不用等玩家點了才被 store 擋下來、只留一句 toast。
export function isActiveRefEquippedElsewhere(loadout: ActiveSkillLoadout, position: ActiveSkillSlotId, ref: ActiveSkillRef): boolean {
  return ACTIVE_SLOT_IDS.some((slot) => {
    if (slot === position) return false;
    const other = loadout[slot];
    return other !== null && isSameSkillRef(other, ref);
  });
}

export function isPassiveRefEquippedElsewhere(loadout: PassiveSkillLoadout, position: PassiveSlotId, ref: PassiveSkillRef): boolean {
  return (PASSIVE_SLOT_IDS as PassiveSlotId[]).some((slot) => {
    if (slot === position) return false;
    const other = loadout[slot];
    return other !== null && isSameSkillRef(other, ref);
  });
}

// 讀舊存檔用的保險絲:萬一玩家在這條規則上線前就已經把同一顆技能塞進兩格(理論上不會發生,
// 但求穩），從後面的欄位往前依序清掉重複的那一份,只保留先出現(較前面)的那一格——跟
// enforceLoadoutIdentityCap「從後往前清超標」的既有慣例一致。
export function dedupeActiveLoadout(loadout: ActiveSkillLoadout): ActiveSkillLoadout {
  const next = { ...loadout };
  const seen: ActiveSkillRef[] = [];
  ACTIVE_SLOT_IDS.forEach((slot) => {
    const ref = next[slot];
    if (ref === null) return;
    if (seen.some((seenRef) => isSameSkillRef(seenRef, ref))) {
      next[slot] = null;
    } else {
      seen.push(ref);
    }
  });
  return next;
}

export function dedupePassiveLoadout(loadout: PassiveSkillLoadout): PassiveSkillLoadout {
  const slots = PASSIVE_SLOT_IDS as PassiveSlotId[];
  const next = { ...loadout };
  const seen: PassiveSkillRef[] = [];
  slots.forEach((slot) => {
    const ref = next[slot];
    if (ref === null) return;
    if (seen.some((seenRef) => isSameSkillRef(seenRef, ref))) {
      next[slot] = null;
    } else {
      seen.push(ref);
    }
  });
  return next;
}

// 每一階自己的技能等級上限都是10級(見 SkillTreeLevels 的分階說明),5個階級各自一條
// 獨立的0-10軌道——這裡回傳的是「單一階級自己」的封頂值,不是累加後的有效等級(那個見
// effectiveSkillLevel/MAX_EFFECTIVE_SKILL_LEVEL)。tier 參數保留是因為每一階都封頂在
// 同一個10級,目前用不上實際差異化,但介面上仍標明「這是哪一階的封頂」。
export const SKILL_LEVEL_CAP = 10;

export function skillSlotLevelCap(tier: JobTier): number {
  return SKILL_LEVEL_CAP;
}

// 升級花費純粹吃技能書:倍率從2^level(0→1級要1本...9→10級要512本,單一格封頂1023本)
// 調降到1.6^level(0→1級要1本...9→10級要69本,單一格封頂185本)——原本的倍率換算下來,
// 配合4%掉落率,單一職業全滿級要打將近18萬隻怪,遠超這款放置遊戲預期的養成節奏(呼應
// 「技能書取得量」被吐槽的回饋)。改成1.6倍率仍然是指數成長、後期依然要在6格之間做真實
// 取捨,只是不再是天文數字。
export function skillSlotUpgradeBookCost(level: number): number {
  return Math.ceil(Math.pow(1.6, level));
}

export function canUpgradeSkillSlot(level: number, tier: JobTier, skillBooks: number): boolean {
  return level < skillSlotLevelCap(tier) && skillBooks >= skillSlotUpgradeBookCost(level);
}

export function upgradeSkillSlot(level: number, tier: JobTier): number {
  return Math.min(skillSlotLevelCap(tier), level + 1);
}

// 技能書掉落:原本比照 game/equipment.ts 的強化石/寶石掉落訂在4%,但技能書的花費曲線比
// 強化石陡很多(見 skillSlotUpgradeBookCost 的指數成長),同樣4%換算下來後期進度慢到失衡,
// 拉到8%單獨補償;後續玩家回饋覺得取得量還是太慢,再拉到15%(強化石/寶石同步從4%拉到8%,
// 見 game/equipment.ts 的 ENHANCE_STONE_DROP_CHANCE)。
// export 出去給 game/offlineProgress.ts 算離線期間的期望值掉落用,單一真相來源。
export const SKILL_BOOK_DROP_CHANCE = 0.15;

export function rollSkillBookDrop(rng: () => number = Math.random): boolean {
  return rng() < SKILL_BOOK_DROP_CHANCE;
}

// 技能書掉落階級:依職業階級分配(currentMaterialTier,學生期固定初階),不再一律掉初階——
// 高階玩家掉高階書,不用再刷一堆用不到的初階書慢慢合成。例外:目前這個職業階級「自己那組」
// 7個技能格(3被動+4主動)全部都已經封頂(SKILL_LEVEL_CAP,見 skillSlotLevelCap 的說明),
// 代表這一階再怎麼升也沒有格子能投資了(其他階級的投資可以之後再繼續點,不影響這裡的判斷),
// 改掉下一階的書,提前儲備升階後需要的材料,而不是繼續掉一堆現在已經用不到的目前階書。
// archetypeSkillLevels 傳的是「目前職業階級自己那組」的7格數字(skillTree[archetype][jobTier]),
// 不是累加後的有效等級。
export function skillBookDropTier(
  hasChosenJob: boolean,
  jobTier: JobTier,
  archetypeSkillLevels: Record<SkillSlotId, number>
): MaterialTier {
  const baseTier = currentMaterialTier(hasChosenJob, jobTier);
  const allMaxed = SKILL_SLOT_IDS.every((slot) => archetypeSkillLevels[slot] >= SKILL_LEVEL_CAP);
  if (!allMaxed) return baseTier;
  return Math.min(baseTier + 1, 5) as MaterialTier;
}

// 主動技能觸發間隔:秒數倒數,固定不受戰鬥/關卡時長影響。4 個主動欄位各自有自己的基準秒數
// (前3招一般技能 6/7/8 秒,第4招特別技能 15 秒),隨等級線性降到觸底,下限是基準值的
// 2/3——6→4秒、7→4.67秒、8→5.33秒、15→10秒。levelCap 決定「level 到多少算練滿」:副職
// (雙職兼修)還在用舊制的累加值+MAX_EFFECTIVE_SKILL_LEVEL(不傳這個參數就是這個預設值);
// 主職技能欄自選改用「單一來源自己」的封頂值(職業任一階=SKILL_LEVEL_CAP,學生=
// STUDENT_SKILL_LEVEL_CAP),呼叫端(hooks/useGameState.ts)自己決定要傳哪個。
const ACTIVE_SLOT_BASE_INTERVAL_SECONDS: Record<ActiveSkillSlotId, number> = {
  active1: 6,
  active2: 7,
  active3: 8,
  active4: 15,
};
const INTERVAL_FLOOR_RATIO = 2 / 3;
// 5階全部練滿的累加封頂值(每階0-10級 x 5階)——只有副職(雙職兼修)還在用這個當預設封頂。
export const MAX_EFFECTIVE_SKILL_LEVEL = SKILL_LEVEL_CAP * 5;

export function activeSkillTriggerIntervalSeconds(
  slot: ActiveSkillSlotId,
  level: number,
  levelCap: number = MAX_EFFECTIVE_SKILL_LEVEL
): number {
  const base = ACTIVE_SLOT_BASE_INTERVAL_SECONDS[slot];
  const progress = levelCap > 0 ? Math.min(level, levelCap) / levelCap : 0;
  const interval = base * (1 - (1 - INTERVAL_FLOOR_RATIO) * progress);
  return Math.round(interval * 100) / 100;
}

export type PassiveEffectKind = 'expMastery' | 'coinMastery' | 'lifeMastery';

// 4個主動技能全部是「造成傷害」:傷害表現成「削減這場戰鬥的剩餘時間」(呼應點擊加速勇者
// 用的同一套機制,見 hooks/useGameState.ts 的 boostCurrentFight),不是另外發明一套血量系統。
// 削減比例依「欄位」決定基礎強度(active1最快觸發但削最少、active4最慢觸發但削最多),
// 隨等級(1~10級)線性成長到封頂值——數值刻意不設任何「保底剩餘時間」之類的安全鎖:
// 如果削減量剛好蓋過剩餘時間,戰鬥就正常結束(等同一擊打死),這是傷害算出來的正常結果;
// 不允許的是像舊版「觸發了就無條件讓下一場戰鬥瞬間結束」那種不看數字、保證必死的寫法。
export const ACTIVE_SLOT_DAMAGE_CUT_RATIO_RANGE: Record<ActiveSkillSlotId, { min: number; max: number }> = {
  active1: { min: 0.08, max: 0.2 },
  active2: { min: 0.1, max: 0.24 },
  active3: { min: 0.12, max: 0.28 },
  active4: { min: 0.18, max: 0.4 },
};

// levelCap 語意同 activeSkillTriggerIntervalSeconds:不傳就是副職沿用的舊制累加封頂,
// 主職技能欄自選改傳「單一來源自己」的封頂值。
export function activeSkillDamageCutRatio(
  slot: ActiveSkillSlotId,
  level: number,
  levelCap: number = MAX_EFFECTIVE_SKILL_LEVEL
): number {
  const { min, max } = ACTIVE_SLOT_DAMAGE_CUT_RATIO_RANGE[slot];
  const progress = levelCap > 0 ? Math.min(level, levelCap) / levelCap : 0;
  return min + (max - min) * progress;
}

// 職業樹分階內容:每晉一階(2/3/4/5),主動技能觸發時額外「疊加」一個新效果在既有4格傷害
// 之外——是疊加不是取代,tier5玩家同時享有tier2~5全部疊加效果,呼應「職業樹點進去可以看到
// 2/3/4/5階分支,各階都有專屬新技能」的需求。數值刻意壓在跟被動技能封頂(+30%)、裝備爆擊率
// 等既有加成同一量級,不會讓經濟大幅波動。每次「任一主動技能觸發」的批次只套用一次(不會因為
// 剛好4格同時觸發就疊加4次),見 hooks/useGameState.ts 的 tickBattle。副職觸發不套用這組加成,
// 呼應副職「只拿部分加成」的既有定位。tier5的加成原本是「無條件瞬殺」,同樣改成跟4個主動
// 技能一樣的傷害邏輯——只是機率觸發、削減幅度特別大(50%),一樣不保證打死。
export const TIER2_BONUS_COIN_MULT = 0.1;
export const TIER3_BONUS_EXP_MULT = 0.1;
export const TIER4_BONUS_FLAT_COINS = 3;
export const TIER5_EXTRA_DAMAGE_CHANCE = 0.08;
export const TIER5_EXTRA_DAMAGE_CUT_RATIO = 0.5;

export interface TierTriggerBonus {
  bonusCoinMult: number;
  bonusExpMult: number;
  bonusFlatCoins: number;
  extraDamageChance: number;
}

export function getTierTriggerBonus(tier: JobTier): TierTriggerBonus {
  return {
    bonusCoinMult: tier >= 2 ? TIER2_BONUS_COIN_MULT : 0,
    bonusExpMult: tier >= 3 ? TIER3_BONUS_EXP_MULT : 0,
    bonusFlatCoins: tier >= 4 ? TIER4_BONUS_FLAT_COINS : 0,
    extraDamageChance: tier >= 5 ? TIER5_EXTRA_DAMAGE_CHANCE : 0,
  };
}

// 副職(雙職兼修)只借用主動技能第 1 格(該職業的招牌效果)在戰鬥中觸發,間隔是本職的兩倍,
// 呼應副職只拿「部分加成」的定位——被動技能/其餘 3 個主動技能不會套用在副職上。
const SECONDARY_SKILL_INTERVAL_MULTIPLIER = 2;

export function secondaryActiveSkillTriggerIntervalSeconds(level: number): number {
  return activeSkillTriggerIntervalSeconds('active1', level) * SECONDARY_SKILL_INTERVAL_MULTIPLIER;
}

// 被動一律是 passive1=經驗系、passive2=金幣系、passive3=吸血+回血雙效合一系,所有職業共用
// 同一套分類,靠名稱/描述表現職業風味。
export function getPassiveEffectKind(slot: SkillSlotId): PassiveEffectKind {
  if (slot === 'passive1') return 'expMastery';
  if (slot === 'passive2') return 'coinMastery';
  return 'lifeMastery';
}

// 每級 +3% 加成,level 吃 effectiveSkillLevel() 累加值——1階練滿10級是+30%,5階全部練滿
// (累加50級)是+150%,呼應「每階分開投資、疊加不作廢」的設計,越晚期投入越深。
const PASSIVE_BONUS_PER_LEVEL = 0.03;

export function getPassiveBonusValue(level: number): number {
  return level * PASSIVE_BONUS_PER_LEVEL;
}

// 36 個技能名稱(6 職業 x 6 欄位),每個職業的 active1 沿用舊版單一技能系統的原名,維持敘事延續性。
export const SKILL_SLOT_NAMES: Record<Archetype, Record<SkillSlotId, string>> = {
  physicalMelee: {
    passive1: '扛貨練出的體感',
    passive2: '工地行情摸透了',
    passive3: '扛出來的韌性',
    active1: '爆擊一擊',
    active2: '連環出拳',
    active3: '順手清點庫存',
    active4: '扎實的一天',
  },
  physicalRanged: {
    passive1: '抄近路練出的直覺',
    passive2: '跑單跑出的效率',
    passive3: '跑車練出的耐力',
    active1: '連續多重射擊',
    active2: '順路多接一單',
    active3: '熟門熟路',
    active4: '精準一擊',
  },
  physicalSupport: {
    passive1: '站櫃練出的觀察力',
    passive2: '會員點數精算術',
    passive3: '顧客服務練出的抗壓性',
    active1: '治療光環',
    active2: '貼心的叮嚀',
    active3: '速戰速決',
    active4: '雙倍關懷',
  },
  magicMelee: {
    passive1: '修煉日常',
    passive2: '香油錢緣分',
    passive3: '打坐修煉的元氣',
    active1: '能量爆發斬',
    active2: '連環符咒',
    active3: '收驚順便收紅包',
    active4: '頓悟時刻',
  },
  magicRanged: {
    passive1: '肝出來的手感',
    passive2: '接案眼光',
    passive3: '肝出來的恢復力',
    active1: '法術齊射',
    active2: '業配置入',
    active3: '熬夜肝出的心得',
    active4: '一鍵神操作',
  },
  magicSupport: {
    passive1: '臨床經驗',
    passive2: '診間人脈',
    passive3: '行醫累積的養生術',
    active1: '增幅祝福',
    active2: '衛教叮嚀',
    active3: '藥到病除',
    active4: '雙倍療效',
  },
};

export const SKILL_SLOT_DESCRIPTIONS: Record<Archetype, Record<SkillSlotId, string>> = {
  physicalMelee: {
    passive1: '日復一日扛貨練出的體感,打怪的經驗值吸收得更快。',
    passive2: '在工地行情裡打滾久了,順手多帶一點回家。',
    passive3: '長期扛重物練出的韌性,讓身體恢復力跟著變好,吸血跟自動回血效果都會提升。',
    active1: '一拳打爆眼前的敵人,狠狠痛擊要害,造成大量傷害。',
    active2: '拳拳到肉,招式力道全開,對敵人造成沉重傷害。',
    active3: '收工前順手清點一下庫存,多賺一筆零用錢。',
    active4: '扎實幹完一天活,抓準破綻補刀,造成額外傷害。',
  },
  physicalRanged: {
    passive1: '抄近路抄久了,連怎麼打怪都比別人有效率。',
    passive2: '跑單跑出心得,順路的錢也不放過。',
    passive3: '長時間在外奔波練出的底子耐力,吸血跟自動回血效果都會提升。',
    active1: '連續多重射擊招呼過去,招式力道全開,對敵人造成沉重傷害。',
    active2: '順路多接一單,順勢補上一記,造成可觀傷害。',
    active3: '熟門熟路抄捷徑,抓準破綻補刀,造成額外傷害。',
    active4: '一箭封喉,造成大量傷害。',
  },
  physicalSupport: {
    passive1: '站櫃檯練出的敏銳觀察力,經驗值吸收得更快。',
    passive2: '會員點數精算到位,順手多換一點回饋金。',
    passive3: '第一線服務練出的抗壓體質,吸血跟自動回血效果都會提升。',
    active1: '一圈治療光環罩住全場,順勢補上一記,造成可觀傷害。',
    active2: '貼心叮嚀送到心坎裡,抓準破綻補刀,造成額外傷害。',
    active3: '手腳俐落速戰速決,狠狠痛擊要害,造成大量傷害。',
    active4: '雙倍關懷灌注全場,招式力道全開,對敵人造成沉重傷害。',
  },
  magicMelee: {
    passive1: '每天固定修煉的日常,經驗值吸收得更快。',
    passive2: '香油錢的緣分到了,順手多收一點。',
    passive3: '打坐修煉出的元氣底子,吸血跟自動回血效果都會提升。',
    active1: '灌注能量的爆發斬,狠狠痛擊要害,造成大量傷害。',
    active2: '連環符咒一張接一張,招式力道全開,對敵人造成沉重傷害。',
    active3: '順便幫怪物收個驚,順勢補上一記,造成可觀傷害。',
    active4: '一瞬間的頓悟,抓準破綻補刀,造成額外傷害。',
  },
  magicRanged: {
    passive1: '肝出來的手感就是不一樣,經驗值吸收得更快。',
    passive2: '接案眼光練出來了,順手多賺一點外快。',
    passive3: '熬夜爆肝練出的恢復本能,吸血跟自動回血效果都會提升。',
    active1: '法術齊射覆蓋戰場,招式力道全開,對敵人造成沉重傷害。',
    active2: '業配悄悄置入,順勢補上一記,造成可觀傷害。',
    active3: '熬夜肝出的心得沒有白費,抓準破綻補刀,造成額外傷害。',
    active4: '一鍵神操作,狠狠痛擊要害,造成大量傷害。',
  },
  magicSupport: {
    passive1: '看診看出來的臨床經驗,經驗值吸收得更快。',
    passive2: '診間累積的人脈,順手多收一點紅包。',
    passive3: '行醫多年悟出的養生之道,吸血跟自動回血效果都會提升。',
    active1: '增幅祝福籠罩全隊,順勢補上一記,造成可觀傷害。',
    active2: '衛教叮嚀說得仔細,抓準破綻補刀,造成額外傷害。',
    active3: '手起刀落藥到病除,狠狠痛擊要害,造成大量傷害。',
    active4: '雙倍療效發揮作用,招式力道全開,對敵人造成沉重傷害。',
  },
};

// 依「累加全部已投資階級」的有效等級(見 effectiveSkillLevel),把「每N秒觸發一次+實際
// 效果」或「永久加成」組成一句人看得懂的說明,對應 hooks/useGameState.ts tickBattle() 裡
// 實際套用的效果,不是另一套規則。
export function getSkillSlotBonusDescription(archetype: Archetype, slot: SkillSlotId, level: number): string {
  if (isPassiveSlot(slot)) {
    const kind = getPassiveEffectKind(slot);
    const pct = Math.round(getPassiveBonusValue(level) * 1000) / 10;
    if (kind === 'expMastery') return `永久經驗獲取 +${pct}%`;
    if (kind === 'coinMastery') return `永久金幣獲取 +${pct}%`;
    return `永久吸血+自動回血 +${pct}%`;
  }
  // isPassiveSlot(slot) 已經在上面 return 過了,能走到這裡代表 slot 一定是 4 個主動欄位之一。
  // archetype 參數保留是為了呼叫端簽章相容,傷害比例本身只吃欄位+等級,不吃職業。
  const activeSlot = slot as ActiveSkillSlotId;
  const seconds = activeSkillTriggerIntervalSeconds(activeSlot, level);
  const pct = Math.round(activeSkillDamageCutRatio(activeSlot, level) * 1000) / 10;
  return `每 ${seconds} 秒觸發一次,對敵人造成傷害(削減這場戰鬥剩餘時間 ${pct}%)`;
}
