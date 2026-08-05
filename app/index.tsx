import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { JobChoice } from '../components/JobChoice';
import { LaneRunner } from '../components/LaneRunner';
import { MainMenu } from '../components/MainMenu';
import { SkillChoice } from '../components/SkillChoice';
import { isPromotionStage, runStartFor, tierAfter, type JobTier, type LaneJob } from '../game/laneJobs';
import { applySkills, learnSkill, skillOffers, type SkillState } from '../game/laneSkills';
import { useSave } from '../hooks/useSave';
import { booksForSurvival, TOTAL_STAGES, type SavedJob } from '../game/save';
import {
  addItem, bookDropChance, collectionScales, decodeCollection, dropCountForRun,
  encodeCollection, rollDrops,
} from '../game/collection';
import { MAX_SKILL_BOOK_LEVEL } from '../game/laneRunSkills';
import { Codex } from '../components/Codex';
import { SurvivalResult } from '../components/SurvivalResult';

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
// 存檔:跨場留下來的四樣東西(關卡、職業、永久技能、金幣)由 useSave 持有並寫進 AsyncStorage。
// **畫面中途的狀態刻意不存**(正在挑技能、正在轉職、跑到一半的那一場):存了就會有
// 「復原到一半的一場」這種永遠測不完的狀態。代價是在挑技能的當下關掉分頁,那一關要重打——
// 但金幣已經進帳了(onRunFinish 先加),所以不是整場白跑。
//
// 一場跑圖 = 一個 LaneRunner 實例,每次開始都換 key 重新掛載。跑圖裡有一整套跑到一半的
// 狀態(波次、飛行中的武器、已結算的排、計時起點),在原地 reset 很容易漏掉其中一項,
// 症狀是「上一場的怪出現在這一場」——重新掛載沒有這個問題。
type Screen = 'menu' | 'run' | 'survivalOver' | 'codex';

/**
 * 生存模式:**連續闖關,死了就結束。**
 *
 * 一般模式死掉只是重打同一關,所以「失手」幾乎沒有代價;生存模式把同一套關卡拿來
 * 反過來用——每一關照常從頭起跑(數值完全沒有另一套),但**中途不能重試**,
 * 撐過幾關就是分數。壓力來自「不能失手」,不是來自另一條敵人曲線。
 *
 * 這樣做的另一個好處是它完全不必動 createRun:難度用的就是既有的關卡曲線,
 * 不會出現「兩條各走各的指數」那類問題(CLAUDE.md 記過好幾次)。
 */
type Mode = 'normal' | 'survival';

/**
 * 存檔裡的職業 → 遊戲用的 LaneJob。兩邊刻意分開:存檔格式是對外的邊界,
 * laneJobs 的型別以後改欄位不該讓所有人的存檔失效(見 game/save.ts)。
 */
function toLaneJob(saved: SavedJob | null): LaneJob {
  return saved === null ? null : { archetype: saved.archetype, branch: saved.branch, tier: saved.tier };
}

