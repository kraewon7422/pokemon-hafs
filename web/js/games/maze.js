// 자이로 미로: 폰을 기울여 몬스터볼을 미로 끝 구멍에 굴려 넣기.
//   랭킹 모드: 고정 5판 (모두 같은 미로) 합계 시간 → api.end(ms, ms)
//   자유 모드: 끝없이 (무작위 미로, 점점 커짐) → "끝내기" 에서 api.end(깬 판 수, ms) (hub 는 기록을 안 보냄)
// 미로 만들기 10가지 (구불구불 · 갈래길 · 방과 복도 · 소용돌이 성 · 순환로 · 칸막이 방 · 바람 부는 길 · 거울 미로 · 지그재그 길 · 십자 광장) + 테마 4가지 (물속 · 숲 · 사막 · 밤하늘)
// 2.5D 도트: 벽 윗면(밝음) + 남쪽 면(어두움), 볼 그림자, 기울인 쪽으로 판이 살짝 밀림(시차) + 캔버스 자체가 3D 로 기욺
// 조작: 기울이기(DeviceOrientation, 중력 벡터로 계산) · 화면 끌기 · 방향키. 시작 직후 잠깐의 평균 자세를 '수평'으로 잡음
import { pixelCanvas, drawMon, loop, text } from './common.js';

const W = 160, H = 208, HUD = 16;   // 캔버스 (도트)
const T = 3;                          // 벽 두께
const WH = 3;                         // 벽 높이 (남쪽 면 도트 수)
const R = 3.6;                        // 볼 반지름 (충돌)
const ACC = 430, VMAX = 150, FRICTION = 1.5, BOUNCE = 0.35, TILT_DEG = 25;
const D2R = Math.PI / 180, TILT_SIN = Math.sin(TILT_DEG * D2R);

// 랭킹 모드 5판: 씨앗 고정 → 누구나 같은 미로 (시간 비교 가능). 미로 종류 5가지, 크기는 조금씩 커짐
const RANK = [
  { cols: 7, rows: 9, seed: 11, gen: 'dfs', theme: 0 },
  { cols: 8, rows: 10, seed: 181, gen: 'sidewinder', theme: 1 },
  { cols: 9, rows: 11, seed: 81, gen: 'mirror', theme: 2 },
  { cols: 10, rows: 12, seed: 171, gen: 'division', theme: 3 },
  { cols: 11, rows: 13, seed: 281, gen: 'cross', theme: 0 },
];
// 자유 모드 n단계 (1부터): 천천히 커지고 폰에 들어가는 크기(12×14, 길 폭 9도트)에서 멈춤
const freeSize = (n) => { const cols = Math.min(12, 6 + Math.floor(n / 2)); return { cols, rows: Math.min(14, cols + 2) }; };

