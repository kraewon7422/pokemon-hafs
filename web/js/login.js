// 로그인 · 가입 · 구글 연결 · 동의 · 처음 안내.
import { CONFIG } from './config.js';
import { rpc, errorText } from './sb.js';
import { kv } from './db.js';
import { spriteCanvas } from './sprites.js';
import { sfx } from './sfx.js';
import { h, $, toast, pix } from './ui.js';
import { inAppBrowser, escapeInApp, isIOS, renderGoogleButton, devLogin, signOut } from './auth.js';
import { S, app } from './state.js';
import { afterLogin, closeOverlay, go, handlePendingScan, installButton, renderShell, sheet } from './app.js';

// ───────────────────────── first run: consent + how to play ─────────────────────────

export function renderConsent() {
  const show = h('input', { type: 'checkbox', id: 'show', checked: true });
  const err = h('div.err');
  app().replaceChildren(h('div.login', { style: { textAlign: 'left', alignContent: 'start', paddingTop: 'calc(env(safe-area-inset-top) + 32px)' } },
    h('div.logo', { style: { fontSize: '28px', justifySelf: 'center' } }, CONFIG.GAME_TITLE),
    h('div.box', { style: { maxWidth: '420px' } },
      h('b', '시작하기 전에 확인해 주세요'),
      h('ul', { style: { paddingLeft: '18px', margin: '8px 0', fontSize: '14px' } },
        h('li', '저장하는 정보: 고유번호(또는 아이디), 이름, 게임 기록(찍은 QR·몬스터·퀴즈). 위치(GPS)는 저장하지 않아요.'),
        h('li', '목적: 축제 게임 운영과 랭킹·상품 지급.'),
        h('li', '축제가 끝나고 2주 뒤 모두 삭제해요.')),
      h('label', { for: 'show', style: { display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' } }, show,
        h('span', `랭킹·대형 화면에 내 이름을 "${S.snap?.profile?.gen ? S.snap.profile.gen + '기 ' : ''}${maskName(S.snap?.profile?.name)}"처럼 가려서 보여 주기. (체크를 풀면 "익명 트레이너" - 나중에 오른쪽 위 톱니바퀴 설정에서도 바꿀 수 있어요)`))),
    err,
    h('button.btn.big.primary', {
      style: { maxWidth: '420px' },
      onclick: async () => {
        try {
          const prof = await rpc('accept_terms', { p_show: show.checked });
          S.snap.profile = { ...S.snap.profile, ...prof };
          await kv.set('snap', S.snap);
          renderShell();
          maybeOnboard();
          handlePendingScan();
        } catch (e) { err.textContent = errorText(e.message); }
      },
    }, '동의하고 시작하기'),
    h('button.btn.small.ghost', { onclick: async () => { await signOut(); await kv.clear(); S.snap = null; renderLogin(); } }, '동의하지 않음 (로그아웃)')));
}
export const maskName = (raw = '') => {
  const n = String(raw || '').trim();
  return n.length >= 3 ? n[0] + '*'.repeat(n.length - 2) + n.at(-1) : n.length === 2 ? n[0] + '*' : n || '트레이너';
};

export function maybeOnboard() {
  let seen = false;
  try { seen = localStorage.getItem('onboarded') === '1'; } catch { /* ignore */ }
  if (!seen) showOnboarding();
}

export function showOnboarding(again = false) {
  const steps = [
    ['camera', 'QR 찾기', '학교 곳곳에 붙은 QR을 아래 가운데 볼 버튼으로 찍어요. 폰 기본 카메라 말고 꼭 앱 버튼으로!'],
    ['ticket', '가방에 티켓', '찍으면 티켓이 가방에 들어가요 (최대 5장). 인터넷이 없어도 저장돼요.'],
    ['school', '메인 부스로!', '부스에서 "가방 QR"을 보여주면 선생님 몬스터를 받아요. 그 장소는 다시 찍을 수 있어요.'],
    ['spark', '퀴즈 → 진화', '몬스터를 받으면 쌤 퀴즈! 맞히면 진화권. 도감에서 몬스터를 눌러 진화시켜요.'],
    ['bolt', '레이드', '대형 화면에 보스가 나타나면 레이드 QR을 찍고 다 같이 마구 탭! 시간 안에 쓰러뜨리면 그 보스 몬스터 티켓을 받아요.'],
    ['spark', '배틀', '배틀 탭에서 내 팀으로 겨뤄요. 친구 배틀 QR을 찍어 실시간 대결! 친구를 이기면 진화권 1장 (하루 3번).'],
  ];
  let i = 0;
  const icon = h('div', { style: { fontSize: '56px', textAlign: 'center' } });
  const title = h('b', { style: { fontSize: '20px' } });
  const body = h('p');
  const dots = h('div', { style: { textAlign: 'center', letterSpacing: '6px' } });
  const next = h('button.btn.big.primary');
  const draw = () => {
    const [a, b, c] = steps[i];
    icon.replaceChildren(pix(a, 'xl')); title.textContent = `${i + 1}. ${b}`; body.textContent = c;
    dots.textContent = steps.map((_, j) => (j === i ? '●' : '○')).join('');
    next.textContent = i < steps.length - 1 ? '다음 ▶' : '시작하기!';
  };
  next.onclick = () => {
    sfx.blip();
    if (i < steps.length - 1) { i++; draw(); return; }
    try { localStorage.setItem('onboarded', '1'); } catch { /* ignore */ }
    closeOverlay();
  };
  draw();
  sheet([h('div.grab'), h('div.box', { style: { display: 'grid', gap: '8px' } }, icon, title, body, dots), next], { dismissable: again });
}

// ───────────────────────── login ─────────────────────────

// 비밀번호 칸 + 오른쪽 눈 버튼: 누를 때마다 보이기 ↔ 가리기
export const EYE_OPEN = '<svg viewBox="0 0 16 16" width="20" height="20" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M5 4h6v1h2v1h1v1h1v2h-1v1h-1v1h-2v1H5v-1H3v-1H2V9H1V7h1V6h1V5h2zm1 2v1H5v2h1v1h4V9h1V7h-1V6zm1 1h2v2H7z"/></svg>';
export const EYE_SHUT = '<svg viewBox="0 0 16 16" width="20" height="20" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M1 7h1v1h1v1h2v1h6V9h2V8h1V7h1v2h-1v1h-1v1h1v1h-1v-1h-1v1H9v1H8v-1H7v1H6v-1H4v1H3v-1h1v-1H3v-1H2V9H1z"/></svg>';
export function withEye(input) {
  const btn = h('button.pw-eye', { type: 'button', 'aria-label': '비밀번호 보기', 'aria-pressed': 'false', html: EYE_OPEN });
  btn.onclick = () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = show ? EYE_SHUT : EYE_OPEN;
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? '비밀번호 가리기' : '비밀번호 보기');
    input.focus();
  };
  return h('div.pw-wrap', input, btn);
}

