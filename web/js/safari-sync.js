// 사파리존 만남을 이상하게 끝내도 (앱 닫기 · 새로 고침 · 화면 잠금 · 인터넷 끊김 · 연타) 볼을 잃거나 두 번 빼지 않게.
// 서버 (0033): 만날 때 그날 남은 볼을 그 만남에 '빌려 주고' safari_result 에서 던진 수만큼 뺌. 대기 중 만남은 한 번에 하나,
//   이미 끝난 만남에 다시 보내면 NOT_FOUND (= 두 번 빠지지 않음). 그래서 앱은
//   1) 던질 때마다 '이 만남에서 던진 수' 를 기기에 적어 둠 → 다시 열면 남은 볼로 이어 던지고, 보낼 때 앞에 던진 수까지 합쳐 보냄
//   2) 결과는 먼저 기기에 적고 (safariResult) 보냄 → 인터넷이 끊기면 그대로 두었다가 다시 연결되면 보냄 (만남 id 로 한 번만)
//   3) 걷던 지도·자리를 적어 둠 → 새로 고쳐도 그 자리에서 이어서
// 시험: .work/preview/robust.html (가짜 서버로 경우마다 돌려 봄)
import { rpc } from './sb.js';
import { kv } from './db.js';

const K_T = 'safariThrows', K_R = 'safariResult', K_POS = 'safariPos';
const isNet = (e) => !!e && (e.offline || e.message === 'OFFLINE');

// 이 만남에서 이미 던진 볼 수 (다른 만남 기록은 지움)
export async function priorThrows(id) { const t = (await kv.get(K_T)) || {}; return Number(t[id]) || 0; }
export async function noteThrows(id, n) { await kv.set(K_T, { [id]: n }); }

// 보내지 못한 결과 { p_id, p_throws, p_caught, p_grade, p_curve } (없으면 null)
export async function queuedResult() { return (await kv.get(K_R)) || null; }

let sending = null;
// 결과를 적고 보냄 → { ok, r } (보냄) | { queued } (인터넷 · 나중에 다시) | { gone, error } (이미 끝난 만남 등 → 지움) | { kept, error } (박스가 꽉 참 등 → 남겨 둠)
export async function sendResult(res) {
  const old = await queuedResult();
  if (old && old.p_id === res.p_id) return flushResult();          // 같은 만남을 두 번 보내지 않음 (연타 · 다시 시도)
  await kv.set(K_R, res);
  return flushResult();
}
export function flushResult() {
  if (sending) return sending;                                    // 보내는 중이면 같은 약속을 돌려줌
  sending = (async () => {
    try {
      const res = await queuedResult(); if (!res) return null;
      try {
        const r = await rpc('safari_result', res, { retries: 1 });
        await done(res.p_id);
        return { ok: true, r };
      } catch (e) {
        if (isNet(e)) return { queued: true, error: e };
        if (e.message === 'BOX_FULL') return { kept: true, error: e };    // 놓아준 뒤 다시 보내면 됨
        await done(res.p_id);                                          // NOT_FOUND 등: 이미 처리됨 → 지움
        return { gone: true, error: e };
      }
    } finally { sending = null; }
  })();
  return sending;
}
async function done(id) {
  await kv.del(K_R);
  const t = (await kv.get(K_T)) || {};
  if (id in t) { delete t[id]; await kv.set(K_T, t); }
}

// 걷던 자리 { map, x, y, dir }
export const savePos = (pos) => kv.set(K_POS, pos);
export const loadPos = () => kv.get(K_POS);
