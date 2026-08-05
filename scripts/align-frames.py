#!/usr/bin/env python3
"""兩格動畫的對齊 + 產生 components/animFrames.ts。

# 為什麼需要這一步

`assets/sprites` 裡每個造型都有 `_open` / `_middle` / `_click` 三張,但**三張的畫布大小不一樣**
(史萊姆 376x308 vs 401x203、哥布林 336x453 vs 584x359),而且每一張都被裁到剛好貼齊內容
(alpha 的 bbox 等於整張畫布)。直接丟給 `resizeMode="contain"` 輪播的話,兩格會各自被縮到
不同大小、站在不同高度——播起來是整隻怪在原地抽搐,不是在動。

CLAUDE.md 記著同一個坑:「兩格動畫要對齊**身體重心**,不能用整張圖的 bbox
(國王實測兩格差 103px,直接播會左右跳)」。這支腳本就是把那件事做成建置步驟。

# 怎麼對齊

同一個造型的兩格放到**同一張畫布**上,對齊兩件事:

  水平:alpha 加權的**重心**(不是 bbox 中心)。噴刺、飄浮的小點左右不對稱,
        用 bbox 中心會被那些點帶偏,而重心看的是「大部分的身體在哪」。
  垂直:**底邊**(腳踩的那條線)。史萊姆壓扁的那一格本來就比較矮,
        對齊中心的話牠會浮起來;對齊底邊才是「蹲下去」。

**畫布要長大,不能沿用待機格的畫布。** 實測直接裁到待機格的大小,巨蟒會掉 20.5%
的不透明像素(牠的動作格是立起來的,比待機高一截)、魔王四型掉 16.2%——那是把頭切掉。

# 畫布長大之後角色不能跟著縮水

畫布變大而顯示框不變的話,`contain` 會把角色縮小(哥布林的動作格寬到 584,
待機格就被壓成原本的 55%)。所以這裡同時輸出幾何比例,畫面端照著算框:

  boxW = size * wRatio,boxH = size * hRatio   (size = 原本那個 42/84/132)
  left = 中心 - boxW * anchor,top = 地面線 - boxH

三個數字全是**比例**,所以下面的縮圖完全不影響它們。

# 縮圖

畫面上小怪畫 42px、精英 84px、魔王 132px,而來源是 400~750px——直接打包等於為了
42px 的東西載 300KB。照用途各自設上限(還留了 3x DPR 的餘裕),整包從 39MB 降到 5MB 以下。
**只縮這裡輸出的動畫格**,原圖不動:轉職畫面的立繪還是要大張的。

# 透明度的坑(CLAUDE.md 也記著)

不要用 `img.convert('RGBA')`:它會把來源的 transparency 索引一起套用,把純黑打成透明
(史萊姆的眼睛整片被挖空)。這裡的來源本來就是 RGBA,所以直接讀 alpha;真的要轉的話
必須顯式組 alpha。腳本會驗證「對齊後的不透明像素數不少於來源」,切到身體會當場報錯。

用法:python3 scripts/align-frames.py
"""

from pathlib import Path
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('需要 Pillow:pip install Pillow')

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'sprites' / 'anim'
TS_OUT = ROOT / 'components' / 'animFrames.ts'

# 兩格之間留多少餘裕(比例)。動作格有可能超出待機格的輪廓,畫布只取兩張的極值
# 會讓動作格剛好貼邊,看起來像被切到。
MARGIN = 0.04

# 縮圖上限(最長邊,像素)。留了 3x DPR 的餘裕:
#   小怪畫 42px(精英 84)→ 256 綽綽有餘
#   魔王畫 132px → 400
#   勇者波的敵人畫 42px → 160(轉職畫面用的是原圖,不受影響)
MAX_EDGE = {'monsters': 256, 'boss': 400, 'jobs': 160}


def alpha_centroid_x(img: Image.Image) -> float:
    """alpha 加權的水平重心。回傳畫布座標(像素)。"""
    alpha = img.getchannel('A')
    w, h = alpha.size
    data = alpha.load()
    total = 0.0
    weighted = 0.0
    for y in range(h):
        for x in range(w):
            a = data[x, y]
            if a:
                total += a
                weighted += a * x
    if total == 0:
        return w / 2
    return weighted / total


def opaque_count(img: Image.Image) -> int:
    return sum(1 for v in img.getchannel('A').getdata() if v > 0)


