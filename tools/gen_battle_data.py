"""배틀 데이터(타입 상성·기술·능력치) 만들기 → supabase/seed_battle.sql

규칙 (docs/DESIGN.md '6-1. 배틀 데이터' 참고):
- 타입 15개 = 국어·수학·영어·물리·화학·생명·지구·지리·정치경제·윤리·역사·외국어·정보·체육·음악 (+ 보통, 전설).
  상성은 공격 타입 × 방어 타입 표(CHART): ×2 효과가 굉장했다 / ×0.5 효과가 별로인 듯하다 / ×0 효과가 없는 것 같다.
  보통: 모두 ×1.  전설: 모두 ×1, 전설끼리 ×2.  라인 → 타입 = tools/roster.py 의 BTYPE.
- 능력치(종족값) 6개: 타입 성향(PROFILE) × 단계 총합 (1단계 300 / 2단계 405 / 3단계 500 / 전설 520~640).
  3단계는 HP·공격·방어 비중↑, 1단계는 스피드↑. 같은 타입 안에서도 선생님(라인)마다 두 쌍을 ±10% / ±5% 주고받음.
- 기술 4개 = 공격 2 + 상태 1 + 방어 1 (실제 포켓몬 기술 이름).
  타입마다 물리·특수 기술 2~5개(약 → 강), 상태기 3개, 방어기 3개 중에서 라인 번호로 골라 같은 타입끼리도 다르게.
  1단계: 약한 자속기 + 전광석화/몸통박치기/다른 분류 약한 기술 + 울음소리/꼬리흔들기/상태기 + 방어(가끔 방어기)
  2단계: 중간 자속기 + 다른 분류 기술 + 상태기 + 방어기
  3단계: 강한 자속기 + 커버 기술(나에게 강한 타입을 많이 찌르는 타입의 강한 기술) + 상태기 + 방어기

사용법: python tools/gen_battle_data.py   (seed.sql 다음에 seed_battle.sql 실행)
"""
import json
import re
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from roster import BTYPE, NEW  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUBJ = ['국어', '수학', '영어', '물리', '화학', '생명', '지구', '지리', '정치경제', '윤리', '역사', '외국어', '정보', '체육', '음악']
TYPES = SUBJ + ['보통', '전설']

# 공격 → { 방어: 배수 }  (적힌 칸만, 나머지 ×1)
CHART = {
    '국어':     {'역사': 2, '윤리': 2, '정치경제': 2, '국어': .5, '수학': .5, '정보': .5},
    '수학':     {'물리': 2, '화학': 2, '정보': 2, '국어': .5, '음악': .5, '수학': .5},
    '영어':     {'외국어': 2, '정치경제': 2, '수학': 2, '국어': .5, '역사': .5},
    '물리':     {'지구': 2, '체육': 2, '정보': 2, '수학': .5, '생명': .5, '윤리': .5, '지리': .5},
    '화학':     {'생명': 2, '지구': 2, '물리': .5, '화학': .5, '음악': .5, '지리': .5},
    '생명':     {'체육': 2, '지리': 2, '음악': 2, '화학': .5, '생명': .5, '정보': .5},
    '지구':     {'지리': 2, '화학': 2, '역사': 2, '물리': .5, '생명': .5},
    '지리':     {'역사': 2, '외국어': 2, '정치경제': 2, '지구': .5, '정보': .5},
    '정치경제': {'지리': 2, '영어': 2, '체육': 2, '윤리': .5, '국어': .5, '음악': 0},
    '윤리':     {'정치경제': 2, '정보': 2, '역사': 2, '체육': .5, '물리': .5},
    '역사':     {'국어': 2, '윤리': 2, '음악': 2, '물리': .5, '외국어': .5, '정보': 0},
    '외국어':   {'영어': 2, '국어': 2, '음악': 2, '외국어': .5, '정보': .5},
    '정보':     {'수학': 2, '영어': 2, '물리': 2, '정보': .5, '역사': .5, '체육': .5},
    '체육':     {'음악': 2, '국어': 2, '생명': 2, '물리': .5, '지구': .5, '영어': .5, '수학': 0},
    '음악':     {'국어': 2, '윤리': 2, '외국어': 2, '물리': .5, '정치경제': .5},
}
assert set(CHART) == set(SUBJ) and all(set(v) <= set(SUBJ) for v in CHART.values())

# ── 기술 (실제 포켓몬 기술 한국어 이름. 수치는 대표 값) — 이름, 타입, 분류 physical/special/status, 종류 attack/status/defense,
#    위력, 명중(None=반드시 맞음), PP, 우선도, 효과, 설명
M = []


def mv(name, typ, cat, kind, power, acc, pp, prio=0, effect=None, desc=''):
    M.append(dict(name=name, type=typ, cat=cat, kind=kind, power=power, acc=acc, pp=pp, prio=prio, effect=effect or {}, desc=desc))
    return name


def P(name, typ, power, acc, pp, desc, prio=0, **eff):
    return mv(name, typ, 'physical', 'attack', power, acc, pp, prio, eff, desc)


def S(name, typ, power, acc, pp, desc, prio=0, **eff):
    return mv(name, typ, 'special', 'attack', power, acc, pp, prio, eff, desc)


