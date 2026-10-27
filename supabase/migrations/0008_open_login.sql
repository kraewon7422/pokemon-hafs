-- 0008 열린 로그인: 아무 구글 계정 → 첫 로그인 때 학생(고유번호+이름) / 외부인(이름) 직접 등록.
-- 학번 로그인: 학번만 넣으면 서버가 코드를 만들어 한 번 보여 준다. 개발용 로그인: 아무 이메일, 비밀번호 고정.
-- 계정은 서버에서만 만든다 (Supabase 공개 가입을 열면 남의 이메일을 미리 가입해 두는 계정 탈취가 가능해서).
-- 운영자/부스 권한은 구글로 확인된 이메일에만 준다 (staff.test 는 테스트 서버용 예외).

insert into public.settings (key, value) values
  ('code_self_signup',      'true'),   -- 학번만으로 코드 계정 만들기 허용
  ('code_signup_per_10min', '60'),     -- 학번 코드 계정을 10분에 최대 몇 개까지 (전체) — 번호 선점 스크립트 방지
  ('dev_login',             'false')   -- 개발용 테스트 로그인 (테스트 서버에서만 true)
on conflict (key) do nothing;

-- ───────── 이름 가리기: 강래원 → 강*원 ─────────
create or replace function public._mask_name(n text) returns text
language sql immutable set search_path = '' as $$
  select case
    when n is null or btrim(n) = '' then '트레이너'
    when char_length(btrim(n)) >= 3 then left(btrim(n), 1) || repeat('*', char_length(btrim(n)) - 2) || right(btrim(n), 1)
    when char_length(btrim(n)) = 2 then left(btrim(n), 1) || '*'
    else btrim(n)
  end
$$;

create or replace function public._display_name(p public.profiles) returns text
language sql immutable set search_path = '' as $$
  select case
    when not p.show_on_board then '익명 트레이너'
    when p.gen is null then public._mask_name(p.name)
    else p.gen || '기 ' || public._mask_name(p.name)
  end
$$;

