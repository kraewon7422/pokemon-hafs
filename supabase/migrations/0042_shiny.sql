-- 0042: 반짝이는 포켓몬 (이로치) · 빛나는 부적 · 전설 알림에 "왜 받았는지"
--  A. 확률: wild_shiny_chance = 1/512 (야생 · 사파리 · QR · 레이드 · 전설 · 방랑 · 부스 티켓 · 소포 — 새로 잡는 모든 포켓몬),
--     egg_shiny = 초록 1/256 · 노랑 1/128 · 보라 1/64, shiny_charm_mult = 3 (빛나는 부적이 있으면 모든 확률 × 3, 최대 1).
--  B. 만남 (raid_encounters) 이 생길 때 반짝을 굴림 (BEFORE INSERT 트리거 → shiny 열) → 잡기 장면에서 처음부터 반짝이는 모습.
--     잡으면 (encounter_result) 티켓 shiny 로 넘겨 박스의 그 한 마리 shiny = shiny_on = true.
--     만남이 없는 길 (부스 · 셀프 지급 티켓 · 특별 티켓 · 소포) 은 _redeem_ticket 에서 굴림 (tickets.shiny, null = 아직 안 굴림).
--     앱: state.shiny_t {nonce: true} (24시간) · encounters / safari pending / legend_encounter 의 shiny.
--  C. 빛나는 부적 (items 'shiny_charm', 새 주머니 'key' = 소중한 물건): 학교 도감을 모두 채우면 한 번 (dex100 과 같은 때) + 알림.
--     이미 채운 사람에게도 이 마이그레이션에서 줌. 쓰기 · 지니기 불가 (bag_use → KEY_ITEM). 부스 잡기에서 도망쳐 도감이 다시 비면 거둠.
--  D. 알림 글: 이유 (어떤 조건을 해냈는지 · 어디서 만났는지) 를 첫 줄에, 문장마다 줄 바꿈 (\n — 앱은 white-space: pre-line).
--     퀘스트 (kind 마다 한국어) · 깨어남 · 도감 50/100 · 레이드 · 숨은 선물 · 소포 · 방랑 (장소 QR 이름: _roam_roll 이 zone 에 적음) · 사파리 전설 (자리) · 야생 전설.

-- ── 1. 설정 · 열 · 물건 ────────────────────────────────────────────────────────────────────────────────────
insert into public.settings (key, value) values
  ('wild_shiny_chance', '0.001953125'),
  ('shiny_charm_mult', '3')
on conflict (key) do nothing;
insert into public.settings (key, value) values ('egg_shiny', '{"green": 0.00390625, "yellow": 0.0078125, "purple": 0.015625}')
on conflict (key) do update set value = excluded.value;

alter table public.raid_encounters add column if not exists shiny boolean not null default false;
alter table public.tickets add column if not exists shiny boolean;

alter table public.items drop constraint if exists items_pocket_check;
alter table public.items add constraint items_pocket_check check (pocket in ('hold', 'med', 'tool', 'tm', 'key'));
insert into public.items (key, name, pocket, description, effect, drops, sort) values
  ('shiny_charm', '빛나는 부적', 'key',
   '도감을 모두 채운 트레이너만 가질 수 있는 반짝이는 부적. 가지고 있기만 하면 반짝이는 포켓몬을 더 잘 만나요. 쓰거나 지니게 할 수 없어요.',
   '{}', '{}', 9990)
on conflict (key) do update set name = excluded.name, pocket = excluded.pocket, description = excluded.description, drops = '{}';

-- ── 2. 반짝 확률 ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._has_charm(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.inventory where user_id = uid and item = 'shiny_charm' and qty > 0)
$$;

