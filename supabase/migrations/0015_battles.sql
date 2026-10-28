-- 0015: 배틀 (3 대 3 싱글, 교체 가능). 계산은 전부 이 함수들 안에서 한다 (폰은 고른 기술만 보냄).
--
--  종류 (battles.mode):
--    cpu  = 연습 배틀. 상대 = 아무 선생님 몬스터 3마리 (내 팀과 같은 단계). 보상 없음.
--    team = 친구 팀 vs AI. 친구의 배틀 QR (BTL.<battle_code>) 을 찍으면 친구 팀(배틀 팀, 없으면 가장 강한 3마리)을 AI가 조종.
--    pvp  = 실시간 대전. 친구 배틀 QR 로 신청 → 친구 앱 홈에 "배틀 신청!" → 수락하면 시작. 한 턴 45초, 안 고르면 AI가 대신.
--  보상: 이기면 진화권 1장 + battle_wins +1 (랭킹). 하루(한국 시간) 3번까지, 같은 상대는 하루 1번만 인정 (battle_rewards).
--  계산: 레벨 50, 3세대 데미지 공식 (⌊⌊⌊2×50/5+2⌋×위력×A/D⌋/50⌋ → 화상 ½ → 벽 ½ → +2 → 급소 ×2 → 난수 85~100% → 자속 1.5 → 상성),
--    급소 1/16 (high_crit 1/8, always_crit), 명중 × 명중 랭크, 선공(priority) → 스피드(마비 ¼) 순, 능력 랭크 ±6,
--    마비(25% 못 움직임)·화상(⅛, 물리 ½)·독(⅛)·잠듦(1~3턴), 방어·버티기(연속 사용 시 성공률 ½씩), 벽 5턴, 회복·흡수·반동, PP (다 쓰면 발버둥).
--  상태 (battles.state jsonb): {turn, sides: [{active, mons: [mon...], reflect, light}, ...], need: [교체해야 하는 쪽]}
--    mon = {sp, line, name, type, hp, max, atk, def, spa, spd, spe, moves: [{id, pp}], st, slp, stg: {atk..acc}, prot}
--  기록 (battles.log): 마지막 턴의 일들 [{m: 글, hp: [쪽, 남은 HP], sw: [쪽, 몇 번째], faint: 쪽}]. 글 속 '@0'/'@1' = 그쪽 몬스터 앞에
--    붙는 말 (내 쪽이면 '', 상대 쪽이면 '상대 ') — 폰이 바꿔 끼운다.

insert into public.settings (key, value) values
  ('battle_daily_max', '3'),          -- 하루에 보상 받는 승리 수
  ('battle_turn_sec', '45'),          -- 실시간 대전: 한 턴 제한 시간 (지나면 AI가 대신 고름)
  ('battle_invite_sec', '60')         -- 실시간 대전 신청: 이 시간 안에 수락해야 함
on conflict (key) do nothing;

alter table public.profiles add column if not exists battle_code text unique;
alter table public.profiles add column if not exists battle_team int[];

create table if not exists public.battles (
  id         bigint generated always as identity primary key,
  mode       text not null check (mode in ('cpu', 'team', 'pvp')),
  status     text not null default 'active' check (status in ('invite', 'active', 'over', 'declined', 'cancelled')),
  p1         uuid not null references public.profiles on delete cascade,
  p2         uuid references public.profiles on delete cascade,   -- team: 팀을 빌려준 친구, pvp: 상대, cpu: null
  phase      text not null default 'choose' check (phase in ('choose', 'replace')),
  state      jsonb not null default '{}',
  acts       jsonb not null default '{}',                          -- 이번 턴에 고른 것 {"0": {...}, "1": {...}} (상대에게 안 보임)
  log        jsonb not null default '[]',
  seq        int not null default 0,                               -- 턴이 풀릴 때마다 +1 (폰이 새 기록을 알아챔)
  deadline   timestamptz,
  winner     smallint check (winner in (0, 1)),
  reward     jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists battles_p1 on public.battles (p1, status);
create index if not exists battles_p2 on public.battles (p2, status);
alter table public.battles enable row level security;                -- no policies: functions only

create table if not exists public.battle_rewards (
  user_id   uuid not null references public.profiles on delete cascade,
  opp       uuid not null references public.profiles on delete cascade,
  day       date not null,
  battle_id bigint references public.battles on delete set null,
  at        timestamptz not null default now(),
  primary key (user_id, opp, day)
);
alter table public.battle_rewards enable row level security;

-- ───────── 작은 도우미 ─────────

-- 받침에 따라 조사 (은/는, 이/가, 을/를)
create or replace function public._bt_j(w text, a text, b text) returns text
language sql immutable set search_path = '' as $$
  select w || case
    when w ~ '[가-힣]$' then case when (ascii(right(w, 1)) - 44032) % 28 <> 0 then a else b end
    when w ~ '[013678LMNRlmnr]$' then a else b end
$$;

create or replace function public._bt_stat(b int, is_hp boolean) returns int
language sql immutable set search_path = '' as $$
  select (2 * coalesce(b, 50) + 31) / 2 + case when is_hp then 60 else 5 end
$$;

-- 능력 랭크 배수: +1 = ×1.5, -1 = ×⅔ … (명중은 3 기준)
create or replace function public._bt_sm(k int, is_acc boolean default false) returns numeric
language sql immutable set search_path = '' as $$
  select case when is_acc then case when k >= 0 then (3 + k) / 3.0 else 3.0 / (3 - k) end
              else case when k >= 0 then (2 + k) / 2.0 else 2.0 / (2 - k) end end
$$;

create or replace function public._bt_eff(m jsonb, k text) returns numeric
language sql immutable set search_path = '' as $$
  select (m ->> k)::int * public._bt_sm(coalesce((m -> 'stg' ->> k)::int, 0))
         * case when k = 'spe' and m ->> 'st' = 'par' then 0.25 else 1 end
$$;

create or replace function public._bt_tm(a text, d text) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select mult from public.type_chart where atk = a and def = d), 1)
$$;

create or replace function public._bt_mon(p_sp int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sp', s.id, 'line', s.line_id, 'name', s.name,
    'type', coalesce(l.btype, case when l.subject = '비밀' then '전설' else l.subject end),
    'hp', public._bt_stat(s.hp, true), 'max', public._bt_stat(s.hp, true),
    'atk', public._bt_stat(s.atk, false), 'def', public._bt_stat(s.def, false), 'spa', public._bt_stat(s.spa, false),
    'spd', public._bt_stat(s.spd, false), 'spe', public._bt_stat(s.spe, false),
    'moves', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'pp', m.pp) order by sm.slot)
                       from public.species_moves sm join public.moves m on m.id = sm.move_id where sm.species_id = s.id), '[]'),
    'st', null, 'slp', 0, 'stg', '{}'::jsonb, 'prot', 0)
  from public.species s join public.lines l on l.id = s.line_id where s.id = p_sp
