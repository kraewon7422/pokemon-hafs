// Student app. State = last server snapshot (IndexedDB) + local outbox of scans not yet acknowledged.
// See docs/DESIGN.md §3 (offline rules) and §5 (server rules).
import { CONFIG } from './config.js';
import { sb, rpc, errorText, reportError, selectAll } from './sb.js';
import { kv, persist } from './db.js';
import { parsePlace, isBag, makeNonce, bagPayload, drawQR } from './qrfmt.js';
import { Scanner } from './scanner.js';
import { spriteCanvas, paint, monSprite, aliasSprites } from './sprites.js';
import { sfx, unlockAudio, isSfxOn, setSfxOn, isBgmOn, setBgmOn, bgmScene } from './sfx.js';
import { h, $, josa, toast, typeText, timeAgo, sleep, reducedMotion, pixelFontScale, ICON, pix } from './ui.js';
import { inAppBrowser, isIOS, signOut } from './auth.js';
import { S, app, bag, boxFull, boxMax, collection, dexOf, spIdOf, dexStats, evolvable, isSecret, isWithdrawn, lineOf, mons, monSp, normalBag, owned, partnerMon, rules, sortDex, speciesOf, titlesOf, vibrate } from './state.js';
import { fmtTime, openDetail, viewDex, viewMap } from './dex.js';
import { isRaidQr, joinRaid, viewRaid } from './raid.js';
import { friendBattleSheet, inviteSheet, isBattleQr, viewBattle } from './battle.js';
import { loadBag, openBagScreen } from './bag.js';
import { minigameButton } from './games/hub.js';
import { loadAchievements, openAchievements, startSteps } from './eggs.js';
import { clearGoogleIntents, linkIntent, maskName, maybeOnboard, renderConsent, renderInApp, renderLogin, renderRegister, showOnboarding, withEye } from './login.js';

// ───────────────────────── boot ─────────────────────────

// 첫 화면을 그리기 전에 잠깐 기다린다 (LOADING 화면 그대로): 픽셀 글꼴 + 새 버전 확인.
// → 바뀌기 전 글꼴로 글자가 흔들리거나, 옛 버전 화면이 보였다가 새로고침되는 일이 없게. 오래 걸려도 3.5초면 그냥 연다
export async function readyToShow() {
  const fonts = document.fonts
    ? Promise.all(['16px Galmuri11', 'bold 16px Galmuri11'].map((f) => document.fonts.load(f))).catch(() => {}) : null;
  const fresh = (async () => {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller || !navigator.onLine) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    await reg.update().catch(() => {});
    // 새 버전이 있으면 아래 offer() 가 바로 적용하고 새로고침한다 → 그동안 LOADING 화면에서 기다림
    if (reg.installing || reg.waiting) await sleep(3000);
  })().catch(() => {});
  await Promise.race([Promise.all([fonts, fresh]), sleep(3500)]);
}

