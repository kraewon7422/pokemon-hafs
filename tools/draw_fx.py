"""가방 물건 아이콘 (web/img/items.png) + 상태 이상 효과 (web/img/fx.png) 를 그린다. 16×16 도트, 1px 어두운 외곽선.
- 잠듦(Zzz)·혼란(별)·풀죽음(땀) 은 Kenney Emotes Pack (CC0, kenney.nl) 을 다듬어 씀 — web/img/fx/CREDITS.txt. 나머지는 직접 그림.
- 아이콘 순서 = ITEM_ICONS (앱의 web/js/bag.js 와 같아야 함). 기술머신은 타입 색 원반 TM_TYPES 순서.
사용법: python tools/draw_fx.py  (Kenney 팩 경로는 KENNEY 환경 변수, 없으면 .work/research/fx 에서 찾음)"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KENNEY = os.environ.get('KENNEY', os.path.join(ROOT, '.work', 'research', 'fx', 'kenney_emotes-pack', 'PNG', 'Pixel', 'Style 8'))
OUTLINE = (26, 28, 44, 255)
TYPE_COLOR = {'국어': '#d84a78', '수학': '#4a5cc8', '영어': '#7fd8e6', '물리': '#5a7ab0', '화학': '#e0682a', '생명': '#3e9a48',
              '지구': '#9a7044', '지리': '#2f8fb8', '정치경제': '#5a4a8a', '윤리': '#e8b8e0', '역사': '#8a6420', '외국어': '#f0c040',
              '정보': '#2a8070', '체육': '#b82a22', '음악': '#f4b8c8', '보통': '#a8a090', '전설': '#d8a830'}
TM_TYPES = list(TYPE_COLOR)
SUBJ = TM_TYPES[:15]


def rgb(c, a=255):
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def shade(c, k):
    r, g, b, a = c
    f = (lambda v: max(0, min(255, int(v * k))))
    return (f(r), f(g), f(b), a)


def outline(im):
    px = im.load()
    w, h = im.size
    add = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0 and any(0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] > 0 and px[x + dx, y + dy] != OUTLINE
                                         for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                add.append((x, y))
    for p in add:
        px[p] = OUTLINE
    return im


def canvas():
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def book(col):
    im, d = canvas()
    c = rgb(col)
    d.rectangle((3, 2, 12, 13), fill=c)
    d.rectangle((3, 2, 4, 13), fill=shade(c, 0.7))           # 책등
    d.rectangle((11, 3, 12, 13), fill=(240, 236, 220, 255))   # 종이
    d.rectangle((6, 5, 9, 6), fill=shade(c, 1.35))            # 제목 띠
    return outline(im)


def glasses():
    im, d = canvas()
    for x in (1, 9):
        d.ellipse((x, 5, x + 5, 10), fill=(170, 220, 250, 255), outline=(60, 60, 70, 255))
    d.line((7, 7, 8, 7), fill=(60, 60, 70, 255))
    d.point((3, 6), fill=(255, 255, 255, 255)); d.point((11, 6), fill=(255, 255, 255, 255))
    return outline(im)


def clover():
    im, d = canvas()
    g = rgb('#3fae4a')
    for cx, cy in ((7, 3), (3, 7), (11, 7), (7, 10)):
        d.ellipse((cx - 2, cy - 2, cx + 2, cy + 2), fill=g)
    d.rectangle((7, 7, 8, 8), fill=shade(g, 1.3))
    d.line((8, 12, 10, 14), fill=shade(g, 0.6))
    return outline(im)


def milk():
    im, d = canvas()
    d.polygon([(4, 5), (8, 2), (12, 5)], fill=(200, 160, 120, 255))
    d.rectangle((4, 5, 12, 14), fill=(120, 72, 40, 255))
    d.rectangle((5, 8, 11, 11), fill=(245, 235, 220, 255))
    d.rectangle((6, 9, 10, 10), fill=(150, 90, 50, 255))
    return outline(im)


def cushion():
    im, d = canvas()
    r = rgb('#d04848')
    d.rounded_rectangle((2, 4, 13, 12), radius=3, fill=r)
    for x in (5, 8, 11):
        d.point((x, 8), fill=shade(r, 1.5))
    d.line((3, 5, 12, 5), fill=shade(r, 1.25))
    return outline(im)


def clock():
    im, d = canvas()
    d.ellipse((2, 3, 13, 14), fill=(250, 250, 240, 255), outline=(200, 60, 60, 255))
    d.ellipse((1, 1, 4, 4), fill=(200, 60, 60, 255)); d.ellipse((11, 1, 14, 4), fill=(200, 60, 60, 255))
    d.line((7, 8, 7, 5), fill=(30, 30, 40, 255)); d.line((7, 8, 10, 8), fill=(30, 30, 40, 255))
    return outline(im)


def mask():
    im, d = canvas()
    d.rounded_rectangle((3, 5, 12, 11), radius=2, fill=(245, 248, 255, 255))
    d.line((4, 7, 11, 7), fill=(200, 210, 230, 255)); d.line((4, 9, 11, 9), fill=(200, 210, 230, 255))
    d.line((1, 5, 3, 7), fill=(150, 160, 190, 255)); d.line((14, 5, 12, 7), fill=(150, 160, 190, 255))
    return outline(im)


def hotpack():
    im, d = canvas()
    o = rgb('#f08a30')
    d.rounded_rectangle((3, 3, 12, 13), radius=2, fill=o)
    for y in (6, 9):
        d.line((5, y, 6, y - 1), fill=(255, 230, 120, 255)); d.line((7, y - 1, 8, y), fill=(255, 230, 120, 255)); d.line((9, y, 10, y - 1), fill=(255, 230, 120, 255))
    return outline(im)


def bandage():
    im, d = canvas()
    d.polygon([(2, 10), (10, 2), (14, 6), (6, 14)], fill=(236, 196, 150, 255))
    d.polygon([(6, 6), (8, 4), (12, 8), (10, 10)], fill=(250, 232, 210, 255))
    for p in ((8, 7), (9, 8), (7, 8)):
        d.point(p, fill=(200, 150, 110, 255))
    return outline(im)


def ointment():
    im, d = canvas()
    d.polygon([(2, 6), (11, 6), (12, 10), (2, 10)], fill=(245, 245, 250, 255))
    d.rectangle((12, 7, 14, 9), fill=(220, 60, 60, 255))
    d.rectangle((4, 7, 9, 8), fill=(80, 160, 230, 255))
    return outline(im)


def iv():
    im, d = canvas()
    d.rounded_rectangle((4, 1, 11, 10), radius=2, fill=(190, 230, 250, 255))
    d.rectangle((5, 5, 10, 9), fill=(110, 190, 240, 255))
    d.line((7, 11, 7, 14), fill=(150, 160, 190, 255)); d.line((8, 11, 8, 14), fill=(150, 160, 190, 255))
    return outline(im)


def mint():
    im, d = canvas()
    d.ellipse((3, 3, 12, 12), fill=(250, 250, 250, 255))
    for a, b in (((5, 4), (5, 11)), ((8, 3), (8, 12)), ((11, 5), (11, 10))):
        d.line(a + b, fill=(70, 190, 120, 255))
    d.polygon([(1, 5), (3, 7), (1, 9)], fill=(70, 190, 120, 255)); d.polygon([(14, 5), (12, 7), (14, 9)], fill=(70, 190, 120, 255))
    return outline(im)


def energy():
    im, d = canvas()
    d.rectangle((4, 2, 11, 14), fill=(40, 44, 60, 255))
    d.rectangle((4, 2, 11, 3), fill=(180, 190, 200, 255))
    d.polygon([(8, 5), (6, 9), (8, 9), (7, 12), (10, 7), (8, 7), (9, 5)], fill=(250, 220, 40, 255))
    return outline(im)


def firstaid():
    im, d = canvas()
    d.rectangle((2, 4, 13, 13), fill=(250, 250, 250, 255))
    d.rectangle((6, 2, 9, 4), fill=(200, 200, 210, 255))
    d.rectangle((7, 6, 8, 11), fill=(220, 40, 40, 255)); d.rectangle((5, 8, 10, 9), fill=(220, 40, 40, 255))
    return outline(im)


def candy():
    im, d = canvas()
    b = rgb('#4a7ae0')
    d.ellipse((4, 4, 11, 11), fill=b)
    d.polygon([(1, 4), (4, 7), (1, 10)], fill=shade(b, 1.3)); d.polygon([(14, 4), (11, 7), (14, 10)], fill=shade(b, 1.3))
    d.point((6, 6), fill=(255, 255, 255, 255)); d.line((5, 9, 10, 9), fill=shade(b, 0.7))
    return outline(im)


def disc(col, star=False):
    im, d = canvas()
    c = rgb(col)
    d.ellipse((1, 1, 14, 14), fill=c)
    d.ellipse((3, 3, 12, 12), outline=shade(c, 1.3))
    d.ellipse((6, 6, 9, 9), fill=(250, 250, 250, 255))
    d.point((7, 7), fill=OUTLINE)
    if star:
        for p in ((3, 2), (2, 3), (3, 3), (4, 3), (3, 4)):
            d.point(p, fill=(255, 255, 255, 255))
    return outline(im)


# key → 그리기. 순서가 아이콘 위치 (bag.js ITEM_ICONS 와 같게)
ITEM_ICONS = [(f'boost{i + 1:02d}', (lambda c=TYPE_COLOR[t]: book(c))) for i, t in enumerate(SUBJ)] + [
    ('glasses', glasses), ('lucky', clover), ('choco', milk), ('cushion', cushion), ('clock', clock), ('mask', mask), ('hotpack', hotpack),
    ('bandage', bandage), ('ointment', ointment), ('iv', iv), ('mint', mint), ('energy', energy), ('firstaid', firstaid), ('candy', candy),
] + [(f'tm:{t}', (lambda c=TYPE_COLOR[t], s=(t == '전설'): disc(c, s))) for t in TM_TYPES]


# ── 상태 효과 (2 프레임) ──
def fx_par(f):
    im, d = canvas()
    y = (lambda v: v + f)
    for x0 in ((2, 9) if f == 0 else (5, 11)):
        d.line((x0, y(1), x0 + 3, y(5)), fill=(255, 230, 40, 255)); d.line((x0 + 3, y(5), x0, y(8)), fill=(255, 230, 40, 255))
        d.line((x0, y(8), x0 + 3, y(12)), fill=(255, 250, 180, 255))
    return outline(im)


def fx_brn(f):
    im, d = canvas()
    s = 1 if f else 0
    d.polygon([(8, 1 + s), (13, 9), (11, 14), (5, 14), (3, 9), (6, 6 - s)], fill=(240, 80, 40, 255))
    d.polygon([(8, 6 + s), (10, 11), (8, 14), (6, 11)], fill=(255, 210, 60, 255))
    return outline(im)


def fx_psn(f):
    im, d = canvas()
    for cx, cy, r in (((4, 12, 2), (10, 8, 3), (6, 3, 2)) if f == 0 else ((5, 10, 2), (11, 5, 2), (7, 13, 3))):
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(170, 80, 200, 255))
        d.point((cx - 1, cy - 1), fill=(230, 180, 250, 255))
    return outline(im)


def fx_frz(f):
    im, d = canvas()
    c = (170, 230, 255, 255)
    d.line((7, 1, 7, 14), fill=c); d.line((1, 7, 14, 7), fill=c)
    d.line((3, 3, 11, 11), fill=c); d.line((11, 3, 3, 11), fill=c)
    d.rectangle((6, 6, 8, 8), fill=(240, 252, 255, 255))
    if f:
        for p in ((7, 1), (1, 7), (14, 7), (7, 14)):
            d.point(p, fill=(255, 255, 255, 255))
    return outline(im)


def fx_heal(f):
    im, d = canvas()
    g = (90, 220, 120, 255)
    o = 0 if f == 0 else -2
    d.rectangle((6, 4 + o, 9, 13 + o), fill=g); d.rectangle((3, 7 + o, 12, 10 + o), fill=g)
    d.point((2, 2 + (2 if f else 0)), fill=(255, 255, 255, 255)); d.point((13, 3), fill=(255, 255, 255, 255))
    return outline(im)


def kenney(name, recolor=None, f=0):
    im = Image.open(os.path.join(KENNEY, name + '.png')).convert('RGBA')
    if recolor:
        px = im.load()
        for y in range(16):
            for x in range(16):
                r, g, b, a = px[x, y]
                if a and r + g + b < 200:
                    px[x, y] = recolor
    if f:
        im = im.transpose(Image.FLIP_LEFT_RIGHT) if name != 'emote_sleeps' else im.transform(im.size, Image.AFFINE, (1, 0, 0, 0, 1, 1))
    return im


FX = [('par', fx_par), ('brn', fx_brn), ('psn', fx_psn), ('frz', fx_frz), ('heal', fx_heal),
      ('slp', lambda f: kenney('emote_sleeps', (240, 244, 255, 255), f)),
      ('cnf', lambda f: kenney('emote_stars', None, f)),
      ('flinch', lambda f: kenney('emote_drops', None, f))]



# ── 알 (0027): web/img/eggs.png — 칸 32×40, 순서 EGG_CELLS (앱의 web/js/eggs.js 와 같아야 함)
# 초록·노랑·보라 점박이 알 (흰 바탕 + 색 점), 금 간 알 (부화 직전), 부화기 (유리 덮개 + 받침) 안의 알, 빈 부화기
EGG_TIER = {'green': '#58b848', 'yellow': '#f0c030', 'purple': '#9a58d0'}
EGG_W, EGG_H = 32, 40


def egg_body(d, ox, oy, col, crack=False):
    """알 하나 (18×22) 를 (ox, oy) 왼쪽 위에. 위가 좁은 달걀 모양 + 왼쪽 위 빛 + 오른쪽 아래 그늘 + 색 점."""
    base = rgb('#f8f4e8'); lit = rgb('#ffffff'); dark = rgb('#d8d0bc'); c = rgb(col); cd = shade(c, .78)
    w, h = 18, 22
    import math
    for y in range(h):
        v = (y + .5) / h * 2 - 1                         # -1 (위) … 1 (아래)
        # 달걀 곡선: 타원에 아래쪽을 조금 더 넓게 (위는 뾰족, 아래는 둥글게)
        half = (w / 2) * math.sqrt(max(0, 1 - v * v)) * (1 + .16 * v) / 1.06
        x0 = int(round(w / 2 - half)); x1 = int(round(w / 2 + half)) - 1
        for x in range(x0, x1 + 1):
            u = (x - x0) / max(1, x1 - x0)
            col_ = base
            if u + (v + 1) * .18 > .95: col_ = dark                       # 오른쪽 아래 그늘
            if u < .32 and -.75 < v < -.1 and u > .08: col_ = lit         # 왼쪽 위 빛
            d.point((ox + x, oy + y), fill=col_)
    # 색 점 (크기 다른 점 6개)
    for sx, sy, r in ((4, 5, 2), (11, 3, 1), (12, 10, 3), (4, 13, 2), (9, 17, 2), (14, 16, 1)):
        for yy in range(-r, r + 1):
            for xx in range(-r, r + 1):
                if xx * xx + yy * yy <= r * r + (1 if r > 1 else 0):
                    px_, py_ = ox + sx + xx, oy + sy + yy
                    if d.im.getpixel((px_, py_))[3] > 0:
                        d.point((px_, py_), fill=cd if xx + yy > 0 else c)
    if crack:
        for x, y in ((3, 9), (4, 10), (5, 9), (6, 8), (7, 9), (8, 10), (9, 11), (10, 10), (11, 9), (12, 10), (13, 11), (14, 10), (8, 11), (8, 12), (12, 11), (12, 12)):
            d.point((ox + x, oy + y), fill=OUTLINE)


def incubator(d, ox, oy, glow):
    """부화기: 아래 받침 (짙은 남색 + 빛나는 띠) + 위 유리 덮개 (밝은 하늘색 테두리)."""
    g = rgb(glow); gd = shade(g, .7)
    # 받침
    for y in range(31, 39):
        inset = 3 if y < 33 else 2
        for x in range(inset, EGG_W - inset):
            c = rgb('#2c3c5c') if y >= 34 else rgb('#46587c')
            d.point((ox + x, oy + y), fill=c)
    for x in range(5, EGG_W - 5):
        d.point((ox + x, oy + 33), fill=g if (x // 2) % 2 == 0 else gd)
    # 유리 덮개 (반투명) + 테
    glass = (176, 224, 248, 46); rim = (220, 244, 255, 230); shine = (255, 255, 255, 170)
    for y in range(4, 31):
        for x in range(5, EGG_W - 5):
            top = y < 8
            if top and (x - 16) ** 2 / 121 + (y - 8) ** 2 / 16 > 1: continue
            edge = x in (5, EGG_W - 6) or (top and (x - 16) ** 2 / 121 + (y - 8) ** 2 / 16 > .72)
            d.point((ox + x, oy + y), fill=rim if edge else glass)
    for y in range(9, 26):
        d.point((ox + 8, oy + y), fill=shine)
    for y in range(11, 18):
        d.point((ox + 10, oy + y), fill=shine)


def egg_cell(kind, tier=None):
    im = Image.new('RGBA', (EGG_W, EGG_H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if kind == 'inc':
        incubator(d, 0, 0, '#58d0f0' if tier is None else EGG_TIER[tier])
        if tier:
            e = Image.new('RGBA', (EGG_W, EGG_H), (0, 0, 0, 0)); ed = ImageDraw.Draw(e)
            egg_body(ed, 7, 9, EGG_TIER[tier]); outline(e)
            # 덮개 뒤에 알 → 알을 먼저, 그 위에 반투명 유리
            back = Image.new('RGBA', (EGG_W, EGG_H), (0, 0, 0, 0)); bd = ImageDraw.Draw(back)
            incubator(bd, 0, 0, EGG_TIER[tier])
            px = back.load()
            out = Image.new('RGBA', (EGG_W, EGG_H), (0, 0, 0, 0))
            out.alpha_composite(back)
            # 유리 부분은 알 위에 다시 칠함 (알 → 유리 순)
            solid = back.copy(); sp = solid.load()
            for y in range(EGG_H):
                for x in range(EGG_W):
                    if sp[x, y][3] < 200: sp[x, y] = (0, 0, 0, 0)
            out = Image.new('RGBA', (EGG_W, EGG_H), (0, 0, 0, 0))
            out.alpha_composite(solid)
            out.alpha_composite(e)
            glass_only = back.copy(); gp = glass_only.load()
            for y in range(EGG_H):
                for x in range(EGG_W):
                    if gp[x, y][3] >= 200: gp[x, y] = (0, 0, 0, 0)
            out.alpha_composite(glass_only)
            return out
        return im
    egg_body(d, 7, 16, EGG_TIER[tier], crack=(kind == 'crack'))
    # 바닥 그림자
    for x in range(9, 23):
        d.point((x, 38), fill=(0, 0, 0, 60))
    return outline(im)


EGG_CELLS = [('egg', t) for t in EGG_TIER] + [('crack', t) for t in EGG_TIER] + [('inc', t) for t in EGG_TIER] + [('inc', None)]


def draw_eggs():
    sheet = Image.new('RGBA', (EGG_W * len(EGG_CELLS), EGG_H), (0, 0, 0, 0))
    for i, (k, t) in enumerate(EGG_CELLS):
        sheet.alpha_composite(egg_cell(k, t), (EGG_W * i, 0))
    sheet.save(os.path.join(ROOT, 'web', 'img', 'eggs.png'))
    prev = Image.new('RGBA', sheet.size, (240, 236, 216, 255)); prev.alpha_composite(sheet)
    prev.resize((prev.width * 6, prev.height * 6), Image.NEAREST).save(os.path.join(ROOT, '.work', 'eggs_preview.png'))
    print('eggs', EGG_CELLS)


def main():
    sheet = Image.new('RGBA', (16 * len(ITEM_ICONS), 16), (0, 0, 0, 0))
    for i, (k, fn) in enumerate(ITEM_ICONS):
        sheet.alpha_composite(fn(), (16 * i, 0))
    os.makedirs(os.path.join(ROOT, 'web', 'img', 'fx'), exist_ok=True)
    sheet.save(os.path.join(ROOT, 'web', 'img', 'items.png'))
    fx = Image.new('RGBA', (32, 16 * len(FX)), (0, 0, 0, 0))
    for r, (k, fn) in enumerate(FX):
        for f in (0, 1):
            fx.alpha_composite(fn(f), (16 * f, 16 * r))
    fx.save(os.path.join(ROOT, 'web', 'img', 'fx', 'status.png'))
    prev = Image.new('RGBA', (sheet.width, 16 + 4 + fx.height), (40, 48, 72, 255))
    prev.alpha_composite(sheet, (0, 0))
    prev.alpha_composite(fx, (0, 20))
    prev.resize((prev.width * 4, prev.height * 4), Image.NEAREST).save(os.path.join(ROOT, '.work', 'items_preview.png'))
    print('items', [k for k, _ in ITEM_ICONS])
    print('fx', [k for k, _ in FX])
    draw_eggs()


if __name__ == '__main__':
    main()
