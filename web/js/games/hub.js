// 미니게임 모음 (0023): 홈 → 미니게임. 몬스터 10마리부터 열림. 게임마다 따로 랭킹 (전체 랭킹과 별개).
// 게임 파일 약속: export default { id, title, start(stage, api) } — start 는 stage(div) 안에 게임을 그리고 끝낼 함수를 돌려줌.
//   api.end(score, ms) → 한 판 끝 (hub 가 서버에 보내고 결과·랭킹을 보여줌), api.sfx, api.mons(), api.partner()
import { rpc, errorText } from '../sb.js';
import { spriteCanvas } from '../sprites.js';
import { sfx, unlockAudio } from '../sfx.js';
import { h, toast, pix } from '../ui.js';
import { S, collection, dexOf, partnerMon } from '../state.js';
import { overlay, sheet, closeOverlay } from '../app.js';

// 내 몬스터 (지금 단계 도감 번호) — 게임 속 캐릭터로 씀. 없으면 기본 몬스터
const myMons = () => { const xs = collection().map((c) => dexOf(c.line_id, c.stage)); return xs.length ? xs : [1, 4, 7]; };
const partnerDex = () => { const p = partnerMon(); return p ? dexOf(p.line_id, p.stage) : 1; };

export const GAMES = [
  { id: 'yacht', title: '몬스터 요트', dex: 94, desc: '주사위 5개를 3번까지 굴려 12칸을 채워요. 몬스터 눈 주사위로 최고 점수에 도전!',
    unit: '점', load: () => import('./yacht.js') },
  { id: 'dodge', title: '폭탄 피하기', dex: 100, desc: '하늘에서 떨어지는 폭탄 몬스터를 좌우로 피해요. 오래 버틸수록 점수가 올라가요.',
    unit: '점', load: () => import('./dodge.js') },
  { id: 'maze', title: '자이로 미로', dex: 175, desc: '폰을 기울여서 몬스터볼을 미로 밖으로 굴려 빼내요. 3판을 가장 빨리!',
    unit: '초', load: () => import('./maze.js') },
];
export const unlockAt = () => Number(S.snap?.rules?.minigame_unlock ?? 10);
export const isUnlocked = () => collection().length >= unlockAt();
const fmt = (game, v) => (game.id === 'maze' ? `${(v / 1000).toFixed(2)}초` : `${v}${game.unit}`);

// 홈 버튼: 잠겨 있으면 자물쇠
export function minigameButton() {
  const n = collection().length; const need = unlockAt();
  const locked = n < need;
  return h(`button.btn.big.mg-btn${locked ? '.locked' : ''}`, {
    onclick: () => (locked ? (sfx.error(), toast(`몬스터를 ${need}마리 모으면 열려요! (지금 ${n}마리)`, 3000)) : openMinigames()),
    'aria-label': locked ? `미니게임 (잠김 — 몬스터 ${need}마리부터)` : '미니게임',
  },
  pix('spark', 'l'), '미니게임',
  locked ? h('span.mg-lock', { 'aria-hidden': 'true' }, h('i.mg-lock-ico'), h('small', `${n}/${need}`)) : h('small', ' 요트 · 폭탄 피하기 · 자이로 미로'));
}

export async function openMinigames() {
  sfx.select(); unlockAudio();
  const best = {};
  const list = h('div.mg-list');
  const draw = () => list.replaceChildren(...GAMES.map((g) => h('div.mg-card',
    h('div.mg-pic', spriteCanvas(g.dex, 64)),
    h('div.mg-info', h('b', g.title), h('small', g.desc),
      h('small.mg-best', best[g.id]?.me ? `내 최고 ${fmt(g, best[g.id].me.score)} · ${best[g.id].me.rank}위` : best[g.id] ? '아직 기록 없음' : '…')),
    h('div.mg-btns',
      h('button.btn.primary', { onclick: () => playGame(g) }, '시작'),
      h('button.btn.small', { onclick: () => showRanking(g) }, '랭킹')))));
  draw();
  overlay(h('div.mg-screen',
    h('div.bag-head', h('button.btn.small.mg-back', { onclick: () => { sfx.blip(); closeOverlay(); }, 'aria-label': '홈으로 돌아가기' }, '◀ 홈'),
      h('b', pix('spark'), ' 미니게임'), h('span')),
    h('small.muted', '미니게임 랭킹은 게임마다 따로예요 (전체 랭킹에는 안 들어가요).'),
    list,
    rankPanel(GAMES)), 'full').classList.add('bag-overlay');
  if (S.online) {
    await Promise.all(GAMES.map(async (g) => { try { best[g.id] = await rpc('minigame_ranking', { p_game: g.id }, { retries: 0 }); } catch { /* offline */ } }));
    draw();
  }
}

