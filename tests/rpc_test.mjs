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

// staging allows ~30 logins / 5 min per IP and this suite needs more → wait out a 429 instead of failing
async function tokenReq(email, password) {
  for (let i = 0; ; i++) {
    const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (r.status !== 429 || i >= 12) return j;
    if (i === 0) console.log('  … login rate limit, waiting');
    await new Promise((res) => setTimeout(res, 30000));
  }
}
async function login(email) {
  const j = await tokenReq(email, env.TEST_PASSWORD);
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
    async patch(path, body) {
      const r = await fetch(`${URL_}/rest/v1/${path}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(body) });
      return r.status;
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
// 0032: QR 에서 야생 포켓몬이 나올 확률 — 예전 시험은 정해 둔 포켓몬을 기대하므로 시험 동안 0 (끝에서 되돌림)
const WILD0 = (await admin.select('settings?key=eq.wild_chance')).data?.[0]?.value ?? 0.4;
await patchSetting('wild_chance', 0);
// 0034: 진화의 돌은 퀴즈·배틀에서 확률로 — 예전 시험은 늘 받는다고 보므로 시험 동안 100% (끝에서 되돌림)
const STONE0 = Object.fromEntries((await admin.select('settings?key=in.(quiz_stone_chance,battle_stone_chance)&select=key,value')).data.map((x) => [x.key, x.value]));
await patchSetting('quiz_stone_chance', 1); await patchSetting('battle_stone_chance', 1);
// 0038: 야생 · 사파리 잡기가 아주 가끔 메타몽 — 예전 시험은 잡은 포켓몬이 그대로라고 보므로 시험 동안 0 (끝에서 되돌림)
const DITTO0 = (await admin.select('settings?key=eq.ditto_disguise_chance')).data?.[0]?.value ?? 0.005;
await patchSetting('ditto_disguise_chance', 0);
// 0038: 방랑 전설 (라이코·앤테이·스이쿤) — 한 시간마다 바뀌는 장소 QR 에서 30% 로 티켓 대신 만남이 생김 → 그 시각에 그 QR 을 찍는
// 예전 시험 (가방 · 셀프 수령 · 레이드 잡기 [12] [41] …) 이 가끔 깨짐. 시험 동안 0 ([45] 는 직접 켜서 봄, 끝에서 되돌림)
const ROAM0 = (await admin.select('settings?key=eq.roam_chance')).data?.[0]?.value ?? 0.3;
await patchSetting('roam_chance', 0);
// 0039: 시간표 칸의 날씨 · 필드 (모래바람 데미지 등) — 예전 배틀 시험이 시각에 따라 달라지지 않게 시험 동안 빈 시간표 (끝에서 되돌림)
const BF_ORIG = (await admin.select('settings?key=eq.battle_fields')).data?.[0]?.value ?? [];
await patchSetting('battle_fields', []);
// 0042: 새로 잡는 포켓몬이 1/512 로 반짝 — 예전 시험 (SHINY_LOCKED 등) 이 흔들리지 않게 시험 동안 0 (끝에서 되돌림)
const WSHINY0 = (await admin.select('settings?key=eq.wild_shiny_chance')).data?.[0]?.value ?? 0.001953125;
await patchSetting('wild_shiny_chance', 0);
const booth = client(await login('booth1@staff.test'));
const S = [];
// 테스트 학생 번호는 각 기수의 900번대 (실제 학생은 001~400) — 실제 학생 번호와 절대 겹치지 않게. 없으면 만든다
for (const e of ['022901', '022902', '022903', '021904']) await client(null).rpc('dev_create_account', { p_email: e });
const STOK = await login('022901@test.local');
for (const e of ['022901', '022902', '022903', '021904']) S.push(client(e === '022901' ? STOK : await login(`${e}@test.local`)));
const anon = client(null);
// 0036: 포켓몬 번호 (박스의 한 마리). 같은 계열이 여러 마리면 먼저 잡은 것. 없는 계열 = -계열 (서버가 거절)
const myMons = async (c) => { const r = await c.select('collection?select=id,line_id,stage,level,pos,held,catch_count&released_at=is.null&order=id'); return Array.isArray(r.data) ? r.data : []; };
const monId = async (c, line) => (line == null ? null : (await myMons(c)).find((m) => m.line_id === line)?.id ?? -line);
const monIds = async (c, lines) => { const ms = await myMons(c); return lines.map((l) => ms.find((m) => m.line_id === l)?.id ?? -l); };

console.log('\n[0] setup');
await admin.rpc('ensure_profile'); await booth.rpc('ensure_profile');
await admin.select('settings?key=eq.festival_open'); // warm
for (const sid of ['022901', '022902', '022903', '021904']) await admin.rpc('admin_unlink', { p_student_id: sid });
const NAMES = ['김민준', '이서연', '박지윤', '최도우'];
const fresh0 = (await S[0].rpc('ensure_profile')).data;
ok(fresh0?.needs_register === true, 'first login asks to register (no profile yet)', fresh0);
const profs = [];
for (const [i, sid] of ['022901', '022902', '022903', '021904'].entries())
  profs.push((await S[i].rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: NAMES[i], p_show: true })).data);
ok(profs[0]?.student_id === '022901' && profs[0]?.gen === 22 && profs[0]?.role === 'student' && profs[0]?.consented === true, 'student registers with number + name', profs[0]);
ok(profs[0]?.display === '22기 김*준', 'display name is masked like 김*준', profs[0]?.display);
ok(profs[3]?.student_id === '021904' && profs[3]?.gen === 21, 'gen parsed', profs[3]);
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
ok((await S[0].rpc('booth_redeem', { p_payload: '022901' })).error === 'NOT_STAFF', 'student cannot call booth_redeem');
ok((await S[0].rpc('admin_stats')).error === 'NOT_ADMIN', 'student cannot call admin_stats');
ok((await anon.rpc('sync', { p_scans: [] })).error, 'anon cannot call sync');
for (const fn of ['admin_relink', 'admin_export_ranking', 'admin_grant_monster', 'ensure_profile', 'get_ranking', 'screen_feed', 'spin_roulette', 'register_profile', 'admin_invite_staff', 'admin_list_staff', 'link_number', 'send_inquiry', 'admin_list_requests', 'admin_decide_reset'])
  ok((await anon.rpc(fn, {})).error, `anon cannot call ${fn}`);
for (const fn of ['_is_open', '_admit', '_redeem_pending', '_state', '_setting', '_rand', '_new_secret', '_roulette_json', '_state_base', '_create_password_user', '_mask_name', '_attach_google', '_kick_number', '_set_number_account', '_number_owner', '_school_sid', '_mon_new', '_box_count', '_box_max', '_ticket_mon', '_team_mons'])
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
const payload = bag('022901', pend.map(t => ({ n: t.nonce, q: t.qr_id, t: t.token })));
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
await booth.rpc('booth_redeem', { p_payload: '022901' });
r = await S[0].rpc('sync', { p_scans: [{ n: nonce(), q: 'A01', t: T.A01.token }] });
ok(r.data?.acks?.[0]?.status === 'ok', '3rd scan of A01 today ok');
await booth.rpc('booth_redeem', { p_payload: '022901' });
r = await S[0].rpc('sync', { p_scans: [{ n: nonce(), q: 'A01', t: T.A01.token }] });
ok(r.data?.acks?.[0]?.status === 'daily_cap', '4th scan of A01 today → daily_cap', r.data?.acks);

console.log('\n[5] offline bag (student never synced)');
const off = [{ n: nonce(), q: 'A03', t: T.A03.token }, { n: nonce(), q: '_', t: T.A04.manual_code }];
const offPayload = bag('022902', off);
ok(/^[A-Z0-9./-]+$/.test(offPayload), 'bag QR v2 uses only uppercase/digits/./-', offPayload);
r = await booth.rpc('booth_redeem', { p_payload: offPayload });
ok(r.data?.results?.filter(x => x.species_id && !x.replay).length === 2, 'offline tickets redeemed straight from the bag QR', r);
r = await booth.rpc('booth_redeem', { p_payload: offPayload });
ok(r.data?.results?.length === 2 && r.data.results.every(x => x.replay), 'second read of same bag = replay only', r.data);
st = (await S[1].rpc('sync')).data.state;
ok(st.collection.reduce((a, c) => a + c.catch_count, 0) === 2, 'student 2 has exactly 2 catches');
const forged = bag('022902', [{ n: nonce(), q: 'A05', t: 'forged00' }]);
r = await booth.rpc('booth_redeem', { p_payload: forged });
ok(r.data?.results?.[0]?.error === 'invalid_token', 'forged token in bag rejected', r.data);
r = await booth.rpc('booth_redeem', { p_payload: bagV1('022902', [{ n: nonce(), q: 'A06', t: T.A06.token }]) });
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
// 3단계 계열 · 진화 레벨 전 (0032/0034: 레벨이 되면 무료, 돌 진화는 100% — 진화의 돌 1개 경쟁을 보려면 둘 다 아니어야)
const three8 = new Set((await admin.select('lines?select=id&max_stage=eq.3')).data.map((l) => l.id));
// 0037 갈래 진화 계열 (랄토스 → 킬리아 → 가디안/엘레이드 …) 은 2단계에서 PICK_BRANCH 가 먼저라 경쟁 시험이 안 됨 → 뺌
const evoFrom = (await admin.select('evolutions?select=from_species')).data || [];
const evoN = {}; for (const e of evoFrom) evoN[e.from_species] = (evoN[e.from_species] || 0) + 1;
const branchSp = Object.keys(evoN).filter((k) => evoN[k] > 1);
const branch8 = new Set(branchSp.length ? ((await admin.select(`species?select=line_id&id=in.(${branchSp.join(',')})`)).data || []).map((x) => x.line_id) : []);
const line = (st.collection.find((c) => c.stage === 1 && three8.has(c.line_id) && !branch8.has(c.line_id) && c.level < 15) || st.collection[0]).line_id;
const have = (await S[0].rpc('sync')).data.state.profile.evo_tickets;
if (have !== 1) await admin.rpc('admin_adjust_tickets', { p_student_id: '022901', p_delta: 1 - have });   // exactly 1 ticket for the race
const mon8 = await monId(S[0], line);
const evs = await Promise.all(Array.from({ length: 5 }, () => S[0].rpc('evolve', { p_mon: mon8 })));
const spent = evs.filter(e => e.data);
ok(spent.length === 1 && evs.filter(e => e.error === 'NO_TICKET').length === 4, 'exactly one evolve consumed the ticket', evs.map(e => e.error || 'ok'));

console.log('\n[9] pity: guaranteed after 1 fail at stage 1');
await admin.rpc('admin_adjust_tickets', { p_student_id: '022902', p_delta: 2 });
const settings = (await admin.select('settings?key=eq.evo_prob')).data[0].value;
await patchSetting('evo_prob', [0, 0, 0]);
// 3단계 계열 (0032: 실제 포켓몬은 1~3단계) + 아직 진화 레벨 전 (레벨이 되면 진화의 돌 없이 진화하므로)
const three = new Set((await admin.select('lines?select=id&max_stage=eq.3')).data.map((l) => l.id));
const line2 = (await S[1].rpc('sync')).data.state.collection.find(c => c.stage === 1 && three.has(c.line_id) && c.level < 15).line_id;
const e1 = await S[1].rpc('evolve', { p_mon: await monId(S[1], line2) });
const e2 = await S[1].rpc('evolve', { p_mon: await monId(S[1], line2) });
ok(e1.data?.success === false && e2.data?.success === true && e2.data.stage === 2, 'fail at 0% then guaranteed success', [e1.data?.success, e2.data?.success]);
await patchSetting('evo_prob', [0, 0.7, 0.35]);
ok((await S[1].rpc('evolve', { p_mon: await monId(S[1], line2) })).error === 'NO_TICKET', 'no tickets left → NO_TICKET');

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
await booth.rpc('booth_redeem', { p_payload: '021904' });
const rt2 = await booth.rpc('screen_rotating_token', { p_qr: 'L01' });
r = await S[3].rpc('sync', { p_scans: [{ n: nonce(), q: 'L01', t: rt2.data.token }] });
ok(r.data?.acks?.[0]?.status === 'daily_cap', 'legendary QR: once per day', r.data?.acks);
const leg = (await S[3].rpc('sync')).data.state.collection.find(c => c.line_id >= 35);
await admin.rpc('admin_adjust_tickets', { p_student_id: '021904', p_delta: 1 });
ok(leg && (await S[3].rpc('evolve', { p_mon: await monId(S[3], leg.line_id) })).error === 'MAX_STAGE', 'legendary cannot evolve (1 stage)');
await admin.rpc('admin_adjust_tickets', { p_student_id: '021904', p_delta: -1 });
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
// 0032: 정해 둔 포켓몬이 없는 QR → 야생 포켓몬이 나옴
const wildIds = new Set((await admin.select('lines?select=id&subject=eq.야생')).data.map((l) => l.id));
const nw = nonce();
await S[1].rpc('sync', { p_scans: [{ n: nw, q: 'A17', t: T.A17.token }] });
r = await booth.rpc('booth_redeem', { p_payload: '022902' });
const wr = r.data?.results?.find((x) => x.nonce === nw);
ok(wr?.species_id && wildIds.has(wr.line_id), 'QR with no listed Pokémon → a wild Pokémon', wr);
// 야생도 못 나오게 하면 (가중치 0) 예전처럼 empty_pool
const ww = (await admin.select('settings?key=eq.wild_weights')).data[0].value;
await patchSetting('wild_weights', { common: 0, rare: 0, legendary: 0 });
await S[1].rpc('sync', { p_scans: [{ n: nonce(), q: 'A17', t: T.A17.token }] });
r = await booth.rpc('booth_redeem', { p_payload: '022902' });
await patchSetting('wild_weights', ww);
ok(r.data?.results?.some(x => x.error === 'empty_pool'), 'empty pool reported at booth', r.data?.results);
r = await S[1].rpc('sync', { p_scans: [{ n: nonce(), q: 'A17', t: T.A17.token }] });
ok(r.data?.acks?.[0]?.status === 'ok', 'empty-pool ticket does not lock the QR forever', r.data?.acks);
await fetch(`${URL_}/rest/v1/qr_rewards`, { method: 'POST', headers: H0, body: JSON.stringify(pool17.map(p => ({ qr_id: 'A17', ...p }))) });
let lastStatus;
for (let i = 0; i < 11; i++) lastStatus = (await S[0].rpc('sync', { p_scans: [{ n: nonce(), q: '_', t: 'ZZZZ' + 'ABCDEFGHJK'[i % 10] }] })).data?.acks?.[0]?.status;
ok(lastStatus === 'locked', 'manual-code guessing locked after 10 misses', lastStatus);
const sr0 = await S[1].rpc('self_redeem');
ok(sr0.error === 'SELF_REDEEM_OFF', 'self-redeem off by default', sr0);
const setS = (k, v) => fetch(`${URL_}/rest/v1/settings?key=eq.${k}`, { method: 'PATCH', headers: H0, body: JSON.stringify({ value: v }) });
await setS('self_redeem', true);
r = await S[1].rpc('self_redeem');
ok(r.data?.results?.length >= 1 && r.data.results.every(x => x.species_id || x.error), 'self-redeem works when the valve is open', r.data);
await setS('self_redeem', false);

console.log('\n[13] backup login codes (numbers only since 0031) + guest id accounts');
const codes = (await admin.rpc('admin_make_login_codes', { p_ids: ['T01', '22999'], p_names: ['테스트쌤', '코드학생'] })).data;
ok(codes?.length === 1 && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(codes[0].code) && codes[0].id === '022999', 'codes generated for the number only (letter id skipped)', codes);
const cTok = await tokenReq('022999@code.local', codes[0].code.replace('-', ''));
ok(!!cTok.access_token, 'student can sign in with the printed code');
const GUEST = 'tg' + Math.random().toString(36).slice(2, 9);   // 선생님·손님 = 앱에서 만든 아이디 계정 (g:<아이디>)
await anon.rpc('create_id_account', { p_id: GUEST, p_password: 'guest12' });
const tc = client((await tokenReq(`${GUEST}@id.local`, 'guest12')).access_token);
const tp = (await tc.rpc('register_profile', { p_kind: 'id', p_student_id: null, p_name: '테스트쌤' })).data;
ok(tp?.student_id === `g:${GUEST}` && tp.gen === null && tp.role === 'student', 'guest profile created', tp);
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
ok((await booth.rpc('booth_redeem', { p_payload: '021904' })).error === 'FESTIVAL_CLOSED', 'festival closed → booth stops');
await kill(true);
const stats = await admin.rpc('admin_stats');
ok(stats.data?.students >= 4 && stats.data.qrs.length >= 25, 'admin stats work', { students: stats.data?.students });

console.log('\n[15] festival ops: guests out of ranking, export, grant, dup bonus, relink, auto-close');
r = await S[0].rpc('get_ranking');
ok(!r.data.top.some(t => t.display === '테**쌤'), 'teacher/guest code accounts are not ranked');
const exp = (await admin.rpc('admin_export_ranking')).data;
const ex1 = exp?.find(x => x.student_id === '022901');
ok(ex1?.name === '김민준' && ex1.rank >= 1 && exp.some(x => x.student_id === `g:${GUEST}` && x.rank === null), 'export has real names, guests unranked', ex1);
ok((await S[0].rpc('admin_export_ranking')).error === 'NOT_ADMIN', 'students cannot export');
await admin.rpc('admin_grant_monster', { p_student_id: '022903', p_line: 5, p_stage: 2 });
st = (await S[2].rpc('sync')).data.state;
ok(st.collection.find(c => c.line_id === 5)?.stage === 2, 'admin can grant a monster (dispute fix)');
// dup bonus: 3rd catch of the same line → +1 ticket
await booth.rpc('booth_redeem', { p_payload: '022903' });             // empty the bag first
let c7 = (await S[2].rpc('sync')).data.state.collection.find(c => c.line_id === 7)?.catch_count || 0;
while (c7 % 3 !== 2) { await admin.rpc('admin_grant_monster', { p_student_id: '022903', p_line: 7, p_stage: 1 }); c7++; }
st = (await S[2].rpc('sync')).data.state;
const pool18 = (await admin.select('qr_rewards?qr_id=eq.A18&select=line_id,weight')).data;
await fetch(`${URL_}/rest/v1/qr_rewards?qr_id=eq.A18`, { method: 'DELETE', headers: H0 });
await fetch(`${URL_}/rest/v1/qr_rewards`, { method: 'POST', headers: H0, body: JSON.stringify([{ qr_id: 'A18', line_id: 7, weight: 1 }]) });
const tBefore = st.profile.evo_tickets;
await patchSetting('wild_chance', 0);   // 0032: QR 에서 가끔 야생 포켓몬이 나오므로, 이 시험에서는 정해 둔 포켓몬만
await S[2].rpc('sync', { p_scans: [{ n: nonce(), q: 'A18', t: T.A18.token }] });
r = await booth.rpc('booth_redeem', { p_payload: '022903' });
await patchSetting('wild_chance', 0);
await fetch(`${URL_}/rest/v1/qr_rewards?qr_id=eq.A18`, { method: 'DELETE', headers: H0 });
await fetch(`${URL_}/rest/v1/qr_rewards`, { method: 'POST', headers: H0, body: JSON.stringify(pool18.map(p => ({ qr_id: 'A18', ...p }))) });
const dup = r.data?.results?.find(x => x.line_id === 7);
st = (await S[2].rpc('sync')).data.state;
ok(dup?.bonus_ticket === true && st.profile.evo_tickets === tBefore + 1, 'every 3rd duplicate gives +1 evolution ticket', dup);
// relink onto a fresh login that has no game data yet (an id account without a profile)
const RL = 'rl' + Math.random().toString(36).slice(2, 9);
await anon.rpc('create_id_account', { p_id: RL, p_password: 'relink1' });
const rl = await tokenReq(`${RL}@id.local`, 'relink1');
r = await admin.rpc('admin_relink', { p_student_id: '022903', p_email: `${RL}@id.local` });
ok(r.data?.ok === true, 'relink moved 022903 to another login', r);
const moved = (await client(rl.access_token).rpc('sync')).data?.state;
ok(moved?.profile?.student_id === '022903' && moved.collection.length > 0, 'new login sees the same game data', moved?.profile?.student_id);
r = await admin.rpc('admin_relink', { p_student_id: '022903', p_email: '022903@test.local' });
ok(r.data?.ok === true, 'relink back to the original login');
S[2] = client(await login('022903@test.local'));
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
  await setS('roulette_every_min', 5); await setS('roulette_daily_max', 12); await setS('roulette_odds', [[0, 72], [1, 24], [3, 4]]);   // 0034 기본값으로 되돌림
}
// auto-close via festival_close_at
await setS('festival_close_at', new Date(Date.now() - 60000).toISOString());
r = await S[3].rpc('sync', { p_scans: [{ n: nonce(), q: 'A13', t: T.A13.token }] });
ok(r.data?.acks?.[0]?.status === 'closed' && r.data.state.rules.festival_ended === true, 'past festival_close_at → closed + ended flag', r.data?.acks);
ok((await booth.rpc('booth_redeem', { p_payload: '021904' })).error === 'FESTIVAL_CLOSED', 'booth stops after close time');
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
  ok((await t.rpc('register_profile', { p_kind: 'student', p_student_id: '022901', p_name: '가짜' })).error === 'STUDENT_ID_TAKEN', 'a taken student number is refused');
  ok((await t.rpc('register_profile', { p_kind: 'student', p_student_id: '12', p_name: '가짜' })).error === 'BAD_STUDENT_ID', 'bad student number refused');
  ok((await t.rpc('register_profile', { p_kind: 'student', p_student_id: '023777', p_name: '미래' })).error === 'BAD_GEN', 'future 기수 (23기) refused');
  ok((await t.rpc('register_profile', { p_kind: 'student', p_student_id: '019777', p_name: '졸업' })).error === 'BAD_GEN', 'past 기수 (19기) refused');
  ok((await anon.rpc('create_code_account', { p_student_id: '024777' })).error === 'BAD_GEN', 'no code account for a future 기수');
  ok((await admin.rpc('admin_make_login_codes', { p_ids: ['025001'] })).error === 'BAD_GEN', 'admin codes refuse a future 기수');
  ok((await booth.rpc('screen_feed')).data?.gens?.every(x => [20, 21, 22].includes(x.gen)), 'TV 기수 대항전 shows only 20~22기');
  ok((await t.rpc('register_profile', { p_kind: 'student', p_student_id: '022777', p_name: '<b>' })).error === 'BAD_NAME', 'bad name refused');
  ok((await t.rpc('register_profile', { p_kind: 'teacher', p_student_id: '', p_name: '가짜' })).error === 'BAD_KIND', 'unknown kind refused');

  // pick a number no earlier run left behind
  let sid, cc;
  for (let i = 0; i < 20 && !cc; i++) {
    sid = '020' + String(500 + Math.floor(Math.random() * 500));
    cc = (await anon.rpc('create_code_account', { p_student_id: sid })).data;
  }
  ok(cc?.id === sid && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(cc.code), 'student number alone creates a code account (code shown once)', cc);
  ok((await anon.rpc('create_code_account', { p_student_id: sid })).error === 'CODE_ACCOUNT_EXISTS', 'second request for the same number is refused');
  ok(['STUDENT_ID_TAKEN', 'CODE_ACCOUNT_EXISTS'].includes((await anon.rpc('create_code_account', { p_student_id: '022901' })).error), 'code account for a registered number is refused');
  const ct = await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${sid}@code.local`, password: cc.code.replace('-', '') }) })).json();
  const cl = client(ct.access_token);
  const need = (await cl.rpc('ensure_profile')).data;
  ok(need?.needs_register === true && need.code_id === sid, 'code account asks for a name, knows its number', need);
  r = await cl.rpc('register_profile', { p_kind: 'guest', p_student_id: '022902', p_name: '코드생' });
  ok(r.data?.student_id === sid && r.data.in_ranking === true, 'code account is always its own student number', r.data);
  // 지움 (계정까지): 남겨 두면 020500~020999 임시 번호가 바닥나서 다음 실행이 실패함
  const del = await admin.rpc('admin_delete_students', { p_student_ids: [sid], p_confirm: '삭제' });
  if (!del.data?.deleted) await admin.rpc('admin_unlink', { p_student_id: sid });

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
const pwLogin = async (email, password) => (await tokenReq(email, password)).access_token;
const fakeGoogle = async (gmail) => { const nm = 'g' + nonce(); const d = (await anon.rpc('dev_fake_google', { p_name: nm, p_google_email: gmail })).data; return client(await login(d.email)); };
const rnd3 = () => String(500 + Math.floor(Math.random() * 500));
// staging keeps old test accounts, so a random number can already be taken → retry on CODE_ACCOUNT_EXISTS / an existing account
let sidA = '020' + rnd3(), sidB;
let NA, NB;
{
  ok((await anon.rpc('create_number_account', { p_student_id: '023111', p_password: 'abcdef' })).error === 'BAD_GEN', 'number account: future 기수 refused');
  ok((await anon.rpc('create_number_account', { p_student_id: sidA, p_password: '123' })).error === 'BAD_PASSWORD', 'password needs 6+ characters');
  let c; for (;;) { const r0 = await anon.rpc('create_number_account', { p_student_id: sidA, p_password: 'pw1234' }); c = r0.data; if (r0.error !== 'CODE_ACCOUNT_EXISTS') break; sidA = '020' + rnd3(); }
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
  do { sidB = '021' + rnd3(); r = await G2.rpc('link_number', { p_student_id: sidB, p_password: 'pwpwpw', p_name: '새학생' }); } while (r.data?.error === 'WRONG_PASSWORD');
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
  // 학생마다 1시간에 5개까지 → 같은 시험 학생으로 여러 번 돌리면 TRY_LATER. 그래서 이번에만 쓰는 새 번호 학생 (끝에서 지움)
  let qsid; do { qsid = '020' + rnd3(); } while ((await anon.rpc('create_number_account', { p_student_id: qsid, p_password: 'iq1234' })).error);
  const Q = client(await pwLogin(`${qsid}@code.local`, 'iq1234'));
  await Q.rpc('register_profile', { p_kind: 'student', p_student_id: qsid, p_name: '문의테스트' });
  ok((await Q.rpc('send_inquiry', { p_body: ' ' })).error === 'BAD_INQUIRY', 'empty inquiry refused');
  const body = '부스 줄이 너무 길어요 ' + nonce();
  ok((await Q.rpc('send_inquiry', { p_body: body })).data?.ok, 'student sends an inquiry');
  const iq = (await admin.rpc('admin_list_requests')).data?.inquiries?.find(x => x.body === body);
  ok(iq?.student_id === qsid && iq.status === 'open', 'admin sees it with the student number', iq);
  ok(iq && (await admin.rpc('admin_set_inquiry', { p_id: iq.id, p_done: true })).data?.inquiries?.find(x => x.id === iq.id)?.status === 'done', 'admin marks it done');
  await admin.rpc('admin_delete_students', { p_student_ids: [qsid], p_confirm: '삭제' });

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
  await setS('roulette_777_per_mille', 10); await setS('roulette_every_min', 5); await setS('roulette_odds', [[0, 72], [1, 24], [3, 4]]);   // 0034 기본값으로 되돌림
  await admin.rpc('admin_unlink', { p_student_id: sidA }); await admin.rpc('admin_unlink', { p_student_id: sidB });
}

