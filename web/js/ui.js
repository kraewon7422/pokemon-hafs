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
export function josa(word, a, b) {
  const c = String(word).trim().slice(-1).charCodeAt(0);
  if (c < 0xac00 || c > 0xd7a3) return word + b;
  return word + ((c - 0xac00) % 28 ? a : b);
}

export function toast(msg, ms = 2600) {
  let box = document.getElementById('toast');
  if (!box) { box = h('div#toast', { role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div.toast', msg);
  box.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
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
