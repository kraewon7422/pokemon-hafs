// 배틀 (0015·0016): 계산은 전부 서버. 폰은 고른 것만 보내고, 서버 기록(log)을 3세대 느낌으로 재생한다.
import { rpc, errorText } from './sb.js';
import { drawQR } from './qrfmt.js';
import { spriteCanvas, paintNow } from './sprites.js';
import { sfx, unlockAudio, bgmPush } from './sfx.js';
import { h, $, josa, toast, typeText, sleep, reducedMotion, pix } from './ui.js';
import { S, abilityOf, isWithdrawn, monById, mons, monSp, speciesOf, vibrate } from './state.js';
import { closeOverlay, eggTap, openScanner, overlay, renderTab, say, sheet, sync } from './app.js';
import { typeChips, typeMult, TYPES } from './dex.js';
import { curSpecies } from './raid.js';
import { itemIcon, itemOf, loadBag } from './bag.js';

// ───────── 배틀 (0015·0016): 계산은 전부 서버. 폰은 고른 것만 보내고, 서버 기록(log)을 3세대 느낌으로 재생한다 ─────────
// 자리(slot) u = 쪽×2 + 자리 번호. 1 대 1 은 자리 0·2 만, 2 대 2 는 0~3 모두.
export const isBattleQr = (q) => q === 'BTL';
export const ST_LABEL = { par: '마비', brn: '화상', psn: '독', slp: '잠듦', frz: '얼음' };
const stText = (m) => [m?.st ? ST_LABEL[m.st] : '', m?.cnf > 0 ? '혼란' : ''].filter(Boolean).join(' ');
// 상성 (서버 _bt_tm 과 같음): 방어 타입이 두 개면 곱 (×4 · ×¼ 도 있음)
export const effOf = (atk, def) => typeMult(atk, def);
export const effTag = (mult) => (mult > 1 ? h('span.eff.up', '효과가 굉장하다!') : mult === 0 ? h('span.eff.zero', '효과가 없다') : mult < 1 ? h('span.eff.down', '효과가 별로인 듯하다') : null);
// 0032 (진짜 포켓몬) 전에 시작한 배틀은 서버 기록(battles.state · log)에 옛 몬스터 이름이 남아 있음
// → 화면에는 언제나 지금 도감의 이름 (species id 기준). map = 옛 이름 → 새 이름 (메시지 안의 이름·조사도 바꿈)
const JOSA = [['으로', '로'], ['은', '는'], ['이', '가'], ['을', '를'], ['과', '와']];
export const spName = (sp, fallback) => (sp != null && speciesOf(sp)?.name) || fallback || '???';
function renameBattle(b, map) {
  for (const sd of b?.sides || []) for (const m of sd?.mons || []) {
    if (!m || m.sp == null) continue;
    const now = speciesOf(m.sp)?.name;
    if (now && m.name !== now) { if (m.name) map.set(m.name, now); m.name = now; }
  }
}
function fixNames(s, map) {
  if (!s || !map.size) return s;
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const olds = [...map.keys()].sort((a, b) => b.length - a.length).map(esc);
  return String(s).replace(new RegExp(`(${olds.join('|')})(으로|은|는|이|가|을|를|과|와|로)?`, 'g'), (_, old, p) => {
    const nw = map.get(old); const pair = p && JOSA.find((x) => x.includes(p));
    return pair ? josa(nw, pair[0], pair[1]) : nw + (p || '');
  });
}
const SYN = { atk: '공격이', def: '방어가', spa: '특수공격이', spd: '특수방어가', spe: '스피드가' };
const FX_ROW = { par: 0, brn: 1, psn: 2, frz: 3, heal: 4, slp: 5, cnf: 6, flinch: 7 };   // web/img/fx/status.png 줄 순서 (tools/draw_fx.py)

// 날씨 · 필드 (0039, 서버 _bt_envmsg 와 같은 글)
export const ENV = {
  sun: { name: '쾌청', start: '햇살이 강해졌다!', kind: 'wx' },
  rain: { name: '비', start: '비가 내리기 시작했다!', kind: 'wx' },
  sand: { name: '모래바람', start: '모래바람이 불기 시작했다!', kind: 'wx' },
  hail: { name: '싸라기눈', start: '싸라기눈이 내리기 시작했다!', kind: 'wx' },
  electric: { name: '일렉트릭필드', start: '발밑에 전기가 흐르기 시작했다!', kind: 'ter' },
  grassy: { name: '그래스필드', start: '발밑에 풀이 무성해졌다!', kind: 'ter' },
  misty: { name: '미스트필드', start: '발밑에 안개가 끼었다!', kind: 'ter' },
  psychic: { name: '사이코필드', start: '발밑이 이상한 느낌이 되었다!', kind: 'ter' },
};
// 날씨 · 필드 아이콘 (8×8 도트)
const ENV_ICON = {
  sun: '<path fill="#f8c030" d="M3 1h2v1h1v1h1v2h-1v1h-1v1h-2v-1h-1v-1h-1v-2h1v-1h1z"/><path fill="#fff0a0" d="M3 3h2v2h-2z"/>',
  rain: '<path fill="#5890f0" d="M3 0h2v2h1v2h1v2h-1v1h-4v-1h-1v-2h1v-2h1z"/><path fill="#c8e0ff" d="M3 3h1v2h-1z"/>',
  sand: '<path fill="#d8a860" d="M0 1h6v1h-6zM2 3h6v1h-6zM0 5h5v1h-5zM3 7h4v1h-4z"/>',
  hail: '<path fill="#a8e0f8" d="M1 1h2v2h-2zM5 0h2v2h-2zM3 4h2v2h-2zM0 6h2v2h-2zM6 5h2v2h-2z"/><path fill="#fff" d="M1 1h1v1h-1zM5 0h1v1h-1zM3 4h1v1h-1z"/>',
  electric: '<path fill="#f8d020" d="M4 0h3v1h-1v2h2v1h-1v1h-1v1h-1v1h-1v1h-1v-2h1v-2h-3v-1h1v-1h1v-1h1z"/>',
  grassy: '<path fill="#48b048" d="M1 7v-3h1v-1h1v4zM4 7v-5h1v-1h1v6zM7 7h-1v-3h1z"/><path fill="#88d860" d="M2 3h1v1h-1zM5 1h1v1h-1z"/>',
  misty: '<path fill="#f0b0e0" d="M0 2h5v1h-5zM2 4h6v1h-6zM0 6h6v1h-6z"/>',
  psychic: '<path fill="#e060b0" d="M1 3h1v-1h4v1h1v2h-1v1h-4v-1h-1z"/><path fill="#fff" d="M3 3h2v2h-2z"/><path fill="#602070" d="M4 3h1v1h-1z"/>',
};
export const envIcon = (k) => (ENV_ICON[k] ? h('i.env-ico', { html: `<svg viewBox="0 0 8 8" width="16" height="16" shape-rendering="crispEdges">${ENV_ICON[k]}</svg>` }) : null);

