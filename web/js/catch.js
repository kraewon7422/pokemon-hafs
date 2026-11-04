// 잡기 화면: 부스에서 포켓몬을 받기 직전, 공을 위로 휙 던져 잡는 짧은 장면 (Phaser 3, 270×480 세로 화면).
// 포켓몬은 이미 정해져 있다. 공을 다 써도 보통은 지쳐서 얌전해짐 (반드시 잡힘). 던지기 솜씨는 등급(약간의 EXP)만 정한다.
//   catchScene({ dex, name, rarity, time, balls = 3, ball = 'red'|'hafs'|'safari', fleeChance = 0, fleeAfterAll = false, remaining = 0,
//                fleeMiss = 0, canRun = false })
//     → Promise<{ grade:'none'|'nice'|'great'|'excellent', curve, throws, skipped, skipAll, fled, ran }>
//   fleeMiss: 공이 빗나갈(튕겨 나올) 때마다 이 확률로 도망 (사파리존). canRun: '도망가기' 버튼 (사파리존, 바로 잡기 대신) → fled·ran.
//   fleeAfterAll: 공을 다 쓰면 도망 (레이드 보스). 아니면 fleeChance 확률로 도망 (부스 5%), 아니면 지쳐서 잡힘.
//   remaining > 0: '남은 포켓몬 모두 바로 잡기 (N)' 버튼도 보임 → 누르면 이번 것도 바로 잡고 skipAll:true.
//   레이드 (fleeAfterAll) 에서는 '바로 잡기' 버튼이 없음 (누르면 공 없이 잡히니까).
// 배경: img/catch/{day,sunset,night}.png (CC0, tools/draw_catch_bg.py). 공·별·반짝이는 이 파일에서 도트로 그림.
// 공은 3D 로 날아감: x 좌우 · y 높이 · z 깊이, 중력 + 약한 공기 저항 + 커브볼 회전(마그누스 힘), 원근으로 화면에 그림.
// Phaser 를 못 불러오거나 무엇이든 실패하면 바로 { grade:'none', skipped:true } 로 끝냄 → 축하 화면을 절대 막지 않음.
import { sfx, bgmPush, bgmBeat, bgmReady } from './sfx.js';
import { josa, reducedMotion } from './ui.js';
import { loadPhaser } from './games/common.js';
import { atlasURL, monAnim } from './sprites.js';

const W = 270, H = 480;                 // 논리 화면 (배경 그림과 같음)
const SPOT_X = 135, FEET_Y = 356;       // 포켓몬이 서는 밝은 자리 (가운데 y=352, 발은 살짝 아래)
const HOME = { x: 135, y: 436 };        // 손에 든 공 자리
const MON_K = 2;                        // 포켓몬 배율 (64×64 → 128, 모든 포켓몬 같음)
const CYCLE = 1.6;                      // 안쪽 고리가 줄어드는 한 바퀴 (초)
const HIT_PAD = 8;                      // 고리 밖으로 공 반지름만큼은 봐 줌

// ─────── 3D 세계 → 화면 (원근 카메라, 배경 그림에 맞춤) ───────
// 세계 단위 ≈ 미터. x 오른쪽 · y 높이 (땅 0) · z 앞쪽 (던지는 곳 z=0 → 포켓몬 z=ZM).
// 카메라: z=-ZC, 높이 CAM_H 에서 수평으로 봄 → 지평선 화면 y=HY.  땅의 z=0 → 화면 y=HOME.y, 땅의 z=ZM → 자리 가운데 y=352.
const HY = 236, SPOT_Y = 352, ZC = 5;
const ZM = ZC * ((HOME.y - HY) / (SPOT_Y - HY) - 1);      // ≈ 3.62
const CAM_H = 0.22 * (ZC + ZM);                           // 자리 타원 (세로/가로 ≈ 0.22) 에서 나온 카메라 높이 ≈ 1.9
const FOC = (HOME.y - HY) * ZC / CAM_H;                   // 초점 거리 (도트) ≈ 527
const BALL_K = 2;                                         // z=0 에서 공 배율 (15 도트 → 30)
const BR = 7.5 * BALL_K * ZC / FOC;                       // 공 반지름 (세계) ≈ 0.14
const GRAV = 9.8, DRAG = 0.03;                            // 중력, 공기 저항 (a = -DRAG·|v|·v)
const LAUNCH = 38 * Math.PI / 180;                        // 던지는 각 (위로)
const CURVE_M = 0.75;                                     // 커브볼 옆 가속 = CURVE_M · 앞 속도 (≈ 4 m/s²)
const STEP = 1 / 240;                                     // 물리 한 걸음 (초)
const BOUNCE = 0.45, SKID = 0.78, ROLL = 4;             // 땅에 튈 때 위아래 반발 · 앞뒤 마찰 · 구르는 마찰 (m/s²)
// 휙 속도 (CSS px/초) → 힘. S_MID 로 던지면 딱 고리 가운데. 500~2500 은 늘 맞음 (힘 0.945~1.10배),
// 그 밖에서는 빨리 변해 약하면 앞에 떨어지고 (포켓몬 크기에 따라 ≈310~470 아래) 아주 세면 넘어감 (≈2700~4200 위).
const S_MID = 1118, S_SPAN = Math.sqrt(5);
const PW_LO = -Math.log(0.945), PW_HI = Math.log(1.10);

const BG_URL = (t) => new URL(`../img/catch/${t}.png`, import.meta.url).href;
// 배경 그림 맨 위 / 맨 아래 색 (화면이 그림보다 길 때 위아래를 채움)
const EDGE = { day: ['#19adf5', '#84c669'], sunset: ['#3a2868', '#9ca452'], night: ['#16102c', '#3f5c65'] };
const RING = { common: 0x58d858, rare: 0xf8a830, legendary: 0xf04848, mythic: 0xf04848 };
const BASE_P = { common: 0.6, rare: 0.4, legendary: 0.25, mythic: 0.25 };
const GRADE_K = { nice: 1.2, great: 1.5, excellent: 2.0 };
const GRADE_TXT = { nice: ['나이스!', '#ffffff'], great: ['그레이트!', '#98f080'], excellent: ['엑설런트!', '#ffd23f'] };
const RANK = { none: 0, nice: 1, great: 2, excellent: 3 };
const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* iOS: 없음 */ } };
const play = (n) => { try { sfx[n]?.(); } catch { /* 소리는 없어도 됨 */ } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const CANCEL = Symbol('cancel');
// 시험용: window.__czRandom = () => 0.3 처럼 주면 잡힘·쳐내기 운을 고정 (평소엔 Math.random)
const rand = () => (typeof window.__czRandom === 'function' ? window.__czRandom() : Math.random());

// ─────── 물리 (순수 함수) ───────
const proj = (x, y, z) => { const d = Math.max(0.6, z + ZC); return { x: SPOT_X + FOC * x / d, y: HY + FOC * (CAM_H - y) / d, d }; };
// 공기 중 한 걸음: 중력 + 공기 저항 + 커브 (옆 가속은 앞 속도에 비례 — 세로축으로 도는 공의 마그누스 힘)
function physStep(p, ax, h) {
  const sp = Math.hypot(p.vx, p.vy, p.vz);
  p.vx += (ax * p.vz - DRAG * sp * p.vx) * h;
  p.vy += (-GRAV - DRAG * sp * p.vy) * h;
  p.vz += (-DRAG * sp * p.vz) * h;
  p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
}
// 땅을 무시하고 포켓몬 면 (z=ZM) 을 지나는 점 (못 가면 null)
function simCross(p0, vx, vy, vz, ax) {
  const p = { x: p0.x, y: p0.y, z: p0.z, vx, vy, vz };
  for (let t = 0; t < 4; t += STEP) {
    const { x, y, z } = p;
    physStep(p, ax, STEP);
    if (p.z >= ZM) { const k = (ZM - z) / (p.z - z || 1); return { x: x + (p.x - x) * k, y: y + (p.y - y) * k, t: t + STEP * k }; }
    if (p.vz <= 0.05) break;
  }
  return null;
}
// 손을 놓은 화면 점 → 세계 점 (z=0 면 위, 땅보다 낮으면 땅 위에 놓고 그만큼 앞쪽으로)
function releaseAt(sx, sy) {
  let z = 0, y = CAM_H - (sy - HY) * ZC / FOC;
  if (y < BR) { y = BR; z = FOC * (CAM_H - BR) / Math.max(1, sy - HY) - ZC; }
  const d = z + ZC;
  return { x: (sx - SPOT_X) * d / FOC, y, z };
}
const power = (s) => {
  const u = clamp(Math.log(Math.max(1, s) / S_MID) / Math.log(S_SPAN), -3, 3);
  return Math.exp((u < 0 ? PW_LO : PW_HI) * (0.6 * u + 0.4 * u ** 3));
};
// 이 자리에서 LAUNCH 각으로 던져 화면 y=cy (고리 가운데 높이) 를 지나게 하는 속력
function nominalSpeed(p0, cy) {
  const yt = CAM_H - (cy - HY) * (ZM + ZC) / FOC;
  let lo = 1.5, hi = 25;
  for (let i = 0; i < 28; i++) {
    const v = (lo + hi) / 2; const r = simCross(p0, 0, v * Math.sin(LAUNCH), v * Math.cos(LAUNCH), 0);
    if (!r || r.y < yt) lo = v; else hi = v;
  }
  return (lo + hi) / 2;
}

export function defaultTime(d = new Date()) {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m >= 7 * 60 && m < 16 * 60) return 'day';
  if (m >= 16 * 60 && m < 19 * 60) return 'sunset';
  return 'night';
}