// 로그인 화면 (0018): 학생 = 고유번호 + 비밀번호, 비학생(선생님·학부모·손님·운영진) = 아이디 + 비밀번호, 맨 아래 구글 = 복구용.
// 구글은 설정에서 "복구용 구글 연결"을 해 둔 경우에 내 계정으로 들어간다. 비밀번호를 잊으면 그 구글로 들어가서 새로 정한다.
export const linkIntent = () => { try { return JSON.parse(sessionStorage.getItem('linkGoogle') || 'null'); } catch { return null; } };
export const clearGoogleIntents = () => { sessionStorage.removeItem('linkGoogle'); sessionStorage.removeItem('recover'); };
export const keyLabel = (k) => (k.kind === 'number' ? `고유번호 ${k.key}` : `아이디 ${k.key}`);

export function renderLogin(error = '') {
  closeOverlay();
  const err = h('div.err', { role: 'alert' }, error);
  const gbox = h('div.gbox');
  const mons = h('div.mons.hop', [1, 13, 25, 37, 49].map((d, i) => h('span', { style: { animationDelay: `${i * 0.18}s` } }, spriteCanvas(d, 52))));
  const pending = sessionStorage.getItem('pendingScan');
  const link = linkIntent();
  const recover = sessionStorage.getItem('recover') === '1';
  const googleFirst = !!(link || recover);
  // 3세대 타이틀 화면 느낌: 하늘·구름·나무·잔디 = 배경 그림 (web/img/title, CC0) + 해(소디포) + 잔디 위 몬스터들
  const sky = h('div.title-sky', { 'aria-hidden': 'true' }, h('span.sun', spriteCanvas(112, 64)));
  const content = [
    sky,
    h('div.title-plate', h('div.logo', CONFIG.GAME_TITLE), h('div.logo-sub', '학교 곳곳의 QR을 찾아 선생님 몬스터를 모아라!')),
    mons,
    pending && h('div.box.login-note',
      h('b', pix('camera'), 'QR을 찍었는데 이 브라우저는 로그인이 안 돼 있어요'), h('br'),
      '게임을 하던 앱(브라우저)을 열고 가운데 볼 버튼으로 다시 찍거나, QR 아래 5자리 코드를 입력하세요. 처음이라면 여기서 로그인해도 돼요.'),
    googleFirst
      ? h('section.box.login-card.google-first',
        h('b.lc-title', link ? '복구용 구글 연결' : '구글로 내 계정 찾기'),
        h('small', link
          ? `${keyLabel(link)} 계정에 연결할 구글 계정으로 로그인하세요. 그다음 그 계정의 비밀번호를 한 번 더 넣으면 연결돼요.`
          : '복구용으로 연결해 둔 구글 계정으로 로그인하면 내 계정으로 들어가요. 들어가면 바로 새 비밀번호를 정해요.'),
        gbox,
        h('button.btn.small.ghost', { type: 'button', onclick: () => { clearGoogleIntents(); renderLogin(); } }, '취소'))
      : h('div.press.blink', 'PRESS START'),
    err,
    !googleFirst && studentLogin(err),
    !googleFirst && idLogin(err),
    !googleFirst && h('section.google-alt', h('small', '복구용 구글을 연결해 뒀다면 구글로 바로 들어와요'), gbox),
    installButton('.small'),
    h('p.foot-note', '처음이면 그 자리에서 계정이 만들어져요. 학생은 고유번호 하나 = 계정 하나예요. ',
      h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, '개인정보 처리방침')),
    // 늘 맨 아래에: 만든 동아리 (Watson & Decfi) · 문의하기 · 비밀번호를 잊었어요
    h('nav.login-help', { 'aria-label': '도움' },
      h('div.clubs', { 'aria-label': '만든 동아리: Watson & Decfi' },
        h('figure', h('img', { src: 'img/clubs/watson.png', alt: 'Watson 로고', width: 56, height: 56 }), h('figcaption', 'Watson')),
        h('span.amp', { 'aria-hidden': 'true' }, '&'),
        h('figure', h('img', { src: 'img/clubs/decfi.png', alt: 'Decfi 로고', width: 39, height: 44 }), h('figcaption', 'Decfi'))),
      h('div.help-btns',
        h('button.btn.small', { type: 'button', onclick: () => inquiryPublicSheet() }, pix('memo'), '문의하기'),
        h('button.btn.small', { type: 'button', onclick: () => forgotSheet() }, pix('ticket'), '비밀번호를 잊었어요'))),
  ];
  app().replaceChildren(h('div.login.title-screen', content));
  renderGoogleButton(gbox, (m) => { err.textContent = m; }).catch((e) => { err.textContent = e.message; });
}

