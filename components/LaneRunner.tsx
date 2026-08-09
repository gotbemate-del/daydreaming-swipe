import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { enemyHeroLookForRow, jobTitle, type LaneJob } from '../game/laneJobs';
import {
  gateLabel,
  isTrapGate,
  gateSpan,
  SQUAD_DX,
  LANE_COUNT,
  MAX_GEAR,
  MISS_MESSAGE,
  runLength,
  stageLabel,
  backdropForStage,
  totalAttack,
  ELITE_MASS,
  VISIBLE_AHEAD,
  ROCK_GRAZE_MESSAGE,
  type RunRock,
  type WaveMonster,
  type RunRow,
  type RunStart,
  type BackdropId,
} from '../game/laneRun';
import { STAGE_BACKDROPS } from './stageBackdrops';
import { SkillIcon } from './SkillIcon';
import { SkillFx, SKILL_FX_MS } from './SkillFx';
import { Settings, type AudioSettings } from './Settings';
import { MapDrawToast } from './MapDrawToast';
import { playSfx } from '../hooks/useSfx';
import {
  describeRunSkill, runSkillSpec, elementOf, ELEMENT_COUNTERS, isActiveSkill, FREEZE_MS,
  type CollectionScales, type RunSkillId, type ElementBooks,
} from '../game/laneRunSkills';
import {
  HIT_NUMBER_MS, ELEMENT_FX_MS, FEEDBACK_MS, useLaneRun,
  STRIKE_BANNER_MS,
  type CarriedSkill, type ElementEvent, type HitNumber, type Projectile, type WaveView,
} from '../hooks/useLaneRun';
import type { RunStats } from '../game/quests';
import { tutorialRulesFor } from '../game/laneTutorial';
import { PixelFrame } from './PixelFrame';
import {
  heroBoxHeight, heroForm, squadForms, monsterArt, weaponArt, jobHeroArt, ROCK_ART,
  elementColor, elementLabel, monsterAnim, jobHeroAnim, animFrameIndex, GEAR_ICON, GATE_SCROLL,
} from './artAssets';

// 跑道畫面。角色固定在跑道底部、物件由上往下逼近——這是「角色在跑」最省效能的表現方式:
// 真的移動角色的話背景要跟著捲、視差要對齊,在 RN 上等於自己寫一個 2D 引擎;讓物件往下移
// 視覺上完全等價,而且每個物件只是一個絕對定位的圖。
//
// 橫向則相反:角色是真的跟著手指走的(見 panResponder),位置連續、不是三格跳。
// 跑道高度**不算、用量的**:跑道是 flex:1,實際多高由 onLayout 回報。
//
// 先前是「視窗高 - 固定的周邊高度」算出來的,結果第一關被壓縮:手機瀏覽器剛載入時網址列還在,
// 視窗矮,算出來的跑道就矮;之後玩家一滑、網址列收起來,視窗變高了,但第一關那個實例不會
// 重新掛載,跑道就一直維持矮的,上方留一大塊沒用到的空白。第二關因為換 key 重新掛載才正常。
// 改成量容器實際高度之後,網址列一收起來 onLayout 就會再觸發,跑道自己撐開——而且以後
// 周邊多一列少一列都不必再手動維護那個常數。
/** 再矮就看不到足夠的前方路況了。低於這個值寧可讓畫面捲動。 */
const TRACK_HEIGHT_MIN = 320;

/**
 * 主角在跑道上的「身體」要多高。框比這個高一倍多(見 artAssets 的 HERO_BODY_RATIO)——
 * 多出來的上半部是留給噴刺那一格的,身體位置不受影響(框是靠下對齊的)。
 */
const HERO_BODY_HEIGHT = 44;
/**
 * 擲出武器之後,噴刺那一格要維持多久。
 * 太短(< 100ms)在 30fps 下常常整格被跳過,看起來像沒動;太長會一直卡在噴刺的姿勢,
 * 人多的時候投擲間隔只有 90ms,那樣就永遠回不到待機。
 */
const HERO_SPIKE_MS = 130;
/** 金・擴散甩出去的那一把畫多大,以及命中閃光的大小。刀比玩家投擲的小一號(它是擴散不是主攻)。 */
const SPREAD_SIZE = 20;
const SPREAD_BURST = 12;
/** 技能列那一排圓的直徑。34 是「環看得出走到哪」與「一排塞得下 6 顆」的交界。 */
const SKILL_ICON_SIZE = 34;
/** 技能列擠到滿的時候縮到多小為止。再小的話等級的小圓就讀不出來了。 */
const MIN_SKILL_ICON_SIZE = 20;
// 只給 headY 當基準用(見下方 form 那段的說明):版面錨點固定用基本型,合體不會讓它位移。
const HERO_HEIGHT = heroBoxHeight(HERO_BODY_HEIGHT);
const HERO_BOTTOM = 10;
/** 最高的物件高度。用來確保最遠的物件是從畫面外「冒出來」而不是憑空出現在上緣。 */
const SPAWN_MARGIN = 72;
/**
 * 物件通過判定線之後還畫多遠才收掉(單位是「距離」不是像素,這兩個值長得像但差 10 倍)。
 *
 * 0 = 碰到判定線就消失。閘門原本會再往下滑一小段才收,想做出「跑過一道門」的感覺,
 * 但實際玩起來是框整個套在勇者身上再慢慢滑走,玩家分不清「到底哪一刻算數」——
 * 已經結算完的框還黏在身上,看起來像還沒吃到、或是會再吃一次。
 * 現在框消失的那一刻 = 結算的那一刻,沒有第二種解讀。
 */
const GATE_CULL_PAST = 0;
const GATE_HEIGHT = 50;
/**
 * 卷軸兩端軸桿畫多高。
 *
 * 固定值不是比例:軸桿是一根有厚度的金屬棒,它在 50px 高的閘門與 60px 高的閘門上
 * 應該一樣粗。用比例的話閘門一變高軸桿就跟著變胖,看起來像另一種東西。
 * 7px 是照原圖的比例(80x5 的上軸貼到約 120px 寬)換算的。
 */
const SCROLL_ROD_H = 7;
const MONSTER_SIZE = 42;
/** 大魔王畫多大。要一眼看出「這不是小怪」,但不能寬到蓋掉兩條跑道。 */
const BOSS_SIZE = 132;
/** 精英畫多大。介於小怪與魔王之間,一眼看出「這隻不一樣」但不會蓋掉兩條跑道。 */
const ELITE_SIZE = 84;
const PROJECTILE_SIZE = 30;
/** 主動技能特效播多久。要看得到,但不能久到蓋住下一波。 */

/**
 * 石頭畫多大。**刻意等於 MONSTER_SIZE**——判定寬度(laneRun 的 ROCK_WIDTH)就是照小怪的
 * 視覺尺寸定的,畫大一點會讓玩家以為擦到了卻沒事,畫小一點則反過來。
 * 兩個常數要一起改,不要只動其中一個。
 */
const ROCK_SIZE = MONSTER_SIZE;
/**
 * 屬性染色疊多濃。tintColor 那一層是單色剪影,太濃會蓋掉造型、太淡看不出屬性;
 * 0.45 是「一眼分得出顏色、還認得出是哪一種怪」的位置。
 */
const ELEMENT_TINT_OPACITY = 0.45;
/** 敵方勇者的武器從投擲者飛到玩家要多久。 */
const ENEMY_SHOT_MS = 800;
/**
 * 同一個人同時掛幾把。
 *
 * 只有一個投擲者的時候是 3 把(要靠它連成一條看得出來的線)。改成「活著的人都在丟」之後
 * 線有十幾條,3 把會變成 35 把同時在畫面上——閘門整個被蓋住,而且反而看不出哪裡安全。
 * 2 把仍然連得成一道,總量卻少三分之一。
 */
const ENEMY_SHOTS_PER_LANE = 2;
/** 敵人的武器畫多大。比玩家丟的小一點:它們數量多,同尺寸會把整個畫面吃掉。 */
const ENEMY_SHOT_SIZE = 24;
/** 被砸中之後整片跑道閃紅的時間。夠長才看得到,但不能長到蓋住下一波。 */
const HAZARD_FLASH_MS = 420;
/**
 * 敵方勇者的投擲動作維持多久。
 * 出手間隔是 620ms(ENEMY_THROW_INTERVAL_MS),所以這個值要明顯短於它,
 * 不然輪到的那個人會一直卡在投擲的姿勢,看起來像定格而不是「丟了一下」。
 */
const THROW_POSE_MS = 260;
/**
 * 一波最多同時畫幾隻。**這是繪製上限,不是玩法上限**——
 * 結算、擊殺數、漏接數一律照完整的隻數算(見 laneRun 的 MAX_WAVE_SIZE 已經開到 400)。
 *
 * 為什麼需要它:隻數解除上限之後,第 1 關最後一波是 152 隻擠在 549 的距離裡,
 * 換算到畫面上**每隻只相隔 5.6px,而圖是 42px 寬**——牠們 87% 互相重疊,
 * 玩家看到的是一堵牆而不是 152 隻怪,但瀏覽器仍然要老實地畫 300 多張圖
 *(實測掉到 9 fps)。畫最近的 64 隻視覺上完全一樣,因為多的那些本來就被蓋住了。
 *
 * **挑最近的**而不是平均取樣:前面那幾隻才是正在倒下、以及即將撞上你的那幾隻,
 * 視線本來就在那裡。
 */
const MAX_DRAWN_MONSTERS = 64;
/**
 * 生存模式一關接一關之間的過場時間。
 * 太短(< 500ms)會變成畫面自己閃了一下,玩家不知道發生什麼事;
 * 太長就變成「還是有中斷」,而不中斷正是生存模式改版的重點。
 */
const HANDOFF_MS = 900;
/**
 * 教學提示在跑道上留多久。
 *
 * 4.5 秒是「讀得完一句話」與「第一排閘門進視野之前」的交界:第 1 關的
 * LEAD_IN_DISTANCE 加上第一段戰鬥段,大約 6 秒才會有東西要決定。留得再久就會變成
 * 跟閘門搶注意力,而這款一排只有一兩秒可以決定。
 *
 * **一定要用 setTimeout 真的把它關掉,不能在畫的時候算「過了幾毫秒」。**
 * 後者只在重畫的時候才跑,而跑圖一停(打開設定面板、挑技能)tick 就停了,
 * 提示會凍在畫面上——這個專案在回饋文字上踩過一模一樣的坑(見 CLAUDE.md)。
 */
const TUTORIAL_TIP_MS = 4500;

