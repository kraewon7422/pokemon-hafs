// 사파리존: 지도 탭의 큰 도트 맵 (3세대 사파리존처럼 가운데 + 북서·북동·남서·남동 구역, 모래길로 이어짐).
// 키 큰 풀숲을 걸으면 야생 포켓몬이 나오고 사파리볼(하루 N개)로 잡는다.
// 걸음 판정·볼 개수는 서버 (0033 safari_encounter · safari_result) — 앱은 풀숲 걸음 수만 보냄.
// 그림: web/img/safari-tiles.png (16px 타일, 위치표 safari-tiles.js) · safari-hero.png (교복 주인공 16×24) — tools/build_safari_tiles.py 가 그림.
// 맵은 그림이 오면 한 번 큰 캔버스 2장(물·꽃 움직임 2장)에 미리 그려 두고, 매 프레임 카메라 부분만 옮겨 그림. 화면은 기기 픽셀 정수 배.
// 화면은 한 번 만들고 계속 씀 (sync 가 지도 탭을 다시 그려도 걷던 자리·애니메이션이 이어지게).
import { rpc, errorText } from './sb.js';
import { sfx, bgmPush, bgmReady, bgmBeat, bgmPreload } from './sfx.js';
import { h } from './ui.js';
import { S } from './state.js';
import { catchEncounter } from './app.js';
import TI from '../img/safari-tiles.js';