-- 기본 확률 × (부적이 있으면 shiny_charm_mult), 0 ~ 1
create or replace function public._shiny_p(uid uuid, base numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select least(1, greatest(0, coalesce(base, 0))
                  * case when public._has_charm(uid) then greatest(1, coalesce((public._setting('shiny_charm_mult'))::numeric, 3)) else 1 end)
$$;

create or replace function public._shiny_roll(uid uuid) returns boolean
language sql volatile security definer set search_path = '' as $$
  select random() < public._shiny_p(uid, coalesce((public._setting('wild_shiny_chance'))::numeric, 0.001953125))
$$;

-- 만남이 생길 때 굴림 (이미 true 로 넣었으면 그대로)
create or replace function public._enc_shiny() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(new.shiny, false) then new.shiny := public._shiny_roll(new.user_id); end if;
  return new;
end $$;
drop trigger if exists raid_encounters_shiny on public.raid_encounters;
create trigger raid_encounters_shiny before insert on public.raid_encounters
  for each row execute function public._enc_shiny();

-- ── 3. 만남 json (shiny) ─────────────────────────────────────────────────────────────────────────────────
create or replace function public._encounters_json(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'species_id', e.species_id, 'balls', e.balls, 'kind', e.kind,
                                               'raid_title', r.title, 'created_at', e.created_at, 'shiny', e.shiny) order by e.created_at), '[]')
  from public.raid_encounters e left join public.raids r on r.id = e.raid_id
  where e.user_id = uid and e.status = 'pending' and e.kind not in ('safari', 'legend')
$$;

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
                                          'turns', e.turns, 'level', e.level, 'zone', e.zone, 'shiny', e.shiny,
                                          'flee_now', public._safari_flee_p(e.species_id, e.turns, e.level))
                  from public.raid_encounters e where e.user_id = uid and e.kind = 'safari' and e.status = 'pending'
                 order by e.id limit 1))
  from (select 1) one
  left join public.safari_days d on d.user_id = uid and d.period_start = public._safari_period()
$$;

