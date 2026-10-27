-- Review fixes (2026-10-27). See docs/DESIGN.md.
--  1. manual codes could not be used for the rotating legendary QR check → legendary QR became permanent. Blocked.
--  2. rotating tokens accepted for 10 min → now `rotating_accept_sec` (90 s).
--  3. per-QR daily cap (qr_points.daily_cap, NULL = settings.qr_daily_cap).
--  4. empty reward pool left tickets pending forever (QR locked) → ticket cancelled + error; admin_stats shows pool_size.
--  5. default EXECUTE privilege also revoked from `authenticated` for future helper functions.
--  6. one malformed outbox item made the whole sync fail → each item is isolated (bad_format).
--  7. manual-code guessing: 10 wrong codes in 10 min → 'locked'.
--  8. ranking visibility is opt-in (show_on_board default false) + consent screen (accept_terms).
--  9. lines.max_stage (legendary = 1 stage).
-- 10. bag QR format v2: PH1/<ID>/<NONCE>.<QR>.<TOKEN>/... uppercase-only (USB scanners + Korean IME), '-' = manual code.
-- 11. sync(p_scans, p_ver): returns the full state only when it changed (egress).
-- 12. self_redeem(): safety valve when the booth is overloaded (settings.self_redeem = true).
-- 13. backup login: admin_make_login_codes() → accounts <id>@code.local with a printed code as password.

-- ───────── schema / settings ─────────
alter table public.qr_points add column daily_cap int check (daily_cap is null or daily_cap > 0);
alter table public.lines add column max_stage smallint not null default 3 check (max_stage between 1 and 3);
alter table public.profiles alter column show_on_board set default false;
alter table public.profiles add column consented_at timestamptz;

create table public.code_failures (
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index code_failures_user_at on public.code_failures (user_id, at);
alter table public.code_failures enable row level security;

insert into public.settings (key, value) values
  ('rotating_accept_sec', '90'),
  ('self_redeem', 'false'),
  ('festival_close_at', 'null'),
  ('min_client_version', '1')
on conflict (key) do nothing;
delete from public.settings where key = 'rotating_accept_minutes';

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ───────── helpers ─────────
create or replace function public._display_name(p public.profiles) returns text
language sql immutable set search_path = '' as $$
  select case
    when not p.show_on_board then '익명 트레이너'
    when p.gen is null then coalesce(nullif(p.name, ''), '트레이너')
    when char_length(p.name) >= 3 then p.gen || '기 ' || left(p.name, 1) || repeat('○', char_length(p.name) - 2) || right(p.name, 1)
    when char_length(p.name) = 2 then p.gen || '기 ' || left(p.name, 1) || '○'
    else p.gen || '기 트레이너'
  end
$$;

create or replace function public._profile_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'student_id', p.student_id, 'gen', p.gen, 'name', p.name, 'role', p.role,
    'display', public._display_name(p), 'show_on_board', p.show_on_board, 'avatar', p.avatar,
    'consented', p.consented_at is not null,
    'evo_tickets', p.evo_tickets, 'score', p.score, 'dex_count', p.dex_count,
    'rank', (select r.rk from (select user_id, rank() over (order by score desc, score_at asc) rk
                               from public.profiles where role = 'student' and score > 0) r
             where r.user_id = p.user_id))
$$;

