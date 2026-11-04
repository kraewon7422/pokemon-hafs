// 지도 · 도감 · 요약 화면 · 진화.
import { rpc, errorText } from './sb.js';
import { kv } from './db.js';
import { spriteCanvas, paint, monSprite } from './sprites.js';
import { sfx, unlockAudio } from './sfx.js';
import { h, $, josa, toast, typeText, sleep, reducedMotion, pix } from './ui.js';
import { S, bag, dexNo, dexOf, dexStats, isMythic, isSecret, isWild, isWithdrawn, lineOf, maxStage, owned, rules, speciesOf, vibrate } from './state.js';
import { closeOverlay, eggTap, loadCatalog, maybeDexComplete, overlay, renderTab, sheet, sync, tapToContinue } from './app.js';

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
        h('span.map-egg', { onclick: () => eggTap('map'), 'aria-hidden': 'true' }),   // 오른쪽 위 숲 모서리 (이스터에그)
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

// 도감 범위: 전체 / 학교 (선생님 포켓몬 · 특별 전설) / 야생 / 잡은 포켓몬
const SCOPES = [['all', '전체'], ['school', '학교'], ['wild', '야생'], ['mine', '잡은 포켓몬']];
export const TYPES = ['노말', '불꽃', '물', '풀', '전기', '얼음', '격투', '독', '땅', '비행', '에스퍼', '벌레', '바위', '고스트', '드래곤', '악', '강철', '페어리'];

export function viewDex() {
  const { species } = S.catalog;
  const reached = (sp) => (owned(sp.line_id)?.stage || 0) >= sp.stage;
  const D = dexStats();
  const scope = S.dexScope || 'all';
  const tf = TYPES.includes(S.dexFilter) ? S.dexFilter : 'all';
  const list = species.filter((sp) => (!isSecret(sp.line_id) || (scope === 'all' && tf === 'all') || owned(sp.line_id))
    && (!isMythic(sp.line_id) || owned(sp.line_id))                                   // 환상 = 잡기 전엔 도감에 없음
    && (scope === 'all' || (scope === 'school' ? !isWild(sp.line_id) : scope === 'wild' ? isWild(sp.line_id) : reached(sp)))
    && (tf === 'all' || typesOf(sp).includes(tf)));
  const p = S.snap.profile;
  const evoReady = S.snap.collection.filter((c) => canLevelEvolve(c)).length;
  return [
    h('div.box.dex-head',
      h('div.banner', h('b', '포켓몬 도감'), h('span', `학교 ${D.found} / ${D.total}`)),
      h('div.bar', h('i', { style: { width: `${(D.found / Math.max(1, D.total)) * 100}%` } })),
      h('div.banner', { style: { fontSize: '13px' } },
        h('span', `전국 도감 ${D.allFound} / ${D.allTotal}`),
        h('span', h('i.ticket-icon'), ` 진화의돌 × ${p.evo_tickets}`)),
      evoReady ? h('small.evo-ready', pix('spark'), ` 진화할 수 있는 포켓몬이 ${evoReady}마리 있어요!`) : null),
    h('div.filters', { role: 'toolbar', 'aria-label': '범위' },
      SCOPES.map(([k, t]) => h('button.chip', { 'aria-pressed': String(scope === k), onclick: () => { S.dexScope = k; renderTab(); } }, t))),
    h('div.filters.type-filters', { role: 'toolbar', 'aria-label': '타입' },
      ['all', ...TYPES].map((t) => h(`button.chip${t === 'all' ? '' : '.t-' + t}`, {
        'aria-pressed': String(tf === t),
        onclick: () => { S.dexFilter = t; renderTab(); },
      }, t === 'all' ? '모든 타입' : t))),
    list.length ? null : h('p.muted', { style: { textAlign: 'center' } }, '여기에 맞는 포켓몬이 없어요.'),
    h('div.dex-grid', list.map((sp) => {
      if (isWithdrawn(sp.line_id)) return h('div.dex-cell.unknown.withdrawn', h('span.no', dexNo(sp)), spriteCanvas(sp.id, 72, 'silhouette'), h('span.nm', '비공개'));
      const ok = reached(sp);
      const c = owned(sp.line_id);
      const canEvo = ok && c.stage === sp.stage && sp.stage < maxStage(sp.line_id) && (canLevelEvolve(c) || p.evo_tickets > 0);
      return h(`button.dex-cell${ok ? '.caught' : '.unknown'}`, {
        'aria-label': ok ? sp.name : '미발견',
        onclick: () => (ok ? openDetail(sp) : toast(isSecret(sp.line_id) ? '지도에 없는 곳에 숨어 있다는 소문이… 학교를 구석구석 찾아보세요!'
          : isWild(sp.line_id) ? '야생 포켓몬이에요. QR을 찍거나, 많이 걷거나, 알을 부화하면 만날 수 있어요!' : '아직 발견하지 못했어요. 학교 곳곳을 찾아보세요!')),
      },
      h('span.no', dexNo(sp)),
      spriteCanvas(sp.id, 72, ok ? 'normal' : 'silhouette'),
      h('span.nm', ok ? sp.name : '???'),
      canEvo && h('span.evo-dot', '진화'));
    })),
  ];
}