create or replace function public.legend_encounter(p_dex int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; q jsonb; sp int; ln int; e public.raid_encounters; tries int;
  maxt int := greatest(1, coalesce((public._setting('legend_daily_tries'))::int, 3));
  nb int := least(30, greatest(1, coalesce((public._setting('legend_balls'))::int, 10)));
begin
  select x into q from jsonb_array_elements(coalesce(public._setting('legend_quests'), '[]')) x
   where (x ->> 'dex')::int = p_dex and x ->> 'reward' = 'map' limit 1;
  if q is null then raise exception 'BAD_LEGEND'; end if;
  sp := public._dex_sp(p_dex);
  select line_id into ln from public.species where id = sp;
  if exists (select 1 from public.collection where user_id = uid and line_id = ln) then raise exception 'ALREADY_CAUGHT'; end if;
  select * into e from public.raid_encounters where user_id = uid and kind = 'legend' and status = 'pending' and species_id = sp
     and created_at > now() - interval '30 minutes' order by id desc limit 1;
  if found then
    return jsonb_build_object('encounter', jsonb_build_object('id', e.id, 'species_id', e.species_id, 'balls', e.balls, 'kind', e.kind,
                              'created_at', e.created_at, 'throws', e.throws, 'shiny', e.shiny), 'resumed', true);
  end if;
  update public.raid_encounters set status = 'fled', resolved_at = now(), grade = 'none',
         result = jsonb_build_object('caught', false, 'fled', true, 'species_id', species_id, 'new', false, 'exp', 0, 'expired', true)
   where user_id = uid and kind = 'legend' and status = 'pending';
  if not public._quest_ok(uid, q) then raise exception 'NOT_READY'; end if;
  select count(*) into tries from public.raid_encounters where user_id = uid and kind = 'legend' and species_id = sp and created_at >= public._today_start();
  if tries >= maxt then raise exception 'NO_TRIES'; end if;
  if public._box_count(uid) >= public._box_max() then raise exception 'BOX_FULL'; end if;
  insert into public.legend_quest_done (user_id, dex) values (uid, p_dex) on conflict do nothing;
  insert into public.raid_encounters (user_id, raid_id, species_id, balls, kind, zone)
  values (uid, null, sp, nb, 'legend', 'legend') returning * into e;
  return jsonb_build_object('encounter', jsonb_build_object('id', e.id, 'species_id', e.species_id, 'balls', e.balls, 'kind', e.kind,
                            'created_at', e.created_at, 'throws', 0, 'shiny', e.shiny), 'resumed', false, 'tries_left', maxt - tries - 1);
end $$;

-- 방랑 전설 (0038) + 만난 장소 QR 을 zone 에 적음 (알림에 "○○에서 만나")
create or replace function public._roam_roll(uid uuid, p_qr text) returns void
language plpgsql security definer set search_path = '' as $$
declare r record; ch numeric := least(1, greatest(0, coalesce((public._setting('roam_chance'))::numeric, 0.3)));
begin
  if p_qr is null or ch <= 0 then return; end if;
  for r in select s.id sp, s.dex, l.id ln from public.lines l join public.species s on s.line_id = l.id and s.stage = 1
            where l.legend_src = 'roam' and l.active and not l.withdrawn loop
    continue when public._roam_spot(r.dex) is distinct from p_qr;
    continue when exists (select 1 from public.collection where user_id = uid and line_id = r.ln);
    continue when exists (select 1 from public.raid_encounters where user_id = uid and kind = 'roam' and species_id = r.sp
                           and (status = 'pending' or created_at >= date_trunc('hour', now())));
    if random() < ch then
      insert into public.raid_encounters (user_id, raid_id, species_id, balls, kind, zone)
      values (uid, null, r.sp, greatest(1, coalesce((public._setting('roam_balls'))::int, 8)), 'roam', p_qr);
    end if;
  end loop;
end $$;

-- ── 4. 만남 결과 (0040) + 반짝을 티켓 → 박스로 ────────────────────────────────────────────────────────────
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
    out := jsonb_build_object('caught', false, 'fled', true, 'line', v_line, 'species_id', e.species_id, 'new', false, 'level', null, 'exp', 0,
                              'shiny', e.shiny);
    update public.raid_encounters set status = 'fled', resolved_at = now(), grade = 'none', result = out where id = e.id;
    return out;
  end if;
  sp := e.species_id;
  if e.kind in ('wild', 'safari') then
    disg := public._ditto_roll(v_line);
    if disg is not null then sp := disg; disg := e.species_id; end if;
  end if;
  insert into public.tickets (nonce, user_id, qr_id, token, special, fixed_species, disguised_as, shiny)
  values (public._rand(12, 'abcdefghijklmnopqrstuvwxyz0123456789'), uid,
          case e.kind when 'wild' then 'WILD' when 'safari' then 'SAFARI' when 'legend' then 'LEGEND' when 'roam' then 'ROAM' else 'RAID' end,
          e.kind, e.kind, sp, disg, coalesce(e.shiny, false))
  returning * into tk;
  res := public._redeem_ticket(uid, null, tk);
  if res ->> 'error' = 'box_full' then raise exception 'BOX_FULL'; end if;
  v_line := (res ->> 'line_id')::int;
  v_mon := (res ->> 'mon_id')::bigint;
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
                            'ditto', disg is not null, 'disguised_as', disg, 'shiny', coalesce(c.shiny, false),
                            'lv_up_mon', (res ->> 'lv_up_mon')::bigint, 'lv_up_level', (res ->> 'lv_up_level')::int);
  update public.raid_encounters set status = 'caught', resolved_at = now(), grade = g, result = out where id = e.id;
  return out;
end $$;

-- 잡기 (0040) + 반짝: 티켓에 정해져 있으면 (만남에서 굴림) 그대로, 아니면 여기서 굴림
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

