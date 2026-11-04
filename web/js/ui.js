// Small DOM helpers shared by every page.

// h('div.card#id', {onclick, style:{}}, child, 'text', [children]) → element
export function h(sel, attrs, ...kids) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    if (attrs != null) kids.unshift(attrs);
    attrs = {};
  }
  const [, tag = 'div', rest = ''] = sel.match(/^([a-z0-9]*)(.*)$/i);
  const el = document.createElement(tag || 'div');
  for (const part of rest.match(/[.#][^.#]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

// 받침 있으면 a, 없으면 b — josa('영자몽', '을', '를')
// 숫자로 끝나면 읽는 소리로: 0 영 · 1 일 · 3 삼 · 6 육 · 7 칠 · 8 팔 = 받침 (1·7·8 = ㄹ). 예: josa('Lv.21', '으로', '로') → 21로
const NUM_JONG = { 0: 21, 1: 8, 3: 16, 6: 1, 7: 8, 8: 8 };
export function josa(word, a, b) {
  const ch = String(word).trim().slice(-1);
  const c = ch.charCodeAt(0);
  if (/[0-9]/.test(ch)) { const j = NUM_JONG[ch] || 0; return word + (a === '으로' && j === 8 ? b : j ? a : b); }
  if (c < 0xac00 || c > 0xd7a3) return word + b;
  const jong = (c - 0xac00) % 28;
  if (a === '으로' && jong === 8) return word + b;      // ㄹ 받침 + (으)로 → '로' (예: 파이어로)
  return word + (jong ? a : b);
}

// 알림 (토스트): 한 번에 3개까지만 보이고 나머지는 줄을 섬. 같은 글이 보이는 중에 또 오면 하나로 합쳐 "×N".
// 줄이 밀리면 짧게 보여 주고 빨리 넘김. 오류 (errorText 에서 온 글, 또는 { kind: 'error' }) 는 적어도 3초.
//   toast('글') · toast('글', 4000) · toast('글', { ms: 4000, kind: 'error' })
const TOAST_MAX = 3, TOAST_ERR_MIN = 3000, TOAST_RUSH = 1100;
const ERR_TEXTS = new Set();
export const markError = (text) => { ERR_TEXTS.add(String(text)); return text; };
const toasts = [];   // { text, n, ms, err, el, num, end, timer, out }
const tq = [];       // 아직 못 보인 것
function toastBox() {
  let box = document.getElementById('toast');
  if (!box) { box = h('div#toast', { role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  return box;
}
function toastTimer(t, ms) {
  clearTimeout(t.timer);
  t.end = Date.now() + ms;
  t.timer = setTimeout(() => toastHide(t), ms);
}
function toastHide(t) {
  if (t.out) return;
  t.out = true; clearTimeout(t.timer);
  t.el.classList.add('out');
  setTimeout(() => { t.el.remove(); const i = toasts.indexOf(t); if (i >= 0) toasts.splice(i, 1); toastPump(); }, 320);
}
const toastDur = (t) => Math.max(t.err ? TOAST_ERR_MIN : 0, tq.length ? Math.min(t.ms, TOAST_RUSH) : t.ms);
function toastPump() {
  while (tq.length && toasts.filter((x) => !x.out).length < TOAST_MAX) {
    const t = tq.shift();
    t.num = h('b.toast-n', t.n > 1 ? `×${t.n}` : '');
    t.el = h(`div.toast${t.err ? '.toast-err' : ''}`, h('span', t.text), t.num);
    toastBox().append(t.el);
    toasts.push(t);
    t.start = Date.now();
    toastTimer(t, toastDur(t));
  }
  // 줄이 밀려 있으면 지금 보이는 것도 빨리 넘김 (오류는 3초는 지킴)
  if (tq.length) for (const t of toasts) if (!t.out && t.end - Date.now() > TOAST_RUSH) toastTimer(t, Math.max(TOAST_RUSH, t.err ? TOAST_ERR_MIN - (Date.now() - t.start) : 0));
}
export function toast(msg, ms = 2600) {
  let opt = {};
  if (ms && typeof ms === 'object') { opt = ms; ms = opt.ms ?? 2600; }
  const text = String(msg);
  const err = opt.kind === 'error' || ERR_TEXTS.has(text);
  // 같은 글이 보이는 중 → 합치고 조금 늘림
  const live = toasts.find((t) => !t.out && t.text === text);
  if (live) {
    live.n++; live.num.textContent = `×${live.n}`;
    live.num.classList.remove('bump'); void live.num.offsetWidth; live.num.classList.add('bump');
    const left = live.end - Date.now();
    toastTimer(live, Math.max(left, Math.min(left + 800, Math.max(live.ms, 1500)), err ? 1500 : 900));
    return;
  }
  const queued = tq.find((t) => t.text === text);
  if (queued) { queued.n++; return; }
  tq.push({ text, n: 1, ms: Math.max(800, Number(ms) || 2600), err });
  toastPump();
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Emerald-style text box that types its text. Resolves when finished (tap skips).
export function typeText(el, text, cps = 40) {
  return new Promise((resolve) => {
    if (reducedMotion()) { el.textContent = text; resolve(); return; }
    let i = 0;
    el.textContent = '';
    const skip = () => { i = text.length; };
    el.addEventListener('pointerdown', skip, { once: true });
    const tick = () => {
      i = Math.min(text.length, i + 1);
      el.textContent = text.slice(0, i);
      if (i < text.length) setTimeout(tick, 1000 / cps); else resolve();
    };
    tick();
  });
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Galmuri11 is drawn on a 12px grid. A CSS size is crisp only when size × devicePixelRatio is a multiple of 12,
// so on hi-dpi phones snap each size tier (--fs-s/m/l/xl/xxl in pixel.css) to the nearest 12-device-px multiple.
export function pixelFontScale() {
  const apply = () => {
    const dpr = window.devicePixelRatio || 1;
    if (dpr < 1.75) return;                       // desktop / low-dpi: keep the CSS defaults
    const tiers = { s: 12, m: 16, l: 20, xl: 24, xxl: 36 };
    for (const [k, target] of Object.entries(tiers)) {
      const units = Math.max(1, Math.round((target * dpr) / 12));
      document.documentElement.style.setProperty(`--fs-${k}`, `${(units * 12) / dpr}px`);
    }
  };
  apply();
  matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener?.('change', apply);
}

// small pixel icons drawn as SVG (the pixel font has no ✕ / ⚙ glyphs)
export const ICON = {
  close: '<svg class="icon" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M1 1h1v1H1zM2 2h1v1H2zM3 3h2v2H3zM5 2h1v1H5zM6 1h1v1H6zM2 5h1v1H2zM1 6h1v1H1zM5 5h1v1H5zM6 6h1v1H6z"/></svg>',
  gear: '<svg class="icon" viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M4 0h1v1h1v1h1V1h1v1h-1v1h1v1h1v1H8v1H7v1h1v1H7V7H6v1H5v1H4V8H3V7H2v1H1V7h1V6H1V5H0V4h1V3h1V2H1V1h1v1h1V1h1zM4 3v1H3v1h1v1h1V5h1V4H5V3z"/></svg>',
};

// colour pixel icons (8x8) used instead of emoji, so every phone shows the same GBA-style art
const PX_PAL = { k: '#283048', w: '#ffffff', y: '#f8d048', o: '#f09030', r: '#e04040', s: '#b0b8c8', n: '#a06830', b: '#4878d8', g: '#48b060', c: '#c87838' };
const PX = {
  bag: ['..kkkk..', '.k....k.', 'kkkkkkkk', 'knnnnnnk', 'knyyyynk', 'knnnnnnk', 'knnnnnnk', 'kkkkkkkk'],
  pencil: ['......kk', '.....krk', '....kyk.', '...kyk..', '..kyk...', '.kok....', '.kk.....', 'k.......'],
  spark: ['...k....', '..kyk...', '.kyyyk..', 'kyywyyk.', '.kyyyk..', '..kyk.k.', '...k.kyk', '......k.'],
  ticket: ['........', 'kkkkkkkk', 'kooooook', '.koowok.', '.kowook.', 'kooooook', 'kkkkkkkk', '........'],
  camera: ['........', '..kkk...', 'kkkkkkkk', 'ksskkssk', 'kskwwksk', 'kskwwksk', 'ksskkssk', 'kkkkkkkk'],
  warn: ['...yy...', '..yyyy..', '..ykky..', '.yykkyy.', '.yykkyy.', 'yyyyyyyy', 'yyykkyyy', 'yyyyyyyy'],
  light: ['..yyyy..', '..yyyy..', '...kk...', '...ss...', '...ss...', '...ss...', '...ss...', '...kk...'],
  sound: ['...k....', '..kk..k.', 'kkkk.k..', 'kkkk.k.k', 'kkkk.k.k', 'kkkk.k..', '..kk..k.', '...k....'],
  mute: ['...k....', '..kk....', 'kkkkr..r', 'kkkk.rr.', 'kkkk.rr.', 'kkkkr..r', '..kk....', '...k....'],
  music: ['....kkkk', '...kkkkk', '...k...k', '...k...k', '...k...k', '.kkk.kkk', 'kkkkkkkk', '.kk..kk.'],
  memo: ['kkkkkk..', 'kwwwwk..', 'kwkkwk..', 'kwwwwk.o', 'kwkkwko.', 'kwwwwo..', 'kwwwkk..', 'kkkkk...'],
  mega: ['......k.', '.....kk.', 'kk.kkwk.', 'kwkwwwk.', 'kwkwwwk.', 'kk.kkwk.', '.k...kk.', '.k....k.'],
  pause: ['........', '.kk..kk.', '.kk..kk.', '.kk..kk.', '.kk..kk.', '.kk..kk.', '.kk..kk.', '........'],
  bolt: ['....yy..', '...yy...', '..yy....', '.yyyyyy.', '....yy..', '...yy...', '..yy....', '.y......'],
  clock: ['..kkkk..', '.kwwwwk.', 'kwwkwwwk', 'kwwkwwwk', 'kwwkkkwk', 'kwwwwwwk', '.kwwwwk.', '..kkkk..'],
  wait: ['kkkkkkkk', '.kwwwwk.', '..kyyk..', '...kk...', '...kk...', '..kwyk..', '.kyyyyk.', 'kkkkkkkk'],
  gift: ['..y..y..', '...yy...', 'rrryyrrr', 'yyyyyyyy', 'rrryyrrr', '.rryyrr.', '.rryyrr.', '.rryyrr.'],
  bulb: ['..yyyy..', '.yyyyyy.', '.yywwyy.', '.yyyyyy.', '..yyyy..', '...ss...', '..ssss..', '...ss...'],
  book: ['........', 'kkk..kkk', 'kwwkkwwk', 'kwwkkwwk', 'kwwkkwwk', 'kwwkkwwk', 'kkkkkkkk', '........'],
  phone: ['..kkkk..', '..kbbk..', '..kbbk..', '..kbbk..', '..kbbk..', '..kbbk..', '..kwwk..', '..kkkk..'],
  door: ['.kkkkk..', '.knnnk..', '.knnnk..', '.knnyk..', '.knnnk..', '.knnnk..', '.knnnk..', 'kkkkkkk.'],
  sun: ['y..y..y.', '.y.y.y..', '..yyy...', 'yyyyyyy.', '..yyy...', '.y.y.y..', 'y..y..y.', '........'],
  school: ['...rr...', '...k....', '..kkkk..', '.kssssk.', 'kssssssk', 'kswsswsk', 'ksskkssk', 'kkkkkkkk'],
  gold: ['.r....r.', '..r..r..', '...rr...', '..yyyy..', '.yyyyyy.', '.yywyyy.', '.yyyyyy.', '..yyyy..'],
  silver: ['.b....b.', '..b..b..', '...bb...', '..ssss..', '.ssssss.', '.sswsss.', '.ssssss.', '..ssss..'],
  bronze: ['.g....g.', '..g..g..', '...gg...', '..cccc..', '.cccccc.', '.ccwccc.', '.cccccc.', '..cccc..'],
};
export function pix(name, cls = '') {
  const paths = {};
  (PX[name] || []).forEach((row, y) => [...row].forEach((ch, x) => {
    if (PX_PAL[ch]) paths[ch] = (paths[ch] || '') + `M${x} ${y}h1v1h-1z`;
  }));
  const svg = `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">${
    Object.entries(paths).map(([c, d]) => `<path fill="${PX_PAL[c]}" d="${d}"/>`).join('')}</svg>`;
  return h(`span.pix${cls ? '.' + cls : ''}`, { html: svg });
}
