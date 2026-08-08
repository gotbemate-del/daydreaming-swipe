// 轉職驗證。要證明的是「轉職有感,但買不到勝利」——這兩件事同時成立才是這款的設計。
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ARCHETYPES, isPromotionStage, jobChoices, jobTitle, PROMOTION_CHAPTERS, runStartFor, tierAfter,
  activeSkillCountForStage,
  type JobState, type JobTier,
} from '../game/laneJobs';
import {
  createRun, DEFAULT_RUN_START, initialRunState, rowsForStage,
  totalAttack, type RunStart,
} from '../game/laneRun';
import { clearRate, pickBest, pickRandom, pickWorst, type LanePicker } from './simRun';

let fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fail++;
};

// --- 什麼時候轉職 ---
// 轉職綁**大關**(第 5/30/80/160/260 大關結束),不是每 5 個小關一次。
// 舊版 25 個小關就把五階走完,但關卡總長是 3000 小關——99% 的旅程沒有里程碑。
const promotionStages = Array.from({ length: 2700 }, (_, i) => i + 1).filter(isPromotionStage);
check('轉職發生在第 5/30/80/160/260 大關結束',
  promotionStages.join(',') === PROMOTION_CHAPTERS.map((c) => c * 10).join(','),
  promotionStages.map((s) => `${s / 10}大關`).join(' '));
check('第 5 階之後不再轉職', tierAfter(2700) === null && tierAfter(2600) === 5);
check('沒通關、或不是大關結尾都不會轉職',
  !isPromotionStage(0) && !isPromotionStage(4) && !isPromotionStage(6) && !isPromotionStage(49));
// 主動技能已全部移除,所以「轉職給招式格」那條路暫時沒有東西可給——
// 轉職現在回到唯一的獎勵:**起跑數值**(戰力倍率與兌換率,見 runStartFor)。
// activeSkillCountForStage 的階梯還在(1/2/3/4/5 款),等主動技能加回來就能直接接上。
check('轉職的階梯還在(主動技能加回來就能直接接上)',
  activeSkillCountForStage(1) === 1 && activeSkillCountForStage(51) === 2
  && activeSkillCountForStage(301) === 3 && activeSkillCountForStage(2601) >= 4,
  [1, 51, 301, 801, 1601, 2601].map((s) => `${s}關:${activeSkillCountForStage(s)}款`).join(' '));
// 但那個階梯現在開不出東西來,所以要盯住「轉職仍然有獎勵」——不然玩家轉了職什麼都沒拿到。
check('轉職仍然給得出起跑數值(階級越高倍率越高)', (() => {
  const t1 = runStartFor({ archetype: 'physicalMelee', branch: 'A', tier: 1 });
  const t5 = runStartFor({ archetype: 'physicalMelee', branch: 'A', tier: 5 });
  return t5.attackMultiplier > t1.attackMultiplier && t5.tradeRate > t1.tradeRate;
})());

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
check('輔助路線起跑兌換率比較高(耐打)',
  runStartFor({ archetype: 'physicalSupport', branch: 'A', tier: 1 }).tradeRate
  > runStartFor({ archetype: 'physicalRanged', branch: 'A', tier: 1 }).tradeRate);
check('近戰路線起跑裝備比較好',
  runStartFor({ archetype: 'physicalMelee', branch: 'A', tier: 3 }).gear
  > runStartFor({ archetype: 'physicalSupport', branch: 'A', tier: 3 }).gear);
check('A/B 分支還是分得出來(A 偏戰力、B 偏耐打)',
  ARCHETYPES.every((archetype) => {
    const a = runStartFor({ archetype, branch: 'A', tier: 2 });
    const b = runStartFor({ archetype, branch: 'B', tier: 2 });
    return a.attackMultiplier > b.attackMultiplier && b.tradeRate > a.tradeRate;
  }));
const tiers: JobTier[] = [1, 2, 3, 4, 5];
const meleeAttack = tiers.map((tier) => initialRunState(20, runStartFor({ archetype: 'physicalMelee', branch: 'A', tier })));
check('階級越高起跑戰力越高', meleeAttack.every((s, i) => i === 0 || totalAttack(s) >= totalAttack(meleeAttack[i - 1])),
  meleeAttack.map((s) => totalAttack(s)).join(' → '));
check('轉職一定比沒轉職強', totalAttack(meleeAttack[0]) > totalAttack(initialRunState(20, DEFAULT_RUN_START)));

// --- 但買不到勝利:滿階職業亂選一樣會輸 ---
// 一律走 scripts/simRun.ts,不要在這裡自己寫一圈跑圖迴圈:自己寫的那圈少了場內技能,
// 玩家會比敵人假設的弱一整條技能曲線,實測「未轉職 + 每排都挑最好」在第 25 關會變成 0% 過關,
// 看起來像是職業表壞了,其實是模擬器沒跟上。
const rate = (stage: number, start: RunStart, pick: LanePicker, trials = 300) =>
  clearRate(stage, pick, trials, { start });

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
