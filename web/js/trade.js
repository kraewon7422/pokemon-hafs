// 포켓몬 교환 (0056): 친구와 얼굴 보고 1 대 1. 친구 배틀 QR 을 찍고 [포켓몬 교환하기] → 두 폰에 교환방.
// 서버가 모든 규칙을 확인하고 (교환 가능한 포켓몬 · 하루 횟수 · 바뀌면 확인 풀림) 두 사람이 모두 [교환하기] 를 누르면 한 번에 바꿈.
// 방은 1.5초마다 trade_state 로 새로 봄. 그림 canvas 는 포켓몬마다 하나만 만들어 다시 씀 (깜빡임 없음).
import { rpc, errorText } from './sb.js';
import { spriteCanvas, monSprite } from './sprites.js';
import { sfx } from './sfx.js';
import { h, $, josa, toast, sleep, reducedMotion, typeText } from './ui.js';
import { S, speciesOf, abilityOf, mons, vibrate } from './state.js';
import { overlay, closeOverlay, sheet, say, sync, renderTab, openScanner } from './app.js';
import { typeChips, evolutionScene } from './dex.js';
import { itemOf, loadBag, boxLabel, openBagScreen } from './bag.js';
import { moveOf, showBattleQr, BALL_SVG } from './battle.js';

// 교환 진화 (서버 _trade_evo 와 같은 도감 번호)
const TRADE_EVO_NAMES = '윤겔라 · 근육몬 · 데구리 · 고우스트 · 암트르 · 토쇠골';
// 못 고르는 칸에 붙는 짧은 글 (자세한 이유는 누르면 errorText)
const TAG = {
  TRADE_SHINY: '반짝', TRADE_TEACHER: '선생님', TRADE_EVENT: '이벤트', TRADE_SPECIAL: '특별', TRADE_ULTRA: '울트라',
  TRADE_LEGEND: '전설', TRADE_PARTNER: '카드', TRADE_IN_TEAM: '배틀 팀', TRADE_BUSY: '배틀 중', TRADE_NO_MON: '없음',
};

let room = null;          // 지금 열린 교환방 { id, t, view, busy, ... }
const seen = new Set();   // 자동으로 연 적 있는 방 (닫은 방을 또 자동으로 열지 않음)

const nameOf = (t) => t?.name || '친구';
const spName = (id) => speciesOf(id)?.name || '???';

// 친구 배틀 QR 을 찍은 쪽: 교환방 열기
export async function openTradeByCode(code) {
  if (!S.online) return say('교환은 인터넷이 필요해요. 와이파이나 데이터를 켜 주세요.', true);
  if (!mons().length) return say('교환하려면 먼저 포켓몬을 모아요!', true);
  try {
    const t = await rpc('trade_open', { p_code: code }, { retries: 0 });
    seen.add(t.id);
    openRoom(t);
  } catch (e) { sfx.error(); say(errorText(e.message), true); }
}

// QR 을 보여 주는 동안 (el 이 화면에 있는 동안): 친구가 교환방을 열었는지 1.5초마다
let watchTimer = null;
export function watchTradeWhile(el) {
  clearInterval(watchTimer);
  watchTimer = setInterval(async () => {
    if (!el.isConnected) { clearInterval(watchTimer); return; }
    if (document.hidden || !S.online) return;
    try {
      const t = await rpc('trade_current', {}, { retries: 0 });
      if (t?.status === 'open' && el.isConnected) {
        clearInterval(watchTimer);
        seen.add(t.id); sfx.scan(); vibrate([60, 40, 60]);
        openRoom(t);
      }
    } catch { /* offline */ }
  }, 1500);
}

// 홈 · 배틀 탭: 15초마다 열린 방 확인 (QR 화면을 닫은 뒤 친구가 열었어도)
export async function pollTrade(force = false) {
  if (document.hidden || !S.online || !S.snap || !$('nav.tabs')) return;
  if (!force && !['home', 'battle'].includes(S.tab)) return;
  if (room) return;
  try {
    const t = await rpc('trade_current', {}, { retries: 0 });
    const before = S.tradeOpen?.id ?? null;
    S.tradeOpen = t?.status === 'open' ? t : null;
    if (S.tradeOpen && !S.overlay && !seen.has(t.id)) { seen.add(t.id); sfx.scan(); vibrate([60, 40, 60]); openRoom(t); return; }
    if (before !== (S.tradeOpen?.id ?? null) && S.tab === 'battle' && !S.overlay) renderTab();
  } catch { /* offline */ }
}
setInterval(pollTrade, 15000);

