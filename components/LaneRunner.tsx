import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { enemyHeroLookForRow, jobTitle, type LaneJob } from '../game/laneJobs';
import {
  gateLabel,
  isTrapGate,
  gateSpan,
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
import { Settings, type AudioSettings } from './Settings';
import { MapDrawToast } from './MapDrawToast';
import { playSfx } from '../hooks/useSfx';
import {
  describeRunSkill, runSkillSpec, ELEMENT_COUNTERS, isActiveSkill, FREEZE_MS,
  type CollectionScales, type RunSkillId,
} from '../game/laneRunSkills';
import {
  HIT_NUMBER_MS, ELEMENT_FX_MS, useLaneRun,
  type CarriedSkill, type ElementEvent, type HitNumber, type Projectile, type WaveView,
} from '../hooks/useLaneRun';
import { PixelFrame } from './PixelFrame';
import {
  heroBoxHeight, heroForm, squadForms, monsterArt, weaponArt, jobHeroArt, ROCK_ART,
  elementColor, elementLabel, monsterAnim, jobHeroAnim, animFrameIndex, GEAR_ICON,
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
const MONSTER_SIZE = 42;
/** 大魔王畫多大。要一眼看出「這不是小怪」,但不能寬到蓋掉兩條跑道。 */
const BOSS_SIZE = 132;
/** 精英畫多大。介於小怪與魔王之間,一眼看出「這隻不一樣」但不會蓋掉兩條跑道。 */
const ELITE_SIZE = 84;
const PROJECTILE_SIZE = 30;
/** 主動技能特效播多久。要看得到,但不能久到蓋住下一波。 */
const STRIKE_FX_MS = 700;
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

/** 凍住的怪疊什麼顏色。跟 artAssets 的冰屬性同色系,但更亮——它要蓋過原本的屬性染色。 */
const FROST_COLOR = '#9fd8e8';
/** 燃燒擴散那一團光多大(以像素計,跟小怪同尺度)。 */
const BURN_SIZE = 34;
/** 凍結那一下炸開的圈多大。 */
const FROST_BURST = 28;
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
const SQUAD_SLOTS = [
  { dx: 0, dy: 0, scale: 1 },
  { dx: -22, dy: -12, scale: 0.94 },
  { dx: 22, dy: -12, scale: 0.94 },
  { dx: -42, dy: -22, scale: 0.88 },
  { dx: 42, dy: -22, scale: 0.88 },
  { dx: -14, dy: -26, scale: 0.86 },
  { dx: 14, dy: -26, scale: 0.86 },
  { dx: -62, dy: -34, scale: 0.8 },
  { dx: 62, dy: -34, scale: 0.8 },
  { dx: -34, dy: -38, scale: 0.78 },
  { dx: 34, dy: -38, scale: 0.78 },
  { dx: 0, dy: -42, scale: 0.76 },
  { dx: -52, dy: -50, scale: 0.72 },
  { dx: 52, dy: -50, scale: 0.72 },
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
  /** 技能書等級。只放大元素與主動的效果(見 laneRunSkills 的 MAX_SKILL_BOOK_LEVEL)。 */
  bookLevel?: number;
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
   * 這一場結束(通關或陣亡)。coins 是這一場賺到的,由 app 層累加起來帶回主介面。
   * waves 是這一關實際打完幾波——生存模式的分數是**累計波數**,而死在第 3 波跟
   * 死在第 9 波差很多,只回傳「過了沒」會把那個差別整個丟掉。
   */
  onFinish: (result: 'cleared' | 'dead', coins: number, waves: number) => void;
}

export function LaneRunner({
  stage, job, start, onFinish, bookLevel = 0, survivalWavesBefore = null, collection = {},
  audio, onChangeAudio, backdropOverride = null, mapDraw = null,
}: Props) {
  /**
   * 設定面板開著的時候跑圖停住。
   *
   * 這不是「順便」——它就是玩家要的暫停。跑圖中沒有別的地方可以停下來(生存模式尤其:
   * 一輪可能跑十幾分鐘),而「我要接電話」跟「我想調音量」在體感上是同一件事:
   * **先讓畫面別動**。所以齒輪＝暫停鈕,面板標題也直接寫「已暫停」。
   */
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 抽地圖的面板也要停:它蓋在跑道上面,不停的話玩家在讀地圖名稱的那幾秒會漏掉第一排閘門。
  const drawing = mapDraw !== null;
  const run = useLaneRun(stage, start, bookLevel, collection, settingsOpen || drawing);
  const {
    state, distance, heroOffset, upcoming, wave, projectiles, hitNumbers, rocks,
    lastShotAt, lastShotId, feedback, steer, dragTo,
    runSkills, skillOffers, pendingPicks, chooseRunSkill, lastStrike, upcomingElements,
    enemyShots, lastHazardAt, enemyThrowAt, waveNumber, totalWaves,
    elementEvents, carriedSkills,
  } = run;
  const attack = totalAttack(state);
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
    const id = setTimeout(() => finishRef.current('cleared', state.coins, totalWaves), HANDOFF_MS);
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
  const laneWidth = trackWidth / LANE_COUNT;

  /**
   * 進化只換貼圖尺寸,**不動 HERO_HEIGHT**。
   *
   * HERO_HEIGHT 被 headY 吃著(headY = 跑道高 - HERO_BOTTOM - HERO_HEIGHT),而 headY 是
   * bottomYFor 的基準,決定閘門、怪物、投射物、傷害數字、判定線每一個東西畫在哪。跑到一半
   * 改它的話,整條跑道的透視會當場位移,畫面上所有物件一起跳——連「哪一刻算數」的判定線
   * 都會移位。所以布局常數固定用基本型,國王只是貼圖畫大一點,一樣靠 HERO_BOTTOM 對齊底部。
   */
  // 畫面上要畫哪些(國王 + 湊不滿一隻國王的餘數)。橫向定位用「最前面那一隻」的寬度。
  const units = squadForms(state.heroes, SQUAD_SLOTS.length);
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
  const drawn = units.map((form, i) => ({ form, slot: SQUAD_SLOTS[i], spiking: isSpiking(i) })).reverse();
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
   * 技能列的一格。冷卻用「從下往上填滿」表示——填滿 = 可以放了。
   *
   * 為什麼不畫冷卻環:環要嘛靠 SVG 的 strokeDasharray(多一個相依),要嘛靠疊四個方塊
   * 硬湊(在 30px 的格子裡看不出是環)。直條的填滿在這個尺寸下反而更好讀,
   * 而且跟上面的進度條是同一種語彙。
   */
  function renderSkillSlot(s: CarriedSkill) {
    const tint = elementColor(s.id) ?? (isActiveSkill(s.id) ? '#e0a95c' : '#9691a5');
    const cooling = s.cooldown > 0 && s.ready > 0;
    return (
      <View
        key={s.id}
        accessibilityLabel={`技能 ${s.name} ${s.level}`}
        style={[styles.skillSlot, { borderColor: tint }]}
      >
        {cooling && (
          <View
            pointerEvents="none"
            style={[styles.skillCooling, { height: `${Math.min(100, (s.ready / s.cooldown) * 100)}%` }]}
          />
        )}
        {/* 名字取第一個字:八元素是火金雷冰木土光暗、四主動是爆貫號壁、被動是鋒增,十四款彼此不重複。
            用文字而不是圖示是因為技能沒有素材,而圖示鐵則禁止拿 emoji 頂替。 */}
        <Text style={[styles.skillGlyph, { color: tint }]}>{s.name[0]}</Text>
        <Text style={styles.skillSlotSub}>{cooling ? `${Math.ceil(s.ready)}s` : s.level}</Text>
      </View>
    );
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

        <View style={styles.laneLines} pointerEvents="none">
          {Array.from({ length: LANE_COUNT }, (_, i) => (
            <View
              key={i}
              style={[styles.laneLine, { borderRightColor: backdrop.edge }, state.lane === i && styles.laneLineActive]}
            />
          ))}
        </View>

        {/* 判定線:所有物件的底邊碰到這條線就結算。畫出來玩家才知道要把勇者拉到哪裡去接,
            而且它是畫面上唯一靜止的東西——動的是物件,不是線。 */}
        <View style={[styles.contactLine, { top: headY }]} pointerEvents="none" />

        {/* 往下流動的路面虛線:標出兩條跑道的界線。底圖上線之前它還兼著「角色正在前進」的
            唯一線索,現在那件事由底圖捲動負責,但界線本身仍然是**判定**的一部分——
            玩家要知道自己站在哪一格,不能只靠底圖的紋理去猜。 */}
        <View style={styles.laneLines} pointerEvents="none">
          {Array.from({ length: LANE_COUNT - 1 }, (_, i) =>
            DASH_PHASES.map((phase) => (
              <View
                key={`${i}-${phase}`}
                style={[
                  styles.dash,
                  {
                    backgroundColor: backdrop.edge,
                    left: laneWidth * (i + 1) - 1,
                    top: ((groundScroll + phase) % (trackHeight + DASH_LENGTH)) - DASH_LENGTH,
                  },
                ]}
              />
            )),
          )}
        </View>

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
        {feedback && feedback.message !== '' && ready && (
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
        {ready && lastStrike && Date.now() - lastStrike.at < STRIKE_FX_MS && (
          <View
            pointerEvents="none"
            // 往上拉到勇者與結算回饋之上:壓在判定線附近的話,劍會蓋住勇者,
            // 而「爆裂 -N 隻」會跟同一時間跳出來的「擊倒… +N 人」疊在一起,兩行都看不清楚。
            style={[styles.floating, { left: 0, right: 0, top: Math.max(4, headY - 250), alignItems: 'center' }]}
          >
            <Text style={styles.strikeText}>
              {lastStrike.names.join(' + ')}{lastStrike.kills > 0 ? ` -${lastStrike.kills} 隻` : ''}
            </Text>
            <Image
              source={weaponArt(job?.archetype ?? null, MAX_GEAR)}
              resizeMode="contain"
              style={[styles.pixelArt, { width: 128, height: 128, opacity: 0.92 }]}
            />
          </View>
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
                  <Text style={styles.skillName}>
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
                )}
              >
                <Text style={styles.againLabel}>{state.phase === 'cleared' ? '繼續' : '回主介面'}</Text>
              </Pressable>
            </PixelFrame>
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
      <View style={styles.skillBar}>
        {carriedSkills.length === 0
          ? <Text style={styles.skillBarEmpty}>打完一波就能挑技能</Text>
          : carriedSkills.map(renderSkillSlot)}
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
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </View>
  );
}

const DASH_LENGTH = 26;
const DASH_PHASES = [0, 70, 140, 210, 280, 350, 420, 490];

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
  laneLines: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  laneLine: { flex: 1, borderRightWidth: 1 },
  laneLineActive: { backgroundColor: '#ffffff10' },
  dash: { position: 'absolute', width: 2, height: DASH_LENGTH, borderRadius: 1, backgroundColor: '#46465a' },
  gate: {
    position: 'absolute',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 2,
  },
  gateGood: { backgroundColor: '#243a2a', borderColor: '#5ec26a' },
  gateTrap: { backgroundColor: '#3a2323', borderColor: '#e05050' },
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
  contactLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#f2f2f230',
  },
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
  chainBolt: { position: 'absolute', height: 2, backgroundColor: '#f2e6a0', borderRadius: 1, zIndex: 12 },
  /** 凍結:炸開的那一圈。 */
  frostBurst: { position: 'absolute', borderWidth: 2, borderColor: FROST_COLOR, zIndex: 12 },
  /** 凍住期間罩在怪身上的框,讓「這一隻停住了」不只是顏色的差別。 */
  frostRing: { position: 'absolute', borderWidth: 1, borderColor: FROST_COLOR, borderRadius: 4, opacity: 0.8 },
  // ---- 技能列(畫面最下方,原本是廣告版位的位置)----
  skillBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    minHeight: 34,
  },
  skillSlot: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: '#2a2a35',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  /** 冷卻:從下往上蓋住,退到 0 就是可以放了。 */
  skillCooling: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#16161cd0' },
  skillGlyph: { fontSize: 14, fontWeight: '700', lineHeight: 16 },
  skillSlotSub: { color: '#8a8a95', fontSize: 9, lineHeight: 10 },
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
