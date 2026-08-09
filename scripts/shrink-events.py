#!/usr/bin/env python3
"""彩蛋圖:把 assets/sprites/events 全部 604 張壓小,並產生 components/eventArt.ts。

## 為什麼要壓

原圖整個資料夾 59MB,而主畫面上那個彩蛋框只有 240px 寬——為了 240px 的東西擺 59MB,
是「對齊後的動畫格要縮圖再打包」那條規則的第二次現身。

## 為什麼是 WebP 不是 PNG

這些圖是**照片式的插畫**(漸層的天空、樹叢、人物陰影),不是像素圖——PNG 對這種內容
幾乎壓不動(縮到 320px 之後每張還要 35KB,604 張 21MB)。同樣的畫面 WebP q78 只要 8KB,
全部 604 張加起來約 5MB。**只有這個資料夾這樣做**:跑道上的角色與 UI 仍然是 PNG,
它們是像素圖,一經有損壓縮邊緣就會糊掉(而那正是這款的美術identity)。

## 為什麼要裁白邊

一部分來源圖是漫畫格,四周帶著白色紙邊。畫框是要讓圖填滿的,白邊留著就會在框裡
出現一條白帶,讀起來是「圖沒對齊」——而 `cover` 再怎麼填也去不掉,因為那是原圖的一部分。

## 為什麼全部收

604 張裡有 570 張是職業專屬的(job-<職業>-<階>-<稀有度>)。雖然這款的主角永遠是史萊姆,
但彩蛋圖本來就不是在描述主角——它是「這個世界還有這些故事」,所以全部都放。

只壓出來的複本,**原圖一張都不動**。
"""
from __future__ import annotations

import pathlib
import re

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'sprites' / 'events'
DST = ROOT / 'assets' / 'sprites' / 'events-small'
OUT_TS = ROOT / 'components' / 'eventArt.ts'

# 彩蛋框裡的圖大約 240px 寬,留一點 DPR 餘裕。
MAX_W = 320
QUALITY = 78
SRC_RE = re.compile(r'\.png$', re.IGNORECASE)

# 邊界要多白、佔多少比例才算「白邊」。
WHITE = 240
WHITE_RATIO = 0.9


def trim_white(img: Image.Image) -> Image.Image:
    """把四邊的白框裁掉。

    有一部分來源圖是**漫畫格**,四周帶著白色的紙邊。畫面上那個彩蛋框是要讓圖**填滿**的,
    白邊留著就會在框裡出現一條白帶——玩家讀起來是「圖沒對齊」或「載壞了」,
    而它其實是原圖的一部分,`cover` 再怎麼填也去不掉。

    判斷方式是逐行/逐列看「有幾成的像素接近純白」,超過門檻就往內縮一格。
    刻意保守(90%):畫面本身有大片白(雪地、白牆)的那幾張只會被削掉最外面一兩列。
    """
    rgb = img.convert('RGB')
    w, h = rgb.size
    px = rgb.load()

    def row_white(y: int) -> bool:
        n = sum(1 for x in range(w) if min(px[x, y]) >= WHITE)
        return n / w >= WHITE_RATIO

    def col_white(x: int) -> bool:
        n = sum(1 for y in range(h) if min(px[x, y]) >= WHITE)
        return n / h >= WHITE_RATIO

    top, bottom, left, right = 0, h - 1, 0, w - 1
    while top < bottom and row_white(top):
        top += 1
    while bottom > top and row_white(bottom):
        bottom -= 1
    while left < right and col_white(left):
        left += 1
    while right > left and col_white(right):
        right -= 1
    # 全白(或幾乎全白)的圖不要裁成一條線——那種情況原樣送出去。
    if right - left < w * 0.3 or bottom - top < h * 0.3:
        return img

    # **有一部分來源圖是「一張紙上兩格漫畫」**:主圖之後隔一條白色的縫,再露出第二格的一角。
    # 只裁外框的話那條縫與第二格會跟著被 cover 填進畫框裡,看起來就是「圖右邊有一條白帶」。
    # 作法:從主圖的右半邊往右找第一條「整欄都白」的縫,切在那裡。
    gutter = None
    for x in range(left + int((right - left) * 0.4), right + 1):
        n = sum(1 for y in range(top, bottom + 1) if min(px[x, y]) >= WHITE)
        if n / (bottom - top + 1) >= WHITE_RATIO:
            gutter = x
            break
    if gutter is not None and gutter - left >= (right - left) * 0.4:
        right = gutter - 1

    # 同一件事的橫向版本:有些來源圖在主圖**下面**壓了一條說明字帶(白底黑字)。
    # 那條字帶在這款是多餘的——說明由 game/eventText.ts 給,而且它會被 cover 拉進畫框裡。
    # 一樣找「整列都白」的那條縫,切在那裡。
    hgutter = None
    for y in range(top + int((bottom - top) * 0.6), bottom + 1):
        n = sum(1 for x in range(left, right + 1) if min(px[x, y]) >= WHITE)
        if n / (right - left + 1) >= WHITE_RATIO:
            hgutter = y
            break
    if hgutter is not None and hgutter - top >= (bottom - top) * 0.6:
        bottom = hgutter - 1

    return img.crop((left, top, right + 1, bottom + 1))


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    names: list[str] = []
    for path in sorted(SRC.iterdir()):
        if not SRC_RE.search(path.name):
            continue
        img = Image.open(path)
        # 顯式組 alpha:直接 convert('RGBA') 會把來源的 transparency 索引套上去,
        # 純黑的線條會被整片挖空(CLAUDE.md 記過這個坑)。
        if img.mode != 'RGBA':
            img = img.convert('RGB')
            img = Image.merge('RGBA', (*img.split()[:3], Image.new('L', img.size, 255)))
        img = trim_white(img)
        if img.width > MAX_W:
            h = round(img.height * MAX_W / img.width)
            img = img.resize((MAX_W, h), Image.LANCZOS)
        name = path.stem + '.webp'
        img.convert('RGB').save(DST / name, 'WEBP', quality=QUALITY, method=6)
        names.append(name)

    lines = [
        'import type { ImageSourcePropType } from \'react-native\';',
        '',
        '/**',
        ' * 彩蛋圖。**產生檔**(scripts/shrink-events.py),不要手改。',
        ' *',
        ' * 主畫面點史萊姆會隨機翻出一張(見 MainMenu)。604 張全收,',
        ' * 壓成 WebP(照片式插畫,PNG 壓不動:21MB vs 5MB)。',
        ' *',
        ' * `EVENT_KEYS` 是每一張的檔名(去掉副檔名)。畫面拿它換成一句說明——',
        ' * **翻出一張沒有說明的圖等於沒有內容**:玩家看得到畫面,但不知道自己翻到了什麼。',
        ' * 檔名本身就帶著資訊(職業 / 階級 / 稀有度),所以說明由它推,不必另外維護一份文案表。',
        ' */',
        'export const EVENT_ART: ImageSourcePropType[] = [',
    ]
    for name in names:
        lines.append(f"  require('../assets/sprites/events-small/{name}'),")
    lines.append('];')
    lines.append('')
    lines.append('export const EVENT_KEYS: string[] = [')
    for name in names:
        lines.append(f"  '{name[:-5]}',")
    lines.append('];')
    lines.append('')
    OUT_TS.write_text('\n'.join(lines), encoding='utf-8')
    total = sum((DST / n).stat().st_size for n in names)
    print(f'{len(names)} 張 -> {total / 1024 / 1024:.2f} MB')


if __name__ == '__main__':
    main()
