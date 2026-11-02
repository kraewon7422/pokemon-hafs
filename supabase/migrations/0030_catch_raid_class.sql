-- 0030: 잡기 도망 · 레이드 보스 잡기 · 반 이름
--  · 부스 몬스터 잡기: 볼 3개 모두 실패하면 settings.catch_flee (0.05) 확률로 도망 → 서버가 그 티켓으로 받은 것을 되돌림
--    catch_result(p_nonce, p_grade, p_curve, p_fled) — catch_bonus 를 대신함 (옛 앱을 위해 catch_bonus 도 그대로 둠)
--    되돌리기 규칙: _redeem_pending 이 티켓마다 tickets.catch_undo = {new, bonus, lv} 를 남김
--      new  = 이 티켓이 도감 칸을 새로 만듦 → 도망치면 그 칸을 지움 (배틀 팀·파트너에서도 뺌)
--      아니면 catch_count - 1, 또 잡기로 오른 레벨(lv) 만큼 내림 (1 아래로는 안 내림),
--      bonus = 이 잡기로 받은 '또 잡기 진화권' → 아직 1장 이상 있으면 1장 회수
--      답하지 않은 그 티켓의 퀴즈도 지움. 그 뒤 _recompute (점수·도감 수). 티켓 status 는 그대로 'redeemed', fled = true.
--    0030 전에 받은 티켓 (catch_undo 없음): new = (catch_count = 1 이고 알에서 나온 게 아님), bonus = 진화권 규칙 계산, lv = 0
--  · 레이드 보상 방식 settings.raid_reward_mode: "ticket" (지금처럼 특별 티켓) / "catch" (앱에서 볼 raid_catch_balls 개로 잡기)
--    catch → 이긴 사람마다 raid_encounters 한 줄 (노랑 알은 그대로). encounter_result 로 잡음 = 그 레이드 특별 티켓을
--    부스에서 바꾼 것과 똑같이 (같은 _redeem_ticket) + 잡기 경험치. 못 잡으면 raid_catch_flee 가 true 일 때만 도망.
--    sync 상태에 encounters (대기 중인 것) 를 넣어 앱이 따로 묻지 않아도 앎.
--  · 반 = 이름 (1A, 10B, 3 …): profiles.class_name (한글·영문·숫자 1~4자, 대문자로 저장). class_no 는 옛 값으로만 남김.

-- 설정 ----------------------------------------------------------------------------------------------------------
insert into public.settings (key, value) values
  ('catch_flee', '0.05'),
  ('raid_reward_mode', '"ticket"'),
  ('raid_catch_balls', '10'),
  ('raid_catch_flee', 'true')
on conflict (key) do nothing;

-- 표 ------------------------------------------------------------------------------------------------------------
alter table public.tickets add column if not exists fled boolean not null default false;
alter table public.tickets add column if not exists catch_undo jsonb;

