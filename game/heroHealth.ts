import { JobTier } from './combat';
import { Rarity } from './trigger';

// 勇者血量/戰敗風險系統:在這之前,戰鬥只有進度條跑滿=擊殺成功,勇者不會受傷、不會被打倒。
// 這裡補上「這場戰鬥有沒有可能沒打贏」的判定——公式跟常數已經用 ts-node 數值驗證過,
// 平常打一般小怪(common/rare/epic)只會小幅掉血、配合每次擊殺回血基本打平或回血,
// 只有推王/嚴重落後練等才會真的有戰敗風險,這是刻意的設計,不要為了讓一般戰鬥也有風險而調整數值。

const MONSTER_BASE_ATTACK: Record<Rarity, number> = { common: 5, rare: 12, epic: 30, legendary: 80 };

const DAMAGE_SCALE = 0.35;
// 單場戰鬥最多打掉 60% 最大HP上限,滿血不可能被一場戰鬥秒殺。
const MAX_DAMAGE_FRACTION = 0.6;
// 每次「成功擊殺」(非戰敗)回復 8% 最大HP。
const HP_REGEN_FRACTION_PER_KILL = 0.08;
// 戰敗後以 75% 最大HP重新站起來——這個數字必須嚴格大於 MAX_DAMAGE_FRACTION(0.6),
// 不然會出現無法脫困的無限戰敗迴圈:damageForFight() 是純數值函式、同一場戰鬥(同關卡/
// 同倍率)每次算出來的傷害完全一樣,如果戰敗恢復血量 <= 單場戰鬥的傷害上限,玩家會在
// 「打輸→用回復血量重新挑戰同一隻怪→傷害一樣多→又打輸」這個迴圈裡卡死出不來,
// 而且因為每次都在還沒跑到技能觸發那段程式碼前就 return,技能倒數會整個凍結——
// 這正是實測(推王時Lv偏低)踩到的真實 bug,回復血量拉到 0.75 才能保證重打一定會贏。
const DEFEAT_RECOVERY_FRACTION = 0.75;
// 戰敗後倒地恢復,這段時間不生成新戰鬥。
export const RECOVERY_DELAY_MS = 4000;

export function heroMaxHp(level: number): number {
  return 50 + level * 2;
}

// DEF_BASE:跟下面 heroAttackPower 的 ATK_BASE 同一個目的——沒有這個底,heroDefensePower
// 在低等級時會趨近 0,而 MONSTER_BASE_ATTACK 是跟等級無關的固定值,兩者一除比例會爆炸,
// 造成低等玩家(用真實稀有度機率加權算過,約 Lv1~40)平均每殺一隻怪的期望傷害遠大於
// HP_REGEN_FRACTION_PER_KILL 那 8% 回血,持續掉血,跟本檔案最上面的設計意圖(平常打
// 一般小怪基本打平或回血)矛盾,也是造成技能倒數卡在 0s(見 tickBattle 的戰敗提早
// return)的根源。用 ts-node 對 common/rare/epic/legendary 依 game/trigger.ts 真實機率
// 加權算過,DEF_BASE=25 能讓 Lv1~Lv100 的平均每殺傷害跟回血基本打平,同時魔王/高倍率戰鬥
// 依然會逼近 MAX_DAMAGE_FRACTION 上限,不影響既有的「只有推王才有真的戰敗風險」設計。
const DEF_BASE = 25;

export function heroDefensePower(level: number, tier: JobTier, resistanceSubstatTotal: number): number {
  return (DEF_BASE + level) * (1 + tier * 0.1) * (1 + resistanceSubstatTotal);
}

export function monsterAttackPower(rarity: Rarity, difficultyMultiplier: number): number {
  return MONSTER_BASE_ATTACK[rarity] * difficultyMultiplier;
}

export function damageForFight(
  level: number,
  tier: JobTier,
  resistanceSubstatTotal: number,
  rarity: Rarity,
  difficultyMultiplier: number,
  maxHp: number
): number {
  const def = heroDefensePower(level, tier, resistanceSubstatTotal);
  const atk = monsterAttackPower(rarity, difficultyMultiplier);
  const ratio = atk / def;
  return Math.round(maxHp * Math.min(MAX_DAMAGE_FRACTION, Math.max(0, ratio * DAMAGE_SCALE)));
}

export interface FightHealthResult {
  damage: number;
  nextHp: number;
  defeated: boolean; // true = 這場戰鬥沒有擊殺成功,勇者被打倒
}

