// 既有素材(assets/sprites 底下的手繪像素圖)對應表。
//
// 為什麼放在 components/ 而不是 game/:require() 進來的是 RN 的圖片資源,game/ 必須能在 Node
// 單獨跑(CLAUDE.md 的分層鐵律),不能碰到任何 RN API。所以 game/ 只吐 id,由這一層換成圖。
//
// require 的路徑一定要是字面字串,Metro 才打包得到——不能用樣板字串組出來,所以下面全部展開寫。
import type { ImageSourcePropType } from 'react-native';

import { MONSTER_ANIM, JOB_ANIM, type AnimArt } from './animFrames';

/**
 * 主角:史萊姆。兩張是同一隻的「待機」與「往上噴出尖刺」,不是兩個角色。
 *
 * 來源是一張 686x930 的 GIF(3 格,第 0 格與第 2 格完全相同,所以這裡只留 2 張)。
 * 轉檔時做了一件必要的事:GIF 的背景是**實心黑、不是透明**,直接用會在畫面上變成一個
 * 黑色方塊(面板底是 #1d1d26,不是純黑,框會看得一清二楚)。但整片去黑會把眼睛也挖掉——
 * 眼睛就是黑的(2638 個像素)。所以是「從邊界做連通填充」只去掉背景那一片,內部的黑保留。
 */
export const HERO_FRAMES: ImageSourcePropType[] = [
  require('../assets/sprites/hero/slime_idle.png'),
  require('../assets/sprites/hero/slime_spike.png'),
];

/** 主角圖的畫布長寬比(686x930)。 */
export const HERO_ASPECT = 686 / 930;

/**
 * 待機時「身體」佔畫布高度的比例。
 *
 * 為什麼需要這個:噴刺那一格會用到整個畫布高度,待機那一格的身體只佔下面 47%。
 * 兩格必須共用同一個畫布才對得齊(不然噴刺的瞬間整隻會跳一下),所以畫面上的框
 * 一定比身體高一倍多。畫面層要的是「身體看起來多大」,拿這個比例去換算框的高度,
 * 不要直接把想要的身高填進框高——那樣畫出來的史萊姆會只有預期的一半大。
 * 框是靠下對齊的,所以多出來的上半部就是噴刺的空間,身體位置不受影響。
 */
export const HERO_BODY_RATIO = 0.47;

/** 想要的身體高度 → 該給的框高。進化型的身體佔比不同,所以比例可以傳進來。 */
export function heroBoxHeight(bodyHeight: number, bodyRatio: number = HERO_BODY_RATIO): number {
  return Math.round(bodyHeight / bodyRatio);
}

/**
 * 主角的動畫:大部分時間待機,偶爾噴一次刺。
 * 放在這裡而不是各畫面自己寫,是因為主介面與跑道畫面本來各有一份一模一樣的定義,
 * 改動畫要記得改兩個地方——那種重複遲早會不同步。
 */
export const HERO_SEQUENCE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
export const HERO_FRAME_MS = 170;

/**
 * 進化型:史萊姆國王。隊伍超過 20 隻就變成這個造型。
 *
 * 素材是一張 1536x1024 的兩格圖(待機/噴刺),跟基本型一樣是實心黑背景,同樣做邊界連通去背。
 * 額外處理了一件事:切開之後兩格的**身體並沒有對齊**(重心差 103px),直接播會左右跳一下。
 * 所以是先算「畫布下方 35%(身體與披風)的不透明重心」,再把兩格各自平移到畫布中央對齊——
 * 用整張圖的 bbox 對齊會被噴刺與飄浮的小點帶偏,那些東西本來就不對稱。
 */
export const KING_FRAMES: ImageSourcePropType[] = [
  require('../assets/sprites/hero/king_idle.png'),
  require('../assets/sprites/hero/king_spike.png'),
];
export const KING_ASPECT = 768 / 1024;
export const KING_BODY_RATIO = 0.51;

/**
 * 幾隻史萊姆合體成一隻國王。
 *
 * 這是**合體**不是換裝:10 隻不是「10 隻都戴上王冠」,而是消失變成 1 隻國王。
 * 所以畫面上的隻數 = 國王 floor(n/10) 隻 + 剩下的 n%10 隻小史萊姆,
 * 一路長上去會看到小史萊姆湊滿 10 隻就少一批、多一個國王。
 *
 * 戰力完全不受影響——合體只是畫法,state.heroes 還是原本的數字。
 */
