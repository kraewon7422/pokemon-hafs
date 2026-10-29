-- 0022: QR 없이 참가하는 레이드 (아침·점심·저녁 전설처럼 모두에게 주는 레이드용)
--  · raids.open = true 이면 학생 앱 레이드 탭에 "참가" 버튼이 떠서 QR 없이 들어올 수 있다 (raid_join_open, open_raids).
--  · 운영자: 레이드를 열 때 / 레이드 목록에서 켜고 끔 (admin_set_raid_open).
--  · 시간대 전설 레이드(TV 가 자동으로 여는 것)는 설정 raid_slot_open (기본 false) 을 켜면 처음부터 QR 없이 참가.

alter table public.raids add column if not exists open boolean not null default false;
insert into public.settings (key, value) values ('raid_slot_open', 'false') on conflict (key) do nothing;

-- QR 없이 참가 (open 레이드만)
create or replace function public.raid_join_open(p_raid bigint, p_line int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r public.raids;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._assert_open();
  perform public._raid_sweep();
  select * into r from public.raids where id = p_raid;
  if not found or not r.open then raise exception 'RAID_NOT_FOUND'; end if;
  if r.status <> 'active' or now() < r.starts_at then raise exception 'RAID_OVER'; end if;
  insert into public.raid_players (raid_id, user_id, line_id)
  values (r.id, uid, case when exists (select 1 from public.collection where user_id = uid and line_id = p_line) then p_line end)
  on conflict (raid_id, user_id) do nothing;
  return public._raid_json(r, uid);
end $$;

-- 지금 QR 없이 참가할 수 있는 레이드
create or replace function public.open_raids() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._raid_sweep();
  return coalesce((select jsonb_agg(public._raid_json(r, auth.uid())
                                    || jsonb_build_object('joined', exists (select 1 from public.raid_players p where p.raid_id = r.id and p.user_id = auth.uid()))
                                    order by r.ends_at)
    from public.raids r where r.open and r.status = 'active' and r.ends_at > now() and r.starts_at <= now()), '[]');
end $$;

-- 운영자: QR 없이 참가 켜고 끄기
create or replace function public.admin_set_raid_open(p_id bigint, p_open boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  update public.raids set open = coalesce(p_open, false) where id = p_id;
  if not found then raise exception 'RAID_NOT_FOUND'; end if;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('raid', p_id, 'open', p_open));
  return jsonb_build_object('ok', true, 'open', coalesce(p_open, false));
end $$;

-- 운영자 목록에 open 표시 (0013 + open)
create or replace function public.admin_list_raids() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  perform public._raid_sweep();
  return coalesce((select jsonb_agg(public._raid_json(r, null) || jsonb_build_object('q', 'R' || r.id, 't', case when r.tv then null else r.token end,
                                     'rewarded', (select count(*) from public.raid_players p where p.raid_id = r.id and p.rewarded), 'open', r.open)
                                    order by r.status <> 'active', r.created_at desc)
    from (select * from public.raids order by created_at desc limit 40) r), '[]');
end $$;

-- TV: 시간대 레이드 자동 생성 (0013 + 설정 raid_slot_open 이면 QR 없이 참가)
create or replace function public.screen_raids() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sl jsonb; sp int; t time := (now() at time zone 'Asia/Seoul')::time;
  win_sec int := (public._setting('rotating_window_sec'))::int; w bigint;
begin
  if not public._is_role(array['booth', 'admin']) then raise exception 'NOT_STAFF'; end if;
  perform public._raid_sweep();
  if public._is_open() then
    for sl in select * from jsonb_array_elements(coalesce(public._setting('raid_slots'), '[]')) loop
      if t >= (sl ->> 'from')::time and t < (sl ->> 'until')::time then
        select id into sp from public.species where line_id = (sl ->> 'line')::int and stage = 1;
        perform pg_advisory_xact_lock(hashtext('raid_slot:' || sp));
        if sp is not null
           and not exists (select 1 from public.raids where kind = 'slot' and species_id = sp and status = 'active')
           and not exists (select 1 from public.raids where kind = 'slot' and species_id = sp
                           and ended_at > now() - make_interval(mins => (public._setting('raid_cooldown_min'))::int)) then
          insert into public.raids (species_id, kind, title, tv, token, hp_max, hp, ends_at, open)
          values (sp, 'slot', (select name from public.species where id = sp) || ' 레이드', true,
                  public._rand(10, 'abcdef0123456789'), (public._setting('raid_slot_hp'))::int, (public._setting('raid_slot_hp'))::int,
                  least(now() + make_interval(mins => (public._setting('raid_slot_minutes'))::int),
                        ((now() at time zone 'Asia/Seoul')::date + (sl ->> 'until')::time) at time zone 'Asia/Seoul'),
                  coalesce((public._setting('raid_slot_open'))::boolean, false));
        end if;
      end if;
    end loop;
  end if;
  w := floor(extract(epoch from now()) / win_sec);
  return jsonb_build_object('server_time', now(), 'expires_in', win_sec - (floor(extract(epoch from now()))::bigint % win_sec),
    'raids', coalesce((select jsonb_agg(public._raid_json(r, null) || jsonb_build_object('q', 'R' || r.id, 't', public._raid_token(r, w), 'open', r.open)
                                        order by r.status <> 'active', r.created_at)
      from public.raids r where r.tv and (r.status = 'active' or r.ended_at > now() - interval '20 seconds')), '[]'));
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
  public.screen_raids(), public.raid_join_open(bigint, int), public.open_raids(),
  public.battle_code(text, boolean), public.battle_peek(text), public.battle_set_team(int[]), public.battle_start_cpu(int[], text),
  public.battle_start_team(text, int[]), public.battle_challenge(text, int[]), public.battle_inbox(), public.battle_accept(bigint, int[]),
  public.battle_decline(bigint), public.battle_state(bigint), public.battle_act(bigint, jsonb), public.battle_forfeit(bigint), public.battle_today(),
  public.battle_recent(),
  public.bag_state(bigint), public.bag_set_moves(int, int[]), public.bag_set_held(int, text), public.bag_use(text, int),
  public.admin_create_qr(text, text, text, text), public.admin_rotate_qr(text, boolean), public.admin_cancel_ticket(text),
  public.admin_set_role(text, text), public.admin_adjust_tickets(text, int), public.admin_unlink(text), public.admin_stats(),
  public.admin_make_login_codes(text[], text[]), public.admin_export_ranking(), public.admin_relink(text, text),
  public.admin_grant_monster(text, int, int), public.admin_set_in_ranking(text, boolean), public.admin_list_staff(),
  public.admin_invite_staff(text, text), public.admin_remove_staff(text), public.admin_list_requests(),
  public.admin_decide_reset(bigint, boolean), public.admin_set_inquiry(bigint, boolean),
  public.admin_create_raid(int, int, int, boolean, text, text), public.admin_end_raid(bigint), public.admin_list_raids(), public.admin_set_raid_open(bigint, boolean),
  public.admin_delete_students(text[], text), public.admin_count_students(),
  public.admin_create_staff_login(text, text, text), public.admin_reset_staff_password(text),
  public.admin_list_staff_logins(), public.admin_remove_staff_login(text),
  public.admin_game_stats(), public.admin_give_item(text, text, int), public.admin_set_level(text, int, int)
to authenticated;
