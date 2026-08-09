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

/**
 * 每一款特效都**往畫面上方打**。
 *
 * 跑道是往上跑的:勇者在最下面,怪從上面衝下來。所以「攻擊」在這個畫面上只有一個方向——
 * 由下往上。先前有幾款是繞著勇者轉(金)、由上往下砸(土二階)、或橫著劃過跑道(土三階),
 * 讀起來像是原地放的光,跟行進方向對不起來:玩家分不出那是打出去的還是打進來的
 *(而「打進來」在這個畫面上是敵人的武器,那是要閃的東西,兩者不能長得像)。
 *
 * 共同的寫法:所有幾何都以勇者(heroX, headY)為原點,隨 t 往 `-y` 推進。
 */
function render(
  id: RunSkillId, tier: 1 | 2 | 3, t: number, a: number,
  color: string, w: number, h: number, heroX: number, headY: number,
) {
  const el = elementOf(id);
  /** 這一次要打多遠(往上)。三階打到底,二階打到跑道中段。 */
  const reach = (tier === 2 ? 0.5 : 0.86) * h;
  /** 目前推進到的 y。 */
  const frontY = headY - reach * t;

  // ---- 火:二階一團火球衝上去,三階整片火牆推上去 ----
  if (el === 'fire') {
    if (tier === 2) {
      // 火球:一路往上,尾巴拖在後面(所以看得出方向)。
      const r = 16 + t * 26;
      return (
        <G opacity={a}>
          <Path
            d={`M${heroX - r * 0.7} ${frontY + r * 2.4} Q${heroX} ${frontY + r * 0.6} ${heroX + r * 0.7} ${frontY + r * 2.4} Z`}
            fill={color}
            opacity={0.45}
          />
          <Circle cx={heroX} cy={frontY} r={r} fill={color} opacity={0.85} />
          <Circle cx={heroX} cy={frontY} r={r * 1.6} stroke={color} strokeWidth={3} fill="none" opacity={0.5} />
        </G>
      );
    }
    // 煉獄:一道橫貫跑道的火牆往上推。火舌長在**牆的前緣**,所以前進方向一眼看得出來。
    return (
      <G opacity={a * 0.9}>
        <Rect x={0} y={frontY} width={w} height={Math.max(0, headY - frontY)} fill={color} opacity={0.18} />
        {Array.from({ length: 9 }, (_, i) => {
          const x = ((i + 0.5) / 9) * w;
          const lift = (0.45 + 0.55 * Math.abs(Math.sin(i * 2.1 + t * 6))) * h * 0.16;
          return (
            <Path
              key={i}
              d={`M${x - 13} ${frontY + lift} Q${x} ${frontY - lift} ${x + 13} ${frontY + lift} Z`}
              fill={color}
              opacity={0.8}
            />
          );
        })}
      </G>
    );
  }

  // ---- 金:碎刃射出去。二階一把扇形、三階一整片 ----
  // 先前是繞著勇者轉一圈——那是「護體」不是「攻擊」,而金的兩款都是傷害。
  if (el === 'metal') {
    const n = tier === 2 ? 7 : 13;
    const spread = tier === 2 ? 0.5 : 0.95; // 扇形的半角(弧度)
    return (
      <G opacity={a}>
        {Array.from({ length: n }, (_, i) => {
          const ang = -Math.PI / 2 + ((i / (n - 1)) - 0.5) * 2 * spread;
          // 每一把的速度略有差異,整排才不像一條線平移。
          const speed = 0.75 + ((i * 37) % 50) / 100;
          const d = reach * t * speed;
          const x = heroX + Math.cos(ang) * d;
          const y = headY + Math.sin(ang) * d;
          const deg = (ang * 180) / Math.PI + 90; // 刀尖朝飛行方向
          return (
            <G key={i} transform={`rotate(${deg} ${x} ${y})`}>
              <Polygon points={`${x},${y - 11} ${x + 4},${y + 3} ${x},${y + 9} ${x - 4},${y + 3}`} fill={color} opacity={0.95} />
              {/* 拖尾:看得出它是「射出去的」而不是「浮在那裡的」 */}
              <Path d={`M${x} ${y + 9} L${x} ${y + 26}`} stroke={color} strokeWidth={2} opacity={0.35} />
            </G>
          );
        })}
      </G>
    );
  }

  // ---- 雷:落雷。雷本來就是從天上打下來,但**落點在前方**(跑道上半段)----
  if (el === 'thunder') {
    const bolts = tier === 2 ? 1 : 5;
    // 每 80ms 換一次形狀,看起來才像持續在打而不是一張靜止的圖。
    const flick = Math.floor(t * 8);
    // **折線幅度要夠大,不然它讀起來是雨不是雷。** 第一版是 ±10px 拉在 800px 的高度上,
    // 畫出來是五條近乎筆直的長線——實機截圖一看就知道不對。
    const SWAY = 34;
    const SEGMENTS = 7;
    return (
      <G opacity={a}>
        {Array.from({ length: bolts }, (_, i) => {
          const x = bolts === 1 ? heroX : ((i + 0.5) / bolts) * w;
          const top = headY - h * 0.82;
          // 打到的深度跟著 t 往下延伸一點,但**永遠停在勇者前方**:拉到腳邊就變成柵欄,
          // 而且會跟「敵人丟過來的武器」混在一起。
          const bottom = headY - h * (0.34 - 0.1 * t);
          const seed = i * 7 + flick * 13 + 1;
          const jag = (k: number) => {
            if (k === 0 || k === SEGMENTS) return x;
            const swing = ((seed * (k + 3) * 2654435761) >>> 8) % SWAY;
            return x + (k % 2 === 0 ? swing : -swing);
          };
          const y = (k: number) => top + ((bottom - top) * k) / SEGMENTS;
          const d = Array.from({ length: SEGMENTS + 1 }, (_, k) =>
            `${k === 0 ? 'M' : 'L'}${jag(k)} ${y(k)}`).join(' ');
          return (
            <G key={i}>
              {/* 外圈粗一點、淡一點當光暈,內圈細而實 —— 兩層才有「亮」的感覺 */}
              <Path d={d} stroke={color} strokeWidth={7} fill="none" strokeLinecap="round" opacity={0.35} />
              <Path d={d} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
            </G>
          );
        })}
      </G>
    );
  }

  // ---- 冰:二階冰錐一路往前刺出去,三階暴風雪往前吹 ----
  if (el === 'ice') {
    if (tier === 2) {
      // 一排冰錐**依序**從勇者腳邊往前竄:越前面的越晚出現,所以看得出推進的方向。
      const n = 6;
      return (
        <G opacity={a}>
          {Array.from({ length: n }, (_, i) => {
            const at = i / n;
            if (t < at * 0.8) return null;
            const grow = Math.min(1, (t - at * 0.8) * 4);
            const y = headY - reach * at;
            const x = heroX + (((i * 53) % 100) / 100 - 0.5) * w * 0.5;
            const tall = 34 * grow;
            return (
              <Polygon key={i} points={`${x},${y - tall} ${x + 10},${y} ${x - 10},${y}`} fill={color} opacity={0.9} />
            );
          })}
        </G>
      );
    }
    // 暴風雪:雪片**往上飄**(玩家往前衝進暴風雪裡),整片壓在跑道前段。
    return (
      <G opacity={a}>
        <Rect x={0} y={frontY} width={w} height={Math.max(0, headY - frontY)} fill={color} opacity={0.16} />
        {Array.from({ length: 26 }, (_, i) => {
          const x = (((i * 53) % 100) / 100) * w;
          const y0 = (((i * 31) % 100) / 100) * h;
          const y = headY - ((y0 + t * h * 1.1) % h);
          return (
            <Path key={i} d={`M${x} ${y} l6 14`} stroke={color} strokeWidth={2} strokeLinecap="round" opacity={0.85} />
          );
        })}
      </G>
    );
  }

  // ---- 木:二階荊棘往前爬,三階巨木往前撐開 ----
  if (el === 'wood') {
    if (tier === 2) {
      return (
        <G opacity={a} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round">
          {Array.from({ length: 5 }, (_, i) => {
            const x = ((i + 0.5) / 5) * w;
            const dir = i % 2 === 0 ? 1 : -1;
            const grow = reach * t;
            return (
              <Path key={i} d={`M${x} ${headY} C${x + 22 * dir} ${headY - grow * 0.45} ${x - 18 * dir} ${headY - grow * 0.7} ${x + 8 * dir} ${headY - grow}`} />
            );
          })}
        </G>
      );
    }
    const trunkH = reach * t;
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

  // ---- 土:二階石頭往前砸,三階地裂往前劈開 ----
  if (tier === 2) {
    // 石頭是**丟出去的**:從勇者腳邊往前拋,越前面的越小(拋得越遠)。
    // 先前是從天上往下掉,那個方向跟敵人丟過來的武器一樣,兩者不能長得像。
    return (
      <G opacity={a}>
        {Array.from({ length: 7 }, (_, i) => {
          const lane = ((i * 37) % 100) / 100 - 0.5;
          const speed = 0.6 + ((i * 29) % 40) / 100;
          const d = reach * t * speed;
          const x = heroX + lane * w * 0.7 * t;
          const y = headY - d;
          return <Circle key={i} cx={x} cy={y} r={(7 + (i % 3) * 3) * (1 - t * 0.35)} fill={color} opacity={0.9} />;
        })}
      </G>
    );
  }
  // 地裂:裂縫從勇者腳下**往前**劈開(縱向),不是橫著劃過跑道。
  const open = 4 + t * 22;
  const segs = 6;
  const crack = Array.from({ length: segs + 1 }, (_, k) => {
    const y = headY - (reach * t * k) / segs;
    const x = heroX + (k === 0 ? 0 : (k % 2 === 0 ? 1 : -1) * (10 + k * 6));
    return `${k === 0 ? 'M' : 'L'}${x} ${y}`;
  }).join(' ');
  return (
    <G opacity={a}>
      <Path d={crack} stroke={color} strokeWidth={open} fill="none" strokeLinecap="round" />
      <Path d={crack} stroke="#16161c" strokeWidth={Math.max(1, open * 0.45)} fill="none" strokeLinecap="round" />
    </G>
  );
}
