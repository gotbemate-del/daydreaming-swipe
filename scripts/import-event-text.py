#!/usr/bin/env python3
"""把姊妹作的彩蛋文字抽出來,產生 game/eventText.ts。

## 為什麼是「抽出來」而不是 import

彩蛋文字的本尊在姊妹作(`bozhan9527-ux/daydreaming-` 的 `game/events/`),那邊的結構
綁著它自己的觸發系統(等級、稀有度池、轉職狀態…)——整包搬過來會把那一整套規則也帶進來,
而這款根本沒有那些東西(沒有等級、沒有掛機、彩蛋是點史萊姆翻出來的)。
所以只取**兩個欄位**:`id`(剛好等於圖檔名)與 `payload`(那句話)。

## 用法

    python3 scripts/import-event-text.py /workspace/bozhan9527-ux/daydreaming-

沒有那個路徑就不用跑——產生檔已經進版控,這支只在姊妹作補了新彩蛋時才需要再跑一次。
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'game' / 'eventText.ts'

ENTRY = re.compile(r"id:\s*'([^']+)'.*?payload:\s*'((?:[^'\\]|\\.)*)'", re.S)


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    src = pathlib.Path(sys.argv[1]) / 'game' / 'events'
    if not src.is_dir():
        raise SystemExit(f'找不到 {src}')

    found: dict[str, str] = {}
    for path in sorted(src.rglob('*.ts')):
        text = path.read_text(encoding='utf-8')
        for m in ENTRY.finditer(text):
            key, payload = m.group(1), m.group(2)
            # 一則彩蛋在來源裡只會有一筆;真的重複就以先出現的為準(照檔名排序,穩定)。
            found.setdefault(key, payload.replace("\\'", "'"))

    lines = [
        '/**',
        ' * 彩蛋文字。**產生檔**(scripts/import-event-text.py),不要手改。',
        ' *',
        ' * 來源是姊妹作 `game/events/` 的 `payload` 欄位,key 就是圖檔名(去掉副檔名)——',
        ' * 兩邊本來就是同一批內容,只是那邊綁在它自己的觸發系統上(等級、稀有度池、轉職狀態),',
        ' * 這裡只要「這張圖配哪一句話」。',
        ' */',
        'export const EVENT_TEXT: Record<string, string> = {',
    ]
    for key in sorted(found):
        value = found[key].replace('\\', '\\\\').replace("'", "\\'")
        lines.append(f"  '{key}': '{value}',")
    lines.append('};')
    lines.append('')
    OUT.write_text('\n'.join(lines), encoding='utf-8')
    print(f'{len(found)} 則 -> {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
