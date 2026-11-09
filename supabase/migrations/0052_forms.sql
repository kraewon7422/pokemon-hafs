-- 0052: 폼 (Forms) — 한 도감 번호에 여러 모습: 일반 · 선생님 (예: "물리 쌤의 피카츄") · 이벤트 (지우의 피카츄 · 지우개굴닌자)
--  모델
--   · 계열 (lines) 마다 form_kind = 'normal' (야생 · 보통 포켓몬) | 'teacher' (선생님 폼) | 'event' (이상한 소포) | 'special' (교장/교감 · 탐구 · 야자 · 비밀 · 환상 = 학교 특별 전설)
--     family_id = 같은 가족 (진화 계열) 의 '일반' 계열 id (가족 대표). 일반 계열은 자기 자신, 갈래 종만 따로 있는 일반 계열 (쥬피썬더 118 처럼 이브이 117 의
--     도감 번호 일부만 가진 계열) 은 큰 계열 (117) 을 가리킴 → 운영자 · 도감에서 한 가족으로 보임. 선생님 · 이벤트 폼 = 그 가족의 일반 계열.
--     form_label = 이름 앞에 붙는 말 (선생님 폼 = "물리 쌤" — teacher 에서 자동, 이벤트 = "지우"). 이름 = _sp_label(종) / 앱 displayName(종) 한 곳에서.
--   · 종 (species) 마다 form_of = 같은 도감 번호의 일반 폼 종 (선생님 · 이벤트 폼만, 일반은 null) → 도감의 폼 바꾸기 · 그림 따로.
--   · 같은 가족의 폼 = 도감 번호 · 종족값 · 타입 · 기술 · 배우는 기술 · 진화 길 (모양) 이 같고, 그림 (species.sprite) · 이름 앞말 · 얻는 방법만 다름
--     (이벤트 폼은 원래 자기 종족값 · 기술 그대로).
--  바꾸기 (학생 기록은 그대로 — collection 을 하나도 고치지 않음)
--   · 지금의 선생님 계열 L (68개, 교장/교감 35 · 36 은 special) = 그대로 '선생님 폼'. 새 '일반 폼' 계열 B = 1000 + L, 종 = 원래 종 id + 20000
--     (갈래 종 10107 → 30107), 이름 · 종족값 · 타입 · 특성 · 기술 · 배우는 기술 · 진화 길을 L 에서 복사, 그림은 비워 둠 (앱이 같은 그림판 칸을 씀).
--     B 는 subject '야생' → 야생 · QR 야생 · 걷기 · 사파리 (구역 타입 규칙 그대로, 용의 굴 600족 = 미뇽 · 애버라스 · 아공이 · 메탕 · 딥상어동 일반 폼) · 알 · 연습 배틀 상대에 나옴.
--   · 선생님 폼은 장소 QR (qr_rewards) · 퀴즈 · _school_line 으로만: 알 (egg_hatch) · 연습 배틀 상대 (battle_start_cpu) 에서 빠짐 (예전엔 섞여 나왔음).
--   · 이벤트 폼: 지우의 피카츄 (종 1324, 계열 442) = 피카츄 가족 (도감 25), 지우개굴닌자 (1321, 441) = 개굴닌자 가족 (658). 종 id 그대로 → 받은 포켓몬 그대로.
--     소포로만 · 도감 수에 안 셈 (_seen_dex 에서 뺌). 도감 끝 '이벤트' 칸 대신 그 번호의 폼으로 보임.
--  셈
--   · 학교 (_school_keys 그대로 = 선생님 · 특별 계열의 도감 번호, active) — 채운 칸 = 선생님 · 특별 폼 종을 본 적 있는 번호 (_seen_school, 새로).
--     예전엔 _seen_dex (아무 폼) 라서 야생 홍수몬 (103) 을 잡아도 체육 쌤 배루키 계열 (33) 의 107 칸이 채워졌음 → 이제 안 채워짐.
--     _dex_rewards · _dex_unreward · _unlock_progress (0051 해금) · _dex_complete 가 _seen_school 을 씀. 꺼진 선생님 폼으로 잡은 것도 계속 셈.
--   · 전체 = 도감 번호마다 한 칸, 어느 폼이든 한 번 (이벤트 폼 빼고). 야생 탭 = 일반 폼.
--  운영자 (admin.js 포켓몬 탭: 가족별 목록 · 선생님 찾기)
--   · admin_create_teacher_form(가족, 선생님, 과목, p_move_from, p_replace) — 가족 = 일반 계열 (family_id = id). 새 계열 id 2000+, 종 id 40001+
--     (일반 폼 종을 복사, form_of 로 이어짐). 가족에 켜진 선생님 폼이 있으면 HAS_TEACHER (p_replace = 그것을 끄고 새로). p_move_from = 다른 가족의
--     선생님 폼 → 퀴즈 · 장소 QR 보상을 새 폼으로 옮기고 원래 폼은 끔 (= 선생님을 다른 포켓몬으로 옮기기). 갈래 가족 (이브이 …) 도 됨 (진화 = 그 폼 안의 갈래).
--   · admin_set_form_active(계열, 켜기) — 선생님 폼 켜기/끄기 (끄면 학교 도감 칸에서 빠짐 · QR/퀴즈에서 안 나옴 · 학생이 잡은 것은 그대로).
--   · admin_rename_teacher(계열, 선생님, 과목) — 이름 · 과목 (이름 앞말 form_label 은 트리거가 맞춤).
--   · admin_assign_teacher (0032/0049, 계열을 통째로 바꾸던 것) 지움. 일반 계열의 subject 를 직접 바꾸는 것도 막음 (USE_TEACHER_FORM).
--   · admin_create_gift: p_species (이벤트 폼 등 종을 바로) — 도감 번호만 주면 그 번호의 일반 폼 (_dex_sp 가 일반 폼 먼저).
--  seed: tools/gen_pokemon.py 의 seed_pokemon.sql 끝에서 _forms_build() 를 부름 (있을 때만) → 새 DB 도 같은 구조, seed 를 다시 돌려도 복사본이 맞춰짐.
--  그림: 일반 폼 종 (20000+) 은 sprite 없음 → 앱 sprites.js 가 같은 도감 번호의 그림판 칸을 씀 (그림판 칸을 늘리지 않음). 선생님 얼굴 그림 = 그 폼 종의 sprite 만.