# 타입 → 물리/특수 공격 기술 (약한 것부터). 단계·라인에 따라 이 중에서 골라 쓴다.
ATK = {
    '국어': dict(phys=[P('막치기', '국어', 40, 100, 35, '앞발이나 꼬리로 막 쳐서 공격한다.'),
                      P('베어가르기', '국어', 70, 100, 20, '날카로운 손톱으로 벤다. 급소에 잘 맞는다.', high_crit=True),
                      P('누르기', '국어', 85, 100, 15, '온몸으로 덮쳐 누른다. 30% 확률로 마비.', foe_status='par', chance=30),
                      P('이판사판태클', '국어', 120, 100, 15, '목숨을 걸고 부딪친다. 준 데미지의 1/3을 자신도 받는다.', recoil=3)],
                spec=[S('에코보이스', '국어', 40, 100, 15, '메아리치는 목소리로 공격한다.'),
                      S('돌림노래', '국어', 60, 100, 15, '여럿이 이어 부르는 노래로 공격한다.'),
                      S('하이퍼보이스', '국어', 90, 100, 10, '엄청난 큰 소리로 공격한다.'),
                      S('소란피기', '국어', 90, 100, 10, '시끄럽게 떠들며 공격한다.')]),
    '수학': dict(phys=[P('얼음뭉치', '수학', 40, 100, 30, '얼음덩어리를 재빨리 던진다. 반드시 먼저 공격한다.', prio=1),
                      P('냉동펀치', '수학', 75, 100, 15, '차가운 주먹으로 공격한다.'),
                      P('고드름떨구기', '수학', 85, 90, 10, '큰 고드름을 떨어뜨린다.')],
                spec=[S('얼음숨결', '수학', 60, 90, 10, '차가운 숨결. 반드시 급소에 맞는다.', always_crit=True),
                      S('오로라빔', '수학', 65, 100, 20, '무지개빛 광선. 10% 확률로 상대 공격↓.', foe={'atk': -1}, chance=10),
                      S('냉동빔', '수학', 90, 100, 10, '얼음 광선을 발사한다.'),
                      S('눈보라', '수학', 110, 70, 5, '거센 눈보라를 일으킨다.')]),
    '영어': dict(phys=[P('사이코커터', '영어', 70, 100, 20, '마음의 칼날로 벤다. 급소에 잘 맞는다.', high_crit=True),
                      P('사념의박치기', '영어', 80, 90, 15, '생각의 힘을 모아 박치기한다.'),
                      P('사이코팽', '영어', 85, 100, 10, '마음의 힘으로 깨문다. 상대의 벽(리플렉터·빛의장막)을 깬다.', break_screen=True)],
                spec=[S('염동력', '영어', 50, 100, 25, '약한 염동력으로 공격한다.'),
                      S('환상빔', '영어', 65, 100, 20, '신기한 광선을 쏜다.'),
                      S('사이코키네시스', '영어', 90, 100, 10, '강한 염동력. 10% 확률로 상대 특수방어↓.', foe={'spd': -1}, chance=10),
                      S('사이코부스트', '영어', 140, 90, 5, '온 힘을 다한 염동력. 쓰고 나면 자신의 특수공격이 크게 떨어진다.', self={'spa': -2}, chance=100)]),
    '물리': dict(phys=[P('불릿펀치', '물리', 40, 100, 30, '총알처럼 빠른 주먹. 반드시 먼저 공격한다.', prio=1),
                      P('메탈크로우', '물리', 50, 95, 35, '쇠 발톱으로 할퀸다. 10% 확률로 자신의 공격↑.', self={'atk': 1}, chance=10),
                      P('아이언헤드', '물리', 80, 100, 15, '강철처럼 단단한 머리로 들이받는다.'),
                      P('아이언테일', '물리', 100, 75, 15, '단단한 꼬리로 친다. 30% 확률로 상대 방어↓.', foe={'def': -1}, chance=30)],
                spec=[S('미러샷', '물리', 65, 85, 10, '빛을 반사해 쏜다.'),
                      S('러스터캐논', '물리', 80, 100, 10, '빛의 에너지. 10% 확률로 상대 특수방어↓.', foe={'spd': -1}, chance=10),
                      S('철제광선', '물리', 140, 95, 5, '몸의 쇠를 모아 쏜다. 자신도 최대 HP의 절반만큼 다친다.', self_damage=50)]),
    '화학': dict(phys=[P('니트로차지', '화학', 50, 100, 20, '불꽃을 두르고 부딪친다. 자신의 스피드↑.', self={'spe': 1}, chance=100),
                      P('불꽃펀치', '화학', 75, 100, 15, '불꽃 주먹. 10% 확률로 화상.', foe_status='brn', chance=10),
                      P('독찌르기', '화학', 80, 100, 20, '독을 묻혀 찌른다. 30% 확률로 독.', foe_status='psn', chance=30),
                      P('플레어드라이브', '화학', 120, 100, 15, '불꽃을 두르고 돌진한다. 준 데미지의 1/3을 자신도 받는다.', recoil=3)],
                spec=[S('불꽃세례', '화학', 40, 100, 25, '작은 불꽃을 쏜다. 10% 확률로 화상.', foe_status='brn', chance=10),
                      S('오물폭탄', '화학', 90, 100, 10, '오물을 던진다. 30% 확률로 독.', foe_status='psn', chance=30),
                      S('화염방사', '화학', 90, 100, 15, '센 불꽃을 내뿜는다. 10% 확률로 화상.', foe_status='brn', chance=10),
                      S('불대문자', '화학', 110, 85, 5, '大 모양의 불꽃. 10% 확률로 화상.', foe_status='brn', chance=10)]),
    '생명': dict(phys=[P('잎날가르기', '생명', 55, 95, 25, '날카로운 잎으로 벤다. 급소에 잘 맞는다.', high_crit=True),
                      P('시저크로스', '생명', 80, 100, 15, '가위처럼 교차해 벤다.'),
                      P('씨폭탄', '생명', 80, 100, 15, '단단한 씨를 퍼붓는다.'),
                      P('우드해머', '생명', 120, 100, 15, '단단한 몸통으로 친다. 준 데미지의 1/3을 자신도 받는다.', recoil=3)],
                spec=[S('메가드레인', '생명', 40, 100, 15, '양분을 빨아들인다. 준 데미지의 절반만큼 회복.', drain=50),
                      S('기가드레인', '생명', 75, 100, 10, '양분을 크게 빨아들인다. 준 데미지의 절반만큼 회복.', drain=50),
                      S('에너지볼', '생명', 90, 100, 10, '자연의 힘. 10% 확률로 상대 특수방어↓.', foe={'spd': -1}, chance=10),
                      S('리프스톰', '생명', 130, 90, 5, '잎사귀 폭풍. 쓰고 나면 자신의 특수공격이 크게 떨어진다.', self={'spa': -2}, chance=100)]),
    '지구': dict(phys=[P('돌떨구기', '지구', 50, 90, 15, '작은 돌을 떨어뜨려 공격한다.'),
                      P('스톤샤워', '지구', 75, 90, 10, '큰 바위를 쏟아붓는다.'),
                      P('지진', '지구', 100, 100, 10, '땅을 크게 흔든다.'),
                      P('스톤에지', '지구', 100, 80, 5, '날카로운 돌로 찌른다. 급소에 잘 맞는다.', high_crit=True)],
                spec=[S('진흙뿌리기', '지구', 55, 95, 15, '진흙을 뿌린다. 상대 명중률↓.', foe={'acc': -1}, chance=100),
                      S('파워젬', '지구', 80, 100, 20, '보석처럼 빛나는 광선을 쏜다.'),
                      S('대지의힘', '지구', 90, 100, 10, '땅의 힘을 터뜨린다. 10% 확률로 상대 특수방어↓.', foe={'spd': -1}, chance=10)]),
    '지리': dict(phys=[P('아쿠아제트', '지리', 40, 100, 20, '물을 두르고 돌진한다. 반드시 먼저 공격한다.', prio=1),
                      P('폭포오르기', '지리', 80, 100, 15, '폭포를 거슬러 오르는 힘으로 부딪친다.'),
                      P('아쿠아브레이크', '지리', 85, 100, 10, '물을 두르고 부순다. 20% 확률로 상대 방어↓.', foe={'def': -1}, chance=20),
                      P('아쿠아테일', '지리', 90, 90, 10, '거센 파도처럼 꼬리를 휘두른다.')],
                spec=[S('물대포', '지리', 40, 100, 25, '물을 세차게 뿜는다.'),
                      S('거품광선', '지리', 65, 100, 20, '거품을 쏜다. 10% 확률로 상대 스피드↓.', foe={'spe': -1}, chance=10),
                      S('파도타기', '지리', 90, 100, 15, '큰 파도로 덮친다.'),
                      S('하이드로펌프', '지리', 110, 80, 5, '엄청난 물줄기를 뿜는다.')]),
    '정치경제': dict(phys=[P('속여때리기', '정치경제', 60, None, 20, '방심하게 만든 뒤 때린다. 반드시 맞는다.'),
                          P('깜짝베기', '정치경제', 70, 100, 15, '틈을 노려 벤다. 급소에 잘 맞는다.', high_crit=True),
                          P('깨물어부수기', '정치경제', 80, 100, 15, '날카로운 이로 깨문다. 20% 확률로 상대 방어↓.', foe={'def': -1}, chance=20),
                          P('속임수', '정치경제', 95, 100, 15, '상대의 힘을 이용해 공격한다.')],
                    spec=[S('바크아웃', '정치경제', 55, 95, 15, '시끄럽게 떠들어 상대 특수공격을 떨어뜨린다.', foe={'spa': -1}, chance=100),
                          S('악의파동', '정치경제', 80, 100, 15, '악의로 가득 찬 파동을 쏜다.')]),
    '윤리': dict(phys=[P('보복', '윤리', 50, 100, 10, '당한 만큼 되갚는다.'),
                      P('깨트리기', '윤리', 75, 100, 15, '손날로 내리친다. 상대의 벽(리플렉터·빛의장막)을 깬다.', break_screen=True),
                      P('성스러운칼', '윤리', 90, 100, 15, '바른 마음의 칼로 벤다.')],
                spec=[S('드레인키스', '윤리', 50, 100, 10, '힘을 나눠 받는다. 준 데미지의 3/4만큼 회복.', drain=75),
                      S('매지컬샤인', '윤리', 80, 100, 10, '강한 빛을 쏘아 공격한다.'),
                      S('신통력', '윤리', 80, 100, 20, '신비한 힘으로 공격한다.')]),
    '역사': dict(phys=[P('야습', '역사', 40, 100, 30, '그림자처럼 다가가 먼저 공격한다.', prio=1),
                      P('섀도크루', '역사', 70, 100, 15, '그림자 발톱으로 할퀸다. 급소에 잘 맞는다.', high_crit=True),
                      P('섀도본', '역사', 85, 100, 10, '뼈로 내리친다. 20% 확률로 상대 방어↓.', foe={'def': -1}, chance=20)],
                spec=[S('원시의힘', '역사', 60, 100, 5, '옛날의 힘. 10% 확률로 모든 능력이 오른다.', self_all_up=10),
                      S('병상첨병', '역사', 65, 100, 10, '오래된 기억으로 괴롭힌다.'),
                      S('섀도볼', '역사', 80, 100, 15, '그림자 덩어리. 20% 확률로 상대 특수방어↓.', foe={'spd': -1}, chance=20)]),
    '외국어': dict(phys=[P('날개치기', '외국어', 60, 100, 35, '날개를 펼쳐 쳐서 공격한다.'),
                        P('제비반환', '외국어', 60, None, 20, '재빠르게 날아 벤다. 반드시 맞는다.'),
                        P('드릴부리', '외국어', 80, 100, 20, '부리를 돌리며 찌른다.'),
                        P('브레이브버드', '외국어', 120, 100, 15, '날개를 접고 돌진한다. 준 데미지의 1/3을 자신도 받는다.', recoil=3)],
                  spec=[S('바람일으키기', '외국어', 40, 100, 35, '날개로 바람을 일으켜 공격한다.'),
                        S('에어슬래시', '외국어', 75, 95, 15, '공기의 칼날로 벤다.'),
                        S('열풍', '외국어', 95, 90, 10, '뜨거운 바람. 10% 확률로 화상.', foe_status='brn', chance=10),
                        S('폭풍', '외국어', 110, 70, 10, '거센 폭풍을 일으킨다.')]),
    '정보': dict(phys=[P('스파크', '정보', 65, 100, 20, '전기를 두르고 돌진한다. 30% 확률로 마비.', foe_status='par', chance=30),
                      P('번개펀치', '정보', 75, 100, 15, '전기를 담은 펀치. 10% 확률로 마비.', foe_status='par', chance=10),
                      P('와일드볼트', '정보', 90, 100, 15, '전기를 두르고 돌진한다. 준 데미지의 1/4을 자신도 받는다.', recoil=4)],
                spec=[S('전기쇼크', '정보', 40, 100, 30, '전기 충격. 10% 확률로 마비.', foe_status='par', chance=10),
                      S('볼트체인지', '정보', 70, 100, 20, '전기를 흘려 공격한다.'),
                      S('10만볼트', '정보', 90, 100, 15, '강한 전격. 10% 확률로 마비.', foe_status='par', chance=10),
                      S('번개', '정보', 110, 70, 10, '벼락을 떨어뜨린다. 30% 확률로 마비.', foe_status='par', chance=30)]),
    '체육': dict(phys=[P('바위깨기', '체육', 40, 100, 15, '주먹으로 깨부순다. 50% 확률로 상대 방어↓.', foe={'def': -1}, chance=50),
                      P('태권당수', '체육', 50, 100, 25, '손날로 내리친다. 급소에 잘 맞는다.', high_crit=True),
                      P('드레인펀치', '체육', 75, 100, 10, '힘을 빼앗는 펀치. 준 데미지의 절반만큼 회복.', drain=50),
                      P('크로스촙', '체육', 100, 80, 5, '두 손을 교차해 내리친다. 급소에 잘 맞는다.', high_crit=True),
                      P('인파이트', '체육', 120, 100, 5, '몸을 던져 싸운다. 자신의 방어·특수방어가 떨어진다.', self={'def': -1, 'spd': -1}, chance=100)],
                spec=[S('진공파', '체육', 40, 100, 30, '진공의 파동을 쏜다. 반드시 먼저 공격한다.', prio=1),
                      S('파동탄', '체육', 80, None, 20, '몸 안의 힘을 모아 쏜다. 반드시 맞는다.'),
                      S('기합구슬', '체육', 120, 70, 5, '기합을 모아 쏜다. 10% 확률로 상대 특수방어↓.', foe={'spd': -1}, chance=10)]),
    '음악': dict(phys=[P('스위프뺨치기', '음악', 50, 85, 10, '리듬에 맞춰 연속으로 뺨을 친다.'),
                      P('치근거리기', '음악', 90, 90, 10, '친한 척 달라붙어 공격한다. 10% 확률로 상대 공격↓.', foe={'atk': -1}, chance=10)],
                spec=[S('요정의바람', '음악', 40, 100, 30, '요정의 바람을 일으켜 공격한다.'),
                      S('벌레의야단법석', '음악', 90, 100, 10, '날갯소리로 공격한다. 10% 확률로 상대 특수방어↓.', foe={'spd': -1}, chance=10),
                      S('문포스', '음악', 95, 100, 15, '달의 힘. 30% 확률로 상대 특수공격↓.', foe={'spa': -1}, chance=30)]),
    '전설': dict(phys=[P('드래곤크루', '전설', 80, 100, 15, '날카로운 발톱으로 할퀸다.'),
                      P('역린', '전설', 120, 100, 10, '온 힘을 다해 날뛴다.')],
                spec=[S('용의숨결', '전설', 60, 100, 20, '강한 숨결. 30% 확률로 마비.', foe_status='par', chance=30),
                      S('용의파동', '전설', 85, 100, 10, '입에서 충격파를 내뿜는다.'),
                      S('용성군', '전설', 130, 90, 5, '하늘에서 유성을 떨어뜨린다. 쓰고 나면 자신의 특수공격이 크게 떨어진다.', self={'spa': -2}, chance=100)]),
}
TACKLE = P('몸통박치기', '보통', 40, 100, 35, '몸 전체로 부딪쳐 공격한다.')
QUICK = P('전광석화', '보통', 40, 100, 30, '눈에 보이지 않는 속도로 덮친다. 반드시 먼저 공격한다.', prio=1)
STONE = '스톤에지'


