// Server rule tests against the STAGING Supabase project.
// Run:  node tests/rpc_test.mjs      (needs tests/.env with SUPABASE_URL, TEST_PASSWORD; test users created per RUN.md)
// Resets the test students (admin_unlink) at the start, so it is repeatable.
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('./.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(Boolean).map(l => l.split(/=(.*)/s).slice(0, 2)));
const URL_ = env.SUPABASE_URL;
const KEY = env.SUPABASE_KEY || 'sb_publishable__nwfE6aqdvVdPCCvKu9IdA_qL5pbDAk';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra) : ''); }
};

async function login(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: env.TEST_PASSWORD }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('login failed ' + email + ' ' + JSON.stringify(j));
  return j.access_token;
}
function client(tok) {
  const h = { apikey: KEY, 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
  return {
    async rpc(fn, args = {}) {
      const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: h, body: JSON.stringify(args) });
      const t = await r.text();
      const body = t ? JSON.parse(t) : null;
      return r.ok ? { data: body } : { error: body?.message || String(r.status) };
    },
    async select(path) {
      const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: h });
      const t = await r.text();
      return { status: r.status, data: t ? JSON.parse(t) : null };
    },
  };
}
const nonce = () => Array.from({ length: 12 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)]).join('');
// bag QR v2: uppercase only, '/' separators, '-' = manual code (USB scanner + Korean IME safe)
const bag = (sid, items) => ['PH1', sid, ...items.map(i => `${i.n}.${i.q === '_' ? '-' : i.q}.${i.t}`)].join('/').toUpperCase();
const bagV1 = (sid, items) => ['PH1', sid, ...items.map(i => `${i.n}.${i.q}.${i.t}`)].join('|');

