-- 0032 진짜 포켓몬 (1~7세대 809마리) — 데이터는 supabase/seed_pokemon.sql (tools/gen_pokemon.py), 그림은 운영자 그림 올리기와 같은 Storage.
--  1. species: btype ('불꽃/비행' 처럼 실제 타입 1~2개), dex (전국도감 번호), evo_lv (이 단계로 진화하는 레벨), sprite_shiny (진짜 색이 다른 그림).
--  2. 배틀: 상성 = 방어 타입 두 개의 곱 (_bt_tm), 자속 보정 = 기술 타입이 내 타입 중 하나와 같을 때, 팀 시너지 = 실제 타입 그룹,
--     레이드 탭 데미지·알 기술·도전과제(타입 수)도 실제 타입으로.
--  3. 진화 = 포켓몬처럼 레벨: 진화 레벨에 닿으면 진화의돌 없이 100% 진화. 그 전에는 진화의돌 (예전 진화권) 로 확률 진화.
--     잡은 포켓몬의 시작 레벨 = 그 단계의 진화 레벨 (1단계 5, 전설 50).
--  4. sprite_overrides(): {도감번호: "그림|색이 다른 그림"}.
--  5. 도전과제 글: 몬스터 → 포켓몬, 과목 → 타입.

alter table public.species add column if not exists btype text;
alter table public.species add column if not exists dex int;
alter table public.species add column if not exists evo_lv smallint;
alter table public.species add column if not exists sprite_shiny text
  check (sprite_shiny is null or sprite_shiny ~ '^[0-9]{1,4}-[0-9a-z]{1,16}\.(png|gif|webp)$');

-- 상성: 공격 타입 (여러 개면 가장 센 것) × 방어 타입 두 개의 곱
create or replace function public._bt_tm(a text, d text) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(max(x.m), 1) from (
    select coalesce((select c.mult from public.type_chart c where c.atk = at and c.def = split_part(coalesce(d, ''), '/', 1)), 1)
         * coalesce((select c.mult from public.type_chart c where c.atk = at and c.def = nullif(split_part(coalesce(d, ''), '/', 2), '')), 1) as m
      from unnest(string_to_array(coalesce(a, ''), '/')) at) x
$$;

-- 팀 시너지: 같은 그룹 타입이 2마리 이상이면 그 능력치 +1 (첫 번째 타입 기준)
create or replace function public._bt_group(t text) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when split_part(t, '/', 1) in ('에스퍼', '고스트', '페어리', '악') then '{"g": "신비", "stat": "spa", "name": "신비한 힘"}'::jsonb
    when split_part(t, '/', 1) in ('전기', '비행', '강철') then '{"g": "질풍", "stat": "spe", "name": "질풍의 팀"}'::jsonb
    when split_part(t, '/', 1) in ('물', '풀', '얼음', '벌레') then '{"g": "자연", "stat": "def", "name": "자연의 수호"}'::jsonb
    when split_part(t, '/', 1) in ('노말', '독', '땅', '바위') then '{"g": "대지", "stat": "spd", "name": "대지의 끈기"}'::jsonb
    when split_part(t, '/', 1) in ('불꽃', '격투', '드래곤') then '{"g": "투지", "stat": "atk", "name": "불타는 투지"}'::jsonb
  end
$$;


create or replace function public._bt_mon(p_sp int, p_lv int, p_moves int[], p_held text) returns jsonb
language sql stable security definer set search_path = '' as $$
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
    'st', null, 'slp', 0, 'frz', 0, 'cnf', 0, 'rch', false, 'used', false, 'stg', '{}'::jsonb, 'prot', 0, 'out', false)
  from public.species s join public.lines l on l.id = s.line_id left join public.items it on it.key = p_held and it.pocket = 'hold'
  where s.id = p_sp
$$;


create or replace function public._bt_move(inout st jsonb, inout lg jsonb, inout fl jsonb, u int, slot int, tu int)
language plpgsql volatile security definer set search_path = '' as $$
declare
  s int := u / 2; o int := 1 - u / 2; a jsonb; d jsonb; mv public.moves; e jsonb;
  an text; dn text; aw text; dw text;
  i int; pp int; mult numeric; crit boolean; ak text; dk text; at numeric; df numeric;
  dmg numeric; dh0 int; tmp int; chance int; ok boolean; sd jsonb; hits boolean; k int;
  nh int; j int; nhit int := 0; tot int := 0; pw numeric; lv int; acc numeric; endured boolean := false; fld jsonb := st -> 'field'; cs int;