def ST(name, typ, acc, pp, desc, **eff):
    return mv(name, typ, 'status', 'status', 0, acc, pp, 0, eff, desc)


def DF(name, typ, pp, desc, prio=0, **eff):
    return mv(name, typ, 'status', 'defense', 0, None, pp, prio, eff, desc)


# 상태 기술
GROWL = ST('울음소리', '보통', 100, 40, '귀여운 울음소리로 상대 공격을 떨어뜨린다.', foe={'atk': -1})
TAILW = ST('꼬리흔들기', '보통', 100, 30, '꼬리를 흔들어 상대 방어를 떨어뜨린다.', foe={'def': -1})
SDANCE = ST('칼춤', '보통', None, 20, '투지를 높이는 춤. 공격이 크게 오른다.', self={'atk': 2})
NPLOT = ST('나쁜음모', '정치경제', None, 20, '나쁜 생각을 떠올린다. 특수공격이 크게 오른다.', self={'spa': 2})
AGIL = ST('고속이동', '보통', None, 30, '몸을 가볍게 한다. 스피드가 크게 오른다.', self={'spe': 2})
CALM = ST('명상', '보통', None, 20, '마음을 가라앉힌다. 특수공격·특수방어↑.', self={'spa': 1, 'spd': 1})
BULK = ST('벌크업', '체육', None, 20, '근육을 키운다. 공격·방어↑.', self={'atk': 1, 'def': 1})
TWAVE = ST('전기자석파', '정보', 100, 20, '약한 전기로 상대를 마비시킨다.', foe_status='par')
SING = ST('노래하기', '음악', 55, 15, '기분 좋은 노래로 상대를 재운다.', foe_status='slp')
WISP = ST('도깨비불', '화학', 85, 15, '불꽃으로 상대를 화상 입힌다.', foe_status='brn')
TOXIC = ST('맹독', '정치경제', 90, 10, '상대를 독 상태로 만든다.', foe_status='psn')
SPORE = ST('수면가루', '생명', 75, 15, '잠이 오는 가루를 뿌린다.', foe_status='slp')
HYPNO = ST('최면술', '역사', 60, 20, '옛 이야기를 들려주며 재운다.', foe_status='slp')
SAND = ST('모래뿌리기', '지구', 100, 15, '모래를 뿌려 상대 명중률을 떨어뜨린다.', foe={'acc': -1})
DDANCE = ST('용의춤', '전설', None, 20, '신비한 춤. 공격·스피드↑.', self={'atk': 1, 'spe': 1})
SCREECH = ST('싫은소리', '국어', 85, 40, '듣기 싫은 소리로 상대 방어를 크게 떨어뜨린다.', foe={'def': -2})
CHARM = ST('애교부리기', '음악', 100, 20, '귀엽게 굴어 상대 공격을 크게 떨어뜨린다.', foe={'atk': -2})
FAKETEARS = ST('거짓울음', '정치경제', 100, 20, '우는 척해서 상대 특수방어를 크게 떨어뜨린다.', foe={'spd': -2})
METALSOUND = ST('금속음', '물리', 85, 40, '쇠끼리 긁는 소리로 상대 특수방어를 크게 떨어뜨린다.', foe={'spd': -2})
AMNESIA = ST('망각술', '영어', None, 20, '머리를 비운다. 특수방어가 크게 오른다.', self={'spd': 2})
GROWTH = ST('성장', '생명', None, 20, '몸을 키운다. 공격·특수공격↑.', self={'atk': 1, 'spa': 1})
COSMIC = ST('코스믹파워', '지구', None, 20, '우주의 힘으로 방어·특수방어↑.', self={'def': 1, 'spd': 1})
WORKUP = ST('분발', '체육', None, 30, '힘을 낸다. 공격·특수공격↑.', self={'atk': 1, 'spa': 1})
CONFIDE = ST('비밀이야기', '역사', None, 20, '비밀 이야기로 상대 특수공격을 떨어뜨린다.', foe={'spa': -1})
TAILWIND = ST('순풍', '외국어', None, 15, '등 뒤에서 바람이 분다. 스피드가 크게 오른다.', self={'spe': 2})
RAINDANCE = ST('비바라기', '지리', None, 5, '비를 부른다. 특수공격·스피드↑.', self={'spa': 1, 'spe': 1})
NASTYCALC = ST('록커트', '수학', None, 20, '몸을 매끈하게 다듬는다. 스피드가 크게 오른다.', self={'spe': 2})

