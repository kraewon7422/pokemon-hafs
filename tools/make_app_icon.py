# 앱 아이콘 (PWA) v2: 사용자 그림(파란 둥근 네모 + 불꽃 볼) → 깨끗한 대각선 그라데이션 바탕을 새로 그리고 원래 볼을 얹음.
#   - 둥근 네모 아이콘 (투명 바깥): 보통 아이콘 · 즐겨찾기 (16 · 32 · 48 · 192 · 512, .ico)
#   - 꽉 찬 네모 아이콘: 안드로이드 · 삼성(마스커블, 동그라미 · 스쿼클로 잘림) · 아이폰(모서리를 직접 둥글게 깎음)
#     → 그라데이션이 네모 끝까지 이어지고, 볼은 가운데 80% 안전 원 안에 있어 어느 모양으로 잘려도 다 보임.
# 사용: python tools/make_app_icon.py <원본 그림.png>   (결과: web/icons/hafs-flame2-*.png, 확인용 .work/icon_check.png)
import sys
from PIL import Image, ImageDraw

SS = 4  # 가장자리를 부드럽게: 4배로 그린 뒤 줄임
src = Image.open(sys.argv[1]).convert('RGB')
W, H = src.size
px = src.load()

# 1) 볼 테두리(검은 고리) 찾기 → 가운데 · 반지름
blk = [(x, y) for y in range(0, H, 2) for x in range(0, W, 2) if max(px[x, y]) < 60]
x0, x1 = min(p[0] for p in blk), max(p[0] for p in blk)
y0, y1 = min(p[1] for p in blk), max(p[1] for p in blk)
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
rx, ry = (x1 - x0) / 2 + 1, (y1 - y0) / 2 + 1

# 2) 파란 바탕 색을 대각선 위치 t (왼쪽 위 0 → 오른쪽 아래 1) 에 따라 재기: 볼 바깥 · 둥근 네모 안쪽의 파란 칸만
nonwhite = [(x, y) for y in range(0, H, 3) for x in range(0, W, 3) if min(px[x, y]) < 200]
sx0, sx1 = min(p[0] for p in nonwhite), max(p[0] for p in nonwhite)
sy0, sy1 = min(p[1] for p in nonwhite), max(p[1] for p in nonwhite)
side = max(sx1 - sx0, sy1 - sy0)
BINS = 48
acc = [[0, 0, 0, 0] for _ in range(BINS)]
for y in range(sy0 + 12, sy1 - 12, 3):
    for x in range(sx0 + 12, sx1 - 12, 3):
        if ((x - cx) / (rx + 10)) ** 2 + ((y - cy) / (ry + 10)) ** 2 <= 1: continue
        r, g, b = px[x, y]
        if not (b > 90 and b > r + 40): continue           # 파란 칸만 (흰 바깥 · 모서리 반쯤 섞인 칸 빼기)
        t = ((x - sx0) + (y - sy0)) / (2 * side)
        k = min(BINS - 1, max(0, int(t * BINS)))
        a = acc[k]; a[0] += r; a[1] += g; a[2] += b; a[3] += 1
pts = [((k + 0.5) / BINS, tuple(a[i] / a[3] for i in range(3))) for k, a in enumerate(acc) if a[3] >= 8]
# 매끈하게: t 에 대한 2차식으로 맞춤 (채널마다 최소제곱) → 띠 없는 그라데이션, 0 ~ 1 밖으로도 자연스럽게 이어짐
def fit(ch):
    n = len(pts); S = [sum(t ** i for t, _ in pts) for i in range(5)]
    T = [sum((t ** i) * c[ch] for t, c in pts) for i in range(3)]
    A = [[S[i + j] for j in range(3)] for i in range(3)]
    # 3x3 가우스 소거
    M = [A[i] + [T[i]] for i in range(3)]
    for i in range(3):
        p = max(range(i, 3), key=lambda r: abs(M[r][i])); M[i], M[p] = M[p], M[i]
        for r in range(3):
            if r != i:
                f = M[r][i] / M[i][i]
                M[r] = [M[r][c] - f * M[i][c] for c in range(4)]
    return [M[i][3] / M[i][i] for i in range(3)]
coef = [fit(ch) for ch in range(3)]
def grad(t):
    return tuple(max(0, min(255, round(c[0] + c[1] * t + c[2] * t * t))) for c in coef)