/** 凍住的怪疊什麼顏色。跟 artAssets 的冰屬性同色系,但更亮——它要蓋過原本的屬性染色。 */
const FROST_COLOR = '#9fd8e8';
/** 燃燒擴散那一團光多大(以像素計,跟小怪同尺度)。 */
const BURN_SIZE = 34;
/** 凍結那一下炸開的圈多大。 */
const FROST_BURST = 28;
/** 技能收掉那一隻時炸開的環,起始直徑。比凍結那圈大一點——它代表的是「死亡」不是「狀態」。 */
const BLAST_BURST = 34;
/** 燃燒中的怪疊什麼顏色。跟 artAssets 的火屬性同色系但更亮(它要蓋過屬性染色)。 */
const BURN_COLOR = '#e8814a';
/** 土・遲滯疊在怪身上的咖啡色。跟 artAssets 的土屬性同色。 */
const EARTH_COLOR = '#a8865e';


/**
 * 這個技能對上接下來幾波是「剋」還是「被剋」,標成一行短字。
 * 兩邊都標:相剋是雙向的,只標有利的一半會讓押錯變成看不見的損失。
 */
function counterTag(id: RunSkillId, upcoming: RunSkillId[]): string {
  if (!ELEMENT_COUNTERS[id]) return '';
  const good = upcoming.filter((e) => ELEMENT_COUNTERS[id] === e).length;
  const bad = upcoming.filter((e) => ELEMENT_COUNTERS[e] === id).length;
  if (good === 0 && bad === 0) return '';
  return `  ${good > 0 ? `剋 x${good}` : ''}${good > 0 && bad > 0 ? ' / ' : ''}${bad > 0 ? `被剋 x${bad}` : ''}`;
}

/**
 * 距離 → 物件底邊的 y。
 * ahead = 0 時底邊剛好落在勇者頭頂:玩家看到「頭碰到東西」的那一格,就是結算發生的那一格。
 * ahead = VISIBLE_AHEAD 時整個物件在畫面上緣之外。
 *
 * headY 要傳進來(不能用模組常數),因為跑道高度隨視窗變——但 VISIBLE_AHEAD 是距離單位、
 * 不隨畫面變,所以難度不受影響:矮螢幕只是把同樣的一段路畫得比較密。
 */
function bottomYFor(ahead: number, headY: number): number {
  return headY - (ahead / VISIBLE_AHEAD) * (headY + SPAWN_MARGIN);
}

// 隊形:主角在最前面(畫面最下),其他人往後往兩側散開成一團。人數再多只加數字——
// 真的畫 64 個人的話一格會被塞滿、看不出跑道,而且每個 tick 要重排 64 個絕對定位的圖。
// 後排刻意畫小一點(scale)並且各自用不同的相位晃動,看起來才像一群人在跑而不是貼圖陣列。
//
// **橫向位置(dx)不在這裡,在 game/laneRun.ts 的 SQUAD_DX。** 那不是為了分層漂亮:
// 閘門判定改成「身體碰到就算」之後,隊伍畫多寬就等於判定多寬——「這一隻畫在哪」
// 直接決定吃不吃得到。兩邊各留一份座標的話,改了其中一份就會出現
// 「看起來碰到了但沒反應」,而那是這款最不能有的一種 bug。
// 這裡只留純視覺的 dy 與 scale。
const SQUAD_DEPTH = [
  { dy: 0, scale: 1 },
  { dy: -12, scale: 0.94 },
  { dy: -12, scale: 0.94 },
  { dy: -22, scale: 0.88 },
  { dy: -22, scale: 0.88 },
  { dy: -26, scale: 0.86 },
  { dy: -26, scale: 0.86 },
  { dy: -34, scale: 0.8 },
  { dy: -34, scale: 0.8 },
  { dy: -38, scale: 0.78 },
  { dy: -38, scale: 0.78 },
  { dy: -42, scale: 0.76 },
  { dy: -50, scale: 0.72 },
  { dy: -50, scale: 0.72 },
];

/*
 * 底圖上要疊一層暗色紗(`STAGE_BACKDROPS[...].scrim`),沒有它畫面會壞在一個具體的地方:
 * 底圖是滿版的場景圖(夜市的霓虹燈、雪原的白),而閘門、怪、傷害數字全是小尺寸的像素圖
 * 疊在上面——底圖一亮,前景就讀不出來了,玩家看得到「很漂亮的街景」但看不到
 * 「下一排要站哪一格」,而**那正是這遊戲唯一要看的東西**。
 *
 * 兩個決定記在這裡:
 *   - 用半透明的紗,不是把圖本身調暗。調暗只能 build-time 產圖(CSS filter 在 RNW 上
 *     會被丟掉,這個坑記在 CLAUDE.md),而且同一張圖以後想拿去別的地方用就沒得調了。
 *   - **紗的濃度逐張不同,而且是產生檔算出來的**,不是這一層挑一個好看的數字:
 *     這批圖本身的亮度差三倍以上(草原 0.15、荒漠 0.52),套同一個透明度的話,
 *     荒漠那幾個大關的地面比草原亮三倍,同一組前景的可讀性完全不一樣。
 *     計算在 scripts/shrink-backdrops.py 的 SCRIM_TARGET。
 */

interface Props {
  stage: number;
  job: LaneJob;
  /** 起跑數值(轉職 + 技能算完的結果)。畫面不自己算養成,由 app 層算好傳進來。 */
  start: RunStart;
  /** 技能書等級,**六個元素各自一份**。只放大元素的效果,不進理想路線。 */
  books?: ElementBooks;
  /**
   * 生存模式:這一輪在**這一關之前**已經撐過幾波(不是生存模式就是 null)。
   *
   * 生存模式是**一條連續的跑圖**:通關不畫結果卡、不等玩家按鈕,直接接下一關,
   * 所以畫面上的分數必須是「累計波數」而不是這一關的第幾波——後者每十波歸零,
   * 玩家會以為自己重新開始了。
   */
  survivalWavesBefore?: number | null;
  /** 裝備圖鑑給的放大倍率(技能 id → 倍率;只放大元素與主動)。 */
  collection?: CollectionScales;
  /**
   * 音訊設定 + 修改。**跑圖中也要有這一整組**:一場長關 6 分鐘、生存模式更久,
   * 只放在主介面等於「想調音量就得先死一次」。
   *
   * 給的是齒輪不是一顆音樂開關:齒輪打開的面板同時是**暫停**
   *(見 settingsOpen),而中場能停下來這件事本身就是玩家會找的功能。
   */
  audio?: AudioSettings;
  onChangeAudio?: (patch: Partial<AudioSettings>) => void;
  /**
   * 底圖換成指定的那一張(生存模式抽到的)。不給就照關卡的大關走。
   *
   * 為什麼是 prop 不是 LaneRunner 自己抽:生存模式是一關接一關,而 LaneRunner
   * **每一關都換 key 重新掛載**——自己抽的話每過一關地圖就換一次,而抽籤的意義
   * 是「這一輪的身分」,不是「這一關的裝飾」。抽在 app 層,整輪只抽一次。
   */
  backdropOverride?: BackdropId | null;
  /**
   * 開場的抽地圖 toast(只有生存模式的第一關給)。給了就會在跑圖上蓋一層面板並暫停,
   * 玩家按「開始」或倒數結束才解除。`onRedraw` 由 app 層負責抽新的一張。
   */
  mapDraw?: { onRedraw: () => void; onDone: () => void } | null;
  /**
   * 暫停面板上的兩顆:重新再來 / 放棄遊戲。**都由 app 層執行**——
   * 「這一場」的生命週期是 app 層在管的(runKey、生存模式的累計、存檔),
   * 在跑圖裡自己重置等於再發明一套,而漏掉其中一項的症狀是
   *「上一場的東西出現在這一場」(CLAUDE.md 記過,所以每一場都換 key 重新掛載)。
   */
  onRestart?: () => void;
  onQuit?: () => void;
  /**
   * 這一場結束(通關或陣亡)。coins 是這一場賺到的,由 app 層累加起來帶回主介面。
   * waves 是這一關實際打完幾波——生存模式的分數是**累計波數**,而死在第 3 波跟
   * 死在第 9 波差很多,只回傳「過了沒」會把那個差別整個丟掉。
   */
  onFinish: (result: 'cleared' | 'dead', coins: number, waves: number, stats: RunStats) => void;
}

