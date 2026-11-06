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
  (0048) 설원 sn*/swall* · 용암 lv*/lwall*/lava* · 발전소 pl* · 용의 굴 e*/ewall* · 다리 계단 bstair — 이름표는 아래 '0048' 부분
  (0050) 전설의 특별한 곳 moon* grac* eladderD ustar dstairs · tapu 16×32 · swordst 16×24 — 이름표는 아래 '0050' 부분
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


# ─────────── 0048: 설원 · 용암 지대 · 발전소 · 용의 굴 (+ 사파리존 호수 다리 계단 · 발전소 건물) ───────────
# 참고: DP/Pt 눈 덮인 마을·길 (연보랏빛 흰 눈 · 눈 모자 쓴 둥근 소나무 · 눈 덮인 흙 턱 · 얼어붙은 연못 · 눈 속 초록 풀숲 · 눈 지붕 오두막),
#   3세대 굴뚝산 · 불바다 동굴 (분홍빛 붉은 바위 · 검붉은 계단식 절벽 · 용암 못 + 노란 거품 · 재 덮인 마른 나무),
#   3세대 뉴보라 (발전소: 연회색 초록 바닥 타일 · 베이지/올리브 벽 + 리벳 · 파랑/초록 관 · 기계 선반 · 초록 발전기 · 노란 상자 · 바닥 스위치 · 큰 주황 발전기).
#   원본 타일을 베끼지 않고 새로 그림. 이름:
#   설원 sn*: snground<0-1> swall<0-15>_<0-2> swallc<..> snice<0-15> snstairs snrock snsign snman snexit · snpine 16×24 · sncabin 32×40 (2×2 칸)
#   용암 lv*: lvground<0-1> lwall<0-15>_<0-2> lwallc<..> lava<0-1> lavae<0-15> lavac<..> lvgrass lvgrassR<0-1> lvvent<0-1> lvrock lvsign lvstairs lvexit · lvtree 16×24
#   발전소 pl*: plfloor<0-1> plshadow plw<0-15> plvoid plpipeB plpipeG plrack plcon<0-1> plcrate plswitch plstairs plexit plsign · plgen 32×40 (2×2 칸) · plbuild 96×88 (6×5 칸, 사파리존 바깥 발전소 단지)
#   용의 굴 e*: efloor<0-1> ewall<0-15>_<0-2> ewallc<..> erock eboulder ecrystal eladder · 다리 계단 bstair
CAVE['s'] = dict(top0='#eef0f8', top1='#e4e7f4', top2='#fafbff', top3='#ccd0e6', rim0='#ffffff', rim1='#d4d8ec',
                 face0='#8c6448', face1='#a87c5c', face2='#6c4834', face3='#40281c')
CAVE['l'] = dict(top0='#b4564a', top1='#9c463c', top2='#cc6c5c', top3='#6c241c', rim0='#f0b0a0', rim1='#d8806c',
                 face0='#943428', face1='#b04c3c', face2='#701e16', face3='#40100c')
CAVE['e'] = dict(top0='#3c4058', top1='#30344a', top2='#4e5470', top3='#1c1e2c', rim0='#a8b0d8', rim1='#7880a8',
                 face0='#525a7c', face1='#6c76a0', face2='#3c4260', face3='#202438')
SN = {k: hx(v) for k, v in dict(
    s0='#eceef8', s1='#ffffff', s2='#d8dcf0', s3='#c0c4e0', s4='#a8acd0',
    pk='#24402c', p0='#3c6c44', p1='#5c9454', p2='#84b864', pw='#ffffff', ps='#d4d8f0', pS='#aab0d8', pt='#6c4c38', pT='#4c3424',
    i0='#a4dcf8', i1='#d4f2ff', i2='#7cc0e8', iE='#5c9cd0', iR='#f4fbff',
    ck='#3c2c24', c0='#a8704c', c1='#c88c60', c2='#7c4c30', cw='#f8f8ff', cs='#c8cce8', cg='#88c8e8', cd='#4c3428',
).items()}
LV = {k: hx(v) for k, v in dict(
    g0='#d8968a', g1='#eab0a4', g2='#c27c70', g3='#a8645a', ash='#f6f0f0',
    l0='#e84a1c', l1='#f87c2c', l2='#fcb444', l3='#fce870', lD='#c4300c', rK='#4c140c', r0='#8c3a2c', r1='#c06450',
    gk='#4a3e36', ga='#8a7a68', gb='#b2a48e', gc='#ece4da',
    tk='#3c3434', t0='#8c8484', t1='#b8b0b0', t2='#625a5a',
    vk='#3c1c18', v0='#6c3c34', v1='#8c544a', vg='#f8a040', vy='#fce870', sm='#e8e0e0', sM='#c8c0c0',
).items()}
PL = {k: hx(v) for k, v in dict(
    f0='#c8d4c0', f1='#dce6d4', f2='#a8b8a4', f3='#b8c6b2', sh='#9cac98',
    cap='#f0ecd8', capL='#fffcec', capK='#8c7c58', w0='#b4ac84', w1='#c8c098', w2='#968e6c', wr='#78704f', wt='#6c5c40', wb='#8c7454',
    void='#101014',
    b0='#5888b8', b1='#88b0d8', b2='#38608c', g0='#88b840', g1='#b0dc68', g2='#5c8c28', pk='#28384c',
    rk='#4c5060', r0='#9ca0ac', r1='#c4c8d0', r2='#6c7080', rs='#3c4454',
    ck='#2c4c30', c0='#78c070', c1='#a8e098', c2='#4c9050', cs='#284034', cS='#58c8a0', cR='#f05050', cY='#f8e060',
    xk='#6c4c14', x0='#f0b838', x1='#f8d870', x2='#c08820',
    sk='#3c4c60', s0='#5898c8', s1='#9cc8f0', s2='#8c949c', s3='#c4ccd4',
    st0='#e4ecf4', st1='#b8c4d4', st2='#8c9cb4', mt0='#c84c3c', mt1='#e87c5c',
    ok='#6c3010', o0='#e88838', o1='#f8b868', o2='#b85c20', o3='#fce0a0',
    rf0='#7c8894', rf1='#a0acb8', rf2='#5c6874', bd='#3c3830', ly='#f8d838',
).items()}
EC = {k: hx(v) for k, v in dict(f0='#8a8aa4', f1='#7a7a94', f2='#a0a2bc', f3='#686880',
                                 k0='#f8c048', k1='#fce890', k2='#c88820', kK='#5c3c10', kT='#58d0c0', kt='#a8f0e8').items()}


def _fill(t, c):
    for y in range(t.h):
        for x in range(t.w):
            t.px(x, y, c)


def _specks(t, pts, c, c2=None):
    for (x, y) in pts:
        t.px(x, y, c)
        if c2 is not None:
            t.px(x + 1, y + 1, c2)


