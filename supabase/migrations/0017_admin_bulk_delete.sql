-- 0017: 운영자 학생 탭 "기록 삭제" — 더미(테스트) 데이터 지우기.
--  · 일부 삭제: 체크한 학생들만 (p_student_ids). 전체 삭제: 학생 계정 전부 (p_student_ids = null).
--  · 운영자·부스 계정은 절대 지우지 않는다 (role = 'student' 만).
--  · 지우는 것: 프로필 (→ 도감·티켓·배틀·레이드 참가·룰렛 기록 등은 cascade 로 같이), 코드 실패 기록,
--    그리고 고유번호 계정(…@code.local)의 로그인 자체 (남아 있으면 그 번호를 진짜 학생이 못 씀).
--    구글 로그인은 남는다 (다시 들어오면 처음부터 등록).
--  · 실수 방지: 폰 화면에서 두 번 확인 + 서버도 확인 글자를 받는다 (일부 '삭제', 전체 '전체 삭제').

create or replace function public.admin_delete_students(p_student_ids text[], p_confirm text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uids uuid[]; n int; logins int;
begin
  perform public._assert_admin();
  if p_student_ids is null then
    if coalesce(p_confirm, '') <> '전체 삭제' then raise exception 'CONFIRM_MISMATCH'; end if;
    select array_agg(user_id) into uids from public.profiles where role = 'student';
  else
    if coalesce(p_confirm, '') <> '삭제' then raise exception 'CONFIRM_MISMATCH'; end if;
    if cardinality(p_student_ids) = 0 or cardinality(p_student_ids) > 500 then raise exception 'BAD_SELECTION'; end if;
    select array_agg(user_id) into uids from public.profiles where role = 'student' and student_id = any (p_student_ids);
  end if;
  uids := coalesce(uids, '{}');
  n := cardinality(uids);
  if n = 0 then return jsonb_build_object('deleted', 0, 'logins', 0); end if;
  delete from public.code_failures where user_id = any (uids);
  delete from public.profiles where user_id = any (uids);
  -- 고유번호·개발용 로그인도 지움 (구글 로그인은 남김)
  delete from auth.users u where u.id = any (uids)
     and u.email like '%@code.local'
     and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google');
  get diagnostics logins = row_count;
  insert into public.events (user_id, kind, data)
  values (auth.uid(), 'admin', jsonb_build_object('bulk_delete', n, 'all', p_student_ids is null, 'logins', logins));
  return jsonb_build_object('deleted', n, 'logins', logins);
end $$;

-- 전체 삭제 전에 보여 줄 숫자
create or replace function public.admin_count_students() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  return jsonb_build_object('students', (select count(*) from public.profiles where role = 'student'));
end $$;

-- rule (0006): every migration that creates functions ends with this block
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_code_account(text), public.create_number_account(text, text), public.request_password_reset(text, text, text, text),
  public.dev_create_account(text), public.dev_fake_google(text, text), public.send_inquiry_public(text, text, text)
to anon, authenticated;
grant execute on function
  public.is_admin(), public.ensure_profile(), public.register_profile(text, text, text, boolean),
  public.link_number(text, text, text, boolean, boolean), public.send_inquiry(text),
  public.accept_terms(boolean), public.sync(jsonb, text), public.self_redeem(), public.answer_quiz(bigint, int),
  public.evolve(int), public.spin_roulette(), public.get_ranking(int), public.set_prefs(boolean, int), public.log_client_error(text),
  public.booth_lookup(text), public.booth_redeem(text), public.screen_feed(), public.screen_rotating_token(text),
  public.get_ranking_by(int, text), public.raid_join(text, text, int), public.raid_attack(bigint, int, int), public.raid_state(bigint), public.my_raids(),
  public.screen_raids(),
  public.battle_code(text), public.battle_peek(text), public.battle_set_team(int[]), public.battle_start_cpu(int[], text),
  public.battle_start_team(text, int[]), public.battle_challenge(text, int[]), public.battle_inbox(), public.battle_accept(bigint, int[]),
  public.battle_decline(bigint), public.battle_state(bigint), public.battle_act(bigint, jsonb), public.battle_forfeit(bigint), public.battle_today(),
  public.admin_create_qr(text, text, text, text), public.admin_rotate_qr(text, boolean), public.admin_cancel_ticket(text),
  public.admin_set_role(text, text), public.admin_adjust_tickets(text, int), public.admin_unlink(text), public.admin_stats(),
  public.admin_make_login_codes(text[], text[]), public.admin_export_ranking(), public.admin_relink(text, text),
  public.admin_grant_monster(text, int, int), public.admin_set_in_ranking(text, boolean), public.admin_list_staff(),
  public.admin_invite_staff(text, text), public.admin_remove_staff(text), public.admin_list_requests(),
  public.admin_decide_reset(bigint, boolean), public.admin_set_inquiry(bigint, boolean),
  public.admin_create_raid(int, int, int, boolean, text, text), public.admin_end_raid(bigint), public.admin_list_raids(),
  public.admin_delete_students(text[], text), public.admin_count_students()
to authenticated;
