-- 0050b: 전설 얻기 난이도 맞추기 (data only — 함수 · 표는 그대로, 권한 블록 없음)
--  축제 1~2일 · 학생마다 '학교 탭 50%' 를 채워야 사파리존이 열린다는 전제에서 조건 숫자를 다시 맞춤:
--    쉬움 (첫날 열심히 하는 학생) · 보통 (대부분 — 꾸준히 하는 학생) · 어려움 (몇 마리만 — 끝까지 하는 학생). 사실상 불가능한 것은 없게.
--  셈의 바탕 (스테이징 설정 · 야생 무리에서 잰 값):
--    · 사파리존: 만남 0.12/걸음 (8걸음 뒤부터) · 사파리볼 20개 / 30분 → 볼이 끝나는 쪽이 먼저, 30분에 약 7마리 (한 시간 ≈ 14마리)
--    · 구역마다 그 타입이 나오는 비율 (1단계 타입 · 희귀도 무게): 해변 물 86% · 사막 바위 53% 땅 47% · 설원 페어리 57% 얼음 41% ·
--      용암 불꽃 64% 강철 33% · 발전소 고스트 57% 전기 43% · 풀숲 풀 18% 벌레 19% 비행 15% 에스퍼 11% · 동굴 격투 16% · 용의 굴 드래곤 100%
--      (type_catch 는 QR · 부스에서 잡은 포켓몬도 셈 → 실제로는 조금 더 빠름)
--    · 배틀 승리 (battle_wins) = 다른 상대에게 이긴 보상 배틀만, 하루 battle_daily_max (5) 까지 → 10승은 이틀을 꽉 채워야 함
--    · 전설 잡기 자체: 단계 3 (기본 0.35) · HAFS 볼 10개 · 하루 3번 → 한 번 만나면 거의 잡힘 (그대로 둠: legend_balls 10, legend_daily_tries 3)
--  바꾸는 것 = settings.legend_quests 의 조건만 (dex 순서 · reward 그대로). 이미 채운 퀘스트 (legend_quest_done) 는 그대로 채운 것.
--  운영자 [전설·소포] 의 '전설 퀘스트 조건' 에서 숫자를 다시 바꿀 수 있음.

update public.settings s set value = (
  select jsonb_agg(case when o.spec is null then x
                        else jsonb_build_object('dex', x -> 'dex', 'reward', x -> 'reward') || o.spec end order by i)
    from jsonb_array_elements(s.value) with ordinality a(x, i)
    left join (values
      -- 0038 퀘스트 전설 (특별 티켓)
      (480, '{"kind": "quiz_streak", "n": 8}'::jsonb),                  -- 유크시   퀴즈 연속 10 → 8 (보통)
      (481, '{"kind": "battle_wins", "n": 6}'),                         -- 엠라이트 배틀 10승 → 6 (하루 5승 제한 → 이틀째 1승, 보통)
      -- 0038 사파리 전설
      (379, '{"kind": "type_catch", "types": ["강철"], "n": 6}'),       -- 레지스틸 강철 8 → 6 (용암 ≈ 18마리)
      (249, '{"kind": "type_catch", "types": ["물"], "n": 15}'),        -- 루기아   물 20 → 15 (해변 ≈ 17마리)
      (250, '{"kind": "type_catch", "types": ["불꽃", "비행"], "n": 12}'), -- 칠색조 불꽃·비행 20 → 12 (용암 ≈ 17마리)
      (383, '{"kind": "type_catch", "types": ["땅"], "n": 10}'),        -- 그란돈   땅 15 → 10 (사막 ≈ 21마리)
      -- 0050 사파리 전설
      (380, '{"kind": "zone_catch", "zone": "beach", "n": 5}'),         -- 라티아스 에스퍼 6 (풀숲 ≈ 55마리) → 해변에서 5마리 (쉬움)
      (489, '{"kind": "type_catch", "types": ["물"], "n": 6}'),         -- 피오네   물 10 → 6 (해변 ≈ 7마리, 쉬움)
      (488, '{"kind": "type_catch", "types": ["페어리"], "n": 5}'),     -- 크레세리아 페어리 6 → 5 (설원 ≈ 9마리)
      (785, '{"kind": "type_catch", "types": ["전기"], "n": 5}'),       -- 카푸꼬꼬꼭 전기 6 → 5 (발전소 ≈ 12마리)
      (787, '{"kind": "type_catch", "types": ["풀"], "n": 4}'),         -- 카푸브루루 풀 8 (풀숲 ≈ 44마리) → 4
      (788, '{"kind": "safari_catches", "n": 20}'),                     -- 카푸느지느 사파리존 25 → 20
      (638, '{"kind": "type_catch", "types": ["강철"], "n": 4}'),       -- 코바르온 강철 5 → 4 (용암 ≈ 12마리)
      (640, '{"kind": "type_catch", "types": ["격투"], "n": 3}'),       -- 비리디온 격투 5 (동굴 ≈ 31마리) → 3
      (492, '{"kind": "type_catch", "types": ["풀", "벌레"], "n": 8}'), -- 쉐이미   풀·벌레 15 (풀숲 ≈ 40마리) → 8
      (641, '{"kind": "type_catch", "types": ["비행"], "n": 4}'),       -- 토네로스 비행 10 (≈ 65마리) → 4
      (642, '{"kind": "type_catch", "types": ["전기"], "n": 6}'),       -- 볼트로스 전기 10 → 6 (발전소 ≈ 14마리)
      (644, '{"kind": "zone_catch", "zone": "dragon", "n": 4}'),        -- 제크로무 용의 굴 5 → 4
      (385, '{"kind": "quiz_streak", "n": 5}'),                         -- 지라치   퀴즈 연속 7 → 5
      (386, '{"kind": "zone_catch", "zone": "ultra", "n": 3}'),         -- 테오키스 울트라 스페이스 4 → 3 (울트라비스트는 단계 3 · Lv.50)
      (649, '{"kind": "type_catch", "types": ["벌레"], "n": 5}'),       -- 게노세크트 벌레 10 (≈ 53마리) → 5
      (719, '{"kind": "zone_catch", "zone": "desert", "n": 6}'),        -- 디안시   사막 8 → 6
      (802, '{"kind": "type_catch", "types": ["고스트"], "n": 6}'),     -- 마샤도   고스트 8 → 6 (발전소 ≈ 11마리)
      (801, '{"kind": "type_catch", "types": ["강철", "페어리"], "n": 8}'), -- 마기아나 강철·페어리 12 → 8 (설원 ≈ 13마리)
      (485, '{"kind": "zone_catch", "zone": "lava", "n": 5}')           -- 히드런   용암 지대 6 → 5
    ) o(dex, spec) on o.dex = (x ->> 'dex')::int)
 where s.key = 'legend_quests' and jsonb_typeof(s.value) = 'array';

notify pgrst, 'reload schema';
