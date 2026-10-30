-- 0023: 미니게임 (홈 → 미니게임, 몬스터 10마리부터 열림) — 서핑 · 폭탄 피하기 · 자이로 미로 · 땅따먹기
--  · 점수는 게임마다 따로 랭킹 (전체 랭킹에는 안 들어감). 한 사람의 가장 좋은 기록만 줄 세움.
--  · 서핑(m)·폭탄 피하기(점)·땅따먹기(땅 ‰) = 클수록 좋음, 미로 = 랭킹 모드 5판 시간(ms)이 짧을수록 좋음 (_mg_lower). 미로 자유 모드는 기록 안 보냄.
--  · 서버 확인: 몬스터 minigame_unlock (10) 마리 이상, 게임별 점수 범위, 걸린 시간에 맞는 점수, 같은 게임 5초에 한 번.

create table if not exists public.minigame_scores (
  id      bigserial primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade on update cascade,
  game    text not null check (game in ('surf', 'dodge', 'maze', 'land')),
  score   int not null,
  ms      int not null default 0,          -- 한 판에 걸린 시간 (점수 확인용)
  at      timestamptz not null default now()
);
create index if not exists minigame_scores_game on public.minigame_scores (game, score);
create index if not exists minigame_scores_user on public.minigame_scores (user_id, game, at);
alter table public.minigame_scores enable row level security;   -- 함수로만

insert into public.settings (key, value) values ('minigame_unlock', '10') on conflict (key) do nothing;

create or replace function public._mg_lower(g text) returns boolean
language sql immutable set search_path = '' as $$ select g = 'maze' $$;

-- 한 판 기록 보내기 → 내 최고 기록·순위
create or replace function public.submit_minigame_score(p_game text, p_score int, p_ms int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n int; ok boolean;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_game not in ('surf', 'dodge', 'maze', 'land') then raise exception 'BAD_GAME'; end if;
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

-- 게임별 랭킹: 한 사람의 최고 기록으로 상위 50 + 내 기록·순위
create or replace function public.minigame_ranking(p_game text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); lo boolean := public._mg_lower(p_game);
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_game not in ('surf', 'dodge', 'maze', 'land') then raise exception 'BAD_GAME'; end if;
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
  public.submit_minigame_score(text, int, int), public.minigame_ranking(text),
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
