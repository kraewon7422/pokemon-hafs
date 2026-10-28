-- 0011: 고유번호 계정 = 게임 계정 하나. 구글 계정 여러 개가 같은 번호에 연결된다.
--
--  구조
--   - "번호 계정" = auth.users 중 email 이 '<고유번호>@code.local' 인 사용자. 비밀번호는 학생이 직접 정한다.
--   - 구글 로그인 → 학생 → 고유번호 + 비밀번호 (link_number)
--       · 처음 쓰는 번호: 지금 로그인한 구글 사용자가 그대로 번호 계정이 된다 (email 을 <번호>@code.local 로, 비밀번호 설정)
--       · 이미 있는 번호: 비밀번호가 맞으면 이 구글 identity 를 번호 계정으로 옮기고, 빈 구글 사용자는 지운다.
--         다음부터 그 구글 계정으로 로그인하면 Supabase 가 identity(provider_id) 로 번호 계정에 로그인시킨다.
--   - 학교 구글 계정(이메일에 학번)으로 로그인하면 그 번호의 주인으로 인정 → 비밀번호를 바로 다시 정할 수 있다 (p_reset).
--   - 비밀번호를 모르면 초기화 요청 (request_password_reset) → 운영자 페이지 '요청' 탭에서 허용/거절.
--   - 구글 없이: 고유번호 + 비밀번호 (create_number_account → signInWithPassword).
--   - 부계정은 '외부인' 으로 (번호 없음, 랭킹 제외).
--  + 문의함 (send_inquiry / admin), 이스터에그: 룰렛 777 칭호 (profiles.titles), 비밀 몬스터 (lines.secret)

alter table public.lines add column if not exists secret boolean not null default false;
alter table public.profiles add column if not exists titles text[] not null default '{}';

create table if not exists public.reset_requests (
  id          bigint generated always as identity primary key,
  student_id  text not null,
  name        text not null default '',
  note        text not null default '',
  pw_hash     text not null,                 -- the new password the student chose (bcrypt), set on approval
  requester   uuid,                          -- logged-in requester, null = from the login page
  status      text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid
);
create index if not exists reset_requests_status on public.reset_requests (status, created_at);
alter table public.reset_requests enable row level security;          -- no policies: functions only

create table if not exists public.inquiries (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users on delete set null,
  student_id  text,
  name        text,
  body        text not null,
  status      text not null default 'open' check (status in ('open', 'done')),
  created_at  timestamptz not null default now()
);
create index if not exists inquiries_status on public.inquiries (status, created_at);
alter table public.inquiries enable row level security;

insert into public.settings (key, value) values
  ('reset_requests_per_10min', '30'),        -- 전체 초기화 요청 속도 제한
  ('roulette_777_per_mille',   '10')         -- 룰렛 꽝 1000번 중 몇 번을 777(럭키 세븐 칭호)로 바꿀지
on conflict (key) do nothing;

