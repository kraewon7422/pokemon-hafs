-- ensure_profile could fail with 23505 (HTTP 409) when the same new user called it twice at once:
-- the unique(student_id) conflict was not covered by "on conflict (user_id)". Now any conflict is absorbed
-- and we only report STUDENT_ID_TAKEN if the id really belongs to someone else.
create or replace function public.ensure_profile() returns jsonb
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

  insert into public.profiles (user_id, student_id, gen, name, role)
  values (uid, sid, case when r = 'student' then left(sid, 3)::int end, nm, r)
  on conflict do nothing;
  select * into p from public.profiles where user_id = uid;
  if not found then raise exception 'STUDENT_ID_TAKEN'; end if;
  return public._profile_json(p);
end $$;