// 0045: 마릿수는 형식과 상관없이 배틀 팀 1~6마리 (2 대 2 는 2마리 이상). 친구와는 min(내 팀, 친구 팀) 마리씩, AI 는 내 팀과 같은 수
export const TEAM_MAX = 6;
export const FMT = { single: { min: 1, label: '1 대 1' }, double: { min: 2, label: '2 대 2' } };
const DOUBLE_SHORT = '2 대 2는 배틀 팀에 포켓몬이 2마리 이상 있어야 해요. [팀 바꾸기]에서 더 골라 주세요.';
// 배틀 배경 (img/battle/bt2-*.png, tools/draw_battle_bg.py): 날씨 · 필드가 있으면 그 배경, 없으면 배틀 번호로 돌아가며
export const BT_BG = ['plains', 'forest', 'beach', 'desert', 'snowy', 'cave', 'lake'];
const BT_ENV_BG = { sun: 'sunny', rain: 'rain', sand: 'desert', hail: 'snowy', electric: 'electric', grassy: 'forest', misty: 'lake', psychic: 'psychic' };
export const moveOf = (id) => (S.catalog.moves || []).find((m) => m.id === id);
export const BT_WHY = {
  practice: '연습 배틀이라 보상은 없어요.',
  same_opp: '같은 친구에게는 하루 한 번만 보상이 있어요.',
  daily_max: '오늘 받을 수 있는 배틀 보상은 다 받았어요.',
  luck: '이번엔 진화의 돌이 없었어요. (이기면 가끔 받아요)',
};

