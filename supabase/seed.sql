-- Demo / staging data. PLACEHOLDER monsters only (no real teacher names while the repo is public).
-- Roster mirrors HAFS grade-1 staffing (국어 4, 수학 4, 영어 3, 과학 4, 사회 4, 외국어 5, 정보·AI 3, 한국사 3, 음악 1, 체육 3)
-- + 2 legendaries (교장·교감, 1 stage). 34×3 + 2 = 104 dex entries. Run AFTER all migrations.
-- Replace with real content via the admin page before the festival. tools/build_atlas.py draws the same roster.

insert into public.lines (id, teacher, subject, rarity, max_stage)
select id, teacher, subject, rarity, case when rarity = 'legendary' then 1 else 3 end
from (values
  (1, '국어 선생님 1', '국어', 'common'), (2, '국어 선생님 2', '국어', 'common'), (3, '국어 선생님 3', '국어', 'common'), (4, '국어 선생님 4', '국어', 'common'),
  (5, '수학 선생님 1', '수학', 'common'), (6, '수학 선생님 2', '수학', 'common'), (7, '수학 선생님 3', '수학', 'common'), (8, '수학 선생님 4', '수학', 'common'),
  (9, '영어 선생님 1', '영어', 'common'), (10, '영어 선생님 2', '영어', 'common'), (11, '영어 선생님 3', '영어', 'common'),
  (12, '물리 선생님', '과학', 'common'), (13, '화학 선생님', '과학', 'common'), (14, '생명과학 선생님', '과학', 'common'), (15, '지구과학 선생님', '과학', 'common'),
  (16, '사회 선생님 1', '사회', 'common'), (17, '사회 선생님 2', '사회', 'common'), (18, '사회 선생님 3', '사회', 'common'), (19, '사회 선생님 4', '사회', 'common'),
  (20, '중국어 선생님', '외국어', 'rare'), (21, '일본어 선생님', '외국어', 'rare'), (22, '독일어 선생님', '외국어', 'rare'),
  (23, '프랑스어 선생님', '외국어', 'rare'), (24, '스페인어 선생님', '외국어', 'rare'),
  (25, '정보 선생님 1', '정보', 'common'), (26, '정보 선생님 2', '정보', 'common'), (27, 'AI 선생님', '정보', 'common'),
  (28, '한국사 선생님 1', '한국사', 'common'), (29, '한국사 선생님 2', '한국사', 'common'), (30, '한국사 선생님 3', '한국사', 'common'),
  (31, '음악 선생님', '음악', 'common'),
  (32, '체육 선생님 1', '체육', 'common'), (33, '체육 선생님 2', '체육', 'common'), (34, '체육 선생님 3', '체육', 'common'),
  (35, '교감 선생님', '전설', 'legendary'), (36, '교장 선생님', '전설', 'legendary')   -- 36 학사쟈 = 교장, 35 금관오스 = 교감
) v(id, teacher, subject, rarity);
-- 이스터에그: 비밀 몬스터 (지도에 없는 비밀 QR S01 에서만, 도감 완성 조건에서 빠짐)
insert into public.lines (id, teacher, subject, rarity, max_stage, secret) values (37, '비밀 몬스터', '비밀', 'legendary', 1, true);

-- species names: each line has its own 3 names (legendaries: 1 stage)
insert into public.species (id, line_id, stage, name, category, flavor, height, weight)
select (v.l - 1) * 3 + s, v.l, s,
       (v.m)[s],   -- 계열마다 다른 3단계 이름
       v.cat, v.f, (30 + s * 28 + v.l % 7 * 3) || 'cm', (4 + s * 11 + v.l % 5 * 2) || 'kg'
