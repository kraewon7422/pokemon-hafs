-- 0033: 사파리존 — 지도 탭의 작은 도트 맵에서 풀숲을 걸으면 야생 포켓몬이 나오고, 사파리볼(하루 safari_balls_daily 개)로 잡는다.
--  · 걸음 판정은 서버: 앱은 풀숲 걸음 수만 보냄 → safari_encounter(p_steps) 가 시간당 걸음을 깎고 (safari_steps_per_sec),
--    safari_min_steps 걸음이 지난 뒤부터 한 걸음마다 safari_encounter_rate 확률을 서버에서 굴림. 하루 safari_daily_max_encounters 마리.
--  · 볼 세기 (우회 불가): 만날 때 그날 남은 볼(최대 20)을 그 만남에 '빌려 줌' (raid_encounters.balls). 대기 중인 사파리 만남은
--    한 번에 하나 → 같은 볼을 두 번 빌릴 수 없음. 결과(safari_result)에서 던진 수를 받아 safari_days.balls_used 에 더함:
--      잡음 = 1 ~ 빌린 수 (적어도 1개는 꼭 씀 → 앱을 고쳐도 하루에 잡는 수 ≤ 하루 볼 수), 못 잡음/도망 = 0 ~ 빌린 수.
--    encounter_result 를 바로 부르면 (던진 수 없음) 빌린 볼을 모두 쓴 것으로 셈. 볼은 만난 날(서울)의 몫에서 빠짐.
--  · 남은 볼이 0 이면 새로 만나지 않음 (내일 다시). 사파리 만남은 홈 배너(_encounters_json)에 안 나오고 safari_state 의 pending 으로 이어 잡음.
--  · 잡은 포켓몬 = 특별 티켓 special 'safari' (숨은 QR 'SAFARI') → 야생과 같은 _redeem_ticket 길로 도감에 들어감.

-- 설정 ----------------------------------------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('safari_balls_daily', '10'), ('safari_min_steps', '8'), ('safari_encounter_rate', '0.12'),
  ('safari_daily_max_encounters', '15'), ('safari_flee', '0.1'), ('safari_steps_per_sec', '6')
on conflict (key) do nothing;

-- 표 ------------------------------------------------------------------------------------------------------------
create table if not exists public.safari_days (
  user_id    uuid not null references public.profiles (user_id) on delete cascade on update cascade,
  day        date not null,
  balls_used int not null default 0 check (balls_used >= 0),
  encounters int not null default 0 check (encounters >= 0),
  steps      int not null default 0 check (steps >= 0),
  since      int not null default 0 check (since >= 0),      -- 마지막 만남 뒤 풀숲 걸음
  last_at    timestamptz,
  primary key (user_id, day)
);
alter table public.safari_days enable row level security;     -- 함수로만

alter table public.raid_encounters add column if not exists throws int;
alter table public.raid_encounters drop constraint if exists raid_encounters_kind_check;
alter table public.raid_encounters add constraint raid_encounters_kind_check check (kind in ('raid', 'wild', 'safari'));
alter table public.tickets drop constraint if exists tickets_special_check;
alter table public.tickets add constraint tickets_special_check check (special in ('raid', 'dex50', 'dex100', 'egg', 'wild', 'safari'));
insert into public.qr_points (id, name, hint, kind, visible_on_map, active, daily_cap) values
  ('SAFARI', '★ 사파리존', '', 'static', false, false, null)
on conflict (id) do nothing;

-- 함수 ----------------------------------------------------------------------------------------------------------
-- 홈 배너용 대기 만남: 사파리는 뺌 (사파리존 화면에서 이어 잡음)
create or replace function public._encounters_json(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'species_id', e.species_id, 'balls', e.balls, 'kind', e.kind,
                                               'raid_title', r.title, 'created_at', e.created_at) order by e.created_at), '[]')
  from public.raid_encounters e left join public.raids r on r.id = e.raid_id
  where e.user_id = uid and e.status = 'pending' and e.kind <> 'safari'
$$;