export const SLIMES_PER_KING = 10;
/** 國王比基本型大多少。牠代表 10 隻,要一眼看得出份量。 */
export const KING_SCALE = 1.35;

/**
 * 這個人數在畫面上該畫哪些東西(由前往後)。國王排前面,湊不滿一隻國王的餘數排後面。
 * 超過 maxDrawn 就截斷——真的畫 154 個會把跑道塞滿,而且每個 tick 要重排 154 個絕對定位的圖。
 */
export function squadForms(heroes: number, maxDrawn: number): HeroForm[] {
  const kings = Math.floor(Math.max(0, heroes) / SLIMES_PER_KING);
  const rest = Math.max(0, heroes) % SLIMES_PER_KING;
  const out: HeroForm[] = [];
  for (let i = 0; i < kings && out.length < maxDrawn; i++) out.push(heroForm(true));
  for (let i = 0; i < rest && out.length < maxDrawn; i++) out.push(heroForm(false));
  // 一隻都沒有的話至少畫一隻,不然畫面上會空掉
  if (out.length === 0) out.push(heroForm(false));
  return out;
}

export interface HeroForm {
  frames: ImageSourcePropType[];
  aspect: number;
  bodyRatio: number;
  scale: number;
  king: boolean;
}

/**
 * 一隻的造型資料。**純外觀,不動任何數值**——合體不會讓你變強,
 * 變強的是讓你湊到 10 隻的那些閘門。把戰力綁在造型上會讓 laneRun 的平衡整條失效。
 */
export function heroForm(king: boolean): HeroForm {
  return king
    ? { frames: KING_FRAMES, aspect: KING_ASPECT, bodyRatio: KING_BODY_RATIO, scale: KING_SCALE, king: true }
    : { frames: HERO_FRAMES, aspect: HERO_ASPECT, bodyRatio: HERO_BODY_RATIO, scale: 1, king: false };
}

/**
 * 職業立繪的長寬比。只有轉職選擇畫面在用(那裡是在介紹職業,所以還是畫人)。
 * 刻意取「最寬的那一張」(職業立繪 458x746):所有立繪共用同一個框 + resizeMode contain,
 * 框比圖窄的話寬的那幾張會被縮到變矮一截。框取最寬的,窄的圖置中留白,高度就都一致了。
 */
export const JOB_ART_ASPECT = 458 / 746;

/** 勇者擲出去的武器。沿用既有的傳承之劍,不另外畫特效圖。 */
export const PROJECTILE_ART: ImageSourcePropType = require('../assets/sprites/items/legacy_sword.png');

/**
 * 還沒轉職時扔出來的東西:整套學生裝備,不是只有劍。
 *
 * 史萊姆沒有手,「揮劍」本來就說不通;牠是把身上的東西一件一件吐出去砸人,所以扔披風、
 * 扔褲子、扔書都合理,而且比清一色的劍好看得多——一波打下來畫面上飛的是九種不同的圖。
 * 之後轉職了才換成該職業的武器(見 weaponArt)。
 */
export const STUDENT_PROJECTILES: ImageSourcePropType[] = [
  require('../assets/sprites/items/legacy_sword.png'),
  require('../assets/sprites/items/student_offhand.png'),
  require('../assets/sprites/items/student_headwear.png'),
  require('../assets/sprites/items/student_top.png'),
  require('../assets/sprites/items/student_bottom.png'),
  require('../assets/sprites/items/student_back.png'),
  require('../assets/sprites/items/student_belt.png'),
  require('../assets/sprites/items/student_gloves.png'),
  require('../assets/sprites/items/student_face.png'),
];

/**
 * 主介面下方分頁列的圖示。沿用姊妹作既有的 icon_tab_*.png,不另外畫。
 *
 * CLAUDE.md 的圖示鐵則:一律不用 emoji,連「先佔位之後再換」都不行。這些是既有的像素素材,
 * 風格與調色盤本來就對得上,所以分頁列直接用它們,不需要臨時的替代符號。
 */
export interface TabIcon {
  id: string;
  label: string;
  art: ImageSourcePropType;
}

