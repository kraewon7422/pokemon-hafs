-- 0049: 핵심 고침 — 울트라비스트는 울트라 스페이스에서만 · 사파리 잡기 뒤 다시 던지기 장면 막기 · 갈래 진화 무작위 · 학교 도감 = 학교 탭 · 멜탄 빼기
--  A. 울트라비스트 (lines.ultra, 텅비드 · 매시붕 …): 무작위로 고르는 곳 어디에서도 안 나옴 — 알 부화 (egg_hatch, 초록 알의 common 풀에 섞여 있었음),
--     연습 배틀 상대 (battle_start_cpu), QR 에 운영자가 넣은 보상 (_draw_line), 메타몽 변신 (_ditto_roll). 걸음 · QR 야생 · 사파리 (_wild_line ·
--     _wild_line_zone) 은 0038 부터 이미 뺐고, 'ultra' 구역 (울트라 스페이스) 만 울트라비스트를 고름. 방랑 (_roam_roll) 은 방랑 전설만.
--  B. 사파리존에서 잡은 뒤 다시 던지기 장면 (원인): 잡으면 서버가 특별 티켓 (SAFARI · WILD · LEGEND · ROAM · 잡기 레이드) 을 만들어 바로 박스에 넣고,
--     sync 의 tickets 에 '받은 티켓' 으로 나옴. 앱은 '이미 축하한 티켓' 을 기기 (kv celebrated) 에만 적는데, 잡기 장면이 끝난 뒤에야 적었고
--     (잡는 중 · 축하 중 새로 고침 · 응답이 끊긴 결과를 나중에 다시 보냄 = 안 적힘) → 다음 sync 에서 부스 티켓처럼 몬스터볼 3개 던지기 장면이 다시 뜸.
--     고침: tickets 에 'graded' (= catch_grade 가 이미 있음: 앱 안 잡기 장면에서 잡은 티켓 · 이미 잡기 보너스를 받은 티켓) → 앱은 그런 티켓을
--     던지기 장면 없이 '잡았다' 알림만 (한 번). 앱도 결과를 받는 순간 바로 적음 (app.js). safari_result 는 0038 부터 다시 보내도 같은 결과 (replay),
--     끝난 만남은 safari_state.pending · my_encounters 에 안 나옴 (그대로, 시험 [58]).
--  C. 갈래 진화 (이브이 · 킬리아 · 배루키 · 코스모움 … evolutions 에서 한 종에 길이 여럿): 고르지 않음 — 서버가 같은 확률로 고름 (p_to 는 무시, PICK_BRANCH 없음).
--     진화 레벨이 된 레벨 갈래가 있으면 그중에서 (진화의 돌 없이 100%), 없으면 진화의 돌 1개로 모든 갈래 중에서
--     (돌 갈래 = 100%, 레벨 갈래를 일찍 = 예전처럼 evo_prob 확률). 돌 조건은 그대로. 결과 'branched' · 'options'.
--     갈래 계열은 선생님 포켓몬으로 쓰지 않음: admin_assign_teacher 가 갈래 계열로 옮기기를 'BRANCH_LINE' 으로 거절.
--  D. 학교 도감 (도감 50% · 100% 특별 티켓 · 빛나는 부적) = 도감의 '학교' 탭에 늘 보이는 칸과 같은 셈 (_school_keys):
--     야생이 아닌 계열 (선생님 · 교장/교감 · 탐구 활동 · 야자 전설, 갈래 종 포함), active · not withdrawn, 잡기 전엔 안 보이는 비밀 (뮤) · 환상 (79~82) 은 빼고,
--     보상으로 받는 계열 (dex_rewards 의 50 · 100 = 뮤츠 · 지가르데) 도 뺌 (받는 것을 조건에 넣으면 100% 가 안 됨). 이벤트 포켓몬 (810 · 811) 은 야생 계열이라 빠짐.
--     sync rules.school_keys = 그 칸 (전국도감 번호) 목록 → 앱의 '학교 n / N' 도 같은 목록으로 셈.
--  E. 멜탄 · 멜메탈 (계열 440, 도감 808 · 809, 소포 전용) 빼기: 가진 학생은 그 포켓몬을 지우고 진화의 돌 1개씩 (item_log 'meltan_removed' · events),
--     그 종을 가리키는 티켓 (기다리는 티켓도 진화의 돌로) · 만남 · 레이드 · 알림 · 소포 코드를 지운 뒤 계열을 지움 (종 · 기술 · 배우기 · 진화 길은 cascade).
--     다른 번호는 그대로 (이벤트 계열 441 · 442 도 그대로). seed 는 tools/gen_pokemon.py 가 808 · 809 를 빼고 만듦.

