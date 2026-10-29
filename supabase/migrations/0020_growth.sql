-- 0020: 성장 — 레벨(최대 100)·경험치, 기술 배우기(레벨·기술머신)·고르기, 가방(지닌 물건·회복약·도구·기술머신),
--        배틀 새 효과(얼음·혼란·풀죽음·회피율·연속 공격·반동으로 쉬기), 공정 모드, 시간표 필드, 같은 과 시너지.
--
--  레벨: collection.level (1~100). 새로 잡으면 단계에 따라 5/20/35 (전설 40). 레벨 오르는 길은 운영자 설정에서 하나씩 켜고 끔:
--    lv_from_battle (배틀 경험치), lv_from_raid (레이드 참가 +raid_levels), lv_from_places (하루에 서로 다른 장소 QR lv_places_n 곳마다
--    배틀 팀 +1), lv_from_catch (같은 선생님을 또 잡으면 +1). 이상한사탕 = +1. 경험치 표: 레벨 L → L+1 에 exp_need_mul × L.
--  능력치 = 3세대 식 그대로 레벨 반영: HP = ⌊(2B+31)·L/100⌋ + L + 10, 나머지 = ⌊(2B+31)·L/100⌋ + 5 (L = 50 이면 지금과 같음).
--  기술: 몬스터가 아는 기술 = 지금·이전 단계 기본 기술 ∪ 레벨로 배운 기술(learnset, how='level', lv ≤ 레벨) ∪ 기술머신으로 배운 기술
--    (collection.learned). 그중 4개를 고름 (collection.moves, null = 기본 4개). 기술 번호는 seed_battle.sql 에서 고정.
--  가방: items (주머니 hold/med/tool/tm), inventory (개수), item_log (주운 기록 → 폰이 "주웠다!" 알림).
--    나오는 곳: 장소 QR 찍기 (drop_place), 퀴즈 정답 (drop_quiz), 배틀 승리 (drop_battle / 연습 drop_practice),
--    레이드 (이상한사탕 + drop_raid_tm 확률로 특별 기술머신). 장소마다 qr_points.drop_item 을 정하면 절반은 그 물건.
--  배틀:
--    · 공정 모드 (profiles.battle_fair, QR 보여주는 사람이 고름) = 모두 Lv.50, 회복약 금지.
--    · 회복약 = 한 턴을 쓰고 {"item": key, "target": 팀 번호}. 한 배틀에 battle_item_max (2) 개. 교체 다음, 기술보다 먼저.
--    · 시간표 필드 (battle_fields): 배틀을 시작한 시각의 칸 → 그 타입 기술 위력 × battle_field_mult.
--    · 같은 과 시너지: 팀에 같은 과(언어·수리·과학·사회·예체능) 2마리 이상 → 그 몬스터들이 나올 때 능력 +1.
--    · 턴 제한 battle_turn_cap: 넘으면 남은 HP 비율이 높은 쪽 승리.
--    · 끝나면 경험치 (나온 몬스터마다) + 가끔 물건. reward.exp / reward.item 에 쪽 번호별로.
--  ※ 하던 배틀은 상태 모양이 바뀌어 취소. 기술 번호가 바뀌므로 이 파일 다음에 seed_battle.sql 을 실행.

-- ════════ PART A: 표·설정 ════════
alter table public.collection add column if not exists level smallint not null default 5 check (level between 1 and 100);
alter table public.collection add column if not exists exp int not null default 0;
alter table public.collection add column if not exists moves int[];
alter table public.collection add column if not exists learned int[] not null default '{}';
alter table public.collection add column if not exists held text;
alter table public.profiles add column if not exists battle_fair boolean not null default false;
alter table public.qr_points add column if not exists drop_item text;

-- 이미 잡은 몬스터: 단계에 맞춰 시작 레벨 (한 번만)
update public.collection c set level = case when l.rarity = 'legendary' then 40 when c.stage = 1 then 10 when c.stage = 2 then 25 else 40 end
  from public.lines l where l.id = c.line_id and c.level = 5 and c.exp = 0;

create table if not exists public.learnset (
  line_id int not null references public.lines on delete cascade,
  move_id int not null references public.moves on delete cascade,
  lv      smallint not null default 0,
  how     text not null check (how in ('level', 'tm')),
  primary key (line_id, move_id, how)
);
create table if not exists public.items (
  key         text primary key,
  name        text not null,
  pocket      text not null check (pocket in ('hold', 'med', 'tool', 'tm')),
  description text not null default '',
  effect      jsonb not null default '{}',
  drops       jsonb not null default '{}',     -- {"place": 가중치, "quiz": …, "battle": …, "practice": …, "raid": …}
  move_id     int references public.moves on delete set null,
  sort        int not null default 0
);
create table if not exists public.inventory (
  user_id uuid not null references public.profiles (user_id) on delete cascade on update cascade,   -- 계정 다시 연결(relink)에 따라감
  item    text not null references public.items on delete cascade,
  qty     int not null default 0 check (qty >= 0),
  primary key (user_id, item)
);
create table if not exists public.item_log (
  id      bigserial primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade on update cascade,
  item    text not null,
  qty     int not null,
  why     text not null,
  at      timestamptz not null default now()
);
create index if not exists item_log_user on public.item_log (user_id, id);

alter table public.learnset enable row level security;
alter table public.items enable row level security;
alter table public.inventory enable row level security;   -- 함수로만
alter table public.item_log enable row level security;    -- 함수로만
drop policy if exists catalog_read on public.learnset;
drop policy if exists catalog_read on public.items;
create policy catalog_read on public.learnset for select to authenticated using (true);
create policy catalog_read on public.items    for select to authenticated using (true);
drop policy if exists admin_write on public.items;
drop policy if exists admin_write on public.learnset;
create policy admin_write on public.items    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_write on public.learnset for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.settings (key, value) values
  ('lv_from_battle', 'true'), ('lv_from_raid', 'true'), ('lv_from_places', 'true'), ('lv_from_catch', 'true'),
  ('lv_places_n', '3'), ('raid_levels', '1'),
  ('exp_need_mul', '8'), ('exp_battle_mul', '4'), ('exp_practice', '0.5'), ('exp_lose', '0.4'),
  ('drop_place', '0.3'), ('drop_quiz', '0.4'), ('drop_battle', '0.5'), ('drop_practice', '0.15'), ('drop_raid_tm', '0.3'),
  ('battle_item_max', '2'), ('battle_field_mult', '1.3'), ('battle_turn_cap', '20'),
  ('battle_fields', '[{"from":"08:00","to":"10:00","name":"아침 조회","types":["국어","윤리"]},
                      {"from":"10:00","to":"12:00","name":"오전 수업","types":["수학","물리","화학"]},
                      {"from":"12:00","to":"13:30","name":"점심시간","types":["음악","체육"]},
                      {"from":"13:30","to":"16:00","name":"오후 수업","types":["영어","외국어","역사"]},
                      {"from":"16:00","to":"18:30","name":"방과후","types":["정보","지구","생명"]},
                      {"from":"18:30","to":"23:00","name":"야간 자율학습","types":["지리","정치경제"]}]')
on conflict (key) do nothing;
update public.settings set value = '30' where key = 'battle_turn_sec' and value = '45';   -- 연구: 한 턴 20~35초가 적당

-- 하던 배틀은 상태 모양이 바뀌어서 이어 할 수 없다 → 취소 (기술 번호도 바뀜)
update public.battles set status = 'cancelled', deadline = null, updated_at = now() where status in ('active', 'invite');
delete from public.species_moves;
delete from public.moves;

