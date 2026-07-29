import { useCallback, useEffect, useRef, useState } from 'react';

import {
  clampOffset,
  createRun,
  fireIntervalMs,
  HITS_PER_MONSTER,
  initialRunState,
  MAX_FIRE_INTERVAL_MS,
  laneCenterOffset,
  laneFromOffset,
  moveLane,
  resolveRow,
  runLength,
  runSpeed,
  START_OFFSET,
  totalAttack,
  VISIBLE_AHEAD,
  volleyRate,
  waveKillCount,
  waveMonsters,
  DEFAULT_RUN_START,
  hitDamage,
  isCritHit,
  type Lane,
  type RunRow,
  type RunStart,
  type RunState,
  type WaveMonster,
  type WaveSpecies,
} from '../game/laneRun';

const TICK_MS = 33; // ~30fps

// 按鈕/方向鍵是「移到隔壁跑道中央」,但不瞬移——瞬移的話畫面上看不出角色移動過,
// 跟手指拖的體感也對不起來。每 tick 追上剩餘距離的 30%,約 5 tick(0.17 秒)到位,
// 比最快關卡的一排 0.9 秒短很多,不會出現「按了卻來不及到」的情況。
const EASE_PER_TICK = 0.3;
const SNAP_EPSILON = 0.002;

/** 丟出去的武器相對於勇者往前飛的速度(距離單位/秒)。夠快才看得出是「擲出去」而不是飄走。 */
const PROJECTILE_SPEED = 420;
/** 進到這個距離內才開始丟。太遠就開丟的話,武器會在畫面外飛很久,看起來像亂丟。 */
const FIRE_RANGE = 260;

export interface RunFeedback {
  key: number;
  message: string;
  hpDelta: number;
  attackDelta: number;
}

/**
 * 命中時跳出來的傷害數字。位置用「絕對距離 + 橫向 offset」跟小怪同一個座標系,
 * 畫面才不用另外換算——數字要跟著被打的那隻一起往勇者移動,釘在螢幕座標會飄掉。
 */
export interface HitNumber {
  id: number;
  value: number;
  crit: boolean;
  offset: number;
  distance: number;
  /** 出生時間,畫面拿它算飄多高、淡多少 */
  bornAt: number;
}

/** 數字浮多久。太長會整片數字疊在一起看不清楚,太短看不到。 */
export const HIT_NUMBER_MS = 620;

/** 飛行中的武器。位置跟排、跟小怪同一個座標系(絕對距離),畫面才不用換算兩套。 */
export interface Projectile {
  id: number;
  distance: number;
  fromDistance: number;
  fromOffset: number;
  toOffset: number;
  targetIndex: number;
}

export interface WaveView {
  rowIndex: number;
  species: WaveSpecies[];
  boss: boolean;
  /** 每隻的血條:已挨幾下 / 要挨幾下。魔王打很久,沒有進度條會不知道打到哪了。 */
  hitsOn: number[];
  hitsPerUnit: number;
  monsters: WaveMonster[];
  /** 每一隻倒了沒。倒下的不再畫,活著的會一路衝到勇者頭上。 */
  down: boolean[];
}

