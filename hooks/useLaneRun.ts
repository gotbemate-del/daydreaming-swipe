import { useCallback, useEffect, useRef, useState } from 'react';

import {
  clampOffset,
  createRun,
  fireIntervalMs,
  HITS_PER_MONSTER,
  initialRunState,
  MAX_FIRE_INTERVAL_MS,
  laneCenterOffset,
  laneFromOffset,
  moveLane,
  resolveRow,
  runLength,
  runSpeed,
  type WaveBoost,
  START_OFFSET,
  totalAttack,
  VISIBLE_AHEAD,
  volleyRate,
  waveKillCount,
  waveMonsters,
  activeThrowers,
  ENEMY_THROW_INTERVAL_MS,
  HAZARD_WIDTH,
  HAZARD_LOSS_HEROES,
  THROWER_ROTATE_MS,
  waveLength,
  DEFAULT_RUN_START,
  isEnemyRowIndex,
  wavesForStage,
  activeSkillCountForStage,
  hitDamage,
  isCritHit,
  procRoll,
  extraKills,
  engageRange,
  createRocks,
  hitsRock,
  applyRockHit,
  withinFireWidth,
  type Lane,
  type RunRock,
  type RunRow,
  type RunStart,
  type RunState,
  type WaveMonster,
  type WaveSpecies,
} from '../game/laneRun';
import {
  applyRunSkillPick, ELEMENT_COUNTERS, isElement, learnRunSkill, runSkillEffects, runSkillOffersAt, runSkillPicksForWave,
  runSkillSpec, hasCooldown, skillCooldownSeconds, FREEZE_MS, BURN_DPS_RATIO, BURN_DURATION_MS,
  type CollectionScales,
  type RunSkillState, type RunSkillId, type RunSkillEffects, type ActiveTrigger,
} from '../game/laneRunSkills';

const TICK_MS = 33; // ~30fps

// 按鈕/方向鍵是「移到隔壁跑道中央」,但不瞬移——瞬移的話畫面上看不出角色移動過,
// 跟手指拖的體感也對不起來。每 tick 追上剩餘距離的 30%,約 5 tick(0.17 秒)到位,
// 比最快關卡的一排 0.9 秒短很多,不會出現「按了卻來不及到」的情況。
const EASE_PER_TICK = 0.3;
const SNAP_EPSILON = 0.002;

/** 丟出去的武器相對於勇者往前飛的速度(距離單位/秒)。夠快才看得出是「擲出去」而不是飄走。 */
const PROJECTILE_SPEED = 420;

/** 敵人擲出的武器飛多快。比玩家的慢一點,才有時間看到它過來並閃開。 */
const ENEMY_SHOT_SPEED = 260;

export interface RunFeedback {
  key: number;
  message: string;
  /** 人數變化。負的就是被撞掉了——這一版沒有血量。 */
  heroDelta: number;
  attackDelta: number;
}

/**
 * 命中時跳出來的傷害數字。位置用「絕對距離 + 橫向 offset」跟小怪同一個座標系,
 * 畫面才不用另外換算——數字要跟著被打的那隻一起往勇者移動,釘在螢幕座標會飄掉。
 */
export interface HitNumber {
  id: number;
  value: number;
  crit: boolean;
  offset: number;
  distance: number;
  /** 出生時間,畫面拿它算飄多高、淡多少 */
  bornAt: number;
}

/** 數字浮多久。太長會整片數字疊在一起看不清楚,太短看不到。 */
export const HIT_NUMBER_MS = 620;

/** 飛行中的武器。位置跟排、跟小怪同一個座標系(絕對距離),畫面才不用換算兩套。 */
export interface Projectile {
  id: number;
  distance: number;
  fromDistance: number;
  fromOffset: number;
  toOffset: number;
  targetIndex: number;
  /**
   * 這一把帶的是什麼元素(沒帶元素技能就是 undefined)。
   *
   * **元素的演出一律掛在武器上,不在地上畫區域。** 地面區域是「這裡有東西」,
   * 武器帶色是「我丟出去的這一把在做事」——後者才對得上「技能是我的攻擊」這個直覺,
   * 而且不必再發明一套跟跑道無關的圖層。身上帶幾個元素就輪流出,一眼看得出組合。
   */
  element?: RunSkillId;
}

/**
 * 敵方勇者擲出來的武器。**跟玩家的 Projectile 一樣是真的物件,不是畫面自己算的動畫。**
 *
 * 先前它只存在於畫面層(用 Date.now() 推出來的位置),所以它永遠打不到人——
 * 傷害只在「這一排結算」的那一瞬間算,玩家看著武器穿過身體卻什麼都沒發生。
 * 搬進 hook 之後,飛到你身上的那一刻就會扣人,而且看得到是哪一把打中的。
 */
export interface EnemyShot {
  id: number;
  /** 絕對距離(跟排、跟小怪同一個座標系)。往玩家的方向遞減。 */
  distance: number;
  /** 橫向位置:就是丟他的人站的那條線。 */
  offset: number;
  /** 畫面拿它挑武器造型,同一個人丟的每一把都一樣。 */
  variant: number;
}

/**
 * 命中那一刻的元素演出:火焰燒到旁邊、連鎖閃電、凍結。
 *
 * **這是「把已經發生的事畫出來」,不是另一套戰鬥判定。** 觸發的當下就已經把傷害加進
 * `hitsOn`,這個物件只是告訴畫面「在誰身上畫什麼、從哪連到哪」——它消失了也不影響結果,
 * 這是這個專案一貫的分法(見 laneRun 的 extraKills:數字只有一份)。
 */
export interface ElementEvent {
  id: number;
  kind: 'burn' | 'chain' | 'freeze';
  /** 效果落在哪一隻(waveMonsters 的索引) */
  target: number;
  /** 連鎖:電從哪一隻跳過來 */
  from?: number;
  bornAt: number;
}

/** 元素演出畫多久。連鎖是一條線(短),燃燒與凍結是身上的光(長一點才看得到)。 */
export const ELEMENT_FX_MS: Record<ElementEvent['kind'], number> = { burn: 420, chain: 220, freeze: FREEZE_MS };

/** 技能列上的一格。被動沒有冷卻(cooldown = 0),只顯示名字與等級。 */
export interface CarriedSkill {
  id: RunSkillId;
  name: string;
  level: number;
  /** 幾秒觸發一次(0 = 被動,沒有冷卻) */
  cooldown: number;
  /** 還要幾秒才好(0 = 現在就緒) */
  ready: number;
}

