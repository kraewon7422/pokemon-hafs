// 포켓몬 등굣길: 내 포켓몬이 한 칸씩 뛰어 학교 가는 길을 끝없이 올라간다. 길은 4가지 테마가 차례로 바뀌며 돈다:
//   학교(잔디·찻길·개울·기찻길) → 바닷가(모래·보트 물길·서핑보드/거북 등껍질·해변 열차) → 화산(현무암·광차 길·용암 강·광산 열차)
//   → 우주(달 표면·UFO 길·소행성 뗏목·유성 줄기) → 다시 학교 (한 바퀴 돌 때마다 더 빨라짐). 테마마다 약 70줄.
// 화면은 천천히 위로 올라가고(갈수록 빨라짐) 내 포켓몬이 아래 끝으로 밀려나면 '지각 괴물'이 올라와 잡아간다.
// 점수 = 가장 멀리 간 줄(칸) + 주운 상점(★). 서버 상한: 점수 ≤ 초×12+30 → 한 번 뛰기 0.09초(최대 초당 약 11줄),
// 끝낼 때 min(점수, 초×11+20) 으로 한 번 더 묶음. 멈춤(mg-pause)·숨긴 탭 시간은 ms 에 안 들어감 (게임 틱마다 dt 를 더함).
// 그림은 대부분 이 파일에서 도트로 그림. 바닷가 양동이·삽, 우주 소행성·불꽃 몇 개만 CC0 그림(web/img/games/cross/CREDITS.txt).
import { loadPhaser } from './common.js';
import { atlasURL } from '../sprites.js';

const GW = 160, GH = 288;      // 논리 해상도 (정수 배로 키움)
const T = 16;                  // 한 칸 = 16 도트
const COLS = 9, X0 = 8;        // 놀 수 있는 칸 9개 (양옆 8 도트는 밖)
const ALL = (1 << COLS) - 1;
const HOP = 0.09;              // 한 번 뛰기 (쉼 없음) → 최대 초당 약 11줄
const QMAX = 2;                // 뛰는 중에 미리 받아 두는 입력 수
const SUB = 1 / 120;           // 물리 잘게 쪼개기 (빠른 뛰기에서 차를 뚫고 지나가지 않게)
const PLAYER_SY = GH - 80;     // 카메라가 맞추는 내 포켓몬 화면 y (줄 가운데)
const CATCH_Y = GH - 6;        // 내 포켓몬 화면 y 가 이보다 아래면 지각 괴물에게 잡힘
const WARN_Y = Math.round(GH * 0.8); // 화면 아래 20% → 경고
const SWIPE = 18;              // 손가락이 이만큼(CSS px) 움직이면 바로 그 방향으로 뜀
const THEME_LEN = 70;          // 테마 하나의 줄 수
const TH_NAME = ['학교', '바닷가', '화산', '우주'];
const PROPS_URL = new URL('../../img/games/cross/cross-props.png', import.meta.url).href;
// cross-props.png 안의 CC0 조각 (x, y, w, h) — .work/cross/build_props.py 가 만든 그대로
const PROPS = { bucketR: [0, 0, 10, 17], bucketB: [11, 0, 10, 17], pileB: [22, 0, 18, 17], pileR: [41, 0, 18, 17], pebL: [60, 0, 12, 7], pebS: [73, 0, 7, 5], star1: [81, 0, 5, 5], star2: [87, 0, 5, 5], aster: [93, 0, 15, 13], rockS: [109, 0, 6, 6], rockT: [116, 0, 4, 5], spark: [121, 0, 7, 7], fire1: [129, 0, 15, 15], fire2: [145, 0, 13, 12], fire3: [159, 0, 11, 10] };
const TAU = Math.PI * 2;

// 화면이 올라가는 빠르기 (줄/초). 처음엔 느리고 갈수록 빨라짐. 바퀴(4테마)마다 조금 더.
export const creep = (best) => {
  const loop = Math.floor(best / (THEME_LEN * 4));
  return Math.min(1.55 + loop * 0.1, 1.0 + best * 0.0022 + loop * 0.08);
};

// ───────────────────────── 색 (앱 팔레트에 맞춤) ─────────────────────────
const C = {
  ink: '#182030', ink2: '#303848', ink3: '#586078',
  g1: '#88d070', g2: '#7cc464', gD: '#62a850', gL: '#a8e088',
  leaf: '#48a848', leafL: '#78c860', leafH: '#a8e088', leafD: '#2e8a2e', leafO: '#1c4c28',
  wood: '#c89858', woodL: '#e0b878', woodD: '#8a5a30', woodO: '#4a2c14',
  pave: '#ecdcbc', paveL: '#f8ecd0', paveD: '#d8c6a0', paveG: '#bca880', curb: '#a89878', curbL: '#d8d0c0',
  asph: '#545b72', asphL: '#606880', asphD: '#4a5066', line: '#f0e6c0',
  water: '#4aa8e0', waterD: '#3a92d0', waterL: '#8cd0f4', foam: '#e0f6ff', bank: '#2c74ac',
  grav: '#b4a48c', gravL: '#cabca4', gravD: '#988870', sleeper: '#7a5a3a', sleeperL: '#9a7a52', rail: '#d8e0e8', railD: '#7a8290',
  gold: '#f8d048', goldL: '#fff4a8', goldD: '#c08818', goldO: '#6a4808',
  red: '#e05050', redL: '#ff9a8a', redD: '#a02828', white: '#ffffff', glass: '#bfe6f8', glassL: '#e8f8ff',
  tire: '#20242c', hub: '#9aa4b4', shadow: '#18203050', wshadow: '#1c5a8c90',
  // 바닷가
  s1: '#f2dca0', s2: '#ecd294', sD: '#d4b474', sL: '#fff2c8',
  sea: '#3a9ad8', seaD: '#2c84c4', seaL: '#7cc8f0', shal: '#6cccd8', shalL: '#a8ecf0', shalD: '#50b4c8',
  plank: '#d8a868', plankL: '#f0c888', plankD: '#a87840', plankO: '#5a3a1c',
  // 화산
  r1: '#3e3546', r2: '#453b4e', rD: '#2a2432', rL: '#5c5268', glow: '#ff7a30', glowD: '#b8401c', ember: '#ffc860',
  lava: '#f05a1c', lavaD: '#c83c14', lavaL: '#ff9a38', lavaY: '#ffd860', crust: '#6a2410',
  bas: '#4c4658', basL: '#6c6680', basD: '#2e2a3a',
  // 우주
  m1: '#b8bcc8', m2: '#b0b4c2', mD: '#8c90a2', mL: '#dadde6', mC: '#787c90',
  vd: '#110d2a', vdL: '#1e1a44', starD: '#8a90c8', neon: '#58e8ff', neonD: '#2a8cb8', neonP: '#ff6ae0',
  deck: '#6c7890', deckL: '#8c9ab2', deckD: '#4c566c', deckO: '#262c3c',
};
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rgba = (h) => { const n = parseInt(h.slice(1, 7), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, h.length > 7 ? parseInt(h.slice(7, 9), 16) : 255]; };
const hexN = (h) => parseInt(h.slice(1, 7), 16);
const hex2 = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const colX = (c) => X0 + c * T + T / 2;                     // 칸 가운데 x
const snapCol = (x) => clamp(Math.round((x - X0 - T / 2) / T), 0, COLS - 1);
const laneBot = (r) => -r * T;                              // 줄 r 의 아랫줄 y (위로 갈수록 작아짐)
const laneCY = (r) => -r * T - T / 2;                       // 줄 가운데 y
const bitsOf = (m) => [...Array(COLS).keys()].filter((c) => (m >> c) & 1);
const pop = (m) => bitsOf(m).length;
export const CROSS = { GW, GH, T, COLS, X0, ALL, HOP, THEME_LEN, PLAYER_SY, CATCH_Y, colX, snapCol, bitsOf };

// ─────────────────── 도트 격자 (그림 그리기 도구, surf.js 와 같은 방식) ───────────────────
class G {
  constructor(w, h) { this.w = w; this.h = h; this.a = new Array(w * h).fill(null); }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.a[y * this.w + x] = c; }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.a[y * this.w + x]; }
  each(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = fn(x, y, this.a[y * this.w + x]); if (c !== undefined) this.a[y * this.w + x] = c; } }
  over(o, ox = 0, oy = 0) { o.each((x, y, c) => { if (c) this.set(x + ox, y + oy, c); }); return this; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); return this; }
  outline(col) {
    const add = [];
    this.each((x, y, c) => { if (!c && (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1))) add.push(x, y); });
    for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], col);
    return this;
  }
  ell(cx, cy, rx, ry, fn) { for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy <= 1.02) { const c = typeof fn === 'function' ? fn(x, y, dx, dy) : fn; if (c) this.set(x, y, c); } } return this; }
}
function pmap(rows, pal) { const g = new G(rows[0].length, rows.length); rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) g.set(x, y, pal[ch]); })); return g; }

// 여러 격자를 가로로 이어 붙여 Phaser 텍스처(프레임 0..n-1)로 등록
function addSheet(scene, key, frames) {
  const w = frames[0].w, h = frames[0].h;
  const cv = document.createElement('canvas'); cv.width = w * frames.length; cv.height = h;
  const x = cv.getContext('2d'); const img = x.createImageData(cv.width, h);
  frames.forEach((g, f) => g.each((px, py, c) => { if (!c) return; const [r, gg, b, a] = rgba(c); const i = (py * cv.width + f * w + px) * 4; img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = a; }));
  x.putImageData(img, 0, 0);
  const tex = scene.textures.addCanvas(key, cv);
  frames.forEach((_, f) => tex.add(f, 0, f * w, 0, w, h));
  return { w, h };
}

// ═══════════════════════════ 줄 만들기 (화면과 따로 — 시험에서도 그대로 씀) ═══════════════════════════
// 줄 하나 = { r, type, th, ... , R }. R = 그 줄까지 왔을 때 확실히 설 수 있는 칸(비트). 정적인 줄(잔디·보도·징검돌)은
// 반드시 R 과 이어진 빈칸을 남기므로, 시작 줄에서 어느 줄까지든 지나갈 길이 항상 하나는 있다.
// 움직이는 줄: 찻길·기찻길은 R 그대로(곧장 건너면 됨), 뗏목은 어디로든 데려다주므로 R = 전부.
// type 은 테마와 상관없이 같음 (grass=땅, walk=보도, road=탈것 길, logs=떠다니는 뗏목, pads=징검돌, bridge=다리, rail=기찻길)
const KINDS = [
  { grass: [['tree', 5], ['bush', 2], ['bench', 1.2], ['bed', 1.4]], walk: [['lamp', 1], ['bin', 1], ['bench', 1]] },
  { grass: [['palm', 4], ['castle', 2], ['rockB', 1.6], ['bucket', 1.2], ['umbr', 1.4]], walk: [['umbr', 1], ['cooler', 1], ['pile', 1.2]] },
  { grass: [['boulder', 4], ['vent', 2.2], ['spike', 1.6], ['dtree', 1.6]], walk: [['boulder', 1], ['vent', 1], ['crystal', 1]] },
  { grass: [['mrock', 3], ['crater', 2], ['dish', 1.4], ['aster', 2]], walk: [['crate', 1], ['antenna', 1], ['mrock', 1]] },
];
const ROAD_TIER = [[20, 26], [32, 40], [48, 58], [64, 74]];   // 느림 · 보통 · 빠름 · 아주 빠름 (도트/초)
const LOG_TIER = [[10, 14], [17, 22], [25, 31], [34, 41]];
// 움직이는 것 줄 세우기: 간격까지 합친 한 바퀴 길이(span)가 화면보다 충분히 길어서, 화면 밖에서만 순간이동함
function layMovers(L, list, rand) {
  let x = 0; for (const o of list) { o.x = x; x += o.w + o.gap; }
  L.span = x; L.xa = -(x - GW) / 2;
  const sh = rand() * x;
  for (const o of list) o.x = L.xa + ((o.x + sh) % x);
  L.objs = list;
}
const SPAN_MIN = GW + 2 * 52 + 12;
export const wrapX = (L, x) => L.xa + ((((x - L.xa) % L.span) + L.span) % L.span);

// 기찻길 시간표: 줄마다 씨앗으로 정해짐 (게임·시험·봇이 같은 함수를 씀). t = 그 줄의 시계(초, 줄이 화면에 있을 때만 흐름)
// 돌려줌: { st: idle|warn|pass, x: 전철 왼쪽 끝 x, left: 지금 상태가 끝날 때까지 남은 초 }
export function railAt(tr, t) {
  if (!tr.ev) { tr.ev = []; tr.rnd = rng(tr.seed); tr.evEnd = tr.t0; tr.passLen = (GW + 12 + tr.w) / tr.v; }
  while (tr.evEnd <= t + 20) {
    const ws = tr.evEnd, ps = ws + tr.warn, pe = ps + tr.passLen;
    tr.ev.push([ws, ps, pe]);
    tr.evEnd = pe + tr.gap[0] + tr.rnd() * (tr.gap[1] - tr.gap[0]);
  }
  const ev = tr.ev; let lo = 0, hi = ev.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (ev[m][0] <= t) { k = m; lo = m + 1; } else hi = m - 1; }
  if (k < 0) return { st: 'idle', x: 0, left: ev[0][0] - t };
  const [ws, ps, pe] = ev[k];
  if (t < ps) return { st: 'warn', x: 0, left: ps - t };
  if (t < pe) { const d = (t - ps) * tr.v; return { st: 'pass', x: tr.dir > 0 ? -tr.w - 4 + d : GW + 4 - d, left: pe - t }; }
  return { st: 'idle', x: 0, left: (ev[k + 1] ? ev[k + 1][0] : tr.evEnd) - t };
}

