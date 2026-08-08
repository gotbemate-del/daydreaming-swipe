// 技能書與圖鑑的驗證。**永久技能那一組已經整組移除**(見下方的長註解),
// 所以這份腳本現在要證明的只剩一件事:
// 「技能書與圖鑑放大得到元素與主動,但一格都碰不到理想路線」。
import {
  maxRunSkillAttackMultiplier,
  bookPowerScale, MAX_SKILL_BOOK_LEVEL, MAX_RUN_SKILL_LEVEL,
  ACTIVE_SKILL_IDS, bestRunSkillChoice, learnRunSkill, runSkillOffersAt,
  runSkillEffects, ELEMENTS, type RunSkillState, type ElementBooks,
} from '../game/laneRunSkills';

import {
  COLLECTION_FLAVOUR_BONUS, addItem, collectionScales, emptyCollection, TOTAL_ITEMS,
} from '../game/collection';
import { CODEX_ENTRIES, MAX_ELEMENT_BONUS } from '../game/codexEntries';

/** 圖鑑收滿時的放大倍率(每一個屬性都封頂)。 */
const FULL_CODEX = Object.fromEntries(ELEMENTS.map((id) => [id, 1 + MAX_ELEMENT_BONUS]));

let fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fail++;
};

const rng = (() => { let x = 20260729; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; })();

// --- 永久技能已整組移除 ---
//
// 鋒鑄 / 強化 / 堅韌 / 工藝 四款依指示拿掉了,連同「每關通關三選一」那個畫面。
// **這一段原本是整份腳本的一半**(上限 3 組 x 5 級、選項規則、效果方向、
// 「養成買不到勝利」的過關率對照),全部隨著那一組一起刪掉。
//
// 留下這段註解是因為它記著一條仍然成立的規則:**永久技能是唯一一條會進理想路線的養成**,
// 所以它的幅度上限(當時是 +45%)必須跟「一次失誤的容錯緩衝」一起看。
// 哪天要加回類似的東西,那條約束要一起加回來——現在剩下的三條養成
// (轉職、技能書、圖鑑)裡,只有轉職進理想路線,而 verify-lane-jobs 在盯它。

/** 六個元素全部練滿的技能書。逐屬性之後「滿書」不再是一個數字,要自己組一份。 */
const FULL_BOOKS: ElementBooks = Object.fromEntries(ELEMENTS.map((id) => [id, MAX_SKILL_BOOK_LEVEL]));

// --- 技能書(副本掉的第三層養成)---
//
// **它只准動貪心挑不到的東西。** 敵人戰力照「最佳路線」算,而最佳路線是照
// attackMultiplier x heroMultiplier 貪心挑。鋒刃/增殖 移除之後**沒有任何技能會動這兩個值**,
// 所以技能書現在天生就碰不到理想路線——但這一項還是要留:它證明的是
// 「技能書放大的東西全部在理想路線之外」,而不是「剛好目前沒有東西在裡面」。
check('技能書放大的東西全部不進理想路線(全點滿的戰力倍率仍然是 1)',
  maxRunSkillAttackMultiplier() === 1);
// 主動技能已全部移除,所以技能書現在只放大元素。
// 逐屬性之後這一項要**逐個元素各給各的**:給 fire 的書不該讓 thunder 變強,
// 而那正是「每天開一個屬性」能成立的前提(不然屬性只是門票顏色)。
check('技能書會放大元素,而且只放大它自己那一個', ELEMENTS.every((id) => {
  const only = { [id]: MAX_SKILL_BOOK_LEVEL };
  const others = ELEMENTS.filter((e) => e !== id);
  return bookPowerScale(id, only) > 1 && others.every((e) => bookPowerScale(e, only) === 1);
}));
// 技能書一律不出現在選項那一層:加量、換成元素、開等級上限,三種都會改變
// 「同一顆 seed 抽出哪三個」,玩家側的曲線就會偏離 createRun 假設的那一條。
check('技能書完全不影響選項(runSkillOffersAt 根本不收它)',
  runSkillOffersAt.length <= 4);
