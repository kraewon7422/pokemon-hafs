// Operator (admin) page. Tabs: 현황 · 축제 운영 · 장소·QR(관리/인쇄) · 포켓몬·퀴즈 · 레이드 · 학생·계정(학생/요청/쪽지) · 미니게임 · 성장·보상 · 운영진 · 고급 설정.
// Old hashes (#qr #print #stu #code #req #set) still open the right tab (TAB_ALIAS). Settings forms + DEFAULTS live near the end of the file.
// Reads/writes catalog tables directly (RLS admin policies) and calls admin_* RPCs (supabase/migrations/0001_init.sql, 0003_review_fixes.sql).
import { CONFIG } from './config.js';
import { sb, rpc, errorText, selectAll } from './sb.js';
import { h, $, toast, timeAgo, josa } from './ui.js';
import { devLogin, idLogin, renderGoogleButton, signOut } from './auth.js';
import { drawQR, placeUrl } from './qrfmt.js';
import { spriteCanvas, previewCanvas, decodeSprite, fitCell, normRec, refreshSprites, spritesReady, aliasSprites, spriteBlob, hasArt } from './sprites.js';

const SUBJECTS = ['국어', '수학', '영어', '과학', '사회', '외국어', '정보', '한국사', '음악', '체육', '전설'];
const RARITY = { common: '일반', rare: '희귀', legendary: '전설' };
const ROLE = { student: '학생', booth: '부스 스태프', admin: '운영자' };
const TSTATUS = { pending: ['대기', 'warn'], redeemed: ['사용', 'ok'], expired: ['만료', 'off'], cancelled: ['취소', 'off'] };
const SETTING_HELP = {
  festival_open: '게임 동작 ON/OFF (비상 스위치)',
  email_domains: '학교 구글 계정의 도메인 (예: ["hafs.hs.kr"]). 로그인은 아무 구글 계정이나 되지만, 이 도메인 계정이면 메일 속 고유번호를 알아봐서 학생이 직접 비밀번호를 초기화할 수 있어요. 축제 뒤 개인정보 삭제 때도 써요',
  battle_daily_max: '배틀: 하루에 보상(진화의 돌 기회)을 받는 승리 수. 999 = 제한 없음 (기본 999). 배틀 자체는 언제나 제한 없음', battle_turn_sec: '실시간 대전: 한 턴 제한 시간(초). 지나면 AI가 대신 골라요 (기본 30)',
  battle_invite_sec: '실시간 대전 신청: 이 시간(초) 안에 수락해야 시작 (기본 60)',
  email_regex: '학교 구글 메일에서 고유번호를 찾는 규칙 (email_domains 와 함께 씀)',
  admin_emails: '운영자 이메일 목록 (그 구글 계정으로 첫 로그인할 때 운영자가 됨)',
  booth_emails: '부스 스태프 이메일 목록 (구글 계정)',
  stage_points: '단계별 점수 [0, 1단계, 2단계, 3단계]',
  rarity_bonus: '희귀도별 보너스 점수',
  evo_prob: '진화 기본 확률 [0, 1→2, 2→3]',
  evo_pity_step: '실패할 때마다 오르는 확률',
  evo_pity_max: '이만큼 실패하면 다음엔 확정 진화',
  qr_daily_cap: '같은 QR을 하루에 찍을 수 있는 횟수',
  bag_max: '가방에 들어가는 티켓 최대 수',
  ticket_ttl_hours: '안 쓴 티켓이 만료되는 시간(시간)',
  token_grace_minutes: '토큰 교체 후 옛 토큰이 유효한 시간(분)',
  quiz_ticket_daily_cap: '하루에 퀴즈로 받을 수 있는 진화의 돌 최대 수 (기본 30)',
  roulette_enabled: '진화의 돌 룰렛 ON/OFF (true/false)',
  code_self_signup: '구글 없이 고유번호 + 비밀번호로 새 계정을 만들 수 있게 할지 ON/OFF',
  reset_requests_per_10min: '비밀번호 초기화 요청을 10분 동안 전체에서 최대 몇 개 받을지 (장난 방지, 기본 30)',
  raid_slots: '시간대 전설 레이드 시간표 ([레이드] 탭에서 표로 고쳐요)',
  raid_slot_hp: '시간대 전설 레이드 보스 체력', raid_slot_minutes: '시간대 전설 레이드 한 판 길이(분)', raid_cooldown_min: '시간대 레이드가 끝나고 다음 판까지(분)',
  raid_slot_open: '시간대 전설 레이드(아침·점심·저녁)를 QR 없이 앱에서 바로 참가하게 할지 ON/OFF (true/false)',
  raid_tap_cap: '레이드: 1초에 인정하는 탭 수 (오토클릭 방지)', raid_min_taps: '레이드 보상 받으려면 최소 탭 수',
  dex_rewards: '도감 보상: {"50": 41, "100": 42} = 학교 도감(선생님 포켓몬 + 특별 전설) 50% → 뮤츠, 100% → 지가르데 (특별 티켓). 야생 포켓몬은 세지 않아요',
  roulette_777_per_mille: '이스터에그: 룰렛 꽝 1000번 중 몇 번을 777(럭키 세븐 칭호)로 바꿀지 (기본 10 = 1%)',
  code_signup_per_10min: '학번 코드 계정을 10분 동안 전체에서 최대 몇 개 만들 수 있는지 (번호 선점 방지, 기본 60)',
  allowed_gens: '참여할 수 있는 기수 목록 (예: [20, 21, 22]). 이 밖의 학번은 가입·코드 생성이 거절되고 TV 기수 대항전에도 안 나와요. 매년 바꿔 주세요',
  dev_login: '개발용 테스트 로그인(아무 이메일, 비밀번호 1234abcd!) — 실전 서버에서는 반드시 false',
  roulette_every_min: '룰렛을 한 번 돌린 뒤 다음까지 기다리는 시간(분, 기본 5)',
  roulette_daily_max: '한 사람이 하루에 돌릴 수 있는 룰렛 횟수 (기본 12)',
  roulette_odds: '룰렛 칸 [진화의 돌 수, 가중치] 목록. 기본 [[0,72],[1,24],[3,4]] = 꽝 72% · 1개 24% · 3개 4%',
  rotating_window_sec: '대형 화면 QR이 바뀌는 간격(초)',
  rotating_accept_sec: '대형 화면 QR을 찍은 뒤 인정되는 시간(초). 짧을수록 사진 공유가 어려워요',
  self_redeem: '셀프 지급 모드 ([축제 운영] 탭의 스위치)',
  festival_close_at: '축제 종료 시각 — 예: "2026-11-07T16:00:00+09:00" (따옴표 포함), 없으면 null',
  min_client_version: '앱 최소 버전 숫자. 올리면 옛 버전 폰에 "업데이트" 배너가 떠요',
  lv_from_battle: '레벨: 배틀 경험치로 레벨이 오르게 할지 ON/OFF (true/false)',
  lv_from_raid: '레벨: 레이드에 참가하면 쓴 포켓몬 레벨이 오르게 할지 ON/OFF',
  lv_from_places: '레벨: 하루에 서로 다른 장소 QR을 여러 곳 찍으면 배틀 팀 레벨 +1 ON/OFF',
  lv_places_n: '레벨: 서로 다른 장소 몇 곳마다 배틀 팀 +1 할지 (기본 3)',
  lv_from_catch: '레벨: 같은 선생님 포켓몬을 또 잡으면 +1 ON/OFF',
  raid_levels: '레벨: 레이드 한 판 참가로 오르는 레벨 수 (기본 1)',
  exp_need_mul: '경험치: 레벨 L → L+1 에 필요한 경험치 = 이 값 × L (기본 8, 크면 레벨이 느리게 오름)',
  exp_battle_mul: '경험치: 배틀 한 판 = 이 값 × 상대 평균 레벨 (기본 4)',
  exp_practice: '경험치: 연습 배틀 배율 (기본 0.5)', exp_lose: '경험치: 졌을 때 배율 (기본 0.4)',
  drop_place: '물건: 장소 QR을 찍으면 물건이 나올 확률 (기본 0.3 = 30%)', drop_quiz: '물건: 퀴즈 정답 때 확률 (기본 0.4)',
  drop_battle: '물건: 친구·실시간 배틀 승리 때 확률 (기본 0.5)', drop_practice: '물건: 연습 배틀 승리 때 확률 (기본 0.15)',
  drop_raid_tm: '물건: 레이드 승리 때 특별 기술머신 확률 (기본 0.3, 이상한사탕은 항상)',
  battle_item_max: '배틀: 한 배틀에 쓸 수 있는 회복약 수 (기본 2)', battle_turn_cap: '배틀: 이 턴이 지나면 남은 체력 비율로 승부 (기본 20, 3마리 · 2 대 2는 4마리 기준 — 팀이 크면 비례해서 늘어남)',
  battle_fields: '배틀 시간표: [{"from": "12:00", "to": "13:30", "name": "점심시간", "env": "grassy"}, …] — 그 시간에 시작한 배틀의 날씨·필드 (sun · rain · sand · hail · electric · grassy · misty · psychic)',
  battle_field_mult: '필드 (일렉트릭·그래스·사이코필드): 그 타입 기술 위력 배율 (기본 1.3)',
  ability_hidden_chance: '특성: 잡을 때 숨겨진 특성이 나올 확률 (기본 0.05 = 5%)',
  practice_exp_daily: '연습 배틀: 경험치·물건을 받는 판 수 (하루, 기본 10). 넘으면 연습은 할 수 있지만 경험치는 없어요',
  // ui8: 고급 설정 표의 모든 키에 한 줄 설명 (단위 · 보통 값)
  notice: '앱 홈 맨 위 공지 한 줄 (글자, 없으면 null) — [축제 운영] 탭에서 고쳐요',
  prize_note: '상품 안내 글 (글자, 없으면 null) — [축제 운영] 탭에서 고쳐요',
  dup_bonus_every: '중복 보너스: 같은 계열을 N번째 잡을 때마다 진화의 돌 +1 (기본 3, 0 = 끔)',
  minigame_unlock: '미니게임이 열리는 포켓몬 수 (마리, 기본 10)',
  minigame_off: '꺼 둔 미니게임 id 목록 (예: ["surf"], 빈 목록 [] = 모두 켜짐)',
  box_max: '포켓몬 박스에 넣을 수 있는 최대 마리 수 (기본·최대 900). 꽉 차면 더 못 잡아요',
  raid_reward_mode: '레이드 이긴 학생 보상: "ticket" = 특별 티켓 (부스에서 바꿈) · "catch" = 앱에서 바로 잡기',
  raid_catch_balls: '레이드 앱에서 잡기: 받는 HAFS 볼 개수 (기본 10, raid_reward_mode "catch" 일 때만)',
  raid_catch_flee: '레이드 앱에서 잡기: 볼을 다 빗나가면 보스가 도망 ON/OFF (true/false, 기본 true)',
  catch_exp: '잡기 장면 던지기 등급별 경험치 {none, nice, great, excellent, curve} (curve = 커브볼 더하기)',
  catch_flee: '부스 몬스터 잡기: 볼 3개가 다 빗나가면 도망칠 확률 (0~1, 기본 0.05 = 5%)',
  wild_chance: 'QR을 찍으면 선생님 포켓몬 대신 야생 포켓몬이 나올 확률 (0~1, 기본 0.4 = 40%)',
  wild_weights: '야생 포켓몬 희귀도 가중치 {common 흔함, rare 희귀, legendary 전설} (기본 100 · 10 · 1)',
  wild_steps: '이만큼 걸을 때마다 야생 포켓몬 1마리 (걸음, 기본 1500, 0 = 걸어서 만나기 끔)',
  wild_daily: '걸어서 만나는 야생 포켓몬 하루 최대 (마리, 기본 5)',
  wild_balls: '걸어서 만난 야생 포켓몬: 받는 몬스터볼 개수 (기본 5, 다 빗나가면 도망)',
  wild_shiny_chance: '새로 잡는 포켓몬이 반짝일 확률 (0~1, 기본 0.001953125 = 1/512)',
  shiny_charm_mult: '빛나는 부적: 반짝이 확률 배수 (배, 기본 3)',
  ditto_disguise_chance: '야생 포켓몬이 사실 메타몽일 확률 (0~1, 기본 0.005 = 0.5%)',
  quiz_stone_chance: '퀴즈 정답일 때 진화의 돌을 받을 확률 (0~1, 기본 0.35 = 35%)',
  battle_stone_chance: '친구 배틀 승리 때 진화의 돌을 받을 확률 (0~1, 기본 0.5 = 50%)',
  steps_per_min_max: '걸음 세기: 1분에 인정하는 최대 걸음 (흔들기 방지, 기본 200)',
  steps_day_max: '걸음 세기: 하루에 인정하는 최대 걸음 (기본 30000)',
  egg_steps: '알 부화에 필요한 걸음 {green 초록, yellow 노랑, purple 보라} (기본 1000 · 2500 · 5000)',
  egg_shiny: '알에서 반짝이가 나올 확률 {green, yellow, purple} (기본 1/256 · 1/128 · 1/64)',
  egg_drop_place: '처음 찍는 장소 QR에서 알이 나올 확률 (0~1, 기본 0.25 = 25%)',
  egg_qr_bonus: '새 장소 QR 하나를 찍으면 부화 중인 알에 더해 주는 걸음 (기본 300)',
  egg_hold_max: '한 사람이 가질 수 있는 알 수 (개, 기본 9)',
  egg_incubators: '부화기 칸 수 (1~3칸, 기본 3)',
  egg_legend: '보라 알에서 전설이 나올 확률 (0~1, 기본 0.1 = 10%)',
  safari_open: '사파리존 열기 ON/OFF (false = 학생 앱에 "아직 닫혀 있어요")',
  unlock_safari_pct: '2단계 해금: 학교 도감을 몇 % 모으면 사파리존 · 장소 QR 야생 포켓몬 · 전체 도감이 열리나 (0~100, 기본 30)',
  unlock_all: '2단계 해금을 모두에게 열기 ON/OFF (true = 모은 수와 상관없이 모두 열림, 기본 false) — [축제 운영] 탭의 스위치',
  safari_balls_daily: '사파리존: 충전 주기마다 한 사람이 받는 사파리볼 (개, 기본 20)',
  safari_reset_hours: '사파리존: 사파리볼 충전 주기 (시간, 0.25~24, 기본 0.5 = 30분)',
  safari_encounter_rate: '사파리존: 풀숲 한 걸음마다 포켓몬을 만날 확률 (0~1, 기본 0.12)',
  safari_min_steps: '사파리존: 풀숲에서 이 걸음 수를 걸은 뒤부터 만남 (걸음, 기본 8)',
  safari_steps_per_sec: '사파리존: 1초에 인정하는 걸음 (속임 막기, 기본 10)',
  safari_flee: '사파리존: 공을 처음 놓쳤을 때 도망칠 확률 (0~1, 기본 0.25)',
  safari_flee_step: '사파리존: 놓칠 때마다 더해지는 도망 확률 (0~1, 기본 0.05)',
  safari_flee_max: '사파리존: 도망 확률 최대 (0~1, 기본 0.9)',
  safari_flee_level: '사파리존: Lv.50 포켓몬에 더하는 도망 확률 (Lv.5 = 0, 기본 0.1)',
  safari_flee_legend: '사파리존: 전설 포켓몬에 더하는 도망 확률 (0~1, 기본 0.15)',
  safari_cave_type_mult: '사파리존 동굴 · 깊은 곳: 바위 · 땅 · 고스트 · 악 · 강철 · 물 타입이 나오는 배수 (배, 기본 4)',
  safari_level_bands: '사파리존 레벨: {지도: [최소 Lv, 최대 Lv, 거리 (0 = 무작위), "구역"]} — 입구에서 멀수록 높아짐',
  legend_quests: '전설 퀘스트 목록 [{dex, kind, n, reward}] — n = 채울 숫자, reward "ticket" = 특별 티켓 · "map" = 깨어나서 사파리존 전설 자리에서 도전',
  legend_balls: '사파리존 전설: 도전 한 번에 받는 HAFS 볼 개수 (기본 10)',
  legend_daily_tries: '사파리존 전설: 같은 전설에게 하루에 도전할 수 있는 횟수 (기본 3)',
  roam_chance: '방랑 전설: 그 시간의 장소 QR을 찍으면 만날 확률 (0~1, 기본 0.3)',
  roam_balls: '방랑 전설: 받는 몬스터볼 개수 (기본 8, 다 빗나가면 도망)',
  roam_seed: '방랑 전설이 옮겨 가는 장소를 섞는 값 (글자, 바꾸면 위치 순서가 바뀜, 보통 그대로)',
  gift_fail_limit: '이상한 소포: 10분 동안 코드를 틀릴 수 있는 횟수 (번, 기본 8)',
  tmp_seed_exec_open: '개발용: 큰 데이터 넣기 임시 함수 열기 (평소 false, 실전에서는 반드시 false)',
};
const TABS = [
  ['dash', '현황'], ['ops', '축제 운영'], ['place', '장소·QR'], ['mon', '포켓몬·퀴즈'], ['raid', '레이드'], ['people', '학생·계정'],
  ['mg', '미니게임'], ['grow', '성장·보상'], ['legend', '전설·소포'], ['staff', '운영진'], ['adv', '고급 설정'],
];
// 예전 탭 주소(#qr, #set …) → 새 탭 [탭, 작은 탭]. 북마크·옛 링크가 계속 열리게.
const TAB_ALIAS = {
  qr: ['place', 'qr'], print: ['place', 'print'], stu: ['people', 'stu'], code: ['people', 'code'], req: ['people', 'req'], set: ['ops', null],
};
const SUBTABS = {
  place: [['qr', 'QR 관리'], ['print', 'QR 인쇄']],
  people: [['stu', '학생 찾기·고치기'], ['req', '비밀번호 요청·문의'], ['code', '임시 비밀번호 쪽지']],
};
// 탭마다 맨 위 "이 탭에서 하는 일" (접을 수 있음, 접은 상태는 이 브라우저에 기억)
const GUIDES = {
  dash: ['지금 축제가 잘 돌아가는지 한눈에 봐요 (10초마다 저절로 새로 고침).',
    '빨간 칸·빨간 안내가 보이면 먼저 처리하세요: 게임 정지, 포켓몬 미설정 QR, 앱 오류 등.',
    '교장·교감 선생님 레이드를 TV에 바로 띄울 수 있어요.'],
  ops: ['축제 당일에 자주 만지는 스위치가 모두 여기 있어요.',
    '비상 스위치(게임 정지), 셀프 지급(부스가 너무 밀릴 때), 공지, 축제 끝나는 시각, 상품 안내.',
    '레이드 보상 방식과 부스 포켓몬이 도망갈 확률도 여기서 바로 바꿀 수 있어요.'],
  place: ['학교 곳곳에 붙이는 장소 QR을 만들고, 이름·지도 위치·나오는 포켓몬을 정해요.',
    'QR이 유출(사진 공유)됐으면 [토큰 교체]로 새 QR을 만들고 다시 인쇄해서 붙여요.',
    '[QR 인쇄]에서 A4에 2장씩 인쇄하거나 PNG로 저장해요.'],
  mon: ['포켓몬은 가족 (진화로 이어지는 묶음, 갈래 진화 포함) 마다 한 줄이에요. 한 가족에 모습 (폼) 이 여러 개 있어요: 일반 (야생) · 선생님 (예: "물리 쌤의 피카츄") · 이벤트.',
    '선생님 붙이기 = 가족을 고르고 [+ 선생님 폼 만들기]. 선생님 폼은 장소 QR · 퀴즈로만 나오고, 잡으면 학교 도감 칸이 채워져요. 일반 폼은 그대로 야생 · 사파리존에서 나와요.',
    '선생님 빼기 = 그 선생님 폼에서 [선생님 폼 끄기]. 학생이 잡은 포켓몬은 그대로 남아요. 다른 포켓몬으로 바꾸려면 [다른 포켓몬으로 옮기기] (퀴즈 · 장소 QR 이 함께 옮겨짐).',
    '[선생님 찾기] = 선생님 → 과목 → 포켓몬 표. 선생님 얼굴 그림은 그 선생님 폼에서 올리면 그 폼에만 쓰여요. 동의를 철회하면 [선생님 동의 철회]를 켜서 숨겨요.'],
  raid: ['레이드 = 모두가 함께 보스를 탭해서 쓰러뜨리는 이벤트예요.',
    '[레이드 열기]로 아무 포켓몬이나 지금 바로 열 수 있어요 (TV 화면 또는 인쇄 QR).',
    '[시간대 전설]은 정해 둔 시간에 TV 화면이 저절로 여는 레이드예요. TV 화면이 켜져 있어야 해요.',
    '이긴 학생이 받는 보상(특별 티켓 또는 앱에서 잡기)도 여기서 정해요.'],
  people: ['학생을 찾아서 진화의 돌·포켓몬·물건·알·반·역할을 고쳐요.',
    '비밀번호를 잊은 학생의 초기화 요청을 허용하거나, 학생 문의에 답해요.',
    '급할 때는 임시 비밀번호 쪽지를 인쇄해서 줄 수도 있어요.',
    '최종 랭킹(상품용 실명) CSV도 [학생 찾기·고치기]에 있어요.'],
  mg: ['미니게임이 열리는 포켓몬 수를 정하고, 문제가 생긴 게임만 잠깐 꺼요.',
    '이상한(부정) 기록을 지우거나, 연습 기간이 끝나면 랭킹을 초기화해요.'],
  legend: ['이상한 소포 (선물 코드) 를 만들고, 받은 수를 보고, 끄거나 지워요. 환상의 포켓몬 (지라치 · 테오키스 …) 은 소포로만 받을 수 있어요.',
    '전설 퀘스트의 숫자 (예: 퀴즈 10번 연속 정답) 와 사파리존 전설 · 방랑 전설 · 메타몽 변신 확률을 정해요.',
    '방랑 전설 (라이코 · 앤테이 · 스이쿤) 이 지금 어느 장소 QR에 있는지도 여기서 볼 수 있어요 (학생에게는 소문만 보여요).'],
  grow: ['알 부화 걸음 수, 반짝이 확률, 잡기 경험치, 레벨이 오르는 방법, 물건이 나올 확률 등을 정해요.',
    '[진화 갈래]: 이브이처럼 진화 모습이 여러 가지인 포켓몬이 어느 모습으로 잘 진화할지 정해요 (기본 = 모두 같은 확률).',
    '숫자 칸 옆에 단위와 설명이 있어요. 묶음마다 [저장]을 눌러야 반영돼요.',
    '잘못된 숫자(범위 밖)는 저장 전에 빨갛게 표시돼요.'],
  staff: ['운영자·부스 스태프 계정을 만들거나 지워요.',
    '아이디로 만들면 서버가 비밀번호를 만들어 줘요 (한 번만 보여요).',
    '구글 이메일로 등록할 수도 있어요. 운영 화면 주소도 여기 있어요.'],
  adv: ['다른 탭에 따로 칸이 없는 설정을 그대로(JSON) 고쳐요.',
    '잘 모르는 값은 바꾸지 마세요. 저장 전에 형식을 검사해요.',
    '다른 탭에 칸이 있는 설정은 기본으로 숨겨져 있어요 (보이기 버튼).'],
};
const CODE_BATCH = 700;   // admin_make_login_codes accepts at most 700 ids per call

const S = {
  view: 'boot', booting: false, me: null, email: '', tab: 'dash', renderId: 0,
  lines: [], species: [], lineById: new Map(), spById: new Map(),
  qrs: [], qrById: new Map(), secrets: new Map(), rewards: [],
  stats: null, statsFailed: false, grace: 30, dailyCap: 3, selQr: null, selLine: null, stuQuery: '', stuSel: null, sub: {},
  codes: null, codesSaved: true,   // last generated login codes (shown once, kept only in this tab)
};

// atlas capacity (how many dex numbers have a picture in atlas.png) — beyond it, a monster needs an uploaded picture (0031)
const atlasCap = new Promise((resolve) => {
  const im = new Image();
  im.onload = () => resolve(Math.floor(im.naturalWidth / 64) * Math.floor(im.naturalHeight / 64));
  im.onerror = () => resolve(0);
  im.src = 'sprites/atlas.png';
});
let ATLAS_CAP = 9999;
atlasCap.then((n) => { ATLAS_CAP = n; });

// ───────────────────────── helpers ─────────────────────────

const PG = {
  '23505': '이미 있는 값이에요 (중복).',
  '23514': '허용되지 않는 값이에요 (규칙 위반).',
  '23503': '연결된 데이터가 없거나, 다른 데이터가 쓰고 있어요.',
  '23502': '빈 칸을 채워 주세요.',
  '42501': '권한이 없어요 (운영자만 가능).',
  '22P02': '형식이 잘못됐어요.',
  PGRST301: '로그인이 만료됐어요. 다시 로그인해 주세요.',
};
// table query → data, or throws Error with a Korean message ready to show
async function tq(builder) {
  let res;
  try { res = await builder; } catch { throw Object.assign(new Error(errorText('OFFLINE')), { ready: true }); }
  if (res.error) {
    const e = res.error;
    const offline = /fetch|network/i.test(e.message || '');
    const msg = offline ? errorText('OFFLINE') : PG[e.code] || `오류가 났어요 (${e.message || e.code})`;
    throw Object.assign(new Error(msg), { ready: true });
  }
  return res.data;
}
const msgOf = (e) => {
  if (e?.ready) return e.message;
  const m = e?.message || String(e);
  if (/duplicate key/i.test(m)) return PG['23505'];
  if (/check constraint|violates/i.test(m)) return PG['23514'];
  return ADMIN_ERR[m] || errorText(m);
};
// admin-only server error codes (0003/0005) not in sb.js
const ADMIN_ERR = {
  NO_ACCOUNT: '그 이메일로 로그인한 적이 없어요. 학생이 새 로그인으로 한 번 로그인을 시도하게 하거나, [학생·계정 → 임시 비밀번호 쪽지]에서 그 번호 쪽지를 먼저 만드세요.',
  ACCOUNT_IN_USE: '그 로그인에는 이미 게임 기록(도감·티켓)이 있어요. 옮길 수 없어요.',
  NO_LINE: '없는 포켓몬 계열이에요.',
  TOO_MANY: '한 번에 너무 많이 보냈어요.',
};
function fail(e) { console.warn('[admin]', e); toast(msgOf(e), 4000); }

// run an async action while a button shows it is busy
async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); } catch (e) { fail(e); return undefined; } finally { if (btn) btn.disabled = false; }
}

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–');
const hhmm = (iso) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const minsAgo = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 60000 : Infinity);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function typeChip(subject) {
  const el = h('span.type', subject || '?');
  if (subject) el.classList.add('t-' + subject.replace(/\s+/g, ''));
  return el;
}
const chip = (text, cls = '') => h('span.chip' + (cls ? '.' + cls : ''), text);
// ── 포켓몬 계열 (0032): 실제 포켓몬 1~3단계. 선생님 계열 / 야생 계열 / 특별 전설 계열 ──
const TYPES18 = ['노말', '불꽃', '물', '풀', '전기', '얼음', '격투', '독', '땅', '비행', '에스퍼', '벌레', '바위', '고스트', '드래곤', '악', '강철', '페어리'];
// 0052 폼: form_kind = normal (야생 · 보통) | teacher (선생님 폼) | event (이상한 소포) | special (학교 특별 전설), family_id = 가족 대표 (일반 계열)
const formKindOf = (l) => !l ? 'normal' : l.form_kind || (l.subject === '야생' ? (l.bonus ? 'event' : 'normal')
  : (l.bonus || l.secret || l.mythic || (l.id >= 35 && l.id <= 42) || (l.id >= 77 && l.id <= 82) ? 'special' : 'teacher'));
const famOf = (l) => l?.family_id || l?.id;
const spOfLine = (l) => (S.spByLine?.get(l?.id) || []);
const firstSp = (l) => spOfLine(l).find((x) => x.stage === 1) || spOfLine(l)[0];
const lastSp = (l) => [...spOfLine(l)].reverse()[0] || firstSp(l);
const lineType = (l) => String(firstSp(l)?.btype || l.btype || '노말').split('/')[0];
const isWildLine = (l) => l?.subject === '야생';
const isSpecialLine = (l) => !!l && formKindOf(l) === 'special';
const isTeacherLine = (l) => !!l && formKindOf(l) === 'teacher';
const isEventLine = (l) => !!l && formKindOf(l) === 'event';
const teacherLabel = (l) => l?.form_label || String(l?.teacher || '').replace(/\s*선생님\s*(\d+)$/, ' $1 쌤').replace(/\s*선생님$/, ' 쌤');
const lineWho = (l) => (isEventLine(l) ? '이벤트 폼' : isWildLine(l) ? '야생 (일반 폼)' : isSpecialLine(l) ? `${l.teacher} · 전설` : `${teacherLabel(l)} · ${l.subject}${l.active ? '' : ' · 꺼짐'}`);
// 진화 이름: 단계마다 (갈래는 ·) — 이브이 → 샤미드·쥬피썬더·…
const chainName = (l) => {
  const by = [1, 2, 3].map((st) => [...new Set(spOfLine(l).filter((x) => x.stage === st).map((x) => x.name))]).filter((x) => x.length);
  return by.map((x) => (x.length > 3 ? `${x.slice(0, 2).join('·')} 외 ${x.length - 2}` : x.join('·'))).join('→') || '?';
};
const lineName = (id) => {
  const l = S.lineById.get(id);
  return l ? `#${id} ${chainName(l)} (${lineWho(l)})` : `#${id}`;
};
// [[타입, lines[]], …] 실제 18타입 순서 (첫 단계 포켓몬의 첫 번째 타입)
function byType(lines) {
  const groups = new Map();
  for (const l of lines) {
    const t = lineType(l);
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(l);
  }
  const order = (t) => { const i = TYPES18.indexOf(t); return i < 0 ? 99 : i; };
  return [...groups].sort((a, b) => order(a[0]) - order(b[0]));
}
// line <select>: 타입별 optgroup (440계열)
function lineSelect(lines, selected = null) {
  return h('select.inp', byType(lines).map(([t, ls]) => h('optgroup', { label: t },
    ls.map((l) => h('option', { value: l.id, selected: l.id === selected },
      lineName(l.id) + (l.active ? '' : ' [비활성]') + (l.withdrawn ? ' [동의 철회]' : ''))))));
}
const hasPic = (dex) => hasArt(dex) || (dex < 10000 && dex <= ATLAS_CAP) || !!S.spById.get(dex)?.sprite;   // 0052: 폼 종 = 같은 번호의 그림판 칸
function sprite(dex, size = 64) {
  if (!hasPic(dex)) return h('div.nopic', '그림 없음', h('br'), '(그림 올리기 필요)');
  return spriteCanvas(dex, size);
}
const field = (label, input, cls = '') => h('label.fld' + (cls ? '.' + cls : ''), h('span', label), input);
const checkbox = (label, checked) => {
  const i = h('input', { type: 'checkbox', checked: !!checked });
  return { el: h('label.chk', i, label), input: i };
};

// in-page modal. buttons: [{label, cls, value, onClick}] — onClick may return false to keep the modal open.
function modal(title, body, buttons) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    let ov;
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const close = (v) => { ov.remove(); document.removeEventListener('keydown', onKey); prev?.focus?.(); resolve(v); };
    const btns = buttons.map((b) => {
      const el = h('button.btn' + (b.cls ? '.' + b.cls : ''), { type: 'button' }, b.label);
      el.addEventListener('click', async () => {
        if (!b.onClick) return close(b.value);
        btns.forEach((x) => { x.disabled = true; });
        let r;
        try { r = await b.onClick(); } catch (e) { fail(e); r = false; }
        btns.forEach((x) => { x.disabled = false; });
        if (r !== false) close(r === undefined ? b.value : r);
      });
      return el;
    });
    ov = h('div.modal-ov', { onmousedown: (e) => { if (e.target === ov) close(null); } },
      h('div.box.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', title), body, h('div.modal-btns', btns)));
    document.body.append(ov);
    document.addEventListener('keydown', onKey);
    (ov.querySelector('input:not([type=radio]):not([type=checkbox]),textarea,select') || btns[btns.length - 1]).focus();
  });
}

async function confirmBox(title, lines, { ok = '확인', danger = false, typeToConfirm = null } = {}) {
  const input = typeToConfirm ? h('input.inp', { autocomplete: 'off', placeholder: typeToConfirm }) : null;
  const body = h('div', [].concat(lines).map((t) => (t instanceof Node ? t : h('p', t))),
    input && field(`확인하려면 "${typeToConfirm}"를 똑같이 입력하세요`, input));
  const v = await modal(title, body, [
    { label: '취소', value: false },
    {
      label: ok, cls: danger ? 'primary' : 'go', value: true,
      onClick: () => {
        if (input && input.value.trim() !== typeToConfirm) { toast('입력한 값이 달라요.'); input.classList.add('bad'); return false; }
        return true;
      },
    },
  ]);
  return v === true;
}

// ───────────────────────── data loading ─────────────────────────

async function loadCatalog() {
  const [lines, species, sets] = await Promise.all([
    tq(selectAll('lines', '*', (q) => q.order('id'))),
    tq(selectAll('species', '*', (q) => q.order('id'))),
    tq(sb.from('settings').select('key,value').in('key', ['token_grace_minutes', 'qr_daily_cap'])),
  ]);
  S.lines = lines; S.species = species;
  S.lineById = new Map(lines.map((l) => [l.id, l]));
  S.spById = new Map(species.map((s) => [s.id, s]));
  S.spByLine = new Map();
  for (const x of [...species].sort((a, b) => a.stage - b.stage || a.id - b.id)) { if (!S.spByLine.has(x.line_id)) S.spByLine.set(x.line_id, []); S.spByLine.get(x.line_id).push(x); }
  aliasSprites(species);   // 0037 갈래 종 (10000+) 그림
  const set = Object.fromEntries(sets.map((r) => [r.key, r.value]));
  if (set.token_grace_minutes != null) S.grace = Number(set.token_grace_minutes) || 30;
  if (set.qr_daily_cap != null) S.dailyCap = Number(set.qr_daily_cap) || S.dailyCap;
}
const maxStage = (l) => Math.min(3, Math.max(1, Number(l?.max_stage) || 3));
const isOn = (v) => v === true || v === 'true';
const isGuest = (sid) => String(sid || '').startsWith('g:');   // teacher/guest login-code profile (no 기수)

async function loadQrData() {
  const [qrs, secrets, rewards] = await Promise.all([
    tq(sb.from('qr_points').select('*').order('id')),
    tq(sb.from('qr_secrets').select('qr_id,token,manual_code,created_at').is('revoked_at', null).order('created_at')),
    tq(sb.from('qr_rewards').select('qr_id,line_id,weight').order('line_id')),
  ]);
  S.qrs = qrs; S.rewards = rewards;
  S.qrById = new Map(qrs.map((q) => [q.id, q]));
  S.secrets = new Map(secrets.map((s) => [s.qr_id, s]));   // ordered by created_at → newest wins
}

// ───────────────────────── boot / login ─────────────────────────

const app = $('#app');

async function boot() {
  if (S.booting) return;
  S.booting = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return showLogin();
    let prof;
    try { prof = await rpc('ensure_profile'); } catch (e) { return showLogin(errorText(e.message), true); }
    if (prof?.role !== 'admin') return showDenied(session.user.email);
    S.me = prof; S.email = session.user.email || '';
    await showApp();
  } finally { S.booting = false; }
}

sb.auth.onAuthStateChange((ev) => {
  if (ev === 'SIGNED_IN' && S.view === 'login') setTimeout(boot, 0);
  if (ev === 'SIGNED_OUT' && S.view !== 'login') { S.me = null; showLogin(); }
});

async function logout() {
  S.me = null;
  await signOut();
  showLogin();
}

function showLogin(errMsg = '', withLogout = false) {
  S.view = 'login';
  const err = h('p.err', { role: 'alert' }, errMsg);
  const google = h('div');
  const idIn = h('input.inp', { autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', placeholder: '운영진 아이디', required: true });
  const idPw = h('input.inp', { type: 'password', autocomplete: 'current-password', required: true });
  const idBtn = h('button.btn.go', { type: 'submit' }, '아이디로 로그인');
  const idForm = h('form.stack', {
    onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      idBtn.disabled = true;
      try { await idLogin(idIn.value, idPw.value); await boot(); } catch (x) { err.textContent = x.message; } finally { idBtn.disabled = false; }
    },
  }, field('운영진 아이디', idIn), field('비밀번호', idPw), idBtn);
  const box = h('div.box',
    h('h1', `${CONFIG.GAME_TITLE} 운영자`),
    h('p.muted', '운영자에게 받은 운영진 아이디로 로그인하세요.'),
    err,
    idForm,
    h('p.small-txt.muted', '구글 이메일로 등록된 운영진은 구글로 로그인해도 돼요.'),
    google);
  if (CONFIG.DEV_LOGIN) {
    const email = h('input.inp', { type: 'email', autocomplete: 'username', placeholder: 'admin@staff.test', required: true });
    const pw = h('input.inp', { type: 'password', autocomplete: 'current-password', required: true });
    const btn = h('button.btn.go', { type: 'submit' }, '테스트 계정 로그인');
    const form = h('form.stack', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        btn.disabled = true;
        try { await devLogin(email.value.trim(), pw.value); await boot(); } catch (x) { err.textContent = '로그인 실패: ' + x.message; } finally { btn.disabled = false; }
      },
    }, h('p.small-txt.muted', '테스트용 로그인 (스테이징 전용)'), field('이메일', email), field('비밀번호', pw), btn);
    box.append(form);
  }
  if (withLogout) box.append(h('button.btn.small', { onclick: logout }, '로그아웃'));
  app.replaceChildren(h('div.login', box));
  renderGoogleButton(google, (m) => { err.textContent = m; }).catch((e) => { err.textContent = e.message; });
}

