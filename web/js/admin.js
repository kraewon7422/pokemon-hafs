// Operator (admin) page: dashboard, QR management + print sheet, monsters/quizzes, students, login codes, settings.
// Reads/writes catalog tables directly (RLS admin policies) and calls admin_* RPCs (supabase/migrations/0001_init.sql, 0003_review_fixes.sql).
import { CONFIG } from './config.js';
import { sb, rpc, errorText } from './sb.js';
import { h, $, toast, timeAgo } from './ui.js';
import { devLogin, idLogin, renderGoogleButton, signOut } from './auth.js';
import { drawQR, placeUrl } from './qrfmt.js';
import { spriteCanvas } from './sprites.js';

const SUBJECTS = ['국어', '수학', '영어', '과학', '사회', '외국어', '정보', '한국사', '음악', '체육', '전설'];
const RARITY = { common: '일반', rare: '희귀', legendary: '전설' };
const ROLE = { student: '학생', booth: '부스 스태프', admin: '운영자' };
const TSTATUS = { pending: ['대기', 'warn'], redeemed: ['사용', 'ok'], expired: ['만료', 'off'], cancelled: ['취소', 'off'] };
const SETTING_HELP = {
  festival_open: '게임 동작 ON/OFF (비상 스위치)',
  email_domains: '(0008부터 사용 안 함 — 모든 구글 계정 로그인 가능)',
  email_regex: '(0008부터 사용 안 함 — 학번은 첫 로그인 때 직접 입력)',
  admin_emails: '운영자 이메일 목록 (그 구글 계정으로 첫 로그인할 때 운영자가 됨)',
  booth_emails: '부스 스태프 이메일 목록 (구글 계정)',
  stage_points: '단계별 점수 [0, 1단계, 2단계, 3단계]',
  rarity_bonus: '희귀도별 보너스 점수',
  evo_prob: '진화 기본 확률 [0, 1→2, 2→3]',
  evo_pity_step: '실패할 때마다 오르는 확률',
  evo_pity_max: '이만큼 실패하면 다음엔 확정 진화',
  qr_daily_cap: '같은 QR을 하루에 찍을 수 있는 횟수',
  bag_max: '가방에 들어가는 티켓 최대 수',
  ticket_ttl_hours: '안 쓴 티켓이 만료되는 시간(시간)',
  token_grace_minutes: '토큰 교체 후 옛 토큰이 유효한 시간(분)',
  quiz_ticket_daily_cap: '하루에 퀴즈로 받을 수 있는 진화권 최대 수 (기본 30)',
  roulette_enabled: '진화권 룰렛 ON/OFF (true/false)',
  code_self_signup: '구글 없이 고유번호 + 비밀번호로 새 계정을 만들 수 있게 할지 ON/OFF',
  reset_requests_per_10min: '비밀번호 초기화 요청을 10분 동안 전체에서 최대 몇 개 받을지 (장난 방지, 기본 30)',
  raid_slots: '시간대 전설 레이드: [{"line":38,"from":"09:00","until":"11:00"}, …] — 라인 38 소디포(아침)·39 유리프(점심)·40 TTU(저녁). TV 화면이 이 시간에 자동으로 레이드를 열어요',
  raid_slot_hp: '시간대 전설 레이드 보스 체력', raid_slot_minutes: '시간대 전설 레이드 한 판 길이(분)', raid_cooldown_min: '시간대 레이드가 끝나고 다음 판까지(분)',
  raid_tap_cap: '레이드: 1초에 인정하는 탭 수 (오토클릭 방지)', raid_min_taps: '레이드 보상 받으려면 최소 탭 수',
  dex_rewards: '도감 보상: {"50": 41, "100": 42} = 도감 50% → 과연기, 100% → 창문기 (특별 티켓)',
  roulette_777_per_mille: '이스터에그: 룰렛 꽝 1000번 중 몇 번을 777(럭키 세븐 칭호)로 바꿀지 (기본 10 = 1%)',
  code_signup_per_10min: '학번 코드 계정을 10분 동안 전체에서 최대 몇 개 만들 수 있는지 (번호 선점 방지, 기본 60)',
  allowed_gens: '참여할 수 있는 기수 목록 (예: [20, 21, 22]). 이 밖의 학번은 가입·코드 생성이 거절되고 TV 기수 대항전에도 안 나와요. 매년 바꿔 주세요',
  dev_login: '개발용 테스트 로그인(아무 이메일, 비밀번호 1234abcd!) — 실전 서버에서는 반드시 false',
  roulette_every_min: '룰렛을 한 번 돌린 뒤 다음까지 기다리는 시간(분, 기본 5)',
  roulette_daily_max: '한 사람이 하루에 돌릴 수 있는 룰렛 횟수 (기본 12)',
  roulette_odds: '룰렛 칸 [진화권 수, 가중치] 목록. 기본 [[0,60],[1,30],[3,8],[5,2]] = 꽝60% 1장30% 3장8% 5장2%',
  battle_stage_mult: '배틀용 단계별 능력치 배율 (아직 안 씀)',
  rotating_window_sec: '대형 화면 QR이 바뀌는 간격(초)',
  rotating_accept_sec: '대형 화면 QR을 찍은 뒤 인정되는 시간(초). 짧을수록 사진 공유가 어려워요',
  self_redeem: '셀프 지급 모드 (위 스위치로 바꾸세요)',
  festival_close_at: '축제 종료 시각 — 예: "2026-11-07T16:00:00+09:00" (따옴표 포함), 없으면 null',
  min_client_version: '앱 최소 버전 숫자. 올리면 옛 버전 폰에 "업데이트" 배너가 떠요',
  lv_from_battle: '레벨: 배틀 경험치로 레벨이 오르게 할지 ON/OFF (true/false)',
  lv_from_raid: '레벨: 레이드에 참가하면 쓴 몬스터 레벨이 오르게 할지 ON/OFF',
  lv_from_places: '레벨: 하루에 서로 다른 장소 QR을 여러 곳 찍으면 배틀 팀 레벨 +1 ON/OFF',
  lv_places_n: '레벨: 서로 다른 장소 몇 곳마다 배틀 팀 +1 할지 (기본 3)',
  lv_from_catch: '레벨: 같은 선생님 몬스터를 또 잡으면 +1 ON/OFF',
  raid_levels: '레벨: 레이드 한 판 참가로 오르는 레벨 수 (기본 1)',
  exp_need_mul: '경험치: 레벨 L → L+1 에 필요한 경험치 = 이 값 × L (기본 8, 크면 레벨이 느리게 오름)',
  exp_battle_mul: '경험치: 배틀 한 판 = 이 값 × 상대 평균 레벨 (기본 4)',
  exp_practice: '경험치: 연습 배틀 배율 (기본 0.5)', exp_lose: '경험치: 졌을 때 배율 (기본 0.4)',
  drop_place: '물건: 장소 QR을 찍으면 물건이 나올 확률 (기본 0.3 = 30%)', drop_quiz: '물건: 퀴즈 정답 때 확률 (기본 0.4)',
  drop_battle: '물건: 친구·실시간 배틀 승리 때 확률 (기본 0.5)', drop_practice: '물건: 연습 배틀 승리 때 확률 (기본 0.15)',
  drop_raid_tm: '물건: 레이드 승리 때 특별 기술머신 확률 (기본 0.3, 이상한사탕은 항상)',
  battle_item_max: '배틀: 한 배틀에 쓸 수 있는 회복약 수 (기본 2)', battle_turn_cap: '배틀: 이 턴이 지나면 남은 체력 비율로 승부 (기본 20)',
  battle_fields: '배틀 시간표: [{"from":"12:00","to":"13:30","name":"점심시간","types":["음악","체육"]}, …] — 그 시간에 시작한 배틀은 그 타입 기술이 강해져요',
  battle_field_mult: '배틀 시간표: 강해지는 배율 (기본 1.3)',
};
const TABS = [
  ['dash', '현황판'], ['qr', 'QR 관리'], ['print', 'QR 인쇄'], ['mon', '몬스터·퀴즈'], ['stu', '학생'], ['code', '로그인 코드'], ['raid', '레이드'], ['req', '요청'], ['staff', '운영진'], ['set', '설정'],
];
const CODE_BATCH = 700;   // admin_make_login_codes accepts at most 700 ids per call

const S = {
  view: 'boot', booting: false, me: null, email: '', tab: 'dash', renderId: 0,
  lines: [], species: [], lineById: new Map(), spById: new Map(),
  qrs: [], qrById: new Map(), secrets: new Map(), rewards: [],
  stats: null, statsFailed: false, grace: 30, dailyCap: 3, selQr: null, selLine: null, stuQuery: '', stuSel: null,
  codes: null, codesSaved: true,   // last generated login codes (shown once, kept only in this tab)
};

// atlas capacity (how many dex numbers have a picture) — a new line needs tools/build_atlas.py
const atlasCap = new Promise((resolve) => {
  const im = new Image();
  im.onload = () => resolve(Math.floor(im.naturalWidth / 64) * Math.floor(im.naturalHeight / 64));
  im.onerror = () => resolve(0);
  im.src = 'sprites/atlas.png';
});
let ATLAS_CAP = 9999;
atlasCap.then((n) => { ATLAS_CAP = n; });

// ───────────────────────── helpers ─────────────────────────

const PG = {
  '23505': '이미 있는 값이에요 (중복).',
  '23514': '허용되지 않는 값이에요 (규칙 위반).',
  '23503': '연결된 데이터가 없거나, 다른 데이터가 쓰고 있어요.',
  '23502': '빈 칸을 채워 주세요.',
  '42501': '권한이 없어요 (운영자만 가능).',
  '22P02': '형식이 잘못됐어요.',
  PGRST301: '로그인이 만료됐어요. 다시 로그인해 주세요.',
};
// table query → data, or throws Error with a Korean message ready to show
async function tq(builder) {
  let res;
  try { res = await builder; } catch { throw Object.assign(new Error(errorText('OFFLINE')), { ready: true }); }
  if (res.error) {
    const e = res.error;
    const offline = /fetch|network/i.test(e.message || '');
    const msg = offline ? errorText('OFFLINE') : PG[e.code] || `오류가 났어요 (${e.message || e.code})`;
    throw Object.assign(new Error(msg), { ready: true });
  }
  return res.data;
}
const msgOf = (e) => {
  if (e?.ready) return e.message;
  const m = e?.message || String(e);
  if (/duplicate key/i.test(m)) return PG['23505'];
  if (/check constraint|violates/i.test(m)) return PG['23514'];
  return ADMIN_ERR[m] || errorText(m);
};
// admin-only server error codes (0003/0005) not in sb.js
const ADMIN_ERR = {
  NO_ACCOUNT: '그 이메일로 로그인한 적이 없어요. 학생이 새 로그인으로 한 번 로그인을 시도하게 하거나, [로그인 코드] 탭에서 코드를 먼저 만드세요.',
  ACCOUNT_IN_USE: '그 로그인에는 이미 게임 기록(도감·티켓)이 있어요. 옮길 수 없어요.',
  NO_LINE: '없는 몬스터 계열이에요.',
  TOO_MANY: '한 번에 너무 많이 보냈어요.',
};
function fail(e) { console.warn('[admin]', e); toast(msgOf(e), 4000); }

// run an async action while a button shows it is busy
async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); } catch (e) { fail(e); return undefined; } finally { if (btn) btn.disabled = false; }
}

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
const hhmm = (iso) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const minsAgo = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 60000 : Infinity);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function typeChip(subject) {
  const el = h('span.type', subject || '?');
  if (subject) el.classList.add('t-' + subject.replace(/\s+/g, ''));
  return el;
}
const chip = (text, cls = '') => h('span.chip' + (cls ? '.' + cls : ''), text);
const lineName = (id) => {
  const l = S.lineById.get(id);
  return l ? `#${id} ${l.teacher} (${l.subject})` : `#${id}`;
};
// [[subject, lines[]], …] in SUBJECTS order (unknown subjects last, alphabetical)
function bySubject(lines) {
  const groups = new Map();
  for (const l of lines) {
    if (!groups.has(l.subject)) groups.set(l.subject, []);
    groups.get(l.subject).push(l);
  }
  const order = (s) => { const i = SUBJECTS.indexOf(s); return i < 0 ? 99 : i; };
  return [...groups].sort((a, b) => order(a[0]) - order(b[0]) || String(a[0]).localeCompare(String(b[0]), 'ko'));
}
// line <select> grouped by subject (optgroups) — the roster is 30+ lines
function lineSelect(lines, selected = null) {
  return h('select.inp', bySubject(lines).map(([subject, ls]) => h('optgroup', { label: subject },
    ls.map((l) => h('option', { value: l.id, selected: l.id === selected },
      lineName(l.id) + (l.active ? '' : ' [비활성]') + (l.withdrawn ? ' [동의 철회]' : ''))))));
}
function sprite(dex, size = 64) {
  if (dex > ATLAS_CAP) return h('div.nopic', '그림 없음', h('br'), '(아틀라스 재생성 필요)');
  return spriteCanvas(dex, size);
}
const field = (label, input, cls = '') => h('label.fld' + (cls ? '.' + cls : ''), h('span', label), input);
const checkbox = (label, checked) => {
  const i = h('input', { type: 'checkbox', checked: !!checked });
  return { el: h('label.chk', i, label), input: i };
};

// in-page modal. buttons: [{label, cls, value, onClick}] — onClick may return false to keep the modal open.
function modal(title, body, buttons) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    let ov;
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const close = (v) => { ov.remove(); document.removeEventListener('keydown', onKey); prev?.focus?.(); resolve(v); };
    const btns = buttons.map((b) => {
      const el = h('button.btn' + (b.cls ? '.' + b.cls : ''), { type: 'button' }, b.label);
      el.addEventListener('click', async () => {
        if (!b.onClick) return close(b.value);
        btns.forEach((x) => { x.disabled = true; });
        let r;
        try { r = await b.onClick(); } catch (e) { fail(e); r = false; }
        btns.forEach((x) => { x.disabled = false; });
        if (r !== false) close(r === undefined ? b.value : r);
      });
      return el;
    });
    ov = h('div.modal-ov', { onmousedown: (e) => { if (e.target === ov) close(null); } },
      h('div.box.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', title), body, h('div.modal-btns', btns)));
    document.body.append(ov);
    document.addEventListener('keydown', onKey);
    (ov.querySelector('input:not([type=radio]):not([type=checkbox]),textarea,select') || btns.at(-1)).focus();
  });
}

async function confirmBox(title, lines, { ok = '확인', danger = false, typeToConfirm = null } = {}) {
  const input = typeToConfirm ? h('input.inp', { autocomplete: 'off', placeholder: typeToConfirm }) : null;
  const body = h('div', [].concat(lines).map((t) => (t instanceof Node ? t : h('p', t))),
    input && field(`확인하려면 "${typeToConfirm}"를 똑같이 입력하세요`, input));
  const v = await modal(title, body, [
    { label: '취소', value: false },
    {
      label: ok, cls: danger ? 'primary' : 'go', value: true,
      onClick: () => {
        if (input && input.value.trim() !== typeToConfirm) { toast('입력한 값이 달라요.'); input.classList.add('bad'); return false; }
        return true;
      },
    },
  ]);
  return v === true;
}

// ───────────────────────── data loading ─────────────────────────

async function loadCatalog() {
  const [lines, species, sets] = await Promise.all([
    tq(sb.from('lines').select('*').order('id')),
    tq(sb.from('species').select('*').order('id')),
    tq(sb.from('settings').select('key,value').in('key', ['token_grace_minutes', 'qr_daily_cap'])),
  ]);
  S.lines = lines; S.species = species;
  S.lineById = new Map(lines.map((l) => [l.id, l]));
  S.spById = new Map(species.map((s) => [s.id, s]));
  const set = Object.fromEntries(sets.map((r) => [r.key, r.value]));
  if (set.token_grace_minutes != null) S.grace = Number(set.token_grace_minutes) || 30;
  if (set.qr_daily_cap != null) S.dailyCap = Number(set.qr_daily_cap) || S.dailyCap;
}
const maxStage = (l) => Math.min(3, Math.max(1, Number(l?.max_stage) || 3));
const isOn = (v) => v === true || v === 'true';
const isGuest = (sid) => String(sid || '').startsWith('g:');   // teacher/guest login-code profile (no 기수)

async function loadQrData() {
  const [qrs, secrets, rewards] = await Promise.all([
    tq(sb.from('qr_points').select('*').order('id')),
    tq(sb.from('qr_secrets').select('qr_id,token,manual_code,created_at').is('revoked_at', null).order('created_at')),
    tq(sb.from('qr_rewards').select('qr_id,line_id,weight').order('line_id')),
  ]);
  S.qrs = qrs; S.rewards = rewards;
  S.qrById = new Map(qrs.map((q) => [q.id, q]));
  S.secrets = new Map(secrets.map((s) => [s.qr_id, s]));   // ordered by created_at → newest wins
}

// ───────────────────────── boot / login ─────────────────────────

const app = $('#app');

async function boot() {
  if (S.booting) return;
  S.booting = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return showLogin();
    let prof;
    try { prof = await rpc('ensure_profile'); } catch (e) { return showLogin(errorText(e.message), true); }
    if (prof?.role !== 'admin') return showDenied(session.user.email);
    S.me = prof; S.email = session.user.email || '';
    await showApp();
  } finally { S.booting = false; }
}

sb.auth.onAuthStateChange((ev) => {
  if (ev === 'SIGNED_IN' && S.view === 'login') setTimeout(boot, 0);
  if (ev === 'SIGNED_OUT' && S.view !== 'login') { S.me = null; showLogin(); }
});

