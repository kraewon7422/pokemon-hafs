// 미니게임 모음 (0023): 홈 → 미니게임. 몬스터 10마리부터 열림. 게임마다 따로 랭킹 (전체 랭킹과 별개).
// 게임 파일 약속: export default { id, title, start(stage, api) } — start 는 stage(div) 안에 게임을 그리고 끝낼 함수를 돌려줌.
//   api.end(score, ms) → 한 판 끝 (hub 가 서버에 보내고 결과·랭킹을 보여줌), api.sfx, api.mons(), api.partner(), api.mode ('rank' | 'free')
//   랭킹 창이 게임 위에 열리면 stage 에 'mg-pause' / 닫히면 'mg-resume' 이벤트 → 게임은 멈춤 (멈춘 시간은 기록에 안 들어감)
import { rpc, errorText } from '../sb.js';
import { spriteCanvas } from '../sprites.js';
import { sfx, unlockAudio } from '../sfx.js';
import { h, toast, pix } from '../ui.js';
import { S, collection, dexOf, partnerMon } from '../state.js';
import { overlay, closeOverlay, renderTab } from '../app.js';
import { kv } from '../db.js';

// 내 몬스터 (지금 단계 도감 번호) — 게임 속 캐릭터로 씀. 없으면 기본 몬스터
const myMons = () => { const xs = collection().map((c) => dexOf(c.line_id, c.stage)); return xs.length ? xs : [1, 4, 7]; };
const partnerDex = () => { const p = partnerMon(); return p ? dexOf(p.line_id, p.stage) : 1; };

// fmt = 랭킹에 보이는 기록 모양, lower = 작을수록 좋음 (서버 _mg_lower 와 같게)
export const GAMES = [
  { id: 'surf', short: '서핑', title: '몬스터 서핑', dex: 53, desc: '파도를 타고 바위·섬을 피해 멀리멀리! 뒤쫓아 오는 문어 몬스터를 조심해요.',
    fmt: (v) => `${v.toLocaleString()}m`, load: () => import('./surf.js') },
  { id: 'dodge', short: '폭탄', title: '폭탄 피하기', dex: 100, desc: '하늘에서 떨어지는 폭탄 몬스터를 좌우로 피해요. 오래 버틸수록 점수가 올라가요.',
    fmt: (v) => `${v.toLocaleString()}점`, load: () => import('./dodge.js') },
  { id: 'maze', short: '미로', title: '자이로 미로', dex: 175, desc: '폰을 기울여 몬스터볼을 미로 밖으로! 랭킹 모드 = 5단계 시간 재기, 자유 모드 = 끝없이 (미로 10가지).',
    fmt: (v) => `${(v / 1000).toFixed(2)}초`, lower: true, free: true, load: () => import('./maze.js') },
  { id: 'land', short: '땅따먹기', title: '땅따먹기', dex: 76, desc: '내 땅 밖으로 선을 그리고 돌아오면 그 안이 내 땅! 꼬리를 밟히면 목숨 하나 (3개). AI 3명과 90초 대결.',
    fmt: (v) => `${(v / 10).toFixed(1)}%`, load: () => import('./land.js') },
];
// 오프라인 기록: 인터넷이 없을 때 끝난 판은 폰에 (게임마다 가장 좋은 것 하나만) 두었다가 연결되면 보냄
const PENDING = 'mgPending';
const better = (g, a, b) => (GAMES.find((x) => x.id === g)?.lower ? a < b : a > b);
async function keepOffline(game, score, ms) {
  const p = (await kv.get(PENDING)) || {};
  const cur = p[game.id];
  if (!cur || better(game.id, score, cur.score)) p[game.id] = { score, ms, at: Date.now() };
  await kv.set(PENDING, p);
}
let flushing = false;
export async function flushMinigameScores() {
  if (flushing || !S.online) return;
  flushing = true;
  try {
    const p = (await kv.get(PENDING)) || {};
    for (const [id, v] of Object.entries(p)) {
      try { await rpc('submit_minigame_score', { p_game: id, p_score: v.score, p_ms: v.ms }, { retries: 0 }); delete p[id]; }
      catch (e) { if (!/fetch|network|offline/i.test(e.message || '')) delete p[id]; }   // 서버가 거절한 기록은 버림, 연결 문제면 다음에 다시
    }
    await kv.set(PENDING, p);
  } finally { flushing = false; }
}
window.addEventListener('online', () => setTimeout(flushMinigameScores, 1500));

