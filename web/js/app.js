// Student app. State = last server snapshot (IndexedDB) + local outbox of scans not yet acknowledged.
// See docs/DESIGN.md §3 (offline rules) and §5 (server rules).
import { CONFIG } from './config.js';
import { sb, rpc, errorText, reportError } from './sb.js';
import { kv, persist } from './db.js';
import { parsePlace, isBag, makeNonce, bagPayload, drawQR } from './qrfmt.js';
import { Scanner } from './scanner.js';
import { spriteCanvas, paint } from './sprites.js';
import { sfx, unlockAudio, isMuted, setMuted, startBgm, stopBgm } from './sfx.js';
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
  btSeen: new Set(),    // 배틀 신청 중 이미 알린 것
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
const specialOf = (nonce) => (S.snap?.special || []).find((x) => x.nonce === nonce);
const bag = () => [
  ...serverPending().map((t) => ({ nonce: t.nonce, qr_id: t.qr_id, token: t.token, name: t.qr_name, synced: true, special: specialOf(t.nonce) })),
  ...S.outbox.filter((o) => !serverPending().some((t) => t.nonce === o.n))
    .map((o) => ({ nonce: o.n, qr_id: o.q, token: o.t, name: o.q === '_' ? '수동 코드' : qrName(o.q) || '확인 중인 장소', synced: false })),
];
const normalBag = () => bag().filter((t) => !t.special);   // only these count towards bag_max
const evolvable = () => collection().filter((c) => c.stage < maxStage(c.line_id) && !isWithdrawn(c.line_id));
const isWithdrawn = (line) => (S.snap?.rules?.withdrawn || []).includes(line) || !!lineOf(line)?.withdrawn;
const isSecret = (line) => !!lineOf(line)?.secret;
const isBonus = (line) => !!lineOf(line)?.bonus || isSecret(line);
// 도감 완성 = 비밀 몬스터를 뺀 모든 몬스터 (비공개 계열 제외)
function dexStats() {
  const reached = (sp) => (owned(sp.line_id)?.stage || 0) >= sp.stage;
  const main = S.catalog.species.filter((sp) => !isBonus(sp.line_id) && !isWithdrawn(sp.line_id));
  const found = main.filter(reached).length;
  return { found, total: main.length, complete: main.length > 0 && found === main.length,
           secret: collection().some((c) => isSecret(c.line_id)) };
}
const titlesOf = (p, d = dexStats()) => [...(p.titles || []), d.complete && '도감 마스터', d.secret && '비밀 탐험가'].filter(Boolean);
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
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; refreshInstallButtons(); });
  window.addEventListener('appinstalled', () => { S.installEvt = null; refreshInstallButtons(); toast('앱으로 설치했어요! 홈 화면의 아이콘으로 열어 주세요.'); });
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

async function doAfterLogin(retried = false) {
  try {
    const profile = await rpc('ensure_profile');
    if (profile.needs_register) return renderRegister(profile);
    const link = linkIntent();
    if (link) {
      // 이 구글은 이미 어떤 계정에 연결돼 있음 → 그 계정으로 들어왔다
      clearGoogleIntents();
      if (profile.login_key !== link.key) {
        await signOut();
        return renderLogin('이 구글 계정은 이미 다른 게임 계정에 연결돼 있어요. 다른 구글 계정으로 해 주세요.');
      }
      toast('이 구글은 이미 이 계정의 복구용으로 연결돼 있어요.', 4000);
    }
    const recovering = sessionStorage.getItem('recover') === '1';
    if (recovering) sessionStorage.removeItem('recover');
    if (profile.role !== 'student') toast(`${profile.role === 'admin' ? '운영자' : '부스'} 계정으로 로그인했어요.`);
    if (!S.snap) S.celebrated = new Set(['__init__']);   // first sync on this device: don't replay old celebrations
    await loadCatalog();
    await sync({ force: true });
    if (!S.snap?.profile?.consented && profile.role === 'student') return renderConsent();
    if (!$('nav.tabs')) renderShell();
    persist();
    if (recovering) { passwordSheet({ recover: true }); return; }   // 구글로 내 계정을 찾았음 → 새 비밀번호
    maybeOnboard();
    handlePendingScan();
  } catch (e) {
    if (e.offline) {
      if (S.snap && S.catalog) { if (!$('nav.tabs')) renderShell(); return; }
      return renderLogin('인터넷에 연결된 곳에서 처음 로그인해 주세요.');
    }
    // an expired access token (phone was asleep) is normal: refresh it and try again before giving up
    if (/permission denied|JWT|NOT_AUTHENTICATED/i.test(e.message) && !retried) {
      const { data } = await sb.auth.refreshSession().catch(() => ({ data: {} }));
      if (data?.session) return doAfterLogin(true);
      await signOut();
      return renderLogin('로그인이 풀렸어요. 다시 로그인해 주세요.');
    }
    // any other error: keep the login (never log out because of a server hiccup or an old app version)
    if (S.snap && S.catalog) { if (!$('nav.tabs')) renderShell(); toast(errorText(e.message)); return; }
    renderRetry(errorText(e.message));
  }
}

// something went wrong after login, but the login itself is fine → offer a retry instead of logging out
function renderRetry(msg) {
  app().replaceChildren(h('div.login',
    h('div.logo', CONFIG.GAME_TITLE),
    h('div.box.login-note', h('b', '잠깐 문제가 생겼어요'), h('br'), msg),
    h('button.btn.big.primary', { onclick: () => afterLogin() }, '다시 시도'),
    h('button.btn.small.ghost', { onclick: async () => { await signOut(); await kv.clear(); S.snap = null; renderLogin(); } }, '다른 계정으로 로그인')));
}

async function loadCatalog() {
  const [lines, species, qrs, moves, speciesMoves, typeChart] = await Promise.all([
    sb.from('lines').select('id,teacher,subject,btype,rarity,active,max_stage,withdrawn,secret,bonus').order('id'),
    sb.from('species').select('id,line_id,stage,name,category,flavor,height,weight,hp,atk,def,spa,spd,spe').order('id'),
    sb.from('qr_points').select('id,name,hint,map_x,map_y,daily_cap').order('id'),
    sb.from('moves').select('id,name,type,category,kind,power,accuracy,pp,priority,effect,description').order('id'),
    sb.from('species_moves').select('species_id,slot,move_id'),
    sb.from('type_chart').select('atk,def,mult'),
  ]);
  if (lines.error || species.error || qrs.error) {
    if (S.catalog) return;
    throw Object.assign(new Error('OFFLINE'), { offline: true });
  }
  S.catalog = { lines: lines.data, species: species.data, qrs: qrs.data, at: new Date().toISOString(),
                moves: moves.data || [], speciesMoves: speciesMoves.data || [], typeChart: typeChart.data || [] };
  await kv.set('catalog', S.catalog);
}

// QR names/positions and monster texts can change during the festival (admin page) → refresh every 5 min
function refreshCatalogIfOld() {
  // older cached catalogs have no battle data (moves) → refresh right away
  if (!S.catalog?.at || (S.catalog.moves && Date.now() - new Date(S.catalog.at).getTime() < 5 * 60_000)) return;
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
      else if (e.message === 'NO_PROFILE') { S.snap = null; await kv.del('snap'); afterLogin(); }
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
  raid: '<path d="M14 2l3 7 8-3-4 8 7 4-8 2 1 8-7-5-7 5 1-8-8-2 7-4-4-8 8 3z"/>',
  battle: '<path d="M3 3h4l13 13-4 4L3 7zM25 3h-4L8 16l4 4L25 7zM5 19l4 4-3 3-4-4zM23 19l-4 4 3 3 4-4z"/>',
};
// red & white ball for the centre scan button (user's choice)
const CAPSULE = `<svg viewBox="0 0 32 32" aria-hidden="true">
  <circle cx="16" cy="16" r="14" fill="#f8f8f8" stroke="#202838" stroke-width="2.5"/>
  <path d="M2.5 16a13.5 13.5 0 0 1 27 0z" fill="#e04848"/>
  <path d="M6 9a11 11 0 0 1 6-4" fill="none" stroke="#ff9a9a" stroke-width="2" stroke-linecap="round"/>
  <rect x="2" y="14.5" width="28" height="3" fill="#202838"/>
  <circle cx="16" cy="16" r="5" fill="#f8f8f8" stroke="#202838" stroke-width="2.5"/>
  <circle cx="16" cy="16" r="2" fill="#fff" stroke="#c8c8c8" stroke-width="1"/></svg>`;

const TABS = [['home', '홈'], ['map', '지도'], ['raid', '레이드'], ['scan', 'QR'], ['battle', '배틀'], ['dex', '도감'], ['rank', '랭킹']];

