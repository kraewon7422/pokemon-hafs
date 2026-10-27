// Big TV at the booth (1920x1080, fits one screen): live TOP 10, 기수 대항전, catch feed, notice,
// and every active rotating legendary QR (token changes every 30 s, so photos go stale). Booth or admin login.
import { CONFIG } from './config.js';
import { sb, rpc, errorText } from './sb.js';
import { drawQR, placeUrl } from './qrfmt.js';
import { spriteCanvas } from './sprites.js';
import { h, $, josa, timeAgo } from './ui.js';
import { devLogin, renderGoogleButton } from './auth.js';

const root = $('#root');
const site = new URL('.', location.href).href.replace(/\/$/, '');
let species = [];
const legends = new Map();     // qr id → { timer, iv, el }

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
    h('section',
      h('div#notice'),
      h('div.legend-row#legend'),
      h('div', h('h2', '기수 대항전'), h('div.gens#gens')),
      h('div', h('h2', '방금 잡힌 몬스터'), h('div.feed#feed')))),
    h('button.btn.small.fs-btn', { onclick: () => document.documentElement.requestFullscreen?.() }, '전체 화면'));
  tick();
  setInterval(tick, 8000);
}

async function tick() {
  let d;
  try { d = await rpc('screen_feed', {}, { retries: 0 }); } catch { return; }
  if (!d) return;
  const name = (id) => species.find((s) => s.id === id)?.name || '';
  const top = d.ranking.top.slice(0, 10);
  $('#top').replaceChildren(...(top.length ? top.map((t) => h('li',
    h('b', t.rank <= 3 ? ['🥇', '🥈', '🥉'][t.rank - 1] : `#${t.rank}`), h('span', t.display), h('b', `${t.score}점`)))
    : [h('li', h('span'), h('span', '첫 번째 트레이너를 기다리는 중…'), h('span'))]));
  $('#notice').replaceChildren(...[
    d.ended && h('div.notice', '🎉 축제가 끝났어요! 최종 순위를 확인하세요'),
    d.notice && h('div.notice', `📢 ${d.notice}`),
  ].filter(Boolean));
  $('#gens').replaceChildren(...d.gens.slice(0, 4).map((g) => h('div', h('b', `${g.gen}기 `), `${g.score}점`, h('small', ` · ${g.players}명`))));
  $('#feed').replaceChildren(...d.feed.slice(0, d.rotating.length ? 3 : 6).map((f) => h('div',
    spriteCanvas(f.species_id, 48), h('span', `${f.display}님이 `, h('b', josa(name(f.species_id), '을', '를')), ' 잡았다!'),
    h('small', { style: { marginLeft: 'auto', opacity: '.7' } }, timeAgo(f.at)))));

  // legendary QRs: one card per active rotating QR
  const active = new Set(d.rotating.map((r) => r.id));
  for (const [id, l] of legends) if (!active.has(id)) { clearTimeout(l.timer); clearInterval(l.iv); l.el.remove(); legends.delete(id); }
  for (const leg of d.rotating) if (!legends.has(leg.id)) {
    const el = h('div.legend-qr');
    $('#legend').append(el);
    legends.set(leg.id, { el });
    showLegend(leg);
  }
}

async function showLegend(leg) {
  const l = legends.get(leg.id);
  if (!l) return;
  clearInterval(l.iv);
  let t;
  try { t = await rpc('screen_rotating_token', { p_qr: leg.id }, { retries: 1 }); }
  catch { l.timer = setTimeout(() => showLegend(leg), 3000); return; }
  const c = h('canvas');
  drawQR(c, placeUrl(site, leg.id, t.token), { cell: 8, margin: 3 });
  const left = h('b', `${t.expires_in}초`);
  l.el.replaceChildren(
    h('div', { style: { fontWeight: 'bold', color: '#c02020' } }, `⚡ 전설 출현! ${leg.name}`),
    c, h('div', '앱의 볼 버튼으로 지금 찍기! 바뀌기까지 ', left));
  let s = t.expires_in;
  l.iv = setInterval(() => { s -= 1; left.textContent = `${Math.max(0, s)}초`; }, 1000);
  l.timer = setTimeout(() => showLegend(leg), (t.expires_in + 0.5) * 1000);
}

boot();
