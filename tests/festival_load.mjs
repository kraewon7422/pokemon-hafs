// Festival-scale load test against the STAGING Supabase project (not production).
// Run:  node tests/festival_load.mjs [seconds=60] [scale=1] [players=24]
// Login is rate-limited (~30 per 5 min per IP), so 24 temporary students (created here, deleted at the end) send the request MIX of ~600 phones:
//   sync 10/s (every phone once a minute) · battle_inbox 20/s (half the phones on home/battle tab, every 15 s)
//   raid_attack 25/s (100 raid players, every 4 s) · battle_act 12/s (60 players in AI battles) · ranking 3/s
// scale=2 doubles every rate. Prints latency p50/p95/p99 and errors per kind.
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('./.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(Boolean).map(l => l.split(/=(.*)/s).slice(0, 2)));
const URL_ = env.SUPABASE_URL;
const KEY = env.SUPABASE_KEY || 'sb_publishable__nwfE6aqdvVdPCCvKu9IdA_qL5pbDAk';
const SECS = Number(process.argv[2] || 60);
const SCALE = Number(process.argv[3] || 1);

const login = async (email) => (await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: env.TEST_PASSWORD }) })).json()).access_token;
const rpc = async (tok, fn, args = {}) => {
  const t0 = performance.now();
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify(args), signal: AbortSignal.timeout(30000) });   // 30초 넘게 안 오면 오류로 셈 (멈춘 요청 하나가 시험 전체를 붙잡지 않게)
  const txt = await r.text();
  return { ms: performance.now() - t0, ok: r.ok, status: r.status, body: txt ? JSON.parse(txt) : null };
};

const admin = await login('admin@staff.test');
// 요청 섞음을 임시 학생 여러 명에게 나눠 보냄 (기본 24명, 네 번째 숫자로 바꿈 · 로그인 제한 때문에 25명 이하).
// 게임 함수는 대부분 그 학생의 profiles 줄을 잠그므로, 계정 4개에 600명 몫을 몰면 한 줄에 줄이 길게 서서 실제보다 훨씬 느리게 나옴.
const NPL = Math.min(25, Number(process.argv[4] || 24));
const PW = 'load' + Math.random().toString(36).slice(2, 8);
const sids = [], toks = [];
const anonRpc = (fn, args) => fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(30000) });
const loginPw = async (email, password) => (await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(30000) })).json()).access_token;
while (sids.length < NPL) {
  const sid = '020' + String(500 + Math.floor(Math.random() * 500));   // 임시 학생 번호 020500 ~ 020999 (실제 학생 번호 아님)
  if (sids.includes(sid) || !(await anonRpc('create_number_account', { p_student_id: sid, p_password: PW })).ok) continue;
  const t = await loginPw(`${sid}@code.local`, PW);
  await rpc(t, 'register_profile', { p_kind: 'student', p_student_id: sid, p_name: '부하시험' });
  await rpc(t, 'accept_terms', { p_ok: true });
  for (const l of [1, 2, 3]) await rpc(admin, 'admin_grant_monster', { p_student_id: sid, p_line: l, p_stage: 3 });
  sids.push(sid); toks.push(t);
}
console.log('players', toks.length);
const raid = (await rpc(admin, 'admin_create_raid', { p_species: 3, p_hp: 10000000, p_minutes: Math.ceil(SECS / 60) + 2, p_tv: false, p_title: '부하 테스트' })).body;
// 0036 이후 배틀 · 레이드는 계열 번호가 아니라 포켓몬 하나하나의 id 를 받음 (sync 의 state.mons)
const monIds = [];
for (const t of toks) monIds.push(((await rpc(t, 'sync', { p_scans: [], p_ver: null })).body?.state?.mons || []).map((m) => m.id).slice(0, 3));
for (const [k, t] of toks.entries()) await rpc(t, 'raid_join', { p_q: raid.q, p_t: raid.t, p_mon: monIds[k][0] });
const startCpu = (k) => rpc(toks[k], 'battle_start_cpu', { p_mons: monIds[k], p_format: 'single', p_fair: false });
const battles = [];
for (const k of toks.keys()) battles.push((await startCpu(k)).body?.id);
const bad = battles.filter((b) => !b).length; if (bad) console.log('battle_start_cpu failed for', bad, 'players');