async function playGame(game) {
  sfx.select();
  let mod;
  try { mod = (await game.load()).default; } catch { return toast('게임을 불러오지 못했어요. 인터넷을 확인해 주세요.'); }
  const stage = h('div.mg-stage');
  let stop = () => {};
  const ov = overlay(h('div.mg-play',
    h('div.mg-top', h('button.btn.small.mg-back', { onclick: () => { stop(); openMinigames(); }, 'aria-label': '미니게임 목록으로' }, '◀ 목록'),
      h('b', game.title),
      h('button.btn.small', { onclick: () => { stop(); closeOverlay(); }, 'aria-label': '홈으로 돌아가기' }, '홈')),
    stage,
    rankPanel([game])), 'full');
  ov.classList.add('bag-overlay');
  ov.onclose = () => stop();
  const api = {
    sfx, mons: myMons, partner: partnerDex,
    end: async (score, ms) => {
      stop(); stop = () => {};
      let res = null; let err = '';
      if (S.online) {
        try { res = await rpc('submit_minigame_score', { p_game: game.id, p_score: Math.round(score), p_ms: Math.round(ms) }, { retries: 0 }); }
        catch (e) { err = errorText(e.message); }
      } else err = '오프라인이라 기록은 저장하지 못했어요.';
      result(game, score, res, err);
    },
  };
  // 게임이 화면 크기를 잴 수 있게 한 프레임 뒤에 시작
  requestAnimationFrame(() => { stop = mod.start(stage, api) || (() => {}); });
}

// 화면 아래 "랭킹 보기": 누르면 그 자리에서 펼쳐짐 (게임은 멈추지 않음). 게임이 여럿이면 위에 게임 고르는 탭
function rankPanel(games) {
  let cur = games[0]; let open = false;
  const body = h('div.mg-rank-body');
  const tabs = games.length > 1 ? h('div.seg.mg-rank-tabs', { role: 'group', 'aria-label': '게임 고르기' }) : null;
  const load = async () => {
    tabs?.replaceChildren(...games.map((g) => h('button', { 'aria-pressed': String(g === cur), onclick: () => { sfx.blip(); cur = g; load(); } }, g.title)));
    body.replaceChildren(h('small.muted', '불러오는 중…'));
    if (!S.online) return body.replaceChildren(h('small.muted', '오프라인이라 랭킹을 볼 수 없어요.'));
    try {
      const r = await rpc('minigame_ranking', { p_game: cur.id }, { retries: 0 });
      body.replaceChildren(
        r?.me ? h('small', `내 최고 ${fmt(cur, r.me.score)} · ${r.players}명 중 ${r.me.rank}위 ${cur.id === 'maze' ? '(빠를수록 위)' : '(높을수록 위)'}`)
          : h('small.muted', '아직 내 기록이 없어요.'),
        rankList(cur, r));
    } catch (e) { body.replaceChildren(h('small.err', errorText(e.message))); }
  };
  const box = h('div.mg-rank-box', { hidden: true }, tabs, body);
  const btn = h('button.btn.mg-rank-btn', { 'aria-expanded': 'false', onclick: () => {
    sfx.blip(); open = !open; box.hidden = !open; btn.setAttribute('aria-expanded', String(open));
    btn.lastChild.textContent = open ? ' 랭킹 닫기' : ' 랭킹 보기';
    if (open) load();
  } }, pix('spark'), h('span', ' 랭킹 보기'));
  return h('div.mg-rank-panel', box, btn);
}

function rankList(game, r) {
  return h('ol.mg-rank', (r?.top || []).map((x) => h(`li${x.me ? '.me' : ''}`, h('span.rk', `${x.rank}`), h('span.nm', x.name), h('b', fmt(game, x.score)))),
    !(r?.top || []).length ? h('li.muted', '아직 아무도 기록이 없어요. 첫 기록의 주인공이 되어 보세요!') : null);
}

function result(game, score, r, err) {
  const isBest = r?.me && r.me.score === Math.round(score);
  if (isBest) sfx.catch(); else sfx.select();
  sheet(h('div.stack',
    h('div.mg-result', spriteCanvas(partnerDex(), 64), h('div', h('small', game.title), h('b.big', fmt(game, Math.round(score))),
      isBest ? h('span.chip.hot', '내 최고 기록!') : r?.me ? h('small', `내 최고 ${fmt(game, r.me.score)}`) : null)),
    err ? h('p.err', err) : r?.me ? h('p', { style: { margin: 0 } }, `지금 ${r.players}명 중 ${r.me.rank}위`) : null,
    r ? rankList(game, r) : null,
    h('button.btn.big.primary', { onclick: () => playGame(game) }, '다시 하기'),
    h('div.row', { style: { display: 'flex', gap: '8px' } },
      h('button.btn', { style: { flex: 1 }, onclick: () => openMinigames() }, '◀ 미니게임 목록'),
      h('button.btn', { style: { flex: 1 }, onclick: () => closeOverlay() }, '홈으로')),
  ), { dismissable: false });
}

async function showRanking(game) {
  sfx.blip();
  let r = null;
  try { r = await rpc('minigame_ranking', { p_game: game.id }, { retries: 0 }); } catch (e) { return toast(errorText(e.message)); }
  sheet(h('div.stack',
    h('b', `${game.title} 랭킹`, h('small', game.id === 'maze' ? ' (빠를수록 위)' : ' (높을수록 위)')),
    r?.me ? h('p', { style: { margin: 0 } }, `내 최고 ${fmt(game, r.me.score)} · ${r.players}명 중 ${r.me.rank}위`) : h('small.muted', '아직 내 기록이 없어요.'),
    rankList(game, r),
    h('button.btn', { onclick: () => openMinigames() }, '닫기')));
}
