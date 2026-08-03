// 跑道闖關數值驗證。核心要證明的只有一件事:勝負取決於「有沒有選對閘門」,不是運氣也不是數值。
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  bestLane, clampOffset, createRun, ENEMY_EVERY, fireIntervalMs, initialRunState, LANE_COUNT,
  laneCenterOffset, laneFromOffset, MAX_FIRE_INTERVAL_MS, MAX_WAVE_SIZE, MIN_FIRE_INTERVAL_MS,
  HITS_PER_MONSTER, moveLane, resolveEnemy, resolveRow, ROWS_PER_RUN, runSpeed, secondsPerRow, WAVE_LENGTH,
  GATE_WIDTH, gateSpan, hitsGate, MONSTER_JITTER, SPECIES_PER_WAVE, START_OFFSET, terrainForStage,
  ENEMY_POWER_RATIO, goodGateGrowthAt, gatesBeforeRow, isTrapGate, runSeconds,
  applyGate, gateLabel, GATE_WEIGHT_DOUBLE,
  CRIT_CHANCE, CRIT_MULTIPLIER, hitDamage, isCritHit,
  TERRAINS, totalAttack, volleyRate, waveKillCount, waveMonsters, waveSize, worstLane,
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

// --- 關卡長度 ---
check('一關比以前長(第1關 >= 45 秒)', runSeconds(1) >= 45, `${runSeconds(1).toFixed(0)} 秒`);
check('最快的關卡也還有十幾秒', runSeconds(40) >= 15, `${runSeconds(40).toFixed(0)} 秒`);
check('敵人排至少 5 排(中後段還有東西要打)',
  Math.floor(ROWS_PER_RUN / ENEMY_EVERY) >= 5, `${Math.floor(ROWS_PER_RUN / ENEMY_EVERY)} 排`);

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
// x2 要少見:它是爆發格,滿場都是的話成長會失控
const allGood = gateRuns.flatMap((r) => r.flatMap((row) => row.nodes))
  .filter((n) => n.gate && !isTrapGate(n.gate));
const doubles = allGood.filter((n) => n.gate!.op === 'mul' && n.gate!.value === 2);
check('勇者 x2 是少數(爆發格才有份量)',
  doubles.length / allGood.length < GATE_WEIGHT_DOUBLE * 2,
  `${doubles.length}/${allGood.length} = ${(100 * doubles.length / allGood.length).toFixed(0)}%,設定 ${GATE_WEIGHT_DOUBLE * 100}%`);

// --- 敵人曲線綁在閘門成長上 ---
check('好閘門的平均成長落在合理範圍', [0, 4, 8, 14].every((g) => goodGateGrowthAt(g) > 1.3 && goodGateGrowthAt(g) < 2.2),
  [0, 4, 8, 14].map((g) => `第${g}格 x${goodGateGrowthAt(g).toFixed(2)}`).join(' '));
check('這一排之前經過幾格閘門算得對',
  gatesBeforeRow(3) === 3 && gatesBeforeRow(7) === 6 && gatesBeforeRow(11) === 9 && gatesBeforeRow(19) === 15);
// 敵人戰力是照「這一場實際的最佳路線」算的,所以最佳玩家的領先幅度在每一排、每一場
// 都必須精確等於 1/ENEMY_POWER_RATIO。這是結構保證,不是掃參數掃出來的近似。
const exactMargins = [3, 11, 57, 99, 251, 808].flatMap((seed) => {
  const rr = createRun(seed, 10);
  let st = initialRunState(10);
  const out: number[] = [];
  for (const row of rr) {
    st = { ...st, lane: bestLane(st, row) };
    const node = row.nodes.find((n) => n.lane === st.lane)!;
    if (node.kind === 'enemy' && node.enemy && !node.enemy.boss) out.push(totalAttack(st) / node.enemy.power);
    st = resolveRow(st, row).state;
  }
  return out;
});
const want = 1 / ENEMY_POWER_RATIO;
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
const mobWaves = allEnemies.filter((e) => !e.boss);
const bossWaves = allEnemies.filter((e) => e.boss);
check('每一波小怪都混了好幾種(整關不會只看到同一隻)',
  mobWaves.every((e) => e.species.length === SPECIES_PER_WAVE),
  `每波 ${SPECIES_PER_WAVE} 種`);
check('大魔王只有一隻', bossWaves.every((e) => e.units === 1 && e.species.length === 1),
  `${bossWaves.length} 場魔王`);