async function logout() {
  S.me = null;
  await signOut();
  showLogin();
}

function showLogin(errMsg = '', withLogout = false) {
  S.view = 'login';
  const err = h('p.err', { role: 'alert' }, errMsg);
  const google = h('div');
  const idIn = h('input.inp', { autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', placeholder: '운영진 아이디', required: true });
  const idPw = h('input.inp', { type: 'password', autocomplete: 'current-password', required: true });
  const idBtn = h('button.btn.go', { type: 'submit' }, '아이디로 로그인');
  const idForm = h('form.stack', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      idBtn.disabled = true;
      try { await idLogin(idIn.value, idPw.value); await boot(); } catch (x) { err.textContent = x.message; } finally { idBtn.disabled = false; }
    },
  }, field('운영진 아이디', idIn), field('비밀번호', idPw), idBtn);
  const box = h('div.box',
    h('h1', `${CONFIG.GAME_TITLE} 운영자`),
    h('p.muted', '운영자에게 받은 운영진 아이디로 로그인하세요.'),
    err,
    idForm,
    h('p.small-txt.muted', '구글 이메일로 등록된 운영진은 구글로 로그인해도 돼요.'),
    google);
  if (CONFIG.DEV_LOGIN) {
    const email = h('input.inp', { type: 'email', autocomplete: 'username', placeholder: 'admin@staff.test', required: true });
    const pw = h('input.inp', { type: 'password', autocomplete: 'current-password', required: true });
    const btn = h('button.btn.go', { type: 'submit' }, '테스트 계정 로그인');
    const form = h('form.stack', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        btn.disabled = true;
        try { await devLogin(email.value.trim(), pw.value); await boot(); } catch (x) { err.textContent = '로그인 실패: ' + x.message; } finally { btn.disabled = false; }
      },
    }, h('p.small-txt.muted', '테스트용 로그인 (스테이징 전용)'), field('이메일', email), field('비밀번호', pw), btn);
    box.append(form);
  }
  if (withLogout) box.append(h('button.btn.small', { onclick: logout }, '로그아웃'));
  app.replaceChildren(h('div.login', box));
  renderGoogleButton(google, (m) => { err.textContent = m; }).catch((e) => { err.textContent = e.message; });
}

function showDenied(email) {
  S.view = 'denied';
  app.replaceChildren(h('div.login', h('div.box',
    h('h1', '운영자 계정이 아니에요'),
    h('p', `${email || ''} 계정은 운영자 권한이 없어요.`),
    h('p.muted', '운영자에게 권한을 받거나 다른 계정으로 로그인하세요.'),
    h('button.btn.primary', { onclick: logout }, '로그아웃'))));
}

// ───────────────────────── app shell ─────────────────────────

async function showApp() {
  S.view = 'app';
  const nav = h('nav.tabs', { role: 'tablist', 'aria-label': '운영 메뉴' },
    TABS.map(([id, label]) => h('button', { type: 'button', role: 'tab', 'data-tab': id, onclick: () => go(id) }, label)));
  app.replaceChildren(
    h('header.top',
      h('h1', `${CONFIG.GAME_TITLE} · 운영자`),
      h('span.spacer'),
      h('span.who', S.email),
      h('button.btn.small', { onclick: logout }, '로그아웃')),
    h('div#festival-banner', { role: 'alert' }, '⚠ 게임 정지 중 — festival_open이 꺼져 있어요 (설정 탭에서 켤 수 있어요)'),
    h('div#self-banner', { role: 'status' }, '셀프 지급 모드 켜짐 — 학생이 앱에서 직접 몬스터를 받고 있어요 (설정 탭에서 끌 수 있어요)'),
    nav,
    h('main#main', h('p.loading', '불러오는 중…')));
  try { await loadCatalog(); } catch (e) { fail(e); }
  const want = location.hash.slice(1);
  go(TABS.some(([id]) => id === want) ? want : 'dash');
  rpc('admin_stats').then((s) => { S.stats = s; setBanner(s.festival_open, s.self_redeem); }, () => {});
}

// selfRedeem undefined = leave that banner as it is
function setBanner(open, selfRedeem) {
  const b = $('#festival-banner');
  if (b) b.classList.toggle('on', open === false || open === 'false');
  const sr = $('#self-banner');
  if (sr && selfRedeem !== undefined) sr.classList.toggle('on', isOn(selfRedeem));
}

const RENDER = { dash: tabDash, qr: tabQr, print: tabPrint, mon: tabMon, stu: tabStu, code: tabCodes, raid: tabRaid, req: tabReq, staff: tabStaff, set: tabSet };

async function go(tab) {
  S.tab = tab;
  const id = ++S.renderId;
  history.replaceState(null, '', '#' + tab);
  document.querySelectorAll('nav.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  const main = $('#main');
  main.replaceChildren(h('p.loading', '불러오는 중…'));
  try {
    const nodes = await RENDER[tab]();
    if (id !== S.renderId) return;            // user switched tabs meanwhile
    main.replaceChildren(...[].concat(nodes));
  } catch (e) {
    if (id !== S.renderId) return;
    console.warn(e);
    main.replaceChildren(h('div.box', h('p.warn-txt', msgOf(e)), h('button.btn.small', { onclick: () => go(tab) }, '다시 시도')));
  }
}
const rerender = () => go(S.tab);

// ───────────────────────── 1. 현황판 ─────────────────────────

async function tabDash() {
  await refreshStats(false);
  return h('div#dash', dashBody());
}

// 전설 출현: rotating QRs appear on the TV (screen.html) only while switched on here
// 현황판: 교장·교감 선생님 TV 레이드 바로 시작 (0013). 시간대 전설(아침·점심·저녁)은 TV 화면이 알아서 열어요.
function legendCard() {
  const quick = (sp, label) => {
    const btn = h('button.btn.go', `${label} 레이드 시작`);
    btn.onclick = () => busy(btn, async () => {
      if (!confirm(`${label} 레이드를 TV 대형 화면에 띄울까요? (체력 30,000 · 10분)`)) return;
      await rpc('admin_create_raid', { p_species: sp, p_hp: 30000, p_minutes: 10, p_tv: true, p_title: `${label} 선생님 레이드`, p_kind: 'legend' });
      toast(`${label} 레이드를 열었어요. TV 화면에 QR이 떠요.`);
    });
    return h('div.stack', spriteImg(sp), btn);
  };
  return h('div.box.stack',
    h('h2', '⚡ 전설 레이드 (TV 대형 화면)'),
    h('p.small-txt.muted', '누르면 TV에 보스와 30초마다 바뀌는 참가 QR이 떠요. 학생들이 찍고 다 같이 탭해서 쓰러뜨리면 모두 전설 티켓을 받아요. 자세한 설정은 "레이드" 탭.'),
    h('div.row', quick(106, '교장'), quick(103, '교감')));
}

async function refreshStats(redraw = true) {
  try {
    S.stats = await rpc('admin_stats');
    S.game = await rpc('admin_game_stats').catch(() => S.game);   // 오늘 배틀·레이드·진화권 (0019)
    S.statsFailed = false;
  } catch (e) {
    if (!S.statsFailed) fail(e);               // toast once per failure streak
    S.statsFailed = true;
    if (!S.stats) throw e;
  }
  setBanner(S.stats.festival_open, S.stats.self_redeem);
  const el = $('#dash');
  if (redraw && el && S.tab === 'dash') el.replaceChildren(...dashBody());
}

setInterval(() => {
  if (S.view === 'app' && S.tab === 'dash' && document.visibilityState === 'visible') refreshStats();
}, 10_000);
document.addEventListener('visibilitychange', () => {
  if (S.view === 'app' && S.tab === 'dash' && document.visibilityState === 'visible') refreshStats();
});

function tile(label, value, sub = '', cls = '') {
  return h('div.box.tile' + (cls ? '.' + cls : ''), h('div.lbl', label), h('div.num', value ?? '–'), sub && h('div.sub', sub));
}

function dashBody() {
  const s = S.stats;
  const t = s.tickets || {};
  const ev = s.evolve || { tries: 0, success: 0 };
  const open = !(s.festival_open === false || s.festival_open === 'false');
  const selfOn = isOn(s.self_redeem);
  const qrs = s.qrs || [];
  const noPool = (q) => q.active && q.pool_size != null && Number(q.pool_size) === 0;
  const alerts = (q) => {
    const a = [];
    if (noPool(q)) a.push(chip('몬스터 미설정', 'hot'));
    if (q.active && minsAgo(q.last_scan) > 45) a.push(chip('점검 필요', 'warn'));
    if (q.scans_10m >= 15) a.push(chip('급증·사진공유 의심', 'hot'));
    return a;
  };
  const nCheck = qrs.filter((q) => q.active && minsAgo(q.last_scan) > 45).length;
  const nHot = qrs.filter((q) => q.scans_10m >= 15).length;
  const emptyPool = qrs.filter(noPool);

  const tiles = h('div.tiles',
    tile('게임 상태', open ? 'ON' : 'OFF', open ? '운영 중' : '정지됨 (설정 탭)', open ? 'good' : 'alert'),
    tile('셀프 지급', selfOn ? 'ON' : 'OFF', selfOn ? '셀프 지급 모드 켜짐' : '부스에서만 지급', selfOn ? 'alert' : ''),
    tile('몬스터 미설정 QR', emptyPool.length, '활성인데 풀이 비어 있음', emptyPool.length ? 'alert' : ''),
    tile('학생 수', s.students),
    tile('5분 내 접속', s.active_5m),
    tile('티켓 대기', t.pending || 0, 'pending'),
    tile('티켓 사용', t.redeemed || 0, 'redeemed'),
    tile('티켓 만료', t.expired || 0, t.cancelled ? `취소 ${t.cancelled}` : 'expired'),
    tile('진화 성공률', ev.tries ? `${pct(ev.success, ev.tries)}%` : '–', `${ev.success}/${ev.tries}회`),
    tile('1시간 오류', s.errors_1h, '앱 오류 보고', s.errors_1h > 0 ? 'alert' : ''));

  const chart = h('div.box',
    h('div.row', h('h2', '10분 단위 스캔 / 사용'), h('span.spacer', { style: { flex: 1 } }),
      h('div.legend', h('span', h('i', { style: { background: 'var(--sky)' } }), '스캔'), h('span', h('i', { style: { background: 'var(--green)' } }), '부스 사용'))),
    h('div', { html: chartSVG(s.scans_series || []) }),
    h('p.small-txt.muted', `마지막 갱신 ${hhmm(s.at)} · 10초마다 자동 갱신 (이 탭을 보고 있을 때만)`));

  const qrTable = h('div.box',
    h('div.row', h('h2', `QR 상태 (${qrs.length}개)`),
      emptyPool.length ? chip(`몬스터 미설정 ${emptyPool.length}`, 'hot') : null,
      nCheck ? chip(`점검 필요 ${nCheck}`, 'warn') : null, nHot ? chip(`급증 ${nHot}`, 'hot') : null),
    h('p.small-txt.muted', '몬스터 미설정 = 몬스터 풀이 비어 있음(그 QR 티켓은 부스에서 취소돼요 — QR 관리에서 풀을 채우세요) · 점검 필요 = 45분 넘게 아무도 안 찍음(떨어졌거나 가려졌을 수 있음) · 급증 = 10분에 15회 이상(사진 공유 의심)'),
    h('div.tbl-wrap.scroll-y', h('table.tbl',
      h('thead', h('tr', h('th', 'ID'), h('th', '이름'), h('th', '상태'), h('th.num', '오늘'), h('th.num', '10분'), h('th.num', '대기'), h('th', '마지막 스캔'), h('th', '알림'))),
      h('tbody', qrs.map((q) => h('tr',
        h('td.mono', q.id), h('td', q.name),
        h('td', q.active ? chip('활성', 'ok') : chip('꺼짐', 'off'), q.kind === 'rotating' ? chip('대형화면', 'blue') : null),
        h('td.num', q.scans_today), h('td.num', q.scans_10m), h('td.num', q.pending),
        h('td', q.last_scan ? timeAgo(q.last_scan) : '없음'),
        h('td', alerts(q))))))));

  const staff = s.staff || [];
  const staffBox = h('div.box',
    h('h2', '스태프 기기'),
    h('p.small-txt.muted', '3분 넘게 소식이 없으면 빨간색 = 부스 오프라인 의심'),
    staff.length ? h('div.tbl-wrap', h('table.tbl',
      h('thead', h('tr', h('th', '계정'), h('th', '역할'), h('th', '마지막 접속'))),
      h('tbody', staff.map((p) => {
        const late = minsAgo(p.last_seen) > 3;
        return h('tr', h('td.mono', p.student_id), h('td', ROLE[p.role] || p.role),
          h('td', h('span', { class: late ? 'warn-txt' : 'ok-txt' }, p.last_seen ? timeAgo(p.last_seen) : '기록 없음')));
      })))) : h('p.muted', '스태프 계정이 없어요.'));

  const quiz = (s.quiz || []).slice().sort((a, b) => a.line_id - b.line_id);
  const quizBox = h('div.box',
    h('h2', '퀴즈 정답률 (계열별)'),
    quiz.length ? h('div.tbl-wrap', h('table.tbl',
      h('thead', h('tr', h('th', '계열'), h('th.num', '푼 수'), h('th.num', '정답'), h('th', '정답률'))),
      h('tbody', quiz.map((z) => {
        const r = pct(z.correct, z.answered);
        return h('tr', h('td', lineName(z.line_id)), h('td.num', z.answered), h('td.num', z.correct),
          h('td', h('div.bar.mini-bar', h('i', { style: { width: r + '%' } })), ` ${r}%`));
      })))) : h('p.muted', '아직 푼 퀴즈가 없어요.'));

  const errs = s.errors_recent || [];
  const errBox = h('div.box',
    h('h2', '최근 앱 오류'),
    errs.length ? h('div.tbl-wrap', h('table.tbl',
      h('thead', h('tr', h('th', '시각'), h('th', '내용'))),
      h('tbody', errs.map((e) => h('tr', h('td', { style: { whiteSpace: 'nowrap' } }, fmtTime(e.at)), h('td.small-txt', e.msg)))))) : h('p.muted', '오류 없음 👍'));

  const notices = [
    selfOn ? h('p.notice.red', h('b', '셀프 지급 모드 켜짐'), ' — 학생이 부스에 오지 않고 앱에서 직접 몬스터를 받아요. 부스가 한가해지면 설정 탭에서 꺼 주세요.') : null,
    emptyPool.length ? h('p.notice.red', h('b', `몬스터 미설정 QR ${emptyPool.length}개: `), emptyPool.map((q) => `${q.id} ${q.name}`).join(', '),
      ' — 이 QR로 받은 티켓은 부스에서 취소돼요. QR 관리 탭에서 몬스터 풀을 채우세요.') : null,
  ].filter(Boolean);

  // 오늘(한국 시간)의 게임 숫자 (0019 admin_game_stats)
  const g = S.game;
  const game = g && h('div.box.stack',
    h('h2', '오늘의 게임'),
    h('div.tiles',
      tile('배틀', (g.battles.cpu || 0) + (g.battles.team || 0) + (g.battles.pvp || 0),
        `연습 ${g.battles.cpu} · 친구팀 ${g.battles.team} · 실시간 ${g.battles.pvp} · 2대2 ${g.battles.double}`),
      tile('배틀한 학생', g.battles.players),
      tile('지금 실시간 대전', g.pvp_live),
      tile('배틀 승리 보상', g.battle_wins, '진화권 1장씩'),
      tile('레이드', g.raids.active, `진행 중 · 오늘 승리 ${g.raids.won} · 실패 ${g.raids.failed}`, g.raids.active ? 'good' : ''),
      tile('레이드 참가', g.raids.players, '오늘 참가한 학생'),
      tile('나간 진화권', (g.tickets.quiz || 0) + (g.tickets.roulette || 0) + (g.tickets.battle || 0),
        `퀴즈 ${g.tickets.quiz} · 룰렛 ${g.tickets.roulette} · 배틀 ${g.tickets.battle}`),
      tile('오늘 진화', g.evolve.success, `${g.evolve.tries}번 시도`)));

  return [...notices, legendCard(), tiles, game, chart, h('div.cols', h('div', qrTable), h('div', staffBox, quizBox, errBox))];
}

function chartSVG(series) {
  const W = 1100, H = 220, L = 34, R = 8, T = 12, B = 24;
  const n = Math.max(1, series.length);
  const max = Math.max(1, ...series.flatMap((d) => [d.scans, d.redeems]));
  const bw = (W - L - R) / n;
  const y = (v) => T + (H - T - B) * (1 - v / max);
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="10분 단위 스캔과 부스 사용 수">`;
  for (const v of [0, Math.round(max / 2), max]) {
    out += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#dde3ea" stroke-width="1"/>`;
    out += `<text x="${L - 4}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  series.forEach((d, i) => {
    const x = L + i * bw;
    const w = Math.max(2, bw * 0.38);
    const sc = Number(d.scans) || 0, rd = Number(d.redeems) || 0;
    const t = hhmm(d.t);
    out += `<rect x="${x + bw * 0.1}" y="${y(sc)}" width="${w}" height="${y(0) - y(sc)}" fill="#4aa8e0" stroke="#303848" stroke-width="1"><title>${t} 스캔 ${sc}</title></rect>`;
    out += `<rect x="${x + bw * 0.1 + w}" y="${y(rd)}" width="${w}" height="${y(0) - y(rd)}" fill="#48b048" stroke="#303848" stroke-width="1"><title>${t} 사용 ${rd}</title></rect>`;
    if (i % 3 === 0) out += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${t}</text>`;
  });
  return out + '</svg>';
}

