// 사진 공유 (인스타그램 등): 트레이너 카드 PNG (1080×1344, 4:5) · 포켓몬 사진 PNG (1080×1080, 배경 고르기).
// 처음 누를 때만 불러옴 (app.js 홈 트레이너 카드 '카드 공유' · bag.js 포켓몬 요약 '사진 만들기').
// 공유: 폰이 파일 공유를 지원하면 navigator.share({ files }) (취소 = 조용히), 아니면 '저장' = PNG 내려받기.
// 개인정보: 카드에 고유번호 · 이메일은 넣지 않음. 트레이너 카드는 학생 자기 카드라 자기 진짜 이름 (profile.name — 서버가 가린 display 말고) + 별명 (있으면 작은 줄).
import { h, toast } from './ui.js';
import { sfx } from './sfx.js';
import { ensureSprites, monCell } from './sprites.js';
import { S, mons, monSp, spIdOf, dexStats, partnerMon, titlesOf, speciesOf } from './state.js';
import { sheet, closeOverlay } from './app.js';

const U = 4;                                   // 도트 1칸 = 4px (1080 = 270칸)
const FONT = "'Galmuri11', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const INK = '#303848';

// ── 공용 도구 ──
const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const IMGS = new Map();
const img = (src) => IMGS.get(src) || IMGS.set(src, loadImg(new URL(`../${src}`, import.meta.url).href)).get(src);
async function fontsReady() {
  try { await Promise.all([document.fonts.load(`44px ${FONT}`), document.fonts.load(`bold 44px ${FONT}`), document.fonts.load(`bold 44px ${FONT}`, '가A')]); } catch { /* 글꼴이 없어도 그림은 그림 */ }
}
function canvas(w, hgt) { const c = document.createElement('canvas'); c.width = w; c.height = hgt; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; }
const rect = (g, x, y, w, hh, col) => { g.fillStyle = col; g.fillRect(x, y, w, hh); };
// 모서리를 계단 모양으로 깎은 도트 상자 (r = 깎을 칸 수)
function pbox(g, x, y, w, hh, col, r = 2) {
  g.fillStyle = col;
  for (let i = 0; i < r; i++) g.fillRect(x + (r - i) * U, y + i * U, w - 2 * (r - i) * U, U);
  g.fillRect(x, y + r * U, w, hh - 2 * r * U);
  for (let i = 0; i < r; i++) g.fillRect(x + (i + 1) * U, y + hh - r * U + i * U, w - 2 * (i + 1) * U, U);
}
// 글자: 너비 maxW 를 넘으면 글자 크기를 줄여서 맞춤 (잘리지 않게). 반환 = 실제 크기
function text(g, s, x, y, { size = 44, bold = false, col = INK, shadow = null, align = 'left', maxW = 0, base = 'alphabetic' } = {}) {
  s = String(s ?? '');
  let sz = size;
  g.font = `${bold ? 'bold ' : ''}${sz}px ${FONT}`;
  while (maxW && g.measureText(s).width > maxW && sz > 12) { sz -= 2; g.font = `${bold ? 'bold ' : ''}${sz}px ${FONT}`; }
  g.textAlign = align; g.textBaseline = base;
  if (shadow) { g.fillStyle = shadow; g.fillText(s, x + U, y + U); }
  g.fillStyle = col; g.fillText(s, x, y);
  return sz;
}
// 그림의 실제 보이는 부분 (투명 아닌 픽셀) 상자 — 큰 포켓몬이 액자 밖으로 튀어나오지 않게 맞출 때 씀
const bboxCache = new Map();
function cellBox(cell) {
  if (bboxCache.has(cell)) return bboxCache.get(cell);
  let box = { x: 0, y: 0, w: 64, h: 64 };
  try {
    const t = document.createElement('canvas'); t.width = 64; t.height = 64;
    const tg = t.getContext('2d'); tg.drawImage(cell, 0, 0, 64, 64, 0, 0, 64, 64);
    const d = tg.getImageData(0, 0, 64, 64).data;
    let x0 = 64, y0 = 64, x1 = -1, y1 = -1;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (d[(y * 64 + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 >= 0) box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  } catch { /* 읽을 수 없으면 칸 전체 */ }
  bboxCache.set(cell, box);
  return box;
}
// 포켓몬 그리기: 발이 footY, 가운데 cx. fit = { w, h } 를 주면 그 안에 들어가게 (정수 배율 우선) 줄임
async function drawMon(g, m, cx, footY, scale, fit = null) {
  const id = spIdOf(m); const shiny = !!m.shiny_on;
  try { await ensureSprites([id], shiny); } catch { /* 오프라인: 받아 둔 것만 */ }
  const cell = monCell(id, shiny) || monCell(id, false);
  const b = cell ? cellBox(cell) : { x: 0, y: 0, w: 64, h: 64 };
  let k = scale;
  if (fit) {
    const f = Math.min(fit.w / b.w, fit.h / b.h);
    if (f < k) k = Math.max(0.5, Math.floor(f * 4) / 4);   // 0.25 단위로만 줄임 (너무 작아지지 않게)
  }
  // 그림자 (도트 타원)
  const sw = 26 * k, sh = 6 * k;
  g.fillStyle = 'rgba(16, 24, 40, .28)';
  for (let r = 0; r < sh; r += U) { const kk = Math.sqrt(1 - ((r - sh / 2) / (sh / 2)) ** 2); const w = Math.round((sw * kk) / U) * U; g.fillRect(cx - w / 2, footY - sh / 2 + r - 2 * k, w, U); }
  if (cell) {
    g.imageSmoothingEnabled = false;
    // 보이는 부분의 가운데를 cx 에, 아래 끝을 footY 에
    const dx = Math.round(cx - (b.x + b.w / 2) * k), dy = Math.round(footY - (b.y + b.h) * k);
    g.drawImage(cell, 0, 0, 64, 64, dx, dy, 64 * k, 64 * k);
  }
}
// 몬스터볼 도트 (16×16 칸, 앱 가운데 QR 버튼과 같은 빨강 · 흰색): 칸마다 원 안인지 재서 칠함
function logo(g, x, y, size) {
  const N = 16, k = size / N, c = (N - 1) / 2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const d = Math.hypot(i - c, j - c);
    if (d > 7.6) continue;
    let col;
    if (d <= 1.9) col = '#f8f8f8';                                                     // 버튼 (가운데 띠가 버튼을 가로지르지 않게 먼저)
    else if (d > 6.7 || (Math.abs(j - c) <= 0.5 && d > 3.1) || d <= 3.1) col = '#202838';   // 테두리 · 가운데 띠 (버튼 밖만) · 버튼 테두리
    else if (j < c) col = (i - c) + (j - c) < -6 ? '#ff9a9a' : (i - c) + (j - c) > 3 ? '#b83030' : '#e04848';
    else col = (i - c) + (j - c) > 5 ? '#c8ccd8' : '#f8f8f8';
    g.fillStyle = col; g.fillRect(Math.round(x + i * k), Math.round(y + j * k), Math.ceil(k), Math.ceil(k));
  }
}

// ── 내보내기: 미리보기 + 공유 / 저장 ──
const canShareFiles = (file) => { try { return !!navigator.canShare?.({ files: [file] }) && !!navigator.share; } catch { return false; } };
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, style: { display: 'none' } });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  toast('사진을 저장했어요. (안 보이면 미리보기를 길게 눌러 저장해요)', 3500);
}
async function shareBlob(blob, name, title) {
  const file = new File([blob], name, { type: 'image/png' });
  if (canShareFiles(file)) {
    try { await navigator.share({ files: [file], title }); return; }
    catch (e) { if (e?.name === 'AbortError') return; }          // 공유 창을 닫음 = 조용히
  }
  saveBlob(blob, name);
}
const toBlob = (c) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));

