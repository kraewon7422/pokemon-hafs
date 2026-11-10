-- 0058 갈래 진화 = 모든 갈래 같은 확률 (운영자가 확률을 바꿈) · 전설 갈래는 가진 모습을 빼고 · 코스모그 두 번 · 전설 보스 체력 1.5배
--  1) 전설 먼저 배틀 (0055) 보스 체력 배수 기본 2.5 → 1.5 (설정 legend_boss_hp_mult 도 1.5 로). 레벨 (팀 최고 + 8, 55~80) · 랭크 +2 · 잡기 ×1.5 는 그대로.
--  2) 갈래 진화 (0049 C 를 바꿈): 예전엔 진화 레벨이 되면 '레벨 갈래' 중에서만 (이브이 Lv.25 → 에브이 · 블래키 · 님피아만, 슈륙챙이 Lv.40 → 왕구리만).
--     이제: 갈래 중 가장 낮은 레벨 조건이 되면 진화의 돌 없이 진화 (갈래가 모두 돌 진화 = 냄새꼬 → 예전처럼 진화의 돌이 있어야 함),
--     그 전에는 진화의 돌로 일찍 (예전처럼: 뽑힌 갈래가 돌 갈래면 100%, 레벨 갈래면 evo_prob 확률). 어느 쪽이든 결과는 모든 갈래 중에서 무게 (weight) 로 뽑음.
--     결과 필드 branched · options 그대로. 선생님 폼 · 일반 폼 복사본은 자기 종의 evolutions 줄을 따라가므로 같은 폼 가족 안에서 진화 (0052 그대로).
--  3) evolutions.weight (숫자, 기본 1, 0 이상): weight > 0 인 갈래 중에서 무게대로 뽑음. 모두 0 이면 모두 같은 확률.
--     무게는 '같은 진화' (전국도감 번호 쌍: 이브이 133 → 쥬피썬더 135) 마다 하나 — 선생님 폼 · 일반 폼 복사본 (20000+) · 운영자 선생님 폼 (40000+) 의 줄을
--     admin_set_branch_weight 가 한꺼번에 바꿈. 새로 생기는 복사 줄 (_forms_build · _forms_copy_children · seed) 은 트리거가 같은 번호 쌍의 무게를 이어받음.
--     → 운영자 화면은 가족 하나에 한 줄, 폼마다 따로 맞출 필요 없음.
--     admin_branch_tree() : 갈래 가족마다 {from, branches [{sp, name, dex, how, lv, weight, pct}]}. admin_set_branch_weight(from 종, to 종, 0~100).
--  4) 전설 갈래 (코스모움 → 솔가레오 / 루나아라 · 전설 · 환상 계열 모두): 학생이 이미 가진 (박스에 있는, 진화한 것 포함) 모습의 갈래는 뺌. 모두 가졌으면 모든 갈래.
--     legend_quests 의 퀘스트마다 'max' (만날 수 있는 횟수, 기본 1) — 코스모그 (789) = 2. legend_encounter 는 그 계열을 max 마리 잡았을 때만 ALREADY_CAUGHT.
--     sync legends 줄에 owned (잡은 수) · max, caught = owned ≥ max (자리에서 사라지는 기준). → 코스모그 두 마리 = 솔가레오 + 루나아라.
--  인터넷 목록 (PokeAPI pokemon_species.evolves_from_species_id, 1~1025) 의 갈래 진화 19가족과 비교: 우리 종에 있는 갈래는 모두 evolutions 에 있음
--  (없는 것은 863 · 900 · 980 · 903 · 867 · 841/842/1011 · 936/937 처럼 그 종이 우리 DB 에 없는 것뿐) → 진화 줄은 더하지 않음. 전설 · 환상 갈래 가족 = 코스모움 하나.

-- ── 1. 전설 보스 체력 1.5배 ─────────────────────────────────────────────────────────────────
update public.settings set value = '1.5'::jsonb where key = 'legend_boss_hp_mult';
insert into public.settings (key, value) values ('legend_boss_hp_mult', '1.5') on conflict (key) do nothing;

