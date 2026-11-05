-- 0041: 별명 (nickname) — 랭킹 · 대형 화면 · 배틀 상대 이름에 별명이 있으면 별명이 보임
--  · profiles.nickname (null = 없음). 학생이 설정에서 set_nickname(p_nick) 으로 정함 (빈 칸 / null = 지움). 겹쳐도 됨.
--    2~10자, 한글 · 영어 · 숫자 (가운데 띄어쓰기 한 칸까지), 숫자 5개 이상 연속 금지 (고유번호 노출 방지),
--    욕설 · 사칭 (운영자 등) 목록은 서버에서 막음 (_nick_blocked). 바꾸기는 10초에 한 번.
--  · _display_name(p): 별명이 있으면 별명 (공개 / 비공개와 상관없이 — 별명은 본인이 정한 이름이라 실명이 아님), 없으면 예전 그대로.
--    → get_ranking_by · class_ranking (1등) · screen 피드 · 배틀 · 미니게임 랭킹이 모두 별명을 씀.
--  · get_ranking_by: 줄마다 'nick' (별명이면 true) 도 돌려줌. _profile_json 에 'nickname'.
--  · admin_clear_nickname(student_id) (운영자만): 별명 지우기 + events 기록.

alter table public.profiles add column if not exists nickname text;
alter table public.profiles add column if not exists nickname_at timestamptz;
alter table public.profiles drop constraint if exists profiles_nickname_len;
alter table public.profiles add constraint profiles_nickname_len check (nickname is null or char_length(nickname) between 2 and 10);

create or replace function public._display_name(p public.profiles) returns text
language sql immutable set search_path = '' as $$
  select case
    when p.nickname is not null and btrim(p.nickname) <> '' then p.nickname
    when not p.show_on_board then '익명 트레이너'
    when p.gen is null then public._mask_name(p.name)
    else p.gen || '기 ' || public._mask_name(p.name)
  end
$$;

-- 욕설 · 사칭 목록 (띄어쓰기 · 기호를 빼고 소문자로 비교). 목록을 늘리려면 새 migration 에서 이 함수를 다시 만듦
create or replace function public._nick_blocked(p text) returns boolean
language sql immutable set search_path = '' as $$
  select exists (
    select 1 from unnest(array[
      '시발', '씨발', '씨빨', '시빨', '씨바', '시바', '씨팔', '시팔', '싸발', '쌍놈', '썅', '병신', '븅신', '빙신', '좆', '존나', '졸라', '좇',
      '개새', '새끼', '쌔끼', '색기', '미친', '미췬', '닥쳐', '꺼져', '지랄', '니미', '느금', '니애미', '느개비', '엠창', '애미', '애비', '염병',
      '섹스', '섹시', '보지', '자지', '야동', '창녀', '걸레', '찐따', '장애인', '틀딱', '한남', '김치녀', '일베', '홍어',
      'fuck', 'fuk', 'shit', 'bitch', 'sex', 'dick', 'pussy', 'asshole', 'nigg', 'porn', 'cunt', 'slut', 'whore',
      '운영자', '운영진', '관리자', '선생님', '교장', '교감', 'admin', 'staff', 'hafs몬스터', '익명트레이너'
    ]) w
    where position(w in lower(regexp_replace(coalesce(p, ''), '[^가-힣A-Za-z0-9]', '', 'g'))) > 0)
$$;

create or replace function public.set_nickname(p_nick text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); p public.profiles; v text := regexp_replace(btrim(coalesce(p_nick, '')), '\s+', ' ', 'g');
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into p from public.profiles where user_id = uid for update;
  if not found then raise exception 'NOT_AUTHENTICATED'; end if;
  if v = '' then
    v := null;
  else
    if char_length(v) not between 2 and 10 or v !~ '^[가-힣A-Za-z0-9]+( [가-힣A-Za-z0-9]+)*$' or v ~ '[0-9]{5,}' then
      raise exception 'BAD_NICKNAME';
    end if;
    if public._nick_blocked(v) then raise exception 'NICKNAME_BLOCKED'; end if;
  end if;
  if v is not distinct from p.nickname then return public._profile_json(p); end if;
  if p.nickname_at is not null and p.nickname_at > now() - interval '10 seconds' then raise exception 'TRY_LATER'; end if;
  update public.profiles set nickname = v, nickname_at = now() where user_id = uid returning * into p;
  return public._profile_json(p);
