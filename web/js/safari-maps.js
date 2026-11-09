// 사파리존 지도 데이터 (그림 없음 · DOM 없음 — node 로도 읽어 시험함: .work/preview/maps-check.mjs)
// kind 'out' = 바깥 (풀숲 , 에서 야생 포켓몬) · 'cave' = 동굴 (바닥 . 에서 야생 포켓몬)
// 바깥 글자: T 나무 · . 풀밭 · , 키 큰 풀숲 · # 모래길 · ~ 물 · b 다리 · F 울타리 · f 꽃 · R 바위 · S 표지판 · G 입구 기둥
//            M 산 바위 · C 동굴 입구 (밟으면 이동) · L 전설 포켓몬 자리
// 동굴 글자: W 바위벽 · . 바닥 · r 작은 바위 · O 큰 바위 · ~ 물 · B 점자 벽 · U 올라가는 사다리 · V 내려가는 사다리
//            o 구멍 (떨어짐) · E 나가는 곳 · L 전설 포켓몬 자리 · Q 울트라 워프홀 (밟으면 울트라 스페이스로)
// 제단 글자 (kind 'shrine'): P 절벽 · B 점자 절벽 · . 돌바닥 · I 부서진 돌기둥 · = 돌계단 · A 흰 대리석 제단 · r 돌
//            E 나가는 계단 · U 올라가는 사다리 · L 전설 포켓몬 자리 (만남 칸 없음)
// 울트라 스페이스 글자 (kind 'ultra'): X 빈 우주 · . 떠 있는 발판 · = 밝은 빛의 길 · K 빛나는 수정 · Q 울트라 워프홀
// 해변 글자 (kind 'beach'): T 야자나무 · . 모래 · , 바닷가 풀숲 · w 얕은 물 (걸을 수 있음) · ~ 깊은 바다 · c 산호 · R 바위 · h 조개껍데기 · S 표지판 · E 나가는 곳
// 사막 글자 (kind 'desert', 0043): M 붉은 사암 절벽 · . 모래 · - 모래 물결 · , 마른 모래 풀숲 · D 모래 언덕 (3×2 칸의 왼쪽 아래, 나머지 ^) · C 기둥 선인장
//            c 술통 선인장 · R 사암 바위 · x 무너진 유적 바닥 · P 사암 돌기둥 · o 돌 부스러기 · K 짐승 머리뼈 · b 뼈 (걸을 수 있음) · S 표지판 · E 나가는 곳
// 0048: 바깥 글자 H = 발전소 단지 (6×5 칸의 왼쪽 아래, 나머지 ^) · D 발전소 문 (밟으면 안으로) · Z 호수 다리 가운데 계단 (용의 굴이 열린 뒤에만, DRAGON_ISLE)
// 설원 (kind 'snow'): T 눈 소나무 · . 눈 · , 눈 속 풀숲 · M 눈 덮인 흙 턱 · = 돌계단 · I 얼어붙은 연못 (미끄러짐) · R 바위 · H 오두막 (2×2) · n 눈사람 · S · E
// 용암 (kind 'lava'): M 검붉은 절벽 · . 붉은 바위 · , 잿빛 풀숲 · = 바위 계단 · ~ 용암 · V 분기공 · T 마른 나무 · R · S · E
// 발전소 (kind 'plant'): X 바깥 · W 벽 · p q 관 · . 바닥 · o 스위치 · k 선반 · g 발전기 · c 상자 · G 큰 발전기 (2×2) · U V 계단 · E 문 · S
// 용의 굴 (kind 'dcave'): W 벽 · . 바닥 · ~ 물 · r O 바위 · K 용의 수정 · U 사다리 · V 내려가는 사다리 (0050: 용의 굴 깊은 곳)
// 0050 전설의 특별한 곳 (zone 없음 = 야생 포켓몬이 안 나오는 조용한 곳, 전설 자리만): 해변 글자 + m 초승달 꽃 · Y 수호신의 돌기둥 (꿈의 섬) ·
//      바깥 글자 + g 그라시데아 꽃 · Y 검이 꽂힌 바위 (성검의 숲) · 울트라 글자 + A 별의 제단 무늬 (별의 제단) · 사막 Y 유적의 내려가는 계단 (→ 고대 유적 = 제단 글자)
// zone (만남 구역): 'desert' 사막 (모래바람) · 'beach' 해변 · 'pond' (앱이 정함: 물가 2칸 안의 사파리존 풀숲) · 'grass' 사파리존 풀숲 · 'cave' 동굴 바닥 · 'deep' 깊은 바깥 구역 풀숲 · 'ultra' 울트라 스페이스
// warps: 'x,y' → [지도, x, y, 보는 쪽, 'warp'?]  (그 칸에 들어서면 화면이 어두워지며 옮겨 감. 'warp' = 워프홀 연출)
// 참고: 3세대 여울의 동굴 (물웅덩이·바위) · 미혹의 동굴 (갈림길 미로·점자·구멍) 느낌으로 새로 그린 지도 (원본 지도를 베끼지 않음)

// ─────────────────────── 전설 포켓몬 힌트 (사육사가 알려 줌) ───────────────────────
// teaser = 아직 도감에서 못 본 전설일 때 메뉴에 ??? 와 함께 보이는 귀띔. cond = 기본 조건 글 (0038 settings.legend_quests 기본값과 같음).
//    서버 (0038 safari_state · sync 의 legends) 가 hintsFromServer → setLegendHints 로 ok · caught · seen · 조건 글 + 진행 (예: '물 타입 4/20') 을 채움.
import { CAVES, CAVE_PORTS } from './safari-caves.js';

