"""진짜 포켓몬으로 바꾸기 (0032) → supabase/seed_pokemon.sql + .work/pokemon/sprites.json

자료: PokeAPI CSV (https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv) 를 .work/pokeapi/ 에 받아 둔 것.
  - 1~7세대 (도감 1~809) 전부. 진화 계열 = 한 줄(1~3단계). 갈래 진화는 첫 갈래가 계열을 잇고, 나머지는 따로 1단계 계열.
  - 선생님 계열 68개(1~34, 43~76)는 과목에 어울리는 포켓몬 (퀴즈는 그대로), 특별 계열(35~42, 77~82)은 정해진 전설·환상,
    나머지는 83번부터 '야생' 계열.
  - 이름·분류·키·몸무게·도감 설명 = 공식 한국어 (PokeAPI). 종족값 = 실제 값. 타입 = 실제 타입 ('불꽃/비행' 처럼 / 로 이음).
  - 기술 = tools/gen_battle_data.py 의 247개 (효과 그대로) 를 실제 타입·위력·명중·PP·분류로. 고르는 4개·배우는 기술 = 실제 배우는 기술 중에서.
  - 상성 = 실제 18타입 표. 물건 = 실제 포켓몬 물건 이름.

사용법: python tools/gen_pokemon.py   → supabase/seed_pokemon.sql (SQL 편집기에서 실행) + tools/pokemon_sprites.json (node tools/upload_pokemon_sprites.mjs 로 그림 올리기)
"""
import csv
import json
import os
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import gen_battle_data as GB  # noqa: E402  (기술 목록 M · 효과 · 고정 번호 MOVE_ID · SIGNATURE)
from roster import BTYPE  # noqa: E402

D = os.path.join(ROOT, '.work', 'pokeapi')
KO = '3'
MAXDEX = 809


def rd(name):
    return list(csv.DictReader(open(os.path.join(D, name + '.csv'), encoding='utf-8')))


# ── 기본 자료 ──
SPEC = {int(r['id']): r for r in rd('pokemon_species') if int(r['id']) <= MAXDEX}
POKE = {int(r['species_id']): r for r in rd('pokemon') if r['is_default'] == '1' and int(r['species_id']) <= MAXDEX}
PID = {sid: int(p['id']) for sid, p in POKE.items()}
NAME, GENUS = {}, {}
for r in rd('pokemon_species_names'):
    if r['local_language_id'] == KO and int(r['pokemon_species_id']) <= MAXDEX:
        NAME[int(r['pokemon_species_id'])] = r['name'].strip()
        GENUS[int(r['pokemon_species_id'])] = r['genus'].strip()
VERS = {r['id']: r['identifier'] for r in rd('versions')}
VPREF = ['ultra-sun', 'ultra-moon', 'sun', 'moon', 'omega-ruby', 'alpha-sapphire', 'x', 'y', 'lets-go-pikachu', 'lets-go-eevee', 'sword', 'shield']
FLAV = defaultdict(dict)
for r in rd('pokemon_species_flavor_text'):
    if r['language_id'] == KO and int(r['species_id']) <= MAXDEX:
        FLAV[int(r['species_id'])][VERS[r['version_id']]] = ' '.join(r['flavor_text'].split())
TYPE_KO = {int(r['type_id']): r['name'].strip() for r in rd('type_names') if r['local_language_id'] == KO and int(r['type_id']) <= 18}
REAL_TYPES = [TYPE_KO[i] for i in range(1, 19)]
PTYPES = defaultdict(list)
for r in sorted(rd('pokemon_types'), key=lambda r: int(r['slot'])):
    PTYPES[int(r['pokemon_id'])].append(TYPE_KO[int(r['type_id'])])
STATS = defaultdict(dict)
for r in rd('pokemon_stats'):
    STATS[int(r['pokemon_id'])][int(r['stat_id'])] = int(r['base_stat'])
CHART = {(TYPE_KO[int(r['damage_type_id'])], TYPE_KO[int(r['target_type_id'])]): int(r['damage_factor']) / 100
         for r in rd('type_efficacy') if int(r['damage_type_id']) <= 18 and int(r['target_type_id']) <= 18}


def flavor(sid):
    f = FLAV[sid]
    for v in VPREF:
        if v in f:
            return f[v]
    return next(iter(f.values()), '')


def types_of(sid):
    return PTYPES[PID[sid]]


def stats_of(sid):
    s = STATS[PID[sid]]
    return [s[1], s[2], s[3], s[4], s[5], s[6]]          # hp atk def spa spd spe