-- ── 1. 열 ───────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.lines add column if not exists family_id int references public.lines(id) on delete set null;
alter table public.lines add column if not exists form_kind text;
alter table public.lines add column if not exists form_label text;
alter table public.lines drop constraint if exists lines_form_kind_check;
alter table public.lines add constraint lines_form_kind_check check (form_kind is null or form_kind in ('normal', 'teacher', 'event', 'special'));
create index if not exists lines_family_idx on public.lines (family_id);
alter table public.species add column if not exists form_of int references public.species(id) on delete set null;
create index if not exists species_form_of_idx on public.species (form_of);

-- ── 2. 이름 앞말 · 이름 ───────────────────────────────────────────────────────────────────────────────────────
-- '물리 선생님' → '물리 쌤', '국어 선생님 1' → '국어 1 쌤', 'AI 선생님' → 'AI 쌤', '김민수' → '김민수 쌤', '수학쌤' → '수학쌤'
create or replace function public._teacher_label(t text) returns text
language sql immutable set search_path = '' as $$
  select case
    when coalesce(btrim(t), '') = '' then null
    when t ~ '선생님' then btrim(regexp_replace(regexp_replace(btrim(t), '\s*선생님\s*([0-9]+)$', ' \1 쌤'), '\s*선생님$', ' 쌤'))
    when t ~ '쌤' then btrim(t)
    else btrim(t) || ' 쌤' end
$$;

-- 보여 줄 이름: 선생님 폼 = "물리 쌤의 피카츄", 나머지 = 종 이름 (이벤트 폼은 이름에 이미 '지우의')
create or replace function public._sp_label(sp int) returns text
language sql stable security definer set search_path = '' as $$
  select case when l.form_kind = 'teacher' and coalesce(l.form_label, '') <> '' then l.form_label || '의 ' || s.name else s.name end
  from public.species s join public.lines l on l.id = s.line_id where s.id = sp
$$;

-- ── 3. 계열 지킴이: 일반 ↔ 선생님을 subject 로 바꾸지 않음 (폼을 만들고 끔), 선생님 폼 이름 앞말 자동 ─────────────────────
drop trigger if exists lines_no_branch_teacher on public.lines;
create or replace function public._lines_form_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.form_kind = 'normal' and new.subject is distinct from '야생' then raise exception 'USE_TEACHER_FORM'; end if;
    if old.form_kind = 'teacher' and new.subject = '야생' then raise exception 'USE_TEACHER_FORM'; end if;
  end if;
  if new.form_kind = 'teacher' then new.form_label := public._teacher_label(new.teacher); end if;
  return new;
end $$;
drop trigger if exists lines_form_guard on public.lines;
create trigger lines_form_guard before insert or update on public.lines
  for each row execute function public._lines_form_guard();

