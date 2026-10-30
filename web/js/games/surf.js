// 몬스터 서핑: 내 몬스터가 서프보드를 타고 끝없는 바다를 내려간다. 좌우 5단계로 방향을 바꿔 바위·섬·통나무를 피하고,
// 500m 부터는 문어 몬스터가 뒤쫓아 온다. 점수 = 내려간 거리(m). (Phaser 3. 바다·섬·문어는 이 파일에서 도트로 그리고,
// 바위·통나무·뗏목·통·상자·연잎·모래 무늬·조개·양동이는 CC0 도트 그림 — img/games/surf/CREDITS.txt)
// 서버 상한: 점수 ≤ 초×40+50 → 최고 속도(부스트 포함) 26.4 m/s 로 묶음. 숨긴 탭·멈춤(mg-pause) 시간은 ms 에 안 들어감.
import { loadPhaser } from './common.js';

const GW = 160, GH = 288;          // 논리 해상도 (정수 배로 키움)
const PY = 96;                      // 플레이 중 내 몬스터 화면 y
const PX_PER_M = 10;                // 10 도트 = 1 m
const HEAD = [-62, -32, 0, 32, 62]; // 방향 5단계 (도, 0 = 똑바로 아래)
const BOOST_T = 2.2, BOOST_K = 1.6, MAX_BASE = 165; // 165×1.6 = 264 px/s = 26.4 m/s
const ATLAS_URL = new URL('../../sprites/atlas.png', import.meta.url).href;
const PROPS_URL = new URL('../../img/games/surf/surf-props.png', import.meta.url).href;
const PROPS = { rockBig: [0, 0, 25, 21], rock1: [26, 0, 16, 14], rock2: [43, 0, 15, 13], rock3: [59, 0, 11, 9], log: [71, 0, 44, 15], raft: [116, 0, 32, 26], barrel: [149, 0, 17, 24], crate: [167, 0, 16, 18], pad2: [0, 27, 9, 9], pad3: [10, 27, 11, 11], sandTile: [22, 27, 16, 16], pebbleS: [39, 27, 7, 5], pebbleL: [47, 27, 12, 7], shell1: [60, 27, 7, 5], shell2: [68, 27, 12, 7], shell3: [81, 27, 7, 5], shell4: [89, 27, 12, 7], bucket: [102, 27, 10, 17], bucketB: [113, 27, 10, 17], shovel: [124, 27, 18, 17], star1: [143, 27, 5, 5], star2: [149, 27, 5, 5] };
const PR = 2; // 내 몬스터 부딪힘 반지름 (보이는 몸보다 훨씬 작게 = 너그럽게)
const TAU = Math.PI * 2;

// ───────────────────────── 색 ─────────────────────────
const C = {
  deep: '#0e6b90', d2: '#137fa2', mid: '#1994b3', m2: '#21a8bf', lite: '#2dbcc8', l2: '#44cdcf',
  sh1: '#5ddbd0', sh2: '#86e8d6', sh3: '#b6f4df', foam: '#f4fffa', foam2: '#c8f6ec',
  sand: '#f3d998', sandL: '#fff1c4', sandD: '#dcb877', sandW: '#c39d62',
  leaf: '#3aa64f', leafL: '#78d46c', leafD: '#22773f', leafO: '#153d29',
  trunk: '#a8743e', trunkL: '#cf9d5e', trunkD: '#7a4e28',
  rock: '#6c7d90', rockL: '#97a9ba', rockH: '#cad7e0', rockD: '#47566a', rockO: '#1d2838', rockW: '#365d70',
  wood: '#b07a46', woodL: '#d6a066', woodD: '#7d5230', woodO: '#3a2414', ring: '#ecc894',
  octo: '#9b4fd2', octoL: '#c47de9', octoH: '#ebb6fa', octoD: '#6b2fa2', octoO: '#2a1146', octoP: '#ff86c8', octoS: '#fbc8ee',
  ink: '#132030', white: '#ffffff', red: '#ff5a64', redD: '#b8283c', gold: '#ffd23f', goldL: '#fff4a8', goldD: '#c97f12',
  weed: '#1f7d5c', weedL: '#3daa6c', weedH: '#7fd486', weedD: '#11524a',
};
const SH_DARK = { [C.foam]: C.sh2, [C.foam2]: C.sh2, [C.sh3]: C.sh1, [C.sh2]: C.l2, [C.sh1]: C.lite };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rgba = (h) => { const n = parseInt(h.slice(1, 7), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, h.length > 7 ? parseInt(h.slice(7, 9), 16) : 255]; };
const hexN = (h) => parseInt(h.slice(1, 7), 16);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ─────────────────── 도트 격자 (그림 그리기 도구) ───────────────────
class G {
  constructor(w, h) { this.w = w; this.h = h; this.a = new Array(w * h).fill(null); }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.a[y * this.w + x] = c; }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.a[y * this.w + x]; }
  each(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = fn(x, y, this.a[y * this.w + x]); if (c !== undefined) this.a[y * this.w + x] = c; } }
  over(o, ox = 0, oy = 0) { o.each((x, y, c) => { if (c) this.set(x + ox, y + oy, c); }); return this; }
  outline(col) {
    const add = [];
    this.each((x, y, c) => { if (!c && (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1))) add.push(x, y); });
    for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], col);
    return this;
  }
  disc(cx, cy, r, fn) { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= r * r + 0.3) { const c = typeof fn === 'function' ? fn(x, y, dx, dy) : fn; if (c) this.set(x, y, c); } } }
  clone() { const g = new G(this.w, this.h); g.a = this.a.slice(); return g; }
}
// 문자 도트맵 → 격자
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

// ───────────────────────── 바다 ─────────────────────────
const SEA = 256;
function seaGrid() {
  const r = rng(11);
  const waves = [[1, 0, 1], [0, 1, 1], [1, 1, 0.7], [2, -1, 0.55], [-1, 2, 0.55], [3, 1, 0.3], [1, -3, 0.3], [4, 3, 0.16], [-3, 5, 0.16], [6, -2, 0.08], [2, 7, 0.07]]
    .map(([kx, ky, a]) => [kx, ky, a, r() * TAU]);
  const v = new Float32Array(SEA * SEA); let lo = 9, hi = -9;
  for (let y = 0; y < SEA; y++) for (let x = 0; x < SEA; x++) {
    let s = 0; for (const [kx, ky, a, p] of waves) s += a * Math.sin(TAU * (kx * x + ky * y) / SEA + p);
    v[y * SEA + x] = s; lo = Math.min(lo, s); hi = Math.max(hi, s);
  }
  const pal = [C.deep, C.d2, C.mid, C.m2, C.lite, C.l2];
  const g = new G(SEA, SEA);
  g.each((x, y) => { const n = (v[y * SEA + x] - lo) / (hi - lo); const i = clamp(Math.floor(n * 6.2 - 0.4 + (bay(x, y) - 0.5) * 0.95), 0, 5); return pal[i]; });
  // 잔물결 (가로 짧은 밝은 줄 + 아래 그늘)
  for (let k = 0; k < 70; k++) {
    const x0 = Math.floor(r() * SEA), y0 = Math.floor(r() * SEA), len = 3 + Math.floor(r() * 4);
    const base = pal.indexOf(g.get(x0, y0)); if (base < 1) continue;
    const up = pal[Math.min(5, base + 1)], dn = pal[base - 1];
    for (let i = 0; i < len; i++) { const x = (x0 + i) % SEA; g.set(x, y0, up); if (i > 0 && i < len - 1) g.set(x, (y0 + 1) % SEA, dn); }
  }
  return g;
}
// 햇빛 일렁임 (물속 빛 그물) — 반투명 층으로 천천히 흘러감
function causticGrid() {
  const g = new G(SEA, SEA);
  g.each((x, y) => {
    const f1 = Math.sin(TAU * 3 * x / SEA + 1.7 * Math.sin(TAU * 2 * y / SEA + 0.7));
    const f2 = Math.sin(TAU * 3 * y / SEA + 1.5 * Math.sin(TAU * 2 * x / SEA + 2.1));
    const f3 = Math.sin(TAU * (2 * x + 3 * y) / SEA + 1.2 * Math.sin(TAU * x / SEA));
    const s = f1 + f2 + f3 * 0.6;
    return Math.abs(s) < 0.09 ? '#e4fff8' : Math.abs(s) < 0.2 && bay(x, y) > 0.55 ? '#bff4ec' : null;
  });
  return g;
}
// 구름 그림자 (아주 옅게)
function cloudGrid() {
  const r = rng(5); const ws = [[1, 0], [0, 1], [1, 1], [1, -1], [2, 1], [-1, 2]].map(([a, b]) => [a, b, r() * TAU, 0.5 + r() * 0.5]);
  const g = new G(SEA, SEA);
  g.each((x, y) => { let s = 0; for (const [a, b, p, k] of ws) s += k * Math.sin(TAU * (a * x + b * y) / SEA + p); s /= 3.2; return s > 0.42 || (s > 0.34 && bay(x, y) < (s - 0.34) / 0.08) ? '#04314a' : null; });
  return g;
}