// space = 사육사 메뉴의 묶음 (LEGEND_SPACES). 0050: 아직 얻을 길이 없던 전설 · 환상 33마리 (서버 0050 legend_quests 와 같은 조건 글)
export const LEGEND_SPACES = [
  { id: 'regi', name: '거인의 동굴', where: '미혹의 동굴 · 여울의 동굴 깊은 곳', teaser: '점자 벽 아래 잠든 거인들' },
  { id: 'sea', name: '바다와 대지', where: '여울의 동굴 · 깊은 연못 · 깊은 동굴', teaser: '바다와 땅을 만든 포켓몬' },
  { id: 'sky', name: '하늘 언덕', where: '깊은 동굴 지하 2층 출구 너머', teaser: '하늘과 날씨의 포켓몬' },
  { id: 'seaway', name: '해변 바닷길', where: '해변 동쪽 끝 너머 긴 바닷가 · 모래톱 바닷길', teaser: '바다와 번개의 수호신' },
  { id: 'dream', name: '꿈의 섬', where: '해변 바닷길 동쪽 곶 미로 너머', teaser: '꿈을 지키는 포켓몬' },
  { id: 'flower', name: '꽃의 섬', where: '해변 바닷길 모래톱을 따라 남쪽 끝', teaser: '꽃밭과 풀숲의 포켓몬' },
  { id: 'forest', name: '성검의 숲', where: '깊은 연못 동쪽 길 너머 나무 미로', teaser: '검의 기사들' },
  { id: 'ddeep', name: '용의 굴 깊은 곳', where: '용의 굴 지하 2층 미로 끝 사다리 아래', teaser: '진실과 이상의 용' },
  { id: 'snowpeak', name: '얼음 미끄럼 길', where: '설원 가운데 단 동쪽 얼음 미끄럼 길 끝', teaser: '얼어붙은 빈 용' },
  { id: 'star', name: '별의 제단', where: '울트라 스페이스 · 그 위쪽 워프홀 너머', teaser: '하늘 너머에서 온 포켓몬' },
  { id: 'ruins', name: '고대 유적', where: '사막 서쪽 유적의 내려가는 계단 아래 (지하 1 · 2층)', teaser: '유적에 숨은 환상의 포켓몬' },
  { id: 'desert', name: '모래바람 지대', where: '사막 유적 둘레 · 동쪽 모래 언덕', teaser: '모래바람 속 포켓몬' },
  { id: 'plant', name: '발전소', where: '발전소 2층 · 3층 (스위치 퍼즐)', teaser: '기계와 번개의 포켓몬' },
  { id: 'lava', name: '용암 지대', where: '용암 호수 가라앉는 돌 다리 너머', teaser: '불꽃과 강철의 포켓몬' },
];
export const LEGEND_HINTS = [
  // 레지 셋 = 점자 동굴 (바위 · 얼음 · 강철 타입을 잡으면 깨어남) → 셋을 모두 잡으면 레지기가스
  { dex: 377, space: 'regi', teaser: '바위로 된 거인', name: '레지락', where: '미혹의 동굴 지하 2층, 점자 벽 아래 방', cond: '바위 타입 포켓몬을 8마리 잡아야 한대', ok: false },
  { dex: 378, space: 'regi', teaser: '얼음으로 된 거인', name: '레지아이스', where: '여울의 동굴 지하 2층, 점자 벽 아래 방', cond: '얼음 타입 포켓몬을 10마리 잡아야 한대', ok: false },
  { dex: 379, space: 'regi', teaser: '강철로 된 거인', name: '레지스틸', where: '미혹의 동굴 지하 3층, 점자 벽 아래 방', cond: '강철 타입 포켓몬을 8마리 잡아야 한대', ok: false },
  { dex: 486, space: 'regi', teaser: '거인들의 왕', name: '레지기가스', where: '미혹의 동굴 지하 3층 사다리 아래 거인의 제단', cond: '레지락·레지아이스·레지스틸을 모두 잡아야 한대', ok: false },
  { dex: 249, space: 'sea', teaser: '깊은 바다의 수호신', name: '루기아', where: '여울의 동굴 지하 3층, 깊은 물가', cond: '물 타입 포켓몬을 20마리 잡아야 한대', ok: false },
  { dex: 382, space: 'sea', teaser: '바다를 넓힌 포켓몬', name: '가이오가', where: '깊은 연못 (여울의 동굴 지하 2층 출구 너머)', cond: '사파리존에서 포켓몬을 15마리 잡아야 한대', ok: false },
  { dex: 383, space: 'sea', teaser: '땅을 넓힌 포켓몬', name: '그란돈', where: '깊은 동굴 지하 2층', cond: '땅 타입 포켓몬을 15마리 잡아야 한대', ok: false },
  { dex: 250, space: 'sky', teaser: '무지개 날개의 새', name: '칠색조', where: '하늘 언덕 (깊은 동굴 지하 2층 출구 너머)', cond: '불꽃·비행 타입 포켓몬을 20마리 잡아야 한대', ok: false },
  { dex: 384, space: 'sky', teaser: '하늘 높이 사는 용', name: '레쿠쟈', where: '하늘 언덕 꼭대기 동굴 너머 하늘의 제단', cond: '가이오가와 그란돈을 모두 잡아야 한대', ok: false },
  // ── 0050 ──
  { dex: 641, space: 'sky', teaser: '회오리바람을 부르는 포켓몬', name: '토네로스', where: '하늘 언덕 위쪽 왼편', cond: '비행 타입 포켓몬을 10마리 잡아야 한대', ok: false },
  { dex: 642, space: 'sky', teaser: '번개를 떨어뜨리는 포켓몬', name: '볼트로스', where: '하늘 언덕 위쪽 오른편', cond: '전기 타입 포켓몬을 10마리 잡아야 한대', ok: false },
  { dex: 645, space: 'desert', teaser: '땅을 기름지게 하는 포켓몬', name: '랜드로스', where: '모래바람 지대 동쪽 모래 언덕 아래', cond: '토네로스·볼트로스를 모두 잡아야 한대', ok: false },
  { dex: 380, space: 'dream', teaser: '마음을 읽는 붉은 용', name: '라티아스', where: '꿈의 섬 야자 미로 왼쪽 막다른 곳', cond: '에스퍼 타입 포켓몬을 10마리 잡아야 한대', ok: false },
  { dex: 381, space: 'dream', teaser: '마음을 읽는 푸른 용', name: '라티오스', where: '꿈의 섬 야자 미로 한가운데', cond: '드래곤 타입 포켓몬을 6마리 잡아야 한대', ok: false },
  { dex: 488, space: 'dream', teaser: '좋은 꿈을 꾸게 하는 포켓몬', name: '크레세리아', where: '꿈의 섬 야자 미로 오른쪽 위 막다른 곳', cond: '페어리 타입 포켓몬을 10마리 잡아야 한대', ok: false },
  { dex: 491, space: 'dream', teaser: '악몽을 꾸게 하는 포켓몬', name: '다크라이', where: '꿈의 섬 야자 미로 오른쪽 아래 막다른 곳', cond: '크레세리아를 잡아야 한대', ok: false },
  { dex: 489, space: 'seaway', teaser: '바다를 떠도는 작은 포켓몬', name: '피오네', where: '해변 바닷길 동쪽 모래톱 작은 섬', cond: '물 타입 포켓몬을 20마리 잡아야 한대', ok: false },
  { dex: 785, space: 'seaway', teaser: '번개의 수호신', name: '카푸꼬꼬꼭', where: '해변 바닷길 동쪽 곶 미로 왼쪽 위 구석', cond: '전기 타입 포켓몬을 10마리 잡아야 한대', ok: false },
  { dex: 786, space: 'flower', teaser: '비늘가루의 수호신', name: '카푸나비나', where: '꽃의 섬 꽃밭 단 위쪽', cond: '배틀에서 15번 이겨야 한대', ok: false },
  { dex: 787, space: 'flower', teaser: '풀숲의 수호신', name: '카푸브루루', where: '꽃의 섬 서쪽 풀숲', cond: '풀 타입 포켓몬을 12마리 잡아야 한대', ok: false },
  { dex: 788, space: 'seaway', teaser: '물의 수호신', name: '카푸느지느', where: '해변 바닷길 남쪽 모래톱 작은 섬', cond: '사파리존에서 포켓몬을 25마리 잡아야 한대', ok: false },
  { dex: 638, space: 'forest', teaser: '강철의 몸을 가진 기사', name: '코바르온', where: '성검의 숲 미로 오른쪽 위 막다른 곳', cond: '강철 타입 포켓몬을 10마리 잡아야 한대', ok: false },
  { dex: 639, space: 'forest', teaser: '바위를 부수는 기사', name: '테라키온', where: '성검의 숲 미로 오른쪽 아래 막다른 곳', cond: '바위 타입 포켓몬을 10마리 잡아야 한대', ok: false },
  { dex: 640, space: 'forest', teaser: '숲을 달리는 기사', name: '비리디온', where: '성검의 숲 미로 위쪽 가운데', cond: '격투 타입 포켓몬을 10마리 잡아야 한대', ok: false },
  { dex: 647, space: 'forest', teaser: '물 위를 달리는 어린 기사', name: '케르디오', where: '성검의 숲 미로 왼쪽 깊은 곳', cond: '코바르온·테라키온·비리디온을 모두 잡아야 한대', ok: false },
  { dex: 492, space: 'flower', teaser: '꽃밭에 숨은 작은 포켓몬', name: '쉐이미', where: '꽃의 섬 한가운데 높은 꽃밭', cond: '풀·벌레 타입 포켓몬을 15마리 잡아야 한대', ok: false },
  { dex: 643, space: 'ddeep', teaser: '진실을 좇는 흰 용', name: '레시라무', where: '용의 굴 깊은 곳 왼편', cond: '용의 굴에서 포켓몬을 6마리 잡아야 한대', ok: false },
  { dex: 644, space: 'ddeep', teaser: '이상을 좇는 검은 용', name: '제크로무', where: '용의 굴 깊은 곳 오른편', cond: '용의 굴에서 포켓몬을 10마리 잡아야 한대', ok: false },
  { dex: 646, space: 'snowpeak', teaser: '얼어붙은 빈 용', name: '큐레무', where: '설원 얼음 미끄럼 길 건너편 끝', cond: '레시라무·제크로무를 모두 잡아야 한대', ok: false },
  { dex: 789, space: 'star', teaser: '별의 아이', name: '코스모그', where: '울트라 스페이스 한가운데', cond: '울트라 스페이스에서 포켓몬을 5마리 잡아야 한대', ok: false },
  { dex: 800, space: 'star', teaser: '빛을 먹는 검은 포켓몬', name: '네크로즈마', where: '별의 제단 맨 위', cond: '코스모그를 잡아야 한대', ok: false },
  { dex: 385, space: 'star', teaser: '소원을 들어주는 별', name: '지라치', where: '별의 제단 왼쪽 위', cond: '퀴즈를 7번 연속으로 맞혀야 한대', ok: false },
  { dex: 386, space: 'star', teaser: '우주에서 온 포켓몬', name: '테오키스', where: '별의 제단 오른쪽 위', cond: '울트라 스페이스에서 포켓몬을 8마리 잡아야 한대', ok: false },
  { dex: 720, space: 'desert', teaser: '고리로 무엇이든 부르는 포켓몬', name: '후파', where: '모래바람 지대 서쪽 유적 바닥', cond: '서로 다른 시간대의 레이드에 3번 참가해야 한대', ok: false },
  { dex: 494, space: 'ruins', teaser: '승리를 가져다주는 포켓몬', name: '비크티니', where: '고대 유적 지하 1층 왼쪽 위 구석', cond: '배틀에서 10번 이겨야 한대', ok: false },
  { dex: 649, space: 'ruins', teaser: '고대에서 되살아난 포켓몬', name: '게노세크트', where: '고대 유적 지하 2층 오른쪽 위 제단', cond: '벌레 타입 포켓몬을 10마리 잡아야 한대', ok: false },
  { dex: 719, space: 'ruins', teaser: '보석을 만드는 포켓몬', name: '디안시', where: '고대 유적 지하 1층 미로 오른쪽 아래', cond: '사막에서 포켓몬을 12마리 잡아야 한대', ok: false },
  { dex: 802, space: 'ruins', teaser: '그림자에 숨은 포켓몬', name: '마샤도', where: '고대 유적 지하 2층 오른쪽 아래 제단', cond: '고스트 타입 포켓몬을 8마리 잡아야 한대', ok: false },
  { dex: 807, space: 'plant', teaser: '번개처럼 빠른 포켓몬', name: '제라오라', where: '발전소 3층 가운데 큰 발전기 옆', cond: '발전소에서 포켓몬을 12마리 잡아야 한대', ok: false },
  { dex: 801, space: 'plant', teaser: '사람이 만든 포켓몬', name: '마기아나', where: '발전소 3층 오른쪽 위 방', cond: '강철·페어리 타입 포켓몬을 12마리 잡아야 한대', ok: false },
  { dex: 772, space: 'plant', teaser: '탈을 쓴 인공 포켓몬', name: '타입:널', where: '발전소 2층 큰 발전기 방', cond: '포켓몬을 40마리 잡아야 한대', ok: false },
  { dex: 485, space: 'lava', teaser: '용암 속에 사는 포켓몬', name: '히드런', where: '용암 호수 가라앉는 돌 다리 너머 섬', cond: '용암 지대에서 포켓몬을 10마리 잡아야 한대', ok: false },
];

// 울트라비스트: 울트라 스페이스 (zone 'ultra') 에서만 나오는 포켓몬 (전국도감 번호). 서버 (0038 lines.ultra) 가 p_zone 으로 고름.
export const ULTRA_BEASTS = [793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806];
// 구역 힌트 (사육사가 전설 힌트 다음에 알려 줌). ⚠ 자리표시 글.
export const ZONE_HINTS = [
  { zone: 'beach', name: '해변', where: '사파리존 동쪽 끝 모래길 너머', cond: '얕은 물과 바닷가 풀숲에서 물 · 얼음 타입 포켓몬이 나온대', more: '산호초가 있는 동쪽 끝으로 갈수록 레벨이 높은 포켓몬이 산단다. 연못 가까운 풀숲에도 물 포켓몬이 가끔 나오지.' },
  { zone: 'desert', name: '모래바람 지대', where: '사파리존 서쪽 끝 모래길 너머 사막', cond: '마른 모래 풀숲에서 땅 · 바위 타입 포켓몬이 나온대', more: '모래바람이 늘 거세게 불어서 앞이 잘 안 보인단다. 서쪽 끝 무너진 유적으로 갈수록 레벨이 높은 포켓몬이 살지. 선인장 같은 사막 포켓몬도 가끔 보인대.' },
  { zone: 'snow', name: '설원', where: '사파리존 맨 위 길 너머', cond: '눈 속 풀숲에서 얼음 · 페어리 타입 포켓몬이 나온대', more: '눈이 늘 펑펑 내린단다. 얼어붙은 연못 위는 미끄러우니 조심하렴. 위로 올라갈수록 레벨이 높은 포켓몬이 살지.' },
  { zone: 'lava', name: '용암 지대', where: '사파리존 왼쪽 아래 길 너머', cond: '잿빛 풀숲에서 불꽃 · 강철 타입 포켓몬이 나온대', more: '용암 호수는 뜨거워서 들어갈 수 없단다. 아래 용암 호수 쪽으로 갈수록 레벨이 높은 포켓몬이 살지.' },
  { zone: 'plant', name: '발전소', where: '사파리존 왼쪽 위 구석 건물', cond: '건물 안 바닥 어디서나 전기 · 고스트 타입 포켓몬이 나온대', more: '풀숲이 없어도 동굴처럼 걷기만 하면 포켓몬이 나온단다. 2층 큰 발전기 근처 포켓몬이 더 강하지.' },
  { zone: 'ultra', name: '울트라 워프홀', where: '깊은 동굴 지하 2층 어딘가', cond: '그 너머 울트라 스페이스에서만 울트라비스트가 나온대', more: '텅비드, 매시붕, 페로코체, 전수목, 철화구야, 종이신도, 악식킹, 베베놈, 아고용, 차곡차곡, 두파팡… 모두 다른 세계에서 온 포켓몬이란다.' },
];