export const TAB_ICONS: TabIcon[] = [
  { id: 'equipment', label: '裝備', art: require('../assets/sprites/ui/icon_tab_equipment.png') },
  { id: 'backpack', label: '背包', art: require('../assets/sprites/ui/icon_tab_backpack.png') },
  { id: 'skill', label: '技能', art: require('../assets/sprites/ui/icon_tab_skill.png') },
  { id: 'job', label: '轉職', art: require('../assets/sprites/ui/icon_tab_job.png') },
  { id: 'pet', label: '寵物', art: require('../assets/sprites/ui/icon_tab_pet.png') },
  { id: 'dungeon', label: '副本', art: require('../assets/sprites/ui/icon_tab_dungeon.png') },
  { id: 'shop', label: '商店', art: require('../assets/sprites/ui/icon_tab_shop.png') },
  { id: 'workshop', label: '工坊', art: require('../assets/sprites/ui/icon_tab_workshop.png') },
  { id: 'achievement', label: '成就', art: require('../assets/sprites/ui/icon_tab_achievement.png') },
  { id: 'ascension', label: '轉生', art: require('../assets/sprites/ui/icon_tab_ascension.png') },
];

/**
 * 路上的石頭。沿用材料圖的 tier0 強化石——它是整套裡唯一的灰色岩塊,
 * 其餘階級都上了顏色(藍/紫/金),放在跑道上會被誤認成可以吃的道具。
 *
 * 沒有另外畫一張:CLAUDE.md 的美術鐵則是一律用 assets/sprites 的既有 PNG,
 * 而這張的像素風格與莫蘭迪暗色調本來就是同一套資產。
 */
export const ROCK_ART: ImageSourcePropType = require('../assets/sprites/materials/enhance_stone_tier0.png');

/** 鎖頭。分頁全部未開放,疊在圖示上表示「還不能點」。 */
export const LOCK_ICON: ImageSourcePropType = require('../assets/sprites/ui/icon_lock.png');
/**
 * 禮物。任務橫幅與任務面板上的獎勵標記。
 *
 * 圖示鐵則:畫面上任何位置都不用 emoji(見 CLAUDE.md)。ui/ 底下本來就有這張,
 * 而「有東西可以領」是任務系統唯一需要一眼認出來的狀態。
 */
export const QUEST_ICON: ImageSourcePropType = require('../assets/sprites/ui/icon_gift.png');

/**
 * 閘門的卷軸外框:上軸 / 紙身 / 下軸三片。
 *
 * **產生檔**(`scripts/make-gate-scroll.py`),來源是 `ui/frames/easteregg` 那組框的
 * 上下邊——它本來就是一段卷軸(金色軸桿 + 羊皮紙),只是帶著深色留白而且是 RGB 沒有 alpha,
 * 直接貼到跑道上會蓋出一條不透明的暗帶。切成三片之後**只有紙身會被拉長**,
 * 軸桿的高度固定,金屬高光才不會糊掉(跟 PixelFrame 的九宮格同一個道理)。
 *
 * 為什麼不用 `PixelFrame`:那一個一格要畫八張圖(四角四邊),而閘門一排兩個、
 * 畫面上同時有好幾排——一排十六張。卷軸只要三張,一排六張。
 */
export const GATE_SCROLL = {
  top: require('../assets/sprites/ui/frames/gate/scroll_top.png') as ImageSourcePropType,
  body: require('../assets/sprites/ui/frames/gate/scroll_body.png') as ImageSourcePropType,
  bottom: require('../assets/sprites/ui/frames/gate/scroll_bottom.png') as ImageSourcePropType,
};
/** 技能書。技能書副本的圖示,也是狀態列上技能書等級的圖示。 */
export const BOOK_ICON: ImageSourcePropType = require('../assets/sprites/ui/icon_skillbook.png');
/** 金幣。主介面顯示身上有多少錢。 */
export const COIN_ICON: ImageSourcePropType = require('../assets/sprites/ui/icon_coin.png');
/**
 * 齒輪。主介面右上角與跑圖中的設定鈕都用它。
 *
 * 註:程式碼裡曾經有兩處註解寫「ui/ 沒有齒輪圖示,所以用文字『設定』頂替」——
 * 那是找漏了,`icon_gear.png` 一直都在。圖示鐵則沒有被違反過,只是白寫了兩個文字鈕。
 */
export const GEAR_ICON: ImageSourcePropType = require('../assets/sprites/ui/icon_gear.png');

