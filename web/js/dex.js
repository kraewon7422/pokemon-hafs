// 지도 · 도감 · 요약 화면 · 진화.
import { rpc, errorText } from './sb.js';
import { kv } from './db.js';
import { spriteCanvas, paint, monSprite } from './sprites.js';
import { sfx, unlockAudio } from './sfx.js';
import { h, $, josa, toast, typeText, sleep, reducedMotion, pix } from './ui.js';
import { S, abilityOf, bag, dexKey, dexNo, dexStats, evosFrom, isEvent, isMythic, isSecret, isWild, isWithdrawn, lineOf, maxStage, mons, monSp, owned, rules, seenKeys, speciesOf, spIdOf, spPath, vibrate } from './state.js';
import { closeOverlay, eggTap, loadCatalog, maybeDexComplete, overlay, renderTab, sheet, sync, tapToContinue } from './app.js';
import { rumourBox } from './legends.js';

// ───────────────────────── 지도 ─────────────────────────

// 지도 탭 맨 위: QR 지도 | 사파리존 (사파리존 = safari.js, 처음 열 때만 불러옴)
let safariMod = null;
export function viewMap() {
  const mode = S.mapMode === 'safari' ? 'safari' : 'qr';
  const setMode = (m) => { if (m === mode) return; sfx.blip(); S.mapMode = m; renderTab(); };
  const bar = h('div.seg.map-modes', { role: 'group', 'aria-label': '지도 종류' },
    h('button', { 'aria-pressed': String(mode === 'qr'), onclick: () => setMode('qr') }, 'QR 지도'),
    h('button', { 'aria-pressed': String(mode === 'safari'), onclick: () => setMode('safari') }, '사파리존'));
  if (mode === 'qr') return [bar, ...viewQrMap()];
  if (safariMod) return [bar, safariMod.viewSafari()];
  import('./safari.js').then((m) => { safariMod = m; if (S.tab === 'map' && S.mapMode === 'safari') renderTab(); })
    .catch(() => toast('사파리존을 불러오지 못했어요. 인터넷을 확인해 주세요.', { kind: 'error' }));
  return [bar, h('div.box', '사파리존을 불러오는 중…')];
}

