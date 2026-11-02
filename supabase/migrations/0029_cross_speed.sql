-- 0029: 몬스터 등굣길이 빨라짐 (한 번 뛰기 0.09초, 쉼 없음 → 아주 빠른 사람은 1초에 11칸 남짓)
--  · 점수 확인만 바꿈: 등굣길 점수 ≤ 초×12 + 30 (예전 ×6). 나머지 게임은 그대로.

create or replace function public.submit_minigame_score(p_game text, p_score int, p_ms int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n int; ok boolean;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_game not in ('surf', 'dodge', 'maze', 'land', 'cross') then raise exception 'BAD_GAME'; end if;
  if coalesce(public._setting('minigame_off'), '[]'::jsonb) ? p_game then raise exception 'GAME_OFF'; end if;
  select count(*) into n from public.collection where user_id = uid;
  if n < coalesce((public._setting('minigame_unlock'))::int, 10) then raise exception 'MINIGAME_LOCKED'; end if;
  if exists (select 1 from public.minigame_scores where user_id = uid and game = p_game and at > now() - interval '5 seconds') then
    raise exception 'TRY_LATER';
  end if;
  -- 말이 되는 점수인지 (서핑: 1초에 최대 40m / 폭탄: 1초에 최대 30점 / 등굣길: 1초에 최대 12칸 / 땅따먹기: 판의 0~1000‰, 5초 이상 / 미로: 5판을 6초~10분)
  ok := case p_game
    when 'surf' then p_score between 0 and 1000000 and p_ms >= 1000 and p_score <= p_ms / 1000.0 * 40 + 50
    when 'land' then p_score between 0 and 1000 and p_ms >= 5000
    when 'dodge' then p_score between 0 and 100000 and p_ms >= 1000 and p_score <= p_ms / 1000.0 * 30 + 50
    when 'cross' then p_score between 0 and 100000 and p_ms >= 1000 and p_score <= p_ms / 1000.0 * 12 + 30
    else p_score between 6000 and 600000 and abs(p_ms - p_score) < 3000 end;
  if not ok then raise exception 'BAD_SCORE'; end if;
  insert into public.minigame_scores (user_id, game, score, ms) values (uid, p_game, p_score, p_ms);
  return public.minigame_ranking(p_game) || jsonb_build_object('submitted', p_score);
end $$;

-- rule (0006): every migration that creates functions ends with this block
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_code_account(text), public.create_number_account(text, text), public.request_password_reset(text, text, text, text),
  public.dev_create_account(text), public.dev_fake_google(text, text), public.send_inquiry_public(text, text, text),
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
  public.set_class(int, int), public.class_ranking(), public.achievements(), public.claim_achievement(text),
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
  public.admin_give_egg(text, text, int), public.admin_set_class(text, int, int),
  public.catch_bonus(text, text, boolean)
to authenticated;
