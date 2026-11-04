// 포켓몬 그림 그리기. 그림은 Storage 'sprites' (0031·0032): 1~649 = 블랙·화이트 움직이는 GIF, 650~ = 같은 화풍 PNG, 색이 다른(반짝) 그림도 따로.
// 올린 그림이 없는 칸은 예전 web/sprites/atlas.png (64×64 칸).
// - 809마리를 한꺼번에 풀면 폰 메모리가 모자라서: 화면에 보이는 그림만 받아서 풀고 (IntersectionObserver), 최근 것 96개만 기억 (LRU).
// - 그림 둘레의 빈칸은 잘라 냄 → 발이 아래에 닿고, 크기는 기기 픽셀 정수 배 (도트가 고르게).
// - 64칸이 필요한 곳 (잡기 장면·미니게임): 64보다 크면 '많은 색 + 어두운 테두리 남기기' 로 줄여서 도트가 뭉개지지 않게.
// 예전 판: .work/sprites/sprites_v1.js (아틀라스만), sprites_v2.js (올린 그림을 처음에 다 받음)
import { CONFIG } from './config.js';
import { decodeGif, isGif } from './gif.js';

const ATLAS_URL = new URL('../sprites/atlas.png', import.meta.url).href;
const atlas = new Image();
const atlasLoaded = new Promise((resolve) => { atlas.onload = resolve; atlas.onerror = resolve; });
atlas.src = ATLAS_URL;

export const spriteURL = (path) => `${CONFIG.SUPABASE_URL}/storage/v1/object/public/sprites/${path}`;
const MAP_KEY = 'hafs.sprites';
const MAX_RECS = 96;

export function cellOf(dex) {
  const i = dex - 1;
  return [(i % CONFIG.ATLAS_COLS) * 64, Math.floor(i / CONFIG.ATLAS_COLS) * 64];
}
const inAtlas = (dex) => atlas.naturalWidth && dex >= 1 && dex <= (atlas.naturalWidth / 64) * (atlas.naturalHeight / 64);

const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// ── 그림 풀기: GIF 는 프레임별로, PNG·WebP 는 한 장. 모든 프레임을 합친 테두리로 잘라 냄 ──
// rec = { w, h, frames: [canvas], delays: [ms], total, modes: {} }
function cropRec(w, h, rgbaFrames, delays) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (const d of rgbaFrames) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const frames = rgbaFrames.map((d) => {
    const c = mkCanvas(cw, ch); const g = c.getContext('2d');
    const img = g.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) img.data.set(d.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + cw) * 4), y * cw * 4);
    g.putImageData(img, 0, 0);
    return c;
  });
  return { w: cw, h: ch, frames, delays, total: delays.reduce((a, b) => a + b, 0), modes: {} };
}

export async function decodeSprite(buf) {
  const u8 = new Uint8Array(buf);
  if (isGif(u8)) {
    const g = decodeGif(u8);
    return cropRec(g.w, g.h, g.frames.map((f) => f.rgba), g.frames.map((f) => f.delay));
  }
  const bmp = await createImageBitmap(new Blob([u8]));
  const c = mkCanvas(bmp.width, bmp.height); const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0); bmp.close?.();
  return cropRec(c.width, c.height, [g.getImageData(0, 0, c.width, c.height).data], [0]);
}

// ── 그림 목록 (도감번호 → 그림 · 색이 다른 그림) ──
let MAP = new Map();      // dex → { n: path, s: shinyPath|null }
const parseMap = (obj) => new Map(Object.entries(obj || {}).map(([k, v]) => { const [n, s] = String(v).split('|'); return [Number(k), { n, s: s || null }]; })
  .filter(([k, v]) => k > 0 && v.n));
const readMap = () => { try { return JSON.parse(localStorage.getItem(MAP_KEY) || '{}') || {}; } catch { return {}; } };
MAP = parseMap(readMap());
export const hasCustomSprite = (dex) => MAP.has(Number(dex));

