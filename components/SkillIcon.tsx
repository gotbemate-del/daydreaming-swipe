import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Polygon } from 'react-native-svg';

import { elementOf, skillTier, type RunSkillId } from '../game/laneRunSkills';

/**
 * 技能圖示。**圓形,而且冷卻倒數就長在圖示上**。
 *
 * ## 為什麼合成一個東西
 *
 * 舊版是「方格 + 從下往上填滿的暗色遮罩 + 底下一行秒數」,三個元素在講同一件事。
 * 玩家掃一眼技能列的時候要找的是「哪一顆好了」,而方格陣列裡最快分辨的是**形狀完整度**——
 * 一圈畫滿了就是好了。倒數的秒數留著(有些人要精確等),但它從獨立的一行變成圓心底下的小字。
 *
 * ## 為什麼是手寫 SVG 不是 PNG
 *
 * 圖示鐵則:16x16 小圖示從 `assets/sprites/ui/` 拿現成的,**進度環一律手寫 SVG**
 * (見 CLAUDE.md)。而技能沒有現成素材,又絕對不能拿 emoji 頂替——emoji 逐平台不同、
 * 全彩高飽和,跟這款的莫蘭迪暗色像素風格衝突。
 *
 * 每一款各畫一個字形,而不是取名字的第一個字:文字在 30px 的圓裡要嘛太小要嘛擠滿,
 * 而且「火」「金」「木」這種字在暗底上糊成一團,分辨速度比形狀慢很多。
 *
 * ## 為什麼不用 strokeDasharray 做環的動畫
 *
 * 用了。冷卻環就是一條 dasharray 掃過去的圓弧,旋轉 -90 度讓它從十二點鐘開始。
 * 這是 SVG 畫進度環的標準做法,也是這裡引進 react-native-svg 的唯一理由。
 */

/** 每一款的字形。viewBox 統一 24x24,靠 currentColor 上色。 */
const GLYPHS: Record<string, (color: string) => React.ReactNode> = {
  // 火:一團往上竄的火焰。
  fire: (c) => (
    <G fill={c}>
      <Path d="M12 2 C15 7 19 9 19 14 A7 7 0 0 1 5 14 C5 10 8 9 9 6 C10 9 12 9 12 2 Z" />
      <Path d="M12 12 C13.5 14 15 15 15 17 A3 3 0 0 1 9 17 C9 15 11 14 12 12 Z" fill="#16161c" opacity={0.45} />
    </G>
  ),
  // 金:四芒星的碎片,銳利、對稱 = 擴散。
  metal: (c) => (
    <G fill={c}>
      <Polygon points="12,1 14.5,9.5 23,12 14.5,14.5 12,23 9.5,14.5 1,12 9.5,9.5" />
    </G>
  ),
  // 雷:一道折線閃電。
  thunder: (c) => <Path d="M13 1 L4 13 L10 13 L8 23 L19 9 L12.5 9 Z" fill={c} />,
  // 冰:六角的雪花。三條交叉的軸最省筆畫又一眼看得出是冰。
  ice: (c) => (
    <G stroke={c} strokeWidth={2.2} strokeLinecap="round">
      <Path d="M12 2 L12 22" />
      <Path d="M3.3 7 L20.7 17" />
      <Path d="M3.3 17 L20.7 7" />
      <Path d="M12 6 L9 3.5 M12 6 L15 3.5 M12 18 L9 20.5 M12 18 L15 20.5" strokeWidth={1.6} />
    </G>
  ),
  // 木:一片葉子加葉脈 = 再生。
  wood: (c) => (
    <G>
      <Path d="M20 3 C9 3 3 9 3 17 C3 20 5 21 7 21 C15 21 21 14 20 3 Z" fill={c} />
      <Path d="M18 5 C13 9 9 14 6 20" stroke="#16161c" strokeWidth={1.6} opacity={0.5} fill="none" />
    </G>
  ),
  // 土:一座土丘加地面線 = 阻滯。
  earth: (c) => (
    <G fill={c}>
      <Path d="M12 5 L22 17 L2 17 Z" />
      <Path d="M1 19 H23 V21.5 H1 Z" opacity={0.7} />
    </G>
  ),
};

/** 沒有字形的先用一個實心圓,不要拿 emoji 或文字頂替。 */
function fallbackGlyph(color: string) {
  return <Circle cx={12} cy={12} r={7} fill={color} />;
}

