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

const admin = client(await login('admin@staff.test'));
const booth = client(await login('booth1@staff.test'));
const S = [];
for (const e of ['022001', '022002', '022003', '023004']) S.push(client(await login(`${e}@test.local`)));
const anon = client(null);

console.log('\n[0] setup');
await admin.rpc('ensure_profile'); await booth.rpc('ensure_profile');
await admin.select('settings?key=eq.festival_open'); // warm
for (const sid of ['022001', '022002', '022003', '023004']) await admin.rpc('admin_unlink', { p_student_id: sid });
const profs = [];
for (const s of S) profs.push((await s.rpc('ensure_profile')).data);
ok(profs[0]?.student_id === '022001' && profs[0]?.gen === 22 && profs[0]?.role === 'student', 'student id parsed from email', profs[0]);
ok(profs[3]?.student_id === '023004' && profs[3]?.gen === 23, 'gen parsed', profs[3]);
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
ok(r.data?.correct === true && r.data.granted === true && r.data.evo_tickets === 1, 'correct answer → +1 ticket', r);
r = await S[0].rpc('answer_quiz', { p_attempt: qz.attempt_id, p_choice: right });
ok(r.error === 'NO_QUIZ', 'cannot answer the same quiz twice', r);
const qz2 = st.quizzes[1];
const wrong = qz2.choices.findIndex(c => !c.startsWith('맞아요'));
r = await S[0].rpc('answer_quiz', { p_attempt: qz2.attempt_id, p_choice: wrong });
ok(r.data?.correct === false && r.data.granted === false && r.data.answer_pos === qz2.choices.findIndex(c => c.startsWith('맞아요')),
  'wrong answer → no ticket, shows right position', r);

console.log('\n[8] evolve race (5 parallel taps, 1 ticket)');
const line = st.collection[0].line_id;
const evs = await Promise.all(Array.from({ length: 5 }, () => S[0].rpc('evolve', { p_line: line })));
const spent = evs.filter(e => e.data);
ok(spent.length === 1 && evs.filter(e => e.error === 'NO_TICKET').length === 4, 'exactly one evolve consumed the ticket', evs.map(e => e.error || 'ok'));

console.log('\n[9] pity: guaranteed after 1 fail at stage 1');
await admin.rpc('admin_adjust_tickets', { p_student_id: '022002', p_delta: 2 });
const settings = (await admin.select('settings?key=eq.evo_prob')).data[0].value;
await fetch(`${URL_}/rest/v1/settings?key=eq.evo_prob`, { method: 'PATCH', headers: { apikey: KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${await login('admin@staff.test')}` }, body: JSON.stringify({ value: [0, 0, 0] }) });
const line2 = (await S[1].rpc('sync')).data.state.collection.find(c => c.stage === 1).line_id;
const e1 = await S[1].rpc('evolve', { p_line: line2 });
const e2 = await S[1].rpc('evolve', { p_line: line2 });
ok(e1.data?.success === false && e2.data?.success === true && e2.data.stage === 2, 'fail at 0% then guaranteed success', [e1.data?.success, e2.data?.success]);
await fetch(`${URL_}/rest/v1/settings?key=eq.evo_prob`, { method: 'PATCH', headers: { apikey: KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${await login('admin@staff.test')}` }, body: JSON.stringify({ value: settings }) });
ok((await S[1].rpc('evolve', { p_line: line2 })).error === 'NO_TICKET', 'no tickets left → NO_TICKET');

console.log('\n[10] rotating legendary QR');
const rt = await booth.rpc('screen_rotating_token', { p_qr: 'L01' });
ok(rt.data?.token?.length === 10, 'screen gets current token', rt);
r = await S[3].rpc('sync', { p_scans: [{ n: nonce(), q: 'L01', t: rt.data.token }] });
ok(r.data?.acks?.[0]?.status === 'ok', 'student accepts rotating token');
r = await S[3].rpc('sync', { p_scans: [{ n: nonce(), q: 'L01', t: 'abcdef1234' }] });
ok(r.data?.acks?.[0]?.status !== 'ok', 'fake rotating token rejected', r.data?.acks);
r = await S[2].rpc('sync', { p_scans: [{ n: nonce(), q: '_', t: T.L01.manual_code }] });
ok(r.data?.acks?.[0]?.status === 'invalid_token', 'manual code can NOT unlock the legendary QR', r.data?.acks);
await booth.rpc('booth_redeem', { p_payload: '023004' });
const rt2 = await booth.rpc('screen_rotating_token', { p_qr: 'L01' });
r = await S[3].rpc('sync', { p_scans: [{ n: nonce(), q: 'L01', t: rt2.data.token }] });
ok(r.data?.acks?.[0]?.status === 'daily_cap', 'legendary QR: once per day', r.data?.acks);
const leg = (await S[3].rpc('sync')).data.state.collection.find(c => c.line_id >= 16);
await admin.rpc('admin_adjust_tickets', { p_student_id: '023004', p_delta: 1 });
ok(leg && (await S[3].rpc('evolve', { p_line: leg.line_id })).error === 'MAX_STAGE', 'legendary cannot evolve (1 stage)');
await admin.rpc('admin_adjust_tickets', { p_student_id: '023004', p_delta: -1 });

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
const adminTok0 = await login('admin@staff.test');
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
ok(ta?.consented === true && ta.display === '테스트쌤', 'consent + display name for guests', ta);

console.log('\n[14] ranking + kill switch');
r = await S[0].rpc('get_ranking');
ok(r.data?.me?.rank >= 1 && r.data.top.some(t => t.me), 'ranking includes me', r.data?.me);
ok(!JSON.stringify(r.data).includes('김민준'), 'ranking never shows full names');
const kill = (v) => fetch(`${URL_}/rest/v1/settings?key=eq.festival_open`, { method: 'PATCH', headers: { apikey: KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${adminTok}` }, body: JSON.stringify({ value: v }) });
const adminTok = await login('admin@staff.test');
await kill(false);
r = await S[3].rpc('sync', { p_scans: [{ n: nonce(), q: 'A13', t: T.A13.token }] });
ok(r.data?.acks?.[0]?.status === 'closed', 'festival closed → scans held (closed)');
ok((await booth.rpc('booth_redeem', { p_payload: '023004' })).error === 'FESTIVAL_CLOSED', 'festival closed → booth stops');
await kill(true);
const stats = await admin.rpc('admin_stats');
ok(stats.data?.students >= 4 && stats.data.qrs.length === 25, 'admin stats work', { students: stats.data?.students });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
