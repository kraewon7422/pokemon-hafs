"""스프라이트 아틀라스(web/sprites/atlas.png) 만들기.

- art/sprites/<라인>-<단계>.png (64x64, 예: 12-1.png = 12번 쌤 1단계, 36-1.png = 교감몽) 가 있으면 그걸 쓰고,
  (운영자 페이지 몬스터 카드에 '그림 파일: 12-1.png' 로 표시됨. 앱 도감 번호 No.xxx 와는 다르니 주의)
- 없으면 임시 몬스터를 그린다 (라인=과목마다 손으로 조정한 그리기 함수, 단계가 오를수록 커짐).
- 칸 배치: 12열, 칸 하나 64x64, 칸 번호 = 도감번호-1.  (web/js/sprites.js 가 같은 규칙으로 읽는다)
- 전설(35 교장몽, 36 교감몽)과 비밀(37 숨바꼭몽)은 1단계만 있음 → 도감 103, 106, 109. 나머지 빈 칸은 투명.

그리는 방식 (GBA 에메랄드 느낌):
  모양(타원/캡슐/다각형) → 부위마다 3단 명암(빛은 왼쪽 위) + 1px 외곽선(몸색보다 어두운 색, 검정 아님)
  → 눈/입/볼 같은 점 찍기. 스프라이트마다 15색 이하인지, 단계별 키가 맞는지 assert 로 검사한다.

사용법:  python tools/build_atlas.py [--count 51]
"""
import argparse
import colorsys
import math
import os
from collections import Counter

from PIL import Image

COLS = 12
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = 62                      # 발이 닿는 맨 아래 줄(y)
MAX_COLORS = 15
HEIGHT = {1: (28, 40), 2: (40, 52), 3: (50, 61)}   # 단계별 허용 키(px)
LEGEND_HEIGHT = (48, 61)

# ---------------------------------------------------------------- 색
_L = (-0.52, -0.62, 0.59)
_n = math.sqrt(sum(c * c for c in _L))
LX, LY, LZ = (c / _n for c in _L)       # 빛 방향: 왼쪽 위 + 앞
T_SH, T_LI, T_HI = 0.22, 0.74, 0.965    # 명암 경계 (그림자 / 밝은면 / 반사광)


def hsv(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h % 1, max(0, min(1, s)), max(0, min(1, v)))
    return (round(r * 255), round(g * 255), round(b * 255), 255)


def hexc(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)


def _toward(h, t, a):
    d = ((t - h + 0.5) % 1) - 0.5
    return h + max(-a, min(a, d))


def ramp(h, s, v):
    """[외곽선, 그림자, 기본, 밝은면] — 그림자는 푸른/보라 쪽, 밝은면은 노란 쪽으로 색상 이동."""
    return (hsv(_toward(h, .72, .05), min(1, s + .30), v * .40),
            hsv(_toward(h, .72, .03), min(1, s + .12), v * .76),
            hsv(h, s, v),
            hsv(_toward(h, .14, .03), s * .55, min(1, v * 1.10 + .10)))


def hramp(*hexes):
    return tuple(hexc(x) for x in hexes)


WHITE = hexc('fffff6')
EYE = hexc('2a2038')

# ---------------------------------------------------------------- 모양 (dict: (x,y) -> 밝기 d 또는 None)


def _sph(u, v):
    r2 = min(1.0, u * u + v * v)
    return u * LX + v * LY + math.sqrt(1 - r2) * LZ


def ell(cx, cy, rx, ry, ang=0.0):
    """(회전) 타원. ang 은 도(degree)."""
    a = math.radians(ang)
    ca, sa = math.cos(a), math.sin(a)
    R = max(rx, ry) + 1
    out = {}
    for y in range(math.floor(cy - R), math.ceil(cy + R) + 1):
        for x in range(math.floor(cx - R), math.ceil(cx + R) + 1):
            dx, dy = x + .5 - cx, y + .5 - cy
            u, v = (dx * ca + dy * sa) / rx, (-dx * sa + dy * ca) / ry
            if u * u + v * v <= 1.0:
                out[(x, y)] = _sph(u * ca - v * sa, u * sa + v * ca)
    return out


def ellb(cx, bottom, rx, ry, ang=0.0):
    """아래 끝 줄이 bottom 인 타원."""
    return ell(cx, bottom + 1 - ry, rx, ry, ang)


def sell(cx, cy, rx, ry, p=4.0):
    """둥근 사각형(초타원)."""
    out = {}
    for y in range(math.floor(cy - ry) - 1, math.ceil(cy + ry) + 1):
        for x in range(math.floor(cx - rx) - 1, math.ceil(cx + rx) + 1):
            u, v = (x + .5 - cx) / rx, (y + .5 - cy) / ry
            m = abs(u) ** p + abs(v) ** p
            if m <= 1.0:
                gx, gy = math.copysign(abs(u) ** (p - 1), u), math.copysign(abs(v) ** (p - 1), v)
                gl = math.hypot(gx, gy) or 1
                k = m ** 0.8 * 0.95
                out[(x, y)] = _sph(gx / gl * k, gy / gl * k)
    return out


def cap(x0, y0, x1, y1, r0, r1=None):
    """캡슐(굵은 선, 끝이 둥근). r0→r1 로 굵기가 변할 수 있다."""
    r1 = r0 if r1 is None else r1
    out = {}
    R = max(r0, r1) + 1
    vx, vy = x1 - x0, y1 - y0
    L2 = vx * vx + vy * vy or 1e-9
    for y in range(math.floor(min(y0, y1) - R), math.ceil(max(y0, y1) + R) + 1):
        for x in range(math.floor(min(x0, x1) - R), math.ceil(max(x0, x1) + R) + 1):
            px, py = x + .5 - x0, y + .5 - y0
            t = max(0, min(1, (px * vx + py * vy) / L2))
            dx, dy = px - t * vx, py - t * vy
            r = r0 + (r1 - r0) * t
            dd = math.hypot(dx, dy)
            if dd <= r:
                out[(x, y)] = _sph(dx / r, dy / r)
    return out


def poly(pts):
    """다각형 (명암은 부위 전체 모양 기준으로 자동)."""
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    out = {}
    n = len(pts)
    for y in range(math.floor(min(ys)), math.ceil(max(ys)) + 1):
        for x in range(math.floor(min(xs)), math.ceil(max(xs)) + 1):
            px, py, inside = x + .5, y + .5, False
            j = n - 1
            for i in range(n):
                (xi, yi), (xj, yj) = pts[i], pts[j]
                if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                    inside = not inside
                j = i
            if inside:
                out[(x, y)] = None
    return out


def rect(x0, y0, x1, y1):
    """x0..x1, y0..y1 (양끝 포함)."""
    return {(x, y): None for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}


def U(*shapes):
    out = {}
    for s in shapes:
        for k, d in s.items():
            o = out.get(k, -9)
            if k not in out or (d is not None and (o is None or d > o)):
                out[k] = d if d is not None else (o if k in out else None)
    return out


def minus(a, b):
    return {k: v for k, v in a.items() if k not in b}






# ---------------------------------------------------------------- 캔버스


class Spr:
    def __init__(self):
        self.c = {}     # (x,y) -> rgba
        self.m = {}     # (x,y) -> ramp | 'fx'

    def part(self, shape, rp, edge=True, shine=False, clip=None, tone=None, only_outer=False, bulge=False):
        """shape 을 ramp 색으로 칠한다. bulge=True 면 여러 모양을 합친 몸도 하나의 공처럼 명암(줄무늬 방지)."""
        S = {k: v for k, v in shape.items() if 0 <= k[0] < 64 and 0 <= k[1] < 64}
        if clip is not None:
            S = {k: v for k, v in S.items() if k in clip}
        if not S:
            return set()
        keys = set(S)
        if bulge:
            xs, ys = [k[0] for k in S], [k[1] for k in S]
            cx, cy = (min(xs) + max(xs) + 1) / 2, (min(ys) + max(ys) + 1) / 2
            rx, ry = (max(xs) - min(xs) + 1) / 2, (max(ys) - min(ys) + 1) / 2
            S = {(x, y): _sph((x + .5 - cx) / rx, (y + .5 - cy) / ry) for (x, y) in S}
        spec = set()
        if shine:   # 반사광은 가장 밝은 점 둘레의 작은 점 하나만
            best = max((d for d in S.values() if d is not None), default=None)
            if best is not None and best >= T_HI:
                bx, by = next(k for k, d in S.items() if d == best)
                R = max(.8, min(2.0, math.sqrt(len(S)) * .055))
                spec = {k for k, d in S.items() if d is not None and d >= T_HI - .02 and math.hypot(k[0] - bx, k[1] - by) <= R}
        for (x, y), d in S.items():
            if d is None:      # 방향 거리로 명암: 왼쪽 위 가장자리 → 밝음, 오른쪽 아래 → 그림자
                a = b = 0
                fx, fy = x + .5, y + .5
                while (math.floor(fx - .6 * (a + 1)), math.floor(fy - .8 * (a + 1))) in keys:
                    a += 1
                while (math.floor(fx + .6 * (b + 1)), math.floor(fy + .8 * (b + 1))) in keys:
                    b += 1
                t = (a + .5) / (a + b + 1)
                d = 1.12 - 1.3 * t
            if tone is not None:
                col = rp[tone]
            elif (x, y) in spec:
                col = WHITE
            else:
                col = rp[3] if d >= T_LI else rp[2] if d >= T_SH else rp[1]
            self.c[(x, y)] = col
            self.m[(x, y)] = rp
        if edge:
            for (x, y) in keys:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    q = (x + dx, y + dy)
                    if q not in keys and (not only_outer or q not in self.c):
                        self.c[(x, y)] = rp[0]
                        break
        return keys

    def px(self, x, y, col):
        if 0 <= x < 64 and 0 <= y < 64:
            self.c[(x, y)] = col
            self.m[(x, y)] = 'fx'

    def pxs(self, pts, col, mirror_x=False):
        for x, y in pts:
            self.px(x, y, col)
            if mirror_x:
                self.px(63 - x, y, col)

    def fx(self, shape, col):
        for (x, y) in shape:
            self.px(x, y, col)

    def has(self, x, y):
        return (x, y) in self.c

    # ---- 얼굴
    def eyes(self, y, gap, w=2, h=3, cx=32, style='dark', look=0):
        """gap = 가운데에서 눈 안쪽 끝까지 거리. 빛은 왼쪽 위 → 반짝임도 왼쪽 위."""
        for sx in (cx - gap - w, cx + gap):
            sx += look
            if style == 'white':        # 어두운 몸: 흰자 + 검은 눈동자
                for dx in range(w):
                    for dy in range(h):
                        if (dx in (0, w - 1)) and (dy in (0, h - 1)) and w >= 3 and h >= 4:
                            continue
                        self.px(sx + dx, y + dy, WHITE)
                for dx in range(max(1, w - 1)):
                    for dy in range(1, h):
                        self.px(sx + w - 1 - dx, y + dy, EYE)
                self.px(sx + w - 1, y + 1, WHITE)
                continue
            for dx in range(w):
                for dy in range(h):
                    if w >= 3 and h >= 4 and dx in (0, w - 1) and dy in (0, h - 1):
                        continue
                    self.px(sx + dx, y + dy, EYE)
            if w >= 3:
                self.px(sx, y + 1, WHITE)
                self.px(sx + 1, y + 1, WHITE)
            else:
                self.px(sx, y, WHITE)

    def mouth(self, y, col, kind='smile', cx=32, tongue=None):
        if kind == 'smile':
            self.pxs([(cx - 2, y), (cx - 1, y + 1), (cx, y + 1), (cx + 1, y)], col)
        elif kind == 'tiny':
            self.pxs([(cx - 1, y), (cx, y)], col)
        elif kind == 'cat':      # ω
            self.pxs([(cx - 3, y), (cx - 2, y + 1), (cx - 1, y), (cx, y), (cx + 1, y + 1), (cx + 2, y)], col)
        elif kind == 'open':
            self.pxs([(cx - 2, y), (cx - 1, y), (cx, y), (cx + 1, y), (cx - 1, y + 2), (cx, y + 2)], col)
            self.pxs([(cx - 2, y + 1), (cx + 1, y + 1)], col)
            self.pxs([(cx - 1, y + 1), (cx, y + 1)], tongue or col)
        elif kind == 'grin':
            self.pxs([(cx - 3, y), (cx + 2, y)] + [(cx + i, y + 1) for i in range(-2, 2)], col)
            self.pxs([(cx - 2, y), (cx - 1, y), (cx, y), (cx + 1, y)], WHITE)

    def blush(self, y, gap, col, cx=32, w=2):
        for sx in (cx - gap - w, cx + gap):
            for dx in range(w):
                self.px(sx + dx, y, col)

    def sparkle(self, x, y, col, big=False):
        self.pxs([(x, y), (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)], col)
        if big:
            self.pxs([(x - 2, y), (x + 2, y), (x, y - 2), (x, y + 2)], col)
            self.px(x, y, WHITE)

    def done(self):
        img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        p = img.load()
        for (x, y), col in self.c.items():
            rp = self.m.get((x, y))
            if rp != 'fx':      # 실루엣 외곽선(투명과 닿는 픽셀)은 항상 그 부위의 외곽선 색
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    q = (x + dx, y + dy)
                    if q not in self.c or not (0 <= q[0] < 64 and 0 <= q[1] < 64):
                        col = rp[0]
                        break
            p[x, y] = col
        return img


def body_feet(s, rp, xs, rx=3.5, ry=2.5):
    for x in xs:
        s.part(ellb(x, F, rx, ry), rp)


# ================================================================ 라인별 그림
# 각 함수: (stage) -> Spr.  색은 라인 안에서 공유.

# 1 물리 — 뉴턴몽/가속몽/상대몽 : 사과 + 원자 궤도
def apple_body(cx, top, w, h):
    """사과 모양: 위가 살짝 오목."""
    r = w / 2
    return U(ell(cx - r * .38, top + h * .47, r * .66, h * .47),
             ell(cx + r * .38, top + h * .47, r * .66, h * .47),
             ell(cx, top + h * .56, r, h * .44))


