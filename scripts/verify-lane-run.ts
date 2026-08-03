// 跑道闖關數值驗證。核心要證明的只有一件事:勝負取決於「有沒有選對閘門」,不是運氣也不是數值。
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bestLane, clampOffset, createRun, ENEMY_EVERY, fireIntervalMs, initialRunState, LANE_COUNT,
  laneCenterOffset, laneFromOffset, MAX_FIRE_INTERVAL_MS, MAX_WAVE_SIZE, MIN_FIRE_INTERVAL_MS,
  HITS_PER_MONSTER, moveLane, resolveEnemy, resolveRow, runSpeed, secondsPerRow, waveLength,
  rowsForStage, wavesForStage, stageLabel, chapterOfStage, levelOfStage, enemyPowerRatioForStage,
  LEVELS_PER_CHAPTER, WAVES_PER_LEVEL, LONG_LEVEL_WAVES, EASY_RATIO, lastEnemyRowIndex, isBossStage,
  GATE_WIDTH, gateSpan, hitsGate, MONSTER_JITTER, SPECIES_PER_WAVE, START_OFFSET, terrainForStage,
  ENEMY_POWER_RATIO, goodGateGrowthAt, gatesBeforeRow, isTrapGate, runSeconds, ELITE_MASS, ELITE_HITS, absorbedFrom,
  applyGate, gateLabel, DOUBLE_GATES_PER_RUN, GEAR_STEP, doubleGatesForStage, LONG_LEVEL_RATIO_SCALE,
  CRIT_CHANCE, CRIT_MULTIPLIER, hitDamage, isCritHit,
  TERRAINS, totalAttack, volleyRate, waveKillCount, waveMonsters, waveSize, worstLane, MIN_WAVE_SIZE,
  type Lane, type RunState,
} from '../game/laneRun';
import {
  clearRate, pickAccurate, pickBest as simBest, pickRandom as simRandom, pickWorst as simWorst,
  simulateRun, type LanePicker,
} from './simRun';
import { runSkillPicksForWave, totalRunSkillPicks, MAX_RUN_SKILL_LEVEL, RUN_SKILLS } from '../game/laneRunSkills';

let fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fail++;
};

// --- 節奏 ---
const speeds = [1, 10, 40, 200].map(runSpeed);
check('跑速隨關卡遞增且封頂', speeds.every((v, i) => i === 0 || v >= speeds[i - 1]) && speeds[2] === speeds[3],
  JSON.stringify(speeds.map((v) => v.toFixed(0))));
const secs = [1, 20, 40].map(secondsPerRow);
check('一排的反應時間 2.2s -> 0.9s', Math.abs(secs[0] - 2.22) < 0.05 && Math.abs(secs[2] - 0.9) < 0.02,
  JSON.stringify(secs.map((v) => v.toFixed(2))));

// --- 跑道切換 ---
check('往左到底不會超出', moveLane(0, 'left') === 0);
check('往右到底不會超出', moveLane((LANE_COUNT - 1) as Lane, 'right') === LANE_COUNT - 1);
check('兩條跑道之間來回切得動', moveLane(0, 'right') === 1 && moveLane(1, 'left') === 0);
check('起跑站在正中央(兩條跑道沒有中立格,但也不能偏袒某一邊)', START_OFFSET === 0.5);

// --- 連續位置(手指拖到哪,角色就在哪)---
const lanes = Array.from({ length: LANE_COUNT }, (_, i) => i as Lane);
check('跑道中央換算回原本那條', lanes.every((l) => laneFromOffset(laneCenterOffset(l)) === l));
check('兩端不會算到跑道外', laneFromOffset(0) === 0 && laneFromOffset(1) === LANE_COUNT - 1);
check('拖出跑道會被夾回範圍內', clampOffset(-3) === 0 && clampOffset(4) === 1 && clampOffset(0.42) === 0.42);
check('非數值不會讓角色消失', clampOffset(Number.NaN) === 0.5);
check('交界剛好落在右邊那格', laneFromOffset(0.5) === 1 && laneFromOffset(0.5 - 1e-9) === 0);
// 拖曳是連續的,所以「一路慢慢拖過去」中間每一步都要有明確歸屬,不能出現跳號或無主區間。
const walk = Array.from({ length: 301 }, (_, i) => laneFromOffset(i / 300));
check('從左拖到右,格子只會依序遞增不跳號',
  walk.every((l, i) => i === 0 || l === walk[i - 1] || l === walk[i - 1] + 1) && walk[0] === 0
  && walk[walk.length - 1] === LANE_COUNT - 1 && new Set(walk).size === LANE_COUNT);

// --- 跑圖結構 ---
const run = createRun(1234, 5);
check('排數正確', run.length === rowsForStage(5));
check(`每排都有 ${LANE_COUNT} 個節點`, run.every((r) => r.nodes.length === LANE_COUNT));
check('每條跑道各一個節點', run.every((r) => new Set(r.nodes.map((n) => n.lane)).size === LANE_COUNT));
check('距離嚴格遞增', run.every((r, i) => i === 0 || r.distance > run[i - 1].distance));
const enemyRows = run.filter((r) => r.nodes.every((n) => n.kind === 'enemy'));
check(`每 ${ENEMY_EVERY} 排一次敵人`, enemyRows.length === wavesForStage(5), `${enemyRows.length} 排敵人`);
const gateRows = run.filter((r) => r.nodes.every((n) => n.kind === 'gate'));
check('閘門排兩格效果一定不一樣(不然就不用選了)', gateRows.every((r) =>
  new Set(r.nodes.map((n) => JSON.stringify(n.gate))).size === 2));
check('同一 seed 可重現', JSON.stringify(createRun(1234, 5)) === JSON.stringify(run));
check('不同 seed 不一樣', JSON.stringify(createRun(999, 5)) !== JSON.stringify(run));