export async function boot() {
  pixelFontScale();
  window.addEventListener('error', (e) => reportError(`${e.message} @${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => reportError(`unhandled: ${e.reason?.message || e.reason}`));
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  // iPhone: touchend/click 에서만 소리를 켤 수 있음 · 앱으로 돌아오면 다시 깨움
  for (const ev of ['touchend', 'click', 'keydown']) document.addEventListener(ev, unlockAudio, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) unlockAudio(); });
  bgmScene('main');   // 배경 음악: 첫 터치 뒤에 시작 (배틀·잡기 장면은 배틀 곡으로 잠깐 바꿈)
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
      // 첫 화면이 뜬 뒤 (4초 뒤, 폰이 한가할 때) 나머지 파일을 뒤에서 받아 둠 → 미니게임·지도·QR 카메라도 오프라인 가능
      const warm = () => navigator.serviceWorker.ready.then((r) => r.active?.postMessage('warm')).catch(() => {});
      setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(warm, { timeout: 8000 }) : warm()), 4000);
    }).catch(() => {});
  }

  await readyToShow();

  // QR scanned with the phone's own camera → /s#ID.TOKEN → ./?q=ID.TOKEN
  const params = new URLSearchParams(location.search);
  if (params.get('q')) {
    sessionStorage.setItem('pendingScan', params.get('q'));
    history.replaceState(null, '', location.pathname);
  }

  [S.catalog, S.snap, S.outbox] = await Promise.all([kv.get('catalog'), kv.get('snap'), kv.get('outbox')]);
  if (S.catalog && (!S.catalog.species?.some((x) => x.dex) || !('evo_item' in (S.catalog.species[0] || {})) || !('evolutions' in S.catalog))) S.catalog = null;   // 0032·0034·0037 전 목록은 버리고 새로 받음
  if (S.catalog?.lines) { sortDex(S.catalog); aliasSprites(S.catalog.species); }
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
export let loginFlight = null;
export function afterLogin() {
  loginFlight ||= doAfterLogin().finally(() => { loginFlight = null; });
  return loginFlight;
}

export async function doAfterLogin(retried = false) {
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
export function renderRetry(msg) {
  app().replaceChildren(h('div.login',
    h('div.logo', CONFIG.GAME_TITLE),
    h('div.box.login-note', h('b', '잠깐 문제가 생겼어요'), h('br'), msg),
    h('button.btn.big.primary', { onclick: () => afterLogin() }, '다시 시도'),
    h('button.btn.small.ghost', { onclick: async () => { await signOut(); await kv.clear(); S.snap = null; renderLogin(); } }, '다른 계정으로 로그인')));
}

export async function loadCatalog() {
  const [lines, species, qrs, moves, speciesMoves, typeChart, items, evolutions] = await Promise.all([
    selectAll('lines', 'id,teacher,subject,btype,rarity,active,max_stage,withdrawn,secret,bonus,mythic', (q) => q.order('id')),
    selectAll('species', 'id,line_id,stage,name,category,flavor,height,weight,hp,atk,def,spa,spd,spe,btype,dex,evo_lv,evo_item', (q) => q.order('id')),
    sb.from('qr_points').select('id,name,hint,map_x,map_y,daily_cap').order('id'),
    sb.from('moves').select('id,name,type,category,kind,power,accuracy,pp,priority,effect,description').order('id'),
    selectAll('species_moves', 'species_id,slot,move_id', (q) => q.order('species_id').order('slot')),
    sb.from('type_chart').select('atk,def,mult'),
    sb.from('items').select('key,name,pocket,description,effect,move_id,sort').order('sort'),
    selectAll('evolutions', 'from_species,to_species,how,lv,sort', (q) => q.order('from_species').order('sort')),   // 0037 갈래 진화
  ]);
  if (lines.error || species.error || qrs.error) {
    if (S.catalog) return;
    throw Object.assign(new Error('OFFLINE'), { offline: true });
  }
  S.catalog = { lines: lines.data, species: species.data, qrs: qrs.data, at: new Date().toISOString(),
                moves: moves.data || [], speciesMoves: speciesMoves.data || [], typeChart: typeChart.data || [], items: items.data || [],
                evolutions: evolutions.error ? null : evolutions.data || [] };   // null = 예전 서버 (계열의 다음 단계로 진화)
  sortDex(S.catalog);
  aliasSprites(S.catalog.species);
  await kv.set('catalog', S.catalog);
}

// QR names/positions and monster texts can change during the festival (admin page) → refresh every 5 min
export function refreshCatalogIfOld() {
  // older cached catalogs have no battle data (moves) → refresh right away
  if (!S.catalog?.at || (S.catalog.moves && Date.now() - new Date(S.catalog.at).getTime() < 5 * 60_000)) return;
  S.catalog.at = new Date().toISOString();          // don't start twice
  loadCatalog().then(() => { if (!S.overlay) renderTab(); }).catch(() => {});
}

// ───────────────────────── sync ─────────────────────────

export const FINAL = new Set(['ok', 'invalid_token', 'already_pending', 'daily_cap', 'bag_full', 'nonce_conflict', 'bad_format', 'locked']);
export const ACK_MSG = {
  invalid_token: '확인해 보니 인정되지 않는 QR이었어요 (교체된 QR이거나, 전설 QR을 너무 늦게 보냈어요).',
  already_pending: '이미 티켓 주머니에 그 장소 티켓이 있어요.',
  daily_cap: '오늘은 그 장소를 다 찍었어요.',
  bag_full: '티켓 주머니가 꽉 차서 티켓 하나를 담지 못했어요.',
  locked: '수동 코드를 너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요.',
};

export function sync(opts = {}) {
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
      loadBag().catch(() => {});                   // 장소 QR·퀴즈·배틀에서 주운 물건 알림 (0020)

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

export const ICONS = {
  home: '<path d="M4 14 14 5l10 9v10h-7v-6h-6v6H4z"/>',
  map: '<path d="M3 6l7-2 8 3 7-2v18l-7 2-8-3-7 2zM10 4v18M18 7v18" fill="none" stroke="currentColor" stroke-width="3"/>',
  dex: '<path d="M5 3h16a2 2 0 0 1 2 2v19H7a2 2 0 0 1-2-2zM9 8h10M9 12h10M9 16h6" fill="none" stroke="currentColor" stroke-width="3"/>',
  rank: '<path d="M3 24V14h7v10zM11 24V6h6v18zM18 24V10h7v14z"/>',
  raid: '<path d="M14 2l3 7 8-3-4 8 7 4-8 2 1 8-7-5-7 5 1-8-8-2 7-4-4-8 8 3z"/>',
  battle: '<path d="M3 3h4l13 13-4 4L3 7zM25 3h-4L8 16l4 4L25 7zM5 19l4 4-3 3-4-4zM23 19l-4 4 3 3 4-4z"/>',
};
// red & white ball for the centre scan button (user's choice)
export const CAPSULE = `<svg viewBox="0 0 32 32" aria-hidden="true">
  <circle cx="16" cy="16" r="14" fill="#f8f8f8" stroke="#202838" stroke-width="2.5"/>
  <path d="M2.5 16a13.5 13.5 0 0 1 27 0z" fill="#e04848"/>
  <path d="M6 9a11 11 0 0 1 6-4" fill="none" stroke="#ff9a9a" stroke-width="2" stroke-linecap="round"/>
  <rect x="2" y="14.5" width="28" height="3" fill="#202838"/>
  <circle cx="16" cy="16" r="5" fill="#f8f8f8" stroke="#202838" stroke-width="2.5"/>
  <circle cx="16" cy="16" r="2" fill="#fff" stroke="#c8c8c8" stroke-width="1"/></svg>`;

export const TABS = [['home', '홈'], ['map', '지도'], ['raid', '레이드'], ['scan', 'QR'], ['battle', '배틀'], ['dex', '도감'], ['rank', '랭킹']];

export function renderShell() {
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
  startSteps();
  askClassOnce();
  // 트레이너 카드의 도전과제 배지용 (한 번만, 조용히)
  if (S.online && !S.ach) loadAchievements().then(() => { if (S.tab === 'home') renderTab(); }).catch(() => {});
}

// 이스터에그 1: 제목을 빠르게 7번 누르면 포켓몬이 화면을 가로질러 달려간다
export let logoTaps = [];
export function logoTap() {
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
  toast(pick ? `${josa(speciesOf(dex)?.name || '포켓몬', '이', '가')} 신나서 달려간다!` : '정체를 알 수 없는 그림자가 지나갔다…!');
  setTimeout(() => runner.remove(), 3200);
}

export function go(tab, { push = true } = {}) {
  if (push && tab !== S.tab) history.pushState({ tab }, '');
  S.tab = tab;
  document.querySelectorAll('nav.tabs button[data-tab]').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  renderTab();
  window.scrollTo(0, 0);
  if (tab === 'rank') loadRanking();
}

export let ignorePop = 0;
export function onPop(e) {
  if (ignorePop > 0) { ignorePop--; return; }
  if (S.overlay) { closeOverlay({ fromPop: true }); return; }
  if (e.state?.tab && $('nav.tabs')) go(e.state.tab, { push: false });
}

export function renderStatus() {
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

export function renderTab() {
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
export function nextAction() {
  const quizzes = S.snap.quizzes || [];
  const items = bag();
  const p = S.snap.profile;
  if (quizzes.length) return [pix('memo', 'l'), `퀴즈 ${quizzes.length}개! 맞히면 가끔 진화의 돌`, 'gold', () => openQuiz()];
  if (items.length) return [pix('ticket', 'l'), `티켓 ${items.length}장! 메인 부스로 가요`, 'primary', openBag];
  const ev = evolvable();
  if (p.evo_tickets > 0 && ev.length) {
    return [pix('spark', 'l'), `진화의 돌 ${p.evo_tickets}개 - 포켓몬을 진화시켜요`, 'gold',
      () => openDetail(monSp(ev[0]))];
  }
  return [pix('camera', 'l'), 'QR을 찾아서 찍어 보세요', 'go', openScanner];
}

export function viewHome() {
  const p = S.snap.profile;
  const R = rules();
  const D = dexStats();
  const total = D.total;
  const titles = titlesOf(p, D);
  const partner = partnerMon();
  const items = bag();
  const normal = items.filter((t) => !t.special);
  const visited = new Set((S.snap.tickets || []).map((t) => t.qr_id));
  const hints = S.catalog.qrs.filter((q) => q.hint && !visited.has(q.id));
  // 아주 가끔 (약 13분에 한 번, QR 힌트를 다 찾았으면 더 자주) 이스터에그 수수께끼. 이미 찾은 알은 안 나옴
  const EGG_RIDDLES = [[80, '트레이너 카드의 내 친구 포켓몬을 톡톡톡… 일곱 번 두드리면 무슨 일이 생길까?'],
    [81, '배틀 탭 타입 상성표에서 에스퍼와 에스퍼가 만나는 칸을 여러 번 눌러 보면…?'],
    [82, '지도 오른쪽 위 숲 모서리를 가만히 여러 번 두드려 보면…?']];
  const eggFound = (l) => !!owned(l) || (S.snap.tickets || []).some((t) => t.special?.special === 'egg' && speciesOf(t.special.species_id)?.line_id === l);
  const riddles = EGG_RIDDLES.filter(([l]) => !eggFound(l)).map(([, t]) => ({ hint: t, egg: true }));
  const tick = Math.floor(Date.now() / 60_000);
  const hint = riddles.length && (!hints.length || tick % 13 === 0) ? riddles[tick % riddles.length]
    : hints.length ? hints[new Date().getMinutes() % hints.length] : null;
  const [icon, label, kind, act] = nextAction();
  const closeAt = R.festival_close_at ? new Date(R.festival_close_at) : null;
  const minsLeft = closeAt ? Math.round((closeAt - Date.now()) / 60000) : null;

  return [
    S.updateReady && h('button.btn.big.gold', { onclick: () => S.updateReady() }, '⬆ 새 버전 적용하기 (2초)'),
    installBanner(),
    !S.updateReady && Number(R.min_client_version) > CONFIG.VERSION && h('div.box.warn-box', '⬆ 새 버전이 있어요! 앱(브라우저 탭)을 완전히 닫았다가 다시 열어 주세요.'),
    R.notice && h('div.box.notice-box', pix('mega'), String(R.notice)),
    boxFull() && h('div.box.warn-box', pix('bag'), `박스가 꽉 찼어요 (${mons().length}/${boxMax()}마리). 가방 → 포켓몬에서 놓아주면 새 포켓몬을 받을 수 있어요.`),
    R.festival_ended && h('div.box.ended-box',
      h('div.big', pix('spark', 'l'), '축제 끝! 수고했어요'),
      h('div', p.in_ranking === false ? '선생님·손님 계정은 랭킹에서 제외돼요.' : `최종 순위 ${p.rank ? '#' + p.rank : '-'} · 점수 ${p.score} · 도감 ${D.found}/${total}`),
      R.prize_note && h('div', String(R.prize_note))),
    !S.snap.festival_open && !R.festival_ended && h('div.box', pix('pause'), '지금은 게임 운영 시간이 아니에요. 찍은 QR은 저장해 두었다가 다시 열리면 보내요.'),
    (R.legend_schedule || []).length > 0 && !R.festival_ended && h('div.box.legend-box', pix('bolt', 'l'),
      h('div', h('b', '전설의 포켓몬 출현'), h('br'),
        [...new Set(R.legend_schedule.map((l) => (l.from ? `${fmtTime(l.from)}${l.until ? '~' + fmtTime(l.until) : ''}` : '지금')))].join(' · '),
        ' · 메인 부스 대형 화면')),
    (S.snap.raids_live || []).length > 0 && !R.festival_ended && h('button.box.raid-banner', { onclick: () => go('raid') },
      spriteCanvas(S.snap.raids_live[0].species_id, 48),
      h('div', h('b', '레이드 보스 출현!'), h('br'), h('small', `${S.snap.raids_live.map((x) => x.title).join(' · ')} — 대형 화면의 QR을 찍어 참가해요`))),
    encounters().length > 0 && h('button.box.raid-banner.enc-banner', { onclick: () => { sfx.select(); catchEncounter(encounters()[0]); } },
      spriteCanvas(encounters()[0].species_id, 48),
      encounters()[0].kind === 'wild'
        ? h('div', h('b', '야생 포켓몬이 나타났다!'), h('br'),
          h('small', `${speciesOf(encounters()[0].species_id)?.name || '야생 포켓몬'} · 몬스터볼 ${encounters()[0].balls || 5}개`,
            encounters().length > 1 ? ` (+${encounters().length - 1})` : ''),
          h('span.chip.enc-go', '잡으러 가기 ▶'))
        : h('div', h('b', '레이드 보스를 잡을 수 있어요!'), h('br'),
        h('small', `${encounters()[0].raid_title || speciesOf(encounters()[0].species_id)?.name || '레이드 보스'} · HAFS 볼 ${encounters()[0].balls || 10}개`,
          encounters().length > 1 ? ` (+${encounters().length - 1})` : ''),
        h('span.chip.enc-go', '잡으러 가기 ▶'))),
    (S.btInbox?.invites || []).length > 0 && h('button.box.raid-banner.bt-banner', { onclick: () => inviteSheet(S.btInbox.invites[0]) },
      pix('spark', 'l'), h('div', h('b', '배틀 신청!'), h('br'), h('small', `${josa(S.btInbox.invites[0].from, '이', '가')} 실시간 배틀을 신청했어요 — 눌러서 수락`))),
    minsLeft != null && minsLeft > 0 && minsLeft < 120 && h('div.box.warn-box', pix('clock'), `마감까지 ${minsLeft}분! 티켓은 마감 전에 부스에서 써 주세요.`),

    h(`button.btn.big.${kind}.next-action`, { onclick: () => { sfx.select(); act(); } }, h('span', icon), label),

    h(`section.trainer${D.complete ? '.gold-card' : ''}`, { 'aria-label': '트레이너 카드' },
      h('div.idno', h('span', 'TRAINER CARD'), h('span', p.student_id.startsWith('g:') ? 'GUEST' : `ID No. ${p.student_id}`)),
      h('div', h('div.name', p.name || '트레이너'), h('div', { style: { fontSize: '13px' } }, p.gen ? `${p.gen}기 트레이너` : '특별 트레이너'),
        titles.length ? h('div.titles', titles.map((t) => h('span.title-chip', t))) : null,
        S.ach?.some((a) => a.claimed) && h('div.titles', h('span.title-chip.ach-chip', { onclick: (e) => { e.stopPropagation(); openAchievements(); } }, pix('gold'), ` 도전과제 ${S.ach.filter((a) => a.claimed).length}/${S.ach.length}`))),
      h('div.partner', { onclick: () => eggTap('card') }, partner ? monSprite(spIdOf(partner), 88, partner) : spriteCanvas(1, 88, 'silhouette'),
        partner && h('button.partner-edit', { 'aria-label': '카드 포켓몬 바꾸기', onclick: (e) => { e.stopPropagation(); pickPartner(); } }, pix('pencil'))),
      h('div.stats',
        h('span', '도감', h('b', `${D.found}/${total}`)), h('span', '점수', h('b', p.score)),
        h('span', '순위', h('b', p.in_ranking === false ? '제외' : p.rank ? `#${p.rank}` : '-')), h('span', '진화의 돌', h('b', p.evo_tickets))),
      h('div.badges', { title: '최종 진화시킨 쌤 포켓몬' }, S.catalog.lines.filter((l) => !l.secret && !l.bonus && l.subject !== '야생').map((l) => {
        const done = (owned(l.id)?.stage || 0) >= (l.max_stage ?? 3);
        return h(`i${done ? '.on.t-' + l.subject : ''}`, { title: done ? `${l.subject} 완성` : '?' });
      }))),

    h('section.box', { 'aria-label': '티켓 주머니' },
      h('div.banner', h('b', `티켓 주머니 ${normal.length}/${R.bag_max}`, items.length > normal.length ? h('span.special-count', ` + ★${items.length - normal.length}`) : null),
        h('span', { style: { fontSize: '13px' } }, items.length ? '부스에서 포켓몬으로 바꿔요' : 'QR을 찍으면 들어와요')),
      items.length ? h('div.bag-row', items.map((t) => (t.special
        ? h('span.chip.special', pix('spark'), speciesOf(t.special.species_id)?.name || '특별', h('small', ` ${{ raid: '레이드', dex50: '도감 50%', dex100: '도감 완성', egg: '숨은 선물' }[t.special.special] || ''}`))
        : h(`span.chip${t.synced ? '' : '.local'}`, pix(t.synced ? 'ticket' : 'wait'), t.name)))) : null,
      h('button.btn.big' + (items.length ? '.primary' : ''), { onclick: openBag }, '티켓 QR 보여주기'),
      R.self_redeem === true && items.some((t) => t.synced) && h('button.btn.big.gold', { style: { marginTop: '8px' }, onclick: selfRedeem },
        pix('gift'), '지금은 앱에서 바로 받기 (부스 혼잡 모드)')),

    h('button.btn.big.bag-btn', { onclick: () => openBagScreen() }, pix('bag', 'l'), h('span.btn-label', '가방')),
    minigameButton(),
    h('button.btn.big.ach-btn', { onclick: openAchievements }, pix('gold', 'l'), h('span.btn-label', '도전과제')),

    rouletteBox(),

    hint && h('section.box.hint', h('b', pix(hint.egg ? 'gift' : 'bulb'), hint.egg ? '수수께끼  ' : '힌트  '), hint.hint),
  ];
}

