import { useEffect } from 'react';
import { Platform } from 'react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { elementOf, skillTier, type RunSkillId } from '../game/laneRunSkills';

/**
 * 音效。`assets/sounds` 底下那幾份既有的短音,接進遊戲裡當回饋。
 *
 * ## 為什麼是模組層的單例,不是 hook 回傳的物件
 *
 * 音效的觸發點散在各處(按鈕、通關、選技能、被打中),而那些地方不一定方便多接一層 prop——
 * 「按下去有沒有聲音」跟元件的資料流是兩件無關的事。所以播放走 `playSfx('click')`
 * 這個純函式,音量由 app 層用 `useSfxVolume` 同步進來。
 *
 * ## 為什麼每個音各自一個 player,而且不 useAudioPlayer
 *
 * `useAudioPlayer` 綁在元件的生命週期上,而音效要能在**任何**元件裡響;
 * 而且 LaneRunner 每一關重新掛載,綁在裡面的話每一關會重建一次播放器
 *(跟背景音樂那個坑同一個形狀,見 useBgm.ts)。
 * 用 `createAudioPlayer` 建一次、整個 app 共用,而且**延遲到第一次要播才建**——
 * 開場就建七個播放器等於七個檔案一起解碼,主介面會卡一下。
 *
 * ## 同一個音連續觸發
 *
 * 一個音一個 player,所以連續觸發是「從頭重播」而不是疊起來。對這幾個音效剛好
 * 就是想要的行為:連點按鈕會聽到一連串「噠噠噠」,而不是所有聲音疊成一團噪音。
 *
 * ## 自動播放政策
 *
 * 跟背景音樂同一條限制:網頁上使用者還沒互動過就出聲會被擋,而 expo-audio 的 web
 * `play()` 不回傳 promise,接不到那個錯(見 useBgm.ts)。音效大多本來就由點擊觸發,
 * 但「通關」「選到技能」不是,所以這裡一律先看 `gestureSeen` 再播。
 */

const SOURCES = {
  /** 按鈕。開始闖關、分頁、面板上的每一顆。 */
  click: require('../assets/sounds/click.wav'),
  /** 通關。一場跑完、活著走到終點的那一下。 */
  clear: require('../assets/sounds/level-up.wav'),
  /** 選到技能(場內三選一、永久技能、轉職)。 */
  skill: require('../assets/sounds/skill-upgrade.wav'),
  /** 陣亡。用 event-common 那份短而悶的音,不要用華麗的。 */
  dead: require('../assets/sounds/event-common.wav'),
  /** 抽到地圖。生存模式開頭那一下。 */
  draw: require('../assets/sounds/event-rare.wav'),

  // ---- 六元素主動技能的傷害音(產生檔,見 scripts/make-skill-sfx.py)----
  //
  // **只有二三階有**。一階是被動,效果掛在「每一次命中」上(燃燒擴散、連鎖閃電、
  // 凍結判定),一波幾十上百次——每次播一聲會變成機關槍,那不是音效是噪音。
  //
  // 同族的二三階是**同一個音色**,三階更低更長。這跟圖示的「同族共用字形,
  // 階級疊層數」是同一條規則:先一耳認出是哪一族,再分辨份量。
  fire2: require('../assets/sounds/skills/fire2.wav'),
  fire3: require('../assets/sounds/skills/fire3.wav'),
  metal2: require('../assets/sounds/skills/metal2.wav'),
  metal3: require('../assets/sounds/skills/metal3.wav'),
  thunder2: require('../assets/sounds/skills/thunder2.wav'),
  thunder3: require('../assets/sounds/skills/thunder3.wav'),
  ice2: require('../assets/sounds/skills/ice2.wav'),
  ice3: require('../assets/sounds/skills/ice3.wav'),
  wood2: require('../assets/sounds/skills/wood2.wav'),
  wood3: require('../assets/sounds/skills/wood3.wav'),
  earth2: require('../assets/sounds/skills/earth2.wav'),
  earth3: require('../assets/sounds/skills/earth3.wav'),
} as const;

export type SfxId = keyof typeof SOURCES;

const players: Partial<Record<SfxId, AudioPlayer>> = {};

/** 目前的音效音量(0~1)。由 useSfxVolume 從存檔同步進來。 */
let volume = 0;
/** 這一輪頁面有沒有被碰過。網頁的自動播放政策看的就是這件事。 */
let gestureSeen = Platform.OS !== 'web';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  // once:留著監聽的話每一次點擊都會再跑一遍。
  const seen = () => { gestureSeen = true; };
  window.addEventListener('pointerdown', seen, { once: true });
  window.addEventListener('keydown', seen, { once: true });
}

/**
 * 放一個音效。**任何情況都不丟例外**——音效壞掉不該把畫面帶掉,
 * 而它壞掉的樣子應該是「沒聲音」,不是白畫面。
 */
export function playSfx(id: SfxId): void {
  if (volume <= 0 || !gestureSeen) return;
  try {
    let player = players[id];
    if (!player) {
      player = createAudioPlayer(SOURCES[id]);
      players[id] = player;
    }
    player.volume = volume;
    // 從頭播。不 seek 的話第二次觸發時播放頭還停在上一次的結尾,聽起來是「沒反應」。
    player.seekTo(0);
    player.play();
  } catch {
    // 忽略:見上面。
  }
}

/** 把存檔裡的音效音量同步到模組層。掛在 app 層一次就好。 */
export function useSfxVolume(value: number): void {
  useEffect(() => {
    volume = Math.min(1, Math.max(0, value));
    // 已經建好的 player 也要跟著調,不然剛拖完滑桿的那幾次還是舊音量。
    for (const p of Object.values(players)) {
      if (p) p.volume = volume;
    }
  }, [value]);
}

/**
 * 一款技能對應哪一個傷害音。**一階(被動)回 null**——見 SOURCES 裡的說明。
 *
 * 用 `elementOf` + `skillTier` 組出 key,不逐款寫死:18 款逐一列的話,
 * 哪天多一個元素就會有人漏掉其中一階,而漏掉的症狀是「那一款沒聲音」,
 * 沒有人會注意到(它跟「還沒輪到它放」長得一模一樣)。
 * 組出來的 key 一定在表裡(六元素 x 二三階),`in` 只是型別上的保險。
 */
export function skillDamageSfx(id: RunSkillId): SfxId | null {
  const tier = skillTier(id);
  if (tier === 1) return null;
  const key = `${elementOf(id)}${tier}`;
  return key in SOURCES ? (key as SfxId) : null;
}

/**
 * 一次觸發只播**一個**音。
 *
 * 主動是「冷卻好了就自己放」,而好幾款的冷卻可能在同一個 tick 一起到期——
 * 六個音一起播會糊成一團,而且音量疊起來會爆(每個檔的峰值都是 0.72)。
 * 挑階級最高的那一個:它的份量最重,也是玩家最想聽到的那一下。
 */
export function playSkillDamage(ids: RunSkillId[]): void {
  let best: RunSkillId | null = null;
  for (const id of ids) {
    if (skillDamageSfx(id) === null) continue;
    if (best === null || skillTier(id) > skillTier(best)) best = id;
  }
  const sfx = best === null ? null : skillDamageSfx(best);
  if (sfx !== null) playSfx(sfx);
}
