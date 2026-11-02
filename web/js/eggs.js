// 알 (0027): 걸음 세기 + 가방 '알' 주머니 + 부화 장면 · 도전과제
// 걸음: 웹앱은 폰의 걸음 수를 못 읽어서, 앱이 열려 있고 화면이 켜져 있을 때 움직임 센서(devicemotion)로 셈.
//   규칙적인 걸음이 4번 이어져야 세기 시작 (흔들기·톡 치기는 안 셈). 30초마다 서버로 (서버가 1분 200걸음·하루 3만 걸음으로 자름).
//   새 장소 QR 을 찍으면 서버가 부화기 알에 +300걸음 (bag_state 기록 _egg_steps 로 알림).
import { rpc, errorText } from './sb.js';
import { spriteCanvas } from './sprites.js';
import { sfx } from './sfx.js';
import { h, josa, toast, pix, sleep, reducedMotion } from './ui.js';
import { S, speciesOf } from './state.js';
import { overlay, sheet, closeOverlay, sync, renderTab } from './app.js';
import { moveOf } from './battle.js';

export const TIER = { green: '초록 점박이 알', yellow: '노랑 점박이 알', purple: '보라 점박이 알' };
const TIER_I = { green: 0, yellow: 1, purple: 2 };
const TIER_NOTE = { green: '흔한 몬스터 · 레벨 +3 · 반짝 10%', yellow: '희귀 몬스터 · 알 기술 · 반짝 25%', purple: '가끔 전설! · 알 기술 + 지닌 물건 · 반짝 50%' };

// web/img/eggs.png 칸 (32×40): 알 3 · 금 간 알 3 · 부화기 속 알 3 · 빈 부화기 (tools/draw_fx.py EGG_CELLS 와 같은 순서)
export function eggImg(kind, tier, k = 2) {
  const i = kind === 'empty' ? 9 : { egg: 0, crack: 3, inc: 6 }[kind] + TIER_I[tier];
  return h('i.egg-img', { 'aria-hidden': 'true', style: { width: `${32 * k}px`, height: `${40 * k}px`, backgroundSize: `${320 * k}px ${40 * k}px`, backgroundPosition: `-${i * 32 * k}px 0` } });
}

export async function loadEggs() {
  S.eggs = await rpc('egg_state', {}, { retries: 0 });
  return S.eggs;
}

// ───────────── 걸음 세기 ─────────────
const ST = { on: false, alive: 0, pending: 0, base: null, smooth: null, up: false, lastPeak: 0, streak: 0, timer: 0, sending: false };
const stepsOff = () => { try { return localStorage.getItem('stepsOff') === '1'; } catch { return false; } };
const needsAsk = () => typeof window.DeviceMotionEvent?.requestPermission === 'function';   // iPhone: 탭 안에서 허락을 받아야 함
export const stepsLive = () => ST.on && performance.now() - ST.alive < 5000;

function onMotion(e) {
  if (document.hidden) return;
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null) return;
  ST.alive = performance.now();
  const mag = Math.hypot(a.x, a.y, a.z);
  ST.base = ST.base == null ? mag : ST.base * 0.98 + mag * 0.02;        // 천천히 따라가는 평균 (중력)
  ST.smooth = ST.smooth == null ? mag : ST.smooth * 0.75 + mag * 0.25;   // 빠른 떨림은 걸러냄
  const dv = ST.smooth - ST.base;
  if (!ST.up && dv > 1.1) {
    ST.up = true;
    const now = performance.now(); const gap = now - ST.lastPeak; ST.lastPeak = now;
    if (gap < 260 || gap > 2000) { ST.streak = 1; return; }               // 너무 빠름(흔들기) · 너무 느림 = 다시 처음부터
    ST.streak += 1;
    if (ST.streak === 4) ST.pending += 4;                                  // 규칙적인 걸음 4번째에 앞의 것까지 한꺼번에
    else if (ST.streak > 4) ST.pending += 1;
  } else if (ST.up && dv < 0.3) ST.up = false;
}

