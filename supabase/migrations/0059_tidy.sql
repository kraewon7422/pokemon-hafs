-- 0059 정리 두 가지 (함수를 새로 만들지 않으므로 revoke/grant 블록은 필요 없음)

-- 1. 남은 옛 이름: QR A07 힌트의 '희귀 몬스터' → '희귀 포켓몬' (seed.sql 도 같이 고침)
--    운영자가 힌트를 이미 바꿨으면 건드리지 않음 (옛 문구 그대로일 때만).
update public.qr_points
   set hint = '아프면 가는 곳… 근처에 숨은 희귀 포켓몬?'
 where id = 'A07' and hint = '아프면 가는 곳… 근처에 숨은 희귀 몬스터?';

-- 2. 스테이징에서 마이그레이션을 넣을 때 잠깐 쓰던 함수. 이미 꺼져 있고 (부르면 'DISABLED' 오류)
--    어느 마이그레이션에도 없어서 새 DB 에는 원래 없음 → 남은 것만 지움.
drop function if exists public._tmp_seed_exec(text);
