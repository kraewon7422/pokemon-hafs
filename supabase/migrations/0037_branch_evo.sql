-- 0037: 갈래 진화 · 사파리존 도망 (3세대처럼) · 이름 '진화의 돌'
--  · 갈래 진화: 이브이 → 샤미드/쥬피썬더/부스터/에브이/블래키/리피아/글레이시아/님피아, 킬리아 → 가디안/엘레이드(돌),
--    슈륙챙이 → 강챙이(돌)/왕구리, 냄새꼬 → 라플레시아(돌)/아르코(돌), 야돈 → 야도란/야도킹(돌), 배루키 → 시라소몬/홍수몬/카포에라,
--    개무소 → 실쿤/카스쿤(→독케일), 토중몬 → 아이스크/껍질몬, 눈꼬마 → 얼음귀신/눈여아(돌), 진주몽 → 헌테일/분홍장이,
--    도롱충이 → 도롱마담/나메일, 코스모움 → 솔가레오/루나아라 (PokeAPI 자료, tools/gen_pokemon.py → seed_pokemon.sql).
--    · 갈래 종 = species 줄을 하나 더 (id = 10000 + 전국도감 번호, 같은 계열 · 다음 단계). 예전부터 따로 1단계 계열로 있던 것
--      (야생 쥬피썬더 · 루나아라 계열 425 …)은 그대로 둠 — 야생에서 바로 만날 수도 있음.
--    · public.evolutions (from_species, to_species, how 'level'|'item', lv) = 진화 길 전부. evolve 는 이것만 봄.
--    · collection.species_id = 그 포켓몬의 지금 종 (갈래를 기억). 트리거가 (계열, 단계)와 맞지 않으면 그 단계의 첫 종으로 맞춤
--      → 잡기 · 알 · 운영자 지급 등 예전 함수는 고칠 필요 없음. 진화만 갈래 종을 적음.
--    · evolve(p_mon, p_to): 갈래가 둘 이상이면 p_to 가 꼭 있어야 함 (PICK_BRANCH), 없는 갈래 = BAD_BRANCH.
--      규칙은 0034 그대로: 레벨 진화 = 진화 레벨이면 무료 100%, 전에는 진화의 돌로 확률 / 돌 진화 = 진화의 돌 1개로 100%.
--  · 도감 = 전국도감 번호마다 한 칸 (같은 번호가 두 계열에 있어도 한 칸, 어느 길로 만나도 '발견').
--    본 적 있는 종 = 가진 (놓아준 것 포함) 포켓몬의 지금 종 + 그 종이 되기까지의 앞 단계들 (_sp_path).
--    도감 수 (dex_count) · 학교 도감 50/100% (_dex_rewards) 모두 이것으로 셈. 학교 도감 = 선생님 · 특별 계열의 종 번호 (갈래 종 포함).
--    점수는 예전처럼 계열마다 가장 높은 단계 하나.
--  · 기술: 앞 단계들 + 지금 종의 고른 기술 4개 + 계열의 배우는 기술 (갈래 종의 레벨 기술은 계열에 합침).
--  · 사파리존 도망 = 서버가 정함 (3세대 사파리처럼): 공을 놓칠 때마다 safari_turn(p_id) → 도망칠 확률
--    = safari_flee (25%) + 놓친 차례마다 safari_flee_step (+5%), 전설이면 + safari_flee_legend (15%), 최대 safari_flee_max (90%).
--    앱이 safari_turn 을 건너뛰고 '잡았다'고 보내도 safari_result 가 놓친 공 수만큼 남은 도망 판정을 서버에서 굴림.
--  · 사파리볼 충전 (사용자 요청): safari_balls_daily 기본 10 → 20, 새 설정 safari_reset_hours (1~24, 기본 24) — 서울 시각 00:00 부터
--    그 시간마다 볼 · 만남 수 (safari_daily_max_encounters) 가 다시 참 (예: 6 → 00 · 06 · 12 · 18시). safari_days 는 날짜 대신 충전 구간 시작 시각
--    (period_start) 마다 한 줄 (오늘 줄은 오늘 00:00 구간으로 그대로 이어짐). safari_state 에 balls · max_balls · next_reset_at · reset_hours.
--  · 이름: 진화의돌 → '진화의 돌' (DB 에는 그 글자가 든 자료가 없음: 물건 표 items 에 없고 profiles.evo_tickets 수만 있음.
--    함수 안 주석만 — 아래 새 함수는 새 이름).