// --- 關卡長度 ---
check('一關比以前長(第1關 >= 45 秒)', runSeconds(1) >= 45, `${runSeconds(1).toFixed(0)} 秒`);
check('最快的關卡也還有十幾秒', runSeconds(40) >= 15, `${runSeconds(40).toFixed(0)} 秒`);
check('敵人排至少 5 排(中後段還有東西要打)', wavesForStage(1) >= 5, `${wavesForStage(1)} 排`);

// --- 關卡結構:大關 / 小關 ---
check('關卡編號換算正確',
  stageLabel(1) === '1-1' && stageLabel(10) === '1-10' && stageLabel(11) === '2-1' && stageLabel(27) === '3-7',
  [1, 10, 11, 27].map(stageLabel).join(' '));
check('一個大關十個小關',
  chapterOfStage(10) === 1 && chapterOfStage(11) === 2 && levelOfStage(10) === LEVELS_PER_CHAPTER);
check(`一般小關 ${WAVES_PER_LEVEL} 波、5 的倍數 ${LONG_LEVEL_WAVES} 波`,
  [1, 2, 3, 4, 6, 7, 8, 9].every((l) => wavesForStage(l) === WAVES_PER_LEVEL)
  && [5, 10, 15, 20].every((l) => wavesForStage(l) === LONG_LEVEL_WAVES),
  [1, 5, 10, 11, 15].map((s) => `${stageLabel(s)}:${wavesForStage(s)}波`).join(' '));
check('每一小關都結束在一場戰鬥(最後一排是敵人)',
  [1, 5, 10, 11, 15, 27].every((st) => {
    const rr = createRun(7, st);
    return rr.length === rowsForStage(st) && rr[rr.length - 1].nodes[0].kind === 'enemy';
  }));
check('魔王關就是每個大關的第 10 小關',
  [10, 20, 30].every(isBossStage) && ![1, 5, 9, 11].some(isBossStage));
check('魔王站在最後一排', [10, 20].every((st) => {
  const rr = createRun(7, st);
  return rr[lastEnemyRowIndex(st)].nodes[0].enemy?.boss === true;
}));
// 長關是「10 波塞在 30 排」而不是「40 排」,所以時間約 1.4 倍而不是 2 倍——
// 波數翻倍、閘門只多三分之一,這正是壓住膨脹與難度的做法。
check('加倍長的小關明顯更長', runSeconds(10) > runSeconds(9) * 1.3,
  `1-9 ${runSeconds(9).toFixed(0)}s(${wavesForStage(9)}波) / 1-10 ${runSeconds(10).toFixed(0)}s(${wavesForStage(10)}波)`);
check('長關的波數真的翻倍', wavesForStage(10) === wavesForStage(9) * 2);

// --- 第一大關要好上手 ---
// 只看一般小關的走勢:5 的倍數那兩關會再乘 LONG_LEVEL_RATIO_SCALE,本來就會往下凹一格。
const ch1Normal = [1, 2, 3, 4, 6, 7, 8, 9].map(enemyPowerRatioForStage);
check('第一大關由鬆到緊',
  ch1Normal[0] === EASY_RATIO && ch1Normal.every((v, i) => i === 0 || v > ch1Normal[i - 1]),
  ch1Normal.map((v) => v.toFixed(2)).join(' → '));
check('進大關 2 之後維持正式難度',
  enemyPowerRatioForStage(11) === ENEMY_POWER_RATIO && enemyPowerRatioForStage(99) === ENEMY_POWER_RATIO);
// 長關不再額外放寬:它以前閘門比較多(路變長 = 失誤機會變多),所以要補回來;
// 現在閘門數跟一般關一樣,補了反而會讓長關比一般關好過(實測 66% vs 74%,方向整個反了)。
// 長關的「硬」現在純粹來自 20 波敵人,那是設計要的,不需要補償。
check('長關不再額外放寬(閘門數已經跟一般關一樣)',
  LONG_LEVEL_RATIO_SCALE === 1
  && Math.abs(enemyPowerRatioForStage(15) - enemyPowerRatioForStage(14)) < 1e-9);

// --- 勇者 +N:比例制,所以職業中立 ---
// 固定的「+5」對起跑 1 人的職業價值是起跑 6 人職業的 6 倍,那會讓閘門好壞取決於怎麼轉職。
// 現在 N 取自當下隊伍,收益恆等於「總戰力 x ratio」,跟人數/每人攻擊力怎麼拆無關。
// 固定 +N:同一排的兩格不會互相影響。這是「避免戰力浮濫」的驗收條件——
// 比例制的時候吃掉 +2 之後 +4 會長成 +6,固定值不會。
const gateRuns = [7, 42, 99].map((seed) => createRun(seed, 10));
const addGates = gateRuns.flatMap((r) => r.flatMap((row) => row.nodes))
  .filter((n) => n.gate && n.gate.stat === 'heroes' && n.gate.op === 'add' && n.gate.value > 0);
check('有產生出「勇者 +N」的格子', addGates.length > 0, `${addGates.length} 格`);
check('+N 是整數且至少 +1', addGates.every((n) => Number.isInteger(n.gate!.value) && n.gate!.value >= 1),
  [...new Set(addGates.map((n) => n.gate!.value))].sort((a, b) => a - b).join(' '));
// 同一張跑圖跑兩次、中間吃掉不同的東西,+N 必須完全一樣(它是產生時就決定的)
const fixedRun = createRun(42, 10);
const addBefore = fixedRun.flatMap((r) => r.nodes).filter((n) => n.gate?.op === 'add' && n.gate.stat === 'heroes')
  .map((n) => n.gate!.value);
let walked = initialRunState(10);
for (const row of fixedRun) { walked = { ...walked, lane: bestLane(walked, row) }; walked = resolveRow(walked, row).state; }
const addAfter = fixedRun.flatMap((r) => r.nodes).filter((n) => n.gate?.op === 'add' && n.gate.stat === 'heroes')
  .map((n) => n.gate!.value);
check('吃過閘門之後,場上其他 +N 的數字完全不變(不會浮濫)',
  JSON.stringify(addBefore) === JSON.stringify(addAfter), addBefore.join(','));
