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
  seed.sql                   데모 데이터 (임시 몬스터 15라인 + 전설 2, QR 25개)
tests/rpc_test.mjs           서버 규칙 자동 테스트 (63개)
tools/pixelize.py            AI 그림 → 64x64 도트
tools/build_atlas.py         art/sprites/*.png → web/sprites/atlas.png
tools/draw_map.py            학교 지도 픽셀아트 → web/img/map.png
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
테스트 계정 (스테이징 전용, `CONFIG.DEV_LOGIN = true`일 때만 로그인 폼이 보임):
학생 `022001@test.local` ~ `022006@test.local`, `023004@…`, `024005@…` / 부스 `booth1@staff.test` / 운영자 `admin@staff.test`.
비밀번호는 `tests/.env`의 `TEST_PASSWORD` (git에 안 올라감 — 팀장에게 받기).

## 서버 테스트
```bash
node tests/rpc_test.mjs        # → "63 passed, 0 failed" 이어야 함
```
테스트용 학생 4명(022001~022003, 023004)의 기록을 지우고 다시 만든다. 실전 프로젝트에 절대 돌리지 말 것.

## 몬스터 그림 넣기
```bash
python tools/pixelize.py 원본.png art/sprites/001.png --stage 1 --preview   # 도감번호 3자리
# Piskel(https://www.piskelapp.com)에서 얼굴만 다듬기
python tools/build_atlas.py                                                   # web/sprites/atlas.png 갱신
```
도감번호 = (라인번호-1)×3 + 단계. 선생님 원본 사진은 `art-src/`에 (git 제외).
그림을 바꾸면 `web/sw.js`의 `VERSION`을 올려야 학생 폰에 반영된다.

## 실전(축제) 프로젝트 만들 때 체크리스트
1. Supabase 새 프로젝트 (서울) → `supabase/migrations/` 0001 → 0004 순서대로 실행 → 실제 몬스터/퀴즈/QR은 운영자 페이지에서 입력 (seed.sql은 쓰지 않음)
2. `settings` 수정: `email_domains`(학교 도메인), `email_regex`(학번 추출), `admin_emails`, `booth_emails`
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
