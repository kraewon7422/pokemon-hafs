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

---

## 엔진 · 구조

게임 엔진을 따로 쓰지 않고, 브라우저 기본 기능 + Supabase 로 직접 만든 구조입니다.

| 부분 | 어떻게 만들었나 |
|---|---|
| **앱 (프런트엔드)** | 빌드 단계가 없는 **순수 ES 모듈** (`web/js/*.js`, `<script type="module">`). 번들러·프레임워크 없음. `web/` 폴더를 그대로 정적 호스팅에 올리면 끝 |
| **PWA · 오프라인** | `web/sw.js` 서비스워커. 설치 때 첫 화면에 필요한 파일만 받고(CORE), 나머지(QR 카메라·지도·배틀·미니게임·사파리)는 뒤에서 받음(EXTRA). 캐시 3개를 따로 둠: 앱 버전 캐시(`VERSION`, 배포마다 올림) · 운영자가 올린 포켓몬 그림 캐시 · **배경 음악 전용 캐시**(약 9MB, 처음 틀 때 받아 두고 버전을 올려도 다시 받지 않음). 새 버전은 뒤에서 설치되고, 가방 QR 이 화면에 떠 있을 때는 바꾸지 않음 |
| **서버** | **Supabase** (Postgres + Auth + Storage). 게임 규칙은 전부 서버의 **Postgres 함수(RPC)** 안에 있음 — 앱은 "이 기술을 골랐다", "이 QR 을 찍었다" 만 보내고 결과(포획·진화·배틀 데미지·룰렛·알 부화·반짝이 확률)는 서버가 정함. 함수는 `SECURITY DEFINER` + `search_path = ''`, 표는 **행 단위 보안(RLS)** 으로 막고, 마이그레이션마다 끝에 실행 권한 블록(0006 방식)을 둬서 로그인하지 않은 사람은 호출할 수 없음 |
| **DB 변경 이력** | `supabase/migrations/0001 ~ 0042` 를 번호 순서대로 실행. 예: 0015 배틀 엔진 · 0016 더블배틀 · 0027 알 · 0028 잡기 장면 · 0032 실제 포켓몬 809종 · 0033 사파리존 · 0036 PC 박스 · 0038 전설·소포 · 0039 특성·날씨 · 0041 별명 · 0042 반짝이 |
| **화면 그리기** | 픽셀 아트 = `<canvas>` + `imageSmoothingEnabled = false` / CSS `image-rendering: pixelated`. 글꼴은 도트 글꼴 Galmuri11 |
| **Phaser** | 잡기 장면(`catch.js`)과 미니게임 3개(서핑 `surf.js` · 땅따먹기 `land.js` · 등굣길 `cross.js`)만 Phaser 를 씀. `vendor/phaser.min.js` 는 그 화면을 처음 열 때 불러옴 (`games/common.js`). 폭탄 피하기 · 자이로 미로 · 사파리존 · 배틀 화면은 직접 만든 캔버스/DOM |
| **스프라이트** | 포켓몬 809종(+ 색이 다른 모습) 그림을 `tools/build_pokemon_sheets.py` 가 무손실 WebP 그림판(`web/sprites/pk-n*.webp`, `pk-s*.webp`)으로 묶고, 위치표는 `pk-index.js`. 그림판 한 장은 2048px 이하(아이폰 GPU 한계). 움직이는 GIF 는 `gif.js` 가 직접 풀어서 그림. 운영자 페이지에서 그림을 올리면 Storage 에 저장되고 모든 화면이 그 그림을 씀 |
| **소리** | `sfx.js` — WebAudio. 효과음은 오실레이터로 그 자리에서 만들고, 배경 음악(메인 · 트레이너 배틀 · 야생)은 `decodeAudioData` 로 풀어서 0.6초 겹쳐 바꿈. 첫 터치 뒤에 시작, 화면이 꺼지면 멈춤 |
| **배틀 엔진** | 서버 SQL (`0015` → `0016` → `0020` → `0039`). 3세대 방식 데미지 공식(`⌊⌊⌊2·Lv/5+2⌋·위력·공격/방어⌋/50⌋` + 자속·상성·급소·난수), 18타입 상성(두 타입은 곱), 능력 랭크 변화, 상태 이상(화상·마비·독·잠듦·얼음·혼란·풀죽음), 명중·선공, PP, 교체. **특성 113개**가 실제로 작동하고(예: 위협), **날씨**(쾌청·비·모래바람·싸라기눈)와 **필드**(일렉트릭·그래스·사이코·미스트)는 운영자 시간표나 날씨 기술로 바뀜. 1 대 1(3마리)·2 대 2(4마리), 연습(AI) · 친구 팀 · 실시간 대전 |
| **사파리존 맵 엔진** | `safari.js` — 타일 그리드 맵(`safari-maps.js`: 초원 · 해변 · 연못 · 하늘 언덕 · 제단 · 울트라 구역), 4방향 걷기, 조이스틱 + A 버튼 / 방향키·WASD, 지도 사이 워프, NPC 대화·고르기 메뉴. 풀숲 걸음은 서버(`safari_encounter`)가 속도를 확인하고 만남을 굴림. 여러 층 **동굴 미로**는 `tools/gen_safari_caves.py` 가 seed 로 만들어 `safari-caves.js` 에 씀 (막다른 길 · 큰 바위 · 떨어지는 구멍 · 사다리, 전설은 지하 2층부터) |
| **QR** | 찍기 = `scanner.js` (카메라 + jsQR, iOS 에서도 됨, 처음 열 때만 불러옴). 찍은 QR 은 IndexedDB(`db.js`)에 먼저 저장 → 인터넷이 돌아오면 서버로 보냄. 보여주기(가방 QR · 배틀 QR) = `qrcode.js` |
| **공유** | `share.js` — 트레이너 카드(1080×1344) · 포켓몬 사진(1080×1080)을 캔버스로 그려서 `navigator.share`(폰) 또는 PNG 저장(PC) |
| **테스트** | `tests/rpc_test.mjs` — 스테이징 서버에 실제로 RPC 를 불러 확인하는 서버 규칙 시험 약 950개 (권한 · 포획 · 진화 · 배틀 특성/날씨 · 소포 · 반짝이 …). `tests/festival_load.mjs` — 학생 600명 규모 요청을 섞어 70 req/s 로 보내는 부하 시험 (`tests/raid_load.mjs` 는 레이드 탭 폭주) |

