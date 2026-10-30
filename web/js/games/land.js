// 땅따먹기: 30×30 돌판 위에서 나 + AI 3마리가 동시에 움직이며 땅을 넓힌다 (90초).
// 규칙: 내 땅 밖으로 나가면 꼬리(줄무늬)가 생기고, 내 땅으로 돌아오면 꼬리 + 땅으로 둘러싼 칸이 모두 내 땅.
//   남이 내 꼬리를 밟으면 나는 탈락, 내가 남의 꼬리를 밟으면 그 친구가 탈락. 내 꼬리를 내가 밟아도 탈락.
//   머리끼리 부딪히면 자기 땅 위에 있던 쪽은 무사. 판 밖으로는 못 나감(멈춤).
//   AI 는 탈락하면 땅이 사라지고 3초 뒤 빈 곳에서 다시 나옴. 내가 탈락하면 그 자리에서 끝.
// 점수 = 끝날 때 내 땅 (판 900칸 중 천분율, 0~1000). 화면: 나를 따라가는 카메라(가로 약 17칸) + 오른쪽 위 작은 지도.
// Phaser 3 (vendor) 사용 — start() 는 바로 돌아가고 Phaser 는 뒤에서 불러옴.
import { loadPhaser } from './common.js';

export const N = 30;                        // 판 크기 (칸)
const K = 4;                                // 처음 땅 (K×K)
export const STEP = 1 / 7;                  // 한 칸 이동 시간 (초) = 초당 7칸
const ROUND = 90;                           // 한 판 (초)
const RESPAWN = Math.round(3 / STEP);       // AI 다시 나오기 (걸음 수 ≈ 3초)
export const LIVES = 3;                     // 내 목숨
const P_RESPAWN = Math.round(1.5 / STEP);   // 내가 다시 나오기 (≈ 1.5초)
const PROTECT = Math.round(1 / STEP);       // 다시 나온 뒤 무적 (≈ 1초)
const CALM = Math.round(10 / STEP);         // 처음 10초는 AI 가 꼬리를 노리지 않음
const MOOD = Math.round(2 / STEP);          // AI 기분(노릴지) 다시 정하는 간격
const REST = Math.round(6 / STEP);          // 누굴 잡은 AI 는 6초 쉼
const REACT = 3;                            // AI 는 생긴 지 3걸음 넘은 꼬리만 봄 (반응 시간)
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // 0 위 · 1 오른쪽 · 2 아래 · 3 왼쪽
const INF = 9999;

// ── 둘러싸기: 판 가장자리에서 '내 땅·내 꼬리가 아닌 칸'으로 번져 나가고, 닿지 못한 칸은 모두 내 것 ──
// own/trail: 칸마다 주인 번호(-1 = 없음). 돌려주는 값 = 내 땅이 될 칸 번호들 (꼬리 칸 포함, 원래 내 땅 제외)
export function enclose(own, trail, n, p) {
  const block = (i) => own[i] === p || trail[i] === p;
  const seen = new Uint8Array(n * n); const q = [];
  const seed = (i) => { if (!seen[i] && !block(i)) { seen[i] = 1; q.push(i); } };
  for (let k = 0; k < n; k++) { seed(k); seed((n - 1) * n + k); seed(k * n); seed(k * n + n - 1); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % n, y = (i - x) / n;
    if (x > 0) seed(i - 1); if (x < n - 1) seed(i + 1); if (y > 0) seed(i - n); if (y < n - 1) seed(i + n);
  }
  const out = [];
  for (let i = 0; i < n * n; i++) if (!seen[i] && own[i] !== p) out.push(i);
  return out;
}

// AI 성격: legs = 밖으로 나가는 거리 범위, margin = 위험 감지 여유, budget = 꼬리 최대 길이, hunt = 남의 꼬리 노리는 거리, blind = 가끔 위험을 못 봄
const PERS = {
  me: {},
  cautious: { legs: [3, 6], margin: 4, budget: 18, hunt: 1, cut: 0.35, blind: 0.03 },
  greedy: { legs: [8, 14], margin: 1, budget: 46, hunt: 2, cut: 0.5, blind: 0.1 },
  hunter: { legs: [3, 6], margin: 2, budget: 20, hunt: 6, cut: 0.8, blind: 0.06 },
};