// 운영자 설정 (0025 minigame_config): 열리는 몬스터 수 · 쉬는 게임. 폰에 저장해 두고 5분마다 새로 받음
let cfg = null; let cfgAt = 0;
kv.get('mgConfig').then((c) => { if (c && !cfg) cfg = c; });
export async function refreshMgConfig(force = false) {
  if (!S.online || (!force && Date.now() - cfgAt < 300000)) return cfg;
  cfgAt = Date.now();
  try {
    const c = await rpc('minigame_config', {}, { retries: 0 });
    const changed = JSON.stringify(c) !== JSON.stringify(cfg);
    cfg = c; kv.set('mgConfig', c);
    if (changed && S.tab === 'home' && !S.overlay) renderTab();
  } catch { /* 오프라인: 저장된 값 그대로 */ }
  return cfg;
}
const isOff = (g) => (cfg?.off || []).includes(g.id);
export const unlockAt = () => Number(cfg?.unlock ?? 10);
export const isUnlocked = () => collection().length >= unlockAt();

// 홈 버튼: 잠겨 있으면 자물쇠
export function minigameButton() {
  refreshMgConfig();
  const n = collection().length; const need = unlockAt();
  const locked = n < need;
  return h(`button.btn.big.mg-btn${locked ? '.locked' : ''}`, {
    onclick: () => (locked ? (sfx.error(), toast(`몬스터를 ${need}마리 모으면 열려요! (지금 ${n}마리)`, 3000)) : openMinigames()),
    'aria-label': locked ? `미니게임 (잠김 — 몬스터 ${need}마리부터)` : '미니게임',
  },
  pix('spark', 'l'), h('span.btn-label', '미니게임'),
  locked ? h('span.mg-lock', { 'aria-hidden': 'true' }, h('i.mg-lock-ico'), h('small', `${n}/${need}`)) : null);
}

export async function openMinigames() {
  sfx.select(); unlockAudio();
  refreshMgConfig(true).then(() => draw());
  const best = {};
  const list = h('div.mg-list');
  const draw = () => list.replaceChildren(...GAMES.map((g) => h('div.mg-card',
    h('div.mg-pic', spriteCanvas(g.dex, 64)),
    h('div.mg-info', h('b', g.title), h('small', g.desc),
      h('small.mg-best', best[g.id]?.me ? `내 최고 ${g.fmt(best[g.id].me.score)} · ${best[g.id].me.rank}위` : best[g.id] ? '아직 기록 없음' : '…')),
    isOff(g) ? h('div.mg-btns', h('span.chip.mg-off', '지금은 쉬는 중이에요'), h('button.btn.small', { onclick: () => rankSheet(ov, GAMES, g) }, '랭킹')) : h('div.mg-btns',
      h('button.btn.primary', { onclick: () => playGame(g, 'rank') }, g.free ? '랭킹 모드' : '시작'),
      g.free && h('button.btn', { onclick: () => playGame(g, 'free') }, '자유 모드'),
      h('button.btn.small', { onclick: () => rankSheet(ov, GAMES, g) }, '랭킹')))));
  draw();
  const ov = overlay(h('div.mg-screen',
    h('div.bag-head', h('button.btn.small.mg-back', { onclick: () => { sfx.blip(); closeOverlay(); }, 'aria-label': '홈으로 돌아가기' }, '◀ 홈'),
      h('b', pix('spark'), ' 미니게임'), h('span')),
    h('small.muted', '미니게임 랭킹은 게임마다 따로예요 (전체 랭킹에는 안 들어가요).'),
    list,
    h('div.mg-foot', h('button.btn.big.mg-rank-btn', { onclick: () => rankSheet(ov, GAMES, GAMES[0]) }, pix('spark'), ' 랭킹 보기'))), 'full');
  ov.classList.add('bag-overlay');
  if (S.online) {
    await flushMinigameScores();
    await Promise.all(GAMES.map(async (g) => { try { best[g.id] = await rpc('minigame_ranking', { p_game: g.id }, { retries: 0 }); } catch { /* offline */ } }));
    draw();
  }
}

