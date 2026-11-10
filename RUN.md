# RUN.md — 실행 · 테스트 · 배포 가이드

## 폴더 구조
```
web/                 ← 배포되는 정적 사이트 (빌드 없음)
  index.html         학생 앱 (홈·지도·[QR 찍기]·도감·랭킹, ⚙ 설정)
  booth.html         메인 부스 (가방 QR → 몬스터 지급)
  screen.html        대형 TV (TOP 10 · 획득 피드 · 전설 QR)
  admin.html         운영자 (현황판 · QR 관리/인쇄 · 몬스터/퀴즈 · 학생 · 로그인 코드 · 설정)
  s/index.html       장소 QR 주소(/s#ID.TOKEN) → 앱으로 넘김
  js/  css/  vendor/  fonts/  sprites/atlas.png  img/  icons/  sw.js  manifest.webmanifest
supabase/
  migrations/0001~0058       DB 구조 + 보안 규칙 + 서버 함수 (번호 순서대로 실행)
  seed.sql                   데모 데이터 (임시 몬스터 34라인 + 전설·비밀·탐구 전설, QR)
  seed_battle.sql            배틀 데이터 (상성·기술·능력치·배틀 타입) — seed.sql 다음에 실행. 손으로 고치지 말고 `python tools/gen_battle_data.py` 로 다시 만들기
  (계열 목록 = tools/roster.py. 43~76 계열 SQL = `python tools/gen_roster_sql.py` → seed.sql 의 '명단에 맞춰 늘린 계열' 블록)
tests/rpc_test.mjs           서버 규칙 자동 테스트 (2026-11 마지막 전체 실행 1002개)
tools/pixelize.py            AI 그림 → 64x64 도트
tools/build_atlas.py         art/sprites/*.png → web/sprites/atlas.png (그림 없는 칸은 코드로 그림, 77~82 야자 전설·환상 포함, --count 244). 축제 중 그림 교체는 운영자 페이지 '그림 올리기' (0031) 로 — 아틀라스를 다시 만들 필요 없음
web/img/map.webp             학교 지도 (숲속 캠퍼스 항공 지도 그림, 90° 회전). 건물 이름표는 dex.js MAP_LABELS, 핀은 운영자 페이지 QR 관리
tools/draw_map.py            예전 도트 지도(v1) → tools/map_v1.png
docs/DESIGN.md               설계 (먼저 읽기)
```

## 내 컴퓨터에서 실행
```bash
cd web
python -m http.server 8124
# 브라우저: http://localhost:8124/          (학생)
#           http://localhost:8124/booth.html (부스)
#           http://localhost:8124/screen.html (TV)
#           http://localhost:8124/admin.html (운영자)
```
개발용 테스트 로그인 (테스트 서버 전용 — `CONFIG.DEV_LOGIN = true`이고 서버 설정 `dev_login = true`일 때만):
로그인 화면 맨 아래 "▸ 개발용 테스트 로그인"을 펼치고 **아무 이메일**(예: `test1`)을 넣으면 계정이 만들어진다. 비밀번호는 **`1234abcd!` 고정**.
미리 있는 계정: 학생 `022901@test.local` ~ (테스트 학생은 각 기수 900번대 — 실제 학생 001~400 과 안 겹치게, 테스트가 없으면 만듦), 부스 `booth1@staff.test`, 운영자 `admin@staff.test` (비밀번호 같음). 서버 테스트는 `tests/.env`의 `TEST_PASSWORD=1234abcd!`.

## 서버 테스트
```bash
node tests/rpc_test.mjs        # → "… passed, 0 failed" (failed 0 이어야 함, 2026-11 기준 1002 passed) (tests/.env 필요: PROGRESS.md §4)
```
테스트용 학생 4명(022901~022903, 021904)의 기록을 지우고 다시 만든다. 실전 프로젝트에 절대 돌리지 말 것.

