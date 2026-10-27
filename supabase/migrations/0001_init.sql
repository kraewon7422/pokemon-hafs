-- pokemon-hafs — initial schema, security rules (RLS) and game RPCs.
-- Rules (see docs/DESIGN.md §5):
--   * students never write tables directly; every change goes through a SECURITY DEFINER RPC
--   * every state-changing RPC locks the student's profiles row FOR UPDATE first
--   * QR tokens and quiz answers live in tables students cannot read
--   * server time only

create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── tables ─────────────────────────

create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value) values
  ('festival_open',          'true'),
  ('email_domains',          '["test.local"]'),          -- school domain(s), e.g. ["school.hs.kr"]
  ('email_regex',            '"^([0-9]{5,6})@"'),         -- captures the student id from the email
  ('admin_emails',           '[]'),
  ('booth_emails',           '[]'),
  ('stage_points',           '[0, 1, 3, 6]'),             -- index = stage
  ('rarity_bonus',           '{"common": 0, "rare": 2, "legendary": 10}'),
  ('evo_prob',               '[0, 0.70, 0.35]'),          -- index = current stage
  ('evo_pity_step',          '0.10'),                     -- +10%p per failed try
  ('evo_pity_max',           '[0, 1, 2]'),                -- after this many fails the next try is guaranteed
  ('qr_daily_cap',           '3'),                        -- same QR, same student, per day
  ('bag_max',                '5'),
  ('ticket_ttl_hours',       '10'),
  ('token_grace_minutes',    '30'),
  ('quiz_ticket_daily_cap',  '20'),
  ('rotating_window_sec',    '30'),
  ('rotating_accept_minutes','10');

create table public.lines (
  id        int primary key,
  teacher   text not null,                -- shown only after catch
  subject   text not null,                -- type, e.g. '물리'
  rarity    text not null default 'common' check (rarity in ('common', 'rare', 'legendary')),
  active    boolean not null default true
);

create table public.species (
  id       int primary key,               -- dex number = (line_id-1)*3 + stage = atlas cell + 1
  line_id  int not null references public.lines on delete cascade,
  stage    smallint not null check (stage between 1 and 3),
  name     text not null,
  category text not null default '',      -- "○○ 몬스터" 분류
  flavor   text not null default '',
  height   text not null default '',
  weight   text not null default '',
  unique (line_id, stage),
  check (id = (line_id - 1) * 3 + stage)
);

create table public.qr_points (
  id             text primary key check (id ~ '^[A-Z0-9]{2,6}$'),
  name           text not null,
  hint           text not null default '',
  kind           text not null default 'static' check (kind in ('static', 'rotating')),
  map_x          real,                    -- 0..1 on the campus map image
  map_y          real,
  visible_on_map boolean not null default true,
  active         boolean not null default true,
  active_from    timestamptz,
  active_until   timestamptz,
  created_at     timestamptz not null default now()
);

create table public.qr_secrets (
  qr_id       text not null references public.qr_points on delete cascade,
  token       text not null,
  manual_code text not null unique,       -- printed under the QR for camera failures
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  primary key (qr_id, token)
);

create table public.qr_rewards (
  qr_id   text not null references public.qr_points on delete cascade,
  line_id int  not null references public.lines on delete cascade,
  weight  int  not null check (weight > 0),
  primary key (qr_id, line_id)
);

create table public.profiles (
  user_id       uuid primary key references auth.users on delete cascade,
  student_id    text not null unique,
  gen           int,
  name          text not null default '',
  role          text not null default 'student' check (role in ('student', 'booth', 'admin')),
  show_on_board boolean not null default true,
  avatar        smallint not null default 0 check (avatar between 0 and 3),
  evo_tickets   int not null default 0 check (evo_tickets >= 0),
  score         int not null default 0,
  score_at      timestamptz not null default now(),
  dex_count     int not null default 0,
  last_seen     timestamptz,
  created_at    timestamptz not null default now()
);

