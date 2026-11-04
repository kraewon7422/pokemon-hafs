-- 0039: 특성 (abilities) · 변신 (Transform) · 날씨 / 필드 (시간표 칸 = 실제 포켓몬 날씨·필드)
--  · abilities 표 (key = PokeAPI 영어 이름, 한국어 이름 · 설명) + species.abilities (보통 1~2개) · species.hidden_ability.
--    자료는 seed_pokemon.sql (tools/gen_pokemon.py, 7세대 기준) → 이 파일 다음에 seed 를 다시 실행.
--  · collection.ability_slot (0·1 = 보통 특성, 2 = 숨겨진 특성) · collection.ability (그 종의 그 자리 특성, 트리거가 맞춤).
--    잡을 때 (insert) 자리를 굴림: ability_hidden_chance (기본 5%) 로 숨겨진 특성, 아니면 보통 특성 중 하나.
--    진화해도 자리는 그대로 (실제 게임처럼). 이미 있는 포켓몬은 번호로 정해진 자리 (hashtext) — 다시 실행해도 같음.
--  · 배틀: 포켓몬 json 에 'ab' (특성 key). 기록 이벤트 'ab' [자리, key] + name = 특성 알림 (폰: "<포켓몬>의 <특성>!" 띠).
--    상대 특성은 한 번 나타나야 ('abr') 폰에 보임.
--  · 날씨 st.wx = {k, n} (sun · rain · sand · hail, n = 남은 턴 / null = 시간표 바탕) · 필드 st.ter = {k, n}
--    (electric · grassy · misty · psychic). 시간표 칸 (battle_fields 의 env) = 배틀 내내 바탕, 특성 · 기술 날씨는 5턴 덮어씀.
--    기록 이벤트 'wx' key|null · 'ter' key|null (폰: 날씨 띠 · 화면 효과).
--  · 변신 (기술 251, 효과 {"transform": true}) · 특성 괴짜 (imposter): 상대 모습 ('tsp' = 보이는 그림) · 타입 · 능력치 (HP 빼고)
--    · 능력 변화 · 특성 · 기술 (PP 5) 를 베낌 ('orig' 에 원래 것). 교체하면 · 배틀이 끝나면 원래대로. 이벤트 'tf' [자리, sp].
--  · 날씨 기술 (쾌청 · 비바라기 · 모래바람 · 싸라기눈, 효과 {"weather": k}) = 5턴.
--  · 배틀 시작 (battles 가 active 가 되는 순간, turn 0) 트리거 _bt_init: 시간표 날씨·필드 + 나와 있는 포켓몬의 등장 특성
--    (위협 · 가뭄 …) → battles.log (폰은 등장 연출 뒤 재생).
--  · 시험용 admin_bt_sim(p) (운영자만): 정한 포켓몬 · 특성 · 날씨로 배틀 몇 턴을 돌려 기록을 돌려줌 (DB 에 남지 않음, 고정 난수 st.sim).
--  · my_abilities(): 내 포켓몬마다 특성 key ({mon id: key}) — 박스 요약 · 배틀 정보.
-- 함수 뜻이 바뀐 것: _bt_mon(+p_ab) · _bt_status(+p_st, p_quiet) · _bt_stages(+p_foe) (옛 것은 지움). _bt_side · _bt_switch 는 volatile.