// 학생: 고유번호 + 내가 정한 비밀번호. 처음 쓰는 번호면 이 비밀번호로 계정이 만들어진다 (0011)
export function studentLogin(err) {
  const cid = h('input', { placeholder: '고유번호 6자리 (예: 022001)', inputmode: 'numeric', maxlength: 6, autocomplete: 'username', 'aria-label': '고유번호' });
  const pw = h('input', { type: 'password', placeholder: '비밀번호 (6자 이상)', autocomplete: 'current-password', maxlength: 72, 'aria-label': '비밀번호' });
  const help = h('div');
  const go = h('button.btn.primary', { type: 'submit' }, '학생 로그인');
  const sid = () => cid.value.replace(/\D/g, '').padStart(6, '0');
  const form = h('form.stack', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      help.replaceChildren();
      if (!/^[0-9]{5,6}$/.test(cid.value.trim())) { err.textContent = '고유번호 6자리를 숫자로 입력해 주세요. (예: 022001)'; return; }
      if (pw.value.length < 6) { err.textContent = '비밀번호는 6자 이상이에요.'; return; }
      const email = `${sid()}@code.local`;
      go.disabled = true;
      try {
        try { return await devLogin(email, pw.value); } catch { /* not yet / wrong → below */ }
        // 예전에 받은 로그인 코드(ABCD-EFGH)도 그대로 비밀번호로 쓸 수 있다
        const code = pw.value.replace(/[\s-]/g, '').toUpperCase();
        if (/^[A-Z2-9]{8}$/.test(code) && code !== pw.value) { try { return await devLogin(email, code); } catch { /* no */ } }
        try {
          await rpc('create_number_account', { p_student_id: sid(), p_password: pw.value }, { retries: 0 });
          await devLogin(email, pw.value);
        } catch (x) {
          if (x.message === 'CODE_ACCOUNT_EXISTS') {
            err.textContent = '비밀번호가 맞지 않아요.';
            help.replaceChildren(h('button.btn.small.ghost', { type: 'button', onclick: () => forgotSheet({ kind: 'number', key: sid() }) }, '비밀번호를 모르겠어요'));
          } else err.textContent = errorText(x.message);
        }
      } finally { go.disabled = false; }
    },
  }, cid, withEye(pw), go, help);
  return h('section.box.login-card', h('b.lc-title', pix('school'), ' 학생 · 고유번호로 로그인'), form,
    h('small', '처음 쓰는 번호면 지금 적은 비밀번호로 계정이 만들어져요.'));
}