```
web/            정적 사이트 (index = 학생 앱, admin · booth · screen = 운영 화면, sw.js)
  js/           ES 모듈 — app · battle · catch · safari · raid · eggs · legends · bag · dex · share · sfx …
  js/games/     미니게임 (hub · common + 게임 하나 = 파일 하나)
  vendor/       supabase.js · phaser.min.js · jsQR.js · qrcode.js
supabase/       migrations/0001~0042 · seed_pokemon.sql · seed_battle.sql
tools/          그림판 · 타일 · 동굴 · 데이터 생성 스크립트 (Python)
tests/          rpc_test.mjs · festival_load.mjs · raid_load.mjs
```

---

## 기능 둘러보기

아래 화면은 모두 테스트 서버에서 임시 계정으로 실제로 찍은 것입니다 (폰 375px 화면).

### 홈 · 트레이너 카드
<img src="docs/screens/home.webp" width="300" alt="홈 화면">

다음에 할 일(티켓 · 방랑 전설 알림), 트레이너 카드(도감 수 · 점수 · 순위 · 배지), 가방 · 미니게임 · 도전과제 · 룰렛 버튼. 하단 바는 홈 · 지도 · 레이드 · **QR** · 배틀 · 도감 · 랭킹.

### QR 잡기 · 포획 장면
<img src="docs/screens/catch.webp" width="600" alt="잡기 장면">

장소 QR 을 찍어 받은 티켓 · 야생 · 방랑 전설 · 레이드 보스는 폰에서 직접 잡습니다 (Phaser). 포켓몬 GO 처럼 **줄어드는 원**에 맞춰 공을 위로 휙 — 원 안에 맞으면 나이스 · 그레이트 · 엑설런트, 커브볼, 3D 포물선(중력 · 원근 · 튕김). 배경은 시간에 따라 낮 · 노을 · 밤.

### 도감
<img src="docs/screens/dex.webp" width="300" alt="도감">

전국도감 번호마다 한 칸, 학교 / 야생 / 잡은 포켓몬 · 18타입 · 지방(관동~알로라) 필터, 60칸씩 쪽 넘기기. 칸을 누르면 공식 분류 · 키 · 몸무게 · 도감 설명 · 특성 · 가진 수.

### PC 박스
<img src="docs/screens/box.webp" width="600" alt="PC 박스">

에메랄드 같은 PC 박스(30칸 × 30박스 = 900마리). 같은 포켓몬도 한 마리씩 따로 저장. 누르면 요약(레벨 · 경험치 · 특성 · 지닌 물건 · 기술) · 진화 · 옮기기 · 놓아주기 · 사진 만들기.

### 배틀 (1 대 1 · 2 대 2, 특성 · 날씨)
<img src="docs/screens/battle.webp" width="600" alt="배틀 특성 알림과 2대2">
<img src="docs/screens/battle_moves.webp" width="300" alt="2대2 기술 고르기">

3세대 느낌의 배틀 화면. 왼쪽: 보만다의 **위협** 특성이 발동하는 띠, 오른쪽 위 `쾌청` 날씨 표시. 오른쪽: 2 대 2 더블배틀에서 팀 시너지(같은 과목 계열 포켓몬이 팀에 2마리 이상이면 능력 +1)로 스피드가 오름. 기술 칸에 위력 · 타입 · PP, 효과가 없는 기술은 미리 표시. 친구 배틀 QR 로 친구 팀과, 홈의 "배틀 신청!" 으로 실시간 대전.