const BRAILLE = '벽에 점자가 새겨져 있다… "깊은 곳에 잠든 거인을 깨우려면 세 개의 돌을 모아라."';

export const MAPS = {
  safari: {
    name: '사파리존', kind: 'out', zone: 'grass', start: [31, 47, 'up'],
    rows: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT##TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      '^^^^^^MMMMMTTTTTTTTTTTTTTTTTTTT##TTTTTTTTTTTTTTTTTTTMMMMMTTTTTTT',
      '^^^^^^MMCMMTTTTTTTTTTTTTTTTTTTT##TTTTTTTTTTTTTTTTTTTMMCMMTTTTTTT',
      '^^^^^^........................S...........................TTTTTT',
      '^^^^^^,,,,,,,........,,,,,...,,,,,,.......................TTTTTT',
      'H^^D^^,,,,,,,........,,,,,...,,,,,,.........,,,,,,,,,,,,,,,TTTTT',
      'TTS..,,,,,,,,........,,,,,...,,,,,,.........,,,,,,,,R,,,,,,..TTT',
      'TTT........~~~~~.....,,,,,..................,,,,,,,,,,,,,,,..TTT',
      'TTT......~~~~~~~~~...,,,,,..................,,,R,,,,,,,,,,,..TTT',
      'TTT....~~~~~~~~~~~~~.......TTTTTTTTTT.......,,,,,,,,,,,,R,,..TTT',
      'TTT....~~~~~~~~~~~~~.......TTTTTTTTTT.......,,,,,,,,,,,,,,,..TTT',
      'TTT...~~~~~~~~~~~~~~~......TTTTTTTTTT.......,,,,,,,,,,,,,,,..TTT',
      'TTT...bbbbbbbbbbbbbbb......TTTTTTTTTT.....R..................TTT',
      'TTT...~~~~~~~~~~~~~~~......TTTTTTTTTT...........##.R.....R...TTT',
      'TTT....~~~~~~~~~~~~~.......TTTTTTTTTT..,,,,,,,,,##,..........TTT',
      'TTT....~~~~~~~~~~~~~.......TTTTTTTTTT..,,,,,,,,,##,..,,,,,,,.TTT',
      'TTT......~~~~~~~~~.........TTTMMMMMTT..,,,,,,,,,##,..,,,,,,,.TTT',
      'TTT,,,,,,..~~~~~.,,,,,,,,,.TTTMMCMMTT..,,,,,,R,,##,..,,,,,,,.TTT',
      'TTT,,,,,,........,,,,,,,,,.............,,,,,,,,,##,..,,R,,,,.TTT',
      'TTT,,,,,,.....##.,,,,,,,,,,,,,....,,,,,,,,,,,,,,##,..,,,,,,,.TTT',
      'TTT,,,,,,.....##.,,,,,,,,,,,,,....,,,,,,,,,,,,,,##,..,,,,,,,.TTT',
      'TTT,,,,,,...S.##.,,,,,,,,,,,,,....,,,,,,,,,,,,,,##,S.,,,,,,,.TTT',
      'TTT...........##.......,,,,,,,....,,,,,,,.......##...........TTT',
      'TTTTTTTTTTTTTT##TTTTTT....................TTTTTT##TTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTT##TTTTTT.......S............TTTTTT##TTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTT####################################TTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTT####################################TTTTTTTTTTTTTT',
      'TTT............................##............................TTT',
      'TTT............,,,,,,,,,,......##.......,,,,,,,,,,,,,........TTT',
      'TTT..FFFFFFFFF.,,,,,,,,,,......##.......,,,,,,,,,,,,,.~~~~~..TTT',
      'TTT..FfffffffF.,,,,,,,,,FFFFFF.##.FFFFFF,,,,,,,,,,,,,~~~~~~~.TTT',
      'TTT..FfffffffF.,,,,,,,,,FffffF.##.FffffF,,,,,,,,,,,,,~~~~~~~.TTT',
      'TTT..FfffffffF.,,,,,,,,,FffffF.##.FffffF,,,,,,,,,,,,,~~~~~~~.TTT',
      'TTT..FfffffffF.,,,,,,,,,Fffff..##..ffffF,,,,,,,,,,,,,.~~~~~..TTT',
      'TTT..FfffffffF.,,,,,,,,,FffffF.##.FffffF,,,,,,,,,,,,,........TTT',
      'TTT..FFFF.FFFF..........FFFFFF.##.FFFFFF,,,,,,,,,,,,,........TTT',
      '#################################.............S...........R#####',
      '#################################.................R....#########',
      'TTT.S........S.........,,,,,,..##..,,,,,,...,,,,,,,,,,,,,,,,.TTT',
      'TTT,,,,,,,,,,..FFF.FFFF,,,,,,..##..,,,,,,...,,,,,,,,,,,,,,,,.TTT',
      'TTT,,,,,,,,,,..FffffffF,,,,,,..###############,,,,,,,,,,,,,,.TTT',
      'TTT,,,,,,,,,,..FffffffF,,,,,,..###############,,,,,,,,,,,,,,.TTT',
      'TTT,,,,,,,,,,..FffffffF,,,,,,..##..,,,,,,.TT,,,,,,,,,,,,,,,,.TTT',
      'TTT,,,,,,,,,,..FffffffF,,,,,,..##..,,,,,,.TT,,,,,,,,,,,,,,,,.TTT',
      'TTT,,,,,,,,,,..FffffffF........##.........TT,,,,,,,,,,,,,,,,.TTT',
      'TTT,,,,,,,,,,..FFFFFFFF........##.S.......TT,,,,,,,,,,,,,,,,.TTT',
      'TTTTTTTTTTT.##.S....TTTTTTTTT..##..TTTTTTTTT..........TTTTTTTTTT',
      'TTTTTTTTTTT.##......TTTTTTTTT..##..TTTTTTTTT..........TTTTTTTTTT',
      'TTTTTTTTTTTT##TTTTTTTTTTTTTTTTG##GTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTT##TTTTTTTTTTTTTTTTT##TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTT##TTTTTTTTTTTTTTTTT##TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTT##TTTTTTTTTTTTTTTTT##TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ],
    warps: { '8,2': 'shoal.in', '54,2': 'maze.in', '32,17': 'deep.in', '63,36': ['beach', 1, 5, 'right'], '63,37': ['beach', 1, 6, 'right'],
              '0,36': ['desert', 60, 10, 'left'], '0,37': ['desert', 60, 11, 'left'],
              '31,0': ['snow', 21, 32, 'up'], '32,0': ['snow', 22, 32, 'up'], '12,51': ['lava', 20, 1, 'down'], '13,51': ['lava', 21, 1, 'down'],
              '3,5': ['plant1', 14, 19, 'up'] },
    signs: {
      '34,45': '사파리존에 어서 와요! 키 큰 풀숲을 걸으면 야생 포켓몬이 나와요. 궁금한 건 옆의 사육사에게 물어보세요.',
      '29,24': '↖ 연못 구역 · 여울의 동굴 · 발전소   ↗ 바위 구역 · 미혹의 동굴   ↑ 깊은 동굴 · 설원   ↙ 사막 · 용암 지대   ↘ 해변   ↓ 입구',
      '12,21': '연못 구역: 다리를 건너 보세요. 물가 풀숲에도 포켓몬이 숨어 있대요!',
      '51,21': '바위 구역: 바위 사이 풀숲이 아주 넓어요.',
      '46,36': '← 꽃밭 · 사막   → 해변   남동 풀숲은 사파리존에서 가장 넓은 풀숲이에요!',
      '13,38': '울타리 안 꽃밭은 들어가서 구경할 수 있어요.',
      '4,38': '← 모래바람 지대 (사막): 모래바람이 거세게 부는 곳이에요. 마른 풀숲에 땅 · 바위 타입 포켓몬이 산대요!',
      '30,3': '↑ 설원: 눈이 펑펑 내리는 곳이에요. 얼음 · 페어리 타입 포켓몬이 산대요! 얼어붙은 연못 위는 미끄러워요.',
      '2,6': '발전소: 안에서는 바닥 어디를 걸어도 전기 · 고스트 타입 포켓몬이 나와요. 2층에는 커다란 발전기가 있대요!',
      '15,46': '↓ 용암 지대: 후끈한 열기가 느껴지는 곳이에요. 불꽃 · 강철 타입 포켓몬이 산대요. 용암에는 들어갈 수 없어요!',
    },
    npcs: [{ id: 'keeper', x: 30, y: 45, dir: 'down' }],
    legends: [],
  },

  // 해변 (0040): 사파리존 동쪽 끝 모래길 너머. 얕은 물 (w) · 바닷가 풀숲 (,) 에서 물 · 얼음 타입 포켓몬. 동쪽 끝 산호초로 갈수록 레벨이 높음 (Lv.10 → 50)
  beach: {
    name: '해변', kind: 'beach', zone: 'beach', start: [1, 5, 'right'],
    rows: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTT....,,,....TTTTT...,,,,,...TTTTT....,,,,,.....TTTTT...,,,TTT',
      'TT....,,,,,,,..h....,,,,,,,,.......,,,,,,,,,,....h....,,,,,,,.TT',
      'TT.S..,,,,,,,......,,,,,,,,,,..R...,,,,,,,,..........,,,,,,,,STT',
      'E.........,,,,.........,,,,......h.....,,,,....R.......,,,,,....',
      'E.....h.........................................................',
      'TT..........R.........h..............R..........h...........RRTT',
      'TT............................................................TT',
      'TTwwwww.....wwwwwwww.......wwwwwwwwww.....wwwwwwwwwwwwwwwwwwRRTT',
      'TTwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwcwwwwwwwwRRT',
      'TTwwwcwwwwwwwwwcwwwwwwwwwwwwwwcwwwwwwwwwwwcwwwwwwwwwwwwwcwwwwwRT',
      '~~wwwwwww~~~~wwwwwwwwww~~~~~wwwwwwwww~~~~wwwwwwcwwwwwwwwwwwwwwRT',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~wwwwwwwwwcwwwwwwwwwRT',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~wwwwwwwwwwwcwwwwRT',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~wwwwwwwwwwwRT',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~wwcwwRT',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~T',
    ],
    warps: { '0,5': ['safari', 62, 36, 'left'], '0,6': ['safari', 62, 37, 'left'], '63,5': ['beach2', 1, 5, 'right'], '63,6': ['beach2', 1, 6, 'right'] },
    signs: { '61,4': '→ 해변 바닷길: 더 강한 물 포켓몬이 사는 긴 바닷가예요. 그 끝에 꿈의 섬과 꽃의 섬이 있대요!', '3,4': '해변: 얕은 물과 바닷가 풀숲에 물 · 얼음 타입 포켓몬이 살아요. 동쪽 산호초로 갈수록 강한 포켓몬이 나온대요!' },
    npcs: [], legends: [],
  },

  // 0054 해변 둘째 길: 해변 동쪽 끝 너머 더 긴 바닷가. 얕은 물 (w) · 바닷가 풀숲 (,) 에서 물 · 얼음 타입 (해변보다 강함).
  //   동쪽 곶 = 야자 · 바위 미로 (구석에 카푸꼬꼬꼭, 끝에 꿈의 섬 나루) · 남쪽 = 갈라진 바닷길: 모래톱 (B) 을 밟으면 그 모래톱에 닿은 바닷길 (P) 이 드러남
  //   (지도에 다시 들어오면 다시 잠김) → 피오네 · 카푸느지느의 작은 섬 → 맨 아래 꽃의 섬
  beach2: {
    name: '해변 바닷길', kind: 'beach', zone: 'beach', start: [1, 5, 'right'], seaway: true,
    rows: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTRRTTTRTTTTTRTRTTTTT',
      'TTTT...,,,,....TTTTT....,,,,....TTTTT...,,,,,....TTTT.....T.....T.....TT',
      'TT....,,,,,,,..h...TT..,,,,,,.....TT...,,,,,,,...TTTRTTTR.R.T.R.T.T.T.RT',
      'TT.S..,,,,,,.........,,,,,,,,..R......,,,,,,.....,TTT...T.R.R.R.R...T.TT',
      'E........,,,,..........,,,,,........h.....,,,,....,,..R.T.TTR.T.T.T.RT.E',
      'E.....h..........R...............R..............,,,,..R.T.....T.T......E',
      'TT.......TT..........h......TT.........R.....h..,,,,T.TTRRRRTRT.TRRTT.TT',
      'TT......TTTT..R............TTTT.............TT...,,,R.........T.......TT',
      'TT.......TT..........R.......TT......h.....TTTT..,,,R.TTT.TTTRTTTTTTT.TT',
      'wwwwwwwwwwwwwwwwwwwwwwwwcwwwwwwwwwwwwwwwwwwwcwwwwwwwT.T.T.......T...T.TT',
      'wwcwwwwwwwwcwwwwwcwwwwwwwwwwwwwcwwwwwwwcwwwwwwwwwwwwT.R.T.T.T.T.T.T.T.RT',
      'wwwwwwwwwwwwwwwwwwwwBwwwwwwwwwwwwwwwwwwww~~~~~~~~~~~R.....T...R...T...TT',
      '~~~~~~~~~~~~~~~~~~~~P~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~TTRRTTTRRTRTTTTTRTRT',
      '~~~~~~~~~~~~~~~~~~~~PPPPPPPPP~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~P~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~P~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~B~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~PPPPPPPPPPPPPPP.~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~P~~~~~~~~~~~~~.B.~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~P~~~~~~~~~~~~~~...~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~P~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~PPPPPP~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~P~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~B~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~PPPPPP~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~P~~~~PB.~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~P~~~~...~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~B~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~P~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    ],
    warps: { '0,5': ['beach', 62, 5, 'left'], '0,6': ['beach', 62, 6, 'left'], '71,5': ['dreamIsle', 1, 12, 'right'], '71,6': ['dreamIsle', 1, 13, 'right'],
              '33,29': ['flowerIsle', 17, 1, 'down'] },
    signs: { '3,4': '해변 바닷길: 바다 한가운데 모래톱을 밟으면 바닷길이 열린대요! 동쪽 곶 너머는 꿈의 섬 나루예요.' },
    npcs: [], legends: [{ dex: 785, x: 53, y: 2 }, { dex: 489, x: 45, y: 20 }, { dex: 788, x: 40, y: 27 }],
  },
  // 0054 꽃의 섬: 바닷길 끝 (zone 없음 = 조용한 곳). 섬 둘레를 돌아 남쪽 돌계단 → 꽃밭 단 (q 꽃밭) → 가운데 높은 단 (쉐이미)
  flowerIsle: {
    name: '꽃의 섬', kind: 'out', zone: null, start: [17, 1, 'down'],
    rows: [
      '~~~~~~~~~~~~~~~~~.~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~TTTT...TTTT~~~~~~~~~~~',
      '~~~~~~~~~TTT.f.......f.TTT~~~~~~~~',
      '~~~~~~~TT..,,,.....,,,,...TT~~~~~~',
      '~~~~~~T...,,,,,..f..,,,,,...T~~~~~',
      '~~~~~T.f...,,,..TTTT..,,,..f.T~~~~',
      '~~~~T.....MMMMMMMMMMMMMMMM....T~~~',
      '~~~~T.f...MMMMMMMMMMMMMMMM..f.T~~~',
      '~~~~T.....M..............M....T~~~',
      '~~~T,,....M.qqqq.ff.qqqq.M...,,T~~',
      '~~~T,,,...M.qqqq....qqqq.M..,,,T~~',
      '~~~T,,....M..............M...,,T~~',
      '~~~T......M..MMMMMMMMMM..M.....T~~',
      '~~~T..f...M..MMMMMMMMMM..M..f..T~~',
      '~~~T......M..M........M..M.....T~~',
      '~~~T,,,...M..M.qq..qq.M..M..,,,T~~',
      '~~~T,,,...M..M.qq..qq.M..M..,,,T~~',
      '~~~T......M..M........M..M.....T~~',
      '~~~T..f...M..MMMM==MMMM..M..f..T~~',
      '~~~T......M..MMMM==MMMM..M.....T~~',
      '~~~~T.....M..............M....T~~~',
      '~~~~T.....M.qqq.f..f.qqq.M....T~~~',
      '~~~~T.f...M.qqq......qqq.M..f.T~~~',
      '~~~~T.....MMMMMMM==MMMMMMM....T~~~',
      '~~~~~T....MMMMMMM==MMMMMMM...T~~~~',
      '~~~~~~T.,,,,,..........,,,,.T~~~~~',
      '~~~~~~~TT..,,,..f..f..,,,..TT~~~~~',
      '~~~~~~~~~TTT...........TTT~~~~~~~~',
      '~~~~~~~~~~~~TTTTTTTTTTT~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    ],
    warps: { '17,0': ['beach2', 33, 28, 'up'] },
    signs: {}, npcs: [],
    legends: [{ dex: 492, x: 17, y: 15 }, { dex: 786, x: 17, y: 9 }, { dex: 787, x: 5, y: 15 }],
  },

  // 사막 · 모래바람 지대 (0043): 사파리존 서쪽 끝 모래길 너머. 마른 모래 풀숲 (,) 에서 땅 · 바위 타입 포켓몬. 늘 모래바람이 붊 (safari.js sandstorm).
  //   동쪽 입구에서 서쪽 끝 무너진 유적으로 갈수록 레벨이 높음 (Lv.15 → 45). 미로 없이 넓게: 모래 언덕 · 모래 물결 · 선인장 · 뼈 · 유적
  desert: {
    name: '모래바람 지대', kind: 'desert', zone: 'desert', start: [60, 10, 'left'],
    rows: [
      'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
      'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
      'MMMM..,,,,,,....MMMMMMM...----...,,,,,....MMMMM....,,,,,.MMMMM',
      'MM....,,,,,,,.....MMMM...C.----..,,,,,,,..MMM...c..,,,,,..MMMM',
      'MM.P..P..P..P........b.......----.,,,,,,,........-----......MM',
      'MM..xxxxxxxxx...,,,,.....^^^......,,,,,..R...^^^..-----..C..MM',
      'MM..xxxxYxxxx..,,,,,,....D^^.........b.......D^^........c...MM',
      'MM.PxxxxKxxxxP.,,,,,,,..---.....,,,,,..........---..,,,.....MM',
      'MM..xxxoxxxxx...,,,,,..----....,,,,,,,,..C..-----..,,,,,.S..MM',
      'MM.PxxxxxxxoxP...,,...----.....,,,,,,,,,....---...,,,,,,....MM',
      'MM..xxxxxxxxx..........--..c....,,,,,,,..............,,,,....E',
      'MM.P..P..P..P..R.......................---........---........E',
      'MM......,,,,,......b......^^^......----...^^^..........R....MM',
      'MM..,,,,,,,,,,....------..D^^.............D^^....,,,,,......MM',
      'MM.,,,,,,,,,,,,..------........C...,,,,,,.........,,,,,,,...MM',
      'MM..,,,,,c,,,,,......------......,,,,,,,,,..b....,,,,,,,..C.MM',
      'MM....,,,,,,,.........--...,,,,..,,,,,,,,,......,,,,,,,,....MM',
      'MMM.^^^..R.......C.......,,,,,,,..,,,,,,.....^^^...,,,,..c..MM',
      'MMMMD^^.---.........,,,,,,,,,,.........----..D^^.........MMMMM',
      'MMMMMM..----...MMMM....,,,,,,....MMMMM....-----...MMMMMMMMMMMM',
      'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
      'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
    ],
    warps: { '61,10': ['safari', 1, 36, 'right'], '61,11': ['safari', 1, 37, 'right'], '8,6': ['ruins1', 11, 19, 'up'] },
    signs: { '57,8': '모래바람 지대: 모래바람이 거세게 부는 사막이에요. 마른 모래 풀숲에 땅 · 바위 타입 포켓몬이 살아요. 서쪽 유적으로 갈수록 강한 포켓몬이 나온대요!' },
    npcs: [], legends: [{ dex: 720, x: 8, y: 9 }, { dex: 645, x: 56, y: 16 }],
  },

  // ── 0048 ── 설원: 사파리존 맨 위 길 너머. 눈 속 키 큰 풀숲 (,) 에서 얼음 · 페어리 타입. 아래 입구에서 위로 갈수록 레벨이 높음 (Lv.18 → 45).
  //   눈 덮인 흙 턱 (M, 2줄 = 윗면 + 벽면) 사이 돌계단 (=) · 얼어붙은 연못 (I, 밟으면 반대편까지 미끄러짐) · 오두막 (H = 2×2 칸의 왼쪽 아래, 나머지 ^) · 눈사람 (n)
  snow: {
    name: '설원', kind: 'snow', zone: 'snow', start: [21, 32, 'up'],
    rows: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTT,,,,,,,...TTTTTTTT......,,,,,,,,....TTTTTTTTTTTTTTTTTTTT...T',
      'TTT,,,,,,,,,,...TTTT.....R..,,,,,,,,,,...TTTTIIIIIRIIIIIRIIT...T',
      'TT,,,,,,,,,,,,.........n....,,,,,,,,,,....TTTIIIIIRRIIIIIII..,.T',
      'TT..,,,,,,,,...S...........,,,,,,,,,......TTTRIIIIIIIIIRIIIT...T',
      'TT.....................T..............T...TTTIIIIIIIIRIIIIITTTTT',
      'TTMMMMMMMMMMMMMMMM==MMMMMMMMMMMMMMMMMMMMMMTTTIIIIIIRIIIIIIITTTTT',
      'TTMMMMMMMMMMMMMMMM==MMMMMMMMMMMMMMMMMMMMMMTTTRIIIIIIIIIIIIITTTTT',
      'TT....T.......,,,,,,,,....T.......IIIIII.STTTIRIIIIIIIIIIIITTTTT',
      'TT.^^....T....,,,,,,,,,..........IIIIIIII....IIIRIIIIIIIIIRTTTTT',
      'TT.H^.........,,,,,,,,,.....T....IIIIIIII.TTTIIRIIIIIIIIRIITTTTT',
      'TT.......R.....,,,,,,,......,,...IIIIIIII.TTTTTTTTTTTTTTTTTTTTTT',
      'TT..T.................T....,,,,...IIIIII..TTTTTTTTTTTTTTTTTTTTTT',
      'TTT..........T...........,,,,,,..........TTTTTTTTTTTTTTTTTTTTTTT',
      'TTMMMMMMMM==MMMMMMMMMMMMMMMMMMMMMMM==MMMMMTTTTTTTTTTTTTTTTTTTTTT',
      'TTMMMMMMMM==MMMMMMMMMMMMMMMMMMMMMMM==MMMMMTTTTTTTTTTTTTTTTTTTTTT',
      'TT,,,,,,.........TTTT.......T.......,,,,,,TTTTTTTTTTTTTTTTTTTTTT',
      'TT,,,,,,,,....T..TTTT..............,,,,,,,TTTTTTTTTTTTTTTTTTTTTT',
      'TT,,,,,,,,,.......TT.....IIIII.....,,,,,,,TTTTTTTTTTTTTTTTTTTTTT',
      'TT.,,,,,,,..T..........IIIIIIIII....,,,,,.TTTTTTTTTTTTTTTTTTTTTT',
      'TT.......S.............IIIIIIIII..T.......TTTTTTTTTTTTTTTTTTTTTT',
      'TT..T....,,,,,.........IIIIIIIII.......T..TTTTTTTTTTTTTTTTTTTTTT',
      'TT......,,,,,,,..T.......IIIII.....^^.....TTTTTTTTTTTTTTTTTTTTTT',
      'TTT.....,,,,,,,..............R.....H^..T.TTTTTTTTTTTTTTTTTTTTTTT',
      'TTTT.....,,,,,.....T......................TTTTTTTTTTTTTTTTTTTTTT',
      'TTTTT.........................,,,,,,,..TTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTT....T......,,,,,.......,,,,,,,,..TTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTT.........,,,,,,,..S...,,,,,,,..TTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTT........,,,,,,,......,,,,,...TTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTT.......,,,,,..............TTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTT...........TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTT..TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTEETTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ],
    warps: { '21,33': ['safari', 31, 1, 'down'], '22,33': ['safari', 32, 1, 'down'] },
    signs: {
      '26,28': '설원: 키 큰 풀숲에 얼음 · 페어리 타입 포켓몬이 살아요. 위로 올라갈수록 강한 포켓몬이 나온대요!',
      '9,21': '얼어붙은 연못: 한번 미끄러지면 반대편까지 멈추지 않아요!',
      '15,5': '설원 꼭대기: 이 근처 포켓몬은 아주 강하대요.',
      '41,9': '→ 얼음 미끄럼 길: 한번 미끄러지면 바위에 부딪칠 때까지 멈추지 않아요. 바위를 잘 이용해서 건너편 끝까지 가 보세요!',
    },
    npcs: [], legends: [{ dex: 646, x: 61, y: 3 }],
  },

  // 용암 지대: 사파리존 왼쪽 아래 길 너머. 잿빛 풀숲 (,) 에서 불꽃 · 강철 타입. 위 입구에서 아래 용암 호수로 갈수록 레벨이 높음 (Lv.20 → 48).
  //   검붉은 계단식 절벽 (M) 사이 바위 계단 (=) · 용암 (~, 막힘) · 분기공 (V, 김) · 재 덮인 마른 나무 (T)
  lava: {
    name: '용암 지대', kind: 'lava', zone: 'lava', start: [20, 1, 'down'],
    rows: [
      'MMMMMMMMMMMMMMMMMMMMEEMMMMMMMMMMMMMMMMMMMM',
      'MMMMMMMMMMMMMMMMMMMM..MMMMMMMMMMMMMMMMMMMM',
      'MMTT,,,,....MMMMMM......MMMMMM....,,,,TTMM',
      'MMT,,,,,,.....S.............R.....,,,,,,MM',
      'MM,,,,,,,..............V...........,,,,,MM',
      'MM..,,,,......R.................T.......MM',
      'MMMMMM==MMMMMMMMMM==MMMMMMMMMMMMMMMMMMMMMM',
      'MMMMMM==MMMMMMMMMM==MMMMMMMMMMMMMMMMMMMMMM',
      'MM.........~~~~.........,,,,,,....V.....MM',
      'MM..V.....~~~~~~.......,,,,,,,,.........MM',
      'MM.......~~~~~~~~......,,,,,,,,,...T....MM',
      'MM,,,,..~~~~~~~~~~.......,,,,,,.........MM',
      'MM,,,,,..~~~~~~~~~~~~~~~~~~~..~~~~~~~~~~MM',
      'MM,,,,,,...~~~~~~~~~~~~~~~~~..~~~~~~~~~~MM',
      'MM.,,,,,.......,,,,,,.......R....V......MM',
      'MM.....T......,,,,,,,,...............T..MM',
      'MMMMMM==MMMMMMMMMMMMMMMMMM==MMMMMMMMMMMMMM',
      'MMMMMM==MMMMMMMMMMMMMMMMMM==MMMMMMMMMMMMMM',
      'MM.....,,,,,,.......V.......,,,,,.......MM',
      'MM...,,,,,,,,,,..........R..,,,,,,,..T..MM',
      'MM..T,,,,,,,,,,......T.......,,,,,,,....MM',
      'MM......,,,,,..........~~~~~~~..........MM',
      'MM..R...............~~~~~~~~~~~~~...V...MM',
      'MM.......,,,,,,....~22s111~~~~~~~~......MM',
      'MM.....,,,,,,,,,..~~2~~~~s~~~~~~~~~.....MM',
      'MMT....,,,,,,,,,..11s~~~~...~~~~~~~..T..MM',
      'MM......,,,,,,....~~~~~~~...~~~~~~~.....MM',
      'MM..V.............~~~~~~~~~~~~~~~~......MM',
      'MM..........S......~~~~~~~~~~~~~~...,,,,MM',
      'MMTT.......T.........~~~~~~~~~...,,,,,,,MM',
      'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
      'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
    ],
    warps: { '20,0': ['safari', 12, 50, 'up'], '21,0': ['safari', 13, 50, 'up'] },
    signs: {
      '14,3': '용암 지대: 잿빛 풀숲에 불꽃 · 강철 타입 포켓몬이 살아요. 아래 용암 호수 쪽으로 갈수록 강한 포켓몬이 나온대요!',
      '12,28': '용암 호수: 가까이 가면 뜨거워요! 깜빡이는 돌은 곧 가라앉아요. 가라앉지 않는 돌에서 기다렸다가 건너 보세요!',
    },
    npcs: [], legends: [{ dex: 485, x: 26, y: 26 }],
  },

  // 발전소 (동굴처럼 건물 안): 사파리존 왼쪽 위 건물 문 → 1층 → 2층 → 3층. 바닥 어디서나 전기 · 고스트 타입.
  //   X 바깥 (검정) · W 벽 · p q 벽 속 파랑 · 초록 관 · k 기계 선반 · g 초록 발전기 · c 노란 상자 · G 큰 발전기 (2×2 칸의 왼쪽 아래, 나머지 ^) · U V 계단 · E 나가는 문
  //   0054 스위치 퍼즐 (뉴보라 같은): 1 초록 스위치 · 2 파랑 스위치 · 3 초록 문 · 4 파랑 문 — 초록을 밟으면 초록 문이 내려가고 파랑 문이 올라감 (open = 처음 열린 색)
  //   1층 = 연습: 파랑 문 (왼쪽 통로) 으로 위층 왼쪽 방 → 초록 스위치 → 초록 문 (가운데 · 오른쪽 통로) 이 열려 계단으로
  plant1: {
    name: '발전소', kind: 'plant', zone: 'plant', open: 'b',
    rows: [
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      'XWWWWWWWWWWWWXXXXWWWWWWWWWWWWX',
      'XWWWpWWWWWqWWXXXXWWWWWWpWWWWWX',
      'XWkk.g...c.cWXXXXWk.gg...U.kWX',
      'XW..........WXXXXW..........WX',
      'XW...1......WWWWWW....1.....WX',
      'XW............3.............WX',
      'XW..........WWWqWW..........WX',
      'XWc...c.....WXXXXWc........cWX',
      'XWWWW..WWWWWWXXXXWWWWWW..WWWWX',
      'XXXXW44WXXXXXXXXXXXXXXW33WXXXX',
      'XXXXW..WXXXXXXXXXXXXXXW..WXXXX',
      'XWWWW..WWWWWWWWWWWWWWWW..WWWWX',
      'XWWWW..WWWWWpWWWWWqWWWW..WWWWX',
      'XWk....g.c.......cc..g....kkWX',
      'XW..........................WX',
      'XW....2.....................WX',
      'XW..........................WX',
      'XWc.c..................g.c..WX',
      'XW.........S................WX',
      'XWWWWWWWWWWWWWEEWWWWWWWWWWWWWX',
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    ],
    warps: { '14,20': ['safari', 3, 6, 'down'], '15,20': ['safari', 3, 6, 'down'], '25,3': ['plant2', 3, 4, 'down'] },
    signs: { '11,19': '발전소 1층: 바닥 어디서나 전기 · 고스트 타입 포켓몬이 나와요. 초록 스위치를 밟으면 초록 문이 내려가고 파랑 문이 올라가요. 파랑 스위치는 그 반대!' },
    npcs: [], legends: [],
  },
  // 2층: 방 여섯 · 스위치 셋 (초록 · 파랑 · 초록). 위층 계단 · 타입:널 방 (큰 발전기) 은 문을 차례로 열어야
  plant2: {
    name: '발전소 2층', kind: 'plant', zone: 'plant', open: 'b',
    rows: [
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      'XWWWWWWWWWWWWWWWWWWWWWWWWWWWWX',
      'XWWpWWWWqWWWWWpWWqWWWWWpWWqWWX',
      'XW.V..kg..WWk.....gWWg.....kWX',
      'XW........WW.......WW.......WX',
      'XW........4....1...3........WX',
      'XW........WW.......WW..2....WX',
      'XWc......cWWc......WW......cWX',
      'XWWWW.WWWWWWWWWWWWWWWWWW.WWWWX',
      'XWWWW3WqWWWWWWpWWWWWWqWW4WpWWX',
      'XWg......kWWk.....kWWk....U.WX',
      'XW........WW....^^.WW.......WX',
      'XW........WW....G^.WW.......WX',
      'XW........3.........3.......WX',
      'XW........WW.......WW.......WX',
      'XW........WW.......WW..1....WX',
      'XW..S.....WW.......WW.......WX',
      'XWcc......WWc.....cWWc......WX',
      'XWWWWWWWWWWWWWWWWWWWWWWWWWWWWX',
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    ],
    warps: { '3,3': ['plant1', 25, 4, 'down'], '26,10': ['plant3', 3, 17, 'down'] },
    signs: { '4,16': '발전소 2층: 스위치를 밟는 순서가 중요해요. 갇힌 것 같으면 가까운 스위치를 찾아보세요!' },
    npcs: [], legends: [{ dex: 772, x: 15, y: 12 }],
  },
  // 3층: 방 아홉 (3×3) · 스위치 다섯. 가운데 방 큰 발전기 옆 제라오라 (스위치 3번) · 오른쪽 위 방 마기아나 (4번). 어디서든 스위치로 계단에 돌아올 수 있음 (점검: .work/m11/maps-check.mjs)
  plant3: {
    name: '발전소 3층', kind: 'plant', zone: 'plant', open: 'b',
    rows: [
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      'XWWWWWWWWWWWWWWWWWWWWWWWWWWWWX',
      'XWWpWWWqWWWWpWWWqWWWWWpWWWqWWX',
      'XWk......Wg........W.......kWX',
      'XW.......4.........4........WX',
      'XW.......W.........W........WX',
      'XW......cW........cWc......gWX',
      'XWWWW.WWWWWWWW.WWWWWWWWWWWWWWX',
      'XWWqW3WWWWWpWW4WWqWWWpWWWWqWWX',
      'XW......kW......^^.Wk.......WX',
      'XW.......W......G^.W........WX',
      'XW.1.....4.........3......1.WX',
      'XW.......W.2.......W........WX',
      'XWc......Wc.......kW.......cWX',
      'XWWWW.WWWWWWWWWWWWWWWWWW.WWWWX',
      'XWWpW3WWqWWWqWWWpWWWWqWW4WpWWX',
      'XW.V....gW.........Wk......gWX',
      'XW.......3.........4........WX',
      'XW.....1.W....2....W........WX',
      'XWc.S....Wc.......cW.......cWX',
      'XWWWWWWWWWWWWWWWWWWWWWWWWWWWWX',
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    ],
    warps: { '3,16': ['plant2', 26, 11, 'down'] },
    signs: { '4,19': '발전소 3층: 가운데 큰 발전기에서 번개 같은 기운이 느껴진다… 스위치 다섯 개를 잘 써 보세요.' },
    npcs: [], legends: [{ dex: 807, x: 13, y: 11 }, { dex: 801, x: 24, y: 4 }],
  },

  // 용의 굴: 바다 · 사막 · 설원 · 용암을 모두 다녀오면 (서버 safari_state.dragon) 사파리존 호수에 섬과 다리 가운데 계단 (Z) 이 생기고, 그 아래.
  //   드래곤 타입 + 600족 계열이 자주 (Lv.40 → 50, 사다리에서 멀수록). W 벽 · . 바닥 · ~ 물 · r O 바위 · K 용의 수정 · U 올라가는 사다리
  dragon: {
    name: '용의 굴', kind: 'dcave', zone: 'dragon', start: [15, 23, 'up'],
    rows: [
      'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
      'WWW......WWWWWW.......WWWWW....WWW',
      'WW...K.....WW...V.r.....WW...K..WW',
      'WW.......................r......WW',
      'WW..~~~~.......O.......~~~~~....WW',
      'WW.~~~~~~...........~~~~~~~~~...WW',
      'WW.~~~~~~....WWWW....~~~~~~~....WW',
      'WW..~~~~....WWWWWW....~~~~~..K..WW',
      'WWK.........WWWWWW..............WW',
      'WW.....r.....WWWW.......r.......WW',
      'WWW...............K..........WWWWW',
      'WWWWW.....~~~~~.........O....WWWWW',
      'WWWW....~~~~~~~~~.............WWWW',
      'WW......~~~~~~~~~......WWW.....WWW',
      'WW...K...~~~~~~~......WWWWW.....WW',
      'WW.....................WWW......WW',
      'WW..r.....WW.....................W',
      'WW.......WWWW.......r.......K...WW',
      'WWW.......WW...................WWW',
      'WWWW...........~~~~...........WWWW',
      'WWWWW....K....~~~~~~....r....WWWWW',
      'WWWWWW.........~~~~.........WWWWWW',
      'WWWWWWWW.......................WWW',
      'WWWWWWWWWWWWWWWUWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    ],
    warps: { '15,24': ['safari', 13, 14, 'down'], '16,3': ['dragon2', 3, 3, 'down'] },
    signs: {}, npcs: [], legends: [],
  },

  // 0054 용의 굴 지하 2층: 굵은 바위 미로 (드래곤 · 600족, 더 강함). 맨 끝 내려가는 사다리 → 용의 굴 깊은 곳
  dragon2: {
    name: '용의 굴 지하 2층', kind: 'dcave', zone: 'dragon', start: [3, 3, 'down'],
    rows: [
      'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
      'WW.U.W...........................WWW',
      'WW...W...........................WWW',
      'WW...W...........................WWW',
      'WW...WWWWWWWWWWWWWWWWW...WWWWW...WWW',
      'WW...W...........................WWW',
      'WW...W...........................WWW',
      'WW...W...........................WWW',
      'WW...W...WWWWW...W...WWWWW...W...WWW',
      'WW...W...W.......W...W.......W...WWW',
      'WW...W...W.......W...W.......W...WWW',
      'WW...W...W.......W...W.......W...WWW',
      'WW...W...W...W...W...W...WWWWW...WWW',
      'WW.......W...W.......W...........WWW',
      'WW.......W...W.......W...........WWW',
      'WW.......W...W.......W...........WWW',
      'WWWWWW...W...W...W...WWWWW...W...WWW',
      'WW...........W...............W...WWW',
      'WW...........W...............W...WWW',
      'WW...........W...............W...WWW',
      'WW...WWWWW...W...WWWWWWWWW...W...WWW',
      'WW...............W...............WWW',
      'WW...............W...............WWW',
      'WW...............W...............WWW',
      'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    ],
    warps: { '3,2': ['dragon', 16, 4, 'down'], '32,18': ['dragonDeep', 13, 14, 'up'] },
    signs: {}, npcs: [], legends: [],
  },

  deepPond: {
    name: '깊은 연못', kind: 'out', zone: 'deep',
    rows: [
      'TTTTTTTTTTTTTTTTTTTTTT',
      'TTMMMMMTTTTTTTTTTTTTTT',
      'TTMMCMMT...,,,,,....TT',
      'TT.....,,,,,,,,,,...TT',
      'TT..,,,,..~~~~~~~...TT',
      'TT.,,,,..~~~~~~~~~..TT',
      'TT.,,,..~~~~~~~~~~~.TT',
      'TT.....~~~~~~~~~~~~.TT',
      'TT..f..~~~~~~~~~~~~.TT',
      'TT.ff..~~~~~~~~~~~..TT',
      'TT.....~~~~.L.~~~~..TT',
      'TT,,,....~~...~~~...TT',
      'TT,,,,................',
      'TT,,,,,,..f.f..,,,,,TT',
      'TTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTT',
    ],
    warps: { '4,2': 'shoal3.out', '21,12': ['swordForest', 1, 12, 'right'] },
    signs: {}, npcs: [], legends: [{ dex: 382, x: 12, y: 10 }],
  },


  skyHill: {
    name: '하늘 언덕', kind: 'out', zone: 'deep',
    rows: [
      'TTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTMMMMMTTTTTTTTT',
      'TTTTTTT.MMCMM..TTTTTTT',
      'TTTTTT..........TTTTTT',
      'TTTT....,,,,,.....TTTT',
      'TTT..,,,,,,,,,,.....TT',
      'TT..,,,,ff,,,,,,....TT',
      'TT...,,,,,,,,,,.L...TT',
      'TT.....,,,,,,.......TT',
      'TT....f.....f.....,,TT',
      'TT..,,,..MMMMM...,,,TT',
      'TT.,,,,..MMMMM...,,,TT',
      'TT..,,...MMCMM.....TTT',
      'TT..................TT',
      'TTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTT',
    ],
    warps: { '11,12': 'deep3.out', '10,2': ['skyShrine', 9, 19, 'up'] },
    signs: {}, npcs: [], legends: [{ dex: 250, x: 16, y: 7 }, { dex: 641, x: 6, y: 4 }, { dex: 642, x: 14, y: 3 }],
  },

  // 전설의 제단 (참고: 3세대 유적 방 — 돌기둥 줄 · 가운데 긴 돌계단 · 위쪽 흰 대리석 제단). 하늘 = 레쿠쟈, 거인 = 레지기가스 (점자 벽)
  skyShrine: {
    name: '하늘의 제단', kind: 'shrine', zone: 'deep',
    rows: [
      'PPPPPPPPPPPPPPPPPPPP',
      'PPPPPPPPPPPPPPPPPPPP',
      'PP.I............I.PP',
      'PP....I......I....PP',
      'PPI..............IPP',
      'PP.....AAAAAA.....PP',
      'PP..I..AAAAAA..I..PP',
      'PP.....AAALAA.....PP',
      'PP..I..AAAAAA..I..PP',
      'PP.......==.......PP',
      'PP.I..I..==..I..I.PP',
      'PP.......==.......PP',
      'PPI...I..==..I...IPP',
      'PP...r...==...r...PP',
      'PP.I..I..==..I..I.PP',
      'PP.......==.......PP',
      'PPI...I..==..I...IPP',
      'PP.......==.......PP',
      'PPPPPPPP.==.PPPPPPPP',
      'PPPPPPPP.==.PPPPPPPP',
      'PPPPPPPPPEEPPPPPPPPP',
    ],
    warps: { '9,20': ['skyHill', 10, 3, 'down'], '10,20': ['skyHill', 10, 3, 'down'] },
    signs: {}, npcs: [], legends: [{ dex: 384, x: 10, y: 7 }],
  },
  regiShrine: {
    name: '거인의 제단', kind: 'shrine', zone: 'deep',
    rows: [
      'PPPPPPPPPPPPPPPPPP',
      'PPPBPPPPPPPPPPBPPP',
      'PP..............PP',
      'PP....I....I....PP',
      'PP..I..AAAA..I..PP',
      'PP.....AAAA.....PP',
      'PP.....ALAA.....PP',
      'PP..I..AAAA..I..PP',
      'PP......==......PP',
      'PP..I..r==...I..PP',
      'PP......==......PP',
      'PP..I...==...I..PP',
      'PP......==......PP',
      'PPPPPPP.==.PPPPPPP',
      'PPPPPPPPUPPPPPPPPP',
    ],
    warps: { '8,14': 'maze4.down' },
    signs: { '3,1': '점자가 새겨져 있다… "바위 · 얼음 · 강철의 거인이 모이면 왕이 깨어난다."', '14,1': BRAILLE },
    npcs: [], legends: [{ dex: 486, x: 8, y: 6 }],
  },

  // 울트라 스페이스: 깊은 동굴의 울트라 워프홀 너머. 발판·빛의 길 모두 만남 칸 (울트라비스트 전용 구역)
  ultra: {
    name: '울트라 스페이스', kind: 'ultra', zone: 'ultra',
    rows: [
      'XXXXXXXXXXXXXXXXXXXXXXXX',
      'XXXXXXXXXXXXXXXXXXXXXXXX',
      'XX....XXXXXXXXXXXX....XX',
      'XX..K.XXX..Q..XXXX.K..XX',
      'XX....=====...=====...XX',
      'XXX..XXXXX.K..XXXX...XXX',
      'XXXX=XXXXX....XXXXX=XXXX',
      'XXXX=XXXXXX==XXXXXX=XXXX',
      'XX.....XXXX==XXXX.....XX',
      'XX..K..====..====..K..XX',
      'XX.....XXXX..XXXX.....XX',
      'XXX.XXXXXXX==XXXXXXX.XXX',
      'XXX.XXXXXX....XXXXXX.XXX',
      'XXX.=====..Q.=======.XXX',
      'XXXXXXXXXX....XXXXXXXXXX',
      'XXXXXXXXXXXXXXXXXXXXXXXX',
    ],
    warps: { '11,13': ['deep3.worm', 'warp'], '11,3': ['starAltar', 11, 12, 'up', 'warp'] },
    signs: {}, npcs: [], legends: [{ dex: 789, x: 11, y: 9 }],
  },

  // ── 0050 전설의 특별한 곳 (zone null = 야생 포켓몬이 나오지 않음, 전설 자리만) ──
  // 꿈의 섬: 해변 바닷길 동쪽 곶 너머. 0054 야자 · 바위 미로 — 막다른 곳마다 크레세리아 · 다크라이 · 라티아스 · 라티오스 (수호신의 돌기둥은 뺌)
  dreamIsle: {
    name: '꿈의 섬', kind: 'beach', zone: null, start: [1, 12, 'right'],
    rows: [
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~T~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~TTTTTTTTTTTTTTT~~~~~~~~~~~',
      '~~~~~~~~~~TTTTTTTTTTTTTTTTTTT~~~~~~~~~',
      '~~~~~~~~TTRRTTTRTRTTTTRRTTTRTTT~~~~~~~',
      '~~~~~~T..T...........R........TTT~~~~~',
      '~~~~~.T..R...........T........TTTT~~~~',
      '~~~~..T..T..TTTTRTT..T..T..TRTTTTTT~~~',
      '~~~...R..T........T.....T.....TTTTTT~~',
      '~~~...T..R........R.....T.....RTTTTT~~',
      '~~..S.T..TTTRTTT..T..RTRTRTT..TTTTTTT~',
      '~~................T........T..TTTTTTT~',
      '..................T........T..RTTTTTT~',
      '......TTTTTRTTTT..TTTTTTTTRT..TTTTTTT~',
      '~~....R..T.....T..R.....R.....TTTTTTT~',
      '~~....R..T.....T..T.....R.....TTTTTTT~',
      '~~~...R..T..T..R..T..T..T..T..TTTTTT~~',
      '~~~...T.....T........T.....T..TTTTTT~~',
      '~~~~..T.....T........R.....R..RTTTT~~~',
      '~~~~~.TTTTRTTTTTTRTTTTTTTRRTTRTTTT~~~~',
      '~~~~~~TTTTTTTTTTTTTTTTTTTTTTTTTTT~~~~~',
      '~~~~~~~~TTTTTTTTTTTTTTTTTTTTTTT~~~~~~~',
      '~~~~~~~~~~TTTTTTTTTTTTTTTTTTT~~~~~~~~~',
      '~~~~~~~~~~~~TTTTTTTTTTTTTTT~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~T~~~~~~~~~~~~~~~~~~',
      '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    ],
    warps: { '0,12': ['beach2', 70, 5, 'left'], '0,13': ['beach2', 70, 6, 'left'] },
    signs: { '4,10': '꿈의 섬: 야자나무 숲이 미로처럼 얽힌 조용한 섬이에요. 야생 포켓몬은 나오지 않지만, 숲 깊은 곳에 꿈을 지키는 전설의 포켓몬이 산대요.' },
    npcs: [],
    legends: [{ dex: 488, x: 29, y: 5 }, { dex: 491, x: 29, y: 18 }, { dex: 380, x: 7, y: 14 }, { dex: 381, x: 20, y: 11 }],
  },

  // 성검의 숲: 깊은 연못 동쪽 길 너머. 0054 굵은 나무 미로 — 막다른 곳마다 코바르온 · 테라키온 · 비리디온 · 케르디오
  swordForest: {
    name: '성검의 숲', kind: 'out', zone: null, start: [1, 12, 'right'],
    rows: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TT......TT..........TT..............TT',
      'TT......TT..........TT..............TT',
      'TTTTTT..TT..TTTTTT..TT..TT..TTTTTTTTTT',
      'TTTTTT..TT..TTTTTT..TT..TT..TTTTTTTTTT',
      'TT..TT..TT..TT..TT..TT..TT..........TT',
      'TT..TT..TT..TT..TT..TT..TT..........TT',
      'TT..TT..TT..TT..TT..TT..TT..TTTTTT..TT',
      'TT..TT..TT..TT..TT..TT..TT..TTTTTT..TT',
      '........TT..TT..TT..TT..............TT',
      '........TT..TT..TT..TT..............TT',
      'TT..TTTTTT..TT..TT..TT..TT..TTTTTT..TT',
      'TT..TTTTTT..TT..TT..TT..TT..TTTTTT..TT',
      'TT..........TT..TT..TT..TT..........TT',
      'TT..........TT..TT..TT..TT..........TT',
      'TT..TT..TT..TT..TT..TTTTTT..TTTTTT..TT',
      'TT..TT..TT..TT..TT..TTTTTT..TTTTTT..TT',
      'TT......TT..TT..TT......TT..TT......TT',
      'TT......TT..TT..TT......TT..TT......TT',
      'TT..TTTTTT..TT..TTTTTT..TT..TT..TTTTTT',
      'TT..TTTTTT..TT..TTTTTT..TT..TT..TTTTTT',
      'TT..........TT..............TT......TT',
      'TT..........TT..............TT......TT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ],
    warps: { '0,11': ['deepPond', 20, 12, 'left'], '0,12': ['deepPond', 20, 12, 'left'] },
    signs: {},
    npcs: [],
    legends: [{ dex: 638, x: 35, y: 3 }, { dex: 639, x: 35, y: 24 }, { dex: 640, x: 22, y: 3 }, { dex: 647, x: 14, y: 7 }],
  },

  // 용의 굴 깊은 곳: 용의 굴 위쪽 내려가는 사다리 아래 (용의 굴이 열린 뒤에만). 레시라무 · 제크로무가 마주 보고, 위쪽 얼음 제단에 큐레무
  dragonDeep: {
    name: '용의 굴 깊은 곳', kind: 'dcave', zone: null, start: [13, 14, 'up'],
    rows: [
      'WWWWWWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWW........WWWWWWWWW',
      'WWWWWWW....K..K....WWWWWWW',
      'WWWWW......~~~~......WWWWW',
      'WWWK......~~~~~~......KWWW',
      'WWW.......~~~~~~.......WWW',
      'WWW........~~~~........WWW',
      'WW......................WW',
      'WW..K....r......r....K..WW',
      'WW......................WW',
      'WWW.....O........O.....WWW',
      'WWW....................WWW',
      'WWWW....K........K....WWWW',
      'WWWWW................WWWWW',
      'WWWWWWW......U.....WWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWWWW',
    ],
    warps: { '13,15': ['dragon2', 32, 19, 'down'] },
    signs: {}, npcs: [],
    legends: [{ dex: 643, x: 5, y: 9 }, { dex: 644, x: 20, y: 9 }],
  },

  // 0054 고대 유적 지하 1층: 사암 절벽 미로 (비크티니 · 디안시). 구석의 내려가는 계단 → 지하 2층 (ancientRuins: 게노세크트 · 마샤도)
  ruins1: {
    name: '고대 유적', kind: 'shrine', zone: null, start: [11, 19, 'up'],
    rows: [
      'PPPPPPPPPPPPPPPPPPPPPPPP',
      'PPPPPPPPPPPPPPPPPPPPPPPP',
      'PP...........P........PP',
      'PP...........P........PP',
      'PPPPPPPPPPP..P..P..PPPPP',
      'PP.....P.....P........PP',
      'PP.....P.....P........PP',
      'PP..PPPP..P..P..PPPP..PP',
      'PP..P.....P...........PP',
      'PP..P.....P...........PP',
      'PP..P..P..PPPPPPP..P..PP',
      'PP.....P...........P..PP',
      'PP.....P...........P..PP',
      'PP..PPPPPPP..PPPPPPP..PP',
      'PP..P...........P..P..PP',
      'PP..P...........P..P..PP',
      'PP..P..P..PPPP..P..P..PP',
      'PP.....P........P.....PP',
      'PP.....P........P.....PP',
      'PPPPPPPPPPP==PPPPPPPPPPP',
      'PPPPPPPPPPP==PPPPPPPPPPP',
      'PPPPPPPPPPPEEPPPPPPPPPPP',
    ],
    warps: { '11,21': ['desert', 8, 5, 'up'], '12,21': ['desert', 8, 5, 'up'], '21,2': ['ancientRuins', 9, 13, 'up'] },
    signs: {}, npcs: [], legends: [{ dex: 494, x: 2, y: 2 }, { dex: 719, x: 17, y: 14 }],
  },

  // 별의 제단: 울트라 스페이스 위쪽 둘째 워프홀 너머. 별 무늬 제단 다섯 (코스모그 · 네크로즈마 · 지라치 · 테오키스 · 후파) 을 빛의 길로 이음
  starAltar: {
    name: '별의 제단', kind: 'ultra', zone: null, start: [11, 12, 'up'],
    rows: [
      'XXXXXXXXXXXXXXXXXXXXXX',
      'XXXXXXXXX....XXXXXXXXX',
      'XXXXXXXXX.A..XXXXXXXXX',
      'XXXXXXXXX....XXXXXXXXX',
      'XX...XXXXX==XXXXX...XX',
      'XX.A.=====..=====.A.XX',
      'XX...XXXX....XXXX...XX',
      'XXXXXXXXX.KA.KXXXXXXXX',
      'XXXXXXXXX....XXXXXXXXX',
      'XXX...XXXX==XXXX...XXX',
      'XXX.A.====..====.A.XXX',
      'XXX...XXXX..XXXX...XXX',
      'XXXXXXXXX....XXXXXXXXX',
      'XXXXXXXXX..Q.XXXXXXXXX',
      'XXXXXXXXXXXXXXXXXXXXXX',
    ],
    warps: { '11,13': ['ultra', 11, 4, 'down', 'warp'] },
    signs: {}, npcs: [],
    legends: [{ dex: 800, x: 10, y: 2 }, { dex: 385, x: 3, y: 5 }, { dex: 386, x: 18, y: 5 }],
  },

  // 고대 유적: 사막 서쪽 유적의 내려가는 계단 아래 (제단 글자). 네 모퉁이 대리석 제단 (비크티니 · 게노세크트 · 디안시 · 마샤도)
  ancientRuins: {
    name: '고대 유적 지하 2층', kind: 'shrine', zone: null, start: [9, 13, 'up'],
    rows: [
      'PPPPPPPPPPPPPPPPPPPP',
      'PPPBPPPPPPPPPPPPBPPP',
      'PP................PP',
      'PP.........I..AAA.PP',
      'PP............ALA.PP',
      'PP.I...I.==...AAA.PP',
      'PP.......==....I..PP',
      'PP.......==.......PP',
      'PP.I...I.==...AAA.PP',
      'PP..r....==...ALA.PP',
      'PP......r==r..AAA.PP',
      'PP..I....==....I..PP',
      'PP.......==.......PP',
      'PPPPPPPP....PPPPPPPP',
      'PPPPPPPP.U..PPPPPPPP',
      'PPPPPPPPPPPPPPPPPPPP',
    ],
    warps: { '9,14': ['ruins1', 21, 3, 'down'] },
    signs: { '3,1': '벽에 오래된 글이 새겨져 있다… "승리 · 되살아남 · 보석 · 그림자, 네 개의 제단에 환상이 잠든다."', '16,1': '벽에 오래된 글이 새겨져 있다… "모래바람 속에서 강해진 자에게 보석의 빛이 보이리라."' },
    npcs: [],
    legends: [{ dex: 649, x: 15, y: 4 }, { dex: 802, x: 15, y: 9 }],
  },
};

// 바깥 지도로 들어오는 칸 (동굴 쪽 warps 의 [지도, 'in'] 이 여기로)
const OUT_PORTS = { 'deepPond.in': [4, 3, 'down'], 'skyHill.in': [11, 13, 'down'], 'regiShrine.in': [8, 13, 'up'], 'ultra.in': [11, 12, 'up'] };
Object.assign(MAPS, CAVES);
for (const m of Object.values(MAPS)) {
  for (const [k, w] of Object.entries(m.warps)) {
    if (typeof w === 'string') m.warps[k] = [...CAVE_PORTS[w]];                                   // 'shoal.in' → [지도, x, y, 쪽]
    else if (typeof w[0] === 'string' && CAVE_PORTS[w[0]]) m.warps[k] = [...CAVE_PORTS[w[0]], ...w.slice(1)];
    else if (typeof w[1] === 'string' && w[1] !== 'warp') m.warps[k] = [w[0], ...OUT_PORTS[`${w[0]}.${w[1]}`], ...w.slice(2)];
  }
}

// 0048 용의 굴 열림: 사파리존 호수 (다리 가운데 13,12) 에 풀숲 섬 + (0054) 다리 바로 아래 섬 칸에 내려가는 계단 z. safari.js 가 서버 safari_state.dragon 이면 rows 를 바꿈
const ISLE = { 9: [12, '...'], 10: [11, '.,,,.'], 11: [10, '.,,,,,.'], 13: [10, '.,,z,,.'], 14: [11, '.,,,.'], 15: [12, '...'] };   // 0054: 계단 z = 다리 (13,12) 바로 아래 섬 칸
export const DRAGON_ISLE = {
  rows: MAPS.safari.rows.map((r, y) => (ISLE[y] ? r.slice(0, ISLE[y][0]) + ISLE[y][1] + r.slice(ISLE[y][0] + ISLE[y][1].length) : r)),
  at: '13,13', warp: ['dragon', 15, 23, 'up'], centre: [13, 12],
  need: [['beach', '바다'], ['desert', '사막'], ['snow', '설원'], ['lava', '용암']],
};

// ── 0054 퍼즐 칸 (앱이 지도마다 상태를 들고 있음 · 그 층 / 지도에 다시 들어오면 처음 상태로) ──
//   발전소 (kind 'plant', 뉴보라처럼 스위치 퍼즐): 1 초록 스위치 · 2 파랑 스위치 · 3 초록 문 · 4 파랑 문.
//      상태 = 열린 색 ('g' | 'b', 처음 = m.open || 'b'). 초록 스위치를 밟으면 초록 문이 내려가고 (열림) 파랑 문이 올라감 (막힘) · 파랑은 반대.
//      스위치는 문 칸이 아니라서 밟는 순간 주인공이 문 위에 있을 일은 없음.
//   바닷길 (m.seaway): P 바닷속 길 (처음엔 깊은 바다 = 막힘) · B 모래톱. 모래톱을 밟으면 그 모래톱에 닿은 바닷길 덩어리가 드러남 (상태 = 밟은 모래톱 비트).
//   가라앉는 돌 (kind 'lava'): 1 2 = 박자 (SINK) 에 맞춰 가라앉았다 떠오르는 돌 · s 가라앉지 않는 돌. 시간 상태라 지도 점검은 늘 걸을 수 있다고 봄 —
//      가라앉을 때 그 돌 위에 있으면 앱이 마지막으로 선 가라앉지 않는 칸으로 돌려보냄.
export const SINK = { period: 3200, up: 1700, warn: 700, off: { 1: 0, 2: 1600 } };
export function sinkPhase(c, t) {
  const o = SINK.off[c]; if (o == null) return null;
  const p = (t + o) % SINK.period;
  return p < SINK.up ? 'up' : p < SINK.up + SINK.warn ? 'warn' : 'down';
}
export function puzzleOf(m) {
  if (m._pz !== undefined) return m._pz;
  let pz = null;
  if (m.kind === 'plant') {
    pz = { dyn: '1234', init: () => m.open || 'b',
      solid: (c, s) => (c === '3' && s !== 'g') || (c === '4' && s !== 'b'),
      step: (c, s) => (c === '1' ? 'g' : c === '2' ? 'b' : s) };
  } else if (m.seaway) {
    const bars = new Map(), mask = new Map(), R = m.rows;
    R.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'B') bars.set(`${x},${y}`, bars.size); }));
    const seen = new Set();
    R.forEach((r, y) => [...r].forEach((c, x) => {
      if (c !== 'P' || seen.has(`${x},${y}`)) return;
      const comp = [], q = [[x, y]]; let bits = 0; seen.add(`${x},${y}`);
      while (q.length) {
        const [a, b] = q.pop(); comp.push(`${a},${b}`);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = `${a + dx},${b + dy}`, cc = R[b + dy]?.[a + dx];
          if (cc === 'B') bits |= 1 << bars.get(k);
          else if (cc === 'P' && !seen.has(k)) { seen.add(k); q.push([a + dx, b + dy]); }
        }
      }
      for (const k of comp) mask.set(k, bits);
    }));
    pz = { dyn: 'PB', bars, init: () => 0,
      solid: (c, s, x, y) => c === 'P' && !(s & (mask.get(`${x},${y}`) || 0)),
      step: (c, s, x, y) => (c === 'B' ? s | (1 << bars.get(`${x},${y}`)) : s),
      open: (s, x, y) => !!(s & (mask.get(`${x},${y}`) || 0)) };
  }
  m._pz = pz;
  return pz;
}