-- ── 1. 표 ───────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.species drop constraint if exists species_line_id_stage_key;
alter table public.species drop constraint if exists species_check;
alter table public.species add constraint species_check check (id = (line_id - 1) * 3 + stage or id >= 10000);   -- 10000+ = 갈래 종
alter table public.species drop constraint if exists species_sprite_check;
alter table public.species add constraint species_sprite_check check (sprite is null or sprite ~ '^[0-9]{1,5}-[0-9a-z]{1,16}\.(png|gif|webp)$');
alter table public.species drop constraint if exists species_sprite_shiny_check;
alter table public.species add constraint species_sprite_shiny_check check (sprite_shiny is null or sprite_shiny ~ '^[0-9]{1,5}-[0-9a-z]{1,16}\.(png|gif|webp)$');
create unique index if not exists species_line_stage_main on public.species (line_id, stage) where id < 10000;   -- 갈래 종 (10000+) 은 같은 단계에 여럿

create table if not exists public.evolutions (
  from_species int not null references public.species (id) on delete cascade,
  to_species   int not null references public.species (id) on delete cascade,
  how          text not null default 'level' check (how in ('level', 'item')),   -- item = 진화의 돌 (profiles.evo_tickets)
  lv           int check (lv between 1 and 100),                                  -- level: 이 레벨이면 돌 없이 100% (null = 레벨로는 안 됨)
  sort         smallint not null default 0,
  primary key (from_species, to_species)
);
create unique index if not exists evolutions_to on public.evolutions (to_species);   -- 종마다 앞 단계는 하나
alter table public.evolutions enable row level security;
drop policy if exists catalog_read on public.evolutions;
create policy catalog_read on public.evolutions for select to authenticated using (true);
drop policy if exists admin_write on public.evolutions;
create policy admin_write on public.evolutions for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.evolutions to authenticated;
-- 곧은 진화 (지금까지의 계열 · 단계): seed_pokemon.sql 이 갈래까지 전부 다시 넣음
insert into public.evolutions (from_species, to_species, how, lv, sort)
select a.id, b.id, case when b.evo_item then 'item' else 'level' end, case when b.evo_item then null else b.evo_lv end, 0
  from public.species a join public.species b on b.line_id = a.line_id and b.stage = a.stage + 1 and b.id < 10000
 where a.id < 10000
on conflict do nothing;

alter table public.collection add column if not exists species_id int;
create index if not exists collection_user_species on public.collection (user_id, species_id);

-- 그 포켓몬의 종이 (계열, 단계)와 맞지 않으면 (새로 잡음 · 단계를 바꿈) 그 단계의 첫 종 (곧은 길) 으로
create or replace function public._col_species() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.species_id is null or not exists (
       select 1 from public.species s where s.id = new.species_id and s.line_id = new.line_id and s.stage = new.stage) then
    new.species_id := (select s.id from public.species s where s.line_id = new.line_id and s.stage = new.stage order by s.id limit 1);
  end if;
  return new;
end $$;
drop trigger if exists collection_species on public.collection;
create trigger collection_species before insert or update of line_id, stage, species_id on public.collection
  for each row execute function public._col_species();
update public.collection set species_id = null where species_id is null;   -- 트리거가 채움

-- 사파리존 도망 (3세대처럼)
insert into public.settings (key, value) values
  ('safari_flee_step', '0.05'), ('safari_flee_legend', '0.15'), ('safari_flee_max', '0.9')
on conflict (key) do nothing;
update public.settings set value = '0.25', updated_at = now() where key = 'safari_flee' and value = '0.1'::jsonb;
alter table public.raid_encounters add column if not exists turns int not null default 0;   -- 사파리: 서버가 도망 판정을 굴린 '놓친 공' 수

-- 사파리볼 충전 주기 (서울 00:00 부터 safari_reset_hours 시간마다). 기본 볼 20개
insert into public.settings (key, value) values ('safari_reset_hours', '24') on conflict (key) do nothing;
update public.settings set value = '20', updated_at = now() where key = 'safari_balls_daily' and value = '10'::jsonb;
alter table public.safari_days add column if not exists period_start timestamptz;
update public.safari_days set period_start = (day::timestamp at time zone 'Asia/Seoul') where period_start is null;   -- 지금까지 = 그날 00:00 구간
alter table public.safari_days alter column period_start set not null;
alter table public.safari_days drop constraint if exists safari_days_pkey;
alter table public.safari_days add constraint safari_days_pkey primary key (user_id, period_start);

create or replace function public._safari_hours() returns int
language sql stable security definer set search_path = '' as $$
  select least(24, greatest(1, coalesce((public._setting('safari_reset_hours'))::int, 24)))
$$;
-- p_at 이 속한 충전 구간의 시작 (서울 그날 00:00 + 주기의 배수)
create or replace function public._safari_period(p_at timestamptz default now()) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select (date_trunc('day', p_at at time zone 'Asia/Seoul')
          + make_interval(hours => (floor(extract(hour from p_at at time zone 'Asia/Seoul') / public._safari_hours()) * public._safari_hours())::int))
         at time zone 'Asia/Seoul'
$$;
-- 다음 충전 시각 (주기가 24의 약수가 아니면 자정에서 끊음)
create or replace function public._safari_next_reset(p_at timestamptz default now()) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select least(public._safari_period(p_at) + make_interval(hours => public._safari_hours()),
               (date_trunc('day', p_at at time zone 'Asia/Seoul') + interval '1 day') at time zone 'Asia/Seoul')
