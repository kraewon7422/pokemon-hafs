-- 0055 전설 배틀 먼저 · 잡기 확률 (원 색깔별)
--  1) 전설 (사파리존 legend_encounter · 방랑 전설 roam) 은 먼저 배틀로 쓰러트려야 잡을 수 있음.
--     · 새 만남 (raid_encounters kind legend/roam) 은 need_battle = true (설정 legend_battle_on). 예전 만남 (이 파일 전) = false → 예전처럼 바로 잡기.
--     · legend_battle(p_id, p_mons) : 내 배틀 팀 (6마리까지) vs 그 전설 1마리 (보스). 보스 = 높은 레벨 + 체력 배수 + 능력 랭크 +N (토템 보스처럼).
--       다시 부르면: 하던 배틀 그대로 / 이겼으면 bt_won = true → {won} / 졌거나 도망 (다른 배틀로 끝남 포함) → 만남 끝 (fled, 오늘 도전 1번 씀) → {lost}.
--     · 잡혔다고 적는 순간 (status pending → caught) 배틀을 이기지 않았으면 NEED_BATTLE (트리거 — legend_result · encounter_result 모두).
--     · 이긴 뒤 잡기 장면: catch_config.legend_bonus 배로 잘 잡힘.
--     · admin_legend_sim(dex, team, n): 운영자 · 시험용 — AI 끼리 n 판 (보스 강하기 맞추기).
--  2) catch_config.rates = 원 색깔 (초록 · 노랑 · 주황 · 빨강) 별 기본 잡힘 확률 · 최대 (나이스 · 커브 포함). 튕겨냄 = 1 − 잡힘.
--     설정 catch_rate_tier · catch_rate_max (운영자 페이지 축제 운영 → 잡기 확률 (원 색깔별)).
--  3) 이상한 소포: 반짝이는 (이로치) 포켓몬 — gift_codes.shiny, admin_create_gift(…, p_species, p_shiny) (함수를 지우고 다시 만듦), gift_claim 이 티켓 shiny.

-- ── 1. 만남: 배틀이 필요한가 · 그 배틀 · 이겼나 ──────────────────────────────────────────────
alter table public.raid_encounters add column if not exists need_battle boolean not null default false;
alter table public.raid_encounters add column if not exists battle_id bigint;
alter table public.raid_encounters add column if not exists bt_won boolean not null default false;

insert into public.settings (key, value) values
  ('legend_battle_on', 'true'),
  ('legend_boss_level', '55'), ('legend_boss_level_plus', '8'), ('legend_boss_level_max', '80'),
  ('legend_boss_hp_mult', '2.5'), ('legend_boss_stage', '2'), ('legend_win_catch_bonus', '1.5'),
  ('catch_rate_tier', '{"green": 0.70, "yellow": 0.50, "orange": 0.33, "red": 0.18}'),
  ('catch_rate_max', '{"green": 0.95, "yellow": 0.80, "orange": 0.60, "red": 0.45}')
on conflict (key) do nothing;

-- 새 전설 · 방랑 전설 만남 = 배틀 먼저 (설정이 꺼져 있으면 예전처럼)
create or replace function public._enc_need_battle_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('legend', 'roam') then
    new.need_battle := coalesce((public._setting('legend_battle_on'))::boolean, true);
  end if;
  return new;
end $$;
drop trigger if exists raid_encounters_need_battle on public.raid_encounters;
create trigger raid_encounters_need_battle before insert on public.raid_encounters
  for each row execute function public._enc_need_battle_trg();

-- 배틀을 이기지 않았는데 잡혔다고 적으려 하면 막음 (앱을 건너뛰고 legend_result / encounter_result 를 바로 불러도)
create or replace function public._enc_caught_gate_trg() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'caught' and new.need_battle and not new.bt_won then
    raise exception 'NEED_BATTLE';
  end if;
  return new;
end $$;
drop trigger if exists raid_encounters_caught_gate on public.raid_encounters;
create trigger raid_encounters_caught_gate before update of status on public.raid_encounters
  for each row execute function public._enc_caught_gate_trg();