function renderShell() {
  app().replaceChildren(
    h('header.topbar', h('h1', { onclick: logoTap }, CONFIG.GAME_TITLE),
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

// 이스터에그 1: 제목을 빠르게 7번 누르면 몬스터가 화면을 가로질러 달려간다
let logoTaps = [];
function logoTap() {
  const now = Date.now();
  logoTaps = [...logoTaps.filter((t) => now - t < 2500), now];
  if (logoTaps.length < 7) return;
  logoTaps = [];
  const mine = collection().filter((c) => !isWithdrawn(c.line_id));
  const pick = mine.length ? mine[Math.floor(Math.random() * mine.length)] : null;
  const dex = pick ? dexOf(pick.line_id, pick.stage) : S.catalog.species[Math.floor(Math.random() * S.catalog.species.length)].id;
  const runner = h('div.parade', { 'aria-hidden': 'true' }, spriteCanvas(dex, 96, pick ? 'normal' : 'silhouette'));
  document.body.append(runner);
  sfx.catch(); vibrate([30, 40, 30, 40, 30]);
  toast(pick ? `${speciesOf(dex)?.name || '몬스터'}이(가) 신나서 달려간다!` : '정체를 알 수 없는 그림자가 지나갔다…!');
  setTimeout(() => runner.remove(), 3200);
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
  const view = ({ home: viewHome, map: viewMap, raid: viewRaid, battle: viewBattle, dex: viewDex, rank: viewRank }[S.tab] || viewHome)();
  main.replaceChildren(...[view].flat().filter((x) => x != null && x !== false));
  renderStatus();
  // monsters can also arrive without a catch scene (admin grant, another phone) → check 도감 완성 on the home tab
  if (S.tab === 'home' && !S.overlay && !celebrating && dexStats().complete) maybeDexComplete();
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
  const D = dexStats();
  const total = D.total;
  const titles = titlesOf(p, D);
  const partner = [...collection()].sort((a, b) => b.stage - a.stage || new Date(b.first_caught_at) - new Date(a.first_caught_at))[0];
  const items = bag();
  const normal = items.filter((t) => !t.special);
  const visited = new Set((S.snap.tickets || []).map((t) => t.qr_id));
  const hints = S.catalog.qrs.filter((q) => q.hint && !visited.has(q.id));
  const hint = hints.length ? hints[new Date().getMinutes() % hints.length] : null;
  const [icon, label, kind, act] = nextAction();
  const closeAt = R.festival_close_at ? new Date(R.festival_close_at) : null;
  const minsLeft = closeAt ? Math.round((closeAt - Date.now()) / 60000) : null;

  return [
    S.updateReady && h('button.btn.big.gold', { onclick: () => S.updateReady() }, '⬆ 새 버전 적용하기 (2초)'),
    installBanner(),
    !S.updateReady && Number(R.min_client_version) > CONFIG.VERSION && h('div.box.warn-box', '⬆ 새 버전이 있어요! 앱(브라우저 탭)을 완전히 닫았다가 다시 열어 주세요.'),
    R.notice && h('div.box.notice-box', pix('mega'), String(R.notice)),
    R.festival_ended && h('div.box.ended-box',
      h('div.big', pix('spark', 'l'), '축제 끝! 수고했어요'),
      h('div', p.in_ranking === false ? '선생님·손님 계정은 랭킹에서 제외돼요.' : `최종 순위 ${p.rank ? '#' + p.rank : '-'} · 점수 ${p.score} · 도감 ${D.found}/${total}`),
      R.prize_note && h('div', String(R.prize_note))),
    !S.snap.festival_open && !R.festival_ended && h('div.box', pix('pause'), '지금은 게임 운영 시간이 아니에요. 찍은 QR은 저장해 두었다가 다시 열리면 보내요.'),
    (R.legend_schedule || []).length > 0 && !R.festival_ended && h('div.box.legend-box', pix('bolt', 'l'),
      h('div', h('b', '전설의 몬스터 출현'), h('br'),
        [...new Set(R.legend_schedule.map((l) => (l.from ? `${fmtTime(l.from)}${l.until ? '~' + fmtTime(l.until) : ''}` : '지금')))].join(' · '),
        ' · 메인 부스 대형 화면')),
    (S.snap.raids_live || []).length > 0 && !R.festival_ended && h('button.box.raid-banner', { onclick: () => go('raid') },
      spriteCanvas(S.snap.raids_live[0].species_id, 48),
      h('div', h('b', '레이드 보스 출현!'), h('br'), h('small', `${S.snap.raids_live.map((x) => x.title).join(' · ')} — 대형 화면의 QR을 찍어 참가해요`))),
    (S.btInbox?.invites || []).length > 0 && h('button.box.raid-banner.bt-banner', { onclick: () => inviteSheet(S.btInbox.invites[0]) },
      pix('spark', 'l'), h('div', h('b', '배틀 신청!'), h('br'), h('small', `${josa(S.btInbox.invites[0].from, '이', '가')} 실시간 배틀을 신청했어요 — 눌러서 수락`))),
    minsLeft != null && minsLeft > 0 && minsLeft < 120 && h('div.box.warn-box', pix('clock'), `마감까지 ${minsLeft}분! 가방 티켓은 마감 전에 부스에서 써 주세요.`),

    h(`button.btn.big.${kind}.next-action`, { onclick: () => { sfx.select(); act(); } }, h('span', icon), label),

    h(`section.trainer${D.complete ? '.gold-card' : ''}`, { 'aria-label': '트레이너 카드' },
      h('div.idno', h('span', 'TRAINER CARD'), h('span', p.student_id.startsWith('g:') ? 'GUEST' : `ID No. ${p.student_id}`)),
      h('div', h('div.name', p.name || '트레이너'), h('div', { style: { fontSize: '13px' } }, p.gen ? `${p.gen}기 트레이너` : '특별 트레이너'),
        titles.length ? h('div.titles', titles.map((t) => h('span.title-chip', t))) : null),
      h('div.partner', partner ? spriteCanvas(dexOf(partner.line_id, partner.stage), 88) : spriteCanvas(1, 88, 'silhouette')),
      h('div.stats',
        h('span', '도감', h('b', `${D.found}/${total}`)), h('span', '점수', h('b', p.score)),
        h('span', '순위', h('b', p.in_ranking === false ? '제외' : p.rank ? `#${p.rank}` : '-')), h('span', '진화권', h('b', p.evo_tickets))),
      h('div.badges', { title: '최종 진화시킨 쌤' }, S.catalog.lines.filter((l) => !l.secret && !l.bonus).map((l) => {
        const done = (owned(l.id)?.stage || 0) >= (l.max_stage ?? 3);
        return h(`i${done ? '.on.t-' + l.subject : ''}`, { title: done ? `${l.subject} 완성` : '?' });
      }))),

    h('section.box', { 'aria-label': '가방' },
      h('div.banner', h('b', `가방 ${normal.length}/${R.bag_max}`, items.length > normal.length ? h('span.special-count', ` + ★${items.length - normal.length}`) : null),
        h('span', { style: { fontSize: '13px' } }, items.length ? '메인 부스에서 몬스터로 바꿔요' : 'QR을 찍으면 티켓이 들어와요')),
      items.length ? h('div.bag-row', items.map((t) => (t.special
        ? h('span.chip.special', pix('spark'), speciesOf(t.special.species_id)?.name || '특별', h('small', ` ${{ raid: '레이드', dex50: '도감 50%', dex100: '도감 완성' }[t.special.special] || ''}`))
        : h(`span.chip${t.synced ? '' : '.local'}`, pix(t.synced ? 'ticket' : 'wait'), t.name)))) : null,
      h('button.btn.big' + (items.length ? '.primary' : ''), { onclick: openBag }, '가방 QR 보여주기'),
      R.self_redeem === true && items.some((t) => t.synced) && h('button.btn.big.gold', { style: { marginTop: '8px' }, onclick: selfRedeem },
        pix('gift'), '지금은 앱에서 바로 받기 (부스 혼잡 모드)')),

    rouletteBox(),

    hint && h('section.box.hint', h('b', pix('bulb'), '힌트  '), hint.hint),
  ];
}

// install banner on home: until installed or closed (closing only hides it on this device)
function installBanner() {
  let closed = false;
  try { closed = localStorage.getItem('installClosed') === '1'; } catch { /* ignore */ }
  if (closed || isStandalone()) return null;
  const box = h('section.box.install-box', { hidden: !canOfferInstall() },
    h('div', h('b', pix('phone'), '앱으로 설치하기'), h('br'), h('small', '주소창 없이 전체 화면으로 열리고, 홈 화면 아이콘이 생겨요.')),
    h('div.row', h('button.btn.small.ghost', { onclick: () => { try { localStorage.setItem('installClosed', '1'); } catch { /* ignore */ } box.remove(); } }, '닫기'),
      h('button.btn.small.primary', { onclick: showInstall }, '설치')));
  box.classList.add('install-btn');   // shown/hidden together with the other install buttons
  return box;
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
  S.snap.profile = { ...S.snap.profile, evo_tickets: res.evo_tickets, titles: res.titles || S.snap.profile.titles };
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
  if (res.jackpot) {                     // 이스터에그 5: 아주 드물게 꽝 대신 777
    await sleep(reducedMotion() ? 0 : 500);
    cells[target].textContent = '777';
    cells[target].classList.add('jackpot');
    S.overlay.querySelector('.scene')?.classList.add('golden');
    sfx.catch(); vibrate([70, 50, 70, 50, 70, 50, 200]);
    await typeText(text, '7 7 7 !!! 럭키 세븐!\n아주 드문 행운이에요. 칭호 「럭키 세븐」을 얻었다!');
  } else {
    if (res.prize > 0) { sfx.correct(); vibrate([40, 30, 80]); } else sfx.fail();
    await typeText(text, res.prize > 0 ? `진화권 ${res.prize}장을 받았다! (지금 ${res.evo_tickets}장)` : `꽝…! ${res.roulette.every_min}분 뒤에 다시 도전해요.`);
  }
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
    ['number', 'id'].includes(p.login) && p.role === 'student' && h('section.box.stack.setting-login',
      h('b', '로그인 정보'),
      h('span', p.login === 'number' ? `학생 · 고유번호 ${p.login_key}` : `비학생 · 아이디 ${p.login_key}`),
      p.google_linked
        ? h('small', pix('spark'), ` 복구용 구글: ${p.google_email || '연결됨'}`)
        : [h('small', '복구용 구글을 연결해 두면 비밀번호를 잊어도 그 구글로 들어와서 다시 정할 수 있어요.'),
          h('button.btn', { onclick: startGoogleLink }, pix('school'), '복구용 구글 연결하기')]),
    h('section.box', { style: { display: 'grid', gap: '8px' } },
      h('button.btn', { onclick: (e) => { setMuted(!isMuted()); e.currentTarget.replaceChildren(...soundLabel()); } },
        ...soundLabel()),
      h('button.btn', { onclick: () => showOnboarding(true) }, pix('book'), '게임 방법 다시 보기'),
      h('button.btn', { onclick: inquirySheet }, pix('memo'), '운영진에게 문의하기'),
      ['number', 'id'].includes(p.login) && h('button.btn', { onclick: () => passwordSheet() }, pix('ticket'), '비밀번호 바꾸기'),
      !isStandalone() && h('button.btn', { onclick: showInstall }, pix('phone'), '앱으로 설치하기'),
      h('button.btn', { onclick: confirmLogout }, pix('door'), '로그아웃')),
    // 운영진: 운영자 페이지 (운영진 아이디 또는 등록된 구글로 로그인)
    h('a.btn.small.ghost', { href: 'admin.html', target: '_blank', rel: 'noopener' }, pix('school'), '운영진 전용: 운영자 페이지 로그인'),
    h('small', { style: { textAlign: 'center' } }, `${p.student_id.replace(/^g:/, '')} · 버전 ${CONFIG.VERSION}`),
  ]);
}

// 불편한 점·문의 → 운영자 페이지 '요청' 탭
function inquirySheet() {
  const body = h('textarea.inp', { rows: 5, maxlength: 1000, placeholder: '예: QR이 안 찍혀요 / 부스 위치를 모르겠어요 / 버그 제보' });
  const err = h('div.err', { role: 'alert' });
  const send = h('button.btn.big.primary', { type: 'submit' }, '보내기');
  closeOverlay({ replacing: true });
  sheet([h('div.grab'), h('h2', { style: { margin: '0 4px' } }, '운영진에게 문의하기'),
    h('form.stack.box', {
      onsubmit: async (e) => {
        e.preventDefault();
        send.disabled = true;
        try { await rpc('send_inquiry', { p_body: body.value }, { retries: 0 }); closeOverlay(); toast('보냈어요! 운영진이 확인할게요.'); }
        catch (x) { err.textContent = errorText(x.message); send.disabled = false; }
      },
    }, h('small', '불편한 점, 궁금한 점, 버그를 적어 주세요. 고유번호와 이름이 같이 전달돼요.'), body, err, send)]);
}

// 비밀번호 바꾸기 (고유번호·아이디 계정). recover = 복구용 구글로 들어온 직후 새 비밀번호 정하기.
// 바꾸고 나면 다른 기기의 로그인은 모두 끊는다 (OWASP: 비밀번호 재설정 후 다른 세션 무효화)
function passwordSheet({ recover = false } = {}) {
  const p = S.snap.profile;
  const pw = h('input', { type: 'password', placeholder: '새 비밀번호 (6자 이상)', autocomplete: 'new-password', maxlength: 72 });
  const pw2 = h('input', { type: 'password', placeholder: '한 번 더', autocomplete: 'new-password', maxlength: 72 });
  const err = h('div.err', { role: 'alert' });
  const save = h('button.btn.big.primary', { type: 'submit' }, recover ? '새 비밀번호로 정하기' : '바꾸기');
  const what = `${p.login === 'id' ? '아이디' : '고유번호'} ${p.login_key || p.student_id}`;
  closeOverlay({ replacing: true });
  sheet([h('div.grab'), h('h2', { style: { margin: '0 4px' } }, recover ? '새 비밀번호 정하기' : '비밀번호 바꾸기'),
    h('form.stack.box', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (pw.value.length < 6) { err.textContent = '6자 이상으로 정해 주세요.'; return; }
        if (pw.value !== pw2.value) { err.textContent = '두 칸이 서로 달라요.'; return; }
        save.disabled = true;
        const { error } = await sb.auth.updateUser({ password: pw.value });
        if (error) { err.textContent = '바꾸지 못했어요. 잠시 후 다시 해 주세요.'; save.disabled = false; return; }
        try { await sb.auth.signOut({ scope: 'others' }); } catch { /* best effort */ }
        closeOverlay();
        toast(`비밀번호를 바꿨어요. 다른 기기의 로그인은 끊겼어요. 다음부터 ${what}와 새 비밀번호로 들어와요.`, 5000);
      },
    }, h('small', recover ? `구글로 내 계정(${what})을 찾았어요. 새 비밀번호를 정해 주세요.` : `${what}의 비밀번호예요.`), pw, pw2, err, save)]);
}

// 설정 → 복구용 구글 연결: 로그아웃 → 연결할 구글로 로그인 → 이 계정 비밀번호 한 번 더 (renderLinkGoogle)
function startGoogleLink() {
  const p = S.snap.profile;
  const n = bag().filter((t) => !t.synced).length;
  closeOverlay({ replacing: true });
  sheet(h('div.box.stack',
    h('b', '복구용 구글 연결'),
    h('p', '연결하려면 잠깐 로그아웃하고, 연결할 구글 계정으로 로그인한 다음, 이 계정의 비밀번호를 한 번 더 넣어요.'),
    n ? h('p.warn-txt', pix('warn'), `아직 서버에 못 보낸 티켓이 ${n}장 있어요. 인터넷이 될 때 먼저 보내고 해 주세요.`) : null,
    h('div', { style: { display: 'flex', gap: '8px' } },
      h('button.btn', { onclick: () => closeOverlay() }, '취소'),
      h('button.btn.primary', {
        disabled: !!n,
        onclick: async () => {
          sessionStorage.setItem('linkGoogle', JSON.stringify({ kind: p.login, key: p.login_key }));
          closeOverlay(); await signOut(); await kv.clear(); S.snap = null; S.outbox = []; renderLogin();
        },
      }, '계속'))));
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

// installed app = no browser address bar. Chrome/Android: real install prompt; iPhone: instructions.
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const canOfferInstall = () => !isStandalone() && (!!S.installEvt || isIOS());
function installButton(cls = '') {
  return h(`button.btn.install-btn${cls}`, { hidden: !canOfferInstall(), onclick: showInstall }, pix('phone'), '앱으로 설치하기');
}
function refreshInstallButtons() {
  document.querySelectorAll('.install-btn').forEach((b) => { b.hidden = !canOfferInstall(); });
}

async function showInstall() {
  if (S.installEvt) {
    const evt = S.installEvt;
    evt.prompt();
    const { outcome } = await evt.userChoice.catch(() => ({}));
    if (outcome === 'accepted') S.installEvt = null;
    refreshInstallButtons();
    return;
  }
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
  const subjects = [...new Set(lines.filter((l) => !l.secret).map((l) => l.subject))];
  const reached = (sp) => (owned(sp.line_id)?.stage || 0) >= sp.stage;
  const { found, total } = dexStats();
  const list = species.filter((sp) => (S.dexFilter === 'all' || lineOf(sp.line_id)?.subject === S.dexFilter)
    && (!isSecret(sp.line_id) || S.dexFilter === 'all'));
  const p = S.snap.profile;
  return [
    h('div.box.dex-head',
      h('div.banner', h('b', '몬스터 도감'), h('span', `발견 ${found} / ${total}`)),
      h('div.bar', h('i', { style: { width: `${(found / total) * 100}%` } })),
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
        onclick: () => (ok ? openDetail(sp) : toast(isSecret(sp.line_id) ? '지도에 없는 곳에 숨어 있다는 소문이… 학교를 구석구석 찾아보세요!' : '아직 발견하지 못했어요. 학교 곳곳을 찾아보세요!')),
      },
      h('span.no', isSecret(sp.line_id) ? 'No.???' : dexNo(sp)),
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
    h('button.btn.primary', { onclick: () => { closeOverlay({ replacing: true }); openSummary(sp); } }, pix('book'), '능력치 · 기술 보기'),
    h('button.btn', { onclick: () => closeOverlay() }, '닫기'),
  ]);
  typeText(flavor, sp.flavor);
}

// ───────── 요약 화면 (3세대 START → 요약 느낌): 정보 / 능력치 / 기술 ─────────
const STAT_KEYS = [['hp', 'HP'], ['atk', '공격'], ['def', '방어'], ['spa', '특수공격'], ['spd', '특수방어'], ['spe', '스피드']];
const CAT_LABEL = { physical: '물리', special: '특수', status: '변화' };
const KIND_LABEL = { attack: '공격', status: '상태', defense: '방어' };
const typeOf = (sp) => { const l = lineOf(sp.line_id); return l?.btype || (l?.subject === '비밀' ? '전설' : l?.subject); };
// Lv.50 실제 능력치 (개체값 31, 노력치 0, 성격 보정 없음)
const lv50 = (key, base) => (key === 'hp' ? Math.floor((2 * base + 31) / 2) + 60 : Math.floor((2 * base + 31) / 2) + 5);
const movesOf = (sp) => (S.catalog.speciesMoves || []).filter((x) => x.species_id === sp.id).sort((a, b) => a.slot - b.slot)
  .map((x) => (S.catalog.moves || []).find((m) => m.id === x.move_id)).filter(Boolean);
function typeMatch(type) {
  const chart = S.catalog.typeChart || [];
  return {
    strong: chart.filter((c) => c.atk === type && Number(c.mult) > 1).map((c) => c.def),
    weak: chart.filter((c) => c.def === type && Number(c.mult) > 1).map((c) => c.atk),
  };
}
function statNote(sp) {
  const v = STAT_KEYS.map(([k, n]) => [n, sp[k] || 0]);
  const hi = [...v].sort((a, b) => b[1] - a[1])[0];
  const lo = [...v].sort((a, b) => a[1] - b[1])[0];
  return `${josa(hi[0], '이', '가')} 높고 ${josa(lo[0], '이', '가')} 낮은 편`;
}

function openSummary(sp, page = 0) {
  sfx.select();
  if (!sp.hp || !(S.catalog.moves || []).length) { toast('능력치 정보를 불러오는 중이에요. 잠시 후 다시 열어 주세요.'); loadCatalog().catch(() => {}); return; }
  const type = typeOf(sp);
  const PAGES = ['정보', '능력치', '기술'];
  const body = h('div.sum-body');
  const tabs = h('div.sum-tabs', PAGES.map((t, i) => h('button', { type: 'button', 'aria-pressed': String(i === page), onclick: () => show(i) }, t)));
  const show = (i) => {
    page = (i + PAGES.length) % PAGES.length;
    tabs.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-pressed', String(k === page)));
    sfx.blip();
    body.replaceChildren(...[sumInfo, sumStats, sumMoves][page](sp, type));
  };
  const ov = sheet([
    h('div.summary',
      h('div.sum-top', h('b', `${dexNo(sp)}`), h('span', sp.name), h(`span.type.t-${type}`, type), h('span.sum-lv', 'Lv.50')),
      h('div.sum-main',
        h(`div.sum-pic.t-bg-${type}`, spriteCanvas(sp.id, 112)),
        h('div.sum-right', tabs, body)),
      h('div.sum-nav',
        h('button.btn.small', { type: 'button', onclick: () => show(page - 1), 'aria-label': '이전 페이지' }, '◀'),
        h('span', '◀ ▶ 로 페이지 넘기기'),
        h('button.btn.small', { type: 'button', onclick: () => show(page + 1), 'aria-label': '다음 페이지' }, '▶'))),
    h('button.btn', { onclick: () => closeOverlay() }, '닫기'),
  ]);
  ov.classList.add('sum-overlay');
  show(page);
}

