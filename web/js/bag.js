// 가방 (0020): 포켓몬 박스 · 도구 · 회복약 · 기술머신 · 티켓. 3·4세대 가방처럼 주머니 탭 → 목록 → 아래 설명·버튼.
// 포켓몬 주머니 = 3세대(에메랄드) PC 박스 (0036): ◀ BOX n ▶ · 6열 × 5줄 = 30칸 · 30박스 (같은 포켓몬도 여러 마리).
// 포켓몬을 누르면 요약: 상태(레벨·경험치·지닌 물건) / 능력치 / 기술(잊고 배우기) / 도감 + 카드 · 진화 · 옮기기 · 놓아주기.
import { rpc, errorText, selectAll } from './sb.js';
import { spriteCanvas, monSprite } from './sprites.js';
import { sfx } from './sfx.js';
import { h, josa, toast, pix } from './ui.js';
import { S, mons, speciesOf, dexOf } from './state.js';
import { overlay, sheet, closeOverlay, openBag, sync } from './app.js';
import { openDetail, typeOf, typeChips, STAT_KEYS, CAT_LABEL, KIND_LABEL, TYPES, evoSheet, evoOpts, abilityBox } from './dex.js';
import { moveOf } from './battle.js';
import { eggPocket, loadEggs, TIER } from './eggs.js';
import { CHARM_SVG } from './legends.js';
import { tradeMenu } from './trade.js';

// 아이콘 순서 = tools/build_item_icons.py ORDER (web/img/items.png, 32px 칸, 실제 포켓몬 물건 그림)
const ICONS = [...Array.from({ length: 18 }, (_, i) => `boost${String(i + 1).padStart(2, '0')}`),
  'glasses', 'lucky', 'choco', 'cushion', 'clock', 'mask', 'hotpack', 'bandage', 'ointment', 'iv', 'mint', 'energy', 'firstaid', 'candy', 'evo',
  ...TYPES.map((t) => `tm:${t}`)];
export const itemOf = (key) => (S.catalog.items || []).find((x) => x.key === key);
const boxOf = (id) => (S.bag?.box || []).find((x) => x.id === id);
const spOf = (m) => speciesOf(m.species_id || dexOf(m.line, m.stage));   // 0037: 갈래 종은 species_id
export const statl = (b, hp, lv) => Math.floor(((2 * (b || 50) + 31) * lv) / 100) + (hp ? lv + 10 : 5);

// PC 박스: 30칸 × 30박스 (pos 0~899 → BOX pos/30+1, 칸 pos%30)
const PER = 30; const BOXES = 30;
export const boxLabel = (pos) => (pos == null ? '' : `BOX ${Math.floor(pos / PER) + 1} · ${(pos % PER) + 1}번 칸`);
let pcBox = 0;          // 지금 보는 박스 (0부터)
let moving = null;      // 옮기는 중인 포켓몬 번호

export function itemIcon(key, size = 32) {
  const it = itemOf(key);
  const k = it?.pocket === 'tm' ? `tm:${moveOf(it.move_id)?.type || '노말'}` : key;
  const i = Math.max(0, ICONS.indexOf(k));
  return h('i.item-ico', { 'aria-hidden': 'true', style: { width: `${size}px`, height: `${size}px`, backgroundSize: `${ICONS.length * size}px ${size}px`, backgroundPosition: `-${i * size}px 0` } });
}

