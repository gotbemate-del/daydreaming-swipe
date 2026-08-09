import { useEffect, useState } from 'react';
import {
  Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type TextStyle,
} from 'react-native';

import { jobTitle, type LaneJob } from '../game/laneJobs';
import { Settings, type AudioSettings } from './Settings';
import { chapterOfStage, stageLabel, waveElementsForStage, wavesForStage } from '../game/laneRun';
import { tutorialRulesFor } from '../game/laneTutorial';
import type { QuestView } from '../game/quests';
import { totalBookLevels, type ElementBooks, type RunSkillId } from '../game/laneRunSkills';
import { playSfx } from '../hooks/useSfx';
import { EasterEggFrame } from './EasterEggFrame';
import { EVENT_ART, EVENT_KEYS } from './eventArt';
import { eventCaption } from '../game/eventCaption';
import { SkillIcon } from './SkillIcon';
import {
  COIN_ICON, GEAR_ICON, HERO_ASPECT, HERO_FRAMES, heroBoxHeight, LOCK_ICON, weaponArt,
  QUEST_ICON, TAB_ICONS,
  elementColor,
} from './artAssets';

// 主介面。每一場闖關的起點與終點——通關或陣亡都回到這裡,再自己按下一次「開始闖關」。
//
// 版面沿用姊妹作的骨架(上方狀態列、中間立繪、下方分頁列),但**只有中間那塊是活的**:
// 分頁列的十個功能(裝備/背包/技能/轉職/寵物/副本/商店/工坊/成就/轉生)目前全部未開放,
// 點下去只回一句提示。這是刻意的——這些系統的資料層雖然都搬進來了(game/equipment.ts 有
// 5668 件裝備),但它們的加成是為掛機設計的(speed 縮短戰鬥時間、exp 給經驗值),
// 直接接上來會違反 CLAUDE.md 的鐵則:speed 對應到跑速就等於「花錢買慢速」,
// 而經驗值系統這一款根本不打算要。要接得先重新定義加成對應到什麼,那是另一件事。
//
// 為什麼分頁列現在就畫出來而不是等功能做好:玩家要看得到「之後還有東西」,
// 而且版面高度先佔住,之後開放時不會整個畫面重排(那是最容易把按鈕擠出畫面的改動)。

/**
 * 主角「身體」的高度。要夠大才有「這是我的角色」的份量,但不能大到把開始按鈕擠出畫面。
 * 框比這個高一倍多(見 artAssets 的 HERO_BODY_RATIO),多出來的上半部是噴刺的空間。
 */
const HERO_BODY_HEIGHT = 76;
/**
 * 矮螢幕(640/667)的版本。**這一組一定要有**:畫框掛在史萊姆頭上之後,
 * 「框 + 說明 + 角色」疊起來大約 360——而 640 高的手機扣掉狀態列、屬性列、開始鍵與分頁列
 * 只剩三百出頭,不縮的話畫框的上緣會被裁掉(而且完全沒有警告,只是「圖怎麼少一截」)。
 * CLAUDE.md 的規矩:版面動過就要跨 640/667/780/844 四種高度量一次。
 */
const COMPACT_BELOW = 700;
const HERO_BODY_COMPACT = 56;
/** 點一下之後噴刺那一格停多久。比投擲的出手間隔短,不然姿勢會卡住看起來像定格。 */
const POKE_POSE_MS = 320;
/** 那一把武器往上飛多遠(像素)。飛到彩蛋框的位置剛好淡完。 */
const POKE_FLY = 90;

/** 分頁上寫什麼。轉職那一格改成任務(見分頁列的說明),其餘照素材表。 */
function tabLabel(tab: { id: string; label: string }): string {
  return tab.id === 'job' ? '任務' : tab.label;
}
/** 主介面的最大寬度(跟 styles.wrapper 同一個值)。畫框照它夾住,桌機上才不會拉成一條。 */
const WRAPPER_MAX_WIDTH = 520;

