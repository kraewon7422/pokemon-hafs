-- 0018: 비학생 = 아이디 + 비밀번호 계정, 운영진도 아이디 계정, 구글은 "복구용"으로 연결.
--
--  계정 종류 (모두 auth.users 의 이메일 + 비밀번호):
--   · 학생      '<고유번호>@code.local'  (0011 그대로)
--   · 비학생    '<아이디>@id.local'      스스로 만들 수 있음 (create_id_account). 프로필 student_id = 'g:<아이디>', 랭킹 제외.
--   · 운영진    '<아이디>@id.local' + raw_app_meta_data.staff = true. 운영자만 만들 수 있음 (admin_create_staff_login),
--              비밀번호는 서버가 만든 12자리를 한 번만 보여 줌. 스스로 만든 아이디는 절대 운영진이 되지 않는다.
--              첫 운영자 계정은 Supabase SQL 편집기에서 select public.bootstrap_staff('아이디', 'admin'); (아무 역할도 실행 못 함)
--  복구 (OWASP Forgot Password 지침을 따름: 따로 증명한 통로로만, 새 비밀번호는 두 번 입력, 바꾼 뒤 다른 기기 로그아웃):
--   · 설정에서 "복구용 구글 연결" → 구글로 한 번 로그인 → 내 계정 비밀번호 입력 → 그 구글이 내 계정에 붙음 (link_number / link_id).
--   · 비밀번호를 잊으면 연결한 구글로 로그인 → 그대로 내 계정 → 새 비밀번호 정하기 (폰이 updateUser 후 다른 기기 로그아웃).
--   · 구글을 연결하지 않았다면: 학생 = 운영자에게 초기화 요청 (0011), 비학생 = 문의하기.
--   · 운영진 계정에는 구글을 붙일 수 없다 (비밀번호는 운영자가 다시 만들어 줌).