export interface WaveView {
  species: WaveSpecies[];
  boss: boolean;
  /** 精英排:一隻大的。畫面要畫大、要有血條(牠要打好幾下才倒)。 */
  elite: boolean;
  /** 勇者波:敵方是勇者,會投擲武器。畫面要用職業立繪,而且要畫出飛過來的武器。 */
  heroWave: boolean;
  /**
   * 這是第幾排。勇者波的落點要現算(丟的人是「還沒被打倒的那些」),所以畫面拿它
   * 加上 down[] 自己算——不存一份固定的落點,存了就會跟「誰還活著」對不起來。
   */
  rowIndex: number;
  /**
   * 這一波的屬性。**整波共用一個**,畫面直接把整群染成這個顏色——
   * 屬性長在怪身上,不是只寫在面板上(見 artAssets 的 ELEMENT_COLORS)。
   */
  element?: RunSkillId;
  /** 每隻的血條:已挨幾下 / 要挨幾下。魔王打很久,沒有進度條會不知道打到哪了。 */
  hitsOn: number[];
  hitsPerUnit: number;
  monsters: WaveMonster[];
  /** 每一隻倒了沒。倒下的不再畫,活著的會一路衝到勇者頭上。 */
  down: boolean[];
  /**
   * 每一隻被凍到什麼時候(0 = 沒凍)。
   *
   * **給的是截止時間不是布林值**,因為畫面要拿它做兩件事:一是「停在原地不動」
   *(凍住的那一隻跟著玩家一起前進,其他人照樣衝過來——怪的世界座標是固定的、
   * 往前跑的是玩家,所以「不再逼近」只能這樣表達),二是**把兩格動畫也停住**:
   * 位置停了但手腳還在動的話,那看起來是「原地跑步」不是「凍住」。
   * 有了截止時間就能反推凍住的那一刻是哪一格,畫面直接凍在那一格。
   */
  frozenUntil: number[];
  /** 每一隻燒到什麼時候(0 = 沒燒)。畫面拿它畫身上的火。 */
  burningUntil: number[];
  /** 這一波的怪被土・遲滯拖慢幾成(0 = 沒點)。畫面拿它疊咖啡色。 */
  slow: number;
}