function sameFlags(a: boolean[], b: boolean[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export interface LaneRunView {
  rows: RunRow[];
  state: RunState;
  /** 已跑距離 */
  distance: number;
  /** 角色橫向位置,0 = 跑道最左、1 = 最右 */
  heroOffset: number;
  /** 還沒通過的排(畫面上要畫出來的) */
  upcoming: RunRow[];
  /** 正在衝過來的那一波小怪(沒有就是 null) */
  wave: WaveView | null;
  projectiles: Projectile[];
  /** 命中瞬間跳出來的傷害數字(含暴擊)。純演出,不影響擊殺數。 */
  hitNumbers: HitNumber[];
  feedback: RunFeedback | null;
  speed: number;
  /** 手指拖曳:直接把角色放到這個位置 */
  dragTo: (offset: number) => void;
  /** 方向鍵:滑順移到隔壁跑道中央 */
  steer: (direction: 'left' | 'right') => void;
  stage: number;
}

interface WaveRuntime {
  rowIndex: number;
  species: WaveSpecies[];
  power: number;
  /** 這一波每隻要挨幾下。一般小怪 3 下,大魔王 12 下——所以魔王戰才有「打很久」的過程。 */
  hitsPerUnit: number;
  boss: boolean;
  monsters: WaveMonster[];
  /** 每一隻各自挨了幾下。打不倒的那幾隻也會累加——勇者照樣丟,只是丟不倒。 */
  hitsOn: number[];
  lastFireAt: number;
}

// 一場跑圖就是一個 hook 實例:重跑、下一關都由外層換 key 重新掛載,不在 hook 裡自己 reset。
// 自己 reset 要記得清掉的東西有八個(波次、飛行中的武器、已結算的排、計時起點…),
// 漏掉任何一個就會出現「上一場的怪出現在這一場」這種難查的殘留。
export function useLaneRun(stage: number, start: RunStart = DEFAULT_RUN_START): LaneRunView {
  const [rows] = useState<RunRow[]>(() => createRun(Math.floor(Math.random() * 1e9), stage));
  const [state, setState] = useState<RunState>(() => initialRunState(stage, start));
  const [distance, setDistance] = useState(0);
  const [feedback, setFeedback] = useState<RunFeedback | null>(null);
  const [wave, setWave] = useState<WaveView | null>(null);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [hitNumbers, setHitNumbers] = useState<HitNumber[]>([]);

  const startedAtRef = useRef(Date.now());
  // 已結算過的排。跟判定同步讀寫,走 state 會慢一拍導致同一排被結算兩次。
  const passedRef = useRef<Set<number>>(new Set());
  const feedbackKeyRef = useRef(0);
  // 戰鬥演出要讀當下的攻擊力(波次中途吃到 x2 閘門,打得掉的隻數要立刻跟著變),
  // 但它跑在 setInterval 裡,閉包抓到的會是舊的 state,所以另外鏡射一份。
  const stateRef = useRef(state);
  stateRef.current = state;

  const waveRef = useRef<WaveRuntime | null>(null);
  const projectilesRef = useRef<Projectile[]>([]);
  const projectileIdRef = useRef(0);
  const hitNumbersRef = useRef<HitNumber[]>([]);
  const hitNumberIdRef = useRef(0);

  // 角色位置同時放在 ref 與 state:ref 給結算用(要拿到「這一瞬間」的位置,不能慢一拍,
  // 慢一拍就會發生「明明已經拉到隔壁格了卻吃到原本那格」),state 只是拿來觸發重畫。
  const offsetRef = useRef(START_OFFSET);
  const targetRef = useRef(START_OFFSET);
  const [heroOffset, setHeroOffset] = useState(START_OFFSET);

  const speed = runSpeed(stage);

  useEffect(() => {
    if (state.phase !== 'running') return;
    const id = setInterval(() => {
      const now = Date.now();
      const travelled = ((now - startedAtRef.current) / 1000) * speed;
      setDistance(travelled);

      const gap = targetRef.current - offsetRef.current;
      if (gap !== 0) {
        const next = Math.abs(gap) < SNAP_EPSILON ? targetRef.current : offsetRef.current + gap * EASE_PER_TICK;
        offsetRef.current = next;
        setHeroOffset(next);
      }

      stepWave(now, travelled);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [state.phase, speed, rows]);

  /** 一波小怪的演出:該冒出來的冒出來、該丟的武器丟出去、打中的就消失。 */
  function stepWave(now: number, travelled: number) {
    // 找出「正在逼近」的那一排敵人。排距 100、每 4 排一次敵人,所以同時最多只會有一波在畫面上。
    const enemyRow = rows.find(
      (r) =>
        !passedRef.current.has(r.index) &&
        r.nodes[0]?.kind === 'enemy' &&
        r.distance - travelled <= VISIBLE_AHEAD,
    );

    if (!enemyRow) {
      if (waveRef.current !== null) {
        waveRef.current = null;
        projectilesRef.current = [];
        hitNumbersRef.current = [];
        setWave(null);
        setProjectiles([]);
        setHitNumbers([]);
      }
      return;
    }

    const enemy = enemyRow.nodes[0].enemy!;
    let current = waveRef.current;
    if (current === null || current.rowIndex !== enemyRow.index) {
      current = {
        rowIndex: enemyRow.index,
        species: enemy.species,
        power: enemy.power,
        hitsPerUnit: enemy.hitsPerUnit ?? HITS_PER_MONSTER,
        boss: enemy.boss === true,
        monsters: waveMonsters(enemyRow.index, enemy.units, enemyRow.distance, enemy.species.length),
        hitsOn: new Array(enemy.units).fill(0),
        lastFireAt: 0,
      };
      waveRef.current = current;
      projectilesRef.current = [];
    }

    // 打得掉幾隻每個 tick 重算:波次中途吃到閘門,攻擊力一變,能清掉的隻數就跟著變。
    // 前 kills 隻是「打得倒的」,後面那幾隻挨再多下也不會倒——那就是戰力壓不過的部分。
    const kills = waveKillCount(totalAttack(stateRef.current), current.power, current.monsters.length);
    const isDown = (i: number) => i < kills && current!.hitsOn[i] >= current!.hitsPerUnit;

    // --- 丟武器 ---
    // 打不倒的也照丟。丟到打得倒的都倒了就停手的話,剩下那段路上小怪一直衝過來、勇者卻站著
    // 不動,看起來像當掉;照丟才看得出「不是他不打,是打不動」。
    const inFlightOn = new Array(current.monsters.length).fill(0);
    for (const p of projectilesRef.current) inFlightOn[p.targetIndex] += 1;

    let targetIndex = -1;
    let remainingDoomedShots = 0;
    for (let i = 0; i < current.monsters.length; i++) {
      if (isDown(i)) continue;
      if (current.monsters[i].distance <= travelled) continue; // 已經越過勇者,不用再丟
      if (i < kills) remainingDoomedShots += Math.max(0, current.hitsPerUnit - current.hitsOn[i] - inFlightOn[i]);
      if (targetIndex < 0 && current.monsters[i].distance - travelled <= FIRE_RANGE) targetIndex = i;
    }

    if (targetIndex >= 0) {
      const lastDoomed = current.monsters[Math.max(0, kills - 1)];
      const msUntilLastKill = Math.max(0, ((lastDoomed.distance - travelled) / speed) * 1000);
      const base =
        remainingDoomedShots > 0 ? fireIntervalMs(msUntilLastKill, remainingDoomedShots) : MAX_FIRE_INTERVAL_MS;
      // 人越多丟越密。這是「人數變多」在戰鬥畫面上唯一看得出來的地方。
      const interval = base / volleyRate(stateRef.current.heroes);
      if (now - current.lastFireAt >= interval) {
        current.lastFireAt = now;
        projectileIdRef.current += 1;
        const id = projectileIdRef.current;
        // 每一把從隊伍裡不同的人手上飛出去(依 id 散開),不是全部從同一個點噴出來。
        const spread = Math.min(0.09, 0.02 * Math.min(stateRef.current.heroes, 6));
        const fromOffset = clampOffset(offsetRef.current + ((id % 5) / 4 - 0.5) * 2 * spread);
        projectilesRef.current = [
          ...projectilesRef.current,
          {
            id,
            distance: travelled,
            fromDistance: travelled,
            fromOffset,
            toOffset: current.monsters[targetIndex].offset,
            targetIndex,
          },
        ];
      }
    }

    // --- 武器往前飛,飛到目標身上就算命中,挨滿 HITS_PER_MONSTER 下的(打得倒的那些)就倒 ---
    const newHits: HitNumber[] = [];
    if (projectilesRef.current.length > 0) {
      const step = ((speed + PROJECTILE_SPEED) * TICK_MS) / 1000;
      const flying: Projectile[] = [];
      for (const p of projectilesRef.current) {
        const moved = { ...p, distance: p.distance + step };
        const target = current.monsters[p.targetIndex];
        if (target && moved.distance >= target.distance) {
          current.hitsOn[p.targetIndex] += 1;
          // 命中就跳一個傷害數字。是不是暴擊由「第幾排/第幾隻/第幾下」的雜湊決定,不是亂數——
          // 這個 tick 迴圈每 33ms 跑一次,用亂數的話同一下會一直重抽,數字會閃爍。
          const ordinal = current.hitsOn[p.targetIndex];
          const crit = isCritHit(current.rowIndex, p.targetIndex, ordinal);
          hitNumberIdRef.current += 1;
          newHits.push({
            id: hitNumberIdRef.current,
            value: hitDamage(totalAttack(stateRef.current), current.hitsPerUnit, crit),
            crit,
            offset: target.offset,
            distance: target.distance,
            bornAt: now,
          });
          continue; // 命中就收掉,不再畫
        }
        flying.push(moved);
      }
      projectilesRef.current = flying;
      setProjectiles(flying);
    }

    // 過期的數字丟掉。沒有新命中而且也沒有要過期的就不要 setState——這個迴圈每 33ms 跑一次,
    // 每次都換一個新陣列的話畫面每格都重畫一次,手機上會開始掉幀。
    const live = hitNumbersRef.current.filter((h) => now - h.bornAt < HIT_NUMBER_MS);
    if (newHits.length > 0 || live.length !== hitNumbersRef.current.length) {
      hitNumbersRef.current = [...live, ...newHits];
      setHitNumbers(hitNumbersRef.current);
    }

    const down = current.monsters.map((m) => isDown(m.index));
    setWave((prev) =>
      prev !== null
      && prev.rowIndex === current!.rowIndex
      && sameFlags(prev.down, down)
      && prev.hitsOn.every((h, i) => h === current!.hitsOn[i])
        ? prev
        : {
            rowIndex: current!.rowIndex,
            species: current!.species,
            boss: current!.boss,
            hitsOn: [...current!.hitsOn],
            hitsPerUnit: current!.hitsPerUnit,
            monsters: current!.monsters,
            down,
          },
    );
  }

  // 跑過某一排就結算那一排
  useEffect(() => {
    if (state.phase !== 'running') return;
    const due = rows.find((r) => !passedRef.current.has(r.index) && distance >= r.distance);
    if (due) {
      passedRef.current.add(due.index);
      setState((prev) => {
        // 踩到哪一格是「通過這一排的當下」才決定的,所以直接讀 ref 換算,不用 prev.lane。
        const landed = { ...prev, lane: laneFromOffset(offsetRef.current) };
        // 帶著連續位置去結算:站對邊還不夠,得真的踩在閘門上(見 laneRun 的 hitsGate)。
        const r = resolveRow(landed, due, offsetRef.current);
        feedbackKeyRef.current += 1;
        setFeedback({
          key: feedbackKeyRef.current,
          message: r.message,
          hpDelta: r.hpDelta,
          attackDelta: r.attackDelta,
        });
        return r.state;
      });
      return;
    }
    if (distance >= runLength()) {
      setState((prev) => (prev.phase === 'running' ? { ...prev, phase: 'cleared' } : prev));
    }
  }, [distance, rows, state.phase]);

  // 高亮用的跑道跟著角色位置走(結算不看它,看 offsetRef)。
  useEffect(() => {
    const lane = laneFromOffset(heroOffset);
    setState((prev) => (prev.lane === lane ? prev : { ...prev, lane }));
  }, [heroOffset]);

  const dragTo = useCallback((offset: number) => {
    const next = clampOffset(offset);
    offsetRef.current = next;
    targetRef.current = next;
    setHeroOffset(next);
  }, []);

  const steer = useCallback((direction: 'left' | 'right') => {
    targetRef.current = laneCenterOffset(moveLane(laneFromOffset(targetRef.current), direction));
  }, []);

  const upcoming = rows.filter((r) => !passedRef.current.has(r.index));

  return {
    rows,
    state,
    distance,
    heroOffset,
    upcoming,
    wave,
    projectiles,
    hitNumbers,
    feedback,
    speed,
    dragTo,
    steer,
    stage,
  };
}

export type { Lane };
