-- 0051: 해금 단계 — 선생님 포켓몬 (도감 '학교' 탭) 이 축제의 중심, 모은 만큼 학생마다 새 즐길 거리가 열림
--  늘 열림: QR 찍기 · 선생님 포켓몬 · 퀴즈 · 레이드 · 배틀 · 룰렛 · 부스.
--  1단계 (그대로): 포켓몬 minigame_unlock (기본 10) 종류를 모으면 미니게임 (submit_minigame_score 의 MINIGAME_LOCKED, 0036 그대로).
--  2단계 (새로): 학교 도감 (_school_keys = 0049 _dex_rewards 와 같은 셈 = 앱의 '학교' 탭) 을 unlock_safari_pct (기본 50) % 이상 모으면
--     (a) 사파리존 (safari_encounter · safari_visit → 아니면 'SAFARI_LOCKED_STUDENT', detail = 'need=N got=M'),
--     (b) 장소 QR 에서 야생 포켓몬 (_redeem_ticket → _draw_line(q, uid): 열리기 전엔 wild_chance 를 굴리지 않고, 정해 둔 포켓몬이 없는 QR 은
--         야생 대신 선생님 포켓몬 하나 (_school_line)), (c) 앱 도감의 전체 화면 (앱이 sync 의 unlock 을 보고 정함).
--     처음 닿은 때 profiles.unlocked_at 에 적어 둠 (_recompute → _dex_rewards → _unlock_mark) → 나중에 학교 도감 칸이 늘거나 % 를 올려도 그대로 열림.
--     운영자 스위치 unlock_all (기본 false) = 모두에게 2단계를 엶 (적어 두지는 않음 → 다시 끄면 아직 못 닿은 학생은 다시 잠김).
--     safari_open = false (0048) 면 열린 학생도 못 들어감 (SAFARI_CLOSED 를 먼저 봄). 이미 시작한 사파리 잡기 (pending) 는 잠겨도 끝낼 수 있음
--     (safari_turn · safari_throws · safari_result 는 그대로, safari_encounter 는 pending 이 있으면 그것을 돌려줌).
--  sync 상태 'unlock' = { unlocked, by ('progress' | 'all' | null), got, need, total, pct, minigame, at, all, safari_pending }.
--  safari_state 에도 'unlocked' · 'unlock'. 운영자: admin_unlock_stats() = { students, unlocked, all, pct, need, total }.
--  걸어서 만나는 야생 (wild_steps) · 방랑 전설 (roam_chance) · 알 · 레이드는 그대로.

-- ── 1. 설정 · 열 ─────────────────────────────────────────────────────────────────────────────────────────────
insert into public.settings (key, value) values ('unlock_safari_pct', '50'), ('unlock_all', 'false') on conflict (key) do nothing;
alter table public.profiles add column if not exists unlocked_at timestamptz;

