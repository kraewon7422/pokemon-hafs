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
  cwall<0-15>_<0-2>  mwall..    동굴 바위벽 · 바깥 산 바위 (숫자 = 이웃도 벽인 쪽, 아래가 열리면 벽면 · _v = 무늬 변형 3가지)
  crock cboulder chole         동굴 작은 바위 · 큰 바위 · 떨어지는 구멍
  cladderD cladderU cexit      내려가는/올라가는 사다리 · 밖으로 나가는 밝은 칸
  cbraille mouth               벽면 점자 (덧그림) · 바깥 바위벽 동굴 입구 (덧그림)
  uvoid<0-1> uplat<0-15>       울트라 스페이스 빈 우주 (별 반짝 2장) · 떠 있는 발판 (숫자 = 이웃도 발판)
  upath ucrystalA ucrystalB    밝은 빛의 길 (덧그림) · 빛나는 수정 (청록 / 분홍)
  worm<0-3>                    울트라 워프홀 소용돌이 32×32 (4장 돌기)
  sfloor<0-1> saltar sstairs<L|R|C>  제단 방 돌바닥 · 흰 대리석 제단 · 돌계단 (난간 쪽)
  pwall<0-15>_<0-2> spillar    제단 방 분홍빛 갈색 절벽 · 부서진 돌기둥 16×32
  tallR<0-1>                   풀숲을 밟을 때 흔들리는 잎 2장
  bsand<0-1> bshal<0-15>_<0-1> bdeep<0-1> bdeepe<0-15> bshalc<..>  해변 모래 · 얕은 물 (물거품 테두리, 2장) · 깊은 바다 · 깊은 바다 테두리
  bcoralA bcoralB bshell brock bsign palm   산호 (분홍 / 노랑) · 조개+불가사리 · 모래 위 바위 · 표지판 · 야자나무 16×24
  dsand<0-1> dripple<0-1> dwall<0-15>_<0-2> dwallc<..>  사막 모래 · 모래 물결 · 붉은 사암 절벽 (0043)
  dgrass dgrassR<0-1> dcactusS drock drubble dskull dbones druin<0-1> dsign  마른 모래 풀숲 (+흔들림) · 술통 선인장 · 사암 바위 · 돌 부스러기 · 머리뼈 · 뼈 · 유적 바닥 · 표지판
  dcactus dpillar ddune        기둥 선인장 16×24 · 유적 사암 돌기둥 16×32 · 모래 언덕 48×32 (3×2 칸)