$$;

-- ── 2. 도우미: 진화 길 · 본 적 있는 종 ─────────────────────────────────────────────────────────────────────
-- 그 종이 되기까지의 길 (1단계 → … → 그 종)
create or replace function public._sp_path(p_sp int) returns int[]
language sql stable security definer set search_path = '' as $$
  with recursive a(id, d) as (
    select p_sp, 0
    union all
    select e.from_species, a.d + 1 from public.evolutions e join a on e.to_species = a.id where a.d < 5)
  select coalesce(array_agg(id order by d desc), '{}') from a where id is not null
$$;

-- 본 적 있는 종 (놓아준 포켓몬도): 지금 종 + 앞 단계들
create or replace function public._seen_species(uid uuid) returns setof int
language sql stable security definer set search_path = '' as $$
  select distinct x from public.collection c, unnest(public._sp_path(c.species_id)) x
   where c.user_id = uid and c.species_id is not null
$$;

-- 도감 칸 = 전국도감 번호 (번호 없는 운영자 포켓몬은 -id)
create or replace function public._seen_dex(uid uuid) returns setof int
language sql stable security definer set search_path = '' as $$
  select distinct coalesce(s.dex, -s.id) from public.species s where s.id in (select public._seen_species(uid))
$$;


-- ── 3. 기술 · 팀 · 레이드: 그 포켓몬의 종 (species_id) ─────────────────────────────────────────────────────

create or replace function public._known_moves(uid uuid, p_mon bigint) returns int[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct m order by m), '{}') from (
    select sm.move_id m from public.collection c cross join lateral unnest(public._sp_path(c.species_id)) a(id)
      join public.species_moves sm on sm.species_id = a.id where c.id = p_mon and c.user_id = uid
    union all
    select ls.move_id from public.collection c join public.learnset ls on ls.line_id = c.line_id and ls.how = 'level' and ls.lv <= c.level
     where c.id = p_mon and c.user_id = uid
    union all
    select unnest(c.learned) from public.collection c where c.id = p_mon and c.user_id = uid) x
   where exists (select 1 from public.moves where id = x.m)
$$;


create or replace function public._cur_moves(uid uuid, p_mon bigint) returns int[]
language plpgsql stable security definer set search_path = '' as $$
declare c public.collection; r int[]; k int[];
begin
  select * into c from public.collection where id = p_mon and user_id = uid;
  if not found then return '{}'; end if;
  if c.moves is not null then
    k := public._known_moves(uid, p_mon);
    r := array(select x from unnest(c.moves) with ordinality u(x, o) where x = any (k) order by o);
  end if;
  if coalesce(cardinality(r), 0) = 0 then
    r := array(select sm.move_id from public.species s join public.species_moves sm on sm.species_id = s.id
                where s.id = c.species_id order by sm.slot);
  end if;
  return r;
end $$;


create or replace function public._bt_team(uid uuid, p_mons bigint[], maxn int) returns int[]
language plpgsql stable security definer set search_path = '' as $$
declare r int[];
begin
  if p_mons is null or cardinality(p_mons) not between 1 and maxn
     or (select count(distinct x) from unnest(p_mons) x) <> cardinality(p_mons) then raise exception 'BAD_TEAM'; end if;
  select array_agg(s.id order by u.o) into r
    from unnest(p_mons) with ordinality as u(x, o)
    join public.collection c on c.id = u.x and c.user_id = uid and c.released_at is null
    join public.species s on s.id = c.species_id;
  if coalesce(cardinality(r), 0) <> cardinality(p_mons) then raise exception 'BAD_TEAM'; end if;
  return r;
end $$;


create or replace function public._raid_per_tap(uid uuid, p_mon bigint, boss int) returns int
language plpgsql stable security definer set search_path = '' as $$
declare a public.species; b public.species; at text; bt text; m numeric := 1; atk int; def int;
begin
  if p_mon is null then return 3; end if;
  select s.* into a from public.collection c join public.species s on s.id = c.species_id
   where c.id = p_mon and c.user_id = uid;
  if not found then return 3; end if;
  select * into b from public.species where id = boss;
  at := coalesce(a.btype, (select btype from public.lines where id = a.line_id), '노말');
  bt := coalesce(b.btype, (select btype from public.lines where id = b.line_id), '노말');
  m := public._bt_tm(at, bt);
  if coalesce(a.atk, 0) >= coalesce(a.spa, 0) then
    atk := floor((2 * coalesce(a.atk, 50) + 31) / 2) + 5; def := floor((2 * coalesce(b.def, 50) + 31) / 2) + 5;
  else
    atk := floor((2 * coalesce(a.spa, 50) + 31) / 2) + 5; def := floor((2 * coalesce(b.spd, 50) + 31) / 2) + 5;
  end if;
  return greatest(1, round(10.0 * atk / greatest(def, 1) * m));   -- 효과 없음(×0)이어도 탭당 1은 들어간다