function sumInfo(sp, type) {
  const line = lineOf(sp.line_id);
  const m = typeMatch(type);
  const chips = (arr) => (arr.length ? arr.map((t) => h(`span.type.t-${t}`, t)) : [h('span', '없음')]);
  return [
    h('dl.sum-kv',
      h('dt', '이름'), h('dd', sp.name),
      h('dt', '타입'), h('dd', h(`span.type.t-${type}`, type)),
      h('dt', '분류'), h('dd', sp.category),
      h('dt', '정체'), h('dd', line?.teacher || '?'),
      h('dt', '성향'), h('dd', statNote(sp))),
    h('div.sum-match', h('small', '효과가 굉장한 상대'), h('div', ...chips(m.strong))),
    h('div.sum-match', h('small', '조심해야 할 상대'), h('div', ...chips(m.weak))),
  ];
}

function sumStats(sp) {
  const vals = STAT_KEYS.map(([k]) => sp[k] || 0);
  const hi = Math.max(...vals), lo = Math.min(...vals);
  return [
    h('div.sum-stats', STAT_KEYS.map(([k, name], i) => {
      const b = vals[i];
      const mark = b === hi ? h('i.up', '▲') : b === lo ? h('i.down', '▼') : h('i', '');
      return h('div.stat-row',
        h('span.stat-name', name, mark),
        h('b.stat-val', String(lv50(k, b))),
        h('span.stat-bar', h(`i${b === hi ? '.hi' : b === lo ? '.lo' : ''}`, { style: { width: `${Math.min(100, (b / 150) * 100)}%` } })));
    })),
    h('div.sum-total', h('span', '종족값 합계'), h('b', String(vals.reduce((a, b) => a + b, 0)))),
    h('small.muted', '숫자 = Lv.50 능력치 · 막대 = 종족값 · ▲ 가장 높음 ▼ 가장 낮음'),
  ];
}

function sumMoves(sp) {
  const detail = h('div.move-detail');
  const moves = movesOf(sp);
  const pick = (m, btn) => {
    sfx.blip();
    detail.parentElement?.querySelectorAll('.move-row').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    detail.replaceChildren(
      h('div.move-kv',
        h('span', '분류'), h('b', `${CAT_LABEL[m.category]} · ${KIND_LABEL[m.kind]}`),
        h('span', '위력'), h('b', m.power ? String(m.power) : '—'),
        h('span', '명중'), h('b', m.accuracy == null ? '—' : String(m.accuracy)),
        m.priority ? h('span', '우선도') : null, m.priority ? h('b', `+${m.priority}`) : null),
      h('p', m.description));
  };
  const rows = moves.map((m) => {
    const btn = h('button.move-row', { type: 'button', onclick: () => pick(m, btn) },
      h(`span.type.t-${m.type}`, m.type),
      h('b', m.name),
      h(`span.kind.k-${m.kind}`, KIND_LABEL[m.kind]),
      h('span.pp', `PP ${m.pp}/${m.pp}`));
    return btn;
  });
  const wrap = [h('div.move-list', rows), detail];
  if (moves[0]) setTimeout(() => pick(moves[0], rows[0]), 0);
  return wrap;
}

// ───────── 레이드: 큰 보스를 다 같이 탭해서 쓰러뜨리기 (0013) ─────────
const isRaidQr = (q) => /^R\d{1,5}$/.test(q);
const curSpecies = (line) => { const c = owned(line); return c ? speciesOf(dexOf(line, c.stage)) : null; };
// 서버 _raid_per_tap 과 같은 식 (화면 안내용; 실제 데미지는 서버가 정함)
function estimatePerTap(line, bossId) {
  const a = curSpecies(line); const b = speciesOf(bossId);
  if (!a || !b) return 3;
  const tp = (sp) => typeOf(sp);
  const m = Number((S.catalog.typeChart || []).find((c) => c.atk === tp(a) && c.def === tp(b))?.mult || 1);
  const phys = (a.atk || 0) >= (a.spa || 0);
  const atk = lv50('atk', phys ? a.atk : a.spa); const def = lv50('def', phys ? b.def : b.spd);
  return Math.max(1, Math.round((10 * atk / Math.max(def, 1)) * m));
}
const bestLine = (bossId) => collection().filter((c) => !isWithdrawn(c.line_id))
  .map((c) => [c.line_id, estimatePerTap(c.line_id, bossId)]).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;

async function loadMyRaids() {
  S.myRaidsAt = Date.now();
  try { S.myRaids = await rpc('my_raids', {}, { retries: 0 }); if (S.tab === 'raid' && !S.overlay) renderTab(); } catch { /* offline */ }
}

function viewRaid() {
  if (S.online && (!S.myRaidsAt || Date.now() - S.myRaidsAt > 8000)) loadMyRaids();
  // 운영자가 일찍 끝낸 레이드도 금방 사라지게: 레이드 탭에서는 15초마다 새로 받음
  if (S.online && Date.now() - Math.max(new Date(S.snap.synced_at || 0), S.raidSyncTry || 0) > 15000 && !S.syncing) { S.raidSyncTry = Date.now(); setTimeout(() => sync(), 0); }
  const live = (S.snap.raids_live || []).filter((r) => new Date(r.ends_at) > Date.now());
  const mine = S.myRaids || [];
  // 남은 시간은 1초마다 다시 셈 (아래 raidClock)
  const left = (iso) => h('span', { 'data-ends': iso }, fmtWait(Math.max(0, new Date(iso) - Date.now())));
  return [
    h('div.box.stack',
      h('div.banner', h('b', pix('bolt'), ' 레이드'), live.length ? h('span.chip.hot', '보스 출현 중!') : null),
      h('p', { style: { margin: 0 } }, '대형 화면이나 운영진이 보여 주는 레이드 QR을 찍으면 참가해요. 다 같이 보스를 마구 탭해서 체력을 0으로 만들면, 열심히 싸운 모두가 그 몬스터 티켓을 받아요!'),
      h('button.btn.big.primary', { onclick: openScanner }, pix('camera'), '레이드 QR 찍기')),
    live.length > 0 && h('div.box.stack',
      h('b', '지금 대형 화면에 나타난 보스'),
      live.map((r) => h('div.raid-row', spriteCanvas(r.species_id, 56), h('div', h('b', r.title), h('small', '남은 시간 ', left(r.ends_at), ' · 메인 부스 대형 화면의 QR을 찍어요'))))),
    mine.length > 0 && h('div.box.stack',
      h('b', '내가 참가한 레이드'),
      mine.map((r) => h('button.raid-row', { onclick: () => (r.status === 'active' ? openRaid(r) : toast(r.status === 'won' ? '이긴 레이드예요! 보상 티켓은 가방에 있어요.' : '끝난 레이드예요.')) },
        spriteCanvas(r.species_id, 56),
        h('div', h('b', r.title),
          h('div.hpbar.small', h('i', { style: { width: `${(r.hp / r.hp_max) * 100}%` } })),
          h('small', r.status === 'active' ? ['남은 시간 ', left(r.ends_at), ` · 내 데미지 ${r.me?.damage || 0}`] : r.status === 'won' ? (r.me?.rewarded ? '승리! 보상 받음 ★' : '승리 (보상 조건 미달)') : '실패')),
        h(`span.chip${r.status === 'active' ? '.hot' : ''}`, r.status === 'active' ? '참가하기' : r.status === 'won' ? '승리' : '끝')))),
    h('div.box.stack',
      h('b', '시간대 전설 레이드'),
      h('div.raid-preview', [[112, '아침'], [115, '점심'], [118, '저녁']].map(([id, t]) =>
        h('div', spriteCanvas(id, 56, (owned(speciesOf(id)?.line_id) ? 'normal' : 'silhouette')), h('small', `${t} 전설`)))),
      h('small.muted', '아침·점심·저녁마다 다른 전설이 대형 화면에 나타나요. 교장·교감 선생님 레이드와 운영진 특별 레이드도 있어요.')),
  ];
}

// 레이드 탭의 남은 시간 글자를 1초마다 고침. 시간이 다 된 레이드가 있으면 목록을 새로 받아 지운다
setInterval(() => {
  let ended = false;
  document.querySelectorAll('#main [data-ends]').forEach((el) => {
    const ms = new Date(el.dataset.ends) - Date.now();
    el.textContent = fmtWait(Math.max(0, ms));
    if (ms <= 0) ended = true;
  });
  if (S.tab === 'raid' && !S.overlay && S.online && Date.now() - Math.max(new Date(S.snap?.synced_at || 0), S.raidSyncTry || 0) > 15000 && !S.syncing) { S.raidSyncTry = Date.now(); sync(); }
  if (ended && S.tab === 'raid' && !S.overlay && Date.now() - (S.raidRefreshAt || 0) > 5000) {
    S.raidRefreshAt = Date.now();
    S.myRaidsAt = 0;
    sync({ force: true });
  }
}, 1000);

async function joinRaid(q, t) {
  if (!S.online) return say('레이드는 인터넷이 필요해요. 와이파이나 데이터를 켜 주세요.', true);
  try {
    const r = await rpc('raid_join', { p_q: q, p_t: t, p_line: null }, { retries: 0 });
    sfx.scan(); vibrate(80);
    openRaid(r);
  } catch (e) { sfx.error(); say(errorText(e.message), true); }
}

function openRaid(r0) {
  if (S.overlay) closeOverlay({ replacing: true });
  unlockAudio();
  let r = r0;
  let line = r.me?.line_id || bestLine(r.species_id);
  let pending = 0;            // taps not sent yet (sent every 4 s)
  let busy = false; let over = false;
  const skew = new Date(r.server_time || Date.now()) - Date.now();
  const per = () => (r.me?.line_id === line && r.me?.per_tap) || estimatePerTap(line, r.species_id);
  const boss = spriteCanvas(r.species_id, 192);
  const bossBtn = h('button.raid-boss', { 'aria-label': '보스 공격하기 (계속 탭)' }, boss);
  const fx = h('div.raid-fx', { 'aria-hidden': 'true' });
  const hpFill = h('i'); const hpText = h('span.hp-num'); const timer = h('b.raid-timer');
  const info = h('div.raid-info');
  const pickBtn = h('button.btn.small');
  const picker = h('div.raid-pick', { hidden: true });
  const text = h('div.box.textbox', { style: { whiteSpace: 'pre-line' } });
  const draw = () => {
    const hp = r.status === 'active' ? Math.max(0, r.hp - pending * per()) : r.hp;
    const ratio = hp / r.hp_max;
    hpFill.style.width = `${ratio * 100}%`;
    hpFill.className = ratio < 0.2 ? 'red' : ratio < 0.5 ? 'yellow' : '';
    hpText.textContent = `HP ${hp.toLocaleString()} / ${r.hp_max.toLocaleString()}`;
    info.replaceChildren(h('span', `참가 ${r.players}명`), h('span', `내 데미지 ${((r.me?.damage || 0) + pending * per()).toLocaleString()}`), h('span', `탭당 ${per()}`));
    const sp = curSpecies(line);
    pickBtn.replaceChildren(...(sp ? [spriteCanvas(sp.id, 28), ` ${sp.name} ▾`] : ['내 몬스터 고르기 ▾']));
  };
  const tick = () => {
    const ms = new Date(r.ends_at) - (Date.now() + skew);
    timer.textContent = r.status === 'active' ? `⏱ ${fmtWait(Math.max(0, ms))}` : r.status === 'won' ? '격파!' : '종료';
  };
  const finish = async () => {
    if (over) return;
    over = true;
    clearInterval(S.raidTimer); clearInterval(S.raidFlush);
    bossBtn.disabled = true;
    const sp = speciesOf(r.species_id);
    if (r.status === 'won') {
      boss.classList.add('faint');
      sfx.catch(); vibrate([80, 60, 80, 60, 200]);
      await typeText(text, r.me?.rewarded
        ? `${josa(sp.name, '을', '를')} 쓰러뜨렸다!!\n★ 레이드 보상: ${sp.name} 티켓이 가방에 들어왔어요!\n메인 부스에서 몬스터로 바꿔요. (가방 칸은 안 차지해요)`
        : `${josa(sp.name, '을', '를')} 쓰러뜨렸다!\n하지만 공격이 조금 부족해서 보상은 못 받았어요. 다음엔 더 많이 탭해요!`);
      sync({ force: true });
    } else {
      sfx.fail();
      await typeText(text, `${josa(sp.name, '은', '는')} 도망가 버렸다…\n시간 안에 체력을 0으로 만들지 못했어요.`);
    }
    text.append(h('button.btn.big.primary', { style: { marginTop: '10px' }, onclick: () => closeOverlay() }, '확인'));
    loadMyRaids();
  };
  const flush = async () => {
    if (busy || over) return;
    busy = true;
    const taps = pending;
    try {
      r = await rpc(taps ? 'raid_attack' : 'raid_state', taps ? { p_raid: r.id, p_taps: taps, p_line: line } : { p_raid: r.id }, { retries: 0 });
      pending -= taps;
    } catch (e) { if (/RAID_/.test(e.message)) toast(errorText(e.message)); }
    busy = false;
    draw(); tick();
    if (r.status !== 'active') finish();
  };
  const hit = (e) => {
    e.preventDefault();
    if (over || r.status !== 'active') return;
    pending++;
    bossBtn.classList.remove('hit'); void bossBtn.offsetWidth; bossBtn.classList.add('hit');
    const n = h('span.dmg', `-${per()}`);
    n.style.left = `${20 + Math.random() * 60}%`; n.style.top = `${15 + Math.random() * 45}%`;
    fx.append(n); setTimeout(() => n.remove(), 700);
    if (pending % 4 === 1) sfx.blip();
    vibrate(12);
    draw();
  };
  bossBtn.addEventListener('pointerdown', hit);
  bossBtn.addEventListener('click', (e) => e.preventDefault());
  pickBtn.onclick = () => {
    picker.hidden = !picker.hidden;
    if (picker.hidden) return;
    const opts = collection().filter((c) => !isWithdrawn(c.line_id))
      .map((c) => [c.line_id, estimatePerTap(c.line_id, r.species_id)]).sort((a, b) => b[1] - a[1]).slice(0, 12);
    picker.replaceChildren(...(opts.length ? opts.map(([l, d]) => {
      const sp = curSpecies(l);
      return h(`button.raid-opt${l === line ? '.on' : ''}`, { onclick: () => { line = l; picker.hidden = true; draw(); sfx.select(); } },
        spriteCanvas(sp.id, 40), h('small', sp.name), h('b', `탭당 ${d}`));
    }) : [h('small', '아직 몬스터가 없어요. 몬스터가 없어도 탭당 3씩 공격할 수 있어요!')]));
  };
  const ov = overlay(h('div.raid-stage',
    h('div.raid-top', h('b', r.title), timer),
    h('div.raid-hp', h('div.hpbar', hpFill), hpText),
    h('div.raid-arena', bossBtn, fx),
    info,
    h('div.raid-ctrl', pickBtn, h('button.btn.small.ghost', { onclick: () => closeOverlay() }, '나가기')),
    picker,
    text), 'full');
  ov.classList.add('raid-overlay');
  ov.onclose = () => { over = true; clearInterval(S.raidTimer); clearInterval(S.raidFlush); if (pending) rpc('raid_attack', { p_raid: r.id, p_taps: pending, p_line: line }, { retries: 0 }).catch(() => {}); loadMyRaids(); };
  clearInterval(S.raidTimer); clearInterval(S.raidFlush);
  S.raidTimer = setInterval(tick, 1000);
  S.raidFlush = setInterval(flush, 4000);
  draw(); tick();
  const sp = speciesOf(r.species_id);
  const mine = curSpecies(line);
  const m = mine ? Number((S.catalog.typeChart || []).find((c) => c.atk === typeOf(mine) && c.def === typeOf(sp))?.mult || 1) : 1;
  typeText(text, r.status !== 'active' ? '이미 끝난 레이드예요.'
    : `앗! 레이드 보스 ${josa(sp.name, '이', '가')} 나타났다!\n보스를 마구 탭해서 공격해!${m > 1 ? '\n(내 몬스터는 이 보스에게 효과가 굉장해!)' : m < 1 ? '\n(내 몬스터는 이 보스에게 효과가 별로야… 다른 몬스터를 골라 봐)' : ''}`);
  if (r.status !== 'active') finish();
}

