// 배틀 (0015·0016): 계산은 전부 서버. 폰은 고른 것만 보내고, 서버 기록(log)을 3세대 느낌으로 재생한다.
import { rpc, errorText } from './sb.js';
import { drawQR } from './qrfmt.js';
import { spriteCanvas } from './sprites.js';
import { sfx, unlockAudio, startBgm, stopBgm } from './sfx.js';
import { h, $, josa, toast, typeText, sleep, reducedMotion, pix } from './ui.js';
import { S, collection, isWithdrawn, vibrate } from './state.js';
import { closeOverlay, openScanner, overlay, renderTab, say, sheet, sync } from './app.js';
import { typeOf } from './dex.js';
import { curSpecies } from './raid.js';
import { itemIcon, itemOf, loadBag } from './bag.js';

// ───────── 배틀 (0015·0016): 계산은 전부 서버. 폰은 고른 것만 보내고, 서버 기록(log)을 3세대 느낌으로 재생한다 ─────────
// 자리(slot) u = 쪽×2 + 자리 번호. 1 대 1 은 자리 0·2 만, 2 대 2 는 0~3 모두.
export const isBattleQr = (q) => q === 'BTL';
export const ST_LABEL = { par: '마비', brn: '화상', psn: '독', slp: '잠듦', frz: '얼음' };
const stText = (m) => [m?.st ? ST_LABEL[m.st] : '', m?.cnf > 0 ? '혼란' : ''].filter(Boolean).join(' ');
// 상성 (서버 _bt_tm 과 같음): 전설은 모두 ×1, 전설끼리 ×2
export function effOf(atk, def) {
  if (atk === '전설' || def === '전설') return atk === def ? 2 : 1;
  const c = (S.catalog.typeChart || []).find((x) => x.atk === atk && x.def === def);
  return c ? Number(c.mult) : 1;
}
export const effTag = (mult) => (mult > 1 ? h('span.eff.up', '효과가 굉장하다!') : mult === 0 ? h('span.eff.zero', '효과가 없다') : mult < 1 ? h('span.eff.down', '효과가 별로인 듯하다') : null);
const FX_ROW = { par: 0, brn: 1, psn: 2, frz: 3, heal: 4, slp: 5, cnf: 6, flinch: 7 };   // web/img/fx/status.png 줄 순서 (tools/draw_fx.py)

export const FMT = { single: { n: 3, label: '1 대 1', long: '1 대 1 (3마리)' }, double: { n: 4, label: '2 대 2', long: '2 대 2 (4마리)' } };
// 배경: isaiah658 의 픽셀 팩 #2 (CC0, web/img/battle/CREDITS.txt). 배틀마다 다르게
export const BT_BG = ['plains', 'forest', 'beach', 'desert', 'snowy', 'underground', 'underwater'];
export const moveOf = (id) => (S.catalog.moves || []).find((m) => m.id === id);
export const BT_WHY = {
  practice: '연습 배틀이라 보상은 없어요.',
  same_opp: '같은 친구에게는 하루 한 번만 보상이 있어요.',
  daily_max: '오늘 받을 수 있는 배틀 보상은 다 받았어요.',
};

// 내 배틀 팀 = 저장한 팀 (아직 가지고 있는 것만), 없으면 가장 높은 단계부터. n = 3 (1 대 1) / 4 (2 대 2)
export function myTeam(n = 3) {
  const mine = collection().filter((c) => !isWithdrawn(c.line_id));
  const have = new Set(mine.map((c) => c.line_id));
  const saved = (S.btTeam || []).filter((l) => have.has(l));
  const rest = [...mine].sort((a, b) => b.stage - a.stage || b.catch_count - a.catch_count).map((c) => c.line_id).filter((l) => !saved.includes(l));
  return [...saved, ...rest].slice(0, n);
}

export async function loadBattleToday() {
  S.btTodayAt = Date.now();
  try {
    [S.btToday, S.btRecent] = await Promise.all([rpc('battle_today', {}, { retries: 0 }), rpc('battle_recent', {}, { retries: 0 }).catch(() => [])]);
    if (!S.btTeam && S.btToday?.team) S.btTeam = S.btToday.team;
    if (S.tab === 'battle' && !S.overlay) renderTab();
  } catch { /* offline */ }
}