function showDenied(email) {
  S.view = 'denied';
  app.replaceChildren(h('div.login', h('div.box',
    h('h1', '운영자 계정이 아니에요'),
    h('p', `${email || ''} 계정은 운영자 권한이 없어요.`),
    h('p.muted', '운영자에게 권한을 받거나 다른 계정으로 로그인하세요.'),
    h('button.btn.primary', { onclick: logout }, '로그아웃'))));
}

// ───────────────────────── app shell ─────────────────────────

async function showApp() {
  S.view = 'app';
  const nav = h('nav.tabs', { role: 'tablist', 'aria-label': '운영 메뉴' },
    TABS.map(([id, label]) => h('button', { type: 'button', role: 'tab', 'data-tab': id, onclick: () => go(id) }, label)));
  app.replaceChildren(
    h('header.top',
      h('h1', `${CONFIG.GAME_TITLE} · 운영자`),
      h('span.spacer'),
      h('span.who', S.email),
      h('button.btn.small', { onclick: logout }, '로그아웃')),
    h('div#festival-banner', { role: 'alert' }, '⚠ 게임 정지 중 — 비상 스위치가 꺼져 있어요 ([축제 운영] 탭에서 켤 수 있어요)'),
    h('div#self-banner', { role: 'status' }, '셀프 지급 모드 켜짐 — 학생이 부스 없이 앱에서 직접 포켓몬을 받고 있어요 ([축제 운영] 탭에서 끌 수 있어요)'),
    nav,
    h('main#main', h('p.loading', '불러오는 중…')));
  try { await loadCatalog(); } catch (e) { fail(e); }
  goHash();
  rpc('admin_stats').then((s) => { S.stats = s; setBanner(s.festival_open, s.self_redeem); }, () => {});
}

// "#tab" 또는 "#tab/sub" (예전 탭 이름도 받음) → [tab, sub]
function parseHash(hash) {
  const [a, b] = String(hash || '').replace(/^#/, '').split('/');
  if (TAB_ALIAS[a]) return [TAB_ALIAS[a][0], b || TAB_ALIAS[a][1]];
  if (TABS.some(([id]) => id === a)) return [a, b || null];
  return ['dash', null];
}
function goHash() {
  const [t, sub] = parseHash(location.hash);
  go(t, sub);
}

// selfRedeem undefined = leave that banner as it is
function setBanner(open, selfRedeem) {
  const b = $('#festival-banner');
  if (b) b.classList.toggle('on', open === false || open === 'false');
  const sr = $('#self-banner');
  if (sr && selfRedeem !== undefined) sr.classList.toggle('on', isOn(selfRedeem));
}

const RENDER = {
  dash: tabDash, ops: tabOps, place: tabSub, mon: tabMon, raid: tabRaid, people: tabSub,
  mg: tabMg, grow: tabGrow, legend: tabLegend, staff: tabStaff, adv: tabAdv,
};
const SUB_RENDER = { qr: tabQr, print: tabPrint, stu: tabStu, code: tabCodes, req: tabReq };

// 탭 맨 위 안내 (접으면 이 브라우저에 기억)
function guideBox(tab) {
  const items = GUIDES[tab];
  if (!items) return null;
  const k = 'admin_guide_closed_' + tab;
  let closed = false;
  try { closed = localStorage.getItem(k) === '1'; } catch { /* private mode */ }
  const d = h('details.box.guide', { open: !closed },
    h('summary', '이 탭에서 하는 일'),
    h('ul', items.map((t) => h('li', t))));
  d.addEventListener('toggle', () => { try { localStorage.setItem(k, d.open ? '0' : '1'); } catch { /* ignore */ } });
  return d;
}

// 작은 탭(장소·QR, 학생·계정): 위에 작은 탭 버튼 줄 + 고른 화면
async function tabSub() {
  const items = SUBTABS[S.tab];
  const cur = items.some(([id]) => id === S.sub[S.tab]) ? S.sub[S.tab] : items[0][0];
  S.sub[S.tab] = cur;
  const bar = h('div.subtabs', { role: 'tablist', 'aria-label': '작은 메뉴' }, items.map(([id, label]) =>
    h('button', { type: 'button', role: 'tab', 'aria-selected': String(id === cur), onclick: () => go(S.tab, id) }, label)));
  return [bar, ...[].concat(await SUB_RENDER[cur]())];
}

async function go(tab, sub) {
  if (TAB_ALIAS[tab]) [tab, sub] = [TAB_ALIAS[tab][0], sub || TAB_ALIAS[tab][1]];
  if (!RENDER[tab]) tab = 'dash';
  S.tab = tab;
  if (sub) S.sub[tab] = sub;
  const id = ++S.renderId;
  const hash = '#' + tab + (SUBTABS[tab] && S.sub[tab] ? '/' + S.sub[tab] : '');
  if (location.hash !== hash) history.replaceState(null, '', hash);
  document.querySelectorAll('nav.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  const main = $('#main');
  main.replaceChildren(h('p.loading', '불러오는 중…'));
  try {
    const nodes = await RENDER[tab]();
    if (id !== S.renderId) return;            // user switched tabs meanwhile
    if (SUBTABS[tab] && location.hash !== '#' + tab + '/' + S.sub[tab]) history.replaceState(null, '', '#' + tab + '/' + S.sub[tab]);
    main.replaceChildren(...[guideBox(tab), ...[].concat(nodes)].filter(Boolean));
  } catch (e) {
    if (id !== S.renderId) return;
    console.warn(e);
    main.replaceChildren(h('div.box', h('p.warn-txt', msgOf(e)), h('button.btn.small', { onclick: () => go(tab) }, '다시 시도')));
  }
}
const rerender = () => go(S.tab);

// ───────────────────────── 1. 현황판 ─────────────────────────

async function tabDash() {
  await refreshStats(false);
  return h('div#dash', dashBody());
}

// 전설 출현: rotating QRs appear on the TV (screen.html) only while switched on here
// 현황판: 교장·교감 선생님 TV 레이드 바로 시작 (0013). 시간대 전설(아침·점심·저녁)은 TV 화면이 알아서 열어요.
function legendCard() {
  const quick = (sp, label) => {
    const btn = h('button.btn.go', `${label} 레이드 시작`);
    btn.onclick = () => busy(btn, async () => {
      if (!confirm(`${label} 레이드를 TV 대형 화면에 띄울까요? (체력 30,000 · 10분)`)) return;
      await rpc('admin_create_raid', { p_species: sp, p_hp: 30000, p_minutes: 10, p_tv: true, p_title: `${label} 선생님 레이드`, p_kind: 'legend', p_shiny: false });
      toast(`${label} 레이드를 열었어요. TV 화면에 QR이 떠요.`);
    });
    return h('div.stack', spriteImg(sp), btn);
  };
  return h('div.box.stack',
    h('h2', '⚡ 전설 레이드 (TV 대형 화면)'),
    h('p.small-txt.muted', '누르면 TV에 보스와 30초마다 바뀌는 참가 QR이 떠요. 학생들이 찍고 다 같이 탭해서 쓰러뜨리면 모두 보상을 받아요 (특별 티켓 또는 앱에서 잡기 — [레이드] 탭의 보상 방식).'),
    h('div.row', quick(106, '교장'), quick(103, '교감')));
}

async function refreshStats(redraw = true) {
  try {
    S.stats = await rpc('admin_stats');
    S.game = await rpc('admin_game_stats').catch(() => S.game);   // 오늘 배틀·레이드·진화의 돌 (0019)
    S.safariOpen = await tq(sb.from('settings').select('value').eq('key', 'safari_open')).then((r) => (r?.[0] ? isOn(r[0].value) : null)).catch(() => S.safariOpen);   // 0048
    S.statsFailed = false;
  } catch (e) {
    if (!S.statsFailed) fail(e);               // toast once per failure streak
    S.statsFailed = true;
    if (!S.stats) throw e;
  }
  setBanner(S.stats.festival_open, S.stats.self_redeem);
  const el = $('#dash');
  if (redraw && el && S.tab === 'dash') el.replaceChildren(...dashBody().filter(Boolean));
}

setInterval(() => {
  if (S.view === 'app' && S.tab === 'dash' && document.visibilityState === 'visible') refreshStats();
}, 10_000);
document.addEventListener('visibilitychange', () => {
  if (S.view === 'app' && S.tab === 'dash' && document.visibilityState === 'visible') refreshStats();
});

function tile(label, value, sub = '', cls = '') {
  return h('div.box.tile' + (cls ? '.' + cls : ''), h('div.lbl', label), h('div.num', value ?? '–'), sub && h('div.sub', sub));
}

function dashBody() {
  const s = S.stats;
  const t = s.tickets || {};
  const ev = s.evolve || { tries: 0, success: 0 };
  const open = !(s.festival_open === false || s.festival_open === 'false');
  const selfOn = isOn(s.self_redeem);
  const qrs = s.qrs || [];
  const noPool = (q) => q.active && q.pool_size != null && Number(q.pool_size) === 0;
  const alerts = (q) => {
    const a = [];
    if (noPool(q)) a.push(chip('포켓몬 미설정', 'hot'));
    if (q.active && minsAgo(q.last_scan) > 45) a.push(chip('점검 필요', 'warn'));
    if (q.scans_10m >= 15) a.push(chip('급증·사진공유 의심', 'hot'));
    return a;
  };
  const nCheck = qrs.filter((q) => q.active && minsAgo(q.last_scan) > 45).length;
  const nHot = qrs.filter((q) => q.scans_10m >= 15).length;
  const emptyPool = qrs.filter(noPool);

  const tiles = h('div.tiles',
    tile('게임 상태', open ? 'ON' : 'OFF', open ? '운영 중' : '정지됨 (축제 운영 탭)', open ? 'good' : 'alert'),
    tile('셀프 지급', selfOn ? 'ON' : 'OFF', selfOn ? '셀프 지급 모드 켜짐' : '부스에서만 지급', selfOn ? 'alert' : ''),
    S.safariOpen == null ? null : tile('사파리존', S.safariOpen ? '열림' : '닫힘', S.safariOpen ? '학생이 사파리존에 들어갈 수 있음' : 'QR만 (축제 운영 → 야생 포켓몬)', S.safariOpen ? '' : 'alert'),
    tile('포켓몬 미설정 QR', emptyPool.length, '활성인데 풀이 비어 있음', emptyPool.length ? 'alert' : ''),
    tile('학생 수', s.students),
    tile('5분 내 접속', s.active_5m),
    tile('티켓 대기', t.pending || 0, 'pending'),
    tile('티켓 사용', t.redeemed || 0, 'redeemed'),
    tile('티켓 만료', t.expired || 0, t.cancelled ? `취소 ${t.cancelled}` : 'expired'),
    tile('진화 성공률', ev.tries ? `${pct(ev.success, ev.tries)}%` : '–', `${ev.success}/${ev.tries}회`),
    tile('1시간 오류', s.errors_1h, '앱 오류 보고', s.errors_1h > 0 ? 'alert' : ''));

  const chart = h('div.box',
    h('div.row', h('h2', '10분 단위 스캔 / 사용'), h('span.spacer', { style: { flex: 1 } }),
      h('div.legend', h('span', h('i', { style: { background: 'var(--sky)' } }), '스캔'), h('span', h('i', { style: { background: 'var(--green)' } }), '부스 사용'))),
    h('div', { html: chartSVG(s.scans_series || []) }),
    h('p.small-txt.muted', `마지막 갱신 ${hhmm(s.at)} · 10초마다 자동 갱신 (이 탭을 보고 있을 때만)`));

  const qrTable = h('div.box',
    h('div.row', h('h2', `QR 상태 (${qrs.length}개)`),
      emptyPool.length ? chip(`포켓몬 미설정 ${emptyPool.length}`, 'hot') : null,
      nCheck ? chip(`점검 필요 ${nCheck}`, 'warn') : null, nHot ? chip(`급증 ${nHot}`, 'hot') : null),
    h('p.small-txt.muted', '포켓몬 미설정 = 포켓몬 풀이 비어 있음(그 QR 티켓은 부스에서 취소돼요 — 장소·QR 탭에서 풀을 채우세요) · 점검 필요 = 45분 넘게 아무도 안 찍음(떨어졌거나 가려졌을 수 있음) · 급증 = 10분에 15회 이상(사진 공유 의심)'),
    h('div.tbl-wrap.scroll-y', h('table.tbl',
      h('thead', h('tr', h('th', 'ID'), h('th', '이름'), h('th', '상태'), h('th.num', '오늘'), h('th.num', '10분'), h('th.num', '대기'), h('th', '마지막 스캔'), h('th', '알림'))),
      h('tbody', qrs.map((q) => h('tr',
        h('td.mono', q.id), h('td', q.name),
        h('td', q.active ? chip('활성', 'ok') : chip('꺼짐', 'off'), q.kind === 'rotating' ? chip('대형화면', 'blue') : null),
        h('td.num', q.scans_today), h('td.num', q.scans_10m), h('td.num', q.pending),
        h('td', q.last_scan ? timeAgo(q.last_scan) : '없음'),
        h('td', alerts(q))))))));

  const staff = s.staff || [];
  const staffBox = h('div.box',
    h('h2', '스태프 기기'),
    h('p.small-txt.muted', '3분 넘게 소식이 없으면 빨간색 = 부스 오프라인 의심'),
    staff.length ? h('div.tbl-wrap', h('table.tbl',
      h('thead', h('tr', h('th', '계정'), h('th', '역할'), h('th', '마지막 접속'))),
      h('tbody', staff.map((p) => {
        const late = minsAgo(p.last_seen) > 3;
        return h('tr', h('td.mono', p.student_id), h('td', ROLE[p.role] || p.role),
          h('td', h('span', { class: late ? 'warn-txt' : 'ok-txt' }, p.last_seen ? timeAgo(p.last_seen) : '기록 없음')));
      })))) : h('p.muted', '스태프 계정이 없어요.'));

  const quiz = (s.quiz || []).slice().sort((a, b) => a.line_id - b.line_id);
  const quizBox = h('div.box',
    h('h2', '퀴즈 정답률 (계열별)'),
    quiz.length ? h('div.tbl-wrap', h('table.tbl',
      h('thead', h('tr', h('th', '계열'), h('th.num', '푼 수'), h('th.num', '정답'), h('th', '정답률'))),
      h('tbody', quiz.map((z) => {
        const r = pct(z.correct, z.answered);
        return h('tr', h('td', lineName(z.line_id)), h('td.num', z.answered), h('td.num', z.correct),
          h('td', h('div.bar.mini-bar', h('i', { style: { width: r + '%' } })), ` ${r}%`));
      })))) : h('p.muted', '아직 푼 퀴즈가 없어요.'));

  const errs = s.errors_recent || [];
  const errBox = h('div.box',
    h('h2', '최근 앱 오류'),
    errs.length ? h('div.tbl-wrap', h('table.tbl',
      h('thead', h('tr', h('th', '시각'), h('th', '내용'))),
      h('tbody', errs.map((e) => h('tr', h('td', { style: { whiteSpace: 'nowrap' } }, fmtTime(e.at)), h('td.small-txt', e.msg)))))) : h('p.muted', '오류 없음 👍'));

  const notices = [
    selfOn ? h('p.notice.red', h('b', '셀프 지급 모드 켜짐'), ' — 학생이 부스에 오지 않고 앱에서 직접 포켓몬을 받아요. 부스가 한가해지면 [축제 운영] 탭에서 꺼 주세요.') : null,
    emptyPool.length ? h('p.notice.red', h('b', `포켓몬 미설정 QR ${emptyPool.length}개: `), emptyPool.map((q) => `${q.id} ${q.name}`).join(', '),
      ' — 이 QR로 받은 티켓은 부스에서 취소돼요. [장소·QR] 탭에서 포켓몬 풀을 채우세요.') : null,
  ].filter(Boolean);

  // 오늘(한국 시간)의 게임 숫자 (0019 admin_game_stats)
  const g = S.game;
  const game = g && h('div.box.stack',
    h('h2', '오늘의 게임'),
    h('div.tiles',
      tile('배틀', (g.battles.cpu || 0) + (g.battles.team || 0) + (g.battles.pvp || 0),
        `연습 ${g.battles.cpu} · 친구팀 ${g.battles.team} · 실시간 ${g.battles.pvp} · 2대2 ${g.battles.double}`),
      tile('배틀한 학생', g.battles.players),
      tile('지금 실시간 대전', g.pvp_live),
      tile('배틀 승리 보상', g.battle_wins, '진화의 돌 1개씩'),
      tile('레이드', g.raids.active, `진행 중 · 오늘 승리 ${g.raids.won} · 실패 ${g.raids.failed}`, g.raids.active ? 'good' : ''),
      tile('레이드 참가', g.raids.players, '오늘 참가한 학생'),
      tile('나간 진화의 돌', (g.tickets.quiz || 0) + (g.tickets.roulette || 0) + (g.tickets.battle || 0),
        `퀴즈 ${g.tickets.quiz} · 룰렛 ${g.tickets.roulette} · 배틀 ${g.tickets.battle}`),
      tile('오늘 진화', g.evolve.success, `${g.evolve.tries}번 시도`)));

  return [...notices, legendCard(), tiles, game, chart, h('div.cols', h('div', qrTable), h('div', staffBox, quizBox, errBox))];
}

function chartSVG(series) {
  const W = 1100, H = 220, L = 34, R = 8, T = 12, B = 24;
  const n = Math.max(1, series.length);
  const max = Math.max(1, ...series.flatMap((d) => [d.scans, d.redeems]));
  const bw = (W - L - R) / n;
  const y = (v) => T + (H - T - B) * (1 - v / max);
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="10분 단위 스캔과 부스 사용 수">`;
  for (const v of [0, Math.round(max / 2), max]) {
    out += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#dde3ea" stroke-width="1"/>`;
    out += `<text x="${L - 4}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  series.forEach((d, i) => {
    const x = L + i * bw;
    const w = Math.max(2, bw * 0.38);
    const sc = Number(d.scans) || 0, rd = Number(d.redeems) || 0;
    const t = hhmm(d.t);
    out += `<rect x="${x + bw * 0.1}" y="${y(sc)}" width="${w}" height="${y(0) - y(sc)}" fill="#4aa8e0" stroke="#303848" stroke-width="1"><title>${t} 스캔 ${sc}</title></rect>`;
    out += `<rect x="${x + bw * 0.1 + w}" y="${y(rd)}" width="${w}" height="${y(0) - y(rd)}" fill="#48b048" stroke="#303848" stroke-width="1"><title>${t} 사용 ${rd}</title></rect>`;
    if (i % 3 === 0) out += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${t}</text>`;
  });
  return out + '</svg>';
}

// ───────────────────────── 2. QR 관리 ─────────────────────────

async function tabQr() {
  await loadQrData();
  if (S.selQr && !S.qrById.has(S.selQr)) S.selQr = null;
  const listBox = h('div');
  const editBox = h('div');
  const drawList = () => listBox.replaceChildren(qrList(() => { drawList(); drawEdit(); }));
  const drawEdit = () => editBox.replaceChildren(...qrEditor(refresh).filter(Boolean));
  const refresh = async () => { await loadQrData(); drawList(); drawEdit(); };
  drawList(); drawEdit();
  return h('div.cols', h('div', createQrForm(refresh), listBox), editBox);
}

function createQrForm(refresh) {
  const id = h('input.inp.mono', { placeholder: '예: A26', maxlength: 6, autocomplete: 'off' });
  const name = h('input.inp', { placeholder: '예: 도서관 입구' });
  const hint = h('input.inp', { placeholder: '학생에게 보이는 힌트 (선택)' });
  const kind = h('select.inp', h('option', { value: 'static' }, '고정 QR (인쇄해서 붙임)'), h('option', { value: 'rotating' }, '대형 화면 QR (30초마다 바뀜)'));
  const btn = h('button.btn.go', { type: 'submit' }, 'QR 만들기');
  return h('details.box.create',
    h('summary', '+ 새 QR 만들기'),
    h('form.stack', {
      onsubmit: (e) => {
        e.preventDefault();
        const qid = id.value.trim().toUpperCase();
        if (!/^[A-Z0-9]{2,6}$/.test(qid)) { toast('ID는 영어 대문자·숫자 2~6글자예요.'); id.classList.add('bad'); return; }
        if (!name.value.trim()) { toast('이름을 입력하세요.'); name.classList.add('bad'); return; }
        busy(btn, async () => {
          const r = await rpc('admin_create_qr', { p_id: qid, p_name: name.value.trim(), p_hint: hint.value.trim(), p_kind: kind.value });
          toast(`${qid} 만들었어요. 수동 코드 ${r.manual_code} · 포켓몬 풀을 꼭 채우세요!`, 5000);
          id.value = name.value = hint.value = '';
          S.selQr = qid;
          await refresh();
        });
      },
    },
    h('div.fields', field('ID (영대문자·숫자 2~6)', id), field('이름', name), field('힌트', hint, 'full'), field('종류', kind, 'full')),
    h('div.row.end', btn)));
}

function qrList(onSelect) {
  const poolCount = (id) => S.rewards.filter((r) => r.qr_id === id).length;
  return h('div.box',
    h('h2', `QR 목록 (${S.qrs.length}개)`),
    h('p.small-txt.muted', '줄을 누르면 옆(또는 아래)에서 고칠 수 있어요.'),
    h('div.tbl-wrap.scroll-y', h('table.tbl',
      h('thead', h('tr', h('th', 'ID'), h('th', '이름'), h('th', '상태'), h('th', '수동 코드'), h('th.num', '풀'), h('th.num', { title: '한 학생이 하루에 찍을 수 있는 횟수' }, '하루'), h('th', '지도'))),
      h('tbody', S.qrs.map((q) => {
        const sec = S.secrets.get(q.id);
        const tr = h('tr.click', { tabindex: 0, onclick: () => { S.selQr = q.id; onSelect(); }, onkeydown: (e) => { if (e.key === 'Enter') { S.selQr = q.id; onSelect(); } } },
          h('td.mono', q.id), h('td', q.name),
          h('td', q.active ? chip('활성', 'ok') : chip('꺼짐', 'off'), q.kind === 'rotating' ? chip('대형화면', 'blue') : null, q.visible_on_map ? null : chip('지도숨김', 'off')),
          h('td.mono', sec ? sec.manual_code : h('span.warn-txt', '없음')),
          h('td.num', poolCount(q.id) || h('span.warn-txt', '0')),
          h('td.num', q.daily_cap != null ? h('b', q.daily_cap) : h('span.muted', { title: '기본값 (설정 qr_daily_cap)' }, `기본 ${S.dailyCap}`)),
          h('td', q.map_x != null ? '✓' : '–'));
        if (q.id === S.selQr) tr.classList.add('sel');
        return tr;
      })))));
}

function qrEditor(refresh) {
  const q = S.qrById.get(S.selQr);
  if (!q) return [h('div.box', h('p.muted', '왼쪽 목록에서 QR을 고르세요.')), mapBox(null, null)];
  const pos = { x: q.map_x, y: q.map_y };
  const name = h('input.inp', { value: q.name });
  const hint = h('textarea.inp', q.hint || '');
  const vis = checkbox('지도에 표시', q.visible_on_map);
  const act = checkbox('활성 (꺼지면 찍어도 티켓이 안 생김)', q.active);
  const from = h('input.inp', { type: 'datetime-local', value: toLocalInput(q.active_from) });
  const until = h('input.inp', { type: 'datetime-local', value: toLocalInput(q.active_until) });
  const cap = h('input.inp', { type: 'number', min: 1, step: 1, value: q.daily_cap ?? '', placeholder: `기본값 ${S.dailyCap}` });
  const posTxt = h('span.small-txt');
  const showPos = () => { posTxt.textContent = pos.x == null ? '위치 없음 — 아래 지도를 눌러 정하세요' : `x ${pos.x.toFixed(3)}, y ${pos.y.toFixed(3)} (저장해야 반영)`; };
  showPos();
  const save = h('button.btn.go', '저장');
  save.onclick = () => busy(save, async () => {
    if (!name.value.trim()) throw Object.assign(new Error('이름을 입력하세요.'), { ready: true });
    const capV = cap.value.trim() === '' ? null : Number(cap.value);
    if (capV !== null && !(Number.isInteger(capV) && capV >= 1)) {
      cap.classList.add('bad');
      throw Object.assign(new Error('하루 최대 횟수는 1 이상의 정수예요 (비우면 기본값).'), { ready: true });
    }
    await tq(sb.from('qr_points').update({
      name: name.value.trim(), hint: hint.value.trim(), visible_on_map: vis.input.checked, active: act.input.checked,
      active_from: fromLocalInput(from.value), active_until: fromLocalInput(until.value), map_x: pos.x, map_y: pos.y,
      daily_cap: capV,
    }).eq('id', q.id));
    toast(`${q.id} 저장했어요.`);
    await refresh();
  });
  const editor = h('div.box.stack',
    h('h2', `${q.id} · ${q.name}`),
    h('div.fields',
      field('이름', name, 'full'), field('힌트', hint, 'full'),
      field('시작 시각 (비우면 항상)', from), field('종료 시각 (비우면 계속)', until),
      field(`하루 최대 횟수 (비우면 기본값 ${S.dailyCap})`, cap)),
    h('p.small-txt.muted', '하루 최대 횟수 = 한 학생이 이 QR을 하루에 찍을 수 있는 횟수. 희귀·전설 QR은 1을 추천해요.'),
    h('div.row', vis.el, act.el),
    h('div.row', h('b', '지도 위치: '), posTxt,
      h('button.btn.small', { onclick: () => { pos.x = pos.y = null; showPos(); map.update(); } }, '위치 지우기')),
    h('div.row.end', save));

  const map = mapBox(q, pos, showPos);
  return [editor, tokenBox(q, refresh), poolEditor(q, refresh), map.el];
}

function tokenBox(q, refresh) {
  const sec = S.secrets.get(q.id);
  const rotate = (hard) => async () => {
    const ok = await confirmBox(hard ? '토큰 즉시 폐기 (유출됐을 때)' : '토큰 교체', [
      hard ? '옛 QR은 지금 바로 못 쓰게 돼요. 이미 찍어 둔 오프라인 티켓도 무효가 될 수 있어요.'
        : `옛 QR은 앞으로 ${S.grace}분 동안만 더 인식돼요.`,
      h('p.warn-txt', '인쇄된 QR을 다시 붙여야 해요. 교체 후 위의 [QR 인쇄]에서 새 카드를 출력하세요.'),
      q.kind === 'rotating' ? '대형 화면 QR은 화면이 자동으로 새 토큰을 써요.' : null,
    ].filter(Boolean), { ok: hard ? '지금 폐기' : '교체하기', danger: true });
    if (!ok) return;
    try {
      const r = await rpc('admin_rotate_qr', { p_id: q.id, p_hard: hard });
      toast(`새 수동 코드: ${r.manual_code}`, 5000);
      await refresh();
    } catch (e) { fail(e); }
  };
  const site = siteBase();
  return h('div.box.stack',
    h('h3', '토큰 (QR 내용)'),
    q.kind === 'rotating'
      ? h('p', chip('대형 화면(screen.html) 전용', 'blue'), ' 30초마다 바뀌는 QR이라 인쇄하지 않아요.')
      : null,
    sec ? h('div.token-box',
      h('div', '수동 코드 ', h('span.code.mono', sec.manual_code)),
      q.kind === 'static' ? h('div.small-txt.mono', placeUrl(site, q.id, sec.token)) : h('div.small-txt.mono', `비밀값 생성: ${fmtTime(sec.created_at)}`),
      h('div.small-txt.muted', `발급: ${fmtTime(sec.created_at)}`))
      : h('p.warn-txt', '유효한 토큰이 없어요 — [토큰 교체]로 새로 만드세요.'),
    h('div.row',
      h('button.btn.small', { onclick: rotate(false) }, `토큰 교체 (옛 QR ${S.grace}분 유효)`),
      h('button.btn.small.primary', { onclick: rotate(true) }, '즉시 폐기 (유출됨)')));
}

function poolEditor(q, refresh) {
  const rows = S.rewards.filter((r) => r.qr_id === q.id).map((r) => ({ line_id: r.line_id, weight: r.weight }));
  const orig = rows.map((r) => r.line_id);
  const box = h('div.box.stack');
  const total = () => rows.reduce((a, r) => a + (Number(r.weight) > 0 ? Number(r.weight) : 0), 0);
  const pctCells = [];
  const totalTxt = h('span.pool-total');
  const updatePct = () => {
    const t = total();
    rows.forEach((r, i) => { pctCells[i].textContent = t && r.weight > 0 ? `${((r.weight / t) * 100).toFixed(1)}%` : '–'; });
    totalTxt.textContent = `가중치 합계 ${t}`;
  };
  const draw = () => {
    pctCells.length = 0;
    const avail = S.lines.filter((l) => !rows.some((r) => r.line_id === l.id));
    const sel = lineSelect(avail);
    const w = h('input.inp.w-num', { type: 'number', min: 1, step: 1, value: 10 });
    const tbody = h('tbody', rows.map((r, i) => {
      const l = S.lineById.get(r.line_id);
      const cell = h('td.num');
      pctCells.push(cell);
      return h('tr',
        h('td', lineName(r.line_id), ' ', l ? typeChip(lineType(l)) : null, l && !l.active ? chip('비활성 — 안 나옴', 'off') : null),
        h('td', h('input.inp.w-num', { type: 'number', min: 1, step: 1, value: r.weight, oninput: (e) => { r.weight = Math.floor(Number(e.target.value)); updatePct(); } })),
        cell,
        h('td', h('button.btn.small', { onclick: () => { rows.splice(i, 1); draw(); } }, '빼기')));
    }));
    const saveBtn = h('button.btn.go', '풀 저장');
    saveBtn.onclick = () => busy(saveBtn, async () => {
      if (rows.some((r) => !(r.weight >= 1))) throw Object.assign(new Error('가중치는 1 이상의 정수여야 해요.'), { ready: true });
      const removed = orig.filter((id) => !rows.some((r) => r.line_id === id));
      if (removed.length) await tq(sb.from('qr_rewards').delete().eq('qr_id', q.id).in('line_id', removed));
      if (rows.length) await tq(sb.from('qr_rewards').upsert(rows.map((r) => ({ qr_id: q.id, line_id: r.line_id, weight: r.weight }))));
      toast(`${q.id} 포켓몬 풀 저장했어요.`);
      await refresh();
    });
    box.replaceChildren(
      h('h3', '포켓몬 풀 (이 QR에서 나오는 포켓몬)'),
      h('p.small-txt.muted', '가중치가 클수록 잘 나와요. 확률 = 가중치 ÷ 합계.'),
      rows.length ? h('div.tbl-wrap', h('table.tbl',
        h('thead', h('tr', h('th', '계열'), h('th', '가중치'), h('th.num', '확률'), h('th', ''))), tbody))
        : h('p.notice.red', '풀이 비어 있어요! 이 QR 티켓은 부스에서 포켓몬이 안 나와요 (empty_pool).'),
      h('div.row', totalTxt),
      avail.length ? h('div.row', sel, w, h('button.btn.small', {
        onclick: () => {
          const wt = Math.floor(Number(w.value));
          if (!(wt >= 1)) { toast('가중치는 1 이상이에요.'); return; }
          rows.push({ line_id: Number(sel.value), weight: wt });
          draw();
        },
      }, '+ 추가')) : null,
      h('div.row.end', saveBtn));
    updatePct();
  };
  draw();
  return box;
}

// campus map: shows every QR; when a QR is selected, clicking sets its position (saved with 저장)
function mapBox(q, pos, onPick) {
  const wrap = h('div.map-wrap' + (q ? '' : '.ro'));
  const img = h('img', { src: 'img/map.webp', alt: '학교 지도', draggable: 'false' });
  wrap.append(img);
  const update = () => {
    wrap.querySelectorAll('.marker').forEach((m) => m.remove());
    for (const p of S.qrs) {
      const isSel = q && p.id === q.id;
      const x = isSel ? pos.x : p.map_x;
      const y = isSel ? pos.y : p.map_y;
      if (x == null || y == null) continue;
      const m = h(`div.marker${x > 0.88 ? '.flip' : ''}`, { style: { left: x * 100 + '%', top: y * 100 + '%' }, title: `${p.id} ${p.name}` }, h('span', p.id));
      if (isSel) m.classList.add('sel');
      if (!p.active) m.classList.add('off');
      wrap.append(m);
    }
  };
  if (q) {
    img.addEventListener('click', (e) => {
      const r = img.getBoundingClientRect();
      pos.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      pos.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      onPick?.();
      update();
    });
  }
  update();
  const el = h('div.box.stack',
    h('h3', '지도 위치'),
    h('p.small-txt.muted', q ? `지도를 누르면 ${q.id}의 위치가 바뀌어요 (빨간 점). 위의 [저장]을 눌러야 반영돼요.` : 'QR을 고르면 지도를 눌러 위치를 정할 수 있어요. 회색 = 꺼진 QR.'),
    wrap);
  return q ? { el, update } : el;
}

// ───────────────────────── 3. QR 인쇄 ─────────────────────────

// site root for place-QR URLs (folder of this page, no trailing slash)
const siteBase = () => new URL('.', location.href).href.replace(/\/$/, '');

async function tabPrint() {
  await loadQrData();
  const site = siteBase();
  const statics = S.qrs.filter((q) => q.active && q.kind === 'static');
  const rotating = S.qrs.filter((q) => q.kind === 'rotating');
  const local = /^https?:\/\/(localhost|127\.|192\.168\.|10\.)/.test(site) || location.protocol === 'file:';

  const cards = statics.map((q) => {
    const sec = S.secrets.get(q.id);
    if (!sec) return h('div.qr-card', h('div.qc-title', CONFIG.GAME_TITLE), h('p.warn-txt', `${q.id} ${q.name}: 토큰 없음 — [QR 관리]에서 토큰을 교체하세요.`));
    const url = placeUrl(site, q.id, sec.token);
    const cv = drawQR(document.createElement('canvas'), url, { cell: 10, margin: 4 });
    cv.setAttribute('aria-label', `${q.id} QR 코드`);
    return h('div.qr-card',
      h('div.qc-title', CONFIG.GAME_TITLE),
      cv,
      h('div.qc-name', q.name),
      h('div.qc-code', '수동 코드: ', h('b', sec.manual_code)),
      h('div.qc-id', q.id),
      h('button.btn.small.no-print', { onclick: () => savePng(q, sec, url) }, 'PNG 저장'));
  });

  const bar = h('div.box.stack.no-print',
    h('div.row', h('h2', `인쇄용 QR 카드 (${cards.length}장)`), h('span', { style: { flex: 1 } }),
      h('button.btn.go', { onclick: () => window.print(), disabled: !cards.length }, '🖨 인쇄')),
    h('p.small-txt', '활성 상태인 고정 QR만 나와요. A4 한 장에 2장씩 인쇄돼요 (QR 약 9cm). 코팅해서 2장씩 붙이세요.'),
    h('p.small-txt', 'QR 주소: ', h('span.mono', site + '/s#…')),
    local ? h('p.notice.red', `지금 주소(${site})는 이 컴퓨터에서만 열려요. 학생 폰에서 열리려면 실제로 배포된 사이트에서 이 페이지를 열고 인쇄하세요.`) : null,
    rotating.length ? h('p.small-txt', '대형 화면 QR: ', rotating.map((q) => h('span', chip(`${q.id} ${q.name} — 대형 화면(screen.html) 전용`, 'blue'), ' ')), '(인쇄하지 않아요)') : null);

  return [bar, cards.length ? h('div.print-grid', cards) : h('div.box', h('p.muted', '인쇄할 QR이 없어요.'))];
}