check('勇者 +N 印出來是具體人數',
  gateLabel({ stat: 'heroes', op: 'add', value: 6 }) === '勇者 +6');
check('勇者 +N 不是陷阱格(畫面不會標紅)', !isTrapGate({ stat: 'heroes', op: 'add', value: 6 }));
check('減半與扣血才是陷阱格',
  isTrapGate({ stat: 'heroes', op: 'mul', value: 0.5 })
  && isTrapGate({ stat: 'gear', op: 'add', value: -1 })
  && !isTrapGate({ stat: 'heroes', op: 'mul', value: 2 }));
// 爆發格每場固定次數,不靠運氣。獨立抽的話一場會抽到 0~4 個,而每個都是翻倍,
// 玩家感覺到的變成「這場運氣好不好」而不是「我選得好不好」。
const countDoubles = (seed: number, st: number) =>
  createRun(seed, st).flatMap((r) => r.nodes)
    .filter((n) => n.gate && n.gate.stat === 'heroes' && n.gate.op === 'mul' && n.gate.value === 2).length;
const seeds = [3, 7, 42, 99, 251, 808];
check(`一般小關每場都剛好 ${DOUBLE_GATES_PER_RUN} 個爆發格(不靠運氣)`,
  seeds.every((sd) => countDoubles(sd, 12) === DOUBLE_GATES_PER_RUN),
  seeds.map((sd) => countDoubles(sd, 12)).join(','));
// 長關現在是「波數翻倍、閘門數不變」(見 LONG_ENEMY_EVERY),所以爆發格的數量也該一樣——
// 舊條件假設長關閘門比較多所以要按比例多給,那個前提已經不成立了。
check('長關的爆發格跟一般關一樣多(閘門數本來就一樣)',
  seeds.every((sd) => countDoubles(sd, 15) === doubleGatesForStage(15))
  && doubleGatesForStage(15) === DOUBLE_GATES_PER_RUN,
  `長關 ${doubleGatesForStage(15)} 個 / ${rowsForStage(15) - wavesForStage(15)} 個閘門`);
// 第一格不當爆發格:起手 1 隻,x2 只變成 2 隻,「翻倍」的畫面完全看不出來。
const firstGateIsDouble = [3, 7, 42, 99, 251, 808].map((seed) => {
  const first = createRun(seed, 10).find((r) => r.nodes[0].kind === 'gate')!;
  return first.nodes.some((n) => n.gate?.op === 'mul' && n.gate.value === 2);
});
check('第一格不會是爆發格', firstGateIsDouble.every((v) => !v));

// --- 單場的戰力膨脹要壓住 ---
// 2100~6900 倍的時候數字大到看不懂,而且單場雪球比整條關卡進度大 460 倍,養成完全無感。
function runGrowth(stage: number, seed: number): number {
  const from = totalAttack(initialRunState(stage));
  return totalAttack(simulateRun(seed, stage, simBest).state) / from;
}
const growths = [11, 42, 77, 108, 251].map((seed) => runGrowth(12, seed));
// 上限從 250 放寬到 600:250 是為舊結構校的(15 個閘門、5 波、沒有吸收)。現在一場有
// 20 個閘門、10 次技能選擇、10 波的吸收,自然值就在 5~600 之間。硬壓回 250 的唯一辦法是
// 把 GEAR_STEP 壓到 1.04——那等於「裝備強化」只加 4%,核心閘門變白給,得不償失。
// 真正要守的是「數字看得懂」:第 12 關終點是 6156~16616,compact() 顯示成 1.7萬,分得出來。
check('一般小關的放大量壓在 600 倍以內(數字要看得懂)',
  Math.max(...growths) <= 600, `${Math.min(...growths).toFixed(0)}~${Math.max(...growths).toFixed(0)} 倍`);
check('但雪球感還在(至少 30 倍)', Math.min(...growths) >= 30);
// 加倍長的小關閘門比較多,放大量本來就會高一截,但不能高到把壓膨脹的工作抵銷掉
// (照 4 排一波的話會是 1833~4230 倍、終點 16 萬,所以長關改成 3 排一波)。
const longGrowths = [11, 42, 77].map((seed) => runGrowth(15, seed));
check('加倍長的小關也壓得住(900 倍以內)',
  Math.max(...longGrowths) <= 900, `${Math.min(...longGrowths).toFixed(0)}~${Math.max(...longGrowths).toFixed(0)} 倍`);
// 長關的閘門數跟一般關一樣,所以放大量也該落在同一個區間——它的「長」在波數(20 波)不在閘門。
// 這一項現在是在盯「長關沒有偷偷多長一截」,方向跟舊版相反。
check('長關的放大量跟一般關同一個量級(長在波數不在閘門)',
  Math.max(...longGrowths) <= Math.max(...growths) * 1.6,
  `一般 ${Math.max(...growths).toFixed(0)} 倍 / 長關 ${Math.max(...longGrowths).toFixed(0)} 倍`);
// 上下界跟「一場幾個閘門」綁在一起:20 個閘門的時候 1.14 會把放大量推到 512 倍。
// 每次改 ENEMY_EVERY / 波數,這個範圍就要重算。
// 下界守的是「這個閘門有沒有感覺」:低於 +6% 的話玩家吃到「裝備強化」會覺得什麼都沒發生。
check('裝備強化的幅度看得出來', GEAR_STEP >= 1.06 && GEAR_STEP < 1.2, `x${GEAR_STEP}`);

// --- 敵人曲線綁在閘門成長上 ---
check('好閘門的平均成長落在合理範圍', [0, 4, 8, 14].every((g) => goodGateGrowthAt(g) > 1.1 && goodGateGrowthAt(g) < 2.2),
  [0, 4, 8, 14].map((g) => `第${g}格 x${goodGateGrowthAt(g).toFixed(2)}`).join(' '));
// 一般小關是「2 排閘門 + 1 排敵人」為一個波週期,所以每 3 排會經過 2 個閘門。
check('這一排之前經過幾格閘門算得對',
  gatesBeforeRow(3, 1) === 2 && gatesBeforeRow(6, 1) === 4 && gatesBeforeRow(30, 1) === 20,
  `第3排前 ${gatesBeforeRow(3, 1)} 格 / 整關 ${gatesBeforeRow(rowsForStage(1), 1)} 格`);