begin
  a := public._bt_m(st, u);
  if a is null or (a ->> 'hp')::int <= 0 then return; end if;
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
    a := jsonb_set(a, '{prot}', '0'); st := public._bt_setm(st, u, a); return;
  end if;
  if a ->> 'st' = 'slp' then
    if (a ->> 'slp')::int > 1 then
      a := jsonb_set(a, '{slp}', to_jsonb((a ->> 'slp')::int - 1));
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
  if a ->> 'st' = 'par' and random() < 0.25 then
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
    a := jsonb_set(a, array['moves', (i - 1)::text, 'pp'], to_jsonb(pp - 1));
  end if;
  e := coalesce(mv.effect, '{}');
  lg := lg || jsonb_build_object('m', an || '의 ' || mv.name || '!', 'use', jsonb_build_array(u, mv.type, mv.category));

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
  hits := mv.kind = 'attack' or e ? 'foe_status' or e ? 'foe';
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
    if fl -> 'prot' ? tu::text then
      lg := lg || jsonb_build_object('m', dw || ' 공격으로부터 몸을 지켰다!'); st := public._bt_setm(st, u, a); return;
    end if;
    -- 명중: 기술 명중 × (내 명중 랭크 − 상대 회피 랭크) × 집중 안경
    if mv.accuracy is not null then
      acc := mv.accuracy * public._bt_sm(greatest(-6, least(6, coalesce((a -> 'stg' ->> 'acc')::int, 0) - coalesce((d -> 'stg' ->> 'eva')::int, 0))), true)
             * coalesce((a -> 'hold' ->> 'acc')::numeric / 100, 1);
      if random() * 100 >= acc then
        lg := lg || jsonb_build_object('m', case when mv.kind = 'attack' then '그러나 ' || an || '의 공격은 빗나갔다!' else '그러나 빗나갔다!' end);
        st := public._bt_setm(st, u, a); return;
      end if;
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
    mult := public._bt_tm(mv.type, d ->> 'type');
    if mult = 0 then
      lg := lg || jsonb_build_object('m', dn || '에게는 효과가 없는 것 같다...'); st := public._bt_setm(st, u, a); return;
    end if;
    pw := mv.power * case when fld is not null and fld -> 'types' ? mv.type then (fld ->> 'mult')::numeric else 1 end
                   * case when a -> 'hold' ->> 'boost' = mv.type then 1.2 else 1 end;
    nh := case when not e ? 'hits' then 1 when (e ->> 'hits')::int in (2, 3) then (e ->> 'hits')::int
               else (array[2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5])[1 + floor(random() * 20)::int] end;
    cs := case when coalesce((e ->> 'high_crit')::boolean, false) then 1 else 0 end + coalesce((a -> 'hold' ->> 'crit')::int, 0);
    for j in 1 .. nh loop
      exit when (d ->> 'hp')::int <= 0;
      crit := coalesce((e ->> 'always_crit')::boolean, false) or random() < case cs when 0 then 0.0625 when 1 then 0.125 else 0.25 end;
      if mv.category = 'physical' then ak := 'atk'; dk := 'def'; else ak := 'spa'; dk := 'spd'; end if;
      tmp := coalesce((a -> 'stg' ->> ak)::int, 0);
      at := (a ->> ak)::int * public._bt_sm(case when crit then greatest(0, tmp) else tmp end);
      tmp := coalesce((d -> 'stg' ->> dk)::int, 0);
      df := (d ->> dk)::int * public._bt_sm(case when crit then least(0, tmp) else tmp end);
      dmg := floor(floor(floor(2 * lv / 5 + 2) * pw * floor(at) / greatest(1, floor(df))) / 50);
      if mv.category = 'physical' and a ->> 'st' = 'brn' then dmg := floor(dmg / 2); end if;
      if not crit and ((mv.category = 'physical' and (sd ->> 'reflect')::int > 0) or (mv.category = 'special' and (sd ->> 'light')::int > 0)) then
        dmg := floor(dmg / 2);
      end if;
      dmg := dmg + 2;
      if crit then dmg := dmg * 2; end if;
      dmg := floor(dmg * (85 + floor(random() * 16)) / 100);
      if mv.type = any (string_to_array(a ->> 'type', '/')) then dmg := floor(dmg * 1.5); end if;
      dmg := greatest(1, floor(dmg * mult));
      tmp := (d ->> 'hp')::int;
      if dmg >= tmp and fl -> 'end' ? tu::text then dmg := tmp - 1; endured := true; end if;
      dmg := least(dmg, tmp);
      d := jsonb_set(d, '{hp}', to_jsonb(tmp - dmg::int));
      tot := tot + dmg::int; nhit := nhit + 1;
      lg := lg || jsonb_build_object('hp', jsonb_build_array(tu, (d ->> 'hp')::int), 'dmg', dmg::int);
      if crit then lg := lg || jsonb_build_object('m', '급소에 맞았다!'); end if;
    end loop;
    if nh > 1 then lg := lg || jsonb_build_object('m', nhit || '번 맞았다!'); end if;
    if mult > 1 then lg := lg || jsonb_build_object('m', '효과가 굉장했다!');
    elsif mult < 1 then lg := lg || jsonb_build_object('m', '효과가 별로인 듯하다...'); end if;
    if endured then lg := lg || jsonb_build_object('m', dw || ' 공격을 버텼다!'); end if;
    -- 얼음: 화학(불꽃) 공격에 맞으면 녹는다
    if d ->> 'st' = 'frz' and mv.type = '화학' and (d ->> 'hp')::int > 0 then
      d := d || '{"st": null, "frz": 0}';
      lg := lg || jsonb_build_object('m', public._bt_j(dn || '의 얼음', '이', '가') || ' 녹았다!', 'st', jsonb_build_array(tu, null));
    end if;
    -- 초코우유: HP 절반 이하 → 한 번 회복
    if d -> 'hold' ? 'pinch_heal' and not coalesce((d ->> 'used')::boolean, false) and (d ->> 'hp')::int > 0
       and (d ->> 'hp')::int * 2 <= (d ->> 'max')::int then
      tmp := least((d ->> 'max')::int, (d ->> 'hp')::int + (d ->> 'max')::int * (d -> 'hold' ->> 'pinch_heal')::int / 100);
      d := d || jsonb_build_object('hp', tmp, 'used', true);
      lg := lg || jsonb_build_object('m', dw || ' ' || (d ->> 'heldname') || '를 마셨다! HP가 회복되었다!', 'hp', jsonb_build_array(tu, tmp), 'fx', jsonb_build_array(tu, 'heal'));
    end if;

    if e ? 'drain' and tot > 0 and (a ->> 'hp')::int < (a ->> 'max')::int then
      tmp := least((a ->> 'max')::int, (a ->> 'hp')::int + greatest(1, floor(tot * (e ->> 'drain')::int / 100)::int));
      a := jsonb_set(a, '{hp}', to_jsonb(tmp));
      lg := lg || jsonb_build_object('m', public._bt_j(dn, '으로', '로') || '부터 체력을 흡수했다!', 'hp', jsonb_build_array(u, tmp));
    end if;
    if e ? 'recoil' or e ? 'self_damage' then
      tmp := case when e ? 'recoil' then greatest(1, floor(tot / (e ->> 'recoil')::int)::int)
                  else greatest(1, (a ->> 'max')::int * (e ->> 'self_damage')::int / 100) end;
      a := jsonb_set(a, '{hp}', to_jsonb(greatest(0, (a ->> 'hp')::int - tmp)));
      lg := lg || jsonb_build_object('m', aw || ' 반동으로 데미지를 입었다!', 'hp', jsonb_build_array(u, (a ->> 'hp')::int));
    end if;
    if e ? 'recharge' then a := jsonb_set(a, '{rch}', 'true'); end if;
    chance := coalesce((e ->> 'chance')::int, 100);
    if (e ? 'foe_status' or e ? 'foe' or e ? 'self') and random() * 100 < chance then
      if e ? 'foe_status' then select * into d, lg, ok from public._bt_status(d, lg, false, e ->> 'foe_status', dn, tu); end if;
      if e ? 'foe' then select * into d, lg from public._bt_stages(d, lg, e -> 'foe', dn || '의 ', tu); end if;
      if e ? 'self' then select * into a, lg from public._bt_stages(a, lg, e -> 'self', an || '의 ', u); end if;
    end if;
    if e ? 'self_all_up' and random() * 100 < (e ->> 'self_all_up')::int then
      select * into a, lg from public._bt_stages(a, lg, '{"atk": 1, "def": 1, "spa": 1, "spd": 1, "spe": 1}', an || '의 ', u);
    end if;
    -- 풀죽음: 상대가 이번 턴에 아직 안 움직였으면
    if e ? 'flinch' and (d ->> 'hp')::int > 0 and not (fl -> 'moved' ? tu::text) and random() * 100 < (e ->> 'flinch')::int then
      fl := jsonb_set(fl, array['flinch', tu::text], 'true');
    end if;
  else
    ok := true;
    if e ? 'foe_status' then
      select * into d, lg, ok from public._bt_status(d, lg, false, e ->> 'foe_status', dn, tu);
      if not ok and not (e ? 'foe') then lg := lg || jsonb_build_object('m', '그러나 실패했다!'); end if;
    end if;
    if e ? 'foe' then select * into d, lg from public._bt_stages(d, lg, e -> 'foe', dn || '의 ', tu); end if;
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
      else
        a := a || jsonb_build_object('hp', (a ->> 'max')::int, 'st', 'slp', 'slp', 3, 'frz', 0);
        lg := lg || jsonb_build_object('m', aw || ' 잠들어서 건강해졌다!', 'hp', jsonb_build_array(u, (a ->> 'max')::int), 'st', jsonb_build_array(u, 'slp'));
      end if;
    end if;
  end if;

  st := public._bt_setm(public._bt_setm(st, tu, d), u, a);
  if d is not null and (d ->> 'hp')::int <= 0 and dh0 > 0 then lg := lg || jsonb_build_object('m', dw || ' 쓰러졌다!', 'faint', tu); end if;
  if (a ->> 'hp')::int <= 0 then lg := lg || jsonb_build_object('m', aw || ' 쓰러졌다!', 'faint', u); end if;
