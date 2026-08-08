// 教學關(1-1 ~ 1-5)的驗證。
//
// 這一份要守的不是「教學關好不好玩」,而是三件會**安靜地壞掉**的事:
//
//   1. 機制只會增加不會減少 —— 一關拿掉、下一關又冒出來的話,玩家學到的東西會被推翻
//   2. 教學區以外完全不受影響 —— 一個 `stage <= 5` 寫錯邊界就會把整條正式曲線改掉
//   3. **結構保證照樣成立** —— 「每一排都選對就一定過關」在教學關也必須是 100%
//
// 第 3 點是最重要的,而且它是這次改動最容易出事的地方。敵人戰力是 `createRun`
// 逐場模擬「這一場的最佳路線」算出來的,所以拿掉爆發格/裝備閘門/場內技能之後,
// 敵人**應該**自己跟著變低。如果哪一天有人在畫面層偷偷關掉某個機制、卻沒讓
// createRun 知道,這裡就會紅——那正是 CLAUDE.md 記過三次的「兩側必須同時算」。

import {
  createRocks, createRun, isEliteRow, isHeroWaveRow, isTrapGate, doubleGatesForStage,
  runSeconds, rowsForStage, wavesForStage, stageLabel, trapHalveWeightForStage,
  runSkillPicksForStage, enemyPowerRatioForStage, gateWidthForStage, heroWaveEveryForStage,
  WAVES_PER_LEVEL, LONG_LEVEL_WAVES, TARGET_LEVEL_SECONDS,
} from '../game/laneRun';
import {
  MECHANIC_KEYS, TUTORIAL_STAGES, isTutorialStage, tutorialRulesFor,
} from '../game/laneTutorial';
import { pickAccurate, pickBest, simulateRun } from './simRun';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

const SEEDS = Array.from({ length: 24 }, (_, i) => i * 37 + 3);
const TUTORIAL = Array.from({ length: TUTORIAL_STAGES }, (_, i) => i + 1);

// --- 邊界:哪幾關是教學關 ---
check('教學關就是 1-1 ~ 1-5',
  TUTORIAL.every(isTutorialStage) && ![0, 6, 7, 10, 11, 12, 100].some(isTutorialStage),
  TUTORIAL.map(stageLabel).join(' '));
check('壞掉的關卡編號不會被當成教學關',
  !isTutorialStage(NaN) && !isTutorialStage(-1) && !isTutorialStage(Infinity));

// --- 機制階梯:只會增加,不會減少 ---
// 一關拿掉、下一關又冒出來的話,玩家在第 3 關學會的規則會在第 4 關被推翻,
// 而「每一關只多學一件事」正是教學區存在的理由。
{
  const rows = TUTORIAL.map((st) => tutorialRulesFor(st)!);
  const monotonic = MECHANIC_KEYS.every((key) =>
    rows.every((r, i) => i === 0 || !(rows[i - 1][key] === true && r[key] === false)));
  check('機制只會逐關開放,不會又關回去', monotonic);
  const lastRow = rows[rows.length - 1];
  check('最後一關(1-5)全部機制都開了', MECHANIC_KEYS.every((key) => lastRow[key] === true));
  // 一次開放兩三種的話,玩家又回到「同時要學好幾件事」——那正是這張表要解決的問題。
  // 石頭與勇者波是刻意成對的(兩個教的是同一件事:閃開,不是選擇),所以上限是 2。
  const added = rows.map((r, i) =>
    i === 0 ? 0 : MECHANIC_KEYS.filter((k) => r[k] === true && rows[i - 1][k] === false).length);
  check('每一關最多只新增兩種機制', added.every((n) => n <= 2), `逐關新增 ${added.join('/')}`);
  check('每一關都有教學文案',
    rows.every((r) => r.title.length > 0 && r.lesson.length > 0 && r.tip.length > 0));
}

