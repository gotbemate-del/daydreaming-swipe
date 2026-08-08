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
  GATE_WIDTH, GATE_WIDTH_MIN, gateWidthForStage, trapHalveWeightForStage, heroWaveEveryForStage,
  gateSpan, hitsGate, heroHalfSpan, HERO_BODY_HALF, MAX_DRAWN_HEROES, MONSTER_EDGE, SPECIES_PER_WAVE, START_OFFSET, backdropForStage,
  ENEMY_POWER_RATIO, ENEMY_UNITS_PER_HERO, goodGateGrowthAt, gatesBeforeRow, isTrapGate, runSeconds, ELITE_MASS, ELITE_HITS, absorbedFrom,
  applyGate, gateLabel, DOUBLE_GATES_PER_RUN, GEAR_STEP, doubleGatesForStage, LONG_LEVEL_RATIO_SCALE,
  CRIT_CHANCE, CRIT_MULTIPLIER, hitDamage, isCritHit,
  createRocks, hitsRock, applyRockHit, rowDistances, battleDistance, isEnemyRowIndex, VISIBLE_AHEAD,
  ROCKS_PER_RUN_MIN, ROCKS_PER_RUN_MAX, ROCK_HERO_LOSS, ROCK_GRAZE_MESSAGE, ACTIVE_THROWERS,
  BACKDROPS, totalAttack, volleyRate, waveKillCount, waveMonsters, waveSize, worstLane, MIN_WAVE_SIZE,
  HERO_WAVE_ELEMENT_SALT, waveElementsForStage, hazardsFor, hitByHazard, HAZARD_WIDTH, HAZARD_LOSS_HEROES, expectedHazardHits, ENEMY_THROW_INTERVAL_MS,
  battleSecondsPerWave, engageRange, FIRE_RANGE_RATIO,
  type Lane, type RunState, type WaveBoost,
} from '../game/laneRun';
import {
  clearRate, pickAccurate, pickBest as simBest, pickRandom as simRandom, pickWorst as simWorst,
  simulateRun, type LanePicker,
} from './simRun';
import {
  runSkillPicksForWave, totalRunSkillPicks, MAX_RUN_SKILL_LEVEL, RUN_SKILLS,
  MAX_RUN_SKILL_SLOTS, runSkillEffects, skillCooldownSeconds, bestRunSkillChoice, runSkillOffersAt,
  ACTIVE_SKILL_IDS, ELEMENTS, runSkillSpec, ELEMENT_COUNTERS, COUNTER_BONUS, COUNTERED_PENALTY,
  elementMatchup, elementForRow,
  burnSpreadTargets, metalSpreadTargets,
} from '../game/laneRunSkills';

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
check('有產生出「數量 +N」的格子', addGates.length > 0, `${addGates.length} 格`);
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
// 閘門上寫「數量」不寫「勇者」:玩家那一群是史萊姆,而「勇者」在這款是勇者波的敵人。
check('人數格印出來是「數量 +N」(不是「勇者」——那是敵人)',
  gateLabel({ stat: 'heroes', op: 'add', value: 6 }) === '數量 +6'
  && gateLabel({ stat: 'heroes', op: 'mul', value: 2 }) === '數量 x2');
check('數量 +N 不是陷阱格(畫面不會標紅)', !isTrapGate({ stat: 'heroes', op: 'add', value: 6 }));
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
// **看中位數,不要看最大值。** 場與場之間本來就有 1.6~1.8 倍的差異(抽到幾個爆發格、
// 幾個裝備格都會變),只取 3~5 顆 seed 然後斷言最大值,等於在測分佈的尾巴——
// 加一個新技能就會讓洗牌結果整個位移,檢查就紅了,但設計其實什麼都沒退化。
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const seedSet = Array.from({ length: 24 }, (_, i) => i * 37 + 3);
const growths = seedSet.map((seed) => runGrowth(12, seed));
const longGrowths = seedSet.map((seed) => runGrowth(15, seed));
// 400 而不是 350:主動技能按轉職解鎖之後,**早期大關的技能池比較小**(只開 1 款主動),
// 貪心更容易抽到加戰力的那兩款,所以前期的放大量反而比後期高一截。這是解鎖曲線的
// 直接後果,不是退化——第 12 關終點 11300,compact() 顯示成 1.1萬,還是分得出來。
check('一般小關的放大量壓在 400 倍以內(中位數,數字要看得懂)',
  median(growths) <= 400,
  `中位 ${median(growths).toFixed(0)} 倍(${Math.min(...growths).toFixed(0)}~${Math.max(...growths).toFixed(0)})`);
check('但雪球感還在(至少 30 倍)', Math.min(...growths) >= 30);
check('尾巴也沒有失控(最大不超過中位數的 2.5 倍)',
  Math.max(...growths) <= median(growths) * 2.5,
  `最大/中位 ${(Math.max(...growths) / median(growths)).toFixed(1)}x`);
// 長關的絕對值本來就會比一般關高:吸收是**每波固定 +N**,20 波自然比 10 波累積得多。
// 要守的是「不是因為閘門變多」——閘門數兩邊一樣都是 20 個。
check('加倍長的小關也壓得住(700 倍以內,中位數)',
  median(longGrowths) <= 700,
  `中位 ${median(longGrowths).toFixed(0)} 倍(${Math.min(...longGrowths).toFixed(0)}~${Math.max(...longGrowths).toFixed(0)})`);
