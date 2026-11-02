-- 0026: 미니게임 '몬스터 등굣길' (id cross) — 칸을 건너 학교까지. 점수 = 앞으로 간 칸 수 (+ 별), 클수록 좋음.
--  · 0023/0025 의 게임 목록에 'cross' 를 더함 (표 check, 기록 내기, 랭킹, 운영자 현황·기록·초기화).
--  · 서버 확인: 1초에 최대 6칸 (+30) — 아주 빠른 사람도 1초에 4칸 남짓.

alter table public.minigame_scores drop constraint if exists minigame_scores_game_check;
alter table public.minigame_scores add constraint minigame_scores_game_check check (game in ('surf', 'dodge', 'maze', 'land', 'cross'));

create or replace function public.submit_minigame_score(p_game text, p_score int, p_ms int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n int; ok boolean;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_game not in ('surf', 'dodge', 'maze', 'land', 'cross') then raise exception 'BAD_GAME'; end if;
  if coalesce(public._setting('minigame_off'), '[]'::jsonb) ? p_game then raise exception 'GAME_OFF'; end if;
  select count(*) into n from public.collection where user_id = uid;
  if n < coalesce((public._setting('minigame_unlock'))::int, 10) then raise exception 'MINIGAME_LOCKED'; end if;
  if exists (select 1 from public.minigame_scores where user_id = uid and game = p_game and at > now() - interval '5 seconds') then
    raise exception 'TRY_LATER';
  end if;
  -- 말이 되는 점수인지 (서핑: 1초에 최대 40m / 폭탄: 1초에 최대 30점 / 등굣길: 1초에 최대 6칸 / 땅따먹기: 판의 0~1000‰, 5초 이상 / 미로: 5판을 6초~10분)
  ok := case p_game
    when 'surf' then p_score between 0 and 1000000 and p_ms >= 1000 and p_score <= p_ms / 1000.0 * 40 + 50
    when 'land' then p_score between 0 and 1000 and p_ms >= 5000
    when 'dodge' then p_score between 0 and 100000 and p_ms >= 1000 and p_score <= p_ms / 1000.0 * 30 + 50
    when 'cross' then p_score between 0 and 100000 and p_ms >= 1000 and p_score <= p_ms / 1000.0 * 6 + 30
    else p_score between 6000 and 600000 and abs(p_ms - p_score) < 3000 end;
  if not ok then raise exception 'BAD_SCORE'; end if;
  insert into public.minigame_scores (user_id, game, score, ms) values (uid, p_game, p_score, p_ms);
  return public.minigame_ranking(p_game) || jsonb_build_object('submitted', p_score);
end $$;

create or replace function public.minigame_ranking(p_game text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); lo boolean := public._mg_lower(p_game);
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_game not in ('surf', 'dodge', 'maze', 'land', 'cross') then raise exception 'BAD_GAME'; end if;
  return (with best as (
      select user_id, case when lo then min(score) else max(score) end as score, max(at) as at
        from public.minigame_scores where game = p_game group by user_id),
    ranked as (
      select b.*, rank() over (order by case when lo then b.score else -b.score end) as rk from best b)
    select jsonb_build_object(
      'game', p_game, 'lower_better', lo,
      'top', coalesce((select jsonb_agg(jsonb_build_object('rank', r.rk, 'name', public._display_name(p), 'score', r.score, 'me', r.user_id = uid)
                                        order by r.rk, r.at)
                       from (select * from ranked order by rk, at limit 50) r join public.profiles p on p.user_id = r.user_id), '[]'),
      'me', (select jsonb_build_object('rank', r.rk, 'score', r.score) from ranked r where r.user_id = uid),
      'players', (select count(*) from best),
      'unlock', coalesce((public._setting('minigame_unlock'))::int, 10)));
end $$;

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
      from unnest(array['surf', 'dodge', 'maze', 'land', 'cross']) g));
end $$;

create or replace function public.admin_minigame_scores(p_game text, p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare lo boolean := public._mg_lower(p_game);
begin
  perform public._assert_admin();
  if p_game not in ('surf', 'dodge', 'maze', 'land', 'cross') then raise exception 'BAD_GAME'; end if;
  return coalesce((select jsonb_agg(x order by x.rk, x.at) from (
    select rank() over (order by case when lo then b.score else -b.score end) as rk, b.*, p.student_id, p.name
      from (select user_id, case when lo then min(score) else max(score) end as score, count(*) as plays, max(at) as at
              from public.minigame_scores where game = p_game group by user_id) b
      join public.profiles p on p.user_id = b.user_id
     order by case when lo then b.score else -b.score end, b.at
     limit greatest(1, least(coalesce(p_limit, 100), 500))) x), '[]');
end $$;

create or replace function public.admin_reset_minigame(p_game text, p_confirm text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform public._assert_admin();
  if p_game not in ('surf', 'dodge', 'maze', 'land', 'cross') then raise exception 'BAD_GAME'; end if;
  if p_confirm is distinct from '초기화' then raise exception 'CONFIRM_MISMATCH'; end if;
  delete from public.minigame_scores where game = p_game;
  get diagnostics n = row_count;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('minigame_reset', p_game, 'rows', n));
  return n;
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