// install banner on home: until installed or closed (closing only hides it on this device)
export function installBanner() {
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

// ───────── 진화의 돌 룰렛: every N minutes, the server picks 0/1/3/5 tickets ─────────
export const rouletteWait = (r) => Math.max(0, (r.next_at ? new Date(r.next_at) - Date.now() : 0));
export const fmtWait = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function rouletteBox() {
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
  return h('section.box.roulette', { 'aria-label': '진화의 돌 룰렛' },
    h('div.banner', h('b', '진화의 돌 룰렛'), h('span', { style: { fontSize: '13px' } }, `오늘 ${Math.max(0, left)}/${r.daily_max}번 남음`)),
    h('div.reel-row', (r.odds || []).map(([n]) => h('span.reel-cell', n ? `${n}개` : '꽝'))),
    btn,
    h('small', `${r.every_min}분마다 한 번! 꽝이 나와도 다음 기회가 있어요.`));
}

export async function spinRoulette() {
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
  const cells = vals.map((n) => h('span.reel-cell', n ? `${n}개` : '꽝'));
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
    await typeText(text, res.prize > 0 ? `진화의 돌 ${res.prize}개를 받았다! (지금 ${res.evo_tickets}개)` : `꽝…! ${res.roulette.every_min}분 뒤에 다시 도전해요.`);
  }
  S.overlay.dataset.locked = '0';
  text.append(h('button.btn.big.primary', { style: { marginTop: '10px' }, onclick: () => closeOverlay() }, '확인'));
  S.spinning = false;
  renderTab();
}

