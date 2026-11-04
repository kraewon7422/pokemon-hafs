// 사파리존 지도 데이터 (그림 없음 · DOM 없음 — node 로도 읽어 시험함: .work/preview/maps-check.mjs)
// kind 'out' = 바깥 (풀숲 , 에서 야생 포켓몬) · 'cave' = 동굴 (바닥 . 에서 야생 포켓몬)
// 바깥 글자: T 나무 · . 풀밭 · , 키 큰 풀숲 · # 모래길 · ~ 물 · b 다리 · F 울타리 · f 꽃 · R 바위 · S 표지판 · G 입구 기둥
//            M 산 바위 · C 동굴 입구 (밟으면 이동) · L 전설 포켓몬 자리
// 동굴 글자: W 바위벽 · . 바닥 · r 작은 바위 · O 큰 바위 · ~ 물 · B 점자 벽 · U 올라가는 사다리 · V 내려가는 사다리
//            o 구멍 (떨어짐) · E 나가는 곳 · L 전설 포켓몬 자리 · Q 울트라 워프홀 (밟으면 울트라 스페이스로)
// 제단 글자 (kind 'shrine'): P 절벽 · B 점자 절벽 · . 돌바닥 · I 부서진 돌기둥 · = 돌계단 · A 흰 대리석 제단 · r 돌
//            E 나가는 계단 · U 올라가는 사다리 · L 전설 포켓몬 자리 (만남 칸 없음)
// 울트라 스페이스 글자 (kind 'ultra'): X 빈 우주 · . 떠 있는 발판 · = 밝은 빛의 길 · K 빛나는 수정 · Q 울트라 워프홀
// zone (만남 구역): 'grass' 사파리존 풀숲 · 'cave' 동굴 바닥 · 'deep' 깊은 바깥 구역 풀숲 · 'ultra' 울트라 스페이스
// warps: 'x,y' → [지도, x, y, 보는 쪽, 'warp'?]  (그 칸에 들어서면 화면이 어두워지며 옮겨 감. 'warp' = 워프홀 연출)
// 참고: 3세대 여울의 동굴 (물웅덩이·바위) · 미혹의 동굴 (갈림길 미로·점자·구멍) 느낌으로 새로 그린 지도 (원본 지도를 베끼지 않음)

// ─────────────────────── 전설 포켓몬 힌트 (사육사가 알려 줌) ───────────────────────
// ⚠ 자리표시 (PLACEHOLDER): where/cond/teaser 글과 ok 값은 임시. teaser = 아직 도감에서 못 본 전설일 때 메뉴에 ??? 와 함께 보이는 귀띔. 나중에 서버 기능 (전설 조건, 0038 예정) 이
//    setLegendHints([{ dex, ok, cond? }]) 로 ok (= 조건을 채움) 와 조건 글을 채워 넣음. 지금은 모두 ok: false.
import { CAVES, CAVE_PORTS } from './safari-caves.js';

export const LEGEND_HINTS = [
  // 레지 셋 = 점자 동굴 → 셋을 모두 잡으면 레지기가스 (자리표시 조건)
  { dex: 377, teaser: '바위로 된 거인', name: '레지락', where: '미혹의 동굴 지하 2층, 점자 벽 아래 방', cond: '(임시) 사파리존 점자 벽을 모두 읽어야 한대', ok: false },
  { dex: 378, teaser: '얼음으로 된 거인', name: '레지아이스', where: '여울의 동굴 지하 2층, 점자 벽 아래 방', cond: '(임시) 사파리존 점자 벽을 모두 읽어야 한대', ok: false },
  { dex: 379, teaser: '강철로 된 거인', name: '레지스틸', where: '미혹의 동굴 지하 3층, 점자 벽 아래 방', cond: '(임시) 사파리존 점자 벽을 모두 읽어야 한대', ok: false },
  { dex: 486, teaser: '거인들의 왕', name: '레지기가스', where: '미혹의 동굴 지하 3층 사다리 아래 거인의 제단', cond: '레지락·레지아이스·레지스틸을 모두 잡아야 한대', ok: false },
  { dex: 249, teaser: '깊은 바다의 수호신', name: '루기아', where: '여울의 동굴 지하 3층, 깊은 물가', cond: '(임시) 아직 아무도 모른대', ok: false },
  { dex: 382, teaser: '바다를 넓힌 포켓몬', name: '가이오가', where: '깊은 연못 (여울의 동굴 지하 2층 출구 너머)', cond: '(임시) 아직 아무도 모른대', ok: false },
  { dex: 383, teaser: '땅을 넓힌 포켓몬', name: '그란돈', where: '깊은 동굴 지하 2층', cond: '(임시) 아직 아무도 모른대', ok: false },
  { dex: 250, teaser: '무지개 날개의 새', name: '칠색조', where: '하늘 언덕 (깊은 동굴 지하 2층 출구 너머)', cond: '(임시) 아직 아무도 모른대', ok: false },
  { dex: 384, teaser: '하늘 높이 사는 용', name: '레쿠쟈', where: '하늘 언덕 꼭대기 동굴 너머 하늘의 제단', cond: '가이오가와 그란돈을 모두 잡아야 한대', ok: false },
];