def orbit(cx, cy, rx, ry, ang, th=1.1):
    a = math.radians(ang)
    ca, sa = math.cos(a), math.sin(a)
    out = {}
    for y in range(64):
        for x in range(64):
            dx, dy = x + .5 - cx, y + .5 - cy
            u, v = (dx * ca + dy * sa), (-dx * sa + dy * ca)
            r = math.hypot(u / rx, v / ry)
            if abs(r - 1) * min(rx, ry) <= th * .62:
                out[(x, y)] = v      # v<0 : 뒤쪽 반, v>0 : 앞쪽 반
    return out


# 2 화학 — 몰몰/몰리온/몰리돈 : 플라스크 + 거품
P2 = dict(glass=hramp('2f6f86', '8cc6d8', 'c4e8f0', 'eefcff'), liq=ramp(.075, .78, .98),
          cork=hramp('4a2c14', '9a6434', 'c08850', 'e0b070'), blush=hexc('ff9fae'))


def bubbles(s, pts, rp):
    for x, y, r in pts:
        b = ell(x, y, r, r)
        s.part(b, rp, shine=True)


def line_chem(st):
    s, c = Spr(), P2
    g, lq = c['glass'], c['liq']
    if st == 1:
        body_feet(s, lq, (27, 37), 3, 2.2)
        bulb = ell(32, 50.5, 11.5, 10.5)
        neck = rect(28, 34, 35, 42)
        glass = U(bulb, neck)
        s.part(glass, g)
        inner = set(ell(32, 50.5, 10.5, 9.5)) | set(rect(29, 35, 34, 42))
        s.part({k: v for k, v in ell(32, 51.5, 11, 10).items() if k[1] >= 46}, lq, edge=False, clip=inner)
        s.pxs([(x, 46) for x in range(22, 43) if (x, 46) in inner], lq[3])
        s.part(ell(32, 34, 6, 2), g)
        s.pxs([(25, 47), (25, 48), (26, 45)], WHITE)
        s.eyes(49, 3, 2, 3)
        s.mouth(53, lq[0], 'smile')
        s.blush(52, 6, c['blush'])
        bubbles(s, [(36, 29, 2), (31, 27.5, 1.4)], g)
    elif st == 2:
        body_feet(s, lq, (24, 40), 4.5, 3)
        s.part(cap(20, 47, 11, 41, 2.6, 2.3), g)
        s.part(cap(44, 47, 53, 41, 2.6, 2.3), g)
        cone = poly([(15, 60), (49, 60), (37, 31), (27, 31)])
        cone = U(cone, sell(32, 57.5, 17, 3.5, 3))
        neck = rect(27, 21, 36, 32)
        s.part(U(cone, neck), g)
        inner = minus(U(cone, neck), {})  # 내부(외곽선 안쪽)
        inner = {k for k in inner if all((k[0] + dx, k[1] + dy) in cone or (k[0] + dx, k[1] + dy) in neck
                                         for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))}
        s.part({k: None for k in inner if k[1] >= 41}, lq, edge=False)
        s.pxs([k for k in inner if k[1] == 41], lq[3])
        s.part(sell(32, 21, 7, 2.2, 3), g)
        s.pxs([(22, 52), (23, 50), (24, 48)], WHITE)
        s.eyes(45, 3, 3, 4)
        s.mouth(51, lq[0], 'open', tongue=c['blush'])
        s.blush(49, 7, c['blush'])
        bubbles(s, [(38, 17, 2.4), (31, 14.5, 1.6)], g)
    else:
        body_feet(s, lq, (21, 43), 6, 3.5)
        s.part(cap(16, 42, 6, 30, 3.4, 2.8), g)
        s.part(cap(48, 42, 58, 30, 3.4, 2.8), g)
        bulb = ell(32, 42, 20, 18)
        neck = rect(25, 12, 38, 26)
        whole = U(bulb, neck)
        s.part(whole, g)
        inner = {k for k in whole if all((k[0] + dx, k[1] + dy) in whole
                                         for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))}
        s.part({k: v for k, v in ell(32, 44, 20, 17).items() if k[1] >= 36}, lq, edge=False, clip=inner)
        s.pxs([k for k in inner if k[1] == 36], lq[3])
        s.part(sell(31.5, 11, 9, 4, 3), c['cork'])
        for bx in (25, 31, 37):
            s.part(ellb(bx + .5, 7, 2.5, 3), c['cork'])
        s.pxs([(17, 40), (17, 41), (18, 38), (19, 36), (20, 35)], WHITE)
        s.eyes(40, 4, 3, 4)
        s.pxs([(24, 37), (25, 36), (26, 36), (27, 36), (36, 36), (37, 36), (38, 36), (39, 37)], g[0])
        s.mouth(47, lq[0], 'grin')
        s.blush(46, 8, c['blush'])
        bubbles(s, [(52, 14, 3), (57, 6, 2), (10, 18, 2.2), (6, 10, 1.5), (45, 5, 1.6)], g)
    return s


# 3 생명 — 세포링/세포론/세포돈 : 세포 + 새싹
P3 = dict(cell=ramp(.35, .55, .86), nuc=ramp(.80, .40, .78), leaf=ramp(.29, .72, .72), blush=hexc('ff9fb0'))


def sprout(s, x, base_y, h, leaf_r, rp, lean=0):
    s.part(cap(x, base_y, x + lean, base_y - h, 1.2), rp)
    tx, ty = x + lean, base_y - h
    s.part(ell(tx - leaf_r * .9, ty, leaf_r, leaf_r * .48, 25), rp, shine=False)
    s.part(ell(tx + leaf_r * .9, ty - 1, leaf_r, leaf_r * .48, -25), rp)


def line_bio(st):
    s, c = Spr(), P3
    if st == 1:
        body = U(ell(32, 50, 13, 11), ellb(32, F, 12, 5))
        s.part(body, c['cell'], shine=True)
        s.part(ell(37, 55, 3.8, 3), c['nuc'])
        s.pxs([(36, 54)], c['nuc'][3])
        s.pxs([(23, 57), (25, 58)], c['cell'][1])
        sprout(s, 32, 40, 5, 3.6, c['leaf'])
        s.eyes(46, 3, 2, 3)
        s.mouth(51, c['cell'][0], 'cat')
        s.blush(50, 6, c['blush'])
    elif st == 2:
        s.part(cap(18, 48, 10, 52, 3, 2.4), c['cell'])
        s.part(cap(46, 48, 54, 52, 3, 2.4), c['cell'])
        body = U(ell(32, 43, 16, 15), ellb(32, F, 15, 6), ellb(22, F, 5, 4), ellb(42, F, 5, 4))
        s.part(body, c['cell'], shine=True)
        s.part(ell(39, 53, 5, 4), c['nuc'])
        s.part(ell(38, 52, 1.6, 1.4), c['nuc'], tone=3, edge=False)
        s.part(ell(24, 55, 2.8, 1.6, 20), c['leaf'])
        sprout(s, 32, 29, 8, 5, c['leaf'])
        s.eyes(39, 4, 3, 4)
        s.mouth(45, c['cell'][0], 'cat')
        s.blush(44, 7, c['blush'])
    else:
        s.part(ell(50, 50, 9, 9), c['cell'], shine=True)        # 분열 중인 딸세포
        s.part(ell(52, 53, 3, 2.4), c['nuc'])
        s.eyes(47, 1, 2, 2, cx=49)
        s.part(cap(14, 40, 4, 34, 3.6, 2.6), c['cell'])
        body = U(ell(30, 37, 21, 20), ellb(30, F, 19, 8), ellb(17, F, 6, 5), ellb(42, F, 6, 5))
        s.part(body, c['cell'], shine=True)
        s.part(ell(37, 49, 6.5, 5.5), c['nuc'])
        s.part(ell(35.5, 47.5, 2, 1.8), c['nuc'], tone=3, edge=False)
        s.part(ell(20, 51, 3.5, 2, 25), c['leaf'])
        s.part(ell(25, 56, 2.5, 1.5, -20), c['leaf'])
        sprout(s, 30, 18, 9, 6, c['leaf'])
        s.part(ell(18, 14, 5, 2.4, 40), c['leaf'])
        s.part(ell(42, 14, 5, 2.4, -40), c['leaf'])
        s.eyes(31, 4, 3, 4, cx=30)
        s.pxs([(22, 28), (23, 27), (24, 27), (25, 27), (35, 27), (36, 27), (37, 27), (38, 28)], c['cell'][0])
        s.mouth(37, c['cell'][0], 'open', cx=30, tongue=c['blush'])
        s.blush(36, 8, c['blush'], cx=30)
    return s


# 4 지구 — 판구리/판구라/판게아돈 : 바위 + 수정 + 화산
P4 = dict(rock=ramp(.09, .42, .80), crys=ramp(.77, .42, .95), lava=hramp('7a1a08', 'e04818', 'ff8a1e', 'ffd84a'),
          moss=ramp(.27, .55, .62))


def crystal(s, x, bottom, w, h, rp, lean=0):
    pts = [(x - w / 2, bottom), (x - w / 2 + lean, bottom - h + w / 2), (x + lean, bottom - h),
           (x + w / 2 + lean, bottom - h + w / 2), (x + w / 2, bottom)]
    s.part(poly(pts), rp, shine=False)
    # 가운데 면 밝은 선
    for yy in range(int(bottom - h + w / 2) + 1, int(bottom)):
        s.px(int(x + lean * (bottom - yy) / h) - 1, yy, rp[3])


def line_earth(st):
    s, c = Spr(), P4
    rk = c['rock']
    if st == 1:
        body_feet(s, rk, (25, 39), 4, 2.5)
        crystal(s, 30, 38, 5, 10, c['crys'], lean=-1)
        crystal(s, 36, 39, 4, 7, c['crys'], lean=1)
        body = U(ell(32, 50, 13.5, 10.5), ell(30, 45, 10, 8))
        s.part(body, rk, shine=True)
        s.pxs([(21, 54), (22, 55), (23, 55), (40, 50), (41, 51)], rk[1])
        s.eyes(46, 3, 2, 3)
        s.mouth(51, rk[0], 'smile')
        s.blush(50, 6, c['crys'][3])
    elif st == 2:
        body_feet(s, rk, (22, 42), 5.5, 3.2)
        crystal(s, 22, 30, 6, 13, c['crys'], lean=-2)
        crystal(s, 31, 27, 7, 14, c['crys'])
        crystal(s, 40, 29, 6, 12, c['crys'], lean=2)
        s.part(cap(17, 45, 9, 53, 3.6, 3.2), rk)
        s.part(cap(47, 45, 55, 53, 3.6, 3.2), rk)
        body = U(ell(32, 46, 17, 14), ell(32, 40, 13, 11))
        s.part(body, rk, shine=True)
        s.part(ellb(32, 58, 9, 6), c['moss'], edge=False)
        # 판 경계 균열
        s.pxs([(19, 49), (20, 50), (21, 50), (22, 51), (23, 51), (24, 52)], rk[0])
        s.eyes(39, 4, 3, 4)
        s.mouth(46, rk[0], 'grin')
        s.blush(45, 7, c['crys'][3])
    else:
        body_feet(s, rk, (19, 45), 7.5, 4)
        s.part(cap(14, 36, 6, 50, 4.6, 4), rk)
        s.part(cap(50, 36, 58, 50, 4.6, 4), rk)
        crystal(s, 9, 31, 6, 12, c['crys'], lean=-2)
        crystal(s, 55, 31, 6, 12, c['crys'], lean=2)
        body = U(ell(32, 44, 19, 16), poly([(17, 30), (24, 9), (40, 9), (47, 30)]))
        s.part(body, rk, shine=True)
        s.part(ell(32, 9, 8.5, 2.6), c['lava'], edge=True)      # 분화구 용암
        s.part(cap(27, 9, 26, 16, 1.6, 1.2), c['lava'], edge=False)
        s.part(cap(37, 10, 38, 14, 1.4, 1.0), c['lava'], edge=False)
        s.pxs([(30, 4), (32, 3), (34, 5), (29, 6)], c['lava'][2])
        # 지층 띠
        for yy, x0, x1 in ((48, 16, 48), (53, 18, 46)):
            s.pxs([(x, yy) for x in range(x0, x1) if s.has(x, yy)], rk[1])
        s.eyes(30, 5, 3, 4)
        s.pxs([(22, 26), (23, 25), (24, 25), (25, 25), (26, 26), (37, 26), (38, 25), (39, 25), (40, 25), (41, 26)], rk[0])
        s.mouth(37, rk[0], 'grin')
    return s


# 5 수학 — 미분이/적분이/급수왕 : π 뿔 + 자 + 그래프
# 6 국어 — 문법이/문장이/문학왕 : 먹물 + 붓 + 한지 두루마리
# 7 영어 — 알파비/알파벳/알파킹 : 말풍선 + ABC
GLYPH = {
    'A': ['.#.', '#.#', '###', '#.#', '#.#'],
    'B': ['##.', '#.#', '##.', '#.#', '##.'],
    'C': ['.##', '#..', '#..', '#..', '.##'],
    'H': ['#.#', '#.#', '###', '#.#', '#.#'],
    'i': ['#', '.', '#', '#', '#'],
    'あ': ['.#..', '####', '.##.', '#.##', '.##.'],
}


def text(s, x, y, txt, col):
    for ch in txt:
        g = GLYPH[ch]
        for yy, row in enumerate(g):
            for xx, ch2 in enumerate(row):
                if ch2 == '#':
                    s.px(x + xx, y + yy, col)
        x += len(g[0]) + 1


def speech(s, cx, cy, w, h, rp, tail='left'):
    shp = U(sell(cx, cy, w / 2, h / 2, 3), poly([(cx - w * .25, cy + h / 2 - 1), (cx - w * .38, cy + h / 2 + 4),
                                                (cx - w * .05, cy + h / 2 - 1)]))
    if tail == 'right':
        shp = {(2 * round(cx) - 1 - x, y): d for (x, y), d in shp.items()}
    s.part(shp, rp)


# 8 역사 — 연표몽/사관몽/역사왕 : 청동 투구 + 두루마리


