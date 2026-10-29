// 가방 (0020): 몬스터 박스 · 도구 · 회복약 · 기술머신 · 티켓. 3·4세대 가방처럼 주머니 탭 → 목록 → 아래 설명·버튼.
// 몬스터를 누르면 상태(레벨·경험치·지닌 물건) / 능력치 / 기술(잊고 배우기) / 도감.
import { sb, rpc, errorText } from './sb.js';
import { spriteCanvas } from './sprites.js';
import { sfx } from './sfx.js';
import { h, josa, toast, pix } from './ui.js';
import { S, collection, speciesOf, dexOf } from './state.js';
import { overlay, sheet, closeOverlay, openBag } from './app.js';
import { openDetail, typeOf, STAT_KEYS, CAT_LABEL, KIND_LABEL } from './dex.js';
import { moveOf } from './battle.js';

// 아이콘 순서 = tools/draw_fx.py ITEM_ICONS (web/img/items.png, 16px 칸)
const TM_TYPES = ['국어', '수학', '영어', '물리', '화학', '생명', '지구', '지리', '정치경제', '윤리', '역사', '외국어', '정보', '체육', '음악', '보통', '전설'];
const ICONS = [...Array.from({ length: 15 }, (_, i) => `boost${String(i + 1).padStart(2, '0')}`),
  'glasses', 'lucky', 'choco', 'cushion', 'clock', 'mask', 'hotpack', 'bandage', 'ointment', 'iv', 'mint', 'energy', 'firstaid', 'candy',
  ...TM_TYPES.map((t) => `tm:${t}`)];
export const itemOf = (key) => (S.catalog.items || []).find((x) => x.key === key);
const qty = (key) => (S.bag?.items || []).find((x) => x.key === key)?.qty || 0;
const boxOf = (line) => (S.bag?.box || []).find((x) => x.line === line);
export const statl = (b, hp, lv) => Math.floor(((2 * (b || 50) + 31) * lv) / 100) + (hp ? lv + 10 : 5);

export function itemIcon(key, size = 32) {
  const it = itemOf(key);
  const k = it?.pocket === 'tm' ? (key.startsWith('sp') ? 'tm:전설' : `tm:${moveOf(it.move_id)?.type || '보통'}`) : key;
  const i = Math.max(0, ICONS.indexOf(k));
  return h('i.item-ico', { 'aria-hidden': 'true', style: { width: `${size}px`, height: `${size}px`, backgroundSize: `${ICONS.length * size}px ${size}px`, backgroundPosition: `-${i * size}px 0` } });
}

let learnRows = null;
async function learnset() {
  if (!learnRows) {
    const r = await sb.from('learnset').select('line_id,move_id,lv,how');
    if (r.error) throw new Error('OFFLINE');
    learnRows = r.data || [];
  }
  return learnRows;
}

// 가방 상태 + 새로 주운 물건 알림 (item_log 의 마지막 번호를 기억)
const WHY = { place: '장소 QR', quiz: '퀴즈 정답', battle: '배틀 승리', raid: '레이드', admin: '운영진 선물' };
let loading = null;
export async function loadBag({ notify = true } = {}) {
  loading ||= (async () => {
    let seen = 0;
    try { seen = Number(localStorage.getItem('bagSeen') || 0); } catch { /* private mode */ }
    const r = await rpc('bag_state', { p_since: seen }, { retries: 0 });
    S.bag = r;
    if (notify && seen > 0) {
      for (const e of r.log || []) {
        if (e.item === '_team_level') toast(`장소 ${e.qty}곳 방문! 배틀 팀 몬스터의 레벨이 올랐다!`, 4000);
        else if (itemOf(e.item)) toast(`${josa(itemOf(e.item).name, '을', '를')} 주웠다! (${WHY[e.why] || ''})`, 4000);
      }
    }
    try { localStorage.setItem('bagSeen', String(r.last || 0)); } catch { /* */ }
    return r;
  })().finally(() => { loading = null; });
  return loading;
}

const POCKETS = [['box', '몬스터'], ['tool', '도구'], ['med', '회복약'], ['tm', '기술머신'], ['key', '티켓']];

let last = { pocket: 'box', sel: null };
const backToBag = () => openBagScreen(last.pocket, last.sel);

