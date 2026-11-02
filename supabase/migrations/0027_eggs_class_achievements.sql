-- 0027: 알(걸어서 부화) · 반 랭킹(학생만) · 도전과제.
--
--  알 (mon_eggs): 초록(green) / 노랑(yellow) / 보라(purple). 부화에 필요한 걸음 = egg_steps (만들 때 need 에 복사).
--    · 생기는 곳: 처음 가 보는 장소 QR (egg_drop_place 확률, 초록 80% · 노랑 20%), 레이드 승리 (노랑), 도전과제 보상, 운영자.
--      알은 최대 egg_hold_max 개 (부화 안 한 것). 넘으면 안 생김 (도전과제는 EGG_FULL).
--    · 부화기 egg_incubators (최대 3) 칸에 넣은 알만 걸음이 쌓임. 처음 가 보는 장소 QR = 부화기의 알 모두 +egg_qr_bonus 걸음
--      (하루 걸음 제한과 별개).
--    · 걸음: 폰 만보기(동작 센서)를 30초쯤마다 모아서 egg_add_steps. 서버는 지난번 뒤로 지난 분 × steps_per_min_max
--      (창은 최대 10분, 그날 첫 호출은 10분 창) 와 하루 steps_day_max 까지만 받음 — 넘는 건 조용히 버리고 받은 수를 돌려줌.
--    · 부화 (egg_hatch, 걸음 ≥ need): 초록 = 보통(common) 몬스터 Lv.+3, 노랑 = 희귀(rare) + 알 기술, 보라 = 10% 전설 아니면 희귀
--      + 알 기술 + 지닌 물건. 1단계로 들어옴 (잡기와 같게: 처음이면 도감 추가, 이미 있으면 잡은 횟수 +1 → 레벨 +1).
--      반짝 색 확률 egg_shiny (초록 10% · 노랑 25% · 보라 50%) → collection.shiny (보이기 = shiny_on, set_shiny 로 끔/켬).
--      알 기술 = 그 몬스터 배틀 타입의 공격 기술 중 레벨·기술머신으로 못 배우는 것 (collection.learned 에 영원히, 4번째 칸에 넣음).
--    · 폰 알림은 item_log (bag_state 의 log): '_egg_green' / '_egg_yellow' / '_egg_purple' (알이 생김, why = place/raid/achievement/admin),
--      '_egg_steps' (qty = 장소 QR 보너스 걸음).
--  반 (profiles.grade 1~3, class_no 1~20): 학생 계정(고유번호 6자리)만. 반 랭킹 = 랭킹에 나오는 학생(get_ranking 과 같은 조건)의 점수 합.
--  도전과제: _ach_catalog() 의 95개. 진행도는 있는 기록에서 계산, 보상은 한 번 (achievement_claims).

-- ════════ 표 ════════
alter table public.collection add column if not exists from_egg boolean not null default false;
alter table public.collection add column if not exists shiny boolean not null default false;
alter table public.collection add column if not exists shiny_on boolean not null default false;
alter table public.profiles add column if not exists grade smallint check (grade between 1 and 3);
alter table public.profiles add column if not exists class_no smallint check (class_no between 1 and 20);

create table if not exists public.mon_eggs (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (user_id) on delete cascade on update cascade,
  tier       text not null check (tier in ('green', 'yellow', 'purple')),
  steps      int not null default 0 check (steps >= 0),
  need       int not null check (need > 0),
  slot       smallint check (slot between 1 and 3),
  source     text not null check (source in ('place', 'raid', 'achievement', 'admin')),
  got_at     timestamptz not null default now(),
  hatched_at timestamptz,
  result     jsonb
);
create unique index if not exists mon_eggs_slot on public.mon_eggs (user_id, slot) where slot is not null;
create index if not exists mon_eggs_user on public.mon_eggs (user_id) where hatched_at is null;

create table if not exists public.egg_steps_day (
  user_id uuid not null references public.profiles (user_id) on delete cascade on update cascade,
  day     date not null,                    -- Asia/Seoul
  steps   int not null default 0 check (steps >= 0),
  last_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.achievement_claims (
  user_id uuid not null references public.profiles (user_id) on delete cascade on update cascade,
  key     text not null,
  at      timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.mon_eggs enable row level security;            -- 함수로만
alter table public.egg_steps_day enable row level security;
alter table public.achievement_claims enable row level security;

insert into public.settings (key, value) values
  ('egg_steps', '{"green": 1000, "yellow": 2500, "purple": 5000}'),
  ('egg_qr_bonus', '300'), ('steps_per_min_max', '200'), ('steps_day_max', '30000'),
  ('egg_hold_max', '9'), ('egg_incubators', '3'), ('egg_drop_place', '0.25'),
  ('egg_shiny', '{"green": 0.1, "yellow": 0.25, "purple": 0.5}'), ('egg_legend', '0.1')
on conflict (key) do nothing;

-- ════════ 알 도우미 ════════
create or replace function public._egg_need(p_tier text) returns int
language sql stable security definer set search_path = '' as $$
  select greatest(1, coalesce((public._setting('egg_steps') ->> p_tier)::int,
                              case p_tier when 'green' then 1000 when 'yellow' then 2500 else 5000 end))
$$;

create or replace function public._egg_slots() returns int
language sql stable security definer set search_path = '' as $$
  select least(3, greatest(1, coalesce((public._setting('egg_incubators'))::int, 3)))
$$;

create or replace function public._seoul_day() returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone 'Asia/Seoul')::date
$$;

-- 새 알 (가진 알이 egg_hold_max 개면 null) + 폰 알림 기록
create or replace function public._egg_new(uid uuid, p_tier text, p_src text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int; e public.mon_eggs;
begin
  select count(*) into n from public.mon_eggs where user_id = uid and hatched_at is null;
  if n >= coalesce((public._setting('egg_hold_max'))::int, 9) then return null; end if;
  insert into public.mon_eggs (user_id, tier, need, source) values (uid, p_tier, public._egg_need(p_tier), p_src) returning * into e;
  insert into public.item_log (user_id, item, qty, why) values (uid, '_egg_' || p_tier, 1, p_src);
  return jsonb_build_object('id', e.id, 'tier', e.tier);
end $$;

create or replace function public._egg_state(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'eggs', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'tier', e.tier, 'steps', e.steps, 'need', e.need,
                                                          'slot', e.slot, 'got_at', e.got_at) order by e.slot nulls last, e.id)
                      from public.mon_eggs e where e.user_id = uid and e.hatched_at is null), '[]'),
    'hold_max', coalesce((public._setting('egg_hold_max'))::int, 9),
    'incubators', public._egg_slots(),
    'steps_today', coalesce((select d.steps from public.egg_steps_day d where d.user_id = uid and d.day = public._seoul_day()), 0),
    'steps_total', coalesce((select sum(d.steps) from public.egg_steps_day d where d.user_id = uid), 0),
    'day_max', coalesce((public._setting('steps_day_max'))::int, 30000),
    'qr_bonus', coalesce((public._setting('egg_qr_bonus'))::int, 300),
    'need', jsonb_build_object('green', public._egg_need('green'), 'yellow', public._egg_need('yellow'), 'purple', public._egg_need('purple')),
    'shiny', coalesce((select jsonb_agg(jsonb_build_object('line', c.line_id, 'on', c.shiny_on) order by c.line_id)
                       from public.collection c where c.user_id = uid and c.shiny), '[]'))