create table public.tickets (
  id             bigserial primary key,
  nonce          text not null unique check (nonce ~ '^[a-z0-9]{12}$'),
  user_id        uuid not null references public.profiles on delete cascade,
  qr_id          text not null references public.qr_points on delete cascade,
  token          text not null,
  scanned_at     timestamptz,             -- client clock, informational only
  created_at     timestamptz not null default now(),
  status         text not null default 'pending' check (status in ('pending', 'redeemed', 'expired', 'cancelled')),
  redeemed_at    timestamptz,
  booth_user     uuid,
  result_species int references public.species
);
-- one unused ticket per (student, QR) = the QR "lock"
create unique index tickets_one_pending on public.tickets (user_id, qr_id) where status = 'pending';
create index tickets_user_status on public.tickets (user_id, status);
create index tickets_qr_created  on public.tickets (qr_id, created_at);
create index tickets_redeemed_at on public.tickets (redeemed_at) where status = 'redeemed';

create table public.collection (
  user_id         uuid not null references public.profiles on delete cascade,
  line_id         int  not null references public.lines on delete cascade,
  stage           smallint not null default 1 check (stage between 1 and 3),
  catch_count     int not null default 1,
  evo_fails       int not null default 0,
  first_caught_at timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, line_id)
);

create table public.quizzes (
  id       serial primary key,
  line_id  int not null references public.lines on delete cascade,
  question text not null,
  choices  jsonb not null check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 2 and 4),
  active   boolean not null default true
);

create table public.quiz_answers (
  quiz_id int primary key references public.quizzes on delete cascade,
  answer  smallint not null               -- index into quizzes.choices
);

create table public.quiz_attempts (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles on delete cascade,
  ticket_id   bigint unique references public.tickets on delete cascade,
  quiz_id     int not null references public.quizzes on delete cascade,
  perm        smallint[] not null,        -- display order: perm[display_pos+1] = original choice index
  chosen      smallint,
  correct     boolean,
  granted     boolean,
  created_at  timestamptz not null default now(),
  answered_at timestamptz,
  unique (user_id, quiz_id)               -- a student never gets the same question twice
);

create table public.events (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  user_id uuid,
  kind    text not null,
  data    jsonb not null default '{}'
);
create index events_kind_at on public.events (kind, at);

create table public.client_errors (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  user_id uuid,
  msg     text not null
);

-- ───────────────────────── helpers (not callable by clients) ─────────────────────────

create function public._setting(k text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.settings where key = k
$$;

create function public._today_start() returns timestamptz
language sql stable set search_path = '' as $$
  select (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul'
$$;

create function public._rand(n int, alphabet text) returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr(alphabet, 1 + (get_byte(b, i) % length(alphabet)), 1), '')
  from (select extensions.gen_random_bytes(n) as b) r, generate_series(0, n - 1) i
$$;

create function public._is_role(roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = any (roles))
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public._is_role(array['admin'])
$$;

create function public._assert_open() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((public._setting('festival_open'))::boolean, false) then
    raise exception 'FESTIVAL_CLOSED';
  end if;
end $$;

create function public._display_name(p public.profiles) returns text
language sql immutable set search_path = '' as $$
  select case
    when not p.show_on_board then '익명 트레이너'
    when char_length(p.name) >= 3 then p.gen || '기 ' || left(p.name, 1) || repeat('○', char_length(p.name) - 2) || right(p.name, 1)
    when char_length(p.name) = 2 then p.gen || '기 ' || left(p.name, 1) || '○'
    else p.gen || '기 트레이너'
  end
$$;

-- lock and return the calling student's profile (serialises all of one student's requests)
create function public._me_locked() returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where user_id = auth.uid() for update;
  if not found then raise exception 'NO_PROFILE'; end if;
  return p;
end $$;

create function public._expire_old(uid uuid) returns void
language sql security definer set search_path = '' as $$
  update public.tickets set status = 'expired'
  where user_id = uid and status = 'pending'
    and created_at < now() - make_interval(hours => (public._setting('ticket_ttl_hours'))::int)
$$;

-- current token of a rotating QR for a given time window
create function public._rotating_token(q text, win bigint) returns text
language sql stable security definer set search_path = '' as $$
  select left(encode(extensions.hmac(win::text, s.token, 'sha256'), 'hex'), 10)
  from public.qr_secrets s where s.qr_id = q and s.revoked_at is null
  order by s.created_at desc limit 1
$$;

