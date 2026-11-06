// 포켓몬 그림 그리기 (v4). 809마리 = 멈춘 도트 그림 (블랙·화이트 화풍), web/sprites/pk-*.webp 그림판 8장에 미리 담아 둠
// (tools/build_pokemon_sheets.py 가 만듦, 위치표 = web/sprites/pk-index.js). 움직이는 GIF 는 더 쓰지 않음 (느리고 자주 깨져서).
// - 모든 포켓몬은 96×96 칸에 원래 도트 크기 그대로, 가운데·아래 맞춤 → 도트 크기·발 위치가 모두 같음
// - 그림판은 필요한 장만 한 번 받음. 화면 가까이 있는 칸만 그리고, 멀리 벗어난 칸은 비워서 폰 메모리를 아낌
// - 운영자가 올린 그림 (Storage 'sprites', 이름이 '<id>-p.gif' 꼴이 아닌 것) 이 있으면 그것: 첫 장면만, 같은 96칸에 맞춤
// - 칸보다 작게 그려야 하면 '많은 색 + 어두운 테두리 남기기' 로 줄임 (도트가 뭉개지지 않게)
// 예전 판: .work/sprites/sprites_v1.js (아틀라스만), sprites_v2.js, sprites_v3.js (GIF 를 보이는 칸마다 받아서 풀기)
import { CONFIG } from './config.js';
import { decodeGif, isGif } from './gif.js';
import IDX from '../sprites/pk-index.js';

export const CELL = IDX.cell;   // 96

const ATLAS_URL = new URL('../sprites/atlas.png', import.meta.url).href;
const atlas = new Image();
const atlasLoaded = new Promise((resolve) => { atlas.onload = resolve; atlas.onerror = resolve; });
atlas.src = ATLAS_URL;

export const spriteURL = (path) => `${CONFIG.SUPABASE_URL}/storage/v1/object/public/sprites/${path}`;
const MAP_KEY = 'hafs.sprites';

export function cellOf(dex) {
  const i = dex - 1;
  return [(i % CONFIG.ATLAS_COLS) * 64, Math.floor(i / CONFIG.ATLAS_COLS) * 64];
}
const inAtlas = (dex) => atlas.naturalWidth && dex >= 1 && dex <= (atlas.naturalWidth / 64) * (atlas.naturalHeight / 64);

const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
// 작은 LRU (Map 순서 = 최근에 쓴 순서)
function lru(max) {
  const m = new Map();
  return {
    get(k) { const v = m.get(k); if (v !== undefined) { m.delete(k); m.set(k, v); } return v; },
    set(k, v) { m.set(k, v); while (m.size > max) m.delete(m.keys().next().value); return v; },
    clear() { m.clear(); },
  };
}

// ── 그림판 (pk-n0..3 = 보통, pk-s0..3 = 색이 다른) ──
const SHEET_IMG = new Map();   // 번호 → { img, ok, fail, p }
const WAIT = { wait: true };
function sheet(i) {
  let s = SHEET_IMG.get(i);
  if (s && s.fail && performance.now() - s.fail > 5000) s = null;   // 못 받았으면 5초 뒤 다시
  if (!s) {
    const img = new Image();
    const t = { img, ok: false, fail: 0 };
    t.p = new Promise((res) => {
      img.onload = () => { t.ok = true; res(t); repaintWaiting(); };
      // 못 받으면 5초 뒤 기다리는 칸을 다시 그림 → 그때 다시 받음 (안 하면 빈칸으로 계속 남음)
      img.onerror = () => { t.fail = performance.now(); res(null); setTimeout(repaintWaiting, 5100); };
    });
    img.src = new URL(`../sprites/${IDX.sheets[i]}`, import.meta.url).href;
    SHEET_IMG.set(i, t);
    s = t;
  }
  return s;
}

// ── 그림 풀기 (운영자가 올린 그림): GIF 는 프레임별로, PNG·WebP 는 한 장. 모든 프레임을 합친 테두리로 잘라 냄 ──
// rec = { w, h, frames: [canvas], delays: [ms], total }   (운영자 화면이 크기·장면 수를 보여 줌. 앱은 첫 장면만 씀)
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
  return { w: cw, h: ch, frames, delays, total: delays.reduce((a, b) => a + b, 0) };
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

