-- 0009 운영진 초대: 운영자가 구글 이메일로 다른 운영자/부스 스태프를 추가·삭제한다.
-- 목록은 settings.admin_emails / booth_emails 그대로 쓴다. 이미 로그인한 적 있는 계정이면 역할을 바로 바꾼다.
-- 권한은 구글로 로그인한 계정만 받는다 (0008 ensure_profile 규칙과 같음).

create or replace function public.admin_list_staff() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me text;
begin
  perform public._assert_admin();
  select lower(email) into me from auth.users where id = auth.uid();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'email', x.email, 'role', x.role, 'me', x.email = me,
             'joined', exists (select 1 from auth.users u join public.profiles p on p.user_id = u.id
                               where lower(u.email) = x.email and p.role = x.role))
           order by x.role, x.email)
    from (select e as email, 'admin' as role from jsonb_array_elements_text(public._setting('admin_emails')) e
          union
          select e, 'booth' from jsonb_array_elements_text(public._setting('booth_emails')) e
            where e not in (select jsonb_array_elements_text(public._setting('admin_emails')))) x), '[]');
end $$;

create or replace function public._set_staff_lists(p_email text, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- one role per email: remove it from both lists, then add it to the chosen one (if any)
  update public.settings set updated_at = now(), value = coalesce((
      select jsonb_agg(e) from jsonb_array_elements_text(value) e where lower(e) <> p_email), '[]')
          || case when key = 'admin_emails' and p_role = 'admin' then jsonb_build_array(p_email)
                  when key = 'booth_emails' and p_role = 'booth' then jsonb_build_array(p_email)
                  else '[]'::jsonb end
   where key in ('admin_emails', 'booth_emails');
end $$;

create or replace function public.admin_invite_staff(p_email text, p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare em text := lower(btrim(coalesce(p_email, '')));
begin
  perform public._assert_admin();
  if em !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' or em like '%@code.local' then raise exception 'BAD_EMAIL'; end if;
  if p_role not in ('admin', 'booth') then raise exception 'BAD_ROLE'; end if;
  if em = (select lower(email) from auth.users where id = auth.uid()) then raise exception 'CANNOT_CHANGE_SELF'; end if;
  perform public._set_staff_lists(em, p_role);
  -- already logged in with Google → role now (otherwise ensure_profile gives it at their first login)
  update public.profiles p set role = p_role, in_ranking = false
    from auth.users u
   where u.id = p.user_id and lower(u.email) = em and u.raw_app_meta_data ->> 'provider' = 'google';
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('invite', em, 'role', p_role));
  return public.admin_list_staff();
end $$;

create or replace function public.admin_remove_staff(p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare em text := lower(btrim(coalesce(p_email, '')));
begin
  perform public._assert_admin();
  if em = (select lower(email) from auth.users where id = auth.uid()) then raise exception 'CANNOT_CHANGE_SELF'; end if;
  perform public._set_staff_lists(em, null);
  update public.profiles p set role = 'student'
    from auth.users u
   where u.id = p.user_id and lower(u.email) = em and p.role in ('admin', 'booth');
  insert into public.events (user_id, kind, data) values (auth.uid(), 'admin', jsonb_build_object('remove_staff', em));
  return public.admin_list_staff();
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
  public.admin_set_in_ranking(text, boolean),
  public.admin_list_staff(),
  public.admin_invite_staff(text, text),
  public.admin_remove_staff(text)
to authenticated;