-- resolve (qr, token) → real qr id if valid now, else null. qr '_' = manual code typed by the student.
create function public._resolve_token(q text, t text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  qp public.qr_points;
  grace interval := make_interval(mins => (public._setting('token_grace_minutes'))::int);
  win_sec int := (public._setting('rotating_window_sec'))::int;
  w bigint;
begin
  if q = '_' then
    select s.qr_id into q from public.qr_secrets s
    where s.manual_code = upper(t) and (s.revoked_at is null or s.revoked_at > now() - grace);
    if q is null then return null; end if;
    t := null;  -- manual code already proved the token
  end if;

  select * into qp from public.qr_points where id = q;
  if not found or not qp.active then return null; end if;
  if qp.active_from is not null and now() < qp.active_from then return null; end if;
  if qp.active_until is not null and now() > qp.active_until + grace then return null; end if;
  if t is null then return q; end if;

  if qp.kind = 'rotating' then
    w := floor(extract(epoch from now()) / win_sec);
    for i in 0 .. ((public._setting('rotating_accept_minutes'))::int * 60 / win_sec) loop
      if public._rotating_token(q, w - i) = t then return q; end if;
    end loop;
    return null;
  end if;

  if exists (select 1 from public.qr_secrets s where s.qr_id = q and s.token = t
             and (s.revoked_at is null or s.revoked_at > now() - grace)) then
    return q;
  end if;
  return null;
end $$;

-- try to create a pending ticket. returns a status word; never raises for game reasons.
create function public._admit(uid uuid, n text, q text, t text, scanned timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare
  existing public.tickets;
  real_q text;
begin
  if n is null or n !~ '^[a-z0-9]{12}$' or q is null or t is null then return 'bad_format'; end if;

  select * into existing from public.tickets where nonce = n;
  if found then
    if existing.user_id <> uid then return 'nonce_conflict'; end if;
    return 'ok';                                   -- idempotent re-send
  end if;

  real_q := public._resolve_token(q, t);
  if real_q is null then return 'invalid_token'; end if;
  if q = '_' then
    select s.token into t from public.qr_secrets s where s.manual_code = upper(t);
  end if;

  if exists (select 1 from public.tickets where user_id = uid and qr_id = real_q and status = 'pending') then
    return 'already_pending';
  end if;
  if (select count(*) from public.tickets where user_id = uid and qr_id = real_q
        and status in ('pending', 'redeemed') and created_at >= public._today_start())
     >= (public._setting('qr_daily_cap'))::int then
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

create function public._recompute(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s int; d int;
begin
  select coalesce(sum((public._setting('stage_points') ->> c.stage)::int
                      + coalesce((public._setting('rarity_bonus') ->> l.rarity)::int, 0)), 0),
         coalesce(sum(c.stage), 0)
    into s, d
  from public.collection c join public.lines l on l.id = c.line_id
  where c.user_id = uid;
  update public.profiles
     set score_at = case when s > score then now() else score_at end,
         score = s, dex_count = d
   where user_id = uid;
end $$;

create function public._profile_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'student_id', p.student_id, 'gen', p.gen, 'name', p.name, 'role', p.role,
    'display', public._display_name(p), 'show_on_board', p.show_on_board, 'avatar', p.avatar,
    'evo_tickets', p.evo_tickets, 'score', p.score, 'dex_count', p.dex_count,
    'rank', (select r.rk from (select user_id, rank() over (order by score desc, score_at asc) rk
                               from public.profiles where role = 'student' and score > 0) r
             where r.user_id = p.user_id))
$$;

-- everything the student app needs, in one response
create function public._state(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'server_time', now(),
    'festival_open', public._setting('festival_open'),
    'rules', jsonb_build_object(
      'bag_max', public._setting('bag_max'), 'qr_daily_cap', public._setting('qr_daily_cap'),
      'evo_prob', public._setting('evo_prob'), 'evo_pity_step', public._setting('evo_pity_step'),
      'evo_pity_max', public._setting('evo_pity_max')),
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

-- weighted random line from a QR's pool (Efraimidis–Spirakis)
create function public._draw_line(q text) returns int
language sql volatile security definer set search_path = '' as $$
  select r.line_id from public.qr_rewards r join public.lines l on l.id = r.line_id
  where r.qr_id = q and l.active
  order by -ln(1 - random()) / r.weight limit 1
$$;

create function public._make_quiz(uid uuid, line int, ticket bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare qz public.quizzes;
begin
  select z.* into qz from public.quizzes z
  where z.line_id = line and z.active
    and exists (select 1 from public.quiz_answers qa where qa.quiz_id = z.id)
    and not exists (select 1 from public.quiz_attempts a where a.user_id = uid and a.quiz_id = z.id)
  order by random() limit 1;
  if not found then return; end if;   -- this student has seen every question of this teacher
  insert into public.quiz_attempts (user_id, ticket_id, quiz_id, perm)
  values (uid, ticket, qz.id,
          (select array_agg(i::smallint order by random()) from generate_series(0, jsonb_array_length(qz.choices) - 1) i));
end $$;

-- parse a bag QR: PH1|<student_id>|<nonce>.<qr>.<token>|...   (or just a student id typed by staff)
create function public._parse_bag(payload text, out sid text, out items jsonb)
language plpgsql immutable set search_path = '' as $$
declare parts text[]; x text[];
begin
  payload := btrim(payload);
  items := '[]';
  if payload ~ '^[0-9]{5,6}$' then sid := lpad(payload, 6, '0'); return; end if;
  parts := string_to_array(payload, '|');
  if parts[1] <> 'PH1' or array_length(parts, 1) < 2 then raise exception 'BAD_PAYLOAD'; end if;
  sid := parts[2];
  for i in 3 .. least(array_length(parts, 1), 12) loop
    x := string_to_array(parts[i], '.');
    if array_length(x, 1) = 3 then
      items := items || jsonb_build_array(jsonb_build_object('n', x[1], 'q', x[2], 't', x[3]));
    end if;
  end loop;
end $$;

-- ───────────────────────── client RPCs ─────────────────────────

-- first call after login: creates the profile from the verified email
create function public.ensure_profile() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  em text; nm text; sid text; m text[]; r text := 'student';
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

  if r = 'student' then
    if not exists (select 1 from jsonb_array_elements_text(public._setting('email_domains')) d
                   where em like '%@' || d) then
      raise exception 'DOMAIN_NOT_ALLOWED';
    end if;
    m := regexp_match(em, public._setting('email_regex') #>> '{}');
    if m is null then raise exception 'NO_STUDENT_ID'; end if;
    sid := lpad(m[1], 6, '0');
  else
    sid := 'staff:' || split_part(em, '@', 1);
  end if;

  if exists (select 1 from public.profiles where student_id = sid) then raise exception 'STUDENT_ID_TAKEN'; end if;

  insert into public.profiles (user_id, student_id, gen, name, role)
  values (uid, sid, case when r = 'student' then left(sid, 3)::int end, nm, r)
  on conflict (user_id) do nothing;
  select * into p from public.profiles where user_id = uid;
  return public._profile_json(p);
end $$;

-- upload offline scans (outbox) and get the full state back. acks tell the client which outbox items to delete.
create function public.sync(p_scans jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked();
  s jsonb;
  acks jsonb := '[]';
  open boolean := coalesce((public._setting('festival_open'))::boolean, false);
begin
  perform public._expire_old(p.user_id);
  if jsonb_typeof(p_scans) = 'array' then
    for s in select * from jsonb_array_elements(p_scans) limit 20 loop
      acks := acks || jsonb_build_array(jsonb_build_object(
        'nonce', s ->> 'n',
        'status', case when not open then 'closed'
                       else public._admit(p.user_id, s ->> 'n', s ->> 'q', s ->> 't', (s ->> 'at')::timestamptz) end));
    end loop;
  end if;
  update public.profiles set last_seen = now() where user_id = p.user_id;
  return jsonb_build_object('acks', acks, 'state', public._state(p.user_id));
end $$;

create function public.answer_quiz(p_attempt bigint, p_choice int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked();
  a public.quiz_attempts;
  ans smallint;
  ok boolean;
  give boolean := false;
begin
  select * into a from public.quiz_attempts where id = p_attempt and user_id = p.user_id and answered_at is null;
  if not found then raise exception 'NO_QUIZ'; end if;
  if p_choice < 0 or p_choice >= array_length(a.perm, 1) then raise exception 'BAD_CHOICE'; end if;
  select answer into ans from public.quiz_answers where quiz_id = a.quiz_id;
  ok := a.perm[p_choice + 1] = ans;
  if ok and (select count(*) from public.quiz_attempts where user_id = p.user_id and granted
             and answered_at >= public._today_start()) < (public._setting('quiz_ticket_daily_cap'))::int then
    give := true;
    update public.profiles set evo_tickets = evo_tickets + 1 where user_id = p.user_id;
  end if;
  update public.quiz_attempts set chosen = p_choice, correct = ok, granted = give, answered_at = now() where id = a.id;
  insert into public.events (user_id, kind, data) values (p.user_id, 'quiz', jsonb_build_object('quiz', a.quiz_id, 'correct', ok));
  return jsonb_build_object('correct', ok, 'answer_pos', array_position(a.perm, ans) - 1, 'granted', give,
                            'evo_tickets', (select evo_tickets from public.profiles where user_id = p.user_id));
end $$;

create function public.evolve(p_line int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked();
  c public.collection;
  base numeric; prob numeric; guaranteed boolean; win boolean;
begin
  perform public._assert_open();
  select * into c from public.collection where user_id = p.user_id and line_id = p_line;
  if not found then raise exception 'NOT_OWNED'; end if;
  if c.stage >= 3 then raise exception 'MAX_STAGE'; end if;
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

create function public.get_ranking(p_gen int default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with r as (
    select p.user_id, p.gen, p.score, p.score_at, p.dex_count, p.avatar,
           public._display_name(p) as display,
           rank() over (order by p.score desc, p.score_at asc) rk
    from public.profiles p
    where p.role = 'student' and p.score > 0 and (p_gen is null or p.gen = p_gen)
  )
  select jsonb_build_object(
    'top', coalesce((select jsonb_agg(jsonb_build_object(
                      'rank', rk, 'display', display, 'gen', gen, 'score', score,
                      'dex', dex_count, 'avatar', avatar, 'me', user_id = auth.uid()) order by rk, score_at)
                    from (select * from r order by rk, score_at limit 50) r), '[]'),
    'me', (select jsonb_build_object('rank', rk, 'score', score) from r where user_id = auth.uid()),
    'total', (select count(*) from r),
    'at', now())
$$;

create function public.set_prefs(p_show boolean, p_avatar int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked();
begin
  update public.profiles set show_on_board = coalesce(p_show, show_on_board),
                             avatar = coalesce(p_avatar, avatar)
   where user_id = p.user_id returning * into p;
  return public._profile_json(p);
end $$;

create function public.log_client_error(p_msg text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  if (select count(*) from public.client_errors where user_id = auth.uid() and at > now() - interval '1 hour') >= 20 then
    return;
  end if;
  insert into public.client_errors (user_id, msg) values (auth.uid(), left(coalesce(p_msg, ''), 500));
end $$;

-- ───────────────────────── booth / screen RPCs (staff only) ─────────────────────────

create function public.booth_lookup(p_payload text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b record; st public.profiles; it jsonb; items jsonb := '[]'; tk public.tickets; rq text;
begin
  if not public._is_role(array['booth', 'admin']) then raise exception 'NOT_STAFF'; end if;
  select * into b from public._parse_bag(p_payload);
  select * into st from public.profiles where student_id = b.sid;
  if not found then raise exception 'NO_STUDENT'; end if;

  for it in select * from jsonb_array_elements(b.items) loop
    select * into tk from public.tickets where nonce = it ->> 'n';
    rq := case when tk.id is not null then tk.qr_id else public._resolve_token(it ->> 'q', it ->> 't') end;
    items := items || jsonb_build_array(jsonb_build_object(
      'nonce', it ->> 'n',
      'qr_name', (select name from public.qr_points where id = rq),
      'status', case when tk.id is not null and tk.user_id <> st.user_id then 'nonce_conflict'
                     when tk.id is not null then tk.status
                     when rq is null then 'invalid_token'
                     else 'new' end));
  end loop;
  -- tickets already synced to the server but not in this QR
  items := items || coalesce((
    select jsonb_agg(jsonb_build_object('nonce', t.nonce, 'qr_name', q.name, 'status', t.status))
    from public.tickets t join public.qr_points q on q.id = t.qr_id
    where t.user_id = st.user_id and t.status = 'pending'
      and not (b.items @> jsonb_build_array(jsonb_build_object('n', t.nonce)))), '[]');

  return jsonb_build_object('student_id', st.student_id, 'gen', st.gen, 'name', st.name,
                            'display', public._display_name(st), 'items', items);
end $$;

-- redeem every valid ticket in the bag QR + every synced pending ticket of that student, atomically
create function public.booth_redeem(p_payload text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b record; st public.profiles; it jsonb; tk public.tickets; adm text;
  line int; sp int; is_new boolean; results jsonb := '[]';
begin
  if not public._is_role(array['booth', 'admin']) then raise exception 'NOT_STAFF'; end if;
  perform public._assert_open();
  select * into b from public._parse_bag(p_payload);
  select * into st from public.profiles where student_id = b.sid for update;   -- serialise with this student's own requests
  if not found then raise exception 'NO_STUDENT'; end if;
  perform public._expire_old(st.user_id);

  -- 1) admit offline tickets carried in the QR
  for it in select * from jsonb_array_elements(b.items) loop
    select * into tk from public.tickets where nonce = it ->> 'n';
    if found then
      if tk.user_id <> st.user_id then
        results := results || jsonb_build_array(jsonb_build_object('nonce', tk.nonce, 'error', 'nonce_conflict'));
      elsif tk.status = 'redeemed' then
        -- replay: same bag QR read twice → return the original result
        results := results || jsonb_build_array(jsonb_build_object(
          'nonce', tk.nonce, 'qr_name', (select name from public.qr_points where id = tk.qr_id),
          'species_id', tk.result_species, 'is_new', false, 'replay', true));
      elsif tk.status <> 'pending' then
        results := results || jsonb_build_array(jsonb_build_object('nonce', tk.nonce, 'error', tk.status));
      end if;                                         -- pending → redeemed in step 2
    else
      adm := public._admit(st.user_id, it ->> 'n', it ->> 'q', it ->> 't', null);
      if adm <> 'ok' then
        results := results || jsonb_build_array(jsonb_build_object('nonce', it ->> 'n', 'error', adm));
      end if;
    end if;
  end loop;

  -- 2) redeem every pending ticket of this student
  for tk in select * from public.tickets where user_id = st.user_id and status = 'pending' order by created_at for update loop
    line := public._draw_line(tk.qr_id);
    if line is null then
      results := results || jsonb_build_array(jsonb_build_object('nonce', tk.nonce, 'error', 'empty_pool'));
      continue;
    end if;
    select id into sp from public.species where line_id = line and stage = 1;
    insert into public.collection (user_id, line_id) values (st.user_id, line)
    on conflict (user_id, line_id) do update set catch_count = public.collection.catch_count + 1, updated_at = now()
    returning (xmax = 0) into is_new;
    update public.tickets set status = 'redeemed', redeemed_at = now(), booth_user = auth.uid(), result_species = sp
     where id = tk.id;
    perform public._make_quiz(st.user_id, line, tk.id);
    results := results || jsonb_build_array(jsonb_build_object(
      'nonce', tk.nonce, 'qr_name', (select name from public.qr_points where id = tk.qr_id),
      'species_id', sp, 'line_id', line, 'is_new', is_new, 'replay', false,
      'rarity', (select rarity from public.lines where id = line)));
  end loop;

  perform public._recompute(st.user_id);
  insert into public.events (user_id, kind, data)
  values (st.user_id, 'redeem', jsonb_build_object('booth', auth.uid(), 'n', jsonb_array_length(results)));

  return jsonb_build_object('student_id', st.student_id, 'display', public._display_name(st), 'name', st.name,
                            'gen', st.gen, 'results', results);
end $$;

create function public.screen_feed() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public._is_role(array['booth', 'admin']) then null else jsonb_build_object(
    'ranking', public.get_ranking(null),
    'feed', coalesce((select jsonb_agg(x order by x ->> 'at' desc) from (
        select jsonb_build_object('at', t.redeemed_at, 'display', public._display_name(p),
                                  'species_id', t.result_species) x
        from public.tickets t join public.profiles p on p.user_id = t.user_id
        where t.status = 'redeemed' and p.show_on_board
        order by t.redeemed_at desc limit 15) y), '[]'),
    'rotating', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'name', q.name)) from public.qr_points q
        where q.kind = 'rotating' and q.active
          and (q.active_from is null or now() >= q.active_from)
          and (q.active_until is null or now() <= q.active_until)), '[]'),
    'at', now()) end
$$;

create function public.screen_rotating_token(p_qr text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare win_sec int := (public._setting('rotating_window_sec'))::int; w bigint;
begin
  if not public._is_role(array['booth', 'admin']) then raise exception 'NOT_STAFF'; end if;
  w := floor(extract(epoch from now()) / win_sec);
  return jsonb_build_object('qr_id', p_qr, 'token', public._rotating_token(p_qr, w),
                            'expires_in', win_sec - (floor(extract(epoch from now()))::bigint % win_sec));
end $$;

-- ───────────────────────── admin RPCs ─────────────────────────

create function public._assert_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
end $$;

create function public._new_secret(q text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tok text; code text;
begin
  tok := public._rand(8, 'abcdefghijkmnpqrstuvwxyz23456789');
  loop
    code := public._rand(5, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');  -- no 0/O/1/I
    exit when not exists (select 1 from public.qr_secrets where manual_code = code);
  end loop;
  insert into public.qr_secrets (qr_id, token, manual_code) values (q, tok, code);
  return jsonb_build_object('qr_id', q, 'token', tok, 'manual_code', code);
end $$;

create function public.admin_create_qr(p_id text, p_name text, p_hint text default '', p_kind text default 'static')
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  insert into public.qr_points (id, name, hint, kind) values (upper(p_id), p_name, coalesce(p_hint, ''), p_kind);
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('create_qr', upper(p_id)));
  return public._new_secret(upper(p_id));
end $$;

-- p_hard = leaked: old token dies immediately. otherwise old token keeps working for token_grace_minutes.
create function public.admin_rotate_qr(p_id text, p_hard boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  update public.qr_secrets
     set revoked_at = case when p_hard then now() - interval '1 day' else now() end
   where qr_id = p_id and revoked_at is null;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('rotate_qr', p_id, 'hard', p_hard));
  return public._new_secret(p_id);
end $$;

create function public.admin_cancel_ticket(p_nonce text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  update public.tickets set status = 'cancelled' where nonce = p_nonce and status = 'pending';
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('cancel', p_nonce));
end $$;

create function public.admin_set_role(p_student_id text, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  update public.profiles set role = p_role where student_id = p_student_id;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('role', p_student_id, 'to', p_role));
end $$;

create function public.admin_adjust_tickets(p_student_id text, p_delta int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  update public.profiles set evo_tickets = greatest(0, evo_tickets + p_delta) where student_id = p_student_id;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('tickets', p_student_id, 'delta', p_delta));
end $$;

-- wrong person claimed a student id → delete that profile (and its game data) so the right student can sign in
create function public.admin_unlink(p_student_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  delete from public.profiles where student_id = p_student_id;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('unlink', p_student_id));
end $$;

create function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  return jsonb_build_object(
    'at', now(),
    'festival_open', public._setting('festival_open'),
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

-- ───────────────────────── row level security ─────────────────────────

alter table public.settings      enable row level security;
alter table public.lines         enable row level security;
alter table public.species       enable row level security;
alter table public.qr_points     enable row level security;
alter table public.qr_secrets    enable row level security;
alter table public.qr_rewards    enable row level security;
alter table public.profiles      enable row level security;
alter table public.tickets       enable row level security;
alter table public.collection    enable row level security;
alter table public.quizzes       enable row level security;
alter table public.quiz_answers  enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.events        enable row level security;
alter table public.client_errors enable row level security;

-- public catalog (read by any signed-in user)
create policy catalog_read on public.lines     for select to authenticated using (true);
create policy catalog_read on public.species   for select to authenticated using (true);
create policy catalog_read on public.qr_points for select to authenticated
  using ((visible_on_map and active) or public.is_admin());

-- own rows
create policy own_read on public.profiles      for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy own_read on public.tickets       for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy own_read on public.collection    for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- admin-only
create policy admin_all on public.settings      for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.qr_secrets    for select to authenticated using (public.is_admin());
create policy admin_all on public.qr_rewards    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.quizzes       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.quiz_answers  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_read on public.quiz_attempts for select to authenticated using (public.is_admin());
create policy admin_read on public.events        for select to authenticated using (public.is_admin());
create policy admin_read on public.client_errors for select to authenticated using (public.is_admin());
create policy admin_write on public.lines     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_write on public.species   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_write on public.qr_points for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- nothing is readable without signing in
revoke all on all tables in schema public from anon;

-- ───────────────────────── function privileges ─────────────────────────

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_admin(),
  public.ensure_profile(),
  public.sync(jsonb),
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
  public.admin_stats()
to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