// 울트라비스트: 울트라 스페이스 (zone 'ultra') 에서만 나오게 할 포켓몬 (전국도감 번호). 서버 (0038 예정) 가 p_zone 으로 골라 줄 것.
export const ULTRA_BEASTS = [793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806];
// 구역 힌트 (사육사가 전설 힌트 다음에 알려 줌). ⚠ 자리표시 글.
export const ZONE_HINTS = [
  { zone: 'ultra', name: '울트라 워프홀', where: '깊은 동굴 지하 2층 어딘가', cond: '그 너머 울트라 스페이스에서만 울트라비스트가 나온대', more: '텅비드·매시붕·페로코체·전수목·철화구야·종이신도·악식킹·베베놈·아고용·차곡차곡·두파팡… 모두 다른 세계에서 온 포켓몬이란다.' },
];

const BRAILLE = '벽에 점자가 새겨져 있다… "깊은 곳에 잠든 거인을 깨우려면 세 개의 돌을 모아라."';

export const MAPS = {
  safari: {
    name: '사파리존', kind: 'out', zone: 'grass', start: [31, 47, 'up'],
    rows: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTMMMMMTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTMMMMMTTTTTTT',
      'TTTTTTMMCMMTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTMMCMMTTTTTTT',
      'TTTTT.....................................................TTTTTT',
      'TTTTT,,,,,,,,........,,,,,...,,,,,,.......................TTTTTT',
      'TTTTT,,,,,,,,........,,,,,...,,,,,,.........,,,,,,,,,,,,,,,TTTTT',
      'TTTTT,,,,,,,,........,,,,,...,,,,,,.........,,,,,,,,R,,,,,,..TTT',
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
      'TTT......########################.............S...........R..TTT',
      'TTT......########################.................R..........TTT',
      'TTT..........S.........,,,,,,..##..,,,,,,...,,,,,,,,,,,,,,,,.TTT',
      'TTT,,,,,,,,,,..FFF.FFFF,,,,,,..##..,,,,,,...,,,,,,,,,,,,,,,,.TTT',
      'TTT,,,,,,,,,,..FffffffF,,,,,,..###############,,,,,,,,,,,,,,.TTT',
      'TTT,,,,,,,,,,..FffffffF,,,,,,..###############,,,,,,,,,,,,,,.TTT',
      'TTT,,,,,,,,,,..FffffffF,,,,,,..##..,,,,,,.TT,,,,,,,,,,,,,,,,.TTT',
      'TTT,,,,,,,,,,..FffffffF,,,,,,..##..,,,,,,.TT,,,,,,,,,,,,,,,,.TTT',
      'TTT,,,,,,,,,,..FffffffF........##.........TT,,,,,,,,,,,,,,,,.TTT',
      'TTT,,,,,,,,,,..FFFFFFFF........##.S.......TT,,,,,,,,,,,,,,,,.TTT',
      'TTTTTTTTTTT.........TTTTTTTTT..##..TTTTTTTTT..........TTTTTTTTTT',
      'TTTTTTTTTTT.........TTTTTTTTT..##..TTTTTTTTT..........TTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTG##GTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT##TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT##TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT##TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    ],
    warps: { '8,2': 'shoal.in', '54,2': 'maze.in', '32,17': 'deep.in' },
    signs: {
      '34,45': '사파리존에 어서 와요! 키 큰 풀숲을 걸으면 야생 포켓몬이 나와요. 궁금한 건 옆의 사육사에게 물어보세요.',
      '29,24': '↖ 연못 구역 · 여울의 동굴   ↗ 바위 구역 · 미혹의 동굴   ↑ 깊은 동굴   ↓ 입구',
      '12,21': '연못 구역: 다리를 건너 보세요. 물가 풀숲에도 포켓몬이 숨어 있대요!',
      '51,21': '바위 구역: 바위 사이 풀숲이 아주 넓어요.',
      '46,36': '← 꽃밭   남동 풀숲은 사파리존에서 가장 넓은 풀숲이에요!',
      '13,38': '울타리 안 꽃밭은 들어가서 구경할 수 있어요.',
    },
    npcs: [{ id: 'keeper', x: 30, y: 45, dir: 'down' }],
    legends: [],
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
    warps: { '11,12': 'deep3.out', '10,2': ['skyShrine', 9, 17, 'up'] },
    signs: {}, npcs: [], legends: [{ dex: 250, x: 16, y: 7 }],
  },

  // 전설의 제단 (참고: 3세대 유적 방 — 돌기둥 줄 · 가운데 긴 돌계단 · 위쪽 흰 대리석 제단). 하늘 = 레쿠쟈, 거인 = 레지기가스 (점자 벽)
  skyShrine: {
    name: '하늘의 제단', kind: 'shrine', zone: 'deep',
    rows: [
      'PPPPPPPPPPPPPPPPPPPP',
      'PPPPPPPPPPPPPPPPPPPP',
      'PP.I...AAAAAA...I.PP',
      'PP.....AAAAAA.....PP',
      'PPI....AAALAA....IPP',
      'PP.....AAAAAA.....PP',
      'PP.I.....==.....I.PP',
      'PP.......==.......PP',
      'PPI..r...==...r..IPP',
      'PP.......==.......PP',
      'PP.I.....==.....I.PP',
      'PP.......==.......PP',
      'PPI......==......IPP',
      'PP...r...==...r...PP',
      'PP.I.....==.....I.PP',
      'PP.......==.......PP',
      'PPPPPPPP.==.PPPPPPPP',
      'PPPPPPPP.==.PPPPPPPP',
      'PPPPPPPPPEEPPPPPPPPP',
    ],
    warps: { '9,18': ['skyHill', 10, 3, 'down'], '10,18': ['skyHill', 10, 3, 'down'] },
    signs: {}, npcs: [], legends: [{ dex: 384, x: 10, y: 4 }],
  },
  regiShrine: {
    name: '거인의 제단', kind: 'shrine', zone: 'deep',
    rows: [
      'PPPPPPPPPPPPPPPPPP',
      'PPPBPPPPPPPPPPBPPP',
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
    warps: { '8,12': 'maze4.down' },
    signs: { '3,1': '점자가 새겨져 있다… "바위 · 얼음 · 강철의 거인이 모이면 왕이 깨어난다."', '14,1': BRAILLE },
    npcs: [], legends: [{ dex: 486, x: 8, y: 4 }],
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
const OUT_PORTS = { 'deepPond.in': [4, 3, 'down'], 'skyHill.in': [11, 13, 'down'], 'regiShrine.in': [8, 11, 'up'], 'ultra.in': [11, 12, 'up'] };
Object.assign(MAPS, CAVES);
for (const m of Object.values(MAPS)) {
  for (const [k, w] of Object.entries(m.warps)) {
    if (typeof w === 'string') m.warps[k] = [...CAVE_PORTS[w]];                                   // 'shoal.in' → [지도, x, y, 쪽]
    else if (typeof w[0] === 'string' && CAVE_PORTS[w[0]]) m.warps[k] = [...CAVE_PORTS[w[0]], ...w.slice(1)];
    else if (typeof w[1] === 'string' && w[1] !== 'warp') m.warps[k] = [w[0], ...OUT_PORTS[`${w[0]}.${w[1]}`], ...w.slice(2)];
  }
}

// 이 글자가 막힌 칸인지 (사람·전설 포켓몬 자리는 safari.js 가 따로 막음)
export const SOLID = { out: new Set(['T', '~', 'F', 'R', 'S', 'G', 'M', 'L']), cave: new Set(['W', '~', 'r', 'O', 'B', 'L', 'S']), ultra: new Set(['X', 'K']), shrine: new Set(['P', 'B', 'I', 'r', 'L']) };
// 야생 포켓몬이 나오는 칸
export const ENC = { out: new Set([',']), cave: new Set(['.']), ultra: new Set(['.', '=']), shrine: new Set() };
