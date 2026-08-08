#!/usr/bin/env python3
"""大關底圖:把 stages-src 的原圖縮成跑道用的複本,並產生 require 對應表。

## 為什麼一定要縮

原圖 887~1254px 寬、整包 20MB,而跑道最寬只有 520px(`styles.wrapper` 的 maxWidth)。
直接 require 進去等於「為了 520px 的東西載 20MB」——這個專案已經在敵人的動畫格
(39MB → 5.7MB)與裝備圖示(47MB → 6.6MB)上踩過兩次。

`BACKDROP_WIDTH` 768 是 520px 再留 1.5x 餘裕。不開到 3x 的理由是這批是**背景**不是主體:
它上面永遠疊著一層暗色 scrim(見 LaneRunner 的 backdropScrim),糊一點看不出來,
而背景是整場都在畫的東西,載入成本比清晰度重要。

**只縮複本,原圖不動**(stages-src 留在 repo 裡),哪天跑道變寬了才回得去。

## 產生什麼

  assets/sprites/backgrounds/stages/*.png   縮圖
  components/stageBackdrops.ts              require 對應表 + 長寬比(**產生檔,不要手改**)

跑法:python3 scripts/shrink-backdrops.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'sprites' / 'backgrounds' / 'stages-src'
OUT = ROOT / 'assets' / 'sprites' / 'backgrounds' / 'stages'
TABLE = ROOT / 'components' / 'stageBackdrops.ts'

# 跑道最寬 520px(LaneRunner 的 wrapper maxWidth),留 1.5x 餘裕。
BACKDROP_WIDTH = 768
# 調色盤量化:這批是像素風,256 色看不出差別,但檔案小一半以上。
PALETTE_COLORS = 256

# 罩上暗紗之後,地面應該有多亮(0~1 的相對亮度)。
#
# 為什麼要「每張圖各自算一個紗」而不是全部套同一個透明度:這批圖本身的亮度差 3 倍以上
# (草原 0.15、荒漠 0.52)。同一個透明度罩下去,荒漠那幾個大關的地面比草原亮三倍,
# 而閘門、傷害數字、白色提示文字的顏色是固定的——**同一組前景在不同大關的可讀性完全不一樣**,
# 荒漠關的「撞上石頭」幾乎讀不出來。反過來把紗加重到荒漠剛好,草原就整片黑掉。
#
# 0.13 是對著畫面底 #16161c(亮度 0.086)挑的:比背景稍亮一點,地面看得出是地面,
# 但前景仍然是畫面上最亮的東西。
SCRIM_TARGET = 0.13
# 紗的上下界。全下界是「這張圖本來就夠暗,別再壓」,全上界是「再壓下去就看不出是什麼場景了」——
# 兩邊都到頂的時候寧可讓亮度不齊,也不要把圖壓成一塊純色。
SCRIM_MIN, SCRIM_MAX = 0.18, 0.72

# 大關順序。**這一串就是 game/laneRun.ts 的 BACKDROPS,兩邊要一致**——
# 那邊是純邏輯(只吐 id),這邊是圖,分層鐵律不准 game/ 碰圖片資源。
ORDER = [
    ('grass', '草原'),
    ('jungle', '叢林'),
    ('sand', '荒漠'),
    ('snow', '雪原'),
    ('darkstone', '暗岩'),
    ('asphalt', '公路'),
    ('town', '石板城鎮'),
    ('alley', '舊城巷弄'),
    ('nightmarket', '夜市'),
    ('sewer', '下水道'),
]


def mix(rgb: tuple[int, int, int], target: int, amount: float) -> str:
    return '#' + ''.join(f'{round(c + (target - c) * amount):02x}' for c in rgb)


def luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255


def shrink(src: Path, dst: Path) -> tuple[int, int, str, str, str]:
    img = Image.open(src)
    # 顯式組 alpha:img.convert('RGBA') 會把 PNG 的 transparency 索引一起套用,把純黑打成透明
    # (史萊姆的眼睛整片被挖空)。這個坑記在 CLAUDE.md,不要簡化這一行。
    if img.mode != 'RGBA':
        img = Image.merge('RGBA', (*img.convert('RGB').split()[:3], Image.new('L', img.size, 255)))
    w, h = img.size
    if w > BACKDROP_WIDTH:
        img = img.resize((BACKDROP_WIDTH, max(1, round(h * BACKDROP_WIDTH / w))), Image.LANCZOS)
    # 底圖沒有透明區(它就是地面),丟掉 alpha 才進得了調色盤模式。
    rgb = img.convert('RGB')
    flat = rgb.quantize(colors=PALETTE_COLORS, method=Image.MEDIANCUT)
    dst.parent.mkdir(parents=True, exist_ok=True)
    flat.save(dst, optimize=True)

    # 底色與分隔線色從圖本身算,不要手填:圖換掉的時候顏色會自動跟上,
    # 而手填的那一組永遠會有人忘了改(症狀是圖載進來之前閃一下完全不搭的顏色)。
    avg = rgb.resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    assert isinstance(avg, tuple)
    # 這張圖要罩多重的紗,才會跟其他大關一樣亮(見 SCRIM_TARGET)。
    lum = luminance(avg)
    alpha = 1 - SCRIM_TARGET / lum if lum > 0 else SCRIM_MAX
    alpha = min(SCRIM_MAX, max(SCRIM_MIN, alpha))
    scrim = f'#0c0c10{round(alpha * 255):02x}'

    # base 壓暗:它只在圖載進來之前撐場面,亮了會閃一下。edge 提亮才看得出兩條跑道的界線。
    # 兩個都要照紗算完的亮度來配,不然圖載進來的那一刻顏色會跳一下。
    w, h = img.size
    return w, h, mix(avg, 0, 0.45 + alpha * 0.4), mix(avg, 255, 0.30 * (1 - alpha)), scrim


def main() -> None:
    rows = []
    for key, label in ORDER:
        src = SRC / f'{key}.png'
        if not src.exists():
            raise SystemExit(f'缺少原圖:{src}')
        dst = OUT / f'{key}.png'
        w, h, base, edge, scrim = shrink(src, dst)
        rows.append((key, label, w, h, base, edge, scrim, dst.stat().st_size))
        print(f'{key:<12} {w}x{h}  {dst.stat().st_size / 1024:>4.0f} KB  base {base}  edge {edge}  scrim {scrim}')

    lines = [
        '// **產生檔(scripts/shrink-backdrops.py),不要手改。**',
        '//',
        '// 大關底圖。原圖 20MB / 10 張放在 assets/sprites/backgrounds/stages-src,',
        '// 跑道最寬只有 520px,所以另外縮一份 768px 的複本(留 1.5x 餘裕)。',
        '//',
        '// key 就是 game/laneRun.ts 的 BackdropId —— 那邊是純邏輯只吐 id,',
        '// 圖片資源一律留在 components/ 這一層(CLAUDE.md 的分層鐵律)。',
        "import type { ImageSourcePropType } from 'react-native';",
        '',
        "import type { BackdropId } from '../game/laneRun';",
        '',
        '/**',
        ' * 底圖本身,加上名字與四個由圖算出來的數字:',
        ' *   name    給玩家看的名字(生存模式抽地圖的 toast 會印出來)',
        ' *   aspect  長寬比(width / height)—— 畫面照這個比例鋪才不會被拉扁',
        ' *   base    圖載進來之前的底色(整張的平均色壓暗)',
        ' *   edge    兩條跑道之間的分隔線顏色(平均色提亮)',
        ' *   scrim   罩在圖上的暗紗。**逐張不同**——這批圖本身的亮度差三倍以上,',
        ' *           套同一個透明度的話,亮的那幾個大關前景會讀不出來(見 shrink-backdrops.py',
        ' *           的 SCRIM_TARGET)。畫面只管照著疊,不要在那一層再調一次。',
        ' */',
        'export const STAGE_BACKDROPS: Record<',
        '  BackdropId,',
        '  {',
        '    source: ImageSourcePropType;',
        '    name: string;',
        '    aspect: number;',
        '    base: string;',
        '    edge: string;',
        '    scrim: string;',
        '  }',
        '> = {',
    ]
    for key, label, w, h, base, edge, scrim, _size in rows:
        lines.append(
            f"  {key}: {{\n"
            f"    source: require('../assets/sprites/backgrounds/stages/{key}.png'),\n"
            f"    name: '{label}', aspect: {w} / {h},\n"
            f"    base: '{base}', edge: '{edge}', scrim: '{scrim}',\n"
            f"  }},"
        )
    lines += ['};', '']
    TABLE.write_text('\n'.join(lines), encoding='utf-8')
    total = sum(r[7] for r in rows)
    print(f'\n{len(rows)} 張,合計 {total / 1024 / 1024:.1f} MB → {TABLE.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
