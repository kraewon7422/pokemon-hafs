-- Demo / staging data. PLACEHOLDER monsters only (no real teacher names while the repo is public).
-- Replace with real content via the admin page (or a private seed) before the festival.

insert into public.lines (id, teacher, subject, rarity) values
  (1, '물리 선생님', '물리', 'common'), (2, '화학 선생님', '화학', 'common'),
  (3, '생명 선생님', '생명', 'common'), (4, '지구 선생님', '지구', 'common'),
  (5, '수학 선생님', '수학', 'common'), (6, '국어 선생님', '국어', 'common'),
  (7, '영어 선생님', '영어', 'common'), (8, '역사 선생님', '역사', 'common'),
  (9, '사회 선생님', '사회', 'common'), (10, '체육 선생님', '체육', 'common'),
  (11, '음악 선생님', '음악', 'common'), (12, '미술 선생님', '미술', 'common'),
  (13, '정보 선생님', '정보', 'rare'), (14, '일본어 선생님', '일본어', 'rare'),
  (15, '중국어 선생님', '중국어', 'rare');
-- legendaries: 1 stage only (max_stage = 1)
insert into public.lines (id, teacher, subject, rarity, max_stage) values
  (16, '교장 선생님', '전설', 'legendary', 1), (17, '교감 선생님', '전설', 'legendary', 1);

insert into public.species (id, line_id, stage, name, category, flavor, height, weight)
select (l - 1) * 3 + s, l, s, n[s], c, f, (40 + l * 3 + s * 30) || 'cm', (5 + l + s * 12) || 'kg'
from (values
  (1,  array['뉴턴몽','가속몽','상대몽'],     '힘 몬스터',   'F=ma를 외치며 교실 문을 연다. 사과가 떨어지면 반드시 돌아본다.'),
  (2,  array['몰몰','몰리온','몰리돈'],       '반응 몬스터', '주기율표를 노래로 부른다. 실험실 근처에서 자주 보인다.'),
  (3,  array['세포링','세포론','세포돈'],     '생명 몬스터', '현미경 너머의 세상을 사랑한다. 분열할수록 강해진다.'),
  (4,  array['판구리','판구라','판게아돈'],   '대지 몬스터', '느리지만 언젠가 대륙을 옮긴다고 한다.'),
  (5,  array['미분이','적분이','급수왕'],     '계산 몬스터', '칠판 가득 수식을 쓰고 "쉽지?"라고 묻는다.'),
  (6,  array['문법이','문장이','문학왕'],     '언어 몬스터', '맞춤법이 틀리면 어디선가 나타난다.'),
  (7,  array['알파비','알파벳','알파킹'],     '회화 몬스터', 'Hello라고 말을 걸면 세 배로 대답한다.'),
  (8,  array['연표몽','사관몽','역사왕'],     '기록 몬스터', '모든 사건의 연도를 기억한다.'),
  (9,  array['시민이','정책이','헌법왕'],     '토론 몬스터', '토론이 시작되면 눈이 반짝인다.'),
  (10, array['줄넘이','허들이','올림픽왕'],   '운동 몬스터', '호루라기 소리에 반응해 달려온다.'),
  (11, array['도레미','화음이','교향곡왕'],   '선율 몬스터', '복도에서 콧노래가 들리면 근처에 있다.'),
  (12, array['크레용','물감이','명화왕'],     '예술 몬스터', '하얀 벽을 보면 참지 못한다.'),
  (13, array['비트몽','바이트몽','알고리즘왕'], '코드 몬스터', '버그를 먹고 자란다. 아주 드물게 발견된다.'),
  (14, array['히라몽','카타몽','칸지왕'],     '문자 몬스터', '인사를 정중하게 하면 모습을 드러낸다.'),
  (15, array['성조몽','한자몽','만리왕'],     '성조 몬스터', '네 가지 목소리로 운다.'),
  (16, array['교장몽'],                     '전설 몬스터', '축제의 정해진 시간에만 나타난다는 전설의 몬스터.'),
  (17, array['교감몽'],                     '전설 몬스터', '학교의 모든 일을 알고 있다는 또 하나의 전설. 교장몽과 함께 나타날 때가 있다.')
) v(l, n, c, f), generate_series(1, 3) s
where s <= (select max_stage from public.lines where id = v.l);

