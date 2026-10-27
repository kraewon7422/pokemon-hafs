"""학교 지도 픽셀아트 v2 (3/4 탑다운 RPG 마을 스타일, 붉은 벽돌) → web/img/map.png

배치 출처: 나무위키 '용인한국외국어대학교부설고등학교/시설' 문서의 상대 위치 설명
  - 운동장에서 보면 정면에 П자 교사동: 왼쪽 P홀(4층) · 가운데 D홀(5층) · 오른쪽 C홀(4층), 가운데는 World Plaza
  - 구름다리: C–D 2~4층, D–P 3~4층, P–C 3층(광장 가로지름, 유리), V–D 3~4층 (C·D 2층, V·D 3층은 지붕 없는 노출형)
  - D홀 뒤 V홀(5층: 식당·도서관, 살짝 휘어진 건물, 3층 개방 복도) → 기숙사 Ace Hall(A동 높음/좌, B동 낮음/우, C동 A동 측면 증축)
  - LUX홀은 D홀과 연결(옥상정원), 정문 들어서면 생태연못(LUX홀·기숙사 앞, 잉어·목재 다리·목재 테이블), 농구장은 B동 옆
  - P홀 뒤 잔디광장(나무 한 그루), D–C 구름다리 뒤 야외학습장(반원, 비막이 있음), 반대쪽 아래 야외공연장(반원)
  - 운동장은 흙 운동장(인조잔디·트랙 없음), 앞쪽 식수대, 주변 밭과 펜스. 소각장은 운동장 차량 진입로 뒤(낮은 담)
  - 정문 경비실에 'INFORMATION' 양각
방위는 문서에 없어서 '운동장이 아래, 교사동이 위'로 그렸다. 실제와 다르면 좌표만 고치면 된다.
v1(단순 블록 그림)은 git 기록에 있다.

사용법:  python tools/draw_map.py      (기본 288x480 픽셀을 3배로 키워 864x1440 저장, 라벨 겹침 검사 출력)
"""
import os
import random

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
W, H, SCALE = 288, 480, 3
rnd = random.Random(11)

img = Image.new('RGB', (W, H))
d = ImageDraw.Draw(img)
d.fontmode = '1'   # no anti-aliasing → crisp pixel text
FONT = ImageFont.truetype(os.path.join(HERE, 'Galmuri11.ttf'), 12)

# ── palette ──
OUT = (40, 32, 48)
G0 = (78, 148, 72); G1 = (104, 176, 84); G2 = (136, 198, 96); G3 = (180, 222, 120); GS = (62, 118, 70)
T0 = (34, 92, 62); T1 = (52, 128, 72); T2 = (88, 164, 80)
TRUNK = (110, 70, 46)
P0 = (226, 206, 160); P1 = (200, 176, 130); PS = (168, 146, 110)
K0 = (218, 210, 196); K1 = (190, 180, 168)
B0 = (132, 56, 44); B1 = (178, 86, 56); B2 = (206, 116, 74)
CR = (244, 234, 208)
GL0 = (64, 100, 150); GL1 = (116, 166, 212); GL2 = (206, 234, 250)
R0 = (74, 82, 86); R1 = (104, 114, 110); R2 = (146, 154, 144)
W0 = (48, 98, 168); W1 = (78, 146, 212); W2 = (170, 218, 248)
DIRT0 = (176, 140, 96); DIRT1 = (202, 168, 120); DIRT2 = (222, 194, 148)
WOOD = (150, 98, 58); WOOD_L = (186, 132, 80)
S0 = (112, 112, 124); S1 = (168, 168, 176); S2 = (210, 210, 214)
ROAD0 = (96, 96, 106); ROAD1 = (124, 124, 134)
WHITE = (248, 248, 240)
RED = (226, 70, 70); YEL = (248, 214, 72); PINK = (240, 156, 196); ORANGE = (240, 140, 60)
COURT0 = (60, 120, 128); COURT1 = (80, 148, 150)
SIGN_BG = (252, 246, 228); BLD_BG = (64, 48, 72)

SHADE = {G0: GS, G1: GS, G2: G0, G3: G1, GS: GS, T2: T1, T1: T0,
         P0: P1, P1: PS, K0: K1, K1: (164, 154, 144), DIRT1: DIRT0, DIRT2: DIRT1, DIRT0: (150, 116, 80),
         ROAD0: (76, 76, 86), ROAD1: ROAD0, W1: W0, W2: W1, W0: (36, 76, 140), S1: S0, S2: S1}
pix = img.load()


def rect(x0, y0, x1, y1, fill=None, outline=None):
    d.rectangle((x0, y0, x1, y1), fill=fill, outline=outline)


def pt(x, y, c):
    if 0 <= x < W and 0 <= y < H:
        pix[x, y] = c


def shade(x0, y0, x1, y1):
    """darken the ground inside a box (cast shadow)"""
    for y in range(max(0, y0), min(H, y1 + 1)):
        for x in range(max(0, x0), min(W, x1 + 1)):
            c = pix[x, y]
            pix[x, y] = SHADE.get(c, tuple(int(v * .74) for v in c))