// --- 產生出來的跑圖真的照著規則長 ---
// 上面驗的是那張表,這裡驗的是**實作真的讀了它**。表對了不代表接線對了,
// 這個專案在「效果算得出來 ≠ 效果有生效」上面摔過(見 CLAUDE.md 金・擴散那條)。
for (const stage of TUTORIAL) {
  const rules = tutorialRulesFor(stage)!;
  const label = stageLabel(stage);

  const gates = SEEDS.flatMap((seed) => createRun(seed, stage)
    .filter((r) => r.nodes[0].kind === 'gate')
    .flatMap((r) => r.nodes.map((n) => n.gate!)));
  const hasGear = gates.some((g) => g.stat === 'gear');
  check(`${label} 裝備閘門${rules.gearGates ? '有' : '沒有'}`, hasGear === rules.gearGates);

  const hasDouble = gates.some((g) => g.op === 'mul' && g.value === 2);
  check(`${label} 爆發格${rules.doubleGates ? '有' : '沒有'}`, hasDouble === rules.doubleGates,
    `doubleGatesForStage=${doubleGatesForStage(stage)}`);

  const hasHalve = gates.some((g) => g.op === 'mul' && g.value === 0.5);
  check(`${label} 腰斬陷阱${rules.halveTrap ? '有' : '沒有'}`, hasHalve === rules.halveTrap,
    `trapHalveWeight=${trapHalveWeightForStage(stage).toFixed(2)}`);

  // 兩格永遠一好一壞。這條在教學關特別要守:1-1 的好格與壞格是同一種 stat,
  // 只差正負號,寫錯的話會出現「兩格都是 +N」——那一排就沒有決策了。
  const rowsOk = SEEDS.every((seed) => createRun(seed, stage)
    .filter((r) => r.nodes[0].kind === 'gate')
    .every((r) => r.nodes.filter((n) => isTrapGate(n.gate!)).length === 1));
  check(`${label} 每一排閘門仍然一好一壞`, rowsOk);

  const rockCount = SEEDS.reduce((n, seed) => n + createRocks(seed, stage).length, 0);
  check(`${label} 石頭${rules.rocks ? '有' : '沒有'}`, (rockCount > 0) === rules.rocks,
    `${SEEDS.length} 場共 ${rockCount} 顆`);

  const rowIndexes = Array.from({ length: rowsForStage(stage) }, (_, i) => i);
  const heroWaves = rowIndexes.filter((i) => isHeroWaveRow(stage, i)).length;
  check(`${label} 勇者波${rules.heroWaves ? '有' : '沒有'}`, (heroWaves > 0) === rules.heroWaves,
    `${heroWaves} 波`);

  const elites = rowIndexes.filter((i) => isEliteRow(stage, i)).length;
  check(`${label} 精英${rules.elites ? '有' : '沒有'}`, (elites > 0) === rules.elites, `${elites} 隻`);

  const picks = rowIndexes.reduce((n, _, w) =>
    w < wavesForStage(stage) ? n + runSkillPicksForStage(stage, w, wavesForStage(stage)) : n, 0);
  check(`${label} 場內技能${rules.runSkills ? '有' : '沒有'}`, (picks > 0) === rules.runSkills,
    `${picks} 次選擇`);
}