create or replace function public._norm_id(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare s text := lower(btrim(coalesce(p, '')));
begin
  if s !~ '^[a-z][a-z0-9_]{3,15}$' then raise exception 'BAD_ID'; end if;
  return s;
end $$;

create or replace function public._id_owner(lid text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where email = lid || '@id.local' limit 1
$$;

-- 아이디가 이미 쓰이는지 (아이디 계정, 또는 같은 이름의 로그인 코드 손님 계정 'g:<아이디>')
create or replace function public._id_taken(lid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public._id_owner(lid) is not null or exists (select 1 from public.profiles where student_id = 'g:' || lid)
$$;

-- 이 사용자를 아이디 계정으로 만들기 / 비밀번호 바꾸기
create or replace function public._set_id_account(owner uuid, lid text, pw_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare em text := lid || '@id.local';
begin
  update auth.users set email = em, encrypted_password = pw_hash,
         email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
   where id = owner;
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), owner, owner::text, jsonb_build_object('sub', owner::text, 'email', em, 'email_verified', true),
          'email', now(), now(), now())
  on conflict (provider_id, provider) do update set identity_data = excluded.identity_data, updated_at = now();
end $$;

-- 비학생: 아이디 + 비밀번호로 새 계정 (로그인 화면에서 "처음 쓰는 아이디면 계정 만들기")
create or replace function public.create_id_account(p_id text, p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare lid text;
begin
  if not coalesce((public._setting('code_self_signup'))::boolean, false) then raise exception 'CODE_SIGNUP_OFF'; end if;
  lid := public._norm_id(p_id);
  perform public._check_pw(p_password);
  perform pg_advisory_xact_lock(hashtext('id:' || lid));
  if public._id_taken(lid) then raise exception 'ID_TAKEN'; end if;
  if (select count(*) from auth.users where created_at > now() - interval '10 minutes'
        and raw_app_meta_data ->> 'self_code' = 'true') >= (public._setting('code_signup_per_10min'))::int then
    raise exception 'TRY_LATER';
  end if;
  perform public._create_password_user(lid || '@id.local', p_password, '{"self_code": true}');
  insert into public.events (kind, data) values ('id_signup', jsonb_build_object('id', lid));
  return jsonb_build_object('email', lid || '@id.local');
end $$;

-- 구글 로그인 → 비학생 아이디에 연결 (처음 쓰는 아이디면 이 구글 사용자가 그 아이디 계정이 된다). link_number 와 같은 모양
create or replace function public.link_id(p_id text, p_password text, p_name text default null, p_show boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); lid text; owner uuid; nm text; ok boolean;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public._has_google(uid) then raise exception 'NOT_GOOGLE'; end if;
  if exists (select 1 from public.profiles where user_id = uid) then raise exception 'ALREADY_REGISTERED'; end if;
  lid := public._norm_id(p_id);
  perform public._check_pw(p_password);
  perform pg_advisory_xact_lock(hashtext('id:' || lid));
  owner := public._id_owner(lid);
  if owner is null then
    if public._id_taken(lid) then raise exception 'ID_TAKEN'; end if;
    nm := public._check_name(p_name);
    perform public._set_id_account(uid, lid, extensions.crypt(p_password, extensions.gen_salt('bf')));
    insert into public.profiles (user_id, student_id, gen, name, role, in_ranking, show_on_board, consented_at)
    values (uid, 'g:' || lid, null, nm, 'student', false, coalesce(p_show, true), now());
    insert into public.events (user_id, kind, data) values (uid, 'register', jsonb_build_object('kind', 'id_new', 'id', lid));
    return jsonb_build_object('mode', 'new');
  end if;
  if coalesce((select raw_app_meta_data ->> 'staff' = 'true' from auth.users where id = owner), false) then raise exception 'STAFF_NO_LINK'; end if;
  if (select count(*) from public.events where kind = 'link_fail' and data ->> 'id' = 'id:' || lid
        and at > now() - interval '10 minutes') >= 5 then raise exception 'TRY_LATER'; end if;
  select u.encrypted_password = extensions.crypt(p_password, u.encrypted_password) into ok from auth.users u where u.id = owner;
  if not coalesce(ok, false) then
    insert into public.events (user_id, kind, data) values (uid, 'link_fail', jsonb_build_object('id', 'id:' || lid));
    return jsonb_build_object('error', 'WRONG_PASSWORD');
  end if;
  perform public._attach_google(uid, owner);
  if not exists (select 1 from public.profiles where user_id = owner) then
    nm := public._check_name(p_name);
    insert into public.profiles (user_id, student_id, gen, name, role, in_ranking, show_on_board, consented_at)
    values (owner, 'g:' || lid, null, nm, 'student', false, coalesce(p_show, true), now());
  end if;
  insert into public.events (user_id, kind, data) values (owner, 'id_link', jsonb_build_object('id', lid));
  return jsonb_build_object('mode', 'linked', 'email', lid || '@id.local');
end $$;

-- 첫 로그인: 아이디 계정이면 아이디를 알려 줌 (이름만 적으면 됨)
create or replace function public.ensure_profile() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  em text; nm text; prov text; sid text; r text := 'student'; g int;
  p public.profiles;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into p from public.profiles where user_id = uid;
  if found then return public._profile_json(p); end if;

  select lower(u.email), coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''),
         coalesce(u.raw_app_meta_data ->> 'provider', 'email')
    into em, nm, prov from auth.users u where u.id = uid;

  -- staff only for identities Google verified (anyone can make an email/password account with any address on a dev server)
  if (prov = 'google' and em not like '%@code.local' and em not like '%@id.local') or em like '%@staff.test' then
    if public._setting('admin_emails') ? em then r := 'admin';
    elsif public._setting('booth_emails') ? em then r := 'booth';
    end if;
  end if;

  if r <> 'student' then
    sid := 'staff:' || split_part(em, '@', 1);
  elsif em like '%@code.local' and nm <> '' and not public._has_google(uid) then
    -- printed codes made by an admin (admin_make_login_codes) already carry the name
    sid := split_part(em, '@', 1);
    if sid ~ '^[0-9]{6}$' then g := left(sid, 3)::int; else sid := 'g:' || sid; end if;
  else
    return jsonb_build_object('needs_register', true, 'name', nm,
      'code_id', case when em ~ '^[0-9]{6}@code\.local$' then split_part(em, '@', 1) end,
      'login_id', case when em like '%@id.local' then split_part(em, '@', 1) end,
      'google', public._has_google(uid),
      'school_id', public._school_sid(uid));
  end if;

  insert into public.profiles (user_id, student_id, gen, name, role, in_ranking)
  values (uid, sid, g, nm, r, sid not like 'g:%' and r = 'student')
  on conflict do nothing;
  select * into p from public.profiles where user_id = uid;
  if not found then raise exception 'STUDENT_ID_TAKEN'; end if;
  return public._profile_json(p);
end $$;

-- 아이디 계정의 첫 등록: 비학생 'g:<아이디>' (학생으로 바꿀 수 없음)
create or replace function public.register_profile(p_kind text, p_student_id text, p_name text, p_show boolean default true)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  em text;
  nm text;
  sid text := btrim(coalesce(p_student_id, ''));
  g int;
  p public.profiles;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if exists (select 1 from public.profiles where user_id = uid) then raise exception 'ALREADY_REGISTERED'; end if;
  nm := public._check_name(p_name);
  select lower(u.email) into em from auth.users u where u.id = uid;
  if em ~ '^[0-9]{6}@code\.local$' then             -- 번호 계정은 그 번호로만
    p_kind := 'student'; sid := split_part(em, '@', 1);
  elsif em like '%@id.local' then                   -- 아이디 계정은 비학생으로만
    p_kind := 'id';
  elsif p_kind = 'student' and public._has_google(uid) then
    raise exception 'USE_NUMBER_LOGIN';             -- 구글 → 학생은 고유번호 + 비밀번호 (link_number)
  end if;

  if p_kind = 'student' then
    sid := public._norm_sid(sid);
    g := left(sid, 3)::int;
  elsif p_kind = 'id' then
    sid := 'g:' || split_part(em, '@', 1);
  elsif p_kind = 'guest' then
    sid := 'g:' || left(replace(uid::text, '-', ''), 10);
  else
    raise exception 'BAD_KIND';
  end if;

  insert into public.profiles (user_id, student_id, gen, name, role, in_ranking, show_on_board, consented_at)
  values (uid, sid, g, nm, 'student', p_kind = 'student', coalesce(p_show, true), now())
  on conflict do nothing;
  select * into p from public.profiles where user_id = uid;
  if not found then raise exception 'STUDENT_ID_TAKEN'; end if;
  insert into public.events (user_id, kind, data) values (uid, 'register', jsonb_build_object('kind', p_kind));
  return public._profile_json(p);
end $$;

-- 설정 화면용: 로그인 아이디 + 복구용 구글이 붙어 있는지
create or replace function public._profile_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'student_id', p.student_id, 'gen', p.gen, 'name', p.name, 'role', p.role,
    'display', public._display_name(p), 'show_on_board', p.show_on_board, 'avatar', p.avatar,
    'consented', p.consented_at is not null, 'in_ranking', p.in_ranking,
    'evo_tickets', p.evo_tickets, 'score', p.score, 'dex_count', p.dex_count, 'titles', to_jsonb(p.titles),
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

-- ───────── 운영진 아이디 계정 ─────────
create or replace function public._staff_pw() returns text
language sql volatile security definer set search_path = '' as $$
  select public._rand(12, 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789')
$$;

create or replace function public._make_staff(lid text, p_role text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pw text := public._staff_pw(); uid uuid; nm text;
begin
  if p_role not in ('admin', 'booth') then raise exception 'BAD_ROLE'; end if;
  perform pg_advisory_xact_lock(hashtext('id:' || lid));
  if public._id_taken(lid) then raise exception 'ID_TAKEN'; end if;
  nm := coalesce(nullif(btrim(coalesce(p_name, '')), ''), lid);
  uid := public._create_password_user(lid || '@id.local', pw, '{"staff": true}');
  insert into public.profiles (user_id, student_id, gen, name, role, in_ranking, consented_at)
  values (uid, 'staff:' || lid, null, left(nm, 20), p_role, false, now());
  return jsonb_build_object('id', lid, 'role', p_role, 'password', pw);
end $$;

-- 운영자가 운영진 아이디를 만든다 → 비밀번호는 이 응답에서 한 번만 보임
create or replace function public.admin_create_staff_login(p_id text, p_role text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  perform public._assert_admin();
  r := public._make_staff(public._norm_id(p_id), p_role, p_name);
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('staff_login', r ->> 'id', 'role', p_role));
  return r;
end $$;

-- 운영진 비밀번호 새로 만들기 (잊었을 때). 그 계정의 다른 로그인은 모두 끊는다
create or replace function public.admin_reset_staff_password(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare lid text := public._norm_id(p_id); owner uuid; pw text := public._staff_pw();
begin
  perform public._assert_admin();
  select id into owner from auth.users where email = lid || '@id.local' and raw_app_meta_data ->> 'staff' = 'true';
  if owner is null then raise exception 'NOT_FOUND'; end if;
  update auth.users set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf')), updated_at = now() where id = owner;
  delete from auth.refresh_tokens where user_id = owner::text;
  delete from auth.sessions where user_id = owner;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('staff_reset', lid));
  return jsonb_build_object('id', lid, 'password', pw);
end $$;

create or replace function public.admin_list_staff_logins() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', split_part(u.email, '@', 1), 'role', p.role, 'name', p.name,
                                                       'me', u.id = auth.uid(), 'last', u.last_sign_in_at) order by p.role, u.email)
                   from auth.users u join public.profiles p on p.user_id = u.id
                   where u.email like '%@id.local' and u.raw_app_meta_data ->> 'staff' = 'true'), '[]');