def shade_ellipse(x0, y0, x1, y1):
    cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 + .01, (y1 - y0) / 2 + .01
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 and 0 <= x < W and 0 <= y < H:
                c = pix[x, y]
                pix[x, y] = SHADE.get(c, tuple(int(v * .74) for v in c))


# ═════════════════════ GROUND ═════════════════════
rect(0, 0, W, H, G1)
for _ in range(900):                                   # soft mottling
    x, y = rnd.randrange(W), rnd.randrange(H)
    rect(x, y, x + rnd.randrange(1, 4), y, G0 if rnd.random() < .55 else G2)
for _ in range(260):                                   # grass tufts
    x, y = rnd.randrange(W), rnd.randrange(H)
    pt(x, y, G0); pt(x + 2, y, G0); pt(x + 1, y - 1, G0); pt(x + 1, y - 2, G3)
# hill behind the dorms: darker diagonal band texture
for y in range(0, 104):
    for x in range(0, W):
        if (x + y * 2) % 11 == 0 and rnd.random() < .6 - y / 260:
            pt(x, y, G0)

# ── campus road (east edge, one-way with parallel parking) ──
rect(272, 0, 287, H - 1, ROAD0)
rect(271, 0, 271, H - 1, S1); rect(270, 0, 270, H - 1, S2)
for y in range(3, H, 12):
    rect(281, y, 281, y + 5, YEL)
for y in range(140, 320, 13):                          # parallel parking bays + parked cars
    rect(273, y, 278, y, WHITE)
for i, y in enumerate(range(142, 318, 26)):
    col = [(200, 64, 64), (236, 236, 236), (64, 96, 168), (48, 48, 56), (220, 200, 80), (120, 160, 120), (200, 64, 64)][i % 7]
    rect(273, y + 1, 278, y + 9, col, OUT); rect(274, y + 3, 277, y + 4, GL1); rect(274, y + 7, 277, y + 7, GL0)
for y in range(36, 120, 6):                            # one-way arrows
    pass
for y in (60, 200, 420):
    rect(279, y, 279, y + 6, WHITE); pt(278, y + 1, WHITE); pt(280, y + 1, WHITE)

