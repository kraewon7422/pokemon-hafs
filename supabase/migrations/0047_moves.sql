-- 0047: (A) 기술 넓히기 (3~7세대 실제 기술 152개 → 기술 번호 252~403, 앞 번호는 그대로) + 배우는 기술 + 기술머신52~60 + 엔진 효과 몇 개
--   만든 곳: python tools/gen_pokemon.py (기술 · 배우는 기술 · 물건) → python .work/moves/build_0047.py (이 파일)
--   엔진 (0039 의 _bt_move · _bt_ai 에 덧붙임):
--     _bt_mpow   위력이 바뀌는 기술: 일렉트릭볼 (스피드 비율) · 자이로볼 · 객기 (상태 이상이면 2배, 화상이어도 안 줄어듦) · 베놈쇼크 (독이면 2배)
--                · 소금물 (상대 HP 절반 이하 2배) · 애크러뱃 (지닌 물건 없으면 2배) · 물수리검 (지우개굴닌자 = 위력 20)
--     bond       물수리검 + 지우개굴닌자 (계열 441) = 반드시 3번 (보통은 2~5번, 선공 +1)
--     fixed      고정 데미지 (나이트헤드 · 지구던지기 = 레벨, 용의분노 40, 소닉붐 20) — 상성 · 급소 · 자속 없음, 효과 없음 (고스트/노말) 만
--     vs_def     특수 기술이지만 상대 방어로 계산 (사이코쇼크 · 사이코브레이크)
--     ignore_stg 상대의 방어 · 회피 랭크 무시 (야금야금 · DD래리어트), ignore_ab 상대 특성 무시 (메테오드라이브 · 섀도레이)
--     crash      점프킥: 빗나가거나 막히거나 효과가 없으면 최대 HP 절반 반동
--   2턴 기술 (공중날기 · 솔라빔 · 구멍파기 …), 일격필살, 묶기 (김밥말이 · 회오리불꽃 …), 무게 · 날씨 · 물건 조건 기술은 넣지 않음.
--   고르는 기본 기술 4개 (species_moves) 는 예전 그대로 — 이벤트 포켓몬 2마리만: 지우개굴닌자 파도타기 → 물수리검, 지우의 피카츄 번개 → 일렉트릭볼
--   (이미 받은 학생의 기술도 바꿈). 실전: 이 파일 다음에 supabase/seed_pokemon.sql 을 다시 실행해도 같은 결과.
-- 0047: (B) 이로치 레이드 — raids.shiny + admin_create_raid(…, p_shiny boolean default false) → 보상이 반드시 반짝 (아래 B 부분)


-- 0047: 위력이 바뀌는 기술 (기술 위력 p → 이번에 쓸 위력). _bt_move · _bt_ai 가 같이 씀
create or replace function public._bt_mpow(st jsonb, a jsonb, d jsonb, p int, e jsonb) returns int
language sql immutable set search_path = '' as $$
  select case
    when e ? 'bond' and (a ->> 'line')::int = (e -> 'bond' ->> 'line')::int then (e -> 'bond' ->> 'power')::int     -- 물수리검 + 지우개굴닌자 = 20
    when e ->> 'spd_pow' = 'electro' then                       -- 일렉트릭볼: 내 스피드 / 상대 스피드 ≥4 150 · ≥3 120 · ≥2 80 · ≥1 60 · 그 밖 40
      (select case when r >= 4 then 150 when r >= 3 then 120 when r >= 2 then 80 when r >= 1 then 60 else 40 end
         from (select public._bt_spe(st, a) / greatest(1, public._bt_spe(st, d)) as r) x)
    when e ->> 'spd_pow' = 'gyro' then                          -- 자이로볼: 25 × 상대 스피드 / 내 스피드 + 1 (최대 150)
      least(150, floor(25 * public._bt_spe(st, d) / greatest(1, public._bt_spe(st, a)))::int + 1)
    when e ->> 'double_if' = 'self_st' and a ->> 'st' in ('brn', 'par', 'psn') then p * 2                     -- 객기
    when e ->> 'double_if' = 'foe_psn' and d ->> 'st' = 'psn' then p * 2                                      -- 베놈쇼크
    when e ->> 'double_if' = 'foe_half' and (d ->> 'hp')::int * 2 <= (d ->> 'max')::int then p * 2            -- 소금물
    when e ->> 'double_if' = 'no_item' and (coalesce(a ->> 'held', '') = '' or coalesce((a ->> 'used')::boolean, false)) then p * 2  -- 애크러뱃
    else coalesce(p, 0) end
$$;

-- 0047: 점프킥 (crash): 빗나가거나 막히면 최대 HP 의 crash% 만큼 반동 (매직가드는 안 받음)
create or replace function public._bt_crash(inout a jsonb, inout lg jsonb, e jsonb, u int, aw text)
language plpgsql immutable set search_path = '' as $$
begin
  if not coalesce(e, '{}') ? 'crash' or (a ->> 'hp')::int <= 0 or coalesce(a ->> 'ab', '') = 'magic-guard' then return; end if;
  a := jsonb_set(a, '{hp}', to_jsonb(greatest(0, (a ->> 'hp')::int - greatest(1, (a ->> 'max')::int * (e ->> 'crash')::int / 100))));
  lg := lg || jsonb_build_object('m', aw || ' 의욕이 넘쳐서 땅에 부딪쳤다!', 'hp', jsonb_build_array(u, (a ->> 'hp')::int));
  if (a ->> 'hp')::int <= 0 then lg := lg || jsonb_build_object('m', aw || ' 쓰러졌다!', 'faint', u); end if;
end $$;

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
    dab := case when aab in ('mold-breaker', 'turboblaze', 'teravolt') or e ? 'ignore_ab' then null else dab0 end;   -- 틀깨기: 상대 특성을 무시
    if fl -> 'prot' ? tu::text then
      lg := lg || jsonb_build_object('m', dw || ' 공격으로부터 몸을 지켰다!');
      select * into a, lg from public._bt_crash(a, lg, e, u, aw);
      st := public._bt_setm(st, u, a); return;
    end if;
    -- 사이코필드: 땅에 있는 상대에게는 선공기가 통하지 않음
    if ter = 'psychic' and coalesce(mv.priority, 0) > 0 and public._bt_grounded(d) then
      lg := lg || jsonb_build_object('m', dw || ' 사이코필드에 보호받고 있다!'); st := public._bt_setm(st, u, a); return;
    end if;
    -- 명중: 기술 명중 × (내 명중 랭크 − 상대 회피 랭크) × 광각렌즈 × 특성 (복안 · 의욕 · 모래숨기 · 눈숨기). 노가드 = 반드시 맞음
    if mv.accuracy is not null and not (coalesce(aab, '') = 'no-guard' or coalesce(dab0, '') = 'no-guard') then
      acc := mv.accuracy * public._bt_sm(greatest(-6, least(6, coalesce((a -> 'stg' ->> 'acc')::int, 0) - case when e ? 'ignore_stg' then 0 else coalesce((d -> 'stg' ->> 'eva')::int, 0) end)), true)
             * coalesce((a -> 'hold' ->> 'acc')::numeric / 100, 1)
             * case when aab = 'compound-eyes' then 1.3 else 1 end
             * case when aab = 'hustle' and mv.category = 'physical' then 0.8 else 1 end
             * case when (dab = 'sand-veil' and wx = 'sand') or (dab = 'snow-cloak' and wx = 'hail') then 0.8 else 1 end;
      if public._bt_rnd(st) * 100 >= acc then
        lg := lg || jsonb_build_object('m', case when mv.kind = 'attack' then '그러나 ' || an || '의 공격은 빗나갔다!' else '그러나 빗나갔다!' end);
        select * into a, lg from public._bt_crash(a, lg, e, u, aw);
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
      lg := lg || jsonb_build_object('m', dn || '에게는 효과가 없는 것 같다...');
      select * into a, lg from public._bt_crash(a, lg, e, u, aw);
      st := public._bt_setm(st, u, a); return;
    end if;
    if e ? 'fixed' then mult := 1; end if;          -- 0047: 고정 데미지 (나이트헤드 · 지구던지기 · 용의분노 · 소닉붐) = 상성 무시 (효과 없음만 봄)
    mv.power := public._bt_mpow(st, a, d, mv.power, e);   -- 0047: 일렉트릭볼 · 자이로볼 · 객기 · 베놈쇼크 · 소금물 · 애크러뱃 · 물수리검(지우개굴닌자)
    contact := mv.category = 'physical';            -- 접촉 = 물리 기술 (이 게임의 약속)
    pw := mv.power * mf * public._bt_pw(st, a, d, dab, mv.type, mv.category, mv.name, mv.power, e);
    nh := case when e ? 'bond' and (a ->> 'line')::int = (e -> 'bond' ->> 'line')::int then (e -> 'bond' ->> 'hits')::int
               when not e ? 'hits' then 1 when (e ->> 'hits')::int in (2, 3) then (e ->> 'hits')::int
               when aab = 'skill-link' then 5
               else (array[2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5])[1 + floor(random() * 20)::int] end;
    cs := case when coalesce((e ->> 'high_crit')::boolean, false) then 1 else 0 end + coalesce((a -> 'hold' ->> 'crit')::int, 0)
          + case when aab = 'super-luck' then 1 else 0 end;
    for j in 1 .. nh loop
      exit when (d ->> 'hp')::int <= 0;
      if e ? 'fixed' then
        crit := false;
        dmg := case when e ->> 'fixed' = 'lv' then lv else (e ->> 'fixed')::int end;
      else
      crit := case when sim ? 'crit' then (sim ->> 'crit')::boolean
                   else coalesce((e ->> 'always_crit')::boolean, false)
                        or coalesce((sim ->> 'crit_r')::numeric, random()::numeric) < case cs when 0 then 0.0625 when 1 then 0.125 else 0.25 end end
              and coalesce(dab, '') not in ('battle-armor', 'shell-armor');
      if mv.category = 'physical' then ak := 'atk'; dk := 'def'; else ak := 'spa'; dk := case when e ? 'vs_def' then 'def' else 'spd' end; end if;
      tmp := coalesce((a -> 'stg' ->> ak)::int, 0);
      at := (a ->> ak)::int * public._bt_sm(case when crit then greatest(0, tmp) else tmp end)
            * case when ak = 'atk' and aab in ('huge-power', 'pure-power') then 2 else 1 end
            * case when ak = 'atk' and aab = 'guts' and (a ->> 'st') is not null then 1.5 else 1 end
            * case when ak = 'atk' and aab = 'hustle' then 1.5 else 1 end
            * case when ak = 'spa' and aab = 'solar-power' and wx = 'sun' then 1.5 else 1 end;
      tmp := case when e ? 'ignore_stg' then 0 else coalesce((d -> 'stg' ->> dk)::int, 0) end;
      df := (d ->> dk)::int * public._bt_sm(case when crit then least(0, tmp) else tmp end)
            * case when dk = 'def' and dab = 'marvel-scale' and (d ->> 'st') is not null then 1.5 else 1 end
            * case when dk = 'def' and dab = 'fur-coat' then 2 else 1 end
            * case when dk = 'spd' and wx = 'sand' and public._bt_hastype(d, '바위') then 1.5 else 1 end;
      dmg := floor(floor(floor(2 * lv / 5 + 2) * pw * floor(at) / greatest(1, floor(df))) / 50);
      if mv.category = 'physical' and a ->> 'st' = 'brn' and coalesce(aab, '') <> 'guts' and coalesce(e ->> 'double_if', '') <> 'self_st' then dmg := floor(dmg / 2); end if;
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
      end if;
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