// 소리 설정: 효과음 · 배경 음악 따로 켜고 끄기 (이 폰에 기억)
function soundRow(icon, label, get, set) {
  const row = h('div.sound-row');
  const draw = () => row.replaceChildren(h('span.sound-lbl', pix(get() ? icon : 'mute'), h('b', label)),
    h('div.seg', { role: 'group', 'aria-label': label }, [[true, '켜기'], [false, '끄기']].map(([v, t]) =>
      h('button', { 'aria-pressed': String(get() === v), onclick: () => { if (get() === v) return; set(v); unlockAudio(); if (v) sfx.blip(); draw(); } }, t))));
  draw();
  return row;
}

// ⚙ settings (top-right). Name visibility comes first so students can find it immediately.
export function openSettings() {
  sfx.select();
  const p = S.snap.profile;
  const masked = `${p.gen ? p.gen + '기 ' : ''}${maskName(p.name)}`;
  sheet([
    h('div.grab'),
    h('h2', { style: { margin: '0 4px' } }, '설정'),
    h('section.box.setting-name',
      h('b', '랭킹·대형 화면에 보이는 내 이름'),
      h('div.seg', { role: 'group', 'aria-label': '이름 공개' },
        h('button', { 'aria-pressed': String(!!p.show_on_board), onclick: () => setPublic(true) }, h('span', '공개'), h('small', masked)),
        h('button', { 'aria-pressed': String(!p.show_on_board), onclick: () => setPublic(false) }, h('span', '비공개'), h('small', '익명 트레이너'))),
      h('small', '공개해도 이름 가운데 글자는 가려져요. 언제든 바꿀 수 있어요.')),
    isStudentAcct(p) && h('section.box.class-row',
      h('span', h('b', '우리 반'), h('br'), h('small', p.grade ? `${classLabel(p)} (반별 랭킹)` : '아직 안 정했어요')),
      h('button.btn.small', { onclick: () => { closeOverlay({ replacing: true }); classSheet(); } }, p.grade ? '바꾸기' : '정하기')),
    ['number', 'id'].includes(p.login) && p.role === 'student' && h('section.box.stack.setting-login',
      h('b', '로그인 정보'),
      h('span', p.login === 'number' ? `학생 · 고유번호 ${p.login_key}` : `비학생 · 아이디 ${p.login_key}`),
      p.google_linked
        ? h('small', pix('spark'), ` 복구용 구글: ${p.google_email || '연결됨'}`)
        : [h('small', '복구용 구글을 연결해 두면 비밀번호를 잊어도 그 구글로 들어와서 다시 정할 수 있어요.'),
          h('button.btn', { onclick: startGoogleLink }, pix('school'), '복구용 구글 연결하기')]),
    h('section.box.setting-sound', { 'aria-label': '소리' },
      soundRow('sound', '효과음', isSfxOn, setSfxOn),
      soundRow('music', '배경 음악', isBgmOn, setBgmOn)),
    h('section.box', { style: { display: 'grid', gap: '8px' } },
      h('button.btn', { onclick: () => showOnboarding(true) }, pix('book'), '게임 방법 다시 보기'),
      h('button.btn', { onclick: inquirySheet }, pix('memo'), '운영진에게 문의하기'),
      ['number', 'id'].includes(p.login) && h('button.btn', { onclick: () => passwordSheet() }, pix('ticket'), '비밀번호 바꾸기'),
      !isStandalone() && h('button.btn', { onclick: showInstall }, pix('phone'), '앱으로 설치하기'),
      h('button.btn', { onclick: confirmLogout }, pix('door'), '로그아웃')),
    // 운영진: 운영자 페이지 (운영진 아이디 또는 등록된 구글로 로그인)
    h('a.btn.small.ghost', { href: 'admin.html', target: '_blank', rel: 'noopener' }, pix('school'), '운영진 전용: 운영자 페이지 로그인'),
    h('small', { style: { textAlign: 'center' } }, `${p.student_id.replace(/^g:/, '')} · 버전 ${CONFIG.VERSION}`),
    h('small.fan-note', CONFIG.FAN_NOTICE),
  ]);
}

// 불편한 점·문의 → 운영자 페이지 '요청' 탭
export function inquirySheet() {
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
export function passwordSheet({ recover = false } = {}) {
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
        toast(`비밀번호를 바꿨어요. 다른 기기의 로그인은 끊겼어요. 다음부터 ${josa(what, '과', '와')} 새 비밀번호로 들어와요.`, 5000);
      },
    }, h('small', recover ? `구글로 내 계정(${what})을 찾았어요. 새 비밀번호를 정해 주세요.` : `${what}의 비밀번호예요.`), withEye(pw), withEye(pw2), err, save)]);
}