/**
 * 這一關會出現哪些屬性(**同一個只留一次**)。
 *
 * 有魔王的那一個標記起來(它是最值得押的一格);勇者波的屬性是藏起來的,
 * 全部併成最後那一個「?」——它們每一波都不一樣,列幾個都沒有資訊。
 */
function uniqueElements(
  waves: { element: RunSkillId; hidden?: boolean; boss?: boolean }[],
): { element: RunSkillId | null; boss: boolean }[] {
  const out: { element: RunSkillId | null; boss: boolean }[] = [];
  let hidden = false;
  for (const w of waves) {
    if (w.hidden) { hidden = true; continue; }
    const found = out.find((o) => o.element === w.element);
    if (found) { found.boss = found.boss || w.boss === true; continue; }
    out.push({ element: w.element, boss: w.boss === true });
  }
  if (hidden) out.push({ element: null, boss: false });
  return out;
}
const HERO_HEIGHT = heroBoxHeight(HERO_BODY_HEIGHT);
const HERO_WIDTH = Math.round(HERO_HEIGHT * HERO_ASPECT);
const HERO_HEIGHT_COMPACT = heroBoxHeight(HERO_BODY_COMPACT);
const HERO_WIDTH_COMPACT = Math.round(HERO_HEIGHT_COMPACT * HERO_ASPECT);

/** 分頁圖示的邊長。一列五個,390 寬的手機上剛好不擠。 */
const TAB_SIZE = 34;

interface Props {
  stage: number;
  job: LaneJob;
  coins: number;
  /** 上一場的結果。第一次進來是 null,之後回到主介面時顯示「通關了/倒下了」。 */
  lastResult: 'cleared' | 'dead' | null;
  /** 技能書等級,六個元素各自一份。狀態列顯示六條線的總和(細目在圖鑑那一頁)。 */
  books: ElementBooks;
  /** 生存模式最好撐過幾波(單位是波不是關,見 game/save.ts 的 SURVIVAL_BOOK_THRESHOLDS)。 */
  bestSurvival: number;
  /** 這一場剛撿到幾件裝備。主介面閃一下,不然玩家不會發現圖鑑有在長。 */
  justFound: number[];
  /** 這一場剛拿到幾本技能書。理由同上:它只讓圖鑑那一頁的數字動一格,不寫出來等於沒發生。 */
  justBooks: number;
  /** 音訊設定(音樂開關、音樂音量、音效音量)。跟跑圖中的設定面板共用同一組。 */
  audio: AudioSettings;
  onChangeAudio: (patch: Partial<AudioSettings>) => void;
  /**
   * 主介面橫幅上要顯示的那一個任務(全部做完就是 null)。
   *
   * 只給**一個**不是整份清單:橫幅的工作是「現在去做這件事」,列三個就變成一張表,
   * 而表格是要人閱讀的東西,橫幅不是(見 game/quests.ts 的 activeQuest)。
   */
  quest: QuestView | null;
  /**
   * 剛跑完的單場副本結果(沒有就是 null)。
   *
   * 跟 `lastResult` 分開是因為副本**不推進關卡**,而 lastResult 那一行是照
   * `stage - 1` 算標題的——副本沿用它會少報一關。副本要講的也不是關卡編號,是拿到什麼。
   */
  dungeonNote: string | null;
  /** 右上角齒輪被點開了(任務要記這件事)。 */
  onOpenSettings: () => void;
  /**
   * 重置存檔。傳進設定面板,由那裡的兩段式確認執行(見 Settings 的 onResetSave)。
   * **只有主介面有這一顆**——跑圖中重置等於在一場進行中的遊戲底下把地板抽掉。
   */
  onResetSave: () => void;
  onStart: () => void;
  onDungeons: () => void;
  onCodex: () => void;
  onSkills: () => void;
  onQuests: () => void;
}