console.log('\n[23] battle data: real Pokémon (0032) — types, moves, stats');
{
  // PostgREST 는 한 번에 1000줄까지 → 나눠 받기
  const all = async (c, path) => { const out = []; for (let o = 0; ; o += 1000) { const d = (await c.select(`${path}&limit=1000&offset=${o}`)).data || []; out.push(...d); if (d.length < 1000) return out; } };
  const sp = await all(S[0], 'species?select=id,line_id,stage,dex,btype,name,hp,atk,def,spa,spd,spe&order=id');
  // 0037: + 갈래 종 20 (id 10000 + 도감 번호, 같은 번호가 따로 있는 계열에도 있음)
  const main = sp.filter(x => x.id < 10000);
  ok(main.length === 809 && sp.length === 829 && sp.every(x => [x.hp, x.atk, x.def, x.spa, x.spd, x.spe].every(v => v > 0)), 'all 809 Pokémon (#1–809) + 20 branch rows have 6 base stats', sp.length);
  ok(new Set(main.map(x => x.dex)).size === 809 && Math.min(...main.map(x => x.dex)) === 1 && Math.max(...main.map(x => x.dex)) === 809
     && sp.filter(x => x.id >= 10000).every(x => x.id === 10000 + x.dex), 'national dex numbers 1–809, each once (branch rows reuse their number)');
  const byDex = Object.fromEntries(sp.map(x => [x.dex, x]));
  const st = (x) => [x.hp, x.atk, x.def, x.spa, x.spd, x.spe].join('/');
  ok(st(byDex[1]) === '45/49/49/65/65/45' && byDex[1].name === '이상해씨' && byDex[1].btype === '풀/독', '이상해씨 = real stats and types', [byDex[1].name, st(byDex[1]), byDex[1].btype]);
  ok(byDex[6].btype === '불꽃/비행' && byDex[25].name === '피카츄' && byDex[143].hp === 160, '리자몽 불꽃/비행 · 피카츄 · 잠만보 HP 160');
  const total = (x) => x.hp + x.atk + x.def + x.spa + x.spd + x.spe;
  ok(total(byDex[1]) < total(byDex[2]) && total(byDex[2]) < total(byDex[3]), 'evolved forms are stronger (이상해씨 < 이상해풀 < 이상해꽃)');
  const mv = (await S[0].select('moves?select=id,kind,type,name')).data || [];
  const kind = Object.fromEntries(mv.map(m => [m.id, m.kind]));
  const sm = await all(S[0], 'species_moves?select=species_id,slot,move_id&order=species_id,slot');
  const per = {};
  for (const x of sm) (per[x.species_id] ||= []).push(kind[x.move_id]);
  // 0039: 메타몽 (전국도감 132) 은 실제처럼 변신 하나뿐
  const bad = sp.filter(x => x.dex !== 132 && (per[x.id] || []).sort().join() !== 'attack,attack,defense,status').map(x => x.id);
  const ditto = sp.filter(x => x.dex === 132).map(x => (per[x.id] || []).join());
  ok(bad.length === 0 && ditto.every((k) => k === 'status'), 'every species: 2 attack + 1 status + 1 defense move (메타몽: 변신 only)', [bad.slice(0, 20), ditto]);
  ok(mv.find(m => m.name === '화염방사')?.type === '불꽃' && mv.find(m => m.name === '10만볼트')?.type === '전기' && mv.find(m => m.name === '깨뜨리다')?.type === '격투',
     'moves have their real types (and official Korean names)');
  const tc = (await S[0].select('type_chart?select=atk,def,mult')).data || [];
  const m = (a, d) => Number(tc.find(c => c.atk === a && c.def === d)?.mult ?? 1);
  ok(tc.length === 120 && m('불꽃', '풀') === 2 && m('물', '불꽃') === 2 && m('풀', '불꽃') === 0.5 && m('드래곤', '드래곤') === 2, 'real 18-type chart', tc.length);
  ok(['노말:고스트', '격투:고스트', '고스트:노말', '전기:땅', '땅:비행', '독:강철', '에스퍼:악', '드래곤:페어리'].every(k => m(...k.split(':')) === 0)
     && tc.filter(c => Number(c.mult) === 0).length === 8, 'x0 cells (효과가 없다) = the 8 real ones');
  const ln = (await S[0].select('lines?select=id,btype,subject,max_stage&order=id')).data || [];
  ok(ln.length === 440 && ln.every(l => l.btype) && ln.filter(l => l.subject === '야생').length === 358 && ln.every(l => l.max_stage >= 1 && l.max_stage <= 3),
     '440 lines: 68 teacher + 14 special + 358 wild, every line has a type', [ln.length, ln.filter(l => l.subject === '야생').length]);
  const lg = (await S[0].select('lines?id=gte.37&id=lte.42&select=id,bonus,max_stage&order=id')).data || [];
  ok(lg.length === 6 && lg.every(l => l.bonus && l.max_stage === 1), 'secret + 5 탐구 legends are bonus 1-stage lines', lg);
  const w = await fetch(`${URL_}/rest/v1/moves?id=eq.${mv[0].id}`, { method: 'PATCH', headers: { apikey: KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${STOK}`, Prefer: 'return=representation' }, body: JSON.stringify({ power: 999 }) });
  ok(w.status >= 400 || (await w.json()).length === 0, 'students cannot change moves');
}

console.log('\n[24] raids + special tickets');
{
  const mk = async (name) => {
    let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'raid12' })).error);
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
  let r = await A.c.rpc('raid_join', { p_q: rd.q, p_t: rd.t, p_mon: await monId(A.c, 32) });
  ok(r.data?.players === 1 && r.data.me?.line_id === 32 && r.data.me.per_tap > 3, 'join with my 체육 monster (better per-tap damage)', r.data?.me);
  r = await A.c.rpc('raid_attack', { p_raid: rd.id, p_taps: 1000, p_mon: await monId(A.c, 32) });
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
  const slotsBefore = (await admin.select('settings?key=eq.raid_slots&select=value')).data[0].value;   // 운영자가 고친 시간 그대로 되돌림
  await setS('raid_slots', [{ line: 38, from: '00:00', until: '23:59' }]);
  await booth.rpc('screen_raids');
  let slots = (await booth.rpc('screen_raids')).data?.raids?.filter(x => x.kind === 'slot' && x.species_id === 112 && x.status === 'active');
  ok(slots?.length === 1, 'time-slot legend raid appears on the TV (once)', slots?.length);
  await admin.rpc('admin_end_raid', { p_id: slots?.[0]?.id });
  await setS('raid_cooldown_min', 5);
  slots = (await booth.rpc('screen_raids')).data?.raids?.filter(x => x.kind === 'slot' && x.species_id === 112 && x.status === 'active');
  ok(slots?.length === 0, 'cooldown before the next time-slot raid');
  await setS('raid_slots', slotsBefore);

  // dex rewards: 50 % → 과연기, 100 % → 창문기 (special tickets, no raid)
  // 0037: 학교 도감 = 전국도감 번호 213칸 (206 + 선생님 계열의 갈래 종 7: 엘레이드 · 왕구리 · 홍수몬 · 카포에라 · 야도킹 · 눈여아 · 아르코)
  //       → 갈래 종은 진화로 (그 앞 단계를 받아서 Lv.100 + 진화의 돌 1개, p_to)
  const branchEvolve = async (lo, hi) => {
    const brs = ((await admin.select('species?id=gte.10000&select=id,line_id,stage')).data || []).filter((x) => x.line_id >= lo && x.line_id <= hi);
    const evs = (await admin.select('evolutions?to_species=gte.10000&select=from_species,to_species')).data || [];
    for (const b of brs) {
      const e = evs.find((x) => x.to_species === b.id);
      const from = e && (await admin.select(`species?id=eq.${e.from_species}&select=id,stage`)).data?.[0];
      if (!from || from.id >= 10000) continue;
      await admin.rpc('admin_grant_monster', { p_student_id: B.sid, p_line: b.line_id, p_stage: from.stage });
      await admin.rpc('admin_set_level', { p_student_id: B.sid, p_line: b.line_id, p_level: 100 });
      await admin.rpc('admin_adjust_tickets', { p_student_id: B.sid, p_delta: 1 });
      const m = (await myMons(B.c)).filter((x) => x.line_id === b.line_id && x.stage === from.stage).pop();
      await B.c.rpc('evolve', { p_mon: m?.id, p_to: b.id });
    }
  };
  for (let l = 1; l <= 36; l++) await admin.rpc('admin_grant_monster', { p_student_id: B.sid, p_line: l, p_stage: l >= 35 ? 1 : 3 });   // 104 + 4 갈래 = 108 of 213 ≥ 50 %
  await branchEvolve(1, 36);
  st = (await B.c.rpc('sync')).data.state;
  ok(st.special?.some(x => x.special === 'dex50' && x.species_id === 121) && !st.special.some(x => x.special === 'dex100'), '도감 50% → 과연기 ticket', st.special);
  for (let l = 43; l <= 76; l++) await admin.rpc('admin_grant_monster', { p_student_id: B.sid, p_line: l, p_stage: 3 });
  st = (await B.c.rpc('sync')).data.state;
  ok(!st.special?.some(x => x.special === 'dex100'), '0037: every teacher line at its last stage is not 100% yet (branch species still missing)', st.special);
  await branchEvolve(43, 76);
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
  ok((await anon.rpc('send_inquiry_public', { p_body: body, p_name: '손님', p_student_id: '22901' })).data?.ok, 'inquiry from the login screen (no login)');
  ok((await anon.rpc('send_inquiry_public', { p_body: 'x', p_name: '손님' })).error === 'BAD_INQUIRY', 'too short refused');
  const iq = (await admin.rpc('admin_list_requests')).data?.inquiries?.find(x => x.body === body);
  ok(iq?.student_id === '022901' && iq.name === '손님 (로그인 전)', 'admin sees it (marked 로그인 전)', iq);
  await admin.rpc('admin_set_inquiry', { p_id: iq.id, p_done: true });
}

console.log('\n[26] battles (engine on the server, CPU practice, friend team vs AI, live PvP)');
{
  const mk = async (name) => {
    let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'batl12' })).error);
    const c = client(await pwLogin(`${sid}@code.local`, 'batl12'));
    await c.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: name });
    return { c, sid };
  };
  const A = await mk('배틀에이'), B = await mk('배틀비');
  for (const l of [32, 17, 61]) await admin.rpc('admin_grant_monster', { p_student_id: A.sid, p_line: l, p_stage: 3 });
  await admin.rpc('admin_grant_monster', { p_student_id: B.sid, p_line: 4, p_stage: 1 });
  for (const fn of ['_bt_move', '_bt_turn', '_bt_finish', '_bt_resolve', '_bt_ai', '_bt_new'])
    ok((await A.c.rpc(fn, {})).error, `student cannot call internal ${fn}`);
  ok((await anon.rpc('battle_start_cpu', { p_mons: await monIds(anon, [32]) })).error, 'anon cannot battle');
  ok((await A.c.rpc('battle_start_cpu', { p_mons: await monIds(A.c, [4]) })).error === 'BAD_TEAM', 'team must be my own monsters');
  ok((await A.c.rpc('battle_start_cpu', { p_mons: await monIds(A.c, [32, 32]) })).error === 'BAD_TEAM', 'no duplicates in a team');
  ok((await A.c.rpc('battle_start_cpu', { p_mons: await monIds(A.c, [32, 17, 61, 1]) })).error === 'BAD_TEAM', 'at most 3');

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
  let b = (await A.c.rpc('battle_start_cpu', { p_mons: await monIds(A.c, [32, 17, 61]) })).data;
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
  ok((await B.c.rpc('battle_start_team', { p_code: codeB, p_mons: await monIds(B.c, [4]) })).error === 'BATTLE_SELF', 'cannot battle myself');
  ok((await A.c.rpc('battle_start_team', { p_code: 'zzzzzzzz', p_mons: await monIds(A.c, [32]) })).error === 'BATTLE_CODE_NOT_FOUND', 'unknown code');
  const t0 = (await A.c.rpc('sync')).data.state.profile.evo_tickets;
  let won = null;
  for (let tries = 0; tries < 4 && !won; tries++) {
    b = (await A.c.rpc('battle_start_team', { p_code: codeB, p_mons: await monIds(A.c, [32, 17, 61]) })).data;
    if (tries === 0) ok(b?.mode === 'team' && b.sides[1].mons.length === 1 && b.names[1], 'friend team vs AI starts (friend has 1 monster)', b?.sides?.[1]);
    b = await play(A.c, b);
    if (b?.winner === 0) won = b;
  }
  ok(won?.reward?.ticket === true, 'beating a friend team → 1 진화권', won?.reward);
  const st1 = (await A.c.rpc('sync')).data.state.profile;
  ok(st1.evo_tickets === t0 + 1, 'evo ticket +1', [t0, st1.evo_tickets]);
  const rkA = (await A.c.rpc('get_ranking_by', { p_kind: 'battle' })).data;
  ok(rkA?.me?.value === 1, 'battle win counts in the ranking', rkA?.me);
  b = (await A.c.rpc('battle_start_team', { p_code: codeB, p_mons: await monIds(A.c, [32, 17, 61]) })).data;
  b = await play(A.c, b);
  ok(b?.winner !== 0 || b.reward?.why === 'same_opp', 'same friend again today → no 2nd ticket', b?.reward);

  // live PvP: invite → home inbox → accept → both choose (hidden from each other)
  await setS('battle_turn_sec', 3);
  const codeA = (await A.c.rpc('battle_code')).data;
  let inv = (await B.c.rpc('battle_challenge', { p_code: codeA, p_mons: await monIds(B.c, [4]) })).data;
  ok(inv?.status === 'invite' && inv.mode === 'pvp', 'B sends a live battle request', inv);
  let box = (await A.c.rpc('battle_inbox')).data;
  ok(box?.invites?.some(x => x.id === inv.id && x.from), 'A sees "배틀 신청!" in the inbox', box);
  ok((await S[0].rpc('battle_accept', { p_id: inv.id, p_mons: await monIds(S[0], [1]) })).error, 'only the invited friend can accept');
  let pa = (await A.c.rpc('battle_accept', { p_id: inv.id, p_mons: await monIds(A.c, [32, 17]) })).data;
  ok(pa?.status === 'active' && pa.me === 1 && pa.sides[1].mons.length === 2 && pa.sides[0].mons.length === 1, 'A accepts → battle starts (A is side 1)', pa);
  ok((await A.c.rpc('battle_start_cpu', { p_mons: await monIds(A.c, [32]) })).error === 'IN_PVP_BATTLE' && (await B.c.rpc('battle_start_cpu', { p_mons: await monIds(B.c, [4]) })).error === 'IN_PVP_BATTLE', 'cannot start another battle during a live one (no silent forfeit)');
  r = await B.c.rpc('battle_act', { p_id: inv.id, p_action: { move: 1 } });
  ok(r.data?.chosen === true && r.data.turn === 0, 'B chose; waits for A');
  const pa2 = (await A.c.rpc('battle_state', { p_id: inv.id })).data;
  ok(pa2?.chosen === false && !JSON.stringify(pa2).includes('"acts"'), "A cannot see B's choice");
  ok((await B.c.rpc('battle_act', { p_id: inv.id, p_action: { move: 2 } })).error === 'BATTLE_WAIT', 'cannot choose twice');
  let pa3;
  for (const t0 = Date.now(); Date.now() - t0 < 15000;) {      // 턴 시간이 지나면 AI 가 고름 — 될 때까지 0.5초마다 (최대 15초)
    pa3 = (await A.c.rpc('battle_state', { p_id: inv.id })).data;
    if (pa3?.turn === 1 || pa3?.status === 'over') break;
    await new Promise(res => setTimeout(res, 500));
  }
  ok(pa3?.turn === 1 || pa3?.status === 'over', 'time up → AI chooses for A, the turn is played', pa3?.turn);
  await setS('battle_turn_sec', 45);
  await A.c.rpc('battle_forfeit', { p_id: inv.id });
  inv = (await B.c.rpc('battle_challenge', { p_code: codeA, p_mons: await monIds(B.c, [4]) })).data;
  await A.c.rpc('battle_accept', { p_id: inv.id, p_mons: await monIds(A.c, [32]) });
  const tB = (await B.c.rpc('sync')).data.state.profile.evo_tickets;
  r = await A.c.rpc('battle_forfeit', { p_id: inv.id });
  ok(r.data?.status === 'over' && r.data.winner === 0, 'A gives up → B wins', r.data?.winner);
  const rb = (await B.c.rpc('battle_state', { p_id: inv.id })).data;
  const tB2 = (await B.c.rpc('sync')).data.state.profile.evo_tickets;
  // 이 친구한테서 오늘 이미 받았으면 (앞의 배틀 결과는 능력치·주사위에 따라 다름) same_opp 가 맞는 결과
  ok((rb?.reward?.ticket === true && tB2 === tB + 1) || (rb?.reward?.why === 'same_opp' && tB2 === tB), 'B gets the 진화권 (once per friend per day)', rb?.reward);

  inv = (await B.c.rpc('battle_challenge', { p_code: codeA, p_mons: await monIds(B.c, [4]) })).data;
  await A.c.rpc('battle_decline', { p_id: inv.id });
  ok((await B.c.rpc('battle_state', { p_id: inv.id })).data?.status === 'declined', 'declined request shows as declined');
  const t6117 = await monIds(A.c, [61, 17]);
  ok((await A.c.rpc('battle_set_team', { p_mons: t6117 })).data?.ok && (await A.c.rpc('battle_today')).data?.team?.join() === t6117.join(), 'save my battle team (Pokémon numbers)');
  ok((await A.c.rpc('battle_set_team', { p_mons: await monIds(A.c, [99]) })).error === 'BAD_TEAM', 'cannot save monsters I do not have');
  ok((await A.c.rpc('battle_today')).data?.wins === 1, 'today: 1 rewarded win of 3');
  await admin.rpc('admin_unlink', { p_student_id: A.sid }); await admin.rpc('admin_unlink', { p_student_id: B.sid });
}

console.log('\n[27] 2 vs 2 double battles (4 monsters, chosen by the QR owner)');
{
  const mk = async (name) => {
    let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'dbl123' })).error);
    const c = client(await pwLogin(`${sid}@code.local`, 'dbl123'));
    await c.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: name });
    return { c, sid };
  };
  const A = await mk('더블에이'), B = await mk('더블비');
  for (const l of [32, 17, 61, 44]) await admin.rpc('admin_grant_monster', { p_student_id: A.sid, p_line: l, p_stage: 3 });
  for (const l of [4, 5]) await admin.rpc('admin_grant_monster', { p_student_id: B.sid, p_line: l, p_stage: 1 });
  ok((await A.c.rpc('battle_start_cpu', { p_mons: await monIds(A.c, [32, 17, 61, 44]) })).error === 'BAD_TEAM', '1 vs 1 takes at most 3');
  ok((await A.c.rpc('battle_start_cpu', { p_mons: await monIds(A.c, [32, 17, 61, 44]), p_format: 'triple' })).error === 'BAD_FORMAT', 'unknown format refused');
  let b = (await A.c.rpc('battle_start_cpu', { p_mons: await monIds(A.c, [32, 17, 61, 44]), p_format: 'double' })).data;
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
  b = (await A.c.rpc('battle_start_team', { p_code: codeB, p_mons: await monIds(A.c, [32, 17, 61, 44]) })).data;
  ok(b?.format === 'double' && b.sides[1].mons.length === 2 && b.sides[1].act.length === 2, 'friend team vs AI uses the friend\'s 2 vs 2 (friend has 2 monsters)', b?.sides?.[1]);
  await A.c.rpc('battle_forfeit', { p_id: b.id });
  await B.c.rpc('battle_code', { p_format: 'single' });
  ok((await B.c.rpc('battle_code', { p_format: 'x' })).error === 'BAD_FORMAT', 'bad format refused');
  ok((await A.c.rpc('battle_set_team', { p_mons: await monIds(A.c, [44, 61, 17, 32]) })).data?.ok, 'a battle team can hold 4 (first 3 used for 1 vs 1)');
  await admin.rpc('admin_unlink', { p_student_id: A.sid }); await admin.rpc('admin_unlink', { p_student_id: B.sid });
}

console.log('\n[28] admin: delete student records (dummy data clean-up)');
{
  const sids = [];
  for (let i = 0; i < 2; i++) {
    let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'del123' })).error);
    const c = client(await pwLogin(`${sid}@code.local`, 'del123'));
    await c.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: '더미' + i });
    await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: 3, p_stage: 1 });
    sids.push(sid);
  }
  ok((await S[0].rpc('admin_delete_students', { p_student_ids: sids, p_confirm: '삭제' })).error === 'NOT_ADMIN', 'students cannot delete records');
  ok((await admin.rpc('admin_delete_students', { p_student_ids: sids, p_confirm: '네' })).error === 'CONFIRM_MISMATCH', 'partial delete needs the confirm word');
  ok((await admin.rpc('admin_delete_students', { p_student_ids: null, p_confirm: '삭제' })).error === 'CONFIRM_MISMATCH', 'delete-all needs its own confirm word (nothing deleted)');
  ok((await admin.rpc('admin_count_students')).data?.students > 0, 'student count for the delete-all warning');
  const staffBefore = (await admin.select('profiles?select=student_id&role=neq.student')).data?.length;
  const r = await admin.rpc('admin_delete_students', { p_student_ids: [...sids, 'staff-does-not-exist'], p_confirm: '삭제' });
  ok(r.data?.deleted === 2 && r.data.logins === 2, 'checked students deleted, with their number logins', r);
  ok(((await admin.select(`profiles?select=student_id&student_id=in.(${sids.join(',')})`)).data || []).length === 0, 'their profiles are gone');
  ok((await admin.select('profiles?select=student_id&role=neq.student')).data?.length === staffBefore, 'staff accounts untouched');
  ok(!(await anon.rpc('create_number_account', { p_student_id: sids[0], p_password: 'new123' })).error, 'the number can be signed up again from scratch');
  const c2 = client(await pwLogin(`${sids[0]}@code.local`, 'new123'));
  await c2.rpc('register_profile', { p_kind: 'student', p_student_id: sids[0], p_name: '더미다시' });
  await admin.rpc('admin_delete_students', { p_student_ids: [sids[0]], p_confirm: '삭제' });   // clean up
}

console.log('\n[29] 비학생 아이디 계정 · 운영진 아이디 · 복구용 구글 연결 (0018)');
{
  const rid = () => 'tid' + Math.random().toString(36).slice(2, 9);
  const idLogin = async (id, pw) => pwLogin(`${id}@id.local`, pw);
  ok((await anon.rpc('create_id_account', { p_id: 'ab', p_password: 'idpass1' })).error === 'BAD_ID', 'too-short id refused');
  ok((await anon.rpc('create_id_account', { p_id: '1abc', p_password: 'idpass1' })).error === 'BAD_ID', 'id must start with a letter');
  const id = rid();
  ok((await anon.rpc('create_id_account', { p_id: id, p_password: 'idp' })).error === 'BAD_PASSWORD', 'short password refused');
  ok((await anon.rpc('create_id_account', { p_id: id.toUpperCase(), p_password: 'idpass1' })).data?.email === `${id}@id.local`, 'id account created (lower-cased)');
  ok((await anon.rpc('create_id_account', { p_id: id, p_password: 'other12' })).error === 'ID_TAKEN', 'same id again → taken');
  ok(!(await idLogin(id, 'wrong-pw')), 'wrong password cannot log in');
  const c = client(await idLogin(id, 'idpass1'));
  const e0 = (await c.rpc('ensure_profile')).data;
  ok(e0?.needs_register && e0.login_id === id, 'first login: asks for a name, knows the id', e0);
  const reg = (await c.rpc('register_profile', { p_kind: 'student', p_student_id: '022901', p_name: '아이디손님' })).data;
  ok(reg?.student_id === `g:${id}` && reg.in_ranking === false && reg.login === 'id' && reg.login_key === id && reg.google_linked === false,
    'id account = non-student g:<id> (cannot claim a number), not ranked', reg);

  // staff ids: only an admin can make them; self-made ids never become staff
  ok((await c.rpc('admin_create_staff_login', { p_id: rid(), p_role: 'admin' })).error === 'NOT_ADMIN', 'non-admin cannot create staff logins');
  ok((await c.rpc('booth_lookup', { p_payload: '022901' })).error === 'NOT_STAFF', 'self-made id is not staff');
  ok((await anon.rpc('bootstrap_staff', { p_id: rid() })).error && (await c.rpc('bootstrap_staff', { p_id: rid() })).error, 'bootstrap_staff cannot be called from the app');
  const sid = rid();
  const st = (await admin.rpc('admin_create_staff_login', { p_id: sid, p_role: 'booth', p_name: '부스 도우미' })).data;
  ok(st?.id === sid && /^[A-Za-z2-9]{12}$/.test(st.password || ''), 'admin creates a booth id with a 12-char random password', st?.id);
  ok((await admin.rpc('admin_create_staff_login', { p_id: id, p_role: 'admin' })).error === 'ID_TAKEN', 'cannot turn an existing id into staff');
  const sc = client(await idLogin(sid, st.password));
  ok((await sc.rpc('ensure_profile')).data?.role === 'booth' && !(await sc.rpc('booth_lookup', { p_payload: '022901' })).error?.includes('NOT_STAFF'), 'staff id logs in as booth');
  ok((await admin.rpc('admin_list_staff_logins')).data?.some((x) => x.id === sid && x.role === 'booth'), 'staff id listed for the admin');
  const rs = (await admin.rpc('admin_reset_staff_password', { p_id: sid })).data;
  ok(rs?.password && rs.password !== st.password && !(await idLogin(sid, st.password)) && !!(await idLogin(sid, rs.password)), 'admin resets a staff password (old one stops working)');
  ok((await admin.rpc('admin_reset_staff_password', { p_id: id })).error === 'NOT_FOUND', 'password reset is only for staff ids');

  // recovery Google: a Google login linked to the id lands in the same account
  const g1 = await fakeGoogle(`${rid()}@gmail.com`);
  ok((await g1.rpc('link_id', { p_id: id, p_password: 'nope123' })).data?.error === 'WRONG_PASSWORD', 'linking needs the id password');
  const lk = (await g1.rpc('link_id', { p_id: id, p_password: 'idpass1' })).data;
  ok(lk?.mode === 'linked' && lk.email === `${id}@id.local`, 'Google linked to the id account', lk);
  ok((await client(await idLogin(id, 'idpass1')).rpc('ensure_profile')).data?.google_linked === true, 'settings show the recovery Google as linked');
  const g2 = await fakeGoogle(`${rid()}@gmail.com`);
  ok((await g2.rpc('link_id', { p_id: sid, p_password: rs.password })).error === 'STAFF_NO_LINK', 'staff ids cannot get a Google link');
  const g3 = await fakeGoogle(`${rid()}@gmail.com`);
  const nid = rid();
  ok((await g3.rpc('link_id', { p_id: nid, p_password: 'newid12', p_name: '구글손님' })).data?.mode === 'new'
     && !!(await idLogin(nid, 'newid12')), 'Google → new non-student id with its own password');

  ok((await admin.rpc('admin_remove_staff_login', { p_id: sid })).data?.ok && !(await idLogin(sid, rs.password)), 'admin removes the staff id');
  const del = (await admin.rpc('admin_delete_students', { p_student_ids: [`g:${id}`, `g:${nid}`], p_confirm: '삭제' })).data;
  ok(del?.deleted === 2, 'test id accounts cleaned up', del);
}

console.log('\n[30] 운영 다듬기 (0019): 가입 제한 · 최근 배틀 상대 · 운영자 오늘 숫자');
{
  const cap = (await admin.select('settings?key=eq.code_signup_per_10min&select=value')).data?.[0]?.value;
  ok(Number(cap) >= 1000, 'sign-up cap is high enough for the morning rush (600 students)', cap);
  const mk = async (name) => {
    let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'ops123' })).error);
    const c = client(await pwLogin(`${sid}@code.local`, 'ops123'));
    await c.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: name });
    return { c, sid };
  };
  const A = await mk('다시에이'), B = await mk('다시비');
  for (const l of [32, 17, 61]) await admin.rpc('admin_grant_monster', { p_student_id: A.sid, p_line: l, p_stage: 3 });
  await admin.rpc('admin_grant_monster', { p_student_id: B.sid, p_line: 4, p_stage: 1 });
  ok(Array.isArray((await A.c.rpc('battle_recent')).data) && (await A.c.rpc('battle_recent')).data.length === 0, 'no recent opponents yet');
  const codeB = (await B.c.rpc('battle_code')).data;
  const b = (await A.c.rpc('battle_start_team', { p_code: codeB, p_mons: await monIds(A.c, [32, 17, 61]) })).data;
  await A.c.rpc('battle_forfeit', { p_id: b.id });
  const rec = (await A.c.rpc('battle_recent')).data;
  ok(rec?.length === 1 && rec[0].code === codeB && rec[0].mode === 'team' && rec[0].won === false && rec[0].name, 'recent opponent listed with their battle code (rematch without the QR)', rec);
  ok((await A.c.rpc('admin_game_stats')).error === 'NOT_ADMIN', 'students cannot read game stats');
  const g = (await admin.rpc('admin_game_stats')).data;
  ok(g && g.battles?.team >= 1 && 'pvp_live' in g && g.raids && 'active' in g.raids && g.tickets && 'quiz' in g.tickets && g.evolve,
    'admin sees today\'s battles / raids / tickets', g);
  await admin.rpc('admin_delete_students', { p_student_ids: [A.sid, B.sid], p_confirm: '삭제' });
}

console.log('\n[31] 성장 (0020): 레벨 · 가방 · 기술머신 · 지닌 물건 · 배틀 회복약 · 공정 모드 · 시너지 · 경험치');
{
  const mk = async (name) => {
    let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'grow12' })).error);
    const c = client(await pwLogin(`${sid}@code.local`, 'grow12'));
    await c.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: name });
    return { c, sid };
  };
  const A = await mk('성장에이'), B = await mk('성장비');
  for (const l of [12, 13, 5]) await admin.rpc('admin_grant_monster', { p_student_id: A.sid, p_line: l, p_stage: 3 });
  for (const l of [1, 9, 25]) await admin.rpc('admin_grant_monster', { p_student_id: B.sid, p_line: l, p_stage: 3 });
  let bag = (await A.c.rpc('bag_state')).data;
  const m12 = () => bag.box.find((x) => x.line === 12);
  // 0032: 잡은 포켓몬의 시작 레벨 = 그 단계의 진화 레벨 (species.evo_lv), 단계는 그 계열의 마지막 단계까지
  const startLv = async (line) => {
    const top = (await A.c.select(`lines?id=eq.${line}&select=max_stage`)).data[0].max_stage;
    const ev = (await A.c.select(`species?line_id=eq.${line}&stage=eq.${top}&select=evo_lv`)).data[0]?.evo_lv;
    return Math.max(5, ev || (top === 2 ? 20 : top >= 3 ? 35 : 5));   // 돌 진화 (evo_lv 없음) = 단계 기본 레벨 (서버 _collection_growth 와 같게)
  };
  const L12 = await startLv(12), L13 = await startLv(13), L5 = await startLv(5);
  ok(m12()?.level === L12 && m12().need === 8 * L12 && m12().moves.length === 4 && m12().known.length >= 4, `new final-stage catch starts at its evolution level (Lv.${L12}) with 4 moves`, m12());
  await admin.rpc('admin_grant_monster', { p_student_id: A.sid, p_line: 12, p_stage: 3 });
  bag = (await A.c.rpc('bag_state')).data;
  const twelves = bag.box.filter((x) => x.line === 12);
  ok(twelves.length === 2 && twelves[0].id !== twelves[1].id && twelves.every((x) => x.level === L12) && twelves[0].pos !== twelves[1].pos,
     '0036: catching the same Pokémon again = a second one in the box (own level, own slot)', twelves.map((x) => [x.id, x.level, x.pos]));
  // 이상한사탕
  ok((await A.c.rpc('bag_use', { p_item: 'candy', p_mon: await monId(A.c, 12) })).error === 'NO_ITEM', 'cannot use an item you do not have');
  ok((await A.c.rpc('admin_give_item', { p_student_id: A.sid, p_item: 'candy', p_qty: 1 })).error === 'NOT_ADMIN', 'students cannot give items');
  await admin.rpc('admin_give_item', { p_student_id: A.sid, p_item: 'candy', p_qty: 2 });
  ok((await A.c.rpc('bag_use', { p_item: 'candy', p_mon: await monId(A.c, 12) })).data?.level === L12 + 1, 'rare candy: +1 level (only that one)');
  // 기술머신: 맞는 몬스터만, 한 번 배우면 끝
  const tms = (await A.c.select('items?pocket=eq.tm&select=key,move_id')).data;
  const ok12 = new Set((await A.c.select('learnset?line_id=eq.12&how=eq.tm&select=move_id')).data.map((x) => x.move_id));
  const tmOk = tms.find((t) => ok12.has(t.move_id) && !m12().known.includes(t.move_id));
  const tmNo = tms.find((t) => !ok12.has(t.move_id));
  await admin.rpc('admin_give_item', { p_student_id: A.sid, p_item: tmOk.key, p_qty: 2 });
  if (tmNo) {
    await admin.rpc('admin_give_item', { p_student_id: A.sid, p_item: tmNo.key, p_qty: 1 });
    ok((await A.c.rpc('bag_use', { p_item: tmNo.key, p_mon: await monId(A.c, 12) })).error === 'TM_NOT_COMPATIBLE', 'TM the monster cannot learn is refused');
  }
  ok((await A.c.rpc('bag_use', { p_item: tmOk.key, p_mon: await monId(A.c, 12) })).data?.learned === tmOk.move_id, 'TM teaches the move (kept in the monster\'s move list)');
  ok((await A.c.rpc('bag_use', { p_item: tmOk.key, p_mon: await monId(A.c, 12) })).error === 'ALREADY_KNOWN', 'cannot learn the same move twice');
  bag = (await A.c.rpc('bag_state')).data;
  ok(bag.items.find((x) => x.key === tmOk.key)?.qty === 1, 'TM is one-use (second copy still in the bag)');
  // 기술 고르기
  const cur = m12().moves;
  ok((await A.c.rpc('bag_set_moves', { p_mon: await monId(A.c, 12), p_moves: [cur[0], cur[0]] })).error === 'BAD_MOVES', 'duplicate moves refused');
  ok((await A.c.rpc('bag_set_moves', { p_mon: await monId(A.c, 12), p_moves: [999999] })).error === 'MOVE_NOT_KNOWN', 'unknown move refused');
  ok((await A.c.rpc('bag_set_moves', { p_mon: await monId(A.c, 12), p_moves: [tmOk.move_id, cur[0], cur[1], cur[2]] })).data?.moves?.[0] === tmOk.move_id, 'forget a move and use the TM move instead');
  // 지닌 물건
  await admin.rpc('admin_give_item', { p_student_id: A.sid, p_item: 'cushion', p_qty: 1 });
  ok((await A.c.rpc('bag_set_held', { p_mon: await monId(A.c, 13), p_item: 'cushion' })).data?.held === 'cushion', 'give a held item');
  bag = (await A.c.rpc('bag_state')).data;
  ok(!bag.items.find((x) => x.key === 'cushion') && bag.box.find((x) => x.line === 13).held === 'cushion', 'held item leaves the bag');
  ok((await A.c.rpc('bag_set_held', { p_mon: await monId(A.c, 13), p_item: 'bandage' })).error === 'BAD_ITEM', 'medicine cannot be held');
  // 회복약: 배틀 중에만
  await admin.rpc('admin_give_item', { p_student_id: A.sid, p_item: 'bandage', p_qty: 3 });
  ok((await A.c.rpc('bag_use', { p_item: 'bandage', p_mon: await monId(A.c, 12) })).error === 'BATTLE_ONLY', 'medicine only in battle');
  // 연습 배틀: 상대 레벨 = 내 팀 평균, 내 기술·지닌 물건·시너지가 들어감
  let b = (await A.c.rpc('battle_start_cpu', { p_mons: await monIds(A.c, [12, 13, 5]), p_format: 'single' })).data;
  const me = b.sides[0], foe = b.sides[1];
  ok(me.mons[0].lv === L12 + 1 && me.mons[0].moves[0].id === tmOk.move_id && me.mons.every((m) => m.mon > 0), 'battle uses my level and my chosen moves', me.mons[0].lv);
  ok(me.mons[1].held === 'cushion' && foe.mons[0].lv === Math.round((L12 + 1 + L13 + L5) / 3), 'held item in battle; practice foe level = my team average', foe.mons[0].lv);
  // 0032 시너지 = 실제 타입 그룹: 라이츄(전기) · 자포코일(전기/강철) = '질풍' (스피드 +1), 질뻐기(독) 는 혼자
  ok(me.mons[0].syn === 'spe' && me.mons[2].syn === 'spe' && !me.mons[1].syn && me.mons[0].stg?.spe === 1, 'same type-group synergy (2 electric): speed +1 on entry', [me.mons.map((m) => m.syn), me.mons[0].stg]);
  ok(b.items_left === 2 && 'field' in b, 'battle shows items left and the timetable field', b.field);
  const settle = async (x) => {   // 내 몬스터가 쓰러졌으면 다음 몬스터를 내보냄 (상대가 랜덤이라 한 방에 쓰러질 수도 있음)
    while (x.status === 'active' && x.phase === 'replace' && x.need) {
      const i = x.sides[0].mons.findIndex((m, k) => m.hp > 0 && !x.sides[0].act.includes(k));
      x = (await A.c.rpc('battle_act', { p_id: x.id, p_action: { switch: i } })).data;
    }
    return x;
  };
  // 그 턴의 기록은 교체 전에 확인 (상대가 랜덤이라 그 턴에 쓰러지면 교체 화면이 기록을 덮음)
  const used = (await A.c.rpc('battle_act', { p_id: b.id, p_action: { item: 'bandage', target: 0 } })).data;
  ok(used.log.some((e) => /상처약을 사용했다/.test(e.m || '')) && used.items_left === 1, 'use a 상처약 (bandage key) in battle (turn used, 1 left)', used.items_left);
  b = await settle(used);
  bag = (await A.c.rpc('bag_state')).data;
  ok(bag.items.find((x) => x.key === 'bandage')?.qty === 2, 'bandage consumed from the bag');
  ok((await A.c.rpc('battle_act', { p_id: b.id, p_action: { item: 'mint', target: b.sides[0].act[0] } })).error === 'NO_ITEM', 'cannot use medicine you do not have');
  const bid = b.id;
  r = await A.c.rpc('battle_act', { p_id: bid, p_action: { item: 'bandage', target: b.sides[0].act[0] } });
  ok(!r.error, 'second medicine in the same battle', r.error);
  b = await settle(r.data || (await A.c.rpc('battle_state', { p_id: bid })).data);
  ok((await A.c.rpc('battle_act', { p_id: b.id, p_action: { item: 'bandage', target: b.sides[0].act[0] } })).error === 'ITEM_LIMIT', 'at most 2 medicines per battle');
  const lv0 = (await A.c.rpc('bag_state')).data.box.find((x) => x.line === 12);
  await A.c.rpc('battle_forfeit', { p_id: b.id });
  b = (await A.c.rpc('battle_state', { p_id: b.id })).data;
  const ex = b.reward?.exp?.['0'];
  ok(Array.isArray(ex) && ex.length >= 1 && ex[0].exp > 0, 'battle gives EXP to the monsters that came out (even when losing, after 2+ turns)', b.reward);
  const lv1 = (await A.c.rpc('bag_state')).data.box.find((x) => x.line === 12);
  ok(lv1.level > lv0.level || lv1.exp > lv0.exp, 'EXP is saved on the monster', [lv0.level, lv0.exp, lv1.level, lv1.exp]);
  // 공정 모드: QR 보여주는 사람이 정함 → 모두 Lv.50, 회복약 금지
  const codeB = (await B.c.rpc('battle_code', { p_format: 'single', p_fair: true })).data;
  ok((await A.c.rpc('battle_peek', { p_code: codeB })).data?.fair === true, 'friend QR says fair mode');
  b = (await A.c.rpc('battle_start_team', { p_code: codeB, p_mons: await monIds(A.c, [12, 13, 5]) })).data;
  ok(b.fair && b.sides[0].mons.every((m) => m.lv === 50) && b.sides[1].mons.filter((m) => m.seen).every((m) => m.lv === 50) && b.items_left === 0, 'fair mode: everyone Lv.50, no medicine', { fair: b.fair, me: b.sides?.[0]?.mons?.map((m) => m.lv), foe: b.sides?.[1]?.mons?.map((m) => m.lv), left: b.items_left });
  ok((await A.c.rpc('battle_act', { p_id: b.id, p_action: { item: 'bandage', target: 0 } })).error === 'NO_ITEMS_FAIR', 'medicine refused in fair mode');
  await A.c.rpc('battle_forfeit', { p_id: b.id });
  await B.c.rpc('battle_code', { p_format: 'single', p_fair: false });
  // 운영자: 레벨 정하기
  ok((await admin.rpc('admin_set_level', { p_student_id: A.sid, p_line: 5, p_level: 100 })).data?.level === 100, 'admin sets a level');
  await admin.rpc('admin_give_item', { p_student_id: A.sid, p_item: 'candy', p_qty: 1 });
  ok((await A.c.rpc('bag_use', { p_item: 'candy', p_mon: await monId(A.c, 5) })).error === 'MAX_LEVEL', 'Lv.100 is the cap');
  await admin.rpc('admin_delete_students', { p_student_ids: [A.sid, B.sid], p_confirm: '삭제' });
}

console.log('\n[32] 배틀 끝 (0021): 새 배틀이면 하던 배틀 취소 · 연습 경험치 하루 제한 · 영구 기술머신');
{
  let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'end123' })).error);
  const C = client(await pwLogin(`${sid}@code.local`, 'end123'));
  await C.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: '끝테스트' });
  for (const l of [12, 13, 5]) await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: l, p_stage: 3 });
  const play2 = async (b) => {   // 2턴 (쓰러지면 다음 몬스터)
    for (let t = 0; t < 2 && b.status === 'active'; t++) {
      b = (await C.rpc('battle_act', { p_id: b.id, p_action: { move: 1 } })).data;
      while (b.status === 'active' && b.phase === 'replace' && b.need) {
        const i = b.sides[0].mons.findIndex((m, k) => m.hp > 0 && !b.sides[0].act.includes(k));
        b = (await C.rpc('battle_act', { p_id: b.id, p_action: { switch: i } })).data;
      }
    }
    if (b.status === 'active') await C.rpc('battle_forfeit', { p_id: b.id });
    return (await C.rpc('battle_state', { p_id: b.id })).data;
  };
  const b1 = (await C.rpc('battle_start_cpu', { p_mons: await monIds(C, [12, 13, 5]) })).data;
  const b2 = (await C.rpc('battle_start_cpu', { p_mons: await monIds(C, [12, 13, 5]) })).data;
  const old = (await C.rpc('battle_state', { p_id: b1.id })).data;
  ok(old.status === 'cancelled' && old.reward?.why === 'replaced' && old.winner == null, 'starting a new practice battle cancels the old one (no loss)', old.status);
  ok(await admin.patch('settings?key=eq.practice_exp_daily', { value: 1 }) < 300, 'admin sets the practice EXP limit');
  const e1 = await play2(b2);
  ok(e1.reward?.practice_counted === true && e1.reward?.practice_left === 0, 'first practice battle of the day counts for EXP', e1.reward);
  const e2 = await play2((await C.rpc('battle_start_cpu', { p_mons: await monIds(C, [12, 13, 5]) })).data);
  ok(e2.reward?.exp_why === 'practice_max' && !e2.reward?.exp, 'over the daily limit: practice gives no EXP', e2.reward);
  await admin.patch('settings?key=eq.practice_exp_daily', { value: 10 });
  // 영구 기술머신: 써도 그대로
  const box = (await C.rpc('bag_state')).data.box;
  // 실제 포켓몬은 레벨로 이미 배운 기술이 많아서: 영구 기술머신 3개 중 아직 모르는 포켓몬이 둘 이상인 것으로
  const pms = (await C.select('items?key=like.pm*&select=key,move_id&order=key')).data;
  const pm = pms.map((x) => ({ ...x, lines: box.filter((m) => !m.known.includes(x.move_id)).map((m) => m.line) })).find((x) => x.lines.length >= 2) || pms[0];
  const pmMove = pm.move_id; const lines = pm.lines || [];
  await admin.rpc('admin_give_item', { p_student_id: sid, p_item: pm.key, p_qty: 1 });
  ok(lines.length >= 2 && (await C.rpc('bag_use', { p_item: pm.key, p_mon: await monId(C, lines[0]) })).data?.learned === pmMove
     && (await C.rpc('bag_use', { p_item: pm.key, p_mon: await monId(C, lines[1]) })).data?.learned === pmMove, 'permanent TM teaches two Pokémon', [pm.key, lines]);
  ok((await C.rpc('bag_state')).data.items.find((x) => x.key === pm.key)?.qty === 1, 'permanent TM stays in the bag');
  await admin.rpc('admin_delete_students', { p_student_ids: [sid], p_confirm: '삭제' });
}

console.log('\n[33] QR 없이 참가하는 레이드 (0022)');
{
  const rr = (await admin.rpc('admin_create_raid', { p_species: 3, p_hp: 500, p_minutes: 5, p_tv: false, p_title: '열린 레이드 테스트' })).data;
  ok((await S[0].rpc('raid_join_open', { p_raid: rr.id })).error === 'RAID_NOT_FOUND', 'normal raid still needs the QR');
  ok(!((await S[0].rpc('open_raids')).data || []).some((x) => x.id === rr.id), 'not listed while closed');
  ok((await S[0].rpc('admin_set_raid_open', { p_id: rr.id, p_open: true })).error === 'NOT_ADMIN', 'students cannot open raids');
  ok((await admin.rpc('admin_set_raid_open', { p_id: rr.id, p_open: true })).data?.open === true, 'admin turns on "join without QR"');
  const lst = (await S[0].rpc('open_raids')).data || [];
  ok(lst.some((x) => x.id === rr.id && x.joined === false), 'student sees it in the raid tab', lst.map((x) => x.id));
  const j = (await S[0].rpc('raid_join_open', { p_raid: rr.id })).data;
  ok(j?.id === rr.id && j.me, 'student joins without the QR', j?.me);
  ok(((await S[0].rpc('open_raids')).data || []).find((x) => x.id === rr.id)?.joined === true, 'marked as joined');
  ok(((await admin.rpc('admin_list_raids')).data || []).find((x) => x.id === rr.id)?.open === true, 'admin list shows it open');
  await admin.rpc('admin_end_raid', { p_id: rr.id });
  ok((await S[0].rpc('raid_join_open', { p_raid: rr.id })).error === 'RAID_OVER', 'cannot join after it ends');
}

console.log('\n[34] 미니게임 (0023) · 야자 전설 · 환상 이스터에그 (0024)');
{
  let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'mg1234' })).error);
  const C = client(await pwLogin(`${sid}@code.local`, 'mg1234'));
  await C.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: '미니테스트' });
  for (let l = 1; l <= 9; l++) await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: l, p_stage: 1 });
  ok((await C.rpc('submit_minigame_score', { p_game: 'surf', p_score: 120, p_ms: 60000 })).error === 'MINIGAME_LOCKED', 'minigames locked under 10 monsters');
  await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: 10, p_stage: 1 });
  ok((await C.rpc('submit_minigame_score', { p_game: 'surf', p_score: 5000, p_ms: 60000 })).error === 'BAD_SCORE', 'surf: too far for the time rejected (max 40 m/s)');
  ok((await C.rpc('submit_minigame_score', { p_game: 'yacht', p_score: 100, p_ms: 60000 })).error === 'BAD_GAME', 'old dice yacht game is gone');
  ok((await C.rpc('submit_minigame_score', { p_game: 'land', p_score: 1200, p_ms: 90000 })).error === 'BAD_SCORE', 'land: more than the whole board rejected');
  ok((await C.rpc('submit_minigame_score', { p_game: 'land', p_score: 300, p_ms: 3000 })).error === 'BAD_SCORE', 'land: under 5 s rejected');
  ok((await C.rpc('submit_minigame_score', { p_game: 'land', p_score: 312, p_ms: 90000 })).data?.me?.score === 312, 'land score saved (‰ of the board)');
  ok((await C.rpc('submit_minigame_score', { p_game: 'dodge', p_score: 900, p_ms: 5000 })).error === 'BAD_SCORE', 'dodge score too high for the time rejected');
  ok((await C.rpc('submit_minigame_score', { p_game: 'chess', p_score: 1, p_ms: 9000 })).error === 'BAD_GAME', 'unknown game rejected');
  const y = (await C.rpc('submit_minigame_score', { p_game: 'surf', p_score: 1500, p_ms: 60000 })).data;
  ok(y?.me?.score === 1500 && y.me.rank >= 1, 'surf distance saved, my rank returned', y?.me);
  ok((await C.rpc('submit_minigame_score', { p_game: 'surf', p_score: 1600, p_ms: 60000 })).error === 'TRY_LATER', 'one submit per 5 s per game');
  ok((await C.rpc('submit_minigame_score', { p_game: 'maze', p_score: 50000, p_ms: 90000 })).error === 'BAD_SCORE', 'maze time must match real time');
  ok((await C.rpc('submit_minigame_score', { p_game: 'maze', p_score: 50000, p_ms: 50500 })).data?.me?.score === 50000, 'maze time saved');
  let m2;
  for (const t0 = Date.now(); Date.now() - t0 < 15000;) {      // 게임마다 5초에 한 번 — TRY_LATER 가 풀릴 때까지 다시 (최대 15초)
    const r2 = await C.rpc('submit_minigame_score', { p_game: 'maze', p_score: 40000, p_ms: 40100 });
    if (r2.error !== 'TRY_LATER') { m2 = r2.data; break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  ok(m2?.me?.score === 40000, 'maze: faster time becomes my best (lower is better)', m2?.me);
  const rk = (await C.rpc('minigame_ranking', { p_game: 'surf' })).data;
  ok(rk?.top?.some((x) => x.me && x.score === 1500) && rk.unlock === 10, 'ranking lists me with my best', rk?.me);
  ok((await anon.rpc('minigame_ranking', { p_game: 'surf' })).error, 'anon cannot read minigame ranking');

  // 0024: 새 몬스터 6마리 + 환상 표시
  const ln = (await C.select('lines?id=gte.77&id=lte.82&select=id,mythic,bonus,btype&order=id')).data;
  ok(ln.length === 6 && ln.every((l) => l.bonus && l.btype && !l.btype.includes('전설')) && ln.filter((l) => l.mythic).map((l) => l.id).join() === '79,80,81,82',
     'lines 77~82: bonus legends with real types (제르네아스 … 세레비), 79~82 mythic', ln);
  const sm = (await C.select('species_moves?species_id=in.(229,232,235,238,241,244)&select=species_id')).data;
  ok(sm.length === 24, 'each new monster has 4 moves', sm.length);
  const slots = (await admin.select('settings?key=eq.raid_slots&select=value')).data[0].value;
  ok([77, 78].every((l) => slots.some((x) => x.line === l)), 'night-study raids added to raid_slots', slots);
  // 이스터에그
  ok((await anon.rpc('claim_egg', { p_key: 'card' })).error, 'anon cannot claim an egg');
  ok((await C.rpc('claim_egg', { p_key: 'nope' })).error === 'BAD_EGG', 'unknown egg rejected');
  const e1 = (await C.rpc('claim_egg', { p_key: 'card' })).data;
  ok(e1?.granted === true && e1.species_id === 238, 'trainer-card egg → 등대리온 special ticket', e1);
  ok((await C.rpc('claim_egg', { p_key: 'card' })).data?.granted === false, 'same egg only once');
  ok((await C.rpc('claim_egg', { p_key: 'chart' })).data?.species_id === 241 && (await C.rpc('claim_egg', { p_key: 'map' })).data?.species_id === 244,
     'type-chart egg → 책갈피아, map egg → 아토키');
  const sp = (await C.rpc('sync')).data.state.special || [];
  ok(sp.filter((x) => x.special === 'egg').map((x) => x.species_id).sort().join() === '238,241,244', 'three egg tickets in the pouch', sp);
  // 트레이너 카드 몬스터 고르기
  ok((await C.rpc('set_partner', { p_mon: await monId(C, 30) })).error === 'NOT_OWNED', 'cannot pick a monster I do not own as card partner');
  const p5 = await monId(C, 5);
  ok(p5 > 0 && (await C.rpc('set_partner', { p_mon: p5 })).data?.partner === p5 && (await C.rpc('sync')).data.state.profile.partner === p5, 'pick card partner (saved on the server, Pokémon number)');
  ok((await C.rpc('set_partner', { p_mon: null })).data?.partner === null, 'back to automatic partner');
  await admin.rpc('admin_delete_students', { p_student_ids: [sid], p_confirm: '삭제' });
}

console.log('\n[35] 미니게임 운영 · 연습 배틀 공정 모드 (0025)');
{
  let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'mg1234' })).error);
  const C = client(await pwLogin(`${sid}@code.local`, 'mg1234'));
  await C.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: '운영테스트' });
  for (let l = 1; l <= 10; l++) await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: l, p_stage: 3 });
  const cfg = (await C.rpc('minigame_config')).data;
  ok(cfg?.unlock === 10 && Array.isArray(cfg.off), 'students get the minigame config (unlock + off list)', cfg);
  ok((await anon.rpc('minigame_config')).error, 'anon cannot read minigame config');
  ok((await C.rpc('admin_minigame_overview')).error === 'NOT_ADMIN', 'students cannot open the admin overview');
  ok(await admin.patch('settings?key=eq.minigame_off', { value: ['dodge'] }) < 300, 'admin turns dodge off');
  ok((await C.rpc('submit_minigame_score', { p_game: 'dodge', p_score: 30, p_ms: 5000 })).error === 'GAME_OFF', 'a turned-off game does not take scores');
  await admin.patch('settings?key=eq.minigame_off', { value: [] });
  ok((await C.rpc('submit_minigame_score', { p_game: 'dodge', p_score: 30, p_ms: 5000 })).data?.me?.score === 30, 'back on: score saved');
  const ov = (await admin.rpc('admin_minigame_overview')).data;
  ok(ov?.games?.dodge?.plays >= 1 && 'surf' in ov.games, 'admin overview counts plays per game', ov?.games?.dodge);
  const rows = (await admin.rpc('admin_minigame_scores', { p_game: 'dodge' })).data || [];
  ok(rows.some((r) => r.student_id === sid && r.score === 30 && r.plays === 1), 'admin list shows student number + best', rows.find((r) => r.student_id === sid));
  ok((await admin.rpc('admin_delete_minigame_scores', { p_game: 'dodge', p_student_id: sid })).data === 1, 'admin deletes one student\'s records');
  ok(!((await admin.rpc('admin_minigame_scores', { p_game: 'dodge' })).data || []).some((r) => r.student_id === sid), 'gone from the list');
  ok((await admin.rpc('admin_reset_minigame', { p_game: 'dodge', p_confirm: '삭제' })).error === 'CONFIRM_MISMATCH', 'reset needs the word 초기화');
  ok((await C.rpc('admin_reset_minigame', { p_game: 'dodge', p_confirm: '초기화' })).error === 'NOT_ADMIN', 'students cannot reset');
  // 연습 배틀 공정 모드
  const bf = (await C.rpc('battle_start_cpu', { p_mons: await monIds(C, [1, 2, 3]), p_fair: true })).data;
  ok(bf?.fair === true && bf.items_left === 0, 'practice battle in fair mode (Lv.50, no items)', { fair: bf?.fair, items: bf?.items_left });
  ok((bf?.sides?.[0]?.mons || []).every((m) => m.lv === 50 || m.level === 50 || m.lv == null), 'my monsters are Lv.50 in fair mode', bf?.sides?.[0]?.mons?.map((m) => m.lv ?? m.level));
  const bn = (await C.rpc('battle_start_cpu', { p_mons: await monIds(C, [1, 2, 3]) })).data;
  ok(bn?.fair === false, 'practice battle default stays normal', bn?.fair);
  await admin.rpc('admin_delete_students', { p_student_ids: [sid], p_confirm: '삭제' });
}

console.log('\n[36] 미니게임 몬스터 등굣길 (0026)');
{
  let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'cr1234' })).error);
  const C = client(await pwLogin(`${sid}@code.local`, 'cr1234'));
  await C.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: '등굣길테스트' });
  for (let l = 1; l <= 10; l++) await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: l, p_stage: 1 });
  ok((await C.rpc('submit_minigame_score', { p_game: 'cross', p_score: 200, p_ms: 10000 })).error === 'BAD_SCORE', 'cross: 20 rows a second is refused');
  const r = (await C.rpc('submit_minigame_score', { p_game: 'cross', p_score: 110, p_ms: 10000 })).data;
  ok(r?.me?.score === 110 && r.lower_better === false, 'cross: a fast real run (11 rows/s, 0029) is saved (bigger is better)', r?.me);
  ok((await C.rpc('minigame_ranking', { p_game: 'cross' })).data?.game === 'cross', 'cross ranking opens');
  ok('cross' in ((await admin.rpc('admin_minigame_overview')).data?.games || {}), 'admin overview lists cross');
  ok(((await admin.rpc('admin_minigame_scores', { p_game: 'cross' })).data || []).some((x) => x.student_id === sid), 'admin sees the cross record');
  await admin.rpc('admin_delete_students', { p_student_ids: [sid], p_confirm: '삭제' });
}

console.log('\n[37] 알 · 반 랭킹 · 도전과제 (0027)');
{
  let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'eg1234' })).error);
  const C = client(await pwLogin(`${sid}@code.local`, 'eg1234'));
  await C.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: '알테스트' });
  ok((await anon.rpc('egg_state')).error, 'anon cannot read eggs');
  const st0 = (await C.rpc('egg_state')).data;
  ok(st0?.eggs?.length === 0 && st0.hold_max === 9 && st0.incubators === 3 && st0.need?.green === 1000 && st0.day_max === 30000,
     'empty egg state with the settings', st0);
  ok((await C.rpc('admin_give_egg', { p_student_id: sid, p_tier: 'green', p_n: 1 })).error === 'NOT_ADMIN', 'students cannot give eggs');
  ok((await admin.rpc('admin_give_egg', { p_student_id: sid, p_tier: 'pink', p_n: 1 })).error === 'BAD_TIER', 'unknown egg tier refused');
  const g = (await admin.rpc('admin_give_egg', { p_student_id: sid, p_tier: 'green', p_n: 4 })).data;
  ok(g?.given === 4 && g.eggs === 4, 'admin gives 4 green eggs', g);
  const ids = (await C.rpc('egg_state')).data.eggs.map((e) => e.id);
  for (const id of ids.slice(0, 3)) await C.rpc('egg_incubate', { p_egg: id });
  ok((await C.rpc('egg_incubate', { p_egg: ids[3] })).error === 'NO_SLOT', 'fourth egg: NO_SLOT (3 incubators full)');
  ok((await C.rpc('egg_incubate', { p_egg: 999999999 })).error === 'NOT_FOUND', 'someone else\'s / missing egg: NOT_FOUND');
  ok((await C.rpc('egg_hatch', { p_egg: ids[0] })).error === 'NOT_READY', 'cannot hatch before enough steps');
  ok((await C.rpc('egg_add_steps', { p_steps: -5 })).error === 'BAD_STEPS', 'negative steps refused');
  const a1 = (await C.rpc('egg_add_steps', { p_steps: 50000 })).data;
  ok(a1?.accepted > 0 && a1.accepted <= 2000 && a1.steps_today === a1.accepted, 'huge burst only partly accepted (≤ 200/min × 10 min)', a1?.accepted);
  ok(a1?.eggs?.filter((e) => e.slot).every((e) => e.steps === e.need) && a1.ready.length === 3
     && a1.eggs.find((e) => e.id === ids[3]).steps === 0, 'incubating eggs progress (capped at need), the 4th does not; ready list', a1?.eggs);
  const a2 = (await C.rpc('egg_add_steps', { p_steps: 5000 })).data;
  ok(a2?.accepted < 100, 'right after: almost nothing more accepted', a2?.accepted);
  const h = (await C.rpc('egg_hatch', { p_egg: ids[0] })).data;
  ok(h?.new === true && h.tier === 'green' && h.level === 8 && h.rarity === 'common' && typeof h.shiny === 'boolean' && h.egg_move === null,
     'green egg → new common monster at Lv.8', h);
  const s1 = (await C.rpc('sync')).data.state;
  const col = s1.collection.find((c) => c.line_id === h.line);
  ok(col?.from_egg === true && typeof col.shiny === 'boolean' && typeof col.shiny_on === 'boolean', 'collection row from_egg (+ shiny flags in sync)', col);
  ok(s1.profile.score >= 1 && s1.profile.dex_count === 1, 'score / dex updated like a catch', s1.profile);
  ok((await C.rpc('egg_hatch', { p_egg: ids[0] })).error === 'NOT_FOUND', 'an egg hatches only once');
  ok((await C.rpc('set_shiny', { p_mon: await monId(C, 99), p_on: true })).error === 'NOT_OWNED', 'set_shiny: not owned');
  const other = h.line === 1 ? 2 : 1;
  await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: other, p_stage: 1 });
  ok((await C.rpc('set_shiny', { p_mon: await monId(C, other), p_on: true })).error === 'SHINY_LOCKED', 'set_shiny refused while the shiny colour is locked');
  if (col?.shiny) ok((await C.rpc('set_shiny', { p_mon: await monId(C, h.line), p_on: false })).data?.on === false, 'shiny unlocked → can turn it off');
  await C.rpc('egg_hatch', { p_egg: ids[1] }); await C.rpc('egg_hatch', { p_egg: ids[2] });
  // 노랑·보라 (짧은 걸음으로 만들어서) + 처음 가 보는 장소 QR = 보너스 걸음 · 알
  await patchSetting('egg_steps', { green: 1000, yellow: 300, purple: 300 });
  await admin.rpc('admin_give_egg', { p_student_id: sid, p_tier: 'yellow', p_n: 1 });
  await admin.rpc('admin_give_egg', { p_student_id: sid, p_tier: 'purple', p_n: 1 });
  await patchSetting('egg_steps', { green: 1000, yellow: 2500, purple: 5000 });
  const st2 = (await C.rpc('egg_state')).data;
  const yid = st2.eggs.find((e) => e.tier === 'yellow').id, pid = st2.eggs.find((e) => e.tier === 'purple').id;
  for (const id of [yid, pid, ids[3]]) await C.rpc('egg_incubate', { p_egg: id });
  await patchSetting('egg_drop_place', 1);
  const sc = (await C.rpc('sync', { p_scans: [{ n: nonce(), q: 'A05', t: T.A05.token }] })).data;
  await patchSetting('egg_drop_place', 0.25);
  ok(sc?.acks?.[0]?.status === 'ok', 'place scan still works (ack ok)', sc?.acks);
  const st3 = (await C.rpc('egg_state')).data;
  ok(st3.eggs.find((e) => e.id === ids[3])?.steps === 300 && st3.eggs.find((e) => e.id === yid)?.steps === 300,
     'new place QR: +300 steps to incubating eggs (not counted in the daily steps)', st3.eggs);
  ok(st3.eggs.length === 4 && st3.eggs.some((e) => !e.slot && ['green', 'yellow'].includes(e.tier)), 'new place QR: an egg dropped', st3.eggs);
  const lg = (await C.rpc('bag_state', { p_since: 0 })).data.log.map((x) => x.item + ':' + x.why);
  ok(lg.includes('_egg_steps:place') && lg.some((x) => /^_egg_(green|yellow):place$/.test(x)), 'phone notice in bag log (_egg_steps / _egg_<tier>)', lg);
  const sc2 = (await C.rpc('sync', { p_scans: [{ n: nonce(), q: 'A05', t: T.A05.token }] })).data;
  const st4 = (await C.rpc('egg_state')).data;
  ok(st4.eggs.find((e) => e.id === ids[3])?.steps === 300, 'same place again: no bonus steps', sc2?.acks);
  const hy = (await C.rpc('egg_hatch', { p_egg: yid })).data;
  const box = (await C.rpc('bag_state', { p_since: 0 })).data.box.find((b) => b.id === hy?.mon);
  ok(hy?.tier === 'yellow' && hy.rarity === 'rare' && Number.isInteger(hy.egg_move) && box?.learned.includes(hy.egg_move) && box.moves.includes(hy.egg_move),
     'yellow egg → rare monster + egg move learned and in the 4 moves', { hy, box });
  const hp = (await C.rpc('egg_hatch', { p_egg: pid })).data;
  ok(hp?.tier === 'purple' && ['rare', 'legendary'].includes(hp.rarity) && hp.held && ['held', 'bag'].includes(hp.held_to),
     'purple egg → rare/legend + held item', hp);
  // 도전과제
  ok((await anon.rpc('achievements')).error, 'anon cannot read achievements');
  const al = (await C.rpc('achievements')).data;
  const hatch5 = al?.find((x) => x.key === 'hatch5');
  ok(al?.length === 95 && hatch5?.done === true && hatch5.progress === 5 && !hatch5.claimed && al.every((a) => a.kind && a.title), '95 achievements (with kind), hatch 5 done', hatch5);
  ok((await C.rpc('claim_achievement', { p_key: 'dex60' })).error === 'NOT_DONE', 'unfinished achievement cannot be claimed');
  ok((await C.rpc('claim_achievement', { p_key: 'nope' })).error === 'BAD_KEY', 'unknown achievement');
  const before = ((await C.rpc('bag_state')).data.items.find((i) => i.key === 'candy')?.qty) || 0;
  const cl = (await C.rpc('claim_achievement', { p_key: 'hatch5' })).data;
  const after = ((await C.rpc('bag_state')).data.items.find((i) => i.key === 'candy')?.qty) || 0;
  ok(cl?.list?.find((x) => x.key === 'hatch5')?.claimed === true && after === before + 2, 'claim → reward once (2 candies)', { before, after });
  ok((await C.rpc('claim_achievement', { p_key: 'hatch5' })).error === 'ALREADY_CLAIMED', 'second claim refused');
  const fill = (await admin.rpc('admin_give_egg', { p_student_id: sid, p_tier: 'green', p_n: 20 })).data;
  ok(fill?.eggs === 9 && fill.given < 20, 'eggs stop at hold max (9)', fill);
  ok((await C.rpc('claim_achievement', { p_key: 'hatch1' })).error === 'EGG_FULL', 'egg reward with a full egg box → EGG_FULL (not claimed)');
  ok((await C.rpc('achievements')).data.find((x) => x.key === 'hatch1')?.claimed === false, 'EGG_FULL claim did not count');
  // 반
  ok((await C.rpc('set_class', { p_grade: 4, p_class: '1' })).error === 'BAD_CLASS', 'grade 4 refused');
  const pc = (await C.rpc('set_class', { p_grade: 2, p_class: '7' })).data;
  ok(pc?.grade === 2 && pc.class_name === '7', 'student sets grade/class', pc);
  const cr = (await C.rpc('class_ranking')).data;
  const mine = cr?.classes?.find((x) => x.grade === 2 && x.class_name === '7');
  ok(mine?.me === true && mine.players >= 1 && mine.score >= 1 && mine.top?.display && cr.mine?.rank === mine.rank && cr.can_set === true,
     'class ranking lists my class (score sum, top player)', { mine, me: cr?.mine });
  ok((await anon.rpc('class_ranking')).error, 'anon cannot read class ranking');
  ok((await C.rpc('admin_set_class', { p_student_id: sid, p_grade: 3, p_class: '1' })).error === 'NOT_ADMIN', 'students cannot use admin_set_class');
  ok((await admin.rpc('admin_set_class', { p_student_id: sid, p_grade: 3, p_class: '1' })).data?.grade === 3
     && (await C.rpc('sync')).data.state.profile.class_name === '1', 'admin sets class (profile shows it)');
  const nid = 'tcl' + Math.random().toString(36).slice(2, 9);
  await anon.rpc('create_id_account', { p_id: nid, p_password: 'idpass1' });
  const N = client(await pwLogin(`${nid}@id.local`, 'idpass1'));
  await N.rpc('register_profile', { p_kind: 'id', p_student_id: null, p_name: '반손님' });
  ok((await N.rpc('set_class', { p_grade: 1, p_class: '1' })).error === 'NOT_STUDENT', 'non-student id account cannot set a class');
  ok((await N.rpc('class_ranking')).data?.can_set === false, 'non-student sees can_set false');
  await admin.rpc('admin_delete_students', { p_student_ids: [sid, `g:${nid}`], p_confirm: '삭제' });
}

console.log('\n[38] 몬스터 잡기 장면 보너스 (0028)');
{
  let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'ct1234' })).error);
  const C = client(await pwLogin(`${sid}@code.local`, 'ct1234'));
  await C.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: '잡기테스트' });
  const q = Object.keys(T).find((k) => /^A\d+$/.test(k));
  const n1 = nonce();
  const s1 = await C.rpc('sync', { p_scans: [{ n: n1, q, t: T[q].token }] });
  ok(s1.data?.acks?.[0]?.status === 'ok', 'scan a place QR', s1.data?.acks);
  ok((await C.rpc('catch_bonus', { p_nonce: n1, p_grade: 'great' })).error === 'NOT_FOUND', 'no bonus before the booth hands the monster over');
  const red = await booth.rpc('booth_redeem', { p_payload: sid });
  ok(red.data?.results?.some((x) => x.species_id), 'booth redeems the ticket', red.data?.results);
  ok((await C.rpc('catch_bonus', { p_nonce: n1, p_grade: 'perfect' })).error === 'BAD_GRADE', 'unknown grade refused');
  ok((await anon.rpc('catch_bonus', { p_nonce: n1, p_grade: 'nice' })).error, 'anon cannot claim a catch bonus');
  const st0 = (await C.rpc('sync')).data.state;
  const tk = st0.tickets.find((x) => x.nonce === n1);
  const line = (await admin.select(`species?id=eq.${tk.species_id}&select=line_id`)).data[0].line_id;
  const before = (await C.rpc('bag_state')).data.box.find((m) => m.line === line);
  const b = (await C.rpc('catch_bonus', { p_nonce: n1, p_grade: 'excellent', p_curve: true })).data;
  ok(b?.exp === 100 && b.line === line, 'excellent + curveball → 100 EXP to that monster', b);
  const after = (await C.rpc('bag_state')).data.box.find((m) => m.line === line);
  ok(after.level > before.level || after.exp > before.exp, 'monster got the EXP', { before: [before.level, before.exp], after: [after.level, after.exp] });
  ok((await C.rpc('catch_bonus', { p_nonce: n1, p_grade: 'excellent' })).error === 'ALREADY_CLAIMED', 'one bonus per ticket');
  await admin.rpc('admin_delete_students', { p_student_ids: [sid], p_confirm: '삭제' });
}

console.log('\n[39] 잡기 도망 · 레이드 보스 잡기 · 반 이름 (0030)');
{
  const mk = async (name) => {
    let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'cr1234' })).error);
    const c = client(await pwLogin(`${sid}@code.local`, 'cr1234'));
    await c.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: name });
    return { c, sid };
  };
  const A = await mk('도망테스트'), B = await mk('도망비');
  const st = async () => (await A.c.rpc('sync')).data.state;
  // 설정
  ok((await anon.rpc('catch_config')).error, 'anon cannot read catch config');
  const cfg = (await A.c.rpc('catch_config')).data;
  ok(typeof cfg?.flee === 'number' && cfg.flee >= 0 && cfg.flee <= 1 && cfg.raid_mode === 'ticket' && Number.isInteger(cfg.raid_balls)
     && cfg.raid_balls > 0 && typeof cfg.raid_flee === 'boolean', 'catch_config → {flee, raid_mode, raid_balls, raid_flee}', cfg);
  const places = Object.keys(T).filter((k) => /^A\d+$/.test(k));
  let pi = 0;
  const catchOne = async () => {     // 새 장소 QR 하나 찍고 부스에서 받기 → { n, res }
    const q = places[pi++];
    const n = nonce();
    await A.c.rpc('sync', { p_scans: [{ n, q, t: T[q].token }] });
    const res = (await booth.rpc('booth_redeem', { p_payload: A.sid })).data?.results?.find((x) => x.nonce === n);
    return { n, q, res };
  };
  // 1) 보통 잡기 (경험치) + 한 번만
  const c1 = await catchOne();
  ok(c1.res?.species_id, 'booth hands over a monster', c1.res);
  ok((await A.c.rpc('catch_result', { p_nonce: c1.n, p_grade: 'perfect' })).error === 'BAD_GRADE', 'catch_result: unknown grade refused');
  ok((await anon.rpc('catch_result', { p_nonce: c1.n, p_grade: 'nice' })).error, 'anon cannot send a catch result');
  const r1 = (await A.c.rpc('catch_result', { p_nonce: c1.n, p_grade: 'great' })).data;
  ok(r1?.fled === false && r1.grade === 'great' && r1.exp === 40 && r1.line === c1.res.line_id && Number.isInteger(r1.level), 'catch_result (caught): great → 40 EXP', r1);
  ok((await A.c.rpc('catch_result', { p_nonce: c1.n, p_grade: 'great' })).error === 'ALREADY_CLAIMED', 'catch_result once per ticket');
  ok((await A.c.rpc('catch_result', { p_nonce: c1.n, p_grade: 'none', p_fled: true })).error === 'ALREADY_CLAIMED', 'cannot flee after it was caught');
  // 2) 새 몬스터가 도망 → 도감 칸이 사라지고 점수·도감 수가 내려감
  let c2; for (let i = 0; i < 6; i++) { c2 = await catchOne(); if (c2.res?.is_new) break; }
  ok(c2.res?.is_new === true, 'a NEW monster from the booth', c2.res);
  const s2a = await st();
  const r2 = (await A.c.rpc('catch_result', { p_nonce: c2.n, p_grade: 'none', p_fled: true })).data;
  const s2b = await st();
  ok(r2?.fled === true && r2.removed === true && r2.line === c2.res.line_id, 'flee on a new monster → removed', r2);
  ok(!s2b.collection.some((c) => c.line_id === c2.res.line_id) && s2b.profile.dex_count === s2a.profile.dex_count - 1
     && s2b.profile.score < s2a.profile.score, 'collection row gone, dex_count and score lower',
     { dex: [s2a.profile.dex_count, s2b.profile.dex_count], score: [s2a.profile.score, s2b.profile.score] });
  ok(!(s2b.quizzes || []).some((z) => z.line_id === c2.res.line_id), 'its unanswered quiz is gone too');
  ok((await A.c.rpc('catch_result', { p_nonce: c2.n, p_grade: 'none', p_fled: true })).error === 'ALREADY_CLAIMED', 'flee is recorded once');
  ok(s2b.tickets.find((t) => t.nonce === c2.n)?.status === 'redeemed', 'ticket status unchanged (redeemed, fled flag only)');
  // 3) 이미 있는 몬스터가 도망 → 칸은 남고 catch_count·레벨·진화권 원래대로
  const q3 = places[pi++];
  const pool3 = (await admin.select(`qr_rewards?qr_id=eq.${q3}&select=line_id`)).data.map((x) => x.line_id);
  for (const l of pool3) await admin.rpc('admin_grant_monster', { p_student_id: A.sid, p_line: l, p_stage: 1 });
  const n3 = nonce();
  await A.c.rpc('sync', { p_scans: [{ n: n3, q: q3, t: T[q3].token }] });   // 찍기만 (장소 수 레벨 보너스는 여기서) → 그 뒤를 기준으로
  const s3a = await st();
  const box3a = (await A.c.rpc('bag_state')).data.box;
  const res3 = (await booth.rpc('booth_redeem', { p_payload: A.sid })).data?.results?.find((x) => x.nonce === n3);
  ok(res3?.is_new === false, 'duplicate monster from the booth', res3);
  const r3 = (await A.c.rpc('catch_result', { p_nonce: n3, p_grade: 'none', p_fled: true })).data;
  const s3b = await st();
  const box3b = (await A.c.rpc('bag_state')).data.box;
  const before3 = s3a.collection.find((c) => c.line_id === res3?.line_id), after3 = s3b.collection.find((c) => c.line_id === res3?.line_id);
  ok(r3?.fled === true && r3.removed === false && after3 && after3.catch_count === before3.catch_count, 'flee on a duplicate → row kept, catch_count back', { r3, before3, after3 });
  ok(box3b.length === box3a.length && box3b.find((m) => m.line === res3?.line_id)?.level === box3a.find((m) => m.line === res3?.line_id)?.level,
     '0036: the duplicate that fled is gone from the box (the first one unchanged)', [box3a.length, box3b.length]);
  ok(s3b.profile.dex_count === s3a.profile.dex_count && s3b.profile.score === s3a.profile.score && s3b.profile.evo_tickets === s3a.profile.evo_tickets,
     'dex / score / evo tickets same as before the catch', { a: [s3a.profile.dex_count, s3a.profile.score, s3a.profile.evo_tickets], b: [s3b.profile.dex_count, s3b.profile.score, s3b.profile.evo_tickets] });
  // 4) 옛 앱의 catch_bonus 도 그대로
  const c4 = await catchOne();
  const b4 = (await A.c.rpc('catch_bonus', { p_nonce: c4.n, p_grade: 'nice' })).data;
  ok(b4?.exp === 20 && b4.line === c4.res?.line_id, 'old catch_bonus still works', b4);
  ok((await A.c.rpc('catch_result', { p_nonce: c4.n, p_grade: 'nice' })).error === 'ALREADY_CLAIMED', 'catch_bonus and catch_result share the once-per-ticket rule');
  // 5) 레이드 잡기 모드
  const winRaid = async () => {
    const rd = (await admin.rpc('admin_create_raid', { p_species: 3, p_hp: 400, p_minutes: 5, p_tv: false, p_title: '잡기 레이드 테스트' })).data;
    await A.c.rpc('raid_join', { p_q: rd.q, p_t: rd.t });
    let r;
    for (let i = 0; i < 40; i++) {
      await new Promise((res) => setTimeout(res, 700));
      r = await A.c.rpc('raid_attack', { p_raid: rd.id, p_taps: 8 });
      if (r.data?.status !== 'active') break;
    }
    return { rd, r: (await A.c.rpc('raid_state', { p_raid: rd.id })).data };
  };
  await patchSetting('raid_reward_mode', 'catch');
  try {
    ok((await A.c.rpc('catch_config')).data?.raid_mode === 'catch', 'admin switches raid reward to catch (settings row)');
    const w1 = await winRaid();
    ok(w1.r?.status === 'won' && w1.r.me?.rewarded, 'raid won and rewarded', { status: w1.r?.status, me: w1.r?.me });
    const s5 = await st();
    const me5 = (await A.c.rpc('my_encounters')).data;
    ok(me5?.length === 1 && me5[0].species_id === 3 && me5[0].balls === cfg.raid_balls && me5[0].raid_title === '잡기 레이드 테스트' && me5[0].id && me5[0].created_at,
       'my_encounters: one pending boss encounter', me5);
    ok(s5.encounters?.length === 1 && s5.encounters[0].id === me5[0].id, 'sync state carries the pending encounter', s5.encounters);
    ok(!(s5.special || []).some((x) => x.special === 'raid') && !s5.tickets.some((t) => t.status === 'pending' && t.qr_id === 'RAID'), 'no special raid ticket in catch mode', s5.special);
    ok((await anon.rpc('my_encounters')).error, 'anon cannot list encounters');
    ok((await B.c.rpc('encounter_result', { p_id: me5[0].id, p_caught: true })).error === 'NOT_FOUND', 'someone else cannot resolve my encounter');
    const e1 = (await A.c.rpc('encounter_result', { p_id: me5[0].id, p_caught: true, p_grade: 'nice' })).data;
    const s5b = await st();
    ok(e1?.caught === true && e1.fled === false && e1.species_id === 3 && e1.line === 1 && typeof e1.new === 'boolean' && e1.exp === 20 && Number.isInteger(e1.level),
       'encounter_result caught → boss monster + EXP', e1);
    ok(s5b.collection.find((c) => c.line_id === 1)?.stage === 3 && s5b.encounters.length === 0 && s5b.profile.dex_count >= s5.profile.dex_count + (e1.new ? 3 : 0),
       'boss arrives at its stage, encounter no longer pending, dex updated', s5b.encounters);
    ok((await A.c.rpc('encounter_result', { p_id: me5[0].id, p_caught: true })).error === 'NOT_FOUND', 'an encounter resolves once');
    const cc1 = s5b.collection.find((c) => c.line_id === 1).catch_count;
    const w2 = await winRaid();
    const me6 = (await A.c.rpc('my_encounters')).data;
    ok(w2.r?.status === 'won' && me6?.length === 1, 'second raid → second encounter', me6);
    const e2 = (await A.c.rpc('encounter_result', { p_id: me6[0].id, p_caught: false })).data;
    const s6 = await st();
    ok(e2?.caught === false && e2.fled === true && e2.species_id === 3, 'all balls missed → boss fled', e2);
    ok(s6.collection.find((c) => c.line_id === 1)?.catch_count === cc1 && s6.encounters.length === 0, 'fled boss: no monster given');
    const enc = (await admin.select(`raid_encounters?id=in.(${me5[0].id},${me6[0].id})&select=id`));
    ok(enc.status >= 400 || (enc.data || []).length === 0, 'raid_encounters table not readable directly (functions only)', enc.status);
  } finally {
    await patchSetting('raid_reward_mode', 'ticket');
  }
  ok((await A.c.rpc('catch_config')).data?.raid_mode === 'ticket', 'raid reward mode restored to ticket');
  // 6) 반 = 이름
  const k1 = (await A.c.rpc('set_class', { p_grade: 1, p_class: '1a' })).data;
  ok(k1?.grade === 1 && k1.class_name === '1A', 'set_class text "1a" → stored 1A', k1);
  const k2 = (await A.c.rpc('set_class', { p_grade: 2, p_class: '10B' })).data;
  ok(k2?.grade === 2 && k2.class_name === '10B', 'set_class 10B', k2);
  ok((await A.c.rpc('set_class', { p_grade: 2, p_class: '12345' })).error === 'BAD_CLASS', 'too long class name refused');
  ok((await A.c.rpc('set_class', { p_grade: 2, p_class: '!!' })).error === 'BAD_CLASS', 'symbols refused');
  ok((await A.c.rpc('set_class', { p_grade: 2, p_class: null })).error === 'BAD_CLASS', 'grade without class refused');
  ok((await A.c.rpc('set_class', { p_grade: 2, p_class: '가나' })).data?.class_name === '가나', 'Korean class name ok');
  await A.c.rpc('set_class', { p_grade: 2, p_class: '10B' });
  const kr = (await A.c.rpc('class_ranking')).data;
  const mineK = kr?.classes?.find((x) => x.grade === 2 && x.class_name === '10B');
  ok(mineK?.me === true && mineK.players >= 1 && kr.mine?.class_name === '10B' && kr.mine.rank === mineK.rank, 'class_ranking groups by class_name', { mineK, mine: kr?.mine });
  const ak = (await admin.rpc('admin_set_class', { p_student_id: A.sid, p_grade: 3, p_class: '2c' })).data;
  ok(ak?.class_name === '2C' && ak.grade === 3 && (await st()).profile.class_name === '2C', 'admin_set_class with a text class', ak);
  ok((await admin.rpc('admin_set_class', { p_student_id: A.sid, p_grade: 3, p_class: 'ABCDE' })).error === 'BAD_CLASS', 'admin_set_class validates too');
  const kc = (await A.c.rpc('set_class', { p_grade: null, p_class: null })).data;
  ok(kc?.grade === null && kc.class_name === null, 'both null clears the class', kc);
  const nid = 'tcn' + Math.random().toString(36).slice(2, 9);
  await anon.rpc('create_id_account', { p_id: nid, p_password: 'idpass1' });
  const N = client(await pwLogin(`${nid}@id.local`, 'idpass1'));
  await N.rpc('register_profile', { p_kind: 'id', p_student_id: null, p_name: '반손님' });
  ok((await N.rpc('set_class', { p_grade: 1, p_class: '1A' })).error === 'NOT_STUDENT', 'non-student: NOT_STUDENT');
  await admin.rpc('admin_delete_students', { p_student_ids: [A.sid, B.sid, `g:${nid}`], p_confirm: '삭제' });
}

console.log('\n[40] 몬스터 그림 올리기 · 도망 보상 회수 · 로그인 쪽지 숫자만 (0031)');
{
  const STORE = `${URL_}/storage/v1/object`;
  // 1) 그림 목록: 로그인 전에도 읽힘
  const ov0 = (await anon.rpc('sprite_overrides')).data;
  ok(ov0 && typeof ov0 === 'object' && !Array.isArray(ov0), 'anon can read sprite_overrides (map)', ov0);
  // 2) 올리기: 학생은 안 됨, 운영자는 됨
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4GBgYGJgYGBAQAZBAH/xQ5dRwAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
  const path = `1-t${Date.now().toString(36)}.png`;
  const upStu = await fetch(`${STORE}/sprites/${path}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${STOK}`, 'Content-Type': 'image/png' }, body: png });
  ok(upStu.status >= 400, 'student cannot upload a sprite', upStu.status);
  const upBad = await fetch(`${STORE}/sprites/1-tbad.txt`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${ADMIN_TOK}`, 'Content-Type': 'text/plain' }, body: 'hi' });
  ok(upBad.status >= 400, 'bucket refuses non-image files', upBad.status);
  const upAdm = await fetch(`${STORE}/sprites/${path}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${ADMIN_TOK}`, 'Content-Type': 'image/png', 'cache-control': 'max-age=31536000' }, body: png });
  ok(upAdm.ok, 'admin uploads a sprite', upAdm.status);
  const pub = await fetch(`${STORE}/public/sprites/${path}`);
  ok(pub.ok && (await pub.arrayBuffer()).byteLength === png.length, 'anyone can download it from the public URL', pub.status);
  // 3) species.sprite: 학생은 못 바꾸고, 형식이 틀리면 거절, 운영자가 정하면 목록에 나옴
  const before = (await admin.select('species?select=sprite&id=eq.1')).data?.[0]?.sprite ?? null;
  await S[0].patch('species?id=eq.1', { sprite: path });
  ok(((await admin.select('species?select=sprite&id=eq.1')).data?.[0]?.sprite ?? null) === before, 'student cannot set species.sprite');
  ok((await admin.patch('species?id=eq.1', { sprite: '../x.png' })) >= 400, 'bad sprite path refused by check');
  ok((await admin.patch('species?id=eq.1', { sprite: path })) < 300, 'admin sets species.sprite');
  ok(String((await anon.rpc('sprite_overrides')).data?.['1'] || '').split('|')[0] === path, 'sprite_overrides lists it ("picture|shiny picture")', (await anon.rpc('sprite_overrides')).data?.['1']);
  await admin.patch('species?id=eq.1', { sprite: before });
  const del = await fetch(`${STORE}/sprites`, { method: 'DELETE', headers: { apikey: KEY, Authorization: `Bearer ${ADMIN_TOK}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }) });
  ok(del.ok, 'admin deletes it again (cleanup)', del.status);

  // 4) 로그인 쪽지: 숫자 고유번호만
  const lc = (await admin.rpc('admin_make_login_codes', { p_ids: ['teacher1', 'ab'], p_names: ['선생님', '손님'] })).data;
  ok(Array.isArray(lc) && lc.length === 0, 'admin_make_login_codes skips letter ids', lc);

  // 5) 도망으로 도감이 50% 밑으로 → 안 쓴 도감 보상 티켓 회수
  let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'dx1234' })).error);
  const D = client(await pwLogin(`${sid}@code.local`, 'dx1234'));
  await D.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: '도감보상' });
  const st = async () => (await D.rpc('sync')).data.state;
  const places = Object.keys(T).filter((k) => /^A\d+$/.test(k));
  const wildLines = new Set((await admin.select('lines?select=id&subject=eq.야생')).data.map((l) => l.id));
  await patchSetting('wild_chance', 0);   // 이 시험은 학교 도감만
  let got = null;
  for (const q of places) {             // 부스에서 새 몬스터 하나 (아직 잡기 결과 안 보냄)
    const n = nonce();
    await D.rpc('sync', { p_scans: [{ n, q, t: T[q].token }] });
    const res = (await booth.rpc('booth_redeem', { p_payload: sid })).data?.results?.find((x) => x.nonce === n);
    if (res?.is_new && !wildLines.has(res.line_id)) { got = { n, line: res.line_id }; break; }   // 0032: 학교 도감 포켓몬이어야 함 (야생은 안 셈)
  }
  ok(!!got, 'booth gave a new monster');
  const lines = (await admin.select('lines?select=id,bonus,secret,withdrawn,active&order=id')).data
    .filter((l) => !l.bonus && !l.secret && !l.withdrawn && l.active && !wildLines.has(l.id));
  const spc = (await admin.select('species?select=id,line_id,stage&limit=1000')).data;
  const elig = new Set(lines.map((l) => l.id));
  const total = spc.filter((x) => elig.has(x.line_id)).length;   // 서버 _dex_rewards 와 같은 셈
  let have = 1;                          // 부스에서 받은 새 몬스터 (1단계)
  const duid = (await admin.select(`profiles?select=user_id&student_id=eq.${sid}`)).data?.[0]?.user_id;
  const dex50 = async () => (await admin.select(`tickets?select=id&user_id=eq.${duid}&special=eq.dex50&status=eq.pending`)).data || [];   // 안 쓴 도감 보상 티켓
  let crossed = false;
  outer: for (const l of lines.filter((x) => x.id !== got?.line)) {   // 한 단계씩 = 도감 한 칸씩 → 50% 를 막 넘는 순간에 멈춤
    const stages = spc.filter((x) => x.line_id === l.id).length;
    for (let stg = 1; stg <= stages; stg++) {
      await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: l.id, p_stage: stg });
      have++;
      if (have * 2 >= total - 1 && (await dex50()).length) { crossed = true; break outer; }
    }
  }
  ok(crossed, 'dex 50% reached → dex50 reward ticket pending');
  const fr = (await D.rpc('catch_result', { p_nonce: got?.n, p_grade: 'none', p_fled: true })).data;
  ok(fr?.fled && fr.removed, 'the new monster flees → removed', fr);
  ok((await dex50()).length === 0, 'dex dropped below 50% → unused dex50 ticket taken back');
  await patchSetting('wild_chance', 0);
  await admin.rpc('admin_delete_students', { p_student_ids: [sid], p_confirm: '삭제' });
}

console.log('\n[41] 진짜 포켓몬 (0032): 걸어서 만나는 야생 포켓몬 · 진화 레벨 · 색이 다른 그림');
{
  let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'pk1234' })).error);
  const P = client(await pwLogin(`${sid}@code.local`, 'pk1234'));
  await P.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: '포켓몬' });
  const wildLines = new Set((await admin.select('lines?select=id&subject=eq.야생')).data.map((l) => l.id));
  // 1) 걸음 → 야생 포켓몬 (wild_steps 1500 마다 1마리)
  const ws = (await admin.select('settings?key=eq.wild_steps')).data[0].value;
  const s1 = (await P.rpc('egg_add_steps', { p_steps: Number(ws) + 100 })).data;
  ok(s1?.wild_new === 1 && s1.encounters?.length === 1 && s1.encounters[0].kind === 'wild' && s1.encounters[0].balls > 0, 'walking past wild_steps → one wild Pokémon appears', s1?.encounters);
  const enc = s1.encounters[0];
  const encSp = (await admin.select(`species?id=eq.${enc.species_id}&select=line_id,stage`)).data[0];
  ok(wildLines.has(encSp.line_id) && encSp.stage === 1, 'it is a wild (non-teacher) Pokémon, first stage', encSp);
  const c1 = (await P.rpc('encounter_result', { p_id: enc.id, p_caught: true, p_grade: 'great' })).data;
  ok(c1?.caught === true && c1.line === encSp.line_id && c1.new === true && c1.exp === 40, 'catch it in the app → in my collection (+EXP)', c1);
  const tk = (await admin.select(`tickets?nonce=eq.${c1.nonce}&select=special,qr_id,status`)).data[0];
  ok(tk?.special === 'wild' && tk.qr_id === 'WILD' && tk.status === 'redeemed', 'recorded as a WILD special ticket', tk);
  ok((await P.rpc('encounter_result', { p_id: enc.id, p_caught: true })).error === 'NOT_FOUND', 'an encounter can be used once');
  // 2) 다 놓치면 도망 (야생은 레이드 도망 설정과 상관없이)
  await admin.patch('settings?key=eq.raid_catch_flee', { value: false });
  const s2 = (await P.rpc('egg_add_steps', { p_steps: Number(ws) })).data;   // 1분도 안 지나서 걸음이 깎일 수 있음 → 있으면 시험
  const e2 = (s2?.encounters || [])[0];
  if (e2) {
    const f2 = (await P.rpc('encounter_result', { p_id: e2.id, p_caught: false })).data;
    ok(f2?.fled === true && f2.caught === false, 'missing every ball → the wild Pokémon flees (even with raid flee off)', f2);
  } else ok(true, 'second encounter skipped (step speed limit)');
  await admin.patch('settings?key=eq.raid_catch_flee', { value: true });
  // 3) 진화 = 진화 레벨에 닿으면 진화의 돌 없이
  await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: 20, p_stage: 1 });       // 이상해씨 (16 에 이상해풀)
  await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: 21, p_stage: 1 });       // 파이리 (16 에 리자드)
  const ev20 = (await admin.select('species?line_id=eq.20&stage=eq.2&select=evo_lv,name')).data[0];
  ok(ev20?.evo_lv === 16 && ev20.name === '이상해풀', 'real evolution level: 이상해씨 → 이상해풀 at Lv.16', ev20);
  await admin.rpc('admin_set_level', { p_student_id: sid, p_line: 21, p_level: 15 });
  ok((await P.rpc('evolve', { p_mon: await monId(P, 21) })).error === 'NO_TICKET', 'below the evolution level and no 진화의 돌 → NO_TICKET');
  await admin.rpc('admin_set_level', { p_student_id: sid, p_line: 20, p_level: 16 });
  const ev = (await P.rpc('evolve', { p_mon: await monId(P, 20) })).data;
  ok(ev?.success === true && ev.by_level === true && ev.stage === 2 && ev.evo_tickets === 0, 'at the evolution level → evolves for free, always', ev);
  const st = (await P.rpc('sync')).data.state;
  ok(st.collection.find((c) => c.line_id === 20)?.level === 16, 'sync sends my Pokémon level (for the dex evolution panel)');
  // 4) QR: wild_chance 만큼 정해 둔 포켓몬 대신 야생 포켓몬
  await patchSetting('wild_chance', 1);
  const nq = nonce();
  await P.rpc('sync', { p_scans: [{ n: nq, q: 'A05', t: T.A05.token }] });
  const rq = (await booth.rpc('booth_redeem', { p_payload: sid })).data?.results?.find((x) => x.nonce === nq);
  await patchSetting('wild_chance', 0);
  ok(rq?.species_id && wildLines.has(rq.line_id), 'QR scan with wild_chance 100% → a wild Pokémon instead of the listed one', rq);
  // 5) 선생님 포켓몬 바꾸기 (운영자): 선생님 · 퀴즈 · 장소 QR 이 함께 옮겨지고, 원래 계열은 야생
  const q3 = (await admin.select('quizzes?line_id=eq.3&select=id')).data.length;
  ok((await P.rpc('admin_assign_teacher', { p_from: 3, p_to: 83 })).error === 'NOT_ADMIN', 'students cannot move teachers');
  ok((await admin.rpc('admin_assign_teacher', { p_from: 83, p_to: 84 })).error === 'NOT_TEACHER_LINE', 'only a teacher line can be moved');
  ok((await admin.rpc('admin_assign_teacher', { p_from: 3, p_to: 35 })).error === 'NOT_WILD_LINE', 'cannot move onto a special legend line');
  const mv1 = (await admin.rpc('admin_assign_teacher', { p_from: 3, p_to: 83 })).data;
  const l3 = (await admin.select('lines?id=in.(3,83)&select=id,teacher,subject&order=id')).data;
  ok(mv1?.ok && l3[0].subject === '야생' && l3[1].teacher === mv1.teacher && l3[1].subject !== '야생'
     && (await admin.select('quizzes?line_id=eq.83&select=id')).data.length === q3, 'teacher + quizzes move to the new Pokémon line, old line becomes wild', l3);
  ok((await admin.rpc('admin_assign_teacher', { p_from: 83, p_to: 3 })).data?.ok
     && (await admin.select('lines?id=eq.3&select=subject')).data[0].subject !== '야생', 'and back again (restored)');
  // 6) 돌 진화 (0034): 피카츄 → 라이츄 는 레벨로 안 됨, 진화의 돌 1개로 100%
  const rai = (await admin.select('species?line_id=eq.12&stage=eq.3&select=name,evo_lv,evo_item')).data[0];
  ok(rai?.name === '라이츄' && rai.evo_item === true && rai.evo_lv === null, '라이츄 = stone evolution (no level)', rai);
  await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: 12, p_stage: 2 });
  await admin.rpc('admin_set_level', { p_student_id: sid, p_line: 12, p_level: 80 });
  ok((await P.rpc('evolve', { p_mon: await monId(P, 12) })).error === 'NO_TICKET', 'stone evolution needs a 진화의 돌 even at high level');
  await admin.rpc('admin_adjust_tickets', { p_student_id: sid, p_delta: 1 });
  await patchSetting('evo_prob', [0, 0, 0]);   // 확률 0 이어도 돌 진화는 100%
  const ev12 = (await P.rpc('evolve', { p_mon: await monId(P, 12) })).data;
  await patchSetting('evo_prob', [0, 0.7, 0.35]);
  ok(ev12?.success === true && ev12.by_item === true && ev12.stage === 3 && ev12.evo_tickets === 0, 'with a 진화의 돌 → evolves 100% (uses the stone)', ev12);
  // 7) 색이 다른 그림 목록
  const ov = (await anon.rpc('sprite_overrides')).data || {};
  ok(Object.keys(ov).length >= 800 && /\|/.test(ov['1'] || ''), 'sprite list has a shiny picture for each Pokémon', [Object.keys(ov).length, ov['1']]);
  await admin.rpc('admin_delete_students', { p_student_ids: [sid], p_confirm: '삭제' });
}

console.log('\n[42] 사파리존 (0033): 풀숲 걸음 → 서버가 굴려서 만남 · 사파리볼 하루 개수 · 잡기/도망');
{
  const keys = ['safari_balls_daily', 'safari_min_steps', 'safari_encounter_rate', 'safari_steps_per_sec',
                'safari_flee', 'safari_flee_step', 'safari_flee_legend', 'safari_flee_max', 'safari_reset_hours'];
  const old = Object.fromEntries((await admin.select(`settings?key=in.(${keys.join(',')})&select=key,value`)).data.map((x) => [x.key, x.value]));
  const setS = (k, v) => admin.patch(`settings?key=eq.${k}`, { value: v });
  await setS('safari_reset_hours', 24);   // 0037: 충전 주기 — 예전 시험은 하루 (24시간)
  await setS('safari_balls_daily', 10); await setS('safari_min_steps', 8); await setS('safari_steps_per_sec', 6);
  await setS('safari_encounter_rate', 1);              // 시험: 8걸음이 지나면 바로 만남
  await setS('safari_flee', 0); await setS('safari_flee_step', 0); await setS('safari_flee_legend', 0);   // 0037: 도망은 서버가 굴림 → 아래 예전 시험 동안은 0 ([44] 에서 따로)
  let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'sf1234' })).error);
  const F = client(await pwLogin(`${sid}@code.local`, 'sf1234'));
  await F.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: '사파리' });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // 걸음 속도 제한 (초당 6걸음): 만날 때까지 (또는 이유가 나올 때까지) 0.5초마다 8걸음씩 — 최대 10초. 정해진 잠깐 쉬기 대신
  const walk = async () => {
    let a;
    for (const t0 = Date.now(); Date.now() - t0 < 10000;) {
      a = (await F.rpc('safari_encounter', { p_steps: 8 })).data;
      if (a?.encounter || a?.reason) return a;
      await wait(500);
    }
    return a;
  };
  ok((await anon.rpc('safari_state')).error, 'anon cannot call safari_state');
  ok((await anon.rpc('safari_encounter', { p_steps: 5 })).error, 'anon cannot call safari_encounter');
  const s0 = (await F.rpc('safari_state')).data;
  ok(s0?.balls_left === 10 && s0.balls_daily === 10 && s0.encounters_today === 0 && s0.pending === null && s0.settings?.min_steps === 8,
     'safari_state: 10 balls, no encounter yet', s0);
  ok((await F.rpc('safari_encounter', { p_steps: -1 })).error === 'BAD_STEPS' && (await F.rpc('safari_encounter', { p_steps: 5000 })).error === 'BAD_STEPS', 'bad step counts rejected');
  const a1 = (await F.rpc('safari_encounter', { p_steps: 5 })).data;
  ok(a1?.encounter === null && a1.accepted === 5, 'before safari_min_steps → no encounter (rate 100%)', a1);
  // 걸음 속도 제한만 보려고 이 순간엔 만남 확률 0 (네트워크가 느리면 받아들이는 걸음이 조금 늘어 8걸음을 넘을 수 있음)
  await setS('safari_encounter_rate', 0);
  const a2 = (await F.rpc('safari_encounter', { p_steps: 500 })).data;
  await setS('safari_encounter_rate', 1);
  ok(a2?.encounter === null && a2.accepted <= 20, 'claiming 500 steps right away → speed limit accepts only a few, no encounter', a2);
  ok((await F.rpc('sync')).data.state.encounters.length === 0, 'nothing appears on the home banner');
  const a3 = await walk();
  const e1 = a3?.encounter;
  ok(e1?.kind === 'safari' && e1.balls === 10 && a3.encounters_today === 1, 'enough plausible grass steps → a safari encounter with 10 balls', a3);
  const encSp = e1 && (await admin.select(`species?id=eq.${e1.species_id}&select=line_id,stage`)).data[0];
  ok(encSp?.stage === 1, 'first-stage wild Pokémon', encSp);
  const a4 = (await F.rpc('safari_encounter', { p_steps: 8 })).data;
  ok(a4?.encounter?.id === e1?.id && a4.reason === 'pending', 'while one is pending, the same encounter comes back (no second loan of balls)', a4);
  ok(!(await F.rpc('sync')).data.state.encounters.some((x) => x.kind === 'safari'), 'safari encounters stay off the home banner');
  // 잡기: 3개 던짐 → 7개 남음, 도감에 들어감
  const c1 = (await F.rpc('safari_result', { p_id: e1?.id, p_throws: 3, p_caught: true, p_grade: 'nice' })).data;
  ok(c1?.caught === true && c1.line === encSp?.line_id && c1.safari?.balls_left === 7, 'catch with 3 throws → in the collection, 7 balls left', c1);
  ok((await F.rpc('sync')).data.state.collection.some((x) => x.line_id === encSp?.line_id), 'the Pokémon is in my collection');
  const tk = c1?.nonce && (await admin.select(`tickets?nonce=eq.${c1.nonce}&select=special,qr_id,status`)).data[0];
  ok(tk?.special === 'safari' && tk.qr_id === 'SAFARI' && tk.status === 'redeemed', 'recorded as a SAFARI special ticket', tk);
  const c1b = (await F.rpc('safari_result', { p_id: e1?.id, p_throws: 1, p_caught: true })).data;   // 0038: 다시 보내면 적어 둔 결과 그대로
  ok(c1b?.replay === true && c1b.caught === true && c1b.nonce === c1?.nonce && c1b.safari?.balls_left === 7, 'an encounter is used once (re-send = the stored result, no extra balls)', c1b);
  // 0 개 던졌다고 해도 잡으면 1개는 씀
  const e2 = (await walk())?.encounter;
  ok(e2?.balls === 7, 'next encounter borrows the 7 balls left', e2);
  const c2 = (await F.rpc('safari_result', { p_id: e2?.id, p_throws: 0, p_caught: true })).data;
  ok(c2?.caught && c2.safari?.balls_left === 6, 'catching always costs at least one ball (claiming 0 throws)', c2?.safari);
  // 도망: 던진 수만큼 씀
  const e3 = (await walk())?.encounter;
  const c3 = (await F.rpc('safari_result', { p_id: e3?.id, p_throws: 2, p_caught: false })).data;
  ok(c3?.fled === true && c3.caught === false && c3.safari?.balls_left === 4, 'missing → it flees, 2 thrown balls used', c3);
  // encounter_result 를 바로 부르면 빌린 볼 모두 씀 → 0 → 오늘은 끝
  const e4 = (await walk())?.encounter;
  const c4 = (await F.rpc('encounter_result', { p_id: e4?.id, p_caught: true })).data;
  const s4 = (await F.rpc('safari_state')).data;
  ok(c4?.caught && e4?.balls === 4 && s4?.balls_left === 0, 'encounter_result without a throw count spends every borrowed ball', [e4, s4]);
  const a5 = await walk();
  ok(a5?.encounter === null && a5.reason === 'no_balls' && a5.balls_left === 0, 'daily ball cap: no balls left → no more encounters today', a5);
  // 0040: 만남 상한 없음 — 볼만 있으면 계속 만남 (이미 4번 만났어도)
  await setS('safari_balls_daily', 30);
  const a6 = await walk();
  ok(a6?.encounter && a6.reason == null && a6.balls_left === 20 && !('max_encounters' in a6), 'no encounter cap (0040): balls left → still meets Pokémon after 4 encounters', a6);
  if (a6?.encounter) await F.rpc('safari_result', { p_id: a6.encounter.id, p_throws: 1, p_caught: false });
  for (const k of keys) await setS(k, old[k]);
  await admin.rpc('admin_delete_students', { p_student_ids: [sid], p_confirm: '삭제' });
}

console.log('\n[43] PC 박스 (0036): 같은 포켓몬 여러 마리 · 진화의 돌 (중복) · 카드/팀 = 포켓몬 번호 · 놓아주기 · 옮기기 · 900 마리');
{
  const mk = async (name) => {
    let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'box123' })).error);
    const c = client(await pwLogin(`${sid}@code.local`, 'box123'));
    await c.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: name });
    return { c, sid };
  };
  const X = await mk('박스테스트');
  const st = async () => (await X.c.rpc('sync')).data.state;
  // 1) 같은 포켓몬 세 마리 = 세 줄 (따로 번호 · 칸), 도감·점수는 계열 하나
  for (let i = 0; i < 3; i++) await admin.rpc('admin_grant_monster', { p_student_id: X.sid, p_line: 7, p_stage: 1 });
  let s1 = await st();
  const sevens = s1.mons.filter((m) => m.line_id === 7);
  ok(sevens.length === 3 && new Set(sevens.map((m) => m.id)).size === 3 && sevens.map((m) => m.pos).join() === '0,1,2',
     'three of the same Pokémon → three box entries (own id, slots 1~3 of BOX 1)', sevens);
  const c7 = s1.collection.find((c) => c.line_id === 7);
  ok(c7?.count === 3 && c7.catch_count === 3 && s1.profile.dex_count === 1 && s1.rules.box_max === 900,
     'dex row: count 3, catches 3, dex counts the species once; box_max 900', { c7, dex: s1.profile.dex_count });
  const score1 = s1.profile.score;
  await admin.rpc('admin_grant_monster', { p_student_id: X.sid, p_line: 7, p_stage: 1 });
  s1 = await st();
  ok(s1.profile.score === score1 && s1.mons.length === 4, 'another duplicate does not raise the score', [score1, s1.profile.score]);
  const [m1, m2, m3, m4] = s1.mons.filter((m) => m.line_id === 7).map((m) => m.id);
  // 2) 중복 잡기 = dup_bonus_every 번째마다 진화의 돌 (예전 규칙 그대로)
  const every0 = (await admin.select('settings?key=eq.dup_bonus_every')).data?.[0]?.value ?? 3;
  await patchSetting('dup_bonus_every', 5);                      // 지금 4번 잡음 → 부스에서 5번째 = 진화의 돌
  const pool18 = (await admin.select('qr_rewards?qr_id=eq.A18&select=line_id,weight')).data;
  await fetch(`${URL_}/rest/v1/qr_rewards?qr_id=eq.A18`, { method: 'DELETE', headers: H0 });
  await fetch(`${URL_}/rest/v1/qr_rewards`, { method: 'POST', headers: H0, body: JSON.stringify([{ qr_id: 'A18', line_id: 7, weight: 1 }]) });
  await patchSetting('wild_chance', 0);
  const t0 = s1.profile.evo_tickets;
  const n5 = nonce();
  await X.c.rpc('sync', { p_scans: [{ n: n5, q: 'A18', t: T.A18.token }] });
  const r5 = (await booth.rpc('booth_redeem', { p_payload: X.sid })).data?.results?.find((x) => x.nonce === n5);
  await fetch(`${URL_}/rest/v1/qr_rewards?qr_id=eq.A18`, { method: 'DELETE', headers: H0 });
  await fetch(`${URL_}/rest/v1/qr_rewards`, { method: 'POST', headers: H0, body: JSON.stringify(pool18.map((x) => ({ qr_id: 'A18', ...x }))) });
  await patchSetting('dup_bonus_every', every0);
  s1 = await st();
  ok(r5?.is_new === false && r5.bonus_ticket === true && r5.mon_id > m4 && s1.profile.evo_tickets === t0 + 1 && s1.mons.filter((m) => m.line_id === 7).length === 5,
     'duplicate booth catch: new 5th one in the box + 진화의 돌 on the Nth catch', { r5, t: [t0, s1.profile.evo_tickets] });
  const m5 = r5?.mon_id;
  // 3) 진화 = 그 한 마리만
  await admin.rpc('admin_adjust_tickets', { p_student_id: X.sid, p_delta: 2 });
  await patchSetting('evo_prob', [0, 1, 1]);
  const ev = (await X.c.rpc('evolve', { p_mon: m2 })).data;
  await patchSetting('evo_prob', [0, 0.7, 0.35]);
  s1 = await st();
  ok(ev?.success === true && ev.mon === m2 && s1.mons.find((m) => m.id === m2)?.stage === 2 && s1.mons.find((m) => m.id === m1)?.stage === 1,
     'evolve(p_mon) evolves only that one', s1.mons.filter((m) => m.line_id === 7).map((m) => [m.id, m.stage]));
  ok(s1.collection.find((c) => c.line_id === 7)?.stage === 2, 'dex row shows the highest stage reached');
  // 4) 카드 · 배틀 팀 = 포켓몬 번호 (같은 종 두 마리도 한 팀)
  ok((await X.c.rpc('set_partner', { p_mon: m3 })).data?.partner === m3, 'card partner = one particular Pokémon');
  ok((await X.c.rpc('battle_set_team', { p_mons: [m1, m4] })).data?.ok, 'battle team may hold two of the same species');
  ok((await X.c.rpc('battle_set_team', { p_mons: [m1, m1] })).error === 'BAD_TEAM', 'but not the same one twice');
  const bt = (await X.c.rpc('battle_start_cpu', { p_mons: [m1, m4] })).data;
  ok(bt?.sides?.[0]?.mons?.map((m) => m.mon).join() === `${m1},${m4}`, 'battle state carries the Pokémon numbers', bt?.sides?.[0]?.mons?.map((m) => m.mon));
  // 5) 놓아주기 규칙
  ok((await X.c.rpc('mon_release', { p_mon: m3 })).error === 'MON_PARTNER', 'cannot release the card partner');
  ok((await X.c.rpc('mon_release', { p_mon: m1 })).error === 'MON_IN_TEAM', 'cannot release a saved battle-team member');
  await X.c.rpc('battle_forfeit', { p_id: bt?.id });
  const bt2 = (await X.c.rpc('battle_start_cpu', { p_mons: [m5] })).data;
  ok((await X.c.rpc('mon_release', { p_mon: m5 })).error === 'MON_BUSY', 'cannot release a Pokémon in an active battle');
  await X.c.rpc('battle_forfeit', { p_id: bt2?.id });
  ok((await anon.rpc('mon_release', { p_mon: m5 })).error, 'anon cannot release');
  ok((await S[0].rpc('mon_release', { p_mon: m5 })).error === 'NO_MONSTER', 'cannot release someone else\'s Pokémon');
  await admin.rpc('admin_give_item', { p_student_id: X.sid, p_item: 'cushion', p_qty: 1 });
  await X.c.rpc('bag_set_held', { p_mon: m5, p_item: 'cushion' });
  const sA = await st();
  const rel = (await X.c.rpc('mon_release', { p_mon: m5 })).data;
  const sB = await st();
  const bagB = (await X.c.rpc('bag_state')).data;
  ok(rel?.ok && rel.held_back === 'cushion' && bagB.items.find((x) => x.key === 'cushion')?.qty === 1 && !bagB.box.some((m) => m.id === m5),
     'release → gone from the box, held item back in the bag', rel);
  ok(sB.mons.length === sA.mons.length - 1 && sB.profile.dex_count === sA.profile.dex_count && sB.profile.score === sA.profile.score
     && sB.collection.find((c) => c.line_id === 7)?.catch_count === sA.collection.find((c) => c.line_id === 7)?.catch_count,
     'dex / score / catch count stay after releasing', { a: [sA.mons.length, sA.profile.dex_count, sA.profile.score], b: [sB.mons.length, sB.profile.dex_count, sB.profile.score] });
  ok((await X.c.rpc('mon_release', { p_mon: m5 })).error === 'NO_MONSTER', 'a released Pokémon cannot be released again');
  ok((await X.c.rpc('evolve', { p_mon: m5 })).error === 'NOT_OWNED' && (await X.c.rpc('battle_set_team', { p_mons: [m5] })).error === 'BAD_TEAM',
     'a released Pokémon cannot evolve or battle');
  await admin.rpc('admin_grant_monster', { p_student_id: X.sid, p_line: 8, p_stage: 1 });
  const m8 = await monId(X.c, 8);
  const d8a = (await st()).profile.dex_count;
  await X.c.rpc('mon_release', { p_mon: m8 });
  const s8 = await st();
  ok(s8.collection.find((c) => c.line_id === 8)?.count === 0 && s8.profile.dex_count === d8a,
     'releasing the only one of a species: dex keeps it as caught (count 0)', s8.collection.find((c) => c.line_id === 8));
  // 6) 옮기기 (그 칸에 있으면 서로 바꿈)
  ok((await X.c.rpc('box_move', { p_mon: m1, p_pos: 35 })).data?.pos === 35, 'move to BOX 2 slot 6');
  const sw = (await X.c.rpc('box_move', { p_mon: m4, p_pos: 35 })).data;
  const s9 = await st();
  ok(sw?.swap === m1 && s9.mons.find((m) => m.id === m4)?.pos === 35 && s9.mons.find((m) => m.id === m1)?.pos === sw.swap_pos,
     'moving onto a filled slot swaps the two', sw);
  ok((await X.c.rpc('box_move', { p_mon: m1, p_pos: 900 })).error === 'BAD_POS' && (await X.c.rpc('box_move', { p_mon: m5, p_pos: 3 })).error === 'NO_MONSTER',
     'bad slot / released Pokémon refused');
  // 7) 꽉 참: box_max (시험용으로 지금 마리 수) → 지급·부스 모두 거절, 티켓은 그대로
  const nowN = s9.mons.length;
  await patchSetting('box_max', nowN);
  try {
    ok((await X.c.rpc('sync')).data.state.rules.box_max === nowN, 'box_max setting reaches the app');
    ok((await admin.rpc('admin_grant_monster', { p_student_id: X.sid, p_line: 9, p_stage: 1 })).error === 'BOX_FULL', 'full box: admin grant refused (BOX_FULL)');
    const nf = nonce(); const qf = Object.keys(T).find((k) => /^A\d+$/.test(k) && k !== 'A18');
    await X.c.rpc('sync', { p_scans: [{ n: nf, q: qf, t: T[qf].token }] });
    const rf = (await booth.rpc('booth_redeem', { p_payload: X.sid })).data?.results?.find((x) => x.nonce === nf);
    const tf = (await st()).tickets.find((t) => t.nonce === nf);
    ok(rf?.error === 'box_full' && tf?.status === 'pending', 'full box: booth does not use the ticket (still pending)', { rf, tf });
    await patchSetting('box_max', 900);
    const rg = (await booth.rpc('booth_redeem', { p_payload: X.sid })).data?.results?.find((x) => x.nonce === nf);
    ok(rg?.species_id && rg.mon_id > 0 && (await st()).mons.length === nowN + 1, 'after making room the same ticket works', rg);
  } finally { await patchSetting('box_max', 900); }
  // 8) 마지막 한 마리
  const Y = await mk('박스한마리');
  await admin.rpc('admin_grant_monster', { p_student_id: Y.sid, p_line: 7, p_stage: 1 });
  ok((await Y.c.rpc('mon_release', { p_mon: await monId(Y.c, 7) })).error === 'LAST_MON', 'cannot release the last Pokémon');
  await admin.rpc('admin_delete_students', { p_student_ids: [X.sid, Y.sid], p_confirm: '삭제' });
}

console.log('\n[44] 갈래 진화 (0037): 이브이는 고르기 · 틀린 갈래 거절 · 돌/레벨 갈래 · 도감 수 · 사파리 도망 (서버) · 진화의 돌 이름');
{
  const mk = async (name) => {
    let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'evo123' })).error);
    const c = client(await pwLogin(`${sid}@code.local`, 'evo123'));
    await c.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: name });
    return { c, sid };
  };
  const X = await mk('갈래진화');
  const st = async () => (await X.c.rpc('sync')).data.state;
  const spOf = async (q) => (await admin.select(`species?${q}&select=id,line_id,stage,dex,name,evo_lv,evo_item`)).data || [];
  const ev = (await admin.select('evolutions?select=from_species,to_species,how,lv&limit=2000')).data || [];
  const eevee = (await spOf('dex=eq.133&id=lt.10000'))[0];
  const L = eevee?.line_id;
  const outs = ev.filter((e) => e.from_species === eevee?.id);
  ok(outs.length === 8 && outs.filter((e) => e.how === 'item').length === 5 && outs.filter((e) => e.how === 'level').every((e) => e.lv === 25),
     'evolutions: 이브이 has 8 branches (5 stone, 3 level 25)', outs);
  const br = await spOf('id=gte.10000&order=id');
  ok(br.length === 20 && br.every((x) => x.id === 10000 + x.dex), 'branch species rows: id = 10000 + national dex', br.length);
  const jolt = br.find((x) => x.dex === 135);
  ok(jolt?.line_id === L && jolt.stage === 2 && jolt.evo_item === true, '쥬피썬더 branch = 이브이 line, stage 2, stone', jolt);
  const lunala = br.find((x) => x.dex === 792);
  ok(lunala?.stage === 3 && ev.some((e) => e.to_species === lunala.id && e.lv === 53), '루나아라 = 코스모움 stage-3 branch at Lv.53 (its own legend line stays)', lunala);
  ok((await X.c.select('evolutions?select=from_species&limit=1')).data?.length === 1, 'students can read evolutions (catalog)');
  ok((await X.c.patch('evolutions?from_species=eq.1', { lv: 2 })) >= 400 || (await admin.select('evolutions?from_species=eq.1&select=lv')).data?.[0]?.lv !== 2, 'students cannot change evolutions');

  // 1) 이브이 #1: 갈래 고르기 필수 · 틀린 갈래 · 돌 진화
  await admin.rpc('admin_grant_monster', { p_student_id: X.sid, p_line: L, p_stage: 1 });
  const m1 = (await st()).mons.find((m) => m.line_id === L);
  ok(m1?.species_id === eevee.id && m1.stage === 1, 'a new 이브이 knows its species id', m1);
  await admin.rpc('admin_adjust_tickets', { p_student_id: X.sid, p_delta: -((await st()).profile.evo_tickets) });
  ok((await X.c.rpc('evolve', { p_mon: m1.id })).error === 'PICK_BRANCH', '이브이 without p_to → PICK_BRANCH (must choose)');
  ok((await X.c.rpc('evolve', { p_mon: m1.id, p_to: 2 })).error === 'BAD_BRANCH', 'a species that is not one of its branches → BAD_BRANCH');
  ok((await X.c.rpc('evolve', { p_mon: m1.id, p_to: 10475 })).error === 'BAD_BRANCH', "another line's branch (엘레이드) → BAD_BRANCH");
  ok((await X.c.rpc('evolve', { p_mon: m1.id, p_to: jolt.id })).error === 'NO_TICKET', 'stone branch without a 진화의 돌 → NO_TICKET');
  await admin.rpc('admin_adjust_tickets', { p_student_id: X.sid, p_delta: 2 });
  const r1 = (await X.c.rpc('evolve', { p_mon: m1.id, p_to: jolt.id })).data;
  ok(r1?.success === true && r1.by_item === true && r1.species_id === jolt.id && r1.stage === 2 && r1.evo_tickets === 1,
     'stone branch: 1 진화의 돌 → 100% 쥬피썬더 (species 10135, stage 2)', r1);
  let s1 = await st();
  const m1b = s1.mons.find((m) => m.id === m1.id);
  ok(m1b?.species_id === jolt.id && m1b.stage === 2, 'sync: that mon is now 쥬피썬더', m1b);
  ok(s1.seen?.includes(eevee.id) && s1.seen.includes(jolt.id) && s1.profile.dex_count === 2, 'seen = 이브이 + 쥬피썬더, dex_count 2', { seen: s1.seen, dex: s1.profile.dex_count });
  ok((await X.c.rpc('evolve', { p_mon: m1.id, p_to: jolt.id })).error === 'MAX_STAGE', '쥬피썬더 cannot evolve further');
  const bag1 = (await X.c.rpc('bag_state')).data;
  const bx1 = bag1?.box?.find((m) => m.id === m1.id);
  const smJ = ((await admin.select(`species_moves?species_id=eq.${jolt.id}&select=move_id&order=slot`)).data || []).map((x) => x.move_id);
  ok(bx1?.species_id === jolt.id && smJ.length === 4 && smJ.every((x) => bx1.known.includes(x)), "bag: 쥬피썬더's own 4 moves are known", { bx1, smJ });
  const team = (await X.c.rpc('battle_set_team', { p_mons: [m1.id] }));
  ok(!team.error, 'a branch Pokémon can be in the battle team', team);

  // 2) 이브이 #2: 레벨 갈래 (에브이 Lv.25) — 돌 없이 100%
  await admin.rpc('admin_grant_monster', { p_student_id: X.sid, p_line: L, p_stage: 1 });
  const m2 = (await st()).mons.find((m) => m.line_id === L && m.stage === 1);
  await admin.rpc('admin_set_level', { p_student_id: X.sid, p_line: L, p_level: 25 });
  const r2 = (await X.c.rpc('evolve', { p_mon: m2.id, p_to: 10196 })).data;
  ok(r2?.success && r2.by_level === true && r2.species_id === 10196 && r2.evo_tickets === 1, 'level branch at Lv.25: 에브이, no 진화의 돌 used', r2);

  // 3) 이브이 #3: 레벨 갈래를 일찍 (Lv.5) = 진화의 돌 + 확률 (시험 동안 100%)
  const EP = (await admin.select('settings?key=eq.evo_prob&select=value')).data?.[0]?.value ?? [0, 0.7, 0.35];
  await admin.rpc('admin_grant_monster', { p_student_id: X.sid, p_line: L, p_stage: 1 });
  const m3 = (await st()).mons.find((m) => m.line_id === L && m.stage === 1);
  await patchSetting('evo_prob', [0, 1, 1]);
  let r3;
  try { r3 = (await X.c.rpc('evolve', { p_mon: m3.id, p_to: 10197 })).data; } finally { await patchSetting('evo_prob', EP); }
  ok(r3?.success && r3.by_level === false && r3.by_item === false && r3.species_id === 10197 && r3.evo_tickets === 0,
     'early level branch (Lv.5 → 블래키): uses a 진화의 돌 (probability)', r3);
  s1 = await st();
  ok(s1.profile.dex_count === 4, 'dex counts 이브이 once + 쥬피썬더 + 에브이 + 블래키 = 4', s1.profile.dex_count);
  ok(s1.collection.find((c) => c.line_id === L)?.count === 3, 'collection row: 3 Pokémon in the 이브이 line', s1.collection.find((c) => c.line_id === L));

  // 4) 같은 전국도감 번호 = 한 칸: 따로 있는 야생 쥬피썬더 계열을 잡아도 도감 수는 그대로
  const joltWild = (await spOf('dex=eq.135&id=lt.10000'))[0];
  await admin.rpc('admin_grant_monster', { p_student_id: X.sid, p_line: joltWild.line_id, p_stage: 1 });
  s1 = await st();
  ok(joltWild.line_id !== L && s1.profile.dex_count === 4 && s1.seen.includes(joltWild.id), 'catching the standalone 쥬피썬더 line: same dex number → dex_count stays 4', { dex: s1.profile.dex_count });

  // 5) 한 갈래뿐이면 p_to 없이 · 3단계 갈래 (개무소 → 카스쿤 → 독케일)
  const kakuna = (await spOf('dex=eq.268&id=gte.10000'))[0];
  const wurm = (await spOf(`line_id=eq.${kakuna.line_id}&stage=eq.1`))[0];
  await admin.rpc('admin_grant_monster', { p_student_id: X.sid, p_line: wurm.line_id, p_stage: 1 });
  await admin.rpc('admin_set_level', { p_student_id: X.sid, p_line: wurm.line_id, p_level: 10 });
  const mw = (await st()).mons.find((m) => m.line_id === wurm.line_id);
  ok((await X.c.rpc('evolve', { p_mon: mw.id })).error === 'PICK_BRANCH', '개무소 (실쿤 / 카스쿤) → PICK_BRANCH');
  const rw = (await X.c.rpc('evolve', { p_mon: mw.id, p_to: kakuna.id })).data;
  ok(rw?.success && rw.by_level && rw.species_id === kakuna.id, '개무소 Lv.10 → 카스쿤 (level branch)', rw);
  const rw2 = (await X.c.rpc('evolve', { p_mon: mw.id })).data;
  ok(rw2?.success && rw2.by_level && rw2.species_id === 10269 && rw2.stage === 3, '카스쿤 has one way → evolve without p_to → 독케일 (stage 3)', rw2);
  ok(((await st()).seen || []).filter((x) => [wurm.id, kakuna.id, 10269].includes(x)).length === 3, 'seen keeps the whole branch path (개무소 · 카스쿤 · 독케일)');
  // 곧은 계열은 예전처럼 p_to 없이
  const one = (await spOf('id=eq.1'))[0];
  await admin.rpc('admin_grant_monster', { p_student_id: X.sid, p_line: one.line_id, p_stage: 1 });
  await admin.rpc('admin_set_level', { p_student_id: X.sid, p_line: one.line_id, p_level: 50 });
  const r5 = (await X.c.rpc('evolve', { p_mon: (await st()).mons.find((m) => m.line_id === one.line_id).id })).data;
  ok(r5?.success && r5.species_id === 2, 'a single-path line still evolves without p_to', r5);

  // 6) 학교 도감: 선생님 계열의 갈래 종 (냄새꼬 → 아르코) 도 학교 도감 칸
  const bell = (await spOf('dex=eq.182&id=gte.10000'))[0];
  const bellLine = (await admin.select(`lines?id=eq.${bell?.line_id}&select=subject`)).data?.[0];
  ok(bell?.stage === 3 && bellLine?.subject && bellLine.subject !== '야생', '아르코 is a stage-3 branch of a teacher line (counts in the school dex)', { bell, bellLine });

  // 7) 사파리존 도망 (서버): 25% + 놓칠 때마다 +5% (전설 +15%), safari_turn · safari_result
  const keys = ['safari_balls_daily', 'safari_min_steps', 'safari_encounter_rate', 'safari_steps_per_sec',
                'safari_flee', 'safari_flee_step', 'safari_flee_legend', 'safari_flee_max', 'safari_reset_hours'];
  const old = Object.fromEntries((await admin.select(`settings?key=in.(${keys.join(',')})&select=key,value`)).data.map((x) => [x.key, x.value]));
  ok(Number(old.safari_balls_daily) === 20 && Number(old.safari_reset_hours) === 0.5, 'safari ball defaults: 20 balls, refill every 30 min (0040)', old);
  ok(Number(old.safari_flee) === 0.25 && Number(old.safari_flee_step) === 0.05 && Number(old.safari_flee_legend) === 0.15 && Number(old.safari_flee_max) === 0.9,
     'flee settings: 25% base, +5% per turn, +15% legend, max 90%', old);
  const setS = (k, v) => admin.patch(`settings?key=eq.${k}`, { value: v });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const walk = async () => {
    for (const t0 = Date.now(); Date.now() - t0 < 10000;) {
      const a = (await X.c.rpc('safari_encounter', { p_steps: 8 })).data;
      if (a?.encounter || a?.reason) return a;
      await wait(500);
    }
    return null;
  };
  try {
    await setS('safari_balls_daily', 30); await setS('safari_min_steps', 0); await setS('safari_encounter_rate', 1);
    await setS('safari_steps_per_sec', 6); await setS('safari_reset_hours', 24);   // 0040: 기본은 30분 → 아래 예전 시험은 24시간으로
    // 첫 차례 0% (전설 더하기도 0) → 반드시 남음. 그다음 차례의 확률은 굴리지 않고 safari_state 로만 봄 (결정적)
    await setS('safari_flee', 0); await setS('safari_flee_step', 0.05); await setS('safari_flee_legend', 0); await setS('safari_flee_max', 0.9);
    const e1 = (await walk())?.encounter;
    ok(e1?.turns === 0 && e1.flee_now === 0, 'pending safari encounter shows turns 0 and the flee chance now', e1);
    const t1 = (await X.c.rpc('safari_turn', { p_id: e1?.id })).data;
    ok(t1?.fled === false && t1.turn === 1 && t1.rate === 0 && Math.abs(t1.next_rate - 0.05) < 1e-9, 'safari_turn: 0% → stays; next miss +5%', t1);
    const p1 = (await X.c.rpc('safari_state')).data?.pending;
    ok(p1?.turns === 1 && Math.abs(p1.flee_now - 0.05) < 1e-9, 'the chance rises each turn the Pokémon stays (0% → 5%)', p1);
    await setS('safari_flee_legend', 0.15);
    const leg = (await admin.select(`species?id=eq.${e1?.species_id}&select=lines(rarity)`)).data?.[0]?.lines?.rarity === 'legendary';
    ok(Math.abs(((await X.c.rpc('safari_state')).data?.pending?.flee_now ?? -1) - (leg ? 0.2 : 0.05)) < 1e-9, 'legend bonus only for legendary lines', leg);
    ok((await anon.rpc('safari_turn', { p_id: e1?.id })).error, 'anon cannot call safari_turn');
    ok((await S[0].rpc('safari_turn', { p_id: e1?.id })).error === 'NOT_FOUND', "cannot roll someone else's encounter");
    await setS('safari_flee_max', 0.03);
    ok(Math.abs(((await X.c.rpc('safari_state')).data?.pending?.flee_now ?? -1) - 0.03) < 1e-9, 'capped at safari_flee_max');
    // 서버가 도망을 정함: 100% 로 두면 safari_turn 에서 도망 → 그 만남은 끝, 결과를 다시 보내도 도망
    await setS('safari_flee_max', 1); await setS('safari_flee', 1);
    const t3 = (await X.c.rpc('safari_turn', { p_id: e1?.id })).data;
    ok(t3?.fled === true && t3.caught === false && t3.safari?.balls_left === 28, 'flee 100%: safari_turn → it fled, 2 missed balls used', t3);
    const t3b = (await X.c.rpc('safari_result', { p_id: e1?.id, p_throws: 4, p_caught: true })).data;
    ok(t3b?.fled === true && t3b.caught === false && t3b.safari?.balls_left === 28, 'claiming a catch after it fled → still fled (no extra balls)', t3b);
    ok((await X.c.rpc('safari_turn', { p_id: e1?.id })).error === 'NOT_FOUND', 'a finished encounter cannot roll again');
    // 앱이 safari_turn 을 건너뛰고 '3번째 공으로 잡음' 이라고 보내도, 놓친 2개의 도망 판정은 서버가 굴림
    const e2 = (await walk())?.encounter;
    const c2 = (await X.c.rpc('safari_result', { p_id: e2?.id, p_throws: 3, p_caught: true })).data;
    ok(c2?.caught === false && c2.fled === true && c2.server_fled === true && c2.safari?.balls_left === 27,
       'skipping safari_turn does not help: the server rolls the missed balls (flees after the 1st miss)', c2);
    // 첫 공에 잡으면 놓친 공이 없으니 도망 판정 없음
    const e3 = (await walk())?.encounter;
    const c3 = (await X.c.rpc('safari_result', { p_id: e3?.id, p_throws: 1, p_caught: true })).data;
    ok(c3?.caught === true && c3.server_fled === false && c3.safari?.balls_left === 26, 'caught with the first ball → no flee roll', c3);
    // 0% 면 놓친 공이 있어도 잡힘
    await setS('safari_flee', 0); await setS('safari_flee_step', 0); await setS('safari_flee_legend', 0);
    const e4 = (await walk())?.encounter;
    const c4 = (await X.c.rpc('safari_result', { p_id: e4?.id, p_throws: 5, p_caught: true })).data;
    ok(c4?.caught === true && c4.server_fled === false && c4.safari?.balls_left === 21, 'flee 0%: missed balls never flee', c4);

    // 사파리볼 충전 주기 (서울 00:00 부터 safari_reset_hours 마다)
    const seoulH = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }));
    const z0 = (await X.c.rpc('safari_state')).data;
    ok(z0?.reset_hours === 24 && z0.balls === 21 && z0.max_balls === 30 && z0.balls === z0.balls_left
       && new Date(z0.next_reset_at) - new Date(z0.period_start) === 24 * 3600e3, 'safari_state: balls · max_balls · next_reset_at (24 h = next 00:00)', z0);
    await setS('safari_reset_hours', 6);
    const z6 = (await X.c.rpc('safari_state')).data;
    const st6 = Math.floor(seoulH / 6) * 6;
    const hOf = (iso) => Number(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }));
    ok(z6?.reset_hours === 6 && hOf(z6.period_start) === st6 && hOf(z6.next_reset_at) === (st6 + 6) % 24
       && new Date(z6.next_reset_at) - new Date(z6.period_start) === 6 * 3600e3, `6 h: period ${st6}:00 → next refill ${(st6 + 6) % 24}:00 (Seoul)`, z6);
    ok(st6 === 0 ? z6.balls === 21 : z6.balls === 30, st6 === 0 ? 'same 00:00 period → same balls' : 'a new 6 h period → balls refilled to the max', z6?.balls);
    const e5 = (await walk())?.encounter;
    const c5 = (await X.c.rpc('safari_result', { p_id: e5?.id, p_throws: 2, p_caught: true })).data;
    ok(c5?.caught && c5.safari?.balls === (st6 === 0 ? 19 : 28), 'balls used in this period come out of this period', c5?.safari);
    await setS('safari_reset_hours', 24);
    const z24 = (await X.c.rpc('safari_state')).data;
    ok(z24?.balls === (st6 === 0 ? 19 : 21), "back to 24 h: today's (00:00) period kept its own count", z24?.balls);
    await setS('safari_reset_hours', 1);
    const z1 = (await X.c.rpc('safari_state')).data;
    ok(hOf(z1?.period_start) === seoulH && new Date(z1.next_reset_at) - new Date(z1.period_start) === 3600e3, '1 h: refills every hour on the hour', z1);
    await setS('safari_reset_hours', 99);
    ok((await X.c.rpc('safari_state')).data?.reset_hours === 24, 'reset hours are clamped to at most 24');
  } finally {
    for (const k of keys) await setS(k, old[k]);
  }

  // 8) 이름 '진화의 돌' (붙여 쓴 옛 이름이 서버 자료에 없음)
  const oldName = (await admin.select(`items?select=key&name=like.*${encodeURIComponent('진화의돌')}*`)).data;
  ok(Array.isArray(oldName) && oldName.length === 0, "no item is called '진화의돌' (renamed to 진화의 돌)", oldName);
  await admin.rpc('admin_delete_students', { p_student_ids: [X.sid], p_confirm: '삭제' });
}

console.log('\n[45] 전설 (0038): 알림 · 퀘스트 · 방랑 전설 · 이상한 소포 · 울트라비스트 구역 · 메타몽 · 사파리 정리/같은 결과');
{
  const mk = async (name) => {
    let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'lg1234' })).error);
    const c = client(await pwLogin(`${sid}@code.local`, 'lg1234'));
    await c.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: name });
    return { c, sid };
  };
  const L = await mk('전설테스트');
  const M = await mk('소포테스트');
  const st = async (c = L.c) => (await c.rpc('sync')).data.state;
  const keys = ['safari_balls_daily', 'safari_min_steps', 'safari_encounter_rate', 'safari_steps_per_sec',
                'safari_flee', 'safari_flee_step', 'safari_flee_legend', 'safari_flee_max', 'safari_reset_hours',
                'legend_quests', 'roam_chance', 'legend_daily_tries', 'legend_balls', 'gift_fail_limit', 'ditto_disguise_chance', 'wild_chance', 'self_redeem'];
  const old = Object.fromEntries((await admin.select(`settings?key=in.(${keys.join(',')})&select=key,value`)).data.map((x) => [x.key, x.value]));
  const setS = (k, v) => admin.patch(`settings?key=eq.${k}`, { value: v });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const gifts = [];
  const mkGift = async (o) => {
    const r = await admin.rpc('admin_create_gift', { p_code: null, p_title: null, p_dex: null, p_item: null, p_qty: 1, p_starts: null, p_ends: null, p_max: null, ...o });
    if (r.data?.id) gifts.push(r.data.id);
    return r;
  };
  const uidOf = async (sid) => (await admin.select(`profiles?student_id=eq.${sid}&select=user_id`)).data?.[0]?.user_id;
  try {
    ok(Number(old.ditto_disguise_chance) === 0 && Number(old.roam_chance) === 0 && Number(ROAM0) === 0.3 && Number(old.legend_daily_tries) === 3 && Number(old.legend_balls) === 10
       && Array.isArray(old.legend_quests) && old.legend_quests.length === 14, 'settings: ditto · roam (0 during the suite), roam default 30%, legend 3 tries · 10 balls, 14 quests', old);
    ok(Number(DITTO0) === 0.005, 'ditto_disguise_chance default 0.5% (user choice)', DITTO0);
    // ── 0. 야생 무리: 퀘스트 · 사파리 · 방랑 · 소포 전설과 울트라비스트는 빠짐 ──
    const ln = (await admin.select('lines?select=id,ultra,legend_src&or=(ultra.eq.true,legend_src.not.is.null)')).data;
    const src = Object.fromEntries(['quest', 'safari', 'roam', 'gift'].map((k) => [k, ln.filter((x) => x.legend_src === k).length]));
    ok(ln.filter((x) => x.ultra).length === 10 && src.quest === 5 && src.safari === 9 && src.roam === 3 && src.gift === 13,
       'lines flagged: 10 Ultra Beasts, 5 quest, 9 safari, 3 roaming, 13 gift-only mythics', src);

    // ── A. 알림 ──
    await L.c.rpc('claim_egg', { p_key: 'card' });
    let s1 = await st();
    const nEgg = s1.notices.find((n) => n.kind === 'egg');
    ok(nEgg?.title && nEgg.body.includes('부스') && nEgg.data?.pending === true && nEgg.species_id, 'easter-egg ticket → a notice that says where to redeem it', s1.notices);
    ok((await anon.rpc('notice_seen', { p_ids: [nEgg?.id ?? 0] })).error, 'anon cannot call notice_seen');
    ok((await M.c.rpc('notice_seen', { p_ids: [nEgg?.id ?? 0] })).data?.seen === 0, "cannot mark someone else's notice as seen");
    ok((await L.c.rpc('notice_seen', { p_ids: [nEgg?.id ?? 0] })).data?.seen === 1 && !(await st()).notices.some((n) => n.id === nEgg?.id),
       'notice_seen → it is no longer in the sync payload (never replayed)');
    ok((await L.c.rpc('notice_seen', { p_ids: [nEgg?.id ?? 0] })).data?.seen === 0, 'marking it again does nothing');

    // ── B. 퀘스트 ──
    const row = (s, dex) => s.legends.find((x) => x.dex === dex);
    s1 = await st();
    ok(s1.legends.length === 14 && row(s1, 480)?.prog === '퀴즈 연속 정답 0/10' && row(s1, 480).ok === false && row(s1, 480).reward === 'ticket',
       'quest rows in sync: 유크시 quiz streak 0/10', row(s1, 480));
    ok(row(s1, 481)?.prog === '배틀 승리 0/10' && row(s1, 483)?.prog === '참가한 시간대 0/3' && row(s1, 484)?.need >= 20 && row(s1, 484).cur === 0,
       'battle wins 0/10 · raid time slots 0/3 · every visible QR spot (0/N)', [row(s1, 481), row(s1, 483), row(s1, 484)]);
    const spots = (await admin.select('qr_points?select=id&kind=eq.static&visible_on_map=eq.true&active=eq.true&order=id')).data.map((x) => x.id);
    await L.c.rpc('sync', { p_scans: [{ n: nonce(), q: spots[0], t: T[spots[0]].token }] });
    ok(row(await st(), 484)?.cur === 1, 'a scanned QR spot counts toward 펄기아');
    for (let i = 0; i < 2; i++) await admin.rpc('admin_grant_monster', { p_student_id: L.sid, p_line: 7, p_stage: 1 });
    s1 = await st();
    ok(row(s1, 482)?.cur === 2 && row(s1, 482).ok === false && row(s1, 482).cond.includes('30마리'), 'catches quest counts caught Pokémon (2/30)', row(s1, 482));
    const Q = structuredClone(old.legend_quests);
    Q.find((q) => q.dex === 482).n = 2; Q.find((q) => q.dex === 481).n = 0;
    await setS('legend_quests', Q);
    s1 = await st();
    const agn = row(s1, 482);
    ok(agn?.done && agn.ok && agn.granted && s1.special.filter((t) => t.special === 'quest' && t.species_id === agn.species_id).length === 1,
       'condition met → 아그놈 special quest ticket (in the ticket bag)', agn);
    ok(s1.notices.some((n) => n.kind === 'quest' && n.species_id === agn?.species_id) && row(s1, 481)?.done,
       'quest notice (fanfare) · 0-win quest done right away', s1.notices.map((n) => n.kind));
    s1 = await st();
    ok(s1.special.filter((t) => t.special === 'quest').length === 2, 'quest tickets are granted once each (no repeats on later syncs)', s1.special);
    Q.find((q) => q.dex === 482).n = 30; await setS('legend_quests', Q);
    ok(row(await st(), 482)?.ok === true, 'a finished quest stays finished even if the number goes up later');
    const water = (await admin.select(`lines?select=id&subject=eq.${encodeURIComponent('야생')}&rarity=eq.common&ultra=eq.false&legend_src=is.null&btype=eq.${encodeURIComponent('물')}&order=id&limit=1`)).data?.[0]?.id;
    await admin.rpc('admin_grant_monster', { p_student_id: L.sid, p_line: water, p_stage: 1 });
    ok(row(await st(), 249)?.prog === '물 타입 1/20', 'type quest counts caught water types (루기아 1/20)', row(await st(), 249));
    const regiLines = (await admin.select('species?select=line_id,dex&dex=in.(377,378,379)&stage=eq.1')).data.map((x) => x.line_id);
    s1 = await st();
    ok(row(s1, 486)?.ok === false && row(s1, 486).cond.includes('레지락·레지아이스·레지스틸을 모두'), '레지기가스: not ready, condition text names the trio', row(s1, 486));
    ok((await L.c.rpc('legend_encounter', { p_dex: 486 })).error === 'NOT_READY', 'legend_encounter refuses before the condition is met');
    ok((await L.c.rpc('legend_encounter', { p_dex: 480 })).error === 'BAD_LEGEND', 'non-map quest legends cannot be met in the Safari');
    ok((await anon.rpc('legend_encounter', { p_dex: 486 })).error, 'anon cannot call legend_encounter');
    for (const l of regiLines) await admin.rpc('admin_grant_monster', { p_student_id: L.sid, p_line: l, p_stage: 1 });
    s1 = await st();
    ok(row(s1, 486)?.ok && row(s1, 486).prog === '잡은 전설 3/3' && row(s1, 377)?.caught, 'all three Regi caught → 레지기가스 ready (3/3)', row(s1, 486));
    ok(s1.notices.some((n) => n.kind === 'legend_ready' && n.data?.dex === 486), "'깨어났다' notice for a map legend that became ready", s1.notices.map((n) => n.kind));
    const ss = (await L.c.rpc('safari_state')).data;
    ok(ss?.legends?.find((x) => x.dex === 486)?.ok === true, 'safari_state carries the legend rows (keeper NPC uses real state)');
    await setS('legend_daily_tries', 2); await setS('legend_balls', 7);
    const le1 = (await L.c.rpc('legend_encounter', { p_dex: 486 })).data;
    ok(le1?.encounter?.kind === 'legend' && le1.encounter.balls === 7 && le1.tries_left === 1, 'legend_encounter → pending legend encounter with legend_balls', le1);
    ok((await L.c.rpc('legend_encounter', { p_dex: 486 })).data?.encounter?.id === le1?.encounter?.id, 'calling again resumes the same encounter');
    ok(!(await st()).encounters.some((e) => e.kind === 'legend'), 'legend encounters stay off the home banner');
    const lr1 = (await L.c.rpc('legend_result', { p_id: le1?.encounter?.id, p_caught: false })).data;
    ok(lr1?.fled === true && lr1.caught === false, 'legend flees (all balls missed)', lr1);
    const lr1b = (await L.c.rpc('legend_result', { p_id: le1?.encounter?.id, p_caught: true })).data;
    ok(lr1b?.replay === true && lr1b.fled === true && lr1b.caught === false, 'legend_result is idempotent: re-send returns the stored outcome', lr1b);
    const le2 = (await L.c.rpc('legend_encounter', { p_dex: 486 })).data;
    ok(le2?.encounter?.id && le2.encounter.id !== le1?.encounter?.id && le2.tries_left === 0, 'after fleeing it can be challenged again (stays on the map)', le2);
    const lr2 = (await L.c.rpc('legend_result', { p_id: le2?.encounter?.id, p_caught: false })).data;
    ok((await L.c.rpc('legend_encounter', { p_dex: 486 })).error === 'NO_TRIES' && lr2?.fled, 'per-day attempts (legend_daily_tries)');
    await setS('legend_daily_tries', 5);
    const le3 = (await L.c.rpc('legend_encounter', { p_dex: 486 })).data;
    const lr3 = (await L.c.rpc('legend_result', { p_id: le3?.encounter?.id, p_caught: true, p_grade: 'great' })).data;
    const giga = row(await st(), 486);
    ok(lr3?.caught === true && lr3.ditto === false && giga?.caught, 'caught → 레지기가스 in the collection (never a Ditto)', lr3);
    ok((await st()).notices.some((n) => n.kind === 'legend' && n.species_id === giga?.species_id), 'legend catch notice');
    ok((await L.c.rpc('legend_encounter', { p_dex: 486 })).error === 'ALREADY_CAUGHT', 'one catch per account');

    // ── C. 방랑 전설 ──
    ok((await L.c.rpc('admin_roam_spots', {})).error === 'NOT_ADMIN', 'students cannot see where the roamers are');
    const at = new Date().toISOString();
    const r1 = (await admin.rpc('admin_roam_spots', { p_at: at })).data, r2 = (await admin.rpc('admin_roam_spots', { p_at: at })).data;
    ok(r1?.length === 3 && JSON.stringify(r1) === JSON.stringify(r2) && r1.every((x) => spots.includes(x.qr)), 'roamer hour assignment is deterministic and on a visible QR spot', r1);
    const hrs = [];
    for (let k = 0; k < 12; k++) hrs.push((await admin.rpc('admin_roam_spots', { p_at: new Date(Date.parse(at) + k * 3600e3).toISOString() })).data?.[0]?.qr);
    const same = (await admin.rpc('admin_roam_spots', { p_at: new Date(Math.floor(Date.parse(at) / 3600e3) * 3600e3 + 59 * 60e3).toISOString() })).data;
    ok(new Set(hrs).size >= 3 && same?.[0]?.qr === r1[0].qr, 'it moves between hours, stays put within an hour', hrs);
    const rum = (await st()).roamers;
    ok(rum?.length === 3 && rum.every((x) => x.rumour && !x.rumour.includes(r1.find((y) => y.dex === x.dex).qr_name)), 'rumours hint the area, not the exact spot', rum);
    await setS('roam_chance', 1);
    const raiko = r1.find((x) => x.dex === 243);
    await L.c.rpc('sync', { p_scans: [{ n: nonce(), q: raiko.qr, t: T[raiko.qr].token }] });
    s1 = await st();
    const rq = s1.encounters.find((e) => e.kind === 'roam' && e.species_id === rum.find((x) => x.dex === 243).species_id);
    ok(!!rq && rq.balls >= 1, 'scanning the roamer QR during its hour → a roaming encounter on the home banner', s1.encounters);
    const rc = (await L.c.rpc('encounter_result', { p_id: rq?.id, p_caught: true, p_grade: 'nice' })).data;
    s1 = await st();
    ok(rc?.caught && s1.roamers.find((x) => x.dex === 243)?.caught && s1.notices.some((n) => n.kind === 'roam'), 'caught 라이코 → marked caught + notice', rc);
    await setS('roam_chance', 0);
    await M.c.rpc('sync', { p_scans: [{ n: nonce(), q: raiko.qr, t: T[raiko.qr].token }] });
    ok(!(await st(M.c)).encounters.some((e) => e.kind === 'roam'), 'roam_chance 0 → no encounter');

    // ── D. 이상한 소포 ──
    const tag = Math.random().toString(36).slice(2, 7);
    const code = `Gift 테스트 ${tag}`;
    ok((await L.c.rpc('admin_create_gift', { p_code: code, p_title: 'x', p_dex: 385, p_item: null, p_qty: 1, p_starts: null, p_ends: null, p_max: 1 })).error === 'NOT_ADMIN', 'students cannot create gifts');
    const g1 = (await mkGift({ p_code: code, p_title: '시험 소포', p_dex: 385, p_max: 1 })).data;
    ok(g1?.code === `gift테스트${tag}` && g1.species_id, 'admin_create_gift (code stored without spaces, lower case)', g1);
    ok((await mkGift({ p_code: code, p_dex: 385 })).error === 'GIFT_EXISTS', 'duplicate code rejected');
    ok((await mkGift({ p_code: `x${tag}`, p_dex: 385, p_item: 'candy' })).error === 'BAD_GIFT_REWARD', 'Pokémon OR item, not both');
    ok((await st()).gifts_open >= 1, 'students see that a gift is claimable (count only)');
    const c1 = (await L.c.rpc('gift_claim', { p_code: `  GIFT테스트 ${tag.toUpperCase()} ` })).data;
    ok(c1?.ok && c1.species_id === g1?.species_id && c1.mon, 'case/space-insensitive Korean code → 지라치 in the box', c1);
    s1 = await st();
    ok(s1.notices.some((n) => n.kind === 'gift' && n.species_id === g1?.species_id && n.body.includes('박스')), 'gift notice (went straight to the box)', s1.notices);
    ok((await L.c.rpc('gift_claim', { p_code: code })).data?.error === 'GIFT_CLAIMED', 'one per account');
    ok((await M.c.rpc('gift_claim', { p_code: code })).data?.error === 'GIFT_GONE', 'max claims reached');
    const past = new Date(Date.now() - 3600e3).toISOString(), soon = new Date(Date.now() + 3600e3).toISOString();
    await mkGift({ p_code: `old${tag}`, p_dex: 386, p_ends: past });
    await mkGift({ p_code: `new${tag}`, p_dex: 386, p_starts: soon });
    ok((await M.c.rpc('gift_claim', { p_code: `old${tag}` })).data?.error === 'GIFT_EXPIRED', 'expired gift');
    ok((await M.c.rpc('gift_claim', { p_code: `new${tag}` })).data?.error === 'GIFT_NOT_YET', 'not-yet-started gift');
    const candyGift = (await mkGift({ p_code: `사탕${tag}`, p_item: 'candy', p_qty: 2 })).data;
    const qty = async () => ((await M.c.rpc('bag_state', {})).data?.items || []).find((x) => x.key === 'candy')?.qty || 0;
    const before = await qty();
    const c2 = (await M.c.rpc('gift_claim', { p_code: `사탕 ${tag}` })).data;
    const after = await qty();
    ok(c2?.ok && c2.item === 'candy' && after - before === 2 && (await st(M.c)).notices.some((n) => n.kind === 'gift'), 'item gift → inventory +2 and a notice', [c2, before, after]);
    await mkGift({ p_code: `돌${tag}`, p_item: 'evo_stone', p_qty: 1 });
    const ev0 = (await st(M.c)).profile.evo_tickets;
    const c3 = (await M.c.rpc('gift_claim', { p_code: `돌${tag}` })).data;
    ok(c3?.ok && c3.evo_tickets === ev0 + 1, '진화의 돌 gift', [ev0, c3]);
    const lst = (await admin.rpc('admin_list_gifts')).data;
    ok(lst?.find((g) => g.id === g1?.id)?.claims === 1, 'admin_list_gifts shows claim counts');
    await admin.rpc('admin_set_gift', { p_id: candyGift?.id, p_active: false });
    ok((await L.c.rpc('gift_claim', { p_code: `사탕${tag}` })).data?.error === 'GIFT_EXPIRED', 'disabled gift cannot be claimed');
    await setS('gift_fail_limit', 3);
    for (let i = 0; i < 3; i++) ok((await M.c.rpc('gift_claim', { p_code: `wrong${tag}${i}` })).data?.error === 'BAD_GIFT', `wrong code → BAD_GIFT (${i + 1})`);
    await mkGift({ p_code: `right${tag}`, p_item: 'candy', p_qty: 1 });
    ok((await M.c.rpc('gift_claim', { p_code: `right${tag}` })).data?.error === 'TRY_LATER', 'rate limit: too many wrong codes → TRY_LATER even for a right code');
    ok((await anon.rpc('gift_claim', { p_code: code })).error, 'anon cannot claim gifts');

    // ── E · F · G. 사파리: 구역 · 메타몽 · 정리 · 같은 결과 ──
    await setS('safari_reset_hours', 24); await setS('safari_balls_daily', 100); await setS('safari_min_steps', 0); await setS('safari_encounter_rate', 1);
    await setS('safari_steps_per_sec', 6);
    await setS('safari_flee', 0); await setS('safari_flee_step', 0); await setS('safari_flee_legend', 0);
    const walk = async (zone) => {
      for (const t0 = Date.now(); Date.now() - t0 < 10000;) {
        const a = (await M.c.rpc('safari_encounter', { p_steps: 8, p_zone: zone })).data;
        if (a?.encounter || a?.reason) return a;
        await wait(500);
      }
      return null;
    };
    const ub = new Set((await admin.select('lines?select=id&ultra=eq.true')).data.map((x) => x.id));
    const lineOfSp = async (sp) => (await admin.select(`species?id=eq.${sp}&select=line_id`)).data?.[0]?.line_id;
    const ultra = [], grass = [];
    for (let i = 0; i < 3; i++) {
      const a = await walk('ultra'); ultra.push([a?.zone, await lineOfSp(a?.encounter?.species_id)]);
      await M.c.rpc('safari_result', { p_id: a?.encounter?.id, p_throws: 1, p_caught: false });
    }
    for (const z of ['grass', 'cave', 'deep', 'bogus', 'grass']) {
      const a = await walk(z); grass.push([a?.zone, await lineOfSp(a?.encounter?.species_id)]);
      await M.c.rpc('safari_result', { p_id: a?.encounter?.id, p_throws: 1, p_caught: false });
    }
    ok(ultra.every(([z, l]) => z === 'ultra' && ub.has(l)), "zone 'ultra' → only Ultra Beasts", ultra);
    ok(grass.every(([, l]) => l && !ub.has(l)) && grass[3][0] === 'grass' && grass[1][0] === 'cave', 'grass · cave · deep never give Ultra Beasts; unknown zone = grass', grass);
    await setS('ditto_disguise_chance', 1);
    const d1 = (await walk('grass'))?.encounter;
    const dc = (await M.c.rpc('safari_result', { p_id: d1?.id, p_throws: 1, p_caught: true })).data;
    const dittoSp = (await admin.select('species?dex=eq.132&select=id')).data?.[0]?.id;
    ok(dc?.caught && dc.ditto === true && dc.species_id === dittoSp && dc.disguised_as === d1?.species_id, 'ditto chance 1 → the caught Pokémon was 메타몽 (disguised_as)', dc);
    ok((await myMons(M.c)).some((m) => m.line_id === 116), '메타몽 is in the box');
    await setS('wild_chance', 1); await setS('self_redeem', true);
    const qn = nonce();
    await M.c.rpc('sync', { p_scans: [{ n: qn, q: spots[5], t: T[spots[5]].token }] });
    await M.c.rpc('self_redeem');
    s1 = await st(M.c);
    ok(s1.disguised?.[qn] && s1.tickets.find((t) => t.nonce === qn)?.species_id === dittoSp, 'QR wild Pokémon can be a disguised 메타몽 too (state.disguised)', s1.disguised);
    await setS('wild_chance', 0); await setS('self_redeem', false);
    await setS('ditto_disguise_chance', 0);
    const d2 = (await walk('grass'))?.encounter;
    const dc2 = (await M.c.rpc('safari_result', { p_id: d2?.id, p_throws: 1, p_caught: true })).data;
    ok(dc2?.caught && dc2.ditto === false && dc2.species_id === d2?.species_id, 'ditto chance 0 → never', dc2);
    const dc2b = (await M.c.rpc('safari_result', { p_id: d2?.id, p_throws: 3, p_caught: true })).data;
    ok(dc2b?.replay && dc2b.caught && dc2b.nonce === dc2?.nonce && dc2b.safari?.balls_left === dc2?.safari?.balls_left, 'safari_result re-send → stored outcome, no extra balls', dc2b);
    const e5 = (await walk('grass'))?.encounter;
    const b0 = (await M.c.rpc('safari_state')).data?.balls_left;
    ok((await M.c.rpc('safari_throws', { p_id: e5?.id, p_n: 2 })).data?.throws === 2, 'safari_throws records throws as they happen');
    ok((await M.c.rpc('safari_throws', { p_id: e5?.id, p_n: 1 })).data?.throws === 2, 'throw count never goes down');
    ok((await L.c.rpc('admin_encounter_age', { p_id: e5?.id, p_minutes: 60 })).error === 'NOT_ADMIN', 'admin_encounter_age is admin-only');
    ok((await admin.rpc('admin_encounter_age', { p_id: e5?.id, p_minutes: 60 * 26 })).data?.ok, 'admin_encounter_age (test helper)');
    const z5 = (await M.c.rpc('safari_state')).data;
    ok(z5?.expired === 1 && z5.pending === null && z5.balls_left === b0, 'stale pending (older than this refill period) → auto-fled; only its 2 throws are charged (to the old period)', z5);
    const r5 = (await M.c.rpc('safari_result', { p_id: e5?.id, p_throws: 2, p_caught: true })).data;
    ok(r5?.replay && r5.fled === true && r5.caught === false && r5.expired === true, 'sending a result for it later → the stored (fled) outcome', r5);
    ok((await M.c.rpc('safari_throws', { p_id: e5?.id, p_n: 3 })).error === 'NOT_FOUND', 'cannot record throws on a finished encounter');
  } finally {
    for (const k of keys) if (k in old) await setS(k, old[k]);
    for (const id of gifts) await admin.rpc('admin_delete_gift', { p_id: id });
    await admin.rpc('admin_delete_students', { p_student_ids: [L.sid, M.sid], p_confirm: '삭제' });
  }
}

console.log('\n[46] 특성 · 변신 · 날씨 / 필드 (0039): admin_bt_sim (고정 난수) · 시간표 칸 · 잡을 때 특성 · 메타몽');
{
  const spRows = (await admin.select('species?select=id,dex,line_id,stage,abilities,hidden_ability&id=lt.10000&order=id&limit=1000')).data || [];
  const SP = Object.fromEntries(spRows.map((r) => [r.dex, r.id]));
  const mvRows = (await admin.select('moves?select=id,name,pp&limit=400')).data || [];
  const MV = Object.fromEntries(mvRows.map((m) => [m.name, m.id]));
  const abRows = (await admin.select('abilities?select=key,name,description&limit=400')).data || [];
  ok(abRows.length >= 200 && abRows.every((a) => a.name && a.description), `abilities table: ${abRows.length} with Korean name + description`, abRows.length);
  ok(spRows.length >= 800 && spRows.every((r) => Array.isArray(r.abilities) && r.abilities.length >= 1), 'every species has 1–2 normal abilities', spRows.filter((r) => !r.abilities?.length).slice(0, 3));
  const br = (await admin.select('species?select=id,abilities,hidden_ability&id=gte.10000')).data || [];
  ok(br.length > 0 && br.every((r) => r.abilities?.length), `branch species (10000+) have abilities too (${br.length})`);
  const sp = (d) => spRows.find((r) => r.dex === d);
  ok(sp(1)?.abilities?.[0] === 'overgrow' && sp(1)?.hidden_ability === 'chlorophyll' && sp(132)?.abilities?.[0] === 'limber' && sp(132)?.hidden_ability === 'imposter'
     && sp(94)?.abilities?.[0] === 'cursed-body' && sp(130)?.abilities?.[0] === 'intimidate', 'PokeAPI gen-7 abilities (이상해씨 심록/엽록소, 메타몽 유연/괴짜, 팬텀 저주받은바디, 갸라도스 위협)',
  [sp(1), sp(132), sp(94), sp(130)].map((x) => [x?.abilities, x?.hidden_ability]));
  const nm = (k) => abRows.find((a) => a.key === k)?.name;
  ok(nm('overgrow') === '심록' && nm('intimidate') === '위협' && nm('levitate') === '부유' && nm('sturdy') === '옹골참', 'Korean names (심록 · 위협 · 부유 · 옹골참)');

  const SIMR = async (p) => { const r = await admin.rpc('admin_bt_sim', { p }); if (r.error) console.log('   sim error', r.error); return r.data; };
  const BASE = { r: 0.5, crit: false, roll: 100, nopar: true };
  // 기본 기술 = 고속이동 (스피드만 바뀜 → 공격 · 방어 랭크 시험을 건드리지 않음)
  const M = (dex, o = {}) => ({ sp: SP[dex], lv: 50, ...o, moves: (o.moves || ['고속이동']).map((n) => MV[n]) });
  const A = (m0 = 1, m1 = 1, t0 = 0, t1 = 0) => ({ 0: [{ move: m0, target: t0 }], 1: [{ move: m1, target: t1 }] });
  const sim = (s0, s1, o = {}) => SIMR({ sides: [s0, s1], sim: { ...BASE, ...(o.sim || {}) }, turns: o.turns || [A()], ...(o.p || {}) });
  const L = (x, k = 0) => x?.logs?.[k] || [];
  const all = (x) => [...(x?.intro || []), ...(x?.logs || []).flat()];
  const dmgTo = (lg, u) => lg.filter((e) => e.hp && e.hp[0] === u && e.dmg).reduce((a, e) => a + e.dmg, 0);
  const msgs = (lg) => lg.filter((e) => e.m).map((e) => e.m).join(' / ');
  const pops = (lg) => lg.filter((e) => e.ab).map((e) => e.ab[1]);
  const mon = (x, u) => x?.st?.sides?.[u >> 1]?.mons?.[x.st.sides[u >> 1].act[u & 1]];
  // 같은 조건에서 특성만 다르게: 데미지 비율 (내 쪽 자리 0 이 상대 자리 2 를 때림)
  const ratio = async (ab, move, { att = 151, def = 113, ao = {}, dobj = {}, dab = null, s = {}, p = {}, side = 'a' } = {}) => {
    const run = async (x) => {
      const a = M(att, { lv: 100, ...ao, moves: [move], ...(side === 'a' && x ? { ab: x } : {}) });
      const d = M(def, { lv: 100, ...dobj, ...(side === 'd' && x ? { ab: x } : {}), ...(dab ? { ab: dab } : {}) });
      return dmgTo(L(await sim([a], [d], { sim: s, p })), 2);
    };
    const [w, wo] = [await run(ab), await run(null)];
    return { r: wo ? w / wo : null, w, wo };
  };
  const near = (x, v, tol = 0.08) => x != null && Math.abs(x - v) <= tol;
  const R = async (ab, move, want, o = {}, label = '') => {
    const q = await ratio(ab, move, o);
    ok(near(q.r, want, o.tol ?? 0.08), `${ab}${label}: ${move} damage ×${want}`, q);
  };

  // 1) 위력 · 공격 특성
  await R('overgrow', '덩굴채찍', 1.5, { ao: { hpfrac: 0.3 } }, ' (HP ≤ 1/3)');
  await R('overgrow', '덩굴채찍', 1, {}, ' (HP full)');
  await R('blaze', '불꽃세례', 1.5, { ao: { hpfrac: 0.3 } });
  await R('torrent', '물대포', 1.5, { ao: { hpfrac: 0.3 } });
  await R('swarm', '벌레먹기', 1.5, { ao: { hpfrac: 0.3 } });
  await R('technician', '몸통박치기', 1.5);
  await R('technician', '하이퍼보이스', 1, {}, ' (power 90 → no boost)');
  await R('iron-fist', '불꽃펀치', 1.2);
  await R('tough-claws', '몸통박치기', 1.3);
  await R('strong-jaw', '물기', 1.5);
  await R('reckless', '이판사판태클', 1.2);
  await R('huge-power', '막치기', 2, { tol: 0.12 });
  await R('pure-power', '막치기', 2, { tol: 0.12 });
  await R('hustle', '막치기', 1.5, { tol: 0.1 });
  await R('guts', '막치기', 3, { ao: { st: 'brn' }, tol: 0.25 }, ' (burned: ×1.5, no burn halving)');
  await R('adaptability', '사이코키네시스', 1.333, {}, ' (STAB 2 instead of 1.5)');
  await R('sniper', '막치기', 1.5, { s: { crit: true } }, ' (critical ×3)');
  await R('tinted-lens', '사이코키네시스', 2, { def: 81, tol: 0.15 }, ' (not very effective ×2)');
  await R('solar-power', '사이코키네시스', 1.5, { p: { wx: 'sun' }, tol: 0.1 }, ' (sun)');
  await R('sand-force', '지진', 1.3, { p: { wx: 'sand' }, def: 113, tol: 0.1 }, ' (sand)');
  {
    const q = await ratio('pixilate', '몸통박치기', {});
    ok(near(q.r, 1.2, 0.08), 'pixilate: normal move → fairy ×1.2', q);
    const x = await sim([M(151, { ab: 'refrigerate', moves: ['몸통박치기'] })], [M(113, { lv: 100 })]);
    ok(L(x).some((e) => e.use && e.use[1] === '얼음'), 'refrigerate: 몸통박치기 used as 얼음 type', L(x).filter((e) => e.use));
    const y = await sim([M(151, { ab: 'aerilate', moves: ['몸통박치기'] })], [M(113, { lv: 100 })]);
    const z = await sim([M(151, { ab: 'galvanize', moves: ['몸통박치기'] })], [M(113, { lv: 100 })]);
    ok(L(y).some((e) => e.use?.[1] === '비행') && L(z).some((e) => e.use?.[1] === '전기'), 'aerilate → 비행 · galvanize → 전기');
  }
  // 2) 받는 쪽 특성 (데미지 배율)
  await R('thick-fat', '불꽃세례', 0.5, { side: 'd' });
  await R('heatproof', '불꽃세례', 0.5, { side: 'd' });
  await R('dry-skin', '불꽃세례', 1.25, { side: 'd', tol: 0.1 }, ' (fire)');
  await R('multiscale', '사이코키네시스', 0.5, { side: 'd' }, ' (full HP)');
  await R('shadow-shield', '사이코키네시스', 0.5, { side: 'd' }, ' (full HP)');
  await R('filter', '사이코키네시스', 0.75, { side: 'd', def: 89, ao: { lv: 50 } }, ' (super effective)');
  await R('solid-rock', '사이코키네시스', 0.75, { side: 'd', def: 89, ao: { lv: 50 } });
  await R('prism-armor', '사이코키네시스', 0.75, { side: 'd', def: 89, ao: { lv: 50 } });
  await R('marvel-scale', '막치기', 0.667, { side: 'd', dobj: { st: 'psn' }, tol: 0.07 }, ' (statused, physical)');
  await R('fur-coat', '막치기', 0.5, { side: 'd', tol: 0.07 });
  // 3) 막음 · 흡수
  const hit = async (dab, move, { att = 151, def = 113, ao = {}, dobj = {}, s = {}, p = {} } = {}) =>
    sim([M(att, { ...ao, moves: [move] })], [M(def, { lv: 100, ...dobj, ab: dab })], { sim: s, p });
  {
    let x = await hit('levitate', '지진');
    ok(dmgTo(L(x), 2) === 0 && pops(L(x)).includes('levitate') && /효과가 없는/.test(msgs(L(x))), 'levitate: ground move does nothing (+ popup)', msgs(L(x)));
    x = await sim([M(151, { ab: 'mold-breaker', moves: ['지진'] })], [M(113, { lv: 100, ab: 'levitate' })]);
    ok(dmgTo(L(x), 2) > 0 && pops(x.intro).includes('mold-breaker'), 'mold-breaker: ignores levitate (+ entry message)', msgs(all(x)));
    x = await hit('volt-absorb', '10만볼트', { dobj: { hpfrac: 0.5 } });
    ok(mon(x, 2).hp > mon(x, 2).max / 2 && dmgTo(L(x), 2) === 0, 'volt-absorb: electric heals 1/4', [mon(x, 2).hp, mon(x, 2).max]);
    x = await hit('water-absorb', '물대포', { dobj: { hpfrac: 0.5 } });
    ok(mon(x, 2).hp > mon(x, 2).max / 2, 'water-absorb: water heals 1/4');
    x = await hit('dry-skin', '물대포', { dobj: { hpfrac: 0.5 } });
    ok(mon(x, 2).hp > mon(x, 2).max / 2, 'dry-skin: water heals');
    x = await hit('motor-drive', '전기쇼크', { dobj: { moves: ['칼춤'].map((n) => n) } });
    ok(mon(x, 2).stg?.spe === 1 && dmgTo(L(x), 2) === 0, 'motor-drive: electric → speed +1', mon(x, 2).stg);
    x = await hit('lightning-rod', '전기쇼크');
    ok(mon(x, 2).stg?.spa === 1, 'lightning-rod: electric → sp.atk +1');
    x = await hit('storm-drain', '물대포');
    ok(mon(x, 2).stg?.spa === 1, 'storm-drain: water → sp.atk +1');
    x = await hit('sap-sipper', '덩굴채찍');
    ok(mon(x, 2).stg?.atk === 1, 'sap-sipper: grass → attack +1');
    x = await hit('flash-fire', '불꽃세례');
    ok(dmgTo(L(x), 2) === 0 && mon(x, 2).ff === true && /불꽃의 위력이 올라갔다/.test(msgs(L(x))), 'flash-fire: fire absorbed, own fire moves powered up', msgs(L(x)));
    x = await hit('wonder-guard', '사이코키네시스', { def: 292 });
    const x2 = await hit('wonder-guard', '섀도볼', { def: 292 });
    ok(dmgTo(L(x), 2) === 0 && dmgTo(L(x2), 2) > 0, 'wonder-guard: only super-effective moves hit (껍질몬 vs 섀도볼)', [dmgTo(L(x), 2), dmgTo(L(x2), 2)]);
    x = await sim([M(151, { ab: 'scrappy', moves: ['몸통박치기'] })], [M(92, { lv: 100 })]);
    const x3 = await sim([M(151, { moves: ['몸통박치기'] })], [M(92, { lv: 100 })]);
    ok(dmgTo(L(x), 2) > 0 && dmgTo(L(x3), 2) === 0, 'scrappy: normal move hits a ghost', [dmgTo(L(x), 2), dmgTo(L(x3), 2)]);
  }
  // 4) 접촉 (r = 0 → 반드시 발동)
  {
    const C = async (dab, move = '막치기') => sim([M(151, { moves: [move] })], [M(113, { lv: 100, ab: dab })], { sim: { r: 0 } });
    let x = await C('static'); ok(mon(x, 0).st === 'par' && pops(L(x)).includes('static'), 'static: contact → attacker paralyzed', mon(x, 0).st);
    x = await C('poison-point'); ok(mon(x, 0).st === 'psn', 'poison-point: contact → poisoned');
    x = await C('flame-body'); ok(mon(x, 0).st === 'brn', 'flame-body: contact → burned');
    x = await C('effect-spore'); ok(['psn', 'par', 'slp'].includes(mon(x, 0).st), 'effect-spore: contact → psn/par/slp', mon(x, 0).st);
    x = await C('static', '사이코키네시스'); ok(!mon(x, 0).st, 'static: special (no contact) → nothing');
    x = await C('rough-skin'); ok(mon(x, 0).hp === mon(x, 0).max - Math.floor(mon(x, 0).max / 8), 'rough-skin: attacker loses 1/8', [mon(x, 0).hp, mon(x, 0).max]);
    x = await C('iron-barbs'); ok(mon(x, 0).hp < mon(x, 0).max, 'iron-barbs: attacker loses 1/8');
    x = await sim([M(151, { ab: 'magic-guard', moves: ['막치기'] })], [M(113, { lv: 100, ab: 'rough-skin' })]);
    ok(mon(x, 0).hp === mon(x, 0).max, 'magic-guard: no rough-skin damage');
  }
  // 5) 버티기 · 탈
  {
    let x = await sim([M(151, { lv: 100, moves: ['사이코키네시스'] })], [M(10, { lv: 5, ab: 'sturdy' })]);
    ok(mon(x, 2).hp === 1 && pops(L(x)).includes('sturdy') && /버텼다/.test(msgs(L(x))), 'sturdy: survives a OHKO from full HP with 1 HP', mon(x, 2).hp);
    x = await sim([M(151, { lv: 100, moves: ['사이코키네시스'] })], [M(10, { lv: 5, ab: 'sturdy', hpfrac: 0.9 })]);
    ok(mon(x, 2).hp === 0, 'sturdy: not at full HP → faints');
    x = await sim([M(151, { moves: ['사이코키네시스'] })], [M(778, { lv: 50, ab: 'disguise' })], { turns: [A(), A()] });
    ok(dmgTo(L(x, 0), 2) === 0 && /탈이 벗겨졌다/.test(msgs(L(x, 0))) && dmgTo(L(x, 1), 2) > 0, 'disguise: first hit blocked, then busted', msgs(L(x, 0)));
  }
  // 6) 등장 특성
  {
    let x = await sim([M(130, { ab: 'intimidate' })], [M(113, { lv: 100 })]);
    ok(mon(x, 2).stg?.atk === -1 && pops(x.intro).includes('intimidate'), 'intimidate: foe attack −1 on entry', mon(x, 2).stg);
    for (const k of ['clear-body', 'white-smoke', 'hyper-cutter', 'full-metal-body']) {
      x = await sim([M(130, { ab: 'intimidate' })], [M(113, { lv: 100, ab: k })]);
      ok(!mon(x, 2).stg?.atk && /떨어지지 않는다/.test(msgs(x.intro)), `${k}: blocks intimidate`, msgs(x.intro));
    }
    x = await sim([M(130, { ab: 'intimidate' })], [M(113, { lv: 100, ab: 'defiant' })]);
    ok(mon(x, 2).stg?.atk === 1, 'defiant: −1 then +2 = +1', mon(x, 2).stg);
    x = await sim([M(130, { ab: 'intimidate' })], [M(113, { lv: 100, ab: 'competitive' })]);
    ok(mon(x, 2).stg?.atk === -1 && mon(x, 2).stg?.spa === 2, 'competitive: sp.atk +2 after a drop', mon(x, 2).stg);
    x = await sim([M(151, { moves: ['모래뿌리기'] })], [M(113, { lv: 100, ab: 'keen-eye' })]);
    ok(!mon(x, 2).stg?.acc, 'keen-eye: accuracy drop blocked');
    x = await sim([M(151, { moves: ['꼬리흔들기'] })], [M(113, { lv: 100, ab: 'big-pecks' })]);
    ok(!mon(x, 2).stg?.def, 'big-pecks: defense drop blocked');
    for (const [k, w] of [['drought', 'sun'], ['drizzle', 'rain'], ['sand-stream', 'sand'], ['snow-warning', 'hail']]) {
      x = await sim([M(151, { ab: k })], [M(113, { lv: 100 })]);
      ok(x?.st?.wx?.k === w && pops(x.intro).includes(k) && x.intro.some((e) => e.wx === w), `${k}: ${w} on entry (5 turns)`, x?.st?.wx);
    }
    for (const t of ['electric', 'grassy', 'misty', 'psychic']) {
      x = await sim([M(151, { ab: `${t}-surge` })], [M(113, { lv: 100 })]);
      ok(x?.st?.ter?.k === t && x.intro.some((e) => e.ter === t), `${t}-surge: ${t} terrain on entry`, x?.st?.ter);
    }
    x = await sim([M(151, { moves: ['막치기'] })], [M(113, { lv: 100, ab: 'pressure' })]);
    ok(/프레셔를 발산/.test(msgs(x.intro)) && mon(x, 0).moves[0].pp === mvRows.find((m) => m.name === '막치기').pp - 2, 'pressure: entry message + PP −2', mon(x, 0).moves);
    x = await sim([M(151, { lv: 100, moves: ['물대포'] })], [M(113, { lv: 100, ab: 'cloud-nine' })], { p: { wx: 'sun' } });
    const x0 = await sim([M(151, { lv: 100, moves: ['물대포'] })], [M(113, { lv: 100 })], { p: { wx: 'sun' } });
    ok(dmgTo(L(x), 2) > dmgTo(L(x0), 2) * 1.8, 'cloud-nine: sun does not halve water', [dmgTo(L(x), 2), dmgTo(L(x0), 2)]);
    x = await sim([M(132, { ab: 'imposter' })], [M(151)]);
    ok(mon(x, 0).tf === true && mon(x, 0).tsp === SP[151] && x.intro.some((e) => e.tf), 'imposter: 메타몽 transforms on entry', mon(x, 0));
  }
  // 7) 상태 이상 막기
  {
    const S1 = async (dab, move, o = {}) => sim([M(151, { moves: [move] })], [M(113, { lv: 100, ab: dab })], { sim: { r: 0, ...(o.s || {}) }, p: o.p || {} });
    for (const [k, mvn, st] of [['limber', '전기자석파', 'par'], ['insomnia', '버섯포자', 'slp'], ['vital-spirit', '버섯포자', 'slp'], ['sweet-veil', '버섯포자', 'slp'],
      ['immunity', '맹독', 'psn'], ['water-veil', '도깨비불', 'brn'], ['comatose', '버섯포자', 'slp']]) {
      const x = await S1(k, mvn);
      ok(!mon(x, 2).st && pops(L(x)).includes(k), `${k}: ${mvn} does not ${st}`, msgs(L(x)));
    }
    let x = await S1('magma-armor', '눈싸라기'); ok(!mon(x, 2).st, 'magma-armor: never frozen');
    x = await S1('own-tempo', '이상한빛'); ok(!(mon(x, 2).cnf > 0) && pops(L(x)).includes('own-tempo'), 'own-tempo: no confusion');
    x = await S1('leaf-guard', '버섯포자', { p: { wx: 'sun' } }); ok(!mon(x, 2).st, 'leaf-guard: no status in sun');
    x = await S1(null, '버섯포자'); ok(mon(x, 2).st === 'slp', '(control) no ability → asleep');
    x = await S1('shield-dust', '누르기'); ok(!mon(x, 2).st, 'shield-dust: no secondary paralysis');
    x = await sim([M(151, { moves: ['누르기'] })], [M(113, { lv: 100 })], { sim: { r: 0.45 } });
    const y = await sim([M(151, { ab: 'serene-grace', moves: ['누르기'] })], [M(113, { lv: 100 })], { sim: { r: 0.45 } });
    ok(!mon(x, 2).st && mon(y, 2).st === 'par', 'serene-grace: 30% → 60% (roll 45)', [mon(x, 2).st, mon(y, 2).st]);
  }
  // 8) 명중 · 급소 · 여러 번
  {
    const acc = async (ab, dab, move, r, p = {}) => dmgTo(L(await sim([M(151, { ab, moves: [move] })], [M(113, { lv: 100, ab: dab })], { sim: { r }, p })), 2) > 0;
    ok(!(await acc(null, null, '눈보라', 0.8)) && (await acc('compound-eyes', null, '눈보라', 0.8)), 'compound-eyes: 70% move hits at roll 80');
    ok(!(await acc('hustle', null, '막치기', 0.85)) && (await acc(null, null, '막치기', 0.85)), 'hustle: physical accuracy ×0.8');
    ok((await acc('no-guard', null, '눈보라', 0.95)) && (await acc(null, 'no-guard', '눈보라', 0.95)), 'no-guard: always hits (both ways)');
    ok(!(await acc(null, 'sand-veil', '막치기', 0.85, { wx: 'sand' })) && (await acc(null, 'sand-veil', '막치기', 0.85)), 'sand-veil: evasion in sand');
    ok(!(await acc(null, 'snow-cloak', '막치기', 0.85, { wx: 'hail' })), 'snow-cloak: evasion in hail');
    const cr = async (ab, dab, s) => /급소/.test(msgs(L(await sim([M(151, { ab, moves: ['막치기'] })], [M(113, { lv: 100, ab: dab })], { sim: { crit: undefined, ...s } }))));
    ok(!(await cr(null, null, { crit_r: 0.1 })) && (await cr('super-luck', null, { crit_r: 0.1 })), 'super-luck: crit stage +1 (1/16 → 1/8)');
    ok(!(await cr(null, 'battle-armor', { crit: true })) && !(await cr(null, 'shell-armor', { crit: true })) && (await cr(null, null, { crit: true })), 'battle-armor · shell-armor: no critical hits');
    const x = await sim([M(151, { ab: 'skill-link', moves: ['마구찌르기'] })], [M(113, { lv: 100 })]);
    ok(/5번 맞았다/.test(msgs(L(x))), 'skill-link: multi-hit always 5', msgs(L(x)));
  }
  // 9) 쓰러뜨림 · 맞음 · 반동 · 풀죽음
  {
    let x = await sim([M(151, { lv: 100, ab: 'moxie', moves: ['사이코키네시스'] })], [M(10, { lv: 5 })]);
    ok(mon(x, 0).stg?.atk === 1, 'moxie: KO → attack +1', mon(x, 0).stg);
    x = await sim([M(151, { lv: 100, ab: 'beast-boost', moves: ['사이코키네시스'] })], [M(10, { lv: 5 })]);
    ok(Object.values(mon(x, 0).stg || {}).includes(1), 'beast-boost: KO → highest stat +1', mon(x, 0).stg);
    x = await sim([M(151, { moves: ['악의파동'] })], [M(113, { lv: 100, ab: 'justified' })]);
    ok(mon(x, 2).stg?.atk === 1, 'justified: hit by dark → attack +1');
    x = await sim([M(151, { ab: 'rock-head', moves: ['이판사판태클'] })], [M(113, { lv: 100 })]);
    const y = await sim([M(151, { moves: ['이판사판태클'] })], [M(113, { lv: 100 })]);
    ok(mon(x, 0).hp === mon(x, 0).max && mon(y, 0).hp < mon(y, 0).max, 'rock-head: no recoil (control: recoil)');
    x = await sim([M(151, { ab: 'magic-guard', moves: ['이판사판태클'] })], [M(113, { lv: 100 })]);
    ok(mon(x, 0).hp === mon(x, 0).max, 'magic-guard: no recoil');
    x = await sim([M(151, { lv: 100, moves: ['속이기'] })], [M(208, { lv: 50, ab: 'inner-focus', moves: ['칼춤'] })], { sim: { r: 0 } });
    ok(L(x).filter((e) => e.use).length === 2, 'inner-focus: no flinch (both moved)');
    x = await sim([M(151, { lv: 100, moves: ['속이기'] })], [M(208, { lv: 50, ab: 'steadfast', moves: ['칼춤'] })], { sim: { r: 0 } });
    ok(mon(x, 2).stg?.spe === 1 && /풀이 죽어/.test(msgs(L(x))), 'steadfast: flinched → speed +1', mon(x, 2).stg);
  }
  // 10) 스피드 · 턴 끝
  {
    const first = async (ab, wx, st, foeDex = 151) => {
      const x = await sim([M(113, { lv: 50, ab, st, moves: ['칼춤'] })], [M(foeDex, { lv: 50, moves: ['칼춤'] })], { p: wx ? { wx } : {} });
      return L(x).find((e) => e.use)?.use?.[0] === 0;
    };
    for (const [k, w] of [['chlorophyll', 'sun'], ['swift-swim', 'rain'], ['sand-rush', 'sand'], ['slush-rush', 'hail']]) {
      ok(!(await first(null, w)) && (await first(k, w)) && !(await first(k, null)), `${k}: speed ×2 in ${w} (moves first)`);
    }
    ok(!(await first(null, null, 'psn', 54)) && (await first('quick-feet', null, 'psn', 54)), 'quick-feet: speed ×1.5 when statused');
    let x = await sim([M(151, { ab: 'speed-boost', moves: ['칼춤'] })], [M(113, { lv: 100 })]);
    ok(mon(x, 0).stg?.spe === 1 && pops(L(x)).includes('speed-boost'), 'speed-boost: speed +1 at end of turn');
    x = await sim([M(151, { ab: 'shed-skin', st: 'psn' })], [M(113, { lv: 100 })], { sim: { r: 0 } });
    ok(!mon(x, 0).st, 'shed-skin: status cured at end of turn (30%)');
    x = await sim([M(151, { ab: 'hydration', st: 'psn' })], [M(113, { lv: 100 })], { p: { wx: 'rain' } });
    ok(!mon(x, 0).st, 'hydration: status cured in rain');
    x = await sim([M(151, { ab: 'poison-heal', st: 'psn', hpfrac: 0.5 })], [M(113, { lv: 100 })]);
    ok(mon(x, 0).hp > Math.floor(mon(x, 0).max / 2), 'poison-heal: poison heals 1/8');
    x = await sim([M(151, { ab: 'magic-guard', st: 'psn' })], [M(113, { lv: 100 })], { p: { wx: 'sand' } });
    ok(mon(x, 0).hp === mon(x, 0).max, 'magic-guard: no poison / sandstorm damage');
    for (const [k, w] of [['rain-dish', 'rain'], ['ice-body', 'hail'], ['dry-skin', 'rain']]) {
      x = await sim([M(151, { ab: k, hpfrac: 0.5 })], [M(113, { lv: 100 })], { p: { wx: w } });
      ok(mon(x, 0).hp > Math.floor(mon(x, 0).max / 2), `${k}: heals in ${w}`, [mon(x, 0).hp, mon(x, 0).max]);
    }
    x = await sim([M(151, { ab: 'dry-skin' })], [M(113, { lv: 100 })], { p: { wx: 'sun' } });
    ok(mon(x, 0).hp === mon(x, 0).max - Math.floor(mon(x, 0).max / 8), 'dry-skin: loses 1/8 in sun');
    x = await sim([M(151, { ab: 'solar-power' })], [M(113, { lv: 100 })], { p: { wx: 'sun' } });
    ok(mon(x, 0).hp < mon(x, 0).max, 'solar-power: loses 1/8 in sun');
    for (const k of ['sand-veil', 'overcoat']) {
      x = await sim([M(151, { ab: k })], [M(113, { lv: 100 })], { p: { wx: 'sand' } });
      ok(mon(x, 0).hp === mon(x, 0).max, `${k}: no sandstorm damage`);
    }
    x = await sim([M(151, { moves: ['칼춤', '칼춤'] })], [M(287, { lv: 50, ab: 'truant', moves: ['몸통박치기'] })], { turns: [A(), A()] });
    ok(L(x, 0).some((e) => e.use?.[0] === 2) && /게으름/.test(msgs(L(x, 1))), 'truant: acts, then loafs the next turn', msgs(L(x, 1)));
    const sl = async (ab) => { const z = await sim([M(151, { ab, st: 'slp' })], [M(113, { lv: 100 })], { turns: [A(), A()] }); return L(z, 1).some((e) => e.use?.[0] === 0); };
    ok(!(await sl(null)) && (await sl('early-bird')), 'early-bird: wakes up twice as fast');
  }
  // 11) 교체
  {
    const sw = { 0: [{ switch: 1 }], 1: [{ move: 1, target: 0 }] };
    let x = await sim([M(151, { ab: 'natural-cure', st: 'psn' }), M(113)], [M(113, { lv: 100 })], { turns: [sw] });
    ok(!x?.st?.sides?.[0]?.mons?.[0]?.st, 'natural-cure: status cured on switch-out');
    x = await sim([M(151, { ab: 'regenerator', hpfrac: 0.3 }), M(113)], [M(113, { lv: 100 })], { turns: [sw] });
    const m0 = x?.st?.sides?.[0]?.mons?.[0];
    ok(m0 && m0.hp >= Math.floor(m0.max * 0.3) + Math.floor(m0.max / 3) - 1, 'regenerator: heals 1/3 on switch-out', m0 && [m0.hp, m0.max]);
    x = await sim([M(151), M(130, { ab: 'intimidate' })], [M(113, { lv: 100 })], { turns: [sw] });
    ok(mon(x, 2).stg?.atk === -1 && pops(L(x)).includes('intimidate'), 'switch-in: entry ability fires (intimidate)');
  }
  // 12) 날씨 · 필드 배율 · 턴 끝 데미지 · 끝남
  {
    const W = async (move, wx, o = {}) => { const q = await ratio(null, move, { p: { wx }, ...o }); return q; };
    const dm = async (move, p) => dmgTo(L(await sim([M(151, { lv: 100, moves: [move] })], [M(113, { lv: 100 })], { p })), 2);
    const base = { fire: await dm('불꽃세례', {}), water: await dm('물대포', {}), psy: await dm('사이코키네시스', {}), grass: await dm('덩굴채찍', {}), elec: await dm('전기쇼크', {}) };
    ok(near((await dm('불꽃세례', { wx: 'sun' })) / base.fire, 1.5, 0.1) && near((await dm('물대포', { wx: 'sun' })) / base.water, 0.5, 0.1), 'sun: fire ×1.5 · water ×0.5');
    ok(near((await dm('물대포', { wx: 'rain' })) / base.water, 1.5, 0.1) && near((await dm('불꽃세례', { wx: 'rain' })) / base.fire, 0.5, 0.1), 'rain: water ×1.5 · fire ×0.5');
    const rk = async (wx) => dmgTo(L(await sim([M(151, { moves: ['사이코키네시스'] })], [M(74, { lv: 100 })], { p: wx ? { wx } : {} })), 2);
    ok(near((await rk('sand')) / (await rk(null)), 0.667, 0.06), 'sand: rock-type sp.def ×1.5');
    let x = await sim([M(151)], [M(113, { lv: 100 })], { p: { wx: 'sand' } });
    ok(mon(x, 0).hp === mon(x, 0).max - Math.floor(mon(x, 0).max / 16) && /모래바람이 .*덮쳤다/.test(msgs(L(x))), 'sand: 1/16 to non rock/ground/steel', msgs(L(x)));
    x = await sim([M(74)], [M(113, { lv: 100 })], { p: { wx: 'sand' } });
    ok(mon(x, 0).hp === mon(x, 0).max, 'sand: rock type takes no damage');
    x = await sim([M(151)], [M(124, { lv: 100 })], { p: { wx: 'hail' } });
    ok(mon(x, 0).hp === mon(x, 0).max - Math.floor(mon(x, 0).max / 16) && mon(x, 2).hp === mon(x, 2).max && /싸라기눈이/.test(msgs(L(x))), 'hail: 1/16 to non-ice (ice 루주라 safe)');
    ok(near((await dm('전기쇼크', { ter: 'electric' })) / base.elec, 1.3, 0.1), 'electric terrain: electric ×1.3 (grounded)');
    const fly = async (ter) => dmgTo(L(await sim([M(145, { moves: ['전기쇼크'] })], [M(113, { lv: 100 })], { p: ter ? { ter } : {} })), 2);
    ok(near((await fly('electric')) / (await fly(null)), 1, 0.05), 'electric terrain: flying attacker not boosted');
    x = await sim([M(151, { moves: ['버섯포자'] })], [M(113, { lv: 100 })], { sim: { r: 0 }, p: { ter: 'electric' } });
    ok(!mon(x, 2).st && /일렉트릭필드/.test(msgs(L(x))), 'electric terrain: no sleep');
    ok(near((await dm('덩굴채찍', { ter: 'grassy' })) / base.grass, 1.3, 0.1), 'grassy terrain: grass ×1.3');
    x = await sim([M(151, { hpfrac: 0.5 })], [M(113, { lv: 100 })], { p: { ter: 'grassy' } });
    ok(mon(x, 0).hp === Math.floor(mon(x, 0).max * 0.5) + Math.floor(mon(x, 0).max / 16), 'grassy terrain: heals 1/16', [mon(x, 0).hp, mon(x, 0).max]);
    const dr = async (ter) => dmgTo(L(await sim([M(151, { moves: ['용의파동'] })], [M(113, { lv: 100 })], { p: ter ? { ter } : {} })), 2);
    ok(near((await dr('misty')) / (await dr(null)), 0.5, 0.06), 'misty terrain: dragon ×0.5');
    x = await sim([M(151, { moves: ['도깨비불'] })], [M(113, { lv: 100 })], { sim: { r: 0 }, p: { ter: 'misty' } });
    ok(!mon(x, 2).st && /미스트필드/.test(msgs(L(x))), 'misty terrain: no status');
    ok(near((await dm('사이코키네시스', { ter: 'psychic' })) / base.psy, 1.3, 0.1), 'psychic terrain: psychic ×1.3');
    x = await sim([M(151, { moves: ['전광석화'] })], [M(113, { lv: 100 })], { p: { ter: 'psychic' } });
    ok(dmgTo(L(x), 2) === 0 && /사이코필드에 보호/.test(msgs(L(x))), 'psychic terrain: priority moves blocked');
    // 5턴 뒤 끝남 → 시간표 바탕 날씨로
    x = await SIMR({ sides: [[M(151, { ab: 'drizzle' })], [M(113, { lv: 100 })]], env: 'sun', sim: BASE, turns: [A(), A(), A(), A(), A()] });
    ok(x?.intro?.some((e) => e.wx === 'rain') && /비가 그쳤다/.test(msgs(L(x, 4))) && /햇살이 강해졌다/.test(msgs(L(x, 4))) && x.st.wx.k === 'sun' && x.st.wx.n == null,
      'drizzle over a sunny timetable slot: rain 5 turns → back to sun', x?.st?.wx);
    // 날씨 기술
    for (const [mvn, w] of [['쾌청', 'sun'], ['비바라기', 'rain'], ['모래바람', 'sand'], ['싸라기눈', 'hail']]) {
      x = await sim([M(151, { moves: [mvn] })], [M(113, { lv: 100 })]);
      ok(x?.st?.wx?.k === w && x.st.wx.n === 4 && L(x).some((e) => e.wx === w), `${mvn}: ${w} for 5 turns`, x?.st?.wx);
    }
    x = await sim([M(151, { moves: ['쾌청'] })], [M(113, { lv: 100 })], { p: { wx: 'sun' } });
    ok(/실패/.test(msgs(L(x))), 'weather move fails when that weather is already up');
  }
  // 13) 변신 (메타몽)
  {
    const foe = M(151, { moves: ['칼춤', '사이코키네시스'], ab: 'synchronize' });
    const x = await sim([M(132, { moves: ['변신'] }), M(113)], [foe], { turns: [A(), { 0: [{ switch: 1 }], 1: [{ move: 1, target: 0 }] }] });
    const tf = (L(x, 0).find((e) => e.tf) || {});
    const d0 = x?.st?.sides?.[0]?.mons?.[0];
    ok(tf.tf?.[1] === SP[151] && /메타몽.* 변신했다!/.test(msgs(L(x, 0))), 'Transform: "메타몽은 … 변신했다!" + tf event with target sprite', msgs(L(x, 0)));
    const first = await sim([M(132, { moves: ['변신'] })], [foe]);
    const t = mon(first, 0); const f = mon(first, 2);
    ok(t?.tf && t.type === f.type && t.atk === f.atk && t.spa === f.spa && t.spe === f.spe && t.hp === t.max && t.max !== f.max && t.ab === 'synchronize'
       && t.moves.length === 2 && t.moves.every((m) => m.pp === 5) && t.moves[0].id === MV['칼춤'] && t.stg?.atk === 2,
    'Transform: copies types · stats (not HP) · stat stages · ability · moves with PP 5', t);
    ok(d0 && !d0.tf && !d0.tsp && d0.type === '노말' && d0.moves?.[0]?.id === MV['변신'], 'Transform: reverts on switch-out', d0);
    const twice = await sim([M(132, { moves: ['변신'] })], [M(132, { moves: ['변신'] })]);
    ok(/실패/.test(msgs(L(twice))), 'Transform: fails on an already transformed target', msgs(L(twice)));
    const dm = (await admin.select(`species_moves?species_id=eq.${SP[132]}&select=move_id`)).data || [];
    ok(dm.length === 1 && dm[0].move_id === MV['변신'], '메타몽 default moves = 변신 only', dm);
    const ls = (await admin.select(`learnset?move_id=eq.${MV['변신']}&select=line_id,lv,how`)).data || [];
    const lineOfDex = (d) => spRows.find((r) => r.dex === d)?.line_id;
    ok(ls.some((r) => r.line_id === lineOfDex(132) && r.lv === 1) && ls.some((r) => r.line_id === lineOfDex(151)) && ls.length === 2, '변신 learnset: 메타몽 (Lv.1) + 뮤 only (PokeAPI)', ls);
  }
  // 14) 시간표 칸 → 날씨 · 필드 (실제 배틀), 운영자만 고침
  {
    const seed = BF_ORIG || [];
    ok(Array.isArray(seed) && seed.length >= 6 && seed.every((x) => x.env && !x.types), 'battle_fields: every slot has an env (no type lists)', seed);
    const envs = Object.fromEntries((seed || []).map((x) => [x.name, x.env]));
    ok(envs['아침 조회'] === 'sun' && envs['점심시간'] === 'grassy' && envs['야간 자율학습'] === 'misty', 'slot mapping: 아침 조회 = 쾌청 · 점심 = 그래스필드 · 야자 = 미스트필드', envs);
    const X = S[0];
    const mine = (await myMons(X)).slice(0, 1).map((m) => m.id);
    for (const [env, kind] of [['rain', 'wx'], ['psychic', 'ter']]) {
      await setS('battle_fields', [{ from: '00:00', to: '23:59', name: '시험 칸', env }]);
      const b = (await X.rpc('battle_start_cpu', { p_mons: mine, p_format: 'single', p_fair: false })).data;
      const moved = (b?.log || []).some((e) => kind in e || ['cloud-nine', 'air-lock'].includes(e.ab?.[1]));   // 상대 특성이 날씨를 바꿨으면 (드묾)
      ok(b?.field?.env === env && (b?.[kind] === env || moved), `cpu battle in a '${env}' slot starts with ${kind} = ${env}`, { field: b?.field, wx: b?.wx, ter: b?.ter });
      ok(b?.sides?.[b.me]?.mons?.every((m) => 'ab' in m), 'my side: every mon carries its ability (ab)');
      if (b?.id) await X.rpc('battle_forfeit', { p_id: b.id });
    }
    const st = await fetch(`${URL_}/rest/v1/settings?key=eq.battle_fields`, { method: 'PATCH', headers: { apikey: KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${STOK}`, Prefer: 'return=representation' }, body: JSON.stringify({ value: [] }) });
    const stBody = await st.json().catch(() => null);
    ok(!Array.isArray(stBody) || stBody.length === 0, 'a student cannot change battle_fields', stBody);
    await setS('battle_fields', BF_ORIG);
    ok(JSON.stringify((await admin.select('settings?key=eq.battle_fields')).data?.[0]?.value) === JSON.stringify(BF_ORIG), 'admin can edit + restore battle_fields');
    await setS('battle_fields', []);   // 시험 동안은 날씨 없이 (끝에서 되돌림)
  }
  // 15) 잡을 때 특성 · 내 특성 · 예전 포켓몬
  {
    const H0c = (await admin.select('settings?key=eq.ability_hidden_chance')).data?.[0]?.value ?? 0.05;
    await setS('ability_hidden_chance', 1);
    await admin.rpc('admin_grant_monster', { p_student_id: '022903', p_line: 1, p_stage: 1 });
    const c3 = S[2];
    let ms = (await c3.select('collection?select=id,species_id,ability,ability_slot&released_at=is.null&order=id.desc&limit=1')).data || [];
    const sp1 = spRows.find((r) => r.id === ms[0]?.species_id);
    ok(ms[0]?.ability_slot === 2 && ms[0]?.ability === sp1?.hidden_ability, 'catch with hidden chance 100% → hidden ability', [ms[0], sp1?.hidden_ability]);
    await setS('ability_hidden_chance', 0);
    await admin.rpc('admin_grant_monster', { p_student_id: '022903', p_line: 1, p_stage: 1 });
    ms = (await c3.select('collection?select=id,species_id,ability,ability_slot&released_at=is.null&order=id.desc&limit=1')).data || [];
    const sp2 = spRows.find((r) => r.id === ms[0]?.species_id);
    ok(ms[0]?.ability_slot < 2 && sp2?.abilities?.includes(ms[0]?.ability), 'catch with 0% → one of the normal abilities', [ms[0], sp2?.abilities]);
    await setS('ability_hidden_chance', H0c);
    const mine = (await c3.rpc('my_abilities')).data;
    ok(mine && Object.keys(mine).length > 0 && mine[ms[0].id] === ms[0].ability, 'my_abilities: {mon id: ability}', mine && Object.keys(mine).length);
    const nulls = (await admin.select('collection?select=id&ability=is.null&limit=5')).data || [];
    ok(nulls.length === 0, 'every existing mon has an ability (backfilled)', nulls);
    const anonTry = await anon.rpc('admin_bt_sim', { p: {} });
    const stuTry = await c3.rpc('admin_bt_sim', { p: {} });
    ok(!!anonTry.error && !!stuTry.error, 'admin_bt_sim: admins only', [anonTry.error, stuTry.error]);
  }
}