-- ════════ PART B: 레벨·경험치·가방 도우미 ════════
create or replace function public._lv_on(k text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((public._setting(k))::boolean, true)
$$;

-- 경험치 주기 → 오른 레벨 수
create or replace function public._gain_exp(uid uuid, p_line int, amt int) returns int
language plpgsql security definer set search_path = '' as $$
declare c public.collection; lv int; ex int; need int; up int := 0; mul int := coalesce((public._setting('exp_need_mul'))::int, 8);
begin
  if amt is null or amt <= 0 then return 0; end if;
  select * into c from public.collection where user_id = uid and line_id = p_line for update;
  if not found or c.level >= 100 then return 0; end if;
  lv := c.level; ex := c.exp + amt;
  while lv < 100 loop
    need := mul * lv;
    exit when ex < need;
    ex := ex - need; lv := lv + 1; up := up + 1;
  end loop;
  if lv >= 100 then ex := 0; end if;
  update public.collection set level = lv, exp = ex, updated_at = now() where user_id = uid and line_id = p_line;
  return up;
end $$;

create or replace function public._add_levels(uid uuid, p_line int, n int) returns int
language plpgsql security definer set search_path = '' as $$
declare lv int;
begin
  update public.collection set level = least(100, level + n), exp = case when level + n >= 100 then 0 else exp end, updated_at = now()
   where user_id = uid and line_id = p_line and level < 100 returning level into lv;
  return lv;
end $$;

-- 새로 잡으면 시작 레벨, 같은 선생님을 또 잡으면 +1 (lv_from_catch)
create or replace function public._collection_growth() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.level = 5 then
      new.level := case when (select rarity from public.lines where id = new.line_id) = 'legendary' then 40
                        when new.stage = 2 then 20 when new.stage >= 3 then 35 else 5 end;
    end if;
  elsif new.catch_count > old.catch_count and new.level < 100 and public._lv_on('lv_from_catch') then
    new.level := least(100, new.level + (new.catch_count - old.catch_count));
    if new.level >= 100 then new.exp := 0; end if;
  end if;
  return new;
end $$;
drop trigger if exists collection_growth on public.collection;
create trigger collection_growth before insert or update on public.collection for each row execute function public._collection_growth();

-- 물건 주기 + 기록
create or replace function public._give_item(uid uuid, p_item text, n int, why text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_item is null or n <= 0 or not exists (select 1 from public.items where key = p_item) then return; end if;
  insert into public.inventory (user_id, item, qty) values (uid, p_item, n)
    on conflict (user_id, item) do update set qty = public.inventory.qty + excluded.qty;
  insert into public.item_log (user_id, item, qty, why) values (uid, p_item, n, why);
end $$;

-- 가중치로 물건 하나 고르기 (src = place/quiz/battle/practice/raid)
create or replace function public._roll_item(src text) returns text
language sql volatile security definer set search_path = '' as $$
  select key from public.items where coalesce((drops ->> src)::numeric, 0) > 0
   order by -ln(1 - random()) / (drops ->> src)::numeric limit 1
$$;

-- 배틀 팀 (없으면 레벨 높은 3마리)
create or replace function public._team_lines(uid uuid) returns int[]
language sql stable security definer set search_path = '' as $$
  select coalesce((select battle_team from public.profiles where user_id = uid and battle_team is not null),
                  (select array_agg(line_id) from (select line_id from public.collection where user_id = uid
                                                    order by level desc, stage desc, line_id limit 3) x))
$$;

-- 장소 QR 을 찍으면 (보통 티켓): 가끔 물건 + 오늘 서로 다른 장소 N 곳마다 배틀 팀 +1 레벨
create or replace function public._ticket_growth() returns trigger
language plpgsql security definer set search_path = '' as $$
declare qp public.qr_points; k text; n int; per int := greatest(1, coalesce((public._setting('lv_places_n'))::int, 3)); x int;
begin
  if new.special is not null then return new; end if;
  select * into qp from public.qr_points where id = new.qr_id;
  if random() < coalesce((public._setting('drop_place'))::numeric, 0.3) then
    k := case when qp.drop_item is not null and random() < 0.5 then qp.drop_item else public._roll_item('place') end;
    perform public._give_item(new.user_id, k, 1, 'place');
  end if;
  if public._lv_on('lv_from_places') and not exists (
       select 1 from public.tickets t where t.user_id = new.user_id and t.qr_id = new.qr_id and t.id <> new.id and t.special is null
          and (t.created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date) then
    select count(distinct qr_id) into n from public.tickets t where t.user_id = new.user_id and t.special is null
       and (t.created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date;
    if n > 0 and n % per = 0 then
      foreach x in array coalesce(public._team_lines(new.user_id), '{}') loop
        perform public._add_levels(new.user_id, x, 1);
      end loop;
      insert into public.item_log (user_id, item, qty, why) values (new.user_id, '_team_level', n, 'places');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ticket_growth on public.tickets;
create trigger ticket_growth after insert on public.tickets for each row execute function public._ticket_growth();

-- 퀴즈 정답: 가끔 물건
create or replace function public._quiz_growth() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.correct and old.answered_at is null and random() < coalesce((public._setting('drop_quiz'))::numeric, 0.4) then
    perform public._give_item(new.user_id, public._roll_item('quiz'), 1, 'quiz');
  end if;
  return new;
end $$;
drop trigger if exists quiz_growth on public.quiz_attempts;
create trigger quiz_growth after update on public.quiz_attempts for each row execute function public._quiz_growth();

-- 레이드가 끝나면: 충분히 탭한 참가자 → 쓴 몬스터 레벨 + (이기면) 이상한사탕, 가끔 특별 기술머신
create or replace function public._raid_growth() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record; minimum int := coalesce((public._setting('raid_min_taps'))::int, 1);
begin
  if old.status <> 'active' or new.status not in ('won', 'failed') then return new; end if;
  for p in select * from public.raid_players where raid_id = new.id and taps >= minimum loop
    if public._lv_on('lv_from_raid') and p.line_id is not null then
      perform public._add_levels(p.user_id, p.line_id, coalesce((public._setting('raid_levels'))::int, 1));
    end if;
    if new.status = 'won' then
      perform public._give_item(p.user_id, 'candy', 1, 'raid');
      if random() < coalesce((public._setting('drop_raid_tm'))::numeric, 0.3) then
        perform public._give_item(p.user_id, public._roll_item('raid'), 1, 'raid');
      end if;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists raid_growth on public.raids;
create trigger raid_growth after update of status on public.raids for each row execute function public._raid_growth();

-- 아는 기술 (기본 기술 ∪ 레벨로 배운 기술 ∪ 기술머신)
create or replace function public._known_moves(uid uuid, p_line int) returns int[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct m order by m), '{}') from (
    select sm.move_id m from public.collection c join public.species s on s.line_id = c.line_id and s.stage <= c.stage
      join public.species_moves sm on sm.species_id = s.id where c.user_id = uid and c.line_id = p_line
    union all
    select ls.move_id from public.collection c join public.learnset ls on ls.line_id = c.line_id and ls.how = 'level' and ls.lv <= c.level
     where c.user_id = uid and c.line_id = p_line
    union all
    select unnest(c.learned) from public.collection c where c.user_id = uid and c.line_id = p_line) x
   where exists (select 1 from public.moves where id = x.m)
$$;

-- 지금 쓰는 기술 4개 (고른 것 중 아는 것만, 없으면 지금 단계 기본 4개)
create or replace function public._cur_moves(uid uuid, p_line int) returns int[]
language plpgsql stable security definer set search_path = '' as $$
declare c public.collection; r int[]; k int[];
begin
  select * into c from public.collection where user_id = uid and line_id = p_line;
  if not found then return '{}'; end if;
  if c.moves is not null then
    k := public._known_moves(uid, p_line);
    r := array(select x from unnest(c.moves) with ordinality u(x, o) where x = any (k) order by o);
  end if;
  if coalesce(cardinality(r), 0) = 0 then
    r := array(select sm.move_id from public.species s join public.species_moves sm on sm.species_id = s.id
                where s.line_id = p_line and s.stage = c.stage order by sm.slot);
  end if;
  return r;
end $$;

-- ════════ PART C: 가방 함수 (학생) ════════
create or replace function public.bag_state(p_since bigint default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mul int := coalesce((public._setting('exp_need_mul'))::int, 8);
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('key', item, 'qty', qty)) from public.inventory where user_id = uid and qty > 0), '[]'),
    'box', coalesce((select jsonb_agg(jsonb_build_object('line', c.line_id, 'stage', c.stage, 'level', c.level, 'exp', c.exp,
                       'need', case when c.level >= 100 then 0 else mul * c.level end, 'held', c.held,
                       'moves', to_jsonb(public._cur_moves(uid, c.line_id)), 'known', to_jsonb(public._known_moves(uid, c.line_id)),
                       'learned', to_jsonb(c.learned)) order by c.line_id)
                     from public.collection c where c.user_id = uid), '[]'),
    'log', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'item', item, 'qty', qty, 'why', why, 'at', at) order by id)
                     from (select * from public.item_log where user_id = uid and id > coalesce(p_since, 0) order by id desc limit 20) x), '[]'),
    'last', (select coalesce(max(id), 0) from public.item_log where user_id = uid),
    'team', to_jsonb(public._team_lines(uid)),
    'fair', (select battle_fair from public.profiles where user_id = uid),
    'sources', jsonb_build_object('battle', public._lv_on('lv_from_battle'), 'raid', public._lv_on('lv_from_raid'),
                                  'places', public._lv_on('lv_from_places'), 'catch', public._lv_on('lv_from_catch'),
                                  'places_n', coalesce((public._setting('lv_places_n'))::int, 3)));
end $$;

-- 기술 4개 고르기 (1~4개, 겹치지 않게, 아는 기술만)
create or replace function public.bag_set_moves(p_line int, p_moves int[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); k int[];
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.collection where user_id = uid and line_id = p_line) then raise exception 'NO_MONSTER'; end if;
  if p_moves is null or cardinality(p_moves) not between 1 and 4
     or (select count(distinct x) from unnest(p_moves) x) <> cardinality(p_moves) then raise exception 'BAD_MOVES'; end if;
  k := public._known_moves(uid, p_line);
  if exists (select 1 from unnest(p_moves) x where not x = any (k)) then raise exception 'MOVE_NOT_KNOWN'; end if;
  update public.collection set moves = p_moves, updated_at = now() where user_id = uid and line_id = p_line;
  return jsonb_build_object('ok', true, 'moves', to_jsonb(public._cur_moves(uid, p_line)));
end $$;

-- 지닌 물건 바꾸기 (null = 빼기). 가방에서 꺼내 지니고, 빼면 가방으로
create or replace function public.bag_set_held(p_line int, p_item text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); c public.collection;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into c from public.collection where user_id = uid and line_id = p_line for update;
  if not found then raise exception 'NO_MONSTER'; end if;
  if p_item is not null then
    if not exists (select 1 from public.items where key = p_item and pocket = 'hold') then raise exception 'BAD_ITEM'; end if;
    update public.inventory set qty = qty - 1 where user_id = uid and item = p_item and qty > 0;
    if not found then raise exception 'NO_ITEM'; end if;
  end if;
  if c.held is not null then
    insert into public.inventory (user_id, item, qty) values (uid, c.held, 1)
      on conflict (user_id, item) do update set qty = public.inventory.qty + 1;
  end if;
  update public.collection set held = p_item, updated_at = now() where user_id = uid and line_id = p_line;
  return jsonb_build_object('ok', true, 'held', p_item);
end $$;

-- 도구 쓰기: 이상한사탕 (레벨 +1) / 기술머신 (배우기 → 그 몬스터의 기술 목록에 영원히, 기술머신은 한 번 쓰면 없어짐)
create or replace function public.bag_use(p_item text, p_line int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); it public.items; c public.collection; lv int;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into it from public.items where key = p_item;
  if not found then raise exception 'BAD_ITEM'; end if;
  if it.pocket = 'med' then raise exception 'BATTLE_ONLY'; end if;
  if it.pocket = 'hold' then raise exception 'HOLD_ITEM'; end if;
  select * into c from public.collection where user_id = uid and line_id = p_line for update;
  if not found then raise exception 'NO_MONSTER'; end if;
  if it.pocket = 'tool' and it.effect ? 'level' then
    if c.level >= 100 then raise exception 'MAX_LEVEL'; end if;
  elsif it.pocket = 'tm' then
    if it.move_id is null or not exists (select 1 from public.learnset where line_id = p_line and move_id = it.move_id and how = 'tm') then
      raise exception 'TM_NOT_COMPATIBLE';
    end if;
    if it.move_id = any (public._known_moves(uid, p_line)) then raise exception 'ALREADY_KNOWN'; end if;
  end if;
  update public.inventory set qty = qty - 1 where user_id = uid and item = p_item and qty > 0;
  if not found then raise exception 'NO_ITEM'; end if;
  if it.pocket = 'tool' then
    lv := public._add_levels(uid, p_line, (it.effect ->> 'level')::int);
    return jsonb_build_object('ok', true, 'level', lv);
  end if;
  update public.collection set learned = array_append(learned, it.move_id), updated_at = now() where user_id = uid and line_id = p_line;
  return jsonb_build_object('ok', true, 'learned', it.move_id);
end $$;

-- ════════ PART D: 배틀 엔진 ════════
-- 레벨 능력치 (L = 50 이면 _bt_stat 과 같음)
create or replace function public._bt_statl(b int, is_hp boolean, lv int) returns int
language sql immutable set search_path = '' as $$
  select (2 * coalesce(b, 50) + 31) * lv / 100 + case when is_hp then lv + 10 else 5 end
$$;

-- 마비: 스피드 ½ (요즘 세대 규칙)
create or replace function public._bt_eff(m jsonb, k text) returns numeric
language sql immutable set search_path = '' as $$
  select (m ->> k)::int * public._bt_sm(coalesce((m -> 'stg' ->> k)::int, 0))
         * case when k = 'spe' and m ->> 'st' = 'par' then 0.5 else 1 end
$$;

-- 같은 과 묶음 → 시너지 능력
create or replace function public._bt_group(t text) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when t in ('국어', '영어', '외국어') then '{"g": "언어", "stat": "spa", "name": "토론 대회"}'::jsonb
    when t in ('수학', '정보') then '{"g": "수리", "stat": "spe", "name": "코딩 동아리"}'::jsonb
    when t in ('물리', '화학', '생명', '지구') then '{"g": "과학", "stat": "def", "name": "실험실"}'::jsonb
    when t in ('지리', '정치경제', '윤리', '역사') then '{"g": "사회", "stat": "spd", "name": "모의 국회"}'::jsonb
    when t in ('체육', '음악') then '{"g": "예체능", "stat": "atk", "name": "체육 대회"}'::jsonb
  end
$$;

-- 지금 시각의 시간표 칸 (없으면 null)
create or replace function public._bt_field() returns jsonb
language sql stable security definer set search_path = '' as $$
  select f || jsonb_build_object('mult', coalesce((public._setting('battle_field_mult'))::numeric, 1.3))
    from jsonb_array_elements(coalesce(public._setting('battle_fields'), '[]'::jsonb)) f
   where (now() at time zone 'Asia/Seoul')::time >= (f ->> 'from')::time and (now() at time zone 'Asia/Seoul')::time < (f ->> 'to')::time
   limit 1
$$;

