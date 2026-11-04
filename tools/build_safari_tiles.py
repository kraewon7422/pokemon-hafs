"""사파리존 도트 그림판: 16px 타일 web/img/safari-tiles.png (+ 위치표 web/img/safari-tiles.js) 과
주인공 (교복) 그림판 web/img/safari-hero.png. 3세대 (루비·사파이어·에메랄드) 느낌으로 새로 그린 그림 (원본 타일을 베끼지 않음).
사용: python tools/build_safari_tiles.py [--preview]   (--preview = .work/safari-*-8x.png 확대 그림도 만듦)

타일 이름 (위치표 키 → [x, y, w, h]):
  ground                       민트 풀밭 (대각선 점무늬)
  sand<0-15>  sandc<ne|nw|se|sw>  모래길 (숫자 = 이웃도 모래인 쪽 N1 E2 S4 W8) · 안쪽 모서리 덧그림
  water<0-1>  shore<0-15>  shorec<..>   연못 물 (2장 반짝임) · 바위 물가 덧그림 (숫자 = 이웃도 물인 쪽)
  fence<0-15>                  흰·회색 말뚝 울타리 (숫자 = 이웃도 울타리인 쪽)
  tall                         키 큰 풀숲 (투명 바탕 → 주인공 다리 위에 아랫부분만 다시 그림)
  flowerA<0-1> flowerB<0-1>    꽃 (노랑+파랑 / 분홍+하양, 2장 흔들림)
  rock sign post bridge        바위 · 표지판 · 입구 기둥 · 나무 다리
  tree                         나무 16×24 (칸 위로 8px 솟음)
주인공: 16×24 칸, 줄 = 아래·위·왼쪽·오른쪽, 칸 = 서기·걸음1·걸음2.
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TS = 16


def hx(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)


# ─────────── 팔레트 (참고 그림에서 잰 3세대 색) ───────────
C = {k: hx(v) for k, v in dict(
    g0='#8cd6b8', g1='#5cc49c', g2='#3aa874', gL='#b8ecd0',            # 풀밭
    s0='#e8dc9c', s1='#f4ecbc', s2='#d8c88c', sE='#d8b064', sK='#c09850',  # 모래
    k='#426311', t='#38ae68', n='#68d0a0', L='#b0ecd0',                # 풀숲
    T0='#5c9a2c', T1='#8cc850', T2='#b8e47c', T3='#d8f4a0', TK='#3c5a10', Tp='#6c5a62', TP='#8c7a80',  # 나무
    f0='#f8f8f8', f1='#c0c0c8', f2='#9c9ca4', f3='#5c6484', f4='#80809a',  # 울타리
    w0='#88c8f0', w1='#5c90d0', w2='#3c68b0', wL='#d0f0ff',            # 물
    r0='#9c6c64', r1='#c09088', r2='#6c4440', r3='#dcb8a8',            # 물가 바위
    pk='#f088b0', pK='#d05888', ye='#f8d868', yE='#d8a840', bl='#98b0f0', bL='#6880d0',
    wh='#f8f8f8', wH='#c8d0e0', fc='#f8f080', st='#426311', lf='#58a838', lL='#98d860',  # 꽃
    m0='#a8a8b0', m1='#d8d8e0', m2='#707088', m3='#e8f0f8', mK='#384060', mr='#d84858', mR='#f8c8d0',  # 바위·표지판
    b0='#c88c50', b1='#e8b478', b2='#8c5830', bK='#5c3820',            # 다리
).items()}
CLEAR = (0, 0, 0, 0)


class Tile:
    def __init__(self, w=TS, h=TS, base=None):
        self.im = Image.new('RGBA', (w, h), C[base] if base else CLEAR)
        self.w, self.h = w, h

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.im.putpixel((x, y), C[c] if isinstance(c, str) else c)

    def get(self, x, y):
        return self.im.getpixel((x, y))

    def art(self, rows, pal, ox=0, oy=0):
        for y, r in enumerate(rows):
            for x, ch in enumerate(r):
                if ch in pal and pal[ch]:
                    self.px(ox + x, oy + y, pal[ch])


# ─────────── 풀밭: 대각선 점무늬 (16px 반복) ───────────
def ground():
    t = Tile(base='g0')
    # 오른쪽 위 → 왼쪽 아래로 흐르는 점 줄 (3세대 풀밭처럼 촘촘하지 않게)
    for y in range(16):
        for x in range(16):
            d = (x + y) % 8
            if d == 0 and (y % 4 == 1):
                t.px(x, y, 'g1')
            elif d == 0 and (y % 4 == 3):
                t.px(x, y, 'g2')
            elif d == 4 and (y % 4 == 0):
                t.px(x, y, 'gL')
    for (x, y) in [(3, 6), (11, 14), (13, 3), (6, 11)]:
        t.px(x, y, 'g2')
    return t


# ─────────── 모래길 / 물가: 열린 쪽(이웃이 다른 땅)으로 가장자리 ───────────
def edge_dist(x, y, mask, r=4):
    """mask 비트 = 이웃도 같은 땅. 열린 쪽 경계까지 거리 (모서리는 둥글게)."""
    N, E, S, W = not mask & 1, not mask & 2, not mask & 4, not mask & 8
    ds = []
    if N: ds.append(y)
    if S: ds.append(15 - y)
    if W: ds.append(x)
    if E: ds.append(15 - x)
    d = min(ds) if ds else 99
    for (a, b, cx, cy) in [(N, W, r, r), (N, E, 15 - r, r), (S, W, r, 15 - r), (S, E, 15 - r, 15 - r)]:
        if a and b:
            inx = x < r if cx == r else x > 15 - r
            iny = y < r if cy == r else y > 15 - r
            if inx and iny:
                d = min(d, r - ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5)
    return d


def sand_interior(t):
    for y in range(16):
        for x in range(16):
            t.px(x, y, 's0')
    # 작은 꽃잎 같은 모래 반점 (밝은 3점 + 어두운 1점) — 참고 그림처럼 듬성듬성
    for (x, y) in [(2, 3), (10, 1), (6, 9), (13, 11), (1, 13)]:
        t.px(x, y, 's1'); t.px(x + 1, y, 's1'); t.px(x, y + 1, 's1'); t.px(x + 1, y + 1, 's2')
    for (x, y) in [(8, 5), (4, 6), (12, 7), (9, 14)]:
        t.px(x, y, 's2')


def sand(mask):
    t = Tile()
    sand_interior(t)
    g = ground()
    for y in range(16):
        for x in range(16):
            d = edge_dist(x, y, mask, 3)
            if d < 0.5:      # 바깥 줄: 풀밭 + 듬성 모래 알갱이 (부드러운 가장자리)
                t.px(x, y, g.get(x, y) if (x + y) % 2 else C['sE'])
            elif d < 1.5:    # 그 안: 주황빛 가장자리 점
                t.px(x, y, 'sE' if (x + y) % 2 == 0 else 'sK' if (x * 3 + y) % 5 == 0 else 's0')
    return t


def corner_overlay(kind, corner):
    """안쪽 모서리: 두 옆 이웃은 같은 땅인데 대각선만 다른 땅일 때 귀퉁이."""
    t = Tile()
    g = ground()
    R = 3 if kind == 'sand' else 8
    for y in range(R):
        for x in range(R):
            d = R - 1 - ((x ** 2 + y ** 2) ** 0.5)     # 귀퉁이 점까지 거리를 둥글게
            X = x if 'w' in corner else 15 - x
            Y = y if 'n' in corner else 15 - y
            if kind == 'sand':
                if x + y <= 1:
                    t.px(X, Y, g.get(X, Y) if (X + Y) % 2 else C['sE'])
                elif x + y == 2:
                    t.px(X, Y, 'sE')
            else:
                r = (x ** 2 + y ** 2) ** 0.5
                if r < 0.8:
                    t.px(X, Y, 'r2')
                elif r < 4.6:
                    v = (X * 7 + Y * 13) % 11
                    t.px(X, Y, 'r3' if v == 0 else 'r1' if v < 4 else 'r0' if v < 9 else 'r2')
                elif r < 5.6:
                    t.px(X, Y, 'w2')
                elif r < 7.6:
                    t.px(X, Y, 'w1')
    return t


def water(f):
    t = Tile(base='w0')
    o = 4 * f
    for (x, y) in [(2, 3), (9, 7), (4, 12), (12, 14)]:
        xx = (x + o) % 14
        t.px(xx, y, 'wL'); t.px(xx + 1, y, 'wL'); t.px(xx + 2, y, 'w0'); t.px(xx + 1, y + 1, 'w1')
    return t


def shore(mask):
    """물 칸 위 덧그림: 열린 쪽에 바위 물가 (얼룩덜룩 갈색 4점 + 진한 파랑 2점). 안쪽은 투명."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            d = edge_dist(x, y, mask, 5)
            if d < 0.5:
                t.px(x, y, 'r2' if (x + y) % 3 else 'r0')
            elif d < 4.5:
                v = (x * 7 + y * 13 + (x // 2) * (y // 2) * 3) % 11
                t.px(x, y, 'r3' if v == 0 else 'r1' if v < 4 else 'r0' if v < 9 else 'r2')
            elif d < 5.5:
                t.px(x, y, 'r2' if (x + y) % 2 else 'w2')
            elif d < 7.5:
                t.px(x, y, 'w1')
    return t


# ─────────── 울타리 ───────────
def fence(mask):
    t = Tile()
    N, E, S, W = mask & 1, mask & 2, mask & 4, mask & 8
    horiz = E or W
    vert = N or S
    if vert:      # 세로 줄: 옆에서 본 말뚝 줄 (회색 기둥 + 오른쪽 그림자 + 8px 마다 흰 머리)
        y0 = 0 if N else 6
        y1 = 15 if S else (9 if horiz else 13)
        for y in range(y0, y1 + 1):
            t.px(6, y, 'f1'); t.px(7, y, 'f2'); t.px(8, y, 'f2'); t.px(9, y, 'f3')
        for cy in (0, 8):
            if y0 <= cy <= y1:
                t.px(6, cy, 'f0'); t.px(7, cy, 'f0'); t.px(8, cy, 'f0'); t.px(7, cy + 1, 'f0'); t.px(6, cy + 1, 'f0')
        if not S:
            t.px(6, y1 + 1, 'f3'); t.px(7, y1 + 1, 'f3'); t.px(8, y1 + 1, 'f3'); t.px(9, y1 + 1, 'f3')
    if horiz or not vert:   # 가로: 가로대 2줄 + 8px 마다 말뚝
        x0 = 0 if W else 5
        x1 = 15 if E else 10
        for x in range(x0, x1 + 1):
            t.px(x, 5, 'f0'); t.px(x, 6, 'f1'); t.px(x, 7, 'f2')
            t.px(x, 9, 'f0'); t.px(x, 10, 'f2')
            t.px(x, 11, 'f3')
        posts = [p for p in (1, 9) if x0 <= p and p + 2 <= x1] or [6]
        if not vert:
            posts = [p for p in posts]
        for p in posts:
            for y in range(2, 12):
                t.px(p, y, 'f1'); t.px(p + 1, y, 'f2'); t.px(p + 2, y, 'f2')
            t.px(p, 2, 'f0'); t.px(p + 1, 2, 'f0'); t.px(p + 2, 2, 'f0'); t.px(p, 3, 'f0'); t.px(p + 1, 3, 'f0')
            t.px(p + 3, 3, 'f3'); t.px(p + 3, 4, 'f3')
            for x in range(p, p + 4):
                t.px(x, 12, 'f3')
        if vert:   # 꺾이는 곳: 세로 기둥 머리를 위에 다시
            for y in range(2, 12):
                t.px(6, y, 'f1'); t.px(7, y, 'f2'); t.px(8, y, 'f2'); t.px(9, y, 'f3')
            for (x, y) in [(6, 2), (7, 2), (8, 2), (6, 3), (7, 3)]:
                t.px(x, y, 'f0')
            if not S:
                for x in range(6, 10):
                    t.px(x, 12, 'f3')
    return t


# ─────────── 손으로 찍은 그림들 ───────────
TALL = [  # 두 포기 (윗줄 · 아랫줄 엇갈림) — 진한 올리브 테두리, 청록 잎, 밝은 잎맥
    '................',
    '...kL..L.k......',
    '..nLLk.kLLn..L..',
    '..tnLLkLLnt.nLk.',
    '...ktnLnntk.tnLk',
    '..L.kttntk..ktnk',
    '.nLk.kttk.kLn.kt',
    '.tnLLkttkLLnt.k.',
    '..ktnLkkLnttk...',
    '...kttnkntk...L.',
    '.k..kknkkk..knLk',
    'kLn..kttk..kLnLk',
    'knLLkttttkLLnLk.',
    '.ktnLnttnLntnk..',
    '..kkttkkkttkk...',
    '....kk...kk.....',
]
TALL_PAL = {'k': 'k', 't': 't', 'n': 'n', 'L': 'L'}

TREE = [  # 16×24: 위 8줄은 윗칸으로 솟음. 3세대처럼 층층이 뾰족한 둥근 나무
    '.......kk.......',
    '......kT2k......',
    '.....kT23Tk.....',
    '....kkT33TkK....',
    '...kT1T22T1Tk...',
    '..kT12T33T21Tk..',
    '..kTT1T23T1TTk..',
    '.kTkT1T22T1TkTk.',
    '.kT2kTT11TTk2Tk.',
    'kT123TkTTkT321Tk',
    'kT1233T11T3321Tk',
    'kTT122T22T221TTk',
    '.kTkT1T33T1TkTk.',
    'kT2kTTT22TTTk2Tk',
    'kT13TkTTTTkT31Tk',
    'kT1233T11T3321Tk',
    'kTT122TTTT221TTk',
    '.kTT11T22T11TTk.',
    'kkTTkT1TT1TkTTkk',
    'kkkTTkkTTkkTTkkk',
    '.kkkkpPkkPpkkkk.',
    '.kkkpPPkkPPpkkk.',
    '..kkkkpPPpkkkk..',
    '....kkkkkkkk....',
]
TREE_PAL = {'k': 'TK', 'K': 'TK', 'T': 'T0', '1': 'T1', '2': 'T2', '3': 'T3', 'p': 'Tp', 'P': 'TP'}

FLOWER = [  # 두 송이 (왼쪽 위 a, 오른쪽 아래 b), 줄기·잎
    '..aa.aa.........',
    '.aAAaAAa........',
    '.aAAcAAabb.bb...',
    '..aaccaBBbBBb...',
    '.aAAaAABBBcBBb..',
    '.aAAaAbBBBccBb..',
    '..aa.aBBbBBBBb..',
    '....s.bBBbBBb...',
    '....s..bb.bb....',
    '.....s..s.......',
    '..ll.s.ls.......',
    '.lLLls.lsLl.....',
    '..lLLsslLLl.....',
    '...llsslll......',
    '...gggggggg.....',
    '................',
]


def flower(which, f):
    t = Tile()
    if which == 'A':
        pal = {'a': 'yE', 'A': 'ye', 'c': 'fc', 'b': 'bL', 'B': 'bl'}
    else:
        pal = {'a': 'pK', 'A': 'pk', 'c': 'fc', 'b': 'wH', 'B': 'wh'}
    pal.update({'s': 'st', 'l': 'lf', 'L': 'lL', 'g': 'g2'})
    rows = FLOWER
    if f:   # 2장째: 꽃 머리가 바람에 1px 기울어짐
        rows = [(r[1:] + '.') if i < 9 else r for i, r in enumerate(FLOWER)]
    t.art(rows, pal, 2, 1)
    return t


ROCK = [
    '................',
    '................',
    '.....kkkkk......',
    '...kk11122kk....',
    '..k1133112222k..',
    '..k13311122222k.',
    '.k113111222222k.',
    '.k111112222223k.',
    '.k11112222223kk.',
    '.k2111222222kkk.',
    '.kk22222223kk3k.',
    '..kk222233kkkk..',
    '...kkkkkkkkkk...',
    '....gggggggg....',
    '................',
    '................',
]
ROCK_PAL = {'k': 'mK', '1': 'm1', '2': 'm0', '3': 'm2', 'g': 'g2'}

SIGN = [
    '................',
    '..kkkkkkkkkkkk..',
    '..k3333333333k..',
    '..k3111111113k..',
    '..k31r1rr1r13k..',
    '..k31rrrrrr13k..',
    '..k3111111113k..',
    '..k31RRRRRR13k..',
    '..k31rrrrrr13k..',
    '..k3111111113k..',
    '..k3333333333k..',
    '..kkkkkkkkkkkk..',
    '..k22222222222k.',
    '..k2k......k2k..',
    '..kkg......kkg..',
    '................',
]
SIGN_PAL = {'k': 'mK', '3': 'm3', '1': 'wh', 'r': 'mr', 'R': 'mR', '2': 'm2', 'g': 'g2'}

POST = [
    '.....kkkkkk.....',
    '....k000000k....',
    '....k011111k....',
    '....k011112k....',
    '....kkkkkkkk....',
    '....k111122k....',
    '....k111122k....',
    '....k111122k....',
    '....k111122k....',
    '....k111122k....',
    '....k111122k....',
    '....k111122k....',
    '....k222222k....',
    '....kkkkkkkk....',
    '....gggggggg....',
    '................',
]
POST_PAL = {'k': 'mK', '0': 'm3', '1': 'm1', '2': 'm0', 'g': 'g2'}


def bridge():
    """가로 나무 다리: 세로 널빤지 (4px) · 위아래 난간 그림자."""
    t = Tile()
    for x in range(16):
        t.px(x, 0, 'bK'); t.px(x, 1, 'b2'); t.px(x, 2, 'b1')
        for y in range(3, 13):
            k = x % 4
            t.px(x, y, 'b1' if k == 0 else 'b0' if k < 3 else 'b2')
        t.px(x, 13, 'b2'); t.px(x, 14, 'bK'); t.px(x, 15, 'w2')
    for (x, y) in [(2, 5), (6, 10), (10, 6), (14, 9)]:
        t.px(x, y, 'b2')
    return t


# ─────────── 주인공: HAFS 교복 (남색 재킷 + 금색 테두리) ───────────
HP = {
    'k': '#181820', 'N': '#3c4c8c', 'n': '#28325e', 'Y': '#f0c850', 'y': '#b88a28',
    'h': '#4a3028', 'H': '#6e4a38', 's': '#f8d0a8', 'S': '#d89868',
    'w': '#f8f8f8', 'W': '#c0c8d8', 'B': '#3a4672', 'b': '#262c4c', 'd': '#181c34',
    'P': '#2c3658', 'p': '#1c2240', 'o': '#f0f0f0', 'O': '#9098a8', 'T': '#1c2448', 't': '#f0c850',
}
DARK = {'B': 'b', 'N': 'n', 'P': 'p', 'Y': 'y', 's': 'S', 'b': 'd', 'o': 'O'}

FRONT_HALF = [  # 왼쪽 절반 7칸 → 거울 (오른쪽은 그늘색). 모자 0-4 · 얼굴 5-10 · 교복 11-15 · 다리 16-19
    '....kkk',
    '..kkNNN',
    '.kNNNNN',
    'kNNNNNY',
    'kYYYYYY',
    'khnnnnn',
    'khsssss',
    'khsskss',
    'kSsskss',
    '.kSssss',
    '..kkSSS',
    '.kBBYwT',
    'kBBBBYt',
    'kYBBBBY',
    'ksBBBBB',
    '.kyYYYY',
    '..kPPPk',
    '..kPPPk',
    '..kPPPk',
    '..kooOk',
]
BACK_HALF = [
    '....kkk',
    '..kkNNN',
    '.kNNNNN',
    'kNNNNNN',
    'kYYYYYY',
    'khhhhhh',
    'khHhhhh',
    'khHHhhh',
    'khhhhhh',
    '.khhhhh',
    '..kkhhh',
    '.kBBBBB',
    'kBBBBBB',
    'kYBBBBB',
    'ksBBBBB',
    '.kyYYYY',
    '..kPPPk',
    '..kPPPk',
    '..kPPPk',
    '..kooOk',
]
SIDE = [  # 왼쪽을 봄, 14칸
    '.....kkkk.....',
    '...kkNNNNk....',
    '..kNNNNNNNk...',
    '..kNNNNNNNnk..',
    '..kYYYYYYYyk..',
    'knnnnnhhhhhk..',
    '.kksssshhhhk..',
    '..kskssSHhhk..',
    '..kskssShhk...',
    '...kSssSSk....',
    '....kkSSk.....',
    '...kwYBBBk....',
    '...kTYBBbk....',
    '...kBBBBbk....',
    '...kBYBBbk....',
    '...kBsBbbk....',
    '...kyYYYyk....',
    '....kPPpk.....',
    '....kPPpk.....',
    '....kooOk.....',
]
SIDE_STEP1 = SIDE[:17] + [
    '...kPPkPpk....',
    '..kPPk.kppk...',
    '..kook..kOk...',
]
SIDE_STEP2 = SIDE[:13] + [
    '...kBBBBbk....',
    '...kBBYBbk....',
    '...kBBsbbk....',
    '...kyYYYyk....',
    '....kPPpk.....',
    '....kPpk......',
    '....kooOk.....',
]


def mirror(half):
    out = []
    for r in half:
        right = ''.join(DARK.get(c, c) for c in reversed(r))
        out.append(r + right)
    return out


def step_front(rows, left):
    """앞·뒤 걷기: 한쪽 다리가 한 칸 올라감 (몸은 그대로)."""
    rs = [list(r) for r in rows]
    cols = range(0, 7) if not left else range(7, 14)
    # 들린 다리: 신발 줄을 한 칸 위로, 맨 아래 비움
    for x in cols:
        rs[18][x] = rs[19][x]
        rs[19][x] = '.'
    # 팔 흔들기: 반대쪽 손이 한 칸 내려감
    hand = 1 if left else 12
    rs[15][hand] = 's' if left else 'S'
    return [''.join(r) for r in rs]


def hero_sheet():
    front = mirror(FRONT_HALF)
    back = mirror(BACK_HALF)
    dirs = [
        [front, step_front(front, True), step_front(front, False)],
        [back, step_front(back, True), step_front(back, False)],
        [SIDE, SIDE_STEP1, SIDE_STEP2],
    ]
    dirs.append([[r[::-1] for r in fr] for fr in dirs[2]])
    im = Image.new('RGBA', (16 * 3, 24 * 4), CLEAR)
    for j, frames in enumerate(dirs):
        for i, rows in enumerate(frames):
            # 바닥 그림자는 safari.js 가 그림. 14칸 그림을 16칸 가운데 (x+1), 아래 붙임 (y+4)
            for y, r in enumerate(rows):
                for x, ch in enumerate(r):
                    if ch in HP:
                        im.putpixel((i * 16 + 1 + x, j * 24 + 4 + y), hx(HP[ch]))
    return im


# ─────────── 모으기 ───────────
def build():
    tiles = [('ground', ground())]
    for m in range(16):
        tiles.append((f'sand{m}', sand(m)))
    for c in ('ne', 'nw', 'se', 'sw'):
        tiles.append((f'sandc{c}', corner_overlay('sand', c)))
    for f in range(2):
        tiles.append((f'water{f}', water(f)))
    for m in range(16):
        tiles.append((f'shore{m}', shore(m)))
    for c in ('ne', 'nw', 'se', 'sw'):
        tiles.append((f'shorec{c}', corner_overlay('shore', c)))
    for m in range(16):
        tiles.append((f'fence{m}', fence(m)))
    t = Tile(); t.art(TALL, TALL_PAL); tiles.append(('tall', t))
    for w in 'AB':
        for f in range(2):
            tiles.append((f'flower{w}{f}', flower(w, f)))
    for name, rows, pal in [('rock', ROCK, ROCK_PAL), ('sign', SIGN, SIGN_PAL), ('post', POST, POST_PAL)]:
        t = Tile(); t.art(rows, pal); tiles.append((name, t))
    tiles.append(('bridge', bridge()))
    tree = Tile(16, 24); tree.art(TREE, TREE_PAL)

    cols = 16
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * TS, rows * TS + 32), CLEAR)
    idx = {}
    for i, (name, t) in enumerate(tiles):
        x, y = (i % cols) * TS, (i // cols) * TS
        sheet.paste(t.im, (x, y))
        idx[name] = [x, y, TS, TS]
    sheet.paste(tree.im, (0, rows * TS))
    idx['tree'] = [0, rows * TS, 16, 24]
    return sheet, idx


def main():
    sheet, idx = build()
    hero = hero_sheet()
    img = os.path.join(ROOT, 'web', 'img')
    sheet.save(os.path.join(img, 'safari-tiles.png'), optimize=True)
    hero.save(os.path.join(img, 'safari-hero.png'), optimize=True)
    with open(os.path.join(img, 'safari-tiles.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('// tools/build_safari_tiles.py 가 만듦 — 고치지 말 것. 타일 이름 → [x, y, w, h] (web/img/safari-tiles.png)\n')
        f.write('export default ' + json.dumps(idx, separators=(',', ':')) + ';\n')
    print('safari-tiles.png', sheet.size, len(idx), 'tiles · safari-hero.png', hero.size)
    if '--preview' in sys.argv:
        wk = os.path.join(ROOT, '.work'); os.makedirs(wk, exist_ok=True)
        bg = Image.new('RGBA', sheet.size, (255, 0, 255, 255)); bg.alpha_composite(sheet)
        bg.resize((sheet.width * 8, sheet.height * 8), Image.NEAREST).save(os.path.join(wk, 'safari-tiles-8x.png'))
        bg = Image.new('RGBA', hero.size, C['g0']); bg.alpha_composite(hero)
        bg.resize((hero.width * 8, hero.height * 8), Image.NEAREST).save(os.path.join(wk, 'safari-hero-8x.png'))


if __name__ == '__main__':
    main()