function viewQrMap() {
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
    rumourBox(),                     // 0038: 방랑 전설 소문 (구역만)
    h(`div.map-scroll${zoom > 1 ? '.zoomed' : ''}`,
      h('div.map-wrap', { style: { width: `${mapWidth(zoom)}px` } }, h('img', { src: 'img/map.webp', alt: '학교 지도', draggable: 'false' }),
        h('span.map-egg', { onclick: () => eggTap('map'), 'aria-hidden': 'true' }),   // 오른쪽 위 숲 모서리 (이스터에그)
        MAP_LABELS.map(([t, x, y]) => h(`span.map-label${x < 0.15 ? '.edge-l' : x > 0.85 ? '.edge-r' : ''}`, { style: { left: `${x * 100}%`, top: `${y * 100}%` }, 'aria-hidden': 'true' }, t)), pins)),
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

// 도감 쪽 (0037): 전국도감 번호 순으로 한 쪽에 60칸 + 지방으로 바로 가기. 범위 · 타입을 바꾸면 첫 쪽부터
export const DEX_PER_PAGE = 60;
export const REGIONS = [['관동', 1], ['성도', 152], ['호연', 252], ['신오', 387], ['하나', 494], ['칼로스', 650], ['알로라', 722], ['이벤트', 810]];   // 이벤트 = 0044 소포 포켓몬
export const EVENT_NOTE = '이상한 소포로만 받을 수 있어요.';
const regionOf = (d) => REGIONS.reduce((r, x) => (d >= x[1] ? x : r), REGIONS[0])[0];
// 같은 전국도감 번호의 종이 여럿이면 (갈래 종 · 따로 있는 야생 계열) 한 칸: 내가 가진 종 → 진화 갈래 쪽 (계열 안의 종) → 첫 종
const monsOfKey = (k) => mons().filter((m) => dexKey(monSp(m)) === k);
function pickRep(group) {
  const mine = new Set(mons().map(spIdOf));
  return group.find((sp) => mine.has(sp.id)) || group.find((sp) => sp.id >= 10000) || group[0];
}

export function viewDex() {
  const { species } = S.catalog;
  const seen = seenKeys();
  const reached = (sp) => seen.has(dexKey(sp));
  const D = dexStats();
  const scope = S.dexScope || 'all';
  const tf = TYPES.includes(S.dexFilter) ? S.dexFilter : 'all';
  const ok = (sp) => (!isSecret(sp.line_id) || (scope === 'all' && tf === 'all') || owned(sp.line_id))
    && (!isMythic(sp.line_id) || owned(sp.line_id))                                   // 환상 = 잡기 전엔 도감에 없음
    && (scope === 'all' || (scope === 'school' ? !isWild(sp.line_id) : scope === 'wild' ? isWild(sp.line_id) : reached(sp)))
    && (tf === 'all' || typesOf(sp).includes(tf));
  const groups = new Map();      // 전국도감 번호 → 종들 (species 는 이미 번호 순)
  for (const sp of species) if (ok(sp)) { const k = dexKey(sp); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(sp); }
  const list = [...groups.values()].map(pickRep);
  const pages = Math.max(1, Math.ceil(list.length / DEX_PER_PAGE));
  const fkey = `${scope}|${tf}`;
  if (S.dexPageKey !== fkey) { S.dexPageKey = fkey; S.dexPage = 0; }
  const page = Math.min(Math.max(0, S.dexPage || 0), pages - 1);
  const shown = list.slice(page * DEX_PER_PAGE, (page + 1) * DEX_PER_PAGE);
  const go = (pg, toTop) => {
    S.dexPage = Math.min(Math.max(0, pg), pages - 1); sfx.blip(); renderTab();
    if (toTop) requestAnimationFrame(() => document.querySelector('.dex-pager')?.scrollIntoView({ block: 'start' }));
  };
  const pager = (bottom) => pages > 1 && h('div.dex-pager', { role: 'navigation', 'aria-label': '도감 쪽 넘기기' },
    h('button.btn.small', { type: 'button', disabled: page === 0, onclick: () => go(page - 1, bottom), 'aria-label': '이전 쪽' }, '◀'),
    h('span.dp-mid', h('b', `${page + 1} / ${pages}`), shown.length ? h('small', `${dexNo(shown[0])} ~ ${dexNo(shown[shown.length - 1])}`) : null),
    h('button.btn.small', { type: 'button', disabled: page >= pages - 1, onclick: () => go(page + 1, bottom), 'aria-label': '다음 쪽' }, '▶'));
  // 누른 지방이 이 쪽에 있으면 그것, 아니면 이 쪽 첫 칸의 지방
  const here = new Set(shown.map((sp) => regionOf(sp.dex || 1)));
  const cur = here.has(S.dexRegion) ? S.dexRegion : shown.length ? regionOf(shown[0].dex || 1) : null;
  const regions = pages > 1 && h('div.filters.dex-regions', { role: 'toolbar', 'aria-label': '지방으로 가기' },
    REGIONS.map(([n, from], i) => {
      const to = REGIONS[i + 1]?.[1] ?? 99999;
      const at = list.findIndex((sp) => (sp.dex || 99999) >= from && (sp.dex || 99999) < to);
      return h('button.chip', { type: 'button', disabled: at < 0, 'aria-pressed': String(cur === n), onclick: () => { S.dexRegion = n; go(Math.floor(at / DEX_PER_PAGE)); } }, n);
    }));
  const p = S.snap.profile;
  const evoReady = mons().filter((c) => canLevelEvolve(c)).length;
  return [
    h('div.box.dex-head',
      h('div.banner', h('b', '포켓몬 도감'), h('span', `학교 ${D.found} / ${D.total}`)),
      h('div.bar', h('i', { style: { width: `${(D.found / Math.max(1, D.total)) * 100}%` } })),
      h('div.banner', { style: { fontSize: '13px' } },
        h('span', `전국 도감 ${D.allFound} / ${D.allTotal}`),
        h('span', h('i.ticket-icon'), ` 진화의 돌 × ${p.evo_tickets}`)),
      evoReady ? h('small.evo-ready', pix('spark'), ` 진화할 수 있는 포켓몬이 ${evoReady}마리 있어요!`) : null),
    h('div.filters', { role: 'toolbar', 'aria-label': '범위' },
      SCOPES.map(([k, t]) => h('button.chip', { 'aria-pressed': String(scope === k), onclick: () => { S.dexScope = k; renderTab(); } }, t))),
    h('div.filters.type-filters', { role: 'toolbar', 'aria-label': '타입' },
      ['all', ...TYPES].map((t) => h(`button.chip${t === 'all' ? '' : '.t-' + t}`, {
        'aria-pressed': String(tf === t),
        onclick: () => { S.dexFilter = t; renderTab(); },
      }, t === 'all' ? '모든 타입' : t))),
    regions,
    pager(false),
    list.length ? null : h('p.muted', { style: { textAlign: 'center' } }, '여기에 맞는 포켓몬이 없어요.'),
    h('div.dex-grid', shown.map((sp) => {
      if (isWithdrawn(sp.line_id)) return h('div.dex-cell.unknown.withdrawn', h('span.no', dexNo(sp)), spriteCanvas(sp.id, 72, 'silhouette'), h('span.nm', '비공개'));
      const got = reached(sp);
      // 0036: 같은 종을 여러 마리 가질 수 있음 → 그중 한 마리라도 진화할 수 있으면 '진화'
      const canEvo = got && monsOfKey(dexKey(sp)).some((m) => evoOpts(m).length > 0 && (canLevelEvolve(m) || p.evo_tickets > 0));
      return h(`button.dex-cell${got ? '.caught' : '.unknown'}`, {
        'aria-label': got ? sp.name : '미발견',
        onclick: () => (got ? openDetail(sp) : toast(isSecret(sp.line_id) ? '지도에 없는 곳에 숨어 있다는 소문이… 학교를 구석구석 찾아보세요!'
          : isEvent(sp.line_id) ? EVENT_NOTE + ' 축제 중에 알려 주는 소포 코드를 기다려 주세요!'
          : isWild(sp.line_id) ? '야생 포켓몬이에요. QR을 찍거나, 많이 걷거나, 알을 부화하면 만날 수 있어요!' : '아직 발견하지 못했어요. 학교 곳곳을 찾아보세요!')),
      },
      h('span.no', dexNo(sp)),
      spriteCanvas(sp.id, 72, got ? 'normal' : 'silhouette'),
      h('span.nm', got ? sp.name : '???'),
      canEvo && h('span.evo-dot', '진화'));
    })),
    shown.some((sp) => isEvent(sp.line_id)) && h('p.dex-event-note', pix('gift'), ` 이벤트 포켓몬 (${dexNo(shown.find((sp) => isEvent(sp.line_id)))}~): ${EVENT_NOTE}`),
    pager(true),
  ];
}

// 진화 (0037 갈래): 그 포켓몬의 종에서 갈 수 있는 길 (public.evolutions). how 'level' = lv 가 되면 진화의 돌 없이 100%, 'item' = 진화의 돌 1개로 100%
export const evoOpts = (c) => {
  if (!c) return [];
  const line = c.line_id ?? c.line;
  return c.stage < maxStage(line) && !isWithdrawn(line) ? evosFrom(spIdOf({ ...c, line_id: line })) : [];
};
export const evoLevel = (c) => { const lv = evoOpts(c).filter((e) => e.how === 'level' && e.lv).map((e) => e.lv); return lv.length ? Math.min(...lv) : null; };
export const canLevelEvolve = (c) => evoOpts(c).some((e) => e.how === 'level' && e.lv && (c.level || 0) >= e.lv);

export function evoChance(c) {
  const R = rules();
  if (c.evo_fails >= (R.evo_pity_max[c.stage] ?? 99)) return 1;
  return Math.min(1, (R.evo_prob[c.stage] ?? 0) + c.evo_fails * R.evo_pity_step);
}

const isLegendLine = (line) => lineOf(line)?.rarity === 'legendary';

// 진화 한 갈래의 조건: { sp, ok, cond (조건 글), reason (못 하는 이유), btn }
function evoInfo(c, e, p, chance) {
  const sp = speciesOf(e.to_species);
  const pct = chance >= 1 ? '확정' : `${Math.round(chance * 100)}%`;
  const stones = p.evo_tickets > 0;
  if (e.how === 'level' && e.lv && (c.level || 0) >= e.lv) return { sp, ok: true, cond: `Lv.${e.lv} 도달 · 돌 없이 100%`, btn: '진화시키기!' };
  if (e.how === 'item') return { sp, ok: stones, cond: '진화의 돌 1개 · 100%', reason: '진화의 돌이 필요해요', btn: '진화의 돌로 진화 (100%)' };
  return { sp, ok: stones, cond: e.lv ? `Lv.${e.lv}에 진화 · 지금은 진화의 돌로 ${pct}` : `진화의 돌로 ${pct}`,
           reason: e.lv ? `${josa(`Lv.${e.lv}`, '이', '가')} 되면 진화해요 (진화의 돌 없음)` : '진화의 돌이 필요해요', btn: `진화의 돌로 진화 (성공 ${pct})` };
}

// 진화: 진화 레벨이 되면 진화의 돌 없이 100%, 그 전에는 진화의 돌로 (확률). 갈래가 여럿이면 고르기 (evoChooser)
function evoPanel(c, chance, p) {
  const opts = evoOpts(c);
  const off = !S.online ? '진화는 인터넷이 필요해요' : !S.snap.festival_open ? '지금은 진화할 수 없어요' : null;
  if (opts.length > 1) return evoChooser(c, opts, chance, p, off);
  const e = opts[0];
  if (!e) return h('div.box.evo-panel', '이 포켓몬은 더 진화하지 않아요.');
  const x = evoInfo(c, e, p, chance);
  if (e.how === 'level' && e.lv && (c.level || 0) >= e.lv) {
    return h('div.box.evo-panel',
      h('div.banner', h('span', `Lv.${c.level}`), h('b.prob', pix('spark'), `Lv.${e.lv} 진화 레벨 도달!`)),
      h('button.btn.big.gold', { disabled: !!off, onclick: () => doEvolve(c, e.to_species) }, off || x.btn),
      h('small', '진화 레벨이 되어서 진화의 돌 없이 반드시 진화해요.'));
  }
  if (e.how === 'item') {
    return h('div.box.evo-panel',
      h('div.banner', h('span', '진화의 돌로 진화하는 포켓몬'), h('span', h('i.ticket-icon'), ` 진화의 돌 × ${p.evo_tickets}`)),
      h('button.btn.big.gold', { disabled: !p.evo_tickets || !!off, onclick: () => doEvolve(c, e.to_species) },
        off || (!p.evo_tickets ? '진화의 돌이 필요해요 (퀴즈·배틀·룰렛에서 가끔 받아요)' : x.btn)),
      h('small', '이 포켓몬은 레벨로는 진화하지 않아요. 진화의 돌 1개면 반드시 진화해요.'));
  }
  const need = e.lv;
  return h('div.box.evo-panel',
    h('div.banner', h('span', need ? `Lv.${c.level || 1} → Lv.${need}에 진화` : `Lv.${c.level || 1}`),
      h('span', h('i.ticket-icon'), ` 진화의 돌 × ${p.evo_tickets}`)),
    h('button.btn.big.gold', { disabled: !p.evo_tickets || !!off, onclick: () => doEvolve(c, e.to_species) },
      off || (!p.evo_tickets ? '진화의 돌이 없어요 (퀴즈·룰렛으로 받아요)' : x.btn)),
    h('small', need ? `레벨을 올리면(배틀·잡기·이상한사탕) Lv.${need}에 진화의 돌 없이 진화해요. 진화의 돌은 실패해도 다음 확률이 올라가요.`
      : '진화의 돌은 실패해도 다음 확률이 올라가고, 몇 번 실패하면 반드시 성공해요.'));
}

// 갈래 진화 고르기 (이브이 → 8가지 …): 그림 + 이름 + 조건. 지금 못 하는 갈래는 흐리게 + 이유
function evoChooser(c, opts, chance, p, off) {
  return h('div.box.evo-panel',
    h('div.banner', h('b', '어떤 모습으로 진화할까?'), h('span', h('i.ticket-icon'), ` 진화의 돌 × ${p.evo_tickets}`)),
    h('div.evo-choices', opts.map((e) => {
      const x = evoInfo(c, e, p, chance);
      const why = off || (!x.ok ? x.reason : null);
      return h('button.evo-choice', { type: 'button', disabled: !!why, 'aria-label': `${x.sp?.name || '?'}: ${why || x.cond}`,
        onclick: () => doEvolve(c, e.to_species) },
      spriteCanvas(e.to_species, 56), h('b', x.sp?.name || '?'), h('small', why || x.cond));
    })),
    h('small', `지금 Lv.${c.level || 1}. 돌 진화는 진화의 돌 1개로 반드시, 레벨 진화는 그 레벨이 되면 돌 없이 반드시 진화해요.`));
}

export function openDetail(sp) {
  sfx.select();
  const line = lineOf(sp.line_id);
  const c = owned(sp.line_id);
  const p = S.snap.profile;
  const seen = seenKeys();
  const flavor = h('p', { style: { margin: 0 } });
  // 진화 길 (0037 갈래): 1단계부터 단계마다 한 칸 (갈래면 여러 마리)
  const root = spPath(sp.id)[0] ?? sp.id;
  const levels = [[root]];
  while (levels.length < 3) {
    const nx = levels[levels.length - 1].flatMap((id) => evosFrom(id).map((e) => e.to_species));
    if (!nx.length) break;
    levels.push(nx);
  }
  const top = levels.length;
  const many = levels.some((l) => l.length > 3);
  const cellOf = (id) => {
    const s2 = speciesOf(id); const ok = !!s2 && seen.has(dexKey(s2));
    return h('div.chain-cell', { style: { cursor: ok ? 'pointer' : 'default' }, onclick: () => ok && id !== sp.id && openDetail(s2) },
      spriteCanvas(id, many ? 44 : 56, ok ? 'normal' : 'silhouette'), h('small', ok ? s2?.name : '???'));
  };
  const chain = levels.flatMap((ids, i) => {
    const col = ids.length > 1 ? h(`div.chain-col${ids.length > 3 ? '.many' : ''}`, ids.map(cellOf)) : cellOf(ids[0]);
    return i ? [h('span.arrow', '▶'), col] : [col];
  });
  // 0036: 이 종을 지금 몇 마리 가졌는지 + 한 마리씩 (누르면 박스의 그 포켓몬 요약 → 진화 · 놓아주기 …). 0037: 같은 전국도감 번호면 같은 칸
  const mine = monsOfKey(dexKey(sp)).sort((a, b) => b.level - a.level || a.pos - b.pos);
  sheet([
    h('div.grab'),
    h(`div.habitat.t-${typesOf(sp)[0]}`, c ? monSprite(sp.id, 176, c) : spriteCanvas(sp.id, 176),
      // 잡은 포켓몬만: 가방(상태·레벨·기술)으로 바로 가기 — 가방의 '도감' 탭과 짝
      mine.length > 0 && h('button.habitat-bag', { type: 'button', onclick: () => toBag(mine[0].id) }, h('span.hb-arrow', '◀'), pix('bag'), '박스')),
    h('div.box',
      h('div.banner', h('b', `${dexNo(sp)} ${sp.name}`), h('span.types', typeChips(sp))),
      h('div.kv',
        h('span', '분류'), h('span', sp.category),
        h('span', '키 / 몸무게'), h('span', `${sp.height} / ${sp.weight}`),
        isWild(sp.line_id) ? h('span', '만나는 곳') : h('span', '정체'),
        h('span', isEvent(sp.line_id) ? EVENT_NOTE : isWild(sp.line_id) ? '야생 (QR · 걷기 · 알 · 레이드)' : line.teacher),
        h('span', '잡은 횟수'), h('span', `${c?.catch_count || 0}번`),
        h('span', '가진 수'), h('span', `${mine.length}마리`))),
    mine.length > 0 && h('div.box.my-mons', h('b', `내 ${sp.name} ${mine.length}마리`),
      h('div.my-mon-list', mine.map((m) => {
        const evo = evoOpts(m).length > 0 && (canLevelEvolve(m) || p.evo_tickets > 0);
        return h('button.my-mon', { type: 'button', onclick: () => toBag(m.id) },
          monSprite(sp.id, 40, m),
          h('span.mm-txt', h('b', `Lv.${m.level}`), h('small', `BOX ${Math.floor(m.pos / 30) + 1} · ${(m.pos % 30) + 1}번`)),
          h('span.mm-tags', m.shiny ? h('span.mm-tag.shiny', '반짝') : null, m.held ? h('span.mm-tag', itemName(m.held)) : null,
            evo ? h('span.mm-tag.evo', '진화') : null));
      }))),
    h('div.box', flavor),
    sp.abilities?.length ? h('div.box', h('b', '특성'), abilityBox(sp.abilities, sp.hidden_ability)) : null,
    top > 1 && h('div.box', h('b', '진화'), h(`div.chain.n${top}`, chain)),
    top === 1 && h('div.box', isLegendLine(sp.line_id) ? '★ 전설의 포켓몬은 진화하지 않아요.' : '이 포켓몬은 진화하지 않아요.'),
    h('button.btn.primary', { onclick: () => { closeOverlay({ replacing: true }); openSummary(sp); } }, pix('book'), '능력치 · 기술 보기'),
    h('button.btn', { onclick: () => closeOverlay() }, '닫기'),
  ]);
  typeText(flavor, sp.flavor);
}

// 특성 (0039): 칩을 누르면 아래에 설명. keys = [보통 특성…], hidden = 숨겨진 특성 (없으면 null), mine = 이 포켓몬의 특성 (강조)
export function abilityBox(keys, hidden = null, mine = null) {
  const list = [...(keys || []).map((k) => [k, false]), ...(hidden ? [[hidden, true]] : [])].filter(([k]) => abilityOf(k));
  if (!list.length) return null;
  const desc = h('p.ab-desc');
  const btns = list.map(([k, hid]) => {
    const a = abilityOf(k);
    const b = h(`button.ab-chip${hid ? '.hid' : ''}${k === mine ? '.mine' : ''}`, { type: 'button', 'aria-pressed': 'false',
      onclick: () => { sfx.blip(); btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b))); desc.textContent = a.description || a.name; } },
    a.name, hid ? h('small', ' 숨겨진 특성') : null);
    return b;
  });
  const first = list.find(([k]) => k === mine) || list[0];
  desc.textContent = abilityOf(first[0]).description || '';
  btns[list.indexOf(first)].setAttribute('aria-pressed', 'true');
  return h('div.ab-box', h('div.ab-chips', btns), desc);
}

