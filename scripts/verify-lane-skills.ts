// 技能驗證。技能是每關一次的養成,幅度必須比轉職更小——這裡要證明的是
// 「選技能有感,但把技能點滿也買不到勝利」。
import {
  applySkills, describeSkill, learnSkill, MAX_SKILL_LEVEL, MAX_SKILL_SLOTS,
  maxAttackMultiplierFromSkills, OFFERS_PER_CLEAR, SKILLS, skillLevel, skillOffers,
  type SkillState,
} from '../game/laneSkills';
import { runStartFor } from '../game/laneJobs';
import {
  bestLane, createRun, DEFAULT_RUN_START, initialRunState, LANE_COUNT, resolveRow,
  totalAttack, worstLane, type Lane, type RunStart, type RunState,
} from '../game/laneRun';

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
check('增援加血也加一點戰力',
  applySkills(DEFAULT_RUN_START, [{ id: 'reinforce', level: 5 }]).hpMultiplier > DEFAULT_RUN_START.hpMultiplier
  && applySkills(DEFAULT_RUN_START, [{ id: 'reinforce', level: 5 }]).attackMultiplier > DEFAULT_RUN_START.attackMultiplier);
// 任何養成都不准給起跑人數。給了的話 perHero 會被稀釋,而跑道上的「勇者 +N」是固定值,
// 收益 = N x 每人攻擊力——於是點越多越弱。實測過一次:全開 22% vs 裸裝 54%。
const everySkillCombo = (['forge', 'reinforce', 'toughen', 'craft'] as const)
  .flatMap((id) => [1, 3, 5].map((level) => applySkills(DEFAULT_RUN_START, [{ id, level }])));
check('沒有任何技能會增加起跑人數(給了就會讓玩家越點越弱)',
  everySkillCombo.every((s) => s.heroes === 1) && maxedStart.heroes === 1);
check('精工真的升武器階', applySkills(DEFAULT_RUN_START, [{ id: 'craft', level: 5 }]).gear
  === DEFAULT_RUN_START.gear + 2);
check('堅韌只加血不加戰力',
  applySkills(DEFAULT_RUN_START, [{ id: 'toughen', level: 5 }]).hpMultiplier > DEFAULT_RUN_START.hpMultiplier
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
type Picker = (s: RunState, row: ReturnType<typeof createRun>[number], r: () => number) => Lane;
function play(seed: number, stage: number, start: RunStart, pick: Picker) {
  const rows = createRun(seed, stage);
  let st = initialRunState(stage, start);
  const r = (() => { let x = seed + 7; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; })();
  for (const row of rows) {
    st = { ...st, lane: pick(st, row, r) };
    st = resolveRow(st, row).state;
    if (st.phase === 'dead') return 'dead' as const;
  }
  return 'cleared' as const;
}
const pickBest: Picker = (s, row) => bestLane(s, row);
const pickWorst: Picker = (s, row) => worstLane(s, row);
const pickRandom: Picker = (_s, _row, r) => Math.floor(r() * LANE_COUNT) as Lane;
/**
 * 準確率 p 的玩家:每排有 p 的機率挑對邊。
 * 「養成有沒有意義」要用這個量,不能用亂選——跑道 20 排之後亂選在任何設定下都是 0~1%,
 * 兩邊都貼著地板,比出來的是雜訊不是效果(同一個理由見 CLAUDE.md 的難度指標那段)。
 */
function accRate(stage: number, start: RunStart, p: number, trials = 400) {
  let cleared = 0;
  for (let t = 0; t < trials; t++) {
    const seed = t * 31 + 1;
    const rows = createRun(seed, stage);
    let st = initialRunState(stage, start);
    let x = seed + 7;
    const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
    let alive = true;
    for (const row of rows) {
      const lane = rnd() < p ? bestLane(st, row) : worstLane(st, row);
      st = resolveRow({ ...st, lane }, row).state;
      if (st.phase === 'dead') { alive = false; break; }
    }
    if (alive) cleared++;
  }
  return cleared / trials;
}
function rate(stage: number, start: RunStart, pick: Picker, trials = 300) {
  let cleared = 0;
  for (let t = 0; t < trials; t++) if (play(t * 31 + 1, stage, start, pick) === 'cleared') cleared++;
  return cleared / trials;
}

const fullyLoaded = applySkills(runStartFor({ archetype: 'physicalMelee', branch: 'B', tier: 5 }), maxed);
console.log('\n第 25 關(滿階職業 + 滿技能 vs 什麼都沒有):');
for (const [label, start] of [['全開', fullyLoaded], ['裸裝', DEFAULT_RUN_START]] as const) {
  const b = rate(25, start, pickBest), r = rate(25, start, pickRandom), w = rate(25, start, pickWorst);
  console.log(`  ${label}  最佳 ${(b * 100).toFixed(0)}%  隨機 ${(r * 100).toFixed(0)}%  最差 ${(w * 100).toFixed(0)}%`);
}
console.log(`  (全開的起跑倍率:戰力 x${fullyLoaded.attackMultiplier.toFixed(2)}、`
  + `血量 x${fullyLoaded.hpMultiplier.toFixed(2)}、${fullyLoaded.heroes} 人、武器 ${fullyLoaded.gear} 階)`);

check('全開之後亂選還是會輸(養成買不到勝利)', rate(25, fullyLoaded, pickRandom) <= 0.7,
  `${(rate(25, fullyLoaded, pickRandom) * 100).toFixed(0)}%`);
check('全開之後一路選最爛照樣死', rate(25, fullyLoaded, pickWorst) <= 0.05);
const accFull = accRate(25, fullyLoaded, 0.85);
const accBare = accRate(25, DEFAULT_RUN_START, 0.85);
check('全開確實比裸裝好過(養成有意義)', accFull > accBare,
  `85% 準確率:全開 ${(accFull * 100).toFixed(0)}% vs 裸裝 ${(accBare * 100).toFixed(0)}%`);
check('但養成的幅度是小的(買不到勝利)', accFull - accBare < 0.35,
  `差 ${((accFull - accBare) * 100).toFixed(0)} 個百分點`);
check('全開之後每排都挑最好的仍然一定過關', rate(25, fullyLoaded, pickBest) >= 0.99);

console.log(fail === 0 ? '\n全部通過' : `\n${fail} 項失敗`);
process.exit(fail === 0 ? 0 : 1);
