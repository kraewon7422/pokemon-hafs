"""학교 지도 픽셀아트 v4 (3/4 탑다운 RPG 마을 스타일) → web/img/map.png (288x480 원본 해상도)

배치: 네이버 지도 항공사진 2장(2026-10-28, 북쪽 위)을 반시계 90° 돌려 따라 그림
      (사진 동쪽 = 지도 위, 운동장 = 오른쪽 아래, 기숙사 = 왼쪽 위, 정문 = 왼쪽 가운데).
  - 교사동: 회색 지붕 4개 날개가 큰 타일 광장(월드플라자)을 둘러쌈. 위쪽 날개 = D홀(뒤에 초록 지붕 체육관),
    왼쪽 = P홀, 오른쪽 = C홀. 광장은 아래쪽(운동장 쪽)으로 열려 붉은 벽돌 테라스·반원 잔디 둔덕·계단으로 이어짐
  - V홀: 휘어진(부채꼴) 긴 건물, 구름다리로 D홀 뒤-왼쪽 끝과 연결
  - LUX홀: 동심원 돔 건물 + D/P 모서리로 이어지는 1층 직사각형
  - 야외극장: C–D 뒤(오른쪽)의 큰 원형 극장 + 흰 반원 차양 / 야외공연장: 숲속 작은 원형 극장(파란 좌석, 붉은 바닥)
  - 정문: 왼쪽 가운데로 좁은 길이 들어옴. 정문 → 붉은 벽돌 보행로가 교사동까지 곧게, 차도는 운동장 쪽으로 휘어 내려감,
    또 다른 길은 기숙사(위)로
  - 생태연못: 벽돌 보행로와 V홀 사이 정원(물·붉은 단풍·굽은 길)
  - 기숙사: A동·B동 긴 평행 두 동(사이 연결 통로), A동 옆 테니스장, B동 옆 회색 농구장
  - 운동장: 흙, 왼쪽 가장자리 흰 천막 스탠드, 옆에 밭
  - 색: 주황 벽돌 + 청록 유리 + 회색 지붕 (사진/나무위키)
v1(블록), v2(동쪽 도로), v3(학생 설명만 반영)은 git 기록에 있다.

사용법:  python tools/draw_map.py      (288x480 원본 크기로 저장. 라벨·핀 겹침 검사 출력)
         PIN_PREVIEW=out.png python tools/draw_map.py   (핀을 찍은 3배 미리보기도 저장)
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
W, H = 288, 480
rnd = random.Random(5)

img = Image.new('RGB', (W, H))
d = ImageDraw.Draw(img)
d.fontmode = '1'
FONT = ImageFont.truetype(os.path.join(HERE, 'Galmuri11.ttf'), 12)
pix = img.load()

# ── palette ──
OUT = (40, 32, 48)
G0 = (98, 170, 84); G1 = (122, 192, 98); G2 = (150, 210, 112); G3 = (188, 228, 138); GS = (84, 146, 82)
F0 = (30, 66, 54); F1 = (44, 98, 66); F2 = (66, 134, 74); F3 = (102, 168, 84); F4 = (150, 204, 110)   # forest canopy
TRUNK = (110, 70, 46)
P0 = (226, 206, 160); P1 = (200, 176, 130); PS = (168, 146, 110)
K0 = (218, 210, 196); K1 = (190, 180, 168)
B0 = (150, 84, 56); B1 = (198, 124, 80); B2 = (222, 156, 106)
TB0 = (150, 68, 52); TB1 = (184, 92, 66); TB2 = (206, 120, 86)
CR = (244, 234, 208)
GL0 = (64, 100, 150); GL1 = (116, 166, 212); GL2 = (206, 234, 250)
CG0 = (40, 98, 108); CG1 = (70, 142, 146); CG2 = (150, 206, 198)
DC0 = (150, 140, 130); DC1 = (200, 190, 176); DC2 = (226, 218, 204); PK = (206, 150, 138)
R0 = (84, 92, 98); R1 = (134, 142, 148); R2 = (176, 182, 186); R3 = (206, 210, 212)   # grey roofs (photo)
RT0 = (44, 84, 92); RT1 = (62, 112, 118)                                            # dorm teal roofs (photo)
GY0 = (40, 96, 80); GY1 = (58, 126, 102); GY2 = (90, 156, 128)                     # gym green roof
W0 = (40, 84, 120); W1 = (62, 120, 150); W2 = (150, 200, 220)
DIRT0 = (176, 140, 96); DIRT1 = (206, 176, 128); DIRT2 = (226, 202, 158)
WOOD = (150, 98, 58); WOOD_L = (186, 132, 80)
S0 = (112, 112, 124); S1 = (168, 168, 176); S2 = (210, 210, 214)
ROAD0 = (108, 108, 120); ROAD1 = (132, 132, 144)
WHITE = (248, 248, 240)
RED = (214, 64, 56); RED2 = (170, 44, 48); YEL = (248, 214, 72); PINK = (240, 156, 196)
SEAT = (70, 110, 170); SEAT2 = (100, 140, 196)
SIGN_BG = (252, 246, 228); BLD_BG = (64, 48, 72)
DOME0 = (120, 150, 160); DOME1 = (170, 200, 206); DOME2 = (220, 238, 240)

SHADE = {G0: GS, G1: GS, G2: G0, G3: G1, GS: GS, F4: F3, F3: F2, F2: F1, F1: F0,
         P0: P1, P1: PS, K0: K1, K1: (164, 154, 144), DIRT1: DIRT0, DIRT2: DIRT1, DIRT0: (150, 116, 80),
         ROAD0: (76, 76, 86), ROAD1: ROAD0, W1: W0, W2: W1, S1: S0, S2: S1,
         TB2: TB1, TB1: TB0, TB0: (122, 56, 44)}


def rect(x0, y0, x1, y1, fill=None, outline=None):
    d.rectangle((x0, y0, x1, y1), fill=fill, outline=outline)


def pt(x, y, c):
    if 0 <= x < W and 0 <= y < H:
        pix[x, y] = c


def shade_px(x, y):
    if 0 <= x < W and 0 <= y < H:
        c = pix[x, y]
        pix[x, y] = SHADE.get(c, tuple(int(v * .74) for v in c))


def shade(x0, y0, x1, y1):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            shade_px(x, y)


KEEP = {}

# ═════════════════════ GROUND: grass everywhere; forest is planted at the end around everything ═════════════════════
rect(0, 0, W, H, G1)
CLEARINGS = [
    [(0, 40), (100, 30), (104, 180), (82, 186), (82, 250), (40, 262), (0, 262)],     # dorm / tennis / gate side
    [(78, 172), (160, 170), (160, 250), (78, 250)],                                   # garden
    [(96, 104), (186, 150), (186, 200), (150, 200), (96, 170)],                       # around V홀
    [(144, 170), (288, 170), (288, 352), (196, 356), (166, 340), (144, 300)],         # main block
    [(156, 342), (288, 342), (288, 480), (156, 480)],                                 # field + farm
]
clear_mask = Image.new('L', (W, H), 0)
for poly in CLEARINGS:
    ImageDraw.Draw(clear_mask).polygon(poly, fill=255)


def grass_texture(x0, y0, x1, y1):
    for _ in range((x1 - x0) * (y1 - y0) // 22):
        x, y = rnd.randrange(x0, x1), rnd.randrange(y0, y1)
        if pix[x, y] == G1:
            if rnd.random() < .55:
                pt(x, y, G0); pt(x + 1, y, G0); pt(x, y - 1, G2)            # little tuft: dark blade + lit tip
            else:
                pt(x, y, G2)


grass_texture(0, 0, W, H)

# ── roads (thick polylines) ──
def polyroad(pts, w, fill=ROAD0, edge=S2):
    d.line(pts, fill=edge, width=w + 2, joint='curve')
    d.line(pts, fill=fill, width=w, joint='curve')
    for (x, y) in pts:
        d.ellipse((x - w // 2, y - w // 2, x + w // 2, y + w // 2), fill=fill)


polyroad([(-4, 271), (78, 270)], 6)                                          # entry road (photo: narrow road from the north)
polyroad([(76, 272), (76, 210), (64, 182), (52, 168), (50, 120), (48, 60)], 7)   # road up to the dorms
# road down to the field: passes the parking entrance, then hugs the LEFT edge of the brick terrace
# (the terrace is painted later and used to hide this road → it looked cut off)
polyroad([(80, 271), (134, 268), (150, 288), (158, 310), (163, 334), (172, 350), (186, 352), (288, 352)], 7)
polyroad([(186, 352), (192, 476)], 6)
for (x0, y0, x1, y1) in ((10, 270, 70, 270), (82, 270, 130, 268)):
    for x in range(x0, x1, 8):
        pt(x, y0, YEL); pt(x + 1, y0, YEL)

# ── 붉은 벽돌 보행로 (gate → main block) ──
d.polygon([(80, 246), (162, 239), (162, 258), (80, 260)], fill=TB2)
for y in range(238, 262):
    for x in range(80, 163):
        if pix[x, y] == TB2 and ((y % 3 == 2) or ((x + (y // 3) * 2) % 4 == 0)):
            pix[x, y] = TB1
for x in range(86, 162, 12):                                               # stone cross bands
    d.line((x, 245 - (x - 80) // 12, x, 259), fill=K0)
d.line((80, 246, 162, 239), fill=K1); d.line((80, 260, 162, 258), fill=K1)

# ── 생태연못 garden (between the promenade and V홀) ──
rect(80, 176, 156, 236, G2)
for _ in range(240):
    x, y = rnd.randrange(80, 156), rnd.randrange(176, 236)
    rect(x, y, x + 1, y, G1 if rnd.random() < .6 else G3)
d.polygon([(100, 198), (116, 192), (130, 198), (132, 212), (122, 222), (104, 220), (96, 210)], fill=W1, outline=W0)
for (x, y) in ((104, 204), (114, 198), (122, 214), (108, 214)):
    rect(x, y, x + 2, y, W2)
for (x, y) in ((100, 208), (126, 204), (112, 216)):
    d.ellipse((x, y, x + 3, y + 2), fill=F3, outline=F2)
d.arc((84, 178, 150, 236), 190, 330, fill=TB2, width=2)                   # curving red path (photo)
d.line((126, 200, 140, 232), fill=P0, width=2)
rect(114, 219, 128, 222, WOOD, OUT)                                        # wooden deck
for x in range(115, 128, 2):
    pt(x, 220, WOOD_L)
for (x, y) in ((86, 182), (146, 182), (88, 228), (132, 186), (150, 226), (142, 200)):   # red maples + shrubs
    d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=RED2); d.ellipse((x - 3, y - 3, x + 1, y), fill=RED)
for (x, y) in ((96, 224), (126, 226), (84, 206)):
    d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=F2); pt(x - 1, y - 2, F3)
KEEP['pond water'] = (96, 192, 133, 223)

# ── courts ──
rect(25, 183, 47, 225, (190, 96, 72), OUT)                                 # 테니스장 (orange surround, green court)
rect(29, 188, 43, 220, (96, 150, 96), WHITE)
d.line((29, 204, 43, 204), fill=S2); d.line((36, 192, 36, 216), fill=WHITE)
rect(29, 192, 43, 216, None, WHITE)
for y in range(183, 226, 3):
    pt(24, y, S2); pt(48, y, S2)
KEEP['tennis lines'] = (29, 188, 44, 221)
rect(70, 152, 100, 173, S1, OUT)                                           # 농구장 (grey square court)
rect(72, 154, 98, 171, (150, 154, 160), WHITE)
d.line((72, 162, 98, 162), fill=WHITE); d.ellipse((81, 158, 89, 166), outline=WHITE)
rect(72, 161, 73, 163, (220, 120, 90)); rect(97, 161, 98, 163, (220, 120, 90))
KEEP['court lines'] = (72, 154, 99, 172)

# ── 운동장 (dirt field, long axis vertical) + farm ──
FX0, FY0, FX1, FY1 = 200, 356, 278, 472
rect(FX0 - 2, FY0 - 2, FX1 + 2, FY1 + 2, S1)
rect(FX0, FY0, FX1, FY1, DIRT1)
for _ in range(1100):
    x, y = rnd.randrange(FX0, FX1 + 1), rnd.randrange(FY0, FY1 + 1)
    pt(x, y, DIRT0 if rnd.random() < .5 else DIRT2)
mx, my = (FX0 + FX1) // 2, (FY0 + FY1) // 2
CH = (240, 230, 210)
for x in range(FX0 + 5, FX1 - 4, 2):
    pt(x, FY0 + 5, CH); pt(x, FY1 - 5, CH); pt(x, my, CH)
for y in range(FY0 + 5, FY1 - 4, 2):
    pt(FX0 + 5, y, CH); pt(FX1 - 5, y, CH)
for a in range(0, 360, 15):
    pt(int(mx + 9 * math.cos(math.radians(a))), int(my + 9 * math.sin(math.radians(a))), CH)
for gy, side in ((FY0 + 5, 1), (FY1 - 5, -1)):
    for x in range(mx - 16, mx + 17, 2):
        pt(x, gy + 16 * side, CH)
    for y in range(min(gy, gy + 16 * side), max(gy, gy + 16 * side) + 1, 2):
        pt(mx - 16, y, CH); pt(mx + 16, y, CH)
    gy2 = gy - 4 * side
    rect(mx - 7, min(gy, gy2), mx - 7, max(gy, gy2), WHITE); rect(mx + 7, min(gy, gy2), mx + 7, max(gy, gy2), WHITE)
    rect(mx - 7, gy2, mx + 7, gy2, WHITE)
    KEEP[f'goal@{gy}'] = (mx - 7, min(gy, gy2), mx + 8, max(gy, gy2) + 1)
rect(203, 410, 212, 430, WHITE, OUT)                                         # white tent stand (photo)
for y in range(412, 429, 3):
    rect(204, y, 211, y, S2)
shade(213, 412, 214, 431)
KEEP['tent stand'] = (203, 410, 213, 431)
for i, (x0, y0) in enumerate(((162, 372), (162, 404), (162, 436))):      # farm plots
    rect(x0, y0, x0 + 20, y0 + 26, DIRT0, WOOD)
    for y in range(y0 + 3, y0 + 25, 4):
        rect(x0 + 2, y, x0 + 18, y, (150, 116, 80))
        if i != 1:
            for x in range(x0 + 3, x0 + 18, 3):
                pt(x, y - 1, F3)

# ── main block ground: 월드플라자 courtyard + brick terrace + grass mound ──
d.polygon([(182, 220), (224, 220), (224, 300), (182, 300)], fill=K0)
for y in range(220, 301):
    for x in range(182, 225):
        if (y - 220) % 8 == 0 or (x - 182) % 8 == 0:
            pix[x, y] = K1
        elif ((x - 182) // 8 + (y - 220) // 8) % 2 == 0 and (x + y) % 2 == 0:
            pix[x, y] = TB2
d.rectangle((190, 236, 216, 262), outline=TB1)                              # central square pattern (photo)
d.rectangle((196, 242, 210, 256), outline=TB1)
rect(176, 300, 246, 346, TB2)                                               # brick terrace
for y in range(300, 347):
    for x in range(176, 247):
        if (y % 3 == 2) or ((x + (y // 3) * 2) % 4 == 0):
            pix[x, y] = TB1
for i, y in enumerate(range(300, 306)):                                    # stairs courtyard → terrace
    rect(196, y, 222, y, S2 if i % 2 == 0 else S1)
KEEP['plaza stairs'] = (196, 300, 223, 306)
d.pieslice((168, 296, 208, 336), 0, 180, fill=G2, outline=OUT)             # semicircular grass mound
d.arc((172, 300, 204, 332), 0, 180, fill=G1)
rect(230, 330, 244, 344, (120, 80, 52)); rect(231, 331, 243, 343, F2)      # planter
for (x, y) in ((186, 228), (186, 292), (216, 228), (216, 292)):             # benches
    rect(x, y, x + 5, y + 1, WOOD_L); rect(x, y + 2, x + 5, y + 2, WOOD)
rect(238, 198, 264, 246, TB2)                                               # brick plaza by the theater
for y in range(198, 247):
    for x in range(238, 265):
        if (y % 3 == 2) or ((x + (y // 3) * 2) % 4 == 0):
            pix[x, y] = TB1

# ── 야외극장 (big circular theater + white semicircular canopy) ──
TCX, TCY, TRR = 262, 222, 20
d.ellipse((TCX - TRR + 2, TCY - TRR + 2, TCX + TRR + 3, TCY + TRR + 3), fill=F0)
d.ellipse((TCX - TRR, TCY - TRR, TCX + TRR, TCY + TRR), fill=TB1, outline=OUT)
for rr in range(TRR - 2, 6, -3):
    d.ellipse((TCX - rr, TCY - rr, TCX + rr, TCY + rr), outline=TB0)
d.ellipse((TCX - 6, TCY - 6, TCX + 6, TCY + 6), fill=TB2, outline=TB0)
d.ellipse((TCX - 3, TCY - 3, TCX + 3, TCY + 3), fill=K0, outline=S0)
d.arc((TCX - TRR - 3, TCY - TRR - 3, TCX + TRR + 3, TCY + TRR + 3), -75, 75, fill=WHITE, width=4)
d.arc((TCX - TRR - 3, TCY - TRR - 3, TCX + TRR + 3, TCY + TRR + 3), -75, 75, fill=S1, width=1)
KEEP['theater'] = (TCX - TRR, TCY - TRR - 3, TCX + TRR + 4, TCY + TRR + 4)

# ── 야외공연장 (small round amphitheater in the woods: blue seats, red floor) ──
ACX, ACY, AR = 148, 346, 11
d.ellipse((ACX - AR - 3, ACY - AR - 3, ACX + AR + 3, ACY + AR + 3), fill=G1)
d.pieslice((ACX - AR, ACY - AR, ACX + AR, ACY + AR), 180, 360, fill=SEAT, outline=OUT)
for rr in range(AR - 3, 3, -3):
    d.arc((ACX - rr, ACY - rr, ACX + rr, ACY + rr), 180, 360, fill=SEAT2)
d.pieslice((ACX - AR, ACY - AR, ACX + AR, ACY + AR), 0, 180, fill=TB1, outline=OUT)
d.ellipse((ACX - 4, ACY - 2, ACX + 4, ACY + 4), fill=TB2)
KEEP['small amphitheater'] = (ACX - AR, ACY - AR, ACX + AR + 1, ACY + AR + 1)

# ═════════════════════ BUILDINGS (footprints traced from the photo, 3/4 view) ═════════════════════
FH = 4                                  # px per storey (compact Emerald-style heights)
MAT = {'brick': (B0, B1, B2), 'conc': (DC0, DC1, DC2)}


def wall_px(x, r, mat):
    m0, m1, m2 = MAT[mat]
    if mat == 'brick':
        if r % 2 == 1:
            return m0 if (x + (r // 2) * 2) % 4 == 0 else m1
        return m1 if (x * 3 + r) % 7 else m2
    return PK if r % FH == 3 else m1


def bld(foot, floors, mat='brick', roof=(R0, R1, R2), bay=4, doors=(), glass=(GL0, GL1, GL2), curtain=None):
    """footprint polygon on the ground → roof lifted by the wall height, wall hangs below the roof's lower edge.
    stepped only every `bay` px on curved edges so the windows stay whole. returns wall-bottom per column"""
    h = floors * FH + 2
    roof_poly = [(x, y - h) for (x, y) in foot]
    m = Image.new('1', (W, H + 64), 0)
    ImageDraw.Draw(m).polygon([(x, y + 32) for (x, y) in roof_poly], fill=1)
    mp = m.load()
    cols = {}
    for x in range(W):
        ys = [y - 32 for y in range(H + 64) if mp[x, y]]
        if ys:
            cols[x] = (min(ys), max(ys))
    xs0 = min(cols)
    bay_top = {}
    for x, (_, yb) in cols.items():
        b = (x - xs0) // bay
        bay_top[b] = max(bay_top.get(b, -99), yb)
    sil = set()
    for x, (yt, yb) in cols.items():
        for y in range(yt, bay_top[(x - xs0) // bay] + h + 1):
            sil.add((x, y))
    for (x, y) in sil:                                           # cast shadow (light from top-left)
        for k in (1, 2, 3):
            if (x + k, y + k) not in sil:
                shade_px(x + k, y + k) if k == 3 else None
    m0, m1, m2 = MAT[mat]
    bottoms = {}
    for x, (yt, yb) in cols.items():
        Yb = bay_top[(x - xs0) // bay]
        bx = (x - xs0) % bay
        for y in range(yb + 1, Yb + h + 1):
            r = y - Yb
            c = wall_px(x, max(r, 0), mat)
            if r <= 1:
                c = m2 if r == 1 else m1
            else:
                f, fr = (r - 2) // FH, (r - 2) % FH
                if curtain and curtain[0] <= x <= curtain[1]:
                    c = CG0 if (x % 3 == 0 or fr == 0) else CG1
                    if fr == 1 and x % 5 == 0:
                        c = CG2
                elif f < floors and bx in (1, 2) and fr in (1, 2):
                    c = glass[0] if fr == 1 else glass[1]
                    if fr == 2 and bx == 2:
                        c = glass[2]
                elif fr == 3 and f < floors:
                    c = CR if mat == 'brick' else c
            if 0 <= y < H:
                pix[x, y] = c
        bottoms[x] = Yb + h
        for dcx in doors:
            if abs(x - dcx) <= 2:
                for y in range(Yb + h - 4, Yb + h):
                    pt(x, y, CR if abs(x - dcx) == 2 else GL0)
    for x, (yt, yb) in cols.items():                             # roof with lit parapet
        for y in range(yt, yb + 1):
            edge = not (mp[x - 1, y + 32] and mp[x + 1, y + 32] and mp[x, y + 31] and mp[x, y + 33])
            inner = not (mp[x - 2, y + 32] and mp[x, y + 30])
            pt(x, y, roof[2] if edge else (roof[0] if inner else roof[1]))
    for (x, y) in sil:
        if any((x + dx, y + dy) not in sil for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            pt(x, y, OUT)
    for x, (yt, yb) in cols.items():
        pt(x, yb + 1, OUT)
    return bottoms


def roofbox(x0, y0, x1, y1, col=R3):
    """stair core / plant room on a roof"""
    rect(x0, y0, x1, y1, col, OUT); rect(x0 + 1, y0 + 1, x1 - 1, y0 + 1, WHITE)
    rect(x1 + 1, y0 + 1, x1 + 1, y1 + 1, R0); rect(x0 + 1, y1 + 1, x1 + 1, y1 + 1, R0)


def acs(x0, y0, n, step=4):
    for i in range(n):
        x = x0 + i * step
        rect(x, y0, x + 2, y0 + 2, S2, S0)


def rectfoot(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


# draw back → front (by footprint bottom)
# 기숙사 B동 (6F) and A동 (8F): long parallel blocks, teal roofs, joined by a walkway
bld(rectfoot(58, 44, 88, 150), 6, 'conc', roof=(RT0, RT1, R2), doors=(73,))
roofbox(62, 14, 84, 20); acs(62, 108, 5)
rect(36, 108, 58, 113, R2, OUT); rect(37, 110, 57, 111, GL1)                # walkway A ↔ B
bld(rectfoot(8, 56, 36, 176), 8, 'conc', roof=(RT0, RT1, R2), doors=(22,))
roofbox(12, 26, 32, 32); acs(12, 124, 6)

# 정문 guard house + small building by the gate road
bld(rectfoot(52, 214, 70, 232), 2, 'brick', doors=(61,))
roofbox(55, 214, 64, 218)
bld(rectfoot(62, 276, 74, 284), 1, 'brick')
for (x, y) in ((79, 263), (79, 277)):                                       # gate pillars
    rect(x, y - 4, x + 3, y + 1, B1, OUT); rect(x, y - 4, x + 3, y - 3, CR)
    KEEP[f'gate pillar {y}'] = (x, y - 4, x + 4, y + 2)
KEEP['guard house'] = (62, 262, 75, 285)

# V홀: long curved (fan) building, 5F
VC = (80, 258)
foot = [(VC[0] + 124 * math.cos(math.radians(t)), VC[1] + 124 * math.sin(math.radians(t))) for t in range(-80, -37, 2)]
foot += [(VC[0] + 110 * math.cos(math.radians(t)), VC[1] + 110 * math.sin(math.radians(t))) for t in range(-38, -81, -2)]
vb = bld(foot, 5, 'brick', bay=4, glass=(CG0, CG1, CG2), doors=(112,))
for t in range(-78, -40, 6):                                               # rooftop units following the arc
    x, y = VC[0] + 117 * math.cos(math.radians(t)), VC[1] + 117 * math.sin(math.radians(t)) - 22
    rect(int(x) - 1, int(y) - 1, int(x) + 1, int(y) + 1, S2, S0)
KEEP['V entrance'] = (109, vb[112] - 5, 116, vb[112] + 1)

# gym (D홀 1F 체육관): big green-roofed box behind D
bld(rectfoot(172, 182, 230, 206), 2, 'brick', roof=(GY0, GY1, GY2), glass=(CG0, CG1, CG2))
for x in range(176, 228, 6):
    d.line((x, 173, x, 194), fill=GY0)
# V–D bridge (from V's end down to D's back-left)
rect(151, vb[154] - 10, 158, 204, CG1, OUT); rect(152, vb[154] - 10, 152, 204, CG2)
for y in range(vb[154] - 8, 204, 3):
    rect(153, y, 157, y, CG0)
# LUX홀: round domed hall + 1-storey link to the D/P corner
bld(rectfoot(146, 208, 164, 224), 1, 'brick', glass=(CG0, CG1, CG2), doors=(156,))
DCX, DCY, DR = 136, 216, 12
dome_foot = [(DCX + DR * math.cos(math.radians(t)), DCY + DR * .8 * math.sin(math.radians(t))) for t in range(0, 360, 10)]
bld(dome_foot, 1, 'brick', roof=(DOME0, DOME1, DOME2), glass=(CG0, CG1, CG2))
dy0 = DCY - 6
for rr, col in ((DR - 2, DOME1), (DR - 5, DOME2), (DR - 8, DOME1)):        # concentric rings (photo)
    d.ellipse((DCX - rr, dy0 - rr * .8, DCX + rr, dy0 + rr * .8), outline=DOME0, fill=col if rr == DR - 8 else None)
d.ellipse((DCX - 2, dy0 - 2, DCX + 2, dy0 + 1), fill=WHITE, outline=OUT)
KEEP['LUX dome'] = (DCX - DR, DCY - 6 - DR, DCX + DR + 1, DCY + 12)
# D홀 (top wing, 5F) with the teal curtain wall
bld(rectfoot(150, 204, 240, 222), 5, 'brick', curtain=(196, 212), doors=(204,))
acs(156, 186, 3); roofbox(166, 184, 176, 190); acs(226, 186, 3)
# C홀 (right wing, 4F)
bld(rectfoot(222, 222, 248, 302), 4, 'brick', doors=(235,))
roofbox(226, 210, 244, 218); acs(226, 240, 5); acs(226, 270, 5); roofbox(228, 280, 242, 286)
# P홀 (left wing, 4F)
bld(rectfoot(160, 206, 182, 312), 4, 'brick', doors=(171,))
roofbox(163, 196, 179, 204); acs(164, 230, 4); acs(164, 262, 4); roofbox(164, 280, 178, 288)
# underground parking entrance by the field road (photo: not visible; namu: under P홀)
d.polygon([(138, 276), (150, 276), (152, 284), (140, 284)], fill=(30, 26, 36), outline=OUT)
rect(139, 274, 151, 275, B1, OUT)
KEEP['parking entrance'] = (138, 273, 153, 285)

# ═════════════════════ FOREST: planted tree by tree, never touching roads / buildings / courts ═════════════════════
GRASSY = {G0, G1, G2, G3, GS}
free = Image.new('L', (W, H), 0)                    # 255 = plain grass (may hold a tree)
fp = free.load()
for y in range(H):
    for x in range(W):
        if pix[x, y] in GRASSY:
            fp[x, y] = 255
from PIL import ImageFilter
free = free.filter(ImageFilter.MinFilter(5))         # keep trees ≥ 2 px away from anything built
fp = free.load()
cm = clear_mask.load()
forest_core = clear_mask.point(lambda v: 255 - v).filter(ImageFilter.MinFilter(9)).load()   # deep forest, 4 px inside


def tree(x, y, r, maple=False):
    """round canopy, lit from the top-left, with a soft shadow down-right on the grass"""
    for yy in range(y - r + 2, y + r + 4):            # shadow on grass only
        for xx in range(x - r + 2, x + r + 4):
            if (xx - x - 2) ** 2 + (yy - y - 2) ** 2 <= r * r and 0 <= xx < W and 0 <= yy < H and pix[xx, yy] in GRASSY:
                pix[xx, yy] = GS
    body, mid, lit = ((178, 82, 52), (214, 116, 62), (238, 168, 92)) if maple else (F1, F2, F3)   # autumn maple vs pine-green
    d.ellipse((x - r, y - r, x + r, y + r), fill=F0)
    d.ellipse((x - r + 1, y - r + 1, x + r - 1, y + r - 1), fill=body)
    d.ellipse((x - r + 1, y - r + 1, x + r // 3, y + r // 3), fill=mid)
    d.ellipse((x - r + 2, y - r + 2, x - r // 3, y - r // 3), fill=lit)
    if r >= 4 and not maple:
        pt(x - r + 3, y - r + 3, F4)


def fits(x, y, r):
    for yy in range(y - r, y + r + 1):
        for xx in range(x - r, x + r + 1):
            if (xx - x) ** 2 + (yy - y) ** 2 <= r * r:
                if not (0 <= xx < W and 0 <= yy < H):
                    continue                          # canopies may leave the map edge
                if fp[xx, yy] == 0:
                    return False
    return True


# deep-forest floor (only where no tree will ever be visible as a gap)
for y in range(H):
    for x in range(W):
        if forest_core[x, y] and fp[x, y]:
            pix[x, y] = F0 if (x * 7 + y * 3) % 11 else F1
cands = []
for _ in range(9000):
    x, y = rnd.randrange(-3, W + 3), rnd.randrange(-3, H + 3)
    inside = 0 <= x < W and 0 <= y < H
    if inside and cm[x, y]:                           # trunk must stand in the forest (canopy may lean out)
        continue
    cands.append((y, x, rnd.choice((3, 4, 4, 5, 5, 6))))
cands.sort()                                          # back to front
planted = []
for y, x, r in cands:
    if any((x - px_) ** 2 + (y - py_) ** 2 < (r + pr - 3) ** 2 for (px_, py_, pr) in planted[-160:]):
        continue
    if fits(x, y, r):
        tree(x, y, r, maple=rnd.random() < .012)
        planted.append((x, y, r))

# campus trees in clearings (also only where they fit)
for (x, y) in ((92, 140), (150, 320), (264, 268), (270, 300), (252, 330), (100, 268), (196, 168),
               (120, 100), (136, 112), (6, 30), (100, 40)):
    if fits(x, y, 4):
        tree(x, y, 4)
        KEEP[f'tree@{x},{y}'] = (x - 4, y - 4, x + 8, y + 8)

# a few flowers in the lawns
for _ in range(160):
    x, y = rnd.randrange(W), rnd.randrange(H)
    if pix[x, y] == G1 and cm[x, y] and fp[x, y]:
        pt(x, y, rnd.choice(((248, 248, 240), (248, 214, 72), (240, 120, 140))))

# ═════════════════════ LABELS ═════════════════════
LABELS = []


def label(cx, cy, text, kind='area', vertical=False):
    bg, fg = (BLD_BG, SIGN_BG) if kind == 'bld' else (SIGN_BG, OUT)
    chars = text.split('|') if '|' in text else list(text)
    if vertical:
        w, h = 16, len(chars) * 13 + 3
    else:
        w, h = d.textbbox((0, 0), text, font=FONT)[2] + 6, 15
    x0, y0 = int(cx - w / 2), int(cy - h / 2)
    x1, y1 = x0 + w - 1, y0 + h - 1
    rect(x0 + 1, y0 + 1, x1 + 1, y1 + 1, OUT)
    rect(x0, y0, x1, y1, bg, OUT)
    rect(x0 + 1, y0 + 1, x1 - 1, y0 + 1, (255, 255, 255) if kind != 'bld' else (100, 84, 110))
    if vertical:
        for i, ch in enumerate(chars):
            cw = d.textbbox((0, 0), ch, font=FONT)[2]
            d.text((x0 + (w - cw) // 2, y0 + 2 + i * 13), ch, font=FONT, fill=fg)
    else:
        d.text((x0 + 3, y0 + 1), text, font=FONT, fill=fg)
    LABELS.append((text.replace('|', ''), (x0, y0, x1 + 2, y1 + 2)))


label(22, 80, '기|숙|사|A|동', 'bld', vertical=True)
label(73, 70, '기|숙|사|B|동', 'bld', vertical=True)
label(30, 243, '테니스장')
label(87, 181, '농구장')
label(164, 118, 'V홀', 'bld')
label(87, 220, '생태연못', vertical=True)
label(136, 237, 'LUX홀', 'bld')
label(40, 291, '정문')
label(171, 240, 'P홀', 'bld', vertical=True)
label(204, 191, 'D홀', 'bld')
label(202, 165, '체육관')
label(232, 254, 'C홀', 'bld', vertical=True)
label(203, 260, '월드플라자', vertical=True)
label(260, 186, '야외극장')
label(148, 370, '야외공연장')
label(239, 445, '운동장')

# ── QR pin proposals (base px; the app draws the pins) ──
PINS = [
    ('A01', 'P홀 1층 로비', 171, 306), ('A02', 'P홀 4층 복도', 171, 272),
    ('A03', 'D홀 1층 체육관', 182, 178), ('A04', 'D홀 3층 물리실', 188, 212), ('A05', 'D홀 5층 자습실', 218, 206),
    ('A06', 'C홀 1층 시청각실', 242, 298), ('A07', 'C홀 4층 보건실 앞', 230, 286), ('A08', 'C홀 2층 1학년부', 236, 226),
    ('A09', '월드플라자 계단', 214, 303), ('A10', 'V홀 1층 식당', 112, 137), ('A11', 'V홀 2층 도서관', 150, 140),
    ('A12', 'LUX홀 매점', 156, 216), ('A13', 'LUX홀 밴드 연습실', 136, 206), ('A14', '기숙사 A동 1층', 22, 172),
    ('A15', '기숙사 B동 앞', 66, 146), ('A16', '농구장', 86, 160), ('A17', '운동장 스탠드', 207, 420),
    ('A18', '운동장 골대', 239, 364), ('A19', '생태연못', 114, 208), ('A20', '정문', 70, 268),
    ('A21', '잔디 둔덕(테라스)', 186, 318), ('A22', '야외극장', 262, 222), ('A23', '지하주차장 입구', 145, 280),
    ('A24', '붉은 벽돌 보행로', 112, 251),
]
PIN_R = 4


def hits(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def check():
    ok = True
    for name, a in LABELS:
        if a[0] < 0 or a[1] < 0 or a[2] > W or a[3] > H:
            print('LABEL OUT OF BOUNDS:', name, a); ok = False
        for kname, b in KEEP.items():
            if hits(a, b):
                print('LABEL COVERS ART:', name, '->', kname); ok = False
    for i in range(len(LABELS)):
        for j in range(i + 1, len(LABELS)):
            if hits(LABELS[i][1], LABELS[j][1]):
                print('LABEL OVERLAP:', LABELS[i][0], LABELS[j][0]); ok = False
    for pid, pname, x, y in PINS:
        if not (PIN_R <= x < W - PIN_R and PIN_R <= y < H - PIN_R):
            print('PIN OUT OF BOUNDS:', pid); ok = False
        for name, (x0, y0, x1, y1) in LABELS:
            nx, ny = min(max(x, x0), x1 - 1), min(max(y, y0), y1 - 1)
            if (x - nx) ** 2 + (y - ny) ** 2 <= (PIN_R + 1) ** 2:
                print('PIN ON LABEL:', pid, pname, '->', name); ok = False
    for i in range(len(PINS)):
        for j in range(i + 1, len(PINS)):
            a, b = PINS[i], PINS[j]
            dist = math.hypot((a[2] - b[2]) / W, (a[3] - b[3]) / H)
            if dist < .04:
                print(f'PINS TOO CLOSE: {a[0]} {b[0]} {dist:.3f}'); ok = False
    print(f'check: {len(LABELS)} labels, {len(PINS)} pins -> '
          f'{"OK (labels: no overlaps, inside, clear of key art; pins: clear of labels, >= .04 apart)" if ok else "FAILED"}')
    return ok


ok = check()
print('-- SQL-ready pin rows (id, map_x, map_y) --')
for pid, pname, x, y in PINS:
    print(f"  ('{pid}', {x / W:.3f}, {y / H:.3f}),  -- {pname}")

if os.environ.get('PIN_PREVIEW'):
    pv = img.copy(); pd = ImageDraw.Draw(pv)
    for pid, pname, x, y in PINS:
        pd.ellipse((x - PIN_R, y - PIN_R, x + PIN_R, y + PIN_R), fill=(255, 40, 40), outline=(255, 255, 255))
    pv.resize((W * 3, H * 3), Image.Resampling.NEAREST).save(os.environ['PIN_PREVIEW'])
assert ok

out = os.path.join(ROOT, 'web', 'img', 'map.png')
img.save(out, optimize=True)
print(out, img.size)
