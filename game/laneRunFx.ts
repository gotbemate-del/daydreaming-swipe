import { elementOf, skillTier, type RunSkillId } from './laneRunSkills';

/**
 * 主動技能的**接觸範圍**。
 *
 * ## 為什麼放在 game/ 而不是畫面層
 *
 * 這一份同時被兩邊讀:`components/SkillFx.tsx` 照它畫,`hooks/useLaneRun.ts` 照它判傷害。
 * 各留一份的話就會出現這款最不能有的那種 bug——**看起來打到了但沒反應**
 *(隊形的橫向座標 `SQUAD_DX` 就是為了同一個理由放在 game/ 的)。
 * 這裡只有純幾何,沒有任何 React/RN 的東西。
 *
 * ## 座標系
 *
 * - `x`:跑道的橫向位置,0 = 最左、1 = 最右(跟 `WaveMonster.offset` 同一個單位)
 * - `y`:**往前多遠**,0 = 勇者腳下、1 = 視野邊緣(= `VISIBLE_AHEAD`)
 *
 * 兩軸都是正規化的,所以螢幕多寬多高都不影響判定——這是 `heroHalfSpan` 那條
 *「判定框不能跟著螢幕變」的同一個要求。
 *
 * ## 為什麼是方框不是真的形狀
 *
 * 畫面上是火球、扇形刀陣、閃電折線;判定用**包住它的方框**。玩家分不出「圓的邊緣」與
 *「方框的角落」差的那幾像素,而方框讓判定變成四次比較——一波最多 400 隻,
 * 一次觸發要判上百次,形狀越簡單越好。方向上刻意**寧可小一點**:
 * 判定比畫面窄一點的話,玩家只會覺得「差一點」;反過來會覺得「這也算?」。
 */
export interface FxBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** 二階打到跑道中段、三階打到底。畫面與判定共用這一個數字。 */
export function fxReach(tier: 1 | 2 | 3): number {
  return tier === 2 ? 0.5 : 0.86;
}

/** 金的扇形半角(弧度)。二階窄、三階幾乎打滿整條跑道。 */
export function fxSpread(tier: 1 | 2 | 3): number {
  return tier === 2 ? 0.5 : 0.95;
}

function box(x0: number, x1: number, y0: number, y1: number): FxBox {
  return {
    x0: Math.max(0, Math.min(1, Math.min(x0, x1))),
    x1: Math.max(0, Math.min(1, Math.max(x0, x1))),
    y0: Math.max(0, Math.min(y0, y1)),
    y1: Math.max(0, Math.max(y0, y1)),
  };
}

/**
 * 這一款技能在進度 t(0~1)時碰得到哪些格子。
 *
 * 每一款都跟它畫出來的樣子對應(見 components/SkillFx.tsx 的同名分支):
 *   火二階 往前衝的火球 → 一顆沿著中線推進的方塊
 *   火三階 整片火牆     → 從勇者到前緣的整條帶子
 *   金     扇形碎刃     → 扇形的外接方框(越往前越寬)
 *   雷二階 一道落雷     → 勇者正上方的一根柱子
 *   雷三階 五道落雷     → 五根等距的柱子
 *   冰二階 依序竄出的冰錐 → 已經冒出來的那幾根各一格
 *   冰三階 暴風雪       → 整片(跟火三階一樣是帶子,但打得更遠)
 *   木二階 荊棘         → 左右交錯的幾條
 *   木三階 巨木         → 由近而遠的幾棵
 *   土二階 往前拋的石頭 → 幾顆散開的方塊
 *   土三階 地裂         → 一條沿著中線往前劈的縫
 */
export function fxHitBoxes(id: RunSkillId, t: number, heroX: number): FxBox[] {
  const tier = skillTier(id);
  if (tier === 1) return [];
  const el = elementOf(id);
  const reach = fxReach(tier);
  const front = reach * t;

  if (el === 'fire') {
    if (tier === 2) {
      // 火球:一顆往前推的方塊,越飛越大。
      const r = 0.09 + t * 0.06;
      return [box(heroX - r, heroX + r, Math.max(0, front - r * 1.6), front + r * 1.6)];
    }
    // 火牆:整條跑道,從腳下推到前緣。
    return [box(0, 1, 0, front)];
  }

  if (el === 'metal') {
    // 扇形:刀子沿著 ±spread 射出去,所以外接方框的寬度跟著距離長。
    const half = Math.sin(fxSpread(tier)) * front;
    return [box(heroX - half, heroX + half, 0, front)];
  }

  if (el === 'thunder') {
    // 落雷打在跑道的**上半段**(畫面上是從天上劈下來的那一段),柱子有寬度。
    const bolts = tier === 2 ? 1 : 5;
    const w = 0.11;
    const y0 = reach * 0.34;
    const y1 = reach * 0.92;
    return Array.from({ length: bolts }, (_, i) => {
      const x = bolts === 1 ? heroX : (i + 0.5) / bolts;
      return box(x - w, x + w, y0, y1);
    });
  }

  if (el === 'ice') {
    if (tier === 2) {
      // 冰錐:由近而遠依序竄出,已經冒出來的那幾根才算數(跟畫面同一個 at * 0.8 判斷)。
      const n = 6;
      const out: FxBox[] = [];
      for (let i = 0; i < n; i++) {
        const at = i / n;
        if (t < at * 0.8) continue;
        const x = heroX + (((i * 53) % 100) / 100 - 0.5) * 0.5;
        out.push(box(x - 0.07, x + 0.07, reach * at - 0.05, reach * at + 0.05));
      }
      return out;
    }
    return [box(0, 1, 0, front)];
  }

  if (el === 'wood') {
    if (tier === 2) {
      // 荊棘:左右交錯的六條,一條一條往前抽。
      const n = 6;
      const out: FxBox[] = [];
      for (let i = 0; i < n; i++) {
        const at = i / n;
        if (t < at * 0.75) continue;
        const dir = i % 2 === 0 ? 1 : -1;
        const x = heroX + dir * (0.05 + i * 0.03);
        out.push(box(x - 0.06, x + 0.06, reach * at, reach * at + reach * 0.34));
      }
      return out;
    }
    // 巨木:五棵由近而遠。
    const n = 5;
    const out: FxBox[] = [];
    for (let i = 0; i < n; i++) {
      const at = i / n;
      if (t < at * 0.7) continue;
      const x = heroX + (((i * 47) % 100) / 100 - 0.5) * 0.6;
      out.push(box(x - 0.09, x + 0.09, reach * at, reach * at + reach * 0.3));
    }
    return out;
  }

  // 土
  if (tier === 2) {
    // 石頭:七顆往前拋,越前面的越散。
    return Array.from({ length: 7 }, (_, i) => {
      const lane = ((i * 37) % 100) / 100 - 0.5;
      const speed = 0.6 + ((i * 29) % 40) / 100;
      const d = front * speed;
      const x = heroX + lane * 0.7 * t;
      return box(x - 0.05, x + 0.05, d - 0.04, d + 0.04);
    });
  }
  // 地裂:一條沿著中線往前劈的縫,越裂越開。
  const w = 0.06 + t * 0.08;
  return [box(heroX - w, heroX + w, 0, front)];
}

/** 這一點在不在任何一個方框裡。 */
export function fxHits(boxes: FxBox[], x: number, y: number): boolean {
  return boxes.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
}
