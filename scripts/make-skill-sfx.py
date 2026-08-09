#!/usr/bin/env python3
"""六元素主動技能的傷害音效:合成 12 個短音(六元素 x 二三階)。

## 為什麼是合成,不是挑既有素材

`assets/sounds/` 只有 8 個檔,而且全部是通用的 UI 音(按鈕、升級、事件),
沒有任何一個聽起來像「火燒起來」或「金屬碎刃」。拿 UI 音當傷害音的話,
六個元素會全部聽起來一樣——而**聲音是這 18 款技能唯一還沒被用上的辨識管道**
(顏色與字形已經在用了,見 SkillIcon)。

所以這裡直接合成。純 stdlib(`wave` + `array`),不依賴 numpy——這支腳本要能在
任何一台機器上跑起來,而它一年可能只跑一次。

## 為什麼只做二三階(12 個),不做一階

一階是**被動**,效果發生在「每一次命中」上(燃燒擴散、連鎖閃電、凍結判定)。
一波打下來是幾十上百次命中,每次播一聲會變成機關槍——那不是音效,是噪音。
二三階是主動,冷卻 10~26 秒,一場最多響個十幾次,每一次都是一個事件。

## 每個元素要聽得出是誰

同一族的二三階共用**音色**,三階更低更長(份量比較重)——這跟圖示的
「同族共用字形,階級疊層數」是同一條規則:一眼(一耳)認出是哪一族,再分辨份量。

  火  帶噪音的呼嘯,中心頻率往下掃      → 像一團火竄過去
  金  非諧波泛音的金屬撞擊,尾音會響    → 像刀刃相擊
  雷  極短的爆裂 + 低頻轟鳴            → 先劈後轟
  冰  高頻碎裂,衰減很快                → 像玻璃碎掉
  木  低頻悶擊,幾乎沒有尾音            → 木頭敲擊
  土  低頻隆隆,起音慢                  → 地面裂開

跑法:python3 scripts/make-skill-sfx.py
"""

import array
import math
import random
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'sounds' / 'skills'

# 22050 Hz 單聲道,跟既有的 bgm.wav 同一個規格。
# 這些是短音(0.3~0.7 秒),22kHz 已經夠——44kHz 只是讓打包多一倍大。
RATE = 22050
# 峰值留一點空間:音效會跟 BGM 疊在一起播,推到 1.0 兩個一起會爆。
PEAK = 0.72


def env(n, total, attack, decay_pow):
    """起音 + 指數衰減。attack 用線性(要俐落),衰減用冪次(尾巴才自然)。"""
    a = max(1, int(attack * RATE))
    if n < a:
        return n / a
    t = (n - a) / max(1, total - a)
    return max(0.0, (1.0 - t) ** decay_pow)


class SVF:
    """狀態變數濾波器。要的是「噪音聽起來有顏色」,不是精確的頻率響應。"""

    def __init__(self, cutoff, q=1.0):
        self.low = 0.0
        self.band = 0.0
        self.set(cutoff, q)

    def set(self, cutoff, q):
        self.f = 2.0 * math.sin(math.pi * min(0.45, cutoff / RATE))
        self.damp = min(1.0, 1.0 / max(0.5, q))

    def step(self, x):
        self.low += self.f * self.band
        high = x - self.low - self.damp * self.band
        self.band += self.f * high
        return self.low, self.band, high


def write_wav(path, samples):
    """浮點 -1~1 → 16-bit PCM。整體正規化到 PEAK,免得六個元素音量忽大忽小。"""
    peak = max(1e-9, max(abs(s) for s in samples))
    scale = PEAK / peak
    data = array.array('h', (int(max(-32767, min(32767, s * scale * 32767))) for s in samples))
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(data.tobytes())
    return len(data)


def fire(dur, base):
    """火:帶噪音的呼嘯,band-pass 中心頻率一路往下掃 + 低頻的軀幹。"""
    n = int(dur * RATE)
    rng = random.Random(11)
    f = SVF(base * 3.0, 2.2)
    out = []
    for i in range(n):
        t = i / n
        f.set(base * (3.0 - 2.4 * t), 2.0 + 2.0 * t)
        _, band, _ = f.step(rng.uniform(-1, 1))
        body = math.sin(2 * math.pi * base * 0.5 * i / RATE) * 0.35
        out.append((band * 1.6 + body) * env(i, n, 0.004, 2.2))
    return out


def metal(dur, base):
    """金:非諧波泛音(像敲一根金屬棒),起音有一下噪音的撞擊。"""
    n = int(dur * RATE)
    rng = random.Random(22)
    partials = [(1.0, 1.0), (2.76, 0.55), (5.40, 0.32), (8.93, 0.18), (13.3, 0.10)]
    out = []
    for i in range(n):
        s = 0.0
        for mult, amp in partials:
            # 高泛音衰減得比較快,尾音才會慢慢變乾淨而不是一直刺耳。
            s += math.sin(2 * math.pi * base * mult * i / RATE) * amp * env(i, n, 0.001, 1.6 + mult * 0.35)
        click = rng.uniform(-1, 1) * env(i, int(0.006 * RATE), 0.0005, 3.0) if i < 0.006 * RATE else 0.0
        out.append(s * 0.45 + click * 0.5)
    return out