// 몬스터볼 8×8 도트
const BALL = ['..kkkk..', '.krrrhk.', 'krrrrrhk', 'kkkwwkkk', 'kwwwwwwk', 'kwwwwwsk', '.kswwsk.', '..kkkk..'];
const BALL_COL = { k: '#182030', r: '#e03838', h: '#ffb0a8', w: '#f4f4ec', s: '#b0bac4' };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash = (x, y) => { let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ───────── 미로 만들기 ─────────
// hw[r][c]: 칸 (r,c) 위쪽 벽 (r = 0..rows), vw[r][c]: 칸 왼쪽 벽 (c = 0..cols). true = 벽 있음
const NB = (r, c) => [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
function blank(cols, rows) {
  return {
    cols, rows,
    hw: Array.from({ length: rows + 1 }, () => Array(cols).fill(true)),
    vw: Array.from({ length: rows }, () => Array(cols + 1).fill(true)),
    room: Array.from({ length: rows }, () => Array(cols).fill(false)),
  };
}
const inside = (m, y, x) => y >= 0 && y < m.rows && x >= 0 && x < m.cols;
function setWall(m, r, c, y, x, v) { if (y < r) m.hw[r][c] = v; else if (y > r) m.hw[y][c] = v; else if (x < c) m.vw[r][c] = v; else m.vw[r][x] = v; }
const isOpen = (m, r, c, y, x) => (y < r ? !m.hw[r][c] : y > r ? !m.hw[y][c] : x < c ? !m.vw[r][c] : !m.vw[r][x]);
const deg = (m, r, c) => NB(r, c).filter(([y, x]) => inside(m, y, x) && isOpen(m, r, c, y, x)).length;
const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// 1) 구불구불: 깊이 우선 (긴 복도, 갈래 적음)
function genDfs(m, rnd) {
  const seen = m.room.map((row) => row.map(() => false));
  const st = [[0, 0]]; seen[0][0] = true;
  while (st.length) {
    const [r, c] = st[st.length - 1];
    const nb = NB(r, c).filter(([y, x]) => inside(m, y, x) && !seen[y][x]);
    if (!nb.length) { st.pop(); continue; }
    const [y, x] = nb[Math.floor(rnd() * nb.length)];
    setWall(m, r, c, y, x, false); seen[y][x] = true; st.push([y, x]);
  }
}
// 2) 갈래길: 무작위 프림 (짧은 갈래와 막다른 길이 많음)
function genPrim(m, rnd) {
  const seen = m.room.map((row) => row.map(() => false));
  const fr = [];
  const add = (r, c) => { for (const [y, x] of NB(r, c)) if (inside(m, y, x) && !seen[y][x]) fr.push([r, c, y, x]); };
  const r0 = Math.floor(rnd() * m.rows), c0 = Math.floor(rnd() * m.cols);
  seen[r0][c0] = true; add(r0, c0);
  while (fr.length) {
    const i = Math.floor(rnd() * fr.length); const [r, c, y, x] = fr[i]; fr[i] = fr[fr.length - 1]; fr.pop();
    if (seen[y][x]) continue;
    setWall(m, r, c, y, x, false); seen[y][x] = true; add(y, x);
  }
}
// 크루스칼 (방과 복도의 밑바탕)
function genKruskal(m, rnd) {
  const id = (r, c) => r * m.cols + c; const par = Array.from({ length: m.rows * m.cols }, (_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const edges = [];
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) { if (r + 1 < m.rows) edges.push([r, c, r + 1, c]); if (c + 1 < m.cols) edges.push([r, c, r, c + 1]); }
  for (const [r, c, y, x] of shuffle(edges, rnd)) { const a = find(id(r, c)), b = find(id(y, x)); if (a !== b) { par[a] = b; setWall(m, r, c, y, x, false); } }
}
// 3) 방과 복도: 미로에 넓은 방을 몇 개 파고, 벽 몇 개를 더 뚫어 돌아가는 길(고리)을 만듦
function genRooms(m, rnd) {
  genKruskal(m, rnd);
  const n = Math.max(2, Math.round((m.cols * m.rows) / 30));
  for (let k = 0; k < n; k++) {
    const w = 2 + Math.floor(rnd() * 2), h = 2 + Math.floor(rnd() * 2);
    const r0 = Math.floor(rnd() * (m.rows - h + 1)), c0 = Math.floor(rnd() * (m.cols - w + 1));
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) {
      m.room[r][c] = true;
      if (r + 1 < r0 + h) setWall(m, r, c, r + 1, c, false);
      if (c + 1 < c0 + w) setWall(m, r, c, r, c + 1, false);
    }
  }
  const loops = Math.round((m.cols * m.rows) / 16);
  for (let k = 0; k < loops; k++) {
    const r = Math.floor(rnd() * m.rows), c = Math.floor(rnd() * m.cols);
    const nb = NB(r, c).filter(([y, x]) => inside(m, y, x)); const [y, x] = nb[Math.floor(rnd() * nb.length)];
    setWall(m, r, c, y, x, false);
  }
}
// 4) 소용돌이 성: 겹겹이 네모 고리. 고리마다 벽 하나로 막고 안쪽으로 가는 문 하나 → 빙 돌아 가운데 안뜰로
function ringOf(m, k) {
  const r0 = k, c0 = k, r1 = m.rows - 1 - k, c1 = m.cols - 1 - k;
  if (r1 < r0 || c1 < c0) return null;
  const cells = [];
  if (r0 === r1) { for (let c = c0; c <= c1; c++) cells.push([r0, c]); return { cells, cycle: false, r0, c0, r1, c1 }; }
  if (c0 === c1) { for (let r = r0; r <= r1; r++) cells.push([r, c0]); return { cells, cycle: false, r0, c0, r1, c1 }; }
  for (let c = c0; c <= c1; c++) cells.push([r0, c]);
  for (let r = r0 + 1; r <= r1; r++) cells.push([r, c1]);
  for (let c = c1 - 1; c >= c0; c--) cells.push([r1, c]);
  for (let r = r1 - 1; r > r0; r--) cells.push([r, c0]);
  return { cells, cycle: true, r0, c0, r1, c1 };
}
function genRings(m, rnd) {
  const lvl = (r, c) => Math.min(r, c, m.rows - 1 - r, m.cols - 1 - c);
  let entry = [0, 0];
  for (let k = 0; ; k++) {
    const ring = ringOf(m, k); if (!ring) break;
    const h = ring.r1 - ring.r0 + 1, w = ring.c1 - ring.c0 + 1;
    if (Math.min(h, w) <= 3) {   // 가운데 안뜰: 벽 없이 탁 트임
      for (let r = ring.r0; r <= ring.r1; r++) for (let c = ring.c0; c <= ring.c1; c++) {
        m.room[r][c] = true;
        if (r < ring.r1) setWall(m, r, c, r + 1, c, false);
        if (c < ring.c1) setWall(m, r, c, r, c + 1, false);
      }
      break;
    }
    const L = ring.cells, n = L.length;
    for (let i = 0; i < n; i++) { const [r, c] = L[i], [y, x] = L[(i + 1) % n]; setWall(m, r, c, y, x, false); }
    const e = Math.max(0, L.findIndex(([r, c]) => r === entry[0] && c === entry[1]));
    const d = rnd() < 0.5 ? 1 : -1;
    const [pr, pc] = L[(e - d + n) % n]; setWall(m, L[e][0], L[e][1], pr, pc, true);   // 들어온 자리 옆을 막음 → 한 방향으로만 돎
    // 안쪽 문: 돌아가는 길의 뒤쪽 절반 어딘가
    const cand = [];
    for (let i = 0; i < n; i++) {
      const pos = ((i - e) * d + n) % n; const [r, c] = L[i];
      const inn = NB(r, c).find(([y, x]) => inside(m, y, x) && lvl(y, x) === k + 1);
      if (inn) cand.push({ pos, r, c, inn });
    }
    if (!cand.length) break;
    const far = cand.filter((o) => o.pos >= n * 0.45); const pool = far.length ? far : cand;
    const o = pool[Math.floor(rnd() * pool.length)];
    setWall(m, o.r, o.c, o.inn[0], o.inn[1], false); entry = o.inn;
  }
}
// 5) 순환로: 구불구불 미로에서 막다른 길을 대부분 없앰 (빙글빙글 돌 수 있는 길)
function genBraid(m, rnd) {
  genDfs(m, rnd);
  const cells = []; for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) cells.push([r, c]);
  for (const [r, c] of shuffle(cells, rnd)) {
    if (deg(m, r, c) !== 1 || rnd() < 0.15) continue;
    const closed = NB(r, c).filter(([y, x]) => inside(m, y, x) && !isOpen(m, r, c, y, x));
    if (!closed.length) continue;
    const dead = closed.filter(([y, x]) => deg(m, y, x) === 1);
    const [y, x] = (dead.length ? dead : closed)[Math.floor(rnd() * (dead.length || closed.length))];
    setWall(m, r, c, y, x, false);
  }
}
// 6) 칸막이 방: 재귀 분할. 빈 판을 문 하나 난 긴 일직선 벽으로 계속 나눔 (작은 칸은 가끔 방으로 남김)
function genDivision(m, rnd) {
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
    if (r + 1 < m.rows) setWall(m, r, c, r + 1, c, false);
    if (c + 1 < m.cols) setWall(m, r, c, r, c + 1, false);
  }
  const divide = (r0, c0, h, w) => {
    if (h < 2 || w < 2) return;
    if (h * w <= 6 && rnd() < 0.45) { for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) m.room[r][c] = true; return; }
    const horiz = h > w || (h === w && rnd() < 0.5);
    if (horiz) {
      const k = 1 + Math.floor(rnd() * (h - 1)), gap = c0 + Math.floor(rnd() * w);
      for (let c = c0; c < c0 + w; c++) if (c !== gap) m.hw[r0 + k][c] = true;
      divide(r0, c0, k, w); divide(r0 + k, c0, h - k, w);
    } else {
      const k = 1 + Math.floor(rnd() * (w - 1)), gap = r0 + Math.floor(rnd() * h);
      for (let r = r0; r < r0 + h; r++) if (r !== gap) m.vw[r][c0 + k] = true;
      divide(r0, c0, h, k); divide(r0, c0 + k, h, w - k);
    }
  };
  divide(0, 0, m.rows, m.cols);
}
// 7) 바람 부는 길: 사이드와인더. 줄마다 옆으로 길게 달리다 한 칸에서만 위로 → 가로로 긴 바람길. 위아래를 가끔 뒤집음
function genSidewinder(m, rnd) {
  const flip = rnd() < 0.5;   // true: 맨 아랫줄이 통로, 아래로 올라붙음
  const rowOf = (i) => (flip ? m.rows - 1 - i : i);
  for (let c = 0; c + 1 < m.cols; c++) setWall(m, rowOf(0), c, rowOf(0), c + 1, false);
  for (let i = 1; i < m.rows; i++) {
    const r = rowOf(i), up = rowOf(i - 1);
    let run = [];
    for (let c = 0; c < m.cols; c++) {
      run.push(c);
      if (c + 1 < m.cols && rnd() < 0.62) setWall(m, r, c, r, c + 1, false);
      else { const k = run[Math.floor(rnd() * run.length)]; setWall(m, r, k, up, k, false); run = []; }
    }
  }
}
// 8) 거울 미로: 왼쪽 반을 구불구불하게 파고 오른쪽에 거울처럼 복사. 가운데 축에 문을 내서 반드시 이어짐
function genMirror(m, rnd) {
  const cw = Math.ceil(m.cols / 2); const s = blank(cw, m.rows); genDfs(s, rnd);
  for (let r = 0; r <= m.rows; r++) for (let c = 0; c < cw; c++) { m.hw[r][c] = s.hw[r][c]; m.hw[r][m.cols - 1 - c] = s.hw[r][c]; }
  for (let r = 0; r < m.rows; r++) for (let p = 0; p < cw; p++) { m.vw[r][p] = s.vw[r][p]; m.vw[r][m.cols - p] = s.vw[r][p]; }
  if (m.cols % 2 === 0) {   // 짝수 폭: 두 반쪽이 떨어져 있음 → 축에 문 1~2개
    for (let r = 0; r < m.rows; r++) m.vw[r][cw] = true;
    const doors = 1 + (m.rows > 9 ? 1 : 0);
    for (let k = 0; k < doors; k++) m.vw[Math.floor(rnd() * m.rows)][cw] = false;
  }
}
// 9) 지그재그 길: 세로 통로를 위아래로 오가는 뱀 길 + 군데군데 옆 통로로 질러가는 샛길
function genZigzag(m, rnd) {
  for (let c = 0; c < m.cols; c++) for (let r = 0; r + 1 < m.rows; r++) setWall(m, r, c, r + 1, c, false);
  for (let c = 0; c + 1 < m.cols; c++) {
    const end = c % 2 === 0 ? m.rows - 1 : 0;
    setWall(m, end, c, end, c + 1, false);
    if (m.rows > 3 && rnd() < 0.45) { const r = 1 + Math.floor(rnd() * (m.rows - 2)); setWall(m, r, c, r, c + 1, false); }
  }
}
// 10) 십자 광장: 구불구불 미로 한가운데 마름모 광장 + 가로세로로 뻗은 큰길
function genCross(m, rnd) {
  genDfs(m, rnd);
  const cr = (m.rows - 1) / 2, cc = (m.cols - 1) / 2, rad = Math.max(1, Math.floor(Math.min(m.cols, m.rows) / 4));
  const ar = Math.round(cr), ac = Math.round(cc);
  const plaza = (r, c) => Math.abs(r - cr) + Math.abs(c - cc) <= rad + 0.5;
  const road = (r, c) => (r === ar && c >= 1 && c <= m.cols - 2) || (c === ac && r >= 1 && r <= m.rows - 2);
  const on = (r, c) => inside(m, r, c) && (plaza(r, c) || road(r, c));
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
    if (!on(r, c)) continue;
    m.room[r][c] = true;   // 광장 + 큰길 바닥을 따로 칠함 → '+' 모양이 보임
    if (on(r + 1, c)) setWall(m, r, c, r + 1, c, false);
    if (on(r, c + 1)) setWall(m, r, c, r, c + 1, false);
  }
}

