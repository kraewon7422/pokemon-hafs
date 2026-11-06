-- 0048: 사파리존 더 넓게 — 설원 (snow) · 용암 지대 (lava) · 발전소 (plant) · 용의 굴 (dragon) + 방문 기록 · 용의 굴 열림
--  앱: safari-maps.js 'snow' (사파리존 맨 위 길) · 'lava' (왼쪽 아래 길) · 'plant1' 'plant2' (왼쪽 위 발전소 건물 안) · 'dragon' (호수 다리 가운데 계단 아래)
--  A. 구역 snow · lava · plant · dragon 을 safari_encounter 가 받아들임 (그 밖의 값은 예전처럼 'grass').
--  B. 사는 곳 (_habitat_ok, 만나는 모습 = 1단계 종의 타입):
--     snow  = 얼음 · 페어리 (+ 노라키 234 · 팽도리 393, 반만 자주)
--     lava  = 불꽃 · 강철, 물 · 얼음 없음 (+ 뿔카노 111 · 단굴 524, 반만 자주)
--     plant = 전기 · 고스트, 물 · 얼음 없음 (+ 또가스 109 · 깨봉이 568, 반만 자주)
--     dragon = 드래곤 + 600족 계열 (1단계 전국도감 번호 147 미뇽 · 246 애버라스 · 371 아공이 · 374 메탕 · 443 딥상어동 · 633 모노두 · 704 미끄메라 · 782 짜랑꼬)
--              — 다른 곳처럼 '야생' 계열만 (선생님 과목 계열은 QR · 퀴즈 전용 그대로. 운영자가 선생님을 빼서 야생이 되면 그때부터 저절로 나옴).
--              600족은 희귀도와 상관없이 무게 150, 다른 드래곤은 적어도 60 (희귀 10 → 60) — 보통 풀숲 (100) 보다 600족이 자주.
--     새 전설은 넣지 않음 (전설 · 환상 · 울트라비스트 · 비밀 · 보너스 계열은 예전처럼 빠짐).
--  C. 레벨: safari_level_bands 에 snow [18, 45, 34] · lava [20, 48, 34] · plant1 [15, 30, 0] · plant2 [28, 42, 0] · dragon [40, 50, 26]
--     (세 번째 숫자 = 지도 입구에서 가장 먼 만남 칸까지 거리, .work/s7/maps-check.mjs 가 잼).
--  D. 방문 기록 (safari_visits): safari_visit(p_area) (앱이 지도에 들어설 때) + safari_encounter 가 그 구역 걸음을 받을 때.
--     바다 (beach) · 사막 (desert) · 설원 (snow) · 용암 (lava) 네 곳을 모두 다녀오면 용의 굴이 열림 (_dragon_open).
--     열리기 전에 zone 'dragon' 을 보내면 'grass' 로 바뀜 (용의 굴 포켓몬 · 레벨 없음).
--     safari_state 에 'visited' (다녀온 곳 목록) · 'dragon' (열렸는지).
--  E. 알림 · 이유 글의 구역 이름 (_zone_name): snow '설원' · lava '용암 지대' · plant '발전소' · dragon '용의 굴'.
--  F. 사파리존 잠금 (운영자 설정 safari_open, 기본 true): false 면 safari_state.locked = true, 새 걸음 · 방문 (safari_encounter · safari_visit) 은
--     'SAFARI_CLOSED'. 이미 시작한 잡기는 끝낼 수 있음 (safari_turn · safari_throws · safari_result 는 있던 만남에만 쓰이므로 그대로) —
--     축제 첫머리에 학생들이 QR 부터 찾게 할 때 운영자 [축제 운영] → 야생 포켓몬 → '사파리존 열기' 를 끔.

-- ── 1. 레벨 범위 ─────────────────────────────────────────────────────────────────────────────────────────────
update public.settings set value = value || '{"snow": [18, 45, 34, "snow"], "lava": [20, 48, 34, "lava"],
  "plant1": [15, 30, 0, "plant"], "plant2": [28, 42, 0, "plant"], "dragon": [40, 50, 26, "dragon"]}'::jsonb
 where key = 'safari_level_bands' and jsonb_typeof(value) = 'object';

