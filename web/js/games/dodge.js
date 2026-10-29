// 폭탄 피하기: 하늘에서 떨어지는 폭탄 몬스터를 좌우로 피한다. 한 번 맞으면 끝.
// 점수 = 버틴 초 × 10 + 땅에 떨어진 폭탄 × 5 (서버 상한: 초×30+50 → 폭탄 간격 최소 0.42초라 넉넉히 아래)
import { pixelCanvas, drawMon, loop, text } from './common.js';

const W = 160, H = 240, GROUND = 214, MON = 24;
const MIN_GAP = 0.42; // 폭탄 사이 최소 간격(초) — 점수 상한 지키는 핵심

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
// 종류별 색: 보통(빨강) · 빠름(파랑) · 지그재그(보라)
const KINDS = {
  norm: { r: '#e83838', h: '#ff9c8c', d: '#a82030' },
  fast: { r: '#3878e8', h: '#9cc8ff', d: '#2048a0' },
  zig: { r: '#9048d0', h: '#d0a0ff', d: '#5c2890' },
};
const BASE = { k: '#182030', e: '#182030', w: '#f4f4f0', g: '#b8c0cc' };

// 폭탄 그림을 한 번만 만들어 둠 (매 프레임 drawImage)
function bombSprite(kind) {
  const cv = document.createElement('canvas'); cv.width = 14; cv.height = 13;
  const x = cv.getContext('2d'); const pal = { ...BASE, ...KINDS[kind] };
  BOMB.forEach((row, j) => [...row].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, j, 1, 1); } }));
  return cv;
}

// 배경(하늘 + 학교 + 운동장)도 한 번만
function background() {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const sky = ['#5ca8f0', '#6cb4f4', '#80c0f6', '#94ccf8', '#a8d8fa', '#bce2fa'];
  const band = Math.ceil(GROUND / sky.length);
  sky.forEach((c, i) => { x.fillStyle = c; x.fillRect(0, i * band, W, band); });
  // 띠 사이 체크무늬 디더
  for (let i = 1; i < sky.length; i++) {
    x.fillStyle = sky[i];
    for (let px = (i % 2); px < W; px += 2) x.fillRect(px, i * band - 1, 1, 1);
  }
  // 먼 산
  x.fillStyle = '#9cc4a0';
  for (let px = 0; px < W; px++) { const hh = 10 + Math.round(6 * Math.sin(px / 13) + 4 * Math.sin(px / 5.3)); x.fillRect(px, GROUND - 22 - hh, 1, hh + 22); }
  // 학교 건물
  const bx = 92, by = GROUND - 46;
  x.fillStyle = '#e8dcc0'; x.fillRect(bx, by, 60, 46);
  x.fillStyle = '#c8b898'; x.fillRect(bx, by, 60, 3); x.fillRect(bx + 58, by, 2, 46);
  x.fillStyle = '#d06048'; x.fillRect(bx + 24, by - 10, 12, 10);
  x.fillStyle = '#f4f0e0'; x.fillRect(bx + 27, by - 7, 6, 6);
  x.fillStyle = '#182030'; x.fillRect(bx + 29, by - 6, 1, 3); x.fillRect(bx + 30, by - 4, 2, 1);
  x.fillStyle = '#6890b8';
  for (let r = 0; r < 3; r++) for (let q = 0; q < 6; q++) x.fillRect(bx + 4 + q * 9, by + 7 + r * 12, 6, 7);
  x.fillStyle = '#a8c8e8';
  for (let r = 0; r < 3; r++) for (let q = 0; q < 6; q++) x.fillRect(bx + 4 + q * 9, by + 7 + r * 12, 2, 2);
  x.fillStyle = '#8c6040'; x.fillRect(bx + 26, GROUND - 9, 8, 9);
  // 나무
  [[14, 30], [40, 24]].forEach(([tx, th]) => {
    x.fillStyle = '#7a5030'; x.fillRect(tx + 5, GROUND - th + 12, 3, th - 12);
    x.fillStyle = '#3c9048'; x.fillRect(tx, GROUND - th, 13, 14); x.fillRect(tx + 2, GROUND - th - 3, 9, 3);
    x.fillStyle = '#58b058'; x.fillRect(tx + 2, GROUND - th + 1, 4, 3);
  });
  // 운동장: 잔디 줄 + 흙
  x.fillStyle = '#48a048'; x.fillRect(0, GROUND, W, 4);
  x.fillStyle = '#68c058'; for (let px = 0; px < W; px += 3) x.fillRect(px, GROUND - 1, 1, 2);
  x.fillStyle = '#d8a868'; x.fillRect(0, GROUND + 4, W, H - GROUND - 4);
  x.fillStyle = '#c09050'; for (let px = 0; px < W; px += 7) x.fillRect(px + ((px / 7) % 2) * 3, GROUND + 9 + ((px / 7) % 3) * 5, 2, 1);
  x.fillStyle = '#f4f0e0'; x.fillRect(0, GROUND + 15, W, 1);
  return cv;
}

