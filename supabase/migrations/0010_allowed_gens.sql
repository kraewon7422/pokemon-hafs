-- 0010: only current 기수 (20~22기) can join. 미래·과거 기수 학번은 거절.
--  - setting allowed_gens (운영자 페이지 → 설정에서 매년 바꾸면 됨)
--  - trigger on profiles: every path that creates a profile (register_profile, ensure_profile, codes) is covered
--  - create_code_account / admin_make_login_codes refuse before an account is created

insert into public.settings (key, value) values ('allowed_gens', '[20, 21, 22]')
on conflict (key) do nothing;

create or replace function public._gen_ok(g int) returns boolean
language sql stable security definer set search_path = '' as $$
  select g is null or exists (select 1 from jsonb_array_elements_text(coalesce(public._setting('allowed_gens'), '[]')) x where x::int = g)
$$;

create or replace function public._profiles_gen_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public._gen_ok(new.gen) then raise exception 'BAD_GEN'; end if;
  return new;
end $$;

drop trigger if exists profiles_gen_check on public.profiles;
create trigger profiles_gen_check before insert or update of gen on public.profiles
  for each row execute function public._profiles_gen_check();

-- 학번 코드 계정 (0008) + 기수 확인
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
  if not public._gen_ok(left(sid, 3)::int) then raise exception 'BAD_GEN'; end if;
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

-- 운영자 코드 일괄 생성 (0003) + 기수 확인
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
    if v_id ~ '^[0-9]{6}$' and not public._gen_ok(left(v_id, 3)::int) then raise exception 'BAD_GEN'; end if;
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

-- TV 기수 대항전 (0005): 허용된 기수만
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
              where role = 'student' and in_ranking and gen is not null and public._gen_ok(gen) group by gen) g), '[]'),
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
  public.admin_set_in_ranking(text, boolean),
  public.admin_list_staff(),
  public.admin_invite_staff(text, text),
  public.admin_remove_staff(text)
to authenticated;