## 몬스터 그림 넣기
```bash
python tools/pixelize.py 원본.png art/sprites/12-1.png --stage 1 --preview   # 파일 이름 = 라인번호-단계
# Piskel(https://www.piskelapp.com)에서 얼굴만 다듬기
python tools/build_atlas.py                                                   # web/sprites/atlas.png 갱신
```
**그림 파일 이름 = `라인번호-단계.png`** (예: 12번 쌤 1단계 = `12-1.png`, 교장 전설(학사쟈) = `36-1.png`, 교감 전설(금관오스) = `35-1.png`, 비밀 몬스터(숨바꼬치) = `37-1.png`). 운영자 페이지 → 몬스터·퀴즈의 각 카드에 '그림 파일' 이름이 적혀 있어요. 앱에 보이는 도감 번호(No.001~)와는 다르니 그 번호로 저장하지 마세요. 선생님 원본 사진은 `art-src/`에 (git 제외).
그림을 바꾸면 `web/sw.js`의 `VERSION`을 올려야 학생 폰에 반영된다.

## 실전(축제) 프로젝트 만들 때 체크리스트
1. Supabase 새 프로젝트 (서울) → 데이터베이스 순서 (지금 파일 기준, README '실전 서버 만들기' 와 같음): `0001`→`0020` → 바로 `seed_battle.sql` → `0021`→`0039` → `seed_pokemon.sql` (0038 의 열 · 0039 의 특성 표를 쓰므로 0039 다음에만 됨) → `select count(*) from lines where ultra;` 가 0 이면 0038 의 울트라 · 전설 표시 update 두 줄을 다시 실행 → `0040`→`0058` → `seed_pokemon.sql` 한 번 더 (끝에서 `_forms_build()` 로 선생님 폼 · 일반 폼을 만듦, 여러 번 돌려도 안전) → `node tools/upload_pokemon_sprites.mjs` (실제 서버는 SUPA_URL · SUPA_KEY · ADMIN_EMAIL · ADMIN_PASSWORD, 103·106·1321·1324 포함) — 모두 사람이 없을 때. ⚠️ 이 순서는 파일 내용으로 맞춘 것이고 빈 데이터베이스에서 처음부터 돌려 본 적은 아직 없음 → 실전 전에 빈 프로젝트에서 한 번 돌려 볼 것. 실제 몬스터/퀴즈/QR은 운영자 페이지에서 입력 (seed.sql은 쓰지 않음).
2. **첫 운영자 아이디 만들기** (0018): Supabase → SQL Editor 에서 `select public.bootstrap_staff('admin1', 'admin');` → 나온 `password` 로 운영자 페이지의 "아이디로 로그인". 나머지 운영진·부스 아이디는 운영자 페이지 → 운영진 탭에서 만들기 (비밀번호는 한 번만 보임). 이 함수는 앱·웹에서는 실행할 수 없음
   - 구글 계정이 있는 운영진은 `settings`의 `admin_emails`, `booth_emails` 에 이메일을 넣어도 됨. **`dev_login`은 false 그대로** (0008 기본값)
3. Authentication → Providers → Google 켜기 (Google Cloud OAuth 클라이언트 ID/Secret), Site URL/Redirect URL에 배포 주소
4. Authentication → Rate Limits 올리기 (학교 와이파이 = IP 하나). JWT 만료 시간 늘리기
5. `web/js/config.js`: `SUPABASE_URL/KEY`를 실전 값으로, `GOOGLE_CLIENT_ID` 입력, **`DEV_LOGIN: false`**
6. 학교 전산 담당: Google Workspace 관리 콘솔에서 이 OAuth 앱 허용 (18세 미만 계정 차단 해제)
7. `web/sw.js` `VERSION` 올리고 배포 (Cloudflare Pages, 아래)
8. 축제 전날: 프로젝트가 잠자기 상태가 아닌지 확인, 백업(`supabase db dump`), 부스 기기 로그인 확인

