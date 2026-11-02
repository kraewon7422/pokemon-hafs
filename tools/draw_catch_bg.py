"""잡기 화면 배경 (web/img/catch/day.png · sunset.png · night.png, 270×480) 을 CC0 그림 조각으로 합친다.
- 낮 하늘·구름: "Sunny Land" (ansimuz, CC0) back.png  /  나무 줄: 타이틀 sky.png 아랫부분 (Kenney Tiny Town, CC0)
- 노을 하늘·구름·초록 산: "Background Clouds And Mountains Parallax" (FabinhoSC, CC0)
- 밤 하늘·달·산·나무: "Mountain at Dusk" (ansimuz, CC0)
- 풀밭: 타이틀 grass.png (Kenney Tiny Town, CC0) 를 원근으로 깔고, 몬스터가 설 밝은 자리를 그림
조각 위치: .work/dl/bg (Sunny Land, Tiny Town) · .work/bgdl (FabinhoSC, ansimuz). 사용법: python tools/draw_catch_bg.py"""
import math
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 270, 480
HOR = 236                     # 땅이 시작하는 줄 (지평선)
SPOT = (W // 2, 352)          # 몬스터가 설 자리 (catch.js 와 같아야 함)
FAB = os.path.join(ROOT, '.work', 'bgdl', 'background_clouds_and_mountains_parallax', 'Background_Clouds_And_Mountains_Parallax_', 'Layers')
DUSK = os.path.join(ROOT, '.work', 'bgdl', 'parallax_mountain_pack', 'parallax_mountain_pack', 'layers')
SUNNY = os.path.join(ROOT, '.work', 'dl', 'bg', 'back.png')
TITLE = os.path.join(ROOT, 'web', 'img', 'title')


def load(*p):
    return Image.open(os.path.join(*p)).convert('RGBA')


def tint(im, rgb, k):
    """색을 rgb 쪽으로 k 만큼 섞음 (알파는 그대로)."""
    px = im.load(); out = im.copy(); po = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a: po[x, y] = (int(r + (rgb[0] - r) * k), int(g + (rgb[1] - g) * k), int(b + (rgb[2] - b) * k), a)
    return out


def tile_x(img, width):
    """가로로 이어 붙여 width 만큼."""
    out = Image.new('RGBA', (width, img.height))
    for x in range(0, width, img.width):
        out.alpha_composite(img, (x, 0))
    return out


def ground(tintc=None, k=0.0, light=(1.0, 1.0, 1.0)):
    """지평선 아래 풀밭: grass.png 를 원근으로 (멀수록 촘촘하고 어둡게) + 몬스터 자리."""
    src = load(TITLE, 'grass.png'); sp = src.load(); S = src.width
    g = Image.new('RGBA', (W, H - HOR)); gp = g.load()
    for y in range(H - HOR):
        z = 34.0 / (y + 6)                                   # 깊이 (가까울수록 작음)
        fade = 0.62 + 0.38 * min(1, y / 120)                 # 멀수록 어둡게
        for x in range(W):
            u = int(((x - W / 2) * z * 0.9 + 4096) % S)
            v = int((z * 160 + 4096) % S)
            r, gg, b, a = sp[u, v]
            gp[x, y] = (int(r * fade * light[0]), int(gg * fade * light[1]), int(b * fade * light[2]), 255)
    # 몬스터가 설 밝은 흙·풀 자리 (타원 2겹) + 테두리 그림자
    d = ImageDraw.Draw(g)
    cx, cy = SPOT[0], SPOT[1] - HOR
    d.ellipse((cx - 74, cy - 17, cx + 74, cy + 17), fill=(int(150 * light[0]), int(196 * light[1]), int(96 * light[2]), 255))
    d.ellipse((cx - 62, cy - 12, cx + 62, cy + 12), fill=(int(176 * light[0]), int(214 * light[1]), int(116 * light[2]), 255))
    d.arc((cx - 74, cy - 17, cx + 74, cy + 17), 0, 180, fill=(int(96 * light[0]), int(140 * light[1]), int(64 * light[2]), 255), width=2)
    if tintc:
        g = tint(g, tintc, k)
    return g


def day():
    sky = load(SUNNY).crop((57, 0, 57 + W, 104))
    top = sky.getpixel((W // 2, 0))
    im = Image.new('RGBA', (W, H), top)
    y0 = HOR - 104 - 40
    d = ImageDraw.Draw(im)
    for y in range(y0):                                   # 위로 갈수록 조금 진한 하늘 → 구름 띠 첫 줄 색으로 이어짐
        k = 1 - y / y0
        d.line((0, y, W, y), fill=(int(top[0] - 46 * k), int(top[1] - 70 * k), int(top[2] - 10 * k), 255))
    im.alpha_composite(sky, (0, y0))
    for y in range(y0 + 104, HOR):                        # 구름 띠 아래 ~ 산 사이 빈 곳 = 연한 하늘
        d.line((0, y, W, y), fill=sky.getpixel((W // 2, 103)))
    far = tint(load(FAB, 'BackgroundMuntain02.png'), (170, 210, 240), 0.55)        # 아주 먼 산 (흐리게)
    im.alpha_composite(far, (0, HOR - far.height + 2))
    mt = tint(load(FAB, 'BackgroundMountain_01.png'), (150, 200, 220), 0.25)       # 먼 산
    im.alpha_composite(mt, (0, HOR - mt.height + 8))
    im.alpha_composite(ground(), (0, HOR))
    return im


def sunset():
    full = Image.new('RGBA', (W, H))
    d = ImageDraw.Draw(full)
    stops = [(0, (58, 40, 104)), (0.45, (176, 72, 120)), (0.75, (246, 128, 88)), (1.0, (255, 196, 120))]
    for y in range(HOR):
        t = y / HOR
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                k = (t - t0) / (t1 - t0)
                k = round(k * 6) / 6                        # 띠 모양 (도트 느낌)
                d.line((0, y, W, y), fill=tuple(int(c0[i] + (c1[i] - c0[i]) * k) for i in range(3)) + (255,))
                break
    sun = (W // 2 + 40, HOR - 46)
    d.ellipse((sun[0] - 22, sun[1] - 22, sun[0] + 22, sun[1] + 22), fill=(255, 226, 150, 255))
    d.ellipse((sun[0] - 16, sun[1] - 16, sun[0] + 16, sun[1] + 16), fill=(255, 244, 196, 255))
    for c, (x, y) in (('Cloud02.png', (-10, -40)), ('Cloud03.png', (50, 0))):
        full.alpha_composite(load(FAB, c), (x, y))
    mt = tint(load(FAB, 'BackgroundMuntain02.png'), (90, 30, 80), 0.45)
    full.alpha_composite(mt, (0, HOR - mt.height + 4))
    full.alpha_composite(ground((255, 140, 90), 0.2, (1.0, 0.86, 0.78)), (0, HOR))
    return full


def night():
    bg = load(DUSK, 'parallax-mountain-bg.png')                         # 272×160 보랏빛 하늘 + 달
    full = Image.new('RGBA', (W, H), (36, 28, 64, 255))
    full.alpha_composite(bg.crop((0, 0, W, 160)), (0, HOR - 160 - 10))
    top = bg.getpixel((W // 2, 0))
    for y in range(HOR - 170):                                           # 위는 더 어두운 밤하늘 → 달 하늘 첫 줄 색으로 이어짐 + 별
        k = round((y / (HOR - 170)) * 6) / 6
        ImageDraw.Draw(full).line((0, y, W, y), fill=(int(22 + (top[0] - 22) * k), int(16 + (top[1] - 16) * k), int(44 + (top[2] - 44) * k), 255))
    d = ImageDraw.Draw(full)
    for i in range(46):
        x = (i * 97 + 13) % W; y = (i * 53 + 7) % (HOR - 120)
        d.point((x, y), fill=(255, 250, 220, 255 if i % 3 else 160))
        if i % 9 == 0: d.point((x + 1, y), fill=(255, 250, 220, 180)); d.point((x, y + 1), fill=(255, 250, 220, 180))
    for n, dy in (('parallax-mountain-montain-far.png', 0), ('parallax-mountain-mountains.png', 0), ('parallax-mountain-trees.png', 4)):
        L = load(DUSK, n)
        full.alpha_composite(L.crop((0, 0, W, 160)), (0, HOR - 160 + dy))
    full.alpha_composite(ground((40, 40, 110), 0.42, (0.62, 0.66, 0.92)), (0, HOR))
    return full


def main():
    out = os.path.join(ROOT, 'web', 'img', 'catch')
    os.makedirs(out, exist_ok=True)
    sheet = Image.new('RGBA', (W * 3 + 8, H), (255, 0, 255, 255))
    for i, (n, fn) in enumerate((('day', day), ('sunset', sunset), ('night', night))):
        im = fn().convert('RGB')
        im.save(os.path.join(out, f'{n}.png'), optimize=True)
        sheet.paste(im, (i * (W + 4), 0))
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(os.path.join(ROOT, '.work', 'catch_bg_preview.png'))
    print('ok', [os.path.getsize(os.path.join(out, f'{n}.png')) for n in ('day', 'sunset', 'night')])


if __name__ == '__main__':
    main()
