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
  cfloor<0-1>                  동굴 바닥 (2가지 반점)
  cwall<0-15>  mwall<0-15>     동굴 바위벽 · 바깥 산 바위 (숫자 = 이웃도 벽인 쪽, 아래가 열리면 벽면)
  crock cboulder chole         동굴 작은 바위 · 큰 바위 · 떨어지는 구멍
  cladderD cladderU cexit      내려가는/올라가는 사다리 · 밖으로 나가는 밝은 칸
  cbraille mouth               벽면 점자 (덧그림) · 바깥 바위벽 동굴 입구 (덧그림)
  uvoid<0-1> uplat<0-15>       울트라 스페이스 빈 우주 (별 반짝 2장) · 떠 있는 발판 (숫자 = 이웃도 발판)
  upath ucrystalA ucrystalB    밝은 빛의 길 (덧그림) · 빛나는 수정 (청록 / 분홍)
  worm<0-3>                    울트라 워프홀 소용돌이 32×32 (4장 돌기)
주인공 safari-hero.png · 사육사 safari-keeper.png: 16×24 칸, 줄 = 아래·위·왼쪽·오른쪽, 칸 = 서기·걸음1·걸음2.
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
    k='#426311', t='#3c9c48', n='#5cbc6c', L='#a8e4a8',                # 풀숲
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
    # 참고 그림처럼 왼쪽 위 → 오른쪽 아래로 가는 가는 대각선 줄 (진한 점 · 중간 점 · 빈칸 두 개 반복) + 듬성한 밝은 점
    for y in range(16):
        for x in range(16):
            if (x - y) % 8 == 0:
                k = ((x + y) // 2) % 4
                if k == 0:
                    t.px(x, y, 'g2')
                elif k == 1:
                    t.px(x, y, 'g1')
            elif (x - y) % 8 == 4 and (x + y) % 4 == 0:
                t.px(x, y, 'gL')
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
TALL = [  # 둥근 잎 네 장이 X 모양으로 겹친 포기 (진한 테두리 · 중간 초록 · 밝은 잎) — 이어 붙이면 빽빽한 풀숲
    '.kk..........kk.',
    'kLLk...kk...kLLk',
    'knLnk.kLLk.knLnk',
    'ktnnLkLnnLkLnntk',
    '.kttnkntnnknttk.',
    '..kktkttntktkk..',
    '.kLLkktnnkkLLk..',
    'kLnnLktkktLnnLk.',
    'kntnnLkLLkLnntnk',
    'ktttnkLnnLkntttk',
    '.kkttktnntkttkk.',
    '.kLkktttttkkLk..',
    'kLnLkkkttkkLnLk.',
    'kntnnLk..kLnntnk',
    '.ktttk....ktttk.',
    '..kkk......kkk..',
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


# ─────────── 동굴 (3세대 동굴 느낌: 갈색 바위벽 · 벽 윗면 · 바닥 · 바위 · 사다리 · 구멍 · 점자) ───────────
# 벽 이름 cwall<0-15> (동굴) · mwall<0-15> (바깥 산 바위, 동굴 입구 둘레) — 숫자 = 이웃도 벽인 쪽 (N1 E2 S4 W8).
# 아래(S)가 벽이 아니면 '벽면' (앞에서 본 바위 줄무늬), 아니면 '윗면' (위에서 본 거친 바위 + 열린 쪽 테두리).
CAVE = {
    'c': dict(top0='#5c4838', top1='#4a3a2c', top2='#6e5846', rim0='#d8c0a0', rim1='#a08468',
              face0='#8c6c54', face1='#a8866a', face2='#6c5040', face3='#40301f'),
    'm': dict(top0='#9c8c74', top1='#887860', top2='#b4a488', rim0='#ece0c4', rim1='#b8a88c',
              face0='#a08c74', face1='#c0ac90', face2='#7c6c58', face3='#4c4034'),
}
CF = dict(f0='#c4a47e', f1='#ac8c68', f2='#d8bc96', f3='#94785a')


def cfloor(v):
    t = Tile()
    for y in range(16):
        for x in range(16):
            t.px(x, y, hx(CF['f0']))
    pts = [(2, 3), (9, 1), (13, 6), (5, 9), (11, 12), (1, 13), (7, 14)] if v == 0 else [(4, 2), (12, 3), (8, 7), (2, 10), (14, 11), (6, 13)]
    for (x, y) in pts:
        t.px(x, y, hx(CF['f1'])); t.px(x + 1, y, hx(CF['f2']))
    for (x, y) in ([(10, 9), (3, 6)] if v == 0 else [(10, 14), (13, 8)]):
        t.px(x, y, hx(CF['f3'])); t.px(x + 1, y, hx(CF['f1'])); t.px(x, y + 1, hx(CF['f1']))
    return t


def wall(kind, mask):
    P = {k: hx(v) for k, v in CAVE[kind].items()}
    t = Tile()
    N, E, S, W = mask & 1, mask & 2, mask & 4, mask & 8
    def top_px(x, y):
        v = (x * 5 + y * 11 + (x * y) % 7) % 13
        return P['top1'] if v < 3 else P['top2'] if v == 12 else P['top0']
    if S:   # 윗면
        for y in range(16):
            for x in range(16):
                t.px(x, y, top_px(x, y))
        if not N:
            for x in range(16):
                t.px(x, 0, P['face3']); t.px(x, 1, P['rim1'])
        if not W:
            for y in range(16):
                t.px(0, y, P['rim0']); t.px(1, y, P['rim1'])
        if not E:
            for y in range(16):
                t.px(15, y, P['face3']); t.px(14, y, P['rim1'])
        return t
    # 벽면: 위쪽 lip + 바위 줄무늬 + 바닥과 만나는 그림자
    y0 = 0
    if N:
        for y in range(3):
            for x in range(16):
                t.px(x, y, top_px(x, y))
        y0 = 3
    for x in range(16):
        t.px(x, y0, P['rim0']); t.px(x, y0 + 1, P['rim1'])
    for y in range(y0 + 2, 16):
        for x in range(16):
            band = (y - y0 + (x // 4) % 2) % 5
            c = P['face1'] if band == 0 else P['face2'] if band == 3 else P['face0']
            if band == 3 and (x * 7 + y) % 6 == 0:
                c = P['face3']
            t.px(x, y, c)
    for x in range(16):
        t.px(x, 15, P['face3'])
    if not W:
        for y in range(y0, 16):
            t.px(0, y, P['face3']); t.px(1, y, P['face2'])
    if not E:
        for y in range(y0, 16):
            t.px(15, y, P['face3']); t.px(14, y, P['face2'])
    return t


CROCK = [
    '................',
    '................',
    '................',
    '.....kkkkk......',
    '...kk11122k.....',
    '..k1133112kk....',
    '..k131112222k...',
    '.k11112222223k..',
    '.k21122222233k..',
    '.kk2222222333k..',
    '..kk22223333kk..',
    '...kkkkkkkkkk...',
    '....gggggggg....',
    '................',
    '................',
    '................',
]
CBOULDER = [
    '....kkkkkkk.....',
    '..kk1111122kk...',
    '.k11331112222k..',
    '.k13311122222k..',
    'k1131112222222k.',
    'k1111122222223k.',
    'k1111222222223k.',
    'k2111222222233k.',
    'k2212222222333k.',
    'k2222222223333k.',
    '.k22222233333k..',
    '.kk222333333kk..',
    '..kkk33333kkk...',
    '....kkkkkkk.....',
    '...gggggggggg...',
    '................',
]
CROCK_PAL = {'k': '#3c2c20', '1': '#c8a888', '2': '#9c7c60', '3': '#6c5040', 'g': '#94785a'}


def hole():
    t = cfloor(0)
    for y in range(16):
        for x in range(16):
            r = ((x - 7.5) / 6.5) ** 2 + ((y - 8) / 5.5) ** 2
            if r < 0.62:
                t.px(x, y, hx('#140c08'))
            elif r < 0.85:
                t.px(x, y, hx('#3c2c20'))
            elif r < 1.05:
                t.px(x, y, hx('#6c5040') if y < 8 else hx(CF['f2']))
    return t


def ladder(down):
    t = cfloor(1)
    W0, W1, WK = hx('#e8b478'), hx('#c88c50'), hx('#5c3820')
    if down:     # 바닥 구멍 + 아래로 내려가는 사다리
        for y in range(2, 15):
            for x in range(2, 14):
                edge = x in (2, 13) or y in (2, 14)
                t.px(x, y, hx('#3c2c20') if edge else hx('#140c08'))
        top, bot = 1, 13
    else:        # 위로 올라가는 사다리 (바닥에 세운 것)
        top, bot = 0, 15
    for y in range(top, bot + 1):
        for x in (4, 11):
            t.px(x - 1, y, WK); t.px(x, y, W0); t.px(x + 1, y, W1); t.px(x + 2, y, WK)
    for y in range(top + 2, bot, 3):
        for x in range(5, 11):
            t.px(x, y, W0); t.px(x, y + 1, WK)
    return t


def exit_mat():
    """동굴 밖으로 나가는 칸: 바닥에 바깥 햇빛이 비친 자리 (위아래 어디에 있어도 됨)."""
    t = cfloor(0)
    for y in range(16):
        for x in range(16):
            d = abs(x - 7.5) / 8 + abs(y - 7.5) / 10
            if d < 0.55:
                t.px(x, y, hx('#fff4d8') if (x + y) % 2 else hx('#f8e4b8'))
            elif d < 0.85:
                t.px(x, y, hx('#ecd4a8') if (x + y) % 2 else hx(CF['f2']))
    return t


def braille():
    """벽면에 새긴 점자 (덧그림): 점 6개 칸 3개."""
    t = Tile()
    dots = ['101', '011', '110']
    for i, pat in enumerate(dots):
        ox = 2 + i * 4
        for j, c in enumerate(pat + pat[::-1]):
            if c == '1':
                x, y = ox + (j // 3) * 2, 6 + (j % 3) * 2
                t.px(x, y, hx('#f0dcbc')); t.px(x + 1, y + 1, hx('#40301f'))
    return t


def mouth():
    """바깥 바위벽의 동굴 입구 (덧그림): 둥근 검은 입구 + 안쪽 그늘."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            dx = abs(x - 7.5)
            if y >= 3 and (y > 7 or ((dx / 6) ** 2 + ((7 - y) / 4.5) ** 2) < 1):
                if dx < 6.5:
                    t.px(x, y, hx('#100a06') if dx < 5 else hx('#3c3024'))
    return t


def cave_tiles():
    out = [('cfloor0', cfloor(0)), ('cfloor1', cfloor(1))]
    for kind in 'cm':
        for m in range(16):
            out.append((f'{kind}wall{m}', wall(kind, m)))
    for name, rows in (('crock', CROCK), ('cboulder', CBOULDER)):
        t = Tile(); t.art(rows, {k: hx(v) for k, v in CROCK_PAL.items()}); out.append((name, t))
    out += [('chole', hole()), ('cladderD', ladder(True)), ('cladderU', ladder(False)), ('cexit', exit_mat()),
            ('cbraille', braille()), ('mouth', mouth())]
    return out


# ─────────── 울트라 스페이스 (보랏빛 우주 · 빛나는 수정 · 떠 있는 발판 · 밝은 길) · 울트라 워프홀 ───────────
UP = {k: hx(v) for k, v in dict(
    v0='#120a24', v1='#1e1238', s0='#6c58b0', s1='#e8e0ff',
    p0='#3a2a68', p1='#4c3a88', p2='#2a1c50', pe='#b088ff', pE='#e0c8ff',
    w0='#f4eeff', w1='#c8b4ff', w2='#9a80f0',
    c0='#68e8f8', c1='#f878e8', c2='#ffffff', c3='#3088b8', c4='#a03898',
).items()}


def uvoid(f):
    t = Tile()
    for y in range(16):
        for x in range(16):
            t.px(x, y, UP['v1'] if (x * 3 + y * 5) % 23 == 0 else UP['v0'])
    stars = [(3, 2), (11, 5), (6, 11), (14, 13), (1, 8)]
    for i, (x, y) in enumerate(stars):
        big = (i + f) % 2 == 0
        t.px(x, y, UP['s1'] if big else UP['s0'])
        if big and i % 2 == 0:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                t.px(x + dx, y + dy, UP['s0'])
    return t


def uplat(mask):
    """떠 있는 발판: 육각 무늬 + 빈 우주 쪽 가장자리가 빛남 (mask = 이웃도 발판)."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            c = UP['p0']
            if (y % 8 == 0) or ((x + (y // 8) * 4) % 8 == 0):
                c = UP['p1']
            if (x * 7 + y * 3) % 17 == 0:
                c = UP['p2']
            t.px(x, y, c)
    N, E, S, W = mask & 1, mask & 2, mask & 4, mask & 8
    for i in range(16):
        if not N: t.px(i, 0, UP['pE']); t.px(i, 1, UP['pe'])
        if not W: t.px(0, i, UP['pE']); t.px(1, i, UP['pe'])
        if not E: t.px(15, i, UP['pE']); t.px(14, i, UP['pe'])
        if not S:   # 발판 두께 (아래로 떨어지는 그늘)
            t.px(i, 13, UP['pe']); t.px(i, 14, UP['p2']); t.px(i, 15, UP['v0'])
    return t


def upath():
    """밝은 빛의 길 (덧그림): 가운데 빛나는 띠 + 화살 무늬."""
    t = Tile()
    for y in range(16):        # 칸 전체를 덮어 이어 붙이면 끊김 없는 빛의 길
        for x in range(16):
            t.px(x, y, UP['w1'] if (x + y) % 4 == 0 or (x - y) % 8 == 0 else UP['w0'])
    for (x, y) in [(7, 5), (8, 5), (6, 6), (9, 6), (5, 7), (10, 7), (7, 10), (8, 10), (6, 11), (9, 11), (5, 12), (10, 12)]:
        t.px(x, y, UP['w2'])
    return t


UCRYSTAL = [
    '................',
    '.......2........',
    '......212.......',
    '.....21102......',
    '....211002..2...',
    '....2110032.22..',
    '...21100032220..',
    '...2110003202...',
    '..21110003302...',
    '..2111000330....',
    '..2111000330....',
    '...211000330....',
    '...21110033.....',
    '....2110033.....',
    '.....33333......',
    '................',
]


def ucrystal(alt):
    t = Tile()
    pal = {'0': UP['c0'], '1': UP['c2'], '2': UP['c3'], '3': UP['c3']} if not alt else {'0': UP['c1'], '1': UP['c2'], '2': UP['c4'], '3': UP['c4']}
    t.art(UCRYSTAL, pal)
    return t


def wormhole(f):
    """32×32 소용돌이 (4장 돌기): 바깥 보라 → 안쪽 흰 빛, 팔 3개가 돌아감."""
    import math
    t = Tile(32, 32)
    for y in range(32):
        for x in range(32):
            dx, dy = x - 15.5, (y - 15.5) * 1.25        # 살짝 납작 (바닥에 열린 구멍처럼)
            r = math.hypot(dx, dy)
            if r > 15:
                continue
            a = math.atan2(dy, dx)
            arm = math.sin(3 * a + r * 0.55 - f * math.pi / 2)
            if r < 3.2:
                c = UP['c2']
            elif r < 6:
                c = UP['pE'] if arm > -0.2 else UP['w1']
            elif r < 11:
                c = UP['pE'] if arm > 0.45 else UP['pe'] if arm > -0.3 else UP['w2']
            else:
                c = UP['pe'] if arm > 0.3 else UP['p1'] if arm > -0.4 else None
            if c:
                t.px(x, y, c)
    return t


def ultra_tiles():
    out = [('uvoid0', uvoid(0)), ('uvoid1', uvoid(1))]
    for m in range(16):
        out.append((f'uplat{m}', uplat(m)))
    out += [('upath', upath()), ('ucrystalA', ucrystal(False)), ('ucrystalB', ucrystal(True))]
    return out


# ─────────── 주인공: HAFS 교복 (남색 재킷 + 금색 테두리) · 사육사 ───────────
# v2 (2026-11-05): 참고 그림(3세대 남자아이 539ae2d8…jpg)에 맞춰 모자를 낮고 작게 (챙 1px), 옆모습 몸 두께 9px,
#                  작고 둥근 신발 · 아래로 갈수록 가늘어지는 다리. 예전 그림은 git 기록 (606b6a2) 에 있음.
HP = {
    'k': '#181820', 'R': '#e04838', 'r': '#a82830', 'O': '#f88860', 'D': '#701c24',
    'h': '#282838', 'H': '#444460', 's': '#f8d0a8', 'S': '#d89868', 'e': '#202028',
    'w': '#f8f8f8', 'W': '#c0c8d8', 'B': '#3a4672', 'b': '#262c4c', 'd': '#181c34',
    'Y': '#f0c850', 'y': '#b88a28', 'T': '#283058', 't': '#c8a040',
    'P': '#2c3658', 'p': '#1c2240', 'Z': '#3c3034', 'z': '#706068',
}
# 사육사: 카키 셔츠 · 초록 스카프 · 국방색 바지 · 갈색 장화 · 챙 넓은 카키 모자 (보통 크기)
KP = dict(HP)
KP.update({
    'A': '#e0c888', 'a': '#b09858', 'G': '#4c7a34',             # 모자 (밝은 카키 · 그늘 · 초록 띠)
    'h': '#6c4828', 'H': '#8c6038',                              # 갈색 머리
    'B': '#c8b070', 'b': '#9c8448', 'd': '#7c6838',              # 카키 셔츠
    'Y': '#7c6038', 'y': '#5c4428',                              # 주머니 덮개 · 허리띠 (갈색)
    'w': '#f0e8c8', 'T': '#4c8a3c', 't': '#78b860',              # 속셔츠 · 초록 스카프
    'P': '#5c6034', 'p': '#40441f', 'Z': '#6c4424', 'z': '#9c6c3c',  # 바지 · 장화
    'm': '#6c4828',
})
DARK = {'B': 'b', 'R': 'r', 'O': 'R', 'P': 'p', 'Y': 'y', 'b': 'd', 'Z': 'Z', 'A': 'a', 'T': 'T'}
BODY_ROW = 10        # 이 줄부터 몸 (오른쪽 절반을 그늘색으로)

# 앞모습 왼쪽 절반 7칸 → 거울. 모자 0-4 (챙 = 4번 줄 1px) · 머리·얼굴 5-9 · 교복 10-15 · 다리 16-19
HEAD_FRONT = [
    '....kkk',
    '..kkROO',
    '.kRROOw',
    '.kRRRww',
    '.kDDDDD',
    '.khhhhh',
    '.khssss',
    '.khsess',
    '.khsess',
    '..kSsss',
]
HEAD_BACK = [
    '....kkk',
    '..kkROO',
    '.kRROOO',
    '.kRRRRR',
    '.kDDDDD',
    '.khhhhh',
    '.khhhhh',
    '.khHhhh',
    '.khhhhh',
    '..khhhh',
]
HAT_FRONT = [   # 사육사 모자: 낮은 머리 + 양옆으로 1칸 나온 챙
    '.......',
    '...kkkk',
    '..kAAAA',
    '..kGGGG',
    'kAAAAAa',
    '.khhhhh',
    '.khssss',
    '.khsess',
    '.khsess',
    '..kssmm',
]
HAT_BACK = [
    '.......',
    '...kkkk',
    '..kAAAA',
    '..kGGGG',
    'kAAAAAA',
    '.khhhhh',
    '.khhhhh',
    '.khHhhh',
    '.khhhhh',
    '..khhhh',
]
BODY_FRONT = [
    '..kBYwS',
    '.kBkYwT',
    'kBkBBYT',
    'kBkBBBY',
    'kYkBBBB',
    'kskYYYY',
    '..kPPPk',
    '..kPPPk',
    '...kPPk',
    '...kZzk',
]
BODY_BACK = [
    '..kBBBB',
    '.kBkBBB',
    'kBkBBBB',
    'kBkBBBB',
    'kYkBBBB',
    'kskYYYY',
    '..kPPPk',
    '..kPPPk',
    '...kPPk',
    '...kZZk',
]

# 옆모습 (왼쪽을 봄), 14칸. 머리 9칸 · 몸 9칸 (앞가슴 · 팔 · 등)
SIDE_HEAD = [
    '.....kkkk.....',
    '....kOOORk....',
    '...kwOORRrk...',
    '...kwwRRRrk...',
    '.kDDDDDrrrrk..',
    '...khhhhhhhk..',
    '...kssshhhhk..',
    '...ksesShhhk..',
    '...ksesShhhk..',
    '....ksssShk...',
]
SIDE_HAT = [
    '..............',
    '.....kkkkk....',
    '....kAAAAak...',
    '....kGGGGGk...',
    '.kAAAAAAAAAak.',
    '...khhhhhhhk..',
    '...kssshhhhk..',
    '...ksesShhhk..',
    '...ksesShhhk..',
    '....kmsSShk...',
]
SIDE_BODY = [
    '...kwTYBBBbk..',
    '...kTYkBBkbk..',
    '...kBYkBBkbk..',
    '...kBBkBBkbk..',
    '...kBBkYYkbk..',
    '...kYYksskYk..',
]
SIDE_LEGS = [   # 서기 · 걸음1 (다리 벌림) · 걸음2 (반대 다리)
    ['....kPPPpk....',
     '....kPPPpk....',
     '.....kPPpk....',
     '....kZZzk.....'],
    ['....kPPPpk....',
     '...kPPkkPpk...',
     '...kPk..kPk...',
     '..kZzk.kZzk...'],
    ['....kpPPPk....',
     '...kppkkPPk...',
     '...kpk..kPk...',
     '..kZzk.kZzk...'],
]
SIDE_FEET = [['.....kkk......'], ['...kk...kk....'], ['...kk...kk....']]


def mirror(half):
    out = []
    for y, r in enumerate(half):
        dark = DARK if y >= BODY_ROW else {k: v for k, v in DARK.items() if k in 'RODA'}
        out.append(r + ''.join(dark.get(c, c) for c in reversed(r)))
    return out


def front_frames(head, body):
    rows = mirror(head + body) + ['....kk..kk....']
    stand = rows
    def step(left):
        rs = [list(r) for r in rows]
        cols = range(0, 7) if left else range(7, 14)
        n = len(rs)
        for x in cols:          # 들린 다리: 신발·테두리를 한 칸 위로
            for y in (n - 3, n - 2):
                rs[y][x] = rs[y + 1][x]
            rs[n - 1][x] = '.'
        return [''.join(r) for r in rs]
    return [stand, step(True), step(False)]


def side_frames(head):
    out = []
    for legs, feet in zip(SIDE_LEGS, SIDE_FEET):
        out.append(head + SIDE_BODY + legs + feet)
    return out


def char_sheet(pal, head_f, head_b, head_s):
    dirs = [front_frames(head_f, BODY_FRONT), front_frames(head_b, BODY_BACK), side_frames(head_s)]
    dirs.append([[r[::-1] for r in fr] for fr in dirs[2]])
    im = Image.new('RGBA', (16 * 3, 24 * 4), CLEAR)
    for j, frames in enumerate(dirs):
        for i, rows in enumerate(frames):
            oy = 24 - len(rows)        # 발이 칸 맨 아래
            for y, r in enumerate(rows):
                for x, ch in enumerate(r):
                    if ch in pal:
                        im.putpixel((i * 16 + 1 + x, j * 24 + oy + y), hx(pal[ch]))
    return im


def hero_sheet():
    return char_sheet(HP, HEAD_FRONT, HEAD_BACK, SIDE_HEAD)


def keeper_sheet():
    return char_sheet(KP, HAT_FRONT, HAT_BACK, SIDE_HAT)


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
    tiles += cave_tiles()
    tiles += ultra_tiles()
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
    for f in range(4):      # 울트라 워프홀 32×32 · 4장
        sheet.paste(wormhole(f).im, (16 + f * 32, rows * TS))
        idx[f'worm{f}'] = [16 + f * 32, rows * TS, 32, 32]
    return sheet, idx


def main():
    sheet, idx = build()
    hero = hero_sheet()
    img = os.path.join(ROOT, 'web', 'img')
    sheet.save(os.path.join(img, 'safari-tiles.png'), optimize=True)
    hero.save(os.path.join(img, 'safari-hero.png'), optimize=True)
    keeper = keeper_sheet()
    keeper.save(os.path.join(img, 'safari-keeper.png'), optimize=True)
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
