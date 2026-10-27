-- Festival-day operations (audit 2026-10-27):
--  1. festival_close_at is enforced on the server (_is_open); answer_quiz also stops when closed.
--  2. teachers/guests (code login 'g:…') are excluded from ranking (profiles.in_ranking).
--  3. notice banner + prize note + legendary schedule + "ended" flag go to every phone through _state.rules.
--  4. admin_export_ranking (real names, for prizes), admin_relink (move a student's game data to another login),
--     admin_grant_monster (dispute fix), admin_set_in_ranking.
--  5. duplicate bonus: every Nth catch of the same line gives +1 evolution ticket (settings.dup_bonus_every).
--  6. lines.withdrawn: a teacher withdrew consent → no drops, app/TV hide name & sprite.
--  7. battle prep (unused for now): lines.btype + base stats, settings.battle_stage_mult.
--  8. sync rejects oversized outboxes; index for ranking.

-- ───────── schema / settings ─────────
-- admins clear a setting by saving JSON null; PostgREST turns that into SQL NULL, so allow it (treated like JSON null)
alter table public.settings alter column value drop not null;
alter table public.profiles add column in_ranking boolean not null default true;
update public.profiles set in_ranking = false where student_id like 'g:%';
create index profiles_rank on public.profiles (score desc, score_at) where role = 'student' and in_ranking;

alter table public.lines add column withdrawn boolean not null default false;
alter table public.lines add column btype text;                -- battle type group (later)
alter table public.lines add column base_hp smallint;
alter table public.lines add column base_atk smallint;
alter table public.lines add column base_def smallint;
alter table public.lines add column base_spd smallint;

insert into public.settings (key, value) values
  ('notice', 'null'),                 -- "13:00 전설 출현!" — shown on every phone
  ('prize_note', 'null'),             -- shown on the "festival ended" screen
  ('dup_bonus_every', '3'),           -- 0 = off
  ('battle_stage_mult', '[0, 1, 1.4, 1.9]')
on conflict (key) do nothing;
update public.settings set value = '30' where key = 'quiz_ticket_daily_cap';

-- moving a student's data to another login needs the FKs to follow profiles.user_id
alter table public.tickets drop constraint tickets_user_id_fkey,
  add constraint tickets_user_id_fkey foreign key (user_id) references public.profiles (user_id) on delete cascade on update cascade;
alter table public.collection drop constraint collection_user_id_fkey,
  add constraint collection_user_id_fkey foreign key (user_id) references public.profiles (user_id) on delete cascade on update cascade;
alter table public.quiz_attempts drop constraint quiz_attempts_user_id_fkey,
  add constraint quiz_attempts_user_id_fkey foreign key (user_id) references public.profiles (user_id) on delete cascade on update cascade;

-- ───────── open / closed ─────────
create or replace function public._is_open() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((public._setting('festival_open'))::boolean, false)
     and (jsonb_typeof(public._setting('festival_close_at')) is distinct from 'string'
          or now() <= (public._setting('festival_close_at') #>> '{}')::timestamptz)
$$;

create or replace function public._assert_open() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._is_open() then raise exception 'FESTIVAL_CLOSED'; end if;
end $$;

-- ───────── profile / ranking ─────────
create or replace function public._profile_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'student_id', p.student_id, 'gen', p.gen, 'name', p.name, 'role', p.role,
    'display', public._display_name(p), 'show_on_board', p.show_on_board, 'avatar', p.avatar,
    'consented', p.consented_at is not null, 'in_ranking', p.in_ranking,
    'evo_tickets', p.evo_tickets, 'score', p.score, 'dex_count', p.dex_count,
    'rank', case when p.in_ranking and p.role = 'student' and p.score > 0 then
      (select count(*) + 1 from public.profiles o
        where o.role = 'student' and o.in_ranking
          and (o.score > p.score or (o.score = p.score and o.score_at < p.score_at))) end)
$$;

create or replace function public.get_ranking(p_gen int default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with r as (
    select p.user_id, p.gen, p.score, p.score_at, p.dex_count, p.avatar,
           public._display_name(p) as display,
           rank() over (order by p.score desc, p.score_at asc) rk
    from public.profiles p
    where p.role = 'student' and p.in_ranking and p.score > 0 and (p_gen is null or p.gen = p_gen)
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
  elsif em like '%@code.local' then
    sid := split_part(em, '@', 1);
    if sid ~ '^[0-9]{5,6}$' then sid := lpad(sid, 6, '0'); g := left(sid, 3)::int;
    else sid := 'g:' || sid; end if;
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

  insert into public.profiles (user_id, student_id, gen, name, role, in_ranking)
  values (uid, sid, g, nm, r, sid not like 'g:%')
  on conflict do nothing;
  select * into p from public.profiles where user_id = uid;
  if not found then raise exception 'STUDENT_ID_TAKEN'; end if;
  return public._profile_json(p);
end $$;

-- ───────── state (everything a phone needs) ─────────
create or replace function public._state(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'festival_open', public._is_open(),
    'rules', jsonb_build_object(
      'bag_max', public._setting('bag_max'), 'qr_daily_cap', public._setting('qr_daily_cap'),
      'evo_prob', public._setting('evo_prob'), 'evo_pity_step', public._setting('evo_pity_step'),
      'evo_pity_max', public._setting('evo_pity_max'), 'self_redeem', public._setting('self_redeem'),
      'festival_close_at', public._setting('festival_close_at'),
      'festival_ended', jsonb_typeof(public._setting('festival_close_at')) = 'string'
                        and now() > (public._setting('festival_close_at') #>> '{}')::timestamptz,
      'min_client_version', public._setting('min_client_version'),
      'notice', public._setting('notice'), 'prize_note', public._setting('prize_note'),
      'dup_bonus_every', public._setting('dup_bonus_every'),
      'legend_schedule', coalesce((select jsonb_agg(jsonb_build_object('name', q.name, 'from', q.active_from, 'until', q.active_until)
                                                   order by q.active_from nulls last)
                                   from public.qr_points q
                                   where q.kind = 'rotating' and q.active and (q.active_until is null or q.active_until > now())), '[]'),
      'withdrawn', coalesce((select jsonb_agg(id) from public.lines where withdrawn), '[]')),
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

-- ───────── game ─────────
create or replace function public._draw_line(q text) returns int
language sql volatile security definer set search_path = '' as $$
  select r.line_id from public.qr_rewards r join public.lines l on l.id = r.line_id
  where r.qr_id = q and l.active and not l.withdrawn
  order by -ln(1 - random()) / r.weight limit 1
$$;

create or replace function public._redeem_pending(uid uuid, booth uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  tk public.tickets; line int; sp int; is_new boolean; cnt int; bonus boolean; results jsonb := '[]';
  every int := coalesce((public._setting('dup_bonus_every'))::int, 0);
begin
  for tk in select * from public.tickets where user_id = uid and status = 'pending' order by created_at for update loop
    line := public._draw_line(tk.qr_id);
    if line is null then
      update public.tickets set status = 'cancelled' where id = tk.id;
      results := results || jsonb_build_array(jsonb_build_object('nonce', tk.nonce, 'error', 'empty_pool',
                   'qr_name', (select name from public.qr_points where id = tk.qr_id)));
      continue;
    end if;
    select id into sp from public.species where line_id = line and stage = 1;
    insert into public.collection (user_id, line_id) values (uid, line)
    on conflict (user_id, line_id) do update set catch_count = public.collection.catch_count + 1, updated_at = now()
    returning (xmax = 0), catch_count into is_new, cnt;
    bonus := not is_new and every > 0 and cnt % every = 0;
    if bonus then update public.profiles set evo_tickets = evo_tickets + 1 where user_id = uid; end if;
    update public.tickets set status = 'redeemed', redeemed_at = now(), booth_user = booth, result_species = sp
     where id = tk.id;
    perform public._make_quiz(uid, line, tk.id);
    results := results || jsonb_build_array(jsonb_build_object(
      'nonce', tk.nonce, 'qr_name', (select name from public.qr_points where id = tk.qr_id),
      'species_id', sp, 'line_id', line, 'is_new', is_new, 'replay', false, 'bonus_ticket', bonus,
      'rarity', (select rarity from public.lines where id = line)));
  end loop;
  perform public._recompute(uid);
  return results;
end $$;

drop function public.sync(jsonb, text);
create function public.sync(p_scans jsonb default '[]', p_ver text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked();
  s jsonb; st text; acks jsonb := '[]'; state jsonb; ver text;
  open boolean := public._is_open();
begin
  if jsonb_typeof(p_scans) = 'array' and jsonb_array_length(p_scans) > 50 then raise exception 'TOO_MANY'; end if;
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

create or replace function public.answer_quiz(p_attempt bigint, p_choice int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles := public._me_locked();
  a public.quiz_attempts;
  ans smallint;
  ok boolean;
  give boolean := false;
begin
  perform public._assert_open();
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

-- ───────── TV ─────────
create or replace function public.screen_feed() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not public._is_role(array['booth', 'admin']) then null else jsonb_build_object(
    'ranking', public.get_ranking(null),
    'feed', coalesce((select jsonb_agg(x order by x ->> 'at' desc) from (
        select jsonb_build_object('at', t.redeemed_at, 'display', public._display_name(p),
                                  'species_id', t.result_species) x
        from public.tickets t join public.profiles p on p.user_id = t.user_id
        join public.species s on s.id = t.result_species join public.lines l on l.id = s.line_id
        where t.status = 'redeemed' and p.show_on_board and not l.withdrawn
        order by t.redeemed_at desc limit 15) y), '[]'),
    'gens', coalesce((select jsonb_agg(jsonb_build_object('gen', gen, 'score', total, 'players', n) order by total desc)
        from (select gen, sum(score) total, count(*) filter (where score > 0) n from public.profiles
              where role = 'student' and in_ranking and gen is not null group by gen) g), '[]'),
    'rotating', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'name', q.name) order by q.id) from public.qr_points q
        where q.kind = 'rotating' and q.active
          and (q.active_from is null or now() >= q.active_from)
          and (q.active_until is null or now() <= q.active_until)), '[]'),
    'schedule', coalesce((select jsonb_agg(jsonb_build_object('name', q.name, 'from', q.active_from, 'until', q.active_until)
                                           order by q.active_from nulls last) from public.qr_points q
        where q.kind = 'rotating' and q.active and (q.active_until is null or q.active_until > now())), '[]'),
    'notice', public._setting('notice'),
    'ended', not public._is_open(),
    'at', now()) end
$$;

-- ───────── admin ─────────
create or replace function public.admin_export_ranking() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  return coalesce((select jsonb_agg(x order by (x ->> 'rank')::int nulls last, x ->> 'student_id') from (
    select jsonb_build_object(
      'rank', case when p.in_ranking and p.score > 0 then rank() over (partition by (p.in_ranking and p.score > 0) order by p.score desc, p.score_at) end,
      'student_id', p.student_id, 'name', p.name, 'gen', p.gen, 'score', p.score, 'score_at', p.score_at,
      'dex', p.dex_count, 'in_ranking', p.in_ranking, 'show_on_board', p.show_on_board,
      'final_lines', (select count(*) from public.collection c join public.lines l on l.id = c.line_id
                       where c.user_id = p.user_id and c.stage >= l.max_stage),
      'rare', (select count(*) from public.collection c join public.lines l on l.id = c.line_id
                where c.user_id = p.user_id and l.rarity <> 'common'),
      'catches', (select coalesce(sum(catch_count), 0) from public.collection c where c.user_id = p.user_id)) x
    from public.profiles p where p.role = 'student') y), '[]');
end $$;

-- move a student's game data to another login (lost phone + backup code, Google ↔ code account …)
create or replace function public.admin_relink(p_student_id text, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid; other public.profiles;
begin
  perform public._assert_admin();
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'NO_ACCOUNT'; end if;
  select * into other from public.profiles where user_id = uid;
  if found then
    if other.student_id = p_student_id then return jsonb_build_object('ok', true, 'note', 'already linked'); end if;
    if exists (select 1 from public.tickets where user_id = uid) or exists (select 1 from public.collection where user_id = uid) then
      raise exception 'ACCOUNT_IN_USE';
    end if;
    delete from public.profiles where user_id = uid;       -- empty profile of the new login
  end if;
  update public.profiles set user_id = uid where student_id = p_student_id;
  if not found then raise exception 'NO_STUDENT'; end if;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('relink', p_student_id, 'to', p_email));
  return jsonb_build_object('ok', true);
end $$;

-- dispute fix: give a monster (stage) directly
create or replace function public.admin_grant_monster(p_student_id text, p_line int, p_stage int default 1) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid; top int;
begin
  perform public._assert_admin();
  select user_id into uid from public.profiles where student_id = p_student_id for update;
  if uid is null then raise exception 'NO_STUDENT'; end if;
  select max_stage into top from public.lines where id = p_line;
  if top is null then raise exception 'NO_LINE'; end if;
  insert into public.collection (user_id, line_id, stage) values (uid, p_line, least(greatest(p_stage, 1), top))
  on conflict (user_id, line_id) do update
    set stage = greatest(public.collection.stage, excluded.stage), catch_count = public.collection.catch_count + 1, updated_at = now();
  perform public._recompute(uid);
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('grant', p_student_id, 'line', p_line, 'stage', p_stage));
end $$;

create or replace function public.admin_set_in_ranking(p_student_id text, p_in boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._assert_admin();
  update public.profiles set in_ranking = p_in where student_id = p_student_id;
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('in_ranking', p_student_id, 'to', p_in));
end $$;

grant execute on function
  public.sync(jsonb, text),
  public.admin_export_ranking(),
  public.admin_relink(text, text),
  public.admin_grant_monster(text, int, int),
  public.admin_set_in_ranking(text, boolean)
to authenticated;
