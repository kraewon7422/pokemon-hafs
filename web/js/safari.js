// 사파리존: 지도 탭의 큰 도트 맵 (3세대 사파리존처럼 가운데 + 북서·북동·남서·남동 구역, 모래길로 이어짐).
// v2 (2026-11-05): 동굴 미로 셋 (여울의 동굴 · 미혹의 동굴 · 깊은 동굴) → 깊은 바깥 구역 (깊은 연못 · 하늘 언덕),
//   화면이 어두워지며 지도 이동, 입구 옆 사육사 (전설 힌트 글 상자), 전설 포켓몬 자리 (조건이 되면 '!' → 잡기 훅),
//   사파리볼을 다 쓰면 3세대처럼 "눈이 캄캄해졌다…" → 입구로 돌아감. 예전 판: .work/old/safari_v1.js
//   깊은 동굴의 울트라 워프홀 → 울트라 스페이스 (울트라비스트 전용 구역). 만남 걸음은 구역 (zoneAt) 별로 reportSteps 한 곳에서 보냄.
// 키 큰 풀숲 (동굴은 바닥) 을 걸으면 야생 포켓몬이 나오고 사파리볼(하루 N개)로 잡는다.
// 걸음 판정·볼 개수는 서버 (0033 safari_encounter(p_steps) · safari_result) — 앱은 만남 칸 걸음 수만 보냄.
// 지도 글자·이동·전설 자리 = safari-maps.js. 그림: safari-tiles.png (16px 타일, 위치표 safari-tiles.js) ·
//   safari-hero.png (교복 주인공 16×24) · safari-keeper.png (사육사) — tools/build_safari_tiles.py 가 그림.
// 지도는 그림이 오면 처음 들어갈 때 한 번 큰 캔버스 2장(물·꽃 움직임)에 미리 그려 두고, 매 프레임 카메라 부분만 옮겨 그림. 화면은 기기 픽셀 정수 배.
// 화면은 한 번 만들고 계속 씀 (sync 가 지도 탭을 다시 그려도 걷던 자리·애니메이션이 이어지게).
import { rpc, errorText } from './sb.js';
import { sfx, bgmPush, bgmReady, bgmBeat, bgmPreload } from './sfx.js';
import { h, josa } from './ui.js';
import { S } from './state.js';
import { catchEncounter } from './app.js';
import { monCell } from './sprites.js';
import TI from '../img/safari-tiles.js';
import { MAPS, SOLID, ENC, LEGEND_HINTS, ZONE_HINTS, ULTRA_BEASTS } from './safari-maps.js';

export { LEGEND_HINTS, ZONE_HINTS, ULTRA_BEASTS };

const TS = 16;
const START = { map: 'safari', x: MAPS.safari.start[0], y: MAPS.safari.start[1], dir: MAPS.safari.start[2] };
const STEP_MS = 200;               // 한 칸 걷는 시간 (서버 걸음 속도 제한 6걸음/초 안쪽)
const SEND_EVERY = 3;              // 만남 칸 걸음을 몇 걸음마다 서버로 보낼지

// ─────────────────────── 전설 포켓몬 (서버와 이을 곳) ───────────────────────
// ?legend=1 = 시험용: 조건을 모두 채운 것처럼
const DEV_LEGEND = (() => { try { return new URLSearchParams(location.search).get('legend') === '1'; } catch { return false; } })();
const hintOf = (dex) => LEGEND_HINTS.find((l) => l.dex === Number(dex));
// 전국도감 번호 → 앱 species.id (그림판 칸 번호는 species.id). 도감 목록 (S.catalog) 이 있으면 그것,
// 없으면 (불러오기 전·미리보기) 아래 표 — tools/pokemon_sprites.json 에서 잰 값
const SPECIES_FALLBACK = { 377: 667, 378: 670, 379: 673, 486: 826, 249: 493, 382: 682, 383: 685, 250: 496, 384: 688 };
const speciesIdOf = (dex) => S.catalog?.species?.find((sp) => sp.dex === dex)?.id || SPECIES_FALLBACK[dex];
// 서버가 조건을 알려 주면 부름: setLegendHints([{ dex, ok, cond?, where?, caught? }])
export function setLegendHints(list) {
  for (const x of list || []) {
    const t = hintOf(x.dex); if (!t) continue;
    if (x.ok != null) t.ok = !!x.ok;
    if (x.caught != null) t.caught = !!x.caught;
    if (x.cond) t.cond = x.cond;
    if (x.where) t.where = x.where;
  }
}
// 조건을 채웠는지 (지금은 LEGEND_HINTS 의 ok — 아직 서버가 채우지 않으니 늘 false. ?legend=1 이면 true)
export function legendReady(dex) { return DEV_LEGEND || !!hintOf(dex)?.ok; }
// ⚠ 자리표시 (STUB): 전설 포켓몬과 만남 → 잡기. 나중에 서버 (0038 예정) 와 이어서 catchEncounter 를 부르게 바꿀 것.
//   dex = 전국도감 번호 · ctx = { talk(lines) → Promise, map: 지금 지도 id, name } · 돌려줌 { caught: bool }
//   caught 가 아니면 (도망·놓침) 지도에 그대로 남아 다시 도전할 수 있음.
export async function startLegendEncounter(dex, ctx) {
  await ctx.talk([`(시험판) ${josa(ctx.name, '과', '와')}의 승부는 곧 열려요!`, '지금은 서버와 이어지기 전이라 만나기만 할 수 있어요.']);
  return { caught: false };
}

