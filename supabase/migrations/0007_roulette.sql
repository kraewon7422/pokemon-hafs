-- 진화권 룰렛: 학생이 N분마다 한 번 돌려서 진화권 0/1/3/5장을 받는다. 결과는 서버가 정한다(폰에서 조작 불가).
-- 하루 횟수 제한으로 '기다리기만 해도 다 진화'를 막는다. 운영자가 설정 탭에서 확률/간격/횟수를 바꿀 수 있다.

insert into public.settings (key, value) values
  ('roulette_enabled',   'true'),
  ('roulette_every_min', '5'),
  ('roulette_daily_max', '12'),
  ('roulette_odds',      '[[0, 60], [1, 30], [3, 8], [5, 2]]')   -- [진화권 수, 가중치]
on conflict (key) do nothing;

create table public.roulette_spins (
  id      bigserial primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade on update cascade,
  at      timestamptz not null default now(),
  prize   int not null
);
create index roulette_spins_user_at on public.roulette_spins (user_id, at desc);
alter table public.roulette_spins enable row level security;   -- no policies: only the functions below touch it

create or replace function public._roulette_json(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with s as (
    select max(at) as last_at, count(*) filter (where at >= public._today_start()) as used
    from public.roulette_spins where user_id = uid)
  select jsonb_build_object(
    'enabled', coalesce((public._setting('roulette_enabled'))::boolean, false),
    'every_min', public._setting('roulette_every_min'),
    'daily_max', public._setting('roulette_daily_max'),
    'odds', public._setting('roulette_odds'),
    'used_today', s.used,
    'next_at', s.last_at + make_interval(mins => (public._setting('roulette_every_min'))::int))
  from s
$$;

-- keep the old _state as-is and add the roulette block next to it
alter function public._state(uuid) rename to _state_base;
create or replace function public._state(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public._state_base(uid) || jsonb_build_object('roulette', public._roulette_json(uid))
$$;

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

  insert into public.roulette_spins (user_id, prize) values (p.user_id, prize);
  if prize > 0 then update public.profiles set evo_tickets = evo_tickets + prize where user_id = p.user_id; end if;
  insert into public.events (user_id, kind, data) values (p.user_id, 'roulette', jsonb_build_object('prize', prize));
  return jsonb_build_object('prize', prize,
                            'evo_tickets', (select evo_tickets from public.profiles where user_id = p.user_id),
                            'roulette', public._roulette_json(p.user_id));
end $$;

-- rule (0006): every migration that creates functions ends with this block
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_admin(),
  public.ensure_profile(),
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