const ADMIN_TOK = await login('admin@staff.test');
const admin = client(ADMIN_TOK);
const patchSetting = (k, v) => fetch(`${URL_}/rest/v1/settings?key=eq.${k}`, { method: 'PATCH', headers: { apikey: KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOK}` }, body: JSON.stringify({ value: v }) });
const booth = client(await login('booth1@staff.test'));
const S = [];
await client(null).rpc('dev_create_account', { p_email: '021004' });   // 4th test student (21기) is created on demand
const STOK = await login('022001@test.local');
for (const e of ['022001', '022002', '022003', '021004']) S.push(client(e === '022001' ? STOK : await login(`${e}@test.local`)));
const anon = client(null);

console.log('\n[0] setup');
await admin.rpc('ensure_profile'); await booth.rpc('ensure_profile');
await admin.select('settings?key=eq.festival_open'); // warm
for (const sid of ['022001', '022002', '022003', '021004']) await admin.rpc('admin_unlink', { p_student_id: sid });
const NAMES = ['김민준', '이서연', '박지윤', '최도우'];
const fresh0 = (await S[0].rpc('ensure_profile')).data;
ok(fresh0?.needs_register === true, 'first login asks to register (no profile yet)', fresh0);
const profs = [];
for (const [i, sid] of ['022001', '022002', '022003', '021004'].entries())
  profs.push((await S[i].rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: NAMES[i], p_show: true })).data);
ok(profs[0]?.student_id === '022001' && profs[0]?.gen === 22 && profs[0]?.role === 'student' && profs[0]?.consented === true, 'student registers with number + name', profs[0]);
ok(profs[0]?.display === '22기 김*준', 'display name is masked like 김*준', profs[0]?.display);
ok(profs[3]?.student_id === '021004' && profs[3]?.gen === 21, 'gen parsed', profs[3]);
const me = (await admin.rpc('ensure_profile')).data;
ok(me?.role === 'admin', 'admin role from settings', me);
const secrets = (await admin.select('qr_secrets?select=qr_id,token,manual_code&revoked_at=is.null')).data;
const T = Object.fromEntries(secrets.map(s => [s.qr_id, s]));
ok(T.A01 && T.A24 && T.L01, 'admin can read QR secrets');
// the admin may have rotated tokens in earlier runs — fine, we use the current ones.

console.log('\n[1] secrecy');
const sr = await S[0].select('qr_secrets?select=token');
ok(Array.isArray(sr.data) && sr.data.length === 0, 'student cannot read qr_secrets', sr);
const qa = await S[0].select('quiz_answers?select=answer');
ok(Array.isArray(qa.data) && qa.data.length === 0, 'student cannot read quiz_answers', qa);
const an = await anon.select('lines?select=id');
ok(an.status >= 400 || (Array.isArray(an.data) && an.data.length === 0), 'anon cannot read catalog', an.status);
ok((await S[0].rpc('booth_redeem', { p_payload: '022001' })).error === 'NOT_STAFF', 'student cannot call booth_redeem');
ok((await S[0].rpc('admin_stats')).error === 'NOT_ADMIN', 'student cannot call admin_stats');
ok((await anon.rpc('sync', { p_scans: [] })).error, 'anon cannot call sync');
for (const fn of ['admin_relink', 'admin_export_ranking', 'admin_grant_monster', 'ensure_profile', 'get_ranking', 'screen_feed', 'spin_roulette', 'register_profile', 'admin_invite_staff', 'admin_list_staff', 'link_number', 'send_inquiry', 'admin_list_requests', 'admin_decide_reset'])
  ok((await anon.rpc(fn, {})).error, `anon cannot call ${fn}`);
for (const fn of ['_is_open', '_admit', '_redeem_pending', '_state', '_setting', '_rand', '_new_secret', '_roulette_json', '_state_base', '_create_password_user', '_mask_name', '_attach_google', '_kick_number', '_set_number_account', '_number_owner', '_school_sid'])
  ok((await S[0].rpc(fn, {})).error, `student cannot call internal ${fn}`);

console.log('\n[2] scan / sync / lock');
const n1 = nonce();
let r = await S[0].rpc('sync', { p_scans: [{ n: n1, q: 'A01', t: T.A01.token, at: new Date().toISOString() }] });
ok(r.data?.acks?.[0]?.status === 'ok', 'scan A01 ok', r);
r = await S[0].rpc('sync', { p_scans: [{ n: n1, q: 'A01', t: T.A01.token }] });
ok(r.data?.acks?.[0]?.status === 'ok' && r.data.state.tickets.filter(t => t.status === 'pending').length === 1, 'resend same nonce is idempotent');
r = await S[0].rpc('sync', { p_scans: [{ n: nonce(), q: 'A01', t: T.A01.token }] });
ok(r.data?.acks?.[0]?.status === 'already_pending', 'A01 locked while ticket unused', r.data?.acks);
r = await S[0].rpc('sync', { p_scans: [{ n: nonce(), q: 'A02', t: 'wrongtok' }] });
ok(r.data?.acks?.[0]?.status === 'invalid_token', 'wrong token rejected');
r = await S[0].rpc('sync', { p_scans: [{ n: nonce(), q: '_', t: T.A02.manual_code.toLowerCase() }] });
ok(r.data?.acks?.[0]?.status === 'ok', 'manual code accepted (case-insensitive)', r.data?.acks);
r = await S[2].rpc('sync', { p_scans: [{ n: n1, q: 'A01', t: T.A01.token }] });
ok(r.data?.acks?.[0]?.status === 'nonce_conflict', 'another student cannot hijack a nonce');

console.log('\n[3] booth: double redeem race (2 booths, same bag, same moment)');
const pend = (await S[0].rpc('sync')).data.state.tickets.filter(t => t.status === 'pending');
const payload = bag('022001', pend.map(t => ({ n: t.nonce, q: t.qr_id, t: t.token })));
const look = await booth.rpc('booth_lookup', { p_payload: payload });
ok(look.data?.name === '김민준' && look.data.items.length === 2, 'lookup shows student + 2 tickets', look);
const [ra, rb, rc] = await Promise.all([
  booth.rpc('booth_redeem', { p_payload: payload }),
  booth.rpc('booth_redeem', { p_payload: payload }),
  admin.rpc('booth_redeem', { p_payload: payload }),
]);
const fresh = [ra, rb, rc].flatMap(x => x.data?.results || []).filter(x => x.species_id && !x.replay);
const replays = [ra, rb, rc].flatMap(x => x.data?.results || []).filter(x => x.replay);
ok(fresh.length === 2, 'exactly 2 monsters granted across 3 concurrent redeems', { fresh: fresh.length });
ok(replays.length === 4, 'the other calls got the original results back (replay)', { replays: replays.length });
let st = (await S[0].rpc('sync')).data.state;
ok(st.collection.reduce((a, c) => a + c.catch_count, 0) === 2, 'collection has exactly 2 catches');
ok(st.quizzes.length === 2, 'a quiz was created per catch', st.quizzes.length);
ok(st.profile.score > 0 && st.profile.dex_count > 0, 'score computed', st.profile);

console.log('\n[4] unlock + daily cap');
r = await S[0].rpc('sync', { p_scans: [{ n: nonce(), q: 'A01', t: T.A01.token }] });
ok(r.data?.acks?.[0]?.status === 'ok', 'A01 re-opens after redemption');
await booth.rpc('booth_redeem', { p_payload: '022001' });
r = await S[0].rpc('sync', { p_scans: [{ n: nonce(), q: 'A01', t: T.A01.token }] });
ok(r.data?.acks?.[0]?.status === 'ok', '3rd scan of A01 today ok');
await booth.rpc('booth_redeem', { p_payload: '022001' });
r = await S[0].rpc('sync', { p_scans: [{ n: nonce(), q: 'A01', t: T.A01.token }] });
ok(r.data?.acks?.[0]?.status === 'daily_cap', '4th scan of A01 today → daily_cap', r.data?.acks);

console.log('\n[5] offline bag (student never synced)');
const off = [{ n: nonce(), q: 'A03', t: T.A03.token }, { n: nonce(), q: '_', t: T.A04.manual_code }];
const offPayload = bag('022002', off);
ok(/^[A-Z0-9./-]+$/.test(offPayload), 'bag QR v2 uses only uppercase/digits/./-', offPayload);
r = await booth.rpc('booth_redeem', { p_payload: offPayload });
ok(r.data?.results?.filter(x => x.species_id && !x.replay).length === 2, 'offline tickets redeemed straight from the bag QR', r);
r = await booth.rpc('booth_redeem', { p_payload: offPayload });
ok(r.data?.results?.length === 2 && r.data.results.every(x => x.replay), 'second read of same bag = replay only', r.data);
st = (await S[1].rpc('sync')).data.state;
ok(st.collection.reduce((a, c) => a + c.catch_count, 0) === 2, 'student 2 has exactly 2 catches');
const forged = bag('022002', [{ n: nonce(), q: 'A05', t: 'forged00' }]);
r = await booth.rpc('booth_redeem', { p_payload: forged });
ok(r.data?.results?.[0]?.error === 'invalid_token', 'forged token in bag rejected', r.data);
r = await booth.rpc('booth_redeem', { p_payload: bagV1('022002', [{ n: nonce(), q: 'A06', t: T.A06.token }]) });
ok(r.data?.results?.some(x => x.species_id && !x.replay), 'old v1 bag format still accepted', r.data);

console.log('\n[6] bag limit');
const many = ['A05', 'A06', 'A07', 'A08', 'A09', 'A10'].map(q => ({ n: nonce(), q, t: T[q].token }));
r = await S[2].rpc('sync', { p_scans: many });
const sts = r.data?.acks?.map(a => a.status);
ok(sts?.filter(s => s === 'ok').length === 5 && sts?.[5] === 'bag_full', 'bag holds 5, 6th → bag_full', sts);

console.log('\n[7] quiz');
st = (await S[0].rpc('sync')).data.state;
const qz = st.quizzes[0];
const right = qz.choices.findIndex(c => c.startsWith('맞아요'));
r = await S[0].rpc('answer_quiz', { p_attempt: qz.attempt_id, p_choice: right });
// random draws can already have paid a duplicate bonus ticket → compare with the count before
ok(r.data?.correct === true && r.data.granted === true && r.data.evo_tickets === st.profile.evo_tickets + 1, 'correct answer → +1 ticket', r);
r = await S[0].rpc('answer_quiz', { p_attempt: qz.attempt_id, p_choice: right });
ok(r.error === 'NO_QUIZ', 'cannot answer the same quiz twice', r);
const qz2 = st.quizzes[1];
const wrong = qz2.choices.findIndex(c => !c.startsWith('맞아요'));
r = await S[0].rpc('answer_quiz', { p_attempt: qz2.attempt_id, p_choice: wrong });
ok(r.data?.correct === false && r.data.granted === false && r.data.answer_pos === qz2.choices.findIndex(c => c.startsWith('맞아요')),
  'wrong answer → no ticket, shows right position', r);

console.log('\n[8] evolve race (5 parallel taps, 1 ticket)');
const line = st.collection[0].line_id;
const have = (await S[0].rpc('sync')).data.state.profile.evo_tickets;
if (have !== 1) await admin.rpc('admin_adjust_tickets', { p_student_id: '022001', p_delta: 1 - have });   // exactly 1 ticket for the race
const evs = await Promise.all(Array.from({ length: 5 }, () => S[0].rpc('evolve', { p_line: line })));
const spent = evs.filter(e => e.data);
ok(spent.length === 1 && evs.filter(e => e.error === 'NO_TICKET').length === 4, 'exactly one evolve consumed the ticket', evs.map(e => e.error || 'ok'));

console.log('\n[9] pity: guaranteed after 1 fail at stage 1');
await admin.rpc('admin_adjust_tickets', { p_student_id: '022002', p_delta: 2 });
const settings = (await admin.select('settings?key=eq.evo_prob')).data[0].value;
await patchSetting('evo_prob', [0, 0, 0]);
const line2 = (await S[1].rpc('sync')).data.state.collection.find(c => c.stage === 1).line_id;
const e1 = await S[1].rpc('evolve', { p_line: line2 });
const e2 = await S[1].rpc('evolve', { p_line: line2 });
ok(e1.data?.success === false && e2.data?.success === true && e2.data.stage === 2, 'fail at 0% then guaranteed success', [e1.data?.success, e2.data?.success]);
await patchSetting('evo_prob', [0, 0.7, 0.35]);
ok((await S[1].rpc('evolve', { p_line: line2 })).error === 'NO_TICKET', 'no tickets left → NO_TICKET');

console.log('\n[10] rotating legendary QR');
// legendary QRs start switched off; an operator puts one on the TV (admin 현황판 → 전설 출현)
const legendOn = (v) => fetch(`${URL_}/rest/v1/qr_points?id=eq.L01`, { method: 'PATCH', headers: { apikey: KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN_TOK}` }, body: JSON.stringify({ active: v, active_from: null, active_until: null }) });
ok((await booth.rpc('screen_feed')).data?.rotating?.every(x => x.id !== 'L01'), 'legendary QR is not on the TV until an operator turns it on');
await legendOn(true);
const rt = await booth.rpc('screen_rotating_token', { p_qr: 'L01' });
ok(rt.data?.token?.length === 10, 'screen gets current token', rt);
r = await S[3].rpc('sync', { p_scans: [{ n: nonce(), q: 'L01', t: rt.data.token }] });
ok(r.data?.acks?.[0]?.status === 'ok', 'student accepts rotating token');
r = await S[3].rpc('sync', { p_scans: [{ n: nonce(), q: 'L01', t: 'abcdef1234' }] });
ok(r.data?.acks?.[0]?.status !== 'ok', 'fake rotating token rejected', r.data?.acks);
r = await S[2].rpc('sync', { p_scans: [{ n: nonce(), q: '_', t: T.L01.manual_code }] });
ok(r.data?.acks?.[0]?.status === 'invalid_token', 'manual code can NOT unlock the legendary QR', r.data?.acks);
await booth.rpc('booth_redeem', { p_payload: '021004' });
const rt2 = await booth.rpc('screen_rotating_token', { p_qr: 'L01' });
r = await S[3].rpc('sync', { p_scans: [{ n: nonce(), q: 'L01', t: rt2.data.token }] });
ok(r.data?.acks?.[0]?.status === 'daily_cap', 'legendary QR: once per day', r.data?.acks);
const leg = (await S[3].rpc('sync')).data.state.collection.find(c => c.line_id >= 35);
await admin.rpc('admin_adjust_tickets', { p_student_id: '021004', p_delta: 1 });
ok(leg && (await S[3].rpc('evolve', { p_line: leg.line_id })).error === 'MAX_STAGE', 'legendary cannot evolve (1 stage)');
await admin.rpc('admin_adjust_tickets', { p_student_id: '021004', p_delta: -1 });
ok((await booth.rpc('screen_feed')).data?.rotating?.some(x => x.id === 'L01'), 'TV shows the legendary QR while it is on');
await legendOn(false);

console.log('\n[11] token rotation keeps old token alive (grace), hard revoke kills it');
const nt = (await admin.rpc('admin_rotate_qr', { p_id: 'A11', p_hard: false })).data;
r = await S[3].rpc('sync', { p_scans: [{ n: nonce(), q: 'A11', t: T.A11.token }] });
ok(r.data?.acks?.[0]?.status === 'ok', 'old token still valid during grace');
await admin.rpc('admin_rotate_qr', { p_id: 'A12', p_hard: true });
r = await S[3].rpc('sync', { p_scans: [{ n: nonce(), q: 'A12', t: T.A12.token }] });
ok(r.data?.acks?.[0]?.status === 'invalid_token', 'hard-revoked token dead immediately');
ok(nt?.token && nt.token !== T.A11.token, 'new token issued');

