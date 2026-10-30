-- 0025: 미니게임 운영 (운영자 페이지 → 미니게임 탭)
--  · minigame_off (설정): 끈 게임 목록. 학생 앱에서 "쉬는 중"으로 보이고, 서버도 기록을 안 받음 (GAME_OFF).
--  · minigame_config(): 학생 앱이 열리는 몬스터 수·끈 게임을 받아 감 (예전엔 앱이 늘 10마리로 가정했음).
--  · 연습 배틀 공정 모드: battle_start_cpu(p_lines, p_format, p_fair) — 켜면 양쪽 모두 Lv.50, 회복약 없음 (친구 배틀과 같은 규칙).
--  · 운영자: 게임별 현황, 게임별 기록 목록 (학번·이름), 한 학생의 기록 지우기 (부정 기록), 게임 랭킹 초기화 ('초기화' 입력).

insert into public.settings (key, value) values ('minigame_off', '[]') on conflict (key) do nothing;

create or replace function public.minigame_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('unlock', coalesce((public._setting('minigame_unlock'))::int, 10),
                            'off', coalesce(public._setting('minigame_off'), '[]'::jsonb))
$$;

-- 0023 그대로 + 끈 게임은 거절
create or replace function public.submit_minigame_score(p_game text, p_score int, p_ms int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n int; ok boolean;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_game not in ('surf', 'dodge', 'maze', 'land') then raise exception 'BAD_GAME'; end if;
  if coalesce(public._setting('minigame_off'), '[]'::jsonb) ? p_game then raise exception 'GAME_OFF'; end if;
  select count(*) into n from public.collection where user_id = uid;
  if n < coalesce((public._setting('minigame_unlock'))::int, 10) then raise exception 'MINIGAME_LOCKED'; end if;
  if exists (select 1 from public.minigame_scores where user_id = uid and game = p_game and at > now() - interval '5 seconds') then
    raise exception 'TRY_LATER';
  end if;
  -- 말이 되는 점수인지 (서핑: 1초에 최대 40m / 폭탄: 1초에 최대 30점 / 땅따먹기: 판의 0~1000‰, 5초 이상 / 미로: 5판을 6초~10분)
  ok := case p_game
    when 'surf' then p_score between 0 and 1000000 and p_ms >= 1000 and p_score <= p_ms / 1000.0 * 40 + 50
    when 'land' then p_score between 0 and 1000 and p_ms >= 5000
    when 'dodge' then p_score between 0 and 100000 and p_ms >= 1000 and p_score <= p_ms / 1000.0 * 30 + 50
    else p_score between 6000 and 600000 and abs(p_ms - p_score) < 3000 end;
  if not ok then raise exception 'BAD_SCORE'; end if;
  insert into public.minigame_scores (user_id, game, score, ms) values (uid, p_game, p_score, p_ms);
  return public.minigame_ranking(p_game) || jsonb_build_object('submitted', p_score);
end $$;

-- 운영자: 게임별 현황
create or replace function public.admin_minigame_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  return jsonb_build_object(
    'unlock', coalesce((public._setting('minigame_unlock'))::int, 10),
    'off', coalesce(public._setting('minigame_off'), '[]'::jsonb),
    'games', (select jsonb_object_agg(g, jsonb_build_object(
        'players', (select count(distinct user_id) from public.minigame_scores s where s.game = g),
        'plays', (select count(*) from public.minigame_scores s where s.game = g),
        'today', (select count(*) from public.minigame_scores s where s.game = g
                   and (s.at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date)))
      from unnest(array['surf', 'dodge', 'maze', 'land']) g));
end $$;

-- 운영자: 한 게임의 기록 (한 사람당 가장 좋은 기록, 학번·실명)
create or replace function public.admin_minigame_scores(p_game text, p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare lo boolean := public._mg_lower(p_game);
begin
  perform public._assert_admin();
  if p_game not in ('surf', 'dodge', 'maze', 'land') then raise exception 'BAD_GAME'; end if;
  return coalesce((select jsonb_agg(x order by x.rk, x.at) from (
    select rank() over (order by case when lo then b.score else -b.score end) as rk, b.*, p.student_id, p.name
      from (select user_id, case when lo then min(score) else max(score) end as score, count(*) as plays, max(at) as at
              from public.minigame_scores where game = p_game group by user_id) b
      join public.profiles p on p.user_id = b.user_id
     order by case when lo then b.score else -b.score end, b.at
     limit greatest(1, least(coalesce(p_limit, 100), 500))) x), '[]');
end $$;

-- 운영자: 한 학생의 한 게임 기록을 모두 지움 (말이 안 되는 기록 등)
create or replace function public.admin_delete_minigame_scores(p_game text, p_student_id text) returns int
language plpgsql security definer set search_path = '' as $$
declare uid uuid; n int;
begin
  perform public._assert_admin();
  select user_id into uid from public.profiles where student_id = p_student_id;
  if uid is null then raise exception 'NOT_FOUND'; end if;
  delete from public.minigame_scores where user_id = uid and game = p_game;
  get diagnostics n = row_count;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('minigame_delete', p_game, 'student', p_student_id, 'rows', n));
  return n;
end $$;

-- 운영자: 한 게임 랭킹 모두 지우기 (확인 글자 '초기화')
create or replace function public.admin_reset_minigame(p_game text, p_confirm text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform public._assert_admin();
  if p_game not in ('surf', 'dodge', 'maze', 'land') then raise exception 'BAD_GAME'; end if;
  if p_confirm is distinct from '초기화' then raise exception 'CONFIRM_MISMATCH'; end if;
  delete from public.minigame_scores where game = p_game;
  get diagnostics n = row_count;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('minigame_reset', p_game, 'rows', n));
  return n;
end $$;

-- 연습 배틀 (AI) + 공정 모드 선택 (0020 그대로, p_fair 만 더함)
drop function if exists public.battle_start_cpu(int[], text);
create or replace function public.battle_start_cpu(p_lines int[], p_format text default 'single', p_fair boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mine int[]; foe int[] := '{}'; used int[]; x int; y int; fmt text := coalesce(p_format, 'single');
  b public.battles; lv int;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  if fmt not in ('single', 'double') then raise exception 'BAD_FORMAT'; end if;
  perform public._assert_open();
  perform public._bt_no_pvp(uid);
  mine := public._bt_team(uid, p_lines, public._bt_nmax(fmt));
  used := p_lines;
  foreach x in array mine loop
    select s.id into y from public.species s join public.lines l on l.id = s.line_id
     where l.active and not l.withdrawn and not l.secret and not l.bonus and l.rarity <> 'legendary'
       and s.stage = (select stage from public.species where id = x) and s.line_id <> all (used)
     order by random() limit 1;
    if y is null then raise exception 'BAD_TEAM'; end if;
    foe := foe || y; used := used || ((y - 1) / 3 + 1);
  end loop;
  select round(avg(level))::int into lv from public.collection where user_id = uid and line_id = any (p_lines);
  perform public._bt_close_mine(uid);
  b := public._bt_new(uid, 'cpu', null, mine, foe, fmt, coalesce(p_fair, false), coalesce(lv, 50));
  return public._bt_json(b, uid);
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
  public.submit_minigame_score(text, int, int), public.minigame_ranking(text), public.claim_egg(text), public.set_partner(int), public.minigame_config(),
  public.battle_code(text, boolean), public.battle_peek(text), public.battle_set_team(int[]), public.battle_start_cpu(int[], text, boolean),
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
  public.admin_game_stats(), public.admin_give_item(text, text, int), public.admin_set_level(text, int, int),
  public.admin_minigame_overview(), public.admin_minigame_scores(text, int), public.admin_delete_minigame_scores(text, text), public.admin_reset_minigame(text, text)
to authenticated;
