# pokemon-hafs

A school-festival QR collecting game: an installable, offline-first web app (PWA) in a
GBA-era pixel-art style. Students scan QR codes placed around campus, earn one-time codes,
redeem them at the main booth for monsters, answer quizzes for evolution tickets, and climb
the ranking. A Supabase backend stores accounts, collections and codes, and an admin page
shows live system status.

## 바로가기 (테스트 사이트)

| 화면 | 주소 | 누가 |
|---|---|---|
| 🎮 **학생 앱** | **https://pokemon-hafs.pages.dev** | 학생·손님 (폰) |
| 🛠 **운영자 페이지** | **https://pokemon-hafs.pages.dev/admin** | 운영자 (운영진 탭에서 다른 운영자 초대) |
| 🎫 **부스 화면** | **https://pokemon-hafs.pages.dev/booth** | 메인 부스 스태프 (태블릿·노트북) |
| 📺 **TV 대형 화면** | **https://pokemon-hafs.pages.dev/screen** | 부스 TV (전설 QR·실시간 피드) |

운영자·부스 화면은 운영자가 초대한 **구글 계정**으로 로그인해야 들어갈 수 있어요.

> Status: full game loop playable on a staging server (127 server-rule tests passing). Any Google account can log in. Remaining: real quiz/art content, production server — see [PROGRESS.md](PROGRESS.md).

---

## 한국어

학교 축제용 QR 수집 게임. 홈 화면에 설치하는 웹앱(PWA)이며, 인터넷이 없는 곳에서도 동작하도록 만든다.

- 학교 곳곳의 QR 스캔 → 개인 일회용 코드 → 메인 부스에서 사용 → 몬스터 획득
- 몬스터 획득 시 퀴즈 → 정답이면 진화권 → 확률 진화 (3단계)
- 하단 바: 홈 · 지도 · [QR 찍기] · 도감 · 랭킹 (진화는 도감에서), 홈에 진화권 룰렛
- 서버: Supabase / 운영자 페이지: 현황판, QR 발급·배포, 몬스터 관리

팀 작업 규칙은 [CLAUDE.md](CLAUDE.md), 진행 상황·남은 일은 [PROGRESS.md](PROGRESS.md), 실행 방법은 [RUN.md](RUN.md).
