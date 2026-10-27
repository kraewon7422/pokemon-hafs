"""스프라이트 아틀라스(web/sprites/atlas.png) 만들기.

- art/sprites/NNN.png (64x64, NNN = 도감번호 = (라인-1)*3+단계) 가 있으면 그걸 쓰고,
- 없으면 임시 몬스터를 자동으로 그린다 (라인마다 색/모양이 다르고 단계가 오를수록 커짐).
- 칸 배치: 12열, 칸 하나 64x64, 칸 번호 = 도감번호-1.  (web/js/sprites.js 가 같은 규칙으로 읽는다)

사용법:  python tools/build_atlas.py [--count 48]
"""
import argparse
import colorsys
import os
import random

from PIL import Image

COLS = 12
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 과목(라인)별 기본 색상 hue (0~1). 라인 수가 늘어나면 순환.
HUES = [0.58, 0.08, 0.33, 0.10, 0.62, 0.95, 0.52, 0.06, 0.75, 0.0, 0.85, 0.15, 0.45, 0.92, 0.02, 0.13]


def shade(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h % 1, max(0, min(1, s)), max(0, min(1, v)))
    return (round(r * 255), round(g * 255), round(b * 255), 255)


def placeholder(dex):
    """좌우대칭 랜덤 몬스터. 같은 도감번호면 항상 같은 그림."""
    line, stage = (dex - 1) // 3 + 1, (dex - 1) % 3 + 1
    rnd = random.Random(line * 7919)            # 라인 단위로 모양 공유 → 진화형끼리 닮음
    h = HUES[(line - 1) % len(HUES)]
    size = {1: 36, 2: 46, 3: 56}[stage]
    half = size // 2
    # 1) 라인 공통 "몸 모양" 마스크 (16x16 반쪽 → 확대)
    base = [[0] * 16 for _ in range(16)]
    for y in range(16):
        for x in range(8):
            d = ((x - 0) ** 2) / 64 + ((y - 9) ** 2) / 49
            base[y][x] = 1 if d < 1 + rnd.uniform(-0.25, 0.15) else 0
    for _ in range(3 + stage):                  # 단계가 오르면 뿔/귀 추가
        x, y = rnd.randrange(2, 8), rnd.randrange(0, 6)
        for k in range(rnd.randrange(2, 5)):
            if 0 <= y + k < 16:
                base[y + k][x] = 1
    img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    px = img.load()
    ox, oy = 32 - half, 62 - size
    solid = set()
    for y in range(size):
        for x in range(half):                    # x = distance from the centre column
            if base[y * 16 // size][x * 8 // half]:
                solid.add((31 - x, oy + y))
                solid.add((32 + x, oy + y))
    # feet
    for fx in (32 - half // 2 - 2, 32 + half // 2 - 1):
        for dx in range(3):
            for dy in range(2):
                solid.add((fx + dx, 62 - dy))
    light, mid, dark = shade(h, 0.35, 1.0), shade(h, 0.65, 0.88), shade(h, 0.8, 0.62)
    belly = shade(h + 0.08, 0.2, 1.0)
    for (x, y) in solid:
        # 빛은 왼쪽 위
        t = (x - ox) / size * 0.6 + (y - oy) / size * 0.8
        px[x, y] = light if t < 0.45 else mid if t < 0.95 else dark
        if abs(x - 32) < size * 0.18 and y > oy + size * 0.55:
            px[x, y] = belly
    # 외곽선
    outline = shade(h, 0.9, 0.28)
    for (x, y) in solid:
        if any((x + dx, y + dy) not in solid for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            px[x, y] = outline
    # 눈
    ey = oy + size * 2 // 5
    ex = max(3, half // 3)
    for sx in (32 - ex - 2, 32 + ex - 1):
        for dx in range(3):
            for dy in range(3):
                if (sx + dx, ey + dy) in solid:
                    px[sx + dx, ey + dy] = (255, 255, 255, 255)
        if (sx + 1, ey + 1) in solid:
            px[sx + 1, ey + 1] = (24, 24, 40, 255)
            px[sx + 1, ey + 2] = (24, 24, 40, 255)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--count', type=int, default=51)
    a = ap.parse_args()
    rows = (a.count + COLS - 1) // COLS
    atlas = Image.new('RGBA', (COLS * 64, rows * 64), (0, 0, 0, 0))
    real = 0
    for dex in range(1, a.count + 1):
        p = os.path.join(ROOT, 'art', 'sprites', f'{dex:03d}.png')
        if os.path.exists(p):
            spr = Image.open(p).convert('RGBA')
            assert spr.size == (64, 64), f'{p} must be 64x64 (got {spr.size})'
            real += 1
        else:
            spr = placeholder(dex)
        i = dex - 1
        atlas.paste(spr, ((i % COLS) * 64, (i // COLS) * 64))
    out = os.path.join(ROOT, 'web', 'sprites', 'atlas.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    atlas.save(out, optimize=True)
    print(f'{out}: {a.count} sprites ({real} real, {a.count - real} placeholder), {os.path.getsize(out)} bytes')


if __name__ == '__main__':
    main()
