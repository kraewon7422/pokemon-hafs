"""'몬스터' → '포켓몬' 바꾸기 (조사까지): 몬스터가 → 포켓몬이, 몬스터를 → 포켓몬을, 몬스터로 → 포켓몬으로 …
그대로 두는 것: '몬스터볼' (포켓볼의 공식 한국어 이름), 'HAFS 몬스터' (앱 이름).
사용: python tools/ko_rename.py <파일…>   (바뀐 줄 수를 출력)
"""
import re
import sys

# 받침 없는 '몬스터' 뒤 조사 → 받침 있는 '포켓몬' 뒤 조사 (긴 것부터)
JOSA = [('예요', '이에요'), ('였어요', '이었어요'), ('였다', '이었다'), ('라고', '이라고'), ('라는', '이라는'), ('라면', '이라면'), ('랑', '이랑'),
        ('가', '이'), ('를', '을'), ('는', '은'), ('와', '과'), ('로', '으로'), ('야', '이야'), ('여', '이여'), ('다', '이다'), ('지만', '이지만'),
        ('라도', '이라도'), ('든', '이든'), ('나', '이나'), ('면', '이면')]
PAT = re.compile(r'(?<!HAFS )(?<!HAFS)몬스터(?!볼)(' + '|'.join(re.escape(a) for a, _ in sorted(JOSA, key=lambda x: -len(x[0]))) + r')?')
MAP = dict(JOSA)


def ko_pokemon(s):
    return PAT.sub(lambda m: '포켓몬' + (MAP[m.group(1)] if m.group(1) else ''), s)


if __name__ == '__main__':
    for f in sys.argv[1:]:
        s = open(f, encoding='utf-8').read()
        t = ko_pokemon(s)
        if t != s:
            n = sum(1 for a, b in zip(s.split('\n'), t.split('\n')) if a != b)
            open(f, 'w', encoding='utf-8', newline='\n').write(t)
            print(f'{f}: {n} lines')