create table if not exists public.raid_encounters (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles (user_id) on delete cascade on update cascade,
  raid_id     bigint not null references public.raids (id) on delete cascade,
  species_id  int not null references public.species,
  balls       int not null check (balls > 0),
  status      text not null default 'pending' check (status in ('pending', 'caught', 'fled')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  grade       text check (grade in ('none', 'nice', 'great', 'excellent'))
);
create index if not exists raid_encounters_pending on public.raid_encounters (user_id) where status = 'pending';
alter table public.raid_encounters enable row level security;     -- 함수로만

alter table public.profiles add column if not exists class_name text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_class_name_check') then
    alter table public.profiles add constraint profiles_class_name_check
      check (class_name ~ '^[0-9A-Z가-힣]{1,4}$');
  end if;
end $$;
update public.profiles set class_name = class_no::text where class_no is not null and class_name is null;

-- 티켓 하나 → 몬스터 (부스 · 셀프 지급 · 레이드 잡기 공용) ---------------------------------------------------------
create or replace function public._redeem_ticket(uid uuid, booth uuid, tk public.tickets) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  line int; sp int; stg int; is_new boolean; cnt int; bonus boolean; lv0 int; lv1 int;
  every int := coalesce((public._setting('dup_bonus_every'))::int, 0);
begin
  if tk.fixed_species is not null then
    select s.line_id, s.stage, s.id into line, stg, sp from public.species s where s.id = tk.fixed_species;
  else
    line := public._draw_line(tk.qr_id);
    stg := 1;
    if line is not null then select id into sp from public.species where line_id = line and stage = 1; end if;
  end if;
  if line is null then
    update public.tickets set status = 'cancelled' where id = tk.id;
    return jsonb_build_object('nonce', tk.nonce, 'error', 'empty_pool',
             'qr_name', (select name from public.qr_points where id = tk.qr_id));
  end if;
  select level into lv0 from public.collection where user_id = uid and line_id = line;
  insert into public.collection (user_id, line_id, stage) values (uid, line, stg)
  on conflict (user_id, line_id) do update set catch_count = public.collection.catch_count + 1,
     stage = greatest(public.collection.stage, excluded.stage), updated_at = now()
  returning (xmax = 0), catch_count, level into is_new, cnt, lv1;
  bonus := not is_new and every > 0 and cnt % every = 0 and tk.special is null;
  if bonus then update public.profiles set evo_tickets = evo_tickets + 1 where user_id = uid; end if;
  update public.tickets set status = 'redeemed', redeemed_at = now(), booth_user = booth, result_species = sp,
         catch_undo = jsonb_build_object('new', is_new, 'bonus', bonus,
                                         'lv', case when is_new then 0 else greatest(0, lv1 - coalesce(lv0, lv1)) end)
   where id = tk.id;
  perform public._make_quiz(uid, line, tk.id);
  return jsonb_build_object(
    'nonce', tk.nonce, 'qr_name', (select name from public.qr_points where id = tk.qr_id),
    'species_id', sp, 'line_id', line, 'is_new', is_new, 'replay', false, 'bonus_ticket', bonus,
    'special', tk.special, 'rarity', (select rarity from public.lines where id = line));
end $$;

create or replace function public._redeem_pending(uid uuid, booth uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare tk public.tickets; results jsonb := '[]';
begin
  for tk in select * from public.tickets where user_id = uid and status = 'pending' order by created_at for update loop
    results := results || jsonb_build_array(public._redeem_ticket(uid, booth, tk));
  end loop;
  perform public._recompute(uid);
  return results;
end $$;

-- 잡기 설정 · 결과 ------------------------------------------------------------------------------------------------
create or replace function public.catch_config() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return jsonb_build_object(
    'flee', coalesce((public._setting('catch_flee'))::numeric, 0.05),
    'raid_mode', case when public._setting('raid_reward_mode') #>> '{}' = 'catch' then 'catch' else 'ticket' end,
    'raid_balls', greatest(1, coalesce((public._setting('raid_catch_balls'))::int, 10)),
    'raid_flee', coalesce((public._setting('raid_catch_flee'))::boolean, true));
end $$;

create or replace function public._catch_exp(p_grade text, p_curve boolean) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((coalesce(public._setting('catch_exp'), '{}'::jsonb) ->> p_grade)::int, 0)
       + case when coalesce(p_curve, false) and p_grade <> 'none'
              then coalesce((coalesce(public._setting('catch_exp'), '{}'::jsonb) ->> 'curve')::int, 0) else 0 end
$$;

create or replace function public.catch_result(p_nonce text, p_grade text, p_curve boolean default false, p_fled boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; t public.tickets; v_line int;
  amt int; up int; c public.collection; u jsonb; was_new boolean; had_bonus boolean; lv int; removed boolean := false;
  every int := coalesce((public._setting('dup_bonus_every'))::int, 0);
begin
  if p_grade is null or p_grade not in ('none', 'nice', 'great', 'excellent') then raise exception 'BAD_GRADE'; end if;
  select * into t from public.tickets where nonce = p_nonce and user_id = uid for update;
  if not found or t.status <> 'redeemed' or t.result_species is null then raise exception 'NOT_FOUND'; end if;
  if t.catch_grade is not null then raise exception 'ALREADY_CLAIMED'; end if;
  select line_id into v_line from public.species where id = t.result_species;

  if not coalesce(p_fled, false) then
    amt := public._catch_exp(p_grade, p_curve);
    update public.tickets set catch_grade = p_grade where id = t.id;
    up := public._gain_exp(uid, v_line, amt);
    select * into c from public.collection where user_id = uid and line_id = v_line;
    return jsonb_build_object('fled', false, 'grade', p_grade, 'exp', amt, 'levels', coalesce(up, 0), 'line', v_line, 'level', c.level);
  end if;

  -- 도망: 이 티켓으로 받은 것을 되돌림
  select * into c from public.collection where user_id = uid and line_id = v_line for update;
  if found then
    u := t.catch_undo;
    if u is null then   -- 0030 전에 받은 티켓
      was_new := c.catch_count <= 1 and not c.from_egg;
      had_bonus := not was_new and every > 0 and c.catch_count % every = 0 and t.special is null;
      lv := 0;
    else
      was_new := coalesce((u ->> 'new')::boolean, false);
      had_bonus := coalesce((u ->> 'bonus')::boolean, false);
      lv := coalesce((u ->> 'lv')::int, 0);
    end if;
    if was_new then
      delete from public.collection where user_id = uid and line_id = v_line;
      update public.profiles
         set battle_team = case when battle_team is null then null
                                else nullif(array_remove(battle_team, v_line), '{}'::int[]) end,
             partner_line = case when partner_line = v_line then null else partner_line end
       where user_id = uid;
      removed := true;
    else
      update public.collection
         set catch_count = greatest(1, catch_count - 1), level = greatest(1, level - lv), updated_at = now()
       where user_id = uid and line_id = v_line;
      if had_bonus then
        update public.profiles set evo_tickets = evo_tickets - 1 where user_id = uid and evo_tickets >= 1;
      end if;
    end if;
  end if;
  delete from public.quiz_attempts where ticket_id = t.id and user_id = uid and answered_at is null;
  update public.tickets set catch_grade = 'none', fled = true where id = t.id;
  perform public._recompute(uid);
  insert into public.events (user_id, kind, data) values (uid, 'catch_fled', jsonb_build_object('nonce', t.nonce, 'line', v_line, 'removed', removed));
  return jsonb_build_object('fled', true, 'line', v_line, 'removed', removed);
end $$;

-- 레이드: 이기면 특별 티켓 또는 잡기 기회 -------------------------------------------------------------------------
create or replace function public._raid_finish(rid bigint, won boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.raids; p record; minimum int := coalesce((public._setting('raid_min_taps'))::int, 1);
  catch_mode boolean := public._setting('raid_reward_mode') #>> '{}' = 'catch';
  balls int := greatest(1, coalesce((public._setting('raid_catch_balls'))::int, 10));
begin
  update public.raids set status = case when won then 'won' else 'failed' end, ended_at = now(), hp = case when won then 0 else hp end
   where id = rid and status = 'active' returning * into r;
  if not found or not won then return; end if;
  for p in select * from public.raid_players where raid_id = rid and taps >= minimum for update loop
    if catch_mode then
      insert into public.raid_encounters (user_id, raid_id, species_id, balls) values (p.user_id, rid, r.species_id, balls);
    else
      perform public._grant_special(p.user_id, r.species_id, 'raid');
    end if;
    update public.raid_players set rewarded = true where raid_id = rid and user_id = p.user_id;
    perform public._egg_new(p.user_id, 'yellow', 'raid');
  end loop;
  insert into public.events (kind, data) values ('raid_won', jsonb_build_object('raid', rid, 'species', r.species_id, 'mode', case when catch_mode then 'catch' else 'ticket' end));
end $$;

create or replace function public._encounters_json(uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'species_id', e.species_id, 'balls', e.balls,
                                               'raid_title', r.title, 'created_at', e.created_at) order by e.created_at), '[]')
  from public.raid_encounters e join public.raids r on r.id = e.raid_id
  where e.user_id = uid and e.status = 'pending'
$$;

create or replace function public.my_encounters() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return public._encounters_json(auth.uid());
end $$;

create or replace function public.encounter_result(p_id bigint, p_caught boolean, p_grade text default 'none', p_curve boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); uid uuid := p.user_id; e public.raid_encounters; tk public.tickets;
  res jsonb; caught boolean := coalesce(p_caught, true); g text := coalesce(p_grade, 'none'); amt int; c public.collection; v_line int;
begin
  if g not in ('none', 'nice', 'great', 'excellent') then raise exception 'BAD_GRADE'; end if;
  select * into e from public.raid_encounters where id = p_id and user_id = uid and status = 'pending' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not caught and not coalesce((public._setting('raid_catch_flee'))::boolean, true) then caught := true; end if;
  if not caught then
    update public.raid_encounters set status = 'fled', resolved_at = now(), grade = 'none' where id = e.id;
    select line_id into v_line from public.species where id = e.species_id;
    return jsonb_build_object('caught', false, 'fled', true, 'line', v_line, 'species_id', e.species_id,
                              'new', false, 'level', null, 'exp', 0);
  end if;
  -- 그 레이드의 특별 티켓을 만들고 바로 바꿈 (부스에서 바꾼 것과 같은 길)
  insert into public.tickets (nonce, user_id, qr_id, token, special, fixed_species)
  values (public._rand(12, 'abcdefghijklmnopqrstuvwxyz0123456789'), uid, 'RAID', 'raid', 'raid', e.species_id)
  returning * into tk;
  res := public._redeem_ticket(uid, null, tk);
  v_line := (res ->> 'line_id')::int;
  amt := public._catch_exp(g, p_curve);
  update public.tickets set catch_grade = g where id = tk.id;
  perform public._gain_exp(uid, v_line, amt);
  perform public._recompute(uid);
  update public.raid_encounters set status = 'caught', resolved_at = now(), grade = g where id = e.id;
  select * into c from public.collection where user_id = uid and line_id = v_line;
  return jsonb_build_object('caught', true, 'fled', false, 'line', v_line, 'species_id', e.species_id,
                            'new', coalesce((res ->> 'is_new')::boolean, false), 'level', c.level, 'exp', amt,
                            'nonce', tk.nonce);
end $$;

-- sync 상태에 encounters 추가 (0027 의 _state_base 그대로 + encounters) ------------------------------------------
create or replace function public._state_base(uid uuid) returns jsonb
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
                                          'evo_fails', c.evo_fails, 'first_caught_at', c.first_caught_at,
                                          'from_egg', c.from_egg, 'shiny', c.shiny, 'shiny_on', c.shiny_on))
      from public.collection c where c.user_id = uid), '[]'),
    'quizzes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'attempt_id', a.id, 'line_id', z.line_id, 'question', z.question,
               'choices', (select jsonb_agg(z.choices -> pi order by o) from unnest(a.perm) with ordinality as u(pi, o)))
             order by a.created_at)
      from public.quiz_attempts a join public.quizzes z on z.id = a.quiz_id
      where a.user_id = uid and a.answered_at is null), '[]'),
    'encounters', public._encounters_json(uid))