async function playGame(game, mode = 'rank') {
  sfx.select();
  let mod;
  try { mod = (await game.load()).default; } catch { return toast('게임을 불러오지 못했어요. 인터넷을 확인해 주세요.'); }
  const stage = h('div.mg-stage');
  let stop = () => {}; let ended = false;
  const title = game.free ? `${game.title} · ${mode === 'free' ? '자유' : '랭킹'}` : game.title;
  const ov = overlay(h('div.mg-play',
    h('div.mg-top', h('button.btn.small.mg-back', { onclick: () => { stop(); openMinigames(); }, 'aria-label': '미니게임 목록으로' }, '◀ 목록'),
      h('b', title),
      h('button.btn.small', { onclick: () => { stop(); closeOverlay(); }, 'aria-label': '홈으로 돌아가기' }, '홈')),
    stage,
    mode === 'rank' && h('div.mg-foot', h('button.btn.mg-rank-btn', { onclick: () => rankSheet(ov, [game], game, stage) }, pix('spark'), ' 랭킹 보기'))), 'full');
  ov.classList.add('bag-overlay');
  ov.onclose = () => stop();
  const api = {
    sfx, mode, mons: myMons, partner: partnerDex,
    // 끝난 게임 화면은 결과 창 뒤에 그대로 둠 (게임 정리는 화면을 닫거나 다시 할 때 ov.onclose → stop)
    end: async (score, ms) => {
      if (ended) return; ended = true;
      stage.dispatchEvent(new CustomEvent('mg-pause'));
      if (mode === 'free') return freeResult(ov, game, score, ms);   // 자유 모드는 기록을 안 보냄
      let res = null; let err = '';
      const sc = Math.round(score), m = Math.round(ms);
      if (S.online && navigator.onLine !== false) {
        try { res = await rpc('submit_minigame_score', { p_game: game.id, p_score: sc, p_ms: m }, { retries: 0 }); }
        catch (e) {
          if (/fetch|network|offline/i.test(e.message || '')) { await keepOffline(game, sc, m); err = '인터넷이 끊겨서 기록을 폰에 저장했어요. 연결되면 자동으로 올라가요.'; }
          else err = errorText(e.message);
        }
      } else { await keepOffline(game, sc, m); err = '오프라인이에요. 기록은 폰에 저장했다가 연결되면 자동으로 올라가요.'; }
      result(ov, game, score, res, err);
    },
  };
  // 게임이 화면 크기를 잴 수 있게 한 프레임 뒤에 시작
  requestAnimationFrame(() => { stop = mod.start(stage, api) || (() => {}); });
}

// 랭킹 = 미니게임 화면 안에서 아래에서 올라오는 창 (게임 화면을 닫지 않음, 게임은 멈춤).
// 목록만 스크롤되고 위 제목·탭과 아래 "내 순위" 줄은 고정 → 사람이 많아도 화면 위쪽을 덮지 않음
function rankSheet(ov, games, first, stage = null) {
  sfx.blip();
  ov.querySelector('.mg-sheet-wrap')?.remove();
  let cur = first;
  const tabs = games.length > 1 ? h('div.seg.mg-rank-tabs', { role: 'group', 'aria-label': '게임 고르기' }) : null;
  const sub = h('small.mg-rank-sub');
  const body = h('div.mg-rank-scroll');
  const mine = h('div.mg-rank-mine');
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); stage?.dispatchEvent(new CustomEvent('mg-resume')); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const load = async () => {
    tabs?.replaceChildren(...games.map((g) => h('button', { 'aria-pressed': String(g === cur), onclick: () => { sfx.blip(); cur = g; load(); } }, g.short || g.title)));
    sub.textContent = cur.lower ? '빠를수록 위 · 한 사람의 가장 좋은 기록' : '높을수록 위 · 한 사람의 가장 좋은 기록';
    mine.replaceChildren(); body.replaceChildren(h('p.muted.mg-rank-empty', '불러오는 중…'));
    if (!S.online) return body.replaceChildren(h('p.muted.mg-rank-empty', '오프라인이라 랭킹을 볼 수 없어요.'));
    try {
      const r = await rpc('minigame_ranking', { p_game: cur.id }, { retries: 0 });
      body.replaceChildren(rankList(cur, r));
      body.scrollTop = 0;
      mine.replaceChildren(r?.me
        ? h('div.mg-rank-row.me', h('span.rk', `${r.me.rank}`), h('span.nm', `나 · ${r.players}명 중`), h('b', cur.fmt(r.me.score)))
        : h('small.muted', '아직 내 기록이 없어요. 한 판 해 보세요!'));
    } catch (e) { body.replaceChildren(h('p.err.mg-rank-empty', errorText(e.message))); }
  };
  const wrap = h('div.mg-sheet-wrap', { onclick: (e) => { if (e.target === wrap) close(); } },
    h('div.mg-sheet', { role: 'dialog', 'aria-label': '미니게임 랭킹' },
      h('div.grab', { 'aria-hidden': 'true' }),
      h('div.mg-sheet-head', h('b', pix('spark'), games.length > 1 ? ' 미니게임 랭킹' : ` ${first.title} 랭킹`), h('button.btn.small', { onclick: close, 'aria-label': '랭킹 닫기' }, '닫기')),
      tabs, sub, body, mine));
  stage?.dispatchEvent(new CustomEvent('mg-pause'));
  document.addEventListener('keydown', onKey);
  ov.append(wrap);
  load();
}