// 비학생 (선생님·학부모·손님·운영진): 아이디 + 비밀번호. 처음 쓰는 아이디면 계정이 만들어진다. 운영진 아이디는 운영자가 만들어 준다 (0018)
export function idLogin(err) {
  const idIn = h('input', { placeholder: '아이디 (영문으로 시작, 4~16자)', autocapitalize: 'off', autocomplete: 'username', spellcheck: 'false', maxlength: 16, 'aria-label': '아이디' });
  const pw = h('input', { type: 'password', placeholder: '비밀번호 (6자 이상)', autocomplete: 'current-password', maxlength: 72, 'aria-label': '비밀번호' });
  const help = h('div');
  const go = h('button.btn', { type: 'submit' }, '아이디 로그인');
  const form = h('form.stack', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      help.replaceChildren();
      const id = idIn.value.trim().toLowerCase();
      if (!/^[a-z][a-z0-9_]{3,15}$/.test(id)) { err.textContent = '아이디는 영문으로 시작하는 4~16자예요. (영문 소문자·숫자·_ )'; return; }
      if (pw.value.length < 6) { err.textContent = '비밀번호는 6자 이상이에요.'; return; }
      const email = `${id}@id.local`;
      go.disabled = true;
      try {
        try { return await devLogin(email, pw.value); } catch { /* not yet / wrong → below */ }
        try {
          await rpc('create_id_account', { p_id: id, p_password: pw.value }, { retries: 0 });
          await devLogin(email, pw.value);
        } catch (x) {
          if (x.message === 'ID_TAKEN') {
            err.textContent = '이미 있는 아이디예요. 비밀번호가 맞지 않아요.';
            help.replaceChildren(h('button.btn.small.ghost', { type: 'button', onclick: () => forgotSheet({ kind: 'id', key: id }) }, '비밀번호를 모르겠어요'));
          } else err.textContent = errorText(x.message);
        }
      } finally { go.disabled = false; }
    },
  }, idIn, withEye(pw), go, help);
  return h('section.box.login-card', h('b.lc-title', pix('door'), ' 비학생 · 아이디로 로그인'), form,
    h('small', '선생님·학부모·다른 학교 손님은 원하는 아이디를 정해서 들어와요 (랭킹 제외). 운영진은 운영자에게 받은 아이디로 들어와요.'));
}

// 로그인 전 문의 (이름 + 선택 고유번호/아이디 + 내용) → 운영자 페이지 '요청' 탭
export function inquiryPublicSheet() {
  const nm = h('input', { placeholder: '이름 (예: 홍길동)', maxlength: 20, autocomplete: 'name' });
  const cid = h('input', { placeholder: '고유번호 또는 아이디 (있으면)', maxlength: 16 });
  const body = h('textarea', { rows: 5, maxlength: 1000, placeholder: '예: 로그인이 안 돼요 / 아이디 비밀번호를 잊었어요' });
  const err = h('div.err', { role: 'alert' });
  const send = h('button.btn.big.primary', { type: 'submit' }, '보내기');
  sheet([h('div.grab'), h('h2', { style: { margin: '0 4px' } }, '운영진에게 문의하기'),
    h('form.stack.box', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        send.disabled = true;
        const key = cid.value.trim();
        const isNum = /^[0-9]{5,6}$/.test(key);
        try {
          await rpc('send_inquiry_public', { p_body: (key && !isNum ? `[아이디 ${key}] ` : '') + body.value, p_name: nm.value, p_student_id: isNum ? key : null }, { retries: 0 });
          closeOverlay();
          toast('보냈어요! 급하면 메인 부스로 와 주세요.', 4000);
        } catch (x) { err.textContent = errorText(x.message); send.disabled = false; }
      },
    }, h('small', '로그인이 안 되거나 궁금한 점을 적어 주세요. 운영진이 확인해요.'),
    h('label.field', h('span', '이름'), nm), h('label.field', h('span', '고유번호 / 아이디'), cid), body, err, send)]);
}