## 배포 (Cloudflare Pages — 무료, 비공개 저장소 OK)
1. dash.cloudflare.com 가입 → Workers & Pages → Create → Pages → Connect to Git → `pokemon-hafs` 선택
2. Build command: 비움 · Build output directory: `web` · Production branch: `main`
3. 배포 주소(예: `https://hafs-mon.pages.dev`)가 정해지면 **그 주소로 QR을 인쇄**한다 (나중에 바꾸면 QR 전부 재인쇄)
4. Supabase → Authentication → URL Configuration: Site URL / Redirect URLs에 그 주소 추가
5. 앱 파일을 바꿀 때마다 `web/sw.js`의 `VERSION`을 올려야 학생 폰이 새 버전을 받는다
   (오래된 폰에 "업데이트" 배너를 띄우려면 `web/js/config.js`의 `VERSION`과 설정 `min_client_version`을 함께 올림)

## 0038 전설 · 소포 확인 (스테이징)
- 서버: `node tests/rpc_test.mjs` → [45] (알림 · 퀘스트 · 방랑 · 소포 · 울트라비스트 · 메타몽 · 사파리 정리). 시험 동안 `ditto_disguise_chance` 는 0 (끝에서 되돌림).
- 화면: `cd web && python -m http.server 8138` → 임시 학생(0205xx)으로 로그인해 소포 코드 · 전설 · 메타몽 화면을 폰(375) · 320 · PC 크기에서 확인
  → 끝나면 `node .work/pokemon/ui_prep38.mjs --clean <sid>` (임시 학생 · ui38 소포 지움).
- 실전: 0038 을 넣은 뒤 운영자 '전설·소포' 탭에서 소포 코드를 만들고, 퀘스트 숫자 · 메타몽 (0.5%) · 방랑 전설 (30%) 을 확인.

## 0039 특성 · 변신 · 날씨 확인 (스테이징)
- 순서: `0039_abilities.sql` → `supabase/seed_pokemon.sql` 다시 (특성 · 기술 248~251 · 메타몽 변신 · 시간표 날씨가 seed 에 있음, 맨 끝 줄이 포켓몬마다 특성을 맞춤). 큰 파일은 임시 실행 함수로 (`.work/pokemon/exec.mjs`).
  0039 를 다시 만들 때: `python .work/abil/build_0039.py` (p1 + p2 + 가장 최근 migration 의 revoke/grant 블록).
- 서버: `node tests/rpc_test.mjs` → [46] (admin_bt_sim 으로 특성 하나하나 · 날씨 · 필드 · 변신 · 시간표 칸 · 잡을 때 특성). 시험 동안 `battle_fields` 는 빈 목록 (끝에서 되돌림).
- 화면: 배틀 (연습) 에서 HP 상자를 누르면 특성 설명, 날씨 띠는 오른쪽 위. 운영자 [성장·보상] → '배틀 시간표 (날씨 · 필드)'.

## 0041 별명 · 사진 공유 확인 (스테이징)
- 서버: `node tests/rpc_test.mjs` → [51] (별명 정하기 · 길이/글자/욕설 막기 · 10초 제한 · 랭킹 'nick' · 운영자 지우기). 테스트 학생 022901 · 022902 의 별명은 끝에서 지움.
- 욕설 목록 늘리기: 새 migration 에서 `public._nick_blocked` 를 다시 만듦 (띄어쓰기 · 기호를 뺀 소문자로 비교).
- 화면: 홈 트레이너 카드 → '카드 공유 · 저장', 가방 → 포켓몬 → '사진 만들기' (배경 고르기). 폰은 [공유] (인스타그램 등), PC 는 [저장] (PNG). 설정 → 별명.