// ───────────────────────── 2. QR 관리 ─────────────────────────

async function tabQr() {
  await loadQrData();
  if (S.selQr && !S.qrById.has(S.selQr)) S.selQr = null;
  const listBox = h('div');
  const editBox = h('div');
  const drawList = () => listBox.replaceChildren(qrList(() => { drawList(); drawEdit(); }));
  const drawEdit = () => editBox.replaceChildren(...qrEditor(refresh));
  const refresh = async () => { await loadQrData(); drawList(); drawEdit(); };
  drawList(); drawEdit();
  return h('div.cols', h('div', createQrForm(refresh), listBox), editBox);
}

function createQrForm(refresh) {
  const id = h('input.inp.mono', { placeholder: '예: A26', maxlength: 6, autocomplete: 'off' });
  const name = h('input.inp', { placeholder: '예: 도서관 입구' });
  const hint = h('input.inp', { placeholder: '학생에게 보이는 힌트 (선택)' });
  const kind = h('select.inp', h('option', { value: 'static' }, '고정 QR (인쇄해서 붙임)'), h('option', { value: 'rotating' }, '대형 화면 QR (30초마다 바뀜)'));
  const btn = h('button.btn.go', { type: 'submit' }, 'QR 만들기');
  return h('details.box.create',
    h('summary', '+ 새 QR 만들기'),
    h('form.stack', {
      onsubmit: (e) => {
        e.preventDefault();
        const qid = id.value.trim().toUpperCase();
        if (!/^[A-Z0-9]{2,6}$/.test(qid)) { toast('ID는 영어 대문자·숫자 2~6글자예요.'); id.classList.add('bad'); return; }
        if (!name.value.trim()) { toast('이름을 입력하세요.'); name.classList.add('bad'); return; }
        busy(btn, async () => {
          const r = await rpc('admin_create_qr', { p_id: qid, p_name: name.value.trim(), p_hint: hint.value.trim(), p_kind: kind.value });
          toast(`${qid} 만들었어요. 수동 코드 ${r.manual_code} · 몬스터 풀을 꼭 채우세요!`, 5000);
          id.value = name.value = hint.value = '';
          S.selQr = qid;
          await refresh();
        });
      },
    },
    h('div.fields', field('ID (영대문자·숫자 2~6)', id), field('이름', name), field('힌트', hint, 'full'), field('종류', kind, 'full')),
    h('div.row.end', btn)));
}

function qrList(onSelect) {
  const poolCount = (id) => S.rewards.filter((r) => r.qr_id === id).length;
  return h('div.box',
    h('h2', `QR 목록 (${S.qrs.length}개)`),
    h('p.small-txt.muted', '줄을 누르면 옆(또는 아래)에서 고칠 수 있어요.'),
    h('div.tbl-wrap.scroll-y', h('table.tbl',
      h('thead', h('tr', h('th', 'ID'), h('th', '이름'), h('th', '상태'), h('th', '수동 코드'), h('th.num', '풀'), h('th.num', { title: '한 학생이 하루에 찍을 수 있는 횟수' }, '하루'), h('th', '지도'))),
      h('tbody', S.qrs.map((q) => {
        const sec = S.secrets.get(q.id);
        const tr = h('tr.click', { tabindex: 0, onclick: () => { S.selQr = q.id; onSelect(); }, onkeydown: (e) => { if (e.key === 'Enter') { S.selQr = q.id; onSelect(); } } },
          h('td.mono', q.id), h('td', q.name),
          h('td', q.active ? chip('활성', 'ok') : chip('꺼짐', 'off'), q.kind === 'rotating' ? chip('대형화면', 'blue') : null, q.visible_on_map ? null : chip('지도숨김', 'off')),
          h('td.mono', sec ? sec.manual_code : h('span.warn-txt', '없음')),
          h('td.num', poolCount(q.id) || h('span.warn-txt', '0')),
          h('td.num', q.daily_cap != null ? h('b', q.daily_cap) : h('span.muted', { title: '기본값 (설정 qr_daily_cap)' }, `기본 ${S.dailyCap}`)),
          h('td', q.map_x != null ? '✓' : '–'));
        if (q.id === S.selQr) tr.classList.add('sel');
        return tr;
      })))));
}

function qrEditor(refresh) {
  const q = S.qrById.get(S.selQr);
  if (!q) return [h('div.box', h('p.muted', '왼쪽 목록에서 QR을 고르세요.')), mapBox(null, null)];
  const pos = { x: q.map_x, y: q.map_y };
  const name = h('input.inp', { value: q.name });
  const hint = h('textarea.inp', q.hint || '');
  const vis = checkbox('지도에 표시', q.visible_on_map);
  const act = checkbox('활성 (꺼지면 찍어도 티켓이 안 생김)', q.active);
  const from = h('input.inp', { type: 'datetime-local', value: toLocalInput(q.active_from) });
  const until = h('input.inp', { type: 'datetime-local', value: toLocalInput(q.active_until) });
  const cap = h('input.inp', { type: 'number', min: 1, step: 1, value: q.daily_cap ?? '', placeholder: `기본값 ${S.dailyCap}` });
  const posTxt = h('span.small-txt');
  const showPos = () => { posTxt.textContent = pos.x == null ? '위치 없음 — 아래 지도를 눌러 정하세요' : `x ${pos.x.toFixed(3)}, y ${pos.y.toFixed(3)} (저장해야 반영)`; };
  showPos();
  const save = h('button.btn.go', '저장');
  save.onclick = () => busy(save, async () => {
    if (!name.value.trim()) throw Object.assign(new Error('이름을 입력하세요.'), { ready: true });
    const capV = cap.value.trim() === '' ? null : Number(cap.value);
    if (capV !== null && !(Number.isInteger(capV) && capV >= 1)) {
      cap.classList.add('bad');
      throw Object.assign(new Error('하루 최대 횟수는 1 이상의 정수예요 (비우면 기본값).'), { ready: true });
    }
    await tq(sb.from('qr_points').update({
      name: name.value.trim(), hint: hint.value.trim(), visible_on_map: vis.input.checked, active: act.input.checked,
      active_from: fromLocalInput(from.value), active_until: fromLocalInput(until.value), map_x: pos.x, map_y: pos.y,
      daily_cap: capV,
    }).eq('id', q.id));
    toast(`${q.id} 저장했어요.`);
    await refresh();
  });
  const editor = h('div.box.stack',
    h('h2', `${q.id} · ${q.name}`),
    h('div.fields',
      field('이름', name, 'full'), field('힌트', hint, 'full'),
      field('시작 시각 (비우면 항상)', from), field('종료 시각 (비우면 계속)', until),
      field(`하루 최대 횟수 (비우면 기본값 ${S.dailyCap})`, cap)),
    h('p.small-txt.muted', '하루 최대 횟수 = 한 학생이 이 QR을 하루에 찍을 수 있는 횟수. 희귀·전설 QR은 1을 추천해요.'),
    h('div.row', vis.el, act.el),
    h('div.row', h('b', '지도 위치: '), posTxt,
      h('button.btn.small', { onclick: () => { pos.x = pos.y = null; showPos(); map.update(); } }, '위치 지우기')),
    h('div.row.end', save));

  const map = mapBox(q, pos, showPos);
  return [editor, tokenBox(q, refresh), poolEditor(q, refresh), map.el];
}

function tokenBox(q, refresh) {
  const sec = S.secrets.get(q.id);
  const rotate = (hard) => async () => {
    const ok = await confirmBox(hard ? '토큰 즉시 폐기 (유출됐을 때)' : '토큰 교체', [
      hard ? '옛 QR은 지금 바로 못 쓰게 돼요. 이미 찍어 둔 오프라인 티켓도 무효가 될 수 있어요.'
        : `옛 QR은 앞으로 ${S.grace}분 동안만 더 인식돼요.`,
      h('p.warn-txt', '인쇄된 QR을 다시 붙여야 해요. 교체 후 [QR 인쇄] 탭에서 새 카드를 출력하세요.'),
      q.kind === 'rotating' ? '대형 화면 QR은 화면이 자동으로 새 토큰을 써요.' : null,
    ].filter(Boolean), { ok: hard ? '지금 폐기' : '교체하기', danger: true });
    if (!ok) return;
    try {
      const r = await rpc('admin_rotate_qr', { p_id: q.id, p_hard: hard });
      toast(`새 수동 코드: ${r.manual_code}`, 5000);
      await refresh();
    } catch (e) { fail(e); }
  };
  const site = siteBase();
  return h('div.box.stack',
    h('h3', '토큰 (QR 내용)'),
    q.kind === 'rotating'
      ? h('p', chip('대형 화면(screen.html) 전용', 'blue'), ' 30초마다 바뀌는 QR이라 인쇄하지 않아요.')
      : null,
    sec ? h('div.token-box',
      h('div', '수동 코드 ', h('span.code.mono', sec.manual_code)),
      q.kind === 'static' ? h('div.small-txt.mono', placeUrl(site, q.id, sec.token)) : h('div.small-txt.mono', `비밀값 생성: ${fmtTime(sec.created_at)}`),
      h('div.small-txt.muted', `발급: ${fmtTime(sec.created_at)}`))
      : h('p.warn-txt', '유효한 토큰이 없어요 — [토큰 교체]로 새로 만드세요.'),
    h('div.row',
      h('button.btn.small', { onclick: rotate(false) }, `토큰 교체 (옛 QR ${S.grace}분 유효)`),
      h('button.btn.small.primary', { onclick: rotate(true) }, '즉시 폐기 (유출됨)')));
}

function poolEditor(q, refresh) {
  const rows = S.rewards.filter((r) => r.qr_id === q.id).map((r) => ({ line_id: r.line_id, weight: r.weight }));
  const orig = rows.map((r) => r.line_id);
  const box = h('div.box.stack');
  const total = () => rows.reduce((a, r) => a + (Number(r.weight) > 0 ? Number(r.weight) : 0), 0);
  const pctCells = [];
  const totalTxt = h('span.pool-total');
  const updatePct = () => {
    const t = total();
    rows.forEach((r, i) => { pctCells[i].textContent = t && r.weight > 0 ? `${((r.weight / t) * 100).toFixed(1)}%` : '–'; });
    totalTxt.textContent = `가중치 합계 ${t}`;
  };
  const draw = () => {
    pctCells.length = 0;
    const avail = S.lines.filter((l) => !rows.some((r) => r.line_id === l.id));
    const sel = lineSelect(avail);
    const w = h('input.inp.w-num', { type: 'number', min: 1, step: 1, value: 10 });
    const tbody = h('tbody', rows.map((r, i) => {
      const l = S.lineById.get(r.line_id);
      const cell = h('td.num');
      pctCells.push(cell);
      return h('tr',
        h('td', lineName(r.line_id), ' ', l ? typeChip(l.subject) : null, l && !l.active ? chip('비활성 — 안 나옴', 'off') : null),
        h('td', h('input.inp.w-num', { type: 'number', min: 1, step: 1, value: r.weight, oninput: (e) => { r.weight = Math.floor(Number(e.target.value)); updatePct(); } })),
        cell,
        h('td', h('button.btn.small', { onclick: () => { rows.splice(i, 1); draw(); } }, '빼기')));
    }));
    const saveBtn = h('button.btn.go', '풀 저장');
    saveBtn.onclick = () => busy(saveBtn, async () => {
      if (rows.some((r) => !(r.weight >= 1))) throw Object.assign(new Error('가중치는 1 이상의 정수여야 해요.'), { ready: true });
      const removed = orig.filter((id) => !rows.some((r) => r.line_id === id));
      if (removed.length) await tq(sb.from('qr_rewards').delete().eq('qr_id', q.id).in('line_id', removed));
      if (rows.length) await tq(sb.from('qr_rewards').upsert(rows.map((r) => ({ qr_id: q.id, line_id: r.line_id, weight: r.weight }))));
      toast(`${q.id} 몬스터 풀 저장했어요.`);
      await refresh();
    });
    box.replaceChildren(
      h('h3', '몬스터 풀 (이 QR에서 나오는 몬스터)'),
      h('p.small-txt.muted', '가중치가 클수록 잘 나와요. 확률 = 가중치 ÷ 합계.'),
      rows.length ? h('div.tbl-wrap', h('table.tbl',
        h('thead', h('tr', h('th', '계열'), h('th', '가중치'), h('th.num', '확률'), h('th', ''))), tbody))
        : h('p.notice.red', '풀이 비어 있어요! 이 QR 티켓은 부스에서 몬스터가 안 나와요 (empty_pool).'),
      h('div.row', totalTxt),
      avail.length ? h('div.row', sel, w, h('button.btn.small', {
        onclick: () => {
          const wt = Math.floor(Number(w.value));
          if (!(wt >= 1)) { toast('가중치는 1 이상이에요.'); return; }
          rows.push({ line_id: Number(sel.value), weight: wt });
          draw();
        },
      }, '+ 추가')) : null,
      h('div.row.end', saveBtn));
    updatePct();
  };
  draw();
  return box;
}

// campus map: shows every QR; when a QR is selected, clicking sets its position (saved with 저장)
function mapBox(q, pos, onPick) {
  const wrap = h('div.map-wrap' + (q ? '' : '.ro'));
  const img = h('img', { src: 'img/map.webp', alt: '학교 지도', draggable: 'false' });
  wrap.append(img);
  const update = () => {
    wrap.querySelectorAll('.marker').forEach((m) => m.remove());
    for (const p of S.qrs) {
      const isSel = q && p.id === q.id;
      const x = isSel ? pos.x : p.map_x;
      const y = isSel ? pos.y : p.map_y;
      if (x == null || y == null) continue;
      const m = h('div.marker', { style: { left: x * 100 + '%', top: y * 100 + '%' }, title: `${p.id} ${p.name}` }, h('span', p.id));
      if (isSel) m.classList.add('sel');
      if (!p.active) m.classList.add('off');
      wrap.append(m);
    }
  };
  if (q) {
    img.addEventListener('click', (e) => {
      const r = img.getBoundingClientRect();
      pos.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      pos.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      onPick?.();
      update();
    });
  }
  update();
  const el = h('div.box.stack',
    h('h3', '지도 위치'),
    h('p.small-txt.muted', q ? `지도를 누르면 ${q.id}의 위치가 바뀌어요 (빨간 점). 위의 [저장]을 눌러야 반영돼요.` : 'QR을 고르면 지도를 눌러 위치를 정할 수 있어요. 회색 = 꺼진 QR.'),
    wrap);
  return q ? { el, update } : el;
}

// ───────────────────────── 3. QR 인쇄 ─────────────────────────

// site root for place-QR URLs (folder of this page, no trailing slash)
const siteBase = () => new URL('.', location.href).href.replace(/\/$/, '');

async function tabPrint() {
  await loadQrData();
  const site = siteBase();
  const statics = S.qrs.filter((q) => q.active && q.kind === 'static');
  const rotating = S.qrs.filter((q) => q.kind === 'rotating');
  const local = /^https?:\/\/(localhost|127\.|192\.168\.|10\.)/.test(site) || location.protocol === 'file:';

  const cards = statics.map((q) => {
    const sec = S.secrets.get(q.id);
    if (!sec) return h('div.qr-card', h('div.qc-title', CONFIG.GAME_TITLE), h('p.warn-txt', `${q.id} ${q.name}: 토큰 없음 — QR 관리에서 토큰을 교체하세요.`));
    const url = placeUrl(site, q.id, sec.token);
    const cv = drawQR(document.createElement('canvas'), url, { cell: 10, margin: 4 });
    cv.setAttribute('aria-label', `${q.id} QR 코드`);
    return h('div.qr-card',
      h('div.qc-title', CONFIG.GAME_TITLE),
      cv,
      h('div.qc-name', q.name),
      h('div.qc-code', '수동 코드: ', h('b', sec.manual_code)),
      h('div.qc-id', q.id),
      h('button.btn.small.no-print', { onclick: () => savePng(q, sec, url) }, 'PNG 저장'));
  });

  const bar = h('div.box.stack.no-print',
    h('div.row', h('h2', `인쇄용 QR 카드 (${cards.length}장)`), h('span', { style: { flex: 1 } }),
      h('button.btn.go', { onclick: () => window.print(), disabled: !cards.length }, '🖨 인쇄')),
    h('p.small-txt', '활성 상태인 고정 QR만 나와요. A4 한 장에 2장씩 인쇄돼요 (QR 약 9cm). 코팅해서 2장씩 붙이세요.'),
    h('p.small-txt', 'QR 주소: ', h('span.mono', site + '/s#…')),
    local ? h('p.notice.red', `지금 주소(${site})는 이 컴퓨터에서만 열려요. 학생 폰에서 열리려면 실제로 배포된 사이트에서 이 페이지를 열고 인쇄하세요.`) : null,
    rotating.length ? h('p.small-txt', '대형 화면 QR: ', rotating.map((q) => h('span', chip(`${q.id} ${q.name} — 대형 화면(screen.html) 전용`, 'blue'), ' ')), '(인쇄하지 않아요)') : null);

  return [bar, cards.length ? h('div.print-grid', cards) : h('div.box', h('p.muted', '인쇄할 QR이 없어요.'))];
}