// 비밀번호를 잊었어요: ① 복구용 구글로 들어가서 새로 정하기 ② 구글이 없으면 학생은 초기화 요청, 아이디는 문의
export function forgotSheet(pre = {}) {
  sheet([
    h('div.grab'),
    h('h2', { style: { margin: '0 4px' } }, '비밀번호를 잊었어요'),
    h('section.box.stack',
      h('b', '① 복구용 구글을 연결해 뒀다면'),
      h('small', '연결한 구글로 로그인하면 내 계정으로 들어가고, 바로 새 비밀번호를 정할 수 있어요.'),
      h('button.btn.big.primary', { onclick: () => { sessionStorage.removeItem('linkGoogle'); sessionStorage.setItem('recover', '1'); closeOverlay(); renderLogin(); } }, '구글로 내 계정 찾기')),
    h('section.box.stack',
      h('b', '② 구글을 연결하지 않았다면'),
      h('small', '학생은 운영자에게 초기화를 요청해요. 운영자가 확인하고 허용하면 그때 정한 새 비밀번호로 바뀌어요. 아이디 계정은 문의하기로 알려 주세요.'),
      h('button.btn', { onclick: () => resetRequestSheet(pre.kind === 'number' ? pre.key : '') }, pix('school'), '학생: 운영자에게 초기화 요청'),
      h('button.btn', { onclick: () => inquiryPublicSheet() }, pix('memo'), '아이디 계정: 문의하기')),
  ]);
}

// 학생 비밀번호 초기화 요청 (허용되면 여기서 고른 새 비밀번호가 된다)
export function resetRequestSheet(prefill = '') {
  const err = h('div.err', { role: 'alert' });
  const cid = h('input', { placeholder: '고유번호 6자리', inputmode: 'numeric', maxlength: 6, value: prefill });
  const nm = h('input', { placeholder: '이름 (예: 홍길동)', maxlength: 20, autocomplete: 'name' });
  const pw = h('input', { type: 'password', placeholder: '새 비밀번호 (6자 이상)', autocomplete: 'new-password', maxlength: 72 });
  const pw2 = h('input', { type: 'password', placeholder: '새 비밀번호 한 번 더', autocomplete: 'new-password', maxlength: 72 });
  const note = h('input', { placeholder: '운영자에게 한마디 (선택)', maxlength: 300 });
  const send = h('button.btn.big.primary', { type: 'submit' }, '초기화 요청 보내기');
  sheet([
    h('div.grab'),
    h('h2', { style: { margin: '0 4px' } }, '비밀번호 초기화 요청'),
    h('form.stack.box', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (pw.value.length < 6) { err.textContent = '새 비밀번호는 6자 이상이에요.'; return; }
        if (pw.value !== pw2.value) { err.textContent = '두 칸의 새 비밀번호가 서로 달라요.'; return; }
        send.disabled = true;
        try {
          await rpc('request_password_reset', { p_student_id: cid.value.trim(), p_password: pw.value, p_name: nm.value, p_note: note.value }, { retries: 0 });
          closeOverlay();
          toast('요청을 보냈어요! 운영자가 허용하면 새 비밀번호로 로그인돼요. 메인 부스에 말하면 더 빨라요.', 6000);
        } catch (x) { err.textContent = errorText(x.message); send.disabled = false; }
      },
    },
    h('small', '운영자가 확인하고 허용하면, 지금 정한 새 비밀번호로 바뀌어요. 이 번호에 연결된 구글 계정은 모두 풀려요.'),
    h('label.field', h('span', '고유번호'), cid),
    h('label.field', h('span', '이름'), nm),
    h('label.field', h('span', '새 비밀번호'), withEye(pw)), withEye(pw2),
    note, err, send),
  ]);
}

export const GENS = [20, 21, 22];   // hint only; the server setting allowed_gens decides (0010)