async function flushSteps() {
  if (ST.sending || ST.pending < 1 || !S.online) return;
  const n = Math.min(ST.pending, 5000); ST.pending -= n; ST.sending = true;
  try {
    const before = new Set((S.eggs?.eggs || []).filter((x) => x.slot && x.steps >= x.need).map((x) => x.id));
    S.eggs = await rpc('egg_add_steps', { p_steps: n }, { retries: 0 });
    const fresh = (S.eggs.ready || []).filter((id) => !before.has(id));
    if (fresh.length) { sfx.correct(); toast('알이 꿈틀꿈틀! 가방 → 알에서 부화시켜 줘요.', 4500); }
    document.querySelector('.overlay')?.redraw?.();
  } catch (e) { if (e.offline || e.message === 'OFFLINE') ST.pending += n; }
  finally { ST.sending = false; }
}

function attach() {
  if (ST.on) return;
  ST.on = true;
  window.addEventListener('devicemotion', onMotion);
  ST.timer = setInterval(flushSteps, 30_000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushSteps(); });
}

// 앱이 뜰 때: 안드로이드는 바로 켬. 아이폰은 전에 허락했으면 이벤트가 오고, 아니면 알 주머니에 '켜기' 단추
export function startSteps() {
  if (!('DeviceMotionEvent' in window) || stepsOff()) return;
  attach();
}
export async function enableSteps() {
  if (!('DeviceMotionEvent' in window)) { toast('이 기기는 걸음을 셀 수 없어요. 새 장소 QR 을 찍으면 알이 자라요.'); return false; }
  if (needsAsk()) {
    try { if (await window.DeviceMotionEvent.requestPermission() !== 'granted') { toast('걸음을 세려면 "동작 및 방향" 접근을 허용해 주세요.', 4000); return false; } }
    catch { toast('설정 → Safari → "동작 및 방향 접근" 을 켜 주세요.', 4000); return false; }
  }
  try { localStorage.removeItem('stepsOff'); } catch { /* */ }
  attach();
  return true;
}
function disableSteps() {
  flushSteps();
  window.removeEventListener('devicemotion', onMotion); clearInterval(ST.timer); ST.on = false;
  try { localStorage.setItem('stepsOff', '1'); } catch { /* */ }
}

// ───────────── 가방 '알' 주머니 ─────────────
export function eggPocket(redraw) {
  const E = S.eggs;
  if (!E) return [h('p.muted', '알 정보를 불러오는 중…')];
  const eggs = E.eggs || [];
  const inc = Array.from({ length: E.incubators || 3 }, (_, i) => eggs.find((x) => x.slot === i + 1));
  const wait = eggs.filter((x) => !x.slot);
  const live = stepsLive();
  const stepRow = h('div.egg-steps',
    h('span', h('b', live ? '걸음 세는 중' : ST.on && !needsAsk() ? '걸음 세기 켜짐' : '걸음 세기 꺼짐'), h('br'),
      h('small', `오늘 ${Number(E.steps_today || 0).toLocaleString()}걸음 · 모두 ${Number(E.steps_total || 0).toLocaleString()}걸음`)),
    ST.on && (live || !needsAsk())
      ? h('button.btn.small', { onclick: () => { disableSteps(); redraw(); } }, '끄기')
      : h('button.btn.small.primary', { onclick: async () => { if (await enableSteps()) { toast('걸음을 세기 시작해요. 앱을 켜 둔 채로 걸어요!'); setTimeout(redraw, 1500); } } }, '켜기'));
  const slotCard = (x, i) => {
    if (!x) return h('div.egg-slot.empty', eggImg('empty', null), h('small', `부화기 ${i + 1}`), h('small.muted', '비어 있어요'));
    const ready = x.steps >= x.need;
    return h(`div.egg-slot${ready ? '.ready' : ''}`,
      ready ? h('span.egg-wobble', eggImg('crack', x.tier)) : eggImg('inc', x.tier),
      h('span.egg-bar', h('i', { style: { width: `${Math.min(100, (x.steps / x.need) * 100)}%` } })),
      h('small', `${x.steps.toLocaleString()} / ${x.need.toLocaleString()}`),
      ready ? h('button.btn.small.gold', { onclick: () => hatch(x, redraw) }, '부화!') : h('small.muted', '걸음'));
  };
  return [
    stepRow,
    h('small.muted.egg-note', '앱을 켜 두고 걸을 때만 세요 (화면이 꺼지면 멈춰요). 새 장소 QR 을 찍으면 부화기 알이 ', h('b', `+${E.qr_bonus || 300}걸음`), '!'),
    h('div.egg-head', h('b', '부화기'), h('small', `알 ${eggs.length} / ${E.hold_max || 9}`)),
    h('div.egg-incs', inc.map(slotCard)),
    h('div.egg-head', h('b', '기다리는 알'), h('small.muted', wait.length ? '누르면 부화기에 넣어요' : '')),
    wait.length ? h('div.egg-wait', wait.map((x) => h('button.egg-cell', { onclick: () => incubate(x, redraw) },
      eggImg('egg', x.tier, 1.5), h('small', TIER[x.tier].replace(' 점박이 알', '')), h('small.muted.nw', `${x.need.toLocaleString()}걸음`))))
      : h('p.muted', '알이 없어요. 새 장소 QR · 레이드 승리 · 도전과제에서 받아요.'),
    h('div.egg-legend', ['green', 'yellow', 'purple'].map((t) => h('div', eggImg('egg', t, 1), h('span', h('b', TIER[t]), h('br'), h('small', `${(E.need?.[t] || 0).toLocaleString()}걸음 · ${TIER_NOTE[t]}`))))),
  ];
}

