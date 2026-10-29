// 자이로 미로: 폰을 기울여 몬스터볼을 미로 끝 구멍에 굴려 넣기. 3판 합계 시간 (빠를수록 위)
// 2.5D 도트: 돌벽 윗면(밝음) + 남쪽 면(어두움), 볼 그림자, 기울인 쪽으로 판이 살짝 밀림(시차)
// 조작: 기울이기(DeviceOrientation) · 화면 끌기 · 방향키. 시작 순간의 기울기를 '수평'으로 잡음
import { pixelCanvas, drawMon, loop, text } from './common.js';

const W = 160, H = 208, HUD = 16;   // 캔버스 (도트)
const T = 3;                          // 벽 두께
const WH = 3;                         // 벽 높이 (남쪽 면 도트 수)
const R = 3.6;                        // 볼 반지름 (충돌)
const ACC = 430, VMAX = 150, FRICTION = 1.5, BOUNCE = 0.35, TILT_DEG = 25;
const STAGES = [{ cols: 7, rows: 9, seed: 11 }, { cols: 9, rows: 11, seed: 23 }, { cols: 11, rows: 13, seed: 37 }];

// 몬스터볼 8×8 도트
const BALL = ['..kkkk..', '.krrrhk.', 'krrrrrhk', 'kkkwwkkk', 'kwwwwwwk', 'kwwwwwsk', '.kswwsk.', '..kkkk..'];
const BALL_COL = { k: '#182030', r: '#e03838', h: '#ffb0a8', w: '#f4f4ec', s: '#b0bac4' };

// 돌·물빛 팔레트
const C = {
  bg: '#0a1820', floorA: '#1d6a70', floorB: '#1a6066', seam: '#14525a', speck: '#237a7e', caustic: '#5cc8c0',
  top: '#b8c2ae', topHi: '#e2e8d4', topLo: '#8e9a8c', face: '#566870', faceLo: '#303c46', mortar: '#46565e',
  rail: '#e8d8a0', post: '#7a6a40', shadow: 'rgba(0,16,24,.45)', hole: '#050c10', holeRim: '#0e3238',
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// 고정 미로 (씨앗 고정 → 매번 같은 3판)
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function makeMaze({ cols, rows, seed }) {
  const rnd = rng(seed);
  // hw[r][c]: 칸 (r,c) 위쪽 벽 (r = 0..rows), vw[r][c]: 칸 왼쪽 벽 (c = 0..cols)
  const hw = Array.from({ length: rows + 1 }, () => Array(cols).fill(true));
  const vw = Array.from({ length: rows }, () => Array(cols + 1).fill(true));
  const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
  const st = [[0, 0]]; seen[0][0] = true;
  while (st.length) {
    const [r, c] = st[st.length - 1];
    const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([y, x]) => y >= 0 && y < rows && x >= 0 && x < cols && !seen[y][x]);
    if (!nb.length) { st.pop(); continue; }
    const [y, x] = nb[Math.floor(rnd() * nb.length)];
    if (y < r) hw[r][c] = false; else if (y > r) hw[y][c] = false; else if (x < c) vw[r][c] = false; else vw[r][x] = false;
    seen[y][x] = true; st.push([y, x]);
  }
  // 너비 우선 탐색: 시작(0,0)에서 가장 먼 칸 = 출구, 그 길 = 정답 (시험용)
  const open = (r, c, y, x) => (y < r ? !hw[r][c] : y > r ? !hw[y][c] : x < c ? !vw[r][c] : !vw[r][x]);
  const prev = new Map(); const q = [[0, 0]]; prev.set('0,0', null); let far = [0, 0];
  while (q.length) {
    const [r, c] = q.shift(); far = [r, c];
    for (const [y, x] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      if (y < 0 || y >= rows || x < 0 || x >= cols || prev.has(`${y},${x}`) || !open(r, c, y, x)) continue;
      prev.set(`${y},${x}`, [r, c]); q.push([y, x]);
    }
  }
  const path = []; for (let p = far; p; p = prev.get(`${p[0]},${p[1]}`)) path.unshift(p);
  return { cols, rows, hw, vw, exit: far, path };
}