-- 몬스터 하나 (레벨·고른 기술·지닌 물건)
create or replace function public._bt_mon(p_sp int, p_lv int, p_moves int[], p_held text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sp', s.id, 'line', s.line_id, 'name', s.name, 'lv', p_lv,
    'type', coalesce(l.btype, case when l.subject = '비밀' then '전설' else l.subject end),
    'hp', public._bt_statl(s.hp, true, p_lv), 'max', public._bt_statl(s.hp, true, p_lv),
    'atk', public._bt_statl(s.atk, false, p_lv), 'def', public._bt_statl(s.def, false, p_lv), 'spa', public._bt_statl(s.spa, false, p_lv),
    'spd', public._bt_statl(s.spd, false, p_lv), 'spe', public._bt_statl(s.spe, false, p_lv),
    'moves', coalesce(
      (select jsonb_agg(jsonb_build_object('id', m.id, 'pp', m.pp) order by u.o) from unnest(p_moves) with ordinality u(x, o) join public.moves m on m.id = u.x),
      (select jsonb_agg(jsonb_build_object('id', m.id, 'pp', m.pp) order by sm.slot) from public.species_moves sm join public.moves m on m.id = sm.move_id
        where sm.species_id = s.id), '[]'),
    'held', it.key, 'hold', coalesce(it.effect, '{}'), 'heldname', it.name,
    'st', null, 'slp', 0, 'frz', 0, 'cnf', 0, 'rch', false, 'used', false, 'stg', '{}'::jsonb, 'prot', 0, 'out', false)
  from public.species s join public.lines l on l.id = s.line_id left join public.items it on it.key = p_held and it.pocket = 'hold'
  where s.id = p_sp
$$;