-- ── 4. 폼 만들기 · 맞추기 ─────────────────────────────────────────────────────────────────────────────────────
-- 선생님 폼 T (운영자가 만든 것, 종.form_of = 일반 폼 종) 의 기술 · 배우는 기술 · 진화 길을 일반 폼에서 채움 (없는 것만)
create or replace function public._forms_copy_children(p_line int) returns void
language plpgsql security definer set search_path = '' as $$
declare fam int := (select family_id from public.lines where id = p_line);
begin
  insert into public.species_moves (species_id, slot, move_id)
  select t.id, sm.slot, sm.move_id from public.species t join public.species_moves sm on sm.species_id = t.form_of
   where t.line_id = p_line
  on conflict do nothing;
  insert into public.learnset (line_id, move_id, lv, how)
  select p_line, ls.move_id, ls.lv, ls.how from public.learnset ls where ls.line_id = fam
  on conflict do nothing;
  insert into public.evolutions (from_species, to_species, how, lv, sort)
  select ta.id, tb.id, e.how, e.lv, e.sort
    from public.evolutions e
    join public.species ta on ta.form_of = e.from_species and ta.line_id = p_line
    join public.species tb on tb.form_of = e.to_species and tb.line_id = p_line
  on conflict do nothing;
end $$;

-- 모든 계열을 폼 구조에 맞춤 (여러 번 불러도 같음). migration 과 seed_pokemon.sql 끝에서 부름
create or replace function public._forms_build() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tl public.lines; b int; n_copy int := 0; n_sp int := 0; x int;
begin
  -- a. 아직 모르는 계열 나누기
  update public.lines set form_kind = case
      when subject = '야생' and legend_src = 'gift' then 'event'
      when subject = '야생' then 'normal'
      when bonus or secret or mythic or rarity = 'legendary' then 'special'
      else 'teacher' end
   where form_kind is null;
  -- b. seed 의 선생님 계열 (id < 1000) → 일반 폼 B = 1000 + id 를 만들고 맞춤 (L 이 원본)
  for tl in select * from public.lines where form_kind = 'teacher' and id < 1000 order by id loop
    b := 1000 + tl.id;
    insert into public.lines (id, teacher, subject, rarity, active, max_stage, withdrawn, btype, base_hp, base_atk, base_def, base_spd,
                              secret, bonus, mythic, ultra, legend_src, form_kind, family_id, form_label)
    values (b, '야생 포켓몬', '야생', tl.rarity, true, tl.max_stage, false, tl.btype, tl.base_hp, tl.base_atk, tl.base_def, tl.base_spd,
            false, false, false, false, null, 'normal', null, null)
    on conflict (id) do update set rarity = excluded.rarity, max_stage = excluded.max_stage, btype = excluded.btype,
      base_hp = excluded.base_hp, base_atk = excluded.base_atk, base_def = excluded.base_def, base_spd = excluded.base_spd;
    insert into public.species (id, line_id, stage, name, category, flavor, height, weight, hp, atk, def, spa, spd, spe, sprite, btype, dex,
                                evo_lv, sprite_shiny, evo_item, abilities, hidden_ability, form_of)
    select s.id + 20000, b, s.stage, s.name, s.category, s.flavor, s.height, s.weight, s.hp, s.atk, s.def, s.spa, s.spd, s.spe, null, s.btype, s.dex,
           s.evo_lv, null, s.evo_item, s.abilities, s.hidden_ability, null
      from public.species s where s.line_id = tl.id
    on conflict (id) do update set line_id = excluded.line_id, stage = excluded.stage, name = excluded.name, category = excluded.category,
      flavor = excluded.flavor, height = excluded.height, weight = excluded.weight, hp = excluded.hp, atk = excluded.atk, def = excluded.def,
      spa = excluded.spa, spd = excluded.spd, spe = excluded.spe, btype = excluded.btype, dex = excluded.dex, evo_lv = excluded.evo_lv,
      evo_item = excluded.evo_item, abilities = excluded.abilities, hidden_ability = excluded.hidden_ability, form_of = null;
    get diagnostics x = row_count; n_sp := n_sp + x;
    update public.species set form_of = id + 20000 where line_id = tl.id and form_of is distinct from id + 20000;
    -- 원본에 없는 복사 종 (계열 단계가 줄어든 경우): 아무도 안 가리키면 지움
    delete from public.species x2 where x2.line_id = b
       and not exists (select 1 from public.species s where s.line_id = tl.id and s.id + 20000 = x2.id)
       and not exists (select 1 from public.collection c where c.species_id = x2.id)
       and not exists (select 1 from public.tickets t where t.result_species = x2.id or t.fixed_species = x2.id)
       and not exists (select 1 from public.raids r where r.species_id = x2.id)
       and not exists (select 1 from public.raid_encounters e where e.species_id = x2.id);
    delete from public.species_moves where species_id in (select id from public.species where line_id = b);
    insert into public.species_moves (species_id, slot, move_id)
    select sm.species_id + 20000, sm.slot, sm.move_id from public.species_moves sm join public.species s on s.id = sm.species_id
     where s.line_id = tl.id and exists (select 1 from public.species y where y.id = sm.species_id + 20000);
    delete from public.learnset where line_id = b;
    insert into public.learnset (line_id, move_id, lv, how) select b, move_id, lv, how from public.learnset where line_id = tl.id;
    delete from public.evolutions where from_species in (select id from public.species where line_id = b)
                                     or to_species in (select id from public.species where line_id = b);
    insert into public.evolutions (from_species, to_species, how, lv, sort)
    select e.from_species + 20000, e.to_species + 20000, e.how, e.lv, e.sort
      from public.evolutions e join public.species s on s.id = e.from_species
     where s.line_id = tl.id and exists (select 1 from public.species y where y.id = e.to_species + 20000);
    update public.lines set family_id = b where id = tl.id and family_id is distinct from b;
    n_copy := n_copy + 1;
  end loop;
  -- c. 가족: 일반 · 특별 = 자기 자신, 그다음 갈래 종만 따로 있는 일반 계열 → 그 도감 번호를 모두 가진 더 큰 일반 계열
  update public.lines set family_id = id where form_kind in ('normal', 'special') and family_id is distinct from id;
  with d as (select l.id, array_agg(distinct s.dex) dx from public.lines l join public.species s on s.line_id = l.id
              where l.form_kind = 'normal' and s.dex is not null group by l.id)
  update public.lines t set family_id = p.big
    from (select a.id, (select y.id from d y where y.id <> a.id and y.dx @> a.dx and cardinality(y.dx) > cardinality(a.dx)
                         order by cardinality(y.dx) desc, y.id limit 1) big from d a) p
   where p.id = t.id and p.big is not null;
  -- d. 선생님 폼 (운영자가 만든 것) 의 기술 · 진화 길 채우기
  for x in select id from public.lines where form_kind = 'teacher' and id >= 1000 loop
    perform public._forms_copy_children(x);
  end loop;
  -- e. 이벤트 폼: 같은 도감 번호의 일반 폼 종 (가족 대표 계열 먼저) · 그 가족
  update public.species e set form_of = (
      select n.id from public.species n join public.lines nl on nl.id = n.line_id
       where nl.form_kind = 'normal' and n.dex = e.dex order by (nl.family_id = nl.id) desc, n.id limit 1)
    from public.lines l where l.id = e.line_id and l.form_kind = 'event';
  update public.lines l set family_id = coalesce((
      select nl.family_id from public.species e join public.species n on n.id = e.form_of join public.lines nl on nl.id = n.line_id
       where e.line_id = l.id order by e.id limit 1), l.id)
   where l.form_kind = 'event';
  -- f. 선생님 폼 이름 앞말 (트리거와 같은 셈, 예전 줄)
  update public.lines set form_label = public._teacher_label(teacher) where form_kind = 'teacher' and form_label is distinct from public._teacher_label(teacher);
  return jsonb_build_object('copies', n_copy, 'species', n_sp,
    'teacher', (select count(*) from public.lines where form_kind = 'teacher'),
    'normal', (select count(*) from public.lines where form_kind = 'normal'),
    'event', (select count(*) from public.lines where form_kind = 'event'),
    'special', (select count(*) from public.lines where form_kind = 'special'));