// 설정 → 복구용 구글 연결: 로그아웃 → 연결할 구글로 로그인 → 이 계정 비밀번호 한 번 더 (renderLinkGoogle)
export function startGoogleLink() {
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

// 트레이너 카드에 띄울 포켓몬 고르기 (0024 set_partner — 서버에 저장되어 다른 폰에서도 같음)
function pickPartner() {
  sfx.select();
  const cur = S.snap.profile.partner;
  const choose = async (id) => {
    try {
      const prof = await rpc('set_partner', { p_mon: id });
      S.snap.profile = { ...S.snap.profile, ...prof };
      await kv.set('snap', S.snap);
      sfx.blip(); closeOverlay(); renderTab();
    } catch (e) { toast(errorText(e.message)); }
  };
  // 0036: 박스의 포켓몬 한 마리씩 (같은 종이 여러 마리면 레벨로 구별)
  const list = [...mons()].sort((a, b) => b.stage - a.stage || a.line_id - b.line_id || b.level - a.level || a.id - b.id);
  sheet(h('div.stack',
    h('div.grab'),
    h('b', '트레이너 카드에 띄울 포켓몬'),
    h('div.partner-grid', list.map((c) => {
      const sp = monSp(c);
      return h(`button.partner-pick${c.id === cur ? '.on' : ''}`, { 'aria-pressed': String(c.id === cur), onclick: () => choose(c.id) },
        monSprite(sp.id, 56, c), h('small', sp.name), h('small', `Lv.${c.level}`));
    })),
    h('button.btn', { onclick: () => choose(null) }, S.snap.profile.partner ? '자동으로 (가장 많이 진화한 포켓몬)' : '지금은 자동 — 위에서 골라 주세요')));
}

export async function setPublic(show) {
  if (!!S.snap.profile.show_on_board === show) return;
  try {
    const prof = await rpc('set_prefs', { p_show: show, p_avatar: null });
    S.snap.profile = { ...S.snap.profile, ...prof };
    await kv.set('snap', S.snap);
    toast(prof.show_on_board ? `랭킹에 "${prof.display}"${josa(prof.display, '으로', '로').slice(String(prof.display).length)} 보여요.` : '랭킹에 "익명 트레이너"로 보여요.');
    closeOverlay();
    openSettings();
  } catch (e) { toast(errorText(e.message)); }
}

export async function selfRedeem() {
  try {
    await rpc('self_redeem', {}, { retries: 1 });
    await sync({ force: true });
  } catch (e) { sfx.error(); toast(errorText(e.message)); }
}

// installed app = no browser address bar. Chrome/Android: real install prompt; iPhone: instructions.
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const canOfferInstall = () => !isStandalone() && (!!S.installEvt || isIOS());
export function installButton(cls = '') {
  return h(`button.btn.install-btn${cls}`, { hidden: !canOfferInstall(), onclick: showInstall }, pix('phone'), '앱으로 설치하기');
}
export function refreshInstallButtons() {
  document.querySelectorAll('.install-btn').forEach((b) => { b.hidden = !canOfferInstall(); });
}

export async function showInstall() {
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

export function confirmLogout() {
  const n = bag().filter((t) => !t.synced).length;
  sheet(h('div.box',
    h('p', n ? [pix('warn'), `아직 서버에 못 보낸 티켓이 ${n}장 있어요. 로그아웃하면 사라져요!`] : '로그아웃할까요?'),
    h('div', { style: { display: 'flex', gap: '8px' } },
      h('button.btn', { onclick: () => closeOverlay() }, '취소'),
      h('button.btn.primary', { onclick: async () => { closeOverlay(); await signOut(); await kv.clear(); S.snap = null; S.outbox = []; renderLogin(); } }, '로그아웃'))));
}

// ───────────────────────── 랭킹 ─────────────────────────

// 랭킹 3가지: 도감 / 점수 / 배틀 승리 × 전체 / 우리 기수
export const RANK_KINDS = [['dex', '도감'], ['score', '점수'], ['battle', '배틀'], ['class', '반별']];
export async function loadRanking() {
  S.rankKind ||= 'score';
  const scope = `${S.rankKind}:${S.rankScope}`;
  const key = 'rank:' + scope;
  S.rank[scope] ||= await kv.get(key);
  if (S.tab === 'rank') renderTab();
  try {
    const data = S.rankKind === 'class' ? await rpc('class_ranking', {}, { retries: 0 })
      : await rpc('get_ranking_by', { p_gen: S.rankScope === 'gen' ? S.snap.profile.gen : null, p_kind: S.rankKind }, { retries: 0 });
    S.rank[scope] = data;
    await kv.set(key, data);
    S.online = true;
  } catch (e) { if (e.offline) S.online = false; }
  if (S.tab === 'rank') renderTab();
}

export function viewRank() {
  S.rankKind ||= 'score';
  const r = S.rank[`${S.rankKind}:${S.rankScope}`];
  const p = S.snap.profile;
  if (S.rankKind === 'class') return viewClassRank(r, p);
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
    r && !r.top.length && h('div.box', S.rankKind === 'battle' ? '아직 배틀에서 이긴 사람이 없어요. 배틀이 열리면 첫 승리를 노려 보세요!' : '아직 아무도 포켓몬을 잡지 않았어요. 첫 번째가 되어 보세요!'),
    h('p', { style: { fontSize: '13px', margin: 0 } }, {
      dex: '도감: 모은 포켓몬 수 (진화한 단계까지 모두 셈). 동점이면 먼저 도달한 사람이 위.',
      score: '점수: 1단계 1점 · 2단계 3점 · 3단계 6점 (+희귀·전설 보너스). 동점이면 먼저 도달한 사람이 위. 상품은 점수 순위 기준.',
      battle: '배틀 승리: 다른 트레이너·선생님과의 배틀에서 이긴 횟수. 동점이면 먼저 이긴 사람이 위.' }[S.rankKind]),
  ];
}

// 반별 랭킹 (0027): 반마다 점수 합계 · 참가자 · 1등
function viewClassRank(r, p) {
  const kinds = h('div.seg.rank-kinds', { role: 'group', 'aria-label': '랭킹 종류' }, RANK_KINDS.map(([k, label]) =>
    h('button', { 'aria-pressed': String(S.rankKind === k), onclick: () => { S.rankKind = k; sfx.blip(); loadRanking(); } }, label)));
  if (!r) return [kinds, h('div.box', S.online ? '불러오는 중…' : '오프라인이에요. 인터넷이 연결되면 랭킹을 불러와요.')];
  const mine = r.mine;
  return [
    kinds,
    isStudentAcct(p) && (p.grade
      ? h('div.box.banner', h('span', `우리 반 ${classLabel(p)} `, h('b', mine?.rank ? `#${mine.rank}` : '-'), ` / ${r.classes.length}반`), h('small', `${timeAgo(r.at)} 기준`))
      : h('div.box.banner', h('span', '반을 정하면 우리 반 순위가 보여요.'), h('button.btn.small.primary', { onclick: () => classSheet() }, '반 정하기'))),
    r.classes.length ? h('ol.rank-list', r.classes.map((c) => h(`li${c.me ? '.me' : ''}`,
      h(`span.rank-no.r${c.rank}`, c.rank <= 3 ? pix(['gold', 'silver', 'bronze'][c.rank - 1], 'l') : `#${c.rank}`),
      h('span', h('div', classLabel(c), c.me ? ' (우리 반)' : ''),
        h('div.rank-sub', `${c.players}명 · 1등 ${c.top?.display || '-'} (${c.top?.score ?? 0}점)`)),
      h('b', `${c.score}점`))))
      : h('div.box', '아직 반을 정한 학생이 없어요. 설정에서 우리 반을 정해 보세요!'),
    h('p', { style: { fontSize: '13px', margin: 0 } }, '반별: 그 반 학생들 점수의 합계 (랭킹에 나오는 학생만). 반은 학생 계정만 정할 수 있어요.'),
  ];
}

// 우리 반 정하기 — 학생 계정(고유번호)만. 처음 한 번 묻고, 다음부터는 ⚙ 설정에서
export const isStudentAcct = (p) => p?.role === 'student' && /^\d{6}$/.test(p.student_id || '');
function askClassOnce() {
  const p = S.snap?.profile;
  let later = false;
  try { later = localStorage.getItem('classLater') === '1'; } catch { /* */ }
  if (!isStudentAcct(p) || p.grade || later || !S.online || S.classAsked) return;
  S.classAsked = true;
  // 처음 안내 등 다른 창이 열려 있으면 닫힐 때까지 기다렸다가 (최대 3분) 한 번만
  let tries = 0;
  const t = setInterval(() => {
    if (++tries > 60 || S.snap?.profile?.grade) { clearInterval(t); return; }
    if (!document.querySelector('.overlay, .cz-layer') && !celebrating && S.snap?.profile) { clearInterval(t); classSheet(true); }
  }, 3000);
}
// 반 이름 (0030): '1A', '10B', '3' 처럼 글자로. 예전 데이터 (class_no 숫자) 도 그대로 보여 줌
export const CLASS_CHIPS = ['1A', '1B', '2', '3', '4', '5', '6', '7', '8', '9', '10A', '10B'];
export const classLabel = (x) => `${x.grade}학년 ${x.class_name ?? x.class_no ?? ''}반`;
const cleanClass = (v) => String(v || '').toUpperCase().replace(/[^0-9A-Z가-힣ㄱ-ㅎㅏ-ㅣ]/g, '').slice(0, 4);
export function classSheet(first = false) {
  const p = S.snap.profile;
  let g = p.grade || null;
  const gSeg = h('div.seg.class-grade', { role: 'group', 'aria-label': '학년' });
  const inp = h('input.inp.class-inp', { type: 'text', maxlength: 4, inputmode: 'text', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false',
    placeholder: '예: 1A', 'aria-label': '반 이름', value: String(p.class_name ?? p.class_no ?? '') });
  const chips = h('div.class-chips', { role: 'group', 'aria-label': '반 빠르게 고르기' });
  const err = h('div.err', { role: 'alert' });
  const ok = h('button.btn.big.primary', '저장');
  const valid = (v) => /^[0-9A-Z가-힣]{1,4}$/.test(v);
  const draw = () => {
    const c = inp.value;
    gSeg.replaceChildren(...[1, 2, 3].map((n) => h('button', { type: 'button', 'aria-pressed': String(g === n), onclick: () => { g = n; sfx.blip(); err.textContent = ''; draw(); } }, `${n}학년`)));
    chips.replaceChildren(...CLASS_CHIPS.map((n) => h('button', { type: 'button', 'aria-pressed': String(c === n), onclick: () => { inp.value = n; sfx.blip(); err.textContent = ''; draw(); } }, n)));
    ok.disabled = !g || !c;
    ok.textContent = g && valid(c) ? `${g}학년 ${c}반으로 저장` : '학년과 반을 정해요';
  };
  // 한글 입력 (조합 중) 은 건드리지 않고, 조합이 끝나면 대문자·허용 글자만 남김
  inp.addEventListener('input', (e) => { if (e.isComposing) { ok.disabled = !g || !inp.value; return; } const v = cleanClass(inp.value); if (v !== inp.value) inp.value = v; err.textContent = ''; draw(); });
  inp.addEventListener('compositionend', () => { inp.value = cleanClass(inp.value); draw(); });
  const save = async () => {
    const c = cleanClass(inp.value); inp.value = c;
    if (!g) { err.textContent = '학년(1~3학년)을 골라 주세요.'; return; }
    if (!valid(c)) { err.textContent = '반 이름은 1~4글자 (숫자·영어 대문자·한글)로 적어 주세요. 예: 1A, 3, 10B'; draw(); return; }
    ok.disabled = true;
    try {
      await rpc('set_class', { p_grade: g, p_class: c }, { retries: 0 });
      Object.assign(S.snap.profile, { grade: g, class_name: c }); kv.set('snap', S.snap);
      closeOverlay(); sfx.correct();
      toast(`${g}학년 ${c}반으로 정했어요! 랭킹 → 반별에서 우리 반 순위를 봐요.`, 3500);
      if (S.tab === 'rank') loadRanking(); else renderTab();
    } catch (e) { ok.disabled = false; err.textContent = errorText(e.message); }
  };
  ok.onclick = save;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save(); } });
  draw();
  sheet([h('div.grab'), h('h2', { style: { margin: '0 4px' } }, '우리 반 정하기'),
    h('p', { style: { margin: 0 } }, '반별 랭킹에서 내 점수가 우리 반 점수로 더해져요. 나중에 ⚙ 설정에서 바꿀 수 있어요.'),
    gSeg,
    h('label.class-field', h('b', '반 이름'), inp, h('small', '아래에서 누르거나 직접 적어요 (4글자까지)')),
    chips, err, ok,
    first && h('button.btn.small.ghost', { onclick: () => { try { localStorage.setItem('classLater', '1'); } catch { /* */ } closeOverlay(); } }, '나중에 할게요')]);
}