export function LaneRunner({
  stage, job, start, onFinish, books = {}, survivalWavesBefore = null, collection = {},
  audio, onChangeAudio, backdropOverride = null, mapDraw = null, onRestart, onQuit,
}: Props) {
  /**
   * 設定面板開著的時候跑圖停住。
   *
   * 這不是「順便」——它就是玩家要的暫停。跑圖中沒有別的地方可以停下來(生存模式尤其:
   * 一輪可能跑十幾分鐘),而「我要接電話」跟「我想調音量」在體感上是同一件事:
   * **先讓畫面別動**。所以齒輪＝暫停鈕,面板標題也直接寫「已暫停」。
   */
  const [settingsOpen, setSettingsOpen] = useState(false);
  /**
   * 教學關開跑時浮的那一句(1-1 ~ 1-5 才有)。自己收掉,不等玩家關。
   *
   * 主介面那一列講的是「這一關要學什麼」(開跑前讀),這裡講的是**當下要做什麼**,
   * 所以刻意寫得更短——玩家已經在跑了,長句子讀不完。
   */
  const tutorial = tutorialRulesFor(stage);
  const [tipVisible, setTipVisible] = useState(tutorial !== null);
  // 抽地圖的面板也要停:它蓋在跑道上面,不停的話玩家在讀地圖名稱的那幾秒會漏掉第一排閘門。
  const drawing = mapDraw !== null;
  const run = useLaneRun(stage, start, books, collection, settingsOpen || drawing);
  const {
    state, distance, heroOffset, upcoming, wave, projectiles, hitNumbers, rocks, readStats,
    lastShotAt, lastShotId, feedback, steer, dragTo,
    runSkills, skillOffers, pendingPicks, chooseRunSkill, lastStrike, upcomingElements,
    enemyShots, lastHazardAt, enemyThrowAt, waveNumber, totalWaves,
    elementEvents, carriedSkills,
  } = run;
  const attack = totalAttack(state);

  // 教學提示自己收掉。**用真的計時器**,不是在畫的時候算過了幾毫秒——
  // 後者在跑圖暫停(設定面板、挑技能)的時候會凍住,提示就再也不會消失。
  useEffect(() => {
    if (tutorial === null) return;
    const id = setTimeout(() => setTipVisible(false), TUTORIAL_TIP_MS);
    return () => clearTimeout(id);
  }, [tutorial]);

  /** 生存模式:一條連續的跑圖,通關不停下來等玩家按鈕。 */
  const continuous = survivalWavesBefore !== null;

  /**
   * 生存模式的交棒:通關之後**自動**接下一關。
   *
   * 為什麼留一小段延遲而不是立刻交棒:玩家剛打完最後一波,畫面上還有屍體與飛行中的武器,
   * 瞬間換場等於「我做了什麼?」。HANDOFF_MS 剛好夠看完那一行「1-3 通過」。
   *
   * **陣亡不走這條**——那是這一輪的結束,要停下來給玩家看分數。
   */
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  /**
   * 通關 / 陣亡的音效。
   *
   * 綁在 `state.phase` 的變化上而不是掛在按鈕:結果卡是玩家看到的**結果**,
   * 而按鈕是他之後才按的下一步——聲音要跟結果同時發生,不然會變成「畫面先變,
   * 過三秒我按了按鈕才聽到通關的聲音」。生存模式更明顯:它根本不畫結果卡也不等按鈕。
   */
  useEffect(() => {
    if (state.phase === 'cleared') playSfx('clear');
    else if (state.phase === 'dead') playSfx('dead');
  }, [state.phase]);
  useEffect(() => {
    if (!continuous || state.phase !== 'cleared') return;
    const id = setTimeout(() => finishRef.current('cleared', state.coins, totalWaves, readStats()), HANDOFF_MS);
    return () => clearTimeout(id);
  }, [continuous, state.phase, state.coins]);

  // 跑道的實際尺寸由 onLayout 回報(寬跟高都是)。高度沒量到之前不畫任何物件,
  // 免得用 0 去算位置、東西全部擠在最上面閃一下。
  const [trackSize, setTrackSize] = useState({ width: 0, height: 0 });
  const trackWidth = trackSize.width;
  const trackHeight = trackSize.height;
  const headY = trackHeight - HERO_BOTTOM - HERO_HEIGHT;
  const ready = trackWidth > 0 && trackHeight > 0;
  const trackWidthRef = useRef(0);
  const offsetRef = useRef(heroOffset);
  offsetRef.current = heroOffset;
  const runningRef = useRef(true);
  runningRef.current = state.phase === 'running';

  // 拖曳用相對位移(按下的那一刻記住角色在哪,之後手指移多少角色就移多少),不是「手指落點 = 角色位置」。
  // 相對位移的好處是可以從畫面任何地方開始拖,不必精準按在角色身上——手機上角色只有 45 px 寬,
  // 要求按準等於逼玩家低頭找角色,而這遊戲的節奏不允許把視線從前方的閘門移開。
  const grabRef = useRef({ offset: 0.5 });
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        /**
         * 無條件收下,**包含右鍵**——這不是漏掉,是查過之後刻意的。
         *
         * react-native-web 在 responder 系統那一層就先擋掉非主鍵了
         * (`useResponderEvents/utils.js` 的 `isPrimaryPointerDown`:mousedown 只有
         * `button === 0` 而且沒按修飾鍵才算數,所以 macOS 的 ctrl+click 也一起擋掉),
         * 右鍵根本走不到這裡。
         *
         * **不要在這裡加 `e.nativeEvent.button !== 0` 的保險。** RNW 組給 responder 的
         * nativeEvent 是自己拼的一個物件,裡面**沒有 button 這個欄位**
         * (`createResponderEvent.js`),讀出來永遠是 undefined,條件永遠成立——
         * 程式看起來更嚴謹,實際上一行都沒生效。這正是 CLAUDE.md 記過的那類坑
         * (`box.bottom`、RNW 的 filter)。
         *
         * 右鍵真正會造成的傷害是「系統選單蓋住前方那一排閘門」,那個在
         * hooks/useNoContextMenu.ts 擋掉,不在這裡。
         */
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          grabRef.current = { offset: offsetRef.current };
        },
        onPanResponderMove: (_e, gesture) => {
          if (!runningRef.current) return;
          const width = trackWidthRef.current;
          if (width <= 0) return;
          dragTo(grabRef.current.offset + gesture.dx / width);
        },
      }),
    [dragTo],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') steer('left');
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') steer('right');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steer]);

  /**
   * 噴刺那一格**只在真的擲出武器的時候**播,而且**一次只有丟的那一隻在噴**。
   *
   * 兩個都踩過:
   *   - 照固定週期輪播 → 動作跟飛出去的東西各播各的,看起來像兩件不相干的事。
   *   - 用同一個布林值套用到全隊 → 一次投擲全隊一起噴,像整團在抽搐,而且畫面上
   *     明明只飛出一件武器,卻有 14 隻同時做出擲出的動作,完全對不上。
   *
   * 現在每一隻各自記自己的噴刺截止時間:投擲的流水號決定這次輪到哪一隻(id % 隻數),
   * 只有牠的計時器被推長。發射間隔(最快 90ms)比噴刺時間(130ms)短,所以連射時
   * 會看到好幾隻錯開著此起彼落,而不是整齊劃一。
   *
   * 用 ref 不用 state:這是純演出的計時,每 33ms 的重畫本來就會發生(飛行中的武器在動),
   * 再多開一個 state 只是多觸發一輪重畫。
   */
  const spikeUntilRef = useRef<number[]>([]);
  const lastSeenShotRef = useRef(0);

  // 血條整條拿掉了:人數就是血量,螢幕上那一群人本身就是生命條(見 laneRun 的 RunState.heroes)。
  // 留一條抽象的橫槓等於把「看得見的東西」再翻譯回「看不懂的數字」,那正是這次改版要修掉的。
  const progress = Math.min(1, distance / runLength(stage));

  /**
   * 進化只換貼圖尺寸,**不動 HERO_HEIGHT**。
   *
   * HERO_HEIGHT 被 headY 吃著(headY = 跑道高 - HERO_BOTTOM - HERO_HEIGHT),而 headY 是
   * bottomYFor 的基準,決定閘門、怪物、投射物、傷害數字、判定線每一個東西畫在哪。跑到一半
   * 改它的話,整條跑道的透視會當場位移,畫面上所有物件一起跳——連「哪一刻算數」的判定線
   * 都會移位。所以布局常數固定用基本型,國王只是貼圖畫大一點,一樣靠 HERO_BOTTOM 對齊底部。
   */
  // 畫面上要畫哪些(國王 + 湊不滿一隻國王的餘數)。橫向定位用「最前面那一隻」的寬度。
  const units = squadForms(state.heroes, SQUAD_DX.length);
  const sizeOf = (f: ReturnType<typeof heroForm>) => {
    const h = heroBoxHeight(HERO_BODY_HEIGHT * f.scale, f.bodyRatio);
    return { h, w: Math.round(h * f.aspect) };
  };
  const leadSize = sizeOf(units[0]);
  // 這次的投擲輪到哪一隻。只在流水號變動的那一輪記一次,之後的重畫不會重複延長。
  if (lastShotId !== lastSeenShotRef.current) {
    lastSeenShotRef.current = lastShotId;
    if (lastShotId > 0 && units.length > 0) {
      const shooter = lastShotId % units.length;
      const until = spikeUntilRef.current.slice();
      until.length = units.length;
      until[shooter] = lastShotAt + HERO_SPIKE_MS;
      spikeUntilRef.current = until;
    }
  }
  const nowMs = Date.now();
  const isSpiking = (unitIndex: number) => (spikeUntilRef.current[unitIndex] ?? 0) > nowMs;
  const heroLeft = Math.min(
    Math.max(heroOffset * trackWidth - leadSize.w / 2, 2),
    Math.max(2, trackWidth - leadSize.w - 2),
  );
  // 跑起來的上下微晃。用已跑距離當相位,所以跑得越快晃得越快,不必另外開一個計時器。
  const bob = state.phase === 'running' ? Math.round(Math.sin(distance / 7) * 2) : 0;
  // 由後往前畫(slice 之後 reverse),主角才會蓋在隊友上面而不是被壓在後面。
  // 由後往前畫,最前面那一隻才會蓋在後排上面。
  // dx 是 offset 單位,乘上跑道寬度才是像素——所以隊伍在任何螢幕上佔住的
  // **相對**寬度都一樣,判定也就跟螢幕寬無關(見 laneRun 的 SQUAD_DX)。
  const drawn = units
    .map((form, i) => ({
      form,
      slot: { dx: SQUAD_DX[i] * trackWidth, dy: SQUAD_DEPTH[i].dy, scale: SQUAD_DEPTH[i].scale },
      spiking: isSpiking(i),
    }))
    .reverse();
  const backdrop = STAGE_BACKDROPS[backdropOverride ?? backdropForStage(stage)];
  /**
   * 底圖一格畫多高,以及這一刻捲到哪裡。
   *
   * 捲動速率**一定要跟世界座標同一組換算**(bottomYFor 的那一組),不能自己挑一個好看的倍率:
   * 地面比物件慢的話,怪看起來像在冰上滑;快的話像地面在追著怪跑。兩者都會讓
   * 「我在往前跑」這件事變得說不出哪裡怪。
   */
  const groundScroll = (distance * (headY + SPAWN_MARGIN)) / VISIBLE_AHEAD;
  const backdropHeight = trackWidth > 0 ? trackWidth / backdrop.aspect : 0;
  const backdropShift = backdropHeight > 0 ? groundScroll % backdropHeight : 0;
  /**
   * 要疊幾份才蓋得住整條跑道,以及第一份的頂邊在哪。
   *
   * 兩件事都踩過:
   *   - **份數不能寫死 2。** 圖比跑道矮的時候(378px 的正方形圖配 500px 的跑道)兩份不夠。
   *   - **要往下鋪,不是往上鋪。** 第一版是 `backdropShift - backdropHeight * k`,
   *     k 越大越往上——所以不管疊幾份,最下面永遠停在 `backdropShift + backdropHeight`,
   *     跑道底部固定露出一條純底色的黑帶,而**勇者剛好就站在那一段**。
   *     現在是把第一份推到畫面上緣之外(頂邊 <= 0),然後一路往下鋪。
   */
  const backdropTop = backdropShift - backdropHeight;
  const backdropTiles = backdropHeight > 0 ? Math.ceil(trackHeight / backdropHeight) + 1 : 0;
  const incoming = wave ? upcoming.find((r) => r.index === wave.rowIndex)?.nodes[0].enemy : undefined;

  /**
   * 閘門排。每一格不佔滿整條跑道(見 laneRun 的 gateWidthForStage),左右都留空隙——
   * 沒把勇者拉到框上面就整格漏掉,所以框畫多寬就必須等於判定多寬,不能為了好看畫大一點。
   */
  function renderGateRow(row: RunRow) {
    if (row.nodes[0]?.kind === 'enemy') return null; // 敵人排改由 renderWave 演出
    const ahead = row.distance - distance;
    if (ahead > VISIBLE_AHEAD || ahead < -GATE_CULL_PAST) return null;
    if (!ready) return null;
    const top = bottomYFor(ahead, headY) - GATE_HEIGHT;
    return row.nodes.map((node) => {
      const trap = node.gate ? isTrapGate(node.gate) : false;
      const span = gateSpan(node.lane, stage);
      return (
        <View
          key={`${row.index}-${node.lane}`}
          pointerEvents="none"
          // 給自動化測試用:機器人要看得出「這一格在哪條跑道、是不是陷阱」才能真的玩。
          // 靠文字選取器會選到畫面上其他同字的東西(CLAUDE.md 記過的坑),所以走 aria-label。
          accessibilityLabel={`閘門 ${node.lane} ${trap ? '陷阱' : '好格'}`}
          style={[
            styles.gate,
            trap ? styles.gateTrap : styles.gateGood,
            { left: span.from * trackWidth, width: (span.to - span.from) * trackWidth, top, height: GATE_HEIGHT },
          ]}
        >
          {/*
            卷軸外框(見 artAssets 的 GATE_SCROLL)。三張圖:上軸、紙身、下軸,
            **只有紙身被拉長**——軸桿高度固定,金屬高光才不會糊掉。

            順序很重要:紙身先畫(墊在最底下),兩根軸桿後畫壓在它上面,接縫才不會露出來。
          */}
          <Image source={GATE_SCROLL.body} resizeMode="stretch" style={styles.gateScrollBody} />
          <Image source={GATE_SCROLL.top} resizeMode="stretch" style={styles.gateScrollTop} />
          <Image source={GATE_SCROLL.bottom} resizeMode="stretch" style={styles.gateScrollBottom} />
          {/*
            好壞的顏色**疊在卷軸上面**,不是換一張圖。

            這一層是必要的:卷軸讓兩格長得一模一樣,而閘門的第一要務是**一眼分辨好壞**
            (原本靠的就是綠框/紅框)。純美術換上去等於把那個訊號拿掉,而這款一排只有
            一兩秒可以決定,玩家沒有時間讀字。

            做法是半透明色層而不是 tintColor:tintColor 會把整張圖塗成單色,羊皮紙的紋理
            全部消失;而 CSS filter 在 react-native-web 上會被直接丟掉(CLAUDE.md 記過,
            症狀是「程式看起來完全正確,畫面卻一點變化都沒有」)。
          */}
          <View style={[styles.gateWash, trap ? styles.gateWashTrap : styles.gateWashGood]} />
          <Text style={styles.gateText} numberOfLines={2}>
            {node.gate ? gateLabel(node.gate) : ''}
          </Text>
        </View>
      );
    });
  }

  /**
   * 一波小怪:一隻一隻從遠處衝過來,被打掉的就不再畫,漏過來的會走到勇者頭上。
   * 每隻的種類與橫向位置都由 laneRun 決定(混幾種怪、各自偏離跑道中心多少),
   * 這裡只負責畫——同一波不同長相、不站成一直線,看起來才像一群怪而不是閱兵。
   */
  function renderWave(w: WaveView) {
    if (!ready) return null;
    const size = w.boss ? BOSS_SIZE : w.elite ? ELITE_SIZE : MONSTER_SIZE;
    // 這一波的屬性色。一波共用一個屬性,所以整群同色——顏色就是屬性在畫面上的載體,
    // 不必再靠面板文字去對照(見 artAssets 的 ELEMENT_COLORS)。
    const tint = elementColor(w.element);
    const enemyLook = enemyHeroLookForRow(stage, w.rowIndex);
    const now = Date.now();
    // 只畫最近的那幾隻(見 MAX_DRAWN_MONSTERS)。先篩再畫,不是畫了再丟——
    // 篩掉的那些連 View 都不要建,不然省不到東西。
    const drawable: WaveMonster[] = [];
    for (const m of w.monsters) {
      if (w.down[m.index]) continue;
      const ahead = m.distance - distance;
      if (ahead > VISIBLE_AHEAD || ahead < 0) continue;
      drawable.push(m);
      if (drawable.length >= MAX_DRAWN_MONSTERS) break;
    }
    return [...renderEnemyShots(w), ...drawable.map((m) => {
      const ahead = m.distance - distance;
      const species = w.species[m.speciesIndex] ?? w.species[0];
      // 魔王固定站在跑道正中央:牠佔滿兩條跑道,躲不掉,也不該讓玩家以為躲得掉。
      const centerX = (w.boss ? 0.5 : m.offset) * trackWidth;
      const groundY = bottomYFor(ahead, headY);
      const left = centerX - size / 2;
      const top = groundY - size;
      const hpLeft = Math.max(0, 1 - w.hitsOn[m.index] / w.hitsPerUnit);
      // 勇者波的敵人**照關卡輪替職業立繪**,不是照玩家的職業:玩家自己就是學生那隻,
      // 拿同一張圖當敵人的話,整波看起來像自己在打自己(第 1 關還沒轉職時就是這樣)。
      // 兩格動畫:待機 / 動作交替。**每一隻各自錯開相位**(用牠的 index),
      // 不然十幾隻同時換格,整群看起來像同一個貼圖在閃而不是一群各走各的怪。
      const anim = w.heroWave
        ? jobHeroAnim(enemyLook.archetype, enemyLook.branch, enemyLook.tier)
        : monsterAnim(species.id);
      // 勇者波:剛出手的那一隻換成投擲那一格(第 2 格,只有職業立繪有)。
      // 三格共用同一張畫布,所以換 source 不會讓位置或大小跳一下。
      const throwing = w.heroWave
        && anim !== null
        && anim.frames.length > 2
        && now - (enemyThrowAt[m.index] ?? 0) < THROW_POSE_MS;
      // 冰・凍結:**連動畫的幀一起停住**,不是只有位置停住。
      // 位置停了但手腳還在動的話,看起來是「原地跑步」而不是「凍住」——
      // 而原地跑步在這個畫面上跟「這一隻的移動壞掉了」長得一模一樣。
      // 停在哪一格用「凍住的那一刻」反推(frozenUntil - FREEZE_MS),所以不會突然跳格。
      const frozen = w.frozenUntil[m.index] > now;
      const burning = w.burningUntil[m.index] > now;
      const frameClock = frozen ? w.frozenUntil[m.index] - FREEZE_MS : now;
      // 一隻怪同時只疊一層顏色(見下面的說明)。優先序 = 誰最需要被看見。
      const statusTint = frozen
        ? { color: FROST_COLOR, opacity: 0.55 }
        : burning
          // 火焰用 sin 呼吸,不然一層固定的橘色看起來像換了顏色而不是在燒。
          ? { color: BURN_COLOR, opacity: 0.32 + 0.2 * (0.5 + 0.5 * Math.sin(now / 90 + m.index)) }
          : w.slow > 0
            ? { color: EARTH_COLOR, opacity: 0.28 + w.slow * 0.64 }
            : tint
              ? { color: tint, opacity: ELEMENT_TINT_OPACITY }
              : null;
      const art = anim
        ? anim.frames[throwing ? 2 : animFrameIndex(frameClock, m.index * 0.37)]
        : w.heroWave
          ? jobHeroArt(enemyLook.archetype, enemyLook.branch, enemyLook.tier)
          : monsterArt(species.id);
      // 動畫版的畫布比單張大(要容得下動作那一格伸出去的部分),所以框照 animFrames 的比例算,
      // 而且是**底邊踩在地面線、重心對齊中心**——照舊的正方形 contain 會把角色縮小一圈。
      const boxW = anim ? size * anim.wRatio : size;
      const boxH = anim ? size * anim.hRatio : size;
      const boxLeft = anim ? centerX - boxW * anim.anchor : left;
      const boxTop = anim ? groundY - boxH : top;
      return (
        <View
          key={m.index}
          style={[styles.floating, { left: boxLeft, top: boxTop, width: boxW }]}
          pointerEvents="none"
          // 自動化測試要量小怪的橫向分佈,就得抓得到牠們本人。靠「img 寬度剛好是 42」去猜
          // 會抓到石頭(同尺寸),量出來的分佈是石頭的落點範圍而不是怪的——實測過一次。
          // 而且動畫版的框寬是 size x wRatio,本來就不等於 MONSTER_SIZE。
          accessibilityLabel={`敵人 ${m.index} ${m.offset.toFixed(3)}`}
        >
          <Image source={art} resizeMode="contain" style={[styles.pixelArt, { width: boxW, height: boxH }]} />
          {/*
            狀態染色:同一張圖再疊**一層** tintColor 的複本。tintColor 會把整張圖壓成單色剪影,
            單獨用會看不出造型,所以壓低透明度疊在原圖上——造型還在,色相整個偏過去。
            (逐張染色是 build-time 產圖的管線,還沒做;CSS filter 在 RNW 上會被丟掉,見 CLAUDE.md。)

            **同時只畫一層,照優先序挑**,不是四種狀態各疊一張:
            隻數解除上限之後畫面上同時可以有 89 隻,一隻四層就是 356 張圖——
            實測掉到 6 fps。而且疊起來的顏色是混濁的,玩家反而分不出「牠現在是什麼狀態」。
            優先序 = 誰最需要被看見:凍結(牠停住了)> 燃燒(正在掉血)> 遲滯(整波變慢)> 屬性。
          */}
          {statusTint && (
            <Image
              source={art}
              resizeMode="contain"
              style={[
                styles.pixelArt, styles.floating,
                { width: boxW, height: boxH, tintColor: statusTint.color, opacity: statusTint.opacity },
              ]}
            />
          )}
          {frozen && <View style={[styles.frostRing, { width: boxW, height: boxH }]} pointerEvents="none" />}
          {(w.boss || w.elite) && (
            <View style={styles.bossHpTrack}>
              <View style={[styles.bossHpFill, { width: `${hpLeft * 100}%` }]} />
            </View>
          )}
        </View>
      );
    }), ...renderElementFx(w)];
  }

  /**
   * 命中那一刻的元素演出:燃燒擴散、連鎖閃電、凍結的那一下閃光。
   *
   * **沒有任何素材檔**,全部是幾何圖形疊出來的(圖示鐵則禁止 emoji,而粒子特效的
   * PNG 這個專案還沒有)。三種各有一個一眼認得出的形狀:
   *   燃燒 目標身上一團橘色的光,由大縮小(火在燒完)
   *   連鎖 兩隻怪之間一條黃白色的線(看得出「從誰跳到誰」)
   *   凍結 目標身上炸開一圈冰色的框
   */
  function renderElementFx(w: WaveView) {
    if (!ready) return [];
    const now = Date.now();
    const posOf = (index: number) => {
      const m = w.monsters[index];
      if (!m) return null;
      const ahead = m.distance - distance;
      if (ahead > VISIBLE_AHEAD || ahead < -20) return null;
      const size = w.boss ? BOSS_SIZE : w.elite ? ELITE_SIZE : MONSTER_SIZE;
      return { x: (w.boss ? 0.5 : m.offset) * trackWidth, y: bottomYFor(ahead, headY) - size * 0.5 };
    };
    return elementEvents.map((e: ElementEvent) => {
      const age = (now - e.bornAt) / ELEMENT_FX_MS[e.kind];
      if (age >= 1) return null;
      const to = posOf(e.target);
      if (!to) return null;
      if (e.kind === 'chain') {
        const from = e.from !== undefined ? posOf(e.from) : null;
        if (!from) return null;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.max(2, Math.hypot(dx, dy));
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <View
            key={`fx-${e.id}`}
            pointerEvents="none"
            style={[
              styles.chainBolt,
              {
                left: (from.x + to.x) / 2 - len / 2,
                top: (from.y + to.y) / 2 - 1,
                width: len,
                opacity: 1 - age,
                transform: [{ rotate: `${angle}deg` }],
              },
            ]}
          />
        );
      }
      // 金・擴散:命中當下往旁邊甩出去的碎刃。
      //
      // **畫真的在飛的一把刀,不要畫連起來的線。** 第一版是一條 2px 的細線從命中的那隻
      // 拉到旁邊那隻——那讀起來是**光束**,不是「甩出去的碎刃」:線的兩端同時存在、
      // 而且一出現就是完整長度,眼睛看到的是「兩隻被連起來了」。
      // 現在是一把武器圖沿著那條路徑飛過去(跟玩家投擲的武器同一套 weaponArt 與 -45 度慣例),
      // 到站那一刻才閃一下——先有東西飛過去,才有命中,順序跟因果一致。
      if (e.kind === 'spread') {
        const from = e.from !== undefined ? posOf(e.from) : null;
        if (!from) return null;
        // 前 70% 在飛,後 30% 是命中的閃光。
        const fly = Math.min(1, age / 0.7);
        const x = from.x + (to.x - from.x) * fly;
        const y = from.y + (to.y - from.y) * fly;
        const art = weaponArt(job?.archetype ?? null, state.gear, e.id);
        const box = {
          left: x - SPREAD_SIZE / 2,
          top: y - SPREAD_SIZE / 2,
          width: SPREAD_SIZE,
          height: SPREAD_SIZE,
          // 武器圖是朝右上的(-45 度是既有慣例),再加上飛行方向才會刀尖朝前。
          transform: [{ rotate: `${(Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI - 45}deg` }],
        };
        return (
          <View key={`fx-${e.id}`} pointerEvents="none">
            <Image source={art} resizeMode="contain" style={[styles.pixelArt, styles.floating, box]} />
            {/* 染成金屬色:一眼看得出這一把是擴散出去的,不是玩家丟的那幾把 */}
            <Image
              source={art}
              resizeMode="contain"
              style={[styles.pixelArt, styles.floating, box, { tintColor: '#c9c4b0', opacity: 0.75 }]}
            />
            {age > 0.7 && (
              <View
                style={[
                  styles.spreadBurst,
                  {
                    left: to.x - SPREAD_BURST / 2,
                    top: to.y - SPREAD_BURST / 2,
                    width: SPREAD_BURST,
                    height: SPREAD_BURST,
                    opacity: (1 - age) / 0.3,
                    transform: [{ rotate: '45deg' }],
                  },
                ]}
              />
            )}
          </View>
        );
      }
      // 技能收掉的那一隻:炸開一圈元素色的環,環一擴散那隻怪就不見了。
      //
      // **這一圈是「為什麼牠不見了」的說明。** 技能的擊殺先前只有一行字,怪要等勇者
      // 把刀丟滿才消失;現在是當場消失,所以更需要一個落在**那一隻身上**的訊號——
      // 跑道上方那一團 SkillFx 講的是「技能放了」,講不出「這幾隻是它收的」。
      if (e.kind === 'blast') {
        const r = BLAST_BURST + age * 34;
        const color = elementColor(e.element) ?? '#e0a95c';
        // 那一隻的剪影再放一次:縮小、淡出、整個染成元素色。
        //
        // **光有一圈環還不夠**:環是畫在「牠原本站的地方」,而牠在同一格就從畫面上不見了——
        // 讀起來是「怪憑空消失,旁邊剛好有個圈」。補一張正在縮小的剪影,順序才看得懂:
        // 先有這一隻、再有它被收掉。剪影只活 300ms(ELEMENT_FX_MS.blast),而且是純畫面:
        // 牠在 hook 裡早就倒了,這裡畫的是已經發生的事(跟其他元素演出同一條規矩)。
        const m = w.monsters[e.target];
        const size = w.boss ? BOSS_SIZE : w.elite ? ELITE_SIZE : MONSTER_SIZE;
        const species = m ? (w.species[m.speciesIndex] ?? w.species[0]) : null;
        const ghostArt = species
          ? (monsterAnim(species.id)?.frames[0] ?? monsterArt(species.id))
          : null;
        const ghost = size * (1 - age * 0.45);
        return (
          <View key={`fx-${e.id}`} pointerEvents="none">
            {ghostArt !== null && !w.heroWave && (
              <Image
                source={ghostArt}
                resizeMode="contain"
                tintColor={color}
                style={[
                  styles.pixelArt,
                  styles.floating,
                  { left: to.x - ghost / 2, top: to.y - ghost / 2, width: ghost, height: ghost, opacity: 0.8 * (1 - age) },
                ]}
              />
            )}
            <View
              style={[
                styles.blastRing,
                {
                  left: to.x - r / 2,
                  top: to.y - r / 2,
                  width: r,
                  height: r,
                  borderRadius: r / 2,
                  borderColor: color,
                  opacity: 1 - age,
                },
              ]}
            />
          </View>
        );
      }
      if (e.kind === 'burn') {
        const r = BURN_SIZE * (1 - age * 0.5);
        return (
          <View
            key={`fx-${e.id}`}
            pointerEvents="none"
            style={[
              styles.burnGlow,
              // 0.6 封頂:火在燒的是那一隻怪,蓋滿它就變成「怪不見了」。
              { left: to.x - r / 2, top: to.y - r / 2, width: r, height: r, borderRadius: r / 2, opacity: 0.6 * (1 - age) },
            ]}
          />
        );
      }
      // 凍結:炸開的那一圈只在前段畫(之後由怪身上的冰色接手,見 w.frozen)。
      if (age > 0.35) return null;
      const r = FROST_BURST + age * 40;
      return (
        <View
          key={`fx-${e.id}`}
          pointerEvents="none"
          style={[
            styles.frostBurst,
            { left: to.x - r / 2, top: to.y - r / 2, width: r, height: r, borderRadius: r / 2, opacity: 1 - age / 0.35 },
          ]}
        />
      );
    });
  }

  /**
   * 勇者波:畫出敵方勇者擲過來的武器。
   *
   * **位置由 hook 給,不是畫面自己算的。** 先前這一段是用 Date.now() 推出來的動畫,
   * 於是它永遠打不到人——傷害只在這一排結算的那一瞬間算,玩家看著武器穿過身體卻
   * 什麼都沒發生。現在每一把都是 hook 裡真的在飛的物件(見 useLaneRun 的 EnemyShot),
   * 飛到你身上就扣人,畫面只負責把它畫出來。
   *
   * 只有直線:武器不追人,所以閃避仍然是「位置管理」而不是「反應」——
   * 跟閘門同一套連續位置判定,只是反過來用(閘門要踩上去,這個要離開)。
   */
  function renderEnemyShots(w: WaveView) {
    if (!ready || !w.heroWave) return [];
    const tint = elementColor(w.element);
    // 丟出來的武器也照敵人的職業走,不是照玩家的——敵人拿的是他自己的武器。
    const look = enemyHeroLookForRow(stage, w.rowIndex);
    return enemyShots.map((shot) => {
      const ahead = shot.distance - distance;
      if (ahead > VISIBLE_AHEAD) return null;
      const art = weaponArt(look.archetype, look.tier, shot.variant);
      const box = {
        left: shot.offset * trackWidth - ENEMY_SHOT_SIZE / 2,
        top: bottomYFor(Math.max(0, ahead), headY) - ENEMY_SHOT_SIZE,
        width: ENEMY_SHOT_SIZE,
        height: ENEMY_SHOT_SIZE,
        transform: [{ rotate: '135deg' }],
      };
      return (
        <View key={`shot-${shot.id}`} pointerEvents="none">
          <Image source={art} resizeMode="contain" style={[styles.pixelArt, styles.floating, box]} />
          {/* 染成這一波的屬性色:一來跟怪物同色,二來這條線在地面上更跳得出來
              ——危險帶拿掉之後,顏色是「不能站這裡」剩下的唯一提示。 */}
          {tint && (
            <Image
              source={art}
              resizeMode="contain"
              style={[styles.pixelArt, styles.floating, box, { tintColor: tint, opacity: 0.75 }]}
            />
          )}
        </View>
      );
    });
  }

  /**
   * 命中時跳出來的傷害數字。往上飄一小段並淡出,暴擊是金色而且大一號。
   * 位置跟著被打的那隻走(絕對距離),不是釘在螢幕上——釘在螢幕上的話跑道一捲數字就飄掉了。
   */
  function renderHitNumber(h: HitNumber) {
    if (!ready) return null;
    const age = Math.min(1, (Date.now() - h.bornAt) / HIT_NUMBER_MS);
    const ahead = h.distance - distance;
    if (ahead > VISIBLE_AHEAD) return null;
    const top = bottomYFor(ahead, headY) - MONSTER_SIZE - age * 26;
    return (
      <Text
        key={h.id}
        pointerEvents="none"
        style={[
          styles.hitNumber,
          h.crit && styles.hitNumberCrit,
          { left: h.offset * trackWidth - 40, top, opacity: 1 - age * age },
        ]}
      >
        {h.crit ? `${compact(h.value)}!` : compact(h.value)}
      </Text>
    );
  }

  /**
   * 路上的石頭。跟小怪同一個座標系(絕對距離 + offset),所以畫法也一樣。
   *
   * 石頭不分跑道、不畫框:它不是一個「選項」,是一個要閃開的東西(見 laneRun 的石頭段落)。
   * 畫成閘門那種橫跨一格的框會讓玩家以為要「選」它。
   */
  function renderRock(rock: RunRock) {
    if (!ready) return null;
    const ahead = rock.distance - distance;
    if (ahead > VISIBLE_AHEAD || ahead < 0) return null;
    return (
      <View
        key={rock.index}
        // pointerEvents 要放在 View 上:Image 沒有這個 prop,直接掛上去 tsc 會擋。
        // 不擋掉的話石頭會吃掉拖曳手勢——正好在玩家最需要閃開的那一刻。
        pointerEvents="none"
        // 自動化測試要抓石頭:文字選取器抓不到純圖,而橫向位置是這一項唯一能驗的東西。
        accessibilityLabel={`石頭 ${rock.offset.toFixed(2)}`}
        style={[
          styles.floating,
          {
            left: rock.offset * trackWidth - ROCK_SIZE / 2,
            top: bottomYFor(ahead, headY) - ROCK_SIZE,
            width: ROCK_SIZE,
          },
        ]}
      >
        <Image
          source={ROCK_ART}
          resizeMode="contain"
          style={[styles.pixelArt, { width: ROCK_SIZE, height: ROCK_SIZE }]}
        />
      </View>
    );
  }

  /** 擲出去的武器。從擲出的位置往目標那一格斜著飛過去,所以 x 要跟著飛行進度內插。 */
  function renderProjectile(p: Projectile) {
    if (!ready || !wave) return null;
    const target = wave.monsters[p.targetIndex];
    if (!target) return null;
    const span = Math.max(1, target.distance - p.fromDistance);
    const t = Math.min(1, Math.max(0, (p.distance - p.fromDistance) / span));
    const offset = p.fromOffset + (p.toOffset - p.fromOffset) * t;
    const ahead = p.distance - distance;
    if (ahead > VISIBLE_AHEAD) return null;
    // 元素演出掛在武器上,不在地上畫區域:身上帶幾個元素,丟出去的武器就輪流染成那幾個顏色。
    const tint = elementColor(p.element);
    const box = {
      left: offset * trackWidth - PROJECTILE_SIZE / 2,
      top: bottomYFor(ahead, headY) - PROJECTILE_SIZE,
      width: PROJECTILE_SIZE,
      height: PROJECTILE_SIZE,
      transform: [{ rotate: '-45deg' }],
    };
    const art = weaponArt(job?.archetype ?? null, state.gear, p.id);
    if (!tint) {
      return <Image key={p.id} source={art} resizeMode="contain" style={[styles.pixelArt, styles.floating, box]} />;
    }
    return (
      <View key={p.id} pointerEvents="none">
        <Image source={art} resizeMode="contain" style={[styles.pixelArt, styles.floating, box]} />
        <Image
          source={art}
          resizeMode="contain"
          style={[styles.pixelArt, styles.floating, box, { tintColor: tint, opacity: 0.7 }]}
        />
      </View>
    );
  }

  /**
   * 技能列的一格。**圓形,冷卻長在圖示上**(見 components/SkillIcon.tsx)。
   *
   * 舊版是「方格 + 從下往上填滿的暗色遮罩 + 底下一行秒數」,三個元素在講同一件事。
   * 玩家掃技能列的時候要找的是「哪一顆好了」,而圓最快分辨的是**形狀完整度**:
   * 環畫滿了就是好了,不必讀秒也不必比較填滿高度。
   *
   * 舊註解寫「不畫冷卻環是因為要多一個相依」——那個相依(react-native-svg)後來
   * 為了別的東西已經進來了,所以那個理由早就不成立。
   */
  function renderSkillSlot(s: CarriedSkill, size: number) {
    // **同一族的三款一律同色**,所以查顏色要先把 id 換回它的一階(elementOf)。
    // 直接拿 s.id 查的話,'fire2' / 'fire3' 在色表裡沒有 key —— 一二三階會退回強調金,
    // 而那正是「湊滿同元素」最該一眼看出來的事(技能列上常常有兩三格同族)。
    const tint = elementColor(elementOf(s.id)) ?? '#e0a95c';
    return (
      <View key={s.id} accessibilityLabel={`技能 ${s.name} ${s.level}`} style={styles.skillSlot}>
        <SkillIcon id={s.id} color={tint} size={size} level={s.level} cooldown={s.cooldown} ready={s.ready} />
      </View>
    );
  }

  /**
   * 技能列**永遠只有一列**,所以圖示的大小是算出來的不是寫死的。
   *
   * 一場最多帶 10 款(MAX_RUN_SKILL_SLOTS),而寫死 34px 的話 390 寬的手機在第 10 款
   * 就換行了——換行的那一顆掉到提示文字底下,看起來像「多出來一個不知道哪來的技能」,
   * 而且底下那一列本來就貼著畫面下緣,小螢幕會被切掉。
   *
   * 算法:先照跑道寬扣掉間隔,再夾在可讀的上下限之間;真的擠不下就連間隔一起縮。
   * 上限維持 34(帶得少的時候跟以前一模一樣),下限 20 是等級小圓還讀得出來的極限。
   */
  function skillBarMetrics(count: number) {
    const MAX_GAP = 7;
    const MIN_GAP = 3;
    const width = trackWidth > 0 ? trackWidth : 0;
    if (count <= 0 || width <= 0) return { size: SKILL_ICON_SIZE, gap: MAX_GAP };
    for (const gap of [MAX_GAP, 5, MIN_GAP]) {
      const size = Math.floor((width - gap * (count - 1)) / count);
      if (size >= SKILL_ICON_SIZE) return { size: SKILL_ICON_SIZE, gap };
      if (size >= MIN_SKILL_ICON_SIZE) return { size, gap };
    }
    return { size: MIN_SKILL_ICON_SIZE, gap: MIN_GAP };
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.hud}>
        <Text style={styles.hudStat}>勇者 {compact(state.heroes)}</Text>
        <Text style={styles.hudStat}>裝備 {state.gear} 階</Text>
        <Text style={styles.hudStat}>戰力 {compact(attack)}</Text>
      </View>
      <View style={styles.hud}>
        <Text style={styles.hudSub}>{jobTitle(job)}</Text>
        <Text style={styles.hudSub}>兌換率 x{state.tradeRate.toFixed(2)}</Text>
        <Text style={styles.hudSub}>金幣 {compact(state.coins)}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      {/* 高度固定佔著,有沒有敵人來都不會讓下面的跑道跳動 */}
      <View style={styles.alertRow}>
        {incoming && (
          <Text style={styles.alertText} numberOfLines={1}>
            {incoming.boss
              ? `大魔王 ${incoming.name} · 戰力 ${compact(incoming.power)}`
              : incoming.elite
                // 精英要標出「漏掉一隻抵幾個人」——牠的威脅不在隻數,玩家看不到就不會提早準備。
                ? `精英 ${incoming.name} · 戰力 ${compact(incoming.power)} · 漏一隻 -${ELITE_MASS} 人`
                : incoming.heroWave
                  ? `${elementLabel(incoming.element)}屬 敵方勇者 x${incoming.units} · 武器直線飛來,別站在那條線上`
                  : `${elementLabel(incoming.element)}屬 ${incoming.name} x${incoming.units} · 戰力 ${compact(incoming.power)}`}
          </Text>
        )}
      </View>

      <View
        // 測試要抓跑道就用這個,不要靠「高度剛好是 500」之類的特徵去猜——那種選取器
        // 一改版面就失效,而且會靜靜地選到外層容器,量出一堆看起來合理但錯誤的數字。
        testID="lane-track"
        style={[styles.track, { backgroundColor: backdrop.base }]}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          trackWidthRef.current = width;
          setTrackSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
        }}
        {...panResponder.panHandlers}
      >
        {/*
          大關底圖。一張圖鋪不滿整條跑道(圖是有限高的,跑道要無限往下捲),所以疊好幾份,
          每一份往上錯開一個圖高。份數由跑道高度決定(backdropTiles),**不隨跑的距離長**——
          捲動只動 backdropShift 這一個數字,所以跑到第幾波都是同樣這幾個 View。

          `ready` 之前不畫:trackWidth 是 0 的時候 backdropHeight 也是 0,每一份會疊在同一點,
          玩家會看到一格閃爍。
        */}
        {ready && (
          <View style={styles.laneLines} pointerEvents="none">
            {Array.from({ length: backdropTiles }, (_, k) => (
              <Image
                key={k}
                source={backdrop.source}
                style={{
                  position: 'absolute',
                  left: 0,
                  width: trackWidth,
                  height: backdropHeight,
                  top: backdropTop + backdropHeight * k,
                }}
                resizeMode="stretch"
              />
            ))}
            <View style={[styles.laneLines, { backgroundColor: backdrop.scrim }]} />
          </View>
        )}

        {/*
          這裡曾經有三樣東西,**全部拿掉了**:

            - 當前跑道的反白(整格套一層 #ffffff10)
            - 兩格之間的分隔線與往下流動的虛線
            - 判定線(所有物件底邊碰到就結算的那條橫線)

          三個都是在替「規則」畫輔助線,而規則本身已經改成**看得懂的東西**了:
          判定改成「史萊姆的身體碰到閘門就算」(見 laneRun 的 hitsGate),
          所以玩家要看的是自己那一團人跟框有沒有疊到——那不需要任何輔助線,
          而畫著這三條反而在跟它搶注意力,還會讓人以為判定是「中心點越線」。

          唯一被它們兼著做的事是「地面在動」的線索,現在由底圖捲動負責。
        */}

        {upcoming.map(renderGateRow)}
        {/* 石頭畫在小怪下面:牠們是跑過來的,會從石頭旁邊經過,壓在石頭上面才對 */}
        {rocks.map(renderRock)}
        {wave && renderWave(wave)}
        {projectiles.map(renderProjectile)}
        {/*
          被武器砸中:整片跑道閃一下紅色。
          扣人本身只在 HUD 的數字上動一格,而玩家的視線在跑道上——不閃這一下的話,
          使用者的感受就是「被打到沒有任何負面效果」(實際上扣了人,只是看不見)。
        */}
        {Date.now() - lastHazardAt < HAZARD_FLASH_MS && (
          <View
            pointerEvents="none"
            style={[
              styles.hazardFlash,
              { opacity: 0.45 * (1 - (Date.now() - lastHazardAt) / HAZARD_FLASH_MS) },
            ]}
          />
        )}
        {/* 傷害數字畫在武器與怪物之上,不然會被怪物的圖蓋掉 */}
        {hitNumbers.map(renderHitNumber)}

        {/* 結算回饋:直接浮在判定線上、勇者正上方。放在跑道外面的話,玩家要在「框消失」與
            「畫面下方跳出一行字」之間自己連連看;放在事發地點就不用連。 */}
        {feedback && feedback.message !== '' && ready && Date.now() - feedback.at < FEEDBACK_MS && (
          <Text
            key={feedback.key}
            pointerEvents="none"
            style={[
              styles.feedbackFloat,
              {
                top: headY - 24,
                left: Math.min(Math.max(heroLeft + leadSize.w / 2 - 70, 2), Math.max(2, trackWidth - 142)),
              },
              // 漏接與「撞到但沒扣到人」的 delta 都是 0,不特別列出來的話會被當成好結果畫成綠色。
              feedback.message === MISS_MESSAGE || feedback.message === ROCK_GRAZE_MESSAGE
                ? styles.feedbackMiss
                : feedback.heroDelta < 0 || feedback.attackDelta < 0
                  ? styles.feedbackBad
                  : styles.feedbackGood,
            ]}
          >
            {feedback.message}
          </Text>
        )}

        {/* 主動技能「爆裂」的特效。素材用既有的武器圖放大(圖示鐵則:一律用 assets/sprites 的 PNG),
            畫在怪物之上、HUD 之下,而且**同一時間只會有一個**——冷卻以波計,不可能重疊。 */}
        {/*
          主動技能的特效。12 款各一種(components/SkillFx.tsx),疊在跑道上。

          舊版是「一行字 + 一張通用的武器圖」——四款主動共用同一張圖,所以放出去
          只看得出「有東西發動了」,看不出是哪一款,也對不上技能列上剛歸零的那一顆。

          文字留著但退到上方:特效告訴你「發生了什麼」,文字補上「清掉幾隻」,
          兩者位置錯開才不會在同一秒互相蓋住(那一刻畫面上還有「擊倒… +N 人」)。
        */}
        {ready && lastStrike && Date.now() - lastStrike.at < STRIKE_BANNER_MS && (
          <>
            {lastStrike.ids.map((fxId) => (
              <SkillFx
                key={fxId}
                id={fxId}
                t={Math.min(1, (Date.now() - lastStrike.at) / SKILL_FX_MS)}
                width={trackWidth}
                height={trackHeight}
                heroX={heroLeft + leadSize.w / 2}
                headY={headY}
              />
            ))}
            <View
              pointerEvents="none"
              style={[styles.floating, { left: 0, right: 0, top: Math.max(4, headY - 250), alignItems: 'center' }]}
            >
              <Text style={styles.strikeText}>
                {lastStrike.names.join(' + ')}{lastStrike.kills > 0 ? ` -${lastStrike.kills} 隻` : ''}
              </Text>
            </View>
          </>
        )}

        {/* 場內技能:打完一波就跳出來,跑圖同時暫停(見 useLaneRun 的 paused)。
            蓋在跑道上而不是換一個畫面:玩家還看得到自己剛打完的那一波與現在的戰力,
            「這一場我缺什麼」才判斷得出來——切到獨立畫面就只剩三個抽象的名詞。 */}
        {skillOffers.length > 0 && state.phase === 'running' && (
          <View style={styles.resultOverlay}>
            <PixelFrame style={styles.resultCard}>
              <Text style={styles.skillTitle}>清空一波!挑一個</Text>
              <Text style={styles.resultSummary}>
                勇者 {compact(state.heroes)} · 戰力 {compact(attack)}
                {pendingPicks > 1 ? ` · 還可以挑 ${pendingPicks} 個` : ''}
              </Text>
              {/* 接下來幾波的屬性。**公開它是相剋能成立的前提**——看不到就變成擲骰子,
                  看得到才有「押注這幾波 vs 拿通用的」這個取捨。 */}
              {upcomingElements.length > 0 && (
                <Text style={styles.resultSummary}>
                  接下來:{upcomingElements.map((e) => elementLabel(e)).join(' → ')}
                </Text>
              )}
              {skillOffers.map((offer) => (
                <Pressable
                  key={offer.id}
                  style={styles.skillOption}
                  // 文字選取器會選到別的地方的同名字(例如下面那行「已帶:鋒刃 2」),
                  // 所以自動化測試要點的東西一律靠 aria-label。
                  accessibilityLabel={`場內技能 ${runSkillSpec(offer.id).name}`}
                  onPress={() => { playSfx('skill'); chooseRunSkill(offer); }}
                >
                  {/* 選項的名字也照元素上色,跟技能列同一套顏色:
                      挑的時候看到的顏色,就是等一下在技能列上要找的那個顏色。 */}
                  <Text style={[styles.skillName, { color: elementColor(elementOf(offer.id)) ?? '#f2f2f2' }]}>
                    {runSkillSpec(offer.id).name} {offer.level > 1 ? `Lv.${offer.level}` : '新'}
                    {/* 這個元素在接下來幾波是強是弱,直接標出來——不標的話玩家得自己背相剋表。
                        被剋也要標:相剋是雙向的(剋中 x2.5、被剋 x2/3),只標好的一半
                        會讓「押錯」變成看不見的損失。 */}
                    {counterTag(offer.id, upcomingElements)}
                  </Text>
                  <Text style={styles.skillDesc}>{describeRunSkill(offer)}</Text>
                </Pressable>
              ))}
              {runSkills.length > 0 && (
                <Text style={styles.resultSummary}>
                  已帶:{runSkills.map((s) => `${runSkillSpec(s.id).name} ${s.level}`).join('、')}
                </Text>
              )}
            </PixelFrame>
          </View>
        )}

        {/* 生存模式通關:**不畫結果卡、不等玩家按鈕**,直接交棒給下一關(見 useEffect)。
            這裡只畫一行過場字,讓玩家知道自己過了一關而不是畫面卡住。 */}
        {continuous && state.phase === 'cleared' && (
          <View style={styles.resultOverlay} pointerEvents="none">
            <Text style={styles.handoffText}>{stageLabel(stage)} 通過</Text>
          </View>
        )}

        {/* 結果 toast:浮在跑道上,不佔版面高度。
            先前是畫面最下面獨立的一列,在矮螢幕會被切到畫面外,玩家按不到「下一關」就卡死。
            浮起來之後不管螢幕多矮都一定看得到,跑道也多拿回那一列的高度。 */}
        {!(continuous && state.phase === 'cleared') && state.phase !== 'running' && (
          <View style={styles.resultOverlay}>
            <PixelFrame style={styles.resultCard}>
              <Text style={state.phase === 'cleared' ? styles.resultWin : styles.resultLose}>
                {state.phase === 'cleared' ? '抵達終點' : '倒下了'}
              </Text>
              <Text style={styles.resultSummary}>
                {stageLabel(stage)} · 勇者 {compact(state.heroes)} · 戰力 {compact(attack)} · 金幣 {compact(state.coins)}
              </Text>
              {/* 通關還要先選技能/轉職才回主介面,所以寫「繼續」而不是「回主介面」——
                  按下去馬上跳到別的畫面,標示成回主介面會對不上。陣亡沒有後續,直接回。 */}
              <Pressable
                style={styles.againButton}
                accessibilityLabel={state.phase === 'cleared' ? '繼續' : '回主介面'}
                onPress={() => onFinish(
                  state.phase === 'cleared' ? 'cleared' : 'dead',
                  state.coins,
                  state.phase === 'cleared' ? totalWaves : waveNumber,
                  readStats(),
                )}
              >
                <Text style={styles.againLabel}>{state.phase === 'cleared' ? '繼續' : '回主介面'}</Text>
              </Pressable>
            </PixelFrame>
          </View>
        )}

        {/* 教學提示。畫在跑道**下半部**(勇者頭頂上方一段),不畫在上緣:
            上緣是閘門與怪進場的地方,提示擺在那裡會蓋掉玩家最需要提早看到的東西。 */}
        {tutorial !== null && tipVisible && (
          <View pointerEvents="none" style={styles.tutorialTip}>
            <Text style={styles.tutorialTipText}>{tutorial.tip}</Text>
          </View>
        )}

        {/* 勇者群:橫向位置完全跟著手指(heroOffset),不吸附到跑道中央。
            由後往前畫,主角才會蓋在隊友上面。 */}
        {drawn.map(({ form, slot, spiking }, i) => {
          // 每個人用不同的相位晃動,整團才像各自在跑;同相位的話會像同一張圖被複製。
          const phase = distance / 7 + i * 1.7;
          const wanderX = Math.round(Math.sin(phase * 0.9) * 3);
          const wanderY = Math.round(Math.sin(phase) * 2);
          return (
            <Image
              key={i}
              source={form.frames[spiking ? 1 : 0]}
              resizeMode="contain"
              // 自動化測試要量「拖曳有沒有真的生效」,就得先抓得到勇者本人。
              // 靠 `track img` 的第一張會抓到石頭或小怪(牠們畫在前面),量出來的 x 永遠不動,
              // 於是機器人看起來在拖、其實一步都沒動——CLAUDE.md 記過的那個坑。
              accessibilityLabel={i === drawn.length - 1 ? '勇者隊伍' : undefined}
              style={[
                styles.hero,
                styles.pixelArt,
                {
                  left: heroLeft + slot.dx + wanderX,
                  bottom: HERO_BOTTOM + bob - slot.dy + wanderY,
                  width: Math.round(sizeOf(form).w * slot.scale),
                  height: Math.round(sizeOf(form).h * slot.scale),
                  zIndex: i + 1,
                },
              ]}
            />
          );
        })}
        {state.heroes > units.length && (
          <Text style={[styles.squadCount, { left: heroLeft - 12, bottom: HERO_BOTTOM + HERO_HEIGHT - 6 }]}>
            x{compact(state.heroes)}
          </Text>
        )}
      </View>

      {/*
        技能列。廣告版位原本佔的位置現在給它——那一列本來就是「畫面上唯一不會動的一條」,
        而技能冷卻正需要一個固定的地方讓玩家掃一眼。

        **主動技能改成秒冷卻之後,這一列從「好看」變成必要的。** 綁波的時候畫面上寫得出來的
        只有「還要 2 波」,那是玩家換算不成時間的單位;綁秒才有倒數可看,而看得到倒數
        才談得上「等一下再放」。被動沒有冷卻,只顯示名字與等級(見 CarriedSkill.cooldown)。
      */}
      <View style={[styles.skillBar, { gap: skillBarMetrics(carriedSkills.length).gap }]}>
        {carriedSkills.length === 0
          // 教學關的前兩關**根本不給場內技能**(見 game/laneTutorial.ts),
          // 那兩關寫「打完一波就能挑技能」是騙人的——玩家會一路等到終點都等不到面板,
          // 然後合理地認為這個功能壞了。空欄位的文字必須跟這一關實際的規則一致。
          ? (
            <Text style={styles.skillBarEmpty}>
              {tutorial !== null && !tutorial.runSkills
                ? '這一關沒有場內技能 —— 專心看閘門'
                : '打完一波就能挑技能'}
            </Text>
          )
          : carriedSkills.map((s) => renderSkillSlot(s, skillBarMetrics(carriedSkills.length).size))}
      </View>

      {/* 「現在打到第幾波」是玩家判斷「還剩多久」的唯一依據——只寫總波數的話,
          一場三分鐘裡完全不知道自己在哪個位置。 */}
      <View style={styles.hintRow}>
        <Text style={styles.hint}>
        {stageLabel(stage)},第 {waveNumber} 波,共 {totalWaves} 波
        {/* 生存模式:連勝數要一直看得到——它是這個模式唯一的分數,藏起來就沒有壓力了。 */}
        {survivalWavesBefore !== null
          ? ` · 生存累計 ${survivalWavesBefore + waveNumber} 波(死了就結束)`
          : ' · 拖著史萊姆左右移動'}
        </Text>
        {/* 齒輪 = 暫停 + 設定。放在提示列而不是跑道的角落:跑道上的按鈕會吃掉那一角的拖曳,
            而拖曳可以從畫面任何地方開始正是這款操作的前提(見 panResponder 的註解)。 */}
        {audio && onChangeAudio && (
          <Pressable
            accessibilityLabel="暫停與設定"
            style={styles.gearButton}
            onPress={() => {
              playSfx('click');
              setSettingsOpen(true);
            }}
          >
            <Image source={GEAR_ICON} resizeMode="contain" style={styles.gearIcon} />
          </Pressable>
        )}
      </View>

      {/* 抽地圖:生存模式開頭。畫在設定面板下面(zIndex 55 vs 60),
          兩個同時開的時候設定在上——玩家能從抽地圖的畫面直接去調音量。 */}
      {mapDraw && (
        <MapDrawToast
          backdrop={backdropOverride ?? backdropForStage(stage)}
          onRedraw={mapDraw.onRedraw}
          onDone={mapDraw.onDone}
        />
      )}

      {settingsOpen && audio && onChangeAudio && (
        <Settings
          audio={audio}
          onChangeAudio={onChangeAudio}
          paused
          survival={continuous}
          onRestart={onRestart && (() => { setSettingsOpen(false); onRestart(); })}
          onQuit={onQuit && (() => { setSettingsOpen(false); onQuit(); })}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </View>
  );
}

