import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { JobChoice } from '../components/JobChoice';
import { LaneRunner } from '../components/LaneRunner';
import type { RunHandoff } from '../hooks/useLaneRun';
import { MainMenu } from '../components/MainMenu';
import { isPromotionStage, runStartFor, tierAfter, type JobTier, type LaneJob } from '../game/laneJobs';
import { useSave } from '../hooks/useSave';
import { useBgm } from '../hooks/useBgm';
import { useNoContextMenu } from '../hooks/useNoContextMenu';
import { playSfx, useSfxVolume } from '../hooks/useSfx';
import { BACKDROPS, wavesForStage, LONG_LEVEL_WAVES, type BackdropId } from '../game/laneRun';
import type { AudioSettings } from '../components/Settings';
import { booksForSurvival, TOTAL_STAGES, type SavedJob } from '../game/save';
import {
  addItem, bookDropChance, BOOKS_PER_CLEAR, BOOKS_PER_LONG_CLEAR,
  collectedCount, collectionScales, decodeCollection, dropCountForRun,
  encodeCollection, rollDrops, rollDropsForElement,
} from '../game/collection';
import { addBooks, totalBookLevels } from '../game/laneRunSkills';
import { elementLabel } from '../components/artAssets';
import { Codex } from '../components/Codex';
import { Skills } from '../components/Skills';
import { SurvivalResult } from '../components/SurvivalResult';
import { DungeonSelect } from '../components/DungeonSelect';
import { Quests } from '../components/Quests';
import {
  clearsLeft, dayIndex, dungeonCost, dungeonSpec, elementOfDay, isDailyDungeon,
  rollDungeonReward, type DungeonId,
} from '../game/dungeons';
import {
  activeQuest, addCounters, claimQuest, dungeonCounter, questViews, runCounters,
  type QuestContext, type QuestCounters, type RunStats,
} from '../game/quests';
import { isBossStage } from '../game/laneRun';

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
type Screen = 'menu' | 'run' | 'survivalOver' | 'codex' | 'dungeons' | 'quests' | 'skills';

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
/**
 * 這一場是哪一種跑圖。
 *
 * `normal` 是主線(通關才前進),其餘三個是副本(見 game/dungeons.ts)。
 * **四種用的都是同一條敵人曲線**——差別只在規則與獎勵,不准有第二條曲線
 * (CLAUDE.md 記過好幾次:兩條各走各的指數遲早會岔開)。
 */
type Mode = 'normal' | DungeonId;

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

/** 讀存檔中 / 還沒掛載時的畫面。兩種情況畫的是同一件事,所以只寫一份。 */
function Loading() {
  return (
    <View style={styles.screen}>
      <Text style={styles.loading}>載入存檔…</Text>
    </View>
  );
}

/**
 * 掛載之前不畫遊戲本體。
 *
 * `app.json` 的 `web.output` 是 **static**:建置時 Expo 會在 **Node 裡**把畫面先渲染成 HTML。
 * 而 `useBgm` 呼叫的 `useAudioPlayer` 在**建構的當下**就會去做一個 media element
 * (`AudioPlayerWeb` 的 constructor → `_createMediaElement()`),Node 裡沒有 `document`
 * 也沒有 `Audio`,那一下就丟例外——整個 Suspense boundary 在伺服器端失敗,
 * 匯出的 index.html 裡會留下 `<!--$!-->`(React 的「這個 boundary 壞了」標記),
 * 瀏覽器接手時就印一行 **React #419**。
 *
 * 症狀很容易被當成沒事:畫面**看起來完全正常**(React 會退回純用戶端渲染,自己重畫一次),
 * 只有 console 多一行壓縮過的錯誤碼。代價是預先渲染的 HTML 整段作廢——首屏等於白等一輪,
 * 而且真正的錯誤訊息被 `<!--$!-->` 吃掉,以後任何在 SSR 階段壞掉的東西都會長成同一行 #419。
 *
 * 解法不是去 try/catch 那個播放器,是**根本不要在伺服器上畫遊戲**:
 * 伺服器輸出的就是這個 Loading,而瀏覽器第一次 render(mounted 還是 false)畫的也是它——
 * 兩邊一模一樣,所以 hydration 對得起來,effect 跑完才換成真正的遊戲。
 *
 * 順帶一提這跟既有的 `loaded` 旗標是同一條規則的兩半:那一條擋的是「存檔還沒讀完就開始玩」,
 * 這一條擋的是「還沒進到瀏覽器就開始畫」。兩個都畫同一個 Loading,不會閃兩次。
 */
