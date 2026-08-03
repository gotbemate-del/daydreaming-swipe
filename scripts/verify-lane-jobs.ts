// 轉職驗證。要證明的是「轉職有感,但買不到勝利」——這兩件事同時成立才是這款的設計。
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARCHETYPES, isPromotionStage, jobChoices, jobTitle, PROMOTION_EVERY, runStartFor, tierAfter,
  type JobState, type JobTier,
} from '../game/laneJobs';
import {
  bestLane, createRun, DEFAULT_RUN_START, initialRunState, LANE_COUNT, resolveRow, rowsForStage,
  totalAttack, worstLane, type Lane, type RunStart, type RunState,
} from '../game/laneRun';

let fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fail++;
};

// --- 什麼時候轉職 ---
const promotionStages = Array.from({ length: 30 }, (_, i) => i + 1).filter(isPromotionStage);
check(`每 ${PROMOTION_EVERY} 關轉一次`, promotionStages.join(',') === '5,10,15,20,25', promotionStages.join(','));
check('第 5 階之後不再轉職', tierAfter(30) === null && tierAfter(25) === 5);
check('沒通關不會轉職', !isPromotionStage(0) && !isPromotionStage(4) && !isPromotionStage(6));

// --- 選項 ---
const firstChoices = jobChoices(null, 1);
check('第一次轉職:6 條路線都能選', firstChoices.length === ARCHETYPES.length,
  firstChoices.map((c) => c.title).join(' '));
check('第一次的選項互不重複', new Set(firstChoices.map((c) => c.title)).size === firstChoices.length);
const second = jobChoices({ archetype: 'physicalMelee', branch: 'A', tier: 1 }, 2);
check('第二次之後:路線已定,選 A/B 分支', second.length === 2
  && second.every((c) => c.job.archetype === 'physicalMelee'), second.map((c) => c.title).join(' / '));
check('每個選項都有職稱與說明', [...firstChoices, ...second].every((c) => c.title.length > 0 && c.summary.length > 0));
check('未轉職叫學生', jobTitle(null) === '學生');

// --- 轉職有感:數值真的會變 ---
const starts = ARCHETYPES.map((archetype) => runStartFor({ archetype, branch: 'A', tier: 1 }));
check('六條路線的起跑數值不是同一組',
  new Set(starts.map((s) => JSON.stringify(s))).size >= 3,
  `${new Set(starts.map((s) => JSON.stringify(s))).size} 種`);
// 轉職一律 1 人起跑:人數只能靠跑道上的閘門滾出來,一場跑圖就是「從一個人變成一支隊伍」。
// 這條同時也是「勇者 +N」閘門職業中立的前提——只有一個人的時候每人攻擊力就等於總戰力,
// 同一格對每個職業的價值一樣。所以這裡連滿階、連 B 分支都要盯著。
const everyJob = ARCHETYPES.flatMap((archetype) =>
  ([1, 2, 3, 4, 5] as JobTier[]).flatMap((tier) =>
    (['A', 'B'] as const).map((branch) => runStartFor({ archetype, branch, tier }))));
check('每個職業都是 1 人起跑(含滿階與 B 分支)',
  everyJob.every((s) => s.heroes === 1) && DEFAULT_RUN_START.heroes === 1,
  `${everyJob.length} 種組合`);
check('輔助路線起跑血比較厚',
  runStartFor({ archetype: 'physicalSupport', branch: 'A', tier: 1 }).hpMultiplier
  > runStartFor({ archetype: 'physicalRanged', branch: 'A', tier: 1 }).hpMultiplier);
check('近戰路線起跑裝備比較好',
  runStartFor({ archetype: 'physicalMelee', branch: 'A', tier: 3 }).gear
  > runStartFor({ archetype: 'physicalSupport', branch: 'A', tier: 3 }).gear);
check('A/B 分支還是分得出來(A 偏戰力、B 偏耐打)',
  ARCHETYPES.every((archetype) => {
    const a = runStartFor({ archetype, branch: 'A', tier: 2 });
    const b = runStartFor({ archetype, branch: 'B', tier: 2 });
    return a.attackMultiplier > b.attackMultiplier && b.hpMultiplier > a.hpMultiplier;
  }));
const tiers: JobTier[] = [1, 2, 3, 4, 5];
const meleeAttack = tiers.map((tier) => initialRunState(20, runStartFor({ archetype: 'physicalMelee', branch: 'A', tier })));
check('階級越高起跑戰力越高', meleeAttack.every((s, i) => i === 0 || totalAttack(s) >= totalAttack(meleeAttack[i - 1])),
  meleeAttack.map((s) => totalAttack(s)).join(' → '));