// 배틀 탭 · 가방에서 보이는 교환 칸
export function tradeBox() {
  const open = S.tradeOpen;
  return h('div.box.stack.trade-box',
    h('div.banner', h('b', '포켓몬 교환'), S.tradeToday ? h('span.chip', `오늘 ${S.tradeToday.today}/${S.tradeToday.max}`) : null),
    h('p', { style: { margin: 0 } }, '친구와 만나서 포켓몬을 1마리씩 바꿔요. 친구가 내 QR을 찍고 [포켓몬 교환하기]를 누르면 두 폰에 교환방이 열려요.'),
    S.tradeToday?.open === false ? h('small.warn-txt', errorText('TRADE_CLOSED')) : null,
    open && h('button.btn.big.gold', { onclick: () => resumeTrade(open.id) }, `${josa(nameOf(open), '과', '와')} 하던 교환 이어 하기`),
    h('button.btn.big', { onclick: () => showBattleQr('trade') }, '내 교환 QR 보여주기'),
    h('button.btn.big', { disabled: !mons().length, onclick: openScanner }, '친구 QR 찍어서 교환'),
    h('small.muted', `교환할 수 있는 포켓몬 = 야생 · 사파리에서 잡은 보통 포켓몬. 반짝이 · 선생님 · 전설 · 이벤트 · 울트라비스트, 배틀 팀 · 카드 포켓몬은 교환할 수 없어요. ${TRADE_EVO_NAMES}은 교환하면 진화해요!`));
}
export function tradeMenu() {
  sfx.select();
  sheet(h('div.stack', tradeBox(), h('button.btn', { onclick: () => closeOverlay() }, '닫기')));
  loadToday();
}
export async function loadToday() {
  try {
    const c = await rpc('trade_check', {}, { retries: 0 });
    const was = JSON.stringify(S.tradeToday || null);
    S.tradeToday = { today: c.today, max: c.max, open: c.open };
    if (was !== JSON.stringify(S.tradeToday) && S.tab === 'battle' && !S.overlay) renderTab();
  } catch { /* offline */ }
}

export async function resumeTrade(id) {
  try { const t = await rpc('trade_state', { p_id: id }, { retries: 0 }); seen.add(t.id); openRoom(t); }
  catch (e) { say(errorText(e.message), true); S.tradeOpen = null; renderTab(); }
}

// ───────── 교환방 ─────────
function stopRoom() {
  if (!room) return;
  clearInterval(room.timer);
  room = null;
}

function openRoom(t0) {
  stopRoom();
  const r = { id: t0.id, t: t0, view: 'room', busy: false, done: false, key: '', pics: new Map(), check: null };
  room = r;
  r.root = h('div.trade-room');
  r.ov = overlay(r.root, 'full');
  r.ov.classList.add('trade-overlay');
  r.ov.onclose = () => { if (room === r) stopRoom(); };
  draw(r, true);
  r.timer = setInterval(() => tick(r), 1500);
  loadBag({ notify: false }).catch(() => {});
  if (t0.status === 'done') { r.done = true; clearInterval(r.timer); celebrate(r); }
}

async function tick(r) {
  if (room !== r || r.busy || document.hidden) return;
  try {
    const t = await rpc('trade_state', { p_id: r.id }, { retries: 0 });
    if (room === r && !r.busy) update(r, t);
  } catch { /* 잠깐 끊김: 다음에 다시 */ }
}

