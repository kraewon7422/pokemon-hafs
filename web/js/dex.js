// 지도 · 도감 · 요약 화면 · 진화.
import { rpc, errorText } from './sb.js';
import { kv } from './db.js';
import { spriteCanvas, paint } from './sprites.js';
import { sfx, unlockAudio } from './sfx.js';
import { h, $, josa, toast, typeText, sleep, reducedMotion, pix } from './ui.js';
import { S, bag, dexNo, dexOf, dexStats, evolvable, isSecret, isWithdrawn, lineOf, maxStage, owned, rules, speciesOf, vibrate } from './state.js';
import { closeOverlay, loadCatalog, maybeDexComplete, overlay, renderTab, sheet, sync, tapToContinue } from './app.js';

// ───────────────────────── 지도 ─────────────────────────

export function viewMap() {
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
          h('small', inBag.has(q.id) ? [pix('ticket'), '티켓 주머니에 있음 - 부스에서 쓰면 다시 찍을 수 있어요'] : `오늘 ${n}/${capOf(q)}번 찍음`));
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
      h('span', h('i', { style: { background: 'var(--gold)' } }), '티켓 주머니에 있음'),
      h('span', h('i', { style: { background: 'var(--green)' } }), '오늘 찍음'),
      h('span', h('i', { style: { background: 'var(--gray)' } }), '오늘 끝')),
    info,
    h('p', { style: { fontSize: '13px', margin: 0 } }, '지도에 없는 숨은 장소도 있어요…'),
  ];
}

// map fills the screen width at ×1; zoom multiplies it (map.webp is 962x1635, sharp up to ~×3)
export function mapWidth(zoom = 1) {
  const avail = Math.min(536, (document.querySelector('main')?.clientWidth || window.innerWidth) - 24 - 8);
  return Math.floor(avail) * zoom + 8;   // + border
}
// building names drawn over the map (the picture itself has no text); x/y = fraction of the map
export const MAP_LABELS = [
  ['기숙사 A동', 0.09, 0.07], ['기숙사 B동', 0.25, 0.02], ['농구장', 0.30, 0.235], ['V홀', 0.47, 0.235],
  ['체육관', 0.68, 0.295], ['D홀', 0.70, 0.395], ['LUX홀', 0.46, 0.34], ['생태연못', 0.29, 0.375],
  ['P홀', 0.555, 0.455], ['월드플라자', 0.68, 0.535], ['C홀', 0.79, 0.455], ['야외극장', 0.90, 0.33],
  ['정문', 0.17, 0.515], ['야외공연장', 0.46, 0.68], ['운동장', 0.79, 0.85],
];
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

// ───────────────────────── 도감 (+ 진화) ─────────────────────────

export function viewDex() {
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

export function evoChance(c) {
  const R = rules();
  if (c.evo_fails >= (R.evo_pity_max[c.stage] ?? 99)) return 1;
  return Math.min(1, (R.evo_prob[c.stage] ?? 0) + c.evo_fails * R.evo_pity_step);
}

export function openDetail(sp) {
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
export const STAT_KEYS = [['hp', 'HP'], ['atk', '공격'], ['def', '방어'], ['spa', '특수공격'], ['spd', '특수방어'], ['spe', '스피드']];
export const CAT_LABEL = { physical: '물리', special: '특수', status: '변화' };
export const KIND_LABEL = { attack: '공격', status: '상태', defense: '방어' };
export const typeOf = (sp) => { const l = lineOf(sp.line_id); return l?.btype || (l?.subject === '비밀' ? '전설' : l?.subject); };
// Lv.50 실제 능력치 (개체값 31, 노력치 0, 성격 보정 없음)
export const lv50 = (key, base) => (key === 'hp' ? Math.floor((2 * base + 31) / 2) + 60 : Math.floor((2 * base + 31) / 2) + 5);
export const movesOf = (sp) => (S.catalog.speciesMoves || []).filter((x) => x.species_id === sp.id).sort((a, b) => a.slot - b.slot)
  .map((x) => (S.catalog.moves || []).find((m) => m.id === x.move_id)).filter(Boolean);
export function typeMatch(type) {
  const chart = S.catalog.typeChart || [];
  return {
    strong: chart.filter((c) => c.atk === type && Number(c.mult) > 1).map((c) => c.def),
    weak: chart.filter((c) => c.def === type && Number(c.mult) > 1).map((c) => c.atk),
  };
}
export function statNote(sp) {
  const v = STAT_KEYS.map(([k, n]) => [n, sp[k] || 0]);
  const hi = [...v].sort((a, b) => b[1] - a[1])[0];
  const lo = [...v].sort((a, b) => a[1] - b[1])[0];
  return `${josa(hi[0], '이', '가')} 높고 ${josa(lo[0], '이', '가')} 낮은 편`;
}

export function openSummary(sp, page = 0) {
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

export function sumInfo(sp, type) {
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

export function sumStats(sp) {
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

export function sumMoves(sp) {
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

export async function doEvolve(c) {
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

export async function evolutionScene(fromDex, toDex, success, col) {
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