async function incubate(x, redraw) {
  sfx.blip();
  if ((S.eggs.eggs || []).filter((e) => e.slot).length >= (S.eggs.incubators || 3)) return toast('부화기가 꽉 찼어요. 먼저 부화시켜요!');
  try { S.eggs = await rpc('egg_incubate', { p_egg: x.id }, { retries: 0 }); toast(`${josa(TIER[x.tier], '을', '를')} 부화기에 넣었다!`); redraw(); }
  catch (e) { toast(errorText(e.message)); }
}

// ───────────── 부화 장면 ─────────────
async function hatch(x, redraw) {
  let res;
  try { res = await rpc('egg_hatch', { p_egg: x.id }, { retries: 0 }); } catch (e) { return toast(errorText(e.message)); }
  if (res.eggs) S.eggs = res.eggs;
  const sp = speciesOf(res.species_id);
  const stageEl = h('div.hatch-stage', h('span.hatch-egg', eggImg('crack', res.tier, 4)));
  const text = h('p.hatch-text', '어라…?');
  const btns = h('div.hatch-btns');
  overlay(h('div.hatch-screen', h('div.hatch-sky'), stageEl, h('div.textbox.hatch-box', text, btns)), 'full');
  sfx.blip();
  const slow = !reducedMotion();
  if (slow) { for (let i = 0; i < 3; i++) { stageEl.firstChild.classList.add('shake'); sfx.blip(); await sleep(520); stageEl.firstChild.classList.remove('shake'); await sleep(260); } }
  stageEl.classList.add('flash'); sfx.catch(); await sleep(slow ? 450 : 50);
  stageEl.replaceChildren(h(`span.hatch-mon${res.shiny ? '.shiny' : ''}`, spriteCanvas(res.species_id, 160, res.shiny ? 'shiny' : 'normal'),
    res.shiny && [1, 2, 3].map((i) => h(`i.hatch-spark.s${i}`, pix('spark', 'l')))));
  stageEl.classList.remove('flash');
  const lines = [`알에서 ${josa(sp?.name || '몬스터', '이', '가')} 태어났다!`];
  lines.push(res.new ? '새 몬스터! 도감에 올랐다.' : `이미 있던 몬스터라 레벨이 올랐다! (Lv.${res.level})`);
  if (res.shiny) lines.push(res.shiny_new ? '반짝이는 색이다! (가방에서 색을 바꿀 수 있어요)' : '반짝이는 색이다!');
  if (res.egg_move) lines.push(`알 기술 ${josa(moveOf(res.egg_move)?.name || '기술', '을', '를')} 알고 있다!`);
  if (res.held) {
    const { itemOf } = await import('./bag.js');
    lines.push(`${josa(itemOf(res.held)?.name || '물건', '을', '를')} ${res.held_to === 'held' ? '지니고' : '가방에 넣어 두고'} 있었다!`);
  }
  if (res.bonus_ticket) lines.push('진화권도 1장 받았다!');
  text.textContent = lines.join('\n');
  btns.replaceChildren(
    h('button.btn.primary', { onclick: async () => { closeOverlay(); const { openMon, loadBag } = await import('./bag.js'); await loadBag({ notify: false }).catch(() => {}); openMon(res.line); } }, '몬스터 보기'),
    h('button.btn', { onclick: () => { closeOverlay(); redraw?.(); } }, '닫기'));
  sync().catch(() => {});
  import('./bag.js').then(({ loadBag }) => loadBag({ notify: false })).catch(() => {});
}

