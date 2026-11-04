// 사파리존: 지도 탭의 작은 도트 맵. 키 큰 풀숲을 걸으면 야생 포켓몬이 나오고 사파리볼(하루 N개)로 잡는다.
// 걸음 판정·볼 개수는 서버 (0033 safari_encounter · safari_result) — 앱은 풀숲 걸음 수만 보냄.
// 그림은 모두 이 파일에서 도트로 그림 (원래 게임의 지도·타일을 베끼지 않은 새 그림). 타일 16×16, 화면은 기기 픽셀 정수 배.
// 화면은 한 번 만들고 계속 씀 (sync 가 지도 탭을 다시 그려도 걷던 자리·애니메이션이 이어지게).
import { rpc, errorText } from './sb.js';
import { sfx } from './sfx.js';
import { h } from './ui.js';
import { S } from './state.js';
import { catchEncounter } from './app.js';

const TS = 16;
// T 나무 · . 풀밭 · , 키 큰 풀숲 · # 길 · ~ 물 · b 다리 · F 울타리 · f 꽃 · R 바위 · S 표지판 · G 문기둥
const MAP = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TT,,,,,,,,,..TTTTT..,,,,,,,,TT',
  'TT,,,,,,,,,,..TTT..,,,,,,,,,TT',
  'TT,,,R,,,,,,,.......,,,,R,,,TT',
  'TT,,,,,,,,,,,..#....,,,,,,,,TT',
  'TT..,,,,,,,f...#...,,,,,,,..TT',
  'TT.....,,,..f..#.....,,,....TT',
  'TT...S.........#.........f..TT',
  'TTFFFFFFF......#..~~~~~~~...TT',
  'TT,,,,,,F......#.~~~~~~~~~..TT',
  'TT,,,,,,F..R...#.~~~~~~~~~~.TT',
  'TT,,,,,,.......#bbbbbbbbbbb.TT',
  'TT,,,,,,F...f..#.~~~~~~~~~,,TT',
  'TT,,R,,,F......#..~~~~~~~,,,TT',
  'TTFFFFFFF......#.......,,,,,TT',
  'TT.....f.......#......,,,R,,TT',
  'TT..,,,,....####......,,,,,,TT',
  'TT.,,,,,,...#..f.....,,,,,,.TT',
  'TT.,,,,,,,..#.......,,,,,,..TT',
  'TT..,,,R,,..#..........ff...TT',
  'TT...,,,,...#.....R.........TT',
  'TT..........#..S............TT',
  'TTTTTTTTTTTG#GTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTT.#.TTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
];
const MW = MAP[0].length, MH = MAP.length;
const START = { x: 12, y: 22, dir: 'up' };
const SOLID = new Set(['T', '~', 'F', 'R', 'S', 'G']);
const SIGNS = {
  '5,8': '← 울타리 안 풀숲은 아주 넓어요. 포켓몬이 많이 숨어 있대요!',
  '15,22': '사파리존에 어서 와요! 키 큰 풀숲을 걸으면 야생 포켓몬이 나와요.',
};
const tileAt = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH ? 'T' : MAP[y][x]);
const STEP_MS = 200;               // 한 칸 걷는 시간 (서버 걸음 속도 제한 6걸음/초 안쪽)
const SEND_EVERY = 3;              // 풀숲 걸음을 몇 걸음마다 서버로 보낼지

