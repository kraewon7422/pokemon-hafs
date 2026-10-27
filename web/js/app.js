// Student app. State = last server snapshot (IndexedDB) + local outbox of scans not yet acknowledged.
// See docs/DESIGN.md §3 (offline rules) and §5 (server rules).
import { CONFIG } from './config.js';
import { sb, rpc, errorText, reportError } from './sb.js';
import { kv, persist } from './db.js';
import { parsePlace, isBag, makeNonce, bagPayload, drawQR } from './qrfmt.js';
import { Scanner } from './scanner.js';
import { spriteCanvas, paint } from './sprites.js';
import { sfx, unlockAudio, isMuted, setMuted } from './sfx.js';
import { h, $, josa, toast, typeText, timeAgo, sleep, reducedMotion, pixelFontScale, ICON, pix } from './ui.js';
import { inAppBrowser, escapeInApp, isIOS, renderGoogleButton, devLogin, signOut } from './auth.js';

const S = {
  catalog: null,        // { lines, species, qrs, at }
  snap: null,           // server state from sync() (+ ver, synced_at)
  outbox: [],           // [{ n, q, t, at }]
  celebrated: new Set(),
  tab: 'home',
  online: navigator.onLine,
  syncing: null,
  dexFilter: 'all',
  rankScope: 'all',
  rank: {},
  overlay: null,        // currently open overlay element
  bagOpen: false,
  installEvt: null,
};

const app = () => $('#app');
const lineOf = (id) => S.catalog?.lines.find((l) => l.id === id);
const maxStage = (line) => lineOf(line)?.max_stage ?? 3;
const speciesOf = (id) => S.catalog?.species.find((s) => s.id === id);
const qrName = (id) => S.catalog?.qrs.find((q) => q.id === id)?.name;
const dexOf = (line, stage) => (line - 1) * 3 + stage;
// shown dex number = position in the list (No.001…No.104, no gaps) — species.id keeps (line-1)*3+stage for the atlas
const dexNo = (sp) => `No.${String(S.catalog.species.findIndex((x) => x.id === sp.id) + 1).padStart(3, '0')}`;
const collection = () => S.snap?.collection || [];
const owned = (line) => collection().find((c) => c.line_id === line);
const rules = () => ({ bag_max: 5, qr_daily_cap: 3, evo_prob: [0, 0.7, 0.35], evo_pity_step: 0.1, evo_pity_max: [0, 1, 2], ...(S.snap?.rules || {}) });
const serverPending = () => (S.snap?.tickets || []).filter((t) => t.status === 'pending');
// tickets in the bag = server pending + local scans the server hasn't seen yet
const bag = () => [
  ...serverPending().map((t) => ({ nonce: t.nonce, qr_id: t.qr_id, token: t.token, name: t.qr_name, synced: true })),
  ...S.outbox.filter((o) => !serverPending().some((t) => t.nonce === o.n))
    .map((o) => ({ nonce: o.n, qr_id: o.q, token: o.t, name: o.q === '_' ? '수동 코드' : qrName(o.q) || '확인 중인 장소', synced: false })),
];
const evolvable = () => collection().filter((c) => c.stage < maxStage(c.line_id) && !isWithdrawn(c.line_id));
const isWithdrawn = (line) => (S.snap?.rules?.withdrawn || []).includes(line) || !!lineOf(line)?.withdrawn;
const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* iOS: none */ } };

// ───────────────────────── boot ─────────────────────────