// ───────── 배틀 (0015·0016): 계산은 전부 서버. 폰은 고른 것만 보내고, 서버 기록(log)을 3세대 느낌으로 재생한다 ─────────
// 자리(slot) u = 쪽×2 + 자리 번호. 1 대 1 은 자리 0·2 만, 2 대 2 는 0~3 모두.
const isBattleQr = (q) => q === 'BTL';
const ST_LABEL = { par: '마비', brn: '화상', psn: '독', slp: '잠듦' };
const FMT = { single: { n: 3, label: '1 대 1', long: '1 대 1 (3마리)' }, double: { n: 4, label: '2 대 2', long: '2 대 2 (4마리)' } };
// 배경: isaiah658 의 픽셀 팩 #2 (CC0, web/img/battle/CREDITS.txt). 배틀마다 다르게
const BT_BG = ['plains', 'forest', 'beach', 'desert', 'snowy', 'underground', 'underwater'];
const moveOf = (id) => (S.catalog.moves || []).find((m) => m.id === id);
const BT_WHY = {
  practice: '연습 배틀이라 보상은 없어요.',
  same_opp: '같은 친구에게는 하루 한 번만 보상이 있어요.',
  daily_max: '오늘 받을 수 있는 배틀 보상은 다 받았어요.',
};

// 내 배틀 팀 = 저장한 팀 (아직 가지고 있는 것만), 없으면 가장 높은 단계부터. n = 3 (1 대 1) / 4 (2 대 2)
function myTeam(n = 3) {
  const mine = collection().filter((c) => !isWithdrawn(c.line_id));
  const have = new Set(mine.map((c) => c.line_id));
  const saved = (S.btTeam || []).filter((l) => have.has(l));
  const rest = [...mine].sort((a, b) => b.stage - a.stage || b.catch_count - a.catch_count).map((c) => c.line_id).filter((l) => !saved.includes(l));
  return [...saved, ...rest].slice(0, n);
}

async function loadBattleToday() {
  S.btTodayAt = Date.now();
  try {
    S.btToday = await rpc('battle_today', {}, { retries: 0 });
    if (!S.btTeam && S.btToday?.team) S.btTeam = S.btToday.team;
    if (S.tab === 'battle' && !S.overlay) renderTab();
  } catch { /* offline */ }
}

// "배틀 신청!" 확인: 홈·배틀 탭을 보고 있을 때만 15초마다 (서버 부담 줄이기)
async function pollInbox(force = false) {
  if (document.hidden || !$('nav.tabs') || !S.online || !S.snap) return;
  if (!force && !['home', 'battle'].includes(S.tab)) return;
  if (S.overlay?.classList.contains('battle-overlay')) return;
  try {
    const box = await rpc('battle_inbox', {}, { retries: 0 });
    const before = JSON.stringify(S.btInbox || null);
    S.btInbox = box;
    const fresh = (box.invites || []).filter((i) => !S.btSeen.has(i.id));
    fresh.forEach((i) => S.btSeen.add(i.id));
    if (fresh.length) {
      sfx.scan(); vibrate([60, 40, 60]);
      if (!S.overlay) inviteSheet(fresh[0]); else toast(`⚔ ${josa(fresh[0].from, '이', '가')} 배틀을 신청했어요!`);
    }
    if (before !== JSON.stringify(box) && ['home', 'battle'].includes(S.tab) && !S.overlay) renderTab();
  } catch { /* offline */ }
}
setInterval(pollInbox, 15000);

const livePvp = () => S.btInbox?.active?.mode === 'pvp' && S.btInbox.active.status === 'active' ? S.btInbox.active : null;

function teamStrip(team, size = 56) {
  return team.length
    ? h('div.bt-team', team.map((l) => {
      const sp = curSpecies(l);
      return h('div', spriteCanvas(sp.id, size), h('small', sp.name), h(`span.type.t-${typeOf(sp)}`, typeOf(sp)));
    }))
    : h('p', '아직 몬스터가 없어요. QR을 찍어 몬스터를 먼저 모아요!');
}

function fmtSeg(cur, onpick) {
  return h('div.seg.bt-fmt', { role: 'group', 'aria-label': '배틀 형식' }, Object.entries(FMT).map(([k, f]) =>
    h('button', { 'aria-pressed': String(cur === k), onclick: () => { sfx.blip(); onpick(k); } }, f.long)));
}

function typeTable() {
  const T = ['국어', '수학', '영어', '물리', '화학', '생명', '지구', '지리', '정치경제', '윤리', '역사', '외국어', '정보', '체육', '음악'];
  const chart = S.catalog.typeChart || [];
  const m = (a, d) => Number(chart.find((c) => c.atk === a && c.def === d)?.mult ?? 1);
  const cell = (v) => (v === 2 ? h('td.x2', '2') : v === 0.5 ? h('td.xh', '½') : v === 0 ? h('td.x0', '0') : h('td', ''));
  const short = (t) => ({ 정치경제: '정경' }[t] || t);
  return [
    h('small', '왼쪽 = 공격하는 기술의 타입, 위 = 맞는 몬스터의 타입. 2 = 효과가 굉장했다 · ½ = 별로인 듯하다 · 0 = 효과가 없다'),
    h('div.type-table-wrap', h('table.type-table',
      h('thead', h('tr', h('th', ''), T.map((d) => h(`th.t-${d}`, short(d))))),
      h('tbody', T.map((a) => h('tr', h(`th.t-${a}`, short(a)), T.map((d) => cell(m(a, d)))))))),
    h('small.muted', '전설은 모두에게 보통이고, 전설끼리만 효과가 굉장해요. 효과 없음: 정치경제→음악, 역사→정보, 체육→수학.'),
  ];
}

function viewBattle() {
  if (S.online && (!S.btTodayAt || Date.now() - S.btTodayAt > 15000)) { loadBattleToday(); pollInbox(true); }
  S.btFmt ||= 'single';
  const team = myTeam(FMT[S.btFmt].n);
  const today = S.btToday;
  const act = S.btInbox?.active;
  const pvp = livePvp();
  const invites = S.btInbox?.invites || [];
  return [
    h('div.box.stack',
      h('div.banner', h('b', pix('spark'), ' 배틀'), today ? h('span.chip', `오늘 보상 ${today.wins}/${today.max}`) : null),
      h('p', { style: { margin: 0 } }, '내 몬스터로 겨뤄요. 친구를 이기면 진화권 1장! (하루 3번 · 같은 친구는 하루 1번)'),
      act && h('button.btn.big.gold', { onclick: () => resumeBattle(act.id) }, pix('spark'),
        act.status === 'invite' ? '보낸 배틀 신청 보기' : pvp ? '하던 실시간 배틀 이어 하기' : '하던 배틀 이어 하기'),
      pvp && h('small.warn-txt', '실시간 배틀이 끝나기 전에는 다른 배틀을 시작할 수 없어요. (그만두려면 배틀 화면에서 기권)'),
      invites.map((inv) => h('div.bt-invite', h('b', `${josa(inv.from, '이', '가')} ${FMT[inv.format]?.label || ''} 배틀 신청!`),
        h('button.btn.small.primary', { onclick: () => acceptInvite(inv) }, '수락'),
        h('button.btn.small', { onclick: () => declineInvite(inv) }, '거절')))),
    h('div.box.stack',
      h('div.banner', h('b', '내 배틀 팀'), h('button.btn.small', { onclick: teamPicker, disabled: !collection().length }, '팀 바꾸기')),
      fmtSeg(S.btFmt, (k) => { S.btFmt = k; renderTab(); }),
      teamStrip(team),
      h('button.btn.big.primary', { disabled: !team.length || !!pvp, onclick: () => startBattle('cpu', null, S.btFmt) }, pix('spark'), `연습 배틀 · ${FMT[S.btFmt].label} (보상 없음)`),
      h('button.btn.big', { disabled: !team.length || !!pvp, onclick: openScanner }, pix('camera'), '친구 배틀 QR 찍기'),
      h('button.btn.big', { onclick: showBattleQr }, '내 배틀 QR 보여주기'),
      h('small.muted', '친구가 내 QR을 찍으면 실시간 배틀을 신청하거나, 내 팀을 AI가 조종하는 배틀을 할 수 있어요. 1 대 1인지 2 대 2인지는 QR을 보여주는 사람이 정해요.')),
    h('details.box.stack', h('summary', h('b', '타입 상성표')), typeTable()),
  ];
}

function teamPicker() {
  sfx.select();
  let sel = myTeam(4).filter((l) => (S.btTeam || []).includes(l));
  if (!sel.length) sel = myTeam(4);
  const grid = h('div.bt-pick');
  const draw = () => grid.replaceChildren(...collection().filter((c) => !isWithdrawn(c.line_id))
    .sort((a, b) => b.stage - a.stage || a.line_id - b.line_id).map((c) => {
      const sp = curSpecies(c.line_id); const n = sel.indexOf(c.line_id);
      return h(`button.bt-opt${n >= 0 ? '.on' : ''}`, {
        onclick: () => {
          sfx.blip();
          sel = n >= 0 ? sel.filter((x) => x !== c.line_id) : sel.length < 4 ? [...sel, c.line_id] : sel;
          draw();
        },
      }, n >= 0 ? h('span.bt-num', String(n + 1)) : null, spriteCanvas(sp.id, 48), h('small', sp.name));
    }));
  draw();
  const err = h('div.err');
  sheet(h('div.stack',
    h('b', '배틀 팀 고르기 (누른 순서대로 나가요)'),
    h('small', '1~3번 = 1 대 1 팀 · 1~4번 = 2 대 2 팀'),
    grid, err,
    h('button.btn.big.primary', {
      onclick: async () => {
        if (!sel.length) { err.textContent = '1마리 이상 골라 주세요.'; return; }
        try {
          await rpc('battle_set_team', { p_lines: sel }, { retries: 0 });
          S.btTeam = sel; closeOverlay(); renderTab(); toast('배틀 팀을 저장했어요!');
        } catch (e) { err.textContent = errorText(e.message); }
      },
    }, '저장'),
    h('button.btn', { onclick: () => closeOverlay() }, '닫기')));
}

async function showBattleQr() {
  sfx.select();
  let code = S.btToday?.code; let fmt = S.btToday?.format || 'single';
  try { if (!code) code = await rpc('battle_code', {}, { retries: 0 }); } catch (e) { return say(errorText(e.message), true); }
  if (S.btToday) S.btToday.code = code;
  const canvas = h('canvas', { 'aria-label': '내 배틀 QR' });
  drawQR(canvas, `BTL.${code.toUpperCase()}`, { cell: 6, margin: 4, ecc: 'L' });
  const segBox = h('div'); const teamBox = h('div');
  const draw = () => {
    segBox.replaceChildren(fmtSeg(fmt, async (k) => {
      try { await rpc('battle_code', { p_format: k }, { retries: 0 }); fmt = k; if (S.btToday) S.btToday.format = k; draw(); }
      catch (e) { toast(errorText(e.message)); }
    }));
    teamBox.replaceChildren(teamStrip(myTeam(FMT[fmt].n), 44));
  };
  draw();
  sheet(h('div.stack',
    h('div.bagqr', h('b', '내 배틀 QR'), canvas, h('small', '친구가 이 QR을 찍으면 나와 배틀할 수 있어요.')),
    h('b', '어떤 배틀을 할까? (친구는 이 형식으로 싸워요)'), segBox,
    h('b', '내 배틀 팀'), teamBox,
    h('button.btn', { onclick: () => closeOverlay() }, '닫기')));
}

async function friendBattleSheet(code) {
  if (!collection().length) return say('배틀하려면 먼저 몬스터를 모아요!', true);
  if (!S.online) return say('배틀은 인터넷이 필요해요. 와이파이나 데이터를 켜 주세요.', true);
  let pk;
  try { pk = await rpc('battle_peek', { p_code: code }, { retries: 0 }); } catch (e) { sfx.error(); return say(errorText(e.message), true); }
  const f = FMT[pk.format] || FMT.single;
  sfx.scan(); vibrate(80);
  sheet(h('div.stack',
    h('b', pix('spark'), ` ${josa(pk.name, '의', '의').slice(0, -1)}의 배틀 QR!`),
    h('p', { style: { margin: 0 } }, h('b', f.long), ' 배틀이에요. 내 배틀 팀으로 어떻게 겨룰까요?'),
    teamStrip(myTeam(f.n), 44),
    h('button.btn.big.primary', { onclick: () => startBattle('pvp', code) }, '실시간 배틀 신청 (친구가 수락하면 시작)'),
    h('button.btn.big', { onclick: () => startBattle('team', code) }, '친구 팀과 AI 배틀 (바로 시작)'),
    h('small.muted', '이기면 진화권 1장 (하루 3번 · 같은 친구는 하루 1번)'),
    h('button.btn', { onclick: () => closeOverlay() }, '닫기')));
  S.btPeekFmt = pk.format;
}