export function makeGen(rand = Math.random, opt = {}) {
  const lanes = [];
  let R = ALL, Rx = ALL, lastG = '', roadDir = rand() < 0.5 ? 1 : -1, logDir = rand() < 0.5 ? 1 : -1, lastTier = 0;
  let th = opt.th ?? 0;
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const rf = (a, b) => a + rand() * (b - a);
  const pickBit = (m) => { const b = bitsOf(m); return b[Math.floor(rand() * b.length)]; };
  const wpick = (list) => { let s = list.reduce((a, b) => a + b[1], 0) * rand(); for (const [k, w] of list) { s -= w; if (s <= 0) return k; } return list[0][0]; };
  const push = (L) => { L.r = lanes.length; L.R = R; L.th = th; lanes.push(L); return L; };
  const loopOf = (d) => Math.floor(d / (THEME_LEN * 4));
  const pr = (d) => clamp(d / 260, 0, 1) + loopOf(d) * 0.25;   // 난이도 0 → 1 (+ 바퀴마다 0.25)
  const tier = (w) => wpick(w.map((x, i) => [i, Math.max(0, x)]));

  // 잔디 · 보도: 막힌 칸을 놓되 R 의 한 칸은 반드시 비워 둠 (한 줄에 많아야 5칸)
  // 바로 아래 정적인 줄(찻길·기찻길은 곧장 건너므로 건너뛰고 봄)의 빈칸 덩어리마다 한 칸씩 (막다른 주머니 없음)
  const pocketKeep = () => {
    let i = lanes.length - 1; while (i > 0 && (lanes[i].type === 'road' || lanes[i].type === 'rail')) i--;
    const pv = lanes[i]; if (!pv) return 0;
    const free = pv.type === 'grass' || pv.type === 'walk' ? ALL & ~pv.block : pv.type === 'pads' ? pv.pads : 0;
    let m = 0; for (let c = 0; c < COLS;) { if (!((free >> c) & 1)) { c++; continue; } let e = c; while (e < COLS && ((free >> e) & 1)) e++; m |= 1 << ri(c, e - 1); c = e; }
    return m;
  };
  const still = (type, dens, keepCol, starP = 0.13) => {
    const d = lanes.length;
    const keep = keepCol ?? pickBit(R);
    const keepM = (1 << keep) | pocketKeep();
    let block = 0, n = 0;
    const order = [...Array(COLS).keys()].sort(() => rand() - 0.5);
    for (const c of order) if (!((keepM >> c) & 1) && n < 5 && rand() < dens) { block |= 1 << c; n++; }
    R = runs(ALL & ~block, R); Rx = ALL & ~block;
    const obs = bitsOf(block).map((c) => ({ c, k: wpick(KINDS[th][type]) }));
    const star = d > 4 && rand() < starP ? pickBit(R) : -1;
    return push({ type, block, obs, star, v: rand() < 0.5 ? 0 : 1 });
  };
  // 탈것 길: 빠르기 4단계 중 하나. 차 사이 간격 ≥ 속도×0.6초 + 26 도트 (건널 틈이 늘 있음)
  const road = () => {
    const d = lanes.length, p = pr(d);
    const tr = tier([3 - 2.6 * p, 2, 0.3 + 1.6 * p, 1.6 * p - 0.5]);
    const sp = rf(...ROAD_TIER[tr]) * (1 + Math.min(0.2, loopOf(d) * 0.07));
    const dir = rand() < 0.7 ? -roadDir : roadDir; roadDir = dir;
    const list = []; let tot = 0;
    while (tot < SPAN_MIN) {
      const big = d > 6 && rand() < Math.min(0.38, 0.1 + d / 220);
      const kind = big ? (d > 22 && rand() < 0.55 ? 'bus' : 'van') : 'car';
      const w = kind === 'bus' ? 48 : kind === 'van' ? 34 : 22;
      const gap = Math.max(T * 2.2, sp * 0.6 + 26) + rand() * T * Math.max(1.4, 4 - d / 40);
      list.push({ kind, w, gap, col: Math.floor(rand() * 6) }); tot += w + gap;
    }
    Rx = ALL; // 찻길 위에서 옆으로도 걸을 수 있음
    const L = push({ type: 'road', v: sp * dir, tier: tr });
    layMovers(L, list, rand);
    return L;
  };
  // 뗏목 강: 줄마다 빠르기 4단계 중 하나 (아주 빠름은 두 줄 연달아 안 나옴), 이웃한 물줄은 반드시 반대 방향
  const logs = () => {
    const d = lanes.length, p = pr(d);
    let tr = tier([3 - 2.2 * p, 2.2, 0.2 + 1.5 * p, 1.4 * p - 0.35]);
    if (tr === 3 && lastTier === 3) tr = 2;
    lastTier = tr;
    const sp = rf(...LOG_TIER[tr]) * (1 + Math.min(0.15, loopOf(d) * 0.05));
    const dir = -logDir; logDir = dir;
    const list = []; let tot = 0;
    while (tot < SPAN_MIN) {
      const n = tr >= 2 ? ri(3, 4) : ri(2, d > 60 ? 3 : 4); const w = n * T - 2;
      // 느린 물줄은 틈도 좁게 (뗏목을 기다리는 시간이 너무 길지 않게)
      const gap = Math.min(rf(1.2, 1.8 + Math.min(1.4, d / 60)) * T, T * 0.9 + sp * 1.5);
      list.push({ kind: `log${n}`, n, w, gap, alt: rand() < 0.5 ? 1 : 0 }); tot += w + gap;
    }
    // 뗏목은 물살 쪽으로만 데려다줌 (거슬러서는 뗏목 위 한 칸 정도). Rx = 올라탈 수도 있는 모든 칸.
    // 어느 칸에서 올라탔든 갈 수 있는 칸만 R 로 남김 → 다음 줄은 그 안에 길을 둠 (막다른 곳 없음)
    const E = bitsOf(Rx), lo = E[0], hi = E[E.length - 1];
    const ge = (c) => ALL & ~((1 << Math.max(0, c)) - 1), le = (c) => ((1 << Math.min(COLS, c + 1)) - 1) & ALL;
    R = dir > 0 ? ge(hi - 1) : le(lo + 1);
    Rx = dir > 0 ? ge(lo - 1) : le(hi + 1);
    const L = push({ type: 'logs', v: sp * dir, tier: tr });
    layMovers(L, list, rand);
    return L;
  };
  // 징검돌: R 의 한 칸에는 꼭 돌
  const pads = () => {
    const d = lanes.length;
    const n = d > 50 ? ri(2, 4) : ri(3, 5);
    let P = (1 << pickBit(R)) | pocketKeep();
    while (pop(P) < n) P |= 1 << ri(0, COLS - 1);
    R = runs(P, R); Rx = P;
    return push({ type: 'pads', pads: P, flower: ri(0, COLS - 1) });
  };
  const bridge = () => { R = ALL; Rx = ALL; return push({ type: 'bridge' }); };
  // 기찻길: 경고등 → 전철. 여러 줄이 이어지면 첫 경고 시각을 줄마다 1~1.7초씩 어긋나게 (한꺼번에 막히지 않게)
  const rail = (i) => {
    const d = lanes.length;
    if (i == null) { i = 0; while (lanes[d - 1 - i]?.type === 'rail') i++; } // 바로 아래에 이어진 기찻길 수
    const tr = { gap: [Math.max(2.0, 3 - d / 150), Math.max(4.2, 6.5 - d / 100)], warn: d < 60 ? 1.6 : 1.35, v: 330 + Math.min(130, d), cars: ri(3, 5), dir: rand() < 0.5 ? 1 : -1, seed: Math.floor(rand() * 2147483647), t0: 0.8 + rand() * 2.2 + i * rf(1.0, 1.7) };
    tr.w = tr.cars * 30 + 6; Rx = ALL;
    return push({ type: 'rail', tr });
  };
  const B = { grass: () => still('grass', 0.3), walk: () => still('walk', 0.12), road, logs, pads, bridge, rail };

  const roads = (n) => { for (let i = 0; i < n; i++) road(); };
  const rails = (n) => { for (let i = 0; i < n; i++) rail(i); };
  const water = (n, wide) => {
    const d = lanes.length;
    for (let i = 0; i < n; i++) {
      const prev = lanes[lanes.length - 1].type;
      if (d >= 16 && prev !== 'pads' && rand() < (wide ? 0.16 : 0.3)) pads();
      else if (i > 0 && i < n - 1 && prev !== 'bridge' && prev !== 'pads' && rand() < (wide ? 0.08 : 0.15)) bridge();
      else logs();
    }
  };
  const more = () => {
    const d = lanes.length;
    if (opt.flat) { R = ALL; Rx = ALL; push({ type: 'grass', block: 0, obs: [], star: -1, v: d % 2 }); return; }
    if (d === 0) { // 출발: 첫 줄은 비어 있고, 그다음 세 줄은 장애물 조금
      push({ type: 'grass', block: 0, obs: [], star: -1, v: 0 });
      for (let i = 0; i < 3; i++) still('grass', 0.14, 4); // 출발 칸 앞은 늘 비움
      opt.script?.forEach((t) => B[t]());
      return;
    }
    // 테마가 바뀌는 곳: 두 테마가 섞인 줄(배너) + 새 테마의 조용한 줄
    const nth = opt.th ?? Math.floor(d / THEME_LEN) % 4;
    if (nth !== th) {
      const from = th; th = nth; R = ALL; Rx = ALL;
      push({ type: 'grass', block: 0, obs: [], star: -1, v: 0, blend: from, banner: { th: nth, loop: loopOf(d) } });
      still('grass', 0.12);
      return;
    }
    const p = pr(d);
    const w = { road: 1, water: d >= 10 ? 0.85 : 0, rail: d >= 24 ? 0.5 : 0, mix: d >= 36 ? 0.45 : 0 };
    if (lastG) w[lastG] *= 0.35;
    const g = wpick(Object.entries(w));
    if (g === 'road') roads(d < 10 ? 1 : ri(1, Math.min(5, 2 + Math.floor(d / 25))));
    else if (g === 'water') {
      const wide = d >= 40 && rand() < 0.25 + 0.15 * Math.min(1, p);
      water(wide ? ri(4, Math.min(7, 4 + Math.floor(p * 3))) : d < 18 ? 1 : ri(1, Math.min(4, 2 + Math.floor(d / 30))), wide);
    } else if (g === 'rail') rails(ri(1, Math.min(4, 1 + Math.floor((d - 14) / 40) + loopOf(d))));
    else { // 섞인 덩어리 (쉬는 줄 없이 바로 이어짐)
      const k = ri(0, 2);
      if (k === 0) { roads(ri(1, 2)); water(ri(1, 3)); }
      else if (k === 1) { water(ri(1, 3)); roads(ri(1, 2)); }
      else { rails(ri(1, 2)); roads(ri(1, 2)); }
    }
    lastG = g;
    // 쉬는 줄 (잔디는 갈수록 조금 빽빽하게). 가끔 3줄짜리 '숨 돌리는 줄' (장애물 적고 상점 많음)
    const calm = d > 30 && rand() < 0.12;
    const ns = calm ? 3 : d < 10 ? ri(1, 2) : ri(1, d > 80 ? 1 : 2);
    for (let i = 0; i < ns; i++) {
      if (calm) still(rand() < 0.5 ? 'walk' : 'grass', 0.08, undefined, 0.4);
      else if (rand() < 0.25) still('walk', 0.12);
      else still('grass', Math.min(0.42, 0.18 + d / 300));
    }
  };
  return { lanes, ensure(n) { while (lanes.length < n) more(); } };
}
// free 칸들 중 R 과 이어진 덩어리 (옆으로 걸어갈 수 있는 칸)
function runs(free, R) {
  let out = 0;
  for (let c = 0; c < COLS;) {
    if (!((free >> c) & 1)) { c++; continue; }
    let e = c, m = 0; while (e < COLS && ((free >> e) & 1)) { m |= 1 << e; e++; }
    if (m & R) out |= m;
    c = e;
  }
  return out;
}

// ═══════════════════════════ 그림: 줄 바닥 (160×16) ═══════════════════════════
function grassTex(v) {
  const g = new G(GW, T); const s = v % 4;
  g.each((x, y) => { const h = hash(x, y, s); let c = v % 2 ? C.g2 : C.g1; if (h < 0.06) c = C.gD; else if (h > 0.96) c = C.gL; if (y === T - 1) c = C.gD; return c; });
  for (let i = 0; i < 9; i++) { const x = 2 + Math.floor(hash(i, s, 11) * (GW - 5)), y = 3 + Math.floor(hash(i, s, 12) * 9); g.set(x, y, C.gD); g.set(x + 2, y, C.gD); g.set(x + 1, y + 1, C.gD); }
  for (let i = 0; i < 3; i++) { const x = 3 + Math.floor(hash(i, s, 21) * (GW - 6)), y = 3 + Math.floor(hash(i, s, 22) * 9); g.set(x, y, ['#ffffff', '#f8a0c0', C.gold][i]); }
  return g;
}
function sandTex(v, PG) {
  const g = new G(GW, T); const s = v % 4;
  g.each((x, y) => { const h = hash(x, y, s + 40); let c = v % 2 ? C.s2 : C.s1; if (h < 0.07) c = C.sD; else if (h > 0.95) c = C.sL; if (y === T - 1) c = C.sD; return c; });
  for (let i = 0; i < 6; i++) { const x = 2 + Math.floor(hash(i, s, 41) * (GW - 8)), y = 3 + Math.floor(hash(i, s, 42) * 8); g.set(x, y, C.sD); g.set(x + 1, y, C.sL); g.set(x + 3, y + 1, C.sD); g.set(x + 4, y + 1, C.sL); }
  const deco = ['pebS', 'star1', 'star2', 'pebS'];
  for (let i = 0; i < 2; i++) { const p = PG(deco[(s + i) % 4]); g.over(p, 4 + Math.floor(hash(i, s, 43) * (GW - 14)), 2 + Math.floor(hash(i, s, 44) * (T - 4 - p.h))); }
  return g;
}
function rockTex(v) {
  const g = new G(GW, T); const s = v % 4;
  g.each((x, y) => { const h = hash(x >> 1, y >> 1, s + 60); let c = v % 2 ? C.r2 : C.r1; if (h < 0.1) c = C.rD; else if (h > 0.93) c = C.rL; if (y === T - 1) c = C.rD; return c; });
  for (let i = 0; i < 4; i++) { // 빛나는 금
    let x = 4 + Math.floor(hash(i, s, 61) * (GW - 20)), y = 3 + Math.floor(hash(i, s, 62) * 9);
    for (let k = 0; k < 7; k++) { g.set(x, y, k % 3 === 1 ? C.glow : C.glowD); x++; if (hash(i, k, s + 63) < 0.4) y += hash(i, k, s + 64) < 0.5 ? -1 : 1; y = clamp(y, 2, 13); }
  }
  for (let i = 0; i < 3; i++) g.set(3 + Math.floor(hash(i, s, 65) * (GW - 6)), 2 + Math.floor(hash(i, s, 66) * 12), C.ember);
  return g;
}
function moonTex(v) {
  const g = new G(GW, T); const s = v % 4;
  g.each((x, y) => { const h = hash(x, y, s + 80); let c = v % 2 ? C.m2 : C.m1; if (h < 0.07) c = C.mD; else if (h > 0.95) c = C.mL; if (y === T - 1) c = C.mD; return c; });
  for (let i = 0; i < 4; i++) { // 작은 구덩이
    const cx = 6 + Math.floor(hash(i, s, 81) * (GW - 12)), cy = 5 + Math.floor(hash(i, s, 82) * 6), r = 1.5 + hash(i, s, 83) * 1.8;
    g.ell(cx, cy, r + 0.8, r * 0.7 + 0.6, (x, y, dx, dy) => (dy < -0.2 && dx < 0.3 ? C.mC : dy > 0.3 ? C.mL : C.mD));
  }
  return g;
}
function groundTex(th, v, PG) { return th === 1 ? sandTex(v, PG) : th === 2 ? rockTex(v) : th === 3 ? moonTex(v) : grassTex(v); }
function walkTex(th) {
  const g = new G(GW, T);
  if (th === 1) { // 나무 데크
    g.each((x, y) => {
      if (y >= T - 2) return y === T - 2 ? C.plankD : C.plankO;
      const row = Math.floor(y / 5), xo = (x + row * 9) % 24;
      if (y % 5 === 4 || xo === 23) return C.plankD;
      if (y % 5 === 0) return C.plankL;
      return hash(x, y, 7) < 0.06 ? C.plankD : C.plank;
    });
    for (let x = 4; x < GW; x += 24) for (const y of [2, 7, 12]) g.set(x + (y % 2) * 3, y, C.plankO);
  } else if (th === 2) { // 현무암 기둥 길 (육각 느낌)
    g.each((x, y) => {
      if (y >= T - 1) return C.basD;
      const row = Math.floor(y / 8), xo = (x + row * 5) % 10, yo = y % 8;
      if (yo === 7 || xo === 9) return hash(x, y, 9) < 0.15 ? C.glowD : C.basD;
      if (yo === 0 || xo === 0) return C.basL;
      return hash(x, y, 8) < 0.05 ? C.basD : C.bas;
    });
  } else if (th === 3) { // 금속 데크
    g.each((x, y) => {
      if (y >= T - 1) return C.deckO;
      const xo = x % 20;
      if (xo === 19 || y === T - 2) return C.deckD;
      if (xo === 0 || y === 0) return C.deckL;
      return C.deck;
    });
    for (let x = 0; x < GW; x += 20) { g.set(x + 2, 2, C.deckO); g.set(x + 17, 2, C.deckO); g.set(x + 2, 12, C.deckO); g.set(x + 17, 12, C.deckO); g.rect(x + 7, 7, 6, 1, C.deckD); }
  } else {
    g.each((x, y) => {
      if (y >= T - 2) return y === T - 2 ? C.curbL : C.curb;
      const row = Math.floor(y / 7); const xo = (x + (row % 2) * 4) % 8;
      if (y % 7 === 6 || xo === 7) return C.paveG;
      return hash(x, y, 5) < 0.07 ? C.paveD : y % 7 === 0 ? C.paveL : C.pave;
    });
  }
  return g;
}
// 탈것 길. top: 'c' = 위가 다른 줄(가장자리), 'd' = 위도 같은 길(점선) / bot 같음
function roadTex(th, top, bot) {
  const g = new G(GW, T);
  if (th === 1) { // 얕은 물길 (보트가 다님)
    g.each((x, y) => { const h = hash(x >> 2, y, 14); return h < 0.1 ? C.shalD : C.shal; });
    for (let k = 0; k < 10; k++) { const x0 = Math.floor(hash(k, 1, 15) * GW), y0 = 4 + Math.floor(hash(k, 2, 15) * 8); for (let i = 0; i < 4; i++) g.set((x0 + i) % GW, y0, C.shalL); }
    if (top === 'c') { g.rect(0, 0, GW, 1, C.sD); for (let x = 0; x < GW; x++) g.set(x, 1, x % 5 < 3 ? C.foam : C.shalL); }
    else for (let x = 0; x < GW; x += 12) { g.set(x + 4, 0, C.white); g.set(x + 5, 0, '#f06a5a'); }  // 부표 줄
    if (bot === 'c') g.rect(0, T - 1, GW, 1, C.shalD);
  } else if (th === 2) { // 광차 길 (좁은 레일 한 쌍)
    g.each((x, y) => { const h = hash(x, y, 16); return h < 0.15 ? C.rD : h > 0.92 ? C.rL : C.r1; });
    for (let x = 1; x < GW; x += 6) { g.rect(x, 4, 3, 9, C.woodO); g.rect(x, 4, 3, 1, C.woodD); }
    for (const y of [5, 11]) { g.rect(0, y, GW, 1, '#a8b0c0'); g.rect(0, y + 1, GW, 1, '#5a6070'); }
    if (top === 'c') { g.rect(0, 0, GW, 1, C.rL); g.rect(0, 1, GW, 1, C.rD); }
    if (bot === 'c') g.rect(0, T - 1, GW, 1, '#1e1a26');
  } else if (th === 3) { // UFO 길 (빛나는 안내선)
    g.each((x, y) => { const h = hash(x, y, 17); return h < 0.06 ? '#4a5270' : x % 16 === 15 ? '#3a4058' : y === 8 ? '#525a7a' : '#454c68'; });
    if (top === 'c') { g.rect(0, 0, GW, 1, C.neon); g.rect(0, 1, GW, 1, C.neonD); }
    else for (let x = 0; x < GW; x += 10) g.rect(x + 3, 0, 4, 1, C.neonP);
    if (bot === 'c') g.rect(0, T - 1, GW, 1, C.neonD);
  } else {
    g.each((x, y) => { const h = hash(x, y, 9); return h < 0.1 ? C.asphD : h > 0.93 ? C.asphL : C.asph; });
    if (top === 'c') { g.rect(0, 0, GW, 1, C.curbL); g.rect(0, 1, GW, 1, C.curb); g.rect(0, 2, GW, 1, C.asphD); }
    else for (let x = 0; x < GW; x += 10) g.rect(x + 3, 0, 5, 1, C.line);
    if (bot === 'c') g.rect(0, T - 1, GW, 1, '#3e4458');
  }
  return g;
}
// 물(·바다·용암·우주) 줄 — 프레임 f (0,1) 로 출렁임
function waterTex(th, f, top, bot) {
  const g = new G(GW, T);
  if (th === 2) { // 용암
    g.each((x, y) => { const h = hash((x + f * 3) >> 2, y >> 1, 18); return h < 0.18 ? C.lavaD : h > 0.86 ? C.lavaL : C.lava; });
    for (let k = 0; k < 10; k++) { const x0 = Math.floor(hash(k, 1, 19) * GW + f * 2 * (k % 2 ? 1 : -1)), y0 = 3 + Math.floor(hash(k, 2, 19) * 10); for (let i = 0; i < 3; i++) g.set((x0 + i + GW) % GW, y0, C.lavaY); g.set((x0 + 1 + GW) % GW, y0 - 1, C.lavaL); }
    if (top) { g.rect(0, 0, GW, 1, C.crust); for (let x = 0; x < GW; x++) g.set(x, 1, hash(x, f, 20) < 0.4 ? C.crust : C.lavaD); }
    if (bot) for (let x = 0; x < GW; x++) g.set(x, T - 1, (x + f * 2) % 7 < 3 ? C.lavaY : C.lavaL);
    return g;
  }
  if (th === 3) { // 별이 흐르는 빈 우주
    g.each((x, y) => (hash(x >> 3, y >> 2, 21) < 0.12 ? C.vdL : C.vd));
    for (let k = 0; k < 16; k++) { const x0 = Math.floor(hash(k, 1, 22) * GW), y0 = 2 + Math.floor(hash(k, 2, 22) * 12); const tw = hash(k, f, 23) < 0.5; g.set(x0, y0, tw ? C.white : C.starD); if (tw && k % 4 === 0) { g.set(x0 - 1, y0, C.starD); g.set(x0 + 1, y0, C.starD); } }
    if (top) for (let x = 0; x < GW; x++) g.set(x, 0, (x + f * 3) % 6 < 3 ? C.neonD : '#1a3060');
    if (bot) for (let x = 0; x < GW; x++) g.set(x, T - 1, (x + f * 3) % 6 < 3 ? C.neonD : '#1a3060');
    return g;
  }
  const [w, wD, wL, bank] = th === 1 ? [C.sea, C.seaD, C.seaL, C.sD] : [C.water, C.waterD, C.waterL, C.bank];
  g.each((x, y) => (hash(x >> 2, y, 4) < 0.08 ? wD : w));
  for (let k = 0; k < 14; k++) {
    const x0 = Math.floor(hash(k, 1, 31) * GW + f * 3 * (k % 2 ? 1 : -1)), y0 = 3 + Math.floor(hash(k, 2, 31) * 10), n = 3 + (k % 3);
    for (let i = 0; i < n; i++) { g.set((x0 + i + GW) % GW, y0, wL); if (i && i < n - 1) g.set((x0 + i + GW) % GW, y0 + 1, wD); }
  }
  if (top) { g.rect(0, 0, GW, 1, bank); g.rect(0, 1, GW, 1, wD); }
  if (bot) for (let x = 0; x < GW; x++) g.set(x, T - 1, (x + f * 2) % 6 < 3 ? C.foam : wL);
  return g;
}
function bridgeTex(th, f, top, bot) {
  const g = waterTex(th, f, top, bot);
  for (let x = 0; x < GW; x++) for (let y = 2; y <= 13; y++) {
    let c;
    if (th === 2) { // 돌다리
      const row = Math.floor((y - 2) / 4), xo = (x + row * 4) % 9;
      c = xo === 8 || (y - 2) % 4 === 3 ? C.basD : (y - 2) % 4 === 0 ? C.basL : C.bas; if (y === 13) c = C.rD;
    } else if (th === 3) { // 금속 다리
      c = x % 8 === 7 ? C.deckD : C.deck; if (y === 2 || y === 13) c = y === 2 ? C.neon : C.neonD; else if (y === 3) c = C.deckL; else if (y === 12) c = C.deckD;
    } else {
      const b = Math.floor(x / 4); c = b % 2 ? (th === 1 ? C.plank : C.wood) : (th === 1 ? C.plankL : '#d4a466');
      if (x % 4 === 3) c = th === 1 ? C.plankD : C.woodD; if (y === 2) c = th === 1 ? C.plankL : C.woodL; if (y >= 12) c = th === 1 ? C.plankD : C.woodD; if (y === 13) c = C.woodO;
    }
    g.set(x, y, c);
  }
  if (th !== 3) for (let x = 2; x < GW; x += 16) { g.rect(x, 1, 2, 2, th === 2 ? C.basD : C.woodO); g.rect(x, 12, 2, 2, th === 2 ? C.basD : C.woodO); }
  return g;
}
function railTex(th) {
  const g = new G(GW, T);
  if (th === 3) { // 유성 길: 빈 우주 + 위아래 경고 줄무늬
    g.each((x, y) => (hash(x >> 2, y >> 2, 24) < 0.1 ? C.vdL : C.vd));
    for (let k = 0; k < 8; k++) g.set(Math.floor(hash(k, 1, 25) * GW), 3 + Math.floor(hash(k, 2, 25) * 10), C.starD);
    for (let x = 0; x < GW; x++) { const c = (x >> 2) % 2 ? C.gold : C.ink; g.set(x, 0, c); g.set(x, T - 1, c); }
    return g;
  }
  const [gr, grL, grD] = th === 1 ? [C.s2, C.sL, C.sD] : th === 2 ? [C.r1, C.rL, C.rD] : [C.grav, C.gravL, C.gravD];
  g.each((x, y) => { const h = hash(x, y, 13); return h < 0.18 ? grD : h > 0.82 ? grL : gr; });
  for (let x = 1; x < GW; x += 8) { g.rect(x, 2, 3, 12, C.sleeper); g.rect(x, 2, 3, 1, C.sleeperL); }
  for (const y of [4, 11]) { g.rect(0, y, GW, 1, th === 2 ? '#e8b090' : C.rail); g.rect(0, y + 1, GW, 1, C.railD); }
  g.rect(0, T - 1, GW, 1, grD);
  return g;
}
// 테마가 바뀌는 줄: 아래는 옛 테마, 위로 갈수록 새 테마 (점묘로 섞음)
function blendTex(a, b) {
  const g = new G(GW, T);
  g.each((x, y) => { const p = (T - 1 - y) / (T - 1); return hash(x >> 1, y, 77) < p * 1.25 - 0.12 ? b.get(x, y) : a.get(x, y); });
  return g;
}