const TS = 16;
// T 나무 · . 풀밭 · , 키 큰 풀숲 · # 모래길 · ~ 물 · b 다리 · F 울타리 · f 꽃 · R 바위 · S 표지판 · G 입구 기둥
const MAP = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTT.....................................................TTTTTT',
  'TTTTT,,,,,,,,........,,,,,...,,,,,,.......................TTTTTT',
  'TTTTT,,,,,,,,........,,,,,...,,,,,,.........,,,,,,,,,,,,,,,TTTTT',
  'TTTTT,,,,,,,,........,,,,,...,,,,,,.........,,,,,,,,R,,,,,,..TTT',
  'TTT........~~~~~.....,,,,,..................,,,,,,,,,,,,,,,..TTT',
  'TTT......~~~~~~~~~...,,,,,..................,,,R,,,,,,,,,,,..TTT',
  'TTT....~~~~~~~~~~~~~.......TTTTTTTTTT.......,,,,,,,,,,,,R,,..TTT',
  'TTT....~~~~~~~~~~~~~.......TTTTTTTTTT.......,,,,,,,,,,,,,,,..TTT',
  'TTT...~~~~~~~~~~~~~~~......TTTTTTTTTT.......,,,,,,,,,,,,,,,..TTT',
  'TTT...bbbbbbbbbbbbbbb......TTTTTTTTTT.....R..................TTT',
  'TTT...~~~~~~~~~~~~~~~......TTTTTTTTTT...........##.R.....R...TTT',
  'TTT....~~~~~~~~~~~~~.......TTTTTTTTTT..,,,,,,,,,##,..........TTT',
  'TTT....~~~~~~~~~~~~~.......TTTTTTTTTT..,,,,,,,,,##,..,,,,,,,.TTT',
  'TTT......~~~~~~~~~.........TTTTTTTTTT..,,,,,,,,,##,..,,,,,,,.TTT',
  'TTT,,,,,,..~~~~~.,,,,,,,,,.TTTTTTTTTT..,,,,,,R,,##,..,,,,,,,.TTT',
  'TTT,,,,,,........,,,,,,,,,.............,,,,,,,,,##,..,,R,,,,.TTT',
  'TTT,,,,,,.....##.,,,,,,,,,,,,,....,,,,,,,,,,,,,,##,..,,,,,,,.TTT',
  'TTT,,,,,,.....##.,,,,,,,,,,,,,....,,,,,,,,,,,,,,##,..,,,,,,,.TTT',
  'TTT,,,,,,...S.##.,,,,,,,,,,,,,....,,,,,,,,,,,,,,##,S.,,,,,,,.TTT',
  'TTT...........##.......,,,,,,,....,,,,,,,.......##...........TTT',
  'TTTTTTTTTTTTTT##TTTTTT....................TTTTTT##TTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTT##TTTTTT.......S............TTTTTT##TTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTT####################################TTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTT####################################TTTTTTTTTTTTTT',
  'TTT............................##............................TTT',
  'TTT............,,,,,,,,,,......##.......,,,,,,,,,,,,,........TTT',
  'TTT..FFFFFFFFF.,,,,,,,,,,......##.......,,,,,,,,,,,,,.~~~~~..TTT',
  'TTT..FfffffffF.,,,,,,,,,FFFFFF.##.FFFFFF,,,,,,,,,,,,,~~~~~~~.TTT',
  'TTT..FfffffffF.,,,,,,,,,FffffF.##.FffffF,,,,,,,,,,,,,~~~~~~~.TTT',
  'TTT..FfffffffF.,,,,,,,,,FffffF.##.FffffF,,,,,,,,,,,,,~~~~~~~.TTT',
  'TTT..FfffffffF.,,,,,,,,,Fffff..##..ffffF,,,,,,,,,,,,,.~~~~~..TTT',
  'TTT..FfffffffF.,,,,,,,,,FffffF.##.FffffF,,,,,,,,,,,,,........TTT',
  'TTT..FFFF.FFFF..........FFFFFF.##.FFFFFF,,,,,,,,,,,,,........TTT',
  'TTT......########################.............S...........R..TTT',
  'TTT......########################.................R..........TTT',
  'TTT..........S.........,,,,,,..##..,,,,,,...,,,,,,,,,,,,,,,,.TTT',
  'TTT,,,,,,,,,,..FFF.FFFF,,,,,,..##..,,,,,,...,,,,,,,,,,,,,,,,.TTT',
  'TTT,,,,,,,,,,..FffffffF,,,,,,..###############,,,,,,,,,,,,,,.TTT',
  'TTT,,,,,,,,,,..FffffffF,,,,,,..###############,,,,,,,,,,,,,,.TTT',
  'TTT,,,,,,,,,,..FffffffF,,,,,,..##..,,,,,,.TT,,,,,,,,,,,,,,,,.TTT',
  'TTT,,,,,,,,,,..FffffffF,,,,,,..##..,,,,,,.TT,,,,,,,,,,,,,,,,.TTT',
  'TTT,,,,,,,,,,..FffffffF........##.........TT,,,,,,,,,,,,,,,,.TTT',
  'TTT,,,,,,,,,,..FFFFFFFF........##.S.......TT,,,,,,,,,,,,,,,,.TTT',
  'TTTTTTTTTTT.........TTTTTTTTT..##..TTTTTTTTT..........TTTTTTTTTT',
  'TTTTTTTTTTT.........TTTTTTTTT..##..TTTTTTTTT..........TTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTG##GTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT##TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT##TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT##TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
];
const MW = MAP[0].length, MH = MAP.length;
const START = { x: 31, y: 47, dir: 'up' };
const SOLID = new Set(['T', '~', 'F', 'R', 'S', 'G']);
const SIGNS = {
  '34,45': '사파리존에 어서 와요! 키 큰 풀숲을 걸으면 야생 포켓몬이 나와요.',
  '29,24': '↖ 연못 구역   ↗ 바위 구역   ↓ 입구',
  '12,21': '연못 구역: 다리를 건너 보세요. 물가 풀숲에도 포켓몬이 숨어 있대요!',
  '51,21': '바위 구역: 바위 사이 풀숲이 아주 넓어요.',
  '46,36': '← 꽃밭   남동 풀숲은 사파리존에서 가장 넓은 풀숲이에요!',
  '13,38': '울타리 안 꽃밭은 들어가서 구경할 수 있어요.',
};
const tileAt = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH ? 'T' : MAP[y][x]);
const STEP_MS = 200;               // 한 칸 걷는 시간 (서버 걸음 속도 제한 6걸음/초 안쪽)
const SEND_EVERY = 3;              // 풀숲 걸음을 몇 걸음마다 서버로 보낼지

