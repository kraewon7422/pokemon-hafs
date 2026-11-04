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
export const dexOf = (line, stage) => (line - 1) * 3 + stage;
// 도감 번호 = 실제 전국도감 번호 (No.001 이상해씨 … No.809 멜메탈). species.id 는 (계열-1)*3+단계 그대로 (서버가 씀)
export const dexNo = (sp) => `No.${String(sp?.dex || 0).padStart(3, '0')}`;
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
export const monSp = (m) => (m ? speciesOf(dexOf(m.line_id, m.stage)) : null);
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
export const evolvable = () => mons().filter((c) => c.stage < maxStage(c.line_id) && !isWithdrawn(c.line_id));
export const isWithdrawn = (line) => (S.snap?.rules?.withdrawn || []).includes(line) || !!lineOf(line)?.withdrawn;
export const isSecret = (line) => !!lineOf(line)?.secret;
export const isMythic = (line) => !!lineOf(line)?.mythic;
export const isBonus = (line) => !!lineOf(line)?.bonus || isSecret(line) || isMythic(line);
// 야생 포켓몬 = 선생님이 없는 계열 (QR 의 야생 · 걸음 · 알 · 레이드로 만남)
export const isWild = (line) => lineOf(line)?.subject === '야생';
// 학교 도감 = 선생님 포켓몬 + 특별 전설 (야생·비밀·환상·비공개 제외) → 도감 50%·100% 보상과 '도감 완성' 은 이것 기준
// 전국 도감 = 야생까지 모든 포켓몬 (비밀·환상·비공개 제외)
export function dexStats() {
  const reached = (sp) => (owned(sp.line_id)?.stage || 0) >= sp.stage;
  const all = S.catalog.species.filter((sp) => !isBonus(sp.line_id) && !isWithdrawn(sp.line_id));
  const school = all.filter((sp) => !isWild(sp.line_id));
  const found = school.filter(reached).length;
  return { found, total: school.length, complete: school.length > 0 && found === school.length,
           allFound: all.filter(reached).length, allTotal: all.length,
           secret: collection().some((c) => isSecret(c.line_id)) };
}
export const titlesOf = (p, d = dexStats()) => [...(p.titles || []), d.complete && '도감 마스터', d.secret && '비밀 탐험가'].filter(Boolean);
export const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* iOS: none */ } };