def scroll_item(s, x0, y0, x1, y1, rp, tie):
    s.part(rect(x0, y0 + 1, x1, y1 - 1), rp)
    s.part(sell(x0 + .5, (y0 + y1) / 2 + .5, 1.6, (y1 - y0) / 2 + 1, 3), rp)
    s.part(sell(x1 + .5, (y0 + y1) / 2 + .5, 1.6, (y1 - y0) / 2 + 1, 3), rp)
    for yy in range(y0 + 1, y1):
        s.px((x0 + x1) // 2, yy, tie)


# 9 사회 — 시민이/정책이/헌법왕 : 지구본 + 저울
LANDS = [(-.45, -.25, .38, .28, 20), (.35, .35, .35, .22, -15), (.55, -.45, .22, .16, 0)]


def scales(s, cx, top, w, rp):
    s.part(cap(cx, top, cx, top + 6, 1.2), rp)
    s.part(sell(cx, top + 1, w / 2, 1.3, 3), rp)
    for sg in (-1, 1):
        x = cx + sg * (w / 2 - 1)
        s.fx({(int(x), top + 2 + i) for i in range(4)}, rp[0])
        s.part({k: v for k, v in ell(x, top + 6, 4, 3).items() if k[1] >= top + 6}, rp)


def orbit_half(cx, cy, r):
    """지구본 받침 반원(오른쪽)."""
    out = {}
    for y in range(64):
        for x in range(64):
            d = math.hypot(x + .5 - cx, y + .5 - cy)
            if r - 1.2 <= d <= r + 1.2 and x + .5 > cx + 3 and y + .5 > cy - r * .8:
                out[(x, y)] = None
    return out


# 10 체육 — 줄넘이/허들이/올림픽왕 : 머리띠 + 운동화 + 호루라기
# 11 음악 — 도레미/화음이/교향곡왕 : 음표 + 헤드폰
P11 = dict(body=ramp(.87, .34, .96), phone=ramp(.50, .62, .86), dark=hramp('1a1030', '2e2050', '42346e', '625296'),
           blush=hexc('ff9fd0'))


def phones(s, cx, cy, r, c, band_top):
    band = {}
    for y in range(64):
        for x in range(64):
            d = math.hypot(x + .5 - cx, (y + .5 - cy) * 1.0)
            if r - 1.3 <= d <= r + 1.3 and y + .5 <= cy and y >= band_top:
                band[(x, y)] = None
    s.part(band, c['dark'])
    s.part(ell(cx - r, cy + 1, 3, 4.5), c['phone'], shine=True)
    s.part(ell(cx + r, cy + 1, 3, 4.5), c['phone'], shine=True)


def note_stem(s, x, y0, y1, c, flag=True):
    s.part(rect(x, y1, x + 1, y0), c['dark'], edge=False)
    if flag:
        s.part(poly([(x + 1, y1), (x + 7, y1 + 5), (x + 6, y1 + 9), (x + 4, y1 + 5), (x + 1, y1 + 4)]), c['dark'])


def line_music(st):
    s, c = Spr(), P11
    b = c['body']
    if st == 1:
        note_stem(s, 40, 46, 27, c)
        body_feet(s, b, (26, 38), 3.5, 2.5)
        s.part(ell(32, 50, 12.5, 10.5, -15), b, shine=True)
        s.eyes(47, 3, 3, 4)
        s.mouth(53, b[0], 'open', tongue=c['blush'])
        s.blush(52, 7, c['blush'])
    elif st == 2:
        # 이음줄(빔) 두 개 줄기
        s.part(rect(19, 19, 21, 38), c['dark'], edge=False)
        s.part(rect(43, 19, 45, 38), c['dark'], edge=False)
        s.part(poly([(19, 17), (46, 13), (46, 18), (19, 22)]), c['dark'])
        body_feet(s, b, (24, 40), 4.5, 3)
        s.part(cap(18, 48, 10, 53, 2.6, 2.2), b)
        s.part(cap(46, 48, 54, 53, 2.6, 2.2), b)
        s.part(U(ell(32, 44, 16, 14), ellb(32, 60, 13, 7)), b, shine=True)
        phones(s, 32, 42, 16, c, 25)
        s.eyes(40, 4, 3, 4)
        s.mouth(47, b[0], 'open', tongue=c['blush'])
        s.blush(46, 8, c['blush'])
    else:
        # 높은음자리표 볏
        clef = [(33, 22), (36, 14), (37, 8), (34, 4), (30, 7), (30, 13), (35, 19), (39, 23), (38, 28), (33, 29),
                (29, 26), (31, 22), (35, 23)]
        for (x0, y0), (x1, y1) in zip(clef, clef[1:]):
            s.part(cap(x0, y0, x1, y1, 1.6), c['dark'], edge=False)
        body_feet(s, b, (20, 44), 6.5, 3.5)
        s.part(cap(15, 42, 7, 50, 3.2, 2.8), b)
        # 지휘봉
        s.part(cap(52, 40, 61, 26, 1.0), c['phone'], edge=False)
        s.part(cap(49, 42, 55, 38, 3.2, 2.8), b)
        s.part(U(ell(32, 40, 19, 17), ellb(32, 61, 16, 10)), b, shine=True)
        s.part(ell(32, 52, 9, 6), c['dark'], edge=False)
        for yy in (49, 52, 55):
            s.pxs([(x, yy) for x in range(24, 41) if s.c.get((x, yy)) == c['dark'][2] or s.c.get((x, yy)) in c['dark'][1:]], c['phone'][3])
        phones(s, 32, 37, 19.5, c, 17)
        for nx, ny in ((5, 22), (57, 12), (8, 9)):
            s.part(ell(nx, ny, 2.4, 1.8, -20), c['dark'])
            s.part(rect(nx + 1, ny - 7, nx + 2, ny - 1), c['dark'], edge=False)
        s.eyes(34, 5, 3, 4)
        s.pxs([(22, 30), (23, 29), (24, 29), (25, 29), (38, 29), (39, 29), (40, 29), (41, 30)], b[0])
        s.mouth(41, b[0], 'open', tongue=c['blush'])
        s.blush(40, 9, c['blush'])
    return s


# 12 미술 — 크레용/물감이/명화왕 : 베레모 + 팔레트
def beret(s, cx, y, w, rp, tilt=-12):
    s.part(ell(cx + 2, y, w / 2, w / 4.5, tilt), rp, shine=True)
    s.part(cap(cx + 2, y - w / 4.5, cx + 3, y - w / 4.5 - 3, 1.1), rp)


# 13 정보 (희귀) — 비트몽/바이트몽/알고리즘왕 : 픽셀 화면 + 회로
def screen_face(s, x0, y0, w, h, c, big=False):
    s.part(rect(x0, y0, x0 + w - 1, y0 + h - 1), c['scr'], edge=True, tone=2)
    s.pxs([(x0 + 1, y0 + 1)], c['scr'][3])
    g = c['glow']
    cx = x0 + w // 2
    ey = y0 + h // 2 - (2 if big else 1)
    ew = 2
    for ex in (cx - 3 - ew if big else cx - 2 - ew, cx + (3 if big else 2)):
        for dx in range(ew):
            for dy in range(3 if big else 2):
                s.px(ex + dx, ey + dy, g)
    my = ey + (5 if big else 3)
    s.pxs([(cx - 2, my), (cx - 1, my + 1), (cx, my + 1), (cx + 1, my)], g)
    # 주사선
    for yy in range(y0 + 2, y0 + h - 1, 2):
        for xx in range(x0 + 1, x0 + w - 1):
            if s.c.get((xx, yy)) == c['scr'][2]:
                s.px(xx, yy, c['scr'][1])


# 14 일본어 (희귀) — 히라몽/카타몽/칸지왕 : 부채 + 가나
P14 = dict(body=ramp(.95, .26, 1.0), fan=hramp('7a3a4a', 'e8d6dc', 'fbf2f2', 'ffffff'), red=ramp(.99, .78, .88),
           sash=ramp(.64, .55, .62), spark=hexc('fff27a'))


def fan(s, cx, cy, r, a0, a1, c, ribs=7, text_=None):
    shp = {}
    for y in range(64):
        for x in range(64):
            dx, dy = x + .5 - cx, y + .5 - cy
            d = math.hypot(dx, dy)
            a = math.degrees(math.atan2(-dy, dx))
            if r * .28 <= d <= r and a0 <= a <= a1:
                shp[(x, y)] = None
    s.part(shp, c['fan'])
    for i in range(1, ribs):
        a = math.radians(a0 + (a1 - a0) * i / ribs)
        for t in range(int(r * .3), int(r) - 1):
            p = (math.floor(cx + math.cos(a) * t), math.floor(cy - math.sin(a) * t))
            if p in shp:
                s.px(*p, c['fan'][1])
    # 빨간 해 무늬
    for (x, y) in shp:
        d = math.hypot(x + .5 - cx, y + .5 - (cy - r * .62))
        if d < r * .2 and s.c.get((x, y)) != c['fan'][0]:
            s.px(x, y, c['red'][2])
    s.part(ell(cx, cy, 1.8, 1.8), c['red'])


def line_japanese(st):
    s, c = Spr(), P14
    b = c['body']
    if st == 1:
        fan(s, 32, 41, 11, 25, 155, c, 6)
        body_feet(s, b, (26, 38), 3.5, 2.5)
        s.part(U(ell(32, 50, 12, 10.5), ellb(32, 60, 11, 6)), b, shine=True)
        s.part(sell(32, 56, 11, 1.6, 4), c['sash'])
        s.eyes(46, 3, 3, 4)
        s.mouth(51, b[0], 'cat')
        s.blush(50, 7, c['red'][3])
        s.sparkle(52, 36, c['spark'])
    elif st == 2:
        fan(s, 46, 46, 15, 0, 100, c, 7)         # 꼬리 부채
        body_feet(s, b, (24, 40), 4.5, 3)
        s.part(cap(18, 48, 10, 53, 2.6, 2.2), b)
        s.part(U(ell(32, 43, 15, 14), ellb(32, 60, 13, 7), ell(21, 30, 3.4, 5.5, -25), ell(43, 30, 3.4, 5.5, 25)), b, shine=True)
        s.part(sell(32, 52, 14, 2.6, 4), c['sash'])
        s.part(ell(32, 52, 3.4, 3), c['red'])
        s.eyes(40, 4, 3, 4)
        s.mouth(46, b[0], 'cat')
        s.blush(45, 8, c['red'][3])
        s.sparkle(10, 30, c['spark'])
        s.sparkle(55, 22, c['spark'], big=True)
    else:
        fan(s, 32, 44, 31, 12, 168, c, 11)       # 뒤의 큰 부채 후광
        body_feet(s, b, (21, 43), 6.5, 3.8)
        s.part(cap(16, 46, 8, 54, 3.2, 2.8), b)
        s.part(U(ell(32, 42, 17, 16), ellb(32, 61, 15, 9), ell(19, 26, 4, 7, -25), ell(45, 26, 4, 7, 25)), b, shine=True)
        s.part(sell(32, 53, 16, 3.2, 4), c['sash'])
        s.part(ell(32, 53, 4, 3.4), c['red'])
        # 손에 든 작은 부채
        s.part(cap(48, 46, 54, 50, 3.2, 2.8), b)
        s.part(ell(19, 14, 3, 3), c['red'], shine=True)
        s.eyes(37, 5, 3, 4)
        s.pxs([(22, 33), (23, 32), (24, 32), (25, 32), (38, 32), (39, 32), (40, 32), (41, 33)], b[0])
        s.mouth(43, b[0], 'cat')
        s.blush(42, 9, c['red'][3])
        s.sparkle(5, 58, c['spark'], big=True)
        s.sparkle(59, 58, c['spark'], big=True)
    return s


# 15 중국어 (희귀) — 성조몽/한자몽/만리왕 : 등불 + 성조 표시 + 만리장성
P15 = dict(red=ramp(.01, .80, .92), gold=ramp(.12, .72, 1.0), wall=hramp('4a3a30', '9a8a78', 'c2b29c', 'e6dac4'),
           spark=hexc('fff27a'))

TONES = [[(0, 0), (1, 0), (2, 0)], [(0, 1), (1, 0), (2, -1)], [(0, -1), (1, 0), (2, 0), (3, -1)], [(0, -1), (1, 0), (2, 1)]]


def lantern(s, cx, top, rx, ry, c, ribs=True):
    s.part(sell(cx, top + 1, rx * .55, 2, 3), c['gold'])
    body = ell(cx, top + 2 + ry, rx, ry)
    s.part(body, c['red'], shine=True)
    if ribs:
        for f in (-.55, 0.55):
            for (x, y) in body:
                d = math.floor(cx + f * rx * math.sqrt(max(0, 1 - ((y + .5 - top - 2 - ry) / ry) ** 2)))
                if x == d and s.c.get((x, y)) not in (c['red'][0], WHITE):
                    s.px(x, y, c['red'][1])
    s.part(sell(cx, top + 2 + 2 * ry, rx * .55, 2, 3), c['gold'])
    return body


def tone_marks(s, x, y, c, gap=4):
    for i, t in enumerate(TONES):
        for dx, dy in t:
            s.px(x + i * gap + dx, y + dy, c['gold'][2] if i % 2 else c['gold'][3])


def line_chinese(st):
    s, c = Spr(), P15
    if st == 1:
        body_feet(s, c['red'], (26, 38), 3.5, 2.5)
        lantern(s, 32, 37, 12, 11, c)
        s.eyes(47, 3, 3, 4)
        s.mouth(53, c['red'][0], 'smile')
        s.blush(52, 7, c['gold'][3])
        tone_marks(s, 24, 33, c)
        s.sparkle(13, 40, c['spark'])
        s.sparkle(52, 46, c['spark'])
    elif st == 2:
        body_feet(s, c['red'], (24, 40), 4.5, 3)
        s.part(cap(18, 44, 10, 50, 2.6, 2.2), c['red'])
        s.part(cap(46, 44, 54, 50, 2.6, 2.2), c['red'])
        lantern(s, 32, 23, 16, 15, c)
        s.part(cap(32, 59, 32, 62, 1.2), c['gold'], edge=False)
        s.eyes(38, 4, 3, 4)
        s.mouth(45, c['red'][0], 'open', tongue=c['gold'][2])
        s.blush(44, 8, c['gold'][3])
        tone_marks(s, 23, 19, c, 5)
        s.part(ell(32, 15, 2.6, 2.6), c['gold'], shine=True)
        s.sparkle(8, 24, c['spark'], big=True)
        s.sparkle(57, 30, c['spark'])
    else:
        body_feet(s, c['red'], (20, 44), 6.5, 3.8)
        s.part(cap(14, 40, 6, 50, 3.4, 3), c['red'])
        s.part(cap(50, 40, 58, 50, 3.4, 3), c['red'])
        lantern(s, 32, 15, 20, 19, c)
        # 만리장성 성벽 왕관
        crown = U(rect(17, 9, 46, 14), rect(17, 5, 21, 9), rect(26, 5, 30, 9), rect(34, 5, 38, 9), rect(43, 5, 46, 9))
        s.part(crown, c['wall'])
        s.pxs([(x, 12) for x in range(18, 46)], c['wall'][1])
        s.pxs([(x, 10) for x in range(22, 46, 5)], c['wall'][1])
        s.eyes(33, 5, 3, 4)
        s.pxs([(22, 29), (23, 28), (24, 28), (25, 28), (38, 28), (39, 28), (40, 28), (41, 29)], c['red'][0])
        s.mouth(40, c['red'][0], 'grin')
        s.blush(39, 9, c['gold'][3])
        tone_marks(s, 2, 22, c, 4)
        tone_marks(s, 46, 22, c, 4)
        s.sparkle(6, 6, c['spark'], big=True)
        s.sparkle(57, 4, c['spark'])
    return s


# 35 교장몽 (전설) — 금빛 몸 + 왕관 + 흰 수염 + 홀 + 오라
P16 = dict(body=ramp(.115, .52, 1.0), gold=ramp(.10, .80, 1.0), fur=hramp('6a5a6a', 'd8d0e0', 'f2eef6', 'fffff6'),
           gem=hexc('3ac8e8'), blush=hexc('ff9f8e'))


def aura(s, cx, cy, rx, ry, col, step=7):
    for i in range(0, 360, step):
        a = math.radians(i)
        x, y = round(cx + math.cos(a) * rx), round(cy + math.sin(a) * ry)
        if (x, y) not in s.c and 0 <= y < 62:
            s.px(x, y, col)


def line_principal(st):
    s, c = Spr(), P16
    b = c['body']
    aura(s, 32, 36, 31, 27, c['gold'][3], 8)
    s.part(cap(55, 58, 57, 18, 1.4), c['gold'])                   # 홀
    s.part(ell(57, 15, 3.4, 3.4), c['gold'], shine=True)
    s.px(57, 15, c['gem'])
    body_feet(s, b, (20, 44), 7, 4)
    s.part(cap(14, 40, 7, 47, 3.6, 3.2), b)
    s.part(cap(50, 40, 56, 44, 3.6, 3.2), b)
    s.part(U(ell(32, 38, 22, 21), ellb(32, 61, 20, 11)), b, shine=True, bulge=True)
    s.part(U(ell(32, 50, 13, 9), ellb(32, 60, 10, 5)), c['fur'], edge=False)     # 흰 배털(어민 망토)
    s.pxs([(x, y) for (x, y) in ((26, 50), (31, 48), (37, 51), (29, 55), (35, 56))], c['fur'][0])
    s.part(ell(56, 44, 3.6, 3.6), b)
    s.part(U(ell(25.5, 37, 7, 3.6, 12), ell(38.5, 37, 7, 3.6, -12)), c['fur'])   # 흰 수염
    crown = U(rect(19, 12, 44, 18), poly([(19, 13), (20, 4), (25, 13)]), poly([(27.5, 13), (32, 2), (36.5, 13)]),
              poly([(39, 13), (44, 4), (45, 13)]))
    s.part(crown, c['gold'], shine=True)
    s.pxs([(31, 14), (32, 14), (31, 15), (32, 15)], c['gem'])
    s.pxs([(23, 15), (40, 15)], c['blush'])
    s.pxs([(x, 18) for x in range(20, 44)], c['gold'][1])
    s.eyes(26, 4, 3, 4)
    s.pxs([(23, 23), (24, 22), (25, 22), (26, 22), (37, 22), (38, 22), (39, 22), (40, 23)], c['fur'][0])
    s.mouth(41, b[0], 'tiny')
    s.blush(33, 9, c['blush'])
    s.sparkle(5, 8, WHITE, big=True)
    s.sparkle(6, 56, c['gold'][3])
    return s


# 36 교감몽 (전설) — 보라 몸 + 학사모 + 은테 안경 + 출석부 + 오라
P17 = dict(body=ramp(.77, .48, .86), cap=hramp('140f26', '241c40', '362c5c', '4e4480'),
           silver=hramp('4a4e66', '9aa0b8', 'c8ccdc', 'eef0f8'), blush=hexc('ff9fbe'))


def line_vice(st):
    s, c = Spr(), P17
    b = c['body']
    aura(s, 32, 37, 31, 27, b[3], 8)
    body_feet(s, b, (20, 44), 7, 4)
    s.part(cap(50, 40, 57, 47, 3.6, 3.2), b)
    s.part(U(ell(32, 39, 22, 20), ellb(32, 61, 20, 11)), b, shine=True, bulge=True)
    s.part(poly([(32, 42), (28, 47), (32, 58), (36, 47)]), c['silver'])                 # 은빛 넥타이
    s.part(poly([(29, 40), (35, 40), (34, 44), (30, 44)]), c['silver'])
    # 학사모
    s.part(sell(32, 19, 13, 3.4, 3), c['cap'])
    s.part(poly([(32, 4), (61, 11), (32, 18), (3, 11)]), c['cap'])
    s.part(cap(32, 11, 50, 13, .9), c['silver'], edge=False, tone=2)
    s.part(cap(50, 13, 51, 23, 1.0), c['silver'], edge=False, tone=2)
    s.part(ell(51, 24, 2.2, 2.8), c['silver'], shine=True)
    s.part(ell(32, 11, 2, 1.5), c['silver'])
    # 은테 안경 + 눈
    for gx in (22, 35):
        s.fx({(gx + i, 25) for i in range(1, 7)} | {(gx + i, 31) for i in range(1, 7)} | {(gx, y) for y in range(26, 31)}
             | {(gx + 7, y) for y in range(26, 31)}, c['silver'][0])
    s.pxs([(30, 27), (31, 26), (32, 26), (33, 27)], c['silver'][0])
    s.eyes(26, 5, 3, 4)
    s.mouth(36, b[0], 'smile')
    s.blush(35, 9, c['blush'])
    # 출석부
    s.part(rect(3, 40, 17, 56), c['cap'])
    s.part(rect(5, 43, 15, 54), (c['cap'][0], WHITE, WHITE, WHITE), edge=False)
    s.pxs([(x, y) for y in (45, 48, 51) for x in range(8, 14)], c['silver'][1])
    s.pxs([(6, 45), (6, 48), (6, 51)], b[1])
    s.part(rect(8, 39, 12, 41), c['silver'])
    s.part(cap(15, 42, 14, 47, 3.6, 3.2), b)
    s.part(ell(14, 48, 3.6, 3.6), b)
    s.part(ell(57, 48, 3.6, 3.6), b)
    s.sparkle(58, 33, WHITE, big=True)
    s.sparkle(5, 30, b[3], big=True)
    return s


# 37 숨바꼭몽 (비밀) — 지도에 없는 비밀 QR 에서만. 반투명 느낌의 청록 유령 몸 + 배에 물음표 + 한쪽 눈 윙크
P37 = dict(body=ramp(.50, .38, .93), mark=hramp('3a1858', '6a3aa0', '9a6ad0', 'd8c0f8'), blush=hexc('ff9fbe'))
QMARK = ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..']


def line_secret(st):
    s, c = Spr(), P37
    b = c['body']
    aura(s, 32, 36, 30, 26, c['mark'][3], 9)
    # 유령 몸: 둥근 머리 + 물결 치는 아래 자락
    s.part(U(ell(32, 34, 20, 21), rect(13, 34, 51, 57), ellb(17, F, 5, 6), ellb(32, F, 6, 7), ellb(47, F, 5, 6)), b, shine=True, bulge=True)
    s.part(ell(11, 40, 4, 6, -35), b)                       # 팔 (숨바꼭질: 한 손은 눈을 가리는 척)
    s.part(ell(52, 31, 4, 6, 30), b)
    # 배의 물음표
    for yy, row in enumerate(QMARK):
        for xx, ch in enumerate(row):
            if ch == '#':
                s.px(30 + xx, 39 + yy, c['mark'][1])
    s.eyes(26, 5, 3, 4)
    s.pxs([(36, 28), (37, 27), (38, 27), (39, 28)], EYE)     # 오른쪽 눈은 윙크 (덮어쓰기)
    for y in range(26, 30):
        for x in range(37, 40):
            if (x, y) not in ((36, 28), (37, 27), (38, 27), (39, 28)):
                s.px(x, y, b[2])
    s.mouth(34, b[0], 'cat')
    s.blush(32, 9, c['blush'])
    s.sparkle(6, 10, WHITE, big=True)
    s.sparkle(57, 52, c['mark'][3])
    return s


# ================================================================ 과목 가족 공통 몸 + 선생님별 모티프
# 같은 과목 = 같은 몸 구조(plan) + 같은 색 계열.  선생님마다 귀/눈/강조색/모티프가 다르다.

STAGE = {
    1: dict(cy=47.5, rx=12.5, ry=12.5, brx=11.5, bry=6, ey=44, gap=3, my=50, k=.7, feet=(26, 38, 3.5, 2.5),
            arms=None, hands=((21, 54), (43, 54))),
    2: dict(cy=41, rx=17, ry=17, brx=15, bry=9, ey=36, gap=4, my=43, k=.85, feet=(23, 41, 5, 3.2),
            arms=((19, 45, 10, 50), (45, 45, 54, 50)), hands=((10, 50), (54, 50))),
    3: dict(cy=35.5, rx=21, ry=21.5, brx=19, bry=11, ey=28, gap=5, my=36, k=1.0, feet=(19, 45, 7, 4),
            arms=((14, 40, 6, 46), (50, 40, 58, 46)), hands=((6, 46), (58, 46))),
}


def body_shape(plan, g):
    cy, rx, ry = g['cy'], g['rx'], g['ry']
    base = ellb(32, F - 1, g['brx'], g['bry'])
    if plan == 'square':
        return U(sell(32, cy + 1, rx * .95, ry + .5, 3.2), base)
    if plan == 'drop':          # 먹물 방울 + 한쪽으로 휜 붓끝 머리 (양파처럼 보이지 않게 비대칭)
        return U(ell(32, cy + 1, rx, ry - 1), base,
                 ell(32 + rx * .18, cy - ry * .72, rx * .46, ry * .42, -18),
                 ell(32 + rx * .42, cy - ry * 1.05, rx * .2, ry * .3, -38))
    if plan == 'pear':
        return U(ell(32, cy + ry * .2, rx, ry * .8), ell(32, cy - ry * .3, rx * .8, ry * .7), base)
    if plan == 'tri':          # 'A' 모양
        return U(poly([(32 - rx * 1.05, F - 1), (32 - rx * .35, cy - ry), (32 + rx * .35, cy - ry), (32 + rx * 1.05, F - 1)]),
                 ell(32, cy - ry * .45, rx * .5, ry * .55), ell(32, cy + ry * .35, rx * .95, ry * .65), base)
    return U(ell(32, cy, rx, ry), base)


def ears(s, kind, g, rp, inner):
    k, top, rx = g['k'], g['top'], g['rx']
    if not kind:
        return
    for sg in (-1, 1):
        x = 32 + sg * rx * .55
        if kind == 'cat':
            s.part(poly([(x - 4 * k, top + 4), (x + sg * 2 * k, top - 6 * k), (x + 4 * k, top + 4)]), rp)
            s.part(poly([(x - 2 * k, top + 3), (x + sg * 1.5 * k, top - 3 * k), (x + 2 * k, top + 3)]), inner, edge=False, tone=2)
        elif kind == 'long':
            s.part(ell(32 + sg * rx * .42, top - 4 * k, 3 * k, 7.5 * k, sg * 14), rp)
            s.part(ell(32 + sg * rx * .42, top - 3 * k, 1.3 * k, 5 * k, sg * 14), inner, edge=False, tone=2)
        elif kind == 'round':
            s.part(ell(32 + sg * rx * .62, top + .5 * k, 4.8 * k, 4.8 * k), rp)
            s.part(ell(32 + sg * rx * .62, top + 1 * k, 2.6 * k, 2.6 * k), inner, edge=False, tone=2)
        elif kind == 'leaf':
            s.part(ell(32 + sg * rx * .5, top - 2 * k, 2.6 * k + .5, 6 * k, sg * 30), inner)
        elif kind == 'fin':
            s.part(ell(32 + sg * (rx + 1), g['cy'] - g['ry'] * .35, 3 * k + .5, 6 * k, sg * 35), rp)
        elif kind == 'antenna':
            s.part(cap(32 + sg * rx * .3, top + 2, 32 + sg * rx * .45, top - 6 * k, 1.0), rp, edge=False, tone=0)
            s.part(ell(32 + sg * rx * .45, top - 6 * k - 1, 2.4 * k + .4, 2.4 * k + .4), inner, shine=True)
        elif kind == 'horn':
            s.part(poly([(x - 2.5 * k, top + 3), (x + sg * 2.5 * k, top - 5 * k), (x + 2.5 * k, top + 3)]), inner)


def face(s, g, T, st):
    style = T.get('eyes', 'big')
    rp = T['body']
    ey, gap = g['ey'], g['gap']
    if style == 'happy':        # ^ ^
        for sx in (32 - gap - 4, 32 + gap):
            s.pxs([(sx, ey + 2), (sx + 1, ey + 1), (sx + 2, ey + 1), (sx + 3, ey + 2)], EYE)
    elif style == 'sleepy':     # 반쯤 감은 눈
        for sx in (32 - gap - 3, 32 + gap):
            s.pxs([(sx, ey + 1), (sx + 1, ey + 2), (sx + 2, ey + 2), (sx + 1, ey + 1), (sx + 2, ey + 1)], EYE)
            s.pxs([(sx - 1, ey), (sx, ey + 1)], rp[0])
    elif style == 'dot':
        s.eyes(ey + 1, gap + 1, 2, 3)
    elif st == 3:
        s.eyes(ey - 1, gap, 4, 5, style='white' if style == 'white' else 'dark')
    else:
        s.eyes(ey, gap, 3, 4, style='white' if style == 'white' else 'dark')
    if st == 3 and T.get('brows', True):
        for sx, d in ((32 - gap - 5, 1), (32 + gap + 1, -1)):
            pts = [(sx + i, ey - 3 + (1 if (i == 0 and d > 0) or (i == 3 and d < 0) else 0)) for i in range(4)]
            s.pxs(pts, rp[0])
    s.mouth(g['my'], rp[0], T.get('mouth', 'smile'), tongue=T.get('blush'))
    if T.get('blush'):
        s.blush(g['my'] - 1, gap + 3 + (1 if st == 3 else 0), T['blush'])


def critter(st, T):
    s = Spr()
    g = dict(STAGE[st])
    g['top'] = g['cy'] - g['ry']
    rp, acc = T['body'], T['acc']
    m = T.get('motif') or (lambda *a: None)

    def hand(i):
        x, y = g['hands'][i]
        r = {1: 2.4, 2: 2.8, 3: 3.4}[st]
        s.part(ell(x, y, r, r), T.get('hand', rp))
    g['hand'] = hand
    m(s, st, g, T, 'back')
    ears(s, T.get('ears'), g, rp, T.get('inner', acc))
    fx0, fx1, frx, fry = g['feet']
    for x in (fx0, fx1):
        s.part(ellb(x, F, frx, fry), T.get('feet', rp))
    if g['arms'] and T.get('arms', True):
        for (x0, y0, x1, y1) in g['arms']:
            s.part(cap(x0, y0, x1, y1, 2.4 * g['k'] + .6, 2.0 * g['k'] + .5), rp)
    s.part(body_shape(T.get('plan', 'round'), g), rp, shine=True, bulge=True)
    if T.get('belly'):
        s.part(ell(32, g['cy'] + g['ry'] * .55, g['rx'] * .55, g['ry'] * .38), T['belly'], edge=False)
    m(s, st, g, T, 'mid')
    face(s, g, T, st)
    m(s, st, g, T, 'front')
    if T.get('rare'):
        sp = T.get('spark', hexc('ffe066'))
        for (x, y, big) in {1: ((13, 38, False), (52, 44, False)), 2: ((7, 24, True), (57, 30, False)),
                            3: ((5, 8, True), (59, 12, True), (4, 58, False))}[st]:
            if not s.has(x, y):
                s.sparkle(x, y, sp, big)
    return s


# ---- 모티프 도우미
def staff(s, x0, y0, x1, y1, rp, r=1.3):
    s.part(cap(x0, y0, x1, y1, r), rp)


def block(s, cx, cy, r, rp, letter, col):
    s.part(sell(cx, cy, r, r, 6), rp, shine=True)
    text(s, round(cx) - 1, round(cy) - 2, letter, col)


def coin(s, cx, cy, r, rp, mark=True):
    s.part(ell(cx, cy, r, r), rp, shine=True)
    if mark and r >= 3:
        s.pxs([(round(cx) - 1, round(cy) - 1), (round(cx) - 1, round(cy)), (round(cx) - 1, round(cy) + 1)], rp[1])


def book(s, x0, y0, x1, y1, cover, page, open_=False):
    if open_:
        s.part(rect(x0, y0, x1, y1), cover)
        s.part(rect(x0 + 1, y0 - 1, (x0 + x1) // 2, y1 - 1), page)
        s.part(rect((x0 + x1) // 2 + 1, y0 - 1, x1 - 1, y1 - 1), page)
        for yy in range(y0 + 1, y1 - 1, 2):
            s.pxs([(x, yy) for x in range(x0 + 2, x1 - 1) if x not in ((x0 + x1) // 2, (x0 + x1) // 2 + 1)], page[1])
    else:
        s.part(rect(x0, y0, x1, y1), cover)
        s.pxs([(x, y1 - 1) for x in range(x0 + 1, x1)], page[2])


# ---- 국어 (분홍 물방울 몸)
def m_quote(s, st, g, T, ph):           # 문장: “ ” 따옴표 귀 + 원고지 배
    k = g['k']
    if ph == 'back':
        for sg in (-1, 1):          # “ ” : round head on top, tail curling down-outward
            x, y = 32 + sg * g['rx'] * .64, g['top'] - 2 - 3 * k
            s.part(ell(x, y, 3.5 * k + 1, 3.5 * k + 1), T['acc'], shine=True)
            s.part(cap(x + sg * 1.8 * k, y + 2 * k, x - sg * 1.5 * k, y + 8 * k, 1.8 * k + .5, .9 * k + .4), T['acc'])
    elif ph == 'mid' and st >= 2:
        x0, y0 = 32 - int(g['rx'] * .5), int(g['cy'] + g['ry'] * .32)
        w, h = int(g['rx']), int(g['ry'] * .5)
        s.part(rect(x0, y0, x0 + w, y0 + h), T['m2'])
        for yy in range(y0 + 2, y0 + h - 1, 2):
            s.pxs([(x, yy) for x in range(x0 + 2, x0 + w - 1 - (yy % 3))], T['acc'][2])
    elif ph == 'front' and st == 3:
        staff(s, 57, 49, 61, 34, T['acc'], 1.6)
        s.part(poly([(60, 35), (63, 29), (62, 36)]), T['m2'])
        g['hand'](1)


def bamboo(s, x, y0, y1, rp, w=2):
    s.part(rect(x - w, y1, x + w - 1, y0), rp)
    for yy in range(y0 - 5, y1, -6):
        s.pxs([(xx, yy) for xx in range(x - w, x + w)], rp[0])
    s.part(ell(x + w + 2, y1 + 1, 4, 1.6, -30), rp)
    s.part(ell(x - w - 2, y1 + 4, 3.4, 1.4, 30), rp)


def m_bamboo(s, st, g, T, ph):          # 시조: 대나무
    if ph == 'back':
        if st >= 2:
            bamboo(s, 52, 60, 24 if st == 2 else 8, T['acc'], 2 if st == 2 else 3)
        if st == 3:
            bamboo(s, 10, 58, 16, T['acc'], 2)
    elif ph == 'front':
        x, y = 34, int(g['top']) + (1 if st == 1 else 0)
        s.part(cap(x, y + 1, x + 1, y - 3, 1), T['acc'], edge=False, tone=0)
        s.part(ell(x + 3, y - 4, 3, 1.4, -25), T['acc'])


def round_glasses(s, g, col):
    for gx in (32 - g['gap'] - 5, 32 + g['gap'] - 1):
        s.fx({(gx + i, g['ey'] - 1) for i in range(1, 5)} | {(gx + i, g['ey'] + 4) for i in range(1, 5)}
             | {(gx, y) for y in range(g['ey'], g['ey'] + 4)} | {(gx + 5, y) for y in range(g['ey'], g['ey'] + 4)}, col)
    s.pxs([(31, g['ey'] + 1), (32, g['ey'] + 1)], col)


def m_redpen(s, st, g, T, ph):          # 맞춤: 빨간펜 + ✓ / ○
    if ph == 'mid':
        cx, cy = 32, int(g['cy'] + g['ry'] * .5)
        r = 2 + st
        if st == 1:
            s.pxs([(cx - 3, cy), (cx - 2, cy + 1), (cx - 1, cy + 2), (cx, cy + 1), (cx + 1, cy), (cx + 2, cy - 1), (cx + 3, cy - 2)], T['acc'][1])
        else:
            for a in range(0, 360, 6):
                s.px(round(cx + math.cos(math.radians(a)) * r) - 1, round(cy + math.sin(math.radians(a)) * r * .8), T['acc'][1])
    elif ph == 'front':
        if st == 1:
            staff(s, 41, 57, 47, 46, T['acc'], 1.3)
            s.part(poly([(46, 47), (49, 42), (48, 48)]), T['m2'])
            g['hand'](1)
        else:
            hx, hy = g['hands'][1]
            L = 16 if st == 2 else 22
            staff(s, hx - 2, hy + 5, hx + 4, hy - L, T['acc'], 1.6 if st == 2 else 2.0)
            s.part(poly([(hx + 3, hy - L), (hx + 6, hy - L - 6), (hx + 5, hy - L + 1)]), T['m2'])
            s.part(rect(hx - 1, hy - L + 6, hx + 3, hy - L + 7), T['m2'], edge=False, tone=2)
            g['hand'](1)
        if st == 3:
            round_glasses(s, g, T['body'][0])


def gat(s, cx, brim_y, w, h, rp, band=None):
    s.part(ell(cx, brim_y, w / 2, 2.6), rp)
    s.part(sell(cx, brim_y - h / 2 - 1, w * .22, h / 2, 6), rp, shine=True)
    if band:
        s.pxs([(x, brim_y - 2) for x in range(int(cx - w * .22) + 1, int(cx + w * .22))], band)


def m_classic(s, st, g, T, ph):         # 고전: 옛 책 + 두루마리 + 갓
    if ph != 'front':
        return
    top = int(g['top'])
    if st < 3:
        w = 9 if st == 1 else 11
        s.part(rect(32 - w, top - 3, 31 + w, top + 1), T['acc'])
        s.pxs([(x, top) for x in range(33 - w, 31 + w)], T['m2'][2])
        s.pxs([(x, top - 2) for x in range(32 - w, 32 + w) if x % 4 == 0], T['acc'][3])
    if st >= 2:
        hx, hy = g['hands'][0]
        scroll_item(s, hx - 4, hy - 4, hx + 5, hy + 4, T['m2'], T['acc'][1])
        g['hand'](0)
    if st == 3:
        gat(s, 32, top + 2, 40, 12, hramp('1a0f1e', '2e1c34', '42304a', '6a5476'), T['acc'][2])
        book(s, 24, 48, 40, 55, T['acc'], T['m2'], open_=True)


# ---- 수학 (남색 네모 몸)
def m_tangent(s, st, g, T, ph):         # 미분: 곡선 뿔 + 접선
    k = g['k']
    if ph == 'back':
        for sg in (-1, 1):
            pts = [(32 + sg * (g['rx'] * .35 + i * 1.7 * k), g['top'] + 3 - 9 * k * math.sin(i / 4 * 1.3)) for i in range(5)]
            for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                s.part(cap(x0, y0, x1, y1, 1.9 * k + .3, 1.6 * k + .2), T['acc'], edge=False)
            tx, ty = pts[2]
            for t in range(-5, 6):
                s.px(round(tx + t * .9) - (1 if sg < 0 else 0), round(ty - 3 - t * .45 * sg), T['m2'][0])
    elif ph == 'mid' and st >= 2:
        x0, y0, w, h = 32 - int(g['rx'] * .5), int(g['cy'] + g['ry'] * .2), int(g['rx']), int(g['ry'] * .6)
        s.part(rect(x0, y0, x0 + w, y0 + h), T['m2'])
        for i in range(w - 2):
            s.px(x0 + 1 + i, y0 + h - 2 - int((i / (w - 3)) ** 2 * (h - 3)), T['body'][1])
        for t in range(w - 4):
            y = y0 + h - 1 - int(t * .55)
            if y > y0:
                s.px(x0 + 3 + t, y, T['acc'][1])
    elif ph == 'front' and st == 3:
        hx, hy = g['hands'][1]
        staff(s, hx, hy + 6, hx, hy - 30, T['acc'], 1.4)
        staff(s, hx, hy - 30, hx - 5, hy - 34, T['acc'], 1.2)
        g['hand'](1)


def m_integral(s, st, g, T, ph):        # 적분: ∫ 볏 + ∫ 꼬리
    k = g['k']
    if ph == 'back':
        if st >= 2:
            pts = [(44, 56), (52, 50), (53, 40), (55, 33), (60, 30)] if st == 2 else [(46, 56), (56, 50), (57, 36), (59, 26), (63, 22)]
            for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                s.part(cap(x0, y0, x1, y1, 2.4 * k, 2.0 * k), T['body'])
        t = g['top']
        pts = [(28, t + 3), (30, t - 1), (31, t - 5 * k), (33, t - 9 * k), (36, t - 10 * k)]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            s.part(cap(x0, y0, x1, y1, 1.8 * k + .2), T['acc'], edge=False)
        s.part(ell(36.5, t - 10 * k, 1.8 * k + .5, 1.8 * k + .5), T['acc'])
    elif ph == 'mid' and st >= 2:
        cx, cy = 32, int(g['cy'] + g['ry'] * .45)
        s.part(ell(cx, cy, g['rx'] * .45, g['ry'] * .32), T['m2'])
        sig = [(-3, -3), (-2, -3), (-1, -3), (0, -3), (1, -3), (2, -3), (-2, -2), (-1, -1), (0, 0), (-1, 1), (-2, 2),
               (-3, 3), (-2, 3), (-1, 3), (0, 3), (1, 3), (2, 3)]
        s.pxs([(cx + x, cy + y) for x, y in sig], T['body'][1])
    elif ph == 'front' and st == 3:
        t = int(g['top'])
        crown = U(rect(23, t - 3, 40, t + 1), poly([(23, t - 2), (24, t - 9), (28, t - 2)]),
                  poly([(35, t - 2), (39, t - 9), (41, t - 2)]))
        s.part(crown, T['acc'], shine=True)


def die(s, cx, cy, r, rp, pip, n):
    s.part(sell(cx, cy, r, r, 5), rp, shine=True)
    d = max(1, round(r * .5))
    spots = {1: [(0, 0)], 2: [(-d, -d), (d, d)], 3: [(-d, -d), (0, 0), (d, d)], 4: [(-d, -d), (d, -d), (-d, d), (d, d)],
             5: [(-d, -d), (d, -d), (0, 0), (-d, d), (d, d)], 6: [(-d, -d), (d, -d), (-d, 0), (d, 0), (-d, d), (d, d)]}[n]
    for x, y in spots:
        s.px(math.floor(cx) + x, math.floor(cy) + y, pip)


def m_dice(s, st, g, T, ph):            # 확률: 주사위
    t = int(g['top'])
    if ph == 'back' and st >= 2:
        die(s, 32 - g['rx'] * .58, t + 1, 4.8, T['m2'], T['acc'][1], 3)
        die(s, 32 + g['rx'] * .58, t + 1, 4.8, T['m2'], T['acc'][1], 5)
    elif ph == 'front':
        if st == 1:
            die(s, 32, t - 2, 5.6, T['m2'], T['acc'][1], 1)
        else:
            hx, hy = g['hands'][1]
            die(s, hx + 2, hy - 6, 5.6 if st == 2 else 6.6, T['m2'], T['acc'][1], 6 if st == 2 else 4)
            g['hand'](1)
        if st == 3:
            die(s, 32, t - 4, 5.4, T['m2'], T['acc'][1], 1)


def m_geometry(s, st, g, T, ph):        # 기하: 삼각자 뿔 + 컴퍼스
    k, t = g['k'], g['top']
    if ph == 'back':
        if st == 3:
            for sg in (-1, 1):
                tri = minus(poly([(32 + sg * 12, 30), (32 + sg * 31, 12), (32 + sg * 31, 36)]),
                            poly([(32 + sg * 21, 30), (32 + sg * 28, 22), (32 + sg * 28, 31)]))
                s.part(tri, T['acc'])
        tri = minus(poly([(32 - 9 * k, t + 3), (32, t - 11 * k), (32 + 9 * k, t + 3)]),
                    poly([(32 - 3 * k, t + 1), (32, t - 4 * k), (32 + 3 * k, t + 1)]))
        s.part(tri, T['acc'])
    elif ph == 'front' and st >= 2:
        hx, hy = g['hands'][1]
        L = 14 if st == 2 else 20
        s.part(cap(hx, hy - L, hx - 3, hy + 4, 1.0), T['m2'], edge=False, tone=0)
        s.part(cap(hx, hy - L, hx + 4, hy + 4, 1.0), T['m2'], edge=False, tone=0)
        s.part(ell(hx, hy - L, 2, 2), T['m2'], shine=True)
        g['hand'](1)


# ---- 영어 (하늘색 둥근 몸 + 귀)
def m_blocks(s, st, g, T, ph):          # 알파: ABC 블록
    if ph != 'front':
        return
    t = int(g['top'])
    block(s, 32, t - 2, 4.5 if st == 1 else 5, T['m2'], 'A', T['acc'][1])
    if st >= 2:
        hx, hy = g['hands'][1]
        block(s, hx + 1, hy - 5, 4.5, T['acc'], 'B', T['m2'][3])
        g['hand'](1)
    if st == 3:
        hx, hy = g['hands'][0]
        block(s, hx - 1, hy - 5, 4.5, T['acc'], 'C', T['m2'][3])
        g['hand'](0)


def m_reading(s, st, g, T, ph):         # 리딩: 동그란 안경 + 펼친 책
    if ph != 'front':
        return
    round_glasses(s, g, T['acc'][1])
    w = {1: 8, 2: 11, 3: 14}[st]
    y0 = int(g['cy'] + g['ry'] * .35)
    book(s, 32 - w, y0, 31 + w, y0 + 2 + st * 2, T['acc'], T['m2'], open_=True)
    for x in (32 - w, 31 + w):
        s.part(ell(x, y0 + 2, 2.2 + st * .4, 2.2 + st * .4), T['body'])


def m_speech(s, st, g, T, ph):          # 스피치: 마이크 + 말풍선
    if ph == 'back' and st == 3:
        speech(s, 10, 11, 18, 12, T['m2'], 'right')
        speech(s, 54, 11, 18, 12, T['m2'], 'left')
        text(s, 7, 9, 'Hi', T['acc'][1])
        s.pxs([(53, 8), (53, 9), (53, 10), (53, 12)], T['acc'][1])
    if ph == 'front':
        if st < 3:
            bx = 47 if st == 1 else 49
            speech(s, bx, g['top'] - 1, 12, 9, T['m2'], 'left')
            s.pxs([(bx - 1, y) for y in range(int(g['top']) - 4, int(g['top']) + 1) if y != int(g['top']) - 1], T['acc'][1])
        hx, hy = g['hands'][0]
        L = {1: 6, 2: 9, 3: 12}[st]
        staff(s, hx, hy, hx + 2, hy - L, T['acc'], 1.2 + st * .3)
        s.part(ell(hx + 2, hy - L - 2, 2 + st * .5, 2.4 + st * .5), T['m3'], shine=True)
        g['hand'](0)


# ---- 사회 (보라 몸)
def m_ballot(s, st, g, T, ph):          # 시민: 깃발 + 투표함
    if ph == 'mid' and st == 3:
        x0, y0 = 23, 45
        s.part(rect(x0, y0, x0 + 18, y0 + 12), T['m2'])
        s.pxs([(x, y0 + 3) for x in range(x0 + 5, x0 + 14)], T['m2'][0])
        s.part(rect(x0 + 6, y0 - 3, x0 + 12, y0 + 2), (T['m2'][0], WHITE, WHITE, WHITE))
        s.pxs([(x0 + 8, y0 - 1), (x0 + 9, y0), (x0 + 10, y0 - 1), (x0 + 11, y0 - 2)], T['acc'][1])
    if ph == 'front':
        if st == 1:
            x, y = 34, int(g['top']) + 1
            s.part(rect(x, y - 9, x, y), (T['m2'][0],) * 4, edge=False)
            s.part(poly([(x + 1, y - 9), (x + 8, y - 7), (x + 1, y - 4)]), T['acc'])
        else:
            hx, hy = g['hands'][1]
            L = 26 if st == 2 else 40
            s.part(rect(hx, hy - L, hx + 1, hy + 5), (T['m2'][0], T['m2'][1], T['m2'][1], T['m2'][2]), edge=False)
            w, h = (10, 7) if st == 2 else (13, 9)
            s.part(poly([(hx + 2, hy - L), (hx + 2 + w, hy - L + 1), (hx + 1 + w, hy - L + h), (hx + 2, hy - L + h - 1)]), T['acc'])
            s.part(ell(hx + .5, hy - L - 1, 1.6, 1.6), T['acc'])
            g['hand'](1)


def m_economy(s, st, g, T, ph):         # 경제: 동전 + 상승 그래프
    if ph == 'back':
        if st >= 2:
            pts = [(44, 57), (50, 52), (53, 46), (58, 40)] if st == 2 else [(44, 56), (52, 50), (56, 42), (61, 32)]
            for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                s.part(cap(x0, y0, x1, y1, 2.2 * g['k'], 1.8 * g['k']), T['body'])
            x, y = pts[-1]
            s.part(poly([(x - 3, y + 2), (x + 2, y - 5), (x + 4, y + 3)]), T['acc'])
    elif ph == 'front':
        t = int(g['top'])
        coin(s, 32, t + 3 if st > 1 else t + 1, 3.5 if st < 3 else 4.5, T['acc'])
        if st == 1:
            coin(s, 42, 54, 3.4, T['acc'])
            g['hand'](1)


def m_geography(s, st, g, T, ph):       # 지리: 지구본 + 나침반 별
    if ph == 'mid' and st >= 2:
        cx, cy = 32, int(g['cy'] + g['ry'] * .45)
        r = 4 if st == 2 else 6
        star = U(poly([(cx - .5, cy - r), (cx + 1.5, cy), (cx - .5, cy + r + 1), (cx - 2.5, cy)]),
                 poly([(cx - r - 1, cy + .5), (cx, cy - 1.5), (cx + r, cy + .5), (cx, cy + 2.5)]))
        s.part(star, T['m3'])
    elif ph == 'front':
        t = g['top']
        n = {1: 5, 2: 6, 3: 7}[st]
        s.part(poly([(30, t + 2), (32, t - n), (34, t + 2)]), T['m3'], shine=True)
        hx, hy = g['hands'][1]
        r = {1: 5, 2: 6.5, 3: 8}[st]
        x, y = (hx + 2, hy - 4) if st > 1 else (44, 50)
        gl = ell(x, y, r, r)
        s.part(gl, T['acc'], shine=True)
        inner = {q for q in gl if all((q[0] + dx, q[1] + dy) in gl for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))}
        for (lx, ly, rx, ry, a) in LANDS[:2]:
            s.part({q: gl[q] for q in ell(x + lx * r, y + ly * r, rx * r * 1.2, ry * r * 1.3, a) if q in inner}, T['m2'],
                   edge=False, tone=2)
        s.part(orbit_half(x, y, r + 2), T['m3'])
        g['hand'](1)


def m_law(s, st, g, T, ph):             # 법률: 저울 + 의사봉
    if ph == 'front':
        if st >= 2:
            scales(s, 32, int(g['top']) - (8 if st == 2 else 10), 22 if st == 2 else 28, T['m3'])
        hx, hy = g['hands'][1]
        if st == 1:
            hx, hy = 44, 52
        L = {1: 7, 2: 10, 3: 13}[st]
        staff(s, hx - 1, hy + 2, hx + 2, hy - L, T['m2'], 1.1 + st * .2)
        s.part(sell(hx + 2, hy - L - 1, 4 + st, 2 + st * .4, 4), T['m2'], shine=True)
        g['hand'](1)
        if st == 1:
            s.part(ell(32, g['top'] + 1, 3, 2.4), T['m3'], shine=True)


# ---- 외국어 (희귀)
def m_german(s, st, g, T, ph):          # 독일어: 'Ä' 몸 + 프레첼 + 성탑
    t = g['top']
    if ph == 'back':
        for sg in (-1, 1):       # 움라우트 점 두 개
            x = 32 + sg * (4 + st)
            s.part(cap(x, t + 3, x, t - 3 - 1.5 * st, .9), T['body'], edge=False, tone=0)
            s.part(ell(x, t - 4 - 1.5 * st, 2.2 + st * .3, 2.2 + st * .3), T['acc'], shine=True)
    elif ph == 'front' and st >= 2:
        hx, hy = g['hands'][1]
        r = 5.2 if st == 2 else 6.4
        for dx in (-1.6, 1.6):
            s.part(minus(ell(hx + dx * r / 2, hy - 4, r * .62, r * .62), ell(hx + dx * r / 2, hy - 4, r * .26, r * .26)), T['m2'], edge=False, tone=1)
        g['hand'](1)
        if st == 3:
            tt = int(t)
            tower = U(rect(24, tt - 6, 39, tt + 3), rect(24, tt - 10, 26, tt - 6), rect(30, tt - 10, 33, tt - 6), rect(37, tt - 10, 39, tt - 6))
            s.part(tower, T['m3'])
            s.part(rect(31, tt - 4, 32, tt), (T['m3'][0],) * 4, edge=False)


def m_french(s, st, g, T, ph):          # 프랑스어: 베레모 + 바게트 + 줄무늬
    if ph == 'mid':
        y0 = int(g['cy'] + g['ry'] * .25)
        for yy in range(y0, F, 3):
            s.pxs([(x, yy) for x in range(10, 54) if s.c.get((x, yy)) in T['body'][1:]], T['m2'][2])
    elif ph == 'front':
        beret(s, 31, g['top'] + 2, {1: 22, 2: 28, 3: 36}[st], T['acc'], tilt=-12)
        if st >= 2:
            hx, hy = g['hands'][1]
            L = 18 if st == 2 else 26
            s.part(cap(hx - 3, hy + 6, hx + 3, hy - L, 2.2 if st == 2 else 2.8), T['m3'], shine=True)
            for i in range(3):
                yy = hy - 4 - i * (L // 4)
                s.pxs([(hx - 1 + i // 2, yy), (hx + i // 2, yy - 1)], T['m3'][1])
            g['hand'](1)


def m_spanish(s, st, g, T, ph):         # 스페인어: 태양 갈기 + 기타
    if ph == 'back':
        cx, cy = 32, g['top'] + g['ry'] * .7
        R = g['rx'] + 2 + st * .5
        s.part(ell(cx, cy, R - 4.5, R - 4.5), T['acc'], shine=True)          # sun disk the rays grow from
        for i in range(12):
            a = math.radians(i * 30 + 15)
            if math.sin(a) < -0.2:
                continue
            x1, y1 = cx + math.cos(a) * R, cy - math.sin(a) * R
            s.part(poly([(cx + math.cos(a - .26) * (R - 6), cy - math.sin(a - .26) * (R - 6)), (x1, y1),
                         (cx + math.cos(a + .26) * (R - 6), cy - math.sin(a + .26) * (R - 6))]), T['acc'], edge=False, tone=1)
    elif ph == 'front' and st >= 2:
        hx, hy = g['hands'][0]
        x, y = hx + 6, hy + 2
        sc = 1 if st == 2 else 1.3
        s.part(cap(x, y, x + 12 * sc, y - 14 * sc, 1.3), T['m3'])
        s.part(U(ell(x - 1, y + 1, 4.4 * sc, 4 * sc, 40), ell(x + 2 * sc, y - 3 * sc, 3.4 * sc, 3 * sc, 40)), T['m2'], shine=True)
        s.part(ell(x + .5, y - 1, 1.3, 1.3), (T['m2'][0],) * 4, edge=False)
        g['hand'](0)


# ---- 한국사 (황토 서양배 몸)
def m_timeline(s, st, g, T, ph):        # 연표: 두루마리 연표
    if ph == 'back' and st == 2:
        s.part(rect(12, 22, 51, 29), T['m2'])
        s.part(sell(12, 25.5, 2, 5, 3), T['acc']); s.part(sell(51.5, 25.5, 2, 5, 3), T['acc'])
        s.pxs([(x, 25) for x in range(15, 49)], T['acc'][1])
        for x in (20, 32, 44):
            s.part(ell(x, 25, 1.4, 1.4), T['acc'], edge=False, tone=0)
    if ph == 'back' and st == 3:
        s.part(rect(4, 14, 59, 24), T['m2'])
        s.part(sell(4, 19, 2.4, 7, 3), T['acc'])
        s.part(sell(59.5, 19, 2.4, 7, 3), T['acc'])
        s.pxs([(x, 19) for x in range(7, 57)], T['acc'][1])
        for x in (11, 22, 41, 52):
            s.part(ell(x, 19, 1.8, 1.8), T['acc'], edge=False, tone=0)
    elif ph == 'front':
        if st == 1:
            scroll_item(s, 22, 52, 41, 57, T['m2'], T['acc'][1])
            g['hand'](0)
            g['hand'](1)
        elif st == 2:
            y0 = 48
            s.part(rect(12, y0, 52, y0 + 6), T['m2'])
            s.pxs([(x, y0 + 3) for x in range(14, 51)], T['acc'][1])
            for x in (17, 27, 37, 47):
                s.px(x, y0 + 2, T['acc'][0])
                s.px(x, y0 + 4, T['acc'][0])
            s.part(sell(11.5, y0 + 3, 2, 5, 3), T['acc'])
            s.part(sell(52.5, y0 + 3, 2, 5, 3), T['acc'])
        else:
            s.part(ell(32, 50, 6, 6), T['m3'], shine=True)
            s.pxs([(32, 47), (32, 48), (32, 49), (33, 50), (34, 51)], T['m3'][0])


def m_historian(s, st, g, T, ph):       # 사관: 붓 + 실록
    if ph != 'front':
        return
    hx, hy = g['hands'][1] if st > 1 else (44, 52)
    L = {1: 9, 2: 14, 3: 19}[st]
    s.part(cap(hx - 1, hy + 3, hx + 3, hy - L, 1.2), T['acc'])
    s.part(cap(hx + 3, hy - L, hx + 4, hy - L - 4, 1.8, .8), (T['acc'][0],) * 2 + (T['m3'][0],) * 2)
    g['hand'](1)
    if st >= 2:     # 실록 (파란 표지, 실로 꿰맨)
        hx, hy = g['hands'][0]
        w, h = (8, 10) if st == 2 else (11, 13)
        book(s, hx - 3, hy - h + 2, hx - 3 + w, hy + 2, T['m3'], T['m2'])
        for yy in range(hy - h + 4, hy + 1, 3):
            s.px(hx - 1, yy, T['m2'][3])
        s.part(rect(hx + 1, hy - h + 4, hx + 3, hy - h + 8), T['m2'], edge=False, tone=3)
        g['hand'](0)
    else:
        s.part(rect(19, 50, 26, 58), T['m3'])
        s.pxs([(20, y) for y in (52, 55)], T['m2'][3])
        g['hand'](0)


def m_dynasty(s, st, g, T, ph):         # 왕조: 면류관(구슬 늘어진 왕의 관) + 곤룡포 용무늬
    t = int(g['top'])
    if ph == 'mid' and st >= 2:
        cx, cy = 32, int(g['cy'] + g['ry'] * .45)
        r = 4.5 if st == 2 else 6.5
        s.part(ell(cx, cy, r, r), T['m2'])
        s.part(ell(cx, cy, r - 1.6, r - 1.6), T['acc'], edge=False, tone=3)
        s.pxs([(cx - 2, cy - 1), (cx - 1, cy - 2), (cx, cy - 1), (cx + 1, cy), (cx, cy + 1)], T['m2'][1])
    elif ph == 'front':
        w = 7 + st * 3
        s.part(sell(32, t - 1, w * .5, 3 + st * .5, 4), T['m3'], shine=True)          # 관 몸통
        bt = t - 4 - st
        s.part(rect(32 - w, bt - 1, 31 + w, bt + 1), T['m3'])                     # 위의 평평한 판
        s.pxs([(x, bt) for x in range(33 - w, 31 + w)], T['m3'][3])
        for x in range(33 - w, 31 + w, 3):                                        # 앞으로 늘어진 구슬 줄
            for j in range(2 + st):
                s.px(x, bt + 2 + j, T['acc'][2] if j % 2 == 0 else T['m2'][2])


# ---- 체육 (빨간 몸 + 운동화)
def sneakers(s, st, g, T):
    fx0, fx1, frx, fry = g['feet']
    for x in (fx0, fx1):
        w = frx * 2 + 2
        shp = U(ellb(x, F, w / 2, fry + .5), rect(int(x - w / 2) + 1, F - 1, int(x + w / 2) - 1, F))
        s.part(shp, T['m2'])
        s.pxs([(xx, F - 1) for xx in range(int(x - w / 2) + 2, int(x + w / 2) - 1)], T['acc'][2])


def m_hurdle(s, st, g, T, ph):          # 허들
    if ph == 'back':
        h = {1: 12, 2: 18, 3: 24}[st]
        x0, x1 = (40, 60) if st < 3 else (42, 63)
        for x in (x0, x1 - 1):
            s.part(rect(x, F - h, x + 1, F), T['m2'], tone=1)
        s.part(rect(x0 - 1, F - h - 3, x1, F - h), T['m2'])
        s.pxs([(x, y) for x in range(x0 + 1, x1) for y in range(F - h - 2, F - h) if (x // 3) % 2 == 0], T['acc'][2])
    elif ph == 'front':
        sneakers(s, st, g, T)
        if st == 3:
            s.pxs([(x, 41) for x in range(22, 43) if abs(x - 32) > 3], T['acc'][1])
            s.part(ell(32, 44, 4, 4), T['m3'], shine=True)


def m_rope(s, st, g, T, ph):            # 줄넘기
    hx0, hy0 = g['hands'][0] if st > 1 else (19, 52)
    hx1, hy1 = g['hands'][1] if st > 1 else (45, 52)
    if ph == 'back':
        top = g['top'] - {1: 8, 2: 9, 3: 8}[st]
        for t in range(81):
            x = hx0 + (hx1 - hx0) * t / 80
            y = hy0 - (hy0 - top) * math.sin(math.pi * t / 80) ** .7
            s.px(round(x), round(y), T['acc'][1]); s.px(round(x), round(y) + 1, T['acc'][0])
    elif ph == 'front':
        sneakers(s, st, g, T)
        for (x, y) in ((hx0, hy0), (hx1, hy1)):
            s.part(sell(x, y - 2, 1.6, 3.4, 3), T['m3'])
        if st > 1:
            g['hand'](0)
            g['hand'](1)


def m_ball(s, st, g, T, ph):            # 공 + 머리띠 + 호루라기 + 삐죽 머리
    if ph == 'back':
        t, k = g['top'], g['k']
        for dx, h in ((-5, 5), (0, 8), (5, 5)):
            s.part(poly([(32 + dx * k - 3 * k, t + 4), (32 + dx * k * 1.4, t - h * k), (32 + dx * k + 3 * k, t + 4)]), T['body'])
    if ph == 'front':
        sneakers(s, st, g, T)
        w = g['rx'] * 2 - 2
        y = g['top'] + 4 + st
        s.part(sell(32, y, w / 2, 1.8, 6), T['acc'])
        s.part(ell(32 + w / 2 + 2, y + 1, 3.6, 1.6, -25), T['acc'])
        s.part(ell(32 + w / 2 + 3, y + 4, 3.2, 1.4, 20), T['acc'])
        hx, hy = g['hands'][1] if st > 1 else (44, 51)
        r = {1: 4.5, 2: 6, 3: 7.5}[st]
        x, yb = hx + 1, hy - r + 1
        b = ell(x, yb, r, r)
        s.part(b, T['m2'], shine=True)
        for (px_, py_) in b:
            if abs((px_ + .5 - x) - (py_ + .5 - yb) * .6) < .6 or abs(py_ + .5 - yb - 1) < .5:
                if s.c.get((px_, py_)) not in (T['m2'][0], WHITE):
                    s.px(px_, py_, T['acc'][2])
        if st > 1:
            g['hand'](1)
            s.fx({(x2, g['my'] + 4) for x2 in range(26, 39) if abs(x2 - 32) > 1}, T['acc'][0])
            s.part(sell(32, g['my'] + 5, 2.5, 1.6, 3), T['m3'])


# ---- 과학·물리 (파란 몸, 머리 위 사과 + 원자 궤도)
def m_physics(s, st, g, T, ph):
    k = g['k']
    angs = {1: [], 2: [-18], 3: [-24, 24]}[st]
    obs = [orbit(32, g['cy'] - 1, g['rx'] + 9, 7 + st, a) for a in angs]
    if ph == 'back':
        for ob in obs:
            s.fx({q for q, v in ob.items() if v < 0}, T['m3'][2])
    elif ph == 'front':
        for ob in obs:
            s.fx({q for q, v in ob.items() if v >= 0}, T['m3'][3])
        for i, a in enumerate(angs):
            ang = math.radians(a)
            R = g['rx'] + 9
            sg = -1 if i == 0 else 1
            s.part(ell(32 + sg * R * math.cos(ang) * .97, g['cy'] - 1 + sg * R * math.sin(ang) * .97, 2.4, 2.4),
                   (T['m3'][2], T['m3'][2], T['m3'][3], T['m3'][3]), shine=True)
        t = g['top']
        r = {1: 4.5, 2: 5.2, 3: 6}[st]
        t += 2
        s.part(apple_body(32, t - 2 * r + 3, 2 * r, 2 * r - 1), T['acc'], shine=True)
        s.part(cap(32, t - 2 * r + 4, 33, t - 2 * r, 1), T['m2'], tone=0, edge=False)
        s.part(ell(36, t - 2 * r + .5, 3 * k + .5, 1.5 * k + .4, -25), T['m2'])


# ---- 정보·AI (청록 모니터 몸): 비트 / 알고 / 딥러
P_INFO = dict(case=hramp('163a40', '4e8890', '7ab8bc', 'c0ecea'), scr=hramp('061618', '0a2a2c', '10403c', '1e6052'),
              glow=hexc('5cff9a'), led=hexc('ff5c7a'), brain=ramp(.88, .32, .95), gear=ramp(.12, .55, .92))


def gear(s, cx, cy, r, rp):
    shp = {}
    for y in range(math.floor(cy - r - 2), math.ceil(cy + r + 2)):
        for x in range(math.floor(cx - r - 2), math.ceil(cx + r + 2)):
            dx, dy = x + .5 - cx, y + .5 - cy
            a = math.atan2(dy, dx)
            rr = r + (1.6 if math.cos(a * 8) > .3 else 0)
            if math.hypot(dx, dy) <= rr and math.hypot(dx, dy) > r * .35:
                shp[(x, y)] = _sph(dx / (rr + .5), dy / (rr + .5))
    s.part(shp, rp, shine=True)


def line_info(st, variant='bit'):
    s, c = Spr(), P_INFO
    k = c['case']
    if variant == 'algo' and st >= 2:          # 뒤의 톱니바퀴
        gear(s, 10 if st == 3 else 12, 22 if st == 3 else 30, 6 if st == 3 else 4.5, c['gear'])
        gear(s, 54, 16 if st == 3 else 26, 7 if st == 3 else 5, c['gear'])
    if variant == 'deep' and st == 3:          # 신경망 후광
        nodes = [(6, 10), (6, 24), (6, 38), (58, 10), (58, 24), (58, 38), (32, 5)]
        for (x0, y0) in nodes:
            for (x1, y1) in ((20, 18), (44, 18)):
                for i in range(1, 12):
                    t = i / 12
                    s.px(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t), c['scr'][3])
        for (x, y) in nodes:
            s.part(ell(x, y, 2.2, 2.2), (c['scr'][0], c['glow'], c['glow'], WHITE), edge=True)
    if st == 1:
        for x in (24, 28, 35, 39):
            s.part(rect(x, 56, x + 1, F), k, tone=1)
        top_y = 35
        s.part(sell(32, 46, 13, 11, 4), k, shine=True)
        screen_face(s, 23, 39, 18, 12, c)
        hx = 44
    elif st == 2:
        body_feet(s, k, (24, 40), 4.5, 3)
        s.part(cap(26, 52, 25, 58, 2.6), k)
        s.part(cap(38, 52, 39, 58, 2.6), k)
        s.part(sell(32, 50, 11, 6, 4), k)
        s.part(cap(18, 48, 10, 54, 2.4, 2), k)
        s.part(cap(46, 48, 54, 54, 2.4, 2), k)
        top_y = 20
        s.part(sell(32, 33, 17, 13, 4.5), k, shine=True)
        screen_face(s, 19, 24, 26, 17, c, big=True)
        s.pxs([(26, 49), (28, 49), (30, 49), (36, 49)], c['glow'])
    else:
        if variant == 'bit':                    # 회로 날개
            for sg in (-1, 1):
                wing = poly([(32 + sg * 14, 30), (32 + sg * 30, 14), (32 + sg * 31, 34), (32 + sg * 16, 46)])
                s.part(wing, c['scr'])
                for (x0, y0, x1, y1) in ((18, 33, 6, 22), (19, 38, 4, 30), (8, 22, 8, 18)):
                    x0, x1 = (x0, x1) if sg < 0 else (63 - x0, 63 - x1)
                    for i in range(12):
                        t = i / 11
                        x, y = round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t)
                        if (x, y) in wing and s.c.get((x, y)) != c['scr'][0]:
                            s.px(x, y, c['glow'])
        body_feet(s, k, (21, 43), 6.5, 3.8)
        s.part(cap(25, 50, 23, 57, 3.6), k)
        s.part(cap(39, 50, 41, 57, 3.6), k)
        s.part(sell(32, 46, 14, 8, 4), k, shine=True)
        s.part(sell(32, 46, 6, 4, 4), c['scr'], tone=2)
        s.part(cap(17, 44, 11, 52, 3, 2.6), k)
        s.part(cap(47, 44, 53, 52, 3, 2.6), k)
        top_y = 11
        s.part(sell(32, 25, 19, 14, 4.5), k, shine=True)
        screen_face(s, 17, 15, 30, 20, c, big=True)
    # 변형별 머리 장식
    if variant == 'bit':
        h = {1: 6, 2: 5, 3: 4}[st]
        for sx in ((-1, 1) if st > 1 else (1,)):
            x0 = 32 + sx * (6 if st > 1 else 9)
            s.part(cap(x0, top_y + 1, x0 + sx * 4, top_y - h, 1.0), k, edge=False, tone=0)
            s.part(ell(x0 + sx * 4, top_y - h - 1, 1.8, 1.8), (k[0], c['led'], c['led'], WHITE))
        if st == 3:
            s.pxs([(30, 45), (31, 45), (32, 45), (33, 46), (34, 46), (31, 47)], c['glow'])
    elif variant == 'algo':
        for sg in (-1, 1):                       # 톱니 귀
            x = 32 + sg * {1: 13, 2: 17, 3: 19}[st]
            gear(s, x, top_y + {1: 6, 2: 7, 3: 8}[st], {1: 3, 2: 3.6, 3: 4.4}[st], c['gear'])
        if st >= 2:                              # 순서도 가슴
            y0 = 47 if st == 2 else 43
            s.pxs([(32, y0 - 2), (31, y0 - 1), (33, y0 - 1), (30, y0), (34, y0), (31, y0 + 1), (33, y0 + 1), (32, y0 + 2)], c['gear'][3])
            s.pxs([(32, y0 + 3), (32, y0 + 4)] + [(x, y0 + 5) for x in range(29, 36)], c['glow'])
        else:
            s.pxs([(31, 54), (32, 53), (33, 54), (32, 55)], c['gear'][2])
    else:                                       # deep: 뇌 돔
        r = {1: 8, 2: 11, 3: 13}[st]
        dome = {q: v for q, v in ell(32, top_y + 3, r, r * .75).items() if q[1] <= top_y + 2}
        s.part(dome, c['brain'], shine=True)
        for i in range(-2, 3):
            for yy in range(int(top_y + 3 - r * .7) + 2, top_y + 2):
                if (yy + i * 3) % 4 == 0:
                    s.px(32 + i * (r // 3), yy, c['brain'][1])
        s.pxs([(32 - r // 2, top_y - 1), (32 + r // 2, top_y - 2), (32, top_y - r // 2)], c['glow'])
    if variant == 'deep' and st == 2:
        for (x, y) in ((8, 28), (56, 28), (6, 40), (58, 40)):
            s.part(ell(x, y, 1.8, 1.8), (c['scr'][0], c['glow'], c['glow'], WHITE))
    return s


# ================================================================ 로스터 (라인 번호 → 과목, 이름, 그리기)
HANJI = hramp('6a5230', 'd8c49a', 'f0e4c4', 'fffaea')
PAPER = hramp('3a4a8a', 'c8d4f0', 'e8eeff', 'ffffff')
SHOE = hramp('4a4a6a', 'c0c4dc', 'eef0fa', 'ffffff')
BUBBLE = hramp('4a5a7a', 'c8d8ea', 'eef6ff', 'ffffff')
GOLD = ramp(.12, .72, 1.0)
APPLE = ramp(.99, .74, .92)
PINK3 = ramp(.93, .46, 1.0)
VIO16 = ramp(.76, .42, .90)


def LIGHT(rp):
    """귀 안쪽을 몸의 밝은색으로 (새 색을 쓰지 않음)."""
    return (rp[0], rp[3], rp[3], rp[3])


def T(**kw):
    return kw


ROSTER = {
    # 국어 — 분홍 물방울 몸
    1: T(subj='국어', name='문장', plan='drop', body=ramp(.95, .40, .99), acc=ramp(.90, .55, .58), m2=HANJI,
         motif=m_quote, blush=hexc('ff6f8e')),
    2: T(subj='국어', name='시조', plan='drop', body=ramp(.97, .34, .93), acc=ramp(.31, .62, .66), ears='leaf',
         eyes='sleepy', mouth='tiny', motif=m_bamboo, blush=hexc('ff7a90')),
    3: T(subj='국어', name='맞춤', plan='drop', body=PINK3, inner=LIGHT(PINK3), acc=ramp(.0, .85, .92), m2=hramp('2a1a2a', '4a3a4a', '6a5a6a', '9a8a9a'),
         ears='cat', motif=m_redpen, mouth='open'),
    4: T(subj='국어', name='고전', plan='drop', body=ramp(.955, .28, .88), acc=ramp(.06, .60, .62), m2=HANJI, ears='round',
         inner=ramp(.98, .45, .95), eyes='dot', motif=m_classic, blush=hexc('ff7f96')),
    # 수학 — 남색 네모 몸
    5: T(subj='수학', name='미분', plan='square', body=ramp(.655, .55, .86), acc=ramp(.13, .70, 1.0), m2=PAPER,
         motif=m_tangent, blush=hexc('ff9fc0')),
    6: T(subj='수학', name='적분', plan='square', body=ramp(.675, .48, .80), acc=ramp(.46, .55, .92), m2=PAPER,
         eyes='dot', motif=m_integral, blush=hexc('ff9fc0')),
    7: T(subj='수학', name='확률', plan='square', body=ramp(.635, .58, .88), acc=ramp(.0, .80, .90),
         m2=hramp('4a4a6a', 'c8ccdc', 'eef0f8', 'ffffff'), eyes='happy', mouth='open', motif=m_dice),
    8: T(subj='수학', name='기하', plan='square', body=ramp(.70, .44, .84), acc=ramp(.08, .75, 1.0),
         m2=hramp('3a3a4a', '8a8a9a', 'b8b8c6', 'e8e8f0'), ears='horn', inner=ramp(.08, .75, 1.0), mouth='cat', motif=m_geometry),
    # 영어 — 하늘색 둥근 몸
    9: T(subj='영어', name='알파', body=ramp(.52, .50, .96), acc=ramp(.0, .70, .92), m2=ramp(.14, .65, 1.0), ears='long',
         inner=ramp(.97, .40, 1.0), motif=m_blocks, mouth='open'),
    10: T(subj='영어', name='리딩', body=ramp(.50, .42, .90), acc=ramp(.63, .60, .62), m2=PAPER, ears='round',
          inner=ramp(.63, .60, .62), eyes='dot', motif=m_reading, blush=hexc('ff9fb0')),
    11: T(subj='영어', name='스피치', body=ramp(.545, .56, .98), acc=hramp('2a2a3a', '4a4a5a', '6a6a7a', '9a9aaa'), m2=BUBBLE,
          m3=ramp(.60, .10, .80), ears='antenna', inner=ramp(.95, .45, 1.0), mouth='open', motif=m_speech),
    # 과학
    12: T(subj='과학·물리', name='물리', body=ramp(.60, .55, .95), acc=APPLE, m2=(APPLE[0],) + ramp(.30, .70, .74)[1:],
          m3=ramp(.13, .55, 1.0), eyes='big', motif=m_physics, blush=APPLE[3]),
    13: T(subj='과학·화학', name='화학', custom=lambda st: line_chem(st)),
    14: T(subj='과학·생명', name='생명', custom=lambda st: line_bio(st)),
    15: T(subj='과학·지구', name='지구', custom=lambda st: line_earth(st)),
    # 사회 — 보라 몸
    16: T(subj='사회', name='시민', body=VIO16, inner=LIGHT(VIO16), acc=ramp(.0, .75, .92), m2=hramp('3a2a2a', '7a5a4a', 'a07a5a', 'c8a07a'),
          m3=GOLD, ears='cat', motif=m_ballot, blush=hexc('ff9fbe')),
    17: T(subj='사회', name='경제', body=ramp(.785, .50, .86), acc=GOLD, m3=ramp(.33, .60, .78), ears='round', eyes='happy',
          mouth='open', motif=m_economy),
    18: T(subj='사회', name='지리', body=ramp(.74, .45, .88), acc=ramp(.56, .60, .92), m2=ramp(.31, .60, .78), m3=GOLD,
          ears='fin', motif=m_geography),
    19: T(subj='사회', name='법률', body=ramp(.80, .36, .80), m2=ramp(.07, .60, .62), m3=GOLD, acc=GOLD, ears='horn',
          inner=GOLD, eyes='dot', mouth='tiny', motif=m_law, blush=hexc('ff9fbe')),
    # 외국어 (희귀)
    20: T(subj='외국어', name='중국어', custom=lambda st: line_chinese(st)),
    21: T(subj='외국어', name='일본어', custom=lambda st: line_japanese(st)),
    22: T(subj='외국어', name='독일어', plan='tri', body=ramp(.125, .62, 1.0), acc=ramp(.0, .80, .90), m2=ramp(.07, .70, .72),
          m3=hramp('3a3a4a', '7a7a8a', 'a4a4b2', 'd4d4de'), motif=m_german, rare=True, mouth='cat', blush=hexc('ff8a6a')),
    23: T(subj='외국어', name='프랑스어', body=ramp(.61, .50, .94), acc=ramp(.98, .72, .82), m2=SHOE, m3=ramp(.09, .60, .92),
          motif=m_french, rare=True, mouth='cat', blush=hexc('ff9fb0')),
    24: T(subj='외국어', name='스페인어', body=ramp(.055, .70, 1.0), acc=ramp(.14, .75, 1.0), m2=ramp(.07, .55, .78),
          m3=hramp('2a1a1a', '4a2a20', '6a4030', '8a6040'), motif=m_spanish, rare=True, mouth='open', blush=hexc('ff5a6a')),
    # 정보·AI
    25: T(subj='정보·AI', name='비트', custom=lambda st: line_info(st, 'bit')),
    26: T(subj='정보·AI', name='알고', custom=lambda st: line_info(st, 'algo')),
    27: T(subj='정보·AI', name='딥러', custom=lambda st: line_info(st, 'deep')),
    # 한국사 — 황토 서양배 몸
    28: T(subj='한국사', name='연표', plan='pear', body=ramp(.10, .55, .88), acc=ramp(.04, .60, .62), m2=HANJI, m3=GOLD,
          ears='round', inner=ramp(.04, .40, .95), motif=m_timeline, blush=hexc('ff8f8a')),
    29: T(subj='한국사', name='사관', plan='pear', body=ramp(.085, .50, .80), acc=hramp('2a1a10', '5a3a20', '7a5230', 'a07a50'),
          m2=HANJI, m3=ramp(.62, .50, .66), ears='cat', inner=ramp(.04, .40, .95), eyes='sleepy', mouth='tiny', motif=m_historian),
    30: T(subj='한국사', name='왕조', plan='pear', body=ramp(.115, .60, .92), acc=GOLD, m2=ramp(.99, .75, .78),
          m3=hramp('140f20', '241c34', '362c4c', '524670'), motif=m_dynasty, blush=hexc('ff8f8a')),
    # 음악
    31: T(subj='음악', name='음악', custom=lambda st: line_music(st)),
    # 체육 — 빨간 몸 + 운동화
    32: T(subj='체육', name='허들', body=ramp(.99, .68, .93), acc=ramp(.60, .60, .88), m2=SHOE, m3=GOLD, ears='round',
          inner=ramp(.02, .35, 1.0), motif=m_hurdle, mouth='grin', blush=hexc('ffb0a0')),
    33: T(subj='체육', name='줄넘기', body=ramp(.015, .60, .96), acc=ramp(.14, .72, 1.0), m2=SHOE, m3=ramp(.55, .60, .85),
          ears='long', inner=ramp(.02, .35, 1.0), eyes='happy', mouth='open', motif=m_rope),
    34: T(subj='체육', name='볼', body=ramp(.975, .66, .88), acc=ramp(.62, .60, .72), m2=SHOE, m3=ramp(.13, .70, 1.0),
          motif=m_ball, mouth='open', blush=hexc('ffb0a0')),
    # 전설
    35: T(subj='전설', name='교장', custom=lambda st: line_principal(st)),
    36: T(subj='전설', name='교감', custom=lambda st: line_vice(st)),
    37: T(subj='비밀', name='숨바꼭', custom=lambda st: line_secret(st)),
}
LEGENDARY = {35, 36, 37}
RARE = {20, 21, 22, 23, 24}


def merge_close(img, maxc=MAX_COLORS, limit=36):
    """색이 maxc 개를 넘으면 거의 같은 색(RGB 거리 < limit)끼리만 합친다. 그래도 넘으면 check() 가 실패한다."""
    px = img.load()
    cnt = Counter(p for p in img.get_flattened_data() if p[3])
    while len(cnt) > maxc:
        cols = list(cnt)
        d, a, b = min((math.dist(a[:3], b[:3]), a, b) for i, a in enumerate(cols) for b in cols[i + 1:])
        if d > limit:
            break
        keep, gone = (a, b) if cnt[a] >= cnt[b] else (b, a)
        if gone in (EYE, WHITE):
            keep, gone = gone, keep
        for y in range(64):
            for x in range(64):
                if px[x, y] == gone:
                    px[x, y] = keep
        cnt[keep] += cnt.pop(gone)
    return img


def draw(line, stage):
    t = ROSTER[line]
    return merge_close((t['custom'](stage) if 'custom' in t else critter(stage, t)).done())


def check(img, dex, line, stage):
    px = list(img.get_flattened_data())
    cols = {p for p in px if p[3] > 0}
    assert len(cols) <= MAX_COLORS, f'dex {dex} (line {line} stage {stage}): {len(cols)} colours (max {MAX_COLORS})'
    assert all(p[3] in (0, 255) for p in px), f'dex {dex}: semi-transparent pixels'
    x0, y0, x1, y1 = img.getbbox()
    h = y1 - y0
    lo, hi = LEGEND_HEIGHT if line in LEGENDARY else HEIGHT[stage]
    assert lo <= h <= hi, f'dex {dex} (line {line} stage {stage}): height {h} not in {lo}..{hi}'
    assert y1 - 1 >= F, f'dex {dex}: not standing on the floor (bottom y={y1 - 1})'
    return len(cols), h


def placeholder(dex):
    """도감번호 → 64x64 임시 몬스터 (없는 칸이면 None)."""
    line, stage = (dex - 1) // 3 + 1, (dex - 1) % 3 + 1
    if line not in ROSTER or (line in LEGENDARY and stage > 1):
        return None
    img = draw(line, stage)
    check(img, dex, line, stage)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--count', type=int, default=111)
    ap.add_argument('-v', '--verbose', action='store_true', help='스프라이트별 색 수/키 출력')
    a = ap.parse_args()
    rows = (a.count + COLS - 1) // COLS
    atlas = Image.new('RGBA', (COLS * 64, rows * 64), (0, 0, 0, 0))
    real = drawn = 0
    for dex in range(1, a.count + 1):
        line_, stage_ = (dex - 1) // 3 + 1, (dex - 1) % 3 + 1
        p = os.path.join(ROOT, 'art', 'sprites', f'{line_}-{stage_}.png')        # e.g. 36-1.png = 교감몽
        if os.path.exists(p):
            spr = Image.open(p).convert('RGBA')
            assert spr.size == (64, 64), f'{p} must be 64x64 (got {spr.size})'
            real += 1
        else:
            spr = placeholder(dex)
            if spr is None:
                continue
            drawn += 1
            if a.verbose:
                line, stage = (dex - 1) // 3 + 1, (dex - 1) % 3 + 1
                n, h = check(spr, dex, line, stage)
                print(f'  dex {dex:3d}  #{line:2d} {ROSTER[line]["name"]} {stage}단계: {n:2d} colours, {h} px tall')
        i = dex - 1
        atlas.paste(spr, ((i % COLS) * 64, (i // COLS) * 64))
    out = os.path.join(ROOT, 'web', 'sprites', 'atlas.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    atlas.save(out, optimize=True)
    print(f'{out}: {real} real + {drawn} placeholder sprites, {os.path.getsize(out)} bytes')


if __name__ == '__main__':
    main()