// ─────────── 얕은 물 테두리 + 거품 (모든 바위·섬 둘레) ───────────
// base: 물에 닿는 바닥 모양. 돌려주는 프레임 2장(거품이 찰랑임)
function haloFrames(base, scale = 1, shadow = [2, 2]) {
  const edges = [];
  base.each((x, y, c) => { if (c && (!base.get(x - 1, y) || !base.get(x + 1, y) || !base.get(x, y - 1) || !base.get(x, y + 1))) edges.push(x, y); });
  const D = new Float32Array(base.w * base.h).fill(99);
  const R = 14 * scale;
  base.each((x, y, c) => {
    if (c) return;
    let m = 99;
    for (let i = 0; i < edges.length; i += 2) { const dx = x - edges[i], dy = y - edges[i + 1]; if (Math.abs(dx) > R || Math.abs(dy) > R) continue; const d = Math.sqrt(dx * dx + dy * dy); if (d < m) m = d; }
    D[y * base.w + x] = m;
  });
  return [0, 1].map((f) => {
    const g = new G(base.w, base.h);
    g.each((x, y, c0) => {
      if (base.get(x, y)) return null;
      const d = D[y * base.w + x]; const s = d / scale;
      const ang = Math.atan2(y - base.h / 2, x - base.w / 2);
      const seg = Math.floor((ang + Math.PI) / TAU * 26 + f * 0.5) % 2;
      if (f === 0 ? d <= 1.5 : d > 0.8 && d <= 2.4) return hash(x, y, f) < 0.12 ? C.foam2 : C.foam;
      if (f === 1 && d <= 0.8) return C.sh3;
      if (Math.abs(s - (f ? 6.6 : 5.6)) < 0.55 && seg && hash(x, y, 9) < 0.8) return C.foam2;
      if (s < 4.2) return C.sh3;
      if (s < 4.9) return bay(x, y) < (4.9 - s) / 0.7 ? C.sh3 : C.sh2;
      if (s < 7.6) return C.sh2;
      if (s < 8.4) return bay(x, y) < (8.4 - s) / 0.8 ? C.sh2 : C.sh1;
      if (s < 10.6) return C.sh1;
      if (s < 13.5) return bay(x, y) < (13.5 - s) / 2.9 ? C.sh1 : null;
      return null;
    });
    // 바닥 그림자 (오른쪽 아래로)
    base.each((x, y, c) => { if (!c) return; const tx = x + shadow[0], ty = y + shadow[1]; if (base.get(tx, ty)) return; const cur = g.get(tx, ty); if (cur && SH_DARK[cur]) g.set(tx, ty, SH_DARK[cur]); });
    return g;
  });
}

// 울퉁불퉁 타원 마스크
function blob(w, h, cx, cy, rx, ry, seed, wob = 0.08) {
  const r = rng(seed); const p1 = r() * TAU, p2 = r() * TAU, p3 = r() * TAU;
  const g = new G(w, h);
  g.each((x, y) => { const dx = (x - cx) / rx, dy = (y - cy) / ry; const a = Math.atan2(dy, dx); const k = 1 + wob * Math.sin(3 * a + p1) + wob * 0.7 * Math.sin(5 * a + p2) + wob * 0.4 * Math.sin(7 * a + p3); return dx * dx + dy * dy < k * k ? 1 : null; });
  return g;
}

// ───────────────────────── 섬 ─────────────────────────
function palm(g, bx, by, h, lean, seed) {
  const r = rng(seed);
  const p = new G(g.w, g.h);
  let tx = bx, ty = by;
  for (let i = 0; i <= h; i++) {
    const t = i / h; const x = bx + lean * t * t; const y = by - i; tx = x; ty = y;
    const band = (i % 3 === 0);
    const wdt = t < 0.7 ? 1 : 0;
    for (let k = -1; k <= wdt; k++) p.set(x + k, y, band ? C.trunkD : k < 0 ? C.trunkL : k > 0 ? C.trunkD : C.trunk);
  }
  // 잎 (7장, 처지게)
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + r() * 0.35 - 0.2;
    const len = 9 + r() * 4;
    for (let s = 0; s <= len; s += 0.5) {
      const t = s / len;
      const x = tx + Math.cos(a) * s * 1.05;
      const y = ty + Math.sin(a) * s * 0.62 + t * t * 5;
      const th = 2.1 * (1 - t) + 0.6;
      for (let q = -th; q <= th; q += 0.5) {
        const nx = -Math.sin(a), ny = Math.cos(a) * 0.62;
        const px = x + nx * q, py = y + ny * q;
        const side = q * (ny >= 0 ? 1 : -1);
        p.set(px, py, Math.abs(q) < 0.6 ? (Math.sin(a) < 0.2 ? C.leafL : C.leaf) : side > 0 ? C.leafD : C.leaf);
      }
    }
  }
  // 코코넛
  [[-1, 2], [1, 2], [0, 3]].forEach(([dx, dy]) => p.set(tx + dx, ty + dy, '#6a3e1c'));
  p.set(tx - 1, ty + 1, '#9a6230');
  p.outline(C.leafO);
  g.over(p);
  return [tx, ty];
}
function islandArt(seed, rx, ry, palms, deco) {
  const pad = 15, top = palms ? 30 : 4;
  const w = Math.ceil(2 * (rx + pad)), h = Math.ceil(2 * ry + pad * 2 + top);
  const cx = w / 2, cy = top + pad + ry;
  const base = blob(w, h, cx, cy, rx, ry, seed, 0.09);
  const r = rng(seed + 3);
  const body = new G(w, h);
  base.each((x, y, c) => {
    if (!c) return;
    const nx = (x - cx) / rx, ny = (y - cy) / ry; const e = Math.sqrt(nx * nx + ny * ny);
    const li = -(nx * 0.55 + ny * 0.85);
    let col = C.sand;
    if (e > 0.78 + (bay(x, y) - 0.5) * 0.1) col = ny > -0.1 ? C.sandW : C.sandD;
    else if (li > 0.25 + (bay(x, y) - 0.5) * 0.2) col = C.sandL;
    else if (li < -0.45) col = C.sandD;
    body.set(x, y, col);
  });
  // 모래 점 · 조개 · 불가사리
  for (let i = 0; i < rx * 1.4; i++) { const x = cx + (r() - 0.5) * rx * 1.4, y = cy + (r() - 0.5) * ry * 1.2; if (body.get(x, y) === C.sand) body.set(x, y, C.sandD); }
  const sx = cx + (r() - 0.5) * rx * 0.9, sy = cy + ry * 0.35;
  if (deco) deco(body, cx, cy, rx, ry, r, palms);
  else if (body.get(sx, sy)) { [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([a, b]) => body.set(sx + a, sy + b, a || b ? '#ff8a78' : '#ffb39c')); }
  if (!palms) { // 풀 몇 포기
    for (let i = 0; i < 3; i++) { const x = cx + (r() - 0.5) * rx, y = cy + (r() - 0.6) * ry * 0.8; [[0, 0], [-1, -1], [1, -1], [0, -2]].forEach(([a, b]) => body.set(x + a, y + b, b < -1 ? C.leafL : C.leaf)); }
  }
  // 야자수 (그림자 먼저)
  const spots = palms === 1 ? [[cx + 1, cy + 1, 22, 4]] : palms === 2 ? [[cx - rx * 0.35, cy + 1, 20, -5], [cx + rx * 0.3, cy + ry * 0.2, 25, 4]] : [];
  spots.forEach(([x, y, hh, lean]) => {
    const tx = x + lean + 7, ty = y - 2;
    body.disc(tx, ty, 6.5, (px, py) => (base.get(px, py) && Math.abs(py - ty) < 4.5 ? (body.get(px, py) === C.sandW ? '#a9884f' : C.sandW) : null));
  });
  spots.forEach(([x, y, hh, lean], i) => palm(body, Math.round(x), Math.round(y), hh, lean, seed * 7 + i));
  return { base, body, cx, cy, w, h, foot: ry };
}

