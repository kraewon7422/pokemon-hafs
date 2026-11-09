# 앱 아이콘 (PWA): 사용자 그림 → 흰 바탕을 지운 투명 PNG 들 + 파란 바탕 마스커블 · 애플 아이콘. 사용: python tools/make_app_icon.py <원본 그림.png>
import sys
from PIL import Image, ImageDraw, ImageFilter
from collections import deque
src = Image.open(sys.argv[1]).convert('RGB')
W, H = src.size; px = src.load()
# 바깥 흰 배경 (테두리에서 이어진 밝은 · 무채색 칸) → 투명. 경계는 밝기에 따라 부드럽게
def bg_score(c):
    r, g, b = c; mx, mn = max(c), min(c)
    return (mn >= 150 and mx - mn <= 40)
seen = bytearray(W * H); q = deque()
for x in range(W):
    for y in (0, H - 1): q.append((x, y))
for y in range(H):
    for x in (0, W - 1): q.append((x, y))
while q:
    x, y = q.popleft(); i = y * W + x
    if seen[i] or not bg_score(px[x, y]): continue
    seen[i] = 1
    for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]: q.append((nx, ny))
alpha = Image.new('L', (W, H), 255); ap = alpha.load()
for y in range(H):
    for x in range(W):
        if seen[y * W + x]: ap[x, y] = 0
alpha = alpha.filter(ImageFilter.GaussianBlur(1.2))
rgba = src.convert('RGBA'); rgba.putalpha(alpha)
bbox = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
rgba = rgba.crop(bbox)
side = max(rgba.size); pad = int(side * 0.02)
sq = Image.new('RGBA', (side + 2 * pad, side + 2 * pad), (0, 0, 0, 0))
sq.paste(rgba, ((sq.width - rgba.width) // 2, (sq.height - rgba.height) // 2), rgba)
out = 'web/icons/'
for s in (16, 32, 48, 192, 512):
    sq.resize((s, s), Image.LANCZOS).save(f'{out}hafs-flame-{s}.png')
# 마스커블 · 애플: 투명 대신 파란 바탕을 꽉 채움 (아이폰은 투명을 검게 칠함). 공은 가운데 80% 안전 구역 안
blue = src.getpixel((W // 2 - 380, H // 2 + 380))
def solid(size, k):
    bg = Image.new('RGBA', (size, size), blue + (255,))
    inner = sq.resize((int(size * k), int(size * k)), Image.LANCZOS)
    bg.paste(inner, ((size - inner.width) // 2, (size - inner.height) // 2), inner)
    return bg.convert('RGB')
solid(512, 0.86).save(f'{out}hafs-flame-maskable-512.png')
solid(180, 1.0).save(f'{out}hafs-flame-apple-180.png')
sq.resize((48, 48), Image.LANCZOS).save(f'{out}hafs-flame.ico', sizes=[(16, 16), (32, 32), (48, 48)])
# 확인용: 어두운 · 밝은 · 초록 바탕에 얹기
chk = Image.new('RGB', (1100, 560), (40, 48, 70)); d = ImageDraw.Draw(chk)
d.rectangle([560, 0, 1100, 280], fill=(250, 250, 250)); d.rectangle([560, 280, 1100, 560], fill=(120, 200, 110))
i512 = Image.open(f'{out}hafs-flame-512.png'); chk.paste(i512, (20, 24), i512)
for j, s in enumerate((192, 48, 32, 16)):
    t = Image.open(f'{out}hafs-flame-{s}.png'); chk.paste(t, (580 + j * 210, 40), t); chk.paste(t, (580 + j * 210, 320), t)
m = Image.open(f'{out}hafs-flame-maskable-512.png').resize((180, 180)); chk.paste(m, (900, 300))
chk.save('.work/icon_check.png'); print('bbox', bbox, 'blue', blue)