# 방어 기술
PROTECT = DF('방어', '보통', 10, '그 턴의 공격을 막는다. 연속으로 쓰면 실패하기 쉽다.', prio=4, protect=True)
ENDURE = DF('버티기', '보통', 10, '그 턴에는 쓰러지지 않고 HP 1로 버틴다. 연속으로 쓰면 실패하기 쉽다.', prio=4, endure=True)
IRON = DF('철벽', '물리', 15, '몸을 단단하게 한다. 방어가 크게 오른다.', self={'def': 2})
REFLECT = DF('리플렉터', '보통', 20, '5턴 동안 물리 공격 데미지를 줄인다.', screen='reflect')
LSCREEN = DF('빛의장막', '보통', 30, '5턴 동안 특수 공격 데미지를 줄인다.', screen='light')
RECOVER = DF('자가재생', '보통', 10, 'HP를 최대 HP의 절반만큼 회복한다.', heal=50)
SYNTH = DF('광합성', '생명', 5, '햇빛을 받아 HP를 절반 회복한다.', heal=50)
MSUN = DF('아침햇살', '전설', 5, '아침 햇살로 HP를 절반 회복한다.', heal=50)
ROOST = DF('날개쉬기', '외국어', 10, '땅에 내려와 쉰다. HP를 절반 회복한다.', heal=50)
REST = DF('잠자기', '영어', 10, 'HP를 모두 회복하고 2턴 동안 잠든다.', rest=True)
AQUARING = DF('아쿠아링', '지리', 20, '물의 베일로 몸을 감싸 HP를 회복한다.', heal=50)
ACIDARMOR = DF('녹기', '화학', 20, '몸을 녹여 방어를 크게 올린다.', self={'def': 2})
WISH = DF('희망사항', '윤리', 10, '소원을 빌어 HP를 절반 회복한다.', heal=50)
SHELTER = DF('웅크리기', '보통', 40, '몸을 웅크린다. 방어↑.', self={'def': 1})
DETECT = DF('판별', '체육', 5, '상대의 공격을 꿰뚫어 보고 피한다. 연속으로 쓰면 실패하기 쉽다.', prio=4, protect=True)
MILKDRINK = DF('우유마시기', '음악', 10, '우유를 마셔 HP를 절반 회복한다.', heal=50)
SLACKOFF = DF('태만함', '정치경제', 10, '게으름을 피워 HP를 절반 회복한다.', heal=50)

# 타입별 상태기·방어기 후보 (라인마다 다른 것을 고른다)
STATUS_POOL = {
    '국어': [CALM, SCREECH, GROWL], '수학': [NPLOT, NASTYCALC, AGIL], '영어': [CALM, AMNESIA, AGIL],
    '물리': [AGIL, METALSOUND, BULK], '화학': [WISP, TOXIC, NPLOT], '생명': [SPORE, GROWTH, CALM],
    '지구': [SAND, COSMIC, BULK], '지리': [RAINDANCE, AGIL, CALM], '정치경제': [TOXIC, FAKETEARS, NPLOT],
    '윤리': [CALM, AMNESIA, CHARM], '역사': [HYPNO, CONFIDE, TOXIC], '외국어': [TAILWIND, AGIL, CALM],
    '정보': [TWAVE, AGIL, NASTYCALC], '체육': [SDANCE, BULK, WORKUP], '음악': [SING, CHARM, CALM],
}
DEFENSE_POOL = {
    '국어': [LSCREEN, PROTECT, SHELTER], '수학': [PROTECT, LSCREEN, RECOVER], '영어': [LSCREEN, REST, PROTECT],
    '물리': [IRON, REFLECT, PROTECT], '화학': [RECOVER, ACIDARMOR, PROTECT], '생명': [SYNTH, RECOVER, PROTECT],
    '지구': [IRON, SHELTER, PROTECT], '지리': [AQUARING, PROTECT, RECOVER], '정치경제': [REFLECT, SLACKOFF, PROTECT],
    '윤리': [WISH, LSCREEN, RECOVER], '역사': [IRON, REFLECT, ENDURE], '외국어': [ROOST, PROTECT, ENDURE],
    '정보': [PROTECT, LSCREEN, ENDURE], '체육': [DETECT, ENDURE, REFLECT], '음악': [MILKDRINK, LSCREEN, PROTECT],
}
assert set(STATUS_POOL) == set(SUBJ) == set(DEFENSE_POOL)

