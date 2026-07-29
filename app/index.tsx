import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdSlot } from '../components/AdSlot';
import { JobChoice } from '../components/JobChoice';
import { LaneRunner } from '../components/LaneRunner';
import { MainMenu } from '../components/MainMenu';
import { SkillChoice } from '../components/SkillChoice';
import { isPromotionStage, runStartFor, tierAfter, type JobTier, type LaneJob } from '../game/laneJobs';
import { applySkills, learnSkill, skillOffers, type SkillState } from '../game/laneSkills';

// 一輪的流程:
//   主介面 →(按開始闖關)→ 跑圖 →(通關)→ 學技能 → 每 5 關再多一次轉職 → 回主介面(關卡 +1)
//                                    →(陣亡)→ 回主介面(關卡不變,重打同一關)
//
// 每一場都回主介面,不是通關後直接接下一關。這樣玩家有一個喘息與整備的定點,
// 之後分頁列的功能開放時也有地方放——那些功能不可能塞在跑圖畫面裡。
//
// 關卡只有通關才前進。失敗重打同一關,所以卡關的時候是「這一關要再試一次」,
// 不是「整個進度倒退」——後者在這種一場 48 秒的節奏下會非常挫折。
//
// 存檔還沒接上:這些選擇目前只活在記憶體裡,重新整理就沒了。
//
// 一場跑圖 = 一個 LaneRunner 實例,每次開始都換 key 重新掛載。跑圖裡有一整套跑到一半的
// 狀態(波次、飛行中的武器、已結算的排、計時起點),在原地 reset 很容易漏掉其中一項,
// 症狀是「上一場的怪出現在這一場」——重新掛載沒有這個問題。
type Screen = 'menu' | 'run';

export default function HomeScreen() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [stage, setStage] = useState(1);
  const [runKey, setRunKey] = useState(0);
  const [job, setJob] = useState<LaneJob>(null);
  const [skills, setSkills] = useState<SkillState[]>([]);
  const [promotionTier, setPromotionTier] = useState<JobTier | null>(null);
  const [offers, setOffers] = useState<SkillState[]>([]);
  // 跨場累積的金幣。跑圖裡的 state.coins 每場重來,這裡才是玩家真正的存款。
  // 目前還沒有用途(分頁列全部未開放),但每一場都看得到它在長,不然賺金幣毫無反饋。
  const [coins, setCoins] = useState(0);
  const [lastResult, setLastResult] = useState<'cleared' | 'dead' | null>(null);

  /** 技能選完之後:該轉職就先轉職,不然直接回主介面並前進一關。 */
  function afterSkill(nextSkills: SkillState[]) {
    setSkills(nextSkills);
    setOffers([]);
    const tier = isPromotionStage(stage) ? tierAfter(stage) : null;
    if (tier !== null) setPromotionTier(tier);
    else backToMenu(true);
  }

  /** 回主介面。通關的話關卡 +1,陣亡則維持同一關。 */
  function backToMenu(cleared: boolean) {
    if (cleared) setStage((s) => s + 1);
    setLastResult(cleared ? 'cleared' : 'dead');
    setScreen('menu');
  }

  function onRunFinish(result: 'cleared' | 'dead', earned: number) {
    setCoins((c) => c + earned);
    if (result === 'dead') {
      backToMenu(false);
      return;
    }
    // 技能全滿之後就沒東西可選,直接跳過這個畫面,不要卡一個空頁面。
    const next = skillOffers(skills);
    if (next.length > 0) setOffers(next);
    else afterSkill(skills);
  }

  if (offers.length > 0) {
    return (
      <View style={styles.screen}>
        <AdSlot />
        <SkillChoice
          clearedStage={stage}
          skills={skills}
          offers={offers}
          onChoose={(choice) => afterSkill(learnSkill(skills, choice))}
        />
      </View>
    );
  }

  if (promotionTier !== null) {
    return (
      <View style={styles.screen}>
        <AdSlot />
        <JobChoice
          current={job}
          tier={promotionTier}
          clearedStage={stage}
          onChoose={(chosen) => {
            setJob(chosen);
            setPromotionTier(null);
            backToMenu(true);
          }}
        />
      </View>
    );
  }

  if (screen === 'menu') {
    return (
      <View style={styles.screen}>
        {/* 廣告在最上面、跟內容之間留安全距離,見 components/AdSlot.tsx 的說明 */}
        <AdSlot />
        <MainMenu
          stage={stage}
          job={job}
          coins={coins}
          lastResult={lastResult}
          onStart={() => {
            setRunKey((k) => k + 1);
            setScreen('run');
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <AdSlot />
      <LaneRunner
        key={`${stage}-${runKey}`}
        stage={stage}
        job={job}
        start={applySkills(runStartFor(job), skills)}
        onFinish={onRunFinish}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#16161c',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 12,
    gap: 10,
  },
});
