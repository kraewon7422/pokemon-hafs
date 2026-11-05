-- 0040: 사파리존 v3 — 하루 만남 상한 없앰 · 걸음 속도 제한 올림 (앱이 1.6배 빨리 걸음) · 해변 구역 · 사는 곳 (서식지) ·
--   야생 레벨 5..50 (입구에서 멀수록 · 깊을수록) · 같은 계열을 또 잡으면 가장 레벨 높은 한 마리 +1 · 사파리볼 충전 30분 (기본).
--  A. 만남 상한: safari_daily_max_encounters 설정을 지우고 safari_encounter 의 'max' 이유를 없앰. 만남이 안 나오는 이유는
--     'no_balls' (볼을 다 씀) · 'pending' (끝내지 않은 만남) · 'empty_pool' 뿐. safari_json 에서 max_encounters 를 뺌 (encounters_today 는 기록용으로 남김).
--  B. 걸음 속도: safari_steps_per_sec 기본 6 → 10 (앱은 한 칸 165ms ≈ 6걸음/초).
--  C. 구역 (p_zone): grass · pond (물가 풀숲) · cave · deep · ultra · beach (해변). 사는 곳 규칙 (_habitat_ok):
--     beach = 물·얼음 타입 · pond = 물 타입 (얼음 빼고, 3배 자주) + 풀숲 포켓몬 · cave = 바위·땅·고스트·독·악·강철·격투·드래곤 (첫 타입이 물·얼음이면 뺌) ·
--     grass = 노말·벌레·풀·비행·전기·페어리·에스퍼·불꽃 (물·얼음 타입 뺌) · deep = 모두 · ultra = 울트라비스트만. 고를 게 없으면 예전 _wild_line.
--  D. 레벨: safari_encounter(p_steps, p_zone, p_area, p_dist) — p_area = 앱의 지도 id, p_dist = 지도 입구에서 걸어온 칸 수.
--     서버가 설정 safari_level_bands {지도: [최소, 최대, 거리(0 = 무작위), "구역들"]} 로 정함: 거리 / 최대 거리 만큼 최소 → 최대 (±1).
--     지도가 없거나 구역과 안 맞으면 그 구역의 가장 낮은 최소 레벨 (입구에서 Lv.50 을 달라고 해도 안 됨). raid_encounters.level 에 적고
--     잡으면 (encounter_result) 그 레벨로 박스에 들어감. 레벨이 높을수록 조금 더 잘 도망감 (safari_flee_level, Lv.50 에서 +10%).
--  E. 같은 계열을 또 잡으면 (_redeem_ticket): 이미 가진 그 계열 중 레벨이 가장 높은 한 마리 +1 (최대 100, lv_from_catch 가 켜져 있을 때).
--     0036 부터 잡을 때마다 새 한 마리가 생겨 catch_count 로 올리던 예전 규칙이 안 먹었음. 부스 잡기에서 도망치면 (catch_result) 되돌림.
--  F. 사파리볼 충전 주기 safari_reset_hours: 소수 허용 (0.25 ~ 24 시간), 기본 0.5 (30분). 서울 00:00 부터 그 분마다.

-- ── 1. 설정 · 열 ─────────────────────────────────────────────────────────────────────────────────────────────
insert into public.settings (key, value) values
  ('safari_flee_level', '0.1'),
  ('safari_level_bands', '{
    "safari": [5, 16, 45, "grass,pond"],
    "beach": [10, 50, 58, "beach"],
    "shoal1": [14, 20, 0, "cave"], "shoal2": [19, 26, 0, "cave"], "shoal3": [25, 33, 0, "cave"], "shoal4": [40, 50, 0, "cave"],
    "maze1": [15, 21, 0, "cave"], "maze2": [21, 28, 0, "cave"], "maze3": [28, 36, 0, "cave"], "maze4": [42, 50, 0, "cave"],
    "deep1": [17, 24, 0, "cave"], "deep2": [25, 34, 0, "cave"], "deep3": [36, 50, 0, "cave"],
    "deepPond": [32, 42, 0, "deep"], "skyHill": [36, 46, 0, "deep"],
    "ultra": [45, 50, 0, "ultra"]}')