function inviteSheet(inv) {
  const f = FMT[inv.format] || FMT.single;
  sheet(h('div.stack',
    h('b.bt-alert', pix('spark'), ' 배틀 신청!'),
    h('p', { style: { margin: 0 } }, `${josa(inv.from, '이', '가')} ${f.long} 실시간 배틀을 신청했어요. 1분 안에 수락해야 시작돼요.`),
    teamStrip(myTeam(f.n), 44),
    h('button.btn.big.primary', { onclick: () => acceptInvite(inv), disabled: !collection().length }, '수락하고 배틀!'),
    h('button.btn', { onclick: () => declineInvite(inv) }, '거절')));
}

async function acceptInvite(inv) {
  try { openBattle(await rpc('battle_accept', { p_id: inv.id, p_lines: myTeam((FMT[inv.format] || FMT.single).n) }, { retries: 0 })); }
  catch (e) { sfx.error(); say(errorText(e.message), true); pollInbox(true); }
}
async function declineInvite(inv) {
  try { await rpc('battle_decline', { p_id: inv.id }, { retries: 0 }); } catch { /* ignore */ }
  if (S.overlay) closeOverlay();
  if (S.btInbox) S.btInbox.invites = (S.btInbox.invites || []).filter((x) => x.id !== inv.id);
  renderTab();
}

async function startBattle(mode, code, fmt) {
  const n = FMT[mode === 'cpu' ? fmt : S.btPeekFmt || 'single']?.n || 3;
  const team = myTeam(n);
  if (!team.length) return say('배틀하려면 먼저 몬스터를 모아요!', true);
  if (!S.online) return say('배틀은 인터넷이 필요해요. 와이파이나 데이터를 켜 주세요.', true);
  try {
    const args = mode === 'cpu' ? { p_lines: team, p_format: fmt } : { p_code: code, p_lines: team };
    openBattle(await rpc({ cpu: 'battle_start_cpu', team: 'battle_start_team', pvp: 'battle_challenge' }[mode], args, { retries: 0 }));
  } catch (e) { sfx.error(); say(errorText(e.message), true); if (e.message === 'IN_PVP_BATTLE') pollInbox(true); }
}

async function resumeBattle(id) {
  try { openBattle(await rpc('battle_state', { p_id: id }, { retries: 0 })); } catch (e) { say(errorText(e.message), true); }
}

// 몬스터볼 (도트): 위 빨강 · 가운데 검은 띠 · 아래 하양
const BALL_SVG = '<svg viewBox="0 0 8 8" width="16" height="16" shape-rendering="crispEdges"><path fill="#182030" d="M2 0h4v1h1v1h1v4h-1v1h-1v1h-4v-1h-1v-1h-1v-4h1v-1h1z"/><path fill="#f04830" d="M2 1h4v1h1v2h-6v-2h1z"/><path fill="#fff" d="M1 5h6v1h-1v1h-4v-1h-1z"/><path fill="#fff" d="M3 3h2v2h-2z"/><path fill="#182030" d="M3.5 3.5h1v1h-1z"/></svg>';