end $$;

-- ── 5. 이벤트 폼: 도감 번호 25 · 658 (종 · 계열 id 그대로) ────────────────────────────────────────────────────
update public.species set dex = 658 where id = 1321 and dex is distinct from 658;
update public.species set dex = 25 where id = 1324 and dex is distinct from 25;
update public.lines set form_kind = 'event', form_label = '지우' where id in (441, 442);

-- ── 6. 바꾸기 실행 ─────────────────────────────────────────────────────────────────────────────────────────
select public._forms_build();

-- ── 7. 셈: 학교 = 선생님 · 특별 폼으로 채운 칸, 전체 = 이벤트 폼 빼고 ──────────────────────────────────────────────
create or replace function public._seen_school(uid uuid) returns setof int
language sql stable security definer set search_path = '' as $$
  select distinct coalesce(s.dex, -s.id) from public.species s join public.lines l on l.id = s.line_id
   where s.id in (select public._seen_species(uid)) and l.subject <> '야생'
$$;

create or replace function public._seen_dex(uid uuid) returns setof int
language sql stable security definer set search_path = '' as $$
  select distinct coalesce(s.dex, -s.id) from public.species s join public.lines l on l.id = s.line_id
   where s.id in (select public._seen_species(uid)) and l.form_kind is distinct from 'event'