-- ── 2. 보스 ─────────────────────────────────────────────────────────────────────────────────
-- 보스 레벨 = 내 팀에서 가장 높은 레벨 + legend_boss_level_plus, 적어도 legend_boss_level, 많아야 legend_boss_level_max (1~100)
create or replace function public._legend_boss_lv(best int) returns int
language sql stable security definer set search_path = '' as $$
  select greatest(1, least(100, greatest(lo, least(hi, coalesce(best, 1) + pl))))
    from (select coalesce((public._setting('legend_boss_level'))::int, 55) lo,
                 coalesce((public._setting('legend_boss_level_max'))::int, 80) hi,
                 coalesce((public._setting('legend_boss_level_plus'))::int, 8) pl) x
$$;

-- 보스 강화: 상대 쪽 첫 포켓몬 체력 × legend_boss_hp_mult (1~10, 기본 2.5), 공격 · 방어 · 특공 · 특방 랭크 + legend_boss_stage (0~3, 기본 2)
--   (AI 끼리 시험 admin_legend_sim: Lv.45 팀 6마리 ≈ 40% · Lv.55 ≈ 60% 이김, 뮤츠는 거의 못 이김)
--   (등장 특성으로 이미 바뀐 랭크에 더함 — 위협을 받으면 공격은 +0)
create or replace function public._legend_boost(st jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m jsonb := st -> 'sides' -> 1 -> 'mons' -> 0; g jsonb; k text; mx int;
  hpm numeric := least(10, greatest(1, coalesce((public._setting('legend_boss_hp_mult'))::numeric, 2.5)));
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

-- ── 3. 전설 배틀 ────────────────────────────────────────────────────────────────────────────
-- p_mons: 배틀에 낼 내 포켓몬 (없으면 저장한 배틀 팀 → 없으면 높은 단계 · 레벨 순 6마리)
-- 돌려줌: {skip} 배틀 필요 없음 (예전 만남 · 설정 꺼짐) · {battle, boss} 배틀 화면 · {won} 이김 → 잡기 · {lost, result} 짐 · {done, result} 이미 끝난 만남
create or replace function public.legend_battle(p_id bigint, p_mons bigint[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); e public.raid_encounters; b public.battles; ms bigint[]; mine int[]; best int; lv int; out jsonb;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into e from public.raid_encounters where id = p_id and user_id = uid and kind in ('legend', 'roam') for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.status <> 'pending' then
    return jsonb_build_object('done', true, 'result', coalesce(e.result, jsonb_build_object('caught', e.status = 'caught', 'fled', e.status = 'fled',
                              'species_id', e.species_id, 'new', false, 'exp', 0)));
  end if;
  if not e.need_battle then return jsonb_build_object('skip', true); end if;
  if e.bt_won then return jsonb_build_object('won', true, 'battle_id', e.battle_id); end if;
  if e.battle_id is not null then
    select * into b from public.battles where id = e.battle_id;
    if found and b.status = 'active' then
      return jsonb_build_object('battle', public._bt_json(b, uid), 'boss', b.state -> 'boss');
    end if;
    if found and b.status = 'over' and b.winner = 0 then
      update public.raid_encounters set bt_won = true where id = e.id;
      return jsonb_build_object('won', true, 'battle_id', b.id);
    end if;
    -- 졌음 · 도망 · 비김 · 다른 배틀을 시작해서 끝남 → 이번 만남은 끝 (오늘 도전 1번 씀, 전설은 자리에 그대로)
    out := jsonb_build_object('caught', false, 'fled', true, 'lost', true, 'line', (select line_id from public.species where id = e.species_id),
                              'species_id', e.species_id, 'new', false, 'level', null, 'exp', 0, 'shiny', e.shiny);
    update public.raid_encounters set status = 'fled', resolved_at = now(), grade = 'none', result = out where id = e.id;
    return jsonb_build_object('lost', true, 'result', out);
  end if;
  perform public._assert_open();
  perform public._bt_no_pvp(uid);
  ms := coalesce(p_mons, public._bt_friend_team(uid, 6));
  mine := public._bt_team(uid, ms, 6);
  select max(level) into best from public.collection where user_id = uid and id = any (ms);
  lv := public._legend_boss_lv(best);
  perform public._bt_close_mine(uid);
  b := public._bt_new(uid, 'cpu', null, mine, array[e.species_id], 'single', false, lv, ms, null);
  update public.battles set state = public._legend_boost(state) || jsonb_build_object('legend', e.id) where id = b.id returning * into b;
  update public.raid_encounters set battle_id = b.id where id = e.id;
  return jsonb_build_object('battle', public._bt_json(b, uid), 'boss', b.state -> 'boss');
end $$;

-- ── 4. 운영자 · 시험: AI 끼리 n 판 ─────────────────────────────────────────────────────────────
-- p_team: [{"sp": 종 id, "lv": 레벨}, …] (최대 6) · p_dex: 전설 전국도감 번호 · p_n: 판 수 (1~20)
-- 돌려줌 {wins, n, turns (평균), boss: {lv, max, stg, hp_mult}}. 학생은 AI 보다 잘 고르니 실제 이길 확률은 이보다 조금 높아요.
create or replace function public.admin_legend_sim(p_dex int, p_team jsonb, p_n int default 10) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare sp int := public._dex_sp(p_dex); st0 jsonb; st jsonb; lg jsonb; mons jsonb := '[]'; x jsonb; best int := 1; lv int;
  i int; t int; s int; u int; cap int; wins int := 0; tsum int := 0; n int := least(20, greatest(1, coalesce(p_n, 10))); r0 numeric; r1 numeric; sd jsonb; boss jsonb;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if sp is null then raise exception 'BAD_LEGEND'; end if;
  if p_team is null or jsonb_typeof(p_team) <> 'array' or jsonb_array_length(p_team) not between 1 and 6 then raise exception 'BAD_TEAM'; end if;
  for x in select v from jsonb_array_elements(p_team) v loop
    best := greatest(best, coalesce((x ->> 'lv')::int, 50));
  end loop;
  lv := public._legend_boss_lv(best);
  for i in 1 .. n loop
    st := jsonb_build_object('turn', 0, 'fmt', 'single', 'fair', false, 'field', null, 'sides', '[]'::jsonb);
    for s in 0 .. 1 loop
      mons := '[]';
      if s = 0 then
        for x in select v from jsonb_array_elements(p_team) v loop
          mons := mons || jsonb_build_array(public._bt_mon((x ->> 'sp')::int, least(100, greatest(1, coalesce((x ->> 'lv')::int, 50))), null, null) || '{"mon": null}');
        end loop;
      else
        mons := jsonb_build_array(public._bt_mon(sp, lv, null, null) || '{"mon": null}');
      end if;
      sd := jsonb_build_object('reflect', 0, 'light', 0, 'items', 0, 'uid', null, 'act', '[0]'::jsonb, 'mons', mons);
      sd := jsonb_set(sd, '{mons,0}', public._bt_enter(sd -> 'mons' -> 0));
      st := jsonb_set(st, '{sides}', (st -> 'sides') || jsonb_build_array(sd));
    end loop;
    select * into st, lg from public._bt_init(st);
    st := public._legend_boost(st);
    boss := st -> 'sides' -> 1 -> 'mons' -> 0;
    cap := public._bt_cap(st);
    t := 0;
    while public._bt_alive(st, 0) > 0 and public._bt_alive(st, 1) > 0 and t < cap loop
      select * into st, lg from public._bt_turn(st, jsonb_build_object('0', public._bt_ai_side(st, 0), '1', public._bt_ai_side(st, 1)));
      for s in 0 .. 1 loop
        u := s * 2;
        if not public._bt_live(st, u) and cardinality(public._bt_bench(st, s)) > 0 then
          select * into st, lg from public._bt_switch(st, lg, u, public._bt_ai_next(st, u));
        end if;
      end loop;
      t := t + 1;
    end loop;
    tsum := tsum + t;
    if public._bt_alive(st, 1) = 0 and public._bt_alive(st, 0) > 0 then wins := wins + 1;
    elsif public._bt_alive(st, 1) > 0 and public._bt_alive(st, 0) > 0 then
      select sum((m ->> 'hp')::numeric) / sum((m ->> 'max')::numeric) into r0 from jsonb_array_elements(st -> 'sides' -> 0 -> 'mons') m;
      select sum((m ->> 'hp')::numeric) / sum((m ->> 'max')::numeric) into r1 from jsonb_array_elements(st -> 'sides' -> 1 -> 'mons') m;
      if r0 > r1 then wins := wins + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('wins', wins, 'n', n, 'turns', round(tsum::numeric / n, 1),
    'boss', jsonb_build_object('lv', lv, 'max', boss -> 'max', 'stg', boss -> 'stg', 'name', boss ->> 'name', 'hp_mult', st -> 'boss' -> 'hp_mult'));
end $$;

-- ── 5. 잡기 설정: 원 색깔별 확률 + 전설 배틀 승리 보너스 ────────────────────────────────────────────
-- rates.base[i] / rates.max[i] (i = 0 초록 · 1 노랑 · 2 주황 · 3 빨강), 0~1, max ≥ base. 숫자가 아닌 값은 기본값.
create or replace function public.catch_config() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t jsonb := coalesce(public._setting('catch_rate_tier'), '{}'::jsonb); mx jsonb := coalesce(public._setting('catch_rate_max'), '{}'::jsonb);
  ks text[] := array['green', 'yellow', 'orange', 'red']; d0 numeric[] := array[0.70, 0.50, 0.33, 0.18]; d1 numeric[] := array[0.95, 0.80, 0.60, 0.45];
  base jsonb := '[]'; cap jsonb := '[]'; i int; b numeric; c numeric; lb jsonb := public._setting('legend_win_catch_bonus');
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if jsonb_typeof(t) <> 'object' then t := '{}'; end if;
  if jsonb_typeof(mx) <> 'object' then mx := '{}'; end if;
  for i in 1 .. 4 loop
    b := least(1, greatest(0, case when jsonb_typeof(t -> ks[i]) = 'number' then (t ->> ks[i])::numeric else d0[i] end));
    c := least(1, greatest(b, case when jsonb_typeof(mx -> ks[i]) = 'number' then (mx ->> ks[i])::numeric else d1[i] end));
    base := base || to_jsonb(round(b, 4)); cap := cap || to_jsonb(round(c, 4));
  end loop;
  return jsonb_build_object(
    'flee', coalesce((public._setting('catch_flee'))::numeric, 0.05),
    'raid_mode', case when public._setting('raid_reward_mode') #>> '{}' = 'catch' then 'catch' else 'ticket' end,
    'raid_balls', greatest(1, coalesce((public._setting('raid_catch_balls'))::int, 10)),
    'raid_flee', coalesce((public._setting('raid_catch_flee'))::boolean, true),
    'rates', jsonb_build_object('base', base, 'max', cap),
    'legend_bonus', least(5, greatest(1, case when jsonb_typeof(lb) = 'number' then (lb #>> '{}')::numeric else 1.5 end)),
    'legend_battle', coalesce((public._setting('legend_battle_on'))::boolean, true));
end $$;

-- ── 6. 이상한 소포: 반짝이는 (이로치) 포켓몬 소포 ─────────────────────────────────────────────────────
-- gift_codes.shiny = true → 받은 포켓몬 티켓이 shiny (0042 _redeem_ticket 이 박스의 그 한 마리를 shiny · shiny_on, 알림에 ✦ 줄)
alter table public.gift_codes add column if not exists shiny boolean not null default false;

drop function if exists public.admin_create_gift(text, text, int, text, int, timestamptz, timestamptz, int, int);
create or replace function public.admin_create_gift(p_code text, p_title text, p_dex integer, p_item text, p_qty integer, p_starts timestamptz,
                                                   p_ends timestamptz, p_max integer, p_species integer default null, p_shiny boolean default false)
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
  insert into public.gift_codes (code, title, species_id, item, qty, starts_at, ends_at, max_claims, created_by, shiny)
  values (k, nullif(btrim(coalesce(p_title, '')), ''), sp, case when not mon then p_item end, coalesce(p_qty, 1),
          p_starts, p_ends, case when p_max > 0 then p_max end, auth.uid(), mon and coalesce(p_shiny, false))
  returning * into g;
  return to_jsonb(g);
end $$;

-- gift_claim: 0038 그대로 + 반짝 소포면 티켓 shiny = true (아니면 null = 0042 처럼 굴림)
create or replace function public.gift_claim(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; k text := public._gift_norm(p_code); g public.gift_codes;
  lim int := greatest(1, coalesce((public._setting('gift_fail_limit'))::int, 8)); tk public.tickets; res jsonb; i int;
  mon bigint; pend boolean := false; iname text;
begin
  if (select count(*) from public.gift_fails where user_id = uid and at > now() - interval '10 minutes') >= lim then
    return jsonb_build_object('ok', false, 'error', 'TRY_LATER');
  end if;
  select * into g from public.gift_codes where code = k for update;
  if not found or char_length(k) not between 1 and 40 then
    insert into public.gift_fails (user_id) values (uid);
    return jsonb_build_object('ok', false, 'error', 'BAD_GIFT');
  end if;
  if g.starts_at is not null and now() < g.starts_at then return jsonb_build_object('ok', false, 'error', 'GIFT_NOT_YET', 'starts_at', g.starts_at); end if;
  if not g.active or (g.ends_at is not null and now() > g.ends_at) then return jsonb_build_object('ok', false, 'error', 'GIFT_EXPIRED'); end if;
  if exists (select 1 from public.gift_claims where gift_id = g.id and user_id = uid) then return jsonb_build_object('ok', false, 'error', 'GIFT_CLAIMED'); end if;
  if g.max_claims is not null and (select count(*) from public.gift_claims where gift_id = g.id) >= g.max_claims then
    return jsonb_build_object('ok', false, 'error', 'GIFT_GONE');
  end if;
  insert into public.gift_claims (gift_id, user_id) values (g.id, uid);
  if g.species_id is not null then
    for i in 1 .. least(g.qty, 6) loop
      insert into public.tickets (nonce, user_id, qr_id, token, special, fixed_species, shiny)
      values (public._rand(12, 'abcdefghijklmnopqrstuvwxyz0123456789'), uid, 'GIFT', 'gift', 'gift', g.species_id, case when g.shiny then true end) returning * into tk;
      res := public._redeem_ticket(uid, null, tk);
      if res ->> 'error' = 'box_full' then pend := true; else mon := coalesce(mon, (res ->> 'mon_id')::bigint); end if;
    end loop;
    perform public._recompute(uid);
  elsif g.item = 'evo_stone' then
    update public.profiles set evo_tickets = evo_tickets + g.qty where user_id = uid;
    iname := '진화의 돌';
  else
    insert into public.inventory (user_id, item, qty) values (uid, g.item, g.qty)
      on conflict (user_id, item) do update set qty = public.inventory.qty + excluded.qty;
    insert into public.item_log (user_id, item, qty, why) values (uid, g.item, g.qty, 'gift');
    select name into iname from public.items where key = g.item;
  end if;
  if g.item is not null then
    perform public._notice(uid, 'gift', null, '이상한 소포가 도착했다!',
      '소포 안에 ' || coalesce(iname, g.item) || ' ' || g.qty || '개가 들어 있었어요! 가방에서 확인해요.', jsonb_build_object('item', g.item, 'qty', g.qty));
  end if;
  return jsonb_build_object('ok', true, 'title', g.title, 'species_id', g.species_id, 'item', g.item, 'item_name', iname, 'qty', g.qty,
                            'mon', mon, 'pending', pend, 'shiny', g.shiny and g.species_id is not null,
                            'evo_tickets', (select evo_tickets from public.profiles where user_id = uid));
end $$;

-- rule (0006): every migration that creates functions ends with this block (copied from 0052_forms.sql + 0055 legend_battle · admin_legend_sim · admin_create_gift + p_shiny)
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
  public.legend_battle(bigint, bigint[]), public.admin_legend_sim(int, jsonb, int)
to authenticated;
notify pgrst, 'reload schema';