// 첫 로그인: 이름 + 동의.
//  · 고유번호/아이디로 로그인했으면 이름만.
//  · 구글로 처음 들어왔으면: 학생 = 고유번호 + 비밀번호 (link_number), 비학생 = 아이디 + 비밀번호 (link_id) — 구글은 그 계정의 복구용이 된다.
export function renderRegister(info) {
  closeOverlay();
  const link = linkIntent();
  if (info.google && link) return renderLinkGoogle(link);
  if (info.google && sessionStorage.getItem('recover') === '1') return renderRecoverMiss();
  const fixed = info.code_id ? { kind: 'number', key: info.code_id } : info.login_id ? { kind: 'id', key: info.login_id } : null;
  const google = !!info.google && !fixed;
  let kind = fixed?.kind === 'id' ? 'id' : 'student';
  const err = h('div.err', { role: 'alert' });
  const help = h('div.stack');
  const sidIn = h('input', { placeholder: '고유번호 6자리 (예: 022001)', inputmode: 'numeric', maxlength: 6, value: info.school_id || '' });
  const idIn = h('input', { placeholder: '아이디 (영문으로 시작, 4~16자)', autocapitalize: 'off', spellcheck: 'false', maxlength: 16 });
  const pwIn = h('input', { type: 'password', placeholder: '비밀번호 (6자 이상)', autocomplete: 'new-password', maxlength: 72 });
  const nameIn = h('input', { placeholder: '이름 (예: 홍길동)', maxlength: 20, value: info.name || '', autocomplete: 'name' });
  const show = h('input', { type: 'checkbox', checked: true });
  const preview = h('b');
  const sidRow = h('label.field', h('span', '고유번호'), sidIn,
    h('small', info.school_id ? '학교 계정에서 고유번호를 가져왔어요.' : '20~22기만 참여할 수 있어요. 22기 1번 → 022001'));
  const idRow = h('label.field', h('span', '아이디'), idIn, h('small', '영문 소문자로 시작, 4~16자 (영문·숫자·_ )'));
  const pwRow = h('label.field', h('span', '비밀번호'), withEye(pwIn),
    h('small', '처음 쓰는 번호·아이디면 지금 정하는 비밀번호가 돼요. 이미 있으면 그 비밀번호를 넣어 주세요.'));
  const googleNote = h('small.muted', '이 구글 계정은 그 계정의 복구용으로 연결돼요. 다음부터 이 구글로 바로 들어올 수 있고, 비밀번호를 잊어도 이 구글로 다시 정할 수 있어요.');
  const seg = h('div.seg', { role: 'group', 'aria-label': '학생인가요' });
  const update = () => {
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === kind)));
    sidRow.hidden = !(kind === 'student' && !fixed);
    idRow.hidden = !(kind === 'id' && google);
    pwRow.hidden = googleNote.hidden = !google;
    const id = sidIn.value.replace(/\D/g, '');
    const gen = kind === 'student' && id.length >= 5 ? Number(id.padStart(6, '0').slice(0, 3)) : null;
    preview.textContent = gen && !GENS.includes(gen) ? `${gen}기는 참여할 수 없어요 (20~22기만)` : `${gen ? gen + '기 ' : ''}${maskName(nameIn.value)}`;
  };
  if (!fixed) {
    seg.append(
      h('button', { type: 'button', 'data-k': 'student', onclick: () => { kind = 'student'; update(); } }, '학생'),
      h('button', { type: 'button', 'data-k': google ? 'id' : 'guest', onclick: () => { kind = google ? 'id' : 'guest'; update(); } }, '비학생'));
  }
  sidIn.oninput = update; nameIn.oninput = update;
  const start = h('button.btn.big.primary', { type: 'submit' }, '시작하기');
  const sid = () => sidIn.value.replace(/\D/g, '').padStart(6, '0');

  // 구글 → 고유번호 연결 (reset = 학교 계정으로 비밀번호 새로 정하기)
  const linkNumber = async (reset = false) => {
    const res = await rpc('link_number', { p_student_id: sid(), p_password: pwIn.value, p_name: nameIn.value.trim(), p_show: show.checked, p_reset: reset }, { retries: 0 });
    if (res.error === 'WRONG_PASSWORD') {
      err.textContent = '이 번호는 이미 계정이 있어요. 비밀번호가 맞지 않아요.';
      help.replaceChildren(
        res.school && h('button.btn.gold', { type: 'button', onclick: () => {
          if (pwIn.value.length < 6) { err.textContent = '새 비밀번호를 6자 이상 적어 주세요.'; return; }
          if (!confirm('학교 계정으로 확인됐어요. 지금 입력한 비밀번호를 새 비밀번호로 정할까요? (다른 기기는 로그아웃되고, 이 번호에 연결된 다른 구글 계정은 풀려요)')) return;
          submit(true);
        } }, '학교 계정으로 비밀번호 새로 정하기'),
        h('button.btn.small.ghost', { type: 'button', onclick: () => resetRequestSheet(sid()) }, '비밀번호를 모르겠어요 (운영자에게 요청)'));
      return false;
    }
    if (res.mode === 'linked') await devLogin(res.email, pwIn.value);
    return true;
  };
  // 구글 → 아이디 연결 (처음 쓰는 아이디면 이 구글이 그 아이디 계정이 된다)
  const linkId = async () => {
    const res = await rpc('link_id', { p_id: idIn.value.trim().toLowerCase(), p_password: pwIn.value, p_name: nameIn.value.trim(), p_show: show.checked }, { retries: 0 });
    if (res.error === 'WRONG_PASSWORD') { err.textContent = '이미 있는 아이디예요. 비밀번호가 맞지 않아요.'; return false; }
    if (res.mode === 'linked') await devLogin(res.email, pwIn.value);
    return true;
  };
  const submit = async (reset = false) => {
    err.textContent = '';
    help.replaceChildren();
    const nm = nameIn.value.trim();
    if (!nm) { err.textContent = '이름을 입력해 주세요.'; return; }
    if (kind === 'student' && !fixed && !/^[0-9]{5,6}$/.test(sidIn.value.trim())) { err.textContent = '고유번호 6자리를 숫자로 입력해 주세요. (예: 022001)'; return; }
    if (kind === 'id' && google && !/^[a-z][a-z0-9_]{3,15}$/.test(idIn.value.trim().toLowerCase())) { err.textContent = '아이디는 영문으로 시작하는 4~16자예요.'; return; }
    if (google && pwIn.value.length < 6) { err.textContent = '비밀번호는 6자 이상이에요.'; return; }
    start.disabled = true;
    try {
      if (google) { if (!(await (kind === 'student' ? linkNumber(reset) : linkId()))) return; }
      else await rpc('register_profile', { p_kind: fixed ? (fixed.kind === 'number' ? 'student' : 'id') : kind, p_student_id: fixed?.kind === 'number' ? fixed.key : sidIn.value.trim(), p_name: nm, p_show: show.checked }, { retries: 0 });
      await afterLogin();
    } catch (x) {
      err.textContent = errorText(x.message);
      if (x.message === 'OLD_NUMBER_ACCOUNT') help.replaceChildren(h('button.btn.small.ghost', { type: 'button', onclick: () => resetRequestSheet(sid()) }, '비밀번호 초기화 요청하기'));
    } finally { start.disabled = false; }
  };
  const form = h('form.register', { onsubmit: (e) => { e.preventDefault(); submit(); } },
    h('div.box.stack',
      h('b', '처음 왔구나! 누구인지 알려줘'),
      fixed ? h('p', `${keyLabel(fixed)}(으)로 로그인했어요. 이름만 적어 주세요.`)
        : [seg, h('small', '비학생 = 선생님·학부모·다른 학교 손님 (랭킹 제외)')],
      sidRow,
      idRow,
      pwRow,
      h('label.field', h('span', '이름'), nameIn, google ? h('small', '이미 있는 계정이면 원래 이름이 그대로 쓰여요.') : null),
      h('label.check', show, h('span', '랭킹·대형 화면에 이렇게 보여요: ', preview, h('br'), h('small', '(체크를 풀면 "익명 트레이너". 나중에 설정에서 바꿀 수 있어요)'))),
      googleNote),
    h('div.box.stack.small-print',
      h('b', '저장하는 정보'),
      h('span', '고유번호(또는 아이디), 이름, 게임 기록(찍은 QR·몬스터·퀴즈). 위치(GPS)는 저장하지 않아요. 축제가 끝나고 2주 안에 모두 삭제해요. '),
      h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, '개인정보 처리방침'),
      h('span', '비학생은 랭킹(상품)에서 빠지고, 나머지는 똑같이 즐길 수 있어요.')),
    err,
    help,
    start,
    h('button.btn.small.ghost', { type: 'button', onclick: async () => { clearGoogleIntents(); await signOut(); await kv.clear(); S.snap = null; renderLogin(); } }, '다른 계정으로 로그인'));
  app().replaceChildren(h('div.login.register-screen', h('div.logo.logo-small', CONFIG.GAME_TITLE), form));
  update();
}