insert into public.settings (key, value) values ('safari_open', 'true') on conflict (key) do nothing;
create or replace function public._safari_open() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((public._setting('safari_open') #>> '{}')::boolean, true)
$$;

-- ── 2. 방문 기록 ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.safari_visits (
  user_id  uuid not null references public.profiles (user_id) on delete cascade on update cascade,
  area     text not null check (area in ('beach', 'desert', 'snow', 'lava', 'plant', 'dragon')),
  first_at timestamptz not null default now(),
  primary key (user_id, area)
);
alter table public.safari_visits enable row level security;     -- 함수로만

create or replace function public._safari_visited(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(v.area order by v.first_at, v.area), '[]') from public.safari_visits v where v.user_id = uid
$$;
-- 바다 · 사막 · 설원 · 용암을 모두 다녀왔는지
create or replace function public._dragon_open(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) = 4 from public.safari_visits v where v.user_id = uid and v.area in ('beach', 'desert', 'snow', 'lava')
$$;
-- 기록 (처음이면 true). 용의 굴은 열린 뒤에만
create or replace function public._safari_visit(uid uuid, p_area text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if p_area is null or p_area not in ('beach', 'desert', 'snow', 'lava', 'plant', 'dragon') then return false; end if;
  if p_area = 'dragon' and not public._dragon_open(uid) then return false; end if;
  insert into public.safari_visits (user_id, area) values (uid, p_area) on conflict do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- 앱: 지도에 들어설 때. 돌려줌 { visited, dragon, new (이번이 처음), opened (이번에 용의 굴이 열림) }
create or replace function public.safari_visit(p_area text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); was boolean; nw boolean;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NO_PROFILE'; end if;
  if not public._safari_open() then raise exception 'SAFARI_CLOSED'; end if;
  if p_area is null or p_area not in ('beach', 'desert', 'snow', 'lava', 'plant', 'dragon') then raise exception 'BAD_AREA'; end if;
  was := public._dragon_open(uid);
  nw := public._safari_visit(uid, p_area);
  return jsonb_build_object('visited', public._safari_visited(uid), 'dragon', public._dragon_open(uid), 'new', nw,
                            'opened', not was and public._dragon_open(uid));
end $$;

-- ── 3. 사는 곳 ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._habitat_ok(p_zone text, p_btype text) returns boolean
language sql immutable set search_path = '' as $$
  with t as (select string_to_array(coalesce(p_btype, ''), '/') a)
  select case p_zone
    when 'beach' then a && array['물', '얼음']
    when 'desert' then a && array['땅', '바위'] and not a && array['물', '얼음']
    when 'snow' then a && array['얼음', '페어리']
    when 'lava' then a && array['불꽃', '강철'] and not a && array['물', '얼음']
    when 'plant' then a && array['전기', '고스트'] and not a && array['물', '얼음']
    when 'dragon' then '드래곤' = any (a)
    when 'pond' then ('물' = any (a) and not ('얼음' = any (a)))
                     or (a && array['노말', '벌레', '풀', '비행', '전기', '페어리', '에스퍼', '불꽃'] and not a && array['물', '얼음'])
    when 'cave' then a && array['바위', '땅', '고스트', '독', '악', '강철', '격투', '드래곤'] and coalesce(a[1], '') not in ('물', '얼음')
    when 'grass' then a && array['노말', '벌레', '풀', '비행', '전기', '페어리', '에스퍼', '불꽃'] and not a && array['물', '얼음']
    else true end
  from t
$$;

-- 구역에 어울리는 몇 종 (1단계 전국도감 번호). 사막 = 0043 그대로 (물 · 얼음 빼고)
create or replace function public._zone_extra(p_zone text, p_line int) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.species s where s.line_id = p_line and s.stage = 1
                   and s.dex = any (case p_zone when 'desert' then array[331, 556, 562, 694] when 'snow' then array[234, 393]
                                                 when 'lava' then array[111, 524] when 'plant' then array[109, 568] else array[]::int[] end)
                   and (p_zone <> 'desert' or not (string_to_array(coalesce(s.btype, ''), '/') && array['물', '얼음'])))
$$;
create or replace function public._desert_extra(p_line int) returns boolean
language sql stable security definer set search_path = '' as $$ select public._zone_extra('desert', p_line) $$;

-- 600족 계열 (1단계 전국도감 번호 — species 에 있는 것만)
create or replace function public._pseudo_line(p_line int) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.species s where s.line_id = p_line and s.stage = 1 and s.dex in (147, 246, 371, 374, 443, 633, 704, 782))
$$;

create or replace function public._wild_line_zone(p_zone text) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare r int; ww jsonb := coalesce(public._setting('wild_weights'), '{}');
begin
  if p_zone = 'ultra' then
    return (select l.id from public.lines l where l.ultra and l.active and not l.withdrawn order by random() limit 1);
  end if;
  select l.id into r from public.lines l
   where l.active and not l.withdrawn and not l.bonus and not l.secret and not l.mythic and not l.ultra and l.legend_src is null
     and l.subject = '야생' and coalesce((ww ->> l.rarity)::numeric, 0) > 0
     and (public._habitat_ok(case when p_zone = 'deep' then null else p_zone end, public._line_btype1(l.id))
          or (p_zone in ('desert', 'snow', 'lava', 'plant') and public._zone_extra(p_zone, l.id))
          or (p_zone = 'dragon' and public._pseudo_line(l.id)))
   order by -ln(1 - random()) / (case
             when p_zone = 'dragon' and public._pseudo_line(l.id) then 150
             when p_zone = 'dragon' then greatest(60, coalesce((ww ->> l.rarity)::numeric, 0))
             else coalesce((ww ->> l.rarity)::numeric, 0)
                  * case when p_zone = 'pond' and '물' = any (string_to_array(coalesce(public._line_btype1(l.id), ''), '/')) then 3
                         when p_zone in ('desert', 'snow', 'lava', 'plant') and not public._habitat_ok(p_zone, public._line_btype1(l.id)) then 0.5
                         else 1 end end)
   limit 1;
  return coalesce(r, public._wild_line());
end $$;

create or replace function public._zone_name(p_zone text) returns text
language sql immutable set search_path = '' as $$
  select case p_zone when 'pond' then '연못가 풀숲' when 'cave' then '동굴' when 'deep' then '깊은 동굴'
    when 'ultra' then '울트라 스페이스' when 'beach' then '해변' when 'desert' then '사막'
    when 'snow' then '설원' when 'lava' then '용암 지대' when 'plant' then '발전소' when 'dragon' then '용의 굴' else '풀숲' end
$$;

-- ── 4. 사파리 상태 (0038 + 다녀온 곳 · 용의 굴) ─────────────────────────────────────────────────────────────
create or replace function public.safari_state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  n := public._safari_expire(uid);
  perform public._quest_check(uid);
  return public._safari_json(uid) || jsonb_build_object('legends', public._quest_rows(uid), 'expired', n,
                                                         'visited', public._safari_visited(uid), 'dragon', public._dragon_open(uid),
                                                         'locked', not public._safari_open());
end $$;

-- ── 5. 걸음 → 만남 (0043 그대로 + 구역 snow · lava · plant · dragon · 방문 기록) ─────────────────────────────
create or replace function public.safari_encounter(p_steps int, p_zone text default null, p_area text default null, p_dist int default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked(); uid uuid := p.user_id; ps timestamptz := public._safari_period(); r public.safari_days;
  sps numeric := greatest(1, coalesce((public._setting('safari_steps_per_sec'))::numeric, 10));
  minst int := greatest(0, coalesce((public._setting('safari_min_steps'))::int, 8));
  rate numeric := least(1, greatest(0, coalesce((public._setting('safari_encounter_rate'))::numeric, 0.12)));
  daily int := greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 20));
  z text := case when p_zone in ('grass', 'pond', 'cave', 'deep', 'ultra', 'beach', 'desert', 'snow', 'lava', 'plant', 'dragon') then p_zone else 'grass' end;
  secs numeric; acc int; left_b int; hit boolean := false; sinc int; wl int; wsp int; eid bigint; reason text; lv int;