function update(r, t) {
  const prev = r.t;
  r.t = t;
  if (t.status === 'done') {
    if (!r.done) { r.done = true; clearInterval(r.timer); celebrate(r); }
    return;
  }
  if (t.status !== 'open') { clearInterval(r.timer); r.view = 'room'; S.tradeOpen = null; }
  if (prev?.theirs?.id !== t.theirs?.id && t.theirs) sfx.blip();
  if (!prev?.ok_them && t.ok_them) { sfx.select(); vibrate(40); }
  if (t.note && t.note !== prev?.note) { sfx.error(); toast(errorText(t.note), 4000); }
  if (r.view === 'room') draw(r);
}

// 포켓몬 그림 (포켓몬 · 종마다 하나)
function pic(r, m, size = 72) {
  const k = `${m.id}:${m.species_id}:${size}`;
  if (!r.pics.has(k)) r.pics.set(k, monSprite(m.species_id, size, { shiny_on: !!m.shiny }));
  return r.pics.get(k);
}

function card(r, m, mine, ok) {
  const t = r.t;
  const who = mine ? '내가 보낼 포켓몬' : '상대가 보낼 포켓몬';
  if (!m) {
    return h('div.trade-card.empty', h('small.trade-who', who),
      h('div.trade-pic', h('span.trade-wait', { html: BALL_SVG })),
      h('b.trade-name', mine ? '아직 안 골랐어요' : '고르는 중…'));
  }
  const sp = speciesOf(m.species_id);
  const ab = abilityOf(m.ability);
  const moves = (m.moves || []).map((id) => moveOf(id)?.name).filter(Boolean);
  const name = h('b.trade-name', sp?.name || '???');
  name.style.setProperty('--len', String([...(sp?.name || '???')].length));
  return h(`div.trade-card${ok ? '.ok' : ''}`, h('small.trade-who', who),
    h('div.trade-pic', pic(r, m)), name,
    h('small.trade-lv', `Lv.${m.level}`),
    sp ? h('span.types', typeChips(sp)) : null,
    ab ? h('small.trade-ab', `특성 ${ab.name}`) : null,
    moves.length ? h('small.trade-moves', moves.join(' · ')) : null,
    m.held ? h('small.muted', `지닌 물건 ${itemOf(m.held)?.name || ''}은 ${mine ? '내' : '친구'} 가방으로 돌아가요`) : null,
    ok ? h('span.trade-ok', '준비 완료') : null);
}

function statusText(t) {
  const n = nameOf(t);
  if (t.status === 'cancelled') {
    if (t.why === 'daily_max') return errorText('TRADE_DAILY_MAX');
    if (t.why === 'closed') return errorText('TRADE_CLOSED');
    return t.ended_by_me ? '교환을 그만뒀어요.' : `${josa(n, '이', '가')} 교환을 그만뒀어요.`;
  }
  if (t.status === 'expired') return '한동안 아무것도 안 해서 교환방이 닫혔어요. QR을 다시 찍어 주세요.';
  if (!t.joined) return `${n}의 폰에 교환방이 열리기를 기다리는 중…`;
  if (!t.them_here) return '상대가 교환 화면을 나갔어요. 돌아오기를 기다리는 중…';
  if (!t.mine && !t.theirs) return '보낼 포켓몬을 골라 주세요. 상대도 고르는 중이에요.';
  if (!t.mine) return '보낼 포켓몬을 골라 주세요.';
  if (!t.theirs) return '상대가 고르는 중…';
  if (t.ok_me && !t.ok_them) return '교환하기를 눌렀어요. 상대를 기다리는 중…';
  if (!t.ok_me && t.ok_them) return '상대가 교환하기를 눌렀어요! 확인하고 교환하기를 눌러요.';
  return '서로의 포켓몬을 확인하고 교환하기를 눌러요.';
}

