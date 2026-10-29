// 몬스터 요트: 주사위 5개, 한 턴에 3번까지 굴리고 12칸 중 하나를 채운다. 최고 325점 (+보너스 포함).
import { h } from '../ui.js';
import { drawMon, spritesLoaded } from './common.js';

const NAVY = '#182030'; const CREAM = '#fffdf4'; const RED = '#e04040'; const GOLD = '#f8c030';

// 칸 이름 (위 6칸 + 아래 6칸)
export const CATS = [
  { id: 'n1', name: '1 에이스' }, { id: 'n2', name: '2 듀스' }, { id: 'n3', name: '3 트레이' },
  { id: 'n4', name: '4 포' }, { id: 'n5', name: '5 파이브' }, { id: 'n6', name: '6 식스' },
  { id: 'choice', name: '초이스' }, { id: 'four', name: '포카드' }, { id: 'full', name: '풀하우스' },
  { id: 'ss', name: 'S.스트레이트' }, { id: 'ls', name: 'L.스트레이트' }, { id: 'yacht', name: '요트' },
];
const UPPER = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'];

// 점수 계산 (dice = 1~6 숫자 5개)
export function scoreOf(cat, dice) {
  const cnt = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) cnt[d]++;
  const sum = dice.reduce((a, b) => a + b, 0);
  const has = (...fs) => fs.every((f) => cnt[f] > 0);
  const kinds = cnt.filter((c) => c > 0).sort();
  if (cat[0] === 'n') { const f = Number(cat[1]); return cnt[f] * f; }
  switch (cat) {
    case 'choice': return sum;
    case 'four': return cnt.some((c) => c >= 4) ? sum : 0;
    case 'full': return kinds.length === 2 && kinds[0] === 2 && kinds[1] === 3 ? sum : 0;
    case 'ss': return has(1, 2, 3, 4) || has(2, 3, 4, 5) || has(3, 4, 5, 6) ? 15 : 0;
    case 'ls': return has(1, 2, 3, 4, 5) || has(2, 3, 4, 5, 6) ? 30 : 0;
    case 'yacht': return cnt.some((c) => c === 5) ? 50 : 0;
    default: return 0;
  }
}

// 표 합계: 위 합, 보너스, 전체
export function totals(sheet) {
  const upper = UPPER.reduce((a, k) => a + (sheet[k] ?? 0), 0);
  const bonus = upper >= 63 ? 35 : 0;
  const total = CATS.reduce((a, c) => a + (sheet[c.id] ?? 0), 0) + bonus;
  return { upper, bonus, total };
}

