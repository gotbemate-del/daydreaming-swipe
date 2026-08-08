import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { JobChoice } from '../components/JobChoice';
import { LaneRunner } from '../components/LaneRunner';
import { MainMenu } from '../components/MainMenu';
import { SkillChoice } from '../components/SkillChoice';
import { isPromotionStage, runStartFor, tierAfter, type JobTier, type LaneJob } from '../game/laneJobs';
import { applySkills, learnSkill, skillOffers, type SkillState } from '../game/laneSkills';
import { useSave } from '../hooks/useSave';
import { useBgm } from '../hooks/useBgm';
import { useNoContextMenu } from '../hooks/useNoContextMenu';
import { playSfx, useSfxVolume } from '../hooks/useSfx';
import { BACKDROPS, type BackdropId } from '../game/laneRun';
import type { AudioSettings } from '../components/Settings';
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

/**
 * 抽一張生存模式的地圖。
 *
 * `avoid` 是目前這一張:重抽的時候**保證會換一張**。不排除的話,10 選 1 有十分之一
 * 的機會抽回同一張,而玩家按下「重抽」看到一模一樣的名字,第一個念頭是「按鈕壞了」——
 * 那是隨機性最不划算的一次現身。
 *
 * 用 Math.random 不用 seed:這一抽不進任何結算(底圖是純視覺,見 laneRun 的 BACKDROPS),
 * 所以不必像閘門那樣可重播。
 */