end $$;


create or replace function public._bt_ai(st jsonb, u int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s int := u / 2; o int := 1 - u / 2;
  a jsonb := public._bt_m(st, u); d jsonb;
  mv public.moves; e jsonb; i int; k int; sc numeric; best numeric := -1; pick int := 1; tgt int := 0; est numeric; ratio numeric;
  hp numeric := (a ->> 'hp')::numeric / (a ->> 'max')::numeric; key text; first_k int; fld jsonb := st -> 'field';
begin
  first_k := case when public._bt_live(st, o * 2) then 0 else 1 end;
  for i in 1 .. jsonb_array_length(a -> 'moves') loop
    continue when (a -> 'moves' -> (i - 1) ->> 'pp')::int <= 0;
    select * into mv from public.moves where id = (a -> 'moves' -> (i - 1) ->> 'id')::int;
    continue when not found;
    e := mv.effect;
    for k in 0 .. 1 loop
      continue when not public._bt_live(st, o * 2 + k);
      continue when not (mv.kind = 'attack' or e ? 'foe_status' or e ? 'foe') and k <> first_k;
      d := public._bt_m(st, o * 2 + k);
      sc := 0;
      if mv.kind = 'attack' then
        ratio := case when mv.category = 'physical' then public._bt_eff(a, 'atk') / greatest(1, public._bt_eff(d, 'def'))
                      else public._bt_eff(a, 'spa') / greatest(1, public._bt_eff(d, 'spd')) end;
        est := ((2 * coalesce((a ->> 'lv')::int, 50) / 5 + 2) * mv.power * ratio / 50 + 2) * public._bt_tm(mv.type, d ->> 'type')
               * case when mv.type = any (string_to_array(a ->> 'type', '/')) then 1.5 else 1 end * coalesce(mv.accuracy, 100) / 100.0 * 0.925
               * case when mv.category = 'physical' and a ->> 'st' = 'brn' then 0.5 else 1 end
               * case when e ? 'hits' then case when (e ->> 'hits')::int in (2, 3) then (e ->> 'hits')::int else 3.1 end else 1 end
               * case when fld is not null and fld -> 'types' ? mv.type then (fld ->> 'mult')::numeric else 1 end
               * case when a -> 'hold' ->> 'boost' = mv.type then 1.2 else 1 end
               * case when mv.accuracy is null then 1 else public._bt_sm(-coalesce((d -> 'stg' ->> 'eva')::int, 0), true) end;
        sc := est / greatest(1, (d ->> 'hp')::int) * 100;
        if est >= (d ->> 'hp')::int then sc := sc + 100 + mv.priority * 40; end if;
        if e ? 'recoil' or e ? 'self_damage' then sc := sc * 0.85; end if;
        if e ? 'recharge' and est < (d ->> 'hp')::int then sc := sc * 0.6; end if;
      elsif e ? 'foe_status' then
        sc := case when e ->> 'foe_status' = 'cnf' then case when coalesce((d ->> 'cnf')::int, 0) = 0 then 35 else 0 end
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
        sc := 20;
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


create or replace function public._raid_per_tap(uid uuid, line int, boss int) returns int
language plpgsql stable security definer set search_path = '' as $$
declare a public.species; b public.species; at text; bt text; m numeric := 1; atk int; def int;
begin
  if line is null then return 3; end if;
  select s.* into a from public.collection c join public.species s on s.line_id = c.line_id and s.stage = c.stage
   where c.user_id = uid and c.line_id = line;
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
  select l.rarity, coalesce((select s.btype from public.species s where s.line_id = l.id and s.stage = 1), l.btype, '노말') into v_rar, v_bt
    from public.lines l where l.id = v_line;
  select id into v_sp from public.species where line_id = v_line and stage = 1;

  -- 잡기와 같게: 처음이면 새로 (시작 레벨, 초록 +3), 이미 있으면 잡은 횟수 +1 (collection_growth 트리거가 레벨 +1)
  v_lvl := (case when v_rar = 'legendary' then 50 else 5 end) + (case when e.tier = 'green' then 3 else 0 end);
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
     where m.kind = 'attack' and m.type = any (string_to_array(v_bt, '/') || '노말'::text)
       and not exists (select 1 from public.learnset ls where ls.line_id = v_line and ls.move_id = m.id)
       and not exists (select 1 from public.species s join public.species_moves sm on sm.species_id = s.id
                        where s.line_id = v_line and sm.move_id = m.id)
       and not (m.id = any (public._known_moves(uid, v_line)))
     order by (m.type = any (string_to_array(v_bt, '/'))) desc, random() limit 1;
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
    'stage3', (select count(*) from public.collection c join public.lines l on l.id = c.line_id
                where c.user_id = uid and c.stage > 1 and c.stage = l.max_stage),
    'rare', (select count(*) from public.collection c join public.lines l on l.id = c.line_id where c.user_id = uid and l.rarity = 'rare'),
    'legend', (select count(*) from public.collection c join public.lines l on l.id = c.line_id where c.user_id = uid and l.rarity = 'legendary'),
    'maxlv', coalesce((select max(level) from public.collection where user_id = uid), 0),
    'types', (select count(distinct x) from public.collection c join public.species s on s.line_id = c.line_id and s.stage = c.stage,
               unnest(string_to_array(s.btype, '/')) x where c.user_id = uid),
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
    ('shiny1', '반짝반짝', '반짝이 포켓몬 1마리 얻기', 'shiny', 1, '{"item": "lucky", "n": 1}'::jsonb, 48),
    ('shiny3', '반짝이 수집가', '반짝이 포켓몬 3마리 얻기', 'shiny', 3, '{"egg": "purple"}'::jsonb, 49),
    ('evolve1', '첫 진화', '진화 1번 성공하기', 'evolves', 1, '{"item": "candy", "n": 1}'::jsonb, 50),
    ('evolve3', '진화 연습', '진화 3번 성공하기', 'evolves', 3, '{"egg": "green"}'::jsonb, 51),
    ('evolve5', '진화의 달인', '진화 5번 성공하기', 'evolves', 5, '{"evo": 2}'::jsonb, 52),
    ('evolve10', '진화 연구소', '진화 10번 성공하기', 'evolves', 10, '{"egg": "yellow"}'::jsonb, 53),
    ('evolve20', '진화 박사', '진화 20번 성공하기', 'evolves', 20, '{"evo": 3}'::jsonb, 54),
    ('final1', '끝까지 진화', '최종 진화 포켓몬 1마리 만들기', 'stage3', 1, '{"item": "energy", "n": 2}'::jsonb, 55),
    ('final5', '최종 진화 팀', '최종 진화 포켓몬 5마리 만들기', 'stage3', 5, '{"egg": "purple"}'::jsonb, 56),
    ('rare5', '희귀한 친구들', '희귀 포켓몬 5마리 모으기', 'rare', 5, '{"egg": "yellow"}'::jsonb, 57),
    ('rare10', '희귀 수집가', '희귀 포켓몬 10마리 모으기', 'rare', 10, '{"evo": 2}'::jsonb, 58),
    ('legend1', '전설과의 만남', '전설 포켓몬 1마리 얻기', 'legend', 1, '{"egg": "yellow"}'::jsonb, 59),
    ('legend3', '전설 수집가', '전설 포켓몬 3마리 얻기', 'legend', 3, '{"egg": "purple"}'::jsonb, 60),
    ('lv10', '쑥쑥', '포켓몬 하나를 Lv.10까지 키우기', 'maxlv', 10, '{"item": "mint", "n": 1}'::jsonb, 61),
    ('lv20', '든든한 동료', '포켓몬 하나를 Lv.20까지 키우기', 'maxlv', 20, '{"item": "candy", "n": 1}'::jsonb, 62),
    ('lv30', '믿음직한 파트너', '포켓몬 하나를 Lv.30까지 키우기', 'maxlv', 30, '{"egg": "yellow"}'::jsonb, 63),
    ('lv50', '최강의 파트너', '포켓몬 하나를 Lv.50까지 키우기', 'maxlv', 50, '{"evo": 3}'::jsonb, 64),
    ('types5', '여러 타입', '서로 다른 타입 5가지 모으기', 'types', 5, '{"item": "glasses", "n": 1}'::jsonb, 65),
    ('types10', '타입 탐험가', '서로 다른 타입 10가지 모으기', 'types', 10, '{"egg": "yellow"}'::jsonb, 66),
    ('types15', '타입 마스터', '서로 다른 타입 15가지 모으기', 'types', 15, '{"egg": "purple"}'::jsonb, 67),
    ('learn1', '새 기술', '기술머신·알 기술로 새 기술 1개 배우기', 'learned', 1, '{"item": "energy", "n": 1}'::jsonb, 68),
    ('learn5', '기술 박사', '새 기술 5개 배우기', 'learned', 5, '{"egg": "yellow"}'::jsonb, 69),
    ('held1', '선물 들려 주기', '포켓몬에게 물건 1개 지니게 하기', 'held', 1, '{"item": "choco", "n": 1}'::jsonb, 70),
    ('held3', '든든한 준비', '포켓몬 3마리에게 물건 지니게 하기', 'held', 3, '{"item": "clock", "n": 1}'::jsonb, 71),
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
    ('surf300', '파도 타기', '포켓몬 서핑 300m', 'surf', 300, '{"item": "candy", "n": 1}'::jsonb, 83),
    ('surf1000', '파도의 왕', '포켓몬 서핑 1,000m', 'surf', 1000, '{"egg": "yellow"}'::jsonb, 84),
    ('surf2000', '전설의 서퍼', '포켓몬 서핑 2,000m', 'surf', 2000, '{"egg": "purple"}'::jsonb, 85),
    ('dodge300', '요리조리', '폭탄 피하기 300점', 'dodge', 300, '{"item": "candy", "n": 1}'::jsonb, 86),
    ('dodge800', '폭탄 무서워하지 않기', '폭탄 피하기 800점', 'dodge', 800, '{"egg": "yellow"}'::jsonb, 87),
    ('land150', '내 땅 넓히기', '땅따먹기 15% 차지하기', 'land', 150, '{"item": "candy", "n": 1}'::jsonb, 88),
    ('land300', '땅 부자', '땅따먹기 30% 차지하기', 'land', 300, '{"egg": "yellow"}'::jsonb, 89),
    ('cross30', '지각 안 하기', '포켓몬 등굣길 30칸', 'cross', 30, '{"item": "candy", "n": 1}'::jsonb, 90),
    ('cross80', '등굣길 달인', '포켓몬 등굣길 80칸', 'cross', 80, '{"egg": "yellow"}'::jsonb, 91),
    ('cross150', '개근상', '포켓몬 등굣길 150칸', 'cross', 150, '{"egg": "purple"}'::jsonb, 92),
    ('secret1', '숨은 그림 찾기', '숨겨진 이스터에그 1개 찾기', 'secrets', 1, '{"item": "candy", "n": 1}'::jsonb, 93),
    ('secret2', '눈썰미', '숨겨진 이스터에그 2개 찾기', 'secrets', 2, '{"egg": "green"}'::jsonb, 94),
    ('secret3', '비밀 탐정', '숨겨진 이스터에그 3개 모두 찾기', 'secrets', 3, '{"egg": "yellow"}'::jsonb, 95)
$$;


create or replace function public._collection_growth() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.level = 5 then
      new.level := case when (select rarity from public.lines where id = new.line_id) = 'legendary' then 50
                        else greatest(5, coalesce((select evo_lv from public.species where line_id = new.line_id and stage = new.stage),
                                                  case when new.stage = 2 then 20 when new.stage >= 3 then 35 else 5 end)) end;
    end if;
  elsif new.catch_count > old.catch_count and new.level < 100 and public._lv_on('lv_from_catch') then
    new.level := least(100, new.level + (new.catch_count - old.catch_count));
    if new.level >= 100 then new.exp := 0; end if;
  end if;
  return new;
end $$;


create or replace function public.evolve(p_line int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked();
  c public.collection;
  base numeric; prob numeric; guaranteed boolean; win boolean; need int; by_level boolean;
begin
  perform public._assert_open();
  select * into c from public.collection where user_id = p.user_id and line_id = p_line;
  if not found then raise exception 'NOT_OWNED'; end if;
  if c.stage >= (select max_stage from public.lines where id = p_line) then raise exception 'MAX_STAGE'; end if;
  select evo_lv into need from public.species where line_id = p_line and stage = c.stage + 1;
  by_level := c.level >= coalesce(need, 101);
  if not by_level then
    update public.profiles set evo_tickets = evo_tickets - 1 where user_id = p.user_id and evo_tickets > 0;
    if not found then raise exception 'NO_TICKET'; end if;
  end if;

  base := (public._setting('evo_prob') ->> c.stage)::numeric;
  guaranteed := c.evo_fails >= (public._setting('evo_pity_max') ->> c.stage)::int;
  prob := least(1, base + c.evo_fails * (public._setting('evo_pity_step'))::numeric);
  win := by_level or guaranteed or random() < prob;

  if win then
    update public.collection set stage = stage + 1, evo_fails = 0, updated_at = now()
     where user_id = p.user_id and line_id = p_line returning * into c;
    perform public._recompute(p.user_id);
  else
    update public.collection set evo_fails = evo_fails + 1, updated_at = now()
     where user_id = p.user_id and line_id = p_line returning * into c;
  end if;
  insert into public.events (user_id, kind, data)
  values (p.user_id, 'evolve', jsonb_build_object('line', p_line, 'success', win, 'stage', c.stage, 'by_level', by_level));

  return jsonb_build_object(
    'success', win, 'stage', c.stage, 'evo_fails', c.evo_fails, 'by_level', by_level,
    'species_id', (p_line - 1) * 3 + c.stage,
    'evo_tickets', (select evo_tickets from public.profiles where user_id = p.user_id),
    'profile', (select public._profile_json(x) from public.profiles x where x.user_id = p.user_id));
end $$;


-- 그림 목록: {도감번호: "그림"} 또는 {도감번호: "그림|색이 다른 그림"}
create or replace function public.sprite_overrides() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(s.id::text, s.sprite || coalesce('|' || s.sprite_shiny, '')), '{}'::jsonb)
  from public.species s join public.lines l on l.id = s.line_id
  where s.sprite is not null and not l.withdrawn
$$;


-- 야생 포켓몬: (1) QR 을 찍으면 wild_chance 확률로 야생 포켓몬 (희귀도 가중치 wild_weights), (2) 걸음 wild_steps 마다 야생 포켓몬이
--   나타남 (하루 wild_daily 마리, 볼 wild_balls 개 — 앱의 잡기 장면에서, 다 놓치면 도망). (3) 알·레이드는 원래대로 모든 포켓몬.
insert into public.settings (key, value) values
  ('wild_chance', '0.4'), ('wild_weights', '{"common": 100, "rare": 10, "legendary": 1}'),
  ('wild_steps', '1500'), ('wild_daily', '5'), ('wild_balls', '5')
on conflict (key) do nothing;

alter table public.raid_encounters alter column raid_id drop not null;
alter table public.raid_encounters add column if not exists kind text not null default 'raid' check (kind in ('raid', 'wild'));
alter table public.tickets drop constraint if exists tickets_special_check;
alter table public.tickets add constraint tickets_special_check check (special in ('raid', 'dex50', 'dex100', 'egg', 'wild'));
insert into public.qr_points (id, name, hint, kind, visible_on_map, active, daily_cap) values
  ('WILD', '★ 야생 포켓몬', '', 'static', false, false, null)
on conflict (id) do nothing;

-- 야생 계열 하나 고르기 (선생님 계열이 아닌 것, 희귀도 가중치)
create or replace function public._wild_line() returns int
language sql volatile security definer set search_path = '' as $$
  select l.id from public.lines l
   where l.subject = '야생' and l.active and not l.withdrawn and not l.bonus and not l.secret and not l.mythic
     and coalesce((public._setting('wild_weights') ->> l.rarity)::numeric, 0) > 0
   order by -ln(1 - random()) / (public._setting('wild_weights') ->> l.rarity)::numeric limit 1
$$;

-- QR: 정해 둔 몬스터 대신 가끔 야생 포켓몬
create or replace function public._draw_line(q text) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare v int;
begin
  if random() < coalesce((public._setting('wild_chance'))::numeric, 0) then
    v := public._wild_line();
    if v is not null then return v; end if;
  end if;
  select r.line_id into v from public.qr_rewards r join public.lines l on l.id = r.line_id
   where r.qr_id = q and l.active and not l.withdrawn
   order by -ln(1 - random()) / r.weight limit 1;
  if v is null then v := public._wild_line(); end if;     -- 정해 둔 몬스터가 없는 QR 도 야생 포켓몬은 나옴
  return v;
end $$;

create or replace function public._encounters_json(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'species_id', e.species_id, 'balls', e.balls, 'kind', e.kind,
                                               'raid_title', r.title, 'created_at', e.created_at) order by e.created_at), '[]')
  from public.raid_encounters e left join public.raids r on r.id = e.raid_id
  where e.user_id = uid and e.status = 'pending'