// ───────────────────────── 스캔 ─────────────────────────

export let scanner = null;

export function openScanner() {
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
    if (isBag(text)) { tip.textContent = '이건 티켓 QR이에요 (부스용). 장소 QR을 찍어 주세요.'; return; }
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

export function manualEntry() {
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

export async function handleScan({ q, t }) {
  if (isBattleQr(q)) return friendBattleSheet(t);
  if (isRaidQr(q)) return joinRaid(q, t);
  const R = rules();
  const items = normalBag();
  const known = S.catalog?.qrs.find((x) => x.id === q);
  const name = q === '_' ? '수동 코드 장소' : known?.name || '숨겨진 장소';
  if (items.length >= R.bag_max) return say(`티켓 주머니가 꽉 찼어요! (${R.bag_max}장) 먼저 메인 부스에서 티켓을 써 주세요.`, true);
  if (q !== '_' && items.some((i) => i.qr_id === q)) return say(`이미 티켓 주머니에 "${name}" 티켓이 있어요. 부스에서 쓰고 나면 다시 찍을 수 있어요.`, true);
  const cap = known?.daily_cap || R.qr_daily_cap;
  const todayN = (S.snap.today?.[q] || 0) + S.outbox.filter((o) => o.q === q).length;
  if (q !== '_' && todayN >= cap) return say(`오늘은 "${name}"${josa(name, '을', '를').slice(name.length)} ${cap}번 다 찍었어요. 다른 장소를 찾아보세요!`, true);

  S.outbox.push({ n: makeNonce(), q, t, at: new Date().toISOString() });
  await kv.set('outbox', S.outbox);
  sfx.scan(); vibrate(80);
  renderTab();
  const offlineNote = S.online ? '' : (known ? '\n(오프라인이라 나중에 자동으로 보내요)'
    : '\n※ 숨은·전설 장소는 바로 인터넷에 연결해야 인정돼요!');
  say(`${name}에서 티켓을 얻었다!\n티켓 주머니 ${items.length + 1}/${R.bag_max} - 메인 부스에서 포켓몬으로 바꿔요.${offlineNote}`);
  sync();
}

export function handlePendingScan() {
  const q = sessionStorage.getItem('pendingScan');
  if (!q || !S.snap || !$('nav.tabs')) return;
  sessionStorage.removeItem('pendingScan');
  const place = parsePlace(q);
  if (place) handleScan(place);
}

// 이스터에그 (0024): 숨은 곳을 7번 연달아 누르면 환상 포켓몬 특별 티켓 (계정당 한 번씩, 서버 claim_egg 가 판정)
//   card = 트레이너 카드 포켓몬 사진 / chart = 타입 상성표 에스퍼×에스퍼 칸 / map = 학교 지도 오른쪽 위 숲 모서리
const eggTaps = {};
export async function eggTap(key) {
  const now = Date.now();
  const e = eggTaps[key] = now - (eggTaps[key]?.at || 0) < 1500 ? { n: eggTaps[key].n + 1, at: now } : { n: 1, at: now };
  if (e.n < 7) return;
  eggTaps[key] = null;
  if (!S.online) return;
  try {
    const r = await rpc('claim_egg', { p_key: key }, { retries: 0 });
    if (!r?.granted) { sfx.blip(); return; }
    sfx.catch(); vibrate([60, 40, 120]);
    say('……어디선가 신비한 기운이 느껴진다!\n티켓 주머니에 ★특별 티켓이 들어왔어요.\n부스에서 포켓몬으로 바꿔 보세요.');
    sync();
  } catch { /* 조용히 무시 — 이스터에그는 티 나지 않게 */ }
}

export function say(msg, isError = false) {
  if (isError) { sfx.error(); vibrate([40, 40, 40]); }
  const text = h('div.box.textbox', { style: { whiteSpace: 'pre-line' } });
  const ov = overlay(h('div', { style: { width: '100%', maxWidth: '560px', padding: '0 12px calc(100px + env(safe-area-inset-bottom))' } }, text));
  typeText(text, msg).then(() => text.append(h('span.more', '▼')));
  tapToContinue(ov).then(() => { if (S.overlay === ov) closeOverlay(); });
}

// ───────────────────────── 티켓 QR (부스) ─────────────────────────

export let wakeLock = null;

export async function openBag() {
  sfx.select();
  const items = bag();
  const canvas = h('canvas', { 'aria-label': '티켓 QR' });
  drawQR(canvas, bagPayload(S.snap.profile.student_id, items), { cell: 6, margin: 4, ecc: 'L' });
  const ov = overlay(h('div.sheet',
    h('div.grab'),
    h('div.bagqr',
      h('b', `${S.snap.profile.name} · ${S.snap.profile.student_id.replace(/^g:/, '')}`),
      canvas,
      h('div.bright', pix('sun'), '화면 밝기를 최대로 올려 주세요'),
      h('small', S.online ? '부스에서 확인하면 자동으로 넘어가요…' : '오프라인이어도 부스에서 찍을 수 있어요.')),
    h('div.box', h('b', `티켓 주머니 ${items.filter((t) => !t.special).length}/${rules().bag_max}`),
      items.length ? h('div.bag-row', items.map((t) => (t.special
        ? h('span.chip.special', pix('spark'), speciesOf(t.special.species_id)?.name || t.name)
        : h('span.chip', t.name)))) : h('p', '티켓 주머니가 비었어요. 그래도 부스에서 고유번호로 확인할 수 있어요.')),
    h('button.btn', { onclick: () => closeOverlay() }, '닫기')));
  S.bagOpen = true;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* best effort */ }
  const poll = setInterval(() => sync(), CONFIG.BAG_POLL_MS);
  ov.onclose = () => { clearInterval(poll); S.bagOpen = false; wakeLock?.release?.().catch(() => {}); wakeLock = null; };
}

// ───────────────────────── 획득 축하 + 퀴즈 ─────────────────────────

export let celebrating = false;

// 이스터에그 4: 정각(00분)이나 축제 마감 1분 전에 포켓몬을 받으면 황금빛 연출
export function luckyMoment(now = new Date()) {
  const close = rules().festival_close_at ? new Date(rules().festival_close_at) : null;
  if (close && close - now > 0 && close - now <= 60_000) return '마지막 1분의 기적';
  if (now.getMinutes() === 0) return '정각의 행운';
  return null;
}

// 이스터에그 3: 도감 완성 → 한 번만 특별 화면 (트레이너 카드는 계속 금테)
export let dexDoneBusy = false;
export async function maybeDexComplete() {
  if (dexDoneBusy || !dexStats().complete) return false;
  dexDoneBusy = true;
  if (await kv.get('dexDone')) return false;       // shown once per device (flag stays → never again)
  await kv.set('dexDone', true);
  const text = h('div.box.textbox', { style: { whiteSpace: 'pre-line' } });
  const ov = overlay(h('div.stage', h('div.scene.golden', h('div.rays'), h('span.spr', spriteCanvas(dexOf(35, 1), 200))), text), 'full');
  sfx.catch(); vibrate([80, 60, 80, 60, 200]);
  await typeText(text, `도감 완성!!\n${S.snap.profile.name || '트레이너'}, 학교의 모든 포켓몬을 만났어요.\n칭호 「도감 마스터」를 얻었다! 트레이너 카드가 금빛으로 바뀌었어요.`);
  text.append(h('span.more', '▼'));
  await tapToContinue(ov);
  closeOverlay();
  renderTab();
  return true;
}


// 잡기 설정 (0030). 없으면 (서버가 아직 예전) 도망 없음
export async function catchConfig() {
  try { const c = await rpc('catch_config', {}, { retries: 0 }); if (c && typeof c === 'object') return { flee: 0, raid_mode: 'ticket', raid_balls: 10, raid_flee: true, ...c, ok: true }; } catch { /* 예전 서버·오프라인 */ }
  return { flee: 0, raid_mode: 'ticket', raid_balls: 10, raid_flee: true, ok: false };
}
const missingFn = (e) => /catch_result|schema cache|PGRST202|Could not find/i.test(e?.message || '');
// 부스 잡기 결과를 서버에 (0030 catch_result, 없으면 0028 catch_bonus — 도망 없음)
async function reportCatch(t, c, fled) {
  if (!t.nonce || !S.online) return null;
  try {
    return await rpc('catch_result', { p_nonce: t.nonce, p_grade: c?.grade || 'none', p_curve: !!c?.curve, p_fled: !!fled }, { retries: 1 });
  } catch (e) {
    if (fled || !missingFn(e)) return null;
    return rpc('catch_bonus', { p_nonce: t.nonce, p_grade: c?.grade || 'none', p_curve: !!c?.curve }, { retries: 0 }).catch(() => null);
  }
}
const rarityFor = (sp) => (isSecret(sp.line_id) ? 'legendary' : lineOf(sp.line_id)?.mythic ? 'mythic' : lineOf(sp.line_id)?.rarity || 'common');
const tagFor = (sp) => (isSecret(sp.line_id) ? '★비밀 포켓몬 발견★' : lineOf(sp.line_id)?.mythic ? '★환상의 포켓몬★'
  : lineOf(sp.line_id)?.rarity === 'legendary' ? '★전설의 포켓몬★' : lineOf(sp.line_id)?.rarity !== 'common' ? '★희귀 포켓몬★' : '');
const throwText = (b) => (b?.exp > 0 ? `\n${{ nice: '나이스', great: '그레이트', excellent: '엑설런트' }[b.grade] || ''} 던지기! 경험치 +${b.exp}${b.levels ? ` (Lv.${b.level})` : ''}` : '');

// 한 마리 획득 축하 화면 (탭하면 닫힘)
async function showCatch(sp, { isNew, sub = '', bonus = null }) {
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
  // 등급 표시는 첫 줄에 따로 (문장 끝에 붙이면 좁은 폰에서 혼자 다음 줄로 떨어짐)
  const tag = tagFor(sp);
  await typeText(text, `${tag ? `${tag}\n` : ''}축하합니다! ${josa(sp.name, '을', '를')} 획득했습니다!${sub ? `\n(${sub})` : ''}${throwText(bonus)}${lucky ? `\n✦ ${lucky} ✦` : ''}`);
  text.append(h('span.more', '▼'));
  return ov;
}
// 도망쳤다 화면
async function showFled(sp, sub = '', next = '다른 QR을 찾아 다시 만나 봐요!') {
  const scene = h('div.scene.fled', h('span.spr', spriteCanvas(sp.id, 160)));
  const text = h('div.box.textbox', { style: { whiteSpace: 'pre-line' } });
  const ov = overlay(h('div.stage', scene, text), 'full');
  sfx.fail(); vibrate([40, 40, 40]);
  await typeText(text, `${josa(sp.name, '이', '가')} 도망쳤다…\n아쉽지만 이번에는 놓쳤어요.${sub ? `\n(${sub})` : ''}\n${next}`);
  text.append(h('span.more', '▼'));
  return ov;
}
// 남은 포켓몬 모두 바로 잡기 → 한 화면에 모아서 축하
async function showGroup(items) {
  const grid = h('div.catch-grid', items.map(({ sp, isNew }) => h('div.catch-cell',
    h('span.spr', spriteCanvas(sp.id, 96), isNew && h('span.new-badge.small', 'NEW')), h('small', sp.name))));
  const text = h('div.box.textbox', { style: { whiteSpace: 'pre-line' } });
  const ov = overlay(h('div.stage.group', h('div.scene.group-scene', h('div.rays'), grid), text), 'full');
  sfx.catch(); vibrate([80, 60, 160]);
  const nNew = items.filter((x) => x.isNew).length;
  await typeText(text, `축하합니다! 포켓몬 ${items.length}마리를 한 번에 획득했습니다!${nNew ? `\n새로 만난 포켓몬 ${nNew}마리 ★` : ''}`);
  text.append(h('span.more', '▼'));
  return ov;
}

export async function celebrate(tickets, prevLines) {
  if (celebrating) return;
  celebrating = true;
  if (S.overlay) closeOverlay();
  const list = tickets.filter((t) => speciesOf(t.species_id));
  let cfg = null; let changed = false;
  const done = async (t) => { S.celebrated.add(t.nonce); await kv.set('celebrated', [...S.celebrated]); };
  for (let i = 0; i < list.length; i++) {
    const t = list[i]; const sp = speciesOf(t.species_id);
    // 0028/0030: 먼저 몬스터볼로 잡기 (공 3개 다 빗나가면 아주 가끔 도망). 장면을 못 띄우면 바로 축하로
    let c = null;
    try {
      cfg ||= S.online ? await catchConfig() : { flee: 0 };
      const { catchScene } = await import('./catch.js');
      c = await catchScene({ dex: sp.id, name: sp.name, rarity: rarityFor(sp), ball: 'red', balls: 3,
        fleeChance: S.online && cfg.ok ? Number(cfg.flee) || 0 : 0, remaining: list.length - 1 - i });
    } catch { /* 잡기 장면 없이 */ }
    if (c?.fled) {
      await reportCatch(t, c, true);
      changed = true;
      await done(t);
      const ov = await showFled(sp, t.qr_name);
      await tapToContinue(ov); closeOverlay();
      continue;
    }
    if (c?.skipAll) {
      // 이번 것 + 남은 것 모두: 잡기 장면 없이 한 화면에서 축하 (등급 없음)
      const rest = list.slice(i);
      const items = rest.map((x) => { const s2 = speciesOf(x.species_id); const isNew = !prevLines.has(s2.line_id); prevLines.add(s2.line_id); return { sp: s2, isNew }; });
      await Promise.all(rest.map((x) => reportCatch(x, { grade: 'none' }, false)));
      for (const x of rest) S.celebrated.add(x.nonce);
      await kv.set('celebrated', [...S.celebrated]);
      const ov = rest.length > 1 ? await showGroup(items) : await showCatch(sp, { isNew: items[0].isNew, sub: t.qr_name });
      await tapToContinue(ov); closeOverlay();
      break;
    }
    const isNew = !prevLines.has(sp.line_id);
    prevLines.add(sp.line_id);
    const bonus = c ? await reportCatch(t, c, false) : null;
    const ov = await showCatch(sp, { isNew, sub: t.qr_name, bonus });
    await done(t);
    await tapToContinue(ov);
    closeOverlay();
  }
  celebrating = false;
  if (changed) await sync({ force: true });   // 도망친 포켓몬은 서버가 가져감 → 도감·점수 새로
  renderTab();
  if (await maybeDexComplete()) return;
  if (S.snap.quizzes?.length) openQuiz();
}

// ───────── 레이드 보스 잡기 (0030 raid_mode 'catch'): HAFS 볼 N개, 다 빗나가면 도망 · 걸어서 만난 야생 포켓몬 (0032): 몬스터볼 N개 ─────────
export const encounters = () => (S.snap?.encounters || []).filter((e) => !S.encDone?.has(e.id));
let encBusy = false;
// 사파리존 (0033): kind 'safari' = 사파리볼 enc.balls 개 (그날 남은 볼), '도망가기' 버튼.
//   0037: 공을 놓칠 때마다 safari_turn → 서버가 도망을 정함 (3세대처럼 25%에서 차례마다 +5%, 전설은 더). 도망치면 그 결과를 그대로 씀.
//   결과는 safari_result (던진 볼 수를 서버가 셈). 돌려줌 = 서버 결과 (r.safari = 바뀐 사파리 상태) 또는 undefined
export async function catchEncounter(enc) {
  if (!enc || encBusy || celebrating) return;
  const wild = enc.kind === 'wild'; const safari = enc.kind === 'safari';
  if (!S.online) return say(`${josa(safari ? '사파리존 포켓몬' : wild ? '야생 포켓몬' : '레이드 보스', '을', '를')} 잡으려면 인터넷이 필요해요. 와이파이나 데이터를 켜 주세요.`, true);
  const sp = speciesOf(enc.species_id);
  if (!sp) return;
  // 0036: 박스가 꽉 차면 잡을 수 없음 (만남은 그대로 남음 → 놓아준 뒤 다시)
  if (boxFull()) return say(`박스가 꽉 찼어요 (${boxMax()}마리). 가방 → 포켓몬에서 몇 마리를 놓아준 뒤에 잡아요.`, true);
  encBusy = true; celebrating = true;
  try {
    if (S.overlay) closeOverlay();
    const cfg = await catchConfig();
    const prev = new Set(collection().map((c) => c.line_id));
    let c = null;
    let turnRes = null;   // 사파리: safari_turn 에서 도망친 결과
    const onMiss = safari ? async () => { const t = await rpc('safari_turn', { p_id: enc.id }, { retries: 1 }); if (t?.fled) turnRes = t; return !!t?.fled; } : null;
    try {
      const { catchScene } = await import('./catch.js');
      c = safari
        ? await catchScene({ dex: sp.id, name: sp.name, rarity: lineOf(sp.line_id)?.rarity || 'common', ball: 'safari', balls: Number(enc.balls) || 1,
          fleeAfterAll: true, fleeMiss: Number(enc.flee) || 0, canRun: true, onMiss })
        : wild
        ? await catchScene({ dex: sp.id, name: sp.name, rarity: lineOf(sp.line_id)?.rarity || 'common', ball: 'red', balls: Number(enc.balls) || 5, fleeAfterAll: true })
        : await catchScene({ dex: sp.id, name: sp.name, rarity: lineOf(sp.line_id)?.mythic ? 'mythic' : 'legendary', ball: 'hafs',
          balls: Number(enc.balls) || Number(cfg.raid_balls) || 10, fleeAfterAll: cfg.raid_flee !== false });
    } catch { /* */ }
    // 장면을 못 띄웠으면 (레이드엔 바로 잡기 버튼이 없으니 skipped = 실패) 결과를 보내지 않음 → 기회는 그대로 남음
    if (!c || c.skipped) { toast('잡기 화면을 열지 못했어요. 잠시 뒤 홈에서 다시 도전해 주세요.', { kind: 'error' }); return; }
    let r;
    try {
      r = turnRes ? turnRes
        : safari
        ? await rpc('safari_result', { p_id: enc.id, p_throws: c.throws || 0, p_caught: !c.fled, p_grade: c.grade || 'none', p_curve: !!c.curve }, { retries: 1 })
        : await rpc('encounter_result', { p_id: enc.id, p_caught: !c.fled, p_grade: c.grade || 'none', p_curve: !!c.curve }, { retries: 1 });
    } catch (e) {
      if (e.offline) toast('결과를 보내지 못했어요. 인터넷이 연결되면 홈에서 다시 도전할 수 있어요.', { kind: 'error' });
      else { toast(errorText(e.message)); if (e.message !== 'BOX_FULL') (S.encDone ||= new Set()).add(enc.id); }
      return;
    }
    (S.encDone ||= new Set()).add(enc.id);
    // 서버가 잡은 보스를 특별 티켓으로 바로 바꿔 줌 → 다음 sync 에서 또 축하하지 않게 미리 표시
    if (r?.nonce) { S.celebrated.add(r.nonce); await kv.set('celebrated', [...S.celebrated]); }
    const sp2 = speciesOf(r?.species_id) || sp;
    const fled = r ? !!r.fled || r.caught === false : !!c.fled;
    const sub = safari ? '사파리존' : wild ? '야생 포켓몬' : enc.raid_title || '레이드 보스';
    if (fled && c.ran) return r;      // 사파리존에서 스스로 도망 → 알림 없이 맵으로
    const ov = fled ? await showFled(sp2, sub, safari ? '풀숲을 걷다 보면 또 만날 수 있어요!' : wild ? '걷다 보면 또 다른 포켓몬을 만날 수 있어요!' : '다음 레이드에서 다시 도전해 봐요!')
      : await showCatch(sp2, { isNew: r?.new ?? !prev.has(sp2.line_id), sub, bonus: r?.exp > 0 ? { ...r, grade: c.grade } : null });
    await tapToContinue(ov); closeOverlay();
    return r;
  } finally {
    encBusy = false; celebrating = false;
    await sync({ force: true }).catch(() => {});
    renderTab();
  }
}

export function openQuiz() {
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
      ? (r.granted ? '정답! 진화의 돌을 1개 얻었다! (돌로 진화하는 포켓몬이나, 진화 레벨 전에 쓸 수 있어요)' : '정답! (이번엔 진화의 돌이 없었어요)')
      : `아쉬워요! ${josa(sp?.name || '포켓몬', '이', '가')} 고개를 젓는다…`));
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