def hw(sid):
    p = POKE[sid]
    h, w = int(p['height']) / 10, int(p['weight']) / 10
    return f'{h:g}m', f'{w:g}kg'


# ── 진화 레벨 (실제 레벨 진화면 그 레벨, 돌·교환·친밀도면 단계에 맞춘 레벨) ──
EVO_MIN = {}
for r in rd('pokemon_evolution'):
    e = int(r['evolved_species_id'])
    if e <= MAXDEX and r['evolution_trigger_id'] == '1' and r['minimum_level']:
        EVO_MIN[e] = min(EVO_MIN.get(e, 999), int(r['minimum_level']))
# 진화의돌(아이템)로 진화하는 포켓몬 (예: 라이츄 · 픽시 · 샤미드): 레벨로는 진화하지 않고 진화의돌 1개로 100% 진화 (0034)
EVO_ITEM = {int(r['evolved_species_id']) for r in rd('pokemon_evolution')
            if r['evolution_trigger_id'] == '3' and int(r['evolved_species_id']) <= MAXDEX} - set(EVO_MIN)


def evo_levels(path):
    """[None, 2단계 진화 레벨, 3단계 진화 레벨] — 진화의돌로 진화하는 단계는 None (레벨로 진화 안 함).
    교환 · 친밀도 · 시간 진화는 이 게임에 없으므로 단계에 맞춘 레벨 (2단계 25 · 3단계 40 근처)로 바꿈."""
    out, prev = [None], 5
    for st, sid in enumerate(path[1:], start=2):
        lv = EVO_MIN.get(sid) or max(prev + 10, {2: 25, 3: 40}[st])
        lv = max(lv, prev + 1)
        out.append(None if sid in EVO_ITEM else lv)
        prev = lv
    return out


# ── 진화 계열 → 한 줄씩 ──
CHILD = defaultdict(list)
for sid, r in SPEC.items():
    if r['evolves_from_species_id'] and int(r['evolves_from_species_id']) in SPEC:
        CHILD[int(r['evolves_from_species_id'])].append(sid)
for k in CHILD:
    CHILD[k].sort()
ROOTS = sorted(sid for sid, r in SPEC.items() if not r['evolves_from_species_id'] or int(r['evolves_from_species_id']) not in SPEC)


def paths_from(root):
    """root 부터: 첫 갈래 = 이어지는 계열, 다른 갈래는 그 자리에서 새 계열 (1단계부터)."""
    out = []
    main = [root]
    cur = root
    while CHILD.get(cur):
        kids = CHILD[cur]
        for other in kids[1:]:
            out += paths_from(other)
        cur = kids[0]
        main.append(cur)
    return [main[:3]] + out + ([main[3:]] if len(main) > 3 else [])


ALL_PATHS = []
for r in ROOTS:
    ALL_PATHS += paths_from(r)
PATH_OF = {p[0]: p for p in ALL_PATHS}
assert sum(len(p) for p in ALL_PATHS) == len(SPEC) == MAXDEX

# ── 특별 계열 (전설·환상): 원래 몬스터의 성격에 맞춤 ──
SPECIAL = {
    35: 493,   # 교감 선생님 → 아르세우스
    36: 487,   # 교장 선생님 → 기라티나
    37: 151,   # 비밀 (지도에 없는 곳에 숨음) → 뮤
    38: 146,   # 아침 전설 → 파이어
    39: 145,   # 한낮 전설 → 썬더
    40: 144,   # 노을 전설 → 프리저
    41: 150,   # 과제연구기초 · 도감 50% → 뮤츠 (연구로 태어난 포켓몬)
    42: 718,   # 창의적문제해결 · 도감 100% → 지가르데 (100% 퍼펙트폼)
    77: 716,   # 야자 1 → 제르네아스
    78: 717,   # 야자 2 → 이벨타르
    79: 721,   # HAFS 환상 (파란 물결 + 꺼지지 않는 횃불) → 볼케니온
    80: 490,   # 국제 과정 (바다를 건너는 등대) → 마나피
    81: 648,   # 인문 과정 (사람의 이야기) → 메로엣타
    82: 251,   # 자연 과정 (숲 가장자리에서 관찰) → 세레비
}
# ── 선생님 계열: 과목 → 어울리는 계열 (첫 포켓몬 도감 번호) ──
PREF = {
    '국어': [63, 280, 16, 92, 396, 517, 102, 79, 96, 177],
    '수학': [81, 374, 304, 599, 220, 361, 582, 436, 343, 613, 459],
    '영어': [21, 41, 163, 276, 333, 519, 173, 209, 682, 627],
    '물리': [172, 179, 403, 595],
    '화학': [29, 32, 88],
    '생명': [10, 13, 43, 69],
    '지구': [74, 246],
    '지리': [60, 116],
    '정치경제': [551, 228, 261],
    '윤리': [175, 360],
    '외국어': [1, 4, 7, 152, 155, 158],
    '정보': [137, 100, 602],
    '역사': [147, 371, 443],
    '음악': [174],
    '체육': [66, 236, 447, 532],
}
TEACHER_LINES = [l for l in sorted(BTYPE) if not (35 <= l <= 42 or l >= 77)]
assert len(TEACHER_LINES) == 68
used = set(SPECIAL.values())
LINE_PATH = {l: [sid] for l, sid in SPECIAL.items()}
it = {t: iter(v) for t, v in PREF.items()}
for l in TEACHER_LINES:
    root = next(it[BTYPE[l]])
    assert root in PATH_OF, (l, root, NAME.get(root))
    LINE_PATH[l] = PATH_OF[root]
    used.update(PATH_OF[root])
