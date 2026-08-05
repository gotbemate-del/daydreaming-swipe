#!/usr/bin/env python3
"""裝備圖示:把 assets/sprites/items 的 501 張原圖縮成圖鑑用的小圖,並產生 require 對應表。

## 為什麼一定要縮

原圖是 329~750px、整包 47MB,而圖鑑格子只畫 40px。直接 require 進去等於「為了 40px 的東西
載 47MB」——這個專案已經在敵人的動畫格上踩過一次(39MB → 5.7MB,見 align-frames.py)。

縮到 ICON_MAX(112px)是留 3x DPR 餘裕之後的尺寸:40px x 3 = 120,再小就會在高解析手機上糊掉。
**只縮圖鑑用的複本,原圖完全不動**——跑圖裡投擲的武器仍然吃原圖(它在畫面上比較大)。

## 產生什麼

  assets/sprites/items-icons/**.png   縮圖(跟原圖同一套路徑結構)
  components/itemIcons.ts             require 對應表(**產生檔,不要手改**)

跑法:python3 scripts/shrink-items.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'sprites' / 'items'
OUT = ROOT / 'assets' / 'sprites' / 'items-icons'
TABLE = ROOT / 'components' / 'itemIcons.ts'

# 圖鑑格子 40px,留 3x DPR 餘裕。
ICON_MAX = 112


def shrink(src: Path, dst: Path) -> None:
    img = Image.open(src)
    # 顯式組 alpha:img.convert('RGBA') 會把 GIF/PNG 的 transparency 索引一起套用,
    # 把純黑打成透明(史萊姆的眼睛整片被挖空)。這個坑記在 CLAUDE.md,不要簡化這一行。
    if img.mode != 'RGBA':
        img = Image.merge('RGBA', (*img.convert('RGB').split()[:3], Image.new('L', img.size, 255)))
    w, h = img.size
    scale = min(1.0, ICON_MAX / max(w, h))
    if scale < 1.0:
        img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, optimize=True)


def key_for(path: Path) -> str:
    """檔案 → 對應表的 key。跟 game/codexEntries.ts 的 entryKey 必須完全一致。"""
    return path.stem


def main() -> None:
    files = sorted(SRC.rglob('*.png'))
    rows = []
    for f in files:
        rel = f.relative_to(SRC)
        dst = OUT / rel
        shrink(f, dst)
        rows.append((key_for(f), f"../assets/sprites/items-icons/{rel.as_posix()}"))

    lines = [
        '// **產生檔(scripts/shrink-items.py),不要手改。**',
        '//',
        '// 裝備圖鑑用的小圖。原圖 47MB / 501 張,格子只畫 40px,所以另外縮一份 112px 的複本',
        '// (留 3x DPR 餘裕)。跑圖裡投擲的武器仍然吃原圖 —— 它在畫面上比較大。',
        '//',
        "// key 就是原圖的檔名(不含副檔名),跟 game/codexEntries.ts 的 entryKey 是同一個字串。",
        "import type { ImageSourcePropType } from 'react-native';",
        '',
        'export const ITEM_ICONS: Record<string, ImageSourcePropType> = {',
    ]
    for key, path in rows:
        lines.append(f"  '{key}': require('{path}'),")
    lines.append('};')
    lines.append('')
    lines.append('export function itemIcon(key: string): ImageSourcePropType | undefined {')
    lines.append('  return ITEM_ICONS[key];')
    lines.append('}')
    lines.append('')
    TABLE.write_text('\n'.join(lines), encoding='utf-8')

    total = sum(p.stat().st_size for p in OUT.rglob('*.png'))
    before = sum(p.stat().st_size for p in SRC.rglob('*.png'))
    print(f'{len(rows)} 張:{before / 1e6:.1f}MB → {total / 1e6:.1f}MB')


if __name__ == '__main__':
    main()