function drawBackdrop(avoid: BackdropId | null): BackdropId {
  const pool = avoid === null ? BACKDROPS : BACKDROPS.filter((b) => b !== avoid);
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function HomeScreen() {
  const { save, loaded, update } = useSave();
  const { stage, coins } = save;
  const job = toLaneJob(save.job);
  const skills = save.skills;

  // 背景音樂掛在這一層,**不能掛進 LaneRunner**:那個元件每一關都換 key 重新掛載,
  // 音樂會每十波從頭播一次(生存模式尤其明顯)。
  useBgm(loaded && !save.bgmOff, save.bgmVolume);
  // 音效音量同步到模組層。音效的觸發點散在各處(按鈕、通關、選技能),
  // 一路把音量當 prop 傳下去只會讓每個元件多一個跟自己無關的欄位(見 hooks/useSfx.ts)。
  useSfxVolume(save.sfxVolume);

  // 網頁版的右鍵選單與長按選單。跟音樂同一個理由掛在這一層:LaneRunner 每一關重新掛載,
  // 掛在裡面的話交棒的那 900ms 是沒有防護的(見 hooks/useNoContextMenu.ts)。
  useNoContextMenu();

  const [screen, setScreen] = useState<Screen>('menu');
  const [runKey, setRunKey] = useState(0);
  const [mode, setMode] = useState<Mode>('normal');
  /** 生存模式:這一輪從第幾關開始、已經連過幾關。 */
  const [survivalFrom, setSurvivalFrom] = useState(1);
  const [survivalStreak, setSurvivalStreak] = useState(0);
  /** 這一輪累計撐過幾波。**生存模式的分數就是它**(關數只是拿來顯示的刻度)。 */
  const [survivalWaves, setSurvivalWaves] = useState(0);
  const [survivalStage, setSurvivalStage] = useState(1);
  const [promotionTier, setPromotionTier] = useState<JobTier | null>(null);
  const [offers, setOffers] = useState<SkillState[]>([]);
  const [lastResult, setLastResult] = useState<'cleared' | 'dead' | null>(null);
  /**
   * 生存模式這一輪抽到的地圖,以及開頭的抽地圖面板還開著沒。
   *
   * 兩個都放在 app 層,理由同一個:LaneRunner 每一關重新掛載,而這一輪的地圖與
   * 「只在第一關顯示一次的面板」都必須跨過那個邊界(見 LaneRunner 的 backdropOverride)。
   */
  const [survivalBackdrop, setSurvivalBackdrop] = useState<BackdropId>(BACKDROPS[0]);
  const [mapDrawOpen, setMapDrawOpen] = useState(false);

  /**
   * 音訊設定。主介面與跑圖中共用同一份,存進存檔。
   *
   * 包成一個物件而不是三個 prop:設定面板本來就是「一組偏好」,拆開傳的話每加一項
   * 就要動主介面、跑圖、面板三個檔案的簽名,而那三個地方對這些值一個都不在乎。
   */
  const audio: AudioSettings = {
    bgmOff: save.bgmOff,
    bgmVolume: save.bgmVolume,
    sfxVolume: save.sfxVolume,
  };
  const changeAudio = (patch: Partial<AudioSettings>) => update((prev) => ({ ...prev, ...patch }));

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
      // **通關一定給一本技能書**,圖鑑的掉落率則變成「再多一本」的機率(2%~12%)。
      //
      // 從「機率掉一本」改成「保證給一本」,是因為上限從 5 級開到 100 級:
      // 照舊的 2%~12% 要練滿得打上千場,那條線等於不存在。現在是一關一本,
      // 100 關練滿一輪——而總共有 3000 個小關,所以它是一條長期但走得完的線。
      //
      // 陣亡不給:技能書是**通關的獎勵**。陣亡照樣掉圖鑑碎片(那是給卡關的人的),
      // 兩者分工不同——碎片讓卡關的人有進展,技能書讓過關的人變強。
      const bonusBook = cleared && Math.random() < bookDropChance(bits);
      const gained = (cleared ? 1 : 0) + (bonusBook ? 1 : 0);
      return {
        ...prev,
        collected: encodeCollection(bits),
        books: Math.min(MAX_SKILL_BOOK_LEVEL, prev.books + gained),
      };
    });
  }

  /**
   * 重新再來。**換 runKey 就等於整場重來**——LaneRunner 每一場都是一個新實例,
   * 跑到一半的狀態(波次、飛行中的武器、已結算的排、計時起點)全部跟著實例走,
   * 所以不必也不該在原地一項一項 reset(漏掉其中一項就會「上一場的怪出現在這一場」)。
   *
   * **這一場的金幣與掉落刻意不結算。** 玩家自己按的重來,還沒跑完就不算跑過;
   * 而且結算了才重來的話,反覆重開第一波就能刷圖鑑掉落。
   *
   * 生存模式是**整輪**重來不是這一關重來:只重開這一關等於把「不能重試」那條規則
   * 從後門打開(卡在第 8 關就一直重開第 8 關),而那條規則就是生存模式的全部壓力來源。
   */
  function restartRun() {
    if (mode === 'survival') {
      setSurvivalStage(survivalFrom);
      setSurvivalStreak(0);
      setSurvivalWaves(0);
      setSurvivalCoins(0);
      setSurvivalBackdrop(drawBackdrop(null));
      setMapDrawOpen(true);
    }
    setRunKey((k) => k + 1);
  }

  /**
   * 放棄遊戲。**走跟陣亡完全一樣的路徑**,不另外做一條:
   * 一般模式回主介面且關卡不前進,生存模式進結算畫面(撐到哪就算到哪)。
   *
   * 為什麼放棄也要結算生存分數:玩家撐了十幾波才按放棄,把那些波數丟掉等於懲罰
   * 「主動結束」,而他真正想要的只是「不要再打下去」——那跟陣亡是同一件事的兩種到達方式。
   */
  function quitRun() {
    onRunFinish('dead', 0, 0);
  }

  function onRunFinish(result: 'cleared' | 'dead', earned: number, waves: number) {
    update((prev) => ({ ...prev, coins: prev.coins + earned }));
    rollRunDrops(result === 'cleared');
    if (mode === 'survival') {
      setSurvivalCoins((c) => c + earned);
      const totalWaves = survivalWaves + waves;
      setSurvivalWaves(totalWaves);
      if (result === 'dead') {
        // 生存模式**不給重試**,死了就結算——壓力就在這裡。
        // 分數的單位是**波**不是關:生存模式是一條連續的跑圖,關卡只是中途換難度的刻度,
        // 而玩家心裡數的是「我撐過幾波」。
        // 技能書照「歷史最好的那一次」給,不是這一次:不然玩家可以刷短輪湊次數。
        update((prev) => {
          const best = Math.max(prev.bestSurvival, totalWaves);
          return { ...prev, bestSurvival: best, books: Math.max(prev.books, booksForSurvival(best)) };
        });
        setScreen('survivalOver');
        return;
      }
      // 過關就直接接下一關,中間不回主介面、不選永久技能、不轉職,**也不停下來等玩家按鈕**
      // (交棒由 LaneRunner 的 HANDOFF_MS 自己觸發)。那三件事都是「整備」,
      // 而生存模式的核心就是沒有整備的機會。
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
          waves={survivalWaves}
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
            playSfx('click');
            setMode('normal');
            setRunKey((k) => k + 1);
            setScreen('run');
          }}
          justFound={justFound}
          audio={audio}
          onChangeAudio={changeAudio}
          onCodex={() => setScreen('codex')}
          onSurvival={() => {
            // 從目前進度的關卡開始:生存模式不是另一條難度曲線,是同一條的「不能失手」版本。
            playSfx('click');
            // 這一輪的地圖:**開跑前抽好,整輪不再變**。抽在這一層而不是 LaneRunner 裡,
            // 因為生存模式一關接一關、LaneRunner 每一關都重新掛載——抽在裡面的話
            // 每過一關地圖就換一次,而抽籤要給的是「這一輪的身分」不是「這一關的裝飾」。
            setSurvivalBackdrop(drawBackdrop(null));
            setMapDrawOpen(true);
            setMode('survival');
            setSurvivalFrom(stage);
            setSurvivalStage(stage);
            setSurvivalStreak(0);
            setSurvivalWaves(0);
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
        survivalWavesBefore={mode === 'survival' ? survivalWaves : null}
        audio={audio}
        onChangeAudio={changeAudio}
        backdropOverride={mode === 'survival' ? survivalBackdrop : null}
        mapDraw={
          mode === 'survival' && mapDrawOpen
            ? {
                onRedraw: () => setSurvivalBackdrop((cur) => drawBackdrop(cur)),
                onDone: () => setMapDrawOpen(false),
              }
            : null
        }
        onFinish={onRunFinish}
        onRestart={restartRun}
        onQuit={quitRun}
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