// ═══════════════════════════ 그림: 막힌 칸 물건 (아래 가운데가 발, 그림자는 오른쪽 아래) ═══════════════════════════
function treeArt() {
  const g = new G(16, 26);
  g.ell(9.5, 23, 6.5, 2.2, C.shadow);
  const tr = new G(16, 26); tr.rect(6, 16, 4, 8, C.woodD); tr.rect(6, 16, 1, 8, C.wood); tr.rect(9, 16, 1, 8, C.woodO); tr.outline(C.woodO);
  const cn = new G(16, 26);
  cn.ell(8, 10, 6.6, 7, (x, y, dx, dy) => (dy < -0.35 && dx < 0.2 ? C.leafL : dy > 0.45 || dx > 0.6 ? C.leafD : C.leaf));
  [[5, 6], [6, 5], [4, 7], [9, 4], [10, 5]].forEach(([x, y]) => cn.set(x, y, C.leafH));
  [[10, 12], [6, 13], [11, 9]].forEach(([x, y]) => cn.set(x, y, C.leafD));
  cn.outline(C.leafO);
  return g.over(tr).over(cn);
}
function bushArt() {
  const g = new G(16, 14);
  g.ell(9, 12, 7, 1.8, C.shadow);
  const b = new G(16, 14);
  b.ell(8, 8, 6.6, 4.6, (x, y, dx, dy) => (dy < -0.3 ? C.leafL : dy > 0.4 ? C.leafD : C.leaf));
  [[5, 6, '#f8a0c0'], [10, 5, '#ffffff'], [8, 8, '#f8a0c0']].forEach(([x, y, c]) => b.set(x, y, c));
  b.outline(C.leafO);
  return g.over(b);
}
function benchArt() {
  const g = new G(16, 14);
  g.ell(9, 12, 7, 1.6, C.shadow);
  const b = new G(16, 14);
  b.rect(2, 9, 1, 3, C.ink3); b.rect(13, 9, 1, 3, C.ink3);
  b.rect(1, 1, 14, 2, C.wood); b.rect(1, 1, 14, 1, C.woodL); b.rect(1, 4, 14, 1, C.wood); b.rect(3, 3, 1, 3, C.woodD); b.rect(12, 3, 1, 3, C.woodD);
  b.rect(1, 6, 14, 2, C.woodL); b.rect(1, 8, 14, 1, C.woodD);
  b.outline(C.woodO);
  return g.over(b);
}
function bedArt() {
  const g = new G(16, 14);
  g.ell(9, 12.5, 7.5, 1.4, C.shadow);
  const b = new G(16, 14);
  b.rect(1, 6, 14, 1, '#e88a6c'); b.rect(1, 7, 14, 5, '#c0644a');
  for (let x = 1; x < 15; x++) { if (x % 4 === 0) { b.set(x, 8, '#e0a080'); b.set(x + 2 > 14 ? 14 : x + 2, 10, '#e0a080'); } }
  b.rect(1, 9, 14, 1, '#e0a080'); b.rect(2, 4, 12, 2, '#6a4828');
  [[3, 3], [6, 2], [9, 3], [12, 2]].forEach(([x, y], i) => { b.set(x, y + 1, C.leafD); b.set(x - 1, y + 1, C.leaf); b.set(x, y, ['#ff6a6a', C.gold, '#ffffff', '#f8a0c0'][i]); b.set(x + 1, y, ['#ffb0b0', C.goldL, '#e8e8f0', '#ffd0e0'][i]); });
  b.outline(C.ink);
  return g.over(b);
}
function lampArt() {
  const g = new G(16, 28);
  g.ell(10, 26, 5, 1.4, C.shadow);
  const b = new G(16, 28);
  b.rect(7, 7, 2, 18, C.ink3); b.rect(7, 7, 1, 18, '#7a84a0'); b.rect(6, 23, 4, 2, C.ink2);
  b.rect(5, 1, 6, 6, C.goldL); b.rect(5, 1, 6, 1, C.ink3); b.rect(9, 2, 2, 4, C.gold);
  b.outline(C.ink);
  return g.over(b);
}
function binArt() {
  const g = new G(16, 14);
  g.ell(9, 12.5, 5.5, 1.4, C.shadow);
  const b = new G(16, 14);
  b.rect(4, 1, 8, 2, '#78c890'); b.rect(4, 3, 8, 9, '#3a9a5a'); b.rect(4, 3, 2, 9, '#58b878'); b.rect(10, 3, 2, 9, '#2a7a48'); b.rect(4, 6, 8, 1, '#2a7a48');
  b.rect(7, 1, 2, 1, '#e8f8ee');
  b.outline(C.ink);
  return g.over(b);
}
// 바닷가
function palmArt() {
  const g = new G(16, 30);
  g.ell(10, 27.5, 6, 1.8, C.shadow);
  const t = new G(16, 30);
  for (let y = 10; y < 28; y++) { const x = 7 + Math.round(Math.sin((y - 10) / 7) * 1.5); t.set(x, y, y % 3 === 0 ? C.woodD : C.wood); t.set(x + 1, y, y % 3 === 0 ? C.woodO : C.woodD); t.set(x - 1, y, y % 3 === 0 ? C.wood : C.woodL); }
  t.outline(C.woodO);
  const f = new G(16, 30);
  const frond = (dx, dy, n) => { for (let i = 0; i < n; i++) { const x = 8 + dx * i, y = 9 + dy * i + (i * i) / 6; f.set(x, y, i < 2 ? C.leafL : C.leaf); f.set(x, y + 1, C.leafD); } };
  frond(1, -0.5, 7); frond(-1, -0.5, 7); frond(1, 0.3, 6); frond(-1, 0.3, 6); frond(0.4, -1, 5); frond(-0.4, -1, 5);
  f.ell(8, 9, 2, 1.6, C.leafL);
  f.set(7, 11, '#8a5a30'); f.set(9, 11, '#7a4a20'); f.set(8, 12, '#8a5a30');
  f.outline(C.leafO);
  return g.over(t).over(f);
}
function castleArt() {
  const g = new G(16, 18);
  g.ell(9.5, 15.6, 7, 1.6, C.shadow);
  const b = new G(16, 18);
  b.rect(2, 8, 12, 7, C.s1); b.rect(2, 8, 12, 1, C.sL); b.rect(2, 14, 12, 1, C.sD);
  b.rect(1, 4, 4, 5, C.s2); b.rect(11, 4, 4, 5, C.s2); b.rect(6, 2, 4, 7, C.s1);
  [[1, 3], [3, 3], [11, 3], [13, 3], [6, 1], [8, 1]].forEach(([x, y]) => b.rect(x, y, 1, 1, C.sL));
  b.rect(7, 11, 2, 4, C.sD); b.set(7, 10, C.sD); b.set(8, 10, C.sD);
  b.set(3, 6, C.sD); b.set(12, 6, C.sD);
  b.outline('#8a6a30');
  b.rect(8, 0, 1, 2, C.ink3); b.set(9, 0, C.red); b.set(10, 0, C.red); b.set(9, 1, C.red);
  return g.over(b);
}
function beachRockArt() {
  const g = new G(16, 14);
  g.ell(9, 12, 7, 1.8, C.shadow);
  const b = new G(16, 14);
  b.ell(8, 8, 6.6, 4.8, (x, y, dx, dy) => (dy < -0.4 && dx < 0.3 ? '#c8d0dc' : dy > 0.35 || dx > 0.55 ? '#7a8498' : '#9aa4b8'));
  b.set(5, 6, '#e8eef4'); b.set(6, 5, '#e8eef4'); b.set(10, 9, '#6a7488'); b.set(11, 8, '#6a7488');
  b.outline('#3a4258');
  return g.over(b);
}
function propArt(PG, k, w = 16, h = 18) {
  const p = PG(k); const g = new G(Math.max(w, p.w), h);
  g.ell(g.w / 2 + 1, h - 2.2, Math.min(7, p.w / 2 + 1), 1.6, C.shadow);
  return g.over(p, Math.floor((g.w - p.w) / 2), h - 2 - p.h);
}
function umbrellaArt() {
  const g = new G(16, 26);
  g.ell(10, 23.5, 7, 1.8, C.shadow);
  const b = new G(16, 26);
  b.rect(8, 7, 1, 17, C.ink3);
  b.ell(8, 7, 7.4, 5, (x, y, dx, dy) => (y > 7 ? null : (Math.floor((x + 1) / 3) % 2 ? (dy < -0.5 ? '#ff9a8a' : C.red) : (dy < -0.5 ? C.white : '#f0ece4'))));
  b.rect(1, 7, 15, 1, C.redD); b.set(8, 1, C.gold);
  b.outline(C.ink);
  return g.over(b);
}
function coolerArt() {
  const g = new G(16, 14);
  g.ell(9, 12.5, 7, 1.4, C.shadow);
  const b = new G(16, 14);
  b.rect(2, 4, 12, 8, '#3a8ae0'); b.rect(2, 4, 12, 1, '#8ac0ff'); b.rect(2, 11, 12, 1, '#2a5aa0');
  b.rect(1, 2, 14, 3, C.white); b.rect(1, 4, 14, 1, '#c8d0dc'); b.rect(6, 1, 4, 1, C.ink3);
  b.outline(C.ink);
  return g.over(b);
}
// 화산
function boulderArt() {
  const g = new G(16, 16);
  g.ell(9, 14, 7, 1.8, '#0a081080');
  const b = new G(16, 16);
  b.ell(8, 9, 6.8, 5.8, (x, y, dx, dy) => (dy < -0.4 && dx < 0.2 ? '#9a90b0' : dy > 0.35 || dx > 0.55 ? C.bas : '#76708c'));
  b.set(5, 6, '#c8c0d8'); b.set(6, 5, '#c8c0d8'); b.set(9, 11, C.glowD); b.set(10, 11, C.glow); b.set(11, 10, C.glowD);
  b.outline('#120e18');
  return g.over(b);
}
function ventFrames() {
  return [0, 1].map((f) => {
    const g = new G(16, 24);
    g.ell(9, 22, 7, 1.6, '#0a081080');
    const b = new G(16, 24);
    b.ell(8, 18, 7, 4, (x, y, dx, dy) => (dy < -0.3 ? C.rL : C.r1));
    b.ell(8, 16.5, 3, 1.3, C.glowD); b.set(8, 16, C.ember); b.set(7, 16, C.glow);
    b.outline('#120e18');
    const s = new G(16, 24); // 김
    const puffs = f ? [[8, 12, 2], [7, 8, 1.8], [9, 4, 1.4]] : [[8, 13, 1.8], [9, 9, 2], [8, 5, 1.6]];
    puffs.forEach(([x, y, r], i) => s.ell(x, y, r, r, (px, py, dx, dy) => (dx * dx + dy * dy < 0.3 ? `#ffffff${['b0', '90', '60'][i]}` : `#d8d8e8${['80', '60', '40'][i]}`)));
    return g.over(b).over(s);
  });
}
function spikeArt() {
  const g = new G(16, 22);
  g.ell(9, 20, 6, 1.6, '#0a081080');
  const b = new G(16, 22);
  const spike = (cx, top, w) => { for (let y = top; y < 20; y++) { const hw = Math.round(((y - top) / (20 - top)) * w); for (let x = cx - hw; x <= cx + hw; x++) b.set(x, y, x < cx ? '#6a4a90' : x === cx ? '#9a7ac8' : '#3a2858'); } };
  spike(8, 2, 3); spike(4, 9, 2); spike(12, 8, 2);
  b.set(8, 5, '#d8c0ff'); b.set(4, 12, '#c0a8f0');
  b.outline('#120e18');
  return g.over(b);
}
function deadTreeArt() {
  const g = new G(16, 26);
  g.ell(9.5, 24, 5.5, 1.6, '#0a081080');
  const b = new G(16, 26);
  b.rect(7, 10, 2, 14, '#3a2a28'); b.rect(7, 10, 1, 14, '#5a4440');
  const br = [[8, 12, -1, -1, 5], [8, 15, 1, -1, 5], [8, 10, 0, -1, 6], [5, 9, -1, -1, 3], [11, 12, 1, -1, 3]];
  br.forEach(([x, y, dx, dy, n]) => { for (let i = 0; i < n; i++) b.set(x + dx * i, y + dy * i, '#4a3836'); });
  b.set(6, 20, C.glowD); b.set(8, 17, C.glow);
  b.outline('#120e18');
  return g.over(b);
}
function crystalArt() {
  const g = new G(16, 16);
  g.ell(9, 14, 6, 1.6, '#0a081080');
  const b = new G(16, 16);
  const shard = (cx, top, hw) => { for (let y = top; y < 14; y++) { const w = y < top + 3 ? Math.round((y - top) / 3 * hw) : hw; for (let x = cx - w; x <= cx + w; x++) b.set(x, y, x < cx ? C.lavaL : x === cx ? C.lavaY : C.lavaD); } };
  shard(8, 3, 2); shard(4, 7, 1); shard(12, 6, 1);
  b.rect(2, 13, 12, 2, C.bas);
  b.outline('#3a1008');
  return g.over(b);
}
// 우주
function moonRockArt() {
  const g = new G(16, 14);
  g.ell(9, 12, 7, 1.8, '#10102060');
  const b = new G(16, 14);
  b.ell(8, 8, 6.6, 4.8, (x, y, dx, dy) => (dy < -0.4 && dx < 0.3 ? C.mL : dy > 0.35 || dx > 0.55 ? C.mC : C.mD));
  b.ell(6, 8, 1.4, 1, C.mC); b.set(10, 6, C.mC); b.set(5, 5, C.white);
  b.outline('#2a2c3c');
  return g.over(b);
}
function craterArt() {
  const g = new G(16, 12);
  g.ell(8, 7, 7.4, 4.2, (x, y, dx, dy) => (dy < -0.5 ? C.mC : dy > 0.55 ? C.mL : null));
  g.ell(8, 7.4, 5.6, 3, (x, y, dx, dy) => (dy < 0 ? '#3a3c50' : '#555870'));
  g.set(6, 6, '#2a2c3c'); g.set(9, 8, '#6a6e88');
  return g;
}
function dishArt() {
  const g = new G(16, 24);
  g.ell(9.5, 22, 6, 1.6, '#10102060');
  const b = new G(16, 24);
  b.rect(7, 12, 2, 9, C.deckD); b.set(5, 20, C.deckD); b.set(4, 21, C.deckD); b.set(10, 20, C.deckD); b.set(11, 21, C.deckD);
  b.ell(8, 8, 6.4, 4.4, (x, y, dx, dy) => (dx + dy < -0.4 ? C.white : dy > 0.3 ? C.deckL : '#d0d8e8'));
  b.rect(8, 5, 1, 4, C.ink3); b.set(8, 4, C.red);
  b.outline(C.deckO);
  return g.over(b);
}
function crateArt() {
  const g = new G(16, 14);
  g.ell(9, 12.5, 7, 1.4, '#10102060');
  const b = new G(16, 14);
  b.rect(2, 2, 12, 10, C.deck); b.rect(2, 2, 12, 1, C.deckL); b.rect(2, 11, 12, 1, C.deckD);
  b.rect(2, 6, 12, 1, C.gold); b.rect(7, 2, 2, 10, C.deckD); b.set(4, 4, C.neon); b.set(11, 4, C.neon);
  b.outline(C.deckO);
  return g.over(b);
}
function antennaFrames() {
  return [0, 1].map((f) => {
    const g = new G(16, 28);
    g.ell(9.5, 26, 5, 1.4, '#10102060');
    const b = new G(16, 28);
    b.rect(7, 4, 2, 21, C.deckL); b.rect(8, 4, 1, 21, C.deckD); b.rect(5, 23, 6, 2, C.deck);
    for (let y = 8; y < 22; y += 4) { b.set(6, y, C.deckD); b.set(9, y, C.deckD); }
    b.rect(4, 9, 8, 1, C.deckL);
    b.ell(8, 3, 1.6, 1.6, f ? '#ff6a6a' : '#802838');
    b.outline(C.deckO);
    if (f) { g.set(5, 3, '#ff6a6a80'); g.set(11, 3, '#ff6a6a80'); }
    return g.over(b);
  });
}

