-- 0054: 전설을 더 어렵게 + 전설 자리를 여러 곳으로 나누고 던전 같은 길 (앱: web/js/safari-maps.js · safari.js, 퍼즐은 모두 앱에서 · 서버는 그대로 믿지 않음)
--  A. 쉬운 전설 조건을 올림 (settings.legend_quests, 지금 값보다 낮아지지는 않게 greatest):
--     테라키온 639 · 코바르온 638 · 비리디온 640 (바위 · 강철 · 격투 5 → 10) · 레지아이스 378 (얼음 5 → 10) · 피오네 489 (물 10 → 20) ·
--     제라오라 807 (발전소 5 → 12) · 코스모그 789 (울트라 2 → 5) · 테오키스 386 (울트라 4 → 8) · 후파 720 (레이드 시간대 2 → 3) ·
--     배틀 승리 (배틀 수 제한이 없어져서 · 승리는 같은 친구에게 하루 한 번만 셈): 비크티니 494 (3 → 10) · 카푸나비나 786 (5 → 15) · 엠라이트 481 (10 → 20) ·
--     라티아스 380 (에스퍼 6 → 10) · 라티오스 381 (드래곤 3 → 6) · 크레세리아 488 (페어리 6 → 10) · 카푸꼬꼬꼭 785 (전기 6 → 10) · 카푸브루루 787 (풀 8 → 12) ·
--     레시라무 643 (용의 굴 3 → 6) · 제크로무 644 (5 → 10) · 히드런 485 (용암 6 → 10) · 디안시 719 (사막 8 → 12)
--  B. 새 지도의 레벨 범위 (safari_level_bands): beach2 해변 바닷길 · plant3 발전소 3층 · dragon2 용의 굴 지하 2층 (만남 구역 이름은 그대로 beach · plant · dragon
--     → zone_catch · 방문 기록 · 용의 굴 열림 규칙 그대로). 꽃의 섬 · 고대 유적 지하 1층 = 야생 포켓몬이 없는 조용한 곳 (구역 없음).
--  C. 새 자리 이름 (_legend_where = '깨어났다' · '잡았다' 알림 글): 앱 LEGEND_HINTS 와 같게.
--  D. 2단계 해금 기본값 50 % → 30 % (unlock_safari_pct). 이미 열린 학생은 그대로 (unlocked_at 이 남음).

-- ── A ──
update public.settings s set value = (
  select jsonb_agg(case when n.need is null then q
                        else jsonb_set(q, '{n}', to_jsonb(greatest(coalesce((q ->> 'n')::int, 0), n.need))) end order by o)
    from jsonb_array_elements(s.value) with ordinality u(q, o)
    left join (values (639, 10), (638, 10), (640, 10), (378, 10), (489, 20), (807, 12), (789, 5), (386, 8), (720, 3),
                      (494, 10), (786, 15), (481, 20), (380, 10), (381, 6), (488, 10), (785, 10), (787, 12),
                      (643, 6), (644, 10), (485, 10), (719, 12)) n(dex, need) on n.dex = (q ->> 'dex')::int)
 where s.key = 'legend_quests' and jsonb_typeof(s.value) = 'array' and jsonb_array_length(s.value) > 0;

-- ── B ──
update public.settings set value = value || '{"beach2": [30, 50, 60, "beach"], "plant3": [36, 48, 0, "plant"], "dragon2": [44, 50, 30, "dragon"]}'::jsonb
 where key = 'safari_level_bands' and jsonb_typeof(value) = 'object';

-- ── D ──
insert into public.settings (key, value) values ('unlock_safari_pct', '30') on conflict (key) do nothing;
update public.settings set value = '30' where key = 'unlock_safari_pct';

-- ── C ── 사파리존 전설 자리 (web/js/safari-maps.js LEGEND_HINTS 와 같게, 짧게)
create or replace function public._legend_where(p_dex int) returns text
language sql immutable set search_path = '' as $$
  select case p_dex
    when 377 then '미혹의 동굴 지하 2층 점자 방' when 378 then '여울의 동굴 지하 2층 점자 방'
    when 379 then '미혹의 동굴 지하 3층 점자 방' when 486 then '미혹의 동굴 거인의 제단'
    when 249 then '여울의 동굴 지하 3층 깊은 물가' when 382 then '깊은 연못'
    when 383 then '깊은 동굴 지하 2층' when 250 then '하늘 언덕' when 384 then '하늘의 제단'
    when 380 then '꿈의 섬 야자 미로' when 381 then '꿈의 섬 야자 미로' when 488 then '꿈의 섬 야자 미로' when 491 then '꿈의 섬 야자 미로'
    when 489 then '해변 바닷길 모래톱 작은 섬' when 788 then '해변 바닷길 모래톱 작은 섬' when 785 then '해변 바닷길 동쪽 곶 미로'
    when 492 then '꽃의 섬 한가운데 꽃밭' when 786 then '꽃의 섬 꽃밭 단' when 787 then '꽃의 섬 서쪽 풀숲'
    when 638 then '성검의 숲 나무 미로' when 639 then '성검의 숲 나무 미로' when 640 then '성검의 숲 나무 미로' when 647 then '성검의 숲 나무 미로'
    when 641 then '하늘 언덕' when 642 then '하늘 언덕' when 645 then '모래바람 지대 모래 언덕'
    when 643 then '용의 굴 깊은 곳' when 644 then '용의 굴 깊은 곳' when 646 then '설원 얼음 미끄럼 길 끝'
    when 789 then '울트라 스페이스' when 800 then '별의 제단' when 385 then '별의 제단' when 386 then '별의 제단' when 720 then '모래바람 지대 유적'
    when 494 then '고대 유적 지하 1층' when 719 then '고대 유적 지하 1층' when 649 then '고대 유적 지하 2층' when 802 then '고대 유적 지하 2층'
    when 807 then '발전소 3층' when 801 then '발전소 3층' when 772 then '발전소 2층' when 485 then '용암 호수 가라앉는 돌 다리 너머'
    else '깊은 곳' end
$$;

-- rule (0006): every migration that creates functions ends with this block (copied from 0052_forms.sql, 새 공개 함수 없음)
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
  public.admin_create_gift(text, text, int, text, int, timestamptz, timestamptz, int, int), public.admin_list_gifts(), public.admin_set_gift(bigint, boolean),
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
  public.admin_rename_teacher(int, text, text)
to authenticated;
notify pgrst, 'reload schema';