-- ── 2. 셈 ───────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._unlock_pct() returns int
language sql stable security definer set search_path = '' as $$
  select least(100, greatest(0, coalesce(round((public._setting('unlock_safari_pct') #>> '{}')::numeric)::int, 50)))
$$;

create or replace function public._unlock_all() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((public._setting('unlock_all') #>> '{}')::boolean, false)
$$;

-- 학교 도감 { got, total, need } (need = total × pct / 100 올림)
create or replace function public._unlock_progress(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with x as (
    select count(*)::int as total, (count(*) filter (where k in (select public._seen_dex(uid))))::int as got
    from public._school_keys() k)
  select jsonb_build_object('got', x.got, 'total', x.total, 'need', ceil(x.total * public._unlock_pct() / 100.0)::int, 'pct', public._unlock_pct())
  from x
$$;

-- 2단계가 열렸나 (적어 둔 때 · 모두에게 열기 · 지금 닿음)
create or replace function public._unlocked(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public._unlock_all()
      or exists (select 1 from public.profiles where user_id = uid and unlocked_at is not null)
      or (select (g ->> 'got')::int >= (g ->> 'need')::int from (select public._unlock_progress(uid) g) y)
$$;

-- 처음 닿으면 적어 둠 (그 뒤로 계속 열림)
create or replace function public._unlock_mark(uid uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare g jsonb;
begin
  if exists (select 1 from public.profiles where user_id = uid and unlocked_at is not null) then return true; end if;
  g := public._unlock_progress(uid);
  if (g ->> 'got')::int >= (g ->> 'need')::int then
    update public.profiles set unlocked_at = now() where user_id = uid and unlocked_at is null;
    return true;
  end if;
  return public._unlock_all();
end $$;

create or replace function public._unlock_json(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public._unlock_progress(uid) || jsonb_build_object(
    'unlocked', public._unlocked(uid),
    'by', case when (select unlocked_at from public.profiles where user_id = uid) is not null
                 or (select (g ->> 'got')::int >= (g ->> 'need')::int from (select public._unlock_progress(uid) g) y) then 'progress'
               when public._unlock_all() then 'all' end,
    'at', (select unlocked_at from public.profiles where user_id = uid),
    'all', public._unlock_all(),
    'minigame', coalesce((public._setting('minigame_unlock'))::int, 10),
    'safari_pending', exists (select 1 from public.raid_encounters e where e.user_id = uid and e.kind = 'safari' and e.status = 'pending'))
$$;

-- 이미 닿아 있던 학생 (이 migration 전) 은 지금 적어 둠
do $$
declare r record;
begin
  for r in select user_id from public.profiles where role = 'student' and unlocked_at is null loop
    perform public._unlock_mark(r.user_id);
  end loop;
end $$;

-- 선생님 포켓몬 하나 (정해 둔 포켓몬이 없는 장소 QR, 2단계 전): 학교 계열 · 전설 · 비밀 · 환상 · 보너스 · 도감 보상 계열은 뺌
create or replace function public._school_line() returns int
language sql volatile security definer set search_path = '' as $$
  select l.id from public.lines l
   where l.subject <> '야생' and l.active and not l.withdrawn and not l.secret and not l.mythic and not l.bonus and not l.ultra
     and l.rarity <> 'legendary' and l.legend_src is null
     and exists (select 1 from public.species s where s.line_id = l.id and s.stage = 1)
     and l.id not in (select v::int from jsonb_each_text(case when jsonb_typeof(public._setting('dex_rewards')) = 'object'
                                                              then public._setting('dex_rewards') else '{}'::jsonb end) x(k, v)
                       where v ~ '^[0-9]+$')
   order by random() limit 1
$$;

-- 장소 QR 뽑기 + 학생: 2단계가 열렸으면 예전 그대로 (0049 _draw_line(q)), 아니면 야생 없이
create or replace function public._draw_line(q text, uid uuid) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare v int;
begin
  if uid is null or public._unlocked(uid) then return public._draw_line(q); end if;
  select r.line_id into v from public.qr_rewards r join public.lines l on l.id = r.line_id
   where r.qr_id = q and l.active and not l.withdrawn and not l.ultra
   order by -ln(1 - random()) / r.weight limit 1;
  if v is null then v := public._school_line(); end if;
  return v;
end $$;

-- ── 3. 처음 닿은 때 적기: _dex_rewards (0049) 맨 앞에 _unlock_mark ─────────────────────────────────────────────
create or replace function public._dex_rewards(uid uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare total int; got int; cfg jsonb := public._setting('dex_rewards'); sp int;
begin
  perform public._unlock_mark(uid);   -- 0051: 2단계 (학교 도감 unlock_safari_pct %) 에 처음 닿은 때
  -- 0049: 학교 도감 = _school_keys (앱의 학교 탭 · '학교 n / N' 과 같은 목록)
  select count(*), count(*) filter (where k in (select public._seen_dex(uid)))
    into total, got
  from public._school_keys() k;
  if total = 0 then return; end if;
  if got >= total then perform public._charm_give(uid); end if;   -- 0042: 빛나는 부적 (도감 보상 설정과 상관없이)
  if cfg is null then return; end if;
  if got * 2 >= total and cfg ? '50' and not exists (select 1 from public.tickets where user_id = uid and special = 'dex50') then
    select id into sp from public.species where line_id = (cfg ->> '50')::int and stage = 1;
    if sp is not null then perform public._grant_special(uid, sp, 'dex50'); end if;
  end if;
  if got >= total and cfg ? '100' and not exists (select 1 from public.tickets where user_id = uid and special = 'dex100') then
    select id into sp from public.species where line_id = (cfg ->> '100')::int and stage = 1;
    if sp is not null then perform public._grant_special(uid, sp, 'dex100'); end if;
  end if;
end $function$;

-- ── 4. 장소 QR 티켓 바꾸기 (0042 그대로, 뽑기만 _draw_line(q, uid)) ──────────────────────────────────────────
create or replace function public._redeem_ticket(uid uuid, booth uuid, tk public.tickets) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  line int; sp int; stg int; is_new boolean; cnt int; bonus boolean; c public.collection; disg int; orig int;
  every int := coalesce((public._setting('dup_bonus_every'))::int, 0);
  up_mon bigint; up_lv int; sh boolean;
begin
  perform pg_advisory_xact_lock(hashtext('box:' || uid::text));
  if public._box_count(uid) >= public._box_max() then
    return jsonb_build_object('nonce', tk.nonce, 'error', 'box_full',
             'qr_name', (select name from public.qr_points where id = tk.qr_id));
  end if;
  if tk.fixed_species is not null then
    select s.line_id, s.stage, s.id into line, stg, sp from public.species s where s.id = tk.fixed_species;
    disg := tk.disguised_as;
  else
    line := public._draw_line(tk.qr_id, uid);   -- 0051: 2단계 전엔 야생 없이
    stg := 1;
    if line is not null then select id into sp from public.species where line_id = line and stage = 1; end if;
    if line is not null and tk.special is null then
      orig := sp;
      disg := public._ditto_roll(line);
      if disg is not null then
        select s.line_id, s.stage, s.id into line, stg, sp from public.species s where s.id = disg;
        disg := orig;
      end if;
    end if;
  end if;
  if line is null then
    update public.tickets set status = 'cancelled' where id = tk.id;
    return jsonb_build_object('nonce', tk.nonce, 'error', 'empty_pool',
             'qr_name', (select name from public.qr_points where id = tk.qr_id));
  end if;
  is_new := not exists (select 1 from public.collection where user_id = uid and line_id = line);
  if not is_new and public._lv_on('lv_from_catch') then
    select x.id into up_mon from public.collection x
     where x.user_id = uid and x.line_id = line and x.released_at is null and x.level < 100
     order by x.level desc, x.id limit 1;
    if up_mon is not null then up_lv := public._add_levels(uid, up_mon, 1); end if;
  end if;
  c := public._mon_new(uid, line, stg);
  -- 0042: 반짝
  sh := coalesce(tk.shiny, public._shiny_roll(uid));
  if sh then
    update public.collection set shiny = true, shiny_on = true, updated_at = now() where id = c.id;
  end if;
  select coalesce(sum(catch_count), 0) into cnt from public.collection where user_id = uid and line_id = line;
  bonus := not is_new and every > 0 and cnt % every = 0 and tk.special is null;
  if bonus then update public.profiles set evo_tickets = evo_tickets + 1 where user_id = uid; end if;
  update public.tickets set status = 'redeemed', redeemed_at = now(), booth_user = booth, result_species = sp,
         disguised_as = coalesce(disg, disguised_as), shiny = sh,
         catch_undo = jsonb_build_object('new', is_new, 'bonus', bonus, 'lv', 0, 'mon', c.id)
                      || case when up_lv is not null then jsonb_build_object('lvmon', up_mon, 'lvup', 1) else '{}'::jsonb end
   where id = tk.id;
  perform public._make_quiz(uid, line, tk.id);
  return jsonb_build_object(
    'nonce', tk.nonce, 'qr_name', (select name from public.qr_points where id = tk.qr_id),
    'species_id', sp, 'line_id', line, 'is_new', is_new, 'replay', false, 'bonus_ticket', bonus,
    'special', tk.special, 'rarity', (select rarity from public.lines where id = line),
    'mon_id', c.id, 'level', c.level, 'box', c.pos / 30 + 1, 'disguised_as', coalesce(disg, tk.disguised_as),
    'lv_up_mon', case when up_lv is not null then up_mon end, 'lv_up_level', up_lv, 'shiny', sh);
end $$;

-- ── 5. 사파리존: 상태에 unlocked · unlock, 걸음 · 방문은 2단계 뒤에만 (0048 그대로 + 줄 몇 개) ─────────────────────
create or replace function public.safari_visit(p_area text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); was boolean; nw boolean;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NO_PROFILE'; end if;
  if not public._safari_open() then raise exception 'SAFARI_CLOSED'; end if;
  if not public._unlock_mark(uid) then
    raise exception 'SAFARI_LOCKED_STUDENT' using detail = format('need=%s got=%s', public._unlock_progress(uid) ->> 'need', public._unlock_progress(uid) ->> 'got');
  end if;   -- 0051: 학교 도감을 더 모아야 열림
  if p_area is null or p_area not in ('beach', 'desert', 'snow', 'lava', 'plant', 'dragon') then raise exception 'BAD_AREA'; end if;
  was := public._dragon_open(uid);
  nw := public._safari_visit(uid, p_area);
  return jsonb_build_object('visited', public._safari_visited(uid), 'dragon', public._dragon_open(uid), 'new', nw,
                            'opened', not was and public._dragon_open(uid));
end $$;

create or replace function public.safari_state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  n := public._safari_expire(uid);
  perform public._unlock_mark(uid);   -- 0051
  perform public._quest_check(uid);
  return public._safari_json(uid) || jsonb_build_object('legends', public._quest_rows(uid), 'expired', n,
                                                         'visited', public._safari_visited(uid), 'dragon', public._dragon_open(uid),
                                                         'locked', not public._safari_open(),
                                                         'unlocked', public._unlocked(uid), 'unlock', public._unlock_json(uid));   -- 0051
end $$;

create or replace function public.safari_encounter(p_steps int, p_zone text default null, p_area text default null, p_dist int default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked(); uid uuid := p.user_id; ps timestamptz := public._safari_period(); r public.safari_days;
  sps numeric := greatest(1, coalesce((public._setting('safari_steps_per_sec'))::numeric, 10));
  minst int := greatest(0, coalesce((public._setting('safari_min_steps'))::int, 8));
  rate numeric := least(1, greatest(0, coalesce((public._setting('safari_encounter_rate'))::numeric, 0.12)));
  daily int := greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 20));
  z text := case when p_zone in ('grass', 'pond', 'cave', 'deep', 'ultra', 'beach', 'desert', 'snow', 'lava', 'plant', 'dragon') then p_zone else 'grass' end;
  secs numeric; acc int; left_b int; hit boolean := false; sinc int; wl int; wsp int; eid bigint; reason text; lv int;
begin
  if not public._safari_open() then raise exception 'SAFARI_CLOSED'; end if;   -- 0048: 운영자가 사파리존을 닫음
  if not public._unlock_mark(uid)
     and not exists (select 1 from public.raid_encounters where user_id = uid and kind = 'safari' and status = 'pending') then
    raise exception 'SAFARI_LOCKED_STUDENT' using detail = format('need=%s got=%s', public._unlock_progress(uid) ->> 'need', public._unlock_progress(uid) ->> 'got');
  end if;   -- 0051: 학교 도감을 더 모아야 열림
  if p_steps is null or p_steps < 0 or p_steps > 1000 then raise exception 'BAD_STEPS'; end if;
  if z = 'dragon' and not public._dragon_open(uid) then z := 'grass'; end if;      -- 0048: 용의 굴은 네 곳을 다녀온 뒤에만
  if z in ('beach', 'desert', 'snow', 'lava', 'plant', 'dragon') then perform public._safari_visit(uid, z); end if;
  perform public._safari_expire(uid);
  if exists (select 1 from public.raid_encounters where user_id = uid and kind = 'safari' and status = 'pending') then
    return jsonb_build_object('encounter', public._safari_json(uid) -> 'pending', 'accepted', 0, 'reason', 'pending', 'zone', z) || public._safari_json(uid);
  end if;
  insert into public.safari_days (user_id, day, period_start) values (uid, (ps at time zone 'Asia/Seoul')::date, ps) on conflict do nothing;
  select * into r from public.safari_days where user_id = uid and period_start = ps for update;
  secs := case when r.last_at is null then 3 else least(30, greatest(0, extract(epoch from now() - r.last_at))) end;
  acc := greatest(0, least(p_steps, floor(secs * sps)::int + 1));
  sinc := r.since;
  left_b := greatest(0, daily - r.balls_used);
  if left_b <= 0 then reason := 'no_balls';
  else
    for i in 1 .. acc loop
      sinc := sinc + 1;
      if sinc >= minst and random() < rate then hit := true; exit; end if;
    end loop;
  end if;
  if hit then
    wl := public._wild_line_zone(z);
    if wl is not null then select id into wsp from public.species where line_id = wl and stage = 1; end if;
    if wsp is null then hit := false; reason := 'empty_pool'; end if;
  end if;
  if hit then
    lv := case when z = 'ultra' and p_area is null then 50 else public._safari_level(z, p_area, p_dist) end;
    insert into public.raid_encounters (user_id, raid_id, species_id, balls, kind, zone, level)
    values (uid, null, wsp, least(20, left_b), 'safari', z, lv) returning id into eid;
    update public.safari_days set steps = steps + acc, since = 0, encounters = encounters + 1, last_at = now()
     where user_id = uid and period_start = ps;
  else
    update public.safari_days set steps = steps + acc, since = case when reason is null then sinc else since + acc end, last_at = now()
     where user_id = uid and period_start = ps;
  end if;
  return jsonb_build_object('encounter', case when hit then public._safari_json(uid) -> 'pending' end,
                            'accepted', acc, 'reason', reason, 'zone', z) || public._safari_json(uid);
end $$;

-- ── 6. sync 상태: unlock (0047 _state 그대로 + 'unlock') ─────────────────────────────────────────────────────
create or replace function public._state(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public._state_base(uid) || jsonb_build_object(
    'roulette', public._roulette_json(uid),
    'special', coalesce((select jsonb_agg(jsonb_build_object('nonce', t.nonce, 'special', t.special, 'species_id', t.fixed_species))
                         from public.tickets t where t.user_id = uid and t.status = 'pending' and t.special is not null), '[]'),
    'raids_live', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'species_id', r.species_id, 'ends_at', r.ends_at, 'shiny', r.shiny))
                            from public.raids r where r.status = 'active' and r.tv and r.ends_at > now()), '[]'),
    'notices', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'species_id', n.species_id, 'title', n.title,
                                                             'body', n.body, 'data', n.data, 'created_at', n.created_at) order by n.id)
                         from (select * from public.notices where user_id = uid and seen_at is null order by id limit 20) n), '[]'),
    'legends', public._quest_rows(uid),
    'roamers', public._roamers_json(uid),
    'gifts_open', public._gifts_open(uid),
    'disguised', coalesce((select jsonb_object_agg(t.nonce, t.disguised_as) from public.tickets t
                           where t.user_id = uid and t.disguised_as is not null and t.created_at > now() - interval '24 hours'), '{}'),
    -- 0042
    'shiny_t', coalesce((select jsonb_object_agg(t.nonce, true) from public.tickets t
                         where t.user_id = uid and t.shiny and t.redeemed_at > now() - interval '24 hours'), '{}'),
    'charm', public._has_charm(uid),
    'unlock', public._unlock_json(uid))   -- 0051: 해금 단계
$$;

-- ── 7. 운영자: 몇 명이 2단계를 열었나 ────────────────────────────────────────────────────────────────────────
create or replace function public.admin_unlock_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare total int := (select count(*) from public._school_keys());
begin
  perform public._assert_admin();
  return jsonb_build_object(
    'students', (select count(*) from public.profiles where role = 'student'),
    'unlocked', (select count(*) from public.profiles where role = 'student' and unlocked_at is not null),
    'all', public._unlock_all(), 'pct', public._unlock_pct(), 'total', total,
    'need', ceil(total * public._unlock_pct() / 100.0)::int,
    'minigame', coalesce((public._setting('minigame_unlock'))::int, 10));
end $$;

-- rule (0006): every migration that creates functions ends with this block (copied from 0049_core_fixes.sql + admin_unlock_stats();
--   helpers _unlock_* · _unlocked · _school_line · _draw_line(text, uuid) are internal, not granted)
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_code_account(text), public.create_number_account(text, text), public.request_password_reset(text, text, text, text),
  public.dev_create_account(text), public.sprite_overrides(), public.dev_fake_google(text, text), public.send_inquiry_public(text, text, text),
  public.create_id_account(text, text)
to anon, authenticated;
grant execute on function
  public.is_admin(), public.ensure_profile(), public.register_profile(text, text, text, boolean),
  public.link_number(text, text, text, boolean, boolean), public.link_id(text, text, text, boolean), public.send_inquiry(text),
  public.accept_terms(boolean), public.sync(jsonb, text), public.self_redeem(), public.answer_quiz(bigint, int),
  public.evolve(bigint, int), public.spin_roulette(), public.get_ranking(int), public.set_prefs(boolean, int), public.log_client_error(text),
  public.booth_lookup(text), public.booth_redeem(text), public.screen_feed(), public.screen_rotating_token(text),
  public.get_ranking_by(int, text), public.raid_join(text, text, bigint), public.raid_attack(bigint, int, bigint), public.raid_state(bigint), public.my_raids(),
  public.screen_raids(), public.raid_join_open(bigint, bigint), public.open_raids(),
  public.submit_minigame_score(text, int, int), public.minigame_ranking(text), public.claim_egg(text), public.set_partner(bigint), public.minigame_config(),
  public.battle_code(text, boolean), public.battle_peek(text), public.battle_set_team(bigint[]), public.battle_start_cpu(bigint[], text, boolean),
  public.battle_start_team(text, bigint[]), public.battle_challenge(text, bigint[]), public.battle_inbox(), public.battle_accept(bigint, bigint[]),
  public.battle_decline(bigint), public.battle_state(bigint), public.battle_act(bigint, jsonb), public.battle_forfeit(bigint), public.battle_today(),
  public.battle_recent(),
  public.bag_state(bigint), public.bag_set_moves(bigint, int[]), public.bag_set_held(bigint, text), public.bag_use(text, bigint),
  public.mon_release(bigint), public.box_move(bigint, int),
  public.egg_state(), public.egg_incubate(bigint), public.egg_add_steps(int), public.egg_hatch(bigint), public.set_shiny(bigint, boolean),
  public.set_class(int, text), public.class_ranking(), public.achievements(), public.claim_achievement(text),
  public.admin_create_qr(text, text, text, text), public.admin_rotate_qr(text, boolean), public.admin_cancel_ticket(text),
  public.admin_set_role(text, text), public.admin_adjust_tickets(text, int), public.admin_unlink(text), public.admin_stats(),
  public.admin_make_login_codes(text[], text[]), public.admin_export_ranking(), public.admin_relink(text, text),
  public.admin_grant_monster(text, int, int), public.admin_set_in_ranking(text, boolean), public.admin_list_staff(),
  public.admin_invite_staff(text, text), public.admin_remove_staff(text), public.admin_list_requests(),
  public.admin_decide_reset(bigint, boolean), public.admin_set_inquiry(bigint, boolean),
  public.admin_create_raid(int, int, int, boolean, text, text, boolean), public.admin_end_raid(bigint), public.admin_list_raids(), public.admin_set_raid_open(bigint, boolean),
  public.admin_delete_students(text[], text), public.admin_count_students(),
  public.admin_create_staff_login(text, text, text), public.admin_reset_staff_password(text),
  public.admin_list_staff_logins(), public.admin_remove_staff_login(text),
  public.admin_game_stats(), public.admin_give_item(text, text, int), public.admin_set_level(text, int, int),
  public.admin_minigame_overview(), public.admin_minigame_scores(text, int), public.admin_delete_minigame_scores(text, text), public.admin_reset_minigame(text, text),
  public.admin_give_egg(text, text, int), public.admin_set_class(text, int, text), public.admin_assign_teacher(int, int),
  public.catch_bonus(text, text, boolean),
  public.catch_config(), public.catch_result(text, text, boolean, boolean), public.my_encounters(),
  public.encounter_result(bigint, boolean, text, boolean),
  public.safari_state(), public.safari_encounter(int, text, text, int), public.safari_result(bigint, int, boolean, text, boolean), public.safari_turn(bigint),
  -- 0038
  public.safari_throws(bigint, int), public.notice_seen(bigint[]), public.gift_claim(text),
  public.legend_encounter(int), public.legend_result(bigint, boolean, text, boolean),
  public.admin_create_gift(text, text, int, text, int, timestamptz, timestamptz, int), public.admin_list_gifts(), public.admin_set_gift(bigint, boolean),
  public.admin_delete_gift(bigint), public.admin_encounter_age(bigint, int),
  public.admin_roam_spots(timestamptz),
  public.my_abilities(), public.admin_bt_sim(jsonb),
  -- 0041
  public.set_nickname(text), public.admin_clear_nickname(text),
  -- 0048
  public.safari_visit(text),
  -- 0051
  public.admin_unlock_stats()
to authenticated;
notify pgrst, 'reload schema';