// 미리보기 칸 + [공유] [저장]. render() → canvas 를 다시 그릴 때마다 preview(c)
function exportPanel(name, title) {
  const pic = h('img.share-pic', { alt: title });
  const status = h('small.share-hint', { style: { whiteSpace: 'pre-line' } }, '만드는 중…');   // 문장마다 줄을 나눔 (좁은 폰에서 '저장 →' 만 따로 떨어지지 않게)
  let blob = null; let url = null;
  const probe = new File([new Blob([''], { type: 'image/png' })], name, { type: 'image/png' });
  const share = canShareFiles(probe);
  const act = (fn) => async () => { if (!blob) return; sfx.select(); try { await fn(); } catch (e) { toast('사진을 만들지 못했어요. 다시 해 주세요.'); console.warn(e); } };
  const btns = h('div.share-acts',
    share && h('button.btn.primary', { type: 'button', onclick: act(() => shareBlob(blob, name, title)) }, '공유'),
    h(`button.btn${share ? '' : '.primary'}`, { type: 'button', onclick: act(() => saveBlob(blob, name)) }, '저장'));
  const set = async (c) => {
    try {
      blob = await toBlob(c);
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob); pic.src = url;
      status.textContent = share ? '공유 → 인스타그램 · 메시지로 보내요.\n저장 → 사진첩에.' : '저장 → 사진 파일로 받아요.\n인스타그램에서 그 사진을 올려요.';
    } catch (e) { status.textContent = '사진을 만들지 못했어요.'; console.warn(e); }
  };
  return { el: [pic, status, btns], set, done: () => url && URL.revokeObjectURL(url) };
}