// ── 줄이기: 칸마다 덮는 원래 픽셀 중 반 넘게 보이면 칠하고, 어두운 테두리 색이 1/3 넘으면 그 색, 아니면 가장 많은 색 (흐리게 섞지 않음) ──
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
      if (!on.length || on.length * 2 < tot) continue;
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

// 올린 그림 → 96칸에 맞는 한 장: 첫 장면만, 반투명 가장자리 없앰, 둘레 빈칸 자름,
// 96보다 크면 도트답게 줄이고, 아주 작으면 (한 변 36 이하) 정수 배로 키움
export function normRec(rec) {
  if (rec._norm) return rec._norm;
  const g = rec.frames[0].getContext('2d', { willReadFrequently: true });
  const img = g.getImageData(0, 0, rec.w, rec.h); const d = img.data;
  let x0 = rec.w, y0 = rec.h, x1 = -1, y1 = -1;
  for (let y = 0; y < rec.h; y++) for (let x = 0; x < rec.w; x++) {
    const i = (y * rec.w + x) * 4;
    if (d[i + 3] > 127) { d[i + 3] = 255; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } else d[i + 3] = 0;
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  let cv = mkCanvas(w, h); cv.getContext('2d').putImageData(img, -x0, -y0);
  const m = Math.max(w, h);
  if (m > CELL) cv = shrinkTo(cv, w, h, CELL / m);
  else if (m <= 36) {
    const s = Math.floor(72 / m); const big = mkCanvas(w * s, h * s); const bg = big.getContext('2d');
    bg.imageSmoothingEnabled = false; bg.drawImage(cv, 0, 0, w * s, h * s); cv = big;
  }
  rec._norm = { cv, w: cv.width, h: cv.height };
  return rec._norm;
}

// ── 운영자가 올린 그림 목록 (species.id → 그림 · 색이 다른 그림). 공식 그림 ('<id>-p.gif' 꼴) 은 그림판에 이미 있어서 안 받음 ──
let MAP = new Map();      // dex → { n: path, s: shinyPath|null }
const parseMap = (obj) => new Map(Object.entries(obj || {}).map(([k, v]) => { const [n, s] = String(v).split('|'); return [Number(k), { n, s: s || null }]; })
  .filter(([k, v]) => k > 0 && v.n));
const readMap = () => { try { return JSON.parse(localStorage.getItem(MAP_KEY) || '{}') || {}; } catch { return {}; } };
MAP = parseMap(readMap());
const isPack = (p) => /^\d+-ps?\.(gif|png)$/.test(p || '');
// 올린 그림 경로 (없으면 null). 색이 다른 그림을 따로 올리지 않았으면 보통 그림 (색은 돌려서 만듦)
function customPath(dex, shiny) {
  const m = MAP.get(dex);
  if (!m) return null;
  if (shiny && m.s && !isPack(m.s)) return m.s;
  return isPack(m.n) ? null : m.n;
}
export const hasCustomSprite = (dex) => !!customPath(Number(dex), false);

// ── 받은 올린 그림 (LRU, 96칸에 맞춘 것) ──
const REC = lru(48);
const LOADING = new Map();
function loadPath(path) {
  const hit = REC.get(path);
  if (hit) return Promise.resolve(hit);
  if (LOADING.has(path)) return LOADING.get(path);
  const p = (async () => {
    try {
      const r = await fetch(spriteURL(path));
      if (!r.ok) throw new Error(`sprite ${r.status}`);
      const rec = await decodeSprite(await r.arrayBuffer());
      return REC.set(path, normRec(rec));
    } catch (e) { console.warn('[sprites]', path, e.message); return null; } finally { LOADING.delete(path); }
  })();
  LOADING.set(path, p);
  p.then((r) => { if (r) repaintWaiting(); });
  return p;
}

// 갈래 종 (0037, species.id 10000+): 그림판에는 같은 전국도감 번호의 종 (따로 있는 계열) 그림을 씀. 운영자가 그 갈래 종에 그림을 올렸으면 그것
// 0050 계열 복제본 (lines.clone_of, 종 번호 6001~): 그림판에 칸이 없으면 같은 전국도감 번호의 (그림판에 있는) 종 그림. 운영자가 올린 그림이 있으면 그것
const ALIAS = new Map();
export function aliasSprites(species = []) {
  const base = new Map();
  for (const s of species) if (s.id < 10000 && s.dex && !base.has(s.dex) && IDX.n[s.id]) base.set(s.dex, s.id);
  for (const s of species) if (s.id < 10000 && s.dex && !base.has(s.dex)) base.set(s.dex, s.id);
  for (const s of species) if (s.dex && base.has(s.dex) && base.get(s.dex) !== s.id && (s.id >= 10000 || !IDX.n[s.id])) ALIAS.set(s.id, base.get(s.dex));
}
const realId = (d) => (ALIAS.has(d) && !customPath(d, false) && (d >= 10000 ? !MAP.has(d) : true) ? ALIAS.get(d) : d);

// 이 포켓몬 그림을 받아 둠 (미니게임·잡기 장면이 시작 전에 부름)
export const ensureSprites = (list, shiny = false) => Promise.all([...new Set(list.map(Number).map(realId))].map((d) => {
  const cp = customPath(d, shiny);
  if (cp) return loadPath(cp);
  const ent = (shiny && IDX.s[d]) || IDX.n[d];
  return ent ? sheet(ent[0]).p : atlasLoaded;
}));

// ── 처음 준비: 서버 목록 (최대 3초 — 느린 망·오프라인에서 화면이 멈추지 않게) ──
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
  if (changed) { SHEETS.clear(); FX.clear(); C64.clear(); SMALL.clear(); repaintAll(); }
}
const firstSync = refreshSprites().catch(() => { /* 오프라인: 저장된 목록 그대로 */ });
export const spritesReady = Promise.race([firstSync, timeout(3000)]);