end $$;


-- 새로 잡은 포켓몬의 시작 레벨: 같은 단계에 갈래 종이 여럿이어도 하나만 (0032 그대로 + order by)
create or replace function public._collection_growth() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.level = 5 then
      new.level := case when (select rarity from public.lines where id = new.line_id) = 'legendary' then 50
                        else greatest(5, coalesce((select evo_lv from public.species where line_id = new.line_id and stage = new.stage order by (id = new.species_id) desc nulls last, id limit 1),   -- 0037: 갈래 종이 있어도 하나
                                                  case when new.stage = 2 then 20 when new.stage >= 3 then 35 else 5 end)) end;
    end if;
  elsif new.catch_count > old.catch_count and new.level < 100 and public._lv_on('lv_from_catch') then
    new.level := least(100, new.level + (new.catch_count - old.catch_count));
    if new.level >= 100 then new.exp := 0; end if;
  end if;
  return new;
end $$;



-- ── 4. 점수 · 도감 수 · 도감 50/100% · 도전과제 ─────────────────────────────────────────────────────────────

create or replace function public._recompute(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s int; d int;
begin
  select coalesce(sum((public._setting('stage_points') ->> c.stage)::int
                      + coalesce((public._setting('rarity_bonus') ->> l.rarity)::int, 0)), 0),
         (select count(*)::int from public._seen_dex(uid))   -- 0037: 도감 칸 수 (전국도감 번호)
    into s, d
  from (select line_id, max(stage) as stage from public.collection where user_id = uid group by line_id) c
  join public.lines l on l.id = c.line_id;
  update public.profiles
     set score_at = case when s > score then now() else score_at end,
         score = s, dex_count = d
   where user_id = uid;
  perform public._dex_rewards(uid);
end $$;


create or replace function public._dex_rewards(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare total int; got int; cfg jsonb := public._setting('dex_rewards'); sp int;
begin
  if cfg is null then return; end if;
  -- 0037: 학교 도감 = 선생님 · 특별 계열 종의 전국도감 번호 (갈래 종 포함). 어느 길로 만나도 그 번호면 발견
  select count(*), count(*) filter (where k in (select public._seen_dex(uid)))
    into total, got
  from (select distinct coalesce(s.dex, -s.id) k from public.species s join public.lines l on l.id = s.line_id
         where not l.bonus and not l.secret and not l.withdrawn and l.active and l.subject <> '야생') x;
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



create or replace function public._dex_unreward(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare total int; got int;
begin
  -- 0037: 학교 도감 = 선생님 · 특별 계열 종의 전국도감 번호 (갈래 종 포함). 어느 길로 만나도 그 번호면 발견
  select count(*), count(*) filter (where k in (select public._seen_dex(uid)))
    into total, got
  from (select distinct coalesce(s.dex, -s.id) k from public.species s join public.lines l on l.id = s.line_id
         where not l.bonus and not l.secret and not l.withdrawn and l.active and l.subject <> '야생') x;
  if total = 0 then return; end if;
  if got * 2 < total then delete from public.tickets where user_id = uid and special = 'dex50' and status = 'pending'; end if;
  if got < total then delete from public.tickets where user_id = uid and special = 'dex100' and status = 'pending'; end if;
end $$;



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
    'shiny', (select count(distinct line_id) from public.collection where user_id = uid and shiny),
    'evolves', (select count(*) from public.events where user_id = uid and kind = 'evolve' and (data ->> 'success')::boolean),
    'stage3', (select count(distinct c.line_id) from public.collection c join public.lines l on l.id = c.line_id
                where c.user_id = uid and c.stage > 1 and c.stage = l.max_stage),
    'rare', (select count(distinct c.line_id) from public.collection c join public.lines l on l.id = c.line_id where c.user_id = uid and l.rarity = 'rare'),
    'legend', (select count(distinct c.line_id) from public.collection c join public.lines l on l.id = c.line_id where c.user_id = uid and l.rarity = 'legendary'),
    'maxlv', coalesce((select max(level) from public.collection where user_id = uid), 0),
    'types', (select count(distinct x) from public.collection c join public.species s on s.id = c.species_id,
               unnest(string_to_array(s.btype, '/')) x where c.user_id = uid),
    'learned', coalesce((select sum(cardinality(learned)) from public.collection where user_id = uid), 0),
    'held', (select count(*) from public.collection where user_id = uid and held is not null and released_at is null),
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


-- ── 5. 상태: 포켓몬마다 종 번호, 본 적 있는 종 ────────────────────────────────────────────────────────────

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
      'box_max', public._box_max(),
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
      select jsonb_agg(jsonb_build_object('line_id', x.line_id, 'stage', x.stage, 'catch_count', x.cc,
                                          'evo_fails', x.ef, 'first_caught_at', x.fc, 'level', x.lv,
                                          'from_egg', x.fe, 'shiny', x.sh, 'shiny_on', x.so, 'count', x.n) order by x.line_id)
      from (select line_id, max(stage) as stage, sum(catch_count)::int as cc,
                   coalesce(min(evo_fails) filter (where released_at is null), 0) as ef, min(first_caught_at) as fc,
                   max(level) as lv, bool_or(from_egg) as fe, bool_or(shiny) as sh,
                   coalesce(bool_or(shiny_on) filter (where released_at is null), false) as so,
                   (count(*) filter (where released_at is null))::int as n
              from public.collection where user_id = uid group by line_id) x), '[]'),
    'mons', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'line_id', c.line_id, 'stage', c.stage, 'species_id', c.species_id, 'level', c.level, 'pos', c.pos,
                                          'held', c.held, 'shiny', c.shiny, 'shiny_on', c.shiny_on, 'from_egg', c.from_egg,
                                          'evo_fails', c.evo_fails, 'caught_at', c.first_caught_at) order by c.pos, c.id)
      from public.collection c where c.user_id = uid and c.released_at is null), '[]'),
    'quizzes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'attempt_id', a.id, 'line_id', z.line_id, 'question', z.question,
               'choices', (select jsonb_agg(z.choices -> pi order by o) from unnest(a.perm) with ordinality as u(pi, o)))
             order by a.created_at)
      from public.quiz_attempts a join public.quizzes z on z.id = a.quiz_id
      where a.user_id = uid and a.answered_at is null), '[]'),
    'seen', coalesce((select jsonb_agg(x order by x) from public._seen_species(uid) x), '[]'),   -- 0037: 본 적 있는 종 (도감)
    'encounters', public._encounters_json(uid))