// ───────────────────────── 트레이너 카드 ─────────────────────────
const TEAM_MAX = 6;
async function featuredMons() {
  const all = mons();
  const byId = new Map(all.map((m) => [m.id, m]));
  let ids = (S.bag?.team || S.bag?.saved_team || []).filter((id) => byId.has(id));
  if (!ids.length) {
    try { const { loadBag } = await import('./bag.js'); await loadBag({ notify: false }); ids = (S.bag?.team || []).filter((id) => byId.has(id)); } catch { /* 오프라인 */ }
  }
  // 배틀 팀이 있으면 그 팀만 (빈 자리는 카드에서 점선 칸), 없으면 강한 순 6마리
  if (ids.length) return { list: ids.slice(0, TEAM_MAX).map((id) => byId.get(id)), team: true };
  const rest = [...all].sort((a, b) => b.stage - a.stage || b.level - a.level || a.id - b.id);
  return { list: rest.slice(0, TEAM_MAX), team: false };
}

// 글자를 maxW 안에: 먼저 크기를 minSize 까지 줄이고, 그래도 길면 뒤를 '…' 로. 반환 { s, size }
function fit(g, s, maxW, size, minSize, bold = true) {
  s = String(s ?? '');
  let sz = size;
  const set = () => { g.font = `${bold ? 'bold ' : ''}${sz}px ${FONT}`; };
  set();
  while (g.measureText(s).width > maxW && sz > minSize) { sz -= 2; set(); }
  if (g.measureText(s).width > maxW) {
    const ch = [...s];
    while (ch.length > 1 && g.measureText(`${ch.join('')}…`).width > maxW) ch.pop();
    s = `${ch.join('')}…`;
  }
  return { s, size: sz };
}
// 점선 테두리 (빈 칸): 도트 한 칸짜리 선을 3칸 칠하고 2칸 쉼
function dashed(g, x, y, w, hh, col) {
  g.fillStyle = col;
  for (let i = 2 * U; i < w - 2 * U; i += 5 * U) { const l = Math.min(3 * U, w - 2 * U - i); g.fillRect(x + i, y, l, U); g.fillRect(x + i, y + hh - U, l, U); }
  for (let j = 2 * U; j < hh - 2 * U; j += 5 * U) { const l = Math.min(3 * U, hh - 2 * U - j); g.fillRect(x, y + j, U, l); g.fillRect(x + w - U, y + j, U, l); }
}