// ─────────────────────── 도트 그림 (그림판 → 미리 그린 맵) ───────────────────────
const loadImg = (name) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = new URL(`../img/${name}`, import.meta.url).href; });
const isSand = (c) => c === '#';
const isWater = (c) => c === '~' || c === 'b';
const isFence = (c) => c === 'F';
const isRock = (c) => c === 'M' || c === 'C';
const isCWall = (c) => c === 'W' || c === 'B';
function prerender(sheet, f, m) {
  const R = m.rows, W = R[0].length, H = R.length, cave = m.kind === 'cave';
  // 이웃 비트 N1 E2 S4 W8 (이웃도 같은 땅이면 1). 맵 밖 = out
  const same = (x, y, test, out) => (x < 0 || y < 0 || x >= W || y >= H ? out : test(R[y][x]));
  const maskOf = (x, y, test, out = false) => (same(x, y - 1, test, out) ? 1 : 0) | (same(x + 1, y, test, out) ? 2 : 0) | (same(x, y + 1, test, out) ? 4 : 0) | (same(x - 1, y, test, out) ? 8 : 0);
  // 안쪽 모서리: 두 옆은 같은 땅인데 대각선만 다른 땅
  const corners = (x, y, mk, test, out = false) => {
    const r = [];
    if ((mk & 9) === 9 && !same(x - 1, y - 1, test, out)) r.push('nw');
    if ((mk & 3) === 3 && !same(x + 1, y - 1, test, out)) r.push('ne');
    if ((mk & 12) === 12 && !same(x - 1, y + 1, test, out)) r.push('sw');
    if ((mk & 6) === 6 && !same(x + 1, y + 1, test, out)) r.push('se');
    return r;
  };
  const cv = document.createElement('canvas'); cv.width = W * TS; cv.height = H * TS;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const put = (name, x, y) => { const t = TI[name]; if (t) g.drawImage(sheet, t[0], t[1], t[2], t[3], x, y + TS - t[3], t[2], t[3]); };
  const water = (x, y, X, Y) => {
    const mk = maskOf(x, y, isWater); put(`water${f}`, X, Y); put(`shore${mk}`, X, Y);
    for (const k of corners(x, y, mk, isWater)) put(`shorec${k}`, X, Y);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = R[y][x], X = x * TS, Y = y * TS;
      if (m.kind === 'ultra') {
        if (c === 'X') { put(`uvoid${(f + x + y) & 1}`, X, Y); continue; }
        put(`uplat${maskOf(x, y, (k) => k !== 'X')}`, X, Y);
        if (c === '=') put('upath', X, Y);
        else if (c === 'K') put(`ucrystal${(x + y) & 1 ? 'B' : 'A'}`, X, Y);
        continue;
      }
      if (cave) {
        if (isCWall(c)) { put(`cwall${maskOf(x, y, isCWall, true)}`, X, Y); if (c === 'B') put('cbraille', X, Y); continue; }
        if (c === '~') { water(x, y, X, Y); continue; }
        put(`cfloor${(x * 7 + y * 3) % 3 === 0 ? 1 : 0}`, X, Y);
        const o = { r: 'crock', O: 'cboulder', o: 'chole', U: 'cladderU', V: 'cladderD', E: 'cexit' }[c];
        if (o) put(o, X, Y);
        continue;
      }
      if (c === '#') {
        const mk = maskOf(x, y, isSand, true); put(`sand${mk}`, X, Y);
        for (const k of corners(x, y, mk, isSand, true)) put(`sandc${k}`, X, Y);
        continue;
      }
      if (isWater(c)) { water(x, y, X, Y); if (c === 'b') put('bridge', X, Y); continue; }
      if (isRock(c)) { put(`mwall${maskOf(x, y, isRock)}`, X, Y); if (c === 'C') put('mouth', X, Y); continue; }
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
  if (!cave) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (R[y][x] === 'T') put('tree', x * TS, y * TS);
  return cv;
}
const HW = 16, HH = 24;              // 사람 한 칸 (발 = 칸 아래쪽, 머리는 윗칸으로 8px)
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_ROW = { down: 0, up: 1, left: 2, right: 3 };
const BACK = { up: 'down', down: 'up', left: 'right', right: 'left' };

// ─────────────────────── 화면 (한 번만 만듦) ───────────────────────
let V = null;            // 화면 · 상태
const P = { x: START.x, y: START.y, dir: START.dir, fx: START.x, fy: START.y, moving: false, t0: 0, from: null, stepN: 0 };
let mapId = START.map, M = MAPS[mapId];
const MW = () => M.rows[0].length, MH = () => M.rows.length;
const tileAt = (x, y) => (x < 0 || y < 0 || x >= MW() || y >= MH() ? ({ cave: 'W', ultra: 'X' }[M.kind] || 'T') : M.rows[y][x]);
// 이 칸의 만남 구역: 'grass' | 'cave' | 'deep' | 'ultra' (만남 칸이 아니면 null)
export function zoneAt(x, y) { return ENC[M.kind].has(tileAt(x, y)) ? M.zone : null; }
export const currentZone = () => M.zone;
// 만남 칸 걸음 보내기 — 걸음은 모두 여기 한 곳으로 (구역이 바뀌면 그 전에 따로 보냄)
export async function reportSteps(n, zone) {
  // TODO(0038): pass p_zone — rpc('safari_encounter', { p_steps: n, p_zone: zone }) 로 바꾸면 서버가 구역별 포켓몬 (ultra = 울트라비스트) 을 고름
  void zone;
  return rpc('safari_encounter', { p_steps: n });
}
// 사람·전설 포켓몬 (지도마다): { type: 'npc' | 'legend', o }
function objAt(x, y) {
  for (const n of M.npcs || []) if (n.x === x && n.y === y) return { type: 'npc', o: n };
  for (const l of M.legends || []) if (l.x === x && l.y === y && !hintOf(l.dex)?.caught) return { type: 'legend', o: l };
  return null;
}
// 지도의 울트라 워프홀 칸 (Q) — 한 번만 찾아 둠
const wormsOf = (m) => (m._worms ||= m.rows.flatMap((r, y) => [...r].map((c, x) => (c === 'Q' ? [x, y] : null)).filter(Boolean)));
const solidAt = (x, y) => SOLID[M.kind].has(tileAt(x, y)) || !!objAt(x, y);

export function viewSafari() {
  if (!V) V = build();
  V.start();
  V.refresh();
  bgmPreload('wild');   // 풀숲 만남 때 바로 나오게 야생 곡을 미리 풀어 둠
  return V.root;
}

function build() {
  let sheet = null, hero = null, keeper = null;   // 그림이 오기 전엔 빈 배경
  const cache = {};                                // 지도 id → [미리 그린 맵 2장]
  const mapsOf = (id) => (sheet ? (cache[id] ||= [prerender(sheet, 0, MAPS[id]), prerender(sheet, 1, MAPS[id])]) : null);
  Promise.all([loadImg('safari-tiles.png'), loadImg('safari-hero.png'), loadImg('safari-keeper.png')]).then(([sh, hr, kp]) => {
    sheet = sh; hero = hr; keeper = kp; mapsOf(mapId);
  }).catch(() => {});
  const cv = h('canvas.sf-canvas', { 'aria-label': '사파리존 지도. 아래 방향 버튼이나 키보드 화살표로 걷고, A 버튼으로 말을 걸어요.' });
  const g = cv.getContext('2d');
  const cover = h('div.sf-cover', { hidden: true });
  const msg = h('p.sf-msg', { 'aria-live': 'polite' });          // 맵 아래쪽 짧은 안내 (몇 초 뒤 사라짐)
  const place = h('p.sf-place', { 'aria-live': 'polite' });       // 지도에 들어설 때 왼쪽 위 이름표
  const talkTx = h('span.sf-tt');
  const talkMore = h('span.sf-more', '▼');
  const talkEl = h('div.box.sf-talk', { hidden: true, 'aria-live': 'polite' }, talkTx, talkMore);   // 3세대 글 상자
  const stage = h('div.sf-stage', cv, place, msg, talkEl, cover);
  const ballsEl = h('b.sf-num', '-');
  const encEl = h('span.sf-sub', '');
  const pendBtn = h('button.btn.small.primary.sf-pend', { hidden: true, onclick: () => { if (busy) return; sfx.select(); const e = st?.pending; if (e) startCatch(e); } }, '기다리는 포켓몬 잡기');   // 만남 연출 중에 눌러도 두 번 열리지 않게
  let ballIco = h('span.sf-ball');
  import('./catch.js').then((m) => { const c = m.ballCanvas('safari', 2); ballIco.replaceWith(c); ballIco = c; }).catch(() => {});
  const held = new Map();       // pointerId → 방향 (손가락 여러 개)
  const keys = [];              // 누르고 있는 키 방향 (마지막 것 우선)
  const clearPad = () => { held.clear(); keys.length = 0; pad.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); };
  const pad = h('div.sf-pad', { role: 'group', 'aria-label': '방향 버튼' }, ['up', 'left', 'right', 'down'].map((d) => {
    const b = h(`button.sf-dir.sf-${d}`, { type: 'button', 'aria-label': { up: '위로', down: '아래로', left: '왼쪽으로', right: '오른쪽으로' }[d] }, h('i'));
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); held.set(e.pointerId, d); b.classList.add('on'); try { b.releasePointerCapture?.(e.pointerId); } catch { /* */ } kick(d); });
    b.addEventListener('pointerenter', (e) => { if (held.has(e.pointerId)) { held.set(e.pointerId, d); b.classList.add('on'); } });
    b.addEventListener('pointerleave', () => b.classList.remove('on'));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }));
  const aBtn = h('button.sf-a', { type: 'button', 'aria-label': 'A 버튼: 말 걸기 · 글 넘기기' }, 'A');
  aBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); pressA(); });
  aBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  pad.append(aBtn);
  const up = (e) => { if (held.delete(e.pointerId)) pad.querySelectorAll('.on').forEach((x) => x.classList.remove('on')); };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  const info = h('div.sf-info', h('div.sf-balls', ballIco, h('span.sf-bl', h('small', '사파리볼'), ballsEl)), encEl, pendBtn);
  const ctl = h('div.sf-ctl', pad, info);
  const root = h('div.sf', stage, ctl);

  const KEY = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
  const A_KEYS = new Set(['Enter', ' ', 'z', 'Z', 'x', 'X']);
  const active = () => root.isConnected && S.tab === 'map' && !S.overlay && !document.querySelector('.cz-layer');
  window.addEventListener('keydown', (e) => {
    if (!active() || e.target?.closest?.('input,textarea,select')) return;
    if (A_KEYS.has(e.key)) { e.preventDefault(); if (!e.repeat) pressA(); return; }
    const d = KEY[e.key]; if (!d) return;
    e.preventDefault(); if (talkQ) return;
    if (!keys.includes(d)) keys.push(d); kick(d);
  });
  window.addEventListener('keyup', (e) => { const d = KEY[e.key]; if (d) { const i = keys.indexOf(d); if (i >= 0) keys.splice(i, 1); } });
  window.addEventListener('blur', () => { keys.length = 0; held.clear(); });
  const wantDir = () => keys[keys.length - 1] || [...held.values()].pop() || null;

  // ── 서버 상태 ──
  let st = null, loading = false, inflight = false, pend = { n: 0, zone: null }, busy = false, seq = false, flashT = -1, bubbleT = -1, lastSign = '';
  let bang = null;              // 전설 포켓몬 머리 위 '!' { x, y }
  let sayTimer = 0;
  const say = (t, ms = 4500) => {
    msg.textContent = t || ''; msg.classList.toggle('on', !!t);
    clearTimeout(sayTimer); if (t) sayTimer = setTimeout(() => { msg.classList.remove('on'); lastSign = ''; }, ms);
  };
  let placeTimer = 0;
  const showPlace = (name) => { place.textContent = name; place.classList.add('on'); clearTimeout(placeTimer); placeTimer = setTimeout(() => place.classList.remove('on'), 1800); };
  setTimeout(() => { if (!closed() && !talkQ && M.kind === 'out') say('키 큰 풀숲을 걸으면 야생 포켓몬이 나와요!'); }, 900);
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
    encEl.title = '키 큰 풀숲과 동굴 바닥을 걸으면 야생 포켓몬이 나와요';
    pendBtn.hidden = !st?.pending;
    const why = closed();
    cover.hidden = !why || seq;          // 볼을 다 쓴 장면 (seq) 중에는 글 상자가 보이게 가리지 않음
    if (why) cover.replaceChildren(h('b', why === 'balls' ? '오늘 사파리볼을 다 썼어요' : '오늘은 포켓몬이 모두 숨었어요'),
      h('span', '내일 다시 와 주세요!'));
  }

  // ── 글 상자 (3세대처럼 한 글자씩 · ▼ 이면 A / 화면 눌러 다음) ──
  let talkQ = null;             // { lines, i, typing, timer, res }
  function talk(lines) {
    return new Promise((res) => {
      clearPad(); say('');
      if (talkQ) { clearInterval(talkQ.timer); talkQ.res(); }
      talkQ = { lines: lines.filter(Boolean), i: -1, typing: false, timer: 0, res };
      talkEl.hidden = false;
      nextLine();
    });
  }
  function nextLine() {
    const q = talkQ; q.i++;
    if (q.i >= q.lines.length) { talkEl.hidden = true; talkQ = null; clearPad(); q.res(); return; }
    const text = q.lines[q.i];
    talkMore.style.visibility = 'hidden';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { talkTx.textContent = text; talkMore.style.visibility = ''; return; }
    let n = 0; q.typing = true; talkTx.textContent = '';
    q.timer = setInterval(() => {
      n = Math.min(text.length, n + 1); talkTx.textContent = text.slice(0, n);
      if (n >= text.length) { clearInterval(q.timer); q.typing = false; talkMore.style.visibility = ''; }
    }, 1000 / 45);
  }
  function advance() {
    const q = talkQ; if (!q) return false;
    if (q.typing) { clearInterval(q.timer); q.typing = false; talkTx.textContent = q.lines[q.i]; talkMore.style.visibility = ''; return true; }
    sfx.blip(); nextLine(); return true;
  }

  // 풀숲 · 동굴 바닥 걸음 보내기 → 만남이면 잡기
  async function send() {
    if (inflight || pend.n <= 0 || !S.online || !st || closed() || busy) return;
    const n = Math.min(pend.n, 1000), zone = pend.zone; pend.n -= n; inflight = true;
    let r = null;
    try { r = await reportSteps(n, zone); } catch (e) { if (!e.offline) say(errorText(e.message)); }
    inflight = false;
    if (!r) return;
    st = { ...st, ...r };
    paintInfo();
    if (r.encounter && !busy && !talkQ) encounter(r.encounter);   // 글 상자 중이면 '기다리는 포켓몬 잡기' 버튼으로
  }
  // 만남: 야생 곡을 먼저 틀고, 곡의 첫 타격에 '!' · 2박 뒤 화면 번쩍 (음악이 꺼져 있으면 예전처럼 효과음 + 정해진 시간)
  async function encounter(e) {
    busy = true; clearPad();
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
    const had = Number(st?.balls_left) || 0;
    try {
      const r = await catchEncounter({ ...e, kind: 'safari', flee: st?.settings?.flee });
      if (r?.safari) st = r.safari;
    } finally {
      music?.pop();
      seq = true;                         // 새로 받은 상태로 덮개가 먼저 뜨지 않게
      await refresh();
      if (had > 0 && st && st.balls_left <= 0 && !st.pending) await ballsOut();
      seq = false; busy = false; paintInfo();
      if (!closed()) say({ cave: '동굴 안을 더 걸어 볼까요?', ultra: '빛나는 발판을 더 걸어 볼까요?' }[M.kind] || '풀숲을 더 걸어 볼까요?', 2500);
    }
  }
  // 사파리볼을 다 씀 → 3세대처럼 두 줄 → 화면이 까매지고 사파리존 입구로
  async function ballsOut() {
    busy = true; seq = true; paintInfo();
    const name = String(S.snap?.profile?.name || '').trim() || '트레이너';
    await talk([`${josa(name, '은', '는')} 사용할 수 있는 볼이 더 이상 없다!`, `${name}의 눈이 캄캄해졌다...`]);
    await fadeTo(1, 700);
    enterMap(START.map, START.x, START.y, START.dir, false);
    await new Promise((r) => setTimeout(r, 450));
    await fadeTo(0, 600);
    seq = false; busy = false; paintInfo();
  }

  // ── 지도 이동 (화면이 어두워졌다 밝아짐) ──
  let fade = { a: 0, from: 0, to: 0, t0: 0, ms: 0, res: null, col: '0,0,0' }, spinT = -1;
  const fadeTo = (to, ms) => new Promise((res) => {
    fade.res?.();
    fade = { a: fade.a, from: fade.a, to, t0: performance.now(), ms, res, col: fade.col };
    if (!raf) { fade.a = to; fade.res = null; res(); }          // 화면이 안 그려지는 중이면 바로
  });
  function enterMap(id, x, y, dir, banner = true) {
    mapId = id; M = MAPS[id];
    P.x = P.fx = x; P.y = P.fy = y; P.dir = dir; P.moving = false; P.from = null;
    mapsOf(id);
    if (banner) showPlace(M.name);
  }
  async function go([id, x, y, dir, fx]) {
    busy = true; clearPad();
    if (fx === 'warp') {          // 워프홀: 주인공이 빙글빙글 돌며 보랏빛 빛 속으로
      sfx.scan(); spinT = performance.now(); fade.col = '232,216,255';
      await fadeTo(1, 900);
      enterMap(id, x, y, dir); spinT = -1;
      await new Promise((r) => setTimeout(r, 250));
      await fadeTo(0, 700);
      fade.col = '0,0,0'; busy = false; return;
    }
    sfx.blip();
    await fadeTo(1, 220);
    enterMap(id, x, y, dir);
    await fadeTo(0, 260);
    busy = false;
  }

  // ── 말 걸기 · 조사하기 ──
  async function talkKeeper(n) {
    n.dir = BACK[P.dir];
    busy = true;
    const ready = LEGEND_HINTS.filter((l) => legendReady(l.dex) && !l.caught);
    await talk([
      '나는 사파리존 사육사란다. 이 사파리존 깊은 곳 동굴에는 전설의 포켓몬이 산다는 이야기가 있지.',
      ...LEGEND_HINTS.map((l) => `${l.name}${l.caught ? ' (이미 잡았구나!)' : ''}: ${l.where}에 있대. ${legendReady(l.dex) ? '지금이라면 만날 수 있을 거야!' : l.cond}`),
      ...ZONE_HINTS.flatMap((z) => [`${z.name}: ${z.where}에 있대. ${z.cond}.`, z.more]),
      ready.length ? `지금 만날 수 있는 전설 포켓몬: ${ready.map((l) => l.name).join(', ')}. 행운을 빌게!` : '조건을 채우면 전설 포켓몬이 너를 기다릴 거야. 동굴 바닥에서도 야생 포켓몬이 나오니 조심하렴!',
    ]);
    busy = false;
  }
  async function meetLegend(l) {
    const t = hintOf(l.dex); if (!t) return;
    busy = true;
    try {
      if (legendReady(l.dex)) {
        sfx.scan(); bang = { x: l.x, y: l.y };
        await new Promise((r) => setTimeout(r, 900));
        bang = null;
        await talk([`${josa(t.name, '이', '가')} 이쪽을 바라보고 있다!`]);
        const r = await startLegendEncounter(l.dex, { talk, map: mapId, name: t.name });
        if (r?.caught) t.caught = true;           // 잡으면 자리에서 사라짐. 놓치거나 도망치면 그대로 남음
      } else {
        await talk([`${t.name}…?`, '아직 무언가 부족한 것 같다…', `사육사의 힌트: ${t.cond}`]);
      }
    } finally { bang = null; busy = false; }
  }
  function interactAt(x, y) {
    const o = objAt(x, y);
    if (o?.type === 'npc') { talkKeeper(o.o); return true; }
    if (o?.type === 'legend') { meetLegend(o.o); return true; }
    const sg = M.signs?.[`${x},${y}`];
    if (!sg) return false;
    if (tileAt(x, y) === 'B') { busy = true; talk([sg]).then(() => { busy = false; }); return true; }
    if (lastSign !== sg) { say(sg); lastSign = sg; sfx.blip(); }
    return true;
  }
  function pressA() {
    if (advance()) return;
    if (busy || P.moving || !active()) return;
    const [dx, dy] = DIRS[P.dir];
    lastSign = '';
    interactAt(P.x + dx, P.y + dy);
  }
  // 지도에서 사람·전설 포켓몬을 누름 → 그쪽을 보고 말 걸기 (가까이 있을 때만)
  stage.addEventListener('pointerdown', (e) => {
    if (talkQ) { e.preventDefault(); advance(); return; }
    if (busy || P.moving || !active() || e.target !== cv) return;
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    const tx = Math.floor(((e.clientX - r.left) * VW / r.width + camX) / TS), ty = Math.floor(((e.clientY - r.top) * VH / r.height + camY) / TS);
    let o = null;     // 사람은 머리가 윗칸, 전설 포켓몬은 큰 그림이 위로 3칸까지 → 그 위쪽을 눌러도 됨
    for (let k = 0; k <= 3 && !o; k++) { const c = objAt(tx, ty + k); if (c && (k <= 1 || c.type === 'legend')) o = c; }
    if (!o) return;
    const ox = o.o.x - P.x, oy = o.o.y - P.y;
    if (Math.abs(ox) + Math.abs(oy) > 3) { say('조금 더 가까이 가서 말을 걸어 보세요.', 1800); return; }
    P.dir = Math.abs(ox) > Math.abs(oy) ? (ox > 0 ? 'right' : 'left') : (oy > 0 ? 'down' : 'up');
    interactAt(o.o.x, o.o.y);
  });

  // ── 걷기 ──
  function kick(d) { if (!P.moving && !busy && !talkQ) tryMove(d, performance.now()); }
  function tryMove(d, now) {
    if (busy || talkQ) return;
    if (closed()) { P.dir = d; return; }
    P.dir = d;
    const [dx, dy] = DIRS[d]; const nx = P.x + dx, ny = P.y + dy;
    if (solidAt(nx, ny)) {
      const t = tileAt(nx, ny);
      if (t === 'S' || t === 'B' || objAt(nx, ny)) interactAt(nx, ny);    // 표지판 · 점자 · 사람 · 전설 = 부딪치면 조사
      return;
    }
    lastSign = '';
    P.from = { x: P.x, y: P.y }; P.x = nx; P.y = ny; P.moving = true; P.t0 = now; P.stepN++;
  }
  function arrive() {
    P.moving = false; P.fx = P.x; P.fy = P.y;
    const w = M.warps[`${P.x},${P.y}`];
    if (w) { go(w); return; }
    const z = zoneAt(P.x, P.y);
    if (z && st && !closed()) {
      if (pend.zone !== z && pend.n > 0) send();          // 다른 구역 걸음은 섞지 않고 먼저 보냄
      if (!inflight || pend.n === 0) pend.zone = z;
      pend.n++; if (pend.n >= SEND_EVERY) send();
    }
  }

  // ── 그리기 ──
  let VW = 160, VH = 128, raf = 0, camX = 0, camY = 0;
  const fit = () => {
    if (!root.isConnected) return;
    const w = Math.min(560, stage.clientWidth || root.clientWidth || 320);
    const dpr = window.devicePixelRatio || 1; const dev = Math.floor(w * dpr);
    const kd = Math.max(1, Math.round(dev / 176));       // 화면에 나무 11칸쯤
    VW = Math.floor(dev / kd);
    // 높이: 방향 버튼·아래 메뉴까지 한 화면에 들어가게 (너무 작으면 7칸, 많아야 폭의 0.85)
    const nav = document.querySelector('nav.tabs')?.offsetHeight || 0;
    const top = stage.getBoundingClientRect().top + window.scrollY;
    const avail = window.innerHeight - top - (ctl.offsetHeight || 160) - nav - 24;
    VH = Math.max(7 * TS, Math.min(Math.round(VW * 0.85), Math.floor((avail * dpr) / kd)));
    if (cv.width !== VW || cv.height !== VH) { cv.width = VW; cv.height = VH; }
    cv.style.width = `${(VW * kd) / dpr}px`; cv.style.height = `${(VH * kd) / dpr}px`;
    g.imageSmoothingEnabled = false;
  };
  const ro = new ResizeObserver(fit); ro.observe(stage);
  window.addEventListener('resize', fit);
  function frame(now) {
    if (!root.isConnected) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    if (fade.res) {
      const k = fade.ms ? Math.min(1, Math.max(0, (now - fade.t0) / fade.ms)) : 1;
      fade.a = fade.from + (fade.to - fade.from) * k;
      if (k >= 1) { fade.a = fade.to; const r = fade.res; fade.res = null; r(); }
    }
    if (document.hidden) return;
    // 움직임
    if (P.moving) {
      const k = Math.min(1, (now - P.t0) / STEP_MS);
      P.fx = P.from.x + (P.x - P.from.x) * k; P.fy = P.from.y + (P.y - P.from.y) * k;
      if (k >= 1) { arrive(); const d = active() && wantDir(); if (d) tryMove(d, now); }
    } else if (!busy && !talkQ && active()) { const d = wantDir(); if (d) tryMove(d, now); }
    draw(now);
  }
  const shadow = (cx, by, w) => { g.fillStyle = { cave: 'rgba(30,16,8,.3)', ultra: 'rgba(8,0,24,.4)' }[M.kind] || 'rgba(20,60,40,.25)'; g.fillRect(cx - w / 2, by - 2, w, 2); g.fillRect(cx - w / 2 + 1, by - 1, w - 2, 1); };
  const drawBang = (bx, by) => {
    g.fillStyle = '#283040'; g.fillRect(bx - 1, by - 1, 8, 11);
    g.fillStyle = '#ffffff'; g.fillRect(bx, by, 6, 9);
    g.fillStyle = '#e83838'; g.fillRect(bx + 2, by + 1, 2, 5); g.fillRect(bx + 2, by + 7, 2, 1);
  };
  function draw(now) {
    const af = Math.floor(now / 520) % 2;
    const mw = MW() * TS, mh = MH() * TS;
    const px = Math.round(P.fx * TS + TS / 2), py = Math.round(P.fy * TS + TS / 2);
    camX = mw <= VW ? -Math.floor((VW - mw) / 2) : Math.max(0, Math.min(mw - VW, px - Math.floor(VW / 2)));
    camY = mh <= VH ? -Math.floor((VH - mh) / 2) : Math.max(0, Math.min(mh - VH, py - Math.floor(VH / 2)));
    const maps = mapsOf(mapId);
    if (!maps || !hero) { g.fillStyle = { cave: '#2c2018', ultra: '#120a24' }[M.kind] || '#8cd6b8'; g.fillRect(0, 0, VW, VH); return; }
    const map = maps[af];
    if (mw < VW || mh < VH) { g.fillStyle = { cave: '#140c08', ultra: '#120a24' }[M.kind] || '#1c5420'; g.fillRect(0, 0, VW, VH); }
    const sx = Math.max(0, camX), sy = Math.max(0, camY);
    const cw = Math.min(mw - sx, VW - (sx - camX)), ch = Math.min(mh - sy, VH - (sy - camY));
    g.drawImage(map, sx, sy, cw, ch, sx - camX, sy - camY, cw, ch);
    // 그릴 것 (아래쪽에 있는 것이 앞): 주인공 · 사람 · 전설 포켓몬
    const list = [];
    list.push([P.fy, () => {
      const hx = Math.round(P.fx * TS) - camX, hy = Math.round(P.fy * TS) - camY + TS - HH;
      const k = P.moving ? (now - P.t0) / STEP_MS : 0;
      const fi = P.moving && k > 0.15 && k < 0.85 ? (P.stepN % 2 ? 1 : 2) : 0;
      shadow(hx + 8, hy + HH, 10);
      const dir = spinT > 0 ? ['down', 'left', 'up', 'right'][Math.floor((now - spinT) / 90) % 4] : P.dir;
      g.drawImage(hero, fi * HW, DIR_ROW[dir] * HH, HW, HH, hx, hy, HW, HH);
      // 풀숲 안이면 다리를 풀잎이 가림 (미리 그린 맵의 그 칸 아랫부분을 다시 덮음)
      const gx = Math.round(P.fx), gy = Math.round(P.fy);
      if (M.kind === 'out' && tileAt(gx, gy) === ',') g.drawImage(map, gx * TS, gy * TS + 10, TS, 6, gx * TS - camX, gy * TS - camY + 10, TS, 6);
      if (bubbleT > 0 && now >= bubbleT) drawBang(hx + 5, hy - 8);
    }]);
    const wt = Math.floor(now / 110) % 4;      // 울트라 워프홀: 32×32 소용돌이 4장
    for (const [qx, qy] of wormsOf(M)) {
      const t = TI[`worm${wt}`]; if (!t) break;
      list.push([qy - 0.5, () => g.drawImage(sheet, t[0], t[1], 32, 32, qx * TS + 8 - 16 - camX, qy * TS + 8 - 16 - camY, 32, 32)]);
    }
    for (const n of M.npcs || []) {
      if (!keeper) continue;
      list.push([n.y, () => {
        const nx = n.x * TS - camX, ny = n.y * TS - camY + TS - HH;
        shadow(nx + 8, ny + HH, 10);
        g.drawImage(keeper, 0, DIR_ROW[n.dir] * HH, HW, HH, nx, ny, HW, HH);
      }]);
    }
    for (const l of M.legends || []) {
      if (hintOf(l.dex)?.caught) continue;
      const cell = monCell(speciesIdOf(l.dex));       // 64×64 칸 (가운데·아래 맞춤). 그림판을 받는 중이면 null → 다음 프레임에
      if (!cell) continue;
      list.push([l.y, () => {
        const bob = Math.round(Math.sin(now / 420 + l.x) * 1.4);       // 위아래로 둥실 (정수 px)
        const lx = l.x * TS + TS / 2 - 32 - camX, ly = (l.y + 1) * TS - 64 - camY - 3 + bob;
        shadow(l.x * TS + 8 - camX, (l.y + 1) * TS - camY - 1, 22);
        g.drawImage(cell, lx, ly);
        if (bang && bang.x === l.x && bang.y === l.y) drawBang(l.x * TS + 5 - camX, (l.y - 2) * TS - camY);
      }]);
    }
    list.sort((a, b) => a[0] - b[0]).forEach((e) => e[1]());
    // 만남: 화면 번쩍
    if (flashT > 0 && now > flashT) {
      const ph = Math.floor((now - flashT) / 110);
      if (ph < 6 && ph % 2 === 0) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 0, VW, VH); }
      else if (ph >= 6) { g.fillStyle = '#182030'; g.fillRect(0, 0, VW, VH); }
    }
    if (fade.a > 0) { g.fillStyle = `rgba(${fade.col},${fade.a.toFixed(3)})`; g.fillRect(0, 0, VW, VH); }
  }
  const start = () => { requestAnimationFrame(() => { fit(); if (!raf && root.isConnected) raf = requestAnimationFrame(frame); }); };
  // 시험용
  window.__safari = {
    P, maps: () => mapsOf(mapId), state: () => st, tile: tileAt, map: () => M.rows, move: (d) => kick(d), busy: () => busy, view: () => ({ VW, VH }),
    mapId: () => mapId, goto: (id, x, y, dir = 'down') => enterMap(id, x, y, dir), a: () => pressA(), talking: () => !!talkQ,
    zone: () => zoneAt(P.x, P.y), pend: () => ({ ...pend }), ballsOut: () => ballsOut(), setState: (s) => { st = { ...st, ...s }; paintInfo(); }, fade: () => fade.a,
  };
  return { root, start, refresh };
}

export const safariMapForTest = { MAPS, SOLID, ENC };