export default {
  id: 'dodge',
  title: '폭탄 피하기',
  start(stage, api) {
    const { c, g, stop: stopFit } = pixelCanvas(stage, W, H);
    g.imageSmoothingEnabled = false;
    stage.style.touchAction = 'none';
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const SPR = { norm: bombSprite('norm'), fast: bombSprite('fast'), zig: bombSprite('zig') };
    const BG = background();
    const dex = api.partner();

    let mode = 'ready'; // ready → play → boom
    let px = W / 2, target = null, keyDir = 0, face = false, walk = 0;
    let t = 0, t0 = 0, spawnIn = 1, dodged = 0, bombs = [], fx = [], boomT = 0, ended = false, shake = 0;
    let anim = 0, endTimer = 0;
    const clouds = [{ x: 10, y: 24, s: 4 }, { x: 90, y: 50, s: 3 }, { x: 140, y: 14, s: 5 }];

    const score = () => Math.floor(t * 10) + dodged * 5;

    const begin = () => {
      mode = 'play'; t = 0; t0 = performance.now(); spawnIn = 0.8; dodged = 0; bombs = []; fx = [];
      api.sfx.select();
    };

    // 폭탄 하나 만들기: 시간이 지날수록 빠른·지그재그가 섞임
    const spawn = () => {
      const r = Math.random();
      const pFast = Math.min(0.3, Math.max(0, (t - 10) * 0.012));
      const pZig = Math.min(0.3, Math.max(0, (t - 18) * 0.012));
      const kind = r < pZig ? 'zig' : r < pZig + pFast ? 'fast' : 'norm';
      const base = Math.min(170, 62 + t * 2.4);
      const vy = base * (kind === 'fast' ? 1.5 : kind === 'zig' ? 0.85 : 1) * (0.9 + Math.random() * 0.2);
      // 가끔은 내 몬스터 쪽을 노림 (가만히 있으면 맞도록)
      const x = Math.random() < Math.min(0.35, 0.12 + t * 0.01) ? Math.max(8, Math.min(W - 8, px + (Math.random() - 0.5) * 16)) : 8 + Math.random() * (W - 16);
      bombs.push({ kind, x, x0: x, y: -14, vy, ph: Math.random() * 6.28, amp: 14 + Math.random() * 10 });
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
      // 안전장치: 서버 상한보다 한참 아래로 묶음
      const sc = Math.min(score(), Math.floor((ms / 1000) * 25) + 40);
      endTimer = setTimeout(() => { if (!ended) { ended = true; api.end(sc, ms); } }, 1100);
    };

    // 입력: 손가락 따라가기 / 좌우 절반 탭 / 방향키
    const toX = (e) => { const r = c.getBoundingClientRect(); return Math.max(8, Math.min(W - 8, ((e.clientX - r.left) / r.width) * W)); };
    let down = false;
    const onDown = (e) => {
      e.preventDefault();
      if (mode === 'ready') { begin(); return; }
      if (mode !== 'play') return;
      down = true; stage.setPointerCapture?.(e.pointerId); target = toX(e);
    };
    const onMove = (e) => { if (down && mode === 'play') target = toX(e); };
    const onUp = () => { down = false; };
    const onKey = (e) => {
      const k = e.key;
      if (mode === 'ready' && (k === ' ' || k === 'Enter' || k === 'ArrowLeft' || k === 'ArrowRight')) { e.preventDefault(); begin(); return; }
      if (k === 'ArrowLeft') { keyDir = -1; target = null; e.preventDefault(); }
      if (k === 'ArrowRight') { keyDir = 1; target = null; e.preventDefault(); }
    };
    const onKeyUp = (e) => {
      if ((e.key === 'ArrowLeft' && keyDir < 0) || (e.key === 'ArrowRight' && keyDir > 0)) keyDir = 0;
    };
    const noScroll = (e) => e.preventDefault();
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('touchmove', noScroll, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);

    const update = (dt) => {
      anim += dt;
      clouds.forEach((cl) => { cl.x += cl.s * dt; if (cl.x > W + 20) cl.x = -30; });
      if (mode === 'play') {
        t += dt;
        // 몬스터 이동
        const sp = 125;
        let vx = 0;
        if (keyDir) vx = keyDir * sp;
        else if (target != null) { const d = target - px; vx = Math.abs(d) < 1 ? d / dt : Math.sign(d) * sp; if (Math.abs(d) < sp * dt) vx = d / dt; }
        px = Math.max(10, Math.min(W - 10, px + vx * dt));
        if (Math.abs(vx) > 5) { face = vx > 0; walk += dt * 12; } else walk = 0;
        // 폭탄 나오기: 간격이 점점 짧아짐 (최소 MIN_GAP)
        spawnIn -= dt;
        if (spawnIn <= 0) { spawn(); spawnIn = Math.max(MIN_GAP, 1.0 * Math.exp(-t / 28)) * (0.8 + Math.random() * 0.4); spawnIn = Math.max(MIN_GAP, spawnIn); }
        // 폭탄 떨어짐 + 부딪힘 검사
        for (const b of bombs) {
          b.y += b.vy * dt;
          if (b.kind === 'zig') { b.ph += dt * 4; b.x = Math.max(7, Math.min(W - 7, b.x0 + Math.sin(b.ph) * b.amp)); }
          const cy = b.y + 6.5;
          if (Math.abs(b.x - px) < 10 && cy > GROUND - 20 && cy < GROUND + 2) { boom(b.x, cy); return; }
          if (b.y + 13 >= GROUND && !b.done) {
            b.done = true; dodged++;
            fx.push({ x: b.x, y: GROUND - 6, vx: 0, vy: -18, life: 0.7, txt: '+5' });
            for (let i = 0; i < 4; i++) fx.push({ x: b.x, y: GROUND - 1, vx: (i - 1.5) * 18, vy: -14, life: 0.3, c: '#c8a070', s: 1 });
          }
        }
        bombs = bombs.filter((b) => !b.done);
      } else if (mode === 'boom') {
        boomT += dt; shake = Math.max(0, shake - dt * (reduce ? 4 : 10));
        // 남은 폭탄은 그냥 떨어져 사라짐 (점수 없음)
        bombs.forEach((b) => { b.y += b.vy * dt; });
        bombs = bombs.filter((b) => b.y + 13 < GROUND);
      }
      fx.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; if (!p.txt) p.vy += 90 * dt; p.life -= dt; });
      fx = fx.filter((p) => p.life > 0);
    };

    const drawBomb = (b) => {
      const bx = Math.round(b.x - 7), by = Math.round(b.y);
      g.drawImage(SPR[b.kind], bx, by);
      // 심지 + 반짝 불꽃
      g.fillStyle = '#5a4030'; g.fillRect(bx + 9, by - 1, 1, 1); g.fillRect(bx + 10, by - 2, 1, 1); g.fillRect(bx + 10, by - 3, 1, 1);
      const on = Math.floor(anim * 16 + b.ph * 3) % 2;
      g.fillStyle = on ? '#ffe040' : '#ff8c28'; g.fillRect(bx + 10, by - 5, 1, 2); g.fillRect(bx + 9, by - 4, 3, 1);
      if (on) { g.fillStyle = '#fff8c0'; g.fillRect(bx + 10, by - 4, 1, 1); g.fillRect(bx + 12, by - 6, 1, 1); g.fillRect(bx + 8, by - 6, 1, 1); }
    };

    const drawPlayer = () => {
      const x = Math.round(px - MON / 2);
      if (mode === 'boom') {
        // 쓰러짐: 깜빡이다 아래로 가라앉음
        const p = Math.min(1, Math.max(0, (boomT - 0.25) / 0.6));
        if (boomT < 0.25 && Math.floor(boomT * 20) % 2) return;
        g.save(); g.beginPath(); g.rect(0, 0, W, GROUND); g.clip();
        drawMon(g, dex, x, GROUND - MON + Math.round(p * MON * 0.9), MON, face);
        g.restore();
        return;
      }
      const hop = walk ? Math.round(Math.abs(Math.sin(walk)) * 2) : 0;
      // 그림자
      g.fillStyle = 'rgba(24,32,48,0.25)'; g.fillRect(x + 5, GROUND, MON - 10, 2);
      drawMon(g, dex, x, GROUND - MON - hop + 1, MON, face);
    };

    const draw = () => {
      const sx = shake ? Math.round((Math.random() - 0.5) * shake * 2) : 0;
      const sy = shake ? Math.round((Math.random() - 0.5) * shake * 2) : 0;
      g.save(); g.translate(sx, sy);
      g.drawImage(BG, 0, 0);
      g.fillStyle = '#f4f8ff';
      clouds.forEach((cl) => { const x = Math.round(cl.x), y = cl.y; g.fillRect(x, y, 22, 5); g.fillRect(x + 4, y - 3, 10, 3); g.fillRect(x + 12, y - 5, 7, 5); });
      if (mode === 'ready') {
        const bob = Math.round(Math.sin(anim * 3) * 3);
        g.fillStyle = 'rgba(24,32,48,0.25)'; g.fillRect(W / 2 - 11, GROUND, 22, 2);
        drawMon(g, dex, W / 2 - 16, GROUND - 32 + bob - 2, 32, false);
        drawBomb({ kind: 'norm', x: 40, y: 92 + Math.round(Math.sin(anim * 2) * 3), ph: 0 });
        drawBomb({ kind: 'zig', x: 120, y: 74 + Math.round(Math.sin(anim * 2 + 1) * 3), ph: 1 });
        drawBomb({ kind: 'fast', x: 80, y: 120 + Math.round(Math.sin(anim * 2 + 2) * 3), ph: 2 });
        g.fillStyle = 'rgba(24,32,48,0.55)'; g.fillRect(14, 26, W - 28, 38);
        text(g, '폭탄 피하기', W / 2, 30, { size: 12, align: 'center', color: '#ffe040' });
        text(g, '좌우로 움직여 피해요', W / 2, 48, { size: 8, align: 'center' });
        if (Math.floor(anim * 2) % 2 === 0) text(g, '탭해서 시작', W / 2, 150, { size: 12, align: 'center' });
      } else {
        bombs.forEach(drawBomb);
        drawPlayer();
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
          const cx = Math.round(px), cy = GROUND - 12;
          for (let a = 0; a < 24; a++) { const q = (a / 24) * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(q) * r) - 1, Math.round(cy + Math.sin(q) * r) - 1, 3, 3); }
          if (boomT < 0.15) { g.fillStyle = '#ffe040'; g.fillRect(cx - 6, cy - 6, 12, 12); g.fillStyle = '#fff8c0'; g.fillRect(cx - 3, cy - 3, 6, 6); }
        }
        if (boomT > 0.15) {
          g.fillStyle = 'rgba(24,32,48,0.45)'; g.fillRect(36, 78, W - 72, 36);
          text(g, '펑!', W / 2, 82, { size: 24, align: 'center', color: '#ff6030' });
        }
      }
      g.restore();
      // 위 HUD
      if (mode !== 'ready') {
        g.fillStyle = 'rgba(24,32,48,0.55)'; g.fillRect(0, 0, W, 13);
        text(g, `${t.toFixed(1)}초`, 4, 2, { size: 8 });
        text(g, `${score()}점`, W - 4, 2, { size: 8, align: 'right', color: '#ffe040' });
      }
    };

    const stopLoop = loop((dt) => { update(dt); draw(); });

    return () => {
      stopLoop(); stopFit(); clearTimeout(endTimer); ended = true;
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
      stage.removeEventListener('touchmove', noScroll);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  },
};