// 지닌 물건 이름 (가방 모듈을 부르지 않고 카탈로그에서)
const itemName = (key) => (S.catalog.items || []).find((x) => x.key === key)?.name || '물건';

// 도감 → 박스의 그 포켓몬 (0036: 포켓몬 번호. 가방 목록을 아직 안 받았으면 먼저 받음)
async function toBag(id) {
  sfx.blip();
  if (!S.online) { toast('박스는 인터넷이 필요해요. 와이파이나 데이터를 켜 주세요.'); return; }
  try {
    const { loadBag, openMon } = await import('./bag.js');
    if (!(S.bag?.box || []).some((x) => x.id === id)) await loadBag({ notify: false });
    closeOverlay({ replacing: true });
    openMon(id);
  } catch (e) { toast(errorText(e.message)); }
}

// 박스 요약 → 진화 (c = 박스의 포켓몬 한 마리: id · line_id · stage · species_id · level · evo_fails)
export function evoSheet(c) {
  sfx.select();
  const p = S.snap.profile;
  sheet([h('div.grab'), evoPanel(c, evoChance(c), p), h('button.btn', { onclick: () => closeOverlay() }, '닫기')]);
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
      h('dt', '타입'), h('dd', h('span.types', typeChips(type))),   // span.types = 칩 사이 간격 (붙어 보이던 문제)
      h('dt', '분류'), h('dd', sp.category),
      h('dt', isWild(sp.line_id) ? '만나는 곳' : '정체'), h('dd', isEvent(sp.line_id) ? '이상한 소포 (이벤트)' : isWild(sp.line_id) ? '야생' : line?.teacher || '?'),
      h('dt', '성향'), h('dd', statNote(sp))),
    sp.abilities?.length ? h('div.sum-ab', h('small', '특성 (눌러서 설명)'), abilityBox(sp.abilities, sp.hidden_ability)) : null,
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