create or replace function public._bt_ai(st jsonb, u int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s int := u / 2; o int := 1 - u / 2;
  a jsonb := public._bt_m(st, u); d jsonb;
  mv public.moves; e jsonb; i int; k int; sc numeric; best numeric := -1; pick int := 1; tgt int := 0; est numeric; ratio numeric;
  hp numeric := (a ->> 'hp')::numeric / (a ->> 'max')::numeric; key text; first_k int; dab text; mt numeric; p0 int;
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
        p0 := public._bt_mpow(st, a, d, mv.power, e);     -- 0047: 바뀌는 위력
        ratio := case when mv.category = 'physical' then public._bt_eff(a, 'atk') / greatest(1, public._bt_eff(d, 'def'))
                      else public._bt_eff(a, 'spa') / greatest(1, public._bt_eff(d, case when e ? 'vs_def' then 'def' else 'spd' end)) end;
        est := ((2 * coalesce((a ->> 'lv')::int, 50) / 5 + 2) * p0 * ratio / 50 + 2) * mt
               * case when mv.type = any (string_to_array(a ->> 'type', '/')) then case when a ->> 'ab' = 'adaptability' then 2 else 1.5 end else 1 end
               * coalesce(mv.accuracy, 100) / 100.0 * 0.925
               * case when mv.category = 'physical' and a ->> 'st' = 'brn' and coalesce(a ->> 'ab', '') <> 'guts' then 0.5 else 1 end
               * case when e ? 'bond' and (a ->> 'line')::int = (e -> 'bond' ->> 'line')::int then (e -> 'bond' ->> 'hits')::int
                      when e ? 'hits' then case when (e ->> 'hits')::int in (2, 3) then (e ->> 'hits')::int else 3.1 end else 1 end
               * public._bt_pw(st, a, d, dab, mv.type, mv.category, mv.name, p0, e)
               * case when mv.accuracy is null then 1 else public._bt_sm(-coalesce((d -> 'stg' ->> 'eva')::int, 0), true) end
               * case when public._bt_absorb(dab, mv.type, mv.kind, mt) is not null then 0 else 1 end;
        if e ? 'fixed' then   -- 0047: 고정 데미지
          est := case when mt = 0 then 0 when e ->> 'fixed' = 'lv' then coalesce((a ->> 'lv')::int, 50) else (e ->> 'fixed')::int end * coalesce(mv.accuracy, 100) / 100.0;
        end if;
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

-- ── 데이터 ──
insert into public.moves (id, name, type, category, kind, power, accuracy, pp, priority, effect, description) values
 (219, '사이코쇼크', '에스퍼', 'special', 'attack', 80, 100, 10, 0, '{"vs_def": true}', '신비한 염동력을 실체화하여 상대를 공격한다. 물리적인 데미지를 준다.'),
 (252, '연속뺨치기', '노말', 'physical', 'attack', 15, 85, 10, 0, '{"hits": 5}', '연속 뺨치기로 상대를 때려서 공격한다. 2-5회 동안 연속으로 쓴다.'),
 (253, '메가톤펀치', '노말', 'physical', 'attack', 80, 85, 20, 0, '{}', '힘을 담은 펀치로 상대를 공격한다.'),
 (254, '찝기', '노말', 'physical', 'attack', 55, 100, 30, 0, '{}', '상대를 양쪽에서 집어서 데미지를 준다.'),
 (255, '풀베기', '노말', 'physical', 'attack', 50, 95, 30, 0, '{}', '낫이나 발톱 등으로 상대를 베어 공격한다.'),
 (256, '힘껏치기', '노말', 'physical', 'attack', 80, 75, 20, 0, '{}', '긴 꼬리나 덩굴 등을 사용해 상대를 힘껏 쳐서 공격한다.'),
 (257, '짓밟기', '노말', 'physical', 'attack', 65, 100, 20, 0, '{"flinch": 30}', '큰 발로 상대를 짓밟아서 공격한다. 상대를 풀죽게 만들 때가 있다. (풀죽음 30% 확률)'),
 (258, '메가톤킥', '노말', 'physical', 'attack', 120, 75, 5, 0, '{}', '굉장한 힘을 담은 킥으로 상대를 걷어차서 공격한다.'),
 (259, '점프킥', '격투', 'physical', 'attack', 100, 95, 10, 0, '{"crash": 50}', '높이 점프해서 킥으로 상대를 공격한다. 빗나가면 자신이 데미지를 입는다.'),
 (260, '돌려차기', '격투', 'physical', 'attack', 60, 85, 15, 0, '{"flinch": 30}', '몸을 재빨리 회전시키며 걷어차서 공격한다. 상대를 풀죽게 만들 때가 있다. (풀죽음 30% 확률)'),
 (261, '뿔찌르기', '노말', 'physical', 'attack', 65, 100, 25, 0, '{}', '날카롭고 뾰족한 뿔로 상대를 공격한다.'),
 (262, '더블니들', '벌레', 'physical', 'attack', 25, 100, 20, 0, '{"foe_status": "psn", "chance": 20, "hits": 2}', '2개의 침을 상대에게 꿰찔러 2회 연속으로 데미지를 준다. 독 상태로 만들 때가 있다. (20% 확률)'),
 (263, '초음파', '노말', 'status', 'status', 0, 55, 20, 0, '{"foe_status": "cnf"}', '특수한 음파를 몸에서 발산하여 상대를 혼란시킨다.'),
 (264, '소닉붐', '노말', 'special', 'attack', 0, 90, 20, 0, '{"fixed": 20}', '충격파를 상대에 부딪쳐서 공격한다. 언제나 20의 데미지를 준다.'),
 (265, '지옥의바퀴', '격투', 'physical', 'attack', 80, 80, 20, 0, '{"recoil": 4}', '땅에 자신과 함께 상대를 내던져 공격한다. 자신도 조금 데미지를 입는다.'),
 (266, '지구던지기', '격투', 'physical', 'attack', 0, 100, 20, 0, '{"fixed": "lv"}', '인력을 사용해 내던진다. 자신의 레벨과 똑같은 데미지를 상대에게 준다.'),
 (267, '괴력', '노말', 'physical', 'attack', 80, 100, 15, 0, '{}', '혼신의 힘으로 상대를 세게 때려서 공격한다.'),
 (268, '흡수', '풀', 'special', 'attack', 20, 100, 25, 0, '{"drain": 50}', '양분을 흡수하여 공격한다. 상대에게 입힌 데미지의 절반에 해당하는 HP를 회복할 수 있다.'),
 (269, '용의분노', '드래곤', 'special', 'attack', 0, 100, 10, 0, '{"fixed": 40}', '분노의 충격파를 상대에게 부딪쳐서 공격한다. 언제나 40의 데미지를 준다.'),
 (270, '요가포즈', '에스퍼', 'status', 'status', 0, null, 40, 0, '{"self": {"atk": 1}}', '잠들어 있는 힘을 몸속에서 끌어내어 자신의 공격을 올린다.'),
 (271, '나이트헤드', '고스트', 'special', 'attack', 0, 100, 15, 0, '{"fixed": "lv"}', '무시무시한 환상을 보게 해서 자신의 레벨과 똑같은 만큼의 데미지를 상대에게 준다.'),
 (272, '단단해지기', '노말', 'status', 'defense', 0, null, 30, 0, '{"self": {"def": 1}}', '전신에 힘을 담아 몸을 단단하게 해서 자신의 방어를 올린다.'),
 (273, '껍질에숨기', '물', 'status', 'defense', 0, null, 40, 0, '{"self": {"def": 1}}', '껍질에 숨어 몸을 보호하여 자신의 방어를 올린다.'),
 (274, '배리어', '에스퍼', 'status', 'defense', 0, null, 20, 0, '{"self": {"def": 2}}', '튼튼한 장막을 만들어 자신의 방어를 크게 올린다.'),
 (275, '알폭탄', '노말', 'physical', 'attack', 100, 75, 10, 0, '{}', '큰 알을 온 힘을 다해 상대에게 내던져서 공격한다.'),
 (276, '오물공격', '독', 'special', 'attack', 65, 100, 20, 0, '{"foe_status": "psn", "chance": 30}', '더러운 오물을 상대에게 내던져서 공격한다. 독 상태로 만들 때가 있다. (30% 확률)'),
 (277, '뼈다귀치기', '땅', 'physical', 'attack', 65, 85, 20, 0, '{"flinch": 10}', '손에 들고 있는 뼈로 상대를 세게 때려서 공격한다. 상대를 풀죽게 만들 때가 있다. (풀죽음 10% 확률)'),
 (278, '가시대포', '노말', 'physical', 'attack', 20, 100, 15, 0, '{"hits": 5}', '날카로운 침을 상대에게 발사해서 공격한다. 2-5회 동안 연속으로 쓴다.'),
 (279, '휘감기', '노말', 'physical', 'attack', 10, 100, 35, 0, '{"foe": {"spe": -1}, "chance": 10}', '촉수나 덩굴 등을 휘감아서 공격한다. 상대의 스피드를 떨어뜨릴 때가 있다. (10% 확률)'),
 (280, '숟가락휘기', '에스퍼', 'status', 'status', 0, 80, 15, 0, '{"foe": {"acc": -1}}', '숟가락을 휘어서 주의를 끌어 상대의 명중률을 낮춘다.'),
 (281, '알낳기', '노말', 'status', 'defense', 0, null, 5, 0, '{"heal": 50}', '자신의 최대 HP 절반을 회복한다.'),
 (282, '뱀눈초리', '노말', 'status', 'status', 0, 100, 30, 0, '{"foe_status": "par"}', '배의 무늬로 겁을 주어 상대를 마비 상태로 만든다.'),
 (283, '독가스', '독', 'status', 'status', 0, 90, 40, 0, '{"foe_status": "psn"}', '독가스를 상대의 얼굴에 내뿜어 독 상태로 만든다.'),
 (284, '구슬던지기', '노말', 'physical', 'attack', 15, 85, 20, 0, '{"hits": 5}', '둥근 것을 상대에게 내던져서 공격한다. 2-5회 동안 연속으로 쓴다.'),
 (285, '악마의키스', '노말', 'status', 'status', 0, 75, 10, 0, '{"foe_status": "slp"}', '무서운 얼굴로 키스한다. 상대를 잠듦 상태로 만든다.'),
 (286, '거품', '물', 'special', 'attack', 40, 100, 30, 0, '{"foe": {"spe": -1}, "chance": 10}', '매우 많은 거품을 상대에게 내뿜어 공격한다. 상대의 스피드를 떨어뜨릴 때가 있다. (10% 확률)'),
 (287, '잼잼펀치', '노말', 'physical', 'attack', 70, 100, 10, 0, '{"foe_status": "cnf", "chance": 20}', '리드미컬한 펀치를 날려 상대를 공격한다. 혼란시킬 때가 있다. (20% 확률)'),
 (288, '마구할퀴기', '노말', 'physical', 'attack', 18, 80, 15, 0, '{"hits": 5}', '손톱이나 낫 등으로 상대를 할퀴어서 공격한다. 2-5회 동안 연속으로 쓴다.'),
 (289, '뼈다귀부메랑', '땅', 'physical', 'attack', 50, 90, 10, 0, '{"hits": 2}', '손에 들고 있는 뼈를 상대에게 날려서 날아갈 때와 돌아올 때 2회 연속 데미지를 준다.'),
 (290, '필살앞니', '노말', 'physical', 'attack', 80, 90, 15, 0, '{"flinch": 10}', '날카로운 앞니로 강하게 물어서 공격한다. 상대를 풀죽게 만들 때가 있다. (풀죽음 10% 확률)'),
 (291, '각지기', '노말', 'status', 'status', 0, null, 30, 0, '{"self": {"atk": 1}}', '몸의 각을 늘려서 더욱 각지게 하여 자신의 공격을 올린다.'),
 (292, '목화포자', '풀', 'status', 'status', 0, 100, 40, 0, '{"foe": {"spe": -2}}', '솜처럼 폭신폭신한 포자를 착 달라붙게 해서 상대의 스피드를 크게 떨어뜨린다.'),
 (293, '겁나는얼굴', '노말', 'status', 'status', 0, 100, 10, 0, '{"foe": {"spe": -2}}', '무서운 얼굴로 노려보고 겁주어 상대의 스피드를 크게 떨어뜨린다.'),
 (294, '얼어붙은바람', '얼음', 'special', 'attack', 55, 95, 15, 0, '{"foe": {"spe": -1}, "chance": 100}', '차가운 냉기를 상대에게 내뿜어 공격한다. 상대의 스피드를 떨어뜨린다.'),
 (295, '달콤한향기', '노말', 'status', 'status', 0, 100, 20, 0, '{"foe": {"eva": -2}}', '향기로 상대의 회피율을 크게 떨어뜨린다.'),
 (296, '달빛', '페어리', 'status', 'defense', 0, null, 5, 0, '{"heal": 50}', '자신의 HP를 회복한다. 날씨에 따라 회복량이 변한다.'),
 (297, '객기', '노말', 'physical', 'attack', 70, 100, 20, 0, '{"double_if": "self_st"}', '자신이 독, 마비, 화상 상태일 때 날리면 기술의 위력이 2배가 된다.'),
 (298, '엄청난힘', '격투', 'physical', 'attack', 120, 100, 5, 0, '{"self": {"atk": -1, "def": -1}, "chance": 100}', '엄청난 힘을 발휘하여 상대를 공격한다. 자신의 공격과 방어가 떨어진다.'),
 (299, '손바닥치기', '격투', 'physical', 'attack', 15, 100, 20, 0, '{"hits": 5}', '펼친 양손으로 상대를 번갈아 쳐서 공격한다. 2-5회 동안 연속으로 쓴다.'),
 (300, '반딧불', '벌레', 'status', 'status', 0, null, 20, 0, '{"self": {"spa": 3}}', '깜빡거리는 빛을 바라보고 자신의 정신을 통일하여 특수공격을 매우 크게 올린다.'),
 (301, '러스터퍼지', '에스퍼', 'special', 'attack', 95, 100, 5, 0, '{"foe": {"spd": -1}, "chance": 50}', '눈부신 빛을 발산하여 공격한다. 상대의 특수방어를 떨어뜨릴 때가 있다. (50% 확률)'),
 (302, '미스트볼', '에스퍼', 'special', 'attack', 95, 100, 5, 0, '{"foe": {"spa": -1}, "chance": 50}', '안개의 깃털로 둘러싸 공격한다. 상대의 특수공격을 떨어뜨릴 때가 있다. (50% 확률)'),
 (303, '깃털댄스', '비행', 'status', 'status', 0, 100, 15, 0, '{"foe": {"atk": -2}}', '깃털을 흩뿌려 상대의 몸에 휘감는다. 상대의 공격을 크게 떨어뜨린다.'),
 (304, '흔들흔들댄스', '노말', 'status', 'status', 0, 100, 20, 0, '{"foe_status": "cnf"}', '흔들흔들 댄스를 춰서 주위에 있는 포켓몬을 혼란 상태로 만든다.'),
 (305, '블레이즈킥', '불꽃', 'physical', 'attack', 85, 90, 10, 0, '{"foe_status": "brn", "chance": 10, "high_crit": true}', '공격한 상대를 화상 상태로 만들 때가 있다. 급소에도 맞기 쉽다. (10% 확률)'),
 (306, '바늘팔', '풀', 'physical', 'attack', 60, 100, 15, 0, '{"flinch": 30}', '바늘팔을 세차게 흔들어 공격한다. 상대를 풀죽게 만들 때가 있다. (풀죽음 30% 확률)'),
 (307, '맹독엄니', '독', 'physical', 'attack', 50, 100, 15, 0, '{"foe_status": "psn", "chance": 50}', '독이 있는 이빨로 상대를 물어서 공격한다. 맹독을 주입할 때가 있다. (50% 확률)'),
 (308, '브레이크클로', '노말', 'physical', 'attack', 75, 95, 10, 0, '{"foe": {"def": -1}, "chance": 50}', '단단하고 날카로운 손톱으로 베어 갈라서 공격한다. 상대의 방어를 떨어뜨릴 때가 있다. (50% 확률)'),
 (309, '놀래키기', '고스트', 'physical', 'attack', 30, 100, 15, 0, '{"flinch": 30}', '큰 소리 등으로 불시에 놀래켜서 공격한다. 상대를 풀죽게 만들 때가 있다. (풀죽음 30% 확률)'),
 (310, '에어커터', '비행', 'special', 'attack', 60, 95, 25, 0, '{"high_crit": true}', '날카로운 바람으로 상대를 베어 공격한다. 급소에 맞기 쉽다.'),
 (311, '은빛바람', '벌레', 'special', 'attack', 60, 100, 5, 0, '{"self": {"atk": 1, "def": 1, "spa": 1, "spd": 1, "spe": 1}, "chance": 10}', '바람에 날개 가루를 날려서 상대를 공격한다. 자신의 모든 능력이 올라갈 때가 있다. (10% 확률)'),
 (312, '풀피리', '풀', 'status', 'status', 0, 55, 15, 0, '{"foe_status": "slp"}', '기분 좋은 피리 소리를 들려주어 상대를 잠듦 상태로 만든다.'),
 (313, '간지르기', '노말', 'status', 'status', 0, 100, 20, 0, '{"foe": {"atk": -1, "def": -1}}', '몸을 간질여 웃게 만들어서 상대의 공격과 방어를 떨어뜨린다.'),
 (314, '섀도펀치', '고스트', 'physical', 'attack', 60, null, 20, 0, '{}', '그림자에 섞여 펀치를 날린다. 공격은 반드시 명중한다.'),
 (315, '고드름침', '얼음', 'physical', 'attack', 25, 100, 30, 0, '{"hits": 5}', '날카로운 고드름을 상대에게 발사하여 공격한다. 2-5회 동안 연속으로 쓴다.'),
 (316, '멀리짖기', '노말', 'status', 'status', 0, null, 40, 0, '{"self": {"atk": 1}}', '큰 소리로 짖고 기합을 높여 자신의 공격을 올린다.'),
 (317, '포이즌테일', '독', 'physical', 'attack', 50, 100, 25, 0, '{"foe_status": "psn", "chance": 10, "high_crit": true}', '꼬리로 때린다. 독 상태로 만들 때가 있고 급소에도 맞기 쉽다. (10% 확률)'),
 (318, '매지컬리프', '풀', 'special', 'attack', 60, null, 20, 0, '{}', '상대를 추적하는 이상한 잎사귀를 흩뿌린다. 공격은 반드시 명중한다.'),
 (319, '암해머', '격투', 'physical', 'attack', 100, 90, 10, 0, '{"self": {"spe": -1}, "chance": 100}', '강하고 무거운 주먹을 휘둘러 데미지를 준다. 자신의 스피드가 떨어진다.'),
 (320, '자이로볼', '강철', 'physical', 'attack', 0, 100, 5, 0, '{"spd_pow": "gyro"}', '몸을 고속으로 회전시켜 몸통박치기한다. 상대보다 스피드가 낮을수록 위력은 올라간다.'),
 (321, '소금물', '물', 'special', 'attack', 65, 100, 10, 0, '{"double_if": "foe_half"}', '상대가 HP의 절반 정도 상처를 입고 있으면 기술의 위력이 2배가 된다.'),
 (322, '유턴', '벌레', 'physical', 'attack', 70, 100, 20, 0, '{}', '벌레의 힘으로 공격한다.'),
 (323, '발경', '격투', 'physical', 'attack', 60, 100, 10, 0, '{"foe_status": "par", "chance": 30}', '상대의 몸에 충격파를 부딪쳐 공격한다. 마비 상태로 만들 때가 있다. (30% 확률)'),
 (324, '번개엄니', '전기', 'physical', 'attack', 65, 95, 15, 0, '{"foe_status": "par", "flinch": 10, "chance": 10}', '전기를 모은 이빨로 문다. 상대를 풀죽게 하거나 마비 상태로 만들 때가 있다. (10% 확률)'),
 (325, '얼음엄니', '얼음', 'physical', 'attack', 65, 95, 15, 0, '{"foe_status": "frz", "flinch": 10, "chance": 10}', '냉기를 품은 이빨로 문다. 상대를 풀죽게 하거나 얼음 상태로 만들 때가 있다. (10% 확률)'),
 (326, '불꽃엄니', '불꽃', 'physical', 'attack', 65, 95, 15, 0, '{"foe_status": "brn", "flinch": 10, "chance": 10}', '불꽃을 두른 이빨로 문다. 상대를 풀죽게 하거나 화상 상태로 만들 때가 있다. (10% 확률)'),
 (327, '진흙폭탄', '땅', 'special', 'attack', 65, 85, 10, 0, '{"foe": {"acc": -1}, "chance": 30}', '단단한 진흙구슬을 상대에게 발사하여 공격한다. 명중률을 떨어뜨릴 때가 있다. (30% 확률)'),
 (328, '록클라임', '노말', 'physical', 'attack', 90, 85, 20, 0, '{"foe_status": "cnf", "chance": 20}', '굉장한 기세로 상대에게 돌진하여 공격한다. 상대를 혼란시킬 때가 있다. (20% 확률)'),
 (329, '분연', '불꽃', 'special', 'attack', 80, 100, 15, 0, '{"foe_status": "brn", "chance": 30}', '새빨간 불꽃으로 자신의 주위에 있는 포켓몬을 공격한다. 화상 상태로 만들 때가 있다. (30% 확률)'),
 (330, '파워휩', '풀', 'physical', 'attack', 120, 85, 10, 0, '{}', '덩굴이나 촉수를 세차게 흔들어 상대를 힘껏 쳐서 공격한다.'),
 (331, '암석포', '바위', 'physical', 'attack', 150, 90, 5, 0, '{"recharge": true}', '거대한 바위를 상대에게 발사하여 공격한다. 다음 턴은 움직일 수 없게 된다.'),
 (332, '마그넷봄', '강철', 'physical', 'attack', 60, null, 20, 0, '{}', '상대에게 달라붙는 강철의 폭탄을 발사한다. 공격은 반드시 명중한다.'),
 (333, '차지빔', '전기', 'special', 'attack', 50, 90, 10, 0, '{"self": {"spa": 1}, "chance": 70}', '전격의 다발을 상대에게 발사한다. 전기를 모아서 자신의 특수공격을 올릴 때가 있다. (70% 확률)'),
 (334, '공격지령', '벌레', 'physical', 'attack', 90, 100, 15, 0, '{"high_crit": true}', '부하를 불러내어 상대를 향해서 공격시킨다. 급소에 맞기 쉽다.'),
 (335, '방어지령', '벌레', 'status', 'defense', 0, null, 10, 0, '{"self": {"def": 1, "spd": 1}}', '부하를 불러내어 자신의 몸을 뒤덮게 한다. 방어와 특수방어를 올릴 수 있다.'),
 (336, '회복지령', '벌레', 'status', 'defense', 0, null, 10, 0, '{"heal": 50}', '부하를 불러내어 상처를 회복한다. 최대 HP의 절반만큼 자신의 HP를 회복한다.'),
 (337, '더블어택', '노말', 'physical', 'attack', 35, 90, 10, 0, '{"hits": 2}', '꼬리 등을 써서 상대를 때려 공격한다. 2회 연속으로 데미지를 준다.'),
 (338, '다크홀', '악', 'status', 'status', 0, 50, 10, 0, '{"foe_status": "slp"}', '암흑의 세계로 끌고 가서 떨어뜨려 상대를 잠듦 상태로 만든다.'),
 (339, '괴상한바람', '고스트', 'special', 'attack', 60, 100, 5, 0, '{"self": {"atk": 1, "def": 1, "spa": 1, "spd": 1, "spe": 1}, "chance": 10}', '소름이 끼칠 만한 돌풍으로 상대를 공격한다. 자신의 모든 능력이 올라갈 때가 있다. (10% 확률)'),
 (340, '손톱갈기', '악', 'status', 'status', 0, null, 15, 0, '{"self": {"atk": 1, "acc": 1}}', '손톱을 갈아 날카롭게 한다. 자신의 공격과 명중률을 올린다.'),
 (341, '베놈쇼크', '독', 'special', 'attack', 65, 100, 10, 0, '{"double_if": "foe_psn"}', '특수한 독액을 끼얹는다. 독 상태의 상대에게는 위력이 2배가 된다.'),
 (342, '업어후리기', '격투', 'physical', 'attack', 60, 100, 10, 0, '{"always_crit": true}', '강렬한 일격을 상대에게 날린다. 공격은 반드시 급소에 맞는다.'),
 (343, '일렉트릭볼', '전기', 'special', 'attack', 0, 100, 10, 0, '{"spd_pow": "electro"}', '전기 덩어리를 상대에게 부딪쳐서 공격한다. 상대보다 스피드가 빠를수록 위력이 올라간다.'),
 (344, '똬리틀기', '독', 'status', 'status', 0, null, 20, 0, '{"self": {"atk": 1, "def": 1, "acc": 1}}', '똬리를 틀어서 집중한다. 자신의 공격과 방어와 명중률을 올린다.'),
 (345, '로킥', '격투', 'physical', 'attack', 65, 100, 20, 0, '{"foe": {"spe": -1}, "chance": 100}', '재빠른 움직임으로 상대의 다리를 노려 공격한다. 상대의 스피드를 떨어뜨린다.'),
 (346, '애시드봄', '독', 'special', 'attack', 40, 100, 20, 0, '{"foe": {"spd": -2}, "chance": 100}', '상대를 녹이는 액체를 토해내서 공격한다. 상대의 특수방어를 크게 떨어뜨린다.'),
 (347, '야금야금', '노말', 'physical', 'attack', 70, 100, 20, 0, '{"ignore_stg": true}', '틈을 보며 착실하게 공격한다. 상대의 능력 변화에 관계없이 데미지를 준다.'),
 (348, '기어체인지', '강철', 'status', 'status', 0, null, 10, 0, '{"self": {"atk": 1, "spe": 2}}', '톱니바퀴를 돌려서 자신의 공격을 올리는 것뿐만 아니라 스피드도 크게 올린다.'),
 (349, '애크러뱃', '비행', 'physical', 'attack', 55, 100, 15, 0, '{"double_if": "no_item"}', '경쾌하게 상대를 공격한다. 자신이 도구를 지니고 있지 않을 때 큰 데미지를 준다.'),
 (350, '연옥', '불꽃', 'special', 'attack', 100, 50, 5, 0, '{"foe_status": "brn", "chance": 100}', '격렬한 불꽃으로 상대를 둘러싸 공격한다. 화상 상태로 만든다.'),
 (351, '벌레의저항', '벌레', 'special', 'attack', 50, 100, 20, 0, '{"foe": {"spa": -1}, "chance": 100}', '저항해서 상대를 공격한다. 상대의 특수공격을 떨어뜨린다.'),
 (352, '일렉트릭네트', '전기', 'special', 'attack', 55, 95, 15, 0, '{"foe": {"spe": -1}, "chance": 100}', '전기 네트로 상대를 붙잡아서 공격한다. 상대의 스피드를 떨어뜨린다.'),
 (353, '드릴라이너', '땅', 'physical', 'attack', 80, 95, 10, 0, '{"high_crit": true}', '드릴처럼 몸을 회전시켜서 상대에게 몸통박치기한다. 급소에 맞기 쉽다.'),
 (354, '더블촙', '드래곤', 'physical', 'attack', 40, 90, 15, 0, '{"hits": 2}', '몸의 단단한 부분으로 상대를 때려 공격한다. 2회 연속으로 데미지를 준다.'),
 (355, '하트스탬프', '에스퍼', 'physical', 'attack', 60, 100, 25, 0, '{"flinch": 30}', '귀여운 모습으로 방심시켜서 강렬한 일격을 날린다. 상대를 풀죽게 만들 때가 있다. (풀죽음 30% 확률)'),
 (356, '우드혼', '풀', 'physical', 'attack', 75, 100, 10, 0, '{"drain": 50}', '뿔을 꿰찔러서 상대의 양분을 흡수한다. 입힌 데미지의 절반에 해당하는 HP를 회복할 수 있다.'),
 (357, '셸블레이드', '물', 'physical', 'attack', 75, 95, 10, 0, '{"foe": {"def": -1}, "chance": 50}', '날카로운 조개껍질로 베어 공격한다. 상대의 방어를 떨어뜨릴 때가 있다. (50% 확률)'),
 (358, '그래스믹서', '풀', 'special', 'attack', 65, 90, 10, 0, '{"foe": {"acc": -1}, "chance": 50}', '날카로운 잎사귀로 상대를 둘러싸서 공격한다. 명중률을 떨어뜨릴 때가 있다. (50% 확률)'),
 (359, '하드롤러', '벌레', 'physical', 'attack', 65, 100, 20, 0, '{"flinch": 30}', '둥글게 뭉친 몸을 회전하여 상대를 뭉개 버린다. 상대를 풀죽게 만들 때가 있다. (풀죽음 30% 확률)'),
 (360, '코튼가드', '풀', 'status', 'defense', 0, null, 10, 0, '{"self": {"def": 3}}', '푹신푹신한 솜털로 자신의 몸을 둘러싸서 지킨다. 방어를 매우 크게 올린다.'),
 (361, '나이트버스트', '악', 'special', 'attack', 85, 95, 10, 0, '{"foe": {"acc": -1}, "chance": 40}', '암흑의 충격파를 날려서 상대를 공격한다. 명중률을 떨어뜨릴 때가 있다. (40% 확률)'),
 (362, '사이코브레이크', '에스퍼', 'special', 'attack', 100, 100, 10, 0, '{"vs_def": true}', '이상한 염력파를 실체화하여 상대를 공격한다. 물리적인 데미지를 준다.'),
 (363, '아프로브레이크', '노말', 'physical', 'attack', 120, 100, 15, 0, '{"recoil": 4}', '굉장한 아프로 머리로 상대에게 돌진하여 공격한다. 자신도 조금 데미지를 입는다.'),
 (364, '기어소서', '강철', 'physical', 'attack', 50, 85, 15, 0, '{"hits": 2}', '강철의 기어를 상대에게 던져서 공격한다. 2회 연속으로 데미지를 준다.'),
 (365, '화염탄', '불꽃', 'special', 'attack', 100, 100, 5, 0, '{"foe_status": "brn", "chance": 30}', '새빨간 불꽃으로 자신의 주위에 있는 포켓몬을 공격한다. 화상 상태로 만들 때가 있다. (30% 확률)'),
 (366, '얼어붙은세계', '얼음', 'special', 'attack', 65, 95, 10, 0, '{"foe": {"spe": -1}, "chance": 100}', '차가운 냉기를 상대에게 내뿜어 공격한다. 상대의 스피드를 떨어뜨린다.'),
 (367, '불꽃춤', '불꽃', 'special', 'attack', 80, 100, 10, 0, '{"self": {"spa": 1}, "chance": 50}', '불꽃을 두른 날개를 쳐서 공격한다. 자신의 특수공격이 오를 때가 있다. (50% 확률)'),
 (368, '부르짖기', '노말', 'status', 'status', 0, 100, 30, 0, '{"foe": {"atk": -1, "spa": -1}}', '우렁차게 부르짖어서 상대를 위협하여 상대의 공격과 특수공격을 떨어뜨린다.'),
 (369, '파라볼라차지', '전기', 'special', 'attack', 65, 100, 20, 0, '{"drain": 50}', '주위에 있는 모든 포켓몬에게 데미지를 준다. 준 데미지의 절반을 자신이 회복한다.'),
 (370, '꽃보라', '풀', 'physical', 'attack', 90, 100, 15, 0, '{}', '세찬 꽃보라를 일으켜서 주위에 있는 포켓몬을 공격하여 데미지를 준다.'),
 (371, '폭음파', '노말', 'special', 'attack', 140, 100, 10, 0, '{}', '무시무시한 폭음의 파괴력으로 주위에 있는 포켓몬을 공격한다.'),
 (372, '친해지기', '노말', 'status', 'status', 0, null, 20, 0, '{"foe": {"atk": -1}}', '상대와 친해져서 싸울 마음을 잃게 하여 상대의 공격을 떨어뜨린다.'),
 (373, '다이아스톰', '바위', 'physical', 'attack', 100, 95, 5, 0, '{"self": {"def": 2}, "chance": 50}', '다이아 폭풍을 일으켜 데미지를 준다. 자신의 방어를 크게 올릴 때가 있다. (50% 확률)'),
 (374, '스팀버스트', '물', 'special', 'attack', 110, 95, 5, 0, '{"foe_status": "brn", "chance": 30}', '상대에게 굉장히 뜨거운 증기를 뿜는다. 상대는 화상을 입기도 한다. (30% 확률)'),
 (375, '물수리검', '물', 'special', 'attack', 15, 100, 20, 1, '{"hits": 5, "bond": {"line": 441, "hits": 3, "power": 20}}', '점액으로 만든 수리검을 2-5회 동안 연속으로 던진다. 반드시 선제공격할 수 있다. 지우개굴닌자가 쓰면 위력 20으로 반드시 3번 공격한다.'),
 (376, '매지컬플레임', '불꽃', 'special', 'attack', 75, 100, 10, 0, '{"foe": {"spa": -1}, "chance": 100}', '입에서 내뱉는 아주 뜨거운 불꽃으로 공격한다. 상대의 특수공격을 떨어뜨린다.'),
 (377, '괴전파', '전기', 'status', 'status', 0, 100, 15, 0, '{"foe": {"spa": -2}}', '몸에서 괴전파를 내어 상대에게 쏨으로써 특수공격을 크게 떨어뜨린다.'),
 (378, '초롱초롱눈동자', '페어리', 'status', 'status', 0, 100, 30, 1, '{"foe": {"atk": -1}}', '초롱초롱한 눈동자로 상대를 바라보며 공격을 떨어뜨린다. 반드시 선제공격할 수 있다.'),
 (379, '볼부비부비', '전기', 'physical', 'attack', 20, 100, 20, 0, '{"foe_status": "par", "chance": 100}', '전기가 흐르는 볼을 비벼서 공격한다. 상대를 마비 상태로 만든다.'),
 (380, '그로우펀치', '격투', 'physical', 'attack', 40, 100, 20, 0, '{"self": {"atk": 1}, "chance": 100}', '반복하여 때리면 점점 주먹이 단단해진다. 상대를 때리면 공격이 오른다.'),
 (381, '데스윙', '비행', 'special', 'attack', 80, 100, 10, 0, '{"drain": 75}', '조준한 상대로부터 HP를 흡수한다. 준 데미지의 반 이상 HP를 회복한다.'),
 (382, '그라운드포스', '땅', 'physical', 'attack', 90, 100, 10, 0, '{}', '대지의 힘을 모으고 그 힘을 상대에게 집중시켜서 데미지를 준다.'),
 (383, '그림자꿰매기', '고스트', 'physical', 'attack', 80, 100, 10, 0, '{}', '그림자로 공격한다.'),
 (384, 'DD래리어트', '악', 'physical', 'attack', 85, 100, 10, 0, '{"ignore_stg": true}', '양팔을 돌려 상대에 부딪친다. 상대의 능력 변화에 상관없이 데미지를 준다.'),
 (385, '아이스해머', '얼음', 'physical', 'attack', 100, 90, 10, 0, '{"self": {"spe": -1}, "chance": 100}', '강하고 무거운 주먹을 휘둘러 데미지를 준다. 자신의 스피드가 떨어진다.'),
 (386, '10만마력', '땅', 'physical', 'attack', 95, 95, 10, 0, '{}', '온몸을 써서 상대에게 맹렬히 어택한다.'),
 (387, '나뭇잎', '풀', 'physical', 'attack', 40, 100, 40, 0, '{}', '잎을 상대에 맞춰 공격한다.'),
 (388, '지옥찌르기', '악', 'physical', 'attack', 80, 100, 15, 0, '{}', '어둠의 힘으로 공격한다.'),
 (389, '꽃가루경단', '벌레', 'special', 'attack', 90, 100, 15, 0, '{}', '벌레의 힘으로 공격한다.'),
 (390, '앵커샷', '강철', 'physical', 'attack', 80, 100, 20, 0, '{}', '강철로 공격한다.'),
 (391, '덤벼들기', '벌레', 'physical', 'attack', 80, 100, 15, 0, '{"foe": {"atk": -1}, "chance": 100}', '전력으로 상대에게 덤벼들며 공격한다. 상대의 공격을 떨어뜨린다.'),
 (392, '불꽃채찍', '불꽃', 'physical', 'attack', 80, 100, 15, 0, '{"foe": {"def": -1}, "chance": 100}', '불타는 채찍으로 상대를 친다. 공격을 받은 상대는 방어가 떨어진다.'),
 (393, '스마트혼', '강철', 'physical', 'attack', 70, null, 10, 0, '{}', '뾰족한 뿔로 상대를 꿰찔러서 공격한다. 공격은 반드시 명중한다.'),
 (394, '트로피컬킥', '풀', 'physical', 'attack', 70, 100, 15, 0, '{"foe": {"atk": -1}, "chance": 100}', '남쪽 나라에서 유래된 뜨거운 킥을 상대에게 날린다. 상대의 공격을 떨어뜨린다.'),
 (395, '스케일노이즈', '드래곤', 'special', 'attack', 110, 100, 5, 0, '{"self": {"def": -1}, "chance": 100}', '전신의 비늘을 비벼서 큰 소리를 내 공격한다. 공격 후 자신의 방어가 떨어진다.'),
 (396, '세차게휘두르기', '악', 'physical', 'attack', 60, 100, 20, 0, '{}', '자신의 몸을 세차게 휘둘러서 상대에게 데미지를 준다.'),
 (397, '액셀록', '바위', 'physical', 'attack', 40, 100, 20, 1, '{}', '재빠른 스피드로 상대에게 부딪쳐서 공격한다. 반드시 선제공격할 수 있다.'),
 (398, '프리즘레이저', '에스퍼', 'special', 'attack', 160, 100, 10, 0, '{"recharge": true}', '프리즘의 힘으로 강력한 광선을 발사한다. 다음 턴은 움직일 수 없다.'),
 (399, '메테오드라이브', '강철', 'physical', 'attack', 100, 100, 5, 0, '{"ignore_ab": true}', '유성 같은 기세로 돌진한다. 상대의 특성을 무시하고 공격할 수 있다.'),
 (400, '섀도레이', '고스트', 'special', 'attack', 100, 100, 5, 0, '{"ignore_ab": true}', '괴상한 광선을 쏘아 공격한다. 상대의 특성을 무시하고 공격할 수 있다.'),
 (401, '눈물그렁그렁', '노말', 'status', 'status', 0, null, 20, 0, '{"foe": {"atk": -1, "spa": -1}}', '눈물을 그렁그렁거려 상대의 전의를 상실하게 한다. 상대의 공격과 특수공격이 떨어진다.'),
 (402, '찌리리따끔따끔', '전기', 'physical', 'attack', 80, 100, 10, 0, '{"flinch": 30}', '상대에게 부딪쳐 강력한 전기를 날려서 찌리리따끔따끔하게 만든다. 상대를 풀죽게 만들 때가 있다. (풀죽음 30% 확률)'),
 (403, '포톤가이저', '에스퍼', 'special', 'attack', 100, 100, 5, 0, '{}', '빛의 기둥으로 공격한다. 공격과 특수공격을 비교해서 높은 쪽으로 데미지를 준다.')
on conflict (id) do update set name = excluded.name, type = excluded.type, category = excluded.category, kind = excluded.kind, power = excluded.power, accuracy = excluded.accuracy, pp = excluded.pp, priority = excluded.priority, effect = excluded.effect, description = excluded.description;

insert into public.learnset (line_id, move_id, lv, how) values
(1, 280, 1, 'level'),
(1, 297, 0, 'tm'),
(1, 333, 0, 'tm'),
(2, 318, 17, 'level'),
(2, 297, 0, 'tm'),
(2, 333, 0, 'tm'),
(2, 345, 0, 'tm'),
(3, 303, 25, 'level'),
(3, 297, 0, 'tm'),
(3, 322, 0, 'tm'),
(4, 271, 15, 'level'),
(4, 314, 1, 'level'),
(4, 297, 0, 'tm'),
(4, 341, 0, 'tm'),
(5, 332, 11, 'level'),
(5, 274, 1, 'level'),
(5, 264, 17, 'level'),
(5, 343, 29, 'level'),
(5, 320, 47, 'level'),
(5, 263, 1, 'level'),
(5, 297, 0, 'tm'),
(5, 333, 0, 'tm'),
(5, 320, 0, 'tm'),
(6, 293, 35, 'level'),
(6, 319, 1, 'level'),
(6, 297, 0, 'tm'),
(6, 320, 0, 'tm'),
(7, 272, 1, 'level'),
(7, 297, 0, 'tm'),
(7, 396, 0, 'tm'),
(7, 393, 0, 'tm'),
(8, 364, 16, 'level'),
(8, 348, 48, 'level'),
(8, 254, 1, 'level'),
(8, 333, 25, 'level'),
(8, 297, 0, 'tm'),
(8, 333, 0, 'tm'),
(9, 353, 45, 'level'),
(9, 297, 0, 'tm'),
(9, 322, 0, 'tm'),
(10, 309, 7, 'level'),
(10, 307, 25, 'level'),
(10, 341, 37, 'level'),
(10, 349, 31, 'level'),
(10, 310, 19, 'level'),
(10, 263, 5, 'level'),
(10, 268, 1, 'level'),
(10, 297, 0, 'tm'),
(10, 322, 0, 'tm'),
(10, 341, 0, 'tm'),
(10, 349, 0, 'tm'),
(11, 297, 0, 'tm'),
(12, 379, 29, 'level'),
(12, 343, 13, 'level'),
(12, 372, 7, 'level'),
(12, 256, 37, 'level'),
(12, 297, 0, 'tm'),
(12, 333, 0, 'tm'),
(13, 288, 19, 'level'),
(13, 307, 45, 'level'),
(13, 347, 23, 'level'),
(13, 298, 58, 'level'),
(13, 297, 0, 'tm'),
(13, 341, 0, 'tm'),
(14, 272, 1, 'level'),
(14, 311, 19, 'level'),
(14, 263, 23, 'level'),
(14, 297, 0, 'tm'),
(14, 322, 0, 'tm'),
(14, 341, 0, 'tm'),
(14, 349, 0, 'tm'),
(15, 272, 26, 'level'),
(15, 359, 10, 'level'),
(15, 297, 0, 'tm'),
(15, 320, 0, 'tm'),
(16, 318, 1, 'level'),
(16, 297, 0, 'tm'),
(16, 393, 0, 'tm'),
(17, 293, 34, 'level'),
(17, 297, 0, 'tm'),
(17, 345, 0, 'tm'),
(17, 396, 0, 'tm'),
(18, 286, 11, 'level'),
(18, 252, 1, 'level'),
(18, 265, 1, 'level'),
(18, 327, 41, 'level'),
(18, 297, 0, 'tm'),
(18, 345, 0, 'tm'),
(19, 316, 4, 'level'),
(19, 324, 1, 'level'),
(19, 326, 28, 'level'),
(19, 350, 56, 'level'),
(19, 297, 0, 'tm'),
(20, 370, 50, 'level'),
(20, 295, 21, 'level'),
(20, 297, 0, 'tm'),
(20, 341, 0, 'tm'),
(21, 293, 19, 'level'),
(21, 326, 25, 'level'),
(21, 350, 46, 'level'),
(21, 269, 16, 'level'),
(21, 297, 0, 'tm'),
(21, 396, 0, 'tm'),
(22, 286, 13, 'level'),
(22, 273, 10, 'level'),
(22, 297, 0, 'tm'),
(22, 320, 0, 'tm'),
(23, 370, 70, 'level'),
(23, 295, 28, 'level'),
(23, 318, 20, 'level'),
(23, 297, 0, 'tm'),
(24, 329, 37, 'level'),
(24, 350, 46, 'level'),
(24, 320, 1, 'level'),
(24, 297, 0, 'tm'),
(24, 320, 0, 'tm'),
(25, 291, 1, 'level'),
(25, 297, 0, 'tm'),
(25, 333, 0, 'tm'),
(26, 377, 6, 'level'),
(26, 264, 4, 'level'),
(26, 343, 22, 'level'),
(26, 320, 46, 'level'),
(26, 333, 16, 'level'),
(26, 297, 0, 'tm'),
(26, 333, 0, 'tm'),
(26, 320, 0, 'tm'),
(27, 344, 1, 'level'),
(27, 308, 1, 'level'),
(27, 346, 49, 'level'),
(27, 333, 1, 'level'),
(27, 297, 0, 'tm'),
(27, 322, 0, 'tm'),
(27, 333, 0, 'tm'),
(27, 349, 0, 'tm'),
(28, 269, 15, 'level'),
(28, 256, 21, 'level'),
(28, 297, 0, 'tm'),
(28, 396, 0, 'tm'),
(29, 293, 39, 'level'),
(29, 324, 1, 'level'),
(29, 326, 1, 'level'),
(29, 297, 0, 'tm'),
(29, 396, 0, 'tm'),
(30, 354, 1, 'level'),
(30, 326, 1, 'level'),
(30, 269, 7, 'level'),
(30, 297, 0, 'tm'),
(30, 396, 0, 'tm'),
(31, 252, 1, 'level'),
(31, 320, 35, 'level'),
(31, 372, 9, 'level'),
(31, 297, 0, 'tm'),
(31, 333, 0, 'tm'),
(31, 320, 0, 'tm'),
(32, 293, 43, 'level'),
(32, 267, 1, 'level'),
(32, 354, 31, 'level'),
(32, 345, 13, 'level'),
(32, 266, 15, 'level'),
(32, 265, 33, 'level'),
(32, 297, 0, 'tm'),
(32, 345, 0, 'tm'),
(33, 260, 1, 'level'),
(33, 258, 53, 'level'),
(33, 253, 46, 'level'),
(33, 305, 45, 'level'),
(33, 270, 5, 'level'),
(33, 320, 42, 'level'),
(33, 259, 13, 'level'),
(33, 297, 0, 'tm'),
(33, 345, 0, 'tm'),
(33, 320, 0, 'tm'),
(34, 380, 15, 'level'),
(34, 323, 15, 'level'),
(34, 297, 0, 'tm'),
(34, 345, 0, 'tm'),
(35, 293, 1, 'level'),
(35, 339, 6, 'level'),
(35, 297, 0, 'tm'),
(35, 333, 0, 'tm'),
(35, 396, 0, 'tm'),
(36, 266, 1, 'level'),
(36, 297, 0, 'tm'),
(36, 333, 0, 'tm'),
(37, 253, 10, 'level'),
(37, 274, 40, 'level'),
(37, 297, 0, 'tm'),
(37, 322, 0, 'tm'),
(37, 341, 0, 'tm'),
(37, 333, 0, 'tm'),
(37, 349, 0, 'tm'),
(37, 345, 0, 'tm'),
(37, 320, 0, 'tm'),
(37, 396, 0, 'tm'),
(37, 393, 0, 'tm'),
(38, 297, 0, 'tm'),
(38, 322, 0, 'tm'),
(39, 297, 0, 'tm'),
(39, 322, 0, 'tm'),
(39, 333, 0, 'tm'),
(40, 297, 0, 'tm'),
(40, 322, 0, 'tm'),
(41, 274, 64, 'level'),
(41, 362, 100, 'level'),
(41, 297, 0, 'tm'),
(41, 333, 0, 'tm'),
(41, 345, 0, 'tm'),
(41, 396, 0, 'tm'),
(42, 382, 26, 'level'),
(42, 344, 72, 'level'),
(42, 282, 1, 'level'),
(42, 297, 0, 'tm'),
(43, 297, 0, 'tm'),
(43, 322, 0, 'tm'),
(44, 296, 17, 'level'),
(44, 297, 0, 'tm'),
(44, 333, 0, 'tm'),
(44, 320, 0, 'tm'),
(45, 284, 1, 'level'),
(45, 275, 27, 'level'),
(45, 257, 1, 'level'),
(45, 297, 0, 'tm'),
(46, 273, 1, 'level'),
(46, 297, 0, 'tm'),
(47, 283, 17, 'level'),
(47, 270, 21, 'level'),
(47, 297, 0, 'tm'),
(47, 345, 0, 'tm'),
(48, 339, 20, 'level'),
(48, 271, 6, 'level'),
(48, 297, 0, 'tm'),
(48, 322, 0, 'tm'),
(49, 293, 58, 'level'),
(49, 337, 33, 'level'),
(49, 261, 1, 'level'),
(49, 294, 21, 'level'),
(49, 325, 24, 'level'),
(49, 327, 18, 'level'),
(49, 297, 0, 'tm'),
(50, 339, 1, 'level'),
(50, 309, 19, 'level'),
(50, 294, 14, 'level'),
(50, 325, 23, 'level'),
(50, 297, 0, 'tm'),
(50, 320, 0, 'tm'),
(51, 315, 1, 'level'),
(51, 309, 7, 'level'),
(51, 272, 4, 'level'),
(51, 294, 13, 'level'),
(51, 297, 0, 'tm'),
(52, 320, 35, 'level'),
(52, 297, 0, 'tm'),
(52, 333, 0, 'tm'),
(52, 320, 0, 'tm'),
(53, 272, 1, 'level'),
(53, 297, 0, 'tm'),
(53, 333, 0, 'tm'),
(53, 320, 0, 'tm'),
(54, 288, 17, 'level'),
(54, 321, 21, 'level'),
(54, 294, 13, 'level'),
(54, 298, 1, 'level'),
(54, 372, 15, 'level'),
(54, 297, 0, 'tm'),
(55, 294, 9, 'level'),
(55, 312, 13, 'level'),
(55, 297, 0, 'tm'),
(56, 297, 0, 'tm'),
(56, 322, 0, 'tm'),
(57, 309, 3, 'level'),
(57, 360, 34, 'level'),
(57, 297, 0, 'tm'),
(58, 297, 43, 'level'),
(58, 303, 36, 'level'),
(58, 310, 15, 'level'),
(58, 297, 0, 'tm'),
(58, 322, 0, 'tm'),
(59, 296, 1, 'level'),
(59, 318, 16, 'level'),
(59, 252, 1, 'level'),
(59, 297, 0, 'tm'),
(59, 333, 0, 'tm'),
(60, 293, 1, 'level'),
(60, 324, 1, 'level'),
(60, 326, 1, 'level'),
(60, 325, 1, 'level'),
(60, 297, 0, 'tm'),
(61, 295, 1, 'level'),
(61, 297, 0, 'tm'),
(61, 333, 0, 'tm'),
(61, 320, 0, 'tm'),
(62, 293, 19, 'level'),
(62, 308, 46, 'level'),
(62, 340, 14, 'level'),
(62, 298, 1, 'level'),
(62, 297, 0, 'tm'),
(62, 322, 0, 'tm'),
(63, 292, 11, 'level'),
(63, 343, 22, 'level'),
(63, 360, 36, 'level'),
(63, 297, 0, 'tm'),
(63, 333, 0, 'tm'),
(63, 396, 0, 'tm'),
(64, 293, 37, 'level'),
(64, 324, 29, 'level'),
(64, 378, 11, 'level'),
(64, 297, 0, 'tm'),
(64, 333, 0, 'tm'),
(65, 352, 15, 'level'),
(65, 343, 29, 'level'),
(65, 268, 1, 'level'),
(65, 297, 0, 'tm'),
(65, 333, 0, 'tm'),
(66, 261, 1, 'level'),
(66, 347, 23, 'level'),
(66, 297, 0, 'tm'),
(66, 341, 0, 'tm'),
(66, 393, 0, 'tm'),
(67, 272, 4, 'level'),
(67, 283, 1, 'level'),
(67, 276, 15, 'level'),
(67, 327, 18, 'level'),
(67, 297, 0, 'tm'),
(67, 341, 0, 'tm'),
(68, 272, 1, 'level'),
(68, 262, 1, 'level'),
(68, 341, 23, 'level'),
(68, 297, 0, 'tm'),
(68, 322, 0, 'tm'),
(68, 341, 0, 'tm'),
(68, 349, 0, 'tm'),
(68, 396, 0, 'tm'),
(69, 370, 49, 'level'),
(69, 296, 27, 'level'),
(69, 295, 1, 'level'),
(69, 318, 1, 'level'),
(69, 268, 1, 'level'),
(69, 297, 0, 'tm'),
(69, 341, 0, 'tm'),
(70, 358, 1, 'level'),
(70, 295, 1, 'level'),
(70, 256, 47, 'level'),
(70, 297, 0, 'tm'),
(70, 341, 0, 'tm'),
(71, 293, 23, 'level'),
(71, 324, 1, 'level'),
(71, 326, 1, 'level'),
(71, 347, 14, 'level'),
(71, 325, 1, 'level'),
(71, 297, 0, 'tm'),
(71, 396, 0, 'tm'),
(72, 286, 1, 'level'),
(72, 321, 31, 'level'),
(72, 297, 0, 'tm'),
(74, 293, 25, 'level'),
(74, 316, 4, 'level'),
(74, 324, 1, 'level'),
(74, 326, 1, 'level'),
(74, 325, 1, 'level'),
(74, 297, 0, 'tm'),
(75, 293, 15, 'level'),
(75, 347, 29, 'level'),
(75, 325, 20, 'level'),
(75, 298, 48, 'level'),
(75, 297, 0, 'tm'),
(76, 293, 37, 'level'),
(76, 319, 40, 'level'),
(76, 347, 24, 'level'),
(76, 298, 49, 'level'),
(76, 297, 0, 'tm'),
(76, 345, 0, 'tm'),
(76, 396, 0, 'tm'),
(77, 356, 55, 'level'),
(77, 297, 0, 'tm'),
(78, 381, 26, 'level'),
(78, 297, 0, 'tm'),
(78, 322, 0, 'tm'),
(78, 349, 0, 'tm'),
(79, 374, 85, 'level'),
(79, 257, 28, 'level'),
(79, 297, 0, 'tm'),
(79, 320, 0, 'tm'),
(80, 286, 1, 'level'),
(80, 300, 1, 'level'),
(80, 263, 16, 'level'),
(80, 297, 0, 'tm'),
(80, 322, 0, 'tm'),
(81, 349, 26, 'level'),
(81, 322, 43, 'level'),
(81, 304, 21, 'level'),
(81, 297, 0, 'tm'),
(81, 322, 0, 'tm'),
(81, 333, 0, 'tm'),
(81, 349, 0, 'tm'),
(81, 345, 0, 'tm'),
(82, 318, 19, 'level'),
(82, 297, 0, 'tm'),
(82, 322, 0, 'tm'),
(82, 333, 0, 'tm'),
(83, 293, 1, 'level'),
(83, 290, 16, 'level'),
(83, 297, 0, 'tm'),
(83, 322, 0, 'tm'),
(83, 333, 0, 'tm'),
(84, 344, 44, 'level'),
(84, 282, 12, 'level'),
(84, 324, 1, 'level'),
(84, 326, 1, 'level'),
(84, 346, 28, 'level'),
(84, 325, 1, 'level'),
(84, 327, 33, 'level'),
(84, 297, 0, 'tm'),
(84, 341, 0, 'tm'),
(84, 396, 0, 'tm'),
(85, 288, 20, 'level'),
(85, 308, 1, 'level'),
(85, 320, 34, 'level'),
(85, 297, 0, 'tm'),
(85, 320, 0, 'tm'),
(86, 350, 50, 'level'),
(86, 378, 9, 'level'),
(86, 297, 0, 'tm'),
(87, 268, 11, 'level'),
(87, 297, 0, 'tm'),
(87, 341, 0, 'tm'),
(88, 307, 41, 'level'),
(88, 311, 1, 'level'),
(88, 263, 5, 'level'),
(88, 297, 0, 'tm'),
(88, 322, 0, 'tm'),
(88, 341, 0, 'tm'),
(88, 349, 0, 'tm'),
(89, 309, 7, 'level'),
(89, 288, 21, 'level'),
(89, 327, 25, 'level'),
(89, 297, 0, 'tm'),
(90, 288, 14, 'level'),
(90, 297, 0, 'tm'),
(90, 322, 0, 'tm'),
(91, 288, 13, 'level'),
(91, 297, 0, 'tm'),
(91, 345, 0, 'tm'),
(92, 288, 5, 'level'),
(92, 266, 15, 'level'),
(92, 297, 0, 'tm'),
(92, 322, 0, 'tm'),
(92, 349, 0, 'tm'),
(92, 345, 0, 'tm'),
(93, 324, 1, 'level'),
(93, 326, 1, 'level'),
(93, 297, 0, 'tm'),
(94, 274, 28, 'level'),
(94, 321, 34, 'level'),
(94, 346, 22, 'level'),
(94, 263, 4, 'level'),
(94, 279, 7, 'level'),
(94, 297, 0, 'tm'),
(94, 341, 0, 'tm'),
(95, 350, 33, 'level'),
(95, 257, 17, 'level'),
(95, 297, 0, 'tm'),
(95, 393, 0, 'tm'),
(96, 349, 37, 'level'),
(96, 310, 21, 'level'),
(96, 297, 0, 'tm'),
(96, 322, 0, 'tm'),
(96, 349, 0, 'tm'),
(96, 396, 0, 'tm'),
(97, 337, 22, 'level'),
(97, 259, 40, 'level'),
(97, 297, 0, 'tm'),
(98, 321, 33, 'level'),
(98, 294, 11, 'level'),
(98, 297, 0, 'tm'),
(98, 393, 0, 'tm'),
(99, 278, 13, 'level'),
(99, 315, 13, 'level'),
(99, 273, 1, 'level'),
(99, 357, 32, 'level'),
(99, 321, 44, 'level'),
(99, 263, 1, 'level'),
(99, 297, 0, 'tm'),
(99, 393, 0, 'tm'),
(100, 272, 1, 'level'),
(100, 324, 1, 'level'),
(100, 326, 1, 'level'),
(100, 325, 1, 'level'),
(100, 320, 20, 'level'),
(100, 256, 28, 'level'),
(100, 297, 0, 'tm'),
(100, 320, 0, 'tm'),
(100, 396, 0, 'tm'),
(101, 286, 1, 'level'),
(101, 272, 11, 'level'),
(101, 321, 39, 'level'),
(101, 257, 25, 'level'),
(101, 254, 5, 'level'),
(101, 256, 35, 'level'),
(101, 297, 0, 'tm'),
(102, 289, 21, 'level'),
(102, 277, 7, 'level'),
(102, 297, 0, 'tm'),
(102, 396, 0, 'tm'),
(103, 253, 46, 'level'),
(103, 297, 0, 'tm'),
(103, 345, 0, 'tm'),
(104, 347, 37, 'level'),
(104, 320, 61, 'level'),
(104, 257, 21, 'level'),
(104, 263, 5, 'level'),
(104, 330, 53, 'level'),
(104, 256, 29, 'level'),
(104, 297, 0, 'tm'),
(104, 320, 0, 'tm'),
(104, 396, 0, 'tm'),
(105, 337, 1, 'level'),
(105, 283, 1, 'level'),
(105, 276, 18, 'level'),
(105, 320, 29, 'level'),
(105, 297, 0, 'tm'),
(105, 341, 0, 'tm'),
(105, 320, 0, 'tm'),
(106, 293, 9, 'level'),
(106, 353, 33, 'level'),
(106, 261, 1, 'level'),
(106, 331, 69, 'level'),
(106, 319, 1, 'level'),
(106, 347, 25, 'level'),
(106, 257, 17, 'level'),
(106, 297, 0, 'tm'),
(106, 396, 0, 'tm'),
(106, 393, 0, 'tm'),
(107, 313, 44, 'level'),
(107, 330, 50, 'level'),
(107, 279, 1, 'level'),
(107, 268, 10, 'level'),
(107, 256, 41, 'level'),
(107, 297, 0, 'tm'),
(108, 337, 19, 'level'),
(108, 253, 25, 'level'),
(108, 347, 31, 'level'),
(108, 287, 34, 'level'),
(108, 297, 0, 'tm'),
(109, 261, 8, 'level'),
(109, 263, 5, 'level'),
(109, 297, 0, 'tm'),
(109, 393, 0, 'tm'),
(110, 272, 1, 'level'),
(110, 321, 28, 'level'),
(110, 320, 24, 'level'),
(110, 297, 0, 'tm'),
(110, 320, 0, 'tm'),
(111, 337, 49, 'level'),
(111, 297, 0, 'tm'),
(111, 322, 0, 'tm'),
(111, 341, 0, 'tm'),
(111, 349, 0, 'tm'),
(111, 396, 0, 'tm'),
(112, 272, 11, 'level'),
(112, 337, 22, 'level'),
(112, 298, 47, 'level'),
(112, 342, 36, 'level'),
(112, 266, 8, 'level'),
(112, 265, 33, 'level'),
(112, 254, 1, 'level'),
(112, 297, 0, 'tm'),
(112, 396, 0, 'tm'),
(113, 293, 11, 'level'),
(113, 261, 8, 'level'),
(113, 257, 21, 'level'),
(113, 297, 0, 'tm'),
(113, 393, 0, 'tm'),
(114, 293, 33, 'level'),
(114, 325, 27, 'level'),
(114, 269, 36, 'level'),
(114, 297, 0, 'tm'),
(114, 396, 0, 'tm'),
(115, 321, 37, 'level'),
(115, 297, 0, 'tm'),
(115, 393, 0, 'tm'),
(117, 293, 29, 'level'),
(117, 296, 33, 'level'),
(117, 318, 20, 'level'),
(117, 274, 29, 'level'),
(117, 324, 20, 'level'),
(117, 329, 37, 'level'),
(117, 326, 20, 'level'),
(117, 294, 1, 'level'),
(117, 325, 20, 'level'),
(117, 378, 9, 'level'),
(117, 312, 17, 'level'),
(117, 297, 0, 'tm'),
(117, 333, 0, 'tm'),
(118, 324, 20, 'level'),
(118, 378, 9, 'level'),
(118, 297, 0, 'tm'),
(118, 333, 0, 'tm'),
(119, 293, 29, 'level'),
(119, 329, 37, 'level'),
(119, 326, 20, 'level'),
(119, 378, 9, 'level'),
(119, 297, 0, 'tm'),
(120, 278, 1, 'level'),
(120, 313, 43, 'level'),
(120, 273, 1, 'level'),
(120, 261, 34, 'level'),
(120, 321, 28, 'level'),
(120, 279, 1, 'level'),
(120, 297, 0, 'tm'),
(120, 320, 0, 'tm'),
(121, 272, 1, 'level'),
(121, 268, 6, 'level'),
(121, 297, 0, 'tm'),
(122, 293, 1, 'level'),
(122, 324, 1, 'level'),
(122, 326, 1, 'level'),
(122, 325, 1, 'level'),
(122, 263, 1, 'level'),
(122, 297, 0, 'tm'),
(122, 396, 0, 'tm'),
(123, 344, 1, 'level'),
(123, 288, 13, 'level'),
(123, 256, 25, 'level'),
(123, 297, 0, 'tm'),
(123, 322, 0, 'tm'),
(123, 333, 0, 'tm'),
(123, 396, 0, 'tm'),
(124, 311, 19, 'level'),
(124, 263, 5, 'level'),
(124, 297, 0, 'tm'),
(124, 322, 0, 'tm'),
(124, 349, 0, 'tm'),
(125, 293, 12, 'level'),
(125, 271, 15, 'level'),
(125, 288, 22, 'level'),
(125, 279, 1, 'level'),
(125, 268, 5, 'level'),
(125, 297, 0, 'tm'),
(125, 341, 0, 'tm'),
(125, 393, 0, 'tm'),
(126, 286, 1, 'level'),
(126, 377, 1, 'level'),
(126, 343, 9, 'level'),
(126, 263, 1, 'level'),
(126, 297, 0, 'tm'),
(126, 333, 0, 'tm'),
(127, 370, 49, 'level'),
(127, 295, 1, 'level'),
(127, 318, 1, 'level'),
(127, 268, 1, 'level'),
(127, 297, 0, 'tm'),
(127, 341, 0, 'tm'),
(128, 252, 1, 'level'),
(128, 297, 0, 'tm'),
(129, 292, 34, 'level'),
(129, 349, 28, 'level'),
(129, 322, 37, 'level'),
(129, 268, 1, 'level'),
(129, 297, 0, 'tm'),
(129, 322, 0, 'tm'),
(129, 349, 0, 'tm'),
(130, 313, 15, 'level'),
(130, 309, 8, 'level'),
(130, 337, 32, 'level'),
(130, 354, 1, 'level'),
(130, 288, 18, 'level'),
(130, 297, 0, 'tm'),
(130, 322, 0, 'tm'),
(130, 349, 0, 'tm'),
(130, 345, 0, 'tm'),
(131, 370, 50, 'level'),
(131, 312, 7, 'level'),
(131, 268, 1, 'level'),
(131, 297, 0, 'tm'),
(132, 264, 14, 'level'),
(132, 322, 49, 'level'),
(132, 263, 22, 'level'),
(132, 297, 0, 'tm'),
(132, 322, 0, 'tm'),
(133, 327, 19, 'level'),
(133, 256, 15, 'level'),
(133, 297, 0, 'tm'),
(134, 378, 9, 'level'),
(134, 297, 0, 'tm'),
(135, 296, 33, 'level'),
(135, 378, 9, 'level'),
(135, 297, 0, 'tm'),
(136, 271, 21, 'level'),
(136, 309, 1, 'level'),
(136, 297, 0, 'tm'),
(137, 297, 0, 'tm'),
(138, 309, 1, 'level'),
(138, 318, 1, 'level'),
(138, 376, 1, 'level'),
(138, 297, 0, 'tm'),
(138, 333, 0, 'tm'),
(140, 309, 1, 'level'),
(140, 337, 28, 'level'),
(140, 257, 14, 'level'),
(140, 297, 0, 'tm'),
(140, 333, 0, 'tm'),
(141, 320, 42, 'level'),
(141, 297, 0, 'tm'),
(141, 341, 0, 'tm'),
(141, 320, 0, 'tm'),
(142, 353, 23, 'level'),
(142, 344, 31, 'level'),
(142, 282, 36, 'level'),
(142, 297, 0, 'tm'),
(142, 333, 0, 'tm'),
(142, 320, 0, 'tm'),
(143, 272, 7, 'level'),
(143, 324, 1, 'level'),
(143, 326, 1, 'level'),
(143, 349, 22, 'level'),
(143, 325, 1, 'level'),
(143, 322, 30, 'level'),
(143, 297, 0, 'tm'),
(143, 322, 0, 'tm'),
(143, 341, 0, 'tm'),
(143, 349, 0, 'tm'),
(143, 396, 0, 'tm'),
(144, 286, 13, 'level'),
(144, 272, 9, 'level'),
(144, 321, 33, 'level'),
(144, 297, 0, 'tm'),
(144, 341, 0, 'tm'),
(144, 320, 0, 'tm'),
(145, 273, 1, 'level'),
(145, 351, 12, 'level'),
(145, 279, 1, 'level'),
(145, 297, 0, 'tm'),
(145, 341, 0, 'tm'),
(145, 320, 0, 'tm'),
(146, 261, 1, 'level'),
(146, 299, 1, 'level'),
(146, 347, 16, 'level'),
(146, 297, 0, 'tm'),
(146, 341, 0, 'tm'),
(146, 396, 0, 'tm'),
(147, 288, 16, 'level'),
(147, 340, 25, 'level'),
(147, 294, 14, 'level'),
(147, 297, 0, 'tm'),
(147, 345, 0, 'tm'),
(148, 293, 38, 'level'),
(148, 295, 22, 'level'),
(148, 288, 8, 'level'),
(148, 319, 67, 'level'),
(148, 378, 1, 'level'),
(148, 372, 25, 'level'),
(148, 297, 0, 'tm'),
(149, 272, 13, 'level'),
(149, 329, 34, 'level'),
(149, 297, 0, 'tm'),
(149, 320, 0, 'tm'),
(150, 278, 20, 'level'),
(150, 286, 4, 'level'),
(150, 272, 1, 'level'),
(150, 321, 27, 'level'),
(150, 297, 0, 'tm'),
(151, 279, 6, 'level'),
(151, 297, 0, 'tm'),
(151, 333, 0, 'tm'),
(152, 297, 0, 'tm'),
(152, 396, 0, 'tm'),
(153, 310, 12, 'level'),
(153, 297, 0, 'tm'),
(154, 293, 37, 'level'),
(154, 324, 1, 'level'),
(154, 326, 1, 'level'),
(154, 261, 1, 'level'),
(154, 256, 24, 'level'),
(154, 297, 0, 'tm'),
(154, 320, 0, 'tm'),
(154, 396, 0, 'tm'),
(155, 309, 7, 'level'),
(155, 259, 43, 'level'),
(155, 257, 13, 'level'),
(155, 297, 0, 'tm'),
(155, 333, 0, 'tm'),
(157, 260, 1, 'level'),
(157, 320, 42, 'level'),
(157, 297, 0, 'tm'),
(157, 345, 0, 'tm'),
(157, 320, 0, 'tm'),
(158, 285, 8, 'level'),
(158, 252, 15, 'level'),
(158, 355, 21, 'level'),
(158, 297, 0, 'tm'),
(159, 343, 22, 'level'),
(159, 297, 0, 'tm'),
(159, 333, 0, 'tm'),
(159, 345, 0, 'tm'),
(160, 329, 33, 'level'),
(160, 297, 0, 'tm'),
(160, 345, 0, 'tm'),
(161, 320, 41, 'level'),
(161, 257, 8, 'level'),
(161, 297, 0, 'tm'),
(161, 320, 0, 'tm'),
(162, 324, 50, 'level'),
(162, 297, 0, 'tm'),
(162, 333, 0, 'tm'),
(163, 329, 57, 'level'),
(163, 326, 50, 'level'),
(163, 257, 29, 'level'),
(163, 297, 0, 'tm'),
(164, 325, 50, 'level'),
(164, 297, 0, 'tm'),
(165, 297, 0, 'tm'),
(165, 333, 0, 'tm'),
(166, 297, 0, 'tm'),
(166, 333, 0, 'tm'),
(167, 354, 1, 'level'),
(167, 268, 5, 'level'),
(167, 256, 29, 'level'),
(167, 297, 0, 'tm'),
(167, 349, 0, 'tm'),
(167, 345, 0, 'tm'),
(167, 396, 0, 'tm'),
(168, 305, 1, 'level'),
(168, 297, 0, 'tm'),
(168, 349, 0, 'tm'),
(168, 345, 0, 'tm'),
(169, 319, 63, 'level'),
(169, 327, 22, 'level'),
(169, 297, 0, 'tm'),
(170, 288, 19, 'level'),
(170, 378, 12, 'level'),
(170, 297, 0, 'tm'),
(170, 333, 0, 'tm'),
(171, 272, 1, 'level'),
(171, 296, 17, 'level'),
(171, 341, 20, 'level'),
(171, 310, 20, 'level'),
(171, 311, 25, 'level'),
(171, 268, 12, 'level'),
(171, 297, 0, 'tm'),
(171, 322, 0, 'tm'),
(171, 341, 0, 'tm'),
(171, 349, 0, 'tm'),
(172, 272, 1, 'level'),
(172, 296, 17, 'level'),
(172, 341, 20, 'level'),
(172, 311, 25, 'level'),
(172, 297, 0, 'tm'),
(172, 322, 0, 'tm'),
(172, 341, 0, 'tm'),
(172, 349, 0, 'tm'),
(173, 286, 9, 'level'),
(173, 309, 1, 'level'),
(173, 288, 12, 'level'),
(173, 268, 1, 'level'),
(173, 297, 0, 'tm'),
(174, 358, 20, 'level'),
(174, 272, 1, 'level'),
(174, 297, 0, 'tm'),
(174, 345, 0, 'tm'),
(174, 396, 0, 'tm'),
(175, 321, 22, 'level'),
(175, 310, 22, 'level'),
(175, 263, 5, 'level'),
(175, 297, 0, 'tm'),
(175, 322, 0, 'tm'),
(176, 286, 1, 'level'),
(176, 293, 22, 'level'),
(176, 339, 1, 'level'),
(176, 295, 9, 'level'),
(176, 310, 22, 'level'),
(176, 311, 32, 'level'),
(176, 297, 0, 'tm'),
(176, 322, 0, 'tm'),
(177, 323, 28, 'level'),
(177, 268, 1, 'level'),
(177, 297, 0, 'tm'),
(177, 341, 0, 'tm'),
(177, 345, 0, 'tm'),
(178, 288, 14, 'level'),
(178, 319, 61, 'level'),
(178, 347, 25, 'level'),
(178, 297, 0, 'tm'),
(178, 345, 0, 'tm'),
(179, 272, 1, 'level'),
(179, 288, 13, 'level'),
(179, 268, 5, 'level'),
(179, 297, 0, 'tm'),
(179, 322, 0, 'tm'),
(180, 272, 1, 'level'),
(180, 288, 13, 'level'),
(180, 268, 5, 'level'),
(180, 297, 0, 'tm'),
(181, 309, 8, 'level'),
(181, 316, 11, 'level'),
(181, 324, 1, 'level'),
(181, 326, 1, 'level'),
(181, 325, 1, 'level'),
(181, 257, 22, 'level'),
(181, 263, 18, 'level'),
(181, 371, 58, 'level'),
(181, 297, 0, 'tm'),
(182, 323, 13, 'level'),
(182, 321, 1, 'level'),
(182, 299, 7, 'level'),
(182, 266, 31, 'level'),
(182, 297, 0, 'tm'),
(182, 345, 0, 'tm'),
(183, 286, 7, 'level'),
(183, 298, 40, 'level'),
(183, 256, 20, 'level'),
(183, 297, 0, 'tm'),
(184, 272, 4, 'level'),
(184, 332, 10, 'level'),
(184, 297, 0, 'tm'),
(185, 252, 1, 'level'),
(185, 297, 0, 'tm'),
(185, 333, 0, 'tm'),
(186, 271, 6, 'level'),
(186, 309, 9, 'level'),
(186, 288, 11, 'level'),
(186, 297, 0, 'tm'),
(186, 345, 0, 'tm'),
(187, 309, 1, 'level'),
(187, 295, 13, 'level'),
(187, 254, 17, 'level'),
(187, 297, 0, 'tm'),
(187, 333, 0, 'tm'),
(188, 323, 17, 'level'),
(188, 270, 4, 'level'),
(188, 297, 0, 'tm'),
(188, 345, 0, 'tm'),
(189, 316, 7, 'level'),
(189, 324, 19, 'level'),
(189, 326, 1, 'level'),
(189, 297, 0, 'tm'),
(189, 333, 0, 'tm'),
(190, 379, 1, 'level'),
(190, 343, 19, 'level'),
(190, 372, 1, 'level'),
(190, 297, 0, 'tm'),
(190, 333, 0, 'tm'),
(191, 379, 1, 'level'),
(191, 343, 19, 'level'),
(191, 372, 1, 'level'),
(191, 297, 0, 'tm'),
(191, 333, 0, 'tm'),
(192, 296, 19, 'level'),
(192, 300, 22, 'level'),
(192, 351, 15, 'level'),
(192, 297, 0, 'tm'),
(192, 322, 0, 'tm'),
(192, 333, 0, 'tm'),
(192, 349, 0, 'tm'),
(193, 296, 19, 'level'),
(193, 295, 5, 'level'),
(193, 351, 15, 'level'),
(193, 372, 1, 'level'),
(193, 297, 0, 'tm'),
(193, 322, 0, 'tm'),
(193, 333, 0, 'tm'),
(193, 349, 0, 'tm'),
(194, 283, 8, 'level'),
(194, 346, 17, 'level'),
(194, 276, 10, 'level'),
(194, 297, 0, 'tm'),
(194, 341, 0, 'tm'),
(195, 293, 29, 'level'),
(195, 307, 32, 'level'),
(195, 325, 25, 'level'),
(195, 297, 0, 'tm'),
(196, 309, 16, 'level'),
(196, 368, 1, 'level'),
(196, 321, 25, 'level'),
(196, 297, 0, 'tm'),
(197, 329, 22, 'level'),
(197, 297, 0, 'tm'),
(198, 273, 7, 'level'),
(198, 329, 25, 'level'),
(198, 350, 50, 'level'),
(198, 297, 0, 'tm'),
(198, 320, 0, 'tm'),
(199, 304, 1, 'level'),
(199, 297, 0, 'tm'),
(199, 333, 0, 'tm'),
(200, 287, 23, 'level'),
(200, 304, 32, 'level'),
(200, 297, 0, 'tm'),
(201, 264, 1, 'level'),
(201, 298, 40, 'level'),
(201, 263, 19, 'level'),
(201, 371, 47, 'level'),
(201, 297, 0, 'tm'),
(201, 322, 0, 'tm'),
(201, 396, 0, 'tm'),
(202, 292, 46, 'level'),
(202, 306, 16, 'level'),
(202, 268, 4, 'level'),
(202, 297, 0, 'tm'),
(202, 341, 0, 'tm'),
(203, 308, 26, 'level'),
(203, 340, 15, 'level'),
(203, 297, 0, 'tm'),
(204, 344, 44, 'level'),
(204, 307, 21, 'level'),
(204, 282, 19, 'level'),
(204, 341, 16, 'level'),
(204, 317, 9, 'level'),
(204, 297, 0, 'tm'),
(204, 341, 0, 'tm'),
(204, 396, 0, 'tm'),
(205, 272, 1, 'level'),
(205, 297, 0, 'tm'),
(205, 333, 0, 'tm'),
(205, 349, 0, 'tm'),
(205, 320, 0, 'tm'),
(206, 272, 1, 'level'),
(206, 297, 0, 'tm'),
(206, 333, 0, 'tm'),
(206, 349, 0, 'tm'),
(206, 320, 0, 'tm'),
(207, 313, 1, 'level'),
(207, 327, 13, 'level'),
(207, 297, 0, 'tm'),
(208, 286, 1, 'level'),
(208, 272, 5, 'level'),
(208, 337, 20, 'level'),
(208, 357, 31, 'level'),
(208, 254, 7, 'level'),
(208, 297, 0, 'tm'),
(209, 309, 1, 'level'),
(209, 321, 21, 'level'),
(209, 279, 1, 'level'),
(209, 297, 0, 'tm'),
(210, 272, 1, 'level'),
(210, 308, 39, 'level'),
(210, 321, 29, 'level'),
(210, 297, 0, 'tm'),
(210, 396, 0, 'tm'),
(211, 344, 41, 'level'),
(211, 297, 0, 'tm'),
(211, 396, 0, 'tm'),
(212, 297, 0, 'tm'),
(213, 309, 1, 'level'),
(213, 288, 13, 'level'),
(213, 297, 0, 'tm'),
(213, 333, 0, 'tm'),
(214, 271, 7, 'level'),
(214, 297, 0, 'tm'),
(214, 333, 0, 'tm'),
(215, 271, 1, 'level'),
(215, 309, 9, 'level'),
(215, 314, 1, 'level'),
(215, 297, 0, 'tm'),
(215, 333, 0, 'tm'),
(216, 358, 26, 'level'),
(216, 295, 6, 'level'),
(216, 318, 16, 'level'),
(216, 257, 10, 'level'),
(216, 297, 0, 'tm'),
(216, 396, 0, 'tm'),
(217, 297, 0, 'tm'),
(217, 333, 0, 'tm'),
(217, 396, 0, 'tm'),
(218, 321, 17, 'level'),
(218, 325, 1, 'level'),
(218, 297, 0, 'tm'),
(219, 293, 9, 'level'),
(219, 344, 45, 'level'),
(219, 321, 19, 'level'),
(219, 325, 16, 'level'),
(219, 297, 0, 'tm'),
(220, 344, 45, 'level'),
(220, 297, 0, 'tm'),
(221, 272, 1, 'level'),
(221, 297, 0, 'tm'),
(222, 355, 22, 'level'),
(222, 297, 0, 'tm'),
(223, 319, 49, 'level'),
(223, 298, 61, 'level'),
(223, 257, 1, 'level'),
(223, 333, 13, 'level'),
(223, 297, 0, 'tm'),
(223, 333, 0, 'tm'),
(224, 319, 49, 'level'),
(224, 294, 7, 'level'),
(224, 298, 61, 'level'),
(224, 257, 1, 'level'),
(224, 333, 13, 'level'),
(224, 297, 0, 'tm'),
(224, 333, 0, 'tm'),
(225, 319, 49, 'level'),
(225, 298, 61, 'level'),
(225, 257, 1, 'level'),
(225, 333, 13, 'level'),
(225, 297, 0, 'tm'),
(225, 333, 0, 'tm'),
(226, 302, 24, 'level'),
(226, 297, 0, 'tm'),
(226, 333, 0, 'tm'),
(227, 301, 24, 'level'),
(227, 297, 0, 'tm'),
(227, 333, 0, 'tm'),
(228, 293, 5, 'level'),
(228, 297, 0, 'tm'),
(229, 293, 5, 'level'),
(229, 329, 20, 'level'),
(229, 319, 80, 'level'),
(229, 297, 0, 'tm'),
(229, 396, 0, 'tm'),
(230, 293, 5, 'level'),
(230, 297, 0, 'tm'),
(230, 320, 0, 'tm'),
(230, 396, 0, 'tm'),
(231, 297, 0, 'tm'),
(231, 322, 0, 'tm'),
(231, 333, 0, 'tm'),
(232, 271, 7, 'level'),
(232, 297, 0, 'tm'),
(232, 333, 0, 'tm'),
(232, 345, 0, 'tm'),
(232, 396, 0, 'tm'),
(233, 273, 5, 'level'),
(233, 268, 9, 'level'),
(233, 297, 0, 'tm'),
(234, 297, 31, 'level'),
(234, 288, 15, 'level'),
(234, 349, 39, 'level'),
(234, 297, 0, 'tm'),
(234, 322, 0, 'tm'),
(234, 349, 0, 'tm'),
(234, 345, 0, 'tm'),
(235, 286, 8, 'level'),
(235, 321, 29, 'level'),
(235, 297, 0, 'tm'),
(236, 298, 45, 'level'),
(236, 290, 17, 'level'),
(236, 297, 0, 'tm'),
(236, 333, 0, 'tm'),
(237, 351, 6, 'level'),
(237, 268, 14, 'level'),
(237, 297, 0, 'tm'),
(238, 370, 37, 'level'),
(238, 295, 1, 'level'),
(238, 318, 1, 'level'),
(238, 312, 22, 'level'),
(238, 268, 1, 'level'),
(238, 297, 0, 'tm'),
(238, 341, 0, 'tm'),
(239, 293, 19, 'level'),
(239, 347, 28, 'level'),
(239, 297, 0, 'tm'),
(240, 297, 0, 'tm'),
(241, 391, 47, 'level'),
(241, 311, 38, 'level'),
(241, 297, 0, 'tm'),
(241, 322, 0, 'tm'),
(241, 341, 0, 'tm'),
(241, 349, 0, 'tm'),
(242, 391, 47, 'level'),
(242, 311, 38, 'level'),
(242, 297, 0, 'tm'),
(242, 322, 0, 'tm'),
(242, 341, 0, 'tm'),
(242, 349, 0, 'tm'),
(243, 334, 45, 'level'),
(243, 295, 1, 'level'),
(243, 288, 13, 'level'),
(243, 335, 17, 'level'),
(243, 336, 29, 'level'),
(243, 297, 0, 'tm'),
(243, 322, 0, 'tm'),
(243, 341, 0, 'tm'),
(243, 349, 0, 'tm'),
(244, 379, 19, 'level'),
(244, 343, 25, 'level'),
(244, 290, 49, 'level'),
(244, 297, 0, 'tm'),
(244, 322, 0, 'tm'),
(244, 333, 0, 'tm'),
(245, 337, 27, 'level'),
(245, 264, 1, 'level'),
(245, 325, 1, 'level'),
(245, 297, 0, 'tm'),
(246, 370, 47, 'level'),
(246, 318, 19, 'level'),
(246, 297, 0, 'tm'),
(247, 272, 4, 'level'),
(247, 327, 11, 'level'),
(247, 297, 0, 'tm'),
(248, 339, 20, 'level'),
(248, 309, 4, 'level'),
(248, 279, 1, 'level'),
(248, 297, 0, 'tm'),
(248, 333, 0, 'tm'),
(248, 349, 0, 'tm'),
(248, 320, 0, 'tm'),
(249, 287, 36, 'level'),
(249, 259, 23, 'level'),
(249, 378, 13, 'level'),
(249, 297, 0, 'tm'),
(249, 333, 0, 'tm'),
(249, 345, 0, 'tm'),
(249, 396, 0, 'tm'),
(250, 288, 20, 'level'),
(250, 340, 48, 'level'),
(250, 297, 0, 'tm'),
(250, 322, 0, 'tm'),
(251, 309, 7, 'level'),
(251, 297, 0, 'tm'),
(251, 333, 0, 'tm'),
(252, 283, 3, 'level'),
(252, 288, 9, 'level'),
(252, 346, 19, 'level'),
(252, 297, 0, 'tm'),
(252, 341, 0, 'tm'),
(253, 401, 22, 'level'),
(253, 319, 50, 'level'),
(253, 256, 1, 'level'),
(253, 297, 0, 'tm'),
(254, 313, 1, 'level'),
(254, 318, 1, 'level'),
(254, 274, 1, 'level'),
(254, 252, 11, 'level'),
(254, 270, 8, 'level'),
(254, 297, 0, 'tm'),
(254, 333, 0, 'tm'),
(255, 281, 16, 'level'),
(255, 275, 44, 'level'),
(255, 252, 12, 'level'),
(255, 297, 0, 'tm'),
(255, 333, 0, 'tm'),
(256, 303, 50, 'level'),
(256, 297, 0, 'tm'),
(256, 322, 0, 'tm'),
(257, 339, 25, 'level'),
(257, 297, 0, 'tm'),
(258, 386, 57, 'level'),
(258, 272, 41, 'level'),
(258, 347, 17, 'level'),
(258, 297, 0, 'tm'),
(259, 324, 1, 'level'),
(259, 326, 1, 'level'),
(259, 325, 1, 'level'),
(259, 297, 0, 'tm'),
(260, 293, 41, 'level'),
(260, 307, 23, 'level'),
(260, 324, 1, 'level'),
(260, 341, 27, 'level'),
(260, 326, 1, 'level'),
(260, 340, 30, 'level'),
(260, 325, 1, 'level'),
(260, 297, 0, 'tm'),
(260, 341, 0, 'tm'),
(260, 396, 0, 'tm'),
(261, 309, 1, 'level'),
(261, 341, 36, 'level'),
(261, 327, 29, 'level'),
(261, 297, 0, 'tm'),
(261, 341, 0, 'tm'),
(261, 345, 0, 'tm'),
(262, 358, 31, 'level'),
(262, 295, 17, 'level'),
(262, 330, 50, 'level'),
(262, 297, 0, 'tm'),
(263, 322, 42, 'level'),
(263, 311, 49, 'level'),
(263, 297, 0, 'tm'),
(263, 322, 0, 'tm'),
(264, 286, 1, 'level'),
(264, 263, 3, 'level'),
(264, 297, 0, 'tm'),
(264, 349, 0, 'tm'),
(265, 318, 20, 'level'),
(265, 378, 9, 'level'),
(265, 312, 17, 'level'),
(265, 297, 0, 'tm'),
(266, 274, 29, 'level'),
(266, 294, 1, 'level'),
(266, 325, 20, 'level'),
(266, 378, 9, 'level'),
(266, 297, 0, 'tm'),
(267, 297, 0, 'tm'),
(267, 333, 0, 'tm'),
(267, 345, 0, 'tm'),
(268, 339, 1, 'level'),
(268, 309, 19, 'level'),
(268, 294, 14, 'level'),
(268, 297, 0, 'tm'),
(269, 339, 29, 'level'),
(269, 309, 1, 'level'),
(269, 343, 43, 'level'),
(269, 297, 0, 'tm'),
(269, 333, 0, 'tm'),
(270, 297, 0, 'tm'),
(270, 322, 0, 'tm'),
(270, 333, 0, 'tm'),
(270, 349, 0, 'tm'),
(271, 297, 0, 'tm'),
(271, 322, 0, 'tm'),
(271, 333, 0, 'tm'),
(271, 349, 0, 'tm'),
(272, 297, 0, 'tm'),
(272, 322, 0, 'tm'),
(272, 333, 0, 'tm'),
(272, 349, 0, 'tm'),
(273, 293, 1, 'level'),
(273, 297, 0, 'tm'),
(274, 293, 1, 'level'),
(274, 297, 0, 'tm'),
(275, 293, 41, 'level'),
(275, 329, 49, 'level'),
(275, 326, 17, 'level'),
(275, 297, 0, 'tm'),
(276, 253, 1, 'level'),
(276, 298, 25, 'level'),
(276, 287, 1, 'level'),
(276, 257, 1, 'level'),
(276, 297, 0, 'tm'),
(277, 296, 57, 'level'),
(277, 297, 0, 'tm'),
(277, 333, 0, 'tm'),
(278, 286, 1, 'level'),
(278, 263, 16, 'level'),
(278, 297, 0, 'tm'),
(278, 322, 0, 'tm'),
(279, 339, 1, 'level'),
(279, 271, 1, 'level'),
(279, 338, 66, 'level'),
(279, 297, 0, 'tm'),
(279, 333, 0, 'tm'),
(280, 295, 37, 'level'),
(280, 318, 10, 'level'),
(280, 312, 82, 'level'),
(280, 297, 0, 'tm'),
(281, 350, 57, 'level'),
(281, 365, 1, 'level'),
(281, 297, 0, 'tm'),
(281, 322, 0, 'tm'),
(281, 333, 0, 'tm'),
(282, 358, 16, 'level'),
(282, 344, 31, 'level'),
(282, 256, 25, 'level'),
(282, 297, 0, 'tm'),
(282, 396, 0, 'tm'),
(283, 299, 1, 'level'),
(283, 319, 1, 'level'),
(283, 297, 0, 'tm'),
(283, 345, 0, 'tm'),
(283, 320, 0, 'tm'),
(284, 357, 17, 'level'),
(284, 297, 0, 'tm'),
(284, 393, 0, 'tm'),
(285, 290, 31, 'level'),
(285, 256, 41, 'level'),
(285, 297, 0, 'tm'),
(286, 324, 1, 'level'),
(286, 326, 1, 'level'),
(286, 325, 1, 'level'),
(286, 378, 10, 'level'),
(286, 297, 0, 'tm'),
(287, 288, 12, 'level'),
(287, 340, 24, 'level'),
(287, 297, 0, 'tm'),
(287, 322, 0, 'tm'),
(288, 288, 1, 'level'),
(288, 349, 31, 'level'),
(288, 372, 1, 'level'),
(288, 297, 0, 'tm'),
(288, 349, 0, 'tm'),
(288, 345, 0, 'tm'),
(289, 288, 1, 'level'),
(289, 349, 31, 'level'),
(289, 372, 1, 'level'),
(289, 297, 0, 'tm'),
(289, 349, 0, 'tm'),
(289, 345, 0, 'tm'),
(290, 288, 1, 'level'),
(290, 321, 34, 'level'),
(290, 349, 31, 'level'),
(290, 372, 1, 'level'),
(290, 297, 0, 'tm'),
(290, 349, 0, 'tm'),
(290, 345, 0, 'tm'),
(291, 257, 29, 'level'),
(291, 297, 0, 'tm'),
(291, 333, 0, 'tm'),
(292, 272, 4, 'level'),
(292, 297, 0, 'tm'),
(293, 310, 21, 'level'),
(293, 355, 15, 'level'),
(293, 297, 0, 'tm'),
(293, 322, 0, 'tm'),
(293, 333, 0, 'tm'),
(293, 349, 0, 'tm'),
(293, 320, 0, 'tm'),
(294, 353, 43, 'level'),
(294, 288, 12, 'level'),
(294, 340, 22, 'level'),
(294, 297, 0, 'tm'),
(294, 396, 0, 'tm'),
(294, 393, 0, 'tm'),
(295, 252, 17, 'level'),
(295, 378, 5, 'level'),
(295, 372, 1, 'level'),
(295, 297, 0, 'tm'),
(295, 333, 0, 'tm'),
(296, 286, 1, 'level'),
(296, 263, 5, 'level'),
(296, 297, 0, 'tm'),
(296, 341, 0, 'tm'),
(297, 298, 41, 'level'),
(297, 342, 17, 'level'),
(297, 266, 5, 'level'),
(297, 297, 0, 'tm'),
(297, 345, 0, 'tm'),
(298, 345, 9, 'level'),
(298, 297, 0, 'tm'),
(298, 345, 0, 'tm'),
(299, 351, 22, 'level'),
(299, 312, 1, 'level'),
(299, 297, 0, 'tm'),
(300, 328, 40, 'level'),
(300, 341, 26, 'level'),
(300, 317, 19, 'level'),
(300, 359, 33, 'level'),
(300, 297, 0, 'tm'),
(300, 341, 0, 'tm'),
(300, 320, 0, 'tm'),
(300, 393, 0, 'tm'),
(301, 292, 1, 'level'),
(301, 360, 37, 'level'),
(301, 268, 1, 'level'),
(301, 297, 0, 'tm'),
(301, 322, 0, 'tm'),
(302, 370, 50, 'level'),
(302, 318, 19, 'level'),
(302, 304, 10, 'level'),
(302, 268, 1, 'level'),
(302, 297, 0, 'tm'),
(303, 293, 30, 'level'),
(303, 347, 11, 'level'),
(303, 297, 0, 'tm'),
(304, 297, 19, 'level'),
(304, 326, 11, 'level'),
(304, 319, 1, 'level'),
(304, 298, 39, 'level'),
(304, 297, 0, 'tm'),
(304, 322, 0, 'tm'),
(304, 320, 0, 'tm'),
(305, 370, 48, 'level'),
(305, 295, 3, 'level'),
(305, 292, 18, 'level'),
(305, 306, 22, 'level'),
(305, 360, 55, 'level'),
(305, 268, 1, 'level'),
(305, 297, 0, 'tm'),
(306, 273, 7, 'level'),
(306, 331, 43, 'level'),
(306, 297, 0, 'tm'),
(307, 297, 42, 'level'),
(307, 293, 34, 'level'),
(307, 328, 45, 'level'),
(307, 347, 27, 'level'),
(307, 297, 0, 'tm'),
(307, 345, 0, 'tm'),
(308, 310, 21, 'level'),
(308, 297, 0, 'tm'),
(308, 333, 0, 'tm'),
(309, 293, 1, 'level'),
(309, 339, 25, 'level'),
(309, 271, 13, 'level'),
(309, 309, 1, 'level'),
(309, 297, 0, 'tm'),
(310, 273, 1, 'level'),
(310, 321, 28, 'level'),
(310, 297, 0, 'tm'),
(311, 293, 11, 'level'),
(311, 349, 28, 'level'),
(311, 322, 41, 'level'),
(311, 297, 0, 'tm'),
(311, 322, 0, 'tm'),
(311, 349, 0, 'tm'),
(312, 283, 1, 'level'),
(312, 346, 12, 'level'),
(312, 252, 14, 'level'),
(312, 276, 18, 'level'),
(312, 297, 0, 'tm'),
(312, 341, 0, 'tm'),
(313, 293, 21, 'level'),
(313, 361, 57, 'level'),
(313, 288, 13, 'level'),
(313, 340, 9, 'level'),
(313, 322, 1, 'level'),
(313, 297, 0, 'tm'),
(313, 322, 0, 'tm'),
(313, 345, 0, 'tm'),
(314, 313, 1, 'level'),
(314, 252, 13, 'level'),
(314, 378, 3, 'level'),
(314, 256, 37, 'level'),
(314, 297, 0, 'tm'),
(314, 322, 0, 'tm'),
(315, 313, 7, 'level'),
(315, 252, 14, 'level'),
(315, 372, 1, 'level'),
(315, 297, 0, 'tm'),
(315, 333, 0, 'tm'),
(315, 345, 0, 'tm'),
(316, 287, 1, 'level'),
(316, 297, 0, 'tm'),
(316, 320, 0, 'tm'),
(317, 303, 21, 'level'),
(317, 297, 0, 'tm'),
(318, 356, 1, 'level'),
(318, 259, 24, 'level'),
(318, 297, 0, 'tm'),
(319, 379, 15, 'level'),
(319, 349, 30, 'level'),
(319, 343, 26, 'level'),
(319, 297, 0, 'tm'),
(319, 322, 0, 'tm'),
(319, 333, 0, 'tm'),
(319, 349, 0, 'tm'),
(320, 293, 40, 'level'),
(320, 262, 13, 'level'),
(320, 297, 0, 'tm'),
(320, 396, 0, 'tm'),
(320, 393, 0, 'tm'),
(321, 309, 8, 'level'),
(321, 295, 24, 'level'),
(321, 268, 1, 'level'),
(321, 297, 0, 'tm'),
(321, 341, 0, 'tm'),
(322, 286, 1, 'level'),
(322, 339, 27, 'level'),
(322, 271, 9, 'level'),
(322, 321, 32, 'level'),
(322, 268, 5, 'level'),
(322, 297, 0, 'tm'),
(323, 321, 41, 'level'),
(323, 252, 13, 'level'),
(323, 372, 1, 'level'),
(323, 297, 0, 'tm'),
(324, 272, 1, 'level'),
(324, 328, 1, 'level'),
(324, 320, 21, 'level'),
(324, 330, 1, 'level'),
(324, 297, 0, 'tm'),
(324, 320, 0, 'tm'),
(325, 297, 0, 'tm'),
(325, 333, 0, 'tm'),
(326, 271, 13, 'level'),
(326, 309, 1, 'level'),
(326, 350, 38, 'level'),
(326, 297, 0, 'tm'),
(327, 293, 16, 'level'),
(327, 354, 13, 'level'),
(327, 269, 10, 'level'),
(327, 297, 0, 'tm'),
(327, 396, 0, 'tm'),
(328, 291, 1, 'level'),
(328, 294, 5, 'level'),
(328, 297, 0, 'tm'),
(328, 349, 0, 'tm'),
(329, 375, 1, 'level'),
(329, 351, 16, 'level'),
(329, 346, 4, 'level'),
(329, 322, 40, 'level'),
(329, 268, 1, 'level'),
(329, 297, 0, 'tm'),
(329, 322, 0, 'tm'),
(329, 341, 0, 'tm'),
(330, 327, 21, 'level'),
(330, 297, 0, 'tm'),
(331, 323, 29, 'level'),
(331, 252, 17, 'level'),
(331, 270, 5, 'level'),
(331, 322, 41, 'level'),
(331, 259, 37, 'level'),
(331, 297, 0, 'tm'),
(331, 322, 0, 'tm'),
(331, 349, 0, 'tm'),
(331, 345, 0, 'tm'),
(332, 293, 13, 'level'),
(332, 328, 49, 'level'),
(332, 340, 5, 'level'),
(332, 347, 31, 'level'),
(332, 298, 55, 'level'),
(332, 269, 18, 'level'),
(332, 297, 0, 'tm'),
(332, 333, 0, 'tm'),
(333, 386, 1, 'level'),
(333, 271, 40, 'level'),
(333, 309, 1, 'level'),
(333, 253, 25, 'level'),
(333, 314, 13, 'level'),
(333, 319, 55, 'level'),
(333, 297, 0, 'tm'),
(333, 333, 0, 'tm'),
(333, 345, 0, 'tm'),
(333, 320, 0, 'tm'),
(334, 293, 22, 'level'),
(334, 297, 0, 'tm'),
(334, 345, 0, 'tm'),
(335, 293, 21, 'level'),
(335, 261, 16, 'level'),
(335, 363, 31, 'level'),
(335, 297, 0, 'tm'),
(335, 393, 0, 'tm'),
(336, 297, 0, 'tm'),
(336, 322, 0, 'tm'),
(337, 288, 21, 'level'),
(337, 392, 44, 'level'),
(337, 340, 1, 'level'),
(337, 350, 66, 'level'),
(337, 297, 0, 'tm'),
(338, 254, 1, 'level'),
(338, 297, 0, 'tm'),
(339, 293, 50, 'level'),
(339, 337, 1, 'level'),
(339, 269, 1, 'level'),
(339, 256, 28, 'level'),
(339, 297, 0, 'tm'),
(339, 322, 0, 'tm'),
(339, 333, 0, 'tm'),
(339, 349, 0, 'tm'),
(339, 396, 0, 'tm'),
(340, 367, 100, 'level'),
(340, 311, 50, 'level'),
(340, 268, 10, 'level'),
(340, 297, 0, 'tm'),
(340, 322, 0, 'tm'),
(340, 349, 0, 'tm'),
(341, 297, 0, 'tm'),
(342, 297, 0, 'tm'),
(343, 318, 1, 'level'),
(343, 297, 0, 'tm'),
(344, 309, 1, 'level'),
(344, 319, 73, 'level'),
(344, 310, 19, 'level'),
(344, 297, 0, 'tm'),
(344, 322, 0, 'tm'),
(344, 349, 0, 'tm'),
(344, 396, 0, 'tm'),
(345, 309, 1, 'level'),
(345, 319, 73, 'level'),
(345, 297, 0, 'tm'),
(345, 322, 0, 'tm'),
(345, 333, 0, 'tm'),
(345, 396, 0, 'tm'),
(345, 393, 0, 'tm'),
(346, 368, 64, 'level'),
(346, 326, 1, 'level'),
(346, 269, 1, 'level'),
(346, 297, 0, 'tm'),
(346, 396, 0, 'tm'),
(347, 324, 1, 'level'),
(347, 368, 64, 'level'),
(347, 269, 1, 'level'),
(347, 297, 0, 'tm'),
(347, 333, 0, 'tm'),
(347, 396, 0, 'tm'),
(348, 319, 73, 'level'),
(348, 297, 0, 'tm'),
(348, 322, 0, 'tm'),
(348, 396, 0, 'tm'),
(349, 293, 43, 'level'),
(349, 368, 64, 'level'),
(349, 294, 1, 'level'),
(349, 366, 50, 'level'),
(349, 269, 1, 'level'),
(349, 297, 0, 'tm'),
(349, 396, 0, 'tm'),
(350, 297, 0, 'tm'),
(351, 332, 22, 'level'),
(351, 297, 0, 'tm'),
(351, 322, 0, 'tm'),
(351, 333, 0, 'tm'),
(352, 306, 1, 'level'),
(352, 319, 72, 'level'),
(352, 297, 0, 'tm'),
(352, 345, 0, 'tm'),
(352, 320, 0, 'tm'),
(353, 376, 1, 'level'),
(353, 316, 11, 'level'),
(353, 297, 0, 'tm'),
(354, 286, 5, 'level'),
(354, 375, 1, 'level'),
(354, 297, 0, 'tm'),
(354, 322, 0, 'tm'),
(354, 349, 0, 'tm'),
(354, 396, 0, 'tm'),
(355, 297, 47, 'level'),
(355, 319, 60, 'level'),
(355, 252, 10, 'level'),
(355, 297, 0, 'tm'),
(355, 322, 0, 'tm'),
(355, 396, 0, 'tm'),
(356, 349, 39, 'level'),
(356, 297, 0, 'tm'),
(356, 322, 0, 'tm'),
(356, 349, 0, 'tm'),
(357, 272, 1, 'level'),
(357, 351, 1, 'level'),
(357, 263, 21, 'level'),
(357, 297, 0, 'tm'),
(357, 322, 0, 'tm'),
(357, 349, 0, 'tm'),
(358, 368, 15, 'level'),
(358, 326, 23, 'level'),
(358, 297, 0, 'tm'),
(359, 370, 1, 'level'),
(359, 318, 1, 'level'),
(359, 297, 0, 'tm'),
(360, 356, 42, 'level'),
(360, 297, 0, 'tm'),
(361, 345, 57, 'level'),
(361, 299, 7, 'level'),
(361, 319, 70, 'level'),
(361, 297, 0, 'tm'),
(361, 345, 0, 'tm'),
(362, 378, 9, 'level'),
(362, 360, 48, 'level'),
(362, 297, 0, 'tm'),
(362, 322, 0, 'tm'),
(362, 333, 0, 'tm'),
(363, 297, 0, 'tm'),
(363, 333, 0, 'tm'),
(364, 297, 0, 'tm'),
(364, 320, 0, 'tm'),
(364, 396, 0, 'tm'),
(365, 295, 1, 'level'),
(365, 292, 17, 'level'),
(365, 372, 8, 'level'),
(365, 360, 41, 'level'),
(365, 297, 0, 'tm'),
(366, 298, 48, 'level'),
(366, 279, 1, 'level'),
(366, 297, 0, 'tm'),
(366, 396, 0, 'tm'),
(367, 273, 7, 'level'),
(367, 288, 10, 'level'),
(367, 357, 45, 'level'),
(367, 340, 32, 'level'),
(367, 297, 0, 'tm'),
(367, 396, 0, 'tm'),
(368, 286, 12, 'level'),
(368, 317, 23, 'level'),
(368, 297, 0, 'tm'),
(368, 341, 0, 'tm'),
(369, 286, 12, 'level'),
(369, 254, 9, 'level'),
(369, 297, 0, 'tm'),
(369, 322, 0, 'tm'),
(369, 341, 0, 'tm'),
(370, 377, 1, 'level'),
(370, 369, 1, 'level'),
(370, 297, 0, 'tm'),
(370, 322, 0, 'tm'),
(370, 333, 0, 'tm'),
(370, 345, 0, 'tm'),
(370, 396, 0, 'tm'),
(371, 257, 10, 'level'),
(371, 297, 0, 'tm'),
(371, 396, 0, 'tm'),
(372, 294, 13, 'level'),
(372, 297, 0, 'tm'),
(372, 333, 0, 'tm'),
(373, 378, 9, 'level'),
(373, 297, 0, 'tm'),
(374, 303, 40, 'level'),
(374, 340, 1, 'level'),
(374, 297, 0, 'tm'),
(374, 322, 0, 'tm'),
(374, 349, 0, 'tm'),
(374, 345, 0, 'tm'),
(375, 379, 20, 'level'),
(375, 333, 34, 'level'),
(375, 369, 17, 'level'),
(375, 297, 0, 'tm'),
(375, 322, 0, 'tm'),
(375, 333, 0, 'tm'),
(376, 291, 8, 'level'),
(376, 272, 1, 'level'),
(376, 297, 0, 'tm'),
(376, 320, 0, 'tm'),
(377, 286, 1, 'level'),
(377, 330, 50, 'level'),
(377, 268, 5, 'level'),
(377, 297, 0, 'tm'),
(377, 396, 0, 'tm'),
(378, 309, 8, 'level'),
(378, 297, 0, 'tm'),
(379, 309, 5, 'level'),
(379, 356, 54, 'level'),
(379, 297, 0, 'tm'),
(379, 396, 0, 'tm'),
(380, 293, 4, 'level'),
(380, 309, 1, 'level'),
(380, 297, 0, 'tm'),
(380, 333, 0, 'tm'),
(380, 320, 0, 'tm'),
(381, 291, 20, 'level'),
(381, 272, 1, 'level'),
(381, 294, 10, 'level'),
(381, 325, 26, 'level'),
(381, 297, 0, 'tm'),
(381, 320, 0, 'tm'),
(382, 296, 1, 'level'),
(382, 310, 23, 'level'),
(382, 263, 1, 'level'),
(382, 371, 75, 'level'),
(382, 268, 5, 'level'),
(382, 297, 0, 'tm'),
(382, 322, 0, 'tm'),
(382, 349, 0, 'tm'),
(383, 291, 5, 'level'),
(383, 373, 50, 'level'),
(383, 272, 1, 'level'),
(383, 297, 0, 'tm'),
(383, 320, 0, 'tm'),
(384, 309, 6, 'level'),
(384, 297, 0, 'tm'),
(384, 333, 0, 'tm'),
(385, 339, 16, 'level'),
(385, 383, 1, 'level'),
(385, 303, 39, 'level'),
(385, 387, 1, 'level'),
(385, 309, 11, 'level'),
(385, 322, 1, 'level'),
(385, 297, 0, 'tm'),
(385, 322, 0, 'tm'),
(385, 349, 0, 'tm'),
(385, 345, 0, 'tm'),
(386, 384, 1, 'level'),
(386, 293, 39, 'level'),
(386, 288, 29, 'level'),
(386, 326, 14, 'level'),
(386, 388, 1, 'level'),
(386, 297, 0, 'tm'),
(386, 322, 0, 'tm'),
(386, 349, 0, 'tm'),
(386, 345, 0, 'tm'),
(386, 396, 0, 'tm'),
(387, 294, 16, 'level'),
(387, 252, 29, 'level'),
(387, 378, 11, 'level'),
(387, 297, 0, 'tm'),
(387, 349, 0, 'tm'),
(388, 303, 33, 'level'),
(388, 263, 13, 'level'),
(388, 322, 0, 'tm'),
(389, 293, 31, 'level'),
(389, 290, 37, 'level'),
(389, 297, 0, 'tm'),
(389, 322, 0, 'tm'),
(390, 349, 19, 'level'),
(390, 254, 1, 'level'),
(390, 297, 0, 'tm'),
(390, 333, 0, 'tm'),
(390, 349, 0, 'tm'),
(391, 286, 1, 'level'),
(391, 380, 22, 'level'),
(391, 385, 37, 'level'),
(391, 287, 25, 'level'),
(391, 297, 0, 'tm'),
(391, 396, 0, 'tm'),
(392, 303, 20, 'level'),
(392, 310, 13, 'level'),
(392, 252, 23, 'level'),
(392, 304, 26, 'level'),
(392, 297, 0, 'tm'),
(392, 322, 0, 'tm'),
(392, 349, 0, 'tm'),
(393, 389, 1, 'level'),
(393, 295, 21, 'level'),
(393, 351, 10, 'level'),
(393, 311, 13, 'level'),
(393, 268, 1, 'level'),
(393, 297, 0, 'tm'),
(393, 322, 0, 'tm'),
(393, 349, 0, 'tm'),
(394, 293, 37, 'level'),
(394, 328, 45, 'level'),
(394, 316, 12, 'level'),
(394, 397, 1, 'level'),
(394, 297, 0, 'tm'),
(395, 401, 22, 'level'),
(395, 321, 14, 'level'),
(395, 297, 0, 'tm'),
(395, 322, 0, 'tm'),
(396, 278, 29, 'level'),
(396, 341, 25, 'level'),
(396, 297, 0, 'tm'),
(396, 341, 0, 'tm'),
(397, 386, 24, 'level'),
(397, 258, 43, 'level'),
(397, 298, 45, 'level'),
(397, 257, 17, 'level'),
(397, 297, 0, 'tm'),
(397, 345, 0, 'tm'),
(398, 286, 1, 'level'),
(398, 391, 37, 'level'),
(398, 297, 0, 'tm'),
(399, 370, 1, 'level'),
(399, 387, 5, 'level'),
(399, 295, 37, 'level'),
(399, 297, 0, 'tm'),
(399, 345, 0, 'tm'),
(400, 309, 4, 'level'),
(400, 296, 11, 'level'),
(400, 268, 1, 'level'),
(400, 333, 0, 'tm'),
(401, 295, 8, 'level'),
(401, 283, 1, 'level'),
(401, 341, 37, 'level'),
(401, 252, 21, 'level'),
(401, 269, 13, 'level'),
(401, 297, 0, 'tm'),
(401, 341, 0, 'tm'),
(401, 349, 0, 'tm'),
(402, 396, 14, 'level'),
(402, 319, 32, 'level'),
(402, 298, 50, 'level'),
(402, 378, 10, 'level'),
(402, 297, 0, 'tm'),
(402, 345, 0, 'tm'),
(402, 396, 0, 'tm'),
(403, 295, 17, 'level'),
(403, 318, 21, 'level'),
(403, 252, 1, 'level'),
(403, 257, 29, 'level'),
(403, 372, 5, 'level'),
(403, 394, 1, 'level'),
(403, 330, 53, 'level'),
(403, 304, 25, 'level'),
(403, 297, 0, 'tm'),
(403, 322, 0, 'tm'),
(403, 349, 0, 'tm'),
(403, 345, 0, 'tm'),
(404, 370, 25, 'level'),
(404, 295, 31, 'level'),
(404, 318, 10, 'level'),
(404, 297, 0, 'tm'),
(404, 322, 0, 'tm'),
(404, 349, 0, 'tm'),
(405, 297, 0, 'tm'),
(405, 333, 0, 'tm'),
(405, 396, 0, 'tm'),
(406, 293, 18, 'level'),
(406, 297, 0, 'tm'),
(406, 322, 0, 'tm'),
(406, 349, 0, 'tm'),
(406, 345, 0, 'tm'),
(406, 320, 0, 'tm'),
(406, 396, 0, 'tm'),
(407, 351, 1, 'level'),
(407, 357, 26, 'level'),
(407, 297, 0, 'tm'),
(407, 341, 0, 'tm'),
(408, 309, 5, 'level'),
(408, 272, 1, 'level'),
(408, 268, 1, 'level'),
(408, 297, 0, 'tm'),
(409, 272, 1, 'level'),
(410, 293, 30, 'level'),
(410, 337, 55, 'level'),
(410, 307, 1, 'level'),
(410, 324, 1, 'level'),
(410, 326, 1, 'level'),
(410, 308, 25, 'level'),
(410, 325, 1, 'level'),
(410, 297, 0, 'tm'),
(410, 322, 0, 'tm'),
(411, 297, 0, 'tm'),
(411, 322, 0, 'tm'),
(411, 333, 0, 'tm'),
(411, 349, 0, 'tm'),
(411, 320, 0, 'tm'),
(412, 256, 21, 'level'),
(412, 297, 0, 'tm'),
(412, 322, 0, 'tm'),
(412, 349, 0, 'tm'),
(412, 345, 0, 'tm'),
(413, 297, 0, 'tm'),
(413, 341, 0, 'tm'),
(413, 333, 0, 'tm'),
(413, 396, 0, 'tm'),
(414, 379, 21, 'level'),
(414, 402, 33, 'level'),
(414, 297, 0, 'tm'),
(414, 322, 0, 'tm'),
(414, 333, 0, 'tm'),
(414, 320, 0, 'tm'),
(415, 309, 1, 'level'),
(415, 340, 41, 'level'),
(415, 378, 10, 'level'),
(415, 297, 0, 'tm'),
(415, 333, 0, 'tm'),
(416, 309, 4, 'level'),
(416, 297, 0, 'tm'),
(416, 341, 0, 'tm'),
(417, 282, 13, 'level'),
(417, 269, 21, 'level'),
(417, 372, 1, 'level'),
(417, 297, 0, 'tm'),
(418, 309, 1, 'level'),
(418, 390, 32, 'level'),
(418, 320, 14, 'level'),
(418, 330, 59, 'level'),
(418, 268, 1, 'level'),
(418, 256, 45, 'level'),
(418, 297, 0, 'tm'),
(418, 320, 0, 'tm'),
(418, 396, 0, 'tm'),
(419, 293, 21, 'level'),
(419, 368, 45, 'level'),
(419, 395, 1, 'level'),
(419, 297, 0, 'tm'),
(419, 396, 0, 'tm'),
(420, 273, 1, 'level'),
(420, 343, 58, 'level'),
(420, 297, 0, 'tm'),
(420, 322, 0, 'tm'),
(420, 349, 0, 'tm'),
(421, 313, 38, 'level'),
(421, 273, 1, 'level'),
(421, 309, 1, 'level'),
(421, 295, 20, 'level'),
(421, 297, 0, 'tm'),
(421, 333, 0, 'tm'),
(422, 293, 20, 'level'),
(422, 273, 1, 'level'),
(422, 387, 1, 'level'),
(422, 261, 8, 'level'),
(422, 298, 1, 'level'),
(422, 356, 32, 'level'),
(422, 297, 0, 'tm'),
(422, 396, 0, 'tm'),
(422, 393, 0, 'tm'),
(423, 273, 1, 'level'),
(423, 321, 32, 'level'),
(423, 297, 0, 'tm'),
(423, 393, 0, 'tm'),
(424, 361, 37, 'level'),
(424, 271, 7, 'level'),
(424, 296, 31, 'level'),
(424, 399, 1, 'level'),
(424, 368, 59, 'level'),
(424, 400, 1, 'level'),
(424, 297, 0, 'tm'),
(424, 333, 0, 'tm'),
(424, 349, 0, 'tm'),
(424, 320, 0, 'tm'),
(425, 361, 37, 'level'),
(425, 271, 7, 'level'),
(425, 296, 31, 'level'),
(425, 400, 1, 'level'),
(425, 297, 0, 'tm'),
(425, 333, 0, 'tm'),
(425, 349, 0, 'tm'),
(426, 313, 1, 'level'),
(426, 341, 23, 'level'),
(426, 346, 47, 'level'),
(426, 279, 1, 'level'),
(426, 297, 0, 'tm'),
(426, 341, 0, 'tm'),
(426, 333, 0, 'tm'),
(426, 396, 0, 'tm'),
(427, 380, 1, 'level'),
(427, 272, 1, 'level'),
(427, 391, 53, 'level'),
(427, 253, 37, 'level'),
(427, 319, 47, 'level'),
(427, 298, 67, 'level'),
(427, 297, 0, 'tm'),
(427, 345, 0, 'tm'),
(427, 320, 0, 'tm'),
(428, 391, 47, 'level'),
(428, 311, 23, 'level'),
(428, 259, 31, 'level'),
(428, 257, 13, 'level'),
(428, 297, 0, 'tm'),
(428, 322, 0, 'tm'),
(428, 345, 0, 'tm'),
(429, 377, 29, 'level'),
(429, 300, 1, 'level'),
(429, 330, 59, 'level'),
(429, 297, 0, 'tm'),
(429, 333, 0, 'tm'),
(429, 396, 0, 'tm'),
(430, 272, 1, 'level'),
(430, 268, 1, 'level'),
(430, 297, 0, 'tm'),
(430, 349, 0, 'tm'),
(430, 320, 0, 'tm'),
(430, 396, 0, 'tm'),
(430, 393, 0, 'tm'),
(431, 310, 1, 'level'),
(431, 255, 1, 'level'),
(431, 393, 0, 'tm'),
(432, 396, 13, 'level'),
(432, 319, 43, 'level'),
(432, 269, 1, 'level'),
(432, 257, 7, 'level'),
(432, 359, 19, 'level'),
(432, 297, 0, 'tm'),
(432, 320, 0, 'tm'),
(432, 396, 0, 'tm'),
(433, 296, 1, 'level'),
(433, 333, 1, 'level'),
(433, 403, 50, 'level'),
(433, 398, 73, 'level'),
(433, 297, 0, 'tm'),
(433, 333, 0, 'tm'),
(433, 320, 0, 'tm'),
(433, 396, 0, 'tm'),
(433, 393, 0, 'tm'),
(434, 348, 1, 'level'),
(434, 264, 1, 'level'),
(434, 333, 0, 'tm'),
(434, 320, 0, 'tm'),
(435, 260, 15, 'level'),
(435, 323, 5, 'level'),
(435, 314, 26, 'level'),
(435, 259, 35, 'level'),
(435, 297, 0, 'tm'),
(435, 349, 0, 'tm'),
(435, 345, 0, 'tm'),
(436, 341, 13, 'level'),
(436, 310, 1, 'level'),
(436, 297, 0, 'tm'),
(436, 322, 0, 'tm'),
(436, 341, 0, 'tm'),
(436, 349, 0, 'tm'),
(436, 393, 0, 'tm'),
(437, 297, 0, 'tm'),
(437, 320, 0, 'tm'),
(437, 396, 0, 'tm'),
(438, 271, 23, 'level'),
(438, 309, 1, 'level'),
(438, 297, 0, 'tm'),
(439, 288, 12, 'level'),
(439, 340, 5, 'level'),
(439, 297, 0, 'tm'),
(439, 349, 0, 'tm'),
(439, 345, 0, 'tm'),
(439, 396, 0, 'tm'),
(441, 286, 5, 'level'),
(441, 375, 1, 'level'),
(441, 297, 0, 'tm'),
(441, 322, 0, 'tm'),
(441, 349, 0, 'tm'),
(441, 396, 0, 'tm'),
(442, 379, 29, 'level'),
(442, 343, 13, 'level'),
(442, 372, 7, 'level'),
(442, 256, 37, 'level'),
(442, 297, 0, 'tm'),
(442, 333, 0, 'tm')
on conflict (line_id, move_id, how) do update set lv = excluded.lv;
-- 지우개굴닌자: 파도타기 (대신 쓰던 기술) 대신 물수리검
delete from public.learnset where line_id = 441 and move_id = 59 and how = 'level';

-- 기술머신 52~60 (7세대 기술머신 중 새 기술: 객기 · 유턴 · 베놈쇼크 · 차지빔 · 애크러뱃 · 로킥 · 자이로볼 · 세차게휘두르기 · 스마트혼). 01~51 은 그대로
insert into public.items (key, name, pocket, description, effect, drops, move_id, sort) values
 ('boost01', '실크스카프', 'hold', '지니게 하면 노말 타입 기술의 위력이 1.2배가 된다.', '{"boost": "노말"}', '{"place": 3, "battle": 2}', null, 0),
 ('boost02', '목탄', 'hold', '지니게 하면 불꽃 타입 기술의 위력이 1.2배가 된다.', '{"boost": "불꽃"}', '{"place": 3, "battle": 2}', null, 1),
 ('boost03', '신비의물방울', 'hold', '지니게 하면 물 타입 기술의 위력이 1.2배가 된다.', '{"boost": "물"}', '{"place": 3, "battle": 2}', null, 2),
 ('boost04', '기적의씨', 'hold', '지니게 하면 풀 타입 기술의 위력이 1.2배가 된다.', '{"boost": "풀"}', '{"place": 3, "battle": 2}', null, 3),
 ('boost05', '자석', 'hold', '지니게 하면 전기 타입 기술의 위력이 1.2배가 된다.', '{"boost": "전기"}', '{"place": 3, "battle": 2}', null, 4),
 ('boost06', '녹지않는얼음', 'hold', '지니게 하면 얼음 타입 기술의 위력이 1.2배가 된다.', '{"boost": "얼음"}', '{"place": 3, "battle": 2}', null, 5),
 ('boost07', '검은띠', 'hold', '지니게 하면 격투 타입 기술의 위력이 1.2배가 된다.', '{"boost": "격투"}', '{"place": 3, "battle": 2}', null, 6),
 ('boost08', '독바늘', 'hold', '지니게 하면 독 타입 기술의 위력이 1.2배가 된다.', '{"boost": "독"}', '{"place": 3, "battle": 2}', null, 7),
 ('boost09', '부드러운모래', 'hold', '지니게 하면 땅 타입 기술의 위력이 1.2배가 된다.', '{"boost": "땅"}', '{"place": 3, "battle": 2}', null, 8),
 ('boost10', '예리한부리', 'hold', '지니게 하면 비행 타입 기술의 위력이 1.2배가 된다.', '{"boost": "비행"}', '{"place": 3, "battle": 2}', null, 9),
 ('boost11', '휘어진스푼', 'hold', '지니게 하면 에스퍼 타입 기술의 위력이 1.2배가 된다.', '{"boost": "에스퍼"}', '{"place": 3, "battle": 2}', null, 10),
 ('boost12', '은빛가루', 'hold', '지니게 하면 벌레 타입 기술의 위력이 1.2배가 된다.', '{"boost": "벌레"}', '{"place": 3, "battle": 2}', null, 11),
 ('boost13', '딱딱한돌', 'hold', '지니게 하면 바위 타입 기술의 위력이 1.2배가 된다.', '{"boost": "바위"}', '{"place": 3, "battle": 2}', null, 12),
 ('boost14', '저주의부적', 'hold', '지니게 하면 고스트 타입 기술의 위력이 1.2배가 된다.', '{"boost": "고스트"}', '{"place": 3, "battle": 2}', null, 13),
 ('boost15', '용의이빨', 'hold', '지니게 하면 드래곤 타입 기술의 위력이 1.2배가 된다.', '{"boost": "드래곤"}', '{"place": 3, "battle": 2}', null, 14),
 ('boost16', '검은안경', 'hold', '지니게 하면 악 타입 기술의 위력이 1.2배가 된다.', '{"boost": "악"}', '{"place": 3, "battle": 2}', null, 15),
 ('boost17', '금속코트', 'hold', '지니게 하면 강철 타입 기술의 위력이 1.2배가 된다.', '{"boost": "강철"}', '{"place": 3, "battle": 2}', null, 16),
 ('boost18', '요정깃털', 'hold', '지니게 하면 페어리 타입 기술의 위력이 1.2배가 된다.', '{"boost": "페어리"}', '{"place": 3, "battle": 2}', null, 17),
 ('glasses', '광각렌즈', 'hold', '지니게 하면 기술의 명중률이 조금 오른다 (1.1배).', '{"acc": 110}', '{"place": 3, "battle": 2}', null, 18),
 ('lucky', '초점렌즈', 'hold', '지니게 하면 급소에 맞히기 쉬워진다.', '{"crit": 1}', '{"place": 2, "battle": 2}', null, 19),
 ('choco', '자뭉열매', 'hold', 'HP가 절반 이하가 되면 먹어서 최대 HP의 1/4을 회복한다. 배틀마다 한 번.', '{"pinch_heal": 25}', '{"place": 4, "battle": 2}', null, 20),
 ('cushion', '먹다남은음식', 'hold', '턴이 끝날 때마다 최대 HP의 1/16을 회복한다.', '{"leftovers": 16}', '{"place": 2, "battle": 2}', null, 21),
 ('clock', '선제공격손톱', 'hold', '가끔(20%) 상대보다 먼저 움직일 수 있다.', '{"quick": 20}', '{"place": 2, "battle": 2}', null, 22),
 ('mask', '복슝열매', 'hold', '지니고 있으면 독 상태가 되지 않는다.', '{"immune": "psn"}', '{"place": 2}', null, 23),
 ('hotpack', '복분열매', 'hold', '지니고 있으면 얼음 상태가 되지 않는다.', '{"immune": "frz"}', '{"place": 2}', null, 24),
 ('bandage', '상처약', 'med', '배틀 중에 쓰면 HP를 최대 HP의 30% 회복한다.', '{"heal": 30}', '{"place": 8, "battle": 6, "practice": 8, "quiz": 3}', null, 25),
 ('ointment', '고급상처약', 'med', '배틀 중에 쓰면 HP를 최대 HP의 60% 회복한다.', '{"heal": 60}', '{"place": 4, "battle": 5, "practice": 4, "quiz": 2}', null, 26),
 ('iv', '회복약', 'med', '배틀 중에 쓰면 HP와 상태 이상을 모두 회복한다.', '{"heal": 100, "cure": true}', '{"place": 1, "battle": 2, "raid": 3}', null, 27),
 ('mint', '만병통치제', 'med', '배틀 중에 쓰면 상태 이상과 혼란을 모두 고친다.', '{"cure": true}', '{"place": 5, "battle": 3, "practice": 4, "quiz": 2}', null, 28),
 ('energy', 'PP에이드', 'med', '배틀 중에 쓰면 모든 기술의 PP가 10씩 돌아온다.', '{"pp": 10}', '{"place": 3, "battle": 3, "practice": 2}', null, 29),
 ('firstaid', '기력의조각', 'med', '배틀 중에 쓰면 기절한 포켓몬이 HP 절반으로 되살아난다.', '{"revive": 50}', '{"place": 1, "battle": 2, "raid": 2}', null, 30),
 ('candy', '이상한사탕', 'tool', '포켓몬 하나의 레벨이 1 오른다.', '{"level": 1}', '{"place": 1, "battle": 2, "quiz": 3, "raid": 4}', null, 31),
 ('tm01', '기술머신01', 'tm', '이판사판태클: 목숨을 걸고 부딪친다. 준 데미지의 1/3을 자신도 받는다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 4, 32),
 ('tm02', '기술머신02', 'tm', '소란피기: 시끄럽게 떠들며 공격한다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 8, 33),
 ('tm03', '기술머신03', 'tm', '인파이트: 몸을 던져 싸운다. 자신의 방어·특수방어가 떨어진다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 98, 34),
 ('tm04', '기술머신04', 'tm', '파동탄: 몸 안의 힘을 모아 쏜다. 반드시 맞는다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 100, 35),
 ('tm05', '기술머신05', 'tm', '브레이브버드: 날개를 접고 돌진한다. 준 데미지의 1/3을 자신도 받는다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 82, 36),
 ('tm06', '기술머신06', 'tm', '에어슬래시: 공기의 칼날로 벤다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 84, 37),
 ('tm07', '기술머신07', 'tm', '독찌르기: 독을 묻혀 찌른다. 30% 확률로 독.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 32, 38),
 ('tm08', '기술머신08', 'tm', '오물웨이브: 독으로 공격한다. 10% 확률로 상대를 독 상태로 만든다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 209, 39),
 ('tm09', '기술머신09', 'tm', '지진: 땅을 크게 흔든다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 48, 40),
 ('tm10', '기술머신10', 'tm', '대지의힘: 땅의 힘을 터뜨린다. 10% 확률로 상대 특수방어↓.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 52, 41),
 ('tm11', '기술머신11', 'tm', '스톤샤워: 큰 바위를 쏟아붓는다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 47, 42),
 ('tm12', '기술머신12', 'tm', '파워젬: 보석처럼 빛나는 광선을 쏜다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 51, 43),
 ('tm13', '기술머신13', 'tm', '메가혼: 벌레의 힘으로 공격한다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 225, 44),
 ('tm14', '기술머신14', 'tm', '벌레의야단법석: 날갯소리로 공격한다. 10% 확률로 상대 특수방어↓.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 105, 45),
 ('tm15', '기술머신15', 'tm', '섀도본: 뼈로 내리친다. 20% 확률로 상대 방어↓.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 75, 46),
 ('tm16', '기술머신16', 'tm', '섀도볼: 그림자 덩어리. 20% 확률로 상대 특수방어↓.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 78, 47),
 ('tm17', '기술머신17', 'tm', '코멧펀치: 강철로 공격한다. 20% 확률로 자신의 공격이 오른다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 243, 48),
 ('tm18', '기술머신18', 'tm', '러스터캐논: 빛의 에너지. 10% 확률로 상대 특수방어↓.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 28, 49),
 ('tm19', '기술머신19', 'tm', '플레어드라이브: 불꽃을 두르고 돌진한다. 준 데미지의 1/3을 자신도 받는다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 33, 50),
 ('tm20', '기술머신20', 'tm', '불대문자: 大 모양의 불꽃. 10% 확률로 화상.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 37, 51),
 ('tm21', '기술머신21', 'tm', '집게해머: 물로 공격한다. 급소에 잘 맞는다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 182, 52),
 ('tm22', '기술머신22', 'tm', '파도타기: 큰 파도로 덮친다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 59, 53),
 ('tm23', '기술머신23', 'tm', '우드해머: 단단한 몸통으로 친다. 준 데미지의 1/3을 자신도 받는다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 41, 54),
 ('tm24', '기술머신24', 'tm', '에너지볼: 자연의 힘. 10% 확률로 상대 특수방어↓.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 44, 55),
 ('tm25', '기술머신25', 'tm', '와일드볼트: 전기를 두르고 돌진한다. 준 데미지의 1/4을 자신도 받는다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 89, 56),
 ('tm26', '기술머신26', 'tm', '10만볼트: 강한 전격. 10% 확률로 마비.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 92, 57),
 ('tm27', '기술머신27', 'tm', '사이코팽: 마음의 힘으로 깨문다. 상대의 벽(리플렉터·빛의장막)을 깬다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 18, 58),
 ('tm28', '기술머신28', 'tm', '사이코키네시스: 강한 염동력. 10% 확률로 상대 특수방어↓.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 21, 59),
 ('tm29', '기술머신29', 'tm', '고드름떨구기: 큰 고드름을 떨어뜨린다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 11, 60),
 ('tm30', '기술머신30', 'tm', '냉동빔: 얼음 광선을 발사한다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 14, 61),
 ('tm31', '기술머신31', 'tm', '역린: 온 힘을 다해 날뛴다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 108, 62),
 ('tm32', '기술머신32', 'tm', '용의파동: 입에서 충격파를 내뿜는다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 110, 63),
 ('tm33', '기술머신33', 'tm', '속임수: 상대의 힘을 이용해 공격한다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 64, 64),
 ('tm34', '기술머신34', 'tm', '악의파동: 악의로 가득 찬 파동을 쏜다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 66, 65),
 ('tm35', '기술머신35', 'tm', '치근거리기: 친한 척 달라붙어 공격한다. 10% 확률로 상대 공격↓.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 103, 66),
 ('tm36', '기술머신36', 'tm', '문포스: 달의 힘. 30% 확률로 상대 특수공격↓.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 106, 67),
 ('tm37', '기술머신37', 'tm', '방어: 그 턴의 공격을 막는다. 연속으로 쓰면 실패하기 쉽다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 141, 68),
 ('tm38', '기술머신38', 'tm', '그림자분신: 자신의 회피율이 오른다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 169, 69),
 ('tm39', '기술머신39', 'tm', '칼춤: 투지를 높이는 춤. 공격이 크게 오른다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 116, 70),
 ('tm40', '기술머신40', 'tm', '나쁜음모: 나쁜 생각을 떠올린다. 특수공격이 크게 오른다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 117, 71),
 ('tm41', '기술머신41', 'tm', '고속이동: 몸을 가볍게 한다. 스피드가 크게 오른다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 118, 72),
 ('tm42', '기술머신42', 'tm', '명상: 마음을 가라앉힌다. 특수공격·특수방어↑.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 119, 73),
 ('tm43', '기술머신43', 'tm', '잠자기: HP를 모두 회복하고 2턴 동안 잠든다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 150, 74),
 ('tm44', '기술머신44', 'tm', '리플렉터: 5턴 동안 물리 공격 데미지를 줄인다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 144, 75),
 ('tm45', '기술머신45', 'tm', '빛의장막: 5턴 동안 특수 공격 데미지를 줄인다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 145, 76),
 ('tm46', '기술머신46', 'tm', '스피드스타: 온몸으로 공격한다. 반드시 맞는다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 164, 77),
 ('tm47', '기술머신47', 'tm', '파괴광선: 온몸으로 공격한다. 쓰고 나면 다음 턴에는 움직일 수 없다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 161, 78),
 ('tm48', '기술머신48', 'tm', '기가임팩트: 온몸으로 공격한다. 쓰고 나면 다음 턴에는 움직일 수 없다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 162, 79),
 ('tm49', '기술머신49', 'tm', '전기자석파: 약한 전기로 상대를 마비시킨다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 121, 80),
 ('tm50', '기술머신50', 'tm', '도깨비불: 불꽃으로 상대를 화상 입힌다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 123, 81),
 ('tm51', '기술머신51', 'tm', '맹독: 상대를 독 상태로 만든다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 124, 82),
 ('tm52', '기술머신52', 'tm', '객기: 자신이 독, 마비, 화상 상태일 때 날리면 기술의 위력이 2배가 된다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 297, 83),
 ('tm53', '기술머신53', 'tm', '유턴: 벌레의 힘으로 공격한다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 322, 84),
 ('tm54', '기술머신54', 'tm', '베놈쇼크: 특수한 독액을 끼얹는다. 독 상태의 상대에게는 위력이 2배가 된다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 341, 85),
 ('tm55', '기술머신55', 'tm', '차지빔: 전격의 다발을 상대에게 발사한다. 전기를 모아서 자신의 특수공격을 올릴 때가 있다. (70% 확률)', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 333, 86),
 ('tm56', '기술머신56', 'tm', '애크러뱃: 경쾌하게 상대를 공격한다. 자신이 도구를 지니고 있지 않을 때 큰 데미지를 준다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 349, 87),
 ('tm57', '기술머신57', 'tm', '로킥: 재빠른 움직임으로 상대의 다리를 노려 공격한다. 상대의 스피드를 떨어뜨린다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 345, 88),
 ('tm58', '기술머신58', 'tm', '자이로볼: 몸을 고속으로 회전시켜 몸통박치기한다. 상대보다 스피드가 낮을수록 위력은 올라간다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 320, 89),
 ('tm59', '기술머신59', 'tm', '세차게휘두르기: 자신의 몸을 세차게 휘둘러서 상대에게 데미지를 준다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 396, 90),
 ('tm60', '기술머신60', 'tm', '스마트혼: 뾰족한 뿔로 상대를 꿰찔러서 공격한다. 공격은 반드시 명중한다.', '{}', '{"place": 1, "quiz": 3, "battle": 1}', 393, 91),
 ('sp01', '특별 기술머신01', 'tm', '성스러운불꽃: 불꽃으로 공격한다. 50% 확률로 상대를 화상을 입힌다. (전설의 기술 — 누구나 배울 수 있다)', '{}', '{"raid": 1}', 177, 92),
 ('sp02', '특별 기술머신02', 'tm', '푸른불꽃: 불꽃으로 공격한다. 20% 확률로 상대를 화상을 입힌다. (전설의 기술 — 누구나 배울 수 있다)', '{}', '{"raid": 1}', 178, 93),
 ('sp03', '특별 기술머신03', 'tm', 'V제너레이트: 불꽃으로 공격한다. 자신의 방어·특수방어·스피드가 떨어진다. (전설의 기술 — 누구나 배울 수 있다)', '{}', '{"raid": 1}', 179, 94),
 ('sp04', '특별 기술머신04', 'tm', '근원의파동: 물로 공격한다. (전설의 기술 — 누구나 배울 수 있다)', '{}', '{"raid": 1}', 185, 95),
 ('sp05', '특별 기술머신05', 'tm', '시드플레어: 풀로 공격한다. 40% 확률로 상대의 특수방어가 크게 떨어진다. (전설의 기술 — 누구나 배울 수 있다)', '{}', '{"raid": 1}', 191, 96),
 ('sp06', '특별 기술머신06', 'tm', '볼트태클: 전기로 공격한다. 10% 확률로 상대를 마비시킨다. 준 데미지의 1/3을 자신도 받는다. (전설의 기술 — 누구나 배울 수 있다)', '{}', '{"raid": 1}', 195, 97),
 ('sp07', '특별 기술머신07', 'tm', '뇌격: 전기로 공격한다. 20% 확률로 상대를 마비시킨다. (전설의 기술 — 누구나 배울 수 있다)', '{}', '{"raid": 1}', 196, 98),
 ('sp08', '특별 기술머신08', 'tm', '단애의칼: 땅의 힘으로 공격한다. (전설의 기술 — 누구나 배울 수 있다)', '{}', '{"raid": 1}', 215, 99),
 ('sp09', '특별 기술머신09', 'tm', '에어로블라스트: 바람으로 공격한다. 급소에 잘 맞는다. (전설의 기술 — 누구나 배울 수 있다)', '{}', '{"raid": 1}', 218, 100),
 ('sp10', '특별 기술머신10', 'tm', '시간의포효: 용의 힘으로 공격한다. 쓰고 나면 다음 턴에는 움직일 수 없다. (전설의 기술 — 누구나 배울 수 있다)', '{}', '{"raid": 1}', 236, 101),
 ('sp11', '특별 기술머신11', 'tm', '공간절단: 용의 힘으로 공격한다. 급소에 잘 맞는다. (전설의 기술 — 누구나 배울 수 있다)', '{}', '{"raid": 1}', 237, 102),
 ('sp12', '특별 기술머신12', 'tm', '파멸의빛: 요정의 힘으로 공격한다. 준 데미지의 1/2을 자신도 받는다. (전설의 기술 — 누구나 배울 수 있다)', '{}', '{"raid": 1}', 246, 103),
 ('sp13', '특별 기술머신13', 'tm', '플뢰르캐논: 요정의 힘으로 공격한다. 자신의 특수공격이 크게 떨어진다. (전설의 기술 — 누구나 배울 수 있다)', '{}', '{"raid": 1}', 247, 104),
 ('pm01', '영구 기술머신01', 'tm', '방어: 그 턴의 공격을 막는다. 연속으로 쓰면 실패하기 쉽다. (써도 없어지지 않는다 — 여러 포켓몬에게 가르칠 수 있다)', '{"permanent": true}', '{"raid": 0.4, "battle": 0.15}', 141, 105),
 ('pm02', '영구 기술머신02', 'tm', '스피드스타: 온몸으로 공격한다. 반드시 맞는다. (써도 없어지지 않는다 — 여러 포켓몬에게 가르칠 수 있다)', '{"permanent": true}', '{"raid": 0.4, "battle": 0.15}', 164, 106),
 ('pm03', '영구 기술머신03', 'tm', '그림자분신: 자신의 회피율이 오른다. (써도 없어지지 않는다 — 여러 포켓몬에게 가르칠 수 있다)', '{"permanent": true}', '{"raid": 0.4, "battle": 0.15}', 169, 107)
on conflict (key) do update set name = excluded.name, pocket = excluded.pocket, description = excluded.description, effect = excluded.effect, drops = excluded.drops, move_id = excluded.move_id, sort = excluded.sort;

-- ── B. 이로치 레이드 (운영자가 레이드를 열 때 "이로치 레이드" 체크) ──────────────────────────────────────────
--   raids.shiny · admin_create_raid(…, p_shiny) · _raid_json 'shiny' (TV · 레이드 목록 · 레이드 화면이 반짝이는 그림 + ✦)
--   이기면 보상이 반드시 반짝: 티켓 방식 = tickets.shiny true, 잡기 방식 = raid_encounters.shiny true (→ 잡으면 shiny = shiny_on = true)
--   시간대 전설 레이드 (kind 'slot') 는 그대로 (false).
alter table public.raids add column if not exists shiny boolean not null default false;
drop function if exists public.admin_create_raid(int, int, int, boolean, text, text);
create or replace function public.admin_create_raid(p_species int, p_hp int, p_minutes int, p_tv boolean default true,
                                                    p_title text default null, p_kind text default 'admin', p_shiny boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.raids;
begin
  perform public._assert_admin();
  if not exists (select 1 from public.species where id = p_species) then raise exception 'BAD_SPECIES'; end if;
  if coalesce(p_hp, 0) not between 10 and 10000000 or coalesce(p_minutes, 0) not between 1 and 600 then raise exception 'BAD_RAID'; end if;
  if p_kind not in ('admin', 'legend') then raise exception 'BAD_RAID'; end if;
  insert into public.raids (species_id, kind, title, tv, token, hp_max, hp, ends_at, created_by, shiny)
  values (p_species, p_kind, coalesce(nullif(btrim(p_title), ''), (select name from public.species where id = p_species) || ' 레이드'),
          coalesce(p_tv, true), public._rand(10, 'abcdef0123456789'), p_hp, p_hp, now() + make_interval(mins => p_minutes), auth.uid(), coalesce(p_shiny, false))
  returning * into r;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('raid', r.id, 'species', p_species, 'shiny', r.shiny));
  return public._raid_json(r, null) || jsonb_build_object('q', 'R' || r.id, 't', r.token);
end $$;

create or replace function public._raid_json(r public.raids, uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id, 'species_id', r.species_id, 'kind', r.kind, 'title', r.title, 'tv', r.tv, 'shiny', r.shiny,
    'hp', r.hp, 'hp_max', r.hp_max, 'status', r.status, 'starts_at', r.starts_at, 'ends_at', r.ends_at, 'ended_at', r.ended_at,
    'server_time', now(),
    'players', (select count(*) from public.raid_players where raid_id = r.id),
    'me', (select jsonb_build_object('damage', p.damage, 'taps', p.taps, 'line_id', p.line_id, 'mon_id', p.mon_id, 'rewarded', p.rewarded,
                                     'per_tap', public._raid_per_tap(uid, p.mon_id, r.species_id))
           from public.raid_players p where p.raid_id = r.id and p.user_id = uid),
    'top', coalesce((select jsonb_agg(jsonb_build_object('display', public._display_name(pr), 'damage', p.damage) order by p.damage desc)
                     from (select * from public.raid_players where raid_id = r.id order by damage desc limit 5) p
                     join public.profiles pr on pr.user_id = p.user_id), '[]'))
$$;

create or replace function public.raid_join(p_q text, p_t text, p_mon bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); r public.raids; ok boolean := false; w bigint; c public.collection;
  win_sec int := (public._setting('rotating_window_sec'))::int;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._assert_open();
  perform public._raid_sweep();
  if coalesce(p_q, '') !~* '^R[0-9]{1,5}$' then raise exception 'RAID_NOT_FOUND'; end if;
  select * into r from public.raids where id = substr(p_q, 2)::bigint;
  if not found then raise exception 'RAID_NOT_FOUND'; end if;
  if r.status <> 'active' or now() < r.starts_at then raise exception 'RAID_OVER'; end if;
  if r.tv then
    w := floor(extract(epoch from now()) / win_sec);
    for i in 0 .. greatest(1, 90 / win_sec) loop
      if public._raid_token(r, w - i) = lower(p_t) then ok := true; exit; end if;
    end loop;
  else
    ok := r.token = lower(p_t);
  end if;
  if not ok then raise exception 'RAID_BAD_TOKEN'; end if;
  select * into c from public.collection where id = p_mon and user_id = uid and released_at is null;
  insert into public.raid_players (raid_id, user_id, line_id, mon_id)
  values (r.id, uid, c.line_id, c.id)
  on conflict (raid_id, user_id) do nothing;
  return public._raid_json(r, uid);
end $$;

create or replace function public._raid_finish(rid bigint, won boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.raids; p record; minimum int := coalesce((public._setting('raid_min_taps'))::int, 1);
  catch_mode boolean := public._setting('raid_reward_mode') #>> '{}' = 'catch';
  balls int := greatest(1, coalesce((public._setting('raid_catch_balls'))::int, 10));
begin
  update public.raids set status = case when won then 'won' else 'failed' end, ended_at = now(), hp = case when won then 0 else hp end
   where id = rid and status = 'active' returning * into r;
  if not found or not won then return; end if;
  for p in select * from public.raid_players where raid_id = rid and taps >= minimum for update loop
    if catch_mode then
      insert into public.raid_encounters (user_id, raid_id, species_id, balls, shiny) values (p.user_id, rid, r.species_id, balls, r.shiny);   -- 이로치 레이드 = 반드시 반짝 (아니면 트리거가 굴림)
    else
      if r.shiny then   -- 이로치 레이드: 반드시 반짝이는 특별 티켓 (알림에 '✦ 반짝이는 색이에요! ✦')
        insert into public.tickets (nonce, user_id, qr_id, token, special, fixed_species, shiny)
        values (public._rand(12, 'abcdefghijklmnopqrstuvwxyz0123456789'), p.user_id, 'RAID', 'raid', 'raid', r.species_id, true);
      else
        perform public._grant_special(p.user_id, r.species_id, 'raid');
      end if;
    end if;
    update public.raid_players set rewarded = true where raid_id = rid and user_id = p.user_id;
    perform public._egg_new(p.user_id, 'yellow', 'raid');
  end loop;
  insert into public.events (kind, data) values ('raid_won', jsonb_build_object('raid', rid, 'species', r.species_id, 'mode', case when catch_mode then 'catch' else 'ticket' end, 'shiny', r.shiny));
end $$;

-- sync 상태의 raids_live 에도 shiny (0042 _state 그대로 + 'shiny')
create or replace function public._state(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public._state_base(uid) || jsonb_build_object(
    'roulette', public._roulette_json(uid),
    'special', coalesce((select jsonb_agg(jsonb_build_object('nonce', t.nonce, 'special', t.special, 'species_id', t.fixed_species))
                         from public.tickets t where t.user_id = uid and t.status = 'pending' and t.special is not null), '[]'),
    'raids_live', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'species_id', r.species_id, 'ends_at', r.ends_at, 'shiny', r.shiny))
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


-- 이벤트 포켓몬 기본 기술 + 이미 받은 것
delete from public.species_moves where species_id in (1321, 1324);
insert into public.species_moves (species_id, slot, move_id) values
 (1321, 1, 375), (1321, 2, 66), (1321, 3, 62), (1321, 4, 231),
 (1324, 1, 92), (1324, 2, 113), (1324, 3, 26), (1324, 4, 343);
update public.collection set moves = array_replace(moves, 59, 375) where line_id = 441 and 59 = any (moves);
update public.collection set moves = array_replace(moves, 93, 343) where line_id = 442 and 93 = any (moves);

-- rule (0006): every migration that creates functions ends with this block (copied from 0046; only change: admin_create_raid gets p_shiny boolean)
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
  public.set_nickname(text), public.admin_clear_nickname(text)
to authenticated;
notify pgrst, 'reload schema';
