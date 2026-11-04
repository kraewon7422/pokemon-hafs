# 포켓몬 멈춘 그림 809마리 (+ 색이 다른 그림) → web/sprites/pk-*.webp 그림판 몇 장 + web/sprites/pk-index.js (어디에 있는지).
#  - 그림판은 무손실 WebP. 그림: #1–649 PokeAPI 블랙·화이트 멈춘 PNG, #650–809 smogon gen5 PNG (같은 화풍). 받은 파일은 .work/pokesprites/ 에 저장 (다시 받지 않음)
#  - 둘레의 빈칸을 잘라서 촘촘히 담음. 앱(sprites.js)은 96×96 칸에 원래 크기 그대로, 가운데·아래 맞춤으로 그림 → 모든 포켓몬 도트 크기가 같음
#  - 그림판 한 장은 2048×2048 이하 (아이폰 GPU 한계), 필요한 장만 받도록 species.id 순서로 나눔
# 사용: python tools/build_pokemon_sheets.py      (PIL 필요)
import json, os, sys, time, urllib.request, io
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.work', 'pokesprites')
OUT = os.path.join(ROOT, 'web', 'sprites')
CELL = 96                 # 앱이 그리는 칸 (원래 그림 판 크기)
PER_SHEET = 210           # 한 그림판에 담는 포켓몬 수 (보통 4장)
WIDTH = 1024              # 그림판 폭

J = json.load(open(os.path.join(ROOT, 'tools', 'pokemon_sprites.json'), encoding='utf8'))
species = sorted((int(k), int(v)) for k, v in J['species'].items())
ident = {int(k): v for k, v in J['ident'].items()}
PA = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white'
SM = 'https://raw.githubusercontent.com/smogon/sprites/master/src/sprites/gen5'
UNDERSCORE = {772, 782, 783, 784, 785, 786, 787, 788}


def url(n, shiny):
    if n <= 649:
        return f"{PA}/{'shiny/' if shiny else ''}{n}.png"
    name = ident[n].replace('-', '_') if n in UNDERSCORE else ident[n].replace('-', '')
    return f"{SM}/s{name}{'-s' if shiny else ''}.png"


def fetch(n, shiny):
    path = os.path.join(CACHE, f"{n}{'s' if shiny else ''}.png")
    if not os.path.exists(path):
        for t in range(5):            # 연결이 가끔 끊김 → 다시
            try:
                with urllib.request.urlopen(url(n, shiny), timeout=30) as r:
                    data = r.read()
                break
            except Exception as e:
                if t == 4 or getattr(e, 'code', 0) == 404:
                    raise RuntimeError(f'#{n} {"shiny " if shiny else ""}{url(n, shiny)}: {e}')
                time.sleep(1 + t)
        Image.open(io.BytesIO(data)).verify()          # 진짜 PNG 인지
        with open(path, 'wb') as f:
            f.write(data)
    return path


def crop(path):
    im = Image.open(path).convert('RGBA')
    a = im.getchannel('A').point(lambda v: 255 if v > 8 else 0)
    bb = a.getbbox()
    if not bb:
        raise ValueError(f'빈 그림 {path}')
    im = im.crop(bb)
    # 반투명 가장자리 없애기 (도트: 보이거나 안 보이거나)
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, al = px[x, y]
            px[x, y] = (r, g, b, 255) if al > 127 else (0, 0, 0, 0)
    if im.width > CELL or im.height > CELL:
        raise ValueError(f'{path} 가 {CELL} 보다 큼 {im.size}')
    return im


def pack(imgs):
    """선반 쌓기: 키 큰 순서로 줄마다 채움 → {key: (x, y)}, 키"""
    order = sorted(imgs, key=lambda k: -imgs[k].height)
    pos, x, y, row = {}, 0, 0, 0
    for k in order:
        w, h = imgs[k].size
        if x + w > WIDTH:
            x, y, row = 0, y + row + 1, 0
        pos[k] = (x, y)
        x += w + 1
        row = max(row, h)
    return pos, y + row


def main():
    os.makedirs(CACHE, exist_ok=True)
    jobs = [(n, s) for _, n in species for s in (False, True)]
    with ThreadPoolExecutor(8) as ex:
        paths = dict(zip(jobs, ex.map(lambda j: fetch(*j), jobs)))
    print('받음', len(paths))
    idx = {'cell': CELL, 'sheets': [], 'n': {}, 's': {}}
    total = 0
    groups = [species[i:i + PER_SHEET] for i in range(0, len(species), PER_SHEET)]
    for shiny in (False, True):
        for gi, grp in enumerate(groups):
            imgs = {sid: crop(paths[(n, shiny)]) for sid, n in grp}
            pos, h = pack(imgs)
            if h > 2048:
                raise ValueError('그림판이 2048 보다 높음')
            sheet = Image.new('RGBA', (WIDTH, h), (0, 0, 0, 0))
            for sid, im in imgs.items():
                sheet.paste(im, pos[sid])
            name = f"pk-{'s' if shiny else 'n'}{gi}.webp"
            # 무손실 WebP (같은 PNG 의 약 40% 크기, iOS 14+ 지원 — 앱은 이미 map.webp 를 씀)
            sheet.save(os.path.join(OUT, name), 'WEBP', lossless=True, quality=100, method=6)
            cols = sheet.getcolors(1 << 16)
            size = os.path.getsize(os.path.join(OUT, name))
            total += size
            si = len(idx['sheets'])
            idx['sheets'].append(name)
            for sid, im in imgs.items():
                idx['s' if shiny else 'n'][sid] = [si, *pos[sid], im.width, im.height]
            print(name, f'{WIDTH}x{h}', f'{size // 1024}KB', len(cols) if cols else '>65536', '색')
    js = ('// tools/build_pokemon_sheets.py 가 만듦 — 고치지 말 것. species.id → [그림판, x, y, w, h] (n = 보통, s = 색이 다른)\n'
          'export default ' + json.dumps(idx, separators=(',', ':')) + ';\n')
    with open(os.path.join(OUT, 'pk-index.js'), 'w', encoding='utf8') as f:
        f.write(js)
    total += len(js)
    print('pk-index.js', len(js) // 1024, 'KB / 합계', total // 1024, 'KB')


if __name__ == '__main__':
    main()