// ───────────────────────── overlays (with history so Android "back" closes them) ─────────────────────────

export function overlay(content, kind = '') {
  const replacing = !!S.overlay;
  if (replacing) closeOverlay({ replacing: true });
  const ov = h(`div.overlay${kind ? '.' + kind : ''}`, { role: 'dialog', 'aria-modal': 'true' }, content);
  document.body.append(ov);
  S.overlay = ov;
  if (replacing && history.state?.ov) history.replaceState({ ov: true, tab: S.tab }, '');
  else history.pushState({ ov: true, tab: S.tab }, '');
  return ov;
}

export function sheet(content, { dismissable = true } = {}) {
  const ov = overlay(h('div.sheet', content));
  if (dismissable) ov.addEventListener('click', (e) => { if (e.target === ov) closeOverlay(); });
  ov.dataset.locked = dismissable ? '' : '1';
  return ov;
}

export function closeOverlay({ fromPop = false, replacing = false } = {}) {
  const ov = S.overlay;
  if (!ov) return;
  if (fromPop && ov.dataset.locked === '1') { history.pushState({ ov: true, tab: S.tab }, ''); return; }  // quiz/onboarding: back does nothing
  S.overlay = null;
  ov.onclose?.();
  ov.remove();
  if (!fromPop && !replacing && history.state?.ov) { ignorePop++; history.back(); }
}

export function tapToContinue(ov) {
  return new Promise((resolve) => {
    setTimeout(() => ov.addEventListener('click', () => resolve(), { once: true }), 250);
  });
}

boot();
