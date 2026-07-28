import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createBattleState,
  judgeSwipe,
  resolveSwipe,
  type BattleState,
  type SwipeDirection,
  type SwipeQuality,
  type Threat,
} from '../game/swipeCombat';
import { createEncounterPlan, type EncounterPlan } from '../game/swipeEncounter';

const TICK_MS = 33; // ~30fps。反應窗最短 380ms,33ms 的取樣誤差(<9%)不影響判定手感。

export type BattlePhase = 'fighting' | 'won' | 'lost';

export interface FeedbackEvent {
  key: number;
  quality: SwipeQuality;
  damageDealt: number;
  damageTaken: number;
  isCrit: boolean;
}

export interface SwipeBattleView {
  plan: EncounterPlan;
  state: BattleState;
  phase: BattlePhase;
  /** 目前正在倒數的出招(還沒判定完)。null = 空檔,玩家不用做事。 */
  activeThreat: Threat | null;
  /** 目前出招剩餘的反應時間比例 1→0,畫倒數條用。 */
  threatProgress: number;
  feedback: FeedbackEvent | null;
  swipe: (direction: SwipeDirection) => void;
  restart: (nextStage?: number) => void;
}

export function useSwipeBattle(initialStage: number, level: number): SwipeBattleView {
  const [stage, setStage] = useState(initialStage);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [plan, setPlan] = useState<EncounterPlan>(() => createEncounterPlan(initialStage, level, seed));
  const [state, setState] = useState<BattleState>(() => createBattleState(plan.hero, plan.monster));
  const [phase, setPhase] = useState<BattlePhase>('fighting');
  const [elapsed, setElapsed] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackEvent | null>(null);

  // 這一招是否已經判定過。用 ref 而不是 state:判定發生在 setState 的 updater 裡,
  // 需要同步讀寫,走 state 會慢一拍導致同一招被判定兩次(滑動一次 + 逾時一次)。
  const resolvedRef = useRef<Set<number>>(new Set());
  const startedAtRef = useRef(Date.now());
  const feedbackKeyRef = useRef(0);

  const reset = useCallback(
    (nextStage: number, nextSeed: number) => {
      const nextPlan = createEncounterPlan(nextStage, level, nextSeed);
      resolvedRef.current = new Set();
      startedAtRef.current = Date.now();
      setPlan(nextPlan);
      setState(createBattleState(nextPlan.hero, nextPlan.monster));
      setPhase('fighting');
      setElapsed(0);
      setFeedback(null);
    },
    [level]
  );

  const restart = useCallback(
    (nextStage?: number) => {
      const s = nextStage ?? stage;
      const nextSeed = Math.floor(Math.random() * 1e9);
      setStage(s);
      setSeed(nextSeed);
      reset(s, nextSeed);
    },
    [reset, stage]
  );

  // 時間推進
  useEffect(() => {
    if (phase !== 'fighting') return;
    const id = setInterval(() => setElapsed(Date.now() - startedAtRef.current), TICK_MS);
    return () => clearInterval(id);
  }, [phase, plan]);

  const applyJudgement = useCallback(
    (threat: Threat, quality: SwipeQuality, reactionMs: number) => {
      resolvedRef.current.add(threat.index);
      setState((prev) => {
        const r = resolveSwipe(prev, { quality, reactionMs }, plan.hero, plan.monster);
        feedbackKeyRef.current += 1;
        setFeedback({
          key: feedbackKeyRef.current,
          quality,
          damageDealt: r.damageDealt,
          damageTaken: r.damageTaken,
          isCrit: r.isCrit,
        });
        if (r.outcome === 'win') setPhase('won');
        else if (r.outcome === 'lose') setPhase('lost');
        return r.state;
      });
    },
    [plan]
  );

  // 目前這一招:已經開始預示、還沒過窗、也還沒被判定過
  const activeThreat =
    phase === 'fighting'
      ? (plan.threats.find(
          (t) =>
            !resolvedRef.current.has(t.index) &&
            elapsed >= t.telegraphAt &&
            elapsed <= t.telegraphAt + t.windowMs
        ) ?? null)
      : null;

  // 逾時未滑 = miss。放在 effect 而不是 render 裡,避免在渲染過程改 state。
  useEffect(() => {
    if (phase !== 'fighting') return;
    const overdue = plan.threats.find(
      (t) => !resolvedRef.current.has(t.index) && elapsed > t.telegraphAt + t.windowMs
    );
    if (overdue) applyJudgement(overdue, 'miss', overdue.windowMs);
  }, [elapsed, phase, plan, applyJudgement]);

  // 出招表跑完還沒打死 = 判輸。不然玩家會卡在「沒招可出但怪還活著」的畫面。
  useEffect(() => {
    if (phase !== 'fighting') return;
    const last = plan.threats[plan.threats.length - 1];
    if (!last) return;
    if (elapsed > last.telegraphAt + last.windowMs + 400 && resolvedRef.current.size >= plan.threats.length) {
      setPhase('lost');
    }
  }, [elapsed, phase, plan]);

  const swipe = useCallback(
    (direction: SwipeDirection) => {
      if (phase !== 'fighting') return;
      const now = Date.now() - startedAtRef.current;
      const target = plan.threats.find(
        (t) => !resolvedRef.current.has(t.index) && now >= t.telegraphAt && now <= t.telegraphAt + t.windowMs
      );
      // 空檔亂滑不罰也不獎:懲罰空滑會逼玩家不敢動,反而降低操作感。
      if (!target) return;
      const j = judgeSwipe(target, now, direction);
      applyJudgement(target, j.quality, j.reactionMs);
    },
    [phase, plan, applyJudgement]
  );

  const threatProgress = activeThreat
    ? Math.max(0, Math.min(1, 1 - (elapsed - activeThreat.telegraphAt) / activeThreat.windowMs))
    : 0;

  return { plan, state, phase, activeThreat, threatProgress, feedback, swipe, restart };
}