function rankList(game, r) {
  const top = r?.top || [];
  if (!top.length) return h('p.muted.mg-rank-empty', '아직 아무도 기록이 없어요. 첫 기록의 주인공이 되어 보세요!');
  return h('ol.mg-rank', top.map((x) => h(`li.mg-rank-row${x.me ? '.me' : ''}${x.rank <= 3 ? `.top${x.rank}` : ''}`,
    h('span.rk', `${x.rank}`), h('span.nm', x.name), h('b', game.fmt(x.score)))));
}

// 결과 = 게임 화면 위에 아래에서 올라오는 창 (뒤에 방금 한 게임이 그대로 보임, 고르기 전엔 안 닫힘)
function resultSheet(ov, content) {
  ov.querySelector('.mg-sheet-wrap')?.remove();
  ov.append(h('div.mg-sheet-wrap', h('div.mg-sheet.mg-result-sheet', { role: 'dialog', 'aria-label': '게임 결과' }, h('div.grab', { 'aria-hidden': 'true' }), content)));
}

function result(ov, game, score, r, err) {
  const isBest = r?.me && r.me.score === Math.round(score);
  if (isBest) sfx.catch(); else sfx.select();
  resultSheet(ov, h('div.stack',
    h('div.mg-result', spriteCanvas(partnerDex(), 64), h('div', h('small', game.title), h('b.big', game.fmt(Math.round(score))),
      isBest ? h('span.chip.hot', '내 최고 기록!') : r?.me ? h('small', `내 최고 ${game.fmt(r.me.score)}`) : null)),
    err ? h('p.err', err) : r?.me ? h('p', { style: { margin: 0 } }, `지금 ${r.players}명 중 ${r.me.rank}위`) : null,
    r ? h('div.mg-rank-scroll.short', rankList(game, r)) : null,
    h('button.btn.big.primary', { onclick: () => playGame(game, 'rank') }, '다시 하기'),
    h('div.mg-row2',
      h('button.btn', { onclick: () => openMinigames() }, '◀ 목록'),
      h('button.btn', { onclick: () => closeOverlay() }, '홈으로')),
  ));
}

function freeResult(ov, game, stages, ms) {
  sfx.catch();
  const n = Math.max(0, Math.round(stages));
  resultSheet(ov, h('div.stack',
    h('div.mg-result', spriteCanvas(partnerDex(), 64), h('div', h('small', `${game.title} · 자유 모드`), h('b.big', n ? `${n}단계 클리어!` : '아직 0단계'),
      !n && h('small', '클리어한 단계가 없어요. 다시 도전!'),
      h('small', `${Math.floor(ms / 60000)}분 ${Math.floor(ms / 1000) % 60}초 동안 놀았어요`))),
    h('small.muted', '자유 모드는 랭킹에 들어가지 않아요. 랭킹 모드에서 5단계 기록에 도전해 보세요!'),
    h('button.btn.big.primary', { onclick: () => playGame(game, 'free') }, '자유 모드 다시'),
    h('button.btn', { onclick: () => playGame(game, 'rank') }, '랭킹 모드 하기'),
    h('div.mg-row2',
      h('button.btn', { onclick: () => openMinigames() }, '◀ 목록'),
      h('button.btn', { onclick: () => closeOverlay() }, '홈으로')),
  ));
}
