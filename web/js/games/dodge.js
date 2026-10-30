// 폭탄 피하기: 하늘에서 떨어지는 폭탄 몬스터를 좌우로 피한다. 한 번 맞으면 끝.
// 점수 = 버틴 초 × 10 + 땅에 떨어진 폭탄 × 5 (분열 폭탄의 작은 폭탄도 하나에 +5)
// 서버 상한: 초×30+50 → 끝낼 때 초×25+40 으로 한 번 더 묶어서 보냄 (.work/sim_dodge3.mjs 로 확인)
// 배경 그림: web/img/games/dodge/dodge-bg.png (CC0, 출처는 같은 폴더 CREDITS.txt)
// 판은 192×288 도트. 내 몬스터는 어떤 몬스터든 64×64 칸 전체를 정확히 1/2(32×32)로 줄여 같은 비율로 그림.
import { pixelCanvas, loop, text } from './common.js';
import { atlasImage, cellOf } from '../sprites.js';

const W = 192, H = 288;
const GR_Y = H - 64;         // 풀·흙길·덤불 띠 윗줄 (띠 높이 64)
const GROUND = GR_Y + 35;    // 몬스터 발 / 폭탄이 떨어지는 줄 (흙길 가운데)
const FO_Y = GR_Y + 18 - 92; // 숲 그림 윗줄 (숲 아래쪽이 풀 뒤로 숨게)
const MT_Y = FO_Y - 56;      // 먼 산 그림 윗줄
const MIN_GAP = 0.42;        // 폭탄 사이 최소 간격(초) — 점수 상한 지키는 핵심
const SPLIT_Y = Math.round(GROUND * 0.45); // 분열 폭탄이 터지는 높이 (떨어지는 길의 45%)
const WOBBLE = 0.35;         // 터지기 전 흔들리는 시간(초) — 미리 보여 주기

// 배경 그림 한 장(아틀라스) 안의 조각 위치 [x, y, w, h]
const R = { mt: [0, 0, 384, 76], fo: [0, 76, 160, 92], gr: [160, 76, 128, 64], tr: [0, 168, 124, 106], c0: [124, 168, 173, 44], c1: [297, 168, 50, 27], c2: [347, 168, 30, 26], h0: [0, 274, 264, 80], h1: [0, 354, 266, 87] };
const MT_FILL = '#8bb0e7', FO_FILL = '#6285ad';
const ART = new Image();
ART.src = new URL('../../img/games/dodge/dodge-bg.png', import.meta.url).href;
const artReady = () => ART.complete && ART.naturalWidth > 0;

// 폭탄 몬스터 도트 (14×13). k 테두리, r 윗색, h 반짝, d 윗색 그늘, e 눈동자, w 흰 배, g 배 그늘
const BOMB = [
  '....kkkkkk....',
  '..kkrhrrrrkk..',
  '.krhrrrrrrrdk.',
  '.krkrrrrrrkdk.',
  'krrrkkrrkkrrdk',
  'krrrewrrwerrdk',
  'krrrrrrrrrrddk',
  'kkkkkkkkkkkkkk',
  'kwwwwwkkwwwwgk',
  'kwwwwwkkwwwwgk',
  '.kwwwwwwwwwgk.',
  '..kkwwwwggkk..',
  '....kkkkkk....',
];
// 분열 폭탄: 정수리에 금(지그재그 선)이 간 초록 폭탄
const SPLIT = BOMB.map((row, j) => (j === 1 ? '..kkrhrkrrkk..' : j === 2 ? '.krhrrkrrrrdk.' : j === 3 ? '.krkrrrkrrkdk.' : row));
// 분열된 작은 폭탄 (10×8)
const MINI = [
  '..kkkkkk..',
  '.krhrrrrk.',
  'krhrrrrrdk',
  'krewrrwedk',
  'kkkkkkkkkk',
  'kwwwkkwwgk',
  '.kwwwwwgk.',
  '..kkkkkk..',
];
// 종류별 색: 보통(빨강) · 빠름(파랑) · 지그재그(보라) · 분열(초록)
const KINDS = {
  norm: { r: '#e83838', h: '#ff9c8c', d: '#a82030' },
  fast: { r: '#3878e8', h: '#9cc8ff', d: '#2048a0' },
  zig: { r: '#9048d0', h: '#d0a0ff', d: '#5c2890' },
  split: { r: '#40b040', h: '#b8f0a0', d: '#287028' },
  mini: { r: '#40b040', h: '#b8f0a0', d: '#287028' },
};
const SHAPE = { split: SPLIT, mini: MINI };
const BASE = { k: '#182030', e: '#182030', w: '#f4f4f0', g: '#b8c0cc' };

