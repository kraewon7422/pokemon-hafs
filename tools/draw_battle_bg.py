"""배틀 배경 v2 (web/img/battle/bt2-*.png, 159×159 — 화면에는 위쪽 134줄, app.css .bt-field) — 3세대 배틀 화면처럼:
하늘 띠 (순서 디더링) · 먼 경치 (산 · 나무 줄 · 바다 · 모래 언덕 · 동굴 벽 …) · 땅 무늬 · 두 발판 (윗면 명암 + 옆면 + 외곽선).
발판 자리는 예전 CC0 배경 (isaiah658) 과 같음 → app.css 의 포켓몬 자리 (.bt-spr.foe 79.5%/42% · .me 21%/89%) 에 맞음. 2 대 2 자리도 들어가게 조금 넓힘.
전부 이 스크립트로 그림 (외부 그림 없음). 날씨 · 필드마다 하나 (battle.js BT_ENV_BG) + 보통 배경 7개 (BT_BG).
사용법: python tools/draw_battle_bg.py   (미리보기 .work/battle_bg_preview.png, 3배)"""
import math
import os
import random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = H = 159
VIS = 134                       # 화면에 보이는 줄
HOR = 38                        # 지평선
FOE = (125.5, 55, 28, 8)        # 상대 발판 (가운데 x, y, 가로 반지름, 세로 반지름)
ME = (33, 118, 32, 9)           # 내 발판
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def hx(s):
    s = s.lstrip('#'); return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, k):
    return tuple(int(round(a[i] + (b[i] - a[i]) * k)) for i in range(3))


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def bands(px, y0, y1, cols, x0=0, x1=W):
    n = len(cols) - 1
    for y in range(y0, y1):
        f = (y - y0) / max(1, y1 - y0 - 1) * n; i = min(n - 1, int(f)); k = f - i
        for x in range(x0, x1):
            px[x, y] = cols[i + 1] if k > (BAYER[y & 3][x & 3] + 0.5) / 16 else cols[i]


def put(px, x, y, c):
    if 0 <= x < W and 0 <= y < H: px[int(x), int(y)] = c


def ridge(px, base, amp, seed, col, edge=None, step=6, top=None, rough=0.5):
    """먼 산 · 언덕 줄: 꺾인 윗선 아래를 col 로, 윗선 1px = edge."""
    r = random.Random(seed); pts = []
    for x in range(-step, W + 2 * step, step):
        pts.append((x, base - int(amp * (0.5 + 0.5 * math.sin(x / (W / 2.3) + seed))) - r.randint(0, int(amp * rough))))
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        for x in range(max(0, x0), min(W, x1)):
            yy = int(y0 + (y1 - y0) * (x - x0) / (x1 - x0))
            for y in range(yy, top if top else HOR + 1): put(px, x, y, col)
            if edge: put(px, x, yy, edge)


