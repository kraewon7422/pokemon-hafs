// 레이드: 큰 보스를 다 같이 탭해서 쓰러뜨리기 (0013).
import { rpc, errorText } from './sb.js';
import { spriteCanvas } from './sprites.js';
import { sfx, unlockAudio } from './sfx.js';
import { h, $, josa, toast, typeText, pix } from './ui.js';
import { S, collection, dexOf, isWithdrawn, owned, speciesOf, vibrate } from './state.js';
import { closeOverlay, fmtWait, openScanner, overlay, renderTab, say, sync } from './app.js';
import { lv50, typeOf } from './dex.js';

// ───────── 레이드: 큰 보스를 다 같이 탭해서 쓰러뜨리기 (0013) ─────────
export const isRaidQr = (q) => /^R\d{1,5}$/.test(q);
export const curSpecies = (line) => { const c = owned(line); return c ? speciesOf(dexOf(line, c.stage)) : null; };
// 서버 _raid_per_tap 과 같은 식 (화면 안내용; 실제 데미지는 서버가 정함)
export function estimatePerTap(line, bossId) {
  const a = curSpecies(line); const b = speciesOf(bossId);
  if (!a || !b) return 3;
  const tp = (sp) => typeOf(sp);
  const m = Number((S.catalog.typeChart || []).find((c) => c.atk === tp(a) && c.def === tp(b))?.mult || 1);
  const phys = (a.atk || 0) >= (a.spa || 0);
  const atk = lv50('atk', phys ? a.atk : a.spa); const def = lv50('def', phys ? b.def : b.spd);
  return Math.max(1, Math.round((10 * atk / Math.max(def, 1)) * m));
}
export const bestLine = (bossId) => collection().filter((c) => !isWithdrawn(c.line_id))
  .map((c) => [c.line_id, estimatePerTap(c.line_id, bossId)]).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;

export async function loadMyRaids() {
  S.myRaidsAt = Date.now();
  try {
    [S.myRaids, S.openRaids] = await Promise.all([rpc('my_raids', {}, { retries: 0 }), rpc('open_raids', {}, { retries: 0 }).catch(() => [])]);
    if (S.tab === 'raid' && !S.overlay) renderTab();
  } catch { /* offline */ }
}

export function viewRaid() {
  if (S.online && (!S.myRaidsAt || Date.now() - S.myRaidsAt > 8000)) loadMyRaids();
  // 운영자가 일찍 끝낸 레이드도 금방 사라지게: 레이드 탭에서는 15초마다 새로 받음
  if (S.online && Date.now() - Math.max(new Date(S.snap.synced_at || 0), S.raidSyncTry || 0) > 15000 && !S.syncing) { S.raidSyncTry = Date.now(); setTimeout(() => sync(), 0); }
  const live = (S.snap.raids_live || []).filter((r) => new Date(r.ends_at) > Date.now());
  const mine = S.myRaids || [];
  const open = (S.openRaids || []).filter((r) => new Date(r.ends_at) > Date.now());
  // 남은 시간은 1초마다 다시 셈 (아래 raidClock)
  const left = (iso) => h('span', { 'data-ends': iso }, fmtWait(Math.max(0, new Date(iso) - Date.now())));
  return [
    h('div.box.stack',
      h('div.banner', h('b', pix('bolt'), ' 레이드'), live.length ? h('span.chip.hot', '보스 출현 중!') : null),
      h('p', { style: { margin: 0 } }, '대형 화면이나 운영진이 보여 주는 레이드 QR을 찍으면 참가해요. 다 같이 보스를 마구 탭해서 체력을 0으로 만들면, 열심히 싸운 모두가 그 몬스터 티켓을 받아요!'),
      h('button.btn.big.primary', { onclick: openScanner }, pix('camera'), '레이드 QR 찍기')),
    open.length > 0 && h('div.box.stack.raid-open',
      h('b', pix('spark'), ' QR 없이 바로 참가할 수 있는 레이드'),
      open.map((r) => h('button.raid-row', { onclick: () => joinOpenRaid(r) },
        spriteCanvas(r.species_id, 56),
        h('div', h('b', r.title),
          h('div.hpbar.small', h('i', { style: { width: `${(r.hp / r.hp_max) * 100}%` } })),
          h('small', '남은 시간 ', left(r.ends_at), ` · ${r.players || 0}명 참가 중`)),
        h('span.chip.hot', r.joined ? '이어 하기' : '참가')))),
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

export async function joinRaid(q, t) {
  if (!S.online) return say('레이드는 인터넷이 필요해요. 와이파이나 데이터를 켜 주세요.', true);
  try {
    const r = await rpc('raid_join', { p_q: q, p_t: t, p_line: null }, { retries: 0 });
    sfx.scan(); vibrate(80);
    openRaid(r);
  } catch (e) { sfx.error(); say(errorText(e.message), true); }
}

// QR 없이 참가 (운영자가 "QR 없이 참가"로 연 레이드)
export async function joinOpenRaid(r) {
  if (!S.online) return say('레이드는 인터넷이 필요해요. 와이파이나 데이터를 켜 주세요.', true);
  try {
    const x = await rpc('raid_join_open', { p_raid: r.id, p_line: bestLine(r.species_id) }, { retries: 0 });
    sfx.scan(); vibrate(80);
    openRaid(x);
  } catch (e) { sfx.error(); say(errorText(e.message), true); loadMyRaids(); }
}

export function openRaid(r0) {
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
        ? `${josa(sp.name, '을', '를')} 쓰러뜨렸다!!\n★ 레이드 보상: ${sp.name} 티켓이 티켓 주머니에 들어왔어요!\n메인 부스에서 몬스터로 바꿔요. (가방 칸은 안 차지해요)`
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
