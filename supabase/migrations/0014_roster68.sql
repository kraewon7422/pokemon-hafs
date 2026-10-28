-- 0014: 선생님 명단에 맞춰 계열 68개 (선생님 1명 = 계열 1개) + 배틀 타입 15개.
--  · 데이터: 계열 43~76 = seed.sql ('명단에 맞춰 늘린 계열' 블록, tools/gen_roster_sql.py), 타입·상성(×2/×0.5/×0)·기술 157개·능력치 =
--    seed_battle.sql (tools/gen_battle_data.py). lines.btype = 배틀 타입 (과학 → 물리·화학·생명·지구, 사회 → 지리·정치경제·윤리, 한국사 → 역사).
--  · 여기서는 레이드 탭당 데미지가 과목(subject) 대신 배틀 타입(btype)을 쓰도록만 바꾼다.

create or replace function public._raid_per_tap(uid uuid, line int, boss int) returns int
language plpgsql stable security definer set search_path = '' as $$
declare a public.species; b public.species; at text; bt text; m numeric := 1; atk int; def int;
begin
  if line is null then return 3; end if;
  select s.* into a from public.collection c join public.species s on s.line_id = c.line_id and s.stage = c.stage
   where c.user_id = uid and c.line_id = line;
  if not found then return 3; end if;
  select * into b from public.species where id = boss;
  select coalesce(btype, case when subject = '비밀' then '전설' else subject end) into at from public.lines where id = a.line_id;
  select coalesce(btype, case when subject = '비밀' then '전설' else subject end) into bt from public.lines where id = b.line_id;
  select coalesce((select mult from public.type_chart where type_chart.atk = at and type_chart.def = bt), 1) into m;
  if coalesce(a.atk, 0) >= coalesce(a.spa, 0) then
    atk := floor((2 * coalesce(a.atk, 50) + 31) / 2) + 5; def := floor((2 * coalesce(b.def, 50) + 31) / 2) + 5;
  else
    atk := floor((2 * coalesce(a.spa, 50) + 31) / 2) + 5; def := floor((2 * coalesce(b.spd, 50) + 31) / 2) + 5;
  end if;
  return greatest(1, round(10.0 * atk / greatest(def, 1) * m));   -- 효과 없음(×0)이어도 탭당 1은 들어간다
end $$;

revoke execute on function public._raid_per_tap(uuid, int, int) from public, anon, authenticated;
