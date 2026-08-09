#!/usr/bin/env python3
"""彩蛋圖:把 assets/sprites/events 的通用事件圖縮小,並產生 components/eventArt.ts。

## 為什麼要縮

原圖整個資料夾 58MB(604 張),而主畫面上那個彩蛋框只有 240px 寬——
為了 240px 的東西載 58MB 是「對齊後的動畫格要縮圖再打包」那條規則的第二次現身。

## 為什麼只收 34 張

604 張裡有 570 張是**職業專屬**的(job-<職業>-<階>-<稀有度>)。主角在這款永遠是史萊姆
(轉職不換造型),所以那 570 張沒有對應的東西可以配;通用的 common/rare/epic/legendary
共 34 張才是「誰都看得懂」的彩蛋。少收也讓打包量從 58MB 掉到不到 1MB。

只縮出來的複本,**原圖一張都不動**。
"""
from __future__ import annotations

import pathlib
import re

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'sprites' / 'events'
DST = ROOT / 'assets' / 'sprites' / 'events-small'
OUT_TS = ROOT / 'components' / 'eventArt.ts'

# 彩蛋框裡的圖大約 240px 寬,留 2x DPR 的餘裕。
MAX_W = 480
GENERIC = re.compile(r'^(common|rare|epic|legendary)-\d+\.png$')


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    names: list[str] = []
    for path in sorted(SRC.iterdir()):
        if not GENERIC.match(path.name):
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
        img.save(DST / path.name, optimize=True)
        names.append(path.name)

    lines = [
        'import type { ImageSourcePropType } from \'react-native\';',
        '',
        '/**',
        ' * 彩蛋圖。**產生檔**(scripts/shrink-events.py),不要手改。',
        ' *',
        ' * 主畫面點史萊姆會隨機翻出一張(見 MainMenu)。只收通用的 34 張:',
        ' * 另外 570 張是職業專屬的,而這款的主角永遠是史萊姆——轉職不換造型,',
        ' * 所以那些圖在畫面上沒有對應的東西可以配。',
        ' */',
        'export const EVENT_ART: ImageSourcePropType[] = [',
    ]
    for name in names:
        lines.append(f"  require('../assets/sprites/events-small/{name}'),")
    lines.append('];')
    lines.append('')
    OUT_TS.write_text('\n'.join(lines), encoding='utf-8')
    total = sum((DST / n).stat().st_size for n in names)
    print(f'{len(names)} 張 -> {total / 1024 / 1024:.2f} MB')


if __name__ == '__main__':
    main()