// 12 種身體原型,對應 game/monsters.ts 的 ARCHETYPE_CATALOG.key。怪物 id 是 `${archetype}-${slot}`,
// slot(強度稱號)共用同一張原型圖:一副骨架、多種強度。
const MONSTER_ART: Record<string, ImageSourcePropType> = {
  blob: require('../assets/sprites/monsters/ai/blob_open.png'),
  flying: require('../assets/sprites/monsters/ai/flying_open.png'),
  biped: require('../assets/sprites/monsters/ai/biped_open.png'),
  fungal: require('../assets/sprites/monsters/ai/fungal_open.png'),
  undead: require('../assets/sprites/monsters/ai/undead_open.png'),
  construct: require('../assets/sprites/monsters/ai/construct_open.png'),
  dragon: require('../assets/sprites/monsters/ai/dragon_open.png'),
  quadruped: require('../assets/sprites/monsters/ai/quadruped_open.png'),
  serpent: require('../assets/sprites/monsters/ai/serpent_open.png'),
  insect: require('../assets/sprites/monsters/ai/insect_open.png'),
  aquatic: require('../assets/sprites/monsters/ai/aquatic_open.png'),
  elemental: require('../assets/sprites/monsters/ai/elemental_open.png'),
  stage_boss_tier1: require('../assets/sprites/monsters/ai/boss_tier1_open.png'),
  stage_boss_tier2: require('../assets/sprites/monsters/ai/boss_tier2_open.png'),
  stage_boss_tier3: require('../assets/sprites/monsters/ai/boss_tier3_open.png'),
  stage_boss_tier4: require('../assets/sprites/monsters/ai/boss_tier4_open.png'),
  stage_boss_tier5: require('../assets/sprites/monsters/ai/boss_tier5_open.png'),
  final_boss: require('../assets/sprites/monsters/ai/boss_final_open.png'),
};

/** 拿不到就退回史萊姆:少一張圖不該讓整場跑圖開天窗。 */
export function monsterArt(monsterId: string): ImageSourcePropType {
  const archetype = monsterId.includes('-') ? monsterId.slice(0, monsterId.lastIndexOf('-')) : monsterId;
  return MONSTER_ART[archetype] ?? MONSTER_ART.blob;
}

// ---- 敵人的兩格動畫 ----
//
// 素材本來就有 `_open`(待機)與 `_middle`(動作)兩張,但**兩張的畫布大小不一樣**,
// 直接輪播會讓怪在原地抽搐。對齊過的版本由 scripts/align-frames.py 產生
// (重心對齊、底邊對齊、同一張畫布),連同畫框要用的比例一起寫進 animFrames.ts。
//
// 這裡只做「查得到就用動畫、查不到就退回單張」——少一組動畫不該讓那隻怪消失。

// 魔王在 game/monsters.ts 叫 stage_boss_tierN / final_boss,素材檔卻叫 boss_tierN / boss_final。
// 這個落差本來被 MONSTER_ART 用兩組 key 各寫一次蓋過去了,動畫這邊改成明確轉換——
// 少了它魔王會查不到動畫,而且症狀只是「魔王不會動」,很容易被當成沒問題。
const BOSS_ANIM_KEY: Record<string, string> = {
  stage_boss_tier1: 'boss_tier1',
  stage_boss_tier2: 'boss_tier2',
  stage_boss_tier3: 'boss_tier3',
  stage_boss_tier4: 'boss_tier4',
  stage_boss_tier5: 'boss_tier5',
  final_boss: 'boss_final',
};

/** 怪物/魔王的兩格動畫。查不到就回 null,呼叫端退回 monsterArt 的單張。 */
export function monsterAnim(monsterId: string): AnimArt | null {
  const archetype = monsterId.includes('-') ? monsterId.slice(0, monsterId.lastIndexOf('-')) : monsterId;
  return MONSTER_ANIM[BOSS_ANIM_KEY[archetype] ?? archetype] ?? null;
}

// 職業立繪分四個資料夾、三種命名(見 JOB_ART),動畫那邊照原樣分組,所以要同一套對照。
function jobAnimKey(archetype: string, branch: string, tier: number): string {
  const t = Math.min(4, Math.max(1, tier));
  if (t === 1) return `jobs/${archetype}`;
  if (t === 2) return `jobs2/${archetype}_${branch}`;
  return `jobs${t}/${archetype}_${branch}`;
}

/** 勇者波敵人的兩格動畫。 */
export function jobHeroAnim(archetype: string | null, branch: string, tier: number): AnimArt | null {
  if (archetype === null) return null;
  return JOB_ANIM[jobAnimKey(archetype, branch, tier)] ?? null;
}

/**
 * 一組動畫在這一刻要播第幾格。
 *
 * `phase` 讓每一隻各自錯開——同一波十幾隻同時換格的話,整群像同一個貼圖在閃,
 * 而不是一群各走各的怪(跟隊伍那邊「各自晃動」是同一個理由)。
 */