// ── 게임 규칙 (화면과 분리 — 시험에서 바로 돌려 볼 수 있음) ──
export class LandSim {
  constructor({ n = N, rnd = Math.random, kinds = ['me', 'cautious', 'greedy', 'hunter'] } = {}) {
    this.n = n; this.rnd = rnd;
    this.own = new Int8Array(n * n).fill(-1);
    this.trail = new Int8Array(n * n).fill(-1);
    this.trailAt = new Int32Array(n * n);   // 꼬리가 생긴 걸음
    this.steps = 0; this.events = []; this.aiOn = true;
    const a = Math.round(n * 0.2), b = n - 1 - a;
    const homes = [[a, b], [a, a], [b, a], [b, b]];   // 나 = 왼쪽 아래
    this.players = kinds.map((kind, id) => ({
      id, kind, ai: kind !== 'me', alive: true, x: 0, y: 0, px: 0, py: 0, dir: null, queue: [], trail: [], land: 0,
      mode: 'out', plan: null, wait: 0, exit: null, respawnAt: 0, kills: 0, blocked: false, lives: id === 0 ? LIVES : Infinity, protect: 0,
    }));
    this.players.forEach((p, i) => this.place(p, homes[i % 4][0], homes[i % 4][1]));
  }
  idx(x, y) { return y * this.n + x; }
  // K×K 땅을 주고 그 위에 세움
  place(p, cx, cy) {
    const lo = -Math.floor((K - 1) / 2), hi = lo + K - 1;
    for (let dy = lo; dy <= hi; dy++) for (let dx = lo; dx <= hi; dx++) {
      const i = this.idx(cx + dx, cy + dy);
      if (this.trail[i] >= 0) this.trail[i] = -1;
      this.own[i] = p.id;
    }
    Object.assign(p, { x: cx, y: cy, px: cx, py: cy, alive: true, trail: [], plan: null, mode: 'out', exit: null, dir: null, queue: [],
      wait: 1 + Math.floor(this.rnd() * 3) });
    this.count();
  }
  count() {
    for (const p of this.players) p.land = 0;
    for (let i = 0; i < this.own.length; i++) if (this.own[i] >= 0) this.players[this.own[i]].land++;
  }
  // 한 걸음 (모두 동시에)
  tick() {
    this.steps++;
    const { own, trail, players: ps } = this;
    for (const p of ps) if (!p.alive && p.lives > 0 && p.respawnAt && this.steps >= p.respawnAt) this.respawn(p);
    for (const p of ps) {
      if (!p.alive) continue;
      if (p.ai) { if (this.aiOn) p.dir = this.think(p); }
      else while (p.queue.length) { const d = p.queue.shift(); if (p.dir == null || d !== (p.dir + 2) % 4) { p.dir = d; break; } }
    }
    const moved = [];
    for (const p of ps) {
      if (!p.alive) continue;
      p.px = p.x; p.py = p.y; p.blocked = false;
      if (p.dir == null) continue;
      const nx = p.x + DX[p.dir], ny = p.y + DY[p.dir];
      if (nx < 0 || ny < 0 || nx >= this.n || ny >= this.n) { p.blocked = true; continue; }
      p.x = nx; p.y = ny; moved.push(p);
    }
    const deaths = new Map();
    const kill = (id, cause, by) => { if (!deaths.has(id) && (cause === 'self' || !this.safe(ps[id]))) deaths.set(id, { cause, by }); };
    for (const p of moved) {
      const t = trail[this.idx(p.x, p.y)];
      if (t === p.id) kill(p.id, 'self', p.id);
      else if (t >= 0) kill(t, 'cut', p.id);
    }
    // 머리끼리 (같은 칸 / 서로 자리 바꿈): 자기 땅 위면 무사
    const alive = ps.filter((p) => p.alive);
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      const same = a.x === b.x && a.y === b.y;
      const swap = a.x === b.px && a.y === b.py && b.x === a.px && b.y === a.py && (a.x !== a.px || a.y !== a.py);
      if (!same && !swap) continue;
      if (own[this.idx(a.x, a.y)] !== a.id) kill(a.id, 'crash', b.id);
      if (own[this.idx(b.x, b.y)] !== b.id) kill(b.id, 'crash', a.id);
    }
    for (const [id, c] of deaths) this.die(ps[id], c.cause, c.by);
    for (const p of moved) {
      if (!p.alive) continue;
      const i = this.idx(p.x, p.y);
      if (own[i] === p.id) { if (p.trail.length) this.capture(p); }
      else if (trail[i] !== p.id) { trail[i] = p.id; this.trailAt[i] = this.steps; p.trail.push(i); }
    }
    this.count();
    for (const p of ps) if (p.alive && p.land === 0) { this.die(p, 'noland', null); this.count(); }
  }
  die(p, cause, by) {
    if (!p.alive) return;
    for (const i of p.trail) if (this.trail[i] === p.id) this.trail[i] = -1;
    p.trail = []; p.alive = false; p.queue = [];
    p.lives--;
    if (p.lives > 0) {   // 마지막 목숨이면 땅을 남겨 둠 (점수 = 그때 땅)
      for (let i = 0; i < this.own.length; i++) if (this.own[i] === p.id) this.own[i] = -1;
      p.respawnAt = this.steps + (p.ai ? RESPAWN : P_RESPAWN);
    }
    if (by != null && by !== p.id) { this.players[by].kills++; this.players[by].restUntil = this.steps + REST; }
    this.events.push({ t: 'die', id: p.id, cause, by, x: p.x, y: p.y, lives: p.lives });
  }
  capture(p) {
    const cells = enclose(this.own, this.trail, this.n, p.id);
    const prev = []; const victims = new Set();
    for (const i of cells) {
      prev.push(this.own[i]);
      const t = this.trail[i];
      if (t >= 0 && t !== p.id) victims.add(t);
      if (t === p.id) this.trail[i] = -1;
      this.own[i] = p.id;
    }
    p.trail = [];
    for (const v of victims) if (!this.safe(this.players[v])) this.die(this.players[v], 'enclosed', p.id);
    if (p.ai) { p.wait = p.id === 0 ? 1 + Math.floor(this.rnd() * 4) : 3 + Math.floor(this.rnd() * 6); p.exit = null; p.plan = null; p.mode = 'out'; }
    this.events.push({ t: 'cap', id: p.id, cells, prev, x: p.x, y: p.y });
  }
  // 빈 곳 찾아 다시 나오기 (다른 머리에서 멀리)
  respawn(p) {
    const n = this.n; const heads = this.players.filter((q) => q.alive);
    const lo = -Math.floor((K - 1) / 2), hi = lo + K - 1;
    let best = null, bs = -1;
    for (const strict of [true, false]) {
      for (let cy = -lo; cy < n - hi; cy++) for (let cx = -lo; cx < n - hi; cx++) {
        let ok = true;
        for (let dy = lo; dy <= hi && ok; dy++) for (let dx = lo; dx <= hi && ok; dx++) {
          const i = this.idx(cx + dx, cy + dy);
          if (this.trail[i] >= 0 || (strict && this.own[i] >= 0)) ok = false;
        }
        if (!ok) continue;
        const d = heads.reduce((m, q) => Math.min(m, Math.abs(q.x - cx) + Math.abs(q.y - cy)), 99);
        if (d < 4) continue;
        const s = Math.min(d, 14) + this.rnd() * 5;
        if (s > bs) { bs = s; best = [cx, cy]; }
      }
      if (best) break;
    }
    if (!best) { p.respawnAt = this.steps + 7; return; }
    this.place(p, best[0], best[1]);
    if (p.id === 0) p.protect = this.steps + PROTECT;
    this.events.push({ t: 'spawn', id: p.id, x: p.x, y: p.y });
  }
  // 여러 출발 칸에서 거리 (pass 로 지나갈 수 있는 칸만)
  field(src, pass) {
    const n = this.n, d = new Int16Array(n * n).fill(INF), q = [];
    for (let i = 0; i < n * n; i++) if (src(i)) { d[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % n, y = (i - x) / n, nd = d[i] + 1;
      const go = (j) => { if (d[j] > nd && pass(j)) { d[j] = nd; q.push(j); } };
      if (x > 0) go(i - 1); if (x < n - 1) go(i + 1); if (y > 0) go(i - n); if (y < n - 1) go(i + n);
    }
    return d;
  }
  // 다른 머리가 내 꼬리(와 머리)에 얼마나 가까운지
  threat(p) {
    let m = INF; const n = this.n;
    for (const q of this.players) {
      if (q === p || !q.alive) continue;
      m = Math.min(m, Math.abs(q.x - p.x) + Math.abs(q.y - p.y));
      for (const i of p.trail) { const x = i % n, y = (i - x) / n; m = Math.min(m, Math.abs(q.x - x) + Math.abs(q.y - y)); }
    }
    return m;
  }
  safe(p) { return p.protect > this.steps; }   // 다시 나온 직후 무적
  // AI 가 노릴 수 있는 남의 꼬리 칸 (생긴 지 REACT 걸음 넘음, 무적 아님)
  prey(p, i) { const t = this.trail[i]; return t >= 0 && t !== p.id && this.steps - this.trailAt[i] >= REACT && !this.safe(this.players[t]); }
  room(p, d) { // 그 방향으로 판 끝까지 칸 수
    return d === 0 ? p.y : d === 1 ? this.n - 1 - p.x : d === 2 ? this.n - 1 - p.y : p.x;
  }
  huntDir(p, safe, range) {
    const tr = this.trail;
    let any = false; for (let i = 0; i < tr.length; i++) if (this.prey(p, i)) { any = true; break; }
    if (!any) return null;
    const tf = this.field((i) => this.prey(p, i), (i) => tr[i] !== p.id);
    let best = null;
    for (const o of safe) if (!best || tf[o.i] < tf[best.i]) best = o;
    return best && tf[best.i] + 1 <= range ? best.d : null;
  }
  chooseExit(p, safe) {
    let best = null, bs = -INF;
    for (const o of safe) {
      let x = p.x, y = p.y, leave = 0;
      while (x >= 0 && y >= 0 && x < this.n && y < this.n && this.own[this.idx(x, y)] === p.id) { x += DX[o.d]; y += DY[o.d]; leave++; }
      const inb = x >= 0 && y >= 0 && x < this.n && y < this.n;
      const s = Math.min(this.room(p, o.d), 10) - leave * 0.6 + (inb && this.own[this.idx(x, y)] === -1 ? 2 : 0) + this.rnd() * 4;
      if (s > bs) { bs = s; best = o; }
    }
    return best ? best.d : p.dir;
  }
  makePlan(p) {
    const P = PERS[p.kind]; const r = () => P.legs[0] + Math.floor(this.rnd() * (P.legs[1] - P.legs[0] + 1));
    const a = r(), b = r();
    const right = (p.dir + 1) % 4, left = (p.dir + 3) % 4;
    const rr = this.room(p, right), rl = this.room(p, left);
    const turn = rr === rl ? (this.rnd() < 0.5 ? 1 : -1) : rr > rl ? 1 : -1;
    p.plan = { legs: [a, b, a], k: 0, s: 1, turn, budget: P.budget };
    p.mode = 'out';
  }
  // AI 한 걸음 생각
  think(p) {
    const { n, own, trail: tr, rnd } = this; const P = PERS[p.kind];
    const inLand = own[this.idx(p.x, p.y)] === p.id;
    const opts = [];
    for (let d = 0; d < 4; d++) {
      if (p.dir != null && d === (p.dir + 2) % 4) continue;
      const x = p.x + DX[d], y = p.y + DY[d];
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const i = this.idx(x, y);
      if (tr[i] === p.id) continue;
      opts.push({ d, i });
    }
    if (!opts.length) return p.dir;
    const hd = this.field((i) => own[i] === p.id, (i) => tr[i] !== p.id);
    let safe = opts.filter((o) => hd[o.i] < INF);
    if (!safe.length) safe = opts;
    const pick = (f) => safe.slice().sort((a, b) => f(a) - f(b) || (a.d === p.dir ? -1 : b.d === p.dir ? 1 : 0))[0].d;
    // 바로 옆에 남의 꼬리 → 밟기
    // 기분: 2초마다 '노릴까?' 를 다시 정함 (성격마다 확률) · 처음 10초와 누굴 잡은 뒤 6초는 쉼
    if (this.steps >= (p.moodAt || 0)) { p.moodAt = this.steps + MOOD; p.angry = rnd() < P.cut; }
    const calm = this.steps < CALM || this.steps < (p.restUntil || 0) || !p.angry;
    const cut = calm ? null : safe.find((o) => this.prey(p, o.i));
    if (cut) return cut.d;
    // 노릴 기분이 아니면 남의 꼬리를 밟지 않게 비켜 감 (다른 길이 있을 때)
    if (calm) { const nt = safe.filter((o) => !(tr[o.i] >= 0 && tr[o.i] !== p.id)); if (nt.length) safe = nt; }
    if (inLand) {
      p.plan = null; p.mode = 'out';
      if (P.hunt > 2 && !calm) { const h = this.huntDir(p, safe, P.hunt - 2); if (h != null) return h; }
      if (p.wait > 0) {
        p.wait--;
        const ins = safe.filter((o) => own[o.i] === p.id);
        if (ins.length) { const s = ins.find((o) => o.d === p.dir); return (s && rnd() < 0.6 ? s : ins[Math.floor(rnd() * ins.length)]).d; }
      }
      if (p.exit == null || !safe.some((o) => o.d === p.exit)) p.exit = this.chooseExit(p, safe);
      return p.exit;
    }
    if (!p.plan) this.makePlan(p);
    const dHome = Math.min(...safe.map((o) => hd[o.i])) + 1;
    if (p.mode !== 'return') {
      const blind = rnd() < P.blind;
      if (p.trail.length >= p.plan.budget || (!blind && this.threat(p) <= dHome + P.margin)) p.mode = 'return';
    }
    if (p.mode === 'return') return pick((o) => hd[o.i]);
    if (P.hunt > 1 && !calm && p.trail.length < 4) { const h = this.huntDir(p, safe, P.hunt); if (h != null) return h; }
    const pl = p.plan;
    let want = p.dir;
    if (pl.s >= pl.legs[pl.k]) {
      pl.k++; pl.s = 0; want = (p.dir + pl.turn + 4) % 4;
      if (pl.k >= pl.legs.length) { p.mode = 'return'; return pick((o) => hd[o.i]); }
    }
    let o = safe.find((q) => q.d === want);
    if (!o) {
      o = safe.find((q) => q.d === (p.dir + pl.turn + 4) % 4) || safe.find((q) => q.d === (p.dir - pl.turn + 4) % 4) || safe[0];
      if (o.d !== p.dir) { pl.k++; pl.s = 0; if (pl.k >= pl.legs.length) p.mode = 'return'; }
    }
    pl.s++;
    return o.d;
  }
  score(id = 0) { return Math.max(0, Math.min(1000, Math.floor((this.players[id].land * 1000) / (this.n * this.n)))); }
}

