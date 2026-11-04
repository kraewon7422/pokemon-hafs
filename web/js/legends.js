// 0038 전설 · 알림 · 이상한 소포 · 메타몽 변신 (학생 앱)
//   playNotices(): sync 로 받은 state.notices (아직 안 본 알림) 를 하나씩 전체 화면 연출 (어두움 → ! → 그림자 → 색 · 반짝 + 짧은 곡)
//     → notice_seen. 기기에도 본 id 를 적어 두어 절대 다시 틀지 않음. 다른 화면 (잡기 · 축하 · 시트) 이 떠 있으면 끝난 뒤에.
//     연출 뒤에는 그 알림과 관계있는 탭 (홈 = 티켓 주머니 · 지도 = 사파리존 · 도감) 에 ★ 표시 → 그 탭을 열면 사라짐.
//   giftButton(): 위 막대의 소포 단추 (설정 단추 바로 왼쪽). 지금 받을 수 있는 소포가 있으면 ★.  openGift(): 코드 넣기 시트
//   dittoReveal(fromSp, toSp): "……?" → 도트가 흩어지며 메타몽으로 → "메타몽이었다!"
//   rumourBox(): 지도 탭의 방랑 전설 소문
import { rpc, errorText } from './sb.js';
import { kv } from './db.js';
import { sfx, bgmPush } from './sfx.js';
import { h, josa, toast, sleep, reducedMotion } from './ui.js';
import { S, speciesOf } from './state.js';
import { spriteCanvas, ensureSprites, monCell } from './sprites.js';
import { overlay, closeOverlay, sheet, sync, renderStatus, isBusy } from './app.js';

// ─────────────────────── 알림 연출 ───────────────────────
let seenIds = null;            // 기기에 적어 둔 본 알림 id
let playing = false;
let retry = 0;
const TAB_OF = (n) => (n.kind === 'legend_ready' ? 'map' : n.data?.pending ? 'home' : n.data?.item ? 'home' : 'dex');

async function loadSeen() {
  if (!seenIds) seenIds = new Set(((await kv.get('notice_seen')) || []).map(Number));
  return seenIds;
}
export function noticeTabs() {
  try { return new Set(JSON.parse(localStorage.getItem('hafs.noticeTabs') || '[]')); } catch { return new Set(); }
}
function saveTabs(set) { try { localStorage.setItem('hafs.noticeTabs', JSON.stringify([...set])); } catch { /* */ } }
export function clearNoticeTab(tab) { const t = noticeTabs(); if (t.delete(tab)) { saveTabs(t); renderStatus(); } }

export async function playNotices() {
  if (playing || !S.snap?.notices?.length) return;
  const seen = await loadSeen();
  const list = S.snap.notices.filter((n) => !seen.has(Number(n.id)));
  if (!list.length) { flushSeen(S.snap.notices.map((n) => n.id)); return; }
  if (isBusy() || document.hidden) { clearTimeout(retry); retry = setTimeout(playNotices, 1500); return; }
  playing = true;
  const music = bgmPush(null);          // 배경 음악은 잠깐 조용히
  try {
    for (const n of list) {
      seen.add(Number(n.id));
      await kv.set('notice_seen', [...seen].slice(-300));
      const t = noticeTabs(); t.add(TAB_OF(n)); saveTabs(t);
      await fanfare(n);
    }
  } finally {
    music.pop();
    playing = false;
    flushSeen(list.map((n) => n.id));
    renderStatus();
  }
}
function flushSeen(ids) {
  if (!ids.length || !S.online) return;
  rpc('notice_seen', { p_ids: ids.map(Number) }, { retries: 1 }).then(() => {
    if (S.snap?.notices) S.snap.notices = S.snap.notices.filter((n) => !ids.includes(n.id));
  }).catch(() => { /* 다음 sync 에서 다시 (기기 기록이 있으니 다시 틀지는 않음) */ });
}

