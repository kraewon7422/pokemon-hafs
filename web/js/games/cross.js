// 몬스터 등굣길: 내 몬스터가 한 칸씩 뛰어 학교 가는 길을 끝없이 올라간다. 잔디(나무·벤치·화단), 찻길(자동차·노란 통학버스),
// 개울(떠내려가는 통나무·연잎 징검다리), 기찻길(경고등·종소리 뒤 빠른 전철), 보도·다리(쉬는 줄)가 덩어리로 섞여 나온다.
// 멈춰 있거나 뒤로 가면 '지각 게이지'가 차고, 다 차거나 4줄 넘게 뒤로 가면 종이 울려 끝("지각!").
// 점수 = 가장 멀리 간 줄(칸) + 주운 상점(★). (Phaser 3. 그림은 전부 이 파일에서 도트로 그림 — 바깥 그림 파일 없음)
// 서버 상한: 점수 ≤ 초×6+30 → 한 번 뛰기 0.14초 + 착지 쉼 0.11초 = 최대 초당 4줄. 끝낼 때 초×5+20 으로 한 번 더 묶음.
// 멈춤(mg-pause)·숨긴 탭 시간은 ms 에 안 들어감 (게임 틱마다 dt 를 더함).
import { loadPhaser } from './common.js';

const GW = 160, GH = 288;      // 논리 해상도 (정수 배로 키움)
const T = 16;                  // 한 칸 = 16 도트
const COLS = 9, X0 = 8;        // 놀 수 있는 칸 9개 (양옆 8 도트는 밖)
const ALL = (1 << COLS) - 1;
const HOP = 0.14, REST = 0.11; // 한 번 뛰기 + 착지 쉼 = 0.25초 → 최대 초당 4줄
const LATE = 6.5;              // 앞으로 못 가면 이만큼(초) 뒤에 지각
const BACK = 3;                // 최고 줄보다 이만큼 넘게 뒤로 가면 지각
const PLAYER_SY = GH - 88;     // 카메라가 맞추는 내 몬스터 화면 y (줄 가운데)
const SWIPE = 22;              // 이보다 길게 밀면 (CSS px) 밀기, 짧으면 탭
const ATLAS_URL = new URL('../../sprites/atlas.png', import.meta.url).href;
const TAU = Math.PI * 2;

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
};
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
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
// 줄 하나 = { r, type, ... , R }. R = 그 줄까지 왔을 때 확실히 설 수 있는 칸(비트). 정적인 줄(잔디·보도·연잎)은
// 반드시 R 과 이어진 빈칸을 남기므로, 시작 줄에서 어느 줄까지든 지나갈 길이 항상 하나는 있다.
// 움직이는 줄: 찻길·기찻길은 R 그대로(곧장 건너면 됨), 통나무는 어디로든 데려다주므로 R = 전부.
const GRASS_K = [['tree', 5], ['bush', 2], ['bench', 1.2], ['bed', 1.4]];
const WALK_K = [['lamp', 1], ['bin', 1], ['bench', 1]];
// 움직이는 것 줄 세우기: 간격까지 합친 한 바퀴 길이(span)가 화면보다 충분히 길어서, 화면 밖에서만 순간이동함
function layMovers(L, list, rand) {
  let x = 0; for (const o of list) { o.x = x; x += o.w + o.gap; }
  L.span = x; L.xa = -(x - GW) / 2;
  const sh = rand() * x;
  for (const o of list) o.x = L.xa + ((o.x + sh) % x);
  L.objs = list;
}
const SPAN_MIN = GW + 2 * 52 + 12;