export async function drawCard() {
  await fontsReady();
  const p = S.snap.profile;
  const D = dexStats();
  const titles = titlesOf(p, D).slice(0, 3);
  const { list, team } = await featuredMons();
  const partner = partnerMon() || list[0] || null;
  const W = 1080, H = 1344;
  const [c, g] = canvas(W, H);
  // 바탕: 남색 + 도트 별
  rect(g, 0, 0, W, H, '#283048');
  for (let i = 0; i < 60; i++) rect(g, ((i * 397) % 270) * U, ((i * 151) % 336) * U, U, U, i % 3 ? '#3a4668' : '#586890');
  // 카드 (홈 트레이너 카드와 같은 금색 줄무늬)
  const X = 40, Y = 40, CW = W - 80, CH = H - 80;
  pbox(g, X, Y, CW, CH, '#182030', 4);
  pbox(g, X + 3 * U, Y + 3 * U, CW - 6 * U, CH - 6 * U, '#fff8d8', 3);
  g.save();
  g.beginPath(); g.rect(X + 5 * U, Y + 5 * U, CW - 10 * U, CH - 10 * U); g.clip();
  for (const [col, t] of [['#f8e8a8', 0], ['#f8d878', 0.3], ['#f0c860', 0.6]]) {
    g.fillStyle = col; g.beginPath();
    const o = t * (W + H);
    g.moveTo(o, 0); g.lineTo(W + H, 0); g.lineTo(W + H, H); g.lineTo(o - H, H); g.closePath(); g.fill();
  }
  g.restore();
  const IX = X + 6 * U, IW = CW - 12 * U, IR = IX + IW;          // 안쪽 여백 24px (64 ~ 1016)
  const LBL = '#586890', PAPER = '#fffcec', GOLD = '#c8a048';

  // ── 1. 머리띠: 몬스터볼 + HAFS 몬스터 · TRAINER CARD ──
  const HY = Y + 6 * U, HH = 32 * U;
  pbox(g, IX, HY, IW, HH + 2 * U, '#1c3e8c', 2);
  pbox(g, IX, HY, IW, HH, '#2a5cbc', 2);
  logo(g, IX + 5 * U, HY + 4 * U, 24 * U);
  text(g, 'HAFS 몬스터', IX + 34 * U, HY + 22 * U, { size: 66, bold: true, col: '#ffffff', shadow: '#182030', maxW: 120 * U });
  text(g, 'TRAINER CARD', IR - 6 * U, HY + 21 * U, { size: 33, bold: true, col: '#f8d048', shadow: '#182030', align: 'right', maxW: 70 * U });

  // ── 2. 이름 (왼쪽) + 카드 포켓몬 (오른쪽 액자) ──
  const PS = 70 * U, PX = IR - PS, PY = HY + HH + 6 * U;            // 액자 280px
  pbox(g, PX, PY, PS, PS, GOLD, 3);
  pbox(g, PX + 2 * U, PY + 2 * U, PS - 4 * U, PS - 4 * U, PAPER, 3);
  if (partner) await drawMon(g, partner, PX + PS / 2, PY + PS - 6 * U, 4, { w: PS - 10 * U, h: PS - 12 * U });
  else text(g, '?', PX + PS / 2, PY + PS / 2 + 18 * U, { size: 160, bold: true, col: '#ead39a', align: 'center' });
  const NX = IX + 4 * U, NW = PX - 8 * U - NX;                      // 이름 칸 너비 ≈ 620px
  const nick0 = String(p.nickname || '').trim();
  // 이름 덩어리를 액자 높이 가운데쯤에 (별명 · 칭호가 없으면 그만큼 아래로)
  let ny = PY + 26 * U + Math.round(((nick0 && nick0 !== String(p.name || '').trim() ? 0 : 16) + (titles.length ? 0 : 20)) / 2) * U;
  const real = String(p.name || '').trim() || '트레이너';            // 내 카드 = 내 진짜 이름 (서버가 가린 display 말고)
  const nm = fit(g, real, NW, 96, 60);
  text(g, nm.s, NX, ny, { size: nm.size, bold: true, shadow: '#fff8d8' });
  const nick = String(p.nickname || '').trim();
  if (nick && nick !== real) {
    ny += 16 * U;
    const nk = fit(g, nick, NW, 44, 30);   // 별명은 이름 아래 작은 줄로만 (따로 '별명' 표시 없음)
    text(g, nk.s, NX, ny, { size: nk.size, bold: true, col: '#1c3e8c', shadow: '#fff8d8' });
  }
  ny += 14 * U;
  text(g, p.gen ? `${p.gen}기 트레이너` : '특별 트레이너', NX, ny, { size: 36, col: LBL, shadow: '#fff8d8', maxW: NW });
  // 칭호 (최대 2줄, 액자 아래로는 넘치지 않게)
  ny += 6 * U;
  let tx = NX, trow = 0;
  for (const t of titles) {
    const tt = fit(g, t, NW - 8 * U, 30, 30);
    const tw = Math.ceil(g.measureText(tt.s).width / U) * U + 8 * U;
    if (tx > NX && tx + tw > NX + NW) { if (trow) break; trow++; tx = NX; }
    const ty = ny + trow * 14 * U;
    if (ty + 12 * U > PY + PS) break;
    pbox(g, tx, ty, tw, 12 * U, '#9a6a10', 2); pbox(g, tx + U, ty + U, tw - 2 * U, 10 * U, '#fffbe0', 2);
    text(g, tt.s, tx + 4 * U, ty + 9 * U, { size: 30, bold: true, col: '#6a4808' });
    tx += tw + 3 * U;
  }

  // ── 3. 기록: 4칸 한 줄 (도감 · 점수 · 도전과제 · 순위) ──
  const SY = PY + PS + 6 * U, SH = 30 * U;
  pbox(g, IX, SY, IW, SH, '#384868', 2); pbox(g, IX + U, SY + U, IW - 2 * U, SH - 2 * U, '#f8f8f8', 2);
  const ach = S.ach?.length ? `${S.ach.filter((a) => a.claimed).length}/${S.ach.length}` : '-';
  const stats = [['도감', `${D.found}/${D.total}`], ['점수', `${p.score ?? 0}`], ['도전과제', ach],
    ['순위', p.in_ranking === false ? '-' : p.rank ? `#${p.rank}` : '-']];
  const cw4 = IW / 4;
  stats.forEach(([k, v], i) => {
    const cx = IX + cw4 * i + cw4 / 2;
    if (i) rect(g, Math.round(IX + cw4 * i), SY + 6 * U, U, SH - 12 * U, '#d0d4e0');
    text(g, k, cx, SY + 11 * U, { size: 30, col: LBL, align: 'center', maxW: cw4 - 8 * U });
    const vv = fit(g, v, cw4 - 8 * U, 52, 30);
    text(g, vv.s, cx, SY + 25 * U, { size: vv.size, bold: true, align: 'center' });
  });

  // ── 4. 배틀 팀: 2 × 3, 똑같은 6칸 (빈 칸은 점선) ──
  let ty = SY + SH + 16 * U;
  const n = list.length;
  text(g, team ? '나의 배틀 팀' : '나의 포켓몬', IX + U, ty, { size: 40, bold: true, shadow: '#fff8d8' });
  text(g, team ? `${n}/${TEAM_MAX}` : '강한 순', IR - U, ty, { size: 30, bold: true, col: LBL, align: 'right', shadow: '#fff8d8' });
  ty += 5 * U;
  const GAP = 4 * U, slotW = Math.floor((IW - 2 * GAP) / 3 / U) * U, slotH = 48 * U;
  const gx = IX + Math.floor((IW - (3 * slotW + 2 * GAP)) / 2 / U) * U;
  for (let i = 0; i < (n ? TEAM_MAX : 0); i++) {
    const sx = gx + (i % 3) * (slotW + GAP), sy = ty + Math.floor(i / 3) * (slotH + GAP);
    const m = list[i];
    if (!m) { pbox(g, sx, sy, slotW, slotH, 'rgba(255, 252, 236, .45)', 2); dashed(g, sx, sy, slotW, slotH, '#b08a38'); continue; }
    pbox(g, sx, sy, slotW, slotH, GOLD, 2); pbox(g, sx + U, sy + U, slotW - 2 * U, slotH - 2 * U, PAPER, 2);
    await drawMon(g, m, sx + slotW / 2, sy + 35 * U, 2, { w: slotW - 10 * U, h: 25 * U });   // Lv 글자 아래 ~ 이름 위
    text(g, `Lv.${m.level}`, sx + slotW - 4 * U, sy + 9 * U, { size: 26, bold: true, col: LBL, align: 'right' });
    if (m.shiny_on) text(g, '★', sx + 4 * U, sy + 9 * U, { size: 26, bold: true, col: '#d89a10' });
    const sn = fit(g, monSp(m)?.name || '???', slotW - 8 * U, 32, 24);
    text(g, sn.s, sx + slotW / 2, sy + slotH - 4 * U, { size: sn.size, bold: true, align: 'center' });
  }

  if (!n) {   // 포켓몬이 하나도 없음: 큰 점선 칸 하나 + 안내
    const bw2 = 3 * slotW + 2 * GAP, bh2 = 2 * slotH + GAP;
    pbox(g, gx, ty, bw2, bh2, 'rgba(255, 252, 236, .45)', 2); dashed(g, gx, ty, bw2, bh2, '#b08a38');
    text(g, '아직 포켓몬이 없어요', gx + bw2 / 2, ty + bh2 / 2 - 2 * U, { size: 44, bold: true, col: '#9a7a30', align: 'center' });
    text(g, 'QR을 찍어 첫 포켓몬을 만나 봐요!', gx + bw2 / 2, ty + bh2 / 2 + 12 * U, { size: 30, col: '#9a7a30', align: 'center' });
  }

  // ── 5. 배지 (최종 진화시킨 쌤 포켓몬): 가운데 정렬 띠, 많으면 2줄 ──
  const lines = S.catalog.lines.filter((l) => !l.secret && !l.bonus && l.subject !== '야생');
  if (lines.length) {
    const owned = new Map();
    for (const m of mons()) owned.set(m.line_id, Math.max(owned.get(m.line_id) || 0, m.stage));
    const isOn = (l) => (owned.get(l.id) || 0) >= (l.max_stage ?? 3);
    const done = lines.filter(isOn).length;
    let by = ty + 2 * slotH + GAP + 16 * U;
    text(g, '배지', IX + U, by, { size: 40, bold: true, shadow: '#fff8d8' });
    text(g, `${done}/${lines.length}`, IR - U, by, { size: 30, bold: true, col: LBL, align: 'right', shadow: '#fff8d8' });
    by += 5 * U;
    const rows = lines.length > 24 ? 2 : 1;
    const per = Math.ceil(lines.length / rows);
    const bw = Math.max(3 * U, Math.min(9 * U, Math.floor(IW / per / U) * U));
    const ox = IX + Math.floor((IW - per * bw) / 2 / U) * U;
    lines.forEach((l, i) => {
      const on = isOn(l);
      const bx = ox + (i % per) * bw, byy = by + Math.floor(i / per) * bw;
      rect(g, bx, byy, bw - U, bw - U, on ? '#9a6a10' : '#d8bc78');
      rect(g, bx + U, byy + U, bw - 3 * U, bw - 3 * U, on ? '#f8d048' : '#ead39a');
    });
  }
  return c;
}