end $$;

create or replace function public.admin_clear_nickname(p_student_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  perform public._assert_admin();
  select * into p from public.profiles where student_id = p_student_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.profiles set nickname = null, nickname_at = null where user_id = p.user_id;
  insert into public.events (user_id, kind, data)
  values (auth.uid(), 'admin', jsonb_build_object('clear_nickname', p_student_id, 'was', p.nickname));
  return jsonb_build_object('student_id', p_student_id, 'nickname', null, 'was', p.nickname);
end $$;

-- 0013 get_ranking_by 그대로 + 'nick' (별명이면 true)
create or replace function public.get_ranking_by(p_gen int default null, p_kind text default 'score') returns jsonb
language sql stable security definer set search_path = '' as $$
  with base as (
    select p.user_id, p.gen, p.avatar, public._display_name(p) as display, (p.nickname is not null) as nick,
           case p_kind when 'dex' then p.dex_count when 'battle' then p.battle_wins else p.score end as val,
           case p_kind when 'battle' then p.battle_wins_at else p.score_at end as val_at,
           p.score, p.dex_count, p.battle_wins
    from public.profiles p
    where p.role = 'student' and p.in_ranking and (p_gen is null or p.gen = p_gen)
  ), r as (
    select *, rank() over (order by val desc, val_at asc nulls last) rk from base where val > 0
  )
  select jsonb_build_object(
    'kind', coalesce(p_kind, 'score'),
    'top', coalesce((select jsonb_agg(jsonb_build_object(
                      'rank', rk, 'display', display, 'nick', nick, 'gen', gen, 'value', val, 'score', score,
                      'dex', dex_count, 'wins', battle_wins, 'avatar', avatar, 'me', user_id = auth.uid()) order by rk, val_at)
                    from (select * from r order by rk, val_at limit 50) r), '[]'),
    'me', (select jsonb_build_object('rank', rk, 'value', val) from r where user_id = auth.uid()),
    'total', (select count(*) from r),
    'at', now())
$$;

-- 0036 _profile_json 그대로 + nickname
create or replace function public._profile_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'student_id', p.student_id, 'gen', p.gen, 'name', p.name, 'role', p.role,
    'display', public._display_name(p), 'show_on_board', p.show_on_board, 'avatar', p.avatar, 'nickname', p.nickname,
    'consented', p.consented_at is not null, 'in_ranking', p.in_ranking,
    'evo_tickets', p.evo_tickets, 'score', p.score, 'dex_count', p.dex_count, 'titles', to_jsonb(p.titles),
    'partner', p.partner_mon, 'grade', p.grade, 'class_no', p.class_no, 'class_name', p.class_name,
    'login', (select case when u.email like '%@code.local' then 'number' when u.email like '%@id.local' then 'id' else 'google' end
              from auth.users u where u.id = p.user_id),
    'login_key', (select split_part(u.email, '@', 1) from auth.users u where u.id = p.user_id and (u.email like '%@code.local' or u.email like '%@id.local')),
    'google_linked', public._has_google(p.user_id),
    'google_email', (select i.identity_data ->> 'email' from auth.identities i where i.user_id = p.user_id and i.provider = 'google'
                     order by i.updated_at desc limit 1),
    'rank', case when p.in_ranking and p.role = 'student' and p.score > 0 then
      (select count(*) + 1 from public.profiles o
        where o.role = 'student' and o.in_ranking
          and (o.score > p.score or (o.score = p.score and o.score_at < p.score_at))) end)
$$;

-- rule (0006): every migration that creates functions ends with this block (copied from 0040_safari_v3.sql + 0041)
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
