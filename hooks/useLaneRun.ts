import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createRun,
  initialRunState,
  moveLane,
  resolveRow,
  runLength,
  runSpeed,
  type Lane,
  type RunRow,
  type RunState,
} from '../game/laneRun';

const TICK_MS = 33; // ~30fps

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
  /** 還沒通過的排(畫面上要畫出來的) */
  upcoming: RunRow[];
  feedback: RunFeedback | null;
  speed: number;
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
  }, [stage]);

  useEffect(() => {
    if (state.phase !== 'running') return;
    const id = setInterval(() => {
      setDistance(((Date.now() - startedAtRef.current) / 1000) * speed);
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
        const r = resolveRow(prev, due);
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

  const steer = useCallback((direction: 'left' | 'right') => {
    setState((prev) => (prev.phase === 'running' ? { ...prev, lane: moveLane(prev.lane, direction) } : prev));
  }, []);

  const upcoming = rows.filter((r) => !passedRef.current.has(r.index));

  return { rows, state, distance, upcoming, feedback, speed, steer, restart, stage };
}

export type { Lane };