-- ───────── helpers ─────────
create or replace function public._norm_sid(p text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare sid text := btrim(coalesce(p, ''));
begin
  if sid !~ '^[0-9]{5,6}$' then raise exception 'BAD_STUDENT_ID'; end if;
  sid := lpad(sid, 6, '0');
  if left(sid, 3)::int not between 1 and 99 then raise exception 'BAD_STUDENT_ID'; end if;
  if not public._gen_ok(left(sid, 3)::int) then raise exception 'BAD_GEN'; end if;
  return sid;
end $$;

create or replace function public._check_pw(pw text) returns void
language plpgsql immutable security definer set search_path = '' as $$
begin
  if char_length(coalesce(pw, '')) not between 6 and 72 then raise exception 'BAD_PASSWORD'; end if;
end $$;

create or replace function public._check_name(nm text) returns text
language plpgsql immutable security definer set search_path = '' as $$
declare n text := regexp_replace(btrim(coalesce(nm, '')), '\s+', ' ', 'g');
begin
  if char_length(n) not between 1 and 20 or n ~ '[<>{}\\]' then raise exception 'BAD_NAME'; end if;
  return n;
end $$;

create or replace function public._has_google(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.identities where user_id = uid and provider = 'google')
$$;

-- 학교 구글 계정이면 이메일 속 학번 (Google 이 확인한 이메일만 믿는다; auth.users.email 은 아무나 정할 수 있음)
create or replace function public._school_sid(uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select lpad(m[1], 6, '0')
  from auth.identities i,
       lateral (select lower(i.identity_data ->> 'email') em) e,
       lateral regexp_match(e.em, public._setting('email_regex') #>> '{}') m
  where i.user_id = uid and i.provider = 'google' and m is not null
    and exists (select 1 from jsonb_array_elements_text(public._setting('email_domains')) d where e.em like '%@' || d)
  limit 1
$$;

-- 그 번호의 계정 주인: 번호 계정, 없으면 (예전 방식으로) 그 번호 프로필을 가진 사용자
create or replace function public._number_owner(sid text) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce((select id from auth.users where email = sid || '@code.local' limit 1),
                  (select user_id from public.profiles where student_id = sid))
$$;

-- 이 사용자를 번호 계정으로 만들기 / 비밀번호 바꾸기
create or replace function public._set_number_account(owner uuid, sid text, pw_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare em text := sid || '@code.local';
begin
  update auth.users set email = em, encrypted_password = pw_hash,
         email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
   where id = owner;
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), owner, owner::text, jsonb_build_object('sub', owner::text, 'email', em, 'email_verified', true),
          'email', now(), now(), now())
  on conflict (provider_id, provider) do update set identity_data = excluded.identity_data, updated_at = now();
end $$;

-- 비밀번호 초기화 때: 모든 기기에서 로그아웃 + 연결된 구글 계정 모두 해제 (남이 차지한 경우까지 깨끗하게)
create or replace function public._kick_number(owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.refresh_tokens where user_id = owner::text;
  delete from auth.sessions where user_id = owner;
  delete from auth.identities where user_id = owner and provider = 'google';
end $$;

-- 구글 identity 를 번호 계정으로 옮기고 (다음부터 그 구글 계정 = 번호 계정), 비어 있는 구글 사용자는 지운다
create or replace function public._attach_google(from_uid uuid, to_uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles where user_id = from_uid) then raise exception 'ALREADY_REGISTERED'; end if;
  update auth.identities set user_id = to_uid, updated_at = now() where user_id = from_uid and provider = 'google';
  delete from auth.users where id = from_uid;
end $$;

-- ───────── ensure_profile (0008) + 등록 화면에 필요한 정보 (google / school_id) ─────────
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
  if (prov = 'google' and em not like '%@code.local') or em like '%@staff.test' then
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

-- ───────── register_profile (0008): 구글 계정의 '학생' 등록은 link_number 로만 ─────────
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
  elsif p_kind = 'student' and public._has_google(uid) then
    raise exception 'USE_NUMBER_LOGIN';             -- 구글 → 학생은 고유번호 + 비밀번호 (link_number)
  end if;

  if p_kind = 'student' then
    sid := public._norm_sid(sid);
    g := left(sid, 3)::int;
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

-- ───────── 구글 → 고유번호 연결 ─────────
-- returns {mode:'new'}            지금 로그인한 계정이 번호 계정이 됨 (그대로 계속)
--         {mode:'linked', email}  번호 계정에 연결됨 → 클라이언트가 email + 비밀번호로 다시 로그인
--         {error:'WRONG_PASSWORD'} (raise 하지 않음: 실패 기록이 남아야 속도 제한이 된다)
create or replace function public.link_number(p_student_id text, p_password text, p_name text default null,
                                              p_show boolean default true, p_reset boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sid text; owner uuid; nm text; ok boolean;
  school text;
  hash text;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public._has_google(uid) then raise exception 'NOT_GOOGLE'; end if;
  if exists (select 1 from public.profiles where user_id = uid) then raise exception 'ALREADY_REGISTERED'; end if;
  sid := public._norm_sid(p_student_id);
  perform public._check_pw(p_password);
  perform pg_advisory_xact_lock(hashtext('number:' || sid));
  school := public._school_sid(uid);
  hash := extensions.crypt(p_password, extensions.gen_salt('bf'));
  owner := public._number_owner(sid);

  if owner is null then                                     -- 처음 쓰는 번호: 내가 번호 계정이 된다
    nm := public._check_name(p_name);
    perform public._set_number_account(uid, sid, hash);
    insert into public.profiles (user_id, student_id, gen, name, role, in_ranking, show_on_board, consented_at)
    values (uid, sid, left(sid, 3)::int, nm, 'student', true, coalesce(p_show, true), now());
    insert into public.events (user_id, kind, data) values (uid, 'register', jsonb_build_object('kind', 'number_new', 'id', sid));
    return jsonb_build_object('mode', 'new');
  end if;

  if p_reset then                                           -- 학교 계정 = 그 번호의 주인 → 비밀번호를 새로 정함
    if school is distinct from sid then raise exception 'NOT_YOUR_NUMBER'; end if;
    perform public._kick_number(owner);
    perform public._set_number_account(owner, sid, hash);
    insert into public.events (user_id, kind, data) values (uid, 'number_reset_school', jsonb_build_object('id', sid));
  else
    if (select count(*) from public.events where kind = 'link_fail' and data ->> 'id' = sid
          and at > now() - interval '10 minutes') >= 5 then
      raise exception 'TRY_LATER';
    end if;
    select u.email = sid || '@code.local' and u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
      into ok from auth.users u where u.id = owner;
    if not coalesce(ok, false) then
      if (select email from auth.users where id = owner) <> sid || '@code.local' then
        raise exception 'OLD_NUMBER_ACCOUNT';               -- 예전 방식 가입(비밀번호 없음): 초기화 요청으로만
      end if;
      insert into public.events (user_id, kind, data) values (uid, 'link_fail', jsonb_build_object('id', sid));
      return jsonb_build_object('error', 'WRONG_PASSWORD', 'school', school = sid);
    end if;
  end if;

  -- 이 구글 계정을 번호 계정에 붙이고, 비어 있는 구글 사용자는 지운다
  perform public._attach_google(uid, owner);
  if not exists (select 1 from public.profiles where user_id = owner) then
    nm := public._check_name(p_name);
    insert into public.profiles (user_id, student_id, gen, name, role, in_ranking, show_on_board, consented_at)
    values (owner, sid, left(sid, 3)::int, nm, 'student', true, coalesce(p_show, true), now());
  end if;
  insert into public.events (user_id, kind, data) values (owner, 'number_link', jsonb_build_object('id', sid));
  return jsonb_build_object('mode', 'linked', 'email', sid || '@code.local');
end $$;

-- ───────── 구글 없이: 고유번호 + 직접 정한 비밀번호로 새 계정 ─────────
create or replace function public.create_number_account(p_student_id text, p_password text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sid text;
begin
  if not coalesce((public._setting('code_self_signup'))::boolean, false) then raise exception 'CODE_SIGNUP_OFF'; end if;
  sid := public._norm_sid(p_student_id);
  perform public._check_pw(p_password);
  perform pg_advisory_xact_lock(hashtext('number:' || sid));
  if public._number_owner(sid) is not null then raise exception 'CODE_ACCOUNT_EXISTS'; end if;
  if (select count(*) from auth.users where created_at > now() - interval '10 minutes'
        and raw_app_meta_data ->> 'self_code' = 'true') >= (public._setting('code_signup_per_10min'))::int then
    raise exception 'TRY_LATER';
  end if;
  perform public._create_password_user(sid || '@code.local', p_password, '{"self_code": true}');
  insert into public.events (kind, data) values ('code_signup', jsonb_build_object('id', sid));
  return jsonb_build_object('email', sid || '@code.local');
end $$;

-- ───────── 비밀번호 초기화 요청 (로그인 전에도) → 운영자가 허용하면 학생이 고른 새 비밀번호가 된다 ─────────
create or replace function public.request_password_reset(p_student_id text, p_password text, p_name text, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare sid text; nm text; note text := left(btrim(coalesce(p_note, '')), 300);
begin
  sid := public._norm_sid(p_student_id);
  perform public._check_pw(p_password);
  nm := public._check_name(p_name);
  if public._number_owner(sid) is null then raise exception 'NO_ACCOUNT'; end if;
  if (select count(*) from public.reset_requests where created_at > now() - interval '10 minutes')
       >= (public._setting('reset_requests_per_10min'))::int then
    raise exception 'TRY_LATER';
  end if;
  -- one pending request per number: a new one replaces the old one
  delete from public.reset_requests where student_id = sid and status = 'pending';
  insert into public.reset_requests (student_id, name, note, pw_hash, requester)
  values (sid, nm, note, extensions.crypt(p_password, extensions.gen_salt('bf')), auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- ───────── 문의 ─────────
create or replace function public.send_inquiry(p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); b text := btrim(coalesce(p_body, '')); p public.profiles;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if char_length(b) not between 2 and 1000 then raise exception 'BAD_INQUIRY'; end if;
  if (select count(*) from public.inquiries where user_id = uid and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'TRY_LATER';
  end if;
  select * into p from public.profiles where user_id = uid;
  insert into public.inquiries (user_id, student_id, name, body) values (uid, p.student_id, p.name, b);
  return jsonb_build_object('ok', true);
end $$;

-- ───────── 운영자: 요청 탭 ─────────
create or replace function public.admin_list_requests() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  return jsonb_build_object(
    'resets', coalesce((select jsonb_agg(x order by (x ->> 'status') <> 'pending', x ->> 'created_at' desc) from (
        select jsonb_build_object('id', r.id, 'student_id', r.student_id, 'name', r.name, 'note', r.note, 'status', r.status,
                 'created_at', r.created_at, 'decided_at', r.decided_at, 'from_app', r.requester is not null,
                 'account_name', (select name from public.profiles where student_id = r.student_id),
                 'google_links', (select count(*) from auth.identities i
                                   where i.user_id = public._number_owner(r.student_id) and i.provider = 'google')) x
        from public.reset_requests r order by r.created_at desc limit 100) y), '[]'),
    'inquiries', coalesce((select jsonb_agg(x order by (x ->> 'status') <> 'open', x ->> 'created_at' desc) from (
        select jsonb_build_object('id', q.id, 'student_id', q.student_id, 'name', q.name, 'body', q.body,
                                  'status', q.status, 'created_at', q.created_at) x
        from public.inquiries q order by q.created_at desc limit 200) y), '[]'));
end $$;

create or replace function public.admin_decide_reset(p_id bigint, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.reset_requests; owner uuid;
begin
  perform public._assert_admin();
  select * into r from public.reset_requests where id = p_id and status = 'pending' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_approve then
    perform pg_advisory_xact_lock(hashtext('number:' || r.student_id));
    owner := public._number_owner(r.student_id);
    if owner is null then raise exception 'NO_ACCOUNT'; end if;
    perform public._kick_number(owner);
    perform public._set_number_account(owner, r.student_id, r.pw_hash);
  end if;
  update public.reset_requests set status = case when p_approve then 'approved' else 'denied' end,
         decided_at = now(), decided_by = auth.uid(), pw_hash = ''
   where id = p_id;
  insert into public.events (user_id, kind, data)
  values (auth.uid(), 'admin', jsonb_build_object('reset_request', p_id, 'approve', p_approve, 'id', r.student_id));
  return public.admin_list_requests();
end $$;

create or replace function public.admin_set_inquiry(p_id bigint, p_done boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  update public.inquiries set status = case when p_done then 'done' else 'open' end where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  return public.admin_list_requests();
end $$;

-- ───────── 개발용: 가짜 구글 계정 (테스트 서버, dev_login 일 때만) ─────────
create or replace function public.dev_fake_google(p_name text, p_google_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare em text := lower(btrim(coalesce(p_name, ''))) || '@test.local'; uid uuid;
begin
  if not coalesce((public._setting('dev_login'))::boolean, false) then raise exception 'DEV_LOGIN_OFF'; end if;
  if em !~ '^[a-z0-9._-]{1,40}@test\.local$' then raise exception 'BAD_EMAIL'; end if;
  if exists (select 1 from auth.users where email = em) then raise exception 'BAD_EMAIL'; end if;
  uid := public._create_password_user(em, '1234abcd!', '{}');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, 'dev-' || uid::text,
          jsonb_build_object('sub', 'dev-' || uid::text, 'email', lower(p_google_email), 'email_verified', true),
          'google', now(), now(), now());
  return jsonb_build_object('email', em);
end $$;

-- ───────── 이스터에그: 룰렛 777 (0007 + 꽝이 아주 드물게 777 → '럭키 세븐' 칭호) ─────────
create or replace function public.spin_roulette() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked();   -- row lock: one spin at a time per student
  r jsonb := public._roulette_json(p.user_id);
  total int;
  pick numeric;
  acc int := 0;
  o jsonb;
  prize int := 0;
  jackpot boolean := false;
begin
  perform public._assert_open();
  if not (r ->> 'enabled')::boolean then raise exception 'ROULETTE_OFF'; end if;
  if (r ->> 'used_today')::int >= (r ->> 'daily_max')::int then raise exception 'ROULETTE_DAILY_MAX'; end if;
  if r ->> 'next_at' is not null and now() < (r ->> 'next_at')::timestamptz then raise exception 'ROULETTE_WAIT'; end if;

  select sum((x ->> 1)::int) into total from jsonb_array_elements(r -> 'odds') x;
  if coalesce(total, 0) <= 0 then raise exception 'ROULETTE_OFF'; end if;
  pick := random() * total;
  for o in select * from jsonb_array_elements(r -> 'odds') loop
    acc := acc + (o ->> 1)::int;
    if pick < acc then prize := (o ->> 0)::int; exit; end if;
  end loop;
  jackpot := prize = 0 and random() * 1000 < coalesce((public._setting('roulette_777_per_mille'))::numeric, 0);

  insert into public.roulette_spins (user_id, prize) values (p.user_id, prize);
  if prize > 0 then update public.profiles set evo_tickets = evo_tickets + prize where user_id = p.user_id; end if;
  if jackpot then
    update public.profiles set titles = array_append(titles, '럭키 세븐')
     where user_id = p.user_id and not ('럭키 세븐' = any(titles));
  end if;
  insert into public.events (user_id, kind, data) values (p.user_id, 'roulette', jsonb_build_object('prize', prize, 'jackpot', jackpot));
  return jsonb_build_object('prize', prize, 'jackpot', jackpot,
                            'evo_tickets', (select evo_tickets from public.profiles where user_id = p.user_id),
                            'titles', (select to_jsonb(titles) from public.profiles where user_id = p.user_id),
                            'roulette', public._roulette_json(p.user_id));
end $$;

-- _profile_json (0005) + titles
create or replace function public._profile_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'student_id', p.student_id, 'gen', p.gen, 'name', p.name, 'role', p.role,
    'display', public._display_name(p), 'show_on_board', p.show_on_board, 'avatar', p.avatar,
    'consented', p.consented_at is not null, 'in_ranking', p.in_ranking,
    'evo_tickets', p.evo_tickets, 'score', p.score, 'dex_count', p.dex_count, 'titles', to_jsonb(p.titles),
    'rank', case when p.in_ranking and p.role = 'student' and p.score > 0 then
      (select count(*) + 1 from public.profiles o
        where o.role = 'student' and o.in_ranking
          and (o.score > p.score or (o.score = p.score and o.score_at < p.score_at))) end)
$$;

-- rule (0006): every migration that creates functions ends with this block
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_code_account(text),
  public.create_number_account(text, text),
  public.request_password_reset(text, text, text, text),
  public.dev_create_account(text),
  public.dev_fake_google(text, text)
to anon, authenticated;
grant execute on function
  public.is_admin(),
  public.ensure_profile(),
  public.register_profile(text, text, text, boolean),
  public.link_number(text, text, text, boolean, boolean),
  public.send_inquiry(text),
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
  public.admin_set_in_ranking(text, boolean),
  public.admin_list_staff(),
  public.admin_invite_staff(text, text),
  public.admin_remove_staff(text),
  public.admin_list_requests(),
  public.admin_decide_reset(bigint, boolean),
  public.admin_set_inquiry(bigint, boolean)
to authenticated;