-- 3 placeholder quizzes per line (answer = index 0 in storage; display order is shuffled per student)
with q as (
  insert into public.quizzes (line_id, question, choices)
  select l, '[샘플] ' || sub || ' 선생님 퀴즈 ' || k || '번 — 정답은 "맞아요 ' || k || '"',
         jsonb_build_array('맞아요 ' || k, '아니에요 A', '아니에요 B', '아니에요 C')
  from (select id l, subject sub from public.lines) x, generate_series(1, 3) k
  returning id
)
insert into public.quiz_answers (quiz_id, answer) select id, 0 from q;

-- 24 campus QR points + 1 rotating legendary QR (big screen)
-- positions match web/img/map.png (tools/draw_map.py)
insert into public.qr_points (id, name, hint, map_x, map_y) values
 ('A01','P홀 1층 로비','교장실이 있는 층을 찾아보세요',0.20,0.60),
 ('A02','P홀 4층 복도','엘리베이터가 있는 유일한 건물',0.17,0.50),
 ('A03','D홀 1층 체육관','강당 입구 근처',0.40,0.44),
 ('A04','D홀 3층 물리실','실험실이 모인 층',0.50,0.42),
 ('A05','D홀 5층 자습실','가장 높은 층의 디자 자습실',0.58,0.40),
 ('A06','C홀 1층 시청각실','150석 시청각실 앞',0.73,0.62),
 ('A07','C홀 4층 보건실 앞','아프면 가는 곳… 근처에 숨은 희귀 몬스터?',0.70,0.50),
 ('A08','C홀 2층 1학년부','1학년 교실 복도',0.75,0.55),
 ('A09','World Plaza 분수','세 건물이 둘러싼 광장 한가운데',0.46,0.58),
 ('A10','V홀 1층 식당','배고플 때 가는 곳',0.40,0.31),
 ('A11','V홀 2층 도서관','조용히… 책 사이에서',0.55,0.30),
 ('A12','LUX홀 매점','CU 근처',0.86,0.41),
 ('A13','LUX홀 밴드 연습실','음악 소리가 들리면',0.88,0.37),
 ('A14','기숙사 A동 1층','기숙사 본부 앞',0.18,0.14),
 ('A15','기숙사 B동 앞','농구공 소리 근처',0.56,0.16),
 ('A16','농구장','슛!',0.81,0.10),
 ('A17','운동장 스탠드','운동장 가장자리',0.30,0.80),
 ('A18','운동장 골대','축구 골대 근처',0.70,0.88),
 ('A19','생태연못','정문 들어오자마자',0.86,0.57),
 ('A20','정문','학교에 들어오는 첫걸음',0.93,0.68),
 ('A21','잔디광장','P홀 뒤 잔디밭',0.06,0.62),
 ('A22','야외학습장','D·C홀 구름다리 뒤 원형 극장',0.77,0.33),
 ('A23','야외공연장','원형 계단 무대',0.13,0.72),
 ('A24','P–C 구름다리 아래','광장을 가로지르는 3층 다리',0.46,0.66);
insert into public.qr_points (id, name, hint, kind, visible_on_map) values ('L01', '전설의 무대', '대형 화면을 지켜보세요', 'rotating', false);

select public._new_secret(id) from public.qr_points;

insert into public.qr_rewards (qr_id, line_id, weight)
select 'A' || lpad(i::text, 2, '0'), l, w
from generate_series(1, 24) i,
     lateral (values (((i - 1) % 12) + 1, 40), ((i % 12) + 1, 35), (((i + 5) % 12) + 1, 25)) v(l, w)
on conflict do nothing;
insert into public.qr_rewards (qr_id, line_id, weight) values
  ('A07', 13, 10), ('A15', 14, 10), ('A22', 15, 10), ('L01', 16, 1), ('L01', 17, 1);
-- rare spots and the legendary screen: once per student per day
update public.qr_points set daily_cap = 1 where id in ('A07', 'A15', 'A22', 'L01');