function savePng(q, sec, url) {
  const qr = drawQR(document.createElement('canvas'), url, { cell: 20, margin: 4 });
  const pad = 40, W = qr.width + pad * 2;
  const H = qr.height + 330;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#000'; g.textAlign = 'center';
  const font = (px, bold) => `${bold ? 'bold ' : ''}${px}px Galmuri11, 'Malgun Gothic', sans-serif`;
  g.font = font(44, true); g.fillText(CONFIG.GAME_TITLE, W / 2, 70);
  g.drawImage(qr, pad, 100);
  const y0 = 100 + qr.height;
  g.font = font(56, true); g.fillText(q.name, W / 2, y0 + 70, W - pad * 2);
  g.font = font(48); g.fillText(`수동 코드: ${sec.manual_code}`, W / 2, y0 + 150);
  g.font = font(28); g.fillStyle = '#555'; g.fillText(q.id, W / 2, y0 + 205);
  c.toBlob((blob) => {
    if (!blob) { toast('PNG를 만들지 못했어요.'); return; }
    const a = h('a', { href: URL.createObjectURL(blob), download: `QR_${q.id}_${q.name.replace(/[\\/:*?"<>|\s]+/g, '_')}.png` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}

// ───────────────────────── 4. 몬스터·퀴즈 ─────────────────────────

async function tabMon() {
  await Promise.all([loadCatalog(), atlasCap]);
  if (!S.selLine || !S.lineById.has(S.selLine)) S.selLine = S.lines[0]?.id ?? null;
  const listBox = h('div.box.stack');
  const editBox = h('div');
  const filter = h('input.inp', { type: 'search', placeholder: '이름·선생님·과목으로 찾기', 'aria-label': '계열 찾기' });
  const listEl = h('div.line-list');
  const drawItems = () => {
    const f = filter.value.trim().toLowerCase();
    const shown = S.lines.filter((l) => !f || [l.teacher, l.subject, S.spById.get((l.id - 1) * 3 + 1)?.name, '#' + l.id]
      .some((x) => String(x || '').toLowerCase().includes(f)));
    listEl.replaceChildren(...bySubject(shown).map(([subject, ls]) => h('div.line-group',
      h('div.line-group-h', typeChip(subject), ` ${ls.length}`),
      ls.map((l) => h('button.line-item', {
        type: 'button', 'aria-pressed': String(l.id === S.selLine),
        onclick: () => { S.selLine = l.id; drawItems(); drawEdit(); },
      }, sprite((l.id - 1) * 3 + 1, 48), h('div.meta',
        h('b', `#${l.id} ${S.spById.get((l.id - 1) * 3 + 1)?.name || '?'}`),
        h('span', l.teacher),
        h('span', RARITY[l.rarity] || l.rarity, maxStage(l) < 3 ? ` · ${maxStage(l)}단계` : '', l.active ? '' : ' · 비활성',
          l.withdrawn ? ' ' : '', l.withdrawn ? chip('동의 철회', 'hot') : null)))))));
    if (!shown.length) listEl.replaceChildren(h('p.muted', '찾는 계열이 없어요.'));
  };
  filter.addEventListener('input', drawItems);
  const drawList = () => {
    listBox.replaceChildren(
      h('div.row', h('h2', `몬스터 계열 (${S.lines.length})`), h('span', { style: { flex: 1 } }),
        h('button.btn.small.go', { onclick: () => addLine(redraw) }, '+ 새 계열')),
      filter, listEl);
    drawItems();
  };
  const drawEdit = () => {
    editBox.replaceChildren(h('p.loading', '불러오는 중…'));
    lineEditor(S.selLine, redraw).then((n) => editBox.replaceChildren(...n), (e) => editBox.replaceChildren(h('div.box', h('p.warn-txt', msgOf(e)))));
  };
  const redraw = async () => { await loadCatalog(); drawList(); drawEdit(); };
  drawList(); drawEdit();
  return h('div.cols.wide-right', listBox, editBox);
}

async function lineEditor(lineId, redraw) {
  const l = S.lineById.get(lineId);
  if (!l) return [h('div.box', h('p.muted', '계열을 고르세요.'))];
  const teacher = h('input.inp', { value: l.teacher });
  const subject = h('input.inp', { value: l.subject, list: 'subjects' });
  const rarity = h('select.inp', Object.entries(RARITY).map(([k, v]) => h('option', { value: k, selected: l.rarity === k }, v)));
  const act = checkbox('활성 (끄면 뽑기에서 안 나옴)', l.active);
  const wd = checkbox('선생님 동의 철회(숨김)', l.withdrawn);
  const stageSel = stageSelect(maxStage(l));
  const sp = [1, 2, 3].map((stage) => {
    const id = (l.id - 1) * 3 + stage;
    const s = S.spById.get(id) || { id, name: '', category: '', flavor: '', height: '', weight: '' };
    return {
      id, stage,
      name: h('input.inp', { value: s.name }), category: h('input.inp', { value: s.category }),
      flavor: h('textarea.inp', s.flavor), height: h('input.inp', { value: s.height }), weight: h('input.inp', { value: s.weight }),
    };
  });
  const cards = sp.map((s) => h('div.sp-card',
    h('div.pic', sprite(s.id, 64)),
    h('b', `${s.stage}단계 · 앱 도감 No.${String(S.species.findIndex((x) => x.id === s.id) + 1).padStart(3, '0')}`),
    h('span.small-txt', '그림 파일: ', h('code', `art/sprites/${lineId}-${s.stage}.png`)),
    field('이름', s.name), field('분류', s.category), field('설명', s.flavor),
    h('div.row', field('키', s.height), field('몸무게', s.weight))));
  const grid = h('div.sp-grid');
  const stageNote = h('p.small-txt.muted');
  // only stages <= max_stage are shown and saved; higher-stage rows are kept in the DB, just hidden
  const showStages = () => {
    const m = Number(stageSel.value);
    grid.replaceChildren(...cards.slice(0, m));
    stageNote.textContent = m < 3
      ? `${m}단계에서 더 진화하지 않아요. ${m + 1}단계 이상 몬스터는 숨겨져요 (지우지는 않아요).`
      : '1 → 2 → 3단계로 진화해요.';
  };
  stageSel.addEventListener('change', showStages);
  showStages();
  const save = h('button.btn.go', '계열·몬스터 저장');
  save.onclick = () => busy(save, async () => {
    const m = Number(stageSel.value);
    const used = sp.slice(0, m);
    if (!teacher.value.trim() || !subject.value.trim()) throw Object.assign(new Error('선생님과 과목을 입력하세요.'), { ready: true });
    if (used.some((s) => !s.name.value.trim())) throw Object.assign(new Error(`몬스터 이름 ${m}개를 모두 입력하세요.`), { ready: true });
    await tq(sb.from('lines').update({ teacher: teacher.value.trim(), subject: subject.value.trim(), rarity: rarity.value, active: act.input.checked, max_stage: m, withdrawn: wd.input.checked }).eq('id', l.id));
    await tq(sb.from('species').upsert(used.map((s) => ({
      id: s.id, line_id: l.id, stage: s.stage, name: s.name.value.trim(), category: s.category.value.trim(),
      flavor: s.flavor.value.trim(), height: s.height.value.trim(), weight: s.weight.value.trim(),
    }))));
    toast(`#${l.id} 저장했어요.`);
    await redraw();
  });
  const lastDex = (l.id - 1) * 3 + maxStage(l);
  const noPic = lastDex > ATLAS_CAP;
  const editor = h('div.box.stack',
    h('h2', `#${l.id} 계열 편집`),
    noPic ? h('p.notice', `이 계열(도감 ${(l.id - 1) * 3 + 1}~${lastDex}번)은 아직 그림이 없어요. 스프라이트를 넣고 tools/build_atlas.py로 아틀라스(web/sprites/atlas.png)를 다시 만들어야 해요.`) : null,
    h('datalist#subjects', SUBJECTS.map((s) => h('option', { value: s }))),
    h('div.fields', field('선생님 (잡은 뒤에만 보임)', teacher), field('과목 (타입)', subject), field('희귀도', rarity),
      field('진화 단계 수', stageSel), h('div.fld', h('span', '\u00a0'), act.el)),
    stageNote,
    h('div.stack', wd.el,
      h('p.small-txt.muted', '켜면: 이 계열은 더 이상 뽑기에서 나오지 않고, 학생 앱과 대형 화면에서 선생님 이름과 그림이 가려져요.')),
    l.withdrawn ? h('p.notice.red', '이 계열은 선생님 동의 철회로 숨겨져 있어요.') : null,
    grid,
    h('div.row.end', save));
  return [editor, await quizSection(l)];
}

// 1/2/3 단계 select (lines.max_stage). Legendaries are 1 stage.
function stageSelect(value = 3) {
  return h('select.inp', [1, 2, 3].map((n) => h('option', { value: n, selected: n === value },
    n === 1 ? '1단계 (진화 없음 · 전설)' : n === 2 ? '2단계 (1번 진화)' : '3단계 (2번 진화)')));
}

async function addLine(redraw) {
  const nextId = Math.max(0, ...S.lines.map((l) => l.id)) + 1;
  const teacher = h('input.inp', { placeholder: '예: 물리 선생님' });
  const subject = h('input.inp', { list: 'subjects-new', placeholder: '예: 물리' });
  const rarity = h('select.inp', Object.entries(RARITY).map(([k, v]) => h('option', { value: k }, v)));
  const stageSel = stageSelect(3);
  const names = [1, 2, 3].map((s) => h('input.inp', { placeholder: `${s}단계 이름` }));
  const nameFields = names.map((n, i) => field(`${i + 1}단계 몬스터 이름`, n));
  const nameBox = h('div.fields');
  const range = h('p');
  const showStages = () => {
    const m = Number(stageSel.value);
    nameBox.replaceChildren(...nameFields.slice(0, m));
    const first = (nextId - 1) * 3 + 1;
    range.textContent = `새 계열 번호: #${nextId} (도감 ${m === 1 ? first : `${first}~${first + m - 1}`}번)`;
  };
  stageSel.addEventListener('change', showStages);
  rarity.addEventListener('change', () => {          // legendaries are 1 stage
    if (rarity.value === 'legendary') { stageSel.value = '1'; showStages(); }
  });
  showStages();
  const body = h('div.stack',
    range,
    h('datalist#subjects-new', SUBJECTS.map((s) => h('option', { value: s }))),
    h('div.fields', field('선생님', teacher), field('과목 (타입)', subject), field('희귀도', rarity), field('진화 단계 수', stageSel)),
    h('p.small-txt.muted', '전설 몬스터는 보통 1단계(진화 없음)예요.'),
    nameBox,
    h('p.notice', '그림은 따로 만들어야 해요: 64×64 스프라이트를 넣고 tools/build_atlas.py로 아틀라스를 다시 만드세요. 그 전까지는 "그림 없음"으로 보여요.'),
    h('p.notice.red', '쌤 외모·사생활은 금지! 과목·학교 관련 내용만 쓰세요.'));
  const created = await modal('새 몬스터 계열', body, [
    { label: '취소', value: null },
    {
      label: '만들기', cls: 'go',
      onClick: async () => {
        const m = Number(stageSel.value);
        const used = names.slice(0, m);
        if (!teacher.value.trim() || !subject.value.trim() || used.some((n) => !n.value.trim())) { toast('빈 칸을 모두 채워 주세요.'); return false; }
        await tq(sb.from('lines').insert({ id: nextId, teacher: teacher.value.trim(), subject: subject.value.trim(), rarity: rarity.value, active: true, max_stage: m }));
        try {
          await tq(sb.from('species').insert(used.map((n, i) => ({ id: (nextId - 1) * 3 + i + 1, line_id: nextId, stage: i + 1, name: n.value.trim() }))));
        } catch (e) {
          await sb.from('lines').delete().eq('id', nextId);   // undo the half-made line
          throw e;
        }
        return nextId;
      },
    },
  ]);
  if (created) {
    toast(`#${created} 계열을 만들었어요. 그림은 tools/build_atlas.py로 아틀라스를 다시 만들어야 보여요.`, 6000);
    S.selLine = created;
    await redraw();
  }
}

async function quizSection(l) {
  const quizzes = await tq(sb.from('quizzes').select('id,question,choices,active').eq('line_id', l.id).order('id'));
  const answers = quizzes.length ? await tq(sb.from('quiz_answers').select('quiz_id,answer').in('quiz_id', quizzes.map((z) => z.id))) : [];
  const ans = new Map(answers.map((a) => [a.quiz_id, a.answer]));
  const box = h('div.box.stack',
    h('div.row', h('h2', `퀴즈 (${quizzes.length}개)`), h('span', { style: { flex: 1 } }),
      h('button.btn.small.go', { onclick: () => editQuiz(l, null, null) }, '+ 퀴즈 추가')),
    h('p.notice.red', '쌤 외모·사생활 금지! 과목/학교 관련 문제만 내 주세요. 학생은 같은 문제를 두 번 받지 않아요.'),
    quizzes.length ? null : h('p.muted', '아직 퀴즈가 없어요. 퀴즈가 없으면 이 몬스터를 잡아도 진화권 기회가 없어요.'),
    quizzes.map((z, i) => {
      const a = ans.get(z.id);
      return h('div.quiz-item',
        h('div.row', h('b', `Q${i + 1}.`), h('span', { style: { flex: 1 } }, z.question),
          z.active ? null : chip('꺼짐', 'off'), a == null ? chip('정답 없음 — 출제 안 됨', 'hot') : null),
        h('ol', z.choices.map((c, k) => h('li', { class: k === a ? 'right' : null }, String(c), k === a ? ' ✔' : ''))),
        h('div.row.end',
          h('button.btn.small', { onclick: () => editQuiz(l, z, a) }, '수정'),
          h('button.btn.small.primary', { onclick: () => deleteQuiz(l, z) }, '삭제')));
    }));
  return box;
}

async function editQuiz(l, z, answer) {
  const question = h('textarea.inp', z?.question || '');
  const act = checkbox('출제함 (끄면 이 문제는 안 나옴)', z ? z.active : true);
  const choices = (z?.choices || ['', '']).map(String);
  let correct = answer ?? 0;
  const list = h('div.stack');
  const name = 'qz-correct';
  const draw = () => {
    list.replaceChildren(...choices.map((c, i) => h('div.choice-row',
      h('input', { type: 'radio', name, checked: i === correct, 'aria-label': `${i + 1}번을 정답으로`, onchange: () => { correct = i; } }),
      h('input.inp', { value: c, placeholder: `보기 ${i + 1}`, oninput: (e) => { choices[i] = e.target.value; } }),
      h('button.btn.small', {
        type: 'button', disabled: choices.length <= 2,
        onclick: () => { choices.splice(i, 1); if (correct >= choices.length) correct = choices.length - 1; else if (correct > i) correct--; draw(); },
      }, '빼기'))),
    ...(choices.length < 4 ? [h('button.btn.small', { type: 'button', onclick: () => { choices.push(''); draw(); } }, '+ 보기 추가')] : []));
  };
  draw();
  const body = h('div.stack',
    h('p.small-txt', `${lineName(l.id)} · 보기 2~4개, 왼쪽 동그라미 = 정답`),
    h('p.notice.red', '쌤 외모·사생활 금지, 과목/학교 관련만!'),
    field('문제', question), list, act.el);
  await modal(z ? '퀴즈 수정' : '퀴즈 추가', body, [
    { label: '취소', value: null },
    {
      label: '저장', cls: 'go',
      onClick: async () => {
        const cs = choices.map((c) => c.trim());
        if (!question.value.trim()) { toast('문제를 입력하세요.'); return false; }
        if (cs.length < 2 || cs.length > 4 || cs.some((c) => !c)) { toast('보기 2~4개를 모두 채워 주세요.'); return false; }
        if (!(correct >= 0 && correct < cs.length)) { toast('정답을 고르세요.'); return false; }
        const row = { line_id: l.id, question: question.value.trim(), choices: cs, active: act.input.checked };
        let id = z?.id;
        if (id) await tq(sb.from('quizzes').update(row).eq('id', id));
        else id = (await tq(sb.from('quizzes').insert(row).select('id').single())).id;
        await tq(sb.from('quiz_answers').upsert({ quiz_id: id, answer: correct }));
        toast('퀴즈를 저장했어요.');
        rerender();
        return true;
      },
    },
  ]);
}

async function deleteQuiz(l, z) {
  const ok = await confirmBox('퀴즈 삭제', [
    `"${z.question}"`,
    '이 문제를 이미 받은 학생들의 풀이 기록도 함께 지워져요. 잠깐 빼려는 거면 [수정]에서 "출제함"을 끄는 걸 추천해요.',
  ], { ok: '삭제', danger: true });
  if (!ok) return;
  try { await tq(sb.from('quizzes').delete().eq('id', z.id)); toast('삭제했어요.'); rerender(); } catch (e) { fail(e); }
}

// ───────────────────────── 5. 학생 ─────────────────────────

async function tabStu() {
  if (!S.qrs.length) { try { await loadQrData(); } catch { /* names only */ } }
  const input = h('input.inp', { value: S.stuQuery, placeholder: '학번 앞자리(예: 022), 이름, 손님·선생님 아이디(예: t01 또는 g:)', 'aria-label': '학생 검색' });
  const results = h('div');
  const detail = h('div');
  const search = async () => {
    S.stuQuery = input.value.trim();
    results.replaceChildren(h('p.loading', '검색 중…'));
    try {
      const q = S.stuQuery.replace(/[%_*,()\\."]/g, '');
      let b = sb.from('profiles').select('user_id,student_id,name,gen,role,evo_tickets,score,dex_count,last_seen').order('student_id').limit(50);
      if (q && /^([0-9]|staff|g:)/i.test(q)) b = b.like('student_id', q.toLowerCase() + '%');
      // name, or a guest/teacher login-code id typed without the 'g:' prefix (t01 → g:t01)
      else if (q) b = b.or(`name.ilike.*${q}*,student_id.like.g:${q.toLowerCase()}*`);
      const rows = await tq(b);
      // 기록 삭제용 체크 (학생 계정만. 운영자·부스는 지울 수 없음)
      S.stuChecked = new Set([...(S.stuChecked || [])].filter((x) => rows.some((r) => r.student_id === x)));
      const delBtn = h('button.btn.small.danger', { type: 'button', onclick: () => deleteStudents([...S.stuChecked], search) });
      const syncDel = () => { delBtn.textContent = `체크한 학생 기록 삭제 (${S.stuChecked.size}명)`; delBtn.disabled = !S.stuChecked.size; };
      const students = rows.filter((r) => r.role === 'student');
      const all = h('input', { type: 'checkbox', 'aria-label': '이 목록의 학생 모두 체크',
        onclick: (e) => { e.stopPropagation(); students.forEach((r) => (e.target.checked ? S.stuChecked.add(r.student_id) : S.stuChecked.delete(r.student_id)));
          results.querySelectorAll('td.chk input').forEach((c) => { c.checked = S.stuChecked.has(c.dataset.sid); }); syncDel(); } });
      syncDel();
      results.replaceChildren(h('div.box',
        h('div.row', h('h2', { style: { flex: 1 } }, `검색 결과 (${rows.length}${rows.length === 50 ? '+' : ''}명)`), rows.length ? delBtn : null),
        rows.length ? h('div.tbl-wrap.scroll-y', h('table.tbl',
          h('thead', h('tr', h('th.chk', all), h('th', '학번'), h('th', '이름'), h('th', '역할'), h('th.num', '점수'), h('th.num', '진화권'), h('th', '접속'))),
          h('tbody', rows.map((p) => {
            const chk = p.role === 'student'
              ? h('input', { type: 'checkbox', 'data-sid': p.student_id, checked: S.stuChecked.has(p.student_id), 'aria-label': `${p.student_id} 체크`,
                onclick: (e) => { e.stopPropagation(); if (e.target.checked) S.stuChecked.add(p.student_id); else S.stuChecked.delete(p.student_id); syncDel(); } })
              : '';
            const tr = h('tr.click', { tabindex: 0, onclick: () => open(p.student_id), onkeydown: (e) => { if (e.key === 'Enter') open(p.student_id); } },
              h('td.chk', { onclick: (e) => e.stopPropagation() }, chk),
              h('td.mono', p.student_id), h('td', p.name || '–'), h('td', isGuest(p.student_id) ? '손님·선생님' : ROLE[p.role] || p.role),
              h('td.num', p.score), h('td.num', p.evo_tickets), h('td', p.last_seen ? timeAgo(p.last_seen) : '–'));
            if (p.student_id === S.stuSel) tr.classList.add('sel');
            return tr;
          })))) : h('p.muted', '찾는 학생이 없어요.')));
    } catch (e) { results.replaceChildren(h('div.box', h('p.warn-txt', msgOf(e)))); }
  };
  const open = async (sid) => {
    S.stuSel = sid;
    results.querySelectorAll('tr.sel').forEach((t) => t.classList.remove('sel'));
    [...results.querySelectorAll('tbody tr')].find((t) => t.children[1]?.textContent === sid)?.classList.add('sel');
    detail.replaceChildren(h('p.loading', '불러오는 중…'));
    try { detail.replaceChildren(...await studentDetail(sid, async () => { await search(); await open(sid); })); } catch (e) { detail.replaceChildren(h('div.box', h('p.warn-txt', msgOf(e)))); }
  };
  const form = h('form.box.row', { onsubmit: (e) => { e.preventDefault(); search(); } },
    h('div', { style: { flex: '1 1 240px' } }, input), h('button.btn.go', { type: 'submit' }, '검색'),
    h('button.btn', { type: 'button', onclick: () => { input.value = 'g:'; search(); } }, '손님·선생님만'));
  search().then(() => { if (S.stuSel) open(S.stuSel); });
  const wipe = h('div.box.stack.danger-zone',
    h('h2', '기록 삭제 (테스트·더미 데이터 정리)'),
    h('p.small-txt', '위 검색 결과에서 학생을 체크한 뒤 [체크한 학생 기록 삭제]를 누르면 그 학생들만 지워요. 아래 버튼은 학생 계정 전부를 지워요. 운영자·부스 계정은 지워지지 않아요.'),
    h('button.btn.danger', { type: 'button', onclick: () => deleteStudents(null, search) }, '학생 기록 전체 삭제'));
  return [form, rankingSection(), h('div.cols', results, detail), wipe];
}

// 기록 삭제: 1단계 경고 → 2단계 글자 입력. ids = null 이면 전체
async function deleteStudents(ids, after) {
  const allMode = ids == null;
  let n = ids?.length || 0;
  if (allMode) {
    try { n = (await rpc('admin_count_students')).students; } catch (e) { fail(e); return; }
  }
  if (!n) { toast(allMode ? '지울 학생 기록이 없어요.' : '먼저 지울 학생을 체크하세요.'); return; }
  const step1 = await confirmBox(allMode ? '학생 기록 전체 삭제 (1/2)' : `체크한 학생 기록 삭제 (1/2)`, [
    h('p.warn-txt', allMode
      ? `학생 계정 ${n}명의 기록을 전부 지워요. 도감·티켓·진화권·점수·배틀 기록이 모두 사라지고 되돌릴 수 없어요.`
      : `${n}명의 기록을 지워요. 도감·티켓·진화권·점수·배틀 기록이 모두 사라지고 되돌릴 수 없어요.`),
    allMode ? '축제 전에 테스트로 만든 데이터를 정리할 때만 쓰세요. 축제 중에는 절대 누르지 마세요!' : h('p.small-txt.mono', ids.slice(0, 30).join(', ') + (ids.length > 30 ? ` 외 ${ids.length - 30}명` : '')),
    '고유번호로 만든 계정은 로그인도 같이 지워져서, 같은 번호로 처음부터 다시 가입할 수 있어요.',
  ], { ok: '다음', danger: true });
  if (!step1) return;
  const word = allMode ? '전체 삭제' : '삭제';
  const step2 = await confirmBox(`정말 지울까요? (2/2)`, [
    h('p.warn-txt', `${n}명의 기록이 영구히 사라져요.`),
  ], { ok: '영구 삭제', danger: true, typeToConfirm: word });
  if (!step2) return;
  try {
    const r = await rpc('admin_delete_students', { p_student_ids: ids, p_confirm: word });
    toast(`${r.deleted}명의 기록을 지웠어요.${r.logins ? ` (고유번호 로그인 ${r.logins}개 포함)` : ''}`);
    S.stuChecked = new Set(); S.stuSel = null;
    await after?.();
  } catch (e) { fail(e); }
}

async function studentDetail(sid, reload) {
  const p = await tq(sb.from('profiles').select('*').eq('student_id', sid).maybeSingle());
  if (!p) return [h('div.box', h('p.muted', '이 학생을 찾지 못했어요 (연결 해제됐을 수 있어요).'))];
  const [tickets, coll, events] = await Promise.all([
    tq(sb.from('tickets').select('id,nonce,qr_id,status,created_at,redeemed_at,result_species').eq('user_id', p.user_id).order('created_at', { ascending: false }).limit(100)),
    tq(sb.from('collection').select('line_id,stage,catch_count,evo_fails,first_caught_at').eq('user_id', p.user_id).order('line_id')),
    tq(sb.from('events').select('at,kind,data').eq('user_id', p.user_id).order('at', { ascending: false }).limit(30)),
  ]);

  const act = async (fn, args, okMsg) => {
    try { await rpc(fn, args); toast(okMsg); await reload(); } catch (e) { fail(e); }
  };

  const delta = h('input.inp.w-num', { type: 'number', min: 1, step: 1, value: 1, 'aria-label': '진화권 개수' });
  const adj = (sign) => () => {
    const n = Math.floor(Number(delta.value));
    if (!(n >= 1)) { toast('1 이상의 숫자를 넣으세요.'); return; }
    act('admin_adjust_tickets', { p_student_id: sid, p_delta: sign * n }, `진화권 ${sign > 0 ? '+' : '-'}${n}`);
  };
  const roleSel = h('select.inp', { style: { width: 'auto' } }, Object.entries(ROLE).map(([k, v]) => h('option', { value: k, selected: p.role === k }, v)));
  const setRole = async () => {
    if (roleSel.value === p.role) { toast('이미 그 역할이에요.'); return; }
    const ok = await confirmBox('역할 변경', [`${sid} 의 역할을 "${ROLE[p.role]}" → "${ROLE[roleSel.value]}"(으)로 바꿀까요?`,
      roleSel.value === 'admin' ? h('p.warn-txt', '운영자는 모든 데이터를 고칠 수 있어요. 믿을 수 있는 사람만!') : null].filter(Boolean), { ok: '변경' });
    if (ok) act('admin_set_role', { p_student_id: sid, p_role: roleSel.value }, '역할을 바꿨어요.');
  };
  const toggleRanking = async () => {
    const to = !p.in_ranking;
    const ok = await confirmBox(to ? '랭킹에 넣기' : '랭킹에서 빼기', [
      to ? `${sid}을(를) 랭킹(순위·상품)에 다시 넣을까요?` : `${sid}을(를) 랭킹에서 뺄까요? 게임은 그대로 할 수 있고, 순위·기수 점수·상품 대상에서만 빠져요.`,
      isGuest(sid) && to ? h('p.warn-txt', '선생님·손님 계정이에요. 보통은 랭킹에서 빼 둬요.') : null,
    ].filter(Boolean), { ok: to ? '넣기' : '빼기' });
    if (ok) act('admin_set_in_ranking', { p_student_id: sid, p_in: to }, to ? '랭킹에 넣었어요.' : '랭킹에서 뺐어요.');
  };
  const unlink = async () => {
    const ok = await confirmBox('기록까지 삭제', [
      h('p.warn-txt', `${sid} 계정을 지워요. 이 학번의 도감·티켓·진화권·점수가 모두 사라지고 되돌릴 수 없어요.`),
      '폰을 잃어버린 경우에는 이걸 쓰지 말고 위의 [다른 로그인으로 옮기기]를 쓰세요.',
      '다른 사람이 이 학번을 잘못 가져갔을 때만 쓰세요. 삭제 후 진짜 학생이 다시 로그인하면 처음부터 시작해요.',
    ], { ok: '기록까지 삭제', danger: true, typeToConfirm: sid });
    if (ok) {
      try { await rpc('admin_unlink', { p_student_id: sid }); toast(`${sid} 기록을 삭제했어요.`); S.stuSel = null; await reload(); } catch (e) { fail(e); }
    }
  };
  const cancel = (t) => async () => {
    const ok = await confirmBox('티켓 취소', [`${S.qrById.get(t.qr_id)?.name || t.qr_id} 티켓(대기 중)을 취소할까요?`, '취소하면 그 QR이 다시 열려요.'], { ok: '티켓 취소', danger: true });
    if (ok) act('admin_cancel_ticket', { p_nonce: t.nonce }, '티켓을 취소했어요.');
  };

  const info = h('div.box.stack',
    h('h2', `${p.student_id} ${p.name || ''}`),
    isGuest(p.student_id) ? h('p.small-txt.muted', '로그인 코드로 만든 손님·선생님 계정이에요 (기수 없음).') : null,
    h('dl.kv',
      h('dt', '기수'), h('dd', p.gen ? `${p.gen}기` : '–'),
      h('dt', '역할'), h('dd', ROLE[p.role] || p.role),
      h('dt', '점수'), h('dd', `${p.score}점 · 도감 ${p.dex_count}`),
      h('dt', '진화권'), h('dd', h('b', p.evo_tickets)),
      h('dt', '랭킹 포함'), h('dd', p.in_ranking === false ? chip('랭킹 제외', 'off') : chip('랭킹 포함', 'ok')),
      h('dt', '랭킹 공개'), h('dd', p.show_on_board ? '공개' : '익명'),
      h('dt', '마지막 접속'), h('dd', p.last_seen ? `${fmtTime(p.last_seen)} (${timeAgo(p.last_seen)})` : '–'),
      h('dt', '가입'), h('dd', fmtTime(p.created_at))),
    h('div.row', h('b', '진화권'), delta, h('button.btn.small', { onclick: adj(-1) }, '빼기 −'), h('button.btn.small.go', { onclick: adj(1) }, '더하기 +')),
    h('div.row', h('b', '역할'), roleSel, h('button.btn.small', { onclick: setRole }, '변경')),
    h('div.row', h('b', '랭킹'), h('button.btn.small', { onclick: toggleRanking }, p.in_ranking === false ? '랭킹에 넣기' : '랭킹에서 빼기'),
      h('span.small-txt.muted', '선생님·손님(g:) 계정은 처음부터 빠져 있어요.')));

  // move all game data to another login (lost phone, new Google login → STUDENT_ID_TAKEN, backup code …)
  const codeEmail = `${isGuest(sid) ? sid.slice(2) : sid}@code.local`;
  const email = h('input.inp', { type: 'email', placeholder: `예: ${codeEmail} 또는 학생 구글 이메일`, autocomplete: 'off', 'aria-label': '옮길 로그인 이메일' });
  const relinkBtn = h('button.btn.go', '옮기기');
  relinkBtn.onclick = async () => {
    const em = email.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(em)) { toast('이메일을 정확히 넣어 주세요.'); email.classList.add('bad'); return; }
    email.classList.remove('bad');
    const ok = await confirmBox('다른 로그인으로 옮기기', [
      `${sid}의 도감·티켓·진화권·점수를 모두 ${em} 로그인으로 옮겨요.`,
      '옮긴 뒤에는 예전 로그인(잃어버린 폰 등)으로는 이 기록을 볼 수 없어요.',
      '학생은 새 로그인으로 앱을 다시 열면 기록이 그대로 보여요.',
    ], { ok: '옮기기' });
    if (!ok) return;
    busy(relinkBtn, async () => {
      const r = await rpc('admin_relink', { p_student_id: sid, p_email: em });
      toast(r?.note === 'already linked' ? '이미 그 로그인에 연결돼 있어요.' : `${sid} 기록을 ${em}(으)로 옮겼어요.`, 5000);
      await reload();
    });
  };
  const relinkBox = h('div.box.stack',
    h('h3', '다른 로그인으로 옮기기 (폰 분실·새 폰)'),
    h('ol.small-txt.steps',
      h('li', '새 로그인 계정을 준비해요: ',
        h('b', '구글'), ' — 학생이 새 폰에서 구글 로그인을 한 번 시도하게 하세요 ("이미 다른 계정에 연결돼 있어요"가 떠도 괜찮아요). ',
        h('b', '또는 코드'), ` — [로그인 코드] 탭에서 이 학번 코드를 만들면 ${codeEmail} 계정이 생겨요.`),
      h('li', '그 이메일을 아래에 넣고 [옮기기]. 모든 게임 기록이 새 로그인으로 옮겨져요.'),
      h('li', '학생이 새 로그인으로 앱을 열면 끝! 예전 로그인은 이 학번과 끊겨요.')),
    h('div.row', h('div', { style: { flex: '1 1 220px' } }, email),
      h('button.btn.small', { type: 'button', onclick: () => { email.value = codeEmail; } }, '코드 계정 넣기'), relinkBtn),
    h('p.small-txt.muted', '오류 안내: "로그인한 적이 없어요" = 그 이메일 계정이 아직 없음 · "이미 게임 기록이 있어요" = 그 로그인으로 이미 따로 게임을 했음 (옮길 수 없어요).'));

  // dispute fix: give a monster directly
  const lineSel = lineSelect(S.lines.filter((l) => !l.withdrawn));
  const stageSel = h('select.inp', { style: { width: 'auto' }, 'aria-label': '단계' });
  const fillStages = () => {
    const l = S.lineById.get(Number(lineSel.value));
    stageSel.replaceChildren(...Array.from({ length: maxStage(l) }, (_, i) => h('option', { value: i + 1 }, `${i + 1}단계 · ${S.spById.get((Number(lineSel.value) - 1) * 3 + i + 1)?.name || '?'}`)));
  };
  lineSel.addEventListener('change', fillStages);
  fillStages();
  const grantBtn = h('button.btn.go', '지급');
  grantBtn.onclick = async () => {
    const line = Number(lineSel.value), stage = Number(stageSel.value);
    if (!line) return;
    const dex = (line - 1) * 3 + stage;
    const ok = await confirmBox('몬스터 직접 지급', [
      `${sid}에게 ${S.spById.get(dex)?.name || `#${dex}`} (${lineName(line)}, ${stage}단계)을(를) 줄까요?`,
      '이미 가진 계열이면 잡은 횟수가 +1 되고, 단계는 더 높은 쪽으로 맞춰져요. 기록에 남아요.',
    ], { ok: '지급' });
    if (!ok) return;
    busy(grantBtn, async () => {
      await rpc('admin_grant_monster', { p_student_id: sid, p_line: line, p_stage: stage });
      toast('몬스터를 지급했어요.');
      await reload();
    });
  };
  const grantBox = h('div.box.stack',
    h('h3', '몬스터 직접 지급 (분쟁 해결용)'),
    h('p.small-txt.muted', '부스 오류 등으로 몬스터를 못 받았을 때만 쓰세요.'),
    h('div.row', h('div', { style: { flex: '1 1 220px' } }, lineSel), stageSel, grantBtn));

  const dangerBox = h('div.box.stack',
    h('h3', '기록까지 삭제'),
    h('p.small-txt.muted', '다른 사람이 이 학번을 잘못 가져갔을 때만. 폰 분실은 위의 [다른 로그인으로 옮기기]를 쓰세요.'),
    h('div.row', h('button.btn.small.danger', { onclick: unlink }, '계정 연결 해제 (기록까지 삭제)…')));

  const tBox = h('div.box',
    h('h3', `티켓 (최근 ${tickets.length})`),
    tickets.length ? h('div.tbl-wrap.scroll-y', h('table.tbl',
      h('thead', h('tr', h('th', 'QR'), h('th', '상태'), h('th', '찍은 시각'), h('th', '결과'), h('th', ''))),
      h('tbody', tickets.map((t) => {
        const [label, cls] = TSTATUS[t.status] || [t.status, ''];
        return h('tr',
          h('td', h('span.mono', t.qr_id), ' ', S.qrById.get(t.qr_id)?.name || ''),
          h('td', chip(label, cls)),
          h('td', fmtTime(t.created_at)),
          h('td', t.result_species ? (S.spById.get(t.result_species)?.name || `#${t.result_species}`) : '–'),
          h('td', t.status === 'pending' ? h('button.btn.small', { onclick: cancel(t) }, '취소') : null));
      })))) : h('p.muted', '티켓이 없어요.'));

  const cBox = h('div.box',
    h('h3', `도감 (${coll.length}계열)`),
    coll.length ? h('div.coll-grid', coll.map((c) => {
      const dex = (c.line_id - 1) * 3 + c.stage;
      return h('div', sprite(dex, 64), h('div', h('b', S.spById.get(dex)?.name || `#${dex}`)),
        h('div', `${c.stage}단계 · ${c.catch_count}회`), c.evo_fails ? h('div.muted', `진화 실패 ${c.evo_fails}`) : null);
    })) : h('p.muted', '아직 잡은 몬스터가 없어요.'));

  const eBox = h('div.box',
    h('h3', `최근 기록 (${events.length})`),
    events.length ? h('div.tbl-wrap.scroll-y', h('table.tbl.events',
      h('thead', h('tr', h('th', '시각'), h('th', '종류'), h('th', '내용'))),
      h('tbody', events.map((e) => h('tr',
        h('td', { style: { whiteSpace: 'nowrap' } }, fmtTime(e.at)),
        h('td', chip(EVENT_KIND[e.kind] || e.kind, e.kind === 'admin' ? 'warn' : '')),
        h('td.small-txt', eventText(e))))))) : h('p.muted', '기록이 없어요.'));

  // 가방 물건 주기 · 레벨 정하기 (0020)
  const itemSel = h('select.inp', { 'aria-label': '물건' }, h('option', { value: '' }, '물건 불러오는 중…'));
  sb.from('items').select('key,name,pocket').order('sort').then(({ data }) => {
    itemSel.replaceChildren(...(data || []).map((x) => h('option', { value: x.key }, `${x.name} (${{ hold: '지닌 물건', med: '회복약', tool: '도구', tm: '기술머신' }[x.pocket]})`)));
  });
  const itemQty = h('input.inp', { type: 'number', min: 1, max: 99, value: 1, style: { width: '72px' }, 'aria-label': '개수' });
  const itemBtn = h('button.btn.go', '주기');
  itemBtn.onclick = () => busy(itemBtn, async () => {
    const r = await rpc('admin_give_item', { p_student_id: sid, p_item: itemSel.value, p_qty: Number(itemQty.value) });
    toast(`물건을 줬어요. (이제 ${r.qty}개)`);
  });
  const lvLine = lineSelect(S.lines.filter((l) => !l.withdrawn));
  const lvInp = h('input.inp', { type: 'number', min: 1, max: 100, value: 50, style: { width: '72px' }, 'aria-label': '레벨' });
  const lvBtn = h('button.btn', '레벨 정하기');
  lvBtn.onclick = () => busy(lvBtn, async () => {
    await rpc('admin_set_level', { p_student_id: sid, p_line: Number(lvLine.value), p_level: Number(lvInp.value) });
    toast('레벨을 바꿨어요.');
  });
  const growBox = h('div.box.stack',
    h('h3', '가방 물건 주기 · 레벨 정하기'),
    h('p.small-txt.muted', '이벤트 상품이나 오류 보상용. 학생 앱에서 가방을 열면 바로 보여요.'),
    h('div.row', h('div', { style: { flex: '1 1 220px' } }, itemSel), itemQty, itemBtn),
    h('div.row', h('div', { style: { flex: '1 1 220px' } }, lvLine), lvInp, lvBtn));

  return [info, relinkBox, grantBox, growBox, tBox, cBox, eBox, dangerBox];
}

const EVENT_KIND = { quiz: '퀴즈', evolve: '진화', redeem: '부스 지급', admin: '운영자' };
function eventText(e) {
  const d = e.data || {};
  if (e.kind === 'quiz') return d.correct ? '정답' : '오답';
  if (e.kind === 'evolve') return `${lineName(d.line)} 진화 ${d.success ? '성공' : '실패'} (지금 ${d.stage}단계)`;
  if (e.kind === 'redeem') return `몬스터 ${d.n ?? '?'}건 처리`;
  return JSON.stringify(d);
}

// ───────────────────────── 최종 랭킹 (상품용 · 실명) ─────────────────────────

function rankingSection() {
  const body = h('div.stack');
  const det = h('details.box.create',
    h('summary', '최종 랭킹 (상품용 · 실명) — 열면 불러와요'),
    body);
  const load = async () => {
    body.replaceChildren(h('p.loading', '불러오는 중…'));
    try {
      const rows = (await rpc('admin_export_ranking')) || [];
      const ranked = rows.filter((r) => r.rank != null);
      const cut = ranked[Math.min(29, ranked.length - 1)]?.rank;
      const top = ranked.filter((r) => r.rank <= cut);               // top 30 (+ anyone tied with 30th)
      body.replaceChildren(
        h('div.row',
          h('span', `랭킹 대상 ${ranked.length}명 · 전체 학생 ${rows.length}명`),
          h('span', { style: { flex: 1 } }),
          h('button.btn.small', { onclick: load }, '새로 고침'),
          h('button.btn.small.go', { onclick: () => downloadRankingCsv(rows) }, 'CSV 다운로드')),
        h('p.notice', '동점은 먼저 도달한 사람이 위(score_at). ', h('b', '실명이 보여요'), ' — 화면 공유·대형 화면에 띄우지 마세요. CSV에는 랭킹 제외(선생님·손님 등)와 0점 학생도 들어 있어요.'),
        top.length ? h('div.tbl-wrap.scroll-y', h('table.tbl',
          h('thead', h('tr', h('th.num', '순위'), h('th', '학번'), h('th', '이름'), h('th.num', '기수'), h('th.num', '점수'),
            h('th.num', '도감'), h('th.num', '최종 진화'), h('th.num', '희귀'), h('th.num', '포획'), h('th', '점수 도달'))),
          h('tbody', top.map((r) => h('tr',
            h('td.num', h('b', r.rank)), h('td.mono', r.student_id), h('td', r.name || '–'), h('td.num', r.gen ?? '–'),
            h('td.num', h('b', r.score)), h('td.num', r.dex), h('td.num', r.final_lines), h('td.num', r.rare), h('td.num', r.catches),
            h('td', { style: { whiteSpace: 'nowrap' } }, r.score_at ? fmtSec(r.score_at) : '–')))))) : h('p.muted', '아직 점수가 있는 학생이 없어요.'));
    } catch (e) { body.replaceChildren(h('p.warn-txt', msgOf(e)), h('button.btn.small', { onclick: load }, '다시 시도')); }
  };
  det.addEventListener('toggle', () => { if (det.open) load(); });
  return det;
}
const fmtSec = (iso) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

function downloadRankingCsv(rows) {
  const yes = (v) => (v ? 'O' : 'X');
  downloadCsv(`final_ranking_${toLocalInput(new Date().toISOString()).replace(/[-:]/g, '').replace('T', '_')}.csv`,
    [['순위', '학번', '이름', '기수', '점수', '점수 도달 시각', '도감 수', '최종 진화 계열', '희귀·전설 계열', '총 포획', '랭킹 포함', '랭킹 공개'],
      ...rows.map((r) => [r.rank ?? '', r.student_id, r.name || '', r.gen ?? '', r.score, r.score_at ? fmtSec(r.score_at) : '',
        r.dex, r.final_lines, r.rare, r.catches, yes(r.in_ranking), yes(r.show_on_board)])]);
}

// UTF-8 BOM CSV so Excel (Korean Windows) opens it correctly
function downloadCsv(filename, table) {
  const q = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = '﻿' + table.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ───────────────────────── 6. 로그인 코드 ─────────────────────────
// Backup login (admin_make_login_codes): <id>@code.local accounts whose password is a printed code.
// id = 5–6 digit student id (5 digits → zero-padded) or 2–12 letters/digits for teachers/guests (profile 'g:<id>', no 기수).

function normCodeId(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (/^[0-9]+$/.test(v)) return /^[0-9]{5,6}$/.test(v) ? v.padStart(6, '0') : null;   // all digits → must be a student id
  return /^[a-z0-9]{2,12}$/.test(v) ? v : null;
}
const isStudentCodeId = (id) => /^[0-9]{6}$/.test(id);
const codeProfileId = (id) => (isStudentCodeId(id) ? id : 'g:' + id);

// "아이디,이름" per line (comma or tab, so a spreadsheet paste works). → { items, bad }
function parseCodeList(text) {
  const items = [], bad = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const [rawId, ...rest] = line.split(/[,\t]/);
    const id = normCodeId(rawId);
    if (!id) {
      if (!(i === 0 && /아이디|학번|id/i.test(rawId))) bad.push(`${i + 1}줄: ${line.trim()}`);   // a header row is skipped quietly
      return;
    }
    items.push({ id, name: rest.join(',').trim().slice(0, 40) });
  });
  return { items, bad };
}

async function tabCodes() {
  const out = h('div');
  const drawResult = () => out.replaceChildren(...codeResult(drawResult));
  drawResult();

  // (a) range generator
  const from = h('input.inp.mono', { inputmode: 'numeric', placeholder: '예: 022001', maxlength: 6, autocomplete: 'off' });
  const to = h('input.inp.mono', { inputmode: 'numeric', placeholder: '예: 022040', maxlength: 6, autocomplete: 'off' });
  const rangeBtn = h('button.btn.go', { type: 'submit' }, '범위로 코드 만들기');
  const rangeForm = h('form.box.stack.no-print', {
    onsubmit: (e) => {
      e.preventDefault();
      const a = normCodeId(from.value), b = normCodeId(to.value);
      const okA = !!a && isStudentCodeId(a), okB = !!b && isStudentCodeId(b);
      from.classList.toggle('bad', !okA);
      to.classList.toggle('bad', !okB);
      if (!okA || !okB) { toast('시작·끝 학번은 5~6자리 숫자예요.'); return; }
      const n0 = Number(a), n1 = Number(b);
      if (n1 < n0) { toast('끝 학번이 시작 학번보다 작아요.'); to.classList.add('bad'); return; }
      if (n1 - n0 + 1 > 1000) { toast('한 번에 1000명까지만 만들 수 있어요. 범위를 나눠 주세요.'); return; }
      const items = [];
      for (let n = n0; n <= n1; n++) items.push({ id: String(n).padStart(6, '0'), name: '' });
      busy(rangeBtn, () => makeCodes(items, drawResult));
    },
  },
  h('h2', '(가) 학번 범위로 만들기'),
  h('p.small-txt.muted', '한 반·한 기수를 한꺼번에 만들 때 써요. 이름 칸은 비어 있어요.'),
  h('div.fields', field('시작 학번', from), field('끝 학번 (포함)', to)),
  h('div.row.end', rangeBtn));

  // (b) pasted list
  const ta = h('textarea.inp.mono', { rows: 8, spellcheck: 'false', placeholder: '022001,김하프\n022002,이외대\nT01,수학 선생님\nGUEST1,학부모' });
  const preview = h('p.small-txt');
  const showPreview = () => {
    const { items, bad } = parseCodeList(ta.value);
    const guests = items.filter((x) => !isStudentCodeId(x.id)).length;
    preview.replaceChildren(
      `${items.length}명 인식`, guests ? ` (선생님·손님 ${guests}명)` : '',
      bad.length ? h('span.warn-txt', ` · 형식 오류 ${bad.length}줄 — 빼고 만들어요: ${bad.slice(0, 5).join(' / ')}${bad.length > 5 ? ' …' : ''}`) : '');
  };
  ta.addEventListener('input', showPreview);
  showPreview();
  const listBtn = h('button.btn.go', { type: 'submit' }, '목록으로 코드 만들기');
  const listForm = h('form.box.stack.no-print', {
    onsubmit: (e) => {
      e.preventDefault();
      const { items } = parseCodeList(ta.value);
      if (!items.length) { toast('만들 아이디가 없어요. "아이디,이름" 형식으로 한 줄에 한 명씩 넣어 주세요.'); ta.classList.add('bad'); return; }
      ta.classList.remove('bad');
      busy(listBtn, () => makeCodes(items, drawResult));
    },
  },
  h('h2', '(나) 목록 붙여넣기'),
  h('p.small-txt.muted', '한 줄에 한 명: 아이디,이름 (엑셀에서 두 칸을 복사해 붙여도 돼요). 아이디 = 5~6자리 학번, 또는 선생님·손님용 영문/숫자 2~12자 (예: T01, GUEST1).'),
  field('아이디,이름', ta), preview,
  h('div.row.end', listBtn));

  const help = h('div.box.stack.no-print',
    h('h2', '로그인 코드 (예비 로그인)'),
    h('p', '구글 비밀번호를 잊은 학생, 학교 구글 계정이 없는 선생님·손님을 위한 예비 로그인이에요. 코드를 쪽지로 인쇄해서 나눠 주세요.'),
    h('ul.small-txt',
      h('li', '앱 로그인 화면 → "구글 로그인이 안 되면: 학번·코드로 로그인" → 아이디와 코드 입력.'),
      h('li', h('b', '코드는 만든 직후 이 화면에서 딱 한 번만 보여요.'), ' 바로 인쇄하거나 CSV로 저장하세요. 나중에 다시 볼 방법이 없어요.'),
      h('li.warn-txt', '같은 아이디로 다시 만들면 코드가 바뀌고, 예전 코드는 바로 못 써요 (잃어버린 쪽지를 무효로 만들 때 쓰세요).'),
      h('li', '선생님·손님 아이디(예: T01)는 학생 목록에서 ', h('span.mono', 'g:t01'), ' 같은 계정이 되고, 기수가 없어요. 학생 탭에서 "g:"로 찾을 수 있어요.'),
      h('li', `서버에는 한 번에 최대 ${CODE_BATCH}명씩 보내요 (더 많으면 자동으로 나눠서 보내요).`)));

  return [help, h('div.cols', rangeForm, listForm), out];
}

async function makeCodes(items, drawResult) {
  const seen = new Map();
  for (const it of items) if (!seen.has(it.id)) seen.set(it.id, it);
  const list = [...seen.values()];
  const guests = list.filter((x) => !isStudentCodeId(x.id));
  const sample = list.slice(0, 6).map((x) => x.id).join(', ') + (list.length > 6 ? ' …' : '');
  if (S.codes && !S.codesSaved) {
    const again = await confirmBox('아직 저장 안 한 코드가 있어요', ['지금 보이는 코드를 인쇄하거나 CSV로 저장하지 않았어요. 새로 만들면 지금 코드는 화면에서 사라져요 (다시 볼 수 없어요).'], { ok: '그래도 새로 만들기', danger: true });
    if (!again) return;
  }
  const ok = await confirmBox(`로그인 코드 ${list.length}명 만들기`, [
    `아이디: ${sample}`,
    guests.length ? `이 중 ${guests.length}명은 선생님·손님 계정(g:…, 기수 없음)이 돼요.` : null,
    h('p.warn-txt', '이미 코드가 있던 아이디는 새 코드로 바뀌고, 예전 코드는 바로 못 써요.'),
    '만든 코드는 지금 한 번만 보여요. 바로 인쇄하거나 CSV로 저장하세요.',
  ].filter(Boolean), { ok: '만들기' });
  if (!ok) return;

  const rows = [];
  try {
    for (let i = 0; i < list.length; i += CODE_BATCH) {
      const part = list.slice(i, i + CODE_BATCH);
      const r = await rpc('admin_make_login_codes', { p_ids: part.map((x) => x.id), p_names: part.map((x) => x.name) });
      rows.push(...(r || []));
      if (list.length > CODE_BATCH) toast(`${Math.min(i + CODE_BATCH, list.length)}/${list.length}명 만듦…`);
    }
  } finally {
    // codes already issued (even if a later batch failed) must still be shown — they are never shown again
    if (rows.length) {
      S.codes = { at: new Date().toISOString(), rows };
      S.codesSaved = false;
      drawResult();
    }
  }
  const skipped = list.length - rows.length;
  toast(`로그인 코드 ${rows.length}개를 만들었어요.${skipped ? ` (${skipped}개는 형식이 맞지 않아 건너뜀)` : ''} 지금 인쇄하거나 CSV로 저장하세요!`, 6000);
}

function codeResult(drawResult) {
  if (!S.codes) return [];
  const { rows, at } = S.codes;
  const print = () => { S.codesSaved = true; window.print(); };
  const clear = async () => {
    if (!S.codesSaved && !(await confirmBox('코드 화면 지우기', ['아직 인쇄하거나 저장하지 않았어요. 지우면 이 코드들을 다시 볼 수 없어요 (다시 만들면 코드가 바뀌어요).'], { ok: '지우기', danger: true }))) return;
    S.codes = null; S.codesSaved = true; drawResult();
  };
  const bar = h('div.box.stack.no-print',
    h('div.row', h('h2', `만든 로그인 코드 (${rows.length}명)`), h('span', { style: { flex: 1 } }),
      h('button.btn.go', { onclick: print }, '🖨 쪽지 인쇄'),
      h('button.btn', { onclick: () => { downloadCodesCsv(rows, at); S.codesSaved = true; } }, 'CSV 저장'),
      h('button.btn.small', { onclick: clear }, '화면에서 지우기')),
    h('p.notice.red', h('b', '이 코드는 지금 한 번만 보여요. '), '페이지를 닫거나 새로 고치기 전에 인쇄하거나 CSV로 저장하세요.'),
    h('p.small-txt.muted', `${fmtTime(at)}에 만듦 · 한 줄에 3장씩 인쇄돼요. 점선을 따라 잘라서 나눠 주세요.`));
  const slips = h('div.slip-grid', rows.map((r) => {
    const guest = !isStudentCodeId(r.id);
    return h('div.slip',
      h('div.slip-title', `${CONFIG.GAME_TITLE} 로그인 코드`),
      h('div.slip-who', h('span.slip-id.mono', guest ? r.id.toUpperCase() : r.id), r.name ? h('span.slip-name', r.name) : null),
      h('div.slip-code.mono', r.code),
      h('div.slip-help', "앱 로그인 화면 → '학번·코드로 로그인' → 아이디와 코드 입력"),
      h('div.slip-note', guest ? `선생님·손님 계정 (${codeProfileId(r.id)}) · 다시 발급하면 이 코드는 못 써요` : '다시 발급하면 이 코드는 못 써요 · 남에게 보여 주지 마세요'));
  }));
  return [bar, slips];
}

function downloadCodesCsv(rows, at) {
  downloadCsv(`login_codes_${toLocalInput(at).replace(/[-:]/g, '').replace('T', '_')}.csv`,
    [['아이디', '이름', '코드', '프로필'], ...rows.map((r) => [r.id, r.name || '', r.code, codeProfileId(r.id)])]);
}

window.addEventListener('beforeunload', (e) => {
  if (S.codes && !S.codesSaved) { e.preventDefault(); e.returnValue = ''; }
});

// ───────────────────────── 7. 설정 ─────────────────────────

// 운영진: 구글 이메일로 운영자·부스 스태프 초대 / 해제 (0009). 목록 = settings.admin_emails / booth_emails
async function tabStaff() {
  const ROLE = { admin: '운영자', booth: '부스 스태프' };
  const list = h('div');
  const draw = (rows) => list.replaceChildren(rows.length ? h('div.tbl-wrap', h('table.tbl',
    h('thead', h('tr', h('th', '구글 이메일'), h('th', '역할'), h('th', '상태'), h('th', ''))),
    h('tbody', rows.map((r) => {
      const del = h('button.btn.small.danger', { disabled: r.me, title: r.me ? '내 계정은 다른 운영자만 바꿀 수 있어요' : '' }, '해제');
      del.onclick = () => {
        if (!confirm(`${r.email} 의 ${ROLE[r.role]} 권한을 해제할까요?`)) return;
        busy(del, async () => { draw(await rpc('admin_remove_staff', { p_email: r.email })); toast('해제했어요.'); });
      };
      return h('tr',
        h('td.mono', r.email, r.me ? h('span.small-txt.muted', ' (나)') : null),
        h('td', chip(ROLE[r.role] || r.role, r.role === 'admin' ? 'hot' : 'blue')),
        h('td', r.joined ? chip('로그인함', 'ok') : chip('아직 로그인 전', 'off')),
        h('td', del));
    })))) : h('p.muted', '아직 아무도 없어요.'));
  draw(await rpc('admin_list_staff'));

  const email = h('input.inp', { type: 'email', placeholder: '예: teacher@gmail.com', autocomplete: 'off', required: true });
  const role = h('select.inp', h('option', { value: 'admin' }, '운영자 (이 페이지 전체)'), h('option', { value: 'booth' }, '부스 스태프 (부스·TV 화면)'));
  const add = h('button.btn.go', { type: 'submit' }, '초대하기');
  const form = h('form.box.stack', {
    onsubmit: (e) => {
      e.preventDefault();
      busy(add, async () => {
        draw(await rpc('admin_invite_staff', { p_email: email.value, p_role: role.value }));
        toast(`${email.value.trim()} 를 ${ROLE[role.value]}(으)로 추가했어요.`);
        email.value = '';
      });
    },
  },
    h('h2', '구글 이메일로 운영진 등록'),
    h('p.small-txt', '그 사람의 ', h('b', '구글 계정 이메일'), '을 적으면 끝이에요. 그 계정으로 이 사이트에 구글 로그인하면 바로 권한이 생겨요. 이미 로그인한 적이 있으면 지금 바로 바뀌어요.'),
    h('div.row', email, role, add),
    h('p.small-txt.muted', '구글 계정이 있는 운영진만 이 방법을 써요. 구글이 없으면 위의 운영진 아이디를 만들어 주세요. 내 권한은 다른 운영자만 바꿀 수 있어요.'));

  const site = new URL('.', location.href).href.replace(/\/$/, '');
  const links = h('div.box.stack',
    h('h2', '운영 화면 주소'),
    h('p.small-txt', '운영진에게 이 주소를 보내 주세요.'),
    ...[['admin', '운영자 페이지'], ['booth', '부스 화면 (태블릿·노트북)'], ['screen', 'TV 대형 화면']].map(([p, t]) =>
      h('div', h('b', t, ': '), h('a.mono', { href: `${site}/${p}.html`, target: '_blank', rel: 'noopener' }, `${site}/${p}.html`))));

  // ── 운영진 아이디 (0018): 운영자가 만들고, 비밀번호는 한 번만 보여 준다 ──
  const ids = h('div');
  const showPw = (title, r) => modal(title, h('div.stack',
    h('p', '아래 아이디와 비밀번호를 그 사람에게 전해 주세요. ', h('b', '비밀번호는 지금만 보여요'), ' (잊으면 [비밀번호 새로 만들기]).'),
    h('div.box.mono', { style: { fontSize: '20px' } }, `아이디: ${r.id}`, h('br'), `비밀번호: ${r.password}`),
    h('p.small-txt.muted', '앱·운영자 페이지·부스·TV 화면 어디서든 "아이디로 로그인"에 넣으면 돼요.')), [{ label: '확인', value: true, cls: 'go' }]);
  const drawIds = (rows) => ids.replaceChildren(rows.length ? h('div.tbl-wrap', h('table.tbl',
    h('thead', h('tr', h('th', '아이디'), h('th', '이름'), h('th', '역할'), h('th', '마지막 로그인'), h('th', ''))),
    h('tbody', rows.map((r) => {
      const reset = h('button.btn.small', '비밀번호 새로 만들기');
      reset.onclick = () => busy(reset, async () => {
        if (!(await confirmBox('비밀번호 새로 만들기', [`${r.id} 의 비밀번호를 새로 만들까요? 지금 로그인된 기기는 모두 로그아웃돼요.`], { ok: '새로 만들기' }))) return;
        showPw('새 비밀번호', await rpc('admin_reset_staff_password', { p_id: r.id }));
      });
      const del = h('button.btn.small.danger', { disabled: r.me, title: r.me ? '지금 로그인한 내 계정은 지울 수 없어요' : '' }, '삭제');
      del.onclick = () => busy(del, async () => {
        if (!(await confirmBox('운영진 아이디 삭제', [`${r.id} 아이디를 지울까요? 이 아이디로는 더 이상 로그인할 수 없어요.`], { ok: '삭제', danger: true }))) return;
        await rpc('admin_remove_staff_login', { p_id: r.id });
        drawIds(await rpc('admin_list_staff_logins')); toast('지웠어요.');
      });
      return h('tr', h('td.mono', r.id, r.me ? h('span.small-txt.muted', ' (나)') : null), h('td', r.name),
        h('td', chip(ROLE[r.role] || r.role, r.role === 'admin' ? 'hot' : 'blue')),
        h('td', r.last ? new Date(r.last).toLocaleString('ko-KR') : '–'), h('td', reset, ' ', del));
    })))) : h('p.muted', '아직 운영진 아이디가 없어요.'));
  drawIds(await rpc('admin_list_staff_logins'));
  const nid = h('input.inp', { placeholder: '아이디 (영문으로 시작, 4~16자)', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', required: true });
  const nname = h('input.inp', { placeholder: '이름 (예: 김선생님)', maxlength: 20 });
  const nrole = h('select.inp', h('option', { value: 'booth' }, '부스 스태프 (부스·TV 화면)'), h('option', { value: 'admin' }, '운영자 (이 페이지 전체)'));
  const make = h('button.btn.go', { type: 'submit' }, '아이디 만들기');
  const idMake = h('form.box.stack', {
    onsubmit: (e) => {
      e.preventDefault();
      busy(make, async () => {
        const r = await rpc('admin_create_staff_login', { p_id: nid.value, p_role: nrole.value, p_name: nname.value });
        nid.value = ''; nname.value = '';
        drawIds(await rpc('admin_list_staff_logins'));
        await showPw('운영진 아이디를 만들었어요', r);
      });
    },
  },
    h('h2', '운영진 아이디 만들기'),
    h('p.small-txt', '구글 계정이 없어도 돼요. 아이디를 정하면 서버가 12자리 비밀번호를 만들어 줘요. 학생이 스스로 만든 아이디는 운영진이 될 수 없어요.'),
    h('div.row', nid, nname, nrole, make));

  return [h('div.cols', idMake, links), h('div.box.stack', h('h2', '운영진 아이디'), ids),
    h('div.cols', form, h('div.box.stack', h('h2', '구글로 등록된 운영진'), list))];
}

// 요청: 비밀번호 초기화 요청 (허용하면 학생이 고른 새 비밀번호로 바뀜) + 학생 문의함 (0011)
async function tabReq() {
  const box = h('div.stack');
  const draw = (d) => {
    const pending = d.resets.filter((r) => r.status === 'pending');
    const done = d.resets.filter((r) => r.status !== 'pending').slice(0, 30);
    const open = d.inquiries.filter((q) => q.status === 'open');
    const resetRow = (r) => {
      const ok = h('button.btn.small.go', '허용');
      const no = h('button.btn.small.danger', '거절');
      ok.onclick = () => {
        if (!confirm(`${r.student_id} 의 비밀번호를 학생이 요청한 새 비밀번호로 바꿀까요?\n\n학생증(또는 본인)을 확인했나요? 허용하면 이 번호에 연결된 구글 계정이 모두 풀리고 모든 기기에서 로그아웃돼요.`)) return;
        busy(ok, async () => { draw(await rpc('admin_decide_reset', { p_id: r.id, p_approve: true })); toast(`${r.student_id}: 새 비밀번호로 바꿨어요.`); });
      };
      no.onclick = () => busy(no, async () => { draw(await rpc('admin_decide_reset', { p_id: r.id, p_approve: false })); toast('거절했어요.'); });
      const same = r.account_name && r.account_name === r.name;
      return h('tr',
        h('td.mono', r.student_id),
        h('td', r.account_name || h('span.muted', '(이름 없음)')),
        h('td', r.name, ' ', same ? chip('이름 같음', 'ok') : chip('이름 다름', 'hot')),
        h('td', r.note || '–'),
        h('td', r.from_app ? '앱(로그인 상태)' : '로그인 화면'),
        h('td.num', r.google_links),
        h('td', timeAgo(r.created_at)),
        h('td', r.status === 'pending' ? h('div.row', ok, no) : chip(r.status === 'approved' ? '허용함' : '거절함', r.status === 'approved' ? 'ok' : 'off')));
    };
    const resetTable = (rows) => h('div.tbl-wrap', h('table.tbl',
      h('thead', h('tr', h('th', '고유번호'), h('th', '계정 이름'), h('th', '요청자가 적은 이름'), h('th', '메모'), h('th', '보낸 곳'), h('th.num', '연결된 구글'), h('th', '언제'), h('th', ''))),
      h('tbody', rows.map(resetRow))));
    const inqRow = (q) => {
      const b = h('button.btn.small', q.status === 'open' ? '처리 완료' : '다시 열기');
      b.onclick = () => busy(b, async () => draw(await rpc('admin_set_inquiry', { p_id: q.id, p_done: q.status === 'open' })));
      return h('tr', h('td.mono', q.student_id || '–'), h('td', q.name || '–'), h('td', { style: { whiteSpace: 'pre-wrap', maxWidth: '520px' } }, q.body),
        h('td', timeAgo(q.created_at)), h('td', q.status === 'open' ? chip('새 문의', 'hot') : chip('완료', 'off')), h('td', b));
    };
    box.replaceChildren(
      h('div.box.stack',
        h('h2', `비밀번호 초기화 요청 ${pending.length ? `(${pending.length})` : ''}`),
        h('p.notice', h('b', '허용하기 전에 꼭 본인 확인! '), '이름은 친구도 알 수 있어요. 부스에서 학생증(또는 얼굴)을 보고 허용하세요. ',
          '학교 구글 계정이 있는 학생은 운영자 없이 직접 초기화할 수 있어요 (학교 계정으로 로그인 → 고유번호 입력 → "학교 계정으로 비밀번호 새로 정하기"). 그쪽으로 안내하는 게 더 안전해요.'),
        pending.length ? resetTable(pending) : h('p.muted', '기다리는 요청이 없어요.'),
        done.length ? h('details', h('summary', `처리한 요청 ${done.length}개`), resetTable(done)) : null),
      h('div.box.stack',
        h('h2', `학생 문의 ${open.length ? `(새 문의 ${open.length})` : ''}`),
        h('p.small-txt.muted', '학생 앱 ⚙ 설정 → "운영진에게 문의하기"로 들어온 내용이에요.'),
        d.inquiries.length ? h('div.tbl-wrap', h('table.tbl',
          h('thead', h('tr', h('th', '고유번호'), h('th', '이름'), h('th', '내용'), h('th', '언제'), h('th', '상태'), h('th', ''))),
          h('tbody', d.inquiries.map(inqRow)))) : h('p.muted', '아직 문의가 없어요.')));
  };
  draw(await rpc('admin_list_requests'));
  const reload = h('button.btn.small', '새로 고침');
  reload.onclick = () => busy(reload, async () => draw(await rpc('admin_list_requests')));
  return [h('div.row', reload), box];
}

// 레이드: 아무 몬스터로 레이드 열기 (TV = 현장 QR, 인쇄 = 고정 QR) + 진행 중인 레이드 (0013)
function spriteImg(id, size = 56) {
  const c = document.createElement('canvas');
  const im = new Image();
  im.onload = () => {
    c.width = c.height = size;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(im, ((id - 1) % 12) * 64, Math.floor((id - 1) / 12) * 64, 64, 64, 0, 0, size, size);
  };
  im.src = 'sprites/atlas.png';
  c.style.width = c.style.height = `${size}px`;
  c.style.imageRendering = 'pixelated';
  return c;
}

async function tabRaid() {
  if (!S.species?.length) await loadCatalog();
  const list = h('div');
  const STATUS = { active: ['진행 중', 'hot'], won: ['승리', 'ok'], failed: ['끝 (실패)', 'off'] };
  const draw = (rows) => list.replaceChildren(rows.length ? h('div.tbl-wrap', h('table.tbl',
    h('thead', h('tr', h('th', ''), h('th', '레이드'), h('th', '상태'), h('th', '체력'), h('th.num', '참가'), h('th.num', '보상'), h('th', '끝나는 시각'), h('th', ''))),
    h('tbody', rows.map((r) => {
      const end = h('button.btn.small.danger', '끝내기');
      end.onclick = () => { if (confirm(`${r.title}을(를) 지금 끝낼까요? (실패 처리, 보상 없음)`)) busy(end, async () => { await rpc('admin_end_raid', { p_id: r.id }); draw(await rpc('admin_list_raids')); }); };
      const qr = h('button.btn.small', '인쇄용 QR');
      qr.onclick = () => showRaidQr(r);
      const [label, cls] = STATUS[r.status] || [r.status, 'off'];
      return h('tr',
        h('td', spriteImg(r.species_id, 40)),
        h('td', h('b', r.title), h('br'), h('small.muted', `${r.q} · ${r.kind === 'slot' ? '시간대 전설' : r.kind === 'legend' ? '교장·교감' : '운영자'} · ${r.tv ? 'TV' : '인쇄 QR'}`)),
        h('td', chip(label, cls)),
        h('td.mono', `${r.hp.toLocaleString()} / ${r.hp_max.toLocaleString()}`),
        h('td.num', r.players), h('td.num', r.rewarded ?? 0), h('td', fmtTime(r.ends_at)),
        h('td', h('div.row', r.status === 'active' && !r.tv && r.t ? qr : null, r.status === 'active' ? end : null)));
    })))) : h('p.muted', '아직 레이드가 없어요.'));
  draw(await rpc('admin_list_raids'));

  const sel = h('select.inp', S.species.map((sp) => {
    const l = S.lineById.get(sp.line_id);
    return h('option', { value: sp.id }, `${sp.name} (${l?.subject || ''} · ${l?.max_stage === 1 ? '전설' : sp.stage + '단계'})`);
  }));
  sel.value = '3';
  const pic = h('div', spriteImg(3, 72));
  sel.onchange = () => pic.replaceChildren(spriteImg(Number(sel.value), 72));
  // 프리셋 고르기 + "직접 입력" → 숫자 칸
  const preset = (opts, unit, min, max) => {
    const own = h('input.inp', { type: 'number', inputmode: 'numeric', min, max, placeholder: `${min}~${max.toLocaleString()} ${unit}`, hidden: true });
    const s = h('select.inp', opts.map(([v, t, on]) => h('option', { value: v, selected: on }, t)), h('option', { value: 'own' }, '직접 입력…'));
    s.onchange = () => { own.hidden = s.value !== 'own'; if (!own.hidden) own.focus(); };
    return { el: h('div.stack', s, own), get value() { return s.value === 'own' ? Number(own.value) : Number(s.value); }, min, max };
  };
  const hp = preset([[3000, '작게 3,000 (5~10명)'], [12000, '보통 12,000 (20~30명)', true], [40000, '크게 40,000 (50~100명)'], [100000, '아주 크게 100,000']], '체력', 10, 10000000);
  const mins = preset([5, 10, 15, 30, 60].map((m) => [m, `${m}분`, m === 10]), '분', 1, 600);
  const mode = h('select.inp', h('option', { value: 'tv' }, 'TV 대형 화면 (30초마다 바뀌는 현장 QR)'), h('option', { value: 'print' }, '인쇄용 고정 QR (아무 데나 붙이기)'));
  const title = h('input.inp', { placeholder: '레이드 이름 (비우면 "몬스터 이름 레이드")', maxlength: 40 });
  const go = h('button.btn.go', { type: 'submit' }, '레이드 열기');
  const form = h('form.box.stack', {
    onsubmit: (e) => {
      e.preventDefault();
      for (const [f, name] of [[hp, '보스 체력'], [mins, '시간']]) {
        if (!Number.isInteger(f.value) || f.value < f.min || f.value > f.max) { toast(`${name}은(는) ${f.min}~${f.max.toLocaleString()} 사이 숫자로 넣어 주세요.`); return; }
      }
      busy(go, async () => {
        const r = await rpc('admin_create_raid', { p_species: Number(sel.value), p_hp: Number(hp.value), p_minutes: Number(mins.value), p_tv: mode.value === 'tv', p_title: title.value });
        toast(`${r.title}을(를) 열었어요.`);
        title.value = '';
        draw(await rpc('admin_list_raids'));
        if (!r.tv) showRaidQr(r);
      });
    },
  },
    h('h2', '레이드 열기'),
    h('p.small-txt', '아무 몬스터(3단계 진화형도 가능)로 레이드를 열 수 있어요. QR을 찍은 학생들이 다 같이 보스를 탭해서 체력을 0으로 만들면, 10번 이상 공격한 모두가 그 몬스터 특별 티켓을 받아요 (가방 5칸 제한 없음). 시간 안에 못 잡으면 실패.'),
    h('div.row', pic, h('label.field', { style: { flex: 1 } }, h('span', '보스 몬스터'), sel)),
    h('div.row', h('label.field', h('span', '보스 체력'), hp.el), h('label.field', h('span', '시간'), mins.el)),
    h('label.field', h('span', 'QR 방식'), mode), title, go);
  const reload = h('button.btn.small', '새로 고침');
  reload.onclick = () => busy(reload, async () => draw(await rpc('admin_list_raids')));
  return [form, h('div.box.stack', h('div.row', h('h2', { style: { flex: 1 } }, '레이드 목록'), reload), list,
    h('p.small-txt.muted', '시간대 전설 레이드(아침 소디포·점심 유리프·저녁 TTU)는 TV 화면이 켜져 있으면 설정 raid_slots 시간에 자동으로 열려요.'))];
}

function showRaidQr(r) {
  const url = placeUrl(siteBase(), r.q, r.t);
  const cv = drawQR(document.createElement('canvas'), url, { cell: 10, margin: 4 });
  const w = window.open('', '_blank');
  if (!w) { toast('팝업이 막혔어요. 팝업을 허용해 주세요.'); return; }
  w.document.title = r.title;
  w.document.body.style.cssText = 'font-family:sans-serif;text-align:center;padding:24px';
  w.document.body.innerHTML = `<h1>${r.title.replace(/</g, '&lt;')}</h1><p>QR을 찍고 레이드에 참가하세요! (${r.q})</p>`;
  const img = w.document.createElement('img'); img.src = cv.toDataURL(); img.style.width = '360px'; img.style.imageRendering = 'pixelated';
  w.document.body.append(img);
}

async function tabSet() {
  const rows = await tq(sb.from('settings').select('*').order('key'));
  const fo = rows.find((r) => r.key === 'festival_open');
  const open = fo ? isOn(fo.value) : false;
  const sr = rows.find((r) => r.key === 'self_redeem');
  const selfOn = sr ? isOn(sr.value) : false;
  setBanner(open, selfOn);

  const toggle = h('button.btn' + (open ? '.primary' : '.go'), open ? '게임 정지 (OFF)' : '게임 재개 (ON)');
  toggle.onclick = async () => {
    const ok = await confirmBox(open ? '게임을 정지할까요?' : '게임을 다시 시작할까요?', open
      ? ['정지하면 학생 스캔 업로드, 부스 몬스터 지급, 진화가 모두 멈춰요.', '문제가 생겼을 때만 쓰는 비상 스위치예요.']
      : ['다시 켜면 모든 기능이 바로 동작해요.'], { ok: open ? '정지하기' : '다시 켜기', danger: open });
    if (!ok) return;
    busy(toggle, async () => {
      await tq(sb.from('settings').update({ value: !open, updated_at: new Date().toISOString() }).eq('key', 'festival_open'));
      toast(open ? '게임을 정지했어요.' : '게임을 다시 켰어요.');
      rerender();
    });
  };

  const kill = h('div.box.stack',
    h('h2', '비상 스위치 (festival_open)'),
    h('div.kill', h('div.state', { class: open ? 'ok-txt' : 'warn-txt' }, open ? '● 운영 중 (ON)' : '■ 정지됨 (OFF)'), toggle),
    h('p.small-txt.muted', fo ? `마지막 변경: ${fmtTime(fo.updated_at)}` : 'festival_open 설정이 없어요.'));

  const selfBtn = h('button.btn' + (selfOn ? '.primary' : '.gold'), { disabled: !sr }, selfOn ? '셀프 지급 끄기' : '셀프 지급 켜기');
  selfBtn.onclick = async () => {
    const ok = await confirmBox(selfOn ? '셀프 지급을 끌까요?' : '셀프 지급을 켤까요?', selfOn
      ? ['끄면 다시 부스에서만 몬스터를 받을 수 있어요.', '학생 앱의 "직접 받기" 버튼은 앱이 다음에 동기화할 때 사라져요.']
      : [h('p.warn-txt', '부스 줄이 너무 길 때만 쓰세요!'),
        '켜면 학생이 부스에 오지 않고 앱에서 직접 대기 티켓을 몬스터로 바꿀 수 있어요.',
        '부스에서 확인하지 않으니, 줄이 줄어들면 꼭 다시 꺼 주세요.'],
    { ok: selfOn ? '끄기' : '켜기', danger: !selfOn });
    if (!ok) return;
    busy(selfBtn, async () => {
      await tq(sb.from('settings').update({ value: !selfOn, updated_at: new Date().toISOString() }).eq('key', 'self_redeem'));
      toast(selfOn ? '셀프 지급을 껐어요.' : '셀프 지급을 켰어요. 부스가 한가해지면 꺼 주세요.');
      rerender();
    });
  };
  const selfCard = h('div.box.stack' + (selfOn ? '.self-on' : ''),
    h('h2', '셀프 지급 모드 (self_redeem)'),
    h('p.small-txt', h('b', '부스가 너무 밀릴 때만: 학생이 앱에서 직접 몬스터 받기')),
    h('div.kill', h('div.state', { class: selfOn ? 'warn-txt' : 'muted' }, selfOn ? '● 켜짐 (학생 직접 받기)' : '○ 꺼짐 (부스에서만)'), selfBtn),
    h('p.small-txt.muted', sr ? `마지막 변경: ${fmtTime(sr.updated_at)}` : 'self_redeem 설정이 없어요 (마이그레이션 0003 필요).'));

  const table = h('div.box',
    h('h2', '설정값 (JSON)'),
    h('p.small-txt.muted', '값은 JSON 형식이에요: 숫자 3, 참/거짓 true, 글자 "abc", 목록 ["a","b"], 없음 null. 저장 전에 형식을 검사해요.'),
    h('p.small-txt.muted', 'festival_close_at = 축제 끝나는 시각 · min_client_version = 올리면 옛 버전 폰에 "업데이트" 배너 · rotating_accept_sec = 대형 화면 QR 인정 시간(초)'),
    h('div.tbl-wrap', h('table.tbl',
      h('thead', h('tr', h('th', '키'), h('th', '값'), h('th', ''))),
      h('tbody', rows.filter((r) => !CARD_KEYS.includes(r.key)).map((r) => {
        const ta = h('textarea.inp.json', { rows: 1, spellcheck: 'false', 'aria-label': r.key }, JSON.stringify(r.value));
        const msg = h('div.small-txt');
        const valid = () => {
          try { JSON.parse(ta.value); ta.classList.remove('bad'); msg.textContent = ''; return true; } catch { ta.classList.add('bad'); msg.textContent = 'JSON 형식이 아니에요'; msg.className = 'small-txt warn-txt'; return false; }
        };
        ta.addEventListener('input', valid);
        const save = h('button.btn.small.go', '저장');
        save.onclick = () => {
          if (!valid()) { toast(`${r.key}: JSON 형식이 아니에요.`); return; }
          const value = JSON.parse(ta.value);
          if (r.key === 'festival_close_at' && value !== null && (typeof value !== 'string' || Number.isNaN(Date.parse(value)))) {
            toast('festival_close_at은 "2026-11-07T16:00:00+09:00"처럼 따옴표로 감싼 시각, 또는 null이에요.', 5000);
            ta.classList.add('bad');
            return;
          }
          busy(save, async () => {
            await tq(sb.from('settings').update({ value, updated_at: new Date().toISOString() }).eq('key', r.key));
            if (r.key === 'token_grace_minutes') S.grace = Number(value) || 30;
            if (r.key === 'qr_daily_cap') S.dailyCap = Number(value) || S.dailyCap;
            ta.value = JSON.stringify(value);
            msg.className = 'small-txt ok-txt'; msg.textContent = '저장됨';
            toast(`${r.key} 저장했어요.`);
          });
        };
        const when = r.key === 'festival_close_at' && typeof r.value === 'string' && !Number.isNaN(Date.parse(r.value))
          ? h('div.small-txt', `= ${new Date(r.value).toLocaleString('ko-KR')}`) : null;
        return h('tr',
          h('td', h('b.mono', r.key), h('div.small-txt.muted', SETTING_HELP[r.key] || ''), h('div.small-txt.muted', `변경 ${timeAgo(r.updated_at)}`)),
          h('td', { style: { minWidth: '180px', width: '50%' } }, ta, when, msg),
          h('td', save));
      })))));
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  return [h('div.cols', kill, selfCard),
    h('div.cols',
      h('div', textSettingCard(byKey.notice, 'notice', '공지 (notice)', '모든 폰 상단에 1분 안에 표시돼요. 예: "13:00 본관 앞 전설 출현!" 비우면 공지가 사라져요.', 2),
        textSettingCard(byKey.prize_note, 'prize_note', '상품 안내 (prize_note)', '축제가 끝난 뒤 학생 폰의 "축제 종료" 화면에 보여요. 예: 상품 받는 곳·시간.', 3)),
      h('div', closeAtCard(byKey.festival_close_at), dupBonusCard(byKey.dup_bonus_every))),
    table];
}

const CARD_KEYS = ['festival_open', 'self_redeem', 'notice', 'prize_note', 'festival_close_at', 'dup_bonus_every'];

// save one setting; value null = clear (settings.value is nullable since 0005)
async function saveSetting(key, value) {
  await tq(sb.from('settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key));
}
const missingCard = (key, title) => h('div.box.stack', h('h2', title), h('p.warn-txt', `${key} 설정이 없어요 (마이그레이션 0005 필요).`));
const changedTxt = (r) => h('p.small-txt.muted', `마지막 변경: ${fmtTime(r.updated_at)}`);

function textSettingCard(r, key, title, help, rows) {
  if (!r) return missingCard(key, title);
  const cur = typeof r.value === 'string' ? r.value : '';
  const ta = h('textarea.inp', { rows, maxlength: 200, 'aria-label': title }, cur);
  const state = h('p.small-txt', cur ? chip('표시 중', 'ok') : chip('비어 있음', 'off'));
  const save = h('button.btn.go', '저장');
  const clear = h('button.btn', '비우기');
  save.onclick = () => busy(save, async () => {
    const v = ta.value.trim();
    await saveSetting(key, v || null);
    toast(v ? `${key} 저장했어요.` : `${key}를 비웠어요.`);
    rerender();
  });
  clear.onclick = () => busy(clear, async () => {
    await saveSetting(key, null);
    toast(`${key}를 비웠어요.`);
    rerender();
  });
  return h('div.box.stack', h('h2', title), h('p.small-txt', help), state, ta, h('div.row.end', clear, save), changedTxt(r));
}

// festival_close_at: datetime-local (KST) ↔ "YYYY-MM-DDTHH:MM:00+09:00"
const KST = 9 * 3600_000;
const isoToKstInput = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(Date.parse(iso) + KST).toISOString().slice(0, 16) : '');
const kstInputToIso = (v) => (v ? `${v}:00+09:00` : null);

function closeAtCard(r) {
  if (!r) return missingCard('festival_close_at', '축제 종료 시각');
  const iso = typeof r.value === 'string' ? r.value : null;
  const ended = iso && Date.parse(iso) < Date.now();
  const inp = h('input.inp', { type: 'datetime-local', value: isoToKstInput(iso), 'aria-label': '축제 종료 시각 (한국 시간)' });
  const save = h('button.btn.go', '저장');
  const clear = h('button.btn', '비우기');
  save.onclick = async () => {
    if (!inp.value) { toast('시각을 고르세요. 종료 시각을 없애려면 [비우기].'); return; }
    const v = kstInputToIso(inp.value);
    if (Date.parse(v) < Date.now() && !(await confirmBox('이미 지난 시각이에요', [`${inp.value.replace('T', ' ')}(한국 시간)는 이미 지났어요.`, h('p.warn-txt', '저장하면 지금 바로 스캔·부스·퀴즈·진화가 멈추고 모든 폰에 종료 화면이 떠요.')], { ok: '그래도 저장', danger: true }))) return;
    busy(save, async () => { await saveSetting(r.key, v); toast('축제 종료 시각을 저장했어요.'); rerender(); });
  };
  clear.onclick = async () => {
    if (!(await confirmBox('종료 시각 비우기', ['자동 종료가 없어져요. 게임은 festival_open 스위치로만 멈춰요.'], { ok: '비우기' }))) return;
    busy(clear, async () => { await saveSetting(r.key, null); toast('종료 시각을 비웠어요.'); rerender(); });
  };
  return h('div.box.stack',
    h('h2', '축제 종료 시각 (festival_close_at)'),
    h('p.small-txt', '이 시각이 지나면 스캔·부스 지급·퀴즈·진화가 자동으로 멈추고, 학생 폰에는 "축제 종료" 화면(상품 안내)이 떠요.'),
    h('p.small-txt', iso ? h('span', ended ? chip('종료됨', 'hot') : chip('예정', 'blue'), ` ${new Date(iso).toLocaleString('ko-KR')}`) : chip('설정 안 됨 (자동 종료 없음)', 'off')),
    field('종료 시각 (한국 시간)', inp),
    h('div.row.end', clear, save), changedTxt(r));
}

function dupBonusCard(r) {
  if (!r) return missingCard('dup_bonus_every', '중복 보너스');
  const inp = h('input.inp.w-num', { type: 'number', min: 0, step: 1, value: Number(r.value) || 0, 'aria-label': 'N' });
  const save = h('button.btn.go', '저장');
  save.onclick = () => {
    const n = Number(inp.value);
    if (!(Number.isInteger(n) && n >= 0)) { toast('0 이상의 정수를 넣으세요 (0 = 끔).'); inp.classList.add('bad'); return; }
    busy(save, async () => { await saveSetting(r.key, n); toast(n ? `같은 쌤 ${n}번째마다 진화권 +1` : '중복 보너스를 껐어요.'); rerender(); });
  };
  return h('div.box.stack',
    h('h2', '중복 보너스 (dup_bonus_every)'),
    h('p.small-txt', '같은 쌤 몬스터를 N번째로 또 잡을 때마다 진화권 +1. 0 = 끔.'),
    h('div.row', '같은 쌤', inp, '번째 중복마다 진화권 +1', h('span', { style: { flex: 1 } }), save),
    changedTxt(r));
}

// ───────────────────────── start ─────────────────────────
window.addEventListener('hashchange', () => {
  const t = location.hash.slice(1);
  if (S.view === 'app' && t !== S.tab && RENDER[t]) go(t);
});
window.addEventListener('unhandledrejection', (e) => console.warn('[admin] unhandled', e.reason));
boot();