export async function openCardShare() {
  sfx.select();
  const panel = exportPanel('hafs-trainer-card.png', 'HAFS 몬스터 트레이너 카드');
  const p = S.snap.profile;
  const ov = sheet([h('div.grab'), h('h2', { style: { margin: '0 4px' } }, '트레이너 카드 공유'),
    h('section.box.stack.share-box', ...panel.el,
      h('small.share-hint', { style: { whiteSpace: 'pre-line' } }, p.nickname ? '카드에는 내 이름과 별명이 나와요.\n고유번호 · 이메일은 나오지 않아요.' : '카드에는 내 이름이 나와요.\n설정에서 별명을 정하면 이름 아래에 같이 나와요.\n고유번호 · 이메일은 나오지 않아요.')),
    h('button.btn', { type: 'button', onclick: () => closeOverlay() }, '닫기')]);
  ov.classList.add('share-overlay');
  ov.onclose = panel.done;
  try { await panel.set(await drawCard()); } catch (e) { console.warn(e); toast('카드를 만들지 못했어요.'); }
}

// ───────────────────────── 포켓몬 사진 (1080 × 1080) ─────────────────────────
// 배경: 배틀 · 잡기 장면 그림 (CC0, web/img/battle · catch) + 학교 (여기서 도트로 그림). foot = 포켓몬 발 높이
const cover = async (g, src, sx, sy, sw, sh) => { const i = await img(src); if (!i) return; g.imageSmoothingEnabled = false; g.drawImage(i, sx, sy, sw, sh, 0, 0, 1080, 1080); };
export const BGS = [
  { key: 'grass', label: '풀숲', foot: 880, draw: (g) => cover(g, 'img/battle/forest.png', 2, 2, 155, 155) },
  { key: 'field', label: '초원', foot: 880, draw: (g) => cover(g, 'img/battle/plains.png', 2, 2, 155, 155) },
  { key: 'beach', label: '해변', foot: 880, draw: (g) => cover(g, 'img/battle/beach.png', 2, 2, 155, 155) },
  { key: 'cave', label: '동굴', foot: 880, draw: (g) => cover(g, 'img/battle/underground.png', 2, 2, 155, 155) },
  { key: 'snow', label: '눈밭', foot: 880, draw: (g) => cover(g, 'img/battle/snowy.png', 2, 2, 155, 155) },
  { key: 'night', label: '밤하늘', foot: 880, draw: (g) => cover(g, 'img/catch/night.png', 0, 80, 270, 270) },
  { key: 'day', label: '맑은 날', foot: 880, draw: (g) => cover(g, 'img/catch/day.png', 0, 80, 270, 270) },
  { key: 'sunset', label: '노을', foot: 880, draw: (g) => cover(g, 'img/catch/sunset.png', 0, 80, 270, 270) },
  { key: 'school', label: '학교', foot: 900, draw: (g) => schoolBg(g) },
];