# ── 늘린 기술 (0020): tools/moves_extra.tsv = 실제 포켓몬 기술 (공식 한국어 이름, 9세대 수치, PokeAPI 자료).
#    원래 타입 → 과목 타입. 엔진이 못 하는 기술(2턴 모으기·숨기·고정 데미지·일격필살·교체·나중에 맞히기 등)은 뺀다.
#    파괴광선류(다음 턴 쉼) = recharge, 연속 공격 = hits (2 = 2번, 3 = 3번, 5 = 2~5번), 풀죽음 = flinch, 회피율 = eva.
EN2SUBJ = {'normal': '보통', 'fire': '화학', 'water': '지리', 'grass': '생명', 'electric': '정보', 'ice': '수학', 'fighting': '체육',
           'poison': '화학', 'ground': '지구', 'flying': '외국어', 'psychic': '영어', 'bug': '생명', 'rock': '지구', 'ghost': '역사',
           'dragon': '전설', 'dark': '정치경제', 'steel': '물리', 'fairy': '윤리'}
EN_WORD = {'normal': '온몸', 'fire': '불꽃', 'water': '물', 'grass': '풀', 'electric': '전기', 'ice': '얼음', 'fighting': '격투 기술',
           'poison': '독', 'ground': '땅의 힘', 'flying': '바람', 'psychic': '염동력', 'bug': '벌레의 힘', 'rock': '바위', 'ghost': '그림자',
           'dragon': '용의 힘', 'dark': '어둠의 힘', 'steel': '강철', 'fairy': '요정의 힘'}
AIL = {'paralysis': 'par', 'burn': 'brn', 'poison': 'psn', 'sleep': 'slp', 'freeze': 'frz', 'confusion': 'cnf'}
AIL_TXT = {'par': '마비시킨다', 'brn': '화상을 입힌다', 'psn': '독 상태로 만든다', 'slp': '재운다', 'frz': '얼린다', 'cnf': '혼란에 빠뜨린다'}
STAT = {'attack': 'atk', 'defense': 'def', 'special-attack': 'spa', 'special-defense': 'spd', 'speed': 'spe', 'accuracy': 'acc', 'evasion': 'eva'}
STAT_TXT = {'atk': '공격', 'def': '방어', 'spa': '특수공격', 'spd': '특수방어', 'spe': '스피드', 'acc': '명중률', 'eva': '회피율'}
SKIP = ('requires a turn to charge', 'charges for one turn', 'one-hit ko', 'prevents the target from fleeing', 'switch out',
        'two turns later', 'dodging all attacks', 'if the user faints', 'every turn for 2-3', 'equal to', 'points of damage',
        'heavier', 'lower speed', 'half the target', 'causes damage when opposing', 'stealing hp')


def josa(w, a, b):
    c = w[-1]
    return w + (a if '가' <= c <= '힣' and (ord(c) - 0xAC00) % 28 else b)


def ro(w):   # (으)로: 받침 있으면 '으로' (ㄹ 받침은 '로')
    c = w[-1]
    j = (ord(c) - 0xAC00) % 28 if '가' <= c <= '힣' else 0
    return w + ('으로' if j and j != 8 else '로')


def stat_txt(ch, who):
    ups = [k for k, v in ch.items() if v > 0]
    dns = [k for k, v in ch.items() if v < 0]
    out = []
    for ks, up in ((ups, True), (dns, False)):
        if not ks:
            continue
        big = any(abs(ch[k]) >= 2 for k in ks)
        names = '·'.join(STAT_TXT[k] for k in ks)
        out.append(f"{who} {josa(names, '이', '가')} {'크게 ' if big else ''}{'오른다' if up else '떨어진다'}.")
    return ' '.join(out)


def extra_moves():
    import csv
    rows = list(csv.DictReader(open(os.path.join(ROOT, 'tools', 'moves_extra.tsv'), encoding='utf-8'), delimiter='\t'))
    have = {m['name'] for m in M}
    alt = {'poison': 0, 'fairy': 0}
    special = []
    for r in rows:
        e_en = r['effect_en'].lower()
        if r['ko'] in have or any(k in e_en for k in SKIP):
            continue
        if r['ailment'] not in AIL and r['ailment'] not in ('', 'protect'):
            continue
        cat = r['class']
        if cat != 'status' and r['power'] in ('', '-'):
            continue
        typ = EN2SUBJ[r['type']]
        if r['type'] in alt:      # 독 → 화학/정치경제, 페어리 → 윤리/음악 번갈아
            typ = [typ, '정치경제' if r['type'] == 'poison' else '음악'][alt[r['type']] % 2]
            alt[r['type']] += 1
        power = int(r['power']) if cat != 'status' else 0
        acc = None if r['never_miss'] == 'Y' or r['acc'] in ('', '-') else int(r['acc'])
        prio = int(r['priority'] or 0)
        eff, txt = {}, []
        if r['ailment'] == 'protect':
            eff['protect'] = True
        if r['ailment'] in AIL:
            eff['foe_status'] = AIL[r['ailment']]
            ch = int(r['ailment_chance'] or 100)
            if cat != 'status' and ch < 100:
                eff['chance'] = ch
            txt.append(f"{'' if ch >= 100 else f'{ch}% 확률로 '}상대를 {AIL_TXT[eff['foe_status']]}.")
        if r['flinch_chance']:
            eff['flinch'] = int(r['flinch_chance'])
            txt.append(f"{eff['flinch']}% 확률로 상대를 풀죽게 한다.")
        if r['stat_changes']:
            ch = {}
            for part in r['stat_changes'].split():
                k, v = re.match(r'([a-z-]+?)([+-]\d)$', part).groups()
                ch[STAT[k]] = int(v)
            sc = int(r['stat_chance'] or 100)
            mine = (cat == 'status' and all(v > 0 for v in ch.values())) or (cat != 'status' and (all(v > 0 for v in ch.values()) or (sc >= 100 and power >= 100)))
            eff['self' if mine else 'foe'] = ch
            if cat != 'status':
                eff['chance'] = sc if 'chance' not in eff else max(eff['chance'], sc)
            txt.append(f"{'' if sc >= 100 else f'{sc}% 확률로 '}{stat_txt(ch, '자신의' if mine else '상대의')}")
        if r['crit_stage']:
            eff['always_crit' if int(r['crit_stage']) >= 3 else 'high_crit'] = True
            txt.append('반드시 급소에 맞는다.' if int(r['crit_stage']) >= 3 else '급소에 잘 맞는다.')
        if r['drain_pct']:
            d = int(r['drain_pct'])
            if d > 0:
                eff['drain'] = d
                txt.append(f"준 데미지의 {'절반' if d == 50 else str(d) + '%'}만큼 회복한다.")
            else:
                eff['recoil'] = round(100 / -d)
                txt.append(f"준 데미지의 1/{eff['recoil']}을 자신도 받는다.")
        if r['heal_pct']:
            eff['heal'] = int(r['heal_pct'])
            txt.append('HP를 최대 HP의 절반만큼 회복한다.')
        if 'recharge' in e_en:
            eff['recharge'] = True
            txt.append('쓰고 나면 다음 턴에는 움직일 수 없다.')
        if r['hits']:
            eff['hits'] = 5 if r['hits'] == '2-5' else int(r['hits'])
            txt.insert(0, '2~5번 연속으로 공격한다.' if eff['hits'] == 5 else f"{eff['hits']}번 연속으로 공격한다.")
        if prio > 0:
            txt.insert(0, '반드시 먼저 공격한다.')
        if acc is None and cat != 'status':
            txt.append('반드시 맞는다.')
        if cat == 'status':
            kind = 'defense' if eff.get('heal') or eff.get('protect') or ('self' in eff and set(eff['self']) <= {'def', 'spd', 'eva'}) else 'status'
            desc = ' '.join(txt) or '특별한 기술을 쓴다.'
        else:
            kind = 'attack'
            desc = ro(EN_WORD[r['type']]) + ' 공격한다. ' + ' '.join(txt)
        mv(r['ko'], typ, cat, kind, power, acc, int(r['pp'] or 10), prio, eff, desc.strip())
        if r['signature'] == 'Y':
            special.append(r['ko'])
    return special