# 3) 원래 볼 (검은 고리 바깥 가장자리까지, 부드러운 가장자리)
bx0, by0 = int(cx - rx - 2), int(cy - ry - 2)
ball = src.crop((bx0, by0, int(cx + rx + 3), int(cy + ry + 3))).convert('RGBA')
m = Image.new('L', (ball.width * SS, ball.height * SS), 0)
ImageDraw.Draw(m).ellipse([((cx - rx) - bx0) * SS, ((cy - ry) - by0) * SS, ((cx + rx) - bx0) * SS, ((cy + ry) - by0) * SS], fill=255)
ball.putalpha(m.resize(ball.size, Image.LANCZOS))

def background(size, rounded):
    big = size * SS
    g = Image.new('RGB', (big, big))
    gp = g.load()
    for y in range(big):
        for x in range(big):
            gp[x, y] = grad((x + y) / (2 * big))
    g = g.convert('RGBA')
    if rounded:
        mask = Image.new('L', (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 0.215), fill=255)
        g.putalpha(mask)
    return g

def compose(size, ball_frac, rounded):
    # 4배 크기에서 그라데이션을 그리고 줄이면 계단 없이 매끈함 (작은 크기만 큰 판에서 줄여 시간 절약)
    base = background(min(size, 256), rounded).resize((size * SS, size * SS), Image.LANCZOS) if size > 256 else background(size, rounded)
    d = int(size * SS * ball_frac)
    b = ball.resize((d, int(d * ball.height / ball.width)), Image.LANCZOS)
    base.alpha_composite(b, ((base.width - b.width) // 2, (base.height - b.height) // 2))
    return base.resize((size, size), Image.LANCZOS)

out = 'web/icons/'
rnd = compose(512, 0.80, True)                       # 원래 그림과 같은 비율 (볼 = 네모의 80%)
for s in (16, 32, 48, 192, 512):
    (rnd if s == 512 else rnd.resize((s, s), Image.LANCZOS)).save(f'{out}hafs-flame2-{s}.png')
rnd.resize((48, 48), Image.LANCZOS).save(f'{out}hafs-flame2.ico', sizes=[(16, 16), (32, 32), (48, 48)])
# 마스커블(삼성 · 안드로이드): 안전 원 = 지름 80% → 볼 72% (여유). 애플: 아이폰이 모서리를 깎으므로 꽉 찬 네모, 볼 76%
compose(512, 0.72, False).convert('RGB').save(f'{out}hafs-flame2-maskable-512.png')
compose(180, 0.76, False).convert('RGB').save(f'{out}hafs-flame2-apple-180.png')

# 확인용: 삼성 동그라미 · 스쿼클, 아이폰 둥근 네모로 깎은 모습 + 밝은 · 어두운 바탕의 보통 아이콘
mk = Image.open(f'{out}hafs-flame2-maskable-512.png').convert('RGBA').resize((240, 240), Image.LANCZOS)
ap = Image.open(f'{out}hafs-flame2-apple-180.png').convert('RGBA').resize((240, 240), Image.LANCZOS)
def clip(img, shape):
    mm = Image.new('L', img.size, 0); dd = ImageDraw.Draw(mm); w = img.width
    if shape == 'circle': dd.ellipse([0, 0, w - 1, w - 1], fill=255)
    elif shape == 'squircle': dd.rounded_rectangle([0, 0, w - 1, w - 1], radius=int(w * 0.36), fill=255)
    else: dd.rounded_rectangle([0, 0, w - 1, w - 1], radius=int(w * 0.225), fill=255)
    o = img.copy(); o.putalpha(mm); return o
chk = Image.new('RGB', (1080, 600), (245, 245, 245))
d = ImageDraw.Draw(chk); d.rectangle([0, 300, 1080, 600], fill=(30, 34, 48))
for i, (img, shape) in enumerate([(mk, 'circle'), (mk, 'squircle'), (ap, 'ios')]):
    for row in (0, 1):
        t = clip(img, shape); chk.paste(t, (30 + i * 270, 30 + row * 300), t)
r192 = Image.open(f'{out}hafs-flame2-192.png'); chk.paste(r192, (850, 54), r192); chk.paste(r192, (850, 354), r192)
for j, s in enumerate((48, 32, 16)):
    t = Image.open(f'{out}hafs-flame2-{s}.png'); chk.paste(t, (850 + j * 64, 260 - s), t); chk.paste(t, (850 + j * 64, 560 - s), t)
chk.save('.work/icon_check.png')
print('ball', (cx, cy, rx, ry), 'grad t0', grad(0), 't.5', grad(.5), 't1', grad(1), 'samples', len(pts))