// ─────────── CC0 도트 그림 (surf-props.png) → 격자 ───────────
const hex2 = (r, g, b, a) => `#${[r, g, b, a].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
let PROP_PX = null; // { data, w } — setup 에서 채움
function sprite(name) {
  const [sx, sy, w, h] = PROPS[name]; const g = new G(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((sy + y) * PROP_PX.w + sx + x) * 4; const d = PROP_PX.data;
    if (d[i + 3] > 0) g.set(x, y, hex2(d[i], d[i + 1], d[i + 2], d[i + 3]));
  }
  return g;
}
// 떠 있는 물건: 아래쪽 baseFrac 부분이 물에 닿는 바닥 (얕은 물 테두리를 만듦)
function propArt(name, baseFrac, pad = 9) {
  const s = sprite(name); const w = s.w + pad * 2, h = s.h + pad * 2;
  const body = new G(w, h); body.over(s, pad, pad);
  const base = new G(w, h); const y0 = Math.floor(s.h * (1 - baseFrac));
  let x0 = 99, x1 = 0, ya = 99, yb = 0;
  s.each((x, y, c) => { if (c && y >= y0 && rgba(c)[3] > 200) { base.set(x + pad, y + pad, 1); x0 = Math.min(x0, x); x1 = Math.max(x1, x); ya = Math.min(ya, y); yb = Math.max(yb, y); } });
  const cx = pad + (x0 + x1 + 1) / 2, cy = pad + (ya + yb + 1) / 2;
  return { base, body, cx, cy, w, h, foot: pad + yb + 1 - cy };
}

// ───────────────────────── 부표 · 부두 ─────────────────────────
function buoyFrames() {
  const w = 22, h = 26;
  const make = (bob) => {
    const g = new G(w, h); const cx = 11, cy = 15 + bob;
    for (let y = -8; y <= 3; y++) for (let x = -4; x <= 4; x++) {
      const k = y < -5 ? 2 + (y + 8) * 0.7 : 4; if (Math.abs(x) > k) continue;
      const stripe = Math.floor((y + 8) / 3) % 2 === 0;
      let c = stripe ? C.red : '#fbfbf6';
      if (x >= 2) c = stripe ? C.redD : '#c8d2da';
      if (x <= -3 && y < 1) c = stripe ? '#ff9ca0' : '#ffffff';
      g.set(cx + x, cy + y, c);
    }
    g.set(cx, cy - 10, C.gold); g.set(cx, cy - 9, C.goldD); g.set(cx - 1, cy - 9, C.goldD); g.set(cx + 1, cy - 9, C.goldD);
    g.outline(C.ink);
    return g;
  };
  const base = new G(w, h); for (let x = 6; x <= 16; x++) for (let y = 17; y <= 19; y++) base.set(x, y, 1);
  return { base, frames: [make(0), make(1)], cx: 11, cy: 16, w, h, foot: 3 };
}
function pierArt() {
  const w = 86, h = 40, cx = 43, cy = 20, L = 30, T = 6;
  const base = new G(w, h), body = new G(w, h);
  // 기둥 (물에 닿는 곳)
  const posts = [-27, -13, 1, 15, 27];
  posts.forEach((px) => { for (let dx = -1; dx <= 1; dx++) for (let dy = 4; dy <= 9; dy++) { base.set(cx + px + dx, cy + dy, 1); body.set(cx + px + dx, cy + dy, dx < 0 ? C.woodD : '#5e3a1e'); } });
  for (let x = -L; x <= L; x++) for (let y = -T; y <= T - 2; y++) {
    const plank = Math.floor((x + L) / 4); const edge = (x + L) % 4 === 3;
    let c = plank % 2 ? C.wood : '#bb8650';
    if (edge) c = C.woodD;
    if (y === -T) c = C.woodL;
    if (y >= T - 3) c = C.woodD;
    if ((hash(plank, y, 3) < 0.07) && !edge) c = C.woodD;
    body.set(cx + x, cy + y, c);
  }
  // 못
  for (let x = -L + 1; x <= L; x += 4) { body.set(cx + x, cy - T + 2, '#e8d0a0'); body.set(cx + x, cy + T - 5, '#e8d0a0'); }
  // 밧줄 감긴 말뚝 (끝)
  [-L - 1, L + 1].forEach((px) => { for (let y = -T - 3; y <= T + 2; y++) { body.set(cx + px, cy + y, y < -T ? C.woodL : C.woodD); body.set(cx + px + (px > 0 ? 1 : -1), cy + y, '#5e3a1e'); } body.set(cx + px, cy - 2, '#e8dcb8'); body.set(cx + px, cy - 1, '#c8b890'); base.set(cx + px, cy + T + 2, 1); });
  body.outline(C.woodO);
  return { base, body, cx, cy, w, h, foot: T + 4 };
}

// ───────────────────────── 미역 · 소용돌이 · 파도 점프대 ─────────────────────────
function weedFrames(pads = []) {
  const w = 40, h = 30, cx = 20, cy = 15;
  const area = blob(w, h, cx, cy, 16, 10, 33, 0.14);
  return [0, 1].map((f) => {
    const g = new G(w, h);
    area.each((x, y, c) => { if (c) g.set(x, y, bay(x, y) < 0.55 ? '#147a86' : '#0f6d7f'); });
    const r = rng(77);
    for (let k = 0; k < 13; k++) {
      const x0 = cx + (r() - 0.5) * 26, y0 = cy + (r() - 0.5) * 14, len = 5 + r() * 5, ph = r() * TAU;
      for (let i = 0; i < len; i++) {
        const x = x0 + Math.sin(i * 0.7 + ph + f * 1.3) * 1.3, y = y0 - i * 0.8 + 3;
        g.set(x, y, i > len - 2 ? C.weedH : i % 2 ? C.weedL : C.weed);
        if (i < len - 2) g.set(x + 1, y, C.weedD);
      }
    }
    // 반짝 거품
    if (f) { g.set(cx - 6, cy - 3, C.foam2); g.set(cx + 7, cy + 2, C.foam2); } else { g.set(cx + 3, cy - 5, C.foam2); g.set(cx - 9, cy + 3, C.foam2); }
    // 연잎 (CC0) — 살짝 흔들림
    pads.forEach(([pg, px, py], i) => g.over(pg, px + ((i + f) % 2), py));
    return g;
  });
}
function whirlFrames() {
  const w = 48, h = 40, cx = 24, cy = 20, RX = 22, RY = 17;
  return [0, 1, 2, 3].map((f) => {
    const g = new G(w, h);
    g.each((x, y) => {
      const dx = (x - cx) / RX, dy = (y - cy) / RY; const d = Math.sqrt(dx * dx + dy * dy); if (d > 1) return null;
      const a = Math.atan2(dy, dx);
      const v = Math.sin(3 * a + d * 9 - f * Math.PI / 2);
      if (d < 0.13) return '#04324a';
      if (d < 0.26) return v > 0.5 ? C.d2 : '#06405c';
      if (d > 0.82 && bay(x, y) < (d - 0.82) / 0.18) return null;
      if (v > 0.82) return d > 0.45 ? C.foam : C.foam2;
      if (v > 0.45) return d > 0.5 ? C.sh2 : C.l2;
      if (v > -0.2) return d > 0.6 ? C.lite : C.mid;
      return d > 0.6 ? C.mid : C.deep;
    });
    return g;
  });
}
function rampFrames() {
  const w = 34, h = 16, cx = 17, cy = 8;
  return [0, 1].map((f) => {
    const g = new G(w, h);
    for (let x = -14; x <= 14; x++) {
      const k = 1 - (x / 15) ** 2; const hh = Math.round(4 * k + 1);
      for (let y = 0; y <= hh + 2; y++) {
        const c = y === 0 ? C.foam : y === 1 ? (hash(x, f) < 0.3 ? C.foam2 : C.foam) : y < hh ? C.sh2 : y === hh ? C.sh1 : '#0e6a8c';
        g.set(cx + x, cy - 3 + y, c);
      }
      // 뒤쪽(위) 밝은 물결
      if (Math.abs(x) < 12) g.set(cx + x, cy - 4, C.sh3);
      if (Math.abs(x) < 9 && hash(x, 3, f) < 0.5) g.set(cx + x, cy - 5, C.sh2);
    }
    // 물보라
    [[-10, -7], [-3, -8], [6, -7], [12, -6]].forEach(([x, y], i) => { if ((i + f) % 2 === 0) g.set(cx + x, cy + y, C.foam); });
    // 화살표 (점프대 표시)
    [[0, 2], [-1, 1], [1, 1], [-2, 0], [2, 0]].forEach(([x, y]) => g.set(cx + x, cy + y, C.gold));
    return g;
  });
}

// ───────────────────────── 문어 몬스터 (작게) ─────────────────────────
function tube(g, pts, w0, w1, light = false) {
  pts.forEach(([x, y], i) => {
    const t = i / (pts.length - 1); const rad = w0 + (w1 - w0) * t;
    g.disc(x, y, rad, (px, py, dx) => (dx > rad * 0.35 ? C.octoD : dx < -rad * 0.45 && light ? C.octoL : C.octo));
  });
  pts.forEach(([x, y], i) => { if (i % 4 === 2 && i < pts.length - 3) { const t = i / (pts.length - 1); const rad = w0 + (w1 - w0) * t; if (rad > 1.1) g.set(x - rad * 0.5, y + 0.5, C.octoS); } });
}
function arm(x0, y0, dirx, len, ph, curl) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const s = i / 16;
    let x = x0 + dirx * len * 0.55 * s + Math.sin(s * 3.2 + ph) * 1.3 * s;
    let y = y0 + len * s * 0.85;
    if (s > 0.68) { const q = (s - 0.68) / 0.32; x += curl * Math.sin(q * 2.6) * 2; y -= (1 - Math.cos(q * 2.6)) * 1.5; }
    pts.push([x, y]);
  }
  return pts;
}
const OCTO_W = 40, OCTO_H = 34, OCTO_CY = 11;
function octoFrames() {
  const w = OCTO_W, h = OCTO_H, cx = 20, cy = OCTO_CY;
  return [0, 1].map((f) => {
    const g = new G(w, h);
    // 다리 6개
    const legs = [[-8, -1.5, 10], [8, 1.5, 10], [-4.5, -0.8, 11], [4.5, 0.8, 11], [-1.5, -0.2, 10], [1.5, 0.2, 10]];
    legs.forEach(([ox, d, len], i) => tube(g, arm(cx + ox, cy + 6, d * 1.6, len, i + f * 1.6, d < 0 ? -1 : 1), 2.3, 0.8, i >= 4));
    // 머리
    g.disc(cx, cy, 9.6, (x, y, dx, dy) => {
      const li = -(dx * 0.6 + dy * 0.8) / 9.6 + (bay(x, y) - 0.5) * 0.18;
      return li > 0.6 ? C.octoH : li > 0.2 ? C.octoL : li > -0.45 ? C.octo : C.octoD;
    });
    for (let x = -9; x <= 9; x++) for (let y = 3; y <= 8; y++) if ((x / 9.3) ** 2 + ((y - 3) / 4.6) ** 2 < 1) g.set(cx + x, cy + y, x > 5 ? C.octoD : C.octo);
    // 점박이
    [[-4, -6], [2, -7], [5, -4]].forEach(([x, y]) => { g.set(cx + x, cy + y, C.octoP); g.set(cx + x + 1, cy + y, C.octoP); });
    // 눈 + 아래를 노려보는 눈동자 + 화난 눈썹
    [[-4, 1], [4, 1]].forEach(([ex, ey], k) => {
      g.disc(cx + ex, cy + ey, 2.4, C.white);
      const px = cx + ex + (k ? -1 : 0);
      g.set(px, cy + ey + 1, '#1c0c30'); g.set(px + 1, cy + ey + 1, '#1c0c30'); g.set(px, cy + ey + 2, '#1c0c30'); g.set(px + 1, cy + ey + 2, '#1c0c30');
      for (let i = 0; i < 4; i++) g.set(cx + ex + (k ? 2 - i : -2 + i) + (k ? 0 : 0), cy + ey - 4 + (i >= 2 ? 1 : 0), C.octoO);
    });
    // 볼터치 · 입 · 송곳니
    g.set(cx - 8, cy + 4, C.octoP); g.set(cx + 7, cy + 4, C.octoP); g.set(cx + 8, cy + 4, C.octoP); g.set(cx - 7, cy + 4, C.octoP);
    for (let x = -2; x <= 2; x++) g.set(cx + x, cy + 6, '#3a1250');
    g.set(cx - 1, cy + 7, C.white); g.set(cx + 1, cy + 7, C.white);
    g.outline(C.octoO);
    // 물보라 띠 (몸이 물에 반쯤 잠김)
    for (let x = -15; x <= 15; x++) {
      const y = cy + 14 + Math.round(Math.sin(x * 0.6 + f * 2) * 0.8);
      if (hash(x, f, 4) < 0.75) g.set(cx + x, y, C.foam);
      if (hash(x, f, 5) < 0.35) g.set(cx + x, y + 1, C.foam2);
    }
    [[-16, 11], [15, 10], [-12, 7], [12, 7]].forEach(([x, y], i) => { if ((i + f) % 2 === 0) g.set(cx + x, cy + y, C.foam); });
    return g;
  });
}
// 물에서 솟는 문어 다리 (장애물). 0 잔물결 1 끝만 2 반쯤 3·4 다 나옴
const TENT_W = 14, TENT_H = 22, TENT_BY = 18;
function tentFrames() {
  const w = TENT_W, h = TENT_H, bx = 7, by = TENT_BY;
  const ring = (g, big) => { for (let a = 0; a < TAU; a += 0.16) { const x = bx + Math.cos(a) * (big ? 5 : 3.5), y = by + Math.sin(a) * (big ? 2 : 1.5); g.set(x, y, hash(Math.round(a * 10), big, 2) < 0.75 ? C.foam : C.foam2); } };
  const t = (hgt, ph) => {
    const g = new G(w, h);
    for (let a = 0; a < TAU; a += 0.2) g.set(bx + Math.cos(a) * 3, by + Math.sin(a) * 1, C.sh2);
    if (hgt) {
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const s = i / 14; let x = bx + Math.sin(s * 2.4 + ph) * 1.3 * s, y = by - hgt * s;
        if (s > 0.7 && hgt > 8) { const q = (s - 0.7) / 0.3; x += Math.sin(q * 2.8) * 2.6; y += (1 - Math.cos(q * 2.8)) * 1.7; }
        pts.push([x, y]);
      }
      const p = new G(w, h); tube(p, pts, 2.2, 0.7, true); p.outline(C.octoO); g.over(p);
    }
    ring(g, hgt > 0);
    return g;
  };
  return [t(0, 0), t(3, 0), t(8, 0), t(14, 0), t(14, 0.9)];
}

// ───────────────────────── 서프보드 (방향 5개, 작게) ─────────────────────────
const BOARD = 20;
function boardFrames() {
  return HEAD.map((deg) => {
    const g = new G(BOARD, BOARD); const a = deg * Math.PI / 180; const ux = Math.sin(a), uy = Math.cos(a);
    const L = 8.6, Wd = 2.9, c0 = (BOARD - 1) / 2;
    g.each((x, y) => {
      const px = x - c0, py = y - c0; const u = px * ux + py * uy, v = px * uy - py * ux;
      const t = u / L; if (Math.abs(t) > 1) return null;
      const hw = Wd * Math.pow(1 - t * t, 0.5) * (t > 0 ? 1 - t * 0.25 : 1);
      if (Math.abs(v) > hw) return null;
      if (Math.abs(v) < 0.6 && t > -0.8) return t > 0.55 ? '#ff9a7a' : '#ff6b5f';
      if (v > hw - 1) return '#d6c4a4';
      return '#fff1dc';
    });
    g.outline('#203048');
    return g;
  });
}

// 내 몬스터 2:1 줄이기 — 2×2 칸마다 가장 많은 색, 테두리·눈 같은 어두운 점은 남김 (흐리게 안 섞음)
function shrinkMon(img, frame) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const x = cv.getContext('2d');
  x.drawImage(img, (frame % 12) * 64, Math.floor(frame / 12) * 64, 64, 64, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data;
  const px = (i, j) => { if (i < 0 || j < 0 || i > 63 || j > 63) return null; const k = (j * 64 + i) * 4; return d[k + 3] > 100 ? [d[k], d[k + 1], d[k + 2]] : null; };
  let x0 = 64, x1 = -1, y0 = 64, y1 = -1;
  for (let j = 0; j < 64; j++) for (let i = 0; i < 64; i++) if (px(i, j)) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
  if (x1 < 0) return new G(2, 2);
  const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  const hex = (c) => hex2(c[0], c[1], c[2], 255);
  let best = null;
  for (const oy of [0, 1]) for (const ox of [0, 1]) {
    const bx = x0 - ox, by = y0 - oy;
    const w = Math.ceil((x1 - bx + 1) / 2), h = Math.ceil((y1 - by + 1) / 2);
    const g = new G(w, h); let dark = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const b = [px(bx + i * 2, by + j * 2), px(bx + i * 2 + 1, by + j * 2), px(bx + i * 2, by + j * 2 + 1), px(bx + i * 2 + 1, by + j * 2 + 1)].filter(Boolean);
      if (b.length < 2) continue;
      const dk = b.filter((c) => lum(c) < 75).sort((p, q) => lum(p) - lum(q));
      let c;
      if (dk.length >= 2 || (dk.length === 1 && (b.length < 4 || lum(dk[0]) < 45))) { c = dk[0]; dark++; } // 눈·테두리 먹선은 1점이라도 남김
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

// ───────────────────────── 줍는 것 · HUD 아이콘 ─────────────────────────
const K = C.ink;
const HEART = ['.kk.kk.', 'krhkrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'];
const BOLT = ['...kkk', '..kyyk', '.kyyk.', 'kyyyyk', 'kkyyk.', '.kyk..', '.kk...'];
function coinFrames() {
  const ws = [3.5, 2.5, 0.8, 2.5];
  return ws.map((rw, f) => {
    const g = new G(10, 10);
    g.each((x, y) => { const dx = (x - 4.5) / rw, dy = (y - 4.5) / 3.6; const d = dx * dx + dy * dy; if (d > 1) return null; return d > 0.55 ? (x < 4.5 ? C.goldL : C.goldD) : f === 2 ? C.goldD : C.gold; });
    if (f === 0) { g.set(4, 3, C.goldL); g.set(4, 4, C.goldL); g.set(4, 5, C.goldD); }
    g.outline('#6a3c08');
    return g;
  });
}
const shine = (g, pts) => pts.forEach(([x, y]) => g.set(x, y, C.white));

// ═══════════════════════════ 게임 ═══════════════════════════
export default {
  id: 'surf',
  title: '몬스터 서핑',
  start(stage, api) {
    let dead = false, game = null, paused = false, endTimer = 0, ended = false;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    stage.style.touchAction = 'none';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;flex:none;touch-action:none;border:3px solid #182030;border-radius:6px;overflow:hidden;background:#0d6d91;image-rendering:pixelated;display:flex;align-items:center;justify-content:center;color:#fff;font:12px Galmuri11,monospace';
    wrap.textContent = '불러오는 중…';
    stage.append(wrap);
    const fit = () => {
      const box = stage.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
      const k0 = Math.min((box.width - 6) / GW, ((box.height || 9999) - 6) / GH);
      const k = Math.max(1 / dpr, Math.floor(k0 * dpr) / dpr);
      wrap.style.width = `${GW * k}px`; wrap.style.height = `${GH * k}px`;
      game?.scale?.refresh();
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(stage);
    const noScroll = (e) => e.preventDefault();
    stage.addEventListener('touchmove', noScroll, { passive: false });

    // 허브가 랭킹 시트를 열면 멈춤
    const onPause = () => { paused = true; try { game?.loop.sleep(); } catch { /* not ready */ } };
    const onResume = () => { paused = false; try { game?.loop.wake(); } catch { /* not ready */ } };
    stage.addEventListener('mg-pause', onPause);
    stage.addEventListener('mg-resume', onResume);

    let keyHandler = null;
    const onKey = (e) => keyHandler?.(e);
    window.addEventListener('keydown', onKey);

    const fontsReady = (document.fonts?.load ? Promise.all([document.fonts.load('12px Galmuri11'), document.fonts.load('bold 12px Galmuri11')]).catch(() => {}) : Promise.resolve());
    Promise.all([loadPhaser(), fontsReady]).then(([Phaser]) => {
      if (dead) return;
      wrap.textContent = '';
      game = new Phaser.Game({
        type: Phaser.AUTO, parent: wrap, width: GW, height: GH,
        pixelArt: true, roundPixels: true, antialias: false, backgroundColor: '#0d6d91', banner: false,
        audio: { noAudio: true }, input: { keyboard: false, gamepad: false }, disableContextMenu: true,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        callbacks: { postBoot: (g) => { if (dead) g.destroy(true); else if (paused) g.loop.sleep(); } },
        scene: { key: 'surf', preload() { this.load.spritesheet('mons', ATLAS_URL, { frameWidth: 64, frameHeight: 64 }); this.load.image('props', PROPS_URL); }, create() { setup(this, Phaser); }, update(t, d) { tick(d); } },
      });
      if (game.canvas) game.canvas.style.imageRendering = 'pixelated';
    }).catch(() => { if (!dead) wrap.textContent = '게임을 불러오지 못했어요'; });

    // ─────────── 장면 ───────────
    let tick = () => {};
    function setup(sc, Phaser) {
      // 텍스처 만들기
      addSheet(sc, 'sea', [seaGrid()]);
      addSheet(sc, 'caustic', [causticGrid()]);
      addSheet(sc, 'cloud', [cloudGrid()]);
      // CC0 그림 픽셀 읽기
      {
        const im = sc.textures.get('props').getSourceImage();
        const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
        const x = cv.getContext('2d'); x.drawImage(im, 0, 0);
        PROP_PX = { data: x.getImageData(0, 0, im.width, im.height).data, w: im.width };
      }
      const ART = {};
      const reg = (key, a, bodyFrames) => {
        addSheet(sc, `${key}_h`, haloFrames(a.base, a.hs || 1, a.sh || [2, 2]));
        addSheet(sc, key, bodyFrames || [a.body]);
        ART[key] = a;
      };
      // 섬 꾸미기: 모래 무늬 + 조약돌·조개·불가사리, 큰 섬엔 양동이·삽 (CC0 해변 그림)
      const sandT = sprite('sandTile');
      const decoOn = (body, g, x, y) => { let ok = true; g.each((i, j, c) => { if (c && ![C.sand, C.sandL].includes(body.get(x + i, y + j)) && !sandT.a.includes(body.get(x + i, y + j))) ok = false; }); if (ok) body.over(g, x, y); return ok; };
      const decorate = (big) => (body, cx, cy, rx, ry, r, palms) => {
        body.each((x, y, c) => (c === C.sand ? sandT.get(x % 16, y % 16) : undefined));
        const bits = ['pebbleS', 'shell1', 'shell3', 'star1', 'star2', 'pebbleL', 'shell2'];
        for (let i = 0; i < (big ? 4 : 2); i++) { const g = sprite(bits[Math.floor(r() * bits.length)]); for (let k = 0; k < 6; k++) if (decoOn(body, g, Math.round(cx + (r() - 0.5) * rx * 1.3 - g.w / 2), Math.round(cy + (r() - 0.3) * ry * 1.1 - g.h / 2))) break; }
        if (big) { const g = sprite(r() < 0.5 ? 'bucket' : 'bucketB'); for (let k = 0; k < 8; k++) if (decoOn(body, g, Math.round(cx - rx * 0.1 + (r() - 0.5) * rx * 0.8), Math.round(cy - 4 + (r() - 0.5) * ry * 0.5))) break; }
      };
      reg('isl0', islandArt(3, 15, 9, 1, decorate(false)));
      reg('isl1', islandArt(8, 22, 12, 2, decorate(true)));
      reg('isl2', islandArt(21, 12, 7, 0, decorate(false)));
      reg('isl3', islandArt(14, 26, 14, 2, decorate(true)));
      reg('rockS', Object.assign(propArt('rock3', 0.6, 7), { hs: 0.5 }));
      reg('rockM', Object.assign(propArt('rock1', 0.6, 8), { hs: 0.6 }));
      reg('rockM2', Object.assign(propArt('rock2', 0.6, 8), { hs: 0.6 }));
      reg('rockL', Object.assign(propArt('rockBig', 0.65, 10), { hs: 0.75 }));
      reg('log', Object.assign(propArt('log', 1, 7), { hs: 0.45, sh: [1, 2] }));
      reg('raft', Object.assign(propArt('raft', 1, 8), { hs: 0.5, sh: [1, 2] }));
      reg('barrel', Object.assign(propArt('barrel', 0.35, 7), { hs: 0.4, sh: [1, 1] }));
      reg('crate', Object.assign(propArt('crate', 0.4, 7), { hs: 0.4, sh: [1, 1] }));
      reg('pier', Object.assign(pierArt(), { hs: 0.55 }));
      const bu = buoyFrames(); reg('buoy', Object.assign(bu, { hs: 0.45, sh: [1, 1] }), bu.frames);
      addSheet(sc, 'weed', weedFrames([[sprite('pad3'), 5, 6], [sprite('pad2'), 24, 12], [sprite('pad2'), 13, 17]]));
      addSheet(sc, 'whirl', whirlFrames());
      addSheet(sc, 'ramp', rampFrames());
      addSheet(sc, 'octo', octoFrames());
      addSheet(sc, 'tent', tentFrames());
      addSheet(sc, 'board', boardFrames());
      addSheet(sc, 'coin', coinFrames());
      const hp = { k: K, r: C.red, h: '#ffb0b4' };
      addSheet(sc, 'heart', [pmap(HEART, hp), pmap(HEART, { k: K, r: '#3a5068', h: '#3a5068' })]);
      addSheet(sc, 'bolt', [pmap(BOLT, { k: K, y: C.gold }), pmap(BOLT, { k: K, y: '#3a5068' })]);
      const bigHeart = pmap(HEART, hp); const bh = new G(9, 8); bh.over(bigHeart, 1, 1); bh.outline(C.white);
      const bigBolt = new G(8, 9); bigBolt.over(pmap(BOLT, { k: K, y: C.gold }), 1, 1); bigBolt.outline(C.white);
      addSheet(sc, 'pheart', [bh]); addSheet(sc, 'pbolt', [bigBolt]);
      // 반짝이 (작은 빛 / 긴 물결)
      const sp = [0, 1, 2].map((f) => { const g = new G(9, 3); if (f === 0) g.set(4, 1, '#bdf3ec'); if (f === 1) { for (let x = 3; x <= 5; x++) g.set(x, 1, '#d8fbf4'); } if (f === 2) { for (let x = 2; x <= 6; x++) g.set(x, 1, x === 4 ? C.white : '#d8fbf4'); g.set(4, 0, '#bdf3ec'); } return g; });
      const cr = [0, 1, 2].map((f) => { const g = new G(9, 3); const n = [1, 3, 4][f]; for (let x = 4 - n; x <= 4 + n; x++) { g.set(x, 1 - (Math.abs(x - 4) < n - 1 ? 1 : 0), f === 2 && x === 4 ? C.white : '#9fe6df'); if (Math.abs(x - 4) < n) g.set(x, 2, '#0f7898'); } return g; });
      addSheet(sc, 'spark', [...sp, ...cr]);

      // 내 몬스터: 몸 부분만 2:1 로 깔끔하게 줄임 (임의 배율 금지)
      const dex = Math.max(1, Number(api.partner?.()) || 1);
      let meG;
      try { meG = shrinkMon(sc.textures.get('mons').getSourceImage(), dex - 1); } catch { meG = new G(12, 14); meG.disc(6, 7, 5, C.octoL); meG.outline(C.ink); }
      addSheet(sc, 'me', [meG]);
      const footY = meG.h;

      // 배경 층
      const sea = sc.add.tileSprite(0, 0, GW, GH, 'sea').setOrigin(0).setScrollFactor(0).setDepth(-1000);
      const caus = sc.add.tileSprite(0, 0, GW, GH, 'caustic').setOrigin(0).setScrollFactor(0).setDepth(-990).setAlpha(0.2);
      const cloud = sc.add.tileSprite(0, 0, GW, GH, 'cloud').setOrigin(0).setScrollFactor(0).setDepth(9000).setAlpha(0.13);
      const sparks = [];
      for (let i = 0; i < 30; i++) sparks.push({ img: sc.add.image(0, 0, 'spark', 0).setDepth(-980).setVisible(false), t: -Math.random() * 2, kind: i % 3 === 0 ? 1 : 0, x: 0, y: 0 });
      const wake = sc.add.graphics().setDepth(-400);
      const fxG = sc.add.graphics().setDepth(50000);
      const board = sc.add.image(0, 0, 'board', 2);
      const mon = sc.add.image(0, 0, 'me', 0).setOrigin(0.5, 1);
      const octo = sc.add.image(0, 0, 'octo', 0).setOrigin(0.5, OCTO_CY / OCTO_H).setVisible(false);
      const cam = sc.cameras.main;

      // HUD
      const hud = sc.add.graphics().setScrollFactor(0).setDepth(1e6);
      const hearts = [0, 1, 2].map((i) => sc.add.image(4 + i * 9, 4, 'heart', 0).setOrigin(0).setScrollFactor(0).setDepth(1e6 + 1));
      const bolts = [0, 1, 2].map((i) => sc.add.image(GW - 26 + i * 8, 4, 'bolt', 0).setOrigin(0).setScrollFactor(0).setDepth(1e6 + 1));
      const TXT = (x, y, s, size = 12, bold = true, col = '#ffffff') => sc.add.text(x, y, s, { fontFamily: 'Galmuri11', fontSize: `${size}px`, fontStyle: bold ? 'bold' : 'normal', color: col, padding: { top: 2, bottom: 1 } })
        .setScrollFactor(0).setDepth(1e6 + 2).setShadow(1, 1, '#06283a', 0, false, true);
      const tM = TXT(GW / 2, 1, '0m').setOrigin(0.5, 0);
      const btnIcon = sc.add.image(GW - 18, GH - 18, 'pbolt', 0).setScrollFactor(0).setDepth(1e6 + 1);
      const tBan = TXT(GW / 2, 208, '').setOrigin(0.5, 0.5).setDepth(1e6 + 3);
      const tTitle = TXT(GW / 2, 24, '몬스터 서핑').setOrigin(0.5, 0).setScale(2).setColor('#fff6b0').setShadow(1, 1, '#0a3a52', 0, false, true);
      const tSub = TXT(GW / 2, 56, '문어를 피해 멀리멀리!', 12, false, '#d8fbf4').setOrigin(0.5, 0);
      const help = ['끌거나 좌우를 눌러', '방향 바꾸기', '두 번 톡 / 번개 = 부스트', '하트 3개, 다 잃으면 끝']
        .map((s, i) => TXT(GW / 2, 178 + i * 14, s, 12, false, i === 2 ? '#fff3a0' : '#ffffff').setOrigin(0.5, 0));
      const tTap = TXT(GW / 2, 246, '탭해서 시작').setOrigin(0.5, 0);
      const tOver = TXT(GW / 2, 184, '').setOrigin(0.5, 0).setDepth(1e6 + 3);
      const tOverM = TXT(GW / 2, 204, '').setOrigin(0.5, 0).setScale(2).setColor('#fff6b0').setDepth(1e6 + 3);
      const readyOcto = sc.add.image(GW - 14, GH - 8, 'octo', 0).setScrollFactor(0).setDepth(1e5).setOrigin(0.5, 0.5);
      const readyOn = (v) => { [tTitle, tSub, tTap, readyOcto, ...help].forEach((o) => o.setVisible(v)); [tM, btnIcon, ...hearts, ...bolts].forEach((o) => o.setVisible(!v)); };
      readyOn(true);

      // ─────────── 상태 ───────────
      let mode = 'ready', T = 0, ms = 0, overT = 0, reason = '';
      const P = { x: 0, y: 0, head: 2, ang: 0, spd: 0, maxY: 0, hearts: 3, bolts: 1, coins: 0, inv: 0, boost: 0, jump: 0, weed: 0, slow: 0 };
      let camOff = 128;
      const objs = []; const chunks = new Set(); const parts = []; const trail = [];
      const O = { st: 'off', x: 0, y: 0, next: 500, tent: 3 };
      let banner = { s: '', t: 0, col: 0 };
      const metres = () => Math.max(0, Math.floor(P.maxY / PX_PER_M));
      const base = () => Math.min(MAX_BASE, 100 + metres() * 0.045);
      const show = (s, col, t = 2) => { banner = { s, t, col }; };

      // ─────────── 만들기 · 지우기 ───────────
      const CH = 128;
      // 부딪힘 원 = 보이는 몸의 약 65% (귀퉁이·끝은 봐줌). sp = 놓을 때 서로 띄우는 반지름
      const SPEC = {
        rockS: { sp: 6, hits: [[0, -1, 3.5]] }, rockM: { sp: 8, hits: [[0, -2, 5]] }, rockM2: { sp: 8, hits: [[0, -2, 5]] }, rockL: { sp: 13, hits: [[-4, -2, 6], [5, -1, 5]] },
        isl0: { sp: 18, hits: [[-6, 0, 6], [0, 0, 6.5], [6, 0, 6]] }, isl2: { sp: 14, hits: [[-4, 0, 5], [4, 0, 5]] },
        isl1: { sp: 25, hits: [[-11, 0, 8], [0, 0, 8.5], [11, 0, 8]] }, isl3: { sp: 30, hits: [[-14, 0, 9], [0, 0, 10], [14, 0, 9]] },
        log: { sp: 22, hits: [[-14, 0, 4.5], [-5, 0, 4.5], [5, 0, 4.5], [14, 0, 4.5]] },
        raft: { sp: 16, hits: [[-6, 0, 7], [6, 0, 7]] }, barrel: { sp: 7, hits: [[0, -4, 5]] }, crate: { sp: 7, hits: [[0, -3, 5]] },
        buoy: { sp: 6, hits: [[0, -2, 3]] },
        pier: { sp: 34, hits: [[-22, -1, 4.5], [-11, -1, 4.5], [0, -1, 4.5], [11, -1, 4.5], [22, -1, 4.5], [29, -1, 4], [-29, -1, 4]] },
        weed: { sp: 17 }, whirl: { sp: 24 }, ramp: { sp: 16 }, tent: { sp: 6, hits: [[0, -3, 3]] }, coin: { sp: 4 }, heart: { sp: 5 }, bolt: { sp: 5 },
      };
      const make = (t, x, y) => {
        const o = { t, x, y, ph: Math.random() * 10, hit: false, age: 0, ...SPEC[t] };
        if (ART[t]) {
          const a = ART[t];
          o.halo = sc.add.image(x, y, `${t}_h`, 0).setOrigin(a.cx / a.w, a.cy / a.h).setDepth(-500);
          o.body = sc.add.image(x, y, t, 0).setOrigin(a.cx / a.w, a.cy / a.h).setDepth(y + a.foot);
        } else if (t === 'weed' || t === 'whirl' || t === 'ramp') {
          o.body = sc.add.image(x, y, t, 0).setDepth(t === 'ramp' ? -440 : -450);
        } else if (t === 'tent') {
          o.body = sc.add.image(x, y, 'tent', 0).setOrigin(0.5, TENT_BY / TENT_H).setDepth(y + 2);
        } else {
          o.body = sc.add.image(x, y, t === 'coin' ? 'coin' : t === 'heart' ? 'pheart' : 'pbolt', 0).setDepth(y + 1);
        }
        objs.push(o); return o;
      };
      const kill = (o) => { o.body?.destroy(); o.halo?.destroy(); o.gone = true; };
      const free = (x, y, sp, gap) => objs.every((o) => o.gone || Math.hypot(o.x - x, o.y - y) > o.sp + sp + gap);
      const pick = (m, r) => {
        const w = [['rockS', 1.8], ['rockM', 0.9], ['rockM2', 0.8], ['rockL', m > 120 ? 1 : 0.3], ['barrel', 0.5], ['crate', 0.5], ['raft', m > 150 ? 0.5 : 0], ['isl0', 0.8], ['isl2', 0.7], ['isl1', m > 150 ? 0.7 : 0.2], ['isl3', m > 400 ? 0.5 : 0],
          ['log', m > 60 ? 1.1 : 0], ['buoy', 0.7], ['weed', m > 40 ? 1 : 0], ['pier', m > 220 ? 0.6 : 0], ['whirl', m > 320 ? 0.6 : 0], ['ramp', m > 90 ? 0.55 : 0]];
        let s = w.reduce((a, b) => a + b[1], 0) * r;
        for (const [t, k] of w) { s -= k; if (s <= 0) return t; }
        return 'rockS';
      };
      const genChunk = (cx, cy) => {
        const key = `${cx},${cy}`; if (chunks.has(key)) return; chunks.add(key);
        const x0 = cx * CH, y0 = cy * CH, m = Math.max(0, y0 / PX_PER_M);
        const n = Math.floor(1.6 + Math.min(3, m / 380) + Math.random() * 1.6);
        for (let i = 0; i < n; i++) {
          const t = pick(m, Math.random());
          for (let k = 0; k < 10; k++) {
            const x = x0 + 8 + Math.random() * (CH - 16), y = y0 + 8 + Math.random() * (CH - 16);
            if (y < 230) break;
            if (free(x, y, SPEC[t].sp, 15)) { make(t, x, y); break; }
          }
        }
        // 동전 줄
        if (Math.random() < 0.5 && y0 + CH > 120) {
          const x = x0 + 20 + Math.random() * (CH - 40), y = y0 + 10 + Math.random() * (CH - 60);
          const dx = [-6, 0, 0, 6][Math.floor(Math.random() * 4)], n2 = 3 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n2; i++) { const px = x + dx * i, py = y + 12 * i; if (py > 100 && free(px, py, 4, 3)) make('coin', px, py); }
        }
        const extra = Math.random();
        if (y0 > 300 && extra < 0.05) { const x = x0 + 16 + Math.random() * (CH - 32), y = y0 + 16 + Math.random() * (CH - 32); if (free(x, y, 5, 8)) make('heart', x, y); }
        else if (y0 > 200 && extra < 0.12) { const x = x0 + 16 + Math.random() * (CH - 32), y = y0 + 16 + Math.random() * (CH - 32); if (free(x, y, 5, 8)) make('bolt', x, y); }
      };

      // ─────────── 효과 ───────────
      const splash = (x, y, n, sp = 50, cols = [C.foam, C.foam2, C.sh3]) => {
        for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (0.4 + Math.random() * 0.8); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 20, z: 0, life: 0.35 + Math.random() * 0.4, c: cols[i % cols.length] }); }
      };
      const hurt = (why) => {
        if (P.inv > 0 || P.boost > 0 || P.jump > 0 || mode !== 'play') return false;
        P.hearts--; P.inv = 1.6; P.spd *= 0.3; P.slow = 0.6;
        api.sfx.hit?.(); splash(P.x, P.y, 14, 60);
        if (!reduce) cam.shake(160, 0.02);
        if (P.hearts <= 0) gameOver('wave');
        return true;
      };
      const useBoost = () => {
        if (mode !== 'play' || P.bolts <= 0 || P.boost > 0) { if (mode === 'play' && P.bolts <= 0) api.sfx.error?.(); return; }
        P.bolts--; P.boost = BOOST_T; api.sfx.statUp?.(); splash(P.x, P.y, 10, 40, [C.goldL, C.white]);
      };
      const gameOver = (why) => {
        if (mode === 'over') return;
        mode = 'over'; overT = 0; reason = why;
        api.sfx.faint?.();
        splash(P.x, P.y, 24, 70);
        const sc2 = Math.min(metres(), Math.floor(ms / 1000 * 38) + 40);
        const msOut = Math.max(1000, Math.round(ms));
        endTimer = setTimeout(() => { if (!ended && !dead) { ended = true; api.end(sc2, msOut); } }, 1200);
      };
      const begin = () => {
        mode = 'play'; ms = 0; P.spd = 60; api.sfx.select?.(); readyOn(false); splash(P.x, P.y, 10, 40);
      };

      // ─────────── 입력 ───────────
      let down = null, lastTap = null;
      const setHead = (h) => { const n = clamp(h, 0, 4); if (n !== P.head) { P.head = n; api.sfx.blip?.(); splash(P.x, P.y + 3, 3, 30); } };
      sc.input.on('pointerdown', (p) => {
        if (paused) return;
        if (mode === 'ready') { begin(); return; }
        if (mode !== 'play') return;
        if (Math.hypot(p.x - (GW - 18), p.y - (GH - 18)) < 15) { useBoost(); down = null; return; }
        down = { x: p.x, h0: P.head, moved: false };
      });
      sc.input.on('pointermove', (p) => {
        if (!down || paused || mode !== 'play') return;
        const dx = p.x - down.x; if (Math.abs(dx) > 5) down.moved = true;
        if (down.moved) setHead(down.h0 + Math.round(dx / 12));
      });
      const up = (p) => {
        if (!down || paused || mode !== 'play') { down = null; return; }
        if (!down.moved) {
          const now = performance.now();
          if (lastTap && now - lastTap.t < 300 && Math.abs(p.x - lastTap.x) < 30) { P.head = lastTap.h0; lastTap = null; useBoost(); }
          else { lastTap = { t: now, x: p.x, h0: P.head }; setHead(P.head + (p.x < GW / 2 ? -1 : 1)); }
        }
        down = null;
      };
      sc.input.on('pointerup', up); sc.input.on('pointerupoutside', up);
      keyHandler = (e) => {
        if (paused || dead) return;
        const k = e.key;
        const ours = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter', 'a', 'd', 's', 'w'].includes(k);
        if (!ours) return;
        e.preventDefault();
        if (mode === 'ready') { begin(); return; }
        if (mode !== 'play') return;
        if (k === 'ArrowLeft' || k === 'a') setHead(P.head - 1);
        else if (k === 'ArrowRight' || k === 'd') setHead(P.head + 1);
        else if (k === 'ArrowDown' || k === 's') setHead(2);
        else useBoost();
      };

      // ─────────── 한 걸음 ───────────
      const step = (dt) => {
        ms += dt * 1000;
        const m = metres();
        // 속도
        let target = base();
        if (P.boost > 0) target *= BOOST_K;
        if (P.weed > 0) target *= 0.55;
        P.spd += (target - P.spd) * Math.min(1, dt * (P.slow > 0 ? 1.2 : 3));
        const want = HEAD[P.head];
        const da = want - P.ang; P.ang += Math.sign(da) * Math.min(Math.abs(da), 420 * dt);
        const a = P.ang * Math.PI / 180;
        let vx = Math.sin(a) * P.spd, vy = Math.cos(a) * P.spd;
        // 소용돌이 끌림
        for (const o of objs) {
          if (o.gone || o.t !== 'whirl' || P.jump > 0) continue;
          const dx = o.x - P.x, dy = o.y - P.y, d = Math.hypot(dx, dy);
          if (d < 34) {
            const k = (1 - d / 34) * 95; vx += (dx / d) * k + (-dy / d) * k * 0.6; vy += (dy / d) * k * 0.5 + (dx / d) * k * 0.6;
            if (d < 6 && !o.hit) { if (hurt('whirl')) { o.hit = true; P.y += 14; } }
          }
        }
        P.x += vx * dt; P.y += Math.max(vy, 10) * dt;
        P.maxY = Math.max(P.maxY, P.y);
        P.inv = Math.max(0, P.inv - dt); P.boost = Math.max(0, P.boost - dt); P.jump = Math.max(0, P.jump - dt);
        P.weed = Math.max(0, P.weed - dt); P.slow = Math.max(0, P.slow - dt);

        // 만나는 것들
        for (const o of objs) {
          if (o.gone) continue;
          const dx = P.x - o.x, dy = P.y - o.y;
          if (Math.abs(dy) > 50 || Math.abs(dx) > 60) continue;
          if (o.t === 'coin' || o.t === 'heart' || o.t === 'bolt') {
            if (Math.hypot(dx, dy + 2) < 7) {
              kill(o); splash(o.x, o.y, 5, 30, [C.goldL, C.white]);
              if (o.t === 'coin') { P.coins++; api.sfx.blip?.(); if (P.coins % 10 === 0 && P.bolts < 3) { P.bolts++; show('부스트 +1', 1, 1.2); api.sfx.correct?.(); } }
              else if (o.t === 'heart') { if (P.hearts < 3) P.hearts++; show('하트 +1', 2, 1.2); api.sfx.correct?.(); }
              else { if (P.bolts < 3) P.bolts++; show('부스트 +1', 1, 1.2); api.sfx.correct?.(); }
            }
            continue;
          }
          if (o.t === 'weed') { if ((dx / 15) ** 2 + (dy / 9) ** 2 < 1 && P.jump <= 0) { if (P.weed <= 0) api.sfx.statDown?.(); P.weed = 0.35; } continue; }
          if (o.t === 'ramp') { if (Math.abs(dx) < 14 && Math.abs(dy) < 5 && P.jump <= 0) { P.jump = 0.8; api.sfx.ballThrow?.(); splash(P.x, P.y, 8, 40); } continue; }
          if (o.t === 'whirl') continue;
          if (o.t === 'tent' && !(o.age > 0.75 && o.age < 2.9)) continue;
          if (o.hit) continue;
          for (const [hx, hy, r] of o.hits) {
            if (Math.hypot(dx - hx, dy - hy) < r + PR) {
              if (P.boost > 0) { o.hit = true; splash(P.x, P.y, 6, 40); break; }
              if (hurt(o.t)) { o.hit = true; P.x += Math.sign(dx - hx || 1) * 3; }
              break;
            }
          }
          if (mode !== 'play') return;
        }

        // 문어
        if (O.st === 'off' && m >= O.next) {
          O.st = 'enter'; O.y = P.y - 190; O.x = P.x; O.tent = 2.5;
          show('문어 몬스터가 쫓아온다!', 3, 2.6); api.sfx.wrong?.();
        }
        if (O.st === 'enter' || O.st === 'chase') {
          const ratio = 0.9 + Math.min(0.07, (m - 500) / 9000);
          const os = O.st === 'enter' ? base() + 75 : base() * ratio;
          O.y = Math.min(O.y + os * dt, P.y - 7); const lat = base() * 1.05 * dt; O.x += clamp(P.x - O.x, -lat, lat);
          const gap = P.y - O.y;
          if (O.st === 'enter' && gap <= 78) O.st = 'chase';
          if (gap < 11 && Math.abs(P.x - O.x) < 10 && P.jump <= 0 && P.boost <= 0) { O.y = P.y - 9; gameOver('octo'); return; }
          if (O.st === 'chase' && gap > 215) { O.st = 'off'; O.next = m + 330 + Math.floor(Math.random() * 220); show('문어를 따돌렸다!', 2, 1.8); api.sfx.correct?.(); }
          O.tent -= dt;
          if (O.st === 'chase' && O.tent <= 0) {
            O.tent = Math.max(1.4, 3.4 - m / 2000) * (0.8 + Math.random() * 0.4);
            const tx = P.x + vx * 1.0 + (Math.random() - 0.5) * 14, ty = P.y + 150;
            if (free(tx, ty, 6, 4)) make('tent', tx, ty);
          }
        }
      };

      // ─────────── 그리기 ───────────
      const draw = (dt) => {
        // 카메라
        const camX = Math.round(P.x - GW / 2), camY = Math.round(P.y - camOff);
        cam.setScroll(camX, camY);
        sea.setTilePosition(camX, camY);
        caus.setTilePosition(Math.round(camX + Math.sin(T * 0.4) * 9), Math.round(camY - T * 5));
        cloud.setTilePosition(Math.round(camX * 1 - T * 6), Math.round(camY * 1 - T * 3));
        // 새 구역
        for (let cy = Math.floor(camY / CH); cy <= Math.floor((camY + GH + CH) / CH); cy++) for (let cx = Math.floor((camX - CH) / CH); cx <= Math.floor((camX + GW + CH) / CH); cx++) if (mode !== 'ready' || cy * CH > camY + GH) genChunk(cx, cy);
        // 지난 것 지우기 + 움직임
        for (let i = objs.length - 1; i >= 0; i--) {
          const o = objs[i];
          if (!o.gone && (o.y < camY - 90 || (o.t === 'tent' && o.age > 3.3))) kill(o);
          if (o.gone) { objs.splice(i, 1); continue; }
          o.age += dt;
          const f2 = Math.floor(T / 0.42 + o.ph) % 2;
          o.halo?.setFrame(f2);
          if (o.t === 'buoy') o.body.setFrame(Math.floor(T / 0.5 + o.ph) % 2);
          else if (o.t === 'weed' || o.t === 'ramp') o.body.setFrame(f2);
          else if (o.t === 'whirl') o.body.setFrame(Math.floor(T / 0.13) % 4);
          else if (o.t === 'coin') { o.body.setFrame(Math.floor(T / 0.13 + o.ph) % 4); o.body.y = o.y + Math.round(Math.sin(T * 4 + o.ph)); }
          else if (o.t === 'heart' || o.t === 'bolt') o.body.y = o.y + Math.round(Math.sin(T * 4 + o.ph) * 1.5);
          else if (o.t === 'tent') { const a = o.age; o.body.setFrame(a < 0.55 ? 0 : a < 0.68 ? 1 : a < 0.8 ? 2 : a < 2.9 ? 3 + (Math.floor(a / 0.3) % 2) : a < 3.05 ? 2 : a < 3.2 ? 1 : 0); }
        }
        // 반짝이
        for (const s of sparks) {
          s.t += dt;
          if (s.t > 1.3 || s.y < camY - 4) { s.t = -Math.random() * 1.5; s.x = camX + Math.random() * GW; s.y = camY + Math.random() * GH; }
          if (s.t < 0) { s.img.setVisible(false); continue; }
          const seq = [0, 1, 2, 2, 1, 0]; const f = seq[Math.min(5, Math.floor(s.t / 1.3 * 6))];
          s.img.setVisible(true).setFrame(f + s.kind * 3).setPosition(Math.round(s.x), Math.round(s.y));
        }
        // 물결 자국 (보드 뒤)
        if (mode !== 'ready') {
          const a = P.ang * Math.PI / 180;
          if (P.jump <= 0 && mode === 'play') trail.push({ x: P.x - Math.sin(a) * 8, y: P.y - Math.cos(a) * 8, a, age: 0, k: Math.floor(Math.random() * 1e6) });
        }
        wake.clear();
        for (let i = trail.length - 1; i >= 0; i--) {
          const p = trail[i]; p.age += dt; if (p.age > 0.8) { trail.splice(i, 1); continue; }
          const s = 1.5 + p.age * 12 + (P.boost > 0 ? 1.5 : 0), nx = Math.cos(p.a), ny = -Math.sin(p.a);
          const keep = 1 - p.age * 0.9; // 오래될수록 거품이 흩어짐
          // 가운데 밝은 물길
          if (p.age < 0.5) { wake.fillStyle(0xb6f4df, 0.55 * (1 - p.age * 2)); wake.fillRect(Math.round(p.x - nx), Math.round(p.y - ny), 2, 1); }
          [1, -1].forEach((sd, j) => {
            const jx = (hash(p.k, j) - 0.5) * 2 * p.age * 3;
            if (hash(p.k, j, 7) > keep) return;
            const col = p.age < 0.18 ? 0xffffff : p.age < 0.4 ? 0xdcfbf4 : 0xa6efdf;
            wake.fillStyle(col, p.age < 0.5 ? 1 : 0.75);
            wake.fillRect(Math.round(p.x + sd * nx * s + jx), Math.round(p.y + sd * ny * s), p.age < 0.3 ? 2 : 1, 1);
            if (p.age < 0.4 && hash(p.k, j, 3) < 0.5) { wake.fillStyle(0xc8f6ec, 0.8); wake.fillRect(Math.round(p.x + sd * nx * s * 0.5), Math.round(p.y + sd * ny * s * 0.5), 1, 1); }
          });
        }
        // 보드 그림자 · 점프 그림자
        if (P.jump > 0) { wake.fillStyle(0x06405c, 0.45); wake.fillEllipse(Math.round(P.x), Math.round(P.y + 1), 10, 4); }
        // 내 몬스터
        const jh = P.jump > 0 ? Math.round(Math.sin(Math.PI * (1 - P.jump / 0.8)) * 10) : 0;
        const bob = mode === 'ready' ? Math.round(Math.sin(T * 3) * 1.5) : Math.round(Math.sin(T * 7)) * (P.jump > 0 ? 0 : 1);
        let sink = 0;
        if (mode === 'over') sink = Math.min(10, overT * 14);
        const near = HEAD.reduce((b, h, i) => (Math.abs(h - P.ang) < Math.abs(HEAD[b] - P.ang) ? i : b), 2);
        board.setFrame(near).setPosition(Math.round(P.x), Math.round(P.y - jh + bob * 0.5)).setDepth(P.y + 3);
        const ar = P.ang * Math.PI / 180;
        mon.setPosition(Math.round(P.x - Math.sin(ar) * 2.5), Math.round(P.y - Math.cos(ar) * 2.5 + 1 - jh + bob + sink)).setDepth(P.y + 4).setFlipX(P.ang < -10);
        const blink = P.inv > 0 && Math.floor(T * 14) % 2 === 0;
        const vis = !(mode === 'over' && (reason === 'octo' ? overT > 0.25 : overT > 0.7));
        board.setVisible(vis && !blink); mon.setVisible(vis && !blink);
        mon.setCrop(0, 0, meG.w, Math.max(0, footY - sink));
        if (P.boost > 0) mon.setTint(Math.floor(T * 12) % 2 ? 0xfff2a0 : 0xffffff); else mon.clearTint();
        // 문어
        if (O.st === 'enter' || O.st === 'chase' || (mode === 'over' && reason === 'octo')) {
          octo.setVisible(true).setFrame(Math.floor(T / 0.3) % 2).setPosition(Math.round(O.x), Math.round(O.y + Math.sin(T * 3) * 1.5)).setDepth(O.y + 16);
        } else octo.setVisible(false);
        // 물보라
        fxG.clear();
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt;
          fxG.fillStyle(hexN(p.c), 1); fxG.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
        }
        if (P.boost > 0 && mode === 'play') { // 속도선
          fxG.fillStyle(0xffffff, 0.8);
          for (let i = 0; i < 4; i++) { const x = Math.round(P.x + (hash(i, Math.floor(T * 20)) - 0.5) * 18), y = Math.round(P.y - 10 - hash(i, Math.floor(T * 20), 2) * 20); fxG.fillRect(x, y, 1, 4); }
        }
        drawHud();
      };

      const drawHud = () => {
        hud.clear();
        if (mode !== 'ready') {
          hud.fillStyle(0x04314a, 0.62); hud.fillRect(0, 0, GW, 15);
          hud.fillStyle(0x7fe0dc, 0.5); hud.fillRect(0, 15, GW, 1);
          hearts.forEach((h, i) => h.setFrame(i < P.hearts ? 0 : 1));
          bolts.forEach((b, i) => b.setFrame(i < P.bolts ? 0 : 1));
          // 동전 10개 → 부스트 (작은 막대)
          hud.fillStyle(0x0a2638, 1); hud.fillRect(GW - 26, 12, 22, 2);
          hud.fillStyle(0xffd23f, 1); hud.fillRect(GW - 26, 12, Math.round(22 * ((P.coins % 10) / 10)), 2);
          tM.setText(`${mode === 'over' ? metres() : metres()}m`);
          // 부스트 단추
          const on = P.bolts > 0 && mode === 'play';
          hud.fillStyle(0x04314a, on ? 0.7 : 0.4); hud.fillCircle(GW - 18, GH - 18, 12);
          hud.lineStyle(1, on ? 0xffd23f : 0x6a8aa0, 1); hud.strokeCircle(GW - 18, GH - 18, 12);
          if (P.boost > 0) { hud.lineStyle(2, 0xfff4a8, 1); hud.beginPath(); hud.arc(GW - 18, GH - 18, 14, -Math.PI / 2, -Math.PI / 2 + TAU * (P.boost / BOOST_T)); hud.strokePath(); }
          btnIcon.setAlpha(on ? 1 : 0.45);
          // 화면 밖 문어 표시
          if ((O.st === 'chase' || O.st === 'enter') && O.y < cam.scrollY - 6) {
            const ix = clamp(Math.round(O.x - cam.scrollX), 8, GW - 8);
            const fl = Math.floor(T * 6) % 2;
            hud.fillStyle(fl ? 0xff86c8 : 0x9b4fd2, 1);
            hud.fillTriangle(ix - 5, 18, ix + 5, 18, ix, 24);
            hud.fillStyle(0x2a1146, 1); hud.fillRect(ix - 1, 18, 2, 2);
          }
        } else {
          hud.fillStyle(0x04314a, 0.55); hud.fillRoundedRect(8, 18, GW - 16, 58, 6);
          hud.fillStyle(0x04314a, 0.55); hud.fillRoundedRect(6, 172, GW - 12, 64, 6);
          tTap.setVisible(Math.floor(T * 2) % 2 === 0);
          readyOcto.setFrame(Math.floor(T / 0.4) % 2).setY(GH - 6 + Math.round(Math.sin(T * 1.5) * 2));
        }
        // 알림 띠
        if (banner.t > 0) {
          const fl = !reduce && banner.col === 3 && Math.floor(T * 5) % 2;
          const col = banner.col === 3 ? (fl ? 0xd23c96 : 0x9b2f86) : banner.col === 1 ? 0x8a5a00 : 0x0a6a5a;
          tBan.setText(banner.s).setVisible(true);
          const bw = Math.min(GW - 6, tBan.width + 14);
          hud.fillStyle(col, 0.88); hud.fillRoundedRect(Math.round(GW / 2 - bw / 2), 198, Math.round(bw), 20, 5);
          hud.lineStyle(1, 0xffffff, 0.8); hud.strokeRoundedRect(Math.round(GW / 2 - bw / 2), 198, Math.round(bw), 20, 5);
        } else tBan.setVisible(false);
        // 끝 화면
        if (mode === 'over' && overT > 0.35) {
          hud.fillStyle(0x04314a, 0.8); hud.fillRoundedRect(10, 176, GW - 20, 64, 8);
          hud.lineStyle(1, 0xffffff, 0.7); hud.strokeRoundedRect(10, 176, GW - 20, 64, 8);
          tOver.setText(reason === 'octo' ? '문어에게 잡혔다!' : '파도에 휩쓸렸다!').setVisible(true).setColor(reason === 'octo' ? '#ffb0e0' : '#bdf3ec');
          tOverM.setText(`${metres()}m`).setVisible(true);
          tBan.setVisible(false);
        } else { tOver.setVisible(false); tOverM.setVisible(false); }
      };

      tick = (deltaMs) => {
        if (dead) return;
        const dt = Math.min(deltaMs, 100) / 1000; T += dt;
        if (mode === 'play') { step(dt); camOff += ((O.st === 'chase' || O.st === 'enter' ? PY + 34 : PY) - camOff) * Math.min(1, dt * 2); }
        else if (mode === 'over') {
          overT += dt;
          if (reason === 'octo') { O.x += (P.x - O.x) * Math.min(1, dt * 6); O.y += (P.y - 7 - O.y) * Math.min(1, dt * 6); }
        }
        if (banner.t > 0) banner.t -= dt;
        draw(dt);
      };

      // 시험용 엿보기 (게임 진행에는 안 씀)
      stage.surfDebug = () => ({ mode, m: metres(), ms: Math.round(ms), hearts: P.hearts, inv: +P.inv.toFixed(2), bolts: P.bolts, coins: P.coins, octo: O.st, gap: Math.round(P.y - O.y), x: Math.round(P.x), head: P.head, objs: objs.length });
      if (location.pathname.endsWith('/.dev-mg.html')) {
        stage.surfCheat = (o) => {
          Object.assign(P, o.P || {}, o.y != null ? { y: o.y, maxY: o.y } : {});
          if (o.clear) { objs.forEach(kill); for (let cy = Math.floor((P.y - 200) / CH); cy < Math.floor((P.y + 2000) / CH); cy++) for (let cx = -12; cx < 12; cx++) chunks.add(`${cx},${cy}`); }
          if (o.spawn) { const [t, dx, dy] = o.spawn; make(t, P.x + dx, P.y + dy); }
          if (o.noOcto) O.next = 1e9;
        };
      }
    }

    return () => {
      dead = true; ended = true;
      clearTimeout(endTimer);
      ro.disconnect();
      stage.removeEventListener('touchmove', noScroll);
      stage.removeEventListener('mg-pause', onPause);
      stage.removeEventListener('mg-resume', onResume);
      window.removeEventListener('keydown', onKey);
      keyHandler = null; tick = () => {};
      delete stage.surfDebug; delete stage.surfCheat;
      if (game) { try { game.loop.wake(); } catch { /* */ } game.destroy(true); game = null; }
      wrap.remove();
    };
  },
};