// 판 하나 준비: 칸 크기 · 벽 사각형 · 바닥 무늬
function buildStage(i) {
  const m = makeMaze(STAGES[i]);
  const cell = Math.floor(Math.min((W - 8 - T) / m.cols, (H - HUD - 10 - T - WH) / m.rows));
  const bw = m.cols * cell + T, bh = m.rows * cell + T;
  const walls = [];
  for (let r = 0; r <= m.rows; r++) for (let c = 0; c < m.cols; c++) {
    if (m.hw[r][c]) walls.push({ x: c * cell, y: r * cell, w: cell + T, h: T, outer: r === 0 || r === m.rows });
  }
  for (let r = 0; r < m.rows; r++) for (let c = 0; c <= m.cols; c++) {
    if (m.vw[r][c]) walls.push({ x: c * cell, y: r * cell, w: T, h: cell + T, outer: c === 0 || c === m.cols });
  }
  const ctr = ([r, c]) => [c * cell + T + (cell - T) / 2, r * cell + T + (cell - T) / 2];
  // 바닥: 칸마다 돌판, 이음새, 얼룩 (한 번만 그려 둠)
  const floor = document.createElement('canvas'); floor.width = bw; floor.height = bh;
  const f = floor.getContext('2d'); const rnd = rng(STAGES[i].seed * 7 + 1);
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
    const x = c * cell + T, y = r * cell + T, s = cell - T;
    f.fillStyle = (r + c) % 2 ? C.floorA : C.floorB; f.fillRect(x, y, s, s);
    f.fillStyle = C.seam; f.fillRect(x, y + s - 1, s, 1); f.fillRect(x + s - 1, y, 1, s);
    f.fillStyle = C.speck;
    for (let k = 0; k < 3; k++) f.fillRect(x + 1 + Math.floor(rnd() * (s - 3)), y + 1 + Math.floor(rnd() * (s - 3)), 1, 1);
  }
  return { ...m, i, cell, bw, bh, walls, ctr, floor, start: ctr([0, 0]), hole: ctr(m.exit), pathPts: m.path.map(ctr) };
}

// 도트 원
function disc(g, cx, cy, r, color) {
  g.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
    g.fillRect(Math.round(cx) - hw, Math.round(cy) + dy, hw * 2 + 1, 1);
  }
}

function ensureStyle() {
  if (document.getElementById('mgm-style')) return;
  const s = document.createElement('style'); s.id = 'mgm-style';
  s.textContent = `
.mgm-bar { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%; max-width: 340px; text-align: center; }
.mgm-bar .mgm-row { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; width: 100%; }
.mgm-bar .btn { flex: 1; min-width: 0; }
.mgm-hint { font-size: 12px; color: #384050; line-height: 1.4; }
.mgm-hint b { color: #1d6a70; }`;
  document.head.append(s);
}