$$;


create or replace function public.bag_state(p_since bigint default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mul int := coalesce((public._setting('exp_need_mul'))::int, 8);
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('key', item, 'qty', qty)) from public.inventory where user_id = uid and qty > 0), '[]'),
    'box', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'line', c.line_id, 'stage', c.stage, 'species_id', c.species_id, 'level', c.level, 'exp', c.exp, 'pos', c.pos,
                       'need', case when c.level >= 100 then 0 else mul * c.level end, 'held', c.held,
                       'shiny', c.shiny, 'shiny_on', c.shiny_on, 'from_egg', c.from_egg, 'evo_fails', c.evo_fails, 'caught_at', c.first_caught_at,
                       'moves', to_jsonb(public._cur_moves(uid, c.id)), 'known', to_jsonb(public._known_moves(uid, c.id)),
                       'learned', to_jsonb(c.learned)) order by c.pos, c.id)
                     from public.collection c where c.user_id = uid and c.released_at is null), '[]'),
    'box_max', public._box_max(),
    'log', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'item', item, 'qty', qty, 'why', why, 'at', at) order by id)
                     from (select * from public.item_log where user_id = uid and id > coalesce(p_since, 0) order by id desc limit 20) x), '[]'),
    'last', (select coalesce(max(id), 0) from public.item_log where user_id = uid),
    'team', to_jsonb(public._team_mons(uid)),
    'saved_team', (select to_jsonb(team_mons) from public.profiles where user_id = uid),
    'partner', (select partner_mon from public.profiles where user_id = uid),
    'fair', (select battle_fair from public.profiles where user_id = uid),
    'sources', jsonb_build_object('battle', public._lv_on('lv_from_battle'), 'raid', public._lv_on('lv_from_raid'),
                                  'places', public._lv_on('lv_from_places'), 'catch', public._lv_on('lv_from_catch'),
                                  'places_n', coalesce((public._setting('lv_places_n'))::int, 3)));
end $$;