async function boot() {
  pixelFontScale();
  window.addEventListener('error', (e) => reportError(`${e.message} @${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => reportError(`unhandled: ${e.reason?.message || e.reason}`));
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('online', () => { S.online = true; renderStatus(); sync(); });
  window.addEventListener('offline', () => { S.online = false; renderStatus(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; });
  window.addEventListener('popstate', onPop);

  if ('serviceWorker' in navigator) {
    // New versions: apply right away at start-up; while playing, show a "새 버전 적용" button (never during the bag QR).
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      const offer = (w) => {
        if (!w || !navigator.serviceWorker.controller) return;
        if (!$('nav.tabs')) { w.postMessage('skipWaiting'); return; }           // still on the loading/login screen
        S.updateReady = () => { if (!S.bagOpen) w.postMessage('skipWaiting'); };
        renderTab();
      };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      });
      setInterval(() => reg.update().catch(() => {}), 10 * 60_000);
    }).catch(() => {});
  }

  // QR scanned with the phone's own camera → /s#ID.TOKEN → ./?q=ID.TOKEN
  const params = new URLSearchParams(location.search);
  if (params.get('q')) {
    sessionStorage.setItem('pendingScan', params.get('q'));
    history.replaceState(null, '', location.pathname);
  }

  [S.catalog, S.snap, S.outbox] = await Promise.all([kv.get('catalog'), kv.get('snap'), kv.get('outbox')]);
  S.outbox ||= [];
  S.celebrated = new Set((await kv.get('celebrated')) || []);

  const { data: { session } } = await sb.auth.getSession();
  sb.auth.onAuthStateChange((evt) => {
    if (evt === 'SIGNED_IN' && !$('nav.tabs')) afterLogin();
    if (evt === 'SIGNED_OUT') renderLogin();
  });

  if (!session && !S.snap) {
    if (inAppBrowser()) return renderInApp();
    return renderLogin();
  }
  if (S.snap && S.catalog && S.snap.profile?.consented !== false) { renderShell(); handlePendingScan(); }
  await afterLogin();
}

// single-flight: the login form and onAuthStateChange('SIGNED_IN') both call this
let loginFlight = null;
function afterLogin() {
  loginFlight ||= doAfterLogin().finally(() => { loginFlight = null; });
  return loginFlight;
}

async function doAfterLogin() {
  try {
    const profile = await rpc('ensure_profile');
    if (profile.role !== 'student') toast(`${profile.role === 'admin' ? '운영자' : '부스'} 계정으로 로그인했어요.`);
    if (!S.snap) S.celebrated = new Set(['__init__']);   // first sync on this device: don't replay old celebrations
    await loadCatalog();
    await sync({ force: true });
    if (!S.snap?.profile?.consented && profile.role === 'student') return renderConsent();
    if (!$('nav.tabs')) renderShell();
    persist();
    maybeOnboard();
    handlePendingScan();
  } catch (e) {
    if (e.offline) {
      if (S.snap && S.catalog) { if (!$('nav.tabs')) renderShell(); return; }
      return renderLogin('인터넷에 연결된 곳에서 처음 로그인해 주세요.');
    }
    // session lost (logged out in another tab, expired) → PostgREST answers 'permission denied' for anon
    const msg = /permission denied|JWT|NOT_AUTHENTICATED/i.test(e.message) ? '로그인이 풀렸어요. 다시 로그인해 주세요.' : errorText(e.message);
    await signOut();
    renderLogin(msg);
  }
}

async function loadCatalog() {
  const [lines, species, qrs] = await Promise.all([
    sb.from('lines').select('id,teacher,subject,rarity,active,max_stage,withdrawn').order('id'),
    sb.from('species').select('id,line_id,stage,name,category,flavor,height,weight').order('id'),
    sb.from('qr_points').select('id,name,hint,map_x,map_y,daily_cap').order('id'),
  ]);
  if (lines.error || species.error || qrs.error) {
    if (S.catalog) return;
    throw Object.assign(new Error('OFFLINE'), { offline: true });
  }
  S.catalog = { lines: lines.data, species: species.data, qrs: qrs.data, at: new Date().toISOString() };
  await kv.set('catalog', S.catalog);
}

// QR names/positions and monster texts can change during the festival (admin page) → refresh every 5 min
function refreshCatalogIfOld() {
  if (!S.catalog?.at || Date.now() - new Date(S.catalog.at).getTime() < 5 * 60_000) return;
  S.catalog.at = new Date().toISOString();          // don't start twice
  loadCatalog().then(() => { if (!S.overlay) renderTab(); }).catch(() => {});
}

// ───────────────────────── sync ─────────────────────────

const FINAL = new Set(['ok', 'invalid_token', 'already_pending', 'daily_cap', 'bag_full', 'nonce_conflict', 'bad_format', 'locked']);
const ACK_MSG = {
  invalid_token: '확인해 보니 인정되지 않는 QR이었어요 (교체된 QR이거나, 전설 QR을 너무 늦게 보냈어요).',
  already_pending: '이미 가방에 그 장소 티켓이 있어요.',
  daily_cap: '오늘은 그 장소를 다 찍었어요.',
  bag_full: '가방이 꽉 차서 티켓 하나를 담지 못했어요.',
  locked: '수동 코드를 너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요.',
};

function sync(opts = {}) {
  if (S.syncing) return S.syncing;
  S.syncing = (async () => {
    try {
      const sending = S.outbox.slice(0, 20);
      const res = await rpc('sync', { p_scans: sending, p_ver: opts.force ? null : S.snap?.ver ?? null },
        { retries: opts.force ? 2 : 0, timeout: 10_000 });
      S.online = true;
      const acks = new Map(res.acks.map((a) => [a.nonce, a.status]));
      for (const [, st] of acks) if (ACK_MSG[st]) toast(ACK_MSG[st], 4000);
      S.outbox = S.outbox.filter((o) => !FINAL.has(acks.get(o.n)));
      await kv.set('outbox', S.outbox);

      if (res.same) {                               // nothing changed on the server: tiny response
        S.snap.synced_at = new Date().toISOString();
        refreshCatalogIfOld();
        await kv.set('snap', S.snap);
        return;
      }
      const prevLines = new Set(collection().map((c) => c.line_id));
      S.snap = { ...res.state, ver: res.ver, synced_at: new Date().toISOString() };
      refreshCatalogIfOld();
      await kv.set('snap', S.snap);

      // new redemptions → celebrate
      const fresh = S.snap.tickets.filter((t) => t.status === 'redeemed' && t.species_id && !S.celebrated.has(t.nonce));
      if (S.celebrated.has('__init__')) {
        fresh.forEach((t) => S.celebrated.add(t.nonce));
        S.celebrated.delete('__init__');
        await kv.set('celebrated', [...S.celebrated]);
      } else if (fresh.length && $('nav.tabs')) {
        celebrate(fresh.reverse(), prevLines);
      }
    } catch (e) {
      if (e.offline) S.online = false;
      else if (e.message === 'NO_PROFILE') { await signOut(); renderLogin('계정 연결이 해제됐어요. 다시 로그인해 주세요.'); }
      else reportError('sync: ' + e.message);
    } finally {
      S.syncing = null;
      if ($('nav.tabs')) { renderStatus(); if (!S.overlay) renderTab(); }
    }
  })();
  return S.syncing;
}
setInterval(() => { if (!document.hidden && $('nav.tabs') && !S.bagOpen) sync(); }, CONFIG.SYNC_INTERVAL_MS);

// ───────────────────────── shell & history (Android back button) ─────────────────────────

const ICONS = {
  home: '<path d="M4 14 14 5l10 9v10h-7v-6h-6v6H4z"/>',
  map: '<path d="M3 6l7-2 8 3 7-2v18l-7 2-8-3-7 2zM10 4v18M18 7v18" fill="none" stroke="currentColor" stroke-width="3"/>',
  dex: '<path d="M5 3h16a2 2 0 0 1 2 2v19H7a2 2 0 0 1-2-2zM9 8h10M9 12h10M9 16h6" fill="none" stroke="currentColor" stroke-width="3"/>',
  rank: '<path d="M3 24V14h7v10zM11 24V6h6v18zM18 24V10h7v14z"/>',
};
// red & white ball for the centre scan button (user's choice)
const CAPSULE = `<svg viewBox="0 0 32 32" aria-hidden="true">
  <circle cx="16" cy="16" r="14" fill="#f8f8f8" stroke="#202838" stroke-width="2.5"/>
  <path d="M2.5 16a13.5 13.5 0 0 1 27 0z" fill="#e04848"/>
  <path d="M6 9a11 11 0 0 1 6-4" fill="none" stroke="#ff9a9a" stroke-width="2" stroke-linecap="round"/>
  <rect x="2" y="14.5" width="28" height="3" fill="#202838"/>
  <circle cx="16" cy="16" r="5" fill="#f8f8f8" stroke="#202838" stroke-width="2.5"/>
  <circle cx="16" cy="16" r="2" fill="#fff" stroke="#c8c8c8" stroke-width="1"/></svg>`;
const TABS = [['home', '홈'], ['map', '지도'], ['scan', 'QR 찍기'], ['dex', '도감'], ['rank', '랭킹']];

function renderShell() {
  app().replaceChildren(
    h('header.topbar', h('h1', CONFIG.GAME_TITLE),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        h('div.status#status', { role: 'status' }),
        h('button.gear', { 'aria-label': '설정', onclick: openSettings, html: ICON.gear }))),
    h('main#main', { tabindex: -1 }),
    h('nav.tabs', { 'aria-label': '메뉴' }, TABS.map(([id, label]) => id === 'scan'
      ? h('button.scan-tab', { 'aria-label': 'QR 찍기', onclick: openScanner }, h('span.capsule', { html: CAPSULE }), label)
      : h('button', { 'data-tab': id, onclick: () => { sfx.blip(); go(id); } },
        h('span', { html: `<svg viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">${ICONS[id]}</svg>` }), label))),
  );
  history.replaceState({ tab: S.tab }, '');
  renderStatus();
  go(S.tab, { push: false });
}

function go(tab, { push = true } = {}) {
  if (push && tab !== S.tab) history.pushState({ tab }, '');
  S.tab = tab;
  document.querySelectorAll('nav.tabs button[data-tab]').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  renderTab();
  window.scrollTo(0, 0);
  if (tab === 'rank') loadRanking();
}

let ignorePop = 0;
function onPop(e) {
  if (ignorePop > 0) { ignorePop--; return; }
  if (S.overlay) { closeOverlay({ fromPop: true }); return; }
  if (e.state?.tab && $('nav.tabs')) go(e.state.tab, { push: false });
}

function renderStatus() {
  const el = $('#status');
  if (!el) return;
  const waiting = S.outbox.length;
  el.className = 'status' + (S.online ? '' : ' off');
  el.replaceChildren(h('i'), S.online ? '온라인' : '오프라인',
    S.snap?.synced_at ? ` · ${timeAgo(S.snap.synced_at)}` : '',
    waiting ? ` · 보낼 티켓 ${waiting}` : '');
  const homeBtn = $('nav.tabs [data-tab="home"]');
  homeBtn?.querySelector('.badge')?.remove();
  const n = (S.snap?.quizzes?.length || 0) + bag().length;
  if (homeBtn && n) homeBtn.append(h('span.badge', n));
}

function renderTab() {
  const main = $('#main');
  if (!main || !S.catalog || !S.snap) return;
  const view = { home: viewHome, map: viewMap, dex: viewDex, rank: viewRank }[S.tab]();
  main.replaceChildren(...[view].flat().filter((x) => x != null && x !== false));
  renderStatus();
}

// ───────────────────────── 홈 ─────────────────────────

// the ONE thing the student should do next
function nextAction() {
  const quizzes = S.snap.quizzes || [];
  const items = bag();
  const p = S.snap.profile;
  if (quizzes.length) return [pix('memo', 'l'), `퀴즈 ${quizzes.length}개! 맞히면 진화권 100%`, 'gold', () => openQuiz()];
  if (items.length) return [pix('ticket', 'l'), `가방에 티켓 ${items.length}장! 메인 부스로 가요`, 'primary', openBag];
  const ev = evolvable();
  if (p.evo_tickets > 0 && ev.length) {
    return [pix('spark', 'l'), `진화권 ${p.evo_tickets}장 - 몬스터를 진화시켜요`, 'gold',
      () => openDetail(speciesOf(dexOf(ev[0].line_id, ev[0].stage)))];
  }
  return [pix('camera', 'l'), 'QR을 찾아서 찍어 보세요', 'go', openScanner];
}

function viewHome() {
  const p = S.snap.profile;
  const R = rules();
  const total = S.catalog.species.length;
  const partner = [...collection()].sort((a, b) => b.stage - a.stage || new Date(b.first_caught_at) - new Date(a.first_caught_at))[0];
  const items = bag();
  const visited = new Set((S.snap.tickets || []).map((t) => t.qr_id));
  const hints = S.catalog.qrs.filter((q) => q.hint && !visited.has(q.id));
  const hint = hints.length ? hints[new Date().getMinutes() % hints.length] : null;
  const [icon, label, kind, act] = nextAction();
  const closeAt = R.festival_close_at ? new Date(R.festival_close_at) : null;
  const minsLeft = closeAt ? Math.round((closeAt - Date.now()) / 60000) : null;

  return [
    S.updateReady && h('button.btn.big.gold', { onclick: () => S.updateReady() }, '⬆ 새 버전 적용하기 (2초)'),
    !S.updateReady && Number(R.min_client_version) > CONFIG.VERSION && h('div.box.warn-box', '⬆ 새 버전이 있어요! 앱(브라우저 탭)을 완전히 닫았다가 다시 열어 주세요.'),
    R.notice && h('div.box.notice-box', pix('mega'), String(R.notice)),
    R.festival_ended && h('div.box.ended-box',
      h('div.big', pix('spark', 'l'), '축제 끝! 수고했어요'),
      h('div', p.in_ranking === false ? '선생님·손님 계정은 랭킹에서 제외돼요.' : `최종 순위 ${p.rank ? '#' + p.rank : '-'} · 점수 ${p.score} · 도감 ${p.dex_count}/${total}`),
      R.prize_note && h('div', String(R.prize_note))),
    !S.snap.festival_open && !R.festival_ended && h('div.box', pix('pause'), '지금은 게임 운영 시간이 아니에요. 찍은 QR은 저장해 두었다가 다시 열리면 보내요.'),
    (R.legend_schedule || []).length > 0 && !R.festival_ended && h('div.box.legend-box', pix('bolt', 'l'),
      h('div', h('b', '전설의 몬스터 출현'), h('br'),
        [...new Set(R.legend_schedule.map((l) => (l.from ? `${fmtTime(l.from)}${l.until ? '~' + fmtTime(l.until) : ''}` : '지금')))].join(' · '),
        ' · 메인 부스 대형 화면')),
    minsLeft != null && minsLeft > 0 && minsLeft < 120 && h('div.box.warn-box', pix('clock'), `마감까지 ${minsLeft}분! 가방 티켓은 마감 전에 부스에서 써 주세요.`),

    h(`button.btn.big.${kind}.next-action`, { onclick: () => { sfx.select(); act(); } }, h('span', icon), label),

    h('section.trainer', { 'aria-label': '트레이너 카드' },
      h('div.idno', h('span', 'TRAINER CARD'), h('span', `ID No. ${p.student_id.replace(/^g:/, '').toUpperCase()}`)),
      h('div', h('div.name', p.name || '트레이너'), h('div', { style: { fontSize: '13px' } }, p.gen ? `${p.gen}기 트레이너` : '특별 트레이너')),
      h('div.partner', partner ? spriteCanvas(dexOf(partner.line_id, partner.stage), 88) : spriteCanvas(1, 88, 'silhouette')),
      h('div.stats',
        h('span', '도감', h('b', `${p.dex_count}/${total}`)), h('span', '점수', h('b', p.score)),
        h('span', '순위', h('b', p.in_ranking === false ? '제외' : p.rank ? `#${p.rank}` : '-')), h('span', '진화권', h('b', p.evo_tickets))),
      h('div.badges', { title: '최종 진화시킨 쌤' }, S.catalog.lines.map((l) => {
        const done = (owned(l.id)?.stage || 0) >= (l.max_stage ?? 3);
        return h(`i${done ? '.on.t-' + l.subject : ''}`, { title: done ? `${l.subject} 완성` : '?' });
      }))),

    h('section.box', { 'aria-label': '가방' },
      h('div.banner', h('b', `가방 ${items.length}/${R.bag_max}`),
        h('span', { style: { fontSize: '13px' } }, items.length ? '메인 부스에서 몬스터로 바꿔요' : 'QR을 찍으면 티켓이 들어와요')),
      items.length ? h('div.bag-row', items.map((t) => h(`span.chip${t.synced ? '' : '.local'}`, pix(t.synced ? 'ticket' : 'wait'), t.name))) : null,
      h('button.btn.big' + (items.length ? '.primary' : ''), { onclick: openBag }, '부스에서 보여주기 (가방 QR)'),
      R.self_redeem === true && items.some((t) => t.synced) && h('button.btn.big.gold', { style: { marginTop: '8px' }, onclick: selfRedeem },
        pix('gift'), '지금은 앱에서 바로 받기 (부스 혼잡 모드)')),

    rouletteBox(),

    hint && h('section.box.hint', h('b', pix('bulb'), '힌트  '), hint.hint),
  ];
}

// ───────── 진화권 룰렛: every N minutes, the server picks 0/1/3/5 tickets ─────────
const rouletteWait = (r) => Math.max(0, (r.next_at ? new Date(r.next_at) - Date.now() : 0));
const fmtWait = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function rouletteBox() {
  const r = S.snap.roulette;
  if (!r || !r.enabled || !S.snap.festival_open) return null;
  const left = Number(r.daily_max) - Number(r.used_today);
  const btn = h('button.btn.big.roulette-btn', { onclick: spinRoulette });
  const tick = () => {
    const ms = rouletteWait(r);
    btn.disabled = left <= 0 || ms > 0 || !S.online;
    btn.textContent = left <= 0 ? '오늘은 다 돌렸어요' : !S.online ? '인터넷이 필요해요'
      : ms > 0 ? `다음 룰렛까지 ${fmtWait(ms)}` : '룰렛 돌리기!';
    btn.classList.toggle('gold', !btn.disabled);
  };
  tick();
  clearInterval(S.rouletteTimer);
  S.rouletteTimer = setInterval(() => (btn.isConnected ? tick() : clearInterval(S.rouletteTimer)), 1000);
  return h('section.box.roulette', { 'aria-label': '진화권 룰렛' },
    h('div.banner', h('b', '진화권 룰렛'), h('span', { style: { fontSize: '13px' } }, `오늘 ${Math.max(0, left)}/${r.daily_max}번 남음`)),
    h('div.reel-row', (r.odds || []).map(([n]) => h('span.reel-cell', n ? `${n}장` : '꽝'))),
    btn,
    h('small', `${r.every_min}분마다 한 번! 꽝이 나와도 다음 기회가 있어요.`));
}

async function spinRoulette() {
  unlockAudio();
  if (S.spinning) return;
  S.spinning = true;
  let res;
  try {
    res = await rpc('spin_roulette', {}, { retries: 0 });
  } catch (e) { S.spinning = false; sfx.error(); toast(errorText(e.message)); sync({ force: true }); return; }
  S.snap.roulette = res.roulette;
  S.snap.profile = { ...S.snap.profile, evo_tickets: res.evo_tickets };
  await kv.set('snap', S.snap);
  // the prize is already decided; the reel runs a fixed time so the wait never hints at the result
  const vals = (res.roulette.odds || []).map(([n]) => n);
  const cells = vals.map((n) => h('span.reel-cell', n ? `${n}장` : '꽝'));
  const text = h('div.box.textbox');
  overlay(h('div.stage', h('div.scene', h('div.reel-row.big', cells)), text), 'full');
  text.textContent = '룰렛이 돌아간다…!';
  S.overlay.dataset.locked = '1';
  const target = Math.max(0, vals.indexOf(res.prize));
  let i = 0;
  if (!reducedMotion()) {
    const steps = vals.length * 4 + ((target - (vals.length * 4) % vals.length) + vals.length) % vals.length;
    for (let k = 0; k <= steps; k++) {
      i = k % vals.length;
      cells.forEach((c, j) => c.classList.toggle('on', j === i));
      sfx.evoTick();
      await sleep(70 + Math.pow(k / steps, 3) * 380);     // slows down towards the end
    }
  }
  cells.forEach((c, j) => c.classList.toggle('on', j === target));
  if (res.prize > 0) { sfx.correct(); vibrate([40, 30, 80]); } else sfx.fail();
  await typeText(text, res.prize > 0 ? `진화권 ${res.prize}장을 받았다! (지금 ${res.evo_tickets}장)` : `꽝…! ${res.roulette.every_min}분 뒤에 다시 도전해요.`);
  S.overlay.dataset.locked = '0';
  text.append(h('button.btn.big.primary', { style: { marginTop: '10px' }, onclick: () => closeOverlay() }, '확인'));
  S.spinning = false;
  renderTab();
}

const soundLabel = () => (isMuted() ? [pix('mute'), '소리 꺼짐 (누르면 켜기)'] : [pix('sound'), '소리 켜짐 (누르면 끄기)']);

// ⚙ settings (top-right). Name visibility comes first so students can find it immediately.
function openSettings() {
  sfx.select();
  const p = S.snap.profile;
  const masked = `${p.gen ? p.gen + '기 ' : ''}${maskName(p.name)}`;
  sheet([
    h('div.grab'),
    h('h2', { style: { margin: '0 4px' } }, '설정'),
    h('section.box.setting-name',
      h('b', '랭킹·대형 화면에 보이는 내 이름'),
      h('div.seg', { role: 'group', 'aria-label': '이름 공개' },
        h('button', { 'aria-pressed': String(!!p.show_on_board), onclick: () => setPublic(true) }, `공개: ${masked}`),
        h('button', { 'aria-pressed': String(!p.show_on_board), onclick: () => setPublic(false) }, '비공개: 익명 트레이너')),
      h('small', '공개해도 이름 가운데 글자는 가려져요. 언제든 바꿀 수 있어요.')),
    h('section.box', { style: { display: 'grid', gap: '8px' } },
      h('button.btn', { onclick: (e) => { setMuted(!isMuted()); e.currentTarget.replaceChildren(...soundLabel()); } },
        ...soundLabel()),
      h('button.btn', { onclick: () => showOnboarding(true) }, pix('book'), '게임 방법 다시 보기'),
      h('button.btn', { onclick: showInstall }, pix('phone'), '홈 화면에 추가'),
      h('button.btn', { onclick: confirmLogout }, pix('door'), '로그아웃')),
    h('small', { style: { textAlign: 'center' } }, `${p.student_id.replace(/^g:/, '')} · 버전 ${CONFIG.VERSION}`),
  ]);
}

async function setPublic(show) {
  if (!!S.snap.profile.show_on_board === show) return;
  try {
    const prof = await rpc('set_prefs', { p_show: show, p_avatar: null });
    S.snap.profile = { ...S.snap.profile, ...prof };
    await kv.set('snap', S.snap);
    toast(prof.show_on_board ? `랭킹에 "${prof.display}"(으)로 보여요.` : '랭킹에 "익명 트레이너"로 보여요.');
    closeOverlay();
    openSettings();
  } catch (e) { toast(errorText(e.message)); }
}

async function selfRedeem() {
  try {
    await rpc('self_redeem', {}, { retries: 1 });
    await sync({ force: true });
  } catch (e) { sfx.error(); toast(errorText(e.message)); }
}

function showInstall() {
  if (S.installEvt) { S.installEvt.prompt(); S.installEvt = null; return; }
  sheet(h('div.box',
    h('b', '홈 화면에 추가 (선택)'),
    h('p', isIOS()
      ? 'Safari 아래쪽 공유 버튼(□↑) → "홈 화면에 추가". 단, 아이폰은 홈 화면 앱과 Safari가 로그인을 따로 저장해요. 이미 Safari에서 잘 되고 있다면 그대로 Safari로 써도 괜찮아요.'
      : '크롬 메뉴(⋮) → "앱 설치" 또는 "홈 화면에 추가".'),
    h('p', { style: { fontSize: '13px' } }, '설치하지 않아도 인터넷 없이 열려요 (한 번 열어 두면 저장돼요).')));
}

function confirmLogout() {
  const n = bag().filter((t) => !t.synced).length;
  sheet(h('div.box',
    h('p', n ? [pix('warn'), `아직 서버에 못 보낸 티켓이 ${n}장 있어요. 로그아웃하면 사라져요!`] : '로그아웃할까요?'),
    h('div', { style: { display: 'flex', gap: '8px' } },
      h('button.btn', { onclick: () => closeOverlay() }, '취소'),
      h('button.btn.primary', { onclick: async () => { closeOverlay(); await signOut(); await kv.clear(); S.snap = null; S.outbox = []; renderLogin(); } }, '로그아웃'))));
}

// ───────────────────────── 지도 ─────────────────────────

function viewMap() {
  const today = S.snap.today || {};
  const inBag = new Set(bag().map((t) => t.qr_id));
  const capOf = (q) => q.daily_cap || rules().qr_daily_cap;
  const info = h('div.box', '핀을 누르면 장소 정보가 나와요.');
  const pins = S.catalog.qrs.filter((q) => q.map_x != null).map((q) => {
    const n = today[q.id] || 0;
    const cls = inBag.has(q.id) ? 'bag' : n >= capOf(q) ? 'done' : n > 0 ? 'today' : '';
    return h(`button.pin${cls ? '.' + cls : ''}`, {
      style: { left: `${q.map_x * 100}%`, top: `${q.map_y * 100}%` }, 'aria-label': q.name,
      onclick: (e) => {
        sfx.blip();
        document.querySelectorAll('.pin.sel').forEach((x) => x.classList.remove('sel'));
        e.currentTarget.classList.add('sel');
        info.replaceChildren(h('b', q.name), h('br'), q.hint || '', h('br'),
          h('small', inBag.has(q.id) ? [pix('ticket'), '가방에 티켓 있음 - 부스에서 쓰면 다시 찍을 수 있어요'] : `오늘 ${n}/${capOf(q)}번 찍음`));
      },
    }, h('span', q.id.replace(/^A0?/, '')));
  });
  const zoom = S.mapZoom || 1;
  const setZoom = (z) => {
    const box = $('.map-scroll');
    const cx = box ? (box.scrollLeft + box.clientWidth / 2) / box.scrollWidth : 0.5;   // keep the centre in view
    const cy = box ? (box.scrollTop + box.clientHeight / 2) / box.scrollHeight : 0.5;
    S.mapZoom = z; sfx.blip(); renderTab();
    const nb = $('.map-scroll');
    if (nb) { nb.scrollLeft = cx * nb.scrollWidth - nb.clientWidth / 2; nb.scrollTop = cy * nb.scrollHeight - nb.clientHeight / 2; }
  };
  return [
    h('div.banner', h('h2.section-title', '학교 지도'),
      h('div.zoom', { role: 'group', 'aria-label': '지도 확대' },
        h('button.btn.small', { disabled: zoom <= 1, onclick: () => setZoom(zoom - 1), 'aria-label': '축소' }, '-'),
        h('span', `×${zoom}`),
        h('button.btn.small', { disabled: zoom >= 3, onclick: () => setZoom(zoom + 1), 'aria-label': '확대' }, '+'))),
    h(`div.map-scroll${zoom > 1 ? '.zoomed' : ''}`,
      h('div.map-wrap', { style: { width: `${mapWidth(zoom)}px` } }, h('img', { src: 'img/map.webp', alt: '학교 지도', draggable: 'false' }),
        MAP_LABELS.map(([t, x, y]) => h('span.map-label', { style: { left: `${x * 100}%`, top: `${y * 100}%` }, 'aria-hidden': 'true' }, t)), pins)),
    zoom > 1 && h('small', { style: { textAlign: 'center' } }, '손가락으로 끌어서 지도를 움직여요'),
    h('div.legend',
      h('span', h('i', { style: { background: 'var(--red)' } }), '아직 안 찍음'),
      h('span', h('i', { style: { background: 'var(--gold)' } }), '가방에 있음'),
      h('span', h('i', { style: { background: 'var(--green)' } }), '오늘 찍음'),
      h('span', h('i', { style: { background: 'var(--gray)' } }), '오늘 끝')),
    info,
    h('p', { style: { fontSize: '13px', margin: 0 } }, '지도에 없는 숨은 장소도 있어요…'),
  ];
}

// map fills the screen width at ×1; zoom multiplies it (map.webp is 962x1635, sharp up to ~×3)
function mapWidth(zoom = 1) {
  const avail = Math.min(536, (document.querySelector('main')?.clientWidth || window.innerWidth) - 24 - 8);
  return Math.floor(avail) * zoom + 8;   // + border
}
// building names drawn over the map (the picture itself has no text); x/y = fraction of the map
const MAP_LABELS = [
  ['기숙사 A동', 0.09, 0.07], ['기숙사 B동', 0.25, 0.02], ['농구장', 0.30, 0.235], ['V홀', 0.47, 0.235],
  ['체육관', 0.68, 0.295], ['D홀', 0.70, 0.395], ['LUX홀', 0.46, 0.34], ['생태연못', 0.29, 0.375],
  ['P홀', 0.555, 0.455], ['월드플라자', 0.68, 0.535], ['C홀', 0.79, 0.455], ['야외극장', 0.90, 0.33],
  ['정문', 0.17, 0.515], ['야외공연장', 0.46, 0.68], ['운동장', 0.79, 0.85],
];
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

// ───────────────────────── 도감 (+ 진화) ─────────────────────────

function viewDex() {
  const { lines, species } = S.catalog;
  const subjects = [...new Set(lines.map((l) => l.subject))];
  const reached = (sp) => (owned(sp.line_id)?.stage || 0) >= sp.stage;
  const found = species.filter(reached).length;
  const list = species.filter((sp) => S.dexFilter === 'all' || lineOf(sp.line_id)?.subject === S.dexFilter);
  const p = S.snap.profile;
  return [
    h('div.box.dex-head',
      h('div.banner', h('b', '몬스터 도감'), h('span', `발견 ${found} / ${species.length}`)),
      h('div.bar', h('i', { style: { width: `${(found / species.length) * 100}%` } })),
      h('div.banner', { style: { fontSize: '13px' } }, h('span', h('i.ticket-icon'), ` 진화권 × ${p.evo_tickets}`),
        h('span', evolvable().length ? '몬스터를 누르면 진화시킬 수 있어요' : ''))),
    h('div.filters', { role: 'toolbar', 'aria-label': '타입' },
      ['all', ...subjects].map((s) => h('button.chip', {
        'aria-pressed': String(S.dexFilter === s),
        onclick: () => { S.dexFilter = s; renderTab(); },
      }, s === 'all' ? '전체' : s))),
    h('div.dex-grid', list.map((sp) => {
      if (isWithdrawn(sp.line_id)) return h('div.dex-cell.unknown.withdrawn', h('span.no', dexNo(sp)), spriteCanvas(sp.id, 72, 'silhouette'), h('span.nm', '비공개'));
      const ok = reached(sp);
      const c = owned(sp.line_id);
      const canEvo = ok && c.stage === sp.stage && sp.stage < maxStage(sp.line_id) && p.evo_tickets > 0;
      return h(`button.dex-cell${ok ? '.caught' : '.unknown'}`, {
        'aria-label': ok ? sp.name : '미발견',
        onclick: () => (ok ? openDetail(sp) : toast('아직 발견하지 못했어요. 학교 곳곳을 찾아보세요!')),
      },
      h('span.no', dexNo(sp)),
      spriteCanvas(sp.id, 72, ok ? 'normal' : 'silhouette'),
      h('span.nm', ok ? sp.name : '???'),
      canEvo && h('span.evo-dot', '진화'));
    })),
  ];
}

function evoChance(c) {
  const R = rules();
  if (c.evo_fails >= (R.evo_pity_max[c.stage] ?? 99)) return 1;
  return Math.min(1, (R.evo_prob[c.stage] ?? 0) + c.evo_fails * R.evo_pity_step);
}

function openDetail(sp) {
  sfx.select();
  const line = lineOf(sp.line_id);
  const c = owned(sp.line_id);
  const top = maxStage(sp.line_id);
  const p = S.snap.profile;
  const flavor = h('p', { style: { margin: 0 } });
  const stages = [1, 2, 3].filter((st) => st <= top);
  const chain = stages.flatMap((st, i) => {
    const id = dexOf(sp.line_id, st);
    const s2 = speciesOf(id);
    const ok = (c?.stage || 0) >= st;
    const cell = h('div', { style: { display: 'grid', justifyItems: 'center', cursor: ok ? 'pointer' : 'default' }, onclick: () => ok && id !== sp.id && openDetail(s2) },
      spriteCanvas(id, 56, ok ? 'normal' : 'silhouette'), h('small', ok ? s2?.name : '???'));
    return i ? [h('span.arrow', '▶'), cell] : [cell];
  });
  const canEvolve = c && c.stage === sp.stage && sp.stage < top;
  const chance = canEvolve ? evoChance(c) : 0;
  sheet([
    h('div.grab'),
    h(`div.habitat.t-${line.subject}`, spriteCanvas(sp.id, 176)),
    h('div.box',
      h('div.banner', h('b', `${dexNo(sp)} ${sp.name}`), h(`span.type.t-${line.subject}`, line.subject)),
      h('div.kv',
        h('span', '분류'), h('span', sp.category),
        h('span', '키 / 몸무게'), h('span', `${sp.height} / ${sp.weight}`),
        h('span', '정체'), h('span', line.teacher),
        h('span', '잡은 횟수'), h('span', `${c?.catch_count || 0}번`))),
    h('div.box', flavor),
    stages.length > 1 && h('div.box', h('b', '진화'), h(`div.chain.n${stages.length}`, chain)),
    canEvolve && h('div.box.evo-panel',
      h('div.banner', h('span', h('i.ticket-icon'), ` 진화권 × ${p.evo_tickets}`),
        h('b.prob', chance >= 1 ? [pix('spark'), '다음 진화 확정!'] : `성공 확률 ${Math.round(chance * 100)}%`)),
      h('button.btn.big.gold', { disabled: !p.evo_tickets || !S.online || !S.snap.festival_open, onclick: () => doEvolve(c) },
        !p.evo_tickets ? '진화권이 없어요 (퀴즈·룰렛으로 받아요)' : !S.online ? '진화는 인터넷이 필요해요' : '진화시키기!'),
      h('small', '실패해도 다음 확률이 올라가고, 몇 번 실패하면 다음엔 반드시 성공해요.')),
    top === 1 && h('div.box', '★ 전설의 몬스터는 진화하지 않아요.'),
    h('button.btn', { onclick: () => closeOverlay() }, '닫기'),
  ]);
  typeText(flavor, sp.flavor);
}

async function doEvolve(c) {
  unlockAudio();
  const before = dexOf(c.line_id, c.stage);
  let res;
  try {
    res = await rpc('evolve', { p_line: c.line_id }, { retries: 0 });
  } catch (e) { sfx.error(); toast(errorText(e.message)); return; }
  // result is decided; the animation has a fixed length so latency never hints at the outcome
  S.snap.profile = { ...S.snap.profile, ...res.profile };
  const col = owned(c.line_id);
  Object.assign(col, { stage: res.stage, evo_fails: res.evo_fails });
  await kv.set('snap', S.snap);
  await evolutionScene(before, res.success ? res.species_id : before + 1, res.success, col);
  sync({ force: true });
}

async function evolutionScene(fromDex, toDex, success, col) {
  const from = speciesOf(fromDex);
  const to = speciesOf(toDex);
  const canvas = spriteCanvas(fromDex, 192);
  const scene = h('div.scene', canvas);
  const text = h('div.box.textbox');
  const ov = overlay(h('div.stage', scene, text), 'full');
  await typeText(text, `어라…? ${from.name}의 상태가…!`);
  await sleep(500);
  if (reducedMotion()) {
    paint(canvas, success ? toDex : fromDex, 192);
  } else {
    // alternate white silhouettes, speeding up (600 → 340 ms) - never faster than 3 per second
    let t = 600;
    let flip = false;
    const end = Date.now() + 3600;
    while (Date.now() < end) {
      flip = !flip;
      paint(canvas, flip ? toDex : fromDex, 192, 'white');
      sfx.evoTick();
      await sleep(t);
      t = Math.max(340, t * 0.85);              // ≤ 3 changes per second (photosensitivity)
    }
    if (success) scene.classList.add('flash');
    paint(canvas, success ? toDex : fromDex, 192);
  }
  if (success) {
    sfx.evolve(); vibrate([60, 40, 120]);
    await typeText(text, `축하합니다! ${josa(from.name, '은', '는')} ${to.name}(으)로 진화했다!`);
  } else {
    sfx.fail();
    const next = evoChance(col);
    await typeText(text, `…${from.name}의 진화가 멈췄다. 다음엔 ${next >= 1 ? '반드시 성공해요!' : `확률이 ${Math.round(next * 100)}%로 올라가요.`}`);
  }
  text.append(h('span.more', '▼'));
  await tapToContinue(ov);
  closeOverlay();
  renderTab();
}

// ───────────────────────── 랭킹 ─────────────────────────

async function loadRanking() {
  const scope = S.rankScope;
  const key = 'rank:' + scope;
  S.rank[scope] ||= await kv.get(key);
  if (S.tab === 'rank') renderTab();
  try {
    const data = await rpc('get_ranking', { p_gen: scope === 'gen' ? S.snap.profile.gen : null }, { retries: 0 });
    S.rank[scope] = data;
    await kv.set(key, data);
    S.online = true;
  } catch (e) { if (e.offline) S.online = false; }
  if (S.tab === 'rank') renderTab();
}

function viewRank() {
  const r = S.rank[S.rankScope];
  const p = S.snap.profile;
  return [
    p.gen && h('div.seg', { role: 'group' },
      h('button', { 'aria-pressed': String(S.rankScope === 'all'), onclick: () => { S.rankScope = 'all'; loadRanking(); } }, '전체'),
      h('button', { 'aria-pressed': String(S.rankScope === 'gen'), onclick: () => { S.rankScope = 'gen'; loadRanking(); } }, `${p.gen}기`)),
    r ? h('div.box.banner', h('span', '내 순위 ', h('b', r.me ? `#${r.me.rank}` : '-'), ` / ${r.total}명`),
      h('small', `${timeAgo(r.at)} 기준`)) : h('div.box', S.online ? '불러오는 중…' : '오프라인이에요. 인터넷이 연결되면 랭킹을 불러와요.'),
    !p.show_on_board && h('div.box', { style: { fontSize: '13px' } }, '지금은 "익명 트레이너"로 표시돼요. 오른쪽 위 톱니바퀴 설정에서 바꿀 수 있어요.'),
    r && h('ol.rank-list', r.top.map((t) => h(`li${t.me ? '.me' : ''}`,
      h(`span.rank-no.r${t.rank}`, t.rank <= 3 ? pix(['gold', 'silver', 'bronze'][t.rank - 1], 'l') : `#${t.rank}`),
      h('span', h('div', t.display, t.me ? ' (나)' : ''), h('div.rank-sub', `도감 ${t.dex}`)),
      h('b', `${t.score}점`)))),
    r && !r.top.length && h('div.box', '아직 아무도 몬스터를 잡지 않았어요. 첫 번째가 되어 보세요!'),
    h('p', { style: { fontSize: '13px', margin: 0 } }, '점수: 1단계 1점 · 2단계 3점 · 3단계 6점 (+희귀·전설 보너스). 동점이면 먼저 도달한 사람이 위.'),
  ];
}

// ───────────────────────── 스캔 ─────────────────────────

let scanner = null;

function openScanner() {
  unlockAudio();
  sfx.blip();
  const video = h('video', { playsinline: true, muted: true, 'aria-hidden': 'true' });
  let torchOn = false;
  const torchBtn = h('button.btn.small', { hidden: true, onclick: async () => { torchOn = !torchOn; await scanner.torch(torchOn); torchBtn.replaceChildren(pix('light'), torchOn ? '끄기' : '손전등'); } }, pix('light'), '손전등');
  const tip = h('div.scan-tip', '장소에 붙은 QR을 네모 안에 맞춰 주세요');
  const ov = overlay(h('div', { style: { display: 'flex', flexDirection: 'column', width: '100%' } },
    h('div.scanner', video, h('div.reticle'), tip,
      h('button.btn.small.close-x', { onclick: () => closeOverlay(), 'aria-label': '닫기', html: ICON.close }),
      h('div.scan-bar',
        h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center' } },
          torchBtn,
          h('button.btn.small', { onclick: () => { closeOverlay(); manualEntry(); } }, '⌨ 코드 직접 입력'))))), 'full');
  ov.onclose = () => { scanner?.stop(); scanner = null; };
  scanner = new Scanner(video, (text) => {
    if (isBag(text)) { tip.textContent = '이건 가방 QR이에요 (부스용). 장소 QR을 찍어 주세요.'; return; }
    const place = parsePlace(text);
    if (!place) { tip.textContent = '게임 QR이 아니에요.'; sfx.error(); return; }
    closeOverlay();
    handleScan(place);
  });
  scanner.start().then(() => { torchBtn.hidden = !scanner?.hasTorch(); }).catch((e) => {
    tip.textContent = e.name === 'NotAllowedError'
      ? '카메라 권한이 필요해요. 브라우저 설정에서 카메라를 허용하거나, 아래 "코드 직접 입력"을 써 주세요.'
      : '카메라를 열 수 없어요. "코드 직접 입력"을 써 주세요.';
  });
}

