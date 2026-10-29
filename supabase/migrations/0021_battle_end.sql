-- 0021: 배틀 끝 고치기
--  · 새 배틀을 시작하면 하던 연습·친구 팀 배틀은 "취소" (승패 없음, reward.why = 'replaced'). 예전에는 진 것으로 끝나서,
--    열어 둔 옛 배틀 화면(다른 탭·폰)에서 누르면 몬스터가 다 살아 있는데 갑자기 "졌다"로 끝났다. 실시간 대전은 그대로 (기권 = 짐).
--  · 연습 배틀 경험치·물건은 하루 practice_exp_daily (10) 판까지. 넘으면 reward.exp_why = 'practice_max'.
--  · 영구 기술머신 (pm01~03, 아주 드묾): bag_use 가 개수를 줄이지 않음.

insert into public.settings (key, value) values ('practice_exp_daily', '10') on conflict (key) do nothing;

create or replace function public._bt_close_mine(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id, p1, mode from public.battles where (p1 = uid or p2 = uid) and status = 'active' and (mode = 'pvp' or p1 = uid) loop
    if r.mode = 'pvp' then
      perform public._bt_finish(r.id, case when r.p1 = uid then 1 else 0 end::smallint);
    else
      update public.battles set status = 'cancelled', reward = jsonb_build_object('ticket', false, 'why', 'replaced'),
             deadline = null, updated_at = now() where id = r.id;
    end if;
  end loop;
  update public.battles set status = 'cancelled', deadline = null, updated_at = now() where p1 = uid and status = 'invite';
end $$;

create or replace function public._bt_finish(bid bigint, w smallint) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.battles; uid uuid; v_opp uuid; rw jsonb; n int; v_day date := (now() at time zone 'Asia/Seoul')::date;
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
        update public.profiles set evo_tickets = evo_tickets + 1, battle_wins = battle_wins + 1, battle_wins_at = now() where user_id = uid;
        rw := jsonb_build_object('ticket', true, 'today', n + 1);
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

-- 영구 기술머신 (items.effect.permanent): 써도 가방에서 없어지지 않음
create or replace function public.bag_use(p_item text, p_line int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); it public.items; c public.collection; lv int;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into it from public.items where key = p_item;
  if not found then raise exception 'BAD_ITEM'; end if;
  if it.pocket = 'med' then raise exception 'BATTLE_ONLY'; end if;
  if it.pocket = 'hold' then raise exception 'HOLD_ITEM'; end if;
  select * into c from public.collection where user_id = uid and line_id = p_line for update;
  if not found then raise exception 'NO_MONSTER'; end if;
  if it.pocket = 'tool' and it.effect ? 'level' then
    if c.level >= 100 then raise exception 'MAX_LEVEL'; end if;
  elsif it.pocket = 'tm' then
    if it.move_id is null or not exists (select 1 from public.learnset where line_id = p_line and move_id = it.move_id and how = 'tm') then
      raise exception 'TM_NOT_COMPATIBLE';
    end if;
    if it.move_id = any (public._known_moves(uid, p_line)) then raise exception 'ALREADY_KNOWN'; end if;
  end if;
  if coalesce((it.effect ->> 'permanent')::boolean, false) then   -- 영구 기술머신: 가지고만 있으면 됨 (없어지지 않음)
    if not exists (select 1 from public.inventory where user_id = uid and item = p_item and qty > 0) then raise exception 'NO_ITEM'; end if;
  else
    update public.inventory set qty = qty - 1 where user_id = uid and item = p_item and qty > 0;
    if not found then raise exception 'NO_ITEM'; end if;
  end if;
  if it.pocket = 'tool' then
    lv := public._add_levels(uid, p_line, (it.effect ->> 'level')::int);
    return jsonb_build_object('ok', true, 'level', lv);
  end if;
  update public.collection set learned = array_append(learned, it.move_id), updated_at = now() where user_id = uid and line_id = p_line;
  return jsonb_build_object('ok', true, 'learned', it.move_id);
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
  public.screen_raids(),
  public.battle_code(text, boolean), public.battle_peek(text), public.battle_set_team(int[]), public.battle_start_cpu(int[], text),
  public.battle_start_team(text, int[]), public.battle_challenge(text, int[]), public.battle_inbox(), public.battle_accept(bigint, int[]),
  public.battle_decline(bigint), public.battle_state(bigint), public.battle_act(bigint, jsonb), public.battle_forfeit(bigint), public.battle_today(),
  public.battle_recent(),
  public.bag_state(bigint), public.bag_set_moves(int, int[]), public.bag_set_held(int, text), public.bag_use(text, int),
  public.admin_create_qr(text, text, text, text), public.admin_rotate_qr(text, boolean), public.admin_cancel_ticket(text),
  public.admin_set_role(text, text), public.admin_adjust_tickets(text, int), public.admin_unlink(text), public.admin_stats(),
  public.admin_make_login_codes(text[], text[]), public.admin_export_ranking(), public.admin_relink(text, text),
  public.admin_grant_monster(text, int, int), public.admin_set_in_ranking(text, boolean), public.admin_list_staff(),
  public.admin_invite_staff(text, text), public.admin_remove_staff(text), public.admin_list_requests(),
  public.admin_decide_reset(bigint, boolean), public.admin_set_inquiry(bigint, boolean),
  public.admin_create_raid(int, int, int, boolean, text, text), public.admin_end_raid(bigint), public.admin_list_raids(),
  public.admin_delete_students(text[], text), public.admin_count_students(),
  public.admin_create_staff_login(text, text, text), public.admin_reset_staff_password(text),
  public.admin_list_staff_logins(), public.admin_remove_staff_login(text),
  public.admin_game_stats(), public.admin_give_item(text, text, int), public.admin_set_level(text, int, int)
to authenticated;
