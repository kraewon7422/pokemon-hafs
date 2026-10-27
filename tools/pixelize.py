"""AI 그림 / 손그림 → 에메랄드 규칙을 지키는 진짜 64x64 도트 스프라이트.

규칙 (docs/DESIGN.md §6, CLAUDE.md): 64x64, 최대 15색 + 투명, 1px 외곽선(몸색보다 어두운 색).

사용법:
  python tools/pixelize.py 원본.png art/sprites/001.png            # 1단계 (작게)
  python tools/pixelize.py 원본.png art/sprites/003.png --stage 3  # 3단계 (캔버스를 더 채움)
  옵션: --colors 15  --bg auto|none  --preview (8배 확대 미리보기 _preview.png 도 저장)

배경: 원본이 투명 PNG면 그대로 쓰고, 아니면 네 모서리 색과 비슷한 영역을 배경으로 지운다(--bg auto).
그 뒤 결과를 Piskel(https://www.piskelapp.com)에서 열어 얼굴/눈만 손으로 다듬으면 된다.
완성본을 art/sprites/<도감번호 3자리>.png 로 두고 `python tools/build_atlas.py` 를 실행하면 앱에 들어간다.
"""
import argparse
from collections import deque

from PIL import Image

FILL = {1: 0.70, 2: 0.82, 3: 0.94}  # 단계별로 캔버스(64px)를 채우는 비율


def remove_background(img, tol=48):
    """모서리에서 시작해 배경색과 비슷한 픽셀을 투명하게 (flood fill)."""
    img = img.convert('RGBA')
    w, h = img.size
    px = img.load()
    if any(px[x, y][3] < 128 for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]):
        return img  # 이미 투명 배경
    seen = [[False] * h for _ in range(w)]
    q = deque()
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        q.append((x, y, px[x, y]))
    while q:
        x, y, ref = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[x][y]:
            continue
        r, g, b, a = px[x, y]
        if abs(r - ref[0]) + abs(g - ref[1]) + abs(b - ref[2]) > tol:
            continue
        seen[x][y] = True
        px[x, y] = (0, 0, 0, 0)
        q.extend([(x + 1, y, ref), (x - 1, y, ref), (x, y + 1, ref), (x, y - 1, ref)])
    return img


def fit(img, stage):
    box = img.getbbox()
    if box:
        img = img.crop(box)
    target = round(64 * FILL[stage])
    scale = target / max(img.size)
    w, h = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    small = img.resize((w, h), Image.Resampling.BOX)  # 평균 → 깔끔한 축소
    out = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    out.paste(small, ((64 - w) // 2, 64 - h - 2))     # 바닥에 서 있게
    return out


def quantize(img, colors):
    alpha = img.getchannel('A').point(lambda a: 255 if a >= 128 else 0)  # 반투명 없음
    rgb = Image.new('RGB', img.size, (0, 0, 0))
    rgb.paste(img.convert('RGB'), mask=alpha)
    pal = rgb.quantize(colors=colors - 1, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)  # -1: 외곽선 색 자리
    out = pal.convert('RGBA')
    out.putalpha(alpha)
    return out


def outline(img):
    """투명 영역과 맞닿은 바깥 픽셀을 그 픽셀보다 어두운 색으로 칠한다."""
    px = img.load()
    w, h = img.size
    solid = [[px[x, y][3] > 0 for y in range(h)] for x in range(w)]
    edge = []
    for x in range(w):
        for y in range(h):
            if not solid[x][y]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if nx < 0 or ny < 0 or nx >= w or ny >= h or not solid[nx][ny]:
                    edge.append((x, y))
                    break
    for x, y in edge:
        r, g, b, _ = px[x, y]
        px[x, y] = (r * 35 // 100, g * 35 // 100, b * 45 // 100, 255)
    return img


def count_colors(img):
    return len({p for p in img.getdata() if p[3] > 0})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--stage', type=int, default=1, choices=[1, 2, 3])
    ap.add_argument('--colors', type=int, default=15)
    ap.add_argument('--bg', default='auto', choices=['auto', 'none'])
    ap.add_argument('--preview', action='store_true')
    a = ap.parse_args()

    img = Image.open(a.src).convert('RGBA')
    if a.bg == 'auto':
        img = remove_background(img)
    img = outline(quantize(fit(img, a.stage), a.colors))
    # 외곽선이 색을 늘렸을 수 있으니 최종 색 수를 다시 맞춘다
    if count_colors(img) > a.colors:
        img = quantize(img, a.colors)
    img.save(a.dst)
    print(f'{a.dst}: 64x64, {count_colors(img)} colors')
    if a.preview:
        p = a.dst.rsplit('.', 1)[0] + '_preview.png'
        img.resize((512, 512), Image.Resampling.NEAREST).save(p)
        print('preview:', p)


if __name__ == '__main__':
    main()