export default {
  id: 'maze',
  title: '자이로 미로',
  start(stage, api) {
    ensureStyle();
    const pc = pixelCanvas(stage, W, H); const { c, g } = pc;
    const bar = document.createElement('div'); bar.className = 'mgm-bar'; stage.append(bar);
    const dex = api.partner();

    let st = buildStage(0);
    const ball = { x: st.start[0], y: st.start[1], vx: 0, vy: 0, s: 1 };
    let mode = 'ready';           // ready → play → fall → (다음 판 play | done)
    let elapsed = 0;              // 실제 경과 ms (탭 숨김 동안은 loop 가 멈춤)
    let lastReal = 0;
    let fallT = 0, banner = 0, bannerText = '', cheer = 0, ended = false, lastHit = 0;
    const tilt = { x: 0, y: 0 };  // -1..1 (화면 오른쪽/아래가 +)
    const ori = { on: false, got: false, b0: null, g0: null, b: 0, g: 0 };
    const drag = { id: null, x0: 0, y0: 0, x: 0, y: 0 };
    const keys = new Set();

    // 기울기 센서
    const onOri = (e) => {
      if (e.beta == null || e.gamma == null) return;
      ori.got = true; ori.b = e.beta; ori.g = e.gamma;
      if (ori.on && ori.b0 == null) { ori.b0 = e.beta; ori.g0 = e.gamma; }   // 시작 순간 = 수평
    };
    const oriTilt = () => {
      if (!ori.on || ori.b0 == null) return [0, 0];
      const wrap = (d) => ((d + 540) % 360) - 180;
      let db = wrap(ori.b - ori.b0), dg = wrap(ori.g - ori.g0);
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let x = dg, y = db;
      if (ang === 90) { x = db; y = -dg; } else if (ang === -90 || ang === 270) { x = -db; y = dg; } else if (ang === 180) { x = -dg; y = -db; }
      return [clamp(x / TILT_DEG, -1, 1), clamp(y / TILT_DEG, -1, 1)];
    };
    // 손가락 끌기: 처음 누른 곳에서 끈 방향 = 기울기
    const onDown = (e) => { drag.id = e.pointerId; drag.x0 = drag.x = e.clientX; drag.y0 = drag.y = e.clientY; c.setPointerCapture?.(e.pointerId); e.preventDefault(); };
    const onMove = (e) => { if (e.pointerId !== drag.id) return; drag.x = e.clientX; drag.y = e.clientY; e.preventDefault(); };
    const onUp = (e) => { if (e.pointerId === drag.id) drag.id = null; };
    const KEYS = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1 };
    const onKey = (e) => { if (!KEYS[e.key]) return; e.preventDefault(); if (e.type === 'keydown') keys.add(e.key); else keys.delete(e.key); };

    window.addEventListener('deviceorientation', onOri);
    c.addEventListener('pointerdown', onDown); c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp); c.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);

    const readTilt = () => {
      let [x, y] = oriTilt();
      if (drag.id != null) { x += (drag.x - drag.x0) / 45; y += (drag.y - drag.y0) / 45; }
      x += (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
      y += (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
      tilt.x = clamp(x, -1, 1); tilt.y = clamp(y, -1, 1);
    };

    // 아래 막대: 시작 버튼 → 조작 안내
    const btn = (label, cls, fn) => { const b = document.createElement('button'); b.className = `btn ${cls}`; b.textContent = label; b.onclick = fn; return b; };
    const showStart = () => {
      const hint = document.createElement('div'); hint.className = 'mgm-hint';
      hint.innerHTML = '폰을 <b>평평하게</b> 들고 버튼을 눌러요.<br>기울여서 몬스터볼을 <b>구멍</b>에 넣어요!';
      const row = document.createElement('div'); row.className = 'mgm-row';
      row.append(btn('기울이기 켜기', 'primary', enableTilt), btn('손가락으로', '', () => begin(false)));
      bar.replaceChildren(hint, row);
    };
    const showPlay = () => {
      const hint = document.createElement('div'); hint.className = 'mgm-hint';
      hint.innerHTML = ori.on ? '폰을 기울여 굴려요 · 화면을 끌어도 돼요' : '화면을 누른 채 <b>끌면</b> 그쪽으로 기울어요 · 방향키도 OK';
      const kids = [hint];
      if (ori.on) kids.push(btn('지금 자세를 수평으로', 'small', () => { ori.b0 = ori.b; ori.g0 = ori.g; api.sfx.blip(); }));
      bar.replaceChildren(...kids);
    };
    async function enableTilt() {
      const DOE = window.DeviceOrientationEvent;
      let ok = !!DOE;
      if (DOE && typeof DOE.requestPermission === 'function') {   // iOS: 꼭 탭 안에서 물어봐야 함
        try { ok = (await DOE.requestPermission()) === 'granted'; } catch { ok = false; }
      }
      begin(ok);
    }
    function begin(useOri) {
      if (mode !== 'ready') return;
      ori.on = useOri; ori.b0 = ori.got ? ori.b : null; ori.g0 = ori.got ? ori.g : null;
      api.sfx.select();
      mode = 'play'; lastReal = performance.now(); banner = 1; bannerText = '1 / 3';
      showPlay();
      // 센서가 1초 안에 아무 값도 안 주면 (PC 등) 손가락 안내로
      if (useOri) setTimeout(() => { if (!ori.got && ori.on && !ended) { ori.on = false; showPlay(); } }, 1200);
    }
    showStart();

    // 물리: 하위 단계로 쪼개 한 번에 0.75도트 이하로만 움직임 → 벽 뚫기 없음
    const collide = () => {
      let hard = 0;
      for (const w of st.walls) {
        const cx = clamp(ball.x, w.x, w.x + w.w), cy = clamp(ball.y, w.y, w.y + w.h);
        const dx = ball.x - cx, dy = ball.y - cy, d2 = dx * dx + dy * dy;
        if (d2 >= R * R) continue;
        let nx, ny, pen;
        if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = R - d; }
        else { // 중심이 벽 안 (거의 없음): 가장 얕은 쪽으로 밀어냄
          const o = [[ball.x - w.x, -1, 0], [w.x + w.w - ball.x, 1, 0], [ball.y - w.y, 0, -1], [w.y + w.h - ball.y, 0, 1]].sort((a, b) => a[0] - b[0])[0];
          nx = o[1]; ny = o[2]; pen = o[0] + R;
        }
        ball.x += nx * pen; ball.y += ny * pen;
        const vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) { ball.vx -= (1 + BOUNCE) * vn * nx; ball.vy -= (1 + BOUNCE) * vn * ny; hard = Math.max(hard, -vn); }
      }
      return hard;
    };
    const physics = (dt) => {
      ball.vx += tilt.x * ACC * dt; ball.vy += tilt.y * ACC * dt;
      const fr = Math.exp(-FRICTION * dt); ball.vx *= fr; ball.vy *= fr;
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > VMAX) { ball.vx *= VMAX / sp; ball.vy *= VMAX / sp; }
      const n = Math.max(1, Math.ceil((Math.min(sp, VMAX) * dt) / 0.75));
      let hard = 0;
      for (let k = 0; k < n; k++) { ball.x += (ball.vx * dt) / n; ball.y += (ball.vy * dt) / n; hard = Math.max(hard, collide()); }
      const now = performance.now();
      if (hard > 35 && now - lastHit > 160) { lastHit = now; if (hard > 80) api.sfx.hit(); else api.sfx.blip(); }
      // 구멍: 가까이 오면 빨려 들어감
      const [hx, hy] = st.hole; const d = Math.hypot(ball.x - hx, ball.y - hy);
      if (d < 3.2) { mode = 'fall'; fallT = 0; api.sfx.ballPop(); ball.vx = ball.vy = 0; }
      else if (d < 7) { ball.vx += ((hx - ball.x) / d) * 120 * dt; ball.vy += ((hy - ball.y) / d) * 120 * dt; }
    };

    const step = (dt, t) => {
      const now = performance.now();
      if (mode === 'play' || mode === 'fall') {
        let d = now - lastReal; if (d > 250) d = dt * 1000;   // 숨겼다 돌아온 첫 프레임
        elapsed += d;
      }
      lastReal = now;
      readTilt();
      if (banner > 0) banner -= dt;
      if (cheer > 0) cheer -= dt;
      if (mode === 'play') physics(dt);
      else if (mode === 'fall') {
        fallT += dt;
        const k = Math.min(1, fallT / 0.5);
        ball.x += (st.hole[0] - ball.x) * Math.min(1, dt * 14); ball.y += (st.hole[1] - ball.y) * Math.min(1, dt * 14);
        ball.s = 1 - k;
        if (fallT >= 0.65) {
          cheer = 1;
          if (st.i < STAGES.length - 1) {
            st = buildStage(st.i + 1);
            Object.assign(ball, { x: st.start[0], y: st.start[1], vx: 0, vy: 0, s: 1 });
            mode = 'play'; banner = 1; bannerText = `${st.i + 1} / 3`; api.sfx.correct();
          } else {
            mode = 'done'; banner = 9; bannerText = '클리어!'; api.sfx.catch();
            const total = Math.round(elapsed);
            setTimeout(() => { if (!ended) { ended = true; api.end(total, total); } }, 900);
          }
        }
      }
      draw(t);
    };

    // 그리기
    const ballImg = document.createElement('canvas'); ballImg.width = ballImg.height = 8;
    { const b = ballImg.getContext('2d'); BALL.forEach((row, y) => [...row].forEach((ch, x) => { if (BALL_COL[ch]) { b.fillStyle = BALL_COL[ch]; b.fillRect(x, y, 1, 1); } })); }

    // 판 자체가 기울어 보이게: 캔버스를 3D 로 살짝 돌린다 (기울인 쪽이 화면 안으로 내려감)
    const lean = { x: 0, y: 0 }; const LEAN_DEG = matchMedia('(prefers-reduced-motion: reduce)').matches ? 4 : 11;
    c.style.transition = 'none'; c.style.willChange = 'transform';
    const leanBoard = () => {
      lean.x += (tilt.x - lean.x) * 0.2; lean.y += (tilt.y - lean.y) * 0.2;
      c.style.transform = `perspective(700px) rotateX(${(-lean.y * LEAN_DEG).toFixed(2)}deg) rotateY(${(lean.x * LEAN_DEG).toFixed(2)}deg)`;
      c.style.boxShadow = `${(-lean.x * 8).toFixed(1)}px ${(6 - lean.y * 8).toFixed(1)}px 14px rgba(0,0,0,.35)`;
    };

    function draw(t) {
      leanBoard();
      g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
      // 물속 배경 잔물결
      g.fillStyle = '#10262e';
      for (let y = HUD + 2; y < H; y += 6) for (let x = (y / 6) % 2 ? 0 : 3; x < W; x += 6) if (Math.sin(x * 0.2 + y * 0.13 + t * 1.2) > 0.6) g.fillRect(x, y, 2, 1);

      const px = Math.round(tilt.x * 2), py = Math.round(tilt.y * 2);           // 판 전체 시차
      const lx = Math.round(tilt.x * 1.2), ly = Math.round(tilt.y * 1.2);       // 벽만 조금 더 (기울어진 느낌)
      const ox = Math.floor((W - st.bw) / 2) + px, oy = HUD + 6 + WH + Math.floor((H - HUD - 6 - WH - st.bh) / 2) + py;

      // 판 테두리 (아래로 두꺼운 받침)
      g.fillStyle = '#05100f'; g.fillRect(ox - 2, oy - WH - 2, st.bw + 4, st.bh + WH + 6);
      g.drawImage(st.floor, ox, oy);
      // 물빛 일렁임
      g.fillStyle = C.caustic;
      for (let y = T; y < st.bh - T; y += 3) for (let x = T + ((y / 3) % 2 ? 1 : 0); x < st.bw - T; x += 3) {
        const v = Math.sin(x * 0.33 + t * 1.4) + Math.sin(y * 0.27 - t * 1.1) + Math.sin((x + y) * 0.19 + t * 0.8);
        if (v > 2.25) g.fillRect(ox + x, oy + y, v > 2.6 ? 2 : 1, 1);
      }
      // 출구 구멍
      const [hx, hy] = st.hole; const hr = Math.max(4, Math.floor((st.cell - T) / 2) - 1);
      disc(g, ox + hx, oy + hy, hr + 2, '#8e9a8c');                 // 돌 테두리
      disc(g, ox + hx, oy + hy, hr + 1, Math.sin(t * 4) > 0 ? '#3fa7a3' : C.holeRim);   // 깜빡이는 물빛
      disc(g, ox + hx, oy + hy, hr, C.hole);
      g.fillStyle = '#0a1a20'; g.fillRect(Math.round(ox + hx) - hr + 1, Math.round(oy + hy) - hr + 1, hr * 2 - 1, 1);
      if (mode !== 'done') {   // 반짝이는 안내 점
        g.fillStyle = Math.sin(t * 6) > 0 ? '#f8e070' : '#c89830';
        const a = t * 2.4;
        for (let k = 0; k < 4; k++) g.fillRect(Math.round(ox + hx + Math.cos(a + k * 1.571) * (hr + 2.5)), Math.round(oy + hy + Math.sin(a + k * 1.571) * (hr + 2.5)), 1, 1);
      }
      // 벽 그림자 (오른쪽 아래로)
      g.fillStyle = C.shadow;
      for (const w of st.walls) g.fillRect(ox + w.x + 1, oy + w.y + 1, w.w, w.h + 1);
      // 볼 그림자 + 볼 (벽보다 먼저 → 남쪽 벽 윗면이 볼을 살짝 가림)
      if (ball.s > 0.05) {
        const bx = ox + ball.x, by = oy + ball.y;
        if (mode !== 'fall') { g.fillStyle = 'rgba(0,10,16,.5)'; g.fillRect(Math.round(bx - 3), Math.round(by + 3), 7, 2); g.fillRect(Math.round(bx - 2), Math.round(by + 5), 5, 1); }
        const sz = Math.max(1, Math.round(8 * ball.s));
        g.drawImage(ballImg, Math.round(bx - sz / 2), Math.round(by - sz / 2), sz, sz);
      }
      // 벽: 남쪽 면 먼저, 그 위에 윗면
      const wx = ox + lx, wy = oy + ly;
      for (const w of st.walls) {
        const x = wx + w.x, y = wy + w.y + w.h - WH;
        g.fillStyle = C.face; g.fillRect(x, y, w.w, WH);
        g.fillStyle = C.faceLo; g.fillRect(x, y + WH - 1, w.w, 1);
        g.fillStyle = C.mortar; for (let k = 2; k < w.w - 1; k += 4) g.fillRect(x + k, y, 1, WH - 1);
      }
      for (const w of st.walls) {
        const x = wx + w.x, y = wy + w.y - WH;
        g.fillStyle = C.top; g.fillRect(x, y, w.w, w.h);
        g.fillStyle = C.topHi; g.fillRect(x, y, w.w, 1);
        g.fillStyle = C.topLo; g.fillRect(x, y + w.h - 1, w.w, 1);
        if (w.w > w.h) { g.fillStyle = C.topLo; for (let k = 3; k < w.w - 1; k += 5) g.fillRect(x + k, y + 1, 1, 1); }
      }
      // 바깥 벽 난간 (기둥 + 가로대)
      for (const w of st.walls) {
        if (!w.outer || w.w < w.h) continue;
        const x = wx + w.x, y = wy + w.y - WH - 2;
        g.fillStyle = C.post; for (let k = 1; k < w.w; k += 5) g.fillRect(x + k, y, 1, 2);
        g.fillStyle = C.rail; g.fillRect(x, y, w.w, 1);
      }

      // 위쪽 정보: 판 · 시간 · 응원하는 내 몬스터
      g.fillStyle = '#132a34'; g.fillRect(0, 0, W, HUD);
      g.fillStyle = '#2a6870'; g.fillRect(0, HUD - 1, W, 1);
      text(g, `${Math.min(st.i + 1, 3)}/3`, 4, 4, { color: '#f8e070' });
      text(g, `${(elapsed / 1000).toFixed(2)}초`, 30, 4);
      const hop = cheer > 0 ? Math.round(Math.abs(Math.sin(cheer * 12)) * 3) : Math.round(Math.abs(Math.sin(t * 2)));
      drawMon(g, dex, W - 19, 0 - hop, 17, true);

      // 가운데 안내 띠
      if (mode === 'ready' || banner > 0) {
        const msg = mode === 'ready' ? '준비!' : bannerText;
        g.fillStyle = 'rgba(8,20,28,.72)'; g.fillRect(0, 92, W, 22);
        g.fillStyle = '#5cc8c0'; g.fillRect(0, 92, W, 1); g.fillRect(0, 113, W, 1);
        text(g, msg, W / 2, 97, { size: 11, color: '#f8f0c0', align: 'center' });
      }
    }

    // 시험용 (개발 페이지에서만)
    if (location.pathname.endsWith('.dev-mg.html')) {
      window.__maze = { get: () => ({ mode, stage: st.i, x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, path: st.pathPts, walls: st.walls, cell: st.cell, R, elapsed, tilt: { ...tilt }, ori: { ...ori } }) };
    }

    const stopLoop = loop(step);
    return () => {
      stopLoop(); pc.stop(); ended = true;
      window.removeEventListener('deviceorientation', onOri);
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
      c.removeEventListener('pointerdown', onDown); c.removeEventListener('pointermove', onMove);
      c.removeEventListener('pointerup', onUp); c.removeEventListener('pointercancel', onUp);
      if (window.__maze) delete window.__maze;
    };
  },
};