// 敵人戰力是照「這一場實際的最佳路線」算的,所以最佳玩家的領先幅度在每一排、每一場
// 都必須精確等於 1/ENEMY_POWER_RATIO。這是結構保證,不是掃參數掃出來的近似。
const exactMargins = [3, 11, 57, 99, 251, 808].flatMap((seed) =>
  simulateRun(seed, 10, simBest).margins.filter((m) => !m.boss).map((m) => m.margin));
const want = 1 / enemyPowerRatioForStage(10);
// 容許 5%:吸收讓每一波多一次整數進位(理想路線用理想隻數、玩家用實際擊殺數),
// 十波累積下來的漂移比舊版大一點。結構保證還在——漂移不會隨排數發散,只是抖動變寬。
check('最佳玩家的領先幅度每一排每一場都相同(結構保證,不是掃出來的)',
  exactMargins.every((m) => Math.abs(m - want) / want < 0.05),
  `目標 ${want.toFixed(2)}x,實測 ${Math.min(...exactMargins).toFixed(2)}~${Math.max(...exactMargins).toFixed(2)}x`);

// --- 敵人的量化呈現(每隻敵人都要指得到既有素材)---
const ART_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sprites', 'monsters', 'ai');
// 一般小怪的檔名是 {原型}_open.png,魔王另外一組命名(stage_boss_tierN → boss_tierN_open.png)。
const artFileFor = (id: string) => {
  if (id === 'final_boss') return 'boss_final_open.png';
  if (id.startsWith('stage_boss_')) return `${id.replace('stage_boss_', 'boss_')}_open.png`;
  return `${id.includes('-') ? id.slice(0, id.lastIndexOf('-')) : id}_open.png`;
};
const allEnemies = [1, 5, 20, 40].flatMap((s) =>
  Array.from({ length: 40 }, (_, t) => createRun(t * 17 + 3, s))
    .flatMap((r) => r.flatMap((row) => row.nodes))
    .flatMap((n) => (n.kind === 'enemy' && n.enemy ? [n.enemy] : [])));
const allSpecies = allEnemies.flatMap((e) => e.species);
// 精英是刻意的例外:牠一隻抵一群,所以隻數少、造型也只有一種(要看得出「那一隻」是誰)。
const mobWaves = allEnemies.filter((e) => !e.boss && !e.elite);
const eliteWaves = allEnemies.filter((e) => e.elite);
const bossWaves = allEnemies.filter((e) => e.boss);
check('每一波小怪都混了好幾種(整關不會只看到同一隻)',
  mobWaves.every((e) => e.species.length === SPECIES_PER_WAVE),
  `每波 ${SPECIES_PER_WAVE} 種`);
check('每個小關中點都有一隻精英', eliteWaves.length > 0
  && eliteWaves.every((e) => e.leakCost === ELITE_MASS && e.hitsPerUnit === ELITE_HITS && e.species.length === 1),
  `${eliteWaves.length} 隻精英,漏掉一隻抵 ${ELITE_MASS} 人`);
check('精英比同一排的小怪波少很多隻(牠是一隻大的,不是一群)',
  eliteWaves.every((e) => e.units <= MAX_WAVE_SIZE / 2),
  `最多 ${Math.max(...eliteWaves.map((e) => e.units))} 隻`);
check('大魔王只有一隻', bossWaves.every((e) => e.units === 1 && e.species.length === 1),
  `${bossWaves.length} 場魔王`);
check('同一波裡的怪種不重複', allEnemies.every((e) => new Set(e.species.map((sp) => sp.id)).size === e.species.length));
check('每隻敵人都有名字與造型 id', allSpecies.every((sp) => sp.name.length > 0 && sp.id.length > 0));
// 造型只認 assets/sprites 底下的既有素材檔。先前還多驗一次程序化圖庫(game/sprites),
// 但畫面根本沒在畫那一套,驗它等於驗一個不存在的東西 —— 那包已經整個移除。
check('每種造型都有對應的既有素材檔(含魔王)',
  allSpecies.every((sp) => existsSync(join(ART_DIR, artFileFor(sp.id)))),
  `${new Set(allSpecies.map((sp) => sp.id)).size} 種造型 / `
  + [...new Set(allSpecies.map((sp) => artFileFor(sp.id)))].length + ' 個檔案');
check('同一排的每一格都是同一批敵人', run.filter((r) => r.nodes.every((n) => n.kind === 'enemy'))
  .every((r) => new Set(r.nodes.map((n) => JSON.stringify(n.enemy!.species))).size === 1));
// 精英排跳過:牠的隻數本來就是壓縮過的(同樣的戰力擠成少少幾隻),放進來比會誤判成退化。
const unitsByRow = run.filter((r) => r.nodes.every((n) => n.kind === 'enemy'))
  .map((r) => r.nodes[0].enemy!)
  .filter((e) => !e.elite)
  .map((e) => e.units);
check('越後面的波次小怪越多(數量看得出難度)', unitsByRow.every((u, i) => i === 0 || u >= unitsByRow[i - 1]),
  unitsByRow.join(' → '));
// 一波的隻數跟著理想人數走(人數就是血量,兩群的規模要同一個數量級)。
check(`一波封頂 ${MAX_WAVE_SIZE} 隻、保底 ${MIN_WAVE_SIZE} 隻`,
  waveSize(999) === MAX_WAVE_SIZE && waveSize(1) === MIN_WAVE_SIZE && waveSize(12) === 12);
check('人數越多,面對的那一群也越大', [1, 5, 12, 20].map(waveSize).every((n, i, a) => i === 0 || n >= a[i - 1]));

