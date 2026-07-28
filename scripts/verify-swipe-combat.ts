// 滑動戰鬥數值驗證(照 CLAUDE.md 的驗證流程,改 game/ 就要跑)。
import {
  COMBO_CAP, PERFECT_WINDOW_RATIO, REACTION_WINDOW_FLOOR_MS, REACTION_WINDOW_FLOOR_STAGE,
  REACTION_WINDOW_START_MS, breathMs, comboMultiplier, createBattleState, createRng,
  createThreatSequence, judgeSwipe, reactionWindowMs, resolveSwipe, threatCountForEncounter,
  type HeroCombatStats, type MonsterCombatStats, type SwipeQuality,
} from '../game/swipeCombat';

let fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fail++;
};

const hero: HeroCombatStats = { attackPower: 100, maxHp: 1000, critRate: 0.15, critDamage: 1.8 };
const monster: MonsterCombatStats = { maxHp: 900, attackPower: 120 };

// --- 反應窗曲線 ---
const windows = [1, 10, 30, 60, 100, 300].map(reactionWindowMs);
check('反應窗隨關卡單調遞減', windows.every((v, i) => i === 0 || v <= windows[i - 1]), JSON.stringify(windows));
check('第1關等於起始值', reactionWindowMs(1) === REACTION_WINDOW_START_MS);
check('觸底關卡等於地板值', reactionWindowMs(REACTION_WINDOW_FLOOR_STAGE) === REACTION_WINDOW_FLOOR_MS);
check('觸底後不再變短', reactionWindowMs(3000) === REACTION_WINDOW_FLOOR_MS);
check('全程不低於地板', Array.from({ length: 300 }, (_, i) => reactionWindowMs(i + 1)).every((v) => v >= REACTION_WINDOW_FLOOR_MS));
const breaths = [1, 30, 60, 200].map(breathMs);
check('喘息時間單調遞減且不為負', breaths.every((v, i) => v > 0 && (i === 0 || v <= breaths[i - 1])), JSON.stringify(breaths));

// --- 判定 ---
const t = { index: 0, telegraphAt: 1000, windowMs: 800, direction: 'left' as const };
check('窗內、方向對、夠快 = perfect', judgeSwipe(t, 1000 + 300, 'left').quality === 'perfect');
check('窗內、方向對、偏慢 = good', judgeSwipe(t, 1000 + 700, 'left').quality === 'good');
check('perfect/good 分界就在比例上', judgeSwipe(t, 1000 + Math.floor(800 * PERFECT_WINDOW_RATIO), 'left').quality === 'perfect'
  && judgeSwipe(t, 1000 + Math.ceil(800 * PERFECT_WINDOW_RATIO) + 1, 'left').quality === 'good');
check('方向錯 = miss', judgeSwipe(t, 1000 + 200, 'right').quality === 'miss');
check('逾時 = miss', judgeSwipe(t, 1000 + 801, 'left').quality === 'miss');
check('太早(動作還沒出) = miss', judgeSwipe(t, 999, 'left').quality === 'miss');
check('沒滑 = miss', judgeSwipe(t, null, null).quality === 'miss');

// --- 連段 ---
check('0 連段 = 1.0 倍', comboMultiplier(0) === 1);
check('連段倍率單調遞增', Array.from({ length: 30 }, (_, i) => comboMultiplier(i)).every((v, i, a) => i === 0 || v >= a[i - 1]));
check('連段封頂在 2.0 倍', comboMultiplier(COMBO_CAP) === 2 && comboMultiplier(999) === 2);
check('負數連段不會壞', comboMultiplier(-5) === 1);