export const ENEMY_FRAME_MS = 260;
export function animFrameIndex(now: number, phase: number): number {
  return Math.floor(now / ENEMY_FRAME_MS + phase) % 2;
}

// ---- 八元素的顏色 ----
//
// **顏色是屬性在畫面上的載體。** 早期版本把屬性掛在「排號」上,畫面完全看不出來——
// 三隻深海魚衝過來,面板卻說這一波是火。改用顏色之後,屬性直接長在怪身上:
// 一波共用一個屬性(見 laneRun 的 element),所以整群同色,一眼就分得出這波是什麼。
//
// 這也是**不必把屬性綁死在原型上**的原因:綁原型的話 12 種造型配 8 種屬性除不盡,
// 有 4 個屬性會多一倍的出現機率,剋它的那幾款技能就永遠比較好——正是兩個閉環要避免的。
// 顏色跟造型脫鉤,屬性才能維持精確平均,而混三種造型的畫面也留得住。
//
// 色相都壓在莫蘭迪暗色調裡(飽和度不高),疊在像素圖上才不會蓋掉造型。
export const ELEMENT_COLORS: Record<string, string> = {
  fire: '#c8674a',
  metal: '#8f9bab',
  thunder: '#c9a94e',
  ice: '#6fa8bd',
  wood: '#6f9e63',
  earth: '#a8865e',
};

/** 屬性的單字標籤(面板、提示列都用這個,不用 emoji)。 */
export const ELEMENT_LABELS: Record<string, string> = {
  fire: '火', metal: '金', thunder: '雷', ice: '冰',
  wood: '木', earth: '土',
};

export function elementColor(id?: string): string | undefined {
  return id ? ELEMENT_COLORS[id] : undefined;
}
export function elementLabel(id?: string): string {
  return (id && ELEMENT_LABELS[id]) ?? '?';
}

