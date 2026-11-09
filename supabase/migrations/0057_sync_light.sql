-- 0057 sync 가볍게: 전설 퀘스트 확인(_quest_check)을 바뀐 것이 있을 때만
-- sync 는 1분마다 불리는데, 그때마다 전설 퀘스트 47개의 진행을 하나하나 세던 것(sync 시간의 1/3)이 축제 규모에서 DB 를 바쁘게 함.
-- 퀘스트가 보는 자료(잡은 포켓몬 · 퀴즈 · 배틀 승리 · 레이드 · 티켓 · 사파리 잡기 · 끝낸 퀘스트 · 퀘스트 설정)를 짧은 지문으로 만들어
-- 지난번과 같으면 건너뜀. 하나라도 바뀌면 예전처럼 47개를 모두 확인함 → 결과는 같고 횟수만 줄어듦.
-- 같은 지문으로 sync 의 'legends' 목록(_quest_rows, 사육사 · 도감 진행 표시)도 저장해 두었다가 다시 씀.

alter table public.profiles add column if not exists quest_fp text;
alter table public.profiles add column if not exists quest_rows_cache jsonb;
-- 학생별 레이드 참가 찾기 (퀘스트 지문 · raid_slots 퀘스트): (raid_id, user_id) 기본 키로는 user_id 만으로 못 찾음
create index if not exists raid_players_user on public.raid_players (user_id);

create or replace function public._quest_fp(uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select concat_ws('|',
    md5(coalesce(public._setting('legend_quests')::text, '')),
    (select count(*) || ':' || coalesce(sum(id), 0) || ':' || coalesce(sum(species_id), 0) from public.collection where user_id = uid),
    (select count(*) from public.quiz_attempts where user_id = uid and answered_at is not null),
    (select coalesce(battle_wins, 0) from public.profiles where user_id = uid),
    (select count(*) from public.raid_players where user_id = uid and taps > 0),
    (select count(*) || ':' || coalesce(max(id), 0) || ':' || count(*) filter (where status = 'cancelled') from public.tickets where user_id = uid),
    (select count(*) from public.raid_encounters where user_id = uid and status = 'caught'),
    (select count(*) from public.legend_quest_done where user_id = uid),
    (select count(*) from public.trade_seen where user_id = uid))
$$;

-- 예전 _quest_rows (0050) 를 그대로 _quest_rows_raw 로: 지문이 바뀌었을 때만 이것으로 다시 만듦
create or replace function public._quest_rows_raw(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(r order by o), '[]') from (
    select u.o, jsonb_build_object(
      'dex', (q ->> 'dex')::int, 'species_id', sp.id, 'line_id', sp.line_id, 'name', sp.name, 'kind', q ->> 'kind', 'reward', q ->> 'reward',
      'cur', z.cur, 'need', z.need, 'done', z.done, 'ok', z.done or z.cur >= z.need,
      'caught', exists (select 1 from public.collection c where c.user_id = uid and c.line_id = sp.line_id),
      'granted', exists (select 1 from public.tickets t where t.user_id = uid and t.special = 'quest' and t.fixed_species = sp.id and t.status <> 'cancelled'),
      'seen', exists (select 1 from public._seen_species(uid) x where x = sp.id),
      'cond', public._quest_text(q, z.cur, z.need) ->> 'cond', 'prog', public._quest_text(q, z.cur, z.need) ->> 'prog') r
    from jsonb_array_elements(coalesce(public._setting('legend_quests'), '[]')) with ordinality u(q, o)
    join public.species sp on sp.id = public._dex_sp((q ->> 'dex')::int)
    cross join lateral (select public._quest_cur(uid, q) cur, public._quest_need(q) need,
                               exists (select 1 from public.legend_quest_done d where d.user_id = uid and d.dex = (q ->> 'dex')::int) done) z) x
$$;

-- 저장해 둔 목록의 지문이 지금과 같으면 그것을, 아니면 새로 만듦 (읽기만 함 — 저장은 _quest_check 가)
create or replace function public._quest_rows(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when p.quest_fp is not null and p.quest_rows_cache is not null and p.quest_fp = public._quest_fp(uid)
              then p.quest_rows_cache else public._quest_rows_raw(uid) end
    from public.profiles p where p.user_id = uid
$$;

create or replace function public._quest_check(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare q jsonb; sp int; ln int; nm text; nn text; why text; fp text := public._quest_fp(uid);
begin
  -- 0057: 지난번 확인 뒤로 퀘스트가 보는 자료가 하나도 안 바뀌었으면 건너뜀
  if exists (select 1 from public.profiles where user_id = uid and quest_fp = fp and quest_rows_cache is not null) then return; end if;
  for q in select x from jsonb_array_elements(coalesce(public._setting('legend_quests'), '[]')) x loop
    continue when exists (select 1 from public.legend_quest_done d where d.user_id = uid and d.dex = (q ->> 'dex')::int);
    continue when public._quest_cur(uid, q) < public._quest_need(q);
    sp := public._dex_sp((q ->> 'dex')::int);
    continue when sp is null;
    insert into public.legend_quest_done (user_id, dex) values (uid, (q ->> 'dex')::int) on conflict do nothing;
    select line_id, name into ln, nm from public.species where id = sp;
    why := public._quest_done_text(q);
    if q ->> 'reward' = 'ticket' then
      if not exists (select 1 from public.tickets where user_id = uid and special = 'quest' and fixed_species = sp) then
        insert into public.tickets (nonce, user_id, qr_id, token, special, fixed_species)
        values (public._rand(12, 'abcdefghijklmnopqrstuvwxyz0123456789'), uid, 'QUEST', 'quest', 'quest', sp) returning nonce into nn;
        perform public._notice(uid, 'quest', sp, '전설의 포켓몬이 나타났다!',
          why || E'\n' || '그러자 ' || public._josa(nm, '이', '가') || ' 나타났어요!' || E'\n'
              || '특별 티켓을 티켓 주머니에 넣어 두었어요.' || E'\n' || '부스에서 티켓 QR을 보여 주면 받을 수 있어요.',
          jsonb_build_object('nonce', nn, 'pending', true, 'legend', true, 'dex', (q ->> 'dex')::int, 'reason', why));
      end if;
    elsif not exists (select 1 from public.collection where user_id = uid and line_id = ln) then
      perform public._notice(uid, 'legend_ready', sp, public._josa(nm, '이', '가') || ' 깨어났다!',
        why || E'\n' || '이제 사파리존 ' || public._legend_where((q ->> 'dex')::int) || '에서 '
            || public._josa(nm, '을', '를') || ' 만날 수 있어요!' || E'\n' || '사육사에게 가는 길을 물어봐요.',
        jsonb_build_object('dex', (q ->> 'dex')::int, 'tab', 'map', 'reason', why));
    end if;
  end loop;
  -- 이번 확인이 티켓 · 끝낸 퀘스트를 늘렸을 수 있으므로 끝난 뒤의 지문과 목록을 저장
  update public.profiles set quest_fp = public._quest_fp(uid), quest_rows_cache = public._quest_rows_raw(uid) where user_id = uid;
end $$;

-- ── 6. 권한 ───────────────────────────────────────────────────────────────────────────────────────────────────
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
  public.legend_battle(bigint, bigint[]), public.admin_legend_sim(int, jsonb, int),
  -- 0056
  public.trade_open(text), public.trade_current(), public.trade_state(bigint), public.trade_offer(bigint, bigint),
  public.trade_confirm(bigint, int), public.trade_cancel(bigint), public.trade_check(), public.admin_trades(int)
to authenticated;
notify pgrst, 'reload schema';