## 0042 반짝이 · 빛나는 부적 · 알림 이유 확인 (스테이징)
- 서버: `node tests/rpc_test.mjs` → [52] (반짝 100% → 만남부터 반짝 · 잡으면 박스도 반짝 · 소포 길도 굴림 · 부적 × 배수 · 쓸 수 없음 · 도감 완성 → 부적 한 번 + 알림 · 퀘스트/깨어남/방랑 알림 첫 줄 = 이유). 시험 동안 `wild_shiny_chance` 는 0 (끝에서 되돌림).
- 확률 (운영자 [성장·보상] → '반짝이는 포켓몬'): 새로 잡는 포켓몬 1/512 · 알 1/256 · 1/128 · 1/64 · 빛나는 부적 ×3 (확률 칸은 "1 / N" 의 N).
- 화면: 임시 학생(0205xx)을 만들고 그 학생에게 반짝 만남 한 줄 (SQL `insert into raid_encounters (..., shiny) values (..., true)`) → `cd web && python -m http.server 8138` 에서 홈 배너 → 잡기 장면(반짝반짝) · 알림 이유 · 가방 부적을 폰(375) · 320 크기로 확인 → 끝나면 임시 학생 지우기.

## 0043 사막 · 모래바람 지대 확인 (스테이징)
- 서버: `node tests/rpc_test.mjs` → [53] (구역 desert · 땅/바위 (+ 선인왕 · 마라카치 · 데스마스 · 목도리키텔) 만, 물 · 얼음 없음 · Lv.15 → 45 · 자르기). 레벨 범위는 설정 `safari_level_bands` 의 "desert".
- 그림: `python tools/build_safari_tiles.py --preview` (사막 타일 desert_tiles · 기둥 선인장 · 사암 돌기둥 · 모래 언덕 48×32).
- 화면: 사파리존 서쪽 끝 모래길 (입구에서 왼쪽 아래) → 사막. 들어서면 "모래바람이 거세게 분다!" 글 상자 · 지도 위 모래바람 (움직임 줄이기 설정이면 멈춘 옅은 모래빛) · 마른 풀숲이 다리를 가림 · 사막에서 만난 포켓몬은 잡기 장면도 모래빛.

## 0047 기술 넓히기 · 이로치 레이드 확인 (스테이징)
- 만들기: `python tools/gen_pokemon.py` (PokeAPI CSV `.work/pokeapi/` + `move_meta.csv` · `move_meta_stat_changes.csv` · `move_effect_prose.csv`) → `supabase/seed_pokemon.sql`, 그다음 `python .work/moves/build_0047.py` → `supabase/migrations/0047_moves.sql`.
  새 기술 152개 = 번호 252~403 (앞 번호는 그대로). 기본 기술 4개 (species_moves) 는 예전 그대로 (이벤트 포켓몬 2마리만 물수리검 · 일렉트릭볼). 기술머신01~51 그대로, 52~60 새로.
  2턴 기술 (공중날기 · 솔라빔 · 구멍파기 …) · 일격필살 · 묶기 · 무게/날씨/물건 조건 기술은 넣지 않음.
- 실전 순서: `0047_moves.sql` → `supabase/seed_pokemon.sql` 다시 (같은 결과, 사람이 없을 때).
- 서버: `node tests/rpc_test.mjs` → [55] (새 기술 자료 · 물수리검 2~5번 / 지우개굴닌자 3번 · 선공 · 일렉트릭볼 · 고정 데미지 · 객기 · 레벨업으로 배움 · 기술머신52~), [56] (이로치 레이드 → 보상 반짝, 보통 레이드는 그대로).
- 화면: 운영자 [레이드] → '✦ 이로치 레이드' 체크 (미리보기가 반짝이는 색) → TV · 학생 레이드 탭 / 레이드 화면에 반짝이는 보스 + ✦.