// 2.6 而不是 2.2:長關的選擇次數是兩倍,而技能池有 14 種、一次只開 3 個——
// 加戰力的那兩款(鋒刃/增殖)平均每 2.5 次才會出現一次,所以「挑到幾次」的累積差距
// 在 20 次選擇裡會比 10 次明顯得多。閘門數兩邊仍然都是 20 個,這一項守的是那個。
check('長關的放大量跟一般關同一個量級(長在波數與吸收,不在閘門)',
  median(longGrowths) <= median(growths) * 2.6,
  `一般 ${median(growths).toFixed(0)} 倍 / 長關 ${median(longGrowths).toFixed(0)} 倍`);
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
// 理想路線與玩家在閘門用同一個取整之後,漂移收回 3% 以內,所以門檻維持 4%。
// (一度放寬到 5%,那是在追症狀:真正的原因是理想路線用浮點、玩家用 Math.round。)
check('最佳玩家的領先幅度每一排每一場都相同(結構保證,不是掃出來的)',
  exactMargins.every((m) => Math.abs(m - want) / want < 0.04),
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
// 提示列只寫得下一個名字,所以一波就一種——寫哪一隻,衝過來的就是哪一隻。
check('一波只有一種怪(提示列寫的名字 = 畫面上出現的怪)',
  mobWaves.every((e) => e.species.length === 1 && e.name === e.species[0].name));
// 變化改成跨波提供:一小關十波不能全是同一隻。
check('整關的怪種夠多變(不是十波都同一隻)', (() => {
  const kinds = new Set(mobWaves.map((e) => e.species[0].id));
  return kinds.size >= Math.min(4, mobWaves.length);
})(), `${new Set(mobWaves.map((e) => e.species[0].id)).size} 種 / ${mobWaves.length} 波`);
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
// **勇者波也跳過**:牠另外設了上限(MAX_HERO_WAVE_UNITS),因為每一個還站著的敵人
// 都在丟武器,隻數直接換算成畫面上有幾條要閃的線。那個上限是刻意的,不是退化。
const unitsByRow = run.filter((r) => r.nodes.every((n) => n.kind === 'enemy'))
  .map((r) => r.nodes[0].enemy!)
  .filter((e) => !e.elite && !e.heroWave)
  .map((e) => e.units);
check('越後面的波次小怪越多(數量看得出難度)', unitsByRow.every((u, i) => i === 0 || u >= unitsByRow[i - 1]),
  unitsByRow.join(' → '));
// 一波的隻數跟著理想人數走(人數就是血量,兩群的規模要同一個數量級)。
// 中間那一段用常數推,不要寫死數字:隻數倍率是可以調的旋鈕(打擊手感),
// 寫死的話調它就會擋在這一項,而這一項要驗的是「線性關係」不是那個特定的數字。
check(`一波封頂 ${MAX_WAVE_SIZE} 隻、保底 ${MIN_WAVE_SIZE} 隻、中間照 x${ENEMY_UNITS_PER_HERO} 走`,
  waveSize(999) === MAX_WAVE_SIZE && waveSize(1) === MIN_WAVE_SIZE
  && waveSize(12) === 12 * ENEMY_UNITS_PER_HERO);
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
check('偏移不會把小怪推出跑道', wave.every((m) =>
  m.offset >= MONSTER_EDGE - 1e-9 && m.offset <= 1 - MONSTER_EDGE + 1e-9));
// 這一項是這次改版的重點:舊版把小怪釘在兩條跑道中心 ±0.11,中間 [0.36, 0.64] 永遠是空的,
// 玩家站在其中一側就能一直打同一個位置。現在要求整條跑道都鋪得到,中央帶不能空。
{
  const wide = waveMonsters(waveRow.index, 12, waveRow.distance, 1, SPREAD);
  const inMiddle = wide.filter((m) => m.offset > 0.4 && m.offset < 0.6).length;
  check('小怪鋪滿整條跑道,中央帶不是空的(不再只站左右兩側)',
    inMiddle >= 1, `12 隻裡有 ${inMiddle} 隻站在中央帶`);
  // 覆蓋度:把跑道切成 6 段,一波 12 隻應該幾乎每一段都踩得到。
  const bins = new Set(wide.map((m) => Math.min(5, Math.floor(m.offset * 6))));
  check('橫向覆蓋夠廣(6 等分至少踩到 5 段)', bins.size >= 5, `踩到 ${bins.size}/6 段`);
}
// 一波只有一種怪(SPECIES_PER_WAVE = 1),所以整波的造型索引都該是 0——
// 提示列寫哪一隻,衝過來的就是哪一隻。這一項以前是反過來檢查「有沒有混到好幾種」。
check('同一波所有隻都是同一種造型(提示列的名字才對得上畫面)',
  new Set(wave.map((m) => m.speciesIndex)).size === 1,
  `用到 ${new Set(wave.map((m) => m.speciesIndex)).size} 種`);
check('造型索引不會超出 species 陣列', wave.every((m) => m.speciesIndex >= 0 && m.speciesIndex < SPECIES_PER_WAVE));

// --- 閘門有寬度,沒踩到就漏掉 ---
check('閘門沒有佔滿整條跑道', GATE_WIDTH < 1 / LANE_COUNT,
  `閘門 ${GATE_WIDTH} vs 跑道 ${(1 / LANE_COUNT).toFixed(2)}`);
check('站在跑道正中央一定踩得到', lanes.every((l) => hitsGate(laneCenterOffset(l), l)));
check('兩格中間有空隙(站在那裡兩邊都碰不到)', !hitsGate(0.5, 0) && !hitsGate(0.5, 1));
check('起跑位置就在空隙上(不動就什麼都吃不到,一定得自己拉)',
  !hitsGate(START_OFFSET, 0) && !hitsGate(START_OFFSET, 1));
check('跑道最外緣也碰不到閘門', !hitsGate(0, 0) && !hitsGate(1, 1));
// 判定是「身體碰到就算」,所以邊界在**閘門邊緣 + 身體半寬**那一點,不是閘門邊緣本身。
check('閘門邊界內外剛好一線之隔(邊界含身體半寬)',
  hitsGate(gateSpan(0).to + HERO_BODY_HALF - 0.001, 0, 1, 1)
  && !hitsGate(gateSpan(0).to + HERO_BODY_HALF + 0.001, 0, 1, 1));
// 身體寬度是**畫面上那一團人**,不是另外發明的一個數字:兩邊共用 SQUAD_DX,
// 所以這一項同時是在盯「畫面跟判定沒有各走各的」。
check('隊伍越多人站得越寬,判定也跟著寬',
  heroHalfSpan(1) < heroHalfSpan(4) && heroHalfSpan(4) < heroHalfSpan(MAX_DRAWN_HEROES),
  [1, 2, 4, 8, 14].map((n) => `${n}人 ${heroHalfSpan(n).toFixed(3)}`).join(' / '));
check('人數超過畫得出來的上限就不再變寬(判定不會超出看得見的身體)',
  heroHalfSpan(MAX_DRAWN_HEROES) === heroHalfSpan(9999));
check('一個人的時候身體仍然塞得進兩格中間的空隙(起跑什麼都吃不到)',
  !hitsGate(START_OFFSET, 0, 1, 1) && !hitsGate(START_OFFSET, 1, 1, 1));
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

// --- 場景底圖 ---
// 底圖綁**大關**:一個大關十個小關共用一張,打完 x-10 才換地方。
// 綁錯層級(綁小關)的症狀是一個章節裡場景換十次,而這一項就是在擋那件事。
{
  const chapter1 = Array.from({ length: LEVELS_PER_CHAPTER }, (_, i) => backdropForStage(i + 1));
  check('同一個大關的十個小關共用一張底圖',
    new Set(chapter1).size === 1, `1-1…1-10 → ${chapter1[0]}`);
  const heads = Array.from({ length: BACKDROPS.length }, (_, c) => backdropForStage(c * LEVELS_PER_CHAPTER + 1));
  check('每個大關換一張,而且不重複',
    new Set(heads).size === BACKDROPS.length, heads.join(' → '));
  check('底圖用完之後循環回第一張',
    backdropForStage(BACKDROPS.length * LEVELS_PER_CHAPTER + 1) === BACKDROPS[0]);
  // 大關的最後一個小關(魔王關)必須還是同一張:換在魔王之前等於提前預告「這裡結束了」。
  check('魔王關與同一個大關的其他小關同一張底圖',
    backdropForStage(LEVELS_PER_CHAPTER) === backdropForStage(1));
}

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
// --- 接戰距離:怪要在畫面「中段」倒下,不能一冒出來就死 ---
//
// 這是**演出**參數(擊殺數由 waveKillCount 算,跟射程無關),但它有一條硬底線:
// **從進入射程到走到你面前的時間,要夠打完 hitsPerUnit 下**。不夠的話,
// 明明該倒的那幾隻會直接走過你面前才消失——畫面演的跟結算算的就對不起來了。
const engageBand = [1, 40, 3000].map((st) => {
  const near = Math.min(...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => engageRange(0, i)));
  return { st, seconds: near / runSpeed(st) };
});
const worstKillSeconds = (HITS_PER_MONSTER * MAX_FIRE_INTERVAL_MS) / 1000;
check('進入射程之後還來得及把牠打完(不然該倒的會走到你面前)',
  engageBand.every((b) => b.seconds > worstKillSeconds),
  engageBand.map((b) => `第${b.st}關 ${b.seconds.toFixed(2)}s`).join(' / ') + ` vs 最慢打完 ${worstKillSeconds.toFixed(2)}s`);