export default function HomeScreen() {
  const { save, loaded, update } = useSave();
  const { stage, coins } = save;
  const job = toLaneJob(save.job);
  const skills = save.skills;

  const [screen, setScreen] = useState<Screen>('menu');
  const [runKey, setRunKey] = useState(0);
  const [mode, setMode] = useState<Mode>('normal');
  /** 生存模式:這一輪從第幾關開始、已經連過幾關。 */
  const [survivalFrom, setSurvivalFrom] = useState(1);
  const [survivalStreak, setSurvivalStreak] = useState(0);
  const [survivalStage, setSurvivalStage] = useState(1);
  const [promotionTier, setPromotionTier] = useState<JobTier | null>(null);
  const [offers, setOffers] = useState<SkillState[]>([]);
  const [lastResult, setLastResult] = useState<'cleared' | 'dead' | null>(null);

  /** 技能選完之後:該轉職就先轉職,不然直接回主介面並前進一關。 */
  function afterSkill(nextSkills: SkillState[]) {
    update((prev) => ({ ...prev, skills: nextSkills }));
    setOffers([]);
    const tier = isPromotionStage(stage) ? tierAfter(stage) : null;
    if (tier !== null) setPromotionTier(tier);
    else backToMenu(true);
  }

  /** 回主介面。通關的話關卡 +1,陣亡則維持同一關。 */
  function backToMenu(cleared: boolean) {
    // 關卡 +1 走 update 而不是 setState:它是要留下來的東西,寫進存檔的時機就在這裡。
    if (cleared) update((prev) => ({ ...prev, stage: Math.min(TOTAL_STAGES, prev.stage + 1) }));
    setLastResult(cleared ? 'cleared' : 'dead');
    setScreen('menu');
  }

  /** 生存模式:一輪的累計金幣(死了才一次結算給玩家看)。 */
  const [survivalCoins, setSurvivalCoins] = useState(0);

  /** 剛撿到的那幾件(結算完顯示一下,不然玩家不會發現圖鑑有在長)。 */
  const [justFound, setJustFound] = useState<number[]>([]);

  /**
   * 一場跑完的掉落:裝備進圖鑑,偶爾掉技能書。
   * **陣亡也掉**(只是少)——完全不掉的話,卡關的人會完全沒有進展,
   * 而圖鑑正是拿來讓卡關的人有事做的。
   */
  function rollRunDrops(cleared: boolean) {
    update((prev) => {
      const bits = decodeCollection(prev.collected);
      const rng = () => Math.random();
      const found = rollDrops(bits, dropCountForRun(cleared), rng);
      for (const index of found) addItem(bits, index);
      setJustFound(found);
      const gotBook = cleared && Math.random() < bookDropChance(bits);
      return {
        ...prev,
        collected: encodeCollection(bits),
        books: gotBook ? Math.min(MAX_SKILL_BOOK_LEVEL, prev.books + 1) : prev.books,
      };
    });
  }

  function onRunFinish(result: 'cleared' | 'dead', earned: number) {
    update((prev) => ({ ...prev, coins: prev.coins + earned }));
    rollRunDrops(result === 'cleared');
    if (mode === 'survival') {
      setSurvivalCoins((c) => c + earned);
      if (result === 'dead') {
        // 生存模式**不給重試**,死了就結算——壓力就在這裡。
        // 技能書照「歷史最好的那一次」給,不是這一次:不然玩家可以刷短輪湊次數。
        update((prev) => {
          const best = Math.max(prev.bestSurvival, survivalStreak);
          return { ...prev, bestSurvival: best, books: Math.max(prev.books, booksForSurvival(best)) };
        });
        setScreen('survivalOver');
        return;
      }
      // 過關就直接接下一關,中間不回主介面、不選永久技能、不轉職——
      // 那三件事都是「整備」,而生存模式的核心就是沒有整備的機會。
      setSurvivalStreak((n) => n + 1);
      setSurvivalStage((st) => Math.min(TOTAL_STAGES, st + 1));
      setRunKey((k) => k + 1);
      return;
    }
    if (result === 'dead') {
      backToMenu(false);
      return;
    }
    // 技能全滿之後就沒東西可選,直接跳過這個畫面,不要卡一個空頁面。
    const next = skillOffers(skills);
    if (next.length > 0) setOffers(next);
    else afterSkill(skills);
  }

  // 讀存檔是非同步的,讀完之前一律不畫遊戲——先畫 1-1 再跳回真正的進度,
  // 玩家有可能在那一瞬間按下「開始闖關」,結束時就把預設值寫回去,進度整個被蓋掉。
  if (!loaded) {
    return (
      <View style={styles.screen}>
        <Text style={styles.loading}>載入存檔…</Text>
      </View>
    );
  }

  if (screen === 'codex') {
    return (
      <View style={styles.screen}>
        <Codex collected={save.collected} books={save.books} onDone={() => setScreen('menu')} />
      </View>
    );
  }

  if (screen === 'survivalOver') {
    return (
      <View style={styles.screen}>
        <SurvivalResult
          streak={survivalStreak}
          previousBest={save.bestSurvival}
          diedAt={survivalStage}
          coins={survivalCoins}
          onDone={() => { setMode('normal'); setScreen('menu'); }}
        />
      </View>
    );
  }

  if (offers.length > 0) {
    return (
      <View style={styles.screen}>
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
        <JobChoice
          current={job}
          tier={promotionTier}
          clearedStage={stage}
          onChoose={(chosen) => {
            update((prev) => ({
              ...prev,
              job: chosen === null ? null : { archetype: chosen.archetype, branch: chosen.branch, tier: chosen.tier },
            }));
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
        <MainMenu
          stage={stage}
          job={job}
          coins={coins}
          lastResult={lastResult}
          books={save.books}
          bestSurvival={save.bestSurvival}
          onStart={() => {
            setMode('normal');
            setRunKey((k) => k + 1);
            setScreen('run');
          }}
          justFound={justFound}
          onCodex={() => setScreen('codex')}
          onSurvival={() => {
            // 從目前進度的關卡開始:生存模式不是另一條難度曲線,是同一條的「不能失手」版本。
            setMode('survival');
            setSurvivalFrom(stage);
            setSurvivalStage(stage);
            setSurvivalStreak(0);
            setSurvivalCoins(0);
            setRunKey((k) => k + 1);
            setScreen('run');
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <LaneRunner
        key={`${mode}-${mode === 'survival' ? survivalStage : stage}-${runKey}`}
        stage={mode === 'survival' ? survivalStage : stage}
        job={job}
        start={applySkills(runStartFor(job), skills)}
        bookLevel={save.books}
        collection={collectionScales(decodeCollection(save.collected))}
        survivalStreak={mode === 'survival' ? survivalStreak : null}
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
  loading: { color: '#8a8a95', fontSize: 14 },
});