export function makeGen(rand = Math.random, opt = {}) {
  const lanes = [];
  let R = ALL, lastG = '', roadDir = rand() < 0.5 ? 1 : -1, logDir = rand() < 0.5 ? 1 : -1;
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const rf = (a, b) => a + rand() * (b - a);
  const pickBit = (m) => { const b = bitsOf(m); return b[Math.floor(rand() * b.length)]; };
  const wpick = (list) => { let s = list.reduce((a, b) => a + b[1], 0) * rand(); for (const [k, w] of list) { s -= w; if (s <= 0) return k; } return list[0][0]; };
  const push = (L) => { L.r = lanes.length; L.R = R; lanes.push(L); return L; };

  // 잔디 · 보도: 막힌 칸을 놓되 R 의 한 칸은 반드시 비워 둠 (한 줄에 많아야 5칸)
  // 바로 아래 줄이 정적인 줄이면, 그 줄의 빈칸 덩어리마다 한 칸씩 (막다른 주머니 없음)
  const pocketKeep = () => {
    const pv = lanes[lanes.length - 1]; if (!pv) return 0;
    const free = pv.type === 'grass' || pv.type === 'walk' ? ALL & ~pv.block : pv.type === 'pads' ? pv.pads : 0;
    let m = 0; for (let c = 0; c < COLS;) { if (!((free >> c) & 1)) { c++; continue; } let e = c; while (e < COLS && ((free >> e) & 1)) e++; m |= 1 << ri(c, e - 1); c = e; }
    return m;
  };
  const still = (type, dens, kinds, keepCol) => {
    const d = lanes.length;
    const keep = keepCol ?? pickBit(R);
    const keepM = (1 << keep) | pocketKeep();
    let block = 0, n = 0;
    const order = [...Array(COLS).keys()].sort(() => rand() - 0.5);
    for (const c of order) if (!((keepM >> c) & 1) && n < 5 && rand() < dens) { block |= 1 << c; n++; }
    R = runs(ALL & ~block, R);
    const obs = bitsOf(block).map((c) => ({ c, k: wpick(kinds) }));
    const star = d > 4 && rand() < 0.13 ? pickBit(R) : -1;
    return push({ type, block, obs, star, v: rand() < 0.5 ? 0 : 1 });
  };
  // 찻길: 차 사이 간격 ≥ 속도×0.65초 + 26 도트 (건널 틈이 늘 있음)
  const road = () => {
    const d = lanes.length;
    const sp = Math.min(72, 22 + d * 0.3) * rf(0.85, 1.2);
    const dir = rand() < 0.7 ? -roadDir : roadDir; roadDir = dir;
    const list = []; let tot = 0;
    while (tot < SPAN_MIN) {
      const big = d > 6 && rand() < Math.min(0.38, 0.1 + d / 220);
      const kind = big ? (d > 22 && rand() < 0.55 ? 'bus' : 'van') : 'car';
      const w = kind === 'bus' ? 48 : kind === 'van' ? 34 : 22;
      const gap = Math.max(T * 2.2, sp * 0.65 + 26) + rand() * T * Math.max(1.5, 4 - d / 40);
      list.push({ kind, w, gap, col: Math.floor(rand() * 6) }); tot += w + gap;
    }
    const L = push({ type: 'road', v: sp * dir });
    layMovers(L, list, rand);
    return L;
  };
  // 통나무 개울: 통나무 사이 틈은 1.2~3.2 칸
  const logs = () => {
    const d = lanes.length;
    const sp = Math.min(40, 12 + d * 0.18) * rf(0.85, 1.15);
    const dir = -logDir; logDir = dir;
    const list = []; let tot = 0;
    while (tot < SPAN_MIN) {
      const n = ri(2, d > 60 ? 3 : 4); const w = n * T - 2;
      const gap = rf(1.2, 1.8 + Math.min(1.4, d / 60)) * T;
      list.push({ kind: `log${n}`, w, gap }); tot += w + gap;
    }
    R = ALL;
    const L = push({ type: 'logs', v: sp * dir });
    layMovers(L, list, rand);
    return L;
  };
  // 연잎 징검다리: R 의 한 칸에는 꼭 연잎
  const pads = () => {
    const d = lanes.length;
    const n = d > 50 ? ri(2, 4) : ri(3, 5);
    let P = (1 << pickBit(R)) | pocketKeep();
    while (pop(P) < n) P |= 1 << ri(0, COLS - 1);
    R = runs(P, R);
    return push({ type: 'pads', pads: P, flower: ri(0, COLS - 1) });
  };
  const bridge = () => { R = ALL; return push({ type: 'bridge' }); };
  // 기찻길: 경고등 → 전철. 쉬는 시간·경고 시간은 줄이 멀수록 짧아짐
  const rail = () => {
    const d = lanes.length;
    return push({ type: 'rail', tr: { gap: [Math.max(2.2, 3 - d / 150), Math.max(4.6, 6.5 - d / 100)], warn: d < 60 ? 1.6 : 1.3, v: 330 + Math.min(130, d), cars: ri(3, 5), dir: rand() < 0.5 ? 1 : -1 } });
  };
  const B = { grass: () => still('grass', 0.3, GRASS_K), walk: () => still('walk', 0.12, WALK_K), road, logs, pads, bridge, rail };

  const more = () => {
    const d = lanes.length;
    if (opt.flat) { R = ALL; push({ type: 'grass', block: 0, obs: [], star: -1, v: d % 2 }); return; }
    if (d === 0) { // 출발: 첫 줄은 비어 있고, 그다음 세 줄은 나무 조금
      push({ type: 'grass', block: 0, obs: [], star: -1, v: 0 });
      for (let i = 0; i < 3; i++) still('grass', 0.14, GRASS_K, 4); // 출발 칸 앞은 늘 비움
      opt.script?.forEach((t) => B[t]());
      return;
    }
    const w = { road: 1, water: d >= 10 ? 0.85 : 0, rail: d >= 24 ? 0.5 : 0 };
    if (lastG) w[lastG] *= 0.35;
    const g = wpick(Object.entries(w));
    if (g === 'road') {
      const n = d < 10 ? 1 : ri(1, Math.min(5, 2 + Math.floor(d / 25)));
      for (let i = 0; i < n; i++) road();
    } else if (g === 'water') {
      const n = d < 18 ? 1 : ri(1, Math.min(4, 2 + Math.floor(d / 30)));
      for (let i = 0; i < n; i++) {
        const prev = lanes[lanes.length - 1].type;
        if (d >= 16 && prev !== 'pads' && rand() < 0.3) pads();
        else if (i > 0 && prev !== 'bridge' && rand() < 0.15) bridge();
        else logs();
      }
    } else {
      rail(); if (d > 60 && rand() < 0.35) rail();
    }
    lastG = g;
    // 쉬는 줄 (잔디는 갈수록 조금 빽빽하게)
    const ns = d < 10 ? ri(1, 2) : ri(1, d > 80 ? 1 : 2);
    for (let i = 0; i < ns; i++) {
      if (rand() < 0.25) still('walk', 0.12, WALK_K);
      else still('grass', Math.min(0.42, 0.18 + d / 300), GRASS_K);
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

// ═══════════════════════════ 그림 ═══════════════════════════
// 줄 바닥 (160×16)
function grassTex(v) {
  const g = new G(GW, T); const s = v % 4;
  g.each((x, y) => { const h = hash(x, y, s); let c = v % 2 ? C.g2 : C.g1; if (h < 0.06) c = C.gD; else if (h > 0.96) c = C.gL; if (y === T - 1) c = C.gD; return c; });
  for (let i = 0; i < 9; i++) { const x = 2 + Math.floor(hash(i, s, 11) * (GW - 5)), y = 3 + Math.floor(hash(i, s, 12) * 9); g.set(x, y, C.gD); g.set(x + 2, y, C.gD); g.set(x + 1, y + 1, C.gD); }
  for (let i = 0; i < 3; i++) { const x = 3 + Math.floor(hash(i, s, 21) * (GW - 6)), y = 3 + Math.floor(hash(i, s, 22) * 9); g.set(x, y, ['#ffffff', '#f8a0c0', C.gold][i]); }
  return g;
}
function walkTex() {
  const g = new G(GW, T);
  g.each((x, y) => {
    if (y >= T - 2) return y === T - 2 ? C.curbL : C.curb;
    const row = Math.floor(y / 7); const xo = (x + (row % 2) * 4) % 8;
    if (y % 7 === 6 || xo === 7) return C.paveG;
    return hash(x, y, 5) < 0.07 ? C.paveD : y % 7 === 0 ? C.paveL : C.pave;
  });
  return g;
}
function roadTex(top, bot) {
  const g = new G(GW, T);
  g.each((x, y) => { const h = hash(x, y, 9); return h < 0.1 ? C.asphD : h > 0.93 ? C.asphL : C.asph; });
  if (top === 'c') { g.rect(0, 0, GW, 1, C.curbL); g.rect(0, 1, GW, 1, C.curb); g.rect(0, 2, GW, 1, C.asphD); }
  else for (let x = 0; x < GW; x += 10) g.rect(x + 3, 0, 5, 1, C.line);
  if (bot === 'c') g.rect(0, T - 1, GW, 1, '#3e4458');
  return g;
}
function waterTex(f, top, bot) {
  const g = new G(GW, T);
  g.each((x, y) => (hash(x >> 2, y, 4) < 0.08 ? C.waterD : C.water));
  for (let k = 0; k < 14; k++) {
    const x0 = Math.floor(hash(k, 1, 31) * GW + f * 3 * (k % 2 ? 1 : -1)), y0 = 3 + Math.floor(hash(k, 2, 31) * 10), n = 3 + (k % 3);
    for (let i = 0; i < n; i++) { g.set((x0 + i + GW) % GW, y0, C.waterL); if (i && i < n - 1) g.set((x0 + i + GW) % GW, y0 + 1, C.waterD); }
  }
  if (top) { g.rect(0, 0, GW, 1, C.bank); g.rect(0, 1, GW, 1, C.waterD); }
  if (bot) for (let x = 0; x < GW; x++) g.set(x, T - 1, (x + f * 2) % 6 < 3 ? C.foam : C.waterL);
  return g;
}
function railTex() {
  const g = new G(GW, T);
  g.each((x, y) => { const h = hash(x, y, 13); return h < 0.18 ? C.gravD : h > 0.82 ? C.gravL : C.grav; });
  for (let x = 1; x < GW; x += 8) { g.rect(x, 2, 3, 12, C.sleeper); g.rect(x, 2, 3, 1, C.sleeperL); }
  for (const y of [4, 11]) { g.rect(0, y, GW, 1, C.rail); g.rect(0, y + 1, GW, 1, C.railD); }
  g.rect(0, T - 1, GW, 1, C.gravD);
  return g;
}
function bridgeTex(f, top, bot) {
  const g = waterTex(f, top, bot);
  for (let x = 0; x < GW; x++) for (let y = 2; y <= 13; y++) {
    const b = Math.floor(x / 4); let c = b % 2 ? C.wood : '#d4a466';
    if (x % 4 === 3) c = C.woodD; if (y === 2) c = C.woodL; if (y >= 12) c = C.woodD; if (y === 13) c = C.woodO;
    g.set(x, y, c);
  }
  for (let x = 2; x < GW; x += 16) { g.rect(x, 1, 2, 2, C.woodO); g.rect(x, 12, 2, 2, C.woodO); }
  return g;
}

// 막힌 칸 물건 (아래 가운데가 발. 위 면은 밝게, 앞 면은 어둡게, 오른쪽 아래로 그림자)
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

// 탈것 (오른쪽을 봄 — 왼쪽으로 가면 뒤집음)
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
// 노란 통학버스
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
function padArt(flower) {
  const g = new G(16, 12);
  g.ell(8.5, 7, 7, 4, C.wshadow);
  const b = new G(16, 12);
  b.ell(8, 6, 6.6, 4.2, (x, y, dx, dy) => (dx > 0.15 && Math.abs(dy) < 0.3 + dx * 0.15 && dy < 0.15 && dy > -0.55 ? null : dy < -0.2 ? C.leafL : dy > 0.5 ? C.leafD : C.leaf));
  b.set(5, 4, C.leafH); b.set(6, 4, C.leafH);
  if (flower) { b.set(6, 5, '#ff9ac8'); b.set(5, 6, '#ff9ac8'); b.set(7, 6, '#ff9ac8'); b.set(6, 7, '#ff9ac8'); b.set(6, 6, C.gold); }
  b.outline('#1e6a2e');
  return g.over(b);
}
// 전철 (n 칸, 앞머리가 오른쪽)
function trainArt(n) {
  const cw = 30, w = n * cw + 6, g = new G(w, 22);
  g.rect(2, 20, w - 3, 2, C.shadow);
  const b = new G(w, 22);
  for (let i = 0; i < n; i++) {
    const x0 = i * cw, last = i === n - 1, cwi = last ? cw + 6 : cw - 2;
    b.rect(x0 + 1, 0, cwi - 1, 3, '#d8dce8'); b.rect(x0 + 1, 0, cwi - 1, 1, '#f0f2f8');
    b.rect(x0 + 1, 3, cwi - 1, 14, '#3a7ad0'); b.rect(x0 + 1, 3, cwi - 1, 1, '#6aa0f0');
    for (let k = 0; k < 4; k++) b.rect(x0 + 3 + k * 6, 5, 4, 5, '#c8ecff');
    b.rect(x0 + 1, 12, cwi - 1, 1, C.gold); b.rect(x0 + 1, 16, cwi - 1, 1, '#24508c');
    b.rect(x0 + 1, 17, cwi - 1, 2, C.ink2);
    b.set(x0 + 6, 19, C.ink2); b.set(x0 + cwi - 6, 19, C.ink2);
    if (!last) b.rect(x0 + cwi, 7, 2, 7, C.ink3);
    else { for (let y = 0; y < 17; y++) for (let x = x0 + cwi - 4; x <= x0 + cwi; x++) if (x - (x0 + cwi - 4) > (y < 6 ? 6 - y : 0) + 4) b.set(x, y, null); b.rect(x0 + cwi - 4, 5, 3, 4, '#c8ecff'); b.set(x0 + cwi - 1, 13, C.goldL); b.set(x0 + cwi - 1, 14, C.goldL); }
  }
  b.outline(C.ink);
  return g.over(b);
}
// 건널목 경고등 (프레임 0·1 = 번갈아 깜빡, 2 = 꺼짐)
function signalFrames() {
  return [0, 1, 2].map((f) => {
    const g = new G(8, 20);
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
const BELL = ['....k....', '...kyk...', '..kyyyk..', '.khyyyyk.', '.khyyyyk.', '.kyyyyyk.', 'kyyyyyyyk', 'kkkkkkkkk', '...kdk...', '....k....'];
function shadowArt() { const g = new G(12, 5); g.ell(6, 2.4, 5.4, 2, C.shadow); return g; }

// 내 몬스터 줄이기 — 몸 크기에 따라 2:1 / 3:1 / 4:1 (한 칸 16 도트에 맞게). 블록마다 가장 많은 색, 테두리·눈 같은 어두운 점은 남김
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
  title: '몬스터 등굣길',
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

    // ─────────── 입력 (손가락마다 따로: 짧게 탭 = 앞으로, 밀기 = 그 방향. 손을 뗄 때 움직임) ───────────
    let onDir = null; // 장면이 준비되면 채움
    const noTouch = (e) => { if (e.cancelable) e.preventDefault(); };
    const onDown = (e) => {
      e.preventDefault();
      if (paused || dead) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { wrap.setPointerCapture(e.pointerId); } catch { /* */ }
    };
    const onUp = (e) => {
      e.preventDefault();
      const p = ptrs.get(e.pointerId); if (!p) return;
      ptrs.delete(e.pointerId);
      if (paused || dead) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      let dir = 'up';
      if (Math.hypot(dx, dy) >= SWIPE) dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      onDir?.(dir);
    };
    const onCancel = (e) => { ptrs.delete(e.pointerId); };
    const KEYS = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ' ': 'up', Enter: 'up' };
    const onKey = (e) => {
      const dir = KEYS[e.key]; if (!dir || dead) return;
      if (e.target?.closest?.('input,textarea,select')) return;
      e.preventDefault();
      if (paused || e.repeat) return;
      onDir?.(dir);
    };
    const noMenu = (e) => e.preventDefault();
    wrap.addEventListener('pointerdown', onDown);
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
    Promise.all([loadPhaser(), fontsReady]).then(([Phaser]) => {
      if (dead) return;
      wrap.textContent = '';
      game = new Phaser.Game({
        type: Phaser.AUTO, parent: wrap, width: GW, height: GH,
        pixelArt: true, roundPixels: true, antialias: false, backgroundColor: '#88d070', banner: false,
        audio: { noAudio: true }, input: { keyboard: false, mouse: false, touch: false, gamepad: false }, disableContextMenu: true,
        scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
        callbacks: { postBoot: (g) => { if (dead) g.destroy(true); else if (paused) g.loop.sleep(); } },
        scene: { key: 'cross', preload() { this.load.spritesheet('mons', ATLAS_URL, { frameWidth: 64, frameHeight: 64 }); }, create() { setup(this); }, update(t, d) { tick(d); } },
      });
      if (game.canvas) { game.canvas.style.imageRendering = 'pixelated'; game.canvas.style.touchAction = 'none'; }
      game.scale.on('resize', sizeCanvas); sizeCanvas();
    }).catch(() => { if (!dead) wrap.textContent = '게임을 불러오지 못했어요'; });

    // ─────────── 장면 ───────────
    let tick = () => {};
    function setup(sc) {
      // 텍스처
      for (let v = 0; v < 4; v++) addSheet(sc, `L_grass${v}`, [grassTex(v)]);
      addSheet(sc, 'L_walk', [walkTex()]);
      addSheet(sc, 'L_rail', [railTex()]);
      addSheet(sc, 'tree', [treeArt()]); addSheet(sc, 'bush', [bushArt()]); addSheet(sc, 'bench', [benchArt()]);
      addSheet(sc, 'bed', [bedArt()]); addSheet(sc, 'lamp', [lampArt()]); addSheet(sc, 'bin', [binArt()]);
      addSheet(sc, 'car', CAR_COL.map(carArt)); addSheet(sc, 'van', CAR_COL.map(vanArt)); addSheet(sc, 'bus', [busArt()]);
      for (const n of [2, 3, 4]) addSheet(sc, `log${n}`, [logArt(n)]);
      addSheet(sc, 'pad', [padArt(false), padArt(true)]);
      for (const n of [3, 4, 5]) addSheet(sc, `train${n}`, [trainArt(n)]);
      addSheet(sc, 'signal', signalFrames());
      addSheet(sc, 'star', starFrames());
      addSheet(sc, 'bell', [pmap(BELL, { k: C.ink, y: C.gold, h: C.goldL, d: C.goldD }), pmap(BELL, { k: C.ink, y: '#ff8a5a', h: '#ffd0a0', d: C.redD })]);
      addSheet(sc, 'shad', [shadowArt()]);
      // 줄 바닥 (위·아래 줄 모양에 따라 가장자리가 달라서 필요할 때 만듦)
      const laneKey = (L) => {
        const up = lane(L.r + 1)?.type, dn = lane(L.r - 1)?.type;
        const wet = (t) => t === 'logs' || t === 'pads' || t === 'bridge';
        if (L.type === 'grass') return [`L_grass${(L.r & 1) + 2 * ((L.r >> 1) & 1)}`, false];
        if (L.type === 'walk') return ['L_walk', false];
        if (L.type === 'rail') return ['L_rail', false];
        if (L.type === 'road') {
          const k = `L_road_${up === 'road' ? 'd' : 'c'}${dn === 'road' ? 'n' : 'c'}`;
          if (!sc.textures.exists(k)) addSheet(sc, k, [roadTex(up === 'road' ? 'd' : 'c', dn === 'road' ? 'n' : 'c')]);
          return [k, false];
        }
        const top = !wet(up), bot = !wet(dn), br = L.type === 'bridge';
        const k = `L_${br ? 'bridge' : 'water'}_${+top}${+bot}`;
        if (!sc.textures.exists(k)) addSheet(sc, k, [0, 1].map((f) => (br ? bridgeTex(f, top, bot) : waterTex(f, top, bot))));
        return [k, true];
      };

      // 내 몬스터
      const dex = Math.max(1, Number(api.partner?.()) || 1);
      let meG = null;
      try { meG = shrinkMon(sc.textures.get('mons').getSourceImage(), dex - 1); } catch { /* 아래 대체 그림 */ }
      if (!meG) { meG = new G(12, 13); meG.ell(6, 7, 5, 5, '#c47de9'); meG.outline(C.ink); }
      addSheet(sc, 'me', [meG]);
      // 맞는 범위: 몸통 폭(키의 1/4 이상 칠해진 세로줄 수)의 약 70% → 반폭 hw
      let body = 0; { const need = Math.max(2, Math.round(meG.h * 0.25)); for (let x = 0; x < meG.w; x++) { let n = 0; for (let y = 0; y < meG.h; y++) if (meG.get(x, y)) n++; if (n >= need) body++; } }
      const HW = clamp(Math.round((body || meG.w) * 0.36), 3, 6);

      const cam = sc.cameras.main;
      const mon = sc.add.image(0, 0, 'me', 0).setOrigin(0.5, 1);
      const shad = sc.add.image(0, 0, 'shad', 0);
      const fxG = sc.add.graphics().setDepth(1e5);
      const warnG = sc.add.graphics().setDepth(-9e4);
      const bigBell = sc.add.image(0, 0, 'bell', 0).setScale(3).setDepth(2e5).setVisible(false);

      // 양옆 밖 (어둡게) + HUD
      const edge = sc.add.graphics().setScrollFactor(0).setDepth(9e5);
      edge.fillStyle(0x182030, 0.34); edge.fillRect(0, 0, X0, GH); edge.fillRect(GW - X0, 0, X0, GH);
      edge.fillStyle(0xffffff, 0.22); for (let y = 0; y < GH; y += 4) { edge.fillRect(X0 - 1, y, 1, 2); edge.fillRect(GW - X0, y, 1, 2); }
      const hud = sc.add.graphics().setScrollFactor(0).setDepth(1e6);
      const TXT = (x, y, s, size = 12, bold = true, col = '#ffffff') => sc.add.text(x, y, s, { fontFamily: 'Galmuri11', fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color: col, padding: { top: 2, bottom: 1 } })
        .setScrollFactor(0).setDepth(1e6 + 2).setShadow(1, 1, '#182030', 0, false, true);
      const tScore = TXT(4, 0, '0칸');
      const iStar = sc.add.image(0, 2, 'star', 0).setOrigin(0).setScrollFactor(0).setDepth(1e6 + 1);
      const tStars = TXT(0, 0, '0', 12, true, '#fff4a8');
      const iBell = sc.add.image(GW - 54, 3, 'bell', 0).setOrigin(0).setScrollFactor(0).setDepth(1e6 + 1);
      const tTitle1 = TXT(GW / 2, 18, '몬스터').setOrigin(0.5, 0).setScale(2).setColor('#fff4a8');
      const tTitle2 = TXT(GW / 2, 46, '등굣길').setOrigin(0.5, 0).setScale(2).setColor('#fff4a8');
      const tSub = TXT(GW / 2, 80, '종 치기 전에 학교로!', 12, false, '#d8f0e0').setOrigin(0.5, 0);
      const help = ['탭 = 앞으로 한 칸', '밀기 = 좌·우·뒤로', '멈춰 있으면 지각!', '★ 상점도 모아요']
        .map((s, i) => TXT(GW / 2, 110 + i * 14, s, 12, false, i === 2 ? '#ffb0a0' : i === 3 ? '#fff4a8' : '#ffffff').setOrigin(0.5, 0));
      const tTap = TXT(GW / 2, 250, '탭해서 시작').setOrigin(0.5, 0);
      const tOver = TXT(GW / 2, 100, '').setOrigin(0.5, 0).setDepth(1e6 + 3);
      const tOverM = TXT(GW / 2, 118, '').setOrigin(0.5, 0).setScale(2).setColor('#fff4a8').setDepth(1e6 + 3);
      const tOverS = TXT(GW / 2, 146, '', 12, false, '#d8f0e0').setOrigin(0.5, 0).setDepth(1e6 + 3);
      const readyOn = (v) => { [tTitle1, tTitle2, tSub, tTap, ...help].forEach((o) => o.setVisible(v)); [tScore, iStar, tStars, iBell].forEach((o) => o.setVisible(!v)); };
      readyOn(true);

      // ─────────── 상태 ───────────
      let gen = makeGen();
      const negL = new Map();
      // 출발점 아래 장식 줄 (못 감)
      const lane = (r) => {
        if (r >= 0) { gen.ensure(r + 1); return gen.lanes[r]; }
        if (!negL.has(r)) negL.set(r, r === -1 ? { r, type: 'walk', obs: [], star: -1 } : { r, type: 'grass', obs: [[0, 'tree'], [COLS - 1, 'bush'], [1, 'bed'], [COLS - 2, 'tree']].filter((_, i) => hash(r, i, 3) < 0.55).map(([c, k]) => ({ c, k })), star: -1 });
        return negL.get(r);
      };
      let mode = 'ready', TT = 0, ms = 0, overT = 0, reason = '', lateTick = 0, bellTick = 0;
      const P = { row: 0, x: colX(4), y: laneCY(0), hop: null, rest: 0, queue: null, log: null, face: 1, best: 0, late: 0, stars: 0, bump: 0, bumpDir: 'up' };
      let camY = laneCY(0) - PLAYER_SY;
      const parts = [];
      const shown = new Set();
      const score = () => P.best + P.stars;

      // ─────────── 움직이는 것 ───────────
      const wrapX = (L, x) => L.xa + ((((x - L.xa) % L.span) + L.span) % L.span);
      const moveLane = (L, dt) => {
        if (L.objs) for (const o of L.objs) {
          o.x += L.v * dt;
          if (L.v > 0 && o.x >= L.xa + L.span) o.x -= L.span;
          else if (L.v < 0 && o.x < L.xa) o.x += L.span;
        }
        if (L.type === 'rail') {
          const tr = L.tr;
          tr.st ||= 'idle'; tr.t ??= 1.2 + Math.random() * 2.5;
          if (tr.st === 'idle') { tr.t -= dt; if (tr.t <= 0) { tr.st = 'warn'; tr.t = tr.warn; } }
          else if (tr.st === 'warn') {
            tr.t -= dt;
            if (tr.t <= 0) { tr.st = 'pass'; tr.w = tr.cars * 30 + 6; tr.x = tr.dir > 0 ? -tr.w - 4 : GW + 4; if (mode !== 'over' && Math.abs(L.r - P.row) < 7 && !botOn) api.sfx.ballThrow?.(); }
          } else {
            tr.x += tr.v * tr.dir * dt;
            if ((tr.dir > 0 && tr.x > GW + 8) || (tr.dir < 0 && tr.x + tr.w < -8)) { tr.st = 'idle'; tr.t = tr.gap[0] + Math.random() * (tr.gap[1] - tr.gap[0]); }
          }
        }
      };
      const rowsInView = () => [Math.floor(-(camY + GH) / T) - 1, Math.ceil(-camY / T) + 1];
      const world = (dt) => {
        // 카메라: 위로만 따라감
        const goal = P.y - PLAYER_SY;
        if (goal < camY) camY += (goal - camY) * Math.min(1, dt * 7);
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
        P.hop = { fx: P.x, fy: P.y, tx: tg.x, ty: laneCY(tg.row), t: 0, from: P.row, to: tg.row, carry: tg.carry ? lane(P.row).v : 0 };
        P.log = null;
        if (!botOn) api.sfx.blip?.();
        return true;
      };
      const want = (dir) => {
        if (mode === 'ready') { begin(); return; }
        if (mode !== 'play') return;
        if (P.hop || P.rest > 0) { P.queue = dir; return; }
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
        if (P.row > P.best) { P.best = P.row; P.late = 0; }
        if (P.row < P.best - BACK) gameOver('late');
      };

      // 부딪힘 (지금 서 있는 줄 기준)
      const hitBy = (L, x) => {
        if (L.type === 'road') return L.objs.find((o) => o.x + 2 < x + HW && o.x + o.w - 2 > x - HW) ? 'car' : null;
        if (L.type === 'rail' && L.tr.st === 'pass') return L.tr.x + 2 < x + HW && L.tr.x + L.tr.w - 2 > x - HW ? 'train' : null;
        return null;
      };
      const playerStep = (dt) => {
        ms += dt * 1000;
        P.late += dt; P.bump = Math.max(0, P.bump - dt);
        if (P.hop) {
          const h = P.hop;
          h.t += dt / HOP;
          if (h.carry) { h.fx += h.carry * dt; h.tx += h.carry * dt; }
          const k = Math.min(1, h.t);
          P.x = h.fx + (h.tx - h.fx) * k; P.y = h.fy + (h.ty - h.fy) * k;
          if (h.t >= 0.5) P.row = h.to;
          if (h.t >= 1) { P.hop = null; P.x = h.tx; P.y = h.ty; P.row = h.to; P.rest = REST; land(); if (mode !== 'play') return; }
        } else if (P.rest > 0) P.rest -= dt;
        // 통나무 타기 (같은 줄 같은 dt 로 움직였으니 그대로 따라감)
        if (!P.hop && P.log) {
          P.x += lane(P.row).v * dt;
          if (P.x < X0 - 2 || P.x > GW - X0 + 2) { gameOver('edge'); return; }
        }
        const why = hitBy(lane(P.row), P.x);
        if (why) { gameOver(why); return; }
        if (P.late >= LATE) { gameOver('late'); return; }
        if (!P.hop && P.rest <= 0 && P.queue) { const q = P.queue; P.queue = null; doHop(q); }
        // 지각 2초 전부터 똑딱
        if (P.late > LATE - 2 && !botOn) { lateTick -= dt; if (lateTick <= 0) { lateTick = 0.5; api.sfx.evoTick?.(); } } else lateTick = 0;
      };

      // ─────────── 효과 · 끝 ───────────
      const burst = (x, y, n, sp = 50, cols = [C.foam, C.white, C.waterL]) => {
        for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (0.4 + Math.random() * 0.8); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 25, life: 0.35 + Math.random() * 0.4, c: cols[i % cols.length] }); }
      };
      const gameOver = (why) => {
        if (mode === 'over') return;
        mode = 'over'; overT = 0; reason = why; P.queue = null;
        const fy = P.y + 5;
        if (why === 'car' || why === 'train') { if (!botOn) { api.sfx.hit?.(); setTimeout(() => { if (!dead) api.sfx.faint?.(); }, 250); } burst(P.x, fy - 3, 14, 60, [C.white, C.goldL, '#c8ccd8']); if (!reduce) cam.shake(140, 0.02); }
        else if (why === 'water' || why === 'edge') { if (!botOn) { api.sfx.statDown?.(); setTimeout(() => { if (!dead) api.sfx.faint?.(); }, 300); } burst(P.x, fy - 2, 18, 55); }
        else if (!botOn) { api.sfx.wrong?.(); setTimeout(() => { if (!dead) api.sfx.fail?.(); }, 350); }
        // 안전장치: 서버 상한(초×6+30)보다 아래로 묶음
        const sc2 = Math.min(score(), Math.floor(ms / 1000 * 5) + 20);
        const msOut = Math.max(1000, Math.round(ms));
        if (botOn) { ended = true; return; }
        endTimer = setTimeout(() => { if (!ended && !dead) { ended = true; api.end(sc2, msOut); } }, 1300);
      };
      const begin = () => {
        if (mode !== 'ready') return;
        mode = 'play'; ms = 0; P.late = 0; readyOn(false); if (!botOn) api.sfx.select?.();
      };

      // ─────────── 그리기 ───────────
      const showLane = (L) => {
        const bot = laneBot(L.r), top = bot - T;
        const [key, anim] = laneKey(L);
        const v = { bg: sc.add.image(0, top, key, 0).setOrigin(0).setDepth(-1e5), anim, items: [] };
        (L.obs || []).forEach((o) => v.items.push(sc.add.image(colX(o.c), bot - 1, o.k, 0).setOrigin(0.5, 1).setDepth(bot - 2)));
        if (L.type === 'pads') bitsOf(L.pads).forEach((c) => v.items.push(sc.add.image(colX(c), bot - 8, 'pad', c === L.flower ? 1 : 0).setDepth(bot - 3)));
        if (L.objs) L.objs.forEach((o) => {
          const isLog = L.type === 'logs';
          const fr = o.kind === 'bus' || isLog ? 0 : o.col % (o.kind === 'van' ? 3 : 6);
          o.img = sc.add.image(0, isLog ? bot - 1 : bot, o.kind, fr).setOrigin(0, 1).setDepth(isLog ? bot - 3 : bot - 0.5).setFlipX(L.v < 0);
          v.items.push(o.img);
        });
        if (L.type === 'rail') {
          v.train = sc.add.image(0, bot + 1, `train${L.tr.cars}`, 0).setOrigin(0, 1).setDepth(bot - 0.5).setFlipX(L.tr.dir < 0).setVisible(false);
          v.sig = [sc.add.image(0, bot - 1, 'signal', 2).setOrigin(0, 1).setDepth(bot - 1), sc.add.image(GW - 8, bot - 1, 'signal', 2).setOrigin(0, 1).setDepth(bot - 1)];
          v.items.push(v.train, ...v.sig);
        }
        if (L.star >= 0 && !L.starGot) { v.star = sc.add.image(colX(L.star), bot - 8, 'star', 0).setDepth(bot - 2); v.items.push(v.star); }
        L.vis = v; shown.add(L);
      };
      const hideLane = (L) => { L.vis.bg.destroy(); L.vis.items.forEach((o) => o.active && o.destroy()); if (L.objs) L.objs.forEach((o) => { o.img = null; }); L.vis = null; shown.delete(L); };

      const draw = (dt) => {
        cam.setScroll(0, Math.round(camY));
        const [r0, r1] = rowsInView();
        for (const L of [...shown]) if (L.r < r0 - 1 || L.r > r1 + 1) hideLane(L);
        warnG.clear();
        let ding = false;
        for (let r = r0; r <= r1; r++) {
          const L = lane(r); if (!L.vis) showLane(L);
          const v = L.vis;
          if (v.anim) v.bg.setFrame(Math.floor(TT / 0.45 + (r & 1)) % 2);
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
        if (ding && mode !== 'over') { bellTick -= dt; if (bellTick <= 0) { bellTick = 0.3; api.sfx.evoTick?.(); } } else bellTick = 0;
        // 내 몬스터
        const h = P.hop, arc = h ? Math.round(Math.sin(Math.PI * Math.min(1, h.t)) * 5) : 0;
        const bx = P.bump > 0 ? Math.round(Math.sin((P.bump / 0.12) * Math.PI) * 2) : 0;
        const ox = P.bumpDir === 'left' ? -bx : P.bumpDir === 'right' ? bx : 0, oy = P.bumpDir === 'up' ? -bx : P.bumpDir === 'down' ? bx : 0;
        const foot = Math.round(P.y + 5), dep = P.y + T / 2 - 1.5 + (mode === 'over' && (reason === 'car' || reason === 'train') ? 1.2 : 0); // 치이면 납작해진 모습이 차 위로 보이게
        let sink = 0;
        mon.setScale(1).setCrop().setAngle(0).setVisible(true);
        if (mode === 'over') {
          if (reason === 'car' || reason === 'train') mon.setScale(1.4, 0.35);
          else if (reason === 'water' || reason === 'edge') { sink = Math.min(meG.h, Math.floor(overT * 26)); mon.setCrop(0, 0, meG.w, meG.h - sink); }
        }
        mon.setPosition(Math.round(P.x) + ox, foot - arc + oy + sink).setDepth(dep).setFlipX(P.face > 0);
        shad.setPosition(Math.round(P.x), foot).setDepth(dep - 0.2).setVisible(mode !== 'over' || reason === 'late');
        // 지각 종
        if (mode === 'over' && reason === 'late') {
          bigBell.setVisible(true).setFrame(1).setPosition(GW / 2, Math.round(camY + 64)).setAngle(reduce ? 0 : Math.sin(overT * 22) * 18);
        } else bigBell.setVisible(false);
        // 튀는 것
        fxG.clear();
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt;
          fxG.fillStyle(hexN(p.c), 1); fxG.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
        }
        drawHud();
      };

      const drawHud = () => {
        hud.clear();
        if (mode !== 'ready') {
          hud.fillStyle(0x182030, 0.66); hud.fillRect(0, 0, GW, 16);
          hud.fillStyle(0x4a6098, 1); hud.fillRect(0, 16, GW, 1);
          tScore.setText(`${P.best}칸`);
          iStar.setX(Math.round(tScore.x + tScore.width + 6));
          tStars.setText(`${P.stars}`).setX(iStar.x + 13);
          // 지각 게이지: 차오르면 종이 울림
          const k = clamp(P.late / LATE, 0, 1), x = GW - 41, w = 36;
          const hot = k > 0.69, blink = hot && Math.floor(TT * 6) % 2;
          iBell.setFrame(hot ? 1 : 0).setX(GW - 54 + (hot && !reduce ? Math.round(Math.sin(TT * 30)) : 0));
          hud.fillStyle(0x0a1020, 1); hud.fillRect(x - 1, 4, w + 2, 8);
          hud.fillStyle(0x2c3c64, 1); hud.fillRect(x, 5, w, 6);
          hud.fillStyle(k > 0.69 ? (blink ? 0xffffff : 0xe05050) : k > 0.45 ? 0xf8d048 : 0x58c868, 1); hud.fillRect(x, 5, Math.round(w * k), 6);
          hud.fillStyle(0xffffff, 0.35); hud.fillRect(x, 5, Math.round(w * k), 1);
        } else {
          hud.fillStyle(0x182030, 0.62); hud.fillRoundedRect(10, 12, GW - 20, 88, 6);
          hud.fillStyle(0x182030, 0.62); hud.fillRoundedRect(10, 104, GW - 20, 62, 6);
          tTap.setVisible(reduce || Math.floor(TT * 2) % 2 === 0);
          if (tTap.visible) { hud.fillStyle(0x182030, 0.62); hud.fillRoundedRect(GW / 2 - 44, 247, 88, 20, 5); }
        }
        if (mode === 'over' && overT > 0.35) {
          hud.fillStyle(0x182030, 0.82); hud.fillRoundedRect(12, 94, GW - 24, 72, 8);
          hud.lineStyle(1, 0xffffff, 0.7); hud.strokeRoundedRect(12, 94, GW - 24, 72, 8);
          const msg = { car: '차에 부딪혔다!', train: '전철에 부딪혔다!', water: '풍덩! 물에 빠졌다', edge: '물살에 떠내려갔다', late: '땡땡땡~ 지각!' }[reason];
          tOver.setText(msg).setVisible(true).setColor(reason === 'late' ? '#ffb0a0' : reason === 'water' || reason === 'edge' ? '#bfe6f8' : '#ffffff');
          tOverM.setText(`${score()}칸`).setVisible(true);
          tOverS.setText(P.stars ? `${P.best}칸 + 상점 ${P.stars}` : `${P.best}칸 왔어요`).setVisible(true);
        } else { tOver.setVisible(false); tOverM.setVisible(false); tOverS.setVisible(false); }
      };

      tick = (deltaMs) => {
        if (dead) return;
        const dt = Math.min(deltaMs, 100) / 1000; TT += dt;
        world(dt);
        if (mode === 'play') playerStep(dt);
        else if (mode === 'over') overT += dt;
        draw(dt);
      };

      // ─────────── 시험용 (개발 페이지에서만) ───────────
      let botOn = false;
      if (dev) stage.crossDebug = () => ({ mode, row: P.row, best: P.best, stars: P.stars, late: +P.late.toFixed(2), ms: Math.round(ms), reason, x: Math.round(P.x), log: !!P.log, hop: !!P.hop, hw: HW, me: [meG.w, meG.h], lane: lane(P.row).type,
        texts: [tScore, tStars, tTitle1, tTitle2, tSub, tTap, tOver, tOverM, tOverS, ...help].filter((t) => t.visible && t.text).map((t) => { const r = t.getBounds(); return { s: t.text, x0: Math.round(r.x), x1: Math.round(r.right), y0: Math.round(r.y), y1: Math.round(r.bottom), lines: t.getWrappedText ? t.getWrappedText().length : 1 }; }) });
      if (dev) {
        // 시작 전에만: 줄 다시 만들기 (seed, flat = 장애물 없는 잔디만, script = 출발 뒤 줄 순서 고정)
        stage.crossCheat = (o = {}) => {
          if (mode !== 'ready') return false;
          [...shown].forEach(hideLane);
          gen = makeGen(o.seed != null ? rng(o.seed) : Math.random, o);
          return true;
        };
        stage.crossLanes = (a, b) => { const out = []; for (let r = a; r <= b; r++) { const L = lane(r); out.push({ r, type: L.type, v: L.v, block: L.block, pads: L.pads, tr: L.tr && { st: L.tr.st, t: L.tr.t }, objs: L.objs && L.objs.map((q) => [Math.round(q.x), q.w]) }); } return out; };
        stage.crossTp = (row, x) => { P.row = row; P.best = Math.max(P.best, row); P.y = laneCY(row); P.x = x ?? colX(4); camY = P.y - PLAYER_SY; };
        // 봇: 앞을 내다보고 안전하면 앞으로, 아니면 기다리거나 옆으로. 화면 없이 빨리 감음 (실제 game step 그대로 씀)
        stage.crossBot = ({ maxT = 600, react = 0 } = {}) => {
          botOn = true;
          if (mode === 'ready') begin();
          const dt = 1 / 60; let t = 0, hops = 0;
          const fx = (L, o, s) => wrapX(L, o.x + L.v * s);
          const roadOk = (L, x, s0, s1) => { for (let s = s0; s <= s1; s += 0.02) if (L.objs.some((o) => { const ox = fx(L, o, s); return ox + 2 - 3 < x + HW && ox + o.w - 2 + 3 > x - HW; })) return false; return true; };
          const trainOk = (L, s1) => { const tr = L.tr; if (!tr.st || tr.st === 'pass') return tr.st !== 'pass'; const until = tr.st === 'warn' ? tr.t : tr.t + tr.warn; return until > s1 + 0.15; };
          const safe = (row, x, s0, hold) => {
            const L = lane(row);
            if (L.type === 'road') return roadOk(L, x, s0, s0 + hold);
            if (L.type === 'rail') return trainOk(L, s0 + hold);
            if (L.type === 'logs') { const o = L.objs.find((q) => { const ox = fx(L, q, s0); return x >= ox + 4 && x <= ox + q.w - 4; }); if (!o) return false; const xe = x + L.v * hold; return xe > X0 + 6 && xe < GW - X0 - 6; }
            if (L.type === 'pads') return !!((L.pads >> snapCol(x)) & 1);
            return true;
          };
          const think = () => {
            const here = safe(P.row, P.x, 0, HOP + REST + 0.1);
            const opts = ['up', 'left', 'right', 'down'].map((d) => ({ d, tg: target(d) })).filter((o) => o.tg);
            const ok = (o) => safe(o.tg.row, o.tg.x, HOP, REST + 0.2) && safe(P.row, P.x, 0, HOP * 0.5);
            const up = opts.find((o) => o.d === 'up');
            if (up && ok(up) && !(up.tg.row < P.best - BACK)) return 'up';
            if (here && P.late < LATE - 1.2 && (up || !opts.some((o) => (o.d === 'left' || o.d === 'right') && ok(o)))) return null;
            // 앞이 막혔으면 옆으로 (다음 줄에서 갈 수 있는 쪽)
            const side = opts.filter((o) => (o.d === 'left' || o.d === 'right') && ok(o));
            if (side.length) {
              const nx = lane(P.row + 1); const c = snapCol(P.x);
              const goal = (nx.type === 'grass' || nx.type === 'walk') ? bitsOf(~nx.block & ALL).sort((a, b) => Math.abs(a - c) - Math.abs(b - c))[0] : nx.type === 'pads' ? bitsOf(nx.pads).sort((a, b) => Math.abs(a - c) - Math.abs(b - c))[0] : c;
              const pref = goal < c ? 'left' : goal > c ? 'right' : null;
              return (side.find((o) => o.d === pref) || side[0]).d;
            }
            if (here) return null;
            const dn = opts.find((o) => o.d === 'down' && ok(o));
            return dn ? 'down' : 'up';
          };
          let pend = null;
          while (mode === 'play' && t < maxT) {
            if (!P.hop && P.rest <= 0 && !P.queue && !pend) { const d = think(); if (d) pend = { d, at: t + react }; }
            if (pend && t >= pend.at) { if (!P.hop && P.rest <= 0 && doHop(pend.d)) hops++; pend = null; }
            world(dt); playerStep(dt); t += dt;
          }
          botOn = false;
          const r = { best: P.best, stars: P.stars, score: score(), t: +t.toFixed(1), reason, hops, rate: +(P.best / Math.max(1, t)).toFixed(2) };
          return r;
        };
      }
    }

    return () => {
      dead = true; ended = true;
      clearTimeout(endTimer);
      ro.disconnect();
      wrap.removeEventListener('pointerdown', onDown);
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
      delete stage.crossDebug; delete stage.crossCheat; delete stage.crossBot; delete stage.crossLanes; delete stage.crossTp;
      if (game) { try { game.loop.wake(); } catch { /* */ } game.destroy(true); game = null; }
      wrap.remove();
    };
  },
};