-- ── 6. 진화 (갈래) ───────────────────────────────────────────────────────────────────────────────────────
drop function if exists public.evolve(bigint);
create or replace function public.evolve(p_mon bigint, p_to int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked();
  c public.collection; v_line int; e public.evolutions; n int; to_stage int;
  base numeric; prob numeric; guaranteed boolean; win boolean; by_level boolean; by_item boolean;
begin
  perform public._assert_open();
  select * into c from public.collection where id = p_mon and user_id = p.user_id and released_at is null for update;
  if not found then raise exception 'NOT_OWNED'; end if;
  v_line := c.line_id;
  if c.stage >= (select max_stage from public.lines where id = v_line) then raise exception 'MAX_STAGE'; end if;
  select count(*) into n from public.evolutions where from_species = c.species_id;
  if n = 0 then raise exception 'MAX_STAGE'; end if;
  if p_to is null then
    if n > 1 then raise exception 'PICK_BRANCH'; end if;   -- 갈래가 여럿이면 무엇으로 진화할지 골라야 함
    select * into e from public.evolutions where from_species = c.species_id;
  else
    select * into e from public.evolutions where from_species = c.species_id and to_species = p_to;
    if not found then raise exception 'BAD_BRANCH'; end if;
  end if;
  select stage into to_stage from public.species where id = e.to_species;
  by_item := e.how = 'item';
  by_level := not by_item and c.level >= coalesce(e.lv, 101);
  if not by_level then   -- 진화의 돌 1개 (돌 진화 = 100%, 레벨 진화를 일찍 = 확률)
    update public.profiles set evo_tickets = evo_tickets - 1 where user_id = p.user_id and evo_tickets > 0;
    if not found then raise exception 'NO_TICKET'; end if;
  end if;

  base := (public._setting('evo_prob') ->> c.stage)::numeric;
  guaranteed := c.evo_fails >= (public._setting('evo_pity_max') ->> c.stage)::int;
  prob := least(1, base + c.evo_fails * (public._setting('evo_pity_step'))::numeric);
  win := by_level or by_item or guaranteed or random() < prob;   -- 돌 진화 = 진화의 돌로 100%

  if win then
    update public.collection set stage = coalesce(to_stage, stage + 1), species_id = e.to_species, evo_fails = 0, updated_at = now()
     where id = p_mon returning * into c;
    perform public._recompute(p.user_id);
  else
    update public.collection set evo_fails = evo_fails + 1, updated_at = now() where id = p_mon returning * into c;
  end if;
  insert into public.events (user_id, kind, data)
  values (p.user_id, 'evolve', jsonb_build_object('line', v_line, 'mon', p_mon, 'success', win, 'stage', c.stage, 'by_level', by_level,
                                                  'to', e.to_species));

  return jsonb_build_object(
    'success', win, 'stage', c.stage, 'evo_fails', c.evo_fails, 'by_level', by_level, 'by_item', by_item,
    'species_id', c.species_id, 'to', e.to_species, 'mon', p_mon, 'line', v_line,
    'evo_tickets', (select evo_tickets from public.profiles where user_id = p.user_id),
    'profile', (select public._profile_json(x) from public.profiles x where x.user_id = p.user_id));
end $$;


-- ── 7. 사파리존 도망 (서버가 정함) ─────────────────────────────────────────────────────────────────────────

-- n 번째로 놓친 공 (0부터) 뒤에 도망칠 확률
create or replace function public._safari_flee_p(p_species int, n int) returns numeric
language sql stable security definer set search_path = '' as $$
  select least(greatest(0, coalesce((public._setting('safari_flee_max'))::numeric, 0.9)),
               greatest(0, coalesce((public._setting('safari_flee'))::numeric, 0.25))
               + greatest(0, coalesce((public._setting('safari_flee_step'))::numeric, 0.05)) * greatest(0, n)
               + case when (select l.rarity from public.species s join public.lines l on l.id = s.line_id where s.id = p_species) = 'legendary'
                      then greatest(0, coalesce((public._setting('safari_flee_legend'))::numeric, 0.15)) else 0 end)
$$;


create or replace function public._safari_json(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'balls_daily', greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 20)),
    'balls_left', greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 20) - coalesce(d.balls_used, 0)),
    'max_balls', greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 20)),                                  -- 0037: 충전 주기마다
    'balls', greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 20) - coalesce(d.balls_used, 0)),
    'reset_hours', public._safari_hours(), 'period_start', public._safari_period(), 'next_reset_at', public._safari_next_reset(),
    'encounters_today', coalesce(d.encounters, 0),
    'max_encounters', greatest(0, coalesce((public._setting('safari_daily_max_encounters'))::int, 15)),
    'steps_today', coalesce(d.steps, 0),
    'settings', jsonb_build_object(
      'min_steps', greatest(0, coalesce((public._setting('safari_min_steps'))::int, 8)),
      'flee', coalesce((public._setting('safari_flee'))::numeric, 0.25),
      'flee_step', coalesce((public._setting('safari_flee_step'))::numeric, 0.05),
      'flee_legend', coalesce((public._setting('safari_flee_legend'))::numeric, 0.15),
      'flee_max', coalesce((public._setting('safari_flee_max'))::numeric, 0.9)),
    'pending', (select jsonb_build_object('id', e.id, 'species_id', e.species_id, 'balls', e.balls, 'kind', e.kind, 'created_at', e.created_at,
                                          'turns', e.turns, 'flee_now', public._safari_flee_p(e.species_id, e.turns))
                  from public.raid_encounters e where e.user_id = uid and e.kind = 'safari' and e.status = 'pending'
                 order by e.id limit 1))
  from (select 1) one
  left join public.safari_days d on d.user_id = uid and d.period_start = public._safari_period()
$$;