function openBattle(b0) {
  unlockAudio();
  let b = b0;
  let shownSeq = b.status === 'active' && b.seq === 0 ? -1 : b.seq;   // -1 → 첫 화면에 등장 연출
  let playing = false; let busy = false; let closed = false; let finished = false;
  let menu = { mode: 'main', k: 0, picks: [] };   // 2 대 2: 자리마다 차례로 고름
  const skew = new Date(b.server_time || Date.now()) - Date.now();
  const me = () => b.me; const fo = () => 1 - b.me;
  const dbl = b.format === 'double';
  // 자리 u → 화면 요소 (u 는 서버 기준. 화면 위치는 내 쪽/상대 쪽으로 바꿔서)
  const mk = (u) => {
    const bob = h('div.bt-bob'); const fx = h('div.bt-fx');
    return {
      spr: h('div.bt-spr', bob, fx), bob, fx,
      name: h('b'), st: h('span.bt-st'), hp: h('i'), hpNum: h('small.bt-hpnum'), balls: h('div.bt-balls'), box: null, u,
    };
  };
  const SL = [0, 1, 2, 3].map(mk);
  for (const x of SL) {
    const mine = (x.u >> 1) === me();
    x.box = h(`div.bt-box${mine ? '.me' : '.foe'}`, h('div.bt-nm', x.name, h('small', ' Lv50'), x.st), h('div.hpbar', x.hp),
      mine ? h('div.bt-row', x.balls, x.hpNum) : x.balls);
    x.spr.classList.add(mine ? 'me' : 'foe', `k${x.u & 1}`);
    x.box.classList.add(`k${x.u & 1}`);
    x.spr.addEventListener('animationend', (e) => { if (!['bt-faint'].includes(e.animationName)) x.spr.classList.remove('enter', 'atk', 'hit'); });
  }
  const view = { act: [null, null, null, null], hp: [0, 0, 0, 0] };
  const el = { text: h('div.bt-text'), arrow: h('i.bt-arrow'), menu: h('div.bt-menu'), timer: h('span.bt-timer'), field: null };
  const foeName = () => (b.mode === 'cpu' ? '연습 상대' : b.names?.[fo()] || '상대');
  const tok = (s) => s.replace(/@([01])/g, (_, x) => (Number(x) === me() ? '' : '상대 '));
  const side = (s) => b.sides?.[s];
  const nAct = (s) => side(s)?.act?.length || 0;
  const monAt = (s, i) => side(s)?.mons?.[i];
  const bump = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
  const say2 = async (text, hold = 520) => {
    el.arrow.hidden = true;
    await typeText(el.text, text, 55);
    el.arrow.hidden = false;
    await sleep(reducedMotion() ? 120 : hold);
    el.arrow.hidden = true;
  };

  const setHp = (u, hp, max) => {
    view.hp[u] = hp;
    const s = u >> 1;
    const m = max || monAt(s, view.act[u])?.max || 1;
    const r = Math.max(0, hp) / m;
    SL[u].hp.style.width = `${r * 100}%`;
    SL[u].hp.className = r < 0.2 ? 'red' : r < 0.5 ? 'yellow' : '';
    if (s === me()) SL[u].hpNum.textContent = `${Math.max(0, hp)}/${m}`;
  };
  const showMon = (u, idx, { hp, sp, name, max } = {}) => {
    view.act[u] = idx;
    const s = u >> 1; const m = monAt(s, idx) || {};
    const x = SL[u];
    const spId = sp ?? m.sp;
    x.spr.classList.remove('faint', 'hit', 'atk', 'gone');
    if (spId && x.bob.dataset.sp !== String(spId)) { x.bob.dataset.sp = spId; x.bob.replaceChildren(spriteCanvas(spId, 128)); }
    x.name.textContent = name || m.name || '???';
    setHp(u, hp ?? m.hp ?? 0, max ?? m.max);
  };
  const drawStatic = () => {
    if (!b.sides?.length) return;
    for (const x of SL) {
      const s = x.u >> 1; const k = x.u & 1;
      const on = k < nAct(s);
      x.spr.hidden = !on; x.box.hidden = !on;
      if (!on) continue;
      const idx = side(s).act[k];
      const m = monAt(s, idx);
      showMon(x.u, idx);
      if (m && m.hp <= 0) x.spr.classList.add('gone');
      const st = m?.st ? ST_LABEL[m.st] : '';
      x.st.textContent = st; x.st.className = `bt-st${st ? ' st-' + m.st : ''}`;
      x.balls.replaceChildren(...(k === 0 ? side(s).mons.map((y) => h(`i${y.hp > 0 ? '' : '.out'}`)) : []));
    }
  };

  // 몬스터볼을 던져서 자리 u 에 몬스터가 나온다
  const throwBall = async (u) => {
    const x = SL[u]; const mine = (u >> 1) === me();
    const f = el.field.getBoundingClientRect(); const t = x.spr.getBoundingClientRect();
    const tx = t.left + t.width / 2 - f.left - 8; const ty = t.bottom - f.top - 18;
    const sx = mine ? -20 : f.width + 4; const sy = mine ? f.height * 0.75 : f.height * 0.05;
    x.spr.classList.add('hide');
    const ball = h('div.bt-ball', { html: BALL_SVG });
    el.field.append(ball);
    sfx.ballThrow();
    if (!reducedMotion() && ball.animate) {
      await ball.animate([
        { transform: `translate(${sx}px, ${sy}px) rotate(0deg)` },
        { transform: `translate(${(sx + tx) / 2}px, ${Math.min(sy, ty) - f.height * 0.28}px) rotate(360deg)`, offset: 0.5 },
        { transform: `translate(${tx}px, ${ty}px) rotate(720deg)` },
      ], { duration: 520, easing: 'linear', fill: 'forwards' }).finished.catch(() => {});
    }
    ball.remove();
    const flash = h('div.bt-flash'); flash.style.left = `${tx + 8}px`; flash.style.top = `${ty + 8}px`;
    el.field.append(flash); setTimeout(() => flash.remove(), 450);
    sfx.ballPop();
    x.spr.classList.remove('hide'); bump(x.spr, 'enter');
    await sleep(reducedMotion() ? 50 : 380);
  };

  // 능력 변화: 올라가면 빨간 줄이 위로, 내려가면 아래로 + 효과음
  const statFx = (u, dir) => {
    const x = SL[u];
    x.fx.className = `bt-fx ${dir > 0 ? 'up' : 'down'}`; void x.fx.offsetWidth; x.fx.classList.add('run');
    (dir > 0 ? sfx.statUp : sfx.statDown)();
  };

  const play = async (log, prev) => {
    playing = true; el.menu.replaceChildren();
    for (const e of log || []) {
      if (closed) return;
      const mineSide = (u) => (u >> 1) === me();
      if (e.back != null) {
        await say2(mineSide(e.back) ? `${e.name}, 돌아와!` : `${josa(foeName(), '은', '는')} ${josa(e.name, '을', '를')} 들여보냈다!`, 300);
        SL[e.back].spr.classList.add('hide');
        continue;
      }
      if (e.sw) {
        const [u, i] = e.sw;
        showMon(u, i, { hp: prev?.sides?.[u >> 1]?.mons?.[i]?.hp, sp: e.sp, name: e.name, max: prev?.sides?.[u >> 1]?.mons?.[i]?.max });
        await say2(mineSide(u) ? `가랏! ${e.name}!` : `${josa(foeName(), '은', '는')} ${josa(e.name, '을', '를')} 내보냈다!`, 100);
        await throwBall(u);
        continue;
      }
      if (e.use) bump(SL[e.use[0]].spr, 'atk');
      if (e.hp) {
        const [u, v] = e.hp;
        if (v < view.hp[u]) { bump(SL[u].spr, 'hit'); sfx.hit(); vibrate(25); }
        setHp(u, v);
      }
      if (e.st && Array.isArray(e.st)) {
        const [u, st] = e.st; const lbl = st ? ST_LABEL[st] : '';
        SL[u].st.textContent = lbl; SL[u].st.className = `bt-st${lbl ? ' st-' + st : ''}`;
      }
      if (e.stat) statFx(e.stat[0], e.stat[1]);
      if (e.faint != null) { SL[e.faint].spr.classList.add('faint'); sfx.faint(); }
      if (e.m) await say2(tok(e.m));
      else await sleep(reducedMotion() ? 60 : 320);
    }
    playing = false;
  };

  const finish = async () => {
    if (finished) return;
    finished = true;
    clearInterval(S.btPoll);
    stopBgm();
    const won = b.winner === me(); const rw = b.reward || {};
    if (won) { sfx.catch(); vibrate([80, 60, 200]); } else sfx.fail();
    if (b.winner == null) await say2('무승부!');
    else if (won) {
      await say2(`${josa(foeName(), '과', '와')}의 승부에서 이겼다!`);
      if (rw.ticket) await say2(`★ 진화권 1장을 받았다! (오늘 ${rw.today}/${S.btToday?.max || 3})`);
      else if (BT_WHY[rw.why]) await say2(BT_WHY[rw.why]);
    } else {
      await say2('나에게는 싸울 수 있는 몬스터가 없다!');
      await say2('눈앞이 캄캄해졌다!');
    }
    el.menu.replaceChildren(h('button.btn.big.primary', { onclick: () => closeOverlay() }, '확인'));
    sync({ force: true }); loadBattleToday();
  };

  // ── 메뉴 ──
  const mySlots = () => [0, 1].slice(0, nAct(me())).map((k) => ({ k, u: me() * 2 + k, m: monAt(me(), side(me()).act[k]) }));
  const liveFoes = () => [0, 1].slice(0, nAct(fo())).filter((k) => (monAt(fo(), side(fo()).act[k])?.hp || 0) > 0);
  const nextPick = () => {
    // 다음으로 고를 자리 (쓰러진 자리는 건너뜀). 다 골랐으면 보냄
    const slots = mySlots();
    let k = menu.k + 1;
    while (k < slots.length && !(slots[k].m?.hp > 0)) { menu.picks[k] = null; k++; }
    if (k >= slots.length) return send(slots.length > 1 ? { slots: menu.picks } : menu.picks[0]);
    menu = { ...menu, mode: 'main', k };
    renderMenu();
  };
  const choose = (action) => { menu.picks[menu.k] = action; sfx.select(); nextPick(); };
  const back = () => {
    sfx.blip();
    if (menu.mode !== 'main') { menu.mode = 'main'; return renderMenu(); }
    // 2 대 2: 앞 자리로 돌아가기
    let k = menu.k - 1;
    while (k >= 0 && !(mySlots()[k].m?.hp > 0)) k--;
    if (k >= 0) { menu = { ...menu, k, mode: 'main' }; renderMenu(); }
  };
  const startPicks = () => {
    const slots = mySlots();
    let k = 0; while (k < slots.length && !(slots[k].m?.hp > 0)) k++;
    menu = { mode: 'main', k, picks: slots.map(() => null) };
  };

  const renderMenu = () => {
    if (playing || closed || finished) return;
    if (b.status === 'invite') {
      el.text.textContent = `${foeName()}의 수락을 기다리는 중…\n(1분 안에 수락하지 않으면 취소돼요)`;
      el.menu.replaceChildren(h('button.btn', { onclick: async () => { try { await rpc('battle_forfeit', { p_id: b.id }, { retries: 0 }); } catch { /* */ } closeOverlay(); pollInbox(true); } }, '신청 취소'));
      return;
    }
    if (b.status === 'declined' || b.status === 'cancelled') {
      el.text.textContent = b.status === 'declined' ? `${josa(foeName(), '이', '가')} 배틀을 거절했어요.` : '배틀 신청이 취소됐어요. (시간이 지났거나 취소함)';
      el.menu.replaceChildren(h('button.btn.big', { onclick: () => closeOverlay() }, '닫기'));
      clearInterval(S.btPoll);
      return;
    }
    if (b.status !== 'active' || !side(me())) return;
    if (b.chosen) { el.text.textContent = '상대가 고르기를 기다리는 중…'; el.menu.replaceChildren(); return; }
    if (b.phase === 'replace' && !b.need) { el.text.textContent = '상대가 다음 몬스터를 고르는 중…'; el.menu.replaceChildren(); return; }
    const mine = side(me());
    const slots = mySlots();

    // 쓰러진 자리에 내보낼 몬스터 고르기 (2 대 2 는 자리마다)
    if (b.need) {
      const needK = b.need_slots || [0];
      const k = needK.find((x) => !menu.picks[x]);
      if (k == null) return;
      const used = Object.values(menu.picks).filter(Boolean).map((p) => p.switch);
      el.text.textContent = needK.length > 1 ? `${k === 0 ? '왼쪽' : '오른쪽'} 자리에 누구를 내보낼까?` : '다음 몬스터를 골라 주세요!';
      el.menu.replaceChildren(partyList(mine, (i) => !mine.act.includes(i) && !used.includes(i), (i) => {
        menu.picks[k] = { switch: i };
        const rest = needK.filter((x) => !menu.picks[x]);
        if (rest.length && mine.mons.some((y, j) => y.hp > 0 && !mine.act.includes(j) && ![...used, i].includes(j))) return renderMenu();
        send(slots.length > 1 ? { slots: slots.map((s) => menu.picks[s.k] || null) } : menu.picks[k]);
      }));
      return;
    }

    const cur = slots[menu.k]?.m;
    if (!cur) return;
    const who = slots.length > 1 ? `${menu.k === 0 ? '(왼쪽) ' : '(오른쪽) '}` : '';
    if (menu.mode === 'fight') {
      const all0 = cur.moves.every((x) => x.pp <= 0);
      el.menu.replaceChildren(h('div.bt-moves', cur.moves.map((x, i) => {
        const mv = moveOf(x.id) || {};
        return h('button.bt-move', {
          disabled: x.pp <= 0 && !all0,
          onclick: () => {
            const foes = liveFoes();
            const targets = mv.kind === 'attack' || mv.effect?.foe_status || mv.effect?.foe;
            if (targets && foes.length > 1) { menu.mode = 'target'; menu.move = i + 1; return renderMenu(); }
            choose({ move: i + 1, target: foes[0] ?? 0 });
          },
        }, h('b', mv.name || '?'), h('span.bt-mv-info', h(`span.type.t-${mv.type}`, mv.type), h('small', `PP ${x.pp}/${mv.pp}`)));
      })), h('button.btn.small', { onclick: back }, '◀ 뒤로'));
      el.text.textContent = all0 ? 'PP가 다 떨어졌다! 아무 기술이나 누르면 발버둥을 쓴다.' : `${who}어떤 기술을 쓸까?`;
      return;
    }
    if (menu.mode === 'target') {
      el.menu.replaceChildren(h('div.bt-moves', liveFoes().map((k) => {
        const m = monAt(fo(), side(fo()).act[k]);
        return h('button.bt-move.bt-target', { onclick: () => choose({ move: menu.move, target: k }) },
          h('span.bt-tgt', spriteCanvas(m.sp, 32), h('b', m.name)), h('small', `상대 ${k === 0 ? '왼쪽' : '오른쪽'}`));
      })), h('button.btn.small', { onclick: back }, '◀ 뒤로'));
      el.text.textContent = '누구를 공격할까?';
      return;
    }
    if (menu.mode === 'switch') {
      const used = menu.picks.filter(Boolean).map((p) => p.switch).filter((x) => x != null);
      el.menu.replaceChildren(partyList(mine, (i) => !mine.act.includes(i) && !used.includes(i), (i) => choose({ switch: i })),
        h('button.btn.small', { onclick: back }, '◀ 뒤로'));
      el.text.textContent = `${who}누구로 바꿀까?`;
      return;
    }
    el.text.textContent = `${who}${josa(cur.name, '은', '는')} 무엇을 할까?`;
    el.menu.replaceChildren(h('div.bt-main',
      h('button.bt-cmd.fight', { onclick: () => { sfx.blip(); menu.mode = 'fight'; renderMenu(); } }, '싸운다'),
      h('button.bt-cmd', { onclick: () => { sfx.blip(); menu.mode = 'switch'; renderMenu(); } }, '몬스터'),
      menu.k > 0 && slots.slice(0, menu.k).some((s) => s.m?.hp > 0)
        ? h('button.bt-cmd', { onclick: back }, '◀ 앞 자리')
        : h('button.bt-cmd', { onclick: giveUp }, b.mode === 'pvp' ? '기권' : '도망'),
      h('button.bt-cmd', { onclick: () => { sfx.blip(); closeOverlay(); } }, b.mode === 'pvp' ? '잠시 나가기' : '나중에')));
  };
  const partyList = (mine, ok, pick) => h('div.bt-party', mine.mons.map((x, i) => h('button.bt-pmon', {
    disabled: x.hp <= 0 || !ok(i), onclick: () => pick(i),
  }, spriteCanvas(x.sp, 40), h('span', h('b', x.name), h('div.hpbar.small', h('i', { style: { width: `${(x.hp / x.max) * 100}%` }, class: x.hp / x.max < 0.2 ? 'red' : x.hp / x.max < 0.5 ? 'yellow' : '' })),
    h('small', x.hp > 0 ? `${x.hp}/${x.max}${x.st ? ' · ' + ST_LABEL[x.st] : ''}${mine.act.includes(i) ? ' · 싸우는 중' : ''}` : '기절')))));

  const apply = async (nb) => {
    if (!nb || closed) return;
    const prev = b; b = nb;
    if (b.seq !== shownSeq && b.seq > 0) { shownSeq = b.seq; await play(b.log, prev); }
    drawStatic();
    if (!b.chosen) startPicks();
    renderMenu();
    if (b.status === 'over') finish();
  };
  const send = async (action) => {
    if (busy || playing) return;
    busy = true; sfx.select(); el.menu.replaceChildren();
    try { await apply(await rpc('battle_act', { p_id: b.id, p_action: action }, { retries: 0 })); }
    catch (e) { toast(errorText(e.message)); try { await apply(await rpc('battle_state', { p_id: b.id }, { retries: 0 })); } catch { /* */ } }
    busy = false; renderMenu();
  };
  const giveUp = () => {
    sfx.blip();
    el.text.textContent = b.mode === 'pvp' ? '정말 기권할까? (상대가 이긴 것이 돼요)' : '정말 도망칠까? (진 것이 돼요)';
    el.menu.replaceChildren(h('div.bt-main',
      h('button.bt-cmd', { onclick: async () => { busy = true; try { await apply(await rpc('battle_forfeit', { p_id: b.id }, { retries: 0 })); } catch (e) { toast(errorText(e.message)); } busy = false; } }, '네'),
      h('button.bt-cmd', { onclick: () => { menu.mode = 'main'; renderMenu(); } }, '아니요')));
  };
  const tick = () => {
    if (b.mode !== 'pvp' || b.status !== 'active' || !b.deadline) { el.timer.textContent = ''; return; }
    const s = Math.max(0, Math.ceil((new Date(b.deadline) - (Date.now() + skew)) / 1000));
    el.timer.textContent = `⏱ ${s}초`;
    el.timer.classList.toggle('hot', s <= 10);
  };

  const modeLabel = `${{ cpu: '연습 배틀', team: '친구 팀 (AI)', pvp: '실시간 배틀' }[b.mode]} · ${FMT[b.format]?.label || '1 대 1'}`;
  const pads = h('div.bt-layer');
  el.field = h(`div.bt-field.bg-${BT_BG[b.id % BT_BG.length]}${dbl ? '.dbl' : ''}`,
    pads, ...SL.map((x) => x.spr),
    h('div.bt-boxes.foe', SL.filter((x) => (x.u >> 1) === fo()).map((x) => x.box)),
    h('div.bt-boxes.me', SL.filter((x) => (x.u >> 1) === me()).map((x) => x.box)));
  const ov = overlay(h('div.bt-stage',
    h('div.bt-top', h('b', modeLabel), el.timer),
    el.field,
    h('div.bt-textbox', el.text, el.arrow), el.menu), 'full');
  ov.classList.add('battle-overlay');
  el.arrow.hidden = true;
  ov.onclose = () => { closed = true; stopBgm(); clearInterval(S.btPoll); clearInterval(S.btTick); pollInbox(true); };
  clearInterval(S.btPoll); clearInterval(S.btTick);
  // 실시간 대전·신청 대기 중에는 2초마다 상태 확인 (턴이 풀렸는지, 수락했는지)
  S.btPoll = setInterval(async () => {
    if (playing || busy || closed || b.mode !== 'pvp') return;
    if (['over', 'declined', 'cancelled'].includes(b.status)) return;
    try { await apply(await rpc('battle_state', { p_id: b.id }, { retries: 0 })); } catch { /* offline: try again */ }
  }, 2000);
  S.btTick = setInterval(tick, 500);
  drawStatic(); tick();
  if (b.status === 'active' || b.status === 'over') startBgm();
  if (b.status === 'active' && shownSeq === -1) {
    shownSeq = b.seq;
    (async () => {
      playing = true;
      SL.forEach((x) => x.spr.classList.add('hide'));
      await sleep(250);
      const foeSlots = SL.filter((x) => (x.u >> 1) === fo() && !x.spr.hidden);
      const mySlotsEl = SL.filter((x) => (x.u >> 1) === me() && !x.spr.hidden);
      const names = (xs) => xs.map((x) => x.name.textContent);
      const join = (ns) => (ns.length > 1 ? `${josa(ns[0], '과', '와')} ${ns[1]}` : ns[0]);
      await say2(`${josa(foeName(), '이', '가')} 승부를 걸어왔다!`, 450);
      await say2(`${josa(foeName(), '은', '는')} ${josa(join(names(foeSlots)), '을', '를')} 내보냈다!`, 100);
      for (const x of foeSlots) await throwBall(x.u);
      await say2(`가랏! ${join(names(mySlotsEl))}!`, 100);
      for (const x of mySlotsEl) await throwBall(x.u);
      playing = false; startPicks(); renderMenu();
    })();
  } else {
    startPicks(); renderMenu();
    if (b.status === 'over') { finished = true; el.text.textContent = b.winner === me() ? '이긴 배틀이에요.' : '끝난 배틀이에요.'; el.menu.replaceChildren(h('button.btn.big', { onclick: () => closeOverlay() }, '닫기')); stopBgm(); }
  }
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
  if (res.success) maybeDexComplete();
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

// 랭킹 3가지: 도감 / 점수 / 배틀 승리 × 전체 / 우리 기수
const RANK_KINDS = [['dex', '도감'], ['score', '점수'], ['battle', '배틀']];
async function loadRanking() {
  S.rankKind ||= 'score';
  const scope = `${S.rankKind}:${S.rankScope}`;
  const key = 'rank:' + scope;
  S.rank[scope] ||= await kv.get(key);
  if (S.tab === 'rank') renderTab();
  try {
    const data = await rpc('get_ranking_by', { p_gen: S.rankScope === 'gen' ? S.snap.profile.gen : null, p_kind: S.rankKind }, { retries: 0 });
    S.rank[scope] = data;
    await kv.set(key, data);
    S.online = true;
  } catch (e) { if (e.offline) S.online = false; }
  if (S.tab === 'rank') renderTab();
}

function viewRank() {
  S.rankKind ||= 'score';
  const r = S.rank[`${S.rankKind}:${S.rankScope}`];
  const p = S.snap.profile;
  const unit = { dex: (t) => `도감 ${t.value}`, score: (t) => `${t.value}점`, battle: (t) => `${t.value}승` }[S.rankKind];
  const sub = { dex: (t) => `${t.score}점`, score: (t) => `도감 ${t.dex}`, battle: (t) => `도감 ${t.dex} · ${t.score}점` }[S.rankKind];
  return [
    h('div.seg.rank-kinds', { role: 'group', 'aria-label': '랭킹 종류' }, RANK_KINDS.map(([k, label]) =>
      h('button', { 'aria-pressed': String(S.rankKind === k), onclick: () => { S.rankKind = k; sfx.blip(); loadRanking(); } }, label))),
    p.gen && h('div.seg', { role: 'group' },
      h('button', { 'aria-pressed': String(S.rankScope === 'all'), onclick: () => { S.rankScope = 'all'; loadRanking(); } }, '전체'),
      h('button', { 'aria-pressed': String(S.rankScope === 'gen'), onclick: () => { S.rankScope = 'gen'; loadRanking(); } }, `${p.gen}기`)),
    r ? h('div.box.banner', h('span', '내 순위 ', h('b', r.me ? `#${r.me.rank}` : '-'), ` / ${r.total}명`),
      h('small', `${timeAgo(r.at)} 기준`)) : h('div.box', S.online ? '불러오는 중…' : '오프라인이에요. 인터넷이 연결되면 랭킹을 불러와요.'),
    !p.show_on_board && h('div.box', { style: { fontSize: '13px' } }, '지금은 "익명 트레이너"로 표시돼요. 오른쪽 위 톱니바퀴 설정에서 바꿀 수 있어요.'),
    r && h('ol.rank-list', r.top.map((t) => h(`li${t.me ? '.me' : ''}`,
      h(`span.rank-no.r${t.rank}`, t.rank <= 3 ? pix(['gold', 'silver', 'bronze'][t.rank - 1], 'l') : `#${t.rank}`),
      h('span', h('div', t.display, t.me ? ' (나)' : ''), h('div.rank-sub', sub(t))),
      h('b', unit(t))))),
    r && !r.top.length && h('div.box', S.rankKind === 'battle' ? '아직 배틀에서 이긴 사람이 없어요. 배틀이 열리면 첫 승리를 노려 보세요!' : '아직 아무도 몬스터를 잡지 않았어요. 첫 번째가 되어 보세요!'),
    h('p', { style: { fontSize: '13px', margin: 0 } }, {
      dex: '도감: 모은 몬스터 수 (진화한 단계까지 모두 셈). 동점이면 먼저 도달한 사람이 위.',
      score: '점수: 1단계 1점 · 2단계 3점 · 3단계 6점 (+희귀·전설 보너스). 동점이면 먼저 도달한 사람이 위. 상품은 점수 순위 기준.',
      battle: '배틀 승리: 다른 트레이너·선생님과의 배틀에서 이긴 횟수. 동점이면 먼저 이긴 사람이 위.' }[S.rankKind]),
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
  if (isBattleQr(q)) return friendBattleSheet(t);
  if (isRaidQr(q)) return joinRaid(q, t);
  const R = rules();
  const items = normalBag();
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
    h('div.box', h('b', `가방 ${items.filter((t) => !t.special).length}/${rules().bag_max}`),
      items.length ? h('div.bag-row', items.map((t) => (t.special
        ? h('span.chip.special', pix('spark'), speciesOf(t.special.species_id)?.name || t.name)
        : h('span.chip', t.name)))) : h('p', '가방이 비었어요. 그래도 부스에서 고유번호로 확인할 수 있어요.')),
    h('button.btn', { onclick: () => closeOverlay() }, '닫기')));
  S.bagOpen = true;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* best effort */ }
  const poll = setInterval(() => sync(), CONFIG.BAG_POLL_MS);
  ov.onclose = () => { clearInterval(poll); S.bagOpen = false; wakeLock?.release?.().catch(() => {}); wakeLock = null; };
}