$$;

create or replace function public._bt_side(p_species int[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('active', 0, 'reflect', 0, 'light', 0,
           'mons', (select jsonb_agg(public._bt_mon(x) order by o) from unnest(p_species) with ordinality as u(x, o)))
$$;

-- 내 몬스터 계열 번호 1~3개 → 지금 단계의 종 번호 (내 도감에 있어야 함, 겹치면 안 됨)
create or replace function public._bt_team(uid uuid, p_lines int[]) returns int[]
language plpgsql stable security definer set search_path = '' as $$
declare r int[];
begin
  if p_lines is null or cardinality(p_lines) not between 1 and 3
     or (select count(distinct x) from unnest(p_lines) x) <> cardinality(p_lines) then raise exception 'BAD_TEAM'; end if;
  select array_agg(s.id order by u.o) into r
    from unnest(p_lines) with ordinality as u(x, o)
    join public.collection c on c.user_id = uid and c.line_id = u.x
    join public.species s on s.line_id = c.line_id and s.stage = c.stage;
  if coalesce(cardinality(r), 0) <> cardinality(p_lines) then raise exception 'BAD_TEAM'; end if;
  return r;
end $$;

-- 친구 팀: 저장한 배틀 팀 (아직 다 가지고 있으면), 없으면 가장 높은 단계 3마리
create or replace function public._bt_friend_team(uid uuid) returns int[]
language plpgsql stable security definer set search_path = '' as $$
declare t int[]; r int[];
begin
  select battle_team into t from public.profiles where user_id = uid;
  if t is not null then
    begin r := public._bt_team(uid, t); return r; exception when others then null; end;
  end if;
  select array_agg(sid) into r from (
    select s.id sid from public.collection c join public.species s on s.line_id = c.line_id and s.stage = c.stage
     where c.user_id = uid order by c.stage desc, c.catch_count desc, c.line_id limit 3) x;
  return r;
end $$;

create or replace function public._bt_act(st jsonb, s int) returns jsonb
language sql immutable set search_path = '' as $$
  select st -> 'sides' -> s -> 'mons' -> ((st -> 'sides' -> s ->> 'active')::int)
$$;
create or replace function public._bt_put(st jsonb, s int, m jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_set(st, array['sides', s::text, 'mons', st -> 'sides' -> s ->> 'active'], m)
$$;
create or replace function public._bt_alive(st jsonb, s int) returns int
language sql immutable set search_path = '' as $$
  select count(*)::int from jsonb_array_elements(st -> 'sides' -> s -> 'mons') m where (m ->> 'hp')::int > 0
$$;

-- 능력 랭크 바꾸기 (+ 기록)
create or replace function public._bt_stages(inout m jsonb, inout lg jsonb, ch jsonb, who text)
language plpgsql immutable set search_path = '' as $$
declare k text; v int; cur int; nw int;
  nm jsonb := '{"atk": "공격", "def": "방어", "spa": "특수공격", "spd": "특수방어", "spe": "스피드", "acc": "명중률"}';
begin
  for k, v in select key, value::int from jsonb_each_text(ch) loop
    if (m ->> 'hp')::int <= 0 then return; end if;
    cur := coalesce((m -> 'stg' ->> k)::int, 0);
    nw := greatest(-6, least(6, cur + v));
    if nw = cur then
      lg := lg || jsonb_build_object('m', who || public._bt_j(nm ->> k, '은', '는') || case when v > 0 then ' 더 이상 올라가지 않는다!' else ' 더 이상 떨어지지 않는다!' end);
    else
      m := jsonb_set(m, array['stg', k], to_jsonb(nw));
      lg := lg || jsonb_build_object('m', who || public._bt_j(nm ->> k, '이', '가') || case
        when v >= 2 then ' 크게 올라갔다!' when v > 0 then ' 올라갔다!' when v <= -2 then ' 크게 떨어졌다!' else ' 떨어졌다!' end);
    end if;
  end loop;
end $$;

-- 상태 이상 걸기 (이미 있으면 false)
create or replace function public._bt_status(inout m jsonb, inout lg jsonb, inout ok boolean, stt text, who text)
language plpgsql volatile set search_path = '' as $$
begin
  ok := false;
  if (m ->> 'hp')::int <= 0 or (m ->> 'st') is not null then return; end if;
  m := m || jsonb_build_object('st', stt, 'slp', case when stt = 'slp' then 2 + floor(random() * 3)::int else 0 end);
  lg := lg || jsonb_build_object('m', public._bt_j(who, '은', '는') || case stt
    when 'par' then ' 마비되어 기술이 나오기 어려워졌다!' when 'brn' then ' 화상을 입었다!'
    when 'psn' then ' 독에 걸렸다!' else ' 잠들어 버렸다!' end, 'st', m ->> 'st');
  ok := true;
end $$;

-- ───────── 기술 하나 쓰기 ─────────
-- fl = 이번 턴 방어/버티기 중인 쪽 {"prot": {"0": true}, "end": {"1": true}}
create or replace function public._bt_move(inout st jsonb, inout lg jsonb, inout fl jsonb, s int, slot int)
language plpgsql volatile security definer set search_path = '' as $$
declare
  o int := 1 - s; a jsonb; d jsonb; mv public.moves; e jsonb;
  an text; dn text; aw text; dw text;
  i int; pp int; mult numeric; crit boolean; ak text; dk text; at numeric; df numeric;
  dmg numeric; hp0 int; dh0 int; tmp int; chance int; ok boolean; sd jsonb; hits boolean;
begin
  a := public._bt_act(st, s); d := public._bt_act(st, o); dh0 := (d ->> 'hp')::int;
  if (a ->> 'hp')::int <= 0 then return; end if;
  an := '@' || s || (a ->> 'name'); dn := '@' || o || (d ->> 'name');
  aw := public._bt_j(an, '은', '는'); dw := public._bt_j(dn, '은', '는');

  -- 잠듦 / 마비
  if a ->> 'st' = 'slp' then
    if (a ->> 'slp')::int > 1 then
      a := jsonb_set(a, '{slp}', to_jsonb((a ->> 'slp')::int - 1));
      lg := lg || jsonb_build_object('m', aw || ' 쿨쿨 잠들어 있다.');
      st := public._bt_put(st, s, a); return;
    end if;
    a := a || '{"st": null, "slp": 0}';
    lg := lg || jsonb_build_object('m', aw || ' 눈을 떴다!', 'st', null, 'who', s);
  end if;
  if a ->> 'st' = 'par' and random() < 0.25 then
    lg := lg || jsonb_build_object('m', aw || ' 몸이 저려서 움직일 수 없다!');
    a := jsonb_set(a, '{prot}', '0'); st := public._bt_put(st, s, a); return;
  end if;

  -- 기술 고르기 (PP 0 이면 다른 기술, 전부 0 이면 발버둥)
  i := greatest(1, least(coalesce(slot, 1), jsonb_array_length(a -> 'moves')));
  if coalesce((a -> 'moves' -> (i - 1) ->> 'pp')::int, 0) <= 0 then
    select o2 into i from jsonb_array_elements(a -> 'moves') with ordinality x(v, o2) where (v ->> 'pp')::int > 0 order by o2 limit 1;
  end if;
  if i is null then
    mv.name := '발버둥'; mv.type := '보통'; mv.category := 'physical'; mv.kind := 'attack'; mv.power := 50;
    mv.accuracy := null; mv.priority := 0; mv.effect := '{"recoil": 4}';
    lg := lg || jsonb_build_object('m', aw || ' 쓸 수 있는 기술이 없다!');
  else
    select * into mv from public.moves where id = (a -> 'moves' -> (i - 1) ->> 'id')::int;
    pp := (a -> 'moves' -> (i - 1) ->> 'pp')::int;
    a := jsonb_set(a, array['moves', (i - 1)::text, 'pp'], to_jsonb(pp - 1));
  end if;
  e := coalesce(mv.effect, '{}');
  lg := lg || jsonb_build_object('m', an || '의 ' || mv.name || '!', 'use', jsonb_build_array(s, mv.type, mv.category));

  -- 방어 / 버티기
  if e ? 'protect' or e ? 'endure' then
    if random() < power(0.5, coalesce((a ->> 'prot')::int, 0)) then
      a := jsonb_set(a, '{prot}', to_jsonb(coalesce((a ->> 'prot')::int, 0) + 1));
      fl := jsonb_set(fl, array[case when e ? 'protect' then 'prot' else 'end' end, s::text], 'true');
      lg := lg || jsonb_build_object('m', aw || case when e ? 'protect' then ' 방어 태세에 들어갔다!' else ' 버티기 태세에 들어갔다!' end);
    else
      a := jsonb_set(a, '{prot}', '0');
      lg := lg || jsonb_build_object('m', '그러나 실패했다!');
    end if;
    st := public._bt_put(st, s, a); return;
  end if;
  a := jsonb_set(a, '{prot}', '0');

  -- 상대를 노리는 기술: 상대가 있어야 하고, 방어 중이면 막힘, 명중 판정
  hits := mv.kind = 'attack' or e ? 'foe_status' or e ? 'foe';
  if hits then
    if (d ->> 'hp')::int <= 0 then
      lg := lg || jsonb_build_object('m', '그러나 상대가 없다!'); st := public._bt_put(st, s, a); return;
    end if;
    if fl -> 'prot' ? o::text then
      lg := lg || jsonb_build_object('m', dw || ' 공격으로부터 몸을 지켰다!'); st := public._bt_put(st, s, a); return;
    end if;
    if mv.accuracy is not null
       and random() * 100 >= mv.accuracy * public._bt_sm(coalesce((a -> 'stg' ->> 'acc')::int, 0), true) then
      lg := lg || jsonb_build_object('m', case when mv.kind = 'attack' then '그러나 ' || an || '의 공격은 빗나갔다!' else '그러나 빗나갔다!' end);
      st := public._bt_put(st, s, a); return;
    end if;
  end if;

  if mv.kind = 'attack' then
    sd := st -> 'sides' -> o;
    if e ? 'break_screen' and ((sd ->> 'reflect')::int > 0 or (sd ->> 'light')::int > 0) then
      st := jsonb_set(jsonb_set(st, array['sides', o::text, 'reflect'], '0'), array['sides', o::text, 'light'], '0');
      sd := st -> 'sides' -> o;
      lg := lg || jsonb_build_object('m', '@' || o || '벽이 깨졌다!');
    end if;
    mult := public._bt_tm(mv.type, d ->> 'type');
    if mult = 0 then
      lg := lg || jsonb_build_object('m', dn || '에게는 효과가 없는 것 같다...'); st := public._bt_put(st, s, a); return;
    end if;
    crit := coalesce((e ->> 'always_crit')::boolean, false)
            or random() < case when coalesce((e ->> 'high_crit')::boolean, false) then 0.125 else 0.0625 end;
    if mv.category = 'physical' then ak := 'atk'; dk := 'def'; else ak := 'spa'; dk := 'spd'; end if;
    tmp := coalesce((a -> 'stg' ->> ak)::int, 0);
    at := (a ->> ak)::int * public._bt_sm(case when crit then greatest(0, tmp) else tmp end);
    tmp := coalesce((d -> 'stg' ->> dk)::int, 0);
    df := (d ->> dk)::int * public._bt_sm(case when crit then least(0, tmp) else tmp end);
    dmg := floor(floor(floor(2 * 50 / 5 + 2) * mv.power * floor(at) / greatest(1, floor(df))) / 50);
    if mv.category = 'physical' and a ->> 'st' = 'brn' then dmg := floor(dmg / 2); end if;
    if not crit and ((mv.category = 'physical' and (sd ->> 'reflect')::int > 0) or (mv.category = 'special' and (sd ->> 'light')::int > 0)) then
      dmg := floor(dmg / 2);
    end if;
    dmg := dmg + 2;
    if crit then dmg := dmg * 2; end if;
    dmg := floor(dmg * (85 + floor(random() * 16)) / 100);
    if mv.type = a ->> 'type' then dmg := floor(dmg * 1.5); end if;
    dmg := greatest(1, floor(dmg * mult));
    hp0 := (d ->> 'hp')::int;
    ok := false;
    if dmg >= hp0 and fl -> 'end' ? o::text then dmg := hp0 - 1; ok := true; end if;
    dmg := least(dmg, hp0);
    d := jsonb_set(d, '{hp}', to_jsonb(hp0 - dmg::int));
    lg := lg || jsonb_build_object('hp', jsonb_build_array(o, (d ->> 'hp')::int), 'dmg', dmg::int);
    if crit then lg := lg || jsonb_build_object('m', '급소에 맞았다!'); end if;
    if mult > 1 then lg := lg || jsonb_build_object('m', '효과가 굉장했다!');
    elsif mult < 1 then lg := lg || jsonb_build_object('m', '효과가 별로인 듯하다...'); end if;
    if ok then lg := lg || jsonb_build_object('m', dw || ' 공격을 버텼다!'); end if;

    if e ? 'drain' and dmg > 0 and (a ->> 'hp')::int < (a ->> 'max')::int then
      tmp := least((a ->> 'max')::int, (a ->> 'hp')::int + greatest(1, floor(dmg * (e ->> 'drain')::int / 100)::int));
      a := jsonb_set(a, '{hp}', to_jsonb(tmp));
      lg := lg || jsonb_build_object('m', dn || '의 체력을 흡수했다!', 'hp', jsonb_build_array(s, tmp));
    end if;
    if e ? 'recoil' or e ? 'self_damage' then
      tmp := case when e ? 'recoil' then greatest(1, floor(dmg / (e ->> 'recoil')::int)::int)
                  else greatest(1, (a ->> 'max')::int * (e ->> 'self_damage')::int / 100) end;
      a := jsonb_set(a, '{hp}', to_jsonb(greatest(0, (a ->> 'hp')::int - tmp)));
      lg := lg || jsonb_build_object('m', aw || ' 반동으로 데미지를 입었다!', 'hp', jsonb_build_array(s, (a ->> 'hp')::int));
    end if;
    -- 추가 효과
    chance := coalesce((e ->> 'chance')::int, 100);
    if (e ? 'foe_status' or e ? 'foe' or e ? 'self') and random() * 100 < chance then
      if e ? 'foe_status' then select * into d, lg, ok from public._bt_status(d, lg, false, e ->> 'foe_status', dn); end if;
      if e ? 'foe' then select * into d, lg from public._bt_stages(d, lg, e -> 'foe', dn || '의 '); end if;
      if e ? 'self' then select * into a, lg from public._bt_stages(a, lg, e -> 'self', an || '의 '); end if;
    end if;
    if e ? 'self_all_up' and random() * 100 < (e ->> 'self_all_up')::int then
      select * into a, lg from public._bt_stages(a, lg, '{"atk": 1, "def": 1, "spa": 1, "spd": 1, "spe": 1}', an || '의 ');
    end if;
  else
    -- 상태 기술 / 방어 기술
    ok := true;
    if e ? 'foe_status' then
      select * into d, lg, ok from public._bt_status(d, lg, false, e ->> 'foe_status', dn);
      if not ok and not (e ? 'foe') then lg := lg || jsonb_build_object('m', '그러나 실패했다!'); end if;
    end if;
    if e ? 'foe' then select * into d, lg from public._bt_stages(d, lg, e -> 'foe', dn || '의 '); end if;
    if e ? 'self' then select * into a, lg from public._bt_stages(a, lg, e -> 'self', an || '의 '); end if;
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
        lg := lg || jsonb_build_object('m', an || '의 체력이 회복되었다!', 'hp', jsonb_build_array(s, tmp));
      end if;
    end if;
    if e ? 'rest' then
      if (a ->> 'hp')::int >= (a ->> 'max')::int then
        lg := lg || jsonb_build_object('m', '그러나 실패했다!');
      else
        a := a || jsonb_build_object('hp', (a ->> 'max')::int, 'st', 'slp', 'slp', 3);
        lg := lg || jsonb_build_object('m', aw || ' 잠들어서 건강해졌다!', 'hp', jsonb_build_array(s, (a ->> 'max')::int), 'st', 'slp', 'who', s);
      end if;
    end if;
  end if;

  st := public._bt_put(public._bt_put(st, o, d), s, a);
  if (d ->> 'hp')::int <= 0 and dh0 > 0 then lg := lg || jsonb_build_object('m', dw || ' 쓰러졌다!', 'faint', o); end if;
  if (a ->> 'hp')::int <= 0 then lg := lg || jsonb_build_object('m', aw || ' 쓰러졌다!', 'faint', s); end if;
end $$;

-- 교체 (돌아온 몬스터는 랭크·방어 연속 횟수 초기화)
create or replace function public._bt_switch(inout st jsonb, inout lg jsonb, s int, idx int)
language plpgsql immutable set search_path = '' as $$
declare cur int := (st -> 'sides' -> s ->> 'active')::int; m jsonb;
begin
  if idx is null or idx < 0 or idx >= jsonb_array_length(st -> 'sides' -> s -> 'mons') or idx = cur
     or (st -> 'sides' -> s -> 'mons' -> idx ->> 'hp')::int <= 0 then return; end if;
  m := public._bt_act(st, s);
  if (m ->> 'hp')::int > 0 then lg := lg || jsonb_build_object('m', '@' || s || (m ->> 'name') || ', 돌아와!'); end if;
  st := public._bt_put(st, s, m || '{"stg": {}, "prot": 0}');
  st := jsonb_set(st, array['sides', s::text, 'active'], to_jsonb(idx));
  lg := lg || jsonb_build_object('m', '가랏! @' || s || (st -> 'sides' -> s -> 'mons' -> idx ->> 'name') || '!', 'sw', jsonb_build_array(s, idx));
end $$;

-- ───────── AI ─────────
-- 기술 고르기: 상성 × 위력 × 자속 × 명중 × 능력 비 로 예상 데미지, 쓰러뜨릴 수 있으면 크게 가산 (선공기 우대).
-- 그 밖에 상태 이상·능력 올리기·회복·벽은 상황이 맞을 때 점수. 점수에 ±25% 흔들림 → 가끔 다른 수도 둔다.
create or replace function public._bt_ai(st jsonb, s int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  a jsonb := public._bt_act(st, s); d jsonb := public._bt_act(st, 1 - s);
  mv public.moves; e jsonb; i int; sc numeric; best numeric := -1; pick int := 1; est numeric; ratio numeric;
  hp numeric := (a ->> 'hp')::numeric / (a ->> 'max')::numeric; k text;
begin
  for i in 1 .. jsonb_array_length(a -> 'moves') loop
    continue when (a -> 'moves' -> (i - 1) ->> 'pp')::int <= 0;
    select * into mv from public.moves where id = (a -> 'moves' -> (i - 1) ->> 'id')::int;
    e := mv.effect; sc := 0;
    if mv.kind = 'attack' then
      ratio := case when mv.category = 'physical' then public._bt_eff(a, 'atk') / greatest(1, public._bt_eff(d, 'def'))
                    else public._bt_eff(a, 'spa') / greatest(1, public._bt_eff(d, 'spd')) end;
      est := (22 * mv.power * ratio / 50 + 2) * public._bt_tm(mv.type, d ->> 'type')
             * case when mv.type = a ->> 'type' then 1.5 else 1 end * coalesce(mv.accuracy, 100) / 100.0 * 0.925
             * case when mv.category = 'physical' and a ->> 'st' = 'brn' then 0.5 else 1 end;
      sc := est / greatest(1, (d ->> 'hp')::int) * 100;
      if est >= (d ->> 'hp')::int then sc := sc + 100 + mv.priority * 40; end if;
      if e ? 'recoil' or e ? 'self_damage' then sc := sc * 0.85; end if;
    elsif e ? 'foe_status' then
      sc := case when d ->> 'st' is null then case when e ->> 'foe_status' = 'slp' then 60 else 45 end else 0 end
            * coalesce(mv.accuracy, 100) / 100.0;
    elsif e ? 'heal' then sc := case when hp < 0.5 then 95 when hp < 0.7 then 25 else 0 end;
    elsif e ? 'rest' then sc := case when hp < 0.35 or (a ->> 'st' is not null and hp < 0.6) then 85 else 0 end;
    elsif e ? 'protect' or e ? 'endure' then sc := case when (a ->> 'prot')::int > 0 then 0 else 12 end;
    elsif e ? 'screen' then sc := case when (st -> 'sides' -> s ->> (e ->> 'screen'))::int > 0 then 0 else 30 end;
    elsif e ? 'self' then
      sc := case when hp > 0.6 then 40 else 4 end;
      for k in select jsonb_object_keys(e -> 'self') loop
        if coalesce((a -> 'stg' ->> k)::int, 0) >= 2 then sc := 3; end if;
      end loop;
    elsif e ? 'foe' then
      sc := 25;
      for k in select jsonb_object_keys(e -> 'foe') loop
        if coalesce((d -> 'stg' ->> k)::int, 0) <= -2 then sc := 2; end if;
      end loop;
    end if;
    sc := sc * (0.75 + random() * 0.5);
    if sc > best then best := sc; pick := i; end if;
  end loop;
  return jsonb_build_object('move', pick);
end $$;

-- 쓰러진 뒤 다음 몬스터: 내 타입이 상대에게 강하고, 상대 타입에 약하지 않은 쪽
create or replace function public._bt_ai_next(st jsonb, s int) returns int
language sql stable security definer set search_path = '' as $$
  select (o - 1)::int from jsonb_array_elements(st -> 'sides' -> s -> 'mons') with ordinality x(m, o)
   where (m ->> 'hp')::int > 0
   order by public._bt_tm(m ->> 'type', public._bt_act(st, 1 - s) ->> 'type')
            - public._bt_tm(public._bt_act(st, 1 - s) ->> 'type', m ->> 'type') desc,
            (m ->> 'hp')::int desc
   limit 1
$$;

-- ───────── 한 턴 ─────────
create or replace function public._bt_turn(inout st jsonb, acts jsonb, out lg jsonb)
language plpgsql volatile security definer set search_path = '' as $$
declare
  fl jsonb := '{"prot": {}, "end": {}}'; s int; ord int[] := '{}'; pr int[] := array[0, 0]; sp numeric[] := array[0, 0];
  m jsonb; mid int; dmg int; k text; n int;
begin
  lg := '[]';
  st := jsonb_set(st, '{turn}', to_jsonb(coalesce((st ->> 'turn')::int, 0) + 1));
  -- 1) 교체가 먼저
  for s in 0 .. 1 loop
    if acts -> s::text ? 'switch' then
      select * into st, lg from public._bt_switch(st, lg, s, (acts -> s::text ->> 'switch')::int);
    end if;
  end loop;
  -- 2) 기술 순서: 선공 → 스피드 → 동전 던지기
  for s in 0 .. 1 loop
    if acts -> s::text ? 'move' then
      m := public._bt_act(st, s);
      mid := (m -> 'moves' -> ((acts -> s::text ->> 'move')::int - 1) ->> 'id')::int;
      pr[s + 1] := coalesce((select priority from public.moves where id = mid), 0);
      sp[s + 1] := public._bt_eff(m, 'spe');
    end if;
  end loop;
  if acts -> '0' ? 'move' and acts -> '1' ? 'move' then
    ord := case when pr[1] > pr[2] or (pr[1] = pr[2] and (sp[1] > sp[2] or (sp[1] = sp[2] and random() < 0.5))) then array[0, 1] else array[1, 0] end;
  elsif acts -> '0' ? 'move' then ord := array[0];
  elsif acts -> '1' ? 'move' then ord := array[1];
  end if;
  foreach s in array ord loop
    select * into st, lg, fl from public._bt_move(st, lg, fl, s, (acts -> s::text ->> 'move')::int);
  end loop;
  -- 3) 턴 끝: 화상·독, 벽 줄이기
  for s in 0 .. 1 loop
    m := public._bt_act(st, s);
    if (m ->> 'hp')::int > 0 and m ->> 'st' in ('brn', 'psn') then
      dmg := greatest(1, (m ->> 'max')::int / 8);
      m := jsonb_set(m, '{hp}', to_jsonb(greatest(0, (m ->> 'hp')::int - dmg)));
      st := public._bt_put(st, s, m);
      lg := lg || jsonb_build_object('m', public._bt_j('@' || s || (m ->> 'name'), '은', '는')
                 || case when m ->> 'st' = 'brn' then ' 화상 데미지를 입었다!' else ' 독 데미지를 입었다!' end,
                 'hp', jsonb_build_array(s, (m ->> 'hp')::int));
      if (m ->> 'hp')::int <= 0 then
        lg := lg || jsonb_build_object('m', public._bt_j('@' || s || (m ->> 'name'), '은', '는') || ' 쓰러졌다!', 'faint', s);
      end if;
    end if;
    foreach k in array array['reflect', 'light'] loop
      n := (st -> 'sides' -> s ->> k)::int;
      if n > 0 then
        st := jsonb_set(st, array['sides', s::text, k], to_jsonb(n - 1));
        if n = 1 then lg := lg || jsonb_build_object('m', '@' || s || case when k = 'reflect' then '리플렉터' else '빛의장막' end || '의 효과가 사라졌다!'); end if;
      end if;
    end loop;
  end loop;
end $$;

-- ───────── 끝내기 + 보상 ─────────
create or replace function public._bt_finish(bid bigint, w smallint) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.battles; uid uuid; v_opp uuid; rw jsonb; n int; v_day date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into b from public.battles where id = bid for update;
  if b.status <> 'active' then return; end if;
  rw := jsonb_build_object('ticket', false);
  if w is not null then
    uid := case when w = 0 then b.p1 when b.mode = 'pvp' then b.p2 end;
    v_opp := case when w = 0 then b.p2 else b.p1 end;
    if uid is null then rw := jsonb_build_object('ticket', false, 'why', 'lost');
    elsif b.mode = 'cpu' or v_opp is null then rw := jsonb_build_object('ticket', false, 'why', 'practice');
    elsif exists (select 1 from public.battle_rewards r where r.user_id = uid and r.opp = v_opp and r.day = v_day) then
      rw := jsonb_build_object('ticket', false, 'why', 'same_opp');
    else
      select count(*) into n from public.battle_rewards r where r.user_id = uid and r.day = v_day;
      if n >= coalesce((public._setting('battle_daily_max'))::int, 3) then
        rw := jsonb_build_object('ticket', false, 'why', 'daily_max');
      else
        insert into public.battle_rewards (user_id, opp, day, battle_id) values (uid, v_opp, v_day, bid);
        update public.profiles set evo_tickets = evo_tickets + 1, battle_wins = battle_wins + 1, battle_wins_at = now() where user_id = uid;
        rw := jsonb_build_object('ticket', true, 'today', n + 1);
        insert into public.events (kind, data) values ('battle_won', jsonb_build_object('battle', bid, 'mode', b.mode));
      end if;
    end if;
  end if;
  update public.battles set status = 'over', winner = w, reward = rw, deadline = null, updated_at = now() where id = bid;
end $$;

-- 고른 것이 다 모이면 턴을 푼다 (교체 단계면 교체만)
create or replace function public._bt_resolve(bid bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.battles; st jsonb; lg jsonb := '[]'; s int; need int[] := '{}'; a0 int; a1 int; nxt int; ai_side boolean;
begin
  select * into b from public.battles where id = bid for update;
  if b.status <> 'active' then return; end if;
  st := b.state;
  if b.phase = 'choose' then
    select * into st, lg from public._bt_turn(st, b.acts);
  else
    for s in select (x)::int from jsonb_array_elements_text(st -> 'need') x loop
      select * into st, lg from public._bt_switch(st, lg, s, (b.acts -> s::text ->> 'switch')::int);
    end loop;
  end if;
  st := st - 'need';
  a0 := public._bt_alive(st, 0); a1 := public._bt_alive(st, 1);
  if a0 = 0 or a1 = 0 then
    update public.battles set state = st, log = lg, seq = seq + 1, acts = '{}', updated_at = now() where id = bid;
    perform public._bt_finish(bid, case when a0 = 0 and a1 = 0 then null when a0 = 0 then 1 else 0 end::smallint);
    return;
  end if;
  -- 쓰러진 쪽: AI 쪽이거나 남은 몬스터가 하나뿐이면 자동으로 내보냄, 아니면 사람이 고름
  for s in 0 .. 1 loop
    if (public._bt_act(st, s) ->> 'hp')::int <= 0 then
      ai_side := s = 1 and b.mode <> 'pvp';
      if ai_side or public._bt_alive(st, s) = 1 then
        nxt := case when ai_side then public._bt_ai_next(st, s)
                    else (select (o - 1)::int from jsonb_array_elements(st -> 'sides' -> s -> 'mons') with ordinality x(m, o) where (m ->> 'hp')::int > 0 limit 1) end;
        select * into st, lg from public._bt_switch(st, lg, s, nxt);
      else
        need := need || s;
      end if;
    end if;
  end loop;
  if cardinality(need) > 0 then st := st || jsonb_build_object('need', to_jsonb(need)); end if;
  update public.battles set state = st, log = lg, seq = seq + 1, acts = '{}', updated_at = now(),
         phase = case when cardinality(need) > 0 then 'replace' else 'choose' end,
         deadline = case when mode = 'pvp' then now() + make_interval(secs => coalesce((public._setting('battle_turn_sec'))::int, 45)) end
   where id = bid;
end $$;

-- 실시간 대전: 시간이 지나면 안 고른 쪽은 AI가 대신. 신청은 시간이 지나면 취소
create or replace function public._bt_timeout(bid bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.battles; s int; v_acts jsonb; nxt int;
begin
  select * into b from public.battles where id = bid for update;
  if b.deadline is null or b.deadline > now() then return; end if;
  if b.status = 'invite' then
    update public.battles set status = 'cancelled', deadline = null, updated_at = now() where id = bid; return;
  end if;
  if b.status <> 'active' then return; end if;
  v_acts := b.acts;
  if b.phase = 'choose' then
    for s in 0 .. 1 loop
      if not v_acts ? s::text then v_acts := v_acts || jsonb_build_object(s::text, public._bt_ai(b.state, s)); end if;
    end loop;
  else
    for s in select (x)::int from jsonb_array_elements_text(b.state -> 'need') x loop
      if not v_acts ? s::text then
        nxt := public._bt_ai_next(b.state, s);
        v_acts := v_acts || jsonb_build_object(s::text, jsonb_build_object('switch', nxt));
      end if;
    end loop;
  end if;
  update public.battles set acts = v_acts where id = bid;
  perform public._bt_resolve(bid);
end $$;

-- 폰에 보내는 모양: 내 쪽은 전부, 상대 쪽은 나와 있는 몬스터 + 남은 수만 (상대 기술·고른 것은 안 보임)
create or replace function public._bt_json(b public.battles, uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me int := case when uid = b.p1 then 0 else 1 end; fo int; sides jsonb := '[]'; s int; sd jsonb; m jsonb;
begin
  fo := 1 - me;
  if b.status in ('active', 'over') then
    for s in 0 .. 1 loop
      sd := b.state -> 'sides' -> s;
      if s = me then
        sides := sides || jsonb_build_array(sd);
      else
        m := public._bt_act(b.state, s);
        sides := sides || jsonb_build_array(jsonb_build_object(
          'active', sd -> 'active', 'reflect', sd -> 'reflect', 'light', sd -> 'light',
          'mons', (select jsonb_agg(case when (o - 1) = (sd ->> 'active')::int
                                         then jsonb_build_object('sp', x -> 'sp', 'name', x ->> 'name', 'type', x ->> 'type', 'hp', x -> 'hp', 'max', x -> 'max', 'st', x -> 'st', 'stg', x -> 'stg', 'seen', true)
                                         else jsonb_build_object('hp', x -> 'hp', 'max', x -> 'max') end order by o)
                   from jsonb_array_elements(sd -> 'mons') with ordinality y(x, o))));
      end if;
    end loop;
  end if;
  return jsonb_build_object(
    'id', b.id, 'mode', b.mode, 'status', b.status, 'phase', b.phase, 'turn', coalesce((b.state ->> 'turn')::int, 0),
    'seq', b.seq, 'me', me, 'log', b.log, 'sides', sides, 'winner', b.winner, 'reward', b.reward,
    'need', b.phase = 'replace' and coalesce(b.state -> 'need', '[]') @> to_jsonb(me),
    'chosen', b.acts ? me::text, 'deadline', b.deadline, 'server_time', now(),
    'names', jsonb_build_array(
      (select public._display_name(p) from public.profiles p where p.user_id = b.p1),
      case when b.mode = 'cpu' then '연습 상대' else (select public._display_name(p) from public.profiles p where p.user_id = b.p2) end));
end $$;

-- 새 배틀을 시작하면 내가 하던 AI 배틀은 끝 (진 것으로), 실시간 대전은 기권 처리
create or replace function public._bt_close_mine(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id, p1 from public.battles where (p1 = uid or p2 = uid) and status = 'active' and (mode = 'pvp' or p1 = uid) loop
    perform public._bt_finish(r.id, case when r.p1 = uid then 1 else 0 end::smallint);
  end loop;
  update public.battles set status = 'cancelled', deadline = null, updated_at = now() where p1 = uid and status = 'invite';
end $$;

-- ───────── 학생이 부르는 함수 ─────────

-- 내 배틀 QR 코드 (없으면 만든다) — QR 내용 = 'BTL.' || code
create or replace function public.battle_code() returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); c text;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select battle_code into c from public.profiles where user_id = uid;
  if c is null then
    loop
      c := public._rand(8, 'abcdefghjkmnpqrstuvwxyz23456789');
      exit when not exists (select 1 from public.profiles where battle_code = c);
    end loop;
    update public.profiles set battle_code = c where user_id = uid;
  end if;
  return c;
end $$;

-- 내 배틀 팀 저장 (친구가 내 QR 로 "친구 팀 vs AI" 할 때 쓰임)
create or replace function public.battle_set_team(p_lines int[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public._bt_team(uid, p_lines);
  update public.profiles set battle_team = p_lines where user_id = uid;
  return jsonb_build_object('ok', true, 'team', to_jsonb(p_lines));
end $$;

create or replace function public._bt_new(uid uuid, p_mode text, opp uuid, s0 int[], s1 int[]) returns public.battles
language plpgsql security definer set search_path = '' as $$
declare b public.battles;
begin
  insert into public.battles (mode, p1, p2, state, deadline)
  values (p_mode, uid, opp, jsonb_build_object('turn', 0, 'sides', jsonb_build_array(public._bt_side(s0), public._bt_side(s1))),
          case when p_mode = 'pvp' then now() + make_interval(secs => coalesce((public._setting('battle_turn_sec'))::int, 45)) end)
  returning * into b;
  return b;
end $$;

-- 연습 배틀: 상대 = 아무 선생님 몬스터 (내 팀과 같은 단계, 전설·비밀·빠진 선생님 제외)
create or replace function public.battle_start_cpu(p_lines int[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mine int[]; foe int[] := '{}'; used int[]; x int; y int;
  b public.battles;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._assert_open();
  mine := public._bt_team(uid, p_lines);
  used := p_lines;
  foreach x in array mine loop
    select s.id into y from public.species s join public.lines l on l.id = s.line_id
     where l.active and not l.withdrawn and not l.secret and not l.bonus and l.rarity <> 'legendary'
       and s.stage = (select stage from public.species where id = x) and s.line_id <> all (used)
     order by random() limit 1;
    if y is null then raise exception 'BAD_TEAM'; end if;
    foe := foe || y; used := used || ((y - 1) / 3 + 1);
  end loop;
  perform public._bt_close_mine(uid);
  b := public._bt_new(uid, 'cpu', null, mine, foe);
  return public._bt_json(b, uid);
end $$;

create or replace function public._bt_by_code(p_code text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare r uuid;
begin
  select user_id into r from public.profiles where battle_code = lower(btrim(coalesce(p_code, '')));
  if r is null then raise exception 'BATTLE_CODE_NOT_FOUND'; end if;
  if r = auth.uid() then raise exception 'BATTLE_SELF'; end if;
  return r;
end $$;

-- 친구 팀 vs AI
create or replace function public.battle_start_team(p_code text, p_lines int[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); fr uuid; mine int[]; foe int[]; b public.battles;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._assert_open();
  fr := public._bt_by_code(p_code);
  mine := public._bt_team(uid, p_lines);
  foe := public._bt_friend_team(fr);
  if coalesce(cardinality(foe), 0) = 0 then raise exception 'FRIEND_NO_MONSTERS'; end if;
  perform public._bt_close_mine(uid);
  b := public._bt_new(uid, 'team', fr, mine, foe);
  return public._bt_json(b, uid);
end $$;

-- 실시간 대전 신청 (친구가 battle_invite_sec 안에 수락해야 시작)
create or replace function public.battle_challenge(p_code text, p_lines int[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); fr uuid; mine int[]; b public.battles;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._assert_open();
  fr := public._bt_by_code(p_code);
  mine := public._bt_team(uid, p_lines);
  if exists (select 1 from public.battles where mode = 'pvp' and status = 'active' and (p1 = fr or p2 = fr)) then raise exception 'FRIEND_BUSY'; end if;
  perform public._bt_close_mine(uid);
  insert into public.battles (mode, status, p1, p2, state, deadline)
  values ('pvp', 'invite', uid, fr, jsonb_build_object('turn', 0, 'sides', jsonb_build_array(public._bt_side(mine))),
          now() + make_interval(secs => coalesce((public._setting('battle_invite_sec'))::int, 60)))
  returning * into b;
  return public._bt_json(b, uid);
end $$;

-- 홈에서 몇 초마다: 나에게 온 신청 + 하고 있는 배틀
create or replace function public.battle_inbox() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r record;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  for r in select id from public.battles where (p1 = uid or p2 = uid) and status in ('invite', 'active') and deadline < now() loop
    perform public._bt_timeout(r.id);
  end loop;
  return jsonb_build_object(
    'invites', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'from', public._display_name(p), 'deadline', b.deadline) order by b.id)
                         from public.battles b join public.profiles p on p.user_id = b.p1
                         where b.p2 = uid and b.mode = 'pvp' and b.status = 'invite'), '[]'),
    'active', (select jsonb_build_object('id', b.id, 'mode', b.mode, 'status', b.status) from public.battles b
                where ((b.p1 = uid and b.status in ('active', 'invite')) or (b.p2 = uid and b.mode = 'pvp' and b.status = 'active'))
                order by b.id desc limit 1),
    'server_time', now());
end $$;

create or replace function public.battle_accept(p_id bigint, p_lines int[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); b public.battles; mine int[];
begin
  perform public._bt_timeout(p_id);
  select * into b from public.battles where id = p_id and p2 = uid and mode = 'pvp' for update;
  if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.status <> 'invite' then raise exception 'BATTLE_INVITE_GONE'; end if;
  mine := public._bt_team(uid, p_lines);
  perform public._bt_close_mine(uid);
  update public.battles set status = 'active', updated_at = now(),
         state = jsonb_set(state, '{sides}', (state -> 'sides') || jsonb_build_array(public._bt_side(mine))),
         deadline = now() + make_interval(secs => coalesce((public._setting('battle_turn_sec'))::int, 45))
   where id = p_id returning * into b;
  return public._bt_json(b, uid);
end $$;

create or replace function public.battle_decline(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  update public.battles set status = 'declined', deadline = null, updated_at = now()
   where id = p_id and p2 = auth.uid() and status = 'invite';
  return jsonb_build_object('ok', true);
end $$;

create or replace function public._bt_mine(p_id bigint) returns public.battles
language plpgsql stable security definer set search_path = '' as $$
declare b public.battles;
begin
  select * into b from public.battles where id = p_id and (p1 = auth.uid() or (p2 = auth.uid() and mode = 'pvp'));
  if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
  return b;
end $$;

create or replace function public.battle_state(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.battles;
begin
  b := public._bt_mine(p_id);
  perform public._bt_timeout(p_id);
  return public._bt_json(public._bt_mine(p_id), auth.uid());
end $$;

-- 고르기: {"move": 1~4} | {"switch": 0~2} (교체 단계에서는 switch 만)
create or replace function public.battle_act(p_id bigint, p_action jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); b public.battles; me int; m jsonb; i int; v_acts jsonb; ready boolean;
begin
  b := public._bt_mine(p_id);
  perform public._bt_timeout(p_id);
  select * into b from public.battles where id = p_id for update;
  if b.status <> 'active' then return public._bt_json(b, uid); end if;
  me := case when uid = b.p1 then 0 else 1 end;
  if b.acts ? me::text then raise exception 'BATTLE_WAIT'; end if;
  m := public._bt_act(b.state, me);
  if b.phase = 'replace' and not coalesce(b.state -> 'need', '[]') @> to_jsonb(me) then raise exception 'BATTLE_WAIT'; end if;
  if p_action ? 'switch' then
    i := (p_action ->> 'switch')::int;
    if i is null or i < 0 or i >= jsonb_array_length(b.state -> 'sides' -> me -> 'mons') or i = (b.state -> 'sides' -> me ->> 'active')::int
       or (b.state -> 'sides' -> me -> 'mons' -> i ->> 'hp')::int <= 0 then raise exception 'BAD_ACTION'; end if;
    p_action := jsonb_build_object('switch', i);
  elsif p_action ? 'move' and b.phase = 'choose' then
    i := (p_action ->> 'move')::int;
    if i is null or i < 1 or i > jsonb_array_length(m -> 'moves') then raise exception 'BAD_ACTION'; end if;
    if (m -> 'moves' -> (i - 1) ->> 'pp')::int <= 0
       and exists (select 1 from jsonb_array_elements(m -> 'moves') x where (x ->> 'pp')::int > 0) then raise exception 'NO_PP'; end if;
    p_action := jsonb_build_object('move', i);
  else
    raise exception 'BAD_ACTION';
  end if;
  v_acts := b.acts || jsonb_build_object(me::text, p_action);
  if b.mode <> 'pvp' and b.phase = 'choose' then v_acts := v_acts || jsonb_build_object('1', public._bt_ai(b.state, 1)); end if;
  ready := case when b.phase = 'choose' then v_acts ? '0' and v_acts ? '1'
                else not exists (select 1 from jsonb_array_elements_text(b.state -> 'need') x where not v_acts ? x) end;
  update public.battles set acts = v_acts, updated_at = now() where id = p_id;
  if ready then perform public._bt_resolve(p_id); end if;
  return public._bt_json(public._bt_mine(p_id), uid);
end $$;

-- 도망 / 기권 (실시간 대전이면 상대가 이긴 것) / 보낸 신청 취소
create or replace function public.battle_forfeit(p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); b public.battles;
begin
  b := public._bt_mine(p_id);
  if b.status = 'invite' then
    update public.battles set status = 'cancelled', deadline = null, updated_at = now() where id = p_id and p1 = uid;
  elsif b.status = 'active' then
    perform public._bt_finish(p_id, case when uid = b.p1 then 1 else 0 end::smallint);
  end if;
  return public._bt_json(public._bt_mine(p_id), uid);
end $$;

-- 오늘 배틀 보상 몇 번 받았는지
create or replace function public.battle_today() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('wins', (select count(*) from public.battle_rewards
                                     where user_id = auth.uid() and day = (now() at time zone 'Asia/Seoul')::date),
                            'max', coalesce((public._setting('battle_daily_max'))::int, 3),
                            'code', (select battle_code from public.profiles where user_id = auth.uid()),
                            'team', (select battle_team from public.profiles where user_id = auth.uid()))
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
  public.battle_code(), public.battle_set_team(int[]), public.battle_start_cpu(int[]), public.battle_start_team(text, int[]),
  public.battle_challenge(text, int[]), public.battle_inbox(), public.battle_accept(bigint, int[]), public.battle_decline(bigint),
  public.battle_state(bigint), public.battle_act(bigint, jsonb), public.battle_forfeit(bigint), public.battle_today(),
  public.admin_create_qr(text, text, text, text), public.admin_rotate_qr(text, boolean), public.admin_cancel_ticket(text),
  public.admin_set_role(text, text), public.admin_adjust_tickets(text, int), public.admin_unlink(text), public.admin_stats(),
  public.admin_make_login_codes(text[], text[]), public.admin_export_ranking(), public.admin_relink(text, text),
  public.admin_grant_monster(text, int, int), public.admin_set_in_ranking(text, boolean), public.admin_list_staff(),
  public.admin_invite_staff(text, text), public.admin_remove_staff(text), public.admin_list_requests(),
  public.admin_decide_reset(bigint, boolean), public.admin_set_inquiry(bigint, boolean),
  public.admin_create_raid(int, int, int, boolean, text, text), public.admin_end_raid(bigint), public.admin_list_raids()
to authenticated;