export async function openBagScreen(pocket = 'box', selected = null) {
  sfx.select();
  if (!S.online) return toast('가방은 인터넷이 필요해요. 와이파이나 데이터를 켜 주세요.');
  try { await loadBag(); } catch (e) { return toast(errorText(e.message)); }
  let cur = pocket; let sel = selected;
  const tabs = h('div.bag-tabs', { role: 'tablist' });
  const list = h('div.bag-list');
  const panel = h('div.bag-panel');
  const draw = () => {
    last = { pocket: cur, sel };
    tabs.replaceChildren(...POCKETS.map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(k === cur), onclick: () => { sfx.blip(); cur = k; sel = null; draw(); } }, t)));
    list.replaceChildren(...pocketList(cur, sel, (k) => { sfx.blip(); sel = k; draw(); }, draw));
    panel.replaceChildren(...pocketPanel(cur, sel, draw));
    panel.hidden = cur === 'box' || cur === 'key' || !sel;
  };
  const ov = overlay(h('div.bag-screen',
    h('div.bag-head', h('b', pix('bag'), ' 가방'), h('button.btn.small', { onclick: () => closeOverlay() }, '닫기')),
    tabs, list, panel), 'full');
  ov.classList.add('bag-overlay');
  ov.redraw = draw;
  draw();
}

function pocketList(cur, sel, pick, redraw) {
  if (cur === 'box') {
    const box = [...(S.bag?.box || [])].sort((a, b) => b.level - a.level || a.line - b.line);
    if (!box.length) return [h('p.muted', '아직 몬스터가 없어요. QR을 찍어 모아요!')];
    return [h('div.box-grid', box.map((m) => {
      const sp = speciesOf(dexOf(m.line, m.stage));
      return h('button.box-cell', { onclick: () => openMon(m.line) },
        spriteCanvas(sp.id, 48), h('small', `Lv.${m.level}`), m.held ? h('span.box-held', itemIcon(m.held, 16)) : null);
    })), h('small.muted', '몬스터를 누르면 상태 · 능력치 · 기술 · 도감을 볼 수 있어요.')];
  }
  if (cur === 'key') {
    const p = S.snap?.profile || {};
    return [h('div.stack',
      h('div.bag-row', h('span.key-ico', pix('ticket', 'l')), h('span', h('b', '진화권'), h('br'), h('small', '도감에서 진화에 써요')), h('b.qty', `×${p.evo_tickets ?? 0}`)),
      h('div.bag-row', h('span.key-ico', pix('ticket', 'l')), h('span', h('b', '부스 티켓'), h('br'), h('small', '부스에서 몬스터로 바꿔요')), h('b.qty', `×${(S.snap?.tickets || []).filter((t) => t.status === 'pending').length}`)),
      h('button.btn.big.primary', { onclick: () => { closeOverlay(); openBag(); } }, '티켓 QR 보여주기 (부스용)'))];
  }
  const want = cur === 'tool' ? ['hold', 'tool'] : [cur];
  const rows = (S.bag?.items || []).map((x) => ({ ...x, it: itemOf(x.key) })).filter((x) => x.it && want.includes(x.it.pocket))
    .sort((a, b) => a.it.sort - b.it.sort);
  if (!rows.length) {
    return [h('p.muted', {
      tool: '도구가 없어요. 장소 QR을 찍거나 배틀에서 이기면 가끔 주워요.',
      med: '회복약이 없어요. 장소 QR · 퀴즈 · 배틀에서 가끔 주워요.',
      tm: '기술머신이 없어요. 퀴즈 정답 · 배틀 승리 · 레이드에서 가끔 받아요.',
    }[cur])];
  }
  return rows.map((x) => {
    const mv = x.it.pocket === 'tm' ? moveOf(x.it.move_id) : null;
    return h(`button.bag-row${sel === x.key ? '.on' : ''}`, { onclick: () => pick(x.key) },
      itemIcon(x.key),
      mv ? h('span.tm-line', h('b', h('small.tm-no', x.it.name.replace('특별 기술머신', '특별 No.').replace('영구 기술머신', '영구 No.').replace('기술머신', 'No.')), ` ${mv.name}`),
        h('small', h(`span.type.t-${mv.type}`, mv.type), ...[`위력 ${mv.power || '—'}`, `명중 ${mv.accuracy ?? '—'}`, `PP ${mv.pp}`].map((t, i) => h('span.nw', `${i ? ' · ' : ''}${t}`))))
        : h('span', h('b', x.it.name), h('br'), h('small', { hold: '지니게 하는 물건', tool: '쓰는 물건', med: '배틀 중에 사용' }[x.it.pocket])),
      h('b.qty', `×${x.qty}`));
  });
}