// ═══════════════════════════ 그림: 탈것 (오른쪽을 봄 — 왼쪽으로 가면 뒤집음) ═══════════════════════════
const CAR_COL = [['#e05a50', '#ff9a88', '#a83030'], ['#4a7ae0', '#8ab4ff', '#2a4ca0'], ['#50c0a0', '#98ecd0', '#2a8870'], ['#f09a40', '#ffd090', '#b06a18'], ['#9a70d8', '#ccb0ff', '#6040a0'], ['#e8ecf2', '#ffffff', '#a8b0c0']];
function wheel(g, x, y, r) { g.ell(x, y, r, r, C.tire); g.set(x, y, C.hub); }
function carArt([c, cl, cd]) {
  const g = new G(24, 17);
  g.ell(12.5, 15.2, 11, 1.6, C.shadow);
  const b = new G(24, 17);
  b.rect(1, 6, 22, 6, c); b.rect(1, 6, 22, 1, cl); b.rect(1, 11, 22, 1, cd);
  b.rect(6, 1, 11, 1, cl); b.rect(5, 2, 13, 4, C.glass); b.rect(5, 2, 13, 1, C.glassL); b.rect(11, 2, 1, 4, c); b.rect(5, 2, 1, 4, c); b.rect(17, 2, 1, 4, c);
  b.set(22, 8, C.goldL); b.set(22, 9, C.goldL); b.set(1, 8, C.red); b.set(10, 8, cd); b.set(11, 8, cd);
  b.outline(C.ink);
  wheel(b, 6, 12, 2); wheel(b, 17, 12, 2);
  return g.over(b);
}
function vanArt([c, cl, cd]) {
  const g = new G(36, 19);
  g.ell(18, 17.2, 17, 1.6, C.shadow);
  const b = new G(36, 19);
  b.rect(1, 1, 34, 13, c); b.rect(1, 1, 34, 1, cl); b.rect(1, 13, 34, 1, cd);
  for (let i = 0; i < 4; i++) b.rect(4 + i * 7, 3, 5, 4, C.glass);
  b.rect(30, 3, 4, 5, C.glass); b.rect(30, 3, 4, 1, C.glassL);
  b.rect(1, 9, 34, 1, cd); b.set(34, 11, C.goldL); b.set(1, 11, C.red);
  b.outline(C.ink);
  wheel(b, 8, 14, 2.4); wheel(b, 27, 14, 2.4);
  return g.over(b);
}
function busArt() {
  const g = new G(50, 22);
  g.ell(25, 20.2, 24, 1.7, C.shadow);
  const b = new G(50, 22);
  b.rect(1, 1, 48, 16, '#f8c838'); b.rect(1, 1, 48, 2, '#fde68a'); b.rect(1, 16, 48, 1, '#c89018');
  for (let i = 0; i < 6; i++) { b.rect(3 + i * 7, 5, 5, 5, C.glass); b.rect(3 + i * 7, 5, 5, 1, C.glassL); }
  b.rect(45, 5, 3, 6, C.glass); b.rect(42, 5, 2, 10, '#e0a828');
  b.rect(1, 12, 48, 1, C.ink2); b.rect(1, 13, 48, 1, '#e0a828');
  b.set(48, 14, C.goldL); b.set(48, 15, C.goldL); b.set(1, 14, C.red); b.rect(0, 15, 1, 2, C.ink2); b.rect(49, 15, 1, 2, C.ink2);
  b.outline(C.ink);
  wheel(b, 10, 17, 3); wheel(b, 39, 17, 3);
  return g.over(b);
}
// 바닷가 탈것: 수상 오토바이 · 모터보트 · 여객선
const SEA_COL = [['#f06a5a', '#ffb0a0', '#b03a30'], ['#f8c838', '#fde68a', '#c08818'], ['#58c878', '#a0f0b0', '#2a8848']];
function wake(g, x0, y0, n) { for (let i = 0; i < n; i++) { g.set(x0 - i, y0 + (i % 2), i % 3 ? C.foam : C.white); if (i % 2) g.set(x0 - i, y0 + 2, C.shalL); } }
function jetArt([c, cl, cd]) {
  const g = new G(24, 15);
  g.ell(12, 13, 10, 1.4, C.wshadow); wake(g, 4, 10, 4);
  const b = new G(24, 15);
  b.rect(4, 8, 15, 3, c); b.rect(4, 8, 15, 1, cl); b.rect(5, 11, 13, 1, cd); b.set(19, 8, c); b.set(20, 9, c); b.set(19, 9, c); b.set(19, 10, cd);
  b.rect(8, 6, 6, 2, C.ink2); b.rect(15, 4, 1, 4, C.ink3); b.rect(14, 4, 3, 1, C.ink3);
  b.outline(C.ink);
  return g.over(b);
}
function boatArt([c, cl, cd]) {
  const g = new G(36, 18);
  g.ell(18, 16, 16, 1.6, C.wshadow); wake(g, 3, 12, 3);
  const b = new G(36, 18);
  for (let x = 3; x < 34; x++) { const bot = x > 27 ? 13 - (x - 27) : 13; for (let y = 9; y <= bot; y++) b.set(x, y, y === 9 ? C.white : y === 11 ? c : y > 11 ? cd : '#e8ecf2'); }
  b.rect(12, 4, 12, 5, C.white); b.rect(12, 4, 12, 1, '#c8d0dc'); b.rect(14, 5, 4, 3, C.glass); b.rect(19, 5, 4, 3, C.glass); b.rect(24, 6, 3, 3, C.glass);
  b.rect(16, 1, 1, 3, C.ink3); b.set(17, 1, cl);
  b.outline(C.ink);
  return g.over(b);
}
function ferryArt() {
  const g = new G(50, 22);
  g.ell(25, 20, 24, 1.7, C.wshadow); wake(g, 3, 16, 3);
  const b = new G(50, 22);
  for (let x = 1; x < 49; x++) { const bot = x > 42 ? 18 - (x - 42) : 18; for (let y = 12; y <= bot; y++) b.set(x, y, y === 12 ? C.white : y < 15 ? '#2a4c90' : '#1c3468'); }
  b.rect(5, 5, 34, 7, C.white); b.rect(5, 5, 34, 1, '#dde4ee'); b.rect(10, 1, 20, 4, '#f0f4f8');
  for (let i = 0; i < 7; i++) b.rect(7 + i * 4.5, 7, 3, 3, C.glass);
  for (let i = 0; i < 4; i++) b.rect(12 + i * 4.5, 2, 3, 2, C.glass);
  b.rect(31, 0, 4, 5, C.red); b.rect(31, 0, 4, 1, C.ink2); b.rect(1, 14, 48, 1, C.gold);
  b.outline(C.ink);
  return g.over(b);
}
// 화산 탈것: 광차 · 두 칸 광차 · 작은 광산 기관차
const ORE = [[C.gold, C.goldL, C.goldD], ['#e05a90', '#ff9ac0', '#a02858']];
function cartBody(b, x0, w, [o, oL, oD]) {
  for (let y = 4; y <= 11; y++) { const ins = Math.floor((y - 4) / 3); for (let x = x0 + ins; x < x0 + w - ins; x++) b.set(x, y, y === 4 ? '#8a90a0' : x === x0 + ins || x === x0 + w - ins - 1 ? '#3a3e4a' : '#5a606e'); }
  b.ell(x0 + w / 2 - 0.5, 4, w / 2 - 2, 2.4, (x, y, dx, dy) => (y > 4 ? null : (dx + dy < -0.5 ? oL : (Math.floor(x * 1.7 + y) % 3 ? o : oD))));
  b.rect(x0 + 1, 7, w - 2, 1, '#7a5030');
}
function cartArt(ore) {
  const g = new G(24, 16); g.ell(12, 14.5, 10, 1.4, '#0a081080');
  const b = new G(24, 16); cartBody(b, 2, 20, ore); b.outline('#120e18'); wheel(b, 7, 12, 2); wheel(b, 17, 12, 2);
  return g.over(b);
}
function cart2Art(ore) {
  const g = new G(36, 16); g.ell(18, 14.5, 16, 1.4, '#0a081080');
  const b = new G(36, 16); cartBody(b, 1, 16, ore); cartBody(b, 19, 16, ORE[(ORE.indexOf(ore) + 1) % 2]); b.rect(17, 8, 2, 1, C.ink2); b.outline('#120e18');
  [5, 13, 23, 31].forEach((x) => wheel(b, x, 12, 2));
  return g.over(b);
}
function oreLocoArt() {
  const g = new G(50, 20); g.ell(25, 18.5, 23, 1.6, '#0a081080');
  const b = new G(50, 20);
  cartBody(b, 1, 18, ORE[0]); cartBody(b, 20, 12, ORE[1]);
  b.rect(33, 5, 15, 9, '#3a3e4a'); b.rect(33, 5, 15, 1, '#6a7080'); b.rect(35, 1, 6, 4, '#2a2e38'); b.rect(42, 2, 3, 3, '#2a2e38');
  b.rect(36, 7, 4, 3, C.glow); b.rect(36, 7, 4, 1, C.ember); b.set(47, 10, C.goldL); b.set(47, 11, C.goldL);
  b.rect(19, 9, 2, 1, C.ink2); b.rect(32, 9, 2, 1, C.ink2);
  b.outline('#120e18');
  [5, 14, 24, 37, 44].forEach((x) => wheel(b, x, 15, 2.2));
  g.set(38, 0, '#c8c8d4a0'); g.set(37, 0, '#e8e8f0c0');
  return g.over(b);
}
// 우주 탈것: 작은 비행접시 · 큰 비행접시 · 화물선
const UFO_COL = [['#58e0a0', '#a8ffd0', '#28906a'], ['#ff8ad8', '#ffc8f0', '#b04898'], ['#ffb048', '#ffe0a0', '#b86a18']];
function saucer(b, cx, cy, rx, [c, cl, cd], domes) {
  domes.forEach((dx) => b.ell(cx + dx, cy - 3, Math.max(2.5, rx * 0.36), 3.6, (x, y, ddx, ddy) => (y > cy - 1 ? null : ddx + ddy < -0.6 ? C.glassL : '#8ad8f8')));
  b.ell(cx, cy, rx, 3, (x, y, dx, dy) => (dy < -0.3 ? cl : dy > 0.4 ? cd : c));
  for (let x = Math.ceil(cx - rx + 2); x < cx + rx - 1; x += 3) b.set(x, cy + 1, (x >> 1) % 2 ? C.goldL : C.white);
}
function ufoArt(col) {
  const g = new G(24, 17); g.ell(12, 15.5, 8, 1.2, '#00000050');
  const b = new G(24, 17); saucer(b, 11.5, 9, 10.5, col, [0]); b.outline(C.ink);
  return g.over(b);
}
function ufo2Art(col) {
  const g = new G(36, 18); g.ell(18, 16.5, 13, 1.2, '#00000050');
  const b = new G(36, 18); saucer(b, 17.5, 10, 16.5, col, [-6, 6]); b.outline(C.ink);
  return g.over(b);
}
function cargoArt() {
  const g = new G(50, 20); g.ell(25, 18.5, 22, 1.4, '#00000050');
  const b = new G(50, 20);
  b.rect(3, 7, 40, 7, C.deck); b.rect(3, 7, 40, 1, C.deckL); b.rect(3, 13, 40, 1, C.deckD);
  for (let i = 0; i < 4; i++) { b.rect(5 + i * 9, 4, 7, 3, ['#ff8ad8', C.gold, '#58e0a0', '#ff8ad8'][i]); b.rect(5 + i * 9, 4, 7, 1, C.white); }
  b.ell(44, 10, 5, 4.4, (x, y, dx, dy) => (dx + dy < -0.4 ? C.glassL : '#8ad8f8'));
  b.rect(1, 9, 2, 3, C.neonP); b.set(0, 10, C.neon);
  for (let x = 6; x < 42; x += 6) b.set(x, 10, C.neon);
  b.outline(C.ink);
  return g.over(b);
}
const TRAFFIC = [
  { car: () => CAR_COL.map(carArt), van: () => CAR_COL.map(vanArt), bus: () => [busArt()] },
  { car: () => SEA_COL.map(jetArt), van: () => SEA_COL.map(boatArt), bus: () => [ferryArt()] },
  { car: () => ORE.map(cartArt), van: () => ORE.map(cart2Art), bus: () => [oreLocoArt()] },
  { car: () => UFO_COL.map(ufoArt), van: () => UFO_COL.slice(0, 2).map(ufo2Art), bus: () => [cargoArt()] },
];

