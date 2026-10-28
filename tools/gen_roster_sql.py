"""라인 43~76 (명단에 맞춰 늘린 계열) SQL → stdout.  seed.sql 의 '늘린 계열' 블록과 테스트 서버 적용에 쓴다.

사용법: python tools/gen_roster_sql.py > /tmp/roster.sql
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from roster import NEW  # noqa: E402

# 라인 → 나오는 장소 QR (장소 분위기에 맞춰, 장소마다 1~2개씩)
QR = {43: 'A11', 44: 'A01', 45: 'A06', 46: 'A13', 47: 'A08', 48: 'A20', 49: 'A05', 50: 'A08', 51: 'A09', 52: 'A12',
      53: 'A05', 54: 'A21', 55: 'A23', 56: 'A06', 57: 'A10', 58: 'A11', 59: 'A22', 60: 'A09', 61: 'A02', 62: 'A14',
      63: 'A04', 64: 'A24', 65: 'A17', 66: 'A04', 67: 'A07', 68: 'A19', 69: 'A15', 70: 'A07', 71: 'A24', 72: 'A16',
      73: 'A03', 74: 'A02', 75: 'A13', 76: 'A18'}
assert sorted(QR) == sorted(NEW)


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def sql():
    out = ['-- 명단에 맞춰 늘린 계열 43~76 (tools/roster.py → tools/gen_roster_sql.py). 실제 선생님 이름 없음.']
    out.append('insert into public.lines (id, teacher, subject, rarity, max_stage) values')
    out.append(',\n'.join(f" ({l}, {q(t)}, {q(subj)}, {q('rare' if rare else 'common')}, 3)"
                          for l, (t, subj, rare, *_rest) in sorted(NEW.items())) + '\non conflict (id) do nothing;')
    out.append('insert into public.species (id, line_id, stage, name, category, flavor, height, weight) values')
    rows = []
    for l, (t, subj, rare, names, cat, flavor) in sorted(NEW.items()):
        for st, nm in enumerate(names, 1):
            rows.append(f" ({(l - 1) * 3 + st}, {l}, {st}, {q(nm)}, {q(cat)}, {q(flavor)}, '{30 + st * 28 + l % 7 * 3}cm', '{4 + st * 11 + l % 5 * 2}kg')")
    out.append(',\n'.join(rows) + '\non conflict (id) do nothing;')
    out.append('insert into public.qr_rewards (qr_id, line_id, weight) values ' +
               ', '.join(f"({q(QR[l])}, {l}, {20 if NEW[l][2] else 25})" for l in sorted(NEW)) + '\non conflict do nothing;')
    return '\n'.join(out)


def quizzes():
    return """-- 샘플 퀴즈 3개씩 (실제 축제 전에 운영자 페이지에서 바꾸기)
with q as (
  insert into public.quizzes (line_id, question, choices)
  select l.id, '[샘플] ' || l.teacher || ' 퀴즈 ' || k || '번 — 정답은 "맞아요 ' || k || '"',
         jsonb_build_array('맞아요 ' || k, '아니에요 A', '아니에요 B', '아니에요 C')
  from public.lines l, generate_series(1, 3) k
  where l.id between 43 and 76 and not exists (select 1 from public.quizzes z where z.line_id = l.id)
  returning id
)
insert into public.quiz_answers (quiz_id, answer) select id, 0 from q;"""


if __name__ == '__main__':
    print(sql())
    if '--quizzes' in sys.argv:
        print(quizzes())
