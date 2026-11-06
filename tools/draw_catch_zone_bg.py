"""잡기 화면 구역 배경 (web/img/catch/shore.png · desert.png · cave.png, 270×480) — 사파리존 해변·연못 / 사막 / 동굴.
재료 = 배틀 배경 web/img/battle/{beach,desert,underground}.png ("isaiah658's Pixel Pack #2", CC0) 의 하늘 색·땅 색·작은 소품
(조개·불가사리·선인장·회전초·바위·뾰족 돌)을 그대로 떼어 와서, 잡기 화면 구도 (지평선 HOR · 포켓몬 자리 SPOT = draw_catch_bg.py 와 같음) 로 다시 깐다.
바다 띠·동굴 천장 고드름·먼 모래 언덕·포켓몬 자리 타원은 같은 색으로 여기서 도트로 그림. 사용법: python tools/draw_catch_zone_bg.py"""
import os
import random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BATTLE = os.path.join(ROOT, 'web', 'img', 'battle')
W, H = 270, 480
HOR = 236                     # 지평선 (draw_catch_bg.py 와 같음 — catch.js 의 원근이 이 줄에 맞춰져 있음)
SPOT = (W // 2, 352)          # 포켓몬이 설 자리 (catch.js SPOT_X · FEET_Y 와 같아야 함)
SKY_END = 42                  # 배틀 배경 (159×159) 에서 하늘이 끝나는 줄


def load(name):
    return Image.open(os.path.join(BATTLE, f'{name}.png')).convert('RGB')


def lerp(a, b, k):
    return tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(3))


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def sky_band(src, y0, y1, im):
    """배틀 배경의 하늘 (0..SKY_END 줄 색) 을 y0..y1 로 늘려서 띠 모양으로."""
    px = src.load(); d = ImageDraw.Draw(im)
    cols = [px[80, y] for y in range(SKY_END)]
    for y in range(y0, y1):
        k = (y - y0) / max(1, (y1 - y0 - 1))
        d.line((0, y, W, y), fill=cols[min(SKY_END - 1, int(k * (SKY_END - 1)))] + (255,))


def props(src, base, skip):
    """땅 위 소품 떼어 내기: 바탕색·자리 타원 색(skip) 이 아닌 픽셀 덩어리 → [(RGBA 그림, 크기)]. 1~3칸 점·가장자리에 닿는 큰 덩어리 (바다) 는 뺌."""
    px = src.load(); seen = set(); out = []
    bad = {base, *skip}
    for y0 in range(SKY_END + 1, 159):
        for x0 in range(159):
            if (x0, y0) in seen or px[x0, y0] in bad: continue
            st = [(x0, y0)]; comp = []; seen.add((x0, y0))
            while st:
                x, y = st.pop(); comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    q = (x + dx, y + dy)
                    if 0 <= q[0] < 159 and SKY_END < q[1] < 159 and q not in seen and px[q] not in bad:
                        seen.add(q); st.append(q)
            xs = [p[0] for p in comp]; ys = [p[1] for p in comp]
            if len(comp) < 6 or len(comp) > 500 or min(xs) == 0 or max(xs) == 158 or max(ys) == 158: continue
            bx, by = min(xs), min(ys)
            spr = Image.new('RGBA', (max(xs) - bx + 1, max(ys) - by + 1), (0, 0, 0, 0))
            for x, y in comp: spr.putpixel((x - bx, y - by), px[x, y] + (255,))
            out.append(spr)
    out.sort(key=lambda s: -s.width * s.height)
    return out


def ground(base, speck, rim, mid, seed):
    """지평선 아래 땅: 바탕색 + 점무늬 (멀수록 촘촘·어둡게) + 포켓몬 자리 (배틀 배경의 자리 타원과 같은 색)."""
    rnd = random.Random(seed)
    g = Image.new('RGBA', (W, H - HOR)); d = ImageDraw.Draw(g)
    for y in range(H - HOR):
        fade = 0.80 + 0.20 * min(1, y / 140)
        d.line((0, y, W, y), fill=shade(base, fade) + (255,))
    for _ in range(900):
        y = int((rnd.random() ** 1.6) * (H - HOR)); x = rnd.randrange(W)
        fade = 0.80 + 0.20 * min(1, y / 140)
        w = 1 if y < 90 else 2
        d.rectangle((x, y, x + w - 1, y), fill=shade(speck, fade) + (255,))
    cx, cy = SPOT[0], SPOT[1] - HOR
    d.ellipse((cx - 74, cy - 17, cx + 74, cy + 17), fill=rim + (255,))
    d.ellipse((cx - 68, cy - 13, cx + 68, cy + 15), fill=mid + (255,))
    d.arc((cx - 74, cy - 17, cx + 74, cy + 17), 180, 360, fill=shade(rim, 0.85) + (255,), width=2)
    return g


def place(im, spr, x, y, k):
    """소품을 k 배 (도트 그대로) 로, 발 (아래 가운데) 이 (x, y) 에 오게."""
    s = spr.resize((spr.width * k, spr.height * k), Image.NEAREST)
    im.alpha_composite(s, (int(x - s.width / 2), int(y - s.height)))


