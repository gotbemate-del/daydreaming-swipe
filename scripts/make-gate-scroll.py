#!/usr/bin/env python3
"""閘門的卷軸外框:從既有的 easteregg 框切出「上軸 / 紙身 / 下軸」三片。

## 為什麼要另外產圖,不直接用原檔

`assets/sprites/ui/frames/easteregg/edge_top.png` 本來就是一段卷軸(金色軸桿 + 羊皮紙),
但它有兩個問題讓它不能直接貼到跑道上:

1. **它是 RGB,沒有 alpha。** 軸桿上方那 9 列是深色留白,直接畫上去會在跑道上蓋出一條
   不透明的暗帶,而閘門是浮在會捲動的底圖上的。
2. **紙身要能拉長。** 閘門高 50px,而 edge_top 的紙身只有 30 列;直接 stretch 整張圖
   會把軸桿一起拉扁,金屬的高光糊掉就不像軸了。

所以這裡切成三片:**軸桿的高度固定,只有紙身會被拉長**(跟 PixelFrame 的九宮格同一個道理)。

## 為什麼是建置時產圖而不是畫面層裁切

跟 `shrink-items.py` / `align-frames.py` / `shrink-backdrops.py` 同一個理由:
畫面層每一格都做一次裁切是重複工,而且 react-native-web 沒有可靠的「裁一塊再拉伸」
(`filter` 那類東西在 RNW 上會被丟掉,CLAUDE.md 記過)。產成三張小圖之後,
畫面只要三個 `<Image>` 疊上去,一格三張、一排六張——比 PixelFrame 的一格八張少很多,
那正是當初閘門不套 PixelFrame 的原因。

## 去背

原圖是 RGB,所以**要顯式組 alpha**,不能用 `convert('RGBA')`
(CLAUDE.md:那一支會把 GIF 的 transparency 索引一起套用,把純黑挖成透明)。
這裡的做法是:只把**軸桿以外的深色留白**整列切掉,紙身與軸桿本身一個像素都不動——
不做逐像素去背,因為羊皮紙的暗處跟留白的顏色很接近,閾值一定會咬到紙。

跑法:python3 scripts/make-gate-scroll.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'sprites' / 'ui' / 'frames' / 'easteregg'
OUT = ROOT / 'assets' / 'sprites' / 'ui' / 'frames' / 'gate'

# 留白的顏色(深紫黑)。低於這個亮度而且接近無彩度的整列算留白。
PADDING_MAX_LUMA = 45


def luma(px):
    r, g, b = px[:3]
    return 0.299 * r + 0.587 * g + 0.114 * b


def row_is_padding(img, y):
    """整列都是深色留白才算——只要有一個像素亮起來就是內容(軸桿的高光)。"""
    return all(luma(img.getpixel((x, y))) <= PADDING_MAX_LUMA for x in range(img.width))


def trim_padding_rows(img):
    """把上下兩端的留白列切掉。中間的深色(軸桿下方的陰影線)要留著,那是內容。"""
    top = 0
    while top < img.height and row_is_padding(img, top):
        top += 1
    bottom = img.height
    while bottom > top and row_is_padding(img, bottom - 1):
        bottom -= 1
    return img.crop((0, top, img.width, bottom))


def with_alpha(img):
    """顯式組 alpha(全不透明)。**不要用 convert('RGBA')**,見檔頭。"""
    rgb = img.convert('RGB')
    return Image.merge('RGBA', (*rgb.split(), Image.new('L', rgb.size, 255)))


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    top = trim_padding_rows(Image.open(SRC / 'edge_top.png').convert('RGB'))
    bottom = trim_padding_rows(Image.open(SRC / 'edge_bottom.png').convert('RGB'))

    # 上軸:金桿 + 它底下一小段紙(接縫才不會突然變色)。
    # 「金桿有多高」用亮度找:羊皮紙比軸桿暗得多,由上往下第一個明顯變暗的位置就是交界。
    rod_rows = []
    for y in range(top.height):
        row = [luma(top.getpixel((x, y))) for x in range(top.width)]
        rod_rows.append(sum(row) / len(row))
    peak = max(rod_rows)
    rod_end = next((y for y, v in enumerate(rod_rows) if y > rod_rows.index(peak) and v < peak * 0.55), 8)
    rod_end = max(4, min(rod_end + 2, top.height - 4))

    top_piece = top.crop((0, 0, top.width, rod_end))
    # 紙身取自 edge_top 軸桿以下那一段:它是純紙,拉長不會糊掉任何結構。
    body_piece = top.crop((0, rod_end, top.width, top.height))

    # 下軸同樣只留軸桿那一段,從底部往上找。
    # **兩端要一樣厚**:edge_bottom 原檔的軸桿上面還連著 20 幾列羊皮紙,整片拿來用的話
    # 下軸會是上軸的四倍高,50px 的閘門裡紙身只剩 12px——看起來不是卷軸,是一條木頭。
    bot_rows = [
        sum(luma(bottom.getpixel((x, y))) for x in range(bottom.width)) / bottom.width
        for y in range(bottom.height)
    ]
    bot_peak_at = bot_rows.index(max(bot_rows))
    rod_start = bot_peak_at
    while rod_start > 0 and bot_rows[rod_start - 1] >= max(bot_rows) * 0.55:
        rod_start -= 1
    rod_start = max(0, min(rod_start - 2, bottom.height - 4))
    bottom_piece = bottom.crop((0, rod_start, bottom.width, bottom.height))

    for name, img in (
        ('scroll_top.png', top_piece),
        ('scroll_body.png', body_piece),
        ('scroll_bottom.png', bottom_piece),
    ):
        with_alpha(img).save(OUT / name)
        print(f'{name}  {img.width}x{img.height}')

    print(f'\n輸出到 {OUT.relative_to(ROOT)}')
    print('畫面端照「上軸固定高 + 紙身拉長 + 下軸固定高」疊三張(見 components/LaneRunner.tsx)。')


if __name__ == '__main__':
    main()