create or replace function public._resolve_token(q text, t text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  qp public.qr_points;
  grace interval := make_interval(mins => (public._setting('token_grace_minutes'))::int);
  win_sec int := (public._setting('rotating_window_sec'))::int;
  w bigint;
  manual boolean := (q = '_');
begin
  if manual then
    select s.qr_id into q from public.qr_secrets s
    where s.manual_code = upper(t) and (s.revoked_at is null or s.revoked_at > now() - grace);
    if q is null then return null; end if;
    t := null;
  end if;

  select * into qp from public.qr_points where id = q;
  if not found or not qp.active then return null; end if;
  if qp.active_from is not null and now() < qp.active_from then return null; end if;
  if qp.active_until is not null and now() > qp.active_until + grace then return null; end if;

  if qp.kind = 'rotating' then
    if manual then return null; end if;                -- no manual code for the legendary QR
    w := floor(extract(epoch from now()) / win_sec);
    for i in 0 .. greatest(0, (public._setting('rotating_accept_sec'))::int / win_sec - 1) loop
      if public._rotating_token(q, w - i) = t then return q; end if;
    end loop;
    return null;
  end if;

  if t is null then return q; end if;                  -- static QR proved by its manual code
  if exists (select 1 from public.qr_secrets s where s.qr_id = q and s.token = t
             and (s.revoked_at is null or s.revoked_at > now() - grace)) then
    return q;
  end if;
  return null;
end $$;

create or replace function public._admit(uid uuid, n text, q text, t text, scanned timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare
  existing public.tickets;
  real_q text;
  cap int;
begin
  n := lower(n);
  if n is null or n !~ '^[a-z0-9]{12}$' or q is null or t is null then return 'bad_format'; end if;
  q := case when q in ('_', '-') then '_' else upper(q) end;
  t := case when q = '_' then upper(t) else lower(t) end;

  select * into existing from public.tickets where nonce = n;
  if found then
    if existing.user_id <> uid then return 'nonce_conflict'; end if;
    return 'ok';
  end if;

  if q = '_' and (select count(*) from public.code_failures where user_id = uid and at > now() - interval '10 minutes') >= 10 then
    return 'locked';
  end if;
  real_q := public._resolve_token(q, t);
  if real_q is null then
    if q = '_' then insert into public.code_failures (user_id) values (uid); end if;
    return 'invalid_token';
  end if;
  if q = '_' then
    select s.token into t from public.qr_secrets s where s.manual_code = t;
  end if;

  select coalesce(daily_cap, (public._setting('qr_daily_cap'))::int) into cap from public.qr_points where id = real_q;
  if exists (select 1 from public.tickets where user_id = uid and qr_id = real_q and status = 'pending') then
    return 'already_pending';
  end if;
  if (select count(*) from public.tickets where user_id = uid and qr_id = real_q
        and status in ('pending', 'redeemed') and created_at >= public._today_start()) >= cap then
    return 'daily_cap';
  end if;
  if (select count(*) from public.tickets where user_id = uid and status = 'pending')
     >= (public._setting('bag_max'))::int then
    return 'bag_full';
  end if;

  insert into public.tickets (nonce, user_id, qr_id, token, scanned_at)
  values (n, uid, real_q, t, least(coalesce(scanned, now()), now()));
  return 'ok';
end $$;

-- bag QR v2:  PH1/<ID>/<NONCE>.<QR>.<TOKEN>/...   (v1 with '|' still accepted)  or a typed 5–6 digit student id
create or replace function public._parse_bag(payload text, out sid text, out items jsonb)
language plpgsql immutable set search_path = '' as $$
declare parts text[]; x text[];
begin
  payload := btrim(payload);
  items := '[]';
  if payload ~ '^[0-9]{5,6}$' then sid := lpad(payload, 6, '0'); return; end if;
  parts := regexp_split_to_array(payload, '[/|]');
  if upper(parts[1]) <> 'PH1' or array_length(parts, 1) < 2 then raise exception 'BAD_PAYLOAD'; end if;
  sid := case when parts[2] ~ '^[0-9]+$' then parts[2] else lower(parts[2]) end;
  for i in 3 .. least(array_length(parts, 1), 12) loop
    x := string_to_array(parts[i], '.');
    if array_length(x, 1) = 3 then
      items := items || jsonb_build_array(jsonb_build_object(
        'n', lower(x[1]),
        'q', case when x[2] in ('-', '_') then '_' else upper(x[2]) end,
        't', x[3]));
    end if;
  end loop;
end $$;

create or replace function public._state(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'festival_open', public._setting('festival_open'),
    'rules', jsonb_build_object(
      'bag_max', public._setting('bag_max'), 'qr_daily_cap', public._setting('qr_daily_cap'),
      'evo_prob', public._setting('evo_prob'), 'evo_pity_step', public._setting('evo_pity_step'),
      'evo_pity_max', public._setting('evo_pity_max'), 'self_redeem', public._setting('self_redeem'),
      'festival_close_at', public._setting('festival_close_at'),
      'min_client_version', public._setting('min_client_version')),
    'profile', (select public._profile_json(p) from public.profiles p where p.user_id = uid),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nonce', t.nonce, 'qr_id', t.qr_id, 'qr_name', q.name, 'token', t.token, 'status', t.status,
               'created_at', t.created_at, 'redeemed_at', t.redeemed_at, 'species_id', t.result_species)
             order by t.created_at desc)
      from (select * from public.tickets where user_id = uid
            and (status = 'pending' or created_at > now() - interval '24 hours')
            order by created_at desc limit 60) t
      join public.qr_points q on q.id = t.qr_id), '[]'),
    'today', coalesce((
      select jsonb_object_agg(qr_id, cnt) from (
        select qr_id, count(*) cnt from public.tickets
        where user_id = uid and status in ('pending', 'redeemed') and created_at >= public._today_start()
        group by qr_id) x), '{}'),
    'collection', coalesce((
      select jsonb_agg(jsonb_build_object('line_id', c.line_id, 'stage', c.stage, 'catch_count', c.catch_count,
                                          'evo_fails', c.evo_fails, 'first_caught_at', c.first_caught_at))
      from public.collection c where c.user_id = uid), '[]'),
    'quizzes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'attempt_id', a.id, 'line_id', z.line_id, 'question', z.question,
               'choices', (select jsonb_agg(z.choices -> pi order by o) from unnest(a.perm) with ordinality as u(pi, o)))
             order by a.created_at)
      from public.quiz_attempts a join public.quizzes z on z.id = a.quiz_id
      where a.user_id = uid and a.answered_at is null), '[]'))
