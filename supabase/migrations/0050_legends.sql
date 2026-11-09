-- 0050: 아직 얻을 길이 없던 전설 · 환상 포켓몬을 사파리존 특별한 곳에서
--  A. 사파리존 전설 33마리 (lines.legend_src = 'safari', 보통 야생 · QR · 걸음 · 사파리 풀숲에서는 빠짐 — 0038 그대로)
--     예전 전설 퀘스트와 같은 방식: settings.legend_quests 에 reward 'map' 한 줄씩 → 조건을 채우면 '깨어났다' 알림,
--     사파리존 그 자리 (web/js/safari-maps.js LEGEND_HINTS · MAPS[].legends) 에서 legend_encounter → GO 방식 잡기 → legend_result (계정마다 한 번).
--     · 꿈의 섬 (해변 동쪽 끝 나루 너머): 라티아스 380 · 라티오스 381 · 크레세리아 488 · 다크라이 491 · 피오네 489 · 카푸 넷 785~788
--     · 성검의 숲 (깊은 연못 동쪽 길 너머): 코바르온 638 · 테라키온 639 · 비리디온 640 · 케르디오 647 · 쉐이미 492
--     · 하늘 언덕 (있던 곳): 토네로스 641 · 볼트로스 642 · 랜드로스 645
--     · 용의 굴 깊은 곳 (용의 굴 사다리 아래, 용의 굴이 열린 뒤에만): 레시라무 643 · 제크로무 644 · 큐레무 646
--     · 별의 제단 (울트라 스페이스의 둘째 워프홀 너머): 코스모그 789 · 네크로즈마 800 · 지라치 385 · 테오키스 386 · 후파 720
--     · 고대 유적 (사막 서쪽 유적의 내려가는 계단): 비크티니 494 · 게노세크트 649 · 디안시 719 · 마샤도 802
--     · 발전소 2층: 제라오라 807 · 마기아나 801 · 타입:널 772 / 용암 지대: 히드런 485
--     뺀 것: 선생님 · 학교 특별 계열 (기라티나 35 · 아르세우스 36 · 프리져 · 썬더 · 파이어 · 뮤츠 · 뮤 · 세레비 · 마나피 · 메로엣타 ·
--     제르네아스 · 이벨타르 · 지가르데 · 볼케니온 = 학교 이스터에그), 이벤트 소포 810 · 811, 멜탄 808 (0049 가 뺌), 울트라비스트 (울트라 스페이스),
--     따로 있던 루나아라 계열 (코스모그 → 코스모움 → 루나아라 갈래로 도감 792 를 채움).
--     이상한 소포 (gift_codes) 는 그대로 쓸 수 있음 (운영자가 도감 번호로 고름 — legend_src 와 상관없음).
--  B. 새 퀘스트 종류 zone_catch {zone, n}: 사파리존 그 구역 (raid_encounters.zone) 에서 잡은 포켓몬 수 (용의 굴 · 울트라 스페이스 · 사막 · 발전소 · 용암 지대).
--     _quest_cur · _quest_text · _quest_done_text · _legend_where 를 0038/0042 마지막 정의 + 새 줄로 다시 만듦.

-- ── 1. 사파리존 전설 33마리 ───────────────────────────────────────────────────────────────────────────────
update public.lines l set legend_src = 'safari'
 where l.subject = '야생' and not l.bonus and not l.secret and not l.mythic and not l.ultra
   and exists (select 1 from public.species s where s.line_id = l.id and s.stage = 1 and s.id < 10000 and s.dex = any (array[
                 380, 381, 488, 491, 489, 785, 786, 787, 788,   -- 꿈의 섬
                 638, 639, 640, 647, 492,                       -- 성검의 숲
                 641, 642, 645,                                 -- 하늘 언덕
                 643, 644, 646,                                 -- 용의 굴 깊은 곳
                 789, 800, 385, 386, 720,                       -- 별의 제단
                 494, 649, 719, 802,                            -- 고대 유적
                 807, 801, 772, 485]));                         -- 발전소 2층 · 용암 지대