function bombSprite(kind) {
  const pat = SHAPE[kind] || BOMB;
  const cv = document.createElement('canvas'); cv.width = pat[0].length; cv.height = pat.length;
  const x = cv.getContext('2d'); const pal = { ...BASE, ...KINDS[kind] };
  pat.forEach((row, j) => [...row].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, j, 1, 1); } }));
  return cv;
}

// 하늘: 위가 진한 파랑 → 아래로 밝게, 띠 사이는 체크무늬 디더 (한 번만 그림)
function skyCanvas() {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const sky = ['#5a96ec', '#64a0f2', '#6eaaf8', '#78b0fc', '#82b6ff'];
  const band = 16;
  x.fillStyle = sky[sky.length - 1]; x.fillRect(0, 0, W, H);
  sky.forEach((c, i) => { x.fillStyle = c; x.fillRect(0, i * band, W, band); });
  for (let i = 1; i < sky.length; i++) {
    x.fillStyle = sky[i];
    for (let px = 0; px < W; px += 2) x.fillRect(px + (i % 2), i * band - 1, 1, 1);
    x.fillStyle = sky[i - 1];
    for (let px = 0; px < W; px += 2) x.fillRect(px + ((i + 1) % 2), i * band, 1, 1);
  }
  return cv;
}

// 내 몬스터 도트 (한 번만 만들어 둠):
//  full = 64×64 칸 그대로 (시작 화면)
//  play = 64×64 칸 전체를 2×2 칸마다 대표색 하나로 정확히 반(32×32)으로 줄인 것 — 모든 몬스터 같은 비율.
//         2×2 안에 어두운 점(테두리·눈)이 있으면 그 색, 아니면 가장 많은 색, 가장자리 한 점은 버림.
//  body = 3칸 이상(키의 1/4) 칠해진 세로줄 수 = 실제 몸통 폭, bh = 그림 키, cx = 몸통 가운데 (맞는 범위 계산용)
const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
function monSprites(dex) {
  if (!atlasImage.complete || !atlasImage.naturalWidth) return null;
  const [sx, sy] = cellOf(dex);
  const cell = document.createElement('canvas'); cell.width = cell.height = 64;
  const cg = cell.getContext('2d'); cg.drawImage(atlasImage, sx, sy, 64, 64, 0, 0, 64, 64);
  const src = cg.getImageData(0, 0, 64, 64).data;
  const half = document.createElement('canvas'); half.width = half.height = 32;
  const hg = half.getContext('2d'); const img = hg.createImageData(32, 32); const o = img.data;
  for (let by = 0; by < 32; by++) for (let bx = 0; bx < 32; bx++) {
    const ids = [0, 1, 64, 65].map((k) => ((by * 2) * 64 + bx * 2 + k) * 4).filter((i) => src[i + 3] > 127);
    if (!ids.length) continue;
    const dark = ids.filter((i) => lum(src, i) < 64);
    let pick;
    if (dark.length) pick = dark.reduce((a, b) => (lum(src, b) < lum(src, a) ? b : a));   // 테두리·눈 살리기
    else if (ids.length < 2) continue;                                                    // 가장자리 한 점은 버림
    else {
      const cnt = new Map();
      ids.forEach((i) => { const k = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2]; cnt.set(k, (cnt.get(k) || 0) + 1); });
      let best = -1, bk = 0; cnt.forEach((n, k) => { if (n > best) { best = n; bk = k; } });
      pick = ids.find((i) => ((src[i] << 16) | (src[i + 1] << 8) | src[i + 2]) === bk);
    }
    const j = (by * 32 + bx) * 4; o[j] = src[pick]; o[j + 1] = src[pick + 1]; o[j + 2] = src[pick + 2]; o[j + 3] = 255;
  }
  hg.putImageData(img, 0, 0);
  // 몸통 크기 재기 (32×32 그림 기준)
  let x0 = 32, y0 = 32, x1 = -1, y1 = -1;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (o[(y * 32 + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const play = { cv: half, w: 32, h: 32, body: 12, bw: 16, bh: 16, cx: 16 };
  if (x1 >= 0) {
    const bh = y1 - y0 + 1, need = Math.max(3, Math.round(bh * 0.25));
    let n0 = -1, n1 = -1, body = 0;
    for (let x = x0; x <= x1; x++) {
      let n = 0; for (let y = y0; y <= y1; y++) if (o[(y * 32 + x) * 4 + 3]) n++;
      if (n >= need) { body++; if (n0 < 0) n0 = x; n1 = x; }
    }
    Object.assign(play, { body: body || x1 - x0 + 1, bw: x1 - x0 + 1, bh, cx: n0 >= 0 ? (n0 + n1 + 1) / 2 : (x0 + x1 + 1) / 2 });
  }
  return { full: { cv: cell, w: 64, h: 64 }, play };
}

// 도트 패널 (HUD·제목): 남색 판 + 밝은 윗줄 + 어두운 아랫줄, 모서리는 한 칸 깎음
function panel(g, x, y, w, h) {
  g.fillStyle = '#182030'; g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2);
  g.fillStyle = '#2c3c64'; g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle = '#4a6098'; g.fillRect(x + 2, y + 1, w - 4, 1);
  g.fillStyle = '#202c4c'; g.fillRect(x + 2, y + h - 2, w - 4, 1);
}
// 작은 시계 / 별 아이콘 (7×7)
function iconClock(g, x, y) {
  g.fillStyle = '#182030'; g.fillRect(x + 1, y, 5, 7); g.fillRect(x, y + 1, 7, 5);
  g.fillStyle = '#f4f4f0'; g.fillRect(x + 1, y + 1, 5, 5);
  g.fillStyle = '#182030'; g.fillRect(x + 3, y + 2, 1, 2); g.fillRect(x + 4, y + 3, 1, 1);
}
const STAR = ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'];
function iconStar(g, x, y) {
  g.fillStyle = '#ffe040';
  STAR.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') g.fillRect(x + i, y + j, 1, 1); }));
  g.fillStyle = '#fff8c0'; g.fillRect(x + 3, y + 1, 1, 2);
}

export default {
  id: 'dodge',
  title: '폭탄 피하기',
  start(stage, api) {
    const { c, g, stop: stopFit } = pixelCanvas(stage, W, H);
    g.imageSmoothingEnabled = false;
    stage.style.touchAction = 'none';
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const SPR = Object.fromEntries(Object.keys(KINDS).map((k) => [k, bombSprite(k)]));
    const SKY = skyCanvas();
    const dex = api.partner();
    let MS = monSprites(dex);

    let mode = 'ready'; // ready → play → boom
    let px = W / 2, target = null, keyDir = 0, face = false, walk = 0;
    let t = 0, t0 = 0, spawnIn = 1, dodged = 0, bombs = [], fx = [], boomT = 0, ended = false, shake = 0;
    let anim = 0, drift = 0, endTimer = 0, paused = false, pausedAt = 0, skipDt = false;

    const score = () => Math.floor(t * 10) + dodged * 5;
    const P = () => (MS ? MS.play : { w: 32, h: 32, body: 12, bw: 16, bh: 16, cx: 16 });
    // 몸통 가운데 (그림을 뒤집으면 반대쪽)
    const bodyX = () => px + (P().cx - 16) * (face ? -1 : 1);
    // 맞는 범위: 몸통 폭의 약 65% (가장자리 몇 칸 스치는 건 봐줌), 키는 아래 70%
    const hitHalf = () => Math.max(3, Math.round(P().body * 0.33));

    const begin = () => {
      mode = 'play'; t = 0; t0 = performance.now(); spawnIn = 0.8; dodged = 0; bombs = []; fx = [];
      api.sfx.select();
    };

    // 폭탄 만들기 (r = 맞는 반지름: 그림보다 조금 작게)
    const mk = (kind, x, y, vy, vx = 0) => {
      const s = SPR[kind];
      return { kind, x, x0: x, y, vy, vx, ph: Math.random() * 6.28, amp: 17 + Math.random() * 12, w: s.width, h: s.height, r: kind === 'mini' ? 4 : 5 };
    };
    // 폭탄 하나 떨어뜨리기: 시간이 지날수록 빠른·지그재그·분열이 섞임
    const spawn = () => {
      const r = Math.random();
      const pFast = Math.min(0.3, Math.max(0, (t - 10) * 0.012));
      const pZig = Math.min(0.3, Math.max(0, (t - 18) * 0.012));
      const pSplit = Math.min(0.2, Math.max(0, (t - 15) * 0.012));
      const kind = r < pZig ? 'zig' : r < pZig + pFast ? 'fast' : r < pZig + pFast + pSplit ? 'split' : 'norm';
      // 난이도 (.work/sim_dodge3.mjs H안 = B안보다 버티는 시간 약 10% 짧게): 처음엔 천천히, 오래 버틸수록 계속 빨라짐
      const base = Math.min(245, 70 + t * 2.5);
      const vy = base * (kind === 'fast' ? 1.5 : kind === 'zig' ? 0.85 : 1) * (0.9 + Math.random() * 0.2);
      // 8초부터 가끔 내 몬스터 쪽을 노림 (가만히 있으면 맞도록)
      const x = Math.random() < (t < 8 ? 0 : Math.min(0.32, (t - 8) * 0.007)) ? Math.max(8, Math.min(W - 8, px + (Math.random() - 0.5) * 20)) : 8 + Math.random() * (W - 16);
      bombs.push(mk(kind, x, -14, vy));
    };

    const boom = (bx, by) => {
      mode = 'boom'; boomT = 0; shake = reduce ? 1 : 5;
      api.sfx.hit();
      setTimeout(() => api.sfx.faint(), 250);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3; const sp = 30 + Math.random() * 60;
        fx.push({ x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, life: 0.5 + Math.random() * 0.4, c: ['#ffe040', '#ff8c28', '#e83838', '#f4f4f0'][i % 4], s: 1 + (i % 3 === 0) });
      }
      const ms = Math.max(1000, Math.round(performance.now() - t0));
      // 안전장치: 서버 상한(초×30+50)보다 한참 아래로 묶음
      const sc = Math.min(score(), Math.floor((ms / 1000) * 25) + 40);
      endTimer = setTimeout(() => { if (!ended) { ended = true; api.end(sc, ms); } }, 1100);
    };

    // 입력: 손가락 따라가기 / 좌우 절반 탭 / 방향키
    const toX = (e) => { const r = c.getBoundingClientRect(); return Math.max(8, Math.min(W - 8, ((e.clientX - r.left) / r.width) * W)); };
    let down = false;
    const onDown = (e) => {
      e.preventDefault();
      if (paused) return;
      if (mode === 'ready') { begin(); return; }
      if (mode !== 'play') return;
      down = true; stage.setPointerCapture?.(e.pointerId); target = toX(e);
    };
    const onMove = (e) => { if (down && mode === 'play' && !paused) target = toX(e); };
    const onUp = () => { down = false; };
    const onKey = (e) => {
      if (paused) return;
      const k = e.key;
      if (mode === 'ready' && (k === ' ' || k === 'Enter' || k === 'ArrowLeft' || k === 'ArrowRight')) { e.preventDefault(); begin(); return; }
      if (k === 'ArrowLeft') { keyDir = -1; target = null; e.preventDefault(); }
      if (k === 'ArrowRight') { keyDir = 1; target = null; e.preventDefault(); }
    };
    const onKeyUp = (e) => {
      if ((e.key === 'ArrowLeft' && keyDir < 0) || (e.key === 'ArrowRight' && keyDir > 0)) keyDir = 0;
    };
    // 랭킹 창이 게임 위에 열리면 멈춤: 멈춘 시간은 점수·ms 에 안 들어감
    const onPause = () => { if (paused) return; paused = true; pausedAt = performance.now(); keyDir = 0; down = false; };
    const onResume = () => { if (!paused) return; paused = false; t0 += performance.now() - pausedAt; skipDt = true; };
    const noScroll = (e) => e.preventDefault();
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('touchmove', noScroll, { passive: false });
    stage.addEventListener('mg-pause', onPause);
    stage.addEventListener('mg-resume', onResume);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);

    // 폭탄 움직이기 (옆으로 나는 작은 폭탄은 벽에서 튕김)
    const moveBomb = (b, dt) => {
      b.y += b.vy * dt;
      if (b.vx) { b.x += b.vx * dt; if (b.x < 5 || b.x > W - 5) { b.vx = -b.vx; b.x = Math.max(5, Math.min(W - 5, b.x)); } }
      if (b.kind === 'zig') { b.ph += dt * 4; b.x = Math.max(7, Math.min(W - 7, b.x0 + Math.sin(b.ph) * b.amp)); }
    };
    // 분열: 작은 폭탄 둘이 양옆 대각선으로 갈라져 더 빨리 떨어짐
    const split = (b, out) => {
      for (const s of [-1, 1]) out.push(mk('mini', b.x + s * 3, b.y + 3, b.vy * 1.2, s * (40 + Math.random() * 20)));
      api.sfx.blip();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2; const sp = 25 + Math.random() * 25;
        fx.push({ x: b.x, y: b.y + 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10, life: 0.35 + Math.random() * 0.2, c: ['#b8f0a0', '#f4f4f0', '#40b040'][i % 3], s: 1 });
      }
    };

    const update = (dt) => {
      anim += dt;
      if (!reduce) drift += dt;
      if (mode === 'play') {
        t += dt;
        // 몬스터 이동 (몸통이 화면 밖으로 안 나가게)
        const sp = 160, p = P(), off = (p.cx - 16) * (face ? -1 : 1);
        let vx = 0;
        if (keyDir) vx = keyDir * sp;
        else if (target != null) { const d = target - px; vx = Math.sign(d) * sp; if (Math.abs(d) < sp * dt) vx = dt ? d / dt : 0; }
        px = Math.max(p.bw / 2 - off, Math.min(W - p.bw / 2 - off, px + vx * dt));
        if (Math.abs(vx) > 5) { face = vx > 0; walk += dt * 12; } else walk = 0;
        // 폭탄 나오기: 간격이 점점 짧아짐 (최소 MIN_GAP)
        spawnIn -= dt;
        if (spawnIn <= 0) { spawn(); spawnIn = Math.max(MIN_GAP, 1.2 * Math.exp(-t / 30) * (0.8 + Math.random() * 0.4)); }
        // 폭탄 떨어짐 + 부딪힘 검사 (몸통 상자 vs 폭탄 원 — 둘 다 그림보다 조금 작게)
        const bx0 = bodyX(), hh = hitHalf(), top0 = GROUND - P().bh * 0.7;
        const born = [];
        for (const b of bombs) {
          moveBomb(b, dt);
          if (b.kind === 'split' && b.y >= SPLIT_Y) { b.done = true; split(b, born); continue; }
          const cy = b.y + b.h / 2;
          if (Math.abs(b.x - bx0) < hh + b.r && cy > top0 - b.r && cy < GROUND) { boom(b.x, cy); return; }
          if (b.y + b.h >= GROUND && !b.done) {
            b.done = true; dodged++;
            fx.push({ x: b.x, y: GROUND - 8, vx: 0, vy: -18, life: 0.7, txt: '+5' });
            for (let i = 0; i < 4; i++) fx.push({ x: b.x, y: GROUND - 1, vx: (i - 1.5) * 18, vy: -14, life: 0.3, c: '#d2d198', s: 1 });
          }
        }
        bombs = bombs.filter((b) => !b.done).concat(born);
      } else if (mode === 'boom') {
        boomT += dt; shake = Math.max(0, shake - dt * (reduce ? 4 : 10));
        // 남은 폭탄은 그냥 떨어져 사라짐 (점수 없음)
        bombs.forEach((b) => moveBomb(b, dt));
        bombs = bombs.filter((b) => b.y + b.h < GROUND);
      }
      fx.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; if (!p.txt) p.vy += 90 * dt; p.life -= dt; });
      fx = fx.filter((p) => p.life > 0);
    };

    // 아틀라스 조각 그리기 (dx 는 반올림해서 픽셀 맞춤)
    const piece = (k, dx, dy) => { const [sx, sy, w, h] = R[k]; g.drawImage(ART, sx, sy, w, h, Math.round(dx), Math.round(dy), w, h); };
    // 가로로 이어붙이기 (period 폭마다 반복, 화면 전체 덮음)
    const tiled = (k, ox, dy) => { const w = R[k][2]; for (let x = ((Math.round(ox) % w) + w) % w - w; x < W; x += w) piece(k, x, dy); };
    // 화면을 가로질러 흘러가는 구름: speed px/s, 화면 밖으로 나가면 반대편에서 다시
    const drifting = (k, x0, y, speed) => { const w = R[k][2]; const span = W + w + 20; piece(k, (((x0 + drift * speed) % span) + span) % span - w, y); };

    const drawScene = () => {
      g.drawImage(SKY, 0, 0);
      if (!artReady()) {
        g.fillStyle = '#48a048'; g.fillRect(0, GROUND, W, H - GROUND);
        return;
      }
      const par = mode === 'ready' ? 0 : px - W / 2;   // 내 몬스터 위치 따라 살짝 밀리는 시차
      // 높은 하늘 구름 (느리게)
      drifting('h0', 20, -18, 2.2);
      drifting('h1', 220, 26, 1.4);
      // 산 뒤로 지나가는 뭉게구름
      drifting('c0', 40, MT_Y + 4, 3.2);
      drifting('c1', 280, MT_Y + 9, 3.2);
      drifting('c2', 360, MT_Y + 7, 3.2);
      // 먼 산 (384 폭 중 가운데 부분) + 그 아래 채움
      piece('mt', -96 - par * 0.05, MT_Y);
      g.fillStyle = MT_FILL; g.fillRect(0, MT_Y + 76, W, FO_Y + 40 - MT_Y - 76);
      // 숲 (160 폭 이어붙임)
      tiled('fo', -par * 0.12, FO_Y);
      g.fillStyle = FO_FILL; g.fillRect(0, FO_Y + 92, W, GR_Y + 20 - FO_Y - 92);
      // 큰 나무 (오른쪽, 조금 더 빠른 시차)
      piece('tr', W - 70 - par * 0.2, GR_Y - 84);
      // 풀 + 흙길 + 덤불 (128 폭 이어붙임)
      tiled('gr', 0, GR_Y);
    };

    const drawBomb = (b) => {
      // 분열 직전: 좌우로 덜덜 떨고 금이 하얗게 번쩍
      const pre = b.kind === 'split' && b.vy > 0 && b.y > SPLIT_Y - b.vy * WOBBLE;
      const blink = Math.floor(anim * 24) % 2;
      const bx = Math.round(b.x - b.w / 2) + (pre && !reduce ? (blink ? 1 : -1) : 0), by = Math.round(b.y);
      g.drawImage(SPR[b.kind], bx, by);
      if (pre && blink) { g.fillStyle = '#f4f4f0'; g.fillRect(bx + 7, by + 1, 1, 1); g.fillRect(bx + 6, by + 2, 1, 1); g.fillRect(bx + 7, by + 3, 1, 1); }
      // 심지 + 반짝 불꽃
      const fx0 = bx + b.w - 4;
      g.fillStyle = '#5a4030'; g.fillRect(fx0 - 1, by - 1, 1, 1); g.fillRect(fx0, by - 2, 1, 1); g.fillRect(fx0, by - 3, 1, 1);
      const on = Math.floor(anim * 16 + b.ph * 3) % 2;
      g.fillStyle = on ? '#ffe040' : '#ff8c28'; g.fillRect(fx0, by - 5, 1, 2); g.fillRect(fx0 - 1, by - 4, 3, 1);
      if (on) { g.fillStyle = '#fff8c0'; g.fillRect(fx0, by - 4, 1, 1); g.fillRect(fx0 + 2, by - 6, 1, 1); g.fillRect(fx0 - 2, by - 6, 1, 1); }
    };
    // 떨어질 자리 그림자: 가까워질수록 커짐
    const drawBombShadow = (b) => {
      const k = Math.max(0, Math.min(1, (b.y + b.h) / GROUND));
      const w = 2 + Math.round(k * (b.w - 6));
      g.fillStyle = 'rgba(24,32,48,0.28)'; g.fillRect(Math.round(b.x - w / 2), GROUND - 1, w, 2);
    };

    // 몬스터 한 마리: 칸(정사각) 아래쪽이 footY, 칸 가운데가 cx
    const drawSprite = (s, cx, footY, flip) => {
      const x = Math.round(cx - s.w / 2), y = Math.round(footY - s.h);
      if (flip) { g.save(); g.translate(x + s.w, y); g.scale(-1, 1); g.drawImage(s.cv, 0, 0); g.restore(); }
      else g.drawImage(s.cv, x, y);
    };

    const drawPlayer = () => {
      if (!MS) return;
      const s = MS.play;
      if (mode === 'boom') {
        // 쓰러짐: 깜빡이다 아래로 가라앉음
        const p = Math.min(1, Math.max(0, (boomT - 0.25) / 0.6));
        if (boomT < 0.25 && Math.floor(boomT * 20) % 2) return;
        g.save(); g.beginPath(); g.rect(0, 0, W, GROUND + 1); g.clip();
        drawSprite(s, px, GROUND + 1 + Math.round(p * s.bh * 0.9), face);
        g.restore();
        return;
      }
      const hop = walk ? Math.round(Math.abs(Math.sin(walk)) * 2) : 0;
      g.fillStyle = 'rgba(24,32,48,0.3)'; g.fillRect(Math.round(bodyX() - s.bw * 0.35), GROUND, Math.max(4, Math.round(s.bw * 0.7)), 2);
      drawSprite(s, px, GROUND + 1 - hop, face);
    };

    const drawHud = () => {
      panel(g, 3, 3, 56, 15);
      iconClock(g, 7, 7);
      text(g, `${t.toFixed(1)}초`, 17, 6, { size: 8 });
      panel(g, W - 63, 3, 60, 15);
      iconStar(g, W - 59, 7);
      text(g, `${score()}점`, W - 7, 6, { size: 8, align: 'right', color: '#ffe040' });
    };

    const draw = () => {
      if (!MS) MS = monSprites(dex);
      const sx = shake ? Math.round((Math.random() - 0.5) * shake * 2) : 0;
      const sy = shake ? Math.round((Math.random() - 0.5) * shake * 2) : 0;
      g.fillStyle = '#82b6ff'; g.fillRect(0, 0, W, H);
      g.save(); g.translate(sx, sy);
      drawScene();
      if (mode === 'ready') {
        const bob = reduce ? 0 : Math.round(Math.sin(anim * 3) * 2);
        if (MS) {
          // 시작 화면은 모든 몬스터 1배 (64×64 칸 그대로, 칸 아래가 땅)
          g.fillStyle = 'rgba(24,32,48,0.3)'; g.fillRect(W / 2 - 12, GROUND, 24, 2);
          drawSprite(MS.full, W / 2, GROUND + 2 - Math.max(0, bob), false);
        }
        const fl = (k) => (reduce ? 0 : Math.round(Math.sin(anim * 2 + k) * 3));
        drawBomb({ kind: 'norm', x: 34, y: 124 + fl(0), ph: 0, w: 14, h: 13 });
        drawBomb({ kind: 'zig', x: 158, y: 104 + fl(1), ph: 1, w: 14, h: 13 });
        drawBomb({ kind: 'fast', x: 78, y: 150 + fl(2), ph: 2, w: 14, h: 13 });
        drawBomb({ kind: 'split', x: 122, y: 136 + fl(3), ph: 3, w: 14, h: 13 });
        panel(g, 16, 30, W - 32, 48);
        text(g, '폭탄 피하기', W / 2, 36, { size: 12, align: 'center', color: '#ffe040' });
        text(g, '좌우로 움직여 피해요', W / 2, 54, { size: 8, align: 'center' });
        text(g, '떨어진 폭탄 하나에 +5', W / 2, 64, { size: 8, align: 'center', color: '#9cc8ff' });
        if (reduce || Math.floor(anim * 2) % 2 === 0) {
          panel(g, W / 2 - 46, 172, 92, 18);
          text(g, '탭해서 시작', W / 2, 175, { size: 8, align: 'center' });
        }
      } else {
        bombs.forEach(drawBombShadow);
        drawPlayer();
        bombs.forEach(drawBomb);
      }
      fx.forEach((p) => {
        if (p.txt) text(g, p.txt, Math.round(p.x), Math.round(p.y), { size: 8, align: 'center', color: '#ffe040' });
        else { g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); }
      });
      if (mode === 'boom') {
        // 폭발 링
        const r = Math.min(26, boomT * 90);
        if (boomT < 0.4) {
          g.fillStyle = boomT < 0.1 ? '#fff8c0' : '#ff8c28';
          const cx = Math.round(bodyX()), cy = GROUND - Math.round(P().bh / 2);
          for (let a = 0; a < 24; a++) { const q = (a / 24) * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(q) * r) - 1, Math.round(cy + Math.sin(q) * r) - 1, 3, 3); }
          if (boomT < 0.15) { g.fillStyle = '#ffe040'; g.fillRect(cx - 6, cy - 6, 12, 12); g.fillStyle = '#fff8c0'; g.fillRect(cx - 3, cy - 3, 6, 6); }
        }
        if (boomT > 0.15) {
          panel(g, W / 2 - 44, 100, 88, 34);
          text(g, '펑!', W / 2, 104, { size: 24, align: 'center', color: '#ff6030' });
        }
      }
      g.restore();
      if (mode !== 'ready') drawHud();
    };

    const stopLoop = loop((dt) => {
      if (paused) return;                       // 멈춘 동안은 그림도 그대로
      if (skipDt) { skipDt = false; dt = 0; }   // 다시 시작할 때 한 프레임 건너뜀 (튀지 않게)
      update(dt); draw();
    });

    return () => {
      stopLoop(); stopFit(); clearTimeout(endTimer); ended = true;
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
      stage.removeEventListener('touchmove', noScroll);
      stage.removeEventListener('mg-pause', onPause);
      stage.removeEventListener('mg-resume', onResume);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  },
};