function draw(r, force = false) {
  if (room !== r) return;
  if (r.view === 'pick') return pickView(r);
  const t = r.t;
  // 바뀐 것이 없으면 그대로 (1.5초마다 다시 그리지 않음)
  const { server_time: _s, expires_at: _e, ...rest } = t;
  const key = JSON.stringify(rest) + r.busy;
  if (!force && key === r.key) return;
  r.key = key;
  const open = t.status === 'open';
  const both = !!(t.mine && t.theirs);
  r.root.replaceChildren(
    h('div.trade-head', h('b', '포켓몬 교환'), h('span.chip', `${nameOf(t)}`)),
    h('div.trade-sides', card(r, t.mine, true, t.ok_me), h('div.trade-arrow', { 'aria-hidden': 'true' }, '⇄'), card(r, t.theirs, false, t.ok_them)),
    h('p.trade-status', { role: 'status', 'aria-live': 'polite' }, statusText(t)),
    open ? h('div.trade-btns',
      h('button.btn.big.primary', { disabled: !both || t.ok_me || r.busy, onclick: () => confirmTrade(r) }, t.ok_me ? '교환하기를 눌렀어요' : '교환하기'),
      h('button.btn.big', { disabled: r.busy, onclick: () => { sfx.blip(); r.view = 'pick'; draw(r); } }, t.mine ? '다른 포켓몬 고르기' : '보낼 포켓몬 고르기'),
      h('button.btn', { disabled: r.busy, onclick: () => cancelTrade(r) }, '교환 그만두기'),
      h('small.muted', `고른 포켓몬이 바뀌면 두 사람 모두 교환하기를 다시 눌러야 해요. 오늘 교환 ${t.today}/${t.max}`))
      : h('div.trade-btns', h('button.btn.big', { onclick: () => closeOverlay() }, '닫기')));
}

async function pickView(r) {
  const err = h('div.err');
  const grid = h('div.box-grid.trade-pick', h('small.muted', '불러오는 중…'));
  const back = () => { sfx.blip(); r.view = 'room'; draw(r, true); };
  r.root.replaceChildren(
    h('div.trade-head', h('b', '보낼 포켓몬 고르기'), h('button.btn.small', { onclick: back }, '뒤로')),
    h('small', '반짝이 · 선생님 · 전설 · 이벤트 · 울트라비스트, 배틀 팀 · 카드 포켓몬은 교환할 수 없어요. 회색 칸을 누르면 이유가 보여요.'),
    grid, err,
    r.t.mine ? h('button.btn', { onclick: () => offer(r, null, err) }, '고른 포켓몬 내려놓기') : null,
    h('button.btn', { onclick: back }, '뒤로'));
  try {
    const [chk] = await Promise.all([rpc('trade_check', {}, { retries: 0 }), loadBag({ notify: false })]);
    r.check = chk;
    S.tradeToday = { today: chk.today, max: chk.max, open: chk.open };
  } catch (e) { grid.replaceChildren(h('small.warn-txt', errorText(e.message))); return; }
  if (room !== r || r.view !== 'pick') return;
  const why = r.check?.why || {};
  const box = [...(S.bag?.box || [])].sort((a, b) => (!!why[a.id] - !!why[b.id]) || (a.pos ?? 999) - (b.pos ?? 999));
  if (!box.length) { grid.replaceChildren(h('small', '박스에 포켓몬이 없어요.')); return; }
  grid.replaceChildren(...box.map((m) => {
    const w = why[m.id];
    const sp = speciesOf(m.species_id);
    const on = r.t.mine?.id === m.id;
    return h(`button.box-cell${w ? '.trade-no' : ''}${on ? '.on' : ''}`, {
      type: 'button', 'aria-disabled': w ? 'true' : null, 'aria-label': `${sp?.name || '포켓몬'} Lv.${m.level}${w ? ` (${TAG[w] || '불가'})` : ''}`,
      onclick: () => { if (w) { sfx.error(); err.textContent = errorText(w); return; } offer(r, m.id, err); },
    }, monSprite(m.species_id, 40, m), h('small', w ? (TAG[w] || '불가') : `Lv.${m.level}`));
  }));
}

async function offer(r, id, err) {
  if (r.busy) return;
  r.busy = true;
  try {
    const t = await rpc('trade_offer', { p_id: r.id, p_mon: id }, { retries: 0 });
    sfx.select();
    r.busy = false; r.view = 'room';
    update(r, t); draw(r, true);
  } catch (e) { r.busy = false; sfx.error(); if (err) err.textContent = errorText(e.message); else toast(errorText(e.message)); }
}