$$;

-- 도감 번호 → 종: 일반 폼 (가족 대표 계열) 먼저 → 소포 (admin_create_gift p_dex) · 전설 퀘스트 · 메타몽이 보통 포켓몬을 가리킴
create or replace function public._dex_sp(p_dex int) returns int
language sql stable security definer set search_path = '' as $$
  select s.id from public.species s join public.lines l on l.id = s.line_id where s.dex = p_dex
   order by (coalesce(l.form_kind, 'normal') <> 'normal'), (l.family_id is distinct from l.id), s.stage, s.id limit 1
$$;



-- ── 8. 함수 고침 (최근 정의 + 바뀐 곳만) ────────────────────────────────────────────────────────────────────

-- 학교 셈: _seen_dex → _seen_school

-- (from 0051_unlock.sql)
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
  select count(*), count(*) filter (where k in (select public._seen_school(uid)))
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

-- (from 0049_core_fixes.sql)
create or replace function public._dex_unreward(uid uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare total int; got int;
begin
  select count(*), count(*) filter (where k in (select public._seen_school(uid)))
    into total, got
  from public._school_keys() k;
  if total = 0 then return; end if;
  if got * 2 < total then delete from public.tickets where user_id = uid and special = 'dex50' and status = 'pending'; end if;
  if got < total then
    delete from public.tickets where user_id = uid and special = 'dex100' and status = 'pending';
    delete from public.inventory where user_id = uid and item = 'shiny_charm';            -- 0042: 도감이 다시 비면 부적도 거둠
    delete from public.notices where user_id = uid and kind = 'charm' and seen_at is null;
  end if;
end $function$;

-- (from 0051_unlock.sql)
create or replace function public._unlock_progress(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with x as (
    select count(*)::int as total, (count(*) filter (where k in (select public._seen_school(uid))))::int as got
    from public._school_keys() k)
  select jsonb_build_object('got', x.got, 'total', x.total, 'need', ceil(x.total * public._unlock_pct() / 100.0)::int, 'pct', public._unlock_pct())
  from x
$$;

-- (from 0042_shiny.sql)
create or replace function public._dex_complete(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) > 0 and count(*) = count(*) filter (where k in (select public._seen_school(uid)))
  from (select distinct coalesce(s.dex, -s.id) k from public.species s join public.lines l on l.id = s.line_id
         where not l.bonus and not l.secret and not l.withdrawn and l.active and l.subject <> '야생') x
$$;

-- 선생님 폼은 알 · 연습 배틀 상대에서 빠짐 (장소 QR · 퀴즈로만)

-- (from 0049_core_fixes.sql)
create or replace function public.egg_hatch(p_egg bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

  -- 0049: 울트라비스트 (lines.ultra) 는 알에서 안 나옴 (울트라 스페이스에서만)
  if e.tier = 'purple' and random() < coalesce((public._setting('egg_legend'))::numeric, 0.1) then
    select l.id into v_line from public.lines l
     where l.rarity = 'legendary' and l.active and not l.withdrawn and not l.mythic and not l.secret and not l.bonus and not l.ultra and l.form_kind is distinct from 'teacher'
       and exists (select 1 from public.species s where s.line_id = l.id and s.stage = 1)
     order by random() limit 1;
  end if;
  if v_line is null then
    select l.id into v_line from public.lines l
     where l.rarity = (case when e.tier = 'green' then 'common' else 'rare' end)
       and l.active and not l.withdrawn and not l.mythic and not l.secret and not l.bonus and not l.ultra and l.form_kind is distinct from 'teacher'
       and exists (select 1 from public.species s where s.line_id = l.id and s.stage = 1)
     order by random() limit 1;
  end if;
  if v_line is null then
    select l.id into v_line from public.lines l
     where l.rarity = 'common' and l.active and not l.withdrawn and not l.mythic and not l.secret and not l.bonus and not l.ultra and l.form_kind is distinct from 'teacher'
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
end $function$;

-- (from 0049_core_fixes.sql)
create or replace function public.battle_start_cpu(p_mons bigint[], p_format text default 'single'::text, p_fair boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare uid uuid := auth.uid(); mine int[]; foe int[] := '{}'; used int[]; x int; y int; yl int; fmt text := coalesce(p_format, 'single');
  b public.battles; lv int;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  if fmt not in ('single', 'double') then raise exception 'BAD_FORMAT'; end if;
  perform public._assert_open();
  perform public._bt_no_pvp(uid);
  mine := public._bt_team(uid, p_mons, 6);
  if cardinality(mine) < public._bt_min(fmt) then raise exception 'DOUBLE_NEEDS_2'; end if;
  used := array(select c.line_id from public.collection c where c.id = any (p_mons));
  foreach x in array mine loop
    y := null; yl := null;
    select s.id, s.line_id into y, yl from public.species s join public.lines l on l.id = s.line_id
     where l.active and not l.withdrawn and not l.secret and not l.bonus and not l.ultra and l.rarity <> 'legendary' and l.form_kind is distinct from 'teacher'   -- 0049: 울트라비스트 상대 없음
       and s.stage = (select stage from public.species where id = x) and s.line_id <> all (used)
     order by random() limit 1;
    if y is null then raise exception 'BAD_TEAM'; end if;
    foe := foe || y; used := used || yl;
  end loop;
  select round(avg(level))::int into lv from public.collection where user_id = uid and id = any (p_mons);
  perform public._bt_close_mine(uid);
  b := public._bt_new(uid, 'cpu', null, mine, foe, fmt, coalesce(p_fair, false), coalesce(lv, 50), p_mons, null);
  return public._bt_json(b, uid);
end $function$;

-- 배틀 속 이름 = 보여 줄 이름 ("물리 쌤의 피카츄")

-- (from 0039_abilities.sql)
create or replace function public._bt_mon(p_sp int, p_lv int, p_moves int[], p_held text, p_ab text default null) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select jsonb_build_object(
    'sp', s.id, 'line', s.line_id, 'name', public._sp_label(s.id), 'lv', p_lv,
    'type', coalesce(s.btype, l.btype, '노말'),
    'hp', public._bt_statl(s.hp, true, p_lv), 'max', public._bt_statl(s.hp, true, p_lv),
    'atk', public._bt_statl(s.atk, false, p_lv), 'def', public._bt_statl(s.def, false, p_lv), 'spa', public._bt_statl(s.spa, false, p_lv),
    'spd', public._bt_statl(s.spd, false, p_lv), 'spe', public._bt_statl(s.spe, false, p_lv),
    'moves', coalesce(
      (select jsonb_agg(jsonb_build_object('id', m.id, 'pp', m.pp) order by u.o) from unnest(p_moves) with ordinality u(x, o) join public.moves m on m.id = u.x),
      (select jsonb_agg(jsonb_build_object('id', m.id, 'pp', m.pp) order by sm.slot) from public.species_moves sm join public.moves m on m.id = sm.move_id
        where sm.species_id = s.id), '[]'),
    'held', it.key, 'hold', coalesce(it.effect, '{}'), 'heldname', it.name,
    -- 특성: 내 포켓몬 = collection.ability, 연습 상대 = 그 종의 특성 중 하나 (가끔 숨겨진 특성)
    'ab', coalesce(p_ab, case when s.hidden_ability is not null and random() < coalesce((public._setting('ability_hidden_chance'))::numeric, 0.05)
                              then s.hidden_ability else s.abilities[1 + floor(random() * greatest(1, coalesce(cardinality(s.abilities), 1)))::int] end),
    'st', null, 'slp', 0, 'frz', 0, 'cnf', 0, 'rch', false, 'used', false, 'stg', '{}'::jsonb, 'prot', 0, 'out', false)
  from public.species s join public.lines l on l.id = s.line_id left join public.items it on it.key = p_held and it.pocket = 'hold'
  where s.id = p_sp
$$;

-- (from 0015_battles.sql)
create or replace function public._bt_mon(p_sp int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sp', s.id, 'line', s.line_id, 'name', public._sp_label(s.id),
    'type', coalesce(l.btype, case when l.subject = '비밀' then '전설' else l.subject end),
    'hp', public._bt_stat(s.hp, true), 'max', public._bt_stat(s.hp, true),
    'atk', public._bt_stat(s.atk, false), 'def', public._bt_stat(s.def, false), 'spa', public._bt_stat(s.spa, false),
    'spd', public._bt_stat(s.spd, false), 'spe', public._bt_stat(s.spe, false),
    'moves', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'pp', m.pp) order by sm.slot)
                       from public.species_moves sm join public.moves m on m.id = sm.move_id where sm.species_id = s.id), '[]'),
    'st', null, 'slp', 0, 'stg', '{}'::jsonb, 'prot', 0)
  from public.species s join public.lines l on l.id = s.line_id where s.id = p_sp
