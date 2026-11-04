"""사파리존 동굴 던전 만들기 → web/js/safari-caves.js (지도 글자 데이터, 손으로 고치지 말 것).
3세대 동굴처럼 여러 층 미로: 막다른 길 · 고리 · 큰 바위로 막힌 지름길 · 한 번 떨어지면 못 올라가는 구멍 · 찾아야 하는 사다리.
전설 포켓몬은 3층 (지하 2층) 부터. 같은 seed 면 언제나 같은 지도.
사용: python tools/gen_safari_caves.py   → 점검: node .work/preview/maps-check.mjs (걸어서 닿는지 · 빠져나올 수 있는지 · 전설까지 걸음 수)

글자: W 벽 · . 바닥 · ~ 물 · r 작은 바위 · O 큰 바위 · B 점자 벽 · S 표지판 · U 올라가는 사다리 · V 내려가는 사다리 · o 구멍 · E 나가는 곳
      Q 울트라 워프홀 · L 전설 포켓몬 자리
"""
import json
import os
import random
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CW, CH = 12, 9                     # 칸 (2×2 바닥 + 1 벽) 수 → 지도 37×28
W, H = CW * 3 + 1, CH * 3 + 1
BRAILLE = '벽에 점자가 새겨져 있다… "깊은 곳에 잠든 거인을 깨우려면 세 개의 돌을 모아라."'

# 동굴 셋. links[f] = f층에서 아래층으로 가는 방법 ('ladder' = 사다리 한 쌍 · 'holes' = 구멍 여러 개, 한 방향)
DUNGEONS = {
    'shoal': dict(name='여울의 동굴', seed=11, floors=4, water=True, links=['ladder', 'holes', 'ladder'],
                  entry=('safari', 8, 3, 'down'), out={2: ('deepPond', 'in')},
                  legends={2: [(378, True)], 3: [(249, False)]}),
    'maze': dict(name='미혹의 동굴', seed=23, floors=4, water=False, links=['holes', 'ladder', 'holes'],
                 entry=('safari', 54, 3, 'down'), down={3: ('regiShrine', 'in')},
                 legends={2: [(377, True)], 3: [(379, True)]}),
    'deep': dict(name='깊은 동굴', seed=37, floors=3, water=False, links=['ladder', 'holes'],
                 entry=('safari', 32, 18, 'down'), out={2: ('skyHill', 'in')}, worm=2,
                 legends={2: [(383, False)]}),
}
FLOOR_NAME = ['', ' 지하 1층', ' 지하 2층', ' 지하 3층']


def cell_tile(i, j):
    return 1 + 3 * i, 1 + 3 * j