/**
 * 大數字壓成中文計數單位。跑道加長到 20 排之後,全選最佳的戰力會到六位數
 * (第 10 關實測 115808),原樣印會把 HUD 那一列擠爆——390 寬的手機上
 *「勇者 154 · 裝備 5 階 · 戰力 115808」會換行,把下面整個跑道往下推。
 * 一萬以下照原樣印,玩家在前段看到的還是精確數字。
 */
function compact(n: number): string {
  if (n < 10000) return String(n);
  if (n < 1e8) {
    const wan = n / 1e4;
    return (wan < 100 ? wan.toFixed(1) : String(Math.round(wan))) + '萬';
  }
  const yi = n / 1e8;
  return (yi < 100 ? yi.toFixed(1) : String(Math.round(yi))) + '億';
}

const styles = StyleSheet.create({
  // 寬度盡量吃滿。上限 520 是給桌機用的——再寬跑道會變成一片空地,兩條跑道之間離太遠,
  // 手指要移動的距離也跟著變長。
  // flex:1 讓跑道吃掉所有剩下的高度——周邊要多一列少一列都不必再改任何數字。
  wrapper: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', gap: 6 },
  hud: { flexDirection: 'row', justifyContent: 'space-between' },
  hudStat: { color: '#f2f2f2', fontSize: 13, fontWeight: '700' },
  hudSub: { color: '#8a8a95', fontSize: 11 },
  squadCount: {
    position: 'absolute',
    color: '#e0a95c',
    fontSize: 15,
    fontWeight: '700',
    zIndex: 20,
  },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: '#2a2a35', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#e0a95c' },
  // 教學提示。絕對定位在跑道底部往上一段,寬度自己撐開但兩側留白,
  // 免得長句在 375 寬的手機上貼到邊緣。
  tutorialTip: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 128,
    zIndex: 30,
    backgroundColor: 'rgba(42,42,53,0.92)',
    borderWidth: 1,
    borderColor: '#e0a95c',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  tutorialTipText: { color: '#f2f2f2', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  alertRow: { height: 16, alignItems: 'center', justifyContent: 'center' },
  alertText: { color: '#e05050', fontSize: 12, fontWeight: '700' },
  track: {
    flex: 1,
    minHeight: TRACK_HEIGHT_MIN,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3a45',
    overflow: 'hidden',
  },
  /** 滿版的絕對定位圖層(底圖、飛行物、演出)。分隔線與判定線拿掉之後只剩這一個用途。 */
  laneLines: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  gate: {
    position: 'absolute',
    borderRadius: 8,
    // 卷軸是絕對定位的三張圖,不裁的話會蓋過圓角(四個角會冒出方的紙)。
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 2,
  },
  // 底色留著當**圖還沒載進來時的墊底**:卷軸是三張 PNG,第一次進跑道那幾格會有一瞬間
  // 只有框沒有內容,墊一層原本的深綠/深紅比露出後面的底圖乾淨。
  gateGood: { backgroundColor: '#243a2a', borderColor: '#5ec26a' },
  gateTrap: { backgroundColor: '#3a2323', borderColor: '#e05050' },
  // 卷軸三片。
  //
  // **寬高要寫死,不能用 left:0 + right:0 去撐。** react-native-web 的 Image 是靠
  // background-size 實作 resizeMode 的,而「左右都釘住」在它眼裡不構成一個確定的寬度——
  // 實測圖會用**原圖的 80px 自然寬**畫,右邊 45% 整片露出底色,而且完全沒有警告。
  // 這跟 CLAUDE.md 記過的「RN 的 Image 只給 left/right 不會被拉寬」(PixelFrame 那條)
  // 是同一個坑的第二次現身:那一次的解法是外面包一層 View,這裡因為高度本來就固定,
  // 直接把 width:'100%' 與 height 寫出來更短。
  gateScrollBody: {
    position: 'absolute',
    left: 0,
    top: SCROLL_ROD_H,
    width: '100%',
    height: GATE_HEIGHT - SCROLL_ROD_H * 2,
  },
  gateScrollTop: { position: 'absolute', left: 0, top: 0, width: '100%', height: SCROLL_ROD_H },
  gateScrollBottom: { position: 'absolute', left: 0, bottom: 0, width: '100%', height: SCROLL_ROD_H },
  // 好壞的色層。0.34 是量出來的:再淡一點在小螢幕上分不出綠紅,再濃一點羊皮紙的紋理就沒了。
  gateWash: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  gateWashGood: { backgroundColor: 'rgba(94,194,106,0.34)' },
  gateWashTrap: { backgroundColor: 'rgba(224,80,80,0.34)' },
  gateText: { color: '#f2f2f2', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  floating: { position: 'absolute' },
  // 傷害數字。固定寬度 + 置中,數字位數變多才不會整串往左偏(left 是用「怪的位置 - 40」算的)。
  // 深色描邊:數字會飄到怪物與淺色地面上,沒有描邊在草皮上會直接看不見。
  hitNumber: {
    position: 'absolute',
    width: 80,
    textAlign: 'center',
    color: '#f2f2f2',
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: '#16161c',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  hitNumberCrit: { color: '#e0a95c', fontSize: 19 },
  bossHpTrack: {
    height: 6,
    borderRadius: 3,
    marginTop: 2,
    backgroundColor: '#2a2a35',
    borderWidth: 1,
    borderColor: '#e05050',
    overflow: 'hidden',
  },
  bossHpFill: { height: '100%', backgroundColor: '#e05050' },
  pixelArt: Platform.OS === 'web' ? ({ imageRendering: 'pixelated' } as object) : {},
  hero: { position: 'absolute' },
  feedbackFloat: {
    position: 'absolute',
    width: 140,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    zIndex: 30,
  },
  feedbackGood: { color: '#5ec26a' },
  feedbackMiss: { color: '#8a8a95' },
  feedbackBad: { color: '#e05050' },
  resultOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // 壓在跑道上面,但不要整片黑:底下還在跑的畫面是「你剛剛打到哪裡」的資訊。
    backgroundColor: '#16161cb0',
    zIndex: 50,
  },
  // 外框改用既有的 9-slice 像素框(PixelFrame),所以這裡不再畫圓角與邊框——
  // 兩個一起畫的話會看到「框裡面又有一圈細線」。
  resultCard: { minWidth: 240, maxWidth: '86%' },
  cardInner: { alignItems: 'center', gap: 10 },
  resultSummary: { color: '#8a8a95', fontSize: 12 },
  hint: { color: '#8a8a95', fontSize: 11, textAlign: 'center' },
  resultWin: { color: '#5ec26a', fontSize: 18, fontWeight: '700' },
  resultLose: { color: '#e05050', fontSize: 18, fontWeight: '700' },
  againButton: {
    alignSelf: 'stretch',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: '#e0a95c',
    alignItems: 'center',
  },
  againLabel: { color: '#16161c', fontSize: 15, fontWeight: '700' },
  skillTitle: { color: '#e0a95c', fontSize: 17, fontWeight: '700' },
  skillOption: {
    alignSelf: 'stretch',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#3a3448',
    borderWidth: 1,
    borderColor: '#9691a5',
    gap: 2,
  },
  skillName: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },
  skillDesc: { color: '#8a8a95', fontSize: 12 },
  // 這裡曾經有一個 hazardBand(勇者波的紅色危險帶)。拿掉了,不要加回來:
  // 它畫在一個沒有任何人站著的位置,看起來像地形而不是攻擊。現在落點就是投擲者站的線,
  // 畫面直接畫他丟出來的武器往下飛(見 renderEnemyShots)。
  /** 被武器砸中的紅閃。整片蓋在跑道上,是「我被打到了」唯一一眼看得到的訊號。 */
  hazardFlash: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: '#e05050',
    zIndex: 9,
  },
  /** 生存模式的過場字。只有一行,不畫框——畫框就變回「結果卡」了。 */
  handoffText: {
    color: '#5ec26a', fontSize: 22, fontWeight: '700',
    textShadowColor: '#16161c', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  strikeText: {
    color: '#e0a95c', fontSize: 20, fontWeight: '700',
    textShadowColor: '#16161c', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  // ---- 元素演出(全部是幾何圖形,沒有素材檔;圖示鐵則禁止拿 emoji 頂替)----
  /** 燃燒:目標身上一團橘光,由大縮小。 */
  burnGlow: { position: 'absolute', backgroundColor: '#c8674a', zIndex: 12 },
  /** 連鎖:兩隻怪之間的一條線。長度與角度由兩點算出來(見 renderElementFx)。 */
  /** 金・擴散:命中那一下的方塊閃光(飛過去的那一把用 weaponArt,不是色塊)。 */
  spreadBurst: { position: 'absolute', backgroundColor: '#c9c4b0', zIndex: 12 },
  chainBolt: { position: 'absolute', height: 2, backgroundColor: '#f2e6a0', borderRadius: 1, zIndex: 12 },
  /** 凍結:炸開的那一圈。 */
  frostBurst: { position: 'absolute', borderWidth: 2, borderColor: FROST_COLOR, zIndex: 12 },
  // borderColor 由 blast 事件的元素決定,所以這裡只給厚度與層級。
  blastRing: { position: 'absolute', borderWidth: 3, zIndex: 13 },
  /** 凍住期間罩在怪身上的框,讓「這一隻停住了」不只是顏色的差別。 */
  frostRing: { position: 'absolute', borderWidth: 1, borderColor: FROST_COLOR, borderRadius: 4, opacity: 0.8 },
  // ---- 技能列(畫面最下方,原本是廣告版位的位置)----
  skillBar: {
    flexDirection: 'row',
    // **不准換行。** 換到第二列的那一顆會掉到提示文字底下(小螢幕直接被切掉),
    // 而且那一列的高度是版面裡少數幾個固定值之一。擠不下就把圖示縮小,見 skillBarMetrics。
    flexWrap: 'nowrap',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 40,
  },
  // overflow 不能設 hidden:等級的小圓刻意畫在圓的外緣上(right/bottom 是負的),
  // 裁掉的話等級就消失了。
  skillSlot: { alignItems: 'center', justifyContent: 'center' },
  skillBarEmpty: { color: '#8a8a95', fontSize: 11 },
  hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  // 齒輪。命中範圍(padding)刻意比圖大:圖只有 18px,而這顆在畫面最下緣,
  // 手指按下去的落點本來就會偏低一點。
  gearButton: {
    padding: 6, borderRadius: 6,
    backgroundColor: '#2a2a35', borderWidth: 1, borderColor: '#3a3448',
  },
  gearIcon: { width: 18, height: 18 },
  /** 光・護盾的光圈。畫在勇者群外面,不填色(填了會蓋掉勇者)。 */
});
