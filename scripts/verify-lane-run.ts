// 跑道闖關數值驗證。核心要證明的只有一件事:勝負取決於「有沒有選對閘門」,不是運氣也不是數值。
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bestLane, clampOffset, createRun, ENEMY_EVERY, fireIntervalMs, initialRunState, LANE_COUNT,
  laneCenterOffset, laneFromOffset, MAX_FIRE_INTERVAL_MS, MAX_WAVE_SIZE, MIN_FIRE_INTERVAL_MS,
  HITS_PER_MONSTER, moveLane, resolveEnemy, resolveRow, ROWS_PER_RUN, runSpeed, secondsPerRow, WAVE_LENGTH,
  START_OFFSET, totalAttack, waveKillCount, waveMonsters, waveSize, worstLane,
  type Lane, type RunState,
} from '../game/laneRun';
import { hasMonsterVisual } from '../game/sprites/monsters';

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
check('排數正確', run.length === ROWS_PER_RUN);
check(`每排都有 ${LANE_COUNT} 個節點`, run.every((r) => r.nodes.length === LANE_COUNT));
check('每條跑道各一個節點', run.every((r) => new Set(r.nodes.map((n) => n.lane)).size === LANE_COUNT));
check('距離嚴格遞增', run.every((r, i) => i === 0 || r.distance > run[i - 1].distance));
const enemyRows = run.filter((r) => r.nodes.every((n) => n.kind === 'enemy'));
check(`每 ${ENEMY_EVERY} 排一次敵人`, enemyRows.length === Math.floor(ROWS_PER_RUN / ENEMY_EVERY),
  `${enemyRows.length} 排敵人`);
const gateRows = run.filter((r) => r.nodes.every((n) => n.kind === 'gate'));
check('閘門排兩格效果一定不一樣(不然就不用選了)', gateRows.every((r) =>
  new Set(r.nodes.map((n) => JSON.stringify(n.gate))).size === 2));
check('同一 seed 可重現', JSON.stringify(createRun(1234, 5)) === JSON.stringify(run));
check('不同 seed 不一樣', JSON.stringify(createRun(999, 5)) !== JSON.stringify(run));

// --- 敵人的量化呈現(每隻敵人都要指得到既有素材)---
const ART_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sprites', 'monsters', 'ai');
const archetypeOf = (id: string) => (id.includes('-') ? id.slice(0, id.lastIndexOf('-')) : id);
const allEnemies = [1, 5, 20, 40].flatMap((s) =>
  Array.from({ length: 40 }, (_, t) => createRun(t * 17 + 3, s))
    .flatMap((r) => r.flatMap((row) => row.nodes))
    .flatMap((n) => (n.kind === 'enemy' && n.enemy ? [n.enemy] : [])));
check('每隻敵人都有名字與造型 id', allEnemies.every((e) => e.name.length > 0 && e.monsterId.length > 0));
check('敵人造型 id 都在怪物圖庫裡', allEnemies.every((e) => hasMonsterVisual(e.monsterId)),
  `${new Set(allEnemies.map((e) => e.monsterId)).size} 種造型`);
check('每種造型都有對應的既有素材檔', allEnemies.every((e) => existsSync(join(ART_DIR, `${archetypeOf(e.monsterId)}_open.png`))),
  [...new Set(allEnemies.map((e) => archetypeOf(e.monsterId)))].join(' '));
check('同一排的每一格都是同一批敵人', run.filter((r) => r.nodes.every((n) => n.kind === 'enemy'))
  .every((r) => new Set(r.nodes.map((n) => n.enemy!.monsterId)).size === 1));
const unitsByRow = run.filter((r) => r.nodes.every((n) => n.kind === 'enemy')).map((r) => r.nodes[0].enemy!.units);
check('越後面的波次小怪越多(數量看得出難度)', unitsByRow.every((u, i) => i === 0 || u >= unitsByRow[i - 1]),
  unitsByRow.join(' → '));
check(`一波封頂 ${MAX_WAVE_SIZE} 隻`, waveSize(999) === MAX_WAVE_SIZE && waveSize(0) === 5);

// --- 一波小怪的排列 ---
const waveRow = run.find((r) => r.nodes.every((n) => n.kind === 'enemy'))!;
const wave = waveMonsters(waveRow.index, 9, waveRow.distance);
check('小怪數量等於這一波的隻數', wave.length === 9);
check('小怪一隻一隻排開,不會疊在同一點', wave.every((m, i) => i === 0 || m.distance > wave[i - 1].distance));
check('最後一隻剛好落在結算點', wave[wave.length - 1].distance === waveRow.distance);
check('整波都在結算點前方一個波長內', wave.every((m) =>
  m.distance > waveRow.distance - WAVE_LENGTH - 0.001 && m.distance <= waveRow.distance));
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
  JSON.stringify(waveMonsters(waveRow.index, 9, waveRow.distance)) === JSON.stringify(wave));