주인공 safari-hero.png · 사육사 safari-keeper.png: 16×24 칸, 줄 = 아래·위·왼쪽·오른쪽, 칸 = 서기·걸음1·걸음2.
"""
import json
import math
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
    'c': dict(top0='#5c4838', top1='#4a3a2c', top2='#76604c', top3='#33261a', rim0='#d8c0a0', rim1='#a08468',
              face0='#8c6c54', face1='#a8866a', face2='#6c5040', face3='#40301f'),
    'm': dict(top0='#9c8c74', top1='#887860', top2='#b8a88c', top3='#5c4c40', rim0='#ece0c4', rim1='#b8a88c',
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


def _lump_field(v, wrap_y):
    """둥근 바위 덩어리 무늬 (보로노이). 좌우 끝 점은 모든 변형이 같이 씀 → 변형끼리 나란히 놓아도 이음매가 맞음.
    돌려줌 f(x, y) → (d1, d2, rx, ry): 가장 가까운 점까지 거리 · 둘째 거리 · 그 점에서 본 위치."""
    edge = [(0.0, 2.5), (0.0, 8.0), (0.0, 13.0)]
    inner = [
        [(5, 1.5), (10, 4), (6, 7.5), (11, 10), (5, 12.5), (9, 14.5)],
        [(7, 2), (4.5, 5.5), (11, 6), (8, 10), (5, 14), (11, 13.5)],
        [(9, 1), (5, 4.5), (8.5, 7.5), (4.5, 10), (11, 11), (7.5, 14.5)],
    ][v]
    pts = []
    for (px, py) in edge + inner:
        for ox in (-16, 0, 16):
            for oy in ((-16, 0, 16) if wrap_y else (0,)):
                pts.append((px + ox, py + oy))

    def f(x, y):
        best = []
        for (px, py) in pts:
            d = ((x - px) ** 2 + ((y - py) * 1.15) ** 2) ** 0.5     # 살짝 가로로 넓은 덩어리
            best.append((d, px, py))
        best.sort()
        (d1, px, py), (d2, _, _) = best[0], best[1]
        return d1, d2, x - px, y - py
    return f


RIM_OFF = [1, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 1, 2, 1, 0, 1]     # 위 턱의 울퉁불퉁한 높이 (모든 변형이 같음 → 이음매 맞음)


def wall(kind, mask, v=0):
    """v = 무늬 변형 (0-2). 벽면 = 둥근 바위 덩어리 (왼쪽 위 밝음 · 가운데 · 오른쪽 아래 어두움 · 틈은 진하게).
    윗면 = 위에서 본 같은 덩어리 (어둡고 대비 낮게, 상하좌우로 이어짐)."""
    P = {k: hx(val) for k, val in CAVE[kind].items()}
    t = Tile()
    N, E, S, W = mask & 1, mask & 2, mask & 4, mask & 8
    topf = _lump_field(0, True)

    def top_px(x, y):
        d1, d2, rx, ry = topf(x, y)
        gap, sd = d2 - d1, rx + ry
        if gap < 0.8:
            return P['top3']
        if sd < -2.0 and gap > 1.4:
            return P['top2']
        if sd > 1.6 or gap < 1.5:
            return P['top1']
        return P['top0']

    def lump_px(x, y, f):
        d1, d2, rx, ry = f(x, y)
        gap = d2 - d1
        if gap < 0.85:
            return P['face3']
        s = rx + ry
        if s < -1.6 and gap > 1.6:
            return P['rim0'] if s < -3.2 else P['face1']
        if s > 1.8 or (gap < 1.7 and s > 0):
            return P['face2']
        return P['face0']

    if S:   # 윗면
        for y in range(16):
            for x in range(16):
                t.px(x, y, top_px(x, y))
        if not N:
            for x in range(16):
                t.px(x, 0, P['face3']); t.px(x, 1, P['rim0']); t.px(x, 2, P['rim1'])
        if not W:
            for y in range(16):
                if N or y > 0:
                    t.px(0, y, P['face3']); t.px(1, y, P['rim0'] if (N or y > 1) else t.get(1, y)); t.px(2, y, P['rim1'] if (N or y > 2) else t.get(2, y))
        if not E:
            for y in range(16):
                if N or y > 0:
                    t.px(15, y, P['face3']); t.px(14, y, P['rim1'] if (N or y > 1) else t.get(14, y))
        return t
    # 벽면
    f = _lump_field(v, False)
    y0 = 3 if N else 0
    for x in range(16):
        ry = y0 + RIM_OFF[x]
        for y in range(16):
            if y < ry:
                if N:
                    t.px(x, y, top_px(x, y))      # 위 칸 윗면이 이어짐 (아니면 투명 → 아래에 깐 바닥이 보임)
                continue
            if y == ry:
                c = P['face3']
            elif y == ry + 1:
                c = P['rim0']
            elif y == ry + 2:
                c = P['rim1'] if (x + v) % 3 else P['rim0']
            elif y == 15:
                c = P['face3']
            else:
                c = lump_px(x, y, f)
            t.px(x, y, c)
    if not W:
        for y in range(16):
            if y >= y0 + RIM_OFF[0]:
                t.px(0, y, P['face3']); t.px(1, y, P['face2'] if y > y0 + RIM_OFF[1] + 1 else t.get(1, y))
    if not E:
        for y in range(16):
            if y >= y0 + RIM_OFF[15]:
                t.px(15, y, P['face3']); t.px(14, y, P['face2'] if y > y0 + RIM_OFF[14] + 1 else t.get(14, y))
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


def wall_corner(kind, corner):
    P = {k: hx(v) for k, v in CAVE[kind].items()}
    t = Tile()
    pts = {(0, 0): 'face3', (1, 0): 'rim0', (0, 1): 'rim0', (1, 1): 'rim0', (2, 0): 'rim1', (0, 2): 'rim1', (2, 1): 'rim1', (1, 2): 'rim1'}
    for (x, y), c in pts.items():
        X = x if 'w' in corner else 15 - x
        Y = y if 'n' in corner else 15 - y
        if 'e' in corner and c == 'rim0':
            c = 'rim1'
        t.px(X, Y, P[c])
    return t


def rock_art(w, h, kind='c'):
    """둥근 바위 (동굴 벽과 같은 색 · 빛은 왼쪽 위 · 1px 진한 테두리 · 바닥 그림자)."""
    P = {k: hx(v) for k, v in CAVE[kind].items()}
    t = Tile()
    cx, cy = 7.5, 15 - h / 2 - 1
    rx, ry = w / 2, h / 2
    inside = lambda x, y: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
    for y in range(16):
        for x in range(16):
            if not inside(x, y):
                continue
            nx, ny = (x - cx) / rx, (y - cy) / ry
            lit = -(nx + ny)                                   # 왼쪽 위가 밝음
            c = 'rim0' if lit > 0.9 else 'face1' if lit > 0.25 else 'face0' if lit > -0.55 else 'face2'
            if (x * 5 + y * 3) % 11 == 0 and c in ('face0', 'face1'):
                c = 'face2'                                    # 작은 홈
            t.px(x, y, P[c])
    for y in range(16):
        for x in range(16):
            if not inside(x, y) and any(inside(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                t.px(x, y, P['face3'])
    by = int(cy + ry) + 1                                      # 바닥 그림자
    for x in range(int(cx - rx) + 2, int(cx + rx)):
        if 0 <= by + 1 < 16 and t.get(x, by + 1)[3] == 0:
            t.px(x, by + 1, hx(CF['f3']))
    return t


def cave_tiles():
    out = [('cfloor0', cfloor(0)), ('cfloor1', cfloor(1))]
    for kind in 'cm':
        for m in range(16):
            for v in range(3):
                out.append((f'{kind}wall{m}_{v}', wall(kind, m, v)))
    out += [('crock', rock_art(9, 7)), ('cboulder', rock_art(14, 12))]
    for kind in 'cmp':
        for c in ('nw', 'ne', 'sw', 'se'):
            out.append((f'{kind}wallc{c}', wall_corner(kind, c)))
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


WORM = {k: hx(v) for k, v in dict(o='#24104c', d='#5028a0', v='#8858e0', l='#c4a8f8', w='#ffffff').items()}


def wormhole(f):
    """32×32 (그림은 28×20 납작한 타원) 소용돌이, 4장 돌기. 색 5개 · 단단한 테두리 · 경계만 바둑판 섞기 (흐림·반투명 없음)."""
    import math
    t = Tile(32, 32)
    cx, cy, rx, ry = 15.5, 17.5, 13.5, 9.5
    inside = [[((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 for x in range(32)] for y in range(32)]
    for y in range(32):
        for x in range(32):
            if not inside[y][x]:
                continue
            r = (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) ** 0.5
            a = math.atan2((y - cy) / ry, (x - cx) / rx)
            s = (a * 3 / (2 * math.pi) + r * 1.6 - f / 4) % 1.0      # 팔 3개가 안쪽으로 감김
            arm = s < 0.42
            edge = abs(s - 0.42) < 0.06 or s < 0.04
            if edge and (x + y) % 2:
                arm = not arm                                          # 경계만 바둑판 섞기
            if r < 0.2:
                c = 'w'
            elif r < 0.5:
                c = 'w' if arm else 'l'
            elif r < 0.8:
                c = 'l' if arm else 'v'
            else:
                c = 'v' if arm else 'd'
            t.px(x, y, WORM[c])
    for y in range(32):          # 1px 진한 테두리
        for x in range(32):
            if inside[y][x]:
                continue
            if any(0 <= x + dx < 32 and 0 <= y + dy < 32 and inside[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                t.px(x, y, WORM['o'])
    return t


def ultra_tiles():
    out = [('uvoid0', uvoid(0)), ('uvoid1', uvoid(1))]
    for m in range(16):
        out.append((f'uplat{m}', uplat(m)))
    out += [('upath', upath()), ('ucrystalA', ucrystal(False)), ('ucrystalB', ucrystal(True))]
    return out


# ─────────── 전설의 제단 (돌기둥 유적 방: 황토색 돌바닥 · 분홍빛 갈색 절벽 · 부서진 돌기둥 · 돌계단 · 흰 대리석 제단) ───────────
CAVE['p'] = dict(top0='#a87068', top1='#905850', top2='#c89088', top3='#583838', rim0='#f0d0c0', rim1='#c8a098',
                 face0='#b8807a', face1='#d8a8a0', face2='#906058', face3='#583838')
SH = {k: hx(v) for k, v in dict(
    f0='#e0d4a0', f1='#ccbf88', f2='#f0e8c0', fg='#b4a470', fc='#a09060',
    a0='#f6f6f2', a1='#dcdce4', a2='#c4c4d0', a3='#ffffff',
    t0='#d0d0d8', t1='#a0a0b0', t2='#787888', t3='#e8e8f0',
    c0='#b8ae98', c1='#d8d0bc', c2='#8c8270', c3='#5c5444', cs='#c0b484',
).items()}


def sfloor(v):
    """돌판 바닥: 8×8 돌판 4장 · 줄눈 · 돌판마다 밝은 위쪽 · 몇 군데 금."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            gx, gy = x % 8, y % 8
            off = 4 if (y // 8) % 2 else 0          # 줄마다 반 칸 어긋남 (벽돌 쌓기)
            gx = (x + off) % 8
            if gy == 7 or gx == 7:
                c = SH['fg']
            elif gy == 0 or gx == 0:
                c = SH['f2']
            else:
                c = SH['f1'] if (x * 3 + y * 5) % 11 == 0 else SH['f0']
            t.px(x, y, c)
    if v:
        for (x, y) in [(3, 2), (4, 3), (4, 4), (5, 5), (11, 10), (12, 11), (12, 12)]:
            t.px(x, y, SH['fc'])
    return t


def saltar():
    """흰 대리석 제단 바닥: 큰 판 + 연한 결 + 테두리 줄."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            c = SH['a0']
            if x == 15 or y == 15:
                c = SH['a2']
            elif x == 0 or y == 0:
                c = SH['a3']
            elif (x + 2 * y) % 13 == 0 or (2 * x - y) % 17 == 0:
                c = SH['a1']
            t.px(x, y, c)
    return t


def sstairs(rail):
    """돌계단 (위아래로 오름): 4px 마다 디딤판 · 턱 그늘. rail = 'L' | 'R' | 'C' (난간 쪽)."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            k = y % 4
            c = SH['t3'] if k == 0 else SH['t0'] if k < 3 else SH['t1']
            t.px(x, y, c)
    for y in range(16):
        if rail == 'L':
            t.px(0, y, SH['t2']); t.px(1, y, SH['t1'])
        if rail == 'R':
            t.px(15, y, SH['t2']); t.px(14, y, SH['t1'])
    return t


def spillar(P=None):
    """16×32 부서진 돌기둥: 받침 + 기둥 (왼쪽 밝음 · 오른쪽 어두움) + 뾰족하게 부서진 머리 + 오른쪽 아래 그림자."""
    P = P or SH
    t = Tile(16, 32)
    top = [9, 7, 6, 5, 6, 8, 7, 9, 10, 11]          # 기둥 열 (x 3..12) 마다 부서진 높이
    for i, x in enumerate(range(3, 13)):
        for y in range(top[i], 27):
            if x == 3 or x == 12:
                c = P['c3']
            elif x <= 5:
                c = P['c1']
            elif x >= 10:
                c = P['c2']
            else:
                c = P['c0']
            if y == top[i]:
                c = P['c3'] if x in (3, 12) else P['c1']
            if x == 7 and y > top[i] + 2 and y % 6 == 0:
                c = P['c2']                         # 기둥 홈
            t.px(x, y, c)
        t.px(x, top[i] - 1, P['c3'])                # 머리 테두리
    for y in range(26, 31):                          # 받침
        for x in range(1, 15):
            edge = x in (1, 14) or y in (26, 30)
            t.px(x, y, P['c3'] if edge else P['c1'] if y == 27 else P['c0'] if x < 11 else P['c2'])
    for x in range(3, 16):                           # 그림자 (오른쪽 아래)
        t.px(x, 31, P['cs'])
    for y in range(18, 31):
        t.px(15, y, P['cs'])
    return t


def shrine_tiles():
    out = [('sfloor0', sfloor(0)), ('sfloor1', sfloor(1)), ('saltar', saltar())]
    for r in 'LRC':
        out.append((f'sstairs{r}', sstairs(r)))
    for m in range(16):
        for v in range(3):
            out.append((f'pwall{m}_{v}', wall('p', m, v)))
    return out


# ─────────── 해변 (0040): 밝은 모래 · 얕은 물 (물거품 테두리) · 깊은 바다 · 산호 · 조개 · 불가사리 · 야자나무 ───────────
# 3세대 해변 길 느낌으로 새로 그림: 모래는 따뜻한 연노랑 + 듬성한 반점, 얕은 물은 청록 + 흰 물거품 줄,
# 깊은 바다는 진한 파랑. 테두리는 모래길 · 물가와 같은 이웃 비트 (N1 E2 S4 W8).
BC = {k: hx(v) for k, v in dict(
    bs0='#f8e4a8', bs1='#fff4cc', bs2='#e4c888', bs3='#c8a868', bw='#d8bc80',   # 모래 · 젖은 모래
    q0='#68cce0', q1='#a0e8f4', q2='#40a8cc', qF='#ffffff', qf='#d0f4fc',        # 얕은 물 · 물거품
    d0='#3c84d0', d1='#5ca4e8', d2='#2c64b0',                                    # 깊은 바다
    c0='#f07894', c1='#ffb4c4', c2='#c04870', cK='#782c48', cy='#f8d060', cY='#d09838',  # 산호 · 노란 산호
    sh0='#fff8f0', sh1='#f4c8c8', sh2='#c89090', st0='#f89848', st1='#d06828', st2='#ffc888',  # 조개 · 불가사리
    pt0='#b07c48', pt1='#d8a468', pt2='#7c5028', pK='#4c3018',                  # 야자 줄기
    pl0='#3c9c48', pl1='#68c058', pl2='#a0e070', plK='#1c5a28',                 # 야자 잎
).items()}


def bsand(v):
    t = Tile()
    for y in range(16):
        for x in range(16):
            t.px(x, y, BC['bs0'])
    pts = [(2, 2), (11, 4), (6, 10), (13, 13), (1, 12)] if v == 0 else [(4, 1), (9, 8), (14, 5), (3, 14), (12, 12)]
    for (x, y) in pts:                      # 작은 반짝 알갱이 (밝은 2점 + 그늘 1점)
        t.px(x, y, BC['bs1']); t.px(x + 1, y, BC['bs1']); t.px(x + 1, y + 1, BC['bs2'])
    for (x, y) in ([(8, 6), (4, 7), (12, 9)] if v == 0 else [(7, 3), (1, 6), (10, 14)]):
        t.px(x, y, BC['bs2'])
    if v == 1:
        t.px(6, 12, BC['bs3'])
    return t


def bshallow(mask, f):
    """얕은 물 (걸을 수 있음): 청록 + 물결 (2장), 물이 아닌 쪽 (모래) 으로 젖은 모래 · 흰 물거품 · 밝은 물."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            t.px(x, y, BC['q0'])
    o = 3 * f
    for (x, y, n) in [(1, 3, 4), (9, 6, 3), (4, 11, 4), (11, 13, 3)]:
        for i in range(n):
            t.px((x + i + o) % 16, y, BC['q1'])
        t.px((x + o + n) % 16, y + 1, BC['q2'])
    for y in range(16):
        for x in range(16):
            d = edge_dist(x, y, mask, 4)
            if d < 0.5:
                t.px(x, y, BC['bw'])
            elif d < 1.5:
                t.px(x, y, BC['qF'] if (x + y + f) % 4 else BC['qf'])
            elif d < 2.5:
                t.px(x, y, BC['qf'] if (x * 3 + y + f * 2) % 3 == 0 else BC['q1'])
    return t


def bshallow_corner(corner):
    """얕은 물 안쪽 모서리 (두 옆은 물인데 대각선만 모래): 귀퉁이에 둥근 젖은 모래 · 물거품."""
    t = Tile()
    for y in range(5):
        for x in range(5):
            X = x if 'w' in corner else 15 - x
            Y = y if 'n' in corner else 15 - y
            r = (x * x + y * y) ** 0.5
            if r < 1.6:
                t.px(X, Y, BC['bw'])
            elif r < 2.7:
                t.px(X, Y, BC['qF'] if (X + Y) % 4 else BC['qf'])
            elif r < 3.7 and (X * 3 + Y) % 3 == 0:
                t.px(X, Y, BC['qf'])
    return t


def bdeep(f):
    t = Tile()
    for y in range(16):
        for x in range(16):
            t.px(x, y, BC['d0'])
    o = 4 * f
    for (x, y) in [(2, 2), (10, 5), (5, 10), (12, 13)]:
        xx = (x + o) % 13
        t.px(xx, y, BC['d1']); t.px(xx + 1, y, BC['d1']); t.px(xx + 2, y, BC['d1']); t.px(xx + 1, y + 1, BC['d2'])
    return t


def bdeep_edge(mask):
    """깊은 바다 위 덧그림: 얕은 물 쪽으로 밝아지는 띠 (2단, 점무늬로 섞음)."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            d = edge_dist(x, y, mask, 4)
            if d < 1.5:
                t.px(x, y, BC['q0'])
            elif d < 3.5:
                t.px(x, y, BC['q2'])
            elif d < 4.5 and (x + y) % 2 == 0:
                t.px(x, y, BC['q2'])
    return t


CORAL = [
    '................',
    '..k.....k.......',
    '.kak...kak..k...',
    '.kaAk.kaAk.kak..',
    '..kaAkkaAk.kaAk.',
    '.k.kaAaAk.kaAk..',
    'kak.kaaAkkaAk.k.',
    'kaAkkaaAAaAk.kak',
    '.kaAaaAAAAk.kaAk',
    '..kaaAAAAAkkaAk.',
    '...kaAAAAAaaAk..',
    '....kkaaaAAAk...',
    '...wkddddddk.w..',
    '..w.wkkkkkk.w...',
    '................',
    '................',
]


def bcoral(yellow=False):
    t = Tile()
    pal = {'k': BC['cK'], 'a': BC['cY'] if yellow else BC['c2'], 'A': BC['cy'] if yellow else BC['c0'],
           'd': BC['q2'], 'w': BC['qF']}
    t.art(CORAL, pal)
    for (x, y) in [(2, 2), (8, 2), (12, 3)]:      # 가지 끝 밝은 점
        t.px(x, y, BC['bs1'] if yellow else BC['c1'])
    return t


SHELL = [
    '..........kk....',
    '.........kAAk...',
    '........kAaAak..',
    '........kaAaAk..',
    '.........kkkk...',
    '................',
    '..s.............',
    '.sSs............',
    'sSSSs...........',
    '.sSs............',
    '.s.s............',
]


def bshell():
    t = Tile()
    t.art(SHELL, {'k': BC['sh2'], 'A': BC['sh0'], 'a': BC['sh1'], 's': BC['st1'], 'S': BC['st0']}, 1, 3)
    t.px(3, 11, BC['st2'])
    return t


def brock():
    t = Tile(); t.art(ROCK, {'k': 'mK', '1': 'm1', '2': 'm0', '3': 'm2', 'g': BC['bs3']}); return t


def bsign():
    t = Tile(); t.art(SIGN, dict(SIGN_PAL, g=BC['bs3'])); return t


PALM = [  # 16×24: 위 8줄은 윗칸으로 솟음. 부채처럼 펼친 잎 + 마디진 줄기 (오른쪽 그늘)
    '......kk..kk....',
    '....kk11kk11kk..',
    '...k1222k1221k..',
    '..k12kk2k2kk21k.',
    '.k12k..k22k.k21k',
    'k12k..k2332k.k1k',
    'k1k..k123321k.kk',
    '.k..k12k33k21k..',
    '...k12k.cc.k21k.',
    '..k12k..cC..k1k.',
    '..k1k..kpPk..kk.',
    '...k...kpPk.....',
    '.......kpPk.....',
    '........kpPk....',
    '........kpPk....',
    '........kppPk...',
    '........kpPPk...',
    '.......kpppPk...',
    '.......kpPPPk...',
    '.......kppPPk...',
    '......kpppPPPk..',
    '.....ggkkkkkkgg.',
    '......gggggggg..',
    '................',
]


def palm():
    t = Tile(16, 24)
    t.art(PALM, {'k': BC['plK'], '1': BC['pl1'], '2': BC['pl0'], '3': BC['pl2'], 'c': BC['pt2'], 'C': BC['pt1'],
                 'p': BC['pt0'], 'P': BC['pt2'], 'g': BC['bs3']})
    for y in range(10, 21, 3):               # 줄기 마디
        for x in range(16):
            if t.get(x, y) == BC['pt0']:
                t.px(x, y, BC['pt1'])
    return t


def beach_tiles():
    out = [('bsand0', bsand(0)), ('bsand1', bsand(1))]
    for f in range(2):
        for m in range(16):
            out.append((f'bshal{m}_{f}', bshallow(m, f)))
    for c in ('ne', 'nw', 'se', 'sw'):
        out.append((f'bshalc{c}', bshallow_corner(c)))
    out += [('bdeep0', bdeep(0)), ('bdeep1', bdeep(1))]
    for m in range(16):
        out.append((f'bdeepe{m}', bdeep_edge(m)))
    out += [('bcoralA', bcoral()), ('bcoralB', bcoral(True)), ('bshell', bshell()), ('brock', brock()), ('bsign', bsign())]
    return out


# ─────────── 사막 · 모래바람 지대 (0043): 주황빛 모래 · 모래 물결 · 모래 언덕 · 붉은 사암 절벽 · 마른 모래 풀숲 · 선인장 · 뼈 · 유적 ───────────
# 3세대 111번 도로 사막 느낌으로 새로 그림 (원본 타일을 베끼지 않음). 모래는 해변보다 진하고 따뜻한 주황 · 절벽은 붉은 사암 (메사).
#   dsand<0-1> dripple<0-1> dwall<0-15>_<0-2> dwallc<..> dgrass dgrassR<0-1> dcactusS drock drubble dskull dbones
#   druin<0-1> dsign · dcactus 16×24 · dpillar 16×32 · ddune 48×32 (돌기둥 = 제단 기둥과 같은 모양, 사암 색)
DC = {k: hx(v) for k, v in dict(
    ds0='#e8c070', ds1='#f8dc98', ds2='#d4a458', ds3='#b8843c', rl='#f8dc98', rp='#d0a050',       # 모래 · 물결
    du1='#fff0c0', du0='#f4d490', du2='#d09c50', du3='#a8743a',                                  # 모래 언덕 (빛 · 가운데 · 그늘 · 진한 그늘)
    gk='#5c4c14', g0='#94882c', g1='#bcb040', g2='#e4d878',                                      # 마른 모래 풀
    ck='#1c4424', c0='#3c8840', c1='#64b04c', c2='#a4d878', cd='#2c6430', cs='#f4f0c8', cp='#f070a0', cP='#c04070', cy='#f8e070',  # 선인장
    bo0='#f8f4e4', bo1='#dcd0b0', bo2='#b0a080', bK='#6c5c40', bh='#3c2c1c',                     # 뼈
    rk='#5c3018', r1='#f0a870', r0='#d07c48', r2='#a0582c',                                      # 사암 바위
).items()}
CAVE['d'] = dict(top0='#c8784c', top1='#b0683c', top2='#e0965c', top3='#7c4024', rim0='#f8d09c', rim1='#e4a46c',
                 face0='#c47a4c', face1='#e09a64', face2='#9c5834', face3='#64301a')
RUIN = {k: hx(v) for k, v in dict(f0='#dcb47c', f1='#c8a066', f2='#f0d4a0', fg='#a07648', fc='#8c6438',
                                  c0='#d8ac78', c1='#f4d4a0', c2='#a87c50', c3='#64442a', cs='#c8964c').items()}


def dsand(v):
    t = Tile()
    for y in range(16):
        for x in range(16):
            t.px(x, y, DC['ds0'])
    pts = [(3, 2), (12, 5), (7, 11), (1, 9), (13, 13)] if v == 0 else [(5, 1), (10, 8), (2, 5), (14, 11), (6, 14)]
    for (x, y) in pts:                      # 알갱이 (밝은 2점 + 그늘 1점)
        t.px(x, y, DC['ds1']); t.px(x + 1, y, DC['ds1']); t.px(x + 1, y + 1, DC['ds2'])
    for (x, y) in ([(9, 3), (4, 7), (11, 14)] if v == 0 else [(8, 4), (12, 2), (3, 11)]):
        t.px(x, y, DC['ds2'])
    t.px(*((6, 5) if v == 0 else (10, 12)), DC['ds3'])
    return t


def dripple(v):
    """바람이 만든 모래 물결: 16px 마다 이어지는 굽은 줄 (밝은 등 + 그늘)."""
    t = dsand(v)
    for i, base in enumerate((3, 9, 14) if v == 0 else (2, 7, 12)):
        for x in range(16):
            y = base + round(math.sin((x + i * 5 + v * 3) * math.pi / 8) * 1.3)
            t.px(x, y, DC['rl']); t.px(x, y + 1, DC['rp'])
    return t


def ddune():
    """48×32 모래 언덕 (3×2 칸, 막힌 칸): 바람 받는 왼쪽은 완만하고 밝음 · 능선 오른쪽은 가파른 그늘 (미끄럼면) · 오른쪽 아래 모래 그림자."""
    t = Tile(48, 32)
    cx, cy, rx, ry = 23.0, 18.5, 22.5, 14.0
    inside = lambda x, y: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 and y <= 29 and y >= 3 + abs(x - 28) * 0.42
    crest = lambda y: 28 + (y - 4) * 0.42             # 능선 (꼭대기에서 아래로 살짝 오른쪽)
    for y in range(32):                               # 그림자 (오른쪽 아래 모래 위, 점무늬)
        for x in range(48):
            if not inside(x, y) and inside(x - 2, y - 2) and (x + y) % 2 == 0:
                t.px(x, y, DC['ds2'])
    for y in range(32):
        for x in range(48):
            if not inside(x, y):
                continue
            xc = crest(y)
            edge = not (inside(x - 1, y) and inside(x + 1, y) and inside(x, y - 1) and inside(x, y + 1))
            if x < xc - 0.5:                          # 바람 받는 비탈
                k = (xc - x) / max(1.0, xc - (cx - rx))
                c = DC['du1'] if k < 0.18 else DC['du0']
                if (x * 3 + y * 7) % 13 == 0 and 0.25 < k < 0.8:
                    c = DC['du1']                     # 반짝 알갱이
                if y > cy + ry * 0.45 and (x + y) % 2 == 0:
                    c = DC['du2']                     # 언덕 발치는 살짝 어둡게
            elif x < xc + 1:
                c = DC['du1']                         # 능선 밝은 줄
            else:
                c = DC['du3'] if x < xc + 2.5 else DC['du2']
                if (x - xc) > 6 and (x + y) % 3 == 0:
                    c = DC['du3']
            if edge:
                c = DC['du3'] if (x > xc or y > cy) else DC['du2']
            t.px(x, y, c)
    for (bx, by, n) in [(9, 16, 6), (14, 21, 7), (19, 11, 5), (5, 24, 6), (21, 26, 5)]:   # 바람 물결 (비탈 위 가는 줄)
        for i in range(n):
            x, y = bx + i, by + (1 if i in (0, n - 1) else 0)
            if inside(x, y) and x < crest(y) - 1:
                t.px(x, y, DC['du2'])
    return t


DGRASS = [  # 마른 모래 풀: 뾰족한 잎 다발 (진한 테두리 · 올리브 · 밝은 끝). 이어 붙이면 빽빽한 풀숲
    '..k.....k....k..',
    '.kLk...kLk..kLk.',
    '.knk.k.knk..knk.',
    'k.knkLkknk.kntk.',
    'kLktknkntkkLntk.',
    '.kntkntkntkkntk.',
    '..ktnttktnkntkk.',
    '.k.kttntnttkk.k.',
    'kLk.ktttttk..kLk',
    'knkk.ktntk.k.knk',
    'kntkLkttk.kLkntk',
    '.kttnkntkkknktk.',
    '..kttnttnkntnk..',
    '.k.kktttttttk.k.',
    'kLk..kkkkkkk.kLk',
    '.kk..........kk.',
]
DGRASS_PAL = {'k': DC['gk'], 't': DC['g0'], 'n': DC['g1'], 'L': DC['g2']}


def dgrass(f=None):
    t = Tile()
    rows = DGRASS
    if f is not None:      # 밟을 때 흔들리는 2장: 위쪽 잎 끝이 좌우로 1px
        rows = [(r[1:] + '.') if (i < 8 and f == 0) else ('.' + r[:-1]) if (i < 8 and f == 1) else r for i, r in enumerate(DGRASS)]
    t.art(rows, DGRASS_PAL)
    return t


CACTUS = [  # 16×24 기둥 선인장 (사와로): 위 8줄은 윗칸으로 솟음. 1 밝은 쪽 · 0 가운데 · d 그늘 · s 가시
    '......kkkk......',
    '.....k2110k.....',
    '.....k1s0dk.....',
    '.....k100dk.....',
    '.kkk.k10sdk.....',
    'k21dkk100dk.kkk.',
    'k1sdkk1s0dkk21dk',
    'k10dkk100dkk1sdk',
    'k1sdkk10sdkk10dk',
    'k10dkk100dkk1sdk',
    'k10ddk1s0dkk10dk',
    '.k100k100dkd10dk',
    '..kk00100d00ddk.',
    '....kk100dkkkk..',
    '.....k10sdk.....',
    '.....k100dk.....',
    '.....k1s0dk.....',
    '.....k100dk.....',
    '.....k10sdk.....',
    '.....k100dk.....',
    '.....k1s0dk.....',
    '...ggk100dkgg...',
    '....ggkkkkggg...',
    '................',
]


def dcactus():
    t = Tile(16, 24)
    t.art(CACTUS, {'k': DC['ck'], '0': DC['c0'], '1': DC['c1'], '2': DC['c2'], 'd': DC['cd'], 's': DC['cs'], 'g': DC['ds3']})
    return t


BARREL = [  # 둥근 술통 선인장 + 분홍 꽃
    '................',
    '......kkk.......',
    '.....kpPpk......',
    '....kpYyPpk.....',
    '....kkpPpkk.....',
    '...k21s0s0dk....',
    '..k210s0s0ddk...',
    '..k1s0s0s0sdk...',
    '.k210s0s0s0ddk..',
    '.k1s0s0s0s0sdk..',
    '.k210s0s0s0ddk..',
    '..k10s0s0s0dk...',
    '..kk0s0s0sdkk...',
    '...kkkkkkkkk....',
    '..ggggggggggg...',
    '................',
]


def dcactus_s():
    t = Tile()
    t.art(BARREL, {'k': DC['ck'], '0': DC['c0'], '1': DC['c1'], '2': DC['c2'], 'd': DC['cd'], 's': DC['cs'],
                   'p': DC['cP'], 'P': DC['cp'], 'Y': DC['cy'], 'y': DC['cs'], 'g': DC['ds2']})
    return t


SKULL = [  # 뿔 달린 짐승 머리뼈 (막힌 칸)
    '................',
    '.hh..........hh.',
    'hHHh........hHHh',
    'hHbHh......hbHHh',
    '.hHbHhhhhhhHbHh.',
    '..hhBBBBBBBBhh..',
    '...hBBBBBBBbh...',
    '..hBBkkBBkkBbh..',
    '..hBkKKkkKKkbh..',
    '..hBkKKkBKKkbh..',
    '...hBkkBBkkbh...',
    '...hBBBkkBBbh...',
    '....hBBKKBbh....',
    '....hBbBbBbh....',
    '...gghhhhhhgg...',
    '................',
]


def dskull():
    t = Tile()
    t.art(SKULL, {'h': DC['bK'], 'H': DC['bo1'], 'B': DC['bo0'], 'b': DC['bo2'], 'k': DC['bK'], 'K': DC['bh'], 'g': DC['ds3']})
    return t


BONES = [  # 모래에 반쯤 묻힌 뼈 · 갈비뼈 (걸을 수 있는 장식)
    '................',
    '................',
    '..........hh....',
    '.........hBbh...',
    '..hh....hBbh....',
    '.hBBh..hBbh.....',
    '.hBBBhhBbh......',
    '..hbBBBBh.......',
    '.hBBhhhh..h.h.h.',
    '.hbbh....hBhBhBh',
    '..hh.....hBhBhBh',
    '.........hbhbhbh',
    '........gghghghg',
    '................',
    '................',
    '................',
]


def dbones():
    t = Tile()
    t.art(BONES, {'h': DC['bK'], 'B': DC['bo0'], 'b': DC['bo2'], 'g': DC['ds2']})
    return t


def drock():
    t = Tile()
    t.art(ROCK, {'k': DC['rk'], '1': DC['r1'], '2': DC['r0'], '3': DC['r2'], 'g': DC['ds3']})
    return t


def drubble():
    t = Tile()
    t.art(CROCK, {'k': hx('#64442a'), '1': hx('#f4d4a0'), '2': hx('#d0a670'), '3': hx('#a07648'), 'g': RUIN['fc']})
    return t


def druin(v):
    """무너진 유적 바닥: 사암 돌판 (벽돌 쌓기) + 바람에 날려 쌓인 모래."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            off = 4 if (y // 8) % 2 else 0
            gx, gy = (x + off) % 8, y % 8
            if gy == 7 or gx == 7:
                c = RUIN['fg']
            elif gy == 0 or gx == 0:
                c = RUIN['f2']
            else:
                c = RUIN['f1'] if (x * 3 + y * 5) % 11 == 0 else RUIN['f0']
            t.px(x, y, c)
    drift = [(11, 12, 4.2), (2, 3, 2.6)] if v == 0 else [(4, 13, 3.6), (13, 2, 3.0)]
    for (cx, cy, r) in drift:
        for y in range(16):
            for x in range(16):
                d = ((x - cx) ** 2 + ((y - cy) * 1.4) ** 2) ** 0.5
                if d < r - 0.8:
                    t.px(x, y, DC['ds0'] if (x + y) % 5 else DC['ds1'])
                elif d < r and (x + y) % 2 == 0:
                    t.px(x, y, DC['ds0'])
    if v:
        for (x, y) in [(3, 3), (4, 4), (4, 5), (5, 6)]:
            t.px(x, y, RUIN['fc'])
    return t


def dsign():
    t = Tile()
    t.art(SIGN, dict(SIGN_PAL, g=DC['ds3']))
    return t


def desert_tiles():
    out = [('dsand0', dsand(0)), ('dsand1', dsand(1)), ('dripple0', dripple(0)), ('dripple1', dripple(1))]
    for m in range(16):
        for v in range(3):
            out.append((f'dwall{m}_{v}', wall('d', m, v)))
    for c in ('nw', 'ne', 'sw', 'se'):
        out.append((f'dwallc{c}', wall_corner('d', c)))
    out += [('dgrass', dgrass()), ('dgrassR0', dgrass(0)), ('dgrassR1', dgrass(1)), ('dcactusS', dcactus_s()),
            ('drock', drock()), ('drubble', drubble()), ('dskull', dskull()), ('dbones', dbones()),
            ('druin0', druin(0)), ('druin1', druin(1)), ('dsign', dsign())]
    return out


def grass_rustle(f):
    """풀숲을 밟을 때 잎이 흔들리는 2장: 위쪽 잎 끝이 좌우로 1px."""
    t = Tile()
    rows = [(r[1:] + '.') if (i < 8 and f == 0) else ('.' + r[:-1]) if (i < 8 and f == 1) else r for i, r in enumerate(TALL)]
    t.art(rows, TALL_PAL)
    return t


# ─────────── 주인공: HAFS 교복 (남색 재킷 + 금색 테두리) · 사육사 ───────────
# v3 (2026-11-05): 참고 그림 (3세대 FRLG 남자아이 3×4 · 16장 시트) 처럼 큰 머리 (키의 절반쯤) · 짧은 몸,
#   눈 = 1칸 폭 × 2칸 높이, 둘 사이 2칸 (코 위 가운데), 모자 챙 바로 아래 · 양옆 머리카락.
#   걸음: 서기 → 왼발 → 서기 → 오른발, 걸음 장면은 몸이 1px 위로 (들썩임) · 디딘 다리가 길고 든 다리는 1px 위 · 팔 흔들기.
#   예전 그림: v2 = git d9c02c6, v1 = 606b6a2.
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
    'A': '#e0c888', 'a': '#b09858', 'G': '#4c7a34',
    'h': '#6c4828', 'H': '#8c6038',
    'B': '#c8b070', 'b': '#9c8448', 'd': '#7c6838',
    'Y': '#7c6038', 'y': '#5c4428',
    'w': '#f0e8c8', 'T': '#4c8a3c', 't': '#78b860',
    'P': '#5c6034', 'p': '#40441f', 'Z': '#6c4424', 'z': '#9c6c3c',
    'm': '#6c4828',
})
DARK = {'B': 'b', 'R': 'r', 'O': 'R', 'P': 'p', 'Y': 'y', 'b': 'd', 'A': 'a'}
HEAD_DARK = {k: v for k, v in DARK.items() if k in 'ROA'}

# 앞·뒤 = 왼쪽 절반 7칸 (오른쪽은 거울 + 그늘색). 머리 0-9 (모자 0-4 · 머리카락 5 · 눈 6-7) · 몸 10-14 · 다리 15-17
HEAD_FRONT = [
    '....kkk',
    '..kkROO',
    '.kRROOw',
    '.kRRRww',
    '.kDDDDD',
    'khhssss',
    'khhsses',
    'khhsses',
    '.khssss',
    '..kkSss',
]
HEAD_BACK = [
    '....kkk',
    '..kkROO',
    '.kRROOO',
    '.kRRRRR',
    '.kDDDDD',
    'khhhhhh',
    'khhhhhh',
    'khhHhhh',
    '.khhhhh',
    '..kkhhh',
]
HAT_FRONT = [
    '.......',
    '...kkkk',
    '..kAAAA',
    '..kGGGG',
    'kAAAAAa',
    'khhssss',
    'khhsses',
    'khhsses',
    '.khssss',
    '..kksmm',
]
HAT_BACK = [
    '.......',
    '...kkkk',
    '..kAAAA',
    '..kGGGG',
    'kAAAAAA',
    'khhhhhh',
    'khhhhhh',
    'khhHhhh',
    '.khhhhh',
    '..kkhhh',
]
BODY_FRONT = [   # 어깨 → 작은 흰 V (턱에 닿지 않게) · 남색 깃 + 금색 테두리 · 넥타이 · 소매 끝 · 손 + 재킷 아랫단
    '.kkBBYT',
    'kBkBYwT',
    'kBkBBYT',
    'kYkBBBY',
    'kskYYYY',
]
BODY_BACK = [
    '.kkBBBB',
    'kBkBBBB',
    'kBkBBBB',
    'kYkBBBB',
    'kskYYYY',
]
HAND_BACK = 'kkkYYYY'          # 걸을 때 팔이 뒤로 → 손이 안 보임
LEG_STAND = ['..kPPPk', '..kZZzk', '...kkk.']
LEG_PLANT = ['..kPPPk', '..kPPPk', '..kZZzk', '...kkk.']    # 디딘 다리 (몸이 1px 올라가서 1칸 길어짐)
LEG_LIFT = ['..kPPPk', '..kZZzk', '...kkk.', '.......']     # 든 다리 (발이 1px 위)

# 옆모습 (왼쪽을 봄), 14칸. 머리 9칸 · 몸 9칸 (앞가슴 · 팔 · 등) · 눈은 얼굴 앞쪽 1×2
SIDE_HEAD = [
    '.....kkkk.....',
    '....kOOORk....',
    '...kwOORRrk...',
    '...kwwRRRrk...',
    '.kDDDDDrrrrk..',
    '..khhhhhhhhk..',
    '..ksssshhhhk..',
    '..ksessShhhk..',
    '..ksessShhhk..',
    '...kssssShk...',
]
SIDE_HAT = [
    '..............',
    '.....kkkkk....',
    '....kAAAAak...',
    '....kGGGGGk...',
    '.kAAAAAAAAAak.',
    '..khhhhhhhhk..',
    '..ksssshhhhk..',
    '..ksessShhhk..',
    '..ksessShhhk..',
    '...kmmssShk...',
]
SIDE_BODY = [
    '...kwTYBBBbk..',
    '...kTYkBBkbk..',
    '...kBYkBBkbk..',
    '...kBBkYYkbk..',
    '...kYYksskYk..',
]
SIDE_HAND = [None, '...kYsskkbYk..', '...kYYkbsskk..']     # 서기 · 팔 앞으로 · 팔 뒤로
SIDE_LEGS = [
    ['....kPPPpk....', '....kZZzk.....', '.....kkk......'],
    ['....kPPPpk....', '...kPpkkPpk...', '..kZzk.kZzk...', '...kk...kk....'],
    ['....kpPPPk....', '...kppkkPPk...', '..kZzk.kZzk...', '...kk...kk....'],
]


def pair(left, right, dark):
    """왼쪽 절반 + (오른쪽 절반을 거울로 뒤집고 그늘색)."""
    return left + ''.join(dark.get(c, c) for c in reversed(right))


def front_frames(head, body):
    hd = [pair(r, r, HEAD_DARK) for r in head]
    def frame(lb, rb, ll, rl):
        return hd + [pair(a, b, DARK) for a, b in zip(lb, rb)] + [pair(a, b, DARK) for a, b in zip(ll, rl)]
    stand = frame(body, body, LEG_STAND, LEG_STAND)
    swung = body[:-1] + [HAND_BACK]
    step_l = frame(body, swung, LEG_LIFT, LEG_PLANT)     # 왼발 들고 · 반대 (오른) 팔 뒤로
    step_r = frame(swung, body, LEG_PLANT, LEG_LIFT)
    return [stand, step_l, step_r]


def side_frames(head):
    out = []
    for i, legs in enumerate(SIDE_LEGS):
        body = list(SIDE_BODY)
        if SIDE_HAND[i]:
            body[-1] = SIDE_HAND[i]
        out.append(head + body + legs)
    return out


def char_sheet(pal, head_f, head_b, head_s):
    dirs = [front_frames(head_f, BODY_FRONT), front_frames(head_b, BODY_BACK), side_frames(head_s)]
    dirs.append([[r[::-1] for r in fr] for fr in dirs[2]])
    im = Image.new('RGBA', (16 * 3, 24 * 4), CLEAR)
    for j, frames in enumerate(dirs):
        for i, rows in enumerate(frames):
            oy = 24 - len(rows)        # 발이 칸 맨 아래 (걸음 장면은 1줄 길어서 머리가 1px 위)
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
    tiles += shrine_tiles()
    tiles += [('tallR0', grass_rustle(0)), ('tallR1', grass_rustle(1))]
    tiles += beach_tiles()
    tiles += desert_tiles()
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
    sheet.paste(spillar().im, (144, rows * TS))          # 돌기둥 16×32
    idx['spillar'] = [144, rows * TS, 16, 32]
    sheet.paste(palm().im, (160, rows * TS))            # 해변 야자나무 16×24
    idx['palm'] = [160, rows * TS, 16, 24]
    sheet.paste(dcactus().im, (176, rows * TS))         # 사막 기둥 선인장 16×24
    idx['dcactus'] = [176, rows * TS, 16, 24]
    sheet.paste(spillar(RUIN).im, (192, rows * TS))     # 사막 유적 사암 돌기둥 16×32
    idx['dpillar'] = [192, rows * TS, 16, 32]
    sheet.paste(ddune().im, (208, rows * TS))           # 사막 모래 언덕 48×32 (3×2 칸, 왼쪽 위 칸 D 에 그림)
    idx['ddune'] = [208, rows * TS, 48, 32]
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