function manualEntry() {
  const input = h('input', { inputmode: 'text', autocapitalize: 'characters', maxlength: 5, placeholder: 'ABCDE', style: { fontSize: '24px', letterSpacing: '6px', textAlign: 'center', minHeight: '56px', border: '3px solid var(--ink)', borderRadius: '8px', width: '100%' } });
  const err = h('div.err');
  sheet(h('form.box', {
    style: { display: 'grid', gap: '10px' },
    onsubmit: (e) => {
      e.preventDefault();
      const place = parsePlace(input.value);
      if (!place || place.q !== '_') { err.textContent = 'QR 아래 적힌 5자리 코드를 입력해 주세요.'; return; }
      closeOverlay();
      handleScan(place);
    },
  }, h('b', 'QR 아래 5자리 코드'), input, err, h('button.btn.go', { type: 'submit' }, '확인')));
  setTimeout(() => input.focus(), 100);
}

async function handleScan({ q, t }) {
  const R = rules();
  const items = bag();
  const known = S.catalog?.qrs.find((x) => x.id === q);
  const name = q === '_' ? '수동 코드 장소' : known?.name || '숨겨진 장소';
  if (items.length >= R.bag_max) return say(`가방이 꽉 찼어요! (${R.bag_max}장) 먼저 메인 부스에서 티켓을 써 주세요.`, true);
  if (q !== '_' && items.some((i) => i.qr_id === q)) return say(`이미 가방에 "${name}" 티켓이 있어요. 부스에서 쓰고 나면 다시 찍을 수 있어요.`, true);
  const cap = known?.daily_cap || R.qr_daily_cap;
  const todayN = (S.snap.today?.[q] || 0) + S.outbox.filter((o) => o.q === q).length;
  if (q !== '_' && todayN >= cap) return say(`오늘은 "${name}"을(를) ${cap}번 다 찍었어요. 다른 장소를 찾아보세요!`, true);

  S.outbox.push({ n: makeNonce(), q, t, at: new Date().toISOString() });
  await kv.set('outbox', S.outbox);
  sfx.scan(); vibrate(80);
  renderTab();
  const offlineNote = S.online ? '' : (known ? '\n(오프라인이라 나중에 자동으로 보내요)'
    : '\n※ 숨은·전설 장소는 바로 인터넷에 연결해야 인정돼요!');
  say(`${name}에서 티켓을 얻었다!\n가방 ${items.length + 1}/${R.bag_max} - 메인 부스에서 몬스터로 바꿔요.${offlineNote}`);
  sync();
}

