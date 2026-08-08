import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { jobTitle, type LaneJob } from '../game/laneJobs';
import { Settings, type AudioSettings } from './Settings';
import { chapterOfStage, stageLabel, waveElementsForStage, wavesForStage } from '../game/laneRun';
import { tutorialRulesFor } from '../game/laneTutorial';
import type { QuestView } from '../game/quests';
import { totalBookLevels, type ElementBooks } from '../game/laneRunSkills';
import {
  COIN_ICON, GEAR_ICON, HERO_ASPECT, HERO_FRAME_MS, HERO_FRAMES, HERO_SEQUENCE, heroBoxHeight, LOCK_ICON,
  QUEST_ICON, TAB_ICONS,
  elementColor, elementLabel,
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
const HERO_BODY_HEIGHT = 110;
const HERO_HEIGHT = heroBoxHeight(HERO_BODY_HEIGHT);
const HERO_WIDTH = Math.round(HERO_HEIGHT * HERO_ASPECT);

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
  onStart: () => void;
  onDungeons: () => void;
  onCodex: () => void;
  onQuests: () => void;
}

export function MainMenu({
  stage, job, coins, lastResult, books, bestSurvival, justFound, justBooks, audio, onChangeAudio, quest,
  dungeonNote, onOpenSettings, onStart, onDungeons, onCodex, onQuests,
}: Props) {
  const [heroStep, setHeroStep] = useState(0);
  const [settings, setSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 主角永遠是史萊姆,轉職不換造型。職業立繪只留在轉職選擇畫面(那裡是在介紹職業)。
  const heroArt = HERO_FRAMES[HERO_SEQUENCE[heroStep]];
  // 教學關(1-1 ~ 1-5)才有。null 的時候整列不畫——不是教學關的人不需要多一行字,
  // 而多出來的那一行在 640 高的螢幕上正好會把「開始闖關」往下推。
  const tutorial = tutorialRulesFor(stage);

  useEffect(() => {
    const id = setInterval(() => setHeroStep((s) => (s + 1) % HERO_SEQUENCE.length), HERO_FRAME_MS);
    return () => clearInterval(id);
  }, []);

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

      {/* 中間:勇者站在正中央。這裡刻意什麼都不做——沒有跑道、沒有敵人,
          就是一個站著的角色 + 一顆開始闖關。戰鬥全部發生在跑道畫面裡。 */}
      <View style={styles.stage}>
        <View style={styles.ground} />
        <Image
          source={heroArt}
          resizeMode="contain"
          style={[styles.hero, { width: HERO_WIDTH, height: HERO_HEIGHT }]}
        />
      </View>

      {/*
        進關卡前的屬性提示。**押注要成立就得先看得到**——沒有這一列的話,
        「花一格點剋屬」跟擲骰子沒兩樣;有了它,開跑之前就能規劃這一場要往哪個環走。
        勇者波標「?」:敵方是勇者不是怪,屬性另外抽(見 laneRun 的 HERO_WAVE_ELEMENT_SALT),
        所以每三波就有一波押不到,通用技能永遠有位置。
      */}
      <View style={styles.briefRow}>
        <Text style={styles.briefLabel}>本關屬性</Text>
        <View style={styles.briefChips}>
          {waveElementsForStage(stage).map((w, i) => (
            <View
              key={i}
              style={[
                styles.briefChip,
                w.hidden
                  ? styles.briefChipHidden
                  : { borderColor: elementColor(w.element), backgroundColor: `${elementColor(w.element)}33` },
                w.boss && styles.briefChipBoss,
              ]}
            >
              <Text style={[styles.briefChipText, !w.hidden && { color: elementColor(w.element) }]}>
                {w.hidden ? '?' : elementLabel(w.element)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.resultRow}>
        {(justFound.length > 0 || justBooks > 0) && (
          <Text style={styles.found}>
            {[
              justFound.length > 0 ? `撿到 ${justFound.length} 件裝備` : '',
              justBooks > 0 ? `技能書 +${justBooks}` : '',
            ].filter(Boolean).join(' · ')}
          </Text>
        )}
        {/* 副本的結果優先:剛跑完副本的人要看的是「拿到什麼」,不是主線關卡編號。 */}
        {dungeonNote !== null ? (
          <Text style={styles.dungeonNote} numberOfLines={1}>{dungeonNote}</Text>
        ) : lastResult !== null && (
          <Text style={lastResult === 'cleared' ? styles.resultWin : styles.resultLose}>
            {lastResult === 'cleared' ? `${stageLabel(stage - 1)} 通關` : `${stageLabel(stage)} 失敗,再挑戰一次`}
          </Text>
        )}
      </View>

      {/*
        任務橫幅。**整條可以點**,點下去是任務面板。

        它是這一頁唯一會告訴玩家「分頁列上那些東西什麼時候能點」的地方——鎖頭只說明
        「還不行」,說不出「打到 1-10 就開」。可以領獎的時候整條變成金色:那是唯一
        會讓人去點它的訊號,做得不明顯等於沒做。
      */}
      {quest !== null && (
        <Pressable
          accessibilityLabel={quest.claimable ? `領獎 ${quest.quest.name}` : `任務 ${quest.quest.name}`}
          style={quest.claimable ? styles.questBannerReady : styles.questBanner}
          onPress={onQuests}
        >
          <Image source={QUEST_ICON} resizeMode="contain" style={styles.questIcon} />
          <View style={styles.questTextBox}>
            <Text style={quest.claimable ? styles.questNameReady : styles.questName} numberOfLines={1}>
              {quest.quest.name}
              {quest.quest.target > 1 && !quest.claimable ? ` ${quest.progress}/${quest.quest.target}` : ''}
            </Text>
            <Text style={quest.claimable ? styles.questHintReady : styles.questHint} numberOfLines={1}>
              {quest.claimable ? `可領取 ${quest.quest.coins} 金幣` : quest.quest.hint}
            </Text>
          </View>
        </Pressable>
      )}

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
          const open = tab.id === 'dungeon' || tab.id === 'equipment';
          return (
            <Pressable
              key={tab.id}
              style={styles.tab}
              accessibilityLabel={open ? tab.label : `${tab.label}(未開放)`}
              onPress={() => {
                if (tab.id === 'dungeon') onDungeons();
                else if (tab.id === 'equipment') onCodex();
                else setNotice(`${tab.label}尚未開放`);
              }}
            >
              <View style={styles.tabIconBox}>
                <Image source={tab.art} resizeMode="contain" style={styles.tabIcon} />
                {!open && <Image source={LOCK_ICON} resizeMode="contain" style={styles.tabLock} />}
              </View>
              <Text style={[styles.tabLabel, open && styles.tabLabelOpen]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {settings && (
        <Settings audio={audio} onChangeAudio={onChangeAudio} onClose={() => setSettings(false)} />
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
    minHeight: 150,
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
  hero: { marginBottom: 10 },
  // 像素圖不做平滑,放大之後才是硬邊的像素而不是糊掉的插值
  pixelArt: {},

  resultRow: { height: 18, justifyContent: 'center' },
  resultWin: { color: '#5ec26a', fontSize: 13, fontWeight: '600' },
  resultLose: { color: '#e05050', fontSize: 13, fontWeight: '600' },
  dungeonNote: { color: '#e0a95c', fontSize: 12, fontWeight: '600' },

  // 任務橫幅。兩種狀態共用同一個高度,不然「變成可領獎」的瞬間整個版面會跳一下。
  questBanner: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#2a2a35', borderRadius: 8, borderWidth: 1, borderColor: '#3a3448',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  questBannerReady: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#3a3448', borderRadius: 8, borderWidth: 1, borderColor: '#e0a95c',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  questIcon: { width: 18, height: 18 },
  // flexShrink 讓長提示自己截斷(numberOfLines),不會把整條橫幅撐寬。
  questTextBox: { flexShrink: 1, flexGrow: 1 },
  questName: { color: '#f2f2f2', fontSize: 12, fontWeight: '700' },
  questNameReady: { color: '#e0a95c', fontSize: 12, fontWeight: '700' },
  questHint: { color: '#8a8a95', fontSize: 11 },
  questHintReady: { color: '#e0a95c', fontSize: 11 },

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
  found: { color: '#5ec26a', fontSize: 12 },
  tabLabelOpen: { color: '#e0a95c' },
  tabLabel: { color: '#8a8a95', fontSize: 10 },
});