// 설정 → "복구용 구글 연결" 다음: 새 구글로 들어왔으면, 그 계정의 비밀번호를 한 번 더 넣어서 연결
export function renderLinkGoogle(link) {
  const pw = h('input', { type: 'password', placeholder: '그 계정의 비밀번호', autocomplete: 'current-password', maxlength: 72 });
  const err = h('div.err', { role: 'alert' });
  const go = h('button.btn.big.primary', { type: 'submit' }, '이 구글을 연결하기');
  const cancel = async () => { clearGoogleIntents(); await signOut(); renderLogin(); };
  app().replaceChildren(h('div.login.register-screen', h('div.logo.logo-small', CONFIG.GAME_TITLE),
    h('form.register', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (pw.value.length < 6) { err.textContent = '비밀번호는 6자 이상이에요.'; return; }
        go.disabled = true;
        try {
          const res = link.kind === 'number'
            ? await rpc('link_number', { p_student_id: link.key, p_password: pw.value }, { retries: 0 })
            : await rpc('link_id', { p_id: link.key, p_password: pw.value }, { retries: 0 });
          if (res.error === 'WRONG_PASSWORD') { err.textContent = '비밀번호가 맞지 않아요.'; return; }
          clearGoogleIntents();
          if (res.email) await devLogin(res.email, pw.value);
          toast('복구용 구글을 연결했어요! 다음부터 이 구글로도 들어올 수 있어요.', 4500);
          await afterLogin();
        } catch (x) { err.textContent = errorText(x.message); } finally { go.disabled = false; }
      },
    },
    h('div.box.stack',
      h('b', '복구용 구글 연결'),
      h('p', `${keyLabel(link)} 계정의 비밀번호를 넣으면 지금 로그인한 구글이 그 계정에 연결돼요.`),
      h('label.field', h('span', '비밀번호'), withEye(pw))),
    err, go,
    h('button.btn.small.ghost', { type: 'button', onclick: cancel }, '취소'))));
}