// ═══════════════════════════ 그림: 떠다니는 뗏목 (n 칸) ═══════════════════════════
function logArt(n) {
  const w = n * T - 2, g = new G(w, 13);
  g.rect(2, 11, w - 3, 2, C.wshadow);
  const b = new G(w, 13);
  b.rect(1, 1, w - 2, 6, C.wood); b.rect(1, 1, w - 2, 1, C.woodL); b.rect(1, 7, w - 2, 3, C.woodD);
  for (let x = 4; x < w - 4; x += 5) { b.set(x, 3 + (x % 3), C.woodD); b.set(x + 1, 3 + (x % 3), C.woodD); b.set(x + 2, 8, C.woodO); }
  b.ell(2, 5, 1.6, 4, '#e8c090'); b.set(2, 5, C.wood); b.set(2, 3, C.wood);
  b.ell(w - 3, 5, 1.6, 4, (x, y, dx) => (dx > 0 ? '#e8c090' : C.woodL));
  b.outline(C.woodO);
  return g.over(b);
}
const BOARD_COL = [['#f8f0e0', '#f06a5a'], ['#ffd860', '#3a8ae0'], ['#a8ecf0', '#f8a040']];
function boardArt(n, k) {
  const w = n * T - 2, g = new G(w, 13);
  g.rect(3, 10, w - 5, 2, C.wshadow);
  const b = new G(w, 13);
  const [c, s] = BOARD_COL[k % 3];
  b.ell(w / 2 - 0.5, 5, w / 2 - 1, 4.4, (x, y, dx, dy) => (dy < -0.5 ? C.white : dy > 0.5 ? '#c8c0b0' : c));
  b.rect(3, 5, w - 6, 1, s); b.rect(5, 4, w - 10, 1, s);
  b.outline(C.ink);
  return g.over(b);
}
function turtleArt(n) {
  const w = n * T - 2, g = new G(w, 13);
  const b = new G(w, 13);
  for (let i = 0; i < n; i++) {
    const cx = i * T + 7;
    g.ell(cx + 1, 9, 7, 3, C.wshadow);
    b.ell(cx + 6.5, 5.5, 2.2, 1.8, '#68b858'); b.set(cx + 7, 5, C.ink);        // 머리
    [[-4, 2], [3, 2], [-4, 9], [3, 9]].forEach(([dx, y]) => { b.set(cx + dx, y, '#58a848'); b.set(cx + dx + 1, y, '#58a848'); }); // 발
    b.ell(cx, 5.8, 5.6, 4, (x, y, dx, dy) => (dx * dx + dy * dy > 0.7 ? '#6a4a20' : (Math.abs(x - cx) === 2 || y === 5) ? '#7a5a28' : dy < -0.2 ? '#c89a50' : '#a87a38'));
    b.set(cx - 2, 3, '#e8c080'); b.set(cx - 1, 3, '#e8c080');
  }
  b.outline('#2a1c0c');
  return g.over(b);
}
function basaltArt(n) {
  const w = n * T - 2, g = new G(w, 13);
  g.rect(2, 11, w - 3, 2, '#40100890');
  const b = new G(w, 13);
  b.rect(1, 2, w - 2, 8, C.bas); b.rect(1, 2, w - 2, 1, C.basL); b.rect(1, 8, w - 2, 2, C.basD);
  for (let x = 1; x < w - 1; x++) if (x % 7 === 0) { b.set(x, 3, C.basD); b.set(x, 4, C.basD); b.set(x + 1, 6, C.glowD); b.set(x + 2, 6, C.glow); }
  b.set(1, 2, null); b.set(w - 2, 2, null);
  b.outline('#120e18');
  return g.over(b);
}
function asteroidArt(n) {
  const w = n * T - 2, g = new G(w, 13);
  const b = new G(w, 13);
  for (let i = 0; i < n * 2 - 1; i++) {
    const cx = 4 + i * ((w - 8) / Math.max(1, n * 2 - 2)), ry = 4 + (hash(i, n, 90) * 1.4);
    b.ell(cx, 6, 4.6, ry, (x, y, dx, dy) => (dx + dy < -0.7 ? '#c8b8a0' : dy > 0.4 ? '#5a4c40' : '#8a7a68'));
  }
  for (let i = 0; i < n * 2; i++) { const x = 3 + Math.floor(hash(i, n, 91) * (w - 6)); b.ell(x, 5 + (i % 3), 1.2, 0.9, '#5a4c40'); b.set(x - 1, 4 + (i % 3), '#d8c8b0'); }
  b.outline('#1a1410');
  return g.over(b);
}
function raftArt(th, n, alt) { return th === 1 ? (alt ? turtleArt(n) : boardArt(n, n + alt)) : th === 2 ? basaltArt(n) : th === 3 ? asteroidArt(n) : logArt(n); }

// 징검돌 (테마마다: 연잎 · 바다 바위 · 식은 용암섬 · 떠 있는 발판). 프레임 1 = 꽃(장식) 달린 것
function padArt(th, flower, PG) {
  const g = new G(16, 12);
  const b = new G(16, 12);
  if (th === 1) {
    g.ell(8.5, 7.5, 7.4, 4, '#e8faffa0');
    b.ell(8, 6, 6.4, 4.2, (x, y, dx, dy) => (dy < -0.35 && dx < 0.3 ? '#c8d0dc' : dy > 0.4 ? '#6a7488' : '#9aa4b8'));
    b.outline('#3a4258'); if (flower) b.over(PG('star1'), 6, 3);
  } else if (th === 2) {
    g.ell(8.5, 7, 7.6, 4.4, C.lavaY);
    b.ell(8, 6, 6.4, 4, (x, y, dx, dy) => (dy < -0.35 ? C.rL : dy > 0.4 ? C.basD : C.bas));
    b.outline('#120e18'); if (flower) { b.set(7, 4, C.lavaY); b.set(8, 4, C.lavaL); b.set(8, 3, C.lavaY); }
  } else if (th === 3) {
    g.ell(8.5, 9, 6, 2, '#58e8ff60');
    b.ell(8, 5.5, 6.4, 3.4, (x, y, dx, dy) => (dy < -0.3 ? C.deckL : dy > 0.4 ? C.deckD : C.deck));
    b.rect(4, 8, 8, 1, C.neonD); b.outline(C.deckO); b.set(8, 5, flower ? C.neonP : C.neon);
  } else {
    g.ell(8.5, 7, 7, 4, C.wshadow);
    b.ell(8, 6, 6.6, 4.2, (x, y, dx, dy) => (dx > 0.15 && Math.abs(dy) < 0.3 + dx * 0.15 && dy < 0.15 && dy > -0.55 ? null : dy < -0.2 ? C.leafL : dy > 0.5 ? C.leafD : C.leaf));
    b.set(5, 4, C.leafH); b.set(6, 4, C.leafH);
    if (flower) { b.set(6, 5, '#ff9ac8'); b.set(5, 6, '#ff9ac8'); b.set(7, 6, '#ff9ac8'); b.set(6, 7, '#ff9ac8'); b.set(6, 6, C.gold); }
    b.outline('#1e6a2e');
  }
  return g.over(b);
}
// 전철 (n 칸, 앞머리가 오른쪽). th 1 = 해변 열차, 2 = 광산 열차, 3 = 유성 줄기
function trainArt(th, n, PG) {
  const cw = 30, w = n * cw + 6, g = new G(w, 22);
  if (th === 3) { // 유성: 앞(오른쪽)은 불타는 바위, 뒤로 갈수록 가늘어지는 불꼬리
    const b = new G(w, 22);
    for (let x = 0; x < w - 14; x++) {
      const k = x / (w - 14), hh = 1 + k * 6;
      for (let y = Math.round(11 - hh); y <= Math.round(11 + hh); y++) {
        const e = Math.abs(y - 11) / hh;
        if (hash(x, y, 92) > 0.25 + k * 0.75 && e > 0.5) continue;
        b.set(x, y, e < 0.35 && k > 0.4 ? C.lavaY : e < 0.7 ? C.lavaL : C.lava);
      }
    }
    b.over(PG('fire1'), w - 26, 4); b.over(PG('fire2'), Math.round(w * 0.45), 5);
    const r = new G(w, 22); r.over(PG('aster'), w - 16, 5); r.outline('#3a1008');
    b.over(r);
    for (let i = 0; i < 6; i++) b.set(Math.floor(hash(i, n, 93) * (w * 0.6)), 4 + Math.floor(hash(i, n, 94) * 14), C.lavaY);
    return b;
  }
  const [top, topL, body, bodyL, win, stripe, under] = th === 1 ? ['#e8ecf2', '#ffffff', '#f4f6fa', '#ffffff', '#8ad8f8', '#2ab0b8', '#1c7a88']
    : th === 2 ? ['#4a4e5a', '#6a7080', '#3a3e4a', '#5a606e', '#ff9a48', C.glow, '#22242c']
      : ['#d8dce8', '#f0f2f8', '#3a7ad0', '#6aa0f0', '#c8ecff', C.gold, '#24508c'];
  g.rect(2, 20, w - 3, 2, C.shadow);
  const b = new G(w, 22);
  for (let i = 0; i < n; i++) {
    const x0 = i * cw, last = i === n - 1, cwi = last ? cw + 6 : cw - 2;
    b.rect(x0 + 1, 0, cwi - 1, 3, top); b.rect(x0 + 1, 0, cwi - 1, 1, topL);
    b.rect(x0 + 1, 3, cwi - 1, 14, body); b.rect(x0 + 1, 3, cwi - 1, 1, bodyL);
    for (let k = 0; k < 4; k++) b.rect(x0 + 3 + k * 6, 5, 4, 5, win);
    b.rect(x0 + 1, 12, cwi - 1, 1, stripe); b.rect(x0 + 1, 16, cwi - 1, 1, under);
    if (th === 1) b.rect(x0 + 1, 13, cwi - 1, 1, stripe);
    b.rect(x0 + 1, 17, cwi - 1, 2, C.ink2);
    b.set(x0 + 6, 19, C.ink2); b.set(x0 + cwi - 6, 19, C.ink2);
    if (!last) b.rect(x0 + cwi, 7, 2, 7, C.ink3);
    else { for (let y = 0; y < 17; y++) for (let x = x0 + cwi - 4; x <= x0 + cwi; x++) if (x - (x0 + cwi - 4) > (y < 6 ? 6 - y : 0) + 4) b.set(x, y, null); b.rect(x0 + cwi - 4, 5, 3, 4, th === 2 ? '#c8ecff' : win); b.set(x0 + cwi - 1, 13, C.goldL); b.set(x0 + cwi - 1, 14, C.goldL); }
  }
  b.outline(C.ink);
  if (th === 1) for (let i = 0; i < n; i++) { b.rect(i * cw + 12, 0, 1, 1, C.ink3); } // 집전 장치 자리
  return g.over(b);
}
// 건널목 경고등 (프레임 0·1 = 번갈아 깜빡, 2 = 꺼짐). 우주는 둥근 경고 신호등
function signalFrames(th) {
  return [0, 1, 2].map((f) => {
    const g = new G(8, 20);
    if (th === 3) {
      g.rect(3, 7, 2, 12, C.deckL); g.rect(4, 7, 1, 12, C.deckD); g.rect(1, 18, 6, 2, C.deck);
      g.ell(3.5, 4, 3.2, 3.2, (x, y, dx, dy) => (f === 2 ? '#5a2030' : dx < 0 === (f === 0) ? '#ff5050' : '#ffb0a0'));
      g.set(3, 3, f === 2 ? '#7a3040' : C.white);
      return g;
    }
    g.rect(3, 6, 2, 13, C.ink3); g.rect(3, 6, 1, 13, '#8a94b0');
    g.rect(0, 1, 8, 4, C.ink); g.set(1, 2, f === 0 ? '#ff4040' : '#6a2020'); g.set(2, 2, f === 0 ? '#ff9090' : '#6a2020'); g.set(5, 2, f === 1 ? '#ff4040' : '#6a2020'); g.set(6, 2, f === 1 ? '#ff9090' : '#6a2020');
    g.set(1, 3, f === 0 ? '#ff4040' : '#6a2020'); g.set(2, 3, f === 0 ? '#ff4040' : '#6a2020'); g.set(5, 3, f === 1 ? '#ff4040' : '#6a2020'); g.set(6, 3, f === 1 ? '#ff4040' : '#6a2020');
    for (let i = 0; i < 5; i++) { g.set(1 + i, 8 + i, '#ffffff'); g.set(5 - i, 8 + i, '#ffffff'); }
    g.rect(2, 18, 4, 2, C.ink2);
    return g;
  });
}
// 상점 (금색 별 도장)
function starFrames() {
  const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.2 : 5.2; pts.push([5 + Math.cos(a) * r, 5.4 + Math.sin(a) * r]); }
  const inside = (x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  return [0, 1].map((f) => {
    const g = new G(12, 12);
    const s = new G(12, 12); s.each((x, y) => (inside(x - 0.5, y - 0.5) ? (x < 5 && y < 6 ? C.goldL : x > 6 || y > 7 ? C.goldD : C.gold) : null));
    s.outline(C.goldO); g.over(s, 0, 0);
    if (f) { g.set(4, 4, C.white); g.set(3, 5, C.white); }
    return g;
  });
}
function shadowArt() { const g = new G(12, 5); g.ell(6, 2.4, 5.4, 2, C.shadow); return g; }

// ─────────── 지각 괴물 (우리 게임만의 쫓아오는 괴물: 학교 종과 자명종이 뭉친 그림자 덩어리, 빛나는 눈) ───────────
const K = { o: '#07040e', b1: '#1e1634', b2: '#2c2248', b3: '#3c3060', brz: '#5a4420', brzL: '#8a6a30', face: '#bdb498', faceD: '#8a8270', eye: '#ff3a3a', eyeL: '#ffd070', glow: '#7a1830' };
function bellBump(b, cx, top, s) { // 종 모양 혹
  const H = Math.round(11 * s);
  for (let y = 0; y < H; y++) { const k = y / H; const hw = Math.round((k < 0.25 ? 2.2 + k * 6 : k < 0.75 ? 3.7 + (k - 0.25) * 1.5 : 4.5 + (k - 0.75) * 10) * s); for (let x = -hw; x <= hw; x++) b.set(cx + x, top + y, x < -hw * 0.45 ? '#c09040' : x < 0 ? K.brzL : x > hw * 0.6 ? '#3a2a14' : K.brz); }
  b.rect(cx - Math.round(7 * s), top + H, Math.round(14 * s) + 1, 1, '#c09040');
  b.ell(cx, top + H + 1.5, 1.6 * s, 1.4 * s, '#c09040');                      // 추
  b.rect(cx - 1, top - 2, 3, 2, K.brz);                                          // 고리
}
function clockBump(b, cx, cy, r) { // 자명종 혹 (얼굴 + 위에 작은 종 두 개)
  b.ell(cx - r * 0.7, cy - r * 0.95, r * 0.42, r * 0.32, K.brzL); b.ell(cx + r * 0.7, cy - r * 0.95, r * 0.42, r * 0.32, K.brzL);
  b.ell(cx, cy, r, r, (x, y, dx, dy) => (dx * dx + dy * dy > 0.62 ? K.brz : dy < -0.3 && dx < 0 ? K.face : K.faceD));
  b.rect(cx, cy - Math.round(r * 0.6), 1, Math.round(r * 0.6), K.o); b.rect(cx, cy, Math.round(r * 0.5), 1, K.o);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; b.set(cx + Math.round(Math.cos(a) * r * 0.7), cy + Math.round(Math.sin(a) * r * 0.7), K.o); }
}
function chaserFrames() {
  return [0, 1].map((f) => {
    const W = 136, H = 84, b = new G(W, H);
    b.ell(68, 70, 64, 44, (x, y, dx, dy) => (dy < -0.62 ? K.b3 : dy < -0.2 ? K.b2 : K.b1));
    bellBump(b, 26, 22, 1); bellBump(b, 110, 20, 1); bellBump(b, 68, 2, 1.25);
    clockBump(b, 46, 22, 8); clockBump(b, 92, 20, 9);
    for (let i = 0; i < 40; i++) { const x = Math.floor(hash(i, 1, 95) * W), y = 34 + Math.floor(hash(i, 2, 95) * 40); if (b.get(x, y)) b.set(x, y, K.b3); }
    // 눈 (빛나는 테두리)
    const eye = (cx, cy) => {
      b.ell(cx, cy, 8, 6, K.glow);
      if (f) { b.rect(cx - 6, cy, 13, 2, K.eye); b.rect(cx - 4, cy, 9, 1, K.eyeL); }
      else { b.ell(cx, cy, 5.6, 4.2, (x, y, dx, dy) => (dx * dx + dy * dy < 0.25 ? K.eyeL : K.eye)); b.set(cx - 2, cy - 2, C.white); }
    };
    eye(52, 42); eye(84, 42);
    // 이빨 입
    for (let x = 44; x <= 92; x++) { const y0 = 56 + Math.round(Math.sin((x - 44) / 48 * Math.PI) * 4); for (let y = y0; y < y0 + 6; y++) b.set(x, y, K.o); if (x % 6 < 3) { b.set(x, y0, K.face); if (x % 6 === 1) b.set(x, y0 + 1, K.face); } else if (x % 6 === 4) b.set(x, y0 + 5, K.faceD); }
    b.outline(K.o);
    return b;
  });
}
function handArt() {
  const b = new G(22, 40);
  b.rect(7, 12, 8, 28, K.b2); b.rect(7, 12, 2, 28, K.b3);
  b.ell(11, 11, 7, 5, K.b2);
  [[4, 0], [10, -2], [16, 0]].forEach(([x, dy]) => { for (let y = 2 + dy; y < 10; y++) b.set(x + Math.round((y - 2) / 4) * (x < 10 ? 1 : x > 10 ? -1 : 0), y + 2, K.b3); b.set(x, 2 + dy + 1, K.face); });
  b.outline(K.o);
  return b;
}

