-- 0046: 알림 글 "부스에서 가방 QR을 보여 주면" → "티켓 QR" (앱은 이 QR 을 '티켓 QR' 이라고 부름).
--   글만 바꿈 (동작 같음): 그 글이 들어 있는 함수 2개를 0042 의 마지막 정의 그대로 다시 만듦
--     _quest_check (퀘스트 특별 티켓 알림) · _ticket_notice (특별 티켓 알림 트리거 함수 — 트리거는 0038 그대로)
--   + 아직 안 본 알림 글도 바꿈. 끝에 권한 블록 (0045 와 같음).

create or replace function public._quest_check(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare q jsonb; sp int; ln int; nm text; nn text; why text;
begin
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
end $$;

-- 특별 티켓 → 알림 (0038) + 이유 첫 줄 · 문장마다 줄 바꿈 · 반짝
create or replace function public._ticket_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.tickets; sp int; nm text; rar text; ln int; dex int; title text; why text; body text; tail text; legend boolean;
  e public.raid_encounters; q jsonb; place text; gt text; rt text; nl text := E'\n';
begin
  select * into t from public.tickets where id = new.id;
  if not found or t.special is null or t.status = 'cancelled' then return null; end if;
  sp := coalesce(t.result_species, t.fixed_species);
  select s.name, l.rarity, l.id, s.dex into nm, rar, ln, dex from public.species s join public.lines l on l.id = s.line_id where s.id = sp;
  legend := rar = 'legendary';
  if t.special in ('wild', 'safari') and not legend then return null; end if;
  if t.special = 'quest' then return null; end if;   -- 퀘스트 티켓 알림은 _quest_check 가 바로 씀
  if t.special in ('wild', 'safari', 'legend', 'roam', 'raid') then
    select * into e from public.raid_encounters where user_id = t.user_id and result ->> 'nonce' = t.nonce order by id desc limit 1;
  end if;
  if t.status = 'redeemed' then tail := '박스에 들어갔어요.';
  else tail := '티켓 주머니에 넣어 두었어요.' || nl || '부스에서 티켓 QR을 보여 주면 받을 수 있어요.'; end if;
  case t.special
    when 'dex50' then title := '도감 50% 달성!'; why := '학교 도감을 절반 넘게 채웠어요!';
      body := why || nl || '상으로 ' || nm || '의 특별 티켓을 받았어요!' || nl || tail;
    when 'dex100' then title := '도감 완성!'; why := '학교 도감을 모두 채웠어요!';
      body := why || nl || '상으로 ' || nm || '의 특별 티켓을 받았어요!' || nl || tail;
    when 'raid' then title := '레이드 승리!';
      select r.title into rt from public.raids r where r.id = e.raid_id;
      if rt is null then
        select r.title into rt from public.raid_players rp join public.raids r on r.id = rp.raid_id
         where rp.user_id = t.user_id and r.species_id = sp order by r.id desc limit 1;
      end if;
      why := '레이드' || coalesce(' 「' || rt || '」', '') || '에서 친구들과 함께 ' || public._josa(nm, '을', '를') || ' 쓰러뜨렸어요!';
      body := why || nl || case when t.status = 'redeemed' then '그대로 잡아서 박스에 들어갔어요.' else '상으로 특별 티켓을 받았어요!' || nl || tail end;
    when 'egg' then title := '학교의 숨은 선물 발견!';
      why := case ln when 80 then '트레이너 카드에 숨은 비밀을 찾았어요!' when 81 then '타입 상성표에 숨은 비밀을 찾았어요!'
                     when 82 then '학교 지도에 숨은 비밀을 찾았어요!' else '학교 어딘가에 숨은 비밀을 찾았어요!' end;
      body := why || nl || nm || '의 특별 티켓을 받았어요!' || nl || tail;
    when 'gift' then title := '이상한 소포가 도착했다!';
      select g.title into gt from public.gift_claims c join public.gift_codes g on g.id = c.gift_id
       where c.user_id = t.user_id and g.species_id = sp order by c.at desc limit 1;
      why := '이상한 소포' || coalesce(' 「' || gt || '」', '') || ' 코드를 넣었어요!';
      body := why || nl || '소포 안에 ' || public._josa(nm, '이', '가') || ' 들어 있었어요!' || nl || tail;
    when 'roam' then title := '방랑 전설을 잡았다!';
      select name into place from public.qr_points where id = e.zone;
      why := '방랑하던 ' || public._josa(nm, '을', '를') || ' ' || coalesce(place || '에서', '장소 QR에서') || ' 만났어요!';
      body := why || nl || '놓치지 않고 잡았어요!' || nl || tail;
    when 'legend' then title := '전설의 포켓몬을 잡았다!';
      select x into q from jsonb_array_elements(coalesce(public._setting('legend_quests'), '[]')) x where (x ->> 'dex')::int = dex limit 1;
      why := coalesce(public._quest_done_text(q), '전설의 포켓몬이 바라던 조건을 채웠어요!');
      body := why || nl || '그래서 깨어난 ' || public._josa(nm, '을', '를') || ' 사파리존 ' || public._legend_where(dex) || '에서 잡았어요!' || nl || tail;
    when 'safari' then title := '전설의 포켓몬을 잡았다!';
      why := '사파리존 ' || public._zone_name(e.zone) || '에서 만난 야생 포켓몬이 전설의 ' || public._josa(nm, '이었어요!', '였어요!');
      body := why || nl || tail;
    when 'wild' then title := '전설의 포켓몬을 잡았다!';
      why := '걸어 다니다 만난 야생 포켓몬이 전설의 ' || public._josa(nm, '이었어요!', '였어요!');
      body := why || nl || tail;
    else title := '전설의 포켓몬을 잡았다!'; why := public._josa(nm, '을', '를') || ' 잡았어요!'; body := why || nl || tail;
  end case;
  if coalesce(t.shiny, false) then body := body || nl || '✦ 반짝이는 색이에요! ✦'; end if;
  perform public._notice(t.user_id, t.special, sp, title, body,
                         jsonb_build_object('nonce', t.nonce, 'pending', t.status = 'pending', 'legend', legend,
                                            'reason', why, 'shiny', coalesce(t.shiny, false)));
  return null;
end $$;

-- 이미 만들어졌지만 아직 안 본 알림 (sync 의 state.notices 로 다시 보임) 의 글도 같은 말로
update public.notices set body = replace(body, '가방 QR', '티켓 QR') where seen_at is null and body like '%가방 QR%';

-- rule (0006): every migration that creates functions ends with this block (copied from 0045 unchanged: no signature changes here)
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