function pocketPanel(cur, sel, redraw) {
  const it = itemOf(sel);
  if (!it) return [];
  const desc = h('p.bag-desc', it.description);
  if (it.pocket === 'med') return [h('div.bag-pi', itemIcon(it.key, 48), desc), h('small.muted', '배틀 중에 "가방"을 눌러 써요. 한 배틀에 2개까지 (공정 모드에서는 못 써요).')];
  if (it.pocket === 'hold') {
    return [h('div.bag-pi', itemIcon(it.key, 48), desc),
      h('button.btn.big.primary', { onclick: () => pickMon(`${josa(it.name, '을', '를')} 누구에게 줄까?`, () => '', async (line) => {
        try { await rpc('bag_set_held', { p_line: line, p_item: it.key }, { retries: 0 }); sfx.select(); toast(`${josa(it.name, '을', '를')} 지니게 했다!`); }
        catch (e) { toast(errorText(e.message)); }
        backToBag();
      }) }, '몬스터에게 지니게 하기')];
  }
  if (it.pocket === 'tool') {
    return [h('div.bag-pi', itemIcon(it.key, 48), desc),
      h('button.btn.big.primary', { onclick: () => pickMon(`${josa(it.name, '을', '를')} 누구에게 쓸까?`, (m) => (m.level >= 100 ? 'Lv.100' : ''), async (line) => {
        try {
          const r = await rpc('bag_use', { p_item: it.key, p_line: line }, { retries: 0 });
          sfx.catch(); toast(`${speciesOf(dexOf(line, boxOf(line).stage)).name}의 레벨이 ${r.level}${/[013678]$/.test(String(r.level)) ? "으로" : "로"} 올랐다!`, 3500);
        } catch (e) { toast(errorText(e.message)); }
        backToBag();
      }) }, '사용')];
  }
  // 기술머신: 몬스터마다 가능 / 불가 / 배움
  const mv = moveOf(it.move_id) || {};
  const strip = h('div.box-grid.small');
  learnset().then((L) => {
    const can = new Set(L.filter((x) => x.how === 'tm' && x.move_id === it.move_id).map((x) => x.line_id));
    strip.replaceChildren(...(S.bag?.box || []).map((m) => {
      const known = m.known.includes(it.move_id);
      const tag = known ? '배움' : can.has(m.line) ? '가능' : '불가';
      const sp = speciesOf(dexOf(m.line, m.stage));
      return h(`button.box-cell.tm-${tag === '가능' ? 'ok' : tag === '배움' ? 'known' : 'no'}`, {
        disabled: tag !== '가능',
        onclick: () => sheet(h('div.stack',
          h('b', `${josa(sp.name, '에게', '에게')} ${josa(mv.name, '을', '를')} 가르칠까?`),
          h('small', it.effect?.permanent ? '영구 기술머신은 써도 없어지지 않아요. 다른 몬스터에게도 또 가르칠 수 있어요.'
            : '기술머신은 한 번 쓰면 없어져요. 배운 기술은 몬스터의 기술 목록에 계속 남아서 언제든 바꿔 쓸 수 있어요.'),
          h('button.btn.big.primary', { onclick: async () => {
            try {
              await rpc('bag_use', { p_item: it.key, p_line: m.line }, { retries: 0 });
              sfx.catch(); toast(`${josa(sp.name, '은', '는')} ${josa(mv.name, '을', '를')} 배웠다!`, 3500);
            } catch (e) { toast(errorText(e.message)); }
            backToBag();
          } }, '가르치기'),
          h('button.btn', { onclick: backToBag }, '취소'))),
      }, spriteCanvas(sp.id, 40), h('small', tag));
    }));
  }).catch(() => strip.replaceChildren(h('small', '인터넷이 필요해요.')));
  return [h('div.bag-pi', itemIcon(it.key, 48), h('div.tm-line',
    h('b', mv.name, ' ', h(`span.type.t-${mv.type}`, mv.type)),
    h('small', `${CAT_LABEL[mv.category]} · 위력 ${mv.power || '—'} · 명중 ${mv.accuracy ?? '반드시'} · PP ${mv.pp}`), desc)),
  h('small.muted', '가능한 몬스터를 눌러 가르쳐요.'), strip];
}

