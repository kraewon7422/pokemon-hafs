-- 0031 몬스터 그림 올리기 · 도망 보상 정리 · 로그인 쪽지 숫자만
--  1. species.sprite: 운영자가 올린 그림 (Storage 'sprites' 버킷 안 경로). 비어 있으면 아틀라스 그림.
--     sprite_overrides(): {도감번호: 경로} — 로그인 전 화면에서도 쓰므로 anon 도 부름. 동의 철회한 계열은 뺌.
--  2. Storage 버킷 'sprites': 누구나 읽기 (public URL), 올리기·지우기는 운영자만. PNG·WebP·GIF, 1MB 까지.
--  3. catch_result: 도망으로 도감이 50%/100% 밑으로 내려가면, 아직 안 쓴 도감 보상 티켓(dex50/dex100)을 회수.
--  4. admin_make_login_codes: 숫자 고유번호만 (글자 아이디는 건너뜀).
--  5. 안 쓰는 설정 battle_stage_mult 삭제 (email_domains / email_regex 는 학교 구글 계정 확인에 계속 씀).

alter table public.species add column if not exists sprite text
  check (sprite is null or sprite ~ '^[0-9]{1,4}-[0-9a-z]{1,16}\.(png|gif|webp)$');

create or replace function public.sprite_overrides() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(s.id::text, s.sprite), '{}'::jsonb)
  from public.species s join public.lines l on l.id = s.line_id
  where s.sprite is not null and not l.withdrawn
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sprites', 'sprites', true, 1048576, array['image/png', 'image/gif', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists sprites_admin_read on storage.objects;
drop policy if exists sprites_admin_insert on storage.objects;
drop policy if exists sprites_admin_update on storage.objects;
drop policy if exists sprites_admin_delete on storage.objects;
create policy sprites_admin_read on storage.objects for select to authenticated using (bucket_id = 'sprites' and public.is_admin());
create policy sprites_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'sprites' and public.is_admin());
create policy sprites_admin_update on storage.objects for update to authenticated using (bucket_id = 'sprites' and public.is_admin()) with check (bucket_id = 'sprites' and public.is_admin());
create policy sprites_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'sprites' and public.is_admin());