console.log('\n[50] 사파리존 v3 (0040): 만남 상한 없음 · 구역 레벨 범위 · 해변 포켓몬 · 걸음 속도 · 또 잡으면 레벨 +1 · 30분 충전');
{
  const keys = ['safari_balls_daily', 'safari_min_steps', 'safari_encounter_rate', 'safari_steps_per_sec',
                'safari_flee', 'safari_flee_step', 'safari_flee_legend', 'safari_flee_max', 'safari_reset_hours', 'safari_flee_level', 'ditto_disguise_chance'];
  const old = Object.fromEntries((await admin.select(`settings?key=in.(${keys.join(',')})&select=key,value`)).data.map((x) => [x.key, x.value]));
  const setS = (k, v) => admin.patch(`settings?key=eq.${k}`, { value: v });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  ok(Number(old.safari_reset_hours) === 0.5 && Number(old.safari_steps_per_sec) >= 10 && Number(old.safari_flee_level) === 0.1,
     'defaults: refill every 30 min, step limit 10/s, level flee bonus 10%', old);
  ok(!(await admin.select('settings?key=eq.safari_daily_max_encounters&select=key')).data?.length, 'safari_daily_max_encounters setting is gone');
  let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'sv1234' })).error);
  const V = client(await pwLogin(`${sid}@code.local`, 'sv1234'));
  await V.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: '사파리셋' });
  const walk = async (zone, area, dist) => {
    for (const t0 = Date.now(); Date.now() - t0 < 10000;) {
      const a = (await V.rpc('safari_encounter', { p_steps: 3, p_zone: zone, p_area: area, p_dist: dist })).data;
      if (a?.encounter || a?.reason) return a;
      await wait(400);
    }
    return null;
  };
  const flee = async (a) => V.rpc('safari_result', { p_id: a?.encounter?.id, p_throws: 1, p_caught: false });
  const spRow = async (id) => (await admin.select(`species?id=eq.${id}&select=line_id,stage,btype`)).data?.[0];
  try {
    await setS('safari_reset_hours', 24); await setS('safari_balls_daily', 100); await setS('safari_min_steps', 0); await setS('safari_steps_per_sec', 10);
    await setS('safari_flee', 0); await setS('safari_flee_step', 0); await setS('safari_flee_legend', 0); await setS('ditto_disguise_chance', 0);
    // 1) 걸음 속도: 앱처럼 1초에 6걸음 (0.5초마다 3걸음) 은 언제나 다 받아들임 · 한 번에 500걸음은 몇 개만
    await setS('safari_encounter_rate', 0);
    await V.rpc('safari_encounter', { p_steps: 0 });
    const acc = [];
    for (let i = 0; i < 6; i++) { await wait(500); acc.push((await V.rpc('safari_encounter', { p_steps: 3, p_zone: 'grass', p_area: 'safari', p_dist: 0 })).data?.accepted); }
    ok(acc.every((n) => n === 3), 'honest fast walking (6 steps/s, STEP_MS 165) is never cut by the speed limit', acc);
    const big = (await V.rpc('safari_encounter', { p_steps: 500 })).data;
    ok(big?.accepted <= 20, 'claiming 500 steps at once → only a few accepted', big?.accepted);
    await setS('safari_encounter_rate', 1);
    // 2) 만남 상한 없음: 8번 연속 만나도 계속 (이유 'max' 없음, 상태에 max_encounters 없음)
    const seen = [];
    for (let i = 0; i < 8; i++) { const a = await walk('grass', 'safari', 0); seen.push(!!a?.encounter && a.reason == null); await flee(a); }
    const s8 = (await V.rpc('safari_state')).data;
    ok(seen.every(Boolean) && s8?.encounters_today >= 8 && !('max_encounters' in s8), 'no encounter cap: 8 encounters in a row, no "max" reason', { seen, s8 });
    // 3) 레벨: 지도 (p_area) 의 범위 안에서 입구 거리만큼 · 맞지 않는 지도 = 그 구역의 가장 낮은 레벨
    const lv = async (zone, area, dist) => { const a = await walk(zone, area, dist); await flee(a); return a?.encounter?.level; };
    const L = {
      entrance: await lv('grass', 'safari', 0), farGrass: await lv('grass', 'safari', 9999), pond: await lv('pond', 'safari', 45),
      beach0: await lv('beach', 'beach', 0), beachEnd: await lv('beach', 'beach', 58), maze4: await lv('cave', 'maze4', null),
      liarCave: await lv('grass', 'maze4', 58), liarBeach: await lv('grass', 'beach', 58), noArea: await lv('cave', null, 99), negDist: await lv('beach', 'beach', -50),
    };
    ok(L.entrance >= 5 && L.entrance <= 6, 'safari entrance → Lv.5 (±1)', L);
    ok(L.farGrass >= 15 && L.farGrass <= 16 && L.pond >= 15 && L.pond <= 16, 'far grass / pond grass → top of the safari band (≤16), huge distance clamped', L);
    ok(L.beach0 >= 10 && L.beach0 <= 11 && L.beachEnd >= 49 && L.beachEnd <= 50, 'beach: Lv.10 at the entrance → Lv.50 at the far end', L);
    ok(L.maze4 >= 42 && L.maze4 <= 50, 'deepest cave floor (미혹의 동굴 지하 3층) → Lv.42–50', L);
    ok(L.liarCave === 5 && L.liarBeach === 5 && L.noArea === 14 && L.negDist >= 10 && L.negDist <= 11,
       'area that does not match the zone / no area → lowest level of that zone (no Lv.50 at the entrance)', L);
    // 4) 해변 = 물 · 얼음 타입만, 동굴에는 물이 첫 타입인 포켓몬이 없음, 풀숲에는 물 · 얼음 없음
    const typesOf = async (zone, area) => { const a = await walk(zone, area, 10); await flee(a); return (await spRow(a?.encounter?.species_id))?.btype || ''; };
    const beachT = [], caveT = [], grassT = [];
    for (let i = 0; i < 6; i++) beachT.push(await typesOf('beach', 'beach'));
    for (let i = 0; i < 4; i++) caveT.push(await typesOf('cave', 'shoal2'));
    for (let i = 0; i < 4; i++) grassT.push(await typesOf('grass', 'safari'));
    ok(beachT.every((t) => /물|얼음/.test(t)), 'beach pool: only water / ice types', beachT);
    ok(caveT.every((t) => t && !/^(물|얼음)/.test(t)), 'cave pool: rock/ground/ghost/poison… (never water-first)', caveT);
    ok(grassT.every((t) => t && !/물|얼음/.test(t)), 'grass pool: no water / ice types', grassT);
    // 5) 잡으면 그 레벨 그대로 · 또 잡으면 그 계열에서 레벨이 가장 높은 한 마리 +1
    const e = (await walk('beach', 'beach', 58))?.encounter;
    const line = (await spRow(e?.species_id))?.line_id;
    await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: line, p_stage: 1 });
    await admin.rpc('admin_set_level', { p_student_id: sid, p_line: line, p_level: 30 });
    await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: line, p_stage: 1 });
    const before = (await V.rpc('sync')).data.state.mons.filter((m) => m.line_id === line).sort((a, b) => a.id - b.id);
    const c = (await V.rpc('safari_result', { p_id: e?.id, p_throws: 1, p_caught: true })).data;
    const after = (await V.rpc('sync')).data.state.mons.filter((m) => m.line_id === line).sort((a, b) => a.id - b.id);
    const newMon = after.find((m) => m.id === c?.mon);
    ok(c?.caught && c.level === e?.level && newMon?.level === e?.level && e.level >= 49, 'caught safari Pokémon keeps its wild level (Lv.49–50 at the far beach)', { e, c, newMon });
    ok(before.length === 2 && c?.lv_up_mon === before[0].id && after.find((m) => m.id === before[0].id)?.level === 31
       && after.find((m) => m.id === before[1].id)?.level === before[1].level,
       'duplicate catch → the highest-level one of that species gets +1 (30 → 31), others unchanged', { before, after, up: c?.lv_up_mon });
    // 6) 레벨이 진화 레벨을 넘으면 진화의 돌 없이 진화 (0037 evolve 그대로)
    const evo = (await admin.select('evolutions?how=eq.level&lv=lte.40&select=from_species,to_species,lv&limit=1')).data?.[0];
    const from = evo && await spRow(evo.from_species);
    if (from) {
      await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: from.line_id, p_stage: from.stage });
      await admin.rpc('admin_set_level', { p_student_id: sid, p_line: from.line_id, p_level: evo.lv });
      const m = (await V.rpc('sync')).data.state.mons.filter((x) => x.line_id === from.line_id).sort((a, b) => b.id - a.id)[0];
      const tickets = (await V.rpc('sync')).data.state.profile.evo_tickets;
      const ev = await V.rpc('evolve', { p_mon: m?.id, p_to: evo.to_species });
      ok(ev.data?.success && ev.data.by_level && ev.data.evo_tickets === tickets, 'level ≥ evolution level → free evolution (no stone used)', [ev.error, ev.data?.by_level, evo]);
    } else ok(false, 'found a level evolution for the evolve check');
    // 7) 사파리볼 충전 30분: 서울 00:00 부터 30분마다 · 0.1 시간은 15분으로 올림 · 99 는 24시간
    await setS('safari_reset_hours', 0.5);
    const z = (await V.rpc('safari_state')).data;
    const mOf = (iso) => Number(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Seoul', minute: 'numeric' }));
    ok(z?.reset_hours === 0.5 && z.reset_minutes === 30 && mOf(z.period_start) % 30 === 0 && new Date(z.next_reset_at) - new Date(z.period_start) === 30 * 60e3,
       '30 min refill: period starts on :00/:30, next refill 30 min later', z);
    ok(z?.balls === 100, 'new 30-min period → balls refilled', z?.balls);
    await setS('safari_reset_hours', 0.1);
    ok((await V.rpc('safari_state')).data?.reset_minutes === 15, 'reset period clamped to at least 15 min');
    await setS('safari_reset_hours', 99);
    ok((await V.rpc('safari_state')).data?.reset_hours === 24, 'reset period clamped to at most 24 h');
  } finally {
    for (const k of keys) if (k in old) await setS(k, old[k]);
    await admin.rpc('admin_delete_students', { p_student_ids: [sid], p_confirm: '삭제' });
  }
}