on conflict (key) do nothing;
insert into public.settings (key, value) values ('safari_reset_hours', '0.5') on conflict (key) do nothing;
update public.settings set value = '0.5' where key = 'safari_reset_hours';
update public.settings set value = '10' where key = 'safari_steps_per_sec' and (value #>> '{}')::numeric < 10;
delete from public.settings where key = 'safari_daily_max_encounters';

alter table public.raid_encounters add column if not exists level int;

-- ── 2. 충전 주기 (소수 시간) ──────────────────────────────────────────────────────────────────────────────────
drop function if exists public._safari_hours() cascade;
create or replace function public._safari_hours() returns numeric
language sql stable security definer set search_path = '' as $$
  select least(24, greatest(0.25, coalesce((public._setting('safari_reset_hours') #>> '{}')::numeric, 0.5)))
$$;
create or replace function public._safari_minutes() returns int
language sql stable security definer set search_path = '' as $$
  select greatest(15, round(public._safari_hours() * 60)::int)
$$;
-- p_at 이 속한 충전 구간의 시작 (서울 그날 00:00 + 주기 분의 배수)
create or replace function public._safari_period(p_at timestamptz default now()) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select (date_trunc('day', p_at at time zone 'Asia/Seoul')
          + make_interval(mins => (floor((extract(hour from p_at at time zone 'Asia/Seoul') * 60 + extract(minute from p_at at time zone 'Asia/Seoul'))
                                         / public._safari_minutes()) * public._safari_minutes())::int))
         at time zone 'Asia/Seoul'
$$;
create or replace function public._safari_next_reset(p_at timestamptz default now()) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select least(public._safari_period(p_at) + make_interval(mins => public._safari_minutes()),
               (date_trunc('day', p_at at time zone 'Asia/Seoul') + interval '1 day') at time zone 'Asia/Seoul')
$$;

-- ── 3. 사는 곳 · 구역별 포켓몬 ────────────────────────────────────────────────────────────────────────────────
create or replace function public._habitat_ok(p_zone text, p_btype text) returns boolean
language sql immutable set search_path = '' as $$
  with t as (select string_to_array(coalesce(p_btype, ''), '/') a)
  select case p_zone
    when 'beach' then a && array['물', '얼음']
    when 'pond' then ('물' = any (a) and not ('얼음' = any (a)))
                     or (a && array['노말', '벌레', '풀', '비행', '전기', '페어리', '에스퍼', '불꽃'] and not a && array['물', '얼음'])
    when 'cave' then a && array['바위', '땅', '고스트', '독', '악', '강철', '격투', '드래곤'] and coalesce(a[1], '') not in ('물', '얼음')
    when 'grass' then a && array['노말', '벌레', '풀', '비행', '전기', '페어리', '에스퍼', '불꽃'] and not a && array['물', '얼음']
    else true end
  from t
$$;

-- 사는 곳은 만나는 모습 (1단계 종) 의 타입으로 (계열 타입은 이브이 = 물 처럼 진화형일 수 있음)
create or replace function public._line_btype1(p_line int) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.btype from public.species s where s.line_id = p_line and s.stage = 1 order by s.id limit 1),
                  (select l.btype from public.lines l where l.id = p_line))
$$;

create or replace function public._wild_line_zone(p_zone text) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare r int;
begin
  if p_zone = 'ultra' then
    return (select l.id from public.lines l where l.ultra and l.active and not l.withdrawn order by random() limit 1);
  end if;
  select l.id into r from public.lines l
   where l.subject = '야생' and l.active and not l.withdrawn and not l.bonus and not l.secret and not l.mythic
     and not l.ultra and l.legend_src is null
     and coalesce((public._setting('wild_weights') ->> l.rarity)::numeric, 0) > 0
     and public._habitat_ok(case when p_zone = 'deep' then null else p_zone end, public._line_btype1(l.id))
   order by -ln(1 - random()) / ((public._setting('wild_weights') ->> l.rarity)::numeric
             * case when p_zone = 'pond' and '물' = any (string_to_array(coalesce(public._line_btype1(l.id), ''), '/')) then 3 else 1 end)
   limit 1;
  return coalesce(r, public._wild_line());
end $$;

-- ── 4. 야생 레벨 (서버가 정함) ────────────────────────────────────────────────────────────────────────────────
create or replace function public._safari_level(p_zone text, p_area text, p_dist int) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare bands jsonb := coalesce(public._setting('safari_level_bands'), '{}'); b jsonb; lo int; hi int; dmax numeric; lv int;
begin
  b := case when p_area is null then null else bands -> p_area end;
  if b is null or jsonb_typeof(b) <> 'array' or not (p_zone = any (string_to_array(coalesce(b ->> 3, ''), ','))) then
    select min((v ->> 0)::int) into lo from jsonb_each(bands) e(k, v)
     where jsonb_typeof(v) = 'array' and p_zone = any (string_to_array(coalesce(v ->> 3, ''), ','));
    return least(100, greatest(1, coalesce(lo, 5)));
  end if;
  lo := least(100, greatest(1, coalesce((b ->> 0)::int, 5)));
  hi := least(100, greatest(lo, coalesce((b ->> 1)::int, lo)));
  dmax := coalesce((b ->> 2)::numeric, 0);
  if dmax > 0 then
    lv := lo + round((hi - lo) * least(1, greatest(0, coalesce(p_dist, 0)) / dmax))::int + floor(random() * 3)::int - 1;
  else
    lv := lo + floor(random() * (hi - lo + 1))::int;
  end if;
  return least(hi, greatest(lo, lv));
end $$;

-- n 번째로 놓친 공 (0부터) 뒤에 도망칠 확률 (0037) + 레벨이 높을수록 조금 더 (Lv.5 = 0 … Lv.50 = safari_flee_level)
create or replace function public._safari_flee_p(p_species int, n int, p_level int) returns numeric
language sql stable security definer set search_path = '' as $$
  select least(greatest(0, coalesce((public._setting('safari_flee_max'))::numeric, 0.9)),
               public._safari_flee_p(p_species, n)
               + greatest(0, coalesce((public._setting('safari_flee_level'))::numeric, 0.1)) * least(1, greatest(0, coalesce(p_level, 5) - 5) / 45.0))
$$;

-- ── 5. 사파리 상태 (만남 상한 없음 · 만남 레벨) ───────────────────────────────────────────────────────────────
create or replace function public._safari_json(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'balls_daily', greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 20)),
    'balls_left', greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 20) - coalesce(d.balls_used, 0)),
    'max_balls', greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 20)),
    'balls', greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 20) - coalesce(d.balls_used, 0)),
    'reset_hours', public._safari_hours(), 'reset_minutes', public._safari_minutes(),
    'period_start', public._safari_period(), 'next_reset_at', public._safari_next_reset(),
    'encounters_today', coalesce(d.encounters, 0),
    'steps_today', coalesce(d.steps, 0),
    'settings', jsonb_build_object(
      'min_steps', greatest(0, coalesce((public._setting('safari_min_steps'))::int, 8)),
      'flee', coalesce((public._setting('safari_flee'))::numeric, 0.25),
      'flee_step', coalesce((public._setting('safari_flee_step'))::numeric, 0.05),
      'flee_legend', coalesce((public._setting('safari_flee_legend'))::numeric, 0.15),
      'flee_max', coalesce((public._setting('safari_flee_max'))::numeric, 0.9)),
    'pending', (select jsonb_build_object('id', e.id, 'species_id', e.species_id, 'balls', e.balls, 'kind', e.kind, 'created_at', e.created_at,
                                          'turns', e.turns, 'level', e.level, 'zone', e.zone,
                                          'flee_now', public._safari_flee_p(e.species_id, e.turns, e.level))
                  from public.raid_encounters e where e.user_id = uid and e.kind = 'safari' and e.status = 'pending'
                 order by e.id limit 1))
  from (select 1) one
  left join public.safari_days d on d.user_id = uid and d.period_start = public._safari_period()