-- 도망으로 도감이 줄었을 때: 기준 밑이면 아직 안 쓴 도감 보상 티켓을 지움 (다시 넘으면 _dex_rewards 가 또 줌)
create or replace function public._dex_unreward(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare total int; got int;
begin
  select count(*), count(*) filter (where exists (
           select 1 from public.collection c where c.user_id = uid and c.line_id = s.line_id and c.stage >= s.stage))
    into total, got
  from public.species s join public.lines l on l.id = s.line_id
  where not l.bonus and not l.secret and not l.withdrawn and l.active;
  if total = 0 then return; end if;
  if got * 2 < total then delete from public.tickets where user_id = uid and special = 'dex50' and status = 'pending'; end if;
  if got < total then delete from public.tickets where user_id = uid and special = 'dex100' and status = 'pending'; end if;
end $$;

-- 0030 catch_result + 도감 보상 회수
create or replace function public.catch_result(p_nonce text, p_grade text, p_curve boolean default false, p_fled boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; t public.tickets; v_line int;
  amt int; up int; c public.collection; u jsonb; was_new boolean; had_bonus boolean; lv int; removed boolean := false;
  every int := coalesce((public._setting('dup_bonus_every'))::int, 0);
begin
  if p_grade is null or p_grade not in ('none', 'nice', 'great', 'excellent') then raise exception 'BAD_GRADE'; end if;
  select * into t from public.tickets where nonce = p_nonce and user_id = uid for update;
  if not found or t.status <> 'redeemed' or t.result_species is null then raise exception 'NOT_FOUND'; end if;
  if t.catch_grade is not null then raise exception 'ALREADY_CLAIMED'; end if;
  select line_id into v_line from public.species where id = t.result_species;

  if not coalesce(p_fled, false) then
    amt := public._catch_exp(p_grade, p_curve);
    update public.tickets set catch_grade = p_grade where id = t.id;
    up := public._gain_exp(uid, v_line, amt);
    select * into c from public.collection where user_id = uid and line_id = v_line;
    return jsonb_build_object('fled', false, 'grade', p_grade, 'exp', amt, 'levels', coalesce(up, 0), 'line', v_line, 'level', c.level);
  end if;

  -- 도망: 이 티켓으로 받은 것을 되돌림
  select * into c from public.collection where user_id = uid and line_id = v_line for update;
  if found then
    u := t.catch_undo;
    if u is null then   -- 0030 전에 받은 티켓
      was_new := c.catch_count <= 1 and not c.from_egg;
      had_bonus := not was_new and every > 0 and c.catch_count % every = 0 and t.special is null;
      lv := 0;
    else
      was_new := coalesce((u ->> 'new')::boolean, false);
      had_bonus := coalesce((u ->> 'bonus')::boolean, false);
      lv := coalesce((u ->> 'lv')::int, 0);
    end if;
    if was_new then
      delete from public.collection where user_id = uid and line_id = v_line;
      update public.profiles
         set battle_team = case when battle_team is null then null
                                else nullif(array_remove(battle_team, v_line), '{}'::int[]) end,
             partner_line = case when partner_line = v_line then null else partner_line end
       where user_id = uid;
      removed := true;
    else
      update public.collection
         set catch_count = greatest(1, catch_count - 1), level = greatest(1, level - lv), updated_at = now()
       where user_id = uid and line_id = v_line;
      if had_bonus then
        update public.profiles set evo_tickets = evo_tickets - 1 where user_id = uid and evo_tickets >= 1;
      end if;
    end if;
  end if;
  delete from public.quiz_attempts where ticket_id = t.id and user_id = uid and answered_at is null;
  update public.tickets set catch_grade = 'none', fled = true where id = t.id;
  perform public._recompute(uid);
  perform public._dex_unreward(uid);
  insert into public.events (user_id, kind, data) values (uid, 'catch_fled', jsonb_build_object('nonce', t.nonce, 'line', v_line, 'removed', removed));
  return jsonb_build_object('fled', true, 'line', v_line, 'removed', removed);
end $$;

-- 0010 + 0031: 숫자 고유번호만
create or replace function public.admin_make_login_codes(p_ids text[], p_names text[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  i int; v_id text; em text; code text; uid uuid; nm text; out jsonb := '[]';
begin
  perform public._assert_admin();
  if array_length(p_ids, 1) > 700 then raise exception 'TOO_MANY'; end if;
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    v_id := lower(btrim(p_ids[i]));
    if v_id !~ '^[0-9]{5,6}$' then continue; end if;   -- 0031: 숫자 고유번호만 (운영진·부스 계정은 운영진 탭에서)
    if v_id ~ '^[0-9]{5}$' then v_id := lpad(v_id, 6, '0'); end if;
    if not public._gen_ok(left(v_id, 3)::int) then raise exception 'BAD_GEN'; end if;
    nm := coalesce(btrim(p_names[i]), '');
    em := v_id || '@code.local';
    code := public._rand(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
    select u.id into uid from auth.users u where u.email = em;
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
      values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
        extensions.crypt(code, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', nm), now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
    else
      update auth.users set encrypted_password = extensions.crypt(code, extensions.gen_salt('bf')), updated_at = now(),
             raw_user_meta_data = case when nm <> '' then jsonb_build_object('full_name', nm) else raw_user_meta_data end
       where auth.users.id = uid;
    end if;
    out := out || jsonb_build_array(jsonb_build_object('id', v_id, 'name', nm, 'code', left(code, 4) || '-' || right(code, 4)));
  end loop;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('login_codes', jsonb_array_length(out)));
  return out;
end $$;

delete from public.settings where key = 'battle_stage_mult';

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
  public.admin_give_egg(text, text, int), public.admin_set_class(text, int, text),
  public.catch_bonus(text, text, boolean),
  public.catch_config(), public.catch_result(text, text, boolean, boolean), public.my_encounters(),
  public.encounter_result(bigint, boolean, text, boolean)
to authenticated;