// 스타일은 처음 한 번만 넣음 (.cz- 로 시작)
function injectStyle() {
  if (document.getElementById('cz-style')) return;
  const s = document.createElement('style');
  s.id = 'cz-style';
  s.textContent = `
.cz-layer{position:fixed;inset:0;z-index:10000;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;overscroll-behavior:none;opacity:0;transition:opacity .25s}
.cz-layer.cz-on{opacity:1}
.cz-area{position:absolute;top:env(safe-area-inset-top,0px);right:env(safe-area-inset-right,0px);bottom:env(safe-area-inset-bottom,0px);left:env(safe-area-inset-left,0px);display:flex;align-items:center;justify-content:center}
.cz-box{position:relative;flex:none;overflow:hidden;touch-action:none;image-rendering:pixelated}
.cz-box canvas{display:block;image-rendering:pixelated;image-rendering:crisp-edges;touch-action:none}
.cz-btns{position:absolute;top:6px;right:6px;z-index:2;display:flex;flex-direction:column;align-items:flex-end;gap:8px;max-width:calc(100% - 92px)}
.cz-skip{position:relative;min-width:44px;min-height:44px;padding:0 12px;box-sizing:border-box;border:3px solid #f8f8f8;border-radius:6px;background:rgba(24,32,48,.78);color:#fff;font:bold 16px/1 Galmuri11,'Apple SD Gothic Neo',sans-serif;white-space:nowrap;word-break:keep-all;cursor:pointer;touch-action:manipulation;box-shadow:0 2px 0 rgba(0,0,0,.3)}
.cz-all{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:6px 10px;font-size:14px;line-height:1.15;background:rgba(150,40,40,.86)}
.cz-all span{display:block;white-space:nowrap}
.cz-skip:active{transform:translateY(1px)}
.cz-skip:focus-visible{outline:3px solid #ffd23f;outline-offset:2px}
@media (prefers-reduced-motion:reduce){.cz-layer{transition:none}}`;
  document.head.append(s);
}

// ───────────── 도트 그림 (캔버스 → Phaser 텍스처) ─────────────
function sheet(sc, key, fw, fh, frames) {
  const cv = document.createElement('canvas'); cv.width = fw * frames.length; cv.height = fh;
  const g = cv.getContext('2d');
  frames.forEach((fn, i) => fn((x, y, c) => { if (x < 0 || y < 0 || x >= fw || y >= fh || !c) return; g.fillStyle = c; g.fillRect(i * fw + x, y, 1, 1); }));
  const t = sc.textures.addCanvas(key, cv);
  frames.forEach((_, i) => t.add(i, 0, i * fw, 0, fw, fh));
}
const rowsPx = (rows, pal) => (px) => rows.forEach((r, y) => [...r].forEach((ch, x) => px(x, y, pal[ch])));

// 공 15×15 (가운데 7,7). 띠는 가운데 줄, 단추는 가운데 점 → 정확히 가운데. 프레임 15×19: 0 닫힘, 1 열림(뚜껑 4칸 위)
//   red  = 빨강·하양 (부스)   hafs = HAFS 볼: 파랑 위 · 금색 띠 (가운데 3줄) · 하양 아래 (레이드)
//   safari = 사파리볼: 카키 위에 초록 얼룩 무늬 · 아래는 밝은 모래색 (사파리존)
const BALL_OY = 4, BALL_ORIGIN_Y = (BALL_OY + 7.5) / 19;
const BALL_COL = {
  red: { hi: '#ff8a78', dark: '#b02030', top: '#e83838' },
  hafs: { hi: '#8cb4ff', dark: '#1c3c98', top: '#3064d0' },
  safari: { hi: '#e8e0a0', dark: '#6a6a28', top: '#a8a050', spot: '#4e7a2c', low: '#efe4bc', lowD: '#c8b888' },
};
// 사파리볼 얼룩 (위 반쪽, 공 안의 좌표) — 손으로 찍은 무늬
const CAMO = new Set(['5,1', '6,1', '9,1', '3,3', '4,3', '4,2', '8,2', '9,2', '10,2', '10,3', '11,3', '11,4', '6,4', '7,4', '7,3', '7,5', '8,5', '2,5', '3,5', '12,5', '12,4', '9,5', '5,5']);
function ballFrame(open, style = 'red') {
  const P = BALL_COL[style] || BALL_COL.red; const hafs = style === 'hafs'; const saf = style === 'safari';
  const inside = (x, y) => x >= 0 && y >= 0 && x < 15 && y < 15 && (x - 7) ** 2 + (y - 7) ** 2 <= 51;
  return (px) => {
    if (open) for (let y = 1; y <= 3; y++) for (let x = 3; x <= 11; x++) px(x, BALL_OY + 7 - y, y === 3 && (x < 5 || x > 9) ? null : '#fff4a8');
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
      if (!inside(x, y)) continue;
      const dx = x - 7, dy = y - 7, d2 = dx * dx + dy * dy;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      let c;
      if (edge) c = '#182030';
      else if (d2 <= 10) c = d2 <= 1 ? '#ffffff' : d2 <= 4 ? '#e4e8f0' : '#182030';   // 단추
      else if (hafs && Math.abs(dy) <= 1) c = dy === 0 ? '#ffd23f' : '#c89018';           // HAFS 금색 띠 (가운데 위아래 대칭)
      else if (dy === 0) c = '#182030';                                                 // 띠
      else if (dy < 0) c = dx >= -4 && dx <= -2 && dy >= -5 && dy <= -3 ? P.hi : dy === -1 || (hafs && dy === -2) ? P.dark : saf && CAMO.has(`${x},${y}`) ? P.spot : P.top;
      else if (saf) c = dy >= 4 || dx >= 5 ? P.lowD : P.low;
      else c = dy >= 4 || dx >= 5 ? '#c4ccd8' : '#ffffff';
      px(x, y + BALL_OY - (open && dy < 0 ? 4 : 0), c);
    }
  };
}
// 공 그림 하나 (닫힘) → 작은 캔버스 (앱 화면의 아이콘용, 예: 사파리존 남은 볼). k = CSS 배율
export function ballCanvas(style = 'red', k = 2) {
  const c = document.createElement('canvas'); c.width = 15; c.height = 15; c.className = 'ball-ico';
  const g = c.getContext('2d');
  ballFrame(false, style)((x, y, col) => { if (col) { g.fillStyle = col; g.fillRect(x, y - BALL_OY, 1, 1); } });
  c.style.width = c.style.height = `${15 * k}px`; c.style.imageRendering = 'pixelated';
  return c;
}
const STAR = rowsPx(['....k....', '...kyk...', '...kyk...', 'kkkywykkk', 'kyywwwyyk', '.kkywykk.', '..kyyyk..', '.kyk.kyk.', '.kk...kk.'], { k: '#5a3a10', y: '#ffd23f', w: '#fff8d0' });
const SPARK = rowsPx(['..w..', '..y..', 'wyWyw', '..y..', '..w..'], { w: '#fff4a8', y: '#ffd23f', W: '#ffffff' });
const DOT = rowsPx(['ww', 'ww'], { w: '#ffffff' });
const ANGER = rowsPx(['.rr.rr.', 'rr...rr', 'r.....r', '.......', 'r.....r', 'rr...rr', '.rr.rr.'], { r: '#ff3040' });
const SMOKE = rowsPx(['..sss..', '.swwws.', 'swwwwws', 'swwwwss', 'swwwss.', '.ssss..', '.......'], { s: '#5a6478', w: '#f4f6fa' });
const ARROW = rowsPx(['...k...', '..kwk..', '.kwwwk.', 'kwwwwwk', 'kkwwwkk', '..kwk..', '..kwk..', '..kkk..'], { k: '#182030', w: '#ffffff' });