function savePng(q, sec, url) {
  const qr = drawQR(document.createElement('canvas'), url, { cell: 20, margin: 4 });
  const pad = 40, W = qr.width + pad * 2;
  const H = qr.height + 330;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#000'; g.textAlign = 'center';
  const font = (px, bold) => `${bold ? 'bold ' : ''}${px}px Galmuri11, 'Malgun Gothic', sans-serif`;
  g.font = font(44, true); g.fillText(CONFIG.GAME_TITLE, W / 2, 70);
  g.drawImage(qr, pad, 100);
  const y0 = 100 + qr.height;
  g.font = font(56, true); g.fillText(q.name, W / 2, y0 + 70, W - pad * 2);
  g.font = font(48); g.fillText(`수동 코드: ${sec.manual_code}`, W / 2, y0 + 150);
  g.font = font(28); g.fillStyle = '#555'; g.fillText(q.id, W / 2, y0 + 205);
  c.toBlob((blob) => {
    if (!blob) { toast('PNG를 만들지 못했어요.'); return; }
    const a = h('a', { href: URL.createObjectURL(blob), download: `QR_${q.id}_${q.name.replace(/[\\/:*?"<>|\s]+/g, '_')}.png` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}

// ───────────────────────── 4. 포켓몬·퀴즈 ─────────────────────────

// 0052: 포켓몬 탭 = 가족 (진화 계열 + 갈래) 마다 한 줄, 가족 안에 폼 (일반 · 선생님 · 이벤트 · 특별 전설). '선생님 찾기' = 선생님 → 포켓몬 표.
//   선생님 배정 = 가족에 '선생님 폼 만들기' (admin_create_teacher_form), 빼기 = '선생님 폼 끄기' (admin_set_form_active), 이름 = admin_rename_teacher.
//   예전 판 (계열마다 한 줄 + 계열을 통째로 바꾸던 admin_assign_teacher): git 기록 (0051 까지의 admin.js)
const FORM_KO = { normal: '일반', teacher: '선생님', event: '이벤트', special: '특별 전설' };
const MON_SCOPES = [['all', '전체'], ['teacher', '선생님 있음'], ['none', '선생님 없음'], ['special', '특별 전설'], ['event', '이벤트']];

// 가족 목록: [{ id, root, lines, normals, teachers, events, specials, names }]
function buildFamilies() {
  const fam = new Map();
  for (const l of S.lines) {
    const id = famOf(l);
    if (!fam.has(id)) fam.set(id, { id, lines: [] });
    fam.get(id).lines.push(l);
  }
  const out = [];
  for (const f of fam.values()) {
    f.root = S.lineById.get(f.id) || f.lines[0];
    const by = (k) => f.lines.filter((l) => formKindOf(l) === k);
    f.normals = by('normal').sort((a, b) => (a.id === f.id ? -1 : b.id === f.id ? 1 : a.id - b.id));
    f.teachers = by('teacher').sort((a, b) => Number(b.active) - Number(a.active) || a.id - b.id);
    f.events = by('event'); f.specials = by('special');
    f.names = [...new Set(f.lines.flatMap((l) => spOfLine(l).map((x) => x.name)))];
    f.dexes = [...new Set(spOfLine(f.root).map((x) => x.dex).filter(Boolean))].sort((a, b) => a - b);
    out.push(f);
  }
  return out;
}
const famLabel = (f) => chainName(f.root);
const dexRange = (f) => (f.dexes.length ? `No.${String(f.dexes[0]).padStart(3, '0')}${f.dexes.length > 1 ? ` 외 ${f.dexes.length - 1}` : ''}` : '');
const activeTeacher = (f) => f.teachers.find((l) => l.active);
const famBadges = (f) => [
  f.normals.length ? chip('일반', 'off') : null,
  ...f.teachers.map((l) => chip(`${teacherLabel(l)} · ${l.subject}${l.active ? '' : ' (꺼짐)'}`, l.active ? 'blue' : 'off')),
  ...f.events.map((l) => chip(`이벤트 · ${l.form_label || '소포'}`, 'warn')),
  ...f.specials.map((l) => chip(`전설 · ${l.teacher}`, 'warn')),
].filter(Boolean);
const famMatch = (f, q) => !q || [...f.names, ...f.lines.flatMap((l) => [l.teacher, l.subject, l.form_label, `#${l.id}`]), ...f.dexes.map(String)]
  .some((x) => String(x || '').toLowerCase().includes(q));

async function tabMon() {
  await Promise.all([loadCatalog(), atlasCap, spritesReady, refreshSprites().catch(() => {})]);
  const qz = await tq(selectAll('quizzes', 'line_id', (q) => q.order('line_id')));
  S.quizCount = new Map();
  for (const z of qz) S.quizCount.set(z.line_id, (S.quizCount.get(z.line_id) || 0) + 1);
  const fams = buildFamilies();
  S.famById = new Map(fams.map((f) => [f.id, f]));
  if (!S.selFam || !S.famById.has(S.selFam)) S.selFam = fams.find((f) => f.teachers.length)?.id ?? fams[0]?.id;
  const view = S.monView === 'teacher' ? 'teacher' : 'family';
  const listBox = h('div.box.stack.mon-list');
  const editBox = h('div.stack');
  const filter = h('input.inp', { type: 'search', value: S.monQuery || '', placeholder: view === 'teacher' ? '선생님 이름 · 과목 · 포켓몬으로 찾기' : '포켓몬 이름 · 선생님 이름 · 과목 · 도감 번호로 찾기', 'aria-label': '찾기' });
  const listEl = h('div.line-list');
  const scopeBar = h('div.chips');
  const setView = (v) => { S.monView = v; S.monQuery = ''; rerender(); };
  const viewBar = h('div.seg-ctl.mon-view', { role: 'group', 'aria-label': '보기' },
    h('button.btn.seg-btn', { type: 'button', 'aria-pressed': String(view === 'family'), onclick: () => setView('family') }, '포켓몬 가족별'),
    h('button.btn.seg-btn', { type: 'button', 'aria-pressed': String(view === 'teacher'), onclick: () => setView('teacher') }, `선생님 찾기 (${S.lines.filter(isTeacherLine).length})`));
  const open = (famId, formLine) => { S.selFam = famId; S.selForm = formLine ?? null; drawItems(); drawEdit(); if (window.innerWidth < 900) editBox.scrollIntoView({ block: 'start' }); };
  const inScope = (f) => {
    const sc = S.monScope || 'all';
    return sc === 'all' || (sc === 'teacher' ? !!activeTeacher(f) : sc === 'none' ? !activeTeacher(f) && f.normals.length > 0 && !f.specials.length
      : sc === 'special' ? f.specials.length > 0 : f.events.length > 0);
  };
  const drawItems = () => {
    const q = filter.value.trim().toLowerCase();
    S.monQuery = filter.value;
    if (view === 'teacher') {
      scopeBar.replaceChildren();
      const rows = S.lines.filter(isTeacherLine)
        .map((l) => ({ l, f: S.famById.get(famOf(l)) }))
        .filter(({ l, f }) => !q || [l.teacher, l.subject, teacherLabel(l), ...(f?.names || [])].some((x) => String(x || '').toLowerCase().includes(q)))
        .sort((a, b) => Number(b.l.active) - Number(a.l.active) || a.l.subject.localeCompare(b.l.subject, 'ko') || a.l.teacher.localeCompare(b.l.teacher, 'ko', { numeric: true }));
      listEl.replaceChildren(rows.length ? h('div.tbl-wrap', h('table.tbl.teacher-tbl',
        h('thead', h('tr', h('th', '선생님 · 과목'), h('th', '포켓몬'), h('th', '상태'))),
        h('tbody', rows.map(({ l }) => h(`tr.click${famOf(l) === S.selFam && S.selForm === l.id ? '.sel' : ''}`, { tabindex: 0, onclick: () => open(famOf(l), l.id), onkeydown: (e) => { if (e.key === 'Enter') open(famOf(l), l.id); } },
          h('td', h('b', l.teacher), h('br'), h('small.muted', `${l.subject} · 퀴즈 ${S.quizCount.get(l.id) || 0}`)),
          h('td', h('span.tt-mon', sprite(firstSp(l)?.id, 32), h('span', chainName(l)))),
          h('td', l.active ? chip('켜짐', 'ok') : chip('꺼짐', 'off'), l.withdrawn ? chip('동의 철회', 'hot') : null)))))) : h('p.muted', '찾는 선생님이 없어요.'));
      return;
    }
    scopeBar.replaceChildren(...MON_SCOPES.map(([k, t]) => h('button.chip.btnchip', { type: 'button', 'aria-pressed': String((S.monScope || 'all') === k),
      onclick: () => { S.monScope = k; drawItems(); } }, `${t} ${fams.filter((f) => { const o = S.monScope; S.monScope = k; const r = inScope(f); S.monScope = o; return r; }).length}`)));
    const shown = fams.filter((f) => inScope(f) && famMatch(f, q));
    const groups = byType(shown.map((f) => f.root));
    listEl.replaceChildren(...(shown.length ? groups.map(([t, roots]) => h('div.line-group',
      h('div.line-group-h', typeChip(t), ` ${roots.length}`),
      roots.map((r) => { const f = S.famById.get(famOf(r)) || shown.find((x) => x.root === r);
        return h('button.line-item', { type: 'button', 'aria-pressed': String(f.id === S.selFam), onclick: () => open(f.id) },
          sprite(firstSp(f.root)?.id, 48), h('div.meta',
            h('b', famLabel(f)), h('span.small-txt.muted', dexRange(f)),
            h('span.fam-badges', famBadges(f)))); }))) : [h('p.muted', '찾는 포켓몬이 없어요.')]));
  };
  filter.addEventListener('input', drawItems);
  const drawEdit = () => {
    editBox.replaceChildren(h('p.loading', '불러오는 중…'));
    familyEditor(S.selFam, rerender).then((n) => editBox.replaceChildren(...n), (e) => editBox.replaceChildren(h('div.box', h('p.warn-txt', msgOf(e)))));
  };
  listBox.replaceChildren(viewBar,
    h('p.small-txt.muted', view === 'teacher'
      ? '선생님을 누르면 오른쪽에 그 선생님 포켓몬 (폼) 이 열려요. 꺼진 폼은 학생이 이미 잡은 것만 남아 있어요.'
      : '가족 = 진화로 이어지는 포켓몬 묶음 (갈래 진화 포함). 한 가족에 일반 모습과 선생님 모습 (예: 물리 쌤의 피카츄) 이 함께 있어요.'),
    scopeBar, filter, listEl);
  drawItems(); drawEdit();
  return h('div.cols.wide-right', listBox, editBox);
}

// 오른쪽: 가족 하나 — 폼 단추 · 폼 내용
async function familyEditor(famId, redraw) {
  const f = S.famById.get(famId);
  if (!f) return [h('div.box', h('p.muted', '왼쪽에서 포켓몬 가족을 고르세요.'))];
  const forms = [...f.normals.slice(0, 1), ...f.teachers, ...f.events, ...f.specials];
  let cur = S.lineById.get(S.selForm);
  if (!cur || famOf(cur) !== f.id || (formKindOf(cur) === 'normal' && cur.id !== forms[0]?.id)) cur = f.teachers.find((l) => l.active) || forms[0];
  const formBtn = (l) => {
    const k = formKindOf(l);
    const label = k === 'normal' ? '일반' : k === 'teacher' ? `${teacherLabel(l)}` : k === 'event' ? `이벤트 · ${l.form_label || ''}` : `전설 · ${l.teacher}`;
    return h('button.form-pick', { type: 'button', 'aria-pressed': String(l.id === cur.id), onclick: () => { S.selForm = l.id; redraw(); } },
      sprite(firstSp(l)?.id, 32), h('span', h('b', label), h('small', k === 'teacher' ? `${l.subject}${l.active ? '' : ' · 꺼짐'}` : FORM_KO[k])));
  };
  const canTeach = formKindOf(f.root) === 'normal' && !f.specials.length;
  const add = canTeach ? h('button.btn.go', { type: 'button', onclick: () => createTeacherForm(f, redraw).catch(fail) }, activeTeacher(f) ? '선생님 바꾸기' : '+ 선생님 폼 만들기') : null;
  const head = h('div.box.stack',
    h('div.row', h('h2', famLabel(f)), h('span', { style: { flex: 1 } }), add),
    h('p.small-txt.muted', `${dexRange(f)} · 폼 ${forms.length}개 — 모든 폼이 도감 번호 · 타입 · 능력치 · 기술 · 진화를 함께 써요. 그림 · 이름 앞말 · 얻는 방법만 달라요.`),
    h('div.form-picks', { role: 'group', 'aria-label': '폼' }, forms.map(formBtn)),
    canTeach && !f.teachers.length ? h('p.notice', '이 가족에는 선생님 폼이 없어요. "+ 선생님 폼 만들기" 로 선생님을 붙일 수 있어요 (일반 폼은 그대로 야생에서 나와요).') : null);
  return [head, ...(await formPanel(cur, f, redraw))];
}

function spCards(l, redraw) {
  const k = formKindOf(l);
  return h('div.sp-grid', spOfLine(l).map((sp) => h('div.sp-card',
    h('div.pic', sprite(sp.id, 64)),
    h('b', `${k === 'teacher' ? `${teacherLabel(l)}의 ` : ''}${sp.name}`),
    h('span.small-txt.muted', `${sp.stage}단계 · No.${String(sp.dex || 0).padStart(3, '0')} · 종 #${sp.id}`),
    sp.btype ? h('div.chips', String(sp.btype).split('/').map((t) => typeChip(t))) : null,
    picTools(sp.id, redraw, k === 'teacher'))));
}

async function formPanel(l, f, redraw) {
  const k = formKindOf(l);
  const out = [];
  if (k === 'normal') {
    const rarity = h('select.inp', Object.entries(RARITY).map(([v, t]) => h('option', { value: v, selected: l.rarity === v }, t)));
    const act = checkbox('나옴 (끄면 야생 · 사파리 · 알에서 안 나옴)', l.active);
    const save = h('button.btn.go', '저장');
    save.onclick = () => busy(save, async () => {
      await tq(sb.from('lines').update({ rarity: rarity.value, active: act.input.checked }).eq('id', l.id));
      toast('저장했어요.'); await redraw();
    });
    out.push(h('div.box.stack', h('h2', '일반 폼 (야생)'),
      h('p.small-txt.muted', '보통 포켓몬이에요. 장소 QR 의 야생 · 걷기 · 사파리존 (구역 타입에 맞게) · 알 · 연습 배틀 상대로 나와요. 학교 도감 칸은 채우지 않아요.'),
      h('div.fields', field('희귀도 (나오는 비율)', rarity), h('div.fld', h('span', ' '), act.el)), h('div.row.end', save),
      f.normals.length > 1 ? h('p.small-txt', '이 가족에서 따로 잡히는 계열: ',
        f.normals.slice(1).map((x) => chip(`#${x.id} ${chainName(x)}`, 'off'))) : null));
    out.push(h('div.box.stack', h('h2', '그림'), h('p.small-txt.muted', '일반 폼 그림을 바꾸면 이 모습에만 쓰여요 (선생님 폼 그림은 따로).'), spCards(l, redraw)));
    return out;
  }
  if (k === 'teacher') {
    const tname = h('input.inp', { value: l.teacher, maxlength: 40 });
    const tsub = h('input.inp', { value: l.subject, list: 'subjects-t', maxlength: 20 });
    const preview = h('span.small-txt');
    const upd = () => { const t = tname.value.trim(); preview.textContent = t ? `학생 앱 이름: "${teacherLabel({ teacher: t })}의 ${firstSp(l)?.name || ''}"` : ''; };
    tname.oninput = upd; upd();
    const save = h('button.btn.go', '이름 · 과목 저장');
    save.onclick = () => busy(save, async () => {
      await rpc('admin_rename_teacher', { p_line: l.id, p_teacher: tname.value, p_subject: tsub.value });
      toast('저장했어요.'); await redraw();
    });
    const onoff = h(`button.btn${l.active ? '.primary' : '.go'}`, { type: 'button' }, l.active ? '선생님 폼 끄기' : '다시 켜기');
    onoff.onclick = () => busy(onoff, () => toggleTeacherForm(l, f, redraw));
    const wd = checkbox('선생님 동의 철회 (이름 · 그림 숨김)', l.withdrawn);
    wd.input.onchange = () => tq(sb.from('lines').update({ withdrawn: wd.input.checked }).eq('id', l.id)).then(() => { toast('저장했어요.'); redraw(); }, fail);
    const move = h('button.btn', { type: 'button', onclick: () => moveTeacher(l, redraw).catch(fail) }, '다른 포켓몬으로 옮기기');
    out.push(h('div.box.stack',
      h('div.row', h('h2', `선생님 폼 · ${l.teacher}`), h('span', { style: { flex: 1 } }), l.active ? chip('켜짐', 'ok') : chip('꺼짐', 'off')),
      h('p.small-txt.muted', `이 폼은 장소 QR · 퀴즈로만 나와요 (야생 · 사파리 · 알에는 안 나옴). 잡으면 학교 도감 칸이 채워져요. 퀴즈 ${S.quizCount.get(l.id) || 0}개.`),
      !l.active ? h('p.notice', '꺼진 폼이에요: QR · 퀴즈에서 안 나오고 학교 도감 칸에서도 빠졌어요. 학생이 이미 잡은 포켓몬은 그대로 있어요.') : null,
      h('datalist#subjects-t', SUBJECTS.filter((x) => x !== '전설').map((x) => h('option', { value: x }))),
      h('div.fields', field('선생님', tname), field('과목', tsub), h('div.fld', h('span', ' '), save)), preview,
      h('div.row', onoff, move, wd.el)));
    out.push(h('div.box.stack', h('h2', '선생님 얼굴 그림'),
      h('p.small-txt.muted', '여기 올린 그림은 이 선생님 폼에만 쓰여요. 같은 포켓몬의 일반 모습 (야생) 은 원래 그림 그대로예요.'), spCards(l, redraw)));
    out.push(await quizSection(l));
    return out;
  }
  out.push(h('div.box.stack', h('h2', k === 'event' ? `이벤트 폼 · ${spOfLine(l)[0]?.name || ''}` : `특별 전설 · ${l.teacher}`),
    h('p.small-txt.muted', k === 'event'
      ? '이상한 소포로만 받는 모습이에요 (전설 · 소포 탭 → 소포 만들기 → 이벤트 포켓몬 단추). 도감 수에는 안 세요.'
      : '학교 특별 전설 자리예요 (교장/교감 · 탐구 활동 · 야자 · 비밀 · 환상). 선생님 폼을 붙이지 않아요.'),
    spCards(l, redraw)));
  return out;
}

// 학교 도감에서 빠질 칸 수 (이 폼만 가진 도감 번호)
function schoolLoss(l) {
  const others = new Set(S.lines.filter((x) => x.id !== l.id && x.active && !x.withdrawn && !isWildLine(x) && !x.secret && !x.mythic).flatMap((x) => spOfLine(x).map((s) => s.dex)));
  return new Set(spOfLine(l).map((s) => s.dex).filter((d) => d && !others.has(d))).size;
}

async function toggleTeacherForm(l, f, redraw) {
  if (l.active) {
    const n = schoolLoss(l);
    if (!await confirmBox(`${l.teacher} 폼 끄기`, [
      `"${teacherLabel(l)}의 ${firstSp(l)?.name}" 폼을 꺼요.`,
      h('ul.tight', h('li', '장소 QR · 퀴즈에서 이 선생님 포켓몬이 더 이상 안 나와요.'),
        h('li', `학교 도감 칸이 ${n}칸 줄어요 (해금 · 도감 보상 기준도 그만큼 바뀌어요). 이미 잡은 학생은 그 칸이 계속 채워진 채로 남아요.`),
        h('li', '학생이 잡은 포켓몬은 지워지지 않아요. 퀴즈 · 장소 QR 보상은 이 폼에 남아 있어서 다시 켜면 그대로 나와요.')),
    ], { ok: '끄기', danger: true })) return;
  } else if (activeTeacher(f)) {
    toast(`이 가족에는 이미 켜진 선생님 폼 (${activeTeacher(f).teacher}) 이 있어요. 먼저 그것을 꺼 주세요.`, 5000); return;
  }
  const r = await rpc('admin_set_form_active', { p_line: l.id, p_active: !l.active });
  toast(`${r.active ? '켰어요' : '껐어요'}. 학교 도감 = ${r.school_total}칸`, 4000);
  S.selForm = l.id;
  await redraw();
}

// 가족에 선생님 폼 만들기 (이미 켜진 선생님 폼이 있으면: 이름만 고치기 / 새 선생님으로 바꾸기)
async function createTeacherForm(f, redraw) {
  const old = activeTeacher(f);
  const tname = h('input.inp', { placeholder: '예: 물리 선생님', maxlength: 40 });
  const tsub = h('input.inp', { list: 'subjects-new', placeholder: '예: 과학', maxlength: 20 });
  const pv = h('p.small-txt');
  tname.oninput = () => { const t = tname.value.trim(); pv.textContent = t ? `학생 앱 이름: "${teacherLabel({ teacher: t })}의 ${firstSp(f.root)?.name}"` : ''; };
  const body = h('div.stack',
    h('p', `${famLabel(f)} 가족에 선생님 폼을 만들어요. 같은 포켓몬이지만 이름 앞에 선생님이 붙고, 장소 QR · 퀴즈로만 나와요.`),
    old ? h('p.notice', `지금 이 가족에는 ${old.teacher} (${old.subject}) 폼이 켜져 있어요. 오타만 고치려면 그 폼에서 "이름 · 과목 저장" 을 쓰세요. 여기서 만들면 ${old.teacher} 폼은 꺼져요 (잡은 학생 것은 그대로, 퀴즈는 ${old.teacher} 폼에 남음).`) : null,
    h('datalist#subjects-new', SUBJECTS.filter((x) => x !== '전설').map((x) => h('option', { value: x }))),
    h('div.fields', field('선생님 이름', tname), field('과목', tsub)), pv,
    h('p.small-txt.muted', '갈래 진화 가족 (이브이 등) 도 돼요 — 진화하면 그 선생님 폼 안의 갈래 중 하나가 무작위로 나와요.'),
    h('p.notice.red', '쌤 외모·사생활은 금지! 과목·학교 관련 내용만 쓰세요.'));
  const r = await modal(old ? '새 선생님으로 바꾸기' : '선생님 폼 만들기', body, [
    { label: '취소', value: null },
    { label: old ? `${old.teacher} 폼 끄고 만들기` : '만들기', cls: 'go', onClick: async () => {
      if (!tname.value.trim() || !tsub.value.trim()) { toast('선생님 이름과 과목을 넣어 주세요.'); return false; }
      return rpc('admin_create_teacher_form', { p_family: f.id, p_teacher: tname.value, p_subject: tsub.value, p_replace: !!old });
    } },
  ]);
  if (!r) return;
  toast(`${r.label}의 ${firstSp(f.root)?.name} 폼을 만들었어요. 퀴즈를 넣고, 원하면 선생님 얼굴 그림을 올려 주세요.`, 6000);
  S.selFam = f.id; S.selForm = r.line;
  await redraw();
}

// 선생님을 다른 가족으로 옮기기: 새 가족에 같은 이름의 선생님 폼 + 퀴즈 · 장소 QR 보상이 따라감, 원래 폼은 꺼짐
async function moveTeacher(l, redraw) {
  const fams = buildFamilies().filter((f) => f.id !== famOf(l) && formKindOf(f.root) === 'normal' && !f.specials.length);
  const sel = h('select.inp', byType(fams.map((f) => f.root)).map(([t, roots]) => h('optgroup', { label: t },
    roots.map((r) => { const f = fams.find((x) => x.root === r); const at = activeTeacher(f);
      return h('option', { value: f.id }, `${famLabel(f)}${at ? ` — 지금 ${at.teacher}` : ''}`); }))));
  const body = h('div.stack',
    h('p', `${l.teacher} (${l.subject}) 를 다른 포켓몬으로 옮겨요.`),
    h('ul.small-txt.tight', h('li', '새 포켓몬 가족에 같은 이름의 선생님 폼이 생기고, 퀴즈 · 장소 QR 보상이 함께 옮겨져요.'),
      h('li', `지금 폼 (${chainName(l)}) 은 꺼져요. 학생이 이미 잡은 것은 그대로 남아요.`),
      h('li', '옮길 가족에 이미 켜진 선생님 폼이 있으면 그 폼도 꺼져요.')),
    field('옮길 포켓몬 가족', sel));
  const r = await modal('다른 포켓몬으로 옮기기', body, [
    { label: '취소', value: null },
    { label: '옮기기', cls: 'go', onClick: () => rpc('admin_create_teacher_form', { p_family: Number(sel.value), p_teacher: l.teacher, p_subject: l.subject, p_move_from: l.id, p_replace: true }) },
  ]);
  if (!r) return;
  toast(`${l.teacher} → ${famLabel(S.famById.get(r.family) || { root: S.lineById.get(r.family) })} (퀴즈 ${r.quizzes}개 · QR ${r.qr_rewards}곳 옮김)`, 6000);
  S.selFam = r.family; S.selForm = r.line;
  await redraw();
}

// ── 포켓몬 그림 올리기 (0031): Storage 'sprites' + species.sprite. 올리면 모든 학생 앱에 바로 쓰임 ──
const PIC_TYPES = { 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
const PIC_MAX_BYTES = 1024 * 1024, PIC_MAX_SIDE = 256;
// 공식 포켓몬 그림 (0032, .work/pokemon/sprites.mjs 가 올림): <id>-p.gif|png, 색이 다른 그림 <id>-ps.gif|png — 지우지 않고 '원래 그림' 으로 씀
const isPackPic = (path) => /^[0-9]+-ps?\.(gif|png)$/.test(path || '');
const packPic = (sp) => { const ext = (sp?.dex || 0) <= 649 ? 'gif' : 'png'; return { sprite: `${sp.id}-p.${ext}`, sprite_shiny: `${sp.id}-ps.${ext}` }; };
const hasPack = (sp) => !!sp?.dex;
const ready = (msg) => Object.assign(new Error(msg), { ready: true });

function picTools(dex, redraw, face = false) {
  const sp = S.spById.get(dex);
  const custom = sp?.sprite && !isPackPic(sp.sprite);          // 운영자가 직접 올린 그림
  const up = h('button.btn.small.go', { type: 'button', onclick: () => uploadPic(dex, redraw).catch(fail) }, face ? (sp?.sprite && !isPackPic(sp.sprite) ? '선생님 얼굴 그림 바꾸기' : '선생님 얼굴 그림 올리기') : sp?.sprite && !isPackPic(sp.sprite) ? '그림 바꾸기' : '그림 올리기');
  const back = custom ? h('button.btn.small', { type: 'button' }, hasPack(sp) || dex <= ATLAS_CAP ? '원래 그림으로' : '그림 지우기') : null;
  if (back) back.onclick = () => busy(back, () => resetPic(dex, redraw));
  const dl = h('button.btn.small', { type: 'button', title: '보통 그림과 반짝이(색이 다른) 그림을 PNG 로 저장' }, '그림 내려받기');
  dl.onclick = () => busy(dl, () => downloadPics(dex));
  return h('div.pic-tools', custom ? chip('올린 그림', 'ok') : h('span.small-txt.muted', sp?.sprite ? '공식 그림' : dex <= ATLAS_CAP || hasArt(dex) ? '원래 그림' : '그림 없음'), up, back, dl);
}

// 그림 내려받기: 0493-아르세우스.png + 0493-아르세우스-shiny.png (번호 = 전국도감 번호, 없으면 종 번호)
const picFileName = (sp, id, shiny) => `${String(sp?.dex || id).padStart(4, '0')}-${String(sp?.name || `포켓몬${id}`).replace(/[\\/:*?"<>|\s]+/g, '_')}${shiny ? '-shiny' : ''}.png`;
async function downloadPics(dex) {
  const sp = S.spById.get(dex);
  let saved = 0;
  for (const shiny of [false, true]) {
    const blob = await spriteBlob(dex, shiny);
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: picFileName(sp, dex, shiny) });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    saved++;
    await new Promise((r) => setTimeout(r, 300));   // 두 파일을 바로 이어서 받으면 브라우저가 하나를 막을 때가 있음
  }
  toast(saved ? `그림 ${saved}장을 내려받았어요.` : '이 포켓몬은 내려받을 그림이 없어요.');
}

async function readPic(file) {
  if (!file) return null;
  if (file.size > PIC_MAX_BYTES) throw ready(`파일이 너무 커요 (${Math.round(file.size / 1024)}KB). 1MB 이하로 줄여 주세요.`);
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf.slice(0, 12));
  const type = u8[0] === 0x89 && u8[1] === 0x50 ? 'image/png' : u8[0] === 0x47 && u8[1] === 0x49 ? 'image/gif'
    : u8[0] === 0x52 && u8[8] === 0x57 ? 'image/webp' : null;
  if (!type) throw ready('PNG · GIF · WebP 그림만 올릴 수 있어요.');
  let rec;
  try { rec = await decodeSprite(buf); } catch (e) {
    const why = { GIF_TOO_BIG: `GIF 가 너무 커요 (한 변 ${PIC_MAX_SIDE}픽셀까지).`, GIF_TOO_LONG: 'GIF 장면이 너무 많아요 (120장까지).' }[e.message];
    throw ready(why || '그림을 읽지 못했어요. 다른 파일로 해 보세요.');
  }
  if (rec.w > PIC_MAX_SIDE || rec.h > PIC_MAX_SIDE) throw ready(`그림이 너무 커요 (${rec.w}×${rec.h}). 한 변 ${PIC_MAX_SIDE}픽셀 이하로 해 주세요. 도트 그림은 64×64~128×128이 알맞아요.`);
  return { file, type, rec };
}

function picPreview(rec, dex) {
  const cell = (label, el) => h('figure.pv', h('div.pv-pic', el), h('figcaption', label));
  const mini = document.createElement('canvas');
  mini.width = mini.height = 64; mini.className = 'sprite';
  { const n = normRec(rec); mini.getContext('2d').drawImage(fitCell(n.cv, n.w, n.h), 0, 0); }
  mini.style.width = mini.style.height = '64px'; mini.style.imageRendering = 'pixelated';
  return h('div.pv-grid',
    cell('가방·목록', previewCanvas(rec, 40, 'normal', dex)),
    cell('도감 칸', previewCanvas(rec, 72, 'normal', dex)),
    cell('도감 자세히', previewCanvas(rec, 176, 'normal', dex)),
    cell('못 잡음 (???)', previewCanvas(rec, 72, 'silhouette', dex)),
    cell('반짝이', previewCanvas(rec, 72, 'shiny', dex)),
    cell('미니게임 (첫 장면)', mini));
}

async function uploadPic(dex, redraw) {
  const sp = S.spById.get(dex);
  const input = h('input.inp', { type: 'file', accept: 'image/png,image/gif,image/webp' });
  const info = h('p.small-txt.muted', '도트 그림 파일을 고르세요. GIF 는 첫 장면만 써요.');
  const pv = h('div');
  let picked = null;
  input.onchange = async () => {
    picked = null; pv.replaceChildren();
    try {
      picked = await readPic(input.files[0]);
      if (!picked) return;
      const r = picked.rec;
      info.textContent = `${r.w}×${r.h}` + (r.frames.length > 1 ? ` · GIF ${r.frames.length}장 중 첫 장면만 씀` : ' · 멈춘 그림')
        + ` · ${Math.max(1, Math.round(picked.file.size / 1024))}KB`;
      info.className = 'small-txt';
      pv.replaceChildren(picPreview(r, dex),
        Math.max(r.w, r.h) > 160 ? h('p.notice', '그림이 커서 작은 칸에서는 줄어 보여요. 도트가 고르게 보이려면 64×64~128×128을 추천해요.') : '');
    } catch (e) { info.textContent = msgOf(e); info.className = 'small-txt warn-txt'; }
  };
  const body = h('div.stack',
    h('p', `${sp?.name || `#${dex}`} (종 #${dex}) 의 그림을 바꿔요. 이 모습 (폼) 에만 쓰이고, 같은 포켓몬의 다른 모습은 그대로예요. 학생 앱 · 부스 · 대형 화면 · 미니게임에 모두 쓰여요.`),
    h('ul.small-txt.muted.tight',
      h('li', 'PNG · WebP · GIF (첫 장면만), 1MB · 한 변 256픽셀까지. 공식 그림과 같은 96×96 칸에 맞춰 도트로 정리돼요'),
      h('li', '배경은 투명하게, 포켓몬 발이 그림 아래쪽에 닿게 (원래 그림처럼 정사각형 + 둘레에 조금 여백)'),
      h('li', '올린 뒤에도 "원래 그림으로" 단추로 언제든 되돌릴 수 있어요')),
    field('그림 파일', input), info, pv);
  const ok = await modal('포켓몬 그림 올리기', body, [
    { label: '취소', value: null },
    {
      label: '올리기', cls: 'go',
      onClick: async () => {
        if (!picked) { toast('먼저 그림 파일을 고르세요.'); return false; }
        const path = `${dex}-${Date.now().toString(36)}.${PIC_TYPES[picked.type]}`;
        const old = S.spById.get(dex)?.sprite;
        const { error } = await sb.storage.from('sprites').upload(path, picked.file, { contentType: picked.type, cacheControl: '31536000', upsert: false });
        if (error) throw ready(`그림을 올리지 못했어요 (${error.message})`);
        try {
          await tq(sb.from('species').update({ sprite: path, sprite_shiny: null }).eq('id', dex));   // 색이 다른 그림은 색을 돌려서 만듦
        } catch (e) { await sb.storage.from('sprites').remove([path]); throw e; }
        if (old && !isPackPic(old)) await sb.storage.from('sprites').remove([old]);   // 예전에 올린 파일 정리 (공식 그림은 남김)
        return true;
      },
    },
  ]);
  if (!ok) return;
  await refreshSprites().catch(() => {});
  toast('그림을 바꿨어요. 학생 앱은 다음에 열 때부터 새 그림이 보여요.', 5000);
  await redraw();
}

async function resetPic(dex, redraw) {
  const sp = S.spById.get(dex);
  const old = sp?.sprite;
  if (!old || isPackPic(old)) return;
  const keep = hasPack(sp) || dex <= ATLAS_CAP;
  if (!await confirmBox(keep ? '원래 그림으로 되돌리기' : '그림 지우기',
    [keep ? '올린 그림을 지우고 원래(공식) 그림으로 돌아가요.' : '올린 그림을 지워요. 이 포켓몬은 기본 그림이 없어서 빈칸으로 보여요.'],
    { ok: keep ? '되돌리기' : '지우기', danger: !keep })) return;
  await tq(sb.from('species').update(hasPack(sp) && dex < 10000 ? packPic(sp) : { sprite: null, sprite_shiny: null }).eq('id', dex));   // 0052: 폼 종 (10000+) = 같은 번호 그림판 칸으로
  await sb.storage.from('sprites').remove([old]);
  await refreshSprites().catch(() => {});
  toast(keep ? '원래 그림으로 돌렸어요.' : '그림을 지웠어요.');
  await redraw();
}

async function quizSection(l) {
  const quizzes = await tq(sb.from('quizzes').select('id,question,choices,active').eq('line_id', l.id).order('id'));
  const answers = quizzes.length ? await tq(sb.from('quiz_answers').select('quiz_id,answer').in('quiz_id', quizzes.map((z) => z.id))) : [];
  const ans = new Map(answers.map((a) => [a.quiz_id, a.answer]));
  const box = h('div.box.stack',
    h('div.row', h('h2', `퀴즈 (${quizzes.length}개)`), h('span', { style: { flex: 1 } }),
      h('button.btn.small.go', { onclick: () => editQuiz(l, null, null) }, '+ 퀴즈 추가')),
    h('p.notice.red', '쌤 외모·사생활 금지! 과목/학교 관련 문제만 내 주세요. 학생은 같은 문제를 두 번 받지 않아요.'),
    quizzes.length ? null : h('p.muted', '아직 퀴즈가 없어요. 퀴즈가 없으면 이 포켓몬을 잡아도 진화의 돌 기회가 없어요.'),
    quizzes.map((z, i) => {
      const a = ans.get(z.id);
      return h('div.quiz-item',
        h('div.row', h('b', `Q${i + 1}.`), h('span', { style: { flex: 1 } }, z.question),
          z.active ? null : chip('꺼짐', 'off'), a == null ? chip('정답 없음 — 출제 안 됨', 'hot') : null),
        h('ol', z.choices.map((c, k) => h('li', { class: k === a ? 'right' : null }, String(c), k === a ? ' ✔' : ''))),
        h('div.row.end',
          h('button.btn.small', { onclick: () => editQuiz(l, z, a) }, '수정'),
          h('button.btn.small.primary', { onclick: () => deleteQuiz(l, z) }, '삭제')));
    }));
  return box;
}

async function editQuiz(l, z, answer) {
  const question = h('textarea.inp', z?.question || '');
  const act = checkbox('출제함 (끄면 이 문제는 안 나옴)', z ? z.active : true);
  const choices = (z?.choices || ['', '']).map(String);
  let correct = answer ?? 0;
  const list = h('div.stack');
  const name = 'qz-correct';
  const draw = () => {
    list.replaceChildren(...choices.map((c, i) => h('div.choice-row',
      h('input', { type: 'radio', name, checked: i === correct, 'aria-label': `${i + 1}번을 정답으로`, onchange: () => { correct = i; } }),
      h('input.inp', { value: c, placeholder: `보기 ${i + 1}`, oninput: (e) => { choices[i] = e.target.value; } }),
      h('button.btn.small', {
        type: 'button', disabled: choices.length <= 2,
        onclick: () => { choices.splice(i, 1); if (correct >= choices.length) correct = choices.length - 1; else if (correct > i) correct--; draw(); },
      }, '빼기'))),
    ...(choices.length < 4 ? [h('button.btn.small', { type: 'button', onclick: () => { choices.push(''); draw(); } }, '+ 보기 추가')] : []));
  };
  draw();
  const body = h('div.stack',
    h('p.small-txt', `${lineName(l.id)} · 보기 2~4개, 왼쪽 동그라미 = 정답`),
    h('p.notice.red', '쌤 외모·사생활 금지, 과목/학교 관련만!'),
    field('문제', question), list, act.el);
  await modal(z ? '퀴즈 수정' : '퀴즈 추가', body, [
    { label: '취소', value: null },
    {
      label: '저장', cls: 'go',
      onClick: async () => {
        const cs = choices.map((c) => c.trim());
        if (!question.value.trim()) { toast('문제를 입력하세요.'); return false; }
        if (cs.length < 2 || cs.length > 4 || cs.some((c) => !c)) { toast('보기 2~4개를 모두 채워 주세요.'); return false; }
        if (!(correct >= 0 && correct < cs.length)) { toast('정답을 고르세요.'); return false; }
        const row = { line_id: l.id, question: question.value.trim(), choices: cs, active: act.input.checked };
        let id = z?.id;
        if (id) await tq(sb.from('quizzes').update(row).eq('id', id));
        else id = (await tq(sb.from('quizzes').insert(row).select('id').single())).id;
        await tq(sb.from('quiz_answers').upsert({ quiz_id: id, answer: correct }));
        toast('퀴즈를 저장했어요.');
        rerender();
        return true;
      },
    },
  ]);
}

async function deleteQuiz(l, z) {
  const ok = await confirmBox('퀴즈 삭제', [
    `"${z.question}"`,
    '이 문제를 이미 받은 학생들의 풀이 기록도 함께 지워져요. 잠깐 빼려는 거면 [수정]에서 "출제함"을 끄는 걸 추천해요.',
  ], { ok: '삭제', danger: true });
  if (!ok) return;
  try { await tq(sb.from('quizzes').delete().eq('id', z.id)); toast('삭제했어요.'); rerender(); } catch (e) { fail(e); }
}

// ───────────────────────── 5. 학생 ─────────────────────────

async function tabStu() {
  if (!S.qrs.length) { try { await loadQrData(); } catch { /* names only */ } }
  const input = h('input.inp', { value: S.stuQuery, placeholder: '학번 앞자리(예: 022), 이름, 손님·선생님 아이디(예: t01 또는 g:)', 'aria-label': '학생 검색' });
  const results = h('div');
  const detail = h('div');
  const search = async () => {
    S.stuQuery = input.value.trim();
    results.replaceChildren(h('p.loading', '검색 중…'));
    try {
      const q = S.stuQuery.replace(/[%_*,()\\."]/g, '');
      let b = sb.from('profiles').select('user_id,student_id,name,gen,role,evo_tickets,score,dex_count,last_seen').order('student_id').limit(50);
      if (q && /^([0-9]|staff|g:)/i.test(q)) b = b.like('student_id', q.toLowerCase() + '%');
      // name, or a guest/teacher login-code id typed without the 'g:' prefix (t01 → g:t01)
      else if (q) b = b.or(`name.ilike.*${q}*,student_id.like.g:${q.toLowerCase()}*`);
      const rows = await tq(b);
      // 기록 삭제용 체크 (학생 계정만. 운영자·부스는 지울 수 없음)
      S.stuChecked = new Set([...(S.stuChecked || [])].filter((x) => rows.some((r) => r.student_id === x)));
      const delBtn = h('button.btn.small.danger', { type: 'button', onclick: () => deleteStudents([...S.stuChecked], search) });
      const syncDel = () => { delBtn.textContent = `체크한 학생 기록 삭제 (${S.stuChecked.size}명)`; delBtn.disabled = !S.stuChecked.size; };
      const students = rows.filter((r) => r.role === 'student');
      const all = h('input', { type: 'checkbox', 'aria-label': '이 목록의 학생 모두 체크',
        onclick: (e) => { e.stopPropagation(); students.forEach((r) => (e.target.checked ? S.stuChecked.add(r.student_id) : S.stuChecked.delete(r.student_id)));
          results.querySelectorAll('td.chk input').forEach((c) => { c.checked = S.stuChecked.has(c.dataset.sid); }); syncDel(); } });
      syncDel();
      results.replaceChildren(h('div.box',
        h('div.row', h('h2', { style: { flex: 1 } }, `검색 결과 (${rows.length}${rows.length === 50 ? '+' : ''}명)`), rows.length ? delBtn : null),
        rows.length ? h('div.tbl-wrap.scroll-y', h('table.tbl',
          h('thead', h('tr', h('th.chk', all), h('th', '학번'), h('th', '이름'), h('th', '역할'), h('th.num', '점수'), h('th.num', '진화의 돌'), h('th', '접속'))),
          h('tbody', rows.map((p) => {
            const chk = p.role === 'student'
              ? h('input', { type: 'checkbox', 'data-sid': p.student_id, checked: S.stuChecked.has(p.student_id), 'aria-label': `${p.student_id} 체크`,
                onclick: (e) => { e.stopPropagation(); if (e.target.checked) S.stuChecked.add(p.student_id); else S.stuChecked.delete(p.student_id); syncDel(); } })
              : '';
            const tr = h('tr.click', { tabindex: 0, onclick: () => open(p.student_id), onkeydown: (e) => { if (e.key === 'Enter') open(p.student_id); } },
              h('td.chk', { onclick: (e) => e.stopPropagation() }, chk),
              h('td.mono', p.student_id), h('td', p.name || '–'), h('td', isGuest(p.student_id) ? '손님·선생님' : ROLE[p.role] || p.role),
              h('td.num', p.score), h('td.num', p.evo_tickets), h('td', p.last_seen ? timeAgo(p.last_seen) : '–'));
            if (p.student_id === S.stuSel) tr.classList.add('sel');
            return tr;
          })))) : h('p.muted', '찾는 학생이 없어요.')));
    } catch (e) { results.replaceChildren(h('div.box', h('p.warn-txt', msgOf(e)))); }
  };
  const open = async (sid) => {
    S.stuSel = sid;
    results.querySelectorAll('tr.sel').forEach((t) => t.classList.remove('sel'));
    [...results.querySelectorAll('tbody tr')].find((t) => t.children[1]?.textContent === sid)?.classList.add('sel');
    detail.replaceChildren(h('p.loading', '불러오는 중…'));
    try { detail.replaceChildren(...await studentDetail(sid, async () => { await search(); await open(sid); })); } catch (e) { detail.replaceChildren(h('div.box', h('p.warn-txt', msgOf(e)))); }
  };
  const form = h('form.box.row', { onsubmit: (e) => { e.preventDefault(); search(); } },
    h('div', { style: { flex: '1 1 240px' } }, input), h('button.btn.go', { type: 'submit' }, '검색'),
    h('button.btn', { type: 'button', onclick: () => { input.value = 'g:'; search(); } }, '손님·선생님만'));
  search().then(() => { if (S.stuSel) open(S.stuSel); });
  const wipe = h('div.box.stack.danger-zone',
    h('h2', '기록 삭제 (테스트·더미 데이터 정리)'),
    h('p.small-txt', '위 검색 결과에서 학생을 체크한 뒤 [체크한 학생 기록 삭제]를 누르면 그 학생들만 지워요. 아래 버튼은 학생 계정 전부를 지워요. 운영자·부스 계정은 지워지지 않아요.'),
    h('button.btn.danger', { type: 'button', onclick: () => deleteStudents(null, search) }, '학생 기록 전체 삭제'));
  return [form, rankingSection(), h('div.cols', results, detail), wipe];
}

// 기록 삭제: 1단계 경고 → 2단계 글자 입력. ids = null 이면 전체
async function deleteStudents(ids, after) {
  const allMode = ids == null;
  let n = ids?.length || 0;
  if (allMode) {
    try { n = (await rpc('admin_count_students')).students; } catch (e) { fail(e); return; }
  }
  if (!n) { toast(allMode ? '지울 학생 기록이 없어요.' : '먼저 지울 학생을 체크하세요.'); return; }
  const step1 = await confirmBox(allMode ? '학생 기록 전체 삭제 (1/2)' : `체크한 학생 기록 삭제 (1/2)`, [
    h('p.warn-txt', allMode
      ? `학생 계정 ${n}명의 기록을 전부 지워요. 도감·티켓·진화의 돌·점수·배틀 기록이 모두 사라지고 되돌릴 수 없어요.`
      : `${n}명의 기록을 지워요. 도감·티켓·진화의 돌·점수·배틀 기록이 모두 사라지고 되돌릴 수 없어요.`),
    allMode ? '축제 전에 테스트로 만든 데이터를 정리할 때만 쓰세요. 축제 중에는 절대 누르지 마세요!' : h('p.small-txt.mono', ids.slice(0, 30).join(', ') + (ids.length > 30 ? ` 외 ${ids.length - 30}명` : '')),
    '고유번호로 만든 계정은 로그인도 같이 지워져서, 같은 번호로 처음부터 다시 가입할 수 있어요.',
  ], { ok: '다음', danger: true });
  if (!step1) return;
  const word = allMode ? '전체 삭제' : '삭제';
  const step2 = await confirmBox(`정말 지울까요? (2/2)`, [
    h('p.warn-txt', `${n}명의 기록이 영구히 사라져요.`),
  ], { ok: '영구 삭제', danger: true, typeToConfirm: word });
  if (!step2) return;
  try {
    const r = await rpc('admin_delete_students', { p_student_ids: ids, p_confirm: word });
    toast(`${r.deleted}명의 기록을 지웠어요.${r.logins ? ` (고유번호 로그인 ${r.logins}개 포함)` : ''}`);
    S.stuChecked = new Set(); S.stuSel = null;
    await after?.();
  } catch (e) { fail(e); }
}

async function studentDetail(sid, reload) {
  const p = await tq(sb.from('profiles').select('*').eq('student_id', sid).maybeSingle());
  if (!p) return [h('div.box', h('p.muted', '이 학생을 찾지 못했어요 (연결 해제됐을 수 있어요).'))];
  const [tickets, coll, events] = await Promise.all([
    tq(sb.from('tickets').select('id,nonce,qr_id,status,created_at,redeemed_at,result_species').eq('user_id', p.user_id).order('created_at', { ascending: false }).limit(100)),
    tq(sb.from('collection').select('id,line_id,stage,species_id,catch_count,evo_fails,first_caught_at,level,released_at').eq('user_id', p.user_id).order('line_id')),
    tq(sb.from('events').select('at,kind,data').eq('user_id', p.user_id).order('at', { ascending: false }).limit(30)),
  ]);

  const act = async (fn, args, okMsg) => {
    try { await rpc(fn, args); toast(okMsg); await reload(); } catch (e) { fail(e); }
  };

  const delta = h('input.inp.w-num', { type: 'number', min: 1, step: 1, value: 1, 'aria-label': '진화의 돌 개수' });
  const adj = (sign) => () => {
    const n = Math.floor(Number(delta.value));
    if (!(n >= 1)) { toast('1 이상의 숫자를 넣으세요.'); return; }
    act('admin_adjust_tickets', { p_student_id: sid, p_delta: sign * n }, `진화의 돌 ${sign > 0 ? '+' : '-'}${n}`);
  };
  const roleSel = h('select.inp', { style: { width: 'auto' } }, Object.entries(ROLE).map(([k, v]) => h('option', { value: k, selected: p.role === k }, v)));
  const setRole = async () => {
    if (roleSel.value === p.role) { toast('이미 그 역할이에요.'); return; }
    const ok = await confirmBox('역할 변경', [`${sid} 의 역할을 "${ROLE[p.role]}" → "${ROLE[roleSel.value]}"(으)로 바꿀까요?`,
      roleSel.value === 'admin' ? h('p.warn-txt', '운영자는 모든 데이터를 고칠 수 있어요. 믿을 수 있는 사람만!') : null].filter(Boolean), { ok: '변경' });
    if (ok) act('admin_set_role', { p_student_id: sid, p_role: roleSel.value }, '역할을 바꿨어요.');
  };
  const toggleRanking = async () => {
    const to = !p.in_ranking;
    const ok = await confirmBox(to ? '랭킹에 넣기' : '랭킹에서 빼기', [
      to ? `${sid}을(를) 랭킹(순위·상품)에 다시 넣을까요?` : `${sid}을(를) 랭킹에서 뺄까요? 게임은 그대로 할 수 있고, 순위·기수 점수·상품 대상에서만 빠져요.`,
      isGuest(sid) && to ? h('p.warn-txt', '선생님·손님 계정이에요. 보통은 랭킹에서 빼 둬요.') : null,
    ].filter(Boolean), { ok: to ? '넣기' : '빼기' });
    if (ok) act('admin_set_in_ranking', { p_student_id: sid, p_in: to }, to ? '랭킹에 넣었어요.' : '랭킹에서 뺐어요.');
  };
  const unlink = async () => {
    const ok = await confirmBox('기록까지 삭제', [
      h('p.warn-txt', `${sid} 계정을 지워요. 이 학번의 도감·티켓·진화의 돌·점수가 모두 사라지고 되돌릴 수 없어요.`),
      '폰을 잃어버린 경우에는 이걸 쓰지 말고, 새 폰에서 고유번호 + 비밀번호로 로그인하게 하세요.',
      '다른 사람이 이 학번을 잘못 가져갔을 때만 쓰세요. 삭제 후 진짜 학생이 다시 로그인하면 처음부터 시작해요.',
    ], { ok: '기록까지 삭제', danger: true, typeToConfirm: sid });
    if (ok) {
      try { await rpc('admin_unlink', { p_student_id: sid }); toast(`${sid} 기록을 삭제했어요.`); S.stuSel = null; await reload(); } catch (e) { fail(e); }
    }
  };
  const clearNick = async () => {
    const ok = await confirmBox('별명 지우기', [`${sid}의 별명 "${p.nickname}"을(를) 지울까요? 랭킹에는 원래 이름(또는 익명)으로 보여요.`], { ok: '지우기', danger: true });
    if (ok) act('admin_clear_nickname', { p_student_id: sid }, '별명을 지웠어요.');
  };
  const cancel = (t) => async () => {
    const ok = await confirmBox('티켓 취소', [`${S.qrById.get(t.qr_id)?.name || t.qr_id} 티켓(대기 중)을 취소할까요?`, '취소하면 그 QR이 다시 열려요.'], { ok: '티켓 취소', danger: true });
    if (ok) act('admin_cancel_ticket', { p_nonce: t.nonce }, '티켓을 취소했어요.');
  };

  const info = h('div.box.stack',
    h('h2', `${p.student_id} ${p.name || ''}`),
    isGuest(p.student_id) ? h('p.small-txt.muted', '비학생 계정이에요 (앱에서 만든 아이디, 또는 예전 로그인 코드 · 기수 없음).') : null,
    h('dl.kv',
      h('dt', '기수'), h('dd', p.gen ? `${p.gen}기` : '–'),
      h('dt', '역할'), h('dd', ROLE[p.role] || p.role),
      h('dt', '점수'), h('dd', `${p.score}점 · 도감 ${p.dex_count}`),
      h('dt', '진화의 돌'), h('dd', h('b', p.evo_tickets)),
      h('dt', '랭킹 포함'), h('dd', p.in_ranking === false ? chip('랭킹 제외', 'off') : chip('랭킹 포함', 'ok')),
      h('dt', '랭킹 공개'), h('dd', p.show_on_board ? '공개' : '익명'),
      h('dt', '별명'), h('dd', p.nickname ? h('b', p.nickname) : h('span.muted', '없음')),
      h('dt', '마지막 접속'), h('dd', p.last_seen ? `${fmtTime(p.last_seen)} (${timeAgo(p.last_seen)})` : '–'),
      h('dt', '가입'), h('dd', fmtTime(p.created_at))),
    h('div.row', h('b', '진화의 돌'), delta, h('button.btn.small', { onclick: adj(-1) }, '빼기 −'), h('button.btn.small.go', { onclick: adj(1) }, '더하기 +')),
    h('div.row', h('b', '역할'), roleSel, h('button.btn.small', { onclick: setRole }, '변경')),
    h('div.row', h('b', '랭킹'), h('button.btn.small', { onclick: toggleRanking }, p.in_ranking === false ? '랭킹에 넣기' : '랭킹에서 빼기'),
      h('span.small-txt.muted', '선생님·손님(g:) 계정은 처음부터 빠져 있어요.')),
    p.nickname && h('div.row', h('b', '별명'), h('button.btn.small', { onclick: clearNick }, '별명 지우기'),
      h('span.small-txt.muted', '나쁜 말 · 남을 흉내 낸 별명이면 지워요. 학생은 다시 정할 수 있어요.')));

  // move all game data to another login (lost phone, new Google login → STUDENT_ID_TAKEN, backup code …)
  const codeEmail = `${isGuest(sid) ? sid.slice(2) : sid}@code.local`;
  const email = h('input.inp', { type: 'email', placeholder: `예: ${codeEmail} 또는 학생 구글 이메일`, autocomplete: 'off', 'aria-label': '옮길 로그인 이메일' });
  const relinkBtn = h('button.btn.go', '옮기기');
  relinkBtn.onclick = async () => {
    const em = email.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(em)) { toast('이메일을 정확히 넣어 주세요.'); email.classList.add('bad'); return; }
    email.classList.remove('bad');
    const ok = await confirmBox('다른 로그인으로 옮기기', [
      `${sid}의 도감·티켓·진화의 돌·점수를 모두 ${em} 로그인으로 옮겨요.`,
      '옮긴 뒤에는 예전 로그인(잃어버린 폰 등)으로는 이 기록을 볼 수 없어요.',
      '학생은 새 로그인으로 앱을 다시 열면 기록이 그대로 보여요.',
    ], { ok: '옮기기' });
    if (!ok) return;
    busy(relinkBtn, async () => {
      const r = await rpc('admin_relink', { p_student_id: sid, p_email: em });
      toast(r?.note === 'already linked' ? '이미 그 로그인에 연결돼 있어요.' : `${sid} 기록을 ${em}(으)로 옮겼어요.`, 5000);
      await reload();
    });
  };
  const relinkBox = h('details.box.stack.rare',
    h('summary', h('b', '다른 로그인으로 옮기기'), h('span.small-txt.muted', ' — 거의 쓸 일 없음 (예전 구글 로그인 기록을 옮길 때만)')),
    h('p.small-txt', '고유번호 계정은 폰을 잃어버리거나 바꿔도 ', h('b', '새 폰에서 고유번호 + 비밀번호로 로그인'), '하면 기록이 그대로예요. 비밀번호를 잊었으면 [비밀번호 요청·문의]에서 허용해 주세요. 이 기능은 기록이 다른 로그인(예전 구글 계정 등)에 있을 때만 써요.'),
    h('ol.small-txt.steps',
      h('li', '새 로그인 계정을 준비해요: ',
        h('b', '구글'), ' — 학생이 새 폰에서 구글 로그인을 한 번 시도하게 하세요 ("이미 다른 계정에 연결돼 있어요"가 떠도 괜찮아요). ',
        h('b', '또는 코드'), ` — [임시 비밀번호 쪽지]에서 이 번호 쪽지를 만들면 ${codeEmail} 계정이 생겨요 (이미 있으면 비밀번호가 쪽지 코드로 바뀌어요).`),
      h('li', '그 이메일을 아래에 넣고 [옮기기]. 모든 게임 기록이 새 로그인으로 옮겨져요.'),
      h('li', '학생이 새 로그인으로 앱을 열면 끝! 예전 로그인은 이 학번과 끊겨요.')),
    h('div.row', h('div', { style: { flex: '1 1 220px' } }, email),
      h('button.btn.small', { type: 'button', onclick: () => { email.value = codeEmail; } }, '코드 계정 넣기'), relinkBtn),
    h('p.small-txt.muted', '오류 안내: "로그인한 적이 없어요" = 그 이메일 계정이 아직 없음 · "이미 게임 기록이 있어요" = 그 로그인으로 이미 따로 게임을 했음 (옮길 수 없어요).'));

  // dispute fix: give a monster directly
  const lineSel = lineSelect(S.lines.filter((l) => !l.withdrawn));
  const stageSel = h('select.inp', { style: { width: 'auto' }, 'aria-label': '단계' });
  const fillStages = () => {
    const l = S.lineById.get(Number(lineSel.value));
    stageSel.replaceChildren(...Array.from({ length: maxStage(l) }, (_, i) => h('option', { value: i + 1 }, `${i + 1}단계 · ${spOfLine(S.lineById.get(Number(lineSel.value))).find((x) => x.stage === i + 1)?.name || '?'}`)));
  };
  lineSel.addEventListener('change', fillStages);
  fillStages();
  const grantBtn = h('button.btn.go', '지급');
  grantBtn.onclick = async () => {
    const line = Number(lineSel.value), stage = Number(stageSel.value);
    if (!line) return;
    const dex = (spOfLine(S.lineById.get(line)).filter((x) => x.stage === stage)[0] || {}).id ?? (line - 1) * 3 + stage;   // 0052: 폼 계열
    const ok = await confirmBox('포켓몬 직접 지급', [
      `${sid}에게 ${S.spById.get(dex)?.name || `#${dex}`} (${lineName(line)}, ${stage}단계)을(를) 줄까요?`,
      '같은 포켓몬을 이미 가지고 있어도 박스에 새로 한 마리가 더 생겨요 (박스가 꽉 차면 안 돼요). 기록에 남아요.',
    ], { ok: '지급' });
    if (!ok) return;
    busy(grantBtn, async () => {
      await rpc('admin_grant_monster', { p_student_id: sid, p_line: line, p_stage: stage });
      toast('포켓몬을 지급했어요.');
      await reload();
    });
  };
  const grantBox = h('div.box.stack',
    h('h3', '포켓몬 직접 지급 (분쟁 해결용)'),
    h('p.small-txt.muted', '부스 오류 등으로 포켓몬을 못 받았을 때만 쓰세요.'),
    h('div.row', h('div', { style: { flex: '1 1 220px' } }, lineSel), stageSel, grantBtn));

  const dangerBox = h('div.box.stack',
    h('h3', '기록까지 삭제'),
    h('p.small-txt.muted', '다른 사람이 이 학번을 잘못 가져갔을 때만. 폰 분실은 새 폰에서 고유번호 + 비밀번호로 로그인하면 돼요.'),
    h('div.row', h('button.btn.small.danger', { onclick: unlink }, '계정 연결 해제 (기록까지 삭제)…')));

  const tBox = h('div.box',
    h('h3', `티켓 (최근 ${tickets.length})`),
    tickets.length ? h('div.tbl-wrap.scroll-y', h('table.tbl',
      h('thead', h('tr', h('th', 'QR'), h('th', '상태'), h('th', '찍은 시각'), h('th', '결과'), h('th', ''))),
      h('tbody', tickets.map((t) => {
        const [label, cls] = TSTATUS[t.status] || [t.status, ''];
        return h('tr',
          h('td', h('span.mono', t.qr_id), ' ', S.qrById.get(t.qr_id)?.name || ''),
          h('td', chip(label, cls)),
          h('td', fmtTime(t.created_at)),
          h('td', t.result_species ? (S.spById.get(t.result_species)?.name || `#${t.result_species}`) : '–'),
          h('td', t.status === 'pending' ? h('button.btn.small', { onclick: cancel(t) }, '취소') : null));
      })))) : h('p.muted', '티켓이 없어요.'));

  // 0036: collection 한 줄 = 한 마리 → 계열마다 묶어서 (가장 높은 단계 · 잡은 횟수 합 · 지금 박스에 있는 수)
  const byLine = [...coll.reduce((mp, c) => {
    const g = mp.get(c.line_id) || { line_id: c.line_id, stage: 0, catch_count: 0, now: 0, maxlv: 0, evo_fails: 0 };
    if (c.stage > g.stage) g.sp = c.species_id;   // 0037: 갈래 종이면 그 종
    g.stage = Math.max(g.stage, c.stage); g.catch_count += c.catch_count || 0;
    if (!c.released_at) { g.now++; g.maxlv = Math.max(g.maxlv, c.level || 0); g.evo_fails = Math.max(g.evo_fails, c.evo_fails || 0); }
    return mp.set(c.line_id, g);
  }, new Map()).values()];
  const inBox = coll.filter((c) => !c.released_at).length;
  const cBox = h('div.box',
    h('h3', `도감 (${byLine.length}계열 · 박스 ${inBox}마리)`),
    byLine.length ? h('div.coll-grid', byLine.map((c) => {
      const dex = c.sp || (c.line_id - 1) * 3 + c.stage;
      return h('div', sprite(dex, 64), h('div', h('b', S.spById.get(dex)?.name || `#${dex}`)),
        h('div', `${c.stage}단계 · ${c.catch_count}회`), h('div.muted', c.now ? `박스 ${c.now}마리 · 최고 Lv.${c.maxlv}` : '놓아줌 (도감만 남음)'),
        c.evo_fails ? h('div.muted', `진화 실패 ${c.evo_fails}`) : null);
    })) : h('p.muted', '아직 잡은 포켓몬이 없어요.'));

  const eBox = h('div.box',
    h('h3', `최근 기록 (${events.length})`),
    events.length ? h('div.tbl-wrap.scroll-y', h('table.tbl.events',
      h('thead', h('tr', h('th', '시각'), h('th', '종류'), h('th', '내용'))),
      h('tbody', events.map((e) => h('tr',
        h('td', { style: { whiteSpace: 'nowrap' } }, fmtTime(e.at)),
        h('td', chip(EVENT_KIND[e.kind] || e.kind, e.kind === 'admin' ? 'warn' : '')),
        h('td.small-txt', eventText(e))))))) : h('p.muted', '기록이 없어요.'));

  // 가방 물건 주기 · 레벨 정하기 (0020)
  const itemSel = h('select.inp', { 'aria-label': '물건' }, h('option', { value: '' }, '물건 불러오는 중…'));
  sb.from('items').select('key,name,pocket').order('sort').then(({ data }) => {
    itemSel.replaceChildren(...(data || []).map((x) => h('option', { value: x.key }, `${x.name} (${{ hold: '지닌 물건', med: '회복약', tool: '도구', tm: '기술머신', key: '소중한 물건' }[x.pocket] || x.pocket})`)));
  });
  const itemQty = h('input.inp', { type: 'number', min: 1, max: 99, value: 1, style: { width: '72px' }, 'aria-label': '개수' });
  const itemBtn = h('button.btn.go', '주기');
  itemBtn.onclick = () => busy(itemBtn, async () => {
    const r = await rpc('admin_give_item', { p_student_id: sid, p_item: itemSel.value, p_qty: Number(itemQty.value) });
    toast(`물건을 줬어요. (이제 ${r.qty}개)`);
  });
  const lvLine = lineSelect(S.lines.filter((l) => !l.withdrawn));
  const lvInp = h('input.inp', { type: 'number', min: 1, max: 100, value: 50, style: { width: '72px' }, 'aria-label': '레벨' });
  const lvBtn = h('button.btn', '레벨 정하기');
  lvBtn.onclick = () => busy(lvBtn, async () => {
    const r = await rpc('admin_set_level', { p_student_id: sid, p_line: Number(lvLine.value), p_level: Number(lvInp.value) });
    toast(`레벨을 바꿨어요. (그 계열 ${r?.mons ?? 1}마리 모두)`);
  });
  const growBox = h('div.box.stack',
    h('h3', '가방 물건 주기 · 레벨 정하기'),
    h('p.small-txt.muted', '이벤트 상품이나 오류 보상용. 학생 앱에서 가방을 열면 바로 보여요.'),
    h('div.row', h('div', { style: { flex: '1 1 220px' } }, itemSel), itemQty, itemBtn),
    h('div.row', h('div', { style: { flex: '1 1 220px' } }, lvLine), lvInp, lvBtn));

  // 알 주기 · 반 고치기 (0027)
  const eggTier = h('select.inp', { 'aria-label': '알 종류' }, [['green', '초록 점박이 알'], ['yellow', '노랑 점박이 알'], ['purple', '보라 점박이 알']]
    .map(([v, t]) => h('option', { value: v }, t)));
  const eggN = h('input.inp', { type: 'number', min: 1, max: 20, value: 1, style: { width: '72px' }, 'aria-label': '개수' });
  const eggBtn = h('button.btn.go', '알 주기');
  eggBtn.onclick = () => busy(eggBtn, async () => {
    const r = await rpc('admin_give_egg', { p_student_id: sid, p_tier: eggTier.value, p_n: Number(eggN.value) });
    toast(r.given ? `알 ${r.given}개를 줬어요. (알 주머니가 꽉 차면 덜 들어가요)` : '알 주머니가 꽉 차서 못 줬어요 (9개).');
  });
  const isStu = /^\d{6}$/.test(p.student_id || '') && p.role === 'student';
  // 반 = 글자 이름 (0030: 1A · 10B · 3 …, 숫자·영어 대문자·한글 1~4자)
  const curClass = p.class_name ?? (p.class_no != null ? String(p.class_no) : '');
  const grSel = h('select.inp', { 'aria-label': '학년', style: { width: '110px' } }, h('option', { value: '' }, '학년 없음'), [1, 2, 3].map((n) => h('option', { value: n, selected: p.grade === n }, `${n}학년`)));
  const clIn = h('input.inp', { value: curClass, maxlength: 4, placeholder: '예: 1A', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', 'aria-label': '반 이름', style: { width: '110px' } });
  const CLASS_CHIPS = ['1A', '1B', '2', '3', '4', '5', '6', '7', '8', '9', '10A', '10B'];
  const clChips = h('div.chips', CLASS_CHIPS.map((c) => h('button.btn.small', { type: 'button', onclick: () => { clIn.value = c; clIn.classList.remove('bad'); } }, c)));
  const clNow = h('span.small-txt.muted', curClass ? `지금: ${p.grade ?? '?'}학년 ${curClass}반` : '지금: 반 없음');
  const clBtn = h('button.btn', '반 저장');
  clBtn.onclick = () => {
    const g = grSel.value ? Number(grSel.value) : null;
    const c = clIn.value.trim().toUpperCase() || null;
    if ((g == null) !== (c == null)) { toast('학년과 반을 둘 다 넣거나, 둘 다 비워 주세요.'); return; }
    if (c && !/^[0-9A-Z가-힣]{1,4}$/.test(c)) { clIn.classList.add('bad'); toast('반 이름은 숫자·영어 대문자·한글 1~4글자예요 (예: 1A, 10B, 3).'); return; }
    clIn.classList.remove('bad');
    busy(clBtn, async () => {
      await rpc('admin_set_class', { p_student_id: sid, p_grade: g, p_class: c });
      clIn.value = c || '';
      clNow.textContent = c ? `지금: ${g}학년 ${c}반` : '지금: 반 없음';
      toast(g ? `${g}학년 ${c}반으로 고쳤어요.` : '반을 지웠어요.');
    });
  };
  const eggBox = h('div.box.stack',
    h('h3', '알 주기 · 반 고치기'),
    h('p.small-txt.muted', '알은 학생 가방 → 알에 들어가요 (알 주머니가 꽉 차면 덜 들어가요). 반은 학생 계정만 (반별 랭킹용, 학생이 잘못 골랐을 때).'),
    h('div.row', h('div', { style: { flex: '1 1 220px' } }, eggTier), eggN, eggBtn),
    isStu ? h('div.stack',
      h('div.row', grSel, clIn, clBtn, clNow),
      h('div.small-txt.muted', '빠르게 고르기:'), clChips)
      : h('small.muted', '비학생 계정은 반이 없어요.'));

  return [info, grantBox, growBox, eggBox, tBox, cBox, eBox, relinkBox, dangerBox];
}

const EVENT_KIND = { quiz: '퀴즈', evolve: '진화', redeem: '부스 지급', admin: '운영자', release: '놓아주기' };
function eventText(e) {
  const d = e.data || {};
  if (e.kind === 'quiz') return d.correct ? '정답' : '오답';
  if (e.kind === 'evolve') return `${lineName(d.line)} 진화 ${d.success ? '성공' : '실패'} (지금 ${d.stage}단계)`;
  if (e.kind === 'redeem') return `포켓몬 ${d.n ?? '?'}건 처리`;
  if (e.kind === 'release') return `${lineName(d.line)} ${d.stage}단계 Lv.${d.level} 놓아줌${d.held ? ' (지닌 물건은 가방으로)' : ''}`;
  return JSON.stringify(d);
}

// ───────────────────────── 최종 랭킹 (상품용 · 실명) ─────────────────────────

function rankingSection() {
  const body = h('div.stack');
  const det = h('details.box.create',
    h('summary', '최종 랭킹 (상품용 · 실명) — 열면 불러와요'),
    body);
  const load = async () => {
    body.replaceChildren(h('p.loading', '불러오는 중…'));
    try {
      const rows = (await rpc('admin_export_ranking')) || [];
      const ranked = rows.filter((r) => r.rank != null);
      const cut = ranked[Math.min(29, ranked.length - 1)]?.rank;
      const top = ranked.filter((r) => r.rank <= cut);               // top 30 (+ anyone tied with 30th)
      body.replaceChildren(
        h('div.row',
          h('span', `랭킹 대상 ${ranked.length}명 · 전체 학생 ${rows.length}명`),
          h('span', { style: { flex: 1 } }),
          h('button.btn.small', { onclick: load }, '새로 고침'),
          h('button.btn.small.go', { onclick: () => downloadRankingCsv(rows) }, 'CSV 다운로드')),
        h('p.notice', '동점은 먼저 도달한 사람이 위(score_at). ', h('b', '실명이 보여요'), ' — 화면 공유·대형 화면에 띄우지 마세요. CSV에는 랭킹 제외(선생님·손님 등)와 0점 학생도 들어 있어요.'),
        top.length ? h('div.tbl-wrap.scroll-y', h('table.tbl',
          h('thead', h('tr', h('th.num', '순위'), h('th', '학번'), h('th', '이름'), h('th.num', '기수'), h('th.num', '점수'),
            h('th.num', '도감'), h('th.num', '최종 진화'), h('th.num', '희귀'), h('th.num', '포획'), h('th', '점수 도달'))),
          h('tbody', top.map((r) => h('tr',
            h('td.num', h('b', r.rank)), h('td.mono', r.student_id), h('td', r.name || '–'), h('td.num', r.gen ?? '–'),
            h('td.num', h('b', r.score)), h('td.num', r.dex), h('td.num', r.final_lines), h('td.num', r.rare), h('td.num', r.catches),
            h('td', { style: { whiteSpace: 'nowrap' } }, r.score_at ? fmtSec(r.score_at) : '–')))))) : h('p.muted', '아직 점수가 있는 학생이 없어요.'));
    } catch (e) { body.replaceChildren(h('p.warn-txt', msgOf(e)), h('button.btn.small', { onclick: load }, '다시 시도')); }
  };
  det.addEventListener('toggle', () => { if (det.open) load(); });
  return det;
}
const fmtSec = (iso) => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

function downloadRankingCsv(rows) {
  const yes = (v) => (v ? 'O' : 'X');
  downloadCsv(`final_ranking_${toLocalInput(new Date().toISOString()).replace(/[-:]/g, '').replace('T', '_')}.csv`,
    [['순위', '학번', '이름', '기수', '점수', '점수 도달 시각', '도감 수', '최종 진화 계열', '희귀·전설 계열', '총 포획', '랭킹 포함', '랭킹 공개'],
      ...rows.map((r) => [r.rank ?? '', r.student_id, r.name || '', r.gen ?? '', r.score, r.score_at ? fmtSec(r.score_at) : '',
        r.dex, r.final_lines, r.rare, r.catches, yes(r.in_ranking), yes(r.show_on_board)])]);
}

// UTF-8 BOM CSV so Excel (Korean Windows) opens it correctly
function downloadCsv(filename, table) {
  const q = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = '﻿' + table.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ───────────────────────── 6. 임시 비밀번호 쪽지 (옛 이름: 로그인 코드) ─────────────────────────
// admin_make_login_codes: <id>@code.local 계정의 비밀번호를 인쇄용 코드로 정함.
// 0011 부터 고유번호 계정 = <번호>@code.local 이라서, 이미 가입한 번호에 만들면 그 학생 비밀번호가 쪽지 코드로 바뀐다 (= 운영자 초기화).
// 선생님·손님 아이디(영문) 쪽지는 지금 앱에 로그인할 곳이 없어서 (비학생은 @id.local) 만들지 않는다.

function normCodeId(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return /^[0-9]{5,6}$/.test(v) ? v.padStart(6, '0') : null;   // 0031: 숫자 고유번호만 (서버도 글자 아이디는 건너뜀)
}
const isStudentCodeId = (id) => /^[0-9]{6}$/.test(id);
const codeProfileId = (id) => (isStudentCodeId(id) ? id : 'g:' + id);

// "아이디,이름" per line (comma or tab, so a spreadsheet paste works). → { items, bad }
function parseCodeList(text) {
  const items = [], bad = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const [rawId, ...rest] = line.split(/[,\t]/);
    const id = normCodeId(rawId);
    if (!id) {
      if (!(i === 0 && /아이디|학번|id/i.test(rawId))) bad.push(`${i + 1}줄: ${line.trim()}`);   // a header row is skipped quietly
      return;
    }
    if (!isStudentCodeId(id)) { bad.push(`${i + 1}줄: ${rawId.trim()} (선생님·손님 아이디는 안 돼요)`); return; }
    items.push({ id, name: rest.join(',').trim().slice(0, 40) });
  });
  return { items, bad };
}

async function tabCodes() {
  const out = h('div');
  const drawResult = () => out.replaceChildren(...codeResult(drawResult).filter(Boolean));
  drawResult();

  // (a) range generator
  const from = h('input.inp.mono', { inputmode: 'numeric', placeholder: '예: 022001', maxlength: 6, autocomplete: 'off' });
  const to = h('input.inp.mono', { inputmode: 'numeric', placeholder: '예: 022040', maxlength: 6, autocomplete: 'off' });
  const rangeBtn = h('button.btn.go', { type: 'submit' }, '범위로 코드 만들기');
  const rangeForm = h('form.box.stack.no-print', {
    onsubmit: (e) => {
      e.preventDefault();
      const a = normCodeId(from.value), b = normCodeId(to.value);
      const okA = !!a && isStudentCodeId(a), okB = !!b && isStudentCodeId(b);
      from.classList.toggle('bad', !okA);
      to.classList.toggle('bad', !okB);
      if (!okA || !okB) { toast('시작·끝 학번은 5~6자리 숫자예요.'); return; }
      const n0 = Number(a), n1 = Number(b);
      if (n1 < n0) { toast('끝 학번이 시작 학번보다 작아요.'); to.classList.add('bad'); return; }
      if (n1 - n0 + 1 > 1000) { toast('한 번에 1000명까지만 만들 수 있어요. 범위를 나눠 주세요.'); return; }
      const items = [];
      for (let n = n0; n <= n1; n++) items.push({ id: String(n).padStart(6, '0'), name: '' });
      busy(rangeBtn, () => makeCodes(items, drawResult));
    },
  },
  h('h2', '(가) 학번 범위로 만들기'),
  h('p.small-txt.muted', '한 반·한 기수를 한꺼번에 만들 때 써요. 이름 칸은 비어 있어요.'),
  h('div.fields', field('시작 학번', from), field('끝 학번 (포함)', to)),
  h('div.row.end', rangeBtn));

  // (b) pasted list
  const ta = h('textarea.inp.mono', { rows: 8, spellcheck: 'false', placeholder: '022001,김하프\n022002,이외대' });
  const preview = h('p.small-txt');
  const showPreview = () => {
    const { items, bad } = parseCodeList(ta.value);
    const guests = items.filter((x) => !isStudentCodeId(x.id)).length;
    preview.replaceChildren(
      `${items.length}명 인식`, guests ? ` (선생님·손님 ${guests}명)` : '',
      bad.length ? h('span.warn-txt', ` · 형식 오류 ${bad.length}줄 — 빼고 만들어요: ${bad.slice(0, 5).join(' / ')}${bad.length > 5 ? ' …' : ''}`) : '');
  };
  ta.addEventListener('input', showPreview);
  showPreview();
  const listBtn = h('button.btn.go', { type: 'submit' }, '목록으로 코드 만들기');
  const listForm = h('form.box.stack.no-print', {
    onsubmit: (e) => {
      e.preventDefault();
      const { items } = parseCodeList(ta.value);
      if (!items.length) { toast('만들 아이디가 없어요. "아이디,이름" 형식으로 한 줄에 한 명씩 넣어 주세요.'); ta.classList.add('bad'); return; }
      ta.classList.remove('bad');
      busy(listBtn, () => makeCodes(items, drawResult));
    },
  },
  h('h2', '(나) 목록 붙여넣기'),
  h('p.small-txt.muted', '한 줄에 한 명: 고유번호,이름 (엑셀에서 두 칸을 복사해 붙여도 돼요). 고유번호 = 5~6자리 숫자.'),
  field('아이디,이름', ta), preview,
  h('div.row.end', listBtn));

  const help = h('div.box.stack.no-print',
    h('h2', '임시 비밀번호 쪽지 (옛 이름: 로그인 코드)'),
    h('p', '학생은 보통 ', h('b', '고유번호 + 자기가 정한 비밀번호'), '로 로그인해요. 이 화면은 그 비밀번호 대신 쓸 ', h('b', '8글자 코드'), '를 만들어 쪽지로 인쇄해요.'),
    h('ul.small-txt',
      h('li', '쓰는 법: 앱 로그인 화면 → "학생 · 고유번호로 로그인" → 고유번호 + 쪽지 코드를 비밀번호 칸에. 로그인한 뒤 ⚙ 설정 → "비밀번호 바꾸기"로 바꾸게 하세요.'),
      h('li.warn-txt', '이미 가입한 번호에 만들면 그 학생이 정한 비밀번호가 쪽지 코드로 바뀌어요 (예전 비밀번호는 더 이상 안 돼요). 본인 확인을 한 뒤에만!'),
      h('li', '비밀번호를 잊은 학생 한 명이면 보통 [비밀번호 요청·문의]에서 허용하는 게 더 쉬워요. 쪽지는 한 반을 미리 만들어 나눠 줄 때나 급할 때 써요.'),
      h('li', h('b', '코드는 만든 직후 이 화면에서 딱 한 번만 보여요.'), ' 바로 인쇄하거나 CSV로 저장하세요.'),
      h('li', '같은 번호로 다시 만들면 코드가 바뀌고, 예전 쪽지는 바로 못 써요 (잃어버린 쪽지를 무효로 만들 때).'),
      h('li', '선생님·손님은 쪽지가 필요 없어요: 앱의 "비학생 · 아이디로 로그인"에서 스스로 아이디를 만들어요. 운영진은 [운영진] 탭에서 아이디를 만들어 주세요.'),
      h('li', `서버에는 한 번에 최대 ${CODE_BATCH}명씩 보내요 (더 많으면 자동으로 나눠서 보내요).`)));

  return [help, h('div.cols', rangeForm, listForm), out];
}

async function makeCodes(items, drawResult) {
  const seen = new Map();
  for (const it of items) if (!seen.has(it.id)) seen.set(it.id, it);
  const list = [...seen.values()];
  const guests = list.filter((x) => !isStudentCodeId(x.id));
  const sample = list.slice(0, 6).map((x) => x.id).join(', ') + (list.length > 6 ? ' …' : '');
  if (S.codes && !S.codesSaved) {
    const again = await confirmBox('아직 저장 안 한 코드가 있어요', ['지금 보이는 코드를 인쇄하거나 CSV로 저장하지 않았어요. 새로 만들면 지금 코드는 화면에서 사라져요 (다시 볼 수 없어요).'], { ok: '그래도 새로 만들기', danger: true });
    if (!again) return;
  }
  // 이미 게임을 하는 번호 = 그 학생 비밀번호가 바뀜 → 숫자로 알려 줌
  let joined = [];
  try {
    for (let i = 0; i < list.length; i += 300) {
      const part = list.slice(i, i + 300).map((x) => codeProfileId(x.id));
      joined.push(...(await tq(sb.from('profiles').select('student_id').in('student_id', part))).map((r) => r.student_id));
    }
  } catch { joined = null; }
  const ok = await confirmBox(`임시 비밀번호 쪽지 ${list.length}명 만들기`, [
    `고유번호: ${sample}`,
    guests.length ? `이 중 ${guests.length}명은 선생님·손님 계정(g:…, 기수 없음)이 돼요.` : null,
    joined == null ? h('p.warn-txt', '이미 가입한 학생이 있는지 확인하지 못했어요. 가입한 번호는 비밀번호가 쪽지 코드로 바뀌어요.')
      : joined.length ? h('p.warn-txt', `이 중 ${joined.length}명은 이미 게임을 하고 있어요 (${joined.slice(0, 8).join(', ')}${joined.length > 8 ? ' …' : ''}). 그 학생들이 정한 비밀번호가 쪽지 코드로 바뀌어요!`)
        : h('p.small-txt', '모두 아직 가입하지 않은 번호예요.'),
    h('p.warn-txt', '이미 쪽지가 있던 번호는 새 코드로 바뀌고, 예전 쪽지는 바로 못 써요.'),
    '만든 코드는 지금 한 번만 보여요. 바로 인쇄하거나 CSV로 저장하세요.',
  ].filter(Boolean), { ok: '만들기' });
  if (!ok) return;

  const rows = [];
  try {
    for (let i = 0; i < list.length; i += CODE_BATCH) {
      const part = list.slice(i, i + CODE_BATCH);
      const r = await rpc('admin_make_login_codes', { p_ids: part.map((x) => x.id), p_names: part.map((x) => x.name) });
      rows.push(...(r || []));
      if (list.length > CODE_BATCH) toast(`${Math.min(i + CODE_BATCH, list.length)}/${list.length}명 만듦…`);
    }
  } finally {
    // codes already issued (even if a later batch failed) must still be shown — they are never shown again
    if (rows.length) {
      S.codes = { at: new Date().toISOString(), rows };
      S.codesSaved = false;
      drawResult();
    }
  }
  const skipped = list.length - rows.length;
  toast(`임시 비밀번호 쪽지 ${rows.length}개를 만들었어요.${skipped ? ` (${skipped}개는 형식이 맞지 않아 건너뜀)` : ''} 지금 인쇄하거나 CSV로 저장하세요!`, 6000);
}

function codeResult(drawResult) {
  if (!S.codes) return [];
  const { rows, at } = S.codes;
  const print = () => { S.codesSaved = true; window.print(); };
  const clear = async () => {
    if (!S.codesSaved && !(await confirmBox('코드 화면 지우기', ['아직 인쇄하거나 저장하지 않았어요. 지우면 이 코드들을 다시 볼 수 없어요 (다시 만들면 코드가 바뀌어요).'], { ok: '지우기', danger: true }))) return;
    S.codes = null; S.codesSaved = true; drawResult();
  };
  const bar = h('div.box.stack.no-print',
    h('div.row', h('h2', `만든 임시 비밀번호 쪽지 (${rows.length}명)`), h('span', { style: { flex: 1 } }),
      h('button.btn.go', { onclick: print }, '🖨 쪽지 인쇄'),
      h('button.btn', { onclick: () => { downloadCodesCsv(rows, at); S.codesSaved = true; } }, 'CSV 저장'),
      h('button.btn.small', { onclick: clear }, '화면에서 지우기')),
    h('p.notice.red', h('b', '이 코드는 지금 한 번만 보여요. '), '페이지를 닫거나 새로 고치기 전에 인쇄하거나 CSV로 저장하세요.'),
    h('p.small-txt.muted', `${fmtTime(at)}에 만듦 · 한 줄에 3장씩 인쇄돼요. 점선을 따라 잘라서 나눠 주세요.`));
  const slips = h('div.slip-grid', rows.map((r) => {
    const guest = !isStudentCodeId(r.id);
    return h('div.slip',
      h('div.slip-title', `${CONFIG.GAME_TITLE} 임시 비밀번호`),
      h('div.slip-who', h('span.slip-id.mono', guest ? r.id.toUpperCase() : r.id), r.name ? h('span.slip-name', r.name) : null),
      h('div.slip-code.mono', r.code),
      h('div.slip-help', "앱 로그인 → '학생 · 고유번호로 로그인' → 고유번호 + 이 코드(비밀번호). 들어간 뒤 ⚙에서 비밀번호를 바꾸세요"),
      h('div.slip-note', guest ? `선생님·손님 계정 (${codeProfileId(r.id)}) · 다시 발급하면 이 코드는 못 써요` : '다시 발급하면 이 코드는 못 써요 · 남에게 보여 주지 마세요'));
  }));
  return [bar, slips];
}

function downloadCodesCsv(rows, at) {
  downloadCsv(`login_codes_${toLocalInput(at).replace(/[-:]/g, '').replace('T', '_')}.csv`,
    [['아이디', '이름', '코드', '프로필'], ...rows.map((r) => [r.id, r.name || '', r.code, codeProfileId(r.id)])]);
}

window.addEventListener('beforeunload', (e) => {
  if (S.codes && !S.codesSaved) { e.preventDefault(); e.returnValue = ''; }
});

// ───────────────────────── 7. 설정 ─────────────────────────

// 운영진: 구글 이메일로 운영자·부스 스태프 초대 / 해제 (0009). 목록 = settings.admin_emails / booth_emails
async function tabStaff() {
  const ROLE = { admin: '운영자', booth: '부스 스태프' };
  const list = h('div');
  const draw = (rows) => list.replaceChildren(rows.length ? h('div.tbl-wrap', h('table.tbl',
    h('thead', h('tr', h('th', '구글 이메일'), h('th', '역할'), h('th', '상태'), h('th', ''))),
    h('tbody', rows.map((r) => {
      const del = h('button.btn.small.danger', { disabled: r.me, title: r.me ? '내 계정은 다른 운영자만 바꿀 수 있어요' : '' }, '해제');
      del.onclick = () => {
        if (!confirm(`${r.email} 의 ${ROLE[r.role]} 권한을 해제할까요?`)) return;
        busy(del, async () => { draw(await rpc('admin_remove_staff', { p_email: r.email })); toast('해제했어요.'); });
      };
      return h('tr',
        h('td.mono', r.email, r.me ? h('span.small-txt.muted', ' (나)') : null),
        h('td', chip(ROLE[r.role] || r.role, r.role === 'admin' ? 'hot' : 'blue')),
        h('td', r.joined ? chip('로그인함', 'ok') : chip('아직 로그인 전', 'off')),
        h('td', del));
    })))) : h('p.muted', '아직 아무도 없어요.'));
  draw(await rpc('admin_list_staff'));

  const email = h('input.inp', { type: 'email', placeholder: '예: teacher@gmail.com', autocomplete: 'off', required: true });
  const role = h('select.inp', h('option', { value: 'admin' }, '운영자 (이 페이지 전체)'), h('option', { value: 'booth' }, '부스 스태프 (부스·TV 화면)'));
  const add = h('button.btn.go', { type: 'submit' }, '초대하기');
  const form = h('form.box.stack', {
    onsubmit: (e) => {
      e.preventDefault();
      busy(add, async () => {
        draw(await rpc('admin_invite_staff', { p_email: email.value, p_role: role.value }));
        toast(`${email.value.trim()} 를 ${ROLE[role.value]}(으)로 추가했어요.`);
        email.value = '';
      });
    },
  },
    h('h2', '구글 이메일로 운영진 등록'),
    h('p.small-txt', '그 사람의 ', h('b', '구글 계정 이메일'), '을 적으면 끝이에요. 그 계정으로 이 사이트에 구글 로그인하면 바로 권한이 생겨요. 이미 로그인한 적이 있으면 지금 바로 바뀌어요.'),
    h('div.row', email, role, add),
    h('p.small-txt.muted', '구글 계정이 있는 운영진만 이 방법을 써요. 구글이 없으면 위의 운영진 아이디를 만들어 주세요. 내 권한은 다른 운영자만 바꿀 수 있어요.'));

  const site = new URL('.', location.href).href.replace(/\/$/, '');
  const links = h('div.box.stack',
    h('h2', '운영 화면 주소'),
    h('p.small-txt', '운영진에게 이 주소를 보내 주세요.'),
    ...[['admin', '운영자 페이지'], ['booth', '부스 화면 (태블릿·노트북)'], ['screen', 'TV 대형 화면']].map(([p, t]) => {
      const url = `${site}/${p}.html`;
      // 긴 주소: / . - 뒤에서만 줄을 바꿈 (<wbr>) — 좁은 폰에서 단어 가운데가 잘리지 않게. [복사] 로 통째로
      const parts = url.split(/(?<=[/.-])/).flatMap((x, i) => (i ? [h('wbr'), x] : [x]));
      const copy = h('button.btn.small', { type: 'button', 'aria-label': `${t} 주소 복사` }, '복사');
      copy.onclick = async () => {
        try { await navigator.clipboard.writeText(url); toast('주소를 복사했어요.'); } catch { toast('복사하지 못했어요. 주소를 길게 눌러 복사해 주세요.'); }
      };
      return h('div.url-item', h('b', t), h('div.url-row', h('a.mono.url', { href: url, target: '_blank', rel: 'noopener' }, ...parts), copy));
    }));

  // ── 운영진 아이디 (0018): 운영자가 만들고, 비밀번호는 한 번만 보여 준다 ──
  const ids = h('div');
  const showPw = (title, r) => modal(title, h('div.stack',
    h('p', '아래 아이디와 비밀번호를 그 사람에게 전해 주세요. ', h('b', '비밀번호는 지금만 보여요'), ' (잊으면 [비밀번호 새로 만들기]).'),
    h('div.box.mono', { style: { fontSize: '20px' } }, `아이디: ${r.id}`, h('br'), `비밀번호: ${r.password}`),
    h('p.small-txt.muted', '앱·운영자 페이지·부스·TV 화면 어디서든 "아이디로 로그인"에 넣으면 돼요.')), [{ label: '확인', value: true, cls: 'go' }]);
  const drawIds = (rows) => ids.replaceChildren(rows.length ? h('div.tbl-wrap', h('table.tbl',
    h('thead', h('tr', h('th', '아이디'), h('th', '이름'), h('th', '역할'), h('th', '마지막 로그인'), h('th', ''))),
    h('tbody', rows.map((r) => {
      const reset = h('button.btn.small', '비밀번호 새로 만들기');
      reset.onclick = () => busy(reset, async () => {
        if (!(await confirmBox('비밀번호 새로 만들기', [`${r.id} 의 비밀번호를 새로 만들까요? 지금 로그인된 기기는 모두 로그아웃돼요.`], { ok: '새로 만들기' }))) return;
        showPw('새 비밀번호', await rpc('admin_reset_staff_password', { p_id: r.id }));
      });
      const del = h('button.btn.small.danger', { disabled: r.me, title: r.me ? '지금 로그인한 내 계정은 지울 수 없어요' : '' }, '삭제');
      del.onclick = () => busy(del, async () => {
        if (!(await confirmBox('운영진 아이디 삭제', [`${r.id} 아이디를 지울까요? 이 아이디로는 더 이상 로그인할 수 없어요.`], { ok: '삭제', danger: true }))) return;
        await rpc('admin_remove_staff_login', { p_id: r.id });
        drawIds(await rpc('admin_list_staff_logins')); toast('지웠어요.');
      });
      return h('tr', h('td.mono', r.id, r.me ? h('span.small-txt.muted', ' (나)') : null), h('td', r.name),
        h('td', chip(ROLE[r.role] || r.role, r.role === 'admin' ? 'hot' : 'blue')),
        h('td', r.last ? new Date(r.last).toLocaleString('ko-KR') : '–'), h('td', reset, ' ', del));
    })))) : h('p.muted', '아직 운영진 아이디가 없어요.'));
  drawIds(await rpc('admin_list_staff_logins'));
  const nid = h('input.inp', { placeholder: '아이디 (영문으로 시작, 4~16자)', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', required: true });
  const nname = h('input.inp', { placeholder: '이름 (예: 김선생님)', maxlength: 20 });
  const nrole = h('select.inp', h('option', { value: 'booth' }, '부스 스태프 (부스·TV 화면)'), h('option', { value: 'admin' }, '운영자 (이 페이지 전체)'));
  const make = h('button.btn.go', { type: 'submit' }, '아이디 만들기');
  const idMake = h('form.box.stack', {
    onsubmit: (e) => {
      e.preventDefault();
      busy(make, async () => {
        const r = await rpc('admin_create_staff_login', { p_id: nid.value, p_role: nrole.value, p_name: nname.value });
        nid.value = ''; nname.value = '';
        drawIds(await rpc('admin_list_staff_logins'));
        await showPw('운영진 아이디를 만들었어요', r);
      });
    },
  },
    h('h2', '운영진 아이디 만들기'),
    h('p.small-txt', '구글 계정이 없어도 돼요. 아이디를 정하면 서버가 12자리 비밀번호를 만들어 줘요. 학생이 스스로 만든 아이디는 운영진이 될 수 없어요.'),
    h('div.row', nid, nname, nrole, make));

  return [h('div.cols', idMake, links), h('div.box.stack', h('h2', '운영진 아이디'), ids),
    h('div.cols', form, h('div.box.stack', h('h2', '구글로 등록된 운영진'), list))];
}

// 미니게임 (0023·0025): 관리 방법 안내 · 열리는 포켓몬 수 · 게임 켜고 끄기 · 게임별 기록 (부정 기록 지우기) · 랭킹 초기화
const MG = [['surf', '포켓몬 서핑'], ['dodge', '폭탄 피하기'], ['maze', '자이로 미로 (랭킹 모드)'], ['land', '땅따먹기'], ['cross', '포켓몬 등굣길']];
const mgFmt = (id, v) => (id === 'maze' ? `${(v / 1000).toFixed(2)}초` : id === 'land' ? `${(v / 10).toFixed(1)}%` : `${Number(v).toLocaleString()}${id === 'surf' ? 'm' : id === 'cross' ? '칸' : '점'}`);
async function tabMg() {
  let ov = await rpc('admin_minigame_overview');
  let game = S.mgGame || 'surf';

  const help = h('details.box', { open: true },
    h('summary', h('b', '미니게임 관리 방법 (처음이면 읽어 주세요)')),
    h('ul.small-txt',
      h('li', '학생 앱 홈의 "미니게임" 버튼은 포켓몬을 아래 숫자만큼 모은 학생에게만 열려요. 축제 첫날엔 낮게, 나중엔 그대로 두면 돼요.'),
      h('li', '게임을 끄면 학생 앱에 "지금은 쉬는 중이에요"로 보이고, 서버도 그 게임 기록을 받지 않아요 (문제가 생긴 게임만 잠깐 끌 때).'),
      h('li', '랭킹은 게임마다 따로예요 (전체 점수 랭킹에는 안 들어가요). 한 사람의 가장 좋은 기록만 줄 세워요. 미로는 시간이 짧을수록 위예요.'),
      h('li', '서버가 말이 안 되는 기록(너무 빠른 속도 등)은 저절로 거절해요. 그래도 이상한 1등이 보이면 아래 표에서 그 학생 기록만 지우세요.'),
      h('li', '"랭킹 초기화"는 그 게임 기록을 모두 지워요 (되돌릴 수 없음, "초기화" 입력). 연습 기간이 끝나고 진짜 축제를 시작할 때 쓰면 좋아요.'),
      h('li', '인터넷이 끊긴 채 한 판은 학생 폰에 저장됐다가 연결되면 자동으로 올라와요 (게임마다 가장 좋은 기록 하나).')));

  // 설정: 열리는 포켓몬 수 + 게임 켜고 끄기
  const unlock = h('input.inp', { type: 'number', min: 0, max: 300, value: ov.unlock, style: { maxWidth: '110px' } });
  const saveUnlock = h('button.btn.small.go', '저장');
  saveUnlock.onclick = () => {
    const v = Number(unlock.value);
    if (!Number.isInteger(v) || v < 0 || v > 300) { toast('0~300 사이 숫자로 넣어 주세요.'); return; }
    busy(saveUnlock, async () => { await saveSetting('minigame_unlock', v); toast(`포켓몬 ${v}마리부터 미니게임이 열려요.`); rerender(); });
  };
  const toggles = h('div.row', { style: { flexWrap: 'wrap', gap: '6px' } });
  const drawToggles = () => toggles.replaceChildren(...MG.map(([id, label]) => {
    const off = (ov.off || []).includes(id);
    const b = h(`button.btn.small${off ? '.danger' : '.go'}`, `${label.replace(' (랭킹 모드)', '')}: ${off ? '꺼짐' : '켜짐'}`);
    b.onclick = () => busy(b, async () => {
      const next = off ? (ov.off || []).filter((x) => x !== id) : [...(ov.off || []), id];
      await saveSetting('minigame_off', next); ov = { ...ov, off: next }; rerender();
      toast(`${label.replace(' (랭킹 모드)', '')}: ${off ? '켰어요' : '껐어요 (학생 앱에 "쉬는 중")'}`);
    });
    return b;
  }));
  drawToggles();
  const settings = h('div.box.stack',
    h('h2', '설정'),
    h('div.row', { style: { flexWrap: 'wrap', gap: '8px', alignItems: 'center' } }, h('span', '미니게임이 열리는 포켓몬 수'), unlock, h('span', '마리'), saveUnlock),
    h('div.row', resetBtn('minigame_unlock', ov.unlock)),
    h('small.muted', '게임 켜고 끄기 (누르면 바로 바뀌어요)'), toggles,
    h('div.row', resetBtn('minigame_off', ov.off || [])));

  // 현황
  const stats = h('div.box.stack', h('h2', '현황'),
    h('div.tbl-wrap', h('table.tbl',
      h('thead', h('tr', h('th', '게임'), h('th.num', '오늘 판 수'), h('th.num', '전체 판 수'), h('th.num', '참가자'))),
      h('tbody', MG.map(([id, label]) => { const g = ov.games?.[id] || {}; return h('tr', h('td', label), h('td.num', g.today ?? 0), h('td.num', g.plays ?? 0), h('td.num', g.players ?? 0)); })))));

  // 게임별 기록
  const list = h('div');
  const seg = h('div.row', { style: { flexWrap: 'wrap', gap: '6px' } });
  const reset = h('button.btn.small.danger', '이 게임 랭킹 초기화');
  const load = async () => {
    S.mgGame = game;
    seg.replaceChildren(...MG.map(([id, label]) => h(`button.btn.small${id === game ? '.go' : ''}`, { onclick: () => { game = id; load(); } }, label.replace(' (랭킹 모드)', ''))));
    list.replaceChildren(h('p.muted', '불러오는 중…'));
    const rows = await rpc('admin_minigame_scores', { p_game: game, p_limit: 200 });
    list.replaceChildren(rows.length ? h('div.tbl-wrap', h('table.tbl',
      h('thead', h('tr', h('th.num', '순위'), h('th', '학번'), h('th', '이름'), h('th.num', game === 'maze' ? '기록 (짧을수록 위)' : '기록'), h('th.num', '판 수'), h('th', '마지막'), h('th', ''))),
      h('tbody', rows.map((r) => {
        const del = h('button.btn.small.danger', '기록 지우기');
        del.onclick = async () => {
          if (!await confirmBox('이 학생의 기록 지우기', [`${r.student_id} ${r.name || ''} 의 "${MG.find(([i]) => i === game)[1]}" 기록 ${r.plays}개를 모두 지울까요?`, '되돌릴 수 없어요. 이상한(부정) 기록을 지울 때만 쓰세요.'], { ok: '지우기', danger: true })) return;
          busy(del, async () => { const n = await rpc('admin_delete_minigame_scores', { p_game: game, p_student_id: r.student_id }); toast(`${n}개 지웠어요.`); load(); });
        };
        return h('tr', h('td.num', r.rk), h('td.mono', r.student_id), h('td', r.name || '–'), h('td.num', h('b', mgFmt(game, r.score))), h('td.num', r.plays), h('td', fmtTime(r.at)), h('td', del));
      })))) : h('p.muted', '아직 기록이 없어요.'));
  };
  reset.onclick = async () => {
    const label = MG.find(([i]) => i === game)[1];
    if (!await confirmBox(`${label} 랭킹 초기화`, [`"${label}"의 기록을 모두 지워요. 되돌릴 수 없어요.`, '연습 기간이 끝나고 진짜 축제를 시작할 때 쓰세요.'], { ok: '모두 지우기', danger: true, typeToConfirm: '초기화' })) return;
    busy(reset, async () => { const n = await rpc('admin_reset_minigame', { p_game: game, p_confirm: '초기화' }); toast(`${label}: 기록 ${n}개를 지웠어요.`); ov = await rpc('admin_minigame_overview'); load(); });
  };
  load();
  return [help, settings, stats,
    h('div.box.stack', h('div.row', { style: { flexWrap: 'wrap', gap: '8px', alignItems: 'center' } }, h('h2', '게임별 기록'), h('span.spacer', { style: { flex: 1 } }), reset),
      seg, h('small.muted', '한 사람당 가장 좋은 기록 · 위에서 200명까지. 학번·이름은 운영자에게만 보여요.'), list)];
}

// 요청: 비밀번호 초기화 요청 (허용하면 학생이 고른 새 비밀번호로 바뀜) + 학생 문의함 (0011)
async function tabReq() {
  const box = h('div.stack');
  const draw = (d) => {
    const pending = d.resets.filter((r) => r.status === 'pending');
    const done = d.resets.filter((r) => r.status !== 'pending').slice(0, 30);
    const open = d.inquiries.filter((q) => q.status === 'open');
    const resetRow = (r) => {
      const ok = h('button.btn.small.go', '허용');
      const no = h('button.btn.small.danger', '거절');
      ok.onclick = () => {
        if (!confirm(`${r.student_id} 의 비밀번호를 학생이 요청한 새 비밀번호로 바꿀까요?\n\n학생증(또는 본인)을 확인했나요? 허용하면 이 번호에 연결된 구글 계정이 모두 풀리고 모든 기기에서 로그아웃돼요.`)) return;
        busy(ok, async () => { draw(await rpc('admin_decide_reset', { p_id: r.id, p_approve: true })); toast(`${r.student_id}: 새 비밀번호로 바꿨어요.`); });
      };
      no.onclick = () => busy(no, async () => { draw(await rpc('admin_decide_reset', { p_id: r.id, p_approve: false })); toast('거절했어요.'); });
      const same = r.account_name && r.account_name === r.name;
      return h('tr',
        h('td.mono', r.student_id),
        h('td', r.account_name || h('span.muted', '(이름 없음)')),
        h('td', r.name, ' ', same ? chip('이름 같음', 'ok') : chip('이름 다름', 'hot')),
        h('td', r.note || '–'),
        h('td', r.from_app ? '앱(로그인 상태)' : '로그인 화면'),
        h('td.num', r.google_links),
        h('td', timeAgo(r.created_at)),
        h('td', r.status === 'pending' ? h('div.row', ok, no) : chip(r.status === 'approved' ? '허용함' : '거절함', r.status === 'approved' ? 'ok' : 'off')));
    };
    const resetTable = (rows) => h('div.tbl-wrap', h('table.tbl',
      h('thead', h('tr', h('th', '고유번호'), h('th', '계정 이름'), h('th', '요청자가 적은 이름'), h('th', '메모'), h('th', '보낸 곳'), h('th.num', '연결된 구글'), h('th', '언제'), h('th', ''))),
      h('tbody', rows.map(resetRow))));
    const inqRow = (q) => {
      const b = h('button.btn.small', q.status === 'open' ? '처리 완료' : '다시 열기');
      b.onclick = () => busy(b, async () => draw(await rpc('admin_set_inquiry', { p_id: q.id, p_done: q.status === 'open' })));
      return h('tr', h('td.mono', q.student_id || '–'), h('td', q.name || '–'), h('td', { style: { whiteSpace: 'pre-wrap', maxWidth: '520px' } }, q.body),
        h('td', timeAgo(q.created_at)), h('td', q.status === 'open' ? chip('새 문의', 'hot') : chip('완료', 'off')), h('td', b));
    };
    box.replaceChildren(
      h('div.box.stack',
        h('h2', `비밀번호 초기화 요청 ${pending.length ? `(${pending.length})` : ''}`),
        h('p.notice', h('b', '허용하기 전에 꼭 본인 확인! '), '이름은 친구도 알 수 있어요. 부스에서 학생증(또는 얼굴)을 보고 허용하세요. ',
          '학교 구글 계정이 있는 학생은 운영자 없이 직접 초기화할 수 있어요 (학교 계정으로 로그인 → 고유번호 입력 → "학교 계정으로 비밀번호 새로 정하기"). 그쪽으로 안내하는 게 더 안전해요.'),
        pending.length ? resetTable(pending) : h('p.muted', '기다리는 요청이 없어요.'),
        done.length ? h('details', h('summary', `처리한 요청 ${done.length}개`), resetTable(done)) : null),
      h('div.box.stack',
        h('h2', `학생 문의 ${open.length ? `(새 문의 ${open.length})` : ''}`),
        h('p.small-txt.muted', '학생 앱 ⚙ 설정 → "운영진에게 문의하기"로 들어온 내용이에요.'),
        d.inquiries.length ? h('div.tbl-wrap', h('table.tbl',
          h('thead', h('tr', h('th', '고유번호'), h('th', '이름'), h('th', '내용'), h('th', '언제'), h('th', '상태'), h('th', ''))),
          h('tbody', d.inquiries.map(inqRow)))) : h('p.muted', '아직 문의가 없어요.')));
  };
  draw(await rpc('admin_list_requests'));
  const reload = h('button.btn.small', '새로 고침');
  reload.onclick = () => busy(reload, async () => draw(await rpc('admin_list_requests')));
  return [h('div.row', reload), box, settingsGroup(GROUPS.account, await loadSettings())];
}

// 레이드: 아무 포켓몬으로 레이드 열기 (TV = 현장 QR, 인쇄 = 고정 QR) + 진행 중인 레이드 (0013)
const spriteImg = (id, size = 56) => spriteCanvas(id, size);   // 올린 그림(0031)도 똑같이 보이게

async function tabRaid() {
  if (!S.species?.length) await loadCatalog();
  const set = await loadSettings();
  const minTaps = Number(set.raid_min_taps?.value ?? 10);
  const catchMode = set.raid_reward_mode?.value === 'catch';
  const list = h('div');
  const STATUS = { active: ['진행 중', 'hot'], won: ['승리', 'ok'], failed: ['끝 (실패)', 'off'] };
  const draw = (rows) => list.replaceChildren(rows.length ? h('div.tbl-wrap.scroll-y', h('table.tbl',
    h('thead', h('tr', h('th', ''), h('th', '레이드'), h('th', '상태'), h('th', '체력'), h('th.num', '참가'), h('th.num', '보상'), h('th', '끝나는 시각'), h('th', ''))),
    h('tbody', rows.map((r) => {
      const end = h('button.btn.small.danger', '끝내기');
      end.onclick = () => { if (confirm(`${r.title}을(를) 지금 끝낼까요? (실패 처리, 보상 없음)`)) busy(end, async () => { await rpc('admin_end_raid', { p_id: r.id }); draw(await rpc('admin_list_raids')); }); };
      const openBtn = h(`button.btn.small${r.open ? '.go' : ''}`, r.open ? 'QR 없이 참가: 켜짐' : 'QR 없이 참가: 꺼짐');
      openBtn.onclick = () => busy(openBtn, async () => { await rpc('admin_set_raid_open', { p_id: r.id, p_open: !r.open }); draw(await rpc('admin_list_raids')); });
      const qr = h('button.btn.small', '인쇄용 QR');
      qr.onclick = () => showRaidQr(r);
      const [label, cls] = STATUS[r.status] || [r.status, 'off'];
      return h('tr',
        h('td', spriteCanvas(r.species_id, 40, r.shiny ? 'shiny' : 'normal')),
        h('td', h('b', `${r.shiny ? '✦ ' : ''}${r.title}`), h('br'), h('small.muted', `${r.q} · ${r.kind === 'slot' ? '시간대 전설' : r.kind === 'legend' ? '교장·교감' : '운영자'} · ${r.tv ? 'TV' : '인쇄 QR'}`)),
        h('td', chip(label, cls)),
        h('td.mono', `${r.hp.toLocaleString()} / ${r.hp_max.toLocaleString()}`),
        h('td.num', r.players), h('td.num', r.rewarded ?? 0), h('td', fmtTime(r.ends_at)),
        h('td', h('div.row', r.status === 'active' ? openBtn : (r.open ? chip('QR 없이', 'ok') : null), r.status === 'active' && !r.tv && r.t ? qr : null, r.status === 'active' ? end : null)));
    })))) : h('p.muted', '아직 레이드가 없어요.'));
  draw(await rpc('admin_list_raids'));

  // 보스 고르기: 타입별 (첫 번째 타입), 전국도감 번호 순
  const spGroups = new Map(TYPES18.map((t) => [t, []]));
  [...S.species].filter((sp) => sp.stage <= maxStage(S.lineById.get(sp.line_id) || {}))
    .sort((x, y) => (x.dex || 9999) - (y.dex || 9999))
    .forEach((sp) => { const t = String(sp.btype || '노말').split('/')[0]; (spGroups.get(t) || spGroups.get('노말')).push(sp); });
  const spLabel = (sp) => {
    const l = S.lineById.get(sp.line_id);
    return `No.${String(sp.dex || 0).padStart(3, '0')} ${sp.name} (${sp.btype || ''}${isSpecialLine(l) ? ' · 전설' : isWildLine(l) ? '' : ` · ${l?.teacher || ''}`})`;
  };
  const sel = h('select.inp');
  const pic = h('div', spriteImg(3, 72));
  const shinyChk = h('input', { type: 'checkbox', onchange: () => showPic() });   // 0047: 이로치 레이드
  const showPic = () => pic.replaceChildren(sel.value ? spriteCanvas(Number(sel.value), 72, shinyChk.checked ? 'shiny' : 'normal') : h('span.muted', '-'));
  // 이름·번호로 찾기: 글자를 넣으면 맞는 포켓몬만 남기고 첫 번째를 고름
  const fillSel = (q) => {
    const want = String(q || '').trim().toLowerCase().replace(/^no\.?\s*/, '');
    const hit = (sp) => !want || String(sp.name).toLowerCase().includes(want) || String(sp.dex || '') === want.replace(/^0+/, '')
      || String(sp.btype || '').includes(want) || String(S.lineById.get(sp.line_id)?.teacher || '').toLowerCase().includes(want);
    const keep = sel.value;
    sel.replaceChildren(...[...spGroups].map(([t, a]) => [t, a.filter(hit)]).filter(([, a]) => a.length)
      .map(([t, a]) => h('optgroup', { label: t }, a.map((sp) => h('option', { value: sp.id }, spLabel(sp))))));
    if (!sel.options.length) sel.append(h('option', { value: '', disabled: true }, '찾는 포켓몬이 없어요'));
    sel.value = [...sel.options].some((o) => o.value === keep && !o.disabled) ? keep : (sel.options[0]?.value || '');
    showPic();
  };
  const find = h('input.inp', { type: 'search', placeholder: '이름 · 도감 번호 · 타입으로 찾기 (예: 후딘, 65)', oninput: () => fillSel(find.value) });
  fillSel('');
  sel.value = '3'; showPic();
  sel.onchange = showPic;
  // 프리셋 고르기 + "직접 입력" → 숫자 칸
  const preset = (opts, unit, min, max) => {
    const own = h('input.inp', { type: 'number', inputmode: 'numeric', min, max, placeholder: `${min}~${max.toLocaleString()} ${unit}`, hidden: true });
    const s = h('select.inp', opts.map(([v, t, on]) => h('option', { value: v, selected: on }, t)), h('option', { value: 'own' }, '직접 입력…'));
    s.onchange = () => { own.hidden = s.value !== 'own'; if (!own.hidden) own.focus(); };
    return { el: h('div.stack', s, own), get value() { return s.value === 'own' ? Number(own.value) : Number(s.value); }, min, max };
  };
  const hp = preset([[3000, '작게 3,000 (5~10명)'], [12000, '보통 12,000 (20~30명)', true], [40000, '크게 40,000 (50~100명)'], [100000, '아주 크게 100,000']], '체력', 10, 10000000);
  const mins = preset([5, 10, 15, 30, 60].map((m) => [m, `${m}분`, m === 10]), '분', 1, 600);
  const mode = h('select.inp', h('option', { value: 'tv' }, 'TV 대형 화면 (30초마다 바뀌는 현장 QR)'), h('option', { value: 'print' }, '인쇄용 고정 QR (아무 데나 붙이기)'));
  const title = h('input.inp', { placeholder: '레이드 이름 (비우면 "포켓몬 이름 레이드")', maxlength: 40 });
  const openChk = h('input', { type: 'checkbox' });
  const go = h('button.btn.go', { type: 'submit' }, '레이드 열기');
  const form = h('form.box.stack', {
    onsubmit: (e) => {
      e.preventDefault();
      if (!sel.value) { toast('보스 포켓몬을 골라 주세요.'); return; }
      for (const [f, name] of [[hp, '보스 체력'], [mins, '시간']]) {
        if (!Number.isInteger(f.value) || f.value < f.min || f.value > f.max) { toast(`${name}은(는) ${f.min}~${f.max.toLocaleString()} 사이 숫자로 넣어 주세요.`); return; }
      }
      busy(go, async () => {
        const r = await rpc('admin_create_raid', { p_species: Number(sel.value), p_hp: Number(hp.value), p_minutes: Number(mins.value), p_tv: mode.value === 'tv', p_title: title.value, p_shiny: shinyChk.checked });
        if (openChk.checked) await rpc('admin_set_raid_open', { p_id: r.id, p_open: true });
        toast(`${r.shiny ? '✦ 이로치 ' : ''}${r.title}을(를) 열었어요.${openChk.checked ? ' (QR 없이 앱에서 참가 가능)' : ''}`);
        title.value = ''; shinyChk.checked = false; showPic();
        draw(await rpc('admin_list_raids'));
        if (!r.tv) showRaidQr(r);
      });
    },
  },
    h('h2', '레이드 열기'),
    h('p.small-txt', `아무 포켓몬(3단계 진화형도 가능)로 레이드를 열 수 있어요. QR을 찍은 학생들이 다 같이 보스를 탭해서 체력을 0으로 만들면, ${minTaps}번 이상 공격한 모두가 ${catchMode ? '앱에서 그 포켓몬을 잡을 기회' : '그 포켓몬 특별 티켓 (주머니 칸 제한 없음)'}를 받아요 (오른쪽 "보상 방식"). 시간 안에 못 잡으면 실패.`),
    h('div.row', pic, h('label.field', { style: { flex: 1 } }, h('span', '보스 포켓몬'), find, sel)),
    h('label.chk.chk-top', shinyChk, h('span', h('b', '✦ 이로치 레이드'), ' — 보스가 반짝이는 색으로 나오고, 이기면 받는 포켓몬도 반드시 반짝이는 색이에요')),
    h('div.row', h('label.field', h('span', '보스 체력'), hp.el), h('label.field', h('span', '시간'), mins.el)),
    h('label.field', h('span', 'QR 방식'), mode), title,
    h('label.chk.chk-top', openChk, h('span', h('b', 'QR 없이 참가'), ' — 학생 앱 레이드 탭에 "참가" 버튼이 떠요 (아침·점심·저녁에 모두에게 주는 레이드용)')),
    go);
  const reload = h('button.btn.small', '새로 고침');
  reload.onclick = () => busy(reload, async () => draw(await rpc('admin_list_raids')));
  return [h('div.cols', form, raidRewardBox(set)),
    h('div.box.stack', h('div.row', h('h2', { style: { flex: 1 } }, '레이드 목록'), reload), list,
      h('p.small-txt.muted', '시간대 전설 레이드는 아래 [시간대 전설]에서 정한 시간에 TV 화면이 저절로 열어요. "QR 없이 참가"는 목록에서 레이드마다 켜고 끌 수 있어요.')),
    h('div.cols.wide-left', slotEditor(set), settingsGroup(GROUPS.raidSlot, set))];
}

function showRaidQr(r) {
  const url = placeUrl(siteBase(), r.q, r.t);
  const cv = drawQR(document.createElement('canvas'), url, { cell: 10, margin: 4 });
  const w = window.open('', '_blank');
  if (!w) { toast('팝업이 막혔어요. 팝업을 허용해 주세요.'); return; }
  w.document.title = r.title;
  w.document.body.style.cssText = 'font-family:sans-serif;text-align:center;padding:24px';
  w.document.body.innerHTML = `<h1>${r.title.replace(/</g, '&lt;')}</h1><p>QR을 찍고 레이드에 참가하세요! (${r.q})</p>`;
  const img = w.document.createElement('img'); img.src = cv.toDataURL(); img.style.width = '360px'; img.style.imageRendering = 'pixelated';
  w.document.body.append(img);
}

// ───────────────────────── 설정 공통 (불러오기 · 저장 · 기본값) ─────────────────────────

// 기본값 = 그 설정을 처음 넣은 마이그레이션의 값 (뒤 마이그레이션이 바꿨으면 바뀐 값). "기본값으로 되돌리기" 버튼에 씀.
// 없는 키 = 버튼 없이 "기본값 없음". festival_open · self_redeem 은 자기 스위치가 있어서 일부러 뺌.
// admin_emails · booth_emails 도 뺌 (기본값 [] 로 되돌리면 구글로 등록한 운영진이 모두 지워짐 → 운영진 탭에서 관리).
const DEFAULTS = {
  // supabase/migrations/0001_init.sql
  email_domains: ['hafs.hs.kr'], email_regex: '^([0-9]{5,6})@',
  stage_points: [0, 1, 3, 6], rarity_bonus: { common: 0, rare: 2, legendary: 10 },
  // 0032 야생 포켓몬
  wild_chance: 0.4, wild_weights: { common: 100, rare: 10, legendary: 1 }, wild_steps: 1500, wild_daily: 5, wild_balls: 5,
  // 0033 사파리존
  safari_open: true,   // 0048 사파리존 잠금
  unlock_safari_pct: 30, unlock_all: false,   // 0051 해금 단계
  safari_balls_daily: 20, safari_reset_hours: 0.5, safari_min_steps: 8, safari_encounter_rate: 0.12, safari_flee: 0.25, safari_steps_per_sec: 10,   // 0040: 30분 충전 · 만남 상한 없음 · 걸음 10/초
  safari_flee_level: 0.1,
  safari_flee_step: 0.05, safari_flee_legend: 0.15, safari_flee_max: 0.9,   // 0037 도망 (3세대 사파리처럼)
  evo_prob: [0, 0.7, 0.35], evo_pity_step: 0.1, evo_pity_max: [0, 1, 2],
  qr_daily_cap: 3, bag_max: 5, ticket_ttl_hours: 10, token_grace_minutes: 30, rotating_window_sec: 30,
  quiz_ticket_daily_cap: 30,                 // 0001 은 20 → 0005_festival_ops.sql 에서 30 으로
  // 0003_review_fixes.sql
  rotating_accept_sec: 90, festival_close_at: null, min_client_version: 1,
  // 0005_festival_ops.sql
  notice: null, prize_note: null, dup_bonus_every: 3,
  // 0007_roulette.sql
  roulette_enabled: true, roulette_every_min: 5, roulette_daily_max: 12, roulette_odds: [[0, 72], [1, 24], [3, 4]],
  // 0008_open_login.sql (code_signup_per_10min 60 → 0019_ops_polish.sql 에서 1000)
  code_self_signup: true, code_signup_per_10min: 1000, dev_login: false,
  // 0010_allowed_gens.sql
  allowed_gens: [20, 21, 22],
  // 0011_number_accounts.sql
  reset_requests_per_10min: 30, roulette_777_per_mille: 10,
  // 0013_raids.sql (raid_slots 의 야자 시간대 77·78 은 0024_mythic.sql 이 더함)
  raid_slots: [
    { line: 38, from: '09:00', until: '11:00' }, { line: 39, from: '12:00', until: '13:30' }, { line: 40, from: '16:00', until: '18:00' },
    { line: 77, from: '19:00', until: '20:20' }, { line: 78, from: '20:50', until: '23:00' },
  ],
  raid_slot_minutes: 10, raid_slot_hp: 20000, raid_cooldown_min: 5, raid_tap_cap: 8, raid_min_taps: 10, dex_rewards: { 50: 41, 100: 42 },
  // 0015_battles.sql (battle_turn_sec 45 → 0020_growth.sql 에서 30)
  battle_daily_max: 999, battle_turn_sec: 30, battle_invite_sec: 60,
  // 0020_growth.sql
  lv_from_battle: true, lv_from_raid: true, lv_from_places: true, lv_from_catch: true, lv_places_n: 3, raid_levels: 1,
  exp_need_mul: 8, exp_battle_mul: 4, exp_practice: 0.5, exp_lose: 0.4,
  drop_place: 0.3, drop_quiz: 0.4, drop_battle: 0.5, drop_practice: 0.15, drop_raid_tm: 0.3,
  battle_item_max: 2, battle_field_mult: 1.3, battle_turn_cap: 20,
  // seed_pokemon.sql (0032): 과목 대신 실제 포켓몬 타입
  // 0039: 시간표 칸 = 실제 포켓몬 날씨 · 필드
  battle_fields: [
    { from: '08:00', to: '10:00', name: '아침 조회', env: 'sun' },
    { from: '10:00', to: '12:00', name: '오전 수업', env: 'psychic' },
    { from: '12:00', to: '13:30', name: '점심시간', env: 'grassy' },
    { from: '13:30', to: '16:00', name: '오후 수업', env: 'electric' },
    { from: '16:00', to: '18:30', name: '방과후', env: 'sand' },
    { from: '18:30', to: '23:00', name: '야간 자율학습', env: 'misty' },
  ],
  ability_hidden_chance: 0.05,
  // 0056_trade.sql
  trade_open: true, trade_daily_max: 5, trade_room_sec: 180,
  // 0021_battle_end.sql · 0022_open_raids.sql · 0023_minigames.sql · 0025_minigame_admin.sql
  practice_exp_daily: 10, raid_slot_open: false, minigame_unlock: 10, minigame_off: [],
  // 0027_eggs_class_achievements.sql
  egg_steps: { green: 1000, yellow: 2500, purple: 5000 }, egg_qr_bonus: 300, steps_per_min_max: 200, steps_day_max: 30000,
  egg_hold_max: 9, egg_incubators: 3, egg_drop_place: 0.25, egg_legend: 0.1,
  // 0042_shiny.sql (egg_shiny 는 0027 값을 0042 가 바꿈)
  egg_shiny: { green: 1 / 256, yellow: 1 / 128, purple: 1 / 64 }, wild_shiny_chance: 1 / 512, shiny_charm_mult: 3,
  // 0028_catch.sql
  catch_exp: { none: 0, nice: 20, great: 40, excellent: 80, curve: 20 },
  // 0030_catch_raid_class.sql
  catch_flee: 0.05, raid_reward_mode: 'ticket', raid_catch_balls: 10, raid_catch_flee: true,
  // 0038_legends.sql
  ditto_disguise_chance: 0.005, roam_chance: 0.3, roam_balls: 8, legend_balls: 10, legend_daily_tries: 3, gift_fail_limit: 8, safari_cave_type_mult: 4,
  // 0055_legend_battle.sql
  legend_battle_on: true, legend_boss_level: 55, legend_boss_level_plus: 8, legend_boss_level_max: 80, legend_boss_hp_mult: 1.5, legend_boss_stage: 2, legend_win_catch_bonus: 1.5,
  catch_rate_tier: { green: 0.7, yellow: 0.5, orange: 0.33, red: 0.18 }, catch_rate_max: { green: 0.95, yellow: 0.8, orange: 0.6, red: 0.45 },
  legend_quests: [
    { dex: 480, kind: 'quiz_streak', n: 10, reward: 'ticket' }, { dex: 481, kind: 'battle_wins', n: 20, reward: 'ticket' },
    { dex: 482, kind: 'catches', n: 30, reward: 'ticket' }, { dex: 483, kind: 'raid_slots', n: 3, reward: 'ticket' }, { dex: 484, kind: 'qr_all', reward: 'ticket' },
    { dex: 377, kind: 'type_catch', types: ['바위'], n: 8, reward: 'map' }, { dex: 378, kind: 'type_catch', types: ['얼음'], n: 10, reward: 'map' },
    { dex: 379, kind: 'type_catch', types: ['강철'], n: 8, reward: 'map' }, { dex: 486, kind: 'caught_all', of: [377, 378, 379], reward: 'map' },
    { dex: 249, kind: 'type_catch', types: ['물'], n: 20, reward: 'map' }, { dex: 250, kind: 'type_catch', types: ['불꽃', '비행'], n: 20, reward: 'map' },
    { dex: 382, kind: 'safari_catches', n: 15, reward: 'map' }, { dex: 383, kind: 'type_catch', types: ['땅'], n: 15, reward: 'map' },
    { dex: 384, kind: 'caught_all', of: [382, 383], reward: 'map' },
    // 0050_legends.sql (0054_legend_maps.sql: 쉬운 전설 조건을 올림)
    { dex: 380, kind: 'type_catch', types: ['에스퍼'], n: 10, reward: 'map' }, { dex: 381, kind: 'type_catch', types: ['드래곤'], n: 6, reward: 'map' },
    { dex: 488, kind: 'type_catch', types: ['페어리'], n: 10, reward: 'map' }, { dex: 491, kind: 'caught_all', of: [488], reward: 'map' },
    { dex: 489, kind: 'type_catch', types: ['물'], n: 20, reward: 'map' }, { dex: 785, kind: 'type_catch', types: ['전기'], n: 10, reward: 'map' },
    { dex: 786, kind: 'battle_wins', n: 15, reward: 'map' }, { dex: 787, kind: 'type_catch', types: ['풀'], n: 12, reward: 'map' },
    { dex: 788, kind: 'safari_catches', n: 25, reward: 'map' }, { dex: 638, kind: 'type_catch', types: ['강철'], n: 10, reward: 'map' },
    { dex: 639, kind: 'type_catch', types: ['바위'], n: 10, reward: 'map' }, { dex: 640, kind: 'type_catch', types: ['격투'], n: 10, reward: 'map' },
    { dex: 647, kind: 'caught_all', of: [638, 639, 640], reward: 'map' }, { dex: 492, kind: 'type_catch', types: ['풀', '벌레'], n: 15, reward: 'map' },
    { dex: 641, kind: 'type_catch', types: ['비행'], n: 10, reward: 'map' }, { dex: 642, kind: 'type_catch', types: ['전기'], n: 10, reward: 'map' },
    { dex: 645, kind: 'caught_all', of: [641, 642], reward: 'map' }, { dex: 643, kind: 'zone_catch', zone: 'dragon', n: 6, reward: 'map' },
    { dex: 644, kind: 'zone_catch', zone: 'dragon', n: 10, reward: 'map' }, { dex: 646, kind: 'caught_all', of: [643, 644], reward: 'map' },
    { dex: 789, kind: 'zone_catch', zone: 'ultra', n: 5, reward: 'map', max: 2 }, { dex: 800, kind: 'caught_all', of: [789], reward: 'map' },
    { dex: 385, kind: 'quiz_streak', n: 7, reward: 'map' }, { dex: 386, kind: 'zone_catch', zone: 'ultra', n: 8, reward: 'map' },
    { dex: 720, kind: 'raid_slots', n: 3, reward: 'map' }, { dex: 494, kind: 'battle_wins', n: 10, reward: 'map' },
    { dex: 649, kind: 'type_catch', types: ['벌레'], n: 10, reward: 'map' }, { dex: 719, kind: 'zone_catch', zone: 'desert', n: 12, reward: 'map' },
    { dex: 802, kind: 'type_catch', types: ['고스트'], n: 8, reward: 'map' }, { dex: 807, kind: 'zone_catch', zone: 'plant', n: 12, reward: 'map' },
    { dex: 801, kind: 'type_catch', types: ['강철', '페어리'], n: 12, reward: 'map' }, { dex: 772, kind: 'catches', n: 40, reward: 'map' },
    { dex: 485, kind: 'zone_catch', zone: 'lava', n: 10, reward: 'map' }],
};
const hasDefault = (key) => Object.prototype.hasOwnProperty.call(DEFAULTS, key);
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const sameVal = (a, b) => JSON.stringify(sortKeys(a ?? null)) === JSON.stringify(sortKeys(b ?? null));

// settings 표 전체 → { key: row }
async function loadSettings() {
  const rows = await tq(sb.from('settings').select('*').order('key'));
  return Object.fromEntries(rows.map((r) => [r.key, r]));
}

// 설정 하나 저장. 서버에 그 줄이 없으면(마이그레이션 전) 조용히 넘어가지 않고 알려 줌. value null = 비우기 (0005부터 가능)
async function saveSetting(key, value) {
  const rows = await tq(sb.from('settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key).select('key'));
  if (!rows?.length) throw Object.assign(new Error(`"${key}" 설정이 서버에 아직 없어요 (새 마이그레이션이 필요해요).`), { ready: true });
  if (key === 'token_grace_minutes') S.grace = Number(value) || 30;
  if (key === 'qr_daily_cap') S.dailyCap = Number(value) || S.dailyCap;
}

// ── 칸 정의: kind = int(정수) · num(소수) · pct(0~1 을 %로) · bool(켜짐/꺼짐) · choice(고르기) · obj(여러 칸 묶음) ──
const P = (key, label, kind, extra = {}) => ({ key, label, kind, ...extra });
const EGG_PARTS = [['green', '초록 알'], ['yellow', '노랑 알'], ['purple', '보라 알']];
const CATCH_TIERS = [['green', '초록'], ['yellow', '노랑'], ['orange', '주황'], ['red', '빨강']];
const GROUPS = {
  // 0051 해금 단계 (축제 운영 탭의 '해금 단계' 카드 안)
  unlock: {
    tab: '축제 운영', title: '해금 단계 숫자',
    fields: [
      P('minigame_unlock', '1단계: 미니게임이 열리는 포켓몬 수', 'int', { unit: '종류', min: 0, max: 500, help: '포켓몬을 이만큼 (종류 수) 모으면 홈의 미니게임 버튼이 열려요. 기본 10. [미니게임] 탭의 숫자와 같은 설정이에요.' }),
      P('unlock_safari_pct', '2단계: 학교 도감을 몇 % 모으면 열리나', 'int', { unit: '%', min: 0, max: 100, help: '학교 도감 = 앱 도감의 "학교" 탭 (선생님 포켓몬 · 숨은 포켓몬). 기본 50% = 절반. 한 번 열린 학생은 숫자를 올려도 계속 열려 있어요.' }),
    ],
  },
  // 축제 운영
  opsCatch: {
    tab: '축제 운영', title: '부스 포켓몬 잡기 · 레이드 보상',
    intro: '학생은 부스(또는 셀프 지급)에서 포켓몬을 받으면 폰에서 몬스터볼 3개로 잡아요. 레이드 보상 방식은 [레이드] 탭에 자세한 설명이 있어요.',
    fields: [
      P('catch_flee', '볼 3개가 다 빗나가면 도망칠 확률', 'pct', { max: 100, help: '0% = 언제나 잡혀요 (예전처럼). 도망가면 그 티켓으로 받은 포켓몬·점수가 없던 일이 돼요. 너무 높으면 학생이 속상해요 (추천 5% 이하).' }),
      P('raid_reward_mode', '레이드 이긴 학생 보상', 'choice', { options: [['ticket', '특별 티켓 (부스에서 바꾸기)'], ['catch', '앱에서 바로 잡기 (HAFS 볼)']] }),
    ],
  },
  // 0055 잡기 확률 (원 색깔별) — 축제 운영 탭 catchRatesCard (아래 미리보기 표)
  catchRates: {
    tab: '축제 운영', title: '잡기 확률 (원 색깔별)',
    intro: '잡기 장면에서 포켓몬 둘레의 안쪽 원 색깔 = 어려운 정도 (초록 쉬움 → 빨강 어려움). 레벨이 높거나 희귀할수록 빨간 쪽, 전설은 언제나 빨강. 공을 맞혔을 때 이 확률로 잡히고, 나머지는 공에서 튕겨 나와요 (튕겨냄 = 100% − 잡힘). 학생 폰이 다음에 잡기를 열 때 바로 바뀌어요.',
    fields: [
      P('catch_rate_tier', '원 색깔별 기본 잡힘 확률 (그냥 맞혔을 때)', 'obj', { parts: CATCH_TIERS, partKind: 'pct',
        help: '기본 초록 70% · 노랑 50% · 주황 33% · 빨강 18%. 나이스 ×1.2 · 그레이트 ×1.5 · 엑설런트 ×2 · 커브볼 ×1.3 을 곱해요.' }),
      P('catch_rate_max', '원 색깔별 최대 잡힘 확률 (아무리 잘 던져도)', 'obj', { parts: CATCH_TIERS, partKind: 'pct',
        help: '기본 초록 95% · 노랑 80% · 주황 60% · 빨강 45%. 엑설런트 커브볼이어도 이보다 높아지지 않아요 (기본 확률보다 낮게 넣으면 기본 확률이 최대).' }),
    ],
  },
  // 야생 포켓몬 (0032): 선생님이 없는 포켓몬을 만나는 길
  wild: {
    tab: '축제 운영', title: '야생 포켓몬',
    intro: '선생님이 없는 야생 포켓몬 (전국도감 1~809 중 선생님·전설 자리가 아닌 것)을 만나는 방법이에요. 알에서도 나오고, 레이드로도 열 수 있어요.',
    fields: [
      P('wild_chance', 'QR을 찍으면 야생 포켓몬이 나올 확률', 'pct', { max: 100, help: '나머지는 그 장소에 정해 둔 선생님 포켓몬. 정해 둔 포켓몬이 없는 QR은 언제나 야생 포켓몬이에요.' }),
      P('wild_weights', '야생 포켓몬 희귀도 가중치', 'obj', { parts: [['common', '흔함'], ['rare', '희귀 (스타팅 등)'], ['legendary', '전설·환상']], partKind: 'int', min: 0, max: 10000,
        help: '숫자가 클수록 자주 나와요. 기본 100 · 10 · 1 = 전설은 아주 드물게. 0 = 안 나옴.' }),
      P('wild_steps', '걸음마다 야생 포켓몬 1마리', 'int', { unit: '걸음', min: 0, max: 100000, help: '0 = 걸어서 만나기 끔. 앱 홈에 "야생 포켓몬이 나타났다!" 가 뜨고 잡기 장면에서 잡아요.' }),
      P('wild_daily', '걸어서 만나는 야생 포켓몬 (하루 최대)', 'int', { unit: '마리', min: 0, max: 100 }),
      P('wild_balls', '걸어서 만난 야생 포켓몬: 몬스터볼 개수', 'int', { unit: '개', min: 1, max: 30, help: '다 빗나가면 도망가요.' }),
      P('safari_open', '사파리존 열기', 'bool', { help: '꺼짐 = 사파리존이 닫혀요 (학생 앱에 "아직 닫혀 있어요 — 학교 곳곳의 QR을 찾아보세요!"). 축제 첫머리에 QR부터 찾게 할 때 끄세요. 이미 시작한 잡기는 끝낼 수 있어요.' }),
      P('safari_balls_daily', '사파리존: 사파리볼 개수', 'step', { unit: '개', min: 0, max: 100, help: '충전 주기마다 한 사람이 받는 사파리볼 (기본 20개). 다 쓰면 다음 충전까지 못 만나요 (서버가 셈). 0 = 사파리존 끔.' }),
      P('safari_reset_hours', '사파리존: 충전 주기', 'seg', { unit: '시간', options: [[0.25, '15분'], [0.5, '30분'], [1, '1시간'], [3, '3시간'], [6, '6시간'], [12, '12시간'], [24, '24시간']],
        help: '서울 시각 00:00 부터 이만큼마다 사파리볼이 다시 차요 (기본 30분). 예: 30분 → 00:00 · 00:30 · 01:00 …. 앱에 "다음 충전 15:30" 처럼 보여요. 바꾸면 바로 새 주기로 세요.' }),
      P('safari_min_steps', '사파리존: 풀숲 몇 걸음부터 만날 수 있나', 'int', { unit: '걸음', min: 0, max: 200 }),
      P('safari_encounter_rate', '사파리존: 그다음 풀숲 한 걸음마다 만날 확률', 'pct', { max: 100, help: '기본 12%. 확률은 서버가 굴려요.' }),
      P('safari_flee', '사파리존: 공을 처음 놓쳤을 때 도망칠 확률', 'pct', { max: 100, help: '기본 25% (3세대 사파리존처럼). 도망은 서버가 정해요 — 공을 놓칠 때마다 서버에 물어봐요.' }),
      P('safari_flee_step', '사파리존: 놓칠 때마다 도망 확률이 더 오름', 'pct', { max: 100, help: '기본 +5%. 오래 머물수록 잘 도망가요 (25% → 30% → 35% …).' }),
      P('safari_flee_legend', '사파리존: 전설 포켓몬은 도망 확률 더하기', 'pct', { max: 100, help: '기본 +15%.' }),
      P('safari_flee_max', '사파리존: 도망 확률 최대', 'pct', { max: 100, help: '기본 90%. 아무리 올라도 이보다 높아지지 않아요.' }),
      P('safari_flee_level', '사파리존: 레벨이 높으면 도망 확률 더하기 (Lv.50 기준)', 'pct', { max: 100, help: '기본 +10%. Lv.5 = 0 → Lv.50 = 이만큼 (레벨은 입구에서 멀수록 · 깊을수록 높아요, 5~50).' }),
      P('safari_steps_per_sec', '사파리존: 1초에 셀 수 있는 걸음 (속임 막기)', 'int', { unit: '걸음', min: 1, max: 20, help: '앱은 1초에 6걸음쯤 걸어요 (기본 10). 너무 낮추면 걸어도 만나지 못해요.' }),
    ],
  },
  // 0038 전설 · 메타몽 · 방랑 전설 · 소포
  legends: {
    tab: '전설·소포', title: '전설 · 방랑 전설 · 메타몽 · 소포 숫자',
    fields: [
      P('ditto_disguise_chance', '메타몽 변신 확률', 'pct', { max: 100, help: '야생 (걸음 · QR 야생) · 사파리존에서 잡은 포켓몬이 사실 메타몽일 확률. 기본 0.5%. 전설 · 선생님 포켓몬 · 부스 특별 티켓 · 레이드 · 소포에는 없어요. 잡고 나면 "……? 메타몽이었다!" 장면이 나와요.' }),
      P('roam_chance', '방랑 전설: 그 장소 QR을 찍으면 만날 확률', 'pct', { max: 100, help: '라이코 · 앤테이 · 스이쿤은 한 시간마다 지도의 장소 QR 하나로 옮겨 가요. 그 시간에 그 QR을 찍으면 이 확률로 만나요 (한 시간에 한 번 기회, 한 사람에 한 마리씩만 잡음). 0% = 끔.' }),
      P('roam_balls', '방랑 전설: 몬스터볼 개수', 'int', { unit: '개', min: 1, max: 30, help: '다 빗나가면 도망가요 (다음 시간에 다른 곳에서 다시).' }),
      P('legend_balls', '사파리존 전설: HAFS 볼 개수', 'int', { unit: '개', min: 1, max: 30, help: '조건을 채운 학생이 사파리존의 전설 자리에서 말을 걸면 이 개수로 잡아요 (포켓몬 GO 처럼). 다 빗나가면 도망 — 자리에 그대로 남아 다시 도전할 수 있어요.' }),
      P('legend_daily_tries', '사파리존 전설: 하루 도전 횟수', 'int', { unit: '번', min: 1, max: 20, help: '같은 전설에게 하루에 도전할 수 있는 횟수 (한 사람마다).' }),
      P('safari_cave_type_mult', '사파리존 동굴 · 깊은 곳: 바위 · 땅 · 고스트 · 악 · 강철 · 물 타입 배수', 'num', { min: 1, max: 20, help: '기본 4 = 동굴 · 깊은 곳에서는 이 타입들이 4배 자주 나와요. 울트라 스페이스에서는 울트라비스트만 나와요 (다른 곳에서는 절대 안 나옴).' }),
      P('gift_fail_limit', '이상한 소포: 10분에 틀릴 수 있는 횟수', 'int', { unit: '번', min: 1, max: 100, help: '코드를 이만큼 틀리면 10분 동안 소포를 열 수 없어요 (코드 맞히기 장난 막기).' }),
    ],
  },
  // 0055 전설 배틀 (잡기 전에 배틀로 지치게 하기)
  legendBattle: {
    tab: '전설·소포', title: '전설 배틀 강하기 (잡기 전에 쓰러트리기)',
    intro: '사파리존 전설 · 방랑 전설은 먼저 학생의 배틀 팀 (최대 6마리) 과 배틀해요. 전설은 혼자지만 보스처럼 강해요. 이기면 "지쳤다! 지금이야!" → 잡기 장면, 지거나 도망치면 그 도전은 끝 (사파리존 전설은 하루 도전 횟수 1번을 써요, 전설은 자리에 그대로).',
    fields: [
      P('legend_battle_on', '전설 배틀 먼저 하기', 'bool', { help: '꺼짐 = 예전처럼 바로 잡기. 바꾸면 그다음에 만나는 전설부터 적용돼요.' }),
      P('legend_boss_level', '전설 레벨 (가장 낮을 때)', 'int', { unit: 'Lv', min: 1, max: 100, help: '기본 Lv.55. 학생 팀이 약해도 전설은 이 레벨보다 낮아지지 않아요.' }),
      P('legend_boss_level_plus', '학생 팀 최고 레벨보다 몇 레벨 높게', 'int', { unit: '레벨', min: 0, max: 50, help: '기본 +8. 예: 팀에서 가장 높은 포켓몬이 Lv.60 → 전설 Lv.68.' }),
      P('legend_boss_level_max', '전설 레벨 (가장 높을 때)', 'int', { unit: 'Lv', min: 1, max: 100, help: '기본 Lv.80. 아무리 강한 팀이어도 이보다 높아지지 않아요.' }),
      P('legend_boss_hp_mult', '전설 체력 배수', 'num', { unit: '배', min: 1, max: 10, help: '기본 1.5배 (0058, 예전 2.5배). 클수록 오래 버텨요. 바꾼 뒤 아래 "AI 끼리 10판 시험"으로 이기는 판 수를 확인하세요.' }),
      P('legend_boss_stage', '전설 능력 올리기 (공격·방어·특공·특방 랭크)', 'int', { unit: '랭크', min: 0, max: 3, help: '기본 +2 (2배). 0 = 올리지 않음, +1 = 1.5배. 스피드는 그대로라 빠른 포켓몬이 먼저 칠 수 있어요.' }),
      P('legend_win_catch_bonus', '배틀을 이기면 잡힘 확률 배수', 'num', { unit: '배', min: 1, max: 5, help: '기본 1.5배 (빨강 18% → 27%). "원 색깔별 최대 잡힘 확률" 은 넘지 않아요.' }),
    ],
  },
  // 레이드
  raidReward: {
    tab: '레이드', title: '레이드 보상 방식',
    fields: [
      P('raid_reward_mode', '이긴 학생이 받는 것', 'choice', { options: [['ticket', '특별 티켓 (부스에서 바꾸기)'], ['catch', '앱에서 바로 잡기 (HAFS 볼)']] }),
      P('raid_catch_balls', '앱에서 잡기: HAFS 볼 개수', 'int', { unit: '개', min: 1, max: 30, help: '"앱에서 바로 잡기"일 때만 써요.' }),
      P('raid_catch_flee', '앱에서 잡기: 볼을 다 쓰면 보스가 도망', 'bool', { help: '켜짐 = 다 빗나가면 도망 (못 받음) · 꺼짐 = 다 빗나가도 결국 잡혀요.' }),
    ],
  },
  raidSlot: {
    tab: '레이드', title: '시간대 전설 · 레이드 공통 숫자',
    fields: [
      P('raid_slot_open', '시간대 전설: QR 없이 앱에서 참가', 'bool', { help: '켜짐 = 학생 앱 레이드 탭에 "참가" 버튼 (TV 앞에 안 와도 됨) · 꺼짐 = TV 화면 QR을 찍어야 참가.' }),
      P('raid_slot_hp', '시간대 전설: 보스 체력', 'int', { min: 100, max: 10000000, help: '참가자 20~30명이면 12,000~20,000 정도.' }),
      P('raid_slot_minutes', '시간대 전설: 한 판 길이', 'int', { unit: '분', min: 1, max: 600 }),
      P('raid_cooldown_min', '시간대 전설: 끝나고 다음 판까지', 'int', { unit: '분', min: 0, max: 600, help: '시간대가 아직 안 끝났으면 이만큼 쉬고 또 열려요.' }),
      P('raid_min_taps', '보상 받는 최소 탭 수 (모든 레이드)', 'int', { unit: '번', min: 0, max: 1000 }),
      P('raid_tap_cap', '1초에 인정하는 탭 수 (모든 레이드, 오토클릭 방지)', 'int', { unit: '번', min: 1, max: 30 }),
    ],
  },
  // 학생·계정
  account: {
    tab: '학생·계정', title: '계정 만들기 · 비밀번호 요청 제한',
    fields: [
      P('code_self_signup', '새 계정 만들기 허용', 'bool', { help: '꺼짐 = 처음 쓰는 고유번호·아이디로는 로그인(가입)이 안 돼요. 이미 만든 계정은 그대로 로그인돼요.' }),
      P('code_signup_per_10min', '10분 동안 새 계정 최대 수 (전체)', 'int', { unit: '개', min: 1, max: 100000, help: '번호 선점 장난 방지. 아침 가입이 몰리면 크게.' }),
      P('reset_requests_per_10min', '10분 동안 비밀번호 초기화 요청 최대 수 (전체)', 'int', { unit: '개', min: 1, max: 10000 }),
    ],
  },
  // 성장·보상
  eggs: {
    tab: '성장·보상', title: '알 · 걸음',
    intro: '걸음은 학생이 앱을 켜 둔 채 걸으면 폰 센서로 세요. 알은 부화기에 넣고 걸으면 깨어나요.',
    fields: [
      P('egg_steps', '부화에 필요한 걸음', 'obj', { parts: EGG_PARTS, partKind: 'int', unit: '걸음', min: 100, max: 100000 }),
      P('egg_qr_bonus', '새 장소 QR 하나 찍을 때 보너스 걸음', 'int', { unit: '걸음', min: 0, max: 10000 }),
      P('steps_per_min_max', '1분에 인정하는 최대 걸음 (흔들기 방지)', 'int', { unit: '걸음', min: 30, max: 1000 }),
      P('steps_day_max', '하루에 인정하는 최대 걸음', 'int', { unit: '걸음', min: 1000, max: 200000 }),
      P('egg_hold_max', '한 사람이 가질 수 있는 알 수', 'int', { unit: '개', min: 1, max: 30 }),
      P('egg_incubators', '부화기 칸 수', 'int', { unit: '칸', min: 1, max: 3, help: '서버가 1~3칸만 써요.' }),
      P('egg_drop_place', '새 장소 QR에서 알이 나올 확률', 'pct'),
      P('egg_legend', '보라 알에서 전설이 나올 확률', 'pct'),
    ],
  },
  // 0042 반짝이는 포켓몬 (이로치)
  shiny: {
    tab: '성장·보상', title: '반짝이는 포켓몬 (색이 다른 포켓몬)',
    intro: '확률은 "1/N" 의 N 으로 넣어요 (512 = 512마리에 1마리꼴). 0 = 안 나옴. 도감을 모두 채운 학생은 빛나는 부적을 받아 모든 확률이 아래 배수만큼 올라가요.',
    fields: [
      P('wild_shiny_chance', '새로 잡는 포켓몬이 반짝일 확률', 'odds', { help: '야생 (걸음 · QR) · 사파리존 · 레이드 · 전설 · 방랑 · 부스 티켓 · 소포 모두. 만날 때 서버가 정해서 잡기 장면부터 반짝여요. 기본 1/512.' }),
      P('egg_shiny', '알에서 반짝이가 나올 확률', 'obj', { parts: EGG_PARTS, partKind: 'odds', help: '기본 초록 1/256 · 노랑 1/128 · 보라 1/64.' }),
      P('shiny_charm_mult', '빛나는 부적: 확률 배수', 'num', { unit: '배', min: 1, max: 20, help: '기본 3배 (1/512 → 1/171). 확률은 100%를 넘지 않아요.' }),
    ],
  },
  catchExp: {
    tab: '성장·보상', title: '잡기 경험치 (몬스터볼 던지기 솜씨)',
    intro: '잡기 장면에서 원이 작을 때 맞히면 나이스 → 그레이트 → 엑설런트. 받은 포켓몬이 이만큼 경험치를 받아요 (티켓 하나에 한 번). 폰이 보내는 값이라 너무 크게 하지 마세요.',
    fields: [
      P('catch_exp', '던지기 등급별 경험치', 'obj', {
        parts: [['none', '그냥 잡음'], ['nice', '나이스'], ['great', '그레이트'], ['excellent', '엑설런트'], ['curve', '커브볼 추가']], partKind: 'int', unit: '경험치', min: 0, max: 1000,
      }),
    ],
  },
  level: {
    tab: '성장·보상', title: '레벨 · 경험치',
    intro: '포켓몬 레벨은 1~100. 아래 방법으로 오르고, 하나씩 끌 수 있어요.',
    fields: [
      P('lv_from_battle', '배틀 경험치로 레벨 오르기', 'bool'),
      P('lv_from_raid', '레이드 참가로 레벨 오르기', 'bool'),
      P('raid_levels', '레이드 한 판에 오르는 레벨', 'int', { unit: '레벨', min: 0, max: 10 }),
      P('lv_from_places', '여러 장소 QR 찍으면 배틀 팀 레벨 +1', 'bool'),
      P('lv_places_n', '하루에 서로 다른 장소 몇 곳마다 +1', 'int', { unit: '곳', min: 1, max: 20 }),
      P('lv_from_catch', '같은 포켓몬을 또 잡으면 레벨 +1', 'bool'),
      P('exp_need_mul', '레벨업에 필요한 경험치 배수', 'int', { min: 1, max: 100, help: '레벨 L → L+1 에 이 값 × L 만큼. 크면 레벨이 느리게 올라요.' }),
      P('exp_battle_mul', '배틀 한 판 경험치 배수', 'num', { min: 0, max: 100, help: '이 값 × 상대 평균 레벨.' }),
      P('exp_practice', '연습 배틀 경험치 배율', 'num', { unit: '배', min: 0, max: 2 }),
      P('exp_lose', '졌을 때 경험치 배율', 'num', { unit: '배', min: 0, max: 2 }),
      P('practice_exp_daily', '연습 배틀: 경험치·물건 받는 판 수 (하루)', 'int', { unit: '판', min: 0, max: 100 }),
    ],
  },
  drops: {
    tab: '성장·보상', title: '물건이 나올 확률',
    fields: [
      P('drop_place', '장소 QR 찍을 때', 'pct'), P('drop_quiz', '퀴즈 정답일 때', 'pct'),
      P('drop_battle', '친구·실시간 배틀 이겼을 때', 'pct'), P('drop_practice', '연습 배틀 이겼을 때', 'pct'),
      P('drop_raid_tm', '레이드 이겼을 때 특별 기술머신 (이상한사탕은 항상)', 'pct'),
    ],
  },
  // 0039: 필드 배율 · 숨겨진 특성
  battleEnv: {
    tab: '성장·보상', title: '배틀: 필드 · 특성',
    fields: [
      P('battle_field_mult', '필드 기술 위력 배율', 'num', { min: 1, max: 3, help: '일렉트릭필드 = 전기, 그래스필드 = 풀, 사이코필드 = 에스퍼 기술 (땅에 있는 포켓몬이 쓸 때). 실제 게임 (8세대) = 1.3.' }),
      P('ability_hidden_chance', '잡을 때 숨겨진 특성이 나올 확률', 'pct', { max: 100, help: '기본 5%. 나머지는 그 포켓몬의 보통 특성 중 하나. 이미 잡은 포켓몬은 바뀌지 않아요.' }),
    ],
  },
  tickets: {
    tab: '성장·보상', title: '진화의 돌 · 룰렛',
    fields: [
      P('roulette_enabled', '진화의 돌 룰렛', 'bool'),
      P('roulette_every_min', '룰렛: 다음 판까지 기다리는 시간', 'int', { unit: '분', min: 1, max: 240 }),
      P('roulette_daily_max', '룰렛: 하루에 돌리는 횟수', 'int', { unit: '번', min: 0, max: 100 }),
      P('quiz_ticket_daily_cap', '퀴즈로 받는 진화의 돌 (하루 최대)', 'int', { unit: '개', min: 0, max: 500 }),
      P('battle_daily_max', '배틀 승리 보상 (하루 최대)', 'int', { unit: '번', min: 0, max: 999, help: '999 = 제한 없음. 같은 친구에게는 하루 한 번만 보상.' }),
    ],
  },
  // 0056 교환
  trade: {
    tab: '성장·보상', title: '포켓몬 교환',
    intro: '학생 둘이 배틀 QR로 만나 포켓몬을 1마리씩 바꿔요. 일반 폼만 (반짝이 · 선생님 · 전설 · 이벤트 · 울트라비스트 · 배틀 팀 · 카드 포켓몬은 안 됨).',
    fields: [
      P('trade_open', '교환 켜기', 'bool', { help: '끄면 새 교환방을 열 수 없고, 열려 있던 교환도 바꾸기 직전에 멈춰요.' }),
      P('trade_daily_max', '한 학생의 하루 교환 수', 'int', { unit: '번', min: 0, max: 100, help: '기본 5. 두 사람 모두 남아 있어야 교환돼요.' }),
      P('trade_room_sec', '교환방이 닫히는 시간 (아무것도 안 할 때)', 'int', { unit: '초', min: 30, max: 1800, help: '기본 180초 (3분).' }),
    ],
  },
};
const SPEC_BY_KEY = {};
for (const g of Object.values(GROUPS)) for (const f of g.fields) if (!SPEC_BY_KEY[f.key]) SPEC_BY_KEY[f.key] = f;
// 다른 탭에 전용 칸이 있는 설정 → 그 탭 이름 (고급 설정 표에서 기본으로 숨김)
const KEY_HOME = {
  festival_open: '축제 운영', self_redeem: '축제 운영', unlock_all: '축제 운영', notice: '축제 운영', prize_note: '축제 운영', festival_close_at: '축제 운영', dup_bonus_every: '축제 운영',
  raid_slots: '레이드', battle_fields: '성장·보상', minigame_unlock: '미니게임', minigame_off: '미니게임', admin_emails: '운영진', booth_emails: '운영진',
};
for (const g of Object.values(GROUPS)) for (const f of g.fields) KEY_HOME[f.key] = KEY_HOME[f.key] || g.tab;
// 더 이상 서버가 읽지 않는 설정 (지우지 않고 표시만)
const UNUSED_KEYS = ['battle_stage_mult', 'rotating_accept_minutes'];   // 0031 이 battle_stage_mult 를 지움 (예전 서버에만 남아 있을 수 있음)
const KEY_TITLE = { unlock_all: '2단계 해금을 모두에게 열기', battle_fields: '배틀 시간표 (날씨 · 필드)', notice: '공지', prize_note: '상품 안내', festival_close_at: '축제 종료 시각', dup_bonus_every: '중복 보너스', raid_slots: '시간대 전설', minigame_unlock: '미니게임이 열리는 포켓몬 수', minigame_off: '꺼 둔 미니게임' };
const keyTitle = (key) => SPEC_BY_KEY[key]?.label || KEY_TITLE[key] || key;

const pctTxt = (v) => `${+(Number(v) * 100).toFixed(2)}%`;
// 1/N 확률 (0042 반짝이): 0 = 끔
const oddsN = (v) => (Number(v) > 0 ? Math.round(1 / Number(v)) : 0);
const oddsTxt = (v) => (Number(v) > 0 ? `1/${oddsN(v).toLocaleString()} (${+(Number(v) * 100).toFixed(3)}%)` : '끔 (0)');
function fmtPart(kind, v, unit) {
  if (v == null || v === '') return '없음';
  if (kind === 'pct') return pctTxt(v);
  if (kind === 'odds') return oddsTxt(v);
  if (kind === 'bool') return isOn(v) ? '켜짐' : '꺼짐';
  return `${Number(v).toLocaleString()}${unit ? ' ' + unit : ''}`;
}
// 화면에 보여 줄 값 (기본값 안내·확인 창)
function fmtVal(key, v) {
  const sp = SPEC_BY_KEY[key];
  if (sp) {
    if (sp.kind === 'choice') return sp.options.find(([k]) => k === v)?.[1] || JSON.stringify(v);
    if (sp.kind === 'seg') return sp.options.find(([k]) => Number(k) === Number(v))?.[1] || `${v}${sp.unit ? ' ' + sp.unit : ''}`;
    if (sp.kind === 'obj') return sp.parts.map(([k, l]) => `${l} ${fmtPart(sp.partKind, v?.[k], sp.unit)}`).join(' · ');
    return fmtPart(sp.kind, v, sp.unit);
  }
  if (key === 'raid_slots' && Array.isArray(v)) return v.map((x) => `${legendName(x.line)} ${x.from}~${x.until}`).join(', ') || '없음';
  if (key === 'minigame_off' && Array.isArray(v)) return v.length ? `${v.map((id) => MG.find(([i]) => i === id)?.[1] || id).join(', ')} 꺼짐` : '모두 켜짐';
  if (key === 'festival_close_at') return v ? new Date(v).toLocaleString('ko-KR') : '없음 (자동 종료 안 함)';
  if (key === 'notice' || key === 'prize_note') return v ? `"${v}"` : '비어 있음';
  if (key === 'legend_quests' && Array.isArray(v)) return `퀘스트 ${v.length}개 (${v.map((q) => q.n ?? '-').join(' · ')})`;
  if (key === 'dup_bonus_every') return Number(v) ? `${v}번째마다` : '끔 (0)';
  if (typeof v === 'number') return v.toLocaleString();
  const s = JSON.stringify(v);
  return s.length > 90 ? s.slice(0, 88) + '…' : s;
}

// "기본값으로 되돌리기" (지금 값이 기본값이면 버튼 대신 안내만)
function resetBtn(key, cur, after = rerender) {
  if (!hasDefault(key)) return h('span.small-txt.muted.reset-note', '기본값 없음');
  const d = DEFAULTS[key];
  if (sameVal(cur, d)) return h('span.small-txt.muted.reset-note', `기본값 그대로예요 (${fmtVal(key, d)})`);
  const b = h('button.btn.small', { type: 'button' }, '기본값으로 되돌리기');
  b.onclick = async () => {
    const ok = await confirmBox('기본값으로 되돌리기', [
      h('p', h('b', keyTitle(key)), ` (${key}) 을(를) 기본값으로 바꿀까요?`),
      h('p.small-txt', `지금: ${fmtVal(key, cur)}`), h('p.small-txt', `기본값: ${fmtVal(key, d)}`),
    ], { ok: '되돌리기' });
    if (!ok) return;
    busy(b, async () => { await saveSetting(key, d); toast(`${keyTitle(key)}: 기본값으로 되돌렸어요.`); await after(); });
  };
  return h('span.reset', b, h('span.small-txt.muted', `기본값: ${fmtVal(key, d)}`));
}

// 숫자 칸 (pct 는 % 로 보여 주고 0~1 로 저장)
function numInput(kind, v, sp, label) {
  if (kind === 'odds') {
    return h('input.inp.w-num', { type: 'number', inputmode: 'numeric', step: 1, min: 0, max: 1000000, value: v == null || v === '' ? '' : oddsN(v), 'aria-label': `${label} (1/N 의 N)` });
  }
  const pct = kind === 'pct';
  const shown = v == null || v === '' ? '' : pct ? +(Number(v) * 100).toFixed(2) : v;
  return h('input.inp.w-num', {
    type: 'number', inputmode: kind === 'int' ? 'numeric' : 'decimal', step: kind === 'int' ? 1 : 'any',
    min: pct ? (sp.min ?? 0) : sp.min, max: pct ? (sp.max ?? 100) : sp.max, value: shown, 'aria-label': label,
  });
}
function readNum(inp, kind, sp) {
  const raw = inp.value.trim();
  const n = Number(raw);
  if (kind === 'odds') {
    const ok = raw !== '' && Number.isInteger(n) && n >= 0 && n <= 1000000;
    inp.classList.toggle('bad', !ok);
    if (!ok) return { ok, err: '0~1,000,000 사이 정수로 넣어 주세요 (1/N 의 N, 0 = 끔)' };
    return { ok, value: n === 0 ? 0 : 1 / n };
  }
  const pct = kind === 'pct';
  const lo = pct ? (sp.min ?? 0) : sp.min ?? -Infinity, hi = pct ? (sp.max ?? 100) : sp.max ?? Infinity;
  const ok = raw !== '' && Number.isFinite(n) && (kind !== 'int' || Number.isInteger(n)) && n >= lo && n <= hi;
  inp.classList.toggle('bad', !ok);
  if (!ok) return { ok, err: `${lo.toLocaleString()}~${hi.toLocaleString()}${pct ? '%' : ''} 사이${kind === 'int' ? ' 정수' : ' 숫자'}로 넣어 주세요` };
  return { ok, value: pct ? +(n / 100).toFixed(4) : n };
}
const unitSpan = (kind, unit) => (kind === 'pct' ? h('span.unit', '%') : kind === 'odds' ? null : unit ? h('span.unit', unit) : null);

// 설정 하나 → { el, read() }
function makeField(sp, row) {
  if (!row) return { el: h('span.warn-txt.small-txt', '서버에 아직 이 설정이 없어요 (새 마이그레이션 필요)'), read: () => ({ skip: true }) };
  const v = row.value;
  if (sp.kind === 'bool' || sp.kind === 'choice') {
    const opts = sp.kind === 'bool' ? [['true', '켜짐'], ['false', '꺼짐']] : sp.options;
    const cur = sp.kind === 'bool' ? String(isOn(v)) : v;
    const sel = h('select.inp.w-sel', { 'aria-label': sp.label }, opts.map(([k, l]) => h('option', { value: k, selected: k === cur }, l)));
    return { el: sel, read: () => ({ ok: true, value: sp.kind === 'bool' ? sel.value === 'true' : sel.value }) };
  }
  // 고르기 단추 (0037 사파리볼 충전 주기): 숫자 몇 개 중 하나
  if (sp.kind === 'seg') {
    let cur = Number(v);
    const btns = sp.options.map(([k, l]) => h('button.btn.small.seg-btn', { type: 'button', 'aria-pressed': String(Number(k) === cur) }, l));
    btns.forEach((b, i) => { b.onclick = () => { cur = Number(sp.options[i][0]); btns.forEach((x, j) => x.setAttribute('aria-pressed', String(j === i))); }; });
    return { el: h('div.seg-ctl', { role: 'group', 'aria-label': sp.label }, btns), read: () => ({ ok: true, value: cur }) };
  }
  // − 숫자 + (0037 사파리볼 개수)
  if (sp.kind === 'step') {
    const inp = numInput('int', v, sp, sp.label);
    const bump = (d) => { inp.value = Math.min(sp.max ?? Infinity, Math.max(sp.min ?? 0, (Number(inp.value) || 0) + d)); };
    return {
      el: h('span.part-in.stepper',
        h('button.btn.small', { type: 'button', 'aria-label': `${sp.label} 하나 줄이기`, onclick: () => bump(-1) }, '−'), inp,
        h('button.btn.small', { type: 'button', 'aria-label': `${sp.label} 하나 늘리기`, onclick: () => bump(1) }, '+'), unitSpan('int', sp.unit)),
      read: () => readNum(inp, 'int', sp),
    };
  }
  if (sp.kind === 'obj') {
    const ins = sp.parts.map(([k, l]) => [k, numInput(sp.partKind, v?.[k], sp, `${sp.label} ${l}`), l]);
    return {
      el: h('div.parts', ins.map(([, inp, l]) => h('label.part', h('span', l), sp.partKind === 'odds'
        ? h('span.part-in', h('span.unit', '1 /'), inp) : h('span.part-in', inp, unitSpan(sp.partKind, sp.unit))))),
      read: () => {
        const out = { ...(v && typeof v === 'object' ? v : {}) };
        for (const [k, inp, l] of ins) {
          const r = readNum(inp, sp.partKind, sp);
          if (!r.ok) return { ok: false, err: `${l}: ${r.err}` };
          out[k] = r.value;
        }
        return { ok: true, value: out };
      },
    };
  }
  const inp = numInput(sp.kind, v, sp, sp.label);
  if (sp.kind === 'odds') return { el: h('span.part-in', h('span.unit', '1 /'), inp), read: () => readNum(inp, sp.kind, sp) };
  return { el: h('span.part-in', inp, unitSpan(sp.kind, sp.unit)), read: () => readNum(inp, sp.kind, sp) };
}

// 설정 묶음 카드: 줄마다 이름·설명 | 입력 | 기본값 버튼, 맨 아래 [저장] (바뀐 것만 저장)
function settingsGroup(g, set) {
  const rows = g.fields.map((sp) => {
    const r = set[sp.key];
    const f = makeField(sp, r);
    return {
      sp, r, f,
      el: h('div.setrow',
        h('div.setlbl', h('b', sp.label), sp.help ? h('div.small-txt.muted', sp.help) : null, h('div.keyname', sp.key)),
        h('div.setctl', f.el),
        h('div.setreset', r ? resetBtn(sp.key, r.value) : null)),
    };
  });
  const save = h('button.btn.go', '저장');
  save.onclick = () => {
    const changed = [];
    let bad = null;
    for (const x of rows) {
      if (!x.r) continue;
      const v = x.f.read();
      if (!v.ok) { bad = bad || `${x.sp.label}: ${v.err}`; continue; }
      if (!sameVal(v.value, x.r.value)) changed.push([x.sp.key, v.value]);
    }
    if (bad) { toast(bad, 5000); return; }
    if (!changed.length) { toast('바뀐 값이 없어요.'); return; }
    busy(save, async () => {
      for (const [k, v] of changed) await saveSetting(k, v);
      toast(`${changed.length}개 저장했어요.`);
      rerender();
    });
  };
  return h('div.box.stack.setgroup',
    h('h2', g.title), g.intro ? h('p.small-txt', g.intro) : null,
    h('div.setrows', rows.map((x) => x.el)),
    h('div.row.end', save));
}

// ───────────────────────── 축제 운영 ─────────────────────────

async function tabOps() {
  const set = await loadSettings();
  const fo = set.festival_open;
  const open = fo ? isOn(fo.value) : false;
  const sr = set.self_redeem;
  const selfOn = sr ? isOn(sr.value) : false;
  setBanner(open, selfOn);

  const toggle = h('button.btn' + (open ? '.primary' : '.go'), open ? '게임 정지 (OFF)' : '게임 재개 (ON)');
  toggle.onclick = async () => {
    const ok = await confirmBox(open ? '게임을 정지할까요?' : '게임을 다시 시작할까요?', open
      ? ['정지하면 학생 스캔 업로드, 부스 포켓몬 지급, 진화, 시간대 레이드가 모두 멈춰요.', '문제가 생겼을 때만 쓰는 비상 스위치예요.']
      : ['다시 켜면 모든 기능이 바로 동작해요.'], { ok: open ? '정지하기' : '다시 켜기', danger: open });
    if (!ok) return;
    busy(toggle, async () => {
      await saveSetting('festival_open', !open);
      toast(open ? '게임을 정지했어요.' : '게임을 다시 켰어요.');
      rerender();
    });
  };
  const kill = h('div.box.stack',
    h('h2', '비상 스위치 (festival_open)'),
    h('div.kill', h('div.state', { class: open ? 'ok-txt' : 'warn-txt' }, open ? '● 운영 중 (ON)' : '■ 정지됨 (OFF)'), toggle),
    h('p.small-txt.muted', fo ? `마지막 변경: ${fmtTime(fo.updated_at)}` : 'festival_open 설정이 없어요.'));

  const selfBtn = h('button.btn' + (selfOn ? '.primary' : '.gold'), { disabled: !sr }, selfOn ? '셀프 지급 끄기' : '셀프 지급 켜기');
  const selfHow = [
    '켜면 학생 앱 홈의 티켓 주머니 아래에 "지금은 앱에서 바로 받기" 버튼이 생겨요.',
    '누르면 부스 확인 없이 주머니의 티켓이 포켓몬으로 바뀌고, 부스에서 받을 때와 똑같이 폰에서 몬스터볼 잡기 장면이 나와요 (볼 3개, 잘 던지면 경험치 보너스).',
    '볼 3개가 모두 빗나가면 아래 "도망칠 확률"만큼 포켓몬이 도망가요 (부스에서 받을 때도 똑같아요).',
  ];
  selfBtn.onclick = async () => {
    const ok = await confirmBox(selfOn ? '셀프 지급을 끌까요?' : '셀프 지급을 켤까요?', selfOn
      ? ['끄면 다시 부스에서만 포켓몬을 받을 수 있어요.', '학생 앱의 "앱에서 바로 받기" 버튼은 앱이 다음에 동기화할 때 사라져요.']
      : [h('p.warn-txt', '부스 줄이 너무 길 때만 쓰세요!'), ...selfHow.slice(0, 2), '부스에서 확인하지 않으니, 줄이 줄어들면 꼭 다시 꺼 주세요.'],
    { ok: selfOn ? '끄기' : '켜기', danger: !selfOn });
    if (!ok) return;
    busy(selfBtn, async () => {
      await saveSetting('self_redeem', !selfOn);
      toast(selfOn ? '셀프 지급을 껐어요.' : '셀프 지급을 켰어요. 부스가 한가해지면 꺼 주세요.');
      rerender();
    });
  };
  const selfCard = h('div.box.stack' + (selfOn ? '.self-on' : ''),
    h('h2', '셀프 지급 모드 (self_redeem)'),
    h('p.small-txt', h('b', '부스가 너무 밀릴 때만: 학생이 앱에서 직접 포켓몬 받기')),
    h('div.kill', h('div.state', { class: selfOn ? 'warn-txt' : 'muted' }, selfOn ? '● 켜짐 (학생 직접 받기)' : '○ 꺼짐 (부스에서만)'), selfBtn),
    h('ul.small-txt', selfHow.map((t) => h('li', t))),
    h('p.small-txt.muted', sr ? `마지막 변경: ${fmtTime(sr.updated_at)}` : 'self_redeem 설정이 없어요 (마이그레이션 0003 필요).'));

  return [h('div.cols', kill, selfCard),
    await unlockCard(set),
    h('div.cols',
      h('div', textSettingCard(set.notice, 'notice', '공지 (notice)', '모든 폰 상단에 1분 안에 표시돼요. 예: "13:00 본관 앞 전설 출현!" 비우면 공지가 사라져요.', 2),
        textSettingCard(set.prize_note, 'prize_note', '상품 안내 (prize_note)', '축제가 끝난 뒤 학생 폰의 "축제 종료" 화면에 보여요. 예: 상품 받는 곳·시간.', 3)),
      h('div', closeAtCard(set.festival_close_at), dupBonusCard(set.dup_bonus_every), settingsGroup(GROUPS.opsCatch, set), catchRatesCard(set), settingsGroup(GROUPS.wild, set)))];
}

// 0055 잡기 확률 (원 색깔별) + 미리보기 표 (입력을 바꾸면 바로 다시 셈): 등급 배수 · 최대 · 튕겨냄
const GRADE_COLS = [['그냥', 1], ['나이스', 1.2], ['그레이트', 1.5], ['엑설런트', 2], ['엑설런트+커브', 2.6]];
function catchRatesCard(set) {
  if (!set.catch_rate_tier || !set.catch_rate_max) return missingCard('catch_rate_tier', '잡기 확률 (원 색깔별) (마이그레이션 0055 필요)');
  const g = settingsGroup(GROUPS.catchRates, set);
  const L = (key) => SPEC_BY_KEY[key].label;
  const val = (key, k, i) => {
    const inp = g.querySelector(`input[aria-label="${L(key)} ${CATCH_TIERS[i][1]}"]`);
    const n = Number(inp?.value); return inp && inp.value !== '' && Number.isFinite(n) ? n / 100 : Number(set[key]?.value?.[k]) || 0;
  };
  const bonus = Number(set.legend_win_catch_bonus?.value) || 1.5;
  const body = h('tbody');
  const pc = (v) => `${Math.round(v * 100)}%`;
  const draw = () => {
    body.replaceChildren(...CATCH_TIERS.map(([k, l], i) => {
      const b = Math.min(1, Math.max(0, val('catch_rate_tier', k, i))); const mx = Math.max(b, Math.min(1, val('catch_rate_max', k, i)));
      return h('tr', h('th', h(`span.tier-dot.t-${k}`), l),
        ...GRADE_COLS.map(([, m]) => h('td', pc(Math.min(mx, b * m)))), h('td.muted', pc(1 - b)),
        i === 3 ? h('td', pc(Math.min(mx, b * bonus))) : h('td.muted', '—'));
    }));
  };
  draw();
  g.addEventListener('input', draw);
  const table = h('div.table-scroll', h('table.tbl.rate-preview', h('thead', h('tr', h('th', '원'), ...GRADE_COLS.map(([t]) => h('th', t)), h('th', '튕겨냄'), h('th', '전설 배틀 이긴 뒤'))), body));
  g.insertBefore(h('div.stack', h('b', '미리보기: 한 번 맞혔을 때 잡힐 확률'), table,
    h('p.small-txt.muted', `튕겨냄 = 그냥 맞혔을 때 공에서 튕겨 나올 확률. 전설 배틀을 이기면 빨강 원에 ×${bonus} (전설·소포 탭). 저장 전에도 숫자를 바꾸면 표가 바로 바뀌어요.`)), g.lastChild);
  return g;
}

// 0055 전설 배틀 강하기 + AI 끼리 시험 (운영자가 숫자를 바꾼 뒤 얼마나 어려운지 보기)
function legendBattleCard(set) {
  if (!set.legend_boss_level) return missingCard('legend_boss_level', '전설 배틀 강하기 (마이그레이션 0055 필요)');
  const g = settingsGroup(GROUPS.legendBattle, set);
  const dex = h('input.inp.w-num', { type: 'number', min: 1, max: 1000, value: 150, 'aria-label': '시험할 전설 전국도감 번호' });
  const lv = h('input.inp.w-num', { type: 'number', min: 1, max: 100, value: 45, 'aria-label': '시험 팀 레벨' });
  const out = h('p.small-txt', '');
  const run = h('button.btn.small', { type: 'button' }, 'AI 끼리 10판 시험');
  run.onclick = () => busy(run, async () => {
    out.textContent = '시험 중… (10초쯤)';
    // 시험 팀: 흔한 3단계 포켓몬 6마리 (리자몽 · 거북왕 · 이상해꽃 · 피죤투 · 괴력몬 · 후딘) — 저장한 숫자로
    const team = LB_TEAM.map((d) => ({ sp: spByDex(d)?.id ?? d, lv: Math.max(1, Math.min(100, Number(lv.value) || 45)) }));
    try {
      const r = await rpc('admin_legend_sim', { p_dex: Number(dex.value) || 150, p_team: team, p_n: 10 });
      out.textContent = `${r.boss?.name || '전설'} Lv.${r.boss?.lv} · 체력 ${r.boss?.max} → 팀 Lv.${lv.value} 6마리가 ${r.n}판 중 ${r.wins}판 이김 (평균 ${r.turns}턴). 학생은 AI 보다 기술을 잘 골라서 실제로는 조금 더 잘 이겨요.`;
    } catch (e) { out.textContent = errorText(e.message); }
  });
  g.insertBefore(h('div.stack', h('b', '얼마나 어려운지 시험 (저장한 숫자로)'),
    h('div.row.wrap', h('label', '전설 도감 번호 ', dex), h('label', '팀 레벨 ', lv), run), out), g.lastChild);
  return g;
}
const LB_TEAM = [6, 9, 3, 18, 68, 65];   // 전국도감 번호 → 일반 폼 (spByDex)

// 0051 해금 단계: 1단계 (미니게임) · 2단계 (학교 도감 % → 사파리존 · 장소 QR 야생 · 전체 도감) · 모두에게 열기 스위치 · 몇 명이 열었나
async function unlockCard(set) {
  const ua = set.unlock_all;
  if (!ua || !set.unlock_safari_pct) return missingCard('unlock_all', '해금 단계 (마이그레이션 0051 필요)');
  const allOn = isOn(ua.value);
  const st = await rpc('admin_unlock_stats').catch(() => null);
  const allBtn = h('button.btn' + (allOn ? '.primary' : '.gold'), allOn ? '모두에게 열기 끄기' : '모두에게 열기');
  allBtn.onclick = async () => {
    const ok = await confirmBox(allOn ? '모두에게 열기를 끌까요?' : '2단계를 모두에게 열까요?', allOn
      ? ['끄면 학교 도감을 아직 덜 모은 학생은 다시 잠겨요 (사파리존 · 장소 QR 야생 포켓몬 · 전체 도감).', '이미 스스로 모아서 연 학생은 그대로 열려 있어요.', '하던 사파리 잡기는 끝낼 수 있어요.']
      : ['모은 수와 상관없이 모든 학생에게 사파리존 · 장소 QR 야생 포켓몬 · 전체 도감이 열려요 (앱이 다음에 동기화할 때, 1분 안에).', '예: 오후부터 모두 즐기게 할 때.', '사파리존 열기 (야생 포켓몬 카드) 가 꺼져 있으면 사파리존은 여전히 닫혀 있어요.'],
    { ok: allOn ? '끄기' : '모두에게 열기', danger: false });
    if (!ok) return;
    busy(allBtn, async () => { await saveSetting('unlock_all', !allOn); toast(allOn ? '모두에게 열기를 껐어요.' : '2단계를 모두에게 열었어요.'); rerender(); });
  };
  const nums = settingsGroup(GROUPS.unlock, set);
  return h('div.box.stack' + (allOn ? '.self-on' : ''),
    h('h2', '해금 단계'),
    h('ul.small-txt',
      h('li', h('b', '늘 열림: '), 'QR 찍기 · 선생님 포켓몬 · 퀴즈 · 레이드 · 배틀 · 룰렛 · 부스'),
      h('li', h('b', '1단계: '), `포켓몬 ${st?.minigame ?? '?'}종류를 모으면 미니게임`),
      h('li', h('b', '2단계: '), `학교 도감의 ${st?.pct ?? '?'}% (${st?.need ?? '?'} / ${st?.total ?? '?'}칸) 를 모으면 사파리존 · 장소 QR에서 야생 포켓몬 · 전체 도감. 그 전에는 장소 QR이 선생님 포켓몬만 줘요.`)),
    st ? h('p', chip(`2단계를 연 학생 ${st.unlocked} / ${st.students}명`, 'blue'), allOn ? ' ' : null, allOn ? chip('지금은 모두에게 열림', 'hot') : null) : h('p.small-txt.warn-txt', '통계를 불러오지 못했어요.'),
    h('div.kill', h('div.state', { class: allOn ? 'warn-txt' : 'muted' }, allOn ? '● 모두에게 열림' : '○ 모은 학생만 열림'), allBtn),
    h('p.small-txt.muted', '모두에게 열기를 켜도 [야생 포켓몬] 카드의 "사파리존 열기" 가 꺼져 있으면 아무도 사파리존에 못 들어가요. ', changedTxt(ua)),
    nums);
}

const missingCard = (key, title) => h('div.box.stack', h('h2', title), h('p.warn-txt', `${key} 설정이 없어요 (마이그레이션 0005 필요).`));
const changedTxt = (r) => h('p.small-txt.muted', `마지막 변경: ${fmtTime(r.updated_at)}`);

function textSettingCard(r, key, title, help, rows) {
  if (!r) return missingCard(key, title);
  const cur = typeof r.value === 'string' ? r.value : '';
  const ta = h('textarea.inp', { rows, maxlength: 200, 'aria-label': title }, cur);
  const state = h('p.small-txt', cur ? chip('표시 중', 'ok') : chip('비어 있음', 'off'));
  const save = h('button.btn.go', '저장');
  const clear = h('button.btn', '비우기');
  save.onclick = () => busy(save, async () => {
    const v = ta.value.trim();
    await saveSetting(key, v || null);
    toast(v ? `${key} 저장했어요.` : `${key}를 비웠어요.`);
    rerender();
  });
  clear.onclick = () => busy(clear, async () => {
    await saveSetting(key, null);
    toast(`${key}를 비웠어요.`);
    rerender();
  });
  return h('div.box.stack', h('h2', title), h('p.small-txt', help), state, ta, h('div.row.end', clear, save),
    h('div.row', resetBtn(key, r.value)), changedTxt(r));
}

// festival_close_at: datetime-local (KST) ↔ "YYYY-MM-DDTHH:MM:00+09:00"
const KST = 9 * 3600_000;
const isoToKstInput = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(Date.parse(iso) + KST).toISOString().slice(0, 16) : '');
const kstInputToIso = (v) => (v ? `${v}:00+09:00` : null);

function closeAtCard(r) {
  if (!r) return missingCard('festival_close_at', '축제 종료 시각');
  const iso = typeof r.value === 'string' ? r.value : null;
  const ended = iso && Date.parse(iso) < Date.now();
  const inp = h('input.inp', { type: 'datetime-local', value: isoToKstInput(iso), 'aria-label': '축제 종료 시각 (한국 시간)' });
  const save = h('button.btn.go', '저장');
  const clear = h('button.btn', '비우기');
  save.onclick = async () => {
    if (!inp.value) { toast('시각을 고르세요. 종료 시각을 없애려면 [비우기].'); return; }
    const v = kstInputToIso(inp.value);
    if (Date.parse(v) < Date.now() && !(await confirmBox('이미 지난 시각이에요', [`${inp.value.replace('T', ' ')}(한국 시간)는 이미 지났어요.`, h('p.warn-txt', '저장하면 지금 바로 스캔·부스·퀴즈·진화가 멈추고 모든 폰에 종료 화면이 떠요.')], { ok: '그래도 저장', danger: true }))) return;
    busy(save, async () => { await saveSetting(r.key, v); toast('축제 종료 시각을 저장했어요.'); rerender(); });
  };
  clear.onclick = async () => {
    if (!(await confirmBox('종료 시각 비우기', ['자동 종료가 없어져요. 게임은 비상 스위치로만 멈춰요.'], { ok: '비우기' }))) return;
    busy(clear, async () => { await saveSetting(r.key, null); toast('종료 시각을 비웠어요.'); rerender(); });
  };
  return h('div.box.stack',
    h('h2', '축제 종료 시각 (festival_close_at)'),
    h('p.small-txt', '이 시각이 지나면 스캔·부스 지급·퀴즈·진화가 자동으로 멈추고, 학생 폰에는 "축제 종료" 화면(상품 안내)이 떠요.'),
    h('p.small-txt', iso ? h('span', ended ? chip('종료됨', 'hot') : chip('예정', 'blue'), ` ${new Date(iso).toLocaleString('ko-KR')}`) : chip('설정 안 됨 (자동 종료 없음)', 'off')),
    field('종료 시각 (한국 시간)', inp),
    h('div.row.end', clear, save), h('div.row', resetBtn(r.key, r.value)), changedTxt(r));
}

function dupBonusCard(r) {
  if (!r) return missingCard('dup_bonus_every', '중복 보너스');
  const inp = h('input.inp.w-num', { type: 'number', min: 0, step: 1, value: Number(r.value) || 0, 'aria-label': 'N' });
  const save = h('button.btn.go', '저장');
  save.onclick = () => {
    const n = Number(inp.value);
    if (!(Number.isInteger(n) && n >= 0)) { toast('0 이상의 정수를 넣으세요 (0 = 끔).'); inp.classList.add('bad'); return; }
    busy(save, async () => { await saveSetting(r.key, n); toast(n ? `같은 쌤 ${n}번째마다 진화의 돌 +1` : '중복 보너스를 껐어요.'); rerender(); });
  };
  return h('div.box.stack',
    h('h2', '중복 보너스 (dup_bonus_every)'),
    h('p.small-txt', '같은 쌤 포켓몬을 N번째로 또 잡을 때마다 진화의 돌 +1. 0 = 끔.'),
    h('div.row', '같은 쌤', inp, '번째 중복마다 진화의 돌 +1', h('span', { style: { flex: 1 } }), save),
    h('div.row', resetBtn(r.key, r.value)), changedTxt(r));
}

// ───────────────────────── 레이드: 보상 방식 · 시간대 전설 편집 ─────────────────────────

const legendLines = () => S.lines.filter((l) => l.rarity === 'legendary' && !l.secret);
const legendDex = (line) => firstSp(S.lineById.get(Number(line)))?.id ?? (Number(line) - 1) * 3 + 1;
const legendName = (line) => S.spById.get(legendDex(line))?.name || `#${line}`;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const kstNowHHMM = () => new Date(Date.now() + KST).toISOString().slice(11, 16);

function raidRewardBox(set) {
  const mode = set.raid_reward_mode?.value === 'catch' ? 'catch' : 'ticket';
  const g = settingsGroup(GROUPS.raidReward, set);
  g.insertBefore(h('div.stack.small-txt',
    h('p', '지금: ', set.raid_reward_mode ? chip(mode === 'catch' ? '앱에서 바로 잡기' : '특별 티켓', 'blue') : chip('서버에 설정 없음 → 특별 티켓', 'off')),
    h('ul',
      h('li', h('b', '특별 티켓'), ' — 이긴 학생(최소 탭 수 이상 공격)의 티켓 주머니에 보스 특별 티켓이 들어가요. 부스(또는 셀프 지급)에서 포켓몬으로 바꿀 때 잡기 장면이 나와요. 주머니 칸 제한·만료 없음.'),
      h('li', h('b', '앱에서 바로 잡기'), ' — 레이드에서 이기면 학생 폰에 바로 잡기 장면이 떠요. HAFS 볼을 아래 개수만큼 던져서 잡아요. 부스에 안 가도 돼요.'),
      h('li', '바꾸면 ', h('b', '앞으로 끝나는 레이드부터'), ' 적용돼요. 이미 받은 티켓은 그대로예요.'))),
  g.querySelector('.setrows'));
  return g;
}

function slotEditor(set) {
  const r = set.raid_slots;
  if (!r) return h('div.box', h('h2', '시간대 전설'), h('p.warn-txt', 'raid_slots 설정이 없어요.'));
  const legends = legendLines();
  let rows = (Array.isArray(r.value) ? r.value : []).map((x) => ({ line: Number(x.line), from: String(x.from || ''), until: String(x.until || '') }));
  const box = h('div.box.stack.slot-box');
  const msg = h('div.slot-msg', { role: 'alert' });
  const dirty = h('span.small-txt');
  const tbody = h('tbody');

  const validate = () => {
    const errs = [];
    const bad = new Set();
    rows.forEach((x, i) => {
      const n = i + 1;
      if (!S.lineById.has(x.line)) { errs.push(`${n}번째 줄: 전설을 고르세요.`); bad.add(i); }
      if (!HHMM.test(x.from) || !HHMM.test(x.until)) { errs.push(`${n}번째 줄: 시각은 "09:00"처럼 HH:MM으로 넣어 주세요.`); bad.add(i); return; }
      if (x.from >= x.until) { errs.push(`${n}번째 줄: 끝 시각(${x.until})이 시작(${x.from})보다 늦어야 해요. 자정을 넘길 수는 없어요 → 두 줄로 나누세요.`); bad.add(i); }
    });
    rows.forEach((a, i) => rows.forEach((b, j) => {
      if (j <= i || a.line !== b.line || !HHMM.test(a.from) || !HHMM.test(b.from) || !HHMM.test(a.until) || !HHMM.test(b.until)) return;
      if (a.from < b.until && b.from < a.until) { errs.push(`${i + 1}·${j + 1}번째 줄: 같은 전설(${legendName(a.line)})의 시간이 겹쳐요.`); bad.add(i); bad.add(j); }
    }));
    [...tbody.children].forEach((tr, i) => tr.classList.toggle('bad', bad.has(i)));
    msg.replaceChildren(...errs.map((t) => h('p.warn-txt.small-txt', t)));
    dirty.replaceChildren(sameVal(rows, r.value) ? '' : chip('저장 안 한 변경이 있어요', 'warn'));
    return errs;
  };

  const draw = () => {
    const now = kstNowHHMM();
    tbody.replaceChildren(...rows.map((x, i) => {
      const pic = h('span.slot-pic', spriteImg(legendDex(x.line), 40));
      const sel = h('select.inp', { 'aria-label': `${i + 1}번째 줄 전설` },
        legends.some((l) => l.id === x.line) ? null : h('option', { value: x.line, selected: true }, `#${x.line} (전설 아님)`),
        legends.map((l) => h('option', { value: l.id, selected: l.id === x.line }, `${legendName(l.id)} · ${l.teacher}`)));
      sel.onchange = () => { x.line = Number(sel.value); pic.replaceChildren(spriteImg(legendDex(x.line), 40)); validate(); };
      const tIn = (k) => {
        const inp = h('input.inp.w-time', { type: 'time', step: 60, value: x[k], 'aria-label': `${i + 1}번째 줄 ${k === 'from' ? '시작' : '끝'} 시각` });
        inp.oninput = () => { x[k] = inp.value; validate(); };
        return inp;
      };
      const live = HHMM.test(x.from) && HHMM.test(x.until) && x.from <= now && now < x.until;
      return h('tr',
        h('td', pic),
        h('td', sel),
        h('td', tIn('from')), h('td', tIn('until')),
        h('td', live ? chip('지금 시간대', 'ok') : null),
        h('td', h('button.btn.small', { type: 'button', onclick: () => { rows.splice(i, 1); draw(); } }, '빼기')));
    }));
    validate();
  };
  const add = h('button.btn.small', { type: 'button' }, '+ 시간대 추가');
  add.onclick = () => {
    const used = new Set(rows.map((x) => x.line));
    const l = legends.find((x) => !used.has(x.id)) || legends[0];
    rows.push({ line: l?.id ?? 38, from: '12:00', until: '13:00' });
    draw();
  };
  const save = h('button.btn.go', '시간대 저장');
  save.onclick = () => {
    const errs = validate();
    if (errs.length) { toast(errs[0], 5000); return; }
    busy(save, async () => {
      const v = rows.slice().sort((a, b) => a.from.localeCompare(b.from) || a.line - b.line).map(({ line, from, until }) => ({ line, from, until }));
      await saveSetting('raid_slots', v);
      toast(`시간대 전설 ${v.length}개를 저장했어요.`);
      rerender();
    });
  };
  draw();
  box.append(
    h('h2', '⏰ 시간대 전설 (raid_slots)'),
    h('details.how', { open: true }, h('summary', '시간대 전설은 이렇게 열려요 (꼭 읽기)'),
      h('ul.small-txt',
        h('li', '정해 둔 시간(한국 시간) 안에 ', h('b', 'TV 화면(screen.html)이 켜져 있으면'), ', TV가 3초마다 서버에 물어볼 때 그 전설 레이드를 저절로 열어요.'),
        h('li.warn-txt', 'TV 화면이 꺼져 있으면 열리지 않아요. 운영자 페이지나 학생 앱만 켜 둬서는 안 열려요. TV 화면은 운영자·부스 스태프 계정으로 로그인해 둬야 해요.'),
        h('li', '한 판 = "한 판 길이"(아래 숫자 카드, 기본 10분) 또는 시간대 끝 시각 중 먼저 오는 때까지. 끝나면 "다음 판까지" 분만큼 쉬고, 아직 시간대 안이면 또 열려요.'),
        h('li', '게임 정지(비상 스위치 OFF) 중에는 열리지 않아요. 자정을 넘는 시간대(예: 23:00~01:00)는 안 돼요 → 두 줄로 나누세요.'),
        h('li', '"QR 없이 앱에서 참가"가 켜져 있으면 학생 앱 레이드 탭에서 바로 참가하고, 꺼져 있으면 TV 앞에서 QR을 찍어야 참가해요.'),
        h('li', '같은 전설이 겹치는 시간은 안 돼요. 다른 전설끼리는 겹쳐도 돼요 (두 레이드가 같이 열려요).'))),
    h('p.small-txt.muted', `지금 한국 시간 ${kstNowHHMM()} · 시간대 ${rows.length}개`),
    h('div.tbl-wrap', h('table.tbl.slot-tbl',
      h('thead', h('tr', h('th', ''), h('th', '전설'), h('th', '시작'), h('th', '끝'), h('th', '지금'), h('th', ''))), tbody)),
    msg,
    h('div.row', add, dirty, h('span', { style: { flex: 1 } }), save),
    h('div.row', resetBtn('raid_slots', r.value)),
    changedTxt(r));
  return box;
}

// ───────────────────────── 성장·보상 ─────────────────────────

// 배틀 시간표 (0039): 시간대마다 날씨 · 필드 하나 (실제 포켓몬 효과). 그 시간에 시작한 배틀 내내 바탕으로 깔림
const ENV_OPTS = [['', '없음 (보통 배틀)'], ['sun', '쾌청 — 불꽃 ×1.5 · 물 ×0.5'], ['rain', '비 — 물 ×1.5 · 불꽃 ×0.5'],
  ['sand', '모래바람 — 바위 특방 ×1.5 · 매 턴 1/16 (바위·땅·강철 빼고)'], ['hail', '싸라기눈 — 매 턴 1/16 (얼음 빼고)'],
  ['electric', '일렉트릭필드 — 전기 기술 강해짐 · 잠들지 않음'], ['grassy', '그래스필드 — 풀 기술 강해짐 · 매 턴 1/16 회복'],
  ['misty', '미스트필드 — 드래곤 기술 ×0.5 · 상태 이상 안 걸림'], ['psychic', '사이코필드 — 에스퍼 기술 강해짐 · 선공기 막음']];
function fieldEditor(set) {
  const r = set.battle_fields;
  if (!r) return h('div.box', h('h2', '배틀 시간표'), h('p.warn-txt', 'battle_fields 설정이 없어요.'));
  let rows = (Array.isArray(r.value) ? r.value : []).map((x) => ({ from: String(x.from || ''), to: String(x.to || ''), name: String(x.name || ''), env: x.env || '' }));
  const box = h('div.box.stack.slot-box');
  const msg = h('div.slot-msg', { role: 'alert' });
  const dirty = h('span.small-txt');
  const tbody = h('tbody');
  const validate = () => {
    const errs = []; const bad = new Set();
    rows.forEach((x, i) => {
      if (!x.name.trim()) { errs.push(`${i + 1}번째 줄: 이름을 넣어 주세요.`); bad.add(i); }
      if (!HHMM.test(x.from) || !HHMM.test(x.to)) { errs.push(`${i + 1}번째 줄: 시각은 "08:00"처럼 HH:MM으로 넣어 주세요.`); bad.add(i); return; }
      if (x.from >= x.to) { errs.push(`${i + 1}번째 줄: 끝 시각이 시작보다 늦어야 해요 (자정을 넘으면 두 줄로).`); bad.add(i); }
    });
    rows.forEach((a, i) => rows.forEach((b, j) => {
      if (j > i && HHMM.test(a.from) && HHMM.test(b.from) && a.from < b.to && b.from < a.to) { errs.push(`${i + 1}·${j + 1}번째 줄: 시간이 겹쳐요.`); bad.add(i); bad.add(j); }
    }));
    [...tbody.children].forEach((tr, i) => tr.classList.toggle('bad', bad.has(i)));
    msg.replaceChildren(...errs.map((t) => h('p.warn-txt.small-txt', t)));
    dirty.replaceChildren(sameVal(rows, r.value) ? '' : chip('저장 안 한 변경이 있어요', 'warn'));
    return errs;
  };
  const draw = () => {
    const now = kstNowHHMM();
    tbody.replaceChildren(...rows.map((x, i) => {
      const nm = h('input.inp', { value: x.name, maxlength: 20, 'aria-label': `${i + 1}번째 줄 이름` });
      nm.oninput = () => { x.name = nm.value; validate(); };
      const tIn = (k) => {
        const inp = h('input.inp.w-time', { type: 'time', step: 60, value: x[k], 'aria-label': `${i + 1}번째 줄 ${k === 'from' ? '시작' : '끝'} 시각` });
        inp.oninput = () => { x[k] = inp.value; validate(); };
        return inp;
      };
      const sel = h('select.inp', { 'aria-label': `${i + 1}번째 줄 날씨·필드` }, ENV_OPTS.map(([v, t]) => h('option', { value: v, selected: v === x.env }, t)));
      sel.onchange = () => { x.env = sel.value; validate(); };
      const live = HHMM.test(x.from) && HHMM.test(x.to) && x.from <= now && now < x.to;
      return h('tr', h('td', nm), h('td', tIn('from')), h('td', tIn('to')), h('td', sel), h('td', live ? chip('지금', 'ok') : null),
        h('td', h('button.btn.small', { type: 'button', onclick: () => { rows.splice(i, 1); draw(); } }, '빼기')));
    }));
    validate();
  };
  const add = h('button.btn.small', { type: 'button', onclick: () => { rows.push({ from: '23:00', to: '23:59', name: '새 시간', env: '' }); draw(); } }, '+ 시간대 추가');
  const save = h('button.btn.go', '시간표 저장');
  save.onclick = () => {
    const errs = validate();
    if (errs.length) { toast(errs[0], 5000); return; }
    busy(save, async () => {
      const v = rows.slice().sort((a, b) => a.from.localeCompare(b.from))
        .map(({ from, to, name, env }) => (env ? { from, to, name: name.trim(), env } : { from, to, name: name.trim() }));
      await saveSetting('battle_fields', v);
      toast(`배틀 시간표 ${v.length}칸을 저장했어요.`);
      rerender();
    });
  };
  draw();
  box.append(
    h('h2', '배틀 시간표 (날씨 · 필드)'),
    h('p.small-txt', '그 시간(한국 시간)에 시작한 배틀은 내내 이 날씨·필드예요 (실제 포켓몬 효과). 특성(가뭄·잔비 …)이나 날씨 기술로 5턴 동안 바뀔 수 있고, 끝나면 이 날씨로 돌아와요. 이미 시작한 배틀은 바뀌지 않아요.'),
    h('p.small-txt.muted', `지금 한국 시간 ${kstNowHHMM()} · 시간대 ${rows.length}개`),
    h('div.tbl-wrap', h('table.tbl.slot-tbl',
      h('thead', h('tr', h('th', '이름'), h('th', '시작'), h('th', '끝'), h('th', '날씨 · 필드'), h('th', '지금'), h('th', ''))), tbody)),
    msg,
    h('div.row', add, dirty, h('span', { style: { flex: 1 } }), save),
    h('div.row', resetBtn('battle_fields', r.value)),
    changedTxt(r));
  return box;
}

async function tabGrow() {
  const set = await loadSettings();
  return [
    h('div.cols.wide-left', fieldEditor(set), settingsGroup(GROUPS.battleEnv, set)),
    h('div.cols', h('div', settingsGroup(GROUPS.eggs, set), settingsGroup(GROUPS.shiny, set)), h('div', settingsGroup(GROUPS.catchExp, set), settingsGroup(GROUPS.tickets, set))),
    h('div.cols', h('div', settingsGroup(GROUPS.level, set)), h('div', settingsGroup(GROUPS.drops, set),
      h('div.box.small-txt.muted', '진화 확률·점수·룰렛 칸 확률 같은 나머지 숫자는 [고급 설정] 탭에 있어요.'))),
    h('div.cols', h('div', settingsGroup(GROUPS.trade, set)), h('div', tradeCard())),   // 0056
    branchCard(),   // 0058
  ];
}

// 0058: 진화 갈래 — 갈래 가족마다 나무 (진화 전 ▶ 갈래들), 갈래마다 무게 칸 · 지금 확률. 무게는 같은 진화의 모든 폼 (선생님 · 일반) 에 함께 적용
function branchCard() {
  const body = h('div.br-tree', h('p.small-txt.muted', '불러오는 중…'));
  const save = h('button.btn.go', { disabled: true }, '저장');
  let rows = [];   // { f, b, inp, pct }
  const howText = (b) => (b.how === 'item' ? '진화의 돌' : `Lv.${b.lv}`);
  const famCond = (f) => (f.from.item_only ? [h('small.muted', '진화의 돌로만')] : [h('small.muted', `Lv.${f.from.min_lv}에 진화`), h('small.muted', '그 전엔 진화의 돌')]);
  const okW = (v) => v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100;
  const dirty = () => { save.disabled = !rows.some((x) => okW(x.inp.value) && Number(x.inp.value) !== Number(x.b.weight)); };
  const recalc = (f) => {
    const mine = rows.filter((x) => x.f === f);
    const good = mine.every((x) => okW(x.inp.value));
    const tot = good ? mine.reduce((a, x) => a + Number(x.inp.value), 0) : 0;
    for (const x of mine) {
      x.inp.classList.toggle('bad', !okW(x.inp.value));
      const v = !good ? null : tot > 0 ? Number(x.inp.value) / tot * 100 : 100 / mine.length;
      x.pct.textContent = v == null ? '—' : `${Math.round(v * 10) / 10}%`;
      x.pct.classList.toggle('zero', v === 0);
    }
    dirty();
  };
  const load = async () => {
    try { await Promise.all([S.species?.length ? null : loadCatalog(), spritesReady]); } catch { /* 이름 · 그림 없이 */ }
    let tree;
    try { tree = await rpc('admin_branch_tree'); } catch (e) { body.replaceChildren(h('p.warn-txt', errorText(e.message))); return; }
    rows = [];
    body.replaceChildren(...(tree || []).map((f) => h('div.br-fam',
      h('div.br-from', spriteImg(f.from.sp, 48), h('b', f.from.name), ...famCond(f),
        f.from.legend ? h('small.muted', '전설: 가진 모습은 빼고') : null),
      h('span.br-arrow', { 'aria-hidden': 'true' }, '▶'),
      h('div.br-list', f.branches.map((b) => {
        const inp = h('input.inp.br-w', { type: 'number', min: 0, max: 100, step: 'any', inputmode: 'decimal', value: b.weight, 'aria-label': `${f.from.name} → ${b.name} 숫자` });
        const pct = h('b.br-pct');
        rows.push({ f, b, inp, pct });
        inp.addEventListener('input', () => recalc(f));
        return h('div.br-row', spriteImg(b.sp, 40), h('span.br-name', h('b', b.name), h('small.muted', howText(b))), inp, pct);
      })))));
    for (const f of tree || []) recalc(f);
    save.disabled = true;
  };
  save.onclick = () => {
    const bad = rows.find((x) => !okW(x.inp.value));
    if (bad) { toast('숫자는 0~100 사이로 넣어 주세요.'); bad.inp.focus(); return; }
    const ch = rows.filter((x) => Number(x.inp.value) !== Number(x.b.weight));
    busy(save, async () => {
      for (const x of ch) await rpc('admin_set_branch_weight', { p_from: x.f.from.sp, p_to: x.b.sp, p_weight: Number(x.inp.value) });
      toast(`진화 갈래 ${ch.length}개를 저장했어요.`);
      await load();
    });
  };
  load();
  return h('div.box.stack.setgroup.br-card', h('h2', '진화 갈래'),
    h('p.small-txt', '숫자가 클수록 그 진화형이 잘 나와요. 0 = 안 나옴. 모두 같으면 같은 확률'),
    h('p.small-txt.muted', '진화 레벨이 되면 (가장 낮은 레벨 조건) 진화의 돌 없이, 그 전에는 진화의 돌로 진화해요. 어느 쪽이든 모든 갈래 중에서 이 숫자대로 뽑아요. 선생님 폼도 같은 숫자를 써요.'),
    body, h('div.row.end', save));
}

// 0056: 최근 교환 (누가 · 무엇을 · 언제)
const TRADE_ST = { done: '교환함', open: '진행 중', cancelled: '그만둠', expired: '시간 지남' };
function tradeCard() {
  const body = h('div', h('p.small-txt.muted', '불러오는 중…'));
  const reload = h('button.btn', '새로 고침');
  const load = async () => {
    if (!S.species?.length) { try { await loadCatalog(); } catch { /* 이름 없이 */ } }
    let r;
    try { r = await rpc('admin_trades', { p_limit: 40 }); } catch (e) { body.replaceChildren(h('p.warn-txt', errorText(e.message))); return; }
    const nm = (id) => (id == null ? '—' : S.spById?.get(id)?.name || `#${id}`);
    const rows = r.rows || [];
    body.replaceChildren(
      h('p.small-txt', `오늘 교환 ${r.today}번 · 지금 열린 교환방 ${r.open}개`),
      rows.length ? h('div.tbl-wrap', h('table.tbl',
        h('thead', h('tr', h('th', '언제'), h('th', '학생 A → B'), h('th', 'A가 보냄'), h('th', 'B가 보냄'), h('th', '상태'))),
        h('tbody', rows.map((x) => h('tr',
          h('td', timeAgo(x.at)),
          h('td', `${x.a_name} (${x.a_sid || '-'}) ↔ ${x.b_name} (${x.b_sid || '-'})`),
          h('td', nm(x.sp1), x.evo1 ? ` → ${nm(x.evo1)}` : ''),
          h('td', nm(x.sp2), x.evo2 ? ` → ${nm(x.evo2)}` : ''),
          h('td', TRADE_ST[x.status] || x.status)))))) : h('p.small-txt.muted', '아직 교환이 없어요.'));
  };
  reload.onclick = load;
  load();
  return h('div.box.stack', h('div.row', h('b', '최근 교환'), h('span', { style: { flex: 1 } }), reload), body,
    h('p.small-txt.muted', '교환 기록은 events 표 (kind = trade) 에도 남아요.'));
}

// ───────────────────────── 전설 · 이상한 소포 (0038) ─────────────────────────
const QUEST_KIND = {
  quiz_streak: ['퀴즈 연속 정답', '번'], battle_wins: ['배틀 승리', '번'], catches: ['포켓몬 잡기', '마리'], raid_slots: ['서로 다른 시간대 레이드 참가', '번'],
  qr_all: ['지도의 장소 QR 모두 찍기', null], type_catch: ['타입 포켓몬 잡기', '마리'], safari_catches: ['사파리존에서 잡기', '마리'], caught_all: ['앞의 전설 모두 잡기', null],
  zone_catch: ['사파리존 그 구역에서 잡기', '마리'],   // 0050
};
const ZONE_KO = { dragon: '용의 굴', ultra: '울트라 스페이스', desert: '사막', plant: '발전소', lava: '용암 지대', snow: '설원', beach: '해변', cave: '동굴', deep: '깊은 동굴' };
const spByDex = (d) => { const all = S.species.filter((x) => x.dex === Number(d)); const L = (x) => S.lineById.get(x.line_id);   // 0052: 일반 폼 (가족 대표) 먼저 = 서버 _dex_sp
  return all.find((x) => formKindOf(L(x)) === 'normal' && famOf(L(x)) === x.line_id) || all.find((x) => formKindOf(L(x)) === 'normal') || all[0]; };

async function tabLegend() {
  if (!S.species?.length) await loadCatalog();
  const set = await loadSettings();
  let items = [];
  try { items = await tq(sb.from('items').select('key,name,sort,pocket,move_id,moves(name)').order('sort')); }
  catch { try { items = await tq(sb.from('items').select('key,name,sort').order('sort')); } catch { /* 물건 목록 없이 */ } }
  return [h('div.cols', h('div', giftCard(items), roamCard()), h('div', questCard(set), legendBattleCard(set), settingsGroup(GROUPS.legends, set)))];
}

function giftCard(items) {
  const list = h('div.stack', h('p.small-txt.muted', '불러오는 중…'));
  const code = h('input.inp', { placeholder: '예: 축제 첫날 선물', maxlength: 60, 'aria-label': '소포 코드' });
  const title = h('input.inp', { placeholder: '(선택) 메모 — 학생에게는 안 보여요', maxlength: 60, 'aria-label': '메모' });
  const kind = h('select.inp.w-sel', { 'aria-label': '선물 종류' }, h('option', { value: 'mon' }, '포켓몬'), h('option', { value: 'item' }, '물건'));
  const dex = h('input.inp.w-num', { type: 'number', min: 1, max: Math.max(809, ...S.species.map((x) => x.dex || 0)), placeholder: '번호', 'aria-label': '포켓몬 도감 번호' });
  const dexName = h('span.small-txt.muted');
  let pickedSp = null;   // 0052: 이벤트 폼 단추 = 종을 바로 (p_species). 번호만 넣으면 그 번호의 일반 폼
  // 0055: 반짝이는 (이로치) 포켓몬 소포 + 그림 미리보기 (체크하면 반짝이는 색)
  const giftPic = h('span.gift-pic');
  const shinyGift = h('input', { type: 'checkbox', onchange: () => showGiftPic() });
  const showGiftPic = () => {
    const sp = pickedSp ? S.species.find((x) => x.id === pickedSp) : spByDex(dex.value);
    giftPic.replaceChildren(...(sp ? [spriteCanvas(sp.id, 64, shinyGift.checked ? 'shiny' : 'normal')] : []));
  };
  dex.oninput = () => { pickedSp = null; const sp = spByDex(dex.value); dexName.textContent = sp ? `${sp.name} (일반)` : dex.value ? '없는 번호' : ''; showGiftPic(); };
  // 0044 이벤트 포켓몬 (소포로만 받음: 지우개굴닌자 · 지우의 피카츄 …) → 눌러서 고르기
  const evSp = S.species.filter((x) => x.stage === 1 && x.dex && formKindOf(S.lineById?.get(x.line_id)) === 'event');
  const evRow = evSp.length ? h('div.row.small-txt', '이벤트 포켓몬:', evSp.map((x) => h('button.btn.small', { type: 'button', onclick: () => { dex.value = x.dex; dex.oninput(); pickedSp = x.id; dexName.textContent = `${x.name} (이벤트 폼)`; showGiftPic(); } },
    `${x.name} (No.${x.dex})`))) : null;
  // 물건: 주머니별로 묶고 기술머신은 기술 이름까지 (예: 기술머신30 (몸통박치기)). 많아서 찾기 칸으로 거름
  const itemLabel = (it) => (it.pocket === 'tm' && it.moves?.name ? `${it.name} (${it.moves.name})` : it.name);
  const POCKET_LABEL = [['tool', '도구'], ['hold', '지니는 물건'], ['med', '회복약'], ['tm', '기술머신'], ['key', '중요한 물건']];
  const groups = POCKET_LABEL.map(([k, label]) => [label, items.filter((it) => it.pocket === k)])
    .concat([['기타', items.filter((it) => !POCKET_LABEL.some(([k]) => k === it.pocket))]]).filter(([, l]) => l.length);
  const item = h('select.inp.w-sel', { 'aria-label': '물건' });
  const itemFind = h('input.inp', { type: 'search', placeholder: '물건 · 기술 이름으로 찾기', 'aria-label': '물건 찾기' });
  const fillItems = () => {
    const q = itemFind.value.replace(/\s+/g, '').toLowerCase();
    const hit = (label) => !q || label.replace(/\s+/g, '').toLowerCase().includes(q);
    const prev = item.value;
    const opts = [];
    if (hit('진화의 돌')) opts.push(h('option', { value: 'evo_stone' }, '진화의 돌'));
    for (const [label, list] of groups) {
      const l = list.filter((it) => hit(itemLabel(it)) || hit(it.key));
      if (l.length) opts.push(h('optgroup', { label: `${label} (${l.length})` }, l.map((it) => h('option', { value: it.key }, itemLabel(it)))));
    }
    item.replaceChildren(...(opts.length ? opts : [h('option', { value: '', disabled: true, selected: true }, '찾는 물건이 없어요')]));
    if ([...item.options].some((o) => o.value === prev)) item.value = prev;
  };
  itemFind.oninput = fillItems;
  fillItems();
  const qty = h('input.inp.w-num', { type: 'number', min: 1, max: 99, value: 1, 'aria-label': '개수' });
  const starts = h('input.inp', { type: 'datetime-local', 'aria-label': '시작 시각' });
  const ends = h('input.inp', { type: 'datetime-local', 'aria-label': '끝 시각' });
  const max = h('input.inp.w-num', { type: 'number', min: 0, placeholder: '0', 'aria-label': '최대 받는 사람 수' });
  const monRow = h('div.stack', h('div.row', h('label', '도감 번호 ', dex), dexName, giftPic), evRow,
    h('label.chk.chk-top', shinyGift, h('span', h('b', '✦ 반짝이는 (이로치) 포켓몬'), ' — 받는 포켓몬이 반드시 반짝이는 색이에요')));
  const itemRow = h('div.stack', h('label.stack', '물건 찾기', itemFind), h('label', '물건 ', item));
  itemRow.style.display = 'none';
  kind.onchange = () => { monRow.style.display = kind.value === 'mon' ? '' : 'none'; itemRow.style.display = kind.value === 'mon' ? 'none' : ''; };
  const make = h('button.btn.go', '소포 만들기');
  make.onclick = () => busy(make, async () => {
    const mon = kind.value === 'mon';
    if (!mon && !item.value) { toast('줄 물건을 고르세요.'); return; }
    try {
      await rpc('admin_create_gift', {
        p_code: code.value, p_title: title.value || null, p_dex: mon && !pickedSp ? Number(dex.value) || null : null, p_species: mon ? pickedSp : null, p_item: mon ? null : item.value,
        p_shiny: mon && shinyGift.checked, p_qty: Number(qty.value) || 1, p_starts: starts.value ? new Date(starts.value).toISOString() : null,
        p_ends: ends.value ? new Date(ends.value).toISOString() : null, p_max: Number(max.value) || null,
      });
    } catch (e) { toast(errorText(e.message), 5000); return; }
    toast('소포를 만들었어요. 코드를 학생들에게 알려 주세요!');
    code.value = ''; title.value = ''; shinyGift.checked = false; showGiftPic();
    load();
  });
  async function load() {
    let rows;
    try { rows = await rpc('admin_list_gifts', {}); } catch (e) { list.replaceChildren(h('p.warn-txt', errorText(e.message))); return; }
    if (!rows.length) { list.replaceChildren(h('p.small-txt.muted', '아직 만든 소포가 없어요.')); return; }
    list.replaceChildren(...rows.map((g) => {
      const what = g.species_id ? `${g.shiny ? '✦ 반짝이는 ' : ''}${g.species_name} (No.${g.dex})${g.qty > 1 ? ` ×${g.qty}` : ''}` : `${(() => { const it = items.find((x) => x.key === g.item); return it ? itemLabel(it) : g.item_name || g.item; })()} ×${g.qty}`;
      const when = [g.starts_at && `${new Date(g.starts_at).toLocaleString('ko-KR')}부터`, g.ends_at && `${new Date(g.ends_at).toLocaleString('ko-KR')}까지`]
        .filter(Boolean).join(' · ') || '기간 제한 없음';
      const tog = h('button.btn.small', g.active ? '끄기' : '켜기');
      tog.onclick = () => busy(tog, async () => { await rpc('admin_set_gift', { p_id: g.id, p_active: !g.active }); load(); });
      const del = h('button.btn.small.danger', '지우기');
      del.onclick = async () => {
        if (!(await confirmBox('소포 지우기', [`"${g.code}" 소포를 지울까요?`, '이미 받은 학생의 포켓몬 · 물건은 그대로 남아요. 지운 뒤에는 같은 코드로 다시 만들 수 있어요.'], { ok: '지우기', danger: true }))) return;
        busy(del, async () => { await rpc('admin_delete_gift', { p_id: g.id }); load(); });
      };
      return h('div.box.gift-row',
        h('div', h('b', g.code), ' ', h('span', { class: g.live ? 'ok-txt' : 'muted' }, g.live ? '● 받을 수 있음' : g.active ? '○ 기간 밖' : '○ 꺼짐')),
        h('div.small-txt', what, ' · ', `받은 사람 ${g.claims}${g.max_claims ? `/${g.max_claims}` : ''}명`),
        h('div.small-txt.muted', when, g.title ? ` · ${g.title}` : ''),
        h('div.row', tog, del));
    }));
  }
  load();
  return h('div.box.stack',
    h('h2', '이상한 소포 (선물 코드)'),
    h('p.small-txt', '학생 앱 위쪽의 소포 단추 (설정 단추 왼쪽) 에서 코드를 넣으면 받아요. 띄어쓰기 · 대소문자는 상관없고 한글도 돼요. 한 사람에 한 번씩만 받을 수 있어요. 받을 수 있는 소포가 있으면 단추에 ★ 가 떠요 (코드는 보이지 않아요).'),
    h('label.stack', '코드 (2~40글자, 띄어쓰기 빼고 셈)', code), h('label.stack', '메모', title),
    h('div.row', h('label', '선물 ', kind), h('label', '개수 ', qty)), monRow, itemRow,
    h('div.row', h('label.stack', '시작 (비우면 바로)', starts), h('label.stack', '끝 (비우면 계속)', ends)),
    h('label', '최대 받는 사람 수 (0 = 제한 없음) ', max),
    h('div.row.end', make), h('h3', '만든 소포'), list);
}

function roamCard() {
  const body = h('div.stack', h('p.small-txt.muted', '불러오는 중…'));
  const load = async () => {
    let rows;
    try { rows = await rpc('admin_roam_spots', { p_at: new Date().toISOString() }); } catch (e) { body.replaceChildren(h('p.warn-txt', errorText(e.message))); return; }
    body.replaceChildren(...rows.map((r) => h('div.small-txt', h('b', r.name), ` → ${r.qr_name || '(장소 없음)'} (${r.qr}) · 학생 소문: ${r.area}`)));
  };
  load();
  return h('div.box.stack', h('h2', '방랑 전설 (지금 이 시간)'),
    h('p.small-txt', '한 시간마다 (정각) 지도에 보이는 장소 QR 중 하나로 옮겨 가요. 학생 앱 지도에는 소문 (예: "D홀 근처에서 번개 같은 울음소리가 들렸대!") 만 보여요. 만날 확률은 오른쪽 숫자 묶음에서 정해요.'),
    body, h('div.row.end', h('button.btn.small', { onclick: load }, '새로 고침')));
}

function questCard(set) {
  const r = set.legend_quests;
  if (!r) return missingCard('legend_quests', '전설 퀘스트');
  const qs = structuredClone(Array.isArray(r.value) ? r.value : []);
  const ins = [];
  const rows = qs.map((q) => {
    const sp = spByDex(q.dex); const [label, unit] = QUEST_KIND[q.kind] || [q.kind, null];
    const detail = q.kind === 'type_catch' ? `${(q.types || []).join('·')} ${label}`
      : q.kind === 'zone_catch' ? `${ZONE_KO[q.zone] || q.zone}에서 잡기`
      : q.kind === 'caught_all' ? `${(q.of || []).map((d) => spByDex(d)?.name || d).join('·')} 모두 잡기` : label;
    const inp = unit ? h('input.inp.w-num', { type: 'number', min: 0, max: 1000, value: q.n ?? 0, 'aria-label': `${sp?.name || q.dex} 조건 숫자` }) : null;
    if (inp) ins.push([q, inp]);
    return h('div.setrow',
      h('div.setlbl', h('b', sp?.name || `No.${q.dex}`), h('div.small-txt.muted', `${detail} · ${q.reward === 'map' ? '사파리존 지도 자리에서 만남' : '특별 티켓 (부스에서 받기)'}${q.max > 1 ? ` · ${q.max}번 만날 수 있어요` : ''}`)),
      h('div.setctl', inp ? h('span.part-in', inp, h('span.unit', unit)) : h('span.small-txt.muted', '숫자 없음')));
  });
  const save = h('button.btn.go', '저장');
  save.onclick = () => {
    for (const [q, inp] of ins) {
      const n = Number(inp.value);
      if (!Number.isInteger(n) || n < 0 || n > 1000) { toast('0~1000 사이 정수로 넣어 주세요.'); return; }
      q.n = n;
    }
    busy(save, async () => { await saveSetting('legend_quests', qs); toast('전설 퀘스트 숫자를 저장했어요.'); rerender(); });
  };
  return h('div.box.stack.setgroup', h('h2', '전설 퀘스트 조건'),
    h('p.small-txt', '조건을 채우면 특별 티켓을 받거나 (유크시 · 엠라이트 · 아그놈 · 디아루가 · 펄기아), 사파리존의 전설 자리에서 만날 수 있어요 (나머지). 한 번 채운 조건은 숫자를 올려도 그대로예요. 학생 앱에 "퀴즈 연속 정답 7/10" 처럼 진행이 보여요.'),
    h('div.setrows', rows), h('div.row.end', resetBtn('legend_quests', r.value), save));
}

// ───────────────────────── 고급 설정 (JSON) ─────────────────────────

async function tabAdv() {
  const set = await loadSettings();
  const all = Object.values(set);
  const own = all.filter((r) => !KEY_HOME[r.key]);
  const elsewhere = all.filter((r) => KEY_HOME[r.key]);
  const showAll = !!S.advAll;
  const toggleBtn = h('button.btn.small', { onclick: () => { S.advAll = !showAll; rerender(); } },
    showAll ? '다른 탭에 있는 설정 숨기기' : `다른 탭에 있는 설정도 보기 (${elsewhere.length}개)`);

  const rowFor = (r) => {
    const home = KEY_HOME[r.key];
    const unused = UNUSED_KEYS.includes(r.key);
    const label = h('td',
      h('b.mono', r.key), unused ? [' ', chip('사용 안 함', 'off')] : null,
      h('div.small-txt.muted', SETTING_HELP[r.key] || SPEC_BY_KEY[r.key]?.label || KEY_TITLE[r.key] || ''),
      h('div.small-txt.muted', `변경 ${timeAgo(r.updated_at)}`));
    if (home) {
      return h('tr.ro', label,
        h('td.small-txt', h('div.mono.json-ro', JSON.stringify(r.value))),
        h('td', chip(`[${home}] 탭에서 바꿔요`, 'blue')));
    }
    const ta = h('textarea.inp.json', { rows: 1, spellcheck: 'false', 'aria-label': r.key }, JSON.stringify(r.value));
    const msg = h('div.small-txt');
    const valid = () => {
      try { JSON.parse(ta.value); ta.classList.remove('bad'); msg.textContent = ''; return true; } catch { ta.classList.add('bad'); msg.textContent = 'JSON 형식이 아니에요'; msg.className = 'small-txt warn-txt'; return false; }
    };
    ta.addEventListener('input', valid);
    const save = h('button.btn.small.go', '저장');
    save.onclick = () => {
      if (!valid()) { toast(`${r.key}: JSON 형식이 아니에요.`); return; }
      const value = JSON.parse(ta.value);
      busy(save, async () => {
        await saveSetting(r.key, value);
        ta.value = JSON.stringify(value);
        msg.className = 'small-txt ok-txt'; msg.textContent = '저장됨';
        toast(`${r.key} 저장했어요.`);
        rerender();
      });
    };
    return h('tr',
      label,
      h('td.json-cell', ta, msg, h('div.adv-reset', resetBtn(r.key, r.value))),
      h('td', save));
  };

  return [h('div.box',
    h('div.row', h('h2', { style: { flex: '1 1 200px' } }, '설정값 (JSON)'), toggleBtn),
    h('p.small-txt.muted', '값은 JSON 형식이에요: 숫자 3, 참/거짓 true, 글자 "abc", 목록 ["a","b"], 없음 null. 저장 전에 형식을 검사해요.'),
    h('p.small-txt.muted', '"사용 안 함" = 예전 설정이라 지금은 서버가 읽지 않아요 (바꿔도 아무 일 없음).'),
    h('div.tbl-wrap', h('table.tbl.adv-tbl',
      h('thead', h('tr', h('th', '키'), h('th', '값'), h('th', ''))),
      h('tbody', [...own, ...(showAll ? elsewhere : [])].map(rowFor)))))];
}

// ───────────────────────── start ─────────────────────────
window.addEventListener('hashchange', () => {
  if (S.view !== 'app') return;
  const [t, sub] = parseHash(location.hash);
  if (t !== S.tab || (sub && sub !== S.sub[t])) go(t, sub);
});
window.addEventListener('unhandledrejection', (e) => console.warn('[admin] unhandled', e.reason));
boot();
