// Main booth: scan a student's bag QR (camera or USB barcode scanner) → confirm the person → redeem every ticket
// in one server call (booth_redeem is atomic + idempotent) → pokéball reveal → "축하합니다!".
import { CONFIG } from './config.js';
import { sb, rpc, errorText } from './sb.js';
import { isBag, fixKoreanIME } from './qrfmt.js';
import { Scanner } from './scanner.js';
import { spriteCanvas } from './sprites.js';
import { sfx, unlockAudio } from './sfx.js';
import { h, $, josa, toast, sleep, pixelFontScale } from './ui.js';
import { devLogin, renderGoogleButton, signOut } from './auth.js';
// names are shown masked everywhere outside the admin page (강래원 → 강*원)
const maskName = (n = '') => { n = String(n || '').trim(); return n.length >= 3 ? n[0] + '*'.repeat(n.length - 2) + n.at(-1) : n.length === 2 ? n[0] + '*' : n || '트레이너'; };

const root = $('#root');
let species = [];
let busy = false;
let scanner = null;
let autoConfirm = (() => { try { return localStorage.getItem('booth-auto') === '1'; } catch { return false; } })();
const GIF = 'img/booth-ball.gif';     // optional reveal GIF (gitignored - never commit downloaded art); falls back to a CSS ball
let gifOk = false;

const STATUS = {
  new: ['받을 수 있음', 'st-new'], pending: ['받을 수 있음', 'st-pending'], redeemed: ['이미 받음', 'st-done'],
  invalid_token: ['가짜·교체된 QR', 'st-bad'], nonce_conflict: ['다른 학생의 티켓', 'st-bad'], expired: ['만료됨', 'st-bad'],
  cancelled: ['취소됨', 'st-bad'], already_pending: ['같은 장소 중복', 'st-bad'], daily_cap: ['오늘 횟수 초과', 'st-bad'],
  bag_full: ['가방 초과', 'st-bad'], empty_pool: ['QR에 몬스터 미설정(운영자 확인)', 'st-bad'], bad_format: ['형식 오류', 'st-bad'],
};

let pendingConfirm = null;   // the student card waiting for 확인 (Enter/Space also confirms → one-key booth)

async function boot() {
  pixelFontScale();
  document.addEventListener('pointerdown', unlockAudio);
  const img = new Image();
  img.onload = () => { gifOk = true; };
  img.src = GIF;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return renderLogin();
  await start();
}

async function start() {
  try {
    const p = await rpc('ensure_profile');
    if (!['booth', 'admin'].includes(p.role)) { await signOut(); return renderLogin('부스 스태프 계정이 아니에요.'); }
    const { data } = await sb.from('species').select('id,name').order('id');
    species = data || [];
    renderBooth(p);
    rpc('sync').catch(() => {});
    setInterval(() => rpc('sync').catch(() => toast('⚠ 서버 연결 끊김 - 핫스팟을 확인하세요', 4000)), 60_000);  // heartbeat for the dashboard
  } catch (e) { renderLogin(errorText(e.message)); }
}

function renderLogin(msg = '') {
  const err = h('div.err', msg);
  const g = h('div');
  const email = h('input', { type: 'email', placeholder: '부스 계정 이메일' });
  const pw = h('input', { type: 'password', placeholder: '비밀번호' });
  root.replaceChildren(h('div.login-card.box',
    h('b', `${CONFIG.GAME_TITLE} · 메인 부스`), g,
    CONFIG.DEV_LOGIN && h('form', { style: { display: 'grid', gap: '8px' }, onsubmit: async (e) => {
      e.preventDefault();
      try { await devLogin(email.value.trim(), pw.value); await start(); } catch (x) { err.textContent = x.message; }
    } }, email, pw, h('button.btn', { type: 'submit' }, '로그인')),
    err));
  renderGoogleButton(g, (m) => { err.textContent = m; }).catch(() => {});
  sb.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_IN') start(); });
}

function renderBooth(p) {
  const input = h('input.booth-input', {
    placeholder: '바코드 스캐너로 찍거나 학번 입력 후 Enter', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      const v = input.value; input.value = '';
      if (!v.trim() && pendingConfirm) { pendingConfirm(); return; }
      onPayload(v);
    },
  });
  const camBox = h('div.cam', h('div.off', '📷 카메라 시작을 누르세요 (태블릿 후면 카메라 권장)\nUSB 바코드 스캐너가 있으면 그냥 찍으면 돼요.'));
  const camBtn = h('button.btn', { onclick: () => toggleCam(camBox, camBtn) }, '📷 카메라 시작');
  const auto = h('label', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
    h('input', { type: 'checkbox', checked: autoConfirm || null, onchange: (e) => { autoConfirm = e.target.checked; try { localStorage.setItem('booth-auto', autoConfirm ? '1' : '0'); } catch { /* */ } } }),
    '본인 확인 없이 바로 지급 (줄이 길 때만)');
  root.replaceChildren(h('div.staff',
    h('header', h('h1', `${CONFIG.GAME_TITLE} · 메인 부스`),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('span', p.student_id),
        h('button.btn.small', { onclick: async () => { await signOut(); location.reload(); } }, '로그아웃'))),
    h('div.booth',
      h('div', { style: { display: 'grid', gap: '10px' } }, camBox, camBtn, input, h('div.box.tight', auto)),
      h('div.result-area#result', idle()))));
  input.focus();
  document.addEventListener('click', (e) => { if (!e.target.closest('input,button,label')) input.focus(); });
  document.addEventListener('keydown', (e) => { if (e.key === ' ' && pendingConfirm && document.activeElement !== input) { e.preventDefault(); pendingConfirm(); } });
}

