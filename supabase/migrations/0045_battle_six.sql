-- 0045: 배틀 팀 최대 6마리 (트레이너 카드의 배틀 팀 6칸과 같게) — 형식별 고정 마릿수 (1 대 1 = 3, 2 대 2 = 4) 를 없앤다
--  A. 배틀 팀 = 박스의 서로 다른 포켓몬 1~6마리 (battle_set_team · 모든 배틀 시작). 2 대 2 는 2마리 이상 (DOUBLE_NEEDS_2).
--  B. 연습 배틀 (AI): AI 도 내 팀과 같은 마릿수 (마리마다 같은 단계의 다른 계열 — 계열 번호를 species.line_id 로 빼서 겹치지 않게).
--  C. 친구 QR (친구 팀 vs AI · 실시간): 각자 저장한 배틀 팀을 순서대로, N = min(내 마릿수, 친구 마릿수) 만큼 앞에서부터.
--     친구가 팀을 저장하지 않았으면 박스에서 단계 · 레벨 높은 순으로 (내 마릿수까지).
--     2 대 2 에서 N < 2 → 내 쪽이 모자라면 DOUBLE_NEEDS_2, 친구 쪽이면 FRIEND_DOUBLE_NEEDS_2.
--     실시간: 신청할 때 신청한 사람 팀 전체를 저장 → 수락할 때 N 을 정하고 신청한 사람 쪽을 앞 N 마리로 다시 만든다.
--  D. 턴 제한 (battle_turn_cap, 기본 20) 은 3마리 (2 대 2 는 4마리) 기준 → 팀이 크면 비례해서 늘어남 (6 대 6: 1 대 1 = 40턴, 2 대 2 = 30턴). _bt_cap.
--  E. battle_peek · battle_inbox 가 상대 팀 마릿수 ('count') 를 같이 알려줌.
--  F. 동시에 고르기 (같은 학생 두 기기 · 두 창): battle_act 의 첫 줄 잠금은 lock_timeout 3초 → 못 잡으면 BATTLE_BUSY (예전: 8초 statement timeout → HTTP 500).
--     _bt_timeout 은 마감이 안 지났으면 잠그지 않음 (battle_state 폴링이 턴 풀기 뒤에서 줄 서지 않게).
--     스테이징에는 0045_battle_six_a (함수) · _b_grants · _c_busy 세 번에 나눠 넣음 (이 파일 = 셋을 합친 것).
--  배틀 state 모양은 그대로 (sides[].mons 길이만 달라짐) → 하던 배틀 · 보낸 신청은 그대로 이어서 됨 (지울 것 없음).
--  보상 규칙 (진화의 돌 · 경험치 · 물건 · 하루 횟수) 은 마릿수와 상관없어 그대로. 트레이너 카드는 예전처럼 bag_state.team (_team_mons) 을 읽음.

-- ── 1. 도우미 ────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._bt_nmax(fmt text) returns int
language sql immutable set search_path = '' as $$ select 6 $$;

create or replace function public._bt_min(fmt text) returns int
language sql immutable set search_path = '' as $$ select case when fmt = 'double' then 2 else 1 end $$;

-- 턴 제한: 설정값은 3마리 (2 대 2 = 4마리) 기준, 큰 팀은 비례해서 늘림 (작은 팀은 그대로)
create or replace function public._bt_cap(st jsonb) returns int
language sql stable security definer set search_path = '' as $$
  select greatest(c, ceil(c * greatest(coalesce(jsonb_array_length(st -> 'sides' -> 0 -> 'mons'), 0),
                                       coalesce(jsonb_array_length(st -> 'sides' -> 1 -> 'mons'), 0))::numeric
                          / (case when st ->> 'fmt' = 'double' then 4 else 3 end))::int)
    from (select coalesce((public._setting('battle_turn_cap'))::int, 20) c) x
$$;

