// Supabase client + RPC helper. Requires vendor/supabase.js (UMD) loaded before this module.
import { CONFIG } from './config.js';

export const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

// Korean messages for server error codes (raised in supabase/migrations/*.sql)
const MESSAGES = {
  NOT_AUTHENTICATED: '로그인이 필요해요.',
  NO_PROFILE: '계정 정보가 없어요. 다시 로그인해 주세요.',
  DOMAIN_NOT_ALLOWED: '학교 구글 계정으로만 로그인할 수 있어요.',
  NO_STUDENT_ID: '이메일에서 학번을 찾지 못했어요. 운영진에게 문의하세요.',
  STUDENT_ID_TAKEN: '이 학번은 이미 다른 계정에 연결돼 있어요. 운영 부스에 문의하세요.',
  FESTIVAL_CLOSED: '지금은 게임 운영 시간이 아니에요.',
  NO_QUIZ: '이미 푼 퀴즈예요.',
  NOT_OWNED: '아직 가지고 있지 않은 몬스터예요.',
  MAX_STAGE: '이미 최종 진화했어요!',
  NO_TICKET: '진화권이 없어요. 퀴즈를 맞히면 받을 수 있어요.',
  NOT_STAFF: '부스 스태프 계정이 아니에요.',
  NOT_ADMIN: '운영자 계정이 아니에요.',
  NO_STUDENT: '등록되지 않은 학번이에요.',
  BAD_PAYLOAD: '가방 QR이 아니에요.',
  OFFLINE: '인터넷 연결이 필요해요.',
  SELF_REDEEM_OFF: '지금은 부스에서만 받을 수 있어요.',
  TOO_MANY: '한 번에 700개까지만 만들 수 있어요.',
};
export const errorText = (code) => MESSAGES[code] || `오류가 났어요 (${code})`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// rpc('sync', {...}) → data, or throws Error(code). Retries network errors and 429 with backoff.
export async function rpc(fn, args = {}, { retries = 2, timeout = 12_000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const { data, error } = await sb.rpc(fn, args).abortSignal(ctl.signal);
      clearTimeout(timer);
      if (!error) return data;
      const transient = error.code === '429' || /fetch|network|aborted|timeout/i.test(error.message || '');
      if (!transient || attempt >= retries) throw Object.assign(new Error(transient ? 'OFFLINE' : error.message), { server: !transient });
    } catch (e) {
      clearTimeout(timer);
      if (e.server) throw e;
      if (attempt >= retries) throw Object.assign(new Error('OFFLINE'), { offline: true });
    }
    await sleep(600 * 2 ** attempt + Math.random() * 400);
  }
}

// report unexpected client errors (rate limited server-side). Never throws.
export function reportError(msg) {
  try { sb.rpc('log_client_error', { p_msg: String(msg).slice(0, 500) }).then(() => {}, () => {}); } catch { /* ignore */ }
}