def thunder(dur, base):
    """雷:極短的爆裂(白噪音瞬態)+ 低頻轟鳴。先劈後轟。"""
    n = int(dur * RATE)
    rng = random.Random(33)
    lp = SVF(base * 6, 0.9)
    out = []
    for i in range(n):
        t = i / n
        # **爆裂必須是整段的峰值。** 第一版把轟鳴的權重寫成 (0.4 + 0.6t),
        # 結果尾巴的隆隆蓋過開頭的劈,量出來的起音是 15ms——聽起來像悶雷不像落雷。
        # 現在爆裂放大、轟鳴改成往下收,峰值才落在第一毫秒。
        crack = rng.uniform(-1, 1) * env(i, int(0.05 * RATE), 0.0003, 3.5) if i < 0.05 * RATE else 0.0
        low, _, _ = lp.step(rng.uniform(-1, 1))
        rumble = low * env(i, n, 0.02, 1.8) * 1.4
        boom = math.sin(2 * math.pi * base * 0.55 * i / RATE) * env(i, n, 0.015, 2.4) * 0.5
        out.append(crack * 2.2 + rumble * (0.9 - 0.45 * t) + boom)
    return out


def ice(dur, base):
    """冰:高頻碎裂,衰減很快。幾根高泛音 + 一串細碎的顆粒。"""
    n = int(dur * RATE)
    rng = random.Random(44)
    partials = [(1.0, 1.0), (1.63, 0.6), (2.41, 0.4), (3.77, 0.25)]
    out = []
    for i in range(n):
        s = 0.0
        for mult, amp in partials:
            s += math.sin(2 * math.pi * base * mult * i / RATE) * amp * env(i, n, 0.001, 3.0 + mult)
        # 顆粒:稀疏的爆點,像碎片彈開。
        grain = rng.uniform(-1, 1) if rng.random() < 0.06 else 0.0
        out.append(s * 0.4 + grain * env(i, n, 0.001, 4.0) * 0.45)
    return out


def wood(dur, base):
    """木:低頻悶擊,幾乎沒有尾音。泛音壓在低處而且衰減極快。"""
    n = int(dur * RATE)
    rng = random.Random(55)
    partials = [(1.0, 1.0), (2.1, 0.45), (3.4, 0.2)]
    out = []
    for i in range(n):
        s = 0.0
        for mult, amp in partials:
            s += math.sin(2 * math.pi * base * mult * i / RATE) * amp * env(i, n, 0.0015, 5.0 + mult * 1.5)
        knock = rng.uniform(-1, 1) * env(i, int(0.004 * RATE), 0.0003, 3.0) if i < 0.004 * RATE else 0.0
        out.append(s * 0.55 + knock * 0.35)
    return out


def earth(dur, base):
    """土:低頻隆隆,起音慢。噪音壓得很低 + 一顆沉的正弦。"""
    n = int(dur * RATE)
    rng = random.Random(66)
    lp = SVF(base * 2.2, 0.7)
    out = []
    for i in range(n):
        low, _, _ = lp.step(rng.uniform(-1, 1))
        body = math.sin(2 * math.pi * base * 0.7 * i / RATE)
        out.append((low * 1.8 + body * 0.55) * env(i, n, 0.03, 1.6))
    return out


# 每個元素:合成函式 + (二階的長度, 基頻) + (三階的長度, 基頻)。
# **三階一律更長更低**——份量比較重,而低音在小喇叭上也撐得住。
VOICES = {
    'fire': (fire, (0.34, 520), (0.62, 380)),
    'metal': (metal, (0.30, 1180), (0.52, 820)),
    'thunder': (thunder, (0.36, 260), (0.68, 180)),
    'ice': (ice, (0.28, 2600), (0.48, 1900)),
    'wood': (wood, (0.24, 300), (0.42, 210)),
    'earth': (earth, (0.38, 90), (0.70, 62)),
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for el, (fn, t2, t3) in VOICES.items():
        for tier, (dur, base) in ((2, t2), (3, t3)):
            path = OUT / f'{el}{tier}.wav'
            frames = write_wav(path, fn(dur, base))
            size = path.stat().st_size
            total += size
            print(f'{path.name:<14} {dur:.2f}s  {frames:>6} 取樣  {size / 1024:>6.1f} KB')
    print(f'\n共 {len(VOICES) * 2} 個檔,{total / 1024:.0f} KB → {OUT.relative_to(ROOT)}')
    print('一階是被動(每次命中都會觸發),刻意不做音效——那會變成機關槍。')


if __name__ == '__main__':
    main()