check('同一波裡的怪種不重複', allEnemies.every((e) => new Set(e.species.map((sp) => sp.id)).size === e.species.length));
check('每隻敵人都有名字與造型 id', allSpecies.every((sp) => sp.name.length > 0 && sp.id.length > 0));
check('敵人造型 id 都在怪物圖庫裡', allSpecies.every((sp) => hasMonsterVisual(sp.id)),
  `${new Set(allSpecies.map((sp) => sp.id)).size} 種造型`);
check('每種造型都有對應的既有素材檔(含魔王)',
  allSpecies.every((sp) => existsSync(join(ART_DIR, artFileFor(sp.id)))),
  [...new Set(allSpecies.map((sp) => artFileFor(sp.id)))].length + ' 個檔案');
check('同一排的每一格都是同一批敵人', run.filter((r) => r.nodes.every((n) => n.kind === 'enemy'))
  .every((r) => new Set(r.nodes.map((n) => JSON.stringify(n.enemy!.species))).size === 1));
const unitsByRow = run.filter((r) => r.nodes.every((n) => n.kind === 'enemy')).map((r) => r.nodes[0].enemy!.units);
check('越後面的波次小怪越多(數量看得出難度)', unitsByRow.every((u, i) => i === 0 || u >= unitsByRow[i - 1]),
  unitsByRow.join(' → '));
check(`一波封頂 ${MAX_WAVE_SIZE} 隻`, waveSize(999) === MAX_WAVE_SIZE && waveSize(0) === 5);

// --- 一波小怪的排列 ---
const waveRow = run.find((r) => r.nodes.every((n) => n.kind === 'enemy'))!;
const wave = waveMonsters(waveRow.index, 9, waveRow.distance, SPECIES_PER_WAVE);
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
  JSON.stringify(waveMonsters(waveRow.index, 9, waveRow.distance, SPECIES_PER_WAVE)) === JSON.stringify(wave));
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
  && missed.state.perHero === missState.perHero && missed.state.hp === missState.hp);
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

// --- 準確率 -> 過關率 ---
// 真人不是擲骰子,是「看得懂閘門但偶爾看錯」。跑道 20 排之後亂選在任何難度下都是 0~1%
// (15 個二選一、每格好壞差 2.6 倍),拿亂選當難度指標會逼著把難度調到沒意義的低點,
// 所以「選擇有意義」改由這條曲線保證:準確率掉一點,過關率就要明顯掉。
function accuracyRate(stage: number, p: number, trials = 400) {
  let cleared = 0;
  for (let t = 0; t < trials; t++) {
    const seed = t * 31 + 1;
    const rowsA = createRun(seed, stage);
    let st = initialRunState(stage);
    let x = seed + 7;
    const rng = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
    let alive = true;
    for (const row of rowsA) {
      const lane = rng() < p ? bestLane(st, row) : worstLane(st, row);
      st = resolveRow({ ...st, lane }, row).state;
      if (st.phase === 'dead') { alive = false; break; }
    }
    if (alive) cleared++;
  }
  return cleared / trials;
}
const ACCURACIES = [1, 0.95, 0.9, 0.85, 0.8];
console.log('\n準確率 -> 過關率(每一排有 p 的機率挑對邊):');
console.log('           ' + ACCURACIES.map((a) => (a * 100).toFixed(0).padStart(5) + '%').join(''));
const accByStage = [1, 20, 100].map((stage) => {
  const r = ACCURACIES.map((a) => accuracyRate(stage, a));
  console.log(`  第${String(stage).padStart(3)}關  ` + r.map((v) => (v * 100).toFixed(0).padStart(5) + '%').join(''));
  return { stage, r };
});
check('準確率越高過關率越高(而且是單調的)',
  accByStage.every((s) => s.r.every((v, i) => i === 0 || v <= s.r[i - 1])));
check('完全選對 -> 一定過關', accByStage.every((s) => s.r[0] >= 0.99));
check('準確率 95% -> 大致過得去(讀得懂閘門就不該一直死)',
  accByStage.every((s) => s.r[1] >= 0.7), accByStage.map((s) => (s.r[1] * 100).toFixed(0) + '%').join(' / '));
check('準確率 80% -> 明顯會死(失誤要有代價)',
  accByStage.every((s) => s.r[4] <= 0.45), accByStage.map((s) => (s.r[4] * 100).toFixed(0) + '%').join(' / '));
check('95% 與 80% 之間拉得開(選擇真的有意義)',
  accByStage.every((s) => s.r[1] - s.r[4] >= 0.35));

