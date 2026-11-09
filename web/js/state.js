// Shared state + small lookups over the catalog and the last server snapshot (used by every screen).
import { $ } from './ui.js';
import { overlay } from './app.js';

export const S = {
  catalog: null,        // { lines, species, qrs, at }
  snap: null,           // server state from sync() (+ ver, synced_at)
  outbox: [],           // [{ n, q, t, at }]
  celebrated: new Set(),
  tab: 'home',
  online: navigator.onLine,
  syncing: null,
  dexFilter: 'all',
  rankScope: 'all',
  rank: {},
  overlay: null,        // currently open overlay element
  bagOpen: false,
  installEvt: null,
  btSeen: new Set(),    // 배틀 신청 중 이미 알린 것
};

export const app = () => $('#app');
export const lineOf = (id) => S.catalog?.lines.find((l) => l.id === id);
export const maxStage = (line) => lineOf(line)?.max_stage ?? 3;
export const speciesOf = (id) => S.catalog?.species.find((s) => s.id === id);
export const qrName = (id) => S.catalog?.qrs.find((q) => q.id === id)?.name;
// 특성 (0039): key → {key, name, description}. 모르는 key 면 null
export const abilityOf = (key) => (key && (S.catalog?.abilities || []).find((a) => a.key === key)) || null;
// 계열의 곧은 길 (첫 갈래) 의 종 번호. 갈래 종 (0037: 쥬피썬더 · 엘레이드 …) 은 id 10000+ → 포켓몬마다 species_id 를 씀 (spIdOf · monSp)
export const dexOf = (line, stage) => (line - 1) * 3 + stage;
// 계열 · 단계의 종 (0052: 폼 계열 1000+ 은 종 번호가 계열에서 안 나옴 → 카탈로그에서, 서버 _col_species 처럼 가장 작은 번호)
export const spIdOfLine = (line, stage = 1) => (S.catalog?.species || []).filter((x) => x.line_id === line && x.stage === stage).sort((a, b) => a.id - b.id)[0]?.id ?? dexOf(line, stage);
// 도감 번호 = 실제 전국도감 번호 (No.001 이상해씨 … No.807 제라오라, 0049: 멜탄 808 · 멜메탈 809 없음 · 이벤트 810~). species.id 는 (계열-1)*3+단계 그대로 (서버가 씀)
export const dexNo = (sp) => `No.${String(sp?.dex || 0).padStart(3, '0')}`;
// 도감 칸 = 전국도감 번호 (같은 번호가 두 계열에 있어도 한 칸). 번호 없는 운영자 포켓몬은 -id
export const dexKey = (sp) => sp?.dex || -(sp?.id || 0);
// 진화 길 (0037 public.evolutions). 예전 서버 (표 없음) = 계열의 다음 단계
export const evosFrom = (spId) => {
  const ev = S.catalog?.evolutions;
  if (ev) return ev.filter((e) => e.from_species === spId).sort((a, b) => a.sort - b.sort || a.to_species - b.to_species);
  const sp = speciesOf(spId); const nx = sp && speciesOf(dexOf(sp.line_id, sp.stage + 1));
  return nx && nx.line_id === sp.line_id ? [{ from_species: spId, to_species: nx.id, how: nx.evo_item ? 'item' : 'level', lv: nx.evo_item ? null : nx.evo_lv, sort: 0 }] : [];
};
export const evoParent = (spId) => {
  const ev = S.catalog?.evolutions;
  if (ev) return ev.find((e) => e.to_species === spId)?.from_species ?? null;
  const sp = speciesOf(spId);
  return sp && sp.stage > 1 && sp.id < 10000 ? sp.id - 1 : null;
};
// 1단계 → … → 그 종
export function spPath(spId) {
  const out = [];
  for (let x = spId, i = 0; x != null && i < 5; x = evoParent(x), i++) out.unshift(x);
  return out;
}
// 도감 순서 = 전국도감 번호 순
export function sortDex(cat) {
  cat.species.sort((a, b) => (a.dex || 9999) - (b.dex || 9999) || a.id - b.id);
  return cat;
}
// 도감 기록 (0036): 계열마다 한 줄 — 가장 높은 단계 · 잡은 횟수 합 · 지금 가진 수 count. 놓아준 계열도 '잡은 적 있음'으로 남음
export const collection = () => S.snap?.collection || [];
// 박스의 포켓몬 한 마리씩 (0036): { id, line_id, stage, level, pos, held, shiny, shiny_on, from_egg, evo_fails, caught_at }
export const mons = () => S.snap?.mons || [];
export const monById = (id) => (id == null ? null : mons().find((m) => m.id === id) || null);
export const monsOf = (line) => mons().filter((m) => m.line_id === line);
export const spIdOf = (m) => (m ? m.species_id || dexOf(m.line_id ?? m.line, m.stage) : null);
export const monSp = (m) => (m ? speciesOf(spIdOf(m)) : null);
export const boxMax = () => Number(S.snap?.rules?.box_max) || 900;
export const boxFull = () => mons().length >= boxMax();
// 트레이너 카드 포켓몬: 고른 포켓몬 (set_partner, 0036 = 포켓몬 번호), 없으면 가장 많이 진화한 포켓몬
export const partnerMon = () => monById(S.snap?.profile?.partner)
  || [...mons()].sort((a, b) => b.stage - a.stage || b.level - a.level || new Date(b.caught_at) - new Date(a.caught_at))[0];