// 내 배틀 팀 = 저장한 팀 (아직 박스에 있는 것만, 순서대로, 1~6마리). 저장한 적이 없으면 가장 높은 단계·레벨 3마리 (서버 _team_mons 와 같음)
// 0036: 팀 = 박스의 포켓몬 번호 (같은 종 두 마리도 됨)
export function myTeam() {
  const mine = mons().filter((c) => !isWithdrawn(c.line_id));
  const have = new Set(mine.map((c) => c.id));
  const saved = (S.btTeam || []).filter((id) => have.has(id));
  if (saved.length) return saved.slice(0, TEAM_MAX);
  return [...mine].sort((a, b) => b.stage - a.stage || b.level - a.level || a.id - b.id).map((c) => c.id).slice(0, 3);
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

// 배틀 팀 칸: 3칸 × 2줄, 모두 같은 크기. 칸마다 그림 상자 (아래 맞춤) · 이름 (한 줄, 길면 글자 작게 = --len) · Lv · 타입 한 줄 (app.css .bt-team)
// slots = true → 6칸을 다 그리고 빈 칸은 점선 '+' (onAdd 를 주면 누를 수 있음)
export function teamStrip(team, size = 56, { slots = false, onAdd = null } = {}) {
  const cells = team.map((id) => {
    const m = monById(id); const sp = monSp(m);
    if (!sp) return null;
    const name = h('b.bt-name', sp.name);
    name.style.setProperty('--len', String([...sp.name].length));
    return h('div.bt-mon', h('div.bt-tpic', { style: { height: `${size}px` } }, spriteCanvas(sp.id, size)), name, h('small.bt-mlv', `Lv.${m.level}`), h('span.types', typeChips(sp)));
  }).filter(Boolean);
  if (!cells.length && !slots) return h('p', '아직 포켓몬이 없어요. QR을 찍어 포켓몬을 먼저 모아요!');
  if (slots) {
    for (let i = cells.length; i < TEAM_MAX; i++) {
      const kids = [h('div.bt-tpic', { style: { height: `${size}px` } }, h('span.bt-plus', '+')), h('b.bt-name', '빈 칸'), h('small.bt-mlv', ''), h('span.types')];
      cells.push(onAdd ? h('button.bt-mon.bt-empty', { type: 'button', 'aria-label': '빈 칸: 배틀 팀에 포켓몬 넣기', onclick: onAdd }, ...kids) : h('div.bt-mon.bt-empty', ...kids));
    }
  }
  return h('div.bt-team', cells);
}

// 친구와 할 때 실제로 나가는 마릿수 = min(내 팀, 친구 팀)
const sharedN = (mine, theirs) => Math.min(mine, theirs > 0 ? theirs : mine);

export function fmtSeg(cur, onpick) {
  return h('div.seg.bt-fmt', { role: 'group', 'aria-label': '배틀 형식' }, Object.entries(FMT).map(([k, f]) =>
    h('button', { 'aria-pressed': String(cur === k), onclick: () => { sfx.blip(); onpick(k); } }, f.label)));
}

export function typeTable() {
  const T = TYPES;
  const cell = (v) => (v === 2 ? h('td.x2', '2') : v === 0.5 ? h('td.xh', '½') : v === 0 ? h('td.x0', '0') : h('td', ''));
  return [
    h('small', '왼쪽 = 공격하는 기술의 타입, 위 = 맞는 포켓몬의 타입. 2 = 효과가 굉장했다 · ½ = 별로인 듯하다 · 0 = 효과가 없다. 타입이 두 개인 포켓몬은 두 칸을 곱해요 (×4 · ×¼).'),
    h('div.type-table-wrap', h('table.type-table',
      h('thead', h('tr', h('th', ''), T.map((d) => h(`th.t-${d}`, { title: d }, d)))),
      h('tbody', T.map((a) => h('tr', h(`th.t-${a}`, { title: a }, a), T.map((d) => {
        const td = cell(typeMult(a, d));
        if (a === '에스퍼' && d === '에스퍼') td.onclick = () => eggTap('chart');   // 에스퍼 × 에스퍼 칸 (이스터에그)
        return td;
      })))))),
    h('small.muted', '효과 없음: 노말·격투→고스트, 고스트→노말, 전기→땅, 땅→비행, 독→강철, 에스퍼→악, 드래곤→페어리.'),
  ];
}

export function viewBattle() {
  if (S.online && (!S.btTodayAt || Date.now() - S.btTodayAt > 15000)) { loadBattleToday(); pollInbox(true); }
  S.btFmt ||= 'single';
  const team = myTeam();
  const short = team.length < FMT[S.btFmt].min;
  const today = S.btToday;
  const act = S.btInbox?.active;
  const pvp = livePvp();
  const invites = S.btInbox?.invites || [];
  return [
    h('div.box.stack',
      h('div.banner', h('b', pix('spark'), ' 배틀'), today ? h('span.chip', today.max >= 999 ? `오늘 이긴 배틀 ${today.wins}` : `오늘 보상 ${today.wins}/${today.max}`) : null),
      h('p', { style: { margin: 0 } }, '내 포켓몬으로 겨뤄요. 친구를 이기면 진화의 돌 1개! (하루 3번 · 같은 친구는 하루 1번)'),
      act && h('button.btn.big.gold', { onclick: () => resumeBattle(act.id) }, pix('spark'),
        act.status === 'invite' ? '보낸 배틀 신청 보기' : pvp ? '하던 실시간 배틀 이어 하기' : '하던 배틀 이어 하기'),
      pvp && h('small.warn-txt', '실시간 배틀이 끝나기 전에는 다른 배틀을 시작할 수 없어요. (그만두려면 배틀 화면에서 기권)'),
      invites.map((inv) => h('div.bt-invite', h('b', `${josa(inv.from, '이', '가')} ${FMT[inv.format]?.label || ''} 배틀 신청!`),
        h('button.btn.small.primary', { onclick: () => acceptInvite(inv) }, '수락'),
        h('button.btn.small', { onclick: () => declineInvite(inv) }, '거절')))),
    h('div.box.stack',
      h('div.banner', h('b', `내 배틀 팀 ${team.length}/${TEAM_MAX}`), h('button.btn.small', { onclick: teamPicker, disabled: !mons().length }, '팀 바꾸기')),
      fmtSeg(S.btFmt, (k) => { S.btFmt = k; renderTab(); }),
      mons().length ? teamStrip(team, 56, { slots: true, onAdd: teamPicker }) : teamStrip([]),
      h('small.muted', `팀에 넣은 ${team.length}마리가 순서대로 나가요. 연습 상대(AI)도 ${team.length}마리예요.`),
      short && h('small.warn-txt', DOUBLE_SHORT),
      h('div.seg.bt-fmt.bt-fair', { role: 'group', 'aria-label': '연습 배틀 레벨' }, [[false, '내 레벨'], [true, '공정 모드']].map(([v, l]) =>
        h('button', { 'aria-pressed': String(practiceFair() === v), onclick: () => { sfx.blip(); setPracticeFair(v); renderTab(); } }, l))),
      h('small.muted', practiceFair() ? '공정 모드: 양쪽 모두 Lv.50, 회복약을 쓸 수 없어요.' : '연습 배틀은 내 포켓몬 레벨 그대로 싸워요.'),
      h('button.btn.big.primary', { disabled: !team.length || short || !!pvp, onclick: () => startBattle('cpu', null, S.btFmt) }, pix('spark'), h('span.btn-label', `연습 배틀 · ${FMT[S.btFmt].label}`), h('small.btn-sub', '보상 없음')),
      h('button.btn.big', { disabled: !team.length || !!pvp, onclick: openScanner }, pix('camera'), '친구 배틀 QR 찍기'),
      h('button.btn.big', { onclick: showBattleQr }, '내 배틀 QR 보여주기'),
      h('small.muted', '친구가 내 QR을 찍으면 실시간 배틀을 신청하거나, 내 팀을 AI가 조종하는 배틀을 할 수 있어요. 1 대 1인지 2 대 2인지는 QR을 보여주는 사람이 정해요. 친구와는 두 팀 중 적은 마릿수만큼 각자 팀 앞에서부터 나가요.')),
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
  let sel = myTeam();
  const count = h('b');
  // 누를 때마다 전부 다시 만들면 그림 canvas 가 새로 생겨 (1×1 → 화면에 보일 때 그림) 화면 전체가 깜빡임 →
  // 고르는 칸 · 위 6칸은 한 번만 만들고, 누르면 바뀐 칸만 고침 (그림 canvas 는 포켓몬마다 하나를 만들어 다시 씀)
  const preview = teamStrip([], 40, { slots: true });
  const slots = [...preview.children];
  const pics = new Map();
  const picOf = (sp) => { if (!pics.has(sp.id)) pics.set(sp.id, spriteCanvas(sp.id, 40)); return pics.get(sp.id); };
  const paintSlot = (cell, id) => {
    if (cell.__id === id) return;
    cell.__id = id;
    const m = id != null ? monById(id) : null; const sp = m ? monSp(m) : null;
    const [pic, name, lv, types] = cell.children;
    cell.classList.toggle('bt-empty', !sp);
    const c = sp ? picOf(sp) : null;
    pic.replaceChildren(c || h('span.bt-plus', '+'));
    if (c && c.width <= 1) paintNow(c);
    name.textContent = sp ? sp.name : '빈 칸';
    if (sp) name.style.setProperty('--len', String([...sp.name].length)); else name.style.removeProperty('--len');
    lv.textContent = sp ? `Lv.${m.level}` : '';
    types.replaceChildren(...(sp ? [typeChips(sp)].flat() : []));
  };
  const opts = new Map();     // 포켓몬 id → { btn, num }
  const grid = h('div.bt-pick', mons().filter((c) => !isWithdrawn(c.line_id))
    .sort((a, b) => b.stage - a.stage || b.level - a.level || a.line_id - b.line_id || a.id - b.id).map((c) => {
      const sp = monSp(c);
      const num = h('span.bt-num'); num.hidden = true;
      const btn = h('button.bt-opt', {
        onclick: () => {
          sfx.blip();
          const n = sel.indexOf(c.id);
          if (n < 0 && sel.length >= TEAM_MAX) { err.textContent = `배틀 팀은 ${TEAM_MAX}마리까지예요. 먼저 한 마리를 빼 주세요.`; return; }
          err.textContent = '';
          sel = n >= 0 ? sel.filter((x) => x !== c.id) : [...sel, c.id];
          draw();
        },
      }, num, spriteCanvas(sp.id, 48), h('small', sp.name), h('small.bt-lv', `Lv.${c.level}`));
      opts.set(c.id, { btn, num });
      return btn;
    }));
  const draw = () => {
    sel = sel.filter((id) => monSp(monById(id)));
    slots.forEach((cell, i) => paintSlot(cell, sel[i] ?? null));
    count.textContent = `${sel.length}/${TEAM_MAX}마리`;
    for (const [id, o] of opts) {
      const n = sel.indexOf(id);
      if (o.btn.classList.contains('on') !== n >= 0) o.btn.classList.toggle('on', n >= 0);
      if (o.num.hidden !== n < 0) o.num.hidden = n < 0;
      if (n >= 0 && o.num.textContent !== String(n + 1)) o.num.textContent = String(n + 1);
    }
  };
  const err = h('div.err');
  draw();
  sheet(h('div.stack',
    h('div.banner', h('b', '배틀 팀 고르기'), count),
    h('small', `누른 순서대로 나가요. 1~${TEAM_MAX}마리 (2 대 2는 2마리 이상). 1 대 1 · 2 대 2 모두 이 팀을 써요.`),
    preview,
    grid, err,
    h('button.btn.big.primary', {
      onclick: async () => {
        if (!sel.length) { err.textContent = '1마리 이상 골라 주세요.'; return; }
        try {
          await rpc('battle_set_team', { p_mons: sel }, { retries: 0 });
          S.btTeam = sel; if (S.bag) S.bag.team = sel;   // 트레이너 카드 (share.js) 가 읽는 팀도 바로 맞춤
          closeOverlay(); renderTab(); toast('배틀 팀을 저장했어요!');
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
    teamBox.replaceChildren(teamStrip(myTeam(), 44),
      myTeam().length < FMT[fmt].min ? h('small.warn-txt', DOUBLE_SHORT) : h('small.muted', `친구 팀과 적은 쪽 마릿수만큼 (최대 ${myTeam().length}마리) 싸워요.`));
  };
  draw();
  sheet(h('div.stack',
    h('div.bagqr', h('b', '내 배틀 QR'), canvas, h('small', '친구가 이 QR을 찍으면 나와 배틀할 수 있어요.')),
    h('b', '어떤 배틀을 할까? (친구는 이 형식으로 싸워요)'), segBox,
    h('b', '내 배틀 팀'), teamBox,
    h('button.btn', { onclick: () => closeOverlay() }, '닫기')));
}

export async function friendBattleSheet(code) {
  if (!mons().length) return say('배틀하려면 먼저 포켓몬을 모아요!', true);
  if (!S.online) return say('배틀은 인터넷이 필요해요. 와이파이나 데이터를 켜 주세요.', true);
  let pk;
  try { pk = await rpc('battle_peek', { p_code: code }, { retries: 0 }); } catch (e) { sfx.error(); return say(errorText(e.message), true); }
  const f = FMT[pk.format] || FMT.single;
  const team = myTeam();
  const n = sharedN(team.length, pk.count);
  const why = team.length < f.min ? DOUBLE_SHORT : n < f.min ? '친구 배틀 팀이 1마리뿐이라 2 대 2를 할 수 없어요. 친구에게 1 대 1로 바꿔 달라고 해 주세요.' : '';
  sfx.scan(); vibrate(80);
  sheet(h('div.stack',
    h('b', pix('spark'), ` ${josa(pk.name, '의', '의').slice(0, -1)}의 배틀 QR!`),
    h('p', { style: { margin: 0 } }, h('b', f.label), pk.fair ? h('b', ' · 공정 모드 (모두 Lv.50)') : null, ' 배틀이에요. 내 배틀 팀으로 어떻게 겨룰까요?'),
    pk.count > 0 && h('small.muted', `내 팀 ${team.length}마리 · 친구 팀 ${pk.count}마리 → 각자 팀 앞에서 ${n}마리씩 나가요.`),
    teamStrip(team.slice(0, n), 44),
    why && h('small.warn-txt', why),
    h('button.btn.big.primary', { disabled: !!why, onclick: () => startBattle('pvp', code) }, '실시간 배틀 신청 (친구가 수락하면 시작)'),
    h('button.btn.big', { disabled: !!why, onclick: () => startBattle('team', code) }, '친구 팀과 AI 배틀 (바로 시작)'),
    h('small.muted', '이기면 진화의 돌 1개 (하루 3번 · 같은 친구는 하루 1번)'),
    h('button.btn', { onclick: () => closeOverlay() }, '닫기')));
  S.btPeekFmt = pk.format;
}

export function inviteSheet(inv) {
  const f = FMT[inv.format] || FMT.single;
  const team = myTeam();
  const n = sharedN(team.length, inv.count);
  const short = team.length < f.min;
  sheet(h('div.stack',
    h('b.bt-alert', pix('spark'), ' 배틀 신청!'),
    h('p', { style: { margin: 0 } }, `${josa(inv.from, '이', '가')} ${f.label} 실시간 배틀을 신청했어요. 1분 안에 수락해야 시작돼요.`),
    inv.count > 0 && h('small.muted', `친구 팀 ${inv.count}마리 · 내 팀 ${team.length}마리 → 각자 ${n}마리씩 나가요.`),
    teamStrip(team.slice(0, n), 44),
    short && h('small.warn-txt', DOUBLE_SHORT),
    h('button.btn.big.primary', { onclick: () => acceptInvite(inv), disabled: !mons().length || short }, '수락하고 배틀!'),
    h('button.btn', { onclick: () => declineInvite(inv) }, '거절')));
}

export async function acceptInvite(inv) {
  try { openBattle(await rpc('battle_accept', { p_id: inv.id, p_mons: myTeam() }, { retries: 0 })); }
  catch (e) { sfx.error(); say(errorText(e.message), true); pollInbox(true); }
}
export async function declineInvite(inv) {
  try { await rpc('battle_decline', { p_id: inv.id }, { retries: 0 }); } catch { /* ignore */ }
  if (S.overlay) closeOverlay();
  if (S.btInbox) S.btInbox.invites = (S.btInbox.invites || []).filter((x) => x.id !== inv.id);
  renderTab();
}

// 연습 배틀 공정 모드 (0025): 이 폰에 기억
const practiceFair = () => { try { return localStorage.getItem('btPracticeFair') === '1'; } catch { return false; } };
const setPracticeFair = (v) => { try { localStorage.setItem('btPracticeFair', v ? '1' : '0'); } catch { /* 저장 못 해도 이번엔 적용 안 됨 */ } };

let starting = false;
export async function startBattle(mode, code, fmt) {
  if (starting) return;   // 두 번 눌러서 배틀이 두 개 만들어지지 않게
  const team = myTeam();
  if (!team.length) return say('배틀하려면 먼저 포켓몬을 모아요!', true);
  if (mode === 'cpu' && team.length < (FMT[fmt] || FMT.single).min) return say(DOUBLE_SHORT, true);
  if (!S.online) return say('배틀은 인터넷이 필요해요. 와이파이나 데이터를 켜 주세요.', true);
  starting = true;
  try {
    const args = mode === 'cpu' ? { p_mons: team, p_format: fmt, p_fair: practiceFair() } : { p_code: code, p_mons: team };
    openBattle(await rpc({ cpu: 'battle_start_cpu', team: 'battle_start_team', pvp: 'battle_challenge' }[mode], args, { retries: 0 }));
  } catch (e) { sfx.error(); say(errorText(e.message), true); if (e.message === 'IN_PVP_BATTLE') pollInbox(true); }
  finally { starting = false; }
}

export async function resumeBattle(id) {
  try { openBattle(await rpc('battle_state', { p_id: id }, { retries: 0 })); } catch (e) { say(errorText(e.message), true); }
}

// 몬스터볼 (도트): 위 빨강 · 가운데 검은 띠 · 아래 하양
export const BALL_SVG = '<svg viewBox="0 0 8 8" width="16" height="16" shape-rendering="crispEdges"><path fill="#182030" d="M2 0h4v1h1v1h1v4h-1v1h-1v1h-4v-1h-1v-1h-1v-4h1v-1h1z"/><path fill="#f04830" d="M2 1h4v1h1v2h-6v-2h1z"/><path fill="#fff" d="M1 5h6v1h-1v1h-4v-1h-1z"/><path fill="#fff" d="M3 3h2v2h-2z"/><path fill="#182030" d="M3.5 3.5h1v1h-1z"/></svg>';

// opts.legend = { name, roam, boss: {hp_mult, stage} } (0055 전설 배틀: 잡기 전에 쓰러트리기) · 돌려줌 = 화면을 닫을 때 마지막 배틀 상태 (약속)
export function openBattle(b0, opts = {}) {
  const lg = opts.legend || null;
  let doneRes; const done = new Promise((r) => { doneRes = r; });
  unlockAudio();
  loadBag({ notify: false }).catch(() => {});
  const ren = new Map();          // 옛 이름 → 지금 이름
  renameBattle(b0, ren);
  // 배경 음악: 배틀 중 = 배틀 곡, 끝나면 조용히 (승리 효과음), 닫으면 원래 곡. 신청 대기 · 끝난 배틀 보기 = 원래 곡 그대로
  const music = bgmPush(b0.status === 'active' ? 'battle' : undefined);
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
  const el = { text: h('div.bt-text'), arrow: h('i.bt-arrow'), menu: h('div.bt-menu'), timer: h('span.bt-timer'), field: null,
               wx: h('div.bt-wx'), ter: h('div.bt-ter'), env: h('div.bt-env') };
  const foeName = () => (lg ? `야생의 ${lg.name}` : b.mode === 'cpu' ? '연습 상대' : b.names?.[fo()] || '상대');
  const tok = (s) => fixNames(s, ren).replace(/@([01])/g, (_, x) => (Number(x) === me() ? '' : '상대 '));
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
    // 그림: 서버가 준 species id. 없으면 (아주 옛 배틀) 내 포켓몬은 계열의 지금 모습으로 → 자리가 빈 칸으로 남지 않게
    const spId = sp ?? m.sp ?? (s === me() && m.line ? curSpecies(m.line)?.id : null);
    const picId = sp != null ? sp : (m.tsp ?? spId);   // 0039 변신: 보이는 그림 = 변신한 상대 (이름은 그대로)
    x.spr.classList.remove('faint', 'hit', 'atk', 'gone');
    setPic(u, picId);
    x.name.textContent = spName(spId, name || m.name);
    x.lv.textContent = ` Lv${lv ?? m.lv ?? 50}`;
    setHp(u, hp ?? m.hp ?? 0, max ?? m.max);
  };
  const setPic = (u, picId) => {
    const x = SL[u];
    if (picId && x.bob.dataset.sp !== String(picId)) { x.bob.dataset.sp = picId; x.bob.replaceChildren(spriteCanvas(picId, 128)); }
  };
  // ── 날씨 · 필드 (0039): 위쪽 띠 + 화면 효과 ──
  const env = { wx: b.wx ?? null, ter: b.ter ?? null };
  const drawEnv = () => {
    el.wx.className = `bt-wx${env.wx ? ' wx-' + env.wx : ''}`;
    el.ter.className = `bt-ter${env.ter ? ' ter-' + env.ter : ''}`;
    const chips = [env.wx, env.ter].filter(Boolean).map((k) => h(`span.env-chip.e-${k}`, envIcon(k), ENV[k]?.name || k));
    el.env.replaceChildren(...chips);
    el.env.hidden = !chips.length;
  };
  const envStart = (k) => {
    if (!k || reducedMotion()) return;
    const f = h(`div.bt-envfx.fx-${k}`);
    el.field.append(f);
    setTimeout(() => f.remove(), 1300);
    sfx.weather?.(k);
  };
  // ── 특성 알림 (5세대처럼 옆에서 미끄러져 나오는 띠): "<포켓몬>의 <특성>!" ──
  const abilityPop = async (u, key, nm) => {
    const a = abilityOf(key);
    const mine = (u >> 1) === me();
    const s = u >> 1; const m = monAt(s, side(s)?.act?.[u & 1]);
    if (m && !mine) m.ab = key;            // 상대 특성: 나타났으니 정보 칸에 보임
    const who = (mine ? '' : '상대 ') + (nm ? spName(m?.sp, fixNames(nm, ren)) : SL[u].name.textContent);
    const pop = h(`div.ab-pop${mine ? '.me' : '.foe'}${dbl ? '.k' + (u & 1) : ''}`, h('small', `${who}의`), h('b', a?.name || key));
    el.field.append(pop);
    sfx.ability?.();
    await sleep(reducedMotion() ? 500 : 1100);
    pop.classList.add('out');
    setTimeout(() => pop.remove(), 260);
  };
  // ── 변신: 반짝이며 상대 모습으로 ──
  const transformFx = async (u, toSp) => {
    const x = SL[u];
    sfx.transform?.();
    if (!reducedMotion()) { bump(x.spr, 'tf'); await sleep(360); }
    x.bob.dataset.sp = '';
    setPic(u, toSp);
    await sleep(reducedMotion() ? 60 : 380);
    x.spr.classList.remove('tf');
  };
  // ── 정보 (HP 상자 · 포켓몬을 누르면): 이름 · 타입 · 특성 (설명) · 상태 · 능력 변화 ──
  const STG_NM = { atk: '공격', def: '방어', spa: '특수공격', spd: '특수방어', spe: '스피드', acc: '명중률', eva: '회피율' };
  const showInfo = (u) => {
    if (!b.sides?.length) return;
    const s = u >> 1; const m = monAt(s, side(s)?.act?.[u & 1]);
    if (!m || !m.name) return;
    sfx.blip();
    el.field.querySelector('.bt-info')?.remove();
    const a = abilityOf(m.ab);
    const stg = Object.entries(m.stg || {}).filter(([, v]) => v).map(([k, v]) => `${STG_NM[k] || k} ${v > 0 ? '+' : ''}${v}`);
    const card = h('div.bt-info', { role: 'dialog', onclick: () => card.remove() },
      h('div.bt-info-top', h('b', spName(m.sp, m.name)), h('span.types', typeChips(m.type || '노말'))),
      m.tf ? h('small', `변신 중: ${spName(m.tsp)}의 모습`) : null,
      h('div.bt-info-ab', h('small', '특성'), h('b', a ? a.name : (s === me() ? '없음' : '???'))),
      h('p', a ? a.description : (s === me() ? '' : '아직 특성이 나타나지 않았다.')),
      stg.length ? h('small', `능력 변화: ${stg.join(' · ')}`) : null,
      stText(m) ? h('small', `상태: ${stText(m)}`) : null,
      h('small.muted', '눌러서 닫기'));
    el.field.append(card);
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

  // 몬스터볼을 던져서 자리 u 에 포켓몬이 나온다
  const throwBall = async (u) => {
    const x = SL[u]; const mine = (u >> 1) === me();
    const f = el.field.getBoundingClientRect(); const t = x.spr.getBoundingClientRect();
    const tx = t.left + t.width / 2 - f.left - 8; const ty = t.bottom - f.top - 18;
    const sx = mine ? -20 : f.width + 4; const sy = mine ? f.height * 0.75 : f.height * 0.05;
    x.spr.classList.add('hide');   // (보통은 이미 숨김 — 그림은 공이 열린 뒤에만)
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
    x.spr.classList.remove('hide'); x.box.classList.remove('hide'); bump(x.spr, 'enter');
    await sleep(reducedMotion() ? 50 : 380);
  };

  // 능력 변화: 올라가면 빨간 줄이 위로, 내려가면 아래로 + 효과음
  const statFx = (u, dir) => {
    const x = SL[u]; const big = Math.abs(dir) >= 2;
    x.fx.className = `bt-fx ${dir > 0 ? 'up' : 'down'}${big ? ' big' : ''}`;
    if (!x.fx.firstChild) x.fx.append(h('i'));
    void x.fx.offsetWidth; x.fx.classList.add('run');
    x.bob.classList.remove('tint-up', 'tint-down'); void x.bob.offsetWidth; x.bob.classList.add(dir > 0 ? 'tint-up' : 'tint-down');
    setTimeout(() => x.bob.classList.remove('tint-up', 'tint-down'), 800);
    (dir > 0 ? sfx.statUp : sfx.statDown)(big);
  };

  // 상태 효과 그림: 포켓몬 위에 1초쯤 (마비 번개 · 화상 불꽃 · 독 거품 · 얼음 · 회복 · 잠듦 Zzz · 혼란 별 · 풀죽음 땀)
  const statusFx = (u, kind) => {
    const r = FX_ROW[kind];
    if (kind === 'sand' || kind === 'hail') { bump(SL[u].spr, 'hit'); return; }
    if (r == null) return;
    const fx = h('i.bt-sfx', { style: { '--r': r } });
    SL[u].spr.append(fx);
    setTimeout(() => fx.remove(), reducedMotion() ? 400 : 1100);
  };

  // 교체해 들어올 때 서버 글은 '○○의 △△ 시너지!' 로 끝남 → 첫 등장처럼 어떤 능력이 올랐는지 붙임
  const synFull = (m) => {
    const r = /^(@[01])?(.+)의 .+ 시너지!$/.exec(m);
    if (!r) return m;
    const s = r[1] ? Number(r[1][1]) : null;
    const mon = (b.sides || []).flatMap((sd, i) => (s == null || s === i ? sd.mons || [] : [])).find((x) => x?.name === fixNames(r[2], ren) && x.syn);
    return mon && SYN[mon.syn] ? `${m} ${SYN[mon.syn]} 올라갔다!` : m;
  };
  // 여러 번 맞는 기술 (물수리검 2~5번 등, ui8): 서버는 한 번 맞을 때마다 { hp, dmg } 를 하나씩 보냄 → 같은 기술 (use ~ 다음 use) 에서
  //   같은 상대가 2번 이상 맞으면 그 칸들 = 한 번씩 따로 (짧은 번쩍 · 데미지 숫자 · 소리 · HP 한 칸씩, 사이 쉼). 예전엔 0.5초 번쩍이
  //   0.32초마다 다시 시작돼서 한 번 맞은 것처럼 보였음
  const multiHits = (log) => {
    const out = new Map(); let run = [];
    const flush = () => { const by = new Map(); for (const e of run) { const u = e.hp[0]; if (!by.has(u)) by.set(u, []); by.get(u).push(e); }
      for (const es of by.values()) if (es.length > 1) es.forEach((e, k) => out.set(e, { k: k + 1, n: es.length })); run = []; };
    for (const e of log || []) { if (e.use || e.sw || e.back != null) flush(); if (e.hp && e.dmg > 0) run.push(e); }
    flush();
    return out;
  };
  const dmgTick = (u, dmg, k) => {
    const t = h('b.bt-dmg', { style: { '--k': k % 2 ? -1 : 1 } }, `-${dmg}`);
    SL[u].spr.append(t);
    setTimeout(() => t.remove(), reducedMotion() ? 500 : 800);
  };
  const play = async (log, prev) => {
    playing = true; el.menu.replaceChildren();
    const multi = multiHits(log);
    for (const e of log || []) {
      if (closed) return;
      const mineSide = (u) => (u >> 1) === me();
      if (e.back != null) {
        const bn = SL[e.back].name.textContent || fixNames(e.name, ren);
        await say2(mineSide(e.back) ? `${bn}, 돌아와!` : `${josa(foeName(), '은', '는')} ${josa(bn, '을', '를')} 들여보냈다!`, 300);
        SL[e.back].spr.classList.add('hide');
        continue;
      }
      if (e.sw) {
        const [u, i] = e.sw;
        const nm = spName(e.sp ?? monAt(u >> 1, i)?.sp, fixNames(e.name, ren));
        SL[u].spr.classList.add('hide'); SL[u].box.classList.add('hide');   // 새 포켓몬은 공이 열릴 때까지 안 보임 (기절한 자리의 'gone' 을 showMon 이 지워도)
        showMon(u, i, { hp: prev?.sides?.[u >> 1]?.mons?.[i]?.hp, sp: e.sp, name: nm, max: prev?.sides?.[u >> 1]?.mons?.[i]?.max, lv: e.lv });
        await say2(mineSide(u) ? `가랏! ${nm}!` : `${josa(foeName(), '은', '는')} ${josa(nm, '을', '를')} 내보냈다!`, 100);
        await throwBall(u);
        continue;
      }
      if (e.ab) { await abilityPop(e.ab[0], e.ab[1], e.name); if (!e.m) continue; }
      if (e.tf) await transformFx(e.tf[0], e.tf[1]);
      if ('wx' in e) { env.wx = e.wx; drawEnv(); envStart(e.wx); }
      if ('ter' in e) { env.ter = e.ter; drawEnv(); envStart(e.ter); }
      if (e.use) bump(SL[e.use[0]].spr, 'atk');
      const mh = e.hp && multi.get(e);
      if (mh) {
        const [u, v] = e.hp;
        SL[u].spr.classList.remove('hit');
        bump(SL[u].spr, 'hit1'); sfx.hit(); vibrate(20); dmgTick(u, e.dmg, mh.k);
        setHp(u, v);
        if (!e.m) { await sleep(reducedMotion() ? 200 : 430); continue; }   // 다음 번 맞기까지 쉼 (HP 칸이 한 칸씩 내려가는 게 보이게)
      } else if (e.hp) {
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
      if (e.m) await say2(tok(synFull(e.m)));
      else await sleep(reducedMotion() ? 60 : 320);
    }
    playing = false;
  };

  const finish = async () => {
    if (finished) return;
    finished = true;
    clearInterval(S.btPoll);
    music.set(null);
    const won = b.winner === me(); const rw = b.reward || {};
    if (won) { sfx.catch(); vibrate([80, 60, 200]); } else sfx.fail();
    if (lg) {
      // 0055 전설 배틀: 이기면 지친 전설을 잡으러 · 지거나 도망치면 이번 도전은 끝
      if (won) { await say2(`${josa(lg.name, '이', '가')} 쓰러질 듯 비틀거린다…`, 300); await say2(`${josa(lg.name, '이', '가')} 지쳤다! 지금이야!`); }
      else if (b.winner == null) await say2(`${josa(lg.name, '과', '와')} 비겼다…`);
      else if ((side(me())?.mons || []).some((m) => m.hp > 0)) await say2('무사히 도망쳤다!');
      else { await say2('나에게는 싸울 수 있는 포켓몬이 없다!'); await say2('눈앞이 캄캄해졌다!'); }
      if (!won) await say2(`${josa(lg.name, '은', '는')} 어딘가로 모습을 감췄다…`);
    } else if (b.winner == null) await say2('무승부!');
    else if (won) {
      await say2(`${josa(foeName(), '과', '와')}의 승부에서 이겼다!`);
      if (rw.ticket) await say2(`★ 진화의 돌 1개를 받았다! (오늘 ${rw.today}/${S.btToday?.max || 3})`);
      else if (BT_WHY[rw.why]) await say2(BT_WHY[rw.why]);
    } else if ((side(me())?.mons || []).some((m) => m.hp > 0)) {
      await say2(b.mode === 'pvp' ? '기권했다… (진 것으로 판정)' : '무사히 도망쳤다! (진 것으로 판정)');
    } else {
      await say2('나에게는 싸울 수 있는 포켓몬이 없다!');
      await say2('눈앞이 캄캄해졌다!');
    }
    if (rw.exp_why === 'practice_max') await say2(`오늘 연습 배틀 경험치는 다 받았다! (하루 ${rw.practice_max}판) 친구 배틀은 계속 경험치를 받을 수 있다.`);
    else if (rw.practice_counted && rw.practice_left <= 3) await say2(`오늘 경험치를 받을 수 있는 연습 배틀이 ${rw.practice_left}판 남았다.`, 300);
    // 경험치 (나온 포켓몬마다) · 레벨 업 · 주운 물건 (0020)
    for (const x of rw.exp?.[me()] || []) {
      if (closed) return;
      const xn = fixNames(x.name, ren);
      await say2(`${josa(xn, '은', '는')} ${x.exp} 경험치를 얻었다!`, 300);
      if (x.up > 0) { sfx.catch(); await say2(`${xn}의 레벨이 ${josa(x.lv, '으로', '로')} 올랐다!`); }
    }
    const got = rw.item?.[me()];
    if (got && itemOf(got)) { sfx.catch(); await say2(`${josa(itemOf(got).name, '을', '를')} 주웠다!`); }
    loadBag({ notify: false }).catch(() => {});
    // 다시 하기: 연습은 같은 형식으로, 친구와는 방금 그 친구에게 (최근 상대 목록의 맨 앞 = 이 배틀)
    const again = h('div.bt-main');
    const ok = h('button.bt-cmd', { onclick: () => closeOverlay() }, '확인');
    if (lg) {
      again.append(h('button.bt-cmd.fight', { onclick: () => closeOverlay() }, won ? '잡으러 가기!' : '확인'));
      el.text.textContent = won ? `${josa(lg.name, '이', '가')} 지쳤다! 지금이야!` : `${josa(lg.name, '은', '는')} 어딘가로 모습을 감췄다…`;
      el.menu.replaceChildren(again);
      return;
    }
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
      el.text.textContent = b.status === 'declined' ? `${josa(foeName(), '이', '가')} 배틀을 거절했어요.`
        : b.reward?.why === 'replaced' ? '새 배틀을 시작해서 이 배틀은 취소됐어요. (승패 없음)' : '배틀 신청이 취소됐어요. (시간이 지났거나 취소함)';
      el.menu.replaceChildren(h('button.btn.big', { onclick: () => closeOverlay() }, '닫기'));
      clearInterval(S.btPoll);
      return;
    }
    if (b.status !== 'active' || !side(me())) return;
    if (b.chosen) { el.text.textContent = '상대가 고르기를 기다리는 중…'; el.menu.replaceChildren(); return; }
    if (b.phase === 'replace' && !b.need) { el.text.textContent = '상대가 다음 포켓몬을 고르는 중…'; el.menu.replaceChildren(); return; }
    const mine = side(me());
    const slots = mySlots();

    // 쓰러진 자리에 내보낼 포켓몬 고르기 (2 대 2 는 자리마다)
    if (b.need) {
      const needK = b.need_slots || [0];
      const k = needK.find((x) => !menu.picks[x]);
      if (k == null) return;
      const used = Object.values(menu.picks).filter(Boolean).map((p) => p.switch);
      el.text.textContent = needK.length > 1 ? `${k === 0 ? '왼쪽' : '오른쪽'} 자리에 누구를 내보낼까?` : '다음 포켓몬을 골라 주세요!';
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
          h('span.bt-mv-top', h('b', '발버둥'), h('small.bt-pow', '위력 50')), h('span.bt-mv-info', h('span.type.t-???', '???'), h('small', '자신도 다친다')))), h('button.btn.small', { onclick: back }, '◀ 뒤로'));
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
            const targets = mv.kind === 'attack' || mv.effect?.foe_status || mv.effect?.foe || mv.effect?.transform;
            if (targets && foes.length > 1) { menu.mode = 'target'; menu.move = i + 1; return renderMenu(); }
            choose({ move: i + 1, target: foes[0] ?? 0 });
          },
        // 위력: 공격 기술은 숫자, 상태 변화·방어 기술은 — (실제 포켓몬처럼)
        }, h('span.bt-mv-top', h('b', mv.name || '?'), h('small.bt-pow', `위력 ${mv.kind === 'attack' && mv.power ? mv.power : '—'}`)), h('span.bt-mv-info', h(`span.type.t-${mv.type}`, mv.type), h('small', `PP ${x.pp}/${mv.pp}`)),
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
      h('button.bt-cmd', { onclick: () => { sfx.blip(); menu.mode = 'switch'; renderMenu(); } }, '포켓몬'),
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
    renameBattle(nb, ren);
    const prev = b; b = nb;
    if (b.status === 'active' && !finished) music.set('battle');   // 신청을 친구가 수락함
    if (prev.status === 'invite' && b.status === 'active' && !(b.seq > 0)) {   // 수락 직후: 바로 그림을 띄우지 않고 등장 연출부터
      shownSeq = b.seq; env.wx = b.wx ?? null; env.ter = b.ter ?? null; drawEnv(); drawStatic();
      await runIntro(); return;
    }
    if (b.seq !== shownSeq && b.seq > 0) { shownSeq = b.seq; await play(b.log, prev); }
    env.wx = b.wx ?? null; env.ter = b.ter ?? null; drawEnv();
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
    el.text.textContent = lg ? '정말 도망칠까? (이번 도전은 끝나요)' : b.mode === 'pvp' ? '정말 기권할까? (진 것으로 판정)' : '정말 도망칠까? (진 것으로 판정)';
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

  const modeLabel = lg ? `${lg.roam ? '방랑 전설' : '전설의 포켓몬'} · 배틀로 지치게 한 뒤 잡기` : `${{ cpu: '연습 배틀', team: '친구 팀 (AI)', pvp: '실시간 배틀' }[b.mode]} · ${FMT[b.format]?.label || '1 대 1'}`;
  const pads = h('div.bt-layer');
  el.field = h(`div.bt-field.bg-${BT_ENV_BG[b.field?.env] || BT_BG[b.id % BT_BG.length]}${dbl ? '.dbl' : ''}`,
    el.ter, pads, ...SL.map((x) => x.spr), el.wx, el.env,
    h('div.bt-boxes.foe', SL.filter((x) => (x.u >> 1) === fo()).map((x) => x.box)),
    h('div.bt-boxes.me', SL.filter((x) => (x.u >> 1) === me()).map((x) => x.box)));
  const ov = overlay(h('div.bt-stage',
    h('div.bt-top', h('b', modeLabel), el.timer),
    el.field,
    h('div.bt-textbox', el.text, el.arrow), el.menu), 'full');
  ov.classList.add('battle-overlay');
  if (lg) ov.classList.add('legend-battle');   // 0055: 처음 열 때 하얗게 번쩍 (GBA 의 전설 만남처럼)
  for (const x of SL) { x.box.onclick = () => showInfo(x.u); x.spr.onclick = () => showInfo(x.u); }
  drawEnv();
  el.arrow.hidden = true;
  ov.onclose = () => { closed = true; music.pop(); clearInterval(S.btPoll); clearInterval(S.btTick); pollInbox(true); doneRes(b); };
  clearInterval(S.btPoll); clearInterval(S.btTick);
  // 실시간 대전·신청 대기 중에는 2초마다 상태 확인 (턴이 풀렸는지, 수락했는지)
  S.btPoll = setInterval(async () => {
    if (playing || busy || closed || b.mode !== 'pvp') return;
    if (['over', 'declined', 'cancelled'].includes(b.status)) return;
    try { await apply(await rpc('battle_state', { p_id: b.id }, { retries: 0 })); } catch { /* offline: try again */ }
  }, 2000);
  S.btTick = setInterval(tick, 500);
  // 첫 등장 연출: 빈 자리 → 공 던지기 → 공이 열리면 포켓몬 (+ 상자). 처음 열 때 · 보낸 신청을 친구가 수락했을 때
  async function runIntro() {
    playing = true;
    SL.forEach((x) => { x.spr.classList.add('hide'); x.box.classList.add('hide'); });
    await sleep(250);
    const foeSlots = SL.filter((x) => (x.u >> 1) === fo() && !x.spr.hidden);
    const mySlotsEl = SL.filter((x) => (x.u >> 1) === me() && !x.spr.hidden);
    const names = (xs) => xs.map((x) => x.name.textContent);
    const join = (ns) => (ns.length > 1 ? `${josa(ns[0], '과', '와')} ${ns[1]}` : ns[0]);
    if (lg) {
      // 0055: 전설은 공에서 나오지 않음 — 바로 모습을 드러내고 덤벼듦 + 보스 기운 (체력 배수 · 능력 랭크)
      for (const x of foeSlots) { x.spr.classList.remove('hide'); x.box.classList.remove('hide'); bump(x.spr, 'enter'); }
      sfx.ballPop?.();
      await say2(`야생의 ${josa(lg.name, '이', '가')} 덤벼든다!`, 450);
      const bs = lg.boss || {};
      for (const x of foeSlots) statFx(x.u, 1);
      const aura = [Number(bs.hp_mult) > 1 ? `체력 ×${+Number(bs.hp_mult).toFixed(1)}` : '', Number(bs.stage) > 0 ? `공격·방어·특공·특방 +${bs.stage}` : ''].filter(Boolean).join(' · ');
      await say2(`${lg.name}의 몸에서 엄청난 기운이 뿜어져 나온다!${aura ? ` (${aura})` : ''}`, 450);
    } else await say2(`${josa(foeName(), '이', '가')} 승부를 걸어왔다!`, 450);
    const fenv = b.field?.env && ENV[b.field.env] ? b.field.env : null;
    const intro = b.turn === 0 && Array.isArray(b.log) ? b.log : [];
    // 등장 특성이 날씨 · 필드를 바꿨으면 시작 화면은 시간표 날씨부터 (특성 알림 때 바뀜)
    if (intro.length) { env.wx = fenv && ENV[fenv].kind === 'wx' ? fenv : null; env.ter = fenv && ENV[fenv].kind === 'ter' ? fenv : null; drawEnv(); }
    if (fenv) { envStart(fenv); await say2(`지금은 ${b.field.name}! ${ENV[fenv].start}`, 450); }
    else if (b.field?.types?.length) await say2(`지금은 ${b.field.name}! ${b.field.types.join('·')} 기술의 위력이 올라간다!`, 450);
    if (b.fair) await say2('공정 모드! 모두 Lv.50으로 싸운다. (회복약 없음)', 450);
    if (!lg) {
      await say2(`${josa(foeName(), '은', '는')} ${josa(join(names(foeSlots)), '을', '를')} 내보냈다!`, 100);
      for (const x of foeSlots) await throwBall(x.u);
    }
    await say2(`가랏! ${join(names(mySlotsEl))}!`, 100);
    for (const x of mySlotsEl) await throwBall(x.u);
    // 같은 과 시너지 (0020): 나온 포켓몬의 능력 +1
    for (const x of [...foeSlots, ...mySlotsEl]) {
      const m = monAt(x.u >> 1, side(x.u >> 1).act[x.u & 1]);
      if (m?.syn) { statFx(x.u, 1); await say2(tok(`@${x.u >> 1}${m.name}의 ${m.synname} 시너지! ${SYN[m.syn]} 올라갔다!`), 300); }
    }
    // 0039: 등장 특성 (위협 · 가뭄 · 괴짜 …) — 서버가 배틀을 만들 때 쓴 기록
    if (intro.length) { await play(intro); env.wx = b.wx ?? null; env.ter = b.ter ?? null; drawEnv(); drawStatic(); }
    playing = false; startPicks(); renderMenu();
  }
  drawStatic(); tick();
  if (b.status === 'active' && shownSeq === -1) {
    shownSeq = b.seq;
    runIntro();
  } else {
    startPicks(); renderMenu();
    if (b.status === 'over') { finished = true; el.text.textContent = b.winner === me() ? '이긴 배틀이에요.' : '끝난 배틀이에요.'; el.menu.replaceChildren(h('button.btn.big', { onclick: () => closeOverlay() }, '닫기')); }
  }
  return done;
}