$$;

-- ── 6. 걸음 → 만남 ────────────────────────────────────────────────────────────────────────────────────────────
drop function if exists public.safari_encounter(int, text);
create or replace function public.safari_encounter(p_steps int, p_zone text default null, p_area text default null, p_dist int default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked(); uid uuid := p.user_id; ps timestamptz := public._safari_period(); r public.safari_days;
  sps numeric := greatest(1, coalesce((public._setting('safari_steps_per_sec'))::numeric, 10));
  minst int := greatest(0, coalesce((public._setting('safari_min_steps'))::int, 8));
  rate numeric := least(1, greatest(0, coalesce((public._setting('safari_encounter_rate'))::numeric, 0.12)));
  daily int := greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 20));
  z text := case when p_zone in ('grass', 'pond', 'cave', 'deep', 'ultra', 'beach') then p_zone else 'grass' end;   -- 앱이 알려 준 구역 (레벨은 구역별 범위 안에서만)
  secs numeric; acc int; left_b int; hit boolean := false; sinc int; wl int; wsp int; eid bigint; reason text; lv int;
begin
  if p_steps is null or p_steps < 0 or p_steps > 1000 then raise exception 'BAD_STEPS'; end if;
  perform public._safari_expire(uid);
  if exists (select 1 from public.raid_encounters where user_id = uid and kind = 'safari' and status = 'pending') then
    return jsonb_build_object('encounter', public._safari_json(uid) -> 'pending', 'accepted', 0, 'reason', 'pending', 'zone', z) || public._safari_json(uid);
  end if;
  insert into public.safari_days (user_id, day, period_start) values (uid, (ps at time zone 'Asia/Seoul')::date, ps) on conflict do nothing;
  select * into r from public.safari_days where user_id = uid and period_start = ps for update;
  -- 걸음 속도 제한: 지난번부터 지난 시간 × 초당 걸음 (+1), 처음엔 3초로 봄, 30초까지만 모아 둠
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