// 몬스터 고르기 시트. tag(m) 이 글자를 돌려주면 그 몬스터는 못 고름
function pickMon(title, tag, done) {
  sfx.blip();
  sheet(h('div.stack', h('b', title),
    h('div.box-grid', (S.bag?.box || []).map((m) => {
      const t = tag(m); const sp = speciesOf(dexOf(m.line, m.stage));
      return h('button.box-cell', { disabled: !!t, onclick: () => done(m.line) }, spriteCanvas(sp.id, 40), h('small', t || `Lv.${m.level}`));
    })),
    h('button.btn', { onclick: backToBag }, '취소')));
}

// ── 몬스터 보기: 상태 / 능력치 / 기술 / 도감 ──
export async function openMon(line, page = 0) {
  const m = boxOf(line);
  if (!m) return;
  const sp = speciesOf(dexOf(line, m.stage)); const type = typeOf(sp);
  const PAGES = ['상태', '능력치', '기술', '도감'];
  const body = h('div.sum-body');
  const tabs = h('div.sum-tabs', PAGES.map((t, i) => h('button', { type: 'button', 'aria-pressed': String(i === page), onclick: () => show(i) }, t)));
  const show = (i) => {
    if (i === 3) { closeOverlay(); openDetail(sp); return; }
    page = i;
    tabs.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-pressed', String(k === page)));
    sfx.blip();
    body.replaceChildren(...[monState, monStats, monMoves][page](boxOf(line), sp, () => openMon(line, page)));
  };
  const ov = sheet([
    h('div.summary',
      h('div.sum-top', h('span', sp.name), h(`span.type.t-${type}`, type), h('span.sum-lv', `Lv.${m.level}`)),
      h('div.sum-main', h(`div.sum-pic.t-bg-${type}`, spriteCanvas(sp.id, 112)), h('div.sum-right', tabs, body))),
    h('button.btn', { onclick: backToBag }, '가방으로'),
  ]);
  ov.classList.add('sum-overlay', 'mon-view');
  show(page);
}

function monState(m, sp, reopen) {
  const src = S.bag?.sources || {};
  const held = m.held && itemOf(m.held);
  return [
    h('div.exp-row', h('span', 'EXP'), h('span.stat-bar.exp', h('i', { style: { width: `${m.need ? (m.exp / m.need) * 100 : 100}%` } })),
      h('small', m.level >= 100 ? 'MAX' : `${m.exp}/${m.need}`)),
    h('div.bag-row.slim', held ? itemIcon(m.held, 24) : h('i.item-ico.none'), h('span', h('small', '지닌 물건'), h('br'), h('b', held ? held.name : '없음')),
      held ? h('button.btn.small', { onclick: async () => {
        try { await rpc('bag_set_held', { p_line: m.line, p_item: null }, { retries: 0 }); toast(`${josa(held.name, '을', '를')} 가방에 넣었다.`); await loadBag({ notify: false }); reopen(); }
        catch (e) { toast(errorText(e.message)); }
      } }, '빼기') : null),
    held && h('small.muted', held.description),
    h('b', '레벨 올리는 법'),
    h('ul.lv-src',
      src.battle !== false && h('li', '배틀 (이기면 더 많이, 실시간 배틀은 1.5배)'),
      src.raid !== false && h('li', '레이드에 참가해서 이 몬스터로 탭하기'),
      src.places !== false && h('li', `오늘 다른 장소 QR ${src.places_n || 3}곳마다 → 배틀 팀 모두 +1`),
      src.catch !== false && h('li', '같은 선생님 몬스터를 또 잡기 +1'),
      h('li', '이상한사탕 +1 (가방 → 도구)')),
  ];
}