// ── 그릴 그림 찾기: { img, sx, sy, w, h, key, fx } | WAIT (받는 중) | null (그림 없음) ──
//    fx = 덧입힐 효과 (normal · silhouette · white · shiny = 색 돌리기)
function sourceOf(dex, mode, preview) {
  const shiny = mode === 'shiny';
  dex = realId(dex);
  if (preview) {
    const n = normRec(preview);
    return { img: n.cv, sx: 0, sy: 0, w: n.w, h: n.h, key: (preview._k ||= `pv${Math.random()}`), fx: mode };
  }
  const cp = customPath(dex, shiny);
  if (cp) {
    const n = REC.get(cp);
    if (!n) { loadPath(cp); return WAIT; }
    const real = shiny && cp === MAP.get(dex).s;
    return { img: n.cv, sx: 0, sy: 0, w: n.w, h: n.h, key: cp, fx: real ? 'normal' : mode };
  }
  const ent = (shiny && IDX.s[dex]) || IDX.n[dex];
  if (ent) {
    const s = sheet(ent[0]);
    if (!s.ok) return WAIT;
    return { img: s.img, sx: ent[1], sy: ent[2], w: ent[3], h: ent[4], key: `${shiny ? 's' : 'n'}${dex}`, fx: shiny && IDX.s[dex] ? 'normal' : mode };
  }
  if (!atlas.complete) return WAIT;
  if (!inAtlas(dex)) return null;
  const [sx, sy] = cellOf(dex);
  return { img: atlas, sx, sy, w: 64, h: 64, key: `a${dex}`, fx: mode };
}

// ── 효과 (실루엣 · 흰색 · 색 돌리기) — 그림 한 장 크기 캔버스로 만들어 둠 ──
const FX = lru(160);
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
// 효과를 입힌 (또는 need 이면 그냥 잘라 낸) 그림 한 장 캔버스 → { img, sx: 0, sy: 0, w, h, key, fx: 'normal' }
function withFx(src, dex, need = false) {
  if (src.fx === 'normal' && !need) return src;
  const k = `${src.key}|${src.fx}`;
  let c = FX.get(k);
  if (!c) {
    c = mkCanvas(src.w, src.h); c.getContext('2d').drawImage(src.img, src.sx, src.sy, src.w, src.h, 0, 0, src.w, src.h);
    if (src.fx === 'shiny') c = shinyOf(c, dex);
    else if (src.fx === 'silhouette') c = tint(c, '#20283a');
    else if (src.fx === 'white') c = tint(c, '#ffffff');
    FX.set(k, c);
  }
  return { img: c, sx: 0, sy: 0, w: src.w, h: src.h, key: k, fx: 'normal' };
}

