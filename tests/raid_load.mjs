// Raid load test against the STAGING Supabase project.
// Run:  node tests/raid_load.mjs [players=20] [seconds=60] [interval_ms=800] [boss_hp=400000]
// (a small boss_hp turns it into a demo: the bots win the raid; its join link is written to .work/raid_now.txt)
// 100 phones sending taps every 4 s = 25 requests/s. Supabase limits password logins (~30 per 5 min per IP),
// so we log in fewer players and let each send more often: 20 players × every 0.8 s = the same 25 requests/s.
// Prints request latency (p50/p95/max), errors and how much HP the players took off. Opens one printable raid and ends it afterwards.
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('./.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(Boolean).map(l => l.split(/=(.*)/s).slice(0, 2)));
const URL_ = env.SUPABASE_URL;
const KEY = env.SUPABASE_KEY || 'sb_publishable__nwfE6aqdvVdPCCvKu9IdA_qL5pbDAk';
const [N = 20, SECS = 60, EVERY = 800, HP = 400000] = process.argv.slice(2).map(Number);

const login = async (email, password) => (await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).access_token;
const rpc = async (tok, fn, args = {}) => {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(args) });
  const t = await r.text();
  return r.ok ? { data: t ? JSON.parse(t) : null } : { error: (t && JSON.parse(t).message) || String(r.status) };
};

const admin = await login('admin@staff.test', env.TEST_PASSWORD);
if (!admin) throw new Error('admin login failed (rate limit? wait 5 minutes)');
const raid = (await rpc(admin, 'admin_create_raid', { p_species: 3, p_hp: HP, p_minutes: 5, p_tv: false, p_title: HP < 400000 ? '데모 레이드' : '부하 테스트 레이드' })).data;
console.log(`raid ${raid.q} opened (HP ${raid.hp_max})`);
try { writeFileSync(new URL('../.work/raid_now.txt', import.meta.url), `${raid.q}.${raid.t}`); } catch { /* optional */ }

const players = [];
for (let i = 0; i < N; i++) {
  let sid, tok;
  for (let k = 0; k < 20 && !tok; k++) {
    sid = '022' + String(500 + Math.floor(Math.random() * 500));
    if ((await rpc(null, 'create_number_account', { p_student_id: sid, p_password: 'loadtest1' })).error) continue;
    tok = await login(`${sid}@code.local`, 'loadtest1');
  }
  if (!tok) { console.log(`login stopped at ${i} players (rate limit)`); break; }
  await rpc(tok, 'register_profile', { p_kind: 'student', p_student_id: sid, p_name: `부하${i}` });
  const j = await rpc(tok, 'raid_join', { p_q: raid.q, p_t: raid.t });
  if (j.error) { console.log('join failed', j.error); continue; }
  players.push({ sid, tok });
}
console.log(`${players.length} players joined; attacking for ${SECS}s, each every ${EVERY} ms (~${Math.round(players.length * 1000 / EVERY)} req/s)`);

const lat = []; let errors = 0; const errKinds = {}; let lastHp = raid.hp_max;
const end = Date.now() + SECS * 1000;
await Promise.all(players.map(async (p, i) => {
  await new Promise(r => setTimeout(r, (EVERY / players.length) * i));        // spread the start
  while (Date.now() < end) {
    const s = performance.now();
    const r = await rpc(p.tok, 'raid_attack', { p_raid: raid.id, p_taps: 6 });
    lat.push(performance.now() - s);
    if (r.error) { errors++; errKinds[r.error] = (errKinds[r.error] || 0) + 1; } else lastHp = Math.min(lastHp, r.data.hp);
    await new Promise(res => setTimeout(res, EVERY));
  }
}));

lat.sort((a, b) => a - b);
const q = (x) => Math.round(lat[Math.min(lat.length - 1, Math.floor(lat.length * x))]);
const state = (await rpc(players[0].tok, 'raid_state', { p_raid: raid.id })).data;
console.log(JSON.stringify({
  requests: lat.length, req_per_s: +(lat.length / SECS).toFixed(1), errors, errKinds,
  latency_ms: { p50: q(0.5), p95: q(0.95), max: Math.round(lat[lat.length - 1]) },
  boss: { hp: state.hp, hp_max: state.hp_max, damage_dealt: state.hp_max - state.hp, players: state.players, status: state.status },
}, null, 2));
if (state.status === 'active') await rpc(admin, 'admin_end_raid', { p_id: raid.id });
for (const p of players) await rpc(admin, 'admin_unlink', { p_student_id: p.sid });
console.log('raid ended and test players removed');