$$;


-- ── 9. 운영자: 선생님 폼 만들기 · 켜기/끄기 · 이름 ────────────────────────────────────────────────────────────────
drop function if exists public.admin_assign_teacher(int, int);

create or replace function public.admin_create_teacher_form(p_family int, p_teacher text, p_subject text, p_move_from int default null, p_replace boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare f public.lines; mv public.lines; nid int; base int; t text := btrim(coalesce(p_teacher, '')); sj text := btrim(coalesce(p_subject, ''));
  off int[] := '{}'; nq int := 0; nr int := 0;
begin
  perform public._assert_admin();
  select * into f from public.lines where id = p_family for update;
  if not found or f.form_kind is distinct from 'normal' or f.family_id is distinct from f.id then raise exception 'NOT_FAMILY'; end if;
  if not exists (select 1 from public.species where line_id = f.id) then raise exception 'NOT_FAMILY'; end if;
  if char_length(t) not between 1 and 40 or char_length(sj) not between 1 and 20 or sj = '야생' then raise exception 'BAD_TEACHER'; end if;
  if p_move_from is not null then
    select * into mv from public.lines where id = p_move_from and form_kind = 'teacher' for update;
    if not found then raise exception 'NOT_TEACHER_FORM'; end if;
    if mv.family_id = f.id then raise exception 'SAME_FAMILY'; end if;
  end if;
  if exists (select 1 from public.lines where family_id = f.id and form_kind = 'teacher' and active) then
    if not coalesce(p_replace, false) then raise exception 'HAS_TEACHER'; end if;
    select coalesce(array_agg(id), '{}') into off from public.lines where family_id = f.id and form_kind = 'teacher' and active;
    update public.lines set active = false where id = any (off);
  end if;
  perform pg_advisory_xact_lock(hashtext('forms:new'));
  nid := greatest(2000, (select coalesce(max(id), 0) from public.lines) + 1);
  base := greatest(40000, (select coalesce(max(id), 0) from public.species where id >= 40000));
  insert into public.lines (id, teacher, subject, rarity, active, max_stage, withdrawn, btype, base_hp, base_atk, base_def, base_spd,
                            secret, bonus, mythic, ultra, legend_src, form_kind, family_id)
  values (nid, t, sj, f.rarity, true, f.max_stage, false, f.btype, f.base_hp, f.base_atk, f.base_def, f.base_spd,
          false, false, false, false, null, 'teacher', f.id);
  insert into public.species (id, line_id, stage, name, category, flavor, height, weight, hp, atk, def, spa, spd, spe, sprite, btype, dex,
                              evo_lv, sprite_shiny, evo_item, abilities, hidden_ability, form_of)
  select base + row_number() over (order by s.stage, s.id), nid, s.stage, s.name, s.category, s.flavor, s.height, s.weight,
         s.hp, s.atk, s.def, s.spa, s.spd, s.spe, null, s.btype, s.dex, s.evo_lv, null, s.evo_item, s.abilities, s.hidden_ability, s.id
    from public.species s where s.line_id = f.id;
  perform public._forms_copy_children(nid);
  if p_move_from is not null then
    update public.quizzes set line_id = nid where line_id = mv.id;
    get diagnostics nq = row_count;
    update public.qr_rewards set line_id = nid where line_id = mv.id;
    get diagnostics nr = row_count;
    update public.lines set active = false where id = mv.id;
  end if;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin',
    jsonb_build_object('teacher_form', t, 'subject', sj, 'family', f.id, 'line', nid, 'moved_from', p_move_from, 'turned_off', off));
  return jsonb_build_object('ok', true, 'line', nid, 'family', f.id, 'teacher', t, 'subject', sj, 'label', public._teacher_label(t),
    'moved_from', p_move_from, 'quizzes', nq, 'qr_rewards', nr, 'turned_off', to_jsonb(off),
    'species', (select jsonb_agg(id order by stage, id) from public.species where line_id = nid));