// ── 화면 ──
const W = 336, H = 560;                       // 논리 해상도 (도트)
const T = 20, WM = 28, WORLD = N * T + WM * 2;  // 칸 크기 · 판 둘레 풀밭 · 월드 크기
const VIEW = { x: 0, y: 40, w: W, h: 360 };   // 판이 보이는 창 (위 40 = 점수줄, 아래 = 방향 버튼)
const PAD_Y = VIEW.y + VIEW.h;
const ATLAS = new URL('../../sprites/atlas.png', import.meta.url).href;
const FONT = 'Galmuri11, monospace';

const PAL = [
  { name: '나', base: '#e5534b', hi: '#f49084', lo: '#b03634', tr: '#f8c0b8', st: '#ee8a80' },
  { name: '조심이', base: '#4a7fe0', hi: '#8cb2f4', lo: '#2f58a8', tr: '#bcd2f8', st: '#88aaee' },
  { name: '욕심이', base: '#46ac4c', hi: '#86d47e', lo: '#2c7c36', tr: '#bce6b0', st: '#84c87c' },
  { name: '사냥꾼', base: '#eab52a', hi: '#f8dc78', lo: '#b08414', tr: '#f8eab0', st: '#eccc58' },
];
const hex = (s) => parseInt(s.slice(1), 16);
const rgb = (s) => [hex(s) >> 16, (hex(s) >> 8) & 255, hex(s) & 255];

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// 풀밭 + 꽃 + 돌멩이 (x0,y0,w,h 안에, avoid 사각형은 피함)
function grass(g, w, h, seed, avoid) {
  const r = rng(seed);
  g.fillStyle = '#74c050'; g.fillRect(0, 0, w, h);
  for (let k = 0; k < (w * h) / 22; k++) {
    g.fillStyle = r() < 0.5 ? '#66b046' : '#84cc5c';
    const x = Math.floor(r() * w), y = Math.floor(r() * h);
    g.fillRect(x, y, 2, 1);
    if (r() < 0.3) { g.fillStyle = '#5a9e3e'; g.fillRect(x, y - 2, 1, 2); g.fillRect(x + 2, y - 1, 1, 1); }
  }
  const free = (x, y, s) => !avoid || x + s < avoid[0] - 2 || y + s < avoid[1] - 2 || x > avoid[0] + avoid[2] + 2 || y > avoid[1] + avoid[3] + 2;
  const fl = ['#ffffff', '#ff9cc8', '#ffe048', '#b8a0ff'];
  for (let k = 0; k < (w * h) / 900; k++) {
    const x = Math.floor(r() * (w - 6)), y = Math.floor(r() * (h - 6));
    if (!free(x, y, 6)) continue;
    if (r() < 0.72) { // 꽃
      g.fillStyle = '#3c8a34'; g.fillRect(x + 2, y + 3, 1, 3);
      g.fillStyle = fl[Math.floor(r() * fl.length)];
      g.fillRect(x + 1, y, 3, 1); g.fillRect(x, y + 1, 5, 1); g.fillRect(x + 1, y + 2, 3, 1);
      g.fillStyle = '#f8a020'; g.fillRect(x + 2, y + 1, 1, 1);
    } else { // 돌멩이
      g.fillStyle = '#5c6068'; g.fillRect(x, y + 1, 6, 3); g.fillRect(x + 1, y, 4, 1);
      g.fillStyle = '#a4a8b0'; g.fillRect(x + 1, y + 1, 4, 2);
      g.fillStyle = '#c8ccd2'; g.fillRect(x + 1, y + 1, 2, 1);
    }
  }
}

