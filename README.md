# pokemon-hafs

A school-festival QR collecting game: an installable, offline-first web app (PWA) in a
GBA-era pixel-art style. Students scan QR codes placed around campus, earn one-time codes,
redeem them at the main booth for monsters, answer quizzes for evolution tickets, and climb
the ranking. A Supabase backend stores accounts, collections and codes, and an admin page
shows live system status.

> Status: setting up. Architecture is still being designed.

---

## 한국어

학교 축제용 QR 수집 게임. 홈 화면에 설치하는 웹앱(PWA)이며, 인터넷이 없는 곳에서도 동작하도록 만든다.

- 학교 곳곳의 QR 스캔 → 개인 일회용 코드 → 메인 부스에서 사용 → 몬스터 획득
- 몬스터 획득 시 퀴즈 → 정답이면 진화권 → 확률 진화 (3단계)
- 하단 바: 홈 · 지도 · 도감 · 랭킹 · 진화
- 서버: Supabase / 운영자 페이지: 현황판, QR 발급·배포, 몬스터 관리

팀 작업 규칙은 [CLAUDE.md](CLAUDE.md)를 먼저 읽을 것.
