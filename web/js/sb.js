// Supabase client + RPC helper. Requires vendor/supabase.js (UMD) loaded before this module.
import { CONFIG } from './config.js';
import { markError } from './ui.js';

export const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

// Korean messages for server error codes (raised in supabase/migrations/*.sql)
const MESSAGES = {
  NOT_AUTHENTICATED: '로그인이 필요해요.',
  NO_PROFILE: '계정 정보가 없어요. 다시 로그인해 주세요.',
  DOMAIN_NOT_ALLOWED: '이 계정으로는 로그인할 수 없어요.',
  NO_STUDENT_ID: '이메일에서 고유번호를 찾지 못했어요. 운영진에게 문의하세요.',
  STUDENT_ID_TAKEN: '이 고유번호는 이미 다른 계정이 쓰고 있어요. 내 번호가 맞다면 메인 부스에 문의하세요.',
  BAD_STUDENT_ID: '고유번호는 숫자 6자리예요. (예: 22기 1번 → 022001)',
  BAD_GEN: '지금은 20~22기만 참여할 수 있어요. 고유번호 앞 세 자리를 확인해 주세요.',
  BAD_NAME: '이름은 1~20자로, 특수기호 없이 적어 주세요.',
  BAD_NICKNAME: '별명은 2~10자, 한글·영어·숫자로 적어 주세요. (숫자만 길게 쓰는 건 안 돼요)',
  NICKNAME_BLOCKED: '그 별명은 쓸 수 없어요. 다른 별명을 정해 주세요.',
  BAD_KIND: '학생인지 외부인인지 골라 주세요.',
  ALREADY_REGISTERED: '이미 등록된 계정이에요. 새로고침해 주세요.',
  CODE_ACCOUNT_EXISTS: '이 고유번호는 이미 계정이 있어요. 그 번호의 비밀번호를 넣어 주세요.',
  BAD_PASSWORD: '비밀번호는 6자 이상으로 정해 주세요.',
  NO_ACCOUNT: '이 고유번호는 아직 계정이 없어요. 비밀번호를 정해서 새로 시작하면 돼요.',
  NOT_YOUR_NUMBER: '학교 계정에 적힌 번호와 같은 고유번호만 직접 초기화할 수 있어요.',
  USE_NUMBER_LOGIN: '학생은 고유번호와 비밀번호를 함께 넣어 주세요.',
  NOT_GOOGLE: '구글 로그인에서만 쓸 수 있어요.',
  OLD_NUMBER_ACCOUNT: '이 번호는 예전 방식으로 가입돼서 비밀번호가 없어요. 비밀번호 초기화를 요청하거나 메인 부스에 문의하세요.',
  NOT_FOUND: '이미 처리됐거나 없는 항목이에요. 새로 고침해 주세요.',
  NOT_TEACHER_LINE: '선생님 포켓몬 계열이 아니에요 (야생·특별 전설은 옮길 수 없어요).',
  NOT_WILD_LINE: '이미 다른 선생님이나 특별 전설이 쓰는 계열이에요. 야생 포켓몬 계열을 골라 주세요.',
  RAID_NOT_FOUND: '레이드를 찾을 수 없어요. QR을 다시 찍어 주세요.',
  BAD_TEAM: '배틀 팀은 내 박스의 포켓몬 1~4마리로, 같은 포켓몬을 두 번 넣지 말고 골라 주세요.',
  BATTLE_CODE_NOT_FOUND: '배틀 QR을 찾을 수 없어요. 친구의 "내 배틀 QR"을 다시 찍어 주세요.',
  BATTLE_SELF: '내 배틀 QR이에요! 친구의 QR을 찍어 주세요.',
  FRIEND_NO_MONSTERS: '친구가 아직 포켓몬이 없어요.',
  FRIEND_BUSY: '친구가 지금 다른 배틀 중이에요. 잠시 뒤에 다시 신청해 주세요.',
  BATTLE_NOT_FOUND: '배틀을 찾을 수 없어요.',
  BATTLE_INVITE_GONE: '배틀 신청이 이미 끝났어요. (시간이 지났거나 취소됨)',
  BATTLE_WAIT: '이미 골랐어요. 상대를 기다려 주세요.',
  BAD_ACTION: '지금은 그걸 할 수 없어요.',
  NO_PP: 'PP가 없는 기술이에요.',
  BAD_ID: '아이디는 영문으로 시작하는 4~16자예요. (영문 소문자·숫자·_ )',
  ID_TAKEN: '이미 있는 아이디예요. 다른 아이디를 정하거나, 내 아이디라면 비밀번호를 확인해 주세요.',
  STAFF_NO_LINK: '운영진 아이디에는 구글을 연결할 수 없어요. 비밀번호는 운영자에게 다시 받아 주세요.',
  BAD_ROLE: '역할은 운영자 또는 부스예요.',
  CANNOT_REMOVE_SELF: '지금 로그인한 내 계정은 지울 수 없어요.',
  NO_ITEM: '가방에 그 물건이 없어요.',
  ITEM_LIMIT: '이번 배틀에서는 회복약을 더 쓸 수 없어요. (한 배틀에 2개까지)',
  NO_ITEMS_FAIR: '공정 모드 배틀에서는 회복약을 쓸 수 없어요.',
  BAD_TARGET: '그 포켓몬에게는 쓸 수 없어요.',
  BATTLE_ONLY: '회복약은 배틀 중에 "가방"을 눌러서 써요.',
  HOLD_ITEM: '지니게 하는 물건이에요. "포켓몬에게 지니게 하기"를 눌러요.',
  TM_NOT_COMPATIBLE: '이 포켓몬은 그 기술을 배울 수 없어요.',
  ALREADY_KNOWN: '이미 알고 있는 기술이에요.',
  MAX_LEVEL: '이미 Lv.100이에요!',
  MOVE_NOT_KNOWN: '아직 배우지 않은 기술이에요.',
  BAD_MOVES: '기술은 1~4개, 서로 다르게 골라 주세요.',
  NO_MONSTER: '그 포켓몬을 가지고 있지 않아요.',
  BOX_FULL: '박스가 꽉 찼어요! 가방 → 포켓몬에서 몇 마리를 놓아준 뒤에 다시 해 주세요. (티켓·만남·알은 그대로 남아 있어요)',
  LAST_MON: '마지막 한 마리는 놓아줄 수 없어요.',
  MON_PARTNER: '트레이너 카드 포켓몬이에요. 카드를 다른 포켓몬으로 바꾼 뒤에 놓아줄 수 있어요.',
  MON_IN_TEAM: '배틀 팀에 있는 포켓몬이에요. 배틀 탭 → 팀 바꾸기에서 빼고 놓아줄 수 있어요.',
  MON_BUSY: '지금 배틀이나 레이드에 나가 있는 포켓몬이에요. 끝난 뒤에 놓아줄 수 있어요.',
  BAD_POS: '그 칸으로는 옮길 수 없어요.',
  IN_PVP_BATTLE: '실시간 배틀이 아직 진행 중이에요. 배틀 탭의 "하던 실시간 배틀 이어 하기"로 끝내거나 기권한 뒤에 시작해 주세요.',
  BAD_FORMAT: '1 대 1 또는 2 대 2 중에서 골라 주세요.',
  RAID_BAD_TOKEN: '레이드 QR이 바뀌었어요. 대형 화면의 지금 QR을 다시 찍어 주세요.',
  RAID_OVER: '이미 끝난 레이드예요.',
  RAID_NOT_JOINED: '먼저 레이드 QR을 찍어 참가해 주세요.',
  BAD_SPECIES: '그런 포켓몬이 없어요.',
  BAD_RAID: '체력은 10 이상, 시간은 1~600분으로 정해 주세요.',
  BAD_INQUIRY: '문의 내용을 2~1000자로 적어 주세요.',
  CODE_SIGNUP_OFF: '지금은 새 계정을 만들 수 없어요. 메인 부스에 문의해 주세요.',
  TRY_LATER: '잠깐 너무 많이 시도했어요. 몇 분 뒤에 다시 해 주세요.',
  MINIGAME_LOCKED: '포켓몬을 더 모으면 미니게임이 열려요.',
  GAME_OFF: '지금은 쉬고 있는 미니게임이에요. 기록은 저장되지 않았어요.',
  NO_SLOT: '부화기가 꽉 찼어요. 먼저 부화시켜요!',
  NOT_READY: '아직 걸음이 모자라요. 조금 더 걸어 봐요!',
  EGG_FULL: '알 주머니가 꽉 찼어요 (9개). 알을 부화시킨 뒤 다시 받아요.',
  EMPTY_POOL: '지금은 알에서 나올 포켓몬이 없어요. 운영진에게 알려 주세요.',
  SHINY_LOCKED: '알에서 반짝이로 태어난 포켓몬만 색을 바꿀 수 있어요.',
  NOT_STUDENT: '반은 학생 계정(고유번호)만 정할 수 있어요.',
  BAD_CLASS: '학년(1~3)을 고르고, 반 이름은 1~4글자 (숫자·영어 대문자·한글)로 적어 주세요. 예: 1A, 3, 10B',
  BAD_GRADE: '학년은 1·2·3학년 중에서 골라 주세요.',
  ENCOUNTER_NOT_FOUND: '이미 끝났거나 없는 레이드 보스 잡기예요. 새로 고침해 주세요.',
  ENCOUNTER_DONE: '이미 결과가 나온 레이드 보스 잡기예요.',
  NOT_REDEEMED: '아직 부스에서 받지 않은 티켓이에요.',
  ALREADY_REPORTED: '이미 잡기 결과를 보냈어요.',
  ALREADY_CLAIMED: '이미 받은 보상이에요.',
  NOT_DONE: '아직 조건을 채우지 못했어요.',
  // 0038 전설 · 이상한 소포
  NOT_READY: '아직 조건을 채우지 못했어요. 사파리존 사육사에게 무엇이 필요한지 물어봐요.',
  NO_TRIES: '오늘은 더 이상 모습을 보이지 않을 것 같아요. 내일 다시 도전해 봐요!',
  ALREADY_CAUGHT: '이미 잡은 전설의 포켓몬이에요.',
  BAD_LEGEND: '여기에는 전설의 포켓몬이 없어요.',
  BAD_GIFT: '그런 소포 코드는 없어요. 글자를 다시 확인해 주세요.',
  GIFT_EXPIRED: '받을 수 있는 기간이 끝난 소포예요.',
  GIFT_NOT_YET: '아직 열 수 없는 소포예요. 조금 뒤에 다시 넣어 보세요.',
  GIFT_CLAIMED: '이미 받은 소포예요. 소포는 한 사람에 한 번만 받을 수 있어요.',
  GIFT_GONE: '아쉽게도 이 소포는 모두 나갔어요.',
  GIFT_EXISTS: '같은 코드의 소포가 이미 있어요.',
  BAD_GIFT_CODE: '코드는 2~40글자로 적어 주세요 (띄어쓰기는 빼고 셈).',
  BAD_GIFT_REWARD: '포켓몬 (도감 번호) 또는 물건 중 하나만 골라 주세요.',
  BAD_SPECIES: '그 도감 번호의 포켓몬이 없어요.',
  BAD_ITEM: '그런 물건이 없어요.',
  BAD_QTY: '개수가 이상해요 (포켓몬 1~6, 물건 1~99).',
  BAD_RANGE: '끝나는 시각이 시작 시각보다 뒤여야 해요.',
  BAD_STEPS: '걸음 수가 이상해요.',
  BAD_SCORE: '기록이 이상해서 저장하지 않았어요.',
  CONFIRM_MISMATCH: '확인 글자가 달라요.',
  DEV_LOGIN_OFF: '개발용 로그인이 꺼져 있어요.',
  BAD_EMAIL: '이메일 형식이 이상해요. (예: test1 또는 test1@test.local)',
  FESTIVAL_CLOSED: '지금은 게임 운영 시간이 아니에요.',
  NO_QUIZ: '이미 푼 퀴즈예요.',
  NOT_OWNED: '아직 가지고 있지 않은 포켓몬이에요.',
  MAX_STAGE: '이미 최종 진화했어요!',
  NO_TICKET: '진화의 돌이 없어요. 퀴즈를 맞히거나 홈의 룰렛을 돌려 보세요.',
  PICK_BRANCH: '어떤 모습으로 진화할지 골라 주세요.',
  BAD_BRANCH: '그 모습으로는 진화할 수 없어요.',
  NOT_STAFF: '부스 스태프 계정이 아니에요.',
  NOT_ADMIN: '운영자 계정이 아니에요.',
  NO_STUDENT: '등록되지 않은 고유번호예요.',
  BAD_PAYLOAD: '티켓 QR이 아니에요.',
  OFFLINE: '인터넷 연결이 필요해요.',
  SELF_REDEEM_OFF: '지금은 부스에서만 받을 수 있어요.',
  TOO_MANY: '한 번에 700개까지만 만들 수 있어요.',
  ROULETTE_WAIT: '룰렛은 조금 더 기다려야 돌릴 수 있어요.',
  ROULETTE_DAILY_MAX: '오늘 룰렛은 다 돌렸어요. 내일 또 만나요!',
  ROULETTE_OFF: '지금은 룰렛을 쉬고 있어요.',
  BAD_ROLE: '역할은 운영자 또는 부스 스태프만 고를 수 있어요.',
  CANNOT_CHANGE_SELF: '내 계정의 역할은 여기서 바꿀 수 없어요. 다른 운영자에게 부탁하세요.',
};
// 오류 글은 토스트에서 적어도 3초 보이게 표시해 둠 (ui.js markError)
// 표 전체 읽기: Supabase API 는 한 번에 1000줄까지라서 1000줄씩 나눠 받음 (기술 배우기·기술 목록이 수천 줄)
export async function selectAll(table, cols, filter = (q) => q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await filter(sb.from(table).select(cols)).range(from, from + 999);
    if (r.error) return { data: null, error: r.error };
    out.push(...(r.data || []));
    if (!r.data || r.data.length < 1000) return { data: out, error: null };
  }
}

export const errorText = (code) => markError(MESSAGES[code] || `오류가 났어요 (${code})`);

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
