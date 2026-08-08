// 跑一場的模擬器。三份 verify 腳本共用同一份,不要各自複製一份迴圈。
//
// 為什麼要共用:敵人戰力是照「這一場的最佳路線」算的,而最佳路線包含**場內技能**
// (打完一波給一次,見 game/laneRunSkills.ts)。模擬的時候漏掉技能,玩家就會比敵人
// 假設的弱一大截,量出來的過關率整片失真——而且三份腳本各寫一份的話,
// 只會有一份被記得更新,另外兩份會靜靜地量錯東西。

import {
  applyRockHit, bestLane, createRocks, createRun, initialRunState, isEnemyRowIndex, LANE_COUNT,
  laneCenterOffset, resolveRow, wavesForStage, worstLane, activeSkillCountForStage,
  type Lane, type RunRow, type RunStart, type RunState,
} from '../game/laneRun';
import {
  applyRunSkillPick, bestRunSkillChoice, learnRunSkill, runSkillOffersAt, runSkillPicksForWave,
  type RunSkillState,
} from '../game/laneRunSkills';

export type LanePicker = (state: RunState, row: RunRow, rng: () => number) => Lane;

export const pickBest: LanePicker = (s, row) => bestLane(s, row);
export const pickWorst: LanePicker = (s, row) => worstLane(s, row);
export const pickRandom: LanePicker = (_s, _row, rng) => Math.floor(rng() * LANE_COUNT) as Lane;
/** 準確率 p:每排有 p 的機率挑對邊。真人比較像這個,不像擲骰子。 */
export const pickAccurate = (p: number): LanePicker => (s, row, rng) =>
  (rng() < p ? bestLane(s, row) : worstLane(s, row));

export interface SimResult {
  outcome: 'cleared' | 'dead';
  state: RunState;
  /** 死在第幾排(活著回傳 -1) */
  deathRow: number;
  /** 每一排敵人的「總戰力 / 敵人戰力」 */
  margins: { rowIndex: number; margin: number; boss: boolean }[];
  runSkills: RunSkillState[];
  /** 這一場路上有幾顆石頭、撞到幾顆。 */
  rocks: number;
  rockHits: number;
}

export interface SimOptions {
  start?: RunStart;
  /**
   * 手抖幅度:站的位置在該格中心 ±sloppy 之間亂飄,所以有機率整格漏掉。
   * 這一項一定要走這支模擬器,不要在腳本裡另外寫一圈——手寫的那圈漏掉場內技能,
   * 玩家就會比敵人假設的弱一整條技能曲線,量出來是「拉得再準也 0% 過關」。
   */
  sloppy?: number;
  /**
   * 撞上石頭的機率(0 = 每顆都閃掉)。
   *
   * 石頭不是「選項」,是反應題:它只擋住跑道的一小段,站哪裡都閃得掉,
   * 所以**完美玩家的 rockHitRate 必須是 0**——敵人戰力是照完美玩家算的,
   * 石頭刻意不進理想路線(見 laneRun 的石頭段落),模擬器這邊也必須對齊,
   * 不然量出來的「每排都挑最好 → 100% 過關」會莫名其妙破掉。
   */
  rockHitRate?: number;
  /**
   * 掃過整條跑道的比例(1 = 每一隻都拉到射程內)。
   *
   * 射程寬度上線之後,站著不動只打得到半條跑道(見 laneRun 的 FIRE_WIDTH),
   * 沒被覆蓋到的那幾隻戰力再高也清不掉。**完美玩家必須是 1**:一波怪是陸續抵達的
   * (整個戰鬥段 18 秒),所以掃得完全部——理想路線照舊假設全清,敵人曲線一格都沒動,
   * 結構保證就是靠這一條成立的。模擬真人時用「準確率」當覆蓋率。
   */
  sweep?: number;
}

export function simulateRun(
  seed: number,
  stage: number,
  pick: LanePicker,
  opts: SimOptions = {},
): SimResult {
  const { start, sloppy = 0, rockHitRate = 0, sweep = 1 } = opts;
  const rows = createRun(seed, stage);
  const rocks = createRocks(seed, stage);
  let st = start ? initialRunState(stage, start) : initialRunState(stage);
  let x = seed + 7;
  const rng = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };

  const totalWaves = wavesForStage(stage);
  let skills: RunSkillState[] = [];
  let waveIndex = 0;
  let skillOrdinal = 0;
  const margins: SimResult['margins'] = [];
  let nextRock = 0;
  let rockHits = 0;

  /** 跑到這一排之前會先經過的石頭。石頭夾在排與排之間,不是排本身。 */
  function passRocksBefore(distance: number) {
    while (nextRock < rocks.length && rocks[nextRock].distance <= distance) {
      nextRock += 1;
      if (rng() >= rockHitRate) continue; // 閃掉了
      rockHits += 1;
      st = applyRockHit(st).state;
    }
  }

  for (const row of rows) {
    passRocksBefore(row.distance);
    st = { ...st, lane: pick(st, row, rng) };
    const node = row.nodes.find((n) => n.lane === st.lane);
    if (node?.kind === 'enemy' && node.enemy) {
      margins.push({ rowIndex: row.index, margin: (st.heroes * st.perHero) / node.enemy.power, boss: node.enemy.boss === true });
    }
    // 手抖:挑對邊了,但站的位置離該格中心有偏差,偏太多就整格漏掉(閘門左右都留空隙)。
    const offset = sloppy > 0 ? laneCenterOffset(st.lane) + (rng() * 2 - 1) * sloppy : undefined;
    // 射程寬度:這一波有幾隻被拉到射程內。sweep = 1 就是全部(完美玩家)。
    const node2 = row.nodes.find((n) => n.lane === st.lane);
    const units = node2?.kind === 'enemy' ? node2.enemy?.units ?? 0 : 0;
    const boost = units > 0 && sweep < 1
      ? { coveredUnits: Math.max(0, Math.round(units * sweep)) }
      : undefined;
    st = resolveRow(st, row, offset, boost).state;
    if (st.phase === 'dead') {
      return {
        outcome: 'dead', state: st, deathRow: row.index, margins, runSkills: skills,
        rocks: rocks.length, rockHits,
      };
    }
    // 打完一波就給技能,規則跟遊戲裡一模一樣。
    if (isEnemyRowIndex(row.index, stage)) {
      const picks = runSkillPicksForWave(waveIndex, totalWaves);
      waveIndex += 1;
      for (let k = 0; k < picks; k++) {
        // 選項綁 seed:createRun 的理想路線重播的是同一串,兩邊才對得起來。
        const offers = runSkillOffersAt(skills, seed, skillOrdinal, activeSkillCountForStage(stage));
        skillOrdinal += 1;
        if (offers.length === 0) break;
        const choice = bestRunSkillChoice(skills, offers);
        const grown = applyRunSkillPick(skills, choice, st);
        skills = learnRunSkill(skills, choice);
        st = { ...st, ...grown };
      }
    }
  }
  return {
    outcome: 'cleared', state: st, deathRow: -1, margins, runSkills: skills,
    rocks: rocks.length, rockHits,
  };
}

/** 過關率。 */
export function clearRate(stage: number, pick: LanePicker, trials = 400, opts: SimOptions = {}): number {
  let cleared = 0;
  for (let t = 0; t < trials; t++) {
    if (simulateRun(t * 31 + 1, stage, pick, opts).outcome === 'cleared') cleared++;
  }
  return cleared / trials;
}