// ═════════════════════════════ 장면 ═════════════════════════════
// onThrow(n) = 볼을 던질 때마다 (n = 이 장면에서 던진 수) — 사파리존이 기기에 적어 둠 (앱을 닫아도 볼 수가 이어지게)
export async function catchScene({ dex, name, rarity = 'common', time, balls = 3, ball: ballStyle = 'red', fleeChance = 0, fleeAfterAll = false, remaining = 0, fleeMiss = 0, canRun = false, onThrow = null } = {}) {
  const tod = EDGE[time] ? time : defaultTime();
  const BALLS = clamp(Math.round(Number(balls) || 3), 1, 20);
  const style = BALL_COL[ballStyle] ? ballStyle : 'red';
  const fleeP = clamp(Number(fleeChance) || 0, 0, 1);
  const missP = clamp(Number(fleeMiss) || 0, 0, 1);
  const left = Math.max(0, Math.round(Number(remaining) || 0));
  const canSkip = !fleeAfterAll && !canRun;
  const rar = RING[rarity] ? rarity : 'common';
  const nm = String(name || '포켓몬');
  const rm = (() => { try { return reducedMotion(); } catch { return false; } })();
  let speed = 1;                        // 바로 잡기 = 두 배 빠르게
  const D = (ms) => Math.round(ms * (rm ? 0.5 : 1) * speed);

  let done = false, dead = false, game = null, ro = null, bootTimer = 0, resolveP;
  const result = { grade: 'none', curve: false, throws: 0, skipped: false, skipAll: false, fled: false, ran: false };
  const out = new Promise((r) => { resolveP = r; });
  const listeners = [];
  const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); listeners.push([el, ev, fn, opt]); };

  let layer, area, box, skipBtn, allBtn;
  // 배경 음악: 잡기 장면 동안 야생 곡 (레이드 보스 = HAFS 볼이면 배틀 곡), 끝나면 원래 곡으로
  const TRACK = style === 'hafs' ? 'battle' : 'wild';
  const music = bgmPush(TRACK);
  const cleanup = () => {
    dead = true;
    music.pop();
    clearTimeout(bootTimer);
    ro?.disconnect();
    for (const [el, ev, fn, opt] of listeners) el.removeEventListener(ev, fn, opt);
    listeners.length = 0;
    if (game) { try { game.loop.wake(); } catch { /* */ } try { game.destroy(true); } catch { /* */ } game = null; }
    layer?.remove();
  };
  // 정확히 한 번만 끝냄
  const finish = (fade = true) => {
    if (done) return; done = true;
    const r = { grade: result.grade, curve: result.curve, throws: result.throws, skipped: result.skipped, skipAll: result.skipAll, fled: result.fled, ran: result.ran };
    const end = () => { cleanup(); resolveP(r); };
    if (fade && layer && !rm) { layer.classList.remove('cz-on'); setTimeout(end, 280); } else end();
  };
  const bail = () => { result.skipped = true; result.grade = 'none'; finish(false); };

  try {
    injectStyle();
    const [top, bot] = EDGE[tod];
    layer = document.createElement('div');
    layer.className = 'cz-layer';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-label', `${nm} 잡기`);
    layer.style.background = `linear-gradient(${top} 0 50%, ${bot} 50% 100%)`;
    area = document.createElement('div'); area.className = 'cz-area';
    box = document.createElement('div'); box.className = 'cz-box';
    // 오른쪽 위 버튼: 바로 잡기 (+ 남은 포켓몬이 있으면 모두 바로 잡기). 레이드는 버튼 없음
    const btns = document.createElement('div'); btns.className = 'cz-btns';
    skipBtn = document.createElement('button'); skipBtn.type = 'button'; skipBtn.className = 'cz-skip'; skipBtn.textContent = '바로 잡기';
    if (canSkip) btns.append(skipBtn);
    let runBtn = null;
    if (canRun) { runBtn = document.createElement('button'); runBtn.type = 'button'; runBtn.className = 'cz-skip'; runBtn.textContent = '도망가기'; btns.append(runBtn); }
    if (canSkip && left > 0) {
      allBtn = document.createElement('button'); allBtn.type = 'button'; allBtn.className = 'cz-skip cz-all';
      allBtn.setAttribute('aria-label', `남은 포켓몬 모두 바로 잡기 (${left}마리)`);
      const l1 = document.createElement('span'); l1.textContent = '남은 포켓몬 모두';
      const l2 = document.createElement('span'); l2.textContent = `바로 잡기 (${left})`;
      allBtn.append(l1, l2); btns.append(allBtn);
    }
    box.append(btns); area.append(box); layer.append(area);
    document.body.append(layer);
    requestAnimationFrame(() => layer?.classList.add('cz-on'));

    // 화면에 맞추기: 세로 270×480 을 남는 자리에 꽉 (PC 는 폭 560 까지), 가능하면 기기 픽셀 정수 배
    const fit = () => {
      if (dead) return;
      const r = area.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
      const k0 = Math.max(0.5, Math.min(Math.min(r.width, 560) / W, r.height / H));
      const kInt = Math.floor(k0 * dpr) / dpr;
      const k = kInt >= k0 * 0.8 && kInt > 0 ? kInt : k0;
      box.style.width = `${Math.round(W * k)}px`; box.style.height = `${Math.round(H * k)}px`;
      const cv = game?.canvas;
      if (cv) { cv.style.width = box.style.width; cv.style.height = box.style.height; cv.style.margin = '0'; }
    };
    fit();
    ro = new ResizeObserver(fit); ro.observe(area);
    on(window, 'resize', fit);

    // 스크롤·확대·길게 누르기 막기
    const isBtn = (t) => !!t?.closest?.('.cz-skip');
    const stop = (e) => { if (!isBtn(e.target)) e.preventDefault(); };
    on(layer, 'touchstart', stop, { passive: false });
    on(layer, 'touchmove', (e) => e.preventDefault(), { passive: false });
    on(layer, 'gesturestart', (e) => e.preventDefault());
    on(layer, 'contextmenu', (e) => e.preventDefault());
    on(layer, 'dblclick', (e) => e.preventDefault());

    // 바로 잡기 (누르는 순간)
    let skipFn = null;
    const doSkip = (e) => { e?.preventDefault?.(); if (done || result.skipped || result.fled) return; result.skipped = true; play('select'); if (skipFn) skipFn(); else bail(); };
    const doAll = (e) => { if (done || result.skipped || result.fled) return; result.skipAll = true; doSkip(e); };
    on(skipBtn, 'pointerdown', doSkip);
    on(skipBtn, 'click', doSkip);
    if (allBtn) { on(allBtn, 'pointerdown', doAll); on(allBtn, 'click', doAll); }
    // 도망가기 (사파리존): 공을 겨눌 때만
    let runFn = null;
    const doRun = (e) => { e?.preventDefault?.(); if (done || result.skipped || result.fled || !runFn) return; runFn(); };
    if (runBtn) { on(runBtn, 'pointerdown', doRun); on(runBtn, 'click', doRun); }

    // Phaser 가 8초 안에 안 뜨면 그냥 넘어감
    let sceneReady = false;
    bootTimer = setTimeout(() => { if (!sceneReady) bail(); }, 8000);
    const fonts = document.fonts?.load
      ? Promise.race([Promise.all([document.fonts.load('12px Galmuri11'), document.fonts.load('bold 12px Galmuri11')]).catch(() => {}), new Promise((r) => setTimeout(r, 1500))])
      : Promise.resolve();
    // 곡이 나오기 시작할 때까지도 기다림 (최대 1.5초) → 포켓몬 등장을 곡의 박에 맞출 수 있게
    const [Phaser, SHEET] = await Promise.all([loadPhaser(), atlasURL([dex]), fonts, bgmReady(TRACK, 1500)]);
    const ATLAS_URL = SHEET.url;     // 이 포켓몬 한 칸짜리 그림판 (sprites.js)
    if (dead) return out;

    let tick = () => {};
    game = new Phaser.Game({
      type: Phaser.AUTO, parent: box, width: W, height: H,
      pixelArt: true, roundPixels: true, antialias: false, backgroundColor: bot, banner: false,
      audio: { noAudio: true }, input: { keyboard: false, mouse: false, touch: false, gamepad: false }, disableContextMenu: true,
      scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
      callbacks: { postBoot: (g) => { if (dead) g.destroy(true); } },
      scene: {
        key: 'catch',
        preload() {
          this.load.spritesheet('mons', ATLAS_URL, { frameWidth: 64, frameHeight: 64 });
          this.load.image('bg', BG_URL(tod));
        },
        create() {
          try { setup(this); sceneReady = true; clearTimeout(bootTimer); } catch (e) { console.warn('[catch] setup', e); bail(); }
        },
        // 물리는 1/240초 고정 걸음이라 프레임이 길어도 같은 궤적 → 0.1초까지는 그대로 (느린 폰 10~20fps 에서 공이 느려지지 않게)
        update(t, d) { try { tick(Math.min(0.1, d / 1000)); } catch (e) { console.warn('[catch] tick', e); bail(); } },
      },
    });
    if (game.canvas) { game.canvas.style.imageRendering = 'pixelated'; box.insertBefore(game.canvas, btns); }
    game.scale?.on?.('resize', fit);
    fit();

    // ═══════════════════════ 장면 만들기 ═══════════════════════
    function setup(sc) {
      // 텍스처
      sheet(sc, 'ball', 15, 19, [ballFrame(false, style), ballFrame(true, style)]);
      sheet(sc, 'smoke', 7, 7, [SMOKE]);
      sheet(sc, 'star', 9, 9, [STAR]);
      sheet(sc, 'spark', 5, 5, [SPARK]);
      sheet(sc, 'dot', 2, 2, [DOT]);
      sheet(sc, 'anger', 7, 7, [ANGER]);
      sheet(sc, 'arrow', 7, 8, [ARROW]);
      const monTex = sc.textures.get('mons');
      const frame = SHEET.frame(dex);
      // 포켓몬 모양 (보이는 픽셀 테두리) + 흰 실루엣 (빛으로 변할 때)
      let bb = { x0: 12, y0: 8, x1: 52, y1: 63 };
      {
        const im = monTex.getSourceImage(); const cols = Math.max(1, Math.floor(im.width / 64));
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
        const g = cv.getContext('2d');
        g.drawImage(im, (frame % cols) * 64, Math.floor(frame / cols) * 64, 64, 64, 0, 0, 64, 64);
        try {
          const d = g.getImageData(0, 0, 64, 64).data; let x0 = 64, y0 = 64, x1 = -1, y1 = -1;
          for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (d[(y * 64 + x) * 4 + 3] > 20) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
          if (x1 >= 0) bb = { x0, y0, x1: x1 + 1, y1: y1 + 1 };
        } catch { /* 기본 모양 */ }
        g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
        sc.textures.addCanvas('monW', cv);
      }
      const bw = (bb.x1 - bb.x0) * MON_K, bh = (bb.y1 - bb.y0) * MON_K;
      const bcx = ((bb.x0 + bb.x1) / 2 - 32) * MON_K;          // 발 기준 몸 가운데
      const bcy = (64 - (bb.y0 + bb.y1) / 2) * MON_K;
      const footY = FEET_Y - (64 - bb.y1) * MON_K;              // 그림 아래 빈칸이 있어도 발이 자리에 닿게
      const R = Math.round(clamp(Math.max(bw, bh) / 2 * 0.72 + 4, 28, 48));   // 바깥 고리 반지름 = 맞는 범위

      // 배경 · 그림자 · 포켓몬
      if (sc.textures.exists('bg')) sc.add.image(0, 0, 'bg').setOrigin(0).setDepth(0);
      const shadow = sc.add.graphics().setDepth(1);
      const bsh = sc.add.graphics().setDepth(2.5);              // 나는 공의 그림자 (포켓몬 뒤로 가면 1.5)
      const mon = sc.add.image(SPOT_X, footY, 'mons', frame).setOrigin(0.5, 1).setScale(0).setDepth(3);
      const monW = sc.add.image(SPOT_X, footY, 'monW').setOrigin(0.5, 1).setScale(0).setDepth(4).setAlpha(0);
      // 운영자가 올린 움직이는 그림(GIF, 0031)이면 프레임을 돌려 가며 보여 줌
      const anim = monAnim(dex);
      if (anim) {
        anim.frames.forEach((f, i) => { if (!sc.textures.exists(`monA${i}`)) sc.textures.addCanvas(`monA${i}`, f); });
        let shown = -1;
        sc.time.addEvent({ delay: 30, loop: true, callback: () => {
          let t = performance.now() % anim.total, i = 0;
          for (; i < anim.delays.length - 1; i++) { t -= anim.delays[i]; if (t < 0) break; }
          if (i !== shown && mon.active) { shown = i; mon.setTexture(`monA${i}`); }
        } });
      }
      const rings = sc.add.graphics().setDepth(5);
      const ball = sc.add.image(HOME.x, H + 30, 'ball', 0).setOrigin(0.5, BALL_ORIGIN_Y).setScale(2).setDepth(6);   // 포켓몬 뒤로 가면 2
      const fx = sc.add.graphics().setDepth(7);   // 할퀴기 등 잠깐 그리는 것
      // 남은 공: 5개까지는 하나씩, 그보다 많으면 공 하나 + ×숫자 (10개도 좁은 화면에서 넘치지 않게)
      const hud = []; const hudMany = BALLS > 5;
      for (let i = 0; i < (hudMany ? 1 : BALLS); i++) hud.push(sc.add.image(16 + i * 19, 18, 'ball', 0).setOrigin(0.5, BALL_ORIGIN_Y).setDepth(9).setVisible(false));
      const TXT = (x, y, s, size = 12, col = '#ffffff') => sc.add.text(x, y, s, { fontFamily: 'Galmuri11', fontSize: `${size}px`, fontStyle: 'bold', color: col, padding: { top: 2, bottom: 1 } })
        .setShadow(1, 1, '#182030', 0, false, true);
      // 아래 글상자 (어두운 GBA 상자)
      const tb = sc.add.graphics().setDepth(9).setVisible(false);
      tb.fillStyle(0x182030, 1).fillRect(6, 390, W - 12, 80);
      tb.fillStyle(0xf8f8f8, 1).fillRect(8, 392, W - 16, 76);
      tb.fillStyle(0x283048, 1).fillRect(11, 395, W - 22, 70);
      tb.lineStyle(1, 0x586890, 1).strokeRect(13.5, 397.5, W - 27, 65);
      const tbText = TXT(22, 405, '', 12).setDepth(10).setWordWrapWidth(W - 44, false).setLineSpacing(8).setVisible(false);
      const hudNum = hudMany ? TXT(28, 18, '', 12).setOrigin(0, 0.5).setDepth(9).setVisible(false) : null;
      const hint = TXT(W / 2, 372, '공을 위로 휙!', 12).setOrigin(0.5, 0.5).setDepth(9).setVisible(false);
      const hintArrow = sc.add.image(W / 2, 396, 'arrow').setScale(2).setDepth(9).setVisible(false);
      const say = (s) => { tb.setVisible(!!s); tbText.setVisible(!!s).setText(s || ''); };

      // ─────── 흐름 제어: 바로 잡기 하면 지금 하던 연출을 모두 끊음 ───────
      let seq = 0;
      const ctl = () => {
        const my = ++seq;
        const alive = () => my === seq && !dead;
        return {
          alive,
          wait: (ms) => new Promise((res, rej) => sc.time.delayedCall(D(ms), () => (alive() ? res() : rej(CANCEL)))),
          tw: (cfg) => new Promise((res, rej) => sc.tweens.add({ ...cfg, duration: D(cfg.duration || 1), onComplete: () => (alive() ? res() : rej(CANCEL)) })),
        };
      };
      const run = (fn) => { const c = ctl(); fn(c).catch((e) => { if (e !== CANCEL) { console.warn('[catch]', e); bail(); } }); };

      // ─────── 상태 ───────
      let phase = 'intro';            // intro | aim | grab | flight | seq | end
      let T = 0, ringT = 0, frozen = null; // frozen = 던질 때 안쪽 고리 비율 (날아가는 동안 멈춰 보임)
      let ringOn = false, ballsLeft = BALLS, grab = null, curveArmed = false, sparkT = 0, idleT = 0, hinted = false;
      let introSkip = null;
      const evlog = [];   // 시험용 기록 (던지기·명중·빗나감)
      let traj = [];      // 시험용: 마지막 공의 화면 궤적
      const B = { free: false, ox: 0, hop: 0, sx: MON_K, sy: MON_K, ph: 'idle', tm: 1.2, from: 0, to: 0, dur: 0.3, el: 0, h: 0, cr: 0.2 };
      const ratio = () => (frozen != null ? frozen : 1 - 0.85 * ((ringT % CYCLE) / CYCLE));
      const center = () => ({ x: mon.x + bcx, y: mon.y - bcy });
      const ballOk = () => ballsLeft > 0;

      const showHud = (v) => {
        if (hudMany) { hud[0].setVisible(v).setAlpha(ballsLeft > 0 ? 1 : 0.28); hudNum.setVisible(v).setText(`×${ballsLeft}`); return; }
        hud.forEach((h, i) => h.setVisible(v).setAlpha(i < ballsLeft ? 1 : 0.28));
      };

      // 포켓몬 움직임 (조준하는 동안, 미리 웅크려서 알려 줌)
      const nextIdle = () => (rar === 'common' ? 2.2 + Math.random() * 1.4 : rar === 'rare' ? 1.0 + Math.random() * 0.8 : 1.2 + Math.random() * 0.8);
      const startMove = () => {
        B.from = B.ox; B.el = 0;
        if (rar === 'common') { B.to = B.ox; B.h = 6; B.dur = 0.32; B.cr = 0.16; }
        else if (rar === 'rare') { B.to = B.ox > 0 ? -22 : B.ox < 0 ? 22 : (Math.random() < 0.5 ? -22 : 22); B.h = 4; B.dur = 0.36; B.cr = 0.3; }
        else { B.to = Math.round((Math.random() * 2 - 1) * 12); B.h = 20; B.dur = 0.62; B.cr = 0.34; }
        B.ph = 'crouch'; B.tm = B.cr;
      };
      const behave = (dt) => {
        if (!B.free) return;
        B.tm -= dt;
        if (B.ph === 'idle') { B.sx = MON_K; B.sy = MON_K; if (B.tm <= 0) startMove(); }
        else if (B.ph === 'crouch') { B.sx = MON_K * 1.07; B.sy = MON_K * 0.9; if (B.tm <= 0) { B.ph = 'move'; B.el = 0; } }
        else if (B.ph === 'move') {
          B.el += dt; const u = Math.min(1, B.el / B.dur); const e = u * u * (3 - 2 * u);
          B.ox = B.from + (B.to - B.from) * e; B.hop = Math.sin(Math.PI * u) * B.h; B.sx = MON_K * 0.95; B.sy = MON_K * 1.06;
          if (u >= 1) { B.ph = 'land'; B.tm = 0.1; B.hop = 0; }
        } else if (B.ph === 'land') { B.sx = MON_K * 1.05; B.sy = MON_K * 0.94; if (B.tm <= 0) { B.ph = 'idle'; B.tm = nextIdle(); } }
        const bob = rm ? 0 : Math.round(Math.sin(T * 3.2));
        mon.setPosition(SPOT_X + Math.round(B.ox), footY - Math.round(B.hop) + (B.ph === 'idle' ? bob : 0)).setScale(B.sx, B.sy);
      };
      const resetMon = () => { B.ox = 0; B.hop = 0; B.ph = 'idle'; B.tm = nextIdle(); B.sx = MON_K; B.sy = MON_K; };

      const draw = () => {
        // 그림자 (포켓몬 발밑, 뛰면 작아짐)
        shadow.clear();
        if (mon.visible && mon.scaleX > 0.2) {
          const k = clamp(1 - B.hop / 40, 0.5, 1) * (mon.scaleX / MON_K);
          shadow.fillStyle(0x0a1a10, 0.3).fillEllipse(mon.x + bcx, FEET_Y + 2, Math.max(16, bw * 0.85) * k, 9 * k);
        }
        rings.clear();
        if (ringOn) {
          const c = center(); const r = ratio();
          rings.lineStyle(4, 0x182030, 0.25).strokeCircle(c.x, c.y + 1, R);
          rings.lineStyle(2, 0xffffff, 0.95).strokeCircle(c.x, c.y, R);
          rings.lineStyle(3, RING[rar], 1).strokeCircle(c.x, c.y, Math.max(3, R * r));
        }
      };

      // ─────── 나는 공 (3D 물리 → 원근 그림) ───────
      // fly = { p:{x,y,z,vx,vy,vz}, ax(커브 옆 가속 계수), spin(도/초), mode: throw|miss|deflect|rebound, c(흐름), ev(종류, 정보) }
      let fly = null;
      const placeBall = (f) => {
        const p = f.p; const q = proj(p.x, p.y, p.z); const behind = p.z > ZM + 0.02;
        ball.setPosition(q.x, q.y).setScale(BALL_K * ZC / q.d).setDepth(behind ? 2 : 6);
        // 땅 그림자: 공 바로 아래 (x,0,z), 높이 올라갈수록 옅어짐
        const g = proj(p.x, 0, p.z); const w = 2 * BR * FOC / g.d * 1.1;
        bsh.clear().setDepth(behind ? 1.5 : 2.5);
        bsh.fillStyle(0x0a1a10, 0.34 * clamp(1 - (p.y - BR) / 2.2, 0.22, 1)).fillEllipse(g.x, g.y, w, Math.max(2, w * CAM_H / g.d));
        if (traj.length < 900) traj.push({ t: +f.t.toFixed(3), x: +q.x.toFixed(1), y: +q.y.toFixed(1), s: +(BALL_K * ZC / q.d).toFixed(3), gx: +g.x.toFixed(1), gy: +g.y.toFixed(1), h: +p.y.toFixed(3), z: +p.z.toFixed(3), wx: +p.x.toFixed(3), a: Math.round(ball.angle), m: f.mode });
        return q;
      };
      const endFly = (f, how) => {   // how: keep (공 그대로) | hide | fade
        if (f.over) return; f.over = true;
        if (fly === f) fly = null;
        bsh.clear();
        if (how === 'fade' && f.c.alive()) {
          sc.tweens.add({ targets: ball, alpha: 0, duration: D(260), onComplete: () => { if (!f.c.alive()) return; ball.setVisible(false).setAlpha(1); f.res(how); } });
          return;
        }
        if (how === 'hide') ball.setVisible(false);
        f.res(how);
      };
      const flyDone = async (c, f) => { await f.done; if (!c.alive()) throw CANCEL; };
      const stepFly = (dt) => {
        const f = fly; if (!f) return;
        if (!f.c.alive()) { fly = null; bsh.clear(); return; }
        f.acc += dt * 1000 / D(1000);                      // 움직임 줄이기 = 다른 연출처럼 두 배 빨리
        const p = f.p;
        while (f.acc >= STEP && fly === f) {
          f.acc -= STEP; f.t += STEP;
          const { x: px, y: py, z: pz } = p; const pvy = p.vy;
          physStep(p, f.onGround ? 0 : f.ax, STEP);
          f.angle += f.spin * STEP;
          if ((pz < ZM) !== (p.z < ZM)) {                  // 포켓몬 면을 지남 (앞→뒤 또는 뒤→앞)
            const k = (ZM - pz) / (p.z - pz || 1);
            const w = { x: px + (p.x - px) * k, y: py + (p.y - py) * k, z: ZM };
            f.ev('cross', { w, q: proj(w.x, w.y, w.z) });
            if (fly !== f) break;
          }
          if (p.y < BR) {                                  // 땅
            p.y = BR;
            if (p.vy < -0.9) {
              const imp = -p.vy; p.vy = imp * BOUNCE; p.vx *= SKID; p.vz *= SKID; if (!f.onGround) f.landT = f.t; f.onGround = true;
              f.spin = f.spin * 0.6 + (p.vx >= 0 ? 1 : -1) * Math.hypot(p.vx, p.vz) / BR * 57.3 * 0.4;
              f.ev('bounce', { imp, q: proj(p.x, p.y, p.z) });
              if (fly !== f) break;
            } else {                                         // 구름 (미끄럼 마찰로 멈춤)
              p.vy = 0; if (!f.onGround) f.landT = f.t; f.onGround = true; f.rolling = true;
              const hs = Math.hypot(p.vx, p.vz); const ns = Math.max(0, hs - ROLL * STEP);
              if (hs > 0) { p.vx *= ns / hs; p.vz *= ns / hs; }
              f.spin = (p.vx >= 0 ? 1 : -1) * ns / BR * 57.3 * 0.4;
            }
          }
          if (pvy > 0 && p.vy <= 0 && !f.onGround) { f.ev('apex', {}); if (fly !== f) break; }
        }
        if (f.over) return;
        ball.setAngle(f.angle);
        const q = placeBall(f);
        if (f.rolling && Math.hypot(p.vx, p.vz) < 0.04) f.ev('stop', { q });
        else if (q.x < -24 || q.x > W + 24 || q.y > H + 24 || q.y < -40) f.ev('out', { q, fade: false });
        else if (p.z > ZM + 5.5 || f.t > 5 || (f.onGround && f.t - f.landT > 1.1)) f.ev('out', { q, fade: true });   // 땅에 떨어진 뒤 1.1초면 사라짐
      };

      tick = (dt) => {
        T += dt;
        if (ringOn && frozen == null) ringT += dt;
        behave(dt);
        stepFly(dt);
        draw();
        monW.setPosition(mon.x, mon.y).setScale(mon.scaleX, mon.scaleY).setVisible(mon.visible);
        // 커브볼 반짝이
        if (curveArmed && ball.visible && (phase === 'grab' || phase === 'flight' || phase === 'aim')) {
          sparkT -= dt;
          if (sparkT <= 0) {
            sparkT = 0.06;
            const s = sc.add.image(ball.x + (Math.random() - 0.5) * 14 * ball.scaleX / 2, ball.y + (Math.random() - 0.5) * 14 * ball.scaleX / 2, 'spark').setDepth(ball.depth + 0.5);
            sc.tweens.add({ targets: s, y: s.y - 8, alpha: 0, scale: 0.4, duration: 420, onComplete: () => s.destroy() });
          }
        }
        // 한동안 안 던지면 힌트
        if (phase === 'aim') {
          idleT += dt;
          const show = !hinted || idleT > 6;
          hint.setVisible(show); hintArrow.setVisible(show);
          if (show) { const b = rm ? 0 : Math.round(Math.sin(T * 6) * 3); hintArrow.y = 392 + b; }
        } else { hint.setVisible(false); hintArrow.setVisible(false); }
      };

      // ─────── 조각 효과 ───────
      const label = (s, col, x, y, big = true) => {
        const t = TXT(clamp(x, 70, W - 70), clamp(y, 80, 380), s, 12, col).setOrigin(0.5).setDepth(8).setStroke('#182030', 3);
        const k = big ? 2 : 1;
        t.setScale(k * 1.4);
        sc.tweens.add({ targets: t, scale: k, duration: D(180), ease: 'Back.easeOut' });
        sc.tweens.add({ targets: t, y: t.y - 14, alpha: 0, delay: D(900), duration: D(400), onComplete: () => t.destroy() });
        return t;
      };
      const burst = (x, y, n = 8) => {
        for (let i = 0; i < (rm ? 4 : n); i++) {
          const a = (i / n) * Math.PI * 2 + 0.3; const d = 30 + Math.random() * 16;
          const s = sc.add.image(x, y, 'star').setDepth(8).setScale(1.5);
          sc.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, angle: 180, alpha: 0, duration: D(650), ease: 'Quad.easeOut', onComplete: () => s.destroy() });
        }
      };
      const lightStream = (fx0, fy0, tx, ty) => {
        for (let i = 0; i < (rm ? 4 : 12); i++) {
          const d = sc.add.image(fx0 + (Math.random() - 0.5) * bw * 0.8, fy0 + (Math.random() - 0.5) * bh * 0.8, 'dot').setDepth(7).setScale(1 + (i % 2));
          sc.tweens.add({ targets: d, x: tx, y: ty, alpha: 0.2, delay: i * 18, duration: D(320), ease: 'Quad.easeIn', onComplete: () => d.destroy() });
        }
      };

      const newBall = async (c) => {
        ball.setTexture('ball', 0).clearTint().setAngle(0).setAlpha(1).setScale(2).setDepth(6).setPosition(HOME.x, H + 24).setVisible(true);
        curveArmed = false;
        await c.tw({ targets: ball, y: HOME.y, duration: 260, ease: 'Back.easeOut' });
      };

      // ─────── 잡는 연출 (공 안으로 빨려 들어감 → 흔들림) ───────
      // bx,by: 공이 열리는 자리, k0: 그때 공 크기, gy: 공이 떨어질 땅 (화면 y)
      const suckIn = async (c, bx, by, k0 = 1.4, gy = FEET_Y - 4) => {
        // 공이 포켓몬 위에서 열림 → 포켓몬이 빛이 되어 빨려 들어감
        B.free = false; ringOn = false;
        await c.tw({ targets: ball, x: bx, y: by, scale: k0, angle: 0, duration: 200, ease: 'Quad.easeOut' });
        ball.setFrame(1); play('ballPop'); vibrate(25);
        await c.tw({ targets: monW, alpha: 1, duration: 120 });
        const cc = center();
        lightStream(cc.x, cc.y, bx, by);
        await c.tw({ targets: [mon, monW], x: bx, y: by + bh * 0.1, scaleX: 0, scaleY: 0, duration: 330, ease: 'Quad.easeIn' });
        mon.setVisible(false); monW.setAlpha(0);
        ball.setFrame(0);
        await c.wait(140);
        // 땅으로 떨어짐
        await c.tw({ targets: ball, y: gy, duration: 320, ease: 'Bounce.easeOut' });
        play('blip');
      };
      const shake = async (c, n) => {
        for (let i = 0; i < n; i++) {
          await c.wait(i ? 380 : 450);
          play('blip'); vibrate(18);
          const x0 = ball.x;
          await c.tw({ targets: ball, angle: -24, x: x0 - 2, duration: 110, ease: 'Sine.easeOut' });
          await c.tw({ targets: ball, angle: 22, x: x0 + 2, duration: 170, ease: 'Sine.easeInOut' });
          await c.tw({ targets: ball, angle: 0, x: x0, duration: 110, ease: 'Sine.easeIn' });
        }
      };
      const caught = async (c) => {
        await c.wait(320);
        play('select'); vibrate([30, 40, 60]);
        burst(ball.x, ball.y - 8, 8);
        ball.setTint(0xb8b8c8);
        say(`${josa(nm, '을', '를')} 잡았다!`);
        showHud(false);
        await c.wait(160);
        play('catch');
        await c.wait(1150);
        phase = 'end';
        finish(true);
      };
      const escape = async (c) => {
        await c.wait(260);
        ball.setFrame(1); play('ballPop'); vibrate(40);
        const bx = ball.x, by = ball.y;
        mon.setVisible(true).setPosition(bx, by).setScale(0); monW.setPosition(bx, by).setScale(0).setAlpha(1);
        sc.tweens.add({ targets: ball, alpha: 0, y: by + 6, duration: D(300), onComplete: () => ball.setVisible(false) });
        await c.tw({ targets: [mon, monW], x: SPOT_X + Math.round(B.ox), y: footY, scaleX: MON_K, scaleY: MON_K, duration: 260, ease: 'Back.easeOut' });
        await c.tw({ targets: monW, alpha: 0, duration: 140 });
        // 화난 깡충 두 번 + 핏대
        const cc = center();
        const ang = sc.add.image(cc.x + bw * 0.35, cc.y - bh * 0.45, 'anger').setDepth(8).setScale(2);
        sc.tweens.add({ targets: ang, scale: 2.6, yoyo: true, repeat: 2, duration: D(140), onComplete: () => ang.destroy() });
        label('앗, 튀어나왔다!', '#ffffff', W / 2, cc.y - bh / 2 - 18, false);
        play('wrong');
        for (let i = 0; i < 2; i++) {
          await c.tw({ targets: mon, y: footY - 12, duration: 130, ease: 'Quad.easeOut' });
          await c.tw({ targets: mon, y: footY, duration: 130, ease: 'Quad.easeIn' });
        }
        resetMon();
      };

      // 도망: 두리번 → 웅크렸다가 연기를 피우며 옆으로 깡충깡충 → 화면 밖. 잡기 화면은 '도망쳤다…' 로 끝남
      const puff = (x, y, n = 6, big = 2) => {
        for (let i = 0; i < (rm ? 3 : n); i++) {
          const a = Math.PI + (i / Math.max(1, n - 1)) * Math.PI;
          const s = sc.add.image(x, y, 'smoke').setDepth(4.5).setScale(big).setAlpha(0.95);
          sc.tweens.add({ targets: s, x: x + Math.cos(a) * 26, y: y + Math.sin(a) * 12 - 6, scale: big * 1.6, alpha: 0, duration: D(520), ease: 'Quad.easeOut', onComplete: () => s.destroy() });
        }
      };
      const flee = async (c) => {
        phase = 'seq'; ringOn = false; B.free = false; showHud(false); frozen = null;
        result.fled = true;
        btns.hidden = true;   // 도망치는 중엔 '바로 잡기' 없음
        mon.setVisible(true).setAngle(0); monW.setAlpha(0);
        await c.tw({ targets: mon, x: SPOT_X, y: footY, scaleX: MON_K, scaleY: MON_K, duration: 200 });
        const cc = center();
        label('!?', '#ffd23f', cc.x, cc.y - bh / 2 - 16, false);
        await c.tw({ targets: mon, x: SPOT_X - 4, duration: 120, yoyo: true, repeat: 1 });
        await c.tw({ targets: mon, scaleX: MON_K * 1.1, scaleY: MON_K * 0.85, duration: 240, ease: 'Sine.easeOut' });
        play('fail'); vibrate([30, 30, 30]);
        puff(mon.x, FEET_Y - 4, 7, 2);
        for (let i = 0; i < 2; i++) {
          await c.tw({ targets: mon, x: mon.x + 34, y: footY - 22, scaleX: MON_K * 0.95, scaleY: MON_K * 1.06, duration: 170, ease: 'Quad.easeOut' });
          await c.tw({ targets: mon, y: footY, scaleX: MON_K * 1.05, scaleY: MON_K * 0.94, duration: 140, ease: 'Quad.easeIn' });
          puff(mon.x, FEET_Y - 2, 4, 1.5); play('blip');
        }
        await c.tw({ targets: mon, x: W + bw, y: footY - 34, scaleX: MON_K * 0.9, scaleY: MON_K * 0.9, duration: 360, ease: 'Quad.easeIn' });
        mon.setVisible(false);
        say(`${josa(nm, '이', '가')} 도망쳤다…`);
        await c.wait(1700);
        phase = 'end';
        finish(true);
      };

      // 다음 공 또는 지쳐서 얌전해짐
      const nextOrTired = async (c) => {
        if (ballOk()) {
          if (missP > 0 && rand() < missP) { await flee(c); return; }   // 사파리존: 놓칠 때마다 도망칠 수 있음
          await newBall(c);
          ringT = 0; frozen = null; ringOn = true; B.free = true; phase = 'aim'; idleT = 0;
          return;
        }
        // 공을 다 썼음 → 레이드 보스는 도망, 부스는 fleeChance 확률로 도망, 아니면 지쳐서 반드시 잡힘
        if (fleeAfterAll || (fleeP > 0 && rand() < fleeP)) { await flee(c); return; }
        phase = 'seq'; ringOn = false; B.free = false; showHud(false);
        await c.tw({ targets: mon, x: SPOT_X, y: footY, scaleX: MON_K * 1.05, scaleY: MON_K * 0.9, duration: 300 });
        say(`${josa(nm, '은', '는')} 지쳐서 얌전해졌다!`);
        await c.wait(1200);
        say('');
        // 마지막 공이 저절로 굴러옴
        ball.setTexture('ball', 0).clearTint().setAlpha(1).setVisible(true).setScale(1.4).setAngle(0).setDepth(6).setPosition(W + 16, FEET_Y + 20);
        play('ballThrow');
        await c.tw({ targets: ball, x: SPOT_X + bw / 2 + 8, y: FEET_Y + 4, angle: -720, duration: 900, ease: 'Quad.easeOut' });
        const cc = center();
        await suckIn(c, cc.x, cc.y - bh / 2 - 10);
        await shake(c, 3);
        await caught(c);
      };

      // ─────── 던지기 ───────
      // rel: 손을 놓은 화면 점, (dx,dy): 휙 방향 (화면), css: 휙 속도 (CSS px/초), curve: false | 'cw' | 'ccw'
      const throwBall = (rel, dx, dy, css, curve) => {
        phase = 'flight'; hinted = true;
        result.throws++; ballsLeft--; showHud(true);
        try { onThrow?.(result.throws); } catch { /* 적지 못해도 던지기는 계속 */ }
        frozen = ratio();
        const relRatio = frozen;
        play('ballThrow'); vibrate(10);
        const cc = center();
        const p0 = releaseAt(rel.x, rel.y);
        // 손가락이 가리킨 곳: 휙 선이 고리 가운데 높이에 닿는 화면 x → 포켓몬 깊이의 세계 x
        const up = Math.max(1e-3, -dy);
        const sxT = clamp(rel.x + (dx / up) * (rel.y - cc.y), SPOT_X - 700, SPOT_X + 700);
        const xT = (sxT - SPOT_X) * (ZM + ZC) / FOC;
        // 힘: 기준 속력 (이 자리에서 고리 가운데 높이로 가는 속력) × 휙 속도 배율
        const pw = power(css);
        const v = nominalSpeed(p0, cc.y) * pw;
        const vy = v * Math.sin(LAUNCH), vz = v * Math.cos(LAUNCH);
        // 커브볼: 회전 방향으로 휘는 옆 가속. 처음엔 반대쪽으로 나가서 휘어 들어와 가리킨 곳을 지나게 옆 속도를 맞춤
        const side = curve === 'cw' ? 1 : curve === 'ccw' ? -1 : 0;
        const ax = side * CURVE_M;
        let vx = 0;
        for (let i = 0; i < 4; i++) {
          const r = simCross(p0, vx, vy, vz, ax);
          if (!r) { vx = vz * (xT - p0.x) / Math.max(0.5, ZM - p0.z); break; }
          vx += (xT - r.x) / Math.max(0.05, r.t);
        }
        evlog.push(['throw', Math.round(css), +pw.toFixed(3), side, Math.round(sxT)]);
        const willSwat = (rar === 'legendary' || rar === 'mythic') && rand() < 0.25;
        traj = [];
        let res; const doneP = new Promise((r) => { res = r; });
        const f = {
          p: { ...p0, vx, vy, vz }, ax, spin: side ? side * 1440 : (dx >= 0 ? 1 : -1) * 600, angle: ball.angle,
          mode: 'throw', t: 0, acc: 0, onGround: false, rolling: false, over: false, c: ctl(), done: doneP, res,
        };
        const toMiss = (q, why) => {
          f.mode = 'miss';
          evlog.push(['miss', why, Math.round(q.x), Math.round(q.y)]);
          run((k) => { f.c = k; return onMiss(k, f, q); });
        };
        f.ev = (type, info) => {
          if (f.mode === 'throw') {
            if (type === 'cross') {
              const q = info.q; const c2 = center();
              const hit = Math.hypot(q.x - c2.x, q.y - c2.y) <= R + HIT_PAD;
              if (hit && willSwat) {
                f.mode = 'deflect'; evlog.push(['swat']);
                run((k) => { f.c = k; return swat(k, f, q); });
              } else if (hit) {
                evlog.push(['hit', Math.round(q.x), Math.round(q.y), Math.round(c2.x), Math.round(c2.y)]);
                f.mode = 'rebound';
                run((k) => { f.c = k; return onHit(k, relRatio, !!curve, f, q); });
              } else {
                // 고리 아래로 몸에 맞으면 (발치) 툭 튕겨 나옴, 위·옆이면 그냥 지나감
                if (q.y > c2.y && Math.abs(q.x - c2.x) < bw / 2) { f.p.vz = -0.3 * Math.abs(f.p.vz); f.p.vx *= 0.5; play('blip'); }
                toMiss(q, q.y < c2.y - R ? 'over' : Math.abs(q.x - c2.x) > R ? 'wide' : 'low');
              }
            } else if (type === 'bounce') { play('blip'); toMiss(info.q, 'short'); }
            else if (type === 'stop' || type === 'out') { toMiss(info.q, type === 'out' ? 'out' : 'short'); f.ev(type, info); }
          } else if (f.mode === 'miss' || f.mode === 'deflect') {
            if (type === 'bounce') { if (info.imp > 1.2) play('blip'); }
            else if (type === 'cross' && f.onGround && f.p.vz > 0 && Math.abs(info.q.x - center().x) < bw / 2) { f.p.vz = -0.3 * Math.abs(f.p.vz); f.p.vx *= 0.5; }   // 굴러가다 발에 막힘
            else if (type === 'stop') endFly(f, 'fade');
            else if (type === 'out') endFly(f, info.fade ? 'fade' : 'hide');
          } else if (f.mode === 'rebound') {
            if (type === 'apex' || type === 'bounce' || type === 'stop' || type === 'out') endFly(f, 'keep');
          }
        };
        fly = f;
        placeBall(f);
      };

      // 전설: 맞기 직전 앞발로 쳐냄 → 맞은 자리에서 옆·위로 튕겨 날아감 (속도가 바뀜)
      const swat = async (c, f, q) => {
        phase = 'seq'; frozen = null; ringOn = false;
        const bx = q.x, by = q.y; const dir = bx < mon.x ? -1 : 1;
        // 포켓몬이 번쩍 + 앞발 할퀴기
        monW.setAlpha(0.85);
        sc.tweens.add({ targets: monW, alpha: 0, duration: D(260) });
        mon.setScale(MON_K * 1.12, MON_K * 0.95);
        // 할퀸 자국 세 줄 (굵은 흰 줄 + 어두운 테두리)
        fx.clear();
        const claw = (w, col) => { fx.lineStyle(w, col, 1); for (let i = -1; i <= 1; i++) fx.lineBetween(bx - 14 * dir + i * 9, by - 18, bx + 6 * dir + i * 9, by + 16); };
        claw(7, 0x182030); claw(3, 0xffffff);
        fx.setAlpha(1);
        sc.tweens.add({ targets: fx, alpha: 0, delay: D(140), duration: D(220), onComplete: () => fx.clear() });
        play('hit'); vibrate([20, 30, 20]);
        if (!rm) sc.tweens.add({ targets: mon, x: mon.x + 3, duration: 40, yoyo: true, repeat: 3 });
        label('튕겨냈다!', '#ff8a78', W / 2, mon.y - bh - 14, false);
        // 맞은 자리에서 새 속도: 옆으로 세게, 위로, 앞으로 오던 힘은 반대로 조금
        const p = f.p; p.z = Math.min(p.z, ZM - 0.02);
        p.vx = dir * 6.5 + 0.2 * p.vx; p.vy = 4.2; p.vz = -0.35 * Math.abs(p.vz);
        f.ax = 0; f.spin = dir * 1800;
        await flyDone(c, f);
        mon.setScale(MON_K);
        await c.wait(450);
        await nextOrTired(c);
      };

      const onMiss = async (c, f, q) => {
        phase = 'seq'; frozen = null;
        label('빗나갔다!', '#ffffff', q.x, q.y - 34, false);
        await flyDone(c, f);   // 공이 땅에 튀고 굴러 멈추거나 화면 밖으로 나갈 때까지
        ball.setVisible(false);
        await nextOrTired(c);
      };

      const onHit = async (c, rr, curve, f, q) => {
        phase = 'seq'; B.free = false;
        const grade = rr < 0.35 ? 'excellent' : rr < 0.65 ? 'great' : 'nice';
        if (RANK[grade] > RANK[result.grade]) result.grade = grade;
        if (curve) result.curve = true;
        play('correct'); vibrate(30);
        const cc = center();
        const [txt, col] = GRADE_TXT[grade];
        label(txt, col, cc.x, cc.y - bh / 2 - 22);
        if (curve) sc.time.delayedCall(D(260), () => label('커브볼!', '#7fd8ff', cc.x, cc.y - bh / 2 + 6, false));
        const pc = Math.min(0.95, BASE_P[rar] * GRADE_K[grade] * (curve ? 1.3 : 1));
        const u = rand();
        const ok = u < pc;
        // 아깝게 놓칠수록 많이 흔들림
        const close = ok ? 1 : (u - pc) / (1 - pc);
        const n = ok ? 3 : close < 0.34 ? 3 : close < 0.67 ? 2 : 1;
        // 맞은 자리에서 포켓몬 몸에 맞고 위로 톡 튀어 오름 (머리 위쯤까지, 최대 60 도트) → 꼭대기에서 열림
        const p = f.p; p.z = Math.min(p.z, ZM - 0.03);
        const rise = clamp(q.y - (cc.y - bh / 2 - 10), 14, 60);
        p.vy = Math.sqrt(2 * GRAV * rise * q.d / FOC) * 1.03;
        p.vz = -0.12 * Math.abs(p.vz); p.vx *= 0.15; f.ax = 0; f.spin *= -0.3;
        play('blip');
        await flyDone(c, f);
        const gy = proj(p.x, BR, p.z).y;
        await suckIn(c, ball.x, ball.y, ball.scaleX, gy);
        await shake(c, n);
        if (ok) { await caught(c); return; }
        await escape(c);
        await nextOrTired(c);
      };

      // ─────── 입력 (손가락 하나만 기억, 다른 손가락은 무시) ───────
      const toWorld = (e) => { const r = box.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
      const heldScale = (x, y) => BALL_K * ZC / (releaseAt(x, y).z + ZC);   // 손에 든 공도 같은 원근 크기
      const cancelGrab = () => {
        grab = null; curveArmed = false;
        if (phase === 'grab') { phase = 'aim'; sc.tweens.add({ targets: ball, x: HOME.x, y: HOME.y, scale: 2, duration: D(160), ease: 'Quad.easeOut' }); }
      };
      on(box, 'pointerdown', (e) => {
        if (isBtn(e.target) || done) return;
        e.preventDefault();
        if (phase === 'intro' && introSkip) { introSkip(); return; }
        if (phase !== 'aim' || grab || !ballOk()) return;
        const p = toWorld(e);
        if (Math.hypot(p.x - HOME.x, p.y - HOME.y) > 40) return;
        grab = { id: e.pointerId, y0: p.y, last: p, samples: [{ x: p.x, y: p.y, t: e.timeStamp }], spin: 0, ang: null };
        try { box.setPointerCapture(e.pointerId); } catch { /* */ }
        phase = 'grab'; idleT = 0; hinted = true;
        const bx = clamp(p.x, 14, W - 14), by = clamp(p.y, 372, H - 12);
        ball.setPosition(bx, by).setScale(heldScale(bx, by));
        play('blip');
      });
      on(box, 'pointermove', (e) => {
        if (!grab || e.pointerId !== grab.id || phase !== 'grab') return;
        e.preventDefault();
        const evs = e.getCoalescedEvents?.() || [];
        for (const ev of (evs.length ? evs : [e])) {
          const p = toWorld(ev);
          grab.samples.push({ x: p.x, y: p.y, t: ev.timeStamp || e.timeStamp });
          // 빙글빙글 돌린 각도 합 (한 바퀴 넘으면 커브볼)
          const dx = p.x - grab.last.x, dy = p.y - grab.last.y;
          if (dx * dx + dy * dy >= 9) {
            const a = Math.atan2(dy, dx);
            if (grab.ang != null) { let d = a - grab.ang; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; grab.spin += d; }
            grab.ang = a; grab.last = p;
            if (!curveArmed && Math.abs(grab.spin) >= Math.PI * 2 * 0.95) { curveArmed = grab.spin > 0 ? 'cw' : 'ccw'; play('statUp'); vibrate(12); }
          }
        }
        if (grab.samples.length > 40) grab.samples.splice(0, grab.samples.length - 40);
        const q = grab.samples[grab.samples.length - 1];
        const bx = clamp(q.x, 14, W - 14), by = clamp(q.y, 372, H - 12);   // 공은 아래쪽에서만 따라옴 (포켓몬 앞까지 들고 가지 못함)
        ball.setPosition(bx, by).setScale(heldScale(bx, by));
        if (curveArmed) ball.setAngle(ball.angle + (curveArmed === 'cw' ? 24 : -24));   // 커브볼 준비: 돌린 방향으로 빙글
      });
      const up = (e) => {
        if (!grab || e.pointerId !== grab.id) return;
        e.preventDefault?.();
        try { box.releasePointerCapture(e.pointerId); } catch { /* */ }
        if (phase !== 'grab') { grab = null; return; }
        const p = toWorld(e);
        const now = e.timeStamp;
        grab.samples.push({ x: p.x, y: p.y, t: now });
        let rec = grab.samples.filter((s) => now - s.t <= 100);
        if (rec.length < 2) rec = grab.samples.slice(-2);
        const a = rec[0], b = rec[rec.length - 1];
        const dt = Math.max(16, b.t - a.t) / 1000;
        const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
        const upTotal = grab.y0 - b.y;
        const curve = curveArmed;
        grab = null;
        const k = box.getBoundingClientRect().width / W;     // 논리 도트 → CSS px (손가락 실제 빠르기, 화면 크기와 상관없이)
        if (vy * k > -240 || upTotal < 14) { evlog.push(['cancel', Math.round(vx), Math.round(vy), Math.round(upTotal)]); cancelGrab(); return; }   // 위로 휙 아님 → 공을 손에 다시
        throwBall({ x: ball.x, y: ball.y }, vx, vy, Math.hypot(vx, vy) * k, curve);
      };
      on(box, 'pointerup', up);
      on(box, 'pointercancel', (e) => { if (grab && e.pointerId === grab.id) cancelGrab(); });
      on(box, 'lostpointercapture', (e) => { if (grab && e.pointerId === grab.id && phase === 'grab') cancelGrab(); });
      // PC: 스페이스/엔터/위 화살표 = 똑바로 던지기 (기준 힘)
      on(window, 'keydown', (e) => {
        if (done || !['Space', 'Enter', 'ArrowUp', 'NumpadEnter'].includes(e.code)) return;
        if (isBtn(document.activeElement) && e.code !== 'ArrowUp') return;
        e.preventDefault();
        if (phase === 'intro' && introSkip) { introSkip(); return; }
        if (phase !== 'aim' || !ballOk()) return;
        const cc = center();
        throwBall({ x: HOME.x, y: HOME.y }, cc.x - HOME.x, cc.y - HOME.y, S_MID, false);
      });

      // ─────── 바로 잡기 ───────
      runFn = () => {
        if (phase !== 'aim' && phase !== 'intro') return;
        const c = ctl();
        sc.tweens.killAll();
        grab = null; curveArmed = false; ringOn = false; frozen = null; B.free = false; phase = 'seq';
        result.fled = true; result.ran = true; btns.hidden = true;
        showHud(false); hint.setVisible(false); hintArrow.setVisible(false); ball.setVisible(false);
        play('select');
        say('무사히 도망쳤다!');
        (async () => { await c.wait(900); phase = 'end'; finish(true); })().catch((e) => { if (e !== CANCEL) finish(true); });
      };
      skipFn = () => {
        const c = ctl();                 // 지금 하던 연출은 모두 끊김
        speed = 0.5;
        sc.tweens.killAll();
        fly = null; bsh.clear();
        grab = null; curveArmed = false; ringOn = false; frozen = null; B.free = false; phase = 'seq';
        say(''); showHud(false); fx.clear();
        hint.setVisible(false); hintArrow.setVisible(false);
        (async () => {
          mon.setVisible(true).setPosition(SPOT_X, footY).setScale(MON_K).setAngle(0); monW.setAlpha(0);
          B.ox = 0; B.hop = 0;
          const cc = center();
          ball.setTexture('ball', 0).clearTint().setVisible(true).setAlpha(1).setAngle(0).setScale(1.4).setDepth(6).setPosition(cc.x, -20);
          await c.tw({ targets: ball, y: cc.y - bh / 2 - 10, duration: 220, ease: 'Quad.easeOut' });
          await suckIn(c, ball.x, ball.y);
          await shake(c, 1);
          await caught(c);
        })().catch((e) => { if (e !== CANCEL) bail(); });
      };

      // ─────── 시작: 나타났다! ─────── (레이드 = HAFS 볼일 때만 '레이드 보스'. 야생도 공을 다 쓰면 도망가지만 레이드가 아님)
      run(async (c) => {
        // 곡이 나오고 있으면 다음 박 (야생 곡 첫 타격 전이면 그 타격) 에 나타남 — 그땐 8비트 '짠' 효과음은 안 냄 (겹치지 않게)
        const beat = bgmBeat(TRACK, 120);
        if (beat != null && beat < 2500) await new Promise((res, rej) => setTimeout(() => (c.alive() ? res() : rej(CANCEL)), beat));
        say(style === 'hafs' ? `레이드 보스 ${josa(nm, '이', '가')} 덤벼든다!\n공 ${BALLS}개로 잡아 보자!` : `야생의 ${josa(nm, '이', '가')} 나타났다!`);
        monW.setAlpha(1);
        if (beat == null) play('scan');
        await c.tw({ targets: [mon, monW], scaleX: MON_K, scaleY: MON_K, duration: 320, ease: 'Back.easeOut' });
        await c.tw({ targets: monW, alpha: 0, duration: 200 });
        resetMon(); B.free = true;
        // 1.4초 (화면을 누르면 바로)
        await new Promise((res) => {
          const t = sc.time.delayedCall(D(1400), () => { introSkip = null; res(); });
          introSkip = () => { introSkip = null; t.remove(false); res(); };
        });
        if (!c.alive()) return;
        say('');
        showHud(true);
        await newBall(c);
        ringOn = true; ringT = 0; phase = 'aim'; idleT = 0;
      });

      // 시험용 (dev 페이지·자동 시험)
      layer.__cz = {
        phase: () => phase, ring: () => ({ ...center(), R, ratio: ratio() }), ball: () => ({ x: ball.x, y: ball.y, visible: ball.visible, scale: ball.scaleX, depth: ball.depth }),
        ballsLeft: () => ballsLeft, balls: BALLS, style, fled: () => result.fled, log: evlog, home: HOME, curve: () => curveArmed, world: { W, H }, traj: () => traj,
        freeze: (v) => { B.free = !v; if (v) { resetMon(); mon.setPosition(SPOT_X, footY).setScale(MON_K); } },   // 시험용: 포켓몬을 가운데에 세워 둠 (궤적 비교용)
      };
    }
  } catch (e) {
    console.warn('[catch] skipped:', e?.message || e);
    bail();
  }
  return out;
}