for t, v in it.items():
    assert next(v, None) is None, f'{t}: 남은 후보'
WILD = [p for p in ALL_PATHS if not used.intersection(p)]
assert all(not used.intersection(p) for p in WILD)
WILD.sort(key=lambda p: p[0])
nid = 83
for p in WILD:
    LINE_PATH[nid] = p
    nid += 1
assert sorted(s for p in LINE_PATH.values() for s in p) == list(range(1, MAXDEX + 1)), '모든 포켓몬이 한 번씩'
SPECIES_OF_DEX = {}       # 도감 번호 → (line, stage)
for l, p in LINE_PATH.items():
    for i, s in enumerate(p):
        SPECIES_OF_DEX[s] = (l, i + 1)


def sp_id(line, stage):
    return (line - 1) * 3 + stage


def rarity_of(line, path):
    if line in SPECIAL:
        return 'legendary'
    if 20 <= line <= 24 or line == 75:
        return 'rare'
    if any(SPEC[s]['is_legendary'] == '1' or SPEC[s]['is_mythical'] == '1' for s in path):
        return 'legendary'
    if line >= 83 and (sum(stats_of(path[-1])) >= 590 or path[0] in (1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501,
                                                                      650, 653, 656, 722, 725, 728)):
        return 'rare'
    return 'common'


# ── 기술: gen_battle_data 의 247개를 실제 자료로 ──
MV_KO = {}
for r in rd('move_names'):
    if r['local_language_id'] == KO:
        MV_KO.setdefault(' '.join(r['name'].split()), int(r['move_id']))
MOVES_CSV = {int(r['id']): r for r in rd('moves')}
ALIAS = {'메탈크로우': '메탈클로', '깨트리기': '깨뜨리다', '섀도크루': '섀도클로', '드릴부리': '회전부리', '드래곤크루': '드래곤클로',
         '자가재생': 'HP회복', '태만함': '게으름피우기'}   # 옛 표기 → 공식 한국어 이름 (게임에도 공식 이름으로 넣음)
MV_REAL = {}
missing = []
for m in GB.M:
    mid = MV_KO.get(ALIAS.get(m['name'], m['name']))
    if mid is None:
        missing.append(m['name'])
        continue
    MV_REAL[m['name']] = mid
CAT = {'1': 'status', '2': 'physical', '3': 'special'}


def real_move(m):
    """효과·설명은 그대로, 타입·분류·위력·명중·PP·우선도는 실제 값."""
    mid = MV_REAL.get(m['name'])
    if mid is None:
        return dict(m)
    r = MOVES_CSV[mid]
    x = dict(m)
    x['official'] = ALIAS.get(m['name'], m['name'])
    x['type'] = TYPE_KO[int(r['type_id'])] if int(r['type_id']) <= 18 else '노말'
    cat = CAT[r['damage_class_id']]
    if m['kind'] == 'attack' and cat != 'status':
        x['cat'] = cat
        if r['power']:
            x['power'] = int(r['power'])
    if r['accuracy']:
        x['acc'] = None if m['acc'] is None else int(r['accuracy'])
    if r['pp']:
        x['pp'] = int(r['pp'])
    x['prio'] = int(r['priority'] or 0)
    return x


_names = {m['name'] for m in GB.M}
DUP = {old: new for old, new in ALIAS.items() if new in _names}      # 옛 표기 기술이 공식 이름 기술과 같은 것 → 하나로 합침
MOVES = [real_move(m) for m in GB.M if m['name'] not in DUP]


def MID(name):
    return GB.MOVE_ID[DUP.get(name, name)]