// ── 받은 그림 (LRU) ──
const REC = new Map();    // path → rec  (Map 순서 = 최근에 쓴 순서)
const LOADING = new Map();
const touch = (path) => { const r = REC.get(path); if (r) { REC.delete(path); REC.set(path, r); } return r; };
let active = 0; const waiters = [];
const slot = () => (active < 6 ? (active++, Promise.resolve()) : new Promise((r) => waiters.push(r)).then(() => { active++; }));
const release = () => { active--; waiters.shift()?.(); };
function loadPath(path) {
  if (REC.has(path)) return Promise.resolve(touch(path));
  if (LOADING.has(path)) return LOADING.get(path);
  const p = (async () => {
    await slot();
    try {
      const r = await fetch(spriteURL(path));
      if (!r.ok) throw new Error(`sprite ${r.status}`);
      const rec = await decodeSprite(await r.arrayBuffer());
      rec.path = path;
      REC.set(path, rec);
      while (REC.size > MAX_RECS) REC.delete(REC.keys().next().value);
      return rec;
    } catch (e) { console.warn('[sprites]', path, e.message); return null; } finally { LOADING.delete(path); release(); }
  })();
  LOADING.set(path, p);
  return p;
}
const pathFor = (dex, shiny) => { const m = MAP.get(dex); return m ? (shiny && m.s ? m.s : m.n) : null; };
// 이 포켓몬 그림을 받아 둠 (미니게임·잡기 장면이 시작 전에 부름)
export const ensureSprites = (list, shiny = false) => Promise.all([...new Set(list.map(Number))].filter((d) => MAP.has(d))
  .map((d) => loadPath(pathFor(d, shiny))));