$$;

-- 반 = 이름 ------------------------------------------------------------------------------------------------------
create or replace function public._check_class_name(g int, c text) returns text
language plpgsql immutable security definer set search_path = '' as $$
declare v text := nullif(upper(btrim(coalesce(c, ''))), '');
begin
  if g is null and v is null then return null; end if;
  if g is null or v is null or g not between 1 and 3 or v !~ '^[0-9A-Z가-힣]{1,4}$' then raise exception 'BAD_CLASS'; end if;
  return v;
end $$;

-- 옛 class_no 칸: 1~20 숫자 반이면 같이 적어 둠 (옛 앱 표시용), 아니면 비움
create or replace function public._class_no_of(v text) returns smallint
language sql immutable security definer set search_path = '' as $$
  select case when v ~ '^[0-9]{1,2}$' and v::int between 1 and 20 then v::smallint end
$$;

drop function if exists public.set_class(int, int);
create or replace function public.set_class(p_grade int, p_class text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles := public._me_locked(); v text;
begin
  if p.role <> 'student' or p.student_id !~ '^[0-9]{6}$' then raise exception 'NOT_STUDENT'; end if;
  v := public._check_class_name(p_grade, p_class);
  update public.profiles set grade = case when v is null then null else p_grade end, class_name = v, class_no = public._class_no_of(v)
   where user_id = p.user_id returning * into p;
  return public._profile_json(p);
end $$;

drop function if exists public.admin_set_class(text, int, int);
create or replace function public.admin_set_class(p_student_id text, p_grade int, p_class text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles; v text;
begin
  perform public._assert_admin();
  v := public._check_class_name(p_grade, p_class);
  select * into p from public.profiles where student_id = p_student_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p.role <> 'student' or p.student_id !~ '^[0-9]{6}$' then raise exception 'NOT_STUDENT'; end if;
  update public.profiles set grade = case when v is null then null else p_grade end, class_name = v, class_no = public._class_no_of(v)
   where user_id = p.user_id;
  insert into public.events (user_id, kind, data)
  values (auth.uid(), 'admin', jsonb_build_object('set_class', p_student_id, 'grade', p_grade, 'class_name', v));
  return jsonb_build_object('student_id', p_student_id, 'grade', case when v is null then null else p_grade end, 'class_name', v);
end $$;

create or replace function public.class_ranking() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); me public.profiles;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into me from public.profiles where user_id = uid;
  if not found then raise exception 'NOT_AUTHENTICATED'; end if;
  return (with s as (
      select p.* from public.profiles p
       where p.role = 'student' and p.in_ranking and p.score > 0 and p.student_id ~ '^[0-9]{6}$'
         and p.grade is not null and p.class_name is not null),
    c as (
      select s.grade, s.class_name, sum(s.score)::int as score, count(*)::int as players, round(avg(s.score), 1) as avg
        from s group by s.grade, s.class_name),
    r as (select c.*, rank() over (order by c.score desc) as rk from c)
    select jsonb_build_object(
      'classes', coalesce((select jsonb_agg(jsonb_build_object(
          'rank', r.rk, 'grade', r.grade, 'class_name', r.class_name, 'class_no', public._class_no_of(r.class_name),
          'score', r.score, 'players', r.players, 'avg', r.avg,
          'top', (select jsonb_build_object('display', public._display_name(t), 'score', t.score)
                    from s t where t.grade = r.grade and t.class_name = r.class_name order by t.score desc, t.score_at limit 1),
          'me', r.grade = me.grade and r.class_name = me.class_name) order by r.rk, r.grade, r.class_name) from r), '[]'),
      'mine', case when me.grade is null or me.class_name is null then null else jsonb_build_object(
          'grade', me.grade, 'class_name', me.class_name, 'class_no', public._class_no_of(me.class_name),
          'rank', (select r.rk from r where r.grade = me.grade and r.class_name = me.class_name),
          'score', (select r.score from r where r.grade = me.grade and r.class_name = me.class_name)) end,
      'can_set', me.role = 'student' and me.student_id ~ '^[0-9]{6}$',
      'at', now()));
end $$;

-- 0027 의 _profile_json 그대로 + class_name
create or replace function public._profile_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'student_id', p.student_id, 'gen', p.gen, 'name', p.name, 'role', p.role,
    'display', public._display_name(p), 'show_on_board', p.show_on_board, 'avatar', p.avatar,
    'consented', p.consented_at is not null, 'in_ranking', p.in_ranking,
    'evo_tickets', p.evo_tickets, 'score', p.score, 'dex_count', p.dex_count, 'titles', to_jsonb(p.titles),
    'partner', p.partner_line, 'grade', p.grade, 'class_no', p.class_no, 'class_name', p.class_name,
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
  public.screen_raids(), public.raid_join_open(bigint, int), public.open_raids(),
  public.submit_minigame_score(text, int, int), public.minigame_ranking(text), public.claim_egg(text), public.set_partner(int), public.minigame_config(),
  public.battle_code(text, boolean), public.battle_peek(text), public.battle_set_team(int[]), public.battle_start_cpu(int[], text, boolean),
  public.battle_start_team(text, int[]), public.battle_challenge(text, int[]), public.battle_inbox(), public.battle_accept(bigint, int[]),
  public.battle_decline(bigint), public.battle_state(bigint), public.battle_act(bigint, jsonb), public.battle_forfeit(bigint), public.battle_today(),
  public.battle_recent(),
  public.bag_state(bigint), public.bag_set_moves(int, int[]), public.bag_set_held(int, text), public.bag_use(text, int),
  public.egg_state(), public.egg_incubate(bigint), public.egg_add_steps(int), public.egg_hatch(bigint), public.set_shiny(int, boolean),
  public.set_class(int, text), public.class_ranking(), public.achievements(), public.claim_achievement(text),
  public.admin_create_qr(text, text, text, text), public.admin_rotate_qr(text, boolean), public.admin_cancel_ticket(text),
  public.admin_set_role(text, text), public.admin_adjust_tickets(text, int), public.admin_unlink(text), public.admin_stats(),
  public.admin_make_login_codes(text[], text[]), public.admin_export_ranking(), public.admin_relink(text, text),
  public.admin_grant_monster(text, int, int), public.admin_set_in_ranking(text, boolean), public.admin_list_staff(),
  public.admin_invite_staff(text, text), public.admin_remove_staff(text), public.admin_list_requests(),
  public.admin_decide_reset(bigint, boolean), public.admin_set_inquiry(bigint, boolean),
  public.admin_create_raid(int, int, int, boolean, text, text), public.admin_end_raid(bigint), public.admin_list_raids(), public.admin_set_raid_open(bigint, boolean),
  public.admin_delete_students(text[], text), public.admin_count_students(),
  public.admin_create_staff_login(text, text, text), public.admin_reset_staff_password(text),
  public.admin_list_staff_logins(), public.admin_remove_staff_login(text),
  public.admin_game_stats(), public.admin_give_item(text, text, int), public.admin_set_level(text, int, int),
  public.admin_minigame_overview(), public.admin_minigame_scores(text, int), public.admin_delete_minigame_scores(text, text), public.admin_reset_minigame(text, text),
  public.admin_give_egg(text, text, int), public.admin_set_class(text, int, text),
  public.catch_bonus(text, text, boolean),
  public.catch_config(), public.catch_result(text, text, boolean, boolean), public.my_encounters(),
  public.encounter_result(bigint, boolean, text, boolean)
to authenticated;
