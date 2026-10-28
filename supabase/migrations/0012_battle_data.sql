-- 0012: 배틀 데이터 — 타입(과목) 상성, 기술, 종족값(능력치 6개), 새 전설 5마리.
-- 데이터는 supabase/seed_battle.sql (tools/gen_battle_data.py 가 만듦) 을 seed.sql 다음에 실행.

-- 새 칸: lines.bonus = 도감 완성·% 계산에서 빠지는 특별 몬스터 (비밀 37, 새 전설 38~42)
alter table public.lines add column if not exists bonus boolean not null default false;
alter table public.species
  add column if not exists hp  smallint, add column if not exists atk smallint, add column if not exists def smallint,
  add column if not exists spa smallint, add column if not exists spd smallint, add column if not exists spe smallint;

create table if not exists public.types (
  name text primary key,
  sort smallint not null default 0
);
-- 기본은 ×1. 여기 있는 칸만 ×2 (효과가 굉장했다) / ×0.5 (효과가 별로인 듯하다)
create table if not exists public.type_chart (
  atk  text not null references public.types on delete cascade,
  def  text not null references public.types on delete cascade,
  mult numeric not null check (mult in (0, 0.5, 2)),
  primary key (atk, def)
);
create table if not exists public.moves (
  id          serial primary key,
  name        text not null unique,
  type        text not null references public.types,
  category    text not null check (category in ('physical', 'special', 'status')),
  kind        text not null check (kind in ('attack', 'status', 'defense')),
  power       smallint not null default 0,
  accuracy    smallint,                       -- null = 반드시 맞음
  pp          smallint not null default 10,
  priority    smallint not null default 0,
  effect      jsonb not null default '{}',
  description text not null default ''
);
create table if not exists public.species_moves (
  species_id int not null references public.species on delete cascade,
  slot       smallint not null check (slot between 1 and 4),
  move_id    int not null references public.moves on delete cascade,
  primary key (species_id, slot)
);

alter table public.types enable row level security;
alter table public.type_chart enable row level security;
alter table public.moves enable row level security;
alter table public.species_moves enable row level security;
drop policy if exists catalog_read on public.types;
drop policy if exists catalog_read on public.type_chart;
drop policy if exists catalog_read on public.moves;
drop policy if exists catalog_read on public.species_moves;
create policy catalog_read on public.types         for select to authenticated using (true);
create policy catalog_read on public.type_chart    for select to authenticated using (true);
create policy catalog_read on public.moves         for select to authenticated using (true);
create policy catalog_read on public.species_moves for select to authenticated using (true);
drop policy if exists admin_write on public.moves;
drop policy if exists admin_write on public.species_moves;
create policy admin_write on public.moves         for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_write on public.species_moves for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 비밀 몬스터도 bonus
update public.lines set bonus = true where secret;