/**
 * 階級 = **同一個字形疊幾個**。一階一個、二階兩個、三階三個。
 *
 * 為什麼不是另外畫三張圖:同一族的三款是「同一件事的三個量級」,各畫一張互不相干的圖
 * 反而讓玩家看不出它們是一家的——而「這是我投資過的那個元素」正是技能列上最該一眼認出的事。
 * 為什麼不是角落的數字或小點:那要**讀**(而且在 30px 的圓上二點三點很難分),
 * 疊起來則是用**份量**表示份量,不必讀就看得出哪一顆比較重。
 * 順帶把右下角空出來還給等級。
 *
 * 每一層的 dx/dy 是「佔整顆圓的幾分之幾」,所以縮到 20px 也不會散開。
 * 後面那幾層壓低透明度:全部同亮度的話三個疊起來會糊成一團看不出是幾個。
 */
const TIER_STACK: Record<1 | 2 | 3, { dx: number; dy: number; scale: number; opacity: number }[]> = {
  1: [{ dx: 0, dy: -0.04, scale: 0.52, opacity: 1 }],
  2: [
    { dx: -0.12, dy: 0.03, scale: 0.42, opacity: 0.55 },
    { dx: 0.09, dy: -0.11, scale: 0.44, opacity: 1 },
  ],
  3: [
    { dx: -0.16, dy: 0.06, scale: 0.34, opacity: 0.45 },
    { dx: 0.16, dy: -0.02, scale: 0.34, opacity: 0.65 },
    { dx: 0, dy: -0.16, scale: 0.38, opacity: 1 },
  ],
};

interface Props {
  id: RunSkillId;
  /** 主色。元素走 elementColor,被動走強調金。 */
  color: string;
  /** 圓的直徑。 */
  size: number;
  /** 技能等級,畫在圓的**右上角**。0 或不給就不畫。 */
  level?: number;
  /**
   * 冷卻:總秒數與「還要幾秒」。`cooldown` 是 0 表示被動——被動的環是**整圈實線**,
   * 不是空的:空的會被讀成「永遠在冷卻」,而被動其實是隨時都在生效。
   */
  cooldown?: number;
  ready?: number;
}

export function SkillIcon({ id, color, size, level = 0, cooldown = 0, ready = 0 }: Props) {
  const cooling = cooldown > 0 && ready > 0;
  // 環畫在圓的邊上,所以半徑要扣掉線寬的一半,不然會被裁掉一半。
  const stroke = Math.max(2, Math.round(size * 0.1));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  // 剩餘比例:冷卻中畫「已經過了多少」,好了就是整圈。
  const filled = cooling ? 1 - Math.min(1, ready / cooldown) : 1;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* 底盤 */}
        <Circle cx={size / 2} cy={size / 2} r={r} fill="#2a2a35" />
        {/* 環的底(沒走完的那一段),暗色但看得見,不然冷卻中會像缺了一角 */}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#3a3448" strokeWidth={stroke} fill="none" />
        {/* 環本身:從十二點鐘順時針掃。dasharray 的第一段是「畫出來的長度」。 */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference * filled} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          opacity={cooling ? 0.85 : 1}
        />
        {/* 字形。縮到圓內側留出環的寬度,而**疊幾個就是第幾階**(見 TIER_STACK)。 */}
        {TIER_STACK[skillTier(id)].map((layer, i) => {
          const g = size * layer.scale;
          const x = size / 2 - g / 2 + layer.dx * size;
          const y = size / 2 - g / 2 + layer.dy * size;
          return (
            <G
              key={i}
              transform={`translate(${x} ${y}) scale(${g / 24})`}
              opacity={(cooling ? 0.4 : 1) * layer.opacity}
            >
              {(GLYPHS[elementOf(id)] ?? fallbackGlyph)(color)}
            </G>
          );
        })}
      </Svg>

      {/* 冷卻中壓一個秒數在正中央:有人要的是「還有幾秒」的精確值,環只給概略。 */}
      {cooling && (
        <View style={styles.center} pointerEvents="none">
          <Text style={[styles.seconds, { fontSize: Math.round(size * 0.38) }]}>{Math.ceil(ready)}</Text>
        </View>
      )}

      {/*
        等級回到右下角。階級現在由**疊了幾個字形**講(見 TIER_STACK),角落不再需要第二顆數字——
        兩顆數字並排的時候玩家得先想「哪個是等級哪個是階級」,那是每次掃技能列都要付一次的成本。
        寫成 `Lv.N` 而不是裸數字:圓裡冷卻中會壓一個秒數,裸數字會跟它撞在一起。
      */}
      {level > 0 && (
        <View
          style={[
            styles.level,
            { height: size * 0.38, borderRadius: size * 0.19, borderColor: color },
          ]}
          pointerEvents="none"
        >
          <Text style={[styles.levelText, { fontSize: Math.round(size * 0.24) }]}>Lv.{level}</Text>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  seconds: { color: '#f2f2f2', fontWeight: '700' },
  level: {
    position: 'absolute', right: -2, bottom: -2,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#16161c', borderWidth: 1,
    paddingHorizontal: 3,
  },
  levelText: { color: '#f2f2f2', fontWeight: '700' },
});