create or replace function public._safari_json(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'balls_daily', greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 10)),
    'balls_left', greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 10) - coalesce(d.balls_used, 0)),
    'encounters_today', coalesce(d.encounters, 0),
    'max_encounters', greatest(0, coalesce((public._setting('safari_daily_max_encounters'))::int, 15)),
    'steps_today', coalesce(d.steps, 0),
    'settings', jsonb_build_object(
      'min_steps', greatest(0, coalesce((public._setting('safari_min_steps'))::int, 8)),
      'flee', coalesce((public._setting('safari_flee'))::numeric, 0.1)),
    'pending', (select jsonb_build_object('id', e.id, 'species_id', e.species_id, 'balls', e.balls, 'kind', e.kind, 'created_at', e.created_at)
                  from public.raid_encounters e where e.user_id = uid and e.kind = 'safari' and e.status = 'pending'
                 order by e.id limit 1))
  from (select 1) one
  left join public.safari_days d on d.user_id = uid and d.day = public._seoul_day()
$$;

create or replace function public.safari_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return public._safari_json(auth.uid());
end $$;

-- 풀숲 걸음 p_steps (지난번 부른 뒤) → 만남 또는 {encounter: null, reason}
create or replace function public.safari_encounter(p_steps int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked(); uid uuid := p.user_id; dd date := public._seoul_day(); r public.safari_days;
  sps numeric := greatest(1, coalesce((public._setting('safari_steps_per_sec'))::numeric, 6));
  minst int := greatest(0, coalesce((public._setting('safari_min_steps'))::int, 8));
  rate numeric := least(1, greatest(0, coalesce((public._setting('safari_encounter_rate'))::numeric, 0.12)));
  maxe int := greatest(0, coalesce((public._setting('safari_daily_max_encounters'))::int, 15));
  daily int := greatest(0, coalesce((public._setting('safari_balls_daily'))::int, 10));
  secs numeric; acc int; left_b int; hit boolean := false; sinc int; wl int; wsp int; eid bigint; reason text;
begin
  if p_steps is null or p_steps < 0 or p_steps > 1000 then raise exception 'BAD_STEPS'; end if;
  -- 아직 안 끝낸 만남이 있으면 그것을 돌려줌 (볼을 두 번 빌리지 않게)
  if exists (select 1 from public.raid_encounters where user_id = uid and kind = 'safari' and status = 'pending') then
    return jsonb_build_object('encounter', public._safari_json(uid) -> 'pending', 'accepted', 0, 'reason', 'pending') || public._safari_json(uid);
  end if;
  insert into public.safari_days (user_id, day) values (uid, dd) on conflict do nothing;
  select * into r from public.safari_days where user_id = uid and day = dd for update;
  -- 걸음 속도 제한: 지난번부터 지난 시간 × 초당 걸음 (+1), 처음엔 3초로 봄, 30초까지만 모아 둠
  secs := case when r.last_at is null then 3 else least(30, greatest(0, extract(epoch from now() - r.last_at))) end;
  acc := greatest(0, least(p_steps, floor(secs * sps)::int + 1));
  sinc := r.since;
  left_b := greatest(0, daily - r.balls_used);
  if left_b <= 0 then reason := 'no_balls';
  elsif r.encounters >= maxe then reason := 'max';
  else
    for i in 1 .. acc loop
      sinc := sinc + 1;
      if sinc >= minst and random() < rate then hit := true; exit; end if;
    end loop;
  end if;
  if hit then
    wl := public._wild_line();
    if wl is not null then select id into wsp from public.species where line_id = wl and stage = 1; end if;
    if wsp is null then hit := false; reason := 'empty_pool'; end if;
  end if;
  if hit then
    insert into public.raid_encounters (user_id, raid_id, species_id, balls, kind)
    values (uid, null, wsp, least(20, left_b), 'safari') returning id into eid;
    update public.safari_days set steps = steps + acc, since = 0, encounters = encounters + 1, last_at = now()
     where user_id = uid and day = dd;
  else
    update public.safari_days set steps = steps + acc, since = case when reason is null then sinc else since + acc end, last_at = now()
     where user_id = uid and day = dd;
  end if;
  return jsonb_build_object('encounter', case when hit then public._safari_json(uid) -> 'pending' end,
                            'accepted', acc, 'reason', reason) || public._safari_json(uid);
end $$;

-- 사파리 잡기 결과: 던진 볼 수를 적고 encounter_result 로 마무리 (+ 바뀐 사파리 상태)
create or replace function public.safari_result(p_id bigint, p_throws int, p_caught boolean, p_grade text default 'none', p_curve boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; e public.raid_encounters; res jsonb;
begin
  select * into e from public.raid_encounters where id = p_id and user_id = uid and status = 'pending' and kind = 'safari' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.raid_encounters set throws = least(e.balls, greatest(0, coalesce(p_throws, e.balls))) where id = e.id;
  res := public.encounter_result(p_id, p_caught, p_grade, p_curve);
  return res || jsonb_build_object('safari', public._safari_json(uid));
end $$;

-- 0032 encounter_result + 사파리 (SAFARI 티켓, 볼 세기)
create or replace function public.encounter_result(p_id bigint, p_caught boolean, p_grade text default 'none', p_curve boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; e public.raid_encounters; tk public.tickets;
  res jsonb; caught boolean := coalesce(p_caught, true); g text := coalesce(p_grade, 'none'); amt int; c public.collection; v_line int;
  used int;
begin
  if g not in ('none', 'nice', 'great', 'excellent') then raise exception 'BAD_GRADE'; end if;
  select * into e from public.raid_encounters where id = p_id and user_id = uid and status = 'pending' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not caught and e.kind = 'raid' and not coalesce((public._setting('raid_catch_flee'))::boolean, true) then caught := true; end if;   -- 야생·사파리는 언제나 도망칠 수 있음
  -- 사파리볼: 던진 수 (모르면 빌린 볼 전부). 잡았으면 적어도 1개
  if e.kind = 'safari' then
    used := least(e.balls, greatest(case when caught then 1 else 0 end, coalesce(e.throws, e.balls)));
    insert into public.safari_days (user_id, day, balls_used) values (uid, (e.created_at at time zone 'Asia/Seoul')::date, used)
      on conflict (user_id, day) do update set balls_used = public.safari_days.balls_used + excluded.balls_used;
    update public.raid_encounters set throws = used where id = e.id;
  end if;
  if not caught then
    update public.raid_encounters set status = 'fled', resolved_at = now(), grade = 'none' where id = e.id;
    select line_id into v_line from public.species where id = e.species_id;
    return jsonb_build_object('caught', false, 'fled', true, 'line', v_line, 'species_id', e.species_id,
                              'new', false, 'level', null, 'exp', 0);
  end if;
  -- 특별 티켓을 만들고 바로 바꿈 (부스에서 바꾼 것과 같은 길)
  insert into public.tickets (nonce, user_id, qr_id, token, special, fixed_species)
  values (public._rand(12, 'abcdefghijklmnopqrstuvwxyz0123456789'), uid,
          case e.kind when 'wild' then 'WILD' when 'safari' then 'SAFARI' else 'RAID' end, e.kind, e.kind, e.species_id)
  returning * into tk;
  res := public._redeem_ticket(uid, null, tk);
  v_line := (res ->> 'line_id')::int;
  amt := public._catch_exp(g, p_curve);
  update public.tickets set catch_grade = g where id = tk.id;
  perform public._gain_exp(uid, v_line, amt);
  perform public._recompute(uid);
  update public.raid_encounters set status = 'caught', resolved_at = now(), grade = g where id = e.id;
  select * into c from public.collection where user_id = uid and line_id = v_line;
  return jsonb_build_object('caught', true, 'fled', false, 'line', v_line, 'species_id', e.species_id,
                            'new', coalesce((res ->> 'is_new')::boolean, false), 'level', c.level, 'exp', amt,
                            'nonce', tk.nonce);
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