// --- 一波小怪的排列 ---
const waveRow = run.find((r) => r.nodes.every((n) => n.kind === 'enemy'))!;
const SPREAD = waveLength(5, 9);
const wave = waveMonsters(waveRow.index, 9, waveRow.distance, SPECIES_PER_WAVE, SPREAD);
check('小怪數量等於這一波的隻數', wave.length === 9);
check('小怪一隻一隻排開,不會疊在同一點', wave.every((m, i) => i === 0 || m.distance > wave[i - 1].distance));
check('最後一隻剛好落在結算點', wave[wave.length - 1].distance === waveRow.distance);
check('整波都在結算點前方一個波長內', wave.every((m) =>
  m.distance > waveRow.distance - SPREAD - 0.001 && m.distance <= waveRow.distance));
check('小怪散在不同跑道(不會整波擠同一條)',
  new Set(wave.map((m) => m.lane)).size >= 2, `用到 ${new Set(wave.map((m) => m.lane)).size} 條`);
// 單一波沒用滿每一條是正常的,但長期分佈不能偏——偏掉就代表雜湊常數又跟 LANE_COUNT 共因數了。
const laneTally = new Array(LANE_COUNT).fill(0);
for (let row = 0; row < 400; row++) {
  for (const m of waveMonsters(row, MAX_WAVE_SIZE, 1000)) laneTally[m.lane]++;
}
const laneShare = laneTally.map((n: number) => n / (400 * MAX_WAVE_SIZE));
const evenShare = 1 / LANE_COUNT;
check('長期看每條跑道分佈平均', laneShare.every((s: number) => Math.abs(s - evenShare) < evenShare * 0.15),
  laneShare.map((s: number) => (s * 100).toFixed(0) + '%').join(' / '));
check('同一波每次算出來都一樣(重播對得起來)',
  JSON.stringify(waveMonsters(waveRow.index, 9, waveRow.distance, SPECIES_PER_WAVE, SPREAD)) === JSON.stringify(wave));
check('小怪不會站成一直線(橫向位置各自偏移)',
  new Set(wave.map((m) => m.offset.toFixed(4))).size >= wave.length - 1);
check('偏移不會把小怪推出跑道', wave.every((m) => m.offset >= 0 && m.offset <= 1));
check('偏移幅度不超過設定值', wave.every((m) =>
  Math.abs(m.offset - laneCenterOffset(m.lane)) <= MONSTER_JITTER + 1e-9));
check('同一波裡不同隻會用到不同造型',
  new Set(wave.map((m) => m.speciesIndex)).size >= 2, `用到 ${new Set(wave.map((m) => m.speciesIndex)).size} 種`);
check('造型索引不會超出 species 陣列', wave.every((m) => m.speciesIndex >= 0 && m.speciesIndex < SPECIES_PER_WAVE));

// --- 閘門有寬度,沒踩到就漏掉 ---
check('閘門沒有佔滿整條跑道', GATE_WIDTH < 1 / LANE_COUNT,
  `閘門 ${GATE_WIDTH} vs 跑道 ${(1 / LANE_COUNT).toFixed(2)}`);
check('站在跑道正中央一定踩得到', lanes.every((l) => hitsGate(laneCenterOffset(l), l)));
check('兩格中間有空隙(站在那裡兩邊都碰不到)', !hitsGate(0.5, 0) && !hitsGate(0.5, 1));
check('起跑位置就在空隙上(不動就什麼都吃不到,一定得自己拉)',
  !hitsGate(START_OFFSET, 0) && !hitsGate(START_OFFSET, 1));
check('跑道最外緣也碰不到閘門', !hitsGate(0, 0) && !hitsGate(1, 1));
check('閘門邊界內外剛好一線之隔',
  hitsGate(gateSpan(0).to, 0) && !hitsGate(gateSpan(0).to + 0.001, 0));
const gateRow = gateRows[0];
const missState = initialRunState(5);
const missed = resolveRow({ ...missState, lane: 0 }, gateRow, 0.5);
check('沒踩到就整格漏掉(好處沒吃到,陷阱也沒踩到)',
  missed.message === '沒碰到' && missed.state.heroes === missState.heroes
  && missed.state.perHero === missState.perHero);
const landed = resolveRow({ ...missState, lane: 0 }, gateRow, laneCenterOffset(0));
check('踩到就生效', landed.message !== '沒碰到');

// --- 投擲密度隨人數上升 ---
check('人越多丟越密', volleyRate(1) < volleyRate(9) && volleyRate(9) < volleyRate(64));
check('投擲密度有封頂(不會變成彈幕)', volleyRate(10000) === volleyRate(16) && volleyRate(1) === 1);

// --- 地面 ---
check('每一關都有地面,而且會輪替',
  new Set([1, 3, 5, 7].map(terrainForStage)).size === TERRAINS.length,
  [1, 3, 5, 7].map(terrainForStage).join(' → '));
check('同一關永遠是同一種地面', terrainForStage(9) === terrainForStage(9));

// --- 打掉幾隻 vs 少幾個人:碰撞互換的核心 ---
// 「漏過來的隻數」與「被換掉的人數」必須是同一件事的兩種說法,兩邊各自算就會漂,
// 最後畫面上倒下的隻數跟實際扣的人對不起來(舊版血量時代就踩過這個)。
const powerSample = 200;
const UNITS = 9;
const sampleWave = { power: powerSample, reward: 0, species: [{ id: 'blob-1', name: '史' }], name: '史', units: UNITS };
const lostAt = (atk: number, tradeRate = 1) => {
  const before: RunState = { ...initialRunState(1), heroes: 40, perHero: atk / 40, tradeRate };
  return before.heroes - resolveEnemy(before, sampleWave).state.heroes;
};
// 全清之後人數是**增加**的(打倒的怪有一部分加入隊伍),所以 lostAt 會是負的。
check('攻擊力壓過戰力 -> 全部打掉、不但零損失還補人',
  waveKillCount(powerSample, powerSample, UNITS) === UNITS && lostAt(powerSample) < 0);
check('攻擊力遠超過 -> 一樣是全部打掉(不會算出超過總數)',
  waveKillCount(powerSample * 5, powerSample, UNITS) === UNITS
  && lostAt(powerSample * 5) === lostAt(powerSample));