export const owned = (line) => collection().find((c) => c.line_id === line);
export const rules = () => ({ bag_max: 5, qr_daily_cap: 3, evo_prob: [0, 0.7, 0.35], evo_pity_step: 0.1, evo_pity_max: [0, 1, 2], ...(S.snap?.rules || {}) });
export const serverPending = () => (S.snap?.tickets || []).filter((t) => t.status === 'pending');
// tickets in the bag = server pending + local scans the server hasn't seen yet
export const specialOf = (nonce) => (S.snap?.special || []).find((x) => x.nonce === nonce);
export const bag = () => [
  ...serverPending().map((t) => ({ nonce: t.nonce, qr_id: t.qr_id, token: t.token, name: t.qr_name, synced: true, special: specialOf(t.nonce) })),
  ...S.outbox.filter((o) => !serverPending().some((t) => t.nonce === o.n))
    .map((o) => ({ nonce: o.n, qr_id: o.q, token: o.t, name: o.q === '_' ? '수동 코드' : qrName(o.q) || '확인 중인 장소', synced: false })),
];
export const normalBag = () => bag().filter((t) => !t.special);   // only these count towards bag_max
export const evolvable = () => mons().filter((c) => c.stage < maxStage(c.line_id) && !isWithdrawn(c.line_id) && evosFrom(spIdOf(c)).length > 0);
// 본 적 있는 종 (0037 서버 snap.seen = 가진 · 놓아준 포켓몬의 종 + 앞 단계들). 예전 서버면 계열의 가장 높은 단계까지
export function seenIds() {
  const s = S.snap?.seen;
  if (Array.isArray(s)) return new Set(s);
  const out = new Set();
  for (const c of collection()) for (let st = 1; st <= c.stage; st++) out.add(dexOf(c.line_id, st));
  return out;
}
// 도감 칸 (전국도감 번호) 중 본 것. 0052: 이벤트 폼은 칸을 채우지 않음 (전체 수에 안 셈), pred = 그 종만 (학교 = 선생님 · 특별 폼)
export function seenKeys(pred = (sp) => !isEvent(sp.line_id)) {
  const out = new Set();
  for (const id of seenIds()) { const sp = speciesOf(id); if (sp && pred(sp)) out.add(dexKey(sp)); }
  return out;
}
export const isWithdrawn = (line) => (S.snap?.rules?.withdrawn || []).includes(line) || !!lineOf(line)?.withdrawn;
export const isSecret = (line) => !!lineOf(line)?.secret;
export const isMythic = (line) => !!lineOf(line)?.mythic;
export const isBonus = (line) => !!lineOf(line)?.bonus || isSecret(line) || isMythic(line);
// 야생 포켓몬 = 선생님이 없는 계열 (QR 의 야생 · 걸음 · 알 · 레이드로 만남)
export const isWild = (line) => lineOf(line)?.subject === '야생';
// 이벤트 포켓몬 (0044: 지우개굴닌자 · 지우의 피카츄, 도감 810~) = 이상한 소포로만 받음. 야생 계열 + bonus (도감 수에 안 셈)
export const isEvent = (line) => formKind(line) === 'event';
// ── 폼 (0052): 한 도감 번호에 일반 · 선생님 ("물리 쌤의 피카츄") · 이벤트 (지우의 피카츄) 모습. lines.form_kind · family_id · form_label, species.form_of
//   예전 서버 (form_kind 없음) = 야생 계열은 일반 (bonus 면 이벤트), 나머지는 선생님/특별
export function formKind(line) {
  const l = lineOf(line);
  if (!l) return 'normal';
  if (l.form_kind) return l.form_kind;
  if (l.subject === '야생') return l.bonus ? 'event' : 'normal';
  return l.bonus || l.secret || l.mythic || l.rarity === 'legendary' ? 'special' : 'teacher';
}
export const isTeacherForm = (line) => formKind(line) === 'teacher';
export const familyOf = (line) => lineOf(line)?.family_id || line;
// 보여 줄 이름 (서버 _sp_label 과 같음): 선생님 폼 = "물리 쌤의 피카츄". 이름 바탕 = sp.base_name (applyFormNames 가 sp.name 에 넣어 둠)
export function displayName(sp) {
  if (!sp) return '';
  const base = sp.base_name ?? sp.name;
  const l = lineOf(sp.line_id);
  return isTeacherForm(sp.line_id) && l?.form_label ? `${l.form_label}의 ${base}` : base;
}
// 카탈로그를 받거나 꺼낼 때 한 번: 모든 화면 (박스 · 배틀 · 잡기 · 축하 · 트레이너 카드 …) 이 sp.name 을 쓰므로 거기에 보여 줄 이름을 넣음
export function applyFormNames(cat) {
  if (!cat?.species) return cat;
  const prev = S.catalog; S.catalog = cat;
  for (const sp of cat.species) { sp.base_name ??= sp.name; sp.name = displayName(sp); }
  S.catalog = prev ?? cat;
  return cat;
}
// 이 도감 번호의 폼들: [{ key, kind, label, sp, line }] — 일반 하나 (가진 것 → 가족 대표 계열 → 첫 종), 선생님 폼 (켜진 것 · 본 것), 이벤트
export function formsOfDex(dex) {
  const all = (S.catalog?.species || []).filter((sp) => sp.dex === dex && !isWithdrawn(sp.line_id));
  const seen = seenIds();
  const out = [];
  const normals = all.filter((sp) => formKind(sp.line_id) === 'normal');
  if (normals.length) {
    const rep = normals.find((sp) => seen.has(sp.id)) || normals.find((sp) => familyOf(sp.line_id) === sp.line_id) || normals[0];
    out.push({ key: 'normal', kind: 'normal', label: '일반', sp: rep, caught: normals.some((sp) => seen.has(sp.id)) });
  }
  for (const sp of all) {
    const k = formKind(sp.line_id); const l = lineOf(sp.line_id);
    if (k === 'normal') continue;
    if ((k === 'teacher' || k === 'special') && l?.active === false && !seen.has(sp.id)) continue;
    if ((l?.secret || l?.mythic) && !seen.has(sp.id)) continue;
    const key = `${k}:${sp.line_id}`;
    if (out.some((f) => f.key === key)) continue;
    out.push({ key, kind: k, label: k === 'teacher' ? (l?.form_label || l?.teacher || '선생님') : k === 'event' ? '이벤트' : (l?.teacher || '특별'), sp, caught: seen.has(sp.id) });
  }
  return out;
}
// 학교 도감 (0049) = 도감 '학교' 탭에 늘 보이는 칸: 야생이 아닌 계열 (선생님 · 교장/교감 · 탐구 활동 · 야자 전설, 갈래 종 포함),
//   잡기 전엔 안 보이는 비밀 · 환상과 비공개, 도감 보상으로 받는 계열 (뮤츠 · 지가르데) 은 뺌 → 도감 50%·100% 보상 · 빛나는 부적 · '도감 완성' 기준.
//   서버가 sync rules.school_keys 로 그 칸 목록 (_school_keys, 전국도감 번호) 을 보냄 → 앱도 그 목록으로 셈 (서버 보상과 늘 같음)
// 전국 도감 = 야생까지 모든 포켓몬 (비밀·환상·비공개 제외)
const DEX_REWARD_LINES = [41, 42];   // 예전 서버 (school_keys 없음) 일 때만: 설정 dex_rewards 기본값
export function dexStats() {
  const seen = seenKeys();
  const seenSchool = seenKeys((sp) => !isWild(sp.line_id));   // 0052: 학교 칸 = 선생님 · 특별 폼으로 채운 것 (서버 _seen_school)
  const all = new Set(S.catalog.species.filter((sp) => !isBonus(sp.line_id) && !isWithdrawn(sp.line_id)).map(dexKey));
  const keys = S.snap?.rules?.school_keys;
  const school = Array.isArray(keys) ? new Set(keys)
    : new Set(S.catalog.species.filter((sp) => !isWild(sp.line_id) && !isSecret(sp.line_id) && !isMythic(sp.line_id) && !isWithdrawn(sp.line_id)
                                       && lineOf(sp.line_id)?.active !== false && !DEX_REWARD_LINES.includes(sp.line_id)).map(dexKey));
  const cnt = (set, have = seen) => [...set].filter((k) => have.has(k)).length;
  const found = cnt(school, seenSchool);
  return { found, total: school.size, complete: school.size > 0 && found === school.size,
           allFound: cnt(all), allTotal: all.size,
           secret: collection().some((c) => isSecret(c.line_id)) };
}
export const titlesOf = (p, d = dexStats()) => [...(p.titles || []), d.complete && '도감 마스터', d.secret && '비밀 탐험가'].filter(Boolean);
export const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* iOS: none */ } };
// 해금 단계 (0051): sync 의 unlock = { unlocked, by, got, need, total, pct, minigame, at, all, safari_pending }.
//   2단계 (학교 도감 pct% 또는 운영자 '모두에게 열기') = 사파리존 · 장소 QR 야생 포켓몬 · 전체 도감. 예전 서버 (unlock 없음) = 열림
export const unlockInfo = () => S.snap?.unlock || { unlocked: true, got: 0, need: 0, total: 0, pct: 0, old: true };
export const stage2 = () => unlockInfo().unlocked !== false;