$$;

-- 처음 가 보는 장소 QR: 부화기의 알 + 보너스 걸음, 가끔 새 알
create or replace function public._egg_place(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare bonus int := greatest(0, coalesce((public._setting('egg_qr_bonus'))::int, 300)); n int;
begin
  if bonus > 0 then
    update public.mon_eggs set steps = least(need, steps + bonus)
     where user_id = uid and slot is not null and hatched_at is null and steps < need;
    get diagnostics n = row_count;
    if n > 0 then insert into public.item_log (user_id, item, qty, why) values (uid, '_egg_steps', bonus, 'place'); end if;
  end if;
  if random() < coalesce((public._setting('egg_drop_place'))::numeric, 0.25) then
    perform public._egg_new(uid, case when random() < 0.8 then 'green' else 'yellow' end, 'place');
  end if;
end $$;

-- ════════ 알 (학생) ════════
create or replace function public.egg_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  return public._egg_state(uid);
end $$;

-- 부화기에 넣기 (비어 있는 가장 앞 칸)
create or replace function public.egg_incubate(p_egg bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); e public.mon_eggs; v_slot int;
begin
  select * into e from public.mon_eggs where id = p_egg and user_id = p.user_id and hatched_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.slot is null then
    select min(s) into v_slot from generate_series(1, public._egg_slots()) s
     where not exists (select 1 from public.mon_eggs x where x.user_id = p.user_id and x.slot = s);
    if v_slot is null then raise exception 'NO_SLOT'; end if;
    update public.mon_eggs set slot = v_slot where id = e.id;
  end if;
  return public._egg_state(p.user_id);
end $$;

-- 걸음 보내기 (폰이 모아서). 받은 수만큼 부화기의 알에 더함
create or replace function public.egg_add_steps(p_steps int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked(); d date := public._seoul_day(); r public.egg_steps_day;
  spm int := greatest(0, coalesce((public._setting('steps_per_min_max'))::int, 200));
  dmax int := greatest(0, coalesce((public._setting('steps_day_max'))::int, 30000));
  mins numeric; today int := 0; acc int; ready jsonb;
begin
  if p_steps is null or p_steps < 0 or p_steps > 100000 then raise exception 'BAD_STEPS'; end if;
  select * into r from public.egg_steps_day where user_id = p.user_id and day = d for update;
  if found then
    mins := least(10, greatest(0, extract(epoch from now() - r.last_at) / 60.0));
    today := r.steps;
  else
    mins := 10;
  end if;
  acc := greatest(0, least(p_steps, floor(spm * mins)::int, dmax - today));
  if p_steps > 0 then
    insert into public.egg_steps_day (user_id, day, steps, last_at) values (p.user_id, d, acc, now())
      on conflict (user_id, day) do update set steps = public.egg_steps_day.steps + excluded.steps, last_at = now();
  end if;
  if acc > 0 then
    update public.mon_eggs set steps = least(need, steps + acc)
     where user_id = p.user_id and slot is not null and hatched_at is null and steps < need;
  end if;
  select coalesce(jsonb_agg(id order by id), '[]') into ready
    from public.mon_eggs where user_id = p.user_id and hatched_at is null and steps >= need;
  return public._egg_state(p.user_id) || jsonb_build_object('accepted', acc, 'ready', ready);
end $$;

-- 부화
create or replace function public.egg_hatch(p_egg bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked(); uid uuid := p.user_id; e public.mon_eggs;
  v_line int; v_rar text; v_bt text; v_sp int; v_lvl int; is_new boolean; cnt int; bonus boolean := false;
  every int := coalesce((public._setting('dup_bonus_every'))::int, 0);
  rolled boolean; shiny_new boolean := false; n int; mv int; cur int[]; v_held text; held_to text; res jsonb;
begin
  select * into e from public.mon_eggs where id = p_egg and user_id = uid and hatched_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.steps < e.need then raise exception 'NOT_READY'; end if;

  -- 몬스터 고르기 (1단계가 있는 계열만)
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
  select l.rarity, coalesce(l.btype, l.subject) into v_rar, v_bt from public.lines l where l.id = v_line;
  select id into v_sp from public.species where line_id = v_line and stage = 1;

  -- 잡기와 같게: 처음이면 새로 (시작 레벨, 초록 +3), 이미 있으면 잡은 횟수 +1 (collection_growth 트리거가 레벨 +1)
  v_lvl := (case when v_rar = 'legendary' then 40 else 5 end) + (case when e.tier = 'green' then 3 else 0 end);
  insert into public.collection (user_id, line_id, stage, level, from_egg) values (uid, v_line, 1, v_lvl, true)
  on conflict (user_id, line_id) do update set catch_count = public.collection.catch_count + 1, from_egg = true, updated_at = now()
  returning (xmax = 0), catch_count, level into is_new, cnt, v_lvl;
  bonus := not is_new and every > 0 and cnt % every = 0;
  if bonus then update public.profiles set evo_tickets = evo_tickets + 1 where user_id = uid; end if;

  -- 반짝 색
  rolled := random() < coalesce((public._setting('egg_shiny') ->> e.tier)::numeric,
                                case e.tier when 'green' then 0.1 when 'yellow' then 0.25 else 0.5 end);
  if rolled then
    update public.collection set shiny = true, shiny_on = true, updated_at = now()
     where user_id = uid and line_id = v_line and not shiny;
    get diagnostics n = row_count;
    shiny_new := n > 0;
  end if;

  -- 알 기술 (노랑·보라): 배틀 타입 공격 기술 중 레벨·기술머신·기본 기술이 아닌 것 (없으면 보통 타입)
  if e.tier <> 'green' then
    select m.id into mv from public.moves m
     where m.kind = 'attack' and m.type in (v_bt, '보통')
       and not exists (select 1 from public.learnset ls where ls.line_id = v_line and ls.move_id = m.id)
       and not exists (select 1 from public.species s join public.species_moves sm on sm.species_id = s.id
                        where s.line_id = v_line and sm.move_id = m.id)
       and not (m.id = any (public._known_moves(uid, v_line)))
     order by (m.type = v_bt) desc, random() limit 1;
    if mv is not null then
      cur := public._cur_moves(uid, v_line);
      update public.collection set learned = array_append(learned, mv),
             moves = case when coalesce(cardinality(cur), 0) < 4 then coalesce(cur, '{}') || mv else cur[1:3] || mv end,
             updated_at = now()
       where user_id = uid and line_id = v_line;
    end if;
  end if;

  -- 지닌 물건 (보라): 비어 있으면 지니고, 아니면 가방으로
  if e.tier = 'purple' then
    select key into v_held from public.items where pocket = 'hold' order by random() limit 1;
    if v_held is not null then
      update public.collection set held = v_held, updated_at = now() where user_id = uid and line_id = v_line and held is null;
      get diagnostics n = row_count;
      if n > 0 then held_to := 'held';
      else perform public._give_item(uid, v_held, 1, 'egg'); held_to := 'bag';
      end if;
    end if;
  end if;

  perform public._recompute(uid);
  res := jsonb_build_object('egg', e.id, 'tier', e.tier, 'line', v_line, 'species_id', v_sp, 'rarity', v_rar,
                            'new', is_new, 'shiny', rolled, 'shiny_new', shiny_new, 'level', v_lvl,
                            'egg_move', mv, 'held', v_held, 'held_to', held_to, 'bonus_ticket', bonus);
  update public.mon_eggs set hatched_at = now(), slot = null, result = res where id = e.id;
  insert into public.events (user_id, kind, data) values (uid, 'egg_hatch', res);
  return res || jsonb_build_object('profile', (select public._profile_json(x) from public.profiles x where x.user_id = uid),
                                   'eggs', public._egg_state(uid));
end $$;

-- 반짝 색 보이기 / 끄기 (얻은 몬스터만)
create or replace function public.set_shiny(p_line int, p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked();
begin
  update public.collection set shiny_on = coalesce(p_on, false), updated_at = now()
   where user_id = p.user_id and line_id = p_line and shiny;
  if not found then
    if not exists (select 1 from public.collection where user_id = p.user_id and line_id = p_line) then raise exception 'NOT_OWNED'; end if;
    raise exception 'SHINY_LOCKED';
  end if;
  return jsonb_build_object('line', p_line, 'on', coalesce(p_on, false));
end $$;

create or replace function public.admin_give_egg(p_student_id text, p_tier text, p_n int default 1) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid; given int := 0; i int;
begin
  perform public._assert_admin();
  if p_tier is null or p_tier not in ('green', 'yellow', 'purple') then raise exception 'BAD_TIER'; end if;
  if p_n is null or p_n not between 1 and 20 then raise exception 'BAD_N'; end if;
  select user_id into uid from public.profiles where student_id = p_student_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  for i in 1 .. p_n loop
    exit when public._egg_new(uid, p_tier, 'admin') is null;
    given := given + 1;
  end loop;
  insert into public.events (user_id, kind, data)
  values (auth.uid(), 'admin', jsonb_build_object('give_egg', p_student_id, 'tier', p_tier, 'n', given));
  return jsonb_build_object('given', given,
                            'eggs', (select count(*) from public.mon_eggs where user_id = uid and hatched_at is null));
end $$;

-- ════════ 기존 함수에 알 붙이기 (나머지는 그대로) ════════
-- 0020 _ticket_growth + 처음 가 보는 장소면 알 보너스 걸음 · 가끔 새 알
create or replace function public._ticket_growth() returns trigger
language plpgsql security definer set search_path = '' as $$
declare qp public.qr_points; k text; n int; per int := greatest(1, coalesce((public._setting('lv_places_n'))::int, 3)); x int;
begin
  if new.special is not null then return new; end if;
  select * into qp from public.qr_points where id = new.qr_id;
  if random() < coalesce((public._setting('drop_place'))::numeric, 0.3) then
    k := case when qp.drop_item is not null and random() < 0.5 then qp.drop_item else public._roll_item('place') end;
    perform public._give_item(new.user_id, k, 1, 'place');
  end if;
  if public._lv_on('lv_from_places') and not exists (
       select 1 from public.tickets t where t.user_id = new.user_id and t.qr_id = new.qr_id and t.id <> new.id and t.special is null
          and (t.created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date) then
    select count(distinct qr_id) into n from public.tickets t where t.user_id = new.user_id and t.special is null
       and (t.created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date;
    if n > 0 and n % per = 0 then
      foreach x in array coalesce(public._team_lines(new.user_id), '{}') loop
        perform public._add_levels(new.user_id, x, 1);
      end loop;
      insert into public.item_log (user_id, item, qty, why) values (new.user_id, '_team_level', n, 'places');
    end if;
  end if;
  if not exists (select 1 from public.tickets t where t.user_id = new.user_id and t.qr_id = new.qr_id and t.id <> new.id and t.special is null) then
    perform public._egg_place(new.user_id);
  end if;
  return new;
end $$;

-- 0013 _raid_finish + 이긴 참가자에게 노랑 알 (가진 알이 꽉 차면 없음)
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
    perform public._egg_new(p.user_id, 'yellow', 'raid');
  end loop;
  insert into public.events (kind, data) values ('raid_won', jsonb_build_object('raid', rid, 'species', r.species_id));
end $$;

-- 0013 _state_base + 몬스터마다 알에서 나왔는지 · 반짝 색
create or replace function public._state_base(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'festival_open', public._is_open(),
    'rules', jsonb_build_object(
      'bag_max', public._setting('bag_max'), 'qr_daily_cap', public._setting('qr_daily_cap'),
      'evo_prob', public._setting('evo_prob'), 'evo_pity_step', public._setting('evo_pity_step'),
      'evo_pity_max', public._setting('evo_pity_max'), 'self_redeem', public._setting('self_redeem'),
      'festival_close_at', public._setting('festival_close_at'),
      'festival_ended', jsonb_typeof(public._setting('festival_close_at')) = 'string'
                        and now() > (public._setting('festival_close_at') #>> '{}')::timestamptz,
      'min_client_version', public._setting('min_client_version'),
      'notice', public._setting('notice'), 'prize_note', public._setting('prize_note'),
      'dup_bonus_every', public._setting('dup_bonus_every'),
      'legend_schedule', coalesce((select jsonb_agg(jsonb_build_object('name', q.name, 'from', q.active_from, 'until', q.active_until)
                                                   order by q.active_from nulls last)
                                   from public.qr_points q
                                   where q.kind = 'rotating' and q.active and (q.active_until is null or q.active_until > now())), '[]'),
      'withdrawn', coalesce((select jsonb_agg(id) from public.lines where withdrawn), '[]')),
    'profile', (select public._profile_json(p) from public.profiles p where p.user_id = uid),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nonce', t.nonce, 'qr_id', t.qr_id, 'qr_name', q.name, 'token', t.token, 'status', t.status,
               'created_at', t.created_at, 'redeemed_at', t.redeemed_at, 'species_id', t.result_species)
             order by t.created_at desc)
      from (select * from public.tickets where user_id = uid
            and (status = 'pending' or created_at > now() - interval '24 hours')
            order by created_at desc limit 60) t
      join public.qr_points q on q.id = t.qr_id), '[]'),
    'today', coalesce((
      select jsonb_object_agg(qr_id, cnt) from (
        select qr_id, count(*) cnt from public.tickets
        where user_id = uid and status in ('pending', 'redeemed') and created_at >= public._today_start()
        group by qr_id) x), '{}'),
    'collection', coalesce((
      select jsonb_agg(jsonb_build_object('line_id', c.line_id, 'stage', c.stage, 'catch_count', c.catch_count,
                                          'evo_fails', c.evo_fails, 'first_caught_at', c.first_caught_at,
                                          'from_egg', c.from_egg, 'shiny', c.shiny, 'shiny_on', c.shiny_on))
      from public.collection c where c.user_id = uid), '[]'),
    'quizzes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'attempt_id', a.id, 'line_id', z.line_id, 'question', z.question,
               'choices', (select jsonb_agg(z.choices -> pi order by o) from unnest(a.perm) with ordinality as u(pi, o)))
             order by a.created_at)
      from public.quiz_attempts a join public.quizzes z on z.id = a.quiz_id
      where a.user_id = uid and a.answered_at is null), '[]'))