// ---- 職業 ----
// 6 條路線 x A/B 分支 x 5 階,對應 game/laneJobs.ts。素材分四個資料夾,命名規則各不相同
// (jobs 沒有分支、jobs2 是 _A/_B、jobs3 與 jobs4 多了 _open 後綴),所以只能一條一條列。
// 第 5 階沒有獨立美術,沿用第 4 階——職稱與數值仍然不同,只有立繪重複。
const JOB_ART: Record<string, ImageSourcePropType> = {
  'physicalMelee-A-1': require('../assets/sprites/hero/jobs/physicalMelee.png'),
  'physicalMelee-B-1': require('../assets/sprites/hero/jobs/physicalMelee.png'),
  'physicalRanged-A-1': require('../assets/sprites/hero/jobs/physicalRanged.png'),
  'physicalRanged-B-1': require('../assets/sprites/hero/jobs/physicalRanged.png'),
  'physicalSupport-A-1': require('../assets/sprites/hero/jobs/physicalSupport.png'),
  'physicalSupport-B-1': require('../assets/sprites/hero/jobs/physicalSupport.png'),
  'magicMelee-A-1': require('../assets/sprites/hero/jobs/magicMelee.png'),
  'magicMelee-B-1': require('../assets/sprites/hero/jobs/magicMelee.png'),
  'magicRanged-A-1': require('../assets/sprites/hero/jobs/magicRanged.png'),
  'magicRanged-B-1': require('../assets/sprites/hero/jobs/magicRanged.png'),
  'magicSupport-A-1': require('../assets/sprites/hero/jobs/magicSupport.png'),
  'magicSupport-B-1': require('../assets/sprites/hero/jobs/magicSupport.png'),
  'physicalMelee-A-2': require('../assets/sprites/hero/jobs2/physicalMelee_A.png'),
  'physicalMelee-B-2': require('../assets/sprites/hero/jobs2/physicalMelee_B.png'),
  'physicalRanged-A-2': require('../assets/sprites/hero/jobs2/physicalRanged_A.png'),
  'physicalRanged-B-2': require('../assets/sprites/hero/jobs2/physicalRanged_B.png'),
  'physicalSupport-A-2': require('../assets/sprites/hero/jobs2/physicalSupport_A.png'),
  'physicalSupport-B-2': require('../assets/sprites/hero/jobs2/physicalSupport_B.png'),
  'magicMelee-A-2': require('../assets/sprites/hero/jobs2/magicMelee_A.png'),
  'magicMelee-B-2': require('../assets/sprites/hero/jobs2/magicMelee_B.png'),
  'magicRanged-A-2': require('../assets/sprites/hero/jobs2/magicRanged_A.png'),
  'magicRanged-B-2': require('../assets/sprites/hero/jobs2/magicRanged_B.png'),
  'magicSupport-A-2': require('../assets/sprites/hero/jobs2/magicSupport_A.png'),
  'magicSupport-B-2': require('../assets/sprites/hero/jobs2/magicSupport_B.png'),
  'physicalMelee-A-3': require('../assets/sprites/hero/jobs3/physicalMelee_A_open.png'),
  'physicalMelee-B-3': require('../assets/sprites/hero/jobs3/physicalMelee_B_open.png'),
  'physicalRanged-A-3': require('../assets/sprites/hero/jobs3/physicalRanged_A_open.png'),
  'physicalRanged-B-3': require('../assets/sprites/hero/jobs3/physicalRanged_B_open.png'),
  'physicalSupport-A-3': require('../assets/sprites/hero/jobs3/physicalSupport_A_open.png'),
  'physicalSupport-B-3': require('../assets/sprites/hero/jobs3/physicalSupport_B_open.png'),
  'magicMelee-A-3': require('../assets/sprites/hero/jobs3/magicMelee_A_open.png'),
  'magicMelee-B-3': require('../assets/sprites/hero/jobs3/magicMelee_B_open.png'),
  'magicRanged-A-3': require('../assets/sprites/hero/jobs3/magicRanged_A_open.png'),
  'magicRanged-B-3': require('../assets/sprites/hero/jobs3/magicRanged_B_open.png'),
  'magicSupport-A-3': require('../assets/sprites/hero/jobs3/magicSupport_A_open.png'),
  'magicSupport-B-3': require('../assets/sprites/hero/jobs3/magicSupport_B_open.png'),
  'physicalMelee-A-4': require('../assets/sprites/hero/jobs4/physicalMelee_A_open.png'),
  'physicalMelee-B-4': require('../assets/sprites/hero/jobs4/physicalMelee_B_open.png'),
  'physicalRanged-A-4': require('../assets/sprites/hero/jobs4/physicalRanged_A_open.png'),
  'physicalRanged-B-4': require('../assets/sprites/hero/jobs4/physicalRanged_B_open.png'),
  'physicalSupport-A-4': require('../assets/sprites/hero/jobs4/physicalSupport_A_open.png'),
  'physicalSupport-B-4': require('../assets/sprites/hero/jobs4/physicalSupport_B_open.png'),
  'magicMelee-A-4': require('../assets/sprites/hero/jobs4/magicMelee_A_open.png'),
  'magicMelee-B-4': require('../assets/sprites/hero/jobs4/magicMelee_B_open.png'),
  'magicRanged-A-4': require('../assets/sprites/hero/jobs4/magicRanged_A_open.png'),
  'magicRanged-B-4': require('../assets/sprites/hero/jobs4/magicRanged_B_open.png'),
  'magicSupport-A-4': require('../assets/sprites/hero/jobs4/magicSupport_A_open.png'),
  'magicSupport-B-4': require('../assets/sprites/hero/jobs4/magicSupport_B_open.png'),
  'physicalMelee-A-5': require('../assets/sprites/hero/jobs4/physicalMelee_A_open.png'),
  'physicalMelee-B-5': require('../assets/sprites/hero/jobs4/physicalMelee_B_open.png'),
  'physicalRanged-A-5': require('../assets/sprites/hero/jobs4/physicalRanged_A_open.png'),
  'physicalRanged-B-5': require('../assets/sprites/hero/jobs4/physicalRanged_B_open.png'),
  'physicalSupport-A-5': require('../assets/sprites/hero/jobs4/physicalSupport_A_open.png'),
  'physicalSupport-B-5': require('../assets/sprites/hero/jobs4/physicalSupport_B_open.png'),
  'magicMelee-A-5': require('../assets/sprites/hero/jobs4/magicMelee_A_open.png'),
  'magicMelee-B-5': require('../assets/sprites/hero/jobs4/magicMelee_B_open.png'),
  'magicRanged-A-5': require('../assets/sprites/hero/jobs4/magicRanged_A_open.png'),
  'magicRanged-B-5': require('../assets/sprites/hero/jobs4/magicRanged_B_open.png'),
  'magicSupport-A-5': require('../assets/sprites/hero/jobs4/magicSupport_A_open.png'),
  'magicSupport-B-5': require('../assets/sprites/hero/jobs4/magicSupport_B_open.png'),
};