-- 자리에 나올 때: 랭크·혼란·방어 연속·반동 초기화 + 시너지 능력 +1
create or replace function public._bt_enter(m jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select m || jsonb_build_object('out', true, 'prot', 0, 'cnf', 0, 'rch', false,
                                 'stg', case when m ? 'syn' then jsonb_build_object(m ->> 'syn', 1) else '{}'::jsonb end)
$$;

drop function if exists public._bt_side(int[], text);
create or replace function public._bt_side(p_species int[], fmt text, uid uuid, p_lv int, p_fair boolean) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare mons jsonb := '[]'; x int; c public.collection; lv int; k int; g jsonb; sd jsonb; ln int;
begin
  foreach x in array p_species loop
    c := null;
    select line_id into ln from public.species where id = x;
    if uid is not null then select * into c from public.collection where user_id = uid and line_id = ln; end if;
    lv := case when p_fair then 50 when c.level is not null then c.level else coalesce(p_lv, 50) end;
    mons := mons || jsonb_build_array(public._bt_mon(x, lv, case when c.user_id is not null then public._cur_moves(uid, ln) end, c.held));
  end loop;
  for k in 0 .. jsonb_array_length(mons) - 1 loop
    g := public._bt_group(mons -> k ->> 'type');
    if g is not null and (select count(*) from jsonb_array_elements(mons) m where public._bt_group(m ->> 'type') ->> 'g' = g ->> 'g') >= 2 then
      mons := jsonb_set(mons, array[k::text], (mons -> k) || jsonb_build_object('syn', g ->> 'stat', 'synname', g ->> 'name'));
    end if;
  end loop;
  sd := jsonb_build_object('reflect', 0, 'light', 0, 'items', 0, 'uid', uid,
          'act', (select jsonb_agg(g2) from generate_series(0, least(case when fmt = 'double' then 2 else 1 end, cardinality(p_species)) - 1) g2),
          'mons', mons);
  for k in 0 .. jsonb_array_length(sd -> 'act') - 1 loop
    sd := jsonb_set(sd, array['mons', k::text], public._bt_enter(sd -> 'mons' -> k));
  end loop;
  return sd;
end $$;

-- 능력 랭크 (+ 회피율: 최대 +2 — 너무 안 맞으면 재미없어서)
create or replace function public._bt_stages(inout m jsonb, inout lg jsonb, ch jsonb, who text, u int)
language plpgsql immutable set search_path = '' as $$
declare k text; v int; cur int; nw int;
  nm jsonb := '{"atk": "공격", "def": "방어", "spa": "특수공격", "spd": "특수방어", "spe": "스피드", "acc": "명중률", "eva": "회피율"}';
begin
  for k, v in select key, value::int from jsonb_each_text(ch) loop
    if (m ->> 'hp')::int <= 0 then return; end if;
    cur := coalesce((m -> 'stg' ->> k)::int, 0);
    nw := greatest(-6, least(case when k = 'eva' then 2 else 6 end, cur + v));
    if nw = cur then
      lg := lg || jsonb_build_object('m', who || public._bt_j(nm ->> k, '은', '는') || case when v > 0 then ' 더 이상 올라가지 않는다!' else ' 더 이상 떨어지지 않는다!' end);
    else
      m := jsonb_set(m, array['stg', k], to_jsonb(nw));
      lg := lg || jsonb_build_object('m', who || public._bt_j(nm ->> k, '이', '가') || case
        when v >= 2 then ' 크게 올라갔다!' when v > 0 then ' 올라갔다!' when v <= -2 then ' 크게 떨어졌다!' else ' 떨어졌다!' end,
        'stat', jsonb_build_array(u, sign(v)::int));
    end if;
  end loop;
end $$;

-- 상태 이상 (par/brn/psn/slp/frz) + 혼란 (cnf, 따로 겹침). fx: [자리, 효과] → 폰이 상태 효과 그림
create or replace function public._bt_status(inout m jsonb, inout lg jsonb, inout ok boolean, stt text, who text, u int)
language plpgsql volatile set search_path = '' as $$
begin
  ok := false;
  if (m ->> 'hp')::int <= 0 then return; end if;
  if stt = 'cnf' then
    if coalesce((m ->> 'cnf')::int, 0) > 0 then return; end if;
    m := jsonb_set(m, '{cnf}', to_jsonb(2 + floor(random() * 4)::int));
    lg := lg || jsonb_build_object('m', public._bt_j(who, '은', '는') || ' 혼란에 빠졌다!', 'fx', jsonb_build_array(u, 'cnf'));
    ok := true; return;
  end if;
  if (m ->> 'st') is not null then return; end if;
  if m -> 'hold' ->> 'immune' = stt then
    lg := lg || jsonb_build_object('m', public._bt_j(who, '은', '는') || ' ' || (m ->> 'heldname') || ' 덕분에 멀쩡하다!');
    return;
  end if;
  m := m || jsonb_build_object('st', stt, 'slp', case when stt = 'slp' then 2 + floor(random() * 3)::int else 0 end,
                               'frz', case when stt = 'frz' then 3 else 0 end);
  lg := lg || jsonb_build_object('m', public._bt_j(who, '은', '는') || case stt
    when 'par' then ' 마비되어 기술이 나오기 어려워졌다!' when 'brn' then ' 화상을 입었다!'
    when 'psn' then ' 독에 걸렸다!' when 'frz' then ' 꽁꽁 얼어붙었다!' else ' 잠들어 버렸다!' end,
    'st', jsonb_build_array(u, stt), 'fx', jsonb_build_array(u, stt));
  ok := true;
end $$;

-- ───────── 기술 하나 쓰기 (u = 쓰는 자리, tu = 노리는 자리) ─────────
-- 0016 에서 바뀐 것: 레벨, 얼음(최대 2턴, 20%로 녹음, 화학 공격에 맞으면 녹음), 혼란(33% 자신을 공격), 풀죽음(먼저 맞으면),
-- 반동으로 쉬기(recharge), 회피율, 연속 공격(hits), 지닌 물건(타입 강화·명중·급소·초코우유·알람시계), 시간표 필드.
drop function if exists public._bt_move(jsonb, jsonb, jsonb, int, int, int);
create or replace function public._bt_move(inout st jsonb, inout lg jsonb, inout fl jsonb, u int, slot int, tu int)
language plpgsql volatile security definer set search_path = '' as $$
declare
  s int := u / 2; o int := 1 - u / 2; a jsonb; d jsonb; mv public.moves; e jsonb;
  an text; dn text; aw text; dw text;
  i int; pp int; mult numeric; crit boolean; ak text; dk text; at numeric; df numeric;
  dmg numeric; dh0 int; tmp int; chance int; ok boolean; sd jsonb; hits boolean; k int;
  nh int; j int; nhit int := 0; tot int := 0; pw numeric; lv int; acc numeric; endured boolean := false; fld jsonb := st -> 'field'; cs int;
begin
  a := public._bt_m(st, u);
  if a is null or (a ->> 'hp')::int <= 0 then return; end if;
  an := '@' || s || (a ->> 'name'); aw := public._bt_j(an, '은', '는');
  lv := coalesce((a ->> 'lv')::int, 50);
  if fl -> 'quick' ? u::text then
    lg := lg || jsonb_build_object('m', public._bt_j(an || '의 ' || (a ->> 'heldname'), '이', '가') || ' 울려서 먼저 움직였다!');
  end if;
  fl := jsonb_set(fl, array['moved', u::text], 'true');

  if coalesce((a ->> 'rch')::boolean, false) then
    lg := lg || jsonb_build_object('m', aw || ' 공격의 반동으로 움직일 수 없다!');
    a := a || '{"rch": false, "prot": 0}'; st := public._bt_setm(st, u, a); return;
  end if;
  if fl -> 'flinch' ? u::text then
    lg := lg || jsonb_build_object('m', aw || ' 풀이 죽어 기술을 쓸 수 없다!', 'fx', jsonb_build_array(u, 'flinch'));
    a := jsonb_set(a, '{prot}', '0'); st := public._bt_setm(st, u, a); return;
  end if;
  if a ->> 'st' = 'slp' then
    if (a ->> 'slp')::int > 1 then
      a := jsonb_set(a, '{slp}', to_jsonb((a ->> 'slp')::int - 1));
      lg := lg || jsonb_build_object('m', aw || ' 쿨쿨 잠들어 있다.', 'fx', jsonb_build_array(u, 'slp'));
      a := jsonb_set(a, '{prot}', '0'); st := public._bt_setm(st, u, a); return;
    end if;
    a := a || '{"st": null, "slp": 0}';
    lg := lg || jsonb_build_object('m', aw || ' 눈을 떴다!', 'st', jsonb_build_array(u, null));
  end if;
  if a ->> 'st' = 'frz' then
    if coalesce((a ->> 'frz')::int, 0) > 1 and random() >= 0.2 then
      a := jsonb_set(a, '{frz}', to_jsonb((a ->> 'frz')::int - 1));
      lg := lg || jsonb_build_object('m', aw || ' 꽁꽁 얼어 버려서 움직일 수 없다!', 'fx', jsonb_build_array(u, 'frz'));
      a := jsonb_set(a, '{prot}', '0'); st := public._bt_setm(st, u, a); return;
    end if;
    a := a || '{"st": null, "frz": 0}';
    lg := lg || jsonb_build_object('m', aw || ' 얼음 상태가 나았다!', 'st', jsonb_build_array(u, null));
  end if;
  if a ->> 'st' = 'par' and random() < 0.25 then
    lg := lg || jsonb_build_object('m', aw || ' 몸이 저려서 움직일 수 없다!', 'fx', jsonb_build_array(u, 'par'));
    a := jsonb_set(a, '{prot}', '0'); st := public._bt_setm(st, u, a); return;
  end if;
  if coalesce((a ->> 'cnf')::int, 0) > 0 then
    a := jsonb_set(a, '{cnf}', to_jsonb((a ->> 'cnf')::int - 1));
    if (a ->> 'cnf')::int = 0 then
      lg := lg || jsonb_build_object('m', aw || ' 혼란이 풀렸다!');
    else
      lg := lg || jsonb_build_object('m', aw || ' 혼란에 빠져 있다!', 'fx', jsonb_build_array(u, 'cnf'));
      if random() < 0.33 then
        tmp := floor(floor(floor(2 * lv / 5 + 2) * 40 * public._bt_eff(a, 'atk') / greatest(1, public._bt_eff(a, 'def'))) / 50)::int + 2;
        a := jsonb_set(jsonb_set(a, '{hp}', to_jsonb(greatest(0, (a ->> 'hp')::int - tmp))), '{prot}', '0');
        lg := lg || jsonb_build_object('m', '영문도 모른 채 자신을 공격했다!', 'hp', jsonb_build_array(u, (a ->> 'hp')::int), 'dmg', tmp);
        st := public._bt_setm(st, u, a);
        if (a ->> 'hp')::int <= 0 then lg := lg || jsonb_build_object('m', aw || ' 쓰러졌다!', 'faint', u); end if;
        return;
      end if;
    end if;
  end if;

  i := greatest(1, least(coalesce(slot, 1), jsonb_array_length(a -> 'moves')));
  if coalesce((a -> 'moves' -> (i - 1) ->> 'pp')::int, 0) <= 0 then
    select o2 into i from jsonb_array_elements(a -> 'moves') with ordinality x(v, o2) where (v ->> 'pp')::int > 0 order by o2 limit 1;
  end if;
  if i is null then
    mv.name := '발버둥'; mv.type := '보통'; mv.category := 'physical'; mv.kind := 'attack'; mv.power := 50;
    mv.accuracy := null; mv.priority := 0; mv.effect := '{"recoil": 4}';
    lg := lg || jsonb_build_object('m', aw || ' 쓸 수 있는 기술이 없다!');
  else
    select * into mv from public.moves where id = (a -> 'moves' -> (i - 1) ->> 'id')::int;
    pp := (a -> 'moves' -> (i - 1) ->> 'pp')::int;
    a := jsonb_set(a, array['moves', (i - 1)::text, 'pp'], to_jsonb(pp - 1));
  end if;
  e := coalesce(mv.effect, '{}');
  lg := lg || jsonb_build_object('m', an || '의 ' || mv.name || '!', 'use', jsonb_build_array(u, mv.type, mv.category));

  if e ? 'protect' or e ? 'endure' then
    if random() < power(0.5, coalesce((a ->> 'prot')::int, 0)) then
      a := jsonb_set(a, '{prot}', to_jsonb(coalesce((a ->> 'prot')::int, 0) + 1));
      fl := jsonb_set(fl, array[case when e ? 'protect' then 'prot' else 'end' end, u::text], 'true');
      lg := lg || jsonb_build_object('m', aw || case when e ? 'protect' then ' 방어 태세에 들어갔다!' else ' 버티기 태세에 들어갔다!' end);
    else
      a := jsonb_set(a, '{prot}', '0');
      lg := lg || jsonb_build_object('m', '그러나 실패했다!');
    end if;
    st := public._bt_setm(st, u, a); return;
  end if;
  a := jsonb_set(a, '{prot}', '0');

  -- 상대를 노리는 기술: 노린 자리가 비었으면 남은 상대로
  hits := mv.kind = 'attack' or e ? 'foe_status' or e ? 'foe';
  if hits then
    if tu is null or tu / 2 <> o or not public._bt_live(st, tu) then
      tu := null;
      for k in 0 .. 1 loop
        if public._bt_live(st, o * 2 + k) then tu := o * 2 + k; exit; end if;
      end loop;
    end if;
    if tu is null then
      lg := lg || jsonb_build_object('m', '그러나 상대가 없다!'); st := public._bt_setm(st, u, a); return;
    end if;
    d := public._bt_m(st, tu); dh0 := (d ->> 'hp')::int;
    dn := '@' || o || (d ->> 'name'); dw := public._bt_j(dn, '은', '는');
    if fl -> 'prot' ? tu::text then
      lg := lg || jsonb_build_object('m', dw || ' 공격으로부터 몸을 지켰다!'); st := public._bt_setm(st, u, a); return;
    end if;
    -- 명중: 기술 명중 × (내 명중 랭크 − 상대 회피 랭크) × 집중 안경
    if mv.accuracy is not null then
      acc := mv.accuracy * public._bt_sm(greatest(-6, least(6, coalesce((a -> 'stg' ->> 'acc')::int, 0) - coalesce((d -> 'stg' ->> 'eva')::int, 0))), true)
             * coalesce((a -> 'hold' ->> 'acc')::numeric / 100, 1);
      if random() * 100 >= acc then
        lg := lg || jsonb_build_object('m', case when mv.kind = 'attack' then '그러나 ' || an || '의 공격은 빗나갔다!' else '그러나 빗나갔다!' end);
        st := public._bt_setm(st, u, a); return;
      end if;
    end if;
  else
    tu := null;
  end if;

  if mv.kind = 'attack' then
    sd := st -> 'sides' -> o;
    if e ? 'break_screen' and ((sd ->> 'reflect')::int > 0 or (sd ->> 'light')::int > 0) then
      st := jsonb_set(jsonb_set(st, array['sides', o::text, 'reflect'], '0'), array['sides', o::text, 'light'], '0');
      sd := st -> 'sides' -> o;
      lg := lg || jsonb_build_object('m', '@' || o || '벽이 깨졌다!');
    end if;
    mult := public._bt_tm(mv.type, d ->> 'type');
    if mult = 0 then
      lg := lg || jsonb_build_object('m', dn || '에게는 효과가 없는 것 같다...'); st := public._bt_setm(st, u, a); return;
    end if;
    pw := mv.power * case when fld is not null and fld -> 'types' ? mv.type then (fld ->> 'mult')::numeric else 1 end
                   * case when a -> 'hold' ->> 'boost' = mv.type then 1.2 else 1 end;
    nh := case when not e ? 'hits' then 1 when (e ->> 'hits')::int in (2, 3) then (e ->> 'hits')::int
               else (array[2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5])[1 + floor(random() * 20)::int] end;
    cs := case when coalesce((e ->> 'high_crit')::boolean, false) then 1 else 0 end + coalesce((a -> 'hold' ->> 'crit')::int, 0);
    for j in 1 .. nh loop
      exit when (d ->> 'hp')::int <= 0;
      crit := coalesce((e ->> 'always_crit')::boolean, false) or random() < case cs when 0 then 0.0625 when 1 then 0.125 else 0.25 end;
      if mv.category = 'physical' then ak := 'atk'; dk := 'def'; else ak := 'spa'; dk := 'spd'; end if;
      tmp := coalesce((a -> 'stg' ->> ak)::int, 0);
      at := (a ->> ak)::int * public._bt_sm(case when crit then greatest(0, tmp) else tmp end);
      tmp := coalesce((d -> 'stg' ->> dk)::int, 0);
      df := (d ->> dk)::int * public._bt_sm(case when crit then least(0, tmp) else tmp end);
      dmg := floor(floor(floor(2 * lv / 5 + 2) * pw * floor(at) / greatest(1, floor(df))) / 50);
      if mv.category = 'physical' and a ->> 'st' = 'brn' then dmg := floor(dmg / 2); end if;
      if not crit and ((mv.category = 'physical' and (sd ->> 'reflect')::int > 0) or (mv.category = 'special' and (sd ->> 'light')::int > 0)) then
        dmg := floor(dmg / 2);
      end if;
      dmg := dmg + 2;
      if crit then dmg := dmg * 2; end if;
      dmg := floor(dmg * (85 + floor(random() * 16)) / 100);
      if mv.type = a ->> 'type' then dmg := floor(dmg * 1.5); end if;
      dmg := greatest(1, floor(dmg * mult));
      tmp := (d ->> 'hp')::int;
      if dmg >= tmp and fl -> 'end' ? tu::text then dmg := tmp - 1; endured := true; end if;
      dmg := least(dmg, tmp);
      d := jsonb_set(d, '{hp}', to_jsonb(tmp - dmg::int));
      tot := tot + dmg::int; nhit := nhit + 1;
      lg := lg || jsonb_build_object('hp', jsonb_build_array(tu, (d ->> 'hp')::int), 'dmg', dmg::int);
      if crit then lg := lg || jsonb_build_object('m', '급소에 맞았다!'); end if;
    end loop;
    if nh > 1 then lg := lg || jsonb_build_object('m', nhit || '번 맞았다!'); end if;
    if mult > 1 then lg := lg || jsonb_build_object('m', '효과가 굉장했다!');
    elsif mult < 1 then lg := lg || jsonb_build_object('m', '효과가 별로인 듯하다...'); end if;
    if endured then lg := lg || jsonb_build_object('m', dw || ' 공격을 버텼다!'); end if;
    -- 얼음: 화학(불꽃) 공격에 맞으면 녹는다
    if d ->> 'st' = 'frz' and mv.type = '화학' and (d ->> 'hp')::int > 0 then
      d := d || '{"st": null, "frz": 0}';
      lg := lg || jsonb_build_object('m', public._bt_j(dn || '의 얼음', '이', '가') || ' 녹았다!', 'st', jsonb_build_array(tu, null));
    end if;
    -- 초코우유: HP 절반 이하 → 한 번 회복
    if d -> 'hold' ? 'pinch_heal' and not coalesce((d ->> 'used')::boolean, false) and (d ->> 'hp')::int > 0
       and (d ->> 'hp')::int * 2 <= (d ->> 'max')::int then
      tmp := least((d ->> 'max')::int, (d ->> 'hp')::int + (d ->> 'max')::int * (d -> 'hold' ->> 'pinch_heal')::int / 100);
      d := d || jsonb_build_object('hp', tmp, 'used', true);
      lg := lg || jsonb_build_object('m', dw || ' ' || (d ->> 'heldname') || '를 마셨다! HP가 회복되었다!', 'hp', jsonb_build_array(tu, tmp), 'fx', jsonb_build_array(tu, 'heal'));
    end if;

    if e ? 'drain' and tot > 0 and (a ->> 'hp')::int < (a ->> 'max')::int then
      tmp := least((a ->> 'max')::int, (a ->> 'hp')::int + greatest(1, floor(tot * (e ->> 'drain')::int / 100)::int));
      a := jsonb_set(a, '{hp}', to_jsonb(tmp));
      lg := lg || jsonb_build_object('m', public._bt_j(dn, '으로', '로') || '부터 체력을 흡수했다!', 'hp', jsonb_build_array(u, tmp));
    end if;
    if e ? 'recoil' or e ? 'self_damage' then
      tmp := case when e ? 'recoil' then greatest(1, floor(tot / (e ->> 'recoil')::int)::int)
                  else greatest(1, (a ->> 'max')::int * (e ->> 'self_damage')::int / 100) end;
      a := jsonb_set(a, '{hp}', to_jsonb(greatest(0, (a ->> 'hp')::int - tmp)));
      lg := lg || jsonb_build_object('m', aw || ' 반동으로 데미지를 입었다!', 'hp', jsonb_build_array(u, (a ->> 'hp')::int));
    end if;
    if e ? 'recharge' then a := jsonb_set(a, '{rch}', 'true'); end if;
    chance := coalesce((e ->> 'chance')::int, 100);
    if (e ? 'foe_status' or e ? 'foe' or e ? 'self') and random() * 100 < chance then
      if e ? 'foe_status' then select * into d, lg, ok from public._bt_status(d, lg, false, e ->> 'foe_status', dn, tu); end if;
      if e ? 'foe' then select * into d, lg from public._bt_stages(d, lg, e -> 'foe', dn || '의 ', tu); end if;
      if e ? 'self' then select * into a, lg from public._bt_stages(a, lg, e -> 'self', an || '의 ', u); end if;
    end if;
    if e ? 'self_all_up' and random() * 100 < (e ->> 'self_all_up')::int then
      select * into a, lg from public._bt_stages(a, lg, '{"atk": 1, "def": 1, "spa": 1, "spd": 1, "spe": 1}', an || '의 ', u);
    end if;
    -- 풀죽음: 상대가 이번 턴에 아직 안 움직였으면
    if e ? 'flinch' and (d ->> 'hp')::int > 0 and not (fl -> 'moved' ? tu::text) and random() * 100 < (e ->> 'flinch')::int then
      fl := jsonb_set(fl, array['flinch', tu::text], 'true');
    end if;
  else
    ok := true;
    if e ? 'foe_status' then
      select * into d, lg, ok from public._bt_status(d, lg, false, e ->> 'foe_status', dn, tu);
      if not ok and not (e ? 'foe') then lg := lg || jsonb_build_object('m', '그러나 실패했다!'); end if;
    end if;
    if e ? 'foe' then select * into d, lg from public._bt_stages(d, lg, e -> 'foe', dn || '의 ', tu); end if;
    if e ? 'self' then select * into a, lg from public._bt_stages(a, lg, e -> 'self', an || '의 ', u); end if;
    if e ? 'screen' then
      if (st -> 'sides' -> s ->> (e ->> 'screen'))::int > 0 then
        lg := lg || jsonb_build_object('m', '그러나 실패했다!');
      else
        st := jsonb_set(st, array['sides', s::text, e ->> 'screen'], '5');
        lg := lg || jsonb_build_object('m', case when e ->> 'screen' = 'reflect' then '@' || s || '리플렉터로 물리 공격에 강해졌다!'
                                                   else '@' || s || '빛의장막으로 특수 공격에 강해졌다!' end);
      end if;
    end if;
    if e ? 'heal' then
      if (a ->> 'hp')::int >= (a ->> 'max')::int then
        lg := lg || jsonb_build_object('m', '그러나 ' || an || '의 HP는 가득 차 있다!');
      else
        tmp := least((a ->> 'max')::int, (a ->> 'hp')::int + greatest(1, (a ->> 'max')::int * (e ->> 'heal')::int / 100));
        a := jsonb_set(a, '{hp}', to_jsonb(tmp));
        lg := lg || jsonb_build_object('m', an || '의 체력이 회복되었다!', 'hp', jsonb_build_array(u, tmp), 'fx', jsonb_build_array(u, 'heal'));
      end if;
    end if;
    if e ? 'rest' then
      if (a ->> 'hp')::int >= (a ->> 'max')::int then
        lg := lg || jsonb_build_object('m', '그러나 실패했다!');
      else
        a := a || jsonb_build_object('hp', (a ->> 'max')::int, 'st', 'slp', 'slp', 3, 'frz', 0);
        lg := lg || jsonb_build_object('m', aw || ' 잠들어서 건강해졌다!', 'hp', jsonb_build_array(u, (a ->> 'max')::int), 'st', jsonb_build_array(u, 'slp'));
      end if;
    end if;
  end if;

  st := public._bt_setm(public._bt_setm(st, tu, d), u, a);
  if d is not null and (d ->> 'hp')::int <= 0 and dh0 > 0 then lg := lg || jsonb_build_object('m', dw || ' 쓰러졌다!', 'faint', tu); end if;
  if (a ->> 'hp')::int <= 0 then lg := lg || jsonb_build_object('m', aw || ' 쓰러졌다!', 'faint', u); end if;
end $$;

-- 교체: 자리 u 에 몬스터 idx (들어가는 몬스터는 랭크·혼란 초기화, 나오는 몬스터는 시너지 +1)
create or replace function public._bt_switch(inout st jsonb, inout lg jsonb, u int, idx int)
language plpgsql immutable set search_path = '' as $$
declare s int := u / 2; k int := u % 2; m jsonb; nw jsonb;
begin
  if idx is null or idx < 0 or idx >= jsonb_array_length(st -> 'sides' -> s -> 'mons')
     or jsonb_array_length(st -> 'sides' -> s -> 'act') <= k
     or (st -> 'sides' -> s -> 'act') @> to_jsonb(idx)
     or (st -> 'sides' -> s -> 'mons' -> idx ->> 'hp')::int <= 0 then return; end if;
  m := public._bt_m(st, u);
  if (m ->> 'hp')::int > 0 then lg := lg || jsonb_build_object('back', u, 'name', m ->> 'name'); end if;
  st := public._bt_setm(st, u, m || '{"stg": {}, "prot": 0, "cnf": 0, "rch": false}');
  st := jsonb_set(st, array['sides', s::text, 'act', k::text], to_jsonb(idx));
  nw := public._bt_enter(st -> 'sides' -> s -> 'mons' -> idx);
  st := jsonb_set(st, array['sides', s::text, 'mons', idx::text], nw);
  lg := lg || jsonb_build_object('sw', jsonb_build_array(u, idx), 'name', nw ->> 'name', 'sp', nw -> 'sp', 'lv', nw -> 'lv');
  if nw ? 'syn' then
    lg := lg || jsonb_build_object('m', '@' || s || (nw ->> 'name') || '의 ' || (nw ->> 'synname') || ' 시너지!', 'stat', jsonb_build_array(u, 1));
  end if;
end $$;

-- 회복약 쓰기 (자리 u 의 차례, 팀 번호 idx 에게). 가방에서 하나 줄어든다
create or replace function public._bt_item(inout st jsonb, inout lg jsonb, u int, p_key text, idx int)
language plpgsql volatile security definer set search_path = '' as $$
declare s int := u / 2; it public.items; m jsonb; uid uuid := (st -> 'sides' -> (u / 2) ->> 'uid')::uuid; who text; tmp int; k int; e jsonb; slot int;
begin
  select * into it from public.items where key = p_key and pocket = 'med';
  if not found or uid is null then return; end if;
  m := st -> 'sides' -> s -> 'mons' -> idx;
  if m is null then return; end if;
  update public.inventory set qty = qty - 1 where user_id = uid and item = p_key and qty > 0;
  if not found then lg := lg || jsonb_build_object('m', '@' || s || '가방에 ' || public._bt_j(it.name, '이', '가') || ' 없다!'); return; end if;
  st := jsonb_set(st, array['sides', s::text, 'items'], to_jsonb(coalesce((st -> 'sides' -> s ->> 'items')::int, 0) + 1));
  e := it.effect; who := '@' || s || (m ->> 'name');
  slot := null;
  for k in 0 .. jsonb_array_length(st -> 'sides' -> s -> 'act') - 1 loop
    if (st -> 'sides' -> s -> 'act' ->> k)::int = idx then slot := s * 2 + k; end if;
  end loop;
  lg := lg || jsonb_build_object('m', '@' || s || public._bt_j(it.name, '을', '를') || ' 사용했다!', 'item', jsonb_build_array(u, p_key));
  if e ? 'revive' then
    if (m ->> 'hp')::int > 0 then lg := lg || jsonb_build_object('m', '그러나 효과가 없었다!'); return; end if;
    m := m || jsonb_build_object('hp', greatest(1, (m ->> 'max')::int * (e ->> 'revive')::int / 100), 'st', null, 'slp', 0, 'frz', 0);
    lg := lg || jsonb_build_object('m', public._bt_j(who, '은', '는') || ' 다시 일어났다!');
  elsif (m ->> 'hp')::int <= 0 then
    lg := lg || jsonb_build_object('m', '그러나 효과가 없었다!'); return;
  else
    if e ? 'heal' and (m ->> 'hp')::int < (m ->> 'max')::int then
      tmp := least((m ->> 'max')::int, (m ->> 'hp')::int + greatest(1, (m ->> 'max')::int * (e ->> 'heal')::int / 100));
      m := jsonb_set(m, '{hp}', to_jsonb(tmp));
      lg := lg || jsonb_strip_nulls(jsonb_build_object('m', who || '의 체력이 회복되었다!', 'hp', case when slot is not null then jsonb_build_array(slot, tmp) end,
                                     'fx', case when slot is not null then jsonb_build_array(slot, 'heal') end));
    end if;
    if e ? 'cure' and ((m ->> 'st') is not null or coalesce((m ->> 'cnf')::int, 0) > 0) then
      m := m || '{"st": null, "slp": 0, "frz": 0, "cnf": 0}';
      lg := lg || case when slot is not null then jsonb_build_object('m', public._bt_j(who, '은', '는') || ' 건강해졌다!', 'st', jsonb_build_array(slot, null))
                       else jsonb_build_object('m', public._bt_j(who, '은', '는') || ' 건강해졌다!') end;
    end if;
    if e ? 'pp' then
      for k in 0 .. jsonb_array_length(m -> 'moves') - 1 loop
        m := jsonb_set(m, array['moves', k::text, 'pp'], to_jsonb(least(
               (select pp from public.moves where id = (m -> 'moves' -> k ->> 'id')::int),
               (m -> 'moves' -> k ->> 'pp')::int + (e ->> 'pp')::int)));
      end loop;
      lg := lg || jsonb_build_object('m', who || '의 PP가 회복되었다!');
    end if;
  end if;
  st := jsonb_set(st, array['sides', s::text, 'mons', idx::text], m);
end $$;

-- ───────── AI (0016 + 연속 공격·회피율·새 상태 이상) ─────────
-- 배틀 길이 (엔진을 옮긴 모의 실험 3000판): 회복·능력 올리기를 자주 하면 3 대 3 이 평균 13턴, 20턴 넘는 판 12% →
-- 회복은 HP 40% 아래에서 몬스터마다 2번까지 (쓴 PP 로 셈), 능력 올리기는 한 번만, 상태기 점수 조금 낮춤 → 평균 10턴 (중앙 9), 20턴 넘는 판 1%.
-- (연구: 3 대 3 은 6~10턴 · 3~4분이 알맞음 — 실제 포켓몬 배틀 스타디움/챔피언스 기준)
create or replace function public._bt_ai(st jsonb, u int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s int := u / 2; o int := 1 - u / 2;
  a jsonb := public._bt_m(st, u); d jsonb;
  mv public.moves; e jsonb; i int; k int; sc numeric; best numeric := -1; pick int := 1; tgt int := 0; est numeric; ratio numeric;
  hp numeric := (a ->> 'hp')::numeric / (a ->> 'max')::numeric; key text; first_k int; fld jsonb := st -> 'field';
begin
  first_k := case when public._bt_live(st, o * 2) then 0 else 1 end;
  for i in 1 .. jsonb_array_length(a -> 'moves') loop
    continue when (a -> 'moves' -> (i - 1) ->> 'pp')::int <= 0;
    select * into mv from public.moves where id = (a -> 'moves' -> (i - 1) ->> 'id')::int;
    continue when not found;
    e := mv.effect;
    for k in 0 .. 1 loop
      continue when not public._bt_live(st, o * 2 + k);
      continue when not (mv.kind = 'attack' or e ? 'foe_status' or e ? 'foe') and k <> first_k;
      d := public._bt_m(st, o * 2 + k);
      sc := 0;
      if mv.kind = 'attack' then
        ratio := case when mv.category = 'physical' then public._bt_eff(a, 'atk') / greatest(1, public._bt_eff(d, 'def'))
                      else public._bt_eff(a, 'spa') / greatest(1, public._bt_eff(d, 'spd')) end;
        est := ((2 * coalesce((a ->> 'lv')::int, 50) / 5 + 2) * mv.power * ratio / 50 + 2) * public._bt_tm(mv.type, d ->> 'type')
               * case when mv.type = a ->> 'type' then 1.5 else 1 end * coalesce(mv.accuracy, 100) / 100.0 * 0.925
               * case when mv.category = 'physical' and a ->> 'st' = 'brn' then 0.5 else 1 end
               * case when e ? 'hits' then case when (e ->> 'hits')::int in (2, 3) then (e ->> 'hits')::int else 3.1 end else 1 end
               * case when fld is not null and fld -> 'types' ? mv.type then (fld ->> 'mult')::numeric else 1 end
               * case when a -> 'hold' ->> 'boost' = mv.type then 1.2 else 1 end
               * case when mv.accuracy is null then 1 else public._bt_sm(-coalesce((d -> 'stg' ->> 'eva')::int, 0), true) end;
        sc := est / greatest(1, (d ->> 'hp')::int) * 100;
        if est >= (d ->> 'hp')::int then sc := sc + 100 + mv.priority * 40; end if;
        if e ? 'recoil' or e ? 'self_damage' then sc := sc * 0.85; end if;
        if e ? 'recharge' and est < (d ->> 'hp')::int then sc := sc * 0.6; end if;
      elsif e ? 'foe_status' then
        sc := case when e ->> 'foe_status' = 'cnf' then case when coalesce((d ->> 'cnf')::int, 0) = 0 then 35 else 0 end
                   when d ->> 'st' is null then case when e ->> 'foe_status' in ('slp', 'frz') then 55 else 45 end else 0 end
              * coalesce(mv.accuracy, 100) / 100.0;
      elsif e ? 'heal' or e ? 'rest' then
        sc := case when hp < (case when e ? 'rest' then 0.3 else 0.4 end) and mv.pp - (a -> 'moves' -> (i - 1) ->> 'pp')::int < 2 then 60 else 0 end;
      elsif e ? 'protect' or e ? 'endure' then sc := case when (a ->> 'prot')::int > 0 then 0 else 10 end;
      elsif e ? 'screen' then sc := case when (st -> 'sides' -> s ->> (e ->> 'screen'))::int > 0 then 0 else 20 end;
      elsif e ? 'self' then
        sc := case when hp > 0.6 then 25 else 3 end;
        for key in select jsonb_object_keys(e -> 'self') loop
          if coalesce((a -> 'stg' ->> key)::int, 0) >= 1 then sc := 3; end if;
        end loop;
      elsif e ? 'foe' then
        sc := 20;
        for key in select jsonb_object_keys(e -> 'foe') loop
          if coalesce((d -> 'stg' ->> key)::int, 0) <= -1 then sc := 2; end if;
        end loop;
      end if;
      sc := sc * (0.75 + random() * 0.5);
      if sc > best then best := sc; pick := i; tgt := k; end if;
    end loop;
  end loop;
  return jsonb_build_object('move', pick, 'target', tgt);
end $$;

-- ───────── 한 턴 (acts = {"0": [자리0, 자리1], "1": [...]}) ─────────
create or replace function public._bt_turn(inout st jsonb, acts jsonb, out lg jsonb)
language plpgsql volatile security definer set search_path = '' as $$
declare
  fl jsonb := '{"prot": {}, "end": {}, "moved": {}, "flinch": {}, "quick": {}}'; s int; u int; a jsonb; ord int[]; m jsonb; mid int; dmg int;
  key text; n int; q int; rows jsonb := '[]';
begin
  lg := '[]';
  st := jsonb_set(st, '{turn}', to_jsonb(coalesce((st ->> 'turn')::int, 0) + 1));
  -- 1) 교체 → 2) 회복약
  for u in 0 .. 3 loop
    a := acts -> (u / 2)::text -> (u % 2);
    if a ? 'switch' then select * into st, lg from public._bt_switch(st, lg, u, (a ->> 'switch')::int); end if;
  end loop;
  for u in 0 .. 3 loop
    a := acts -> (u / 2)::text -> (u % 2);
    if a ? 'item' and public._bt_m(st, u) is not null then
      select * into st, lg from public._bt_item(st, lg, u, a ->> 'item', (a ->> 'target')::int);
    end if;
  end loop;
  -- 3) 기술 순서: 선공 → 알람시계 → 스피드 → 동전
  for u in 0 .. 3 loop
    a := acts -> (u / 2)::text -> (u % 2);
    if a ? 'move' and public._bt_live(st, u) then
      m := public._bt_m(st, u);
      mid := (m -> 'moves' -> ((a ->> 'move')::int - 1) ->> 'id')::int;
      q := case when m -> 'hold' ? 'quick' and random() * 100 < (m -> 'hold' ->> 'quick')::int then 1 else 0 end;
      if q = 1 then fl := jsonb_set(fl, array['quick', u::text], 'true'); end if;
      rows := rows || jsonb_build_object('u', u, 'p', coalesce((select priority from public.moves where id = mid), 0), 'q', q,
                                         'sp', public._bt_eff(m, 'spe'), 'r', random());
    end if;
  end loop;
  select coalesce(array_agg((x ->> 'u')::int order by (x ->> 'p')::int desc, (x ->> 'q')::int desc, (x ->> 'sp')::numeric desc, (x ->> 'r')::numeric), '{}')
    into ord from jsonb_array_elements(rows) x;
  foreach u in array ord loop
    a := acts -> (u / 2)::text -> (u % 2);
    select * into st, lg, fl from public._bt_move(st, lg, fl, u, (a ->> 'move')::int,
      case when a ? 'target' then (1 - u / 2) * 2 + least(1, greatest(0, (a ->> 'target')::int)) end);
  end loop;
  -- 4) 턴 끝: 화상·독, 방석, 벽 줄이기
  for u in 0 .. 3 loop
    m := public._bt_m(st, u);
    if m is not null and (m ->> 'hp')::int > 0 and m ->> 'st' in ('brn', 'psn') then
      dmg := greatest(1, (m ->> 'max')::int / 8);
      m := jsonb_set(m, '{hp}', to_jsonb(greatest(0, (m ->> 'hp')::int - dmg)));
      st := public._bt_setm(st, u, m);
      lg := lg || jsonb_build_object('m', public._bt_j('@' || (u / 2) || (m ->> 'name'), '은', '는')
                 || case when m ->> 'st' = 'brn' then ' 화상 데미지를 입고 있다!' else ' 독의 데미지를 입고 있다!' end,
                 'hp', jsonb_build_array(u, (m ->> 'hp')::int), 'fx', jsonb_build_array(u, m ->> 'st'));
      if (m ->> 'hp')::int <= 0 then
        lg := lg || jsonb_build_object('m', public._bt_j('@' || (u / 2) || (m ->> 'name'), '은', '는') || ' 쓰러졌다!', 'faint', u);
      end if;
    end if;
    if m is not null and (m ->> 'hp')::int > 0 and m -> 'hold' ? 'leftovers' and (m ->> 'hp')::int < (m ->> 'max')::int then
      m := jsonb_set(m, '{hp}', to_jsonb(least((m ->> 'max')::int, (m ->> 'hp')::int + greatest(1, (m ->> 'max')::int / (m -> 'hold' ->> 'leftovers')::int))));
      st := public._bt_setm(st, u, m);
      lg := lg || jsonb_build_object('m', public._bt_j('@' || (u / 2) || (m ->> 'name'), '은', '는') || ' ' || (m ->> 'heldname') || ' 덕분에 조금 회복했다!',
                                     'hp', jsonb_build_array(u, (m ->> 'hp')::int));
    end if;
  end loop;
  for s in 0 .. 1 loop
    foreach key in array array['reflect', 'light'] loop
      n := (st -> 'sides' -> s ->> key)::int;
      if n > 0 then
        st := jsonb_set(st, array['sides', s::text, key], to_jsonb(n - 1));
        if n = 1 then lg := lg || jsonb_build_object('m', '@' || s || case when key = 'reflect' then '리플렉터' else '빛의장막' end || '의 효과가 사라졌다!'); end if;
      end if;
    end loop;
  end loop;
