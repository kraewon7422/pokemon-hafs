-- 0019: 축제 운영 다듬기
--  · 아침 가입 몰림: 새 계정(고유번호·아이디) 10분 제한 100 → 1000 (조회 시간에 600명이 한꺼번에 가입해도 안 막히게)
--  · battle_recent: 최근 배틀한 친구 (다시 하기 / 바로 신청)
--  · admin_game_stats: 운영자 현황판의 오늘 배틀·레이드·진화권 숫자

update public.settings set value = '1000' where key = 'code_signup_per_10min';

-- 최근 배틀 상대 (친구 팀 vs AI · 실시간). 친구의 배틀 코드를 돌려줘서 QR 없이 바로 다시 붙을 수 있게
create or replace function public.battle_recent() returns jsonb
language sql stable security definer set search_path = '' as $$
  with d as (
    select distinct on (o.user_id) public._display_name(o) as name, o.battle_code as code, o.battle_format as format,
           b.mode, b.updated_at as at, b.winner = (case when b.p1 = auth.uid() then 0 else 1 end) as won
      from public.battles b
      join public.profiles o on o.user_id = case when b.p1 = auth.uid() then b.p2 else b.p1 end
     where (b.p1 = auth.uid() or (b.p2 = auth.uid() and b.mode = 'pvp'))
       and b.mode in ('team', 'pvp') and b.status = 'over' and o.battle_code is not null
     order by o.user_id, b.updated_at desc)
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'code', code, 'format', format, 'mode', mode, 'at', at, 'won', won)
                            order by at desc), '[]')
    from (select * from d order by at desc limit 6) t
$$;

-- 운영자 현황판: 오늘(한국 시간) 게임 숫자
create or replace function public.admin_game_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare day0 timestamptz := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  perform public._assert_admin();
  return jsonb_build_object(
    'battles', (select jsonb_build_object('cpu', count(*) filter (where mode = 'cpu'), 'team', count(*) filter (where mode = 'team'),
                                          'pvp', count(*) filter (where mode = 'pvp'), 'double', count(*) filter (where format = 'double'),
                                          'players', count(distinct p1))
                  from public.battles where created_at >= day0 and status in ('active', 'over')),
    'pvp_live', (select count(*) from public.battles where status = 'active' and mode = 'pvp'),
    'battle_wins', (select count(*) from public.battle_rewards where day = (now() at time zone 'Asia/Seoul')::date),
    'raids', jsonb_build_object(
      'active', (select count(*) from public.raids where status = 'active' and ends_at > now()),
      'won', (select count(*) from public.raids where status = 'won' and ended_at >= day0),
      'failed', (select count(*) from public.raids where status = 'failed' and ended_at >= day0),
      'players', (select count(distinct user_id) from public.raid_players where joined_at >= day0)),
    'tickets', jsonb_build_object(
      'quiz', (select count(*) from public.quiz_attempts where granted and answered_at >= day0),
      'roulette', (select coalesce(sum(prize), 0) from public.roulette_spins where at >= day0),
      'battle', (select count(*) from public.battle_rewards where day = (now() at time zone 'Asia/Seoul')::date)),
    'evolve', (select jsonb_build_object('tries', count(*), 'success', count(*) filter (where (data ->> 'success')::boolean))
                 from public.events where kind = 'evolve' and at >= day0),
    'at', now());
end $$;

-- rule (0006): every migration that creates functions ends with this block
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_code_account(text), public.create_number_account(text, text), public.request_password_reset(text, text, text, text),
  public.dev_create_account(text), public.dev_fake_google(text, text), public.send_inquiry_public(text, text, text),
  public.create_id_account(text, text)
to anon, authenticated;
grant execute on function
  public.is_admin(), public.ensure_profile(), public.register_profile(text, text, text, boolean),
  public.link_number(text, text, text, boolean, boolean), public.link_id(text, text, text, boolean), public.send_inquiry(text),
  public.accept_terms(boolean), public.sync(jsonb, text), public.self_redeem(), public.answer_quiz(bigint, int),
  public.evolve(int), public.spin_roulette(), public.get_ranking(int), public.set_prefs(boolean, int), public.log_client_error(text),
  public.booth_lookup(text), public.booth_redeem(text), public.screen_feed(), public.screen_rotating_token(text),
  public.get_ranking_by(int, text), public.raid_join(text, text, int), public.raid_attack(bigint, int, int), public.raid_state(bigint), public.my_raids(),
  public.screen_raids(),
  public.battle_code(text), public.battle_peek(text), public.battle_set_team(int[]), public.battle_start_cpu(int[], text),
  public.battle_start_team(text, int[]), public.battle_challenge(text, int[]), public.battle_inbox(), public.battle_accept(bigint, int[]),
  public.battle_decline(bigint), public.battle_state(bigint), public.battle_act(bigint, jsonb), public.battle_forfeit(bigint), public.battle_today(),
  public.battle_recent(),
  public.admin_create_qr(text, text, text, text), public.admin_rotate_qr(text, boolean), public.admin_cancel_ticket(text),
  public.admin_set_role(text, text), public.admin_adjust_tickets(text, int), public.admin_unlink(text), public.admin_stats(),
  public.admin_make_login_codes(text[], text[]), public.admin_export_ranking(), public.admin_relink(text, text),
  public.admin_grant_monster(text, int, int), public.admin_set_in_ranking(text, boolean), public.admin_list_staff(),
  public.admin_invite_staff(text, text), public.admin_remove_staff(text), public.admin_list_requests(),
  public.admin_decide_reset(bigint, boolean), public.admin_set_inquiry(bigint, boolean),
  public.admin_create_raid(int, int, int, boolean, text, text), public.admin_end_raid(bigint), public.admin_list_raids(),
  public.admin_delete_students(text[], text), public.admin_count_students(),
  public.admin_create_staff_login(text, text, text), public.admin_reset_staff_password(text),
  public.admin_list_staff_logins(), public.admin_remove_staff_login(text),
  public.admin_game_stats()
to authenticated;