-- 보스 강화: 상대 쪽 첫 포켓몬 체력 × legend_boss_hp_mult (1~10, 기본 1.5 — 0058), 공격 · 방어 · 특공 · 특방 랭크 + legend_boss_stage (0~3, 기본 2)
create or replace function public._legend_boost(st jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m jsonb := st -> 'sides' -> 1 -> 'mons' -> 0; g jsonb; k text; mx int;
  hpm numeric := least(10, greatest(1, coalesce((public._setting('legend_boss_hp_mult'))::numeric, 1.5)));
  sg int := least(3, greatest(0, coalesce((public._setting('legend_boss_stage'))::int, 2)));
begin
  if m is null then return st; end if;
  mx := greatest(1, round((m ->> 'max')::int * hpm)::int);
  g := coalesce(m -> 'stg', '{}'::jsonb);
  if sg > 0 then
    foreach k in array array['atk', 'def', 'spa', 'spd'] loop
      g := g || jsonb_build_object(k, least(6, coalesce((g ->> k)::int, 0) + sg));
    end loop;
  end if;
  m := m || jsonb_build_object('max', mx, 'hp', mx, 'stg', g, 'boss', true);
  return jsonb_set(st, '{sides,1,mons,0}', m) || jsonb_build_object('boss', jsonb_build_object('hp_mult', hpm, 'stage', sg));
end $$;

-- ── 2. 갈래 무게 ───────────────────────────────────────────────────────────────────────────
alter table public.evolutions add column if not exists weight numeric not null default 1;
alter table public.evolutions drop constraint if exists evolutions_weight_check;
alter table public.evolutions add constraint evolutions_weight_check check (weight >= 0 and weight <= 100);

-- 같은 진화 (전국도감 번호 쌍) 의 열쇠: 번호가 없으면 -종 id
create or replace function public._evo_key(p_sp int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(s.dex, -s.id) from public.species s where s.id = p_sp
$$;

-- 새 진화 줄 (폼 복사 · seed 다시 넣기) 은 같은 번호 쌍의 다른 줄 무게를 이어받음 (운영자가 바꾼 확률이 폼을 다시 만들어도 남게)
create or replace function public._evo_weight_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w numeric;
begin
  select e.weight into w from public.evolutions e
   where public._evo_key(e.from_species) = public._evo_key(new.from_species) and public._evo_key(e.to_species) = public._evo_key(new.to_species)
     and not (e.from_species = new.from_species and e.to_species = new.to_species)
   order by e.from_species limit 1;
  if w is not null then new.weight := w; end if;
  return new;
end $$;
drop trigger if exists evolutions_weight_inherit on public.evolutions;
create trigger evolutions_weight_inherit before insert on public.evolutions
  for each row execute function public._evo_weight_trg();

-- ── 3. 진화 ────────────────────────────────────────────────────────────────────────────────
create or replace function public.evolve(p_mon bigint, p_to integer default null::integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  p public.profiles := public._me_locked();
  c public.collection; v_line int; e public.evolutions; n int; to_stage int; min_lv int; leg boolean; cand int[];
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
    -- 0058: 갈래가 여럿 → 고르지 않고 (p_to 무시) 모든 갈래 중에서 무게대로. 가장 낮은 레벨 조건이 되면 돌 없이, 아니면 진화의 돌로
    select min(lv) into min_lv from public.evolutions where from_species = c.species_id and how <> 'item' and lv is not null;
    select l.rarity = 'legendary' or l.legend_src is not null or l.mythic into leg from public.lines l where l.id = v_line;
    -- 전설 · 환상 갈래: 이미 가진 모습 (같은 도감 번호, 박스에 있는 것) 은 뺌. 모두 가졌으면 모든 갈래
    select array_agg(x.to_species) into cand from public.evolutions x
     where x.from_species = c.species_id
       and not (coalesce(leg, false) and exists (
             select 1 from public.collection o where o.user_id = p.user_id and o.released_at is null and o.id <> c.id
                and public._evo_key(o.species_id) = public._evo_key(x.to_species)));
    if cand is null then select array_agg(to_species) into cand from public.evolutions where from_species = c.species_id; end if;
    select * into e from public.evolutions
     where from_species = c.species_id and to_species = any (cand) and weight > 0
     order by -ln(1 - random()) / weight limit 1;
    if not found then   -- 무게가 모두 0 → 같은 확률
      select * into e from public.evolutions where from_species = c.species_id and to_species = any (cand) order by random() limit 1;
    end if;
    by_level := min_lv is not null and c.level >= min_lv;
    by_item := not by_level and e.how = 'item';
  else
    if p_to is null then
      select * into e from public.evolutions where from_species = c.species_id;
    else
      select * into e from public.evolutions where from_species = c.species_id and to_species = p_to;
      if not found then raise exception 'BAD_BRANCH'; end if;
    end if;
    by_item := e.how = 'item';
    by_level := not by_item and c.level >= coalesce(e.lv, 101);
  end if;
  select stage into to_stage from public.species where id = e.to_species;
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
    'pool', coalesce(cardinality(cand), 1),
    'evo_tickets', (select evo_tickets from public.profiles where user_id = p.user_id),
    'profile', (select public._profile_json(x) from public.profiles x where x.user_id = p.user_id));
end $function$;

-- ── 4. 운영자: 갈래 나무 · 무게 ──────────────────────────────────────────────────────────────
-- 갈래 가족 (도감 번호) 마다 한 줄. 대표 종 = 일반 폼 (가족 대표 계열 먼저) → 그림 · 이름. pct = 무게 / 합 (모두 0 이면 같은 확률)
create or replace function public.admin_branch_tree() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out jsonb;
begin
  perform public._assert_admin();
  with fam as (
    select e.from_species from public.evolutions e group by e.from_species having count(*) > 1
  ), rep as (
    select distinct on (public._evo_key(f.from_species)) f.from_species sp, public._evo_key(f.from_species) k
      from fam f join public.species s on s.id = f.from_species join public.lines l on l.id = s.line_id
     order by public._evo_key(f.from_species), (l.form_kind = 'normal') desc, (l.family_id = l.id) desc, f.from_species
  ), br as (
    select r.sp, e.to_species, e.how, e.lv, e.weight, e.sort, st.name, st.dex,
           sum(e.weight) over (partition by r.sp) tot, count(*) over (partition by r.sp) cnt
      from rep r join public.evolutions e on e.from_species = r.sp join public.species st on st.id = e.to_species
  )
  select coalesce(jsonb_agg(x order by x ->> 'dex_sort'), '[]') into out from (
    select jsonb_build_object(
      'dex_sort', lpad(coalesce(s.dex, 0)::text, 5, '0'),
      'from', jsonb_build_object('sp', s.id, 'name', s.name, 'dex', s.dex, 'line', s.line_id,
                                 'legend', l.rarity = 'legendary' or l.legend_src is not null or l.mythic,
                                 'min_lv', (select min(b.lv) from br b where b.sp = s.id and b.how <> 'item'),
                                 'item_only', not exists (select 1 from br b where b.sp = s.id and b.how <> 'item'),
                                 'copies', (select count(distinct e2.from_species) from public.evolutions e2 where public._evo_key(e2.from_species) = public._evo_key(s.id))),
      'branches', (select jsonb_agg(jsonb_build_object('sp', b.to_species, 'name', b.name, 'dex', b.dex, 'how', b.how, 'lv', b.lv, 'weight', b.weight,
                                    'pct', round(case when b.tot > 0 then b.weight / b.tot else 1.0 / b.cnt end * 100, 1))
                                    order by b.sort, b.to_species)
                     from br b where b.sp = s.id)) x
      from rep r join public.species s on s.id = r.sp join public.lines l on l.id = s.line_id) z;
  return out;
end $$;

-- 무게 바꾸기: 같은 진화 (도감 번호 쌍) 의 모든 줄 (선생님 폼 · 일반 폼 복사본 · 운영자 선생님 폼) 을 한꺼번에
create or replace function public.admin_set_branch_weight(p_from int, p_to int, p_weight numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare kf int; kt int; n int;
begin
  perform public._assert_admin();
  if p_weight is null or p_weight < 0 or p_weight > 100 then raise exception 'BAD_WEIGHT'; end if;
  if not exists (select 1 from public.evolutions where from_species = p_from and to_species = p_to) then raise exception 'NOT_FOUND'; end if;
  if (select count(*) from public.evolutions where from_species = p_from) < 2 then raise exception 'NOT_BRANCH'; end if;
  kf := public._evo_key(p_from); kt := public._evo_key(p_to);
  update public.evolutions e set weight = p_weight
   where public._evo_key(e.from_species) = kf and public._evo_key(e.to_species) = kt;
  get diagnostics n = row_count;
  insert into public.events (user_id, kind, data)
  values (auth.uid(), 'admin', jsonb_build_object('branch_weight', p_weight, 'from', p_from, 'to', p_to, 'rows', n));
  return jsonb_build_object('ok', true, 'from', p_from, 'to', p_to, 'weight', p_weight, 'rows', n);
end $$;

-- ── 5. 전설: 퀘스트마다 만날 수 있는 횟수 (max, 기본 1) · 코스모그 2번 ───────────────────────────────
update public.settings set value = (
    select jsonb_agg(case when (q ->> 'dex')::int = 789 then q || '{"max": 2}'::jsonb else q end order by o)
      from jsonb_array_elements(value) with ordinality u(q, o))
 where key = 'legend_quests' and jsonb_typeof(value) = 'array';

create or replace function public._quest_max(q jsonb) returns int
language sql immutable security definer set search_path = '' as $$
  select greatest(1, least(10, coalesce(case when q ->> 'max' ~ '^[0-9]+$' then (q ->> 'max')::int end, 1)))
$$;

create or replace function public.legend_encounter(p_dex integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; q jsonb; sp int; ln int; e public.raid_encounters; tries int;
  maxt int := greatest(1, coalesce((public._setting('legend_daily_tries'))::int, 3));
  nb int := least(30, greatest(1, coalesce((public._setting('legend_balls'))::int, 10)));
begin
  select x into q from jsonb_array_elements(coalesce(public._setting('legend_quests'), '[]')) x
   where (x ->> 'dex')::int = p_dex and x ->> 'reward' = 'map' limit 1;
  if q is null then raise exception 'BAD_LEGEND'; end if;
  sp := public._dex_sp(p_dex);
  select line_id into ln from public.species where id = sp;
  -- 0058: 그 계열을 퀘스트의 max 마리 (기본 1, 코스모그 2) 잡았으면 끝
  if (select count(*) from public.collection where user_id = uid and line_id = ln) >= public._quest_max(q) then raise exception 'ALREADY_CAUGHT'; end if;
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
end $function$;

-- sync legends 줄: owned (그 계열 잡은 수) · max (만날 수 있는 횟수), caught = owned ≥ max (사파리존 자리에서 사라짐)
create or replace function public._quest_rows_raw(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(r order by o), '[]') from (
    select u.o, jsonb_build_object(
      'dex', (q ->> 'dex')::int, 'species_id', sp.id, 'line_id', sp.line_id, 'name', sp.name, 'kind', q ->> 'kind', 'reward', q ->> 'reward',
      'cur', z.cur, 'need', z.need, 'done', z.done, 'ok', z.done or z.cur >= z.need,
      'caught', z.owned >= public._quest_max(q), 'owned', z.owned, 'max', public._quest_max(q),
      'granted', exists (select 1 from public.tickets t where t.user_id = uid and t.special = 'quest' and t.fixed_species = sp.id and t.status <> 'cancelled'),
      'seen', exists (select 1 from public._seen_species(uid) x where x = sp.id),
      'cond', public._quest_text(q, z.cur, z.need) ->> 'cond', 'prog', public._quest_text(q, z.cur, z.need) ->> 'prog') r
    from jsonb_array_elements(coalesce(public._setting('legend_quests'), '[]')) with ordinality u(q, o)
    join public.species sp on sp.id = public._dex_sp((q ->> 'dex')::int)
    cross join lateral (select public._quest_cur(uid, q) cur, public._quest_need(q) need,
                               exists (select 1 from public.legend_quest_done d where d.user_id = uid and d.dex = (q ->> 'dex')::int) done,
                               (select count(*)::int from public.collection c where c.user_id = uid and c.line_id = sp.line_id) owned) z) x
$$;
-- 저장해 둔 목록 (0057) 은 새 필드가 없으므로 다음 확인 때 다시 만들게 지움
update public.profiles set quest_fp = null where quest_fp is not null;

-- ── 6. 권한 ───────────────────────────────────────────────────────────────────────────────────────────────────
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
  public.admin_create_gift(text, text, int, text, int, timestamptz, timestamptz, int, int, boolean), public.admin_list_gifts(), public.admin_set_gift(bigint, boolean),
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
  public.admin_rename_teacher(int, text, text),
  -- 0055
  public.legend_battle(bigint, bigint[]), public.admin_legend_sim(int, jsonb, int),
  -- 0056
  public.trade_open(text), public.trade_current(), public.trade_state(bigint), public.trade_offer(bigint, bigint),
  public.trade_confirm(bigint, int), public.trade_cancel(bigint), public.trade_check(), public.admin_trades(int),
  -- 0058
  public.admin_branch_tree(), public.admin_set_branch_weight(int, int, numeric)
to authenticated;
notify pgrst, 'reload schema';