const CSS = `
.mgy-wrap { width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 8px; color: ${NAVY}; }
.mgy-head { display: flex; align-items: center; gap: 8px; }
.mgy-mon { width: 64px; height: 64px; margin: -6px -4px -6px -8px; image-rendering: pixelated; flex: none; }
.mgy-mon.mgy-bounce { animation: mgy-bounce .5s ease-out 2; }
.mgy-mon.mgy-sad { animation: mgy-sad 1.2s ease-in-out 1; }
@keyframes mgy-bounce { 0%,100% { transform: translateY(0); } 40% { transform: translateY(-14px); } }
@keyframes mgy-sad { 0%,100% { transform: none; } 30%,70% { transform: translateY(4px) rotate(-8deg); filter: saturate(.3); } }
.mgy-bubble { flex: 1; min-width: 0; padding: 6px 10px; border: 3px solid ${NAVY}; border-radius: 8px; background: ${CREAM}; font-size: 14px; line-height: 1.3; }
.mgy-turn { flex: none; font-size: 12px; font-weight: bold; text-align: center; }
.mgy-turn b { display: block; font-size: 18px; }
.mgy-dice { display: flex; justify-content: center; gap: 6px; }
.mgy-die { position: relative; width: 60px; height: 78px; padding: 0; border: 0; background: none; font: inherit; color: ${NAVY}; cursor: pointer; display: flex; flex-direction: column; align-items: center; }
.mgy-die:disabled { cursor: default; }
.mgy-die canvas { width: 60px; height: 60px; image-rendering: pixelated; display: block; border-radius: 6px; }
.mgy-die.held canvas { box-shadow: 0 0 0 3px ${GOLD}; transform: translateY(2px); }
.mgy-die small { font-size: 11px; font-weight: bold; height: 12px; line-height: 12px; margin-top: 5px; }
.mgy-die.held small { color: #a06800; }
.mgy-dice.mgy-shake .mgy-die:not(.held) canvas { animation: mgy-shake .12s linear infinite; }
@keyframes mgy-shake { 0% { transform: rotate(-8deg); } 50% { transform: rotate(8deg) translateY(-3px); } 100% { transform: rotate(-8deg); } }
.mgy-roll { min-height: 48px; border: 3px solid ${NAVY}; border-radius: 10px; background: ${RED}; color: #fff; font: inherit; font-size: 17px; font-weight: bold; box-shadow: inset 0 -4px 0 rgba(0,0,0,.25); cursor: pointer; }
.mgy-roll:disabled { background: #a8acb8; color: #eef; cursor: default; }
.mgy-sheet { display: grid; grid-template-columns: 1fr 1fr; grid-auto-flow: column; grid-template-rows: repeat(6, auto); gap: 4px 6px; }
.mgy-cat { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 4px; padding: 0 8px; border: 2px solid ${NAVY}; border-radius: 6px; background: #f8f8e8; font: inherit; font-size: 13px; color: ${NAVY}; cursor: pointer; text-align: left; }
.mgy-cat span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.mgy-cat b { font-size: 16px; flex: none; }
.mgy-cat.can { background: ${CREAM}; }
.mgy-cat.can b { color: ${RED}; }
.mgy-cat.can.zero b { color: #a8acb8; }
.mgy-cat.can.best { box-shadow: inset 0 0 0 2px ${GOLD}; background: #fff4c8; }
.mgy-cat.done { background: #d8dce8; border-color: #586078; cursor: default; }
.mgy-cat.done b { color: ${NAVY}; }
.mgy-cat:disabled:not(.done) { cursor: default; }
.mgy-cat:disabled:not(.done) b { color: #a8acb8; }
.mgy-sum { display: flex; justify-content: space-between; align-items: center; gap: 6px; padding: 6px 10px; border: 3px solid ${NAVY}; border-radius: 8px; background: ${CREAM}; font-size: 13px; }
.mgy-sum .mgy-total { font-size: 20px; color: ${RED}; }
.mgy-sum .ok { color: #2a8040; }
`;

// 몬스터볼 모양 점 (n×n 도트)
function ball(g, x0, y0, n) {
  const m = (n - 1) / 2; const r2 = (n / 2) ** 2 + 0.3;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const dx = i - m; const dy = j - m;
      if (dx * dx + dy * dy > r2) continue;
      let c = j < Math.floor(m) ? RED : j === Math.floor(m) ? NAVY : '#c8d0e0';
      if (n >= 7 && j === Math.floor(m) && Math.abs(dx) < 1.5) c = '#ffffff';
      if (n >= 7 && Math.abs(dx) + Math.abs(dy) > n * 0.62 && dx * dx + dy * dy > (n / 2 - 1) ** 2) c = NAVY; // 테두리
      g.fillStyle = c; g.fillRect(x0 + i, y0 + j, 1, 1);
    }
  }
}

const PIPS = { 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };

// 20×20 도트 주사위
function paintDie(g, face, held, blank) {
  g.clearRect(0, 0, 20, 20);
  g.fillStyle = NAVY; g.fillRect(1, 0, 18, 20); g.fillRect(0, 1, 20, 18);
  g.fillStyle = held ? '#fff4c8' : CREAM; g.fillRect(1, 1, 18, 18);
  g.fillStyle = held ? '#e8d090' : '#d8d8c0'; g.fillRect(1, 17, 18, 2); g.fillRect(17, 1, 2, 18);
  if (blank) { g.fillStyle = '#c8ccd8'; g.fillRect(8, 5, 4, 2); g.fillRect(11, 6, 2, 4); g.fillRect(9, 9, 2, 3); g.fillRect(9, 13, 2, 2); return; }
  if (face === 1) { ball(g, 5, 5, 9); return; }
  for (const [cx, cy] of PIPS[face]) ball(g, 2 + cx * 5, 2 + cy * 5, 5);
}

export default {
  id: 'yacht',
  title: '몬스터 요트',
  start(stage, api) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    let alive = true;

    if (!document.getElementById('mgy-style')) document.head.append(h('style#mgy-style', CSS));

    const dice = [1, 1, 1, 1, 1];
    const held = [false, false, false, false, false];
    const sheet = {};        // id → 점수 (채운 칸)
    let rollsLeft = 3; let rolling = false; let over = false;
    const turn = () => Object.keys(sheet).length + 1;

    // 마스코트
    const mon = h('canvas.mgy-mon', { width: 64, height: 64 });
    const mg = mon.getContext('2d'); mg.imageSmoothingEnabled = false;
    const partner = api.partner();
    const drawMascot = () => { mg.clearRect(0, 0, 64, 64); drawMon(mg, partner, 0, 0, 64, true); };
    drawMascot(); Promise.resolve(spritesLoaded).then(() => alive && drawMascot()).catch(() => {});
    const bubble = h('div.mgy-bubble', '주사위를 굴려 보자!');
    const turnEl = h('div.mgy-turn', '턴', h('b', '1/12'));
    const react = (kind) => {
      if (reduce) return;
      mon.classList.remove('mgy-bounce', 'mgy-sad'); void mon.offsetWidth;
      if (kind) mon.classList.add(kind);
    };

    // 주사위
    const dieEls = dice.map((_, i) => {
      const c = h('canvas', { width: 20, height: 20 });
      const tag = h('small', '');
      const b = h('button.mgy-die', { type: 'button', 'aria-label': `주사위 ${i + 1}`, onclick: () => toggleHold(i) }, c, tag);
      return { b, g: c.getContext('2d'), tag };
    });
    const diceRow = h('div.mgy-dice', dieEls.map((d) => d.b));
    const rollBtn = h('button.mgy-roll', { type: 'button', onclick: () => roll() }, '');

    // 점수표
    const catEls = {};
    for (const c of CATS) {
      const val = h('b', '');
      const b = h('button.mgy-cat', { type: 'button', onclick: () => pick(c.id) }, h('span', c.name), val);
      catEls[c.id] = { b, val };
    }
    const sheetEl = h('div.mgy-sheet', CATS.map((c) => catEls[c.id].b));
    const upperEl = h('span'); const totalEl = h('b.mgy-total');
    const sumEl = h('div.mgy-sum', upperEl, h('span', '합계 ', totalEl));

    stage.append(h('div.mgy-wrap', h('div.mgy-head', mon, bubble, turnEl), diceRow, rollBtn, sheetEl, sumEl));

    function render() {
      const fresh = rollsLeft === 3;
      dieEls.forEach((d, i) => {
        paintDie(d.g, dice[i], held[i], fresh);
        d.b.classList.toggle('held', held[i]);
        d.tag.textContent = held[i] ? '고정' : '';
        d.b.disabled = fresh || rolling || over || rollsLeft === 0;
        d.b.setAttribute('aria-pressed', held[i] ? 'true' : 'false');
        d.b.setAttribute('aria-label', fresh ? `주사위 ${i + 1}` : `주사위 ${i + 1}: ${dice[i]}${held[i] ? ' (고정)' : ''}`);
      });
      rollBtn.textContent = over ? '끝!' : rollsLeft > 0 ? `굴리기 (남은 횟수 ${rollsLeft})` : '칸을 골라 기록하세요';
      rollBtn.disabled = over || rolling || rollsLeft === 0 || held.every(Boolean);
      let best = -1;
      if (!fresh) for (const c of CATS) if (sheet[c.id] == null) best = Math.max(best, scoreOf(c.id, dice));
      for (const c of CATS) {
        const { b, val } = catEls[c.id];
        const done = sheet[c.id] != null;
        const pot = done || fresh ? 0 : scoreOf(c.id, dice);
        b.className = 'mgy-cat';
        if (done) { b.classList.add('done'); val.textContent = sheet[c.id]; b.disabled = true; }
        else if (fresh || rolling) { val.textContent = '-'; b.disabled = true; }
        else {
          b.classList.add('can'); if (!pot) b.classList.add('zero'); if (pot > 0 && pot === best) b.classList.add('best');
          val.textContent = pot; b.disabled = over;
        }
      }
      const t = totals(sheet);
      upperEl.replaceChildren('상단 ', h(`b${t.upper >= 63 ? '.ok' : ''}`, `${t.upper}/63`), ` · 보너스 ${t.bonus ? '+35' : '0'}`);
      totalEl.textContent = t.total;
      turnEl.lastChild.textContent = `${Math.min(12, turn())}/12`;
    }

    function toggleHold(i) {
      if (rolling || over || rollsLeft === 3 || rollsLeft === 0) return;
      held[i] = !held[i]; api.sfx.blip(); render();
    }

    function roll() {
      if (rolling || over || rollsLeft === 0) return;
      if (rollsLeft === 3) held.fill(false);
      rollsLeft--; rolling = true;
      api.sfx.scan();
      const final = dice.map((d, i) => (held[i] ? d : 1 + Math.floor(Math.random() * 6)));
      const land = () => {
        if (!alive) return;
        final.forEach((v, i) => { dice[i] = v; });
        rolling = false; diceRow.classList.remove('mgy-shake');
        api.sfx.ballPop();
        const y = scoreOf('yacht', dice) === 50; const ls = scoreOf('ls', dice) === 30;
        bubble.textContent = y ? '요트다!! 대박!' : ls ? '스트레이트 완성!' : rollsLeft ? '고정할 주사위를 눌러요' : '칸을 골라 기록!';
        if (y || ls) react('mgy-bounce');
        render();
      };
      if (reduce) { land(); return; }
      diceRow.classList.add('mgy-shake');
      render();
      const tick = () => {
        if (!alive || !rolling) return;
        dieEls.forEach((d, i) => { if (!held[i]) paintDie(d.g, 1 + Math.floor(Math.random() * 6), false, false); });
        later(tick, 70);
      };
      tick();
      later(land, 500);
    }

    function pick(id) {
      if (rolling || over || rollsLeft === 3 || sheet[id] != null) return;
      const s = scoreOf(id, dice);
      const hadBonus = totals(sheet).bonus;
      sheet[id] = s;
      const name = CATS.find((c) => c.id === id).name;
      if (!s) { api.sfx.wrong(); react('mgy-sad'); bubble.textContent = `${name} 0점… 괜찮아!`; }
      else if (id === 'yacht' || id === 'ls') { api.sfx.catch(); react('mgy-bounce'); bubble.textContent = `${name} ${s}점! 최고야!`; }
      else { api.sfx.correct(); bubble.textContent = `${name} ${s}점!`; }
      if (!hadBonus && totals(sheet).bonus) { bubble.textContent = '상단 보너스 +35!'; react('mgy-bounce'); }
      rollsLeft = 3; held.fill(false);
      if (Object.keys(sheet).length === CATS.length) {
        over = true;
        const total = totals(sheet).total;
        render();
        later(() => { bubble.textContent = `끝! 최종 ${total}점`; api.sfx.statUp(); react('mgy-bounce'); }, 700);
        later(() => api.end(total, Math.round(performance.now() - t0)), 2400);
        return;
      }
      render();
    }

    render();
    return () => { alive = false; for (const t of timers) clearTimeout(t); timers.clear(); };
  },
};