begin
  if not public._safari_open() then raise exception 'SAFARI_CLOSED'; end if;   -- 0048: 운영자가 사파리존을 닫음
  if p_steps is null or p_steps < 0 or p_steps > 1000 then raise exception 'BAD_STEPS'; end if;
  if z = 'dragon' and not public._dragon_open(uid) then z := 'grass'; end if;      -- 0048: 용의 굴은 네 곳을 다녀온 뒤에만
  if z in ('beach', 'desert', 'snow', 'lava', 'plant', 'dragon') then perform public._safari_visit(uid, z); end if;
  perform public._safari_expire(uid);
  if exists (select 1 from public.raid_encounters where user_id = uid and kind = 'safari' and status = 'pending') then
    return jsonb_build_object('encounter', public._safari_json(uid) -> 'pending', 'accepted', 0, 'reason', 'pending', 'zone', z) || public._safari_json(uid);
  end if;
  insert into public.safari_days (user_id, day, period_start) values (uid, (ps at time zone 'Asia/Seoul')::date, ps) on conflict do nothing;
  select * into r from public.safari_days where user_id = uid and period_start = ps for update;
  secs := case when r.last_at is null then 3 else least(30, greatest(0, extract(epoch from now() - r.last_at))) end;
  acc := greatest(0, least(p_steps, floor(secs * sps)::int + 1));
  sinc := r.since;
  left_b := greatest(0, daily - r.balls_used);
  if left_b <= 0 then reason := 'no_balls';
  else
    for i in 1 .. acc loop
      sinc := sinc + 1;
      if sinc >= minst and random() < rate then hit := true; exit; end if;
    end loop;
  end if;
  if hit then
    wl := public._wild_line_zone(z);
    if wl is not null then select id into wsp from public.species where line_id = wl and stage = 1; end if;
    if wsp is null then hit := false; reason := 'empty_pool'; end if;
  end if;
  if hit then
    lv := case when z = 'ultra' and p_area is null then 50 else public._safari_level(z, p_area, p_dist) end;
    insert into public.raid_encounters (user_id, raid_id, species_id, balls, kind, zone, level)
    values (uid, null, wsp, least(20, left_b), 'safari', z, lv) returning id into eid;
    update public.safari_days set steps = steps + acc, since = 0, encounters = encounters + 1, last_at = now()
     where user_id = uid and period_start = ps;
  else
    update public.safari_days set steps = steps + acc, since = case when reason is null then sinc else since + acc end, last_at = now()
     where user_id = uid and period_start = ps;
  end if;
  return jsonb_build_object('encounter', case when hit then public._safari_json(uid) -> 'pending' end,
                            'accepted', acc, 'reason', reason, 'zone', z) || public._safari_json(uid);
end $$;

-- rule (0006): every migration that creates functions ends with this block (0047 list + safari_visit(text); helpers
--   _safari_open · _safari_visited · _dragon_open · _safari_visit · _zone_extra · _pseudo_line are internal, not granted)
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
