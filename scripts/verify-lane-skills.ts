// 技能驗證。技能是每關一次的養成,幅度必須比轉職更小——這裡要證明的是
// 「選技能有感,但把技能點滿也買不到勝利」。
import {
  applySkills, describeSkill, learnSkill, MAX_SKILL_LEVEL, MAX_SKILL_SLOTS,
  maxAttackMultiplierFromSkills, OFFERS_PER_CLEAR, SKILLS, skillLevel, skillOffers,
  type SkillState,
} from '../game/laneSkills';
import { runStartFor } from '../game/laneJobs';
import {
  DEFAULT_RUN_START, initialRunState,
  totalAttack, ENEMY_POWER_RATIO, type RunStart,
} from '../game/laneRun';
import {
  bookPowerScale, MAX_SKILL_BOOK_LEVEL, MAX_RUN_SKILL_LEVEL,
  ACTIVE_SKILL_IDS, bestRunSkillChoice, learnRunSkill, runSkillOffersAt,
  runSkillEffects, type RunSkillState,
} from '../game/laneRunSkills';
import { COLLECTION_FLAVOUR_BONUS } from '../game/collection';
import { clearRate, pickAccurate, pickBest, pickRandom, pickWorst, type LanePicker } from './simRun';

let fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fail++;
};

const rng = (() => { let x = 20260729; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; })();

// --- 上限:3 組 x 5 級 ---
let skills: SkillState[] = [];
for (let clear = 0; clear < 40; clear++) {
  const offers = skillOffers(skills, rng);
  if (offers.length === 0) break;
  skills = learnSkill(skills, offers[0]);
}
check(`最多只能帶 ${MAX_SKILL_SLOTS} 組`, skills.length <= MAX_SKILL_SLOTS, `帶了 ${skills.length} 組`);
check(`每組最高 ${MAX_SKILL_LEVEL} 級`, skills.every((s) => s.level <= MAX_SKILL_LEVEL),
  skills.map((s) => `${s.id}${s.level}`).join(' '));
check('全部點滿之後就沒東西可選(外層要跳過畫面)', skillOffers(skills, rng).length === 0);
check('滿的時候不會再塞第 4 組進來',
  learnSkill(skills, { id: SKILLS.find((s) => !skills.some((k) => k.id === s.id))?.id ?? 'forge', level: 1 }).length
  <= MAX_SKILL_SLOTS);

// --- 選項規則 ---
check(`一次給 ${OFFERS_PER_CLEAR} 個選項`, skillOffers([], rng).length === OFFERS_PER_CLEAR);
check('沒帶技能時給的都是 1 級新技能', skillOffers([], rng).every((o) => o.level === 1));
const three: SkillState[] = [{ id: 'forge', level: 1 }, { id: 'toughen', level: 1 }, { id: 'craft', level: 1 }];
check('帶滿 3 組之後只能升級手上的',
  skillOffers(three, rng).every((o) => three.some((s) => s.id === o.id)));
check('升級選項是「現在等級 +1」',
  skillOffers(three, rng).every((o) => o.level === skillLevel(three, o.id) + 1));
check('每個選項都有看得懂的說明', skillOffers([], rng).every((o) => describeSkill(o).length > 0),
  skillOffers([], rng).map(describeSkill).join(' / '));

// --- 效果真的有作用,而且方向正確 ---
const maxed: SkillState[] = [
  { id: 'forge', level: 5 }, { id: 'reinforce', level: 5 }, { id: 'craft', level: 5 },
];
const maxedStart = applySkills(DEFAULT_RUN_START, maxed);
check('點滿戰力技能之後起跑戰力真的變高',
  totalAttack(initialRunState(20, maxedStart)) > totalAttack(initialRunState(20, DEFAULT_RUN_START)),
  `${totalAttack(initialRunState(20, DEFAULT_RUN_START))} → ${totalAttack(initialRunState(20, maxedStart))}`);
check('增援加兌換率也加一點戰力',
  applySkills(DEFAULT_RUN_START, [{ id: 'reinforce', level: 5 }]).tradeRate > DEFAULT_RUN_START.tradeRate
  && applySkills(DEFAULT_RUN_START, [{ id: 'reinforce', level: 5 }]).attackMultiplier > DEFAULT_RUN_START.attackMultiplier);