-- ───────── 비밀번호 계정 만들기 (서버 안에서만) ─────────
create or replace function public._create_password_user(em text, pw text, meta jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
    extensions.crypt(pw, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb || meta, '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
  return uid;
end $$;

-- 학번만 넣으면 코드 계정 생성 → 코드는 이 응답에서 한 번만 보인다
create or replace function public.create_code_account(p_student_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sid text := btrim(coalesce(p_student_id, ''));
  em text; code text;
begin
  if not coalesce((public._setting('code_self_signup'))::boolean, false) then raise exception 'CODE_SIGNUP_OFF'; end if;
  if sid !~ '^[0-9]{5,6}$' then raise exception 'BAD_STUDENT_ID'; end if;
  sid := lpad(sid, 6, '0');
  if left(sid, 3)::int not between 1 and 99 then raise exception 'BAD_STUDENT_ID'; end if;
  em := sid || '@code.local';
  perform pg_advisory_xact_lock(hashtext('create_code_account'));   -- serialise: throttle + uniqueness checks stay exact
  if exists (select 1 from auth.users where email = em) then raise exception 'CODE_ACCOUNT_EXISTS'; end if;
  if exists (select 1 from public.profiles where student_id = sid) then raise exception 'STUDENT_ID_TAKEN'; end if;
  if (select count(*) from auth.users where created_at > now() - interval '10 minutes'
        and raw_app_meta_data ->> 'self_code' = 'true') >= (public._setting('code_signup_per_10min'))::int then
    raise exception 'TRY_LATER';
  end if;
  code := public._rand(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
  perform public._create_password_user(em, code, '{"self_code": true}');
  insert into public.events (kind, data) values ('code_signup', jsonb_build_object('id', sid));
  return jsonb_build_object('id', sid, 'code', left(code, 4) || '-' || right(code, 4));
end $$;

-- 개발용: 아무 이메일 → 비밀번호 1234abcd! 계정 (dev_login 설정이 true 일 때만)
create or replace function public.dev_create_account(p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare em text := lower(btrim(coalesce(p_email, '')));
begin
  if not coalesce((public._setting('dev_login'))::boolean, false) then raise exception 'DEV_LOGIN_OFF'; end if;
  if em !~ '@' then em := em || '@test.local'; end if;
  if em !~ '^[a-z0-9._+-]{1,40}@[a-z0-9.-]{1,40}\.[a-z]{2,}$' or em like '%@code.local' then raise exception 'BAD_EMAIL'; end if;
  if exists (select 1 from auth.users where email = em) then return jsonb_build_object('email', em, 'created', false); end if;
  perform public._create_password_user(em, '1234abcd!', '{"dev": true}');
  return jsonb_build_object('email', em, 'created', true);
end $$;

-- ───────── 프로필: 있으면 돌려주고, 없으면 "등록 필요" ─────────
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
  if prov = 'google' or em like '%@staff.test' then
    if public._setting('admin_emails') ? em then r := 'admin';
    elsif public._setting('booth_emails') ? em then r := 'booth';
    end if;
  end if;

  if r <> 'student' then
    sid := 'staff:' || split_part(em, '@', 1);
  elsif em like '%@code.local' and nm <> '' then
    -- printed codes made by an admin (admin_make_login_codes) already carry the name
    sid := split_part(em, '@', 1);
    if sid ~ '^[0-9]{6}$' then g := left(sid, 3)::int; else sid := 'g:' || sid; end if;
  else
    return jsonb_build_object('needs_register', true, 'name', nm,
      'code_id', case when em ~ '^[0-9]{6}@code\.local$' then split_part(em, '@', 1) end);
  end if;

  insert into public.profiles (user_id, student_id, gen, name, role, in_ranking)
  values (uid, sid, g, nm, r, sid not like 'g:%' and r = 'student')
  on conflict do nothing;
  select * into p from public.profiles where user_id = uid;
  if not found then raise exception 'STUDENT_ID_TAKEN'; end if;
  return public._profile_json(p);
end $$;

-- 첫 로그인 등록 (+ 동의). 학생: 고유번호 + 이름 / 외부인: 이름만 (랭킹 제외)
create or replace function public.register_profile(p_kind text, p_student_id text, p_name text, p_show boolean default true)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  em text;
  nm text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  sid text := btrim(coalesce(p_student_id, ''));
  g int;
  p public.profiles;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if exists (select 1 from public.profiles where user_id = uid) then raise exception 'ALREADY_REGISTERED'; end if;
  if char_length(nm) not between 1 and 20 or nm ~ '[<>{}\\]' then raise exception 'BAD_NAME'; end if;
  select lower(u.email) into em from auth.users u where u.id = uid;
  if em ~ '^[0-9]{6}@code\.local$' then             -- 학번 코드 계정은 그 학번으로만
    p_kind := 'student'; sid := split_part(em, '@', 1);
  end if;

  if p_kind = 'student' then
    if sid !~ '^[0-9]{5,6}$' then raise exception 'BAD_STUDENT_ID'; end if;
    sid := lpad(sid, 6, '0');
    g := left(sid, 3)::int;
    if g not between 1 and 99 then raise exception 'BAD_STUDENT_ID'; end if;
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

-- rule (0006): every migration that creates functions ends with this block
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_code_account(text),
  public.dev_create_account(text)
to anon, authenticated;
grant execute on function
  public.is_admin(),
  public.ensure_profile(),
  public.register_profile(text, text, text, boolean),
  public.accept_terms(boolean),
  public.sync(jsonb, text),
  public.self_redeem(),
  public.answer_quiz(bigint, int),
  public.evolve(int),
  public.spin_roulette(),
  public.get_ranking(int),
  public.set_prefs(boolean, int),
  public.log_client_error(text),
  public.booth_lookup(text),
  public.booth_redeem(text),
  public.screen_feed(),
  public.screen_rotating_token(text),
  public.admin_create_qr(text, text, text, text),
  public.admin_rotate_qr(text, boolean),
  public.admin_cancel_ticket(text),
  public.admin_set_role(text, text),
  public.admin_adjust_tickets(text, int),
  public.admin_unlink(text),
  public.admin_stats(),
  public.admin_make_login_codes(text[], text[]),
  public.admin_export_ranking(),
  public.admin_relink(text, text),
  public.admin_grant_monster(text, int, int),
  public.admin_set_in_ranking(text, boolean)
to authenticated;
