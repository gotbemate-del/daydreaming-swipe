import Svg, { Circle, Ellipse, G, Path, Polygon, Rect } from 'react-native-svg';

import { elementOf, skillTier, type RunSkillId } from '../game/laneRunSkills';
import { elementColor } from './artAssets';

/**
 * 主動技能的特效。12 款各一種,畫在跑道上。
 *
 * ## 為什麼不用動畫函式庫
 *
 * 跑道每 33ms 本來就會重畫一次(飛行中的武器在動),所以「經過了多少毫秒」是現成的——
 * 特效只要把那個數字換算成 0~1 的進度再吐出 SVG 就好。多接一個 reanimated 的
 * 時間軸反而會跟跑圖的 tick 各走各的,快轉/暫停的時候兩邊就對不上
 *(設定面板一開跑圖就停住,而特效若自己跑,會變成「畫面停了但爆炸還在動」)。
 *
 * ## 為什麼吃 id 不吃名字
 *
 * 12 款的差別就是這裡的分支。拿顯示名字當 key 的話,改一次文案特效就默默消失。
 *
 * ## 一律不影響結算
 *
 * 這裡畫的每一筆都是「已經發生的事」的圖:清掉幾隻在 fireActives 就算完了。
 * 這是這個專案一貫的分法(見 laneRun 的 extraKills:數字只有一份),
 * 混在一起的話「特效畫得更漂亮」就會等於「難度悄悄變了」。
 */

/** 一次特效播多久。比冷卻(最短 10 秒)短很多,不會兩次疊在一起。 */
export const SKILL_FX_MS = 620;

interface Props {
  id: RunSkillId;
  /** 0~1 的播放進度。 */
  t: number;
  width: number;
  height: number;
  /** 勇者站的位置(像素),以隊伍中心為準。 */
  heroX: number;
  /** 判定線的 y。大部分特效以它為基準往上鋪。 */
  headY: number;
}

/** 淡入淡出:前 15% 進來、後 35% 出去,中間全亮。 */
function fade(t: number): number {
  if (t < 0.15) return t / 0.15;
  if (t > 0.65) return Math.max(0, (1 - t) / 0.35);
  return 1;
}

export function SkillFx({ id, t, width, height, heroX, headY }: Props) {
  const color = elementColor(elementOf(id)) ?? '#e0a95c';
  const tier = skillTier(id);
  const a = fade(t);
  if (a <= 0) return null;

  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      {render(id, tier, t, a, color, width, height, heroX, headY)}
    </Svg>
  );
}