### 레이드
<img src="docs/screens/raid.webp" width="600" alt="레이드">

TV 대형 화면이나 운영진이 연 레이드 QR(또는 "QR 없이 참가")로 들어가 모두 함께 보스를 탭해서 쓰러뜨립니다. 내 포켓몬과 보스의 상성이 데미지에 들어가고(서버가 1초 8탭까지만 인정), 이기면 보상 티켓 또는 앱에서 바로 잡기. 아침 · 점심 · 저녁 시간대 전설 레이드는 TV 화면이 시간표대로 엽니다.

### 사파리존 (초원 · 해변 · 동굴)
<img src="docs/screens/safari.webp" width="750" alt="사파리존 초원 해변 동굴">

지도 탭 → 사파리존. 도트 맵을 조이스틱으로 걸어 다니며 풀숲 · 얕은 물 · 동굴 바닥에서 야생 포켓몬을 만나고 사파리볼로 잡습니다. 사는 곳마다 나오는 포켓몬이 다르고, 스프레이로 잠시 만남을 막을 수 있음. 동굴은 여러 층 미로.

### 사육사 NPC
<img src="docs/screens/safari_keeper.webp" width="300" alt="사육사 메뉴">

사파리 입구의 사육사에게 말을 걸면 아직 못 만난 전설 포켓몬의 소문(어디서 · 어떻게 깨우는지)을 고르기 메뉴로 들려줍니다.

### 전설 팡파르 · 이상한 소포
<img src="docs/screens/gift.webp" width="300" alt="이상한 소포"> <img src="docs/screens/fanfare.webp" width="450" alt="전설 팡파르">

설정 왼쪽 선물 단추 = **이상한 소포**. 운영진이 알려 준 코드를 넣으면 소포가 열리고(환상 포켓몬은 소포로만), 특별한 포켓몬을 받을 때마다 **전체 화면 연출**(검은 실루엣 → 빛나며 등장 + 짧은 팡파르)과 받은 이유가 나옵니다. 퀘스트 전설 · 방랑 전설(라이코 · 앤테이 · 스이쿤) · 도감 보상도 같은 연출.

### 진화의 돌 룰렛
<img src="docs/screens/roulette.webp" width="300" alt="진화의 돌 룰렛">

5분마다 한 번, 하루 횟수 제한. 꽝 / 1개 / 3개 결과는 서버가 정하고, 확률 · 간격 · 횟수는 운영자 설정. 진화의 돌은 레벨이 모자란 포켓몬을 일찍 진화시키거나 돌 진화(라이츄 · 윈디 …)에 씀.

### 알 부화
<img src="docs/screens/eggs.webp" width="600" alt="알 부화">

알 3종(초록 1,000 · 노랑 2,500 · 보라 5,000걸음), 부화기 3칸. 앱을 켜 두고 걸으면 폰 움직임 센서로 걸음을 세고(서버가 1분 · 하루 상한으로 자름), 새 장소 QR 마다 +300걸음. 다 차면 부화 연출과 함께 새 포켓몬.

### 미니게임
<img src="docs/screens/minigames.webp" width="600" alt="미니게임">

포켓몬 서핑 · 폭탄 피하기 · 자이로 미로(폰 기울이기) · 땅따먹기 · 포켓몬 등굣길. 게임마다 랭킹이 따로 있고, 말이 안 되는 점수는 서버가 거절합니다.

### 랭킹 · 별명
<img src="docs/screens/rank.webp" width="300" alt="랭킹">

점수 · 도감 · 배틀 · 반별 랭킹, 전체 / 기수별. 이름은 기본으로 가운데 글자를 가리고, **별명**(2~10자, 욕설 · 사칭 목록으로 막음)을 정하면 랭킹 · TV · 배틀 상대에게 별명이 보입니다.

### 트레이너 카드 공유
<img src="docs/screens/card.webp" width="300" alt="트레이너 카드 공유">

홈의 "카드 공유 · 저장" → 배틀 팀 · 도감 · 배지가 들어간 카드 이미지를 만들어 폰은 공유(인스타그램 · 메시지), PC 는 PNG 저장. 포켓몬 한 마리 사진(배경 9가지)도 만들 수 있음.

### 운영자 페이지
<img src="docs/screens/admin.webp" width="750" alt="운영자 현황판">
<img src="docs/screens/admin_raid.webp" width="750" alt="운영자 레이드 탭">

현황판(게임 상태 · 접속 · 티켓 · 진화 성공률 · 오늘의 게임 숫자, 10초마다 새로 고침, 교장 · 교감 레이드 바로 시작), 축제 운영 · 장소 QR(지도 핀 · 인쇄) · 포켓몬/퀴즈 · 레이드 열기 · 학생/계정 · 미니게임 · 성장/보상(배틀 시간표 날씨 · 필드, 알 걸음, 반짝이 확률) · 전설/소포 · 운영진 · 고급 설정. 탭마다 "이 탭에서 하는 일" 안내.
