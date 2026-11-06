-- 0043: 사파리존 사막 · 모래바람 지대 (zone 'desert') — 사파리존 서쪽 끝 모래길 너머 (앱: safari-maps.js 'desert', 늘 모래바람)
--  A. 구역 'desert' 를 safari_encounter 가 받아들임 (그 밖의 값은 예전처럼 'grass').
--  B. 사는 곳 (_habitat_ok 'desert'): 만나는 모습 (1단계 종) 의 타입에 땅 · 바위가 있고 물 · 얼음은 없음
--     (모래두지 · 디그다 · 롱스톤 · 뿔카노 · 톱치 · 히포포타스 · 모래꿍 · 두더류 · 코코파스 · 단굴 …).
--     + 사막에 어울리는 몇 종 (_wild_line_zone, 1단계 전국도감 번호): 선인왕 331 · 마라카치 556 · 데스마스 562 (유적) · 목도리키텔 694 — 땅·바위보다 반만 자주.
--     새 전설은 넣지 않음 (전설 · 환상 · 울트라비스트 · 비밀 계열은 예전처럼 빠짐).
--  C. 레벨: safari_level_bands 에 "desert": [15, 45, 55, "desert"] — 사막 입구 Lv.15 → 서쪽 끝 유적 (입구에서 55칸) Lv.45 (±1, 범위 안으로 자름).
--     다른 지도 이름으로 desert 를 보내거나 지도가 없으면 desert 의 가장 낮은 레벨 (15) — _safari_level 그대로.
--  D. 알림 · 이유 글의 구역 이름 (_zone_name): desert → '사막'.

-- ── 1. 레벨 범위 ─────────────────────────────────────────────────────────────────────────────────────────────
update public.settings set value = value || '{"desert": [15, 45, 55, "desert"]}'::jsonb
 where key = 'safari_level_bands' and jsonb_typeof(value) = 'object';

-- ── 2. 사는 곳 ───────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public._habitat_ok(p_zone text, p_btype text) returns boolean
language sql immutable set search_path = '' as $$
  with t as (select string_to_array(coalesce(p_btype, ''), '/') a)
  select case p_zone
    when 'beach' then a && array['물', '얼음']
    when 'desert' then a && array['땅', '바위'] and not a && array['물', '얼음']
    when 'pond' then ('물' = any (a) and not ('얼음' = any (a)))
                     or (a && array['노말', '벌레', '풀', '비행', '전기', '페어리', '에스퍼', '불꽃'] and not a && array['물', '얼음'])
    when 'cave' then a && array['바위', '땅', '고스트', '독', '악', '강철', '격투', '드래곤'] and coalesce(a[1], '') not in ('물', '얼음')
    when 'grass' then a && array['노말', '벌레', '풀', '비행', '전기', '페어리', '에스퍼', '불꽃'] and not a && array['물', '얼음']
    else true end
  from t
$$;

-- 사막에 어울리는 땅 · 바위 밖의 종 (1단계 전국도감 번호)
create or replace function public._desert_extra(p_line int) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.species s where s.line_id = p_line and s.stage = 1 and s.dex in (331, 556, 562, 694)
                   and not (string_to_array(coalesce(s.btype, ''), '/') && array['물', '얼음']))
$$;

create or replace function public._wild_line_zone(p_zone text) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare r int;
begin
  if p_zone = 'ultra' then
    return (select l.id from public.lines l where l.ultra and l.active and not l.withdrawn order by random() limit 1);
  end if;
  select l.id into r from public.lines l
   where l.subject = '야생' and l.active and not l.withdrawn and not l.bonus and not l.secret and not l.mythic
     and not l.ultra and l.legend_src is null
     and coalesce((public._setting('wild_weights') ->> l.rarity)::numeric, 0) > 0
     and (public._habitat_ok(case when p_zone = 'deep' then null else p_zone end, public._line_btype1(l.id))
          or (p_zone = 'desert' and public._desert_extra(l.id)))
   order by -ln(1 - random()) / ((public._setting('wild_weights') ->> l.rarity)::numeric
             * case when p_zone = 'pond' and '물' = any (string_to_array(coalesce(public._line_btype1(l.id), ''), '/')) then 3
                    when p_zone = 'desert' and not public._habitat_ok('desert', public._line_btype1(l.id)) then 0.5
                    else 1 end)
   limit 1;
  return coalesce(r, public._wild_line());
end $$;

create or replace function public._zone_name(p_zone text) returns text
language sql immutable set search_path = '' as $$
  select case p_zone when 'pond' then '연못가 풀숲' when 'cave' then '동굴' when 'deep' then '깊은 동굴'
    when 'ultra' then '울트라 스페이스' when 'beach' then '해변' when 'desert' then '사막' else '풀숲' end
$$;

-- ── 3. 걸음 → 만남 (0040 그대로 + 구역 'desert') ─────────────────────────────────────────────────────────────
create or replace function public.safari_encounter(p_steps int, p_zone text default null, p_area text default null, p_dist int default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked(); uid uuid := p.user_id; ps timestamptz := public._safari_period(); r public.safari_days;
  sps numeric := greatest(1, coalesce((public._setting('safari_steps_per_sec'))::numeric, 10));
  minst int := greatest(0, coalesce((public._setting('safari_min_steps'))::int, 8));
  rate numeric := least(1, greatest(0, coalesce((public._setting('safari_encounter_rate'))::numeric, 0.12)));
  daily int := greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 20));
  z text := case when p_zone in ('grass', 'pond', 'cave', 'deep', 'ultra', 'beach', 'desert') then p_zone else 'grass' end;   -- 앱이 알려 준 구역 (레벨은 구역별 범위 안에서만)
  secs numeric; acc int; left_b int; hit boolean := false; sinc int; wl int; wsp int; eid bigint; reason text; lv int;
begin
  if p_steps is null or p_steps < 0 or p_steps > 1000 then raise exception 'BAD_STEPS'; end if;
  perform public._safari_expire(uid);
  if exists (select 1 from public.raid_encounters where user_id = uid and kind = 'safari' and status = 'pending') then
    return jsonb_build_object('encounter', public._safari_json(uid) -> 'pending', 'accepted', 0, 'reason', 'pending', 'zone', z) || public._safari_json(uid);
  end if;
  insert into public.safari_days (user_id, day, period_start) values (uid, (ps at time zone 'Asia/Seoul')::date, ps) on conflict do nothing;
  select * into r from public.safari_days where user_id = uid and period_start = ps for update;
  -- 걸음 속도 제한: 지난번부터 지난 시간 × 초당 걸음 (+1), 처음엔 3초로 봄, 30초까지만 모아 둠
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

-- rule (0006): every migration that creates functions ends with this block (0042 list unchanged — the new helper _desert_extra is internal, not granted)
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