// currentHp/maxHp 是這場戰鬥開始「前」的血量(呼叫端在擊殺結算的同一個時間點呼叫,
// 邏輯上等同「這場戰鬥的傷害在結算擊殺獎勵之前先算」)。
// lifestealBonus:裝備素質+passive3被動疊加出來的吸血加成(見 game/equipment.ts 的
// SubstatTotals.lifesteal / game/skillTree.ts 的 passive3),直接疊加在既有的「擊殺成功回血」
// 基礎值(HP_REGEN_FRACTION_PER_KILL)之上,兩者是同一個機制的疊加,不是兩條獨立回血。
export function resolveFightHealth(
  currentHp: number,
  maxHp: number,
  level: number,
  tier: JobTier,
  resistanceSubstatTotal: number,
  rarity: Rarity,
  difficultyMultiplier: number,
  lifestealBonus: number
): FightHealthResult {
  const damage = damageForFight(level, tier, resistanceSubstatTotal, rarity, difficultyMultiplier, maxHp);
  const remaining = currentHp - damage;
  if (remaining <= 0) {
    return { damage, nextHp: Math.round(maxHp * DEFEAT_RECOVERY_FRACTION), defeated: true };
  }
  const healed = Math.min(maxHp, remaining + Math.round(maxHp * (HP_REGEN_FRACTION_PER_KILL + lifestealBonus)));
  return { damage, nextHp: healed, defeated: false };
}

// 回血(hpRegen):跟上面「擊殺成功回血」不同,這是完全獨立於戰鬥結果的被動機制——每隔固定秒數
// 自動回一點血,沒有任何投資(hpRegenTotal=0)的玩家完全不會觸發,不像吸血是疊加在「一定會發生」
// 的既有機制上。用跟副本入場券回補(game/dungeon.ts 的 applyDungeonTicketRegen)同一種「往前推進
// 整數個間隔」寫法,離線很久回來也不會噴一大包血(有 maxHp 上限夾住),也不會因為看了一眼畫面
// 就把已經累積的零頭時間歸零。
export const HP_REGEN_TICK_INTERVAL_MS = 10000;

export interface HpRegenTickResult {
  heroHp: number;
  lastHpRegenTickAt: number;
}

export function applyHpRegenTick(
  heroHp: number,
  maxHp: number,
  lastHpRegenTickAt: number,
  hpRegenTotal: number,
  now: number = Date.now()
): HpRegenTickResult {
  if (hpRegenTotal <= 0) return { heroHp, lastHpRegenTickAt: now };
  const elapsed = now - lastHpRegenTickAt;
  if (elapsed < HP_REGEN_TICK_INTERVAL_MS) return { heroHp, lastHpRegenTickAt };
  const ticks = Math.floor(elapsed / HP_REGEN_TICK_INTERVAL_MS);
  const consumedMs = ticks * HP_REGEN_TICK_INTERVAL_MS;
  const healed = Math.min(maxHp, heroHp + Math.round(maxHp * hpRegenTotal * ticks));
  return { heroHp: healed, lastHpRegenTickAt: lastHpRegenTickAt + consumedMs };
}

// 攻擊力/怪物血量系統:對稱於上面的防禦/傷害判定,但完全獨立——怪物血量不吃玩家等級
// (跟 monsterAttackPower 一樣的既有慣例),勇者攻擊力吃等級+階級+攻擊素質(跟 heroDefensePower
// 同一種公式形狀)。ATK_BASE 是攻擊力公式的底,避免 Lv1 新手因為等級項趨近 0 而讓戰鬥時長暴增。
const ATK_BASE = 40;

const MONSTER_BASE_HP: Record<Rarity, number> = {
  common: 252000,
  rare: 420000,
  epic: 672000,
  legendary: 1260000,
};
// 校準基準:Lv30/2階(剛畢業)、完全沒點攻擊素質的玩家,算出來的攻擊力剛好讓上面這組血量值
// 換算出的戰鬥時長,跟改版前 game/battle.ts 的 BASE_FIGHT_DURATION_MS 查表值完全一致
// (common 3000ms/rare 5000ms/epic 8000ms/legendary 15000ms)——所以這個基準點的玩家不會感覺
// 到任何變化,低於這個投資的玩家戰鬥會變慢(但有 ATK_BASE 兜底,Lv1新手最多慢到約1.86倍,
// 不會誇張),高於這個投資的玩家戰鬥會變快。這組常數是刻意手算校準過的,不要重新推導或調整。

export function monsterHp(rarity: Rarity, difficultyMultiplier: number): number {
  return MONSTER_BASE_HP[rarity] * difficultyMultiplier;
}

export function heroAttackPower(level: number, tier: JobTier, attackSubstatTotal: number): number {
  return (ATK_BASE + level) * (1 + tier * 0.1) * (1 + attackSubstatTotal);
}