-- 친구의 팀 (포켓몬 번호): 저장한 팀 (아직 박스에 있는 것, 순서대로, 최대 6), 없으면 단계 · 레벨 높은 순 n 마리
create or replace function public._bt_friend_team(uid uuid, n int) returns bigint[]
language plpgsql stable security definer set search_path = '' as $$
declare t bigint[];
begin
  select array(select u.x from unnest(p.team_mons) with ordinality u(x, o)
                where exists (select 1 from public.collection c where c.id = u.x and c.user_id = uid and c.released_at is null)
                order by u.o) into t
    from public.profiles p where p.user_id = uid;
  if coalesce(cardinality(t), 0) > 0 then return t[1:6]; end if;
  return array(select c.id from public.collection c where c.user_id = uid and c.released_at is null
                order by c.stage desc, c.level desc, c.id limit greatest(1, least(6, coalesce(n, 3))));
end $$;

-- ── 2. 팀 저장 ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.battle_set_team(p_mons bigint[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public._bt_team(uid, p_mons, 6);
  update public.profiles set team_mons = p_mons where user_id = uid;
  return jsonb_build_object('ok', true, 'team', to_jsonb(p_mons));
end $$;

-- ── 3. 연습 배틀: AI = 내 팀과 같은 마릿수 ─────────────────────────────────────────────────────────────────────
create or replace function public.battle_start_cpu(p_mons bigint[], p_format text default 'single', p_fair boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
     where l.active and not l.withdrawn and not l.secret and not l.bonus and l.rarity <> 'legendary'
       and s.stage = (select stage from public.species where id = x) and s.line_id <> all (used)
     order by random() limit 1;
    if y is null then raise exception 'BAD_TEAM'; end if;
    foe := foe || y; used := used || yl;
  end loop;
  select round(avg(level))::int into lv from public.collection where user_id = uid and id = any (p_mons);
  perform public._bt_close_mine(uid);
  b := public._bt_new(uid, 'cpu', null, mine, foe, fmt, coalesce(p_fair, false), coalesce(lv, 50), p_mons, null);
  return public._bt_json(b, uid);
end $$;

-- ── 4. 친구 팀 vs AI: N = min(내 마릿수, 친구 마릿수), 양쪽 앞에서 N 마리 ─────────────────────────────────────────
create or replace function public.battle_start_team(p_code text, p_mons bigint[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); fr uuid; mine int[]; fm bigint[]; foe int[]; b public.battles; fmt text; fair boolean; n int;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._assert_open();
  fr := public._bt_by_code(p_code);
  select battle_format, battle_fair into fmt, fair from public.profiles where user_id = fr;
  mine := public._bt_team(uid, p_mons, 6);
  if cardinality(mine) < public._bt_min(fmt) then raise exception 'DOUBLE_NEEDS_2'; end if;
  perform public._bt_no_pvp(uid);
  fm := public._bt_friend_team(fr, cardinality(p_mons));
  if coalesce(cardinality(fm), 0) = 0 then raise exception 'FRIEND_NO_MONSTERS'; end if;
  n := least(cardinality(p_mons), cardinality(fm));
  if n < public._bt_min(fmt) then raise exception 'FRIEND_DOUBLE_NEEDS_2'; end if;
  fm := fm[1:n];
  foe := public._bt_team(fr, fm, 6);
  perform public._bt_close_mine(uid);
  b := public._bt_new(uid, 'team', fr, mine[1:n], foe, fmt, coalesce(fair, false), null, p_mons[1:n], fm);
  return public._bt_json(b, uid);
end $$;

-- ── 5. 실시간 배틀: 신청 (내 팀 전체 저장) → 수락 (N 정하고 양쪽 앞 N 마리) ───────────────────────────────────────
create or replace function public.battle_challenge(p_code text, p_mons bigint[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); fr uuid; mine int[]; b public.battles; fmt text; fair boolean; fc int;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._assert_open();
  fr := public._bt_by_code(p_code);
  select battle_format, coalesce(battle_fair, false) into fmt, fair from public.profiles where user_id = fr;
  mine := public._bt_team(uid, p_mons, 6);
  if cardinality(mine) < public._bt_min(fmt) then raise exception 'DOUBLE_NEEDS_2'; end if;
  perform public._bt_no_pvp(uid);
  fc := coalesce(cardinality(public._bt_friend_team(fr, 6)), 0);
  if fc = 0 then raise exception 'FRIEND_NO_MONSTERS'; end if;
  if fc < public._bt_min(fmt) then raise exception 'FRIEND_DOUBLE_NEEDS_2'; end if;
  if exists (select 1 from public.battles where mode = 'pvp' and status = 'active' and (p1 = fr or p2 = fr)) then raise exception 'FRIEND_BUSY'; end if;
  perform public._bt_close_mine(uid);
  insert into public.battles (mode, format, status, p1, p2, state, deadline)
  values ('pvp', fmt, 'invite', uid, fr,
          jsonb_build_object('turn', 0, 'fmt', fmt, 'fair', fair, 'field', public._bt_field(),
                             'sides', jsonb_build_array(public._bt_side(mine, fmt, uid, null, fair, p_mons))),
          now() + make_interval(secs => coalesce((public._setting('battle_invite_sec'))::int, 60)))
  returning * into b;
  return public._bt_json(b, uid);
end $$;

create or replace function public.battle_accept(p_id bigint, p_mons bigint[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); b public.battles; mine int[]; n int; m0 bigint[]; s0 jsonb; fair boolean;
begin
  perform public._bt_timeout(p_id);
  select * into b from public.battles where id = p_id and p2 = uid and mode = 'pvp' for update;
  if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.status <> 'invite' then raise exception 'BATTLE_INVITE_GONE'; end if;
  mine := public._bt_team(uid, p_mons, 6);
  s0 := b.state -> 'sides' -> 0;
  n := least(cardinality(mine), coalesce(jsonb_array_length(s0 -> 'mons'), 0));
  if n < public._bt_min(b.format) then raise exception 'DOUBLE_NEEDS_2'; end if;
  perform public._bt_no_pvp(uid);
  perform public._bt_close_mine(uid);
  fair := coalesce((b.state ->> 'fair')::boolean, false);
  if jsonb_array_length(s0 -> 'mons') > n then   -- 신청한 사람 쪽을 앞 N 마리로 다시 (타입 시너지도 N 마리 기준)
    m0 := array(select (x ->> 'mon')::bigint from jsonb_array_elements(s0 -> 'mons') with ordinality y(x, o) where o <= n order by o);
    s0 := public._bt_side(public._bt_team(b.p1, m0, 6), b.format, b.p1, null, fair, m0);
  end if;
  update public.battles set status = 'active', updated_at = now(),
         state = jsonb_set(state, '{sides}', jsonb_build_array(s0, public._bt_side(mine[1:n], b.format, uid, null, fair, p_mons[1:n]))),
         deadline = now() + make_interval(secs => coalesce((public._setting('battle_turn_sec'))::int, 30))
   where id = p_id returning * into b;
  return public._bt_json(b, uid);
end $$;

-- ── 6. 상대 팀 마릿수 알려주기 ───────────────────────────────────────────────────────────────────────────────
create or replace function public.battle_peek(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare fr uuid := public._bt_by_code(p_code); p public.profiles;
begin
  select * into p from public.profiles where user_id = fr;
  return jsonb_build_object('name', public._display_name(p), 'format', p.battle_format, 'fair', p.battle_fair,
                            'count', coalesce(cardinality(public._bt_friend_team(fr, 6)), 0));
end $$;

create or replace function public.battle_inbox() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r record;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  for r in select id from public.battles where (p1 = uid or p2 = uid) and status in ('invite', 'active') and deadline < now() loop
    perform public._bt_timeout(r.id);
  end loop;
  return jsonb_build_object(
    'invites', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'from', public._display_name(p), 'format', b.format, 'deadline', b.deadline,
                                                             'count', coalesce(jsonb_array_length(b.state -> 'sides' -> 0 -> 'mons'), 0)) order by b.id)
                         from public.battles b join public.profiles p on p.user_id = b.p1
                         where b.p2 = uid and b.mode = 'pvp' and b.status = 'invite'), '[]'),
    'active', (select jsonb_build_object('id', b.id, 'mode', b.mode, 'status', b.status, 'format', b.format) from public.battles b
                where ((b.p1 = uid and b.status in ('active', 'invite')) or (b.p2 = uid and b.mode = 'pvp' and b.status = 'active'))
                order by b.id desc limit 1),
    'server_time', now());
end $$;

-- ── 7. 턴 제한 = _bt_cap (0020 _bt_resolve · 0039 _bt_json 그대로, cap 만 바뀜) ────────────────────────────────────
create or replace function public._bt_resolve(bid bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.battles; st jsonb; lg jsonb := '[]'; s int; u int; need int[] := '{}'; a0 int; a1 int; nxt int;
  ai_side boolean; bench int[]; slots int[]; r0 numeric; r1 numeric; cap int;
begin
  select * into b from public.battles where id = bid for update;
  if b.status <> 'active' then return; end if;
  st := b.state;
  cap := public._bt_cap(st);
  if b.phase = 'choose' then
    select * into st, lg from public._bt_turn(st, b.acts);
  else
    for u in select (x)::int from jsonb_array_elements_text(st -> 'need') x loop
      select * into st, lg from public._bt_switch(st, lg, u, (b.acts -> (u / 2)::text -> (u % 2) ->> 'switch')::int);
    end loop;
  end if;
  st := st - 'need';
  a0 := public._bt_alive(st, 0); a1 := public._bt_alive(st, 1);
  if a0 > 0 and a1 > 0 and coalesce((st ->> 'turn')::int, 0) >= cap and b.phase = 'choose' then
    select sum((m ->> 'hp')::numeric) / sum((m ->> 'max')::numeric) into r0 from jsonb_array_elements(st -> 'sides' -> 0 -> 'mons') m;
    select sum((m ->> 'hp')::numeric) / sum((m ->> 'max')::numeric) into r1 from jsonb_array_elements(st -> 'sides' -> 1 -> 'mons') m;
    lg := lg || jsonb_build_object('m', cap || '턴이 지났다! 남은 체력으로 승부를 가린다!');
    update public.battles set state = st, log = lg, seq = seq + 1, acts = '{}', updated_at = now() where id = bid;
    perform public._bt_finish(bid, (case when r0 > r1 then 0 when r1 > r0 then 1 end)::smallint);
    return;
  end if;
  if a0 = 0 or a1 = 0 then
    update public.battles set state = st, log = lg, seq = seq + 1, acts = '{}', updated_at = now() where id = bid;
    perform public._bt_finish(bid, (case when a0 = 0 and a1 = 0 then null when a0 = 0 then 1 else 0 end)::smallint);
    return;
  end if;
  for s in 0 .. 1 loop
    slots := array(select s * 2 + g from generate_series(0, jsonb_array_length(st -> 'sides' -> s -> 'act') - 1) g
                    where not public._bt_live(st, s * 2 + g));
    continue when cardinality(slots) = 0;
    bench := public._bt_bench(st, s);
    continue when cardinality(bench) = 0;
    ai_side := s = 1 and b.mode <> 'pvp';
    if ai_side or cardinality(bench) <= cardinality(slots) then
      foreach u in array slots loop
        bench := public._bt_bench(st, s);
        exit when cardinality(bench) = 0;
        nxt := case when ai_side then public._bt_ai_next(st, u) else bench[1] end;
        select * into st, lg from public._bt_switch(st, lg, u, nxt);
      end loop;
    else
      need := need || slots;
    end if;
  end loop;
  if cardinality(need) > 0 then st := st || jsonb_build_object('need', to_jsonb(need)); end if;
  update public.battles set state = st, log = lg, seq = seq + 1, acts = '{}', updated_at = now(),
         phase = case when cardinality(need) > 0 then 'replace' else 'choose' end,
         deadline = case when mode = 'pvp' then now() + make_interval(secs => coalesce((public._setting('battle_turn_sec'))::int, 30)) end
   where id = bid;
end $$;

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
    'turn_cap', public._bt_cap(b.state),
    'need', b.phase = 'replace' and (coalesce(b.state -> 'need', '[]') @> to_jsonb(me * 2) or coalesce(b.state -> 'need', '[]') @> to_jsonb(me * 2 + 1)),
    'need_slots', coalesce((select jsonb_agg((x)::int - me * 2) from jsonb_array_elements_text(b.state -> 'need') x where (x)::int / 2 = me), '[]'),
    'chosen', b.acts ? me::text, 'deadline', b.deadline, 'server_time', now(),
    'names', jsonb_build_array(
      (select public._display_name(p) from public.profiles p where p.user_id = b.p1),
      case when b.mode = 'cpu' then '연습 상대' else (select public._display_name(p) from public.profiles p where p.user_id = b.p2) end));
end $$;

-- ── 8. 동시에 고르기 (같은 학생 두 기기): 잠금을 오래 기다리지 않음 ────────────────────────────────────────────────
-- 시간이 지난 턴 · 신청 처리 (0016 그대로). 0045: 마감이 안 지났으면 줄 잠금 없이 바로 끝 → 배틀 화면 폴링 (battle_state) 이
-- 턴을 푸는 battle_act 뒤에서 줄 서지 않음
create or replace function public._bt_timeout(bid bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.battles; s int; k int; u int; v_acts jsonb; arr jsonb; bench int[]; n int;
begin
  if not exists (select 1 from public.battles where id = bid and deadline is not null and deadline <= now()) then return; end if;
  select * into b from public.battles where id = bid for update;
  if b.deadline is null or b.deadline > now() then return; end if;
  if b.status = 'invite' then
    update public.battles set status = 'cancelled', deadline = null, updated_at = now() where id = bid; return;
  end if;
  if b.status <> 'active' then return; end if;
  v_acts := b.acts;
  for s in 0 .. 1 loop
    continue when v_acts ? s::text;
    if b.phase = 'choose' then
      v_acts := v_acts || jsonb_build_object(s::text, public._bt_ai_side(b.state, s));
    elsif coalesce(b.state -> 'need', '[]') @> to_jsonb(s * 2) or coalesce(b.state -> 'need', '[]') @> to_jsonb(s * 2 + 1) then
      bench := public._bt_bench(b.state, s); arr := '[]'; n := 0;
      for k in 0 .. jsonb_array_length(b.state -> 'sides' -> s -> 'act') - 1 loop
        if (b.state -> 'need') @> to_jsonb(s * 2 + k) and n < cardinality(bench) then
          n := n + 1; arr := arr || jsonb_build_array(jsonb_build_object('switch', bench[n]));
        else
          arr := arr || jsonb_build_array(null);
        end if;
      end loop;
      v_acts := v_acts || jsonb_build_object(s::text, arr);
    end if;
  end loop;
  update public.battles set acts = v_acts where id = bid;
  perform public._bt_resolve(bid);
end $$;

-- battle_act: 0020 그대로, 처음 잠금만 lock_timeout 3초 → BATTLE_BUSY
create or replace function public.battle_act(p_id bigint, p_action jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); b public.battles; me int; m jsonb; i int; k int; u int; v jsonb; a jsonb; outp jsonb := '[]';
  used int[] := '{}'; v_acts jsonb; ready boolean; nact int; sd jsonb; it public.items; nit int := 0; want jsonb := '{}';
begin
  b := public._bt_mine(p_id);
  -- 0045: 같은 배틀을 두 곳 (두 기기 · 두 창) 에서 동시에 고르면 뒤엣것이 앞엣것 (턴 풀기) 을 기다림.
  --        3초 넘게 못 잡으면 8초 statement timeout (HTTP 500 → 앱에는 "인터넷 연결") 대신 BATTLE_BUSY 로 바로 끝낸다.
  perform set_config('lock_timeout', '3s', true);
  begin
    perform public._bt_timeout(p_id);
    select * into b from public.battles where id = p_id for update;
  exception when lock_not_available then
    raise exception 'BATTLE_BUSY';
  end;
  perform set_config('lock_timeout', '0', true);
  if b.status <> 'active' then return public._bt_json(b, uid); end if;
  me := case when uid = b.p1 then 0 else 1 end;
  if b.acts ? me::text then raise exception 'BATTLE_WAIT'; end if;
  sd := b.state -> 'sides' -> me;
  nact := jsonb_array_length(sd -> 'act');
  v := case when p_action ? 'slots' and jsonb_typeof(p_action -> 'slots') = 'array' then p_action -> 'slots' else jsonb_build_array(p_action) end;
  if b.phase = 'replace' and not (coalesce(b.state -> 'need', '[]') @> to_jsonb(me * 2) or coalesce(b.state -> 'need', '[]') @> to_jsonb(me * 2 + 1)) then
    raise exception 'BATTLE_WAIT';
  end if;
  for k in 0 .. nact - 1 loop
    u := me * 2 + k;
    a := v -> k;
    if (b.phase = 'choose' and not public._bt_live(b.state, u))
       or (b.phase = 'replace' and not (b.state -> 'need') @> to_jsonb(u)) then
      outp := outp || jsonb_build_array(null); continue;
    end if;
    if a is null or jsonb_typeof(a) <> 'object' then raise exception 'BAD_ACTION'; end if;
    if a ? 'switch' then
      i := (a ->> 'switch')::int;
      if i is null or i < 0 or i >= jsonb_array_length(sd -> 'mons') or (sd -> 'act') @> to_jsonb(i) or i = any (used)
         or (sd -> 'mons' -> i ->> 'hp')::int <= 0 then raise exception 'BAD_ACTION'; end if;
      used := used || i;
      outp := outp || jsonb_build_array(jsonb_build_object('switch', i));
    elsif a ? 'item' and b.phase = 'choose' then
      if coalesce((b.state ->> 'fair')::boolean, false) then raise exception 'NO_ITEMS_FAIR'; end if;
      nit := nit + 1;
      if coalesce((sd ->> 'items')::int, 0) + nit > coalesce((public._setting('battle_item_max'))::int, 2) then raise exception 'ITEM_LIMIT'; end if;
      select * into it from public.items where key = a ->> 'item' and pocket = 'med';
      if not found then raise exception 'BAD_ACTION'; end if;
      want := want || jsonb_build_object(it.key, coalesce((want ->> it.key)::int, 0) + 1);
      if coalesce((select qty from public.inventory where user_id = uid and item = it.key), 0) < (want ->> it.key)::int then raise exception 'NO_ITEM'; end if;
      i := (a ->> 'target')::int;
      if i is null or i < 0 or i >= jsonb_array_length(sd -> 'mons') then raise exception 'BAD_ACTION'; end if;
      if (it.effect ? 'revive') <> ((sd -> 'mons' -> i ->> 'hp')::int <= 0) then raise exception 'BAD_TARGET'; end if;
      outp := outp || jsonb_build_array(jsonb_build_object('item', it.key, 'target', i));
    elsif a ? 'move' and b.phase = 'choose' then
      m := public._bt_m(b.state, u);
      i := (a ->> 'move')::int;
      if i is null or i < 1 or i > jsonb_array_length(m -> 'moves') then raise exception 'BAD_ACTION'; end if;
      if (m -> 'moves' -> (i - 1) ->> 'pp')::int <= 0
         and exists (select 1 from jsonb_array_elements(m -> 'moves') x where (x ->> 'pp')::int > 0) then raise exception 'NO_PP'; end if;
      outp := outp || jsonb_build_array(jsonb_build_object('move', i, 'target', least(1, greatest(0, coalesce((a ->> 'target')::int, 0)))));
    else
      raise exception 'BAD_ACTION';
    end if;
  end loop;
  v_acts := b.acts || jsonb_build_object(me::text, outp);
  if b.mode <> 'pvp' and b.phase = 'choose' then v_acts := v_acts || jsonb_build_object('1', public._bt_ai_side(b.state, 1)); end if;
  ready := case when b.phase = 'choose' then v_acts ? '0' and v_acts ? '1'
                else not exists (select 1 from jsonb_array_elements_text(b.state -> 'need') x where not v_acts ? ((x)::int / 2)::text) end;
  update public.battles set acts = v_acts, updated_at = now() where id = p_id;
  if ready then perform public._bt_resolve(p_id); end if;
  return public._bt_json(public._bt_mine(p_id), uid);
end $$;

-- rule (0006): every migration that creates functions ends with this block (0043 list unchanged: no signature changes; new helpers _bt_min/_bt_cap are internal, not granted)
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
