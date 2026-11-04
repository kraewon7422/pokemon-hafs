// 몬스터 그림 그리기. 기본 = web/sprites/atlas.png (64×64 칸), 운영자가 올린 그림(0031, Storage 'sprites')이 있으면 그걸로.
// - 화면 그림: 기기 픽셀 기준 정수 배율로 그려서 도트가 고르게 (갤럭시처럼 devicePixelRatio 가 2.625 같은 폰도).
// - 올린 GIF 는 움직임: 화면에 붙어 있는 캔버스만 rAF 로 프레임을 바꿈. 실루엣·흰색·반짝이도 프레임마다 정확히.
// - 미니게임·잡기 장면(Phaser)은 '합친 아틀라스'(atlas.png + 올린 그림의 첫 프레임을 64칸에 맞춰 넣은 것)를 씀.
// 예전 판: .work/sprites/sprites_v1.js
import { CONFIG } from './config.js';
import { decodeGif, isGif } from './gif.js';

const ATLAS_URL = new URL('../sprites/atlas.png', import.meta.url).href;
const atlas = new Image();
const atlasLoaded = new Promise((resolve) => { atlas.onload = resolve; atlas.onerror = resolve; });
atlas.src = ATLAS_URL;

export const spriteURL = (path) => `${CONFIG.SUPABASE_URL}/storage/v1/object/public/sprites/${path}`;
const MAP_KEY = 'hafs.sprites';

// ── 합친 아틀라스 (미니게임·Phaser 용) ──
export const atlasImage = document.createElement('canvas');   // 미니게임 캔버스에 직접 그릴 때 (web/js/games/common.js)
let sheetOk = false;
export const atlasOk = () => sheetOk;

export function cellOf(dex) {
  const i = dex - 1;
  return [(i % CONFIG.ATLAS_COLS) * 64, Math.floor(i / CONFIG.ATLAS_COLS) * 64];
}

// ── 올린 그림 ──
// rec = { w, h, frames: [canvas], delays: [ms], total, path, modes: {mode: [canvas…]} }
const OV = new Map();          // dex → rec
let version = 0;               // 바뀔 때마다 +1 (Phaser 용 URL 다시 만들기)

const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// 파일 내용(ArrayBuffer) → rec. GIF 는 프레임별로, PNG·WebP 는 한 장.
export async function decodeSprite(buf) {
  const u8 = new Uint8Array(buf);
  if (isGif(u8)) {
    const g = decodeGif(u8);
    const frames = g.frames.map((f) => { const c = mkCanvas(g.w, g.h); c.getContext('2d').putImageData(new ImageData(f.rgba, g.w, g.h), 0, 0); return c; });
    const delays = g.frames.map((f) => f.delay);
    return { w: g.w, h: g.h, frames, delays, total: delays.reduce((a, b) => a + b, 0), modes: {} };
  }
  const bmp = await createImageBitmap(new Blob([u8]));
  const c = mkCanvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.();
  return { w: c.width, h: c.height, frames: [c], delays: [0], total: 0, modes: {} };
}

async function loadRec(path) {
  const r = await fetch(spriteURL(path));
  if (!r.ok) throw new Error(`sprite ${r.status}`);
  const rec = await decodeSprite(await r.arrayBuffer());
  rec.path = path;
  return rec;
}

// 64×64 칸 하나에 맞춘 그림 (가운데, 아래 맞춤; 작으면 정수 배로 키움)
export function fitCell(frame, w, h) {
  const c = mkCanvas(64, 64); const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  let s = Math.min(64 / w, 64 / h); if (s >= 1) s = Math.floor(s);
  const dw = Math.round(w * s), dh = Math.round(h * s);
  g.drawImage(frame, 0, 0, w, h, Math.floor((64 - dw) / 2), 64 - dh, dw, dh);
  return c;
}

function buildSheet() {
  if (!atlas.naturalWidth) { sheetOk = false; return; }
  const maxDex = Math.max(0, ...OV.keys());
  const rows = Math.max(Math.ceil(atlas.naturalHeight / 64), Math.ceil(maxDex / CONFIG.ATLAS_COLS));
  atlasImage.width = CONFIG.ATLAS_COLS * 64; atlasImage.height = rows * 64;
  const g = atlasImage.getContext('2d'); g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, atlasImage.width, atlasImage.height);
  g.drawImage(atlas, 0, 0);
  for (const [dex, rec] of OV) { const [x, y] = cellOf(dex); g.clearRect(x, y, 64, 64); g.drawImage(fitCell(rec.frames[0], rec.w, rec.h), x, y); }
  sheetOk = true;
}

