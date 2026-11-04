-- 0035: 정리
--  1. 학교 메일 도메인 hafs.hs.kr (고유번호@hafs.hs.kr, 예: 022001@hafs.hs.kr).
--     test.local 은 자동 테스트(tests/rpc_test.mjs) 용 — 축제 전에 운영자 설정에서 지우기.
--  2. 0032(진짜 포켓몬) 이전에 시작돼 아직 안 끝난 배틀은 옛 몬스터 이름/종을 담고 있어 취소.
update public.settings set value = '["hafs.hs.kr", "test.local"]'::jsonb where key = 'email_domains';

update public.battles set status = 'cancelled'
 where status in ('active', 'invite') and created_at < timestamptz '2026-11-04 00:00:00+00';