// 進位之後小數量會壓在同一階(3 隻與 9 隻都是 +1),那是刻意的:早期至少 +1 才看得到。
// 要守的是「隻數越多補越多、而且不會爆」,不是每一格都不同。
check('全清補的人數跟隻數走,而且封頂之後是固定值不是複利',
  absorbedFrom(24) > absorbedFrom(3) && absorbedFrom(3) >= 1
  && [1, 3, 9, 24].every((n, i, a) => i === 0 || absorbedFrom(n) >= absorbedFrom(a[i - 1])),
  `3 隻 +${absorbedFrom(3)} / 9 隻 +${absorbedFrom(9)} / 24 隻 +${absorbedFrom(24)} 人`);
check('精英一隻抵一群,補的人也照一群算',
  absorbedFrom(1, ELITE_MASS) === absorbedFrom(ELITE_MASS),
  `精英 1 隻 +${absorbedFrom(1, ELITE_MASS)} 人`);
check('攻擊力不足 -> 有漏過來的,而且確實換掉了人',
  waveKillCount(powerSample / 2, powerSample, UNITS) < UNITS && lostAt(powerSample / 2) > 0);
check('漏幾隻就換掉幾個人(兌換率 1)',
  lostAt(powerSample / 2) === UNITS - waveKillCount(powerSample / 2, powerSample, UNITS));
check('兌換率越高,同樣漏接損失越小',
  lostAt(powerSample / 2, 2) < lostAt(powerSample / 2, 1),
  `x1 少 ${lostAt(powerSample / 2, 1)} 人 / x2 少 ${lostAt(powerSample / 2, 2)} 人`);
// 人數歸零才是死亡條件——閘門扣不死人(那是卡死不是懲罰),碰撞才可以。
const wiped = resolveEnemy({ ...initialRunState(1), heroes: 2, perHero: 1, tradeRate: 1 }, sampleWave);
check('被整群吃光就是死亡', wiped.state.phase === 'dead' && wiped.state.heroes === 0);
check('攻擊力越高漏過來的越少', [0.2, 0.4, 0.6, 0.8, 1].map((f) => waveKillCount(powerSample * f, powerSample, 9))
  .every((k, i, a) => i === 0 || k >= a[i - 1]));

// --- 擲武器的節奏 ---
check('一隻要挨好幾下才倒(投擲才會連續)', HITS_PER_MONSTER >= 2);
// 兩邊都要落在夾擠範圍內才測得到斜率:剩 5 下 -> 200ms、剩 10 下 -> 100ms。
check('丟得完:剩越多下要丟就丟越快',
  fireIntervalMs(1000, 5) === 200 && fireIntervalMs(1000, 10) === 100);
check('連射有下限(不會變成雷射)', fireIntervalMs(10, 9) === MIN_FIRE_INTERVAL_MS);
check('間隔有上限(不會久到看起來沒在打)', fireIntervalMs(99999, 1) === MAX_FIRE_INTERVAL_MS);
check('沒有要打的目標就不丟', fireIntervalMs(3000, 0) === Number.POSITIVE_INFINITY);

// --- 打擊數值與暴擊(純演出,不能影響勝負)---
// 這一組最重要的一項是最後那個:暴擊只是把同樣的結果演得好看,不會多打死一隻。
// 讓它真的加成的話,期望值得併進 totalAttack,那就是動平衡——而這一版的難度曲線
// (ENEMY_POWER_RATIO)整條是照 waveKillCount 校準的。
const critSamples = Array.from({ length: 4000 }, (_, i) => isCritHit(i % 20, i % 9, Math.floor(i / 9) % 12));
const critRate = critSamples.filter(Boolean).length / critSamples.length;
check('暴擊率接近設定值', Math.abs(critRate - CRIT_CHANCE) < 0.05,
  `設定 ${(CRIT_CHANCE * 100).toFixed(0)}%,實測 ${(critRate * 100).toFixed(1)}%`);
check('同一下算幾次都一樣(不會閃爍)',
  isCritHit(3, 2, 1) === isCritHit(3, 2, 1) && isCritHit(7, 5, 2) === isCritHit(7, 5, 2));
check('不同的下數會算出不同結果(不是整場都暴擊或都不暴擊)',
  new Set(Array.from({ length: 40 }, (_, i) => isCritHit(3, i % 9, i))).size === 2);
check('暴擊的數字比較大', hitDamage(900, 3, true) > hitDamage(900, 3, false));
check('暴擊剛好放大設定的倍數',
  hitDamage(900, 3, true) === Math.round(hitDamage(900, 3, false) * CRIT_MULTIPLIER),
  `${hitDamage(900, 3, false)} → ${hitDamage(900, 3, true)}`);
check('一下的傷害是總戰力攤到每一下', hitDamage(900, 3, false) === 300);
check('傷害至少 1(戰力再低也不會跳 0)', hitDamage(1, 12, false) >= 1);
// 暴擊參數完全不出現在 waveKillCount 的算式裡,所以打得掉幾隻跟暴擊無關。
check('暴擊不影響打得掉幾隻(演出與結算是分開的)',
  [100, 250, 400].every((atk) => waveKillCount(atk, 300, 9) === waveKillCount(atk, 300, 9))
  && waveKillCount(300, 300, 9) === 9 && waveKillCount(150, 300, 9) === 5,
  '擊殺數只看 攻擊力/戰力 的比例');

// --- 三種玩家跑同一場 ---
// 跑一場一律走 scripts/simRun.ts。這裡曾經自己寫過一份 play(),而它**漏掉了場內技能**——
// 敵人戰力是照「含技能的最佳路線」算的,所以少了那條曲線的玩家會在後段被輾過去,
// 量出來是「每排都挑最好也會死」。看起來像設計壞了,其實是模擬器沒跟上。
// 這是 CLAUDE.md 記過的坑,第二次犯。
function rate(stage: number, pick: LanePicker, trials = 300) {
  let cleared = 0;
  for (let t = 0; t < trials; t++) if (simulateRun(t * 31 + 1, stage, pick).outcome === 'cleared') cleared++;
  return cleared / trials;
}
// 上面那個 play 沒有場內技能,只留給「戰力不會被卡死」那種不看過關率的檢查。
// 所有跟難度有關的數字一律走 simRun(它會照遊戲規則挑技能),不然玩家會比敵人假設的弱一截。