$$;

-- 0024 _profile_json + 학년·반
create or replace function public._profile_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'student_id', p.student_id, 'gen', p.gen, 'name', p.name, 'role', p.role,
    'display', public._display_name(p), 'show_on_board', p.show_on_board, 'avatar', p.avatar,
    'consented', p.consented_at is not null, 'in_ranking', p.in_ranking,
    'evo_tickets', p.evo_tickets, 'score', p.score, 'dex_count', p.dex_count, 'titles', to_jsonb(p.titles),
    'partner', p.partner_line, 'grade', p.grade, 'class_no', p.class_no,
    'login', (select case when u.email like '%@code.local' then 'number' when u.email like '%@id.local' then 'id' else 'google' end
              from auth.users u where u.id = p.user_id),
    'login_key', (select split_part(u.email, '@', 1) from auth.users u where u.id = p.user_id and (u.email like '%@code.local' or u.email like '%@id.local')),
    'google_linked', public._has_google(p.user_id),
    'google_email', (select i.identity_data ->> 'email' from auth.identities i where i.user_id = p.user_id and i.provider = 'google'
                     order by i.updated_at desc limit 1),
    'rank', case when p.in_ranking and p.role = 'student' and p.score > 0 then
      (select count(*) + 1 from public.profiles o
        where o.role = 'student' and o.in_ranking
          and (o.score > p.score or (o.score = p.score and o.score_at < p.score_at))) end)