// 이 글자가 막힌 칸인지 (사람·전설 포켓몬 자리는 safari.js 가 따로 막음)
export const SOLID = { out: new Set(['T', '~', 'F', 'R', 'S', 'G', 'M', 'L', 'H', '^', 'Y']),
  snow: new Set(['T', 'M', 'R', 'S', 'H', '^', 'n']), lava: new Set(['M', '~', 'T', 'V', 'R', 'S']),
  plant: new Set(['X', 'W', 'p', 'q', 'k', 'g', 'c', 'G', '^', 'S']), dcave: new Set(['W', '~', 'r', 'O', 'K', 'S']), beach: new Set(['T', '~', 'c', 'R', 'S']), desert: new Set(['M', 'D', '^', 'C', 'c', 'R', 'P', 'o', 'K', 'S']), cave: new Set(['W', '~', 'r', 'O', 'B', 'L', 'S']), ultra: new Set(['X', 'K']), shrine: new Set(['P', 'B', 'I', 'r', 'L']) };
// 야생 포켓몬이 나오는 칸
export const ENC = { snow: new Set([',']), lava: new Set([',']), plant: new Set(['.', 'o', '1', '2', '3', '4']), dcave: new Set(['.']), out: new Set([',']), beach: new Set([',', 'w']), desert: new Set([',']), cave: new Set(['.']), ultra: new Set(['.', '=']), shrine: new Set() };