// ───────────────────────── 획득 축하 + 퀴즈 ─────────────────────────

let celebrating = false;

// 이스터에그 4: 정각(00분)이나 축제 마감 1분 전에 몬스터를 받으면 황금빛 연출
function luckyMoment(now = new Date()) {
  const close = rules().festival_close_at ? new Date(rules().festival_close_at) : null;
  if (close && close - now > 0 && close - now <= 60_000) return '마지막 1분의 기적';
  if (now.getMinutes() === 0) return '정각의 행운';
  return null;
}

// 이스터에그 3: 도감 완성 → 한 번만 특별 화면 (트레이너 카드는 계속 금테)
let dexDoneBusy = false;
async function maybeDexComplete() {
  if (dexDoneBusy || !dexStats().complete) return false;
  dexDoneBusy = true;
  if (await kv.get('dexDone')) return false;       // shown once per device (flag stays → never again)
  await kv.set('dexDone', true);
  const text = h('div.box.textbox', { style: { whiteSpace: 'pre-line' } });
  const ov = overlay(h('div.stage', h('div.scene.golden', h('div.rays'), h('span.spr', spriteCanvas(dexOf(35, 1), 200))), text), 'full');
  sfx.catch(); vibrate([80, 60, 80, 60, 200]);
  await typeText(text, `도감 완성!!\n${S.snap.profile.name || '트레이너'}, 학교의 모든 몬스터를 만났어요.\n칭호 「도감 마스터」를 얻었다! 트레이너 카드가 금빛으로 바뀌었어요.`);
  text.append(h('span.more', '▼'));
  await tapToContinue(ov);
  closeOverlay();
  renderTab();
  return true;
}


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
    const secret = isSecret(sp.line_id);
    const lucky = luckyMoment();
    const canvas = spriteCanvas(sp.id, 200, 'white');
    const scene = h(`div.scene${lucky ? '.golden' : ''}`, h('div.rays'), h('span.spr', canvas, isNew && h('span.new-badge', 'NEW!')));
    const text = h('div.box.textbox', { style: { whiteSpace: 'pre-line' } });
    const ov = overlay(h('div.stage', scene, text), 'full');
    await sleep(reducedMotion() ? 0 : 500);
    scene.classList.add('flash');
    paint(canvas, sp.id, 200);
    sfx.catch(); vibrate([80, 60, 160]);
    if (lucky) sfx.correct();
    await typeText(text, `${secret ? '★비밀 몬스터 발견★\n' : ''}축하합니다! ${josa(sp.name, '을', '를')} 획득했습니다!${rare && !secret ? ' ★희귀★' : ''}\n(${t.qr_name})${lucky ? `\n✦ ${lucky} ✦` : ''}`);
    text.append(h('span.more', '▼'));
    S.celebrated.add(t.nonce);
    await kv.set('celebrated', [...S.celebrated]);
    await tapToContinue(ov);
    closeOverlay();
  }
  celebrating = false;
  renderTab();
  if (await maybeDexComplete()) return;
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
        h('li', '저장하는 정보: 고유번호(또는 아이디), 이름, 게임 기록(찍은 QR·몬스터·퀴즈). 위치(GPS)는 저장하지 않아요.'),
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
const maskName = (raw = '') => {
  const n = String(raw || '').trim();
  return n.length >= 3 ? n[0] + '*'.repeat(n.length - 2) + n.at(-1) : n.length === 2 ? n[0] + '*' : n || '트레이너';
};

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

// 로그인 화면 (0018): 학생 = 고유번호 + 비밀번호, 비학생(선생님·학부모·손님·운영진) = 아이디 + 비밀번호, 맨 아래 구글 = 복구용.
// 구글은 설정에서 "복구용 구글 연결"을 해 둔 경우에 내 계정으로 들어간다. 비밀번호를 잊으면 그 구글로 들어가서 새로 정한다.
const linkIntent = () => { try { return JSON.parse(sessionStorage.getItem('linkGoogle') || 'null'); } catch { return null; } };
const clearGoogleIntents = () => { sessionStorage.removeItem('linkGoogle'); sessionStorage.removeItem('recover'); };
const keyLabel = (k) => (k.kind === 'number' ? `고유번호 ${k.key}` : `아이디 ${k.key}`);

function renderLogin(error = '') {
  closeOverlay();
  const err = h('div.err', { role: 'alert' }, error);
  const gbox = h('div.gbox');
  const mons = h('div.mons.hop', [1, 13, 25, 37, 49].map((d, i) => h('span', { style: { animationDelay: `${i * 0.18}s` } }, spriteCanvas(d, 52))));
  const pending = sessionStorage.getItem('pendingScan');
  const link = linkIntent();
  const recover = sessionStorage.getItem('recover') === '1';
  const googleFirst = !!(link || recover);
  // 3세대 타이틀 화면 느낌: 하늘·구름·나무·잔디 = 배경 그림 (web/img/title, CC0) + 해(소디포) + 잔디 위 몬스터들
  const sky = h('div.title-sky', { 'aria-hidden': 'true' }, h('span.sun', spriteCanvas(112, 64)));
  const content = [
    sky,
    h('div.title-plate', h('div.logo', CONFIG.GAME_TITLE), h('div.logo-sub', '학교 곳곳의 QR을 찾아 선생님 몬스터를 모아라!')),
    mons,
    pending && h('div.box.login-note',
      h('b', pix('camera'), 'QR을 찍었는데 이 브라우저는 로그인이 안 돼 있어요'), h('br'),
      '게임을 하던 앱(브라우저)을 열고 가운데 볼 버튼으로 다시 찍거나, QR 아래 5자리 코드를 입력하세요. 처음이라면 여기서 로그인해도 돼요.'),
    googleFirst
      ? h('section.box.login-card.google-first',
        h('b.lc-title', link ? '복구용 구글 연결' : '구글로 내 계정 찾기'),
        h('small', link
          ? `${keyLabel(link)} 계정에 연결할 구글 계정으로 로그인하세요. 그다음 그 계정의 비밀번호를 한 번 더 넣으면 연결돼요.`
          : '복구용으로 연결해 둔 구글 계정으로 로그인하면 내 계정으로 들어가요. 들어가면 바로 새 비밀번호를 정해요.'),
        gbox,
        h('button.btn.small.ghost', { type: 'button', onclick: () => { clearGoogleIntents(); renderLogin(); } }, '취소'))
      : h('div.press.blink', 'PRESS START'),
    err,
    !googleFirst && studentLogin(err),
    !googleFirst && idLogin(err),
    !googleFirst && h('section.google-alt', h('small', '복구용 구글을 연결해 뒀다면 구글로 바로 들어와요'), gbox),
    installButton('.small'),
    h('p.foot-note', '처음이면 그 자리에서 계정이 만들어져요. 학생은 고유번호 하나 = 계정 하나예요. ',
      h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, '개인정보 처리방침')),
    // 늘 맨 아래에: 만든 동아리 (Watson & Decfi) · 문의하기 · 비밀번호를 잊었어요
    h('nav.login-help', { 'aria-label': '도움' },
      h('div.clubs', { 'aria-label': '만든 동아리: Watson & Decfi' },
        h('figure', h('img', { src: 'img/clubs/watson.png', alt: 'Watson 로고', width: 46, height: 45 }), h('figcaption', 'Watson')),
        h('span.amp', { 'aria-hidden': 'true' }, '&'),
        h('figure', h('img', { src: 'img/clubs/decfi.png', alt: 'Decfi 로고', width: 39, height: 44 }), h('figcaption', 'Decfi'))),
      h('div.help-btns',
        h('button.btn.small', { type: 'button', onclick: () => inquiryPublicSheet() }, pix('memo'), '문의하기'),
        h('button.btn.small', { type: 'button', onclick: () => forgotSheet() }, pix('ticket'), '비밀번호를 잊었어요'))),
  ];
  app().replaceChildren(h('div.login.title-screen', content));
  renderGoogleButton(gbox, (m) => { err.textContent = m; }).catch((e) => { err.textContent = e.message; });
}

// 학생: 고유번호 + 내가 정한 비밀번호. 처음 쓰는 번호면 이 비밀번호로 계정이 만들어진다 (0011)
function studentLogin(err) {
  const cid = h('input', { placeholder: '고유번호 6자리 (예: 022001)', inputmode: 'numeric', maxlength: 6, autocomplete: 'username', 'aria-label': '고유번호' });
  const pw = h('input', { type: 'password', placeholder: '비밀번호 (6자 이상)', autocomplete: 'current-password', maxlength: 72, 'aria-label': '비밀번호' });
  const help = h('div');
  const go = h('button.btn.primary', { type: 'submit' }, '학생 로그인');
  const sid = () => cid.value.replace(/\D/g, '').padStart(6, '0');
  const form = h('form.stack', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      help.replaceChildren();
      if (!/^[0-9]{5,6}$/.test(cid.value.trim())) { err.textContent = '고유번호 6자리를 숫자로 입력해 주세요. (예: 022001)'; return; }
      if (pw.value.length < 6) { err.textContent = '비밀번호는 6자 이상이에요.'; return; }
      const email = `${sid()}@code.local`;
      go.disabled = true;
      try {
        try { return await devLogin(email, pw.value); } catch { /* not yet / wrong → below */ }
        // 예전에 받은 로그인 코드(ABCD-EFGH)도 그대로 비밀번호로 쓸 수 있다
        const code = pw.value.replace(/[\s-]/g, '').toUpperCase();
        if (/^[A-Z2-9]{8}$/.test(code) && code !== pw.value) { try { return await devLogin(email, code); } catch { /* no */ } }
        try {
          await rpc('create_number_account', { p_student_id: sid(), p_password: pw.value }, { retries: 0 });
          await devLogin(email, pw.value);
        } catch (x) {
          if (x.message === 'CODE_ACCOUNT_EXISTS') {
            err.textContent = '비밀번호가 맞지 않아요.';
            help.replaceChildren(h('button.btn.small.ghost', { type: 'button', onclick: () => forgotSheet({ kind: 'number', key: sid() }) }, '비밀번호를 모르겠어요'));
          } else err.textContent = errorText(x.message);
        }
      } finally { go.disabled = false; }
    },
  }, cid, pw, go, help);
  return h('section.box.login-card', h('b.lc-title', pix('school'), ' 학생 · 고유번호로 로그인'), form,
    h('small', '처음 쓰는 번호면 지금 적은 비밀번호로 계정이 만들어져요.'));
}

// 비학생 (선생님·학부모·손님·운영진): 아이디 + 비밀번호. 처음 쓰는 아이디면 계정이 만들어진다. 운영진 아이디는 운영자가 만들어 준다 (0018)
function idLogin(err) {
  const idIn = h('input', { placeholder: '아이디 (영문으로 시작, 4~16자)', autocapitalize: 'off', autocomplete: 'username', spellcheck: 'false', maxlength: 16, 'aria-label': '아이디' });
  const pw = h('input', { type: 'password', placeholder: '비밀번호 (6자 이상)', autocomplete: 'current-password', maxlength: 72, 'aria-label': '비밀번호' });
  const help = h('div');
  const go = h('button.btn', { type: 'submit' }, '아이디 로그인');
  const form = h('form.stack', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      help.replaceChildren();
      const id = idIn.value.trim().toLowerCase();
      if (!/^[a-z][a-z0-9_]{3,15}$/.test(id)) { err.textContent = '아이디는 영문으로 시작하는 4~16자예요. (영문 소문자·숫자·_ )'; return; }
      if (pw.value.length < 6) { err.textContent = '비밀번호는 6자 이상이에요.'; return; }
      const email = `${id}@id.local`;
      go.disabled = true;
      try {
        try { return await devLogin(email, pw.value); } catch { /* not yet / wrong → below */ }
        try {
          await rpc('create_id_account', { p_id: id, p_password: pw.value }, { retries: 0 });
          await devLogin(email, pw.value);
        } catch (x) {
          if (x.message === 'ID_TAKEN') {
            err.textContent = '이미 있는 아이디예요. 비밀번호가 맞지 않아요.';
            help.replaceChildren(h('button.btn.small.ghost', { type: 'button', onclick: () => forgotSheet({ kind: 'id', key: id }) }, '비밀번호를 모르겠어요'));
          } else err.textContent = errorText(x.message);
        }
      } finally { go.disabled = false; }
    },
  }, idIn, pw, go, help);
  return h('section.box.login-card', h('b.lc-title', pix('door'), ' 비학생 · 아이디로 로그인'), form,
    h('small', '선생님·학부모·다른 학교 손님은 원하는 아이디를 정해서 들어와요 (랭킹 제외). 운영진은 운영자에게 받은 아이디로 들어와요.'));
}

// 로그인 전 문의 (이름 + 선택 고유번호/아이디 + 내용) → 운영자 페이지 '요청' 탭
function inquiryPublicSheet() {
  const nm = h('input', { placeholder: '이름 (예: 홍길동)', maxlength: 20, autocomplete: 'name' });
  const cid = h('input', { placeholder: '고유번호 또는 아이디 (있으면)', maxlength: 16 });
  const body = h('textarea', { rows: 5, maxlength: 1000, placeholder: '예: 로그인이 안 돼요 / 아이디 비밀번호를 잊었어요' });
  const err = h('div.err', { role: 'alert' });
  const send = h('button.btn.big.primary', { type: 'submit' }, '보내기');
  sheet([h('div.grab'), h('h2', { style: { margin: '0 4px' } }, '운영진에게 문의하기'),
    h('form.stack.box', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        send.disabled = true;
        const key = cid.value.trim();
        const isNum = /^[0-9]{5,6}$/.test(key);
        try {
          await rpc('send_inquiry_public', { p_body: (key && !isNum ? `[아이디 ${key}] ` : '') + body.value, p_name: nm.value, p_student_id: isNum ? key : null }, { retries: 0 });
          closeOverlay();
          toast('보냈어요! 급하면 메인 부스로 와 주세요.', 4000);
        } catch (x) { err.textContent = errorText(x.message); send.disabled = false; }
      },
    }, h('small', '로그인이 안 되거나 궁금한 점을 적어 주세요. 운영진이 확인해요.'),
    h('label.field', h('span', '이름'), nm), h('label.field', h('span', '고유번호 / 아이디'), cid), body, err, send)]);
}

// 비밀번호를 잊었어요: ① 복구용 구글로 들어가서 새로 정하기 ② 구글이 없으면 학생은 초기화 요청, 아이디는 문의
function forgotSheet(pre = {}) {
  sheet([
    h('div.grab'),
    h('h2', { style: { margin: '0 4px' } }, '비밀번호를 잊었어요'),
    h('section.box.stack',
      h('b', '① 복구용 구글을 연결해 뒀다면'),
      h('small', '연결한 구글로 로그인하면 내 계정으로 들어가고, 바로 새 비밀번호를 정할 수 있어요.'),
      h('button.btn.big.primary', { onclick: () => { sessionStorage.removeItem('linkGoogle'); sessionStorage.setItem('recover', '1'); closeOverlay(); renderLogin(); } }, '구글로 내 계정 찾기')),
    h('section.box.stack',
      h('b', '② 구글을 연결하지 않았다면'),
      h('small', '학생은 운영자에게 초기화를 요청해요. 운영자가 확인하고 허용하면 그때 정한 새 비밀번호로 바뀌어요. 아이디 계정은 문의하기로 알려 주세요.'),
      h('button.btn', { onclick: () => resetRequestSheet(pre.kind === 'number' ? pre.key : '') }, pix('school'), '학생: 운영자에게 초기화 요청'),
      h('button.btn', { onclick: () => inquiryPublicSheet() }, pix('memo'), '아이디 계정: 문의하기')),
  ]);
}