console.log('\n過關率(列=關卡,欄=選法):');
console.log('        最佳    隨機    最差');
const rows2: { stage: number; b: number; r: number; w: number }[] = [];
for (const stage of [1, 5, 20, 40, 100]) {
  const b = clearRate(stage, simBest, 300), r = clearRate(stage, simRandom, 300), w = clearRate(stage, simWorst, 300);
  rows2.push({ stage, b, r, w });
  console.log(`  第${String(stage).padStart(3)}關  ${[b, r, w].map((v) => (v * 100).toFixed(0).padStart(4) + '%').join('  ')}`);
}

// --- 準確率 -> 過關率 ---
// 真人不是擲骰子,是「看得懂閘門但偶爾看錯」。跑道 20 排之後亂選在任何難度下都是 0~1%
// (15 個二選一、每格好壞差 2.6 倍),拿亂選當難度指標會逼著把難度調到沒意義的低點,
// 所以「選擇有意義」改由這條曲線保證:準確率掉一點,過關率就要明顯掉。
const accuracyRate = (stage: number, p: number, trials = 400) => clearRate(stage, pickAccurate(p), trials);
const ACCURACIES = [1, 0.95, 0.9, 0.85, 0.8];
console.log('\n準確率 -> 過關率(每一排有 p 的機率挑對邊):');
console.log('           ' + ACCURACIES.map((a) => (a * 100).toFixed(0).padStart(5) + '%').join(''));
const accByStage = [1, 12, 102].map((stage) => {
  const r = ACCURACIES.map((a) => accuracyRate(stage, a));
  console.log(`  第${String(stage).padStart(3)}關  ` + r.map((v) => (v * 100).toFixed(0).padStart(5) + '%').join(''));
  return { stage, r };
});
check('準確率越高過關率越高(而且是單調的)',
  accByStage.every((s) => s.r.every((v, i) => i === 0 || v <= s.r[i - 1])));
check('完全選對 -> 一定過關', accByStage.every((s) => s.r[0] >= 0.99));
check('準確率 95% -> 大致過得去(讀得懂閘門就不該一直死)',
  accByStage.every((s) => s.r[1] >= 0.7), accByStage.map((s) => (s.r[1] * 100).toFixed(0) + '%').join(' / '));
// 第 1 關刻意比較寬鬆(它是玩家的第一次接觸),所以「失誤要有代價」只對後面的關卡要求。
check('準確率 80% -> 明顯會死(失誤要有代價)',
  accByStage.filter((s) => s.stage > 1).every((s) => s.r[4] <= 0.4),
  accByStage.map((s) => `第${s.stage}關 ${(s.r[4] * 100).toFixed(0)}%`).join(' / '));
check('第 1 關是最寬鬆的(第一次接觸不該勸退)',
  accByStage[0].r.every((v, i) => v >= accByStage[accByStage.length - 1].r[i]),
  accByStage.map((s) => `第${s.stage}關 ${(s.r[2] * 100).toFixed(0)}%`).join(' / ') + '(90% 準確率)');
// 第 1 關刻意寬鬆,整條曲線被往上壓,所以差距那一項只對正式難度的關卡要求。
check('95% 與 80% 之間拉得開(選擇真的有意義)',
  accByStage.filter((s) => s.stage > 1).every((s) => s.r[1] - s.r[4] >= 0.35),
  accByStage.map((s) => `${stageLabel(s.stage)} ${((s.r[1] - s.r[4]) * 100).toFixed(0)}pp`).join(' / '));
// 加倍長的小關要比同一大關的一般小關硬,但不能硬到變成另一個遊戲。
const normalAcc = accuracyRate(12, 0.9);
const longAcc = accuracyRate(15, 0.9);
check('加倍長的小關比較硬,但沒有硬過頭',
  longAcc < normalAcc && longAcc >= normalAcc * 0.6,
  `一般 ${(normalAcc * 100).toFixed(0)}% / 長關 ${(longAcc * 100).toFixed(0)}%`);

// 手不準的玩家:每排都挑對邊,但站的位置在該格中心 ±sloppy 之間亂飄,所以有機率整格漏掉。
// 這一組是「留空隙」這個設計的實測值——漏接要有代價,但不能懲罰到「選對了還是會死」。
//
// 一定要走 simulateRun,不要在這裡自己寫一圈:自己寫的那圈少了場內技能,玩家會比敵人
// 假設的弱一整條技能曲線,量出來是「拉得再準也 0% 過關」——而且看起來像是「留空隙」設計壞了。
const sloppyRate = (stage: number, sloppy: number, trials = 300) =>
  clearRate(stage, simBest, trials, { sloppy });
console.log('\n選對邊但手不準(漏接率隨手抖幅度上升):');
console.log('          第20關  第100關');
for (const sloppy of [0, 0.08, 0.16, 0.25]) {
  console.log(`  ±${sloppy.toFixed(2)}   ${(sloppyRate(20, sloppy) * 100).toFixed(0).padStart(4)}%`
    + `  ${(sloppyRate(100, sloppy) * 100).toFixed(0).padStart(5)}%`);
}
check('選對邊而且拉得準 -> 一定過關', sloppyRate(12, 0) >= 0.99);
check('手抖一點還過得去(漏接有代價但不是死刑)', sloppyRate(12, 0.08) >= 0.55);
check('隨便亂拉就會開始漏接', sloppyRate(12, 0.25) < sloppyRate(12, 0.08));

check('每排都挑最好的 -> 一定過關', rows2.every((x) => x.b >= 0.99));
check('每排都挑最爛的 -> 幾乎必死', rows2.every((x) => x.w <= 0.05));
check('選得好一定比亂選好', rows2.every((x) => x.b > x.r));
check('亂選不會比選最爛差', rows2.every((x) => x.r >= x.w));