export const GENS = {
  dfs: { name: '구불구불 길', make: genDfs },
  prim: { name: '갈래갈래 길', make: genPrim },
  rooms: { name: '방과 복도', make: genRooms },
  rings: { name: '소용돌이 성', make: genRings },
  braid: { name: '빙글빙글 순환로', make: genBraid },
  division: { name: '칸막이 방', make: genDivision },
  sidewinder: { name: '바람 부는 길', make: genSidewinder },
  mirror: { name: '거울 미로', make: genMirror },
  zigzag: { name: '지그재그 길', make: genZigzag },
  cross: { name: '십자 광장', make: genCross },
};
const GEN_KEYS = Object.keys(GENS);

// 순수 함수 (DOM 없음): 미로 + 출구(시작에서 가장 먼 칸) + 정답 길 + 닿는 칸 수 (시험용)
export function makeMaze({ cols, rows, seed, gen = 'dfs' }) {
  const m = blank(cols, rows);
  GENS[gen].make(m, rng(seed));
  const prev = new Map(); const q = [[0, 0]]; prev.set('0,0', null); let far = [0, 0];
  for (let qi = 0; qi < q.length; qi++) {
    const [r, c] = q[qi]; far = [r, c];
    for (const [y, x] of NB(r, c)) {
      if (!inside(m, y, x) || prev.has(`${y},${x}`) || !isOpen(m, r, c, y, x)) continue;
      prev.set(`${y},${x}`, [r, c]); q.push([y, x]);
    }
  }
  const path = []; for (let p = far; p; p = prev.get(`${p[0]},${p[1]}`)) path.unshift(p);
  return { ...m, gen, exit: far, path, reach: q.length };
}

// ───────── 테마 ─────────
const THEMES = [
  { name: '물속', bg: '#0a1820', bgDot: '#10262e', floorA: '#1d6a70', floorB: '#1a6066', seam: '#14525a', specks: ['#237a7e'],
    roomA: '#2a8284', roomB: '#287e80', top: '#b8c2ae', topHi: '#e2e8d4', topLo: '#8e9a8c', face: '#566870', faceLo: '#303c46', mortar: '#46565e',
    rail: '#e8d8a0', post: '#7a6a40', shadow: 'rgba(0,16,24,.45)', frame: '#05100f',
    hole: '#050c10', holeHi: '#0a1a20', rim: '#0e3238', blink: '#3fa7a3', stone: '#8e9a8c',
    hud: '#132a34', hudLine: '#2a6870', banner: '#5cc8c0', fx: '#5cc8c0' },
  { name: '숲', bg: '#0c2010', bgDot: '#18381a', floorA: '#86b252', floorB: '#7eaa4c', seam: '#6e9a42', specks: ['#94c060', '#94c060', '#f8f0a0', '#f4b0d0'],
    roomA: '#b89a64', roomB: '#b0925e', top: '#2e7a2c', topHi: '#5aa844', topLo: '#1f5c20', face: '#1c4a1a', faceLo: '#0e2c0e', mortar: '#2a6426',
    rail: '#d0a060', post: '#6a4424', shadow: 'rgba(10,30,6,.45)', frame: '#081808',
    hole: '#0c0804', holeHi: '#1e150a', rim: '#3a2a14', blink: '#e0b050', stone: '#8a6a40',
    hud: '#143618', hudLine: '#4a8a34', banner: '#a8e070', fx: '#e8f8a0' },
  { name: '사막', bg: '#2e1c0e', bgDot: '#46301a', floorA: '#e2c084', floorB: '#dab87c', seam: '#c8a264', specks: ['#f0d8a4', '#b88e56', '#caa06a'],
    roomA: '#d0a46a', roomB: '#c89c62', top: '#c47a4a', topHi: '#eca472', topLo: '#9a5a34', face: '#7c4428', faceLo: '#4a2818', mortar: '#5e341e',
    rail: '#f4e4c4', post: '#7a5030', shadow: 'rgba(70,36,10,.35)', frame: '#1c0e04',
    hole: '#140a04', holeHi: '#2a1808', rim: '#5a3418', blink: '#f8b840', stone: '#a07048',
    hud: '#4a2c14', hudLine: '#c47a4a', banner: '#f8c878', fx: '#fff0c8' },
  { name: '밤하늘', bg: '#04061a', bgDot: '#d8e0ff', floorA: '#1e2858', floorB: '#1b2450', seam: '#151d44', specks: ['#2e3c7c', '#3a4a92'],
    roomA: '#2e3474', roomB: '#2b316e', top: '#6474b4', topHi: '#aab6ea', topLo: '#46548e', face: '#2c3670', faceLo: '#161c44', mortar: '#232b60',
    rail: '#f8e070', post: '#8a78c0', shadow: 'rgba(0,0,12,.5)', frame: '#020310',
    hole: '#000004', holeHi: '#0c0c26', rim: '#c8a030', blink: '#fff0a0', stone: '#6474b4', glow: true,
    hud: '#0c1030', hudLine: '#6474b4', banner: '#f8e070', fx: '#ffffff' },
];

