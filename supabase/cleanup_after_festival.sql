-- 축제 종료 2주 뒤 실행: 학생 개인정보·게임 기록 삭제 (DESIGN.md §7 약속).
-- 실행 전: 최종 랭킹 CSV(운영자 → 최종 랭킹)와 db dump 백업이 끝났는지 확인. 되돌릴 수 없음.
-- Supabase 대시보드 → SQL Editor 에서 실행. 몬스터·퀴즈·QR 같은 콘텐츠(lines/species/quizzes/qr_*)는 남는다.
begin;
delete from public.quiz_attempts;
delete from public.tickets;
delete from public.collection;
delete from public.code_failures;
delete from public.client_errors;
delete from public.events;
delete from public.profiles where role = 'student';
-- 로그인 계정: 학교 구글 계정 + 예비 코드 계정 (부스·운영자 계정은 남김)
delete from auth.users u
 where u.email like '%@code.local'
    or exists (select 1 from jsonb_array_elements_text((select value from public.settings where key = 'email_domains')) d
               where lower(u.email) like '%@' || d);
commit;
select (select count(*) from public.profiles) profiles_left, (select count(*) from auth.users) auth_users_left;
