# CLAUDE.md — 팀 공동 규칙 (사람 + 각자의 Claude 모두 따를 것)

## 프로젝트 한 줄 요약
학교 축제용 QR 수집 게임 PWA. 에메랄드(GBA) 느낌 픽셀아트, 오프라인 우선, 서버는 Supabase.
**먼저 읽기: `PROGRESS.md` (지금 상태·남은 일·담당) → `docs/DESIGN.md` (설계) → `RUN.md` (실행·테스트·배포).**

## 폴더 구조
- `web/` 배포되는 정적 사이트 (빌드 없음, vanilla JS 모듈): `index.html` 학생 · `booth.html` 부스 · `screen.html` TV · `admin.html` 운영자 · `js/` `css/` `vendor/` `fonts/` `sprites/` `img/` `sw.js`
- `supabase/migrations/` DB 변경 (번호순, 이미 적용된 파일은 고치지 말고 새 번호로 추가) · `supabase/seed.sql` 데모 데이터
- `tests/rpc_test.mjs` 서버 규칙 테스트 — **DB를 바꾸면 반드시 실행해서 전부 통과**시킬 것
- `tools/` 그림 도구 (`pixelize.py` 그림→도트, `build_atlas.py` 몬스터 아틀라스, `draw_map.py` 옛 도트 지도 v1) · `docs/DESIGN.md` 설계
- `art/sprites/` 완성된 몬스터 도트 (`<선생님번호>-<단계>.png`, 없으면 코드가 그린 임시 그림 사용)
- `PROGRESS.md` 진행 상황·남은 일 — **작업 끝나면 같이 고친다**

## 작업 방식 (가장 중요)
1. **`main`에 직접 push 금지.** 항상 브랜치에서 작업 → Pull Request → 다른 팀원 1명 확인 후 merge.
   - 브랜치 이름: `feat/ranking`, `fix/qr-scan`, `art/youngja-mon` 처럼 `종류/내용`.
2. 작업 시작 전 `git pull origin main`으로 최신화. PR은 작게, 자주.
3. 한 사람이 Claude 여러 개를 돌릴 때는 **git worktree**로 폴더를 분리:
   ```bash
   git worktree add ../pokemon-hafs-ranking -b feat/ranking
   # 끝나면: git worktree remove ../pokemon-hafs-ranking
   ```
4. **같은 파일을 두 명이 동시에 고치지 않는다.** 시작 전에 아래 담당표에 이름을 적거나 단톡에 알린다.
5. 커밋 메시지: `feat: 랭킹 탭 추가`, `fix: QR 오프라인 인식 오류` 처럼 `종류: 무엇을 왜`.
6. **작업을 끝내면 `PROGRESS.md`의 해당 줄(상태 ⬜→✅, 메모)을 고쳐서 같은 PR에 넣는다.** 다음 사람(과 다음 Claude)은 그 파일부터 읽는다.
7. Claude에게 일을 시킬 때: "PROGRESS.md 읽고 3번 표의 N번 해줘"처럼 번호로 지정하면 겹치지 않는다.

## 담당 영역 (이름 채워 넣기)
| 영역 | 담당 |
|---|---|
| 학생 앱 (탭: 홈·지도·도감·랭킹·진화, QR 스캔, 오프라인) | |
| 운영자 페이지 (현황판, QR 발급·배포, 몬스터 관리) | |
| Supabase (DB 구조, 보안 규칙, 서버 함수) | |
| 교실 뽑기 (코드 입력 → 몬스터 지급) | |
| 픽셀아트 / 몬스터·퀴즈 데이터 | |

## 절대 규칙
- **비밀값 커밋 금지**: Supabase `service_role` 키, 비밀번호, `.env`. (공개용 `anon` 키는 앱에 들어가도 됨 — 보안은 DB 규칙(RLS)으로 지킨다.)
- **선생님 원본 사진은 git에 올리지 않는다** (`art-src/`는 gitignore됨). 완성된 픽셀 스프라이트만 올린다.
- **서버 함수를 만들거나 바꾸는 마이그레이션은 끝에 반드시 `supabase/migrations/0006_function_privileges.sql`과 같은 권한 블록(전체 revoke → 필요한 것만 grant)을 넣는다.** 안 그러면 새 함수가 로그인 안 한 사람에게도 열린다. `node tests/rpc_test.mjs`가 검사한다.
- **DB 구조 변경은 SQL 파일(마이그레이션)로만.** Supabase 대시보드에서 직접 클릭해서 바꾸지 않는다 — 기록이 안 남는다.
- **게임 판정(퀴즈 정답, 진화 확률, 코드 사용)은 서버 함수에서.** 앱(클라이언트) 코드에 정답·확률을 넣지 않는다 — 학생이 조작할 수 있다.
- 오프라인에서 깨지는 기능을 만들지 않는다. 인터넷이 꼭 필요한 기능(로그인 최초 1회, 진화, 코드 사용)은 화면에 그렇게 표시한다.
- 외부 라이브러리 추가는 팀과 먼저 상의. 추가할 땐 CDN이 아니라 파일로 저장(오프라인 때문).
- 학생 앱 코드: `web/js/app.js` (시작·동기화·홈·스캔·가방·창), `state.js` (공용 상태), `dex.js` (지도·도감·진화), `raid.js`, `battle.js`, `login.js` (로그인·가입·처음 안내). 새 js 파일을 만들면 `web/sw.js`의 목록에도 넣고 버전을 올린다 (안 넣으면 오프라인에서 깨짐).

## 픽셀아트 규칙
- 몬스터 64×64px, 투명 PNG. 화면엔 정수배(2×, 3×)로만 확대 (`image-rendering: pixelated`).
- 앱 아이콘은 이모지 대신 `web/js/ui.js`의 `pix()` 8×8 도트 아이콘을 쓴다 (폰마다 이모지 모양이 달라서). 새 아이콘은 거기에 추가.
- 지도(`web/img/map.webp`)는 도트가 아니라 일러스트. 건물 이름표는 `dex.js`의 `MAP_LABELS`, QR 핀 위치는 운영자 페이지 QR 관리.
- 몬스터 1마리당 최대 15색 + 투명. 1px 외곽선(검정 말고 몸색보다 어두운 색). 빛은 왼쪽 위, 명암 3단계.
- 3단계 진화는 같은 색 계열 유지, 단계가 오를수록 캔버스를 더 채운다.

## 완료 기준
"코드 다 짰다" ≠ 완료. **직접 실행해서 확인한 뒤** PR에 무엇을 어떻게 확인했는지(스크린샷/명령어 결과) 적는다.