def build_pair(frames: list[Path], out_prefix: Path, max_edge: int) -> dict:
    images = [Image.open(p) for p in frames]
    for img, p in zip(images, frames):
        if img.mode != 'RGBA':
            sys.exit(f'{p} 不是 RGBA,這支腳本不做格式轉換(轉換會踩到 transparency 索引的坑)')

    centroids = [alpha_centroid_x(img) for img in images]
    # 畫布寬度:每一格「重心左邊要多寬、右邊要多寬」各取極值,兩邊都容得下才不會切到。
    left = max(centroids)
    right = max(img.size[0] - c for img, c in zip(images, centroids))
    height = max(img.size[1] for img in images)
    canvas_w = int(round((left + right) * (1 + MARGIN)))
    canvas_h = int(round(height * (1 + MARGIN)))
    anchor_x = (left / (left + right)) * canvas_w

    # 尺寸基準:待機格(第 0 格)原本 contain 進正方形框時的縮放。照這個算,
    # 畫布長大之後角色的大小跟舊版一模一樣,長出來的部分只是往外延伸。
    base_fit = max(images[0].size)

    scale = min(1.0, max_edge / max(canvas_w, canvas_h))
    out_w = max(1, int(round(canvas_w * scale)))
    out_h = max(1, int(round(canvas_h * scale)))

    for index, (img, cx) in enumerate(zip(images, centroids)):
        canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        # 水平:重心對到 anchor_x。垂直:底邊貼齊畫布底部(腳踩的那條線)。
        canvas.paste(img, (int(round(anchor_x - cx)), canvas_h - img.size[1]))
        if opaque_count(canvas) < opaque_count(img):
            sys.exit(f'{out_prefix} 第 {index} 格被切到了,畫布算錯')
        if scale < 1.0:
            canvas = canvas.resize((out_w, out_h), Image.LANCZOS)
        out = out_prefix.parent / f'{out_prefix.name}_{index}.png'
        out.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(out, optimize=True)

    return {
        'wRatio': canvas_w / base_fit,
        'hRatio': canvas_h / base_fit,
        'anchor': anchor_x / canvas_w,
        'frames': len(images),
    }


def ts_entry(key: str, rel: str, geom: dict) -> str:
    frames = ', '.join(f"require('../{rel}_{i}.png')" for i in range(geom['frames']))
    return (
        f"  '{key}': {{\n"
        f"    frames: [{frames}],\n"
        f"    wRatio: {geom['wRatio']:.4f}, hRatio: {geom['hRatio']:.4f}, anchor: {geom['anchor']:.4f},\n"
        f"  }},\n"
    )


def main() -> None:
    monsters_ts: list[str] = []
    jobs_ts: list[str] = []

    # 怪物與魔王:{原型}_open.png / {原型}_middle.png
    monsters = ROOT / 'assets' / 'sprites' / 'monsters' / 'ai'
    for open_frame in sorted(monsters.glob('*_open.png')):
        name = open_frame.name[: -len('_open.png')]
        middle = monsters / f'{name}_middle.png'
        if not middle.exists():
            continue
        limit = MAX_EDGE['boss'] if name.startswith('boss') else MAX_EDGE['monsters']
        prefix = OUT / 'monsters' / name
        geom = build_pair([open_frame, middle], prefix, limit)
        monsters_ts.append(ts_entry(name, f'assets/sprites/anim/monsters/{name}', geom))
        print(f'monsters/{name}')

    # 職業立繪:四個資料夾三種命名(jobs 沒有分支、jobs2 是 _A/_B、jobs3/4 多了 _open)。
    # **職業比怪物多一格**:`_click` 當投擲動作(勇者波的敵人丟武器時要換成它),
    # 三格共用同一張畫布,所以畫面端只要換 source,位置與大小完全不會跳。
    hero = ROOT / 'assets' / 'sprites' / 'hero'
    for folder in ['jobs', 'jobs2', 'jobs3', 'jobs4']:
        d = hero / folder
        if not d.is_dir():
            continue
        for middle in sorted(d.glob('*_middle.png')):
            stem = middle.name[: -len('_middle.png')]
            first = d / f'{stem}_open.png'
            if not first.exists():
                first = d / f'{stem}.png'
            if not first.exists():
                continue
            frames = [first, middle]
            click = d / f'{stem}_click.png'
            if click.exists():
                frames.append(click)
            prefix = OUT / folder / stem
            geom = build_pair(frames, prefix, MAX_EDGE['jobs'])
            jobs_ts.append(ts_entry(f'{folder}/{stem}', f'assets/sprites/anim/{folder}/{stem}', geom))
            print(f'{folder}/{stem}')

    TS_OUT.write_text(
        '// 這個檔是 scripts/align-frames.py 產生的,不要手改——改了下次跑腳本就沒了。\n'
        '//\n'
        '// 每一組是「對齊過的兩格」+ 幾何比例。兩格共用同一張畫布(重心對齊、底邊對齊),\n'
        '// 所以畫面端只要換 source 就好;比例是給畫框用的,見 align-frames.py 的說明。\n'
        "import type { ImageSourcePropType } from 'react-native';\n\n"
        'export interface AnimArt {\n'
        '  /** 第 0 格是待機、第 1 格是動作。兩格畫布完全一樣。 */\n'
        '  frames: ImageSourcePropType[];\n'
        '  /** 框寬 = size * wRatio(size 就是原本那個 42/84/132) */\n'
        '  wRatio: number;\n'
        '  /** 框高 = size * hRatio */\n'
        '  hRatio: number;\n'
        '  /** 身體重心在框裡的水平位置(0~1)。左邊 = 中心 - 框寬 * anchor。 */\n'
        '  anchor: number;\n'
        '}\n\n'
        'export const MONSTER_ANIM: Record<string, AnimArt> = {\n'
        + ''.join(monsters_ts)
        + '};\n\n'
        'export const JOB_ANIM: Record<string, AnimArt> = {\n'
        + ''.join(jobs_ts)
        + '};\n',
        encoding='utf-8',
    )
    print(f'\n怪物 {len(monsters_ts)} 組、職業 {len(jobs_ts)} 組 → {TS_OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