## 0048 설원 · 용암 지대 · 발전소 · 용의 굴 · 사파리존 잠금 확인 (스테이징)
- 서버: `node tests/rpc_test.mjs` → [57] (구역 snow · lava · plant · dragon 의 타입 · 레벨 범위와 자르기 · 방문 기록 · 네 곳 다녀오기 전 용의 굴은 grass 로 · 600족 계열 · 잠금 SAFARI_CLOSED). 레벨 범위는 설정 `safari_level_bands` 의 snow · lava · plant1 · plant2 · dragon.
- 그림: `python tools/build_safari_tiles.py --preview` (0048 타일은 맨 뒤에 붙음 → 예전 타일 자리 그대로). 지도 점검: `node .work/s7/maps-check.mjs` (막는 칸 · 모든 칸 닿는지 · 얼음 미끄러짐 · warp).
- 화면: 사파리존 맨 위 모래길 → 설원 ("눈이 펑펑 내리고 있다!", 얼어붙은 연못은 미끄러짐) · 왼쪽 아래 모래길 → 용암 지대 ("후끈한 열기가 느껴진다!") · 왼쪽 위 발전소 문 → 1층 → 계단 → 2층. 네 곳 (해변 · 사막 · 설원 · 용암) 을 다녀오면 호수에 섬 + 다리 가운데 계단 → 용의 굴.
- **축제 시작할 때**: 학생들이 먼저 QR 을 찾게 하려면 운영자 [축제 운영] → 야생 포켓몬 → '사파리존 열기' 를 끔 (학생 앱 사파리존 = "아직 닫혀 있어요" 덮개, 현황판에 '사파리존 닫힘'). 스테이징 기본은 켜짐.

## 0049 핵심 고침 확인 (스테이징)
- 실전 순서: `0049_core_fixes.sql` (멜탄 계열 440 을 지움 — 가진 학생은 진화의 돌 1개씩, item_log 'meltan_removed') → `supabase/seed_pokemon.sql` 다시 (808 · 809 없음, 사람이 없을 때).
  MCP 로 넣을 때 DELETE 가 든 멜탄 부분은 확인 창이 뜨면 임시 실행 함수로 (`.work/pokemon/exec.mjs`, 끝나면 `_tmp_seed_exec` 를 다시 DISABLED).
- 서버: `node tests/rpc_test.mjs` → [58] (알 · 연습 배틀에 울트라비스트 없음 · 사파리 결과 두 번 보내도 같은 결과 · graded 티켓 · 갈래 진화 90번 고르게 · BRANCH_LINE · school_keys · 멜탄 없음).
- 화면: Playwright 화면 시험 `c8_safari.mjs <port> <tag>` (잡은 뒤 새로 고침 / 응답 끊김 → 다시 던지기 장면이 안 뜨는지), `c8_shiny.mjs <port>` (이로치 레이드 잡기 · 티켓 · 셀프 수령).
- 운영: 선생님 계열 2 · 18 · 33 · 46 · 50 · 69 는 지금 갈래 계열 (랄토스 · 발챙이 · 배루키 · 야돈 · 눈꼬마 · 뚜벅쵸) → 운영자 [몬스터] → 선생님 배정에서 다른 야생 포켓몬으로 옮기기를 권함 (자동으로 옮기지 않음).

## 0050 전설의 특별한 곳 확인 (스테이징)
- 서버: `node tests/rpc_test.mjs` → [59] (새 전설 33마리 = legend_src safari · 퀘스트 47개 · zone_catch 셈 · 코스모그 깨어남 → 잡기 → 네크로즈마).
- 그림: `python tools/build_safari_tiles.py --preview` (0050 타일은 맨 뒤 → 예전 타일 자리 그대로). 지도 점검: `node .work/d8/maps-check.mjs` (전설 자리마다 닿는지 · 힌트 · 묶음).
- 화면: 해변 동쪽 끝 나루 → 꿈의 섬 · 깊은 연못 동쪽 길 → 성검의 숲 · 용의 굴 위쪽 사다리 → 용의 굴 깊은 곳 · 울트라 스페이스 위쪽 워프홀 → 별의 제단 · 사막 서쪽 유적 계단 → 고대 유적. 사육사 → "어떤 포켓몬에 대한 이야기를 듣고 싶니?" → 곳 → 전설.