end $$;

-- 운영진 아이디 지우기 (나 자신은 못 지움)
create or replace function public.admin_remove_staff_login(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare lid text := public._norm_id(p_id); owner uuid;
begin
  perform public._assert_admin();
  select id into owner from auth.users where email = lid || '@id.local' and raw_app_meta_data ->> 'staff' = 'true';
  if owner is null then raise exception 'NOT_FOUND'; end if;
  if owner = auth.uid() then raise exception 'CANNOT_REMOVE_SELF'; end if;
  delete from public.profiles where user_id = owner;
  delete from auth.users where id = owner;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('staff_remove', lid));
  return jsonb_build_object('ok', true);
end $$;

-- 첫 운영자 계정 (설치할 때 한 번). 아무 로그인 역할에도 실행 권한이 없다 → Supabase SQL 편집기에서만:
--   select public.bootstrap_staff('admin1', 'admin');   → 결과의 password 로 운영자 페이지에 아이디 로그인
create or replace function public.bootstrap_staff(p_id text, p_role text default 'admin') returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return public._make_staff(public._norm_id(p_id), p_role, null);
end $$;

-- 기록 삭제 (0017): 스스로 만든 아이디 계정의 로그인도 지움 (운영진 아이디는 학생이 아니라 대상이 아님)
create or replace function public.admin_delete_students(p_student_ids text[], p_confirm text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uids uuid[]; n int; logins int;
begin
  perform public._assert_admin();
  if p_student_ids is null then
    if coalesce(p_confirm, '') <> '전체 삭제' then raise exception 'CONFIRM_MISMATCH'; end if;
    select array_agg(user_id) into uids from public.profiles where role = 'student';
  else
    if coalesce(p_confirm, '') <> '삭제' then raise exception 'CONFIRM_MISMATCH'; end if;
    if cardinality(p_student_ids) = 0 or cardinality(p_student_ids) > 500 then raise exception 'BAD_SELECTION'; end if;
    select array_agg(user_id) into uids from public.profiles where role = 'student' and student_id = any (p_student_ids);
  end if;
  uids := coalesce(uids, '{}');
  n := cardinality(uids);
  if n = 0 then return jsonb_build_object('deleted', 0, 'logins', 0); end if;
  delete from public.code_failures where user_id = any (uids);
  delete from public.profiles where user_id = any (uids);
  delete from auth.users u where u.id = any (uids)
     and (u.email like '%@code.local' or (u.email like '%@id.local' and coalesce(u.raw_app_meta_data ->> 'staff', '') <> 'true'))
     and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google');
  get diagnostics logins = row_count;
  insert into public.events (user_id, kind, data)
  values (auth.uid(), 'admin', jsonb_build_object('bulk_delete', n, 'all', p_student_ids is null, 'logins', logins));
  return jsonb_build_object('deleted', n, 'logins', logins);
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
  public.battle_code(text), public.battle_peek(text), public.battle_set_team(int[]), public.battle_start_cpu(int[], text),
  public.battle_start_team(text, int[]), public.battle_challenge(text, int[]), public.battle_inbox(), public.battle_accept(bigint, int[]),
  public.battle_decline(bigint), public.battle_state(bigint), public.battle_act(bigint, jsonb), public.battle_forfeit(bigint), public.battle_today(),
  public.admin_create_qr(text, text, text, text), public.admin_rotate_qr(text, boolean), public.admin_cancel_ticket(text),
  public.admin_set_role(text, text), public.admin_adjust_tickets(text, int), public.admin_unlink(text), public.admin_stats(),
  public.admin_make_login_codes(text[], text[]), public.admin_export_ranking(), public.admin_relink(text, text),
  public.admin_grant_monster(text, int, int), public.admin_set_in_ranking(text, boolean), public.admin_list_staff(),
  public.admin_invite_staff(text, text), public.admin_remove_staff(text), public.admin_list_requests(),
  public.admin_decide_reset(bigint, boolean), public.admin_set_inquiry(bigint, boolean),
  public.admin_create_raid(int, int, int, boolean, text, text), public.admin_end_raid(bigint), public.admin_list_raids(),
  public.admin_delete_students(text[], text), public.admin_count_students(),
  public.admin_create_staff_login(text, text, text), public.admin_reset_staff_password(text),
  public.admin_list_staff_logins(), public.admin_remove_staff_login(text)
to authenticated;
