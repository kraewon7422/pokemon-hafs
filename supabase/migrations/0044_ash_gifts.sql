-- 0044 이벤트 포켓몬 (이상한 소포로만): 지우개굴닌자 (No.810, 계열 441, 종 1321) · 지우의 피카츄 (No.811, 계열 442, 종 1324).
--  - 자료는 tools/gen_pokemon.py 의 EVENT (seed_pokemon.sql 에도 같은 줄 → seed 를 다시 돌려도 남음). 이 파일 = .work/ash/build_0044.py 가 seed 에서 뽑음.
--  - 계열: subject '야생' · rarity legendary · bonus true · legend_src 'gift'. 그래서
--      · 야생 (QR · 걸음 · _wild_line / _wild_line_zone · 사파리) = not bonus · legend_src is null 에서 빠짐
--      · 알 (egg_hatch) · 연습 배틀 상대 (battle_start_cpu) = not bonus / legendary 에서 빠짐, 메타몽 변신 (_ditto_roll) = legendary · legend_src
--      · 방랑 (legend_src 'roam') · 레이드 · 도감 보상 · 시간대 전설 = 운영자가 정한 계열만 → 안 나옴, 룰렛 = 진화의 돌만
--      · 학교 도감 (도감 완성 · 빛나는 부적 · 50/100% 보상) = subject <> '야생' → 안 셈. 앱 전국 도감 수도 bonus 라서 안 셈 (도감 끝 '이벤트' 칸에 보임)
--  - 운영자: '전설·소포' 탭 → 소포 만들기 → 포켓몬 · 도감 번호 810 / 811 (이벤트 포켓몬 단추). 받으면 알림 "이상한 소포가 도착했다! … 소포 안에 ○○가 들어 있었어요!"
--  - 함수를 새로 만들지 않음 → revoke/grant 블록 없음 (다른 migration 의 함수 권한을 건드리지 않음).
--  - 그림: node tools/upload_pokemon_sprites.mjs 1321,1324 (앱은 web/sprites/pk-*.webp 그림판을 씀).


-- 특성 유대변화 (지우개굴닌자)
insert into public.abilities (key, name, description) values ('battle-bond', '유대변화', '상대를 쓰러뜨리면 트레이너와의 유대감이 깊어져서 지우개굴닌자로 변한다. 물수리검이 강해진다.') on conflict (key) do update set name = excluded.name, description = excluded.description;

-- 계열
insert into public.lines (id, teacher, subject, rarity, active, max_stage, btype, bonus, mythic, secret, ultra, legend_src) values (441, '이벤트 포켓몬', '야생', 'legendary', true, 1, '물/악', true, false, false, false, 'gift'), (442, '이벤트 포켓몬', '야생', 'legendary', true, 1, '전기', true, false, false, false, 'gift') on conflict (id) do update set teacher = excluded.teacher, subject = excluded.subject, rarity = excluded.rarity, max_stage = excluded.max_stage, btype = excluded.btype, bonus = true, mythic = false, secret = false, ultra = false, legend_src = excluded.legend_src;

-- 종
insert into public.species (id, line_id, stage, name, category, flavor, height, weight, btype, hp, atk, def, spa, spd, spe, dex, evo_lv, evo_item, abilities, hidden_ability) values
 (1321, 441, 1, '지우개굴닌자', '닌자포켓몬', '트레이너와의 유대가 깊어져 모습이 바뀐 개굴닌자. 등에 커다란 물수리검을 짊어지고, 트레이너와 같은 것을 보고 같은 것을 느끼며 싸운다.', '1.5m', '40kg', '물/악', 72, 145, 67, 153, 71, 132, 810, null, false, array['battle-bond']::text[], null),
 (1324, 442, 1, '지우의 피카츄', '쥐포켓몬', '오랜 여행을 함께한 트레이너의 모자를 쓴 피카츄. 몬스터볼에 들어가는 것을 싫어하고, 늘 트레이너의 어깨 위에 있다. 진화하지 않는다.', '0.4m', '6kg', '전기', 35, 55, 40, 50, 50, 90, 811, null, false, array['static']::text[], 'lightning-rod')
on conflict (id) do update set line_id = excluded.line_id, stage = excluded.stage, name = excluded.name, category = excluded.category, flavor = excluded.flavor, height = excluded.height, weight = excluded.weight, btype = excluded.btype, hp = excluded.hp, atk = excluded.atk, def = excluded.def, spa = excluded.spa, spd = excluded.spd, spe = excluded.spe, dex = excluded.dex, evo_lv = excluded.evo_lv, evo_item = excluded.evo_item, abilities = excluded.abilities, hidden_ability = excluded.hidden_ability;

-- 처음 기술 4개 · 배우는 기술
insert into public.species_moves (species_id, slot, move_id) values (1321, 1, 59), (1321, 2, 66), (1321, 3, 62), (1321, 4, 231), (1324, 1, 92), (1324, 2, 113), (1324, 3, 26), (1324, 4, 93)
on conflict (species_id, slot) do update set move_id = excluded.move_id;
insert into public.learnset (line_id, move_id, lv, how) values
(441, 169, 56, 'level'),
(441, 62, 77, 'level'),
(441, 1, 1, 'level'),
(441, 180, 14, 'level'),
(441, 231, 1, 'level'),
(441, 61, 33, 'level'),
(441, 72, 49, 'level'),
(441, 66, 1, 'level'),
(441, 73, 23, 'level'),
(441, 172, 19, 'level'),
(441, 114, 1, 'level'),
(441, 113, 8, 'level'),
(441, 59, 1, 'level'),
(441, 60, 68, 'level'),
(441, 230, 10, 'level'),
(441, 47, 0, 'tm'),
(441, 59, 0, 'tm'),
(441, 14, 0, 'tm'),
(441, 66, 0, 'tm'),
(441, 141, 0, 'tm'),
(441, 169, 0, 'tm'),
(441, 150, 0, 'tm'),
(441, 164, 0, 'tm'),
(441, 161, 0, 'tm'),
(441, 162, 0, 'tm'),
(441, 124, 0, 'tm'),
(442, 92, 42, 'level'),
(442, 118, 45, 'level'),
(442, 169, 23, 'level'),
(442, 115, 1, 'level'),
(442, 193, 34, 'level'),
(442, 93, 58, 'level'),
(442, 145, 53, 'level'),
(442, 87, 26, 'level'),
(442, 26, 1, 'level'),
(442, 89, 50, 'level'),
(442, 114, 5, 'level'),
(442, 113, 10, 'level'),
(442, 90, 1, 'level'),
(442, 121, 18, 'level'),
(442, 89, 0, 'tm'),
(442, 92, 0, 'tm'),
(442, 141, 0, 'tm'),
(442, 169, 0, 'tm'),
(442, 118, 0, 'tm'),
(442, 150, 0, 'tm'),
(442, 145, 0, 'tm'),
(442, 164, 0, 'tm'),
(442, 121, 0, 'tm'),
(442, 124, 0, 'tm')
on conflict (line_id, move_id, how) do update set lv = excluded.lv;