# ── paths ──
def path(x0, y0, x1, y1):
    rect(x0, y0, x1, y1, P0)
    rect(x0, y0, x1, y0, P1)
    for _ in range((x1 - x0 + 1) * (y1 - y0 + 1) // 18):
        pt(rnd.randrange(x0, x1 + 1), rnd.randrange(y0, y1 + 1), P1)


def brickpath(x0, y0, x1, y1):
    rect(x0, y0, x1, y1, B2)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if (y - y0) % 3 == 2 or (x + ((y - y0) // 3) * 2) % 4 == 0:
                pt(x, y, B1)


path(4, 106, 271, 114)               # uphill path (dorm front) → road
path(234, 114, 241, 226)             # east walk along LUX
path(234, 336, 241, 360)             # gate → field walk
path(4, 352, 271, 360)               # walk along the field
brickpath(234, 322, 271, 334)        # main gate entrance
brickpath(112, 322, 152, 352)        # plaza → field
path(44, 100, 52, 106)               # A동 door
path(158, 100, 166, 106)             # B동 door

# ── 주차장 (기숙사 앞 작은 공간) ──
rect(6, 120, 66, 164, ROAD1, S0)
for x in range(8, 66, 8):
    rect(x, 121, x, 131, WHITE); rect(x, 153, x, 163, WHITE)
for i, x in enumerate((9, 25, 41, 57)):
    col = [(64, 96, 168), (236, 236, 236), (200, 64, 64), (90, 90, 96)][i]
    rect(x, 122, x + 5, 130, col, OUT); rect(x + 1, 124, x + 4, 125, GL1)
for i, x in enumerate((17, 49)):
    col = [(220, 200, 80), (236, 236, 236)][i]
    rect(x, 154, x + 5, 162, col, OUT); rect(x + 1, 159, x + 4, 160, GL1)
rect(66, 136, 76, 148, ROAD1)        # driveway to V

# ── 잔디광장 (P홀 뒤, 예전 수공간 → 잔디, 나무 한 그루) ──
rect(3, 186, 25, 322, G2, T1)
for y in range(187, 322):
    if (y // 4) % 2 == 0:
        rect(4, y, 24, y, G3 if (y // 4) % 4 == 0 else G2)
for y in range(190, 320, 9):
    for x in range(6, 24, 7):
        pt(x + (y // 9) % 2 * 3, y, (248, 248, 200))

# ── World Plaza (paved, central narrow stair, sculpture, planters) ──
rect(72, 234, 190, 322, K0)
for y in range(234, 323):
    for x in range(72, 191):
        if (y - 234) % 6 == 0 or (x - 72 + ((y - 234) // 6) % 2 * 6) % 12 == 0:
            pix[x, y] = K1
# level change across the plaza with a narrow central stair (no railings)
rect(72, 280, 190, 283, K1); rect(72, 284, 190, 284, S1)
for i, y in enumerate(range(278, 288, 2)):
    rect(124, y, 138, y, S2 if i % 2 == 0 else S1)
rect(123, 277, 123, 288, S0); rect(139, 277, 139, 288, S0)

# ── 운동장: 흙 운동장 (no track, no turf) ──
FX0, FY0, FX1, FY1 = 30, 368, 262, 472
rect(FX0 - 2, FY0 - 2, FX1 + 2, FY1 + 2, S1)             # low fence base
rect(FX0, FY0, FX1, FY1, DIRT1)
for _ in range(1500):
    x, y = rnd.randrange(FX0, FX1 + 1), rnd.randrange(FY0, FY1 + 1)
    pt(x, y, DIRT0 if rnd.random() < .5 else DIRT2)
for _ in range(40):                                     # tyre / rake streaks
    x, y = rnd.randrange(FX0 + 4, FX1 - 12), rnd.randrange(FY0 + 3, FY1 - 3)
    rect(x, y, x + rnd.randrange(4, 10), y, DIRT2)
for (cx_, cy_, rx_, ry_) in ((FX0 + 16, (FY0 + FY1) // 2, 10, 14), (FX1 - 16, (FY0 + FY1) // 2, 10, 14),
                             ((FX0 + FX1) // 2, (FY0 + FY1) // 2, 18, 12)):
    for _ in range(140):                                # scuffed goal mouths / centre
        x = cx_ + int(rnd.gauss(0, rx_ / 2)); y = cy_ + int(rnd.gauss(0, ry_ / 2))
        pt(x, y, DIRT0)
CH = (236, 226, 204)                                    # faint chalk lines
for x in range(FX0 + 8, FX1 - 7):
    if x % 2 == 0:
        pt(x, FY0 + 8, CH); pt(x, FY1 - 8, CH)
for y in range(FY0 + 8, FY1 - 7):
    if y % 2 == 0:
        pt(FX0 + 8, y, CH); pt(FX1 - 8, y, CH); pt((FX0 + FX1) // 2, y, CH)
mx, my = (FX0 + FX1) // 2, (FY0 + FY1) // 2
for a in range(0, 360, 12):
    import math
    pt(int(mx + 13 * math.cos(math.radians(a))), int(my + 13 * math.sin(math.radians(a))), CH)
for gx, side in ((FX0 + 8, 1), (FX1 - 8, -1)):          # penalty boxes + goals
    bx0, bx1 = (gx, gx + 22 * side)
    for y in range(my - 22, my + 23, 2):
        pt(bx1, y, CH)
    for x in range(min(gx, bx1), max(gx, bx1) + 1, 2):
        pt(x, my - 22, CH); pt(x, my + 22, CH)
    gx2 = gx - 5 * side
    rect(min(gx, gx2), my - 9, max(gx, gx2), my - 9, WHITE); rect(min(gx, gx2), my + 9, max(gx, gx2), my + 9, WHITE)
    rect(gx2, my - 9, gx2, my + 9, WHITE)
    for y in range(my - 8, my + 9, 2):
        for x in range(min(gx, gx2) + 1, max(gx, gx2)):
            if (x + y) % 2 == 0:
                pt(x, y, S2)
# fence posts around the field
for x in range(FX0 - 2, FX1 + 3, 6):
    pt(x, FY0 - 3, S0); pt(x, FY1 + 3, S0)
for y in range(FY0 - 2, FY1 + 3, 6):
    pt(FX0 - 3, y, S0); pt(FX1 + 3, y, S0)
# benches / stands on the north edge of the field + drinking fountain (식수대)
for bx in (40, 68, 196, 224):
    rect(bx, 362, bx + 14, 364, WOOD, OUT); rect(bx + 1, 362, bx + 13, 362, WOOD_L)
rect(166, 361, 171, 366, S1, OUT); pt(168, 362, W1); pt(169, 362, W2)
# vegetable plots (밭) around the field
for (x0, y0) in ((3, 368), (3, 402), (3, 436)):             # vegetable plots (밭) beside the field
    rect(x0, y0, x0 + 20, y0 + 30, DIRT0, WOOD)
    for y in range(y0 + 2, y0 + 29, 4):
        rect(x0 + 2, y, x0 + 18, y + 1, (150, 116, 80))
        for x in range(x0 + 3, x0 + 18, 3):
            pt(x, y - 1, T2); pt(x, y, T1)

# ── 생태연못 (along LUX / dorm side, by the gate) ──
d.rounded_rectangle((235, 226, 268, 318), radius=10, fill=W1, outline=W0)
rect(234, 224, 269, 225, P1)
for _ in range(60):
    x, y = rnd.randrange(238, 266), rnd.randrange(230, 315)
    if pix[x, y] == W1:
        rect(x, y, x + 2, y, W2 if rnd.random() < .5 else W0)
for (x, y) in [(239, 236), (259, 240), (240, 296), (259, 306), (238, 258)]:          # lily pads
    d.ellipse((x, y, x + 5, y + 3), fill=T2, outline=T1); pt(x + 1, y + 1, PINK)
for (x, y) in [(242, 248), (262, 256), (240, 286), (262, 292)]:                       # carp (잉어)
    rect(x, y, x + 2, y, ORANGE); pt(x + 3, y, WHITE)
for (x, y) in [(237, 230), (266, 236), (237, 312), (266, 312), (236, 270)]:  # rocks
    d.ellipse((x - 2, y - 1, x + 2, y + 2), fill=S1, outline=S0); pt(x - 1, y, S2)
for (x, y) in [(238, 304), (240, 306), (265, 230), (263, 232), (267, 278), (265, 280)]:  # reeds
    rect(x, y - 3, x, y, T1); pt(x, y - 4, WOOD)
rect(249, 222, 255, 236, WOOD, OUT)                     # wooden pier into the pond
for y in range(224, 236, 2):
    rect(250, y, 254, y, WOOD_L)
rect(222, 310, 230, 314, WOOD, OUT); rect(223, 310, 229, 310, WOOD_L)   # wooden table by the pond
rect(223, 307, 229, 308, WOOD); rect(223, 316, 229, 317, WOOD)

# ── amphitheaters (semicircle, seats facing a stage) ──
def amph(cx, cy, r, canopy=False):
    for i in range(0, r - 4, 3):
        d.pieslice((cx - r + i, cy - r + i, cx + r - i, cy + r - i), 180, 360,
                   fill=(S2 if (i // 3) % 2 == 0 else S1), outline=OUT if i == 0 else None)
        d.arc((cx - r + i, cy - r + i, cx + r - i, cy + r - i), 180, 360, fill=S0 if i else OUT)
    rect(cx - r + 6, cy - 3, cx + r - 6, cy + 2, WOOD, OUT)            # stage
    rect(cx - r + 7, cy - 2, cx + r - 7, cy - 2, WOOD_L)
    if canopy:                                                          # 비막이 (rain shelter) over the stage
        rect(cx - r + 4, cy - 9, cx + r - 4, cy - 6, (232, 232, 236), OUT)
        rect(cx - r + 5, cy - 8, cx + r - 5, cy - 8, WHITE)
        rect(cx - r + 5, cy - 5, cx - r + 5, cy + 1, S0); rect(cx + r - 5, cy - 5, cx + r - 5, cy + 1, S0)


shade_ellipse(213, 140, 255, 172)
amph(232, 166, 20, canopy=True)   # 야외학습장 (behind the D–C bridge, against the hill)
shade_ellipse(9, 326, 47, 352)
amph(26, 348, 18)                  # 야외공연장 (opposite side, lower)

# ── basketball court (next to dorm B) ──
rect(210, 22, 264, 78, S0)
rect(212, 24, 262, 76, COURT0)
rect(216, 28, 258, 72, COURT1, WHITE)
d.line((216, 50, 258, 50), fill=WHITE)
d.ellipse((231, 44, 243, 56), outline=WHITE)
d.arc((226, 18, 248, 40), 0, 180, fill=WHITE); d.arc((226, 60, 248, 82), 180, 360, fill=WHITE)
rect(234, 28, 240, 34, (220, 120, 90)); rect(234, 66, 240, 72, (220, 120, 90))
rect(235, 25, 239, 25, WHITE, None); rect(235, 75, 239, 75, WHITE)
for x in range(210, 265, 3):                                           # chain-link fence
    pt(x, 21, S2); pt(x, 79, S2)
for y in range(21, 80, 3):
    pt(209, y, S2); pt(265, y, S2)

# ═════════════════════ BUILDINGS ═════════════════════
def facade(x0, y0, x1, floors, doors=(), open_floor=None):
    """brick facade; returns bottom y. floors drawn top→bottom, 7 px each"""
    y1 = y0 + floors * 7 + 3
    rect(x0, y0, x1, y1, B1)
    for y in range(y0, y1 + 1):
        r = y - y0
        if r % 3 == 2:
            rect(x0, y, x1, y, B0)
        else:
            off = 0 if (r // 3) % 2 == 0 else 3
            for x in range(x0 + off, x1 + 1, 6):
                pt(x, y, B0)
            if r % 3 == 0:
                for x in range(x0 + off + 2, x1, 6):
                    if rnd.random() < .45:
                        pt(x, y, B2)
    rect(x0, y0, x1, y0, CR); rect(x0, y0 + 1, x1, y0 + 1, B0)           # cornice
    nwin = (x1 - x0 - 5) // 7
    left = x0 + (x1 - x0 - (nwin * 7 - 1)) // 2
    for f in range(floors):
        fy = y0 + 2 + f * 7
        rect(x0 + 1, fy + 6, x1 - 1, fy + 6, B2 if f < floors - 1 else B1)     # slab band
        if open_floor == f:                                                       # open corridor (V홀 3F)
            rect(x0 + 2, fy + 1, x1 - 2, fy + 5, (60, 44, 52))
            rect(x0 + 2, fy + 5, x1 - 2, fy + 5, B2)
            for x in range(x0 + 4, x1 - 2, 7):
                rect(x, fy + 1, x + 1, fy + 5, CR)
            rect(x0 + 2, fy + 3, x1 - 2, fy + 3, S1)
            continue
        for i in range(nwin):
            wx = left + i * 7
            rect(wx, fy + 1, wx + 5, fy + 5, CR)
            rect(wx + 1, fy + 2, wx + 4, fy + 4, GL1)
            rect(wx + 1, fy + 2, wx + 4, fy + 2, GL0)
            pt(wx + 3, fy + 3, GL2); pt(wx + 4, fy + 3, GL2)
    for dcx in doors:                                                   # glass double doors + canopy + steps
        fy = y0 + 2 + (floors - 1) * 7
        rect(dcx - 4, fy + 1, dcx + 4, y1 - 1, CR)
        rect(dcx - 3, fy + 2, dcx + 3, y1 - 1, GL0)
        rect(dcx - 3, fy + 2, dcx - 1, fy + 2, GL2); pt(dcx, fy + 2, CR); rect(dcx, fy + 2, dcx, y1 - 1, CR)
        rect(dcx - 6, fy, dcx + 6, fy + 1, R2, None); rect(dcx - 6, fy + 1, dcx + 6, fy + 1, R0)
        rect(dcx - 5, y1 + 1, dcx + 5, y1 + 1, S2); rect(dcx - 6, y1 + 2, dcx + 6, y1 + 2, S1)
    rect(x0, y1, x1, y1, B0)
    return y1


def roof(x0, y0, x1, y1):
    rect(x0, y0, x1, y1, R1)
    rect(x0 + 1, y0 + 1, x1 - 1, y0 + 1, R2); rect(x0 + 1, y0 + 1, x0 + 1, y1 - 1, R2)  # lit parapet
    rect(x1 - 1, y0 + 1, x1 - 1, y1 - 1, R0 if False else R2)
    rect(x0 + 1, y1 - 1, x1 - 1, y1 - 1, R2)
    rect(x0 + 2, y0 + 2, x1 - 2, y0 + 2, R0); rect(x0 + 2, y0 + 2, x0 + 2, y1 - 2, R0)  # parapet shadow
    for y in range(y0 + 4, y1 - 1, 4):                                                    # roof membrane seams
        for x in range(x0 + 4, x1 - 2, 2):
            if (x + y) % 4 == 0:
                pt(x, y, (96, 106, 102))


def ac(x, y):
    rect(x, y, x + 5, y + 4, S1, OUT); rect(x + 1, y + 1, x + 4, y + 1, S2)
    d.ellipse((x + 1, y + 1, x + 4, y + 4), outline=S0); pt(x + 6, y + 1, R0); rect(x + 6, y + 1, x + 6, y + 5, R0)
    rect(x + 1, y + 5, x + 6, y + 5, R0)


def solar(x, y, w, h):
    rect(x, y, x + w, y + h, GL0, OUT)
    for xx in range(x + 2, x + w, 3):
        rect(xx, y + 1, xx, y + h - 1, (88, 128, 180))
    rect(x + 1, y + 1, x + w - 1, y + 1, GL1)
    rect(x + 1, y + h + 1, x + w + 1, y + h + 1, R0)


def railing(x0, x1, y):
    for x in range(x0, x1 + 1, 2):
        pt(x, y, S2)


def garden(x0, y0, x1, y1):
    rect(x0, y0, x1, y1, G1, T0)
    for y in range(y0 + 1, y1):
        for x in range(x0 + 1, x1):
            if (x * 7 + y * 3) % 5 == 0:
                pt(x, y, T2)
            elif (x * 5 + y * 11) % 17 == 0:
                pt(x, y, rnd.choice([RED, YEL, PINK, WHITE]))


def building(x0, y0, x1, roof_h, floors, doors=(), open_floor=None, cast=True):
    fy1 = y0 + roof_h + floors * 7 + 3
    if cast:
        shade(x1 + 1, y0 + 3, x1 + 4, fy1 + 2)
        shade(x0 + 3, fy1 + 1, x1 + 4, fy1 + 3)
    roof(x0, y0, x1, y0 + roof_h)
    facade(x0, y0 + roof_h, x1, floors, doors, open_floor)
    rect(x0, y0, x1, fy1, None, OUT)
    rect(x0, y0 + roof_h, x1, y0 + roof_h, OUT)
    return fy1


def bridge_h(x0, x1, y, glass=True):
    """horizontal sky bridge, seen from the front: roof strip + glass band"""
    shade(x0, y + 10, x1, y + 13)
    rect(x0, y, x1, y + 2, R2, OUT)
    rect(x0, y + 3, x1, y + 8, GL1 if glass else B1, OUT)
    if glass:
        rect(x0 + 1, y + 3, x1 - 1, y + 3, GL0)
        for x in range(x0 + 4, x1, 6):
            rect(x, y + 4, x, y + 7, CR)
            pt(x + 2, y + 5, GL2)
    rect(x0, y + 9, x1, y + 9, B0)


def bridge_v(x0, x1, y0, y1, covered=True):
    """short N–S sky bridge between stacked blocks (seen from above)"""
    shade(x1 + 1, y0, x1 + 2, y1)
    if covered:
        rect(x0, y0, x1, y1, R2, OUT)
        rect(x0 + 1, y0, x0 + 1, y1, GL1); rect(x1 - 1, y0, x1 - 1, y1, GL0)
    else:   # open-air bridge: brick deck with railings
        rect(x0, y0, x1, y1, B2, OUT)
        rect(x0 + 1, y0, x0 + 1, y1, S2); rect(x1 - 1, y0, x1 - 1, y1, S2)


# ── 기숙사 Ace Hall ──
A_Y1 = building(14, 4, 80, 18, 10, doors=(48,))          # A동 (tall, left)
C_Y1 = building(80, 16, 112, 14, 8, doors=(96,))         # C동 (annex beside A)
for x in (88, 104):
    ac(x - 3, 19)
B_Y1 = building(122, 46, 200, 16, 6, doors=(162,))       # B동 (lower, right)
ac(126, 50); ac(190, 50); solar(132, 49, 14, 4); solar(178, 49, 9, 4)
ac(18, 8); solar(18, 15, 10, 4); ac(71, 8)

# 3F outdoor passage V ↔ dorm (crosses the uphill path)
bridge_v(170, 178, B_Y1 + 1, 118, covered=False)

# ── V홀 (5F, curved): drawn flat on a layer then each column is bent ──
VX0, VX1, VY0 = 76, 188, 118
layer = Image.new('RGB', (VX1 - VX0 + 1, 16 + 5 * 7 + 4), (255, 0, 255))
_img, _d, _pix = img, d, pix
img = layer; d = ImageDraw.Draw(layer); d.fontmode = '1'; pix = layer.load()
roof(0, 0, VX1 - VX0, 16)
facade(0, 16, VX1 - VX0, 5, doors=(28, 84), open_floor=2)
rect(0, 0, VX1 - VX0, 16 + 5 * 7 + 3, None, OUT); rect(0, 16, VX1 - VX0, 16, OUT)
ac(10, 5); ac(96, 5); solar(20, 4, 14, 5); solar(78, 4, 14, 5)
img, d, pix = _img, _d, _pix
VW = VX1 - VX0
V_LEFT = (VW + 1 - ((VW + 1 - 5) // 7 * 7 - 1)) // 2     # same first-window x as facade()


def vbend(i):
    # bend only at the gaps between window pairs → every window stays whole
    seg = max(0, min(7, (i - V_LEFT + 1) // 14))
    return min(seg, 7 - seg, 3)           # 0,1,2,3,3,2,1,0 → centre pushed forward: gently curved bar
for i in range(VW + 1):
    oy = VY0 - 3 + vbend(i)
    shade(VX0 + i + 3, oy + layer.height, VX0 + i + 3, oy + layer.height + 2)
for i in range(VW + 1):
    oy = VY0 - 3 + vbend(i)
    col = layer.crop((i, 0, i + 1, layer.height))
    img.paste(col, (VX0 + i, oy))
shade(VX1 + 1, VY0, VX1 + 3, VY0 + layer.height - 2)
V_BOT = VY0 - 3 + 3 + layer.height       # ≈ bottom of the curved V block (centre)

# V–D bridges (3F open, 4F covered)
bridge_v(100, 108, V_BOT, 178, covered=False)
bridge_v(156, 164, V_BOT, 178, covered=True)

# ── D홀 (5F top bar) ──
D_Y1 = building(52, 178, 212, 18, 5, doors=(132,))
ac(58, 182); ac(66, 182); solar(76, 182, 18, 6); solar(170, 182, 18, 6); ac(196, 182); ac(204, 186)
# D–P (3–4F) and C–D (2–4F, 2F open) bridges
bridge_v(58, 66, D_Y1, 242)
bridge_v(198, 206, D_Y1, 242)
# D–LUX link
rect(212, 192, 216, 210, R2, OUT)

# ── LUX홀 (2F, multipurpose, roof gardens) ──
L_Y1 = building(216, 176, 264, 24, 2, doors=(240,))
garden(219, 179, 261, 185)
for x in range(219, 262, 2):
    pt(x, 178, S2)

# ── P홀 / C홀 wings (4F) ──
P_Y1 = building(30, 242, 72, 48, 4, doors=(51,))
C_Y1 = building(190, 242, 232, 48, 4, doors=(211,))
for (x0, x1) in ((30, 72), (190, 232)):
    ac(x0 + 4, 246); ac(x1 - 10, 246)
    solar(x0 + 5, 272, 12, 10); solar(x1 - 17, 272, 12, 10)
    railing(x0 + 3, x1 - 3, 285)
# P–C 3F glass bridge across the plaza mouth
bridge_h(72, 190, 300)

# ── 정문 + 경비실 (INFORMATION) ──
rect(246, 337, 264, 348, B1, OUT)                       # guard house
rect(246, 337, 264, 340, R1, OUT)
rect(249, 342, 254, 346, GL1, CR); rect(257, 342, 261, 348, GL0, CR)
shade(265, 339, 267, 350)
for (x, y) in ((262, 315), (262, 335)):                 # gate pillars
    rect(x, y, x + 6, y + 6, B1, OUT); rect(x, y, x + 6, y + 1, CR, OUT)
    shade(x + 7, y + 2, x + 8, y + 7)
rect(264, 323, 266, 335, S0)                            # sliding gate rail
for y in range(324, 335, 2):
    pt(265, y, S2)

# ── 소각장 (behind the field's vehicle entrance, low wall) ──
rect(262, 448, 269, 474, S1, OUT)
rect(263, 452, 268, 461, S0, OUT); rect(264, 449, 266, 452, B0, OUT)
for y in range(462, 474, 2):
    pt(263, y, S2)

# ═════════════════════ TREES & PROPS ═════════════════════
KEEP = {}   # important art the labels must not cover: name -> box


def tree(x, y, big=False):
    r = 6 if big else 4
    KEEP[f'tree@{x},{y}'] = (x - r, y - r, x + r + 2, y + r + 3)
    shade_ellipse(x - r + 2, y + r - 2, x + r + 4, y + r + 3)
    rect(x, y + r - 1, x + 1, y + r + 2, TRUNK)
    d.ellipse((x - r, y - r, x + r + 1, y + r), fill=T1, outline=T0)
    d.ellipse((x - r + 1, y - r + 1, x + r - 1, y + r - 2), fill=T1)
    d.ellipse((x - r + 1, y - r + 1, x + 1, y), fill=T2)
    pt(x - r + 3, y - r + 2, G3); pt(x - r + 2, y - r + 3, G3)
    rect(x - r + 2, y + r - 1, x + r - 1, y + r - 1, T0)


def hedge(x0, y0, x1, y1):
    rect(x0, y0, x1, y1, T1, T0)
    rect(x0 + 1, y0 + 1, x1 - 1, y0 + 1, T2)
    for x in range(x0 + 2, x1, 3):
        pt(x, y0 + 2, T2)


def flowerbed(x0, y0, x1, y1):
    rect(x0, y0, x1, y1, (120, 80, 52), WOOD)
    for y in range(y0 + 1, y1):
        for x in range(x0 + 1, x1):
            if (x + y) % 2 == 0:
                pt(x, y, [RED, YEL, PINK, WHITE][(x // 2 + y) % 4])
            else:
                pt(x, y, T1)


def lamp(x, y):
    rect(x, y - 6, x, y, S0); rect(x - 1, y - 8, x + 1, y - 7, YEL, None); pt(x, y - 9, OUT)
    pt(x + 1, y + 1, GS)


def bench(x, y):
    rect(x, y, x + 6, y + 1, WOOD_L); rect(x, y + 2, x + 6, y + 2, WOOD); pt(x, y + 3, OUT); pt(x + 6, y + 3, OUT)


# plaza dressing: planters with trees, benches, lamps, sculpture '서 있는 사람'
for (x, y) in ((84, 248), (178, 248), (84, 294), (178, 294)):
    rect(x - 6, y + 2, x + 6, y + 8, S1, S0)
    tree(x, y)
for (x0, x1) in ((96, 106), (156, 166)):
    flowerbed(x0, 262, x1, 266)
for x in (100, 156):
    bench(x, 272)
for x in (78, 184):
    lamp(x, 276)
for i, (x, h) in enumerate(((128, 10), (131, 13), (134, 9))):       # three-stick sculpture
    shade(x + 1, 268, x + 3, 269)
    rect(x, 268 - h, x, 268, (200, 200, 208)); pt(x, 268 - h, WHITE)
rect(125, 268, 137, 270, S1, S0)

# hedges along walks
hedge(4, 115, 66, 117)
hedge(76, 346, 110, 349); hedge(154, 346, 232, 349)
hedge(4, 346, 8, 349)
hedge(242, 115, 268, 117)
flowerbed(76, 324, 108, 330); flowerbed(156, 324, 188, 330)
flowerbed(214, 222, 232, 226)

# trees (back → front)
TREES = [
    (4, 12, 1), (6, 34, 0), (5, 52, 1), (6, 76, 0), (116, 8, 1), (116, 30, 0), (206, 6, 1), (269, 8, 0),
    (116, 92, 0), (204, 92, 1), (264, 94, 0), (88, 96, 0), (8, 94, 0),
    (200, 150, 0), (264, 150, 0),
    (70, 126, 0), (72, 170, 0), (10, 176, 0), (24, 170, 1), (40, 172, 0),
    (14, 272, 1),                                          # 잔디광장's single tree
    (224, 336, 0), (6, 334, 0), (172, 338, 0), (200, 336, 1),
]
for (x, y, big) in sorted(TREES, key=lambda t: t[1]):
    tree(x, y, bool(big))
for (x, y) in ((50, 116), (130, 116), (230, 116), (60, 362), (150, 362), (230, 230), (230, 300)):
    lamp(x, y)
for (x, y) in ((214, 108), (96, 120)):
    bench(x, y)

# scattered wildflowers on grass
for _ in range(90):
    x, y = rnd.randrange(W), rnd.randrange(H)
    if pix[x, y] in (G1, G0, G2):
        pt(x, y, rnd.choice([RED, YEL, WHITE, PINK]))

# ═════════════════════ LABELS ═════════════════════
LABELS = []


def label(cx, cy, text, kind='area', vertical=False):
    """name plate centred at (cx, cy). kind: 'bld' (dark plate) or 'area' (cream plate)"""
    bg, fg = (BLD_BG, SIGN_BG) if kind == 'bld' else (SIGN_BG, OUT)
    if vertical:
        w, h = 16, len(text) * 13 + 3
    else:
        bb = d.textbbox((0, 0), text, font=FONT)
        w, h = bb[2] + 6, 15
    x0, y0 = int(cx - w / 2), int(cy - h / 2)
    x1, y1 = x0 + w - 1, y0 + h - 1
    rect(x0 + 1, y0 + 1, x1 + 1, y1 + 1, OUT)                       # drop shadow
    rect(x0, y0, x1, y1, bg, OUT)
    rect(x0 + 1, y0 + 1, x1 - 1, y0 + 1, (255, 255, 255) if kind != 'bld' else (100, 84, 110))
    if vertical:
        for i, ch in enumerate(text):
            cw = d.textbbox((0, 0), ch, font=FONT)[2]
            d.text((x0 + (w - cw) // 2, y0 + 2 + i * 13), ch, font=FONT, fill=fg)
    else:
        d.text((x0 + 3, y0 + 1), text, font=FONT, fill=fg)
    LABELS.append((text, (x0, y0, x1 + 1, y1 + 1)))


# buildings (plates on the flat roofs, details kept clear)
label(47, 13, '기숙사 A동', 'bld')
label(96, 23, 'C동', 'bld')
label(161, 56, 'B동', 'bld')
label(132, 122, 'V홀 식당·도서관', 'bld')
label(132, 187, 'D홀', 'bld')
label(240, 194, 'LUX홀', 'bld')
label(51, 259, 'P홀', 'bld')
label(211, 259, 'C홀', 'bld')
# open areas
label(237, 89, '농구장')
label(232, 133, '야외학습장')
label(131, 242, 'World Plaza')
label(14, 220, '잔디광장', vertical=True)
label(252, 270, '생태연못', vertical=True)
label(246, 328, '정문')
label(80, 338, '야외공연장')
label(146, 404, '운동장')

KEEP.update({
    '야외학습장 seats': (212, 146, 253, 169), '야외공연장 seats': (8, 330, 45, 351),
    'gate pillar N': (262, 315, 269, 322), 'gate pillar S': (262, 335, 269, 342), 'guard house': (246, 337, 265, 349),
    'sculpture': (125, 256, 138, 271), 'plaza stair': (123, 277, 140, 289), 'court lines': (216, 28, 259, 73),
    'pond table': (222, 306, 231, 318), 'pond pier': (249, 222, 256, 237), 'fountain(식수대)': (166, 361, 172, 367),
})

# ── automated overlap check ──
def check_labels():
    ok = True
    for name, (x0, y0, x1, y1) in LABELS:
        if x0 < 0 or y0 < 0 or x1 > W or y1 > H:
            print('OUT OF BOUNDS:', name, (x0, y0, x1, y1)); ok = False
    for i in range(len(LABELS)):
        for j in range(i + 1, len(LABELS)):
            a, b = LABELS[i][1], LABELS[j][1]
            if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                print('OVERLAP:', LABELS[i][0], LABELS[j][0]); ok = False
    for name, a in LABELS:
        for kname, b in KEEP.items():
            if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                print('COVERS ART:', name, '->', kname); ok = False
    print(f'label check: {len(LABELS)} labels, {"OK - no overlaps, all inside" if ok else "FAILED"}')
    for name, (x0, y0, x1, y1) in LABELS:
        print(f'  {name:<12} box=({x0},{y0})-({x1},{y1})  centre=({(x0 + x1) / 2 / W:.2f}, {(y0 + y1) / 2 / H:.2f})')
    assert ok


check_labels()

out = os.path.join(ROOT, 'web', 'img', 'map.png')
img.resize((W * SCALE, H * SCALE), Image.Resampling.NEAREST).save(out, optimize=True)
print(out, img.size, '→', (W * SCALE, H * SCALE))
