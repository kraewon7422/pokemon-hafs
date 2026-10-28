"""배틀 데이터(타입 상성·기술·능력치) 만들기 → supabase/seed_battle.sql

규칙 (docs/DESIGN.md '배틀' 참고):
- 타입 = 과목 10개 + 보통 + 전설. 과목은 순환: 국어→한국사→사회→외국어→영어→정보→수학→과학→체육→음악→국어
  각 과목은 바로 다음 두 과목에 '효과가 굉장했다'(×2), 반대로 앞의 두 과목에는 '효과가 별로인 듯하다'(×0.5).
  보통: 모두에게 ×1.  전설: 모두에게 ×1, 전설끼리만 ×2.
- 능력치(종족값) 6개: 과목마다 성향(가중치) × 단계별 총합 (1단계 300 / 2단계 405 / 3단계 500 / 전설 580~640).
  단계가 오를수록 HP·공격·방어 비중이 조금 커지고, 1단계는 스피드가 조금 높다. 같은 과목 안에서도 선생님마다 ±조금 다름.
- 기술 4개 = 공격 2 (자속 기술 + 다른 분류의 기술) + 상태 1 + 방어 1. 기술 이름은 실제 포켓몬 기술 이름.

사용법: python tools/gen_battle_data.py   (seed.sql 다음에 seed_battle.sql 을 실행)
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CYCLE = ['국어', '한국사', '사회', '외국어', '영어', '정보', '수학', '과학', '체육', '음악']
TYPES = CYCLE + ['보통', '전설']

# ── 기술: (이름, 타입, 분류 physical/special/status, 종류 attack/status/defense, 위력, 명중(None=반드시 맞음), PP, 우선도, 효과, 설명)
M = []


def mv(name, typ, cat, kind, power, acc, pp, prio=0, effect=None, desc=''):
    M.append(dict(name=name, type=typ, cat=cat, kind=kind, power=power, acc=acc, pp=pp, prio=prio, effect=effect or {}, desc=desc))
    return name


# 과목별 공격 기술: phys=(약, 강), spec=(약, 강)
ATK = {}


def pool(typ, pw, ps, sw, ss):
    ATK[typ] = dict(phys=(pw, ps), spec=(sw, ss))


pool('국어',
     mv('막치기', '국어', 'physical', 'attack', 40, 100, 35, desc='앞발이나 꼬리로 막 쳐서 공격한다.'),
     mv('누르기', '국어', 'physical', 'attack', 85, 100, 15, effect={'foe_status': 'par', 'chance': 30}, desc='온몸으로 덮쳐 누른다. 30% 확률로 마비.'),
     mv('에코보이스', '국어', 'special', 'attack', 40, 100, 15, desc='메아리치는 목소리로 공격한다.'),
     mv('하이퍼보이스', '국어', 'special', 'attack', 90, 100, 10, desc='엄청난 큰 소리로 공격한다.'))
pool('한국사',
     mv('돌떨구기', '한국사', 'physical', 'attack', 50, 90, 15, desc='작은 돌을 떨어뜨려 공격한다.'),
     mv('스톤에지', '한국사', 'physical', 'attack', 100, 80, 5, effect={'high_crit': True}, desc='날카로운 돌로 찌른다. 급소에 잘 맞는다.'),
     mv('원시의힘', '한국사', 'special', 'attack', 60, 100, 5, effect={'self_all_up': 10}, desc='옛날의 힘으로 공격한다. 10% 확률로 모든 능력이 오른다.'),
     mv('대지의힘', '한국사', 'special', 'attack', 90, 100, 10, effect={'foe': {'spd': -1}, 'chance': 10}, desc='땅의 힘을 터뜨린다. 10% 확률로 상대 특수방어↓.'))
pool('사회',
     mv('속여때리기', '사회', 'physical', 'attack', 60, None, 20, desc='방심하게 만든 뒤 때린다. 반드시 맞는다.'),
     mv('깨물어부수기', '사회', 'physical', 'attack', 80, 100, 15, effect={'foe': {'def': -1}, 'chance': 20}, desc='날카로운 이로 깨문다. 20% 확률로 상대 방어↓.'),
     mv('바크아웃', '사회', 'special', 'attack', 55, 95, 15, effect={'foe': {'spa': -1}, 'chance': 100}, desc='시끄럽게 떠들어 상대 특수공격을 떨어뜨린다.'),
     mv('악의파동', '사회', 'special', 'attack', 80, 100, 15, desc='악의로 가득 찬 파동을 쏜다.'))
pool('외국어',
     mv('날개치기', '외국어', 'physical', 'attack', 60, 100, 35, desc='날개를 펼쳐 쳐서 공격한다.'),
     mv('브레이브버드', '외국어', 'physical', 'attack', 120, 100, 15, effect={'recoil': 3}, desc='날개를 접고 돌진한다. 준 데미지의 1/3을 자신도 받는다.'),
     mv('바람일으키기', '외국어', 'special', 'attack', 40, 100, 35, desc='날개로 바람을 일으켜 공격한다.'),
     mv('에어슬래시', '외국어', 'special', 'attack', 75, 95, 15, desc='공기의 칼날로 벤다.'))
pool('영어',
     mv('사이코커터', '영어', 'physical', 'attack', 70, 100, 20, effect={'high_crit': True}, desc='마음의 칼날로 벤다. 급소에 잘 맞는다.'),
     mv('사념의박치기', '영어', 'physical', 'attack', 80, 90, 15, desc='생각의 힘을 모아 박치기한다.'),
     mv('염동력', '영어', 'special', 'attack', 50, 100, 25, desc='약한 염동력으로 공격한다.'),
     mv('사이코키네시스', '영어', 'special', 'attack', 90, 100, 10, effect={'foe': {'spd': -1}, 'chance': 10}, desc='강한 염동력으로 공격한다. 10% 확률로 상대 특수방어↓.'))
pool('정보',
     mv('스파크', '정보', 'physical', 'attack', 65, 100, 20, effect={'foe_status': 'par', 'chance': 30}, desc='전기를 두르고 돌진한다. 30% 확률로 마비.'),
     mv('번개펀치', '정보', 'physical', 'attack', 75, 100, 15, effect={'foe_status': 'par', 'chance': 10}, desc='전기를 담은 펀치. 10% 확률로 마비.'),
     mv('전기쇼크', '정보', 'special', 'attack', 40, 100, 30, effect={'foe_status': 'par', 'chance': 10}, desc='전기 충격으로 공격한다.'),
     mv('10만볼트', '정보', 'special', 'attack', 90, 100, 15, effect={'foe_status': 'par', 'chance': 10}, desc='강한 전격을 날린다. 10% 확률로 마비.'))
pool('수학',
     mv('얼음뭉치', '수학', 'physical', 'attack', 40, 100, 30, prio=1, desc='얼음덩어리를 재빨리 던진다. 반드시 먼저 공격한다.'),
     mv('냉동펀치', '수학', 'physical', 'attack', 75, 100, 15, desc='차가운 주먹으로 공격한다.'),
     mv('얼음숨결', '수학', 'special', 'attack', 60, 90, 10, effect={'always_crit': True}, desc='차가운 숨결. 반드시 급소에 맞는다.'),
     mv('냉동빔', '수학', 'special', 'attack', 90, 100, 10, desc='얼음 광선을 발사한다.'))
pool('과학',
     mv('니트로차지', '과학', 'physical', 'attack', 50, 100, 20, effect={'self': {'spe': 1}, 'chance': 100}, desc='불꽃을 두르고 부딪친다. 자신의 스피드↑.'),
     mv('불꽃펀치', '과학', 'physical', 'attack', 75, 100, 15, effect={'foe_status': 'brn', 'chance': 10}, desc='불꽃 주먹. 10% 확률로 화상.'),
     mv('불꽃세례', '과학', 'special', 'attack', 40, 100, 25, effect={'foe_status': 'brn', 'chance': 10}, desc='작은 불꽃을 쏜다.'),
     mv('화염방사', '과학', 'special', 'attack', 90, 100, 15, effect={'foe_status': 'brn', 'chance': 10}, desc='센 불꽃을 내뿜는다. 10% 확률로 화상.'))
pool('체육',
     mv('태권당수', '체육', 'physical', 'attack', 50, 100, 25, effect={'high_crit': True}, desc='손날로 내리친다. 급소에 잘 맞는다.'),
     mv('크로스촙', '체육', 'physical', 'attack', 100, 80, 5, effect={'high_crit': True}, desc='두 손을 교차해 내리친다. 급소에 잘 맞는다.'),
     mv('진공파', '체육', 'special', 'attack', 40, 100, 30, prio=1, desc='주먹을 휘둘러 진공의 파동을 쏜다. 반드시 먼저 공격한다.'),
     mv('파동탄', '체육', 'special', 'attack', 80, None, 20, desc='몸 안의 힘을 모아 쏜다. 반드시 맞는다.'))
pool('음악',
     mv('스위프뺨치기', '음악', 'physical', 'attack', 50, 85, 10, desc='리듬에 맞춰 연속으로 뺨을 친다.'),
     mv('치근거리기', '음악', 'physical', 'attack', 90, 90, 10, effect={'foe': {'atk': -1}, 'chance': 10}, desc='친한 척 달라붙어 공격한다. 10% 확률로 상대 공격↓.'),
     mv('요정의바람', '음악', 'special', 'attack', 40, 100, 30, desc='요정의 바람을 일으켜 공격한다.'),
     mv('문포스', '음악', 'special', 'attack', 95, 100, 15, effect={'foe': {'spa': -1}, 'chance': 30}, desc='달의 힘을 빌려 공격한다. 30% 확률로 상대 특수공격↓.'))
pool('전설',
     mv('용의숨결', '전설', 'special', 'attack', 60, 100, 20, effect={'foe_status': 'par', 'chance': 30}, desc='강한 숨결을 내뿜는다. 30% 확률로 마비.'),
     mv('드래곤크루', '전설', 'physical', 'attack', 80, 100, 15, desc='날카로운 발톱으로 할퀸다.'),
     mv('용의파동', '전설', 'special', 'attack', 85, 100, 10, desc='입에서 충격파를 내뿜는다.'),
     mv('역린', '전설', 'physical', 'attack', 120, 100, 10, desc='온 힘을 다해 날뛴다.'))
TACKLE = mv('몸통박치기', '보통', 'physical', 'attack', 40, 100, 35, desc='몸 전체로 부딪쳐 공격한다.')
QUICK = mv('전광석화', '보통', 'physical', 'attack', 40, 100, 30, prio=1, desc='눈에 보이지 않는 속도로 덮친다. 반드시 먼저 공격한다.')

# 상태 기술
GROWL = mv('울음소리', '보통', 'status', 'status', 0, 100, 40, effect={'foe': {'atk': -1}}, desc='귀여운 울음소리로 상대 공격을 떨어뜨린다.')
TAILW = mv('꼬리흔들기', '보통', 'status', 'status', 0, 100, 30, effect={'foe': {'def': -1}}, desc='꼬리를 흔들어 상대 방어를 떨어뜨린다.')
SDANCE = mv('칼춤', '보통', 'status', 'status', 0, None, 20, effect={'self': {'atk': 2}}, desc='투지를 높이는 춤. 공격이 크게 오른다.')
NPLOT = mv('나쁜음모', '사회', 'status', 'status', 0, None, 20, effect={'self': {'spa': 2}}, desc='나쁜 생각을 떠올린다. 특수공격이 크게 오른다.')
AGIL = mv('고속이동', '보통', 'status', 'status', 0, None, 30, effect={'self': {'spe': 2}}, desc='몸을 가볍게 한다. 스피드가 크게 오른다.')
CALM = mv('명상', '보통', 'status', 'status', 0, None, 20, effect={'self': {'spa': 1, 'spd': 1}}, desc='마음을 가라앉힌다. 특수공격·특수방어↑.')
BULK = mv('벌크업', '체육', 'status', 'status', 0, None, 20, effect={'self': {'atk': 1, 'def': 1}}, desc='근육을 키운다. 공격·방어↑.')
TWAVE = mv('전기자석파', '정보', 'status', 'status', 0, 100, 20, effect={'foe_status': 'par'}, desc='약한 전기로 상대를 마비시킨다.')
SING = mv('노래하기', '음악', 'status', 'status', 0, 55, 15, effect={'foe_status': 'slp'}, desc='기분 좋은 노래로 상대를 재운다.')
WISP = mv('도깨비불', '과학', 'status', 'status', 0, 85, 15, effect={'foe_status': 'brn'}, desc='불꽃으로 상대를 화상 입힌다.')
TOXIC = mv('맹독', '사회', 'status', 'status', 0, 90, 10, effect={'foe_status': 'psn'}, desc='상대를 독 상태로 만든다.')
GLARE = mv('째려보기', '보통', 'status', 'status', 0, 100, 30, effect={'foe': {'def': -1}}, desc='날카롭게 째려본다. 상대 방어↓.')
DDANCE = mv('용의춤', '전설', 'status', 'status', 0, None, 20, effect={'self': {'atk': 1, 'spe': 1}}, desc='신비한 춤. 공격·스피드↑.')
# 방어 기술
PROTECT = mv('방어', '보통', 'status', 'defense', 0, None, 10, prio=4, effect={'protect': True}, desc='그 턴의 공격을 막는다. 연속으로 쓰면 실패하기 쉽다.')
IRON = mv('철벽', '한국사', 'status', 'defense', 0, None, 15, effect={'self': {'def': 2}}, desc='몸을 단단하게 한다. 방어가 크게 오른다.')
REFLECT = mv('리플렉터', '보통', 'status', 'defense', 0, None, 20, effect={'screen': 'reflect'}, desc='5턴 동안 물리 공격 데미지를 줄인다.')
LSCREEN = mv('빛의장막', '보통', 'status', 'defense', 0, None, 30, effect={'screen': 'light'}, desc='5턴 동안 특수 공격 데미지를 줄인다.')
RECOVER = mv('자가재생', '보통', 'status', 'defense', 0, None, 10, effect={'heal': 50}, desc='HP를 최대 HP의 절반만큼 회복한다.')
MSUN = mv('아침햇살', '전설', 'status', 'defense', 0, None, 5, effect={'heal': 50}, desc='아침 햇살로 HP를 절반 회복한다.')
ROOST = mv('날개쉬기', '외국어', 'status', 'defense', 0, None, 10, effect={'heal': 50}, desc='땅에 내려와 쉰다. HP를 절반 회복한다.')

# 과목별 기본 상태/방어 기술 (단계별: 1단계는 약한 상태기)
STATUS_BY = {'국어': CALM, '한국사': BULK, '사회': TOXIC, '외국어': AGIL, '영어': CALM, '정보': TWAVE,
             '수학': NPLOT, '과학': WISP, '체육': SDANCE, '음악': SING}
DEFENSE_BY = {'국어': LSCREEN, '한국사': IRON, '사회': REFLECT, '외국어': ROOST, '영어': LSCREEN, '정보': PROTECT,
              '수학': PROTECT, '과학': RECOVER, '체육': PROTECT, '음악': RECOVER}

# ── 능력치 성향 [hp, atk, def, spa, spd, spe]
PROFILE = {
    '국어': [1.00, 0.80, 0.90, 1.20, 1.25, 0.85], '수학': [0.90, 0.70, 0.75, 1.45, 1.05, 1.15],
    '영어': [0.90, 0.85, 0.80, 1.15, 1.00, 1.30], '과학': [1.00, 0.75, 1.00, 1.30, 1.15, 0.80],
    '사회': [1.10, 0.90, 1.30, 0.85, 1.20, 0.65], '외국어': [0.80, 0.95, 0.75, 1.30, 0.90, 1.30],
    '정보': [0.80, 0.80, 0.70, 1.30, 0.90, 1.50], '한국사': [1.30, 1.05, 1.35, 0.80, 1.00, 0.50],
    '음악': [0.95, 0.80, 0.80, 1.15, 1.30, 1.00], '체육': [1.05, 1.45, 0.95, 0.60, 0.80, 1.15],
}
STAGE_TOTAL = {1: 300, 2: 405, 3: 500}
STAGE_SHIFT = {1: [0, 0, 0, 0, 0, .12], 2: [0, 0, 0, 0, 0, 0], 3: [.08, .06, .06, 0, 0, -.06]}
# 전설: 라인 → (총합, 성향, 기술 4개)
LEGEND = {
    35: (580, [1.10, 1.15, 1.00, 1.15, 1.00, 0.90], ['역린', '용의파동', DDANCE, PROTECT]),            # 금관오스 (교감)
    36: (590, [1.15, 1.00, 1.10, 1.25, 1.10, 0.90], ['드래곤크루', '사이코키네시스', CALM, LSCREEN]),  # 학사쟈 (교장)
    37: (520, [0.90, 0.90, 0.90, 0.90, 0.90, 1.60], ['속여때리기', '용의파동', AGIL, PROTECT]),        # 숨바꼬치 (비밀)
    38: (580, [1.00, 1.15, 0.90, 1.00, 0.90, 1.30], ['니트로차지', '용의파동', AGIL, MSUN]),           # 소디포 (아침)
    39: (580, [1.00, 0.85, 1.00, 1.30, 1.15, 0.90], ['드래곤크루', '문포스', CALM, LSCREEN]),          # 유리프 (점심)
    40: (580, [1.30, 1.00, 1.25, 0.90, 1.10, 0.70], ['역린', '악의파동', BULK, IRON]),                 # TTU (저녁)
    41: (600, [1.10, 1.10, 1.10, 1.10, 1.10, 0.90], ['스톤에지', '10만볼트', NPLOT, REFLECT]),         # 과연기 (도감 50%)
    42: (640, [1.10, 1.20, 1.00, 1.20, 1.00, 1.10], ['역린', '용의파동', DDANCE, RECOVER]),            # 창문기 (도감 100%)
}
# 라인 → 과목 (seed.sql 과 같은 순서)
SUBJECT = {}
for ids, subj in ((range(1, 5), '국어'), (range(5, 9), '수학'), (range(9, 12), '영어'), (range(12, 16), '과학'),
                  (range(16, 20), '사회'), (range(20, 25), '외국어'), (range(25, 28), '정보'), (range(28, 31), '한국사'),
                  ((31,), '음악'), (range(32, 35), '체육')):
    for i in ids:
        SUBJECT[i] = subj
RARE = set(range(20, 25))


def stats(total, w, line):
    # 같은 과목 안에서 선생님마다 다르게: 라인 번호로 능력치 두 쌍을 주고받음 (±10%, ±5%)
    w = list(w)
    for d, a, b in ((.10, (line * 7) % 6, (line * 11 + 3) % 6), (.05, (line * 13 + 1) % 6, (line * 3 + 4) % 6)):
        if a != b:
            w[a] += d
            w[b] -= d
    s = sum(w)
    v = [max(20, round(total * x / s)) for x in w]
    v[0] += total - sum(v)            # 반올림 오차는 HP 로
    return v


def species_rows():
    out = []
    for line in range(1, 43):
        if line in LEGEND:
            total, w, moves = LEGEND[line]
            out.append(((line - 1) * 3 + 1, stats(total, w, line), moves))
            continue
        subj = SUBJECT[line]
        i = CYCLE.index(subj)
        cover = CYCLE[(i - 3) % len(CYCLE)]          # 나를 이기는 두 과목을 모두 이기는 과목
        for st in (1, 2, 3):
            w = [p + q for p, q in zip(PROFILE[subj], STAGE_SHIFT[st])]
            total = STAGE_TOTAL[st] + (15 if line in RARE else 0)
            v = stats(total, w, line)
            phys = v[1] >= v[3]
            main = ATK[subj]['phys' if phys else 'spec']
            other = 'spec' if phys else 'phys'
            if st == 1:
                moves = [main[0], QUICK if line % 2 else TACKLE, GROWL if line % 2 else TAILW, PROTECT]
            elif st == 2:
                moves = [main[1], ATK[subj][other][0], STATUS_BY[subj], DEFENSE_BY[subj]]
            else:
                moves = [main[1], ATK[cover][other][1], STATUS_BY[subj], DEFENSE_BY[subj]]
            out.append(((line - 1) * 3 + st, v, moves))
    return out


def chart():
    rows = []
    n = len(CYCLE)
    for i, t in enumerate(CYCLE):
        for k in (1, 2):
            rows.append((t, CYCLE[(i + k) % n], 2.0))
            rows.append((CYCLE[(i + k) % n], t, 0.5))
    rows.append(('전설', '전설', 2.0))
    return rows


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    import json
    names = {m['name'] for m in M}
    rows = species_rows()
    for sid, v, moves in rows:
        assert len(moves) == 4 and all(x in names for x in moves), (sid, moves)
        kinds = [next(m['kind'] for m in M if m['name'] == x) for x in moves]
        assert sorted(kinds) == ['attack', 'attack', 'defense', 'status'], (sid, moves, kinds)
    sql = ['-- GENERATED by tools/gen_battle_data.py — do not edit by hand. Run after seed.sql.',
           'begin;',
           'delete from public.species_moves; delete from public.moves; delete from public.type_chart; delete from public.types;',
           'insert into public.types (name, sort) values ' + ', '.join(f'({q(t)}, {i})' for i, t in enumerate(TYPES)) + ';',
           'insert into public.type_chart (atk, def, mult) values ' + ', '.join(f'({q(a)}, {q(d)}, {m})' for a, d, m in chart()) + ';',
           'insert into public.moves (name, type, category, kind, power, accuracy, pp, priority, effect, description) values']
    sql.append(',\n'.join(f" ({q(m['name'])}, {q(m['type'])}, {q(m['cat'])}, {q(m['kind'])}, {m['power']}, "
                          f"{'null' if m['acc'] is None else m['acc']}, {m['pp']}, {m['prio']}, {q(json.dumps(m['effect'], ensure_ascii=False))}, {q(m['desc'])})"
                          for m in M) + ';')
    sql.append('update public.species s set hp = v.hp, atk = v.atk, def = v.def, spa = v.spa, spd = v.spd, spe = v.spe from (values')
    sql.append(',\n'.join(f' ({sid}, {", ".join(map(str, v))})' for sid, v, _ in rows))
    sql.append(') v(id, hp, atk, def, spa, spd, spe) where s.id = v.id;')
    sql.append('insert into public.species_moves (species_id, slot, move_id)')
    sql.append('select v.sid, v.slot, m.id from (values')
    sql.append(',\n'.join(f' ({sid}, {k + 1}, {q(x)})' for sid, _, moves in rows for k, x in enumerate(moves)))
    sql.append(') v(sid, slot, name) join public.moves m on m.name = v.name where exists (select 1 from public.species s where s.id = v.sid);')
    sql.append('commit;')
    out = os.path.join(ROOT, 'supabase', 'seed_battle.sql')
    open(out, 'w', encoding='utf-8', newline='\n').write('\n'.join(sql) + '\n')
    print(f'{out}: {len(M)} moves, {len(rows)} species, {len(chart())} chart cells')
    for sid, v, moves in rows[:3] + rows[96:99] + rows[-8:]:
        print(f'  #{sid:3d} 합{sum(v):3d} HP{v[0]:3d} 공{v[1]:3d} 방{v[2]:3d} 특공{v[3]:3d} 특방{v[4]:3d} 스{v[5]:3d}  {moves}')


if __name__ == '__main__':
    main()