end $$;

-- 고른 것이 다 모이면 턴을 푼다 (0016 + 턴 제한: battle_turn_cap 을 넘으면 남은 HP 비율이 높은 쪽 승리)
create or replace function public._bt_resolve(bid bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.battles; st jsonb; lg jsonb := '[]'; s int; u int; need int[] := '{}'; a0 int; a1 int; nxt int;
  ai_side boolean; bench int[]; slots int[]; r0 numeric; r1 numeric; cap int := coalesce((public._setting('battle_turn_cap'))::int, 20);
begin
  select * into b from public.battles where id = bid for update;
  if b.status <> 'active' then return; end if;
  st := b.state;
  if b.phase = 'choose' then
    select * into st, lg from public._bt_turn(st, b.acts);
  else
    for u in select (x)::int from jsonb_array_elements_text(st -> 'need') x loop
      select * into st, lg from public._bt_switch(st, lg, u, (b.acts -> (u / 2)::text -> (u % 2) ->> 'switch')::int);
    end loop;
  end if;
  st := st - 'need';
  a0 := public._bt_alive(st, 0); a1 := public._bt_alive(st, 1);
  if a0 > 0 and a1 > 0 and coalesce((st ->> 'turn')::int, 0) >= cap and b.phase = 'choose' then
    select sum((m ->> 'hp')::numeric) / sum((m ->> 'max')::numeric) into r0 from jsonb_array_elements(st -> 'sides' -> 0 -> 'mons') m;
    select sum((m ->> 'hp')::numeric) / sum((m ->> 'max')::numeric) into r1 from jsonb_array_elements(st -> 'sides' -> 1 -> 'mons') m;
    lg := lg || jsonb_build_object('m', cap || '턴이 지났다! 남은 체력으로 승부를 가린다!');
    update public.battles set state = st, log = lg, seq = seq + 1, acts = '{}', updated_at = now() where id = bid;
    perform public._bt_finish(bid, (case when r0 > r1 then 0 when r1 > r0 then 1 end)::smallint);
    return;
  end if;
  if a0 = 0 or a1 = 0 then
    update public.battles set state = st, log = lg, seq = seq + 1, acts = '{}', updated_at = now() where id = bid;
    perform public._bt_finish(bid, (case when a0 = 0 and a1 = 0 then null when a0 = 0 then 1 else 0 end)::smallint);
    return;
  end if;
  for s in 0 .. 1 loop
    slots := array(select s * 2 + g from generate_series(0, jsonb_array_length(st -> 'sides' -> s -> 'act') - 1) g
                    where not public._bt_live(st, s * 2 + g));
    continue when cardinality(slots) = 0;
    bench := public._bt_bench(st, s);
    continue when cardinality(bench) = 0;
    ai_side := s = 1 and b.mode <> 'pvp';
    if ai_side or cardinality(bench) <= cardinality(slots) then
      foreach u in array slots loop
        bench := public._bt_bench(st, s);
        exit when cardinality(bench) = 0;
        nxt := case when ai_side then public._bt_ai_next(st, u) else bench[1] end;
        select * into st, lg from public._bt_switch(st, lg, u, nxt);
      end loop;
    else
      need := need || slots;
    end if;
  end loop;
  if cardinality(need) > 0 then st := st || jsonb_build_object('need', to_jsonb(need)); end if;
  update public.battles set state = st, log = lg, seq = seq + 1, acts = '{}', updated_at = now(),
         phase = case when cardinality(need) > 0 then 'replace' else 'choose' end,
         deadline = case when mode = 'pvp' then now() + make_interval(secs => coalesce((public._setting('battle_turn_sec'))::int, 30)) end
   where id = bid;
end $$;

-- 끝: 진화권 (0015 그대로) + 경험치 (나온 몬스터마다, 2턴 이상) + 이기면 가끔 물건
create or replace function public._bt_finish(bid bigint, w smallint) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.battles; uid uuid; v_opp uuid; rw jsonb; n int; v_day date := (now() at time zone 'Asia/Seoul')::date;
  turns int; s int; pu uuid; m jsonb; foe_lv numeric; base numeric; up int; ex jsonb; exps jsonb := '{}'; its jsonb := '{}'; k text; won boolean;
  pdrop numeric;
begin
  select * into b from public.battles where id = bid for update;
  if b.status <> 'active' then return; end if;
  rw := jsonb_build_object('ticket', false);
  if w is not null then
    uid := case when w = 0 then b.p1 when b.mode = 'pvp' then b.p2 end;
    v_opp := case when w = 0 then b.p2 else b.p1 end;
    if uid is null then rw := jsonb_build_object('ticket', false, 'why', 'lost');
    elsif b.mode = 'cpu' or v_opp is null then rw := jsonb_build_object('ticket', false, 'why', 'practice');
    elsif exists (select 1 from public.battle_rewards r where r.user_id = uid and r.opp = v_opp and r.day = v_day) then
      rw := jsonb_build_object('ticket', false, 'why', 'same_opp');
    else
      select count(*) into n from public.battle_rewards r where r.user_id = uid and r.day = v_day;
      if n >= coalesce((public._setting('battle_daily_max'))::int, 3) then
        rw := jsonb_build_object('ticket', false, 'why', 'daily_max');
      else
        insert into public.battle_rewards (user_id, opp, day, battle_id) values (uid, v_opp, v_day, bid);
        update public.profiles set evo_tickets = evo_tickets + 1, battle_wins = battle_wins + 1, battle_wins_at = now() where user_id = uid;
        rw := jsonb_build_object('ticket', true, 'today', n + 1);
        insert into public.events (kind, data) values ('battle_won', jsonb_build_object('battle', bid, 'mode', b.mode));
      end if;
    end if;
  end if;
  turns := coalesce((b.state ->> 'turn')::int, 0);
  -- (plpgsql: IF 조건 안의 CASE … THEN 은 IF 의 THEN 으로 잘못 읽힌다 → 미리 계산)
  pdrop := case when b.mode = 'cpu' then coalesce((public._setting('drop_practice'))::numeric, 0.15)
                else coalesce((public._setting('drop_battle'))::numeric, 0.5) end;
  for s in 0 .. 1 loop
    pu := case when s = 0 then b.p1 when b.mode = 'pvp' then b.p2 end;
    continue when pu is null or turns < 2;
    won := w is not null and w = s;
    if public._lv_on('lv_from_battle') then
      select avg((x ->> 'lv')::numeric) into foe_lv from jsonb_array_elements(b.state -> 'sides' -> (1 - s) -> 'mons') x;
      base := coalesce((public._setting('exp_battle_mul'))::numeric, 4) * coalesce(foe_lv, 50)
              * (case b.mode when 'cpu' then coalesce((public._setting('exp_practice'))::numeric, 0.5) when 'pvp' then 1.5 else 1 end)
              * (case when won then 1 else coalesce((public._setting('exp_lose'))::numeric, 0.4) end);
      ex := '[]';
      for m in select x from jsonb_array_elements(b.state -> 'sides' -> s -> 'mons') x where coalesce((x ->> 'out')::boolean, false) loop
        up := public._gain_exp(pu, (m ->> 'line')::int, round(base)::int);
        ex := ex || jsonb_build_object('line', (m ->> 'line')::int, 'name', m ->> 'name', 'exp', round(base)::int, 'up', up,
                                       'lv', (select level from public.collection where user_id = pu and line_id = (m ->> 'line')::int));
      end loop;
      exps := exps || jsonb_build_object(s::text, ex);
    end if;
    if won and random() < pdrop then
      k := public._roll_item(case when b.mode = 'cpu' then 'practice' else 'battle' end);
      if k is not null then
        perform public._give_item(pu, k, 1, 'battle');
        its := its || jsonb_build_object(s::text, k);
      end if;
    end if;
  end loop;
  rw := rw || jsonb_build_object('exp', exps, 'item', its);
  update public.battles set status = 'over', winner = w, reward = rw, deadline = null, updated_at = now() where id = bid;
end $$;

-- 폰에 보내는 모양 (0016 + 레벨·시너지·필드·공정 모드·남은 회복약 수). 상대의 지닌 물건·기술은 안 보임
create or replace function public._bt_json(b public.battles, uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me int := case when uid = b.p1 then 0 else 1 end; sides jsonb := '[]'; s int; sd jsonb;
begin
  if b.status in ('active', 'over') then
    for s in 0 .. 1 loop
      sd := b.state -> 'sides' -> s;
      if s = me then
        sides := sides || jsonb_build_array((sd - 'uid') || jsonb_build_object('active', sd -> 'act' -> 0));
      else
        sides := sides || jsonb_build_array(jsonb_build_object(
          'act', sd -> 'act', 'active', sd -> 'act' -> 0, 'reflect', sd -> 'reflect', 'light', sd -> 'light',
          'mons', (select jsonb_agg(case when (sd -> 'act') @> to_jsonb((o - 1)::int)
                                         then jsonb_build_object('sp', x -> 'sp', 'name', x ->> 'name', 'type', x ->> 'type', 'lv', x -> 'lv', 'hp', x -> 'hp',
                                                                 'max', x -> 'max', 'st', x -> 'st', 'cnf', x -> 'cnf', 'stg', x -> 'stg', 'syn', x -> 'syn',
                                                                 'synname', x -> 'synname', 'seen', true)
                                         else jsonb_build_object('hp', x -> 'hp', 'max', x -> 'max') end order by o)
                   from jsonb_array_elements(sd -> 'mons') with ordinality y(x, o))));
      end if;
    end loop;
  end if;
  return jsonb_build_object(
    'id', b.id, 'mode', b.mode, 'format', b.format, 'status', b.status, 'phase', b.phase, 'turn', coalesce((b.state ->> 'turn')::int, 0),
    'seq', b.seq, 'me', me, 'log', b.log, 'sides', sides, 'winner', b.winner, 'reward', b.reward,
    'field', b.state -> 'field', 'fair', coalesce((b.state ->> 'fair')::boolean, false),
    'items_left', case when coalesce((b.state ->> 'fair')::boolean, false) then 0
                       else greatest(0, coalesce((public._setting('battle_item_max'))::int, 2) - coalesce((b.state -> 'sides' -> me ->> 'items')::int, 0)) end,
    'turn_cap', coalesce((public._setting('battle_turn_cap'))::int, 20),
    'need', b.phase = 'replace' and (coalesce(b.state -> 'need', '[]') @> to_jsonb(me * 2) or coalesce(b.state -> 'need', '[]') @> to_jsonb(me * 2 + 1)),
    'need_slots', coalesce((select jsonb_agg((x)::int - me * 2) from jsonb_array_elements_text(b.state -> 'need') x where (x)::int / 2 = me), '[]'),
    'chosen', b.acts ? me::text, 'deadline', b.deadline, 'server_time', now(),
    'names', jsonb_build_array(
      (select public._display_name(p) from public.profiles p where p.user_id = b.p1),
      case when b.mode = 'cpu' then '연습 상대' else (select public._display_name(p) from public.profiles p where p.user_id = b.p2) end));
end $$;

drop function if exists public._bt_new(uuid, text, uuid, int[], int[], text);
create or replace function public._bt_new(uid uuid, p_mode text, opp uuid, s0 int[], s1 int[], fmt text, p_fair boolean, p_cpu_lv int) returns public.battles
language plpgsql security definer set search_path = '' as $$
declare b public.battles;
begin
  insert into public.battles (mode, format, p1, p2, state, deadline)
  values (p_mode, fmt, uid, opp,
          jsonb_build_object('turn', 0, 'fmt', fmt, 'fair', p_fair, 'field', public._bt_field(),
            'sides', jsonb_build_array(public._bt_side(s0, fmt, uid, null, p_fair),
                                       public._bt_side(s1, fmt, case when p_mode = 'cpu' then null else opp end, p_cpu_lv, p_fair))),
          case when p_mode = 'pvp' then now() + make_interval(secs => coalesce((public._setting('battle_turn_sec'))::int, 30)) end)
  returning * into b;
  return b;
end $$;

-- 내 배틀 QR: 형식 + 공정 모드 (모두 Lv.50, 회복약 금지) 를 QR 보여주는 사람이 정한다
drop function if exists public.battle_code(text);
create or replace function public.battle_code(p_format text default null, p_fair boolean default null) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); c text;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_format is not null then
    if p_format not in ('single', 'double') then raise exception 'BAD_FORMAT'; end if;
    update public.profiles set battle_format = p_format where user_id = uid;
  end if;
  if p_fair is not null then update public.profiles set battle_fair = p_fair where user_id = uid; end if;
  select battle_code into c from public.profiles where user_id = uid;
  if c is null then
    loop
      c := public._rand(8, 'abcdefghjkmnpqrstuvwxyz23456789');
      exit when not exists (select 1 from public.profiles where battle_code = c);
    end loop;
    update public.profiles set battle_code = c where user_id = uid;
  end if;
  return c;
end $$;

create or replace function public.battle_peek(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare fr uuid := public._bt_by_code(p_code); p public.profiles;
begin
  select * into p from public.profiles where user_id = fr;
  return jsonb_build_object('name', public._display_name(p), 'format', p.battle_format, 'fair', p.battle_fair);
end $$;

create or replace function public.battle_today() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('wins', (select count(*) from public.battle_rewards
                                     where user_id = auth.uid() and day = (now() at time zone 'Asia/Seoul')::date),
                            'max', coalesce((public._setting('battle_daily_max'))::int, 3),
                            'code', (select battle_code from public.profiles where user_id = auth.uid()),
                            'format', (select battle_format from public.profiles where user_id = auth.uid()),
                            'fair', (select battle_fair from public.profiles where user_id = auth.uid()),
                            'team', (select battle_team from public.profiles where user_id = auth.uid()),
                            'field', public._bt_field())
$$;

-- 연습 배틀: 상대 레벨 = 내 팀 평균 레벨
create or replace function public.battle_start_cpu(p_lines int[], p_format text default 'single') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); mine int[]; foe int[] := '{}'; used int[]; x int; y int; fmt text := coalesce(p_format, 'single');
  b public.battles; lv int;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  if fmt not in ('single', 'double') then raise exception 'BAD_FORMAT'; end if;
  perform public._assert_open();
  perform public._bt_no_pvp(uid);
  mine := public._bt_team(uid, p_lines, public._bt_nmax(fmt));
  used := p_lines;
  foreach x in array mine loop
    select s.id into y from public.species s join public.lines l on l.id = s.line_id
     where l.active and not l.withdrawn and not l.secret and not l.bonus and l.rarity <> 'legendary'
       and s.stage = (select stage from public.species where id = x) and s.line_id <> all (used)
     order by random() limit 1;
    if y is null then raise exception 'BAD_TEAM'; end if;
    foe := foe || y; used := used || ((y - 1) / 3 + 1);
  end loop;
  select round(avg(level))::int into lv from public.collection where user_id = uid and line_id = any (p_lines);
  perform public._bt_close_mine(uid);
  b := public._bt_new(uid, 'cpu', null, mine, foe, fmt, false, coalesce(lv, 50));
  return public._bt_json(b, uid);
end $$;

-- 친구 팀 vs AI (형식·공정 모드 = 친구가 QR 에서 고른 것, 친구 몬스터는 친구 레벨)
create or replace function public.battle_start_team(p_code text, p_lines int[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); fr uuid; mine int[]; foe int[]; b public.battles; fmt text; fair boolean;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._assert_open();
  fr := public._bt_by_code(p_code);
  select battle_format, battle_fair into fmt, fair from public.profiles where user_id = fr;
  mine := public._bt_team(uid, p_lines, public._bt_nmax(fmt));
  perform public._bt_no_pvp(uid);
  foe := public._bt_friend_team(fr, public._bt_nmax(fmt));
  if coalesce(cardinality(foe), 0) = 0 then raise exception 'FRIEND_NO_MONSTERS'; end if;
  perform public._bt_close_mine(uid);
  b := public._bt_new(uid, 'team', fr, mine, foe, fmt, coalesce(fair, false), null);
  return public._bt_json(b, uid);
end $$;

-- 실시간 대전 신청 (형식·공정 모드 = QR 을 보여준 친구가 고른 것)
create or replace function public.battle_challenge(p_code text, p_lines int[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); fr uuid; mine int[]; b public.battles; fmt text; fair boolean;
begin
  if uid is null or not exists (select 1 from public.profiles where user_id = uid) then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._assert_open();
  fr := public._bt_by_code(p_code);
  select battle_format, coalesce(battle_fair, false) into fmt, fair from public.profiles where user_id = fr;
  mine := public._bt_team(uid, p_lines, public._bt_nmax(fmt));
  perform public._bt_no_pvp(uid);
  if exists (select 1 from public.battles where mode = 'pvp' and status = 'active' and (p1 = fr or p2 = fr)) then raise exception 'FRIEND_BUSY'; end if;
  perform public._bt_close_mine(uid);
  insert into public.battles (mode, format, status, p1, p2, state, deadline)
  values ('pvp', fmt, 'invite', uid, fr,
          jsonb_build_object('turn', 0, 'fmt', fmt, 'fair', fair, 'field', public._bt_field(),
                             'sides', jsonb_build_array(public._bt_side(mine, fmt, uid, null, fair))),
          now() + make_interval(secs => coalesce((public._setting('battle_invite_sec'))::int, 60)))
  returning * into b;
  return public._bt_json(b, uid);
end $$;

create or replace function public.battle_accept(p_id bigint, p_lines int[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); b public.battles; mine int[];
begin
  perform public._bt_timeout(p_id);
  select * into b from public.battles where id = p_id and p2 = uid and mode = 'pvp' for update;
  if not found then raise exception 'BATTLE_NOT_FOUND'; end if;
  if b.status <> 'invite' then raise exception 'BATTLE_INVITE_GONE'; end if;
  mine := public._bt_team(uid, p_lines, public._bt_nmax(b.format));
  perform public._bt_no_pvp(uid);
  perform public._bt_close_mine(uid);
  update public.battles set status = 'active', updated_at = now(),
         state = jsonb_set(state, '{sides}', (state -> 'sides')
                 || jsonb_build_array(public._bt_side(mine, b.format, uid, null, coalesce((b.state ->> 'fair')::boolean, false)))),
         deadline = now() + make_interval(secs => coalesce((public._setting('battle_turn_sec'))::int, 30))
   where id = p_id returning * into b;
  return public._bt_json(b, uid);
end $$;

-- 고르기. 1 대 1: {"move": 1~4} | {"switch": i} | {"item": key, "target": 팀 번호}.  2 대 2: {"slots": [자리0, 자리1]}
create or replace function public.battle_act(p_id bigint, p_action jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); b public.battles; me int; m jsonb; i int; k int; u int; v jsonb; a jsonb; outp jsonb := '[]';
  used int[] := '{}'; v_acts jsonb; ready boolean; nact int; sd jsonb; it public.items; nit int := 0; want jsonb := '{}';
begin
  b := public._bt_mine(p_id);
  perform public._bt_timeout(p_id);
  select * into b from public.battles where id = p_id for update;
  if b.status <> 'active' then return public._bt_json(b, uid); end if;
  me := case when uid = b.p1 then 0 else 1 end;
  if b.acts ? me::text then raise exception 'BATTLE_WAIT'; end if;
  sd := b.state -> 'sides' -> me;
  nact := jsonb_array_length(sd -> 'act');
  v := case when p_action ? 'slots' and jsonb_typeof(p_action -> 'slots') = 'array' then p_action -> 'slots' else jsonb_build_array(p_action) end;
  if b.phase = 'replace' and not (coalesce(b.state -> 'need', '[]') @> to_jsonb(me * 2) or coalesce(b.state -> 'need', '[]') @> to_jsonb(me * 2 + 1)) then
    raise exception 'BATTLE_WAIT';
  end if;
  for k in 0 .. nact - 1 loop
    u := me * 2 + k;
    a := v -> k;
    if (b.phase = 'choose' and not public._bt_live(b.state, u))
       or (b.phase = 'replace' and not (b.state -> 'need') @> to_jsonb(u)) then
      outp := outp || jsonb_build_array(null); continue;
    end if;
    if a is null or jsonb_typeof(a) <> 'object' then raise exception 'BAD_ACTION'; end if;
    if a ? 'switch' then
      i := (a ->> 'switch')::int;
      if i is null or i < 0 or i >= jsonb_array_length(sd -> 'mons') or (sd -> 'act') @> to_jsonb(i) or i = any (used)
         or (sd -> 'mons' -> i ->> 'hp')::int <= 0 then raise exception 'BAD_ACTION'; end if;
      used := used || i;
      outp := outp || jsonb_build_array(jsonb_build_object('switch', i));
    elsif a ? 'item' and b.phase = 'choose' then
      if coalesce((b.state ->> 'fair')::boolean, false) then raise exception 'NO_ITEMS_FAIR'; end if;
      nit := nit + 1;
      if coalesce((sd ->> 'items')::int, 0) + nit > coalesce((public._setting('battle_item_max'))::int, 2) then raise exception 'ITEM_LIMIT'; end if;
      select * into it from public.items where key = a ->> 'item' and pocket = 'med';
      if not found then raise exception 'BAD_ACTION'; end if;
      want := want || jsonb_build_object(it.key, coalesce((want ->> it.key)::int, 0) + 1);
      if coalesce((select qty from public.inventory where user_id = uid and item = it.key), 0) < (want ->> it.key)::int then raise exception 'NO_ITEM'; end if;
      i := (a ->> 'target')::int;
      if i is null or i < 0 or i >= jsonb_array_length(sd -> 'mons') then raise exception 'BAD_ACTION'; end if;
      if (it.effect ? 'revive') <> ((sd -> 'mons' -> i ->> 'hp')::int <= 0) then raise exception 'BAD_TARGET'; end if;
      outp := outp || jsonb_build_array(jsonb_build_object('item', it.key, 'target', i));
    elsif a ? 'move' and b.phase = 'choose' then
      m := public._bt_m(b.state, u);
      i := (a ->> 'move')::int;
      if i is null or i < 1 or i > jsonb_array_length(m -> 'moves') then raise exception 'BAD_ACTION'; end if;
      if (m -> 'moves' -> (i - 1) ->> 'pp')::int <= 0
         and exists (select 1 from jsonb_array_elements(m -> 'moves') x where (x ->> 'pp')::int > 0) then raise exception 'NO_PP'; end if;
      outp := outp || jsonb_build_array(jsonb_build_object('move', i, 'target', least(1, greatest(0, coalesce((a ->> 'target')::int, 0)))));
    else
      raise exception 'BAD_ACTION';
    end if;
  end loop;
  v_acts := b.acts || jsonb_build_object(me::text, outp);
  if b.mode <> 'pvp' and b.phase = 'choose' then v_acts := v_acts || jsonb_build_object('1', public._bt_ai_side(b.state, 1)); end if;
  ready := case when b.phase = 'choose' then v_acts ? '0' and v_acts ? '1'
                else not exists (select 1 from jsonb_array_elements_text(b.state -> 'need') x where not v_acts ? ((x)::int / 2)::text) end;
  update public.battles set acts = v_acts, updated_at = now() where id = p_id;
  if ready then perform public._bt_resolve(p_id); end if;
  return public._bt_json(public._bt_mine(p_id), uid);
end $$;

-- ════════ PART F: 운영자 도구 (물건 주기 · 레벨 정하기) ════════
create or replace function public.admin_give_item(p_student_id text, p_item text, p_qty int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  perform public._assert_admin();
  select user_id into uid from public.profiles where student_id = p_student_id;
  if uid is null then raise exception 'NO_STUDENT'; end if;
  if not exists (select 1 from public.items where key = p_item) then raise exception 'BAD_ITEM'; end if;
  if p_qty is null or p_qty not between 1 and 99 then raise exception 'BAD_QTY'; end if;
  perform public._give_item(uid, p_item, p_qty, 'admin');
  return jsonb_build_object('ok', true, 'qty', (select qty from public.inventory where user_id = uid and item = p_item));
end $$;

create or replace function public.admin_set_level(p_student_id text, p_line int, p_level int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  perform public._assert_admin();
  select user_id into uid from public.profiles where student_id = p_student_id;
  if uid is null then raise exception 'NO_STUDENT'; end if;
  if p_level is null or p_level not between 1 and 100 then raise exception 'BAD_LEVEL'; end if;
  update public.collection set level = p_level, exp = 0, updated_at = now() where user_id = uid and line_id = p_line;
  if not found then raise exception 'NO_MONSTER'; end if;
  return jsonb_build_object('ok', true, 'level', p_level);
end $$;

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
  public.screen_raids(),
  public.battle_code(text, boolean), public.battle_peek(text), public.battle_set_team(int[]), public.battle_start_cpu(int[], text),
  public.battle_start_team(text, int[]), public.battle_challenge(text, int[]), public.battle_inbox(), public.battle_accept(bigint, int[]),
  public.battle_decline(bigint), public.battle_state(bigint), public.battle_act(bigint, jsonb), public.battle_forfeit(bigint), public.battle_today(),
  public.battle_recent(),
  public.bag_state(bigint), public.bag_set_moves(int, int[]), public.bag_set_held(int, text), public.bag_use(text, int),
  public.admin_create_qr(text, text, text, text), public.admin_rotate_qr(text, boolean), public.admin_cancel_ticket(text),
  public.admin_set_role(text, text), public.admin_adjust_tickets(text, int), public.admin_unlink(text), public.admin_stats(),
  public.admin_make_login_codes(text[], text[]), public.admin_export_ranking(), public.admin_relink(text, text),
  public.admin_grant_monster(text, int, int), public.admin_set_in_ranking(text, boolean), public.admin_list_staff(),
  public.admin_invite_staff(text, text), public.admin_remove_staff(text), public.admin_list_requests(),
  public.admin_decide_reset(bigint, boolean), public.admin_set_inquiry(bigint, boolean),
  public.admin_create_raid(int, int, int, boolean, text, text), public.admin_end_raid(bigint), public.admin_list_raids(),
  public.admin_delete_students(text[], text), public.admin_count_students(),
  public.admin_create_staff_login(text, text, text), public.admin_reset_staff_password(text),
  public.admin_list_staff_logins(), public.admin_remove_staff_login(text),
  public.admin_game_stats(), public.admin_give_item(text, text, int), public.admin_set_level(text, int, int)
to authenticated;