// **這一項是技能書設計的核心**:理想路線完全不受影響 ⇒ 敵人不會為了它變強。
// **這一項是技能書設計的核心**:帶滿書的玩家,戰力曲線跟沒有書時完全一樣,
// 所以 createRun 算敵人時可以完全忽略它 ⇒ 敵人一格都不會變強。
check('帶滿技能書也不會改變戰力曲線(所以敵人一格都不會變強)', (() => {
  let skills: RunSkillState[] = [];
  for (let k = 0; k < 60; k++) {
    const offers = runSkillOffersAt(skills, 777, k, ACTIVE_SKILL_IDS.length);
    if (offers.length === 0) break;
    skills = learnRunSkill(skills, bestRunSkillChoice(skills, offers));
    const a = runSkillEffects(skills, undefined, {});
    const b = runSkillEffects(skills, undefined, FULL_BOOKS);
    if (a.attackMultiplier !== b.attackMultiplier || a.heroMultiplier !== b.heroMultiplier) return false;
  }
  return true;
})());
// 裝備圖鑑跟技能書同一條軸:也只放大元素與主動,所以也不會把敵人養大。
check('裝備圖鑑碰不到鋒刃/增殖', (() => {
  let skills: RunSkillState[] = [];
  for (let k = 0; k < 40; k++) {
    const offers = runSkillOffersAt(skills, 999, k, ACTIVE_SKILL_IDS.length);
    if (offers.length === 0) break;
    skills = learnRunSkill(skills, bestRunSkillChoice(skills, offers));
    const a = runSkillEffects(skills, undefined, {}, {});
    const b = runSkillEffects(skills, undefined, {}, FULL_CODEX);
    if (a.attackMultiplier !== b.attackMultiplier || a.heroMultiplier !== b.heroMultiplier) return false;
  }
  return true;
})());
check('裝備圖鑑會放大元素(對玩家是真的變強)', (() => {
  // 火已經完全退出擊殺數,改用金驗:圖鑑放大的是 pierceRatio。
  const kit: RunSkillState[] = [{ id: 'metal', level: 5 }];
  return runSkillEffects(kit, undefined, {}, FULL_CODEX).pierceRatio
    > runSkillEffects(kit, undefined, {}, {}).pierceRatio;
})());
// 圖鑑改成「一個條目綁一個屬性」之後,加成是**逐屬性**的:收滿火的那幾件只有火變強。
// 這一項在盯那個隔離性——沒有隔離的話它就退化回「一條收集率把八個一起拉」,
// 蒐集的方向感(「我還差雷的那幾件」)就不存在了。
check('圖鑑的加成是逐屬性的(收火不會順便把雷拉起來)', (() => {
  const kit: RunSkillState[] = [{ id: 'metal', level: 5 }, { id: 'thunder', level: 5 }];
  const onlyMetal = runSkillEffects(kit, undefined, {}, { metal: 1 + MAX_ELEMENT_BONUS });
  const none = runSkillEffects(kit, undefined, {}, {});
  return onlyMetal.pierceRatio > none.pierceRatio && onlyMetal.chainRatio === none.chainRatio;
})());
check(`單一屬性的加成封頂在 +${Math.round(MAX_ELEMENT_BONUS * 100)}%`, (() => {
  // 501 個條目平均分到 6 個屬性 = 每個 63 件 x 5 級 x 1% = 理論上 +315%,所以一定要封頂。
  const bits = emptyCollection();
  for (let i = 0; i < TOTAL_ITEMS; i++) addItem(bits, i);
  const scales = collectionScales(bits);
  return ELEMENTS.every((id) => (scales[id] ?? 1) <= 1 + MAX_ELEMENT_BONUS + 1e-9)
    && ELEMENTS.every((id) => (scales[id] ?? 1) > 1);
})());
// 條目數要夠分散,不然有些屬性收不滿、有些一下就封頂。
check('六個屬性分到的條目數夠平均(沒有哪個屬性特別難收)', (() => {
  const tally = new Map<string, number>();
  for (const e of CODEX_ENTRIES) tally.set(e.element, (tally.get(e.element) ?? 0) + 1);
  const counts = ELEMENTS.map((id) => tally.get(id) ?? 0);
  return Math.min(...counts) >= CODEX_ENTRIES.length / ELEMENTS.length * 0.6;
})(), CODEX_ENTRIES.length + ' 個條目:'
  + ELEMENTS.map((id) => CODEX_ENTRIES.filter((e) => e.element === id).length).join('/'));
// 反過來:對真人是真的變強(元素的效果被放大)。
check('技能書讓元素明顯更強(對玩家是真的變強)', (() => {
  const kit: RunSkillState[] = [{ id: 'metal', level: 5 }, { id: 'ice', level: 5 }, { id: 'thunder', level: 5 }];
  const a = runSkillEffects(kit, undefined, {});
  const b = runSkillEffects(kit, undefined, FULL_BOOKS);
  return b.pierceRatio > a.pierceRatio && b.chainRatio > a.chainRatio
    && b.tradeMultiplier > a.tradeMultiplier;
})());
// 逐屬性的隔離性:只練金的書,金變強而雷完全不動。
// 這一項跟圖鑑那一項是同一個形狀——沒有隔離的話,「今天開哪個屬性」就沒有意義了。
check('技能書的加成是逐屬性的(只練金不會順便把雷拉起來)', (() => {
  const kit: RunSkillState[] = [{ id: 'metal', level: 5 }, { id: 'thunder', level: 5 }];
  const onlyMetal = runSkillEffects(kit, undefined, { metal: MAX_SKILL_BOOK_LEVEL });
  const none = runSkillEffects(kit, undefined, {});
  return onlyMetal.pierceRatio > none.pierceRatio && onlyMetal.chainRatio === none.chainRatio;
})());

console.log(fail === 0 ? '\n全部通過' : `\n${fail} 項失敗`);
process.exit(fail === 0 ? 0 : 1);