end $$;

create or replace function public.admin_set_form_active(p_line int, p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.lines;
begin
  perform public._assert_admin();
  select * into l from public.lines where id = p_line for update;
  if not found or l.form_kind is distinct from 'teacher' then raise exception 'NOT_TEACHER_FORM'; end if;
  if coalesce(p_active, false) and exists (select 1 from public.lines where family_id = l.family_id and form_kind = 'teacher' and active and id <> l.id) then
    raise exception 'HAS_TEACHER';
  end if;
  update public.lines set active = coalesce(p_active, false) where id = l.id;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('form_active', l.id, 'active', coalesce(p_active, false)));
  return jsonb_build_object('ok', true, 'line', l.id, 'active', coalesce(p_active, false), 'school_total', (select count(*) from public._school_keys()));
end $$;

create or replace function public.admin_rename_teacher(p_line int, p_teacher text, p_subject text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.lines; t text := btrim(coalesce(p_teacher, '')); sj text := btrim(coalesce(p_subject, ''));
begin
  perform public._assert_admin();
  select * into l from public.lines where id = p_line for update;
  if not found or l.form_kind is distinct from 'teacher' then raise exception 'NOT_TEACHER_FORM'; end if;
  if char_length(t) not between 1 and 40 or char_length(sj) not between 1 and 20 or sj = '야생' then raise exception 'BAD_TEACHER'; end if;
  update public.lines set teacher = t, subject = sj where id = l.id returning * into l;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('rename_teacher', l.id, 'teacher', t, 'subject', sj));
  return jsonb_build_object('ok', true, 'line', l.id, 'teacher', l.teacher, 'subject', l.subject, 'label', l.form_label);