# ── 설원 ──
def snground(v):
    """연보랏빛 흰 눈: 바탕 + 듬성한 반짝이 · 옅은 눈 그늘 물결."""
    t = Tile(); _fill(t, SN['s0'])
    for (x, y) in ([(2, 3), (11, 2), (6, 9), (13, 12), (1, 13)] if v == 0 else [(4, 1), (12, 6), (8, 11), (2, 8), (14, 14)]):
        t.px(x, y, SN['s1']); t.px(x + 1, y, SN['s1'])
    for (x, y) in ([(8, 5), (4, 6), (12, 8), (9, 14)] if v == 0 else [(6, 4), (10, 2), (13, 10), (3, 13)]):
        t.px(x, y, SN['s2']); t.px(x + 1, y, SN['s2'])
    if v:
        for x in range(5, 11):
            t.px(x, 7 + (x % 2), SN['s2'])
    return t


SNPINE = [  # 16×24: 위 8줄은 윗칸으로 솟음. 눈 모자 쓴 둥근 소나무 (DP 느낌: 층마다 둥근 눈 덩이 · 아래로 초록이 드러남)
    '......kkkk......',
    '....kkwwwwkk....',
    '...kwwwwwwwsk...',
    '..kwwwwwwwwssk..',
    '..kwwwwwwwsssk..',
    '.kswwwwwssssSsk.',
    '.kgsswsssSSSsgk.',
    '.kggsSSSSgggGgk.',
    'kwwggGGgggGGwwsk',
    'kwwwwgGGgwwwwssk',
    'kswwwwwgwwwwsssk',
    'kgsswwssssssSSgk',
    'kggSsSSSSSSSgggk',
    '.kgggGGgGGGgggk.',
    'kwwwgggGgggwwwsk',
    'kwwwwwwgwwwwwssk',
    'ksswwwwwwwwsssSk',
    'kgSssssssssSSSgk',
    'kggGSSSSSSSSgGgk',
    '.kgggGGGGGGgggk.',
    '..kkkkgttTgkkk..',
    '....hhkttTkhhh..',
    '.....hhkkkhhh...',
    '................',
]


def snpine():
    t = Tile(16, 24)
    t.art(SNPINE, {'k': SN['pk'], 'g': SN['p0'], 'G': SN['p1'], 'w': SN['pw'], 's': SN['ps'], 'S': SN['pS'],
                   't': SN['pt'], 'T': SN['pT'], 'h': SN['s3']})
    return t


def snice(mask):
    """얼어붙은 연못 (걸으면 미끄러짐): 연하늘 얼음 + 밝은 금 · 열린 쪽은 흰 눈 테두리."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            c = SN['i0']
            if (x + 2 * y) % 11 == 0 or (x - y) % 13 == 0:
                c = SN['i1']
            if (x * 3 + y) % 17 == 0:
                c = SN['i2']
            d = edge_dist(x, y, mask, 3)
            if d < 1.0:
                c = SN['s1'] if (x + y) % 3 else SN['s0']
            elif d < 2.0:
                c = SN['iE']
            elif d < 3.0:
                c = SN['iR']
            t.px(x, y, c)
    return t


def snstairs():
    """눈 쌓인 흙 턱 사이 돌계단 (위아래로 오름)."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            k = y % 4
            c = SN['s1'] if k == 0 else SN['s0'] if k == 1 else SN['s2'] if k == 2 else SN['c2']
            if x in (0, 15):
                c = SN['c2']
            elif x in (1, 14):
                c = SN['c0']
            t.px(x, y, c)
    return t


def snrock():
    t = Tile(); t.art(ROCK, {'k': hx('#4c5070'), '1': SN['s1'], '2': hx('#a8acc4'), '3': hx('#7c809c'), 'g': SN['s3']})
    for x in range(4, 12):                  # 위에 쌓인 눈
        for y in range(2, 6):
            if t.get(x, y)[3] and (y < 4 or (x + y) % 2):
                t.px(x, y, SN['s1'] if y < 4 else SN['s2'])
    return t


def snsign():
    t = Tile(); t.art(SIGN, dict(SIGN_PAL, g=SN['s3']))
    for x in range(2, 14):
        if t.get(x, 2)[3]:
            t.px(x, 2, SN['s1'])
    return t


SNMAN = [  # 눈사람 (막힌 칸)
    '................',
    '......kkkk......',
    '.....kwwwwk.....',
    '....kwwewews....',
    '....kwwwwwsk....',
    '....kwwoowsk....',
    '...rrkwwwskrr...',
    '..krrrrrrrrrk...',
    '...kwwwwwwssk...',
    '..kwwwwbwwwssk..',
    '..kwwwwwwwwssk..',
    '..kwwwwbwwwssk..',
    '..kswwwwwwsssk..',
    '...kssssssssk...',
    '....kkkkkkkk....',
    '...hhhhhhhhhh...',
]


def snman():
    t = Tile(); t.art(SNMAN, {'k': hx('#5c6084'), 'w': SN['s1'], 's': SN['s3'], 'e': hx('#28283c'), 'o': hx('#f08838'),
                              'r': hx('#d83c3c'), 'b': hx('#3c3c50'), 'h': SN['s3']})
    return t


def snexit():
    """설원 아래쪽 나가는 길: 발자국이 찍힌 눈길."""
    t = snground(0)
    for (x, y) in [(4, 2), (10, 6), (5, 10), (11, 14)]:
        t.px(x, y, SN['s3']); t.px(x + 1, y, SN['s3']); t.px(x, y + 1, SN['s4']); t.px(x + 1, y + 1, SN['s3'])
    return t


def sncabin():
    """32×40 눈 지붕 오두막 (2×2 칸 + 위로 8px): 두꺼운 눈 지붕 · 통나무 벽 · 문 · 불 켜진 창."""
    t = Tile(32, 40)
    for y in range(4, 22):                    # 지붕 (가운데가 높은 삼각 + 처마)
        half = 3 + (y - 4) * 0.75
        for x in range(32):
            if abs(x - 15.5) <= half + 0.5 and x < 32:
                edge = abs(x - 15.5) > half - 1
                c = SN['cs'] if (x > 15.5 and not edge) else SN['cw']
                if y >= 19:
                    c = SN['s3'] if y == 21 else SN['cs'] if x > 15.5 else SN['cw']
                if edge or y == 4:
                    c = SN['ck']
                t.px(x, y, c)
    for y in range(22, 38):                    # 벽 (통나무 가로줄)
        for x in range(3, 29):
            c = SN['c0'] if (y - 22) % 4 else SN['c2']
            if (y - 22) % 4 == 1:
                c = SN['c1']
            if x in (3, 28):
                c = SN['ck']
            t.px(x, y, c)
    for x in range(1, 31):                     # 처마 밑 그늘
        t.px(x, 21, SN['ck']); t.px(x, 22, SN['cd'])
    for y in range(27, 38):                    # 문
        for x in range(13, 19):
            c = SN['cd'] if x in (13, 18) or y == 27 else hx('#6c4428')
            t.px(x, y, c)
    t.px(17, 33, hx('#f8d838'))
    for (wx, wy) in [(6, 27), (22, 27)]:       # 불 켜진 창
        for y in range(wy, wy + 5):
            for x in range(wx, wx + 5):
                c = SN['ck'] if x in (wx, wx + 4) or y in (wy, wy + 4) else hx('#f8e080') if (x + y) % 3 else hx('#f8c040')
                t.px(x, y, c)
        for x in range(wx - 1, wx + 6):
            t.px(x, wy - 1, SN['cw'])          # 창틀 위 눈
    for x in range(2, 30):
        t.px(x, 38, SN['s3']); t.px(x, 39, SN['s3'] if x % 2 else SN['s2'])
    for x in range(5, 9):                      # 굴뚝 (눈 모자)
        for y in range(2, 10):
            t.px(x, y, SN['ck'] if x in (5, 8) else SN['c2'])
        t.px(x, 1, SN['cw']); t.px(x, 2, SN['cw'])
    return t