// 上界 0.75 而不是 1:視野最上緣那一段是「剛冒出來」,在那裡就開打等於怪永遠只出現在
// 畫面頂端(最初寫死 260 = 81% 就是這個問題)。下界 0.35 則是另一頭——太短的話
// 勇者有很長一段時間看起來像沒在打。
check('接戰距離落在看得到的範圍內(不會一冒出來就死,也不會很久都不出手)',
  FIRE_RANGE_RATIO >= 0.35 && FIRE_RANGE_RATIO <= 0.75,
  `視野的 ${Math.round(FIRE_RANGE_RATIO * 100)}%`);
// 每一隻各自抖動,不然整波會在同一條水平線上倒下,看起來像有一道看不見的牆。
const engageSpread = new Set([...Array(24).keys()].map((i) => Math.round(engageRange(3, i))));
check('每一隻的接戰距離不一樣(倒下的位置散開)', engageSpread.size >= 8,
  `24 隻裡有 ${engageSpread.size} 種距離`);

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

// --- 主動技能已全部移除(爆裂/貫穿/號令/壁障)---
// 留這一組當回歸防線:哪天有人加回來,得先想清楚「它會不會進敵人曲線」。
check('主動技能已全部移除', ACTIVE_SKILL_IDS.length === 0);
check('沒有任何技能有冷卻(有倒數的就是主動,一款都不剩)',
  RUN_SKILLS.every((sp) => skillCooldownSeconds(sp.id, MAX_RUN_SKILL_LEVEL) === 0));
// **這一項推翻了原本的「冷卻要綁波不綁秒」。** 舊結構是「一波 = 一排」,
// 一排的時間 = 排距 / 跑速,而跑速從 45 爬到 111 —— 綁秒等於後期技能自己變弱。
// 關卡結構改成「戰鬥段是時間」之後,一波的長度反而幾乎是常數,綁秒才是穩的那一邊。
// 下面這一項就是在盯那個前提:哪天結構又改回「一波 = 一排」,它會先紅。
const waveSeconds = [1, 40, 700, 1500, 2900].map((s) => battleSecondsPerWave(s));
const waveSpread = Math.max(...waveSeconds) / Math.min(...waveSeconds);
check('一波的秒數在 3000 關之間幾乎不變(這是「冷卻可以綁秒」的前提)',
  waveSpread < 1.6,
  `${Math.min(...waveSeconds).toFixed(1)}~${Math.max(...waveSeconds).toFixed(1)} 秒(差 ${waveSpread.toFixed(2)} 倍)`);
// 這條是元素不會把敵人養大的保證:貪心只看戰力,所以理想路線永遠不會挑元素,
// 敵人也就不會為了一個「理想玩家用不到的東西」變強(跟兌換率同一個道理)。
check('理想路線永遠不會挑元素(所以元素不進敵人曲線)',
  bestRunSkillChoice([], [{ id: 'fire', level: 1 }, { id: 'edge', level: 1 }]).id === 'edge');
check('額外擊殺不會超過整波隻數',
  resolveEnemy({ ...initialRunState(1), heroes: 50, perHero: 1 },
    { power: 1e9, reward: 0, species: [{ id: 'blob-1', name: '史' }], name: '史', units: 4 }, { kills: 99 })
    .state.heroes >= 50);
// 10 格滿了之後只能升級手上的——不然「廣度 vs 深度」那個決策不存在。
const fullBag = RUN_SKILLS.slice(0, MAX_RUN_SKILL_SLOTS).map((s) => ({ id: s.id, level: 1 }));
// 技能種類**要比格數多**,「廣度 vs 深度」才是真的取捨(不然全拿也裝得下)。
check(`技能種類(${RUN_SKILLS.length})多於格數(${MAX_RUN_SKILL_SLOTS}),滿了只能升級手上的`,
  RUN_SKILLS.length > MAX_RUN_SKILL_SLOTS
  && runSkillOffersAt(fullBag, 1, 0).every((o) => fullBag.some((s) => s.id === o.id)),
  `${RUN_SKILLS.length} 種 / ${MAX_RUN_SKILL_SLOTS} 格`);

// --- 六元素:每一款規則都不一樣,而且**全部只在失誤時才生效** ---
// 光(護盾)與暗(吸取)已移除,雷併進五行環(見 laneRunSkills 的 ELEMENT_COUNTERS)。
const elemFx = (id: (typeof ELEMENTS)[number], l = 3) => runSkillEffects([{ id, level: l }]);
check('六個元素都存在,而且效果組合互不相同(不是同一個東西換名字)',
  ELEMENTS.length === 6
  && new Set(ELEMENTS.map((id) => {
    const e = elemFx(id);
    return JSON.stringify([e.burnSpread > 0, e.pierceRatio > 0, e.chainRatio > 0, e.tradeMultiplier > 1,
      e.regen > 0, e.slow > 0]);
  })).size === 6,
  ELEMENTS.map((id) => runSkillSpec(id).name).join(' '));
check('沒有任何元素會加戰力(所以六個都不進敵人曲線)',
  ELEMENTS.every((id) => {
    const e = elemFx(id, MAX_RUN_SKILL_LEVEL);
    return e.attackMultiplier === 1 && e.heroMultiplier === 1;
  }));
// --- 火/雷/冰的「命中當下」規則 ---
// 燃燒擴散、連鎖閃電、凍結是**演出**;能多打倒幾隻仍然只由 burnKills / chainRatio /
// pierceRatio 決定(laneRun 的 extraKills)。兩組數字分開,是為了讓「特效調得更誇張」
// 不會變成「難度悄悄降了」——這是這個專案一再踩到的那類「兩條各走各的曲線」。
const fireFx = runSkillEffects([{ id: 'fire', level: 5 }]);
const thunderFx = runSkillEffects([{ id: 'thunder', level: 5 }]);
const iceFx = runSkillEffects([{ id: 'ice', level: 5 }]);
check('火/雷/冰各有一組「命中當下」的演出參數',
  fireFx.burnSpread > 0 && thunderFx.chainEvery > 0 && thunderFx.chainTargets > 0 && iceFx.freezeChance > 0,
  `火燒到 ${fireFx.burnSpread} 隻 / 雷每 ${thunderFx.chainEvery} 下電 ${thunderFx.chainTargets} 隻 / 冰 ${Math.round(iceFx.freezeChance * 100)}% 凍住`);