end $$;

-- 소포: 종을 바로 (p_species, 이벤트 폼) 또는 도감 번호 (그 번호의 일반 폼)
drop function if exists public.admin_create_gift(text, text, int, text, int, timestamptz, timestamptz, int);
create or replace function public.admin_create_gift(p_code text, p_title text, p_dex integer, p_item text, p_qty integer, p_starts timestamptz,
                                                   p_ends timestamptz, p_max integer, p_species integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare k text := public._gift_norm(p_code); sp int; g public.gift_codes; mon boolean := p_dex is not null or p_species is not null;
begin
  perform public._assert_admin();
  if char_length(k) not between 2 and 40 then raise exception 'BAD_GIFT_CODE'; end if;
  if mon = (nullif(btrim(coalesce(p_item, '')), '') is not null) then raise exception 'BAD_GIFT_REWARD'; end if;
  if p_species is not null then
    select id into sp from public.species where id = p_species;
    if sp is null then raise exception 'BAD_SPECIES'; end if;
  elsif p_dex is not null then
    sp := public._dex_sp(p_dex);
    if sp is null then raise exception 'BAD_SPECIES'; end if;
  elsif p_item <> 'evo_stone' and not exists (select 1 from public.items where key = p_item) then raise exception 'BAD_ITEM';
  end if;
  if coalesce(p_qty, 1) not between 1 and (case when mon then 6 else 99 end) then raise exception 'BAD_QTY'; end if;
  if p_starts is not null and p_ends is not null and p_ends <= p_starts then raise exception 'BAD_RANGE'; end if;
  if exists (select 1 from public.gift_codes where code = k) then raise exception 'GIFT_EXISTS'; end if;
  insert into public.gift_codes (code, title, species_id, item, qty, starts_at, ends_at, max_claims, created_by)
  values (k, nullif(btrim(coalesce(p_title, '')), ''), sp, case when not mon then p_item end, coalesce(p_qty, 1),
          p_starts, p_ends, case when p_max > 0 then p_max end, auth.uid())
  returning * into g;
  return to_jsonb(g);
end $$;


-- rule (0006): every migration that creates functions ends with this block (copied from 0051_unlock.sql − admin_assign_teacher,
--   admin_create_gift + p_species, + 0052 admin_create_teacher_form · admin_set_form_active · admin_rename_teacher;
--   helpers _teacher_label · _sp_label · _forms_build · _forms_copy_children · _seen_school · _lines_form_guard are internal, not granted)
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
  public.admin_give_egg(text, text, int), public.admin_set_class(text, int, text),
  public.catch_bonus(text, text, boolean),
  public.catch_config(), public.catch_result(text, text, boolean, boolean), public.my_encounters(),
  public.encounter_result(bigint, boolean, text, boolean),
  public.safari_state(), public.safari_encounter(int, text, text, int), public.safari_result(bigint, int, boolean, text, boolean), public.safari_turn(bigint),
  -- 0038
  public.safari_throws(bigint, int), public.notice_seen(bigint[]), public.gift_claim(text),
  public.legend_encounter(int), public.legend_result(bigint, boolean, text, boolean),
  public.admin_create_gift(text, text, int, text, int, timestamptz, timestamptz, int, int), public.admin_list_gifts(), public.admin_set_gift(bigint, boolean),
  public.admin_delete_gift(bigint), public.admin_encounter_age(bigint, int),
  public.admin_roam_spots(timestamptz),
  public.my_abilities(), public.admin_bt_sim(jsonb),
  -- 0041
  public.set_nickname(text), public.admin_clear_nickname(text),
  -- 0048
  public.safari_visit(text),
  -- 0051
  public.admin_unlock_stats(),
  -- 0052
  public.admin_create_teacher_form(int, text, text, int, boolean), public.admin_set_form_active(int, boolean),
  public.admin_rename_teacher(int, text, text)
to authenticated;
notify pgrst, 'reload schema';
