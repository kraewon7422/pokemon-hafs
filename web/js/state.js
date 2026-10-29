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
// shown dex number = position in the list (No.001…No.104, no gaps) — species.id keeps (line-1)*3+stage for the atlas
export const dexNo = (sp) => `No.${String(S.catalog.species.findIndex((x) => x.id === sp.id) + 1).padStart(3, '0')}`;
// 도감 순서: 선생님 몬스터 먼저 (계열 번호 순), 전설(교장·교감)·비밀·탐구 전설은 맨 뒤. 도감 번호(No.)도 이 순서
export function sortDex(cat) {
  const lineRank = new Map(cat.lines.map((l) => [l.id, l.mythic ? 2 : l.rarity === 'legendary' || l.secret || l.bonus ? 1 : 0]));   // 환상은 맨 끝 (번호가 다른 몬스터를 안 밀어냄)
  cat.species.sort((a, b) => (lineRank.get(a.line_id) || 0) - (lineRank.get(b.line_id) || 0) || a.id - b.id);
  return cat;
}
export const collection = () => S.snap?.collection || [];
// 트레이너 카드 몬스터: 고른 몬스터 (0024 set_partner), 없으면 가장 많이 진화한 몬스터
export const partnerMon = () => collection().find((c) => c.line_id === S.snap?.profile?.partner)
  || [...collection()].sort((a, b) => b.stage - a.stage || new Date(b.first_caught_at) - new Date(a.first_caught_at))[0];
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
export const evolvable = () => collection().filter((c) => c.stage < maxStage(c.line_id) && !isWithdrawn(c.line_id));
export const isWithdrawn = (line) => (S.snap?.rules?.withdrawn || []).includes(line) || !!lineOf(line)?.withdrawn;
export const isSecret = (line) => !!lineOf(line)?.secret;
export const isMythic = (line) => !!lineOf(line)?.mythic;
export const isBonus = (line) => !!lineOf(line)?.bonus || isSecret(line) || isMythic(line);
// 도감 완성 = 비밀 몬스터를 뺀 모든 몬스터 (비공개 계열 제외)
export function dexStats() {
  const reached = (sp) => (owned(sp.line_id)?.stage || 0) >= sp.stage;
  const main = S.catalog.species.filter((sp) => !isBonus(sp.line_id) && !isWithdrawn(sp.line_id));
  const found = main.filter(reached).length;
  return { found, total: main.length, complete: main.length > 0 && found === main.length,
           secret: collection().some((c) => isSecret(c.line_id)) };
}
export const titlesOf = (p, d = dexStats()) => [...(p.titles || []), d.complete && '도감 마스터', d.secret && '비밀 탐험가'].filter(Boolean);
export const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* iOS: none */ } };