const stats = {};
const rec = (k, r) => { (stats[k] ||= { ms: [], err: 0, codes: {} }); stats[k].ms.push(r.ms); if (!r.ok) { stats[k].err++; const c = r.body?.message || r.status; stats[k].codes[c] = (stats[k].codes[c] || 0) + 1; } };
let i = 0; let rule = 0;
const pick = () => toks[i++ % toks.length];
const jobs = {
  sync: [10, () => rpc(pick(), 'sync', { p_scans: [], p_ver: null })],
  battle_inbox: [20, () => rpc(pick(), 'battle_inbox')],
  raid_attack: [25, () => rpc(pick(), 'raid_attack', { p_raid: raid.id, p_taps: 20 })],
  battle_act: [12, async () => {
    const k = i++ % toks.length;
    let r = await rpc(toks[k], 'battle_act', { p_id: battles[k], p_action: { move: 1 + (i % 2) } });
    if (r.body?.need) r = await rpc(toks[k], 'battle_act', { p_id: battles[k], p_action: { switch: r.body.sides[r.body.me].mons.findIndex((m, j) => m.hp > 0 && j !== r.body.sides[r.body.me].active) } });
    if (r.body?.status === 'over') battles[k] = (await startCpu(k)).body?.id;
    // game-rule refusals (two requests on one battle at once, a move with no PP left, a move during a switch turn)
    // are the server answering correctly, not a load problem — count them apart
    if (!r.ok && ['BATTLE_WAIT', 'NO_PP', 'BAD_ACTION'].includes(r.body?.message)) { r.ok = true; rule++; }
    return r;
  }],
  ranking: [3, () => rpc(pick(), 'get_ranking_by', { p_kind: 'score' })],
};

console.log(`load: ${SECS}s, ${Object.values(jobs).reduce((a, [r]) => a + r, 0) * SCALE} req/s (scale ${SCALE})`);
const end = Date.now() + SECS * 1000;
const running = [];
for (const [k, [rate, fn]] of Object.entries(jobs)) {
  const gap = 1000 / (rate * SCALE);
  running.push((async () => {
    const inflight = [];
    for (let t = Date.now(); t < end; t += gap) {
      const wait = t - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
      inflight.push(fn().then(r => rec(k, r)).catch((e) => rec(k, { ms: 0, ok: false, status: e?.name === 'TimeoutError' ? 'timeout30s' : 'net' })));
    }
    await Promise.all(inflight);
  })());
}
await Promise.all(running);
const q = (a, p) => a.length ? Math.round(a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]) : 0;
let total = 0, errs = 0;
console.log('kind           n    err   p50   p95   p99 (ms)');
for (const [k, s] of Object.entries(stats)) {
  total += s.ms.length; errs += s.err;
  console.log(`${k.padEnd(13)} ${String(s.ms.length).padStart(4)} ${String(s.err).padStart(5)} ${String(q(s.ms, .5)).padStart(5)} ${String(q(s.ms, .95)).padStart(5)} ${String(q(s.ms, .99)).padStart(5)}`, Object.keys(s.codes).length ? s.codes : '');
}
console.log(`total ${total} requests in ${SECS}s = ${(total / SECS).toFixed(1)} req/s, errors ${errs} (game-rule refusals, not errors: ${rule})`);

// 끝정리 (결과를 먼저 찍고, 서버가 아직 바쁘면 느려도 되게)
const safe = (p) => p.catch((e) => ({ body: String(e?.name || e) }));
await safe(rpc(admin, 'admin_end_raid', { p_id: raid.id }));
for (const [k, t] of battles.entries()) if (t) await safe(rpc(toks[k], 'battle_forfeit', { p_id: t }));
const del = await safe(rpc(admin, 'admin_delete_students', { p_student_ids: sids, p_confirm: '삭제' }));
console.log('temp students deleted', JSON.stringify(del.body));