from (values
  (1, array['쉼표링', '따옴부리', '문장곤'], '문장 몬스터', '쉼표 하나도 허투루 쓰지 않는다. 문장이 길어지면 숨이 차오른다.'),
  (2, array['죽순토', '초장군', '시조라스'], '시조 몬스터', '삼장 육구로만 말한다. 대나무 숲에서 자주 보인다.'),
  (3, array['띄어삐', '빨간펜다', '맞춤렉스'], '교정 몬스터', '빨간 펜을 꼬리에 달고 다닌다. 띄어쓰기가 틀리면 나타난다.'),
  (4, array['두루링', '옛두루미', '고전티오스'], '고전 몬스터', '오래된 두루마리를 품고 있다. 읽을수록 강해진다.'),
  (5, array['기울콩', '접선버드', '델타가르'], '변화 몬스터', '기울기가 바뀌는 순간을 절대 놓치지 않는다.'),
  (6, array['조각토', '넓적돈', '인테그라스'], '넓이 몬스터', '조각을 모으고 또 모아 거대한 몸을 만든다.'),
  (7, array['데굴이', '굴림보', '확률로스'], '주사위 몬스터', '다음에 무엇을 할지 아무도 모른다. 본인도 모른다.'),
  (8, array['꼭지삐', '컴퍼스크', '다면드론'], '도형 몬스터', '컴퍼스 하나로 완벽한 원을 그린다.'),
  (9, array['에비씨', '스펠블록', '워드나이트'], '알파벳 몬스터', '블록을 쌓아 단어를 만들며 논다.'),
  (10, array['페이지삐', '속독수리', '리딩가드'], '독해 몬스터', '안경을 고쳐 쓰며 지문을 한 번에 읽어 낸다.'),
  (11, array['마이콩', '발표스타', '스피커로스'], '발표 몬스터', '마이크만 쥐어 주면 멈추지 않는다.'),
  (12, array['사과톡', '가속돈', '뉴트로스'], '힘 몬스터', 'F=ma를 외치며 교실 문을 연다. 사과가 떨어지면 반드시 돌아본다.'),
  (13, array['몰랑이', '비커부글', '케미라곤'], '반응 몬스터', '주기율표를 노래로 부른다. 실험실 근처에서 자주 보인다.'),
  (14, array['세포리', '분열몬', '미토콘드라'], '생명 몬스터', '현미경 너머의 세상을 사랑한다. 분열할수록 강해진다.'),
  (15, array['돌멩치', '지각돈', '판게오스'], '대지 몬스터', '느리지만 언젠가 대륙을 옮긴다고 한다.'),
  (16, array['왈가리', '반론스', '아고라스'], '토론 몬스터', '토론이 시작되면 눈이 반짝인다.'),
  (17, array['짤랑이', '시장돈', '이코노킹'], '시장 몬스터', '수요와 공급의 균형을 맞추느라 늘 바쁘다.'),
  (18, array['빙글침', '위도라', '자오선곤'], '지도 몬스터', '나침반 꼬리로 언제나 북쪽을 가리킨다.'),
  (19, array['저울뽀', '판결봉', '저스티오스'], '정의 몬스터', '저울을 들고 공정하지 않은 일을 찾아다닌다.'),
  (20, array['니하링', '사성룡', '만리곤'], '성조 몬스터', '네 가지 목소리로 운다. 아주 드물게 발견된다.'),
  (21, array['히라냥', '카나후다', '하이쿠스'], '문자 몬스터', '인사를 정중하게 하면 모습을 드러낸다.'),
  (22, array['움라리', '구텐베어', '카이젤스'], '성채 몬스터', '움라우트 두 점을 머리에 달고 다닌다.'),
  (23, array['바게티', '베레뮤', '봉쥬르노'], '예술 몬스터', '베레모를 쓰고 바게트를 지팡이처럼 짚는다.'),
  (24, array['올레콩', '플라멩고', '솔라리오스'], '태양 몬스터', '기타 소리에 맞춰 춤을 춘다.'),
  (25, array['비트링', '바이토스', '기가코드'], '코드 몬스터', '0과 1만 먹고 산다. 버그를 보면 도망간다.'),
  (26, array['순서토', '루프로', '알고리드'], '순서도 몬스터', '모든 일을 단계별로 나눠서 처리한다.'),
  (27, array['뉴로삐', '딥러너', '싱귤라'], '학습 몬스터', '볼 때마다 조금씩 더 똑똑해진다.'),
  (28, array['연표미', '연대기러기', '크로노돈'], '기록 몬스터', '모든 사건의 연도를 기억한다.'),
  (29, array['먹뭉치', '붓도사', '실록가르'], '실록 몬스터', '붓을 들고 보고 들은 것을 빠짐없이 적는다.'),
  (30, array['갓동이', '세자르', '용포라곤'], '왕실 몬스터', '갓을 쓰고 위엄 있게 걷는다.'),
  (31, array['흥얼이', '화음새', '심포니오'], '선율 몬스터', '복도에서 콧노래가 들리면 근처에 있다.'),
  (32, array['출발토', '질주마', '스프린토스'], '육상 몬스터', '장애물을 보면 넘지 않고는 못 배긴다.'),
  (33, array['깡총이', '쌩쌩줄', '회오리곤'], '줄넘기 몬스터', '호루라기 소리에 반응해 달려온다.'),
  (34, array['슈팅콩', '드리블로', '골든킥스'], '구기 몬스터', '공만 보면 골대로 차 넣는다.'),
  (35, array['금관오스'], '전설 몬스터', '금빛 왕관과 홀을 든 또 하나의 전설. 학사쟈와 함께 나타날 때가 있다.'),
  (36, array['학사쟈'], '전설 몬스터', '학사모와 은테 안경을 쓴 학교 최고의 전설. 축제의 정해진 시간에만 나타난다.')
) v(l, m, cat, f), generate_series(1, 3) s
where s <= (select max_stage from public.lines where id = v.l);
insert into public.species (id, line_id, stage, name, category, flavor, height, weight) values
 (109, 37, 1, '숨바꼬치', '비밀 몬스터', '학교 어딘가 지도에 없는 곳에 숨어 산다. 찾아낸 사람만 이 몬스터를 알 수 있다.', '??cm', '??kg');