console.log('\n[51] 별명 (0041): set_nickname · 길이/글자/욕설 막기 · 랭킹에 별명 · admin_clear_nickname');
{
  const [c1, c2] = [S[0], S[1]];
  await admin.rpc('admin_clear_nickname', { p_student_id: '022901' });   // 다시 돌려도 처음부터 (nickname_at 도 지움)
  await admin.rpc('admin_clear_nickname', { p_student_id: '022902' });
  const NICK = `별명시험${Math.floor(Math.random() * 90 + 10)}`;
  let r = await c1.rpc('set_nickname', { p_nick: `  ${NICK} ` });
  ok(r.data?.nickname === NICK && r.data?.display === NICK, 'set_nickname: trimmed, profile.nickname + display = nickname', r);
  for (const [bad, code, why] of [['가', 'BAD_NICKNAME', '1 char'], ['가나다라마바사아자차카', 'BAD_NICKNAME', '11 chars'], ['별명!!', 'BAD_NICKNAME', 'symbols'],
    ['트레이너_1', 'BAD_NICKNAME', 'underscore'], ['a1234567', 'BAD_NICKNAME', '5+ digits (student number)'], ['시발놈', 'NICKNAME_BLOCKED', 'bad word'],
    ['F u c k', 'NICKNAME_BLOCKED', 'spaced english bad word'], ['운영자 김', 'NICKNAME_BLOCKED', 'impersonation']]) {
    const x = await c1.rpc('set_nickname', { p_nick: bad });
    ok(x.error?.includes(code), `set_nickname rejects ${why} → ${code}`, x);
  }
  r = await c1.rpc('set_nickname', { p_nick: NICK });
  ok(r.data?.nickname === NICK, 'same nickname again = no-op (not rate limited)', r);
  r = await c1.rpc('set_nickname', { p_nick: 'Speedy 2' });
  ok(r.error?.includes('TRY_LATER'), 'changing again within 10s → TRY_LATER', r);
  const rk = (await c1.rpc('get_ranking_by', { p_gen: null, p_kind: 'score' })).data;
  const meRow = rk?.top?.find((t) => t.me);
  ok(meRow?.display === NICK && meRow?.nick === true, 'get_ranking_by: my row shows the nickname (nick=true)', meRow);
  const other = rk?.top?.find((t) => !t.me);
  ok(!other || other.nick === false || typeof other.nick === 'boolean', 'get_ranking_by: other rows carry nick flag', other);
  const cls = (await c1.rpc('class_ranking')).data;
  ok(!!cls && Array.isArray(cls.classes), 'class_ranking still works with nickname column', cls && Object.keys(cls));
  // 운영자만 지움
  const stu = await c2.rpc('admin_clear_nickname', { p_student_id: '022901' });
  const an = await anon.rpc('admin_clear_nickname', { p_student_id: '022901' });
  ok(!!stu.error && !!an.error, 'admin_clear_nickname: admins only', [stu.error, an.error]);
  const anSet = await anon.rpc('set_nickname', { p_nick: '익명시험' });
  ok(!!anSet.error, 'set_nickname: not for anon', anSet.error);
  r = await admin.rpc('admin_clear_nickname', { p_student_id: '022901' });
  ok(r.data?.was === NICK && r.data?.nickname === null, 'admin_clear_nickname clears + returns old nickname', r);
  const rk2 = (await c1.rpc('get_ranking_by', { p_gen: null, p_kind: 'score' })).data;
  const me2 = rk2?.top?.find((t) => t.me);
  ok(me2 && me2.display !== NICK && me2.nick === false, 'after clear: ranking shows the normal display again', me2);
  const nf = await admin.rpc('admin_clear_nickname', { p_student_id: '029999' });
  ok(nf.error?.includes('NOT_FOUND'), 'admin_clear_nickname unknown student → NOT_FOUND', nf);
  // 학생이 스스로 지우기 (빈 칸) — 10초 제한 뒤
  r = await c2.rpc('set_nickname', { p_nick: 'Tester  Two' });
  ok(r.data?.nickname === 'Tester Two', 'english + inner spaces collapsed to one', r);
  await new Promise((res) => setTimeout(res, 10500));
  r = await c2.rpc('set_nickname', { p_nick: '   ' });
  ok(r.data && r.data.nickname === null, 'blank → nickname cleared by the student', r);
}