// ─────────────────────── 도트 그림 ───────────────────────
const hash = (x, y) => { let n = x * 374761393 + y * 668265263; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
const C = {
  grass: '#8fd06c', grassD: '#72b856', grassL: '#b4e48a',
  tall: '#3e9a3c', tallD: '#26702a', tallL: '#74c65a', tallK: '#1c5420',
  path: '#e4cc94', pathD: '#c8a86c', pathL: '#f4e2b4',
  water: '#4a8ed8', waterD: '#2e6cb8', waterL: '#a0d0f4',
  leaf: '#2f7d3a', leafD: '#1d5428', leafL: '#56a24a', trunk: '#7a4a28', trunkD: '#4e2e18',
  wood: '#c08040', woodD: '#7a4a20', woodL: '#e0a868',
  rock: '#9ca2ac', rockD: '#646a76', rockL: '#d0d4da',
  stone: '#b8b0a0', stoneD: '#7a7266',
};
function makeTiles() {
  const cv = document.createElement('canvas'); cv.width = TS * 16; cv.height = TS * 2;
  const g = cv.getContext('2d');
  const at = {}; let n = 0;
  const tile = (key, frames, draw) => {
    at[key] = [];
    for (let f = 0; f < frames; f++) {
      const ox = n * TS, oy = f * TS;
      const px = (x, y, c, w = 1, hh = 1) => { g.fillStyle = c; g.fillRect(ox + x, oy + y, w, hh); };
      draw(px, f);
      at[key].push([ox, oy]);
    }
    if (frames === 1) at[key].push(at[key][0]);
    n++;
  };
  const grass = (px) => {
    px(0, 0, C.grass, 16, 16);
    for (const [x, y] of [[2, 3], [10, 2], [6, 9], [13, 11], [3, 13]]) { px(x, y, C.grassD); px(x + 1, y - 1, C.grassD); px(x + 2, y, C.grassD); }
    px(8, 5, C.grassL); px(12, 7, C.grassL); px(4, 7, C.grassL);
  };
  tile('.', 1, grass);
  // 키 큰 풀숲: 뾰족한 잎 두 줄, 바람에 살짝 흔들림 (2장)
  tile(',', 2, (px, f) => {
    px(0, 0, C.tall, 16, 16);
    for (const [bx, by] of [[0, 1], [8, 1], [4, 9], [12, 9]]) {
      const s = f ? 1 : 0;
      px(bx + 1, by + 6, C.tallD, 6, 1);
      px(bx + 1 + s, by + 1, C.tallK); px(bx + 1 + s, by + 2, C.tallL); px(bx + 1, by + 3, C.tallL, 1, 3);
      px(bx + 3, by, C.tallK); px(bx + 3, by + 1, C.tallL); px(bx + 3, by + 2, C.tallL, 1, 4);
      px(bx + 5 - s, by + 1, C.tallK); px(bx + 5 - s, by + 2, C.tallL); px(bx + 5, by + 3, C.tallL, 1, 3);
      px(bx + 2, by + 4, C.tallD, 1, 2); px(bx + 4, by + 4, C.tallD, 1, 2); px(bx + 6, by + 4, C.tallD, 1, 2);
    }
  });
  tile('#', 1, (px) => {
    px(0, 0, C.path, 16, 16);
    for (const [x, y] of [[3, 4], [11, 2], [7, 10], [13, 13], [2, 12]]) { px(x, y, C.pathD, 2, 1); px(x, y - 1, C.pathL, 1, 1); }
  });
  tile('~', 2, (px, f) => {
    px(0, 0, C.water, 16, 16);
    const o = f ? 3 : 0;
    for (const [x, y] of [[1, 3], [9, 6], [4, 11], [11, 13]]) { px((x + o) % 13, y, C.waterL, 3, 1); px((x + o) % 13 + 1, y + 1, C.waterD, 3, 1); }
  });
  tile('b', 1, (px) => {
    px(0, 0, C.water, 16, 16);
    px(0, 1, C.woodD, 16, 1); px(0, 14, C.woodD, 16, 1);
    px(0, 2, C.wood, 16, 12);
    for (let x = 0; x < 16; x += 4) { px(x, 2, C.woodD, 1, 12); px(x + 1, 2, C.woodL, 1, 12); }
  });
  tile('F', 1, (px) => {
    grass(px);
    px(0, 5, C.woodD, 16, 1); px(0, 6, C.wood, 16, 2); px(0, 8, C.woodD, 16, 1);
    px(0, 10, C.woodD, 16, 1); px(0, 11, C.wood, 16, 1); px(0, 12, C.woodD, 16, 1);
    for (const x of [2, 10]) { px(x, 2, C.woodD, 4, 12); px(x + 1, 3, C.woodL, 2, 10); px(x + 1, 2, C.wood, 2, 1); }
  });
  tile('f', 2, (px, f) => {
    grass(px);
    for (const [x, y, c] of [[3, 3, '#f06878'], [10, 5, '#ffd84a'], [5, 11, '#ffd84a'], [12, 12, '#f06878']]) {
      const yy = y + (f && (x + y) % 2 ? 1 : 0);
      px(x, yy - 1, c); px(x - 1, yy, c); px(x + 1, yy, c); px(x, yy + 1, c); px(x, yy, '#fff4c8'); px(x, yy + 2, C.grassD, 1, 2);
    }
  });
  tile('R', 1, (px) => {
    grass(px);
    px(3, 13, C.grassD, 11, 1);
    px(4, 4, C.rockD, 8, 1); px(3, 5, C.rockD, 10, 1); px(2, 6, C.rockD, 12, 7); px(3, 13, C.rockD, 10, 1);
    px(4, 5, C.rock, 8, 1); px(3, 6, C.rock, 10, 6); px(4, 12, C.rock, 8, 1);
    px(4, 6, C.rockL, 3, 2); px(5, 8, C.rockL, 1, 1); px(9, 10, C.rockD, 3, 1);
  });
  tile('S', 1, (px) => {
    grass(px);
    px(7, 9, C.trunkD, 2, 6);
    px(2, 2, C.woodD, 12, 8); px(3, 3, C.wood, 10, 6); px(3, 3, C.woodL, 10, 1);
    px(5, 5, C.woodD, 6, 1); px(5, 7, C.woodD, 4, 1);
  });
  tile('G', 1, (px) => {
    px(0, 0, C.path, 16, 16);
    px(2, 0, C.stoneD, 12, 16); px(3, 1, C.stone, 10, 14); px(3, 1, '#d8d0c0', 10, 2);
    px(2, 0, '#c84838', 12, 3); px(3, 0, '#e86a50', 10, 1);
  });
  tile('T', 1, () => { /* 나무는 아래 drawTree */ });
  return { cv, at };
}
// 나무: 둥근 잎 덩어리 (칸마다 무늬가 조금 다름)
function drawTree(g, x, y, v) {
  g.fillStyle = C.grassD; g.fillRect(x, y, TS, TS);
  g.fillStyle = C.trunkD; g.fillRect(x + 6, y + 11, 4, 5);
  g.fillStyle = C.trunk; g.fillRect(x + 7, y + 11, 2, 4);
  g.fillStyle = C.leafD; g.fillRect(x + 2, y + 1, 12, 11); g.fillRect(x + 1, y + 3, 14, 7); g.fillRect(x + 4, y, 8, 13);
  g.fillStyle = C.leaf; g.fillRect(x + 3, y + 1, 10, 9); g.fillRect(x + 2, y + 3, 12, 6); g.fillRect(x + 5, y + 1, 6, 11);
  g.fillStyle = C.leafL; g.fillRect(x + 4, y + 2 + (v > 0.5 ? 1 : 0), 4, 2); g.fillRect(x + 3, y + 4, 2, 2); g.fillRect(x + 9 + (v > 0.7 ? 1 : 0), y + 4, 2, 1);
  g.fillStyle = C.leafD; g.fillRect(x + 6, y + 7, 1, 1); g.fillRect(x + 10, y + 8, 1, 1);
}

// 주인공 (새 그림): 카키 사파리 모자 · 파란 옷. 12×16, 방향마다 [서기, 걷기]. 위·아래는 반쪽 + 거울
const PAL = { k: '#283040', h: '#d8c070', H: '#9a8440', s: '#f8c8a0', S: '#d89870', r: '#6a4028', c: '#3a8ad0', C: '#28609a', w: '#f8f8f8', p: '#4a4a5a', b: '#7a4a24' };
const mirror = (rows) => rows.map((r) => r + [...r].reverse().join(''));
const flipRows = (rows) => rows.map((r) => [...r].reverse().join(''));
const DOWN = mirror(['....kk', '..kkhh', '.khhhh', '.khhhh', 'kHHHHH', '.kssss', '.ksskS', '.kssss', '..kkss', '.kccww', 'kscccc', 'kscccc', '.kpppp', '.kpppk', '.kbbbk', '..kkk.']);
const UP = mirror(['....kk', '..kkhh', '.khhhh', '.khhhh', 'kHHHHH', '.krrrr', '.krrrr', '.krrrr', '..kkrr', '.kcccc', 'kscccc', 'kscccc', '.kpppp', '.kpppk', '.kbbbk', '..kkk.']);
const stepDown = (rows) => [...rows.slice(0, 13), '.kpppkkbbbk.', '.kbbbk.kkk..', '..kkk.......'];
const LEFT = ['.....kkkk...', '...kkhhhhk..', '..khhhhhhhk.', '..khhhhhhhk.', 'kHHHHHHHHk..', '.kssssrrrk..', '.ksksssrrk..', '.kssssssrk..', '..kkssskk...', '..kccccck...', '..kcsccck...', '..kcsccck...', '..kpppppk...', '..kppkppk...', '..kbbkbbk...', '..kkk.kkk...'];
const LEFT_STEP = [...LEFT.slice(0, 12), '..kpppppk...', '.kppk.kppk..', '.kbbk..kbbk.', '..kk....kk..'];
const HERO = {
  down: [DOWN, stepDown(DOWN), flipRows(stepDown(DOWN))],
  up: [UP, stepDown(UP), flipRows(stepDown(UP))],
  left: [LEFT, LEFT_STEP, LEFT_STEP],
  right: [flipRows(LEFT), flipRows(LEFT_STEP), flipRows(LEFT_STEP)],
};
function makeHero() {
  const cv = document.createElement('canvas'); cv.width = 12 * 3; cv.height = 16 * 4;
  const g = cv.getContext('2d');
  ['down', 'up', 'left', 'right'].forEach((d, j) => HERO[d].forEach((rows, i) => rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (PAL[ch]) { g.fillStyle = PAL[ch]; g.fillRect(i * 12 + x, j * 16 + y, 1, 1); }
  }))));
  return cv;
}
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_ROW = { down: 0, up: 1, left: 2, right: 3 };