$$;


create or replace function public.egg_add_steps(p_steps int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked(); d date := public._seoul_day(); r public.egg_steps_day;
  spm int := greatest(0, coalesce((public._setting('steps_per_min_max'))::int, 200));
  dmax int := greatest(0, coalesce((public._setting('steps_day_max'))::int, 30000));
  mins numeric; today int := 0; acc int; ready jsonb;
  ws int := greatest(0, coalesce((public._setting('wild_steps'))::int, 0)); wd int := coalesce((public._setting('wild_daily'))::int, 0);
  n_new int := 0; have int; wl int; wsp int;
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
  -- 야생 포켓몬: 오늘 걸음이 wild_steps 를 넘을 때마다 한 마리 (하루 wild_daily 마리까지)
  if acc > 0 and ws > 0 and wd > 0 then
    select count(*) into have from public.raid_encounters
     where user_id = p.user_id and kind = 'wild' and (created_at at time zone 'Asia/Seoul')::date = d;
    n_new := least((today + acc) / ws - today / ws, wd - have);
    for i in 1 .. greatest(0, n_new) loop
      wl := public._wild_line();
      exit when wl is null;
      select id into wsp from public.species where line_id = wl and stage = 1;
      insert into public.raid_encounters (user_id, raid_id, species_id, balls, kind)
      values (p.user_id, null, wsp, greatest(1, coalesce((public._setting('wild_balls'))::int, 5)), 'wild');
    end loop;
  end if;
  select coalesce(jsonb_agg(id order by id), '[]') into ready
    from public.mon_eggs where user_id = p.user_id and hatched_at is null and steps >= need;
  return public._egg_state(p.user_id) || jsonb_build_object('accepted', acc, 'ready', ready, 'wild_new', greatest(0, n_new),
                                                            'encounters', public._encounters_json(p.user_id));
end $$;


create or replace function public.encounter_result(p_id bigint, p_caught boolean, p_grade text default 'none', p_curve boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; e public.raid_encounters; tk public.tickets;
  res jsonb; caught boolean := coalesce(p_caught, true); g text := coalesce(p_grade, 'none'); amt int; c public.collection; v_line int;
begin
  if g not in ('none', 'nice', 'great', 'excellent') then raise exception 'BAD_GRADE'; end if;
  select * into e from public.raid_encounters where id = p_id and user_id = uid and status = 'pending' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not caught and e.kind = 'raid' and not coalesce((public._setting('raid_catch_flee'))::boolean, true) then caught := true; end if;   -- 야생은 언제나 도망칠 수 있음
  if not caught then
    update public.raid_encounters set status = 'fled', resolved_at = now(), grade = 'none' where id = e.id;
    select line_id into v_line from public.species where id = e.species_id;
    return jsonb_build_object('caught', false, 'fled', true, 'line', v_line, 'species_id', e.species_id,
                              'new', false, 'level', null, 'exp', 0);
  end if;
  -- 그 레이드의 특별 티켓을 만들고 바로 바꿈 (부스에서 바꾼 것과 같은 길)
  insert into public.tickets (nonce, user_id, qr_id, token, special, fixed_species)
  values (public._rand(12, 'abcdefghijklmnopqrstuvwxyz0123456789'), uid,
          case when e.kind = 'wild' then 'WILD' else 'RAID' end, e.kind, e.kind, e.species_id)
  returning * into tk;
  res := public._redeem_ticket(uid, null, tk);
  v_line := (res ->> 'line_id')::int;
  amt := public._catch_exp(g, p_curve);
  update public.tickets set catch_grade = g where id = tk.id;
  perform public._gain_exp(uid, v_line, amt);
  perform public._recompute(uid);
  update public.raid_encounters set status = 'caught', resolved_at = now(), grade = g where id = e.id;
  select * into c from public.collection where user_id = uid and line_id = v_line;
  return jsonb_build_object('caught', true, 'fled', false, 'line', v_line, 'species_id', e.species_id,
                            'new', coalesce((res ->> 'is_new')::boolean, false), 'level', c.level, 'exp', amt,
                            'nonce', tk.nonce);
end $$;


create or replace function public._dex_rewards(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare total int; got int; cfg jsonb := public._setting('dex_rewards'); sp int;
begin
  if cfg is null then return; end if;
  select count(*), count(*) filter (where exists (
           select 1 from public.collection c where c.user_id = uid and c.line_id = s.line_id and c.stage >= s.stage))
    into total, got
  from public.species s join public.lines l on l.id = s.line_id
  where not l.bonus and not l.secret and not l.withdrawn and l.active and l.subject <> '야생';
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
  select count(*), count(*) filter (where exists (
           select 1 from public.collection c where c.user_id = uid and c.line_id = s.line_id and c.stage >= s.stage))
    into total, got
  from public.species s join public.lines l on l.id = s.line_id
  where not l.bonus and not l.secret and not l.withdrawn and l.active and l.subject <> '야생';
  if total = 0 then return; end if;
  if got * 2 < total then delete from public.tickets where user_id = uid and special = 'dex50' and status = 'pending'; end if;
  if got < total then delete from public.tickets where user_id = uid and special = 'dex100' and status = 'pending'; end if;
end $$;


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
                                          'evo_fails', c.evo_fails, 'first_caught_at', c.first_caught_at, 'level', c.level,
                                          'from_egg', c.from_egg, 'shiny', c.shiny, 'shiny_on', c.shiny_on))
      from public.collection c where c.user_id = uid), '[]'),
    'quizzes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'attempt_id', a.id, 'line_id', z.line_id, 'question', z.question,
               'choices', (select jsonb_agg(z.choices -> pi order by o) from unnest(a.perm) with ordinality as u(pi, o)))
             order by a.created_at)
      from public.quiz_attempts a join public.quizzes z on z.id = a.quiz_id
      where a.user_id = uid and a.answered_at is null), '[]'),
    'encounters', public._encounters_json(uid))
