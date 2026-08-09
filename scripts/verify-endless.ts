// 生存(無限)模式的驗證。
//
// 這個模式跟一般關卡只差三件事,而三件都在「連續」這個字上:
//   1. 波數一路累加,不分關卡
//   2. 人數 / 裝備 / 技能不重來(交棒,見 laneRun 的 RunCarry)
//   3. 技能等級沒有上限(10 格滿了之後,選單裡剩下的就是把手上的練上去)
//
// 而三件都會動到同一條神經:**敵人戰力是照「這一場的最佳路線」算的**。
// 玩家側接下去而敵人側沒接,整輪就變成散步;反過來則是第二段就死。
// 所以這份腳本盯的核心只有一句:**接力之後,領先幅度仍然是每一段都一樣。**

import { simulateRun, pickBest, pickAccurate, type SimHandoff } from './simRun';
import { ENEMY_POWER_RATIO, wavesForStage } from '../game/laneRun';
import { TOTAL_STAGES } from '../game/save';
import { MAX_RUN_SKILL_SLOTS, runSkillLevel } from '../game/laneRunSkills';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

/** 從第 from 關開始,一段接一段跑 segments 段。準確率 p 的玩家。 */
function chain(seed: number, from: number, segments: number, p: number) {
  let handoff: SimHandoff | undefined;
  let stage = from;
  let waves = 0;
  const out: { stage: number; margin: number; heroes: number; power: number; cleared: boolean }[] = [];
  for (let i = 0; i < segments; i++) {
    const r = simulateRun(seed + i * 977, stage, p >= 1 ? pickBest : pickAccurate(p), { handoff });
    const margin = r.margins.length > 0
      ? r.margins.reduce((a, m) => a + m.margin, 0) / r.margins.length
      : 0;
    out.push({
      stage,
      margin,
      heroes: r.state.heroes,
      power: r.state.heroes * r.state.perHero,
      cleared: r.outcome === 'cleared',
    });
    if (r.outcome === 'dead') break;
    waves += wavesForStage(stage);
    handoff = r.handoff;
    stage = Math.min(TOTAL_STAGES, stage + 1);
  }
  return { segments: out, waves, handoff };
}

// ---- 1. 結構保證:接力之後,每一段的領先幅度仍然是 1 / ENEMY_POWER_RATIO ----
//
// 這是整個模式的地基。第一段沒有交棒,第十段是接了九次的結果——兩者的領先幅度必須一樣,
// 否則就是「兩條各走各的曲線」那個老問題的第 N 次現身(這個專案摔過好幾次)。
{
  const want = 1 / ENEMY_POWER_RATIO;
  const runs = [1, 2, 3].map((k) => chain(k * 31337, 12, 10, 1));
  const all = runs.flatMap((r) => r.segments.map((s) => s.margin));
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  check('每排都挑最好 -> 十段全部通關(接力之後結構保證仍然成立)',
    runs.every((r) => r.segments.length === 10 && r.segments.every((s) => s.cleared)),
    runs.map((r) => `${r.segments.filter((s) => s.cleared).length}/10`).join(' '));
  check('領先幅度不隨段數漂移(第 1 段跟第 10 段一樣)',
    lo > want * 0.8 && hi < want * 1.35,
    `目標 ${want.toFixed(2)}x,實測 ${lo.toFixed(2)}~${hi.toFixed(2)}x`);
  // 漂移的方向也要看:如果每一段都比前一段高一點,那就是玩家在慢慢超前敵人,
  // 十段看不出來、一百段就變成散步(而這個模式本來就打得到一百段)。
  const first = runs.map((r) => r.segments[0].margin);
  const last = runs.map((r) => r.segments[9].margin);
  const drift = Math.max(...last.map((v, i) => v / first[i]));
  check('領先幅度沒有逐段累積(第 10 段 / 第 1 段 < 1.3)',
    drift < 1.3, `最大 ${drift.toFixed(2)}x`);
}