/** 職業立繪。還沒轉職(null)就是學生。 */
export function jobHeroArt(archetype: string | null, branch: string, tier: number): ImageSourcePropType {
  if (archetype === null) return HERO_FRAMES[0];
  return JOB_ART[`${archetype}-${branch}-${tier}`] ?? HERO_FRAMES[0];
}

// ---- 武器 ----
// 裝備等級 1~5 對應各路線的 t1~t5 單手武器。換裝備閘門吃下去之後手上的武器真的會換一把,
// 「傷害變高」不是只有數字動,畫面上看得到。還沒轉職的學生沿用傳承之劍。
const WEAPON_ART: Record<string, ImageSourcePropType> = {
  'physicalMelee-1': require('../assets/sprites/items/physicalMelee/physicalMelee_t1_1h.png'),
  'physicalMelee-2': require('../assets/sprites/items/physicalMelee/physicalMelee_t2_1h.png'),
  'physicalMelee-3': require('../assets/sprites/items/physicalMelee/physicalMelee_t3_1h.png'),
  'physicalMelee-4': require('../assets/sprites/items/physicalMelee/physicalMelee_t4_1h.png'),
  'physicalMelee-5': require('../assets/sprites/items/physicalMelee/physicalMelee_t5_1h.png'),
  'physicalRanged-1': require('../assets/sprites/items/physicalRanged/physicalRanged_t1_1h.png'),
  'physicalRanged-2': require('../assets/sprites/items/physicalRanged/physicalRanged_t2_1h.png'),
  'physicalRanged-3': require('../assets/sprites/items/physicalRanged/physicalRanged_t3_1h.png'),
  'physicalRanged-4': require('../assets/sprites/items/physicalRanged/physicalRanged_t4_1h.png'),
  'physicalRanged-5': require('../assets/sprites/items/physicalRanged/physicalRanged_t5_1h.png'),
  'physicalSupport-1': require('../assets/sprites/items/physicalSupport/physicalSupport_t1_1h.png'),
  'physicalSupport-2': require('../assets/sprites/items/physicalSupport/physicalSupport_t2_1h.png'),
  'physicalSupport-3': require('../assets/sprites/items/physicalSupport/physicalSupport_t3_1h.png'),
  'physicalSupport-4': require('../assets/sprites/items/physicalSupport/physicalSupport_t4_1h.png'),
  'physicalSupport-5': require('../assets/sprites/items/physicalSupport/physicalSupport_t5_1h.png'),
  'magicMelee-1': require('../assets/sprites/items/magicMelee/magicMelee_t1_1h.png'),
  'magicMelee-2': require('../assets/sprites/items/magicMelee/magicMelee_t2_1h.png'),
  'magicMelee-3': require('../assets/sprites/items/magicMelee/magicMelee_t3_1h.png'),
  'magicMelee-4': require('../assets/sprites/items/magicMelee/magicMelee_t4_1h.png'),
  'magicMelee-5': require('../assets/sprites/items/magicMelee/magicMelee_t5_1h.png'),
  'magicRanged-1': require('../assets/sprites/items/magicRanged/magicRanged_t1_1h.png'),
  'magicRanged-2': require('../assets/sprites/items/magicRanged/magicRanged_t2_1h.png'),
  'magicRanged-3': require('../assets/sprites/items/magicRanged/magicRanged_t3_1h.png'),
  'magicRanged-4': require('../assets/sprites/items/magicRanged/magicRanged_t4_1h.png'),
  'magicRanged-5': require('../assets/sprites/items/magicRanged/magicRanged_t5_1h.png'),
  'magicSupport-1': require('../assets/sprites/items/magicSupport/magicSupport_t1_1h.png'),
  'magicSupport-2': require('../assets/sprites/items/magicSupport/magicSupport_t2_1h.png'),
  'magicSupport-3': require('../assets/sprites/items/magicSupport/magicSupport_t3_1h.png'),
  'magicSupport-4': require('../assets/sprites/items/magicSupport/magicSupport_t4_1h.png'),
  'magicSupport-5': require('../assets/sprites/items/magicSupport/magicSupport_t5_1h.png'),
};