// 전체 화면: 어두움 → '!' → 그림자 → 번쩍 + 색 + 반짝이 + 곡 → 글
export async function fanfare(n) {
  const sp = n.species_id ? speciesOf(n.species_id) : null;
  if (sp) await ensureSprites([sp.id]).catch(() => {});
  const stage = h('div.ff-stage');
  const bang = h('div.ff-bang', '!');
  const shadow = sp ? spriteCanvas(sp.id, 160, 'silhouette') : null;
  const mon = sp ? spriteCanvas(sp.id, 160) : h('span.ff-parcel', { html: PARCEL_SVG });
  if (shadow) shadow.classList.add('ff-shadow');
  mon.classList.add('ff-mon');
  const sparks = h('div.ff-sparks', Array.from({ length: 10 }, (_, i) => h('i', { style: { '--a': `${i * 36}deg`, '--d': `${(i % 3) * 60}ms` } })));
  stage.append(bang, ...(shadow ? [shadow] : []), mon, sparks);
  const title = h('b.ff-title', n.title);
  const body = h('p.ff-body', n.body);
  const more = h('span.ff-more', '▼');
  const text = h('div.ff-text', title, body, more);
  const ov = overlay(h('div.ff', { 'aria-live': 'polite' }, stage, text), 'full');
  ov.classList.add('ff-ov');
  const quick = reducedMotion();
  if (!quick) {
    await sleep(350); ov.classList.add('s1'); sfx.scan();          // '!'
    await sleep(700); ov.classList.add('s2');                       // 그림자
    await sleep(1000); ov.classList.add('s3'); sfx.fanfare?.();     // 번쩍 → 색
    await sleep(600);
  } else { ov.classList.add('s1', 's2', 's3'); sfx.fanfare?.(); }
  ov.classList.add('s4');
  await new Promise((res) => setTimeout(() => ov.addEventListener('click', res, { once: true }), 300));
  sfx.blip();
  closeOverlay();
}

// ─────────────────────── 이상한 소포 ───────────────────────
const PARCEL_SVG = '<svg class="icon" viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M2 0h2v1h1V0h2v1H6v1h2v2H7v4H5V4H4v4H2V4H1V2h2V1H2zM3 2v1h3V2z"/></svg>';
export function giftButton() {
  const n = Number(S.snap?.gifts_open) || 0;
  return h('button.gear.gift-btn', { 'aria-label': n ? `이상한 소포 (받을 수 있는 소포 ${n}개)` : '이상한 소포', onclick: () => { sfx.select(); openGift(); } },
    h('span', { html: PARCEL_SVG }), n ? h('span.gift-dot', '★') : null);
}
export function openGift() {
  const n = Number(S.snap?.gifts_open) || 0;
  const input = h('input.gift-code', { type: 'text', maxlength: 60, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    placeholder: '소포 코드', 'aria-label': '소포 코드' });
  const msg = h('p.gift-msg', { role: 'status' });
  const go = h('button.btn.big.primary', '소포 열기');
  const submit = async () => {
    const code = input.value.trim();
    if (!code) { msg.textContent = '코드를 넣어 주세요.'; input.focus(); return; }
    if (!S.online) { msg.textContent = '소포를 열려면 인터넷이 필요해요.'; return; }
    go.disabled = true; msg.textContent = '소포를 여는 중…';
    let r;
    try { r = await rpc('gift_claim', { p_code: code }, { retries: 1 }); } catch (e) { r = { ok: false, error: e.offline ? 'OFFLINE' : e.message }; }
    go.disabled = false;
    if (!r?.ok) {
      sfx.error();
      msg.textContent = r?.error === 'OFFLINE' ? '인터넷이 끊겼어요. 다시 해 주세요.' : r?.error === 'TRY_LATER' ? '코드를 너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요.' : errorText(r?.error);
      return;
    }
    closeOverlay();
    await sync({ force: true });       // 알림 (전체 화면 연출) 은 sync 가 틀어 줌
    playNotices();
  };
  go.onclick = submit;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  sheet([
    h('div.grab'),
    h('div.box.gift-head', h('span.gift-big', { html: PARCEL_SVG }),
      h('div', h('b', '이상한 소포'), h('p', '선생님이나 운영진이 알려 준 소포 코드를 넣으면 무언가가 들어 있대요!'))),
    n ? h('div.box.gift-open', `★ 지금 받을 수 있는 소포가 ${n}개 있어요.`) : null,
    input, msg, go,
    h('p.small-txt.muted', '띄어쓰기와 대소문자는 상관없어요. 소포는 한 사람에 한 번씩 받을 수 있어요.'),
  ]);
  setTimeout(() => input.focus(), 250);
}