// 기술 배우기 표: 내 포켓몬 계열 것만 (전체는 1만 줄이 넘음). 새 계열을 잡으면 다시 받음
let learnRows = null; let learnKey = '';
async function learnset() {
  const lines = [...new Set([...mons().map((c) => c.line_id), ...(S.bag?.box || []).map((m) => m.line)])].sort((a, b) => a - b);
  const key = lines.join(',');
  if (!learnRows || learnKey !== key) {
    const r = await selectAll('learnset', 'line_id,move_id,lv,how', (q) => q.in('line_id', lines.length ? lines : [0]).order('line_id').order('move_id'));
    if (r.error) throw new Error('OFFLINE');
    learnRows = r.data || []; learnKey = key;
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
    const [r, abil] = await Promise.all([rpc('bag_state', { p_since: seen }, { retries: 0 }),
      rpc('my_abilities', {}, { retries: 0 }).catch(() => ({}))]);   // 0039: 포켓몬마다 특성 {id: key}
    for (const m of r.box || []) m.ability = abil?.[m.id] ?? null;
    S.monAb = abil || {};
    S.bag = r;
    if (notify && seen > 0) {
      for (const e of r.log || []) {
        if (e.item === '_team_level') toast(`장소 ${e.qty}곳 방문! 배틀 팀 포켓몬의 레벨이 올랐다!`, 4000);
        else if (e.item === '_egg_steps') toast(`새 장소 방문! 부화기 알이 ${e.qty}걸음 자랐다!`, 4000);
        else if (e.item?.startsWith('_egg_')) toast(`${josa(TIER[e.item.slice(5)] || '알', '을', '를')} 받았다! (${WHY[e.why] || (e.why === 'achievement' ? '도전과제' : '')}) 가방 → 알`, 4500);
        else if (itemOf(e.item)) toast(`${josa(itemOf(e.item).name, '을', '를')} 주웠다! (${WHY[e.why] || ''})`, 4000);
      }
    }
    try { localStorage.setItem('bagSeen', String(r.last || 0)); } catch { /* */ }
    return r;
  })().finally(() => { loading = null; });
  return loading;
}

const POCKETS = [['box', '포켓몬'], ['egg', '알'], ['tool', '도구'], ['med', '회복약'], ['tm', '기술머신'], ['key', '티켓']];

let last = { pocket: 'box', sel: null };
const backToBag = () => openBagScreen(last.pocket, last.sel);

export async function openBagScreen(pocket = 'box', selected = null) {
  sfx.select();
  if (!S.online) return toast('가방은 인터넷이 필요해요. 와이파이나 데이터를 켜 주세요.');
  try { await Promise.all([loadBag(), loadEggs().catch(() => null)]); } catch (e) { return toast(errorText(e.message)); }
  let cur = pocket; let sel = selected;
  const tabs = h('div.bag-tabs', { role: 'tablist' });
  const list = h('div.bag-list');
  const panel = h('div.bag-panel');
  const draw = () => {
    last = { pocket: cur, sel };
    if (cur !== 'box') moving = null;
    tabs.replaceChildren(...POCKETS.map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(k === cur), onclick: () => { sfx.blip(); cur = k; sel = null; draw(); } }, t)));
    list.replaceChildren(...pocketList(cur, sel, (k) => { sfx.blip(); sel = k; draw(); }, draw).filter(Boolean));
    panel.replaceChildren(...pocketPanel(cur, sel, draw).filter(Boolean));
    panel.hidden = cur === 'box' || cur === 'key' || cur === 'egg' || !sel;
  };
  const ov = overlay(h('div.bag-screen',
    h('div.bag-head', h('b', pix('bag'), ' 가방'), h('span.bag-head-btns', h('button.btn.small', { onclick: () => tradeMenu() }, '교환'), h('button.btn.small', { onclick: () => closeOverlay() }, '닫기'))),
    tabs, list, panel), 'full');
  ov.classList.add('bag-overlay');
  ov.redraw = draw;
  draw();
}