// ── 처음 준비: 아틀라스 + 서버 목록 (최대 3초 — 느린 망·오프라인에서 화면이 멈추지 않게) ──
const timeout = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchMap() {
  const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/sprite_overrides`, {
    method: 'POST', headers: { apikey: CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (!r.ok) throw new Error(`sprite_overrides ${r.status}`);
  return (await r.json()) || {};
}
export async function refreshSprites() {
  const obj = await fetchMap();
  try { localStorage.setItem(MAP_KEY, JSON.stringify(obj)); } catch { /* 저장 못 해도 괜찮음 */ }
  const next = parseMap(obj);
  const changed = next.size !== MAP.size || [...next].some(([k, v]) => { const o = MAP.get(k); return !o || o.n !== v.n || o.s !== v.s; });
  MAP = next;
  if (changed) { SHEETS.clear(); repaintAll(); }
}
const firstSync = refreshSprites().catch(() => { /* 오프라인: 저장된 목록 그대로 */ });
export const spritesReady = atlasLoaded.then(() => Promise.race([firstSync, timeout(3000)]));

// ── 64×64 칸 (잡기 장면·미니게임) ──
// 64보다 크면 줄임: 칸마다 덮는 원래 픽셀 중 반 넘게 보이면 칠하고, 어두운 테두리 색이 1/3 넘으면 그 색, 아니면 가장 많은 색 (흐리게 섞지 않음)
function shrinkTo(src, w, h, k) {
  const tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
  const sg = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const out = mkCanvas(tw, th); const og = out.getContext('2d'); const img = og.createImageData(tw, th); const o = img.data;
  const lum = (i) => 0.299 * sg[i] + 0.587 * sg[i + 1] + 0.114 * sg[i + 2];
  for (let y = 0; y < th; y++) {
    const sy0 = Math.floor(y / k), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) / k));
    for (let x = 0; x < tw; x++) {
      const sx0 = Math.floor(x / k), sx1 = Math.max(sx0 + 1, Math.floor((x + 1) / k));
      let tot = 0; const on = []; let dark = 0;
      for (let sy = sy0; sy < Math.min(h, sy1); sy++) for (let sx = sx0; sx < Math.min(w, sx1); sx++) {
        tot++; const i = (sy * w + sx) * 4;
        if (sg[i + 3] > 127) { on.push(i); if (lum(i) < 70) dark++; }
      }
      if (on.length * 2 < tot) continue;
      let pick;
      if (dark * 3 >= on.length) pick = on.reduce((a, b) => (lum(b) < lum(a) ? b : a));
      else {
        const cnt = new Map(); let best = on[0], bn = 0;
        for (const i of on) { const key = (sg[i] << 16) | (sg[i + 1] << 8) | sg[i + 2]; const n = (cnt.get(key) || 0) + 1; cnt.set(key, n); if (n > bn) { bn = n; best = i; } }
        pick = best;
      }
      const t = (y * tw + x) * 4; o[t] = sg[pick]; o[t + 1] = sg[pick + 1]; o[t + 2] = sg[pick + 2]; o[t + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}
export function fitCell(frame, w, h) {
  const c = mkCanvas(64, 64); const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  let src = frame, sw = w, sh = h;
  if (w > 64 || h > 64) { const k = Math.min(64 / w, 64 / h); src = shrinkTo(frame, w, h, k); sw = src.width; sh = src.height; }
  else { const s = Math.max(1, Math.floor(Math.min(64 / w, 64 / h, 1))); sw = w * s; sh = h * s; }
  g.drawImage(src, 0, 0, src.width, src.height, Math.floor((64 - sw) / 2), 64 - sh, sw, sh);
  return c;
}

// 이 포켓몬의 64×64 칸 (받아 둔 그림이 없으면 받기 시작하고 null)
export function monCell(dex, shiny = false) {
  dex = Number(dex);
  if (MAP.has(dex)) {
    const path = pathFor(dex, shiny); const rec = REC.get(path);
    if (!rec) { loadPath(path); return null; }
    return (rec.cell ||= fitCell(rec.frames[0], rec.w, rec.h));
  }
  if (!inAtlas(dex)) return null;
  const c = mkCanvas(64, 64); const [sx, sy] = cellOf(dex); c.getContext('2d').drawImage(atlas, sx, sy, 64, 64, 0, 0, 64, 64);
  return c;
}

// Phaser 가 불러갈 그림판: 필요한 포켓몬만 12칸씩 줄지어 → { url, frame(dex) }. 큰 그림판(809칸)은 폰 GPU 한계를 넘어서.
const SHEETS = new Map();
export async function atlasURL(dexes = []) {
  await spritesReady;
  const list = [...new Set(dexes.map(Number).filter((d) => d > 0))];
  const key = list.join(',');
  if (SHEETS.has(key)) return SHEETS.get(key);
  await ensureSprites(list);
  const cols = CONFIG.ATLAS_COLS, rows = Math.max(1, Math.ceil((list.length + 1) / cols));
  const c = mkCanvas(cols * 64, rows * 64); const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  list.forEach((d, i) => { const cell = monCell(d); if (cell) g.drawImage(cell, (i % cols) * 64, Math.floor(i / cols) * 64); });
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const idx = new Map(list.map((d, i) => [d, i]));
  const res = { url: blob ? URL.createObjectURL(blob) : ATLAS_URL, frame: (d) => idx.get(Number(d)) ?? list.length, cols };
  SHEETS.set(key, res);
  return res;
}

// 잡기 장면용: 움직이는 그림이면 64칸에 맞춘 프레임들, 아니면 null
export function monAnim(dex) {
  const path = pathFor(Number(dex), false); const rec = path && REC.get(path);
  if (!rec || rec.frames.length < 2) return null;
  return { frames: rec.frames.map((f) => fitCell(f, rec.w, rec.h)), delays: rec.delays, total: rec.total };
}

// ── 모드별 그림 (실루엣 · 흰색 · 반짝이) ──
const ATLAS_MODES = new Map();
function tint(src, color) {
  const c = mkCanvas(src.width, src.height); const g = c.getContext('2d');
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}
// 반짝 (색이 다른 그림이 없을 때만): 색이 있는 픽셀만 색상환을 돌림 (외곽선·흰색·회색은 그대로)
function shinyOf(src, dex) {
  const c = mkCanvas(src.width, src.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height); const d = img.data;
  const turn = 0.36 + ((dex * 0.137) % 0.28);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, ch = mx - mn;
    if (ch < 0.12 || l < 0.12 || l > 0.94) continue;
    let hh = mx === r ? ((gg - b) / ch) % 6 : mx === gg ? (b - r) / ch + 2 : (r - gg) / ch + 4;
    hh = ((hh / 6 + turn) % 1 + 1) % 1;
    const sat = ch / (1 - Math.abs(2 * l - 1));
    const q = (1 - Math.abs(2 * l - 1)) * sat, x = q * (1 - Math.abs(((hh * 6) % 2) - 1)), m = l - q / 2;
    const [r1, g1, b1] = [[q, x, 0], [x, q, 0], [0, q, x], [0, x, q], [x, 0, q], [q, 0, x]][Math.floor(hh * 6) % 6];
    d[i] = Math.round((r1 + m) * 255); d[i + 1] = Math.round((g1 + m) * 255); d[i + 2] = Math.round((b1 + m) * 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}
const makeMode = (base, mode, dex) => (mode === 'shiny' ? base.map((f) => shinyOf(f, dex))
  : mode === 'silhouette' ? base.map((f) => tint(f, '#20283a'))
  : mode === 'white' ? base.map((f) => tint(f, '#ffffff'))
  : base);
function framesFor(dex, mode, rec) {
  if (rec) return (rec.modes[`${mode}|${dex}`] ||= makeMode(rec.frames, mode, dex));
  const k = `${dex}|${mode}`;
  if (!ATLAS_MODES.has(k)) {
    const c = mkCanvas(64, 64); const [sx, sy] = cellOf(dex); c.getContext('2d').drawImage(atlas, sx, sy, 64, 64, 0, 0, 64, 64);
    ATLAS_MODES.set(k, makeMode([c], mode, dex));
  }
  return ATLAS_MODES.get(k);
}

// ── 화면에 그리기 ──
const LIVE = new Set();        // { c, dex, cssSize, mode, preview, idx, born, vis }
let raf = 0; let adds = 0;
const io = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver((ents) => { for (const en of ents) { const e = en.target.__spr; if (!e) continue; e.vis = en.isIntersecting; if (e.vis) draw(e); } }, { rootMargin: '300px' })
  : null;

function frameIdx(rec, now) {
  if (!rec || rec.frames.length < 2 || !rec.total) return 0;
  let t = now % rec.total;
  for (let i = 0; i < rec.delays.length; i++) { t -= rec.delays[i]; if (t < 0) return i; }
  return 0;
}

// 그림 크기: 원래 한 변(base, 64 이상)을 기기 픽셀 정수 배로. 화면 칸보다 훨씬 크면 줄임.
export function spriteBox(base, cssSize, dpr = window.devicePixelRatio || 1) {
  const target = cssSize * dpr;
  if (base <= target * 1.25) { const s = Math.max(1, Math.round(target / base)); return { px: base * s, s }; }
  const px = Math.max(16, Math.round(target)); return { px, s: px / base };
}

// 이 칸에 그릴 그림: 올린 그림이면 rec (없으면 받기 시작 → 받으면 다시 그림), 아니면 null (= 아틀라스)
function recOf(e) {
  if (e.preview) return { rec: e.preview, mode: e.mode };
  if (!MAP.has(e.dex)) return { rec: null, mode: e.mode };
  const realShiny = e.mode === 'shiny' && MAP.get(e.dex).s;
  const path = pathFor(e.dex, e.mode === 'shiny');
  const rec = touch(path);
  if (!rec && (e.vis || !io)) loadPath(path).then((r) => { if (r) for (const x of LIVE) if (x.dex === e.dex) draw(x); kick(); });
  return { rec, mode: realShiny ? 'normal' : e.mode, wait: !rec };
}

function draw(e, now = performance.now()) {
  const { c, dex, cssSize } = e;
  const { rec, mode, wait } = recOf(e);
  const dpr = window.devicePixelRatio || 1;
  const w = rec ? rec.w : 64, hh = rec ? rec.h : 64;
  const { px, s } = spriteBox(rec ? Math.max(64, w, hh) : 64, cssSize, dpr);
  if (c.width !== px || c.height !== px) { c.width = c.height = px; }
  c.style.width = c.style.height = `${px / dpr}px`;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, px, px);
  e.idx = frameIdx(rec, now);
  if (wait || (!dex && !rec)) return;                         // 아직 받는 중: 빈칸 (예전 그림이 잠깐 보이지 않게)
  if (!rec) {
    if (!inAtlas(dex)) return;
    if (mode === 'normal') { const [sx, sy] = cellOf(dex); g.drawImage(atlas, sx, sy, 64, 64, 0, 0, px, px); return; }
  }
  const fr = framesFor(dex, mode, rec);
  const f = fr[e.idx] || fr[0];
  const dw = Math.round(w * s), dh = Math.round(hh * s);
  g.drawImage(f, 0, 0, w, hh, Math.floor((px - dw) / 2), px - dh, dw, dh);   // 가운데, 아래 맞춤
}

const gone = (e, now) => !e.c.isConnected && now - e.born > 4000;
function tick(now) {
  raf = 0;
  let anim = false;
  for (const e of LIVE) {
    if (gone(e, now)) { LIVE.delete(e); io?.unobserve(e.c); continue; }
    if (!e.c.isConnected || (io && !e.vis)) continue;
    const { rec } = recOf(e);
    if (!rec || rec.frames.length < 2) continue;
    anim = true;
    if (!document.hidden && frameIdx(rec, now) !== e.idx) draw(e, now);
  }
  if (anim) raf = requestAnimationFrame(tick);
}
function kick() { if (!raf) raf = requestAnimationFrame(tick); }
function repaintAll() {
  const now = performance.now();
  for (const e of LIVE) { if (gone(e, now)) { LIVE.delete(e); io?.unobserve(e.c); continue; } draw(e, now); }
  kick();
}

// 화면에 ~cssSize CSS px 로 보이는 <canvas>.  mode: 'normal' | 'silhouette' | 'white' | 'shiny'
export function spriteCanvas(dex, cssSize = 96, mode = 'normal') {
  const c = document.createElement('canvas');
  c.className = 'sprite';
  paint(c, dex, cssSize, mode);
  return c;
}

export function paint(c, dex, cssSize = 96, mode = 'normal', preview = null) {
  let e = c.__spr;
  if (!e) { e = { c, born: performance.now(), idx: -1, vis: !io }; c.__spr = e; io?.observe(c); }
  Object.assign(e, { dex: Number(dex) || 0, cssSize, mode, preview });
  LIVE.add(e);
  if (++adds % 300 === 0) { const now = performance.now(); for (const x of LIVE) if (gone(x, now)) { LIVE.delete(x); io?.unobserve(x.c); } }
  const go = () => { draw(e); kick(); };
  if (atlas.complete) go(); else atlasLoaded.then(go);
  // 받기는 화면에 보일 때만 (IntersectionObserver) — 도감 805칸을 한꺼번에 받지 않게
  return c;
}

// 운영자 미리보기: 아직 올리지 않은 그림(rec)으로 그리기
export const previewCanvas = (rec, cssSize, mode = 'normal', dex = 1) => {
  const c = document.createElement('canvas'); c.className = 'sprite';
  return paint(c, dex, cssSize, mode, rec);
};

// 내 포켓몬 그림: 반짝 색을 켜 둔 포켓몬(collection.shiny_on)이면 색이 다른 그림으로
export const monSprite = (dex, cssSize, col) => {
  const c = spriteCanvas(dex, cssSize, col?.shiny_on ? 'shiny' : 'normal');
  if (col?.shiny_on) c.classList.add('shiny');
  return c;
};

// 예전 이름 (미니게임 공용 도구가 씀)
export const atlasImage = atlas;
export const atlasOk = () => !!atlas.naturalWidth;