// 판 하나 준비: 칸 크기 · 벽 사각형 · 바닥 무늬
function buildStage(spec, no) {
  const m = makeMaze(spec);
  const TH = THEMES[spec.theme];
  const cell = Math.floor(Math.min((W - 8 - T) / m.cols, (H - HUD - 10 - T - WH) / m.rows));
  const bw = m.cols * cell + T, bh = m.rows * cell + T;
  const walls = [];
  for (let r = 0; r <= m.rows; r++) for (let c = 0; c < m.cols; c++) {
    if (m.hw[r][c]) walls.push({ x: c * cell, y: r * cell, w: cell + T, h: T, outer: r === 0 || r === m.rows });
  }
  for (let r = 0; r < m.rows; r++) for (let c = 0; c <= m.cols; c++) {
    if (m.vw[r][c]) walls.push({ x: c * cell, y: r * cell, w: T, h: cell + T, outer: c === 0 || c === m.cols });
  }
  const ctr = ([r, c]) => [c * cell + T + (cell - T) / 2, r * cell + T + (cell - T) / 2];
  // 바닥 (한 번만 그려 둠)
  const floor = document.createElement('canvas'); floor.width = bw; floor.height = bh;
  const f = floor.getContext('2d'); const rnd = rng(spec.seed * 7 + 1);
  f.fillStyle = TH.seam; f.fillRect(0, 0, bw, bh);
  const stars = [];
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
    const x = c * cell + T, y = r * cell + T, s = cell - T;
    const rm = m.room[r][c];
    f.fillStyle = rm ? ((r + c) % 2 ? TH.roomA : TH.roomB) : ((r + c) % 2 ? TH.floorA : TH.floorB);
    // 방 안은 이음새 없이 한 판으로 (탁 트인 느낌)
    const ex = rm && c + 1 < m.cols && m.room[r][c + 1] && !m.vw[r][c + 1] ? T : 0;
    const ey = rm && r + 1 < m.rows && m.room[r + 1][c] && !m.hw[r + 1][c] ? T : 0;
    f.fillRect(x, y, s + ex, s + ey);
    if (!rm) { f.fillStyle = TH.seam; f.fillRect(x, y + s - 1, s, 1); f.fillRect(x + s - 1, y, 1, s); }
    for (let k = 0; k < 3; k++) {
      f.fillStyle = TH.specks[Math.floor(rnd() * TH.specks.length)];
      f.fillRect(x + 1 + Math.floor(rnd() * (s - 3)), y + 1 + Math.floor(rnd() * (s - 3)), 1, 1);
    }
    if (TH.glow && rnd() < 0.6) stars.push({ x: x + 1 + Math.floor(rnd() * (s - 3)), y: y + 1 + Math.floor(rnd() * (s - 3)), ph: rnd() * 6.28, big: rnd() < 0.3 });
  }
  return { ...m, no, spec, TH, cell, bw, bh, walls, ctr, floor, stars, start: ctr([0, 0]), hole: ctr(m.exit), pathPts: m.path.map(ctr) };
}

// 도트 원
function disc(g, cx, cy, r, color) {
  g.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
    g.fillRect(Math.round(cx) - hw, Math.round(cy) + dy, hw * 2 + 1, 1);
  }
}

// ───────── 기울기: 오일러 각(beta/gamma) → 중력 벡터 ─────────
// 기기 좌표 (x 오른쪽, y 화면 위쪽, z 화면 밖). beta·gamma 만으로 정확히 나옴 (alpha 무관 → 상대/절대 센서 같은 값)
// 각도를 그대로 빼면 폰을 세워 들 때(beta≈90) gamma 가 ±90 으로 튀어 방향이 뒤집힘 → 벡터로 계산
function gravityOf(beta, gamma) {
  const B = beta * D2R, G = gamma * D2R;
  return [Math.sin(G) * Math.cos(B), -Math.sin(B), -Math.cos(G) * Math.cos(B)];
}
function screenAngle() {
  const a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
  return ((Math.round(a / 90) * 90) % 360 + 360) % 360;
}
// 화면 좌표 (x 오른쪽, y 아래, z 밖)
function toScreen([x, y, z], ang) {
  if (ang === 90) return [-y, -x, z];
  if (ang === 270) return [y, x, z];
  if (ang === 180) return [-x, y, z];
  return [x, -y, z];
}
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// 수평 자세 n0 를 (0,0,-1) 로 돌리는 회전 (로드리게스)
function levelRot(n0) {
  const b = [0, 0, -1]; const v = cross(n0, b); const c = dot(n0, b);
  if (c < -0.999) return (p) => [p[0], -p[1], -p[2]];   // 화면이 하늘 반대 (뒤집음): x 축 180°
  return (p) => { const vp = cross(v, p), vvp = cross(v, vp), k = 1 / (1 + c); return [p[0] + vp[0] + vvp[0] * k, p[1] + vp[1] + vvp[1] * k, p[2] + vp[2] + vvp[2] * k]; };
}

function ensureStyle() {
  if (document.getElementById('mgm-style2')) return;
  const s = document.createElement('style'); s.id = 'mgm-style2';
  s.textContent = `
.mgm-bar { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%; max-width: 340px; text-align: center; }
.mgm-bar .mgm-row { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; width: 100%; }
.mgm-bar .btn { flex: 1; min-width: 0; }
.mgm-hint { font-size: 12px; color: #384050; line-height: 1.4; }
.mgm-hint b { color: #1d6a70; }
.mgm-hint.warn { color: #a03020; }
.mgm-mode { display: inline-block; font-size: 13px; font-weight: bold; color: #f8f0c0; background: #182030; border-radius: 4px; padding: 3px 10px; }`;
  document.head.append(s);
}

