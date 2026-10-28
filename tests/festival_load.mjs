// Festival-scale load test against the STAGING Supabase project (not production).
// Run:  node tests/festival_load.mjs [seconds=60] [scale=1]
// Login is rate-limited (~30 per 5 min per IP), so a few test accounts send the request MIX of ~600 phones:
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
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify(args) });
  const txt = await r.text();
  return { ms: performance.now() - t0, ok: r.ok, status: r.status, body: txt ? JSON.parse(txt) : null };
};

const admin = await login('admin@staff.test');
const toks = [];
for (const e of ['022001', '022002', '022003', '021004']) toks.push(await login(`${e}@test.local`));
// every test student needs monsters for battles
for (const sid of ['022001', '022002', '022003', '021004'])
  for (const l of [1, 2, 3]) await rpc(admin, 'admin_grant_monster', { p_student_id: sid, p_line: l, p_stage: 3 });
const raid = (await rpc(admin, 'admin_create_raid', { p_species: 3, p_hp: 10000000, p_minutes: Math.ceil(SECS / 60) + 2, p_tv: false, p_title: '부하 테스트' })).body;
for (const t of toks) await rpc(t, 'raid_join', { p_q: raid.q, p_t: raid.t, p_line: 1 });
const battles = [];
for (const t of toks) battles.push((await rpc(t, 'battle_start_cpu', { p_lines: [1, 2, 3] })).body?.id);

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
    if (r.body?.status === 'over') battles[k] = (await rpc(toks[k], 'battle_start_cpu', { p_lines: [1, 2, 3] })).body?.id;
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
      inflight.push(fn().then(r => rec(k, r)).catch(() => rec(k, { ms: 0, ok: false, status: 'net' })));
    }
    await Promise.all(inflight);
  })());
}
await Promise.all(running);
await rpc(admin, 'admin_end_raid', { p_id: raid.id });
for (const [k, t] of battles.entries()) if (t) await rpc(toks[k], 'battle_forfeit', { p_id: t });

const q = (a, p) => a.length ? Math.round(a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]) : 0;
let total = 0, errs = 0;
console.log('kind           n    err   p50   p95   p99 (ms)');
for (const [k, s] of Object.entries(stats)) {
  total += s.ms.length; errs += s.err;
  console.log(`${k.padEnd(13)} ${String(s.ms.length).padStart(4)} ${String(s.err).padStart(5)} ${String(q(s.ms, .5)).padStart(5)} ${String(q(s.ms, .95)).padStart(5)} ${String(q(s.ms, .99)).padStart(5)}`, Object.keys(s.codes).length ? s.codes : '');
}
console.log(`total ${total} requests in ${SECS}s = ${(total / SECS).toFixed(1)} req/s, errors ${errs} (game-rule refusals, not errors: ${rule})`);
