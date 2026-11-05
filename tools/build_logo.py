"""앱 로고 '합스볼' 도트 그림: 프렌드볼 모양 (위 반쪽 = HAFS 파랑 + 주황 무늬 5개, 가운데 띠 · 버튼, 아래 = 흰색).
32×32 도트로 그린 뒤 정수 배로 키워서 PWA 아이콘 · 머리글 로고 · 가운데 QR 버튼 그림을 만든다.
사용: python tools/build_logo.py [--preview]   (--preview = .work/hapsball-8x.png 확대 그림)

만드는 파일 (이름을 바꾸면 manifest.webmanifest · index.html · sw.js · app.css 도 같이):
  web/icons/hapsball-192.png            192 아이콘 (남색 바탕)
  web/icons/hapsball-512.png            512 아이콘
  web/icons/hapsball-maskable-512.png   512 maskable (가운데 80% 안전 구역 안에 공)
  web/icons/hapsball-apple-180.png      아이폰 홈 화면 아이콘
  web/img/hapsball.png                  투명 바탕 128×128 (앱 안: 머리글 · QR 버튼 · 첫 로딩 · 카드)
"""
import math
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = 32


def hx(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)


C = {k: hx(v) for k, v in dict(
    K='#182030',                                   # 외곽선 · 띠
    B0='#2a5cbc', B1='#4c84dc', B2='#1c3e8c', BL='#8cb8f0',   # HAFS 파랑 (기본 · 밝음 · 그늘 · 빛)
    O0='#f48c1c', O1='#ffb450', O2='#c4600c',      # HAFS 주황 (기본 · 밝음 · 그늘)
    W0='#f4f4f0', W1='#c8ccd8', W2='#ffffff',      # 아래 흰색 (기본 · 그늘 · 빛)
    G='#dcdce4',                                   # 버튼 안쪽 테두리
).items()}
NAVY = hx('#283048')
CLEAR = (0, 0, 0, 0)


def seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)))
    return math.hypot(px - (ax + t * vx), py - (ay + t * vy)), t


def ball():
    im = Image.new('RGBA', (N, N), CLEAR)
    cx = cy = (N - 1) / 2          # 15.5
    R = 15.4
    # 주황 무늬 5개: 버튼 위에서 바깥쪽으로 뻗는 둥근 잎 (가운데 · 좌우 2쌍)
    lobes = []
    for deg, r0, r1, w in [(0, 6.4, 10.6, 2.5), (-40, 6.6, 10.4, 2.4), (40, 6.6, 10.4, 2.4), (-76, 7.0, 10.0, 2.2), (76, 7.0, 10.0, 2.2)]:
        a = math.radians(deg)
        dx, dy = math.sin(a), -math.cos(a)
        lobes.append((cx + dx * r0, cy - 1.5 + dy * r0, cx + dx * r1, cy - 1.5 + dy * r1, w))
    for y in range(N):
        for x in range(N):
            d = math.hypot(x - cx, y - cy)
            if d > R:
                continue
            col = None
            if d > R - 1.25:
                col = 'K'                                  # 외곽선
            elif abs(y - cy) <= 1.0:
                col = 'K'                                  # 가운데 띠 (2줄)
            elif d <= 4.6:
                col = 'K' if d > 3.4 else ('G' if d > 2.4 else 'W0')     # 버튼
                if col == 'W0' and x < cx and y < cy:
                    col = 'W2'
            elif y < cy:                                   # 위 반쪽: 파랑 + 주황 무늬
                # 잎 = 안쪽은 가늘고 바깥 끝은 둥글고 넓은 물방울 모양 (바깥 테두리와는 파란 틈)
                lob = min(dd - w * (0.45 + 0.55 * t) for (a, b, c, e, w) in lobes for (dd, t) in [seg_dist(x, y, a, b, c, e)])
                if lob <= 0:
                    # 잎 안쪽: 왼쪽 위 밝게, 오른쪽 아래 그늘
                    col = 'O1' if lob < -1.1 and (x - cx) + (y - cy) < -10 else 'O0'
                    if lob > -0.7 and (x - cx) * 0.4 + (y - cy) > -5:
                        col = 'O2'
                else:
                    shade = (x - cx) * 0.7 + (y - cy) * 0.7
                    col = 'B1' if shade < -9 else ('B2' if shade > 6 or d > R - 2.4 and x > cx else 'B0')
            else:                                          # 아래 반쪽: 흰색
                shade = (x - cx) * 0.6 + (y - cy) * 0.8
                col = 'W1' if shade > 7.5 or d > R - 2.3 else 'W0'
            im.putpixel((x, y), C[col])
    # 빛 반사 (왼쪽 위)
    for (x, y) in [(6, 7), (7, 6), (6, 8), (8, 5)]:
        if im.getpixel((x, y))[:3] in (C['B0'][:3], C['B1'][:3]):
            im.putpixel((x, y), C['BL'])
    return im


def on_bg(base, size, scale, bg=NAVY):
    out = Image.new('RGBA', (size, size), bg)
    big = base.resize((N * scale, N * scale), Image.NEAREST)
    o = (size - N * scale) // 2
    out.alpha_composite(big, (o, o))
    return out.convert('RGB')


def main():
    b = ball()
    icons = os.path.join(ROOT, 'web', 'icons')
    img = os.path.join(ROOT, 'web', 'img')
    on_bg(b, 192, 5).save(os.path.join(icons, 'hapsball-192.png'), optimize=True)
    on_bg(b, 512, 14).save(os.path.join(icons, 'hapsball-512.png'), optimize=True)
    on_bg(b, 512, 10).save(os.path.join(icons, 'hapsball-maskable-512.png'), optimize=True)   # 320px 공 < 409px 안전 원
    on_bg(b, 180, 5).save(os.path.join(icons, 'hapsball-apple-180.png'), optimize=True)
    b.resize((N * 4, N * 4), Image.NEAREST).save(os.path.join(img, 'hapsball.png'), optimize=True)
    print('hapsball: 4 icons + web/img/hapsball.png')
    if '--preview' in sys.argv:
        wk = os.path.join(ROOT, '.work'); os.makedirs(wk, exist_ok=True)
        bg = Image.new('RGBA', b.size, (255, 0, 255, 255)); bg.alpha_composite(b)
        bg.resize((N * 8, N * 8), Image.NEAREST).save(os.path.join(wk, 'hapsball-8x.png'))


if __name__ == '__main__':
    main()