export function MainMenu({
  stage, job, coins, lastResult, books, bestSurvival, justFound, justBooks, audio, onChangeAudio, quest,
  dungeonNote, onOpenSettings, onResetSave, onStart, onDungeons, onCodex, onSkills, onQuests,
}: Props) {
  // 矮螢幕整組縮一階(見 COMPACT_BELOW)。
  const win = useWindowDimensions();
  const compact = win.height < COMPACT_BELOW;
  // **畫框跟畫面同寬**(扣掉左右各 12 的邊距,並照 MainMenu 的 maxWidth 夾住)。
  // 高度照事件圖的比例回推,所以圖填滿之後不會被裁掉太多。
  const eggW = Math.min(WRAPPER_MAX_WIDTH, win.width) - 24;
  const eggH = Math.round(eggW * (compact ? 0.5 : 0.62));
  const heroW = compact ? HERO_WIDTH_COMPACT : HERO_WIDTH;
  const heroH = compact ? HERO_HEIGHT_COMPACT : HERO_HEIGHT;
  /**
   * 點史萊姆:①換成噴刺那一格 ②翻出一張彩蛋圖。
   *
   * **投擲那一格不再自己播。** 主畫面沒有敵人,而角色每兩秒自己噴一次刺,讀起來是
   *「他在打空氣」;改成點了才噴之後,那一格變成**玩家做的事**,而且剛好接上彩蛋:
   * 一次點擊 = 一個動作 + 一張沒看過的圖。
   */
  // **一進來就先掛一張。** 主畫面原本中間一大片是空的,而「點了才有東西」的設計
  // 有一個問題:沒點過的人不知道可以點。開場就掛一張(`at: 0` = 不播投擲那一格),
  // 畫面立刻有內容,而點下去換一張就是玩家自己發現的事。
  const [poke, setPoke] = useState<{ at: number; art: number }>(
    () => ({ at: 0, art: Math.floor(Math.random() * EVENT_ART.length) }),
  );
  const [settings, setSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 主角永遠是史萊姆,轉職不換造型。職業立繪只留在轉職選擇畫面(那裡是在介紹職業)。
  /**
   * **平常就是站著不動的第一格,只有點下去才換成噴刺那一格。**
   *
   * 這款的主角只有兩格圖(待機 / 噴刺),而噴刺是「出手」的姿勢——讓它自己循環的話,
   * 主畫面上沒有敵人卻每兩秒噴一次刺,讀起來是「他在打空氣」。停在第一格之後,
   * 那一格就完全屬於玩家的點擊,而點擊同時翻出一張彩蛋圖:一個動作換一則內容。
   */
  const throwing = poke.at > 0 && Date.now() - poke.at < POKE_POSE_MS;
  const heroArt = throwing ? HERO_FRAMES[1] : HERO_FRAMES[0];
  // 教學關(1-1 ~ 1-5)才有。null 的時候整列不畫——不是教學關的人不需要多一行字,
  // 而多出來的那一行在 640 高的螢幕上正好會把「開始闖關」往下推。
  const tutorial = tutorialRulesFor(stage);

  // 上一場的結果合成**一行**(見下方 resultRow 的說明)。null = 這一列留白。
  const resultLine: { text: string; style: TextStyle } | null = dungeonNote !== null
    ? { text: dungeonNote, style: styles.dungeonNote }
    : lastResult !== null
      ? {
          text: [
            lastResult === 'cleared' ? `${stageLabel(stage - 1)} 通關` : `${stageLabel(stage)} 失敗,再挑戰一次`,
            justFound.length > 0 ? `裝備 +${justFound.length}` : '',
            justBooks > 0 ? `技能書 +${justBooks}` : '',
          ].filter(Boolean).join(' · '),
          style: lastResult === 'cleared' ? styles.resultWin : styles.resultLose,
        }
      : null;

  /**
   * 投擲那一下的動畫。**主畫面沒有跑圖的 tick**,所以要自己開一個短的——
   * 沒有它的話武器不會動(只會出現一格),而噴刺的姿勢也會卡住不還原。
   * 只在點下去之後的 POKE_POSE_MS 內跑,平常一格都不重畫。
   */
  const [pokeTick, setPokeTick] = useState(0);
  useEffect(() => {
    if (poke.at === 0) return;
    const id = setInterval(() => setPokeTick((t) => t + 1), 33);
    const stop = setTimeout(() => clearInterval(id), POKE_POSE_MS + 40);
    return () => { clearInterval(id); clearTimeout(stop); };
  }, [poke]);

  // 提示自己消失。不做的話玩家連點幾個分頁,最後一句會一直留在畫面上像壞掉了。
  useEffect(() => {
    if (notice === null) return;
    const id = setTimeout(() => setNotice(null), 1600);
    return () => clearTimeout(id);
  }, [notice]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.topBar}>
        <Text style={styles.title}>滑動勇者</Text>
        <View style={styles.headRight}>
          <View style={styles.coinBox}>
            <Image source={COIN_ICON} resizeMode="contain" style={styles.coinIcon} />
            <Text style={styles.coinText}>{coins}</Text>
          </View>
          {/* 右上角的設定。用 ui/icon_gear.png ——之前這裡寫著「ui/ 沒有齒輪圖示」而改用文字,
              那是找漏了,圖一直都在。齒輪是玩家找設定的第一直覺,文字反而要讀。 */}
          <Pressable
            accessibilityLabel="設定"
            style={styles.settingsButton}
            onPress={() => { onOpenSettings(); setSettings(true); }}
          >
            <Image source={GEAR_ICON} resizeMode="contain" style={styles.settingsIcon} />
          </Pressable>
        </View>
      </View>

      <Text style={styles.jobLine}>
        第 {chapterOfStage(stage)} 大關 · {jobTitle(job)}
        {totalBookLevels(books) > 0 ? ` · 技能書 ${totalBookLevels(books)}` : ''}
        {bestSurvival > 0 ? ` · 生存 ${bestSurvival} 波` : ''}
      </Text>

      {/*
        教學關要學什麼。**只在 1-1 ~ 1-5 出現**,畢業之後整列消失。

        寫在主介面而不是跑圖裡,是因為它要在**開跑之前**被讀到:跑起來之後玩家的
        注意力全部在前方那一排上,那時候給他一句要理解的話等於在跟閘門搶注意力
        (跑圖裡給的是更短的 tip,見 laneTutorial 的 tip 欄位)。
      */}
      {tutorial !== null && (
        <View style={styles.tutorialRow}>
          <Text style={styles.tutorialTitle}>教學 {tutorial.stage}/5 · {tutorial.title}</Text>
          <Text style={styles.tutorialLesson}>{tutorial.lesson}</Text>
        </View>
      )}

      {/*
        中間:勇者站在正中央,旁邊是彩蛋框。

        主畫面原本只有「一個站著的角色 + 一顆開始闖關」,中間一大片是空的。
        彩蛋框把那片空白變成一個**可以按的東西**:點史萊姆 → 他噴一次刺 → 框裡翻出
        一張沒看過的圖(34 張輪流抽)。它不影響任何數值,純粹是「這個遊戲還有東西可以看」。
      */}
      <View style={[styles.stage, compact && styles.stageCompact]}>
        <View style={styles.ground} />
        {/*
          **畫框在上、角色在下,用 flex 排,不要絕對定位。**
          絕對定位的版本在 640 高的手機上會被 `overflow: hidden` 把畫框的上緣裁掉——
          而那看起來只是「圖少了一截」,不像版面問題(CLAUDE.md 記過同一種症狀)。
          交給 flex 之後,矮螢幕只要把兩者各縮一階就排得下(見 COMPACT_BELOW)。
        */}
        <View style={styles.stageColumn}>
          <View style={styles.eggWrap} pointerEvents="none">
            <EasterEggFrame width={eggW} height={eggH} scale={compact ? 0.4 : 0.46}>
              {/*
                **填滿整個框**:`cover` + 撐滿的方框。用 `contain` 的話畫框裡會留一圈黑邊,
                看起來像圖還沒載完;而這些事件圖的長寬比本來就接近框的比例,裁掉的很少。
              */}
              <Image
                source={EVENT_ART[poke.art]}
                resizeMode="cover"
                style={{ width: '100%', height: '100%' }}
              />
            </EasterEggFrame>
            {/*
              這一張是什麼。**沒有這一行的話翻出來的只是一張圖**——玩家看得到畫面,
              卻不知道自己翻到了什麼、跟上一張差在哪。說明由檔名推(見 game/eventCaption)。
            */}
            {/* 彩蛋文字最長二十幾個字,**兩行**是它的自然長度——寫死一行會被切掉半句。 */}
            <Text style={[styles.eggCaption, { maxWidth: eggW }]} numberOfLines={2}>
              {eventCaption(EVENT_KEYS[poke.art])}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="戳一下史萊姆"
            onPress={() => {
              playSfx('click');
              // **每次都換一張**:抽回同一張的話玩家點下去看到一模一樣的圖,
              // 第一個念頭是「壞了」——跟生存模式的重抽同一條規則。
              setPoke((prev) => {
                let art = Math.floor(Math.random() * EVENT_ART.length);
                if (art === prev.art) art = (art + 1) % EVENT_ART.length;
                return { at: Date.now(), art };
              });
            }}
          >
            <Image
              source={heroArt}
              resizeMode="contain"
              style={[styles.hero, { width: heroW, height: heroH }]}
            />
          </Pressable>
        </View>
        {/*
          丟出去的那一把武器。往上飛(跟跑道上的方向一致——前方就是畫面上方),
          飛到畫框那裡剛好淡出,所以「點一下 → 丟一把 → 框裡換一張圖」讀起來是一串因果。
        */}
        {throwing && (
          <Image
            source={weaponArt(job?.archetype ?? null, 1, poke.art)}
            resizeMode="contain"
            style={[
              styles.pokeWeapon,
              {
                bottom: heroH * 0.62 + POKE_FLY * Math.min(1, (Date.now() - poke.at) / POKE_POSE_MS),
                opacity: 1 - Math.min(1, (Date.now() - poke.at) / POKE_POSE_MS),
              },
            ]}
          />
        )}
      </View>

      {/*
        進關卡前的屬性提示。**押注要成立就得先看得到**——沒有這一列的話,
        「花一格點剋屬」跟擲骰子沒兩樣;有了它,開跑之前就能規劃這一場要往哪個環走。
        勇者波標「?」:敵方是勇者不是怪,屬性另外抽(見 laneRun 的 HERO_WAVE_ELEMENT_SALT),
        所以每三波就有一波押不到,通用技能永遠有位置。
      */}
      <View style={styles.briefRow}>
        <Text style={styles.briefLabel}>本關屬性</Text>
        {/*
          **同一個屬性只列一次。** 十波裡常常有四五波是同一個元素,一字排開會變成
          「金 金 金 木 金」——玩家真正要的資訊是「這一關會出現哪些屬性」(押注用),
          出現幾次不影響他的決定,而重複的字反而把那一列擠滿。
          有魔王的那個屬性標一圈金框(那是最值得押的一格),有勇者波就在最後補一個「?」。
        */}
        <View style={styles.briefChips}>
          {uniqueElements(waveElementsForStage(stage)).map((w) => (
            <View key={w.element ?? '?'} style={[styles.briefChip, w.boss && styles.briefChipBoss]}>
              {w.element === null
                // 「?」也畫成圓的:一整列裡只有它是方的,看起來像壞掉的那一格,
                // 而它其實是有意義的一格(勇者波的屬性不公開)。
                ? <View style={styles.briefUnknown}><Text style={styles.briefChipText}>?</Text></View>
                : <SkillIcon id={w.element} color={elementColor(w.element) ?? '#e0a95c'} size={26} />}
            </View>
          ))}
        </View>
      </View>

      {/*
        上一場的結果。**永遠只有一行。**

        這一列的高度是寫死的(不寫死的話,有沒有掉落會讓底下整組按鈕上下跳一格),
        所以兩段訊息一定要合成一個 Text ——分成兩個 Text 疊起來的話,第二個會被
        整個裁掉,而畫面上看起來只是「那則訊息沒出現」,完全不像版面問題。
        (實測就是這樣:副本通關的訊息一直沒顯示,因為它排在掉落那一行後面。)

        副本的結果優先:剛跑完副本的人要看的是「拿到什麼」,而它本身已經寫了拿到多少,
        所以不再重複掉落那一段。
      */}
      <View style={styles.resultRow}>
        {resultLine !== null && (
          <Text style={resultLine.style} numberOfLines={1}>{resultLine.text}</Text>
        )}
      </View>

      {/*
        任務橫幅。**整條可以點**,點下去是任務面板。

        它是這一頁唯一會告訴玩家「分頁列上那些東西什麼時候能點」的地方——鎖頭只說明
        「還不行」,說不出「打到 1-10 就開」。可以領獎的時候整條變成金色:那是唯一
        會讓人去點它的訊號,做得不明顯等於沒做。
      */}
      {/*
        任務整個搬到分頁列了(轉職那一格 + 有獎可領時角落一點紅)。
        **這裡連提示那一行都不留**:那一列每次只寫得下一個任務,而它換來的是
        畫框可以跟畫面同寬——主畫面的中心本來就該是角色與那張圖,不是一條廣告。
      */}

      <Pressable style={styles.startButton} accessibilityLabel="開始闖關" onPress={onStart}>
        <Text style={styles.startLabel}>開始闖關</Text>
        <Text style={styles.startSub}>{stageLabel(stage)} · 共 {wavesForStage(stage)} 波</Text>
      </Pressable>

      {/* 提示列的高度固定佔著,有沒有訊息都一樣高——不然點分頁時整個版面會上下跳。 */}
      <View style={styles.noticeRow}>
        {notice !== null && <Text style={styles.noticeText}>{notice}</Text>}
      </View>

      {/* style 與 contentContainerStyle 是兩回事,這裡兩個都要給:
          - style 沒有 width:'100%' 的話,ScrollView 會撐成內容寬(10 個分頁約 640),
            再被外層的 alignItems:'center' 置中 → 頭尾各溢出螢幕一段,而且是**捲不到**的
            (捲動範圍是內容 vs 容器,容器本身就已經比螢幕寬了)。實測 375 寬只看得到第 3~8 個。
          - flexGrow:0 是因為它在 column flex 裡會把剩下的高度全部吃掉,
            畫面下方就多出一大塊點不到的空白。 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBarScroll}
        contentContainerStyle={styles.tabBar}
      >
        {TAB_ICONS.map((tab) => {
          // 開放的兩個:副本(三種副本的選擇畫面)與裝備(圖鑑)。其餘八個維持鎖著。
          // 開放的三個:副本(三種副本)、裝備(圖鑑)、技能(18 款 + 技能書進度)。
          // 其餘七個維持鎖著(見檔頭的說明)。
          // **轉職那一格換成任務。** 轉職不是玩家「去逛」的地方——它在通過第 5/30/80/160/260
          // 大關的那一刻自己跳出來(見 app 層的 promotionTier),平常點進去沒有東西可做;
          // 而任務相反,它是每天回來第一個要看的東西。原本任務是主畫面上的一條橫幅,
          // 佔掉一整列而且只寫得下一個任務——搬進分頁列之後那一列讓給畫面,
          // 「有獎可領」則用角落的一點紅來講(見 questBadge)。
          const open = tab.id === 'dungeon' || tab.id === 'equipment' || tab.id === 'skill'
            || tab.id === 'job';
          return (
            <Pressable
              key={tab.id}
              style={styles.tab}
              accessibilityLabel={open ? tabLabel(tab) : `${tabLabel(tab)}(未開放)`}
              onPress={() => {
                if (tab.id === 'dungeon') onDungeons();
                else if (tab.id === 'equipment') onCodex();
                else if (tab.id === 'skill') onSkills();
                else if (tab.id === 'job') onQuests();
                else setNotice(`${tab.label}尚未開放`);
              }}
            >
              <View style={styles.tabIconBox}>
                <Image
                  source={tab.id === 'job' ? QUEST_ICON : tab.art}
                  resizeMode="contain"
                  style={styles.tabIcon}
                />
                {!open && <Image source={LOCK_ICON} resizeMode="contain" style={styles.tabLock} />}
                {/* 有獎可領:角落一點紅。徽章不寫數字——玩家只需要知道「那裡有東西」。 */}
                {tab.id === 'job' && quest?.claimable === true && <View style={styles.questBadge} />}
              </View>
              <Text style={[styles.tabLabel, open && styles.tabLabelOpen]}>
                {tabLabel(tab)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {settings && (
        <Settings
          audio={audio}
          onChangeAudio={onChangeAudio}
          onClose={() => setSettings(false)}
          onResetSave={() => { onResetSave(); setSettings(false); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', maxWidth: 520, flex: 1, alignItems: 'center', gap: 6 },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: '#e0a95c', fontSize: 20, fontWeight: '700' },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingsButton: {
    padding: 5, borderRadius: 6,
    backgroundColor: '#2a2a35', borderWidth: 1, borderColor: '#3a3448',
  },
  settingsIcon: { width: 18, height: 18 },
  coinBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  coinIcon: { width: 16, height: 16 },
  coinText: { color: '#f2f2f2', fontSize: 14, fontWeight: '600' },
  jobLine: { color: '#8a8a95', fontSize: 13 },

  // 教學提示。整列刻意做窄(兩行共 30px):它只在前五關出現,但版面不能為了它
  // 把「開始闖關」往下推——那是這個專案踩過最貴的一種 bug。
  tutorialRow: { width: '100%', alignItems: 'center' },
  tutorialTitle: { color: '#e0a95c', fontSize: 12, fontWeight: '700' },
  tutorialLesson: { color: '#9691a5', fontSize: 11, textAlign: 'center' },

  // 立繪區吃掉剩下的高度。用 flex 而不是固定高:小螢幕自己縮,不會把下面的按鈕頂出畫面——
  // 這是這個專案踩過最痛的一個坑(見 CLAUDE.md「版面」那段)。
  stage: {
    width: '100%',
    flex: 1,
    // 畫框 + 說明 + 角色,三個加起來大約 330。
    minHeight: 330,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: '#1d1d26',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a35',
    overflow: 'hidden',
  },
  // 屬性提示列。chip 刻意做小(18px):長關有 20 波,再大一點在 375 寬的手機上會擠成三行,
  // 把下面的「開始闖關」推出畫面——版面被切掉是這個專案踩過最貴的一種 bug。
  briefRow: { width: '100%', marginTop: 8, alignItems: 'center' },
  briefLabel: { color: '#8a8a95', fontSize: 11, marginBottom: 4 },
  briefChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 3 },
  briefChip: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  briefChipHidden: { borderColor: '#3a3448', backgroundColor: '#2a2a35' },
  briefUnknown: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#3a3448',
    backgroundColor: '#2a2a35', alignItems: 'center', justifyContent: 'center',
  },
  /** 魔王那一格加一圈金框:整關最值得押注的就是它(關卡固定,屬性也固定)。 */
  briefChipBoss: { borderWidth: 2, borderColor: '#e0a95c' },
  briefChipText: { fontSize: 10, color: '#8a8a95' },
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 34,
    backgroundColor: '#22301f',
    borderTopWidth: 1,
    borderTopColor: '#3d4a33',
  },
  // **往上收一截**:主角圖的上半部是留給噴刺的空白(見 heroBoxHeight),
  // 待機時那一段是透明的,不收的話畫框與史萊姆之間會空出一大塊看起來像沒對齊。
  hero: { marginBottom: 6, marginTop: -22 },
  // 彩蛋框浮在勇者上方(不是推開他):主角的位置是主畫面的定錨,不該因為點了一下就跳。
  // 掛在史萊姆頭頂**正上方**,不是釘在框的最上緣——釘上緣的話中間會空一大塊,
  // 而主畫面「太空」正是要解掉的問題。
  eggWrap: { alignItems: 'center' },
  /** 框 + 角色排成一直,整組靠底(角色站在地面線上)。 */
  stageColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingTop: 8 },
  /** 矮螢幕:整塊再讓出一點高度給下面的開始鍵。 */
  stageCompact: { minHeight: 250 },
  eggCaption: {
    marginTop: 4, color: '#e0a95c', fontSize: 12,
    textAlign: 'center', backgroundColor: '#16161cc0', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 4,
  },
  // 投擲的武器:朝右上的圖(-45 度是這個專案的既有慣例,見 LaneRunner 的投射物)。
  pokeWeapon: {
    position: 'absolute', width: 30, height: 30, alignSelf: 'center', zIndex: 5,
    transform: [{ rotate: '-45deg' }],
  },
  // 像素圖不做平滑,放大之後才是硬邊的像素而不是糊掉的插值
  pixelArt: {},

  resultRow: { height: 18, justifyContent: 'center' },
  resultWin: { color: '#5ec26a', fontSize: 13, fontWeight: '600' },
  resultLose: { color: '#e05050', fontSize: 13, fontWeight: '600' },
  dungeonNote: { color: '#e0a95c', fontSize: 12, fontWeight: '600' },

  // 任務橫幅。兩種狀態共用同一個高度,不然「變成可領獎」的瞬間整個版面會跳一下。
  // flexShrink 讓長提示自己截斷(numberOfLines),不會把整條橫幅撐寬。

  startButton: {
    width: '100%',
    backgroundColor: '#e0a95c',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  startLabel: { color: '#16161c', fontSize: 18, fontWeight: '700' },
  startSub: { color: '#4a3a20', fontSize: 12, marginTop: 2 },

  noticeRow: { height: 18, justifyContent: 'center' },
  noticeText: { color: '#9691a5', fontSize: 12 },

  tabBarScroll: { width: '100%', flexGrow: 0 },
  tabBar: { flexDirection: 'row', gap: 12, paddingHorizontal: 4, alignItems: 'flex-start' },
  tab: { alignItems: 'center', width: 52, gap: 2 },
  tabIconBox: { width: TAB_SIZE, height: TAB_SIZE, opacity: 0.45 },
  tabIcon: { width: TAB_SIZE, height: TAB_SIZE },
  // 鎖頭壓在圖示右下角。不用 opacity 壓掉,鎖頭本身要看得清楚才讀得出「這是鎖住的」。
  tabLock: { position: 'absolute', right: -2, bottom: -2, width: 15, height: 15, opacity: 1 },
  tabLabelOpen: { color: '#e0a95c' },
  tabLabel: { color: '#8a8a95', fontSize: 10 },
  questLine: {
    alignSelf: 'stretch', alignItems: 'center', paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, borderColor: '#e0a95c', backgroundColor: '#e0a95c22',
  },
  questLineText: { color: '#e0a95c', fontSize: 12, fontWeight: '700' },
  questBadge: {
    position: 'absolute', right: -2, top: -2, width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#e05050', borderWidth: 1, borderColor: '#16161c',
  },
});
