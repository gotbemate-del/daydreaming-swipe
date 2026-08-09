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