def shore():
    src = load('beach'); base = (245, 214, 175)
    im = Image.new('RGBA', (W, H)); SEA = 34
    sky_band(src, 0, HOR - SEA, im)
    d = ImageDraw.Draw(im)
    water, foam = (103, 174, 224), (17, 221, 221)
    for y in range(HOR - SEA, HOR):                       # 바다: 먼 쪽 진하게 → 가까이 밝게 + 물결 줄
        k = (y - (HOR - SEA)) / SEA
        d.line((0, y, W, y), fill=lerp(shade(water, 0.78), water, round(k * 4) / 4) + (255,))
    rnd = random.Random(7)
    for _ in range(60):
        y = rnd.randrange(HOR - SEA + 2, HOR - 4); x = rnd.randrange(W); n = rnd.randrange(3, 9)
        d.line((x, y, x + n, y), fill=lerp(water, (255, 255, 255), 0.35) + (255,))
    for x in range(W):                                     # 물가 거품 (물결 모양)
        yy = HOR - 3 + (1 if (x // 9) % 2 else 0)
        d.line((x, yy, x, HOR), fill=foam + (255,))
        d.point((x, yy - 1), fill=(240, 255, 255, 255))
    im.alpha_composite(ground(base, (232, 202, 167), (178, 155, 128), (214, 186, 154), 3), (0, HOR))
    p = props(src, base, [(178, 155, 128), (214, 186, 154), (232, 202, 167)])
    if len(p) >= 2:
        place(im, p[0], 38, 300, 2); place(im, p[1], 232, 278, 1); place(im, p[1], 236, 446, 2); place(im, p[0], 196, 262, 1)
    return im


def desert():
    src = load('desert'); base = (245, 214, 175)
    im = Image.new('RGBA', (W, H))
    sky_band(src, 0, HOR, im)
    d = ImageDraw.Draw(im)
    dune = (224, 190, 148)
    for x in range(W):                                     # 먼 모래 언덕 두 겹
        h1 = 10 + int(8 * abs(((x / 70) % 2) - 1)); h2 = 5 + int(5 * abs(((x / 41 + 0.4) % 2) - 1))
        d.line((x, HOR - h1, x, HOR), fill=shade(dune, 0.94) + (255,))
        d.line((x, HOR - h2, x, HOR), fill=dune + (255,))
    im.alpha_composite(ground(base, (232, 202, 167), (178, 155, 128), (214, 186, 154), 5), (0, HOR))
    p = props(src, base, [(178, 155, 128), (214, 186, 154), (232, 202, 167)])
    # 큰 것부터: 선인장 · 회전초 · 작은 선인장 · 마른 덤불
    if len(p) >= 4:
        place(im, p[0], 34, 318, 2); place(im, p[2], 240, 300, 2); place(im, p[1], 214, 262, 1)
        place(im, p[3], 60, 262, 1); place(im, p[3], 226, 452, 2); place(im, p[1], 44, 460, 2)
    return im


def cave():
    src = load('underground'); base = (54, 106, 132)
    im = Image.new('RGBA', (W, H))
    sky_band(src, 0, HOR, im)                              # 어두운 동굴 천장 (배틀 배경의 위쪽 색)
    d = ImageDraw.Draw(im)
    wall, wall2 = (32, 54, 63), (40, 65, 75)
    rnd = random.Random(11)
    for x in range(0, W, 6):                               # 천장 고드름 (종유석)
        n = rnd.randrange(8, 46) if rnd.random() < 0.7 else rnd.randrange(50, 90)
        c = wall if (x // 6) % 2 else wall2
        d.polygon([(x, 0), (x + 6, 0), (x + 3, n)], fill=c + (255,))
    for x in range(W):                                     # 안쪽 돌벽 (지평선 위 울퉁불퉁)
        h = 14 + int(10 * abs(((x / 23) % 2) - 1)) + (3 if (x // 5) % 3 == 0 else 0)
        d.line((x, HOR - h, x, HOR), fill=wall + (255,))
        d.point((x, HOR - h), fill=wall2 + (255,))
    im.alpha_composite(ground(base, (46, 91, 112), (38, 76, 94), (46, 91, 112), 9), (0, HOR))
    p = props(src, base, [(38, 76, 94), (46, 91, 112)])
    if len(p) >= 2:
        place(im, p[0], 36, 300, 2); place(im, p[1], 236, 292, 2); place(im, p[0], 218, 262, 1)
        place(im, p[1], 54, 260, 1); place(im, p[1], 232, 456, 2); place(im, p[0], 40, 458, 2)
    return im


def main():
    out = os.path.join(ROOT, 'web', 'img', 'catch')
    sheet = Image.new('RGB', (W * 3 + 8, H), (255, 0, 255))
    for i, (n, fn) in enumerate((('shore', shore), ('desert', desert), ('cave', cave))):
        im = fn().convert('RGB')
        im.save(os.path.join(out, f'{n}.png'), optimize=True)
        sheet.paste(im, (i * (W + 4), 0))
        print(n, 'top', im.getpixel((W // 2, 0)), 'bottom', im.getpixel((W // 2, H - 1)), os.path.getsize(os.path.join(out, f'{n}.png')))
    os.makedirs(os.path.join(ROOT, '.work'), exist_ok=True)
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(os.path.join(ROOT, '.work', 'catch_zone_bg_preview.png'))


if __name__ == '__main__':
    main()