function handlePendingScan() {
  const q = sessionStorage.getItem('pendingScan');
  if (!q || !S.snap || !$('nav.tabs')) return;
  sessionStorage.removeItem('pendingScan');
  const place = parsePlace(q);
  if (place) handleScan(place);
}

function say(msg, isError = false) {
  if (isError) { sfx.error(); vibrate([40, 40, 40]); }
  const text = h('div.box.textbox', { style: { whiteSpace: 'pre-line' } });
  const ov = overlay(h('div', { style: { width: '100%', maxWidth: '560px', padding: '0 12px calc(100px + env(safe-area-inset-bottom))' } }, text));
  typeText(text, msg).then(() => text.append(h('span.more', '▼')));
  tapToContinue(ov).then(() => { if (S.overlay === ov) closeOverlay(); });
}

// ───────────────────────── 가방 QR (부스) ─────────────────────────

let wakeLock = null;

async function openBag() {
  sfx.select();
  const items = bag();
  const canvas = h('canvas', { 'aria-label': '가방 QR' });
  drawQR(canvas, bagPayload(S.snap.profile.student_id, items), { cell: 6, margin: 4, ecc: 'L' });
  const ov = overlay(h('div.sheet',
    h('div.grab'),
    h('div.bagqr',
      h('b', `${S.snap.profile.name} · ${S.snap.profile.student_id.replace(/^g:/, '')}`),
      canvas,
      h('div.bright', pix('sun'), '화면 밝기를 최대로 올려 주세요'),
      h('small', S.online ? '부스에서 확인하면 자동으로 넘어가요…' : '오프라인이어도 부스에서 찍을 수 있어요.')),
    h('div.box', h('b', `가방 ${items.length}/${rules().bag_max}`),
      items.length ? h('div.bag-row', items.map((t) => h('span.chip', t.name))) : h('p', '가방이 비었어요. 그래도 부스에서 학번으로 확인할 수 있어요.')),
    h('button.btn', { onclick: () => closeOverlay() }, '닫기')));
  S.bagOpen = true;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* best effort */ }
  const poll = setInterval(() => sync(), CONFIG.BAG_POLL_MS);
  ov.onclose = () => { clearInterval(poll); S.bagOpen = false; wakeLock?.release?.().catch(() => {}); wakeLock = null; };
}

