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
  migrations/0001~0004       DB 구조 + 보안 규칙 + 서버 함수 (번호 순서대로 실행)
  seed.sql                   데모 데이터 (임시 몬스터 34라인 + 전설·비밀·탐구 전설, QR)
  seed_battle.sql            배틀 데이터 (상성·기술·능력치·배틀 타입) — seed.sql 다음에 실행. 손으로 고치지 말고 `python tools/gen_battle_data.py` 로 다시 만들기
  (계열 목록 = tools/roster.py. 43~76 계열 SQL = `python tools/gen_roster_sql.py` → seed.sql 의 '명단에 맞춰 늘린 계열' 블록)
tests/rpc_test.mjs           서버 규칙 자동 테스트 (63개)
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
node tests/rpc_test.mjs        # → "95 passed, 0 failed" 이어야 함 (tests/.env 필요: PROGRESS.md §4)
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
1. Supabase 새 프로젝트 (서울) → `supabase/migrations/` 0001 → 0041 순서대로 실행 (0034 다음에 `supabase/seed_pokemon.sql` 실행 — 0037 을 넣은 뒤에도 한 번 더 실행: 갈래 진화 종 20마리 + `evolutions` 표가 seed 에 들어 있음 → `node tools/upload_pokemon_sprites.mjs` 로 포켓몬 그림 올리기 (실제 서버는 SUPA_URL · SUPA_KEY · ADMIN_EMAIL · ADMIN_PASSWORD 를 줌, 파일 맨 위 설명) — 사람이 없을 때) → 실제 몬스터/퀴즈/QR은 운영자 페이지에서 입력 (seed.sql은 쓰지 않음). 배틀 데이터는 `seed_battle.sql` 실행 (라인 번호가 같아야 함, 0020 다음에 — 기술·배우기·가방 물건이 들어 있음). ⚠️ 0020 은 기술을 지우고 다시 번호를 매기므로 **0020 → seed_battle.sql 을 사람이 없을 때 연달아** 실행하고, 연습 배틀 한 판으로 기술이 보이는지 확인 (둘 사이에 시작한 배틀은 기술이 없어 발버둥만 씀)
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

## 개발 중 주의
- 오프라인 캐시(service worker) 때문에 파일을 고쳐도 브라우저가 옛 파일을 보여줄 수 있다 → 개발자도구 Application → Service Workers → Unregister + Clear storage 후 새로고침.

## 축제 규모 부하 테스트 (스테이징)
`node tests/festival_load.mjs 60 1` — 학생 600명이 쓰는 요청 섞음(동기화·배틀 신청 확인·레이드 탭·배틀·랭킹)을 70 req/s 로 60초. 두 번째 숫자 2 = 두 배. 로그인 제한 때문에 테스트 계정 4개로 보냄. 2026-10-28: 70 req/s 오류 0 · p95 ≤ 170ms, 140 req/s 오류 0 · p99 약 2초.