// 同一階還有雙手武器版本。一支隊伍丟出來的東西全部一模一樣會很平,交錯丟兩種就有「一群人
// 各拿各的武器」的感覺,而且不必另外畫圖。
const WEAPON_ART_2H: Record<string, ImageSourcePropType> = {
  'physicalMelee-1': require('../assets/sprites/items/physicalMelee/physicalMelee_t1_2h.png'),
  'physicalMelee-2': require('../assets/sprites/items/physicalMelee/physicalMelee_t2_2h.png'),
  'physicalMelee-3': require('../assets/sprites/items/physicalMelee/physicalMelee_t3_2h.png'),
  'physicalMelee-4': require('../assets/sprites/items/physicalMelee/physicalMelee_t4_2h.png'),
  'physicalMelee-5': require('../assets/sprites/items/physicalMelee/physicalMelee_t5_2h.png'),
  'physicalRanged-1': require('../assets/sprites/items/physicalRanged/physicalRanged_t1_2h.png'),
  'physicalRanged-2': require('../assets/sprites/items/physicalRanged/physicalRanged_t2_2h.png'),
  'physicalRanged-3': require('../assets/sprites/items/physicalRanged/physicalRanged_t3_2h.png'),
  'physicalRanged-4': require('../assets/sprites/items/physicalRanged/physicalRanged_t4_2h.png'),
  'physicalRanged-5': require('../assets/sprites/items/physicalRanged/physicalRanged_t5_2h.png'),
  'physicalSupport-1': require('../assets/sprites/items/physicalSupport/physicalSupport_t1_2h.png'),
  'physicalSupport-2': require('../assets/sprites/items/physicalSupport/physicalSupport_t2_2h.png'),
  'physicalSupport-3': require('../assets/sprites/items/physicalSupport/physicalSupport_t3_2h.png'),
  'physicalSupport-4': require('../assets/sprites/items/physicalSupport/physicalSupport_t4_2h.png'),
  'physicalSupport-5': require('../assets/sprites/items/physicalSupport/physicalSupport_t5_2h.png'),
  'magicMelee-1': require('../assets/sprites/items/magicMelee/magicMelee_t1_2h.png'),
  'magicMelee-2': require('../assets/sprites/items/magicMelee/magicMelee_t2_2h.png'),
  'magicMelee-3': require('../assets/sprites/items/magicMelee/magicMelee_t3_2h.png'),
  'magicMelee-4': require('../assets/sprites/items/magicMelee/magicMelee_t4_2h.png'),
  'magicMelee-5': require('../assets/sprites/items/magicMelee/magicMelee_t5_2h.png'),
  'magicRanged-1': require('../assets/sprites/items/magicRanged/magicRanged_t1_2h.png'),
  'magicRanged-2': require('../assets/sprites/items/magicRanged/magicRanged_t2_2h.png'),
  'magicRanged-3': require('../assets/sprites/items/magicRanged/magicRanged_t3_2h.png'),
  'magicRanged-4': require('../assets/sprites/items/magicRanged/magicRanged_t4_2h.png'),
  'magicRanged-5': require('../assets/sprites/items/magicRanged/magicRanged_t5_2h.png'),
  'magicSupport-1': require('../assets/sprites/items/magicSupport/magicSupport_t1_2h.png'),
  'magicSupport-2': require('../assets/sprites/items/magicSupport/magicSupport_t2_2h.png'),
  'magicSupport-3': require('../assets/sprites/items/magicSupport/magicSupport_t3_2h.png'),
  'magicSupport-4': require('../assets/sprites/items/magicSupport/magicSupport_t4_2h.png'),
  'magicSupport-5': require('../assets/sprites/items/magicSupport/magicSupport_t5_2h.png'),
};

/**
 * 擲出去的武器。variant 讓同一支隊伍交錯丟單手/雙手兩種,不是全部同一把。
 * 還沒轉職的學生沒有職業武器,沿用傳承之劍。
 */
export function weaponArt(archetype: string | null, gear: number, variant = 0): ImageSourcePropType {
  const tier = Math.min(5, Math.max(1, Math.round(gear)));
  // variant 是投射物的流水號,所以同一波裡每一件都不一樣,而且重播會長一樣(不用亂數)。
  if (archetype === null) return STUDENT_PROJECTILES[Math.abs(variant) % STUDENT_PROJECTILES.length];
  const table = variant % 2 === 0 ? WEAPON_ART : WEAPON_ART_2H;
  return table[`${archetype}-${tier}`] ?? WEAPON_ART[`${archetype}-${tier}`] ?? PROJECTILE_ART;
}