console.log('\n[12] robustness: bad item, empty pool, manual-code lockout, version check, self-redeem');
r = await S[1].rpc('sync', { p_scans: [{ n: nonce(), q: 'A14', t: T.A14.token, at: 'not-a-date' }, { n: nonce(), q: 'A16', t: T.A16.token }] });
ok(r.data?.acks?.[0]?.status === 'bad_format' && r.data.acks[1].status === 'ok', 'one malformed item does not block the rest', r.data?.acks);
r = await S[1].rpc('sync', { p_scans: [], p_ver: r.data.ver });
ok(r.data?.same === true && !r.data.state, 'unchanged state → tiny response', Object.keys(r.data || {}));
const adminTok0 = ADMIN_TOK;
const H0 = { apikey: KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${adminTok0}` };
const pool17 = (await admin.select('qr_rewards?qr_id=eq.A17&select=line_id,weight')).data;
await fetch(`${URL_}/rest/v1/qr_rewards?qr_id=eq.A17`, { method: 'DELETE', headers: H0 });
await S[1].rpc('sync', { p_scans: [{ n: nonce(), q: 'A17', t: T.A17.token }] });
r = await booth.rpc('booth_redeem', { p_payload: '022002' });
ok(r.data?.results?.some(x => x.error === 'empty_pool'), 'empty pool reported at booth', r.data?.results);
r = await S[1].rpc('sync', { p_scans: [{ n: nonce(), q: 'A17', t: T.A17.token }] });
ok(r.data?.acks?.[0]?.status === 'ok', 'empty-pool ticket does not lock the QR forever', r.data?.acks);
await fetch(`${URL_}/rest/v1/qr_rewards`, { method: 'POST', headers: H0, body: JSON.stringify(pool17.map(p => ({ qr_id: 'A17', ...p }))) });
let lastStatus;
for (let i = 0; i < 11; i++) lastStatus = (await S[0].rpc('sync', { p_scans: [{ n: nonce(), q: '_', t: 'ZZZZ' + 'ABCDEFGHJK'[i % 10] }] })).data?.acks?.[0]?.status;
ok(lastStatus === 'locked', 'manual-code guessing locked after 10 misses', lastStatus);
ok((await S[1].rpc('self_redeem')).error === 'SELF_REDEEM_OFF', 'self-redeem off by default');
const setS = (k, v) => fetch(`${URL_}/rest/v1/settings?key=eq.${k}`, { method: 'PATCH', headers: H0, body: JSON.stringify({ value: v }) });
await setS('self_redeem', true);
r = await S[1].rpc('self_redeem');
ok(r.data?.results?.length >= 1 && r.data.results.every(x => x.species_id || x.error), 'self-redeem works when the valve is open', r.data);
await setS('self_redeem', false);

console.log('\n[13] backup login codes (teacher / guest)');
const codes = (await admin.rpc('admin_make_login_codes', { p_ids: ['T01', '22999'], p_names: ['테스트쌤', '코드학생'] })).data;
ok(codes?.length === 2 && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(codes[0].code) && codes[1].id === '022999', 'codes generated', codes);
const tTok = await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 't01@code.local', password: codes[0].code.replace('-', '') }) })).json();
ok(!!tTok.access_token, 'teacher can sign in with the printed code');
const tc = client(tTok.access_token);
const tp = (await tc.rpc('ensure_profile')).data;
ok(tp?.student_id === 'g:t01' && tp.gen === null && tp.role === 'student', 'guest profile created', tp);
const ta = (await tc.rpc('accept_terms', { p_show: true })).data;
ok(ta?.consented === true && ta.display === '테**쌤', 'consent + masked display name for guests', ta);

console.log('\n[14] ranking + kill switch');
r = await S[0].rpc('get_ranking');
ok(r.data?.me?.rank >= 1 && r.data.top.some(t => t.me), 'ranking includes me', r.data?.me);
ok(!JSON.stringify(r.data).includes('김민준'), 'ranking never shows full names');
const kill = (v) => fetch(`${URL_}/rest/v1/settings?key=eq.festival_open`, { method: 'PATCH', headers: { apikey: KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${adminTok}` }, body: JSON.stringify({ value: v }) });
const adminTok = ADMIN_TOK;
await kill(false);
r = await S[3].rpc('sync', { p_scans: [{ n: nonce(), q: 'A13', t: T.A13.token }] });
ok(r.data?.acks?.[0]?.status === 'closed', 'festival closed → scans held (closed)');
ok((await booth.rpc('booth_redeem', { p_payload: '021004' })).error === 'FESTIVAL_CLOSED', 'festival closed → booth stops');
await kill(true);
const stats = await admin.rpc('admin_stats');
ok(stats.data?.students >= 4 && stats.data.qrs.length >= 25, 'admin stats work', { students: stats.data?.students });

console.log('\n[15] festival ops: guests out of ranking, export, grant, dup bonus, relink, auto-close');
r = await S[0].rpc('get_ranking');
ok(!r.data.top.some(t => t.display === '테**쌤'), 'teacher/guest code accounts are not ranked');
const exp = (await admin.rpc('admin_export_ranking')).data;
const ex1 = exp?.find(x => x.student_id === '022001');
ok(ex1?.name === '김민준' && ex1.rank >= 1 && exp.some(x => x.student_id === 'g:t01' && x.rank === null), 'export has real names, guests unranked', ex1);
ok((await S[0].rpc('admin_export_ranking')).error === 'NOT_ADMIN', 'students cannot export');
await admin.rpc('admin_grant_monster', { p_student_id: '022003', p_line: 5, p_stage: 2 });
st = (await S[2].rpc('sync')).data.state;
ok(st.collection.find(c => c.line_id === 5)?.stage === 2, 'admin can grant a monster (dispute fix)');
// dup bonus: 3rd catch of the same line → +1 ticket
await booth.rpc('booth_redeem', { p_payload: '022003' });             // empty the bag first
let c7 = (await S[2].rpc('sync')).data.state.collection.find(c => c.line_id === 7)?.catch_count || 0;
while (c7 % 3 !== 2) { await admin.rpc('admin_grant_monster', { p_student_id: '022003', p_line: 7, p_stage: 1 }); c7++; }
st = (await S[2].rpc('sync')).data.state;
const pool18 = (await admin.select('qr_rewards?qr_id=eq.A18&select=line_id,weight')).data;
await fetch(`${URL_}/rest/v1/qr_rewards?qr_id=eq.A18`, { method: 'DELETE', headers: H0 });
await fetch(`${URL_}/rest/v1/qr_rewards`, { method: 'POST', headers: H0, body: JSON.stringify([{ qr_id: 'A18', line_id: 7, weight: 1 }]) });
const tBefore = st.profile.evo_tickets;
await S[2].rpc('sync', { p_scans: [{ n: nonce(), q: 'A18', t: T.A18.token }] });
r = await booth.rpc('booth_redeem', { p_payload: '022003' });
await fetch(`${URL_}/rest/v1/qr_rewards?qr_id=eq.A18`, { method: 'DELETE', headers: H0 });
await fetch(`${URL_}/rest/v1/qr_rewards`, { method: 'POST', headers: H0, body: JSON.stringify(pool18.map(p => ({ qr_id: 'A18', ...p }))) });
const dup = r.data?.results?.find(x => x.line_id === 7);
st = (await S[2].rpc('sync')).data.state;
ok(dup?.bonus_ticket === true && st.profile.evo_tickets === tBefore + 1, 'every 3rd duplicate gives +1 evolution ticket', dup);
// relink 022999 (code account) data onto the t01 login is refused (t01 has its own data? no) → use a fresh code account
const c2 = (await admin.rpc('admin_make_login_codes', { p_ids: ['RL1'], p_names: ['재연결'] })).data;
const rl = await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'rl1@code.local', password: c2[0].code.replace('-', '') }) })).json();
r = await admin.rpc('admin_relink', { p_student_id: '022003', p_email: 'rl1@code.local' });
ok(r.data?.ok === true, 'relink moved 022003 to another login', r);
const moved = (await client(rl.access_token).rpc('sync')).data?.state;
ok(moved?.profile?.student_id === '022003' && moved.collection.length > 0, 'new login sees the same game data', moved?.profile?.student_id);
r = await admin.rpc('admin_relink', { p_student_id: '022003', p_email: '022003@test.local' });
ok(r.data?.ok === true, 'relink back to the original login');
S[2] = client(await login('022003@test.local'));
// evolution-ticket roulette (0007): server decides, cooldown + daily max
{
  const st0 = (await S[3].rpc('sync')).data.state;
  ok(st0.roulette && typeof st0.roulette.used_today === 'number', 'state carries the roulette block', st0.roulette);
  await setS('roulette_every_min', 0);
  await setS('roulette_daily_max', st0.roulette.used_today + 2);
  await setS('roulette_odds', [[5, 100]]);
  const a = await S[3].rpc('spin_roulette');
  const b = await S[3].rpc('spin_roulette');
  ok(a.data?.prize === 5 && b.data?.evo_tickets === st0.profile.evo_tickets + 10, 'roulette pays the prize into evo_tickets', [a, b]);
  ok((await S[3].rpc('spin_roulette')).error === 'ROULETTE_DAILY_MAX', 'roulette stops at the daily max');
  await setS('roulette_daily_max', 999);
  await setS('roulette_every_min', 5);
  ok((await S[3].rpc('spin_roulette')).error === 'ROULETTE_WAIT', 'roulette waits N minutes between spins');
  await setS('roulette_enabled', false);
  ok((await S[3].rpc('spin_roulette')).error === 'ROULETTE_OFF', 'operator can switch the roulette off');
  await setS('roulette_enabled', true);
  await setS('roulette_every_min', 0);
  await setS('festival_open', false);
  ok((await S[3].rpc('spin_roulette')).error === 'FESTIVAL_CLOSED', 'no roulette while the festival is closed');
  await setS('festival_open', true);
  await setS('roulette_every_min', 5); await setS('roulette_daily_max', 12); await setS('roulette_odds', [[0, 60], [1, 30], [3, 8], [5, 2]]);
}
// auto-close via festival_close_at
await setS('festival_close_at', new Date(Date.now() - 60000).toISOString());
r = await S[3].rpc('sync', { p_scans: [{ n: nonce(), q: 'A13', t: T.A13.token }] });
ok(r.data?.acks?.[0]?.status === 'closed' && r.data.state.rules.festival_ended === true, 'past festival_close_at → closed + ended flag', r.data?.acks);
ok((await booth.rpc('booth_redeem', { p_payload: '021004' })).error === 'FESTIVAL_CLOSED', 'booth stops after close time');
await setS('festival_close_at', null);

