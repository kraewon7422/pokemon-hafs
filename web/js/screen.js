// Big TV at the booth: live TOP 10 + catch feed + rotating legendary QR (token changes every 30 s,
// so photos of it go stale). Log in with a booth or admin account.
import { CONFIG } from './config.js';
import { sb, rpc, errorText } from './sb.js';
import { drawQR, placeUrl } from './qrfmt.js';
import { spriteCanvas } from './sprites.js';
import { h, $, timeAgo } from './ui.js';
import { devLogin, renderGoogleButton } from './auth.js';

const root = $('#root');
const site = new URL('.', location.href).href.replace(/\/$/, '');
let species = [];
let legendTimer = null;

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return renderLogin();
  start();
}

function renderLogin(msg = '') {
  const err = h('div.err', msg);
  const g = h('div');
  const email = h('input', { type: 'email', placeholder: '부스/운영자 이메일' });
  const pw = h('input', { type: 'password', placeholder: '비밀번호' });
  root.replaceChildren(h('div.login-card.box', h('b', '대형 화면 로그인'), g,
    CONFIG.DEV_LOGIN && h('form', { style: { display: 'grid', gap: '8px' }, onsubmit: async (e) => {
      e.preventDefault();
      try { await devLogin(email.value.trim(), pw.value); start(); } catch (x) { err.textContent = x.message; }
    } }, email, pw, h('button.btn', { type: 'submit' }, '로그인')), err));
  renderGoogleButton(g, (m) => { err.textContent = m; }).catch(() => {});
}

async function start() {
  try {
    const p = await rpc('ensure_profile');
    if (!['booth', 'admin'].includes(p.role)) return renderLogin('부스/운영자 계정이 필요해요.');
  } catch (e) { return renderLogin(errorText(e.message)); }
  species = (await sb.from('species').select('id,name').order('id')).data || [];
  root.replaceChildren(h('div.screen',
    h('section', h('h2', `🏆 ${CONFIG.GAME_TITLE} TOP 10`), h('ol.top10#top')),
    h('section', { style: { display: 'grid', gap: '2vw', alignContent: 'start' } },
      h('div#legend'),
      h('div', h('h2', '방금 잡힌 몬스터'), h('div.feed#feed'))),
    h('button.btn.small', { style: { position: 'fixed', right: '10px', bottom: '10px', opacity: '.4' }, onclick: () => document.documentElement.requestFullscreen?.() }, '전체 화면')));
  tick();
  setInterval(tick, 8000);
}

async function tick() {
  let d;
  try { d = await rpc('screen_feed', {}, { retries: 0 }); } catch { return; }
  if (!d) return;
  const name = (id) => species.find((s) => s.id === id)?.name || '';
  $('#top').replaceChildren(...d.ranking.top.slice(0, 10).map((t) => h('li',
    h('b', t.rank <= 3 ? ['🥇', '🥈', '🥉'][t.rank - 1] : `#${t.rank}`), h('span', t.display), h('b', `${t.score}점`))));
  if (!d.ranking.top.length) $('#top').replaceChildren(h('li', h('span'), h('span', '첫 번째 트레이너를 기다리는 중…'), h('span')));
  $('#feed').replaceChildren(...d.feed.slice(0, 8).map((f) => h('div',
    spriteCanvas(f.species_id, 48), h('span', `${f.display}님이 `, h('b', name(f.species_id)), '을(를) 잡았다!'),
    h('small', { style: { marginLeft: 'auto', opacity: '.7' } }, timeAgo(f.at)))));
  const leg = d.rotating[0];
  if (leg && !legendTimer) showLegend(leg);
  if (!leg && legendTimer) { clearTimeout(legendTimer); legendTimer = null; $('#legend').replaceChildren(); }
}

async function showLegend(leg) {
  let t;
  try { t = await rpc('screen_rotating_token', { p_qr: leg.id }, { retries: 1 }); } catch { legendTimer = setTimeout(() => showLegend(leg), 3000); return; }
  const c = h('canvas');
  drawQR(c, placeUrl(site, leg.id, t.token), { cell: 10, margin: 3 });
  const left = h('b', `${t.expires_in}초`);
  $('#legend').replaceChildren(h('div.legend-qr',
    h('div', { style: { fontSize: '1.4em', fontWeight: 'bold', color: '#c02020' } }, `⚡ 전설의 몬스터 출현! — ${leg.name}`),
    c, h('div', '앱의 QR 버튼으로 지금 찍으세요! QR이 바뀌기까지 ', left)));
  let s = t.expires_in;
  const iv = setInterval(() => { s -= 1; left.textContent = `${Math.max(0, s)}초`; }, 1000);
  legendTimer = setTimeout(() => { clearInterval(iv); showLegend(leg); }, (t.expires_in + 0.5) * 1000);
}

boot();