export default function HomeScreen() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <Game /> : <Loading />;
}

function Game() {
  const { save, loaded, update } = useSave();
  const { stage, coins } = save;
  const job = toLaneJob(save.job);

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
  const [lastResult, setLastResult] = useState<'cleared' | 'dead' | null>(null);
  /**
   * 生存模式這一輪抽到的地圖,以及開頭的抽地圖面板還開著沒。
   *
   * 兩個都放在 app 層,理由同一個:LaneRunner 每一關重新掛載,而這一輪的地圖與
   * 「只在第一關顯示一次的面板」都必須跨過那個邊界(見 LaneRunner 的 backdropOverride)。
   */
  const [survivalBackdrop, setSurvivalBackdrop] = useState<BackdropId>(BACKDROPS[0]);
  /**
   * 無限模式的交棒:**上一段結束時的樣子**(人數、裝備、技能,以及敵人那一側的最佳路線)。
   *
   * 放在 app 層的理由跟地圖同一個:LaneRunner 每一段都換 key 重新掛載,而這一輪的
   * 累積必須跨過那個邊界。null = 這一輪的第一段(從 1 個人開始滾)。
   */
  const [survivalHandoff, setSurvivalHandoff] = useState<RunHandoff | null>(null);
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

  /**
   * 任務判定要用的一切。**每次 render 現算**——任務的達成與否刻意不存進存檔
   * (見 game/quests.ts 的檔頭:存一份就會跟本尊不同步,而症狀是「任務永遠完成不了」)。
   */
  const questCtx: QuestContext = {
    stage,
    // 任務問的是「技能書練到什麼程度」,逐屬性之後那是六條線的總和。
    books: totalBookLevels(save.books),
    bestSurvival: save.bestSurvival,
    collected: collectedCount(decodeCollection(save.collected)),
    promoted: save.job !== null,
    counters: save.questCounters,
  };

  /**
   * 把一批任務計數器加進存檔。
   *
   * 走 `addCounters` 而不是原地 `+= 1`:存檔物件是 React state,原地改的話
   * 參考沒變,畫面上的任務進度會停在舊值直到別的原因觸發重畫——而任務橫幅
   * 正好是玩家會盯著看有沒有變的東西。
   */
  const bump = (delta: QuestCounters) =>
    update((prev) => ({ ...prev, questCounters: addCounters(prev.questCounters, delta) }));

  /**
   * 通關之後:該轉職就先轉職,不然直接回主介面並前進一關。
   *
   * **這裡原本夾著一層「三選一的永久技能」,整組拔掉了。**
   * 養成現在只剩三條:轉職(起跑數值)、技能書(放大元素與主動)、圖鑑(同上)。
   * 拔掉的理由是玩家要的養成軸是**場內那 18 款**——一場帶 10 格、跑完歸零,
   * 而永久技能是另一條進理想路線的線,兩條並存只會讓「每一關通關要按幾次」變多,
   * 卻沒有多給決策(永久技能只有 4 款,選項幾乎每次都一樣)。
   */
  function afterClear() {
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
  /** 剛拿到幾本技能書。副本一次給 5~15 本,不寫出來玩家不會發現(它只讓數字動一格)。 */
  const [justBooks, setJustBooks] = useState(0);

  /**
   * 剛跑完的單場副本結果。
   *
   * **不能沿用 lastResult**:主介面那一行寫的是「{stageLabel(stage - 1)} 通關」,
   * 而副本通關**不推進 stage**,所以那個算式會少報一關(打贏 1-6 卻寫成「1-5 通關」)。
   * 副本要講的本來也不是關卡編號,是「拿到什麼」。
   */
  const [dungeonNote, setDungeonNote] = useState<string | null>(null);

  /**
   * 一場跑完的掉落:裝備進圖鑑,偶爾掉技能書。
   * **陣亡也掉**(只是少)——完全不掉的話,卡關的人會完全沒有進展,
   * 而圖鑑正是拿來讓卡關的人有事做的。
   */
  /**
   * 一場跑完的掉落。**回傳這一場實際拿到什麼**,不是只寫進存檔。
   *
   * 為什麼要回傳:結果訊息要寫「火屬技能書 +12」,而那個數字如果只透過 setState 傳,
   * 同一個 tick 裡讀到的會是**上一場**的值(state 要下一次 render 才更新)——
   * 症狀是「每次結算都顯示上一場的數字」,而且它看起來只是偶爾對不上,很難聯想到時序。
   *
   * 抽落用的是 `save.collected`(目前這一格的狀態)而不是 update 裡的 prev:
   * 這一輪只有前面那一次加金幣的 update 在排隊,它不動圖鑑,所以兩者相同。
   */
  function rollRunDrops(cleared: boolean, runMode: Mode): { books: number; items: number[] } {
    const bits = decodeCollection(save.collected);
    const rng = () => Math.random();
    // 兩個每日副本掉的是**當日屬性**的東西,而且量是 5~15(見 game/dungeons.ts)。
    // 裝備副本只從那個屬性的碎片裡抽:整個 5668 件的圈上過濾會退化成繞幾千步,
    // 所以走 rollDropsForElement(它先把候選攤成清單再抽)。
    const today = elementOfDay();
    // 加倍長的小關(x-5 / x-10,20 波)掉雙倍:它花的時間是一般小關的兩倍,
    // 獎勵不跟著走的話,玩家會學到「跳過長關比較划算」——而那兩關正是段落的中點與魔王關。
    const longLevel = wavesForStage(mode === 'endless' ? survivalStage : stage) === LONG_LEVEL_WAVES;
    const items = runMode === 'armory'
      ? (cleared ? rollDropsForElement(bits, rollDungeonReward(rng), today, rng) : [])
      : rollDrops(bits, dropCountForRun(cleared, longLevel), rng);

    // 技能書。三條來源各自不同,而且**全部給當日屬性**:
    //
    //   一般跑圖   通關保證 BOOKS_PER_CLEAR 本(長關雙倍)+ 圖鑑機率再一本
    //   技能書副本 通關 5~15 本
    //   裝備副本   不給書(它產的是碎片)
    //
    // 為什麼一般跑圖也集中給當日屬性而不是六個平分:平分的話每一本只剩六分之一的份量,
    // 而 bookBonus 前段陡的設計就是要讓「第一本就有感」。集中給也讓「今天是火」
    // 這件事在主線裡一樣成立,不只在副本裡。
    const bonusBook = cleared && Math.random() < bookDropChance(bits);
    const books = runMode === 'grimoire'
      ? (cleared ? rollDungeonReward(rng) : 0)
      : runMode === 'armory'
        ? 0
        : (cleared ? (longLevel ? BOOKS_PER_LONG_CLEAR : BOOKS_PER_CLEAR) : 0) + (bonusBook ? 1 : 0);

    setJustFound(items);
    setJustBooks(books);
    update((prev) => {
      const next = decodeCollection(prev.collected);
      for (const index of items) addItem(next, index);
      return {
        ...prev,
        collected: encodeCollection(next),
        books: books > 0 ? addBooks(prev.books, today, books) : prev.books,
      };
    });
    return { books, items };
  }

  /**
   * 重新再來。**換 runKey 就等於整場重來**——LaneRunner 每一場都是一個新實例,
   * 跑到一半的狀態(波次、飛行中的武器、已結算的排、計時起點)全部跟著實例走,
   * 所以不必也不該在原地一項一項 reset(漏掉其中一項就會「上一場的怪出現在這一場」)。
   *
   * **這一場的金幣與掉落刻意不結算。** 玩家自己按的重來,還沒跑完就不算跑過;
   * 而且結算了才重來的話,反覆重開第一波就能刷圖鑑掉落。
   *
   * 無限副本是**整輪**重來不是這一關重來:只重開這一關等於把「不能重試」那條規則
   * 從後門打開(卡在第 8 關就一直重開第 8 關),而那條規則就是無限副本的全部壓力來源。
   */
  function restartRun() {
    if (mode === 'endless') {
      setSurvivalStage(survivalFrom);
      setSurvivalStreak(0);
      setSurvivalWaves(0);
      setSurvivalCoins(0);
      // 整輪重來 = 交棒清掉,重新從 1 個人開始滾。
      setSurvivalHandoff(null);
      setSurvivalBackdrop(drawBackdrop(null));
      setMapDrawOpen(true);
    }
    setRunKey((k) => k + 1);
  }

  /**
   * 放棄遊戲。**走跟陣亡完全一樣的路徑**,不另外做一條:
   * 一般模式回主介面且關卡不前進,無限副本進結算畫面(撐到哪就算到哪)。
   *
   * 為什麼放棄也要結算生存分數:玩家撐了十幾波才按放棄,把那些波數丟掉等於懲罰
   * 「主動結束」,而他真正想要的只是「不要再打下去」——那跟陣亡是同一件事的兩種到達方式。
   *
   * 統計交空的:放棄的那一場**不算跑過**(金幣與掉落也不結算,見 restartRun),
   * 任務計數器跟著同一條規則,不然「放棄」會變成刷任務進度的捷徑。
   */
  function quitRun() {
    onRunFinish('dead', 0, 0, { goodGates: 0, misses: 0, runSkillPicks: 0, rocksDodged: 0 });
  }

  function onRunFinish(
    result: 'cleared' | 'dead', earned: number, waves: number, stats: RunStats, handoff?: RunHandoff,
  ) {
    update((prev) => ({ ...prev, coins: prev.coins + earned }));
    const drops = rollRunDrops(result === 'cleared', mode);
    // 任務計數器。**每一場都記,副本也記**——任務問的是「你做過這件事沒有」,
    // 而在副本裡吃到的閘門跟在主線吃到的是同一件事。
    // 魔王只算主線:副本跑的關卡是「目前進度」,而那一關可能剛好是魔王關,
    // 算進去的話玩家會發現這個任務有時候莫名其妙自己完成了。
    bump(runCounters(stats, mode === 'normal' && result === 'cleared' && isBossStage(stage)));
    if (mode === 'endless') {
      setSurvivalCoins((c) => c + earned);
      const totalWaves = survivalWaves + waves;
      setSurvivalWaves(totalWaves);
      if (result === 'dead') {
        // 生存模式**不給重試**,死了就結算——壓力就在這裡。
        // 分數的單位是**波**不是關:生存模式是一條連續的跑圖,關卡只是中途換難度的刻度,
        // 而玩家心裡數的是「我撐過幾波」。
        // 技能書照「歷史最好的那一次」給,不是這一次:不然玩家可以刷短輪湊次數。
        // 逐屬性之後這一份給的是**當日屬性**,跟其他所有來源同一條規則。
        update((prev) => {
          const best = Math.max(prev.bestSurvival, totalWaves);
          const owed = booksForSurvival(best) - booksForSurvival(prev.bestSurvival);
          return {
            ...prev,
            bestSurvival: best,
            books: owed > 0 ? addBooks(prev.books, elementOfDay(), owed) : prev.books,
          };
        });
        setScreen('survivalOver');
        return;
      }
      // 過關就直接接下一關,中間不回主介面、不選永久技能、不轉職,**也不停下來等玩家按鈕**
      // (交棒由 LaneRunner 的 HANDOFF_MS 自己觸發)。那三件事都是「整備」,
      // 而無限副本的核心就是沒有整備的機會。
      setSurvivalStreak((n) => n + 1);
      setSurvivalStage((st) => Math.min(TOTAL_STAGES, st + 1));
      // **交棒**:人數、裝備、技能,以及敵人那一側的最佳路線一起帶到下一段。
      // 兩側一定要同時帶——只帶玩家側的話敵人會停在第一段的規格(整輪變散步),
      // 只帶敵人側則是玩家每段從 1 個人開始面對長大的敵人(第二段就死)。
      if (handoff) setSurvivalHandoff(handoff);
      setRunKey((k) => k + 1);
      return;
    }
    // 兩個單場副本:打完就回主介面,**關卡進度一格都不動**。
    //
    // 這一條很重要:副本跑的是「目前進度的那一關」,通關了也不能讓 stage +1——
    // 不然玩家可以靠副本推進主線,而副本的獎勵(技能書、碎片)是為「原地打轉」
    // 設計的,拿它推進度等於繞過主線的難度曲線。
    if (mode !== 'normal') {
      const spec = dungeonSpec(mode);
      // **通關才記次數,失敗不記。** 每日次數的單位是「通關」——打輸了還要扣一次的話,
      // 卡關的玩家會連試都不敢試,而副本本來就是給他用的。
      if (result === 'cleared' && isDailyDungeon(mode)) {
        const today = dayIndex();
        update((prev) => {
          // 跨日就從頭數起。這裡是唯一會寫 dungeonDay 的地方,寫的一律是「今天」。
          const base = prev.dungeonDay === today ? prev.dungeonClears : {};
          return {
            ...prev,
            dungeonDay: today,
            dungeonClears: { ...base, [mode]: (base[mode] ?? 0) + 1 },
          };
        });
      }
      setLastResult(null);
      setDungeonNote(result === 'cleared'
        // 寫**實際拿到多少**,不是寫規則。5~15 是隨機的,只複述「5~15 本」等於沒講。
        ? `${spec.name}通關 · ${mode === 'grimoire'
            ? `${elementLabel(elementOfDay())}屬技能書 +${drops.books}`
            : `${elementLabel(elementOfDay())}屬裝備 +${drops.items.length}`}`
        : `${spec.name}失敗,今天的次數沒被扣掉`);
      setScreen('menu');
      return;
    }
    if (result === 'dead') {
      backToMenu(false);
      return;
    }
    afterClear();
  }

  /**
   * 進副本。入場費在**進去之前**就扣掉,不是打完才扣。
   *
   * 打完才扣的話,陣亡的玩家會在結果卡上同時看到「倒下了」跟「-200 金幣」,
   * 而那看起來像懲罰(實際上他只是付了門票)。先扣則是一次單純的交易。
   */
  function enterDungeon(id: DungeonId) {
    // 次數守在這一層,不是只靠畫面把按鈕變灰:畫面的判斷跟真正的扣除是兩份程式,
    // 而「按鈕看起來能點但其實不該點」是最難查的一種 bug(存檔也是玩家改得動的)。
    if (clearsLeft(save.dungeonDay, save.dungeonClears, id) <= 0) return;
    const cost = dungeonCost(id, stage);
    update((prev) => ({ ...prev, coins: Math.max(0, prev.coins - cost) }));
    // 「進過這個副本沒有」是任務要問的事,所以在**進去的那一刻**就記,不是通關才記——
    // 任務寫的是「進一次」,而玩家第一次進去很可能會死。
    bump({ [dungeonCounter(id)]: 1 });
    playSfx('click');
    setMode(id);
    setLastResult(null);
    setDungeonNote(null);
    if (id === 'endless') {
      // 這一輪的地圖:**開跑前抽好,整輪不再變**。抽在這一層而不是 LaneRunner 裡,
      // 因為無限副本一關接一關、LaneRunner 每一關都重新掛載——抽在裡面的話
      // 每過一關地圖就換一次,而抽籤要給的是「這一輪的身分」不是「這一關的裝飾」。
      setSurvivalBackdrop(drawBackdrop(null));
      setMapDrawOpen(true);
      setSurvivalFrom(stage);
      setSurvivalStage(stage);
      setSurvivalStreak(0);
      setSurvivalWaves(0);
      setSurvivalCoins(0);
      setSurvivalHandoff(null);
    }
    setRunKey((k) => k + 1);
    setScreen('run');
  }

  // 讀存檔是非同步的,讀完之前一律不畫遊戲——先畫 1-1 再跳回真正的進度,
  // 玩家有可能在那一瞬間按下「開始闖關」,結束時就把預設值寫回去,進度整個被蓋掉。
  if (!loaded) return <Loading />;

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
          onDone={() => { setMode('normal'); setDungeonNote(null); setScreen('menu'); }}
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

  if (screen === 'skills') {
    return (
      <View style={styles.screen}>
        <Skills books={save.books} collected={save.collected} onDone={() => setScreen('menu')} />
      </View>
    );
  }

  if (screen === 'dungeons') {
    return (
      <View style={styles.screen}>
        <DungeonSelect
          stage={stage}
          coins={coins}
          bestSurvival={save.bestSurvival}
          dungeonDay={save.dungeonDay}
          dungeonClears={save.dungeonClears}
          onEnter={enterDungeon}
          onDone={() => setScreen('menu')}
        />
      </View>
    );
  }

  if (screen === 'quests') {
    return (
      <View style={styles.screen}>
        <Quests
          views={questViews(questCtx, save.questsClaimed)}
          onClaim={(id) => {
            // 領獎要照**當下**的 ctx 算一次,不是信任畫面上那顆按鈕:
            // 存檔是玩家改得動的,而 claimQuest 對不合法的請求一律回 0(不丟例外)。
            const got = claimQuest(questCtx, save.questsClaimed, id);
            if (got.coins <= 0) return;
            update((prev) => ({ ...prev, coins: prev.coins + got.coins, questsClaimed: got.claimed }));
          }}
          onDone={() => setScreen('menu')}
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
            setDungeonNote(null);
            setRunKey((k) => k + 1);
            setScreen('run');
          }}
          justFound={justFound}
          justBooks={justBooks}
          audio={audio}
          onChangeAudio={changeAudio}
          quest={activeQuest(questCtx, save.questsClaimed)}
          dungeonNote={dungeonNote}
          // 「開過設定沒」只有主介面這顆齒輪記得住(跑圖裡那顆在 LaneRunner 內部,
          // 而任務提示指的就是右上角這一顆)。
          onOpenSettings={() => bump({ settingsOpened: 1 })}
          onCodex={() => {
            // 「看過圖鑑沒」是任務要問的事,而圖鑑本身沒有別的地方記得住這件事。
            bump({ codexViewed: 1 });
            setScreen('codex');
          }}
          onSkills={() => { playSfx('click'); setScreen('skills'); }}
          onQuests={() => { playSfx('click'); setScreen('quests'); }}
          onDungeons={() => { playSfx('click'); setScreen('dungeons'); }}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <LaneRunner
        key={`${mode}-${mode === 'endless' ? survivalStage : stage}-${runKey}`}
        handoff={mode === 'endless' ? survivalHandoff : null}
        stage={mode === 'endless' ? survivalStage : stage}
        job={job}
        start={runStartFor(job)}
        books={save.books}
        collection={collectionScales(decodeCollection(save.collected))}
        survivalWavesBefore={mode === 'endless' ? survivalWaves : null}
        audio={audio}
        onChangeAudio={changeAudio}
        backdropOverride={mode === 'endless' ? survivalBackdrop : null}
        mapDraw={
          mode === 'endless' && mapDrawOpen
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