function render(
  id: RunSkillId, tier: 1 | 2 | 3, t: number, a: number,
  color: string, w: number, h: number, heroX: number, headY: number,
) {
  const el = elementOf(id);

  // ---- 火:二階腳邊炸開一圈,三階整條跑道燒起來 ----
  if (el === 'fire') {
    if (tier === 2) {
      const r = 18 + t * Math.min(w * 0.55, 150);
      return (
        <G opacity={a}>
          <Circle cx={heroX} cy={headY} r={r} stroke={color} strokeWidth={6 * (1 - t) + 2} fill="none" />
          <Circle cx={heroX} cy={headY} r={r * 0.62} stroke={color} strokeWidth={3} fill="none" opacity={0.6} />
        </G>
      );
    }
    // 煉獄:整條跑道由下往上竄的火舌,每一道相位錯開才不像一排柵欄。
    return (
      <G opacity={a * 0.9}>
        <Rect x={0} y={headY - h * 0.55} width={w} height={h * 0.55} fill={color} opacity={0.16} />
        {Array.from({ length: 9 }, (_, i) => {
          const x = ((i + 0.5) / 9) * w;
          const lift = (0.45 + 0.55 * Math.abs(Math.sin(i * 2.1 + t * 6))) * h * 0.42;
          return (
            <Path
              key={i}
              d={`M${x - 13} ${headY} Q${x} ${headY - lift} ${x + 13} ${headY} Z`}
              fill={color}
              opacity={0.75}
            />
          );
        })}
      </G>
    );
  }

  // ---- 金:二階甩出碎刃,三階碎刃繞著隊伍轉一圈 ----
  if (el === 'metal') {
    const n = tier === 2 ? 7 : 12;
    const spin = t * (tier === 2 ? 1.2 : 3.4);
    const reach = (tier === 2 ? 0.34 : 0.5) * Math.min(w, h) * (0.35 + t * 0.85);
    return (
      <G opacity={a}>
        {Array.from({ length: n }, (_, i) => {
          const ang = (i / n) * Math.PI * 2 + spin * Math.PI * 2;
          const x = heroX + Math.cos(ang) * reach;
          const y = headY + Math.sin(ang) * reach * 0.55;
          return (
            <Polygon
              key={i}
              points={`${x},${y - 9} ${x + 4},${y} ${x},${y + 9} ${x - 4},${y}`}
              fill={color}
              opacity={0.9}
            />
          );
        })}
      </G>
    );
  }

  // ---- 雷:二階一道落雷,三階連續落雷洗過整波 ----
  if (el === 'thunder') {
    const bolts = tier === 2 ? 1 : 5;
    // 每 80ms 換一次形狀,看起來才像持續在打而不是一張靜止的圖。
    const flick = Math.floor(t * 8);
    return (
      <G opacity={a}>
        {Array.from({ length: bolts }, (_, i) => {
          const x = bolts === 1 ? heroX : ((i + 0.5) / bolts) * w;
          const top = headY - h * 0.75;
          const seed = i * 3 + flick;
          const jag = (k: number) => x + (((seed * (k + 7) * 37) % 21) - 10);
          const y = (k: number) => top + ((headY - top) * k) / 4;
          return (
            <Path
              key={i}
              d={`M${x} ${top} L${jag(1)} ${y(1)} L${jag(2)} ${y(2)} L${jag(3)} ${y(3)} L${x} ${headY}`}
              stroke={color}
              strokeWidth={i === 0 || bolts === 1 ? 4 : 3}
              fill="none"
              strokeLinecap="round"
            />
          );
        })}
      </G>
    );
  }

  // ---- 冰:二階冰錐從地面刺出,三階整片暴風雪 ----
  if (el === 'ice') {
    if (tier === 2) {
      const rise = t * h * 0.3;
      return (
        <G opacity={a}>
          {Array.from({ length: 6 }, (_, i) => {
            const x = ((i + 0.5) / 6) * w;
            const tall = rise * (0.6 + ((i * 7) % 5) / 8);
            return (
              <Polygon key={i} points={`${x},${headY - tall} ${x + 9},${headY} ${x - 9},${headY}`} fill={color} opacity={0.85} />
            );
          })}
        </G>
      );
    }
    return (
      <G opacity={a}>
        <Rect x={0} y={0} width={w} height={h} fill={color} opacity={0.14} />
        {Array.from({ length: 22 }, (_, i) => {
          const x = ((i * 53) % 100) / 100 * w + t * w * 0.5;
          const y = ((i * 31) % 100) / 100 * h + t * h * 0.6;
          return (
            <Path
              key={i}
              d={`M${x % w} ${y % h} l14 9`}
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              opacity={0.8}
            />
          );
        })}
      </G>
    );
  }

  // ---- 木:二階荊棘纏上來,三階巨木貫穿跑道 ----
  if (el === 'wood') {
    if (tier === 2) {
      const grow = t * h * 0.34;
      return (
        <G opacity={a} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round">
          {Array.from({ length: 5 }, (_, i) => {
            const x = ((i + 0.5) / 5) * w;
            const dir = i % 2 === 0 ? 1 : -1;
            return (
              <Path key={i} d={`M${x} ${headY} C${x + 22 * dir} ${headY - grow * 0.45} ${x - 18 * dir} ${headY - grow * 0.7} ${x + 8 * dir} ${headY - grow}`} />
            );
          })}
        </G>
      );
    }
    const trunkH = t * h * 0.7;
    return (
      <G opacity={a}>
        <Rect x={heroX - 16} y={headY - trunkH} width={32} height={trunkH} fill={color} opacity={0.85} rx={6} />
        {Array.from({ length: 6 }, (_, i) => {
          const y = headY - trunkH * ((i + 1) / 7);
          const dir = i % 2 === 0 ? 1 : -1;
          return (
            <Ellipse key={i} cx={heroX + dir * (30 + i * 9)} cy={y} rx={26} ry={11} fill={color} opacity={0.6} />
          );
        })}
      </G>
    );
  }

  // ---- 土:二階落石,三階地裂 ----
  if (tier === 2) {
    return (
      <G opacity={a}>
        {Array.from({ length: 7 }, (_, i) => {
          const x = ((i * 37) % 100) / 100 * w;
          const y = headY - h * 0.7 + t * h * 0.7 + ((i * 17) % 40);
          return <Circle key={i} cx={x} cy={Math.min(headY, y)} r={7 + (i % 3) * 3} fill={color} opacity={0.9} />;
        })}
      </G>
    );
  }
  // 地裂:一條橫貫跑道的裂縫,越裂越開。
  const open = 4 + t * 26;
  return (
    <G opacity={a}>
      <Path
        d={`M0 ${headY} L${w * 0.2} ${headY - 12} L${w * 0.42} ${headY + 8} L${w * 0.63} ${headY - 10} L${w * 0.82} ${headY + 6} L${w} ${headY - 8}`}
        stroke={color}
        strokeWidth={open}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d={`M0 ${headY} L${w * 0.2} ${headY - 12} L${w * 0.42} ${headY + 8} L${w * 0.63} ${headY - 10} L${w * 0.82} ${headY + 6} L${w} ${headY - 8}`}
        stroke="#16161c"
        strokeWidth={Math.max(1, open * 0.45)}
        fill="none"
        strokeLinecap="round"
      />
    </G>
  );
}
