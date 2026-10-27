// Draw 64x64 monster sprites from web/sprites/atlas.png with crisp, integer DEVICE-pixel scaling.
// Galaxy phones have fractional devicePixelRatio (2.625, 2.8125…): scaling in CSS pixels would make
// uneven pixel sizes, so we size the canvas in device pixels and pick an integer multiple of 64.
import { CONFIG } from './config.js';

const atlas = new Image();
const ready = new Promise((resolve) => { atlas.onload = resolve; atlas.onerror = resolve; });
atlas.src = new URL('../sprites/atlas.png', import.meta.url).href;
export const spritesReady = ready;

const SIL = new Map();  // silhouette cache: dex → canvas

function cellOf(dex) {
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

// Returns a <canvas> that displays ~cssSize CSS px wide, drawn at an exact integer multiple of 64 device px.
// mode: 'normal' | 'silhouette' | 'white'
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
    } else {
      g.drawImage(silhouette(dex, mode === 'white' ? '#ffffff' : '#20283a'), 0, 0, px, px);
    }
  };
  if (atlas.complete && atlas.naturalWidth) draw(); else ready.then(draw);
  return c;
}