MV = {m['name']: m for m in MOVES}
for _o, _n in DUP.items():
    MV[_o] = MV[_n]
MID_TO_NAME = {mid: n for n, mid in MV_REAL.items()}

# 실제로 배우는 기술 (1~7세대 게임 전체: 레벨·기술머신·가르침·알)
LEARN_ANY = defaultdict(set)
LEVEL = defaultdict(dict)          # pokemon id → {기술 이름: 레벨} (가장 최근 게임 기준)
VG_ORDER = {str(i): i for i in range(1, 19)}
best_vg = defaultdict(dict)
for r in rd('pokemon_moves'):
    vg = r['version_group_id']
    if vg not in VG_ORDER or vg in ('12', '13'):
        continue
    mid = int(r['move_id'])
    n = MID_TO_NAME.get(mid)
    if not n:
        continue
    pid = int(r['pokemon_id'])
    LEARN_ANY[pid].add(n)
    if r['pokemon_move_method_id'] == '1':
        v = int(vg)
        if best_vg[pid].get(n, 0) <= v:
            best_vg[pid][n] = v
            LEVEL[pid][n] = max(1, int(r['level'] or 1))


def learnable(sid):
    return LEARN_ANY[PID[sid]]


# ── 고르는 기술 4개: 공격 2 (자속 + 다른 타입) + 상태 1 + 방어 1 ──
def score(m, phys):
    good = (m['cat'] == 'physical') == phys
    return (m['power'] or 0) * ((m['acc'] or 100) / 100) * (1 if good else 0.6)


def pick4(sid, stage, n_stages):
    st = stats_of(sid)
    phys = st[1] >= st[3]
    ts = types_of(sid)
    can = [MV[n] for n in sorted(learnable(sid)) if n in MV and n not in GB.SIGNATURE]
    cap = 999 if stage == n_stages else (70 if stage == 1 and n_stages >= 2 else 95)
    atk = [m for m in can if m['kind'] == 'attack' and (m['power'] or 0) <= cap and (m['acc'] or 100) >= 70]
    stab = sorted((m for m in atk if m['type'] in ts), key=lambda m: (-score(m, phys), m['name']))
    out = []
    if stab:
        out.append(stab[0]['name'])
    else:   # 배우는 자속기가 247개 안에 없으면: 같은 타입의 기술 중 위력이 알맞은 것
        pool = sorted((m for m in MOVES if m['kind'] == 'attack' and m['type'] == ts[0] and m['name'] not in GB.SIGNATURE
                       and (m['power'] or 0) <= cap), key=lambda m: (-score(m, phys), m['name']))
        out.append((pool or [MV['몸통박치기']])[0]['name'])
    first_type = MV[out[0]]['type']
    cov = sorted((m for m in atk if m['type'] != first_type and m['name'] not in out), key=lambda m: (-score(m, phys), m['name']))
    if len(ts) > 1:        # 두 번째 타입 자속기를 먼저
        cov.sort(key=lambda m: (m['type'] != ts[1], -score(m, phys), m['name']))
    out.append((cov[0] if cov else MV['몸통박치기' if '몸통박치기' not in out else '전광석화'])['name'])
    stat = sorted((m for m in can if m['kind'] == 'status'), key=lambda m: (m['type'] not in ts, m['name']))
    out.append(stat[0]['name'] if stat else '울음소리')
    dfn = sorted((m for m in can if m['kind'] == 'defense'), key=lambda m: (m['name'] != '방어', m['type'] not in ts, m['name']))
    out.append(dfn[0]['name'] if dfn else '방어')
    return out


# ── 기술머신: 타입마다 강한 물리·특수 1개씩 + 누구나 쓰는 기술 ──
def tm_list():
    out = []
    for t in REAL_TYPES:
        atk = sorted((m for m in MOVES if m['type'] == t and m['kind'] == 'attack' and m['name'] not in GB.SIGNATURE and 70 <= (m['power'] or 0) <= 120
                      and (m['acc'] or 100) >= 85), key=lambda m: (-((m['power'] or 0) * (m['acc'] or 100)), m['name']))
        out += [m['name'] for m in [x for x in atk if x['cat'] == 'physical'][:1] + [x for x in atk if x['cat'] == 'special'][:1]]
    out += [n for n in GB.TM_GENERAL if n in MV]
    return list(dict.fromkeys(out))


TMS = tm_list()

