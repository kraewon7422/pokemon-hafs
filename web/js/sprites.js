// Draw 64x64 monster sprites from web/sprites/atlas.png with crisp, integer DEVICE-pixel scaling.
// Galaxy phones have fractional devicePixelRatio (2.625, 2.8125…): scaling in CSS pixels would make
// uneven pixel sizes, so we size the canvas in device pixels and pick an integer multiple of 64.
import { CONFIG } from './config.js';

const atlas = new Image();
const ready = new Promise((resolve) => { atlas.onload = resolve; atlas.onerror = resolve; });
atlas.src = new URL('../sprites/atlas.png', import.meta.url).href;
export const spritesReady = ready;
export const atlasImage = atlas;   // 미니게임 캔버스에 직접 그릴 때 (web/js/games/common.js)

const SIL = new Map();  // silhouette cache: dex → canvas

export function cellOf(dex) {
  const i = dex - 1;
  return [(i % CONFIG.ATLAS_COLS) * 64, Math.floor(i / CONFIG.ATLAS_COLS) * 64];
}

function silhouette(dex, color) {
  const key = dex + color;
  if (SIL.has(key)) return SIL.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const [sx, sy] = cellOf(dex);
  g.drawImage(atlas, sx, sy, 64, 64, 0, 0, 64, 64);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 64);
  SIL.set(key, c);
  return c;
}

// 반짝이 (0027, 알에서 반짝으로 태어남): 색이 있는 픽셀만 색상환을 돌림 (외곽선·흰색·회색은 그대로) → 같은 그림, 다른 색
const SHINY = new Map();
function shinySprite(dex) {
  if (SHINY.has(dex)) return SHINY.get(dex);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d', { willReadFrequently: true });
  const [sx, sy] = cellOf(dex);
  g.drawImage(atlas, sx, sy, 64, 64, 0, 0, 64, 64);
  const img = g.getImageData(0, 0, 64, 64); const d = img.data;
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
  SHINY.set(dex, c);
  return c;
}

// Returns a <canvas> that displays ~cssSize CSS px wide, drawn at an exact integer multiple of 64 device px.
// mode: 'normal' | 'silhouette' | 'white' | 'shiny'
export function spriteCanvas(dex, cssSize = 96, mode = 'normal') {
  const c = document.createElement('canvas');
  c.className = 'sprite';
  paint(c, dex, cssSize, mode);
  return c;
}

export function paint(c, dex, cssSize = 96, mode = 'normal') {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.round((cssSize * dpr) / 64));
  const px = 64 * k;
  c.width = c.height = px;
  c.style.width = c.style.height = `${px / dpr}px`;
  const draw = () => {
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, px, px);
    if (!dex) return;
    if (mode === 'normal') {
      const [sx, sy] = cellOf(dex);
      g.drawImage(atlas, sx, sy, 64, 64, 0, 0, px, px);
    } else if (mode === 'shiny') {
      g.drawImage(shinySprite(dex), 0, 0, px, px);
    } else {
      g.drawImage(silhouette(dex, mode === 'white' ? '#ffffff' : '#20283a'), 0, 0, px, px);
    }
  };
  if (atlas.complete && atlas.naturalWidth) draw(); else ready.then(draw);
  return c;
}

// 내 몬스터 그림: 반짝 색을 켜 둔 몬스터(collection.shiny_on)면 반짝이로
export const monSprite = (dex, cssSize, col) => {
  const c = spriteCanvas(dex, cssSize, col?.shiny_on ? 'shiny' : 'normal');
  if (col?.shiny_on) c.classList.add('shiny');
  return c;
};