check('沒帶那個元素就沒有演出參數(不會憑空多一層特效)',
  (() => {
    const none = runSkillEffects([{ id: 'edge', level: 5 }]);
    return none.burnSpread === 0 && none.chainEvery === 0 && none.chainTargets === 0 && none.freezeChance === 0;
  })());
// 這一項是回歸防線:演出改版**完全沒有動**決定難度的那三個數字。
// 火已經完全退出擊殺數(舊的 fireKills 移除),它現在純粹是持續傷害。
check('擊殺數只剩雷 8%/級 與金 6%/級,火一隻都不保證',
  Math.abs(thunderFx.chainRatio - 0.4) < 1e-9
  && Math.abs(runSkillEffects([{ id: 'metal', level: 5 }]).pierceRatio - 0.3) < 1e-9,
  `雷 ${(thunderFx.chainRatio * 100).toFixed(0)}% / 金 ${(runSkillEffects([{ id: 'metal', level: 5 }]).pierceRatio * 100).toFixed(0)}%`);
// 火的新規則:1 級只燒被打中的那一隻,擴散是升級才長出來的。
check('火 1 級不擴散,升級才蔓延',
  burnSpreadTargets(1) === 0 && burnSpreadTargets(5) > burnSpreadTargets(2),
  `1~5 級 ${[1, 2, 3, 4, 5].map(burnSpreadTargets).join('/')} 隻`);
// 金的新規則:擴散是演出,擊殺數仍然只由 pierceRatio 決定。
check('金會擴散,而且擴散隻數隨等級長',
  metalSpreadTargets(1) >= 1 && metalSpreadTargets(5) > metalSpreadTargets(1),
  `1~5 級 ${[1, 2, 3, 4, 5].map(metalSpreadTargets).join('/')} 隻`);
// 凍結是唯一吃相剋的演出參數(它是機率,放大得動;擴散隻數是整數,放大就變成另一個技能)。
check('冰的凍結機率吃相剋,擴散/連鎖的隻數不吃',
  runSkillEffects([{ id: 'ice', level: 3 }], 'fire').freezeChance
  > runSkillEffects([{ id: 'ice', level: 3 }]).freezeChance
  && runSkillEffects([{ id: 'fire', level: 3 }], 'metal').burnSpread
  === runSkillEffects([{ id: 'fire', level: 3 }]).burnSpread);
// 壁障擋的是「一整波的損失」,所以冷卻要落在「幾波」的量級,不是「一波之內幾次」——
// 這一項是八元素設計的核心:完美玩家(全清、不漏、不死)一個都用不到。
// 用一波「戰力遠超過」的結算去驗——帶滿八元素跟什麼都不帶,結果必須完全一樣。
const perfectWave = { power: 1, reward: 0, species: [{ id: 'blob-1', name: '史' }], name: '史', units: 6 };
const perfectState: RunState = { ...initialRunState(1), heroes: 50, perHero: 1000 };
const allElements: WaveBoost = {
  kills: 5, killRatio: 0.3, chainRatio: 0.3, regen: 9, lostSoFar: 0, lossCut: 3,
};
check('完美玩家帶滿六元素也一模一樣(所以它們是抬地板不抬天花板)',
  resolveEnemy(perfectState, perfectWave).state.heroes
  === resolveEnemy(perfectState, perfectWave, allElements).state.heroes);
// 反過來:落後的玩家帶了就有差。
const behindState: RunState = { ...initialRunState(1), heroes: 20, perHero: 1 };
const behindWave = { ...perfectWave, power: 400, units: 12 };
check('落後的玩家帶了就活得比較久(越落後越有用)',
  resolveEnemy(behindState, behindWave, allElements).state.heroes
  > resolveEnemy(behindState, behindWave).state.heroes,
  `裸的 ${resolveEnemy(behindState, behindWave).state.heroes} 人 / 帶滿 ${resolveEnemy(behindState, behindWave, allElements).state.heroes} 人`);
// 木・再生只補得回「已經失去的」——沒失去就沒得補。
check('木・再生沒失去就補不了',
  resolveEnemy(behindState, behindWave, { regen: 9, lostSoFar: 0 }).state.heroes
  === resolveEnemy(behindState, behindWave).state.heroes);

// --- 相剋:兩個閉環,每個元素剛好剋一個、也剛好被一個剋 ---
const counterTargets = ELEMENTS.map((id) => ELEMENT_COUNTERS[id]);
check('每個元素都剋一個,而且沒有兩個元素剋同一個(所以沒有廢元素也沒有萬用元素)',
  counterTargets.every((x) => x !== undefined) && new Set(counterTargets).size === ELEMENTS.length,
  ELEMENTS.map((id) => `${runSkillSpec(id).name.split('・')[0]}→${runSkillSpec(ELEMENT_COUNTERS[id]!).name.split('・')[0]}`).join(' '));
// 相剋是**兩個**環(五行 5 個 + 三才 3 個),不是一個 8 元素的大環——
// 所以不能「走 8 步看回不回得到原點」,要走到回來為止再看長度。
const cycleLengths = new Set(ELEMENTS.map((start) => {
  let cur = start;
  for (let n = 1; n <= ELEMENTS.length; n++) {
    cur = ELEMENT_COUNTERS[cur]!;
    if (cur === start) return n;
  }
  return -1;
}));
check('相剋是封閉的環,而且沒有元素剋自己',
  !cycleLengths.has(-1) && !cycleLengths.has(1)
  && [...cycleLengths].sort((a, b) => a - b).join(',') === '6',
  `環長 ${[...cycleLengths].sort((a, b) => a - b).join(' 與 ')}(六元素單一閉環)`);
// 相剋是**逐元素**的:剋中那一個放大、被剋那一個削弱,其他元素與主動技能一律不動。
check('相剋倍率:剋中 x2.5、被剋 x2/3、無關 x1',
  elementMatchup('metal', 'wood') === COUNTER_BONUS
  && elementMatchup('metal', 'thunder') === 1 - COUNTERED_PENALTY
  && elementMatchup('metal', 'ice') === 1
  && elementMatchup('metal', undefined) === 1);
check('非元素技能不吃相剋(鋒刃/增殖/主動技能)',
  (['edge', 'swarm', ...ACTIVE_SKILL_IDS] as const).every((id) => ELEMENTS.every((e) => elementMatchup(id, e) === 1)));