// ── 64×64 칸 (잡기 장면·미니게임): 64보다 크면 도트답게 줄임, 아니면 원래 크기. 가운데·아래 맞춤 ──
export function fitCell(frame, w, h) {
  const c = mkCanvas(64, 64); const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  let src = frame, sw = w, sh = h;
  if (w > 64 || h > 64) { const k = Math.min(64 / w, 64 / h); src = shrinkTo(frame, w, h, k); sw = src.width; sh = src.height; }
  g.drawImage(src, 0, 0, sw, sh, Math.floor((64 - sw) / 2), 64 - sh, sw, sh);
  return c;
}
const C64 = lru(64);
// 이 포켓몬의 64×64 칸 (그림판을 아직 받는 중이면 받기 시작하고 null)
export function monCell(dex, shiny = false) {
  dex = Number(dex);
  const src = sourceOf(dex, shiny ? 'shiny' : 'normal');
  if (!src || src === WAIT) return null;
  const f = withFx(src, dex, true);
  return C64.get(f.key) || C64.set(f.key, fitCell(f.img, f.w, f.h));
}

// Phaser 가 불러갈 그림판: 필요한 포켓몬만 12칸씩 줄지어 (64×64 칸) → { url, frame(dex), cols }
const SHEETS = new Map();
export async function atlasURL(dexes = [], shiny = false) {   // shiny = 반짝이는 색 그림 (0042 잡기 장면)
  await spritesReady;
  const list = [...new Set(dexes.map(Number).filter((d) => d > 0))];
  const key = (shiny ? 's:' : '') + list.join(',');
  if (SHEETS.has(key)) return SHEETS.get(key);
  await ensureSprites(list, shiny);
  const cols = CONFIG.ATLAS_COLS, rows = Math.max(1, Math.ceil((list.length + 1) / cols));
  const c = mkCanvas(cols * 64, rows * 64); const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  list.forEach((d, i) => { const cell = monCell(d, shiny); if (cell) g.drawImage(cell, (i % cols) * 64, Math.floor(i / cols) * 64); });
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const idx = new Map(list.map((d, i) => [d, i]));
  const res = { url: blob ? URL.createObjectURL(blob) : ATLAS_URL, frame: (d) => idx.get(Number(d)) ?? list.length, cols };
  SHEETS.set(key, res);
  return res;
}

// 운영자 페이지 '그림 내려받기': 이 포켓몬 그림 한 장 → PNG Blob (그림이 없으면 null)
//   96×96 칸에 원래 도트 크기 그대로, 가운데·아래 맞춤 (그림판과 같은 모양). 색이 다른 그림이 없으면 앱과 똑같이 색을 돌려서 만듦
export async function spriteBlob(dex, shiny = false) {
  dex = Number(dex);
  await spritesReady;
  await ensureSprites([dex], shiny);
  const src = sourceOf(dex, shiny ? 'shiny' : 'normal');
  if (!src || src === WAIT) return null;
  const f = withFx(src, realId(dex), true);
  const W = Math.max(CELL, f.w), H = Math.max(CELL, f.h);
  const c = mkCanvas(W, H); const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(f.img, 0, 0, f.w, f.h, Math.floor((W - f.w) / 2), H - f.h, f.w, f.h);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}

// 움직이는 그림은 더 쓰지 않음 (잡기 장면도 멈춘 그림)
export const monAnim = () => null;

// 예전 이름 (남겨 둠): 한 변 base 를 기기 픽셀 정수 배로
export function spriteBox(base, cssSize, dpr = window.devicePixelRatio || 1) {
  const target = cssSize * dpr;
  if (base <= target * 1.25) { const s = Math.max(1, Math.round(target / base)); return { px: base * s, s }; }
  const px = Math.max(16, Math.round(target)); return { px, s: px / base };
}