-- ── 5. 알 부화 (0036) + 반짝 확률에 부적 ─────────────────────────────────────────────────────────────────
create or replace function public.egg_hatch(p_egg bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked(); uid uuid := p.user_id; e public.mon_eggs; c public.collection;
  v_line int; v_rar text; v_bt text; v_sp int; v_lvl int; is_new boolean; cnt int; bonus boolean := false;
  every int := coalesce((public._setting('dup_bonus_every'))::int, 0);
  rolled boolean; shiny_new boolean := false; mv int; cur int[]; v_held text; held_to text; res jsonb;
begin
  select * into e from public.mon_eggs where id = p_egg and user_id = uid and hatched_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.steps < e.need then raise exception 'NOT_READY'; end if;
  if public._box_count(uid) >= public._box_max() then raise exception 'BOX_FULL'; end if;

  if e.tier = 'purple' and random() < coalesce((public._setting('egg_legend'))::numeric, 0.1) then
    select l.id into v_line from public.lines l
     where l.rarity = 'legendary' and l.active and not l.withdrawn and not l.mythic and not l.secret and not l.bonus
       and exists (select 1 from public.species s where s.line_id = l.id and s.stage = 1)
     order by random() limit 1;
  end if;
  if v_line is null then
    select l.id into v_line from public.lines l
     where l.rarity = (case when e.tier = 'green' then 'common' else 'rare' end)
       and l.active and not l.withdrawn and not l.mythic and not l.secret and not l.bonus
       and exists (select 1 from public.species s where s.line_id = l.id and s.stage = 1)
     order by random() limit 1;
  end if;
  if v_line is null then
    select l.id into v_line from public.lines l
     where l.rarity = 'common' and l.active and not l.withdrawn and not l.mythic and not l.secret and not l.bonus
       and exists (select 1 from public.species s where s.line_id = l.id and s.stage = 1)
     order by random() limit 1;
  end if;
  if v_line is null then raise exception 'EMPTY_POOL'; end if;
  select l.rarity, coalesce((select s.btype from public.species s where s.line_id = l.id and s.stage = 1), l.btype, '노말') into v_rar, v_bt
    from public.lines l where l.id = v_line;
  select id into v_sp from public.species where line_id = v_line and stage = 1;

  is_new := not exists (select 1 from public.collection where user_id = uid and line_id = v_line);
  c := public._mon_new(uid, v_line, 1, (case when v_rar = 'legendary' then 50 else 5 end) + (case when e.tier = 'green' then 3 else 0 end), true);
  v_lvl := c.level;
  select coalesce(sum(catch_count), 0) into cnt from public.collection where user_id = uid and line_id = v_line;
  bonus := not is_new and every > 0 and cnt % every = 0;
  if bonus then update public.profiles set evo_tickets = evo_tickets + 1 where user_id = uid; end if;

  -- 반짝 색 (0042: 1/256 · 1/128 · 1/64, 빛나는 부적이면 × shiny_charm_mult)
  rolled := random() < public._shiny_p(uid, coalesce((public._setting('egg_shiny') ->> e.tier)::numeric,
                                case e.tier when 'green' then 0.00390625 when 'yellow' then 0.0078125 else 0.015625 end));
  if rolled then
    shiny_new := not exists (select 1 from public.collection where user_id = uid and line_id = v_line and shiny);
    update public.collection set shiny = true, shiny_on = true, updated_at = now() where id = c.id;
  end if;

  if e.tier <> 'green' then
    select m.id into mv from public.moves m
     where m.kind = 'attack' and m.type = any (string_to_array(v_bt, '/') || '노말'::text)
       and not exists (select 1 from public.learnset ls where ls.line_id = v_line and ls.move_id = m.id)
       and not exists (select 1 from public.species s join public.species_moves sm on sm.species_id = s.id
                        where s.line_id = v_line and sm.move_id = m.id)
       and not (m.id = any (public._known_moves(uid, c.id)))
     order by (m.type = any (string_to_array(v_bt, '/'))) desc, random() limit 1;
    if mv is not null then
      cur := public._cur_moves(uid, c.id);
      update public.collection set learned = array_append(learned, mv),
             moves = case when coalesce(cardinality(cur), 0) < 4 then coalesce(cur, '{}') || mv else cur[1:3] || mv end,
             updated_at = now()
       where id = c.id;
    end if;
  end if;

  if e.tier = 'purple' then
    select key into v_held from public.items where pocket = 'hold' order by random() limit 1;
    if v_held is not null then
      update public.collection set held = v_held, updated_at = now() where id = c.id;
      held_to := 'held';
    end if;
  end if;

  perform public._recompute(uid);
  res := jsonb_build_object('egg', e.id, 'tier', e.tier, 'line', v_line, 'species_id', v_sp, 'rarity', v_rar,
                            'new', is_new, 'shiny', rolled, 'shiny_new', shiny_new, 'level', v_lvl,
                            'egg_move', mv, 'held', v_held, 'held_to', held_to, 'bonus_ticket', bonus,
                            'mon', c.id, 'box', c.pos / 30 + 1);
  update public.mon_eggs set hatched_at = now(), slot = null, result = res where id = e.id;
  insert into public.events (user_id, kind, data) values (uid, 'egg_hatch', res);
  return res || jsonb_build_object('profile', (select public._profile_json(x) from public.profiles x where x.user_id = uid),
                                   'eggs', public._egg_state(uid));
end $$;

-- ── 6. 가방: 소중한 물건은 쓸 수 없음 (0036 + KEY_ITEM) ───────────────────────────────────────────────────
create or replace function public.bag_use(p_item text, p_mon bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); it public.items; c public.collection; lv int;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into it from public.items where key = p_item;
  if not found then raise exception 'BAD_ITEM'; end if;
  if it.pocket = 'key' then raise exception 'KEY_ITEM'; end if;
  if it.pocket = 'med' then raise exception 'BATTLE_ONLY'; end if;
  if it.pocket = 'hold' then raise exception 'HOLD_ITEM'; end if;
  select * into c from public.collection where id = p_mon and user_id = uid and released_at is null for update;
  if not found then raise exception 'NO_MONSTER'; end if;
  if it.pocket = 'tool' and it.effect ? 'level' then
    if c.level >= 100 then raise exception 'MAX_LEVEL'; end if;
  elsif it.pocket = 'tm' then
    if it.move_id is null or not exists (select 1 from public.learnset where line_id = c.line_id and move_id = it.move_id and how = 'tm') then
      raise exception 'TM_NOT_COMPATIBLE';
    end if;
    if it.move_id = any (public._known_moves(uid, p_mon)) then raise exception 'ALREADY_KNOWN'; end if;
  end if;
  if coalesce((it.effect ->> 'permanent')::boolean, false) then
    if not exists (select 1 from public.inventory where user_id = uid and item = p_item and qty > 0) then raise exception 'NO_ITEM'; end if;
  else
    update public.inventory set qty = qty - 1 where user_id = uid and item = p_item and qty > 0;
    if not found then raise exception 'NO_ITEM'; end if;
  end if;
  if it.pocket = 'tool' then
    lv := public._add_levels(uid, p_mon, (it.effect ->> 'level')::int);
    return jsonb_build_object('ok', true, 'level', lv, 'mon', p_mon);
  end if;
  update public.collection set learned = array_append(learned, it.move_id), updated_at = now() where id = p_mon;
  return jsonb_build_object('ok', true, 'learned', it.move_id, 'mon', p_mon);
end $$;

-- ── 7. 빛나는 부적: 학교 도감 완성 ───────────────────────────────────────────────────────────────────────
create or replace function public._dex_complete(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) > 0 and count(*) = count(*) filter (where k in (select public._seen_dex(uid)))
  from (select distinct coalesce(s.dex, -s.id) k from public.species s join public.lines l on l.id = s.line_id
         where not l.bonus and not l.secret and not l.withdrawn and l.active and l.subject <> '야생') x
$$;

create or replace function public._charm_give(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public._has_charm(uid) then return; end if;
  insert into public.inventory (user_id, item, qty) values (uid, 'shiny_charm', 1)
    on conflict (user_id, item) do update set qty = greatest(1, public.inventory.qty);
  perform public._notice(uid, 'charm', null, '빛나는 부적을 받았다!',
    '도감을 모두 채웠어요!' || E'\n' || '이제 반짝이는 포켓몬을 '
      || coalesce(public._setting('shiny_charm_mult') #>> '{}', '3') || '배 더 잘 만나요.',
    jsonb_build_object('item', 'shiny_charm'));
end $$;

create or replace function public._dex_rewards(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare total int; got int; cfg jsonb := public._setting('dex_rewards'); sp int;
begin
  select count(*), count(*) filter (where k in (select public._seen_dex(uid)))
    into total, got
  from (select distinct coalesce(s.dex, -s.id) k from public.species s join public.lines l on l.id = s.line_id
         where not l.bonus and not l.secret and not l.withdrawn and l.active and l.subject <> '야생') x;
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
end $$;

create or replace function public._dex_unreward(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare total int; got int;
begin
  select count(*), count(*) filter (where k in (select public._seen_dex(uid)))
    into total, got
  from (select distinct coalesce(s.dex, -s.id) k from public.species s join public.lines l on l.id = s.line_id
         where not l.bonus and not l.secret and not l.withdrawn and l.active and l.subject <> '야생') x;
  if total = 0 then return; end if;
  if got * 2 < total then delete from public.tickets where user_id = uid and special = 'dex50' and status = 'pending'; end if;
  if got < total then
    delete from public.tickets where user_id = uid and special = 'dex100' and status = 'pending';
    delete from public.inventory where user_id = uid and item = 'shiny_charm';            -- 0042: 도감이 다시 비면 부적도 거둠
    delete from public.notices where user_id = uid and kind = 'charm' and seen_at is null;
  end if;
end $$;

-- ── 8. 알림 글: 왜 받았는지 ──────────────────────────────────────────────────────────────────────────────
-- 해낸 조건 (과거형 한 문장)
create or replace function public._quest_done_text(q jsonb) returns text
language sql stable security definer set search_path = '' as $$
  select case q ->> 'kind'
    when 'quiz_streak' then '퀴즈를 ' || public._quest_need(q) || '번 연속으로 맞혔어요!'
    when 'battle_wins' then '배틀에서 ' || public._quest_need(q) || '번 이겼어요!'
    when 'catches' then '포켓몬을 ' || public._quest_need(q) || '마리 잡았어요!'
    when 'raid_slots' then '서로 다른 시간대의 레이드에 ' || public._quest_need(q) || '번 참가했어요!'
    when 'qr_all' then '지도에 있는 장소 QR을 모두 찍었어요!'
    when 'type_catch' then (select coalesce(t, '그') || ' 타입 포켓몬을 ' || public._quest_need(q) || '마리 잡았어요!'
                              from (select string_agg(x, '·') t from jsonb_array_elements_text(coalesce(q -> 'types', '[]')) x) z)
    when 'safari_catches' then '사파리존에서 포켓몬을 ' || public._quest_need(q) || '마리 잡았어요!'
    when 'caught_all' then (select public._josa(t, '을', '를') || ' 모두 잡았어요!'
                              from (select string_agg(public._sp_name(public._dex_sp(x::int)), '·' order by o) t
                                      from jsonb_array_elements_text(coalesce(q -> 'of', '[]')) with ordinality u(x, o)) z)
    else '전설의 포켓몬이 바라던 조건을 채웠어요!' end
$$;

-- 사파리존 전설 자리 (web/js/safari-maps.js LEGEND_HINTS 와 같게, 짧게)
create or replace function public._legend_where(p_dex int) returns text
language sql immutable set search_path = '' as $$
  select case p_dex
    when 377 then '미혹의 동굴 지하 2층 점자 방' when 378 then '여울의 동굴 지하 2층 점자 방'
    when 379 then '미혹의 동굴 지하 3층 점자 방' when 486 then '미혹의 동굴 거인의 제단'
    when 249 then '여울의 동굴 지하 3층 깊은 물가' when 382 then '깊은 연못'
    when 383 then '깊은 동굴 지하 2층' when 250 then '하늘 언덕' when 384 then '하늘의 제단'
    else '깊은 곳' end
$$;

create or replace function public._zone_name(p_zone text) returns text
language sql immutable set search_path = '' as $$
  select case p_zone when 'pond' then '연못가 풀숲' when 'cave' then '동굴' when 'deep' then '깊은 동굴'
    when 'ultra' then '울트라 스페이스' when 'beach' then '해변' else '풀숲' end
$$;

create or replace function public._quest_check(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare q jsonb; sp int; ln int; nm text; nn text; why text;
begin
  for q in select x from jsonb_array_elements(coalesce(public._setting('legend_quests'), '[]')) x loop
    continue when exists (select 1 from public.legend_quest_done d where d.user_id = uid and d.dex = (q ->> 'dex')::int);
    continue when public._quest_cur(uid, q) < public._quest_need(q);
    sp := public._dex_sp((q ->> 'dex')::int);
    continue when sp is null;
    insert into public.legend_quest_done (user_id, dex) values (uid, (q ->> 'dex')::int) on conflict do nothing;
    select line_id, name into ln, nm from public.species where id = sp;
    why := public._quest_done_text(q);
    if q ->> 'reward' = 'ticket' then
      if not exists (select 1 from public.tickets where user_id = uid and special = 'quest' and fixed_species = sp) then
        insert into public.tickets (nonce, user_id, qr_id, token, special, fixed_species)
        values (public._rand(12, 'abcdefghijklmnopqrstuvwxyz0123456789'), uid, 'QUEST', 'quest', 'quest', sp) returning nonce into nn;
        perform public._notice(uid, 'quest', sp, '전설의 포켓몬이 나타났다!',
          why || E'\n' || '그러자 ' || public._josa(nm, '이', '가') || ' 나타났어요!' || E'\n'
              || '특별 티켓을 티켓 주머니에 넣어 두었어요.' || E'\n' || '부스에서 가방 QR을 보여 주면 받을 수 있어요.',
          jsonb_build_object('nonce', nn, 'pending', true, 'legend', true, 'dex', (q ->> 'dex')::int, 'reason', why));
      end if;
    elsif not exists (select 1 from public.collection where user_id = uid and line_id = ln) then
      perform public._notice(uid, 'legend_ready', sp, public._josa(nm, '이', '가') || ' 깨어났다!',
        why || E'\n' || '이제 사파리존 ' || public._legend_where((q ->> 'dex')::int) || '에서 '
            || public._josa(nm, '을', '를') || ' 만날 수 있어요!' || E'\n' || '사육사에게 가는 길을 물어봐요.',
        jsonb_build_object('dex', (q ->> 'dex')::int, 'tab', 'map', 'reason', why));
    end if;
  end loop;
end $$;

-- 특별 티켓 → 알림 (0038) + 이유 첫 줄 · 문장마다 줄 바꿈 · 반짝
create or replace function public._ticket_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; sp int; nm text; rar text; ln int; dex int; title text; why text; body text; tail text; legend boolean;
  e public.raid_encounters; q jsonb; place text; gt text; rt text; nl text := E'\n';
begin
  select * into t from public.tickets where id = new.id;
  if not found or t.special is null or t.status = 'cancelled' then return null; end if;
  sp := coalesce(t.result_species, t.fixed_species);
  select s.name, l.rarity, l.id, s.dex into nm, rar, ln, dex from public.species s join public.lines l on l.id = s.line_id where s.id = sp;
  legend := rar = 'legendary';
  if t.special in ('wild', 'safari') and not legend then return null; end if;
  if t.special = 'quest' then return null; end if;   -- 퀘스트 티켓 알림은 _quest_check 가 바로 씀
  if t.special in ('wild', 'safari', 'legend', 'roam', 'raid') then
    select * into e from public.raid_encounters where user_id = t.user_id and result ->> 'nonce' = t.nonce order by id desc limit 1;
  end if;
  if t.status = 'redeemed' then tail := '박스에 들어갔어요.';
  else tail := '티켓 주머니에 넣어 두었어요.' || nl || '부스에서 가방 QR을 보여 주면 받을 수 있어요.'; end if;
  case t.special
    when 'dex50' then title := '도감 50% 달성!'; why := '학교 도감을 절반 넘게 채웠어요!';
      body := why || nl || '상으로 ' || nm || '의 특별 티켓을 받았어요!' || nl || tail;
    when 'dex100' then title := '도감 완성!'; why := '학교 도감을 모두 채웠어요!';
      body := why || nl || '상으로 ' || nm || '의 특별 티켓을 받았어요!' || nl || tail;
    when 'raid' then title := '레이드 승리!';
      select r.title into rt from public.raids r where r.id = e.raid_id;
      if rt is null then
        select r.title into rt from public.raid_players rp join public.raids r on r.id = rp.raid_id
         where rp.user_id = t.user_id and r.species_id = sp order by r.id desc limit 1;
      end if;
      why := '레이드' || coalesce(' 「' || rt || '」', '') || '에서 친구들과 함께 ' || public._josa(nm, '을', '를') || ' 쓰러뜨렸어요!';
      body := why || nl || case when t.status = 'redeemed' then '그대로 잡아서 박스에 들어갔어요.' else '상으로 특별 티켓을 받았어요!' || nl || tail end;
    when 'egg' then title := '학교의 숨은 선물 발견!';
      why := case ln when 80 then '트레이너 카드에 숨은 비밀을 찾았어요!' when 81 then '타입 상성표에 숨은 비밀을 찾았어요!'
                     when 82 then '학교 지도에 숨은 비밀을 찾았어요!' else '학교 어딘가에 숨은 비밀을 찾았어요!' end;
      body := why || nl || nm || '의 특별 티켓을 받았어요!' || nl || tail;
    when 'gift' then title := '이상한 소포가 도착했다!';
      select g.title into gt from public.gift_claims c join public.gift_codes g on g.id = c.gift_id
       where c.user_id = t.user_id and g.species_id = sp order by c.at desc limit 1;
      why := '이상한 소포' || coalesce(' 「' || gt || '」', '') || ' 코드를 넣었어요!';
      body := why || nl || '소포 안에 ' || public._josa(nm, '이', '가') || ' 들어 있었어요!' || nl || tail;
    when 'roam' then title := '방랑 전설을 잡았다!';
      select name into place from public.qr_points where id = e.zone;
      why := '방랑하던 ' || public._josa(nm, '을', '를') || ' ' || coalesce(place || '에서', '장소 QR에서') || ' 만났어요!';
      body := why || nl || '놓치지 않고 잡았어요!' || nl || tail;
    when 'legend' then title := '전설의 포켓몬을 잡았다!';
      select x into q from jsonb_array_elements(coalesce(public._setting('legend_quests'), '[]')) x where (x ->> 'dex')::int = dex limit 1;
      why := coalesce(public._quest_done_text(q), '전설의 포켓몬이 바라던 조건을 채웠어요!');
      body := why || nl || '그래서 깨어난 ' || public._josa(nm, '을', '를') || ' 사파리존 ' || public._legend_where(dex) || '에서 잡았어요!' || nl || tail;
    when 'safari' then title := '전설의 포켓몬을 잡았다!';
      why := '사파리존 ' || public._zone_name(e.zone) || '에서 만난 야생 포켓몬이 전설의 ' || public._josa(nm, '이었어요!', '였어요!');
      body := why || nl || tail;
    when 'wild' then title := '전설의 포켓몬을 잡았다!';
      why := '걸어 다니다 만난 야생 포켓몬이 전설의 ' || public._josa(nm, '이었어요!', '였어요!');
      body := why || nl || tail;
    else title := '전설의 포켓몬을 잡았다!'; why := public._josa(nm, '을', '를') || ' 잡았어요!'; body := why || nl || tail;
  end case;
  if coalesce(t.shiny, false) then body := body || nl || '✦ 반짝이는 색이에요! ✦'; end if;
  perform public._notice(t.user_id, t.special, sp, title, body,
                         jsonb_build_object('nonce', t.nonce, 'pending', t.status = 'pending', 'legend', legend,
                                            'reason', why, 'shiny', coalesce(t.shiny, false)));
  return null;
end $$;

-- ── 9. 상태 (0038) + 반짝으로 받은 티켓 ──────────────────────────────────────────────────────────────────
create or replace function public._state(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public._state_base(uid) || jsonb_build_object(
    'roulette', public._roulette_json(uid),
    'special', coalesce((select jsonb_agg(jsonb_build_object('nonce', t.nonce, 'special', t.special, 'species_id', t.fixed_species))
                         from public.tickets t where t.user_id = uid and t.status = 'pending' and t.special is not null), '[]'),
    'raids_live', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'species_id', r.species_id, 'ends_at', r.ends_at))
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
    'charm', public._has_charm(uid))
$$;

-- ── 10. 이미 도감을 채운 사람에게 부적 ────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in select user_id from public.profiles where coalesce(dex_count, 0) > 0 loop
    if public._dex_complete(r.user_id) then perform public._charm_give(r.user_id); end if;
  end loop;
end $$;


-- rule (0006): every migration that creates functions ends with this block (0040 + 0041 nickname)
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
  public.my_abilities(), public.admin_bt_sim(jsonb),
  -- 0041
  public.set_nickname(text), public.admin_clear_nickname(text)
to authenticated;
notify pgrst, 'reload schema';