class Floor:
    def __init__(self, rng):
        self.rng = rng
        self.g = [['W'] * W for _ in range(H)]
        self.links = {}            # (i,j) → set of neighbour cells
        self.maze()

    def maze(self):
        rng = self.rng
        seen = {(0, 0)}
        st = [(0, 0)]
        for j in range(CH):
            for i in range(CW):
                self.links[(i, j)] = set()
        while st:
            c = st[-1]
            nb = [(c[0] + dx, c[1] + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
            nb = [n for n in nb if 0 <= n[0] < CW and 0 <= n[1] < CH and n not in seen]
            if not nb:
                st.pop(); continue
            n = rng.choice(nb)
            self.links[c].add(n); self.links[n].add(c); seen.add(n); st.append(n)
        # 고리 몇 개 (벽을 조금 더 뚫음) → 길이 하나만은 아님
        for _ in range(int(CW * CH * 0.08)):
            i, j = rng.randrange(CW), rng.randrange(CH)
            dx, dy = rng.choice(((1, 0), (0, 1)))
            n = (i + dx, j + dy)
            if n[0] < CW and n[1] < CH:
                self.links[(i, j)].add(n); self.links[n].add((i, j))
        for (i, j), ns in self.links.items():
            x, y = cell_tile(i, j)
            for yy in (y, y + 1):
                for xx in (x, x + 1):
                    self.g[yy][xx] = '.'
            for (a, b) in ns:
                if a == i + 1:
                    self.g[y][x + 2] = self.g[y + 1][x + 2] = '.'
                if b == j + 1:
                    self.g[y + 2][x] = self.g[y + 2][x + 1] = '.'

    def room(self, i, j, wc, hc):
        x0, y0 = cell_tile(i, j)
        for y in range(y0, y0 + hc * 3 - 1):
            for x in range(x0, x0 + wc * 3 - 1):
                self.g[y][x] = '.'
        return x0, y0, wc * 3 - 1, hc * 3 - 1

    def walk(self, x, y):
        return 0 <= x < W and 0 <= y < H and self.g[y][x] not in 'W~rOBLS'

    def bfs(self, start):
        d = {start: 0}
        q = deque([start])
        while q:
            x, y = q.popleft()
            if self.g[y][x] in 'UVoEQ' and (x, y) != start:
                continue                      # 사다리 · 구멍 · 나가는 곳은 밟으면 옮겨 가니 지나갈 수 없음
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (x + dx, y + dy)
                if n not in d and self.walk(*n):
                    d[n] = d[(x, y)] + 1; q.append(n)
        return d

    def connected(self, pts):
        d = self.bfs(pts[0])
        return all(p in d for p in pts)

    def far_cell(self, froms, avoid=()):
        """froms 에서 걸어서 가장 먼 칸 (2×2 바닥 칸의 왼쪽 위)."""
        best, bc = -1, None
        ds = [self.bfs(f) for f in froms]
        for j in range(CH):
            for i in range(CW):
                if (i, j) in avoid:
                    continue
                t = cell_tile(i, j)
                if not all(t in d for d in ds):
                    continue
                v = min(d[t] for d in ds)
                if v > best:
                    best, bc = v, (i, j)
        return bc


def build_dungeon(key, D):
    rng = random.Random(D['seed'])
    n = D['floors']
    floors = [Floor(rng) for _ in range(n)]
    maps, ports = {}, {}
    ids = [f'{key}{k + 1}' for k in range(n)]
    keep = [[] for _ in range(n)]          # 꼭 이어져 있어야 하는 칸 (출입구 · 사다리 · 전설 앞)
    warps = [dict() for _ in range(n)]
    signs = [dict() for _ in range(n)]
    legends = [[] for _ in range(n)]
    used = [set() for _ in range(n)]       # 쓴 칸 (사다리 · 방이 겹치지 않게)

    def mark(f, i, j):
        used[f].add((i, j))

    # 1층 입구: 아래쪽 가운데 칸 밑 벽에 나가는 곳 E
    f0 = floors[0]
    ie = CW // 2
    ex, ey = cell_tile(ie, CH - 1)
    f0.g[H - 1][ex] = 'E'
    entry_land = (ex, H - 2)
    warps[0][f'{ex},{H - 1}'] = list(D['entry'])
    ports[f'{key}.in'] = [ids[0], ex, H - 2, 'up']
    keep[0].append(entry_land); mark(0, ie, CH - 1)
    arrive = [[entry_land]] + [[] for _ in range(n - 1)]    # 층마다 들어오는 칸들
    up_spot = [None] * n                                      # 층마다 올라가는 사다리 옆 칸 (아래층에서 올라오면 여기)

    for f in range(n - 1):
        F, G = floors[f], floors[f + 1]
        kind = D['links'][f]
        # 아래층 올라가는 사다리 U (아래층 어딘가) — 위층의 '내려온 곳' 옆으로 돌아감
        ui, uj = rng.randrange(CW), rng.randrange(CH)
        while (ui, uj) in used[f + 1]:
            ui, uj = rng.randrange(CW), rng.randrange(CH)
        ux, uy = cell_tile(ui, uj)
        G.g[uy][ux] = 'U'; mark(f + 1, ui, uj)
        up_land_lower = (ux + 1, uy)                          # 아래층에서 사다리 옆
        keep[f + 1].append(up_land_lower)
        if kind == 'ladder':
            vi, vj = F.far_cell(arrive[f], used[f])
            vx, vy = cell_tile(vi, vj)
            F.g[vy][vx] = 'V'; mark(f, vi, vj)
            back = (vx + 1, vy)
            keep[f].append(back)
            warps[f][f'{vx},{vy}'] = [ids[f + 1], up_land_lower[0], up_land_lower[1], 'right']
            warps[f + 1][f'{ux},{uy}'] = [ids[f], back[0], back[1], 'right']
            arrive[f + 1].append(up_land_lower)
        else:   # 구멍 3개: 위층 먼 곳들 · 떨어지면 아래층 아무 데나 (한 방향) — 아래층 U 는 위층 들어온 곳 옆으로
            back = arrive[f][0]
            warps[f + 1][f'{ux},{uy}'] = [ids[f], back[0], back[1], 'down']
            for k in range(3):
                hi, hj = F.far_cell(arrive[f] + [cell_tile(*c) for c in used[f]], used[f]) if k == 0 else (rng.randrange(CW), rng.randrange(CH))
                while (hi, hj) in used[f]:
                    hi, hj = rng.randrange(CW), rng.randrange(CH)
                hx_, hy_ = cell_tile(hi, hj)
                F.g[hy_ + 1][hx_ + 1] = 'o'; mark(f, hi, hj)
                li, lj = rng.randrange(CW), rng.randrange(CH)
                while (li, lj) in used[f + 1]:
                    li, lj = rng.randrange(CW), rng.randrange(CH)
                lx, ly = cell_tile(li, lj)
                warps[f][f'{hx_ + 1},{hy_ + 1}'] = [ids[f + 1], lx, ly, 'down']
                keep[f + 1].append((lx, ly)); arrive[f + 1].append((lx, ly)); mark(f + 1, li, lj)
        up_spot[f + 1] = up_land_lower

    # 층마다: 방 · 전설 방 · 바깥으로 나가는 곳 · 워프홀 · 바위 · 물
    for f, F in enumerate(floors):
        src = arrive[f] or keep[f]
        for (dex, braille) in D['legends'].get(f, []):
            ds = [F.bfs(t) for t in src]
            cells = [(i, j) for j in range(CH) for i in range(CW) if all(cell_tile(i, j) in d for d in ds)]
            cells.sort(key=lambda c: -min(d[cell_tile(*c)] for d in ds))      # 들어온 곳에서 먼 칸부터
            for (i, j) in cells:     # 3×2 칸 방
                i = min(i, CW - 3); j = min(max(j, 1), CH - 2)
                if all((a, b) not in used[f] for a in range(i, i + 3) for b in range(j, j + 2)):
                    break
            x0, y0, rw, rh = F.room(i, j, 3, 2)
            for a in range(i, i + 3):
                for b in range(j, j + 2):
                    mark(f, a, b)
            lx, ly = x0 + rw // 2, y0 + 2
            F.g[ly][lx] = 'L'
            legends[f].append({'dex': dex, 'x': lx, 'y': ly})
            keep[f].append((lx, ly + 1))
            if braille:
                F.g[y0 - 1][lx] = 'B'
                signs[f][f'{lx},{y0 - 1}'] = BRAILLE
            if D['water'] and dex == 249:          # 루기아: 방 위쪽은 깊은 물 (그림이 물 위로)
                for x in range(x0, x0 + rw):
                    F.g[y0][x] = '~'
                F.g[y0][lx] = '~'
        if f in D.get('out', {}):
            target, port = D['out'][f]
            # 맨 윗줄 칸 가운데 가장 먼 칸의 위쪽 벽에 나가는 곳 E
            oi, _ = F.far_cell(src + keep[f], used[f] | {(i, j) for i in range(CW) for j in range(1, CH)})
            ox, _ = cell_tile(oi, 0)
            F.g[0][ox] = 'E'
            warps[f][f'{ox},0'] = [target, port]
            ports[f'{ids[f]}.out'] = [ids[f], ox, 1, 'down']
            keep[f].append((ox, 1)); mark(f, oi, 0)
        if f in D.get('down', {}):
            target, port = D['down'][f]
            di, dj = F.far_cell(src + keep[f], used[f])
            dx_, dy_ = cell_tile(di, dj)
            F.g[dy_][dx_] = 'V'; mark(f, di, dj)
            warps[f][f'{dx_},{dy_}'] = [target, port]
            ports[f'{ids[f]}.down'] = [ids[f], dx_ + 1, dy_, 'right']
            keep[f].append((dx_ + 1, dy_))
        if D.get('worm') == f:          # 울트라 워프홀: 2×2 칸 방 가운데 (둘레 3×3 이 모두 빈 바닥 → 그림 32×32 가 벽에 걸치지 않음)
            ds = [F.bfs(t) for t in src + keep[f]]
            cells = [(i, j) for j in range(CH - 1) for i in range(CW - 1) if all(cell_tile(i, j) in d for d in ds)]
            cells.sort(key=lambda c: -min(d[cell_tile(*c)] for d in ds))
            wi, wj = next(c for c in cells if all((a, b) not in used[f] for a in (c[0], c[0] + 1) for b in (c[1], c[1] + 1)))
            x0, y0, rw, rh = F.room(wi, wj, 2, 2)
            for a in (wi, wi + 1):
                for b in (wj, wj + 1):
                    mark(f, a, b)
            wx, wy = x0 + 2, y0 + 2
            F.g[wy][wx] = 'Q'
            warps[f][f'{wx},{wy}'] = ['ultra', 'in', 'warp']
            ports[f'{ids[f]}.worm'] = [ids[f], wx + 1, wy, 'right']
            keep[f] += [(wx + dx, wy + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if (dx, dy) != (0, 0)]
        keep[f] += [tuple(map(int, k.split(','))) for k in warps[f]]      # 사다리 · 구멍 · 나가는 곳도 늘 닿게

        def sign(near, text):
            for r in (1, 2, 3):
                for dy in range(-r, r + 1):
                    for dx in range(-r, r + 1):
                        x, y = near[0] + dx, near[1] + dy
                        if not (0 < x < W - 1 and 0 < y < H - 1) or F.g[y][x] != '.' or (x, y) in keep[f]:
                            continue
                        if F.g[y + 1][x] in 'W':
                            continue          # 표지판 앞 (아래) 칸이 바닥이어야 읽기 쉬움
                        F.g[y][x] = 'S'
                        if F.connected(keep[f]) and any(F.walk(x + a, y + b) for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                            signs[f][f'{x},{y}'] = text
                            return
                        F.g[y][x] = '.'
        here = D['name'] + FLOOR_NAME[f]
        last = f == n - 1
        if src:
            sign(src[0], f'{here}. ' + ('가장 깊은 층이다. 전설의 포켓몬이 있다는 소문이…' if last else '이 층 어딘가에 아래로 가는 길이 있다. 막다른 길에 주의!'))
        for k, w in warps[f].items():
            x, y = map(int, k.split(','))
            if F.g[y][x] == 'V' and w[0].startswith(key):
                sign((x, y), f'↓ {FLOOR_NAME[f + 1].strip()} (사다리)')
            elif F.g[y][x] == 'o' and not any(t.startswith('구멍') for t in signs[f].values()):
                sign((x, y), '구멍에 떨어지면 아래층으로! 돌아오려면 그 층의 사다리를 찾자.')
        # 넓은 방 (2×2 칸) 몇 개: 물 동굴은 가운데에 웅덩이
        for _ in range(3):
            i, j = rng.randrange(CW - 1), rng.randrange(CH - 1)
            if any((a, b) in used[f] for a in (i, i + 1) for b in (j, j + 1)):
                continue
            x0, y0, rw, rh = F.room(i, j, 2, 2)
            if D['water']:
                saved = [row[:] for row in F.g]
                for y in range(y0 + 1, y0 + rh - 1):
                    for x in range(x0 + 1, x0 + rw - 1):
                        F.g[y][x] = '~'
                if not F.connected(keep[f]):
                    F.g = saved
        # 큰 바위로 지름길 막기 (2칸 통로를 통째로) · 작은 바위 — 꼭 가야 하는 곳은 늘 이어지게
        cand = [(x, y) for y in range(1, H - 1) for x in range(1, W - 1) if F.g[y][x] == '.']
        rng.shuffle(cand)
        placed = 0
        for (x, y) in cand:
            if placed >= 6:
                break
            pair = None
            if F.g[y][x - 1] == 'W' and F.g[y][x + 2] == 'W' and F.g[y][x + 1] == '.':
                pair = [(x, y), (x + 1, y)]              # 가로 2칸 통로를 막음
            elif F.g[y - 1][x] == 'W' and F.g[y + 2][x] == 'W' and F.g[y + 1][x] == '.':
                pair = [(x, y), (x, y + 1)]
            if not pair or any(p in keep[f] for p in pair):
                continue
            saved = [row[:] for row in F.g]
            for (a, b) in pair:
                F.g[b][a] = 'O'
            if F.connected(keep[f]) and all(F.bfs(keep[f][0]).get(k) is not None for k in keep[f]):
                placed += 1
            else:
                F.g = saved
        for (x, y) in cand[:14]:
            if F.g[y][x] != '.' or (x, y) in keep[f]:
                continue
            F.g[y][x] = 'r'
            if not F.connected(keep[f]):
                F.g[y][x] = '.'
        assert F.connected(keep[f]), (key, f)
        maps[ids[f]] = {
            'name': D['name'] + FLOOR_NAME[f], 'kind': 'cave', 'zone': 'cave',
            'rows': [''.join(r) for r in F.g], 'warps': warps[f], 'signs': signs[f], 'npcs': [], 'legends': legends[f],
        }
    return maps, ports


def main():
    allmaps, ports = {}, {}
    for k, D in DUNGEONS.items():
        m, p = build_dungeon(k, D)
        allmaps.update(m); ports.update(p)
    out = os.path.join(ROOT, 'web', 'js', 'safari-caves.js')
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// tools/gen_safari_caves.py 가 만듦 — 손으로 고치지 말 것. 동굴 던전 지도 (여울의 동굴 · 미혹의 동굴 · 깊은 동굴, 층마다 미로).\n')
        f.write('// warps 의 [지도, \'in\'] 꼴은 바깥 지도의 PORTS 이름 (safari-maps.js 가 좌표로 바꿈). PORTS = 바깥에서 동굴로 들어올 때 서는 칸.\n')
        f.write('export const CAVES = ' + json.dumps(allmaps, ensure_ascii=False, indent=1) + ';\n')
        f.write('export const CAVE_PORTS = ' + json.dumps(ports, ensure_ascii=False) + ';\n')
    print('wrote', out, len(allmaps), 'floors')
    for k, v in ports.items():
        print(' ', k, v)


if __name__ == '__main__':
    main()