// 진화 레벨: 다음 단계 포켓몬의 evo_lv (그 레벨이 되면 진화의돌 없이 100% 진화)
export const evoLevel = (c) => speciesOf(dexOf(c.line_id, c.stage + 1))?.evo_lv || null;
export const canLevelEvolve = (c) => !!c && c.stage < maxStage(c.line_id) && !isWithdrawn(c.line_id) && !!evoLevel(c) && (c.level || 0) >= evoLevel(c);
// 돌 진화 (0034, 라이츄 · 픽시 · 샤미드 …): 레벨로는 진화 안 함, 진화의돌 1개로 100%
export const evoByItem = (c) => !!c && !!speciesOf(dexOf(c.line_id, c.stage + 1))?.evo_item;

export function evoChance(c) {
  const R = rules();
  if (c.evo_fails >= (R.evo_pity_max[c.stage] ?? 99)) return 1;
  return Math.min(1, (R.evo_prob[c.stage] ?? 0) + c.evo_fails * R.evo_pity_step);
}

const isLegendLine = (line) => lineOf(line)?.rarity === 'legendary';

// 진화: 진화 레벨이 되면 진화의돌 없이 100%, 그 전에는 진화의돌로 (확률)
function evoPanel(c, chance, p) {
  const need = evoLevel(c);
  const byLevel = canLevelEvolve(c);
  const byItem = evoByItem(c);
  const off = !S.online ? '진화는 인터넷이 필요해요' : !S.snap.festival_open ? '지금은 진화할 수 없어요' : null;
  if (byLevel) {
    return h('div.box.evo-panel',
      h('div.banner', h('span', `Lv.${c.level}`), h('b.prob', pix('spark'), `Lv.${need} 진화 레벨 도달!`)),
      h('button.btn.big.gold', { disabled: !!off, onclick: () => doEvolve(c) }, off || '진화시키기!'),
      h('small', '진화 레벨이 되어서 진화의돌 없이 반드시 진화해요.'));
  }
  if (byItem) {
    return h('div.box.evo-panel',
      h('div.banner', h('span', '진화의돌로 진화하는 포켓몬'), h('span', h('i.ticket-icon'), ` 진화의돌 × ${p.evo_tickets}`)),
      h('button.btn.big.gold', { disabled: !p.evo_tickets || !!off, onclick: () => doEvolve(c) },
        off || (!p.evo_tickets ? '진화의돌이 필요해요 (퀴즈·배틀·룰렛에서 가끔 받아요)' : '진화의돌로 진화 (100%)')),
      h('small', '이 포켓몬은 레벨로는 진화하지 않아요. 진화의돌 1개면 반드시 진화해요.'));
  }
  return h('div.box.evo-panel',
    h('div.banner', h('span', need ? `Lv.${c.level || 1} → Lv.${need}에 진화` : `Lv.${c.level || 1}`),
      h('span', h('i.ticket-icon'), ` 진화의돌 × ${p.evo_tickets}`)),
    h('button.btn.big.gold', { disabled: !p.evo_tickets || !!off, onclick: () => doEvolve(c) },
      off || (!p.evo_tickets ? '진화의돌이 없어요 (퀴즈·룰렛으로 받아요)' : `진화의돌로 진화 (성공 ${chance >= 1 ? '확정' : Math.round(chance * 100) + '%'})`)),
    h('small', need ? `레벨을 올리면(배틀·잡기·이상한사탕) Lv.${need}에 진화의돌 없이 진화해요. 진화의돌은 실패해도 다음 확률이 올라가요.`
      : '진화의돌은 실패해도 다음 확률이 올라가고, 몇 번 실패하면 반드시 성공해요.'));
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
    h(`div.habitat.t-${typesOf(sp)[0]}`, c ? monSprite(sp.id, 176, c) : spriteCanvas(sp.id, 176),
      // 잡은 포켓몬만: 가방(상태·레벨·기술)으로 바로 가기 — 가방의 '도감' 탭과 짝
      c && h('button.habitat-bag', { type: 'button', onclick: () => toBag(sp.line_id) }, h('span.hb-arrow', '◀'), pix('bag'), '가방')),
    h('div.box',
      h('div.banner', h('b', `${dexNo(sp)} ${sp.name}`), h('span.types', typeChips(sp))),
      h('div.kv',
        h('span', '분류'), h('span', sp.category),
        h('span', '키 / 몸무게'), h('span', `${sp.height} / ${sp.weight}`),
        isWild(sp.line_id) ? h('span', '만나는 곳') : h('span', '정체'),
        h('span', isWild(sp.line_id) ? '야생 (QR · 걷기 · 알 · 레이드)' : line.teacher),
        h('span', '잡은 횟수'), h('span', `${c?.catch_count || 0}번`))),
    h('div.box', flavor),
    stages.length > 1 && h('div.box', h('b', '진화'), h(`div.chain.n${stages.length}`, chain)),
    canEvolve && evoPanel(c, chance, p),
    top === 1 && h('div.box', isLegendLine(sp.line_id) ? '★ 전설의 포켓몬은 진화하지 않아요.' : '이 포켓몬은 진화하지 않아요.'),
    h('button.btn.primary', { onclick: () => { closeOverlay({ replacing: true }); openSummary(sp); } }, pix('book'), '능력치 · 기술 보기'),
    h('button.btn', { onclick: () => closeOverlay() }, '닫기'),
  ]);
  typeText(flavor, sp.flavor);
}