// ─────────────────────── 도트 그림 (그림판 → 미리 그린 맵) ───────────────────────
const loadImg = (name) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = new URL(`../img/${name}`, import.meta.url).href; });
// 이웃 비트 N1 E2 S4 W8 (이웃도 같은 땅이면 1). 맵 밖은 모래길만 이어짐 (입구 길이 아래로 빠져나감)
const same = (x, y, test, out) => (x < 0 || y < 0 || x >= MW || y >= MH ? out : test(MAP[y][x]));
const isSand = (c) => c === '#';
const isWater = (c) => c === '~' || c === 'b';
const isFence = (c) => c === 'F';
function maskOf(x, y, test, out = false) {
  return (same(x, y - 1, test, out) ? 1 : 0) | (same(x + 1, y, test, out) ? 2 : 0) | (same(x, y + 1, test, out) ? 4 : 0) | (same(x - 1, y, test, out) ? 8 : 0);
}
// 안쪽 모서리: 두 옆은 같은 땅인데 대각선만 다른 땅
function corners(x, y, m, test, out = false) {
  const r = [];
  if ((m & 9) === 9 && !same(x - 1, y - 1, test, out)) r.push('nw');
  if ((m & 3) === 3 && !same(x + 1, y - 1, test, out)) r.push('ne');
  if ((m & 12) === 12 && !same(x - 1, y + 1, test, out)) r.push('sw');
  if ((m & 6) === 6 && !same(x + 1, y + 1, test, out)) r.push('se');
  return r;
}
function prerender(sheet, f) {
  const cv = document.createElement('canvas'); cv.width = MW * TS; cv.height = MH * TS;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const put = (name, x, y) => { const t = TI[name]; if (t) g.drawImage(sheet, t[0], t[1], t[2], t[3], x, y + TS - t[3], t[2], t[3]); };
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const c = MAP[y][x], X = x * TS, Y = y * TS;
      if (c === '#') {
        const m = maskOf(x, y, isSand, true); put(`sand${m}`, X, Y);
        for (const k of corners(x, y, m, isSand, true)) put(`sandc${k}`, X, Y);
        continue;
      }
      if (isWater(c)) {
        const m = maskOf(x, y, isWater); put(`water${f}`, X, Y); put(`shore${m}`, X, Y);
        for (const k of corners(x, y, m, isWater)) put(`shorec${k}`, X, Y);
        if (c === 'b') put('bridge', X, Y);
        continue;
      }
      put('ground', X, Y);
      if (c === ',') put('tall', X, Y);
      else if (c === 'f') put(`flower${(x + y) & 1 ? 'B' : 'A'}${(f + x) & 1}`, X, Y);
      else if (c === 'F') put(`fence${maskOf(x, y, isFence)}`, X, Y);
      else if (c === 'R') put('rock', X, Y);
      else if (c === 'S') put('sign', X, Y);
      else if (c === 'G') put('post', X, Y);
    }
  }
  // 나무는 위 줄부터: 뾰족한 머리가 윗칸으로 8px 솟아 윗나무 밑동을 덮음 (숲이 빽빽해 보임)
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (MAP[y][x] === 'T') put('tree', x * TS, y * TS);
  return cv;
}
const HW = 16, HH = 24;              // 주인공 한 칸 (발 = 칸 아래쪽, 머리는 윗칸으로 8px)
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_ROW = { down: 0, up: 1, left: 2, right: 3 };

// ─────────────────────── 화면 (한 번만 만듦) ───────────────────────
let V = null;            // 화면 · 상태
const P = { x: START.x, y: START.y, dir: START.dir, fx: START.x, fy: START.y, moving: false, t0: 0, from: null, stepN: 0 };

export function viewSafari() {
  if (!V) V = build();
  V.start();
  V.refresh();
  bgmPreload('wild');   // 풀숲 만남 때 바로 나오게 야생 곡을 미리 풀어 둠
  return V.root;
}