// --- 關卡長度:短的是關卡,不是節奏 ---
// 波數縮短的同時秒數要跟著縮,不然每一波的戰鬥段會被拉長成兩倍(關卡總長沒變,
// 只是怪衝過來的路變遠),那比原本更難熬。
console.log('\n教學關的長度:');
console.log('   關卡   波數    秒數   每波秒數   容錯係數');
for (const stage of [...TUTORIAL, 6, 10]) {
  const waves = wavesForStage(stage);
  console.log(`  ${stageLabel(stage).padStart(5)}  ${String(waves).padStart(4)}  `
    + `${runSeconds(stage).toFixed(0).padStart(6)}s  ${(runSeconds(stage) / waves).toFixed(1).padStart(7)}s  `
    + `${enemyPowerRatioForStage(stage).toFixed(3).padStart(9)}`);
}
{
  const perWave = [...TUTORIAL, 6, 10].map((st) => runSeconds(st) / wavesForStage(st));
  const spread = Math.max(...perWave) / Math.min(...perWave);
  check('每一波的秒數在教學關與正式關是同一個節奏(差不到 1.3 倍)', spread < 1.3,
    `${Math.min(...perWave).toFixed(1)}~${Math.max(...perWave).toFixed(1)} 秒`);
  // 1-1 要短。三分鐘的「+1 還是 -1」是在等它結束,不是在學東西。
  check('1-1 兩分鐘以內跑得完', runSeconds(1) <= 120, `${runSeconds(1).toFixed(0)} 秒`);
  check('教學關越後面越長(1-5 是畢業考,也是第一個加倍長的小關)', (() => {
    const secs = TUTORIAL.map(runSeconds);
    return secs.every((v, i) => i === 0 || v > secs[i - 1]);
  })(), TUTORIAL.map((st) => `${runSeconds(st).toFixed(0)}s`).join(' → '));
  check('1-5 照通則是加倍長的小關',
    wavesForStage(5) === LONG_LEVEL_WAVES && runSeconds(5) > runSeconds(4) * 1.5);
  check('1-4 已經是正式的長度(畢業前先跑一次完整的小關)',
    wavesForStage(4) === WAVES_PER_LEVEL
    && Math.abs(runSeconds(4) - TARGET_LEVEL_SECONDS) / TARGET_LEVEL_SECONDS < 0.15,
    `${runSeconds(4).toFixed(0)}s vs 目標 ${TARGET_LEVEL_SECONDS}s`);
}

// --- 結構保證:教學關也是「選對就一定過」 ---
// 這是全檔最重要的一項。敵人是照這一場的最佳路線算的,所以拿掉機制之後敵人**應該**
// 自己變低;如果有任何一個機制只在玩家側被拿掉、理想路線那邊照算,這裡會立刻紅。
{
  const perfect = TUTORIAL.map((stage) =>
    SEEDS.filter((seed) => simulateRun(seed, stage, pickBest).outcome === 'cleared').length / SEEDS.length);
  check('教學關「每一排都挑最好」100% 過關(結構保證)',
    perfect.every((p) => p === 1),
    TUTORIAL.map((st, i) => `${stageLabel(st)} ${(perfect[i] * 100).toFixed(0)}%`).join(' '));
}

// --- 教學關要真的好上手 ---
console.log('\n準確率 -> 過關率(教學關):');
console.log('            100%   90%   80%   70%   50%');
const accuracies = [1, 0.9, 0.8, 0.7, 0.5];
/** 準確率 p 的玩家過得了這一關的比例。sweep 跟著準確率走(拉不準的人也掃不滿整條跑道)。 */
function clearRate(stage: number, p: number): number {
  return SEEDS.filter((seed) => simulateRun(seed, stage, pickAccurate(p), { sloppy: 0.1, sweep: p })
    .outcome === 'cleared').length / SEEDS.length;
}
const clearRates = new Map<number, number[]>();
for (const stage of TUTORIAL) {
  const row = accuracies.map((p) => clearRate(stage, p));
  clearRates.set(stage, row);
  console.log(`  ${stageLabel(stage).padStart(8)}  `
    + row.map((v) => `${(v * 100).toFixed(0).padStart(4)}%`).join('  '));
}
// 「一半的閘門選錯」在正式關卡是必死(每格好壞差 2.6 倍,複利),在 1-1 不該是。
// 第一關的功能是讓玩家學會操作,不是篩掉他。
check('1-1 就算只挑對一半也過得去', clearRates.get(1)![4] >= 0.5,
  `50% 準確率 → ${(clearRates.get(1)![4] * 100).toFixed(0)}% 過關`);
// 教學關(1-1 ~ 1-4)是在**教**,不是在篩人:拉得準的人不該被卡住。
check('教學關 1-1~1-4 在 90% 準確率下幾乎一定過',
  [1, 2, 3, 4].every((st) => clearRates.get(st)![1] >= 0.9),
  [1, 2, 3, 4].map((st) => `${stageLabel(st)} ${(clearRates.get(st)![1] * 100).toFixed(0)}%`).join(' '));