// --- 單次結算 ---
const noCrit = () => 1;
const s0 = createBattleState(hero, monster);
const r1 = resolveSwipe(s0, { quality: 'good', reactionMs: 500 }, hero, monster, noCrit);
check('good 反擊傷害 = 攻擊力 x 1.0', r1.damageDealt === 100, String(r1.damageDealt));
const r2 = resolveSwipe(s0, { quality: 'perfect', reactionMs: 100 }, hero, monster, noCrit);
check('perfect 反擊傷害 = 攻擊力 x 1.6', r2.damageDealt === 160, String(r2.damageDealt));
const rMiss = resolveSwipe({ ...s0, combo: 7 }, { quality: 'miss', reactionMs: 800 }, hero, monster, noCrit);
check('miss 會受傷', rMiss.damageTaken === 120);
check('miss 連段歸零', rMiss.state.combo === 0);
check('miss 不造成傷害', rMiss.damageDealt === 0);
const rCrit = resolveSwipe(s0, { quality: 'good', reactionMs: 500 }, hero, monster, () => 0);
check('爆擊乘上爆傷', rCrit.damageDealt === 180 && rCrit.isCrit);
check('傷害至少為 1', resolveSwipe(s0, { quality: 'good', reactionMs: 1 },
  { ...hero, attackPower: 0.001 }, monster, noCrit).damageDealt === 1);

// --- 一整場:全 perfect / 全 good / 全 miss ---
function playAll(quality: SwipeQuality, rng: () => number) {
  let st = createBattleState(hero, monster);
  let turns = 0;
  for (; turns < 500; turns++) {
    const r = resolveSwipe(st, { quality, reactionMs: 100 }, hero, monster, rng);
    st = r.state;
    if (r.outcome !== 'ongoing') return { outcome: r.outcome, turns: turns + 1, st };
  }
  return { outcome: 'timeout' as const, turns, st };
}
const allPerfect = playAll('perfect', noCrit);
const allGood = playAll('good', noCrit);
const allMiss = playAll('miss', noCrit);
check('全 perfect 會贏', allPerfect.outcome === 'win', `${allPerfect.turns} 下`);
check('全 good 會贏', allGood.outcome === 'win', `${allGood.turns} 下`);
check('全 perfect 比全 good 快', allPerfect.turns < allGood.turns);
check('全 miss 會輸', allMiss.outcome === 'lose', `${allMiss.turns} 下`);
check('maxCombo 有記到', allGood.st.maxCombo === allGood.turns);

// --- 出招表 ---
const n = threatCountForEncounter(hero, monster);
check('出招數多於「全 good 打死」所需', n > allGood.turns, `出招 ${n} vs 需要 ${allGood.turns}`);
const seq = createThreatSequence(12345, 10, n);
check('出招表長度正確', seq.length === n);
check('出招時間嚴格遞增', seq.every((x, i) => i === 0 || x.telegraphAt > seq[i - 1].telegraphAt));
check('相鄰出招不重疊', seq.every((x, i) => i === 0 || x.telegraphAt >= seq[i - 1].telegraphAt + seq[i - 1].windowMs));
check('同一 seed 產生一樣的表', JSON.stringify(createThreatSequence(12345, 10, n)) === JSON.stringify(seq));
check('不同 seed 產生不同的表', JSON.stringify(createThreatSequence(999, 10, n)) !== JSON.stringify(seq));
const dirs = createThreatSequence(777, 10, 2000).map((x) => x.direction);
const leftRatio = dirs.filter((d) => d === 'left').length / dirs.length;
check('左右大致各半(0.45~0.55)', leftRatio > 0.45 && leftRatio < 0.55, leftRatio.toFixed(3));
const rng = createRng(42);
check('createRng 輸出落在 [0,1)', Array.from({ length: 1000 }, rng).every((v) => v >= 0 && v < 1));

// --- 難度感受取樣 ---
console.log('\n各關卡的節奏(反應窗 / 喘息 / 一招週期):');
for (const stage of [1, 5, 15, 30, 45, 60, 120]) {
  console.log(`  第${String(stage).padStart(3)}關  窗 ${reactionWindowMs(stage)}ms  喘息 ${breathMs(stage)}ms  週期 ${reactionWindowMs(stage) + breathMs(stage)}ms`);
}

console.log(fail === 0 ? '\n全部通過' : `\n${fail} 項失敗`);
process.exit(fail === 0 ? 0 : 1);
