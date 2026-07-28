import { useCallback, useEffect, useRef, useState } from 'react';

import {
  clampOffset,
  createRun,
  initialRunState,
  laneCenterOffset,
  laneFromOffset,
  moveLane,
  resolveRow,
  runLength,
  runSpeed,
  type Lane,
  type RunRow,
  type RunState,
} from '../game/laneRun';

const TICK_MS = 33; // ~30fps

// 按鈕/方向鍵是「移到隔壁跑道中央」,但不瞬移——瞬移的話畫面上看不出角色移動過,
// 跟手指拖的體感也對不起來。每 tick 追上剩餘距離的 30%,約 5 tick(0.17 秒)到位,
// 比最快關卡的一排 0.9 秒短很多,不會出現「按了卻來不及到」的情況。
const EASE_PER_TICK = 0.3;
const SNAP_EPSILON = 0.002;

export interface RunFeedback {
  key: number;
  message: string;
  hpDelta: number;
  attackDelta: number;
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
  feedback: RunFeedback | null;
  speed: number;
  /** 手指拖曳:直接把角色放到這個位置 */
  dragTo: (offset: number) => void;
  /** 按鈕/方向鍵:滑順移到隔壁跑道中央 */
  steer: (direction: 'left' | 'right') => void;
  restart: (nextStage?: number) => void;
  stage: number;
}

export function useLaneRun(initialStage: number): LaneRunView {
  const [stage, setStage] = useState(initialStage);
  const [rows, setRows] = useState<RunRow[]>(() => createRun(Math.floor(Math.random() * 1e9), initialStage));
  const [state, setState] = useState<RunState>(() => initialRunState(initialStage));
  const [distance, setDistance] = useState(0);
  const [feedback, setFeedback] = useState<RunFeedback | null>(null);

  const startedAtRef = useRef(Date.now());
  // 已結算過的排。跟判定同步讀寫,走 state 會慢一拍導致同一排被結算兩次。
  const passedRef = useRef<Set<number>>(new Set());
  const feedbackKeyRef = useRef(0);

  // 角色位置同時放在 ref 與 state:ref 給結算用(要拿到「這一瞬間」的位置,不能慢一拍,
  // 慢一拍就會發生「明明已經拉到隔壁格了卻吃到原本那格」),state 只是拿來觸發重畫。
  const centerOffset = laneCenterOffset(1);
  const offsetRef = useRef(centerOffset);
  const targetRef = useRef(centerOffset);
  const [heroOffset, setHeroOffset] = useState(centerOffset);

  const speed = runSpeed(stage);

  const restart = useCallback((nextStage?: number) => {
    const s = nextStage ?? stage;
    setStage(s);
    setRows(createRun(Math.floor(Math.random() * 1e9), s));
    setState(initialRunState(s));
    setDistance(0);
    setFeedback(null);
    passedRef.current = new Set();
    startedAtRef.current = Date.now();
    offsetRef.current = centerOffset;
    targetRef.current = centerOffset;
    setHeroOffset(centerOffset);
  }, [stage, centerOffset]);

  useEffect(() => {
    if (state.phase !== 'running') return;
    const id = setInterval(() => {
      setDistance(((Date.now() - startedAtRef.current) / 1000) * speed);
      const gap = targetRef.current - offsetRef.current;
      if (gap !== 0) {
        const next = Math.abs(gap) < SNAP_EPSILON ? targetRef.current : offsetRef.current + gap * EASE_PER_TICK;
        offsetRef.current = next;
        setHeroOffset(next);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [state.phase, speed, rows]);

  // 跑過某一排就結算那一排
  useEffect(() => {
    if (state.phase !== 'running') return;
    const due = rows.find((r) => !passedRef.current.has(r.index) && distance >= r.distance);
    if (due) {
      passedRef.current.add(due.index);
      setState((prev) => {
        // 踩到哪一格是「通過這一排的當下」才決定的,所以直接讀 ref 換算,不用 prev.lane。
        const landed = { ...prev, lane: laneFromOffset(offsetRef.current) };
        const r = resolveRow(landed, due);
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

  return { rows, state, distance, heroOffset, upcoming, feedback, speed, dragTo, steer, restart, stage };
}

export type { Lane };