// 학교 배경 (270칸 도트): 하늘 · 구름 · 본관 (시계탑 · 창문 · 깃발) · 나무 · 운동장
function schoolBg(g) {
  const P = (x, y, w, hh, col) => rect(g, x * U, y * U, w * U, hh * U, col);
  const sky = ['#58b0e8', '#68bcf0', '#78c8f0', '#90d4f4', '#a8e0f8', '#c0eaf8'];
  sky.forEach((col, i) => P(0, i * 22, 270, 22, col));
  for (const [cx, cy, s] of [[40, 24, 1], [200, 16, 1.3], [130, 40, 0.8]]) {
    const w = Math.round(30 * s);
    P(cx, cy, w, 6, '#ffffff'); P(cx + 4, cy - 4, w - 10, 4, '#ffffff'); P(cx + 8, cy - 7, w - 18, 3, '#ffffff'); P(cx - 3, cy + 3, w + 6, 4, '#ffffff'); P(cx, cy + 7, w, 2, '#d8f0fc');
  }
  // 먼 산 · 나무 줄
  for (let x = 0; x < 270; x += 2) { const hh = 10 + Math.round(6 * Math.sin(x / 17) + 4 * Math.sin(x / 7)); P(x, 132 - hh, 2, hh, '#78b890'); }
  // 본관
  P(28, 72, 214, 4, '#7a3428'); P(24, 76, 222, 6, '#b04838'); P(24, 82, 222, 2, '#7a3428');
  P(30, 84, 210, 72, '#f0e2c0'); P(30, 84, 210, 2, '#fff4d8'); P(236, 84, 4, 72, '#d8c49c');
  for (let fl = 0; fl < 3; fl++) {
    for (let k = 0; k < 10; k++) {
      const wx = 38 + k * 20 + (k >= 5 ? 6 : 0), wy = 90 + fl * 22;
      if (k === 4 || k === 5) continue;
      P(wx - 1, wy - 1, 12, 14, '#8c7458'); P(wx, wy, 10, 12, '#78b0e0'); P(wx, wy, 10, 3, '#b8dcf8'); P(wx + 4, wy, 2, 12, '#8c7458');
    }
  }
  // 시계탑 + 깃발
  P(112, 44, 46, 112, '#e8d4ac'); P(112, 44, 46, 2, '#fff4d8'); P(108, 40, 54, 5, '#b04838'); P(116, 32, 38, 8, '#b04838'); P(124, 26, 22, 6, '#b04838');
  P(134, 8, 2, 20, '#585868'); P(136, 8, 16, 10, '#2a5cbc'); P(136, 17, 16, 1, '#1c3e8c');
  P(140, 10, 8, 2, '#f48c1c'); P(142, 12, 4, 3, '#f48c1c');
  P(124, 52, 22, 22, '#384868'); P(126, 54, 18, 18, '#fffcf0'); P(134, 56, 2, 8, '#384868'); P(134, 63, 6, 2, '#384868');
  P(122, 128, 26, 28, '#6c4a30'); P(124, 130, 22, 26, '#8c6040'); P(134, 130, 2, 26, '#6c4a30');
  P(118, 120, 34, 4, '#b04838');
  // 나무 (양쪽)
  for (const tx of [6, 236, 252]) {
    P(tx + 6, 128, 4, 28, '#6c4a30');
    P(tx, 104, 16, 26, '#3c9c48'); P(tx + 2, 98, 12, 8, '#3c9c48'); P(tx + 2, 102, 6, 6, '#5cbc6c'); P(tx + 12, 112, 4, 16, '#2a7a38');
  }
  // 운동장 · 길
  P(0, 156, 270, 114, '#88d070'); P(0, 156, 270, 3, '#68b058');
  for (let y = 0; y < 114; y += 2) { const hw = 14 + y * 0.9; P(Math.round(135 - hw), 156 + y, Math.round(hw * 2), 2, y % 8 < 2 ? '#e0d090' : '#e8dc9c'); }
  for (let i = 0; i < 40; i++) { const x = (i * 53) % 270, y = 162 + ((i * 29) % 104); if (Math.abs(x - 135) > 30 + (y - 156)) P(x, y, 2, 2, '#68b058'); }
}

