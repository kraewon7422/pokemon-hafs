-- 0034 진화의돌 정리 (포켓몬처럼)
--  · 레벨 진화 (279) = 진화 레벨이 되면 무료 100%. 교환·친밀도·시간 진화 (55) 도 이 게임에선 단계에 맞춘 레벨로.
--  · 돌 진화 (46: 라이츄 · 픽시 · 샤미드 · 윈디 …) = species.evo_item: 레벨로는 진화 안 함, 진화의돌 1개로 100% 진화.
--  · 레벨 진화 포켓몬도 진화의돌로 일찍 진화할 수 있음 (예전처럼 확률).
--  · 진화의돌은 덜 자주: 퀴즈 정답 quiz_stone_chance (35%), 친구 배틀 승리 battle_stone_chance (50%), 룰렛 꽝이 늘어남.
alter table public.species add column if not exists evo_item boolean not null default false;
insert into public.settings (key, value) values ('quiz_stone_chance', '0.35'), ('battle_stone_chance', '0.5')
on conflict (key) do nothing;
update public.settings set value = '[[0, 72], [1, 24], [3, 4]]'::jsonb, updated_at = now()
 where key = 'roulette_odds' and value = '[[0, 60], [1, 30], [3, 8], [5, 2]]'::jsonb;


create or replace function public.evolve(p_line int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked();
  c public.collection;
  base numeric; prob numeric; guaranteed boolean; win boolean; need int; by_level boolean; by_item boolean;
begin
  perform public._assert_open();
  select * into c from public.collection where user_id = p.user_id and line_id = p_line;
  if not found then raise exception 'NOT_OWNED'; end if;
  if c.stage >= (select max_stage from public.lines where id = p_line) then raise exception 'MAX_STAGE'; end if;
  select evo_lv, evo_item into need, by_item from public.species where line_id = p_line and stage = c.stage + 1;
  by_level := not coalesce(by_item, false) and c.level >= coalesce(need, 101);
  if not by_level then
    update public.profiles set evo_tickets = evo_tickets - 1 where user_id = p.user_id and evo_tickets > 0;
    if not found then raise exception 'NO_TICKET'; end if;
  end if;

  base := (public._setting('evo_prob') ->> c.stage)::numeric;
  guaranteed := c.evo_fails >= (public._setting('evo_pity_max') ->> c.stage)::int;
  prob := least(1, base + c.evo_fails * (public._setting('evo_pity_step'))::numeric);
  win := by_level or coalesce(by_item, false) or guaranteed or random() < prob;   -- 돌 진화 = 진화의돌로 100%

  if win then
    update public.collection set stage = stage + 1, evo_fails = 0, updated_at = now()
     where user_id = p.user_id and line_id = p_line returning * into c;
    perform public._recompute(p.user_id);
  else
    update public.collection set evo_fails = evo_fails + 1, updated_at = now()
     where user_id = p.user_id and line_id = p_line returning * into c;
  end if;
  insert into public.events (user_id, kind, data)
  values (p.user_id, 'evolve', jsonb_build_object('line', p_line, 'success', win, 'stage', c.stage, 'by_level', by_level));

  return jsonb_build_object(
    'success', win, 'stage', c.stage, 'evo_fails', c.evo_fails, 'by_level', by_level, 'by_item', coalesce(by_item, false),
    'species_id', (p_line - 1) * 3 + c.stage,
    'evo_tickets', (select evo_tickets from public.profiles where user_id = p.user_id),
    'profile', (select public._profile_json(x) from public.profiles x where x.user_id = p.user_id));
end $$;


create or replace function public.answer_quiz(p_attempt bigint, p_choice int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked();
  a public.quiz_attempts;
  ans smallint;
  ok boolean;
  give boolean := false;
begin
  perform public._assert_open();
  select * into a from public.quiz_attempts where id = p_attempt and user_id = p.user_id and answered_at is null;
  if not found then raise exception 'NO_QUIZ'; end if;
  if p_choice < 0 or p_choice >= array_length(a.perm, 1) then raise exception 'BAD_CHOICE'; end if;
  select answer into ans from public.quiz_answers where quiz_id = a.quiz_id;
  ok := a.perm[p_choice + 1] = ans;
  if ok and (select count(*) from public.quiz_attempts where user_id = p.user_id and granted
             and answered_at >= public._today_start()) < (public._setting('quiz_ticket_daily_cap'))::int
     and random() < coalesce((public._setting('quiz_stone_chance'))::numeric, 1) then   -- 0034: 정답이면 가끔 진화의돌
    give := true;
    update public.profiles set evo_tickets = evo_tickets + 1 where user_id = p.user_id;
  end if;
  update public.quiz_attempts set chosen = p_choice, correct = ok, granted = give, answered_at = now() where id = a.id;
  insert into public.events (user_id, kind, data) values (p.user_id, 'quiz', jsonb_build_object('quiz', a.quiz_id, 'correct', ok));
  return jsonb_build_object('correct', ok, 'answer_pos', array_position(a.perm, ans) - 1, 'granted', give,
                            'evo_tickets', (select evo_tickets from public.profiles where user_id = p.user_id));
end $$;


create or replace function public._bt_finish(bid bigint, w smallint) returns void
language plpgsql security definer set search_path = '' as $$
declare got boolean; b public.battles; uid uuid; v_opp uuid; rw jsonb; n int; v_day date := (now() at time zone 'Asia/Seoul')::date;
  turns int; s int; pu uuid; m jsonb; foe_lv numeric; base numeric; up int; ex jsonb; exps jsonb := '{}'; its jsonb := '{}'; k text; won boolean;
  pdrop numeric; npr int; pmax int := coalesce((public._setting('practice_exp_daily'))::int, 10);
begin
  select * into b from public.battles where id = bid for update;
  if b.status <> 'active' then return; end if;
  rw := jsonb_build_object('ticket', false);
  if w is not null then
    uid := case when w = 0 then b.p1 when b.mode = 'pvp' then b.p2 end;
    v_opp := case when w = 0 then b.p2 else b.p1 end;
    if uid is null then rw := jsonb_build_object('ticket', false, 'why', 'lost');
    elsif b.mode = 'cpu' or v_opp is null then rw := jsonb_build_object('ticket', false, 'why', 'practice');
    elsif exists (select 1 from public.battle_rewards r where r.user_id = uid and r.opp = v_opp and r.day = v_day) then
      rw := jsonb_build_object('ticket', false, 'why', 'same_opp');
    else
      select count(*) into n from public.battle_rewards r where r.user_id = uid and r.day = v_day;
      if n >= coalesce((public._setting('battle_daily_max'))::int, 3) then
        rw := jsonb_build_object('ticket', false, 'why', 'daily_max');
      else
        insert into public.battle_rewards (user_id, opp, day, battle_id) values (uid, v_opp, v_day, bid);
        got := random() < coalesce((public._setting('battle_stone_chance'))::numeric, 1);   -- 0034: 이기면 가끔 진화의돌
        update public.profiles set evo_tickets = evo_tickets + (case when got then 1 else 0 end), battle_wins = battle_wins + 1, battle_wins_at = now() where user_id = uid;
        rw := jsonb_build_object('ticket', got, 'today', n + 1, 'why', case when got then null else 'luck' end);
        insert into public.events (kind, data) values ('battle_won', jsonb_build_object('battle', bid, 'mode', b.mode));
      end if;
    end if;
  end if;
  turns := coalesce((b.state ->> 'turn')::int, 0);
  -- (plpgsql: IF 조건 안의 CASE … THEN 은 IF 의 THEN 으로 잘못 읽힌다 → 미리 계산)
  pdrop := case when b.mode = 'cpu' then coalesce((public._setting('drop_practice'))::numeric, 0.15)
                else coalesce((public._setting('drop_battle'))::numeric, 0.5) end;
  -- 연습 배틀: 경험치·물건은 하루 practice_exp_daily 판까지 (연습만 반복해서 레벨·회복약을 끝없이 모으지 않게)
  if b.mode = 'cpu' and turns >= 2 then
    select count(*) into npr from public.battles x
     where x.p1 = b.p1 and x.mode = 'cpu' and x.status = 'over' and x.id <> bid
       and x.updated_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
       and coalesce((x.reward ->> 'practice_counted')::boolean, false);
    if npr >= pmax then
      rw := rw || jsonb_build_object('exp_why', 'practice_max', 'practice_max', pmax);
      update public.battles set status = 'over', winner = w, reward = rw, deadline = null, updated_at = now() where id = bid;
      return;
    end if;
    rw := rw || jsonb_build_object('practice_counted', true, 'practice_left', pmax - npr - 1);
  end if;
  for s in 0 .. 1 loop
    pu := case when s = 0 then b.p1 when b.mode = 'pvp' then b.p2 end;
    continue when pu is null or turns < 2;
    won := w is not null and w = s;
    if public._lv_on('lv_from_battle') then
      select avg((x ->> 'lv')::numeric) into foe_lv from jsonb_array_elements(b.state -> 'sides' -> (1 - s) -> 'mons') x;
      base := coalesce((public._setting('exp_battle_mul'))::numeric, 4) * coalesce(foe_lv, 50)
              * (case b.mode when 'cpu' then coalesce((public._setting('exp_practice'))::numeric, 0.5) when 'pvp' then 1.5 else 1 end)
              * (case when won then 1 else coalesce((public._setting('exp_lose'))::numeric, 0.4) end);
      ex := '[]';
      for m in select x from jsonb_array_elements(b.state -> 'sides' -> s -> 'mons') x where coalesce((x ->> 'out')::boolean, false) loop
        up := public._gain_exp(pu, (m ->> 'line')::int, round(base)::int);
        ex := ex || jsonb_build_object('line', (m ->> 'line')::int, 'name', m ->> 'name', 'exp', round(base)::int, 'up', up,
                                       'lv', (select level from public.collection where user_id = pu and line_id = (m ->> 'line')::int));
      end loop;
      exps := exps || jsonb_build_object(s::text, ex);
    end if;
    if won and random() < pdrop then
      k := public._roll_item(case when b.mode = 'cpu' then 'practice' else 'battle' end);
      if k is not null then
        perform public._give_item(pu, k, 1, 'battle');
        its := its || jsonb_build_object(s::text, k);
      end if;
    end if;
  end loop;
  rw := rw || jsonb_build_object('exp', exps, 'item', its);
  update public.battles set status = 'over', winner = w, reward = rw, deadline = null, updated_at = now() where id = bid;
end $$;


-- rule (0006): every migration that creates functions ends with this block
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
  public.safari_state(), public.safari_encounter(int), public.safari_result(bigint, int, boolean, text, boolean)
to authenticated;