// ───────────────────────── 획득 축하 + 퀴즈 ─────────────────────────

let celebrating = false;

async function celebrate(tickets, prevLines) {
  if (celebrating) return;
  celebrating = true;
  if (S.overlay) closeOverlay();
  for (const t of tickets) {
    const sp = speciesOf(t.species_id);
    if (!sp) continue;
    const isNew = !prevLines.has(sp.line_id);
    prevLines.add(sp.line_id);
    const rare = lineOf(sp.line_id)?.rarity !== 'common';
    const canvas = spriteCanvas(sp.id, 200, 'white');
    const scene = h('div.scene', h('div.rays'), h('span.spr', canvas, isNew && h('span.new-badge', 'NEW!')));
    const text = h('div.box.textbox', { style: { whiteSpace: 'pre-line' } });
    const ov = overlay(h('div.stage', scene, text), 'full');
    await sleep(reducedMotion() ? 0 : 500);
    scene.classList.add('flash');
    paint(canvas, sp.id, 200);
    sfx.catch(); vibrate([80, 60, 160]);
    await typeText(text, `축하합니다! ${josa(sp.name, '을', '를')} 획득했습니다!${rare ? ' ★희귀★' : ''}\n(${t.qr_name})`);
    text.append(h('span.more', '▼'));
    S.celebrated.add(t.nonce);
    await kv.set('celebrated', [...S.celebrated]);
    await tapToContinue(ov);
    closeOverlay();
  }
  celebrating = false;
  renderTab();
  if (S.snap.quizzes?.length) openQuiz();
}