export async function drawPhoto(m, bgKey) {
  await fontsReady();
  const bg = BGS.find((b) => b.key === bgKey) || BGS[0];
  const sp = monSp(m) || speciesOf(spIdOf(m));
  const [c, g] = canvas(1080, 1080);
  rect(g, 0, 0, 1080, 1080, '#283048');
  await bg.draw(g);
  await drawMon(g, m, 540, bg.foot, 9, { w: 900, h: bg.foot - 60 });
  // 이름 상자 (GBA 글상자)
  const bx = 48, bw = 984, bh = 30 * U, byy = 1080 - 48 - bh;
  pbox(g, bx, byy, bw, bh, '#182030', 3); pbox(g, bx + 2 * U, byy + 2 * U, bw - 4 * U, bh - 4 * U, '#4a6a9a', 3); pbox(g, bx + 4 * U, byy + 4 * U, bw - 8 * U, bh - 8 * U, '#f8f8f8', 2);
  const lv = `Lv.${m.level}`;
  g.font = `bold 66px ${FONT}`;
  const lvW = g.measureText(lv).width;
  const mid = byy + bh / 2 + U;
  text(g, `${m.shiny_on ? '★ ' : ''}${sp?.name || '???'}`, bx + 12 * U, mid, { size: 77, bold: true, shadow: '#d8d8d0', maxW: bw - 30 * U - lvW, base: 'middle' });
  text(g, lv, bx + bw - 12 * U, mid, { size: 66, bold: true, shadow: '#d8d8d0', align: 'right', base: 'middle' });
  // 왼쪽 위 로고
  pbox(g, 40, 40, 70 * U, 22 * U, 'rgba(24, 32, 48, .78)', 2);
  logo(g, 40 + 3 * U, 40 + 3 * U, 16 * U);
  text(g, 'HAFS 몬스터', 40 + 22 * U, 40 + 15 * U, { size: 44, bold: true, col: '#ffffff', shadow: '#101828', maxW: 45 * U });
  return c;
}