// 도감 → 가방의 그 포켓몬 (가방 목록을 아직 안 받았으면 먼저 받음)
async function toBag(line) {
  sfx.blip();
  try {
    const { loadBag, openMon } = await import('./bag.js');
    if (!(S.bag?.box || []).some((x) => x.line === line)) await loadBag({ notify: false });
    closeOverlay({ replacing: true });
    openMon(line);
  } catch (e) { toast(errorText(e.message)); }
}

// ───────── 요약 화면 (3세대 START → 요약 느낌): 정보 / 능력치 / 기술 ─────────
export const STAT_KEYS = [['hp', 'HP'], ['atk', '공격'], ['def', '방어'], ['spa', '특수공격'], ['spd', '특수방어'], ['spe', '스피드']];
export const CAT_LABEL = { physical: '물리', special: '특수', status: '변화' };
export const KIND_LABEL = { attack: '공격', status: '상태', defense: '방어' };
// 타입: 포켓몬(단계)마다 실제 타입 1~2개. typeOf = '불꽃/비행' 문자열, typesOf = ['불꽃', '비행']
export const typeOf = (sp) => sp?.btype || lineOf(sp?.line_id)?.btype || '노말';
export const typesOf = (sp) => typeOf(sp).split('/');
export const typeChips = (spOrType) => (typeof spOrType === 'string' ? spOrType.split('/') : typesOf(spOrType)).map((t) => h(`span.type.t-${t}`, t));
// 공격 타입 a → 방어 타입 d ('A/B' 면 곱) 배수
export const typeMult = (a, d) => {
  const chart = S.catalog.typeChart || [];
  return Math.max(...String(a).split('/').map((at) => String(d).split('/')
    .reduce((m, dt) => m * Number(chart.find((c) => c.atk === at && c.def === dt)?.mult ?? 1), 1)));
};
// Lv.50 실제 능력치 (개체값 31, 노력치 0, 성격 보정 없음)
export const lv50 = (key, base) => (key === 'hp' ? Math.floor((2 * base + 31) / 2) + 60 : Math.floor((2 * base + 31) / 2) + 5);
export const movesOf = (sp) => (S.catalog.speciesMoves || []).filter((x) => x.species_id === sp.id).sort((a, b) => a.slot - b.slot)
  .map((x) => (S.catalog.moves || []).find((m) => m.id === x.move_id)).filter(Boolean);
export function typeMatch(type) {
  const mine = String(type).split('/');
  return {
    strong: TYPES.filter((d) => mine.some((a) => typeMult(a, d) > 1)),          // 내 타입 기술이 효과가 굉장한 타입
    weak: TYPES.filter((a) => typeMult(a, type) > 1),                          // 나에게 효과가 굉장한 공격 타입 (두 타입의 곱)
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
    body.replaceChildren(...[sumInfo, sumStats, sumMoves][page](sp, type).filter(Boolean));
  };
  const ov = sheet([
    h('div.summary',
      h('div.sum-top', h('b', `${dexNo(sp)}`), h('span', sp.name), h('span.types', typeChips(type)), h('span.sum-lv', 'Lv.50')),
      h('div.sum-main',
        h(`div.sum-pic.t-bg-${type.split('/')[0]}`, spriteCanvas(sp.id, 112)),
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
      h('dt', '타입'), h('dd', typeChips(type)),
      h('dt', '분류'), h('dd', sp.category),
      h('dt', isWild(sp.line_id) ? '만나는 곳' : '정체'), h('dd', isWild(sp.line_id) ? '야생' : line?.teacher || '?'),
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
  if (res.by_level) toast('진화 레벨이 되어서 진화의돌을 쓰지 않았어요.', 2500);
  else if (res.by_item) toast('진화의돌을 써서 진화했어요.', 2500);
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
    await typeText(text, `축하합니다! ${josa(from.name, '은', '는')} ${josa(to.name, '으로', '로')} 진화했다!`);
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
