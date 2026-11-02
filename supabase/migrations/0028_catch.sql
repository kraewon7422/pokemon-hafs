-- 0028: 몬스터 잡기 장면 (부스에서 받은 몬스터를 폰에서 몬스터볼로 잡음) — 잡기는 언제나 성공, 던지기 솜씨만 보너스
--  · tickets.catch_grade: 그 티켓의 잡기 결과 (none/nice/great/excellent) — 한 번만 기록
--  · catch_bonus(p_nonce, p_grade, p_curve): 그 몬스터에게 경험치 (설정 catch_exp, 기본 나이스 20 · 그레이트 40 · 엑설런트 80, 커브볼 +20)
--    (폰이 보내는 값이라 조작될 수 있음 → 보너스는 작게, 티켓 하나에 한 번)

alter table public.tickets add column if not exists catch_grade text check (catch_grade in ('none', 'nice', 'great', 'excellent'));
insert into public.settings (key, value) values ('catch_exp', '{"none": 0, "nice": 20, "great": 40, "excellent": 80, "curve": 20}') on conflict (key) do nothing;

create or replace function public.catch_bonus(p_nonce text, p_grade text, p_curve boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t public.tickets; v_line int; cfg jsonb := coalesce(public._setting('catch_exp'), '{}'::jsonb);
  amt int; up int; c public.collection;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_grade is null or p_grade not in ('none', 'nice', 'great', 'excellent') then raise exception 'BAD_GRADE'; end if;
  select * into t from public.tickets where nonce = p_nonce and user_id = uid for update;
  if not found or t.status <> 'redeemed' or t.result_species is null then raise exception 'NOT_FOUND'; end if;
  if t.catch_grade is not null then raise exception 'ALREADY_CLAIMED'; end if;
  select line_id into v_line from public.species where id = t.result_species;
  amt := coalesce((cfg ->> p_grade)::int, 0) + (case when coalesce(p_curve, false) and p_grade <> 'none' then coalesce((cfg ->> 'curve')::int, 0) else 0 end);
  update public.tickets set catch_grade = p_grade where id = t.id;
  up := public._gain_exp(uid, v_line, amt);
  select * into c from public.collection where user_id = uid and line_id = v_line;
  return jsonb_build_object('grade', p_grade, 'exp', amt, 'levels', coalesce(up, 0), 'line', v_line, 'level', c.level);
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