update public.settings s set value = s.value || coalesce((
  select jsonb_agg(x order by o) from jsonb_array_elements('[
    {"dex": 380, "kind": "type_catch", "types": ["에스퍼"], "n": 6, "reward": "map"},
    {"dex": 381, "kind": "type_catch", "types": ["드래곤"], "n": 3, "reward": "map"},
    {"dex": 488, "kind": "type_catch", "types": ["페어리"], "n": 6, "reward": "map"},
    {"dex": 491, "kind": "caught_all", "of": [488], "reward": "map"},
    {"dex": 489, "kind": "type_catch", "types": ["물"], "n": 10, "reward": "map"},
    {"dex": 785, "kind": "type_catch", "types": ["전기"], "n": 6, "reward": "map"},
    {"dex": 786, "kind": "battle_wins", "n": 5, "reward": "map"},
    {"dex": 787, "kind": "type_catch", "types": ["풀"], "n": 8, "reward": "map"},
    {"dex": 788, "kind": "safari_catches", "n": 25, "reward": "map"},
    {"dex": 638, "kind": "type_catch", "types": ["강철"], "n": 5, "reward": "map"},
    {"dex": 639, "kind": "type_catch", "types": ["바위"], "n": 5, "reward": "map"},
    {"dex": 640, "kind": "type_catch", "types": ["격투"], "n": 5, "reward": "map"},
    {"dex": 647, "kind": "caught_all", "of": [638, 639, 640], "reward": "map"},
    {"dex": 492, "kind": "type_catch", "types": ["풀", "벌레"], "n": 15, "reward": "map"},
    {"dex": 641, "kind": "type_catch", "types": ["비행"], "n": 10, "reward": "map"},
    {"dex": 642, "kind": "type_catch", "types": ["전기"], "n": 10, "reward": "map"},
    {"dex": 645, "kind": "caught_all", "of": [641, 642], "reward": "map"},
    {"dex": 643, "kind": "zone_catch", "zone": "dragon", "n": 3, "reward": "map"},
    {"dex": 644, "kind": "zone_catch", "zone": "dragon", "n": 5, "reward": "map"},
    {"dex": 646, "kind": "caught_all", "of": [643, 644], "reward": "map"},
    {"dex": 789, "kind": "zone_catch", "zone": "ultra", "n": 2, "reward": "map"},
    {"dex": 800, "kind": "caught_all", "of": [789], "reward": "map"},
    {"dex": 385, "kind": "quiz_streak", "n": 7, "reward": "map"},
    {"dex": 386, "kind": "zone_catch", "zone": "ultra", "n": 4, "reward": "map"},
    {"dex": 720, "kind": "raid_slots", "n": 2, "reward": "map"},
    {"dex": 494, "kind": "battle_wins", "n": 3, "reward": "map"},
    {"dex": 649, "kind": "type_catch", "types": ["벌레"], "n": 10, "reward": "map"},
    {"dex": 719, "kind": "zone_catch", "zone": "desert", "n": 8, "reward": "map"},
    {"dex": 802, "kind": "type_catch", "types": ["고스트"], "n": 8, "reward": "map"},
    {"dex": 807, "kind": "zone_catch", "zone": "plant", "n": 5, "reward": "map"},
    {"dex": 801, "kind": "type_catch", "types": ["강철", "페어리"], "n": 12, "reward": "map"},
    {"dex": 772, "kind": "catches", "n": 40, "reward": "map"},
    {"dex": 485, "kind": "zone_catch", "zone": "lava", "n": 6, "reward": "map"}]'::jsonb) with ordinality u(x, o)
   where not exists (select 1 from jsonb_array_elements(s.value) y where (y ->> 'dex')::int = (x ->> 'dex')::int)), '[]'::jsonb)
 where s.key = 'legend_quests' and jsonb_typeof(s.value) = 'array';