async function confirmTrade(r) {
  if (r.busy) return;
  r.busy = true; draw(r, true);
  try {
    const t = await rpc('trade_confirm', { p_id: r.id, p_rev: r.t.rev }, { retries: 0 });
    r.busy = false;
    sfx.blip();
    update(r, t);
    if (r.view === 'room' && !r.done) draw(r, true);
  } catch (e) {
    r.busy = false; sfx.error(); toast(errorText(e.message), 4000);
    try { update(r, await rpc('trade_state', { p_id: r.id }, { retries: 0 })); } catch { /* */ }
    draw(r, true);
  }
}

async function cancelTrade(r) {
  if (r.busy) return;
  r.busy = true;
  try { const t = await rpc('trade_cancel', { p_id: r.id }, { retries: 0 }); r.busy = false; update(r, t); draw(r, true); }
  catch (e) { r.busy = false; toast(errorText(e.message)); }
  S.tradeOpen = null;
}

// 교환 성공: 볼 두 개가 화면을 가로질러 바뀜 → (교환 진화) → 받은 포켓몬
async function celebrate(r) {
  const t = r.t; const res = t.result || {};
  S.tradeOpen = null;
  const gaveSp = res.gave_sp; const gotSp = res.got_sp;
  const left = h('div.trade-fly.l', spriteCanvas(gaveSp, 96));
  const right = h('div.trade-fly.r', spriteCanvas(gotSp, 96));
  const ballL = h('span.trade-ball.l', { html: BALL_SVG });
  const ballR = h('span.trade-ball.r', { html: BALL_SVG });
  const text = h('div.box.textbox');
  const stage = h('div.trade-anim', left, right, ballL, ballR);
  r.root.replaceChildren(h('div.trade-head', h('b', '포켓몬 교환'), h('span.chip', nameOf(t))), stage, text);
  const fast = reducedMotion();
  await typeText(text, `${josa(spName(gaveSp), '을', '를')} 보낸다!`);
  if (!fast) {
    stage.classList.add('in'); sfx.ballThrow(); await sleep(500);
    stage.classList.add('go'); await sleep(1300);
    stage.classList.add('out'); sfx.ballPop(); await sleep(400);
  } else stage.classList.add('in', 'go', 'out');
  sfx.fanfare(); vibrate([60, 40, 120]);
  await typeText(text, `${josa(nameOf(t), '에게서', '에게서')} ${josa(spName(gotSp), '을', '를')} 받았다!`);
  await sleep(900);
  sync({ force: true });
  loadBag({ notify: false }).catch(() => {});
  if (room !== r) return;
  let final = gotSp;
  if (res.evolved_to) {
    stopRoom();
    await evolutionScene(gotSp, res.evolved_to, true);   // 진화 장면 (닫히면 renderTab)
    final = res.evolved_to;
  } else stopRoom();
  const sp = speciesOf(final);
  sheet(h('div.stack.trade-result',
    h('b.bt-alert', '교환 성공!'),
    h('div.trade-pic', monSprite(final, 96, {})),
    h('p', { style: { margin: 0 } }, `${josa(nameOf(t), '에게서', '에게서')} ${josa(sp?.name || '포켓몬', '을', '를')} 받았어요! (Lv.${res.level ?? '?'})`),
    res.evolved_to ? h('small', `교환하자마자 ${josa(spName(gotSp), '이', '가')} ${josa(sp?.name || '', '으로', '로')} 진화했어요!`) : null,
    res.pos != null ? h('small.muted', `${boxLabel(res.pos)}에 들어갔어요.`) : null,
    res.no_dex ? h('small.warn-txt', '되돌려 받은 교환이라 이 포켓몬은 도감에 새로 등록되지 않아요.') : null,
    res.held_back ? h('small.muted', `보낸 포켓몬이 지니고 있던 ${itemOf(res.held_back)?.name || '물건'}은 내 가방으로 돌아왔어요.`) : null,
    h('small.muted', `오늘 교환 ${t.today}/${t.max}`),
    h('button.btn.big.primary', { onclick: () => { closeOverlay(); openBagScreen('box'); } }, '박스에서 보기'),
    h('button.btn', { onclick: () => { closeOverlay(); renderTab(); } }, '닫기')));
}
