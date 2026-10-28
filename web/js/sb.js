// Supabase client + RPC helper. Requires vendor/supabase.js (UMD) loaded before this module.
import { CONFIG } from './config.js';

export const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

// Korean messages for server error codes (raised in supabase/migrations/*.sql)
const MESSAGES = {
  NOT_AUTHENTICATED: '로그인이 필요해요.',
  NO_PROFILE: '계정 정보가 없어요. 다시 로그인해 주세요.',
  DOMAIN_NOT_ALLOWED: '이 계정으로는 로그인할 수 없어요.',
  NO_STUDENT_ID: '이메일에서 학번을 찾지 못했어요. 운영진에게 문의하세요.',
  STUDENT_ID_TAKEN: '이 고유번호는 이미 다른 계정이 쓰고 있어요. 내 번호가 맞다면 메인 부스에 문의하세요.',
  BAD_STUDENT_ID: '고유번호는 숫자 6자리예요. (예: 22기 1번 → 022001)',
  BAD_GEN: '지금은 20~22기 학번만 참여할 수 있어요. 고유번호 앞 세 자리를 확인해 주세요.',
  BAD_NAME: '이름은 1~20자로, 특수기호 없이 적어 주세요.',
  BAD_KIND: '학생인지 외부인인지 골라 주세요.',
  ALREADY_REGISTERED: '이미 등록된 계정이에요. 새로고침해 주세요.',
  CODE_ACCOUNT_EXISTS: '이 고유번호는 이미 계정이 있어요. 그 번호의 비밀번호를 넣어 주세요.',
  BAD_PASSWORD: '비밀번호는 6자 이상으로 정해 주세요.',
  NO_ACCOUNT: '이 고유번호는 아직 계정이 없어요. 비밀번호를 정해서 새로 시작하면 돼요.',
  NOT_YOUR_NUMBER: '학교 계정의 학번과 같은 번호만 직접 초기화할 수 있어요.',
  USE_NUMBER_LOGIN: '학생은 고유번호와 비밀번호를 함께 넣어 주세요.',
  NOT_GOOGLE: '구글 로그인에서만 쓸 수 있어요.',
  OLD_NUMBER_ACCOUNT: '이 번호는 예전 방식으로 가입돼서 비밀번호가 없어요. 비밀번호 초기화를 요청하거나 메인 부스에 문의하세요.',
  NOT_FOUND: '이미 처리됐거나 없는 항목이에요. 새로 고침해 주세요.',
  RAID_NOT_FOUND: '레이드를 찾을 수 없어요. QR을 다시 찍어 주세요.',
  RAID_BAD_TOKEN: '레이드 QR이 바뀌었어요. 대형 화면의 지금 QR을 다시 찍어 주세요.',
  RAID_OVER: '이미 끝난 레이드예요.',
  RAID_NOT_JOINED: '먼저 레이드 QR을 찍어 참가해 주세요.',
  BAD_SPECIES: '그런 몬스터가 없어요.',
  BAD_RAID: '체력은 10 이상, 시간은 1~600분으로 정해 주세요.',
  BAD_INQUIRY: '문의 내용을 2~1000자로 적어 주세요.',
  CODE_SIGNUP_OFF: '지금은 학번 로그인을 새로 만들 수 없어요. 구글로 로그인해 주세요.',
  TRY_LATER: '잠깐 너무 많이 시도했어요. 몇 분 뒤에 다시 해 주세요.',
  DEV_LOGIN_OFF: '개발용 로그인이 꺼져 있어요.',
  BAD_EMAIL: '이메일 형식이 이상해요. (예: test1 또는 test1@test.local)',
  FESTIVAL_CLOSED: '지금은 게임 운영 시간이 아니에요.',
  NO_QUIZ: '이미 푼 퀴즈예요.',
  NOT_OWNED: '아직 가지고 있지 않은 몬스터예요.',
  MAX_STAGE: '이미 최종 진화했어요!',
  NO_TICKET: '진화권이 없어요. 퀴즈를 맞히거나 홈의 룰렛을 돌려 보세요.',
  NOT_STAFF: '부스 스태프 계정이 아니에요.',
  NOT_ADMIN: '운영자 계정이 아니에요.',
  NO_STUDENT: '등록되지 않은 학번이에요.',
  BAD_PAYLOAD: '가방 QR이 아니에요.',
  OFFLINE: '인터넷 연결이 필요해요.',
  SELF_REDEEM_OFF: '지금은 부스에서만 받을 수 있어요.',
  TOO_MANY: '한 번에 700개까지만 만들 수 있어요.',
  ROULETTE_WAIT: '룰렛은 조금 더 기다려야 돌릴 수 있어요.',
  ROULETTE_DAILY_MAX: '오늘 룰렛은 다 돌렸어요. 내일 또 만나요!',
  ROULETTE_OFF: '지금은 룰렛을 쉬고 있어요.',
  BAD_ROLE: '역할은 운영자 또는 부스 스태프만 고를 수 있어요.',
  CANNOT_CHANGE_SELF: '내 계정의 역할은 여기서 바꿀 수 없어요. 다른 운영자에게 부탁하세요.',
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
