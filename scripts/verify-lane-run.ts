// 跑道闖關數值驗證。核心要證明的只有一件事:勝負取決於「有沒有選對閘門」,不是運氣也不是數值。
import {
  bestLane, createRun, ENEMY_EVERY, initialRunState, LANE_COUNT, moveLane, resolveRow,
  ROWS_PER_RUN, runSpeed, secondsPerRow, worstLane, type Lane, type RunState,
} from '../game/laneRun';

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
check('中間左右都能動', moveLane(1, 'left') === 0 && moveLane(1, 'right') === 2);

// --- 跑圖結構 ---
const run = createRun(1234, 5);
check('排數正確', run.length === ROWS_PER_RUN);
check('每排都有 3 個節點', run.every((r) => r.nodes.length === LANE_COUNT));
check('每排三條跑道各一個節點', run.every((r) => new Set(r.nodes.map((n) => n.lane)).size === LANE_COUNT));
check('距離嚴格遞增', run.every((r, i) => i === 0 || r.distance > run[i - 1].distance));
const enemyRows = run.filter((r) => r.nodes.every((n) => n.kind === 'enemy'));
check(`每 ${ENEMY_EVERY} 排一次敵人`, enemyRows.length === Math.floor(ROWS_PER_RUN / ENEMY_EVERY),
  `${enemyRows.length} 排敵人`);
const gateRows = run.filter((r) => r.nodes.every((n) => n.kind === 'gate'));
check('閘門排三格效果不完全相同', gateRows.every((r) =>
  new Set(r.nodes.map((n) => JSON.stringify(n.gate))).size >= 2));
check('同一 seed 可重現', JSON.stringify(createRun(1234, 5)) === JSON.stringify(run));
check('不同 seed 不一樣', JSON.stringify(createRun(999, 5)) !== JSON.stringify(run));

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
  minAttack = Math.min(minAttack, res.st.attack);
}
check('攻擊力永遠 >= 1(不會被連續陷阱卡死)', minAttack >= 1, `最低 ${minAttack}`);

// --- 選最佳時數值的成長感 ---
const sample = play(42, 10, pickBest);
console.log(`\n第10關全選最佳:攻擊 ${initialRunState(10).attack} -> ${sample.st.attack}、`
  + `血量 ${sample.st.hp}/${sample.st.maxHp}、金幣 ${sample.st.coins}`);
check('全選最佳時攻擊力明顯成長(>= 8 倍)', sample.st.attack >= initialRunState(10).attack * 8);

console.log(fail === 0 ? '\n全部通過' : `\n${fail} 項失敗`);
process.exit(fail === 0 ? 0 : 1);