// 그림 목록: 먼저 이 폰에 저장된 목록(빠르게, 오프라인도), 그다음 서버 목록
const readMap = () => { try { return JSON.parse(localStorage.getItem(MAP_KEY) || '{}') || {}; } catch { return {}; } };
async function applyMap(map) {
  const want = new Map(Object.entries(map || {}).map(([k, v]) => [Number(k), v]).filter(([k, v]) => k > 0 && typeof v === 'string'));
  let changed = false;
  for (const dex of [...OV.keys()]) if (!want.has(dex)) { OV.delete(dex); changed = true; }
  await Promise.all([...want].map(async ([dex, path]) => {
    if (OV.get(dex)?.path === path) return;
    try { OV.set(dex, await loadRec(path)); changed = true; } catch (e) { console.warn('[sprites]', dex, e.message); }
  }));
  if (changed) version++;
  return changed;
}
async function fetchMap() {
  const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/sprite_overrides`, {
    method: 'POST', headers: { apikey: CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (!r.ok) throw new Error(`sprite_overrides ${r.status}`);
  return (await r.json()) || {};
}

const cachedFirst = applyMap(readMap()).catch(() => {});
const timeout = (ms) => new Promise((r) => setTimeout(r, ms));
let firstSync = null;   // 아래 refreshSprites() 첫 호출
// 처음 그릴 준비: 아틀라스 + 저장된 그림 + 서버 목록 (최대 3초 — 느린 망·오프라인에서 화면이 멈추지 않게)
export const spritesReady = atlasLoaded
  .then(() => Promise.race([cachedFirst.then(() => firstSync).catch(() => {}), timeout(3000)]))
  .then(() => { buildSheet(); });

// 서버 목록으로 맞추기 (페이지 열 때 한 번, 운영자 페이지는 올린 뒤 바로). 바뀌면 화면의 그림을 모두 다시 그림.
export async function refreshSprites() {
  const map = await fetchMap();
  try { localStorage.setItem(MAP_KEY, JSON.stringify(map)); } catch { /* 저장 못 해도 괜찮음 */ }
  await cachedFirst; await atlasLoaded;
  if (await applyMap(map)) { buildSheet(); repaintAll(); }
}
firstSync = refreshSprites().catch(() => { /* 오프라인: 저장된 목록 그대로 */ });

// Phaser 가 불러갈 아틀라스 주소: 올린 그림이 없으면 원래 파일, 있으면 합친 그림
let sheetURL = null; let sheetURLver = -1;
export async function atlasURL() {
  await spritesReady;
  if (!OV.size || !sheetOk) return ATLAS_URL;
  if (sheetURLver !== version) {
    buildSheet();
    const blob = await new Promise((r) => atlasImage.toBlob(r, 'image/png'));
    if (!blob) return ATLAS_URL;
    if (sheetURL) URL.revokeObjectURL(sheetURL);
    sheetURL = URL.createObjectURL(blob); sheetURLver = version;
  }
  return sheetURL;
}

// 잡기 장면용: 움직이는 그림이면 64칸에 맞춘 프레임들, 아니면 null
export function monAnim(dex) {
  const rec = OV.get(Number(dex));
  if (!rec || rec.frames.length < 2) return null;
  return { frames: rec.frames.map((f) => fitCell(f, rec.w, rec.h)), delays: rec.delays, total: rec.total };
}
export const hasCustomSprite = (dex) => OV.has(Number(dex));

// ── 모드별 그림 (실루엣 · 흰색 · 반짝이) ──
const ATLAS_MODES = new Map();   // `${dex}|${mode}` → [canvas]  (아틀라스 그림, 64×64 한 장)

function tint(src, color) {
  const c = mkCanvas(src.width, src.height); const g = c.getContext('2d');
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}

// 반짝이 (0027): 색이 있는 픽셀만 색상환을 돌림 (외곽선·흰색·회색은 그대로) → 같은 그림, 다른 색
function shinyOf(src, dex) {
  const c = mkCanvas(src.width, src.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height); const d = img.data;
  const turn = 0.36 + ((dex * 0.137) % 0.28);           // 몬스터마다 조금씩 다른 반짝 색 (130°~230° 돌림)
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, ch = mx - mn;
    if (ch < 0.12 || l < 0.12 || l > 0.94) continue;      // 외곽선·흰색·회색은 그대로
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
const LIVE = new Set();        // 그린 캔버스들 { c, dex, cssSize, mode, preview, idx, born }
let raf = 0; let adds = 0;

function frameIdx(rec, now) {
  if (!rec || rec.frames.length < 2 || !rec.total) return 0;
  let t = now % rec.total;
  for (let i = 0; i < rec.delays.length; i++) { t -= rec.delays[i]; if (t < 0) return i; }
  return 0;
}

// 그림 크기: 원본 한 변(base)을 기기 픽셀 정수 배로. 화면 칸보다 훨씬 크면 줄임.
export function spriteBox(base, cssSize, dpr = window.devicePixelRatio || 1) {
  const target = cssSize * dpr;
  if (base <= target * 1.25) { const s = Math.max(1, Math.round(target / base)); return { px: base * s, s }; }
  const px = Math.max(16, Math.round(target)); return { px, s: px / base };
}

function draw(e, now = performance.now()) {
  const { c, dex, cssSize, mode } = e;
  const rec = e.preview || OV.get(dex) || null;
  const dpr = window.devicePixelRatio || 1;
  const w = rec ? rec.w : 64, hh = rec ? rec.h : 64;
  const { px, s } = spriteBox(Math.max(w, hh), cssSize, dpr);
  if (c.width !== px || c.height !== px) { c.width = c.height = px; }
  c.style.width = c.style.height = `${px / dpr}px`;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, px, px);
  e.idx = frameIdx(rec, now);
  if (!dex && !rec) return;
  if (!rec && mode === 'normal') {             // 빠른 길: 아틀라스에서 바로
    const [sx, sy] = cellOf(dex);
    g.drawImage(atlas, sx, sy, 64, 64, 0, 0, px, px);
    return;
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
    if (gone(e, now)) { LIVE.delete(e); continue; }
    if (!e.c.isConnected) { anim = true; continue; }     // 곧 화면에 붙을 수도 있음
    const rec = e.preview || OV.get(e.dex);
    if (!rec || rec.frames.length < 2) continue;
    anim = true;
    if (!document.hidden && frameIdx(rec, now) !== e.idx) draw(e, now);
  }
  if (anim) raf = requestAnimationFrame(tick);
}
const animating = () => OV.size > 0 && [...OV.values()].some((r) => r.frames.length > 1);
const kick = () => { if (!raf && (animating() || [...LIVE].some((e) => e.preview?.frames.length > 1))) raf = requestAnimationFrame(tick); };

function repaintAll() {
  const now = performance.now();
  for (const e of LIVE) { if (gone(e, now)) { LIVE.delete(e); continue; } draw(e, now); }
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
  if (!e) { e = { c, born: performance.now(), idx: -1 }; c.__spr = e; }
  Object.assign(e, { dex: Number(dex) || 0, cssSize, mode, preview });
  LIVE.add(e);
  if (++adds % 300 === 0) { const now = performance.now(); for (const x of LIVE) if (gone(x, now)) LIVE.delete(x); }
  const go = () => { draw(e); kick(); };
  if (atlas.complete && atlas.naturalWidth) go(); else spritesReady.then(go);
  return c;
}

// 운영자 미리보기: 아직 올리지 않은 그림(rec)으로 그리기
export const previewCanvas = (rec, cssSize, mode = 'normal', dex = 1) => {
  const c = document.createElement('canvas'); c.className = 'sprite';
  return paint(c, dex, cssSize, mode, rec);
};

// 내 몬스터 그림: 반짝 색을 켜 둔 몬스터(collection.shiny_on)면 반짝이로
export const monSprite = (dex, cssSize, col) => {
  const c = spriteCanvas(dex, cssSize, col?.shiny_on ? 'shiny' : 'normal');
  if (col?.shiny_on) c.classList.add('shiny');
  return c;
};