console.log('\n[52] 반짝이는 포켓몬 · 빛나는 부적 · 알림 이유 (0042)');
{
  const keys = ['safari_balls_daily', 'safari_min_steps', 'safari_encounter_rate', 'safari_steps_per_sec', 'safari_flee', 'safari_flee_step',
                'safari_flee_legend', 'safari_reset_hours', 'ditto_disguise_chance', 'shiny_charm_mult', 'egg_shiny', 'legend_quests', 'roam_chance'];
  const old = Object.fromEntries((await admin.select(`settings?key=in.(${keys.join(',')})&select=key,value`)).data.map((x) => [x.key, x.value]));
  const setS = (k, v) => admin.patch(`settings?key=eq.${k}`, { value: v });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let sid; do { sid = '020' + String(500 + Math.floor(Math.random() * 500)); } while ((await anon.rpc('create_number_account', { p_student_id: sid, p_password: 'sh1234' })).error);
  const X = client(await pwLogin(`${sid}@code.local`, 'sh1234'));
  await X.rpc('register_profile', { p_kind: 'student', p_student_id: sid, p_name: '반짝테스트' });
  const st = async () => (await X.rpc('sync')).data.state;
  const walk = async () => {
    for (const t0 = Date.now(); Date.now() - t0 < 10000;) {
      const a = (await X.rpc('safari_encounter', { p_steps: 3, p_zone: 'grass', p_area: 'safari', p_dist: 0 })).data;
      if (a?.encounter || a?.reason) return a;
      await wait(400);
    }
    return null;
  };
  const flee = (a) => X.rpc('safari_result', { p_id: a?.encounter?.id, p_throws: 1, p_caught: false });
  try {
    // 0) 설정 (사용자가 고른 값)
    ok(Math.abs(Number(WSHINY0) - 1 / 512) < 1e-12 && Number(old.shiny_charm_mult) === 3
       && Math.abs(old.egg_shiny?.green - 1 / 256) < 1e-12 && Math.abs(old.egg_shiny?.yellow - 1 / 128) < 1e-12 && Math.abs(old.egg_shiny?.purple - 1 / 64) < 1e-12,
       'settings: wild shiny 1/512 · eggs 1/256 · 1/128 · 1/64 · charm ×3', [WSHINY0, old.shiny_charm_mult, old.egg_shiny]);
    const item = (await admin.select('items?key=eq.shiny_charm&select=key,name,pocket')).data?.[0];
    ok(item?.pocket === 'key' && item.name === '빛나는 부적', 'shiny_charm item (key pocket)', item);
    await setS('safari_reset_hours', 24); await setS('safari_balls_daily', 100); await setS('safari_min_steps', 0); await setS('safari_steps_per_sec', 10);
    await setS('safari_flee', 0); await setS('safari_flee_step', 0); await setS('safari_flee_legend', 0); await setS('ditto_disguise_chance', 0);
    await setS('safari_encounter_rate', 1);
    // 1) 반짝 100% → 만날 때부터 반짝 (safari pending.shiny) → 잡으면 박스의 그 한 마리 shiny + shiny_on
    await setS('wild_shiny_chance', 1);
    const a1 = await walk();
    ok(a1?.encounter?.shiny === true, 'wild shiny chance 1 → the safari encounter is shiny when it appears', a1?.encounter);
    const c1 = (await X.rpc('safari_result', { p_id: a1?.encounter?.id, p_throws: 1, p_caught: true })).data;
    const m1 = (await X.select(`collection?id=eq.${c1?.mon}&select=id,shiny,shiny_on`)).data?.[0];
    ok(c1?.caught && c1.shiny === true && m1?.shiny === true && m1.shiny_on === true, 'caught shiny encounter → collection shiny = shiny_on = true', [c1, m1]);
    const t1 = (await X.select(`tickets?nonce=eq.${c1?.nonce}&select=shiny`)).data?.[0];
    ok(t1?.shiny === true, 'its ticket records shiny', t1);
    // 2) 반짝 0% → 반짝 아님
    await setS('wild_shiny_chance', 0);
    const a0 = await walk();
    ok(a0?.encounter && a0.encounter.shiny === false, 'chance 0 → not shiny', a0?.encounter);
    await flee(a0);
    // 3) 만남이 없는 길 (소포 → _redeem_ticket) 도 굴림 + state.shiny_t
    await setS('wild_shiny_chance', 1);
    const gcode = `shiny${Math.random().toString(36).slice(2, 8)}`;
    const g = (await admin.rpc('admin_create_gift', { p_code: gcode, p_title: '반짝 소포', p_dex: 25, p_item: null, p_qty: 1, p_starts: null, p_ends: null, p_max: null })).data;
    const gc = (await X.rpc('gift_claim', { p_code: gcode })).data;
    const gm = (await X.select(`collection?id=eq.${gc?.mon}&select=shiny,shiny_on`)).data?.[0];
    const s1 = await st();
    ok(gc?.ok && gm?.shiny === true && gm.shiny_on === true && Object.keys(s1.shiny_t || {}).length >= 2, 'redeem path (gift) rolls shiny too · state.shiny_t lists shiny tickets', [gc, gm, s1.shiny_t]);
    if (g?.id) await admin.rpc('admin_delete_gift', { p_id: g.id });
    // 5) 퀘스트 알림 = 해낸 조건 글 · 깨어남 알림 = 조건 + 사파리존 자리
    const Q = structuredClone(old.legend_quests);
    Q.find((q) => q.dex === 482).n = 1;
    Q.find((q) => q.dex === 249).n = 1;
    await setS('legend_quests', Q);
    const water = (await admin.select(`lines?select=id&subject=eq.${encodeURIComponent('야생')}&rarity=eq.common&ultra=eq.false&legend_src=is.null&btype=eq.${encodeURIComponent('물')}&order=id&limit=1`)).data?.[0]?.id;
    await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: water, p_stage: 1 });
    const s2 = await st();
    const nq = s2.notices.find((n) => n.kind === 'quest');
    ok(nq?.body.startsWith('포켓몬을 1마리 잡았어요!') && nq.body.includes('\n') && nq.data?.reason === '포켓몬을 1마리 잡았어요!', 'quest notice body starts with the achieved condition', nq);
    const nr = s2.notices.find((n) => n.kind === 'legend_ready' && n.data?.dex === 249);
    ok(nr?.body.startsWith('물 타입 포켓몬을 1마리 잡았어요!') && nr.body.includes('여울의 동굴'), "'깨어났다' notice: condition + where in the Safari", nr);
    await setS('legend_quests', old.legend_quests);
    // 6) 방랑 전설: 만난 장소 QR 이름이 알림에 · QR 로 만난 만남도 반짝 (100%)
    await setS('roam_chance', 1); await setS('wild_shiny_chance', 1);
    const spots = (await admin.rpc('admin_roam_spots', { p_at: new Date().toISOString() })).data;
    const rk = spots?.find((x) => x.dex === 243);
    await X.rpc('sync', { p_scans: [{ n: nonce(), q: rk.qr, t: T[rk.qr].token }] });
    const re = (await st()).encounters.find((e) => e.kind === 'roam');
    ok(re?.shiny === true, 'roaming encounter from a QR scan is shiny (chance 1) · encounters carry shiny', re);
    await X.rpc('encounter_result', { p_id: re?.id, p_caught: true });
    const nro = (await st()).notices.find((n) => n.kind === 'roam');
    ok(nro?.body.includes(rk.qr_name) && nro.body.includes('방랑하던') && nro.data?.shiny === true && nro.body.includes('반짝'), 'roam notice says where it was met (QR name) + shiny line', [nro, rk.qr_name]);
    await setS('roam_chance', old.roam_chance ?? 0.3); await setS('wild_shiny_chance', 0);
    // 7) 학교 도감 완성 → 빛나는 부적 한 번 + 알림 한 번
    const elig = (await admin.select(`lines?select=id,max_stage&active=eq.true&withdrawn=eq.false&bonus=eq.false&secret=eq.false&subject=neq.${encodeURIComponent('야생')}&order=id`)).data;
    for (const l of elig) await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: l.id, p_stage: 1 });
    for (const l of elig) if (l.max_stage > 1) await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: l.id, p_stage: l.max_stage });
    for (const l of elig) if (l.max_stage > 2) await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: l.id, p_stage: 2 });
    const brs = ((await admin.select('species?id=gte.10000&select=id,line_id,stage')).data || []).filter((x) => elig.some((l) => l.id === x.line_id));
    const evs = (await admin.select('evolutions?to_species=gte.10000&select=from_species,to_species')).data || [];
    for (const b of brs) {
      const e = evs.find((x) => x.to_species === b.id);
      const from = e && (await admin.select(`species?id=eq.${e.from_species}&select=id,stage`)).data?.[0];
      if (!from || from.id >= 10000) continue;
      await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: b.line_id, p_stage: from.stage });
      await admin.rpc('admin_set_level', { p_student_id: sid, p_line: b.line_id, p_level: 100 });
      await admin.rpc('admin_adjust_tickets', { p_student_id: sid, p_delta: 1 });
      const m = (await myMons(X)).filter((x) => x.line_id === b.line_id && x.stage === from.stage).pop();
      await X.rpc('evolve', { p_mon: m?.id, p_to: b.id });
    }
    const s3 = await st();
    const charmQty = async () => ((await X.rpc('bag_state', { p_since: 0 })).data?.items || []).find((x) => x.key === 'shiny_charm')?.qty;   // 학생은 inventory 표를 직접 못 읽음 (RLS)
    const inv = { qty: await charmQty() };
    const charmN = s3.notices.filter((n) => n.kind === 'charm');
    ok(inv?.qty === 1 && s3.charm === true && charmN.length === 1 && charmN[0].title === '빛나는 부적을 받았다!' && charmN[0].body.includes('3배') && charmN[0].body.includes('도감을 모두 채웠어요!'),
       'dex complete → 빛나는 부적 + notice', [inv, charmN, s3.profile?.dex_count]);
    await admin.rpc('admin_grant_monster', { p_student_id: sid, p_line: elig[0].id, p_stage: 1 });
    const s4 = await st();
    ok((await charmQty()) === 1 && s4.notices.filter((n) => n.kind === 'charm').length === 1, 'given only once (later catches give nothing more)');
    const n100 = s4.notices.find((n) => n.kind === 'dex100');
    ok(!n100 || n100.body.startsWith('학교 도감을 모두 채웠어요!'), 'dex100 notice (if configured) starts with the reason', n100);
    // 8) 부적 (도감 완성으로 받은 것): 확률 × shiny_charm_mult (최대 1), 0 은 그대로 0 · 쓸 수 없음
    await setS('wild_shiny_chance', 0.5); await setS('shiny_charm_mult', 2);
    const withCharm = [];
    for (let i = 0; i < 4; i++) { const a = await walk(); withCharm.push(a?.encounter?.shiny); await flee(a); }
    ok(withCharm.every((x) => x === true), 'charm: 1/2 × 2 = 100% → every encounter shiny', withCharm);
    await setS('wild_shiny_chance', 0);
    const zero = []; for (let i = 0; i < 3; i++) { const a = await walk(); zero.push(a?.encounter?.shiny); await flee(a); }
    ok(zero.every((x) => x === false), 'charm multiplies (0 × 2 = 0), never adds', zero);
    ok((await st()).charm === true, 'state.charm = true while holding the charm');
    const m0 = (await X.rpc('sync')).data.state.mons?.[0]?.id;
    ok((await X.rpc('bag_use', { p_item: 'shiny_charm', p_mon: m0 })).error === 'KEY_ITEM', 'the charm cannot be used (KEY_ITEM)');
    ok((await X.rpc('bag_set_held', { p_mon: m0, p_item: 'shiny_charm' })).error, 'the charm cannot be held');
    await setS('shiny_charm_mult', old.shiny_charm_mult ?? 3);
  } finally {
    for (const k of keys) if (k in old) await setS(k, old[k]);
    await setS('wild_shiny_chance', 0);
    await admin.rpc('admin_delete_students', { p_student_ids: [sid], p_confirm: '삭제' });
  }
}

await admin.rpc('admin_delete_students', { p_student_ids: [`g:${GUEST}`], p_confirm: '삭제' });   // [13] 손님 계정 정리
await patchSetting('wild_chance', WILD0);   // 시험 전 값으로
await patchSetting('ditto_disguise_chance', DITTO0);
await patchSetting('roam_chance', ROAM0);
await patchSetting('battle_fields', BF_ORIG);
await patchSetting('wild_shiny_chance', WSHINY0);
await patchSetting('quiz_stone_chance', STONE0.quiz_stone_chance ?? 0.35); await patchSetting('battle_stone_chance', STONE0.battle_stone_chance ?? 0.5);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