// 任何養成都不准給起跑人數。給了的話 perHero 會被稀釋,而跑道上的「勇者 +N」是固定值,
// 收益 = N x 每人攻擊力——於是點越多越弱。實測過一次:全開 22% vs 裸裝 54%。
const everySkillCombo = (['forge', 'reinforce', 'toughen', 'craft'] as const)
  .flatMap((id) => [1, 3, 5].map((level) => applySkills(DEFAULT_RUN_START, [{ id, level }])));
check('沒有任何技能會增加起跑人數(給了就會讓玩家越點越弱)',
  everySkillCombo.every((s) => s.heroes === 1) && maxedStart.heroes === 1);
check('精工真的升武器階', applySkills(DEFAULT_RUN_START, [{ id: 'craft', level: 5 }]).gear
  === DEFAULT_RUN_START.gear + 2);
check('堅韌只加兌換率不加戰力',
  applySkills(DEFAULT_RUN_START, [{ id: 'toughen', level: 5 }]).tradeRate > DEFAULT_RUN_START.tradeRate
  && applySkills(DEFAULT_RUN_START, [{ id: 'toughen', level: 5 }]).attackMultiplier === DEFAULT_RUN_START.attackMultiplier);
check('等級越高加得越多',
  [1, 2, 3, 4, 5].map((l) => applySkills(DEFAULT_RUN_START, [{ id: 'forge', level: l }]).attackMultiplier)
    .every((v, i, a) => i === 0 || v > a[i - 1]));
check('等級被夾在 0~5 之間(髒資料不會爆倍率)',
  applySkills(DEFAULT_RUN_START, [{ id: 'forge', level: 99 }]).attackMultiplier
  === applySkills(DEFAULT_RUN_START, [{ id: 'forge', level: 5 }]).attackMultiplier);

// --- 上限要小:這是「養成買不到勝利」的安全帶 ---
check('技能能疊出的戰力倍率不超過 1.5 倍', maxAttackMultiplierFromSkills() < 1.5,
  `x${maxAttackMultiplierFromSkills().toFixed(2)}`);

// --- 實測:滿技能 + 滿階職業,亂選一樣會輸 ---
// 跑圖模擬一律走 scripts/simRun.ts。這裡自己寫一圈的話會漏掉**場內技能**
// (game/laneRunSkills.ts,每打完一波給一次),而敵人戰力是照「含場內技能的最佳路線」算的——
// 少算的那一整條曲線會讓所有過關率一起塌掉,看起來像養成壞了。
const rate = (stage: number, start: RunStart, pick: LanePicker, trials = 300) =>
  clearRate(stage, pick, trials, { start });
/**
 * 準確率 p 的玩家:每排有 p 的機率挑對邊。
 * 「養成有沒有意義」要用這個量,不能用亂選——跑道 20 排之後亂選在任何設定下都是 0~1%,
 * 兩邊都貼著地板,比出來的是雜訊不是效果(同一個理由見 CLAUDE.md 的難度指標那段)。
 */
const accRate = (stage: number, start: RunStart, p: number, trials = 400) =>
  clearRate(stage, pickAccurate(p), trials, { start });

const fullyLoaded = applySkills(runStartFor({ archetype: 'physicalMelee', branch: 'B', tier: 5 }), maxed);
console.log('\n第 25 關(滿階職業 + 滿技能 vs 什麼都沒有):');
for (const [label, start] of [['全開', fullyLoaded], ['裸裝', DEFAULT_RUN_START]] as const) {
  const b = rate(25, start, pickBest), r = rate(25, start, pickRandom), w = rate(25, start, pickWorst);
  console.log(`  ${label}  最佳 ${(b * 100).toFixed(0)}%  隨機 ${(r * 100).toFixed(0)}%  最差 ${(w * 100).toFixed(0)}%`);
}
console.log(`  (全開的起跑倍率:戰力 x${fullyLoaded.attackMultiplier.toFixed(2)}、`
  + `兌換率 x${fullyLoaded.tradeRate.toFixed(2)}、${fullyLoaded.heroes} 人、武器 ${fullyLoaded.gear} 階)`);

check('全開之後亂選還是會輸(養成買不到勝利)', rate(25, fullyLoaded, pickRandom) <= 0.7,
  `${(rate(25, fullyLoaded, pickRandom) * 100).toFixed(0)}%`);
