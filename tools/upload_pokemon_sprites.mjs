// 포켓몬 그림 809마리 (+ 색이 다른 그림) → Storage 'sprites' + species.sprite / sprite_shiny (0032). 다시 실행해도 됨 (덮어씀).
//  #1–649: 공식 블랙·화이트 움직이는 GIF (PokeAPI/sprites), #650–809: 같은 화풍 도트 PNG (smogon/sprites gen5).
// 사용 (실제 서버):
//   SUPA_URL=https://<프로젝트>.supabase.co SUPA_KEY=<publishable key> ADMIN_EMAIL=<운영자 로그인 이메일> ADMIN_PASSWORD=<비밀번호> node tools/upload_pokemon_sprites.mjs
// 아무것도 안 주면 staging (tests/.env 의 시험용 운영자). 몇 마리만: node tools/upload_pokemon_sprites.mjs 1,2,3   (species.id)
// 표 (species.id → 전국도감 번호, 영어 이름) = tools/pokemon_sprites.json (python tools/gen_pokemon.py 가 만듦)
import { readFileSync, existsSync } from 'node:fs';
const env = existsSync('tests/.env')
  ? Object.fromEntries(readFileSync('tests/.env', 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2))) : {};
const U = process.env.SUPA_URL || env.SUPABASE_URL;
const KEY = process.env.SUPA_KEY || env.SUPABASE_KEY || 'sb_publishable__nwfE6aqdvVdPCCvKu9IdA_qL5pbDAk';
const login = await (await fetch(`${U}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL || 'admin@staff.test', password: process.env.ADMIN_PASSWORD || env.TEST_PASSWORD }),
})).json();
if (!login.access_token) throw new Error('운영자 로그인 실패: ' + JSON.stringify(login));
const H = { apikey: KEY, Authorization: `Bearer ${login.access_token}` };
const J = JSON.parse(readFileSync(new URL('./pokemon_sprites.json', import.meta.url), 'utf8'));
const ident = Object.fromEntries(Object.entries(J.ident).map(([k, v]) => [Number(k), v]));
const PA = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated';
const SM = 'https://raw.githubusercontent.com/smogon/sprites/master/src/sprites/gen5';
const UNDERSCORE = new Set([772, 782, 783, 784, 785, 786, 787, 788]);   // smogon 파일 이름: type_null, jangmo_o, tapu_koko …
const FORMS = J.forms || {};   // 이벤트 포켓몬 (0044, 도감 810~): smogon gen5 폼 그림 이름
const src = (n, shiny) => (FORMS[n] ? [`${SM}/s${FORMS[n]}${shiny ? '-s' : ''}.png`, 'png'] : n <= 649 ? [`${PA}/${shiny ? 'shiny/' : ''}${n}.gif`, 'gif']
  : [`${SM}/s${UNDERSCORE.has(n) ? ident[n].replace(/-/g, '_') : ident[n].replace(/-/g, '')}${shiny ? '-s' : ''}.png`, 'png']);
const only = process.argv[2] ? new Set(process.argv[2].split(',').map(Number)) : null;
const jobs = Object.entries(J.species).map(([gid, n]) => [Number(gid), n]).filter(([gid]) => !only || only.has(gid));
let done = 0; const fails = [];
async function one([gid, n]) {
  const patch = {};
  for (const shiny of [false, true]) {
    const [url, ext] = src(n, shiny);
    const r = await fetch(url);
    if (!r.ok) { fails.push(`${gid}/#${n}${shiny ? ' shiny' : ''} ${r.status} ${url}`); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    const path = `${gid}-p${shiny ? 's' : ''}.${ext}`;
    const up = await fetch(`${U}/storage/v1/object/sprites/${path}`, { method: 'POST', headers: { ...H, 'Content-Type': ext === 'gif' ? 'image/gif' : 'image/png', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }, body: buf });
    if (!up.ok) { fails.push(`${gid} upload ${up.status} ${await up.text()}`); continue; }
    patch[shiny ? 'sprite_shiny' : 'sprite'] = path;
  }
  if (Object.keys(patch).length) {
    const p = await fetch(`${U}/rest/v1/species?id=eq.${gid}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
    if (!p.ok) fails.push(`${gid} patch ${p.status} ${await p.text()}`);
  }
  if (++done % 100 === 0) console.log(done, '/', jobs.length);
}
const q = [...jobs];
await Promise.all(Array.from({ length: 8 }, async () => { while (q.length) await one(q.shift()); }));
console.log('done', done, 'fails', fails.length); for (const f of fails) console.log(' ', f);