// ---- 2. 交棒真的有接:人數與戰力是連續的 ----
//
// 「不重來」這件事用眼睛看很容易騙過去(畫面上人數一直在動),所以直接斷言:
// 第二段的起跑人數 = 第一段的結束人數。
{
  let handoff: SimHandoff | undefined;
  const r1 = simulateRun(555, 12, pickBest);
  handoff = r1.handoff;
  const r2 = simulateRun(556, 13, pickBest, { handoff });
  // 模擬器不會回報「起跑時」的狀態,所以改用一個等價的斷言:接力的那一段結束時,
  // 人數一定比「同一段但從頭開始」多得多(從 1 人滾 vs 從幾十人滾)。
  const solo = simulateRun(556, 13, pickBest);
  check('接力的一段從上一段的人數繼續滾(不是從 1 個人重來)',
    r2.state.heroes > solo.state.heroes * 2,
    `接力 ${r2.state.heroes} 人 vs 重來 ${solo.state.heroes} 人(上一段結束 ${r1.state.heroes} 人)`);
  check('技能也接下去(不是每段重挑)',
    r2.runSkills.length >= r1.runSkills.length && r1.runSkills.length > 0,
    `${r1.runSkills.length} 款 -> ${r2.runSkills.length} 款`);
}

// ---- 3. 技能:格數仍然是 10,但等級可以一路長 ----
{
  const { handoff } = chain(9182736, 12, 12, 1);
  const skills = handoff?.skills ?? [];
  const levels = skills.map((s) => runSkillLevel(skills, s.id));
  check(`帶著的技能不超過 ${MAX_RUN_SKILL_SLOTS} 格(接十二段也一樣)`,
    skills.length <= MAX_RUN_SKILL_SLOTS, `${skills.length} 格`);
  check('等級突破舊上限 5(接力之後真的一路長)',
    Math.max(...levels, 0) > 5, `最高 ${Math.max(...levels, 0)} 級`);
}

// ---- 4. 死了就是死了:準確率不夠的人撐不到十段 ----
//
// 沒有這一項的話,上面全部通過也可能只是「難度被接力稀釋掉了」。
{
  const avgOf = (p: number) => {
    const trials = Array.from({ length: 24 }, (_, i) => chain(i * 7919 + 13, 12, 12, p));
    const reached = trials.map((t) => t.segments.filter((s) => s.cleared).length);
    return reached.reduce((a, b) => a + b, 0) / reached.length;
  };
  const mid = avgOf(0.9);
  const good = avgOf(0.95);
  // **不能拿「平均撐過幾段」當唯一指標的下限。** 第一段本來就是一般小關的難度曲線
  //(90% 準確率 → 50% 過關),所以一半的人在第一段就結束是設計好的,不是接力壞了。
  // 要看的是**斜率**:拉得準的人明顯走得遠,而拉不準的人走不遠。
  check('接力沒有把難度稀釋掉(90% 準確率仍然走不完十二段)',
    mid < 6, `平均撐過 ${mid.toFixed(1)} 段`);
  check('準確率換得到距離(95% 明顯比 90% 走得遠)',
    good > mid * 2, `90% → ${mid.toFixed(1)} 段,95% → ${good.toFixed(1)} 段`);
}

// ---- 5. 數字不會爆掉:十二段之後仍然是看得懂的量級 ----
//
// 交棒是複利,所以這一項不是形式主義:一段 x100 的話十二段就是 10^24,
// 畫面上會變成一串沒有意義的位數(而 compact() 也救不了)。
{
  const { segments } = chain(24680, 12, 12, 1);
  const end = segments[segments.length - 1];
  // 每一段大約長一個量級(x10),十二段就是 1e4 x 10^11 左右。真正的要求不是「小」,
  // 而是**畫面上寫得出來**:compact 備到「垓」(1e20),所以這裡盯的是十二段還沒越過它。
  check('十二段之後的戰力仍在 1e20 以內(compact 還寫得出中文單位)',
    end.power < 1e20, `第 ${segments.length} 段結束 ${end.power.toExponential(2)}`);
}

console.log(failed === 0 ? '\n全部通過' : `\n${failed} 項未通過`);
process.exit(failed === 0 ? 0 : 1);