// ───────────── 도전과제 ─────────────
const rewardText = (r) => (r?.egg ? TIER[r.egg] : r?.item === 'candy' ? `이상한사탕 ×${r.n || 1}` : r?.item ? `물건 ×${r.n || 1}` : r?.evo ? `진화권 ×${r.evo}` : '');
const rewardIcon = (r) => (r?.egg ? eggImg('egg', r.egg, 0.8) : r?.evo ? pix('ticket', 'l') : pix('gift', 'l'));

export async function loadAchievements() {
  S.ach = await rpc('achievements', {}, { retries: 0 });
  return S.ach;
}

export async function openAchievements() {
  sfx.select();
  if (!S.online) return toast('도전과제는 인터넷이 필요해요.');
  try { await loadAchievements(); } catch (e) { return toast(errorText(e.message)); }
  const body = h('div.ach-list');
  const head = h('div.ach-head');
  const draw = () => {
    const L = S.ach || [];
    head.replaceChildren(h('b', pix('gold', 'l'), ' 도전과제'), h('span.chip', `${L.filter((a) => a.claimed).length} / ${L.length} 완료`));
    body.replaceChildren(...[...L].sort((a, b) => (b.done && !b.claimed) - (a.done && !a.claimed) || a.claimed - b.claimed).map((a) => {
      const pct = Math.min(100, (a.progress / a.target) * 100);
      return h(`div.ach-row${a.claimed ? '.claimed' : a.done ? '.done' : ''}`,
        h('span.ach-ico', rewardIcon(a.reward)),
        h('span.ach-main', h('b', a.title), h('small', a.desc),
          h('span.ach-bar', h('i', { style: { width: `${pct}%` } })),
          h('small.muted', `${Math.min(a.progress, a.target).toLocaleString()} / ${a.target.toLocaleString()} · 보상 ${rewardText(a.reward)}`)),
        a.claimed ? h('span.chip.ach-ok', '받음') : a.done
          ? h('button.btn.small.gold', { onclick: (e) => claim(a, e.currentTarget, draw) }, '받기')
          : null);
    }));
  };
  draw();
  sheet([h('div.grab'), head, h('small.muted', '조건을 채우면 "받기"를 눌러 보상을 받아요. 알은 가방 → 알에 들어가요.'), body,
    h('button.btn', { onclick: () => closeOverlay() }, '닫기')]);
}

async function claim(a, btn, draw) {
  btn.disabled = true;
  try {
    const r = await rpc('claim_achievement', { p_key: a.key }, { retries: 0 });
    S.ach = r.list || S.ach;
    sfx.correct();
    toast(`${a.title} 완료! ${rewardText(r.reward)} 받았다!${r.egg ? ' (가방 → 알)' : ''}`, 4000);
    if (r.egg) loadEggs().catch(() => {});
    if (r.evo_tickets != null && S.snap?.profile) S.snap.profile.evo_tickets = r.evo_tickets;
    draw();
    if (S.tab === 'home') renderTab();
  } catch (e) { btn.disabled = false; toast(errorText(e.message)); }
}