$$;

-- redeem every pending ticket of one student (caller must hold the student's profile lock)
create or replace function public._redeem_pending(uid uuid, booth uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tk public.tickets; line int; sp int; is_new boolean; results jsonb := '[]';
begin
  for tk in select * from public.tickets where user_id = uid and status = 'pending' order by created_at for update loop
    line := public._draw_line(tk.qr_id);
    if line is null then
      update public.tickets set status = 'cancelled' where id = tk.id;      -- don't lock the QR forever
      results := results || jsonb_build_array(jsonb_build_object('nonce', tk.nonce, 'error', 'empty_pool',
                   'qr_name', (select name from public.qr_points where id = tk.qr_id)));
      continue;
    end if;
    select id into sp from public.species where line_id = line and stage = 1;
    insert into public.collection (user_id, line_id) values (uid, line)
    on conflict (user_id, line_id) do update set catch_count = public.collection.catch_count + 1, updated_at = now()
    returning (xmax = 0) into is_new;
    update public.tickets set status = 'redeemed', redeemed_at = now(), booth_user = booth, result_species = sp
     where id = tk.id;
    perform public._make_quiz(uid, line, tk.id);
    results := results || jsonb_build_array(jsonb_build_object(
      'nonce', tk.nonce, 'qr_name', (select name from public.qr_points where id = tk.qr_id),
      'species_id', sp, 'line_id', line, 'is_new', is_new, 'replay', false,
      'rarity', (select rarity from public.lines where id = line)));
  end loop;
  perform public._recompute(uid);
  return results;
end $$;

-- ───────── client RPCs ─────────
create or replace function public.ensure_profile() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  em text; nm text; sid text; m text[]; r text := 'student'; g int;
  p public.profiles;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into p from public.profiles where user_id = uid;
  if found then return public._profile_json(p); end if;

  select lower(u.email), coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')
    into em, nm from auth.users u where u.id = uid;

  if public._setting('admin_emails') ? em then r := 'admin';
  elsif public._setting('booth_emails') ? em then r := 'booth';
  end if;

  if r <> 'student' then
    sid := 'staff:' || split_part(em, '@', 1);
  elsif em like '%@code.local' then                          -- backup login code account
    sid := split_part(em, '@', 1);
    if sid ~ '^[0-9]{5,6}$' then sid := lpad(sid, 6, '0'); g := left(sid, 3)::int;
    else sid := 'g:' || sid; end if;                          -- teacher / guest
  else
    if not exists (select 1 from jsonb_array_elements_text(public._setting('email_domains')) d
                   where em like '%@' || d) then
      raise exception 'DOMAIN_NOT_ALLOWED';
    end if;
    m := regexp_match(em, public._setting('email_regex') #>> '{}');
    if m is null then raise exception 'NO_STUDENT_ID'; end if;
    sid := lpad(m[1], 6, '0');
    g := left(sid, 3)::int;
  end if;

  insert into public.profiles (user_id, student_id, gen, name, role)
  values (uid, sid, g, nm, r)
  on conflict do nothing;
  select * into p from public.profiles where user_id = uid;
  if not found then raise exception 'STUDENT_ID_TAKEN'; end if;
  return public._profile_json(p);
end $$;

create or replace function public.accept_terms(p_show boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked();
begin
  update public.profiles set consented_at = coalesce(consented_at, now()), show_on_board = coalesce(p_show, false)
   where user_id = p.user_id returning * into p;
  return public._profile_json(p);
end $$;

drop function public.sync(jsonb);
create function public.sync(p_scans jsonb default '[]', p_ver text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked();
  s jsonb; st text; acks jsonb := '[]'; state jsonb; ver text;
  open boolean := coalesce((public._setting('festival_open'))::boolean, false);
begin
  perform public._expire_old(p.user_id);
  if jsonb_typeof(p_scans) = 'array' then
    for s in select * from jsonb_array_elements(p_scans) limit 20 loop
      begin
        st := case when not open then 'closed'
                   else public._admit(p.user_id, s ->> 'n', s ->> 'q', s ->> 't', (s ->> 'at')::timestamptz) end;
      exception when others then
        st := 'bad_format';
      end;
      acks := acks || jsonb_build_array(jsonb_build_object('nonce', s ->> 'n', 'status', st));
    end loop;
  end if;
  update public.profiles set last_seen = now() where user_id = p.user_id;
  state := public._state(p.user_id);
  ver := md5(state::text);
  if p_ver is not distinct from ver then
    return jsonb_build_object('acks', acks, 'ver', ver, 'same', true, 'server_time', now());
  end if;
  return jsonb_build_object('acks', acks, 'ver', ver, 'state', state || jsonb_build_object('server_time', now()));
end $$;

create or replace function public.self_redeem() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked();
begin
  perform public._assert_open();
  if not coalesce((public._setting('self_redeem'))::boolean, false) then raise exception 'SELF_REDEEM_OFF'; end if;
  perform public._expire_old(p.user_id);
  return jsonb_build_object('results', public._redeem_pending(p.user_id, null));
end $$;

create or replace function public.evolve(p_line int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked();
  c public.collection;
  base numeric; prob numeric; guaranteed boolean; win boolean;
begin
  perform public._assert_open();
  select * into c from public.collection where user_id = p.user_id and line_id = p_line;
  if not found then raise exception 'NOT_OWNED'; end if;
  if c.stage >= (select max_stage from public.lines where id = p_line) then raise exception 'MAX_STAGE'; end if;
  update public.profiles set evo_tickets = evo_tickets - 1 where user_id = p.user_id and evo_tickets > 0;
  if not found then raise exception 'NO_TICKET'; end if;

  base := (public._setting('evo_prob') ->> c.stage)::numeric;
  guaranteed := c.evo_fails >= (public._setting('evo_pity_max') ->> c.stage)::int;
  prob := least(1, base + c.evo_fails * (public._setting('evo_pity_step'))::numeric);
  win := guaranteed or random() < prob;

  if win then
    update public.collection set stage = stage + 1, evo_fails = 0, updated_at = now()
     where user_id = p.user_id and line_id = p_line returning * into c;
    perform public._recompute(p.user_id);
  else
    update public.collection set evo_fails = evo_fails + 1, updated_at = now()
     where user_id = p.user_id and line_id = p_line returning * into c;
  end if;
  insert into public.events (user_id, kind, data)
  values (p.user_id, 'evolve', jsonb_build_object('line', p_line, 'success', win, 'stage', c.stage));

  return jsonb_build_object(
    'success', win, 'stage', c.stage, 'evo_fails', c.evo_fails,
    'species_id', (p_line - 1) * 3 + c.stage,
    'evo_tickets', (select evo_tickets from public.profiles where user_id = p.user_id),
    'profile', (select public._profile_json(x) from public.profiles x where x.user_id = p.user_id));
end $$;

-- ───────── booth ─────────
create or replace function public.booth_redeem(p_payload text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b record; st public.profiles; it jsonb; tk public.tickets; adm text; results jsonb := '[]';
begin
  if not public._is_role(array['booth', 'admin']) then raise exception 'NOT_STAFF'; end if;
  perform public._assert_open();
  select * into b from public._parse_bag(p_payload);
  select * into st from public.profiles where student_id = b.sid for update;
  if not found then raise exception 'NO_STUDENT'; end if;
  perform public._expire_old(st.user_id);

  for it in select * from jsonb_array_elements(b.items) loop
    select * into tk from public.tickets where nonce = it ->> 'n';
    if found then
      if tk.user_id <> st.user_id then
        results := results || jsonb_build_array(jsonb_build_object('nonce', tk.nonce, 'error', 'nonce_conflict'));
      elsif tk.status = 'redeemed' then
        results := results || jsonb_build_array(jsonb_build_object(
          'nonce', tk.nonce, 'qr_name', (select name from public.qr_points where id = tk.qr_id),
          'species_id', tk.result_species, 'is_new', false, 'replay', true));
      elsif tk.status <> 'pending' then
        results := results || jsonb_build_array(jsonb_build_object('nonce', tk.nonce, 'error', tk.status));
      end if;
    else
      adm := public._admit(st.user_id, it ->> 'n', it ->> 'q', it ->> 't', null);
      if adm <> 'ok' then
        results := results || jsonb_build_array(jsonb_build_object('nonce', it ->> 'n', 'error', adm));
      end if;
    end if;
  end loop;

  results := results || public._redeem_pending(st.user_id, auth.uid());
  insert into public.events (user_id, kind, data)
  values (st.user_id, 'redeem', jsonb_build_object('booth', auth.uid(), 'n', jsonb_array_length(results)));

  return jsonb_build_object('student_id', st.student_id, 'display', public._display_name(st), 'name', st.name,
                            'gen', st.gen, 'results', results);
end $$;

-- ───────── admin ─────────
-- backup login: create/refresh <id>@code.local accounts; returns the codes ONCE (print them).
create or replace function public.admin_make_login_codes(p_ids text[], p_names text[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  i int; v_id text; em text; code text; uid uuid; nm text; out jsonb := '[]';
begin
  perform public._assert_admin();
  if array_length(p_ids, 1) > 700 then raise exception 'TOO_MANY'; end if;
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    v_id := lower(btrim(p_ids[i]));
    if v_id !~ '^[a-z0-9]{2,12}$' then continue; end if;
    if v_id ~ '^[0-9]{5}$' then v_id := lpad(v_id, 6, '0'); end if;
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

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  return jsonb_build_object(
    'at', now(),
    'festival_open', public._setting('festival_open'),
    'self_redeem', public._setting('self_redeem'),
    'students', (select count(*) from public.profiles where role = 'student'),
    'active_5m', (select count(*) from public.profiles where role = 'student' and last_seen > now() - interval '5 minutes'),
    'tickets', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.tickets group by status) x),
    'scans_series', coalesce((select jsonb_agg(jsonb_build_object('t', b, 'scans', s, 'redeems', r) order by b) from (
        select g b,
          (select count(*) from public.tickets where created_at >= g and created_at < g + interval '10 minutes') s,
          (select count(*) from public.tickets where redeemed_at >= g and redeemed_at < g + interval '10 minutes') r
        from generate_series(date_trunc('hour', now()) - interval '2 hours', now(), interval '10 minutes') g) y), '[]'),
    'qrs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'name', q.name, 'active', q.active, 'kind', q.kind,
        'pool_size', (select count(*) from public.qr_rewards r join public.lines l on l.id = r.line_id where r.qr_id = q.id and l.active),
        'last_scan', (select max(created_at) from public.tickets where qr_id = q.id),
        'scans_today', (select count(*) from public.tickets where qr_id = q.id and created_at >= public._today_start()),
        'scans_10m', (select count(*) from public.tickets where qr_id = q.id and created_at > now() - interval '10 minutes'),
        'pending', (select count(*) from public.tickets where qr_id = q.id and status = 'pending')) order by q.id)
      from public.qr_points q), '[]'),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('student_id', student_id, 'role', role, 'last_seen', last_seen))
      from public.profiles where role <> 'student'), '[]'),
    'quiz', coalesce((select jsonb_agg(jsonb_build_object('line_id', z.line_id, 'answered', n, 'correct', c)) from (
        select z.line_id, count(*) n, count(*) filter (where a.correct) c
        from public.quiz_attempts a join public.quizzes z on z.id = a.quiz_id
        where a.answered_at is not null group by z.line_id) z), '[]'),
    'evolve', (select jsonb_build_object('tries', count(*), 'success', count(*) filter (where (data ->> 'success')::boolean))
               from public.events where kind = 'evolve'),
    'errors_1h', (select count(*) from public.client_errors where at > now() - interval '1 hour'),
    'errors_recent', coalesce((select jsonb_agg(jsonb_build_object('at', at, 'msg', msg)) from
        (select at, msg from public.client_errors order by at desc limit 10) e), '[]'));
end $$;

-- ───────── privileges ─────────
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_admin(),
  public.ensure_profile(),
  public.accept_terms(boolean),
  public.sync(jsonb, text),
  public.self_redeem(),
  public.answer_quiz(bigint, int),
  public.evolve(int),
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
  public.admin_make_login_codes(text[], text[])
to authenticated;

-- unlinking a student also clears their manual-code failure counter
create or replace function public.admin_unlink(p_student_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  delete from public.code_failures where user_id = (select user_id from public.profiles where student_id = p_student_id);
  delete from public.profiles where student_id = p_student_id;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('unlink', p_student_id));
end $$;
grant execute on function public.admin_unlink(text) to authenticated;