$$;

-- ════════ 반 (학생 계정만) ════════
create or replace function public._check_class(g int, c int) returns void
language plpgsql immutable security definer set search_path = '' as $$
begin
  if (g is null) <> (c is null) or g not between 1 and 3 or c not between 1 and 20 then raise exception 'BAD_CLASS'; end if;
end $$;

create or replace function public.set_class(p_grade int, p_class int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked();
begin
  if p.role <> 'student' or p.student_id !~ '^[0-9]{6}$' then raise exception 'NOT_STUDENT'; end if;
  perform public._check_class(p_grade, p_class);
  update public.profiles set grade = p_grade, class_no = p_class where user_id = p.user_id returning * into p;
  return public._profile_json(p);
end $$;

create or replace function public.admin_set_class(p_student_id text, p_grade int, p_class int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  perform public._assert_admin();
  perform public._check_class(p_grade, p_class);
  select * into p from public.profiles where student_id = p_student_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p.role <> 'student' or p.student_id !~ '^[0-9]{6}$' then raise exception 'NOT_STUDENT'; end if;
  update public.profiles set grade = p_grade, class_no = p_class where user_id = p.user_id;
  insert into public.events (user_id, kind, data)
  values (auth.uid(), 'admin', jsonb_build_object('set_class', p_student_id, 'grade', p_grade, 'class_no', p_class));
  return jsonb_build_object('student_id', p_student_id, 'grade', p_grade, 'class_no', p_class);
end $$;

-- 반 랭킹: 랭킹에 나오는 학생 (get_ranking 과 같은 조건) 의 점수 합. 1명 이상인 반만
create or replace function public.class_ranking() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); me public.profiles;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into me from public.profiles where user_id = uid;
  if not found then raise exception 'NOT_AUTHENTICATED'; end if;
  return (with s as (
      select p.* from public.profiles p
       where p.role = 'student' and p.in_ranking and p.score > 0 and p.student_id ~ '^[0-9]{6}$'
         and p.grade is not null and p.class_no is not null),
    c as (
      select s.grade, s.class_no, sum(s.score)::int as score, count(*)::int as players, round(avg(s.score), 1) as avg
        from s group by s.grade, s.class_no),
    r as (select c.*, rank() over (order by c.score desc) as rk from c)
    select jsonb_build_object(
      'classes', coalesce((select jsonb_agg(jsonb_build_object(
          'rank', r.rk, 'grade', r.grade, 'class_no', r.class_no, 'score', r.score, 'players', r.players, 'avg', r.avg,
          'top', (select jsonb_build_object('display', public._display_name(t), 'score', t.score)
                    from s t where t.grade = r.grade and t.class_no = r.class_no order by t.score desc, t.score_at limit 1),
          'me', r.grade = me.grade and r.class_no = me.class_no) order by r.rk, r.grade, r.class_no) from r), '[]'),
      'mine', case when me.grade is null then null else jsonb_build_object('grade', me.grade, 'class_no', me.class_no,
          'rank', (select r.rk from r where r.grade = me.grade and r.class_no = me.class_no),
          'score', (select r.score from r where r.grade = me.grade and r.class_no = me.class_no)) end,
      'can_set', me.role = 'student' and me.student_id ~ '^[0-9]{6}$',
      'at', now()));
end $$;

-- ════════ 도전과제 ════════
-- kind = 진행도 종류 (_ach_progress 의 키)
create or replace function public._ach_catalog()
returns table (key text, title text, descr text, kind text, target int, reward jsonb, sort int)
language sql immutable security definer set search_path = '' as $$
  values
    ('dex5', '첫 친구들', '도감 5칸 채우기', 'dex', 5, '{"item": "candy", "n": 1}'::jsonb, 1),
    ('dex10', '도감 수집가', '도감 10칸 채우기', 'dex', 10, '{"egg": "green"}'::jsonb, 2),
    ('dex20', '도감 견습생', '도감 20칸 채우기', 'dex', 20, '{"item": "energy", "n": 2}'::jsonb, 3),
    ('dex30', '도감 연구원', '도감 30칸 채우기', 'dex', 30, '{"item": "candy", "n": 2}'::jsonb, 4),
    ('dex45', '도감 조교', '도감 45칸 채우기', 'dex', 45, '{"egg": "yellow"}'::jsonb, 5),
    ('dex60', '도감 박사', '도감 60칸 채우기', 'dex', 60, '{"egg": "purple"}'::jsonb, 6),
    ('dex80', '도감 교수', '도감 80칸 채우기', 'dex', 80, '{"evo": 2}'::jsonb, 7),
    ('dex100', '살아 있는 도감', '도감 100칸 채우기', 'dex', 100, '{"egg": "purple"}'::jsonb, 8),
    ('dex150', '전설의 수집가', '도감 150칸 채우기', 'dex', 150, '{"evo": 3}'::jsonb, 9),
    ('place1', '첫 QR', '장소 QR 처음 찍기', 'places', 1, '{"item": "bandage", "n": 2}'::jsonb, 10),
    ('place3', '복도 산책', '서로 다른 장소 QR 3곳 찍기', 'places', 3, '{"egg": "green"}'::jsonb, 11),
    ('place5', '학교 탐험', '서로 다른 장소 QR 5곳 찍기', 'places', 5, '{"item": "candy", "n": 1}'::jsonb, 12),
    ('place8', '건물 순례', '서로 다른 장소 QR 8곳 찍기', 'places', 8, '{"item": "mint", "n": 2}'::jsonb, 13),
    ('place12', '학교 여행가', '서로 다른 장소 QR 12곳 찍기', 'places', 12, '{"egg": "yellow"}'::jsonb, 14),
    ('place16', '구석구석', '서로 다른 장소 QR 16곳 찍기', 'places', 16, '{"item": "lucky", "n": 1}'::jsonb, 15),
    ('place20', '학교 지도 완성', '서로 다른 장소 QR 20곳 찍기', 'places', 20, '{"egg": "purple"}'::jsonb, 16),
    ('place25', '모든 곳을 가 본 사람', '서로 다른 장소 QR 25곳 모두 찍기', 'places', 25, '{"evo": 3}'::jsonb, 17),
    ('scan10', 'QR 사냥꾼', 'QR 10번 찍기 (같은 곳 다시 찍어도 셈)', 'scans', 10, '{"item": "candy", "n": 1}'::jsonb, 18),
    ('scan30', 'QR 단골', 'QR 30번 찍기', 'scans', 30, '{"egg": "yellow"}'::jsonb, 19),
    ('scan60', 'QR 중독', 'QR 60번 찍기', 'scans', 60, '{"evo": 2}'::jsonb, 20),
    ('days2', '이틀째 축제', '서로 다른 날 2일 동안 QR 찍기', 'days', 2, '{"egg": "green"}'::jsonb, 21),
    ('days3', '축제 개근상', '서로 다른 날 3일 동안 QR 찍기', 'days', 3, '{"egg": "yellow"}'::jsonb, 22),
    ('win1', '첫 승리', '배틀 1번 이기기', 'wins', 1, '{"item": "firstaid", "n": 1}'::jsonb, 23),
    ('win3', '첫 승리들', '배틀 3번 이기기', 'wins', 3, '{"egg": "green"}'::jsonb, 24),
    ('win5', '연승 도전', '배틀 5번 이기기', 'wins', 5, '{"item": "energy", "n": 2}'::jsonb, 25),
    ('win10', '배틀 고수', '배틀 10번 이기기', 'wins', 10, '{"egg": "yellow"}'::jsonb, 26),
    ('win20', '배틀 달인', '배틀 20번 이기기', 'wins', 20, '{"evo": 2}'::jsonb, 27),
    ('win30', '배틀 챔피언', '배틀 30번 이기기', 'wins', 30, '{"egg": "purple"}'::jsonb, 28),
    ('raid1', '레이드 데뷔', '레이드에 1번 참가하기', 'raids', 1, '{"item": "candy", "n": 1}'::jsonb, 29),
    ('raid3', '레이드 친구', '레이드에 3번 참가하기', 'raids', 3, '{"egg": "green"}'::jsonb, 30),
    ('raid5', '레이드 단골', '레이드에 5번 참가하기', 'raids', 5, '{"egg": "yellow"}'::jsonb, 31),
    ('raid10', '레이드 대장', '레이드에 10번 참가하기', 'raids', 10, '{"evo": 2}'::jsonb, 32),
    ('raid20', '레이드 전설', '레이드에 20번 참가하기', 'raids', 20, '{"egg": "purple"}'::jsonb, 33),
    ('eggs3', '알 줍기', '알 3개 받기', 'eggsgot', 3, '{"item": "candy", "n": 1}'::jsonb, 34),
    ('eggs10', '알 바구니', '알 10개 받기', 'eggsgot', 10, '{"item": "lucky", "n": 1}'::jsonb, 35),
    ('hatch1', '첫 부화', '알 1개 부화시키기', 'hatch', 1, '{"egg": "green"}'::jsonb, 36),
    ('hatch3', '부화 견습생', '알 3개 부화시키기', 'hatch', 3, '{"item": "energy", "n": 2}'::jsonb, 37),
    ('hatch5', '부화 장인', '알 5개 부화시키기', 'hatch', 5, '{"item": "candy", "n": 2}'::jsonb, 38),
    ('hatch10', '알 박사', '알 10개 부화시키기', 'hatch', 10, '{"egg": "purple"}'::jsonb, 39),
    ('hatch20', '부화기 전문가', '알 20개 부화시키기', 'hatch', 20, '{"evo": 3}'::jsonb, 40),
    ('purple1', '보라색 기적', '보라 점박이 알 부화시키기', 'purplehatch', 1, '{"item": "lucky", "n": 1}'::jsonb, 41),
    ('walk1k', '첫 산책', '모두 1,000걸음 걷기', 'steps', 1000, '{"item": "mint", "n": 1}'::jsonb, 42),
    ('walk3k', '동네 한 바퀴', '모두 3,000걸음 걷기', 'steps', 3000, '{"item": "candy", "n": 1}'::jsonb, 43),
    ('walk5k', '산책', '모두 5,000걸음 걷기', 'steps', 5000, '{"egg": "green"}'::jsonb, 44),
    ('walk10k', '만 보 걷기', '모두 10,000걸음 걷기', 'steps', 10000, '{"egg": "yellow"}'::jsonb, 45),
    ('walk20k', '마라토너', '모두 20,000걸음 걷기', 'steps', 20000, '{"egg": "purple"}'::jsonb, 46),
    ('walk40k', '울트라 마라토너', '모두 40,000걸음 걷기', 'steps', 40000, '{"evo": 3}'::jsonb, 47),
    ('shiny1', '반짝반짝', '반짝이 몬스터 1마리 얻기', 'shiny', 1, '{"item": "lucky", "n": 1}'::jsonb, 48),
    ('shiny3', '반짝이 수집가', '반짝이 몬스터 3마리 얻기', 'shiny', 3, '{"egg": "purple"}'::jsonb, 49),
    ('evolve1', '첫 진화', '진화 1번 성공하기', 'evolves', 1, '{"item": "candy", "n": 1}'::jsonb, 50),
    ('evolve3', '진화 연습', '진화 3번 성공하기', 'evolves', 3, '{"egg": "green"}'::jsonb, 51),
    ('evolve5', '진화의 달인', '진화 5번 성공하기', 'evolves', 5, '{"evo": 2}'::jsonb, 52),
    ('evolve10', '진화 연구소', '진화 10번 성공하기', 'evolves', 10, '{"egg": "yellow"}'::jsonb, 53),
    ('evolve20', '진화 박사', '진화 20번 성공하기', 'evolves', 20, '{"evo": 3}'::jsonb, 54),
    ('final1', '끝까지 진화', '3단계 몬스터 1마리 만들기', 'stage3', 1, '{"item": "energy", "n": 2}'::jsonb, 55),
    ('final5', '최종 진화 팀', '3단계 몬스터 5마리 만들기', 'stage3', 5, '{"egg": "purple"}'::jsonb, 56),
    ('rare5', '희귀한 친구들', '희귀 몬스터 5마리 모으기', 'rare', 5, '{"egg": "yellow"}'::jsonb, 57),
    ('rare10', '희귀 수집가', '희귀 몬스터 10마리 모으기', 'rare', 10, '{"evo": 2}'::jsonb, 58),
    ('legend1', '전설과의 만남', '전설 몬스터 1마리 얻기', 'legend', 1, '{"egg": "yellow"}'::jsonb, 59),
    ('legend3', '전설 수집가', '전설 몬스터 3마리 얻기', 'legend', 3, '{"egg": "purple"}'::jsonb, 60),
    ('lv10', '쑥쑥', '몬스터 하나를 Lv.10까지 키우기', 'maxlv', 10, '{"item": "mint", "n": 1}'::jsonb, 61),
    ('lv20', '든든한 동료', '몬스터 하나를 Lv.20까지 키우기', 'maxlv', 20, '{"item": "candy", "n": 1}'::jsonb, 62),
    ('lv30', '믿음직한 파트너', '몬스터 하나를 Lv.30까지 키우기', 'maxlv', 30, '{"egg": "yellow"}'::jsonb, 63),
    ('lv50', '최강의 파트너', '몬스터 하나를 Lv.50까지 키우기', 'maxlv', 50, '{"evo": 3}'::jsonb, 64),
    ('types5', '여러 과목', '서로 다른 타입 5가지 모으기', 'types', 5, '{"item": "glasses", "n": 1}'::jsonb, 65),
    ('types10', '전 과목 탐방', '서로 다른 타입 10가지 모으기', 'types', 10, '{"egg": "yellow"}'::jsonb, 66),
    ('types15', '모든 과목 마스터', '서로 다른 타입 15가지 모으기', 'types', 15, '{"egg": "purple"}'::jsonb, 67),
    ('learn1', '새 기술', '기술머신·알 기술로 새 기술 1개 배우기', 'learned', 1, '{"item": "energy", "n": 1}'::jsonb, 68),
    ('learn5', '기술 박사', '새 기술 5개 배우기', 'learned', 5, '{"egg": "yellow"}'::jsonb, 69),
    ('held1', '선물 들려 주기', '몬스터에게 물건 1개 지니게 하기', 'held', 1, '{"item": "choco", "n": 1}'::jsonb, 70),
    ('held3', '든든한 준비', '몬스터 3마리에게 물건 지니게 하기', 'held', 3, '{"item": "clock", "n": 1}'::jsonb, 71),
    ('quiz1', '첫 정답', '퀴즈 1번 맞히기', 'quiz', 1, '{"item": "mint", "n": 1}'::jsonb, 72),
    ('quiz5', '퀴즈 우등생', '퀴즈 5번 맞히기', 'quiz', 5, '{"egg": "green"}'::jsonb, 73),
    ('quiz15', '퀴즈 왕', '퀴즈 15번 맞히기', 'quiz', 15, '{"evo": 2}'::jsonb, 74),
    ('spin1', '돌려 돌려', '룰렛 1번 돌리기', 'spins', 1, '{"item": "bandage", "n": 1}'::jsonb, 75),
    ('spin5', '룰렛 단골', '룰렛 5번 돌리기', 'spins', 5, '{"egg": "green"}'::jsonb, 76),
    ('games1', '오락실 입장', '미니게임 1판 하기', 'games', 1, '{"item": "candy", "n": 1}'::jsonb, 77),
    ('games3', '오락실 순례', '서로 다른 미니게임 3개 해 보기', 'games', 3, '{"egg": "green"}'::jsonb, 78),
    ('games5', '오락실 정복', '미니게임 5개 모두 해 보기', 'games', 5, '{"egg": "yellow"}'::jsonb, 79),
    ('plays10', '게임 친구', '미니게임 10판 하기', 'mgplays', 10, '{"item": "energy", "n": 2}'::jsonb, 80),
    ('plays30', '게임 단골', '미니게임 30판 하기', 'mgplays', 30, '{"egg": "yellow"}'::jsonb, 81),
    ('plays100', '게임 폐인', '미니게임 100판 하기', 'mgplays', 100, '{"evo": 2}'::jsonb, 82),
    ('surf300', '파도 타기', '몬스터 서핑 300m', 'surf', 300, '{"item": "candy", "n": 1}'::jsonb, 83),
    ('surf1000', '파도의 왕', '몬스터 서핑 1,000m', 'surf', 1000, '{"egg": "yellow"}'::jsonb, 84),
    ('surf2000', '전설의 서퍼', '몬스터 서핑 2,000m', 'surf', 2000, '{"egg": "purple"}'::jsonb, 85),
    ('dodge300', '요리조리', '폭탄 피하기 300점', 'dodge', 300, '{"item": "candy", "n": 1}'::jsonb, 86),
    ('dodge800', '폭탄 무서워하지 않기', '폭탄 피하기 800점', 'dodge', 800, '{"egg": "yellow"}'::jsonb, 87),
    ('land150', '내 땅 넓히기', '땅따먹기 15% 차지하기', 'land', 150, '{"item": "candy", "n": 1}'::jsonb, 88),
    ('land300', '땅 부자', '땅따먹기 30% 차지하기', 'land', 300, '{"egg": "yellow"}'::jsonb, 89),
    ('cross30', '지각 안 하기', '몬스터 등굣길 30칸', 'cross', 30, '{"item": "candy", "n": 1}'::jsonb, 90),
    ('cross80', '등굣길 달인', '몬스터 등굣길 80칸', 'cross', 80, '{"egg": "yellow"}'::jsonb, 91),
    ('cross150', '개근상', '몬스터 등굣길 150칸', 'cross', 150, '{"egg": "purple"}'::jsonb, 92),
    ('secret1', '숨은 그림 찾기', '숨겨진 이스터에그 1개 찾기', 'secrets', 1, '{"item": "candy", "n": 1}'::jsonb, 93),
    ('secret2', '눈썰미', '숨겨진 이스터에그 2개 찾기', 'secrets', 2, '{"egg": "green"}'::jsonb, 94),
    ('secret3', '비밀 탐정', '숨겨진 이스터에그 3개 모두 찾기', 'secrets', 3, '{"egg": "yellow"}'::jsonb, 95)
$$;

create or replace function public._ach_progress(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'dex', coalesce((select dex_count from public.profiles where user_id = uid), 0),
    'places', (select count(distinct qr_id) from public.tickets where user_id = uid and special is null and status <> 'cancelled'),
    'scans', (select count(*) from public.tickets where user_id = uid and special is null and status <> 'cancelled'),
    'days', (select count(distinct (created_at at time zone 'Asia/Seoul')::date) from public.tickets where user_id = uid and special is null and status <> 'cancelled'),
    'wins', coalesce((select battle_wins from public.profiles where user_id = uid), 0),
    'raids', (select count(*) from public.raid_players where user_id = uid and taps > 0),
    'eggsgot', (select count(*) from public.mon_eggs where user_id = uid),
    'hatch', (select count(*) from public.mon_eggs where user_id = uid and hatched_at is not null),
    'purplehatch', (select count(*) from public.mon_eggs where user_id = uid and hatched_at is not null and tier = 'purple'),
    'steps', coalesce((select sum(steps) from public.egg_steps_day where user_id = uid), 0),
    'shiny', (select count(*) from public.collection where user_id = uid and shiny),
    'evolves', (select count(*) from public.events where user_id = uid and kind = 'evolve' and (data ->> 'success')::boolean),
    'stage3', (select count(*) from public.collection where user_id = uid and stage = 3),
    'rare', (select count(*) from public.collection c join public.lines l on l.id = c.line_id where c.user_id = uid and l.rarity = 'rare'),
    'legend', (select count(*) from public.collection c join public.lines l on l.id = c.line_id where c.user_id = uid and l.rarity = 'legendary'),
    'maxlv', coalesce((select max(level) from public.collection where user_id = uid), 0),
    'types', (select count(distinct coalesce(l.btype, l.subject)) from public.collection c join public.lines l on l.id = c.line_id
               where c.user_id = uid and coalesce(l.btype, l.subject) not in ('비밀', '전설')),
    'learned', coalesce((select sum(cardinality(learned)) from public.collection where user_id = uid), 0),
    'held', (select count(*) from public.collection where user_id = uid and held is not null),
    'quiz', (select count(*) from public.events where user_id = uid and kind = 'quiz' and (data ->> 'correct')::boolean),
    'spins', (select count(*) from public.events where user_id = uid and kind = 'roulette'),
    'games', (select count(distinct game) from public.minigame_scores where user_id = uid),
    'mgplays', (select count(*) from public.minigame_scores where user_id = uid),
    'surf', coalesce((select max(score) from public.minigame_scores where user_id = uid and game = 'surf'), 0),
    'dodge', coalesce((select max(score) from public.minigame_scores where user_id = uid and game = 'dodge'), 0),
    'land', coalesce((select max(score) from public.minigame_scores where user_id = uid and game = 'land'), 0),
    'cross', coalesce((select max(score) from public.minigame_scores where user_id = uid and game = 'cross'), 0),
    'secrets', (select count(distinct x) from (
                  select line_id as x from public.collection where user_id = uid and line_id in (80, 81, 82)
                  union all
                  select s.line_id from public.tickets t join public.species s on s.id = t.fixed_species
                   where t.user_id = uid and t.special = 'egg') q))
$$;

create or replace function public._ach_list(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with pr as (select public._ach_progress(uid) j)
  select coalesce(jsonb_agg(jsonb_build_object(
      'key', a.key, 'kind', a.kind, 'title', a.title, 'desc', a.descr, 'target', a.target, 'reward', a.reward,
      'progress', least(a.target, coalesce((pr.j ->> a.kind)::int, 0)),
      'done', coalesce((pr.j ->> a.kind)::int, 0) >= a.target,
      'claimed', exists (select 1 from public.achievement_claims c where c.user_id = uid and c.key = a.key)) order by a.sort), '[]')
  from public._ach_catalog() a, pr
$$;

create or replace function public.achievements() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  return public._ach_list(uid);
end $$;

create or replace function public.claim_achievement(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); a record; prog int; g jsonb; n int;
begin
  select * into a from public._ach_catalog() c where c.key = p_key;
  if not found then raise exception 'BAD_KEY'; end if;
  if exists (select 1 from public.achievement_claims where user_id = p.user_id and key = p_key) then raise exception 'ALREADY_CLAIMED'; end if;
  prog := coalesce((public._ach_progress(p.user_id) ->> a.kind)::int, 0);
  if prog < a.target then raise exception 'NOT_DONE'; end if;
  if a.reward ? 'egg' then
    g := public._egg_new(p.user_id, a.reward ->> 'egg', 'achievement');
    if g is null then raise exception 'EGG_FULL'; end if;
  elsif a.reward ? 'item' then
    perform public._give_item(p.user_id, a.reward ->> 'item', coalesce((a.reward ->> 'n')::int, 1), 'achievement');
  elsif a.reward ? 'evo' then
    n := coalesce((a.reward ->> 'evo')::int, 1);
    update public.profiles set evo_tickets = evo_tickets + n where user_id = p.user_id;
  end if;
  insert into public.achievement_claims (user_id, key) values (p.user_id, p_key);
  insert into public.events (user_id, kind, data) values (p.user_id, 'achievement', jsonb_build_object('key', p_key, 'reward', a.reward));
  return jsonb_build_object('key', p_key, 'reward', a.reward, 'egg', g, 'list', public._ach_list(p.user_id),
                            'evo_tickets', (select evo_tickets from public.profiles where user_id = p.user_id));
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
  public.egg_state(), public.egg_incubate(bigint), public.egg_add_steps(int), public.egg_hatch(bigint), public.set_shiny(int, boolean),
  public.set_class(int, int), public.class_ranking(), public.achievements(), public.claim_achievement(text),
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
  public.admin_give_egg(text, text, int), public.admin_set_class(text, int, int)
to authenticated;