-- 공을 놓칠 때마다 도망 판정 (0037 + 레벨)
create or replace function public.safari_turn(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; e public.raid_encounters; pr numeric; res jsonb;
begin
  select * into e from public.raid_encounters where id = p_id and user_id = uid and kind = 'safari' and status = 'pending' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.turns >= e.balls then raise exception 'NO_BALLS'; end if;
  pr := public._safari_flee_p(e.species_id, e.turns, e.level);
  update public.raid_encounters set turns = turns + 1 where id = e.id;
  if random() < pr then
    update public.raid_encounters set throws = e.turns + 1 where id = e.id;
    res := public.encounter_result(p_id, false, 'none', false);
    return res || jsonb_build_object('turn', e.turns + 1, 'rate', pr, 'safari', public._safari_json(uid));
  end if;
  return jsonb_build_object('fled', false, 'turn', e.turns + 1, 'rate', pr,
                            'next_rate', public._safari_flee_p(e.species_id, e.turns + 1, e.level));
end $$;

create or replace function public.safari_result(p_id bigint, p_throws int, p_caught boolean, p_grade text default 'none', p_curve boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; e public.raid_encounters; res jsonb;
  th int; caught boolean := coalesce(p_caught, true); k int; server_fled boolean := false;
begin
  select * into e from public.raid_encounters where id = p_id and user_id = uid and kind = 'safari' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.status <> 'pending' then
    return coalesce(e.result, jsonb_build_object('caught', e.status = 'caught', 'fled', e.status = 'fled',
                                                 'line', (select line_id from public.species where id = e.species_id),
                                                 'species_id', e.species_id, 'new', false, 'level', null, 'exp', 0))
           || jsonb_build_object('safari', public._safari_json(uid), 'replay', true);
  end if;
  th := least(e.balls, greatest(0, coalesce(p_throws, e.balls)));
  if caught and th - 1 > e.turns then
    for k in e.turns .. th - 2 loop
      if random() < public._safari_flee_p(e.species_id, k, e.level) then caught := false; server_fled := true; th := k + 1; exit; end if;
    end loop;
  end if;
  update public.raid_encounters set throws = th, turns = greatest(turns, th - case when caught then 1 else 0 end) where id = e.id;
  res := public.encounter_result(p_id, caught, p_grade, p_curve);
  return res || jsonb_build_object('safari', public._safari_json(uid), 'server_fled', server_fled);
end $$;

-- ── 7. 만남 결과 (0038 + 야생 레벨) ───────────────────────────────────────────────────────────────────────────
create or replace function public.encounter_result(p_id bigint, p_caught boolean, p_grade text default 'none', p_curve boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; e public.raid_encounters; tk public.tickets;
  res jsonb; caught boolean := coalesce(p_caught, true); g text := coalesce(p_grade, 'none'); amt int; c public.collection; v_line int;
  used int; v_mon bigint; sp int; disg int; out jsonb;
begin
  if g not in ('none', 'nice', 'great', 'excellent') then raise exception 'BAD_GRADE'; end if;
  select * into e from public.raid_encounters where id = p_id and user_id = uid and status = 'pending' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not caught and e.kind = 'raid' and not coalesce((public._setting('raid_catch_flee'))::boolean, true) then caught := true; end if;
  if caught and public._box_count(uid) >= public._box_max() then raise exception 'BOX_FULL'; end if;
  if e.kind = 'safari' then
    used := least(e.balls, greatest(case when caught then 1 else 0 end, coalesce(e.throws, e.balls)));
    insert into public.safari_days (user_id, day, period_start, balls_used)
    values (uid, (public._safari_period(e.created_at) at time zone 'Asia/Seoul')::date, public._safari_period(e.created_at), used)
      on conflict (user_id, period_start) do update set balls_used = public.safari_days.balls_used + excluded.balls_used;
    update public.raid_encounters set throws = used where id = e.id;
  end if;
  select line_id into v_line from public.species where id = e.species_id;
  if not caught then
    out := jsonb_build_object('caught', false, 'fled', true, 'line', v_line, 'species_id', e.species_id, 'new', false, 'level', null, 'exp', 0);
    update public.raid_encounters set status = 'fled', resolved_at = now(), grade = 'none', result = out where id = e.id;
    return out;
  end if;
  sp := e.species_id;
  if e.kind in ('wild', 'safari') then
    disg := public._ditto_roll(v_line);
    if disg is not null then sp := disg; disg := e.species_id; end if;
  end if;
  insert into public.tickets (nonce, user_id, qr_id, token, special, fixed_species, disguised_as)
  values (public._rand(12, 'abcdefghijklmnopqrstuvwxyz0123456789'), uid,
          case e.kind when 'wild' then 'WILD' when 'safari' then 'SAFARI' when 'legend' then 'LEGEND' when 'roam' then 'ROAM' else 'RAID' end,
          e.kind, e.kind, sp, disg)
  returning * into tk;
  res := public._redeem_ticket(uid, null, tk);
  if res ->> 'error' = 'box_full' then raise exception 'BOX_FULL'; end if;
  v_line := (res ->> 'line_id')::int;
  v_mon := (res ->> 'mon_id')::bigint;
  -- 0040: 사파리 야생 레벨 그대로 박스에 (만날 때 서버가 정한 레벨)
  if e.level is not null then
    update public.collection set level = least(100, greatest(1, e.level)), exp = 0, updated_at = now() where id = v_mon and user_id = uid;
  end if;
  amt := public._catch_exp(g, p_curve);
  update public.tickets set catch_grade = g where id = tk.id;
  perform public._gain_exp(uid, v_mon, amt);
  perform public._recompute(uid);
  select * into c from public.collection where id = v_mon;
  out := jsonb_build_object('caught', true, 'fled', false, 'line', v_line, 'species_id', sp,
                            'new', coalesce((res ->> 'is_new')::boolean, false), 'level', c.level, 'exp', amt,
                            'nonce', tk.nonce, 'mon', v_mon, 'box', c.pos / 30 + 1,
                            'ditto', disg is not null, 'disguised_as', disg,
                            'lv_up_mon', (res ->> 'lv_up_mon')::bigint, 'lv_up_level', (res ->> 'lv_up_level')::int);
  update public.raid_encounters set status = 'caught', resolved_at = now(), grade = g, result = out where id = e.id;
  return out;
end $$;

-- ── 8. 잡기 (0038) + 같은 계열을 또 잡으면 가장 레벨 높은 한 마리 +1 ─────────────────────────────────────────
create or replace function public._redeem_ticket(uid uuid, booth uuid, tk public.tickets) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  line int; sp int; stg int; is_new boolean; cnt int; bonus boolean; c public.collection; disg int; orig int;
  every int := coalesce((public._setting('dup_bonus_every'))::int, 0);
  up_mon bigint; up_lv int;
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
    line := public._draw_line(tk.qr_id);
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
  -- 0040: 또 잡음 → 이미 가진 그 계열에서 레벨이 가장 높은 (같으면 먼저 잡은) 한 마리 +1
  if not is_new and public._lv_on('lv_from_catch') then
    select x.id into up_mon from public.collection x
     where x.user_id = uid and x.line_id = line and x.released_at is null and x.level < 100
     order by x.level desc, x.id limit 1;
    if up_mon is not null then up_lv := public._add_levels(uid, up_mon, 1); end if;
  end if;
  c := public._mon_new(uid, line, stg);
  select coalesce(sum(catch_count), 0) into cnt from public.collection where user_id = uid and line_id = line;
  bonus := not is_new and every > 0 and cnt % every = 0 and tk.special is null;
  if bonus then update public.profiles set evo_tickets = evo_tickets + 1 where user_id = uid; end if;
  update public.tickets set status = 'redeemed', redeemed_at = now(), booth_user = booth, result_species = sp,
         disguised_as = coalesce(disg, disguised_as),
         catch_undo = jsonb_build_object('new', is_new, 'bonus', bonus, 'lv', 0, 'mon', c.id)
                      || case when up_lv is not null then jsonb_build_object('lvmon', up_mon, 'lvup', 1) else '{}'::jsonb end
   where id = tk.id;
  perform public._make_quiz(uid, line, tk.id);
  return jsonb_build_object(
    'nonce', tk.nonce, 'qr_name', (select name from public.qr_points where id = tk.qr_id),
    'species_id', sp, 'line_id', line, 'is_new', is_new, 'replay', false, 'bonus_ticket', bonus,
    'special', tk.special, 'rarity', (select rarity from public.lines where id = line),
    'mon_id', c.id, 'level', c.level, 'box', c.pos / 30 + 1, 'disguised_as', coalesce(disg, tk.disguised_as),
    'lv_up_mon', case when up_lv is not null then up_mon end, 'lv_up_level', up_lv);
end $$;

-- ── 9. 부스 잡기 결과 (0036) + 도망치면 또 잡기 레벨도 되돌림 ──────────────────────────────────────────────
create or replace function public.catch_result(p_nonce text, p_grade text, p_curve boolean default false, p_fled boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; t public.tickets; v_line int;
  amt int; up int; c public.collection; u jsonb; was_new boolean; had_bonus boolean; lv int; removed boolean := false; v_mon bigint;
  every int := coalesce((public._setting('dup_bonus_every'))::int, 0);
begin
  if p_grade is null or p_grade not in ('none', 'nice', 'great', 'excellent') then raise exception 'BAD_GRADE'; end if;
  select * into t from public.tickets where nonce = p_nonce and user_id = uid for update;
  if not found or t.status <> 'redeemed' or t.result_species is null then raise exception 'NOT_FOUND'; end if;
  if t.catch_grade is not null then raise exception 'ALREADY_CLAIMED'; end if;
  select line_id into v_line from public.species where id = t.result_species;
  v_mon := public._ticket_mon(uid, t);

  if not coalesce(p_fled, false) then
    amt := public._catch_exp(p_grade, p_curve);
    update public.tickets set catch_grade = p_grade where id = t.id;
    up := public._gain_exp(uid, v_mon, amt);
    return jsonb_build_object('fled', false, 'grade', p_grade, 'exp', amt, 'levels', coalesce(up, 0), 'line', v_line, 'mon', v_mon,
                              'level', (select level from public.collection where id = v_mon));
  end if;

  -- 도망: 이 티켓으로 받은 것을 되돌림
  u := t.catch_undo;
  if (u ->> 'lvmon') is not null then   -- 0040: 또 잡아서 올려 준 레벨도 되돌림
    update public.collection set level = greatest(1, level - coalesce((u ->> 'lvup')::int, 1)), updated_at = now()
     where id = (u ->> 'lvmon')::bigint and user_id = uid;
  end if;
  if u ? 'mon' then
    -- 0036: 이 티켓으로 생긴 그 한 마리를 지움 (지닌 물건은 가방으로)
    select * into c from public.collection where id = (u ->> 'mon')::bigint and user_id = uid for update;
    if found then
      if c.held is not null and c.released_at is null then
        insert into public.inventory (user_id, item, qty) values (uid, c.held, 1)
          on conflict (user_id, item) do update set qty = public.inventory.qty + 1;
      end if;
      delete from public.collection where id = c.id;
      update public.profiles
         set team_mons = case when team_mons is null then null else nullif(array_remove(team_mons, c.id), '{}'::bigint[]) end,
             partner_mon = case when partner_mon = c.id then null else partner_mon end
       where user_id = uid;
    end if;
    if coalesce((u ->> 'bonus')::boolean, false) then
      update public.profiles set evo_tickets = evo_tickets - 1 where user_id = uid and evo_tickets >= 1;
    end if;
    removed := not exists (select 1 from public.collection where user_id = uid and line_id = v_line);
  else
    -- 0036 전에 받은 티켓: 예전 규칙 (그 계열의 한 마리에서)
    select * into c from public.collection where user_id = uid and line_id = v_line and released_at is null order by id limit 1 for update;
    if found then
      if u is null then   -- 0030 전에 받은 티켓
        was_new := c.catch_count <= 1 and not c.from_egg;
        had_bonus := not was_new and every > 0 and c.catch_count % every = 0 and t.special is null;
        lv := 0;
      else
        was_new := coalesce((u ->> 'new')::boolean, false);
        had_bonus := coalesce((u ->> 'bonus')::boolean, false);
        lv := coalesce((u ->> 'lv')::int, 0);
      end if;
      if was_new then
        delete from public.collection where id = c.id;
        update public.profiles
           set team_mons = case when team_mons is null then null else nullif(array_remove(team_mons, c.id), '{}'::bigint[]) end,
               partner_mon = case when partner_mon = c.id then null else partner_mon end
         where user_id = uid;
        removed := not exists (select 1 from public.collection where user_id = uid and line_id = v_line);
      else
        update public.collection
           set catch_count = greatest(1, catch_count - 1), level = greatest(1, level - lv), updated_at = now()
         where id = c.id;
        if had_bonus then
          update public.profiles set evo_tickets = evo_tickets - 1 where user_id = uid and evo_tickets >= 1;
        end if;
      end if;
    end if;
  end if;
  delete from public.quiz_attempts where ticket_id = t.id and user_id = uid and answered_at is null;
  update public.tickets set catch_grade = 'none', fled = true where id = t.id;
  perform public._recompute(uid);
  perform public._dex_unreward(uid);
  insert into public.events (user_id, kind, data) values (uid, 'catch_fled', jsonb_build_object('nonce', t.nonce, 'line', v_line, 'removed', removed));
  return jsonb_build_object('fled', true, 'line', v_line, 'removed', removed);
end $$;


-- rule (0006): every migration that creates functions ends with this block (copied from 0038_legends.sql + 0039)
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
  public.admin_create_raid(int, int, int, boolean, text, text), public.admin_end_raid(bigint), public.admin_list_raids(), public.admin_set_raid_open(bigint, boolean),
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
  public.my_abilities(), public.admin_bt_sim(jsonb)
to authenticated;
notify pgrst, 'reload schema';