console.log('\n[17] open login: register screen, 학번 code accounts, dev accounts');
{
  const fresh = async (email) => {
    await anon.rpc('dev_create_account', { p_email: email });
    const c = client(await login(email));
    const pr = (await c.rpc('ensure_profile')).data;
    if (pr?.student_id) await admin.rpc('admin_unlink', { p_student_id: pr.student_id });   // reset from the last run
    return c;
  };
  const d = (await anon.rpc('dev_create_account', { p_email: 'reg1' })).data;
  ok(d?.email === 'reg1@test.local', 'dev account: bare name gets @test.local', d);
  const g = await fresh('reg1@test.local');
  r = await g.rpc('register_profile', { p_kind: 'guest', p_student_id: '', p_name: '  홍 길동 ', p_show: true });
  ok(r.data?.student_id?.startsWith('g:') && r.data.in_ranking === false && r.data.display === '홍**동', 'guest registers with name only, not ranked, masked', r.data);
  ok((await g.rpc('register_profile', { p_kind: 'guest', p_student_id: '', p_name: 'x' })).error === 'ALREADY_REGISTERED', 'cannot register twice');
  const t = await fresh('reg2@test.local');
  ok((await t.rpc('register_profile', { p_kind: 'student', p_student_id: '022001', p_name: '가짜' })).error === 'STUDENT_ID_TAKEN', 'a taken student number is refused');
  ok((await t.rpc('register_profile', { p_kind: 'student', p_student_id: '12', p_name: '가짜' })).error === 'BAD_STUDENT_ID', 'bad student number refused');
  ok((await t.rpc('register_profile', { p_kind: 'student', p_student_id: '023777', p_name: '미래' })).error === 'BAD_GEN', 'future 기수 (23기) refused');
  ok((await t.rpc('register_profile', { p_kind: 'student', p_student_id: '019777', p_name: '졸업' })).error === 'BAD_GEN', 'past 기수 (19기) refused');
  ok((await anon.rpc('create_code_account', { p_student_id: '024777' })).error === 'BAD_GEN', 'no code account for a future 기수');
  ok((await admin.rpc('admin_make_login_codes', { p_ids: ['025001'] })).error === 'BAD_GEN', 'admin codes refuse a future 기수');
  ok((await booth.rpc('screen_feed')).data?.gens?.every(x => [20, 21, 22].includes(x.gen)), 'TV 기수 대항전 shows only 20~22기');
  ok((await t.rpc('register_profile', { p_kind: 'student', p_student_id: '022777', p_name: '<b>' })).error === 'BAD_NAME', 'bad name refused');
  ok((await t.rpc('register_profile', { p_kind: 'teacher', p_student_id: '', p_name: '가짜' })).error === 'BAD_KIND', 'unknown kind refused');

  const sid = '020' + String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  const cc = (await anon.rpc('create_code_account', { p_student_id: sid })).data;
  ok(cc?.id === sid && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(cc.code), 'student number alone creates a code account (code shown once)', cc);
  ok((await anon.rpc('create_code_account', { p_student_id: sid })).error === 'CODE_ACCOUNT_EXISTS', 'second request for the same number is refused');
  ok((await anon.rpc('create_code_account', { p_student_id: '022001' })).error === 'STUDENT_ID_TAKEN', 'code account for a registered number is refused');
  const ct = await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${sid}@code.local`, password: cc.code.replace('-', '') }) })).json();
  const cl = client(ct.access_token);
  const need = (await cl.rpc('ensure_profile')).data;
  ok(need?.needs_register === true && need.code_id === sid, 'code account asks for a name, knows its number', need);
  r = await cl.rpc('register_profile', { p_kind: 'guest', p_student_id: '022002', p_name: '코드생' });
  ok(r.data?.student_id === sid && r.data.in_ranking === true, 'code account is always its own student number', r.data);
  await admin.rpc('admin_unlink', { p_student_id: sid });

  await setS('admin_emails', ['admin@staff.test', 'evil@x.test']);
  const ev = await fresh('evil@x.test');
  const evp = (await ev.rpc('ensure_profile')).data;
  await setS('admin_emails', ['admin@staff.test']);
  ok(evp?.needs_register === true && evp.role !== 'admin', 'a password account never gets staff rights from the admin list', evp);
  await setS('dev_login', false);
  ok((await anon.rpc('dev_create_account', { p_email: 'reg3' })).error === 'DEV_LOGIN_OFF', 'dev accounts only while dev_login is on');
  await setS('dev_login', true);
}

console.log('\n[18] staff invite (admin page → 운영진)');
{
  const em = 'helper@x.test';
  ok((await S[0].rpc('admin_list_staff')).error === 'NOT_ADMIN', 'students cannot see the staff list');
  ok((await S[0].rpc('admin_invite_staff', { p_email: em, p_role: 'admin' })).error === 'NOT_ADMIN', 'students cannot invite staff');
  r = await admin.rpc('admin_invite_staff', { p_email: ' Helper@X.test ', p_role: 'booth' });
  ok(r.data?.some(x => x.email === em && x.role === 'booth' && x.joined === false), 'admin invites a booth helper (email normalised)', r.data);
  r = await admin.rpc('admin_invite_staff', { p_email: em, p_role: 'admin' });
  ok(r.data?.filter(x => x.email === em).length === 1 && r.data.find(x => x.email === em).role === 'admin', 'promote booth → admin (one role per email)', r.data);
  ok(r.data?.some(x => x.email === 'admin@staff.test' && x.me && x.joined), 'list marks me + joined', r.data);
  ok((await admin.rpc('admin_invite_staff', { p_email: 'admin@staff.test', p_role: 'booth' })).error === 'CANNOT_CHANGE_SELF', 'cannot change my own role');
  ok((await admin.rpc('admin_remove_staff', { p_email: 'admin@staff.test' })).error === 'CANNOT_CHANGE_SELF', 'cannot remove myself');
  ok((await admin.rpc('admin_invite_staff', { p_email: 'nope', p_role: 'admin' })).error === 'BAD_EMAIL', 'bad email refused');
  ok((await admin.rpc('admin_invite_staff', { p_email: em, p_role: 'root' })).error === 'BAD_ROLE', 'bad role refused');
  r = await admin.rpc('admin_remove_staff', { p_email: em });
  ok(!r.data?.some(x => x.email === em), 'remove staff', r.data);
  const set = (await admin.select('settings?key=in.(admin_emails,booth_emails)&select=key,value')).data;
  ok(set?.find(x => x.key === 'admin_emails')?.value.includes('admin@staff.test') && set.find(x => x.key === 'booth_emails')?.value.includes('booth1@staff.test'), 'original staff lists intact', set);
}

console.log('\n[19] 고유번호 계정: 하나의 번호 = 하나의 계정, 구글 계정 여러 개 연결');
const pwLogin = async (email, password) => (await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).access_token;
const fakeGoogle = async (gmail) => { const nm = 'g' + nonce(); const d = (await anon.rpc('dev_fake_google', { p_name: nm, p_google_email: gmail })).data; return client(await login(d.email)); };
const rnd3 = () => String(Math.floor(Math.random() * 1000)).padStart(3, '0');
const sidA = '020' + rnd3(); let sidB = '021' + rnd3(); while (sidB === sidA) sidB = '021' + rnd3();
let NA, NB;
{
  ok((await anon.rpc('create_number_account', { p_student_id: '023111', p_password: 'abcdef' })).error === 'BAD_GEN', 'number account: future 기수 refused');
  ok((await anon.rpc('create_number_account', { p_student_id: sidA, p_password: '123' })).error === 'BAD_PASSWORD', 'password needs 6+ characters');
  const c = (await anon.rpc('create_number_account', { p_student_id: sidA, p_password: 'pw1234' })).data;
  ok(c?.email === `${sidA}@code.local`, 'student number + own password creates the account', c);
  ok((await anon.rpc('create_number_account', { p_student_id: sidA, p_password: 'other1' })).error === 'CODE_ACCOUNT_EXISTS', 'same number again → existing account (wrong password)');
  NA = client(await pwLogin(`${sidA}@code.local`, 'pw1234'));
  const need = (await NA.rpc('ensure_profile')).data;
  ok(need?.needs_register && need.code_id === sidA && need.google === false, 'number login asks only for a name', need);
  r = await NA.rpc('register_profile', { p_kind: 'guest', p_student_id: '', p_name: '번호학생' });
  ok(r.data?.student_id === sidA && r.data.in_ranking === true, 'number account registers as that student', r.data);

  const G1 = await fakeGoogle('someone' + nonce() + '@gmail.com');
  const g1 = (await G1.rpc('ensure_profile')).data;
  ok(g1?.needs_register && g1.google === true && !g1.school_id, 'google login → register screen (google, no school id)', g1);
  ok((await G1.rpc('register_profile', { p_kind: 'student', p_student_id: sidA, p_name: 'x' })).error === 'USE_NUMBER_LOGIN', 'google student must use number + password');
  r = await G1.rpc('link_number', { p_student_id: sidA, p_password: 'wrong1' });
  ok(r.data?.error === 'WRONG_PASSWORD' && !r.data.school, 'wrong password → not linked', r.data);
  r = await G1.rpc('link_number', { p_student_id: sidA, p_password: 'pw1234', p_name: '무시됨' });
  ok(r.data?.mode === 'linked' && r.data.email === `${sidA}@code.local`, 'another google account links to the same number', r.data);
  const again = client(await pwLogin(`${sidA}@code.local`, 'pw1234'));
  ok((await again.rpc('ensure_profile')).data?.name === '번호학생', 'same game account (name kept)');

  const G2 = await fakeGoogle('new' + nonce() + '@gmail.com');
  r = await G2.rpc('link_number', { p_student_id: sidB, p_password: 'pwpwpw', p_name: '새학생' });
  ok(r.data?.mode === 'new', 'google + unused number → new number account', r.data);
  const g2p = (await G2.rpc('ensure_profile')).data;
  ok(g2p?.student_id === sidB && g2p.name === '새학생', 'google session continues as that student', g2p);
  NB = client(await pwLogin(`${sidB}@code.local`, 'pwpwpw'));
  ok((await NB.rpc('ensure_profile')).data?.student_id === sidB, 'that number also works with number + password');
  ok((await G2.rpc('link_number', { p_student_id: sidA, p_password: 'pw1234' })).error === 'ALREADY_REGISTERED', 'a registered account cannot link another number');

  // 학교 계정 (이메일 속 학번) = 그 번호의 주인 → 비밀번호를 바로 다시 정할 수 있음
  const G3 = await fakeGoogle(`${sidA}@test.local`);
  const g3 = (await G3.rpc('ensure_profile')).data;
  ok(g3?.school_id === sidA, 'school google account → student number prefilled', g3);
  const G4 = await fakeGoogle('other' + nonce() + '@gmail.com');
  ok((await G4.rpc('link_number', { p_student_id: sidA, p_password: 'hack12', p_reset: true })).error === 'NOT_YOUR_NUMBER', 'only the school account of that number can reset');
  r = await G3.rpc('link_number', { p_student_id: sidA, p_password: 'school1', p_reset: true });
  ok(r.data?.mode === 'linked', 'school account resets the password and links', r.data);
  ok(!(await pwLogin(`${sidA}@code.local`, 'pw1234')) && !!(await pwLogin(`${sidA}@code.local`, 'school1')), 'old password stops working, new one works');

  console.log('\n[20] 비밀번호 초기화 요청 → 운영자 허용/거절');
  ok((await anon.rpc('request_password_reset', { p_student_id: '022777', p_password: 'abcdef', p_name: '없음' })).error === 'NO_ACCOUNT', 'no account → nothing to reset');
  r = await anon.rpc('request_password_reset', { p_student_id: sidA, p_password: 'req123', p_name: '번호학생', p_note: '비밀번호를 잊었어요' });
  ok(r.data?.ok, 'reset request from the login page', r);
  ok((await S[0].rpc('admin_list_requests')).error === 'NOT_ADMIN', 'students cannot see requests');
  let lst = (await admin.rpc('admin_list_requests')).data;
  let rq = lst?.resets?.find(x => x.student_id === sidA && x.status === 'pending');
  ok(rq && rq.account_name === '번호학생' && rq.name === '번호학생' && rq.google_links === 1, 'admin sees the request + account name + linked google count', rq);
  lst = (await admin.rpc('admin_decide_reset', { p_id: rq.id, p_approve: true })).data;
  ok(lst?.resets?.find(x => x.id === rq.id)?.status === 'approved', 'admin approves');
  ok(!!(await pwLogin(`${sidA}@code.local`, 'req123')) && !(await pwLogin(`${sidA}@code.local`, 'school1')), 'approved: the requested password works');
  ok((await admin.rpc('admin_list_requests')).data?.resets?.find(x => x.id === rq.id)?.google_links === 0, 'approved: linked google accounts released');
  ok((await admin.rpc('admin_decide_reset', { p_id: rq.id, p_approve: true })).error === 'NOT_FOUND', 'cannot decide twice');
  await anon.rpc('request_password_reset', { p_student_id: sidA, p_password: 'deny12', p_name: '장난' });
  rq = (await admin.rpc('admin_list_requests')).data.resets.find(x => x.student_id === sidA && x.status === 'pending');
  await admin.rpc('admin_decide_reset', { p_id: rq.id, p_approve: false });
  ok(!(await pwLogin(`${sidA}@code.local`, 'deny12')) && !!(await pwLogin(`${sidA}@code.local`, 'req123')), 'denied: password unchanged');

  console.log('\n[21] 문의함');
  ok((await anon.rpc('send_inquiry', { p_body: 'hi there' })).error, 'anon cannot send inquiries');
  ok((await S[0].rpc('send_inquiry', { p_body: ' ' })).error === 'BAD_INQUIRY', 'empty inquiry refused');
  const body = '부스 줄이 너무 길어요 ' + nonce();
  ok((await S[0].rpc('send_inquiry', { p_body: body })).data?.ok, 'student sends an inquiry');
  const iq = (await admin.rpc('admin_list_requests')).data?.inquiries?.find(x => x.body === body);
  ok(iq?.student_id === '022001' && iq.status === 'open', 'admin sees it with the student number', iq);
  ok((await admin.rpc('admin_set_inquiry', { p_id: iq.id, p_done: true })).data?.inquiries?.find(x => x.id === iq.id)?.status === 'done', 'admin marks it done');

  console.log('\n[22] easter eggs: secret QR + roulette 777');
  ok(T.S01, 'secret QR S01 exists');
  const cat = (await NB.select('qr_points?id=eq.S01&select=id,visible_on_map')).data?.[0];
  ok(!cat || cat.visible_on_map === false, 'secret QR is not on the map (not even in the catalog)', cat);
  const ln = (await NB.select('lines?id=eq.37&select=id,secret,max_stage')).data?.[0];
  ok(ln?.secret === true && ln.max_stage === 1, 'secret monster line is flagged', ln);
  const sn = nonce();
  r = await NB.rpc('sync', { p_scans: [{ n: sn, q: 'S01', t: T.S01.token, at: new Date().toISOString() }] });
  ok(r.data?.acks?.[0]?.status === 'ok', 'scan the secret QR', r.data?.acks);
  const tk = r.data.state.tickets.filter(t => t.status === 'pending');
  r = await booth.rpc('booth_redeem', { p_payload: bag(sidB, tk.map(t => ({ n: t.nonce, q: t.qr_id, t: t.token }))) });
  ok(r.data?.results?.some(x => x.line_id === 37), 'secret QR always gives the secret monster', r.data);

  await setS('roulette_every_min', 0); await setS('roulette_odds', [[0, 100]]); await setS('roulette_777_per_mille', 1000);
  r = await NB.rpc('spin_roulette');
  ok(r.data?.jackpot === true && r.data.prize === 0 && r.data.titles?.includes('럭키 세븐'), '777 turns a miss into the 럭키 세븐 title', r);
  ok((await NB.rpc('ensure_profile')).data?.titles?.includes('럭키 세븐'), 'title stays on the profile');
  await setS('roulette_777_per_mille', 10); await setS('roulette_every_min', 5); await setS('roulette_odds', [[0, 60], [1, 30], [3, 8], [5, 2]]);
  await admin.rpc('admin_unlink', { p_student_id: sidA }); await admin.rpc('admin_unlink', { p_student_id: sidB });
}

console.log('\n[23] battle data: types, moves, stats');
{
  const sp = (await S[0].select('species?select=id,line_id,hp,atk,def,spa,spd,spe&order=id')).data || [];
  ok(sp.length >= 212 && sp.every(x => [x.hp, x.atk, x.def, x.spa, x.spd, x.spe].every(v => v > 0)), 'every species (68 teachers + legends) has 6 base stats', sp.filter(x => !x.hp).map(x => x.id));
  ok(new Set(sp.map(x => [x.hp, x.atk, x.def, x.spa, x.spd, x.spe].join())).size === sp.length, 'no two species share the same stats');
  const total = (x) => x.hp + x.atk + x.def + x.spa + x.spd + x.spe;
  const by = Object.fromEntries(sp.map(x => [x.id, x]));
  ok(total(by[1]) < total(by[2]) && total(by[2]) < total(by[3]), 'evolved forms are stronger (stage 1 < 2 < 3)', [total(by[1]), total(by[2]), total(by[3])]);
  ok(by[94].atk > by[94].spa && by[13].spa > by[13].atk, 'subjects differ: 체육 = attack, 수학 = special attack');
  const mv = (await S[0].select('moves?select=id,kind')).data || [];
  const kind = Object.fromEntries(mv.map(m => [m.id, m.kind]));
  const sm = (await S[0].select('species_moves?select=species_id,slot,move_id')).data || [];
  const per = {};
  for (const x of sm) (per[x.species_id] ||= []).push(kind[x.move_id]);
  const bad = sp.filter(x => (per[x.id] || []).sort().join() !== 'attack,attack,defense,status').map(x => x.id);
  ok(bad.length === 0, 'every species: 2 attack + 1 status + 1 defense move', bad);
  const tc = (await S[0].select('type_chart?select=atk,def,mult')).data || [];
  ok(tc.length > 60 && tc.some(c => c.atk === '정보' && c.def === '수학' && Number(c.mult) === 2) && tc.some(c => c.atk === '국어' && c.def === '국어' && Number(c.mult) === 0.5), 'type chart (attack x defense table)', tc.length);
  ok(['정치경제:음악', '역사:정보', '체육:수학'].every(k => tc.some(c => `${c.atk}:${c.def}` === k && Number(c.mult) === 0)), 'x0 cells (효과가 없다)');
  const ln = (await S[0].select('lines?select=id,btype,subject&id=lte.76')).data || [];
  ok(ln.length === 76 && ln.every(l => l.btype) && ln.filter(l => l.subject === '과학').every(l => ['물리', '화학', '생명', '지구'].includes(l.btype)), '68 teacher lines + legends, science/social split into battle types', ln.filter(l => !l.btype).map(l => l.id));
  const lg = (await S[0].select('lines?id=gte.37&id=lte.42&select=id,bonus,max_stage&order=id')).data || [];
  ok(lg.length === 6 && lg.every(l => l.bonus && l.max_stage === 1), 'secret + 5 탐구 legends are bonus 1-stage lines', lg);
  const w = await fetch(`${URL_}/rest/v1/moves?id=eq.${mv[0].id}`, { method: 'PATCH', headers: { apikey: KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${STOK}`, Prefer: 'return=representation' }, body: JSON.stringify({ power: 999 }) });
  ok(w.status >= 400 || (await w.json()).length === 0, 'students cannot change moves');
}

