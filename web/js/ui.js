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