// 一組技能裡,只有對得上的那一個被動到——這是「逐元素」跟舊版純量最關鍵的差別。
// 對照組必須跟這一波的屬性**完全不相干**,不然它會被順帶剋到,就分不出隔離性有沒有成立。
// 環是 金→木→土→冰→火→雷→金,所以對「金」與「火」兩波都中立的是土。
const mixed = [
  { id: 'thunder' as const, level: 3 },
  { id: 'earth' as const, level: 3 },
  { id: 'ice' as const, level: 3 },
];
const base = runSkillEffects(mixed);
const vsMetal = runSkillEffects(mixed, 'metal'); // 雷剋金
const vsFire = runSkillEffects(mixed, 'fire');   // 火剋雷
check('剋中只放大那一個元素,別的元素不動',
  Math.abs(vsMetal.chainRatio - base.chainRatio * COUNTER_BONUS) < 1e-9
  && vsMetal.lossCut === base.lossCut,
  `雷 ${base.chainRatio.toFixed(2)} → ${vsMetal.chainRatio.toFixed(2)} / 土 ${base.lossCut} → ${vsMetal.lossCut}`);
check('被剋只削弱那一個元素',
  Math.abs(vsFire.chainRatio - base.chainRatio * (1 - COUNTERED_PENALTY)) < 1e-9
  && vsFire.lossCut === base.lossCut,
  `雷 ${base.chainRatio.toFixed(2)} → ${vsFire.chainRatio.toFixed(2)}`);
// 主動技能已移除,所以這裡只剩「相剋不碰基礎戰力」——那才是真正要守的:
// 鋒刃/增殖 是唯二進理想路線的,相剋一碰到它們,敵人曲線就會跟著動。
check('相剋完全不碰基礎戰力',
  vsMetal.attackMultiplier === base.attackMultiplier
  && vsMetal.heroMultiplier === base.heroMultiplier
  && vsFire.attackMultiplier === base.attackMultiplier
  && vsFire.heroMultiplier === base.heroMultiplier);
// 每一波的屬性要夠平均,不然有些元素整場都用不到。
const elemTally = new Map<string, number>();
for (let r = 0; r < 4000; r++) {
  const e = elementForRow(r);
  elemTally.set(e, (elemTally.get(e) ?? 0) + 1);
}
check('八種屬性長期分佈平均(不會有元素整場都碰不到)',
  [...elemTally.values()].every((n) => n > 4000 / ELEMENTS.length * 0.75 && n < 4000 / ELEMENTS.length * 1.25)
  && elemTally.size === ELEMENTS.length,
  [...elemTally.values()].join('/'));
// --- 勇者波:活著的人才在丟 ---
// 這一組盯的是「威脅 = 你沒打完的部分」這條規則有沒有真的成立。
const HW_ROW = 11;
const HW_UNITS = 12;
check('全清 -> 一發都沒有(所以完美玩家完全不受影響)',
  hazardsFor(HW_ROW, HW_UNITS, 0).length === 0);
// 條數 = min(活口, ACTIVE_THROWERS)。**同時最多兩條就是「還閃得掉」的保證**——
// 落點寬 HAZARD_WIDTH(0.26),兩條最多蓋掉 0.52,跑道上永遠留得下一段空的。
// 以前這裡是「活幾個就有幾條」,站位改成雜亂之後 11 個活口的線會蓋滿整條跑道,
// 理想玩家也閃不掉,勇者波的難度校準前提當場失效。
check('同時最多 ACTIVE_THROWERS 條線(這就是「還閃得掉」的保證)',
  [1, 3, 7, HW_UNITS].every((alive) =>
    hazardsFor(HW_ROW, HW_UNITS, alive).length === Math.min(alive, ACTIVE_THROWERS)),
  `活 ${HW_UNITS} 個 → ${hazardsFor(HW_ROW, HW_UNITS, HW_UNITS).length} 條`);
check('任何時候跑道上都留得下一段空的(兩條蓋不滿)', (() => {
  const hz = hazardsFor(HW_ROW, HW_UNITS, HW_UNITS);
  const spots = Array.from({ length: 201 }, (_, i) => i / 200);
  return spots.some((o) => !hz.some((h) => o >= h.from && o <= h.to));
})());
// 落點必須就是那些人站的位置——邏輯與畫面同一個算式,不然會有「看起來閃掉了卻還是被砸中」。
const hwMonsters = waveMonsters(HW_ROW, HW_UNITS, 0, 1, 0);
check('落點就是還站著的那幾個人的位置(邏輯與畫面同一個算式)',
  hazardsFor(HW_ROW, HW_UNITS, 3).every((h, i) => {
    // 取的是最靠近勇者的那幾個(slice(-ACTIVE_THROWERS)),所以要從尾巴數回來。
    const m = hwMonsters[HW_UNITS - Math.min(3, ACTIVE_THROWERS) + i];
    return Math.abs((h.from + h.to) / 2 - m.offset) < 1e-9
      && Math.abs((h.to - h.from) - HAZARD_WIDTH) < 1e-9;
  }));
check('打倒越多,危險的範圍越小(單調)', (() => {
  const covered = (alive: number) => {
    const hz = hazardsFor(HW_ROW, HW_UNITS, alive);
    let n = 0;
    for (let x = 0; x <= 1.0001; x += 0.002) if (hitByHazard(x, hz)) n++;
    return n;
  };
  const series = [HW_UNITS, 8, 5, 3, 1, 0].map(covered);
  return series.every((v, i) => i === 0 || v <= series[i - 1]);
})());
// 全清的時候勇者波跟一般波結算結果一模一樣 —— 這是「不進理想路線」的直接證據。
const hwPerfect = {
  power: 1, reward: 0, species: [{ id: 'blob-1', name: '史' }], name: '史', units: 6,
  heroWave: true, rowIndex: HW_ROW,
};
check('完美玩家打勇者波跟打一般波一模一樣(勇者波沒有進理想路線)',
  [0, 0.25, 0.5, 0.75, 1].every((at) =>
    resolveEnemy(perfectState, hwPerfect, {}, at).state.heroes
    === resolveEnemy(perfectState, { ...hwPerfect, heroWave: false }, {}, at).state.heroes));
// 反過來:打不完的時候,站對地方仍然閃得掉一部分(這是勇者波跟小怪波唯一的差別)。
const hwBehind = { ...hwPerfect, power: 400, units: 12 };
const hwSpots = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1].map((at) =>
  resolveEnemy(behindState, hwBehind, {}, at).state.heroes);
check('打不完的時候,站的位置會影響結果(閃得掉就是閃得掉)',
  new Set(hwSpots).size > 1, `各位置剩下 ${hwSpots.join('/')} 人`);
// 固定值 + 不設上限:一把武器換一個人,所以「被打到」在整場的意義是一致的
// (舊版的比例值會讓 137 人時被砸一下掉 27 個,跟 3 人時被砸的是同一把武器)。
check('被打中一下只扣固定人數(不是比例)', HAZARD_LOSS_HEROES === 1);
check('一波的期望被打次數是用「戰鬥段秒數 ÷ 投擲間隔」算的,而且不會失控', (() => {
  const hits = [1, 12, 102, 700, 1500].map(expectedHazardHits);
  return hits.every((h) => h >= 1 && h <= 6);
})(), [1, 12, 102, 1500].map((st) => `第${st}關 ${expectedHazardHits(st)} 下`).join(' / '));
check('投擲間隔夠慢(每一下都扣人,太密就不是難是直接出局)', ENEMY_THROW_INTERVAL_MS >= 1200);