SIGNATURE = extra_moves()
MOVE_ID = {m['name']: i + 1 for i, m in enumerate(M)}      # 고정 번호 (목록 뒤에만 덧붙이면 번호가 안 바뀜)

# ── 능력치 성향 [hp, atk, def, spa, spd, spe]
PROFILE = {
    '국어': [1.00, 0.80, 0.90, 1.20, 1.25, 0.85], '수학': [0.90, 0.70, 0.75, 1.45, 1.05, 1.15],
    '영어': [0.90, 0.85, 0.80, 1.15, 1.00, 1.30], '물리': [1.00, 1.35, 1.00, 0.85, 0.85, 1.05],
    '화학': [0.95, 0.75, 0.95, 1.40, 1.05, 0.90], '생명': [1.25, 0.95, 1.00, 1.00, 1.10, 0.80],
    '지구': [1.15, 1.00, 1.40, 0.80, 1.05, 0.60], '지리': [1.00, 0.90, 0.95, 1.00, 0.95, 1.30],
    '정치경제': [1.00, 1.10, 1.00, 1.15, 0.95, 0.90], '윤리': [1.10, 0.80, 1.05, 1.00, 1.40, 0.75],
    '역사': [1.30, 1.05, 1.35, 0.80, 1.00, 0.50], '외국어': [0.80, 0.95, 0.75, 1.30, 0.90, 1.30],
    '정보': [0.80, 0.80, 0.70, 1.30, 0.90, 1.50], '체육': [1.05, 1.45, 0.95, 0.60, 0.80, 1.15],
    '음악': [0.95, 0.80, 0.80, 1.15, 1.30, 1.00],
}
STAGE_TOTAL = {1: 300, 2: 405, 3: 500}
STAGE_SHIFT = {1: [0, 0, 0, 0, 0, .12], 2: [0, 0, 0, 0, 0, 0], 3: [.08, .06, .06, 0, 0, -.06]}
LEGEND = {
    35: (580, [1.10, 1.15, 1.00, 1.15, 1.00, 0.90], ['역린', '용의파동', DDANCE, PROTECT]),            # 금관오스 (교감)
    36: (590, [1.15, 1.00, 1.10, 1.25, 1.10, 0.90], ['드래곤크루', '사이코키네시스', CALM, LSCREEN]),  # 학사쟈 (교장)
    37: (520, [0.90, 0.90, 0.90, 0.90, 0.90, 1.60], ['속여때리기', '용의파동', AGIL, PROTECT]),        # 숨바꼬치 (비밀)
    38: (580, [1.00, 1.15, 0.90, 1.00, 0.90, 1.30], ['니트로차지', '용의파동', AGIL, MSUN]),           # 소디포 (아침)
    39: (580, [1.00, 0.85, 1.00, 1.30, 1.15, 0.90], ['드래곤크루', '문포스', CALM, LSCREEN]),          # 유리프 (점심)
    40: (580, [1.30, 1.00, 1.25, 0.90, 1.10, 0.70], ['역린', '악의파동', BULK, IRON]),                 # TTU (저녁)
    41: (600, [1.10, 1.10, 1.10, 1.10, 1.10, 0.90], [STONE, '10만볼트', NPLOT, REFLECT]),             # 과연기 (도감 50%)
    42: (640, [1.10, 1.20, 1.00, 1.20, 1.00, 1.10], ['역린', '용의파동', DDANCE, RECOVER]),            # 창문기 (도감 100%)
}
RARE = set(range(20, 25)) | {l for l, v in NEW.items() if v[2]}
LINES = [l for l in sorted(BTYPE) if l not in LEGEND] + sorted(LEGEND)


def mult(a, d):
    if a == '전설' or d == '전설':
        return 2 if a == d == '전설' else 1
    return CHART.get(a, {}).get(d, 1)


def cover_types(t):
    """나(t)에게 강한 타입들을 많이 ×2 로 찌르는 순서 (나 자신 제외). 라인마다 1·2위 중 하나를 쓴다."""
    threats = [a for a in SUBJ if mult(a, t) > 1]
    return sorted((c for c in SUBJ if c != t), key=lambda c: (-sum(mult(c, x) > 1 for x in threats), SUBJ.index(c)))


def cover_type(t):
    return cover_types(t)[0]


def stats(total, w, line):
    # 선생님(라인)마다 고유한 변화: 라인 번호로 고정한 난수로 6개 능력치를 각각 ±14% (단계가 달라도 같은 라인이면 같은 성향)
    rng = random.Random(line * 7919 + 13)
    w = [x * (1 + rng.uniform(-.14, .14)) for x in w]
    s = sum(w)
    v = [max(20, round(total * x / s)) for x in w]
    v[0] += total - sum(v)
    return v