-- ── 1. 표 · 열 ───────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.abilities (
  key text primary key check (key ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  description text not null default ''
);
alter table public.abilities enable row level security;
drop policy if exists catalog_read on public.abilities;
create policy catalog_read on public.abilities for select to authenticated using (true);
drop policy if exists admin_write on public.abilities;
create policy admin_write on public.abilities for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.abilities to authenticated;

alter table public.species add column if not exists abilities text[];
alter table public.species add column if not exists hidden_ability text;
alter table public.collection add column if not exists ability_slot smallint;
alter table public.collection add column if not exists ability text;
alter table public.collection drop constraint if exists collection_ability_slot_check;
alter table public.collection add constraint collection_ability_slot_check check (ability_slot is null or ability_slot between 0 and 2);

insert into public.settings (key, value) values ('ability_hidden_chance', '0.05') on conflict (key) do nothing;

-- 그 포켓몬의 특성: 자리 (0·1 보통, 2 숨겨진) → 지금 종의 특성. 숨겨진 특성이 없는 종이면 첫 보통 특성
create or replace function public._ability_of(p_species int, p_slot int) returns text
language sql stable security definer set search_path = '' as $$
  select case when p_slot = 2 and s.hidden_ability is not null then s.hidden_ability
              else coalesce(s.abilities[1 + least(coalesce(p_slot, 0), 1)], s.abilities[1]) end
    from public.species s where s.id = p_species
$$;

create or replace function public._col_ability() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if new.ability_slot is null then
    select coalesce(cardinality(abilities), 1) into n from public.species where id = new.species_id;
    new.ability_slot := case when random() < coalesce((public._setting('ability_hidden_chance'))::numeric, 0.05)
                                  and exists (select 1 from public.species where id = new.species_id and hidden_ability is not null) then 2
                             else floor(random() * greatest(1, coalesce(n, 1)))::int end;
  end if;
  new.ability := public._ability_of(new.species_id, new.ability_slot);
  return new;
end $$;
-- 이름: collection_species (종 맞추기) 다음에 돌도록 (같은 때의 트리거는 이름 순서)
drop trigger if exists collection_zability on public.collection;
create trigger collection_zability before insert or update of line_id, stage, species_id, ability_slot, ability on public.collection
  for each row execute function public._col_ability();
-- 이미 있는 포켓몬: 번호로 정한 자리 (5% 숨겨진 특성) — 특성 이름은 seed 를 넣은 뒤 seed 맨 끝 줄이 다시 맞춤
update public.collection c set ability_slot = case when (hashtext('ab' || c.id::text)::bigint & 2147483647) % 100 < 5 then 2
                                                   else (hashtext('slot' || c.id::text)::bigint & 2147483647) % greatest(1, coalesce((select cardinality(s.abilities) from public.species s where s.id = c.species_id), 2)) end
 where ability_slot is null;

-- ── 2. 배틀 도우미 ───────────────────────────────────────────────────────────────────────────────────────────
-- 시험용 고정 난수 (admin_bt_sim 만 st.sim.r 을 넣음): 명중 · 추가 효과 · 특성 발동
create or replace function public._bt_rnd(st jsonb) returns numeric
language sql volatile set search_path = '' as $$
  select coalesce((st -> 'sim' ->> 'r')::numeric, random()::numeric)
$$;

-- 지금 날씨 (날씨부정 · 에어록이 나와 있으면 없음)
create or replace function public._bt_wxk(st jsonb) returns text
language sql immutable set search_path = '' as $$
  select case when exists (select 1 from generate_series(0, 3) g
                            where coalesce((public._bt_m(st, g) ->> 'hp')::int, 0) > 0 and public._bt_m(st, g) ->> 'ab' in ('cloud-nine', 'air-lock'))
              then null else st -> 'wx' ->> 'k' end
$$;

-- 땅에 있는 포켓몬 (필드 효과를 받음): 비행 타입 · 부유가 아님
create or replace function public._bt_grounded(m jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select not ('비행' = any (string_to_array(coalesce(m ->> 'type', ''), '/'))) and coalesce(m ->> 'ab', '') <> 'levitate'
$$;

create or replace function public._bt_hastype(m jsonb, t text) returns boolean
language sql immutable set search_path = '' as $$
  select t = any (string_to_array(coalesce(m ->> 'type', ''), '/'))
$$;

-- 날씨 · 필드 글 (실제 게임 문구)
create or replace function public._bt_envmsg(k text, what text) returns text
language sql immutable set search_path = '' as $$
  select case what
    when 'start' then case k when 'sun' then '햇살이 강해졌다!' when 'rain' then '비가 내리기 시작했다!' when 'sand' then '모래바람이 불기 시작했다!'
                             when 'hail' then '싸라기눈이 내리기 시작했다!' when 'electric' then '발밑에 전기가 흐르기 시작했다!'
                             when 'grassy' then '발밑에 풀이 무성해졌다!' when 'misty' then '발밑에 안개가 끼었다!' when 'psychic' then '발밑이 이상한 느낌이 되었다!' end
    else case k when 'sun' then '햇살이 약해졌다!' when 'rain' then '비가 그쳤다!' when 'sand' then '모래바람이 가라앉았다!' when 'hail' then '싸라기눈이 그쳤다!'
                when 'electric' then '발밑의 전기가 사라졌다!' when 'grassy' then '발밑의 풀이 사라졌다!' when 'misty' then '발밑의 안개가 사라졌다!'
                when 'psychic' then '발밑의 이상한 느낌이 사라졌다!' end end
$$;

-- 특성 알림: 기록에 'ab' 이벤트 + 상대에게도 보이게 'abr'
create or replace function public._bt_pop(inout m jsonb, inout lg jsonb, u int)
language plpgsql immutable set search_path = '' as $$
begin
  if m is null or (m ->> 'ab') is null then return; end if;
  m := m || '{"abr": true}';
  lg := lg || jsonb_build_object('ab', jsonb_build_array(u, m ->> 'ab'), 'name', m ->> 'name');
end $$;

-- HP 를 바꾸고 글 + 'hp' (+ 쓰러짐)
create or replace function public._bt_hpd(inout st jsonb, inout lg jsonb, u int, delta int, txt text, fx text default null)
language plpgsql immutable set search_path = '' as $$
declare m jsonb := public._bt_m(st, u); hp int;
begin
  if m is null or (m ->> 'hp')::int <= 0 then return; end if;
  hp := greatest(0, least((m ->> 'max')::int, (m ->> 'hp')::int + delta));
  m := jsonb_set(m, '{hp}', to_jsonb(hp));
  st := public._bt_setm(st, u, m);
  lg := lg || jsonb_strip_nulls(jsonb_build_object('m', txt, 'hp', jsonb_build_array(u, hp), 'fx', case when fx is not null then jsonb_build_array(u, fx) end));
  if hp <= 0 then lg := lg || jsonb_build_object('m', public._bt_j('@' || (u / 2) || (m ->> 'name'), '은', '는') || ' 쓰러졌다!', 'faint', u); end if;
end $$;

-- 스피드 (날씨 특성: 엽록소 · 쓱쓱 · 모래헤치기 · 눈치우기 ×2, 속보 ×1.5)
create or replace function public._bt_spe(st jsonb, m jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select public._bt_eff(m, 'spe')
         * case when (m ->> 'ab' = 'chlorophyll' and w = 'sun') or (m ->> 'ab' = 'swift-swim' and w = 'rain')
                  or (m ->> 'ab' = 'sand-rush' and w = 'sand') or (m ->> 'ab' = 'slush-rush' and w = 'hail') then 2 else 1 end
         * case when m ->> 'ab' = 'quick-feet' and (m ->> 'st') is not null then 1.5 else 1 end
    from (select public._bt_wxk(st) as w) x
$$;

-- 기술 위력 배율 (특성 · 날씨 · 필드 · 지닌 물건). dab = 받는 쪽 특성 (틀깨기면 null)
create or replace function public._bt_pw(st jsonb, a jsonb, d jsonb, dab text, mt text, cat text, mname text, mpow int, e jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select (case when f -> 'types' ? mt then coalesce((f ->> 'mult')::numeric, 1.3) else 1 end)     -- 예전 시간표 (타입 목록) 배틀
       * (case when a -> 'hold' ->> 'boost' = mt then 1.2 else 1 end)
       * (case when ab = 'technician' and coalesce(mpow, 0) <= 60 then 1.5 else 1 end)
       * (case when ab = 'iron-fist' and mname like '%펀치%' then 1.2 else 1 end)
       * (case when ab = 'strong-jaw' and mname ~ '(물기|엄니|깨물어부수기|사이코팽)' then 1.5 else 1 end)
       * (case when ab = 'tough-claws' and cat = 'physical' then 1.3 else 1 end)
       * (case when ab = 'reckless' and coalesce(e, '{}') ? 'recoil' then 1.2 else 1 end)
       * (case when (a ->> 'hp')::int * 3 <= (a ->> 'max')::int
                 and ((ab = 'overgrow' and mt = '풀') or (ab = 'blaze' and mt = '불꽃') or (ab = 'torrent' and mt = '물') or (ab = 'swarm' and mt = '벌레'))
               then 1.5 else 1 end)
       * (case when coalesce((a ->> 'ff')::boolean, false) and mt = '불꽃' then 1.5 else 1 end)
       * (case when ab = 'sand-force' and w = 'sand' and mt in ('바위', '땅', '강철') then 1.3 else 1 end)
       * (case when w = 'sun' then case mt when '불꽃' then 1.5 when '물' then 0.5 else 1 end
               when w = 'rain' then case mt when '물' then 1.5 when '불꽃' then 0.5 else 1 end else 1 end)
       * (case when public._bt_grounded(a) and ((t = 'electric' and mt = '전기') or (t = 'grassy' and mt = '풀') or (t = 'psychic' and mt = '에스퍼'))
               then coalesce((f ->> 'mult')::numeric, 1.3) else 1 end)
       * (case when t = 'misty' and mt = '드래곤' and d is not null and public._bt_grounded(d) then 0.5 else 1 end)
       * (case when dab = 'thick-fat' and mt in ('불꽃', '얼음') then 0.5 else 1 end)
       * (case when dab = 'heatproof' and mt = '불꽃' then 0.5 else 1 end)
       * (case when dab = 'dry-skin' and mt = '불꽃' then 1.25 else 1 end)
    from (select a ->> 'ab' as ab, public._bt_wxk(st) as w, st -> 'ter' ->> 'k' as t, st -> 'field' as f) x
$$;

-- 특성으로 막는 기술: immune · heal4 · atk/spa/spe (+1) · ff (타오르는불꽃) · null
create or replace function public._bt_absorb(dab text, mt text, kind text, mult numeric) returns text
language sql immutable set search_path = '' as $$
  select case
    when kind = 'attack' and mt = '땅' and dab = 'levitate' then 'immune'
    when mt = '전기' and dab = 'volt-absorb' then 'heal4'
    when mt = '물' and dab in ('water-absorb', 'dry-skin') then 'heal4'
    when mt = '전기' and dab = 'motor-drive' then 'spe'
    when mt = '전기' and dab = 'lightning-rod' then 'spa'
    when mt = '물' and dab = 'storm-drain' then 'spa'
    when mt = '풀' and dab = 'sap-sipper' then 'atk'
    when mt = '불꽃' and dab = 'flash-fire' then 'ff'
    when kind = 'attack' and dab = 'wonder-guard' and mt <> '???' and coalesce(mult, 1) <= 1 then 'immune' end
$$;

-- ── 3. 상태 이상 · 능력 변화 (특성 · 필드) ───────────────────────────────────────────────────────────────────
drop function if exists public._bt_status(jsonb, jsonb, boolean, text, text, int);
create or replace function public._bt_status(inout m jsonb, inout lg jsonb, inout ok boolean, stt text, who text, u int,
                                             p_st jsonb default null, p_quiet boolean default false)
language plpgsql volatile set search_path = '' as $$
declare ab text := m ->> 'ab'; ter text := p_st -> 'ter' ->> 'k'; blk boolean;
begin
  ok := false;
  if (m ->> 'hp')::int <= 0 then return; end if;
  if ter = 'misty' and public._bt_grounded(m) and ((m ->> 'st') is null or stt = 'cnf') then
    if not p_quiet then lg := lg || jsonb_build_object('m', public._bt_j(who, '은', '는') || ' 미스트필드에 보호받고 있다!'); end if;
    return;
  end if;
  if stt = 'cnf' then
    if coalesce((m ->> 'cnf')::int, 0) > 0 then return; end if;
    if ab = 'own-tempo' then
      if not p_quiet then
        select * into m, lg from public._bt_pop(m, lg, u);
        lg := lg || jsonb_build_object('m', public._bt_j(who, '은', '는') || ' 혼란에 빠지지 않는다!');
      end if;
      return;
    end if;
    m := jsonb_set(m, '{cnf}', to_jsonb(2 + floor(random() * 4)::int));
    lg := lg || jsonb_build_object('m', public._bt_j(who, '은', '는') || ' 혼란에 빠졌다!', 'fx', jsonb_build_array(u, 'cnf'));
    ok := true; return;
  end if;
  if (m ->> 'st') is not null then return; end if;
  if stt = 'slp' and ter = 'electric' and public._bt_grounded(m) then
    if not p_quiet then lg := lg || jsonb_build_object('m', public._bt_j(who, '은', '는') || ' 일렉트릭필드에 보호받고 있다!'); end if;
    return;
  end if;
  -- 특성이 막음 (유연 · 불면 · 의기양양 · 면역 · 수의베일 · 마그마의무장 · 절대안깸 · 리프가드(쾌청))
  blk := coalesce(case stt when 'par' then ab = 'limber' when 'slp' then ab in ('insomnia', 'vital-spirit', 'sweet-veil')
                           when 'psn' then ab = 'immunity' when 'brn' then ab = 'water-veil' when 'frz' then ab = 'magma-armor' else false end, false)
         or coalesce(ab = 'comatose', false) or coalesce(ab = 'leaf-guard' and public._bt_wxk(p_st) = 'sun', false);
  if blk then
    if not p_quiet then
      select * into m, lg from public._bt_pop(m, lg, u);
      lg := lg || jsonb_build_object('m', who || '에게는 효과가 없는 것 같다...');
    end if;
    return;
  end if;
  if stt = 'frz' and public._bt_wxk(p_st) = 'sun' then return; end if;   -- 쾌청: 얼지 않음
  if m -> 'hold' ->> 'immune' = stt then
    lg := lg || jsonb_build_object('m', public._bt_j(who, '은', '는') || ' ' || (m ->> 'heldname') || ' 덕분에 멀쩡하다!');
    return;
  end if;
  m := m || jsonb_build_object('st', stt, 'slp', case when stt = 'slp' then 2 + floor(random() * 3)::int else 0 end,
                               'frz', case when stt = 'frz' then 3 else 0 end);
  lg := lg || jsonb_build_object('m', public._bt_j(who, '은', '는') || case stt
    when 'par' then ' 마비되어 기술이 나오기 어려워졌다!' when 'brn' then ' 화상을 입었다!'
    when 'psn' then ' 독에 걸렸다!' when 'frz' then ' 꽁꽁 얼어붙었다!' else ' 잠들어 버렸다!' end,
    'st', jsonb_build_array(u, stt), 'fx', jsonb_build_array(u, stt));
  ok := true;
end $$;

-- p_foe = 상대가 떨어뜨림 (클리어바디 · 하얀연기 · 메탈프로텍트 · 괴력집게 · 날카로운눈 · 부풀린가슴 이 막음, 오기 · 승기 발동)
drop function if exists public._bt_stages(jsonb, jsonb, jsonb, text, int);
create or replace function public._bt_stages(inout m jsonb, inout lg jsonb, ch jsonb, who text, u int, p_foe boolean default false)
language plpgsql immutable set search_path = '' as $$
declare k text; v int; cur int; nw int; ab text := m ->> 'ab'; ch2 jsonb := '{}'; blocked boolean := false; dropped boolean := false;
  nm jsonb := '{"atk": "공격", "def": "방어", "spa": "특수공격", "spd": "특수방어", "spe": "스피드", "acc": "명중률", "eva": "회피율"}';
begin
  if (m ->> 'hp')::int <= 0 then return; end if;
  for k, v in select key, value::int from jsonb_each_text(ch) loop
    if p_foe and v < 0 and (ab in ('clear-body', 'white-smoke', 'full-metal-body') or (ab = 'hyper-cutter' and k = 'atk')
                            or (ab = 'keen-eye' and k = 'acc') or (ab = 'big-pecks' and k = 'def')) then
      blocked := true;
    else
      ch2 := ch2 || jsonb_build_object(k, v);
    end if;
  end loop;
  if blocked then
    select * into m, lg from public._bt_pop(m, lg, u);
    lg := lg || jsonb_build_object('m', who || '능력은 떨어지지 않는다!');
  end if;
  for k, v in select key, value::int from jsonb_each_text(ch2) loop
    if (m ->> 'hp')::int <= 0 then return; end if;
    cur := coalesce((m -> 'stg' ->> k)::int, 0);
    nw := greatest(-6, least(case when k = 'eva' then 2 else 6 end, cur + v));
    if nw = cur then
      lg := lg || jsonb_build_object('m', who || public._bt_j(nm ->> k, '은', '는') || case when v > 0 then ' 더 이상 올라가지 않는다!' else ' 더 이상 떨어지지 않는다!' end);
    else
      if nw < cur then dropped := true; end if;
      m := jsonb_set(m, array['stg', k], to_jsonb(nw));
      lg := lg || jsonb_build_object('m', who || public._bt_j(nm ->> k, '이', '가') || case
        when v >= 2 then ' 크게 올라갔다!' when v > 0 then ' 올라갔다!' when v <= -2 then ' 크게 떨어졌다!' else ' 떨어졌다!' end,
        'stat', jsonb_build_array(u, case when v >= 2 then 2 when v > 0 then 1 when v <= -2 then -2 else -1 end));
    end if;
  end loop;
  if p_foe and dropped and ab in ('defiant', 'competitive') then
    select * into m, lg from public._bt_pop(m, lg, u);
    select * into m, lg from public._bt_stages(m, lg, case when ab = 'defiant' then '{"atk": 2}'::jsonb else '{"spa": 2}'::jsonb end, who, u, false);
  end if;
end $$;

-- 변신: a 가 d 의 모습 · 타입 · 능력치 (HP 빼고) · 능력 변화 · 특성 · 기술 (PP 5) 로
create or replace function public._bt_tf(inout a jsonb, inout lg jsonb, d jsonb, u int, an text, dn text)
language plpgsql immutable set search_path = '' as $$
begin
  if d is null or (d ->> 'hp')::int <= 0 or coalesce((a ->> 'tf')::boolean, false) or coalesce((d ->> 'tf')::boolean, false) then
    lg := lg || jsonb_build_object('m', '그러나 실패했다!'); return;
  end if;
  a := a || jsonb_build_object(
    'orig', jsonb_build_object('type', a -> 'type', 'atk', a -> 'atk', 'def', a -> 'def', 'spa', a -> 'spa', 'spd', a -> 'spd', 'spe', a -> 'spe',
                               'moves', a -> 'moves', 'ab', a -> 'ab'),
    'tf', true, 'tsp', d -> 'sp', 'type', d -> 'type', 'atk', d -> 'atk', 'def', d -> 'def', 'spa', d -> 'spa', 'spd', d -> 'spd', 'spe', d -> 'spe',
    'stg', coalesce(d -> 'stg', '{}'::jsonb), 'ab', d -> 'ab',
    'moves', coalesce((select jsonb_agg(jsonb_build_object('id', x -> 'id', 'pp', 5) order by o) from jsonb_array_elements(d -> 'moves') with ordinality y(x, o)), '[]'));
  lg := lg || jsonb_build_object('m', public._bt_j(an, '은', '는') || ' ' || public._bt_j(dn, '으로', '로') || ' 변신했다!', 'tf', jsonb_build_array(u, d -> 'sp'));
end $$;

-- 등장 특성 (배틀 시작 · 교체해서 나올 때)
create or replace function public._bt_entry(inout st jsonb, inout lg jsonb, u int)
language plpgsql immutable set search_path = '' as $$
declare m jsonb := public._bt_m(st, u); ab text; s int := u / 2; o int := 1 - u / 2; k int; d jsonb; nm text; w text; tu int;
begin
  if m is null or (m ->> 'hp')::int <= 0 then return; end if;
  ab := m ->> 'ab'; nm := '@' || s || (m ->> 'name');
  if ab = 'intimidate' then
    select * into m, lg from public._bt_pop(m, lg, u); st := public._bt_setm(st, u, m);
    for k in 0 .. 1 loop
      continue when not public._bt_live(st, o * 2 + k);
      d := public._bt_m(st, o * 2 + k);
      select * into d, lg from public._bt_stages(d, lg, '{"atk": -1}', '@' || o || (d ->> 'name') || '의 ', o * 2 + k, true);
      st := public._bt_setm(st, o * 2 + k, d);
    end loop;
  elsif ab in ('drought', 'drizzle', 'sand-stream', 'snow-warning') then
    w := case ab when 'drought' then 'sun' when 'drizzle' then 'rain' when 'sand-stream' then 'sand' else 'hail' end;
    if coalesce(st -> 'wx' ->> 'k', '') <> w then
      select * into m, lg from public._bt_pop(m, lg, u); st := public._bt_setm(st, u, m);
      st := st || jsonb_build_object('wx', jsonb_build_object('k', w, 'n', 5));
      lg := lg || jsonb_build_object('m', public._bt_envmsg(w, 'start'), 'wx', w);
    end if;
  elsif ab in ('electric-surge', 'grassy-surge', 'misty-surge', 'psychic-surge') then
    w := split_part(ab, '-', 1);
    if coalesce(st -> 'ter' ->> 'k', '') <> w then
      select * into m, lg from public._bt_pop(m, lg, u); st := public._bt_setm(st, u, m);
      st := st || jsonb_build_object('ter', jsonb_build_object('k', w, 'n', 5));
      lg := lg || jsonb_build_object('m', public._bt_envmsg(w, 'start'), 'ter', w);
    end if;
  elsif ab = 'pressure' then
    select * into m, lg from public._bt_pop(m, lg, u); st := public._bt_setm(st, u, m);
    lg := lg || jsonb_build_object('m', public._bt_j(nm, '은', '는') || ' 프레셔를 발산하고 있다!');
  elsif ab in ('cloud-nine', 'air-lock') then
    select * into m, lg from public._bt_pop(m, lg, u); st := public._bt_setm(st, u, m);
    lg := lg || jsonb_build_object('m', '날씨의 영향이 없어졌다!');
  elsif ab in ('mold-breaker', 'turboblaze', 'teravolt') then
    select * into m, lg from public._bt_pop(m, lg, u); st := public._bt_setm(st, u, m);
    lg := lg || jsonb_build_object('m', public._bt_j(nm, '은', '는') || ' 틀을 깨뜨렸다!');
  elsif ab = 'imposter' then
    tu := case when public._bt_live(st, o * 2 + u % 2) then o * 2 + u % 2 when public._bt_live(st, o * 2) then o * 2
               when public._bt_live(st, o * 2 + 1) then o * 2 + 1 end;
    if tu is not null and not coalesce((public._bt_m(st, tu) ->> 'tf')::boolean, false) then
      d := public._bt_m(st, tu);
      select * into m, lg from public._bt_pop(m, lg, u);
      select * into m, lg from public._bt_tf(m, lg, d, u, nm, '@' || o || (d ->> 'name'));
      st := public._bt_setm(st, u, m);
    end if;
  end if;
end $$;

-- ── 4. 포켓몬 · 팀 · 시작 ────────────────────────────────────────────────────────────────────────────────────
drop function if exists public._bt_mon(int, int, int[], text);
create or replace function public._bt_mon(p_sp int, p_lv int, p_moves int[], p_held text, p_ab text default null) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select jsonb_build_object(
    'sp', s.id, 'line', s.line_id, 'name', s.name, 'lv', p_lv,
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

create or replace function public._bt_side(p_species int[], fmt text, uid uuid, p_lv int, p_fair boolean, p_mons bigint[] default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare mons jsonb := '[]'; i int; x int; c public.collection; lv int; k int; g jsonb; sd jsonb;
begin
  for i in 1 .. coalesce(cardinality(p_species), 0) loop
    x := p_species[i];
    c := null;
    if uid is not null and p_mons is not null then select * into c from public.collection where id = p_mons[i] and user_id = uid; end if;
    lv := case when p_fair then 50 when c.level is not null then c.level else coalesce(p_lv, 50) end;
    mons := mons || jsonb_build_array(public._bt_mon(x, lv, case when c.id is not null then public._cur_moves(uid, c.id) end, c.held, c.ability)
                                      || jsonb_build_object('mon', c.id));
  end loop;
  for k in 0 .. jsonb_array_length(mons) - 1 loop
    g := public._bt_group(mons -> k ->> 'type');
    if g is not null and (select count(*) from jsonb_array_elements(mons) m where public._bt_group(m ->> 'type') ->> 'g' = g ->> 'g') >= 2 then
      mons := jsonb_set(mons, array[k::text], (mons -> k) || jsonb_build_object('syn', g ->> 'stat', 'synname', g ->> 'name'));
    end if;
  end loop;
  sd := jsonb_build_object('reflect', 0, 'light', 0, 'items', 0, 'uid', uid,
          'act', (select jsonb_agg(g2) from generate_series(0, least(case when fmt = 'double' then 2 else 1 end, cardinality(p_species)) - 1) g2),
          'mons', mons);
  for k in 0 .. jsonb_array_length(sd -> 'act') - 1 loop
    sd := jsonb_set(sd, array['mons', k::text], public._bt_enter(sd -> 'mons' -> k));
  end loop;
  return sd;
end $$;

create or replace function public._bt_enter(m jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select m || jsonb_build_object('out', true, 'prot', 0, 'cnf', 0, 'rch', false, 'loaf', false, 'ff', false,
                                 'stg', case when m ? 'syn' then jsonb_build_object(m ->> 'syn', 1) else '{}'::jsonb end)
$$;

-- 시간표 칸: 지금 시각 → {from, to, name, env, mult}. env = sun · rain · sand · hail · electric · grassy · misty · psychic (없으면 그냥 배틀)
create or replace function public._bt_field() returns jsonb
language sql stable security definer set search_path = '' as $$
  select f || jsonb_build_object('mult', coalesce((public._setting('battle_field_mult'))::numeric, 1.3))
    from jsonb_array_elements(coalesce(public._setting('battle_fields'), '[]'::jsonb)) f
   where (now() at time zone 'Asia/Seoul')::time >= (f ->> 'from')::time and (now() at time zone 'Asia/Seoul')::time < (f ->> 'to')::time
   limit 1
$$;

-- 배틀 시작: 시간표 날씨 · 필드 (바탕, 끝나지 않음) + 나와 있는 포켓몬의 등장 특성 (빠른 순서)
create or replace function public._bt_init(inout st jsonb, out lg jsonb)
language plpgsql immutable set search_path = '' as $$
declare env text := st -> 'field' ->> 'env'; u int;
begin
  lg := '[]';
  st := st || jsonb_build_object('init', true,
    'wx', case when env in ('sun', 'rain', 'sand', 'hail') then jsonb_build_object('k', env, 'n', null) end,
    'ter', case when env in ('electric', 'grassy', 'misty', 'psychic') then jsonb_build_object('k', env, 'n', null) end);
  st := st || jsonb_build_object('base', jsonb_build_object('wx', st -> 'wx', 'ter', st -> 'ter'));
  for u in select g from generate_series(0, 3) g where public._bt_live(st, g)
            order by public._bt_spe(st, public._bt_m(st, g)) desc, g loop
    select * into st, lg from public._bt_entry(st, lg, u);
  end loop;
end $$;

create or replace function public._bt_init_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lg jsonb;
begin
  if new.status = 'active' and not coalesce((new.state ->> 'init')::boolean, false) and coalesce((new.state ->> 'turn')::int, 0) = 0
     and jsonb_array_length(coalesce(new.state -> 'sides', '[]')) = 2 then
    select * into new.state, lg from public._bt_init(new.state);
    new.log := lg;
  end if;
  return new;
end $$;
drop trigger if exists battles_init on public.battles;
create trigger battles_init before insert or update of status, state on public.battles
  for each row execute function public._bt_init_trg();

-- 교체: 나가는 포켓몬 (변신 풀림 · 자연회복 · 재생력) → 들어오는 포켓몬 (등장 특성)
create or replace function public._bt_switch(inout st jsonb, inout lg jsonb, u int, idx int)
language plpgsql volatile security definer set search_path = '' as $$
declare s int := u / 2; k int := u % 2; m jsonb; nw jsonb;
begin
  if idx is null or idx < 0 or idx >= jsonb_array_length(st -> 'sides' -> s -> 'mons')
     or jsonb_array_length(st -> 'sides' -> s -> 'act') <= k
     or (st -> 'sides' -> s -> 'act') @> to_jsonb(idx)
     or (st -> 'sides' -> s -> 'mons' -> idx ->> 'hp')::int <= 0 then return; end if;
  m := public._bt_m(st, u);
  if (m ->> 'hp')::int > 0 then lg := lg || jsonb_build_object('back', u, 'name', m ->> 'name'); end if;
  if m ? 'orig' then m := (m - 'orig' - 'tf' - 'tsp') || (m -> 'orig'); end if;   -- 변신이 풀림
  if (m ->> 'hp')::int > 0 then
    if m ->> 'ab' = 'natural-cure' and (m ->> 'st') is not null then m := m || '{"st": null, "slp": 0, "frz": 0}'; end if;
    if m ->> 'ab' = 'regenerator' then m := jsonb_set(m, '{hp}', to_jsonb(least((m ->> 'max')::int, (m ->> 'hp')::int + (m ->> 'max')::int / 3))); end if;
  end if;
  st := public._bt_setm(st, u, m || '{"stg": {}, "prot": 0, "cnf": 0, "rch": false}');
  st := jsonb_set(st, array['sides', s::text, 'act', k::text], to_jsonb(idx));
  nw := public._bt_enter(st -> 'sides' -> s -> 'mons' -> idx);
  st := jsonb_set(st, array['sides', s::text, 'mons', idx::text], nw);
  lg := lg || jsonb_build_object('sw', jsonb_build_array(u, idx), 'name', nw ->> 'name', 'sp', nw -> 'sp', 'lv', nw -> 'lv');
  if nw ? 'syn' then
    lg := lg || jsonb_build_object('m', '@' || s || (nw ->> 'name') || '의 ' || (nw ->> 'synname') || ' 시너지!', 'stat', jsonb_build_array(u, 1));
  end if;
  select * into st, lg from public._bt_entry(st, lg, u);
end $$;

-- ── 5. 기술 (0032 _bt_move + 특성 · 날씨 · 필드 · 변신 · 날씨 기술) ──────────────────────────────────────────
create or replace function public._bt_move(inout st jsonb, inout lg jsonb, inout fl jsonb, u int, slot int, tu int)
language plpgsql volatile security definer set search_path = '' as $$
declare
  s int := u / 2; o int := 1 - u / 2; a jsonb; d jsonb; mv public.moves; e jsonb;
  an text; dn text; aw text; dw text;
  i int; pp int; mult numeric; crit boolean; ak text; dk text; at numeric; df numeric;
  dmg numeric; dh0 int; tmp int; chance numeric; ok boolean; sd jsonb; hits boolean; k int;
  nh int; j int; nhit int := 0; tot int := 0; pw numeric; lv int; acc numeric; endured boolean := false; cs int;
  sim jsonb := st -> 'sim'; aab text; dab text; dab0 text; wx text := public._bt_wxk(st); ter text := st -> 'ter' ->> 'k';
  xk text; mf numeric := 1; sturdy boolean := false; busted boolean := false; contact boolean; dpp int; best text;
begin
  a := public._bt_m(st, u);
  if a is null or (a ->> 'hp')::int <= 0 then return; end if;
  aab := a ->> 'ab';
  an := '@' || s || (a ->> 'name'); aw := public._bt_j(an, '은', '는');
  lv := coalesce((a ->> 'lv')::int, 50);
  if fl -> 'quick' ? u::text then
    lg := lg || jsonb_build_object('m', public._bt_j(an || '의 ' || (a ->> 'heldname'), '이', '가') || ' 울려서 먼저 움직였다!');
  end if;
  fl := jsonb_set(fl, array['moved', u::text], 'true');

  if coalesce((a ->> 'rch')::boolean, false) then
    lg := lg || jsonb_build_object('m', aw || ' 공격의 반동으로 움직일 수 없다!');
    a := a || '{"rch": false, "prot": 0}'; st := public._bt_setm(st, u, a); return;
  end if;
  if fl -> 'flinch' ? u::text then
    lg := lg || jsonb_build_object('m', aw || ' 풀이 죽어 기술을 쓸 수 없다!', 'fx', jsonb_build_array(u, 'flinch'));
    a := jsonb_set(a, '{prot}', '0');
    if aab = 'steadfast' then   -- 불굴의마음: 풀죽으면 스피드 +1
      select * into a, lg from public._bt_pop(a, lg, u);
      select * into a, lg from public._bt_stages(a, lg, '{"spe": 1}', an || '의 ', u);
    end if;
    st := public._bt_setm(st, u, a); return;
  end if;
  if aab = 'truant' and coalesce((a ->> 'loaf')::boolean, false) then   -- 게으름: 한 턴 걸러 쉼
    a := a || '{"loaf": false, "prot": 0}';
    select * into a, lg from public._bt_pop(a, lg, u);
    lg := lg || jsonb_build_object('m', aw || ' 게으름을 피우고 있다!');
    st := public._bt_setm(st, u, a); return;
  end if;
  if a ->> 'st' = 'slp' then
    tmp := case when aab = 'early-bird' then 2 else 1 end;   -- 일찍기상: 두 배 빨리 깸
    if (a ->> 'slp')::int > tmp then
      a := jsonb_set(a, '{slp}', to_jsonb((a ->> 'slp')::int - tmp));
      lg := lg || jsonb_build_object('m', aw || ' 쿨쿨 잠들어 있다.', 'fx', jsonb_build_array(u, 'slp'));
      a := jsonb_set(a, '{prot}', '0'); st := public._bt_setm(st, u, a); return;
    end if;
    a := a || '{"st": null, "slp": 0}';
    lg := lg || jsonb_build_object('m', aw || ' 눈을 떴다!', 'st', jsonb_build_array(u, null));
  end if;
  if a ->> 'st' = 'frz' then
    if coalesce((a ->> 'frz')::int, 0) > 1 and random() >= 0.2 then
      a := jsonb_set(a, '{frz}', to_jsonb((a ->> 'frz')::int - 1));
      lg := lg || jsonb_build_object('m', aw || ' 꽁꽁 얼어 버려서 움직일 수 없다!', 'fx', jsonb_build_array(u, 'frz'));
      a := jsonb_set(a, '{prot}', '0'); st := public._bt_setm(st, u, a); return;
    end if;
    a := a || '{"st": null, "frz": 0}';
    lg := lg || jsonb_build_object('m', aw || ' 얼음 상태가 나았다!', 'st', jsonb_build_array(u, null));
  end if;
  if a ->> 'st' = 'par' and random() < 0.25 and not coalesce((sim ->> 'nopar')::boolean, false) then
    lg := lg || jsonb_build_object('m', aw || ' 몸이 저려서 움직일 수 없다!', 'fx', jsonb_build_array(u, 'par'));
    a := jsonb_set(a, '{prot}', '0'); st := public._bt_setm(st, u, a); return;
  end if;
  if coalesce((a ->> 'cnf')::int, 0) > 0 then
    a := jsonb_set(a, '{cnf}', to_jsonb((a ->> 'cnf')::int - 1));
    if (a ->> 'cnf')::int = 0 then
      lg := lg || jsonb_build_object('m', aw || ' 혼란이 풀렸다!');
    else
      lg := lg || jsonb_build_object('m', aw || ' 혼란에 빠져 있다!', 'fx', jsonb_build_array(u, 'cnf'));
      if random() < 0.33 then
        tmp := floor(floor(floor(2 * lv / 5 + 2) * 40 * public._bt_eff(a, 'atk') / greatest(1, public._bt_eff(a, 'def'))) / 50)::int + 2;
        a := jsonb_set(jsonb_set(a, '{hp}', to_jsonb(greatest(0, (a ->> 'hp')::int - tmp))), '{prot}', '0');
        lg := lg || jsonb_build_object('m', '영문도 모른 채 자신을 공격했다!', 'hp', jsonb_build_array(u, (a ->> 'hp')::int), 'dmg', tmp);
        st := public._bt_setm(st, u, a);
        if (a ->> 'hp')::int <= 0 then lg := lg || jsonb_build_object('m', aw || ' 쓰러졌다!', 'faint', u); end if;
        return;
      end if;
    end if;
  end if;

  i := greatest(1, least(coalesce(slot, 1), jsonb_array_length(a -> 'moves')));
  if coalesce((a -> 'moves' -> (i - 1) ->> 'pp')::int, 0) <= 0 then
    select o2 into i from jsonb_array_elements(a -> 'moves') with ordinality x(v, o2) where (v ->> 'pp')::int > 0 order by o2 limit 1;
  end if;
  if i is null then
    mv.name := '발버둥'; mv.type := '???'; mv.category := 'physical'; mv.kind := 'attack'; mv.power := 50;
    mv.accuracy := null; mv.priority := 0; mv.effect := '{"recoil": 4}';
    lg := lg || jsonb_build_object('m', aw || ' 쓸 수 있는 기술이 없다!');
  else
    select * into mv from public.moves where id = (a -> 'moves' -> (i - 1) ->> 'id')::int;
    pp := (a -> 'moves' -> (i - 1) ->> 'pp')::int;
    -- 프레셔: 상대 쪽에 프레셔가 나와 있으면 PP 가 2 줄어듦
    dpp := case when exists (select 1 from generate_series(0, 1) g where public._bt_live(st, o * 2 + g) and public._bt_m(st, o * 2 + g) ->> 'ab' = 'pressure') then 2 else 1 end;
    a := jsonb_set(a, array['moves', (i - 1)::text, 'pp'], to_jsonb(greatest(0, pp - dpp)));
  end if;
  e := coalesce(mv.effect, '{}');
  -- 스킨 특성: 노말 기술이 다른 타입 + 위력 1.2배
  if mv.type = '노말' and mv.kind = 'attack' and aab in ('refrigerate', 'pixilate', 'aerilate', 'galvanize') then
    mv.type := case aab when 'refrigerate' then '얼음' when 'pixilate' then '페어리' when 'aerilate' then '비행' else '전기' end; mf := 1.2;
  end if;
  lg := lg || jsonb_build_object('m', an || '의 ' || mv.name || '!', 'use', jsonb_build_array(u, mv.type, mv.category));
  if aab = 'truant' then a := a || '{"loaf": true}'; end if;

  if e ? 'protect' or e ? 'endure' then
    if random() < power(0.5, coalesce((a ->> 'prot')::int, 0)) then
      a := jsonb_set(a, '{prot}', to_jsonb(coalesce((a ->> 'prot')::int, 0) + 1));
      fl := jsonb_set(fl, array[case when e ? 'protect' then 'prot' else 'end' end, u::text], 'true');
      lg := lg || jsonb_build_object('m', aw || case when e ? 'protect' then ' 방어 태세에 들어갔다!' else ' 버티기 태세에 들어갔다!' end);
    else
      a := jsonb_set(a, '{prot}', '0');
      lg := lg || jsonb_build_object('m', '그러나 실패했다!');
    end if;
    st := public._bt_setm(st, u, a); return;
  end if;
  a := jsonb_set(a, '{prot}', '0');

  -- 상대를 노리는 기술: 노린 자리가 비었으면 남은 상대로
  hits := mv.kind = 'attack' or e ? 'foe_status' or e ? 'foe' or e ? 'transform';
  if hits then
    if tu is null or tu / 2 <> o or not public._bt_live(st, tu) then
      tu := null;
      for k in 0 .. 1 loop
        if public._bt_live(st, o * 2 + k) then tu := o * 2 + k; exit; end if;
      end loop;
    end if;
    if tu is null then
      lg := lg || jsonb_build_object('m', '그러나 상대가 없다!'); st := public._bt_setm(st, u, a); return;
    end if;
    d := public._bt_m(st, tu); dh0 := (d ->> 'hp')::int;
    dn := '@' || o || (d ->> 'name'); dw := public._bt_j(dn, '은', '는');
    dab0 := d ->> 'ab';
    dab := case when aab in ('mold-breaker', 'turboblaze', 'teravolt') then null else dab0 end;   -- 틀깨기: 상대 특성을 무시
    if fl -> 'prot' ? tu::text then
      lg := lg || jsonb_build_object('m', dw || ' 공격으로부터 몸을 지켰다!'); st := public._bt_setm(st, u, a); return;
    end if;
    -- 사이코필드: 땅에 있는 상대에게는 선공기가 통하지 않음
    if ter = 'psychic' and coalesce(mv.priority, 0) > 0 and public._bt_grounded(d) then
      lg := lg || jsonb_build_object('m', dw || ' 사이코필드에 보호받고 있다!'); st := public._bt_setm(st, u, a); return;
    end if;
    -- 명중: 기술 명중 × (내 명중 랭크 − 상대 회피 랭크) × 광각렌즈 × 특성 (복안 · 의욕 · 모래숨기 · 눈숨기). 노가드 = 반드시 맞음
    if mv.accuracy is not null and not (coalesce(aab, '') = 'no-guard' or coalesce(dab0, '') = 'no-guard') then
      acc := mv.accuracy * public._bt_sm(greatest(-6, least(6, coalesce((a -> 'stg' ->> 'acc')::int, 0) - coalesce((d -> 'stg' ->> 'eva')::int, 0))), true)
             * coalesce((a -> 'hold' ->> 'acc')::numeric / 100, 1)
             * case when aab = 'compound-eyes' then 1.3 else 1 end
             * case when aab = 'hustle' and mv.category = 'physical' then 0.8 else 1 end
             * case when (dab = 'sand-veil' and wx = 'sand') or (dab = 'snow-cloak' and wx = 'hail') then 0.8 else 1 end;
      if public._bt_rnd(st) * 100 >= acc then
        lg := lg || jsonb_build_object('m', case when mv.kind = 'attack' then '그러나 ' || an || '의 공격은 빗나갔다!' else '그러나 빗나갔다!' end);
        st := public._bt_setm(st, u, a); return;
      end if;
    end if;
    -- 특성으로 막음 · 흡수 (부유 · 축전 · 저수 · 전기엔진 · 피뢰침 · 마중물 · 초식 · 타오르는불꽃 · 불가사의부적)
    xk := public._bt_absorb(dab, mv.type, mv.kind, case when mv.kind = 'attack' then public._bt_tm(mv.type, d ->> 'type') end);
    if xk is not null then
      select * into d, lg from public._bt_pop(d, lg, tu);
      if xk = 'immune' then
        lg := lg || jsonb_build_object('m', dn || '에게는 효과가 없는 것 같다...');
      elsif xk = 'heal4' then
        if (d ->> 'hp')::int >= (d ->> 'max')::int then
          lg := lg || jsonb_build_object('m', dn || '에게는 효과가 없는 것 같다...');
        else
          d := jsonb_set(d, '{hp}', to_jsonb(least((d ->> 'max')::int, (d ->> 'hp')::int + greatest(1, (d ->> 'max')::int / 4))));
          lg := lg || jsonb_build_object('m', dn || '의 체력이 회복되었다!', 'hp', jsonb_build_array(tu, (d ->> 'hp')::int), 'fx', jsonb_build_array(tu, 'heal'));
        end if;
      elsif xk = 'ff' then
        d := d || '{"ff": true}';
        lg := lg || jsonb_build_object('m', dn || '의 불꽃의 위력이 올라갔다!');
      else
        select * into d, lg from public._bt_stages(d, lg, jsonb_build_object(xk, 1), dn || '의 ', tu);
      end if;
      st := public._bt_setm(public._bt_setm(st, tu, d), u, a); return;
    end if;
  else
    tu := null;
  end if;

  if mv.kind = 'attack' then
    sd := st -> 'sides' -> o;
    if e ? 'break_screen' and ((sd ->> 'reflect')::int > 0 or (sd ->> 'light')::int > 0) then
      st := jsonb_set(jsonb_set(st, array['sides', o::text, 'reflect'], '0'), array['sides', o::text, 'light'], '0');
      sd := st -> 'sides' -> o;
      lg := lg || jsonb_build_object('m', '@' || o || '벽이 깨졌다!');
    end if;
    -- 배짱: 노말 · 격투 기술이 고스트에게도 맞음
    mult := public._bt_tm(mv.type, case when aab = 'scrappy' and mv.type in ('노말', '격투') then regexp_replace(d ->> 'type', '고스트', '') else d ->> 'type' end);
    if mult = 0 then
      lg := lg || jsonb_build_object('m', dn || '에게는 효과가 없는 것 같다...'); st := public._bt_setm(st, u, a); return;
    end if;
    contact := mv.category = 'physical';            -- 접촉 = 물리 기술 (이 게임의 약속)
    pw := mv.power * mf * public._bt_pw(st, a, d, dab, mv.type, mv.category, mv.name, mv.power, e);
    nh := case when not e ? 'hits' then 1 when (e ->> 'hits')::int in (2, 3) then (e ->> 'hits')::int
               when aab = 'skill-link' then 5
               else (array[2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5])[1 + floor(random() * 20)::int] end;
    cs := case when coalesce((e ->> 'high_crit')::boolean, false) then 1 else 0 end + coalesce((a -> 'hold' ->> 'crit')::int, 0)
          + case when aab = 'super-luck' then 1 else 0 end;
    for j in 1 .. nh loop
      exit when (d ->> 'hp')::int <= 0;
      crit := case when sim ? 'crit' then (sim ->> 'crit')::boolean
                   else coalesce((e ->> 'always_crit')::boolean, false)
                        or coalesce((sim ->> 'crit_r')::numeric, random()::numeric) < case cs when 0 then 0.0625 when 1 then 0.125 else 0.25 end end
              and coalesce(dab, '') not in ('battle-armor', 'shell-armor');
      if mv.category = 'physical' then ak := 'atk'; dk := 'def'; else ak := 'spa'; dk := 'spd'; end if;
      tmp := coalesce((a -> 'stg' ->> ak)::int, 0);
      at := (a ->> ak)::int * public._bt_sm(case when crit then greatest(0, tmp) else tmp end)
            * case when ak = 'atk' and aab in ('huge-power', 'pure-power') then 2 else 1 end
            * case when ak = 'atk' and aab = 'guts' and (a ->> 'st') is not null then 1.5 else 1 end
            * case when ak = 'atk' and aab = 'hustle' then 1.5 else 1 end
            * case when ak = 'spa' and aab = 'solar-power' and wx = 'sun' then 1.5 else 1 end;
      tmp := coalesce((d -> 'stg' ->> dk)::int, 0);
      df := (d ->> dk)::int * public._bt_sm(case when crit then least(0, tmp) else tmp end)
            * case when dk = 'def' and dab = 'marvel-scale' and (d ->> 'st') is not null then 1.5 else 1 end
            * case when dk = 'def' and dab = 'fur-coat' then 2 else 1 end
            * case when dk = 'spd' and wx = 'sand' and public._bt_hastype(d, '바위') then 1.5 else 1 end;
      dmg := floor(floor(floor(2 * lv / 5 + 2) * pw * floor(at) / greatest(1, floor(df))) / 50);
      if mv.category = 'physical' and a ->> 'st' = 'brn' and coalesce(aab, '') <> 'guts' then dmg := floor(dmg / 2); end if;
      if not crit and ((mv.category = 'physical' and (sd ->> 'reflect')::int > 0) or (mv.category = 'special' and (sd ->> 'light')::int > 0)) then
        dmg := floor(dmg / 2);
      end if;
      dmg := dmg + 2;
      if crit then dmg := dmg * case when aab = 'sniper' then 3 else 2 end; end if;
      dmg := floor(dmg * coalesce((sim ->> 'roll')::int, 85 + floor(random() * 16)) / 100);
      if mv.type = any (string_to_array(a ->> 'type', '/')) then dmg := floor(dmg * case when aab = 'adaptability' then 2 else 1.5 end); end if;
      dmg := greatest(1, floor(dmg * mult));
      if mult > 1 and dab in ('filter', 'solid-rock', 'prism-armor') then dmg := greatest(1, floor(dmg * 0.75)); end if;
      if mult < 1 and aab = 'tinted-lens' then dmg := floor(dmg * 2); end if;
      if dab in ('multiscale', 'shadow-shield') and (d ->> 'hp')::int >= (d ->> 'max')::int then dmg := greatest(1, floor(dmg / 2)); end if;
      tmp := (d ->> 'hp')::int;
      -- 탈 (따라큐): 처음 한 번은 탈이 대신 맞음
      if dab = 'disguise' and not coalesce((d ->> 'busted')::boolean, false) then
        d := d || '{"busted": true}'; busted := true;
        select * into d, lg from public._bt_pop(d, lg, tu);
        lg := lg || jsonb_build_object('m', '탈이 대신 공격을 받았다!');
        nhit := nhit + 1;
        continue;
      end if;
      -- 옹골참: HP 가 가득일 때 한 번에 쓰러지지 않음
      if dmg >= tmp and dab = 'sturdy' and tmp >= (d ->> 'max')::int then dmg := tmp - 1; sturdy := true; end if;
      if dmg >= tmp and fl -> 'end' ? tu::text then dmg := tmp - 1; endured := true; end if;
      dmg := least(dmg, tmp);
      d := jsonb_set(d, '{hp}', to_jsonb(tmp - dmg::int));
      tot := tot + dmg::int; nhit := nhit + 1;
      lg := lg || jsonb_build_object('hp', jsonb_build_array(tu, (d ->> 'hp')::int), 'dmg', dmg::int);
      if crit then lg := lg || jsonb_build_object('m', '급소에 맞았다!'); end if;
    end loop;
    if nh > 1 then lg := lg || jsonb_build_object('m', nhit || '번 맞았다!'); end if;
    if mult > 1 and tot > 0 then lg := lg || jsonb_build_object('m', '효과가 굉장했다!');
    elsif mult < 1 and tot > 0 then lg := lg || jsonb_build_object('m', '효과가 별로인 듯하다...'); end if;
    if busted then lg := lg || jsonb_build_object('m', public._bt_j(dn || '의 탈', '이', '가') || ' 벗겨졌다!', 'fx', jsonb_build_array(tu, 'flinch')); end if;
    if sturdy then
      select * into d, lg from public._bt_pop(d, lg, tu);
      lg := lg || jsonb_build_object('m', dw || ' 공격을 버텼다!');
    end if;
    if endured then lg := lg || jsonb_build_object('m', dw || ' 공격을 버텼다!'); end if;
    -- 얼음: 불꽃 공격에 맞으면 녹는다
    if d ->> 'st' = 'frz' and mv.type = '불꽃' and (d ->> 'hp')::int > 0 then
      d := d || '{"st": null, "frz": 0}';
      lg := lg || jsonb_build_object('m', public._bt_j(dn || '의 얼음', '이', '가') || ' 녹았다!', 'st', jsonb_build_array(tu, null));
    end if;
    -- 자뭉열매: HP 절반 이하 → 한 번 회복
    if d -> 'hold' ? 'pinch_heal' and not coalesce((d ->> 'used')::boolean, false) and (d ->> 'hp')::int > 0
       and (d ->> 'hp')::int * 2 <= (d ->> 'max')::int then
      tmp := least((d ->> 'max')::int, (d ->> 'hp')::int + (d ->> 'max')::int * (d -> 'hold' ->> 'pinch_heal')::int / 100);
      d := d || jsonb_build_object('hp', tmp, 'used', true);
      lg := lg || jsonb_build_object('m', dw || ' ' || (d ->> 'heldname') || '를 먹었다! HP가 회복되었다!', 'hp', jsonb_build_array(tu, tmp), 'fx', jsonb_build_array(tu, 'heal'));
    end if;

    if e ? 'drain' and tot > 0 and (a ->> 'hp')::int < (a ->> 'max')::int then
      tmp := least((a ->> 'max')::int, (a ->> 'hp')::int + greatest(1, floor(tot * (e ->> 'drain')::int / 100)::int));
      a := jsonb_set(a, '{hp}', to_jsonb(tmp));
      lg := lg || jsonb_build_object('m', public._bt_j(dn, '으로', '로') || '부터 체력을 흡수했다!', 'hp', jsonb_build_array(u, tmp));
    end if;
    -- 반동: 돌머리 · 매직가드는 받지 않음 (발버둥은 받음)
    if (e ? 'recoil' or e ? 'self_damage') and tot > 0 and (coalesce(aab, '') not in ('rock-head', 'magic-guard') or mv.name = '발버둥') then
      tmp := case when e ? 'recoil' then greatest(1, floor(tot / (e ->> 'recoil')::int)::int)
                  else greatest(1, (a ->> 'max')::int * (e ->> 'self_damage')::int / 100) end;
      a := jsonb_set(a, '{hp}', to_jsonb(greatest(0, (a ->> 'hp')::int - tmp)));
      lg := lg || jsonb_build_object('m', aw || ' 반동으로 데미지를 입었다!', 'hp', jsonb_build_array(u, (a ->> 'hp')::int));
    end if;
    if e ? 'recharge' then a := jsonb_set(a, '{rch}', 'true'); end if;
    -- 추가 효과: 하늘의은총 = 확률 2배, 인분 = 상대가 받지 않음
    chance := coalesce((e ->> 'chance')::int, 100) * case when aab = 'serene-grace' then 2 else 1 end;
    if tot > 0 and (e ? 'foe_status' or e ? 'foe' or e ? 'self') and public._bt_rnd(st) * 100 < chance then
      if dab = 'shield-dust' then
        null;
      else
        if e ? 'foe_status' then select * into d, lg, ok from public._bt_status(d, lg, false, e ->> 'foe_status', dn, tu, st, true); end if;
        if e ? 'foe' then select * into d, lg from public._bt_stages(d, lg, e -> 'foe', dn || '의 ', tu, true); end if;
      end if;
      if e ? 'self' then select * into a, lg from public._bt_stages(a, lg, e -> 'self', an || '의 ', u); end if;
    end if;
    if e ? 'self_all_up' and public._bt_rnd(st) * 100 < (e ->> 'self_all_up')::int * (case when aab = 'serene-grace' then 2 else 1 end) then
      select * into a, lg from public._bt_stages(a, lg, '{"atk": 1, "def": 1, "spa": 1, "spd": 1, "spe": 1}', an || '의 ', u);
    end if;
    -- 풀죽음: 상대가 이번 턴에 아직 안 움직였으면 (정신력 · 인분은 안 됨)
    if e ? 'flinch' and tot > 0 and (d ->> 'hp')::int > 0 and not (fl -> 'moved' ? tu::text) and coalesce(dab, '') not in ('inner-focus', 'shield-dust')
       and public._bt_rnd(st) * 100 < (e ->> 'flinch')::int * (case when aab = 'serene-grace' then 2 else 1 end) then
      fl := jsonb_set(fl, array['flinch', tu::text], 'true');
    end if;
    -- 접촉 특성 (정전기 · 독가시 · 불꽃몸 · 포자: 30%, 까칠한피부 · 철가시: 1/8)
    if contact and tot > 0 and (a ->> 'hp')::int > 0 then
      if dab0 in ('static', 'poison-point', 'flame-body', 'effect-spore') and (a ->> 'st') is null and public._bt_rnd(st) * 100 < 30
         and not (dab0 = 'effect-spore' and (public._bt_hastype(a, '풀') or coalesce(aab, '') = 'overcoat')) then
        xk := case dab0 when 'static' then 'par' when 'poison-point' then 'psn' when 'flame-body' then 'brn'
                       else (array['psn', 'par', 'slp'])[1 + floor(random() * 3)::int] end;
        select * into d, lg from public._bt_pop(d, lg, tu);
        select * into a, lg, ok from public._bt_status(a, lg, false, xk, an, u, st, false);
      end if;
      if dab0 in ('rough-skin', 'iron-barbs') and coalesce(aab, '') <> 'magic-guard' then
        select * into d, lg from public._bt_pop(d, lg, tu);
        a := jsonb_set(a, '{hp}', to_jsonb(greatest(0, (a ->> 'hp')::int - greatest(1, (a ->> 'max')::int / 8))));
        lg := lg || jsonb_build_object('m', aw || ' 상처를 입었다!', 'hp', jsonb_build_array(u, (a ->> 'hp')::int));
      end if;
    end if;
    -- 정의의마음: 악 기술에 맞으면 공격 +1
    if tot > 0 and mv.type = '악' and dab0 = 'justified' and (d ->> 'hp')::int > 0 then
      select * into d, lg from public._bt_pop(d, lg, tu);
      select * into d, lg from public._bt_stages(d, lg, '{"atk": 1}', dn || '의 ', tu);
    end if;
  else
    ok := true;
    -- 날씨 기술: 5턴 (같은 날씨면 실패)
    if e ? 'weather' then
      if coalesce(st -> 'wx' ->> 'k', '') = e ->> 'weather' then
        lg := lg || jsonb_build_object('m', '그러나 실패했다!');
      else
        st := st || jsonb_build_object('wx', jsonb_build_object('k', e ->> 'weather', 'n', 5));
        lg := lg || jsonb_build_object('m', public._bt_envmsg(e ->> 'weather', 'start'), 'wx', e ->> 'weather');
      end if;
    end if;
    if e ? 'transform' then
      select * into a, lg from public._bt_tf(a, lg, d, u, an, dn);
    end if;
    if e ? 'foe_status' then
      tmp := jsonb_array_length(lg);
      select * into d, lg, ok from public._bt_status(d, lg, false, e ->> 'foe_status', dn, tu, st, false);
      -- 이미 상태 이상 등 (특성 · 필드가 막았으면 그 글이 이미 있음)
      if not ok and not (e ? 'foe') and jsonb_array_length(lg) = tmp then lg := lg || jsonb_build_object('m', '그러나 실패했다!'); end if;
    end if;
    if e ? 'foe' then select * into d, lg from public._bt_stages(d, lg, e -> 'foe', dn || '의 ', tu, true); end if;
    if e ? 'self' then select * into a, lg from public._bt_stages(a, lg, e -> 'self', an || '의 ', u); end if;
    if e ? 'screen' then
      if (st -> 'sides' -> s ->> (e ->> 'screen'))::int > 0 then
        lg := lg || jsonb_build_object('m', '그러나 실패했다!');
      else
        st := jsonb_set(st, array['sides', s::text, e ->> 'screen'], '5');
        lg := lg || jsonb_build_object('m', case when e ->> 'screen' = 'reflect' then '@' || s || '리플렉터로 물리 공격에 강해졌다!'
                                                   else '@' || s || '빛의장막으로 특수 공격에 강해졌다!' end);
      end if;
    end if;
    if e ? 'heal' then
      if (a ->> 'hp')::int >= (a ->> 'max')::int then
        lg := lg || jsonb_build_object('m', '그러나 ' || an || '의 HP는 가득 차 있다!');
      else
        tmp := least((a ->> 'max')::int, (a ->> 'hp')::int + greatest(1, (a ->> 'max')::int * (e ->> 'heal')::int / 100));
        a := jsonb_set(a, '{hp}', to_jsonb(tmp));
        lg := lg || jsonb_build_object('m', an || '의 체력이 회복되었다!', 'hp', jsonb_build_array(u, tmp), 'fx', jsonb_build_array(u, 'heal'));
      end if;
    end if;
    if e ? 'rest' then
      if (a ->> 'hp')::int >= (a ->> 'max')::int then
        lg := lg || jsonb_build_object('m', '그러나 실패했다!');
      elsif ter = 'electric' and public._bt_grounded(a) then
        lg := lg || jsonb_build_object('m', aw || ' 일렉트릭필드에 보호받고 있다!');
      elsif coalesce(aab, '') in ('insomnia', 'vital-spirit') then
        select * into a, lg from public._bt_pop(a, lg, u);
        lg := lg || jsonb_build_object('m', '그러나 실패했다!');
      else
        a := a || jsonb_build_object('hp', (a ->> 'max')::int, 'st', 'slp', 'slp', 3, 'frz', 0);
        lg := lg || jsonb_build_object('m', aw || ' 잠들어서 건강해졌다!', 'hp', jsonb_build_array(u, (a ->> 'max')::int), 'st', jsonb_build_array(u, 'slp'));
      end if;
    end if;
  end if;

  st := public._bt_setm(public._bt_setm(st, tu, d), u, a);
  if d is not null and (d ->> 'hp')::int <= 0 and dh0 > 0 then
    lg := lg || jsonb_build_object('m', dw || ' 쓰러졌다!', 'faint', tu);
    -- 자기과신 (공격 +1) · 비스트부스트 (가장 높은 능력 +1): 상대를 쓰러뜨리면
    if (a ->> 'hp')::int > 0 and aab in ('moxie', 'beast-boost') then
      best := case when aab = 'moxie' then 'atk' else
        (select k2 from (values ('atk', (a ->> 'atk')::int, 1), ('def', (a ->> 'def')::int, 2), ('spa', (a ->> 'spa')::int, 3),
                                ('spd', (a ->> 'spd')::int, 4), ('spe', (a ->> 'spe')::int, 5)) v(k2, val, o2) order by val desc, o2 limit 1) end;
      select * into a, lg from public._bt_pop(a, lg, u);
      select * into a, lg from public._bt_stages(a, lg, jsonb_build_object(best, 1), an || '의 ', u);
      st := public._bt_setm(st, u, a);
    end if;
  end if;
  if (a ->> 'hp')::int <= 0 then lg := lg || jsonb_build_object('m', aw || ' 쓰러졌다!', 'faint', u); end if;
end $$;

-- ── 6. 한 턴 (0020 _bt_turn + 날씨 · 필드 · 특성의 턴 끝 효과) ─────────────────────────────────────────────
create or replace function public._bt_turn(inout st jsonb, acts jsonb, out lg jsonb)
language plpgsql volatile security definer set search_path = '' as $$
declare
  fl jsonb := '{"prot": {}, "end": {}, "moved": {}, "flinch": {}, "quick": {}}'; s int; u int; a jsonb; ord int[]; m jsonb; mid int; dmg int;
  key text; n int; q int; rows jsonb := '[]'; w text; ab text; nm text; swapped int[] := '{}'; b jsonb; ok boolean;
begin
  lg := '[]';
  st := jsonb_set(st, '{turn}', to_jsonb(coalesce((st ->> 'turn')::int, 0) + 1));
  -- 1) 교체 → 2) 회복약
  for u in 0 .. 3 loop
    a := acts -> (u / 2)::text -> (u % 2);
    if a ? 'switch' then select * into st, lg from public._bt_switch(st, lg, u, (a ->> 'switch')::int); swapped := swapped || u; end if;
  end loop;
  for u in 0 .. 3 loop
    a := acts -> (u / 2)::text -> (u % 2);
    if a ? 'item' and public._bt_m(st, u) is not null then
      select * into st, lg from public._bt_item(st, lg, u, a ->> 'item', (a ->> 'target')::int);
    end if;
  end loop;
  -- 3) 기술 순서: 선공 → 선제공격손톱 → 스피드 (날씨 특성 포함) → 동전
  for u in 0 .. 3 loop
    a := acts -> (u / 2)::text -> (u % 2);
    if a ? 'move' and public._bt_live(st, u) then
      m := public._bt_m(st, u);
      mid := (m -> 'moves' -> ((a ->> 'move')::int - 1) ->> 'id')::int;
      q := case when m -> 'hold' ? 'quick' and random() * 100 < (m -> 'hold' ->> 'quick')::int then 1 else 0 end;
      if q = 1 then fl := jsonb_set(fl, array['quick', u::text], 'true'); end if;
      rows := rows || jsonb_build_object('u', u, 'p', coalesce((select priority from public.moves where id = mid), 0), 'q', q,
                                         'sp', public._bt_spe(st, m), 'r', random());
    end if;
  end loop;
  select coalesce(array_agg((x ->> 'u')::int order by (x ->> 'p')::int desc, (x ->> 'q')::int desc, (x ->> 'sp')::numeric desc, (x ->> 'r')::numeric), '{}')
    into ord from jsonb_array_elements(rows) x;
  foreach u in array ord loop
    a := acts -> (u / 2)::text -> (u % 2);
    select * into st, lg, fl from public._bt_move(st, lg, fl, u, (a ->> 'move')::int,
      case when a ? 'target' then (1 - u / 2) * 2 + least(1, greatest(0, (a ->> 'target')::int)) end);
  end loop;

  -- 4) 턴 끝
  -- 4-1) 날씨: 남은 턴 줄이기 → 끝나면 시간표 바탕 날씨로. 계속되면 모래바람 · 싸라기눈 데미지, 날씨 특성
  if st -> 'wx' ->> 'n' is not null then
    n := (st -> 'wx' ->> 'n')::int - 1;
    if n <= 0 then
      w := st -> 'wx' ->> 'k'; b := st -> 'base' -> 'wx';
      if b is not null and jsonb_typeof(b) = 'object' and b ->> 'k' = w then
        st := st || jsonb_build_object('wx', b);
      else
        lg := lg || jsonb_build_object('m', public._bt_envmsg(w, 'end'), 'wx', null);
        st := st || jsonb_build_object('wx', case when jsonb_typeof(b) = 'object' then b end);
        if jsonb_typeof(b) = 'object' then lg := lg || jsonb_build_object('m', public._bt_envmsg(b ->> 'k', 'start'), 'wx', b ->> 'k'); end if;
      end if;
    else
      st := jsonb_set(st, '{wx,n}', to_jsonb(n));
    end if;
  end if;
  w := public._bt_wxk(st);
  if w is not null then
    for u in 0 .. 3 loop
      m := public._bt_m(st, u);
      continue when m is null or (m ->> 'hp')::int <= 0;
      ab := coalesce(m ->> 'ab', ''); nm := '@' || (u / 2) || (m ->> 'name');
      if w = 'sand' and not (public._bt_hastype(m, '바위') or public._bt_hastype(m, '땅') or public._bt_hastype(m, '강철'))
         and ab not in ('sand-veil', 'sand-rush', 'sand-force', 'overcoat', 'magic-guard') then
        select * into st, lg from public._bt_hpd(st, lg, u, -greatest(1, (m ->> 'max')::int / 16), '모래바람이 ' || public._bt_j(nm, '을', '를') || ' 덮쳤다!', 'sand');
      elsif w = 'hail' and not public._bt_hastype(m, '얼음') and ab not in ('ice-body', 'snow-cloak', 'slush-rush', 'overcoat', 'magic-guard') then
        select * into st, lg from public._bt_hpd(st, lg, u, -greatest(1, (m ->> 'max')::int / 16), '싸라기눈이 ' || public._bt_j(nm, '을', '를') || ' 덮쳤다!', 'hail');
      elsif (w = 'hail' and ab = 'ice-body') or (w = 'rain' and ab in ('rain-dish', 'dry-skin')) then
        if (m ->> 'hp')::int < (m ->> 'max')::int then
          select * into m, lg from public._bt_pop(m, lg, u); st := public._bt_setm(st, u, m);
          select * into st, lg from public._bt_hpd(st, lg, u, greatest(1, (m ->> 'max')::int / case when ab = 'dry-skin' then 8 else 16 end),
                                                   nm || '의 체력이 회복되었다!', 'heal');
        end if;
      elsif w = 'sun' and ab in ('dry-skin', 'solar-power') then
        select * into m, lg from public._bt_pop(m, lg, u); st := public._bt_setm(st, u, m);
        select * into st, lg from public._bt_hpd(st, lg, u, -greatest(1, (m ->> 'max')::int / 8), public._bt_j(nm, '은', '는') || ' 햇살 때문에 데미지를 입었다!');
      end if;
      m := public._bt_m(st, u);
      if w = 'rain' and ab = 'hydration' and (m ->> 'hp')::int > 0 and (m ->> 'st') is not null then
        select * into m, lg from public._bt_pop(m, lg, u);
        m := m || '{"st": null, "slp": 0, "frz": 0}'; st := public._bt_setm(st, u, m);
        lg := lg || jsonb_build_object('m', public._bt_j(nm, '은', '는') || ' 건강해졌다!', 'st', jsonb_build_array(u, null));
      end if;
    end loop;
  end if;
  -- 4-2) 그래스필드: 땅에 있는 포켓몬 1/16 회복
  if st -> 'ter' ->> 'k' = 'grassy' then
    for u in 0 .. 3 loop
      m := public._bt_m(st, u);
      if m is not null and (m ->> 'hp')::int > 0 and (m ->> 'hp')::int < (m ->> 'max')::int and public._bt_grounded(m) then
        select * into st, lg from public._bt_hpd(st, lg, u, greatest(1, (m ->> 'max')::int / 16), '@' || (u / 2) || (m ->> 'name') || '의 체력이 조금 회복되었다!', 'heal');
      end if;
    end loop;
  end if;
  -- 4-3) 화상 · 독 (매직가드 = 없음, 포이즌힐 = 독이면 1/8 회복), 먹다남은음식, 가속 · 탈피
  for u in 0 .. 3 loop
    m := public._bt_m(st, u);
    continue when m is null or (m ->> 'hp')::int <= 0;
    ab := coalesce(m ->> 'ab', ''); nm := '@' || (u / 2) || (m ->> 'name');
    if m ->> 'st' = 'psn' and ab = 'poison-heal' then
      if (m ->> 'hp')::int < (m ->> 'max')::int then
        select * into m, lg from public._bt_pop(m, lg, u); st := public._bt_setm(st, u, m);
        select * into st, lg from public._bt_hpd(st, lg, u, greatest(1, (m ->> 'max')::int / 8), nm || '의 체력이 회복되었다!', 'heal');
      end if;
    elsif m ->> 'st' in ('brn', 'psn') and ab <> 'magic-guard' then
      dmg := greatest(1, (m ->> 'max')::int / 8);
      m := jsonb_set(m, '{hp}', to_jsonb(greatest(0, (m ->> 'hp')::int - dmg)));
      st := public._bt_setm(st, u, m);
      lg := lg || jsonb_build_object('m', public._bt_j(nm, '은', '는')
                 || case when m ->> 'st' = 'brn' then ' 화상 데미지를 입고 있다!' else ' 독의 데미지를 입고 있다!' end,
                 'hp', jsonb_build_array(u, (m ->> 'hp')::int), 'fx', jsonb_build_array(u, m ->> 'st'));
      if (m ->> 'hp')::int <= 0 then
        lg := lg || jsonb_build_object('m', public._bt_j(nm, '은', '는') || ' 쓰러졌다!', 'faint', u);
      end if;
    end if;
    m := public._bt_m(st, u);
    if m is not null and (m ->> 'hp')::int > 0 and m -> 'hold' ? 'leftovers' and (m ->> 'hp')::int < (m ->> 'max')::int then
      m := jsonb_set(m, '{hp}', to_jsonb(least((m ->> 'max')::int, (m ->> 'hp')::int + greatest(1, (m ->> 'max')::int / (m -> 'hold' ->> 'leftovers')::int))));
      st := public._bt_setm(st, u, m);
      lg := lg || jsonb_build_object('m', public._bt_j(nm, '은', '는') || ' ' || (m ->> 'heldname') || ' 덕분에 조금 회복했다!',
                                     'hp', jsonb_build_array(u, (m ->> 'hp')::int));
    end if;
    m := public._bt_m(st, u);
    if m is not null and (m ->> 'hp')::int > 0 then
      if ab = 'speed-boost' and not u = any (swapped) and coalesce((m -> 'stg' ->> 'spe')::int, 0) < 6 then
        select * into m, lg from public._bt_pop(m, lg, u);
        select * into m, lg from public._bt_stages(m, lg, '{"spe": 1}', nm || '의 ', u);
        st := public._bt_setm(st, u, m);
      elsif ab = 'shed-skin' and (m ->> 'st') is not null and public._bt_rnd(st) * 100 < 30 then
        select * into m, lg from public._bt_pop(m, lg, u);
        m := m || '{"st": null, "slp": 0, "frz": 0}'; st := public._bt_setm(st, u, m);
        lg := lg || jsonb_build_object('m', public._bt_j(nm, '은', '는') || ' 건강해졌다!', 'st', jsonb_build_array(u, null));
      end if;
    end if;
  end loop;
  -- 4-4) 필드 남은 턴, 벽 줄이기
  if st -> 'ter' ->> 'n' is not null then
    n := (st -> 'ter' ->> 'n')::int - 1;
    if n <= 0 then
      w := st -> 'ter' ->> 'k'; b := st -> 'base' -> 'ter';
      if jsonb_typeof(b) = 'object' and b ->> 'k' = w then
        st := st || jsonb_build_object('ter', b);
      else
        lg := lg || jsonb_build_object('m', public._bt_envmsg(w, 'end'), 'ter', null);
        st := st || jsonb_build_object('ter', case when jsonb_typeof(b) = 'object' then b end);
        if jsonb_typeof(b) = 'object' then lg := lg || jsonb_build_object('m', public._bt_envmsg(b ->> 'k', 'start'), 'ter', b ->> 'k'); end if;
      end if;
    else
      st := jsonb_set(st, '{ter,n}', to_jsonb(n));
    end if;
  end if;
  for s in 0 .. 1 loop
    foreach key in array array['reflect', 'light'] loop
      n := (st -> 'sides' -> s ->> key)::int;
      if n > 0 then
        st := jsonb_set(st, array['sides', s::text, key], to_jsonb(n - 1));
        if n = 1 then lg := lg || jsonb_build_object('m', '@' || s || case when key = 'reflect' then '리플렉터' else '빛의장막' end || '의 효과가 사라졌다!'); end if;
      end if;
    end loop;
  end loop;