console.log('\n[24] raids + special tickets');
{
  const mk = async (name) => {
    let sid; do { sid = '020' + String(Math.floor(Math.random() * 1000)).padStart(3, '0'); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'raid12' })).error);
    const c = client(await pwLogin(`${sid}@code.local`, 'raid12'));
    await c.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: name });
    return { c, sid };
  };
  const A = await mk('레이드에이'), B = await mk('레이드비');
  await admin.rpc('admin_grant_monster', { p_student_id: A.sid, p_line: 32, p_stage: 3 });   // 체육 attacker
  ok((await A.c.rpc('raid_join', { p_q: 'R1', p_t: 'x' })).error, 'unknown / bad raid refused');
  ok((await S[0].rpc('admin_create_raid', { p_species: 3, p_hp: 300, p_minutes: 5 })).error === 'NOT_ADMIN', 'students cannot open raids');
  const rd = (await admin.rpc('admin_create_raid', { p_species: 3, p_hp: 300, p_minutes: 5, p_tv: false })).data;
  ok(rd?.q === `R${rd.id}` && rd.t && rd.hp === 300 && rd.status === 'active', 'admin opens a printable raid (static QR)', rd);
  ok((await A.c.rpc('raid_join', { p_q: rd.q, p_t: 'deadbeef00' })).error === 'RAID_BAD_TOKEN', 'wrong raid token refused');
  let r = await A.c.rpc('raid_join', { p_q: rd.q, p_t: rd.t, p_line: 32 });
  ok(r.data?.players === 1 && r.data.me?.line_id === 32 && r.data.me.per_tap > 3, 'join with my 체육 monster (better per-tap damage)', r.data?.me);
  r = await A.c.rpc('raid_attack', { p_raid: rd.id, p_taps: 1000, p_line: 32 });
  ok(r.data?.accepted <= 20 && r.data.dealt === r.data.accepted * r.data.me.per_tap, 'tap cap: 1000 taps sent → only ~8/s accepted', { accepted: r.data?.accepted, dealt: r.data?.dealt });
  ok((await B.c.rpc('raid_attack', { p_raid: rd.id, p_taps: 5 })).error === 'RAID_NOT_JOINED', 'must join before attacking');
  await B.c.rpc('raid_join', { p_q: rd.q, p_t: rd.t });
  for (let i = 0; i < 40; i++) {
    await new Promise(res => setTimeout(res, 700));
    r = await A.c.rpc('raid_attack', { p_raid: rd.id, p_taps: 6 });
    await B.c.rpc('raid_attack', { p_raid: rd.id, p_taps: 6 });
    if (r.data?.status !== 'active') break;
  }
  r = await A.c.rpc('raid_state', { p_raid: rd.id });
  ok(r.data?.status === 'won' && r.data.hp === 0 && r.data.players === 2 && r.data.me.rewarded, 'many players wear the boss down → won, rewarded', { status: r.data?.status, hp: r.data?.hp });
  ok(r.data?.top?.length === 2 && r.data.top[0].damage >= r.data.top[1].damage, 'damage ranking', r.data?.top);
  let st = (await A.c.rpc('sync')).data.state;
  const sp = st.special?.find(x => x.special === 'raid');
  ok(sp?.species_id === 3, 'special raid ticket for the boss (stage-3 문장곤)', st.special);
  ok((await A.c.rpc('raid_attack', { p_raid: rd.id, p_taps: 5 })).data?.status === 'won', 'attacking a finished raid does nothing');
  // special tickets do not count towards the bag limit and redeem to the fixed monster at its stage
  const pend = st.tickets.filter(t => t.status === 'pending');
  r = await booth.rpc('booth_redeem', { p_payload: bag(A.sid, pend.map(t => ({ n: t.nonce, q: t.qr_id, t: t.token }))) });
  const got = r.data?.results?.find(x => x.special === 'raid');
  ok(got?.species_id === 3 && got.line_id === 1, 'booth turns the raid ticket into 문장곤', r.data?.results);
  st = (await A.c.rpc('sync')).data.state;
  ok(st.collection.find(c => c.line_id === 1)?.stage === 3, 'arrives at stage 3 directly');

  // TV raid: token rotates; the printed static token is not accepted
  const tv = (await admin.rpc('admin_create_raid', { p_species: 106, p_hp: 100000, p_minutes: 5, p_tv: true, p_kind: 'legend', p_title: '교장 선생님 레이드' })).data;
  const scr = (await booth.rpc('screen_raids')).data;
  const live = scr?.raids?.find(x => x.id === tv.id);
  ok(live && live.t && live.t !== tv.t && live.kind === 'legend', 'TV gets a rotating join token', live);
  ok((await B.c.rpc('raid_join', { p_q: tv.q, p_t: tv.t })).error === 'RAID_BAD_TOKEN', 'TV raid: only the current on-screen token works');
  ok((await B.c.rpc('raid_join', { p_q: tv.q, p_t: live.t })).data?.players === 1, 'join from the TV QR');
  ok((await B.c.rpc('sync')).data?.state?.raids_live?.some(x => x.id === tv.id), 'home shows the live TV raid');
  await admin.rpc('admin_end_raid', { p_id: tv.id });
  r = await B.c.rpc('raid_attack', { p_raid: tv.id, p_taps: 5 });
  ok(r.data?.status === 'failed' && !r.data.me.rewarded, 'ended raid = failed, no reward');
  ok((await B.c.rpc('raid_join', { p_q: tv.q, p_t: live.t })).error === 'RAID_OVER', 'cannot join a finished raid');

  // time-slot raid: TV spawns it inside the window, only one at a time, cooldown after
  await setS('raid_cooldown_min', 0);   // an earlier run may have just ended one
  await setS('raid_slots', [{ line: 38, from: '00:00', until: '23:59' }]);
  await booth.rpc('screen_raids');
  let slots = (await booth.rpc('screen_raids')).data?.raids?.filter(x => x.kind === 'slot' && x.species_id === 112 && x.status === 'active');
  ok(slots?.length === 1, 'time-slot legend raid appears on the TV (once)', slots?.length);
  await admin.rpc('admin_end_raid', { p_id: slots?.[0]?.id });
  await setS('raid_cooldown_min', 5);
  slots = (await booth.rpc('screen_raids')).data?.raids?.filter(x => x.kind === 'slot' && x.species_id === 112 && x.status === 'active');
  ok(slots?.length === 0, 'cooldown before the next time-slot raid');
  await setS('raid_slots', [{ line: 38, from: '09:00', until: '11:00' }, { line: 39, from: '12:00', until: '13:30' }, { line: 40, from: '16:00', until: '18:00' }]);

  // dex rewards: 50 % → 과연기, 100 % → 창문기 (special tickets, no raid)
  for (let l = 1; l <= 36; l++) await admin.rpc('admin_grant_monster', { p_student_id: B.sid, p_line: l, p_stage: l >= 35 ? 1 : 3 });   // 104 of 206 = 50 %
  st = (await B.c.rpc('sync')).data.state;
  ok(st.special?.some(x => x.special === 'dex50' && x.species_id === 121) && !st.special.some(x => x.special === 'dex100'), '도감 50% → 과연기 ticket', st.special);
  for (let l = 43; l <= 76; l++) await admin.rpc('admin_grant_monster', { p_student_id: B.sid, p_line: l, p_stage: 3 });
  st = (await B.c.rpc('sync')).data.state;
  ok(st.special?.some(x => x.special === 'dex100' && x.species_id === 124) && st.special.filter(x => x.special === 'dex50').length === 1, '도감 100% → 창문기 ticket (once each)', st.special);
  await admin.rpc('admin_unlink', { p_student_id: A.sid }); await admin.rpc('admin_unlink', { p_student_id: B.sid });
}