def species_rows():
    out = []
    for line in LINES:
        if line in LEGEND:
            total, w, moves = LEGEND[line]
            out.append(((line - 1) * 3 + 1, stats(total, w, line), moves))
            continue
        t = BTYPE[line]
        cover = cover_types(t)[line % 2]
        status = STATUS_POOL[t][line % 3]
        defense = DEFENSE_POOL[t][(line // 3) % 3]
        for st in (1, 2, 3):
            w = [p + q for p, q in zip(PROFILE[t], STAGE_SHIFT[st])]
            v = stats(STAGE_TOTAL[st] + (15 if line in RARE else 0), w, line)
            phys = v[1] >= v[3]
            L = ATK[t]['phys' if phys else 'spec']          # 자속 기술 (약 → 강)
            O = ATK[t]['spec' if phys else 'phys']          # 다른 분류
            C = ATK[cover]['spec' if phys else 'phys']      # 커버 타입의 다른 분류
            n = len(L)
            i1 = (line % 2) if n >= 4 else 0
            i3 = n - 1 - (((line // 2) % 2) if n >= 4 else 0)
            i2 = max(min(i3 - 1, n - 2), i1 + 1) if n >= 3 else n - 1
            if st == 1:
                moves = [L[i1], [QUICK, TACKLE, O[0]][line % 3], [GROWL, TAILW, status][(line // 3) % 3],
                         PROTECT if line % 4 else defense]
            elif st == 2:
                moves = [L[i2], O[((line // 2) % 2) if len(O) > 2 else 0], status, defense]
            else:
                moves = [L[i3], C[-1 - ((line % 2) if len(C) >= 3 else 0)], status, defense]
            out.append(((line - 1) * 3 + st, v, moves))
    return out


# ── 기술 배우기 (0020): 레벨로 배우는 기술 + 기술머신으로 배울 수 있는 기술 (계열마다)
LV_STEPS = [7, 13, 19, 26, 33, 41, 49, 57, 66, 75, 85]


def kind_of(name):
    return next(m for m in M if m['name'] == name)


def learnset_rows():
    """(line, 기술 이름, 레벨) — 계열마다 11~13개. 약한 자속기 → 강한 자속기 순으로 레벨이 오르고, 상태기·커버 기술·보통 기술이 섞인다."""
    out = []
    for line in LINES:
        rng = random.Random(line * 7741 + 3)
        if line in LEGEND:
            pool = [m['name'] for m in M if m['type'] == '전설' and m['name'] not in SIGNATURE]
            pool += [m['name'] for m in M if m['kind'] == 'status' and m['type'] in ('보통', '전설')][:3]
            for i, n in enumerate(sorted(set(pool), key=lambda n: (kind_of(n)['power'], n))):
                out.append((line, n, LV_STEPS[min(i, len(LV_STEPS) - 1)] - 2 + rng.randint(0, 4)))
            continue
        t = BTYPE[line]
        _, v, _ = next(r for r in species_rows() if r[0] == (line - 1) * 3 + 3)
        phys = v[1] >= v[3]
        own = [m for m in M if m['type'] == t and m['kind'] == 'attack' and m['name'] not in SIGNATURE]
        main_cat = [m for m in own if (m['cat'] == 'physical') == phys]
        other = [m for m in own if (m['cat'] == 'physical') != phys]
        pick = sorted(rng.sample(main_cat, min(5, len(main_cat))) + rng.sample(other, min(2, len(other))), key=lambda m: (m['power'], m['name']))
        names = [m['name'] for m in pick]
        stat = [m['name'] for m in M if m['type'] == t and m['kind'] in ('status', 'defense')]
        names += rng.sample(stat, min(2, len(stat)))
        normal = [m['name'] for m in M if m['type'] == '보통' and m['name'] not in names]
        names += rng.sample(normal, 2)
        cov = cover_types(t)[line % 2]
        cv = sorted((m for m in M if m['type'] == cov and m['kind'] == 'attack' and (m['cat'] == 'physical') == phys and 70 <= m['power'] <= 100),
                    key=lambda m: m['name'])
        if cv:
            names.append(rng.choice(cv)['name'])
        seen = set()
        atk_i = 0
        for n in names:
            if n in seen:
                continue
            seen.add(n)
            m = kind_of(n)
            if m['kind'] == 'attack' and m['type'] == t:
                lv = LV_STEPS[min(atk_i * 11 // max(1, len(pick)), 10)] + rng.randint(-2, 2)
                atk_i += 1
            elif m['kind'] == 'attack':          # 커버 기술은 늦게
                lv = rng.randint(52, 70)
            else:
                lv = rng.randint(9, 48)
            out.append((line, n, max(2, lv)))
    return out


# 기술머신: 과목마다 강한 공격 2개 + 누구나 쓰는 기술. 특별 기술머신(레이드 보상) = 전설의 고유 기술 (누구나 배움)
TM_GENERAL = ['방어', '그림자분신', '칼춤', '나쁜음모', '고속이동', '명상', '잠자기', '리플렉터', '빛의장막', '스피드스타', '파괴광선', '기가임팩트',
              '이판사판태클', '전기자석파', '도깨비불', '맹독']


def tm_list():
    out = []
    for t in SUBJ:
        atk = sorted((m for m in M if m['type'] == t and m['kind'] == 'attack' and m['name'] not in SIGNATURE and 80 <= m['power'] <= 120
                      and (m['acc'] or 100) >= 85), key=lambda m: (-(m['power'] * (m['acc'] or 100)), m['name']))
        phys = [m for m in atk if m['cat'] == 'physical'][:1]
        spec = [m for m in atk if m['cat'] == 'special'][:1]
        out += [m['name'] for m in phys + spec]
    out += [n for n in TM_GENERAL if n in MOVE_ID]
    return list(dict.fromkeys(out))       # 겹치는 기술은 한 번만


def tm_compat(line, name):
    if line in LEGEND or name in SIGNATURE:
        return True
    m = kind_of(name)
    t = BTYPE[line]
    return m['type'] in ('보통', t) or m['type'] in cover_types(t)[:4]


# 가방 물건 (key, 이름, 주머니, 설명, 효과, 나오는 곳 가중치). 주머니: hold 지닌 물건 / med 회복약 (배틀 중) / tool 도구 / tm 기술머신
BOOST_ITEM = {'국어': '맞춤법 사전', '수학': '공학용 계산기', '영어': '영어 단어장', '물리': '용수철저울', '화학': '실험 비커', '생명': '현미경',
              '지구': '지구본', '지리': '나침반', '정치경제': '경제 신문', '윤리': '명언집', '역사': '역사 연표', '외국어': '회화 수첩', '정보': '노트북',
              '체육': '운동화', '음악': '마이크'}


def item_rows():
    I = []
    for i, (t, n) in enumerate(BOOST_ITEM.items()):
        I.append((f'boost{i + 1:02d}', n, 'hold', f'지니게 하면 {t} 기술의 위력이 1.2배가 된다.', {'boost': t}, {'place': 3, 'battle': 2}))
    I += [
        ('glasses', '집중 안경', 'hold', '지니게 하면 기술이 잘 맞는다 (명중률 1.1배).', {'acc': 110}, {'place': 3, 'battle': 2}),
        ('lucky', '행운 부적', 'hold', '지니게 하면 급소에 잘 맞는다.', {'crit': 1}, {'place': 2, 'battle': 2}),
        ('choco', '초코우유', 'hold', 'HP가 절반 이하가 되면 마셔서 최대 HP의 1/4을 회복한다. 배틀마다 한 번.', {'pinch_heal': 25}, {'place': 4, 'battle': 2}),
        ('cushion', '방석', 'hold', '턴이 끝날 때마다 최대 HP의 1/16을 회복한다.', {'leftovers': 16}, {'place': 2, 'battle': 2}),
        ('clock', '알람시계', 'hold', '가끔(20%) 먼저 움직일 수 있다.', {'quick': 20}, {'place': 2, 'battle': 2}),
        ('mask', '보건 마스크', 'hold', '독에 걸리지 않는다.', {'immune': 'psn'}, {'place': 2}),
        ('hotpack', '핫팩', 'hold', '얼지 않는다.', {'immune': 'frz'}, {'place': 2}),
        ('bandage', '반창고', 'med', '배틀 중에 쓰면 HP를 최대 HP의 30% 회복한다.', {'heal': 30}, {'place': 8, 'battle': 6, 'practice': 8, 'quiz': 3}),
        ('ointment', '보건실 연고', 'med', '배틀 중에 쓰면 HP를 최대 HP의 60% 회복한다.', {'heal': 60}, {'place': 4, 'battle': 5, 'practice': 4, 'quiz': 2}),
        ('iv', '링거', 'med', '배틀 중에 쓰면 HP와 상태 이상을 모두 회복한다.', {'heal': 100, 'cure': True}, {'place': 1, 'battle': 2, 'raid': 3}),
        ('mint', '박하사탕', 'med', '배틀 중에 쓰면 상태 이상과 혼란을 고친다.', {'cure': True}, {'place': 5, 'battle': 3, 'practice': 4, 'quiz': 2}),
        ('energy', '에너지 드링크', 'med', '배틀 중에 쓰면 모든 기술의 PP가 10씩 돌아온다.', {'pp': 10}, {'place': 3, 'battle': 3, 'practice': 2}),
        ('firstaid', '구급상자', 'med', '배틀 중에 쓰면 쓰러진 몬스터가 HP 절반으로 다시 일어난다.', {'revive': 50}, {'place': 1, 'battle': 2, 'raid': 2}),
        ('candy', '이상한사탕', 'tool', '몬스터 하나의 레벨이 1 오른다.', {'level': 1}, {'place': 1, 'battle': 2, 'quiz': 3, 'raid': 4}),
    ]
    for i, n in enumerate(tm_list()):
        m = kind_of(n)
        I.append((f'tm{i + 1:02d}', f'기술머신{i + 1:02d}', 'tm', m['desc'], {}, {'place': 1, 'quiz': 3, 'battle': 1}, n))
    for i, n in enumerate(SIGNATURE):
        m = kind_of(n)
        I.append((f'sp{i + 1:02d}', f'특별 기술머신{i + 1:02d}', 'tm', m['desc'] + ' (전설의 기술 — 누구나 배울 수 있다)', {}, {'raid': 1}, n))
    return [x if len(x) == 7 else x + (None,) for x in I]


def chart_rows():
    rows = [(a, d, m) for a, row in CHART.items() for d, m in row.items()]
    rows.append(('전설', '전설', 2))
    return rows


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    names = {m['name'] for m in M}
    assert len(names) == len(M), 'duplicate move name'
    rows = species_rows()
    seen = {}
    for sid, v, moves in rows:          # 능력치가 완전히 같은 몬스터가 없어야 한다
        key = tuple(v)
        assert key not in seen, f'species {sid} has the same stats as {seen[key]}'
        seen[key] = sid
    same_set = len(rows) - len({(tuple(sorted(m)), (sid - 1) % 3) for sid, v, m in rows})
    print(f'  same 4-move set at the same stage: {same_set} of {len(rows)} (stats always differ)')
    for sid, v, moves in rows:
        assert len(moves) == 4 and all(x in names for x in moves), (sid, moves)
        kinds = sorted(next(m['kind'] for m in M if m['name'] == x) for x in moves)
        assert kinds == ['attack', 'attack', 'defense', 'status'], (sid, moves, kinds)
    learn = learnset_rows()
    items = item_rows()
    tms = [(k, mvn) for k, _, pk, _, _, _, mvn in items if pk == 'tm']
    tm_rows = sorted({(line, MOVE_ID[mvn]) for line in LINES for _, mvn in tms if tm_compat(line, mvn)})
    ids = ', '.join(str(MOVE_ID[m['name']]) for m in M)
    # 기술 번호는 고정 (MOVE_ID) — 몬스터가 고른 기술·배운 기술(collection.moves/learned)이 번호로 저장되므로 다시 실행해도 안 바뀌어야 한다
    sql = ['-- GENERATED by tools/gen_battle_data.py — do not edit by hand. Run after seed.sql (and after migration 0020).',
           'begin;',
           'delete from public.species_moves; delete from public.learnset; delete from public.type_chart; delete from public.types;',
           'insert into public.types (name, sort) values ' + ', '.join(f'({q(t)}, {i})' for i, t in enumerate(TYPES)) + ';',
           'insert into public.type_chart (atk, def, mult) values ' + ', '.join(f'({q(a)}, {q(d)}, {m})' for a, d, m in chart_rows()) + ';',
           'update public.lines l set btype = v.t from (values ' + ', '.join(f'({l}, {q(t)})' for l, t in sorted(BTYPE.items())) + ') v(id, t) where l.id = v.id;',
           f'delete from public.moves where id not in ({ids});',
           'insert into public.moves (id, name, type, category, kind, power, accuracy, pp, priority, effect, description) values']
    sql.append(',\n'.join(f" ({MOVE_ID[m['name']]}, {q(m['name'])}, {q(m['type'])}, {q(m['cat'])}, {q(m['kind'])}, {m['power']}, "
                          f"{'null' if m['acc'] is None else m['acc']}, {m['pp']}, {m['prio']}, {q(json.dumps(m['effect'], ensure_ascii=False))}, {q(m['desc'])})"
                          for m in M))
    sql.append('on conflict (id) do update set name = excluded.name, type = excluded.type, category = excluded.category, kind = excluded.kind, '
               'power = excluded.power, accuracy = excluded.accuracy, pp = excluded.pp, priority = excluded.priority, effect = excluded.effect, '
               'description = excluded.description;')
    sql.append("select setval('public.moves_id_seq', (select max(id) from public.moves));")
    sql.append('update public.species s set hp = v.hp, atk = v.atk, def = v.def, spa = v.spa, spd = v.spd, spe = v.spe from (values')
    sql.append(',\n'.join(f' ({sid}, {", ".join(map(str, v))})' for sid, v, _ in rows))
    sql.append(') v(id, hp, atk, def, spa, spd, spe) where s.id = v.id;')
    sql.append('insert into public.species_moves (species_id, slot, move_id)')
    sql.append('select v.sid, v.slot, v.mid from (values')
    sql.append(',\n'.join(f' ({sid}, {k + 1}, {MOVE_ID[x]})' for sid, _, moves in rows for k, x in enumerate(moves)))
    sql.append(') v(sid, slot, mid) where exists (select 1 from public.species s where s.id = v.sid);')
    sql.append('insert into public.learnset (line_id, move_id, lv, how)')
    sql.append('select v.l, v.m, v.lv, v.how from (values')
    sql.append(',\n'.join([f" ({l}, {MOVE_ID[n]}, {lv}, 'level')" for l, n, lv in learn] + [f" ({l}, {m}, 0, 'tm')" for l, m in tm_rows]))
    sql.append(') v(l, m, lv, how) where exists (select 1 from public.lines x where x.id = v.l);')
    sql.append('insert into public.items (key, name, pocket, description, effect, drops, move_id, sort) values')
    sql.append(',\n'.join(f" ({q(k)}, {q(n)}, {q(pk)}, {q(d)}, {q(json.dumps(e, ensure_ascii=False))}, {q(json.dumps(dr))}, "
                          f"{MOVE_ID[mvn] if mvn else 'null'}, {i})" for i, (k, n, pk, d, e, dr, mvn) in enumerate(items)))
    sql.append('on conflict (key) do update set name = excluded.name, pocket = excluded.pocket, description = excluded.description, '
               'effect = excluded.effect, drops = excluded.drops, move_id = excluded.move_id, sort = excluded.sort;')
    sql.append('delete from public.items where key not in (' + ', '.join(q(x[0]) for x in items) + ');')
    sql.append('commit;')
    out = os.path.join(ROOT, 'supabase', 'seed_battle.sql')
    open(out, 'w', encoding='utf-8', newline='\n').write('\n'.join(sql) + '\n')
    zero = [(a, d) for a, d, m in chart_rows() if m == 0]
    print(f'{out}: {len(M)} moves, {len(rows)} species, {len(chart_rows())} chart cells, x0: {zero}')
    print(f'  learnset {len(learn)} level rows ({len(learn) / len(LINES):.1f}/line) + {len(tm_rows)} TM rows; items {len(items)} ({len(tms)} TMs)')
    for t in SUBJ:
        print(f'  {t:5s} 공격 ×2 {sum(mult(t, d) > 1 for d in SUBJ)} · ×.5 {sum(0 < mult(t, d) < 1 for d in SUBJ)} · ×0 {sum(mult(t, d) == 0 for d in SUBJ)}'
              f' | 방어 약점 {sum(mult(a, t) > 1 for a in SUBJ)} · 반감 {sum(0 < mult(a, t) < 1 for a in SUBJ)} · 무효 {sum(mult(a, t) == 0 for a in SUBJ)} | 커버 {cover_type(t)}')


if __name__ == '__main__':
    main()