check('全開之後一路選最爛照樣死', rate(25, fullyLoaded, pickWorst) <= 0.05);
// 用一般小關量:5 的倍數那兩關比較長,起跑數值的效果會被複利放大,量出來的差距不具代表性。
const accFull = accRate(27, fullyLoaded, 0.85);
const accBare = accRate(27, DEFAULT_RUN_START, 0.85);
check('全開確實比裸裝好過(養成有意義)', accFull > accBare,
  `3-7 的 85% 準確率:全開 ${(accFull * 100).toFixed(0)}% vs 裸裝 ${(accBare * 100).toFixed(0)}%`);
// 「買不到勝利」的硬性定義是上面那兩條(亂選還是輸、選最爛照樣死),這一條是軟性的上限。
// 45pp 這個數字跟難度綁在一起:緩衝越小,同樣的起跑倍率就越值錢。ratio 0.37 的時候
// 全開只領先 24pp,收緊到 0.5 之後同樣的養成變成 40pp——養成沒變,是緩衝變小了。
check('養成的幅度沒有大到取代技術', accFull - accBare < 0.45,
  `差 ${((accFull - accBare) * 100).toFixed(0)} 個百分點`);
// 真正該盯的關係:養成的總倍率不能大幅超過「一次失誤的容錯緩衝」,否則滿養成等於多送失誤額度。
const buffer = 1 / ENEMY_POWER_RATIO;
check('養成總倍率不超過容錯緩衝太多',
  fullyLoaded.attackMultiplier <= buffer * 1.2,
  `養成 x${fullyLoaded.attackMultiplier.toFixed(2)} vs 緩衝 ${buffer.toFixed(2)}x`);
check('全開之後每排都挑最好的仍然一定過關', rate(25, fullyLoaded, pickBest) >= 0.99);

// --- 技能書(生存模式掉的第三層養成)---
//
// **它只准動貪心挑不到的東西。** 敵人戰力照「最佳路線」算,而最佳路線是照
// attackMultiplier x heroMultiplier 貪心挑——只有鋒刃/增殖 會動這兩個值。
// 所以技能書開的是元素/主動的等級上限,以及「保證選項裡有元素/主動」;
// 兩條貪心都用不到,理想路線因此一格都不會動。
check('技能書碰不到鋒刃/增殖(唯二會被理想路線挑到的兩款)',
  bookPowerScale('edge', MAX_SKILL_BOOK_LEVEL) === 1
  && bookPowerScale('swarm', MAX_SKILL_BOOK_LEVEL) === 1);
check('技能書會放大元素與主動',
  bookPowerScale('fire', MAX_SKILL_BOOK_LEVEL) > 1
  && bookPowerScale('strike', MAX_SKILL_BOOK_LEVEL) > 1);
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
    const a = runSkillEffects(skills, undefined, 0);
    const b = runSkillEffects(skills, undefined, MAX_SKILL_BOOK_LEVEL);
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
    const a = runSkillEffects(skills, undefined, 0, 1);
    const b = runSkillEffects(skills, undefined, 0, 1 + COLLECTION_FLAVOUR_BONUS);
    if (a.attackMultiplier !== b.attackMultiplier || a.heroMultiplier !== b.heroMultiplier) return false;
  }
  return true;
})());
check('裝備圖鑑會放大元素(對玩家是真的變強)', (() => {
  const kit: RunSkillState[] = [{ id: 'fire', level: 5 }];
  return runSkillEffects(kit, undefined, 0, 1 + COLLECTION_FLAVOUR_BONUS).burnKills
    > runSkillEffects(kit, undefined, 0, 1).burnKills;
})());
// 反過來:對真人是真的變強(元素的效果被放大)。
check('技能書讓元素明顯更強(對玩家是真的變強)', (() => {
  const kit: RunSkillState[] = [{ id: 'fire', level: 5 }, { id: 'strike', level: 5 }, { id: 'dark', level: 5 }];
  const a = runSkillEffects(kit, undefined, 0);
  const b = runSkillEffects(kit, undefined, MAX_SKILL_BOOK_LEVEL);
  return b.burnKills > a.burnKills && b.leech > a.leech && b.actives[0].kills! > a.actives[0].kills!;
})());

console.log(fail === 0 ? '\n全部通過' : `\n${fail} 項失敗`);
process.exit(fail === 0 ? 0 : 1);