console.log('\n[25] ranking kinds + inquiry before login');
{
  for (const k of ['score', 'dex', 'battle']) {
    const rk = (await S[0].rpc('get_ranking_by', { p_kind: k })).data;
    const vals = (rk?.top || []).map(t => t.value);
    ok(rk?.kind === k && vals.every((v, i) => i === 0 || vals[i - 1] >= v) && vals.every(v => v > 0), `ranking by ${k}: sorted, only players with > 0`, vals.slice(0, 5));
  }
  ok((await anon.rpc('get_ranking_by', { p_kind: 'dex' })).error, 'anon cannot read the ranking');
  const body = '로그인이 안 돼요 ' + nonce();
  ok((await anon.rpc('send_inquiry_public', { p_body: body, p_name: '손님', p_student_id: '22001' })).data?.ok, 'inquiry from the login screen (no login)');
  ok((await anon.rpc('send_inquiry_public', { p_body: 'x', p_name: '손님' })).error === 'BAD_INQUIRY', 'too short refused');
  const iq = (await admin.rpc('admin_list_requests')).data?.inquiries?.find(x => x.body === body);
  ok(iq?.student_id === '022001' && iq.name === '손님 (로그인 전)', 'admin sees it (marked 로그인 전)', iq);
  await admin.rpc('admin_set_inquiry', { p_id: iq.id, p_done: true });
}