# ── 물건: 실제 포켓몬 물건 ──
BOOST = [('노말', '실크스카프'), ('불꽃', '목탄'), ('물', '신비의물방울'), ('풀', '기적의씨'), ('전기', '자석'), ('얼음', '녹지않는얼음'),
         ('격투', '검은띠'), ('독', '독바늘'), ('땅', '부드러운모래'), ('비행', '예리한부리'), ('에스퍼', '휘어진스푼'), ('벌레', '은빛가루'),
         ('바위', '딱딱한돌'), ('고스트', '저주의부적'), ('드래곤', '용의이빨'), ('악', '검은안경'), ('강철', '금속코트'), ('페어리', '요정깃털')]
ITEM_ICON = {}   # key → PokeAPI 물건 그림 이름 (sprites/items/<name>.png)


def item_rows():
    icon_en = {'실크스카프': 'silk-scarf', '목탄': 'charcoal', '신비의물방울': 'mystic-water', '기적의씨': 'miracle-seed', '자석': 'magnet',
               '녹지않는얼음': 'never-melt-ice', '검은띠': 'black-belt', '독바늘': 'poison-barb', '부드러운모래': 'soft-sand', '예리한부리': 'sharp-beak',
               '휘어진스푼': 'twisted-spoon', '은빛가루': 'silver-powder', '딱딱한돌': 'hard-stone', '저주의부적': 'spell-tag', '용의이빨': 'dragon-fang',
               '검은안경': 'black-glasses', '금속코트': 'metal-coat', '요정깃털': 'fairy-feather'}
    I = []
    for i, (t, n) in enumerate(BOOST):
        k = f'boost{i + 1:02d}'
        ITEM_ICON[k] = icon_en[n]
        I.append((k, n, 'hold', f'지니게 하면 {t} 타입 기술의 위력이 1.2배가 된다.', {'boost': t}, {'place': 3, 'battle': 2}))
    extra = [
        ('glasses', '광각렌즈', 'wide-lens', 'hold', '지니게 하면 기술의 명중률이 조금 오른다 (1.1배).', {'acc': 110}, {'place': 3, 'battle': 2}),
        ('lucky', '초점렌즈', 'scope-lens', 'hold', '지니게 하면 급소에 맞히기 쉬워진다.', {'crit': 1}, {'place': 2, 'battle': 2}),
        ('choco', '자뭉열매', 'sitrus-berry', 'hold', 'HP가 절반 이하가 되면 먹어서 최대 HP의 1/4을 회복한다. 배틀마다 한 번.', {'pinch_heal': 25}, {'place': 4, 'battle': 2}),
        ('cushion', '먹다남은음식', 'leftovers', 'hold', '턴이 끝날 때마다 최대 HP의 1/16을 회복한다.', {'leftovers': 16}, {'place': 2, 'battle': 2}),
        ('clock', '선제공격손톱', 'quick-claw', 'hold', '가끔(20%) 상대보다 먼저 움직일 수 있다.', {'quick': 20}, {'place': 2, 'battle': 2}),
        ('mask', '복슝열매', 'pecha-berry', 'hold', '지니고 있으면 독 상태가 되지 않는다.', {'immune': 'psn'}, {'place': 2}),
        ('hotpack', '복분열매', 'aspear-berry', 'hold', '지니고 있으면 얼음 상태가 되지 않는다.', {'immune': 'frz'}, {'place': 2}),
        ('bandage', '상처약', 'potion', 'med', '배틀 중에 쓰면 HP를 최대 HP의 30% 회복한다.', {'heal': 30}, {'place': 8, 'battle': 6, 'practice': 8, 'quiz': 3}),
        ('ointment', '고급상처약', 'super-potion', 'med', '배틀 중에 쓰면 HP를 최대 HP의 60% 회복한다.', {'heal': 60}, {'place': 4, 'battle': 5, 'practice': 4, 'quiz': 2}),
        ('iv', '회복약', 'full-restore', 'med', '배틀 중에 쓰면 HP와 상태 이상을 모두 회복한다.', {'heal': 100, 'cure': True}, {'place': 1, 'battle': 2, 'raid': 3}),
        ('mint', '만병통치제', 'full-heal', 'med', '배틀 중에 쓰면 상태 이상과 혼란을 모두 고친다.', {'cure': True}, {'place': 5, 'battle': 3, 'practice': 4, 'quiz': 2}),
        ('energy', 'PP에이드', 'elixir', 'med', '배틀 중에 쓰면 모든 기술의 PP가 10씩 돌아온다.', {'pp': 10}, {'place': 3, 'battle': 3, 'practice': 2}),
        ('firstaid', '기력의조각', 'revive', 'med', '배틀 중에 쓰면 기절한 포켓몬이 HP 절반으로 되살아난다.', {'revive': 50}, {'place': 1, 'battle': 2, 'raid': 2}),
        ('candy', '이상한사탕', 'rare-candy', 'tool', '포켓몬 하나의 레벨이 1 오른다.', {'level': 1}, {'place': 1, 'battle': 2, 'quiz': 3, 'raid': 4}),
    ]
    for k, n, ic, pk, d, e, dr in extra:
        ITEM_ICON[k] = ic
        I.append((k, n, pk, d, e, dr))
    for i, n in enumerate(TMS):
        k = f'tm{i + 1:02d}'
        ITEM_ICON[k] = 'tm-' + {v: k2 for k2, v in TYPE_EN.items()}[MV[n]['type']]
        I.append((k, f'기술머신{i + 1:02d}', 'tm', f"{MV[n].get('official', n)}: {MV[n]['desc']}", {}, {'place': 1, 'quiz': 3, 'battle': 1}, n))
    for i, n in enumerate(GB.SIGNATURE):
        k = f'sp{i + 1:02d}'
        ITEM_ICON[k] = 'tm-' + {v: k2 for k2, v in TYPE_EN.items()}[MV[n]['type']]
        I.append((k, f'특별 기술머신{i + 1:02d}', 'tm', f"{MV[n].get('official', n)}: {MV[n]['desc']} (전설의 기술 — 누구나 배울 수 있다)", {}, {'raid': 1}, n))
    for i, n in enumerate(GB.PERMANENT_TM):
        k = f'pm{i + 1:02d}'
        ITEM_ICON[k] = 'tm-' + {v: k2 for k2, v in TYPE_EN.items()}[MV[n]['type']]
        I.append((k, f'영구 기술머신{i + 1:02d}', 'tm', f"{MV[n].get('official', n)}: {MV[n]['desc']} (써도 없어지지 않는다 — 여러 포켓몬에게 가르칠 수 있다)",
                  {'permanent': True}, {'raid': 0.4, 'battle': 0.15}, n))
    return [x if len(x) == 7 else x + (None,) for x in I]