# ── 용암 지대 ──
def lvground(v):
    """분홍빛 붉은 바위 바닥 + 흩날린 흰 재."""
    t = Tile(); _fill(t, LV['g0'])
    pts = [(2, 2), (9, 1), (13, 6), (5, 8), (11, 12), (1, 12), (7, 14)] if v == 0 else [(4, 3), (12, 2), (8, 7), (2, 10), (14, 11), (6, 13)]
    for (x, y) in pts:
        t.px(x, y, LV['g2']); t.px(x + 1, y, LV['g1']); t.px(x, y + 1, LV['g3'])
    for (x, y) in ([(10, 9), (3, 5)] if v == 0 else [(10, 14), (13, 8), (5, 1)]):
        t.px(x, y, LV['ash'])
    return t


def lava(f):
    """용암: 주황 바탕 + 밝은 물결 + 노란 거품 (2장)."""
    t = Tile(); _fill(t, LV['l0'])
    for y in range(16):
        for x in range(16):
            w = math.sin((x + f * 4) * math.pi / 5 + y * 0.9)
            if w > 0.82:
                t.px(x, y, LV['l1'])
            elif w < -0.9:
                t.px(x, y, LV['lD'])
    for (x, y) in ([(3, 4), (11, 9), (6, 13)] if f == 0 else [(9, 3), (4, 10), (13, 13)]):
        t.px(x, y, LV['l3']); t.px(x + 1, y, LV['l2']); t.px(x, y - 1, LV['l2'])
    return t


def lava_edge(mask):
    """용암 둘레 (덧그림): 열린 쪽은 바위 테두리 (진한 선 + 밝은 바위)."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            d = edge_dist(x, y, mask, 3)
            if d < 1.0:
                t.px(x, y, LV['r1'])
            elif d < 2.0:
                t.px(x, y, LV['rK'])
            elif d < 3.0:
                t.px(x, y, LV['lD'])
    return t


def lava_corner(corner):
    t = Tile()
    pts = {(0, 0): 'r1', (1, 0): 'rK', (0, 1): 'rK', (1, 1): 'rK', (2, 0): 'lD', (0, 2): 'lD', (2, 1): 'lD', (1, 2): 'lD'}
    for (x, y), c in pts.items():
        X = x if 'w' in corner else 15 - x
        Y = y if 'n' in corner else 15 - y
        t.px(X, Y, LV[c])
    return t


def lvgrass(f=None):
    """재가 앉은 잿빛 풀숲 (만남 칸): 키 큰 풀숲 모양 그대로 · 잿빛."""
    t = Tile()
    rows = TALL
    if f is not None:
        rows = [(r[1:] + '.') if (i < 8 and f == 0) else ('.' + r[:-1]) if (i < 8 and f == 1) else r for i, r in enumerate(TALL)]
    t.art(rows, {'k': LV['gk'], 't': LV['ga'], 'n': LV['gb'], 'L': LV['gc']})
    return t


LVTREE = [  # 16×24 재 덮인 마른 나무 (잎 없음, 가지가 갈라짐)
    '.......k........',
    '..k...k1k...k...',
    '.k1k..k1k..k1k..',
    '..k1k.k1k.k1k...',
    '...k1kk1kk1k..k.',
    'k...k11111k..k1k',
    '1k...k111k..k1k.',
    'k1k..k11dk.k1k..',
    '.k1k.k1ddkk1k...',
    '..k1kk1ddk1k....',
    '...k11dddk1k....',
    '....k1ddddk.....',
    '.....k1ddk......',
    '.....k1ddk......',
    '.....k1ddk......',
    '.....k11dk......',
    '.....k1ddk......',
    '.....k1ddk......',
    '....k11dddk.....',
    '...k11dddddk....',
    '...kkkkkkkkk....',
    '...hhhhhhhhhh...',
    '................',
    '................',
]


def lvtree():
    t = Tile(16, 24); t.art(LVTREE, {'k': LV['tk'], '1': LV['t1'], 'd': LV['t0'], 'h': LV['g3']})
    for (x, y) in [(2, 1), (13, 1), (7, 0), (0, 6), (15, 5)]:      # 가지 끝에 앉은 흰 재
        t.px(x, y, LV['ash'])
    return t


def lvvent(f):
    """화산 분기공 (막힌 칸): 검붉은 바위 고리 + 안쪽 주황 빛 + 피어오르는 김 (2장)."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            r = ((x - 7.5) / 6.5) ** 2 + ((y - 10) / 4.5) ** 2
            if r < 0.35:
                t.px(x, y, LV['vy'] if r < 0.12 else LV['vg'])
            elif r < 0.7:
                t.px(x, y, LV['vk'])
            elif r < 1.0:
                t.px(x, y, LV['v1'] if y < 10 else LV['v0'])
            elif r < 1.25 and y > 9:
                t.px(x, y, LV['g3'])
    puffs = [(5, 4, 2.2), (9, 2, 1.8), (7, 6, 1.6)] if f == 0 else [(8, 4, 2.2), (5, 1, 1.6), (10, 6, 1.5)]
    for (cx, cy, rr) in puffs:
        for y in range(16):
            for x in range(16):
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                if d < rr - 0.6:
                    t.px(x, y, LV['sm'])
                elif d < rr:
                    t.px(x, y, LV['sM'])
    return t


def lvrock():
    t = Tile(); t.art(ROCK, {'k': LV['rK'], '1': LV['g1'], '2': LV['r1'], '3': LV['r0'], 'g': LV['g3']}); return t


def lvsign():
    t = Tile(); t.art(SIGN, dict(SIGN_PAL, g=LV['g3'])); return t