export async function doEvolve(c, to = null) {
  unlockAudio();
  const before = spIdOf(c);
  const opts = evoOpts(c);
  to ||= opts.length === 1 ? opts[0].to_species : null;
  let res;
  try {
    res = await rpc('evolve', to ? { p_mon: c.id, p_to: to } : { p_mon: c.id }, { retries: 0 });
  } catch (e) { sfx.error(); toast(errorText(e.message)); return; }
  if (!S.snap) return;   // 진화 요청 사이 로그아웃
  // result is decided; the animation has a fixed length so latency never hints at the outcome
  S.snap.profile = { ...S.snap.profile, ...res.profile };
  // 0036: 그 한 마리만 바뀜 (도감 기록은 sync 가 다시 보냄). 0037: 갈래 종 번호 species_id
  const col = mons().find((m) => m.id === c.id) || { ...c };
  Object.assign(col, { stage: res.stage, evo_fails: res.evo_fails, species_id: res.species_id ?? col.species_id });
  const bx = (S.bag?.box || []).find((m) => m.id === c.id);
  if (bx) Object.assign(bx, { stage: res.stage, evo_fails: res.evo_fails, species_id: res.species_id ?? bx.species_id });
  if (res.by_level) toast('진화 레벨이 되어서 진화의 돌을 쓰지 않았어요.', 2500);
  else if (res.by_item) toast('진화의 돌을 써서 진화했어요.', 2500);
  await kv.set('snap', S.snap);
  await evolutionScene(before, res.success ? res.species_id : (res.to || to || before), res.success, col);
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