$$;


-- 운영자: 선생님을 다른 포켓몬 계열로 옮기기. p_from = 지금 선생님 계열, p_to = 야생 계열 (특별 전설 계열은 안 됨)
--   옮기는 것: 선생님 이름 · 과목 · 동의 철회 표시 · 퀴즈 · 장소 QR 에서 나오는 포켓몬 (qr_rewards). 학생이 이미 잡은 포켓몬은 그대로 (포켓몬은 포켓몬).
create or replace function public.admin_assign_teacher(p_from int, p_to int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.lines; b public.lines;
begin
  perform public._assert_admin();
  select * into a from public.lines where id = p_from for update;
  select * into b from public.lines where id = p_to for update;
  if a.id is null or b.id is null or a.id = b.id then raise exception 'NOT_FOUND'; end if;
  if a.subject = '야생' or a.bonus or a.secret or a.mythic or a.id between 35 and 42 or a.id >= 77 and a.id <= 82 then raise exception 'NOT_TEACHER_LINE'; end if;
  if b.subject <> '야생' or b.bonus or b.secret or b.mythic then raise exception 'NOT_WILD_LINE'; end if;
  update public.lines set teacher = a.teacher, subject = a.subject, withdrawn = a.withdrawn where id = b.id;
  update public.lines set teacher = '야생 포켓몬', subject = '야생', withdrawn = false where id = a.id;
  update public.quizzes set line_id = b.id where line_id = a.id;
  delete from public.qr_rewards r where r.line_id = b.id and exists (select 1 from public.qr_rewards x where x.qr_id = r.qr_id and x.line_id = a.id);
  update public.qr_rewards set line_id = b.id where line_id = a.id;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('assign_teacher', a.teacher, 'from', a.id, 'to', b.id));
  return jsonb_build_object('ok', true, 'teacher', a.teacher, 'from', a.id, 'to', b.id);
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
  public.encounter_result(bigint, boolean, text, boolean)
to authenticated;