TYPE_EN = {r['identifier']: TYPE_KO[int(r['id'])] for r in rd('types') if int(r['id']) <= 18}

# 시간표 칸 (배틀 필드): 그 시간에 힘이 세지는 타입
FIELDS = [
    {'from': '08:00', 'to': '10:00', 'name': '아침 조회', 'types': ['노말', '비행', '풀']},
    {'from': '10:00', 'to': '12:00', 'name': '오전 수업', 'types': ['에스퍼', '강철', '전기']},
    {'from': '12:00', 'to': '13:30', 'name': '점심시간', 'types': ['불꽃', '격투', '페어리']},
    {'from': '13:30', 'to': '16:00', 'name': '오후 수업', 'types': ['물', '얼음', '벌레']},
    {'from': '16:00', 'to': '18:30', 'name': '방과후', 'types': ['땅', '바위', '독']},
    {'from': '18:30', 'to': '23:00', 'name': '야간 자율학습', 'types': ['고스트', '악', '드래곤']},
]


def q(s):
    return 'null' if s is None else "'" + str(s).replace("'", "''") + "'"


def main():
    print('기술 이름이 PokeAPI 에 없는 것:', missing)
    lines_sql, species_rows, sm_rows, learn_rows, sprites = [], [], [], [], {}
    line_ids = sorted(LINE_PATH)
    for l in line_ids:
        p = LINE_PATH[l]
        n = len(p)
        btype_line = '/'.join(types_of(p[-1]))
        lines_sql.append((l, len(p), rarity_of(l, p), btype_line, l >= 83))
        lv_line = {}
        evl = evo_levels(p)
        for st, sid in enumerate(p, start=1):
            h, w = hw(sid)
            species_rows.append((sp_id(l, st), l, st, NAME[sid], GENUS[sid], flavor(sid), h, w, '/'.join(types_of(sid)), stats_of(sid), sid, evl[st - 1], sid in EVO_ITEM))
            mv4 = pick4(sid, st, n)
            assert len(set(mv4)) == 4, (sid, mv4)
            for k, x in enumerate(mv4):
                sm_rows.append((sp_id(l, st), k + 1, MID(x)))
            for x, lv in LEVEL[PID[sid]].items():
                if x in GB.SIGNATURE:
                    continue
                lv_line[x] = min(lv_line.get(x, 999), lv)
            for x in mv4:                   # 고른 기술은 꼭 배울 수 있게
                lv_line.setdefault(x, 1 if st == 1 else 5 + 15 * (st - 1))
            sprites[sp_id(l, st)] = sid
        for x, lv in sorted(lv_line.items()):
            learn_rows.append((l, MID(x), lv, 'level'))
        can = set().union(*(learnable(s) for s in p))
        for x in TMS:
            if x in can or MV[x]['type'] == '노말' and x in ('방어', '스피드스타', '그림자분신', '잠자기'):
                learn_rows.append((l, MID(x), 0, 'tm'))
    items = item_rows()
    # ── SQL ──
    S = ['-- GENERATED by tools/gen_pokemon.py — 진짜 포켓몬 (0032). migration 0032 다음에 실행 (사람이 없을 때).', 'begin;']
    S.append('delete from public.species_moves where true; delete from public.learnset where true; delete from public.type_chart where true;')
    S.append('insert into public.types (name, sort) values ' + ', '.join(f'({q(t)}, {i})' for i, t in enumerate(REAL_TYPES))
             + ' on conflict (name) do update set sort = excluded.sort;')
    S.append('insert into public.moves (id, name, type, category, kind, power, accuracy, pp, priority, effect, description) values')
    S.append(',\n'.join(f" ({MID(m['name'])}, {q(m.get('official', m['name']))}, {q(m['type'])}, {q(m['cat'])}, {q(m['kind'])}, {m['power'] or 0}, "
                        f"{'null' if m['acc'] is None else m['acc']}, {m['pp']}, {m['prio']}, {q(json.dumps(m['effect'], ensure_ascii=False))}, {q(m['desc'])})"
                        for m in MOVES))
    S.append('on conflict (id) do update set name = excluded.name, type = excluded.type, category = excluded.category, kind = excluded.kind, '
             'power = excluded.power, accuracy = excluded.accuracy, pp = excluded.pp, priority = excluded.priority, effect = excluded.effect, '
             'description = excluded.description;')
    # 계열: 선생님·특별 계열은 그대로 두고 단계·희귀도·타입만, 야생 계열은 새로
    S.append('insert into public.lines (id, teacher, subject, rarity, active, max_stage, btype, bonus, mythic, secret) values')
    S.append(',\n'.join(f" ({l}, '야생 포켓몬', '야생', {q(r)}, true, {n}, {q(bt)}, false, false, false)" for l, n, r, bt, wild in lines_sql if wild))
    S.append('on conflict (id) do update set max_stage = excluded.max_stage, rarity = excluded.rarity, btype = excluded.btype;')
    S.append('update public.lines l set max_stage = v.n, rarity = v.r, btype = v.bt from (values ' + ', '.join(
        f'({l}, {n}, {q(r)}, {q(bt)})' for l, n, r, bt, wild in lines_sql if not wild) + ') v(id, n, r, bt) where l.id = v.id;')
    S.append("-- 예전 데이터의 '비밀 몬스터' (계열 37 = 뮤) → 포켓몬 이름으로 (도감 상세 '정체' 칸에 보임)")
    S.append("update public.lines set teacher = '비밀 포켓몬' where id = 37 and teacher = '비밀 몬스터';")
    S.append(f'delete from public.lines where id > {max(line_ids)};')
    S.append('insert into public.species (id, line_id, stage, name, category, flavor, height, weight, btype, hp, atk, def, spa, spd, spe, dex, evo_lv, evo_item) values')
    S.append(',\n'.join(f" ({i}, {l}, {st}, {q(nm)}, {q(cat)}, {q(fl)}, {q(h)}, {q(w)}, {q(bt)}, {', '.join(map(str, v))}, {dex}, {ev if ev else 'null'}, {'true' if it else 'false'})"
                        for i, l, st, nm, cat, fl, h, w, bt, v, dex, ev, it in species_rows))
    S.append('on conflict (id) do update set line_id = excluded.line_id, stage = excluded.stage, name = excluded.name, category = excluded.category, '
             'flavor = excluded.flavor, height = excluded.height, weight = excluded.weight, btype = excluded.btype, hp = excluded.hp, atk = excluded.atk, '
             'def = excluded.def, spa = excluded.spa, spd = excluded.spd, spe = excluded.spe, dex = excluded.dex, evo_lv = excluded.evo_lv, evo_item = excluded.evo_item;')
    S.append('-- 단계가 줄어든 계열: 남는 단계 줄은 (기록이 가리키지 않으면) 지우고, 가리키면 마지막 단계와 똑같이')
    S.append('delete from public.species s using public.lines l where l.id = s.line_id and s.stage > l.max_stage'
             ' and not exists (select 1 from public.tickets t where t.result_species = s.id or t.fixed_species = s.id)'
             ' and not exists (select 1 from public.raids r where r.species_id = s.id)'
             ' and not exists (select 1 from public.raid_encounters e where e.species_id = s.id);')
    S.append('update public.species s set name = x.name, category = x.category, flavor = x.flavor, height = x.height, weight = x.weight, '
             'btype = x.btype, hp = x.hp, atk = x.atk, def = x.def, spa = x.spa, spd = x.spd, spe = x.spe, dex = x.dex, evo_lv = x.evo_lv, evo_item = x.evo_item, sprite = x.sprite, sprite_shiny = x.sprite_shiny '
             'from public.lines l, public.species x where l.id = s.line_id and s.stage > l.max_stage and x.line_id = s.line_id and x.stage = l.max_stage;')
    S.append('-- 단계가 줄어든 계열: 이미 잡은 것은 마지막 단계로')
    S.append('update public.collection c set stage = l.max_stage from public.lines l where l.id = c.line_id and c.stage > l.max_stage;')
    S.append('insert into public.species_moves (species_id, slot, move_id) values ' + ',\n'.join(f'({a}, {b}, {c})' for a, b, c in sm_rows) + ';')
    S.append('insert into public.learnset (line_id, move_id, lv, how) values ' + ',\n'.join(f"({a}, {b}, {c}, {q(d)})" for a, b, c, d in learn_rows)
             + ' on conflict do nothing;')
    S.append('insert into public.items (key, name, pocket, description, effect, drops, move_id, sort) values')
    S.append(',\n'.join(f" ({q(k)}, {q(n)}, {q(pk)}, {q(d)}, {q(json.dumps(e, ensure_ascii=False))}, {q(json.dumps(dr))}, "
                        f"{MID(mvn) if mvn else 'null'}, {i})" for i, (k, n, pk, d, e, dr, mvn) in enumerate(items)))
    S.append('on conflict (key) do update set name = excluded.name, pocket = excluded.pocket, description = excluded.description, '
             'effect = excluded.effect, drops = excluded.drops, move_id = excluded.move_id, sort = excluded.sort;')
    S.append('delete from public.items where key not in (' + ', '.join(q(x[0]) for x in items) + ');')
    S.append(f"update public.settings set value = {q(json.dumps(FIELDS, ensure_ascii=False))}::jsonb, updated_at = now() where key = 'battle_fields';")
    for o, n in DUP.items():     # 합친 기술: 학생 몬스터가 기억하는 번호도 바꿈
        S.append(f'update public.collection set moves = array_replace(moves, {GB.MOVE_ID[o]}, {GB.MOVE_ID[n]}), '
                 f'learned = array_replace(learned, {GB.MOVE_ID[o]}, {GB.MOVE_ID[n]}) where {GB.MOVE_ID[o]} = any(moves) or {GB.MOVE_ID[o]} = any(learned);')
    S.append('delete from public.moves where id in (' + ', '.join(str(GB.MOVE_ID[o]) for o in DUP) + ');')
    S.append('delete from public.types where name not in (' + ', '.join(q(t) for t in REAL_TYPES) + ');')
    S.append('insert into public.type_chart (atk, def, mult) values ' + ', '.join(
        f'({q(a)}, {q(d)}, {m:g})' for (a, d), m in sorted(CHART.items()) if m != 1) + ';')
    S.append('commit;')
    out = os.path.join(ROOT, 'supabase', 'seed_pokemon.sql')
    open(out, 'w', encoding='utf-8', newline='\n').write('\n'.join(S) + '\n')
    # 그림 올리기용 표 (tools/upload_pokemon_sprites.mjs): species.id → 전국도감 번호 · 영어 이름
    ident = {int(r['id']): r['identifier'] for r in rd('pokemon_species') if int(r['id']) <= MAXDEX}
    json.dump({'species': {str(k): v for k, v in sorted(sprites.items())}, 'ident': {str(k): v for k, v in sorted(ident.items())}, 'items': ITEM_ICON},
              open(os.path.join(ROOT, 'tools', 'pokemon_sprites.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'{out}: lines {len(lines_sql)} (wild {sum(1 for x in lines_sql if x[4])}), species {len(species_rows)}, '
          f'moves {len(MOVES)}, learn {len(learn_rows)}, items {len(items)} (TM {len(TMS)})')
    for l in list(range(1, 6)) + [20, 35, 36, 41, 42, 77, 79, 83, 84, max(line_ids)]:
        print(' ', l, [NAME[s] for s in LINE_PATH[l]], evo_levels(LINE_PATH[l]), lines_sql[line_ids.index(l)][2:4])


if __name__ == '__main__':
    main()
