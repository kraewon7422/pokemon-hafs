-- 0053: 배틀 승리 보상 하루 제한 없음 (운영자 요청). battle_daily_max 999 = 사실상 무제한.
--   같은 친구에게 이긴 보상은 여전히 하루 한 번 (same_opp). 운영자 [고급 설정] 에서 다시 바꿀 수 있음. 데이터만 (함수 없음 → 권한 블록 없음).
insert into public.settings (key, value) values ('battle_daily_max', '999') on conflict (key) do update set value = '999';
notify pgrst, 'reload schema';