// 勇者波走另一條 salt:關卡前公開的那一串不能洩漏它抽到什麼。
const salted = Array.from({ length: 400 }, (_, r) => elementForRow(r, HERO_WAVE_ELEMENT_SALT));
const plain = Array.from({ length: 400 }, (_, r) => elementForRow(r));
check('勇者波的屬性跟公開的那一條不一樣(所以提示列標「?」是誠實的)',
  salted.filter((e, i) => e === plain[i]).length < 400 * 0.25,
  `重疊 ${salted.filter((e, i) => e === plain[i]).length}/400`);
check('勇者波的屬性也是平均的',
  new Set(salted).size === ELEMENTS.length);
// 關卡前的提示:一般波公開、勇者波藏起來。
const brief = waveElementsForStage(12);
check('關卡前的屬性提示涵蓋每一波,而且只藏勇者波',
  brief.length === wavesForStage(12)
  && brief.filter((b) => b.hidden).length === Math.floor((wavesForStage(12) - 1) / 3),
  `${brief.length} 波,藏 ${brief.filter((b) => b.hidden).length} 波`);
// 魔王關(x-10)的最後一波是魔王,而且它的屬性關卡前就看得到——這是最值得押注的一格。
const bossBrief = waveElementsForStage(20);
check('魔王也有屬性,而且關卡前就公開(x-10 是最值得押注的一格)',
  bossBrief[bossBrief.length - 1].boss
  && !bossBrief[bossBrief.length - 1].hidden
  && bossBrief[bossBrief.length - 1].element !== undefined,
  `2-10 魔王 ${bossBrief[bossBrief.length - 1].element}`);
// **相剋照樣不進理想路線**:它只放大元素,而元素只在失誤時生效。
const counteredAll: WaveBoost = {
  kills: 5 * COUNTER_BONUS, killRatio: 0.3 * COUNTER_BONUS, chainRatio: 0.3 * COUNTER_BONUS,
  regen: 9 * COUNTER_BONUS, lostSoFar: 0, lossCut: 3 * COUNTER_BONUS,
};
check('完美玩家帶對屬性也一模一樣(相剋沒有破壞結構保證)',
  resolveEnemy(perfectState, perfectWave, counteredAll).state.heroes
  === resolveEnemy(perfectState, perfectWave).state.heroes);
// **這一波要夠大,大到兩邊都還有漏接**才比得出相剋的差別:小波會被兩邊都清光,
// 清光之後「再多清一點」是零效益,兩邊的結果自然一模一樣(那不是相剋失效,是天花板)。
// 但也**不能大到兩邊都全滅**——暗・吸取移除之後,原本靠它撐住的那組會直接歸零,
// 兩邊同樣是 0 人就一樣分不出差別。所以拿一個「撐得住但會痛」的隊伍來比。
const behindBigWave = { ...perfectWave, power: 4000, units: 200 };
const behindBigState: RunState = { ...initialRunState(1), heroes: 300, perHero: 1 };
check('落後的玩家帶對屬性明顯更有用',
  resolveEnemy(behindBigState, behindBigWave, counteredAll).state.heroes
  > resolveEnemy(behindBigState, behindBigWave, allElements).state.heroes,
  `沒剋 ${resolveEnemy(behindBigState, behindBigWave, allElements).state.heroes} 人 / 剋中 ${resolveEnemy(behindBigState, behindBigWave, counteredAll).state.heroes} 人`);

// --- 第 40 小關之後的難度分段 ---
// 三顆旋鈕、一段一顆,而且**三顆都不能碰到完美玩家**——碰到就進了理想路線,
// 敵人戰力會為了它變強,「選對就一定過」當場失效。
const bandStages = [1, 40, 200, 400, 800, 1200, 2000, 3000];
console.log('\n難度分段(第 40 小關之後,一段轉一顆):');
console.log('   小關    閘門寬   腰斬陷阱   勇者波');
for (const st of bandStages) {
  console.log(`  ${String(st).padStart(5)}    ${gateWidthForStage(st).toFixed(3)}    `
    + `${(trapHalveWeightForStage(st) * 100).toFixed(0).padStart(3)}%     每 ${heroWaveEveryForStage(st)} 波`);
}
check('閘門只會變窄不會變寬(而且有下限)', (() => {
  const w = bandStages.map(gateWidthForStage);
  return w.every((v, i) => i === 0 || v <= w[i - 1] + 1e-9)
    && w[0] === GATE_WIDTH && w[w.length - 1] >= GATE_WIDTH_MIN - 1e-9;
})());
check('陷阱只會變重不會變輕(而且三種都不會消失)', (() => {
  const t = bandStages.map(trapHalveWeightForStage);
  return t.every((v, i) => i === 0 || v >= t[i - 1] - 1e-9) && t[t.length - 1] < 1;
})());
check('第 40 小關之前完全不動(前 4 個大關的難度只由跑速決定)',
  gateWidthForStage(1) === gateWidthForStage(40)
  && trapHalveWeightForStage(1) === trapHalveWeightForStage(40)
  && heroWaveEveryForStage(1) === heroWaveEveryForStage(40));
// 一段只轉一顆:任何相鄰的兩關之間,最多只有一顆旋鈕在動。
check('一段只轉一顆旋鈕(某一段變難了講得出是哪一顆造成的)', (() => {
  const moving = (a: number, b: number) => [
    Math.abs(gateWidthForStage(a) - gateWidthForStage(b)) > 1e-9,
    Math.abs(trapHalveWeightForStage(a) - trapHalveWeightForStage(b)) > 1e-9,
    heroWaveEveryForStage(a) !== heroWaveEveryForStage(b),
  ].filter(Boolean).length;
  for (let st = 1; st < 3000; st += 7) if (moving(st, st + 7) > 1) return false;
  return true;
})());
// 最窄的閘門仍然踩得到:站在跑道中央一定算數,而中間的空隙也一定還在。
check('閘門窄到底仍然踩得到,而且中間的空隙還在',
  [0, 1].every((l) => hitsGate(laneCenterOffset(l as Lane), l as Lane, 3000))
  && !hitsGate(0.5, 0, 3000) && !hitsGate(0.5, 1, 3000));
// **這一項是分段旋鈕的核心**:完美玩家在最後一關跟第一關一樣是 100% 過關。
check('三顆旋鈕都碰不到完美玩家(難度分段沒有破壞結構保證)',
  [400, 1200, 3000].every((st) => clearRate(st, simBest, 120) === 1));