-- ── A. 울트라비스트: 무작위 풀에서 빼기 ───────────────────────────────────────────────────────────────────────
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
     where l.rarity = 'legendary' and l.active and not l.withdrawn and not l.mythic and not l.secret and not l.bonus and not l.ultra
       and exists (select 1 from public.species s where s.line_id = l.id and s.stage = 1)
     order by random() limit 1;
  end if;
  if v_line is null then
    select l.id into v_line from public.lines l
     where l.rarity = (case when e.tier = 'green' then 'common' else 'rare' end)
       and l.active and not l.withdrawn and not l.mythic and not l.secret and not l.bonus and not l.ultra
       and exists (select 1 from public.species s where s.line_id = l.id and s.stage = 1)
     order by random() limit 1;
  end if;
  if v_line is null then
    select l.id into v_line from public.lines l
     where l.rarity = 'common' and l.active and not l.withdrawn and not l.mythic and not l.secret and not l.bonus and not l.ultra
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
     where l.active and not l.withdrawn and not l.secret and not l.bonus and not l.ultra and l.rarity <> 'legendary'   -- 0049: 울트라비스트 상대 없음
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

create or replace function public._draw_line(q text)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v int;
begin
  if random() < coalesce((public._setting('wild_chance'))::numeric, 0) then
    v := public._wild_line();
    if v is not null then return v; end if;
  end if;
  select r.line_id into v from public.qr_rewards r join public.lines l on l.id = r.line_id
   where r.qr_id = q and l.active and not l.withdrawn and not l.ultra          -- 0049: 운영자가 QR 보상에 넣어도 울트라비스트는 안 나옴
   order by -ln(1 - random()) / r.weight limit 1;
  if v is null then v := public._wild_line(); end if;     -- 정해 둔 몬스터가 없는 QR 도 야생 포켓몬은 나옴
  return v;
end $function$;

create or replace function public._ditto_roll(p_line integer)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare l public.lines; d int := public._dex_sp(132);
begin
  select * into l from public.lines where id = p_line;
  if not found or d is null or l.subject <> '야생' or l.rarity = 'legendary' or l.mythic or l.ultra or l.legend_src is not null   -- 0049: 울트라비스트는 메타몽이 아님
     or l.id = (select line_id from public.species where id = d) then return null; end if;
  if random() < least(1, greatest(0, coalesce((public._setting('ditto_disguise_chance'))::numeric, 0.005))) then return d; end if;
  return null;
end $function$;

-- ── C. 갈래 진화: 같은 확률로 무작위 · 갈래 계열은 선생님 계열로 안 씀 ─────────────────────────────────────────
create or replace function public._branch_line(p_line int) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.evolutions e join public.species s on s.id = e.from_species
                  where s.line_id = p_line group by e.from_species having count(*) > 1)
$$;

create or replace function public.evolve(p_mon bigint, p_to integer default null::integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  if n > 1 then
    -- 0049: 갈래가 여럿 → 고르지 않고 같은 확률로 (p_to 무시). 진화 레벨이 된 레벨 갈래가 있으면 그중에서 (돌 없이), 없으면 진화의 돌로 모든 갈래 중에서
    select * into e from public.evolutions
     where from_species = c.species_id and how <> 'item' and c.level >= coalesce(lv, 101) order by random() limit 1;
    if not found then
      select * into e from public.evolutions where from_species = c.species_id order by random() limit 1;
    end if;
  elsif p_to is null then
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
                                                  'to', e.to_species, 'branched', n > 1));

  return jsonb_build_object(
    'success', win, 'stage', c.stage, 'evo_fails', c.evo_fails, 'by_level', by_level, 'by_item', by_item,
    'species_id', c.species_id, 'to', e.to_species, 'mon', p_mon, 'line', v_line, 'branched', n > 1, 'options', n,
    'evo_tickets', (select evo_tickets from public.profiles where user_id = p.user_id),
    'profile', (select public._profile_json(x) from public.profiles x where x.user_id = p.user_id));