def cloud(px, cx, cy, w, seed, cols):
    rnd = random.Random(seed); m = set(); n = max(2, w // 9)
    for i in range(n):
        x = cx - w // 2 + int((i + 0.5) * w / n); r = rnd.randint(4, 7) if 0 < i < n - 1 else rnd.randint(3, 4)
        for y in range(cy - r, cy + 1):
            for xx in range(x - r, x + r + 1):
                if (xx - x) ** 2 + (y - cy) ** 2 <= r * r: m.add((xx, y))
    tops = {}
    for x, y in m: tops[x] = min(tops.get(x, y), y)
    for x, y in m:
        k = (y - tops[x]) / max(1, cy - tops[x])
        put(px, x, y, cols[0] if k < 0.5 or (x, y - 1) not in m else cols[1] if k < 0.85 else cols[2])


def tree(px, x, y, h, pal, kind='round'):
    """나무 한 그루 (작게): pal = [외곽, 어두움, 중간, 밝음, 줄기]."""
    if kind == 'pine':
        for i in range(h):
            half = int((i + 1) * 0.45) if i < h - 2 else 0
            for dx in range(-half, half + 1):
                c = pal[3] if dx < -half // 2 else pal[2] if dx <= half // 3 else pal[1]
                if abs(dx) == half: c = pal[0]
                put(px, x + dx, y - h + i, c)
        put(px, x, y, pal[4]); put(px, x, y - 1, pal[4])
        return
    r = max(2, h // 2)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            d = dx * dx + dy * dy
            if d <= r * r:
                c = pal[3] if dx + dy < -r * 0.6 else pal[2] if dx + dy < r * 0.4 else pal[1]
                if d > (r - 1) * (r - 1) and (dy > 0 or dx > 0): c = pal[0]
                put(px, x + dx, y - h + r + dy, c)
    for i in range(h - 2 * r + 1): put(px, x, y - i, pal[4])


def platform(px, P, pal, kind='grass'):
    """발판 (3세대처럼): 윗면 타원 (테 진하게 · 가운데 · 왼쪽 위 밝은 면 디더링) + 아래 옆면 3px + 이어진 1px 외곽선.
    pal = [외곽선, 옆면, 테, 윗면, 밝은 면]."""
    cx, cy, rx, ry = P; side = 3
    topm, sidem = set(), set()
    for y in range(int(cy - ry - 2), int(cy + ry + side + 3)):
        for x in range(int(cx - rx - 2), int(cx + rx + 3)):
            u = (x + 0.5 - cx) / rx; v = (y + 0.5 - cy) / ry; vs = (y + 0.5 - side - cy) / ry
            if u * u + v * v <= 1: topm.add((x, y))
            elif u * u + vs * vs <= 1 and y > cy: sidem.add((x, y))
    allm = topm | sidem
    for (x, y) in allm:
        if (x, y) in topm:
            u = (x + 0.5 - cx) / rx; v = (y + 0.5 - cy) / ry; t = u * u + v * v
            c = pal[2] if t > 0.6 else pal[3]
            if 0.45 < t <= 0.6 and BAYER[y & 3][x & 3] < 8: c = pal[2]
            hl = ((u + 0.28) / 0.55) ** 2 + ((v + 0.35) / 0.5) ** 2           # 왼쪽 위 밝은 면
            if hl < 1 and (hl < 0.55 or BAYER[y & 3][x & 3] < 8): c = pal[4]
            if kind == 'grass' and t > 0.6 and (x * 5 + y * 3) % 7 == 0: c = pal[3]
            if kind == 'snow' and t <= 0.6 and (x * 7 + y * 3) % 13 == 0: c = (255, 255, 255)
            if kind == 'stone' and t <= 0.6 and (x * 11 + y * 5) % 17 == 0: c = pal[2]
        else:
            c = pal[1]
            if kind == 'grass' and y <= cy + ry + 1 and x % 2 == 0: c = pal[2]          # 옆면 위로 풀이 늘어짐
        if any((x + dx, y + dy) not in allm for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): c = pal[0]
        put(px, x, y, c)


def stripes(px, y0, cols):
    """3세대 땅 무늬: 지평선에서 멀어질수록 두꺼워지는 가로 띠 두 색 (경계는 디더링)."""
    y = y0; k = 0; th = 2
    while y < VIS:
        for yy in range(int(y), min(VIS, int(y + th))):
            for x in range(W):
                edge = yy == int(y) and BAYER[yy & 3][x & 3] < 8
                if k % 2 == 1 and not edge: px[x, yy] = mix(px[x, yy], cols, 0.18)
        y += th; th = th * 1.28 + 0.6; k += 1


def tufts(px, col, col2, seed, n=70, avoid=()):
    rnd = random.Random(seed)
    for _ in range(n):
        y = int(HOR + 3 + (rnd.random() ** 1.2) * (VIS - HOR - 4)); x = rnd.randrange(W)
        if any(((x - a) / (c + 4)) ** 2 + ((y - b) / (d + 6)) ** 2 < 1 for a, b, c, d in avoid): continue
        s = 1 + (y - HOR) // 30
        for i in range(s + 1):
            put(px, x - 1, y - i, col); put(px, x + 1, y - i, col)
        put(px, x, y - s - 1, col2); put(px, x, y, col)


def ripples(px, col, seed, avoid=(), density=1.0):
    rnd = random.Random(seed); y = HOR + 4
    while y < VIS:
        p = (y - HOR) / (VIS - HOR); L = 2 + int(p * 4); step = int((L * 3 + 4) / density)
        for x in range(rnd.randrange(step) - L, W, step):
            xx = x + rnd.randrange(-1, 2)
            if any(((xx - a) / (c + 3)) ** 2 + ((y - b) / (d + 5)) ** 2 < 1 for a, b, c, d in avoid): continue
            for i in range(L): put(px, xx + i, y + (0 if 0 < i < L - 1 else 1), col)
        y += 3 + int(p * 6)


def sky_sun(px, sx, sy, r, core, halo):
    for y in range(sy - r * 3, sy + r * 3 + 1):
        for x in range(sx - r * 3, sx + r * 3 + 1):
            d = math.hypot(x - sx, y - sy)
            if d <= r: put(px, x, y, core)
            elif d <= r * 2.6 and 0 <= x < W and 0 <= y < H and BAYER[y & 3][x & 3] < (r * 2.6 - d) * 3:
                px[x, y] = mix(px[x, y], halo, 0.5)


AV = (FOE, ME)


def base_plains(px, sky, far, ground, tuft, sunny=False, overcast=False):
    bands(px, 0, HOR, sky)
    if sunny: sky_sun(px, 30, 12, 5, hx('fffbe0'), hx('fff4b8'))
    CL = [hx('ffffff'), hx('e2ecf8'), hx('b8cce8')] if not overcast else [hx('c8ccd8'), hx('a8b0c0'), hx('8890a4')]
    for cx, cy, w, s in ((36, 13, 42, 1), (104, 9, 30, 2), (144, 22, 30, 3), (76, 25, 22, 4)) if not overcast else ((20, 8, 50, 1), (80, 5, 60, 2), (140, 10, 50, 3), (50, 18, 40, 4), (118, 22, 46, 5)):
        cloud(px, cx, cy, w, s, CL)
    ridge(px, HOR - 6, 9, 1.0, far[0], far[1], step=9)
    ridge(px, HOR - 1, 5, 2.3, far[2], far[3], step=5, rough=0.8)
    for x in range(2, W, 7):                                    # 먼 나무 줄
        tree(px, x + (x * 7) % 3, HOR + 1, 4 + (x * 13) % 3, [shade(far[2], 0.7), shade(far[2], 0.85), far[2], far[3], shade(far[2], 0.6)])
    bands(px, HOR + 1, H, ground)
    stripes(px, HOR + 2, shade(ground[0], 0.8))
    tufts(px, tuft[0], tuft[1], 3, n=45, avoid=AV)


def bg_plains(px):
    base_plains(px, [hx('5aa0f0'), hx('6eaef2'), hx('84bcf4'), hx('9ccaf4'), hx('b6d8f4'), hx('d0e6f2')],
                [hx('8eb4d8'), hx('a8c8e4'), hx('6a9a78'), hx('86b48c')], [hx('6cb05c'), hx('78bc64'), hx('84c46c'), hx('90cc74')], [hx('5a9a4c'), hx('a8dc84')])
    platform(px, FOE, [hx('3c6c34'), hx('7a5a3a'), hx('5c9c4c'), hx('7cc060'), hx('a0d880')])
    platform(px, ME, [hx('3c6c34'), hx('7a5a3a'), hx('5c9c4c'), hx('7cc060'), hx('a0d880')])


def bg_sunny(px):
    base_plains(px, [hx('3c8ef0'), hx('52a0f4'), hx('6cb2f6'), hx('8ac4f6'), hx('acd6f4'), hx('d8ecf0')],
                [hx('98b8d8'), hx('b4cce4'), hx('78a46c'), hx('98c47c')], [hx('84c050'), hx('90c858'), hx('9cd060'), hx('a8d868')], [hx('6ca844'), hx('d0f090')], sunny=True)
    platform(px, FOE, [hx('5a6c24'), hx('8a6a3a'), hx('7cac40'), hx('a0cc58'), hx('d0ec88')])
    platform(px, ME, [hx('5a6c24'), hx('8a6a3a'), hx('7cac40'), hx('a0cc58'), hx('d0ec88')])


def bg_rain(px):
    base_plains(px, [hx('586274'), hx('64708a'), hx('707e96'), hx('7e8ca2'), hx('8e9aae'), hx('a0aaba')],
                [hx('6c7a8c'), hx('7c8a9c'), hx('4a6a5a'), hx('5a7c6a')], [hx('4c7c4c'), hx('548654'), hx('5c8e5a'), hx('649662')], [hx('3e6a40'), hx('7aa678')], overcast=True)
    rnd = random.Random(9)                                      # 물웅덩이
    for cx, cy, rx in ((60, 70, 9), (96, 98, 12), (140, 120, 8), (20, 80, 6)):
        for y in range(cy - 2, cy + 3):
            for x in range(cx - rx, cx + rx + 1):
                if ((x - cx) / rx) ** 2 + ((y - cy) / 2.5) ** 2 <= 1: put(px, x, y, hx('7c94a8') if y < cy else hx('94aabc'))
    platform(px, FOE, [hx('2c4c30'), hx('5c4a38'), hx('4a7a48'), hx('5e9058'), hx('7aa870')])
    platform(px, ME, [hx('2c4c30'), hx('5c4a38'), hx('4a7a48'), hx('5e9058'), hx('7aa870')])


def bg_forest(px):
    bands(px, 0, HOR, [hx('78b4e0'), hx('8cc2e4'), hx('a6d0e6'), hx('c2dee4')])
    bands(px, HOR, H, [hx('3e8a44'), hx('489650'), hx('52a058'), hx('5aa860')])
    T1 = [hx('1c3a2a'), hx('24503a'), hx('2e6444'), hx('3c7a50'), hx('3a2a1e')]
    T2 = [hx('204a2c'), hx('2e6a3a'), hx('3e8448'), hx('56a058'), hx('4a3424')]
    for x in range(-4, W + 6, 9): tree(px, x, HOR + 2, 22 + (x * 7) % 9, T1, 'pine')
    for x in range(0, W + 6, 13): tree(px, x + 5, HOR + 4, 14 + (x * 5) % 6, T2, 'round')
    stripes(px, HOR + 5, hx('2e6a36'))
    for y in range(HOR + 3, VIS):                                # 나뭇잎 사이 빛 (사선)
        for x in range(W):
            if (x + y) % 37 < 3 and BAYER[y & 3][x & 3] < 5: px[x, y] = mix(px[x, y], hx('b8e890'), 0.35)
    tufts(px, hx('2e6a36'), hx('8ad070'), 5, n=90, avoid=AV)
    P = [hx('2a5a2c'), hx('6a4a2e'), hx('4a8a40'), hx('64a850'), hx('8cc870')]
    platform(px, FOE, P); platform(px, ME, P)


def bg_beach(px):
    bands(px, 0, HOR - 10, [hx('4c8ee8'), hx('62a0ee'), hx('7cb2f0'), hx('9ac4f2'), hx('bcd8f4')])
    for cx, cy, w, s in ((36, 12, 40, 1), (122, 16, 32, 2)): cloud(px, cx, cy, w, s, [hx('ffffff'), hx('e2ecf8'), hx('b8cce8')])
    for x in range(100, 140):                                   # 먼 섬
        yy = HOR - 10 - int(4 * math.sin((x - 100) / 40 * math.pi))
        for y in range(yy, HOR - 10): put(px, x, y, hx('8eb3c4'))
    bands(px, HOR - 10, HOR + 2, [hx('3c78c4'), hx('4a8ad0'), hx('5aa0da'), hx('6cb4e0')])
    for y in range(HOR - 9, HOR, 2):
        for x in range((y * 7) % 11, W, 11 + (y - HOR + 10)): put(px, x, y, hx('a8d8f4')); put(px, x + 1, y, hx('a8d8f4'))
    for x in range(W):
        yy = HOR + 1 + int(1.2 * math.sin(x / 6))
        put(px, x, yy, hx('ffffff')); put(px, x, yy + 1, hx('d8f0f8'))
    bands(px, HOR + 2, H, [hx('e2c49a'), hx('eccea6'), hx('f2d6b0'), hx('f6dcb6')])
    ripples(px, hx('dcb88e'), 4, AV, 0.8)
    P = [hx('8a6644'), hx('b08a62'), hx('d8b486'), hx('ecca9e'), hx('fae2bc')]
    platform(px, FOE, P, 'sand'); platform(px, ME, P, 'sand')
    for x, y, c in ((12, 64, hx('f08a5c')), (148, 92, hx('f6c2c0')), (84, 128, hx('f08a5c'))):   # 불가사리 · 조개 점
        put(px, x, y, c); put(px, x + 1, y, c); put(px, x, y - 1, c)


def bg_desert(px):
    bands(px, 0, HOR, [hx('63b3e1'), hx('8ccae4'), hx('bcdcdc'), hx('e8e4c4'), hx('fbdca6')])
    sky_sun(px, 128, 10, 4, hx('fffbe6'), hx('fff4d0'))
    ridge(px, HOR - 3, 10, 0.4, hx('d9b8b0'), hx('ead0c2'), step=11, rough=0.2)
    for x0, x1, t in ((8, 30, HOR - 18), (138, 150, HOR - 24)):   # 사암 돌기둥
        for y in range(t, HOR + 1):
            for x in range(x0 - (y - t) // 6, x1 + (y - t) // 6):
                k = (x - x0) / max(1, x1 - x0)
                put(px, x, y, hx('7a3f2e') if y == t or x == x0 - (y - t) // 6 or x == x1 + (y - t) // 6 - 1 else hx('e39a62') if k < 0.2 else hx('cc7448') if k < 0.7 else hx('a9563a'))
    bands(px, HOR + 1, H, [hx('dcb284'), hx('e8c290'), hx('f0cc9c'), hx('f4d4a8')])
    for x in range(W):
        yt = int(HOR + 9 - 5 * (0.5 + 0.5 * math.sin(x / 19 + 1)))
        put(px, x, yt, hx('fbe2b8'))
        for y in range(yt + 1, yt + 4):
            if BAYER[y & 3][x & 3] < 10 - (y - yt) * 3: put(px, x, y, hx('d6a676') if math.cos(x / 19 + 1) < 0 else hx('f0cc9c'))
    ripples(px, hx('d8aa78'), 6, AV)
    P = [hx('7a5232'), hx('a87850'), hx('d4a474'), hx('ecc08c'), hx('f8dcae')]
    platform(px, FOE, P, 'sand'); platform(px, ME, P, 'sand')
    for x, y in ((14, 58), (150, 100)):                          # 작은 선인장
        for i in range(6): put(px, x, y - i, hx('5c9e4f')); put(px, x + 1, y - i, hx('3f7a46'))
        put(px, x - 1, y - 3, hx('5c9e4f')); put(px, x - 1, y - 4, hx('5c9e4f')); put(px, x + 2, y - 2, hx('3f7a46')); put(px, x + 2, y - 3, hx('3f7a46'))


def bg_snowy(px):
    bands(px, 0, HOR, [hx('7ea8d8'), hx('92b8e0'), hx('a8c8e6'), hx('c0d8ec'), hx('d8e8f2')])
    ridge(px, HOR - 6, 14, 0.8, hx('a6bcd8'), hx('ffffff'), step=10, rough=0.4)
    for x in range(W):                                           # 눈 덮인 봉우리 꼭대기 하얗게
        for y in range(0, HOR):
            if px[x, y] == hx('a6bcd8') and y < HOR - 12: px[x, y] = hx('eef4fa') if (x + y) % 5 else hx('d4e0ee')
    bands(px, HOR, H, [hx('d2deea'), hx('dce6f0'), hx('e6eef6'), hx('eef4fa')])
    T = [hx('2c4a4a'), hx('3a5e5a'), hx('4c766c'), hx('e8f0f6'), hx('4a3a30')]
    for x in range(3, W, 10): tree(px, x, HOR + 2, 10 + (x * 7) % 5, T, 'pine')
    stripes(px, HOR + 4, hx('a8bcd4'))
    rnd = random.Random(5)
    for _ in range(90):
        x, y = rnd.randrange(W), rnd.randrange(HOR + 3, VIS); put(px, x, y, hx('ffffff') if rnd.random() < 0.6 else hx('c4d2e2'))
    P = [hx('7890ac'), hx('98aac0'), hx('c8d6e6'), hx('e6eef6'), hx('ffffff')]
    platform(px, FOE, P, 'snow'); platform(px, ME, P, 'snow')


def bg_cave(px):
    bands(px, 0, HOR, [hx('1a2a33'), hx('1e313a'), hx('243a44'), hx('2a434e')])
    rnd = random.Random(2); x = 0
    while x < W:
        w = rnd.choice((3, 5, 7)); ln = rnd.randint(5, 16)
        for y in range(ln):
            half = int(w / 2 * (1 - y / ln))
            for dx in range(-half, half + 1): put(px, x + dx, y, hx('56788a') if dx < 0 else hx('3c5866') if dx == 0 else hx('2c434e'))
        x += w + rnd.randint(0, 3)
    ridge(px, HOR - 2, 10, 1.7, hx('2e4a57'), hx('46697a'), step=7, rough=0.9)
    for cx, cy, col in ((30, HOR - 4, hx('6ee0d8')), (134, HOR - 2, hx('9ab8ff'))):    # 수정
        for i in range(5): put(px, cx, cy - i, col); put(px, cx + 2, cy - i + 2, shade(col, 0.7))
        put(px, cx - 2, cy - 1, shade(col, 0.8)); put(px, cx - 2, cy - 2, shade(col, 0.8))
    bands(px, HOR + 1, H, [hx('284858'), hx('2e5466'), hx('34647c'), hx('3a6e88')])
    stripes(px, HOR + 3, hx('1a3240'))
    for i in range(12):
        y = rnd.randrange(HOR + 4, VIS); x = rnd.randrange(W)
        if any(((x - a) / (c + 4)) ** 2 + ((y - b) / (d + 6)) ** 2 < 1 for a, b, c, d in AV): continue
        for k in range(rnd.randint(4, 12)): put(px, x + k, y + (k // 4) % 2, hx('1c3442'))
    P = [hx('14242c'), hx('2a4250'), hx('3e5e6e'), hx('527686'), hx('6e94a4')]
    platform(px, FOE, P, 'stone'); platform(px, ME, P, 'stone')


def bg_lake(px):
    bands(px, 0, HOR, [hx('9cc0e8'), hx('b0cce8'), hx('c4d8ea'), hx('d8e4ee'), hx('e8eef2')])
    ridge(px, HOR - 8, 7, 2.0, hx('b4c6dc'), hx('c8d6e6'), step=10, rough=0.3)
    ridge(px, HOR - 3, 5, 0.6, hx('9ab8c0'), hx('aec8cc'), step=6)
    bands(px, HOR, HOR + 22, [hx('8cb8d8'), hx('98c4e0'), hx('a6cee4')])       # 호수
    for y in range(HOR + 1, HOR + 22, 3):
        for x in range((y * 5) % 9, W, 13): put(px, x, y, hx('d8eef8')); put(px, x + 1, y, hx('d8eef8'))
    for x in range(W): put(px, x, HOR + 22, hx('e8f4f8'))
    bands(px, HOR + 23, H, [hx('8cc890'), hx('98d09a'), hx('a2d8a2'), hx('acdcaa')])
    for y in range(0, VIS):                                      # 옅은 안개 띠
        for x in range(W):
            if (abs(y - (HOR + 6)) < 4 or abs(y - 80) < 3) and BAYER[y & 3][x & 3] < 6: px[x, y] = mix(px[x, y], hx('f4f6fa'), 0.5)
    tufts(px, hx('6aa874'), hx('d8f0d8'), 8, n=40, avoid=AV)
    P = [hx('4c7a5c'), hx('7a6a58'), hx('7cb488'), hx('9ccca4'), hx('c4e4c8')]
    platform(px, FOE, P); platform(px, ME, P)


def bg_electric(px):
    bands(px, 0, HOR, [hx('2a2048'), hx('3c2a58'), hx('5a3864'), hx('84506a'), hx('b06c64')])
    rnd = random.Random(4)
    for _ in range(18): put(px, rnd.randrange(W), rnd.randrange(0, 18), hx('fff4c0'))
    for x0, h in ((6, 18), (20, 26), (34, 14), (118, 22), (132, 30), (148, 16)):   # 먼 발전소 · 철탑 실루엣
        for y in range(HOR - h, HOR + 1):
            for x in range(x0, x0 + 9): put(px, x, y, hx('1e1830'))
        for y in range(HOR - h + 3, HOR - 2, 4):
            for x in range(x0 + 2, x0 + 8, 3): put(px, x, y, hx('ffd84a') if rnd.random() < 0.7 else hx('6a5a30'))
    for x in range(56, 104):                                     # 전깃줄
        put(px, x, int(HOR - 16 + 3 * math.sin((x - 56) / 48 * math.pi)), hx('141020'))
    for t in (60, 100):
        for y in range(HOR - 20, HOR + 1): put(px, t, y, hx('141020'))
        for d in range(-3, 4): put(px, t + d, HOR - 18, hx('141020'))
    bands(px, HOR + 1, H, [hx('3a3a4a'), hx('44445a'), hx('4c4c64'), hx('545470')])
    for i in range(10):                                          # 바닥에 흐르는 노란 전기 줄
        y = HOR + 6 + i * 9; x = rnd.randrange(W); n = rnd.randint(8, 20)
        for k in range(n):
            yy = y + (1 if (k // 3) % 2 else 0)
            if not any(((x + k - a) / (c + 3)) ** 2 + ((yy - b) / (d + 5)) ** 2 < 1 for a, b, c, d in AV): put(px, x + k, yy, hx('f8e050') if k % 5 else hx('fff8c0'))
    P = [hx('2a2a3a'), hx('5a5a70'), hx('7a7a94'), hx('9696b0'), hx('b8b8d0')]
    platform(px, FOE, P, 'stone'); platform(px, ME, P, 'stone')


def bg_psychic(px):
    bands(px, 0, HOR, [hx('1c1238'), hx('2c1a4c'), hx('442462'), hx('643078'), hx('8a3c8c')])
    rnd = random.Random(7)
    for _ in range(26):
        x, y = rnd.randrange(W), rnd.randrange(0, HOR - 6); put(px, x, y, hx('ffe8ff') if rnd.random() < 0.5 else hx('c8a0ff'))
    sky_sun(px, 120, 12, 6, hx('f8d8ff'), hx('d8a0f0'))          # 분홍 달
    for x0 in (12, 30, 132):                                     # 무너진 기둥 (유적)
        h = 14 + (x0 * 3) % 9
        for y in range(HOR - h, HOR + 1):
            for x in range(x0, x0 + 6): put(px, x, y, hx('5a3a78') if x == x0 else hx('3a2458') if x == x0 + 5 else hx('4a2e68'))
        for x in range(x0 - 1, x0 + 7): put(px, x, HOR - h, hx('7a58a0'))
    bands(px, HOR + 1, H, [hx('5a2c6c'), hx('6a3478'), hx('783c84'), hx('84448e')])
    for r in range(8, 90, 9):                                    # 바닥의 이상한 물결 고리
        for a in range(0, 360, 2):
            x = 80 + r * 1.6 * math.cos(math.radians(a)); y = 88 + r * 0.45 * math.sin(math.radians(a))
            if HOR < y < VIS and not any(((x - a2) / (c + 3)) ** 2 + ((y - b) / (d + 5)) ** 2 < 1 for a2, b, c, d in AV): put(px, x, y, hx('a05cb0'))
    P = [hx('2c1640'), hx('4c2a64'), hx('8a4ca0'), hx('b070c0'), hx('e0a8ec')]
    platform(px, FOE, P, 'stone'); platform(px, ME, P, 'stone')


SCENES = {'plains': bg_plains, 'sunny': bg_sunny, 'rain': bg_rain, 'forest': bg_forest, 'beach': bg_beach, 'desert': bg_desert,
          'snowy': bg_snowy, 'cave': bg_cave, 'lake': bg_lake, 'electric': bg_electric, 'psychic': bg_psychic}


def main():
    out = os.path.join(ROOT, 'web', 'img', 'battle')
    cols = 4; sheet = Image.new('RGB', ((W + 4) * cols, (VIS + 4) * ((len(SCENES) + cols - 1) // cols)), (255, 0, 255))
    for i, (n, fn) in enumerate(SCENES.items()):
        im = Image.new('RGB', (W, H)); px = im.load(); fn(px)
        im.save(os.path.join(out, f'bt2-{n}.png'), optimize=True)
        sheet.paste(im.crop((0, 0, W, VIS)), ((i % cols) * (W + 4), (i // cols) * (VIS + 4)))
        print(n, os.path.getsize(os.path.join(out, f'bt2-{n}.png')), 'bytes')
    os.makedirs(os.path.join(ROOT, '.work'), exist_ok=True)
    sheet.resize((sheet.width * 3, sheet.height * 3), Image.NEAREST).save(os.path.join(ROOT, '.work', 'battle_bg_preview.png'))


if __name__ == '__main__':
    main()