-- 풀숲 걸음 → 만남: 0033 그대로, 볼 · 만남 수는 충전 구간 (period_start) 마다
create or replace function public.safari_encounter(p_steps int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked(); uid uuid := p.user_id; ps timestamptz := public._safari_period(); r public.safari_days;   -- 0037: 충전 구간마다
  sps numeric := greatest(1, coalesce((public._setting('safari_steps_per_sec'))::numeric, 6));
  minst int := greatest(0, coalesce((public._setting('safari_min_steps'))::int, 8));
  rate numeric := least(1, greatest(0, coalesce((public._setting('safari_encounter_rate'))::numeric, 0.12)));
  maxe int := greatest(0, coalesce((public._setting('safari_daily_max_encounters'))::int, 15));
  daily int := greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 20));
  secs numeric; acc int; left_b int; hit boolean := false; sinc int; wl int; wsp int; eid bigint; reason text;
begin
  if p_steps is null or p_steps < 0 or p_steps > 1000 then raise exception 'BAD_STEPS'; end if;
  -- 아직 안 끝낸 만남이 있으면 그것을 돌려줌 (볼을 두 번 빌리지 않게)
  if exists (select 1 from public.raid_encounters where user_id = uid and kind = 'safari' and status = 'pending') then
    return jsonb_build_object('encounter', public._safari_json(uid) -> 'pending', 'accepted', 0, 'reason', 'pending') || public._safari_json(uid);
  end if;
  insert into public.safari_days (user_id, day, period_start) values (uid, (ps at time zone 'Asia/Seoul')::date, ps) on conflict do nothing;
  select * into r from public.safari_days where user_id = uid and period_start = ps for update;
  -- 걸음 속도 제한: 지난번부터 지난 시간 × 초당 걸음 (+1), 처음엔 3초로 봄, 30초까지만 모아 둠
  secs := case when r.last_at is null then 3 else least(30, greatest(0, extract(epoch from now() - r.last_at))) end;
  acc := greatest(0, least(p_steps, floor(secs * sps)::int + 1));
  sinc := r.since;
  left_b := greatest(0, daily - r.balls_used);
  if left_b <= 0 then reason := 'no_balls';
  elsif r.encounters >= maxe then reason := 'max';
  else
    for i in 1 .. acc loop
      sinc := sinc + 1;
      if sinc >= minst and random() < rate then hit := true; exit; end if;
    end loop;
  end if;
  if hit then
    wl := public._wild_line();
    if wl is not null then select id into wsp from public.species where line_id = wl and stage = 1; end if;
    if wsp is null then hit := false; reason := 'empty_pool'; end if;
  end if;
  if hit then
    insert into public.raid_encounters (user_id, raid_id, species_id, balls, kind)
    values (uid, null, wsp, least(20, left_b), 'safari') returning id into eid;
    update public.safari_days set steps = steps + acc, since = 0, encounters = encounters + 1, last_at = now()
     where user_id = uid and period_start = ps;
  else
    update public.safari_days set steps = steps + acc, since = case when reason is null then sinc else since + acc end, last_at = now()
     where user_id = uid and period_start = ps;
  end if;
  return jsonb_build_object('encounter', case when hit then public._safari_json(uid) -> 'pending' end,
                            'accepted', acc, 'reason', reason) || public._safari_json(uid);
end $$;