// ─────────────────────── 화면 (한 번만 만듦) ───────────────────────
let V = null;            // 화면 · 상태
const P = { x: START.x, y: START.y, dir: START.dir, fx: START.x, fy: START.y, moving: false, t0: 0, from: null, stepN: 0 };

export function viewSafari() {
  if (!V) V = build();
  V.start();
  V.refresh();
  return V.root;
}

function build() {
  const tiles = makeTiles(); const hero = makeHero();
  const cv = h('canvas.sf-canvas', { 'aria-label': '사파리존 지도. 아래 방향 버튼이나 키보드 화살표로 걸어요.' });
  const g = cv.getContext('2d');
  const cover = h('div.sf-cover', { hidden: true });
  const msg = h('p.sf-msg', { 'aria-live': 'polite' });          // 맵 아래쪽 글 상자 (표지판·안내, 몇 초 뒤 사라짐)
  const stage = h('div.sf-stage', cv, msg, cover);
  const ballsEl = h('b.sf-num', '-');
  const encEl = h('span.sf-sub', '');
  const pendBtn = h('button.btn.small.primary.sf-pend', { hidden: true, onclick: () => { sfx.select(); const e = st?.pending; if (e) startCatch(e); } }, '기다리는 포켓몬 잡기');
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
  async function encounter(e) {
    busy = true; held.clear(); keys.length = 0;
    pad.querySelectorAll('.on').forEach((x) => x.classList.remove('on'));
    sfx.scan();
    bubbleT = performance.now(); flashT = bubbleT + 450;
    await new Promise((res) => setTimeout(res, 1300));
    flashT = -1; bubbleT = -1;
    await startCatch(e);
  }
  async function startCatch(e) {
    busy = true;
    try {
      const r = await catchEncounter({ ...e, kind: 'safari', flee: st?.settings?.flee });
      if (r?.safari) st = r.safari;
    } finally {
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
    const x0 = Math.floor(camX / TS), y0 = Math.floor(camY / TS);
    for (let ty = y0; ty <= y0 + Math.ceil(VH / TS) + 1; ty++) {
      for (let tx = x0; tx <= x0 + Math.ceil(VW / TS) + 1; tx++) {
        if (tx >= MW || ty >= MH) continue;
        const c = MAP[ty][tx]; const sx = tx * TS - camX, sy = ty * TS - camY;
        if (c === 'T') { drawTree(g, sx, sy, hash(tx, ty)); continue; }
        const fr = tiles.at[c] || tiles.at['.'];
        const [ox, oy] = fr[(af + ((tx + ty) & 1)) % 2];
        g.drawImage(tiles.cv, ox, oy, TS, TS, sx, sy, TS, TS);
      }
    }
    // 주인공 (그림자 + 걷기 그림)
    const hx = Math.round(P.fx * TS) - camX + 2, hy = Math.round(P.fy * TS) - camY - 3;
    const k = P.moving ? (now - P.t0) / STEP_MS : 0;
    const fi = P.moving && k > 0.2 && k < 0.8 ? (P.stepN % 2 ? 1 : 2) : 0;
    g.fillStyle = 'rgba(20,40,20,.28)'; g.fillRect(hx + 2, hy + 16, 8, 2);
    g.drawImage(hero, fi * 12, DIR_ROW[P.dir] * 16, 12, 16, hx, hy, 12, 16);
    // 풀숲 안이면 다리를 풀잎이 가림
    const under = tileAt(Math.round(P.fx), Math.round(P.fy));
    if (under === ',') {
      const [ox, oy] = tiles.at[','][af];
      const gx = Math.round(P.fx) * TS - camX, gy = Math.round(P.fy) * TS - camY;
      g.drawImage(tiles.cv, ox, oy + 9, TS, 7, gx, gy + 9, TS, 7);
    }
    // 만남: 머리 위 '!' → 화면 번쩍
    if (bubbleT > 0) {
      const bx = hx + 3, by = hy - 11;
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
  window.__safari = { P, state: () => st, tile: tileAt, map: MAP, move: (d) => kick(d), busy: () => busy, view: () => ({ VW, VH }) };
  return { root, start, refresh };
}

export const safariMapForTest = { MAP, MW, MH, SOLID };