console.log('\n[26] battles (engine on the server, CPU practice, friend team vs AI, live PvP)');
{
  const mk = async (name) => {
    let sid; do { sid = '020' + String(Math.floor(Math.random() * 1000)).padStart(3, '0'); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'batl12' })).error);
    const c = client(await pwLogin(`${sid}@code.local`, 'batl12'));
    await c.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: name });
    return { c, sid };
  };
  const A = await mk('배틀에이'), B = await mk('배틀비');
  for (const l of [32, 17, 61]) await admin.rpc('admin_grant_monster', { p_student_id: A.sid, p_line: l, p_stage: 3 });
  await admin.rpc('admin_grant_monster', { p_student_id: B.sid, p_line: 4, p_stage: 1 });
  for (const fn of ['_bt_move', '_bt_turn', '_bt_finish', '_bt_resolve', '_bt_ai', '_bt_new'])
    ok((await A.c.rpc(fn, {})).error, `student cannot call internal ${fn}`);
  ok((await anon.rpc('battle_start_cpu', { p_lines: [32] })).error, 'anon cannot battle');
  ok((await A.c.rpc('battle_start_cpu', { p_lines: [4] })).error === 'BAD_TEAM', 'team must be my own monsters');
  ok((await A.c.rpc('battle_start_cpu', { p_lines: [32, 32] })).error === 'BAD_TEAM', 'no duplicates in a team');
  ok((await A.c.rpc('battle_start_cpu', { p_lines: [32, 17, 61, 1] })).error === 'BAD_TEAM', 'at most 3');

  // play until the end: move 1 each turn, pick the next monster when one faints
  const play = async (c, b, pick = () => ({ move: 1 })) => {
    for (let i = 0; i < 120 && b?.status === 'active'; i++) {
      const mine = b.sides[b.me];
      const act = b.need ? { switch: mine.mons.findIndex((m, k) => m.hp > 0 && k !== mine.active) } : pick(b);
      const r = await c.rpc('battle_act', { p_id: b.id, p_action: act });
      if (r.error) return { error: r.error, b };
      b = r.data;
    }
    return b;
  };

  // CPU practice
  let b = (await A.c.rpc('battle_start_cpu', { p_lines: [32, 17, 61] })).data;
  const foe = b?.sides?.[1];
  ok(b?.mode === 'cpu' && b.status === 'active' && b.sides[0].mons.length === 3 && foe?.mons?.length === 3, 'CPU practice starts 3 vs 3', b);
  ok(b?.sides[0].mons[0].moves?.length === 4 && b.sides[0].mons[0].hp === b.sides[0].mons[0].max && b.sides[0].mons[0].max > 100, 'my monsters: L50 HP + 4 moves');
  ok(!foe?.mons?.[0]?.moves && foe?.mons?.[0]?.name && !foe?.mons?.[1]?.name, 'foe: only the active monster is shown, never its moves');
  ok((await B.c.rpc('battle_state', { p_id: b.id })).error === 'BATTLE_NOT_FOUND', "others cannot read my battle");
  ok((await A.c.rpc('battle_act', { p_id: b.id, p_action: { move: 9 } })).error === 'BAD_ACTION', 'bad move slot refused');
  ok((await A.c.rpc('battle_act', { p_id: b.id, p_action: { switch: 0 } })).error === 'BAD_ACTION', 'cannot switch to the monster already out');
  let r = await A.c.rpc('battle_act', { p_id: b.id, p_action: { move: 1 } });
  ok(r.data?.turn === 1 && r.data.seq === 1 && r.data.log.some(x => /^@0.+의 .+!$/.test(x.m || '')) && r.data.log.some(x => /^@1/.test(x.m || '')), 'one turn: both sides act, log uses @0/@1 tokens', r.data?.log);
  ok(r.data.sides[0].mons[0].moves[0].pp === b.sides[0].mons[0].moves[0].pp - 1 || r.data.log.some(x => /잠들어|저려서/.test(x.m || '')), 'PP goes down');
  b = await play(A.c, r.data);
  ok(b?.status === 'over' && (b.winner === 0 || b.winner === 1) && b.reward?.ticket === false && ['practice', 'lost'].includes(b.reward?.why), 'CPU battle ends; practice gives no ticket', { st: b?.status, w: b?.winner, rw: b?.reward, err: b?.error });

  // friend team vs AI (B's team = strongest monsters since no team saved)
  const codeB = (await B.c.rpc('battle_code')).data;
  ok(/^[a-z2-9]{8}$/.test(codeB || '') && (await B.c.rpc('battle_code')).data === codeB, 'battle QR code (stable)', codeB);
  ok((await B.c.rpc('battle_start_team', { p_code: codeB, p_lines: [4] })).error === 'BATTLE_SELF', 'cannot battle myself');
  ok((await A.c.rpc('battle_start_team', { p_code: 'zzzzzzzz', p_lines: [32] })).error === 'BATTLE_CODE_NOT_FOUND', 'unknown code');
  const t0 = (await A.c.rpc('sync')).data.state.profile.evo_tickets;
  let won = null;
  for (let tries = 0; tries < 4 && !won; tries++) {
    b = (await A.c.rpc('battle_start_team', { p_code: codeB, p_lines: [32, 17, 61] })).data;
    if (tries === 0) ok(b?.mode === 'team' && b.sides[1].mons.length === 1 && b.names[1], 'friend team vs AI starts (friend has 1 monster)', b?.sides?.[1]);
    b = await play(A.c, b);
    if (b?.winner === 0) won = b;
  }
  ok(won?.reward?.ticket === true, 'beating a friend team → 1 진화권', won?.reward);
  const st1 = (await A.c.rpc('sync')).data.state.profile;
  ok(st1.evo_tickets === t0 + 1, 'evo ticket +1', [t0, st1.evo_tickets]);
  const rkA = (await A.c.rpc('get_ranking_by', { p_kind: 'battle' })).data;
  ok(rkA?.me?.value === 1, 'battle win counts in the ranking', rkA?.me);
  b = (await A.c.rpc('battle_start_team', { p_code: codeB, p_lines: [32, 17, 61] })).data;
  b = await play(A.c, b);
  ok(b?.winner !== 0 || b.reward?.why === 'same_opp', 'same friend again today → no 2nd ticket', b?.reward);

  // live PvP: invite → home inbox → accept → both choose (hidden from each other)
  await setS('battle_turn_sec', 3);
  const codeA = (await A.c.rpc('battle_code')).data;
  let inv = (await B.c.rpc('battle_challenge', { p_code: codeA, p_lines: [4] })).data;
  ok(inv?.status === 'invite' && inv.mode === 'pvp', 'B sends a live battle request', inv);
  let box = (await A.c.rpc('battle_inbox')).data;
  ok(box?.invites?.some(x => x.id === inv.id && x.from), 'A sees "배틀 신청!" in the inbox', box);
  ok((await S[0].rpc('battle_accept', { p_id: inv.id, p_lines: [1] })).error, 'only the invited friend can accept');
  let pa = (await A.c.rpc('battle_accept', { p_id: inv.id, p_lines: [32, 17] })).data;
  ok(pa?.status === 'active' && pa.me === 1 && pa.sides[1].mons.length === 2 && pa.sides[0].mons.length === 1, 'A accepts → battle starts (A is side 1)', pa);
  ok((await A.c.rpc('battle_start_cpu', { p_lines: [32] })).error === 'IN_PVP_BATTLE' && (await B.c.rpc('battle_start_cpu', { p_lines: [4] })).error === 'IN_PVP_BATTLE', 'cannot start another battle during a live one (no silent forfeit)');
  r = await B.c.rpc('battle_act', { p_id: inv.id, p_action: { move: 1 } });
  ok(r.data?.chosen === true && r.data.turn === 0, 'B chose; waits for A');
  const pa2 = (await A.c.rpc('battle_state', { p_id: inv.id })).data;
  ok(pa2?.chosen === false && !JSON.stringify(pa2).includes('"acts"'), "A cannot see B's choice");
  ok((await B.c.rpc('battle_act', { p_id: inv.id, p_action: { move: 2 } })).error === 'BATTLE_WAIT', 'cannot choose twice');
  await new Promise(res => setTimeout(res, 3500));
  const pa3 = (await A.c.rpc('battle_state', { p_id: inv.id })).data;
  ok(pa3?.turn === 1 || pa3?.status === 'over', 'time up → AI chooses for A, the turn is played', pa3?.turn);
  await setS('battle_turn_sec', 45);
  await A.c.rpc('battle_forfeit', { p_id: inv.id });
  inv = (await B.c.rpc('battle_challenge', { p_code: codeA, p_lines: [4] })).data;
  await A.c.rpc('battle_accept', { p_id: inv.id, p_lines: [32] });
  const tB = (await B.c.rpc('sync')).data.state.profile.evo_tickets;
  r = await A.c.rpc('battle_forfeit', { p_id: inv.id });
  ok(r.data?.status === 'over' && r.data.winner === 0, 'A gives up → B wins', r.data?.winner);
  const rb = (await B.c.rpc('battle_state', { p_id: inv.id })).data;
  ok(rb?.reward?.ticket === true && (await B.c.rpc('sync')).data.state.profile.evo_tickets === tB + 1, 'B gets the 진화권', rb?.reward);

  inv = (await B.c.rpc('battle_challenge', { p_code: codeA, p_lines: [4] })).data;
  await A.c.rpc('battle_decline', { p_id: inv.id });
  ok((await B.c.rpc('battle_state', { p_id: inv.id })).data?.status === 'declined', 'declined request shows as declined');
  ok((await A.c.rpc('battle_set_team', { p_lines: [61, 17] })).data?.ok && (await A.c.rpc('battle_today')).data?.team?.join() === '61,17', 'save my battle team');
  ok((await A.c.rpc('battle_set_team', { p_lines: [99] })).error === 'BAD_TEAM', 'cannot save monsters I do not have');
  ok((await A.c.rpc('battle_today')).data?.wins === 1, 'today: 1 rewarded win of 3');
  await admin.rpc('admin_unlink', { p_student_id: A.sid }); await admin.rpc('admin_unlink', { p_student_id: B.sid });
}