-- ── 2. 퀘스트 셈 · 글 (0038 / 0042 + zone_catch) ─────────────────────────────────────────────────────────
create or replace function public._quest_cur(uid uuid, q jsonb) returns int
language sql stable security definer set search_path = '' as $$
  select case q ->> 'kind'
    when 'quiz_streak' then (   -- 가장 길게 이어진 연속 정답
      select coalesce(max(n), 0)::int from (
        select count(*) n from (
          select correct, sum(case when correct then 0 else 1 end) over (order by answered_at, id) grp
            from public.quiz_attempts where user_id = uid and answered_at is not null) x
         where correct group by grp) y)
    when 'battle_wins' then (select coalesce(battle_wins, 0) from public.profiles where user_id = uid)
    when 'catches' then (select count(*)::int from public.collection where user_id = uid and not from_egg)
    when 'raid_slots' then (select count(distinct date_trunc('hour', r.starts_at))::int
                              from public.raid_players rp join public.raids r on r.id = rp.raid_id
                             where rp.user_id = uid and rp.taps > 0)
    when 'qr_all' then (select count(distinct t.qr_id)::int from public.tickets t join public.qr_points q2 on q2.id = t.qr_id
                         where t.user_id = uid and t.special is null and t.status <> 'cancelled'
                           and q2.kind = 'static' and q2.visible_on_map and q2.active)
    when 'type_catch' then (select count(*)::int from public.collection c join public.species s on s.id = c.species_id
                             where c.user_id = uid and not c.from_egg
                               and string_to_array(coalesce(s.btype, ''), '/') && array(select jsonb_array_elements_text(coalesce(q -> 'types', '[]'))))
    when 'safari_catches' then (select count(*)::int from public.raid_encounters where user_id = uid and kind = 'safari' and status = 'caught')
    when 'zone_catch' then (select count(*)::int from public.raid_encounters
                             where user_id = uid and kind = 'safari' and status = 'caught' and zone = q ->> 'zone')
    when 'caught_all' then (select count(*)::int from jsonb_array_elements_text(coalesce(q -> 'of', '[]')) d
                             where exists (select 1 from public.collection c join public.species s on s.line_id = c.line_id
                                            where c.user_id = uid and s.dex = d::int))
    else 0 end
$$;