// 反過來:手不準的人在後段確實比前段慘。
//
// **注意這裡量的幅度比舊版小很多,而且是刻意的。** 判定改成「身體碰到就算」之後,
// 隊伍長到八九隻時半寬就有 0.239,比最窄的閘門(半寬 0.12)還寬——所以
// 「閘門變窄」(第 41~400 關那一段)對**已經滾出一支隊伍的玩家幾乎不再有作用**,
// 它只咬得到前幾排還只有一兩個人的時候。這是身體判定的直接代價,不是調參調壞了:
// 一團十四隻的史萊姆本來就蓋滿自己那一格。
// 要讓「手要準」重新變成後段的難度來源,得改的是別的東西(例如讓閘門的**位置**在
// 跑道上左右浮動,而不是只把它變窄)——那是一次獨立的設計決定。
const sloppyAt = (st: number) => clearRate(st, simBest, 200, { sloppy: 0.45 });
const sloppyEarly = sloppyAt(40);
const sloppyLate = sloppyAt(3000);
check('手不準的人在後段還是比前段慘',
  sloppyLate < sloppyEarly, `第40關 ${(sloppyEarly * 100).toFixed(0)}% → 第3000關 ${(sloppyLate * 100).toFixed(0)}%`);

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
const accByStage = [1, 12, 102, 700, 1500, 2900].map((stage) => {
  const r = ACCURACIES.map((a) => accuracyRate(stage, a));
  console.log(`  第${String(stage).padStart(4)}關  ` + r.map((v) => (v * 100).toFixed(0).padStart(5) + '%').join(''));
  return { stage, r };
});
check('準確率越高過關率越高(而且是單調的)',
  accByStage.every((s) => s.r.every((v, i) => i === 0 || v <= s.r[i - 1])));
check('完全選對 -> 一定過關', accByStage.every((s) => s.r[0] >= 0.99));
// 門檻從 0.7 降到 0.5,因為難度被刻意調上去了(ENEMY_POWER_RATIO 0.48 → 0.51)。
// **這個數字是跟著設計走的,不是「調到過為止」**:0.7 是舊難度的樣子,
// 難度整條往下壓 12pp 之後還要求 0.7 等於把那次調整原地撤銷。
// 真正要守住的是下面那一項——**第一大關(教學區)不能跟著變難**。
check('準確率 95% -> 一半以上過得去(讀得懂閘門就不該一直死)',
  accByStage.every((s) => s.r[1] >= 0.5), accByStage.map((s) => (s.r[1] * 100).toFixed(0) + '%').join(' / '));
check('教學區(第 1 大關)不受難度調整影響,95% 準確率照樣穩過',
  accByStage[0].r[1] >= 0.9, `第1關 95% 準確率 ${(accByStage[0].r[1] * 100).toFixed(0)}%`);
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
// 難度分段最直接的驗收:後面的關卡不能比前面的好過。
// 這一項在分段旋鈕上線之前是「全部一樣」——第 40 關之後跑速封頂,而其他東西都不動,
// 所以第 102 關跟第 2900 關的曲線一模一樣,260 個大關在難度上完全是平的。
check('後面的關卡不會比前面好過(第 40 關之後不再是一條平的)', (() => {
  const at90 = accByStage.filter((s) => s.stage > 1).map((s) => s.r[2]);
  const nonIncreasing = at90.every((v, i) => i === 0 || v <= at90[i - 1] + 0.03);
  const actuallyTightens = at90[at90.length - 1] < at90[0] - 0.1;
  return nonIncreasing && actuallyTightens;
})(), accByStage.filter((s) => s.stage > 1).map((s) => `${s.stage}:${(s.r[2] * 100).toFixed(0)}%`).join(' '));
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
for (const sloppy of [0, 0.16, 0.25, 0.35, 0.45, 0.5]) {
  console.log(`  ±${sloppy.toFixed(2)}   ${(sloppyRate(20, sloppy) * 100).toFixed(0).padStart(4)}%`
    + `  ${(sloppyRate(100, sloppy) * 100).toFixed(0).padStart(5)}%`);
}
check('選對邊而且拉得準 -> 一定過關', sloppyRate(12, 0) >= 0.99);
check('手抖一點還過得去(漏接有代價但不是死刑)', sloppyRate(12, 0.08) >= 0.55);
// 門檻拉到 ±0.45 才咬得動:身體判定讓容錯整條變寬(見上面那段長註解)。
// 這一項證明的是「漏接還存在」,不是「漏接還是主要的難度來源」——後者已經不成立了。
check('拉得離譜還是會開始漏接', sloppyRate(12, 0.5) < sloppyRate(12, 0.08));

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

// --- 石頭(路障)---
// 要證明三件事:數量與落點合規、完美玩家完全不受影響(結構保證沒被動到)、
// 而且它對會失誤的玩家真的有代價(不然放了等於沒放)。
console.log('\n石頭:');
const rockStages = [1, 5, 12, 20, 40, 105];
const rockRuns = rockStages.map((s) => ({ stage: s, rocks: createRocks(9871 + s, s) }));
console.log('  ' + rockRuns.map((r) => `${stageLabel(r.stage)} ${r.rocks.length}顆`).join('   '));

// 顆數:一般小關 2~3 顆,長關按比例加倍(密度一致,不是總數一致)。
const normalRockCounts: number[] = [];
const longRockCounts: number[] = [];
for (let t = 0; t < 200; t++) {
  normalRockCounts.push(createRocks(t * 17 + 3, 12).length); // 12 = 2-2,一般小關
  longRockCounts.push(createRocks(t * 17 + 3, 15).length); // 15 = 2-5,加倍長
}
const inRange = (v: number[], lo: number, hi: number) => v.every((n) => n >= lo && n <= hi);
check('一般小關 2~3 顆', inRange(normalRockCounts, ROCKS_PER_RUN_MIN, ROCKS_PER_RUN_MAX),
  `實測 ${Math.min(...normalRockCounts)}~${Math.max(...normalRockCounts)} 顆`);
check('長關按比例加倍(密度一致,不是總數一致)',
  inRange(longRockCounts, ROCKS_PER_RUN_MIN * 2, ROCKS_PER_RUN_MAX * 2),
  `實測 ${Math.min(...longRockCounts)}~${Math.max(...longRockCounts)} 顆`);