def lvstairs():
    """절벽 사이 바위 계단 (위아래)."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            k = y % 4
            c = LV['g1'] if k == 0 else LV['g0'] if k == 1 else LV['g2'] if k == 2 else LV['r0']
            if x in (0, 15):
                c = LV['rK']
            elif x in (1, 14):
                c = LV['r0']
            t.px(x, y, c)
    return t


def lvexit():
    t = lvground(0)
    for y in range(16):
        for x in range(16):
            if abs(x - 7.5) < 5 and (x + y) % 2 == 0:
                t.px(x, y, LV['g1'])
    return t


# ── 발전소 ──
def plfloor(v):
    """연회색 초록 바닥 타일 (8px 판 · 밝은 위왼쪽 줄 · 어두운 아래오른쪽 줄)."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            gx, gy = x % 8, y % 8
            c = PL['f0']
            if gx == 7 or gy == 7:
                c = PL['f2']
            elif gx == 0 or gy == 0:
                c = PL['f1']
            elif v and (x // 8 + y // 8) % 2 == 0:
                c = PL['f3']
            t.px(x, y, c)
    return t


def plshadow():
    """벽 바로 아래 바닥 그늘 (덧그림, 반투명 대신 점무늬)."""
    t = Tile()
    for y in range(6):
        for x in range(16):
            if y < 3 or (x + y) % 2 == 0:
                t.px(x, y, (0x7c, 0x8c, 0x78, 110))
    return t


def plwall(mask):
    """발전소 벽 (위에서 본 두꺼운 벽): 아래가 벽이면 크림색 윗면 (열린 쪽 진한 테두리),
    아래가 열리면 벽면 = 크림 턱 + 올리브 판 (세로 이음 · 리벳) + 아래 진한 띠."""
    t = Tile()
    N, E, S, W = mask & 1, mask & 2, mask & 4, mask & 8
    if S:
        _fill(t, PL['cap'])
        for y in range(16):
            for x in range(16):
                if (not W and x == 0) or (not E and x == 15) or (not N and y == 0):
                    t.px(x, y, PL['capK'])
                elif (not W and x == 1) or (not N and y == 1):
                    t.px(x, y, PL['capL'])
        return t
    y0 = 0
    for y in range(16):
        for x in range(16):
            if y < 3:
                c = PL['capK'] if (y == 0 and not N) else PL['capL'] if y == 1 else PL['cap']
                if y == 2:
                    c = PL['capK']
            elif y == 3:
                c = PL['wb']
            elif y >= 14:
                c = PL['wt']
            else:
                c = PL['w0']
                if y == 4:
                    c = PL['w1']
                if x % 8 == 7:
                    c = PL['w2']
                elif x % 8 == 0:
                    c = PL['w1']
                if x % 8 in (3, 4) and y in (5, 12):
                    c = PL['wr']
            t.px(x, y, c)
    for y in range(16):
        if not W:
            t.px(0, y, PL['capK'] if y < 3 else PL['wt'])
        if not E:
            t.px(15, y, PL['capK'] if y < 3 else PL['wt'])
    return t


def plpipe(green):
    """벽에 박힌 세로 관 (덧그림, 칸 위아래로 이어짐)."""
    t = Tile()
    a, b, c = (PL['g0'], PL['g1'], PL['g2']) if green else (PL['b0'], PL['b1'], PL['b2'])
    for y in range(16):
        for x in range(5, 11):
            col = PL['pk'] if x in (5, 10) else b if x == 6 else c if x == 9 else a
            if y % 8 == 0 and 5 < x < 10:
                col = c
            t.px(x, y, col)
    return t


def plrack():
    """기계 선반 (막힌 칸): 회색 틀 · 칸마다 색 다른 부품."""
    t = Tile()
    for y in range(1, 15):
        for x in range(1, 15):
            c = PL['r0']
            if x in (1, 14) or y in (1, 14):
                c = PL['rk']
            elif y in (5, 9, 13):
                c = PL['r1']
            elif y in (4, 8, 12):
                c = PL['rs']
            t.px(x, y, c)
    parts = [(3, 2, 'cS'), (7, 2, 'r2'), (10, 2, 'cR'), (4, 6, 'cY'), (8, 6, 'cS'), (11, 6, 'r2'), (3, 10, 'r2'), (6, 10, 'cR'), (10, 10, 'cS')]
    for (x, y, k) in parts:
        for dx in range(2):
            for dy in range(2):
                t.px(x + dx, y + dy, PL[k])
    for x in range(2, 16):
        t.px(x, 15, PL['sh'])
    return t


def plcon(f):
    """초록 발전기 · 계기판 (막힌 칸): 둥근 초록 몸통 + 화면 + 깜빡이는 불 (2장)."""
    t = Tile()
    for y in range(1, 15):
        for x in range(2, 14):
            c = PL['c0']
            if x in (2, 13) or y in (1, 14):
                c = PL['ck']
            elif x == 3 or y == 2:
                c = PL['c1']
            elif x == 12 or y == 13:
                c = PL['c2']
            t.px(x, y, c)
    for y in range(4, 8):
        for x in range(5, 11):
            t.px(x, y, PL['cs'] if (x + y + f) % 3 else PL['cS'])
    for i, k in enumerate(['cR', 'cY', 'cS']):
        on = (i + f) % 2 == 0
        t.px(5 + i * 2, 10, PL[k] if on else PL['c2']); t.px(5 + i * 2, 11, PL['c2'])
    for x in range(3, 16):
        t.px(x, 15, PL['sh'])
    return t


def plcrate():
    t = Tile()
    for y in range(3, 14):
        for x in range(2, 14):
            c = PL['x0']
            if x in (2, 13) or y in (3, 13):
                c = PL['xk']
            elif y == 4:
                c = PL['x1']
            elif x == 12 or y == 12:
                c = PL['x2']
            elif y == 8:
                c = PL['x2']
            t.px(x, y, c)
    for x in range(3, 15):
        t.px(x, 14, PL['sh'])
    return t


def plswitch():
    """바닥 스위치 (걸을 수 있음): 회색 받침 + 파란 단추."""
    t = plfloor(0)
    for y in range(16):
        for x in range(16):
            r = ((x - 7.5) / 5.5) ** 2 + ((y - 8) / 4.5) ** 2
            if r < 0.4:
                t.px(x, y, PL['s1'] if (x < 7 and y < 8) else PL['s0'])
            elif r < 0.6:
                t.px(x, y, PL['sk'])
            elif r < 1.0:
                t.px(x, y, PL['s3'] if y < 8 else PL['s2'])
    return t


def plstairs():
    """다른 층으로 가는 밝은 계단."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            k = y % 4
            c = PL['st0'] if k < 2 else PL['st1'] if k == 2 else PL['st2']
            if x in (0, 15):
                c = PL['wt']
            t.px(x, y, c)
    return t


def plexit():
    """밖으로 나가는 문 앞 깔개."""
    t = plfloor(0)
    for y in range(3, 15):
        for x in range(2, 14):
            c = PL['mt0'] if x in (2, 13) or y in (3, 14) else PL['mt1'] if (x + y) % 4 else PL['mt0']
            t.px(x, y, c)
    return t


def plgen():
    """32×40 큰 주황 발전기 (2×2 칸 + 위로 8px): 위에서 비스듬히 본 둥근 원통 (타원 윗면 + 가운데 축 + 빛나는 코일) ·
    몸통 고리 3줄 · 옆 관 · 계기판 · 회색 받침판."""
    t = Tile(32, 40)
    K = PL['ok']
    for y in range(30, 40):                    # 받침판 (위에서 본 회색 판)
        for x in range(0, 32):
            c = PL['r1'] if y == 30 else PL['r0'] if y < 38 else PL['r2']
            if x in (0, 31) or y == 39:
                c = PL['rk']
            t.px(x, y, c)
    cx, rx = 15.5, 13.5
    for y in range(9, 36):                     # 몸통 (원통 옆면, 아래는 둥근 타원)
        for x in range(32):
            dx = (x - cx) / rx
            if abs(dx) > 1:
                continue
            bottom = 31 + 4 * math.sqrt(max(0, 1 - dx * dx))
            if y > bottom:
                continue
            c = PL['o1'] if dx < -0.5 else PL['o0'] if dx < 0.35 else PL['o2']
            if y in (16, 22, 28):
                c = PL['o2'] if dx > -0.6 else PL['o0']
            if y in (17, 23, 29) and dx < 0.2:
                c = PL['o3']
            if abs(dx) > 0.93 or y >= bottom - 0.8:
                c = K
            t.px(x, y, c)
    for y in range(3, 16):                     # 윗면 (타원) + 가운데 축
        for x in range(32):
            e = ((x - cx) / rx) ** 2 + ((y - 9) / 5.5) ** 2
            if e <= 1:
                c = PL['o3'] if e < 0.35 else PL['o1'] if e < 0.8 else PL['o0']
                if e > 0.86:
                    c = K
                t.px(x, y, c)
    for y in range(0, 10):                     # 코일 기둥 (빛나는 노란 고리)
        for x in range(13, 19):
            c = K if x in (13, 18) or y == 0 else PL['ly'] if y % 2 else PL['o3']
            t.px(x, y, c)
    for y in range(19, 27):                    # 옆 관 (오른쪽)
        t.px(29, y, PL['b2']); t.px(30, y, PL['b0']); t.px(31, y, PL['pk'])
    for y in range(22, 27):                    # 계기판
        for x in range(10, 22):
            t.px(x, y, K if x in (10, 21) or y in (22, 26) else PL['cs'])
    t.px(12, 24, PL['cS']); t.px(15, 24, PL['cY']); t.px(18, 24, PL['cR'])
    return t


def plbuild():
    """96×88 발전소 단지 (사파리존 바깥 왼쪽 위, 6×5 칸 + 위로 8px, H = 왼쪽 아래 칸 · 문 = 넷째 칸 맨 아래 줄 D):
    뒤 = 냉각탑 (김) · 빨강/흰 굴뚝 · 철탑 + 전선, 앞 = 콘크리트 본관 (짙은 지붕 · 환기구 · 노랑/검정 경고 띠 · 큰 셔터 문 + 번개 간판),
    왼쪽 앞 = 울타리 친 변압기 마당 (변압기 · 애자), 맨 앞 = 철망 울타리 (문 앞만 열림)."""
    t = Tile(96, 88)
    K = hx('#34343c')
    c0, c1, c2, c3 = hx('#c8c8c0'), hx('#e4e4dc'), hx('#a4a49c'), hx('#7c7c74')
    r0, r1, r2 = hx('#5c6c80'), hx('#7c8ca0'), hx('#44505e')
    Y, B, R, Wt = hx('#f8d030'), hx('#2c2c2c'), hx('#d04838'), hx('#f4f4f4')
    st0, st1 = hx('#f8f8fc'), hx('#d4d8e4')
    px = t.px

    def rect(x0, y0, x1, y1, col, edge=None):
        for y in range(y0, y1):
            for x in range(x0, x1):
                e = edge is not None and (x in (x0, x1 - 1) or y in (y0, y1 - 1))
                px(x, y, edge if e else col)

    # 바닥 콘크리트 마당 (본관 · 변압기 마당 아래)
    for y in range(44, 86):
        for x in range(2, 94):
            px(x, y, hx('#b0b0a4') if (x // 8 + y // 8) % 2 else hx('#bcbcb0'))
    # 냉각탑 (왼쪽 뒤): 허리가 잘록한 콘크리트 통 + 꼭대기 김
    for y in range(6, 46):
        k = (y - 6) / 40
        half = 15 - 5 * math.sin(k * math.pi) * 0.9 + (2 if y > 40 else 0)
        for x in range(0, 40):
            dx = x - 19.5
            if abs(dx) <= half:
                edge = abs(dx) > half - 1 or y == 6
                s = dx / half
                col = c1 if s < -0.45 else c0 if s < 0.35 else c2
                if (y - 6) % 9 == 8:
                    col = c3 if s > 0 else c2
                px(x, y, K if edge else col)
    for y in range(6, 9):                       # 냉각탑 입구 (어두운 속)
        for x in range(9, 31):
            if t.get(x, y) != K:
                px(x, y, hx('#5c5c64'))
    for (cx, cy, rr) in [(14, 4, 4.5), (22, 2, 5.5), (29, 5, 4), (18, 0, 4)]:   # 김 (윗칸으로 솟음)
        for y in range(0, 12):
            for x in range(0, 40):
                d = ((x - cx) ** 2 + ((y - cy) * 1.3) ** 2) ** 0.5
                if d < rr - 1:
                    px(x, y, st0)
                elif d < rr:
                    px(x, y, st1)
    # 굴뚝 (빨강/흰 줄)
    for y in range(2, 40):
        for x in range(44, 51):
            col = K if x in (44, 50) or y == 2 else (R if ((y - 2) // 6) % 2 == 0 else Wt)
            if x == 45 and col not in (K,):
                col = hx('#f08070') if col == R else hx('#ffffff')
            px(x, y, col)
    # 철탑 (오른쪽 뒤): 격자 탑 + 팔 + 전선
    for y in range(4, 44):
        w = 2 + (y - 4) * 0.16
        for x in (round(87 - w), round(87 + w)):
            px(x, y, hx('#5c606c'))
        if y % 6 == 0:
            for x in range(round(87 - w), round(87 + w) + 1):
                px(x, y, hx('#7c808c'))
        if y % 6 == 3:
            px(87, y, hx('#7c808c'))
    for x in range(78, 96):
        px(x, 10, hx('#5c606c')); px(x, 18, hx('#5c606c'))
    for x in (79, 95, 80, 94):
        px(x, 11, hx('#e8e8f0')); px(x, 19, hx('#e8e8f0'))
    for x in range(52, 80):                      # 전선 (본관 지붕으로 처짐)
        sag = round(((x - 66) / 14.0) ** 2 * 4)
        px(x, 15 + 4 - sag, K); px(x, 23 + 4 - sag, K)
    # 본관: 지붕 (짙은 청회색 · 환기구) + 경고 띠 + 콘크리트 벽
    rect(22, 34, 94, 50, r0, K)
    for y in range(35, 49):
        for x in range(23, 93):
            if (y - 35) % 4 == 0:
                px(x, y, r1)
            if x > 84:
                px(x, y, r2 if (y - 35) % 4 else r0)
    for (vx, vy) in [(30, 38), (40, 38), (70, 38)]:
        rect(vx, vy, vx + 7, vy + 6, hx('#a0a8b4'), K)
        for x in range(vx + 1, vx + 6):
            px(x, vy + 2, hx('#58606c')); px(x, vy + 4, hx('#58606c'))
    for x in range(22, 94):                      # 경고 띠
        for y in range(50, 54):
            px(x, y, K if y in (50, 53) else (Y if ((x + y) // 3) % 2 == 0 else B))
    rect(22, 54, 94, 86, c0, K)
    for y in range(55, 85):
        for x in range(23, 93):
            if x % 12 == 10:
                px(x, y, c2)
            elif x % 12 == 11:
                px(x, y, c1)
            if y == 55:
                px(x, y, c1)
            if y >= 82:
                px(x, y, c3)
    for (wx, wy) in [(26, 58), (74, 58), (84, 58)]:   # 창 (초록빛 유리)
        rect(wx, wy, wx + 7, wy + 6, hx('#88d8b0'), K)
        px(wx + 1, wy + 1, hx('#e0fff0')); px(wx + 2, wy + 1, hx('#e0fff0'))
    # 번개 간판 (문 위)
    rect(48, 56, 64, 64, Y, K)
    BOLT = ['....kk', '...kk.', '..kkkk', '...kk.', '..kk..', '.kk...']
    for j, r in enumerate(BOLT):
        for i, ch in enumerate(r):
            if ch == 'k':
                px(53 + i, 57 + j, B)
    # 큰 셔터 문 (넷째 칸 = x 48..63, 맨 아래 줄)
    rect(47, 65, 65, 88, hx('#606874'), K)
    for y in range(66, 88):
        for x in range(48, 64):
            px(x, y, hx('#8890a0') if (y - 66) % 3 == 0 else hx('#6c7484'))
    for x in range(48, 64):
        px(x, 86, hx('#3c4048')); px(x, 87, hx('#3c4048'))
    # 변압기 마당 (왼쪽 앞): 변압기 2대 + 애자
    for (tx, ty) in [(4, 56), (14, 56)]:
        rect(tx, ty, tx + 8, ty + 12, hx('#8c9c8c'), K)
        for y in range(ty + 2, ty + 11, 2):
            px(tx + 1, y, hx('#6c7c6c')); px(tx + 6, y, hx('#6c7c6c'))
        for i in range(3):
            px(tx + 2 + i * 2, ty - 1, hx('#e8e8f0')); px(tx + 2 + i * 2, ty - 2, hx('#b06040'))
        rect(tx + 2, ty + 4, tx + 6, ty + 7, Y, K)
    for x in range(8, 48):                       # 변압기 → 본관 전선
        px(x, 52 - round(((x - 28) / 20.0) ** 2 * -3 + 3), K)
    # 철망 울타리: 변압기 마당 둘레 + 맨 앞 (문 앞만 열림)
    def fence_h(x0, x1, y):
        for x in range(x0, x1):
            px(x, y, hx('#5c6068')); px(x, y + 5, hx('#5c6068'))
            for yy in range(y + 1, y + 5):
                if (x + yy) % 3 == 0:
                    px(x, yy, hx('#8c909c'))
            if x % 6 == 0:
                for yy in range(y - 1, y + 7):
                    px(x, yy, hx('#44484f'))
    fence_h(1, 21, 50)
    for y in range(50, 82):
        px(1, y, hx('#5c6068')); px(21, y, hx('#5c6068'))
    fence_h(1, 46, 80)
    fence_h(66, 95, 80)
    return t


# ── 용의 굴 ──
def efloor(v):
    t = Tile(); _fill(t, EC['f0'])
    pts = [(2, 3), (9, 1), (13, 6), (5, 9), (11, 12), (1, 13), (7, 14)] if v == 0 else [(4, 2), (12, 3), (8, 7), (2, 10), (14, 11), (6, 13)]
    for (x, y) in pts:
        t.px(x, y, EC['f1']); t.px(x + 1, y, EC['f2'])
    for (x, y) in ([(10, 9), (3, 6)] if v == 0 else [(10, 14), (13, 8)]):
        t.px(x, y, EC['f3']); t.px(x + 1, y, EC['f1'])
    return t


ECRYSTAL = [  # 빛나는 용의 수정 (막힌 칸): 호박빛 큰 기둥 + 청록 작은 기둥
    '................',
    '.......k........',
    '......k1k.......',
    '.....k112k......',
    '.....k1102k.....',
    '..k..k1102k.....',
    '.ktk.k1002k..k..',
    '.kTtkk1002k.kTk.',
    '.kTtkk1002kktTk.',
    '.kTtk.k002kkttk.',
    '.kTtk.k02k.kttk.',
    '..kkkkk02kkkkk..',
    '...kgggkkggggk..',
    '....gggggggggg..',
    '................',
    '................',
]


def ecrystal():
    t = Tile(); t.art(ECRYSTAL, {'k': EC['kK'], '1': EC['k1'], '0': EC['k0'], '2': EC['k2'], 'T': EC['kt'], 't': EC['kT'], 'g': EC['f3']})
    return t


def eladder():
    t = efloor(1)
    W0, W1, WK = hx('#e8b478'), hx('#c88c50'), hx('#5c3820')
    for y in range(16):
        for x in (4, 11):
            t.px(x - 1, y, WK); t.px(x, y, W0); t.px(x + 1, y, W1); t.px(x + 2, y, WK)
    for y in range(2, 15, 3):
        for x in range(5, 11):
            t.px(x, y, W0); t.px(x, y + 1, WK)
    return t


def bstair():
    """사파리존 호수 다리 가운데 아래로 내려가는 계단 (다리 위 덧그림): 나무 틀 + 어두운 계단."""
    t = Tile()
    for y in range(1, 15):
        for x in range(2, 14):
            if x in (2, 13) or y in (1, 14):
                c = C['bK']
            elif y < 4:
                c = C['b2']
            else:
                k = (y - 4) % 3
                shade = (y - 4) / 10
                c = hx('#8c7a6a') if k == 0 and shade < 0.5 else hx('#5c4c40') if k == 0 else hx('#3c3028') if shade > 0.6 else hx('#4c3c30')
            t.px(x, y, c)
    for y in range(2, 14):
        t.px(3, y, C['b1']); t.px(12, y, C['b2'])
    return t


def more_tiles():
    out = [('snground0', snground(0)), ('snground1', snground(1))]
    for m in range(16):
        for v in range(3):
            out.append((f'swall{m}_{v}', wall('s', m, v)))
    for c in ('nw', 'ne', 'sw', 'se'):
        out.append((f'swallc{c}', wall_corner('s', c)))
    for m in range(16):
        out.append((f'snice{m}', snice(m)))
    out += [('snstairs', snstairs()), ('snrock', snrock()), ('snsign', snsign()), ('snman', snman()), ('snexit', snexit())]
    out += [('lvground0', lvground(0)), ('lvground1', lvground(1))]
    for m in range(16):
        for v in range(3):
            out.append((f'lwall{m}_{v}', wall('l', m, v)))
    for c in ('nw', 'ne', 'sw', 'se'):
        out.append((f'lwallc{c}', wall_corner('l', c)))
    out += [('lava0', lava(0)), ('lava1', lava(1))]
    for m in range(16):
        out.append((f'lavae{m}', lava_edge(m)))
    for c in ('nw', 'ne', 'sw', 'se'):
        out.append((f'lavac{c}', lava_corner(c)))
    out += [('lvgrass', lvgrass()), ('lvgrassR0', lvgrass(0)), ('lvgrassR1', lvgrass(1)), ('lvvent0', lvvent(0)), ('lvvent1', lvvent(1)),
            ('lvrock', lvrock()), ('lvsign', lvsign()), ('lvstairs', lvstairs()), ('lvexit', lvexit())]
    out += [('plfloor0', plfloor(0)), ('plfloor1', plfloor(1)), ('plshadow', plshadow())]
    for m in range(16):
        out.append((f'plw{m}', plwall(m)))
    vt = Tile(); _fill(vt, PL['void'])
    out += [('plvoid', vt), ('plpipeB', plpipe(False)), ('plpipeG', plpipe(True)), ('plrack', plrack()), ('plcon0', plcon(0)), ('plcon1', plcon(1)),
            ('plcrate', plcrate()), ('plswitch', plswitch()), ('plstairs', plstairs()), ('plexit', plexit()), ('plsign', plsign_t())]
    out += [('efloor0', efloor(0)), ('efloor1', efloor(1))]
    for m in range(16):
        for v in range(3):
            out.append((f'ewall{m}_{v}', wall('e', m, v)))
    for c in ('nw', 'ne', 'sw', 'se'):
        out.append((f'ewallc{c}', wall_corner('e', c)))
    out += [('erock', rock_art(9, 7, 'e')), ('eboulder', rock_art(14, 12, 'e')), ('ecrystal', ecrystal()), ('eladder', eladder()), ('bstair', bstair())]
    return out


def plsign_t():
    t = Tile(); t.art(SIGN, dict(SIGN_PAL, g=PL['sh'])); return t


# ─────────── 0050: 전설의 특별한 곳 (꿈의 섬 · 성검의 숲 · 용의 굴 깊은 곳 · 별의 제단 · 고대 유적) ───────────
# 3세대 느낌으로 새로 그린 덧그림 (원본 타일을 베끼지 않음). 이름:
#   moon<0-1>   초승달 꽃 (꿈의 섬, 걸을 수 있는 장식, 2장 흔들림) · grac<A|B>  그라시데아 꽃 (성검의 숲 꽃밭)
#   eladderD    용의 굴 바닥 구멍 + 내려가는 사다리 · ustar  별의 제단 금빛 별 무늬 (발판 위 덧그림)
#   dstairs     사막 유적 바닥의 내려가는 돌계단
#   tapu 16×32  수호신의 돌기둥 (꿈의 섬, 막힌 칸, 윗칸으로 솟음) · swordst 16×24  검이 꽂힌 바위 (성검의 숲, 막힌 칸)
LG = {k: hx(v) for k, v in dict(
    mk='#5c3c8c', m0='#c8a8f8', m1='#eedcff', m2='#9c78e0', mc='#fff6a8', mC='#f0c848',      # 초승달 꽃 (연보라 + 노란 속)
    gk='#a83868', g0='#f890c0', g1='#ffd0e4', g2='#d8609c', gc='#fff8f0',                      # 그라시데아 (분홍 + 흰 속)
    tk='#3c2c20', t0='#b08860', t1='#d4ac80', t2='#86603c', t3='#5c4028',                      # 돌기둥 나무색 돌
    ty='#f8c838', tY='#c88c18', tr='#e05038', tb='#3878c8', te='#202028', tw='#fff8e0',         # 탈 무늬 (노랑 · 빨강 · 파랑)
    rk='#3c4050', r0='#9ca4b4', r1='#c8d0dc', r2='#6c7488', r3='#e4ecf4',                      # 바위 (회색)
    bk='#404858', b0='#e8f0f8', b1='#b8c4d4', b2='#8090a8', hk='#6c4c10', h0='#f8d048', h1='#c89820', hg='#58c8a8',  # 칼날 · 손잡이 · 보석
    sk='#8c6418', s0='#f8d860', s1='#fff4b0', s2='#d0a030',                                    # 별 무늬 (금빛)
).items()}

MOON = [   # 초승달 모양 꽃잎 두 송이 + 잎 (투명 바탕)
    '................',
    '...mmm..........',
    '..m11Mm.........',
    '.m1cc0Mm...mmm..',
    '.mc0000m..m11Mm.',
    '.mC0000m.m1cc0Mm',
    '..mcc0m..mc0000m',
    '...mmmm..mC0000m',
    '....l.....mcc0m.',
    '....l......mmmm.',
    '..lLl.......l...',
    '..lLLl..l...l...',
    '...llll.lLl.l...',
    '....lll.lLLll...',
    '.....gggggggg...',
    '................',
]


def moon(f):
    t = Tile()
    pal = {'m': LG['mk'], '1': LG['m1'], '0': LG['m0'], 'M': LG['m2'], 'c': LG['mc'], 'C': LG['mC'],
           'l': C['lf'], 'L': C['lL'], 'g': C['g2']}
    rows = MOON
    if f:   # 2장째: 꽃 머리가 1px 기울어짐
        rows = [(r[1:] + '.') if i < 10 else r for i, r in enumerate(MOON)]
    t.art(rows, pal)
    return t


GRAC = [   # 그라시데아: 다섯 장 꽃잎 + 흰 속 (투명 바탕)
    '................',
    '......kk........',
    '....kk11kk......',
    '...k1001k0k.....',
    '..k1k00kk00k....',
    '..k10kcck00k....',
    '...k0kcckk0k....',
    '..k100kk002k....',
    '..k1002k022k....',
    '...kk22kk2k.....',
    '.....kkskk......',
    '......s.........',
    '...lLls.lLl.....',
    '...llLs.Lll.....',
    '....lllslll.....',
    '................',
]


def grac(which):
    t = Tile()
    pal = {'k': LG['gk'], '1': LG['g1'], '0': LG['g0'], '2': LG['g2'], 'c': LG['gc'], 's': C['st'], 'l': C['lf'], 'L': C['lL']}
    if which == 'B':   # 둘째 무늬: 조금 진한 분홍 · 오른쪽으로 2px
        pal.update({'1': LG['g0'], '0': LG['g2'], '2': LG['gk']})
        t.art(GRAC, pal, 3, 1)
    else:
        t.art(GRAC, pal, 1, 0)
    return t


def eladder_down():
    """용의 굴 바닥 구멍 + 아래로 내려가는 사다리 (efloor 바탕)."""
    t = efloor(0)
    for y in range(2, 15):
        for x in range(2, 14):
            edge = x in (2, 13) or y in (2, 14)
            t.px(x, y, hx('#2a2c3c') if edge else hx('#0c0c14'))
    for x in range(3, 13):
        t.px(x, 3, hx('#3c3e54'))      # 구멍 안쪽 위 턱 (깊어 보이게)
    W0, W1, WK = hx('#e8b478'), hx('#c88c50'), hx('#5c3820')
    for y in range(1, 14):
        for x in (4, 11):
            t.px(x - 1, y, WK); t.px(x, y, W0); t.px(x + 1, y, W1); t.px(x + 2, y, WK)
    for y in range(3, 13, 3):
        for x in range(5, 11):
            t.px(x, y, W0); t.px(x, y + 1, WK)
    return t


def ustar():
    """별의 제단 무늬 (발판 위 덧그림): 금빛 둥근 테 + 가운데 다섯 꼭지 별."""
    t = Tile()
    for y in range(16):
        for x in range(16):
            d = ((x - 7.5) ** 2 + (y - 7.5) ** 2) ** 0.5
            if 6.2 <= d < 7.2:
                t.px(x, y, LG['s2'] if (x + y) % 3 else LG['s0'])
            elif 7.2 <= d < 7.9:
                t.px(x, y, LG['sk'])
    STAR = [
        '.......k.......',
        '......k1k......',
        '......k1k......',
        '.kkkkk101kkkkk.',
        '..k1110001222k.',
        '...k10000022k..',
        '....k000002k...',
        '....k002002k...',
        '...k02k.k22k...',
        '...k2k...k2k...',
        '...kk.....kk...',
    ]
    t.art(STAR, {'k': LG['sk'], '1': LG['s1'], '0': LG['s0'], '2': LG['s2']}, 0, 2)
    return t


def dstairs():
    """사막 유적 바닥의 아래로 내려가는 돌계단: 사암 테두리 · 내려갈수록 좁고 어두운 디딤판 (앞 턱은 밝게) · 양옆 벽 그늘."""
    t = druin(0)
    for y in range(1, 16):                       # 사암 틀
        for x in range(1, 15):
            if x in (1, 14) or y == 1:
                t.px(x, y, RUIN['c3'])
            elif y == 2:
                t.px(x, y, RUIN['c2'])
    steps = [(3, RUIN['f2'], RUIN['f0']), (6, RUIN['f0'], RUIN['fg']), (9, RUIN['c2'], hx('#7c5434')),
             (12, hx('#7c5434'), hx('#4c321c'))]
    for i, (y0, lip, face) in enumerate(steps):
        x0, x1 = 3 + i, 12 - i                   # 내려갈수록 좁아짐
        for y in range(y0, y0 + 3):
            for x in range(2, 14):
                if x < x0 or x > x1:
                    t.px(x, y, hx('#5c3c24') if (x < x0 and x == x0 - 1) or (x > x1 and x == x1 + 1) else hx('#3c2814'))
                else:
                    t.px(x, y, lip if y == y0 else face)
    for y in range(15, 16):
        for x in range(2, 14):
            t.px(x, y, hx('#24180c'))
    return t


def tapu():
    """16×32 수호신의 돌기둥: 받침 · 나무색 기둥 (새긴 줄 · 빨강 파랑 무늬) · 위에 세 갈래 노란 볏 + 짙은 탈 (비스듬한 흰 눈 · 이빨 입)."""
    t = Tile(16, 32)
    for y in range(27, 32):                      # 받침돌
        for x in range(2, 14):
            edge = x in (2, 13) or y in (27, 31)
            t.px(x, y, LG['tk'] if edge else LG['t1'] if y == 28 else LG['t0'] if x < 10 else LG['t2'])
    for y in range(16, 28):                      # 기둥
        for x in range(4, 12):
            c = LG['tk'] if x in (4, 11) else LG['t1'] if x <= 5 else LG['t2'] if x >= 9 else LG['t0']
            if y in (19, 25) and 4 < x < 11:
                c = LG['t3']
            t.px(x, y, c)
    for y in range(20, 25):                      # 무늬 (빨강 · 파랑 마름모)
        d = abs(y - 22)
        for x in range(8 - (2 - d), 8 + (2 - d)):
            t.px(x, y, LG['tr'] if x < 8 else LG['tb'])
    CREST = [   # 세 갈래 볏 (y 0..6)
        '...k...kk...k...',
        '..kyk..kyk..kyk.',
        '..kyyk.kyk.kyyk.',
        '...kyykyyykyyk..',
        '....kyyyyyyyk...',
        '....kYyyyyyYk...',
        '...kkkkkkkkkkk..',
    ]
    t.art(CREST, {'k': LG['tY'], 'y': LG['ty'], 'Y': LG['tw']})
    MASK = [    # 탈 (y 6..16)
        '...kkkkkkkkkk...',
        '..kMMMMMMMMMMk..',
        '..kMwwMMMMwwMk..',
        '..kMMweMMewMMk..',
        '..kMrMMMMMMrMk..',
        '..kMMMMddMMMMk..',
        '..kMkkkkkkkkMk..',
        '..kMkwkwkwkkMk..',
        '..kMkkkkkkkkMk..',
        '...kMMMMMMMMk...',
        '....kkkkkkkk....',
    ]
    t.art(MASK, {'k': LG['tk'], 'M': LG['t3'], 'w': LG['tw'], 'e': LG['te'], 'r': LG['tr'], 'd': LG['t2']}, 0, 6)
    for y in range(18, 32):
        t.px(14, y, hx('#c8a868'))               # 그림자 (모래 위)
    return t


def swordst():
    """16×24 검이 꽂힌 바위: 모난 회색 바위 (왼쪽 위 빛 · 오른쪽 아래 그늘 · 금) + 은빛 칼날 + 금빛 가로대 · 청록 보석."""
    t = Tile(16, 24)
    ROCK_ = [   # y 11..23
        '.....kkkkk......',
        '...kk13311kk....',
        '..k1133311100k..',
        '.k113331110002k.',
        '.k133311100022k.',
        'k1333111000222k.',
        'k1331110002222k.',
        'k1311100k02222kk',
        'k111000k0022222k',
        '.k1000k00222222k',
        '.k00000022222kk.',
        '..kkk000222kk...',
        '.....kkkkkk.....',
    ]
    t.art(ROCK_, {'k': LG['rk'], '1': LG['r3'], '3': LG['r1'], '0': LG['r0'], '2': LG['r2']}, 0, 11)
    for y in range(4, 14):                       # 칼날 (아래가 바위에 박힘)
        t.px(6, y, LG['bk']); t.px(7, y, LG['b0']); t.px(8, y, LG['b1']); t.px(9, y, LG['bk'])
    for x in range(3, 13):                       # 가로대
        t.px(x, 3, LG['hk']); t.px(x, 5, LG['hk'])
        t.px(x, 4, LG['h0'] if x < 8 else LG['h1'])
    t.px(2, 4, LG['hk']); t.px(13, 4, LG['hk'])
    t.px(7, 4, LG['hg']); t.px(8, 4, LG['hg'])
    for y in range(0, 3):                        # 자루
        t.px(6, y, LG['hk']); t.px(7, y, LG['h0'] if y == 0 else LG['h1']); t.px(8, y, LG['h1']); t.px(9, y, LG['hk'])
    return t


def legend_tiles():
    return [('moon0', moon(0)), ('moon1', moon(1)), ('gracA', grac('A')), ('gracB', grac('B')),
            ('eladderD', eladder_down()), ('ustar', ustar()), ('dstairs', dstairs())]


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
    tiles += more_tiles()            # 0048: 맨 뒤에 붙임 → 앞 타일 자리 그대로
    tiles += legend_tiles()          # 0050: 그 뒤에 → 앞 타일 자리 그대로
    tree = Tile(16, 24); tree.art(TREE, TREE_PAL)

    cols = 16
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * TS, rows * TS + 32 + 88), CLEAR)
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
    y2 = rows * TS + 32                                 # 0048: 둘째 줄 큰 그림 (설원 · 용암 · 발전소)
    for name, im, x in [('snpine', snpine(), 0), ('lvtree', lvtree(), 16), ('sncabin', sncabin(), 32), ('plgen', plgen(), 64), ('plbuild', plbuild(), 96),
                        ('tapu', tapu(), 192), ('swordst', swordst(), 208)]:   # 0050: 수호신의 돌기둥 16×32 · 검이 꽂힌 바위 16×24
        sheet.paste(im.im, (x, y2))
        idx[name] = [x, y2, im.w, im.h]
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