// --- 打掉幾隻 vs 扣多少血:同一件事的兩種說法 ---
const powerSample = 200;
const baseState: RunState = initialRunState(1);
const damageAt = (atk: number) => {
  const before = { ...baseState, heroes: 1, perHero: atk };
  const after = resolveEnemy(before, { power: powerSample, reward: 0, monsterId: 'blob-1', name: '史', units: 9 });
  return before.hp - after.state.hp;
};
check('攻擊力壓過戰力 -> 全部打掉、零傷害',
  waveKillCount(powerSample, powerSample, 9) === 9 && damageAt(powerSample) === 0);
check('攻擊力遠超過 -> 一樣是全部打掉(不會算出超過總數)',
  waveKillCount(powerSample * 5, powerSample, 9) === 9 && damageAt(powerSample * 5) === 0);
check('攻擊力不足 -> 有漏過來的,而且確實有扣血',
  waveKillCount(powerSample / 2, powerSample, 9) < 9 && damageAt(powerSample / 2) > 0);
check('打掉的比例跟擋掉的傷害比例一致',
  Math.abs(waveKillCount(powerSample / 2, powerSample, 9) / 9
    - (1 - damageAt(powerSample / 2) / powerSample)) < 0.06);
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

// --- 三種玩家跑同一場 ---
type Picker = (s: RunState, row: ReturnType<typeof createRun>[number], rng: () => number) => Lane;
function play(seed: number, stage: number, pick: Picker) {
  const rows = createRun(seed, stage);
  let st = initialRunState(stage);
  let rng = (() => { let x = seed + 7; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; })();
  for (const row of rows) {
    st = { ...st, lane: pick(st, row, rng) };
    const r = resolveRow(st, row);
    st = r.state;
    if (st.phase === 'dead') return { outcome: 'dead' as const, st };
  }
  return { outcome: 'cleared' as const, st };
}

const pickBest: Picker = (s, row) => bestLane(s, row);
const pickWorst: Picker = (s, row) => worstLane(s, row);
const pickRandom: Picker = (_s, _row, rng) => Math.floor(rng() * LANE_COUNT) as Lane;

function rate(stage: number, pick: Picker, trials = 300) {
  let cleared = 0;
  for (let t = 0; t < trials; t++) if (play(t * 31 + 1, stage, pick).outcome === 'cleared') cleared++;
  return cleared / trials;
}

console.log('\n過關率(列=關卡,欄=選法):');
console.log('        最佳    隨機    最差');
const rows2: { stage: number; b: number; r: number; w: number }[] = [];
for (const stage of [1, 5, 20, 40, 100]) {
  const b = rate(stage, pickBest), r = rate(stage, pickRandom), w = rate(stage, pickWorst);
  rows2.push({ stage, b, r, w });
  console.log(`  第${String(stage).padStart(3)}關  ${[b, r, w].map((v) => (v * 100).toFixed(0).padStart(4) + '%').join('  ')}`);
}

check('每排都挑最好的 -> 一定過關', rows2.every((x) => x.b >= 0.99));
check('每排都挑最爛的 -> 幾乎必死', rows2.every((x) => x.w <= 0.05));
check('隨機亂選 -> 落在 20%~70%(選擇真的有意義)', rows2.every((x) => x.r >= 0.2 && x.r <= 0.7));
check('亂選的過關率隨關卡下降', rows2[rows2.length - 1].r < rows2[0].r);
check('選得好一定比亂選好', rows2.every((x) => x.b > x.r));
check('亂選一定比選最爛好', rows2.every((x) => x.r > x.w));

// --- 攻擊力不會被陷阱歸零卡死 ---
let minAttack = Infinity;
for (let t = 0; t < 200; t++) {
  const res = play(t * 13 + 5, 20, pickWorst);
  minAttack = Math.min(minAttack, totalAttack(res.st));
}
check('戰力永遠 >= 1(不會被連續陷阱卡死)', minAttack >= 1, `最低 ${minAttack}`);

// --- 選最佳時數值的成長感 ---
const sample = play(42, 10, pickBest);
console.log(`\n第10關全選最佳:戰力 ${totalAttack(initialRunState(10))} -> ${totalAttack(sample.st)}`
  + `(${sample.st.heroes} 人 x 每人 ${sample.st.perHero}、裝備 ${sample.st.gear} 階)、`
  + `血量 ${sample.st.hp}/${sample.st.maxHp}、金幣 ${sample.st.coins}`);
check('全選最佳時戰力明顯成長(>= 8 倍)', totalAttack(sample.st) >= totalAttack(initialRunState(10)) * 8);

console.log(fail === 0 ? '\n全部通過' : `\n${fail} 項失敗`);
process.exit(fail === 0 ? 0 : 1);