// "구글로 내 계정 찾기"를 했는데 이 구글은 아직 어떤 계정에도 연결돼 있지 않음
export function renderRecoverMiss() {
  app().replaceChildren(h('div.login.register-screen', h('div.logo.logo-small', CONFIG.GAME_TITLE),
    h('div.box.stack',
      h('b', '이 구글 계정은 연결된 게임 계정이 없어요'),
      h('p', '복구용으로 연결해 둔 다른 구글 계정이 있다면 그걸로 다시 해 보세요. 연결한 적이 없다면 학생은 운영자에게 초기화를 요청하고, 아이디 계정은 문의하기로 알려 주세요.'),
      h('button.btn.primary', { onclick: async () => { await signOut(); renderLogin(); } }, '다른 구글로 다시 하기'),
      h('button.btn', { onclick: async () => { clearGoogleIntents(); await signOut(); renderLogin(); resetRequestSheet(); } }, '학생: 초기화 요청'),
      h('button.btn.small.ghost', { onclick: async () => { clearGoogleIntents(); await signOut(); renderLogin(); } }, '처음으로'))));
}

export function renderInApp() {
  const kind = inAppBrowser();
  app().replaceChildren(h('div.login',
    h('div.logo', CONFIG.GAME_TITLE),
    h('div.box', { style: { maxWidth: '360px', textAlign: 'left' } },
      h('b', pix('warn'), '카카오톡/인스타 안에서 열렸어요'), h('br'),
      '여기서는 구글 로그인이 막혀 있어요. 크롬이나 Safari로 열어 주세요.',
      isIOS() && kind !== 'kakao' ? h('p', '오른쪽 아래(또는 위) ⋯ 버튼 → "Safari로 열기"를 눌러 주세요. ↘') : null),
    h('button.btn.big.primary', { onclick: () => { if (!escapeInApp()) toast('⋯ 메뉴에서 "Safari로 열기"를 눌러 주세요.', 5000); } }, '외부 브라우저로 열기'),
    h('button.btn.small.ghost', { onclick: () => navigator.clipboard?.writeText(location.href).then(() => toast('주소를 복사했어요. 브라우저에 붙여 넣으세요.')) }, '주소 복사'),
    h('button.btn.small.ghost', { onclick: () => renderLogin() }, '그래도 여기서 고유번호로 로그인')));
}
