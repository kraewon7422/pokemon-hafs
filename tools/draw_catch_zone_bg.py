"""잡기 화면 구역 배경 v2 (web/img/catch/{shore,desert,cave,snow,lava,plant,dragon}.png, 270×480) — 사파리존 해변·연못 / 사막 / 동굴 / 눈밭 / 용암 / 발전소 / 용의 굴.
v1 (git 2026-11-05) 은 배틀 배경 조각을 늘려 붙여서 거칠었음 → v2 는 전부 이 스크립트에서 도트로 그림 (외부 그림 없음):
  층층이 깔린 하늘 (순서 디더링 띠) · 먼 산/메사 실루엣 · 모래 언덕 명암 · 물결 무늬 줄 · 외곽선 있는 소품 (선인장 · 바위 · 뼈 · 조개 · 불가사리 · 종유석 · 수정).
지평선 HOR · 포켓몬 자리 SPOT 은 draw_catch_bg.py · catch.js 와 같아야 함. 맨 윗줄 · 맨 아랫줄 색 = catch.js EDGE 와 같음.
사용법: python tools/draw_catch_zone_bg.py   (미리보기: .work/catch_zone_bg_preview.png, 2배)"""
import math
import os
import random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 270, 480
HOR = 236                     # 지평선 (draw_catch_bg.py 와 같음 — catch.js 의 원근이 이 줄에 맞춰져 있음)
SPOT = (W // 2, 352)          # 포켓몬이 설 자리 (catch.js SPOT_X · FEET_Y 와 같아야 함)
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def hexc(s):
    s = s.lstrip('#'); return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, k):
    return tuple(int(round(a[i] + (b[i] - a[i]) * k)) for i in range(3))


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


# ───────── 바탕 그리기 도구 ─────────
def bands(im, y0, y1, cols, x0=0, x1=W):
    """y0..y1 을 cols 색 띠로 (위 → 아래). 띠 사이는 4×4 순서 디더링 (3세대 하늘처럼 층이 보이되 부드럽게)."""
    px = im.load(); n = len(cols) - 1
    for y in range(y0, y1):
        f = (y - y0) / max(1, y1 - y0 - 1) * n
        i = min(n - 1, int(f)); k = f - i
        for x in range(x0, x1):
            t = (BAYER[y & 3][x & 3] + 0.5) / 16
            px[x, y] = cols[i + 1] + (255,) if k > t else cols[i] + (255,)