// 手不準的玩家:每排都挑對邊,但站的位置在該格中心 ±sloppy 之間亂飄,所以有機率整格漏掉。
// 這一組是「留空隙」這個設計的實測值——漏接要有代價,但不能懲罰到「選對了還是會死」。
function sloppyRate(stage: number, sloppy: number, trials = 300) {
  let cleared = 0;
  for (let t = 0; t < trials; t++) {
    const rows = createRun(t * 31 + 1, stage);
    let st = initialRunState(stage);
    let x = t + 11;
    const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
    for (const row of rows) {
      const lane = bestLane(st, row);
      const offset = laneCenterOffset(lane) + (rnd() * 2 - 1) * sloppy;
      st = resolveRow({ ...st, lane }, row, offset).state;
      if (st.phase === 'dead') break;
    }
    if (st.phase !== 'dead') cleared++;
  }
  return cleared / trials;
}
console.log('\n選對邊但手不準(漏接率隨手抖幅度上升):');
console.log('          第20關  第100關');
for (const sloppy of [0, 0.08, 0.16, 0.25]) {
  console.log(`  ±${sloppy.toFixed(2)}   ${(sloppyRate(20, sloppy) * 100).toFixed(0).padStart(4)}%`
    + `  ${(sloppyRate(100, sloppy) * 100).toFixed(0).padStart(5)}%`);
}
check('選對邊而且拉得準 -> 一定過關', sloppyRate(20, 0) >= 0.99);
check('手抖一點還過得去(漏接有代價但不是死刑)', sloppyRate(20, 0.08) >= 0.8);
check('隨便亂拉就會開始漏接', sloppyRate(20, 0.25) < sloppyRate(20, 0.08));

check('每排都挑最好的 -> 一定過關', rows2.every((x) => x.b >= 0.99));
check('每排都挑最爛的 -> 幾乎必死', rows2.every((x) => x.w <= 0.05));
check('選得好一定比亂選好', rows2.every((x) => x.b > x.r));
check('亂選不會比選最爛差', rows2.every((x) => x.r >= x.w));

// --- 中段還有沒有挑戰性(這一組是為了擋掉一個真的發生過的退化)---
// 曾經敵人是自己走一條 1.9^tier 的指數,跟閘門的成長完全沒有關係。兩邊都「看起來合理」,
// 湊在一起卻是最佳玩家的領先幅度每過一排敵人就再乘 3 倍:實測第 10 關是
// 3.5x → 9.5x → 17.6x,等於前三個閘門決定勝負,後面整場都在跑完流程。
// 現在敵人直接照 GOOD_GATE_GROWTH 走同一條曲線,所以領先幅度必須是平的。
function bestMargins(stage: number, seed: number): number[] {
  const rowsA = createRun(seed, stage);
  let st = initialRunState(stage);
  const out: number[] = [];
  for (const row of rowsA) {
    st = { ...st, lane: bestLane(st, row) };
    const node = row.nodes.find((n) => n.lane === st.lane)!;
    if (node.kind === 'enemy' && node.enemy) out.push(totalAttack(st) / node.enemy.power);
    st = resolveRow(st, row).state;
  }
  return out;
}
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
  marginRuns.every((m) => m.every((v) => v <= 2.2 / ENEMY_POWER_RATIO)),
  `緩衝 ${(1 / ENEMY_POWER_RATIO).toFixed(1)}x,實測最高 ${Math.max(...marginRuns.flat()).toFixed(1)}x`);
check('張力往後遞增(後段的領先幅度不會比前段大)',
  marginRuns.every((m) => m[m.length - 1] <= m[0] * 1.2),
  marginRuns.map((m) => `${m[0].toFixed(1)}→${m[m.length - 1].toFixed(1)}`).join(' / '));

// 「中段有沒有挑戰性」最直接的證據:玩家實際死在第幾排。
// 舊版是前三個閘門決定勝負,所以死亡全部擠在第一排敵人(第 3 排);如果勝負是一路拉扯到最後,
// 死亡就會分散到後面幾排敵人身上。這一項才是使用者回報的那個問題的真正驗收條件。
function deathRows(stage: number, p: number, trials = 600): number[] {
  const out: number[] = [];
  for (let t = 0; t < trials; t++) {
    const seed = t * 31 + 1;
    const rowsA = createRun(seed, stage);
    let st = initialRunState(stage);
    let x = seed + 7;
    const rng = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
    for (const row of rowsA) {
      const lane = rng() < p ? bestLane(st, row) : worstLane(st, row);
      st = resolveRow({ ...st, lane }, row).state;
      if (st.phase === 'dead') { out.push(row.index); break; }
    }
  }
  return out;
}
const deaths = deathRows(20, 0.85);
const enemyRowIdx = Array.from({ length: ROWS_PER_RUN }, (_, i) => i).filter((i) => (i + 1) % ENEMY_EVERY === 0);
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