export default {
  id: 'maze',
  title: '자이로 미로',
  start(stage, api) {
    ensureStyle();
    const RANKED = api.mode !== 'free';
    const pc = pixelCanvas(stage, W, H); const { c, g } = pc;
    const bar = document.createElement('div'); bar.className = 'mgm-bar'; stage.append(bar);
    const dex = api.partner();

    // 자유 모드: 미로 종류를 섞어 돌림 (같은 종류가 연달아 안 나오게)
    const sess = rng((Math.random() * 2 ** 31) | 0);
    let order = [], lastGen = '';
    const nextGen = () => {
      if (!order.length) { order = shuffle([...GEN_KEYS], sess); if (order[0] === lastGen) order.push(order.shift()); }
      lastGen = order.shift(); return lastGen;
    };
    const specOf = (no) => (RANKED ? RANK[no - 1]
      : { ...freeSize(no), seed: (sess() * 2 ** 31) | 0, gen: nextGen(), theme: (no - 1) % THEMES.length });

    let st = buildStage(specOf(1), 1);
    const ball = { x: st.start[0], y: st.start[1], vx: 0, vy: 0, s: 1 };
    let mode = 'ready';           // ready → play → fall → (다음 판 play | done)
    let elapsed = 0;              // 실제 경과 ms (탭 숨김 · 일시정지 동안은 안 셈)
    let lastReal = 0, paused = false, cleared = 0;
    let fallT = 0, banner = 0, bannerText = '', bannerSub = '', cheer = 0, ended = false, lastHit = 0;
    const tilt = { x: 0, y: 0 };  // -1..1 (화면 오른쪽/아래가 +)
    // 센서: rel = deviceorientation, abs = deviceorientationabsolute (자이로 없는 안드로이드 폰은 rel 이 null 만 줌)
    const ori = { on: false, got: false, src: '', relT: -1e9, sv: null, n0: null, rot: null, cal: null, t0: 0, recal: 0 };
    const stuck = { t: 0, ref: null };
    const drag = { id: null, x0: 0, y0: 0, x: 0, y: 0 };
    const keys = new Set();
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));

    // 수평 다시 잡기: 0.35초 동안 모은 자세의 평균. 폰이 흔들리는 중이면 (7° 넘게 퍼짐) 다시 모음
    // (샘플 3개 이상 · 평균에서 4° 안). 2.5초 넘게 계속 흔들리면 마지막 구간 평균으로 (자동 수평 맞추기가 뒤에서 바로잡음)
    const calibrate = () => { const now = performance.now(); ori.n0 = null; ori.rot = null; ori.cal = { t0: now, t: now, sum: [0, 0, 0], n: 0, list: [] }; stuck.t = 0; stuck.ref = null; };
    const feedCal = (v) => {
      const k = ori.cal; const now = performance.now();
      k.list.push(v); k.sum = [k.sum[0] + v[0], k.sum[1] + v[1], k.sum[2] + v[2]]; k.n++;
      if (now - k.t < 350 || k.n < 3) return;
      const mean = norm(k.sum);
      const spread = Math.min(...k.list.map((u) => dot(norm(u), mean)));
      if (spread < Math.cos(4 * D2R) && now - k.t0 < 2500) { Object.assign(k, { t: now, sum: [0, 0, 0], n: 0, list: [] }); return; }
      ori.n0 = mean; ori.rot = levelRot(mean); ori.cal = null;
    };
    const onOri = (e) => {
      const b = e.beta, gm = e.gamma;
      if (typeof b !== 'number' || typeof gm !== 'number' || !Number.isFinite(b) || !Number.isFinite(gm)) return;   // null (센서 없음) 무시
      if (b === 0 && gm === 0 && (e.alpha === 0 || e.alpha == null)) return;   // 일부 폰이 처음에 주는 가짜 0,0,0
      const now = performance.now();
      if (e.type === 'deviceorientation') ori.relT = now;
      else if (now - ori.relT < 500) return;   // 보통 센서가 살아 있으면 그쪽만 씀
      ori.got = true; ori.src = e.type === 'deviceorientation' ? 'rel' : 'abs';
      ori.sv = toScreen(gravityOf(b, gm), screenAngle());
      if (ori.on && ori.cal) feedCal(ori.sv);
    };
    const oriTilt = () => {
      if (!ori.on || !ori.rot || !ori.sv) return [0, 0];
      const p = ori.rot(ori.sv);
      return [clamp(p[0] / TILT_SIN, -1, 1), clamp(p[1] / TILT_SIN, -1, 1)];
    };
    // 손가락 끌기: 처음 누른 곳에서 끈 방향 = 기울기
    const onDown = (e) => { drag.id = e.pointerId; drag.x0 = drag.x = e.clientX; drag.y0 = drag.y = e.clientY; c.setPointerCapture?.(e.pointerId); e.preventDefault(); };
    const onMove = (e) => { if (e.pointerId !== drag.id) return; drag.x = e.clientX; drag.y = e.clientY; e.preventDefault(); };
    const onUp = (e) => { if (e.pointerId === drag.id) drag.id = null; };
    const KEYS = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1 };
    const onKey = (e) => { if (!KEYS[e.key]) return; e.preventDefault(); if (e.type === 'keydown') keys.add(e.key); else keys.delete(e.key); };
    // hub 가 랭킹 창을 위에 띄우면 멈춤 (멈춘 시간은 기록에 안 들어감)
    const onPause = () => { paused = true; drag.id = null; keys.clear(); };
    const onResume = () => { if (!paused) return; paused = false; lastReal = performance.now(); stuck.t = 0; };

    window.addEventListener('deviceorientation', onOri);
    window.addEventListener('deviceorientationabsolute', onOri);
    c.addEventListener('pointerdown', onDown); c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp); c.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    stage.addEventListener('mg-pause', onPause); stage.addEventListener('mg-resume', onResume);

    const readTilt = () => {
      let [x, y] = oriTilt();
      if (drag.id != null) { x += (drag.x - drag.x0) / 45; y += (drag.y - drag.y0) / 45; }
      x += (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
      y += (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
      tilt.x = clamp(x, -1, 1); tilt.y = clamp(y, -1, 1);
    };

    // 아래 막대
    const btn = (label, cls, fn) => { const b = document.createElement('button'); b.className = `btn ${cls}`; b.textContent = label; b.onclick = fn; return b; };
    const modeLabel = RANKED ? `랭킹 모드 · ${RANK.length}단계` : '자유 모드 · 끝없이';
    const showStart = () => {
      const tag = document.createElement('div'); tag.className = 'mgm-mode'; tag.textContent = modeLabel;
      const hint = document.createElement('div'); hint.className = 'mgm-hint';
      hint.innerHTML = (RANKED ? `같은 미로 ${RANK.length}판을 <b>가장 빨리</b>! ` : '미로가 끝없이 이어져요. 몇 단계까지 갈까요? ')
        + '<br>폰을 <b>평평하게</b> 들고 버튼을 눌러요. 기울여서 몬스터볼을 <b>구멍</b>에 넣어요!';
      const row = document.createElement('div'); row.className = 'mgm-row';
      row.append(btn('기울이기 켜기', 'primary', enableTilt), btn('손가락으로', '', () => begin(false)));
      bar.replaceChildren(tag, hint, row);
    };
    let note = '';
    let endBtn = null;
    const showPlay = () => {
      const hint = document.createElement('div'); hint.className = `mgm-hint${note ? ' warn' : ''}`;
      hint.innerHTML = note || (ori.on ? '폰을 기울여 굴려요 · 화면을 끌어도 돼요' : '화면을 누른 채 <b>끌면</b> 그쪽으로 기울어요 · 방향키도 OK');
      const row = document.createElement('div'); row.className = 'mgm-row';
      if (ori.on) row.append(btn('수평 다시 맞추기', 'small', () => { calibrate(); showBanner('수평 맞추는 중…', '폰을 가만히 들고 있어요', 0.8); api.sfx.blip(); }));
      if (!RANKED) {
        endBtn = btn('끝내기', 'small', finishFree);
        if (ended) endBtn.disabled = true;
        row.append(endBtn);
      }
      bar.replaceChildren(...[hint, row.childNodes.length ? row : null].filter(Boolean));
    };
    async function enableTilt() {
      const DOE = window.DeviceOrientationEvent;
      let ok = !!DOE;
      if (DOE && typeof DOE.requestPermission === 'function') {   // iOS: 꼭 탭 안에서 물어봐야 함
        try { ok = (await DOE.requestPermission()) === 'granted'; } catch { ok = false; }
        if (!ok) note = '기울이기 권한이 꺼져 있어요 (설정 › Safari › 동작 및 방향 접근). 지금은 화면을 <b>끌어서</b> 해요.';
      } else if (!DOE) note = '이 브라우저는 기울기 센서를 못 써요. 화면을 <b>끌어서</b> 해요.';
      begin(ok);
    }
    const showBanner = (a, b = '', sec = 1.4) => { banner = sec; bannerText = a; bannerSub = b; };
    const stageBanner = () => showBanner(`${st.no}단계 · ${st.TH.name} 미로`, RANKED ? `${st.no} / ${RANK.length} · ${GENS[st.gen].name}` : GENS[st.gen].name, 1.6);
    function begin(useOri) {
      if (mode !== 'ready') return;
      ori.on = useOri; ori.t0 = performance.now();
      if (useOri) calibrate();
      api.sfx.select();
      mode = 'play'; lastReal = performance.now(); stageBanner();
      showPlay();
      // 1.5초 안에 쓸 만한 값이 하나도 없으면 (센서 없음 · PC) 손가락으로 + 이유를 보여 줌
      if (useOri) later(() => { if (!ori.got && ori.on && !ended) { ori.on = false; ori.cal = null; note = '기울기 센서가 응답하지 않아요. 화면을 <b>끌어서</b> 해요.'; showPlay(); } }, 1500);
    }
    function finishFree() {
      if (ended) return;
      ended = true; mode = 'done'; if (endBtn) endBtn.disabled = true;
      showBanner(`${cleared}단계 클리어!`, '', 9); api.sfx.select();
      api.end(cleared, Math.round(elapsed));
    }
    showStart();

    // 물리: 하위 단계로 쪼개 한 번에 0.75도트 이하로만 움직임 → 벽 뚫기 없음
    const collide = () => {
      let hard = 0;
      for (const w of st.walls) {
        const cx = clamp(ball.x, w.x, w.x + w.w), cy = clamp(ball.y, w.y, w.y + w.h);
        const dx = ball.x - cx, dy = ball.y - cy, d2 = dx * dx + dy * dy;
        if (d2 >= R * R) continue;
        let nx, ny, pen;
        if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = R - d; }
        else { // 중심이 벽 안 (거의 없음): 가장 얕은 쪽으로 밀어냄
          const o = [[ball.x - w.x, -1, 0], [w.x + w.w - ball.x, 1, 0], [ball.y - w.y, 0, -1], [w.y + w.h - ball.y, 0, 1]].sort((a, b) => a[0] - b[0])[0];
          nx = o[1]; ny = o[2]; pen = o[0] + R;
        }
        ball.x += nx * pen; ball.y += ny * pen;
        const vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) { ball.vx -= (1 + BOUNCE) * vn * nx; ball.vy -= (1 + BOUNCE) * vn * ny; hard = Math.max(hard, -vn); }
      }
      return hard;
    };
    const physics = (dt) => {
      ball.vx += tilt.x * ACC * dt; ball.vy += tilt.y * ACC * dt;
      const fr = Math.exp(-FRICTION * dt); ball.vx *= fr; ball.vy *= fr;
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > VMAX) { ball.vx *= VMAX / sp; ball.vy *= VMAX / sp; }
      const n = Math.max(1, Math.ceil((Math.min(sp, VMAX) * dt) / 0.75));
      let hard = 0;
      for (let k = 0; k < n; k++) { ball.x += (ball.vx * dt) / n; ball.y += (ball.vy * dt) / n; hard = Math.max(hard, collide()); }
      const now = performance.now();
      if (hard > 35 && now - lastHit > 160) { lastHit = now; if (hard > 80) api.sfx.hit(); else api.sfx.blip(); }
      // 구멍: 가까이 오면 빨려 들어감
      const [hx, hy] = st.hole; const d = Math.hypot(ball.x - hx, ball.y - hy);
      if (d < 3.2) { mode = 'fall'; fallT = 0; api.sfx.ballPop(); ball.vx = ball.vy = 0; }
      else if (d < 7) { ball.vx += ((hx - ball.x) / d) * 120 * dt; ball.vy += ((hy - ball.y) / d) * 120 * dt; }
    };
    // 자동 수평 맞추기: 센서 기울기가 뚜렷한데 (0.45 넘음) 폰은 가만히 있고 볼도 2초 동안 안 움직이면
    // = 처음 잡은 수평이 틀어져서 볼이 벽에 눌려 있는 상태 → 지금 자세를 수평으로
    const watchStuck = (dt) => {
      if (!ori.on || !ori.rot || !ori.sv || drag.id != null || keys.size) { stuck.t = 0; return; }
      const [ox, oy] = oriTilt();
      const still = Math.hypot(ball.vx, ball.vy) < 6;
      const steady = stuck.ref && dot(norm(ori.sv), stuck.ref) > Math.cos(4 * D2R);
      if (!still || Math.hypot(ox, oy) < 0.45) { stuck.t = 0; stuck.ref = null; return; }
      if (!steady) { stuck.ref = norm(ori.sv); stuck.t = 0; return; }
      stuck.t += dt;
      if (stuck.t >= 2) { ori.recal++; calibrate(); showBanner('수평을 다시 맞췄어요', '폰을 가만히 들고 있어요', 1.2); api.sfx.blip(); }
    };

    const nextStage = () => {
      st = buildStage(specOf(st.no + 1), st.no + 1);
      Object.assign(ball, { x: st.start[0], y: st.start[1], vx: 0, vy: 0, s: 1 });
      mode = 'play'; stageBanner(); api.sfx.correct();
    };
    const step = (dt, t) => {
      const now = performance.now();
      if (paused) { lastReal = now; draw(t); return; }
      if (mode === 'play' || mode === 'fall') {
        let d = now - lastReal; if (d > 250) d = dt * 1000;   // 숨겼다 돌아온 첫 프레임
        elapsed += d;
      }
      lastReal = now;
      readTilt();
      if (banner > 0) banner -= dt;
      if (cheer > 0) cheer -= dt;
      if (mode === 'play') { physics(dt); if (mode === 'play') watchStuck(dt); }
      else if (mode === 'fall') {
        fallT += dt;
        const k = Math.min(1, fallT / 0.5);
        ball.x += (st.hole[0] - ball.x) * Math.min(1, dt * 14); ball.y += (st.hole[1] - ball.y) * Math.min(1, dt * 14);
        ball.s = 1 - k;
        if (fallT >= 0.65) {
          cheer = 1; cleared++;
          if (!RANKED || st.no < RANK.length) nextStage();
          else {
            mode = 'done'; showBanner('클리어!', '', 9); api.sfx.catch();
            const total = Math.round(elapsed);
            later(() => { if (!ended) { ended = true; api.end(total, total); } }, 900);
          }
        }
      }
      draw(t);
    };

    // 그리기
    const ballImg = document.createElement('canvas'); ballImg.width = ballImg.height = 8;
    { const b = ballImg.getContext('2d'); BALL.forEach((row, y) => [...row].forEach((ch, x) => { if (BALL_COL[ch]) { b.fillStyle = BALL_COL[ch]; b.fillRect(x, y, 1, 1); } })); }

    // 판 자체가 기울어 보이게: 캔버스를 3D 로 살짝 돌린다 (기울인 쪽이 화면 안으로 내려감)
    const lean = { x: 0, y: 0 }; const LEAN_DEG = matchMedia('(prefers-reduced-motion: reduce)').matches ? 4 : 11;
    c.style.transition = 'none'; c.style.willChange = 'transform';
    const leanBoard = () => {
      lean.x += (tilt.x - lean.x) * 0.2; lean.y += (tilt.y - lean.y) * 0.2;
      c.style.transform = `perspective(700px) rotateX(${(-lean.y * LEAN_DEG).toFixed(2)}deg) rotateY(${(lean.x * LEAN_DEG).toFixed(2)}deg)`;
      c.style.boxShadow = `${(-lean.x * 8).toFixed(1)}px ${(6 - lean.y * 8).toFixed(1)}px 14px rgba(0,0,0,.35)`;
    };

    // 테마별 배경 무늬
    const drawBg = (TH, t) => {
      g.fillStyle = TH.bg; g.fillRect(0, 0, W, H);
      g.fillStyle = TH.bgDot;
      if (TH.name === '물속') {
        for (let y = HUD + 2; y < H; y += 6) for (let x = (y / 6) % 2 ? 0 : 3; x < W; x += 6) if (Math.sin(x * 0.2 + y * 0.13 + t * 1.2) > 0.6) g.fillRect(x, y, 2, 1);
      } else if (TH.name === '숲') {   // 풀 포기
        for (let y = HUD + 3; y < H; y += 7) for (let x = (y % 2) * 4; x < W; x += 8) if (hash(x, y) > 0.55) { const sw = Math.sin(t * 1.5 + x * 0.3) > 0.7 ? 1 : 0; g.fillRect(x + sw, y, 1, 2); g.fillRect(x + 2, y + 1, 1, 1); }
      } else if (TH.name === '사막') {   // 모래 물결
        for (let k = 0; k < 7; k++) { const y0 = HUD + 10 + k * 28; for (let x = 0; x < W; x += 1) if ((x + k * 13) % 9 < 6) g.fillRect(x, Math.round(y0 + Math.sin(x * 0.07 + k + t * 0.4) * 3), 1, 1); }
      } else {   // 별
        for (let k = 0; k < 46; k++) { const x = Math.floor(hash(k, 1) * W), y = HUD + 2 + Math.floor(hash(k, 2) * (H - HUD - 2)); const v = Math.sin(t * 2 + k * 1.7); if (v > -0.3) { g.globalAlpha = v > 0.6 ? 0.9 : 0.4; g.fillRect(x, y, 1, 1); } }
        g.globalAlpha = 1;
      }
    };
    // 테마별 바닥 위 움직임
    const drawFx = (TH, ox, oy, t) => {
      g.fillStyle = TH.fx;
      if (TH.name === '물속' || TH.name === '숲') {   // 물빛 일렁임 / 햇빛 얼룩
        const sp = TH.name === '숲' ? 0.35 : 1; if (TH.name === '숲') g.globalAlpha = 0.35;
        for (let y = T; y < st.bh - T; y += 3) for (let x = T + ((y / 3) % 2 ? 1 : 0); x < st.bw - T; x += 3) {
          const v = Math.sin(x * 0.33 + t * 1.4 * sp) + Math.sin(y * 0.27 - t * 1.1 * sp) + Math.sin((x + y) * 0.19 + t * 0.8 * sp);
          if (v > 2.25) g.fillRect(ox + x, oy + y, v > 2.6 ? 2 : 1, 1);
        }
        g.globalAlpha = 1;
      } else if (TH.name === '사막') {   // 바람에 날리는 모래
        g.globalAlpha = 0.7;
        for (let k = 0; k < 26; k++) { const x = (hash(k, 7) * st.bw + t * (18 + 14 * hash(k, 8))) % st.bw, y = hash(k, 9) * st.bh; g.fillRect(Math.round(ox + x), Math.round(oy + y), 3, 1); }
        g.globalAlpha = 1;
      } else {   // 바닥에 비친 별 반짝
        for (const s of st.stars) { const v = Math.sin(t * 2.2 + s.ph); if (v < 0.2) continue; g.globalAlpha = v > 0.75 ? 0.95 : 0.45; g.fillRect(ox + s.x, oy + s.y, 1, 1); if (s.big && v > 0.85) { g.fillRect(ox + s.x - 1, oy + s.y, 3, 1); g.fillRect(ox + s.x, oy + s.y - 1, 1, 3); } }
        g.globalAlpha = 1;
      }
    };

    function draw(t) {
      leanBoard();
      const TH = st.TH;
      drawBg(TH, t);

      const px = Math.round(tilt.x * 2), py = Math.round(tilt.y * 2);           // 판 전체 시차
      const lx = Math.round(tilt.x * 1.2), ly = Math.round(tilt.y * 1.2);       // 벽만 조금 더 (기울어진 느낌)
      const ox = Math.floor((W - st.bw) / 2) + px, oy = HUD + 6 + WH + Math.floor((H - HUD - 6 - WH - st.bh) / 2) + py;

      // 판 테두리 (아래로 두꺼운 받침)
      g.fillStyle = TH.frame; g.fillRect(ox - 2, oy - WH - 2, st.bw + 4, st.bh + WH + 6);
      g.drawImage(st.floor, ox, oy);
      drawFx(TH, ox, oy, t);
      // 출구 구멍
      const [hx, hy] = st.hole; const hr = Math.max(4, Math.floor((st.cell - T) / 2) - 1);
      if (TH.glow) {   // 밤: 구멍 주변이 빛남
        g.globalAlpha = 0.16 + 0.1 * Math.sin(t * 3); disc(g, ox + hx, oy + hy, hr + 6, '#f8e070');
        g.globalAlpha = 0.25 + 0.1 * Math.sin(t * 3); disc(g, ox + hx, oy + hy, hr + 4, '#fff0a0'); g.globalAlpha = 1;
      }
      disc(g, ox + hx, oy + hy, hr + 2, TH.stone);
      disc(g, ox + hx, oy + hy, hr + 1, Math.sin(t * 4) > 0 ? TH.blink : TH.rim);
      disc(g, ox + hx, oy + hy, hr, TH.hole);
      g.fillStyle = TH.holeHi; g.fillRect(Math.round(ox + hx) - hr + 1, Math.round(oy + hy) - hr + 1, hr * 2 - 1, 1);
      if (mode !== 'done') {   // 반짝이는 안내 점
        g.fillStyle = Math.sin(t * 6) > 0 ? '#f8e070' : '#c89830';
        const a = t * 2.4;
        for (let k = 0; k < 4; k++) g.fillRect(Math.round(ox + hx + Math.cos(a + k * 1.571) * (hr + 2.5)), Math.round(oy + hy + Math.sin(a + k * 1.571) * (hr + 2.5)), 1, 1);
      }
      // 벽 그림자 (오른쪽 아래로)
      g.fillStyle = TH.shadow;
      for (const w of st.walls) g.fillRect(ox + w.x + 1, oy + w.y + 1, w.w, w.h + 1);
      // 볼 그림자 + 볼 (벽보다 먼저 → 남쪽 벽 윗면이 볼을 살짝 가림)
      if (ball.s > 0.05) {
        const bx = ox + ball.x, by = oy + ball.y;
        if (mode !== 'fall') { g.fillStyle = 'rgba(0,10,16,.5)'; g.fillRect(Math.round(bx - 3), Math.round(by + 3), 7, 2); g.fillRect(Math.round(bx - 2), Math.round(by + 5), 5, 1); }
        const sz = Math.max(1, Math.round(8 * ball.s));
        g.drawImage(ballImg, Math.round(bx - sz / 2), Math.round(by - sz / 2), sz, sz);
      }
      // 벽: 남쪽 면 먼저, 그 위에 윗면
      const wx = ox + lx, wy = oy + ly;
      for (const w of st.walls) {
        const x = wx + w.x, y = wy + w.y + w.h - WH;
        g.fillStyle = TH.face; g.fillRect(x, y, w.w, WH);
        g.fillStyle = TH.faceLo; g.fillRect(x, y + WH - 1, w.w, 1);
        g.fillStyle = TH.mortar; for (let k = 2; k < w.w - 1; k += 4) g.fillRect(x + k, y, 1, WH - 1);
      }
      for (const w of st.walls) {
        const x = wx + w.x, y = wy + w.y - WH;
        g.fillStyle = TH.top; g.fillRect(x, y, w.w, w.h);
        g.fillStyle = TH.topHi; g.fillRect(x, y, w.w, 1);
        g.fillStyle = TH.topLo; g.fillRect(x, y + w.h - 1, w.w, 1);
        if (w.w > w.h) { g.fillStyle = TH.topLo; for (let k = 3; k < w.w - 1; k += 5) g.fillRect(x + k, y + 1, 1, 1); }
      }
      // 바깥 벽 난간 (기둥 + 가로대)
      for (const w of st.walls) {
        if (!w.outer || w.w < w.h) continue;
        const x = wx + w.x, y = wy + w.y - WH - 2;
        g.fillStyle = TH.post; for (let k = 1; k < w.w; k += 5) g.fillRect(x + k, y, 1, 2);
        g.fillStyle = TH.rail; g.fillRect(x, y, w.w, 1);
      }

      // 위쪽 정보: 판 · 시간 · 응원하는 내 몬스터
      g.fillStyle = TH.hud; g.fillRect(0, 0, W, HUD);
      g.fillStyle = TH.hudLine; g.fillRect(0, HUD - 1, W, 1);
      const lab = RANKED ? `${Math.min(st.no, RANK.length)}/${RANK.length}` : `${st.no}단계`;
      text(g, lab, 4, 4, { color: '#f8e070' });
      text(g, `${(elapsed / 1000).toFixed(2)}초`, RANKED ? 30 : 46, 4);
      const hop = cheer > 0 ? Math.round(Math.abs(Math.sin(cheer * 12)) * 3) : Math.round(Math.abs(Math.sin(t * 2)));
      drawMon(g, dex, W - 19, 0 - hop, 17, true);

      // 가운데 안내 띠
      if (mode === 'ready' || banner > 0 || paused) {
        const msg = paused ? '잠깐 멈춤' : mode === 'ready' ? '준비!' : bannerText;
        const sub = paused ? '' : mode === 'ready' ? modeLabel : bannerSub;
        const h = sub ? 32 : 22, y0 = 92;
        g.fillStyle = 'rgba(8,14,28,.78)'; g.fillRect(0, y0, W, h);
        g.fillStyle = TH.banner; g.fillRect(0, y0, W, 1); g.fillRect(0, y0 + h - 1, W, 1);
        text(g, msg, W / 2, y0 + 5, { size: 11, color: '#f8f0c0', align: 'center' });
        if (sub) text(g, sub, W / 2, y0 + 19, { color: TH.banner, align: 'center' });
      }
    }

    // 시험용 (개발 페이지에서만)
    if (location.pathname.endsWith('.dev-mg.html')) {
      window.__maze = { get: () => ({ mode, stage: st.no - 1, no: st.no, cleared, ranked: RANKED, gen: st.gen, theme: st.TH.name, paused, x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, path: st.pathPts, walls: st.walls, cell: st.cell, cols: st.cols, rows: st.rows, hw: st.hw, vw: st.vw, R, T, elapsed, tilt: { ...tilt }, ori: { on: ori.on, got: ori.got, src: ori.src, calibrated: !!ori.rot, recal: ori.recal } }) };
    }

    const stopLoop = loop(step);
    return () => {
      stopLoop(); pc.stop(); ended = true;
      timers.forEach(clearTimeout);
      window.removeEventListener('deviceorientation', onOri);
      window.removeEventListener('deviceorientationabsolute', onOri);
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
      c.removeEventListener('pointerdown', onDown); c.removeEventListener('pointermove', onMove);
      c.removeEventListener('pointerup', onUp); c.removeEventListener('pointercancel', onUp);
      stage.removeEventListener('mg-pause', onPause); stage.removeEventListener('mg-resume', onResume);
      if (window.__maze) delete window.__maze;
    };
  },
};