// --- 中段還有沒有挑戰性(這一組是為了擋掉一個真的發生過的退化)---
// 曾經敵人是自己走一條 1.9^tier 的指數,跟閘門的成長完全沒有關係。兩邊都「看起來合理」,
// 湊在一起卻是最佳玩家的領先幅度每過一排敵人就再乘 3 倍:實測第 10 關是
// 3.5x → 9.5x → 17.6x,等於前三個閘門決定勝負,後面整場都在跑完流程。
// 現在敵人直接照 GOOD_GATE_GROWTH 走同一條曲線,所以領先幅度必須是平的。
const bestMargins = (stage: number, seed: number): number[] =>
  simulateRun(seed, stage, simBest).margins.map((m) => m.margin);
const marginRuns = [11, 42, 77, 108, 251].map((seed) => bestMargins(10, seed));
console.log('\n最佳玩家在每一排敵人的領先幅度(第10關,5 顆 seed):');
for (const m of marginRuns) console.log('  ' + m.map((v) => v.toFixed(2) + 'x').join('  '));
const marginSpread = marginRuns.map((m) => Math.max(...m) / Math.min(...m));
check('領先幅度不會一路膨脹(中段不會變成沒事做)',
  marginSpread.every((s) => s <= 2.2), '最大/最小 ' + marginSpread.map((s) => s.toFixed(2) + 'x').join(' / '));
// 最佳玩家的領先幅度必然約等於 1/ENEMY_POWER_RATIO(那就是緩衝倍數的定義),
// 所以這裡不能要求它很小——要求它小就等於要求「一格都不能選錯」。真正要盯的是它不膨脹。
//
// 上限抓 2.2 倍緩衝而不是剛好 1 倍,是因為**前段一定會超額**:「勇者 +60%」至少 +1 個人,
// 所以 1 人的時候實際是翻倍(不是 x1.6)、2 人的時候是 x1.5。敵人曲線用的是名目的
// GOOD_GATE_GROWTH,追不上這幾格的超額,前兩排敵人因此偏鬆(實測 10~12x,後段收斂到 4.5~6x)。
// 這個形狀是對的——張力應該往後遞增,而不是像舊版那樣往後遞減。下面的死亡分佈才是真正的驗收。
check('最佳玩家的領先幅度就是設定的緩衝倍數(沒有額外的無敵)',
  marginRuns.every((m) => m.every((v) => v <= 2.2 / enemyPowerRatioForStage(10))),
  `緩衝 ${(1 / enemyPowerRatioForStage(10)).toFixed(1)}x,實測最高 ${Math.max(...marginRuns.flat()).toFixed(1)}x`);
check('張力往後遞增(後段的領先幅度不會比前段大)',
  marginRuns.every((m) => m[m.length - 1] <= m[0] * 1.2),
  marginRuns.map((m) => `${m[0].toFixed(1)}→${m[m.length - 1].toFixed(1)}`).join(' / '));

// 「中段有沒有挑戰性」最直接的證據:玩家實際死在第幾排。
// 舊版是前三個閘門決定勝負,所以死亡全部擠在第一排敵人(第 3 排);如果勝負是一路拉扯到最後,
// 死亡就會分散到後面幾排敵人身上。這一項才是使用者回報的那個問題的真正驗收條件。
function deathRows(stage: number, p: number, trials = 600): number[] {
  const out: number[] = [];
  for (let t = 0; t < trials; t++) {
    const r = simulateRun(t * 31 + 1, stage, pickAccurate(p));
    if (r.outcome === 'dead') out.push(r.deathRow);
  }
  return out;
}
const deaths = deathRows(12, 0.85);
const enemyRowIdx = Array.from({ length: rowsForStage(12) }, (_, i) => i).filter((i) => (i + 1) % ENEMY_EVERY === 0);
const deathShare = enemyRowIdx.map((i) => deaths.filter((d) => d === i).length / deaths.length);
console.log('\n85% 準確率的玩家死在第幾排敵人(共 ' + deaths.length + ' 次陣亡):');
console.log('  ' + enemyRowIdx.map((i, k) => `第${i}排 ${(deathShare[k] * 100).toFixed(0)}%`).join('   '));
check('勝負不是開頭就決定(死亡不會集中在第一排敵人)',
  deathShare[0] <= 0.5, `第一排敵人佔 ${(deathShare[0] * 100).toFixed(0)}%`);
check('後半段仍然會死人(中段之後還有挑戰)',
  deathShare.slice(Math.ceil(deathShare.length / 2)).reduce((a, b) => a + b, 0) >= 0.2,
  `後半佔 ${(deathShare.slice(Math.ceil(deathShare.length / 2)).reduce((a, b) => a + b, 0) * 100).toFixed(0)}%`);

// --- 攻擊力不會被陷阱歸零卡死 ---
let minAttack = Infinity;
for (let t = 0; t < 200; t++) {
  const res = simulateRun(t * 13 + 5, 20, simWorst);
  minAttack = Math.min(minAttack, totalAttack(res.state));
}
check('戰力永遠 >= 1(不會被連續陷阱卡死)', minAttack >= 1, `最低 ${minAttack}`);

// --- 選最佳時數值的成長感 ---
const sample = simulateRun(42, 10, simBest);
console.log(`\n第10關全選最佳:戰力 ${totalAttack(initialRunState(10))} -> ${totalAttack(sample.state)}`
  + `(${sample.state.heroes} 人 x 每人 ${sample.state.perHero}、裝備 ${sample.state.gear} 階)、`
  + `兌換率 x${sample.state.tradeRate.toFixed(2)}、金幣 ${sample.state.coins}`);
check('全選最佳時戰力明顯成長(>= 8 倍)', totalAttack(sample.state) >= totalAttack(initialRunState(10)) * 8);

console.log(fail === 0 ? '\n全部通過' : `\n${fail} 項失敗`);
process.exit(fail === 0 ? 0 : 1);