export default {
  id: 'land',
  title: '땅따먹기',
  start(stage, api) {
    const dev = location.pathname.endsWith('.dev-mg.html');
    const box = document.createElement('div');
    box.style.cssText = 'flex:1 1 auto;width:100%;min-height:0;position:relative;touch-action:none;display:flex;justify-content:center;';
    box.innerHTML = '<p style="margin:auto;font-size:14px;color:#384050">불러오는 중…</p>';
    stage.append(box);

    let dead = false, game = null, scene = null, paused = false;
    let endTimer = 0, sent = false;
    const timers = [];

    // 시뮬레이션 + 화면 상태
    const sim = new LandSim();
    const owned = api.mons?.() || [];
    const partner = api.partner?.() || 4;
    const pool = [...new Set(owned.filter((d) => d !== partner && d >= 1 && d <= 252))].sort(() => Math.random() - 0.5);
    for (const d of [1, 7, 10, 25, 39]) if (pool.length < 3 && d !== partner && !pool.includes(d)) pool.push(d);
    const dex = [partner, ...pool.slice(0, 3)];
    let mode = 'ready';   // ready → count → play → result
    let clock = 0;        // 남은 시간 계산용 (게임 시간, 초)
    let acc = 0, countT = 0, timeScale = 1;
    let t0 = 0, pausedAt = 0, pausedTotal = 0;
    let finalScore = 0, finalMs = 0, reason = '';

    const realMs = () => Math.round(performance.now() - t0 - pausedTotal - (paused && pausedAt ? performance.now() - pausedAt : 0));
    const sendEnd = () => {
      if (sent || dead) return; sent = true; clearTimeout(endTimer);
      api.end(finalScore, finalMs);
    };
    const finish = (why) => {
      if (mode === 'result') return;
      mode = 'result'; reason = why;
      finalScore = sim.score(0); finalMs = Math.max(0, realMs());
      scene?.showResult();
      endTimer = setTimeout(sendEnd, 3200);
    };
    const begin = () => { if (mode !== 'ready') return; mode = 'count'; countT = 0; api.sfx.blip(); };
    const queueDir = (d) => {
      const p = sim.players[0];
      if (!p.alive || mode === 'result' || mode === 'ready') return;
      const last = p.queue.length ? p.queue[p.queue.length - 1] : p.dir;
      if (d === last) return;
      if (p.queue.length >= 2) p.queue.shift();
      p.queue.push(d);
      scene?.pressPad(d);
    };

    // ── 입력: 밀기(스와이프) · 방향 버튼 · 방향키 ──
    const PADS = [
      { d: 0, x: 168, y: PAD_Y + 30 }, { d: 2, x: 168, y: PAD_Y + 132 },
      { d: 3, x: 110, y: PAD_Y + 81 }, { d: 1, x: 226, y: PAD_Y + 81 },
    ];
    const BTN = 52;
    let swipe = null;
    const toLogical = (e) => {
      const r = game?.canvas?.getBoundingClientRect();
      if (!r || !r.width) return null;
      return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, k: r.width / W };
    };
    const onDown = (e) => {
      e.preventDefault();
      if (mode === 'ready') { begin(); return; }
      if (mode === 'result') { if (scene && scene.resultAge() > 900) sendEnd(); return; }
      const L = toLogical(e);
      if (L) {
        const b = PADS.find((q) => Math.abs(L.x - q.x) <= BTN / 2 + 4 && Math.abs(L.y - q.y) <= BTN / 2 + 4);
        if (b) { queueDir(b.d); return; }
      }
      swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
      box.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!swipe || e.pointerId !== swipe.id) return;
      e.preventDefault();
      const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
      queueDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
      swipe.x = e.clientX; swipe.y = e.clientY;
    };
    const onUp = () => { swipe = null; };
    const KEYS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3 };
    const onKey = (e) => {
      if (mode === 'ready' && (e.key === ' ' || e.key === 'Enter' || e.key in KEYS)) { e.preventDefault(); begin(); return; }
      if (mode === 'result' && (e.key === ' ' || e.key === 'Enter')) { if (scene && scene.resultAge() > 900) sendEnd(); return; }
      if (e.key in KEYS) { e.preventDefault(); queueDir(KEYS[e.key]); }
    };
    const noScroll = (e) => e.preventDefault();
    const onPause = () => {
      if (paused) return; paused = true; pausedAt = performance.now();
      game?.loop?.sleep();
    };
    const onResume = () => {
      if (!paused) return; paused = false;
      if (pausedAt) pausedTotal += performance.now() - pausedAt; pausedAt = 0;
      game?.loop?.wake();
    };
    box.addEventListener('pointerdown', onDown);
    box.addEventListener('pointermove', onMove);
    box.addEventListener('pointerup', onUp);
    box.addEventListener('pointercancel', onUp);
    stage.addEventListener('touchmove', noScroll, { passive: false });
    stage.addEventListener('mg-pause', onPause);
    stage.addEventListener('mg-resume', onResume);
    window.addEventListener('keydown', onKey);

    // ── Phaser 장면 ──
    const makeScene = (Phaser) => class LandScene extends Phaser.Scene {
      constructor() { super('land'); }
      preload() { this.load.spritesheet('mons', ATLAS, { frameWidth: 64, frameHeight: 64 }); }
      canvasTex(key, w, h, draw) { const t = this.textures.createCanvas(key, w, h); draw(t.getContext(), w, h); t.refresh(); return t; }
      txt(x, y, s, size = 12, color = '#ffffff', stroke = 3) {
        return this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#182030', strokeThickness: stroke, align: 'center' });
      }
      makeTextures() {
        // 돌판 (회색 두 가지)
        [['st0', '#c4c8ce'], ['st1', '#bcc0c7']].forEach(([k, base], v) => this.canvasTex(k, T, T, (g) => {
          g.fillStyle = base; g.fillRect(0, 0, T, T);
          g.fillStyle = '#e2e5e9'; g.fillRect(0, 0, T, 1); g.fillRect(0, 0, 1, T);
          g.fillStyle = '#9a9ea7'; g.fillRect(0, T - 1, T, 1); g.fillRect(T - 1, 0, 1, T);
          g.fillStyle = '#a9adb5'; g.fillRect(4 + v * 7, 5, 2, 1); g.fillRect(12 - v * 4, 13, 1, 1); g.fillRect(14, 4 + v * 8, 1, 2);
        }));
        PAL.forEach((c, p) => {
          this.canvasTex(`ld${p}`, T, T, (g) => {
            g.fillStyle = c.base; g.fillRect(0, 0, T, T);
            g.fillStyle = c.hi; g.fillRect(0, 0, T, 2); g.fillRect(0, 0, 2, T);
            g.fillStyle = c.lo; g.fillRect(0, T - 2, T, 2); g.fillRect(T - 2, 0, 2, T);
            g.fillStyle = c.hi; g.fillRect(5, 5, 3, 1); g.fillRect(5, 6, 1, 2);
          });
          this.canvasTex(`tr${p}`, T, T, (g) => {
            g.fillStyle = c.tr; g.fillRect(0, 0, T, T);
            g.fillStyle = c.st;
            for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((x + y) % 8 < 3) g.fillRect(x, y, 1, 1);
            g.fillStyle = '#ffffff'; g.globalAlpha = 0.5; g.fillRect(0, 0, T, 1); g.fillRect(0, 0, 1, T); g.globalAlpha = 1;
          });
        });
        // 목숨 하트 (꽉 참 / 빔)
        const HEART = ['..kkk...kkk....', '.kcchk.kcchk...', 'kcchcckccccck..', 'kchcccccccccck.', 'kcccccccccccck.', 'kcccccccccccck.', '.kcccccccccck..', '..kcccccccck...', '...kcccccck....', '....kcccck.....', '.....kcck......', '......kk.......'];
        [['heart', '#ff4860', '#ffb0b8'], ['heart0', '#5a6070', '#7a8090']].forEach(([k, c, h]) => this.canvasTex(k, 15, 12, (g) => {
          HEART.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '.') return; g.fillStyle = ch === 'k' ? '#182030' : ch === 'h' ? h : c; g.fillRect(x, y, 1, 1); }));
        }));
        this.canvasTex('px', 3, 3, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 3, 3); });
        // 월드 바닥: 풀밭 + 흙 테두리 + 돌판 이음새
        this.canvasTex('field', WORLD, WORLD, (g) => {
          grass(g, WORLD, WORLD, 7, [WM - 8, WM - 8, N * T + 16, N * T + 16]);
          const bx = WM - 7, bw = N * T + 14;
          g.fillStyle = '#6e4826'; g.fillRect(bx, bx, bw, bw);
          g.fillStyle = '#a8743e'; g.fillRect(bx + 1, bx + 1, bw - 2, bw - 2);
          g.fillStyle = '#c08a4e'; g.fillRect(bx + 1, bx + 1, bw - 2, 2); g.fillRect(bx + 1, bx + 1, 2, bw - 2);
          const r = rng(3); g.fillStyle = '#8c5c2e';
          for (let k = 0; k < 400; k++) { const t = Math.floor(r() * bw), s = Math.floor(r() * 6); const side = k % 4; const x = side < 2 ? bx + t : side === 2 ? bx + 1 + s : bx + bw - 2 - s; const y = side < 2 ? (side ? bx + bw - 2 - s : bx + 1 + s) : bx + t; g.fillRect(x, y, 1, 1); }
          g.fillStyle = '#5a5e66'; g.fillRect(WM - 1, WM - 1, N * T + 2, N * T + 2);
          g.fillStyle = '#70757e'; g.fillRect(WM, WM, N * T, N * T);
        });
        this.canvasTex('hud', W, 40, (g) => {
          g.fillStyle = '#24324a'; g.fillRect(0, 0, W, 40);
          g.fillStyle = '#34466a'; g.fillRect(0, 0, W, 2);
          g.fillStyle = '#101828'; g.fillRect(0, 38, W, 2);
        });
        this.canvasTex('panel', W, H - PAD_Y, (g, w, h) => {
          grass(g, w, h, 11, [168 - 90, 0, 180, h]);
          g.fillStyle = '#101828'; g.fillRect(0, 0, w, 3);
          g.fillStyle = '#5a9e3e'; g.fillRect(0, 3, w, 1);
        });
        this.canvasTex('btn', BTN, BTN, (g) => {
          g.fillStyle = '#182030'; g.fillRect(3, 0, BTN - 6, BTN); g.fillRect(0, 3, BTN, BTN - 6); g.fillRect(1, 1, BTN - 2, BTN - 2);
          g.fillStyle = '#c9bc9c'; g.fillRect(3, 3, BTN - 6, BTN - 6);
          g.fillStyle = '#f6eed8'; g.fillRect(3, 3, BTN - 6, BTN - 11);
          g.fillStyle = '#ffffff'; g.fillRect(5, 5, BTN - 14, 2);
        });
        this.canvasTex('arr', 20, 14, (g) => {
          g.fillStyle = '#384050';
          for (let r = 0; r < 10; r++) g.fillRect(9 - r, r, 2 + r * 2, 1);
          g.fillRect(6, 10, 8, 4);
        });
        this.canvasTex('mini', N * 2 + 2, N * 2 + 2, (g) => { g.fillStyle = '#182030'; g.fillRect(0, 0, N * 2 + 2, N * 2 + 2); });
      }
      create() {
        scene = this;
        box.querySelector('p')?.remove();
        this.makeTextures();
        this.add.image(0, 0, 'field').setOrigin(0).setDepth(-10);
        // 칸 그림 900개
        this.tiles = []; this.keys = [];
        for (let i = 0; i < N * N; i++) {
          const x = i % N, y = (i - x) / N;
          this.tiles.push(this.add.image(WM + x * T + T / 2, WM + y * T + T / 2, 'st0').setDepth(0));
          this.keys.push('');
        }
        this.refreshTiles();
        // 몬스터 + 발밑 고리
        this.rings = this.add.graphics().setDepth(5);
        this.mons = sim.players.map((p) => this.add.sprite(0, 0, 'mons', Math.max(0, Math.min(251, dex[p.id] - 1))).setOrigin(0.5, 1));
        this.marker = this.add.graphics().setDepth(400);
        this.fx = this.add.particles(0, 0, 'px', {
          lifespan: { min: 600, max: 1100 }, speed: { min: 70, max: 190 }, angle: { min: 200, max: 340 }, gravityY: 320,
          scale: { start: 1, end: 0.4 }, rotate: { min: 0, max: 360 }, emitting: false,
          tint: [0xffe048, 0xff6c9c, 0x58c8ff, 0x86e070, 0xffffff],
        }).setDepth(450);
        this.puff = this.add.particles(0, 0, 'px', {
          lifespan: 500, speed: { min: 30, max: 90 }, scale: { start: 1.3, end: 0 }, alpha: { start: 1, end: 0 }, emitting: false,
        }).setDepth(450);
        this.floaters = [];

        // 화면에 고정된 것들 (점수줄 · 방향 버튼 · 작은 지도 · 화살표)
        const ui = (o, d = 1000) => o.setScrollFactor(0).setDepth(d);
        ui(this.add.image(0, 0, 'hud').setOrigin(0));
        ui(this.add.image(0, PAD_Y, 'panel').setOrigin(0));
        this.badges = [];
        const bx = [2, 70, 200, 268];
        PAL.forEach((c, p) => {
          const g = ui(this.add.graphics());
          g.fillStyle(0x101828, 1); g.fillRoundedRect(bx[p], 5, 66, 30, 6);
          g.fillStyle(hex(c.base), 1); g.fillRoundedRect(bx[p] + 2, 7, 62, 26, 5);
          g.fillStyle(hex(c.hi), 1); g.fillRect(bx[p] + 6, 9, 54, 2);
          if (p === 0) { g.lineStyle(2, 0xffffff, 1); g.strokeRoundedRect(bx[p] + 1, 6, 64, 28, 6); }
          const icon = ui(this.add.sprite(bx[p] + 15, 21, 'mons', Math.max(0, Math.min(251, dex[p] - 1))).setScale(0.5), 1001);
          icon.setCrop(4, 4, 56, 56);
          const tx = ui(this.txt(bx[p] + 46, 14, '', 12), 1002).setOrigin(0.5, 0);
          this.badges.push({ g, tx, icon, x: bx[p] });
        });
        this.timerBg = ui(this.add.graphics());
        this.timerBg.fillStyle(0x101828, 1); this.timerBg.fillRoundedRect(139, 3, 58, 34, 8);
        this.timerBg.fillStyle(0xf6eed8, 1); this.timerBg.fillRoundedRect(141, 5, 54, 30, 7);
        this.timerTx = ui(this.txt(168, 11, '1:30', 18, '#24324a', 0), 1002).setOrigin(0.5, 0);
        // 방향 버튼
        this.pads = PADS.map((q) => {
          const b = ui(this.add.image(q.x, q.y, 'btn'));
          const a = ui(this.add.image(q.x, q.y - 2, 'arr'), 1001).setAngle(q.d * 90);
          return { ...q, b, a, flash: 0 };
        });
        ui(this.txt(40, PAD_Y + 60, '밀거나\n눌러서\n방향 바꾸기', 12, '#ffffff', 3), 1001).setOrigin(0.5, 0).setLineSpacing(2);
        ui(this.txt(296, PAD_Y + 58, '내 땅', 12, '#ffffff', 3), 1001).setOrigin(0.5, 0);
        this.myPct = ui(this.txt(296, PAD_Y + 76, '0%', 24, '#ffe048', 4), 1001).setOrigin(0.5, 0);
        this.hearts = [0, 1, 2].map((k) => ui(this.add.image(277 + k * 19, PAD_Y + 118, 'heart'), 1001));
        // 작은 지도
        this.miniBuf = new ImageData(N * 2 + 2, N * 2 + 2);
        this.mini = ui(this.add.image(W - 4, VIEW.y + 4, 'mini').setOrigin(1, 0), 900).setAlpha(0.92);
        this.arrows = ui(this.add.graphics(), 890);
        this.danger = ui(this.add.graphics(), 950);
        this.overlay = ui(this.add.container(0, 0), 1100);
        this.blink = 0;

        const cam = this.cameras.main;
        cam.setBackgroundColor('#74c050');
        this.camTarget(true);
        this.showReady();
        if (paused) game.loop.sleep();
      }
      // 칸 그림 새로 (바뀐 칸만)
      refreshTiles() {
        const { own, trail } = sim;
        for (let i = 0; i < N * N; i++) {
          const x = i % N, y = (i - x) / N;
          const k = trail[i] >= 0 ? `tr${trail[i]}` : own[i] >= 0 ? `ld${own[i]}` : `st${(x + y) & 1}`;
          if (k !== this.keys[i]) { this.keys[i] = k; this.tiles[i].setTexture(k); }
        }
      }
      worldPos(p, a) {
        const x = p.px + (p.x - p.px) * a, y = p.py + (p.y - p.py) * a;
        return [WM + x * T + T / 2, WM + y * T + T / 2];
      }
      camTarget(snap) {
        const cam = this.cameras.main; const me = sim.players[0];
        const [wx, wy] = this.worldPos(me, Math.min(1, acc / STEP));
        const tx = Math.max(0, Math.min(WORLD - W, wx - W / 2));
        const ty = Math.max(-VIEW.y, Math.min(WORLD - VIEW.y - VIEW.h, wy - VIEW.y - VIEW.h / 2));
        if (snap) { this.cx = tx; this.cy = ty; }
        else { this.cx += (tx - this.cx) * 0.16; this.cy += (ty - this.cy) * 0.16; }
        cam.scrollX = Math.round(this.cx); cam.scrollY = Math.round(this.cy);
      }
      pressPad(d) { const p = this.pads?.find((q) => q.d === d); if (p) p.flash = 0.15; api.sfx.evoTick(); }
      clearOverlay() { this.overlay.removeAll(true); }
      showReady() {
        this.clearOverlay();
        const g = this.add.graphics();
        g.fillStyle(0x182030, 0.6); g.fillRect(0, VIEW.y, W, VIEW.h);
        g.fillStyle(0x101828, 1); g.fillRoundedRect(14, VIEW.y + 50, W - 28, 246, 10);
        g.fillStyle(0xfffaf0, 1); g.fillRoundedRect(17, VIEW.y + 53, W - 34, 240, 8);
        g.fillStyle(0xe5534b, 1); g.fillRect(17, VIEW.y + 92, W - 34, 2);
        const lines = [
          '땅 밖으로 나가면 꼬리가 생겨요',
          '내 땅으로 돌아오면 둘러싼 곳이 내 땅!',
          '남의 꼬리를 밟으면 그 친구가 탈락',
          '내 꼬리를 밟히거나 밟으면 탈락!',
          '목숨은 3개! 잡혀도 다시 나와요',
          '90초 동안 가장 넓은 땅을 차지해요',
        ];
        const items = [g, this.txt(W / 2, VIEW.y + 62, '땅따먹기', 24, '#e5534b', 0).setOrigin(0.5, 0)];
        lines.forEach((s, i) => items.push(this.txt(W / 2, VIEW.y + 104 + i * 22, s, 12, '#303848', 0).setOrigin(0.5, 0)));
        this.tapTx = this.txt(W / 2, VIEW.y + 254, '탭해서 시작', 18, '#e5534b', 0).setOrigin(0.5, 0);
        items.push(this.tapTx);
        this.overlay.add(items);
      }
      showCount(s) {
        this.clearOverlay();
        if (!s) return;
        const t = this.txt(W / 2, VIEW.y + VIEW.h / 2 - 40, s, s.length > 1 ? 36 : 48, s.length > 1 ? '#ffe048' : '#ffffff', 6).setOrigin(0.5);
        t.setScale(1.6); this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.Out' });
        this.overlay.add(t);
      }
      resultAge() { return this.resultAt ? performance.now() - this.resultAt : 0; }
      showResult() {
        this.clearOverlay(); this.resultAt = performance.now();
        const order = sim.players.map((p) => p).sort((a, b) => b.land - a.land || a.id - b.id);
        const rank = order.indexOf(sim.players[0]) + 1;
        const g = this.add.graphics();
        g.fillStyle(0x182030, 0.62); g.fillRect(0, VIEW.y, W, VIEW.h);
        g.fillStyle(0x101828, 1); g.fillRoundedRect(14, VIEW.y + 24, W - 28, 300, 10);
        g.fillStyle(0xfffaf0, 1); g.fillRoundedRect(17, VIEW.y + 27, W - 34, 294, 8);
        const head = rank === 1 ? '1등!' : `${rank}등`;
        const sub = reason === 'dead' ? '목숨을 모두 잃었어요! 그때 땅으로 기록해요' : '시간 끝!';
        const items = [g,
          this.txt(W / 2, VIEW.y + 36, head, 36, rank === 1 ? '#f0a020' : '#4a7fe0', 0).setOrigin(0.5, 0),
          this.txt(W / 2, VIEW.y + 80, sub, 12, '#384050', 0).setOrigin(0.5, 0)];
        order.forEach((p, i) => {
          const y = VIEW.y + 106 + i * 44; const c = PAL[p.id];
          const row = this.add.graphics();
          row.fillStyle(p.id === 0 ? 0xfff0c0 : 0xeef0f4, 1); row.fillRoundedRect(26, y, W - 52, 40, 6);
          if (p.id === 0) { row.lineStyle(2, 0xf0b020, 1); row.strokeRoundedRect(26, y, W - 52, 40, 6); }
          const pct = (p.land * 100) / (N * N);
          row.fillStyle(0xd0d4dc, 1); row.fillRect(140, y + 26, 150, 6);
          row.fillStyle(hex(c.base), 1); row.fillRect(140, y + 26, Math.max(2, Math.round(150 * Math.min(1, pct / 50))), 6);
          items.push(row,
            this.txt(42, y + 12, `${i + 1}`, 18, i === 0 ? '#f0a020' : '#384050', 0).setOrigin(0.5, 0),
            this.add.sprite(80, y + 39, 'mons', Math.max(0, Math.min(251, dex[p.id] - 1))).setOrigin(0.5, 1).setCrop(8, 24, 48, 40),
            this.txt(140, y + 6, c.name, 12, c.lo, 0),
            this.txt(290, y + 4, `${pct.toFixed(1)}%`, 18, '#303848', 0).setOrigin(1, 0));
        });
        items.push(this.txt(W / 2, VIEW.y + 288, `점수 ${finalScore}`, 18, '#e5534b', 0).setOrigin(0.5, 0));
        this.overlay.add(items);
        if (rank === 1 && reason !== 'dead') { api.sfx.catch(); this.confettiScreen(); } else if (reason !== 'dead') api.sfx.select();
      }
      confettiScreen() {
        const cam = this.cameras.main;
        for (let k = 0; k < 4; k++) this.fx.explode(24, cam.scrollX + 40 + k * 85, cam.scrollY + VIEW.y + 200);
      }
      // 사건 처리: 땅 먹기 · 탈락 · 다시 나오기
      handle(e) {
        const me = e.id === 0;
        if (e.t === 'cap') {
          const hx = e.x, hy = e.y;
          const sorted = e.cells.map((i) => { const x = i % N, y = (i - x) / N; return { i, d: Math.abs(x - hx) + Math.abs(y - hy) }; });
          sorted.forEach(({ i, d }) => {
            const img = this.tiles[i];
            this.tweens.killTweensOf(img);
            img.setScale(0.3);
            this.tweens.add({ targets: img, scale: 1, duration: 200, delay: Math.min(500, d * 22), ease: 'Back.Out' });
          });
          const n = e.cells.length;
          if (me && n > 0) {
            const [wx, wy] = [WM + hx * T + T / 2, WM + hy * T];
            const f = this.txt(wx, wy - 26, `+${n}칸`, n >= 40 ? 18 : 12, '#ffe048', 3).setOrigin(0.5).setDepth(460);
            this.tweens.add({ targets: f, y: wy - 56, alpha: 0, duration: 1100, onComplete: () => f.destroy() });
            if (n >= 40) { api.sfx.statUp(); this.fx.explode(40, wx, wy); this.cameras.main.flash(120, 255, 248, 200); }
            else if (n >= 15) { api.sfx.correct(); this.fx.explode(18, wx, wy); }
            else api.sfx.correct();
          }
        } else if (e.t === 'die') {
          const s = this.mons[e.id]; const [wx, wy] = [WM + e.x * T + T / 2, WM + e.y * T + T / 2];
          this.puff.setParticleTint(hex(PAL[e.id].base)); this.puff.explode(18, wx, wy);
          if (me && e.lives <= 0) {
            api.sfx.hit(); timers.push(setTimeout(() => !dead && api.sfx.faint(), 260));
            this.cameras.main.shake(260, 0.012);
            s.setTint(0xff6060);
            this.tweens.add({ targets: s, angle: 90, duration: 300, ease: 'Quad.Out' });
          } else if (me) {
            api.sfx.hit(); api.sfx.statDown();
            this.cameras.main.shake(200, 0.01);
            this.toast(`앗! 남은 목숨 ${e.lives}`, '#ff6c6c', 1300);
            this.tweens.killTweensOf(s); s.setTint(0xff6060);
            this.tweens.add({ targets: s, angle: 360, scale: 0, alpha: 0, duration: 450, onComplete: () => s.setAngle(0) });
          } else {
            if (e.by === 0) { api.sfx.ballPop(); this.toast(`${PAL[e.id].name} 탈락!`, PAL[e.id].base); } else if (this.onScreen(wx, wy)) api.sfx.ballThrow();
            this.tweens.killTweensOf(s);
            this.tweens.add({ targets: s, angle: 360, scale: 0, alpha: 0, duration: 450, onComplete: () => s.setAngle(0) });
          }
        } else if (e.t === 'spawn') {
          const s = this.mons[e.id];
          this.tweens.killTweensOf(s);
          s.setAlpha(1).setScale(0).setAngle(0).clearTint();
          if (me) { api.sfx.ballThrow(); this.toast('다시 출발!', '#ffffff', 700); }
          this.tweens.add({ targets: s, scale: 1, duration: 380, ease: 'Back.Out' });
        }
      }
      toast(msg, color, hold = 700) {
        if (this.lastToast?.active) { this.tweens.killTweensOf(this.lastToast); this.lastToast.destroy(); } // 앞 안내는 바로 지움 (겹치지 않게)
        const t = this.txt(W / 2, VIEW.y + 54, msg, 18, color, 4).setOrigin(0.5).setScrollFactor(0).setDepth(1050);
        this.lastToast = t;
        this.tweens.add({ targets: t, y: VIEW.y + 40, alpha: 0, delay: hold, duration: 500, onComplete: () => t.destroy() });
      }
      onScreen(wx, wy) {
        const cam = this.cameras.main;
        return wx > cam.scrollX && wx < cam.scrollX + W && wy > cam.scrollY + VIEW.y && wy < cam.scrollY + VIEW.y + VIEW.h;
      }
      drawMini() {
        const S = N * 2 + 2, b = this.miniBuf.data;
        const put = (x, y, c, a = 255) => { const o = (y * S + x) * 4; b[o] = c[0]; b[o + 1] = c[1]; b[o + 2] = c[2]; b[o + 3] = a; };
        const dark = [24, 32, 48], stone = [176, 182, 190];
        const land = PAL.map((c) => rgb(c.base)), trl = PAL.map((c) => rgb(c.tr));
        for (let x = 0; x < S; x++) { put(x, 0, dark); put(x, S - 1, dark); put(0, x, dark); put(S - 1, x, dark); }
        for (let i = 0; i < N * N; i++) {
          const x = i % N, y = (i - x) / N;
          const c = sim.trail[i] >= 0 ? trl[sim.trail[i]] : sim.own[i] >= 0 ? land[sim.own[i]] : stone;
          put(1 + x * 2, 1 + y * 2, c); put(2 + x * 2, 1 + y * 2, c); put(1 + x * 2, 2 + y * 2, c); put(2 + x * 2, 2 + y * 2, c);
        }
        // 지금 보이는 곳 (흰 테두리)
        const cam = this.cameras.main;
        const vx0 = Math.max(1, Math.round(1 + ((cam.scrollX - WM) / T) * 2)), vx1 = Math.min(S - 2, Math.round(1 + ((cam.scrollX + W - WM) / T) * 2));
        const vy0 = Math.max(1, Math.round(1 + ((cam.scrollY + VIEW.y - WM) / T) * 2)), vy1 = Math.min(S - 2, Math.round(1 + ((cam.scrollY + VIEW.y + VIEW.h - WM) / T) * 2));
        for (let x = vx0; x <= vx1; x++) { put(x, vy0, [255, 255, 255]); put(x, vy1, [255, 255, 255]); }
        for (let y = vy0; y <= vy1; y++) { put(vx0, y, [255, 255, 255]); put(vx1, y, [255, 255, 255]); }
        // 머리: 깜빡이는 3×3 점
        const on = Math.floor(this.blink * 4) % 2 === 0;
        for (const p of sim.players) {
          if (!p.alive) continue;
          const cx = 1 + p.x * 2, cy = 1 + p.y * 2;
          const c = on ? [255, 255, 255] : rgb(PAL[p.id].lo);
          for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
            const x = cx + dx, y = cy + dy; if (x < 1 || y < 1 || x > S - 2 || y > S - 2) continue;
            put(x, y, (dx === -1 || dx === 2 || dy === -1 || dy === 2) ? dark : c);
          }
        }
        const tex = this.textures.get('mini');
        tex.getContext().putImageData(this.miniBuf, 0, 0); tex.refresh();
      }
      // 화면 밖 AI → 가장자리 화살표
      drawArrows(a) {
        const g = this.arrows; g.clear();
        const cam = this.cameras.main;
        const cx = W / 2, cy = VIEW.y + VIEW.h / 2;
        for (const p of sim.players) {
          if (p.id === 0 || !p.alive) continue;
          const [wx, wy] = this.worldPos(p, a);
          const sx = wx - cam.scrollX, sy = wy - cam.scrollY - 10;
          if (sx > 4 && sx < W - 4 && sy > VIEW.y + 4 && sy < VIEW.y + VIEW.h - 4) continue;
          const dx = sx - cx, dy = sy - cy;
          const k = Math.min((W / 2 - 14) / Math.abs(dx || 1e-6), (VIEW.h / 2 - 14) / Math.abs(dy || 1e-6));
          const ex = cx + dx * k, ey = cy + dy * k, ang = Math.atan2(dy, dx);
          const pt = (r, t) => [ex + Math.cos(ang + t) * r, ey + Math.sin(ang + t) * r];
          const [a1, a2, a3] = [pt(10, 0), pt(8, 2.4), pt(8, -2.4)];
          g.fillStyle(0x101828, 1); g.fillTriangle(...pt(13, 0), ...pt(11, 2.4), ...pt(11, -2.4));
          g.fillStyle(hex(PAL[p.id].base), 1); g.fillTriangle(...a1, ...a2, ...a3);
        }
      }
      update(_t, delta) {
        let dt = Math.min(0.1, delta / 1000);
        this.blink += dt;
        if (mode === 'ready') {
          if (this.tapTx) this.tapTx.setVisible(Math.floor(this.blink * 2) % 2 === 0);
        } else if (mode === 'count') {
          const before = countT; countT += dt;
          const mark = [0, 0.5, 1.0, 1.5];
          const labels = ['3', '2', '1', '시작!'];
          mark.forEach((m, i) => { if (before <= m && countT > m) { this.showCount(labels[i]); if (i < 3) api.sfx.blip(); else api.sfx.select(); } });
          if (countT > 1.5) { mode = 'play'; t0 = performance.now(); pausedTotal = 0; clock = 0; acc = 0; timers.push(setTimeout(() => mode === 'play' && this.showCount(''), 500)); }
        } else if (mode === 'play') {
          dt *= timeScale;
          clock += dt; acc += dt;
          let ticked = false;
          while (acc >= STEP && mode === 'play') {
            acc -= STEP;
            sim.tick(); ticked = true;
            const evs = sim.events; sim.events = [];
            evs.forEach((e) => this.handle(e));
            if (sim.players[0].lives <= 0) finish('dead');
          }
          if (ticked) this.refreshTiles();
          if (mode === 'play' && clock >= ROUND) finish('time');
        }
        const a = mode === 'play' ? Math.min(1, acc / STEP) : 1;
        // 몬스터 그리기
        this.rings.clear();
        sim.players.forEach((p) => {
          const s = this.mons[p.id];
          if (!p.alive && p.lives > 0) { if (!this.tweens.isTweening(s)) s.setVisible(false); return; }
          s.setVisible(true);
          if (p.alive && !this.tweens.isTweening(s)) s.setAlpha(sim.safe(p) && Math.floor(this.blink * 10) % 2 ? 0.3 : 1);
          const moving = p.alive && (p.x !== p.px || p.y !== p.py) && mode === 'play';
          const [wx, wy] = this.worldPos(p, a);
          const hop = moving ? Math.round(Math.abs(Math.sin(this.blink * 16 + p.id)) * 2) : 0;
          s.setPosition(Math.round(wx), Math.round(wy + 7 - hop));
          s.setDepth(10 + wy);
          if (p.dir === 1) s.setFlipX(true); else if (p.dir === 3) s.setFlipX(false);
          const c = hex(PAL[p.id].base);
          this.rings.fillStyle(0x101828, 0.35); this.rings.fillEllipse(wx, wy + 6, 20, 8);
          this.rings.lineStyle(2, c, 1); this.rings.strokeEllipse(wx, wy + 5, 20, 8);
        });
        // 나 표시 (머리 위 ▼)
        const me = sim.players[0]; const m = this.marker; m.clear();
        if (me.alive) {
          const [wx, wy] = this.worldPos(me, a);
          const by = Math.round(wy - 32 + Math.sin(this.blink * 5) * 2);
          m.fillStyle(0x101828, 1); m.fillTriangle(wx - 6, by - 7, wx + 6, by - 7, wx, by + 1);
          m.fillStyle(0xffffff, 1); m.fillTriangle(wx - 4, by - 6, wx + 4, by - 6, wx, by - 1);
        }
        this.camTarget(false);
        // 점수줄
        sim.players.forEach((p, i) => {
          const b = this.badges[i];
          b.tx.setText(`${((p.land * 100) / (N * N)).toFixed(1)}%`);
          b.icon.setAlpha(p.alive ? 1 : 0.35);
        });
        const left = Math.max(0, Math.ceil(ROUND - (mode === 'play' || mode === 'result' ? clock : 0)));
        this.timerTx.setText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
        this.timerTx.setColor(left <= 10 && mode === 'play' ? (Math.floor(this.blink * 4) % 2 ? '#e5534b' : '#b03634') : '#24324a');
        this.hearts.forEach((h, k) => h.setTexture(k < me.lives ? 'heart' : 'heart0'));
        this.myPct.setText(`${((me.land * 100) / (N * N)).toFixed(1)}%`);
        this.pads.forEach((q) => {
          q.flash = Math.max(0, q.flash - dt);
          const cur = me.dir === q.d && mode === 'play';
          q.b.setTint(q.flash > 0 ? 0xffd860 : cur ? 0xfff0b0 : 0xffffff);
          q.b.y = q.y + (q.flash > 0 ? 2 : 0); q.a.y = q.y - 2 + (q.flash > 0 ? 2 : 0);
        });
        // 위험: 내 꼬리 근처에 다른 머리
        this.danger.clear();
        if (mode === 'play' && me.alive && me.trail.length && sim.threat(me) <= 4) {
          const al = 0.45 + 0.35 * Math.sin(this.blink * 18);
          this.danger.lineStyle(6, 0xff3030, al); this.danger.strokeRect(3, VIEW.y + 3, W - 6, VIEW.h - 6);
        }
        this.drawArrows(a);
        this.drawMini();
      }
    };

    loadPhaser().then(async (Phaser) => {
      if (dead) return;
      try { await Promise.race([document.fonts?.load?.(`12px ${FONT}`), new Promise((r) => setTimeout(r, 1500))]); } catch { /* 글꼴 없어도 진행 */ }
      if (dead) return;
      game = new Phaser.Game({
        type: Phaser.AUTO, parent: box, width: W, height: H, pixelArt: true, backgroundColor: '#74c050',
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
        audio: { noAudio: true }, banner: false,
        input: { keyboard: false, mouse: false, touch: false, gamepad: false },
        scene: makeScene(Phaser),
      });
      if (dead) { game.destroy(true); game = null; }
    }).catch(() => {
      if (!dead) box.innerHTML = '<p style="margin:auto;font-size:14px;color:#b03634">게임을 불러오지 못했어요. 인터넷을 확인해 주세요.</p>';
    });

    // 시험용 (개발 페이지에서만)
    if (dev) {
      window.__land = {
        sim, enclose, LandSim, N,
        get game() { return game; }, get scene() { return scene; },
        speed: (k) => { timeScale = k; },
        start: () => { begin(); },
        state: () => ({ mode, clock, reason, finalScore, finalMs, paused, sent,
          cam: scene ? { x: scene.cameras.main.scrollX, y: scene.cameras.main.scrollY } : null,
          players: sim.players.map((p) => ({ id: p.id, alive: p.alive, x: p.x, y: p.y, land: p.land, trail: p.trail.length, kills: p.kills })) }),
      };
    }

    return () => {
      dead = true; clearTimeout(endTimer); timers.forEach(clearTimeout);
      box.removeEventListener('pointerdown', onDown);
      box.removeEventListener('pointermove', onMove);
      box.removeEventListener('pointerup', onUp);
      box.removeEventListener('pointercancel', onUp);
      stage.removeEventListener('touchmove', noScroll);
      stage.removeEventListener('mg-pause', onPause);
      stage.removeEventListener('mg-resume', onResume);
      window.removeEventListener('keydown', onKey);
      if (game) { game.destroy(true); game = null; }
      box.remove();
      if (dev && window.__land) delete window.__land;
    };
  },
};