function openQuiz() {
  const q = S.snap.quizzes?.[0];
  if (!q) return;
  const sp = speciesOf(dexOf(q.line_id, 1));
  let picked = -1;
  const decide = h('button.btn.big.primary', { disabled: true }, '결정');
  const result = h('div');
  const btns = q.choices.map((c, i) => h('button.btn.choice', {
    'aria-pressed': 'false',
    onclick: () => {
      if (decide.dataset.done) return;
      sfx.blip(); picked = i;
      btns.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
      decide.disabled = false;
    },
  }, c));
  decide.onclick = async () => {
    if (picked < 0) return;
    decide.disabled = true;
    let r;
    try {
      r = await rpc('answer_quiz', { p_attempt: q.attempt_id, p_choice: picked }, { retries: 1 });
    } catch (e) {
      decide.disabled = false;
      result.replaceChildren(h('p.err', e.offline ? '인터넷이 연결되면 제출할 수 있어요. 퀴즈는 사라지지 않아요!' : errorText(e.message)));
      if (e.message === 'NO_QUIZ') { S.snap.quizzes.shift(); closeOverlay(); sync({ force: true }); }
      return;
    }
    decide.dataset.done = '1';
    btns[r.answer_pos]?.classList.add('right');
    if (!r.correct) btns[picked].classList.add('wrong');
    S.snap.quizzes.shift();
    S.snap.profile.evo_tickets = r.evo_tickets;
    await kv.set('snap', S.snap);
    if (r.correct) { sfx.correct(); vibrate(60); } else sfx.wrong();
    result.replaceChildren(h('div.box', r.correct
      ? (r.granted ? '정답! 진화권을 1장 얻었다! (도감에서 몬스터를 눌러 진화시켜요)' : '정답! (오늘 받을 수 있는 진화권을 다 받았어요)')
      : `아쉬워요! ${josa(sp?.name || '몬스터', '이', '가')} 고개를 젓는다…`));
    decide.textContent = S.snap.quizzes.length ? '다음 퀴즈' : '닫기';
    decide.disabled = false;
    decide.onclick = () => { closeOverlay(); renderTab(); if (S.snap.quizzes.length) openQuiz(); };
  };
  sheet([
    h('div.grab'),
    h('div.box', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
      sp && spriteCanvas(sp.id, 56), h('b', sp ? `${josa(sp.name, '이', '가')} 문제를 낸다!` : '퀴즈!')),
    h('div.box.quiz-q', q.question),
    h('div.choices', btns),
    result,
    decide,
  ], { dismissable: false });
}

