-- 0013: 레이드 + 특별 티켓 (레이드 보상 / 도감 50%·100% 보상)
--
--  특별 티켓 (tickets.special): 정해진 몬스터(fixed_species)를 주는 티켓. 가방 5개 제한·24시간 만료에 걸리지 않고,
--    부스에서는 보통 티켓처럼 몬스터로 바뀐다. 가짜 장소 RAID / DX50 / DX99 에 묶인다 (지도·스캔 불가).
--  레이드 (raids): 보스 체력을 참가자 모두가 함께 깎는다.
--    · 참가 = 레이드 QR (q = 'R'||id, t = 토큰). TV 레이드는 30초마다 바뀌는 토큰 → 현장에 있어야 참가.
--    · 공격 = 폰이 탭 수를 4초마다 모아서 보냄 (raid_attack). 서버가 1초 8탭까지만 인정, 데미지 = 탭 × 탭당 데미지
--      (내 몬스터의 Lv.50 공격/특수공격 ÷ 보스 방어/특수방어 × 상성 × 10).
--    · 체력 0 → 승리, 탭을 raid_min_taps 이상 한 참가자 모두 보스 몬스터 특별 티켓. 시간 끝 → 실패.
--    · 종류: admin (운영자가 아무 몬스터로), legend (교장·교감, TV), slot (아침·점심·저녁 전설, TV 화면이 시간대에 자동 생성).
--  도감 보상: 도감(보너스 몬스터 제외) 50% → 과연기, 100% → 창문기 특별 티켓 (한 번씩).

alter table public.tickets add column if not exists special text check (special in ('raid', 'dex50', 'dex100'));
alter table public.tickets add column if not exists fixed_species int references public.species;
drop index if exists public.tickets_one_pending;
create unique index tickets_one_pending on public.tickets (user_id, qr_id) where status = 'pending' and special is null;

insert into public.qr_points (id, name, hint, kind, visible_on_map, active, daily_cap) values
  ('RAID', '★ 레이드 보상', '', 'static', false, false, null),
  ('DX50', '★ 도감 50% 보상', '', 'static', false, false, null),
  ('DX99', '★ 도감 완성 보상', '', 'static', false, false, null)
on conflict (id) do nothing;

insert into public.settings (key, value) values
  ('raid_slots', '[{"line": 38, "from": "09:00", "until": "11:00"}, {"line": 39, "from": "12:00", "until": "13:30"}, {"line": 40, "from": "16:00", "until": "18:00"}]'),
  ('raid_slot_minutes', '10'),        -- 시간대 레이드 한 판 길이
  ('raid_slot_hp', '20000'),          -- 시간대 레이드 보스 체력
  ('raid_cooldown_min', '5'),         -- 시간대 레이드: 끝나고 다음 판까지
  ('raid_tap_cap', '8'),              -- 1초에 인정하는 탭 수
  ('raid_min_taps', '10'),            -- 보상 받으려면 최소 탭 수
  ('dex_rewards', '{"50": 41, "100": 42}')
on conflict (key) do nothing;