// "배틀 신청!" 확인: 홈·배틀 탭을 보고 있을 때만 15초마다 (서버 부담 줄이기)
export async function pollInbox(force = false) {
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

export const livePvp = () => S.btInbox?.active?.mode === 'pvp' && S.btInbox.active.status === 'active' ? S.btInbox.active : null;

export function teamStrip(team, size = 56) {
  return team.length
    ? h('div.bt-team', team.map((l) => {
      const sp = curSpecies(l);
      const lv = (S.bag?.box || []).find((x) => x.line === l)?.level;
      return h('div', spriteCanvas(sp.id, size), h('small', sp.name, lv ? ` Lv.${lv}` : ''), h(`span.type.t-${typeOf(sp)}`, typeOf(sp)));
    }))
    : h('p', '아직 몬스터가 없어요. QR을 찍어 몬스터를 먼저 모아요!');
}

export function fmtSeg(cur, onpick) {
  return h('div.seg.bt-fmt', { role: 'group', 'aria-label': '배틀 형식' }, Object.entries(FMT).map(([k, f]) =>
    h('button', { 'aria-pressed': String(cur === k), onclick: () => { sfx.blip(); onpick(k); } }, f.long)));
}

export function typeTable() {
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

export function viewBattle() {
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
    (S.btRecent || []).length > 0 && h('div.box.stack',
      h('b', '최근 배틀한 친구'),
      h('small.muted', 'QR 없이 바로 다시 붙을 수 있어요. 형식은 친구가 정해 둔 대로예요.'),
      S.btRecent.map((r) => h('div.bt-recent',
        h('span', h('b', r.name), h('small', ` ${FMT[r.format]?.label || ''} · ${r.won ? '이김' : '짐'}`)),
        h('button.btn.small.primary', { disabled: !!pvp, onclick: () => { S.btPeekFmt = r.format; startBattle('pvp', r.code); } }, '실시간 신청'),
        h('button.btn.small', { disabled: !!pvp, onclick: () => { S.btPeekFmt = r.format; startBattle('team', r.code); } }, 'AI 팀과')))),
    h('details.box.stack', h('summary', h('b', '타입 상성표')), typeTable()),
  ];
}

export function teamPicker() {
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

export async function showBattleQr() {
  sfx.select();
  let code = S.btToday?.code; let fmt = S.btToday?.format || 'single'; let fair = !!S.btToday?.fair;
  try { if (!code) code = await rpc('battle_code', {}, { retries: 0 }); } catch (e) { return say(errorText(e.message), true); }
  if (S.btToday) S.btToday.code = code;
  const canvas = h('canvas', { 'aria-label': '내 배틀 QR' });
  drawQR(canvas, `BTL.${code.toUpperCase()}`, { cell: 6, margin: 4, ecc: 'L' });
  const segBox = h('div'); const teamBox = h('div');
  const draw = () => {
    segBox.replaceChildren(fmtSeg(fmt, async (k) => {
      try { await rpc('battle_code', { p_format: k }, { retries: 0 }); fmt = k; if (S.btToday) S.btToday.format = k; draw(); }
      catch (e) { toast(errorText(e.message)); }
    }), h('div.seg.bt-fmt', { role: 'group', 'aria-label': '레벨' }, [[false, '내 레벨 그대로'], [true, '공정 모드 (모두 Lv.50)']].map(([v, t]) =>
      h('button', { 'aria-pressed': String(fair === v), onclick: async () => {
        try { sfx.blip(); await rpc('battle_code', { p_fair: v }, { retries: 0 }); fair = v; if (S.btToday) S.btToday.fair = v; draw(); }
        catch (e) { toast(errorText(e.message)); }
      } }, t))),
    fair ? h('small.muted', '공정 모드: 양쪽 모두 Lv.50, 회복약을 쓸 수 없어요.') : '');
    teamBox.replaceChildren(teamStrip(myTeam(FMT[fmt].n), 44));
  };
  draw();
  sheet(h('div.stack',
    h('div.bagqr', h('b', '내 배틀 QR'), canvas, h('small', '친구가 이 QR을 찍으면 나와 배틀할 수 있어요.')),
    h('b', '어떤 배틀을 할까? (친구는 이 형식으로 싸워요)'), segBox,
    h('b', '내 배틀 팀'), teamBox,
    h('button.btn', { onclick: () => closeOverlay() }, '닫기')));
}

export async function friendBattleSheet(code) {
  if (!collection().length) return say('배틀하려면 먼저 몬스터를 모아요!', true);
  if (!S.online) return say('배틀은 인터넷이 필요해요. 와이파이나 데이터를 켜 주세요.', true);
  let pk;
  try { pk = await rpc('battle_peek', { p_code: code }, { retries: 0 }); } catch (e) { sfx.error(); return say(errorText(e.message), true); }
  const f = FMT[pk.format] || FMT.single;
  sfx.scan(); vibrate(80);
  sheet(h('div.stack',
    h('b', pix('spark'), ` ${josa(pk.name, '의', '의').slice(0, -1)}의 배틀 QR!`),
    h('p', { style: { margin: 0 } }, h('b', f.long), pk.fair ? h('b', ' · 공정 모드 (모두 Lv.50)') : null, ' 배틀이에요. 내 배틀 팀으로 어떻게 겨룰까요?'),
    teamStrip(myTeam(f.n), 44),
    h('button.btn.big.primary', { onclick: () => startBattle('pvp', code) }, '실시간 배틀 신청 (친구가 수락하면 시작)'),
    h('button.btn.big', { onclick: () => startBattle('team', code) }, '친구 팀과 AI 배틀 (바로 시작)'),
    h('small.muted', '이기면 진화권 1장 (하루 3번 · 같은 친구는 하루 1번)'),
    h('button.btn', { onclick: () => closeOverlay() }, '닫기')));
  S.btPeekFmt = pk.format;
}

export function inviteSheet(inv) {
  const f = FMT[inv.format] || FMT.single;
  sheet(h('div.stack',
    h('b.bt-alert', pix('spark'), ' 배틀 신청!'),
    h('p', { style: { margin: 0 } }, `${josa(inv.from, '이', '가')} ${f.long} 실시간 배틀을 신청했어요. 1분 안에 수락해야 시작돼요.`),
    teamStrip(myTeam(f.n), 44),
    h('button.btn.big.primary', { onclick: () => acceptInvite(inv), disabled: !collection().length }, '수락하고 배틀!'),
    h('button.btn', { onclick: () => declineInvite(inv) }, '거절')));
}

export async function acceptInvite(inv) {
  try { openBattle(await rpc('battle_accept', { p_id: inv.id, p_lines: myTeam((FMT[inv.format] || FMT.single).n) }, { retries: 0 })); }
  catch (e) { sfx.error(); say(errorText(e.message), true); pollInbox(true); }
}
export async function declineInvite(inv) {
  try { await rpc('battle_decline', { p_id: inv.id }, { retries: 0 }); } catch { /* ignore */ }
  if (S.overlay) closeOverlay();
  if (S.btInbox) S.btInbox.invites = (S.btInbox.invites || []).filter((x) => x.id !== inv.id);
  renderTab();
}

export async function startBattle(mode, code, fmt) {
  const n = FMT[mode === 'cpu' ? fmt : S.btPeekFmt || 'single']?.n || 3;
  const team = myTeam(n);
  if (!team.length) return say('배틀하려면 먼저 몬스터를 모아요!', true);
  if (!S.online) return say('배틀은 인터넷이 필요해요. 와이파이나 데이터를 켜 주세요.', true);
  try {
    const args = mode === 'cpu' ? { p_lines: team, p_format: fmt } : { p_code: code, p_lines: team };
    openBattle(await rpc({ cpu: 'battle_start_cpu', team: 'battle_start_team', pvp: 'battle_challenge' }[mode], args, { retries: 0 }));
  } catch (e) { sfx.error(); say(errorText(e.message), true); if (e.message === 'IN_PVP_BATTLE') pollInbox(true); }
}

export async function resumeBattle(id) {
  try { openBattle(await rpc('battle_state', { p_id: id }, { retries: 0 })); } catch (e) { say(errorText(e.message), true); }
}

// 몬스터볼 (도트): 위 빨강 · 가운데 검은 띠 · 아래 하양
export const BALL_SVG = '<svg viewBox="0 0 8 8" width="16" height="16" shape-rendering="crispEdges"><path fill="#182030" d="M2 0h4v1h1v1h1v4h-1v1h-1v1h-4v-1h-1v-1h-1v-4h1v-1h1z"/><path fill="#f04830" d="M2 1h4v1h1v2h-6v-2h1z"/><path fill="#fff" d="M1 5h6v1h-1v1h-4v-1h-1z"/><path fill="#fff" d="M3 3h2v2h-2z"/><path fill="#182030" d="M3.5 3.5h1v1h-1z"/></svg>';

export function openBattle(b0) {
  unlockAudio();
  loadBag({ notify: false }).catch(() => {});
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
      name: h('b'), lv: h('small'), st: h('span.bt-st'), hp: h('i'), hpNum: h('small.bt-hpnum'), balls: h('div.bt-balls'), box: null, u,
    };
  };
  const SL = [0, 1, 2, 3].map(mk);
  for (const x of SL) {
    const mine = (x.u >> 1) === me();
    x.box = h(`div.bt-box${mine ? '.me' : '.foe'}`, h('div.bt-nm', x.name, x.lv, x.st), h('div.hpbar', x.hp),
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
  const showMon = (u, idx, { hp, sp, name, max, lv } = {}) => {
    view.act[u] = idx;
    const s = u >> 1; const m = monAt(s, idx) || {};
    const x = SL[u];
    const spId = sp ?? m.sp;
    x.spr.classList.remove('faint', 'hit', 'atk', 'gone');
    if (spId && x.bob.dataset.sp !== String(spId)) { x.bob.dataset.sp = spId; x.bob.replaceChildren(spriteCanvas(spId, 128)); }
    x.name.textContent = name || m.name || '???';
    x.lv.textContent = ` Lv${lv ?? m.lv ?? 50}`;
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
      const st = stText(m);
      x.st.textContent = st; x.st.className = `bt-st${st ? ' st-' + (m.st || 'cnf') : ''}`;
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

  // 상태 효과 그림: 몬스터 위에 1초쯤 (마비 번개 · 화상 불꽃 · 독 거품 · 얼음 · 회복 · 잠듦 Zzz · 혼란 별 · 풀죽음 땀)
  const statusFx = (u, kind) => {
    const r = FX_ROW[kind];
    if (r == null) return;
    const fx = h('i.bt-sfx', { style: { '--r': r } });
    SL[u].spr.append(fx);
    setTimeout(() => fx.remove(), reducedMotion() ? 400 : 1100);
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
        showMon(u, i, { hp: prev?.sides?.[u >> 1]?.mons?.[i]?.hp, sp: e.sp, name: e.name, max: prev?.sides?.[u >> 1]?.mons?.[i]?.max, lv: e.lv });
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
      if (e.fx) statusFx(e.fx[0], e.fx[1]);
      if (e.item) { sfx.select(); statusFx(e.item[0], 'heal'); }
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
    // 경험치 (나온 몬스터마다) · 레벨 업 · 주운 물건 (0020)
    for (const x of rw.exp?.[me()] || []) {
      if (closed) return;
      await say2(`${josa(x.name, '은', '는')} ${x.exp} 경험치를 얻었다!`, 300);
      if (x.up > 0) { sfx.catch(); await say2(`${x.name}의 레벨이 ${x.lv}${/[013678]$/.test(String(x.lv)) ? '으로' : '로'} 올랐다!`); }
    }
    const got = rw.item?.[me()];
    if (got && itemOf(got)) { sfx.catch(); await say2(`${josa(itemOf(got).name, '을', '를')} 주웠다!`); }
    loadBag({ notify: false }).catch(() => {});
    // 다시 하기: 연습은 같은 형식으로, 친구와는 방금 그 친구에게 (최근 상대 목록의 맨 앞 = 이 배틀)
    const again = h('div.bt-main');
    const ok = h('button.bt-cmd', { onclick: () => closeOverlay() }, '확인');
    again.append(...(b.mode === 'cpu' ? [h('button.bt-cmd.fight', { onclick: () => startBattle('cpu', null, b.format) }, '다시 하기'), ok] : [ok]));
    el.menu.replaceChildren(again);
    if (b.mode !== 'cpu') {
      rpc('battle_recent', {}, { retries: 0 }).then((rs) => {
        const r = rs?.[0];
        if (!r || closed) return;
        S.btPeekFmt = r.format;
        again.prepend(h('button.bt-cmd.fight', { onclick: () => startBattle(b.mode, r.code) }, b.mode === 'pvp' ? '다시 신청' : '다시 하기'));
      }).catch(() => {});
    }
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
      // PP 가 모두 0 이면 기술 대신 "발버둥" 버튼 하나 (눌러야 씀)
      if (cur.moves.every((x) => x.pp <= 0)) {
        el.menu.replaceChildren(h('div.bt-moves', h('button.bt-move.struggle', { onclick: () => choose({ move: 1, target: liveFoes()[0] ?? 0 }) },
          h('b', '발버둥'), h('span.bt-mv-info', h('span.type.t-보통', '보통'), h('small', '자신도 다친다')))), h('button.btn.small', { onclick: back }, '◀ 뒤로'));
        el.text.textContent = 'PP가 다 떨어졌다! 발버둥을 쓸 수밖에 없다.';
        return;
      }
      const foes = liveFoes();
      // 1 대 1 (또는 남은 상대가 하나) → 기술마다 상성을 바로 보여줌. 2 대 2 는 상대를 고르는 화면에서
      const only = foes.length === 1 ? monAt(fo(), side(fo()).act[foes[0]]) : null;
      el.menu.replaceChildren(h('div.bt-moves', cur.moves.map((x, i) => {
        const mv = moveOf(x.id) || {};
        return h('button.bt-move', {
          disabled: x.pp <= 0,
          onclick: () => {
            const targets = mv.kind === 'attack' || mv.effect?.foe_status || mv.effect?.foe;
            if (targets && foes.length > 1) { menu.mode = 'target'; menu.move = i + 1; return renderMenu(); }
            choose({ move: i + 1, target: foes[0] ?? 0 });
          },
        }, h('b', mv.name || '?'), h('span.bt-mv-info', h(`span.type.t-${mv.type}`, mv.type), h('small', `PP ${x.pp}/${mv.pp}`)),
        only && mv.kind === 'attack' ? effTag(effOf(mv.type, only.type)) : null);
      })), h('button.btn.small', { onclick: back }, '◀ 뒤로'));
      el.text.textContent = `${who}어떤 기술을 쓸까?`;
      return;
    }
    if (menu.mode === 'target') {
      const mv = moveOf(cur.moves[menu.move - 1]?.id) || {};
      el.menu.replaceChildren(h('div.bt-moves', liveFoes().map((k) => {
        const m = monAt(fo(), side(fo()).act[k]);
        return h('button.bt-move.bt-target', { onclick: () => choose({ move: menu.move, target: k }) },
          h('span.bt-tgt', spriteCanvas(m.sp, 32), h('b', m.name)), h('small', `상대 ${k === 0 ? '왼쪽' : '오른쪽'}`),
          mv.kind === 'attack' ? effTag(effOf(mv.type, m.type)) : null);
      })), h('button.btn.small', { onclick: back }, '◀ 뒤로'));
      el.text.textContent = `${mv.name || '기술'} — 누구에게 쓸까?`;
      return;
    }
    if (menu.mode === 'bag') {
      const used = menu.picks.filter((p) => p?.item).length;
      const left = (b.items_left ?? 0) - used;
      const meds = (S.bag?.items || []).filter((x) => itemOf(x.key)?.pocket === 'med')
        .map((x) => ({ ...x, qty: x.qty - menu.picks.filter((p) => p?.item === x.key).length })).filter((x) => x.qty > 0);
      el.menu.replaceChildren(h('div.bt-party', meds.length ? meds.map((x) => h('button.bt-pmon', {
        disabled: left <= 0, onclick: () => { sfx.blip(); menu.mode = 'itemtgt'; menu.item = x.key; renderMenu(); },
      }, itemIcon(x.key, 32), h('span', h('b', itemOf(x.key).name), h('small', ` ×${x.qty}`), h('br'), h('small', itemOf(x.key).description)))) : [h('p', '쓸 수 있는 회복약이 없어요.')]),
      h('button.btn.small', { onclick: back }, '◀ 뒤로'));
      el.text.textContent = b.fair ? '공정 모드에서는 회복약을 쓸 수 없어요.' : left > 0 ? `회복약은 이번 배틀에서 ${left}개 더 쓸 수 있어요.` : '이번 배틀에서는 더 쓸 수 없어요.';
      return;
    }
    if (menu.mode === 'itemtgt') {
      const it = itemOf(menu.item); const revive = !!it?.effect?.revive;
      el.menu.replaceChildren(partyList(mine, (i) => (revive ? mine.mons[i].hp <= 0 : mine.mons[i].hp > 0), (i) => choose({ item: menu.item, target: i }), revive),
        h('button.btn.small', { onclick: back }, '◀ 뒤로'));
      el.text.textContent = `${josa(it?.name || '', '을', '를')} 누구에게 쓸까?`;
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
      h('button.bt-cmd', { disabled: !!b.fair, onclick: () => { sfx.blip(); menu.mode = 'bag'; renderMenu(); } }, '가방'),
      h('button.bt-cmd', { onclick: () => { sfx.blip(); menu.mode = 'switch'; renderMenu(); } }, '몬스터'),
      menu.k > 0 && slots.slice(0, menu.k).some((s) => s.m?.hp > 0)
        ? h('button.bt-cmd', { onclick: back }, '◀ 앞 자리')
        : h('button.bt-cmd', { onclick: giveUp }, b.mode === 'pvp' ? '기권' : '도망')),
    h('button.btn.small.bt-later', { onclick: () => { sfx.blip(); closeOverlay(); } }, b.mode === 'pvp' ? '잠시 나가기' : '나중에 이어 하기'));
  };
  const partyList = (mine, ok, pick, fainted = false) => h('div.bt-party', mine.mons.map((x, i) => h('button.bt-pmon', {
    disabled: (x.hp <= 0 && !fainted) || !ok(i), onclick: () => pick(i),
  }, spriteCanvas(x.sp, 40), h('span', h('b', x.name), h('div.hpbar.small', h('i', { style: { width: `${(x.hp / x.max) * 100}%` }, class: x.hp / x.max < 0.2 ? 'red' : x.hp / x.max < 0.5 ? 'yellow' : '' })),
    h('small', x.hp > 0 ? `Lv${x.lv ?? 50} · ${x.hp}/${x.max}${stText(x) ? ' · ' + stText(x) : ''}${mine.act.includes(i) ? ' · 싸우는 중' : ''}` : '기절')))));

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
      if (b.field) await say2(`지금은 ${b.field.name}! ${(b.field.types || []).join('·')} 기술의 위력이 올라간다!`, 450);
      if (b.fair) await say2('공정 모드! 모두 Lv.50으로 싸운다. (회복약 없음)', 450);
      await say2(`${josa(foeName(), '은', '는')} ${josa(join(names(foeSlots)), '을', '를')} 내보냈다!`, 100);
      for (const x of foeSlots) await throwBall(x.u);
      await say2(`가랏! ${join(names(mySlotsEl))}!`, 100);
      for (const x of mySlotsEl) await throwBall(x.u);
      // 같은 과 시너지 (0020): 나온 몬스터의 능력 +1
      const SYN = { atk: '공격이', def: '방어가', spa: '특수공격이', spd: '특수방어가', spe: '스피드가' };
      for (const x of [...foeSlots, ...mySlotsEl]) {
        const m = monAt(x.u >> 1, side(x.u >> 1).act[x.u & 1]);
        if (m?.syn) { statFx(x.u, 1); await say2(tok(`@${x.u >> 1}${m.name}의 ${m.synname} 시너지! ${SYN[m.syn]} 올라갔다!`), 300); }
      }
      playing = false; startPicks(); renderMenu();
    })();
  } else {
    startPicks(); renderMenu();
    if (b.status === 'over') { finished = true; el.text.textContent = b.winner === me() ? '이긴 배틀이에요.' : '끝난 배틀이에요.'; el.menu.replaceChildren(h('button.btn.big', { onclick: () => closeOverlay() }, '닫기')); stopBgm(); }
  }
}