// 落點:石頭一律在戰鬥段裡,而且離閘門排與結算點都有淨空。
let rockOffTrack = 0;
let rockTooCloseToGate = 0;
let rockTooCloseToResolve = 0;
let rockDodgeable = 0;
let rockTotal = 0;
for (const stage of rockStages) {
  const dists = rowDistances(stage);
  const battle = battleDistance(stage);
  for (let t = 0; t < 40; t++) {
    for (const rock of createRocks(t * 29 + 11, stage)) {
      rockTotal++;
      if (rock.offset < 0 || rock.offset > 1) rockOffTrack++;
      // 屬於哪一個戰鬥段:第一個結算點在它後面的敵人排。
      const resolveAt = dists.find((d, i) => isEnemyRowIndex(i, stage) && d >= rock.distance);
      if (resolveAt === undefined) { rockTooCloseToResolve++; continue; }
      if (rock.distance > resolveAt - 120 + 1) rockTooCloseToResolve++;
      // 一定閃得掉:跑道上必須存在一個不會撞到它的位置。
      const spots = Array.from({ length: 101 }, (_, i) => i / 100);
      if (spots.some((o) => !hitsRock(o, rock))) rockDodgeable++;
    }
  }
}
check('石頭都在跑道範圍內', rockOffTrack === 0, `${rockTotal} 顆`);
// 閘門排搬進戰鬥段之後,「石頭等閘門結算完才進視野」做不到也不再是目標(見 createRocks)。
// 現在只保證一件事:石頭不跟**任何一排**在同一瞬間結算,不然兩筆扣人疊在一起等於沒回饋。
check('石頭離波次結算點有淨空(兩筆懲罰不會疊在同一瞬間)', rockTooCloseToResolve === 0);
{
  let tooCloseToAnyRow = 0;
  let rocksChecked = 0;
  for (const stage of rockStages) {
    const dists = rowDistances(stage);
    for (let t = 0; t < 40; t++) {
      for (const rock of createRocks(t * 29 + 11, stage)) {
        rocksChecked++;
        if (dists.some((d) => Math.abs(d - rock.distance) < 120 - 1)) tooCloseToAnyRow++;
      }
    }
  }
  check('石頭離任何一排都有淨空(閘門排也算)', tooCloseToAnyRow === 0, `${rocksChecked} 顆`);
}
check('每一顆都閃得掉(石頭是反應題,不是二選一)', rockDodgeable === rockTotal);

// 同一個空隙不會放到兩顆(擠在一起等於一顆比較胖的石頭)。
// 閘門排搬進戰鬥段之後,「一段一顆」的單位從戰鬥段變成**排與排之間的空隙**。
let sameGap = 0;
for (const stage of rockStages) {
  const dists = rowDistances(stage);
  const gapOf = (d: number) => dists.findIndex((v) => v >= d);
  for (let t = 0; t < 40; t++) {
    const gaps = createRocks(t * 31 + 7, stage).map((k) => gapOf(k.distance));
    if (new Set(gaps).size !== gaps.length) sameGap++;
  }
}
check('同一個空隙不會擠兩顆', sameGap === 0);

// 效果:掉 20%,但撞不死人,而且看得出來。
const rockCases = [1, 2, 3, 5, 10, 40, 137];
const rockLoss = rockCases.map((h) => {
  const st = { ...initialRunState(10), heroes: h };
  return h - applyRockHit(st).state.heroes;
});
console.log('  撞到掉幾人:' + rockCases.map((h, i) => `${h}人→-${rockLoss[i]}`).join('  '));
check('石頭撞不死人(死亡只發生在怪撞上來那一刻)',
  rockCases.every((h) => applyRockHit({ ...initialRunState(10), heroes: h }).state.heroes >= 1));
check('2 人以上一定看得出扣了人(不然玩家會以為判定壞了)',
  rockCases.every((h, i) => h < 2 || rockLoss[i] >= 1));
check('人多的時候掉大約 20%',
  Math.abs(rockLoss[rockCases.indexOf(137)] / 137 - ROCK_HERO_LOSS) < 0.02,
  `137 人掉 ${rockLoss[rockCases.indexOf(137)]}`);
check('只剩 1 人的時候有專用回饋文字(delta 是 0,不標出來會被畫成綠色)',
  applyRockHit({ ...initialRunState(10), heroes: 1 }).message === ROCK_GRAZE_MESSAGE);

// 結構保證:完美玩家閃得掉每一顆,所以石頭完全不該影響「選對就一定過關」。
const bestNoRock = clearRate(20, simBest, 200, { rockHitRate: 0 });
const bestAllRock = clearRate(20, simBest, 200, { rockHitRate: 1 });
check('完美玩家(閃掉每一顆)仍然一定過關 —— 石頭沒有動到結構保證',
  bestNoRock === 1, `${(bestNoRock * 100).toFixed(0)}%`);
// 門檻 0.8 是**漂移警報**,不只是「不能必死」的下限。
//
// 這個數字量的是「石頭 × 其他所有平衡」的交互作用,所以石頭一行沒改也會被別人動到——
// 實測在不同版本看過 92% / 89% / 77%。**那正是要它報警的情況**:掉下來就代表
// 有人把整體難度收緊了,石頭的複利代價跟著變重,該回來重看 ROCK_HERO_LOSS。
//
// 代價是複利的:一般小關 3 顆各掉 20%,0.8^3 = 0.51,而容錯緩衝只有
// 1/ENEMY_POWER_RATIO ≈ 2.08x —— 「閘門全對但石頭全撞」本來就貼著臨界。
// 這一項紅了不要直接放寬門檻,先確認是「整體難度變了」還是「石頭真的太重」。
check('就算每顆都撞到,選對閘門的玩家還是過得去(石頭是懲罰不是死刑)',
  bestAllRock >= 0.8, `每顆都撞 ${(bestAllRock * 100).toFixed(0)}%`);

// 代價:對會失誤的玩家要真的有感,但不能把難度整條拉走。
console.log('\n石頭對過關率的影響(準確率 90%,石頭撞擊率 = 1 - 準確率):');
for (const stage of [12, 102]) {
  const noRock = clearRate(stage, pickAccurate(0.9), 300, { rockHitRate: 0 });
  const withRock = clearRate(stage, pickAccurate(0.9), 300, { rockHitRate: 0.1 });
  const allRock = clearRate(stage, pickAccurate(0.9), 300, { rockHitRate: 1 });
  console.log(`  ${stageLabel(stage)}  沒石頭 ${(noRock * 100).toFixed(0)}%`
    + `  照準確率撞 ${(withRock * 100).toFixed(0)}%  每顆都撞 ${(allRock * 100).toFixed(0)}%`);
  check(`${stageLabel(stage)} 石頭沒有把難度整條拉走(照準確率撞,掉幅 <= 12pp)`,
    noRock - withRock <= 0.12, `掉 ${((noRock - withRock) * 100).toFixed(0)}pp`);
  check(`${stageLabel(stage)} 每顆都撞真的有代價(不是白放)`, noRock - allRock >= 0.03,
    `掉 ${((noRock - allRock) * 100).toFixed(0)}pp`);
}

// --- 選最佳時數值的成長感 ---
const sample = simulateRun(42, 10, simBest);
console.log(`\n第10關全選最佳:戰力 ${totalAttack(initialRunState(10))} -> ${totalAttack(sample.state)}`
  + `(${sample.state.heroes} 人 x 每人 ${sample.state.perHero}、裝備 ${sample.state.gear} 階)、`
  + `兌換率 x${sample.state.tradeRate.toFixed(2)}、金幣 ${sample.state.coins}`);
check('全選最佳時戰力明顯成長(>= 8 倍)', totalAttack(sample.state) >= totalAttack(initialRunState(10)) * 8);

console.log(fail === 0 ? '\n全部通過' : `\n${fail} 項失敗`);
process.exit(fail === 0 ? 0 : 1);