-- 3 placeholder quizzes per line (real festival: 8+ per teacher — a student never gets the same question twice)
with q as (
  insert into public.quizzes (line_id, question, choices)
  select l.id, '[샘플] ' || l.teacher || ' 퀴즈 ' || k || '번 — 정답은 "맞아요 ' || k || '"',
         jsonb_build_array('맞아요 ' || k, '아니에요 A', '아니에요 B', '아니에요 C')
  from public.lines l, generate_series(1, 3) k
  returning id
)
insert into public.quiz_answers (quiz_id, answer) select id, 0 from q;

-- 24 campus QR points (positions traced from the aerial photo via tools/draw_map.py, clear of labels) + 2 rotating legendary QRs (big screen)
insert into public.qr_points (id, name, hint, map_x, map_y, daily_cap) values
 ('A01','P홀 1층 로비','교장실이 있는 층을 찾아보세요',0.572,0.489,null),
 ('A02','P홀 4층 복도','엘리베이터가 있는 유일한 건물',0.572,0.538,1),
 ('A03','D홀 1층 체육관','강당 입구 근처',0.676,0.33,null),
 ('A04','D홀 3층 물리실','실험실이 모인 층',0.624,0.379,null),
 ('A05','D홀 5층 자습실','가장 높은 층의 디자 자습실',0.764,0.374,null),
 ('A06','C홀 1층 시청각실','150석 시청각실 앞',0.795,0.538,null),
 ('A07','C홀 4층 보건실 앞','아프면 가는 곳… 근처에 숨은 희귀 몬스터?',0.79,0.483,1),
 ('A08','C홀 2층 1학년부','1학년 교실 복도',0.785,0.422,null),
 ('A09','월드플라자 계단','세 건물이 둘러싼 광장의 계단',0.676,0.471,null),
 ('A10','V홀 1층 식당','배고플 때 가는 곳',0.39,0.235,null),
 ('A11','V홀 2층 도서관','조용히… 책 사이에서',0.52,0.278,1),
 ('A12','LUX홀 매점','CU 근처',0.541,0.367,null),
 ('A13','LUX홀 밴드 연습실','음악 소리가 들리면',0.457,0.373,null),
 ('A14','기숙사 A동 1층','기숙사 본부 앞',0.088,0.183,null),
 ('A15','기숙사 B동 앞','A동과 마주 보는 건물',0.255,0.153,1),
 ('A16','농구장','슛!',0.296,0.263,null),
 ('A17','운동장 스탠드','운동장 가장자리',0.658,0.823,null),
 ('A18','운동장 골대','축구 골대 근처',0.79,0.722,null),
 ('A19','생태연못','내리막길 옆 연못',0.4,0.398,1),
 ('A20','정문','학교에 들어오는 첫걸음',0.234,0.477,null),
 ('A21','잔디 둔덕','월드플라자 아래 반원 잔디',0.634,0.59,null),
 ('A22','야외극장','C·D홀 사이 1층 통로를 지나면',0.904,0.367,1),
 ('A23','지하주차장 입구','정문 앞에서 왼쪽',0.489,0.52,null),
 ('A24','붉은 벽돌 보행로','정문에서 본관까지 이어진 길',0.395,0.44,null);