create table if not exists public.raids (
  id          bigint generated always as identity primary key,
  species_id  int not null references public.species,
  kind        text not null default 'admin' check (kind in ('admin', 'legend', 'slot')),
  title       text not null default '',
  tv          boolean not null default true,        -- TV 대형 화면에 띄움 (토큰이 30초마다 바뀜)
  token       text not null,
  hp_max      int not null check (hp_max > 0),
  hp          int not null,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz not null,
  status      text not null default 'active' check (status in ('active', 'won', 'failed')),
  ended_at    timestamptz,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists raids_active on public.raids (status, ends_at);
create table if not exists public.raid_players (
  raid_id     bigint not null references public.raids on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  line_id     int references public.lines,
  damage      int not null default 0,
  taps        int not null default 0,
  joined_at   timestamptz not null default now(),
  last_tap_at timestamptz,
  rewarded    boolean not null default false,
  primary key (raid_id, user_id)
);
alter table public.raids enable row level security;           -- functions only
alter table public.raid_players enable row level security;

-- ───────── 특별 티켓 ─────────
create or replace function public._grant_special(uid uuid, sp int, kind text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tickets (nonce, user_id, qr_id, token, special, fixed_species)
  values (public._rand(12, 'abcdefghijklmnopqrstuvwxyz0123456789'), uid,
          case kind when 'raid' then 'RAID' when 'dex50' then 'DX50' else 'DX99' end,
          kind, kind, sp);
end $$;

-- 0003 _admit + 가방 제한은 보통 티켓만
create or replace function public._admit(uid uuid, n text, q text, t text, scanned timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare
  existing public.tickets;
  real_q text;
  cap int;
begin
  n := lower(n);
  if n is null or n !~ '^[a-z0-9]{12}$' or q is null or t is null then return 'bad_format'; end if;
  q := case when q in ('_', '-') then '_' else upper(q) end;
  t := case when q = '_' then upper(t) else lower(t) end;

  select * into existing from public.tickets where nonce = n;
  if found then
    if existing.user_id <> uid then return 'nonce_conflict'; end if;
    return 'ok';
  end if;

  if q = '_' and (select count(*) from public.code_failures where user_id = uid and at > now() - interval '10 minutes') >= 10 then
    return 'locked';
  end if;
  real_q := public._resolve_token(q, t);
  if real_q is null then
    if q = '_' then insert into public.code_failures (user_id) values (uid); end if;
    return 'invalid_token';
  end if;
  if q = '_' then
    select s.token into t from public.qr_secrets s where s.manual_code = t;
  end if;

  select coalesce(daily_cap, (public._setting('qr_daily_cap'))::int) into cap from public.qr_points where id = real_q;
  if exists (select 1 from public.tickets where user_id = uid and qr_id = real_q and status = 'pending') then
    return 'already_pending';
  end if;
  if (select count(*) from public.tickets where user_id = uid and qr_id = real_q
        and status in ('pending', 'redeemed') and created_at >= public._today_start()) >= cap then
    return 'daily_cap';
  end if;
  if (select count(*) from public.tickets where user_id = uid and status = 'pending' and special is null)
     >= (public._setting('bag_max'))::int then
    return 'bag_full';
  end if;

  insert into public.tickets (nonce, user_id, qr_id, token, scanned_at)
  values (n, uid, real_q, t, least(coalesce(scanned, now()), now()));
  return 'ok';
end $$;

-- 0001 _expire_old: 특별 티켓은 만료되지 않음
create or replace function public._expire_old(uid uuid) returns void
language sql security definer set search_path = '' as $$
  update public.tickets set status = 'expired'
  where user_id = uid and status = 'pending' and special is null
    and created_at < now() - make_interval(hours => (public._setting('ticket_ttl_hours'))::int)
$$;

-- 0005 _redeem_pending + 특별 티켓은 정해진 몬스터 (그 단계로 바로 들어옴)
create or replace function public._redeem_pending(uid uuid, booth uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tk public.tickets; line int; sp int; stg int; is_new boolean; cnt int; bonus boolean; results jsonb := '[]';
  every int := coalesce((public._setting('dup_bonus_every'))::int, 0);
begin
  for tk in select * from public.tickets where user_id = uid and status = 'pending' order by created_at for update loop
    if tk.fixed_species is not null then
      select s.line_id, s.stage, s.id into line, stg, sp from public.species s where s.id = tk.fixed_species;
    else
      line := public._draw_line(tk.qr_id);
      stg := 1;
      if line is not null then select id into sp from public.species where line_id = line and stage = 1; end if;
    end if;
    if line is null then
      update public.tickets set status = 'cancelled' where id = tk.id;
      results := results || jsonb_build_array(jsonb_build_object('nonce', tk.nonce, 'error', 'empty_pool',
                   'qr_name', (select name from public.qr_points where id = tk.qr_id)));
      continue;
    end if;
    insert into public.collection (user_id, line_id, stage) values (uid, line, stg)
    on conflict (user_id, line_id) do update set catch_count = public.collection.catch_count + 1,
       stage = greatest(public.collection.stage, excluded.stage), updated_at = now()
    returning (xmax = 0), catch_count into is_new, cnt;
    bonus := not is_new and every > 0 and cnt % every = 0 and tk.special is null;
    if bonus then update public.profiles set evo_tickets = evo_tickets + 1 where user_id = uid; end if;
    update public.tickets set status = 'redeemed', redeemed_at = now(), booth_user = booth, result_species = sp
     where id = tk.id;
    perform public._make_quiz(uid, line, tk.id);
    results := results || jsonb_build_array(jsonb_build_object(
      'nonce', tk.nonce, 'qr_name', (select name from public.qr_points where id = tk.qr_id),
      'species_id', sp, 'line_id', line, 'is_new', is_new, 'replay', false, 'bonus_ticket', bonus,
      'special', tk.special, 'rarity', (select rarity from public.lines where id = line)));
  end loop;
  perform public._recompute(uid);
  return results;
end $$;

-- 도감 보상: 보너스 몬스터를 뺀 도감 50% → 과연기, 100% → 창문기 (한 번씩)
create or replace function public._dex_rewards(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare total int; got int; cfg jsonb := public._setting('dex_rewards'); sp int;
begin
  if cfg is null then return; end if;
  select count(*), count(*) filter (where exists (
           select 1 from public.collection c where c.user_id = uid and c.line_id = s.line_id and c.stage >= s.stage))
    into total, got
  from public.species s join public.lines l on l.id = s.line_id
  where not l.bonus and not l.secret and not l.withdrawn and l.active;
  if total = 0 then return; end if;
  if got * 2 >= total and cfg ? '50' and not exists (select 1 from public.tickets where user_id = uid and special = 'dex50') then
    select id into sp from public.species where line_id = (cfg ->> '50')::int and stage = 1;
    if sp is not null then perform public._grant_special(uid, sp, 'dex50'); end if;
  end if;
  if got >= total and cfg ? '100' and not exists (select 1 from public.tickets where user_id = uid and special = 'dex100') then
    select id into sp from public.species where line_id = (cfg ->> '100')::int and stage = 1;
    if sp is not null then perform public._grant_special(uid, sp, 'dex100'); end if;
  end if;
end $$;

-- 0001 _recompute + 도감 보상 확인
create or replace function public._recompute(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s int; d int;
begin
  select coalesce(sum((public._setting('stage_points') ->> c.stage)::int
                      + coalesce((public._setting('rarity_bonus') ->> l.rarity)::int, 0)), 0),
         coalesce(sum(c.stage), 0)
    into s, d
  from public.collection c join public.lines l on l.id = c.line_id
  where c.user_id = uid;
  update public.profiles
     set score_at = case when s > score then now() else score_at end,
         score = s, dex_count = d
   where user_id = uid;
  perform public._dex_rewards(uid);
end $$;

-- ───────── 레이드 ─────────
create or replace function public._raid_token(r public.raids, win bigint) returns text
language sql stable security definer set search_path = '' as $$
  select case when r.tv then left(encode(extensions.hmac(win::text, r.token, 'sha256'), 'hex'), 10) else r.token end
$$;

-- 탭 1번의 데미지: 내 몬스터(지금 단계) Lv.50 공격/특수공격 중 큰 쪽 ÷ 보스의 방어/특수방어 × 상성 × 10
create or replace function public._raid_per_tap(uid uuid, line int, boss int) returns int
language plpgsql stable security definer set search_path = '' as $$
declare a public.species; b public.species; at text; bt text; m numeric := 1; atk int; def int;
begin
  if line is null then return 3; end if;
  select s.* into a from public.collection c join public.species s on s.line_id = c.line_id and s.stage = c.stage
   where c.user_id = uid and c.line_id = line;
  if not found then return 3; end if;
  select * into b from public.species where id = boss;
  select case when subject = '비밀' then '전설' else subject end into at from public.lines where id = a.line_id;
  select case when subject = '비밀' then '전설' else subject end into bt from public.lines where id = b.line_id;
  select coalesce((select mult from public.type_chart where type_chart.atk = at and type_chart.def = bt), 1) into m;
  if coalesce(a.atk, 0) >= coalesce(a.spa, 0) then
    atk := floor((2 * coalesce(a.atk, 50) + 31) / 2) + 5; def := floor((2 * coalesce(b.def, 50) + 31) / 2) + 5;
  else
    atk := floor((2 * coalesce(a.spa, 50) + 31) / 2) + 5; def := floor((2 * coalesce(b.spd, 50) + 31) / 2) + 5;
  end if;
  return greatest(1, round(10.0 * atk / greatest(def, 1) * m));
end $$;

-- 끝내기: 승리면 탭을 충분히 한 참가자 모두 보스 몬스터 특별 티켓
create or replace function public._raid_finish(rid bigint, won boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.raids; p record; minimum int := coalesce((public._setting('raid_min_taps'))::int, 1);
begin
  update public.raids set status = case when won then 'won' else 'failed' end, ended_at = now(), hp = case when won then 0 else hp end
   where id = rid and status = 'active' returning * into r;
  if not found or not won then return; end if;
  for p in select * from public.raid_players where raid_id = rid and taps >= minimum for update loop
    perform public._grant_special(p.user_id, r.species_id, 'raid');
    update public.raid_players set rewarded = true where raid_id = rid and user_id = p.user_id;
  end loop;
  insert into public.events (kind, data) values ('raid_won', jsonb_build_object('raid', rid, 'species', r.species_id));
end $$;

-- 시간이 지난 레이드 정리 (실패)
create or replace function public._raid_sweep() returns void
language plpgsql security definer set search_path = '' as $$
declare rid bigint;
begin
  for rid in select id from public.raids where status = 'active' and ends_at <= now() loop
    perform public._raid_finish(rid, false);
  end loop;
end $$;

create or replace function public._raid_json(r public.raids, uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id, 'species_id', r.species_id, 'kind', r.kind, 'title', r.title, 'tv', r.tv,
    'hp', r.hp, 'hp_max', r.hp_max, 'status', r.status, 'starts_at', r.starts_at, 'ends_at', r.ends_at, 'ended_at', r.ended_at,
    'server_time', now(),
    'players', (select count(*) from public.raid_players where raid_id = r.id),
    'me', (select jsonb_build_object('damage', p.damage, 'taps', p.taps, 'line_id', p.line_id, 'rewarded', p.rewarded,
                                     'per_tap', public._raid_per_tap(uid, p.line_id, r.species_id))
           from public.raid_players p where p.raid_id = r.id and p.user_id = uid),
    'top', coalesce((select jsonb_agg(jsonb_build_object('display', public._display_name(pr), 'damage', p.damage) order by p.damage desc)
                     from (select * from public.raid_players where raid_id = r.id order by damage desc limit 5) p
                     join public.profiles pr on pr.user_id = p.user_id), '[]'))
$$;

-- 참가: 레이드 QR (q = 'R'||id, t = 토큰). TV 레이드는 최근 90초 안의 토큰까지 인정
create or replace function public.raid_join(p_q text, p_t text, p_line int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); r public.raids; ok boolean := false; w bigint;
  win_sec int := (public._setting('rotating_window_sec'))::int;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._assert_open();
  perform public._raid_sweep();
  if coalesce(p_q, '') !~* '^R[0-9]{1,5}$' then raise exception 'RAID_NOT_FOUND'; end if;
  select * into r from public.raids where id = substr(p_q, 2)::bigint;
  if not found then raise exception 'RAID_NOT_FOUND'; end if;
  if r.status <> 'active' or now() < r.starts_at then raise exception 'RAID_OVER'; end if;
  if r.tv then
    w := floor(extract(epoch from now()) / win_sec);
    for i in 0 .. greatest(1, 90 / win_sec) loop
      if public._raid_token(r, w - i) = lower(p_t) then ok := true; exit; end if;
    end loop;
  else
    ok := r.token = lower(p_t);
  end if;
  if not ok then raise exception 'RAID_BAD_TOKEN'; end if;
  insert into public.raid_players (raid_id, user_id, line_id)
  values (r.id, uid, case when exists (select 1 from public.collection where user_id = uid and line_id = p_line) then p_line end)
  on conflict (raid_id, user_id) do nothing;
  return public._raid_json(r, uid);
end $$;

-- 공격: 탭 수를 모아서 (4초마다). 서버가 1초 raid_tap_cap 탭까지만 인정
create or replace function public.raid_attack(p_raid bigint, p_taps int, p_line int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); r public.raids; p public.raid_players;
  cap int := coalesce((public._setting('raid_tap_cap'))::int, 8);
  elapsed numeric; allowed int; per int; dmg int; left_hp int;
begin
  select * into p from public.raid_players where raid_id = p_raid and user_id = uid for update;
  if not found then raise exception 'RAID_NOT_JOINED'; end if;
  select * into r from public.raids where id = p_raid;
  if r.status = 'active' and r.ends_at <= now() then
    perform public._raid_finish(r.id, false);
    select * into r from public.raids where id = p_raid;
  end if;
  if r.status <> 'active' then return public._raid_json(r, uid); end if;

  if p_line is not null and exists (select 1 from public.collection where user_id = uid and line_id = p_line) then
    p.line_id := p_line;
  end if;
  elapsed := least(10, extract(epoch from now() - coalesce(p.last_tap_at, p.joined_at)));
  allowed := least(greatest(coalesce(p_taps, 0), 0), floor(elapsed * cap)::int + cap);
  per := public._raid_per_tap(uid, p.line_id, r.species_id);
  dmg := allowed * per;
  update public.raid_players set damage = damage + dmg, taps = taps + allowed, last_tap_at = now(), line_id = p.line_id
   where raid_id = p_raid and user_id = uid;
  if dmg > 0 then
    update public.raids set hp = greatest(0, hp - dmg) where id = p_raid and status = 'active' returning hp into left_hp;
    if left_hp = 0 then perform public._raid_finish(p_raid, true); end if;
  end if;
  select * into r from public.raids where id = p_raid;
  return public._raid_json(r, uid) || jsonb_build_object('accepted', allowed, 'dealt', dmg);
end $$;

create or replace function public.raid_state(p_raid bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.raids;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._raid_sweep();
  select * into r from public.raids where id = p_raid;
  if not found then raise exception 'RAID_NOT_FOUND'; end if;
  return public._raid_json(r, auth.uid());
end $$;

-- 내가 참가한 레이드 (진행 중 + 최근 30분)
create or replace function public.my_raids() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._raid_sweep();
  return coalesce((select jsonb_agg(public._raid_json(r, auth.uid()) order by r.status <> 'active', r.ends_at desc)
    from public.raids r join public.raid_players p on p.raid_id = r.id and p.user_id = auth.uid()
    where r.status = 'active' or r.ended_at > now() - interval '30 minutes'), '[]');
end $$;

-- TV: 시간대 레이드 자동 생성 + 띄울 레이드 목록 (토큰 포함)
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
          insert into public.raids (species_id, kind, title, tv, token, hp_max, hp, ends_at)
          values (sp, 'slot', (select name from public.species where id = sp) || ' 레이드', true,
                  public._rand(10, 'abcdef0123456789'), (public._setting('raid_slot_hp'))::int, (public._setting('raid_slot_hp'))::int,
                  least(now() + make_interval(mins => (public._setting('raid_slot_minutes'))::int),
                        ((now() at time zone 'Asia/Seoul')::date + (sl ->> 'until')::time) at time zone 'Asia/Seoul'));
        end if;
      end if;
    end loop;
  end if;
  w := floor(extract(epoch from now()) / win_sec);
  return jsonb_build_object('server_time', now(), 'expires_in', win_sec - (floor(extract(epoch from now()))::bigint % win_sec),
    'raids', coalesce((select jsonb_agg(public._raid_json(r, null) || jsonb_build_object('q', 'R' || r.id, 't', public._raid_token(r, w))
                                        order by r.status <> 'active', r.created_at)
      from public.raids r where r.tv and (r.status = 'active' or r.ended_at > now() - interval '20 seconds')), '[]'));
end $$;

-- 운영자: 아무 몬스터로 레이드 열기 (TV = 30초마다 바뀌는 현장 QR, 아니면 인쇄용 고정 QR)
create or replace function public.admin_create_raid(p_species int, p_hp int, p_minutes int, p_tv boolean default true,
                                                    p_title text default null, p_kind text default 'admin') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.raids;
begin
  perform public._assert_admin();
  if not exists (select 1 from public.species where id = p_species) then raise exception 'BAD_SPECIES'; end if;
  if coalesce(p_hp, 0) not between 10 and 10000000 or coalesce(p_minutes, 0) not between 1 and 600 then raise exception 'BAD_RAID'; end if;
  if p_kind not in ('admin', 'legend') then raise exception 'BAD_RAID'; end if;
  insert into public.raids (species_id, kind, title, tv, token, hp_max, hp, ends_at, created_by)
  values (p_species, p_kind, coalesce(nullif(btrim(p_title), ''), (select name from public.species where id = p_species) || ' 레이드'),
          coalesce(p_tv, true), public._rand(10, 'abcdef0123456789'), p_hp, p_hp, now() + make_interval(mins => p_minutes), auth.uid())
  returning * into r;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('raid', r.id, 'species', p_species));
  return public._raid_json(r, null) || jsonb_build_object('q', 'R' || r.id, 't', r.token);
end $$;

create or replace function public.admin_end_raid(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  perform public._raid_finish(p_id, false);
end $$;

create or replace function public.admin_list_raids() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  perform public._raid_sweep();
  return coalesce((select jsonb_agg(public._raid_json(r, null) || jsonb_build_object('q', 'R' || r.id, 't', case when r.tv then null else r.token end,
                                     'rewarded', (select count(*) from public.raid_players p where p.raid_id = r.id and p.rewarded))
                                    order by r.status <> 'active', r.created_at desc)
    from (select * from public.raids order by created_at desc limit 40) r), '[]');
end $$;

-- 0007 _state + 특별 티켓 표시 + 지금 TV 레이드 (홈 안내)
create or replace function public._state(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public._state_base(uid) || jsonb_build_object(
    'roulette', public._roulette_json(uid),
    'special', coalesce((select jsonb_agg(jsonb_build_object('nonce', t.nonce, 'special', t.special, 'species_id', t.fixed_species))
                         from public.tickets t where t.user_id = uid and t.status = 'pending' and t.special is not null), '[]'),
    'raids_live', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'species_id', r.species_id, 'ends_at', r.ends_at))
                            from public.raids r where r.status = 'active' and r.tv and r.ends_at > now()), '[]'))
$$;

-- 로그인 전 화면의 "문의하기": 이름 + (선택) 고유번호 + 내용. 전체 10분에 20건까지 (장난 방지)
create or replace function public.send_inquiry_public(p_body text, p_name text, p_student_id text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b text := btrim(coalesce(p_body, '')); nm text; sid text := nullif(btrim(coalesce(p_student_id, '')), '');
begin
  if char_length(b) not between 2 and 1000 then raise exception 'BAD_INQUIRY'; end if;
  nm := public._check_name(p_name);
  if sid is not null and sid !~ '^[0-9]{5,6}$' then raise exception 'BAD_STUDENT_ID'; end if;
  if (select count(*) from public.inquiries where user_id is null and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'TRY_LATER';
  end if;
  insert into public.inquiries (user_id, student_id, name, body)
  values (null, case when sid is not null then lpad(sid, 6, '0') end, nm || ' (로그인 전)', b);
  return jsonb_build_object('ok', true);
end $$;

-- 랭킹 3가지: 점수 / 도감 / 배틀 승리 (battle_wins 는 0014 배틀이 올림)
alter table public.profiles add column if not exists battle_wins int not null default 0;
alter table public.profiles add column if not exists battle_wins_at timestamptz;

create or replace function public.get_ranking_by(p_gen int default null, p_kind text default 'score') returns jsonb
language sql stable security definer set search_path = '' as $$
  with base as (
    select p.user_id, p.gen, p.avatar, public._display_name(p) as display,
           case p_kind when 'dex' then p.dex_count when 'battle' then p.battle_wins else p.score end as val,
           case p_kind when 'battle' then p.battle_wins_at else p.score_at end as val_at,
           p.score, p.dex_count, p.battle_wins
    from public.profiles p
    where p.role = 'student' and p.in_ranking and (p_gen is null or p.gen = p_gen)
  ), r as (
    select *, rank() over (order by val desc, val_at asc nulls last) rk from base where val > 0
  )
  select jsonb_build_object(
    'kind', coalesce(p_kind, 'score'),
    'top', coalesce((select jsonb_agg(jsonb_build_object(
                      'rank', rk, 'display', display, 'gen', gen, 'value', val, 'score', score,
                      'dex', dex_count, 'wins', battle_wins, 'avatar', avatar, 'me', user_id = auth.uid()) order by rk, val_at)
                    from (select * from r order by rk, val_at limit 50) r), '[]'),
    'me', (select jsonb_build_object('rank', rk, 'value', val) from r where user_id = auth.uid()),
    'total', (select count(*) from r),
    'at', now())
$$;

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
  public.admin_create_qr(text, text, text, text), public.admin_rotate_qr(text, boolean), public.admin_cancel_ticket(text),
  public.admin_set_role(text, text), public.admin_adjust_tickets(text, int), public.admin_unlink(text), public.admin_stats(),
  public.admin_make_login_codes(text[], text[]), public.admin_export_ranking(), public.admin_relink(text, text),
  public.admin_grant_monster(text, int, int), public.admin_set_in_ranking(text, boolean), public.admin_list_staff(),
  public.admin_invite_staff(text, text), public.admin_remove_staff(text), public.admin_list_requests(),
  public.admin_decide_reset(bigint, boolean), public.admin_set_inquiry(bigint, boolean),
  public.admin_create_raid(int, int, int, boolean, text, text), public.admin_end_raid(bigint), public.admin_list_raids()
to authenticated;