// back = '돌아가기' 버튼 (포켓몬 요약으로). 없으면 닫기
export async function openPhoto(m, back = null) {
  sfx.select();
  let bgKey = localStorage.getItem('hafs.photoBg') || 'grass';
  if (!BGS.some((b) => b.key === bgKey)) bgKey = 'grass';
  const sp = monSp(m) || speciesOf(spIdOf(m));
  const panel = exportPanel(`hafs-${sp?.name || 'pokemon'}.png`, `${sp?.name || '포켓몬'} · HAFS 몬스터`);
  let seq = 0;
  const redraw = async () => { const n = ++seq; const c = await drawPhoto(m, bgKey); if (n === seq) await panel.set(c); };
  const chips = h('div.share-bgs', { role: 'group', 'aria-label': '배경' }, BGS.map((b) => h('button', {
    type: 'button', 'aria-pressed': String(b.key === bgKey),
    onclick: (e) => {
      if (bgKey === b.key) return;
      bgKey = b.key; localStorage.setItem('hafs.photoBg', bgKey); sfx.blip();
      chips.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === e.currentTarget)));
      redraw().catch((x) => console.warn(x));
    },
  }, b.label)));
  const ov = sheet([h('div.grab'), h('h2', { style: { margin: '0 4px' } }, `${sp?.name || '포켓몬'} 사진 만들기`),
    h('section.box.stack.share-box', h('b', '배경'), chips, ...panel.el),
    h('button.btn', { type: 'button', onclick: () => (back ? back() : closeOverlay()) }, back ? '돌아가기' : '닫기')]);
  ov.classList.add('share-overlay');
  ov.onclose = panel.done;
  try { await redraw(); } catch (e) { console.warn(e); toast('사진을 만들지 못했어요.'); }
}