-- legendary QRs start OFF: an admin puts them on the TV (현황판 → 전설 출현)
insert into public.qr_points (id, name, hint, kind, visible_on_map, daily_cap, active) values
 ('L01', '전설의 무대 Ⅰ', '대형 화면을 지켜보세요', 'rotating', false, 1, false),
 ('L02', '전설의 무대 Ⅱ', '대형 화면을 지켜보세요', 'rotating', false, 1, false);
-- 이스터에그: 지도에 안 나오는 비밀 QR (하루 1번). 운영자 페이지에서 인쇄해 학교 어딘가에 숨기기
insert into public.qr_points (id, name, hint, kind, visible_on_map, daily_cap) values ('S01', '비밀의 장소', '', 'static', false, 1);

select public._new_secret(id) from public.qr_points;

-- reward pools: each QR draws from 4 teachers that fit the place; rare (외국어) lines weight 20, at 1×/day spots
insert into public.qr_rewards (qr_id, line_id, weight)
select v.qr, u.line, case when l.rarity = 'rare' then 20 else 30 - (u.o::int - 1) * 3 end
from (values
 ('A01', array[16,17,1,28]), ('A02', array[18,19,2,20]), ('A03', array[32,33,34,31]),
 ('A04', array[12,13,14,15]), ('A05', array[5,6,9,1]), ('A06', array[10,11,3,29]),
 ('A07', array[14,7,8,21]), ('A08', array[5,6,7,8]), ('A09', array[9,16,25,30]),
 ('A10', array[2,17,26,33]), ('A11', array[4,10,28,22]), ('A12', array[27,18,11,32]),
 ('A13', array[31,24,3,26]), ('A14', array[1,12,19,29]), ('A15', array[13,9,34,23]),
 ('A16', array[34,32,25,15]), ('A17', array[33,30,6,17]), ('A18', array[32,34,7,27]),
 ('A19', array[14,15,4,24]), ('A20', array[16,28,2,10]), ('A21', array[18,31,8,13]),
 ('A22', array[11,29,20,23]), ('A23', array[25,26,27,19]), ('A24', array[3,12,30,21])
) v(qr, lines), unnest(v.lines) with ordinality as u(line, o)
join public.lines l on l.id = u.line;
insert into public.qr_rewards (qr_id, line_id, weight) values ('L01', 35, 1), ('L02', 36, 1), ('S01', 37, 1);