const idle = () => h('div.box', h('b', '다음 학생을 기다리는 중…'), h('p', '학생 폰의 "가방 QR"을 찍어 주세요. 폰이 오프라인이어도 괜찮아요.'));

async function toggleCam(box, btn) {
  if (scanner) { scanner.stop(); scanner = null; btn.textContent = '📷 카메라 시작'; box.replaceChildren(h('div.off', '카메라 꺼짐')); return; }
  const video = h('video', { playsinline: true, muted: true });
  box.replaceChildren(video, h('div.reticle'));
  scanner = new Scanner(video, (t) => { if (isBag(t)) onPayload(t); });
  try { await scanner.start(); btn.textContent = '📷 카메라 끄기'; } catch { box.replaceChildren(h('div.off', '카메라를 열 수 없어요.')); scanner = null; }
}

async function onPayload(text) {
  text = fixKoreanIME(String(text || '').trim());   // USB scanner typing into 한글 mode
  if (busy || !text) return;
  if (!isBag(text) && !/^[0-9]{5,6}$/.test(text)) { sfx.error(); toast('가방 QR 또는 학번이 아니에요'); return; }
  busy = true;
  const area = $('#result');
  area.replaceChildren(h('div.box', '확인 중…'));
  try {
    const look = await rpc('booth_lookup', { p_payload: text });
    const usable = look.items.filter((i) => i.status === 'new' || i.status === 'pending');
    sfx.select();
    if (!usable.length) {
      area.replaceChildren(card(look, h('p', '받을 수 있는 티켓이 없어요.')), h('button.btn', { onclick: reset }, '다음 학생'));
      busy = false;
      return;
    }
    if (autoConfirm) return redeem(text, look);
    pendingConfirm = () => { pendingConfirm = null; redeem(text, look); };
    area.replaceChildren(
      card(look, h('p', h('b', '이 학생이 맞나요? '), '얼굴/명찰을 확인해 주세요.')),
      h('div', { style: { display: 'flex', gap: '10px' } },
        h('button.btn.big.go', { onclick: () => pendingConfirm?.() }, `✔ 확인 (Enter) - 몬스터 ${usable.length}마리 받기`),
        h('button.btn', { onclick: reset }, '취소')));
  } catch (e) {
    sfx.error();
    area.replaceChildren(h('div.box', h('b.err', errorText(e.message))), h('button.btn', { onclick: reset }, '다음 학생'));
    busy = false;
  }
}

function card(look, extra) {
  return h('div.box',
    h('div.student-big', `${maskName(look.name)} `, h('small', `${look.gen}기 · ${look.student_id}`)),
    h('ul.ticket-list', look.items.map((i) => {
      const [label, cls] = STATUS[i.status] || [i.status, 'st-bad'];
      return h('li', h('span', i.qr_name || '알 수 없는 장소'), h(`span.${cls}`, label));
    })),
    extra);
}

async function redeem(text, look) {
  const anim = reveal();
  let res;
  try {
    [res] = await Promise.all([rpc('booth_redeem', { p_payload: text }, { retries: 3 }), sleep(gifOk ? 2000 : 1600)]);
  } catch (e) {
    anim.remove();
    sfx.error();
    $('#result').replaceChildren(h('div.box', h('b.err', errorText(e.message)), h('p', '같은 QR을 다시 찍어도 두 번 지급되지 않아요. 안심하고 다시 시도하세요.')),
      h('button.btn', { onclick: reset }, '다음 학생'));
    busy = false;
    return;
  }
  const got = res.results.filter((r) => r.species_id);
  const bad = res.results.filter((r) => r.error);
  const name = (id) => species.find((s) => s.id === id)?.name || `No.${id}`;
  const title = got.length === 1
    ? `축하합니다! ${josa(name(got[0].species_id), '을', '를')} 획득했습니다!`
    : got.length ? `축하합니다! 몬스터 ${got.length}마리를 획득했습니다!` : '받은 몬스터가 없어요';
  if (got.length) sfx.catch();
  anim.replaceChildren(h('div', { style: { display: 'grid', justifyItems: 'center', gap: '10px' } },
    h('div.congrats', title),
    h('div', { style: { color: '#fff' } }, `${maskName(look.name)} (${res.student_id})`),
    h('div.cards',
      got.map((r, i) => h(`div.mcard${r.is_new ? '.new' : ''}`, { style: { animationDelay: `${i * 0.35}s` } },
        spriteCanvas(r.species_id, 128), h('b', name(r.species_id)),
        h('small', r.qr_name || ''), r.is_new && h('span.chip', 'NEW!'), r.bonus_ticket && h('span.chip', '중복 보너스: 진화권 +1'), r.replay && h('span.chip', '이미 받은 결과'))),
      bad.map((r) => h('div.mcard.err', h('b', '✕'), h('small', (STATUS[r.error] || [r.error])[0])))),
    h('button.btn.big.gold', { style: { maxWidth: '320px' }, onclick: () => { anim.remove(); reset(); } }, '다음 학생 (자동 6초)')));
  setTimeout(() => { if (anim.isConnected) { anim.remove(); reset(); } }, 6_000);
}

function reveal() {
  const el = h('div.reveal', h('div.ballstage',
    gifOk ? h('img.gif', { src: GIF, alt: '' }) : h('div.pxball.shake'),
    h('div.congrats', '...')));
  document.body.append(el);
  return el;
}

function reset() {
  busy = false;
  pendingConfirm = null;
  $('#result')?.replaceChildren(idle());
  $('.booth-input')?.focus();
}

boot();