def run_shade(mask, pal, light=(-1, -1), rib=0):
    """마스크 (set of (x,y)) 를 덩어리처럼 칠함: pal = [외곽선, 어두움, 중간, 밝음, (반짝)].
    빛은 왼쪽 위. 가로 구간 안 위치 (+ 세로 구간 안 위치) 로 명암 3단계, 가장자리 = 외곽선. rib > 0 이면 세로 줄 (선인장 골)."""
    out = {}; rows = {}; cols = {}
    for x, y in mask: rows.setdefault(y, []).append(x); cols.setdefault(x, []).append(y)
    for y, xs in rows.items():
        xs.sort(); runs = []; s = p = xs[0]
        for x in xs[1:]:
            if x != p + 1: runs.append((s, p)); s = x
            p = x
        runs.append((s, p))
        for a, b in runs:
            for x in range(a, b + 1):
                ty0, ty1 = min(cols[x]), max(cols[x])
                tx = (x - a) / max(1, b - a); ty = (y - ty0) / max(1, ty1 - ty0)
                v = (1 - tx) * 0.7 + (1 - ty) * 0.3 if light == (-1, -1) else (1 - tx)
                c = pal[3] if v > 0.68 else pal[2] if v > 0.36 else pal[1]
                if rib and b - a >= 4 and (x - a) % rib == rib - 1 and 0 < x - a < b - a - 1: c = pal[1] if c != pal[1] else pal[0]
                if len(pal) > 4 and v > 0.86 and (x + y) % 3 == 0: c = pal[4]
                out[(x, y)] = c
    for (x, y) in mask:
        if any((x + dx, y + dy) not in mask for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            out[(x, y)] = pal[0]
    return out


def paint(im, pix, ox=0, oy=0):
    px = im.load()
    for (x, y), c in pix.items():
        X, Y = x + ox, y + oy
        if 0 <= X < W and 0 <= Y < H: px[X, Y] = c + (255,)


def blob(cx, cy, rx, ry, seed=0, rough=0.18):
    """울퉁불퉁한 타원 마스크 (바위, 아랫부분은 땅에 묻힘)."""
    rnd = random.Random(seed); ph = [rnd.random() * 6.28 for _ in range(3)]
    m = set()
    for y in range(int(cy - ry - 2), int(cy + ry + 3)):
        for x in range(int(cx - rx - 2), int(cx + rx + 3)):
            a = math.atan2((y - cy) / ry, (x - cx) / rx)
            r = 1 + rough * (math.sin(a * 2 + ph[0]) * 0.5 + math.sin(a * 3 + ph[1]) * 0.35 + math.sin(a * 5 + ph[2]) * 0.15)
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= r * r and y <= cy + ry * 0.55: m.add((x, y))
    return m


def capsule(m, x0, y0, x1, y1, r):
    """끝이 둥근 막대를 마스크에 더함."""
    for y in range(int(min(y0, y1) - r), int(max(y0, y1) + r) + 1):
        for x in range(int(min(x0, x1) - r), int(max(x0, x1) + r) + 1):
            vx, vy = x1 - x0, y1 - y0; L = vx * vx + vy * vy
            t = 0 if L == 0 else max(0, min(1, ((x - x0) * vx + (y - y0) * vy) / L))
            dx, dy = x - (x0 + vx * t), y - (y0 + vy * t)
            if dx * dx + dy * dy <= r * r + 0.3: m.add((x, y))


def ground_shadow(im, cx, cy, rx, ry, k=0.84):
    px = im.load()
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            if 0 <= x < W and 0 <= y < H and ((x - cx) / rx) ** 2 + ((y - cy) / max(1, ry)) ** 2 <= 1:
                px[x, y] = shade(px[x, y][:3], k) + (255,)


def spot(im, rim, mid, light, dark):
    """포켓몬 자리 (다른 배경과 같은 모양: 바깥 테 · 안쪽 밝은 면 · 아래 어두운 호)."""
    d = ImageDraw.Draw(im); cx, cy = SPOT
    d.ellipse((cx - 74, cy - 17, cx + 74, cy + 17), fill=rim + (255,))
    d.ellipse((cx - 66, cy - 13, cx + 66, cy + 13), fill=mid + (255,))
    d.ellipse((cx - 52, cy - 10, cx + 46, cy + 7), fill=light + (255,))
    d.arc((cx - 74, cy - 17, cx + 74, cy + 17), 10, 170, fill=dark + (255,), width=2)


def in_spot(x, y, pad=8):
    return ((x - SPOT[0]) / (74 + pad)) ** 2 + ((y - SPOT[1]) / (17 + pad)) ** 2 <= 1


def ripples(im, y0, y1, col, seed, density=1.0, avoid=None):
    """모래 물결 무늬: 줄을 맞춘 짧은 호 (멀수록 줄 간격 · 길이가 작음). 무작위 점이 아니라 바람 방향으로 정돈된 줄."""
    px = im.load(); rnd = random.Random(seed)
    y = y0 + 2
    while y < y1:
        p = (y - HOR) / (H - HOR)
        gap = 3 + int(p * 16); L = 3 + int(p * 9); step = int((L * 2.6 + 4) / density)
        off = rnd.randrange(step)
        for x in range(-L + off, W, step):
            xx = x + rnd.randrange(-2, 3)
            if avoid and avoid(xx + L // 2, y): continue
            for i in range(L):
                yy = y + (0 if 0 < i < L - 1 else 1)          # 가운데가 살짝 위 = 얕은 호
                X = xx + i
                if 0 <= X < W and y0 <= yy < y1: px[X, yy] = col + (255,)
        y += gap


def sprite(im, art, keys, x, y):
    """글자 그림 → 도트 (발 = 아래 가운데가 (x, y))."""
    rows = art.strip('\n').split('\n'); hgt = len(rows); wid = max(len(r) for r in rows)
    px = im.load()
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in keys:
                X, Y = x - wid // 2 + i, y - hgt + j
                if 0 <= X < W and 0 <= Y < H: px[X, Y] = keys[ch] + (255,)


# ───────── 소품 ─────────
CACT = [hexc('2c4a32'), hexc('3f7a46'), hexc('5c9e4f'), hexc('8cc265'), hexc('b8de8a')]


def saguaro(im, fx, fy, h, flip=False):
    """선인장 (사와로): 발 (fx, fy), 키 h px. 몸통 + 팔 두 개, 왼쪽 위 빛 · 세로 골 · 외곽선 · 땅 그림자."""
    r = max(2, round(h * 0.085)); m = set()
    capsule(m, 0, 0, 0, -h + r, r)
    s = 1 if flip else -1
    ar = max(1, r - 1)
    ay = -round(h * 0.42); ax = s * round(h * 0.26)
    capsule(m, 0, ay, ax, ay, ar); capsule(m, ax, ay, ax, ay - round(h * 0.26), ar)
    by = -round(h * 0.58); bx = -s * round(h * 0.22)
    capsule(m, 0, by, bx, by, ar); capsule(m, bx, by, bx, by - round(h * 0.2), ar)
    m = {(x, y) for x, y in m if y <= 0}
    ground_shadow(im, fx + round(h * 0.2), fy, round(h * 0.32), max(1, round(h * 0.06)))
    paint(im, run_shade(m, CACT, rib=2 if h > 26 else 0), fx, fy)


def rock(im, cx, fy, rx, ry, pal, seed, shadow=True):
    m = blob(0, 0, rx, ry, seed)
    if shadow: ground_shadow(im, cx + 2, fy, rx + 2, max(1, ry // 3))
    yb = max(y for _, y in m)
    paint(im, run_shade(m, pal), cx, fy - yb)


SKULL = """
.o.......o.
oho.....oho
.ohooooohho
..ohhhhhhho
..ohohhohho
..ohhhhhhso
...ohhhhso.
....oosso..
"""
RIBS = """
.o.o.o.o.
ohohohoho
osososoho
.o.o.o.o.
"""
SHELL = """
...ooooo...
..ohlhlho..
.ohlplplho.
ohlplplplho
ohpppppppho
.oosssssoo.
...ooooo...
"""
STAR = """
.....o.....
....oyo....
....oyo....
oooooyooooo
.oyyyyyyyo.
..oyyyyyo..
..oyyoyyo..
.oyyo.oyyo.
.ooo...ooo.
"""
TUMBLE = """
...ooooo...
.oo.b.b.oo.
o.b.bob.b.o
ob.bo.ob.bo
o.bob.bob.o
ob.b.o.b.bo
.oo.b.b.oo.
...ooooo...
"""


# ───────── 사막 ─────────
def desert():
    im = Image.new('RGBA', (W, H)); d = ImageDraw.Draw(im); px = im.load()
    sky = [hexc('63b3e1'), hexc('77bfe3'), hexc('8ccae4'), hexc('a3d3e2'), hexc('bcdcdc'), hexc('d4e2d0'), hexc('e8e4c4'), hexc('f6e2b4'), hexc('fbdca6')]
    bands(im, 0, HOR, sky)
    # 해: 하얀 원 + 옅은 테 두 겹 (디더링)
    sx, sy = 206, 62
    for y in range(sy - 30, sy + 31):
        for x in range(sx - 30, sx + 31):
            r = math.hypot(x - sx, y - sy)
            if r <= 10: px[x, y] = hexc('fffbe6') + (255,)
            elif r <= 12: px[x, y] = hexc('fff2c8') + (255,)
            elif r <= 20 and BAYER[y & 3][x & 3] < 8 - (r - 12): px[x, y] = mix(px[x, y][:3], hexc('fff4d0'), 0.45) + (255,)
            elif r <= 30 and BAYER[y & 3][x & 3] < 3: px[x, y] = mix(px[x, y][:3], hexc('fff4d0'), 0.25) + (255,)
    # 가는 구름 줄 (밑면 평평, 아래 옅은 그늘)
    for cx, cy, ln in ((52, 46, 70), (96, 58, 44), (150, 104, 60), (34, 120, 40), (232, 128, 46)):
        for i in range(ln):
            t = i / ln; hh = int(2.4 * math.sin(math.pi * t)) + 1; X = cx + i - ln // 2
            if not 0 <= X < W: continue
            for k in range(hh): px[X, cy - k] = (hexc('fbf6e8') if k == hh - 1 else hexc('eef0e6')) + (255,)
            px[X, cy + 1] = mix(px[X, cy + 1][:3], hexc('c8d6d8'), 0.5) + (255,)
    # 먼 메사 (안개 낀 자줏빛) — 평평한 꼭대기 · 절벽 · 지층
    far = [(0, HOR - 18), (14, HOR - 22), (22, HOR - 34), (58, HOR - 34), (64, HOR - 26), (78, HOR - 24), (86, HOR - 16), (120, HOR - 14),
           (132, HOR - 20), (136, HOR - 28), (170, HOR - 28), (176, HOR - 18), (204, HOR - 16), (214, HOR - 24), (222, HOR - 38), (252, HOR - 38), (258, HOR - 26), (270, HOR - 22), (270, HOR), (0, HOR)]
    d.polygon(far, fill=hexc('d9b8b0') + (255,))
    for (x0, y0), (x1, y1) in zip(far, far[1:]):
        if y0 == y1 and y0 < HOR: d.line((x0, y0, x1, y1), fill=hexc('ead0c2') + (255,))
    for x0, x1, top in ((22, 58, HOR - 34), (136, 170, HOR - 28), (222, 252, HOR - 38)):
        d.rectangle((x1 - 6, top + 1, x1, HOR), fill=hexc('cba59e') + (255,))
        for yy in range(top + 6, HOR - 4, 6): d.line((x0 + 2, yy, x1 - 8, yy), fill=hexc('d1aea6') + (255,))
    # 가까운 사암 메사 (왼쪽) · 돌기둥 (오른쪽) — 외곽선 · 지층
    MESA = [hexc('7a3f2e'), hexc('a9563a'), hexc('cc7448'), hexc('e39a62'), hexc('f2bd84')]

    def butte(edge, top, strata):
        """사암 메사/돌기둥: edge(y) → (왼쪽, 오른쪽) x. 앞면 = 중간색 · 왼쪽 띠 밝게 · 오른쪽 30% 그늘, 꼭대기 밝은 줄, 지층, 외곽선."""
        m = set()
        for y in range(top, HOR + 1):
            l, r = edge(y)
            for x in range(l, r): m.add((x, y))
        pix = {}
        for (x, y) in m:
            l, r = edge(y); t = (x - l) / max(1, r - l - 1)
            c = MESA[3] if t < 0.18 and l > 0 else MESA[2] if t < 0.7 else MESA[1]
            if l == 0: c = MESA[2] if t < 0.62 else MESA[1]
            if y <= top + 1: c = MESA[4]
            elif (y - top) % strata == strata // 2 and c != MESA[4]: c = shade(c, 0.86)
            if y > HOR - 12 and BAYER[y & 3][x & 3] < (y - (HOR - 12)): c = mix(c, hexc('e8c49a'), 0.5)    # 발치는 모래 먼지
            pix[(x, y)] = c
        for (x, y) in m:
            if any((x + dx, y + dy) not in m for dx, dy in ((1, 0), (-1, 0), (0, -1))) and (x, y - 1) is not None:
                if not (x == 0): pix[(x, y)] = MESA[0]
        paint(im, pix)

    def left_edge(y):
        if y < HOR - 30: return 0, 46 + (1 if (y // 5) % 2 else 0)                      # 곧은 절벽 (살짝 들쭉날쭉)
        return 0, int(47 + (y - (HOR - 30)) * 0.9)                                         # 아래 = 무너진 돌 비탈
    butte(left_edge, HOR - 60, 9)
    butte(lambda y: (226, 239) if y < HOR - 12 else (226 - (y - (HOR - 12)) // 2, 239 + (y - (HOR - 12)) // 2), HOR - 46, 8)
    # 아지랑이: 지평선 바로 위를 모래빛으로 흐리게 + 끊어진 밝은 줄
    for y in range(HOR - 10, HOR):
        k = (y - (HOR - 10)) / 10
        for x in range(W):
            if BAYER[y & 3][x & 3] < int(k * 12): px[x, y] = mix(px[x, y][:3], hexc('f8dcaa'), 0.55) + (255,)
    rnd = random.Random(3)
    for _ in range(26):
        y = rnd.randrange(HOR - 9, HOR - 1); x = rnd.randrange(W); n = rnd.randrange(4, 14)
        for i in range(n):
            if 0 <= x + i < W: px[x + i, y] = mix(px[x + i, y][:3], hexc('fff0cc'), 0.6) + (255,)
    # 땅 (멀리 = 진하고 탁함 → 가까이 = 맑은 모래, 맨 아랫줄 = #f5d6af)
    bands(im, HOR, H, [hexc('dcb284'), hexc('e4bc8c'), hexc('ecc898'), hexc('f1d0a4'), hexc('f5d6af')])

    def dune(base, amp, waves, phase, lit, sh, crest, depth):
        """모래 언덕 줄: 등성이 곡선, 왼쪽을 보는 비탈 = 밝게 · 반대 = 그늘, 등성이 1px 반짝, 아래는 바탕과 디더링으로 섞임."""
        for x in range(W):
            u = x / W * waves * 2 * math.pi + phase
            yt = int(round(base - amp * (0.5 + 0.5 * math.sin(u)) ** 1.4)); slope = math.cos(u)
            for y in range(yt, int(base + depth)):
                k = (y - yt) / max(1, base + depth - yt)
                if BAYER[y & 3][x & 3] / 16 < k * 1.25 - 0.25: continue
                q = 0.5 + 0.5 * slope                                   # 1 = 해를 보는 비탈 → 0 = 그늘, 디더링으로 넘어감
                px[x, y] = (lit if q > (BAYER[(y + 1) & 3][(x + 2) & 3] + 0.5) / 16 else sh) + (255,)
            px[x, yt] = crest + (255,)
    dune(HOR + 6, 9, 1.6, 0.6, hexc('ecc596'), hexc('cf9f6e'), hexc('f8dcb0'), 8)
    dune(HOR + 26, 14, 1.1, 2.2, hexc('f0cc9c'), hexc('d6a676'), hexc('fbe2b8'), 12)
    # 앞쪽 큰 언덕 (화면 아래 양옆, 포켓몬 자리는 비움): 등성이 반짝 줄 · 바로 아래 그늘 띠 (바람이 깎은 면) → 아래로 바탕과 섞임
    for side, base, hgt, span in ((0, H + 6, 58, 128), (1, H + 2, 44, 118)):
        for x in range(W):
            xx = x if side == 0 else W - 1 - x
            if xx >= span: continue
            yt = int(base - hgt * math.cos(xx / span * math.pi / 2) ** 1.3)
            for y in range(max(yt, 0), H):
                k = (y - yt)
                if k <= 0: c = hexc('fde6c0')
                elif side == 1 and k < 6: c = hexc('dcae7e') if k < 4 or BAYER[y & 3][x & 3] < 8 else hexc('ecc596')
                elif k < 18 and BAYER[y & 3][x & 3] < 16 - k: c = hexc('f8dcb2') if side == 0 else hexc('ecc596')
                else: continue
                px[x, y] = c + (255,)
    for x in range(W): px[x, H - 1] = hexc('f5d6af') + (255,)
    ripples(im, HOR + 30, H - 2, hexc('dcae7c'), 5, avoid=lambda x, y: in_spot(x, y))
    # 소품: 선인장 (원근에 맞게 작게) · 바위 · 뼈 · 회전초
    saguaro(im, 228, HOR + 13, 15, flip=True)
    saguaro(im, 30, HOR + 4, 9)
    saguaro(im, 44, 316, 40)
    ROCK = [hexc('6e4630'), hexc('9a6446'), hexc('bf855c'), hexc('dcaa7c')]
    rock(im, 218, 308, 9, 6, ROCK, 1); rock(im, 231, 312, 5, 4, ROCK, 2)
    rock(im, 24, 438, 12, 8, ROCK, 3); rock(im, 104, HOR + 22, 4, 3, ROCK, 4, shadow=False)
    BONE = {'o': hexc('8c7660'), 'h': hexc('f6efe0'), 's': hexc('d8ccb4')}
    sprite(im, SKULL, BONE, 236, 440); sprite(im, RIBS, BONE, 214, 444)
    sprite(im, TUMBLE, {'o': hexc('9a7448'), 'b': hexc('c49a62')}, 176, 286)
    spot(im, hexc('c79c72'), hexc('e2bc90'), hexc('ecca9e'), hexc('a87c56'))
    return im


# ───────── 해변 · 연못 ─────────
def cloud(im, cx, cy, w, seed, cols):
    """뭉게구름: 원 몇 개의 합 (밑면 평평), 위 밝게 · 아래 그늘 · 밑줄."""
    rnd = random.Random(seed); m = set(); n = max(3, w // 14)
    for i in range(n):
        x = cx - w // 2 + int((i + 0.5) * w / n); r = rnd.randint(8, 13) if 0 < i < n - 1 else rnd.randint(5, 8)
        for y in range(cy - r, cy + 1):
            for xx in range(x - r, x + r + 1):
                if (xx - x) ** 2 + (y - cy) ** 2 <= r * r: m.add((xx, y))
    for i in range(max(1, n - 2)):                       # 위에 한 층 더 (뭉게뭉게 솟은 머리)
        x = cx - w // 4 + int((i + 0.5) * (w // 2) / max(1, n - 2)) + rnd.randint(-4, 4); r = rnd.randint(7, 11); yc = cy - rnd.randint(7, 10)
        for y in range(yc - r, yc + r + 1):
            for xx in range(x - r, x + r + 1):
                if (xx - x) ** 2 + (y - yc) ** 2 <= r * r and y <= cy: m.add((xx, y))
    px = im.load(); tops = {}
    for x, y in m: tops[x] = min(tops.get(x, y), y)
    for (x, y) in m:
        if not (0 <= x < W and 0 <= y < H): continue
        k = (y - tops[x]) / max(1, cy - tops[x])
        c = cols[0] if k < 0.45 or (x, y - 1) not in m else cols[1] if k < 0.8 else cols[2]
        px[x, y] = c + (255,)
    for x in range(cx - w // 2 - 4, cx + w // 2 + 5):
        if (x, cy) in m and 0 <= x < W: px[x, cy] = cols[3] + (255,)


def shore():
    im = Image.new('RGBA', (W, H)); d = ImageDraw.Draw(im); px = im.load()
    SEA = 40
    bands(im, 0, HOR - SEA, [hexc('5e92eb'), hexc('6c9fee'), hexc('7cadf0'), hexc('8ebaf1'), hexc('a2c8f2'), hexc('b8d6f3'), hexc('cde3f4'), hexc('e0eef6')])
    CL = [hexc('ffffff'), hexc('e6eefa'), hexc('c4d4ee'), hexc('a8bce2')]
    cloud(im, 72, 84, 96, 1, CL); cloud(im, 214, 132, 70, 2, CL); cloud(im, 176, 44, 44, 3, CL); cloud(im, 26, 166, 50, 4, CL)
    # 먼 섬 (푸른 안개 색)
    isl = [(176, HOR - SEA), (186, HOR - SEA - 6), (196, HOR - SEA - 9), (206, HOR - SEA - 13), (214, HOR - SEA - 12), (226, HOR - SEA - 7), (240, HOR - SEA - 5), (252, HOR - SEA - 2), (258, HOR - SEA)]
    d.polygon(isl, fill=hexc('8eb3c4') + (255,)); d.line(isl[1:5], fill=hexc('a8c6d2') + (255,))
    d.polygon([(0, HOR - SEA), (0, HOR - SEA - 5), (10, HOR - SEA - 7), (24, HOR - SEA - 4), (34, HOR - SEA)], fill=hexc('9cbccb') + (255,))
    # 바다: 먼 쪽 진한 파랑 → 가까이 청록, 수평선 밝은 줄, 물결 줄 (멀수록 짧고 촘촘), 해 반사
    bands(im, HOR - SEA, HOR, [hexc('3c78c4'), hexc('4384cc'), hexc('4c92d2'), hexc('58a0d8'), hexc('64aedc'), hexc('70bade')])
    d.line((0, HOR - SEA, W, HOR - SEA), fill=hexc('a9d4f2') + (255,))
    rnd = random.Random(7); y = HOR - SEA + 3
    while y < HOR - 8:
        p = (y - (HOR - SEA)) / SEA; L = 2 + int(p * 7); step = 10 + int(p * 18)
        for x in range(rnd.randrange(step), W, step):
            xx = max(0, min(W - 1, x + rnd.randrange(-3, 4)))
            d.line((xx, y, xx + L, y), fill=mix(px[xx, y][:3], hexc('ffffff'), 0.35) + (255,))
        y += 2 + int(p * 3)
    # 밀려오는 파도 두 줄: 거품 꼭대기 (물결 모양) + 아래 그늘
    for wy, amp, ph in ((HOR - 7, 1.5, 0.0), (HOR - 2, 2.0, 1.7)):
        for x in range(W):
            yy = int(wy + amp * math.sin(x / 11 + ph) + 0.6 * math.sin(x / 4.3 + ph * 2))
            px[x, yy] = hexc('ffffff') + (255,); px[x, yy - 1] = hexc('d6f0fa') + (255,)
            if yy + 1 < HOR: px[x, yy + 1] = hexc('4c90c8') + (255,)
    # 젖은 모래 (거품 레이스) → 마른 모래
    bands(im, HOR, H, [hexc('c8a47c'), hexc('d8b48a'), hexc('e6c49a'), hexc('eecea6'), hexc('f2d2aa'), hexc('f5d6af')])
    for x in range(W):
        lace = int(3 + 2 * math.sin(x / 9.0) + 1.2 * math.sin(x / 3.1))
        for y in range(HOR, HOR + lace): px[x, y] = (hexc('9fc9da') if y < HOR + lace - 1 else hexc('f4fbff')) + (255,)
        px[x, HOR + lace + 3 + int(1.5 * math.sin(x / 7.0 + 1))] = hexc('bc9870') + (255,)    # 물이 빠진 자국
    for x in range(W): px[x, H - 1] = hexc('f5d6af') + (255,)
    ripples(im, HOR + 16, H - 2, hexc('e2be94'), 9, density=0.7, avoid=lambda x, y: in_spot(x, y))
    # 소품: 조개 · 불가사리 · 바위 + 해초 · 유목
    SH = {'o': hexc('b0686c'), 'h': hexc('fde4e0'), 'l': hexc('f6c2c0'), 'p': hexc('e8989c'), 's': hexc('c87a80')}
    sprite(im, SHELL, SH, 226, 452); sprite(im, SHELL, SH, 92, 276)
    sprite(im, STAR, {'o': hexc('b0503c'), 'y': hexc('f08a5c')}, 38, 300)
    ROCK = [hexc('3e4a58'), hexc('5c6878'), hexc('7e8a98'), hexc('a8b2bc'), hexc('d0d8de')]
    rock(im, 236, 300, 14, 9, ROCK, 5); rock(im, 254, 304, 7, 5, ROCK, 6)
    for x, h in ((226, 6), (229, 8), (246, 5)):
        for i in range(h): px[x + (i % 3 == 1), 304 - i] = (hexc('3c7a4a') if i % 2 else hexc('5aa060')) + (255,)
    WOOD = [hexc('5a3e2a'), hexc('8a6444'), hexc('aa8260'), hexc('c8a47e')]
    m = set(); capsule(m, 0, 0, 30, -5, 2.4); capsule(m, 20, -3, 26, -9, 1.2)
    ground_shadow(im, 30, 432, 18, 2)
    paint(im, run_shade(m, WOOD), 14, 432)
    spot(im, hexc('c8a47e'), hexc('e2c09a'), hexc('ecd0aa'), hexc('a88460'))
    return im


# ───────── 동굴 ─────────
def cave():
    im = Image.new('RGBA', (W, H)); d = ImageDraw.Draw(im); px = im.load()
    bands(im, 0, HOR, [hexc('28414b'), hexc('243a44'), hexc('20333d'), hexc('1c2d36'), hexc('1a2a33'), hexc('1d2f38'), hexc('22363f')])

    def glow(cx, cy, r, col, a=0.35):
        """수정 빛이 벽 · 바닥에 번짐 (디더링)."""
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                if 0 <= x < W and 0 <= y < H:
                    q = math.hypot(x - cx, y - cy) / r
                    if q < 1 and BAYER[y & 3][x & 3] / 16 < (1 - q) * 1.1: px[x, y] = mix(px[x, y][:3], col, a * (1 - q * 0.5)) + (255,)

    def wall(base, amp, step, col, edge, seed):
        """안쪽 바위벽: 꺾인 윗선 + 밝은 모서리."""
        r = random.Random(seed); pts = [(x, base - r.randint(0, amp)) for x in range(0, W + step, step)]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            for x in range(x0, min(W, x1)):
                yy = int(y0 + (y1 - y0) * (x - x0) / (x1 - x0))
                for y in range(yy, HOR): px[x, y] = col + (255,)
                px[x, yy] = edge + (255,)
                if (x * 7) % 13 == 0: px[x, min(HOR - 1, yy + 1)] = edge + (255,)
    wall(HOR - 30, 26, 9, hexc('263c47'), hexc('34505c'), 1)
    glow(206, HOR - 22, 30, hexc('6ee0d8'), 0.3); glow(54, HOR - 16, 22, hexc('8ab0f0'), 0.25)
    wall(HOR - 8, 14, 13, hexc('2e4a57'), hexc('46697a'), 2)
    # 종유석: 너비 · 길이가 다른 고드름, 왼쪽 밝은 면 · 오른쪽 그늘 · 외곽선, 가끔 물방울
    ST = [hexc('141f26'), hexc('2c434e'), hexc('3c5866'), hexc('56788a'), hexc('7a9eae')]
    rnd = random.Random(11); x = -4
    while x < W:
        wdt = rnd.choice((5, 7, 9, 11, 15)); ln = int(wdt * rnd.uniform(2.2, 4.4)) + (rnd.randint(16, 40) if rnd.random() < 0.25 else 0)
        m = set()
        for y in range(ln):
            half = (wdt / 2) * (1 - y / ln) ** 0.8; jag = 1 if (y // 4) % 2 and half > 2 else 0
            for xx in range(int(-half) + jag, int(half) + 1): m.add((xx, y))
        paint(im, run_shade(m, ST, light=(1, 0)), x + wdt // 2, 0)
        if rnd.random() < 0.35: px[min(W - 1, max(0, x + wdt // 2)), ln + 2] = hexc('9fd8e8') + (255,)
        x += wdt + rnd.randint(-2, 3)
    # 천장 바위 덩어리 (종유석이 매달린 곳): 울퉁불퉁한 아랫선 + 밝은 모서리
    for xx in range(W):
        yb = int(9 + 5 * math.sin(xx / 17) + 3 * math.sin(xx / 5.3 + 1))
        for y in range(0, yb): px[xx, y] = (hexc('1e313a') if y < yb - 1 else hexc('3c5866')) + (255,)
    for xx in range(W): px[xx, 0] = hexc('28414b') + (255,)      # 맨 윗줄 = EDGE
    # 석순 (지평선에서 솟음)
    for sx, sh, sw in ((22, 30, 9), (34, 16, 6), (240, 38, 11), (226, 18, 6), (160, 12, 5), (96, 9, 4)):
        m = set()
        for y in range(sh):
            half = (sw / 2) * (y / sh) ** 0.7
            for xx in range(int(-half), int(half) + 1): m.add((xx, -y))
        paint(im, run_shade(m, ST, light=(1, 0)), sx, HOR + 1)
    # 왼쪽 큰 바위 기둥 (천장~바닥, 화면 앞쪽) — 깊이감
    m = set()
    for y in range(0, HOR + 26):
        w2 = 16 + int(4 * math.sin(y / 13)) + (8 if y < 24 else 0) + (max(0, y - HOR + 10) // 1 if y > HOR - 10 else 0) // 2
        for x in range(0, w2): m.add((x, y))
    pil = run_shade(m, [hexc('0e1a20'), hexc('1c2f38'), hexc('2a4552'), hexc('3e6272')], light=(1, 0))
    for (x, y), c in list(pil.items()):
        if (y * 3 + x) % 17 == 0 and c != hexc('0e1a20'): pil[(x, y)] = hexc('1c2f38')
    for (x, y) in list(pil):
        if x == 0: pil[(x, y)] = hexc('1c2f38')
    # 바닥: 멀리 어둡게 → 가까이 #366a84, 금 · 자갈 (원근: 멀수록 촘촘)
    bands(im, HOR, H, [hexc('203a48'), hexc('284858'), hexc('2e5466'), hexc('325e74'), hexc('34647c'), hexc('366a84')])
    crack = hexc('1c3442'); lip = hexc('5c8ea4')
    for i in range(16):                                   # 갈라진 금: 옆으로 기어가는 선 (아래 밝은 테)
        y = rnd.randrange(HOR + 6, H - 10); x = rnd.randrange(W); n = 10 + int((y - HOR) / (H - HOR) * 50)
        for _ in range(n):
            if 0 <= x < W and not in_spot(x, y, 6):
                px[x, y] = crack + (255,)
                if y + 1 < H - 1: px[x, y + 1] = mix(px[x, y + 1][:3], lip, 0.4) + (255,)
            x += rnd.choice((1, 1, 1, -1)) if i % 2 else rnd.choice((-1, -1, -1, 1)); y += rnd.choice((0, 0, 0, 1, -1))
            y = max(HOR + 2, min(H - 3, y))
    PEB = [hexc('16262e'), hexc('2a4a5a'), hexc('3e687c'), hexc('5a8aa0')]
    for i in range(70):                                    # 자갈: 멀수록 작게
        y = int(HOR + 6 + (rnd.random() ** 1.3) * (H - HOR - 12)); x = rnd.randrange(W)
        if in_spot(x, y, 8): continue
        sz = 1 + int((y - HOR) / (H - HOR) * 4)
        if sz <= 1: px[x, y] = PEB[2] + (255,); continue
        m = blob(0, 0, sz + 0.5, sz * 0.6 + 0.5, i, 0.1)
        yb = max(yy for _, yy in m); paint(im, run_shade(m, PEB), x, y - yb)
    for xx in range(W): px[xx, H - 1] = hexc('366a84') + (255,)
    # 물웅덩이 (수정 빛 반사)
    d.ellipse((168, 404, 236, 420), fill=hexc('2a5a70') + (255,)); d.ellipse((174, 406, 230, 418), fill=hexc('3a7890') + (255,))
    for i in range(5): d.line((184 + i * 8, 410 + (i % 2) * 3, 188 + i * 8, 410 + (i % 2) * 3), fill=hexc('8ee0e0') + (255,))
    d.arc((168, 404, 236, 420), 200, 340, fill=hexc('5d9ab0') + (255,))

    def crystal(cx, fy, h, col):
        dark, mid, lit, hi = shade(col, 0.45), shade(col, 0.7), col, mix(col, (255, 255, 255), 0.6)
        glow(cx, fy - h // 2, h + 8, col, 0.28)
        for ox, hh, lean in ((-4, h * 0.6, -1), (4, h * 0.7, 1), (0, h, 0)):
            m = set(); hh = int(hh); w2 = max(2, int(h * 0.16))
            for y in range(hh):
                half = w2 if y < hh - w2 else (hh - y)
                for xx in range(-half, half + 1): m.add((xx + int(lean * y * 0.25), -y))
            paint(im, run_shade(m, [dark, mid, lit, hi], light=(1, 0)), cx + ox, fy)
    crystal(40, 300, 18, hexc('6ee0d8')); crystal(232, 292, 14, hexc('9ab8ff')); crystal(214, HOR + 8, 8, hexc('6ee0d8'))
    ROCK = [hexc('0f1c24'), hexc('22404e'), hexc('345e70'), hexc('4c7e92'), hexc('6a9cae')]
    rock(im, 64, 312, 10, 7, ROCK, 7); rock(im, 248, 452, 16, 10, ROCK, 8); rock(im, 28, 440, 11, 8, ROCK, 9); rock(im, 146, HOR + 18, 5, 3, ROCK, 10, shadow=False)
    spot(im, hexc('243e4c'), hexc('2f586c'), hexc('366478'), hexc('1a2e3a'))
    paint(im, pil)
    return im


# ───────── 눈밭 (snow) ─────────
def pine(im, fx, fy, h, pal, snow=True):
    """눈 덮인 전나무: 층층 삼각형 (왼쪽 밝게) + 가지 위 눈 + 줄기 + 외곽선 + 땅 그림자."""
    m = set(); tiers = 4 if h > 30 else 3
    for t in range(tiers):
        top = -h + int(t * h * 0.22); bot = -int(h * 0.12) - int((tiers - 1 - t) * h * 0.2)
        for y in range(top, bot + 1):
            half = int((y - top + 1) * (0.62 + 0.08 * t))
            for x in range(-half, half + 1): m.add((x, y))
    pix = run_shade(m, pal[:4])
    if snow:
        for (x, y) in list(pix):
            if (x, y - 1) not in m and pix[(x, y)] != pal[0]: pix[(x, y)] = hexc('f4f8fc')
            elif (x, y - 1) not in m: pix[(x, y)] = hexc('c8d6e4')
            elif (x, y + 1) not in m and (x + y) % 3 == 0 and pix[(x, y)] != pal[0]: pix[(x, y)] = hexc('dce8f2')
    for y in range(-int(h * 0.12), 1):
        for x in (-1, 0, 1): pix[(x, y)] = pal[4] if x < 1 else shade(pal[4], 0.7)
    ground_shadow(im, fx + h // 6, fy, max(3, h // 4), max(1, h // 14), 0.9)
    paint(im, pix, fx, fy)


def snow():
    im = Image.new('RGBA', (W, H)); px = im.load()
    bands(im, 0, HOR, [hexc('a9c3e0'), hexc('b5cce4'), hexc('c2d5e8'), hexc('cfdeec'), hexc('dce6f0'), hexc('e6edf4'), hexc('eef2f6')])
    for y in range(40, 100):                                 # 옅은 해 (구름 뒤)
        for x in range(170, 240):
            r = math.hypot(x - 204, y - 70)
            if r < 9: px[x, y] = hexc('f8f8f2') + (255,)
            elif r < 26 and BAYER[y & 3][x & 3] < (26 - r) / 2.2: px[x, y] = mix(px[x, y][:3], hexc('f4f4ee'), 0.5) + (255,)

    def mountain(peaks, base, col, shadowc, snowc, snowline):
        """설산 줄: 봉우리 오른쪽 = 그늘, 위쪽 = 눈 (경계 들쭉날쭉), 윗선 하양."""
        for x in range(W):
            yt = int(min(base - max(0, hgt - abs(x - cx) * sl) for cx, hgt, sl in peaks))
            near = min(peaks, key=lambda p: base - max(0, p[1] - abs(x - p[0]) * p[2]))
            right = x > near[0]
            for y in range(yt, base):
                c = shadowc if right else col
                if y < yt + snowline + ((x * 7) % 5) - 2: c = snowc if not right else mix(snowc, shadowc, 0.35)
                px[x, y] = c + (255,)
            px[x, yt] = hexc('ffffff') + (255,)
    mountain([(60, 92, 1.15), (150, 70, 1.0), (240, 104, 1.2)], HOR - 14, hexc('9cb0c8'), hexc('8296b0'), hexc('eef4fa'), 26)
    mountain([(20, 40, 0.9), (110, 48, 0.85), (200, 36, 0.8)], HOR - 6, hexc('b4c4d6'), hexc('a0b2c6'), hexc('f2f6fa'), 12)
    for y in range(HOR - 6, HOR + 1):
        for x in range(W): px[x, y] = hexc('dce6f0') + (255,)
    TP = [hexc('24403e'), hexc('2e5450'), hexc('3c6a62'), hexc('4e8074'), hexc('4a3a30')]
    bands(im, HOR + 1, H, [hexc('cdd9e6'), hexc('d8e2ee'), hexc('e2eaf3'), hexc('eaf0f7'), hexc('eef4fa')])
    for x in range(-2, W + 4, 7): pine(im, x + (x * 13) % 4, HOR + 2, 10 + (x * 7) % 6, TP)
    # 눈더미 (밝은 윗면 · 그늘진 아랫면)
    for cxd, cyd, rx, ry in ((40, 300, 60, 10), (230, 280, 70, 9), (30, 452, 90, 18), (250, 440, 80, 16), (140, 262, 40, 5)):
        for y in range(cyd - ry, cyd + ry):
            for x in range(cxd - rx, cxd + rx):
                u, v = (x - cxd) / rx, (y - cyd) / ry
                if 0 <= x < W and u * u + v * v < 1 and v < 0.6 and not in_spot(x, y, 4):
                    c = hexc('fbfdff') if (u * 0.6 + v) < -0.35 else hexc('eef4fa') if v < 0.2 else hexc('d2deea')
                    px[x, y] = c + (255,)
    ripples(im, HOR + 20, H - 2, hexc('d4dfec'), 13, density=0.6, avoid=lambda x, y: in_spot(x, y))
    pine(im, 236, 302, 36, TP); pine(im, 22, 290, 26, TP); pine(im, 48, 456, 46, TP)
    ROCK = [hexc('4a5668'), hexc('6a788c'), hexc('8c9aae'), hexc('b4c0d0')]
    rock(im, 204, 448, 10, 7, ROCK, 21)
    for i in range(-7, 8): px[204 + i, 440 + (i * i) // 20] = hexc('f8fbff') + (255,)
    rnd = random.Random(31)                                   # 떨어지는 눈
    for _ in range(140):
        x, y = rnd.randrange(W), rnd.randrange(H)
        if in_spot(x, y, 2): continue
        px[x, y] = hexc('ffffff') + (255,)
        if y > HOR and rnd.random() < 0.5 and x + 1 < W: px[x + 1, y] = hexc('f0f6fc') + (255,)
    for x in range(W): px[x, 0] = hexc('a9c3e0') + (255,); px[x, H - 1] = hexc('eef4fa') + (255,)
    spot(im, hexc('b8c8da'), hexc('dbe5f0'), hexc('e8eff7'), hexc('98aac0'))
    return im


# ───────── 용암 지대 (lava) ─────────
LAVA = (hexc('ffe27a'), hexc('ffa63a'), hexc('e8541e'), hexc('8a2416'))


def lava():
    im = Image.new('RGBA', (W, H)); px = im.load()
    bands(im, 0, HOR, [hexc('2a1a1c'), hexc('3a2222'), hexc('4c2a24'), hexc('6a3426'), hexc('8c4426'), hexc('b0582a')])
    rnd = random.Random(41)
    for j, cy in enumerate((34, 70, 108)):                   # 재 구름 (뭉친 덩어리, 위 어둡게 · 아랫단 붉게 비침)
        for i in range(-20, W + 20, 26):
            cx = i + (j * 13) % 26; r = 9 + (i * 7 + j * 5) % 7
            for y in range(cy - r, cy + 3):
                for x in range(cx - 2 * r, cx + 2 * r):
                    if 0 <= x < W and 0 <= y < H and ((x - cx) / (2 * r)) ** 2 + ((y - cy) / r) ** 2 <= 1:
                        k = (cy + 2 - y)
                        px[x, y] = (hexc('6a3026') if k <= 1 else hexc('3a2224') if k <= 4 else hexc('2a1a1e')) + (255,)
    # 먼 화산 + 꼭대기에서 흐르는 용암 줄 + 연기
    for x in range(W):
        yt = int(HOR - 6 - max(0, 96 - abs(x - 170) * 1.05))
        if 154 < x < 186: yt = HOR - 94 + (1 if (x // 3) % 2 else 0)
        for y in range(yt, HOR): px[x, y] = (hexc('2c1c1e') if x > 170 else hexc('3a2426')) + (255,)
        px[x, yt] = hexc('5c3436') + (255,)
    for i, (x0, sway) in enumerate(((160, 1), (178, -1), (168, 1))):
        x = x0
        for y in range(HOR - 92, HOR - 4):
            if (y + i * 5) % 9 == 0: x += sway
            if 0 <= x < W: px[x, y] = hexc('ffb040') + (255,)
            if 0 <= x + 1 < W: px[x + 1, y] = hexc('e05a20') + (255,)
    for k in range(60):
        y = HOR - 98 - k * 2; r = 4 + k // 5
        for dx in range(-r, r + 1):
            x = 170 + dx + int(6 * math.sin(k / 6))
            if 0 <= x < W and 0 <= y < H and BAYER[y & 3][x & 3] < 10 - k // 8: px[x, y] = mix(px[x, y][:3], hexc('4a3a3a'), 0.6) + (255,)
    # 가까운 검은 바위 등성이
    m = set()
    for x in range(W):
        yt = int(HOR - 18 - 14 * abs(math.sin(x / 23)) - 6 * abs(math.sin(x / 7.3)))
        if 96 < x < 196: yt = HOR - 4 - int(4 * abs(math.sin(x / 9)))
        for y in range(yt, HOR + 1): m.add((x, y))
    paint(im, run_shade(m, [hexc('120c0e'), hexc('22181a'), hexc('34262a'), hexc('4a3638')], light=(1, 0)))
    GROUND = [hexc('4a2a24'), hexc('3e2626'), hexc('3a2828'), hexc('3a2a2a')]
    bands(im, HOR + 1, H, GROUND)

    def flow(pts, w0, w1):
        """용암 강: 가운데 노랑 → 주황 → 빨강 → 검붉은 테."""
        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            n = int(max(abs(x1 - x0), abs(y1 - y0)))
            for k in range(0, n + 1, 2):
                t = k / max(1, n); x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t
                p = (y - HOR) / (H - HOR); w = w0 + (w1 - w0) * p; hh = max(1.5, w * 0.35)
                for yy in range(int(y - hh - 2), int(y + hh + 3)):
                    for xx in range(int(x - w - 2), int(x + w + 3)):
                        if not (0 <= xx < W and HOR < yy < H) or in_spot(xx, yy, 2): continue
                        q = ((xx - x) / w) ** 2 + ((yy - y) / hh) ** 2
                        lvl = 0 if q < 0.25 else 1 if q < 0.55 else 2 if q < 0.9 else 3 if q < 1.35 else None
                        if lvl is None: continue
                        cur = px[xx, yy][:3]
                        if cur in LAVA and LAVA.index(cur) <= lvl: continue
                        px[xx, yy] = LAVA[lvl] + (255,)
    flow([(-10, 262), (40, 270), (80, 284), (60, 300), (20, 318), (-10, 330)], 5, 16)
    flow([(280, 250), (230, 262), (200, 278), (236, 300), (262, 330), (240, 380), (280, 420)], 4, 18)
    flow([(120, 252), (150, 258), (196, 262)], 2, 5)
    hot = [(x, y) for y in range(HOR + 1, H, 3) for x in range(0, W, 3) if px[x, y][:3] == LAVA[1]]
    for (gx, gy) in hot[::5]:                                 # 용암 빛이 땅에 번짐
        for dy in range(-12, 13):
            for dx in range(-16, 17):
                x, y = gx + dx, gy + dy
                if 0 <= x < W and HOR < y < H and px[x, y][:3] in GROUND and BAYER[y & 3][x & 3] < 4 and dx * dx / 256 + dy * dy / 144 < 1:
                    px[x, y] = mix(px[x, y][:3], hexc('a0402a'), 0.4) + (255,)
    for i in range(22):                                       # 갈라진 금
        y = rnd.randrange(HOR + 8, H - 6); x = rnd.randrange(W)
        for k in range(10 + (y - HOR) // 6):
            if 0 <= x < W and not in_spot(x, y, 4) and px[x, y][:3] not in LAVA: px[x, y] = hexc('1c1012') + (255,)
            x += rnd.choice((1, 1, -1)); y = max(HOR + 2, min(H - 3, y + rnd.choice((0, 0, 1, -1))))
    ROCK = [hexc('140c0e'), hexc('2c1e20'), hexc('46302e'), hexc('6a4a40'), hexc('a05a3a')]
    rock(im, 222, 318, 13, 9, ROCK, 42); rock(im, 34, 440, 15, 10, ROCK, 43); rock(im, 74, 300, 6, 4, ROCK, 44); rock(im, 238, 456, 9, 6, ROCK, 45)
    for _ in range(70):                                       # 불티
        x, y = rnd.randrange(W), rnd.randrange(20, H - 20)
        if not in_spot(x, y, 2): px[x, y] = (hexc('ffd060') if rnd.random() < 0.4 else hexc('ff7a30')) + (255,)
    for x in range(W): px[x, 0] = hexc('2a1a1c') + (255,); px[x, H - 1] = hexc('3a2a2a') + (255,)
    spot(im, hexc('241618'), hexc('4a3230'), hexc('5a3c36'), hexc('140c0e'))
    return im


# ───────── 발전소 안 (plant) ─────────
def plant():
    im = Image.new('RGBA', (W, H)); px = im.load(); d = ImageDraw.Draw(im)
    bands(im, 0, HOR, [hexc('1c2630'), hexc('202c38'), hexc('24323e'), hexc('283846'), hexc('2c3e4c')])
    for y in (0, 22):                                         # 천장 들보
        d.rectangle((0, y, W, y + 6), fill=hexc('141c24') + (255,)); d.line((0, y + 6, W, y + 6), fill=hexc('3a4c5c') + (255,))
    for x in range(14, W, 64):                                # 형광등 + 차가운 빛 원뿔
        d.rectangle((x, 30, x + 36, 33), fill=hexc('dff6ff') + (255,)); d.line((x, 34, x + 36, 34), fill=hexc('8ec8e0') + (255,))
        for y in range(35, 92):
            spread = (y - 35) * 0.5
            for xx in range(int(x - spread), int(x + 36 + spread)):
                if 0 <= xx < W and BAYER[y & 3][xx & 3] < max(0, 5 - (y - 35) // 12): px[xx, y] = mix(px[xx, y][:3], hexc('9ad8f0'), 0.25) + (255,)
    for y in range(92, HOR):                                  # 벽 판넬 (이음매 · 리벳)
        for x in range(W):
            c = hexc('3a4a58') if (y - 92) < 4 else hexc('34444f')
            if x % 44 == 0 or (y - 92) % 34 == 0: c = hexc('25323c')
            elif x % 44 == 1: c = hexc('4c5e6c')
            px[x, y] = c + (255,)
    for x in range(6, W, 44):
        for y in (98, 130, 164, 196):
            if y < HOR - 10:
                px[x, y] = hexc('6c8090') + (255,)
                if x + 30 < W: px[x + 30, y] = hexc('6c8090') + (255,)
    for x in range(W):                                        # 경고 띠
        for y in range(HOR - 8, HOR): px[x, y] = (hexc('e8c040') if ((x + y) // 5) % 2 else hexc('22262a')) + (255,)
    PIPE = [hexc('1a2a30'), hexc('2e5060'), hexc('4a7a8c'), hexc('7cb0c0'), hexc('b4e0ea')]

    def tone(k, r):
        t = (k + r) / (2 * r)
        return PIPE[0] if abs(k) == r else PIPE[4] if t < 0.18 else PIPE[3] if t < 0.4 else PIPE[2] if t < 0.75 else PIPE[1]

    def hpipe(y, r):
        for x in range(W):
            for k in range(-r, r + 1):
                c = tone(k, r)
                if x % 52 in (0, 1, 2): c = shade(c, 0.72) if abs(k) < r else PIPE[0]    # 이음쇠
                px[x, y + k] = c + (255,)

    def vpipe(x, y0, y1, r):
        for y in range(y0, y1):
            for k in range(-r, r + 1):
                c = tone(k, r)
                if y % 40 in (0, 1): c = shade(c, 0.72) if abs(k) < r else PIPE[0]
                if 0 <= x + k < W: px[x + k, y] = c + (255,)
    hpipe(104, 5); hpipe(120, 3)
    vpipe(30, 40, HOR - 8, 5); vpipe(240, 40, HOR - 8, 6); vpipe(254, 60, HOR - 8, 3)
    # 발전기: 몸통 + 빛나는 코일 창 + 번개 + 계기 램프 + 노란 빛 번짐
    GEN = [hexc('141c22'), hexc('2c3a44'), hexc('42565e'), hexc('5e7680')]
    m = {(x, y) for y in range(130, HOR - 8) for x in range(96, 176)} | {(x, y) for y in range(118, 130) for x in range(104 + (130 - y), 168 - (130 - y))}
    for y in range(110, HOR - 8):
        for x in range(64, 208):
            r = math.hypot((x - 136) / 1.3, y - 170)
            if (x, y) not in m and r < 66 and BAYER[y & 3][x & 3] < (66 - r) / 7: px[x, y] = mix(px[x, y][:3], hexc('ffe27a'), 0.25) + (255,)
    paint(im, run_shade(m, GEN, light=(1, 0)))
    for y in range(140, 200):
        for x in range(116, 156):
            k = abs(x - 136) / 20
            c = hexc('fff6a0') if k < 0.3 else hexc('ffe040') if k < 0.65 else hexc('e0a020')
            if (y - 140) % 6 == 0: c = hexc('8a6a18')
            px[x, y] = c + (255,)
    d.rectangle((115, 139, 156, 200), outline=hexc('141c22') + (255,))
    d.line((136, 122, 131, 128, 138, 128, 133, 136), fill=hexc('fffbe0') + (255,))
    for i, x in enumerate(range(102, 172, 10)):
        c = (hexc('6aff8a') if i % 3 else hexc('ff5a4a')) + (255,); px[x, 212] = c; px[x + 1, 212] = c
    # 바닥: 금속 타일 (가로 줄 = 멀수록 촘촘, 세로 줄 = 소실점으로) + 이음 반사
    bands(im, HOR, H, [hexc('2e3a46'), hexc('36444f'), hexc('3e4c58'), hexc('445260'), hexc('4a5a68')])
    VX, VY = W / 2, HOR - 120
    y = HOR + 2.0; gap = 4.0
    while y < H - 1:
        yi = int(y)
        for x in range(W):
            if not in_spot(x, yi, 2): px[x, yi] = mix(px[x, yi][:3], hexc('1e2830'), 0.55) + (255,)
            if yi + 1 < H and not in_spot(x, yi + 1, 2): px[x, yi + 1] = mix(px[x, yi + 1][:3], hexc('6a7c8a'), 0.3) + (255,)
        y += gap; gap *= 1.22
    for k in range(-14, 15):
        xb = W / 2 + k * 30
        for yy in range(HOR, H):
            x = int(VX + (xb - VX) * (yy - VY) / (H - VY))
            if 0 <= x < W and not in_spot(x, yy, 2): px[x, yy] = mix(px[x, yy][:3], hexc('1e2830'), 0.45) + (255,)
    for y in range(HOR + 1, HOR + 60):                       # 발전기 빛 반사
        for x in range(104, 168):
            if BAYER[y & 3][x & 3] < max(0, 7 - (y - HOR) // 8) and abs(x - 136) < 28 - (y - HOR) // 3: px[x, y] = mix(px[x, y][:3], hexc('ffe27a'), 0.3) + (255,)
    for x in range(W):                                        # 바닥 케이블
        yy = int(H - 40 + 6 * math.sin(x / 22))
        if not in_spot(x, yy, 4): px[x, yy] = hexc('141a20') + (255,); px[x, yy + 1] = hexc('2a3640') + (255,)
    BOX = [hexc('2a2014'), hexc('7a5a24'), hexc('a07a30'), hexc('c8a048')]
    for bx, by, bw, bh in ((14, 336, 30, 22), (228, 318, 26, 18)):
        pix = run_shade({(x, y) for x in range(bw) for y in range(bh)}, BOX, light=(1, 0))
        for x in range(bw): pix[(x, 4)] = BOX[0]
        ground_shadow(im, bx + bw // 2 + 3, by, bw // 2 + 3, 3, 0.8)
        paint(im, pix, bx, by - bh)
        for x in range(bx + 4, bx + bw - 4, 6): px[x, by - bh + 11] = hexc('e8c040') + (255,)
    for x in range(W): px[x, 0] = hexc('1c2630') + (255,); px[x, H - 1] = hexc('4a5a68') + (255,)
    spot(im, hexc('2a3640'), hexc('46566a'), hexc('526476'), hexc('1a2228'))
    return im


# ───────── 용의 굴 (dragon) ─────────
def dragon():
    im = Image.new('RGBA', (W, H)); px = im.load(); d = ImageDraw.Draw(im)
    bands(im, 0, HOR, [hexc('140f24'), hexc('18122c'), hexc('1c1634'), hexc('221a3e'), hexc('2a2048')])

    def glow(cx, cy, r, col, a=0.35):
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                if 0 <= x < W and 0 <= y < H:
                    q = math.hypot(x - cx, y - cy) / r
                    if q < 1 and BAYER[y & 3][x & 3] / 16 < (1 - q) * 1.1: px[x, y] = mix(px[x, y][:3], col, a * (1 - q * 0.5)) + (255,)
    for x in range(W):                                        # 안쪽 벽
        yt = int(70 + 12 * math.sin(x / 31) + 6 * math.sin(x / 9))
        for y in range(yt, HOR): px[x, y] = hexc('261e40') + (255,)
        px[x, yt] = hexc('3c3060') + (255,)
    # 고대 용 부조: 긴 몸 (위아래 새긴 선 + 그림자 선) · 등지느러미 · 비늘 · 뿔 달린 머리 · 희미하게 빛나는 눈
    LIT, SH = hexc('5a4c8a'), hexc('18122a')
    body = [(26 + i * 3, int(150 + 18 * math.sin(i / 6))) for i in range(66)]
    for (x0, y0), (x1, y1) in zip(body, body[1:]):
        d.line((x0, y0 - 8, x1, y1 - 8), fill=LIT + (255,)); d.line((x0, y0 + 8, x1, y1 + 8), fill=LIT + (255,))
        d.line((x0, y0 - 7, x1, y1 - 7), fill=SH + (255,)); d.line((x0, y0 + 9, x1, y1 + 9), fill=SH + (255,))
    for i in range(4, 62, 6):
        x, y = body[i]
        d.line((x, y - 8, x + 3, y - 15, x + 6, y - 8), fill=LIT + (255,))
        d.arc((x - 3, y - 4, x + 3, y + 4), 0, 180, fill=LIT + (255,))
    hx_, hy = body[-1][0] + 22, body[-1][1] - 8
    head = [(hx_ - 24, hy + 14), (hx_ - 6, hy - 2), (hx_ + 14, hy - 2), (hx_ + 24, hy + 8), (hx_ + 14, hy + 18), (hx_ - 6, hy + 20), (hx_ - 24, hy + 14)]
    d.line(head, fill=LIT + (255,))
    d.line((hx_ - 6, hy - 2, hx_ - 14, hy - 22, hx_ - 2, hy - 4), fill=LIT + (255,))
    d.line((hx_ + 6, hy - 2, hx_ + 4, hy - 20, hx_ + 12, hy - 2), fill=LIT + (255,))
    d.line((hx_ + 4, hy + 12, hx_ + 22, hy + 10), fill=SH + (255,))
    glow(hx_ + 3, hy + 5, 14, hexc('8ae8ff'), 0.35)
    d.rectangle((hx_ + 2, hy + 4, hx_ + 5, hy + 6), fill=hexc('bff4ff') + (255,))
    ST = [hexc('0c0818'), hexc('241c40'), hexc('362a5a'), hexc('4c3e78'), hexc('6a5aa0')]
    rnd = random.Random(51); x = -3
    while x < W:                                              # 종유석
        wdt = rnd.choice((5, 7, 9, 13)); ln = int(wdt * rnd.uniform(2.4, 5)) + (rnd.randint(10, 30) if rnd.random() < 0.3 else 0)
        m = set()
        for y in range(ln):
            half = (wdt / 2) * (1 - y / ln) ** 0.8
            for xx in range(int(-half), int(half) + 1): m.add((xx, y))
        paint(im, run_shade(m, ST, light=(1, 0)), x + wdt // 2, 0)
        x += wdt + rnd.randint(-1, 4)
    for xx in range(W):
        yb = int(8 + 4 * math.sin(xx / 13) + 2 * math.sin(xx / 4.1))
        for y in range(yb): px[xx, y] = (hexc('120c22') if y < yb - 1 else hexc('3c3060')) + (255,)
    bands(im, HOR, H, [hexc('1c1834'), hexc('201c3c'), hexc('242040'), hexc('282246'), hexc('2a2448')])
    for i in range(18):                                       # 금
        y = rnd.randrange(HOR + 6, H - 8); x = rnd.randrange(W)
        for k in range(12 + (y - HOR) // 5):
            if 0 <= x < W and not in_spot(x, y, 6):
                px[x, y] = hexc('120e22') + (255,)
                if y + 1 < H - 1: px[x, y + 1] = mix(px[x, y + 1][:3], hexc('5a4c8a'), 0.35) + (255,)
            x += 1 if i % 2 else -1; y = max(HOR + 2, min(H - 3, y + rnd.choice((0, 0, 0, 1, -1))))
    PEB = [hexc('0e0a1a'), hexc('2a2448'), hexc('3e3664'), hexc('5a4e88')]
    for i in range(50):                                       # 자갈
        y = int(HOR + 6 + (rnd.random() ** 1.3) * (H - HOR - 12)); x = rnd.randrange(W)
        if in_spot(x, y, 8): continue
        sz = 1 + int((y - HOR) / (H - HOR) * 4)
        if sz <= 1: px[x, y] = PEB[2] + (255,); continue
        m = blob(0, 0, sz + 0.5, sz * 0.6 + 0.5, i + 100, 0.1); yb = max(yy for _, yy in m); paint(im, run_shade(m, PEB), x, y - yb)

    def crystal(cx, fy, h, col):
        dark, mid, lit, hi = shade(col, 0.45), shade(col, 0.7), col, mix(col, (255, 255, 255), 0.6)
        glow(cx, fy - h // 2, h + 10, col, 0.3)
        for ox, hh, lean in ((-5, h * 0.55, -1), (5, h * 0.7, 1), (0, h, 0), (9, h * 0.4, 2)):
            m = set(); hh = int(hh); w2 = max(2, int(h * 0.15))
            for y in range(hh):
                half = w2 if y < hh - w2 else (hh - y)
                for xx in range(-half, half + 1): m.add((xx + int(lean * y * 0.25), -y))
            paint(im, run_shade(m, [dark, mid, lit, hi], light=(1, 0)), cx + ox, fy)
    crystal(34, 304, 24, hexc('7ab8ff')); crystal(236, 296, 18, hexc('c08aff')); crystal(60, HOR + 6, 10, hexc('c08aff'))
    crystal(196, HOR + 4, 8, hexc('7ab8ff')); crystal(246, 456, 22, hexc('9a9aff')); crystal(20, 452, 14, hexc('c08aff'))
    for _ in range(40):                                       # 떠다니는 빛 알갱이
        x, y = rnd.randrange(W), rnd.randrange(30, H - 10)
        if not in_spot(x, y, 2): px[x, y] = (hexc('bfe8ff') if rnd.random() < 0.5 else hexc('e0c8ff')) + (255,)
    for x in range(W): px[x, 0] = hexc('140f24') + (255,); px[x, H - 1] = hexc('2a2448') + (255,)
    spot(im, hexc('1a1630'), hexc('342c58'), hexc('3e3468'), hexc('0e0a1a'))
    return im


def main():
    out = os.path.join(ROOT, 'web', 'img', 'catch')
    scenes = (('shore', shore), ('desert', desert), ('cave', cave), ('snow', snow), ('lava', lava), ('plant', plant), ('dragon', dragon))
    sheet = Image.new('RGB', ((W + 4) * len(scenes), H), (255, 0, 255))
    for i, (n, fn) in enumerate(scenes):
        im = fn().convert('RGB')
        im.save(os.path.join(out, f'{n}.png'), optimize=True)
        sheet.paste(im, (i * (W + 4), 0))
        print(n, 'top', im.getpixel((W // 2, 0)), 'bottom', im.getpixel((W // 2, H - 1)), 'colours', len(im.getcolors(1 << 16) or []), os.path.getsize(os.path.join(out, f'{n}.png')), 'bytes')
    os.makedirs(os.path.join(ROOT, '.work'), exist_ok=True)
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(os.path.join(ROOT, '.work', 'catch_zone_bg_preview.png'))


if __name__ == '__main__':
    main()