// ── 96칸 그림을 px×px 캔버스에 그리기 ──
// 배율 k = px/96 (모든 포켓몬 같음). 정수면 그대로, 1 보다 크면 정수 배로 키운 뒤 한 번 부드럽게 맞춤 (도트 크기가 고름),
// 1 보다 작으면 도트답게 줄인 그림 (만들어 둠)
const SMALL = lru(400);
function render(g, src, px, dex) {
  const k = px / CELL;
  const si = Math.round(k);
  if (si >= 1 && Math.abs(k - si) < 0.02) {
    g.imageSmoothingEnabled = false;
    g.drawImage(src.img, src.sx, src.sy, src.w, src.h, Math.floor((px - src.w * si) / 2), px - src.h * si, src.w * si, src.h * si);
  } else if (k > 1) {
    const s = Math.ceil(k);
    const dw = Math.round(src.w * k), dh = Math.round(src.h * k);
    const big = mkCanvas(src.w * s, src.h * s);   // 매번 새로 (같은 캔버스를 다시 쓰면 Safari 가 그리기 전에 지워져서 빈칸이 됨)
    const sg = big.getContext('2d'); sg.imageSmoothingEnabled = false;
    sg.drawImage(src.img, src.sx, src.sy, src.w, src.h, 0, 0, src.w * s, src.h * s);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
    g.drawImage(big, 0, 0, src.w * s, src.h * s, Math.floor((px - dw) / 2), px - dh, dw, dh);
  } else {
    const key = `${src.key}|${k.toFixed(3)}`;
    let sm = SMALL.get(key);
    if (!sm) { const f = withFx(src, dex, true); sm = SMALL.set(key, shrinkTo(f.img, f.w, f.h, k)); }
    g.imageSmoothingEnabled = false;
    g.drawImage(sm, Math.floor((px - sm.width) / 2), px - sm.height);
  }
}

// ── 화면에 그리기 ──
const LIVE = new Set();        // { c, dex, cssSize, mode, preview, born, vis, wait }
let adds = 0;
// 화면 가까이 (400px 안) 오면 그리고, 멀어지면 캔버스를 비움 (도감 809칸 × 큰 캔버스 = 폰 메모리 부족 방지)
const io = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver((ents) => {
    for (const en of ents) {
      const e = en.target.__spr; if (!e) continue;
      e.vis = en.isIntersecting;
      if (e.vis) draw(e); else if (e.c.width > 1) { e.c.width = 1; e.c.height = 1; }   // 1×1 (가로세로 비율은 그대로)
    }
  }, { rootMargin: '400px' })
  : null;

function draw(e) {
  const { c, dex, cssSize, mode } = e;
  c.style.width = c.style.height = `${cssSize}px`;
  if (io && !e.vis) { e.wait = false; return; }
  const dpr = window.devicePixelRatio || 1;
  const px = Math.max(1, Math.round(cssSize * dpr));
  if (c.width !== px || c.height !== px) { c.width = c.height = px; }
  const g = c.getContext('2d');
  g.clearRect(0, 0, px, px);
  const src = sourceOf(dex, mode, e.preview);
  e.wait = src === WAIT;
  if (!src || src === WAIT) return;                       // 받는 중이면 빈칸 → 받으면 다시 그림
  render(g, withFx(src, dex), px, dex);
}

const gone = (e, now) => !e.c.isConnected && now - e.born > 4000;
function sweep() {
  const now = performance.now();
  for (const e of LIVE) if (gone(e, now)) { LIVE.delete(e); io?.unobserve(e.c); }
}
function repaintWaiting() { sweep(); for (const e of LIVE) if (e.wait) draw(e); }
function repaintAll() { sweep(); for (const e of LIVE) draw(e); }
atlasLoaded.then(repaintWaiting);

// 화면에 cssSize CSS px 정사각형으로 보이는 <canvas>.  mode: 'normal' | 'silhouette' | 'white' | 'shiny'
export function spriteCanvas(dex, cssSize = 96, mode = 'normal') {
  const c = document.createElement('canvas');
  c.className = 'sprite';
  c.width = c.height = 1;
  paint(c, dex, cssSize, mode);
  return c;
}

// 다시 붙인 canvas 를 바로 그림 (떼어 둔 동안 IntersectionObserver 가 1×1 로 비워 둠 → 다음 프레임까지 빈칸으로 깜빡이지 않게). 화면 밖이면 IO 가 다시 비움
export function paintNow(c) { const e = c.__spr; if (e && c.isConnected) { e.vis = true; draw(e); } }

export function paint(c, dex, cssSize = 96, mode = 'normal', preview = null) {
  let e = c.__spr;
  if (!e) { e = { c, born: performance.now(), vis: !io }; c.__spr = e; io?.observe(c); }
  Object.assign(e, { dex: Number(dex) || 0, cssSize, mode, preview });
  LIVE.add(e);
  if (++adds % 300 === 0) sweep();
  draw(e);
  return c;
}

// 운영자 미리보기: 아직 올리지 않은 그림(rec)으로 그리기
export const previewCanvas = (rec, cssSize, mode = 'normal', dex = 1) => {
  const c = document.createElement('canvas'); c.className = 'sprite'; c.width = c.height = 1;
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