// 내 포켓몬 줄이기 — 몸 크기에 따라 2:1 / 3:1 / 4:1 (한 칸 16 도트에 맞게). 블록마다 가장 많은 색, 테두리·눈 같은 어두운 점은 남김
function shrinkMon(img, frame) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const x = cv.getContext('2d');
  x.drawImage(img, (frame % 12) * 64, Math.floor(frame / 12) * 64, 64, 64, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data;
  const px = (i, j) => { if (i < 0 || j < 0 || i > 63 || j > 63) return null; const k = (j * 64 + i) * 4; return d[k + 3] > 100 ? [d[k], d[k + 1], d[k + 2]] : null; };
  let x0 = 64, x1 = -1, y0 = 64, y1 = -1;
  for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) if (px(i, j)) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const f = bw <= 36 && bh <= 40 ? 2 : bw <= 54 && bh <= 60 ? 3 : 4;
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const hex = (c) => hex2(c[0], c[1], c[2]);
  let best = null;
  for (let oy = 0; oy < f; oy++) for (let ox = 0; ox < f; ox++) {
    const bx = x0 - ox, by = y0 - oy;
    const w = Math.ceil((x1 - bx + 1) / f), h = Math.ceil((y1 - by + 1) / f);
    const g = new G(w, h); let dark = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const b = []; for (let q = 0; q < f; q++) for (let p = 0; p < f; p++) { const c = px(bx + i * f + p, by + j * f + q); if (c) b.push(c); }
      if (b.length < Math.ceil(f * f / 2)) continue;
      const dk = b.filter((c) => lum(c) < 75).sort((p, q) => lum(p) - lum(q));
      let c;
      if (dk.length >= 2 || (dk.length === 1 && (b.length < f * f || lum(dk[0]) < 45))) { c = dk[0]; dark++; }
      else {
        const cnt = new Map(); b.forEach((q) => { const k = hex(q); cnt.set(k, (cnt.get(k) || 0) + 1); });
        c = null; let n = 0; let cl = 999;
        b.forEach((q) => { const k = hex(q), m = cnt.get(k); if (m > n || (m === n && lum(q) < cl)) { n = m; c = q; cl = lum(q); } });
      }
      g.set(i, j, hex(c));
    }
    if (!best || dark > best.dark) best = { g, dark };
  }
  return best.g;
}