// ───────────────────────── first run: consent + how to play ─────────────────────────

function renderConsent() {
  const show = h('input', { type: 'checkbox', id: 'show', checked: true });
  const err = h('div.err');
  app().replaceChildren(h('div.login', { style: { textAlign: 'left', alignContent: 'start', paddingTop: 'calc(env(safe-area-inset-top) + 32px)' } },
    h('div.logo', { style: { fontSize: '28px', justifySelf: 'center' } }, CONFIG.GAME_TITLE),
    h('div.box', { style: { maxWidth: '420px' } },
      h('b', '시작하기 전에 확인해 주세요'),
      h('ul', { style: { paddingLeft: '18px', margin: '8px 0', fontSize: '14px' } },
        h('li', '저장하는 정보: 학번, 이름, 게임 기록(찍은 QR·몬스터·퀴즈). 위치(GPS)는 저장하지 않아요.'),
        h('li', '목적: 축제 게임 운영과 랭킹·상품 지급.'),
        h('li', '축제가 끝나고 2주 뒤 모두 삭제해요.')),
      h('label', { for: 'show', style: { display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' } }, show,
        h('span', `랭킹·대형 화면에 내 이름을 "${S.snap?.profile?.gen ? S.snap.profile.gen + '기 ' : ''}${maskName(S.snap?.profile?.name)}"처럼 가려서 보여 주기. (체크를 풀면 "익명 트레이너" - 나중에 오른쪽 위 톱니바퀴 설정에서도 바꿀 수 있어요)`))),
    err,
    h('button.btn.big.primary', {
      style: { maxWidth: '420px' },
      onclick: async () => {
        try {
          const prof = await rpc('accept_terms', { p_show: show.checked });
          S.snap.profile = { ...S.snap.profile, ...prof };
          await kv.set('snap', S.snap);
          renderShell();
          maybeOnboard();
          handlePendingScan();
        } catch (e) { err.textContent = errorText(e.message); }
      },
    }, '동의하고 시작하기'),
    h('button.btn.small.ghost', { onclick: async () => { await signOut(); await kv.clear(); S.snap = null; renderLogin(); } }, '동의하지 않음 (로그아웃)')));
}
const maskName = (n = '') => n.length >= 3 ? n[0] + '○'.repeat(n.length - 2) + n.at(-1) : n.length === 2 ? n[0] + '○' : '트레이너';

function maybeOnboard() {
  let seen = false;
  try { seen = localStorage.getItem('onboarded') === '1'; } catch { /* ignore */ }
  if (!seen) showOnboarding();
}

function showOnboarding(again = false) {
  const steps = [
    ['camera', 'QR 찾기', '학교 곳곳에 붙은 QR을 아래 가운데 볼 버튼으로 찍어요. 폰 기본 카메라 말고 꼭 앱 버튼으로!'],
    ['ticket', '가방에 티켓', '찍으면 티켓이 가방에 들어가요 (최대 5장). 인터넷이 없어도 저장돼요.'],
    ['school', '메인 부스로!', '부스에서 "가방 QR"을 보여주면 선생님 몬스터를 받아요. 그 장소는 다시 찍을 수 있어요.'],
    ['spark', '퀴즈 → 진화', '몬스터를 받으면 쌤 퀴즈! 맞히면 진화권. 도감에서 몬스터를 눌러 진화시켜요.'],
  ];
  let i = 0;
  const icon = h('div', { style: { fontSize: '56px', textAlign: 'center' } });
  const title = h('b', { style: { fontSize: '20px' } });
  const body = h('p');
  const dots = h('div', { style: { textAlign: 'center', letterSpacing: '6px' } });
  const next = h('button.btn.big.primary');
  const draw = () => {
    const [a, b, c] = steps[i];
    icon.replaceChildren(pix(a, 'xl')); title.textContent = `${i + 1}. ${b}`; body.textContent = c;
    dots.textContent = steps.map((_, j) => (j === i ? '●' : '○')).join('');
    next.textContent = i < steps.length - 1 ? '다음 ▶' : '시작하기!';
  };
  next.onclick = () => {
    sfx.blip();
    if (i < steps.length - 1) { i++; draw(); return; }
    try { localStorage.setItem('onboarded', '1'); } catch { /* ignore */ }
    closeOverlay();
  };
  draw();
  sheet([h('div.grab'), h('div.box', { style: { display: 'grid', gap: '8px' } }, icon, title, body, dots), next], { dismissable: again });
}

// ───────────────────────── overlays (with history so Android "back" closes them) ─────────────────────────

function overlay(content, kind = '') {
  const replacing = !!S.overlay;
  if (replacing) closeOverlay({ replacing: true });
  const ov = h(`div.overlay${kind ? '.' + kind : ''}`, { role: 'dialog', 'aria-modal': 'true' }, content);
  document.body.append(ov);
  S.overlay = ov;
  if (replacing && history.state?.ov) history.replaceState({ ov: true, tab: S.tab }, '');
  else history.pushState({ ov: true, tab: S.tab }, '');
  return ov;
}

function sheet(content, { dismissable = true } = {}) {
  const ov = overlay(h('div.sheet', content));
  if (dismissable) ov.addEventListener('click', (e) => { if (e.target === ov) closeOverlay(); });
  ov.dataset.locked = dismissable ? '' : '1';
  return ov;
}

function closeOverlay({ fromPop = false, replacing = false } = {}) {
  const ov = S.overlay;
  if (!ov) return;
  if (fromPop && ov.dataset.locked === '1') { history.pushState({ ov: true, tab: S.tab }, ''); return; }  // quiz/onboarding: back does nothing
  S.overlay = null;
  ov.onclose?.();
  ov.remove();
  if (!fromPop && !replacing && history.state?.ov) { ignorePop++; history.back(); }
}

function tapToContinue(ov) {
  return new Promise((resolve) => {
    setTimeout(() => ov.addEventListener('click', () => resolve(), { once: true }), 250);
  });
}

// ───────────────────────── login ─────────────────────────

function renderLogin(error = '') {
  closeOverlay();
  const err = h('div.err', { role: 'alert' }, error);
  const gbox = h('div');
  const mons = h('div.mons', [1, 13, 25, 37].map((d) => spriteCanvas(d, 56)));
  const pending = sessionStorage.getItem('pendingScan');
  const content = [
    mons,
    h('div.logo', CONFIG.GAME_TITLE),
    h('div.logo-sub', '학교 곳곳의 QR을 찾아 선생님 몬스터를 모아라!'),
    pending && h('div.box', { style: { maxWidth: '340px', textAlign: 'left', fontSize: '14px' } },
      h('b', pix('camera'), 'QR을 찍었는데 이 브라우저는 로그인이 안 돼 있어요'), h('br'),
      '게임을 하던 앱(브라우저)을 열고 가운데 볼 버튼으로 다시 찍거나, QR 아래 5자리 코드를 입력하세요. 처음이라면 여기서 로그인해도 돼요.'),
    h('div.press.blink', 'PRESS START'),
    gbox,
    err,
  ];
  // backup login: printed code from homeroom (forgot Google password / teachers / guests)
  const cid = h('input', { placeholder: '학번 또는 아이디 (예: 022001)', autocomplete: 'username', autocapitalize: 'off' });
  const ccode = h('input', { placeholder: '코드 (예: ABCD-EFGH)', autocomplete: 'current-password', autocapitalize: 'characters' });
  content.push(h('details.code-login', h('summary', '구글 로그인이 안 되면: 학번·코드로 로그인'),
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        let id = cid.value.trim().toLowerCase();
        if (/^[0-9]{5}$/.test(id)) id = id.padStart(6, '0');
        try { await devLogin(`${id}@code.local`, ccode.value.replace(/[\s-]/g, '').toUpperCase()); }
        catch { err.textContent = '학번/아이디나 코드가 맞지 않아요. 조례 때 받은 쪽지를 확인해 주세요.'; }
      },
    }, cid, ccode, h('button.btn', { type: 'submit' }, '코드로 로그인'))));
  if (CONFIG.DEV_LOGIN) {
    const email = h('input', { type: 'email', placeholder: '테스트 이메일 (022001@test.local)', autocomplete: 'username' });
    const pw = h('input', { type: 'password', placeholder: '테스트 비밀번호', autocomplete: 'current-password' });
    content.push(h('form.dev-login', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        try { await devLogin(email.value.trim(), pw.value); } catch (x) { err.textContent = x.message; }
      },
    }, h('small', '- 개발용 테스트 로그인 -'), email, pw, h('button.btn', { type: 'submit' }, '테스트 로그인')));
  }
  content.push(h('p.foot-note', '학교 구글 계정으로 로그인하면 학번이 자동으로 연결돼요. 저장하는 정보: 학번, 이름, 게임 기록 (축제 종료 2주 후 삭제).'));
  app().replaceChildren(h('div.login', content));
  renderGoogleButton(gbox, (m) => { err.textContent = m; }).catch((e) => { err.textContent = e.message; });
}

function renderInApp() {
  const kind = inAppBrowser();
  app().replaceChildren(h('div.login',
    h('div.logo', CONFIG.GAME_TITLE),
    h('div.box', { style: { maxWidth: '360px', textAlign: 'left' } },
      h('b', pix('warn'), '카카오톡/인스타 안에서 열렸어요'), h('br'),
      '여기서는 구글 로그인이 막혀 있어요. 크롬이나 Safari로 열어 주세요.',
      isIOS() && kind !== 'kakao' ? h('p', '오른쪽 아래(또는 위) ⋯ 버튼 → "Safari로 열기"를 눌러 주세요. ↘') : null),
    h('button.btn.big.primary', { onclick: () => { if (!escapeInApp()) toast('⋯ 메뉴에서 "Safari로 열기"를 눌러 주세요.', 5000); } }, '외부 브라우저로 열기'),
    h('button.btn.small.ghost', { onclick: () => navigator.clipboard?.writeText(location.href).then(() => toast('주소를 복사했어요. 브라우저에 붙여 넣으세요.')) }, '주소 복사'),
    h('button.btn.small.ghost', { onclick: () => renderLogin() }, '그래도 여기서 학번·코드로 로그인')));
}

boot();