console.log('\n[27] 2 vs 2 double battles (4 monsters, chosen by the QR owner)');
{
  const mk = async (name) => {
    let sid; do { sid = '020' + String(Math.floor(Math.random() * 1000)).padStart(3, '0'); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'dbl123' })).error);
    const c = client(await pwLogin(`${sid}@code.local`, 'dbl123'));
    await c.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: name });
    return { c, sid };
  };
  const A = await mk('더블에이'), B = await mk('더블비');
  for (const l of [32, 17, 61, 44]) await admin.rpc('admin_grant_monster', { p_student_id: A.sid, p_line: l, p_stage: 3 });
  for (const l of [4, 5]) await admin.rpc('admin_grant_monster', { p_student_id: B.sid, p_line: l, p_stage: 1 });
  ok((await A.c.rpc('battle_start_cpu', { p_lines: [32, 17, 61, 44] })).error === 'BAD_TEAM', '1 vs 1 takes at most 3');
  ok((await A.c.rpc('battle_start_cpu', { p_lines: [32, 17, 61, 44], p_format: 'triple' })).error === 'BAD_FORMAT', 'unknown format refused');
  let b = (await A.c.rpc('battle_start_cpu', { p_lines: [32, 17, 61, 44], p_format: 'double' })).data;
  ok(b?.format === 'double' && b.sides[0].act?.length === 2 && b.sides[1].act?.length === 2 && b.sides[0].mons.length === 4 && b.sides[1].mons.length === 4,
    '2 vs 2 practice: 4 monsters each, 2 on the field', { f: b?.format, act: b?.sides?.map(x => x.act) });
  const foe = b?.sides?.[1];
  ok(foe?.act?.every(i => foe.mons[i].name) && foe.mons.filter(m => m.name).length === 2 && foe.mons.every(m => !m.moves), 'foe: both monsters on the field are shown, bench and moves hidden');
  ok((await A.c.rpc('battle_act', { p_id: b.id, p_action: { slots: [{ move: 1, target: 0 }] } })).error === 'BAD_ACTION', 'both slots must choose');
  ok((await A.c.rpc('battle_act', { p_id: b.id, p_action: { slots: [{ switch: 2 }, { switch: 2 }] } })).error === 'BAD_ACTION', 'cannot send the same monster to both slots');
  let r = await A.c.rpc('battle_act', { p_id: b.id, p_action: { slots: [{ move: 1, target: 1 }, { move: 1, target: 0 }] } });
  ok(r.data?.turn === 1 && r.data.log.filter(x => x.use).length >= 3, 'one doubles turn: up to 4 monsters act', r.data?.log?.filter(x => x.use).map(x => x.use[0]));
  ok(r.data.log.some(x => x.use && x.use[0] >= 2), 'foe slots act too (slot 2/3)');
  // play to the end: both slots attack the first foe; pick replacements when asked
  b = r.data;
  for (let i = 0; i < 150 && b?.status === 'active'; i++) {
    const mine = b.sides[b.me];
    const bench = mine.mons.map((m, k) => k).filter((k) => mine.mons[k].hp > 0 && !mine.act.includes(k));
    let slots;
    if (b.need) slots = mine.act.map((_, k) => (b.need_slots.includes(k) ? { switch: bench.shift() } : null));
    else slots = mine.act.map((ix) => (mine.mons[ix].hp > 0 ? { move: 1 + (i % 2), target: 0 } : null));
    const rr = await A.c.rpc('battle_act', { p_id: b.id, p_action: { slots } });
    if (rr.error) { b = { error: rr.error, b }; break; }
    b = rr.data;
  }
  ok(b?.status === 'over' && (b.winner === 0 || b.winner === 1), '2 vs 2 battle plays to the end', { st: b?.status, err: b?.error });

  // the QR owner picks the format; the scanner gets that format
  const codeB = (await B.c.rpc('battle_code', { p_format: 'double' })).data;
  ok((await B.c.rpc('battle_today')).data?.format === 'double', 'QR owner chose 2 vs 2');
  const pk = (await A.c.rpc('battle_peek', { p_code: codeB })).data;
  ok(pk?.format === 'double' && pk.name, 'scanner sees the format before starting', pk);
  b = (await A.c.rpc('battle_start_team', { p_code: codeB, p_lines: [32, 17, 61, 44] })).data;
  ok(b?.format === 'double' && b.sides[1].mons.length === 2 && b.sides[1].act.length === 2, 'friend team vs AI uses the friend\'s 2 vs 2 (friend has 2 monsters)', b?.sides?.[1]);
  await A.c.rpc('battle_forfeit', { p_id: b.id });
  await B.c.rpc('battle_code', { p_format: 'single' });
  ok((await B.c.rpc('battle_code', { p_format: 'x' })).error === 'BAD_FORMAT', 'bad format refused');
  ok((await A.c.rpc('battle_set_team', { p_lines: [44, 61, 17, 32] })).data?.ok, 'a battle team can hold 4 (first 3 used for 1 vs 1)');
  await admin.rpc('admin_unlink', { p_student_id: A.sid }); await admin.rpc('admin_unlink', { p_student_id: B.sid });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