end $$;

-- ── 7. AI (0032 _bt_ai + 특성 · 날씨 · 날씨 기술 · 변신) ───────────────────────────────────────────────────
create or replace function public._bt_ai(st jsonb, u int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s int := u / 2; o int := 1 - u / 2;
  a jsonb := public._bt_m(st, u); d jsonb;
  mv public.moves; e jsonb; i int; k int; sc numeric; best numeric := -1; pick int := 1; tgt int := 0; est numeric; ratio numeric;
  hp numeric := (a ->> 'hp')::numeric / (a ->> 'max')::numeric; key text; first_k int; dab text; mt numeric;
begin
  first_k := case when public._bt_live(st, o * 2) then 0 else 1 end;
  for i in 1 .. jsonb_array_length(a -> 'moves') loop
    continue when (a -> 'moves' -> (i - 1) ->> 'pp')::int <= 0;
    select * into mv from public.moves where id = (a -> 'moves' -> (i - 1) ->> 'id')::int;
    continue when not found;
    e := mv.effect;
    for k in 0 .. 1 loop
      continue when not public._bt_live(st, o * 2 + k);
      continue when not (mv.kind = 'attack' or e ? 'foe_status' or e ? 'foe' or e ? 'transform') and k <> first_k;
      d := public._bt_m(st, o * 2 + k);
      dab := case when a ->> 'ab' in ('mold-breaker', 'turboblaze', 'teravolt') then null else d ->> 'ab' end;
      sc := 0;
      if mv.kind = 'attack' then
        mt := public._bt_tm(mv.type, d ->> 'type');
        ratio := case when mv.category = 'physical' then public._bt_eff(a, 'atk') / greatest(1, public._bt_eff(d, 'def'))
                      else public._bt_eff(a, 'spa') / greatest(1, public._bt_eff(d, 'spd')) end;
        est := ((2 * coalesce((a ->> 'lv')::int, 50) / 5 + 2) * mv.power * ratio / 50 + 2) * mt
               * case when mv.type = any (string_to_array(a ->> 'type', '/')) then case when a ->> 'ab' = 'adaptability' then 2 else 1.5 end else 1 end
               * coalesce(mv.accuracy, 100) / 100.0 * 0.925
               * case when mv.category = 'physical' and a ->> 'st' = 'brn' and coalesce(a ->> 'ab', '') <> 'guts' then 0.5 else 1 end
               * case when e ? 'hits' then case when (e ->> 'hits')::int in (2, 3) then (e ->> 'hits')::int else 3.1 end else 1 end
               * public._bt_pw(st, a, d, dab, mv.type, mv.category, mv.name, mv.power, e)
               * case when mv.accuracy is null then 1 else public._bt_sm(-coalesce((d -> 'stg' ->> 'eva')::int, 0), true) end
               * case when public._bt_absorb(dab, mv.type, mv.kind, mt) is not null then 0 else 1 end;
        sc := est / greatest(1, (d ->> 'hp')::int) * 100;
        if est >= (d ->> 'hp')::int then sc := sc + 100 + mv.priority * 40; end if;
        if e ? 'recoil' or e ? 'self_damage' then sc := sc * 0.85; end if;
        if e ? 'recharge' and est < (d ->> 'hp')::int then sc := sc * 0.6; end if;
      elsif e ? 'transform' then
        sc := case when coalesce((a ->> 'tf')::boolean, false) or coalesce((d ->> 'tf')::boolean, false) then 0 else 70 end;
      elsif e ? 'weather' then
        sc := case when coalesce(st -> 'wx' ->> 'k', '') = e ->> 'weather' then 0
                   when (e ->> 'weather' = 'sun' and public._bt_hastype(a, '불꽃')) or (e ->> 'weather' = 'rain' and public._bt_hastype(a, '물'))
                     or (e ->> 'weather' = 'sand' and (public._bt_hastype(a, '바위') or public._bt_hastype(a, '땅') or public._bt_hastype(a, '강철')))
                     or (e ->> 'weather' = 'hail' and public._bt_hastype(a, '얼음')) then 30 else 6 end;
      elsif e ? 'foe_status' then
        sc := case when public._bt_absorb(dab, mv.type, mv.kind, null) is not null then 0
                   when e ->> 'foe_status' = 'cnf' then case when coalesce((d ->> 'cnf')::int, 0) = 0 then 35 else 0 end
                   when d ->> 'st' is null then case when e ->> 'foe_status' in ('slp', 'frz') then 55 else 45 end else 0 end
              * coalesce(mv.accuracy, 100) / 100.0;
      elsif e ? 'heal' or e ? 'rest' then
        sc := case when hp < (case when e ? 'rest' then 0.3 else 0.4 end) and mv.pp - (a -> 'moves' -> (i - 1) ->> 'pp')::int < 2 then 60 else 0 end;
      elsif e ? 'protect' or e ? 'endure' then sc := case when (a ->> 'prot')::int > 0 then 0 else 10 end;
      elsif e ? 'screen' then sc := case when (st -> 'sides' -> s ->> (e ->> 'screen'))::int > 0 then 0 else 20 end;
      elsif e ? 'self' then
        sc := case when hp > 0.6 then 25 else 3 end;
        for key in select jsonb_object_keys(e -> 'self') loop
          if coalesce((a -> 'stg' ->> key)::int, 0) >= 1 then sc := 3; end if;
        end loop;
      elsif e ? 'foe' then
        sc := case when dab in ('clear-body', 'white-smoke', 'full-metal-body') then 0 else 20 end;
        for key in select jsonb_object_keys(e -> 'foe') loop
          if coalesce((d -> 'stg' ->> key)::int, 0) <= -1 then sc := 2; end if;
        end loop;
      end if;
      sc := sc * (0.75 + random() * 0.5);
      if sc > best then best := sc; pick := i; tgt := k; end if;
    end loop;
  end loop;
  return jsonb_build_object('move', pick, 'target', tgt);
end $$;

-- ── 8. 폰에 보내는 배틀 (0020 _bt_json + 날씨 · 필드 · 변신 그림 · 나타난 특성) ────────────────────────────
create or replace function public._bt_json(b public.battles, uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me int := case when uid = b.p1 then 0 else 1 end; sides jsonb := '[]'; s int; sd jsonb;
begin
  if b.status in ('active', 'over') then
    for s in 0 .. 1 loop
      sd := b.state -> 'sides' -> s;
      if s = me then
        sides := sides || jsonb_build_array((sd - 'uid') || jsonb_build_object('active', sd -> 'act' -> 0));
      else
        sides := sides || jsonb_build_array(jsonb_build_object(
          'act', sd -> 'act', 'active', sd -> 'act' -> 0, 'reflect', sd -> 'reflect', 'light', sd -> 'light',
          'mons', (select jsonb_agg(case when (sd -> 'act') @> to_jsonb((o - 1)::int)
                                         then jsonb_strip_nulls(jsonb_build_object('sp', x -> 'sp', 'name', x ->> 'name', 'type', x ->> 'type', 'lv', x -> 'lv', 'hp', x -> 'hp',
                                                                 'max', x -> 'max', 'st', x -> 'st', 'cnf', x -> 'cnf', 'stg', x -> 'stg', 'syn', x -> 'syn',
                                                                 'synname', x -> 'synname', 'tf', x -> 'tf', 'tsp', x -> 'tsp',
                                                                 'ab', case when coalesce((x ->> 'abr')::boolean, false) then x -> 'ab' end))
                                              || jsonb_build_object('seen', true)
                                         else jsonb_build_object('hp', x -> 'hp', 'max', x -> 'max') end order by o)
                   from jsonb_array_elements(sd -> 'mons') with ordinality y(x, o))));
      end if;
    end loop;
  end if;
  return jsonb_build_object(
    'id', b.id, 'mode', b.mode, 'format', b.format, 'status', b.status, 'phase', b.phase, 'turn', coalesce((b.state ->> 'turn')::int, 0),
    'seq', b.seq, 'me', me, 'log', b.log, 'sides', sides, 'winner', b.winner, 'reward', b.reward,
    'field', b.state -> 'field', 'wx', public._bt_wxk(b.state), 'ter', b.state -> 'ter' ->> 'k',
    'fair', coalesce((b.state ->> 'fair')::boolean, false),
    'items_left', case when coalesce((b.state ->> 'fair')::boolean, false) then 0
                       else greatest(0, coalesce((public._setting('battle_item_max'))::int, 2) - coalesce((b.state -> 'sides' -> me ->> 'items')::int, 0)) end,
    'turn_cap', coalesce((public._setting('battle_turn_cap'))::int, 20),
    'need', b.phase = 'replace' and (coalesce(b.state -> 'need', '[]') @> to_jsonb(me * 2) or coalesce(b.state -> 'need', '[]') @> to_jsonb(me * 2 + 1)),
    'need_slots', coalesce((select jsonb_agg((x)::int - me * 2) from jsonb_array_elements_text(b.state -> 'need') x where (x)::int / 2 = me), '[]'),
    'chosen', b.acts ? me::text, 'deadline', b.deadline, 'server_time', now(),
    'names', jsonb_build_array(
      (select public._display_name(p) from public.profiles p where p.user_id = b.p1),
      case when b.mode = 'cpu' then '연습 상대' else (select public._display_name(p) from public.profiles p where p.user_id = b.p2) end));
end $$;

-- ── 9. 내 포켓몬의 특성 · 시험용 배틀 ─────────────────────────────────────────────────────────────────────
create or replace function public.my_abilities() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(c.id::text, c.ability), '{}')
    from public.collection c where c.user_id = auth.uid() and c.released_at is null and c.ability is not null
$$;

-- 운영자 시험 (rpc_test [46]): p = {sides: [[{sp, lv, ab, moves: [id…], hp, st, held, stg}…], […]], fmt, env, wx, ter,
--   sim: {r: 0~1 고정 난수, crit: true|false, roll: 85~100, nopar}, seed, turns: [{"0": [{move, target}|{switch}], "1": […]}, …]}
--   → {intro, logs: [턴마다 기록], st}. DB 에는 아무것도 남지 않음.
create or replace function public.admin_bt_sim(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare st jsonb; lg jsonb; intro jsonb; logs jsonb := '[]'; s int; x jsonb; mons jsonb; mm jsonb; sd jsonb; k int; t jsonb; fmt text := coalesce(p ->> 'fmt', 'single');
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p ? 'seed' then perform setseed((p ->> 'seed')::double precision); end if;
  st := jsonb_build_object('turn', 0, 'fmt', fmt, 'fair', false, 'sim', coalesce(p -> 'sim', '{}'),
                           'field', case when p ? 'env' then jsonb_build_object('name', '시험', 'env', p ->> 'env', 'mult', 1.3) end, 'sides', '[]'::jsonb);
  for s in 0 .. 1 loop
    mons := '[]';
    for x in select v from jsonb_array_elements(p -> 'sides' -> s) v loop
      mm := public._bt_mon((x ->> 'sp')::int, coalesce((x ->> 'lv')::int, 50),
                           case when x ? 'moves' then array(select (z)::int from jsonb_array_elements_text(x -> 'moves') z) end,
                           x ->> 'held', coalesce(x ->> 'ab', '-none-'));
      if x ->> 'ab' is null then mm := mm - 'ab'; end if;
      if x ? 'hp' then mm := mm || jsonb_build_object('hp', least((mm ->> 'max')::int, (x ->> 'hp')::int)); end if;
      if x ? 'hpfrac' then mm := mm || jsonb_build_object('hp', greatest(1, floor((mm ->> 'max')::int * (x ->> 'hpfrac')::numeric)::int)); end if;
      if x ? 'st' then mm := mm || jsonb_build_object('st', x ->> 'st', 'slp', case when x ->> 'st' = 'slp' then 3 else 0 end); end if;
      if x ? 'stg' then mm := mm || jsonb_build_object('stg', x -> 'stg'); end if;
      mons := mons || jsonb_build_array(mm || '{"mon": null}');
    end loop;
    sd := jsonb_build_object('reflect', 0, 'light', 0, 'items', 0, 'uid', null,
            'act', (select jsonb_agg(g) from generate_series(0, least(case when fmt = 'double' then 2 else 1 end, jsonb_array_length(mons)) - 1) g), 'mons', mons);
    for k in 0 .. jsonb_array_length(sd -> 'act') - 1 loop
      sd := jsonb_set(sd, array['mons', k::text], public._bt_enter(sd -> 'mons' -> k));
    end loop;
    st := jsonb_set(st, '{sides}', (st -> 'sides') || jsonb_build_array(sd));
  end loop;
  if coalesce((p ->> 'no_entry')::boolean, false) then
    st := st || '{"init": true}'; intro := '[]';
  else
    select * into st, intro from public._bt_init(st);
  end if;
  if p ? 'wx' then st := st || jsonb_build_object('wx', jsonb_build_object('k', p ->> 'wx', 'n', p -> 'wx_n')); end if;
  if p ? 'ter' then st := st || jsonb_build_object('ter', jsonb_build_object('k', p ->> 'ter', 'n', p -> 'ter_n')); end if;
  for t in select v from jsonb_array_elements(coalesce(p -> 'turns', '[]')) v loop
    exit when public._bt_alive(st, 0) = 0 or public._bt_alive(st, 1) = 0;
    select * into st, lg from public._bt_turn(st, t);
    logs := logs || jsonb_build_array(lg);
  end loop;
  return jsonb_build_object('intro', intro, 'logs', logs, 'st', st);
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
  public.safari_state(), public.safari_encounter(int, text), public.safari_result(bigint, int, boolean, text, boolean), public.safari_turn(bigint),
  -- 0038
  public.safari_throws(bigint, int), public.notice_seen(bigint[]), public.gift_claim(text),
  public.legend_encounter(int), public.legend_result(bigint, boolean, text, boolean),
  public.admin_create_gift(text, text, int, text, int, timestamptz, timestamptz, int), public.admin_list_gifts(), public.admin_set_gift(bigint, boolean),
  public.admin_delete_gift(bigint), public.admin_encounter_age(bigint, int),
  public.admin_roam_spots(timestamptz),
  public.my_abilities(), public.admin_bt_sim(jsonb)
to authenticated;
notify pgrst, 'reload schema';
