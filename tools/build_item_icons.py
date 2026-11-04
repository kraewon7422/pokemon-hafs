"""물건 아이콘 그림판 web/img/items.png (0032): 실제 포켓몬 물건 그림 (PokeAPI sprites/items, 30×30) 을 32px 칸에 한 줄로.
순서 = web/js/bag.js 의 ICONS (타입 강화 물건 18 · 지닌 물건 · 회복약 · 이상한사탕 · 진화의 돌 · 기술머신 타입 18).
사용: python tools/build_item_icons.py   (예전 그림판: tools/draw_fx.py 가 그린 16px 학교 물건)
"""
import io
import os
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/'
TYPE_EN = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost',
           'dragon', 'dark', 'steel', 'fairy']
BOOST = ['silk-scarf', 'charcoal', 'mystic-water', 'miracle-seed', 'magnet', 'never-melt-ice', 'black-belt', 'poison-barb', 'soft-sand', 'sharp-beak',
         'twisted-spoon', 'silver-powder', 'hard-stone', 'spell-tag', 'dragon-fang', 'black-glasses', 'metal-coat', 'fairy-feather']
OTHER = ['wide-lens', 'scope-lens', 'sitrus-berry', 'leftovers', 'quick-claw', 'pecha-berry', 'aspear-berry', 'potion', 'super-potion',
         'full-restore', 'full-heal', 'elixir', 'revive', 'rare-candy', 'shiny-stone']
ORDER = BOOST + OTHER + [f'tm-{t}' for t in TYPE_EN]
CELL = 32


def main():
    out = Image.new('RGBA', (CELL * len(ORDER), CELL), (0, 0, 0, 0))
    for i, n in enumerate(ORDER):
        im = Image.open(io.BytesIO(urllib.request.urlopen(BASE + n + '.png').read())).convert('RGBA')
        bb = im.getbbox() or (0, 0, im.width, im.height)
        im = im.crop(bb)
        if im.width > CELL or im.height > CELL:
            k = min(CELL / im.width, CELL / im.height)
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.NEAREST)
        out.paste(im, (i * CELL + (CELL - im.width) // 2, (CELL - im.height) // 2), im)
    p = os.path.join(ROOT, 'web', 'img', 'items.png')
    out.save(p, optimize=True)
    print(p, out.size, len(ORDER), 'icons')


if __name__ == '__main__':
    main()
