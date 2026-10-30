// 미니게임 공용 도구: 도트 캔버스(정수 배율), 몬스터 그리기, 게임 루프, 내 몬스터 목록.
// 게임 파일(yacht.js · dodge.js · maze.js)은 이것만 가져다 쓰고, 점수·랭킹·화면 틀은 hub.js 가 맡는다.
import { atlasImage, cellOf, spritesReady } from '../sprites.js';

// 게임 판 크기 (도트). 화면 폭에 맞춰 정수 배로 키운다 → 픽셀이 뭉개지지 않음
export function pixelCanvas(stage, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.className = 'mg-canvas';
  const fit = () => {
    const box = stage.getBoundingClientRect();
    const k = Math.max(1, Math.floor(Math.min(box.width / w, (box.height || 9999) / h) * (window.devicePixelRatio || 1)) / (window.devicePixelRatio || 1));
    c.style.width = `${w * k}px`; c.style.height = `${h * k}px`;
  };
  stage.append(c);
  fit();
  const ro = new ResizeObserver(fit); ro.observe(stage);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g, w, h, stop: () => ro.disconnect() };
}

// 몬스터 그리기 (64×64 아틀라스 → size 도트). flip = 좌우 반전
export function drawMon(g, dex, x, y, size = 32, flip = false) {
  if (!atlasImage.complete || !atlasImage.naturalWidth) return;
  const [sx, sy] = cellOf(dex);
  g.save();
  if (flip) { g.translate(x + size, y); g.scale(-1, 1); g.drawImage(atlasImage, sx, sy, 64, 64, 0, 0, size, size); }
  else g.drawImage(atlasImage, sx, sy, 64, 64, x, y, size, size);
  g.restore();
}
export const spritesLoaded = spritesReady;

// 게임 루프: step(dt 초, t 초) 를 매 프레임. 탭이 숨겨지면 멈춤. 돌려주는 함수로 끔
export function loop(step) {
  let last = performance.now(); let raf = 0; let on = true; const t0 = last;
  const tick = (now) => {
    if (!on) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!document.hidden) step(dt, (now - t0) / 1000);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { on = false; cancelAnimationFrame(raf); };
}

// 도트 글자 (캔버스 위 점수 등): 기본 글꼴을 작은 크기로
export function text(g, str, x, y, { size = 8, color = '#fff', align = 'left', shadow = '#182030' } = {}) {
  g.font = `bold ${size}px Galmuri11, monospace`;
  g.textAlign = align; g.textBaseline = 'top';
  if (shadow) { g.fillStyle = shadow; g.fillText(str, x + 1, y + 1); }
  g.fillStyle = color; g.fillText(str, x, y);
}

// Phaser 3 (web/vendor/phaser.min.js, MIT) — 처음 쓰는 게임이 열릴 때만 불러옴 (앱 첫 로딩은 그대로 가볍게, 한 번 받으면 sw 가 저장)
let phaserP = null;
export function loadPhaser() {
  if (window.Phaser) return Promise.resolve(window.Phaser);
  phaserP ||= new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = new URL('../../vendor/phaser.min.js', import.meta.url).href;
    s.onload = () => ok(window.Phaser);
    s.onerror = () => { phaserP = null; bad(new Error('PHASER_LOAD')); };
    document.head.append(s);
  });
  return phaserP;
}