## 0055 전설 배틀 · 잡기 확률 (원 색깔별) · 반짝 소포 확인 (스테이징)
- 순서: `0055_legend_battle.sql` 하나 (설정 9개 추가 · admin_create_gift 를 지우고 다시 만듦 → 끝의 권한 블록 꼭 포함).
- 서버: `node tests/rpc_test.mjs` → [64] (배틀 없이 잡기 NEED_BATTLE · 보스 Lv · 체력 배수 · 랭크 · 이어 하기 · 지면 만남 끝 + 도전 1번 · 이기면 잡힘 · 설정 끄면 예전처럼 · catch_config 확률 · 범위 · 반짝 소포). 시험 동안 legend_battle_on 은 꺼 둠 (끝에서 되돌림).
- 보스 강하기: rpc `admin_legend_sim(p_dex, p_team [{sp, lv}…], p_n ≤ 20)` (AI 끼리, 운영자만) 또는 운영자 [전설·소포] → 전설 배틀 강하기 → "AI 끼리 10판 시험".
- 화면: Playwright 화면 시험 `b11_legend.mjs <c375|c320|pc> <win|lose>` (만남 → 배틀 → 지쳤다 → 잡기 / 도망 → 사라짐), `b11_ball.mjs <before|after> <phone|pc> [운]` (공 흔들림 프레임), `b11_admin.mjs <c375|c320|pc>` (운영자 카드). 화면 시험 스크립트는 저장소 밖(개발 PC)에 있습니다.

## 0057 sync 가볍게
- `0057_sync_light.sql`: 학생마다 전설 퀘스트가 보는 자료의 지문(`_quest_fp`)을 저장해, 바뀐 것이 없으면 퀘스트 47개 확인을 건너뛰고 sync 의 legends 목록도 저장해 둔 것을 씀 (sync 약 150~190ms → 27ms). raid_players(user_id) 인덱스.

## 0058 갈래 진화 · 코스모그 두 번 · 전설 보스 체력 확인 (스테이징)
- 순서: `0058_branch_evo.sql` 하나 (evolutions 에 weight 열 · 트리거 추가, 설정 legend_boss_hp_mult → 1.5, legend_quests 의 789 에 "max": 2 — 지우는 것 없음, 끝의 권한 블록 꼭 포함). MCP 로 넣을 때 한 번에 안 되면 나눠서 (스테이징은 5조각으로 넣음).
- 규칙: 갈래가 여럿이면 가장 낮은 레벨 조건에서 돌 없이 (모두 돌 진화 = 냄새꼬는 진화의 돌), 그 전에는 진화의 돌로, 결과는 **모든 갈래** 중에서 무게대로. 전설 · 환상 갈래 (코스모움) 는 박스에 있는 모습을 뺌. 퀘스트 'max' (기본 1) 만큼 그 전설을 만날 수 있음.
- 무게: 운영자 [성장 · 보상] → '진화 갈래' (rpc `admin_branch_tree()` · `admin_set_branch_weight(from 종, to 종, 0~100)`). 무게는 같은 진화 (전국도감 번호 쌍) 마다 하나 — 선생님 폼 · 일반 폼 복사본 줄을 한꺼번에 바꾸고, 새로 생기는 복사 줄은 트리거가 이어받음. ⚠️ `seed_pokemon.sql` 을 다시 돌리면 evolutions 를 모두 지우고 다시 넣으므로 무게가 모두 1 로 돌아감 → 운영자 화면에서 다시 넣기.
- 갈래 목록 확인 (2026-11): PokeAPI `pokemon_species.evolves_from_species_id` (1~1025, 갈래 19가족) 와 비교 — 우리 DB 에 종이 있는 12가족 (냄새꼬 · 슈륙챙이 · 야돈 · 이브이 · 배루키 · 개무소 · 킬리아 · 토중몬 · 눈꼬마 · 진주몽 · 도롱충이 · 코스모움) 은 갈래가 모두 있음. 빠진 갈래 (863 · 900 · 980 · 903 · 867, 841/842/1011, 936/937) 는 그 종이 DB 에 없어서 더하지 않음. 지역 폼 갈래 (알로라 라이츄 등) · 폼만 다른 진화 (루가루암 · 우라오스) 는 우리 DB 에 폼 종이 없음. 전설 · 환상 갈래 가족은 코스모움 하나.
- 서버: `node tests/rpc_test.mjs` → [65] (이브이 Lv.25 80번 = 8갈래 모두 · 진화의 돌 64번 = 8갈래 모두 · 무게 0 = 안 나옴 / 9 = 60% · 복사 줄도 같이 · 선생님 폼 슈륙챙이 Lv.40 = 두 갈래, 같은 폼 안 · 냄새꼬 NO_TICKET · 솔가레오를 가지면 루나아라 · 코스모그 두 번 (두 번째도 전설 배틀, 체력 ×1.5) · 세 번째 ALREADY_CAUGHT · 학생은 운영자 rpc 못 부름). [44] 2) · [59] 도 새 규칙에 맞춤 ([59] 는 코스모그 max 1 로 '한 번' 을 봄).
- 화면: 도감 → 포켓몬 → '진화' 는 갈래 단계를 화살표 뒤 한 칸에 위아래로 쌓음 (이브이 8갈래 = 그 칸 안 2열), 선생님 폼 이름은 띄어쓰기에서만 줄 바꿈. Playwright 로 320 · 375 · 412 (DPR 3) · 1280 에서 슈륙챙이 · 이브이 · 냄새꼬 · 코스모그 · 3단 계열 · 선생님 폼 갈래 + 운영자 카드 (넘침 0). 화면 시험 스크립트는 저장소 밖 (개발 PC) 에 있습니다.