create or replace function public._quest_text(q jsonb, cur int, need int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case q ->> 'kind'
    when 'quiz_streak' then jsonb_build_object('cond', '퀴즈를 ' || need || '번 연속으로 맞혀야 한대', 'prog', '퀴즈 연속 정답 ' || least(cur, need) || '/' || need)
    when 'battle_wins' then jsonb_build_object('cond', '배틀에서 ' || need || '번 이겨야 한대', 'prog', '배틀 승리 ' || least(cur, need) || '/' || need)
    when 'catches' then jsonb_build_object('cond', '포켓몬을 ' || need || '마리 잡아야 한대', 'prog', '잡은 포켓몬 ' || least(cur, need) || '/' || need)
    when 'raid_slots' then jsonb_build_object('cond', '서로 다른 시간대의 레이드에 ' || need || '번 참가해야 한대', 'prog', '참가한 시간대 ' || least(cur, need) || '/' || need)
    when 'qr_all' then jsonb_build_object('cond', '지도에 있는 장소 QR을 모두 찍어야 한대', 'prog', '찍은 장소 ' || least(cur, need) || '/' || need)
    when 'type_catch' then (select jsonb_build_object('cond', t || ' 타입 포켓몬을 ' || need || '마리 잡아야 한대', 'prog', t || ' 타입 ' || least(cur, need) || '/' || need)
                              from (select string_agg(x, '·') t from jsonb_array_elements_text(coalesce(q -> 'types', '[]')) x) z)
    when 'safari_catches' then jsonb_build_object('cond', '사파리존에서 포켓몬을 ' || need || '마리 잡아야 한대', 'prog', '사파리존에서 잡은 포켓몬 ' || least(cur, need) || '/' || need)
    when 'zone_catch' then jsonb_build_object('cond', public._zone_name(q ->> 'zone') || '에서 포켓몬을 ' || need || '마리 잡아야 한대',
                                              'prog', public._zone_name(q ->> 'zone') || '에서 잡은 포켓몬 ' || least(cur, need) || '/' || need)
    when 'caught_all' then (select jsonb_build_object('cond', public._josa(t, '을', '를') || ' 모두 잡아야 한대', 'prog', '잡은 전설 ' || least(cur, need) || '/' || need)
                              from (select string_agg(public._sp_name(public._dex_sp(x::int)), '·' order by o) t
                                      from jsonb_array_elements_text(coalesce(q -> 'of', '[]')) with ordinality u(x, o)) z)
    else jsonb_build_object('cond', '아직 아무도 모른대', 'prog', '') end
$$;

create or replace function public._quest_done_text(q jsonb) returns text
language sql stable security definer set search_path = '' as $$
  select case q ->> 'kind'
    when 'quiz_streak' then '퀴즈를 ' || public._quest_need(q) || '번 연속으로 맞혔어요!'
    when 'battle_wins' then '배틀에서 ' || public._quest_need(q) || '번 이겼어요!'
    when 'catches' then '포켓몬을 ' || public._quest_need(q) || '마리 잡았어요!'
    when 'raid_slots' then '서로 다른 시간대의 레이드에 ' || public._quest_need(q) || '번 참가했어요!'
    when 'qr_all' then '지도에 있는 장소 QR을 모두 찍었어요!'
    when 'type_catch' then (select coalesce(t, '그') || ' 타입 포켓몬을 ' || public._quest_need(q) || '마리 잡았어요!'
                              from (select string_agg(x, '·') t from jsonb_array_elements_text(coalesce(q -> 'types', '[]')) x) z)
    when 'safari_catches' then '사파리존에서 포켓몬을 ' || public._quest_need(q) || '마리 잡았어요!'
    when 'zone_catch' then public._zone_name(q ->> 'zone') || '에서 포켓몬을 ' || public._quest_need(q) || '마리 잡았어요!'
    when 'caught_all' then (select public._josa(t, '을', '를') || ' 모두 잡았어요!'
                              from (select string_agg(public._sp_name(public._dex_sp(x::int)), '·' order by o) t
                                      from jsonb_array_elements_text(coalesce(q -> 'of', '[]')) with ordinality u(x, o)) z)
    else '전설의 포켓몬이 바라던 조건을 채웠어요!' end
$$;

-- 사파리존 전설 자리 (web/js/safari-maps.js LEGEND_HINTS 와 같게, 짧게)
create or replace function public._legend_where(p_dex int) returns text
language sql immutable set search_path = '' as $$
  select case p_dex
    when 377 then '미혹의 동굴 지하 2층 점자 방' when 378 then '여울의 동굴 지하 2층 점자 방'
    when 379 then '미혹의 동굴 지하 3층 점자 방' when 486 then '미혹의 동굴 거인의 제단'
    when 249 then '여울의 동굴 지하 3층 깊은 물가' when 382 then '깊은 연못'
    when 383 then '깊은 동굴 지하 2층' when 250 then '하늘 언덕' when 384 then '하늘의 제단'
    -- 0050
    when 380 then '꿈의 섬' when 381 then '꿈의 섬' when 488 then '꿈의 섬 초승달 꽃밭' when 491 then '꿈의 섬 어두운 야자숲'
    when 489 then '꿈의 섬 남쪽 물가' when 785 then '꿈의 섬 수호신의 돌기둥' when 786 then '꿈의 섬 수호신의 돌기둥'
    when 787 then '꿈의 섬 수호신의 돌기둥' when 788 then '꿈의 섬 수호신의 돌기둥'
    when 638 then '성검의 숲' when 639 then '성검의 숲' when 640 then '성검의 숲' when 647 then '성검의 숲 호숫가'
    when 492 then '성검의 숲 꽃밭'
    when 641 then '하늘 언덕' when 642 then '하늘 언덕' when 645 then '하늘 언덕'
    when 643 then '용의 굴 깊은 곳' when 644 then '용의 굴 깊은 곳' when 646 then '용의 굴 깊은 곳 얼음 제단'
    when 789 then '별의 제단' when 800 then '별의 제단' when 385 then '별의 제단' when 386 then '별의 제단' when 720 then '별의 제단'
    when 494 then '고대 유적' when 649 then '고대 유적' when 719 then '고대 유적' when 802 then '고대 유적'
    when 807 then '발전소 2층' when 801 then '발전소 2층' when 772 then '발전소 2층' when 485 then '용암 지대 용암 호숫가'
    else '깊은 곳' end
$$;

-- rule (0006): every migration that creates functions ends with this block (0048 list 그대로 — 새 공개 함수 없음)
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
