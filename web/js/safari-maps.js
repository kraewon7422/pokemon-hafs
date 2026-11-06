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
// 용의 굴 (kind 'dcave'): W 벽 · . 바닥 · ~ 물 · r O 바위 · K 용의 수정 · U 사다리
// zone (만남 구역): 'desert' 사막 (모래바람) · 'beach' 해변 · 'pond' (앱이 정함: 물가 2칸 안의 사파리존 풀숲) · 'grass' 사파리존 풀숲 · 'cave' 동굴 바닥 · 'deep' 깊은 바깥 구역 풀숲 · 'ultra' 울트라 스페이스
// warps: 'x,y' → [지도, x, y, 보는 쪽, 'warp'?]  (그 칸에 들어서면 화면이 어두워지며 옮겨 감. 'warp' = 워프홀 연출)
// 참고: 3세대 여울의 동굴 (물웅덩이·바위) · 미혹의 동굴 (갈림길 미로·점자·구멍) 느낌으로 새로 그린 지도 (원본 지도를 베끼지 않음)

// ─────────────────────── 전설 포켓몬 힌트 (사육사가 알려 줌) ───────────────────────
// teaser = 아직 도감에서 못 본 전설일 때 메뉴에 ??? 와 함께 보이는 귀띔. cond = 기본 조건 글 (0038 settings.legend_quests 기본값과 같음).
//    서버 (0038 safari_state · sync 의 legends) 가 hintsFromServer → setLegendHints 로 ok · caught · seen · 조건 글 + 진행 (예: '물 타입 4/20') 을 채움.
import { CAVES, CAVE_PORTS } from './safari-caves.js';