end $function$;

create or replace function public.admin_assign_teacher(p_from integer, p_to integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare a public.lines; b public.lines;
begin
  perform public._assert_admin();
  select * into a from public.lines where id = p_from for update;
  select * into b from public.lines where id = p_to for update;
  if a.id is null or b.id is null or a.id = b.id then raise exception 'NOT_FOUND'; end if;
  if a.subject = '야생' or a.bonus or a.secret or a.mythic or a.id between 35 and 42 or a.id >= 77 and a.id <= 82 then raise exception 'NOT_TEACHER_LINE'; end if;
  if b.subject <> '야생' or b.bonus or b.secret or b.mythic then raise exception 'NOT_WILD_LINE'; end if;
  -- 0049: 갈래 진화 계열 (이브이 · 랄토스 · 배루키 · 코스모그 …) 은 진화 결과가 무작위라 선생님 포켓몬으로 안 씀. 갈래 계열에서 빼 오는 것은 됨
  if public._branch_line(b.id) then raise exception 'BRANCH_LINE'; end if;
  update public.lines set teacher = a.teacher, subject = a.subject, withdrawn = a.withdrawn where id = b.id;
  update public.lines set teacher = '야생 포켓몬', subject = '야생', withdrawn = false where id = a.id;
  update public.quizzes set line_id = b.id where line_id = a.id;
  delete from public.qr_rewards r where r.line_id = b.id and exists (select 1 from public.qr_rewards x where x.qr_id = r.qr_id and x.line_id = a.id);
  update public.qr_rewards set line_id = b.id where line_id = a.id;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('assign_teacher', a.teacher, 'from', a.id, 'to', b.id));
  return jsonb_build_object('ok', true, 'teacher', a.teacher, 'from', a.id, 'to', b.id);
end $function$;

-- 운영자 페이지의 '새 선생님 포켓몬으로' 는 lines 를 바로 고침 → 야생 갈래 계열이 선생님 계열이 되는 것도 DB 에서 막음
create or replace function public._lines_no_branch_teacher() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.subject = '야생' and new.subject is distinct from '야생' and public._branch_line(new.id) then raise exception 'BRANCH_LINE'; end if;
  return new;
end $$;
drop trigger if exists lines_no_branch_teacher on public.lines;
create trigger lines_no_branch_teacher before update of subject on public.lines
  for each row execute function public._lines_no_branch_teacher();

-- ── D. 학교 도감 = 학교 탭에 늘 보이는 칸 ─────────────────────────────────────────────────────────────────────
create or replace function public._school_keys() returns setof integer
language sql stable security definer set search_path = '' as $$
  select distinct coalesce(s.dex, -s.id) from public.species s join public.lines l on l.id = s.line_id
   where l.active and not l.withdrawn and not l.secret and not l.mythic and l.subject <> '야생'
     and l.id not in (select v::int from jsonb_each_text(case when jsonb_typeof(public._setting('dex_rewards')) = 'object'
                                                              then public._setting('dex_rewards') else '{}'::jsonb end) x(k, v)
                       where v ~ '^[0-9]+$')
$$;