// 학생 비밀번호 초기화 요청 (허용되면 여기서 고른 새 비밀번호가 된다)
function resetRequestSheet(prefill = '') {
  const err = h('div.err', { role: 'alert' });
  const cid = h('input', { placeholder: '고유번호 6자리', inputmode: 'numeric', maxlength: 6, value: prefill });
  const nm = h('input', { placeholder: '이름 (예: 홍길동)', maxlength: 20, autocomplete: 'name' });
  const pw = h('input', { type: 'password', placeholder: '새 비밀번호 (6자 이상)', autocomplete: 'new-password', maxlength: 72 });
  const pw2 = h('input', { type: 'password', placeholder: '새 비밀번호 한 번 더', autocomplete: 'new-password', maxlength: 72 });
  const note = h('input', { placeholder: '운영자에게 한마디 (선택)', maxlength: 300 });
  const send = h('button.btn.big.primary', { type: 'submit' }, '초기화 요청 보내기');
  sheet([
    h('div.grab'),
    h('h2', { style: { margin: '0 4px' } }, '비밀번호 초기화 요청'),
    h('form.stack.box', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (pw.value.length < 6) { err.textContent = '새 비밀번호는 6자 이상이에요.'; return; }
        if (pw.value !== pw2.value) { err.textContent = '두 칸의 새 비밀번호가 서로 달라요.'; return; }
        send.disabled = true;
        try {
          await rpc('request_password_reset', { p_student_id: cid.value.trim(), p_password: pw.value, p_name: nm.value, p_note: note.value }, { retries: 0 });
          closeOverlay();
          toast('요청을 보냈어요! 운영자가 허용하면 새 비밀번호로 로그인돼요. 메인 부스에 말하면 더 빨라요.', 6000);
        } catch (x) { err.textContent = errorText(x.message); send.disabled = false; }
      },
    },
    h('small', '운영자가 확인하고 허용하면, 지금 정한 새 비밀번호로 바뀌어요. 이 번호에 연결된 구글 계정은 모두 풀려요.'),
    h('label.field', h('span', '고유번호'), cid),
    h('label.field', h('span', '이름'), nm),
    h('label.field', h('span', '새 비밀번호'), pw), pw2,
    note, err, send),
  ]);
}

const GENS = [20, 21, 22];   // hint only; the server setting allowed_gens decides (0010)

// 첫 로그인: 이름 + 동의.
//  · 고유번호/아이디로 로그인했으면 이름만.
//  · 구글로 처음 들어왔으면: 학생 = 고유번호 + 비밀번호 (link_number), 비학생 = 아이디 + 비밀번호 (link_id) — 구글은 그 계정의 복구용이 된다.
function renderRegister(info) {
  closeOverlay();
  const link = linkIntent();
  if (info.google && link) return renderLinkGoogle(link);
  if (info.google && sessionStorage.getItem('recover') === '1') return renderRecoverMiss();
  const fixed = info.code_id ? { kind: 'number', key: info.code_id } : info.login_id ? { kind: 'id', key: info.login_id } : null;
  const google = !!info.google && !fixed;
  let kind = fixed?.kind === 'id' ? 'id' : 'student';
  const err = h('div.err', { role: 'alert' });
  const help = h('div.stack');
  const sidIn = h('input', { placeholder: '고유번호 6자리 (예: 022001)', inputmode: 'numeric', maxlength: 6, value: info.school_id || '' });
  const idIn = h('input', { placeholder: '아이디 (영문으로 시작, 4~16자)', autocapitalize: 'off', spellcheck: 'false', maxlength: 16 });
  const pwIn = h('input', { type: 'password', placeholder: '비밀번호 (6자 이상)', autocomplete: 'new-password', maxlength: 72 });
  const nameIn = h('input', { placeholder: '이름 (예: 홍길동)', maxlength: 20, value: info.name || '', autocomplete: 'name' });
  const show = h('input', { type: 'checkbox', checked: true });
  const preview = h('b');
  const sidRow = h('label.field', h('span', '고유번호'), sidIn,
    h('small', info.school_id ? '학교 계정에서 고유번호를 가져왔어요.' : '20~22기만 참여할 수 있어요. 22기 1번 → 022001'));
  const idRow = h('label.field', h('span', '아이디'), idIn, h('small', '영문 소문자로 시작, 4~16자 (영문·숫자·_ )'));
  const pwRow = h('label.field', h('span', '비밀번호'), pwIn,
    h('small', '처음 쓰는 번호·아이디면 지금 정하는 비밀번호가 돼요. 이미 있으면 그 비밀번호를 넣어 주세요.'));
  const googleNote = h('small.muted', '이 구글 계정은 그 계정의 복구용으로 연결돼요. 다음부터 이 구글로 바로 들어올 수 있고, 비밀번호를 잊어도 이 구글로 다시 정할 수 있어요.');
  const seg = h('div.seg', { role: 'group', 'aria-label': '학생인가요' });
  const update = () => {
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === kind)));
    sidRow.hidden = !(kind === 'student' && !fixed);
    idRow.hidden = !(kind === 'id' && google);
    pwRow.hidden = googleNote.hidden = !google;
    const id = sidIn.value.replace(/\D/g, '');
    const gen = kind === 'student' && id.length >= 5 ? Number(id.padStart(6, '0').slice(0, 3)) : null;
    preview.textContent = gen && !GENS.includes(gen) ? `${gen}기는 참여할 수 없어요 (20~22기만)` : `${gen ? gen + '기 ' : ''}${maskName(nameIn.value)}`;
  };
  if (!fixed) {
    seg.append(
      h('button', { type: 'button', 'data-k': 'student', onclick: () => { kind = 'student'; update(); } }, '학생'),
      h('button', { type: 'button', 'data-k': google ? 'id' : 'guest', onclick: () => { kind = google ? 'id' : 'guest'; update(); } }, '비학생'));
  }
  sidIn.oninput = update; nameIn.oninput = update;
  const start = h('button.btn.big.primary', { type: 'submit' }, '시작하기');
  const sid = () => sidIn.value.replace(/\D/g, '').padStart(6, '0');

  // 구글 → 고유번호 연결 (reset = 학교 계정으로 비밀번호 새로 정하기)
  const linkNumber = async (reset = false) => {
    const res = await rpc('link_number', { p_student_id: sid(), p_password: pwIn.value, p_name: nameIn.value.trim(), p_show: show.checked, p_reset: reset }, { retries: 0 });
    if (res.error === 'WRONG_PASSWORD') {
      err.textContent = '이 번호는 이미 계정이 있어요. 비밀번호가 맞지 않아요.';
      help.replaceChildren(
        res.school && h('button.btn.gold', { type: 'button', onclick: () => {
          if (pwIn.value.length < 6) { err.textContent = '새 비밀번호를 6자 이상 적어 주세요.'; return; }
          if (!confirm('학교 계정으로 확인됐어요. 지금 입력한 비밀번호를 새 비밀번호로 정할까요? (다른 기기는 로그아웃되고, 이 번호에 연결된 다른 구글 계정은 풀려요)')) return;
          submit(true);
        } }, '학교 계정으로 비밀번호 새로 정하기'),
        h('button.btn.small.ghost', { type: 'button', onclick: () => resetRequestSheet(sid()) }, '비밀번호를 모르겠어요 (운영자에게 요청)'));
      return false;
    }
    if (res.mode === 'linked') await devLogin(res.email, pwIn.value);
    return true;
  };
  // 구글 → 아이디 연결 (처음 쓰는 아이디면 이 구글이 그 아이디 계정이 된다)
  const linkId = async () => {
    const res = await rpc('link_id', { p_id: idIn.value.trim().toLowerCase(), p_password: pwIn.value, p_name: nameIn.value.trim(), p_show: show.checked }, { retries: 0 });
    if (res.error === 'WRONG_PASSWORD') { err.textContent = '이미 있는 아이디예요. 비밀번호가 맞지 않아요.'; return false; }
    if (res.mode === 'linked') await devLogin(res.email, pwIn.value);
    return true;
  };
  const submit = async (reset = false) => {
    err.textContent = '';
    help.replaceChildren();
    const nm = nameIn.value.trim();
    if (!nm) { err.textContent = '이름을 입력해 주세요.'; return; }
    if (kind === 'student' && !fixed && !/^[0-9]{5,6}$/.test(sidIn.value.trim())) { err.textContent = '고유번호 6자리를 숫자로 입력해 주세요. (예: 022001)'; return; }
    if (kind === 'id' && google && !/^[a-z][a-z0-9_]{3,15}$/.test(idIn.value.trim().toLowerCase())) { err.textContent = '아이디는 영문으로 시작하는 4~16자예요.'; return; }
    if (google && pwIn.value.length < 6) { err.textContent = '비밀번호는 6자 이상이에요.'; return; }
    start.disabled = true;
    try {
      if (google) { if (!(await (kind === 'student' ? linkNumber(reset) : linkId()))) return; }
      else await rpc('register_profile', { p_kind: fixed ? (fixed.kind === 'number' ? 'student' : 'id') : kind, p_student_id: fixed?.kind === 'number' ? fixed.key : sidIn.value.trim(), p_name: nm, p_show: show.checked }, { retries: 0 });
      await afterLogin();
    } catch (x) {
      err.textContent = errorText(x.message);
      if (x.message === 'OLD_NUMBER_ACCOUNT') help.replaceChildren(h('button.btn.small.ghost', { type: 'button', onclick: () => resetRequestSheet(sid()) }, '비밀번호 초기화 요청하기'));
    } finally { start.disabled = false; }
  };
  const form = h('form.register', { onsubmit: (e) => { e.preventDefault(); submit(); } },
    h('div.box.stack',
      h('b', '처음 왔구나! 누구인지 알려줘'),
      fixed ? h('p', `${keyLabel(fixed)}(으)로 로그인했어요. 이름만 적어 주세요.`)
        : [seg, h('small', '비학생 = 선생님·학부모·다른 학교 손님 (랭킹 제외)')],
      sidRow,
      idRow,
      pwRow,
      h('label.field', h('span', '이름'), nameIn, google ? h('small', '이미 있는 계정이면 원래 이름이 그대로 쓰여요.') : null),
      h('label.check', show, h('span', '랭킹·대형 화면에 이렇게 보여요: ', preview, h('br'), h('small', '(체크를 풀면 "익명 트레이너". 나중에 설정에서 바꿀 수 있어요)'))),
      googleNote),
    h('div.box.stack.small-print',
      h('b', '저장하는 정보'),
      h('span', '고유번호(또는 아이디), 이름, 게임 기록(찍은 QR·몬스터·퀴즈). 위치(GPS)는 저장하지 않아요. 축제가 끝나고 2주 안에 모두 삭제해요. '),
      h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, '개인정보 처리방침'),
      h('span', '비학생은 랭킹(상품)에서 빠지고, 나머지는 똑같이 즐길 수 있어요.')),
    err,
    help,
    start,
    h('button.btn.small.ghost', { type: 'button', onclick: async () => { clearGoogleIntents(); await signOut(); await kv.clear(); S.snap = null; renderLogin(); } }, '다른 계정으로 로그인'));
  app().replaceChildren(h('div.login.register-screen', h('div.logo.logo-small', CONFIG.GAME_TITLE), form));
  update();
}

// 설정 → "복구용 구글 연결" 다음: 새 구글로 들어왔으면, 그 계정의 비밀번호를 한 번 더 넣어서 연결
function renderLinkGoogle(link) {
  const pw = h('input', { type: 'password', placeholder: '그 계정의 비밀번호', autocomplete: 'current-password', maxlength: 72 });
  const err = h('div.err', { role: 'alert' });
  const go = h('button.btn.big.primary', { type: 'submit' }, '이 구글을 연결하기');
  const cancel = async () => { clearGoogleIntents(); await signOut(); renderLogin(); };
  app().replaceChildren(h('div.login.register-screen', h('div.logo.logo-small', CONFIG.GAME_TITLE),
    h('form.register', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (pw.value.length < 6) { err.textContent = '비밀번호는 6자 이상이에요.'; return; }
        go.disabled = true;
        try {
          const res = link.kind === 'number'
            ? await rpc('link_number', { p_student_id: link.key, p_password: pw.value }, { retries: 0 })
            : await rpc('link_id', { p_id: link.key, p_password: pw.value }, { retries: 0 });
          if (res.error === 'WRONG_PASSWORD') { err.textContent = '비밀번호가 맞지 않아요.'; return; }
          clearGoogleIntents();
          if (res.email) await devLogin(res.email, pw.value);
          toast('복구용 구글을 연결했어요! 다음부터 이 구글로도 들어올 수 있어요.', 4500);
          await afterLogin();
        } catch (x) { err.textContent = errorText(x.message); } finally { go.disabled = false; }
      },
    },
    h('div.box.stack',
      h('b', '복구용 구글 연결'),
      h('p', `${keyLabel(link)} 계정의 비밀번호를 넣으면 지금 로그인한 구글이 그 계정에 연결돼요.`),
      h('label.field', h('span', '비밀번호'), pw)),
    err, go,
    h('button.btn.small.ghost', { type: 'button', onclick: cancel }, '취소'))));
}

// "구글로 내 계정 찾기"를 했는데 이 구글은 아직 어떤 계정에도 연결돼 있지 않음
function renderRecoverMiss() {
  app().replaceChildren(h('div.login.register-screen', h('div.logo.logo-small', CONFIG.GAME_TITLE),
    h('div.box.stack',
      h('b', '이 구글 계정은 연결된 게임 계정이 없어요'),
      h('p', '복구용으로 연결해 둔 다른 구글 계정이 있다면 그걸로 다시 해 보세요. 연결한 적이 없다면 학생은 운영자에게 초기화를 요청하고, 아이디 계정은 문의하기로 알려 주세요.'),
      h('button.btn.primary', { onclick: async () => { await signOut(); renderLogin(); } }, '다른 구글로 다시 하기'),
      h('button.btn', { onclick: async () => { clearGoogleIntents(); await signOut(); renderLogin(); resetRequestSheet(); } }, '학생: 초기화 요청'),
      h('button.btn.small.ghost', { onclick: async () => { clearGoogleIntents(); await signOut(); renderLogin(); } }, '처음으로'))));
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
    h('button.btn.small.ghost', { onclick: () => renderLogin() }, '그래도 여기서 고유번호로 로그인')));
}

boot();