// ─────────────────────── 메타몽 변신 ───────────────────────
export async function dittoReveal(fromId, toId) {
  const from = speciesOf(fromId), to = speciesOf(toId);
  if (!from || !to) return;
  await ensureSprites([from.id, to.id]).catch(() => {});
  // 도트 칸 (96×96) 그대로 두 장을 받아 한 칸씩 바꿈 (화면 크기는 CSS 로 키움, 번지지 않게)
  let ca = null, cb = null;
  for (let t = 0; t < 40 && !(ca && cb); t++) { ca = monCell(from.id); cb = monCell(to.id); if (!(ca && cb)) await sleep(50); }
  const out = document.createElement('canvas');
  out.width = ca?.width || 96; out.height = ca?.height || 96; out.className = 'ditto-c';
  const line = h('p.ditto-text', '……?');
  const ov = overlay(h('div.ditto', out, line), 'full');
  const g = out.getContext('2d');
  if (ca) g.drawImage(ca, 0, 0);
  const b = cb || out;
  await sleep(1300);
  line.textContent = '……!?';
  await sleep(300);
  try {
    const W = out.width, H = out.height, B = Math.max(2, Math.round(W / 40));
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
    const tg = tmp.getContext('2d'); tg.drawImage(b, 0, 0, W, H);
    const da = g.getImageData(0, 0, W, H), db = tg.getImageData(0, 0, W, H);
    const cols = Math.ceil(W / B), rows = Math.ceil(H / B);
    const order = Array.from({ length: cols * rows }, (_, i) => i).sort(() => Math.random() - 0.5);
    const steps = reducedMotion() ? 1 : 18;
    for (let s = 1; s <= steps; s++) {
      const upto = Math.round((order.length * s) / steps);
      for (let k = Math.round((order.length * (s - 1)) / steps); k < upto; k++) {
        const bx = (order[k] % cols) * B, by = Math.floor(order[k] / cols) * B;
        for (let y = by; y < Math.min(H, by + B); y++) for (let x = bx; x < Math.min(W, bx + B); x++) {
          const i = (y * W + x) * 4;
          da.data[i] = db.data[i]; da.data[i + 1] = db.data[i + 1]; da.data[i + 2] = db.data[i + 2]; da.data[i + 3] = db.data[i + 3];
        }
      }
      g.putImageData(da, 0, 0);
      if (s % 3 === 0) sfx.evoTick();
      await sleep(55);
    }
  } catch { g.clearRect(0, 0, out.width, out.height); g.drawImage(b, 0, 0, out.width, out.height); }   // 그림을 못 읽으면 바로 바꿈
  sfx.select();
  line.replaceChildren(h('b', `${josa(from.name, '은', '는')} 사실 ${josa(to.name, '이었다!', '였다!')}`));
  ov.classList.add('done');
  await new Promise((res) => setTimeout(() => ov.addEventListener('click', res, { once: true }), 300));
  closeOverlay();
}

// ─────────────────────── 방랑 전설 소문 (지도 탭) ───────────────────────
export function rumourBox() {
  const list = (S.snap?.roamers || []).filter((r) => !r.caught && r.rumour);
  if (!list.length) return null;
  return h('div.box.rumour', h('b', '소문'),
    h('ul', list.map((r) => h('li', r.rumour))),
    h('small', '방랑 전설은 한 시간마다 자리를 옮긴대요. 그 근처 장소 QR을 찍으면 만날지도 몰라요!'));
}