function monStats(m, sp) {
  const vals = STAT_KEYS.map(([k]) => sp[k] || 0);
  return [
    h('div.sum-stats', STAT_KEYS.map(([k, name], i) => h('div.stat-row',
      h('span.stat-name', name), h('b.stat-val', String(statl(vals[i], k === 'hp', m.level))),
      h('span.stat-bar', h('i', { style: { width: `${Math.min(100, (vals[i] / 150) * 100)}%` } }))))),
    h('small.muted', `숫자 = Lv.${m.level} 능력치 · 막대 = 종족값. 레벨이 오르면 능력치도 올라요.`),
  ];
}

function moveRow(mv, extra, on) {
  return h('button.move-row', { type: 'button', onclick: on },
    h(`span.type.t-${mv.type}`, mv.type), h('b', mv.name), extra || h(`span.kind.k-${mv.kind}`, KIND_LABEL[mv.kind]), h('span.pp', `PP ${mv.pp}`));
}

function moveInfo(mv) {
  return h('div.move-detail',
    h('div.move-kv', h('span', '분류'), h('b', `${CAT_LABEL[mv.category]} · ${KIND_LABEL[mv.kind]}`),
      h('span', '위력'), h('b', mv.power ? String(mv.power) : '—'), h('span', '명중'), h('b', mv.accuracy == null ? '반드시' : String(mv.accuracy))),
    h('p', mv.description));
}

// 기술: 지금 4개 → 하나를 누르고 "바꾸기" → 아는 기술 중에서 고름 (3·4세대 "기술을 잊고 배우기")
function monMoves(m, sp, reopen) {
  const detail = h('div');
  let pickIdx = null;
  const learned = new Set(m.learned || []);
  const curRows = m.moves.map((id, i) => {
    const mv = moveOf(id) || { name: '?', type: '보통', kind: 'attack', pp: 0 };
    const row = moveRow(mv, null, () => {
      sfx.blip(); pickIdx = i;
      curRows.forEach((r, k) => r.setAttribute('aria-pressed', String(k === i)));
      detail.replaceChildren(moveInfo(mv), h('button.btn.primary', { onclick: () => chooseNew(i) }, `${josa(mv.name, '을', '를')} 잊고 다른 기술 배우기`));
    });
    return row;
  });
  const others = m.known.filter((id) => !m.moves.includes(id)).map(moveOf).filter(Boolean);
  const chooseNew = (i) => {
    const old = moveOf(m.moves[i]);
    if (!others.length) return toast('아직 바꿀 수 있는 다른 기술이 없어요. 레벨을 올리거나 기술머신을 써 봐요!', 3500);
    sheet(h('div.stack',
      h('b', `${josa(old.name, '을', '를')} 잊고 무엇을 배울까?`),
      h('div.move-list', others.map((mv) => moveRow(mv, learned.has(mv.id) ? h('span.kind.k-new', '기술머신') : null, async () => {
        const next = [...m.moves]; next[i] = mv.id;
        try {
          await rpc('bag_set_moves', { p_line: m.line, p_moves: next }, { retries: 0 });
          sfx.catch();
          toast(`1, 2 그리고… 짠! ${josa(sp.name, '은', '는')} ${josa(old.name, '을', '를')} 깨끗이 잊었다! 그리고 ${josa(mv.name, '을', '를')} 배웠다!`, 4500);
          await loadBag({ notify: false }); reopen();
        } catch (e) { toast(errorText(e.message)); }
      }))),
      h('button.btn', { onclick: reopen }, '그만두기')));
  };
  // 앞으로 레벨이 오르면 배울 기술
  const later = h('div.move-list.later');
  learnset().then((L) => {
    const rows = L.filter((x) => x.how === 'level' && x.line_id === m.line && x.lv > m.level && !m.known.includes(x.move_id)).sort((a, b) => a.lv - b.lv);
    later.replaceChildren(...rows.map((x) => { const mv = moveOf(x.move_id); return mv ? moveRow(mv, h('span.kind', `Lv.${x.lv}`), () => { sfx.blip(); detail.replaceChildren(moveInfo(mv)); }) : null; }));
  }).catch(() => {});
  return [
    h('small.muted', '기술을 누르고 "잊고 다른 기술 배우기"로 바꿔요.'),
    h('div.move-list', curRows), detail,
    h('small.muted', others.length ? `지금 바꿀 수 있는 기술 ${others.length}개` : '아직 바꿀 수 있는 기술이 없어요.'),
    h('div', h('b', '레벨이 오르면 배우는 기술')), later,
  ];
}