create or replace function public._dex_rewards(uid uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare total int; got int; cfg jsonb := public._setting('dex_rewards'); sp int;
begin
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

create or replace function public._dex_unreward(uid uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare total int; got int;
begin
  select count(*), count(*) filter (where k in (select public._seen_dex(uid)))
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

-- ── B + D. sync 상태: tickets.graded · rules.school_keys ────────────────────────────────────────────────────
create or replace function public._state_base(uid uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
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
      'withdrawn', coalesce((select jsonb_agg(id) from public.lines where withdrawn), '[]'),
      'school_keys', coalesce((select jsonb_agg(k order by k) from public._school_keys() k), '[]')),   -- 0049: 학교 도감 칸 (서버 보상과 같은 셈)
    'profile', (select public._profile_json(p) from public.profiles p where p.user_id = uid),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nonce', t.nonce, 'qr_id', t.qr_id, 'qr_name', q.name, 'token', t.token, 'status', t.status,
               'created_at', t.created_at, 'redeemed_at', t.redeemed_at, 'species_id', t.result_species,
               'graded', t.catch_grade is not null)   -- 0049: 이미 잡기 장면을 거친 티켓 (앱 안 잡기 · 잡기 보너스 받음) → 앱은 다시 던지게 하지 않음
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
$function$;

-- ── E. 멜탄 · 멜메탈 (계열 440) 빼기 ─────────────────────────────────────────────────────────────────────────
do $$
declare
  L int := (select line_id from public.species where dex = 808 and id < 10000 limit 1);
  sps int[]; r record; who uuid[] := '{}'; n_mon int := 0; n_tk int := 0;
begin
  if L is null or L <> 440 then return; end if;   -- 이미 지웠거나 다른 번호면 아무것도 안 함
  sps := array(select id from public.species where line_id = L);
  -- 1) 가진 포켓몬: 지우고 진화의 돌 1개씩 (지닌 물건은 가방으로)
  for r in select * from public.collection where line_id = L for update loop
    if r.held is not null and r.released_at is null then
      insert into public.inventory (user_id, item, qty) values (r.user_id, r.held, 1)
        on conflict (user_id, item) do update set qty = public.inventory.qty + 1;
    end if;
    delete from public.collection where id = r.id;
    update public.profiles
       set team_mons = case when team_mons is null then null else nullif(array_remove(team_mons, r.id), '{}'::bigint[]) end,
           partner_mon = case when partner_mon = r.id then null else partner_mon end,
           evo_tickets = evo_tickets + case when r.released_at is null then 1 else 0 end
     where user_id = r.user_id;
    if r.released_at is null then
      insert into public.item_log (user_id, item, qty, why) values (r.user_id, 'evo_stone', 1, 'meltan_removed');
      n_mon := n_mon + 1;
    end if;
    insert into public.events (user_id, kind, data) values (r.user_id, 'admin', jsonb_build_object('meltan_removed', r.id, 'species', r.species_id, 'stone', r.released_at is null));
    who := who || r.user_id;
  end loop;
  -- 2) 아직 바꾸지 않은 티켓: 진화의 돌로 바꿔 줌
  for r in select * from public.tickets where status = 'pending' and (result_species = any (sps) or fixed_species = any (sps)) loop
    update public.profiles set evo_tickets = evo_tickets + 1 where user_id = r.user_id;
    insert into public.item_log (user_id, item, qty, why) values (r.user_id, 'evo_stone', 1, 'meltan_removed');
    insert into public.events (user_id, kind, data) values (r.user_id, 'admin', jsonb_build_object('meltan_removed_ticket', r.nonce, 'stone', true));
    who := who || r.user_id; n_tk := n_tk + 1;
  end loop;
  -- 3) 그 종을 가리키는 기록 지우기 (종은 FK 때문에)
  delete from public.tickets where result_species = any (sps) or fixed_species = any (sps) or disguised_as = any (sps);
  delete from public.raid_encounters where species_id = any (sps);
  delete from public.raids where species_id = any (sps);
  delete from public.raid_players where line_id = L;
  delete from public.notices where species_id = any (sps);
  delete from public.gift_codes where species_id = any (sps);
  update public.profiles set partner_line = null where partner_line = L;
  -- 4) 계열 지우기 → 종 · 기술 4개 · 배우기 · 진화 길 · QR 보상 · 퀴즈 (cascade)
  delete from public.lines where id = L;
  for r in select distinct u from unnest(who) u loop
    perform public._recompute(r.u);
    perform public._dex_unreward(r.u);
  end loop;
  raise notice '0049 멜탄 정리: 포켓몬 % 마리 · 티켓 % 장 → 진화의 돌', n_mon, n_tk;
end $$;

-- rule (0006): every migration that creates functions ends with this block (0048 list unchanged; new helpers
--   _branch_line · _school_keys are internal, not granted)
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
  public.safari_visit(text)
to authenticated;
notify pgrst, 'reload schema';