// ═══════════════════════════ 게임 ═══════════════════════════
export default {
  id: 'cross',
  title: '포켓몬 등굣길',
  start(stage, api) {
    let dead = false, game = null, paused = false, endTimer = 0, ended = false;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dev = location.pathname.endsWith('/.dev-mg.html');
    stage.style.touchAction = 'none';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;flex:none;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;border:3px solid #182030;border-radius:6px;overflow:hidden;background:#88d070;image-rendering:pixelated;display:flex;align-items:center;justify-content:center;color:#182030;font:12px Galmuri11,monospace';
    wrap.textContent = '불러오는 중…';
    stage.append(wrap);
    // 정수 배(기기 픽셀 기준)로 키움. wrap 크기 = 캔버스 크기라서 Phaser 쪽 가운데 맞추기는 끔 (flex 가운데와 겹치면 두 번 밀림)
    const fit = () => {
      const box = stage.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
      const k0 = Math.min((box.width - 6) / GW, ((box.height || 9999) - 6) / GH);
      // 기기 픽셀 정수 배가 제일 선명하지만, 그러면 20% 넘게 작아지는 작은 폰(아이폰 SE 등)은 남는 자리를 그대로 씀 (pixelated 라 그래도 또렷)
      const kInt = Math.max(1 / dpr, Math.floor(k0 * dpr) / dpr); const k = kInt >= k0 * 0.8 ? kInt : Math.max(kInt, k0);
      wrap.style.width = `${GW * k}px`; wrap.style.height = `${GH * k}px`;
      sizeCanvas();
    };
    // 캔버스 화면 크기는 직접 맞춤 (Phaser FIT 은 회전 뒤 한 박자 늦은 부모 크기를 써서 캔버스가 넘치거나 작아짐)
    const sizeCanvas = () => {
      const cv = game?.canvas; if (!cv) return;
      cv.style.width = wrap.style.width; cv.style.height = wrap.style.height; cv.style.marginLeft = '0px'; cv.style.marginTop = '0px';
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(stage);

    // 허브가 랭킹 창을 열면 멈춤
    const ptrs = new Map();
    const onPause = () => { paused = true; ptrs.clear(); try { game?.loop.sleep(); } catch { /* not ready */ } };
    const onResume = () => { paused = false; try { game?.loop.wake(); } catch { /* not ready */ } };
    stage.addEventListener('mg-pause', onPause);
    stage.addEventListener('mg-resume', onResume);

    // ─────────── 입력 (손가락마다 따로) ───────────
    // 밀기: 손가락이 SWIPE 만큼 움직이는 순간 바로 그 방향으로 (손 떼기를 안 기다림). 그냥 탭: 손을 뗄 때 앞으로.
    let onDir = null; // 장면이 준비되면 채움
    const dirOf = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    const noTouch = (e) => { if (e.cancelable) e.preventDefault(); };
    const onDown = (e) => {
      e.preventDefault();
      if (paused || dead) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, fired: false });
      try { wrap.setPointerCapture(e.pointerId); } catch { /* */ }
    };
    const onMove = (e) => {
      const p = ptrs.get(e.pointerId); if (!p || p.fired || paused || dead) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (Math.hypot(dx, dy) >= SWIPE) { p.fired = true; onDir?.(dirOf(dx, dy)); }
    };
    const onUp = (e) => {
      e.preventDefault();
      const p = ptrs.get(e.pointerId); if (!p) return;
      ptrs.delete(e.pointerId);
      if (paused || dead || p.fired) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      onDir?.(Math.hypot(dx, dy) >= 12 ? dirOf(dx, dy) : 'up');
    };
    const onCancel = (e) => { ptrs.delete(e.pointerId); };
    const KEYS = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ' ': 'up', Enter: 'up' };
    const onKey = (e) => {
      const dir = KEYS[e.key]; if (!dir || dead) return;
      if (e.target?.closest?.('input,textarea,select')) return;
      e.preventDefault();
      if (paused) return;
      onDir?.(dir, e.repeat); // 누르고 있으면 반복 (줄에 쌓인 입력이 없을 때만 받음)
    };
    const noMenu = (e) => e.preventDefault();
    wrap.addEventListener('pointerdown', onDown);
    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerup', onUp);
    wrap.addEventListener('pointercancel', onCancel);
    wrap.addEventListener('lostpointercapture', onCancel);
    wrap.addEventListener('touchstart', noTouch, { passive: false });
    wrap.addEventListener('touchmove', noTouch, { passive: false });
    wrap.addEventListener('touchend', noTouch, { passive: false });
    wrap.addEventListener('contextmenu', noMenu);
    stage.addEventListener('touchmove', noTouch, { passive: false });
    window.addEventListener('keydown', onKey);

    const fontsReady = (document.fonts?.load ? Promise.all([document.fonts.load('12px Galmuri11'), document.fonts.load('bold 12px Galmuri11')]).catch(() => {}) : Promise.resolve());
    const pDex = Math.max(1, Number(api.partner?.()) || 1);
    Promise.all([loadPhaser(), fontsReady, atlasURL([pDex])]).then(([Phaser, , SHEET]) => {
      const ATLAS_URL = SHEET.url;
      if (dead) return;
      wrap.textContent = '';
      game = new Phaser.Game({
        type: Phaser.AUTO, parent: wrap, width: GW, height: GH,
        pixelArt: true, roundPixels: true, antialias: false, backgroundColor: '#88d070', banner: false,
        audio: { noAudio: true }, input: { keyboard: false, mouse: false, touch: false, gamepad: false }, disableContextMenu: true,
        scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
        callbacks: { postBoot: (g) => { if (dead) g.destroy(true); else if (paused) g.loop.sleep(); } },
        scene: {
          key: 'cross',
          preload() { this.load.spritesheet('mons', ATLAS_URL, { frameWidth: 64, frameHeight: 64 }); this.load.image('props', PROPS_URL); },
          create() { setup(this); }, update(t, d) { tick(d); },
        },
      });
      if (game.canvas) { game.canvas.style.imageRendering = 'pixelated'; game.canvas.style.touchAction = 'none'; }
      game.scale.on('resize', sizeCanvas); sizeCanvas();
    }).catch(() => { if (!dead) wrap.textContent = '게임을 불러오지 못했어요'; });

    // ─────────── 장면 ───────────
    let tick = () => {};
    function setup(sc) {
      // CC0 조각 (못 불러와도 게임은 됨 — 빈 그림)
      const propsG = {};
      try {
        const im = sc.textures.exists('props') ? sc.textures.get('props').getSourceImage() : null;
        if (im && im.width > 1) {
          const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
          const d = cx.getImageData(0, 0, im.width, im.height).data;
          for (const [k, [x, y, w, h]] of Object.entries(PROPS)) { const g = new G(w, h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const q = ((y + j) * im.width + x + i) * 4; if (d[q + 3] > 128) g.set(i, j, hex2(d[q], d[q + 1], d[q + 2])); } propsG[k] = g; }
        }
      } catch { /* 빈 그림으로 */ }
      const PG = (k) => propsG[k] || new G(PROPS[k][2], PROPS[k][3]);

      // 텍스처는 처음 쓸 때 만듦 (테마별로 필요한 것만)
      const NF = {};
      const OBJ = {
        tree: () => [treeArt()], bush: () => [bushArt()], bench: () => [benchArt()], bed: () => [bedArt()], lamp: () => [lampArt()], bin: () => [binArt()],
        palm: () => [palmArt()], castle: () => [castleArt()], rockB: () => [beachRockArt()], bucket: () => [propArt(PG, 'bucketR'), propArt(PG, 'bucketB')],
        umbr: () => [umbrellaArt()], cooler: () => [coolerArt()], pile: () => [propArt(PG, 'pileB', 18), propArt(PG, 'pileR', 18)],
        boulder: () => [boulderArt()], vent: ventFrames, spike: () => [spikeArt()], dtree: () => [deadTreeArt()], crystal: () => [crystalArt()],
        mrock: () => [moonRockArt()], crater: () => [craterArt()], dish: () => [dishArt()], aster: () => [propArt(PG, 'aster', 16, 16)], crate: () => [crateArt()], antenna: antennaFrames,
        star: starFrames, shad: () => [shadowArt()], chaser: chaserFrames, hand: () => [handArt()],
      };
      const ANIM = new Set(['vent', 'antenna']);
      const make = (k) => {
        let m;
        if ((m = /^gr(\d)_(\d)$/.exec(k))) return [groundTex(+m[1], +m[2], PG)];
        if ((m = /^bl(\d)_(\d)$/.exec(k))) return [blendTex(groundTex(+m[1], 0, PG), groundTex(+m[2], 1, PG))];
        if ((m = /^wk(\d)$/.exec(k))) return [walkTex(+m[1])];
        if ((m = /^rd(\d)_(\w)(\w)$/.exec(k))) return [roadTex(+m[1], m[2], m[3])];
        if ((m = /^wt(\d)_(\d)(\d)$/.exec(k))) return [0, 1].map((f) => waterTex(+m[1], f, m[2] === '1', m[3] === '1'));
        if ((m = /^bd(\d)_(\d)(\d)$/.exec(k))) return [0, 1].map((f) => bridgeTex(+m[1], f, m[2] === '1', m[3] === '1'));
        if ((m = /^rl(\d)$/.exec(k))) return [railTex(+m[1])];
        if ((m = /^trf(\d)_(\w+)$/.exec(k))) return TRAFFIC[+m[1]][m[2]]();
        if ((m = /^raft(\d)_(\d)_(\d)$/.exec(k))) return [raftArt(+m[1], +m[2], +m[3])];
        if ((m = /^pad(\d)$/.exec(k))) return [padArt(+m[1], false, PG), padArt(+m[1], true, PG)];
        if ((m = /^train(\d)_(\d)$/.exec(k))) return [trainArt(+m[1], +m[2], PG)];
        if ((m = /^sig(\d)$/.exec(k))) return signalFrames(+m[1]);
        return OBJ[k]();
      };
      const need = (k) => { if (!sc.textures.exists(k)) { const fr = make(k); addSheet(sc, k, fr); NF[k] = fr.length; } return k; };

      // 줄 바닥 키 (위·아래 줄 모양에 따라 가장자리가 달라짐)
      const laneKey = (L) => {
        const up = lane(L.r + 1), dn = lane(L.r - 1), th = L.th || 0;
        const wet = (o) => o && (o.type === 'logs' || o.type === 'pads' || o.type === 'bridge');
        if (L.type === 'grass') return [need(L.blend != null ? `bl${L.blend}_${th}` : `gr${th}_${(L.r & 1) + 2 * ((L.r >> 1) & 1)}`), false];
        if (L.type === 'walk') return [need(`wk${th}`), false];
        if (L.type === 'rail') return [need(`rl${th}`), false];
        if (L.type === 'road') return [need(`rd${th}_${up?.type === 'road' ? 'd' : 'c'}${dn?.type === 'road' ? 'n' : 'c'}`), false];
        const top = +!wet(up), bot = +!wet(dn);
        return [need(`${L.type === 'bridge' ? 'bd' : 'wt'}${th}_${top}${bot}`), true];
      };

      // 내 포켓몬
      const dex = Math.max(1, Number(api.partner?.()) || 1);
      let meG = null;
      try { meG = shrinkMon(sc.textures.get('mons').getSourceImage(), SHEET.frame(dex)); } catch { /* 아래 대체 그림 */ }
      if (!meG) { meG = new G(12, 13); meG.ell(6, 7, 5, 5, '#c47de9'); meG.outline(C.ink); }
      addSheet(sc, 'me', [meG]);
      // 맞는 범위: 몸통 폭(키의 1/4 이상 칠해진 세로줄 수)의 약 70% → 반폭 hw
      let body = 0; { const need2 = Math.max(2, Math.round(meG.h * 0.25)); for (let x = 0; x < meG.w; x++) { let n = 0; for (let y = 0; y < meG.h; y++) if (meG.get(x, y)) n++; if (n >= need2) body++; } }
      const HW = clamp(Math.round((body || meG.w) * 0.36), 3, 6);

      const cam = sc.cameras.main;
      const mon = sc.add.image(0, 0, 'me', 0).setOrigin(0.5, 1);
      const shad = sc.add.image(0, 0, need('shad'), 0);
      const fxG = sc.add.graphics().setDepth(1e5);
      const warnG = sc.add.graphics().setDepth(-9e4);
      // 지각 괴물 (화면에 붙어 있음)
      const chImg = sc.add.image(GW / 2, GH + 10, need('chaser'), 0).setOrigin(0.5, 0).setScrollFactor(0).setDepth(8e5).setVisible(false);
      const hand = sc.add.image(0, 0, need('hand'), 0).setOrigin(0.5, 0).setScrollFactor(0).setDepth(8e5 + 1).setVisible(false);
      const vig = sc.add.graphics().setScrollFactor(0).setDepth(8e5 - 1);

      // 양옆 밖 (어둡게) + HUD
      const edge = sc.add.graphics().setScrollFactor(0).setDepth(9e5);
      edge.fillStyle(0x182030, 0.34); edge.fillRect(0, 0, X0, GH); edge.fillRect(GW - X0, 0, X0, GH);
      edge.fillStyle(0xffffff, 0.22); for (let y = 0; y < GH; y += 4) { edge.fillRect(X0 - 1, y, 1, 2); edge.fillRect(GW - X0, y, 1, 2); }
      const hud = sc.add.graphics().setScrollFactor(0).setDepth(1e6);
      const TXT = (x, y, s, size = 12, bold = true, col = '#ffffff') => sc.add.text(x, y, s, { fontFamily: 'Galmuri11', fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color: col, padding: { top: 2, bottom: 1 } })
        .setScrollFactor(0).setDepth(1e6 + 2).setShadow(1, 1, '#182030', 0, false, true);
      const tScore = TXT(4, 0, '0칸');
      const iStar = sc.add.image(0, 2, need('star'), 0).setOrigin(0).setScrollFactor(0).setDepth(1e6 + 1);
      const tStars = TXT(0, 0, '0', 12, true, '#fff4a8');
      const tTheme = TXT(GW - 4, 0, '학교', 12, false, '#d8f0e0').setOrigin(1, 0);
      const tTitle1 = TXT(GW / 2, 18, '포켓몬').setOrigin(0.5, 0).setScale(2).setColor('#fff4a8');
      const tTitle2 = TXT(GW / 2, 46, '등굣길').setOrigin(0.5, 0).setScale(2).setColor('#fff4a8');
      const tSub = TXT(GW / 2, 80, '종 치기 전에 학교로!', 12, false, '#d8f0e0').setOrigin(0.5, 0);
      const help = ['탭 = 앞으로 한 칸', '밀기 = 좌·우·뒤로', '멈추면 지각 괴물이!', '★ 상점도 모아요']
        .map((s, i) => TXT(GW / 2, 110 + i * 14, s, 12, false, i === 2 ? '#ffb0a0' : i === 3 ? '#fff4a8' : '#ffffff').setOrigin(0.5, 0));
      const tTap = TXT(GW / 2, 250, '탭해서 시작').setOrigin(0.5, 0);
      const tBan = TXT(GW / 2, 30, '').setOrigin(0.5, 0).setScale(2).setColor('#fff4a8').setDepth(1e6 + 3);
      const tBanS = TXT(GW / 2, 58, '', 12, false, '#ffd0c0').setOrigin(0.5, 0).setDepth(1e6 + 3);
      const tOver = TXT(GW / 2, 100, '').setOrigin(0.5, 0).setDepth(1e6 + 3);
      const tOverM = TXT(GW / 2, 118, '').setOrigin(0.5, 0).setScale(2).setColor('#fff4a8').setDepth(1e6 + 3);
      const tOverS = TXT(GW / 2, 146, '', 12, false, '#d8f0e0').setOrigin(0.5, 0).setDepth(1e6 + 3);
      const readyOn = (v) => { [tTitle1, tTitle2, tSub, tTap, ...help].forEach((o) => o.setVisible(v)); [tScore, iStar, tStars, tTheme].forEach((o) => o.setVisible(!v)); };
      readyOn(true);

      // ─────────── 상태 ───────────
      let gen = makeGen();
      const negL = new Map();
      // 출발점 아래 장식 줄 (못 감)
      const lane = (r) => {
        if (r >= 0) { gen.ensure(r + 1); return gen.lanes[r]; }
        const th0 = gen.lanes[0]?.th || 0;
        if (!negL.has(r)) {
          const ks = KINDS[th0].grass.map((k) => k[0]);
          negL.set(r, r === -1 ? { r, type: 'walk', th: th0, obs: [], star: -1 } : { r, type: 'grass', th: th0, obs: [[0, ks[0]], [COLS - 1, ks[1]], [1, ks[2]], [COLS - 2, ks[0]]].filter((_, i) => hash(r, i, 3) < 0.55).map(([c, k]) => ({ c, k })), star: -1 });
        }
        return negL.get(r);
      };
      let mode = 'ready', TT = 0, ms = 0, overT = 0, reason = '', bellTick = 0, danger = 0, banner = null;
      const P = { row: 0, x: colX(4), y: laneCY(0), hop: null, q: [], log: null, face: 1, best: 0, stars: 0, bump: 0, bumpDir: 'up', inAt: 0, lat: [], hopMs: [] };
      let camY = laneCY(0) - PLAYER_SY;
      const parts = [];
      const shown = new Set();
      const score = () => P.best + P.stars;
      const thHere = () => lane(Math.max(0, P.row)).th || 0;

      // ─────────── 움직이는 것 ───────────
      const moveLane = (L, dt) => {
        if (L.objs) for (const o of L.objs) {
          o.x += L.v * dt;
          if (L.v > 0 && o.x >= L.xa + L.span) o.x -= L.span;
          else if (L.v < 0 && o.x < L.xa) o.x += L.span;
        }
        if (L.type === 'rail') {
          const tr = L.tr; L.lt = (L.lt || 0) + dt;
          const s = railAt(tr, L.lt);
          if (s.st === 'pass' && tr.st !== 'pass' && mode === 'play' && Math.abs(L.r - P.row) < 7 && !botOn) api.sfx.ballThrow?.();
          tr.st = s.st; tr.x = s.x;
        }
      };
      const rowsInView = () => [Math.floor(-(camY + GH) / T) - 1, Math.ceil(-camY / T) + 1];
      const world = (dt) => {
        // 카메라: 천천히 저절로 올라가고(1초 뒤부터), 내가 앞서가면 따라감. 아래로는 안 내려감
        if (mode === 'play' && ms > 1000) camY -= creep(P.best) * creepMul * T * dt;
        const goal = P.y - PLAYER_SY;
        if (goal < camY) camY += (goal - camY) * Math.min(1, dt * 8);
        const [r0, r1] = rowsInView();
        gen.ensure(Math.max(r1, P.best) + 30);
        for (let r = Math.max(0, r0); r <= r1; r++) moveLane(lane(r), dt);
      };

      // ─────────── 뛰기 ───────────
      const blocked = (L, c) => (L.type === 'grass' || L.type === 'walk') && ((L.block >> c) & 1);
      // 이 방향으로 뛰면 어디에 떨어지나 (못 가면 null)
      const target = (dir) => {
        const cur = lane(P.row);
        if (dir === 'left' || dir === 'right') {
          const s = dir === 'left' ? -1 : 1;
          if (cur.type === 'logs' && P.log) { const tx = P.x + s * T; return tx < X0 + 4 || tx > GW - X0 - 4 ? null : { row: P.row, x: tx, carry: true }; }
          const c = snapCol(P.x) + s; if (c < 0 || c >= COLS || blocked(cur, c)) return null;
          return { row: P.row, x: colX(c) };
        }
        const row = P.row + (dir === 'up' ? 1 : -1);
        if (row < 0) return null;
        const L = lane(row);
        if (L.type === 'logs') return { row, x: clamp(P.x, X0 + 2, GW - X0 - 2) };
        const c = snapCol(P.x); if (blocked(L, c)) return null;
        return { row, x: colX(c) };
      };
      const doHop = (dir) => {
        const tg = target(dir);
        if (dir === 'left') P.face = -1; else if (dir === 'right') P.face = 1;
        if (!tg) { P.bump = 0.12; P.bumpDir = dir; return false; }
        P.hop = { fx: P.x, fy: P.y, tx: tg.x, ty: laneCY(tg.row), t: 0, from: P.row, to: tg.row, carry: tg.carry ? lane(P.row).v : 0, at: performance.now(), drawn: false };
        P.log = null;
        if (!botOn) api.sfx.blip?.();
        return true;
      };
      const want = (dir, rep = false) => {
        if (mode === 'ready') { if (!rep) begin(); return; }
        if (mode !== 'play') return;
        P.inAt = performance.now();
        if (P.hop || P.q.length) { if (P.q.length < QMAX && !(rep && P.q.length)) P.q.push(dir); return; }
        doHop(dir);
      };
      onDir = want;

      const land = () => {
        const L = lane(P.row);
        if (L.type === 'logs') {
          const o = L.objs.find((q) => P.x >= q.x + 2 && P.x <= q.x + q.w - 2);
          if (!o) { gameOver('water'); return; }
          P.log = o;
        } else if (L.type === 'pads') {
          if (!((L.pads >> snapCol(P.x)) & 1)) { gameOver('water'); return; }
        }
        if (L.star >= 0 && !L.starGot && snapCol(P.x) === L.star && (L.type === 'grass' || L.type === 'walk')) {
          L.starGot = true; P.stars++; if (!botOn) api.sfx.ballPop?.();
          burst(colX(L.star), laneCY(P.row) - 4, 8, 40, [C.gold, C.goldL, C.white]);
          if (L.vis?.star) { L.vis.star.destroy(); L.vis.star = null; }
        }
        if (P.row > P.best) P.best = P.row;
        // 테마 바뀌는 줄에 처음 닿으면 배너
        for (let r = P.row; r > P.row - 3 && r >= 0; r--) { const B = lane(r).banner; if (B && !B.shown) { B.shown = true; banner = { ...B, t: 0 }; if (!botOn) api.sfx.correct?.(); } }
      };

      // 부딪힘 (지금 서 있는 줄 기준)
      const hitBy = (L, x) => {
        if (L.type === 'road') return L.objs.find((o) => o.x + 2 < x + HW && o.x + o.w - 2 > x - HW) ? 'car' : null;
        if (L.type === 'rail' && L.tr.st === 'pass') return L.tr.x + 2 < x + HW && L.tr.x + L.tr.w - 2 > x - HW ? 'train' : null;
        return null;
      };
      const playerStep = (dt) => {
        ms += dt * 1000;
        P.bump = Math.max(0, P.bump - dt);
        if (P.hop) {
          const h = P.hop;
          h.t += dt / HOP;
          if (h.carry) { h.fx += h.carry * dt; h.tx += h.carry * dt; }
          const k = Math.min(1, h.t);
          P.x = h.fx + (h.tx - h.fx) * k; P.y = h.fy + (h.ty - h.fy) * k;
          if (h.t >= 0.5) P.row = h.to;
          if (h.t >= 1) {
            if (dev && P.hopMs.length < 50) P.hopMs.push(Math.round((performance.now() - h.at)));
            P.hop = null; P.x = h.tx; P.y = h.ty; P.row = h.to; land(); if (mode !== 'play') return;
          }
        }
        // 뗏목 타기 (같은 줄 같은 dt 로 움직였으니 그대로 따라감)
        if (!P.hop && P.log) {
          P.x += lane(P.row).v * dt;
          if (P.x < X0 - 2 || P.x > GW - X0 + 2) { gameOver('edge'); return; }
        }
        const why = hitBy(lane(P.row), P.x);
        if (why) { gameOver(why); return; }
        // 지각 괴물: 화면 아래 끝으로 밀려나면 잡힘
        const sy = P.y - camY;
        danger = clamp((sy - WARN_Y) / (CATCH_Y - WARN_Y), 0, 1);
        if (sy > CATCH_Y) { gameOver('chaser'); return; }
        // 쌓인 입력은 착지하자마자 바로 (쉼 없음)
        if (!P.hop && P.q.length) doHop(P.q.shift());
      };

      // ─────────── 효과 · 끝 ───────────
      const burst = (x, y, n, sp = 50, cols = [C.foam, C.white, C.waterL]) => {
        for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (0.4 + Math.random() * 0.8); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 25, life: 0.35 + Math.random() * 0.4, c: cols[i % cols.length] }); }
      };
      const WET = [[C.foam, C.white, C.waterL], [C.foam, C.white, C.seaL], [C.lavaY, C.lavaL, C.lava], [C.white, C.neon, C.starD]];
      const gameOver = (why) => {
        if (mode === 'over') return;
        mode = 'over'; overT = 0; reason = why; P.q = []; danger = 0;
        const fy = P.y + 5, th = thHere();
        if (why === 'car' || why === 'train') { if (!botOn) { api.sfx.hit?.(); setTimeout(() => { if (!dead) api.sfx.faint?.(); }, 250); } burst(P.x, fy - 3, 14, 60, th === 3 && why === 'train' ? [C.lavaY, C.lavaL, C.white] : [C.white, C.goldL, '#c8ccd8']); if (!reduce) cam.shake(140, 0.02); }
        else if (why === 'water' || why === 'edge') { if (!botOn) { api.sfx.statDown?.(); setTimeout(() => { if (!dead) api.sfx.faint?.(); }, 300); } burst(P.x, fy - 2, 18, 55, WET[th]); }
        else if (!botOn) { api.sfx.wrong?.(); setTimeout(() => { if (!dead) api.sfx.fail?.(); }, 450); }
        // 안전장치: 서버 상한(초×12+30)보다 아래로 묶음
        const sc2 = Math.min(score(), Math.floor(ms / 1000 * 11) + 20);
        const msOut = Math.max(1000, Math.round(ms));
        if (botOn) { ended = true; return; }
        endTimer = setTimeout(() => { if (!ended && !dead) { ended = true; api.end(sc2, msOut); } }, why === 'chaser' ? 2000 : 1300);
      };
      const begin = () => {
        if (mode !== 'ready') return;
        mode = 'play'; ms = 0; readyOn(false); if (!botOn) api.sfx.select?.();
      };

      // ─────────── 그리기 ───────────
      const frameOf = (k, i) => (NF[k] > 1 ? i % NF[k] : 0);
      const showLane = (L) => {
        const bot = laneBot(L.r), top = bot - T, th = L.th || 0;
        const [key, anim] = laneKey(L);
        const v = { bg: sc.add.image(0, top, key, 0).setOrigin(0).setDepth(-1e5), anim, items: [], anims: [] };
        (L.obs || []).forEach((o) => {
          const k = need(o.k);
          const im = sc.add.image(colX(o.c), bot - 1, k, frameOf(k, o.c + L.r)).setOrigin(0.5, 1).setDepth(o.k === 'crater' ? bot - 15 : bot - 2);
          v.items.push(im); if (ANIM.has(o.k)) v.anims.push([im, o.c * 0.37 + L.r * 0.11]);
        });
        if (L.type === 'pads') { const k = need(`pad${th}`); bitsOf(L.pads).forEach((c) => v.items.push(sc.add.image(colX(c), bot - 8, k, c === L.flower ? 1 : 0).setDepth(bot - 3))); }
        if (L.objs) L.objs.forEach((o) => {
          const isLog = L.type === 'logs';
          const k = need(isLog ? `raft${th}_${o.n}_${th === 1 ? o.alt : 0}` : `trf${th}_${o.kind}`);
          o.img = sc.add.image(0, isLog ? bot - 1 : bot, k, isLog ? 0 : frameOf(k, o.col)).setOrigin(0, 1).setDepth(isLog ? bot - 3 : bot - 0.5).setFlipX(L.v < 0);
          v.items.push(o.img);
        });
        if (L.type === 'rail') {
          v.train = sc.add.image(0, bot + 1, need(`train${th}_${L.tr.cars}`), 0).setOrigin(0, 1).setDepth(bot - 0.5).setFlipX(L.tr.dir < 0).setVisible(false);
          const sk = need(`sig${th}`);
          v.sig = [sc.add.image(0, bot - 1, sk, 2).setOrigin(0, 1).setDepth(bot - 1), sc.add.image(GW - 8, bot - 1, sk, 2).setOrigin(0, 1).setDepth(bot - 1)];
          v.items.push(v.train, ...v.sig);
        }
        if (L.star >= 0 && !L.starGot) { v.star = sc.add.image(colX(L.star), bot - 8, need('star'), 0).setDepth(bot - 2); v.items.push(v.star); }
        L.vis = v; shown.add(L);
      };
      const hideLane = (L) => { L.vis.bg.destroy(); L.vis.items.forEach((o) => o.active && o.destroy()); if (L.objs) L.objs.forEach((o) => { o.img = null; }); L.vis = null; shown.delete(L); };

      const draw = (dt) => {
        const shake = !reduce && mode === 'play' && danger > 0.5 ? Math.round(Math.sin(TT * 47) * (danger > 0.8 ? 1 : 0.6)) : 0;
        cam.setScroll(shake, Math.round(camY));
        const [r0, r1] = rowsInView();
        for (const L of [...shown]) if (L.r < r0 - 1 || L.r > r1 + 1) hideLane(L);
        warnG.clear();
        let ding = false;
        for (let r = r0; r <= r1; r++) {
          const L = lane(r); if (!L.vis) showLane(L);
          const v = L.vis;
          if (v.anim) v.bg.setFrame(Math.floor(TT / 0.45 + (r & 1)) % 2);
          v.anims.forEach(([im, ph]) => im.setFrame(Math.floor(TT * 2.5 + ph) % 2));
          if (L.objs) L.objs.forEach((o) => o.img?.setX(Math.round(o.x)));
          if (L.type === 'pads') v.items.forEach((im, i) => im.setY(laneBot(r) - 8 + (Math.floor(TT * 1.5 + i * 0.7) % 2)));
          if (v.star) v.star.setFrame(Math.floor(TT * 3 + r) % 4 === 0 ? 1 : 0).setY(laneBot(r) - 8 + Math.round(Math.sin(TT * 4 + r)));
          if (L.type === 'rail') {
            const tr = L.tr, on = tr.st === 'warn' || tr.st === 'pass';
            const fl = Math.floor(TT * 4) % 2;
            v.sig.forEach((s) => s.setFrame(on ? fl : 2));
            v.train.setVisible(tr.st === 'pass').setX(Math.round(tr.x || 0));
            if (tr.st === 'warn' && fl) { warnG.fillStyle(0xff4040, 0.2); warnG.fillRect(0, laneBot(r) - T, GW, T); }
            if (tr.st === 'warn' && Math.abs(r - P.row) <= 3) ding = true;
          }
        }
        // 건널목 종소리
        if (ding && mode !== 'over') { bellTick -= dt; if (bellTick <= 0) { bellTick = 0.3; api.sfx.evoTick?.(); } } else if (danger <= 0) bellTick = 0;
        // 내 포켓몬
        const h = P.hop, arc = h ? Math.round(Math.sin(Math.PI * Math.min(1, h.t)) * 4) : 0;
        if (h && !h.drawn) { h.drawn = true; if (dev && P.inAt && P.lat.length < 50) { P.lat.push(Math.round(performance.now() - P.inAt)); P.inAt = 0; } }
        const bx = P.bump > 0 ? Math.round(Math.sin((P.bump / 0.12) * Math.PI) * 2) : 0;
        const ox = P.bumpDir === 'left' ? -bx : P.bumpDir === 'right' ? bx : 0, oy = P.bumpDir === 'up' ? -bx : P.bumpDir === 'down' ? bx : 0;
        let foot = Math.round(P.y + 5);
        const dep = P.y + T / 2 - 1.5 + (mode === 'over' && (reason === 'car' || reason === 'train') ? 1.2 : 0); // 치이면 납작해진 모습이 차 위로 보이게
        let sink = 0;
        mon.setScale(1).setCrop().setAngle(0).setVisible(true).setDepth(dep).clearTint();
        // 지각 괴물: 경고 때는 아래에서 살짝 엿보고, 잡을 때는 올라와서 손으로 끌고 감
        const chase = mode === 'over' && reason === 'chaser';
        let rise = 0;
        if (chase) {
          const t = overT;
          rise = t < 0.3 ? 28 + (t / 0.3) * 50 : t < 1.2 ? 78 : Math.max(0, 78 - (t - 1.2) * 160);
          const sy = P.y - camY + 5;
          const hx = clamp(Math.round(P.x), 18, GW - 18);
          let hy = GH;
          if (t >= 0.25 && t < 0.5) hy = GH - 30 + ((sy - 12) - (GH - 30)) * ((t - 0.25) / 0.25);
          else if (t >= 0.5) hy = sy - 12 + Math.min(1, (t - 0.5) / 0.5) * 70;
          hand.setVisible(t >= 0.25).setPosition(hx, Math.round(hy));
          if (t >= 0.5) foot += Math.round(Math.min(1, (t - 0.5) / 0.5) * 70);
          chImg.setVisible(true).setFrame(Math.floor(t * 6) % 5 === 0 ? 1 : 0).setPosition(GW / 2 + (reduce ? 0 : Math.round(Math.sin(t * 40) * (t < 0.5 ? 2 : 0))), GH - Math.round(rise));
        } else {
          hand.setVisible(false);
          rise = mode === 'play' && danger > 0 ? 8 + danger * 40 + Math.sin(TT * 5) * 2 : 0;
          chImg.setVisible(rise > 0).setFrame(Math.floor(TT * 1.3) % 6 === 0 ? 1 : 0).setPosition(GW / 2, GH - Math.round(rise));
        }
        if (mode === 'over') {
          if (reason === 'car' || reason === 'train') mon.setScale(1.4, 0.35);
          else if (reason === 'water' || reason === 'edge') { sink = Math.min(meG.h, Math.floor(overT * 26)); mon.setCrop(0, 0, meG.w, meG.h - sink); }
        }
        // 잡힌 뒤에는 손(화면 좌표)과 같은 x 로 끌려 내려감 (카메라는 멈춰 있으니 월드 y 로 그대로 내려도 같음)
        if (chase) mon.setDepth(8e5 + 0.5); // 잡힐 때는 괴물 앞에 보이게 (손이 그 위를 덮음)
        if (chase && overT >= 0.5) mon.setPosition(clamp(Math.round(P.x), 18, GW - 18), foot);
        else mon.setPosition(Math.round(P.x) + ox, foot - arc + oy + sink);
        mon.setFlipX(P.face > 0);
        shad.setPosition(Math.round(P.x), Math.round(P.y + 5)).setDepth(dep - 0.2).setVisible(mode !== 'over' || (reason === 'chaser' && overT < 0.5));
        // 빨간 테두리 경고
        vig.clear();
        const vk = mode === 'play' ? danger : chase ? Math.max(0, 1 - overT) : 0;
        if (vk > 0) {
          const a = (0.25 + 0.4 * vk) * (reduce ? 1 : 0.75 + 0.25 * Math.sin(TT * 12));
          for (let i = 0; i < 6; i++) { const al = a * (1 - i / 6); vig.fillStyle(0xd02030, al); vig.fillRect(i * 2, 0, 2, GH); vig.fillRect(GW - (i + 1) * 2, 0, 2, GH); vig.fillRect(0, GH - (i + 1) * 3, GW, 3); }
        }
        if (mode === 'play' && danger > 0) { bellTick -= dt; if (bellTick <= 0) { bellTick = 0.5 - 0.3 * danger; if (!botOn) api.sfx.evoTick?.(); } }
        // 튀는 것
        fxG.clear();
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt;
          fxG.fillStyle(hexN(p.c), 1); fxG.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
        }
        drawHud(dt);
      };

      const DEATH = {
        car: ['차에 부딪혔다!', '보트에 부딪혔다!', '광차에 부딪혔다!', 'UFO에 부딪혔다!'],
        train: ['전철에 부딪혔다!', '열차에 부딪혔다!', '광산 열차에 쾅!', '유성에 맞았다!'],
        water: ['풍덩! 물에 빠졌다', '풍덩! 바다에 빠졌다', '앗 뜨거! 용암이다', '우주로 떨어졌다'],
        edge: ['물살에 떠내려갔다', '파도에 밀려갔다', '용암에 떠내려갔다', '우주로 흘러갔다'],
      };
      const drawHud = (dt) => {
        hud.clear();
        if (mode !== 'ready') {
          hud.fillStyle(0x182030, 0.66); hud.fillRect(0, 0, GW, 16);
          hud.fillStyle(0x4a6098, 1); hud.fillRect(0, 16, GW, 1);
          tScore.setText(`${P.best}칸`);
          iStar.setX(Math.round(tScore.x + tScore.width + 6));
          tStars.setText(`${P.stars}`).setX(iStar.x + 13);
          const loop = Math.floor(P.best / (THEME_LEN * 4));
          tTheme.setText(`${TH_NAME[thHere()]}${loop ? `·${loop + 1}` : ''}`);
        } else {
          hud.fillStyle(0x182030, 0.62); hud.fillRoundedRect(10, 12, GW - 20, 88, 6);
          hud.fillStyle(0x182030, 0.62); hud.fillRoundedRect(10, 104, GW - 20, 62, 6);
          tTap.setVisible(reduce || Math.floor(TT * 2) % 2 === 0);
          if (tTap.visible) { hud.fillStyle(0x182030, 0.62); hud.fillRoundedRect(GW / 2 - 44, 247, 88, 20, 5); }
        }
        // 테마 배너 "→ 바닷가"
        if (banner && mode === 'play') {
          banner.t += dt;
          const t = banner.t, k = t < 0.2 ? t / 0.2 : t > 1.8 ? Math.max(0, 1 - (t - 1.8) / 0.3) : 1;
          if (t > 2.1) banner = null;
          else {
            const y = 26 + Math.round((1 - k) * -12);
            hud.fillStyle(0x182030, 0.78 * k); hud.fillRoundedRect(14, y, GW - 28, banner.loop ? 50 : 34, 6);
            tBan.setText(`→ ${TH_NAME[banner.th]}`).setPosition(GW / 2, y + 2).setAlpha(k).setVisible(true);
            tBanS.setText(banner.loop ? `${banner.loop + 1}바퀴 · 더 빨라져요` : '').setPosition(GW / 2, y + 32).setAlpha(k).setVisible(!!banner.loop);
          }
        }
        if (!banner || mode !== 'play') { tBan.setVisible(false); tBanS.setVisible(false); }
        if (mode === 'over' && overT > (reason === 'chaser' ? 0.9 : 0.35)) {
          hud.fillStyle(0x182030, 0.82); hud.fillRoundedRect(6, 94, GW - 12, 72, 8);
          hud.lineStyle(1, 0xffffff, 0.7); hud.strokeRoundedRect(6, 94, GW - 12, 72, 8);
          const th = thHere();
          const msg = reason === 'chaser' ? '지각 괴물에게 잡혔다!' : DEATH[reason][th];
          tOver.setText(msg).setVisible(true).setColor(reason === 'chaser' ? '#ffb0a0' : reason === 'water' || reason === 'edge' ? (th === 2 ? '#ffc890' : '#bfe6f8') : '#ffffff');
          tOverM.setText(`${score()}칸`).setVisible(true);
          tOverS.setText(P.stars ? `${P.best}칸 + 상점 ${P.stars}` : `${P.best}칸 왔어요`).setVisible(true);
        } else { tOver.setVisible(false); tOverM.setVisible(false); tOverS.setVisible(false); }
      };

      tick = (deltaMs) => {
        if (dead) return;
        const dt = Math.min(deltaMs, 100) / 1000; TT += dt;
        const n = Math.max(1, Math.ceil(dt / SUB - 1e-6));
        for (let i = 0; i < n; i++) {
          const s = dt / n;
          world(s);
          if (mode === 'play') playerStep(s);
          else if (mode === 'over') overT += s;
        }
        draw(dt);
      };

      // ─────────── 시험용 (개발 페이지에서만) ───────────
      let botOn = false, creepMul = 1; // creepMul: 시험용 (개발 페이지 봇만 바꿈)
      if (dev) stage.crossDebug = () => ({ mode, row: P.row, best: P.best, stars: P.stars, ms: Math.round(ms), reason, x: Math.round(P.x), log: !!P.log, hop: !!P.hop, q: P.q.length, hw: HW, me: [meG.w, meG.h], lane: lane(P.row).type, th: thHere(),
        sy: Math.round(P.y - camY), danger: +danger.toFixed(2), lat: P.lat.slice(), hopMs: P.hopMs.slice(), creep: +creep(P.best).toFixed(2),
        texts: [tScore, tStars, tTheme, tTitle1, tTitle2, tSub, tTap, tBan, tBanS, tOver, tOverM, tOverS, ...help].filter((t) => t.visible && t.text).map((t) => { const r = t.getBounds(); return { s: t.text, x0: Math.round(r.x), x1: Math.round(r.right), y0: Math.round(r.y), y1: Math.round(r.bottom), lines: t.getWrappedText ? t.getWrappedText().length : 1 }; }) });
      if (dev) {
        // 시작 전에만: 줄 다시 만들기 (seed, flat = 장애물 없는 땅만, script = 출발 뒤 줄 순서 고정, th = 테마 고정)
        stage.crossCheat = (o = {}) => {
          if (mode !== 'ready') return false;
          [...shown].forEach(hideLane); negL.clear();
          gen = makeGen(o.seed != null ? rng(o.seed) : Math.random, o);
          return true;
        };
        stage.crossLanes = (a, b) => { const out = []; for (let r = a; r <= b; r++) { const L = lane(r); out.push({ r, type: L.type, th: L.th, v: L.v, tier: L.tier, block: L.block, pads: L.pads, banner: !!L.banner, tr: L.tr && { st: L.tr.st }, objs: L.objs && L.objs.map((q) => [Math.round(q.x), q.w]) }); } return out; };
        stage.crossTp = (row, x) => { P.row = row; P.best = Math.max(P.best, row); P.y = laneCY(row); P.x = x ?? colX(4); P.log = null; P.hop = null; camY = P.y - PLAYER_SY; };
        stage.crossFreeze = (v) => { botOn = !!v; }; // 소리 끔 (스크린숏용)
        // 봇: 앞을 내다보고 안전하면 앞으로, 아니면 기다리거나 옆으로. 화면 없이 빨리 감음 (실제 game step 그대로 씀)
        // react = 반응 늦음(초), idleAt = 이 줄에 닿으면 그 뒤로 가만히 있음 (지각 괴물 시험)
        stage.crossBot = ({ maxT = 600, react = 0, idleAt = -1, jitter = 0, seed = 1, trace = false, cmul = 1 } = {}) => {
          creepMul = cmul;
          const tr0 = [];
          botOn = true;
          if (mode === 'ready') begin();
          const rr = rng(seed);
          const dt = SUB; let t = 0, hops = 0, idleT = -1, idleRow = -1;
          const fx = (L, o, s) => wrapX(L, o.x + L.v * s);
          const roadOk = (L, x, s0, s1) => { for (let s = s0; s <= s1; s += 0.02) if (L.objs.some((o) => { const ox = fx(L, o, s); return ox + 2 - 3 < x + HW && ox + o.w - 2 + 3 > x - HW; })) return false; return true; };
          const trainOk = (L, s0, s1) => { for (let s = s0; s <= s1 + 0.15; s += 0.05) if (railAt(L.tr, (L.lt || 0) + s).st === 'pass') return false; return true; };
          const safe = (row, x, s0, hold) => {
            const L = lane(row);
            if (L.type === 'road') return roadOk(L, x, s0, s0 + hold);
            if (L.type === 'rail') return trainOk(L, s0, s0 + hold);
            if (L.type === 'logs') { const o = L.objs.find((q) => { const ox = fx(L, q, s0); return x >= ox + 4 && x <= ox + q.w - 4; }); if (!o) return false; const xe = x + L.v * hold; return xe > X0 + 6 && xe < GW - X0 - 6; }
            if (L.type === 'pads') return !!((L.pads >> snapCol(x)) & 1);
            return true;
          };
          const think = () => {
            const lag = react;
            const here = safe(P.row, P.x, 0, HOP + lag + 0.15);
            const opts = ['up', 'left', 'right', 'down'].map((d) => ({ d, tg: target(d) })).filter((o) => o.tg);
            const riding = lane(P.row).type === 'logs' && P.log ? lane(P.row).v : 0; // 뗏목 위면 기다리는 동안 x 가 밀림
            const ok = (o) => safe(o.tg.row, o.tg.x + riding * (lag + (o.tg.carry ? HOP : 0)), HOP + lag, 0.12 + lag) && safe(P.row, P.x, 0, HOP * 0.5 + lag);
            const up = opts.find((o) => o.d === 'up');
            if (up && ok(up)) return 'up';
            const side = opts.filter((o) => (o.d === 'left' || o.d === 'right') && ok(o));
            const nx = lane(P.row + 1); const c = snapCol(P.x);
            // 이 줄에서 옆으로 걸어갈 수 있는 칸 중, 바로 위가 열린 가장 가까운 칸
            const cur = lane(P.row); let a0 = c, a1 = c;
            if (cur.type === 'grass' || cur.type === 'walk') { while (a0 > 0 && !blocked(cur, a0 - 1)) a0--; while (a1 < COLS - 1 && !blocked(cur, a1 + 1)) a1++; }
            else if (cur.type === 'pads') { while (a0 > 0 && ((cur.pads >> (a0 - 1)) & 1)) a0--; while (a1 < COLS - 1 && ((cur.pads >> (a1 + 1)) & 1)) a1++; }
            else if (cur.type !== 'logs') { a0 = 0; a1 = COLS - 1; }
            const openAbove = (k) => ((nx.type === 'grass' || nx.type === 'walk') ? !blocked(nx, k) : nx.type === 'pads' ? !!((nx.pads >> k) & 1) : true);
            // 위가 뗏목 줄이면: 그 칸에 뗏목이 오기까지 기다릴 시간 + 걸어가는 시간이 가장 짧은 칸 (물살 끝 쪽 두 칸은 피함)
            const logWait = (k) => {
              const x = colX(k), go = Math.abs(k - c) * (HOP + react) + HOP;
              if (nx.type === 'road') { for (let s = 0; s < 6; s += 0.05) if (roadOk(nx, x, s + go, s + go + 0.12 + react)) return s; return 99; }
              if (nx.type !== 'logs') return 0;
              if ((nx.v > 0 && k > 5) || (nx.v < 0 && k < 3)) return 99;
              for (let s = 0; s < 6; s += 0.05) if (nx.objs.some((o) => { const ox = fx(nx, o, s + go); return x >= ox + 4 && x <= ox + o.w - 4; })) return s; return 99;
            };
            let goal = c; { let bd = 1e9; for (let k = a0; k <= a1; k++) if (openAbove(k)) { const cost = Math.abs(k - c) * (HOP + react + 0.05) + logWait(k); if (cost < bd) { bd = cost; goal = k; } } }
            const pref = goal < c ? 'left' : goal > c ? 'right' : null;
            if (here && (!pref || !side.some((o) => o.d === pref))) {
              // 뗏목이 끝으로 가고 있으면 반대쪽으로 걸어 둠
              const L = lane(P.row);
              if (L.type === 'logs' && P.log) { const toward = L.v > 0 ? 'left' : 'right'; const s = side.find((o) => o.d === toward); const edgeSoon = L.v > 0 ? P.x > GW - X0 - 40 : P.x < X0 + 40; if (s && edgeSoon) return s.d; }
              return null;
            }
            if (side.length) return (side.find((o) => o.d === pref) || side[0]).d;
            if (here) return null;
            const dn = opts.find((o) => o.d === 'down' && ok(o));
            return dn ? 'down' : 'up';
          };
          let pend = null;
          while (mode === 'play' && t < maxT) {
            if (idleAt >= 0 && P.best >= idleAt && !P.hop) { if (idleT < 0) { idleT = t; idleRow = P.row; } }
            else if (!P.hop && !P.q.length && !pend) { const d = think(); if (d) pend = { d, at: t + react + (jitter ? rr() * jitter : 0) }; }
            if (pend && t >= pend.at) { if (!P.hop && doHop(pend.d)) hops++; pend = null; }
            world(dt); playerStep(dt); t += dt;
            if (trace && Math.round(t / dt) % 30 === 0) tr0.push([+t.toFixed(1), P.row, Math.round(P.x), lane(P.row).type[0], Math.round(P.y - camY)]);
          }
          botOn = false;
          return { best: P.best, stars: P.stars, score: score(), t: +t.toFixed(1), reason, hops, rate: +(P.best / Math.max(1, t)).toFixed(2), th: thHere(), idleFor: idleT >= 0 ? +(t - idleT).toFixed(2) : null, idleRow, trace: trace ? tr0 : undefined };
        };
      }
    }

    return () => {
      dead = true; ended = true;
      clearTimeout(endTimer);
      ro.disconnect();
      wrap.removeEventListener('pointerdown', onDown);
      wrap.removeEventListener('pointermove', onMove);
      wrap.removeEventListener('pointerup', onUp);
      wrap.removeEventListener('pointercancel', onCancel);
      wrap.removeEventListener('lostpointercapture', onCancel);
      wrap.removeEventListener('touchstart', noTouch);
      wrap.removeEventListener('touchmove', noTouch);
      wrap.removeEventListener('touchend', noTouch);
      wrap.removeEventListener('contextmenu', noMenu);
      stage.removeEventListener('touchmove', noTouch);
      stage.removeEventListener('mg-pause', onPause);
      stage.removeEventListener('mg-resume', onResume);
      window.removeEventListener('keydown', onKey);
      onDir = null; tick = () => {};
      delete stage.crossDebug; delete stage.crossCheat; delete stage.crossBot; delete stage.crossLanes; delete stage.crossTp; delete stage.crossFreeze;
      if (game) { try { game.loop.wake(); } catch { /* */ } game.destroy(true); game = null; }
      wrap.remove();
    };
  },
};