## 0056 포켓몬 교환 확인 (스테이징)
- 순서: `0056_trade.sql` 하나 (표 trades · trade_seen, collection 에 열 추가 — 지우는 것 없음, 끝의 권한 블록 꼭 포함).
- 서버: `node tests/rpc_test.mjs` → [63] (배틀 QR 로 교환방 · 둘 다 확인 · 바뀌면 확인 풀림 · 그만두기 · 못 바꾸는 포켓몬 코드 · 하루 횟수 · trade_open 끄기 · 바꾸기 직전 다시 확인 · 되돌려 받기 도감 · 두 번 눌러도 한 번 · 교환 진화 · 방 시간 끝 · 운영자 목록).
- 화면: 학생 둘로 로그인 → 한 명은 배틀 탭 "내 교환 QR 보여주기", 다른 한 명은 그 QR 을 찍고 "포켓몬 교환하기" → 고르기 → 둘 다 교환하기 → 근육몬은 받자마자 괴력몬으로 진화.

## 개발 중 주의
- 오프라인 캐시(service worker) 때문에 파일을 고쳐도 브라우저가 옛 파일을 보여줄 수 있다 → 개발자도구 Application → Service Workers → Unregister + Clear storage 후 새로고침.

## 축제 규모 부하 테스트 (스테이징)
`node tests/festival_load.mjs 60 1 24` — 학생 600명이 쓰는 요청 섞음(동기화·배틀 신청 확인·레이드 탭·배틀·랭킹)을 70 req/s 로 60초. 두 번째 숫자 2 = 두 배, 세 번째 = 임시 학생 수 (기본 24, 로그인 제한 때문에 25 이하). 임시 학생(020500~020999, 이름 '부하시험')은 끝에서 지움 — 중간에 멈추면 운영자 페이지에서 지우기. 게임 함수가 학생 줄(profiles)을 잠그므로 계정 몇 개에 몰면 실제보다 훨씬 느리게 나옴. 2026-11-10: 테스트 서버(가장 작은 공유 CPU)는 하루 종일 시험한 뒤 초당 21개에서도 30초 초과 → 실전 서버는 Small 이상으로 만들고 거기서 다시 시험. 2026-10-28: 70 req/s 오류 0 · p95 ≤ 170ms, 140 req/s 오류 0 · p99 약 2초.