export const LEGEND_HINTS = [
  // 레지 셋 = 점자 동굴 (바위 · 얼음 · 강철 타입을 잡으면 깨어남) → 셋을 모두 잡으면 레지기가스
  { dex: 377, teaser: '바위로 된 거인', name: '레지락', where: '미혹의 동굴 지하 2층, 점자 벽 아래 방', cond: '바위 타입 포켓몬을 8마리 잡아야 한대', ok: false },
  { dex: 378, teaser: '얼음으로 된 거인', name: '레지아이스', where: '여울의 동굴 지하 2층, 점자 벽 아래 방', cond: '얼음 타입 포켓몬을 5마리 잡아야 한대', ok: false },
  { dex: 379, teaser: '강철로 된 거인', name: '레지스틸', where: '미혹의 동굴 지하 3층, 점자 벽 아래 방', cond: '강철 타입 포켓몬을 8마리 잡아야 한대', ok: false },
  { dex: 486, teaser: '거인들의 왕', name: '레지기가스', where: '미혹의 동굴 지하 3층 사다리 아래 거인의 제단', cond: '레지락·레지아이스·레지스틸을 모두 잡아야 한대', ok: false },
  { dex: 249, teaser: '깊은 바다의 수호신', name: '루기아', where: '여울의 동굴 지하 3층, 깊은 물가', cond: '물 타입 포켓몬을 20마리 잡아야 한대', ok: false },
  { dex: 382, teaser: '바다를 넓힌 포켓몬', name: '가이오가', where: '깊은 연못 (여울의 동굴 지하 2층 출구 너머)', cond: '사파리존에서 포켓몬을 15마리 잡아야 한대', ok: false },
  { dex: 383, teaser: '땅을 넓힌 포켓몬', name: '그란돈', where: '깊은 동굴 지하 2층', cond: '땅 타입 포켓몬을 15마리 잡아야 한대', ok: false },
  { dex: 250, teaser: '무지개 날개의 새', name: '칠색조', where: '하늘 언덕 (깊은 동굴 지하 2층 출구 너머)', cond: '불꽃·비행 타입 포켓몬을 20마리 잡아야 한대', ok: false },
  { dex: 384, teaser: '하늘 높이 사는 용', name: '레쿠쟈', where: '하늘 언덕 꼭대기 동굴 너머 하늘의 제단', cond: '가이오가와 그란돈을 모두 잡아야 한대', ok: false },
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
      'TT.S..,,,,,,,......,,,,,,,,,,..R...,,,,,,,,..........,,,,,,,,.TT',
      'E.........,,,,.........,,,,......h.....,,,,....R.......,,,,,..TT',
      'E.....h.......................................................TT',
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
    warps: { '0,5': ['safari', 62, 36, 'left'], '0,6': ['safari', 62, 37, 'left'] },
    signs: { '3,4': '해변: 얕은 물과 바닷가 풀숲에 물 · 얼음 타입 포켓몬이 살아요. 동쪽 산호초로 갈수록 강한 포켓몬이 나온대요!' },
    npcs: [], legends: [],
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
      'MM..xxxxxxxxx..,,,,,,....D^^.........b.......D^^........c...MM',
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
    warps: { '61,10': ['safari', 1, 36, 'right'], '61,11': ['safari', 1, 37, 'right'] },
    signs: { '57,8': '모래바람 지대: 모래바람이 거세게 부는 사막이에요. 마른 모래 풀숲에 땅 · 바위 타입 포켓몬이 살아요. 서쪽 유적으로 갈수록 강한 포켓몬이 나온대요!' },
    npcs: [], legends: [],
  },

  // ── 0048 ── 설원: 사파리존 맨 위 길 너머. 눈 속 키 큰 풀숲 (,) 에서 얼음 · 페어리 타입. 아래 입구에서 위로 갈수록 레벨이 높음 (Lv.18 → 45).
  //   눈 덮인 흙 턱 (M, 2줄 = 윗면 + 벽면) 사이 돌계단 (=) · 얼어붙은 연못 (I, 밟으면 반대편까지 미끄러짐) · 오두막 (H = 2×2 칸의 왼쪽 아래, 나머지 ^) · 눈사람 (n)
  snow: {
    name: '설원', kind: 'snow', zone: 'snow', start: [21, 32, 'up'],
    rows: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTT,,,,,,,...TTTTTTTT......,,,,,,,,....TTTT',
      'TTT,,,,,,,,,,...TTTT.....R..,,,,,,,,,,...TTT',
      'TT,,,,,,,,,,,,.........n....,,,,,,,,,,....TT',
      'TT..,,,,,,,,...S...........,,,,,,,,,......TT',
      'TT.....................T..............T...TT',
      'TTMMMMMMMMMMMMMMMM==MMMMMMMMMMMMMMMMMMMMMMTT',
      'TTMMMMMMMMMMMMMMMM==MMMMMMMMMMMMMMMMMMMMMMTT',
      'TT....T.......,,,,,,,,....T.......IIIIII..TT',
      'TT.^^....T....,,,,,,,,,..........IIIIIIII.TT',
      'TT.H^.........,,,,,,,,,.....T....IIIIIIII.TT',
      'TT.......R.....,,,,,,,......,,...IIIIIIII.TT',
      'TT..T.................T....,,,,...IIIIII..TT',
      'TTT..........T...........,,,,,,..........TTT',
      'TTMMMMMMMM==MMMMMMMMMMMMMMMMMMMMMMM==MMMMMTT',
      'TTMMMMMMMM==MMMMMMMMMMMMMMMMMMMMMMM==MMMMMTT',
      'TT,,,,,,.........TTTT.......T.......,,,,,,TT',
      'TT,,,,,,,,....T..TTTT..............,,,,,,,TT',
      'TT,,,,,,,,,.......TT.....IIIII.....,,,,,,,TT',
      'TT.,,,,,,,..T..........IIIIIIIII....,,,,,.TT',
      'TT.......S.............IIIIIIIII..T.......TT',
      'TT..T....,,,,,.........IIIIIIIII.......T..TT',
      'TT......,,,,,,,..T.......IIIII.....^^.....TT',
      'TTT.....,,,,,,,..............R.....H^..T.TTT',
      'TTTT.....,,,,,.....T......................TT',
      'TTTTT.........................,,,,,,,..TTTTT',
      'TTTTTTT....T......,,,,,.......,,,,,,,,..TTTT',
      'TTTTTTTT.........,,,,,,,..S...,,,,,,,..TTTTT',
      'TTTTTTTTT........,,,,,,,......,,,,,...TTTTTT',
      'TTTTTTTTTTT.......,,,,,..............TTTTTTT',
      'TTTTTTTTTTTTTTTTT...........TTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTT..TTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTEETTTTTTTTTTTTTTTTTTTTT',
    ],
    warps: { '21,33': ['safari', 31, 1, 'down'], '22,33': ['safari', 32, 1, 'down'] },
    signs: {
      '26,28': '설원: 키 큰 풀숲에 얼음 · 페어리 타입 포켓몬이 살아요. 위로 올라갈수록 강한 포켓몬이 나온대요!',
      '9,21': '얼어붙은 연못: 한번 미끄러지면 반대편까지 멈추지 않아요!',
      '15,5': '설원 꼭대기: 이 근처 포켓몬은 아주 강하대요.',
    },
    npcs: [], legends: [],
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
      'MM.......,,,,,,....~~~~~~~~~~~~~~~......MM',
      'MM.....,,,,,,,,,..~~~~~~~~~~~~~~~~~.....MM',
      'MMT....,,,,,,,,,..~~~~~~~~~~~~~~~~~..T..MM',
      'MM......,,,,,,....~~~~~~~~~~~~~~~~~.....MM',
      'MM..V.............~~~~~~~~~~~~~~~~......MM',
      'MM..........S......~~~~~~~~~~~~~~...,,,,MM',
      'MMTT.......T.........~~~~~~~~~...,,,,,,,MM',
      'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
      'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
    ],
    warps: { '20,0': ['safari', 12, 50, 'up'], '21,0': ['safari', 13, 50, 'up'] },
    signs: {
      '14,3': '용암 지대: 잿빛 풀숲에 불꽃 · 강철 타입 포켓몬이 살아요. 아래 용암 호수 쪽으로 갈수록 강한 포켓몬이 나온대요!',
      '12,28': '용암 호수: 가까이 가면 뜨거워요! 이 근처 포켓몬은 아주 강하대요.',
    },
    npcs: [], legends: [],
  },

  // 발전소 (동굴처럼 건물 안): 사파리존 왼쪽 위 건물 문 → 1층 → 계단 → 2층 (큰 발전기). 바닥 (. · o 스위치) 어디서나 전기 · 고스트 타입.
  //   X 바깥 (검정) · W 벽 · p q 벽 속 파랑 · 초록 관 · k 기계 선반 · g 초록 발전기 · c 노란 상자 · o 바닥 스위치 · G 큰 발전기 (2×2 칸의 왼쪽 아래, 나머지 ^) · U V 계단 · E 나가는 문
  plant1: {
    name: '발전소', kind: 'plant', zone: 'plant',
    rows: [
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      'XWWWWWWWWWWWWXXXXWWWWWWWWWWWWX',
      'XWWWpWWWWWqWWXXXXWWWWWWpWWWWWX',
      'XWkk.g...c.cWXXXXWk.gg...U.kWX',
      'XW..........WXXXXW..........WX',
      'XW...o......WWWWWW....o.....WX',
      'XW..........................WX',
      'XW..........WWWqWW..........WX',
      'XWc...c.....WXXXXWc........cWX',
      'XWWWW..WWWWWWXXXXWWWWWW..WWWWX',
      'XXXXW..WXXXXXXXXXXXXXXW..WXXXX',
      'XXXXW..WXXXXXXXXXXXXXXW..WXXXX',
      'XWWWW..WWWWWWWWWWWWWWWW..WWWWX',
      'XWWWW..WWWWWpWWWWWqWWWW..WWWWX',
      'XWk....g.c..o....cc..g....kkWX',
      'XW..........................WX',
      'XW....o..........o.......o..WX',
      'XW..........................WX',
      'XWc.c..................g.c..WX',
      'XW.........S................WX',
      'XWWWWWWWWWWWWWEEWWWWWWWWWWWWWX',
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    ],
    warps: { '14,20': ['safari', 3, 6, 'down'], '15,20': ['safari', 3, 6, 'down'], '25,3': ['plant2', 7, 4, 'down'] },
    signs: { '11,19': '발전소 1층: 바닥 어디서나 전기 · 고스트 타입 포켓몬이 나와요. 계단을 올라가면 커다란 발전기가 있대요.' },
    npcs: [], legends: [],
  },
  plant2: {
    name: '발전소 2층', kind: 'plant', zone: 'plant',
    rows: [
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      'XWWWWWWWWWXXXXWWWWWWWWWWWWWWWX',
      'XWWpWWWWWWXXXXWWWqWWWWWWWpWWWX',
      'XWk.g..V.WXXXXWg.k..^^..k.gcWX',
      'XW.......WXXXXW.....G^......WX',
      'XW..o....WXXXXW....o....o...WX',
      'XW.......WXXXXW.............WX',
      'XWc...c..WXXXXW.c.........c.WX',
      'XWWW..WWWWXXXXWWWWWWWWW..WWWWX',
      'XXXW..WXXXXXXXXXXXXXXXW..WXXXX',
      'XXXW..WXXXXXXXXXXXXXXXW..WXXXX',
      'XWWW..WWWWWWWWWWWWWWWWW..WWWWX',
      'XWWW..WWWWWWWqWWWWWWWWW..WWWWX',
      'XWk...g......o.....g.c....kkWX',
      'XW..........................WX',
      'XW...o......c.c.......o.....WX',
      'XW..........................WX',
      'XWc..g......S..........g..c.WX',
      'XWWWWWWWWWWWWWWWWWWWWWWWWWWWWX',
      'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    ],
    warps: { '7,3': ['plant1', 25, 4, 'down'] },
    signs: { '12,17': '발전소 2층: 큰 발전기가 윙윙 돌아가고 있다… 여기 포켓몬은 더 강하대요.' },
    npcs: [], legends: [],
  },

  // 용의 굴: 바다 · 사막 · 설원 · 용암을 모두 다녀오면 (서버 safari_state.dragon) 사파리존 호수에 섬과 다리 가운데 계단 (Z) 이 생기고, 그 아래.
  //   드래곤 타입 + 600족 계열이 자주 (Lv.40 → 50, 사다리에서 멀수록). W 벽 · . 바닥 · ~ 물 · r O 바위 · K 용의 수정 · U 올라가는 사다리
  dragon: {
    name: '용의 굴', kind: 'dcave', zone: 'dragon', start: [15, 23, 'up'],
    rows: [
      'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
      'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
      'WWW......WWWWWW.......WWWWW....WWW',
      'WW...K.....WW.....r.....WW...K..WW',
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
    warps: { '15,24': ['safari', 13, 11, 'up'] },
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
      'TT,,,,..............TT',
      'TT,,,,,,..f.f..,,,,,TT',
      'TTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTT',
    ],
    warps: { '4,2': 'shoal3.out' },
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
    signs: {}, npcs: [], legends: [{ dex: 250, x: 16, y: 7 }],
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
      'XX..K.XXX.....XXXX.K..XX',
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
    warps: { '11,13': ['deep3.worm', 'warp'] },
    signs: {}, npcs: [], legends: [],
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

// 0048 용의 굴 열림: 사파리존 호수 (다리 가운데 13,12) 에 풀숲 섬 + 아래로 내려가는 계단 Z. safari.js 가 서버 safari_state.dragon 이면 rows 를 바꿈
const ISLE = { 9: [12, '...'], 10: [11, '.,,,.'], 11: [10, '.,,,,,.'], 12: [13, 'Z'], 13: [10, '.,,f,,.'], 14: [11, '.,,,.'], 15: [12, '...'] };
export const DRAGON_ISLE = {
  rows: MAPS.safari.rows.map((r, y) => (ISLE[y] ? r.slice(0, ISLE[y][0]) + ISLE[y][1] + r.slice(ISLE[y][0] + ISLE[y][1].length) : r)),
  at: '13,12', warp: ['dragon', 15, 23, 'up'], centre: [13, 12],
  need: [['beach', '바다'], ['desert', '사막'], ['snow', '설원'], ['lava', '용암']],
};

// 이 글자가 막힌 칸인지 (사람·전설 포켓몬 자리는 safari.js 가 따로 막음)
export const SOLID = { out: new Set(['T', '~', 'F', 'R', 'S', 'G', 'M', 'L', 'H', '^']),
  snow: new Set(['T', 'M', 'R', 'S', 'H', '^', 'n']), lava: new Set(['M', '~', 'T', 'V', 'R', 'S']),
  plant: new Set(['X', 'W', 'p', 'q', 'k', 'g', 'c', 'G', '^', 'S']), dcave: new Set(['W', '~', 'r', 'O', 'K', 'S']), beach: new Set(['T', '~', 'c', 'R', 'S']), desert: new Set(['M', 'D', '^', 'C', 'c', 'R', 'P', 'o', 'K', 'S']), cave: new Set(['W', '~', 'r', 'O', 'B', 'L', 'S']), ultra: new Set(['X', 'K']), shrine: new Set(['P', 'B', 'I', 'r', 'L']) };
// 야생 포켓몬이 나오는 칸
export const ENC = { snow: new Set([',']), lava: new Set([',']), plant: new Set(['.', 'o']), dcave: new Set(['.']), out: new Set([',']), beach: new Set([',', 'w']), desert: new Set([',']), cave: new Set(['.']), ultra: new Set(['.', '=']), shrine: new Set() };