function pocketList(cur, sel, pick, redraw) {
  if (cur === 'egg') return eggPocket(redraw);
  if (cur === 'box') return pcView(redraw);
  if (cur === 'key') {
    const p = S.snap?.profile || {};
    const charm = (S.bag?.items || []).some((x) => x.key === 'shiny_charm' && x.qty > 0);   // 0042: 빛나는 부적 (쓰기 · 지니기 없음)
    return [h('div.stack',
      charm ? h('div.bag-item.charm-row', h('span.key-ico', { html: CHARM_SVG }),
        h('span', h('b', '빛나는 부적'), h('br'), h('small', '도감을 모두 채운 증거. 반짝이는 포켓몬을 더 잘 만나요'))) : null,
      h('div.bag-item', h('span.key-ico', itemIcon('evo', 32)), h('span', h('b', '진화의 돌'), h('br'), h('small', '진화 레벨 전에 진화시킬 때 써요')), h('b.qty', `×${p.evo_tickets ?? 0}`)),
      h('div.bag-item', h('span.key-ico', pix('ticket', 'l')), h('span', h('b', '부스 티켓'), h('br'), h('small', '부스에서 포켓몬으로 바꿔요')), h('b.qty', `×${(S.snap?.tickets || []).filter((t) => t.status === 'pending').length}`)),
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
    return h(`button.bag-item${sel === x.key ? '.on' : ''}`, { onclick: () => pick(x.key) },
      itemIcon(x.key),
      mv ? h('span.tm-line', h('b', h('small.tm-no', x.it.name.replace('특별 기술머신', '특별 No.').replace('영구 기술머신', '영구 No.').replace('기술머신', 'No.')), ` ${mv.name}`),
        h('small', h(`span.type.t-${mv.type}`, mv.type), ...[`위력 ${mv.power || '—'}`, `명중 ${mv.accuracy ?? '—'}`, `PP ${mv.pp}`].map((t, i) => h('span.nw', `${i ? ' · ' : ''}${t}`))))
        : h('span', h('b', x.it.name), h('br'), h('small', { hold: '지니게 하는 물건', tool: '쓰는 물건', med: '배틀 중에 사용' }[x.it.pocket])),
      h('b.qty', `×${x.qty}`));
  });
}

// ── PC 박스 (3세대 에메랄드): ◀ BOX n ▶ + 풀숲 벽지 6 × 5 ──
function pcView(redraw) {
  const box = S.bag?.box || [];
  if (!box.length) return [h('p.muted', '아직 포켓몬이 없어요. QR을 찍어 모아요!')];
  const max = S.bag?.box_max || 900;
  const at = new Map(box.map((m) => [m.pos, m]));
  const inBox = box.filter((m) => Math.floor(m.pos / PER) === pcBox).length;
  const go = (d) => { sfx.blip(); pcBox = (pcBox + d + BOXES) % BOXES; redraw(); };
  const mv = moving != null ? boxOf(moving) : null;
  if (moving != null && !mv) moving = null;
  const team = new Set(S.bag?.saved_team || []);
  const slots = Array.from({ length: PER }, (_, i) => {
    const pos = pcBox * PER + i; const m = at.get(pos);
    const sp = m && spOf(m);
    return h(`button.pc-slot${m ? '' : '.empty'}${m && m.id === moving ? '.moving' : ''}`, {
      type: 'button',
      'aria-label': m ? `${sp?.name || '포켓몬'} Lv.${m.level}` : `빈 칸 ${i + 1}`,
      disabled: !m && moving == null,
      onclick: () => (moving != null ? moveTo(pos, redraw) : m && openMon(m.id)),
    },
    m && sp ? monSprite(sp.id, 40, m) : null,
    m?.held ? h('span.pc-held', itemIcon(m.held, 12)) : null,
    m && (S.bag?.partner === m.id || team.has(m.id)) ? h('span.pc-mark', S.bag?.partner === m.id ? '카드' : '팀') : null);
  });
  return [h('div.pc',
    h('div.pc-head',
      h('button.pc-arrow', { type: 'button', 'aria-label': '이전 박스', onclick: () => go(-1) }, '◀'),
      h('div.pc-name', h('b', `BOX ${pcBox + 1}`), h('small', `${pcBox * PER + 1}~${pcBox * PER + PER} · ${inBox}/${PER}마리`)),
      h('button.pc-arrow', { type: 'button', 'aria-label': '다음 박스', onclick: () => go(1) }, '▶')),
    mv ? h('div.pc-moving', h('span', `${josa(spOf(mv)?.name || '포켓몬', '을', '를')} 옮길 칸을 누르세요`),
      h('button.btn.small', { onclick: () => { sfx.blip(); moving = null; redraw(); } }, '취소')) : null,
    h('div.pc-grid', slots),
    h('div.pc-foot', h('span', `포켓몬 ${box.length} / ${max}마리`),
      h('small.muted', moving != null ? '다른 박스로 옮기려면 ◀ ▶ 로 박스를 바꿔요. 포켓몬이 있는 칸이면 서로 바꿔요.' : '포켓몬을 누르면 요약 · 진화 · 옮기기 · 놓아주기')))];
}

async function moveTo(pos, redraw) {
  const id = moving; moving = null;
  const m = boxOf(id);
  if (!m || m.pos === pos) { redraw(); return; }
  try {
    await rpc('box_move', { p_mon: id, p_pos: pos }, { retries: 0 });
    sfx.select(); toast(`${josa(spOf(m)?.name || '포켓몬', '을', '를')} ${boxLabel(pos)}에 옮겼다.`);
    await loadBag({ notify: false }); sync({ force: true });
  } catch (e) { toast(errorText(e.message)); }
  redraw();
}

function pocketPanel(cur, sel, redraw) {
  const it = itemOf(sel);
  if (!it) return [];
  const desc = h('p.bag-desc', it.description);
  if (it.pocket === 'med') return [h('div.bag-pi', itemIcon(it.key, 48), desc), h('small.muted', '배틀 중에 "가방"을 눌러 써요. 한 배틀에 2개까지 (공정 모드에서는 못 써요).')];
  if (it.pocket === 'hold') {
    return [h('div.bag-pi', itemIcon(it.key, 48), desc),
      h('button.btn.big.primary', { onclick: () => pickMon(`${josa(it.name, '을', '를')} 누구에게 줄까?`, () => '', async (m) => {
        try { await rpc('bag_set_held', { p_mon: m.id, p_item: it.key }, { retries: 0 }); sfx.select(); toast(`${josa(it.name, '을', '를')} 지니게 했다!`); }
        catch (e) { toast(errorText(e.message)); }
        backToBag();
      }) }, '포켓몬에게 지니게 하기')];
  }
  if (it.pocket === 'tool') {
    return [h('div.bag-pi', itemIcon(it.key, 48), desc),
      h('button.btn.big.primary', { onclick: () => pickMon(`${josa(it.name, '을', '를')} 누구에게 쓸까?`, (m) => (m.level >= 100 ? 'Lv.100' : ''), async (m) => {
        try {
          const r = await rpc('bag_use', { p_item: it.key, p_mon: m.id }, { retries: 0 });
          sfx.catch(); toast(`${spOf(m).name}의 레벨이 ${josa(r.level, '으로', '로')} 올랐다!`, 3500);
        } catch (e) { toast(errorText(e.message)); }
        backToBag();
      }) }, '사용')];
  }
  // 기술머신: 포켓몬마다 가능 / 불가 / 배움
  const mv = moveOf(it.move_id) || {};
  const strip = h('div.box-grid.small');
  learnset().then((L) => {
    const can = new Set(L.filter((x) => x.how === 'tm' && x.move_id === it.move_id).map((x) => x.line_id));
    strip.replaceChildren(...(S.bag?.box || []).map((m) => {
      const known = m.known.includes(it.move_id);
      const tag = known ? '배움' : can.has(m.line) ? '가능' : '불가';
      const sp = spOf(m);
      return h(`button.box-cell.tm-${tag === '가능' ? 'ok' : tag === '배움' ? 'known' : 'no'}`, {
        disabled: tag !== '가능',
        onclick: () => sheet(h('div.stack',
          h('b', `${josa(sp.name, '에게', '에게')} ${josa(mv.name, '을', '를')} 가르칠까?`),
          h('small', `Lv.${m.level} · ${boxLabel(m.pos)}`),
          h('small', it.effect?.permanent ? '영구 기술머신은 써도 없어지지 않아요. 다른 포켓몬에게도 또 가르칠 수 있어요.'
            : '기술머신은 한 번 쓰면 없어져요. 배운 기술은 포켓몬의 기술 목록에 계속 남아서 언제든 바꿔 쓸 수 있어요.'),
          h('button.btn.big.primary', { onclick: async () => {
            try {
              await rpc('bag_use', { p_item: it.key, p_mon: m.id }, { retries: 0 });
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
  h('small.muted', '가능한 포켓몬을 눌러 가르쳐요.'), strip];
}

// 포켓몬 고르기 시트. tag(m) 이 글자를 돌려주면 그 포켓몬은 못 고름. done(m) = 박스의 그 한 마리
function pickMon(title, tag, done) {
  sfx.blip();
  sheet(h('div.stack', h('b', title),
    h('div.box-grid', (S.bag?.box || []).map((m) => {
      const t = tag(m); const sp = spOf(m);
      return h('button.box-cell', { disabled: !!t, onclick: () => done(m) }, monSprite(sp.id, 40, m), h('small', t || `Lv.${m.level}`),
        m.held ? h('span.box-held', itemIcon(m.held, 16)) : null);
    })),
    h('button.btn', { onclick: backToBag }, '취소')));
}

// ── 포켓몬 요약: 상태 / 능력치 / 기술 / 도감 + 카드 · 진화 · 옮기기 · 놓아주기 ──
// id = 박스의 포켓몬 번호 (0036). 가방 목록을 아직 안 받았으면 먼저 받음
export async function openMon(id, page = 0) {
  if (!boxOf(id)) { try { await loadBag({ notify: false }); } catch (e) { toast(errorText(e.message)); return; } }
  const m = boxOf(id);
  if (!m) { toast('박스에 없는 포켓몬이에요.'); return; }
  const sp = spOf(m); const type = typeOf(sp);
  const PAGES = ['상태', '능력치', '기술', '도감'];
  const body = h('div.sum-body');
  const tabs = h('div.sum-tabs', PAGES.map((t, i) => h('button', { type: 'button', 'aria-pressed': String(i === page), onclick: () => show(i) }, t)));
  const show = (i) => {
    if (i === 3) { closeOverlay(); openDetail(sp); return; }
    page = i;
    tabs.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-pressed', String(k === page)));
    sfx.blip();
    // replaceChildren 은 null 을 글자 "null" 로 그림 → 빈 칸(지닌 물건 없음 등)은 빼고 넣음
    body.replaceChildren(...[monState, monStats, monMoves][page](boxOf(id), sp, () => openMon(id, page)).filter(Boolean));
  };
  const isPartner = S.bag?.partner === id;
  const canEvo = evoOpts(m).length > 0;   // 0037: 진화 길이 있는 종만 (갈래 종 포함)
  const ov = sheet([
    h('div.summary',
      h('div.sum-top', h('span', sp.name), h('span.types', typeChips(type)), h('span.sum-lv', `Lv.${m.level}`)),
      h('div.sum-main', h(`div.sum-pic.t-bg-${type.split('/')[0]}`, monSprite(sp.id, 112, m),
        m.from_egg && h('span.egg-born', { title: '알에서 태어남' }, '알에서 태어남')), h('div.sum-right', tabs, body))),
    h('div.sum-acts',
      h('button.btn', { disabled: isPartner, onclick: () => setPartner(m) }, isPartner ? '카드 포켓몬' : '카드에 올리기'),
      canEvo ? h('button.btn.gold', { onclick: () => evoSheet({ ...m, line_id: m.line }) }, '진화') : null,
      h('button.btn', { onclick: () => import('./share.js').then((s) => s.openPhoto(m, () => openMon(id, page))).catch(() => toast('인터넷이 연결되면 다시 해 주세요.')) }, '사진 만들기'),
      h('button.btn', { onclick: () => { sfx.blip(); moving = id; pcBox = Math.floor(m.pos / PER); last = { pocket: 'box', sel: null }; backToBag(); } }, '옮기기'),
      h('button.btn.danger', { onclick: () => releaseMon(m) }, '놓아주기')),
    h('button.btn', { onclick: backToBag }, '박스로'),
  ]);
  ov.classList.add('sum-overlay', 'mon-view');
  show(page);
}

async function setPartner(m) {
  try {
    const prof = await rpc('set_partner', { p_mon: m.id }, { retries: 0 });
    if (S.snap) S.snap.profile = { ...S.snap.profile, ...prof };
    if (S.bag) S.bag.partner = m.id;
    sfx.select(); toast(`${josa(spOf(m).name, '을', '를')} 트레이너 카드에 올렸다!`);
    sync({ force: true });
    openMon(m.id);
  } catch (e) { toast(errorText(e.message)); }
}

// 놓아주기: 확인 → 서버 (마지막 1마리 · 카드 · 저장한 배틀 팀 · 배틀/레이드 중인 포켓몬은 안 됨)
function releaseMon(m) {
  sfx.blip();
  const sp = spOf(m); const held = m.held && itemOf(m.held);
  const why = (S.bag?.box || []).length <= 1 ? '마지막 한 마리는 놓아줄 수 없어요.'
    : S.bag?.partner === m.id ? '트레이너 카드 포켓몬이에요. 카드를 다른 포켓몬으로 바꾼 뒤에 놓아줄 수 있어요.'
      : (S.bag?.saved_team || []).includes(m.id) ? '배틀 팀에 있는 포켓몬이에요. 배틀 탭 → 팀 바꾸기에서 빼고 놓아줄 수 있어요.' : null;
  if (why) { toast(why, 3500); return; }
  sheet(h('div.stack',
    h('b', `정말 ${josa(sp.name, '을', '를')} 놓아줄까요?`),
    h('div.release-mon', monSprite(sp.id, 64, m), h('span', h('b', sp.name), h('br'), h('small', `Lv.${m.level} · ${boxLabel(m.pos)}`))),
    h('small', '놓아준 포켓몬은 다시 돌아오지 않아요.'),
    h('small', held ? `지니고 있던 ${josa(held.name, '은', '는')} 가방으로 돌아와요.` : '지닌 물건은 없어요.'),
    h('small.muted', '도감 기록 (잡은 적 있음) · 점수는 그대로 남아요.'),
    h('button.btn.big.danger', { onclick: async () => {
      try {
        await rpc('mon_release', { p_mon: m.id }, { retries: 0 });
        sfx.select(); toast(`${josa(sp.name, '을', '를')} 놓아주었다. 잘 가, ${sp.name}!`, 3500);
        await loadBag({ notify: false }); sync({ force: true });
      } catch (e) { toast(errorText(e.message), 3500); }
      backToBag();
    } }, '놓아주기'),
    h('button.btn', { onclick: () => openMon(m.id) }, '그만두기')));
}

function monState(m, sp, reopen) {
  const src = S.bag?.sources || {};
  const held = m.held && itemOf(m.held);
  return [
    h('div.exp-row', h('span', 'EXP'), h('span.stat-bar.exp', h('i', { style: { width: `${m.need ? (m.exp / m.need) * 100 : 100}%` } })),
      h('small', m.level >= 100 ? 'MAX' : `${m.exp}/${m.need}`)),
    h('small.sum-where', boxLabel(m.pos)),
    m.ability ? h('div.sum-ab', h('small', '특성'), abilityBox([m.ability], null, m.ability)) : null,
    h('div.bag-item.slim', held ? itemIcon(m.held, 24) : h('i.item-ico.none'), h('span', h('small', '지닌 물건'), h('br'), h('b', held ? held.name : '없음')),
      held ? h('button.btn.small', { onclick: async () => {
        try { await rpc('bag_set_held', { p_mon: m.id, p_item: null }, { retries: 0 }); toast(`${josa(held.name, '을', '를')} 가방에 넣었다.`); await loadBag({ notify: false }); reopen(); }
        catch (e) { toast(errorText(e.message)); }
      } }, '빼기') : h('button.btn.small', { onclick: () => holdPicker(m, reopen) }, '주기')),
    held && h('small.muted', held.description),
    shinyRow(m, reopen),
    h('b', '레벨 올리는 법'),
    h('ul.lv-src',
      src.battle !== false && h('li', '배틀 (이기면 더 많이, 실시간 배틀은 1.5배)'),
      src.raid !== false && h('li', '레이드에 참가해서 이 포켓몬으로 탭하기'),
      src.places !== false && h('li', `오늘 다른 장소 QR ${src.places_n || 3}곳마다 → 배틀 팀 모두 +1`),
      h('li', '이상한사탕 +1 (가방 → 도구)')),
  ];
}

// 요약 → 지닌 물건 주기: 가방의 지니는 물건 중에서
function holdPicker(m, reopen) {
  const rows = (S.bag?.items || []).map((x) => ({ ...x, it: itemOf(x.key) })).filter((x) => x.it?.pocket === 'hold').sort((a, b) => a.it.sort - b.it.sort);
  if (!rows.length) { toast('지니게 할 물건이 없어요. 장소 QR · 배틀에서 가끔 주워요.', 3000); return; }
  sfx.blip();
  sheet(h('div.stack', h('b', `${josa(spOf(m).name, '에게', '에게')} 무엇을 지니게 할까?`),
    h('div.stack', rows.map((x) => h('button.bag-item', { onclick: async () => {
      try { await rpc('bag_set_held', { p_mon: m.id, p_item: x.key }, { retries: 0 }); sfx.select(); toast(`${josa(x.it.name, '을', '를')} 지니게 했다!`); await loadBag({ notify: false }); }
      catch (e) { toast(errorText(e.message)); }
      reopen();
    } }, itemIcon(x.key), h('span', h('b', x.it.name), h('br'), h('small', x.it.description)), h('b.qty', `×${x.qty}`)))),
    h('button.btn', { onclick: reopen }, '그만두기')));
}

// 반짝 색 (반짝이는 색으로 만난 포켓몬 — 알 · 야생 · 사파리 · QR · 레이드 · 전설 모두, 0042): 켜고 끄기
function shinyRow(m, reopen) {
  if (!m?.shiny) return null;
  return h('div.bag-item.slim.shiny-row', h('i.shiny-ico', pix('spark')), h('span', h('small', '반짝이는 색'), h('br'), h('b', m.shiny_on ? '켜짐' : '꺼짐')),
    h('button.btn.small', { onclick: async () => {
      try {
        await rpc('set_shiny', { p_mon: m.id, p_on: !m.shiny_on }, { retries: 0 });
        m.shiny_on = !m.shiny_on;
        const sm = mons().find((x) => x.id === m.id); if (sm) sm.shiny_on = m.shiny_on;
        sfx.blip(); reopen();
      } catch (e) { toast(errorText(e.message)); }
    } }, m.shiny_on ? '보통 색으로' : '반짝 색으로'));
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
  const learned = new Set(m.learned || []);
  const curRows = m.moves.map((id, i) => {
    const mv = moveOf(id) || { name: '?', type: '보통', kind: 'attack', pp: 0 };
    const row = moveRow(mv, null, () => {
      sfx.blip();
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
          await rpc('bag_set_moves', { p_mon: m.id, p_moves: next }, { retries: 0 });
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
    later.replaceChildren(...rows.map((x) => { const mv = moveOf(x.move_id); return mv ? moveRow(mv, h('span.kind', `Lv.${x.lv}`), () => { sfx.blip(); detail.replaceChildren(moveInfo(mv)); }) : null; }).filter(Boolean));
  }).catch(() => {});
  return [
    h('small.muted', '기술을 누르고 "잊고 다른 기술 배우기"로 바꿔요.'),
    h('div.move-list', curRows), detail,
    h('small.muted', others.length ? `지금 바꿀 수 있는 기술 ${others.length}개` : '아직 바꿀 수 있는 기술이 없어요.'),
    h('div', h('b', '레벨이 오르면 배우는 기술')), later,
  ];
}