check('轉職一定比沒轉職強', totalAttack(meleeAttack[0]) > totalAttack(initialRunState(20, DEFAULT_RUN_START)));

// --- 但買不到勝利:滿階職業亂選一樣會輸 ---
type Picker = (s: RunState, row: ReturnType<typeof createRun>[number], rng: () => number) => Lane;
function play(seed: number, stage: number, start: RunStart, pick: Picker) {
  const rows = createRun(seed, stage);
  let st = initialRunState(stage, start);
  const rng = (() => { let x = seed + 7; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; })();
  for (const row of rows) {
    st = { ...st, lane: pick(st, row, rng) };
    st = resolveRow(st, row).state;
    if (st.phase === 'dead') return 'dead' as const;
  }
  return 'cleared' as const;
}
const pickBest: Picker = (s, row) => bestLane(s, row);
const pickWorst: Picker = (s, row) => worstLane(s, row);
const pickRandom: Picker = (_s, _row, rng) => Math.floor(rng() * LANE_COUNT) as Lane;
function rate(stage: number, start: RunStart, pick: Picker, trials = 300) {
  let cleared = 0;
  for (let t = 0; t < trials; t++) if (play(t * 31 + 1, stage, start, pick) === 'cleared') cleared++;
  return cleared / trials;
}

const maxed: JobState = { archetype: 'physicalMelee', branch: 'B', tier: 5 };
const maxedStart = runStartFor(maxed);
console.log('\n第 25 關(滿階職業 vs 未轉職):');
for (const [label, start] of [['滿階', maxedStart], ['未轉職', DEFAULT_RUN_START]] as const) {
  const b = rate(25, start, pickBest), r = rate(25, start, pickRandom), w = rate(25, start, pickWorst);
  console.log(`  ${label}  最佳 ${(b * 100).toFixed(0)}%  隨機 ${(r * 100).toFixed(0)}%  最差 ${(w * 100).toFixed(0)}%`);
}
check('滿階職業亂選還是會輸(養成買不到勝利)', rate(25, maxedStart, pickRandom) <= 0.7,
  `${(rate(25, maxedStart, pickRandom) * 100).toFixed(0)}%`);
check('滿階職業一路選最爛必死', rate(25, maxedStart, pickWorst) <= 0.05);
check('滿階確實比未轉職好過一點(轉職有意義)',
  rate(25, maxedStart, pickRandom) >= rate(25, DEFAULT_RUN_START, pickRandom));
check('不管什麼職業,每排都挑最好的都會過關',
  ARCHETYPES.every((archetype) =>
    rate(20, runStartFor({ archetype, branch: 'A', tier: 3 }), pickBest, 60) >= 0.99));

// --- 美術素材:每個職業與每一階武器都要指得到既有檔案 ---
// components/artAssets.ts 是一長串 require,打錯路徑要等真的轉到那個職業才會發現。
// 這裡直接照同一套命名規則檢查檔案在不在,兩邊改動就不會默默失聯。
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sprites');
const heroArtPath = (archetype: string, branch: string, tier: number) => {
  if (tier === 1) return join(ROOT, 'hero', 'jobs', `${archetype}.png`);
  if (tier === 2) return join(ROOT, 'hero', 'jobs2', `${archetype}_${branch}.png`);
  return join(ROOT, 'hero', tier === 3 ? 'jobs3' : 'jobs4', `${archetype}_${branch}_open.png`);
};
const missingHero = ARCHETYPES.flatMap((a) =>
  (['A', 'B'] as const).flatMap((br) => tiers.map((t) => heroArtPath(a, br, Math.min(4, t)))))
  .filter((f) => !existsSync(f));
check('每個職業每一階都有立繪', missingHero.length === 0, missingHero.slice(0, 3).join(' '));
const missingWeapon = ARCHETYPES.flatMap((a) =>
  [1, 2, 3, 4, 5].map((t) => join(ROOT, 'items', a, `${a}_t${t}_1h.png`)))
  .filter((f) => !existsSync(f));
check('每個職業 1~5 階都有武器圖(裝備閘門吃下去要看得出換了武器)',
  missingWeapon.length === 0, missingWeapon.slice(0, 3).join(' '));

// --- 起跑數值不會外溢到跑圖規則 ---
const rowsA = createRun(4242, 12);
const rowsB = createRun(4242, 12);
check('跑圖內容跟職業無關(轉職不會改閘門也不會減陷阱)',
  JSON.stringify(rowsA) === JSON.stringify(rowsB) && rowsA.length === rowsForStage(12));

console.log(fail === 0 ? '\n全部通過' : `\n${fail} 項失敗`);
process.exit(fail === 0 ? 0 : 1);