-- 만남 결과: 0036 그대로, 사파리볼은 만난 때의 충전 구간에서 뺌
create or replace function public.encounter_result(p_id bigint, p_caught boolean, p_grade text default 'none', p_curve boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; e public.raid_encounters; tk public.tickets;
  res jsonb; caught boolean := coalesce(p_caught, true); g text := coalesce(p_grade, 'none'); amt int; c public.collection; v_line int;
  used int; v_mon bigint;
begin
  if g not in ('none', 'nice', 'great', 'excellent') then raise exception 'BAD_GRADE'; end if;
  select * into e from public.raid_encounters where id = p_id and user_id = uid and status = 'pending' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not caught and e.kind = 'raid' and not coalesce((public._setting('raid_catch_flee'))::boolean, true) then caught := true; end if;   -- 야생·사파리는 언제나 도망칠 수 있음
  -- 0036: 박스가 꽉 차면 잡지 않음 (만남은 그대로 남음 → 놓아준 뒤 다시)
  if caught and public._box_count(uid) >= public._box_max() then raise exception 'BOX_FULL'; end if;
  -- 사파리볼: 던진 수 (모르면 빌린 볼 전부). 잡았으면 적어도 1개
  if e.kind = 'safari' then
    used := least(e.balls, greatest(case when caught then 1 else 0 end, coalesce(e.throws, e.balls)));
    insert into public.safari_days (user_id, day, period_start, balls_used)   -- 0037: 만난 때의 충전 구간 몫
    values (uid, (public._safari_period(e.created_at) at time zone 'Asia/Seoul')::date, public._safari_period(e.created_at), used)
      on conflict (user_id, period_start) do update set balls_used = public.safari_days.balls_used + excluded.balls_used;
    update public.raid_encounters set throws = used where id = e.id;
  end if;
  if not caught then
    update public.raid_encounters set status = 'fled', resolved_at = now(), grade = 'none' where id = e.id;
    select line_id into v_line from public.species where id = e.species_id;
    return jsonb_build_object('caught', false, 'fled', true, 'line', v_line, 'species_id', e.species_id,
                              'new', false, 'level', null, 'exp', 0);
  end if;
  -- 특별 티켓을 만들고 바로 바꿈 (부스에서 바꾼 것과 같은 길)
  insert into public.tickets (nonce, user_id, qr_id, token, special, fixed_species)
  values (public._rand(12, 'abcdefghijklmnopqrstuvwxyz0123456789'), uid,
          case e.kind when 'wild' then 'WILD' when 'safari' then 'SAFARI' else 'RAID' end, e.kind, e.kind, e.species_id)
  returning * into tk;
  res := public._redeem_ticket(uid, null, tk);
  if res ->> 'error' = 'box_full' then raise exception 'BOX_FULL'; end if;
  v_line := (res ->> 'line_id')::int;
  v_mon := (res ->> 'mon_id')::bigint;
  amt := public._catch_exp(g, p_curve);
  update public.tickets set catch_grade = g where id = tk.id;
  perform public._gain_exp(uid, v_mon, amt);
  perform public._recompute(uid);
  update public.raid_encounters set status = 'caught', resolved_at = now(), grade = g where id = e.id;
  select * into c from public.collection where id = v_mon;
  return jsonb_build_object('caught', true, 'fled', false, 'line', v_line, 'species_id', e.species_id,
                            'new', coalesce((res ->> 'is_new')::boolean, false), 'level', c.level, 'exp', amt,
                            'nonce', tk.nonce, 'mon', v_mon, 'box', c.pos / 30 + 1);
end $$;


-- 공이 빗나갔음 (아직 공이 남음) → 서버가 도망 판정. 도망치면 그 만남은 끝 (던진 공 = 놓친 공 수)
create or replace function public.safari_turn(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; e public.raid_encounters; pr numeric; res jsonb;
begin
  select * into e from public.raid_encounters where id = p_id and user_id = uid and kind = 'safari' and status = 'pending' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.turns >= e.balls then raise exception 'NO_BALLS'; end if;
  pr := public._safari_flee_p(e.species_id, e.turns);
  update public.raid_encounters set turns = turns + 1 where id = e.id;
  if random() < pr then
    update public.raid_encounters set throws = e.turns + 1 where id = e.id;
    res := public.encounter_result(p_id, false, 'none', false);
    return res || jsonb_build_object('turn', e.turns + 1, 'rate', pr, 'safari', public._safari_json(uid));
  end if;
  return jsonb_build_object('fled', false, 'turn', e.turns + 1, 'rate', pr,
                            'next_rate', public._safari_flee_p(e.species_id, e.turns + 1));
end $$;

-- 사파리 잡기 결과: 던진 볼 수를 적고 encounter_result 로 마무리 (+ 바뀐 사파리 상태)
--  0037: 잡았다고 해도, 놓친 공 (던진 수 - 1) 중 safari_turn 으로 아직 안 굴린 차례의 도망 판정을 여기서 굴림.
--        safari_turn 에서 이미 도망쳤으면 그 결과를 그대로 (두 번 불러도 같음).
create or replace function public.safari_result(p_id bigint, p_throws int, p_caught boolean, p_grade text default 'none', p_curve boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; e public.raid_encounters; res jsonb;
  th int; caught boolean := coalesce(p_caught, true); k int; server_fled boolean := false;
begin
  select * into e from public.raid_encounters where id = p_id and user_id = uid and kind = 'safari' and status in ('pending', 'fled') for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.status = 'fled' then
    return jsonb_build_object('caught', false, 'fled', true, 'line', (select line_id from public.species where id = e.species_id),
                              'species_id', e.species_id, 'new', false, 'level', null, 'exp', 0, 'safari', public._safari_json(uid));
  end if;
  th := least(e.balls, greatest(0, coalesce(p_throws, e.balls)));
  if caught and th - 1 > e.turns then
    for k in e.turns .. th - 2 loop
      if random() < public._safari_flee_p(e.species_id, k) then caught := false; server_fled := true; th := k + 1; exit; end if;
    end loop;
  end if;
  update public.raid_encounters set throws = th, turns = greatest(turns, th - case when caught then 1 else 0 end) where id = e.id;
  res := public.encounter_result(p_id, caught, p_grade, p_curve);
  return res || jsonb_build_object('safari', public._safari_json(uid), 'server_fled', server_fled);
end $$;



-- rule (0006): every migration that creates functions ends with this block
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
  public.safari_state(), public.safari_encounter(int), public.safari_result(bigint, int, boolean, text, boolean), public.safari_turn(bigint)
to authenticated;
notify pgrst, 'reload schema';