function build() {
  let maps = null, hero = null;      // 미리 그린 맵 2장 · 주인공 그림판 (그림이 오기 전엔 빈 배경)
  Promise.all([loadImg('safari-tiles.png'), loadImg('safari-hero.png')]).then(([sheet, hr]) => {
    maps = [prerender(sheet, 0), prerender(sheet, 1)]; hero = hr;
  }).catch(() => {});
  const cv = h('canvas.sf-canvas', { 'aria-label': '사파리존 지도. 아래 방향 버튼이나 키보드 화살표로 걸어요.' });
  const g = cv.getContext('2d');
  const cover = h('div.sf-cover', { hidden: true });
  const msg = h('p.sf-msg', { 'aria-live': 'polite' });          // 맵 아래쪽 글 상자 (표지판·안내, 몇 초 뒤 사라짐)
  const stage = h('div.sf-stage', cv, msg, cover);
  const ballsEl = h('b.sf-num', '-');
  const encEl = h('span.sf-sub', '');
  const pendBtn = h('button.btn.small.primary.sf-pend', { hidden: true, onclick: () => { if (busy) return; sfx.select(); const e = st?.pending; if (e) startCatch(e); } }, '기다리는 포켓몬 잡기');   // 만남 연출 중에 눌러도 두 번 열리지 않게
  let ballIco = h('span.sf-ball');
  import('./catch.js').then((m) => { const c = m.ballCanvas('safari', 2); ballIco.replaceWith(c); ballIco = c; }).catch(() => {});
  const held = new Map();       // pointerId → 방향 (손가락 여러 개)
  const keys = [];              // 누르고 있는 키 방향 (마지막 것 우선)
  const pad = h('div.sf-pad', { role: 'group', 'aria-label': '방향 버튼' }, ['up', 'left', 'right', 'down'].map((d) => {
    const b = h(`button.sf-dir.sf-${d}`, { type: 'button', 'aria-label': { up: '위로', down: '아래로', left: '왼쪽으로', right: '오른쪽으로' }[d] }, h('i'));
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); held.set(e.pointerId, d); b.classList.add('on'); try { b.releasePointerCapture?.(e.pointerId); } catch { /* */ } kick(d); });
    b.addEventListener('pointerenter', (e) => { if (held.has(e.pointerId)) { held.set(e.pointerId, d); b.classList.add('on'); } });
    b.addEventListener('pointerleave', () => b.classList.remove('on'));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }));
  const up = (e) => { if (held.delete(e.pointerId)) pad.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  const info = h('div.sf-info', h('div.sf-balls', ballIco, h('span.sf-bl', h('small', '사파리볼'), ballsEl)), encEl, pendBtn);
  const ctl = h('div.sf-ctl', pad, info);
  const root = h('div.sf', stage, ctl);

  const KEY = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
  const active = () => root.isConnected && S.tab === 'map' && !S.overlay && !document.querySelector('.cz-layer');
  window.addEventListener('keydown', (e) => {
    const d = KEY[e.key]; if (!d || !active() || e.target?.closest?.('input,textarea,select')) return;
    e.preventDefault(); if (!keys.includes(d)) keys.push(d); kick(d);
  });
  window.addEventListener('keyup', (e) => { const d = KEY[e.key]; if (d) { const i = keys.indexOf(d); if (i >= 0) keys.splice(i, 1); } });
  window.addEventListener('blur', () => { keys.length = 0; held.clear(); });
  const wantDir = () => keys[keys.length - 1] || [...held.values()].pop() || null;

  // ── 서버 상태 ──
  let st = null, loading = false, inflight = false, grassPend = 0, busy = false, flashT = -1, bubbleT = -1, lastSign = '';
  let sayTimer = 0;
  const say = (t, ms = 4500) => {
    msg.textContent = t || ''; msg.classList.toggle('on', !!t);
    clearTimeout(sayTimer); if (t) sayTimer = setTimeout(() => { msg.classList.remove('on'); lastSign = ''; }, ms);
  };
  setTimeout(() => { if (!closed()) say('키 큰 풀숲을 걸으면 야생 포켓몬이 나와요!'); }, 900);
  const refresh = async () => {
    if (loading || !S.online) { paintInfo(); return; }
    loading = true;
    try { st = await rpc('safari_state', {}); } catch (e) { if (!e.offline) say(errorText(e.message)); }
    loading = false; paintInfo();
  };
  const closed = () => !st ? null : st.pending ? null : st.balls_left <= 0 ? 'balls' : st.encounters_today >= st.max_encounters ? 'max' : null;
  function paintInfo() {
    ballsEl.textContent = st ? `${st.balls_left}/${st.balls_daily}` : '-';
    encEl.textContent = !S.online ? '인터넷이 연결되면 포켓몬이 나와요' : st ? `오늘 만난 포켓몬 ${st.encounters_today}/${st.max_encounters}` : '불러오는 중…';
    encEl.title = '키 큰 풀숲을 걸으면 야생 포켓몬이 나와요';
    pendBtn.hidden = !st?.pending;
    const why = closed();
    cover.hidden = !why;
    if (why) cover.replaceChildren(h('b', why === 'balls' ? '오늘 사파리볼을 다 썼어요' : '오늘은 포켓몬이 모두 숨었어요'),
      h('span', '내일 다시 와 주세요!'));
  }

  // 풀숲 걸음 보내기 → 만남이면 잡기
  async function send() {
    if (inflight || grassPend <= 0 || !S.online || !st || closed() || busy) return;
    const n = Math.min(grassPend, 1000); grassPend -= n; inflight = true;
    let r = null;
    try { r = await rpc('safari_encounter', { p_steps: n }); } catch (e) { if (!e.offline) say(errorText(e.message)); }
    inflight = false;
    if (!r) return;
    st = { ...st, ...r };
    paintInfo();
    if (r.encounter) encounter(r.encounter);

  }
  // 만남: 야생 곡을 먼저 틀고, 곡의 첫 타격에 '!' · 2박 뒤 화면 번쩍 (음악이 꺼져 있으면 예전처럼 효과음 + 정해진 시간)
  async function encounter(e) {
    busy = true; held.clear(); keys.length = 0;
    pad.querySelectorAll('.on').forEach((x) => x.classList.remove('on'));
    const music = bgmPush('wild');
    const on = await bgmReady('wild', 1200);
    const hit = on ? bgmBeat('wild') : null;
    const now = performance.now();
    if (hit == null) { sfx.scan(); bubbleT = now; flashT = now + 450; }
    else { bubbleT = now + hit; flashT = now + (bgmBeat('wild', hit + 1) ?? hit + 325) + 325; }   // 타격 다음 박 + 1박 = 2박 뒤
    await new Promise((res) => setTimeout(res, flashT - now + 850));
    flashT = -1; bubbleT = -1;
    await startCatch(e, music);
  }
  async function startCatch(e, music = null) {
    busy = true;
    try {
      const r = await catchEncounter({ ...e, kind: 'safari', flee: st?.settings?.flee });
      if (r?.safari) st = r.safari;
    } finally {
      music?.pop();
      busy = false;
      await refresh();
      if (!closed()) say('풀숲을 더 걸어 볼까요?', 2500);
    }
  }

  // ── 걷기 ──
  function kick(d) { if (!P.moving && !busy) tryMove(d, performance.now()); }
  function tryMove(d, now) {
    if (busy) return;
    if (closed()) { P.dir = d; return; }
    P.dir = d;
    const [dx, dy] = DIRS[d]; const nx = P.x + dx, ny = P.y + dy; const t = tileAt(nx, ny);
    if (SOLID.has(t)) {
      const sg = t === 'S' ? SIGNS[`${nx},${ny}`] : null;
      if (sg && lastSign !== sg) { say(sg); lastSign = sg; sfx.blip(); }
      return;
    }
    lastSign = '';
    P.from = { x: P.x, y: P.y }; P.x = nx; P.y = ny; P.moving = true; P.t0 = now; P.stepN++;
  }
  function arrive() {
    P.moving = false; P.fx = P.x; P.fy = P.y;
    if (tileAt(P.x, P.y) === ',' && st && !closed()) { grassPend++; if (grassPend >= SEND_EVERY) send(); }
  }

  // ── 그리기 ──
  let VW = 160, VH = 128, raf = 0;
  const fit = () => {
    if (!root.isConnected) return;
    const w = Math.min(560, stage.clientWidth || root.clientWidth || 320);
    const dpr = window.devicePixelRatio || 1; const dev = Math.floor(w * dpr);
    const kd = Math.max(1, Math.round(dev / 176));       // 화면에 나무 11칸쯤
    VW = Math.min(MW * TS, Math.floor(dev / kd));
    // 높이: 방향 버튼·아래 메뉴까지 한 화면에 들어가게 (너무 작으면 7칸, 많아야 폭의 0.85)
    const nav = document.querySelector('nav.tabs')?.offsetHeight || 0;
    const top = stage.getBoundingClientRect().top + window.scrollY;
    const avail = window.innerHeight - top - (ctl.offsetHeight || 160) - nav - 24;
    VH = Math.max(7 * TS, Math.min(Math.round(VW * 0.85), MH * TS, Math.floor((avail * dpr) / kd)));
    if (cv.width !== VW || cv.height !== VH) { cv.width = VW; cv.height = VH; }
    cv.style.width = `${(VW * kd) / dpr}px`; cv.style.height = `${(VH * kd) / dpr}px`;
    g.imageSmoothingEnabled = false;
  };
  const ro = new ResizeObserver(fit); ro.observe(stage);
  window.addEventListener('resize', fit);
  function frame(now) {
    if (!root.isConnected) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    // 움직임
    if (P.moving) {
      const k = Math.min(1, (now - P.t0) / STEP_MS);
      P.fx = P.from.x + (P.x - P.from.x) * k; P.fy = P.from.y + (P.y - P.from.y) * k;
      if (k >= 1) { arrive(); const d = active() && wantDir(); if (d) tryMove(d, now); }
    } else if (!busy && active()) { const d = wantDir(); if (d) tryMove(d, now); }
    draw(now);
  }
  function draw(now) {
    const af = Math.floor(now / 520) % 2;
    const px = Math.round(P.fx * TS + TS / 2), py = Math.round(P.fy * TS + TS / 2);
    const camX = Math.max(0, Math.min(MW * TS - VW, px - Math.floor(VW / 2)));
    const camY = Math.max(0, Math.min(MH * TS - VH, py - Math.floor(VH / 2)));
    if (!maps) { g.fillStyle = '#8cd6b8'; g.fillRect(0, 0, VW, VH); return; }
    const map = maps[af];
    g.drawImage(map, camX, camY, VW, VH, 0, 0, VW, VH);
    // 주인공 (그림자 + 걷기 그림): 발이 칸 아래쪽, 머리는 윗칸으로
    const hx = Math.round(P.fx * TS) - camX, hy = Math.round(P.fy * TS) - camY + TS - HH;
    const k = P.moving ? (now - P.t0) / STEP_MS : 0;
    const fi = P.moving && k > 0.15 && k < 0.85 ? (P.stepN % 2 ? 1 : 2) : 0;
    g.fillStyle = 'rgba(20,60,40,.25)'; g.fillRect(hx + 3, hy + HH - 2, 10, 2); g.fillRect(hx + 4, hy + HH - 1, 8, 1);
    g.drawImage(hero, fi * HW, DIR_ROW[P.dir] * HH, HW, HH, hx, hy, HW, HH);
    // 풀숲 안이면 다리를 풀잎이 가림 (미리 그린 맵의 그 칸 아랫부분을 다시 덮음)
    const gx = Math.round(P.fx), gy = Math.round(P.fy);
    if (tileAt(gx, gy) === ',') g.drawImage(map, gx * TS, gy * TS + 10, TS, 6, gx * TS - camX, gy * TS - camY + 10, TS, 6);
    // 만남: 머리 위 '!' → 화면 번쩍
    if (bubbleT > 0 && now >= bubbleT) {
      const bx = hx + 5, by = hy - 8;
      g.fillStyle = '#283040'; g.fillRect(bx - 1, by - 1, 8, 11);
      g.fillStyle = '#ffffff'; g.fillRect(bx, by, 6, 9);
      g.fillStyle = '#e83838'; g.fillRect(bx + 2, by + 1, 2, 5); g.fillRect(bx + 2, by + 7, 2, 1);
    }
    if (flashT > 0 && now > flashT) {
      const ph = Math.floor((now - flashT) / 110);
      if (ph < 6 && ph % 2 === 0) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 0, VW, VH); }
      else if (ph >= 6) { g.fillStyle = '#182030'; g.fillRect(0, 0, VW, VH); }
    }
  }
  const start = () => { requestAnimationFrame(() => { fit(); if (!raf && root.isConnected) raf = requestAnimationFrame(frame); }); };
  // 시험용
  window.__safari = { P, maps: () => maps, state: () => st, tile: tileAt, map: MAP, move: (d) => kick(d), busy: () => busy, view: () => ({ VW, VH }) };
  return { root, start, refresh };
}

export const safariMapForTest = { MAP, MW, MH, SOLID };
