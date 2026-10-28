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
  seed_battle.sql            배틀 데이터 (상성·기술·능력치) — seed.sql 다음에 실행. 손으로 고치지 말고 `python tools/gen_battle_data.py` 로 다시 만들기
tests/rpc_test.mjs           서버 규칙 자동 테스트 (63개)
tools/pixelize.py            AI 그림 → 64x64 도트
tools/build_atlas.py         art/sprites/*.png → web/sprites/atlas.png
web/img/map.webp             학교 지도 (숲속 캠퍼스 항공 지도 그림, 90° 회전). 건물 이름표는 app.js MAP_LABELS, 핀은 운영자 페이지 QR 관리
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
미리 있는 계정: 학생 `022001@test.local` ~, 부스 `booth1@staff.test`, 운영자 `admin@staff.test` (비밀번호 같음). 서버 테스트는 `tests/.env`의 `TEST_PASSWORD=1234abcd!`.

## 서버 테스트
```bash
node tests/rpc_test.mjs        # → "95 passed, 0 failed" 이어야 함 (tests/.env 필요: PROGRESS.md §4)
```
테스트용 학생 4명(022001~022003, 023004)의 기록을 지우고 다시 만든다. 실전 프로젝트에 절대 돌리지 말 것.

## 몬스터 그림 넣기
```bash
python tools/pixelize.py 원본.png art/sprites/12-1.png --stage 1 --preview   # 파일 이름 = 라인번호-단계
# Piskel(https://www.piskelapp.com)에서 얼굴만 다듬기
python tools/build_atlas.py                                                   # web/sprites/atlas.png 갱신
```
**그림 파일 이름 = `라인번호-단계.png`** (예: 12번 쌤 1단계 = `12-1.png`, 교장 전설(학사쟈) = `36-1.png`, 교감 전설(금관오스) = `35-1.png`, 비밀 몬스터(숨바꼬치) = `37-1.png`). 운영자 페이지 → 몬스터·퀴즈의 각 카드에 '그림 파일' 이름이 적혀 있어요. 앱에 보이는 도감 번호(No.001~)와는 다르니 그 번호로 저장하지 마세요. 선생님 원본 사진은 `art-src/`에 (git 제외).
그림을 바꾸면 `web/sw.js`의 `VERSION`을 올려야 학생 폰에 반영된다.

## 실전(축제) 프로젝트 만들 때 체크리스트
1. Supabase 새 프로젝트 (서울) → `supabase/migrations/` 0001 → 0012 순서대로 실행 → 실제 몬스터/퀴즈/QR은 운영자 페이지에서 입력 (seed.sql은 쓰지 않음). 배틀 데이터는 `seed_battle.sql` 실행 (라인 번호가 같아야 함)
2. `settings` 수정: `admin_emails`, `booth_emails` (운영자·부스 구글 계정), **`dev_login`은 false 그대로** (0008 기본값). 모든 구글 계정이 로그인 가능하므로 도메인 설정은 필요 없음
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

## 개발 중 주의
- 오프라인 캐시(service worker) 때문에 파일을 고쳐도 브라우저가 옛 파일을 보여줄 수 있다 → 개발자도구 Application → Service Workers → Unregister + Clear storage 후 새로고침.