function sameFlags(a: boolean[], b: boolean[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export interface LaneRunView {
  rows: RunRow[];
  /** 這一場路上的石頭。撞到掉人,但站哪裡都能閃(見 laneRun 的 createRocks)。 */
  rocks: RunRock[];
  state: RunState;
  /** 已跑距離 */
  distance: number;
  /** 角色橫向位置,0 = 跑道最左、1 = 最右 */
  heroOffset: number;
  /** 還沒通過的排(畫面上要畫出來的) */
  upcoming: RunRow[];
  /** 正在衝過來的那一波小怪(沒有就是 null) */
  wave: WaveView | null;
  projectiles: Projectile[];
  /** 敵方勇者擲出來的武器。飛到你身上就會扣人(見 EnemyShot)。 */
  enemyShots: EnemyShot[];
  /** 剛被武器砸中的時間戳。畫面拿它閃一下紅色,不然扣了人玩家也不知道發生什麼事。 */
  lastHazardAt: number;
  /**
   * 敵方勇者最近一次出手的時間戳(monsters 的索引 → 時間)。
   * 畫面拿它把那一隻換成投擲的那一格——**動作要跟真的飛出去的那一把對上**,
   * 照固定週期播的話會變成「他在做動作,但武器是另一個時間點飛出來的」
   * (玩家自己的噴刺踩過同一個坑,見 lastShotAt / lastShotId)。
   */
  enemyThrowAt: Record<number, number>;
  /** 命中瞬間跳出來的傷害數字(含暴擊)。純演出,不影響擊殺數。 */
  hitNumbers: HitNumber[];
  /**
   * 最後一次擲出武器的時間戳與流水號。畫面拿它讓史萊姆的「噴刺」跟真正的投擲對上——
   * 用固定週期播的話,動作跟丟出去的東西各播各的,看起來像兩件事。
   *
   * 流水號是給「**哪一隻**在丟」用的:一次投擲只有一隻該噴刺,全隊一起噴看起來像
   * 整團在抽搐,而且完全對不上畫面上只飛出一件武器這件事。
   */
  lastShotAt: number;
  lastShotId: number;
  /** 這一場帶著的場內技能(跑完就沒了)。 */
  runSkills: RunSkillState[];
  /** 打完一波之後跳出來的選項。非空的時候跑圖是暫停的。 */
  skillOffers: RunSkillState[];
  /** 還欠玩家幾次選擇(決戰前那次會欠 2 次)。 */
  pendingPicks: number;
  /**
   * 接下來幾波的屬性。**公開它是相剋能成立的前提**:
   * 看不到就變成擲骰子,看得到才有「押注這三波 vs 拿通用的」這個取捨。
   */
  upcomingElements: RunSkillId[];
  chooseRunSkill: (choice: RunSkillState) => void;
  feedback: RunFeedback | null;
  speed: number;
  /** 正在加速趕路(前方沒東西)。畫面拿它做視覺回饋。 */
  dashing: boolean;
  /** 主動技能剛觸發(時間戳 + 清掉幾隻)。畫面拿它播特效。 */
  /**
   * 剛剛放出去的主動技能。**要帶 id 不能只帶名字**:畫面要照 id 挑特效
   * (12 款各有各的),拿名字去反查等於把「顯示用的字」變成 key,改個名字特效就消失。
   */
  lastStrike: { at: number; ids: RunSkillId[]; names: string[]; kills: number } | null;
  /** 命中那一刻的元素演出(燃燒擴散 / 連鎖閃電 / 凍結)。 */
  elementEvents: ElementEvent[];
  /**
   * 這一場帶著的技能與冷卻。**畫面最下方那一列就是這個**——
   * 主動技能改成秒冷卻之後,玩家一定要看得到「還有幾秒」,不然它就只是偶爾自己跳出來的特效。
   */
  carriedSkills: CarriedSkill[];
  /** 手指拖曳:直接把角色放到這個位置 */
  dragTo: (offset: number) => void;
  /** 方向鍵:滑順移到隔壁跑道中央 */
  steer: (direction: 'left' | 'right') => void;
  stage: number;
  /** 現在是第幾波(1 開始)。打完最後一波之後停在總波數,不會變成「第 11 波」。 */
  waveNumber: number;
  /** 這一小關共幾波。 */
  totalWaves: number;
}

interface WaveRuntime {
  rowIndex: number;
  species: WaveSpecies[];
  power: number;
  /** 這一波每隻要挨幾下。一般小怪 3 下,精英 6 下,大魔王 12 下。 */
  hitsPerUnit: number;
  boss: boolean;
  elite: boolean;
  heroWave: boolean;
  element?: RunSkillId;
  monsters: WaveMonster[];
  /** 每一隻各自挨了幾下。打不倒的那幾隻也會累加——勇者照樣丟,只是丟不倒。 */
  hitsOn: number[];
  lastFireAt: number;
  /** 每一隻被凍到什麼時候(0 = 沒凍)。 */
  frozenUntil: number[];
  /**
   * 每一隻燒到什麼時候(0 = 沒燒)。燃燒是**持續傷害**不是一次補一下:
   * 每秒啃掉 BURN_DPS_RATIO 的最大生命,所以 hitsOn 會有小數。
   * (為什麼不是一次補一下:見 laneRunSkills 的 BURN_DPS_RATIO——配上雷會爆掉。)
   */
  burningUntil: number[];
  /** 這一波總共命中幾下。雷・連鎖是「每 N 下觸發一次」,靠的就是它。 */
  hitCount: number;
  /**
   * 這一波之內,主動技能已經觸發出來的效果。
   *
   * **一定要跟著波走、不能跟著冷卻走**:冷卻是連續的時鐘(跨波不重置),
   * 但「這一波多清掉幾隻」只對這一波有意義——不隨波清空的話,前面幾波累積的擊殺數
   * 會在最後一波一次結算掉,玩家看到的是「魔王莫名其妙被秒了」。
   */
  fired: { kills: number; immune: boolean };
  /** 這一波有哪幾隻曾經進到射程寬度內。擊殺數會被它的大小夾住(見 laneRun 的 FIRE_WIDTH)。 */
  covered: Set<number>;
}

// 一場跑圖就是一個 hook 實例:重跑、下一關都由外層換 key 重新掛載,不在 hook 裡自己 reset。
// 自己 reset 要記得清掉的東西有八個(波次、飛行中的武器、已結算的排、計時起點…),
// 漏掉任何一個就會出現「上一場的怪出現在這一場」這種難查的殘留。
/**
 * @param bookLevel 技能書等級。**只影響玩家側**(元素/主動的等級上限與選項保證),
 *   `createRun` 完全不知道它——這正是它不會把敵人養大的原因(見 laneRunSkills 的
 *   MAX_SKILL_BOOK_LEVEL)。傳進理想路線就會變成「數字在動、體感沒動」。
 */
export function useLaneRun(
  stage: number, start: RunStart = DEFAULT_RUN_START, bookLevel = 0, collection: CollectionScales = {},
  /**
   * 畫面層要求暫停(打開設定面板、生存模式開頭抽地圖)。
   *
   * 跟「挑技能時暫停」走**同一條路徑**而不是各自做一套:暫停要停的東西有兩處
   *(距離的計時迴圈與波次結算),各自實作一定會漏掉其中一個,而漏掉的症狀是
   *「畫面停住但怪還在往前推進」——關掉面板的瞬間人數突然少一截,查起來完全看不出原因。
   */
  externallyPaused = false,
): LaneRunView {
  // 這一場的 seed。閘門與技能選項都由它決定,敵人戰力也是照同一顆 seed 的最佳路線算的,
  // 所以 seed 必須留著——技能選項另外抽的話,玩家看到的選單就不是 createRun 假設的那一組。
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const [rows] = useState<RunRow[]>(() => createRun(seed, stage));
  // 石頭走自己的亂數流,所以加減石頭不會位移閘門內容(見 createRocks)。
  const [rocks] = useState<RunRock[]>(() => createRocks(seed, stage));
  const [state, setState] = useState<RunState>(() => initialRunState(stage, start));
  const [distance, setDistance] = useState(0);
  const [feedback, setFeedback] = useState<RunFeedback | null>(null);
  const [wave, setWave] = useState<WaveView | null>(null);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [enemyShots, setEnemyShots] = useState<EnemyShot[]>([]);
  const [enemyThrowAt, setEnemyThrowAt] = useState<Record<number, number>>({});
  const [lastHazardAt, setLastHazardAt] = useState(0);
  const [hitNumbers, setHitNumbers] = useState<HitNumber[]>([]);
  const [lastShotAt, setLastShotAt] = useState(0);
  const [lastShotId, setLastShotId] = useState(0);
  const [elementEvents, setElementEvents] = useState<ElementEvent[]>([]);
  const [runSkills, setRunSkills] = useState<RunSkillState[]>([]);
  const [skillOffers, setSkillOffers] = useState<RunSkillState[]>([]);
  const [pendingPicks, setPendingPicks] = useState(0);

  // 已跑距離用累加的(速度會變,不能用「起跑時間 x 速度」回推)。
  const travelledRef = useRef(0);
  const lastTickRef = useRef(Date.now());
  /** 從什麼時候開始「視野內沒東西」。撐過 DASH_DELAY_MS 才開始加速。 */
  const idleSinceRef = useRef(0);
  const dashingRef = useRef(false);
  // 已結算過的排。跟判定同步讀寫,走 state 會慢一拍導致同一排被結算兩次。
  const passedRef = useRef<Set<number>>(new Set());
  // 已經跑過的石頭(不管撞到沒撞到)。同一顆只判定一次。
  const passedRocksRef = useRef<Set<number>>(new Set());
  const feedbackKeyRef = useRef(0);
  // 戰鬥演出要讀當下的攻擊力(波次中途吃到 x2 閘門,打得掉的隻數要立刻跟著變),
  // 但它跑在 setInterval 裡,閉包抓到的會是舊的 state,所以另外鏡射一份。
  const stateRef = useRef(state);
  stateRef.current = state;

  const waveRef = useRef<WaveRuntime | null>(null);
  const projectilesRef = useRef<Projectile[]>([]);
  const projectileIdRef = useRef(0);
  const enemyShotsRef = useRef<EnemyShot[]>([]);
  const enemyShotIdRef = useRef(0);
  const enemyFireAtRef = useRef(0);
  /**
   * 這一波已經被打中幾下。**不設上限**(每一下都算),留著只是為了在結算時
   * 告訴 resolveEnemy「跑圖途中已經扣過了,不要再用期望值扣一次」。
   */
  const hazardHitsRef = useRef<{ row: number; hits: number }>({ row: -1, hits: 0 });
  const hitNumbersRef = useRef<HitNumber[]>([]);
  const hitNumberIdRef = useRef(0);
  const elementEventsRef = useRef<ElementEvent[]>([]);
  const elementEventIdRef = useRef(0);

  // 角色位置同時放在 ref 與 state:ref 給結算用(要拿到「這一瞬間」的位置,不能慢一拍,
  // 慢一拍就會發生「明明已經拉到隔壁格了卻吃到原本那格」),state 只是拿來觸發重畫。
  const offsetRef = useRef(START_OFFSET);
  const targetRef = useRef(START_OFFSET);
  const [heroOffset, setHeroOffset] = useState(START_OFFSET);

  const speed = runSpeed(stage);
  const totalWaves = wavesForStage(stage);
  // 已經打完幾波。決定下一次該給幾個技能(決戰前那次給兩個)。
  const clearedWavesRef = useRef(0);
  // 這是第幾次開選單。選項綁「seed + 第幾次」,重跑同一顆 seed 會開出同一串——
  // createRun 算敵人的時候重播的就是這一串(見 laneRunSkills 的 runSkillOffersAt)。
  const skillOrdinalRef = useRef(0);
  /**
   * 每一款有冷卻的技能「什麼時候會好」(時間戳)。冷卻**用秒不用波**。
   *
   * 這條推翻了原本的「冷卻要綁波不綁秒」:那條規則成立的前提是「一波 = 一排」,
   * 一排的時間隨跑速變(第 1 關 4.5 排 vs 第 40 關 11 排)。關卡結構改成
   * 「戰鬥段是時間」之後,一波的長度反而幾乎是常數(13.6~17.1 秒,見 laneRunSkills
   * 的 COOLDOWN_SPEC),綁秒現在比綁波穩,而且玩家看得懂倒數。
   *
   * **時鐘是連續的,不隨波重置**——重置的話「打完一波」就變成免費的冷卻縮短,
   * 清得快的人會拿到更多次觸發,那是把技能的強度綁在跑速上,又繞回同一個坑。
   */
  const readyAtRef = useRef<Record<string, number>>({});
  /** 這一場到目前為止總共失去幾個人。木・再生只補得回這個數字以內。 */
  const lostSoFarRef = useRef(0);
  /**
   * 光・護盾:手上還有幾個。每一波開始時擲一次骰,中了就 +1(上限 fx.shieldCap),
   * 被武器砸中的時候消耗一個、那一下完全不扣人。
   *
   * **跨波保留**:結不出來的那幾波就是沒有,結出來沒用掉的可以留到下一波。
   * 每波清空的話它會退化成「這一波有沒有中獎」,而玩家對一個自己控制不了、
   * 又留不住的東西不會有任何規劃。
   */
  /** 目前帶的技能。tick 迴圈(每 33ms)要讀,走 ref 才不用把整個迴圈綁進相依陣列。 */
  const runSkillsRef = useRef<RunSkillState[]>([]);
  runSkillsRef.current = runSkills;
  const [lastStrike, setLastStrike] = useState<{ at: number; ids: RunSkillId[]; names: string[]; kills: number } | null>(null);

  /**
   * 挑技能的時候**跑圖暫停**。
   *
   * 中間試過不暫停(面板浮在跑道上、底下照樣跑),但那樣要同時做三件事:
   * 讀三個選項、閃迎面而來的怪、還要選閘門。翻回暫停。
   */
  const paused = skillOffers.length > 0 || externallyPaused;

  /**
   * 前方**完全沒東西**的時候會不會加速趕路。
   *
   * 一場有 26~39% 的時間畫面上什麼都沒有(前幾波只有 3 隻怪,卻要橫跨一整個戰鬥段),
   * 玩家只是在等下一波冒出來。清完一波之後停一拍(DASH_DELAY_MS)就加速衝過那一段——
   * 空檔存在才消,而且清得快的人自然跑得快。
   *
   * **不會偷走反應時間**:條件是「視野內(VISIBLE_AHEAD)沒有任何還沒結算的東西」,
   * 所以下一個物件一進視野就立刻恢復原速,玩家看到它的距離跟平常完全一樣。
   * 跑速是難度旋鈕,這裡動的是「沒有難度可言的那一段」。
   */
  const DASH_DELAY_MS = 600;
  const DASH_MULTIPLIER = 4;
  const [dashing, setDashing] = useState(false);

  /**
   * 現在該不該加速。**閘門與怪的標準不一樣**,這是關鍵:
   *
   *   閘門 → 只要進視野就絕不加速。它是這款的決策點,反應時間一秒都不能偷。
   *   怪   → 只有進到「近的那半邊」才算數。你不對怪做反應(該做的決定在閘門就做完了),
   *          牠遠遠地慢慢飄過來的那段純粹是等待。
   *
   * 一開始兩者用同一個標準(都看 VISIBLE_AHEAD),結果是一波的第一隻怪很早就算「視野內有東西」,
   * 整段接近期都不算空——實測單場時間 201s → 200s,等於完全沒作用。
   */
  const DASH_MONSTER_ZONE = VISIBLE_AHEAD * 0.35;
  function nothingAhead(travelled: number): boolean {
    // 石頭走**閘門的標準**(進視野就絕不加速),不是怪的標準。石頭要玩家做反應,
    // 而 x4 的速度衝向一顆才剛冒出來的石頭,反應時間只剩四分之一——那是硬塞的失誤,
    // 不是玩家的失誤。加速只准發生在真的什麼都沒有的那一段。
    if (rocks.some((k) => !passedRocksRef.current.has(k.index) && k.distance - travelled <= VISIBLE_AHEAD)) {
      return false;
    }
    return !rows.some((r) => {
      if (passedRef.current.has(r.index)) return false;
      if (r.nodes[0]?.kind !== 'enemy') return r.distance - travelled <= VISIBLE_AHEAD;
      const lead = r.distance - waveLength(stage, r.nodes[0].enemy?.units);
      return lead - travelled <= DASH_MONSTER_ZONE;
    });
  }

  useEffect(() => {
    if (state.phase !== 'running' || paused) return;
    // 距離改成**累加**而不是「起跑時間 x 固定速度」——速度會變,回推的算法就對不起來了。
    // 順帶把暫停處理變簡單:停掉 interval 就是停住,不用再補償時鐘(舊版要把 startedAt
    // 往後推「暫停了多久」,漏補一次就會一口氣跳掉兩排閘門)。
    lastTickRef.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      // 分頁切回來的時候 dt 會很大,夾住免得一格跳過好幾排。
      const dt = Math.min(250, now - lastTickRef.current);
      lastTickRef.current = now;

      const idle = nothingAhead(travelledRef.current);
      if (!idle) idleSinceRef.current = 0;
      else if (idleSinceRef.current === 0) idleSinceRef.current = now;
      const dash = idle && idleSinceRef.current > 0 && now - idleSinceRef.current >= DASH_DELAY_MS;
      if (dash !== dashingRef.current) { dashingRef.current = dash; setDashing(dash); }

      const before = travelledRef.current;
      const movedBy = (speed * (dash ? DASH_MULTIPLIER : 1) * dt) / 1000;
      travelledRef.current += movedBy;
      const travelled = travelledRef.current;
      setDistance(travelled);

      const gap = targetRef.current - offsetRef.current;
      if (gap !== 0) {
        const next = Math.abs(gap) < SNAP_EPSILON ? targetRef.current : offsetRef.current + gap * EASE_PER_TICK;
        offsetRef.current = next;
        setHeroOffset(next);
      }

      // 位置更新完才判石頭:玩家這一格拉到的位置就是撞不撞得到的位置,慢一拍會出現
      // 「明明已經閃開了卻還是撞到」(結算用 offsetRef 也是同一個理由,見下面的排結算)。
      stepRocks(before, travelled);
      stepWave(now, travelled, movedBy);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [state.phase, speed, rows, paused, stage]);

  /**
   * 這一波目前的加成。**跑圖途中的演出與這一排的結算共用同一份**——
   * 各算各的話,畫面上倒了 9 隻、結算卻只算 8 隻,玩家會看到「明明打完了還是漏一隻」。
   */
  function boostFor(
    heroWave: boolean, fired: WaveRuntime['fired'], fx: RunSkillEffects, covered?: number,
  ): WaveBoost {
    const boost: WaveBoost = {};
    // 勇者波:投擲傷害在跑圖途中就逐發扣過了(見 EnemyShot),一定要告訴 resolveEnemy
    // 別再用期望值扣一次——漏掉這一行的症狀只是「勇者波特別難」,不會有任何錯誤訊息。
    if (heroWave) boost.hazardResolved = true;
    // 火不再進這裡:它現在純粹是持續傷害,不保證帶走幾隻(舊的 fx.burnKills 已移除)。
    if (fired.kills > 0) boost.kills = fired.kills;
    // 金・擴散(pierceRatio)與雷・連鎖(chainRatio)現在**同一條軸**:都吃「自己打倒的隻數」。
    // 金舊版走的是「整波的幾成」,那是跟隊伍無關的數量天花板,已依規則拆掉
    // (見 laneRun 的 WaveBoost.chainRatio)。
    const ratio = fx.pierceRatio + fx.chainRatio;
    if (ratio > 0) boost.chainRatio = ratio;
    if (fx.regen > 0) { boost.regen = fx.regen; boost.lostSoFar = lostSoFarRef.current; }
    if (fx.lossCut > 0) boost.lossCut = fx.lossCut;
    if (fired.immune) boost.immune = true;
    if (covered !== undefined) boost.coveredUnits = covered;
    return boost;
  }

  /** 波次還沒建起來就跑到結算點時用的空加成(理論上不會發生,視野判定比結算早很多)。 */
  const NO_FIRED: WaveRuntime['fired'] = { kills: 0, immune: false };

  /**
   * 冷卻好了的主動技能就地觸發。
   *
   * **號令補的人直接進 RunState,其他三款走 boost。** 分開的理由:補人是狀態改變,
   * 當場就要看得到(玩家剩 3 個人的時候等到結算才補等於沒補);清怪則會影響
   * 「漏了幾隻」的結算,所以必須留在 boost 裡讓 resolveEnemy 一起算,
   * 兩邊都算一次就會變成雙倍。
   */
  function fireActives(current: WaveRuntime, fx: RunSkillEffects, now: number) {
    const fired: string[] = [];
    const firedIds: RunSkillId[] = [];
    let killsNow = 0;
    let heroesNow = 0;
    const ready = (id: string, cooldownSeconds: number) => {
      const at = readyAtRef.current[id];
      if (at !== undefined && now < at) return false;
      readyAtRef.current[id] = now + cooldownSeconds * 1000;
      return true;
    };
    for (const a of fx.actives as ActiveTrigger[]) {
      if (!ready(a.id, a.cooldown)) continue;
      fired.push(a.name);
      firedIds.push(a.id);
      if (a.kills) { current.fired.kills += a.kills; killsNow += a.kills; }
      if (a.heroes) heroesNow += Math.round(a.heroes);
      if (a.immune) current.fired.immune = true;
    }
    if (fired.length === 0) return;
    setLastStrike({ at: now, ids: firedIds, names: fired, kills: Math.floor(killsNow) });
    if (heroesNow > 0) {
      setState((prev) => (prev.phase === 'running' ? { ...prev, heroes: prev.heroes + heroesNow } : prev));
    }
  }

  /**
   * 命中的那一刻,火/雷/冰各自做的事。
   *
   * 使用者要的規則,一字不差地照做:
   *   火 命中後火焰擴散到旁邊的魔物扣血量
   *   雷 每攻擊多少下觸發連鎖閃電
   *   冰 被攻擊的怪物有機率被凍在原地不能移動
   *   交互 連鎖電到的怪,再各自吃一次燃燒擴散 / 凍結判定(depth 1 就是這一層)
   *
   * **這裡只加 hitsOn(讓怪掉血),不加「能打倒幾隻」的上限。** 上限仍然是
   * 戰力 + burnKills/chainRatio/pierceRatio,由 laneRun 的 extraKills 統一算。
   * 兩件事分開才不會「火燒得更漂亮 = 難度悄悄降了」。
   */
  function applyOnHit(current: WaveRuntime, i: number, now: number, fx: RunSkillEffects, depth = 0) {
    // 冰・凍結:凍住的那一隻停在畫面上原地(見 WaveView.frozen)。
    if (fx.freezeChance > 0 && procRoll(current.rowIndex, i, current.hitCount + depth) < fx.freezeChance) {
      current.frozenUntil[i] = now + FREEZE_MS;
      pushElementEvent('freeze', i, now);
    }
    // 火・燃燒:火焰跳到後面還站著的那幾隻身上,**點燃**而不是直接補一下傷害。
    // 直接補一下(hitsOn += 1)配上雷會爆掉:連鎖電到的每一隻會再各自觸發一次擴散,
    // 一次命中可能瞬間送出十幾下,打得倒的那一批同一瞬間全部消失。
    if (fx.burnSpread > 0) {
      let spread = 0;
      for (let j = i + 1; j < current.monsters.length && spread < fx.burnSpread; j++) {
        if (current.hitsOn[j] >= current.hitsPerUnit) continue;
        current.burningUntil[j] = now + BURN_DURATION_MS;
        pushElementEvent('burn', j, now, i);
        spread += 1;
      }
    }
    // 雷・連鎖:每 N 下一次。**只有第一層會觸發**——連鎖電到的目標再觸發連鎖的話,
    // 一下命中可以連到整波,那不是「連鎖」是「全屏」。
    if (depth === 0 && fx.chainEvery > 0 && current.hitCount % fx.chainEvery === 0) {
      let hit = 0;
      let from = i;
      for (let j = i + 1; j < current.monsters.length && hit < fx.chainTargets; j++) {
        if (current.hitsOn[j] >= current.hitsPerUnit) continue;
        current.hitsOn[j] += 1;
        pushElementEvent('chain', j, now, from);
        // 交互:電到的那一隻再吃一次燃燒擴散與凍結判定。
        applyOnHit(current, j, now, fx, depth + 1);
        from = j;
        hit += 1;
      }
    }
  }

  function pushElementEvent(kind: ElementEvent['kind'], target: number, now: number, from?: number) {
    elementEventIdRef.current += 1;
    elementEventsRef.current = [
      ...elementEventsRef.current,
      { id: elementEventIdRef.current, kind, target, from, bornAt: now },
    ];
  }

  /**
   * 跑過石頭:這一格跨過去的石頭各判定一次。
   *
   * 用「跨越」判定(前一格的距離 < 石頭 <= 這一格的距離),不是「距離夠近就算撞到」:
   * 分頁切回來的時候 dt 會被夾到 250ms,一格可以前進 27 個距離單位,拿近似值判會整顆漏掉。
   *
   * 位置讀 offsetRef 不讀 state:state 慢一拍,會發生「明明已經拉開了卻還是撞到」——
   * 跟排結算讀 offsetRef 是同一個理由。
   */
  function stepRocks(from: number, to: number) {
    for (const rock of rocks) {
      if (rock.distance > to) break; // createRocks 已經照距離排序,後面的更遠
      if (passedRocksRef.current.has(rock.index)) continue;
      passedRocksRef.current.add(rock.index);
      if (rock.distance <= from) continue; // 起跑前就在身後(防呆,正常不會發生)
      if (!hitsRock(offsetRef.current, rock)) continue;
      // stateRef 同步更新:同一格裡戰鬥演出會讀它算「打得掉幾隻」,
      // 撞掉的人必須立刻反映進去,不然這一格的擊殺數是用撞之前的戰力算的。
      const r = applyRockHit(stateRef.current);
      stateRef.current = r.state;
      setState(r.state);
      feedbackKeyRef.current += 1;
      setFeedback({
        key: feedbackKeyRef.current,
        message: r.message,
        heroDelta: r.heroDelta,
        attackDelta: r.attackDelta,
      });
    }
  }

  /** 一波小怪的演出:該冒出來的冒出來、該丟的武器丟出去、打中的就消失。 */
  function stepWave(now: number, travelled: number, movedBy: number) {
    // 找出「正在逼近」的那一排敵人。
    //
    // 判斷的是**最前面那一隻怪**進沒進視野,不是那一排的結算點——小怪是從結算點往前
    // 散布 waveLength(整個戰鬥段)的,結算點還在 VISIBLE_AHEAD 之外的時候,
    // 前半的怪其實早就該出現在畫面上了。用結算點判斷的話,戰鬥段的前半會是一段空跑
    // (實測第 1 關有 6 秒完全沒東西),而且波次啟動時前面那幾隻已經越過勇者、直接被跳過。
    const enemyRow = rows.find(
      (r) =>
        !passedRef.current.has(r.index) &&
        r.nodes[0]?.kind === 'enemy' &&
        r.distance - waveLength(stage, r.nodes[0].enemy?.units) - travelled <= VISIBLE_AHEAD,
    );

    if (!enemyRow) {
      if (waveRef.current !== null) {
        waveRef.current = null;
        projectilesRef.current = [];
        hitNumbersRef.current = [];
        enemyShotsRef.current = [];
        elementEventsRef.current = [];
        setEnemyThrowAt({});
        setWave(null);
        setProjectiles([]);
        setHitNumbers([]);
        setEnemyShots([]);
        setElementEvents([]);
      }
      return;
    }

    const enemy = enemyRow.nodes[0].enemy!;
    let current = waveRef.current;
    if (current === null || current.rowIndex !== enemyRow.index) {
      current = {
        rowIndex: enemyRow.index,
        species: enemy.species,
        power: enemy.power,
        hitsPerUnit: enemy.hitsPerUnit ?? HITS_PER_MONSTER,
        boss: enemy.boss === true,
        elite: enemy.elite === true,
        heroWave: enemy.heroWave === true,
        element: enemy.element,
        monsters: waveMonsters(
          enemyRow.index, enemy.units, enemyRow.distance, enemy.species.length,
          waveLength(stage, enemy.units),
        ),
        hitsOn: new Array(enemy.units).fill(0),
        lastFireAt: 0,
        frozenUntil: new Array(enemy.units).fill(0),
        burningUntil: new Array(enemy.units).fill(0),
        hitCount: 0,
        fired: { kills: 0, immune: false },
        covered: new Set<number>(),
      };
      waveRef.current = current;
      projectilesRef.current = [];
      enemyShotsRef.current = [];
      elementEventsRef.current = [];
    }

    // 這一波的技能效果。**每個 tick 重算**:波次中途選了新技能、或是吃到閘門讓戰力變了,
    // 畫面上能打倒幾隻就要立刻跟著變(相剋也在這一層逐元素結算完)。
    const fx = runSkillEffects(runSkillsRef.current, current.element, bookLevel, collection);
    fireActives(current, fx, now);

    // 凍住的那幾隻跟著玩家一起前進 = 畫面上停在原地不再逼近。
    // 怪的世界座標是固定的、往前跑的是玩家,所以「不動」只能用這個方式表達。
    // 土・遲滯則是**整波**都慢一截(fx.slow),跟凍結疊起來就是「慢慢逼近、偶爾完全停住」。
    if (movedBy > 0 && (fx.slow > 0 || current.frozenUntil.some((t) => t > now))) {
      for (let i = 0; i < current.monsters.length; i++) {
        current.monsters[i].distance += current.frozenUntil[i] > now ? movedBy : movedBy * fx.slow;
      }
    }

    // 火・燃燒的持續傷害:每個 tick 把「這段時間燒掉的血」加進去。
    // 5%/秒 表示光靠燒要 20 秒才燒得死一隻,而一整波只有 13~17 秒——所以它永遠不會
    // 自己收掉一隻,只會把血條磨掉一截(那正是它跟雷疊起來也不會爆掉的原因)。
    if (current.burningUntil.some((t) => t > now)) {
      const tick = (BURN_DPS_RATIO * current.hitsPerUnit * TICK_MS) / 1000;
      for (let i = 0; i < current.monsters.length; i++) {
        if (current.burningUntil[i] > now) {
          current.hitsOn[i] = Math.min(current.hitsPerUnit, current.hitsOn[i] + tick);
        }
      }
    }

    // 打得掉幾隻每個 tick 重算:波次中途吃到閘門,攻擊力一變,能清掉的隻數就跟著變。
    // 前 kills 隻是「打得倒的」,後面那幾隻挨再多下也不會倒——那就是戰力壓不過的部分。
    // **額外擊殺走 laneRun 的 extraKills**,跟這一排結算用的是同一支函式:
    // 各寫一份的話畫面與結算會慢慢岔開,而兩邊分開看都完全合理,最難查。
    const ownKills = waveKillCount(totalAttack(stateRef.current), current.power, current.monsters.length);
    const enemyEffect = enemyRow.nodes[0].enemy!;
    // 射程寬度:**打不到的那幾隻不能倒**,所以上限是「曾經進到射程內的隻數」,
    // 不是總隻數。跟 resolveEnemy 的 coveredUnits 是同一個數字——畫面倒幾隻、
    // 結算算幾隻,必須是同一份(CLAUDE.md:各寫一份是最難查的那種不一致)。
    const kills = Math.min(
      current.covered.size,
      ownKills + Math.floor(extraKills(enemyEffect, boostFor(current.heroWave, current.fired, fx, current.covered.size), ownKills)),
    );
    // 打得倒的是「覆蓋到的那幾隻裡最前面的 kills 隻」,所以要照覆蓋順序判斷,
    // 不能用索引大小——沒被覆蓋的那幾隻夾在中間的話,索引比較不成立。
    const isDown = (i: number) => current!.covered.has(i)
      && [...current!.covered].filter((k) => k < i).length < kills
      && current!.hitsOn[i] >= current!.hitsPerUnit;

    // --- 丟武器 ---
    // 打不倒的也照丟。丟到打得倒的都倒了就停手的話,剩下那段路上小怪一直衝過來、勇者卻站著
    // 不動,看起來像當掉;照丟才看得出「不是他不打,是打不動」。
    const inFlightOn = new Array(current.monsters.length).fill(0);
    for (const p of projectilesRef.current) inFlightOn[p.targetIndex] += 1;

    let targetIndex = -1;
    let remainingDoomedShots = 0;
    for (let i = 0; i < current.monsters.length; i++) {
      if (isDown(i)) continue;
      if (current.monsters[i].distance <= travelled) continue; // 已經越過勇者,不用再丟
      if (i < kills) remainingDoomedShots += Math.max(0, current.hitsPerUnit - current.hitsOn[i] - inFlightOn[i]);
      // 接戰距離由 laneRun 給(每一隻各自抖動),不是一個寫死的常數:
      // 寫死的話整波會在同一條水平線上倒下,而且舊值 260 等於「一進畫面就死」。
      const inEngageRange = current.monsters[i].distance - travelled <= engageRange(current.rowIndex, i);
      // **射程寬度**:打不到就不是目標(見 laneRun 的 FIRE_WIDTH)。
      // 進到接戰距離**而且**在射程寬度內的那一刻就記一次「覆蓋到了」——
      // 這一筆會夾住這一波的擊殺數,所以畫面上打不到的那幾隻,結算也一樣算漏掉。
      // 兩邊必須是同一份數字,不然會出現「明明沒打到卻算清掉了」。
      const inWidth = withinFireWidth(offsetRef.current, current.monsters[i].offset);
      if (inEngageRange && inWidth) current.covered.add(i);
      if (targetIndex < 0 && inEngageRange && inWidth) targetIndex = i;
    }

    if (targetIndex >= 0) {
      const lastDoomed = current.monsters[Math.max(0, kills - 1)];
      const msUntilLastKill = Math.max(0, ((lastDoomed.distance - travelled) / speed) * 1000);
      const base =
        remainingDoomedShots > 0 ? fireIntervalMs(msUntilLastKill, remainingDoomedShots) : MAX_FIRE_INTERVAL_MS;
      // 人越多丟越密。這是「人數變多」在戰鬥畫面上唯一看得出來的地方。
      const interval = base / volleyRate(stateRef.current.heroes);
      if (now - current.lastFireAt >= interval) {
        current.lastFireAt = now;
        projectileIdRef.current += 1;
        const id = projectileIdRef.current;
        setLastShotAt(now);
        setLastShotId(id);
        // 每一把從隊伍裡不同的人手上飛出去(依 id 散開),不是全部從同一個點噴出來。
        const spread = Math.min(0.09, 0.02 * Math.min(stateRef.current.heroes, 6));
        const fromOffset = clampOffset(offsetRef.current + ((id % 5) / 4 - 0.5) * 2 * spread);
        // 帶著幾個元素就輪流丟哪一個。這是元素在畫面上唯一的出口——
        // 沒帶元素的話武器就是原本的樣子,不會憑空多一層顏色。
        const mine = runSkillsRef.current.filter((s) => s.level > 0 && isElement(s.id));
        projectilesRef.current = [
          ...projectilesRef.current,
          {
            id,
            distance: travelled,
            fromDistance: travelled,
            fromOffset,
            toOffset: current.monsters[targetIndex].offset,
            targetIndex,
            element: mine.length > 0 ? mine[id % mine.length].id : undefined,
          },
        ];
      }
    }

    // --- 武器往前飛,飛到目標身上就算命中,挨滿 HITS_PER_MONSTER 下的(打得倒的那些)就倒 ---
    const newHits: HitNumber[] = [];
    if (projectilesRef.current.length > 0) {
      const step = ((speed + PROJECTILE_SPEED) * TICK_MS) / 1000;
      const flying: Projectile[] = [];
      for (const p of projectilesRef.current) {
        const moved = { ...p, distance: p.distance + step };
        const target = current.monsters[p.targetIndex];
        if (target && moved.distance >= target.distance) {
          current.hitsOn[p.targetIndex] += 1;
          current.hitCount += 1;
          // 火/雷/冰:命中的那一刻就發生(燒到旁邊、連鎖、凍住)。
          applyOnHit(current, p.targetIndex, now, fx);
          // 命中就跳一個傷害數字。是不是暴擊由「第幾排/第幾隻/第幾下」的雜湊決定,不是亂數——
          // 這個 tick 迴圈每 33ms 跑一次,用亂數的話同一下會一直重抽,數字會閃爍。
          // hitsOn 現在會有小數(燃燒是持續傷害),而雜湊要吃整數——
              // 不取整的話同一下的暴擊判定會隨著燒到哪個小數而閃爍。
          const ordinal = Math.floor(current.hitsOn[p.targetIndex]);
          const crit = isCritHit(current.rowIndex, p.targetIndex, ordinal);
          hitNumberIdRef.current += 1;
          newHits.push({
            id: hitNumberIdRef.current,
            value: hitDamage(totalAttack(stateRef.current), current.hitsPerUnit, crit),
            crit,
            offset: target.offset,
            distance: target.distance,
            bornAt: now,
          });
          continue; // 命中就收掉,不再畫
        }
        flying.push(moved);
      }
      projectilesRef.current = flying;
      setProjectiles(flying);
    }

    // --- 勇者波:敵人擲出的武器 ---
    //
    // 兩件事都在這裡:**丟**(輪到的人才丟,而且要先出現在畫面上)與**打中**(飛到你身上就扣人)。
    // 先前這一整段只存在於畫面層,所以武器永遠打不到人——傷害只在這一排結算的那一瞬間算,
    // 玩家看著武器穿過身體卻什麼都沒發生。
    if (current.heroWave) {
      // 還站著、而且**已經進入視野**的人才會丟。沒有這個條件的話,武器會從畫面外
      // 憑空出現在半空中——玩家看到的是「東西自己冒出來」,不是「那個人丟過來的」。
      const alive = current.monsters
        .filter((m) => !isDown(m.index) && m.distance > travelled && m.distance - travelled <= VISIBLE_AHEAD)
        .map((m) => m.index);
      const slot = Math.floor(now / THROWER_ROTATE_MS);
      const throwers = activeThrowers(alive, slot);
      if (throwers.length > 0 && now - enemyFireAtRef.current >= ENEMY_THROW_INTERVAL_MS) {
        enemyFireAtRef.current = now;
        const threw: Record<number, number> = {};
        for (const index of throwers) {
          const m = current.monsters[index];
          if (!m) continue;
          enemyShotIdRef.current += 1;
          enemyShotsRef.current = [
            ...enemyShotsRef.current,
            { id: enemyShotIdRef.current, distance: m.distance, offset: m.offset, variant: index },
          ];
          threw[index] = now;
        }
        // 換成投擲那一格。只記剛出手的那幾隻,其他人維持待機/走路的兩格循環。
        if (Object.keys(threw).length > 0) setEnemyThrowAt((prev) => ({ ...prev, ...threw }));
      }
    }
    if (enemyShotsRef.current.length > 0) {
      // 武器往玩家的方向飛(絕對距離遞減),而玩家同時往前跑,所以接近速度是兩者相加。
      const step = ((speed + ENEMY_SHOT_SPEED) * TICK_MS) / 1000;
      const stillFlying: EnemyShot[] = [];
      for (const shot of enemyShotsRef.current) {
        const moved = { ...shot, distance: shot.distance - step };
        if (moved.distance > travelled) { stillFlying.push(moved); continue; }
        // 飛到你身上了:站在這條線上就會被砸中。一波最多扣一次(見 hazardHitRowRef)。
        const inLine = Math.abs(offsetRef.current - shot.offset) <= HAZARD_WIDTH / 2;
        if (inLine) {
          // **每一下都算,一波不設上限**:一把武器換一個人。
          if (hazardHitsRef.current.row !== current.rowIndex) hazardHitsRef.current = { row: current.rowIndex, hits: 0 };
          hazardHitsRef.current.hits += 1;
          setLastHazardAt(now);
          setState((prev) => {
            if (prev.phase !== 'running') return prev;
            const hit = HAZARD_LOSS_HEROES;
            const heroes = Math.max(0, prev.heroes - hit);
            lostSoFarRef.current += hit;
            feedbackKeyRef.current += 1;
            setFeedback({
              key: feedbackKeyRef.current,
              message: `被武器砸中 -${hit} 人`,
              heroDelta: -hit,
              attackDelta: 0,
            });
            return heroes <= 0 ? { ...prev, heroes: 0, phase: 'dead' } : { ...prev, heroes };
          });
        }
      }
      enemyShotsRef.current = stillFlying;
      setEnemyShots(stillFlying);
    }

    // 過期的數字丟掉。沒有新命中而且也沒有要過期的就不要 setState——這個迴圈每 33ms 跑一次,
    // 每次都換一個新陣列的話畫面每格都重畫一次,手機上會開始掉幀。
    const live = hitNumbersRef.current.filter((h) => now - h.bornAt < HIT_NUMBER_MS);
    if (newHits.length > 0 || live.length !== hitNumbersRef.current.length) {
      hitNumbersRef.current = [...live, ...newHits];
      setHitNumbers(hitNumbersRef.current);
    }

    // 過期的元素演出丟掉。跟傷害數字同一個道理:每個 tick 都換一個新陣列的話畫面每格都重畫。
    const liveFx = elementEventsRef.current.filter((e) => now - e.bornAt < ELEMENT_FX_MS[e.kind]);
    if (liveFx.length !== elementEventsRef.current.length) elementEventsRef.current = liveFx;
    if (elementEvents !== elementEventsRef.current) setElementEvents(elementEventsRef.current);

    const down = current.monsters.map((m) => isDown(m.index));
    const frozen = current.monsters.map((m) => current!.frozenUntil[m.index] > now);
    const frozenUntil = current.monsters.map((m) => current!.frozenUntil[m.index]);
    setWave((prev) =>
      prev !== null
      && prev.rowIndex === current!.rowIndex
      && sameFlags(prev.down, down)
      && sameFlags(prev.frozenUntil.map((t) => t > now), frozen)
      && prev.hitsOn.every((h, i) => h === current!.hitsOn[i])
        ? prev
        : {
            rowIndex: current!.rowIndex,
            species: current!.species,
            boss: current!.boss,
            elite: current!.elite,
            heroWave: current!.heroWave,
            element: current!.element,
            hitsOn: [...current!.hitsOn],
            hitsPerUnit: current!.hitsPerUnit,
            monsters: current!.monsters,
            down,
            frozenUntil,
            burningUntil: current!.monsters.map((m) => current!.burningUntil[m.index]),
            slow: fx.slow,
          },
    );
  }

  /** 選了一個。還有欠的就繼續開下一個選單,欠完了才放行。 */
  const chooseRunSkill = useCallback((choice: RunSkillState) => {
    setRunSkills((prev) => {
      const next = learnRunSkill(prev, choice);
      // 效果在選中的當下就結算進 RunState,不做「每次讀取再乘一次」。
      // 乘在讀取端的話,閘門的加減會跟技能的倍率互相糾纏(先乘還是先加會得到不同答案),
      // 而且 totalAttack 在畫面、戰鬥演出、結算三個地方都會被讀,任何一處漏乘就對不起來。
      // 算式走 applyRunSkillPick(共用),敵人那邊的理想路線用的是同一支。
      setState((st) => ({ ...st, ...applyRunSkillPick(prev, choice, st) }));
      setPendingPicks((left) => {
        const remaining = left - 1;
        if (remaining > 0) {
          setSkillOffers(runSkillOffersAt(next, seed, skillOrdinalRef.current, activeSkillCountForStage(stage)));
          skillOrdinalRef.current += 1;
        } else {
          setSkillOffers([]);
        }
        return Math.max(0, remaining);
      });
      return next;
    });
  }, []);

  // 跑過某一排就結算那一排
  useEffect(() => {
    if (state.phase !== 'running' || paused) return;
    const due = rows.find((r) => !passedRef.current.has(r.index) && distance >= r.distance);
    if (due) {
      passedRef.current.add(due.index);
      setState((prev) => {
        // 踩到哪一格是「通過這一排的當下」才決定的,所以直接讀 ref 換算,不用 prev.lane。
        const landed = { ...prev, lane: laneFromOffset(offsetRef.current) };
        // 帶著連續位置去結算:站對邊還不夠,得真的踩在閘門上(見 laneRun 的 hitsGate)。
        // 敵人排:先看每一款主動技能的冷卻好了沒,好了的就把效果併進這一波的結算。
        // 敵人排:把跑圖途中累積出來的那一份加成交給結算。
        //
        // **主動技能已經在跑圖途中(fireActives)觸發過了,這裡不再跑一次冷卻。**
        // 冷卻改成秒之後,「觸發」發生在時間軸上而不是排的邊界上;這裡只是把
        // 「這一波實際發生了什麼」帶進結算,跟畫面上小怪倒下的那個數字是同一份
        // (兩邊都走 boostFor,見上面的說明)。
        let boost: WaveBoost = {};
        if (due.nodes[0]?.kind === 'enemy') {
          const waveElement = due.nodes[0].enemy?.element;
          // 相剋是**逐元素**的:結算的時候就把這一波的屬性交給 runSkillEffects,
          // 剋中的那個元素放大、被剋的那個削弱,其他元素與主動技能一律不動。
          const fx = runSkillEffects(runSkills, waveElement, bookLevel, collection);
          const current = waveRef.current;
          boost = current !== null && current.rowIndex === due.index
            ? boostFor(current.heroWave, current.fired, fx, current.covered.size)
            : boostFor(due.nodes[0].enemy?.heroWave === true, NO_FIRED, fx);
          if (runSkills.some((s) => s.level > 0 && ELEMENT_COUNTERS[s.id] === waveElement)) {
            setLastStrike({ at: Date.now(), ids: [], names: ['剋'], kills: 0 });
          }
        }
        const r = resolveRow(landed, due, offsetRef.current, boost);
        // 記帳:失去的人累加起來給木・再生當上限;復活用掉就記起來(一場一次)。
        if (r.heroDelta < 0) lostSoFarRef.current += -r.heroDelta;
        feedbackKeyRef.current += 1;
        setFeedback({
          key: feedbackKeyRef.current,
          message: r.message,
          heroDelta: r.heroDelta,
          attackDelta: r.attackDelta,
        });
        return r.state;
      });
      // 打完一波就給技能。放在結算之後:玩家先看到這一波的結果,再決定要補什麼。
      if (isEnemyRowIndex(due.index, stage)) {
        const waveIndex = clearedWavesRef.current;
        clearedWavesRef.current += 1;
        const picks = runSkillPicksForWave(waveIndex, totalWaves);
        if (picks > 0) {
          const offers = runSkillOffersAt(runSkills, seed, skillOrdinalRef.current, activeSkillCountForStage(stage));
          skillOrdinalRef.current += 1;
          // 全部滿級就沒東西可選,直接跳過,不要卡一個空面板。
          if (offers.length > 0) {
            setPendingPicks(picks);
            setSkillOffers(offers);
          }
        }
      }
      return;
    }
    if (distance >= runLength(stage)) {
      setState((prev) => (prev.phase === 'running' ? { ...prev, phase: 'cleared' } : prev));
    }
  }, [distance, rows, state.phase, paused, stage, totalWaves, runSkills]);

  // 高亮用的跑道跟著角色位置走(結算不看它,看 offsetRef)。
  useEffect(() => {
    const lane = laneFromOffset(heroOffset);
    setState((prev) => (prev.lane === lane ? prev : { ...prev, lane }));
  }, [heroOffset]);

  const dragTo = useCallback((offset: number) => {
    const next = clampOffset(offset);
    offsetRef.current = next;
    targetRef.current = next;
    setHeroOffset(next);
  }, []);

  const steer = useCallback((direction: 'left' | 'right') => {
    targetRef.current = laneCenterOffset(moveLane(laneFromOffset(targetRef.current), direction));
  }, []);

  const upcoming = rows.filter((r) => !passedRef.current.has(r.index));

  return {
    rows,
    rocks,
    state,
    distance,
    heroOffset,
    upcoming,
    wave,
    projectiles,
    enemyShots,
    lastHazardAt,
    enemyThrowAt,
    hitNumbers,
    lastShotAt,
    lastShotId,
    runSkills,
    skillOffers,
    pendingPicks,
    upcomingElements: rows
      .filter((r) => !passedRef.current.has(r.index) && r.nodes[0]?.kind === 'enemy')
      .slice(0, 3)
      .map((r) => r.nodes[0].enemy!.element)
      .filter((e): e is RunSkillId => e !== undefined),
    chooseRunSkill,
    feedback,
    speed,
    dashing,
    lastStrike,
    elementEvents,
    // 冷卻的倒數在**畫的時候**才算(readyAt 是 ref,不觸發重畫)。
    // 跑圖每個 tick 都會因為 distance 變動而重畫,所以倒數自然會走,不必再開一個計時器。
    carriedSkills: runSkills.map((s) => {
      const cooldown = hasCooldown(s.id) ? skillCooldownSeconds(s.id, s.level) : 0;
      const at = readyAtRef.current[s.id] ?? 0;
      return {
        id: s.id,
        name: runSkillSpec(s.id).name,
        level: s.level,
        cooldown,
        ready: cooldown > 0 ? Math.max(0, (at - Date.now()) / 1000) : 0,
      };
    }),
    dragTo,
    steer,
    stage,
    // 用「已清完幾波 + 1」算,而不是另外存一份狀態:多一份就會有不同步的機會,
    // 而這個數字每個 tick 都要正確(它是玩家判斷「還剩多久」的唯一依據)。
    waveNumber: Math.min(totalWaves, clearedWavesRef.current + 1),
    totalWaves,
  };
}

export type { Lane };
