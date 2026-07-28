import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { comboMultiplier, type SwipeDirection } from '../game/swipeCombat';
import { useSwipeBattle } from '../hooks/useSwipeBattle';

// 戰鬥畫面。三個區塊由上到下:狀態列(雙方血量+連段)、指示區(這一招要往哪滑+剩多少時間)、
// 操作區(左右兩個大按鈕/滑動感應區)。
//
// 操作同時支援三種輸入,不是為了功能多,是各自解決一個實際問題:
//   - 觸控滑動:手機上的正式操作方式
//   - 左右大按鈕:滑動在桌面瀏覽器很難做得準,而且按鈕讓新手第一次就知道「只有兩個選擇」
//   - 方向鍵/AD:桌機測試與 Playwright 自動化驗證要有確定性的輸入管道
const SWIPE_THRESHOLD_PX = 28;

interface Props {
  stage: number;
  level: number;
  onCleared: (stage: number) => void;
}

export function SwipeArena({ stage, level, onCleared }: Props) {
  const battle = useSwipeBattle(stage, level);
  const { plan, state, phase, activeThreat, threatProgress, feedback, swipe, restart } = battle;

  // 桌機鍵盤輸入。只在 web 掛,原生平台沒有 window。
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') swipe('left');
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') swipe('right');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [swipe]);

  const heroRatio = plan.hero.maxHp > 0 ? state.heroHp / plan.hero.maxHp : 0;
  const monsterRatio = plan.monster.maxHp > 0 ? state.monsterHp / plan.monster.maxHp : 0;

  // 觸控滑動:記下按下的位置,放開時看水平位移超過門檻就算一次滑動。
  let touchStartX = 0;

  return (
    <View style={styles.arena}>
      <View style={styles.statusBar}>
        <View style={styles.hpBlock}>
          <Text style={styles.hpLabel}>勇者 {state.heroHp}/{plan.hero.maxHp}</Text>
          <View style={styles.hpTrack}>
            <View style={[styles.hpFill, styles.hpFillHero, { width: `${heroRatio * 100}%` },
              heroRatio <= 0.25 && styles.hpFillDanger]} />
          </View>
        </View>
        <View style={styles.hpBlock}>
          <Text style={styles.hpLabel}>第 {plan.stage} 關  怪物 {state.monsterHp}/{plan.monster.maxHp}</Text>
          <View style={styles.hpTrack}>
            <View style={[styles.hpFill, styles.hpFillMonster, { width: `${monsterRatio * 100}%` }]} />
          </View>
        </View>
      </View>

      <View style={styles.comboRow}>
        <Text style={styles.comboText}>連段 {state.combo}</Text>
        <Text style={styles.comboMult}>x{comboMultiplier(state.combo).toFixed(2)}</Text>
        <Text style={styles.tally}>
          完美 {state.perfectCount} / 閃過 {state.goodCount} / 挨打 {state.missCount}
        </Text>
      </View>

      {/* 指示區:出招時整塊往該滑的那一側亮起,並用倒數條顯示剩下多少反應時間。
          用「整側亮起」而不是箭頭符號,是因為它在餘光裡也看得到——高速時玩家沒空聚焦看圖示。 */}
      <View style={styles.telegraphRow}>
        <View style={[styles.telegraphSide, activeThreat?.direction === 'left' && styles.telegraphActive]} />
        <View style={styles.telegraphCenter}>
          {phase === 'fighting' && activeThreat ? (
            <>
              <Text style={styles.telegraphText}>
                往{activeThreat.direction === 'left' ? '左' : '右'}閃
              </Text>
              <View style={styles.timerTrack}>
                <View style={[styles.timerFill, { width: `${threatProgress * 100}%` },
                  threatProgress <= 0.35 && styles.timerFillUrgent]} />
              </View>
            </>
          ) : phase === 'fighting' ? (
            <Text style={styles.telegraphIdle}>準備…</Text>
          ) : (
            <Text style={phase === 'won' ? styles.resultWin : styles.resultLose}>
              {phase === 'won' ? '過關' : '戰敗'}
            </Text>
          )}
        </View>
        <View style={[styles.telegraphSide, activeThreat?.direction === 'right' && styles.telegraphActive]} />
      </View>

      {/* 每次判定的即時回饋。key 用遞增序號,同樣結果連續出現時也會重新掛載、重播動畫。 */}
      <View style={styles.feedbackRow}>
        {feedback && (
          <Text
            key={feedback.key}
            style={[
              styles.feedbackText,
              feedback.quality === 'perfect' && styles.feedbackPerfect,
              feedback.quality === 'good' && styles.feedbackGood,
              feedback.quality === 'miss' && styles.feedbackMiss,
            ]}
          >
            {feedback.quality === 'miss'
              ? `挨打 -${feedback.damageTaken}`
              : `${feedback.quality === 'perfect' ? '完美' : '閃過'}  -${feedback.damageDealt}${feedback.isCrit ? ' 爆擊' : ''}`}
          </Text>
        )}
      </View>

      {phase === 'fighting' ? (
        <View
          style={styles.controls}
          // RN-Web 上 View 也吃這些觸控事件;原生平台同樣走這條,不用另外接手勢庫。
          onStartShouldSetResponder={() => true}
          onResponderGrant={(e) => {
            touchStartX = e.nativeEvent.pageX;
          }}
          onResponderRelease={(e) => {
            const dx = e.nativeEvent.pageX - touchStartX;
            if (Math.abs(dx) >= SWIPE_THRESHOLD_PX) swipe(dx < 0 ? 'left' : 'right');
          }}
        >
          <Pressable style={styles.dodgeButton} onPress={() => swipe('left')} accessibilityLabel="往左閃">
            <Text style={styles.dodgeLabel}>左</Text>
          </Pressable>
          <Text style={styles.hint}>滑動、按鈕或方向鍵都可以</Text>
          <Pressable style={styles.dodgeButton} onPress={() => swipe('right')} accessibilityLabel="往右閃">
            <Text style={styles.dodgeLabel}>右</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.controls}>
          <Pressable
            style={styles.againButton}
            onPress={() => {
              if (phase === 'won') {
                onCleared(plan.stage);
                restart(plan.stage + 1);
              } else {
                restart(plan.stage);
              }
            }}
          >
            <Text style={styles.againLabel}>{phase === 'won' ? '下一關' : '再來一次'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  arena: {
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    gap: 10,
  },
  statusBar: { gap: 8 },
  hpBlock: { gap: 3 },
  hpLabel: { color: '#8a8a95', fontSize: 11 },
  hpTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2a2a35',
    overflow: 'hidden',
  },
  hpFill: { height: '100%' },
  hpFillHero: { backgroundColor: '#5ec26a' },
  hpFillMonster: { backgroundColor: '#e0a95c' },
  hpFillDanger: { backgroundColor: '#e05050' },
  comboRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  comboText: { color: '#f2f2f2', fontSize: 15, fontWeight: '700' },
  comboMult: { color: '#e0a95c', fontSize: 13, fontWeight: '700' },
  tally: { color: '#8a8a95', fontSize: 10, marginLeft: 'auto' },
  telegraphRow: {
    flexDirection: 'row',
    height: 120,
    gap: 6,
  },
  telegraphSide: {
    width: 56,
    borderRadius: 10,
    backgroundColor: '#22222b',
    borderWidth: 1,
    borderColor: '#3a3a45',
  },
  telegraphActive: {
    backgroundColor: '#4a3b1e',
    borderColor: '#e0a95c',
  },
  telegraphCenter: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#22222b',
    borderWidth: 1,
    borderColor: '#3a3a45',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  telegraphText: { color: '#f2f2f2', fontSize: 22, fontWeight: '700' },
  telegraphIdle: { color: '#8a8a95', fontSize: 14 },
  timerTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2a2a35',
    overflow: 'hidden',
  },
  timerFill: { height: '100%', backgroundColor: '#9691a5' },
  timerFillUrgent: { backgroundColor: '#e05050' },
  resultWin: { color: '#5ec26a', fontSize: 24, fontWeight: '700' },
  resultLose: { color: '#e05050', fontSize: 24, fontWeight: '700' },
  feedbackRow: { height: 22, alignItems: 'center', justifyContent: 'center' },
  feedbackText: { fontSize: 14, fontWeight: '700' },
  feedbackPerfect: { color: '#e0a95c' },
  feedbackGood: { color: '#5ec26a' },
  feedbackMiss: { color: '#e05050' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dodgeButton: {
    width: 84,
    paddingVertical: 16,
    borderRadius: 10,
    backgroundColor: '#3a3448',
    alignItems: 'center',
  },
  dodgeLabel: { color: '#f2f2f2', fontSize: 20, fontWeight: '700' },
  hint: { flex: 1, color: '#8a8a95', fontSize: 10, textAlign: 'center' },
  againButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#e0a95c',
    alignItems: 'center',
  },
  againLabel: { color: '#16161c', fontSize: 15, fontWeight: '700' },
});