// 1-5 是畢業考,標準另外訂:它有兩倍的波數,而失誤是複利的,所以同樣的體感需要
// 完全不同的容錯係數(見 laneTutorial 的 enemyPowerRatio)。要守的是**它不比畢業之後
// 的第一關(1-6)硬**——畢業考比正課難的話,玩家會在教學區的最後一關卡死。
check('1-5(畢業考)不比 1-6 硬',
  clearRates.get(5)![1] >= 0.6 && clearRates.get(5)![1] >= clearRate(6, 0.9) - 0.05,
  `1-5 ${(clearRates.get(5)![1] * 100).toFixed(0)}% vs 1-6 ${(clearRate(6, 0.9) * 100).toFixed(0)}%(90% 準確率)`);
// 但也不能完全不會死:亂玩要過不了,不然玩家學不到「要認真選」。
check('1-5 亂選過不了(畢業考要有門檻)', clearRates.get(5)![4] <= 0.35,
  `50% 準確率 → ${(clearRates.get(5)![4] * 100).toFixed(0)}% 過關`);
// 難度要往上走,不能中間凹一格——凹進去的那一關會變成「莫名其妙卡住」的地方。
//
// **比的是過關率曲線,不是容錯係數。** 係數只有在關卡一樣長的時候才可比:
// 1-5 的係數(0.20)比 1-4(0.28)低,但它有兩倍的波數,實際上更難。
// 拿係數當單調性指標的話,這一項會在「1-5 被正確調鬆」的時候紅,那是完全反過來的訊號。
check('教學關的難度單調上升(比的是過關率,不是容錯係數)', (() => {
  const rates = TUTORIAL.map((st) => clearRates.get(st)![1]);
  return rates.every((v, i) => i === 0 || v <= rates[i - 1] + 1e-9);
})(), TUTORIAL.map((st) => `${(clearRates.get(st)![1] * 100).toFixed(0)}%`).join(' → '));

// --- 教學區以外完全沒被動到 ---
// 一個 `stage <= 5` 寫錯邊界就會把整條正式曲線改掉,而症狀會出現在幾百關之後。
{
  const outside = [6, 7, 9, 10, 11, 12, 15, 20, 40, 100, 500, 1500, 3000];
  check('1-6 之後波數回到通則',
    outside.every((st) =>
      wavesForStage(st) === (st % 10 % 5 === 0 ? LONG_LEVEL_WAVES : WAVES_PER_LEVEL)),
    outside.map((st) => `${stageLabel(st)}:${wavesForStage(st)}`).join(' '));
  check('1-6 之後爆發格回到通則', outside.every((st) => doubleGatesForStage(st) >= 1));
  check('1-6 之後腰斬陷阱回到通則', outside.every((st) => trapHalveWeightForStage(st) >= 0.45));
  check('1-6 之後石頭回到通則',
    outside.every((st) => SEEDS.some((seed) => createRocks(seed, st).length > 0)));
  check('1-6 之後勇者波與精英回到通則',
    outside.every((st) => {
      const idx = Array.from({ length: rowsForStage(st) }, (_, i) => i);
      return idx.some((i) => isHeroWaveRow(st, i)) && idx.some((i) => isEliteRow(st, i));
    }));
  check('1-6 之後場內技能回到通則',
    outside.every((st) => runSkillPicksForStage(st, 0, wavesForStage(st)) > 0));
  // 三顆難度旋鈕跟教學完全無關,教學區不該碰到它們的起點。
  check('教學不影響三顆難度旋鈕的起點',
    gateWidthForStage(6) === gateWidthForStage(1)
    && heroWaveEveryForStage(6) === heroWaveEveryForStage(1),
    '閘門寬與勇者波密度在教學區內外一致');
}

console.log(failed === 0 ? '\n全部通過' : `\n${failed} 項未通過`);
process.exit(failed === 0 ? 0 : 1);
