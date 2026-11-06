// 사파리존: 지도 탭의 큰 도트 맵 (3세대 사파리존처럼 가운데 + 북서·북동·남서·남동 구역, 모래길로 이어짐).
// v2 (2026-11-05): 동굴 미로 셋 (여울의 동굴 · 미혹의 동굴 · 깊은 동굴) → 깊은 바깥 구역 (깊은 연못 · 하늘 언덕),
//   화면이 어두워지며 지도 이동, 입구 옆 사육사 (전설 힌트 글 상자), 전설 포켓몬 자리 (조건이 되면 '!' → 잡기 훅),
//   사파리볼을 다 쓰면 3세대처럼 "눈이 캄캄해졌다…" → 입구로 돌아감. 예전 판: .work/old/safari_v1.js
//   깊은 동굴의 울트라 워프홀 → 울트라 스페이스 (울트라비스트 전용 구역). 만남 걸음은 구역 (zoneAt) 별로 reportSteps 한 곳에서 보냄.
// v3 (0040): 끌어서 걷는 조이스틱 (왼쪽 칸 아무 데나 누른 곳이 가운데 · 대각선은 가로세로를 번갈아) · A 버튼 하나 (말 걸기 · 글 넘기기 · 고르기,
//   메뉴는 '그만두기' 줄이나 바깥을 눌러 닫음) · 스프레이 (2분 동안 만남 없음, 몇 번이든) · 1.6배 빠른 걸음 · 만남 상한 없음 (볼이 0 일 때만 덮개) ·
//   기다리는 만남은 버튼 없이 자동으로 이어 잡기 · 해변 (zone 'beach') · 레벨은 서버가 구역 + 지도 (p_area) + 입구에서 거리 (p_dist) 로 정함.
// 0043: 사막 · 모래바람 지대 (zone 'desert', 사파리존 서쪽 끝) — 들어서면 "모래바람이 거세게 분다!" · 지도 위에 늘 모래바람 (캔버스 알갱이, 최대 90개 ·
//   움직임 줄이기 설정이면 움직이지 않는 옅은 모래빛만) · 마른 모래 풀숲이 풀숲처럼 다리를 가림.
// 0048: 설원 (zone 'snow', 맨 위 길 · 눈보라 + 얼어붙은 연못에서 미끄러짐) · 용암 지대 ('lava', 왼쪽 아래 길 · 불티 · 아지랑이) ·
//   발전소 ('plant', 왼쪽 위 건물 안 2층 · 깜빡이는 불빛 · 바닥 어디서나 만남) · 용의 굴 ('dragon') — 바다 · 사막 · 설원 · 용암을 모두 다녀오면
//   (서버 safari_visit / safari_state.visited · dragon) 호수에 섬과 다리 가운데 계단이 생김. 운영자가 사파리존을 닫으면 (safari_state.locked) 덮개.
//   나무 · 야자 · 선인장 · 돌기둥 · 건물처럼 위로 솟은 그림은 윗칸에 솟은 부분을 사람 위에 한 번 더 그림 (over 층) — 나무 뒤로 걸어가 보이게.
// 키 큰 풀숲 (동굴은 바닥) 을 걸으면 야생 포켓몬이 나오고 사파리볼(하루 N개)로 잡는다.
// 걸음 판정·볼 개수는 서버 (0033 safari_encounter(p_steps) · safari_result) — 앱은 만남 칸 걸음 수만 보냄.
// 지도 글자·이동·전설 자리 = safari-maps.js. 그림: safari-tiles.png (16px 타일, 위치표 safari-tiles.js) ·
//   safari-hero.png (교복 주인공 16×24) · safari-keeper.png (사육사) — tools/build_safari_tiles.py 가 그림.
// 지도는 그림이 오면 처음 들어갈 때 한 번 큰 캔버스 2장(물·꽃 움직임)에 미리 그려 두고, 매 프레임 카메라 부분만 옮겨 그림. 화면은 기기 픽셀 정수 배.
// 화면은 한 번 만들고 계속 씀 (sync 가 지도 탭을 다시 그려도 걷던 자리·애니메이션이 이어지게).
import { rpc, errorText } from './sb.js';
import { sfx, bgmPush, bgmPreload, encounterCue } from './sfx.js';
import { h, josa } from './ui.js';
import { S } from './state.js';
import { catchEncounter } from './app.js';
import { monCell, spriteCanvas } from './sprites.js';
import TI from '../img/safari-tiles.js';
import { MAPS, SOLID, ENC, LEGEND_HINTS, ZONE_HINTS, ULTRA_BEASTS, DRAGON_ISLE } from './safari-maps.js';
import { flushResult, queuedResult, savePos, loadPos } from './safari-sync.js';

export { LEGEND_HINTS, ZONE_HINTS, ULTRA_BEASTS };

const TS = 16;
const START = { map: 'safari', x: MAPS.safari.start[0], y: MAPS.safari.start[1], dir: MAPS.safari.start[2] };
const STEP_MS = 165;               // 한 칸 걷는 시간 (0040: 267 → 165ms, 1.6배 빠르게 ≈ 6걸음/초 · 서버 걸음 속도 제한 10걸음/초 안쪽)
const SPRAY_MS = 120000;           // 스프레이 한 번 = 2분 동안 야생 포켓몬이 안 나옴 (만남 걸음을 보내지 않음)
const JOY_DEAD = 10;               // 조이스틱: 이보다 덜 끌면 멈춤 (CSS px)
const JOY_R = 36;                  // 조이스틱 손잡이가 움직이는 반지름 (CSS px)
const TURN_MS = 120;               // 새 방향을 짧게 누르면 제자리에서 돌기만 · 이보다 오래 누르면 걷기 시작
const SEND_EVERY = 3;              // 만남 칸 걸음을 몇 걸음마다 서버로 보낼지

// ─────────────────────── 전설 포켓몬 (서버와 이을 곳) ───────────────────────
// ?legend=1 = 시험용: 조건을 모두 채운 것처럼
const DEV_LEGEND = (() => { try { return new URLSearchParams(location.search).get('legend') === '1'; } catch { return false; } })();
const hintOf = (dex) => LEGEND_HINTS.find((l) => l.dex === Number(dex));
// 전국도감 번호 → 앱 species.id (그림판 칸 번호는 species.id). 도감 목록 (S.catalog) 이 있으면 그것,
// 없으면 (불러오기 전·미리보기) 아래 표 — tools/pokemon_sprites.json 에서 잰 값
const SPECIES_FALLBACK = { 377: 667, 378: 670, 379: 673, 486: 826, 249: 493, 382: 682, 383: 685, 250: 496, 384: 688 };
// 전설 포켓몬 지도 그림: 도감 그림 (64칸) 을 지도 도트 크기 (32px, 큰 전설 48px) 로 줄이고 1px 진한 테두리.
// 줄일 때는 칸마다 가장 많은 색 (번지지 않게), 칸의 반 이상이 비면 투명. 한 번 만들면 다시 씀.
const LEG_SIZE = { 249: 48, 382: 48, 383: 48, 384: 48, 486: 40, 250: 40 };
const LEG_ART = new Map();
function legendArt(dex) {
  if (LEG_ART.has(dex)) return LEG_ART.get(dex);
  const cell = monCell(speciesIdOf(dex)); if (!cell) return null;          // 그림판을 받는 중 → 다음 프레임에
  const d = cell.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cell.width, cell.height).data, CW = cell.width;
  let x0 = CW, y0 = CW, x1 = -1, y1 = -1;
  for (let y = 0; y < cell.height; y++) for (let x = 0; x < CW; x++) if (d[(y * CW + x) * 4 + 3] > 64) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const T = LEG_SIZE[dex] || 32;
  const out = document.createElement('canvas'); out.width = out.height = T;
  if (x1 < 0) { LEG_ART.set(dex, out); return out; }
  const w = x1 - x0 + 1, hh = y1 - y0 + 1, k = Math.min(1, (T - 2) / Math.max(w, hh));
  const tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(hh * k));
  const og = out.getContext('2d'); const img = og.createImageData(T, T); const o = img.data;
  const ox = Math.floor((T - tw) / 2), oy = T - 1 - th;
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const bx0 = x0 + Math.floor((tx * w) / tw), bx1 = Math.max(bx0 + 1, x0 + Math.floor(((tx + 1) * w) / tw));
    const by0 = y0 + Math.floor((ty * hh) / th), by1 = Math.max(by0 + 1, y0 + Math.floor(((ty + 1) * hh) / th));
    const cnt = new Map(); let n = 0, best = -1, bc = 0;
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const i = (y * CW + x) * 4; if (d[i + 3] <= 64) continue; n++;
      const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
      const c = (cnt.get(key) || 0) + 1; cnt.set(key, c); if (c > best) { best = c; bc = i; }
    }
    if (n * 2 < (bx1 - bx0) * (by1 - by0)) continue;
    const j = ((oy + ty) * T + ox + tx) * 4; o[j] = d[bc]; o[j + 1] = d[bc + 1]; o[j + 2] = d[bc + 2]; o[j + 3] = 255;
  }
  const solid = (x, y) => x >= 0 && y >= 0 && x < T && y < T && o[(y * T + x) * 4 + 3] === 255;
  const edge = [];
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (!solid(x, y) && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) edge.push((y * T + x) * 4);
  for (const j of edge) { o[j] = 0x18; o[j + 1] = 0x18; o[j + 2] = 0x20; o[j + 3] = 255; }
  og.putImageData(img, 0, 0);
  LEG_ART.set(dex, out);
  return out;
}
const speciesIdOf = (dex) => S.catalog?.species?.find((sp) => sp.dex === dex)?.id || SPECIES_FALLBACK[dex];
// 서버 (0038 safari_state · sync 의 legends) 가 알려 준 전설 조건: setLegendHints([{ dex, ok, cond?, where?, caught?, seen? }])
export function setLegendHints(list) {
  for (const x of list || []) {
    const t = hintOf(x.dex); if (!t) continue;
    if (x.ok != null) t.ok = !!x.ok;
    if (x.caught != null) t.caught = !!x.caught;
    if (x.seen != null) t.seen = !!x.seen;
    if (x.cond) t.cond = x.cond;
    if (x.where) t.where = x.where;
  }
}
// 서버의 퀘스트 줄 (0038 _quest_rows) → 사육사 힌트 (조건 글 + 진행 "물 타입 4/20")
export function hintsFromServer(rows) {
  setLegendHints((rows || []).filter((x) => x.reward === 'map').map((x) => ({
    dex: x.dex, ok: x.ok, caught: x.caught, seen: x.seen || x.caught,
    cond: x.ok || !x.prog ? x.cond : `${x.cond} (지금 ${x.prog})`,
  })));
}
// 조건을 채웠는지 (서버가 채운 ok. ?legend=1 = 시험용으로 모두 채운 것처럼 — 서버가 다시 확인하므로 실제로는 NOT_READY)
export function legendReady(dex) { return DEV_LEGEND || !!hintOf(dex)?.ok; }
// 전설 포켓몬과 만남 → 잡기 (0038): 서버 legend_encounter (조건 · 오늘 도전 횟수 확인) → GO 방식 잡기 (HAFS 볼 N개) → legend_result
//   dex = 전국도감 번호 · ctx = { talk(lines) → Promise, map: 지금 지도 id, name } · 돌려줌 { caught: bool }
//   caught 가 아니면 (도망·놓침) 지도에 그대로 남아 다시 도전할 수 있음.
const LEGEND_ERR = {
  NOT_READY: (n) => [`${n}…?`, '아직 무언가 부족한 것 같다…'],
  NO_TRIES: (n) => [`${josa(n, '은', '는')} 오늘은 더 이상 모습을 보이지 않을 것 같다…`, '내일 다시 와 보자!'],
  ALREADY_CAUGHT: (n) => [`${josa(n, '은', '는')} 이미 내 박스에 있다!`],
  BOX_FULL: () => ['박스가 꽉 찼다! 가방 → 포켓몬에서 몇 마리를 놓아준 뒤에 다시 오자.'],
};
export async function startLegendEncounter(dex, ctx) {
  if (!S.online) { await ctx.talk(['인터넷이 연결되어야 전설의 포켓몬과 만날 수 있어요.']); return { caught: false }; }
  let r;
  try { r = await rpc('legend_encounter', { p_dex: Number(dex) }, { retries: 1 }); } catch (e) {
    const f = LEGEND_ERR[e.message];
    await ctx.talk(f ? f(ctx.name) : [errorText(e.message)]);
    if (e.message === 'ALREADY_CAUGHT') { const t = hintOf(dex); if (t) t.caught = true; return { caught: true }; }
    return { caught: false };
  }
  const res = await catchEncounter({ ...r.encounter, kind: 'legend' });
  return { caught: !!res?.caught };
}

// ─────────────────────── 도트 그림 (그림판 → 미리 그린 맵) ───────────────────────
const loadImg = (name) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = new URL(`../img/${name}`, import.meta.url).href; });
const isSand = (c) => c === '#';
const isWater = (c) => c === '~' || c === 'b' || c === 'Z';
const isFence = (c) => c === 'F';
const isRock = (c) => c === 'M' || c === 'C';
const isCWall = (c) => c === 'W' || c === 'B';
const isPWall = (c) => c === 'P' || c === 'B';
const isStair = (c) => c === '=' || c === 'E';
const isMesa = (c) => c === 'M';
const isPlW = (c) => c === 'W' || c === 'p' || c === 'q';
// 위로 솟은 그림 (지도 종류 → 글자 → [타일 이름, 바닥 칸 높이]): 바닥 칸보다 위로 솟은 부분은 over 층에 한 번 더 (사람 · 사육사 위)
const TALLS = {
  out: { T: ['tree', 1], H: ['plbuild', 5] }, beach: { T: ['palm', 1] }, shrine: { I: ['spillar', 1] },
  desert: { C: ['dcactus', 1], P: ['dpillar', 1], D: ['ddune', 2] },
  snow: { T: ['snpine', 1], H: ['sncabin', 2] }, lava: { T: ['lvtree', 1] }, plant: { G: ['plgen', 2] },
};
// 풀숲 칸 그림 (만남 풀숲 · 흔들리는 잎 · 그 밑 바닥) — 주인공 다리를 가리는 지도 종류
const GRASS = { out: ['tall', 'tallR', 'ground'], beach: ['tall', 'tallR', 'bsand0'], desert: ['dgrass', 'dgrassR', 'dsand0'],
  snow: ['tall', 'tallR', 'snground0'], lava: ['lvgrass', 'lvgrassR', 'lvground0'] };
// over 층: 위로 솟은 그림의 윗부분만 (없으면 null)
function prerenderOver(sheet, m) {
  const tall = TALLS[m.kind]; if (!tall) return null;
  const R = m.rows, W = R[0].length, H = R.length;
  const cv = document.createElement('canvas'); cv.width = W * TS; cv.height = H * TS;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  let any = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = tall[R[y][x]]; if (!d) continue;
    const t = TI[d[0]]; if (!t) continue;
    const up = t[3] - d[1] * TS; if (up <= 0) continue;         // 바닥 칸 위로 솟은 줄 수
    g.drawImage(sheet, t[0], t[1], t[2], up, x * TS, (y + 1) * TS - t[3], t[2], up);
    any = true;
  }
  return any ? cv : null;
}
function prerender(sheet, f, m) {
  const R = m.rows, W = R[0].length, H = R.length, cave = m.kind === 'cave';
  // 이웃 비트 N1 E2 S4 W8 (이웃도 같은 땅이면 1). 맵 밖 = out
  const same = (x, y, test, out) => (x < 0 || y < 0 || x >= W || y >= H ? out : test(R[y][x]));
  const maskOf = (x, y, test, out = false) => (same(x, y - 1, test, out) ? 1 : 0) | (same(x + 1, y, test, out) ? 2 : 0) | (same(x, y + 1, test, out) ? 4 : 0) | (same(x - 1, y, test, out) ? 8 : 0);
  // 안쪽 모서리: 두 옆은 같은 땅인데 대각선만 다른 땅
  const corners = (x, y, mk, test, out = false) => {
    const r = [];
    if ((mk & 9) === 9 && !same(x - 1, y - 1, test, out)) r.push('nw');
    if ((mk & 3) === 3 && !same(x + 1, y - 1, test, out)) r.push('ne');
    if ((mk & 12) === 12 && !same(x - 1, y + 1, test, out)) r.push('sw');
    if ((mk & 6) === 6 && !same(x + 1, y + 1, test, out)) r.push('se');
    return r;
  };
  const cv = document.createElement('canvas'); cv.width = W * TS; cv.height = H * TS;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const put = (name, x, y) => { const t = TI[name]; if (t) g.drawImage(sheet, t[0], t[1], t[2], t[3], x, y + TS - t[3], t[2], t[3]); };
  const water = (x, y, X, Y) => {
    const mk = maskOf(x, y, isWater); put(`water${f}`, X, Y); put(`shore${mk}`, X, Y);
    for (const k of corners(x, y, mk, isWater)) put(`shorec${k}`, X, Y);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = R[y][x], X = x * TS, Y = y * TS;
      if (m.kind === 'ultra') {
        if (c === 'X') { put(`uvoid${(f + x + y) & 1}`, X, Y); continue; }
        put(`uplat${maskOf(x, y, (k) => k !== 'X')}`, X, Y);
        if (c === '=') put('upath', X, Y);
        else if (c === 'K') put(`ucrystal${(x + y) & 1 ? 'B' : 'A'}`, X, Y);
        continue;
      }
      if (m.kind === 'beach') {      // 0040 해변: 모래 · 얕은 물 (물거품 테두리) · 깊은 바다 · 산호 · 바닷가 풀숲 · 바위 · 조개 (야자나무는 아래에서 따로)
        const wet = (k) => k === 'w' || k === '~' || k === 'c';
        if (c === '~') { put(`bdeep${f}`, X, Y); put(`bdeepe${maskOf(x, y, (k) => k === '~', true)}`, X, Y); continue; }
        if (c === 'w' || c === 'c') { const mk = maskOf(x, y, wet, true); put(`bshal${mk}_${f}`, X, Y); for (const k of corners(x, y, mk, wet, true)) put(`bshalc${k}`, X, Y); if (c === 'c') put((x * 3 + y) % 2 ? 'bcoralB' : 'bcoralA', X, Y); continue; }
        put(`bsand${(x * 7 + y * 3) % 5 === 0 ? 1 : 0}`, X, Y);
        const o = { ',': 'tall', R: 'brock', S: 'bsign', h: 'bshell' }[c];
        if (o) put(o, X, Y);
        continue;
      }
      if (m.kind === 'desert') {     // 0043 사막: 모래 · 모래 물결 · 붉은 사암 절벽 · 유적 바닥 (기둥 선인장 · 돌기둥 · 모래 언덕은 아래에서 따로)
        if (c === 'M') {
          const mk = maskOf(x, y, isMesa, true);
          put('dsand0', X, Y); put(`dwall${mk}_${(x * 7 + y * 13) % 3}`, X, Y);
          if (mk & 4) for (const k of corners(x, y, mk, isMesa, true)) put(`dwallc${k}`, X, Y);
          continue;
        }
        if (c === '-') { put(`dripple${(((x / 3) | 0) + y) % 2}`, X, Y); continue; }
        put(c === 'x' || c === 'K' || c === 'o' ? `druin${(x * 5 + y * 3) % 4 === 0 ? 1 : 0}` : `dsand${(x * 7 + y * 3) % 5 === 0 ? 1 : 0}`, X, Y);
        const o = { ',': 'dgrass', c: 'dcactusS', R: 'drock', o: 'drubble', K: 'dskull', b: 'dbones', S: 'dsign' }[c];
        if (o) put(o, X, Y);
        continue;
      }
      if (m.kind === 'shrine') {     // 전설의 제단: 돌바닥 · 절벽 · 돌계단 · 대리석 제단 (돌기둥은 아래에서 따로)
        const v = (x * 7 + y * 13) % 3;
        if (c === 'P' || c === 'B') {
          const mk = maskOf(x, y, isPWall, true);
          put('sfloor0', X, Y); put(`pwall${mk}_${v}`, X, Y);
          if (mk & 4) for (const k of corners(x, y, mk, isPWall, true)) put(`pwallc${k}`, X, Y);
          if (c === 'B') put('cbraille', X, Y);
          continue;
        }
        if (c === '=' || c === 'E') { const l = same(x - 1, y, isStair, false), r = same(x + 1, y, isStair, false); put(`sstairs${l && r ? 'C' : r ? 'L' : l ? 'R' : 'C'}`, X, Y); continue; }
        if (c === 'A' || c === 'L') { put('saltar', X, Y); continue; }
        if (c === 'U') { put('cladderU', X, Y); continue; }
        put(`sfloor${(x * 5 + y * 3) % 7 === 0 ? 1 : 0}`, X, Y);
        if (c === 'r') put('crock', X, Y);
        continue;
      }
      if (cave) {
        if (isCWall(c)) {          // 벽 밑에 바닥을 먼저 (울퉁불퉁한 위 턱 사이로 보임) · 무늬 변형 3가지를 섞어 줄무늬처럼 안 보이게
          const mk = maskOf(x, y, isCWall, true);
          put('cfloor0', X, Y); put(`cwall${mk}_${(x * 7 + y * 13) % 3}`, X, Y);
          if (mk & 4) for (const k of corners(x, y, mk, isCWall, true)) put(`cwallc${k}`, X, Y);   // 윗면 안쪽 모서리
          if (c === 'B') put('cbraille', X, Y);
          continue;
        }
        if (c === '~') { water(x, y, X, Y); continue; }
        put(`cfloor${(x * 7 + y * 3) % 3 === 0 ? 1 : 0}`, X, Y);
        const o = { r: 'crock', O: 'cboulder', o: 'chole', U: 'cladderU', V: 'cladderD', E: 'cexit', S: 'sign' }[c];
        if (o) put(o, X, Y);
        continue;
      }
      if (m.kind === 'snow') {       // 0048 설원: 눈 · 눈 덮인 흙 턱 · 돌계단 · 얼어붙은 연못 (소나무 · 오두막은 아래에서 따로)
        if (c === 'M') {
          const mk = maskOf(x, y, isMesa, true);
          put('snground0', X, Y); put(`swall${mk}_${(x * 7 + y * 13) % 3}`, X, Y);
          if (mk & 4) for (const k of corners(x, y, mk, isMesa, true)) put(`swallc${k}`, X, Y);
          continue;
        }
        if (c === 'I') { put(`snice${maskOf(x, y, (k) => k === 'I')}`, X, Y); continue; }
        if (c === '=') { put('snstairs', X, Y); continue; }
        if (c === 'E') { put('snexit', X, Y); continue; }
        put(`snground${(x * 7 + y * 3) % 5 === 0 ? 1 : 0}`, X, Y);
        const o = { ',': 'tall', R: 'snrock', S: 'snsign', n: 'snman' }[c];
        if (o) put(o, X, Y);
        continue;
      }
      if (m.kind === 'lava') {       // 0048 용암 지대: 분홍빛 붉은 바위 · 검붉은 절벽 · 바위 계단 · 용암 (2장) · 분기공 (마른 나무는 아래에서 따로)
        if (c === 'M') {
          const mk = maskOf(x, y, isMesa, true);
          put('lvground0', X, Y); put(`lwall${mk}_${(x * 7 + y * 13) % 3}`, X, Y);
          if (mk & 4) for (const k of corners(x, y, mk, isMesa, true)) put(`lwallc${k}`, X, Y);
          continue;
        }
        if (c === '~') {
          const isL = (k) => k === '~', mk = maskOf(x, y, isL, true);
          put(`lava${f}`, X, Y); put(`lavae${mk}`, X, Y);
          for (const k of corners(x, y, mk, isL, true)) put(`lavac${k}`, X, Y);
          continue;
        }
        if (c === '=') { put('lvstairs', X, Y); continue; }
        if (c === 'E') { put('lvexit', X, Y); continue; }
        put(`lvground${(x * 7 + y * 3) % 5 === 0 ? 1 : 0}`, X, Y);
        const o = { ',': 'lvgrass', V: `lvvent${(f + x) & 1}`, R: 'lvrock', S: 'lvsign' }[c];
        if (o) put(o, X, Y);
        continue;
      }
      if (m.kind === 'plant') {      // 0048 발전소: 바깥 (검정) · 두꺼운 벽 (윗면 · 벽면) · 벽 속 관 · 바닥 타일 + 벽 밑 그늘 · 기계 (큰 발전기는 아래에서 따로)
        if (c === 'X') { put('plvoid', X, Y); continue; }
        if (isPlW(c)) {
          put(`plw${maskOf(x, y, isPlW, false)}`, X, Y);
          if (c === 'p') put('plpipeB', X, Y); else if (c === 'q') put('plpipeG', X, Y);
          continue;
        }
        if (c === 'U' || c === 'V') { put('plstairs', X, Y); continue; }
        if (c === 'E') { put('plexit', X, Y); continue; }
        put(c === 'o' ? 'plswitch' : `plfloor${(x + y) % 7 === 0 ? 1 : 0}`, X, Y);
        if (same(x, y - 1, isPlW, false)) put('plshadow', X, Y);
        const o = { k: 'plrack', g: `plcon${(f + x) & 1}`, c: 'plcrate', S: 'plsign' }[c];
        if (o) put(o, X, Y);
        continue;
      }
      if (m.kind === 'dcave') {      // 0048 용의 굴: 보랏빛 바위벽 · 바닥 · 물 · 바위 · 용의 수정 · 사다리
        if (isCWall(c)) {
          const mk = maskOf(x, y, isCWall, true);
          put('efloor0', X, Y); put(`ewall${mk}_${(x * 7 + y * 13) % 3}`, X, Y);
          if (mk & 4) for (const k of corners(x, y, mk, isCWall, true)) put(`ewallc${k}`, X, Y);
          continue;
        }
        if (c === '~') { water(x, y, X, Y); continue; }
        put(c === 'U' ? 'eladder' : `efloor${(x * 7 + y * 3) % 3 === 0 ? 1 : 0}`, X, Y);
        const o = { r: 'erock', O: 'eboulder', K: 'ecrystal', S: 'sign' }[c];
        if (o) put(o, X, Y);
        continue;
      }
      if (c === '#') {
        const mk = maskOf(x, y, isSand, true); put(`sand${mk}`, X, Y);
        for (const k of corners(x, y, mk, isSand, true)) put(`sandc${k}`, X, Y);
        continue;
      }
      if (isWater(c)) { water(x, y, X, Y); if (c === 'b' || c === 'Z') put('bridge', X, Y); if (c === 'Z') put('bstair', X, Y); continue; }
      if (isRock(c)) {
        const mk = maskOf(x, y, isRock);
        put('ground', X, Y); put(`mwall${mk}_${(x * 7 + y * 13) % 3}`, X, Y);
        if (mk & 4) for (const k of corners(x, y, mk, isRock)) put(`mwallc${k}`, X, Y);
        if (c === 'C') put('mouth', X, Y);
        continue;
      }
      put('ground', X, Y);
      if (c === ',') put('tall', X, Y);
      else if (c === 'f') put(`flower${(x + y) & 1 ? 'B' : 'A'}${(f + x) & 1}`, X, Y);
      else if (c === 'F') put(`fence${maskOf(x, y, isFence)}`, X, Y);
      else if (c === 'R') put('rock', X, Y);
      else if (c === 'S') put('sign', X, Y);
      else if (c === 'G') put('post', X, Y);
    }
  }
  // 나무는 위 줄부터: 뾰족한 머리가 윗칸으로 8px 솟아 윗나무 밑동을 덮음 (숲이 빽빽해 보임)
  if (m.kind === 'out') for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (R[y][x] === 'T') put('tree', x * TS, y * TS);
  if (m.kind === 'out') for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (R[y][x] === 'H') put('plbuild', x * TS, y * TS);   // 0048 발전소 단지 96×88 (H = 왼쪽 아래 칸)
  if (m.kind === 'snow' || m.kind === 'lava' || m.kind === 'plant') for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {   // 0048 눈 소나무 · 오두막 · 마른 나무 · 큰 발전기
    const n = TALLS[m.kind][R[y][x]]?.[0];
    if (n) put(n, x * TS, y * TS);
  }
  if (m.kind === 'beach') for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (R[y][x] === 'T') put('palm', x * TS, y * TS);   // 야자나무 16×24
  if (m.kind === 'shrine') for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (R[y][x] === 'I') put('spillar', x * TS, y * TS);   // 16×32, 윗칸으로 솟음
  if (m.kind === 'desert') for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {   // 기둥 선인장 16×24 · 사암 돌기둥 16×32 · 모래 언덕 48×32 (D = 왼쪽 아래 칸)
    const n = { C: 'dcactus', P: 'dpillar', D: 'ddune' }[R[y][x]];
    if (n) put(n, x * TS, y * TS);
  }
  return cv;
}
const HW = 16, HH = 24;              // 사람 한 칸 (발 = 칸 아래쪽, 머리는 윗칸으로 8px)
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_ROW = { down: 0, up: 1, left: 2, right: 3 };
const BACK = { up: 'down', down: 'up', left: 'right', right: 'left' };

// ─────────────────────── 화면 (한 번만 만듦) ───────────────────────
let V = null;            // 화면 · 상태
const P = { x: START.x, y: START.y, dir: START.dir, fx: START.x, fy: START.y, moving: false, t0: 0, from: null, stepN: 0 };
let mapId = START.map, M = MAPS[mapId];
const MW = () => M.rows[0].length, MH = () => M.rows.length;
const tileAt = (x, y) => (x < 0 || y < 0 || x >= MW() || y >= MH() ? ({ cave: 'W', ultra: 'X', shrine: 'P', desert: 'M', lava: 'M', plant: 'X', dcave: 'W' }[M.kind] || 'T') : M.rows[y][x]);
// 이 칸의 만남 구역: 'grass' | 'pond' | 'cave' | 'deep' | 'ultra' | 'beach' | 'desert' (만남 칸이 아니면 null)
//   0040: 사파리존 풀숲 중 물 (연못 · 다리) 2칸 안 = 'pond' (물 타입 포켓몬도 나옴)
export function zoneAt(x, y) {
  if (!ENC[M.kind].has(tileAt(x, y))) return null;
  if (M.zone === 'grass') for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (isWater(tileAt(x + dx, y + dy))) return 'pond';
  return M.zone;
}
export const currentZone = () => M.zone;
// 0040: 레벨용 — 지도 입구 (start) 에서 지금 칸까지 거리 (입구가 없는 지도 = 0, 서버가 그 지도의 레벨 범위에서 무작위)
const areaDist = () => (M.start ? Math.round(Math.hypot(P.x - M.start[0], P.y - M.start[1])) : 0);
// 만남 칸 걸음 보내기 — 걸음은 모두 여기 한 곳으로 (구역이 바뀌면 그 전에 따로 보냄)
export async function reportSteps(n, zone, area = mapId, dist = areaDist()) {
  // 0038: 서버가 구역별 포켓몬을 고름 · 0040: 사는 곳 (해변 = 물·얼음 …) + 레벨 (지도 p_area 의 범위 안에서 입구 거리 p_dist 만큼)
  return rpc('safari_encounter', { p_steps: n, p_zone: zone || currentZone() || 'grass', p_area: area, p_dist: dist });
}
// 사람·전설 포켓몬 (지도마다): { type: 'npc' | 'legend', o }
function objAt(x, y) {
  for (const n of M.npcs || []) if (n.x === x && n.y === y) return { type: 'npc', o: n };
  for (const l of M.legends || []) if (l.x === x && l.y === y && !hintOf(l.dex)?.caught) return { type: 'legend', o: l };
  return null;
}
// 지도의 울트라 워프홀 칸 (Q) — 한 번만 찾아 둠
const wormsOf = (m) => (m._worms ||= m.rows.flatMap((r, y) => [...r].map((c, x) => (c === 'Q' ? [x, y] : null)).filter(Boolean)));
const solidAt = (x, y) => SOLID[M.kind].has(tileAt(x, y)) || !!objAt(x, y);

export function viewSafari() {
  hintsFromServer(S.snap?.legends);     // 0038: sync 로 받은 전설 조건 (사파리존 상태를 받으면 다시)
  if (!V) V = build();
  V.start();
  V.refresh();
  bgmPreload('wild');   // 풀숲 만남 때 바로 나오게 야생 곡을 미리 풀어 둠
  return V.root;
}

function build() {
  let sheet = null, hero = null, keeper = null;   // 그림이 오기 전엔 빈 배경
  const cache = {};                                // 지도 id → [미리 그린 맵 2장, over 층 (없으면 null)]
  const mapsOf = (id) => (sheet ? (cache[id] ||= [prerender(sheet, 0, MAPS[id]), prerender(sheet, 1, MAPS[id]), prerenderOver(sheet, MAPS[id])]) : null);
  Promise.all([loadImg('safari-tiles.png'), loadImg('safari-hero.png'), loadImg('safari-keeper.png')]).then(([sh, hr, kp]) => {
    sheet = sh; hero = hr; keeper = kp; mapsOf(mapId);
  }).catch(() => {});
  const cv = h('canvas.sf-canvas', { 'aria-label': '사파리존 지도. 아래 왼쪽 칸을 누른 채로 끌거나 키보드 화살표로 걷고, A 버튼으로 말을 걸어요.' });
  const g = cv.getContext('2d');
  const cover = h('div.sf-cover', { hidden: true });
  const msg = h('p.sf-msg', { 'aria-live': 'polite' });          // 맵 아래쪽 짧은 안내 (몇 초 뒤 사라짐)
  const place = h('p.sf-place', { 'aria-live': 'polite' });       // 지도에 들어설 때 왼쪽 위 이름표
  const talkTx = h('span.sf-tt');
  const talkMore = h('span.sf-more', '▼');
  const talkEl = h('div.box.sf-talk', { hidden: true, 'aria-live': 'polite' }, talkTx, talkMore);   // 3세대 글 상자
  const menuEl = h('div.box.sf-menu', { hidden: true });           // 사육사 고르기 메뉴
  const stage = h('div.sf-stage', cv, place, msg, talkEl, menuEl, cover);
  const ballsEl = h('b.sf-num', '-');
  const encEl = h('span.sf-sub', '');
  let ballIco = h('span.sf-ball');
  import('./catch.js').then((m) => { const c = m.ballCanvas('safari', 2); ballIco.replaceWith(c); ballIco = c; }).catch(() => {});
  const keys = [];              // 누르고 있는 키 방향 (마지막 것 우선)
  // ── 조이스틱 (0040): 왼쪽 칸 아무 데나 누른 곳이 가운데 → 끄는 쪽으로 걷기 · 떼면 멈춤 ──
  //   격자 걷기라 대각선은 가로 · 세로를 한 칸씩 번갈아 (한쪽이 막히면 다른 쪽), 그 밖에는 더 많이 끈 쪽 (바뀔 때는 1.3배 넘어야 — 덜 떨림)
  const joy = { id: null, cx: 0, cy: 0, vx: 0, vy: 0, axis: null, lastAxis: 'y', menuDir: null };
  const joyKnob = h('i.sf-jk');
  const joyBase = h('span.sf-jb', joyKnob);
  const joyEl = h('div.sf-joy', { role: 'group', 'aria-label': '이동: 이 칸을 누른 채로 끌면 그쪽으로 걸어요' }, joyBase, h('small.sf-jt', '끌어서 걷기'));
  const joyCentre = () => { joyBase.style.left = ''; joyBase.style.top = ''; joyKnob.style.transform = ''; joyEl.classList.remove('on'); };
  const joyClear = () => { joy.id = null; joy.vx = joy.vy = 0; joy.axis = null; joy.menuDir = null; joyCentre(); };
  const clearPad = () => { keys.length = 0; joyClear(); };
  joyEl.addEventListener('pointerdown', (e) => {
    if (joy.id != null) return;
    e.preventDefault();
    const r = joyEl.getBoundingClientRect();
    joy.id = e.pointerId; joy.cx = e.clientX; joy.cy = e.clientY; joy.vx = joy.vy = 0; joy.axis = null; joy.menuDir = null;
    try { joyEl.setPointerCapture(e.pointerId); } catch { /* */ }
    joyBase.style.left = `${e.clientX - r.left}px`; joyBase.style.top = `${e.clientY - r.top}px`; joyEl.classList.add('on');
    if (talkQ && !menuQ) advance();          // 글 상자 중에 누르면 글 넘기기 (A 와 같음)
  });
  joyEl.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joy.id) return;
    e.preventDefault();
    joy.vx = e.clientX - joy.cx; joy.vy = e.clientY - joy.cy;
    const m = Math.hypot(joy.vx, joy.vy), k = m > JOY_R ? JOY_R / m : 1;
    joyKnob.style.transform = `translate(${Math.round(joy.vx * k)}px, ${Math.round(joy.vy * k)}px)`;
    if (menuQ) {                               // 메뉴: 위아래로 끌 때마다 한 줄
      const d = Math.abs(joy.vy) > JOY_DEAD * 2 && Math.abs(joy.vy) > Math.abs(joy.vx) ? (joy.vy > 0 ? 'down' : 'up') : null;
      if (d && d !== joy.menuDir) menuMove(d);
      joy.menuDir = d;
    }
  });
  const joyUp = (e) => { if (e.pointerId === joy.id) joyClear(); };
  joyEl.addEventListener('pointerup', joyUp); joyEl.addEventListener('pointercancel', joyUp); joyEl.addEventListener('lostpointercapture', joyUp);
  joyEl.addEventListener('contextmenu', (e) => e.preventDefault());
  // 조이스틱이 가리키는 걸음 방향 (먼저 해 볼 쪽부터)
  function joyDirs() {
    const ax = Math.abs(joy.vx), ay = Math.abs(joy.vy), mx = Math.max(ax, ay);
    if (mx < JOY_DEAD) { joy.axis = null; return []; }
    const hd = joy.vx > 0 ? 'right' : 'left', vd = joy.vy > 0 ? 'down' : 'up';
    if (Math.min(ax, ay) / mx > 0.5) return joy.lastAxis === 'x' ? [vd, hd] : [hd, vd];   // 대각선: 번갈아
    if (joy.axis === 'x' && ay > ax * 1.3) joy.axis = 'y';
    else if (joy.axis === 'y' && ax > ay * 1.3) joy.axis = 'x';
    else if (!joy.axis) joy.axis = ax >= ay ? 'x' : 'y';
    return [joy.axis === 'x' ? hd : vd];
  }
  const faceBtn = (cls, label, aria, fn) => {
    const b = h(`button.${cls}`, { type: 'button', 'aria-label': aria }, label);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  };
  const aBtn = faceBtn('sf-a', 'A', 'A 버튼: 말 걸기 · 글 넘기기 · 고르기', () => pressA());
  // ── 스프레이 (0040): 2분 동안 야생 포켓몬이 안 나옴 (만남 걸음을 서버로 보내지 않음) · 몇 번이든 · 전설 · 사람에게는 그대로 말을 걸 수 있음 ──
  let sprayUntil = Number(localStorage.getItem('sfSprayUntil')) || 0, sprayWas = false;
  const sprayOn = () => Date.now() < sprayUntil;
  const sprayTime = h('b.sf-st', '');
  const sprayBtn = faceBtn('sf-spray', [h('span.sf-sl', '스프레이'), sprayTime], '스프레이: 2분 동안 야생 포켓몬이 나오지 않아요', () => useSpray());
  function useSpray() {
    sprayUntil = Date.now() + SPRAY_MS;
    try { localStorage.setItem('sfSprayUntil', String(sprayUntil)); } catch { /* */ }
    pend.n = 0; sfx.select();
    say('스프레이를 뿌렸다! 2분 동안 야생 포켓몬이 나오지 않아요.', 2500);
    paintSpray();
  }
  function paintSpray() {
    const on = sprayOn(), left = Math.max(0, Math.ceil((sprayUntil - Date.now()) / 1000));
    sprayTime.textContent = on ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '2분';
    sprayBtn.classList.toggle('on', on);
    sprayBtn.setAttribute('aria-label', on ? `스프레이 효과 ${Math.floor(left / 60)}분 ${left % 60}초 남음 (누르면 다시 2분)` : '스프레이: 2분 동안 야생 포켓몬이 나오지 않아요');
    if (sprayWas && !on && root.isConnected && S.tab === 'map') say('스프레이 효과가 사라졌다!', 2500);
    sprayWas = on;
  }
  setInterval(() => { if (root.isConnected) paintSpray(); }, 500);
  const actWrap = h('div.sf-act', { role: 'group', 'aria-label': 'A 버튼 · 스프레이' }, aBtn, sprayBtn);
  const info = h('div.sf-info', h('div.sf-balls', ballIco, h('span.sf-bl', h('small', '사파리볼'), ballsEl)), encEl);
  const ctl = h('div.sf-ctl', info, h('div.sf-btns', joyEl, actWrap));
  const root = h('div.sf', stage, ctl);
  paintSpray();

  const KEY = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
  const A_KEYS = new Set(['Enter', ' ', 'z', 'Z']);
  const B_KEYS = new Set(['x', 'X', 'Escape', 'Backspace']);     // PC: 메뉴 닫기 · 글 넘기기 (화면 버튼은 A 하나)
  const active = () => root.isConnected && S.tab === 'map' && !S.overlay && !document.querySelector('.cz-layer');
  window.addEventListener('keydown', (e) => {
    if (!active() || e.target?.closest?.('input,textarea,select')) return;
    if (A_KEYS.has(e.key)) { e.preventDefault(); if (!e.repeat) pressA(); return; }
    if (B_KEYS.has(e.key)) { e.preventDefault(); if (!e.repeat) pressB(); return; }
    const d = KEY[e.key]; if (!d) return;
    e.preventDefault();
    if (menuQ) { menuMove(d); return; }
    if (talkQ) return;
    if (!keys.includes(d)) keys.push(d); kick(d);
  });
  window.addEventListener('keyup', (e) => { const d = KEY[e.key]; if (d) { const i = keys.indexOf(d); if (i >= 0) keys.splice(i, 1); } });
  window.addEventListener('blur', () => { clearPad(); });
  // 걸을 방향 후보 (조이스틱이면 대각선 2개까지, 키보드는 마지막에 누른 키)
  const wantDirs = () => (joy.id != null ? joyDirs() : keys.length ? [keys[keys.length - 1]] : []);

  // ── 서버 상태 ──
  let st = null, loading = false, inflight = false, pend = { n: 0, zone: null, area: null }, busy = false, seq = false, flashT = -1, bubbleT = -1, lastSign = '';
  let bang = null;              // 전설 포켓몬 머리 위 '!' { x, y }
  let rustle = null;            // 흔들리는 풀숲 { x, y, t0 } (2장 · 0.27초)
  let sayTimer = 0;
  const say = (t, ms = 4500) => {
    msg.textContent = t || ''; msg.classList.toggle('on', !!t);
    clearTimeout(sayTimer); if (t) sayTimer = setTimeout(() => { msg.classList.remove('on'); lastSign = ''; }, ms);
  };
  let placeTimer = 0;
  const showPlace = (name) => { place.textContent = name; place.classList.add('on'); clearTimeout(placeTimer); placeTimer = setTimeout(() => place.classList.remove('on'), 1800); };
  const HINT = { snow: '눈 속 풀숲을 걸으면 얼음 · 페어리 포켓몬이 나와요!', lava: '잿빛 풀숲을 걸으면 불꽃 · 강철 포켓몬이 나와요!',
    plant: '발전소 바닥을 걸으면 전기 · 고스트 포켓몬이 나와요!', dcave: '용의 굴 바닥을 걸으면 드래곤 포켓몬이 나와요!', desert: '마른 모래 풀숲을 걸으면 땅 · 바위 포켓몬이 나와요!', beach: '얕은 물과 바닷가 풀숲을 걸으면 물 포켓몬이 나와요!', out: '키 큰 풀숲을 걸으면 야생 포켓몬이 나와요!', cave: '동굴 바닥을 걸으면 야생 포켓몬이 나와요!', ultra: '울트라 스페이스를 걸으면 울트라비스트가 나와요!', shrine: '전설의 포켓몬이 잠든 제단이다…' };
  let hintKind = '';
  const sayHint = () => { if (!closed() && !talkQ && hintKind !== M.kind) { hintKind = M.kind; say(HINT[M.kind]); } };
  setTimeout(() => (AREA_MSG[M.kind] ? sandMsg() : sayHint()), 900);
  // 0043 사막: 3세대처럼 글 상자에 "모래바람이 거세게 분다!" (A · 화면을 누르거나 2.4초 뒤 저절로 닫힘) → 그 땅의 안내
  //   0048: 설원 · 용암 지대 · 발전소 · 용의 굴도 들어설 때 한 줄
  const AREA_MSG = { desert: '모래바람이 거세게 분다!', snow: '눈이 펑펑 내리고 있다!', lava: '후끈한 열기가 느껴진다!',
    plant: '전기가 찌릿찌릿 흐르고 있다… 불빛이 깜빡인다!', dcave: '어디선가 용의 기운이 느껴진다…' };
  function sandMsg() {
    if (!AREA_MSG[M.kind] || !root.isConnected) return;
    if (talkQ || menuQ || busy || seq) { sayHint(); return; }
    const p = talk([AREA_MSG[M.kind]]);
    const q = talkQ;
    const close = () => { if (talkQ !== q) return; if (q.typing) { advance(); setTimeout(close, 500); } else advance(); };
    setTimeout(close, 2400);
    p.then(() => setTimeout(sayHint, 200));
  }
  let queued = null;            // 보내지 못한 잡기 결과 (safari-sync) — 있으면 '결과 보내기'
  const refresh = async () => {
    if (loading || !S.online) { queued = await queuedResult(); paintInfo(); return; }
    loading = true;
    try {
      if (await queuedResult()) {           // 인터넷이 끊겨 남겨 둔 결과부터 보냄 (만남 id 로 한 번만)
        const f = await flushResult();
        if (f?.ok) say(f.r?.caught ? '남겨 둔 잡기 결과를 보냈어요!' : '남겨 둔 결과를 보냈어요.', 3000);
      }
      queued = await queuedResult();
      st = await rpc('safari_state', {});
      hintsFromServer(st?.legends);          // 0038: 사육사 · 전설 자리 = 서버의 진짜 조건
    } catch (e) { if (!e.offline) say(errorText(e.message)); }
    loading = false;
    try { localStorage.setItem('sfLocked', st?.locked ? '1' : '0'); } catch { /* */ }
    applyDragon(); paintInfo();
    if (st && !st.pending && (st.locked || (mapId === 'dragon' && !st.dragon)) && mapId !== START.map && !busy) leaveToStart();
    else noteVisit(mapId);
    maybeResume();
  };
  // ── 0048 방문 기록 · 용의 굴 · 잠금 ──
  // 지도 id → 서버 방문 구역 (바다 · 사막 · 설원 · 용암 네 곳을 모두 다녀오면 용의 굴이 열림)
  const AREA_OF = { beach: 'beach', desert: 'desert', snow: 'snow', lava: 'lava', plant1: 'plant', plant2: 'plant', dragon: 'dragon' };
  const visiting = new Set();
  function noteVisit(id) {
    const a = AREA_OF[id];
    if (!a || !st || st.locked || !S.online || visiting.has(a) || (st.visited || []).includes(a)) return;
    visiting.add(a);
    rpc('safari_visit', { p_area: a }, { retries: 1 }).then((r) => {
      if (!r) return;
      st = { ...st, visited: r.visited, dragon: r.dragon };
      applyDragon();
      if (r.opened) dragonOpened();
    }).catch((e) => { if (e?.message === 'SAFARI_CLOSED') refresh(); }).finally(() => visiting.delete(a));
  }
  // 열리면 사파리존 호수에 섬 + 다리 가운데 계단 (Z → 용의 굴). 열리기 전엔 없음.
  const BASE_ROWS = MAPS.safari.rows;
  let dragonOn = false;
  function applyDragon() {
    const on = !!st?.dragon;
    if (on === dragonOn) return;
    dragonOn = on;
    MAPS.safari.rows = on ? DRAGON_ISLE.rows : BASE_ROWS;
    if (on) MAPS.safari.warps[DRAGON_ISLE.at] = [...DRAGON_ISLE.warp]; else delete MAPS.safari.warps[DRAGON_ISLE.at];
    delete cache.safari;
    if (mapId === 'safari') { mapsOf('safari'); if (solidAt(P.x, P.y)) { P.x = P.fx = START.x; P.y = P.fy = START.y; } }
  }
  const seenKey = () => `sfDragonSeen:${S.snap?.profile?.student_id || ''}`;
  let sparkT = -1;                // 섬이 처음 보일 때 반짝반짝 (performance.now)
  // 네 곳째를 다녀와 방금 열림 → 멀리서 땅이 울림
  async function dragonOpened() {
    while ((busy || talkQ || menuQ) && root.isConnected) await new Promise((r) => setTimeout(r, 400));
    if (!root.isConnected) return;
    busy = true;
    try { try { sfx.fanfare(); } catch { /* */ } await talk(['어딘가 멀리서 땅이 울리는 소리가 들렸다…', '사파리존 호수에 무언가 나타난 것 같다!']); } finally { busy = false; }
  }
  // 열린 뒤 사파리존 호수 가까이에 처음 오면 (기기마다 한 번) 섬이 반짝이며 나타남
  function maybeSeeIsle() {
    if (!dragonOn || mapId !== 'safari' || busy || talkQ || menuQ) return;
    const [ix, iy] = DRAGON_ISLE.centre;
    if (Math.abs(P.x - ix) > 8 || Math.abs(P.y - iy) > 6) return;
    try { if (localStorage.getItem(seenKey())) return; localStorage.setItem(seenKey(), '1'); } catch { /* */ }
    busy = true; clearPad(); sparkT = performance.now();
    try { sfx.fanfare(); } catch { /* */ }
    talk(['호수 한가운데에 풀이 무성한 섬이 나타났다!', '다리 가운데에 아래로 내려가는 계단이 생겼다…', '용의 굴로 이어지는 것 같다! 아주 강한 포켓몬이 산다는데…'])
      .finally(() => { busy = false; });
  }
  // 닫혔거나 (운영자) 열리지 않은 용의 굴에 있으면 → 입구로 (화면이 어두워졌다 밝아짐)
  async function leaveToStart() {
    busy = true;
    try {
      await fadeTo(1, 400);
      enterMap(START.map, START.x, START.y, START.dir, false);
      await new Promise((r) => setTimeout(r, 300));
      await fadeTo(0, 400);
    } finally { busy = false; }
    if (st?.locked) say('사파리존이 닫혔어요. 지금은 학교 곳곳의 QR을 찾아보세요!', 5000);
  }
  // 0040: 끝내지 않은 만남 (앱을 닫았다 열었거나 글 상자 중에 만남) → 버튼 없이 바로 이어 잡기.
  //   같은 만남은 15초에 한 번만 (박스가 꽉 참 · 인터넷 끊김이면 catchEncounter 가 알려 주고 만남은 서버에 그대로 남음 → 풀숲을 걸으면 다시)
  const autoTried = new Map();
  function maybeResume() {
    const e = st?.pending;
    if (!e || busy || talkQ || menuQ || seq || !S.online || !active()) return;
    const now = performance.now();
    if (now - (autoTried.get(e.id) || -1e9) < 15000) return;
    autoTried.set(e.id, now);
    startCatch(e);
  }
  window.addEventListener('online', () => { if (root.isConnected) refresh(); });
  // 0040: 덮개는 사파리볼을 다 썼을 때만 (만남 상한 없음)
  let lockedHint = (() => { try { return localStorage.getItem('sfLocked') === '1'; } catch { return false; } })();   // 0048: 지난번에 닫혀 있었으면 상태를 받기 전에도 덮개
  const closed = () => (st?.pending ? null : (st ? st.locked : lockedHint) ? 'locked' : !st ? null : st.balls_left <= 0 ? 'balls' : null);
  function paintInfo() {
    ballsEl.textContent = st ? `${st.balls_left}/${st.balls_daily}` : '-';
    ballsEl.nextElementSibling?.remove(); if (st?.next_reset_at) ballsEl.after(h('small.sf-reset', `다음 충전 ${new Date(st.next_reset_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })}`));   // 0037 (branch-evo): 사파리볼 충전 시각
    encEl.textContent = !S.online ? '인터넷이 연결되면 포켓몬이 나와요' : st ? (queued ? '남겨 둔 잡기 결과를 보내는 중…' : '') : '불러오는 중…';
    const why = closed();
    cover.hidden = !why || seq;          // 볼을 다 쓴 장면 (seq) 중에는 글 상자가 보이게 가리지 않음
    if (st) lockedHint = !!st.locked;
    if (why === 'locked') {   // 0048: 운영자가 사파리존을 닫음
      cover.replaceChildren(h('b', '사파리존은 아직 닫혀 있어요'), h('span', '지금은 학교 곳곳의 QR을 찾아보세요!'));
    } else if (why) {   // 0037: 충전 주기(1~24시간)마다 다시 채워짐 → 다음 충전 시각을 알려 줌
      const at = st?.next_reset_at ? new Date(st.next_reset_at) : null;
      const hm = at ? at.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      const sameDay = at && at.toDateString() === new Date().toDateString();
      cover.replaceChildren(h('b', '사파리볼을 다 썼어요'),
        h('span', !at ? '조금 뒤에 다시 와 주세요!' : sameDay ? `${hm}에 다시 채워져요!` : `내일 ${hm}에 다시 채워져요!`));
    }
  }

  // ── 글 상자 (3세대처럼 한 글자씩 · ▼ 이면 A / 화면 눌러 다음) ──
  let talkQ = null;             // { lines, i, typing, timer, res }
  function talk(lines) {
    return new Promise((res) => {
      clearPad(); say('');
      if (talkQ) { clearInterval(talkQ.timer); talkQ.res(); }
      talkEl.hidden = false;
      talkQ = { lines: lines.filter(Boolean).flatMap(paginate), i: -1, typing: false, timer: 0, res };
      nextLine();
    });
  }
  // 0042: 3세대 글 상자처럼 한 상자에 두 줄까지 — 문장 (. ! ? … 뒤) 마다 나눠, 한 줄짜리 두 문장까지 한 상자에 (지금 상자 폭으로 잼).
  //   한 문장이 두 줄을 넘으면 띄어쓰기에서 나눠 다음 상자로 (단어 중간은 절대 안 끊음 — CSS keep-all).
  let probe = null;
  function linesOf(text) {
    if (!probe) { probe = h('div.sf-probe', { 'aria-hidden': 'true' }); talkEl.append(probe); }
    const cs = getComputedStyle(talkEl);
    probe.style.width = `${Math.max(40, talkEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))}px`;
    probe.textContent = text;
    const lh = parseFloat(getComputedStyle(probe).lineHeight) || 24;
    return Math.max(1, Math.round(probe.offsetHeight / lh));
  }
  function paginate(text) {
    if (!talkEl.clientWidth) return [String(text)];
    const sents = String(text).replace(/([.!?…]+["'」』)]*)[ \t]+/g, '$1\n').split('\n').map((x) => x.trim()).filter(Boolean);
    const parts = [];
    for (const st of sents) {
      if (linesOf(st) <= 2) { parts.push(st); continue; }
      let cur = '';
      for (const w of st.split(' ')) {
        const t = cur ? `${cur} ${w}` : w;
        if (cur && linesOf(t) > 2) { parts.push(cur); cur = w; } else cur = t;
      }
      if (cur) parts.push(cur);
    }
    const out = []; let cur = '';
    for (const st of parts) {
      const t = cur ? `${cur}\n${st}` : st;
      if (cur && linesOf(t) > 2) { out.push(cur); cur = st; } else cur = t;
    }
    if (cur) out.push(cur);
    return out.length ? out : [String(text)];
  }
  function nextLine() {
    const q = talkQ; q.i++;
    if (q.i >= q.lines.length) { talkEl.hidden = true; talkQ = null; clearPad(); q.res(); setTimeout(maybeResume, 0); return; }
    const text = q.lines[q.i];
    talkMore.style.visibility = 'hidden';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { talkTx.textContent = text; talkMore.style.visibility = ''; return; }
    let n = 0; q.typing = true; talkTx.textContent = '';
    q.timer = setInterval(() => {
      n = Math.min(text.length, n + 1); talkTx.textContent = text.slice(0, n);
      if (n >= text.length) { clearInterval(q.timer); q.typing = false; talkMore.style.visibility = ''; }
    }, 1000 / 45);
  }
  function advance() {
    const q = talkQ; if (!q) return false;
    if (q.typing) { clearInterval(q.timer); q.typing = false; talkTx.textContent = q.lines[q.i]; talkMore.style.visibility = ''; return true; }
    sfx.blip(); nextLine(); return true;
  }

  // 풀숲 · 동굴 바닥 걸음 보내기 → 만남이면 잡기
  async function send() {
    if (inflight || pend.n <= 0 || !S.online || !st || closed() || busy) return;
    const n = Math.min(pend.n, 1000), zone = pend.zone, area = pend.area || mapId; pend.n -= n; inflight = true;
    let r = null;
    try { r = await reportSteps(n, zone, area, areaDist()); } catch (e) { if (e.message === 'SAFARI_CLOSED') { inflight = false; pend.n = 0; refresh(); return; } if (!e.offline) say(errorText(e.message)); }
    inflight = false;
    if (!r) return;
    st = { ...st, ...r };
    paintInfo();
    if (r.encounter && !busy && !talkQ && !menuQ) encounter(r.encounter);   // 글 상자 중이면 글이 끝난 뒤 maybeResume 이 이어 잡음
  }
  // 만남: 야생 곡을 먼저 틀고, 곡의 첫 타격에 '!' · 2박 뒤 화면 번쩍 (음악이 꺼져 있으면 예전처럼 효과음 + 정해진 시간)
  async function encounter(e) {
    busy = true; clearPad();
    const music = bgmPush('wild');
    const q = await encounterCue('wild'); bubbleT = q.bubbleT; flashT = q.flashT; await new Promise((res) => setTimeout(res, q.doneT - performance.now()));   // '!' = 곡 시작, 번쩍 = 곡의 타격 (sfx.js encounterCue)
    flashT = -1; bubbleT = -1;
    await startCatch(e, music);
  }
  async function startCatch(e, music = null) {
    busy = true;
    const had = Number(st?.balls_left) || 0;
    try {
      const r = await catchEncounter({ ...e, kind: 'safari', flee: st?.settings?.flee });
      if (r?.safari) st = r.safari;
    } finally {
      music?.pop();
      seq = true;                         // 새로 받은 상태로 덮개가 먼저 뜨지 않게
      await refresh();
      if (had > 0 && st && st.balls_left <= 0 && !st.pending) await ballsOut();
      seq = false; busy = false; paintInfo();
      if (!closed()) say({ snow: '눈 속 풀숲을 더 걸어 볼까요?', lava: '잿빛 풀숲을 더 걸어 볼까요?', plant: '발전소 안을 더 걸어 볼까요?', dcave: '용의 굴을 더 걸어 볼까요?', cave: '동굴 안을 더 걸어 볼까요?', ultra: '빛나는 발판을 더 걸어 볼까요?', beach: '물가를 더 걸어 볼까요?', desert: '모래 풀숲을 더 걸어 볼까요?' }[M.kind] || '풀숲을 더 걸어 볼까요?', 2500);
    }
  }
  // 사파리볼을 다 씀 → 3세대처럼 두 줄 → 화면이 까매지고 사파리존 입구로
  async function ballsOut() {
    busy = true; seq = true; paintInfo();
    const name = String(S.snap?.profile?.name || '').trim() || '트레이너';
    await talk([`${josa(name, '은', '는')} 사용할 수 있는 볼이 더 이상 없다!`, `${name}의 눈이 캄캄해졌다...`]);
    await fadeTo(1, 700);
    enterMap(START.map, START.x, START.y, START.dir, false);
    await new Promise((r) => setTimeout(r, 450));
    await fadeTo(0, 600);
    seq = false; busy = false; paintInfo();
  }

  // ── 지도 이동 (화면이 어두워졌다 밝아짐) ──
  let fade = { a: 0, from: 0, to: 0, t0: 0, ms: 0, res: null, col: '0,0,0' }, spinT = -1;
  const fadeTo = (to, ms) => new Promise((res) => {
    fade.res?.();
    fade = { a: fade.a, from: fade.a, to, t0: performance.now(), ms, res, col: fade.col };
    if (!raf) { fade.a = to; fade.res = null; res(); }          // 화면이 안 그려지는 중이면 바로
  });
  function enterMap(id, x, y, dir, banner = true) {
    const wasKind = M.kind;
    mapId = id; M = MAPS[id];
    P.x = P.fx = x; P.y = P.fy = y; P.dir = dir; P.moving = false; P.from = null;
    mapsOf(id);
    savePos({ map: id, x, y, dir });
    if (banner) { showPlace(M.name); setTimeout(AREA_MSG[M.kind] && wasKind !== M.kind ? sandMsg : sayHint, 700); }   // 바깥 → 동굴 → 울트라 스페이스처럼 땅이 바뀌면 그 땅의 안내
    noteVisit(id);                                                                    // 0048: 바다 · 사막 · 설원 · 용암 · 발전소 · 용의 굴 방문 기록
  }
  async function go([id, x, y, dir, fx]) {
    busy = true; clearPad();
    if (fx === 'warp') {          // 워프홀: 주인공이 빙글빙글 돌며 보랏빛 빛 속으로
      sfx.scan(); spinT = performance.now(); fade.col = '232,216,255';
      await fadeTo(1, 900);
      enterMap(id, x, y, dir); spinT = -1;
      await new Promise((r) => setTimeout(r, 250));
      await fadeTo(0, 700);
      fade.col = '0,0,0'; busy = false; return;
    }
    sfx.blip();
    await fadeTo(1, 220);
    enterMap(id, x, y, dir);
    await fadeTo(0, 260);
    busy = false;
  }

  // ── 말 걸기 · 조사하기 ──
  // 사육사: "어떤 포켓몬에 대한 이야기를 듣고 싶니?" → 고르기 메뉴 (LEGEND_HINTS + ZONE_HINTS + 그만두기) → 설명 → 다시 메뉴
  async function talkKeeper(n) {
    n.dir = BACK[P.dir];
    busy = true;
    try {
      await talk(['나는 사파리존 사육사란다. 이 사파리존 깊은 곳에는 전설의 포켓몬이 산다는 이야기가 있지.']);
      let first = true;
      for (;;) {
        const items = [
          ...LEGEND_HINTS.map((l) => {
            const seen = seenLegend(l);
            return { kind: 'legend', l, seen, name: seen ? l.name : '???', sub: seen ? '' : l.teaser, mark: l.caught ? '✔' : legendReady(l.dex) ? '!' : '',
              icon: () => spriteCanvas(speciesIdOf(l.dex), 32, seen ? 'normal' : 'silhouette') };
          }),
          ...ZONE_HINTS.map((z) => ({ kind: 'zone', z, name: z.name, sub: '', mark: '', icon: z.zone === 'ultra' ? wormIcon : null })),
          { kind: 'dragon', name: dragonOn ? '용의 굴' : '호수의 소문', sub: dragonOn ? '' : `다녀온 곳 ${DRAGON_ISLE.need.filter(([a]) => (st?.visited || []).includes(a)).length}/4`, mark: dragonOn ? '!' : '' },
          { kind: 'quit', name: '그만두기', sub: '', mark: '' },
        ];
        const i = await choose(first ? '어떤 포켓몬에 대한 이야기를 듣고 싶니?' : '또 궁금한 게 있니?', items);
        first = false;
        const it = items[i];
        if (!it || it.kind === 'quit') { await talk(['조심해서 다녀오렴! 동굴 바닥에서도 야생 포켓몬이 나온단다.']); break; }
        if (it.kind === 'zone') { await talk([`${josa(it.z.name, "은", "는")} ${it.z.where}에 있다는구나.`, `${it.z.cond}.`, it.z.more]); continue; }
        if (it.kind === 'dragon') {        // 0048: 바다 · 사막 · 설원 · 용암을 모두 다녀오면 호수에 섬과 계단 → 용의 굴
          const v = st?.visited || [];
          const prog = DRAGON_ISLE.need.map(([a, n]) => `${n} ${v.includes(a) ? '✔' : '·'}`).join('  ');
          await talk(dragonOn
            ? ['호수 한가운데에 섬이 나타났지? 다리 가운데 계단 아래가 용의 굴이란다.', '드래곤 타입과 아주 강한 포켓몬 (삼삼드래 · 미끄래곤 · 짜랑고우거 같은) 이 산다는구나. Lv.40이 넘는대!']
            : ['바다 · 사막 · 설원 · 용암을 모두 다녀오면 호수에 무언가 나타난대…', `지금까지 다녀온 곳: ${prog}`]);
          continue;
        }
        const l = it.l, nm = it.seen ? l.name : '그 포켓몬';
        await talk([
          it.seen ? `${l.name}…` : `${l.teaser}… 아직 아무도 제대로 본 적이 없다는 포켓몬이란다.`,
          `${josa(nm, '은', '는')} ${l.where}에 있다는구나.`,
          l.caught ? '✔ 이미 잡았구나! 정말 대단해.' : legendReady(l.dex) ? '✔ 조건을 모두 채웠어! 지금이라면 만날 수 있을 거야.' : `필요한 것: ${l.cond}`,
        ]);
      }
    } finally { busy = false; }
  }
  // 도감에서 본 적이 있는지: 서버가 setLegendHints({ seen }) 로 알려 주면 그것, 아니면 내 도감 (S.snap.collection) 에 그 계열이 그 단계까지 있는지
  function seenLegend(l) {
    if (l.seen != null) return !!l.seen;
    if (l.caught) return true;
    const sp = S.catalog?.species?.find((x) => x.dex === l.dex);
    return !!(sp && (S.snap?.collection || []).some((c) => c.line_id === sp.line_id && c.stage >= sp.stage));
  }
  function wormIcon() {
    const c = document.createElement('canvas'); c.width = c.height = 32; c.className = 'sf-wi';
    const t = TI.worm0; if (sheet && t) { const gg = c.getContext('2d'); gg.imageSmoothingEnabled = false; gg.drawImage(sheet, t[0], t[1], 32, 32, 0, 0, 32, 32); }
    return c;
  }
  // ── 고르기 메뉴 (3세대 오른쪽 위 상자 · ▶ 커서 · 위아래 + A, 눌러서 고르기, B = 그만두기) ──
  let menuQ = null;           // { items, i, res, rows }
  function choose(prompt, items) {
    return new Promise((res) => {
      clearPad(); say('');
      talkEl.hidden = false; talkTx.textContent = prompt; talkMore.style.visibility = 'hidden';
      const rows = items.map((it, i) => {
        const r = h('li.sf-mi', { role: 'option', onpointerdown: (e) => { e.preventDefault(); e.stopPropagation(); if (menuQ) { menuQ.i = i; paintMenu(); pickMenu(); } } },
          h('span.sf-cur', '▶'), it.icon ? h('span.sf-ic', it.icon()) : h('span.sf-ic'),
          h('span.sf-mt', h('b', it.name), it.sub ? h('small', it.sub) : null), it.mark ? h('span.sf-mk', it.mark) : null);
        return r;
      });
      menuEl.replaceChildren(h('ul', { role: 'listbox', 'aria-label': prompt }, rows));
      menuEl.hidden = false;
      menuQ = { items, i: 0, res, rows };
      paintMenu();
    });
  }
  function paintMenu() {
    const q = menuQ; if (!q) return;
    q.rows.forEach((r, i) => { r.classList.toggle('on', i === q.i); r.setAttribute('aria-selected', String(i === q.i)); });
    q.rows[q.i]?.scrollIntoView?.({ block: 'nearest' });
  }
  function menuMove(d) {
    const q = menuQ; if (!q || (d !== 'up' && d !== 'down')) return;
    q.i = (q.i + (d === 'down' ? 1 : -1) + q.items.length) % q.items.length; sfx.blip(); paintMenu();
  }
  function closeMenu(i) {
    const q = menuQ; if (!q) return;
    menuQ = null; menuEl.hidden = true; talkEl.hidden = true; q.res(i);
  }
  menuEl.addEventListener('pointerdown', (e) => e.stopPropagation());   // 메뉴 상자 안 (줄 사이) 을 눌러도 닫히지 않게
  function pickMenu() { sfx.select(); closeMenu(menuQ.i); }
  function pressB() {                          // PC 키 (x · Esc): 메뉴 닫기 · 글 넘기기
    if (menuQ) { sfx.blip(); closeMenu(-1); return; }
    advance();
  }
  async function meetLegend(l) {
    const t = hintOf(l.dex); if (!t) return;
    busy = true;
    try {
      if (legendReady(l.dex)) {
        sfx.scan(); bang = { x: l.x, y: l.y };
        await new Promise((r) => setTimeout(r, 900));
        bang = null;
        await talk([`${josa(t.name, '이', '가')} 이쪽을 바라보고 있다!`]);
        const r = await startLegendEncounter(l.dex, { talk, map: mapId, name: t.name });
        if (r?.caught) t.caught = true;           // 잡으면 자리에서 사라짐. 놓치거나 도망치면 그대로 남음
      } else {
        await talk([`${t.name}…?`, '아직 무언가 부족한 것 같다…', `사육사의 힌트: ${t.cond}`]);
      }
    } finally { bang = null; busy = false; }
  }
  function interactAt(x, y) {
    const o = objAt(x, y);
    if (o?.type === 'npc') { talkKeeper(o.o); return true; }
    if (o?.type === 'legend') { meetLegend(o.o); return true; }
    const sg = M.signs?.[`${x},${y}`];
    if (!sg) return false;
    if (tileAt(x, y) === 'B') { busy = true; talk([sg]).then(() => { busy = false; }); return true; }
    if (lastSign !== sg) { say(sg); lastSign = sg; sfx.blip(); }
    return true;
  }
  function pressA() {
    if (menuQ) { pickMenu(); return; }
    if (advance()) return;
    if (busy || P.moving || !active()) return;
    const [dx, dy] = DIRS[P.dir];
    lastSign = '';
    interactAt(P.x + dx, P.y + dy);
  }
  // 지도에서 사람·전설 포켓몬을 누름 → 그쪽을 보고 말 걸기 (가까이 있을 때만)
  stage.addEventListener('pointerdown', (e) => {
    if (menuQ) { e.preventDefault(); sfx.blip(); closeMenu(-1); return; }   // 0040: 메뉴 바깥을 누르면 그만두기 (B 버튼 대신)
    if (talkQ) { e.preventDefault(); advance(); return; }
    if (busy || P.moving || !active() || e.target !== cv) return;
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    const tx = Math.floor(((e.clientX - r.left) * VW / r.width + camX) / TS), ty = Math.floor(((e.clientY - r.top) * VH / r.height + camY) / TS);
    let o = null;     // 사람은 머리가 윗칸, 전설 포켓몬은 큰 그림이 위로 3칸까지 → 그 위쪽을 눌러도 됨
    for (let k = 0; k <= 3 && !o; k++) { const c = objAt(tx, ty + k); if (c && (k <= 1 || c.type === 'legend')) o = c; }
    if (!o) return;
    const ox = o.o.x - P.x, oy = o.o.y - P.y;
    if (Math.abs(ox) + Math.abs(oy) > 3) { say('조금 더 가까이 가서 말을 걸어 보세요.', 1800); return; }
    P.dir = Math.abs(ox) > Math.abs(oy) ? (ox > 0 ? 'right' : 'left') : (oy > 0 ? 'down' : 'up');
    interactAt(o.o.x, o.o.y);
  });

  // ── 걷기 ──
  // 새로 누름: 메뉴면 커서 · 다른 방향이면 제자리에서 돌기만 (3세대처럼) · 같은 방향이면 걷기
  function kick(d) {
    if (menuQ) { menuMove(d); return; }
    if (P.moving || busy || talkQ) return;
    if (P.dir !== d && !closed()) { P.dir = d; P.turnT = performance.now(); return; }
    tryMove(d, performance.now());
  }
  // 한 칸 걷기 시작 → true. quiet = 막혀도 조사하지 않음 (조이스틱 대각선의 첫 후보)
  function tryMove(d, now, quiet = false) {
    if (busy || talkQ) return false;
    if (closed()) { P.dir = d; return false; }
    P.dir = d;
    const [dx, dy] = DIRS[d]; const nx = P.x + dx, ny = P.y + dy;
    if (solidAt(nx, ny)) {
      const t = tileAt(nx, ny);
      if (!quiet && (t === 'S' || t === 'B' || objAt(nx, ny))) interactAt(nx, ny);    // 표지판 · 점자 · 사람 · 전설 = 부딪치면 조사
      return false;
    }
    lastSign = '';
    P.from = { x: P.x, y: P.y }; P.x = nx; P.y = ny; P.moving = true; P.t0 = now; P.stepN++; P.slide = false;
    if (GRASS[M.kind] && tileAt(nx, ny) === ',') rustle = { x: nx, y: ny, t0: now };   // 풀숲에 들어서면 잎이 흔들림
    return true;
  }
  // 후보 방향을 차례로 (대각선: 한쪽이 막히면 다른 쪽) — 걸었으면 그 축을 기억해 다음엔 다른 축
  function stepDirs(now) {
    const ds = wantDirs();
    for (let i = 0; i < ds.length; i++) {
      if (tryMove(ds[i], now, i < ds.length - 1)) { joy.lastAxis = ds[i] === 'left' || ds[i] === 'right' ? 'x' : 'y'; return true; }
      if (busy || talkQ) return false;
    }
    return false;
  }
  function arrive() {
    P.moving = false; P.fx = P.x; P.fy = P.y;
    savePos({ map: mapId, x: P.x, y: P.y, dir: P.dir });
    const w = M.warps[`${P.x},${P.y}`];
    if (w) { P.slide = false; go(w); return; }
    if (M.kind === 'snow' && tileAt(P.x, P.y) === 'I') {    // 0048: 얼어붙은 연못 — 막힐 때까지 같은 쪽으로 미끄러짐 (서 있는 모습, 만남 칸 아님)
      const [dx, dy] = DIRS[P.dir];
      if (!solidAt(P.x + dx, P.y + dy)) { P.from = { x: P.x, y: P.y }; P.x += dx; P.y += dy; P.moving = true; P.t0 = performance.now(); P.slide = true; return; }
    }
    P.slide = false;
    maybeSeeIsle();
    const z = zoneAt(P.x, P.y);
    if (z && st && !closed() && !sprayOn()) {             // 0040: 스프레이 중에는 만남 걸음을 보내지 않음
      if ((pend.zone !== z || pend.area !== mapId) && pend.n > 0) send();          // 다른 구역 · 지도 걸음은 섞지 않고 먼저 보냄
      if (!inflight || pend.n === 0) { pend.zone = z; pend.area = mapId; }
      pend.n++; if (pend.n >= SEND_EVERY) send();
    }
  }

  // ── 그리기 ──
  let VW = 160, VH = 128, raf = 0, camX = 0, camY = 0, fitW = 0, fitDpr = 0;
  const fit = () => {
    if (!root.isConnected) return;
    let w = Math.min(560, stage.clientWidth || root.clientWidth || 320);
    // 세로 스크롤바가 생겼다 없어졌다 하며 폭이 몇 px 씩 오가면 (PC 작은 창) 캔버스가 계속 다시 만들어져 깜빡임 → 20px 안쪽 변화는 무시
    if (fitW && Math.abs(w - fitW) <= 20 && fitDpr === (window.devicePixelRatio || 1)) w = fitW; else { fitW = w; fitDpr = window.devicePixelRatio || 1; }
    const dpr = window.devicePixelRatio || 1; const dev = Math.floor(w * dpr);
    const kd = Math.max(1, Math.round(dev / 176));       // 화면에 나무 11칸쯤
    VW = Math.floor(dev / kd);
    // 높이: 방향 버튼·아래 메뉴까지 한 화면에 들어가게 (너무 작으면 7칸, 많아야 폭의 0.85)
    const nav = document.querySelector('nav.tabs')?.offsetHeight || 0;
    const top = stage.getBoundingClientRect().top + window.scrollY;
    const avail = window.innerHeight - top - (ctl.offsetHeight || 160) - nav - 24;
    VH = Math.max(7 * TS, Math.min(Math.round(VW * 0.85), Math.floor((avail * dpr) / kd)));
    if (cv.width !== VW || cv.height !== VH) { cv.width = VW; cv.height = VH; }
    cv.style.width = `${(VW * kd) / dpr}px`; cv.style.height = `${(VH * kd) / dpr}px`;
    g.imageSmoothingEnabled = false;
  };
  const ro = new ResizeObserver(fit); ro.observe(stage);
  window.addEventListener('resize', fit);
  function frame(now) {
    if (!root.isConnected) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    if (fade.res) {
      const k = fade.ms ? Math.min(1, Math.max(0, (now - fade.t0) / fade.ms)) : 1;
      fade.a = fade.from + (fade.to - fade.from) * k;
      if (k >= 1) { fade.a = fade.to; const r = fade.res; fade.res = null; r(); }
    }
    if (document.hidden) return;
    // 움직임
    if (P.moving) {
      const k = Math.min(1, (now - P.t0) / STEP_MS);
      P.fx = P.from.x + (P.x - P.from.x) * k; P.fy = P.from.y + (P.y - P.from.y) * k;
      if (k >= 1) { arrive(); if (active() && !P.moving) stepDirs(now); }
    } else if (!busy && !talkQ && !menuQ && active()) {
      const ds = wantDirs();
      if (ds.length && joy.id == null && ds[0] !== P.dir && !closed()) { P.dir = ds[0]; P.turnT = now; }   // 키보드: 누른 방향으로 돌고
      else if (ds.length && (joy.id != null || now - (P.turnT || 0) >= TURN_MS)) stepDirs(now);           // 잠깐 뒤 걷기 시작 (조이스틱은 바로)
    }
    draw(now);
  }
  const shadow = (cx, by, w) => { g.fillStyle = { snow: 'rgba(80,84,140,.25)', lava: 'rgba(90,20,10,.3)', plant: 'rgba(40,50,40,.3)', dcave: 'rgba(10,10,30,.35)', desert: 'rgba(130,80,30,.3)', beach: 'rgba(120,90,40,.28)', cave: 'rgba(30,16,8,.3)', ultra: 'rgba(8,0,24,.4)', shrine: 'rgba(90,70,30,.3)' }[M.kind] || 'rgba(20,60,40,.25)'; g.fillRect(cx - w / 2, by - 2, w, 2); g.fillRect(cx - w / 2 + 1, by - 1, w - 2, 1); };
  const drawBang = (bx, by) => {
    g.fillStyle = '#283040'; g.fillRect(bx - 1, by - 1, 8, 11);
    g.fillStyle = '#ffffff'; g.fillRect(bx, by, 6, 9);
    g.fillStyle = '#e83838'; g.fillRect(bx + 2, by + 1, 2, 5); g.fillRect(bx + 2, by + 7, 2, 1);
  };
  function draw(now) {
    const af = Math.floor(now / 520) % 2;
    const mw = MW() * TS, mh = MH() * TS;
    const px = Math.round(P.fx * TS + TS / 2), py = Math.round(P.fy * TS + TS / 2);
    camX = mw <= VW ? -Math.floor((VW - mw) / 2) : Math.max(0, Math.min(mw - VW, px - Math.floor(VW / 2)));
    camY = mh <= VH ? -Math.floor((VH - mh) / 2) : Math.max(0, Math.min(mh - VH, py - Math.floor(VH / 2)));
    const maps = mapsOf(mapId);
    if (!maps || !hero) { g.fillStyle = { snow: '#eceef8', lava: '#d8968a', plant: '#101014', dcave: '#1c1e2c', desert: '#e8c070', beach: '#3c84d0', cave: '#2c2018', ultra: '#120a24', shrine: '#583838' }[M.kind] || '#8cd6b8'; g.fillRect(0, 0, VW, VH); return; }
    const map = maps[af];
    if (mw < VW || mh < VH) { g.fillStyle = { snow: '#24402c', lava: '#40100c', plant: '#101014', dcave: '#202438', desert: '#64301a', beach: '#3c84d0', cave: '#140c08', ultra: '#120a24', shrine: '#583838' }[M.kind] || '#1c5420'; g.fillRect(0, 0, VW, VH); }
    const sx = Math.max(0, camX), sy = Math.max(0, camY);
    const cw = Math.min(mw - sx, VW - (sx - camX)), ch = Math.min(mh - sy, VH - (sy - camY));
    g.drawImage(map, sx, sy, cw, ch, sx - camX, sy - camY, cw, ch);
    // 풀숲 칸 그리기 (흔들리는 중이면 흔들린 잎, 아니면 미리 그린 맵) — sy0 줄부터 아래만
    const RUSTLE_MS = 270;
    const grass = (gx, gy, sy0) => {
      const X = gx * TS - camX, Y = gy * TS - camY;
      if (rustle && rustle.x === gx && rustle.y === gy && now - rustle.t0 < RUSTLE_MS) {
        const ph = Math.max(0, Math.floor((now - rustle.t0) / (RUSTLE_MS / 2))) % 2, gk = GRASS[M.kind] || GRASS.out;   // ≥ 0: rAF 시각이 걸음 시작 (performance.now) 보다 조금 이를 수 있음
        const t = TI[`${gk[1]}${ph}`], gr = TI[gk[2]];
        g.drawImage(sheet, gr[0], gr[1] + sy0, TS, TS - sy0, X, Y + sy0, TS, TS - sy0);
        g.drawImage(sheet, t[0], t[1] + sy0, TS, TS - sy0, X, Y + sy0, TS, TS - sy0);
      } else g.drawImage(map, gx * TS, gy * TS + sy0, TS, TS - sy0, X, Y + sy0, TS, TS - sy0);
    };
    if (rustle && now - rustle.t0 < RUSTLE_MS) grass(rustle.x, rustle.y, 0);
    // 그릴 것 (아래쪽에 있는 것이 앞): 주인공 · 사람 · 전설 포켓몬
    const list = [];
    list.push([P.fy, () => {
      const hx = Math.round(P.fx * TS) - camX, hy = Math.round(P.fy * TS) - camY + TS - HH;
      const k = P.moving ? (now - P.t0) / STEP_MS : 0;
      const fi = P.moving && !P.slide && k > 0.15 && k < 0.85 ? (P.stepN % 2 ? 1 : 2) : 0;
      shadow(hx + 8, hy + HH, 10);
      const dir = spinT > 0 ? ['down', 'left', 'up', 'right'][Math.floor((now - spinT) / 90) % 4] : P.dir;
      g.drawImage(hero, fi * HW, DIR_ROW[dir] * HH, HW, HH, hx, hy, HW, HH);
      // 풀숲 안이면 다리를 풀잎이 가림 (미리 그린 맵의 그 칸 아랫부분을 다시 덮음)
      const gx = Math.round(P.fx), gy = Math.round(P.fy);
      if (GRASS[M.kind] && tileAt(gx, gy) === ',') grass(gx, gy, 9);      // 3세대처럼 허리 아래 (다리 · 재킷 아랫단 7px) 를 앞쪽 풀잎이 가림
      else if (M.kind === 'beach' && tileAt(gx, gy) === 'w' && !P.moving) grass(gx, gy, 12);        // 얕은 물: 발목까지 물에 잠김
      if (bubbleT > 0 && now >= bubbleT) drawBang(hx + 5, hy - 8);
    }]);
    const wt = Math.floor(now / 110) % 4;      // 울트라 워프홀: 32×32 소용돌이 4장
    for (const [qx, qy] of wormsOf(M)) {
      const t = TI[`worm${wt}`]; if (!t) break;
      list.push([qy - 0.5, () => g.drawImage(sheet, t[0], t[1], 32, 32, qx * TS + 8 - 16 - camX, qy * TS + 8 - 16 - camY, 32, 32)]);
    }
    for (const n of M.npcs || []) {
      if (!keeper) continue;
      list.push([n.y, () => {
        const nx = n.x * TS - camX, ny = n.y * TS - camY + TS - HH;
        shadow(nx + 8, ny + HH, 10);
        g.drawImage(keeper, 0, DIR_ROW[n.dir] * HH, HW, HH, nx, ny, HW, HH);
      }]);
    }
    for (const l of M.legends || []) {
      if (hintOf(l.dex)?.caught) continue;
      const art = legendArt(l.dex);       // 지도 도트 크기 그림 (32 · 40 · 48px). 그림판을 받는 중이면 null → 다음 프레임에
      if (!art) continue;
      const T = art.width;
      list.push([l.y, () => {
        const bob = Math.round(Math.sin(now / 420 + l.x) * 1.4);       // 위아래로 둥실 (정수 px)
        const lx = l.x * TS + TS / 2 - T / 2 - camX, ly = (l.y + 1) * TS - T - camY - 2 + bob;
        shadow(l.x * TS + 8 - camX, (l.y + 1) * TS - camY - 1, Math.round(T * 0.5));
        g.drawImage(art, lx, ly);
        if (bang && bang.x === l.x && bang.y === l.y) drawBang(l.x * TS + 5 - camX, ly - 10);
      }]);
    }
    list.sort((a, b) => a[0] - b[0]).forEach((e) => e[1]());
    if (maps[2]) g.drawImage(maps[2], sx, sy, cw, ch, sx - camX, sy - camY, cw, ch);     // 0048: 나무 · 건물의 솟은 윗부분이 사람 위로 (나무 뒤로 걸어가 보임)
    if (sparkT > 0) isleSparkle(now);
    if (M.kind === 'desert') sandstorm(now);
    else if (M.kind === 'snow') snowfall(now);
    else if (M.kind === 'lava') embers(now);
    else if (M.kind === 'plant') flicker(now);
    // 만남: 화면 번쩍
    if (flashT > 0 && now > flashT) {
      const ph = Math.floor((now - flashT) / 110);
      if (ph < 6 && ph % 2 === 0) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 0, VW, VH); }
      else if (ph >= 6) { g.fillStyle = '#182030'; g.fillRect(0, 0, VW, VH); }
    }
    if (fade.a > 0) { g.fillStyle = `rgba(${fade.col},${fade.a.toFixed(3)})`; g.fillRect(0, 0, VW, VH); }
  }
  // ── 0043 모래바람 (사막 지도 위): 모래빛 + 바람에 날리는 알갱이 · 줄무늬 (화면 픽셀 기준, 최대 SAND_N 개) + 가끔 세지는 돌풍 ──
  //   캔버스는 저해상도 (폭 ≈ 176px) 라 알갱이 90개도 가벼움. 카메라가 움직이면 0.6배만 따라가 깊이감.
  //   움직임 줄이기 설정 = 움직이지 않는 옅은 모래빛 + 흩뿌린 점만
  const SAND_N = 90;
  const sand = { x: new Float32Array(SAND_N), y: new Float32Array(SAND_N), v: new Float32Array(SAND_N), l: new Uint8Array(SAND_N), c: new Uint8Array(SAND_N), t: 0 };
  for (let i = 0; i < SAND_N; i++) { sand.x[i] = Math.random() * 512; sand.y[i] = Math.random() * 512; sand.v[i] = 0.6 + Math.random() * 0.8; sand.l[i] = 2 + ((Math.random() * 7) | 0); sand.c[i] = (Math.random() * 3) | 0; }
  const SAND_COL = ['rgba(255,240,200,.85)', 'rgba(244,206,134,.8)', 'rgba(200,146,74,.65)'];
  const rmq = matchMedia('(prefers-reduced-motion: reduce)');
  function sandstorm(now) {
    const dt = Math.min(0.1, sand.t ? (now - sand.t) / 1000 : 0); sand.t = now;
    const still = rmq.matches;
    const gust = still ? 0 : (Math.sin(now / 1700) + Math.sin(now / 610 + 1)) * 0.5;      // -1 … 1
    g.fillStyle = `rgba(224,170,92,${(0.18 + Math.max(0, gust) * 0.1).toFixed(3)})`; g.fillRect(0, 0, VW, VH);
    const n = Math.min(SAND_N, Math.round((VW * VH) / (still ? 900 : 300)));
    const pw = VW + 32, ph = VH + 16, ox = camX * 0.6, oy = camY * 0.6;
    for (let k = 0; k < 3; k++) {
      g.fillStyle = SAND_COL[k];
      for (let i = 0; i < n; i++) {
        if (sand.c[i] !== k) continue;
        if (!still) { sand.x[i] -= (150 + gust * 60) * sand.v[i] * dt; sand.y[i] += (26 + gust * 12) * sand.v[i] * dt; }
        const x = ((((sand.x[i] - ox) % pw) + pw) % pw) - 16, y = ((((sand.y[i] - oy) % ph) + ph) % ph) - 8;
        g.fillRect(Math.round(x), Math.round(y), still ? 1 : sand.l[i] + (gust > 0.4 ? 2 : 0), 1);
      }
    }
    if (!still) {                       // 돌풍 줄: 옅은 가로 띠 2개가 오른쪽에서 왼쪽으로 지나감
      for (let j = 0; j < 2; j++) {
        const yy = ((now / (j ? 23 : 31)) + j * 57) % (VH + 40) - 20, xx = VW - ((now / (j ? 4 : 5.5)) % (VW * 2.2));
        g.fillStyle = `rgba(255,228,170,${(0.14 + Math.max(0, gust) * 0.14).toFixed(3)})`;
        g.fillRect(Math.round(xx), Math.round(yy), Math.round(VW * 0.9), 3);
        g.fillRect(Math.round(xx + 14), Math.round(yy + 3), Math.round(VW * 0.6), 2);
      }
    }
  }
  // ── 0048 설원 눈보라: 흰 눈송이가 좌우로 흔들리며 내림 (최대 FLAKE_N 개, 화면 픽셀 기준) · 움직임 줄이기 = 멈춘 눈송이 몇 개 + 옅은 흰빛 ──
  const FLAKE_N = 70;
  const fl = { x: new Float32Array(FLAKE_N), y: new Float32Array(FLAKE_N), v: new Float32Array(FLAKE_N), s: new Uint8Array(FLAKE_N), t: 0 };
  for (let i = 0; i < FLAKE_N; i++) { fl.x[i] = Math.random() * 512; fl.y[i] = Math.random() * 512; fl.v[i] = 0.5 + Math.random(); fl.s[i] = Math.random() < 0.3 ? 2 : 1; }
  function snowfall(now) {
    const dt = Math.min(0.1, fl.t ? (now - fl.t) / 1000 : 0); fl.t = now;
    const still = rmq.matches;
    g.fillStyle = 'rgba(236,240,255,.12)'; g.fillRect(0, 0, VW, VH);
    const n = Math.min(FLAKE_N, Math.round((VW * VH) / (still ? 1200 : 380)));
    const pw = VW + 16, ph = VH + 16, ox = camX * 0.5, oy = camY * 0.5;
    for (let i = 0; i < n; i++) {
      if (!still) { fl.y[i] += 28 * fl.v[i] * dt; fl.x[i] += Math.sin(now / 700 + i) * 10 * dt - 6 * dt; }
      const x = ((((fl.x[i] - ox) % pw) + pw) % pw) - 8, y = ((((fl.y[i] - oy) % ph) + ph) % ph) - 8;
      g.fillStyle = fl.s[i] === 2 ? 'rgba(255,255,255,.95)' : 'rgba(244,246,255,.8)';
      g.fillRect(Math.round(x), Math.round(y), fl.s[i], fl.s[i]);
    }
  }
  // ── 0048 용암 지대: 붉은 열기 빛 (천천히 일렁임) + 아래에서 올라오는 불티 (최대 EMBER_N 개) · 움직임 줄이기 = 멈춘 붉은빛 + 불티 몇 개 ──
  const EMBER_N = 40;
  const em = { x: new Float32Array(EMBER_N), y: new Float32Array(EMBER_N), v: new Float32Array(EMBER_N), t: 0 };
  for (let i = 0; i < EMBER_N; i++) { em.x[i] = Math.random() * 512; em.y[i] = Math.random() * 512; em.v[i] = 0.5 + Math.random(); }
  function embers(now) {
    const dt = Math.min(0.1, em.t ? (now - em.t) / 1000 : 0); em.t = now;
    const still = rmq.matches;
    const pulse = still ? 0 : (Math.sin(now / 900) + 1) * 0.5;
    g.fillStyle = `rgba(255,96,40,${(0.07 + pulse * 0.05).toFixed(3)})`; g.fillRect(0, 0, VW, VH);
    if (!still) {                       // 아지랑이: 옅은 밝은 가로 띠가 위로 천천히
      for (let j = 0; j < 3; j++) {
        const yy = VH - ((now / (40 + j * 13) + j * 47) % (VH + 20)) + 10;
        g.fillStyle = 'rgba(255,200,150,.06)'; g.fillRect(0, Math.round(yy), VW, 2);
      }
    }
    const n = Math.min(EMBER_N, Math.round((VW * VH) / (still ? 2400 : 700)));
    const pw = VW + 8, ph = VH + 8, ox = camX * 0.4, oy = camY * 0.4;
    for (let i = 0; i < n; i++) {
      if (!still) { em.y[i] -= 22 * em.v[i] * dt; em.x[i] += Math.sin(now / 500 + i * 1.7) * 8 * dt; }
      const x = ((((em.x[i] - ox) % pw) + pw) % pw) - 4, y = ((((em.y[i] - oy) % ph) + ph) % ph) - 4;
      const on = still || ((now / 120 + i) | 0) % 5 !== 0;
      if (!on) continue;
      g.fillStyle = i % 3 ? 'rgba(255,170,60,.9)' : 'rgba(255,236,120,.95)';
      g.fillRect(Math.round(x), Math.round(y), 1, i % 4 ? 1 : 2);
    }
  }
  // ── 0048 발전소: 형광등이 가끔 깜빡임 (잠깐 어두워짐) · 움직임 줄이기 = 늘 같은 옅은 그늘 ──
  function flicker(now) {
    let a = 0.06;
    if (!rmq.matches) {
      const k = Math.floor(now / 90), r = Math.sin(k * 12.9898) * 43758.5453, rr = r - Math.floor(r);
      if (rr > 0.94) a = 0.3; else if (rr > 0.88) a = 0.16;
    }
    g.fillStyle = `rgba(8,12,20,${a})`; g.fillRect(0, 0, VW, VH);
  }
  // ── 0048 용의 굴이 처음 보일 때: 섬 둘레에 반짝이 (2.6초) ──
  function isleSparkle(now) {
    const t = now - sparkT; if (t > 2600) { sparkT = -1; return; }
    const [ix, iy] = DRAGON_ISLE.centre;
    for (let i = 0; i < 14; i++) {
      const a = i * 0.45 + t / 400, r = 18 + ((i * 7) % 20);
      const x = ix * TS + 8 + Math.cos(a) * r * 1.6 - camX, y = iy * TS + 8 + Math.sin(a) * r - camY;
      if (((t / 100 + i) | 0) % 3 === 0) continue;
      g.fillStyle = i % 2 ? '#fff8c0' : '#ffffff';
      g.fillRect(Math.round(x) - 1, Math.round(y), 3, 1); g.fillRect(Math.round(x), Math.round(y) - 1, 1, 3);
    }
  }
  // 새로 고침 · 앱을 다시 열면 걷던 지도 · 자리에서 이어서 (그 칸을 걸을 수 있을 때만)
  loadPos().then((pp) => {
    const m = pp && MAPS[pp.map];
    if (!m || P.moving || busy || P.stepN || mapId !== START.map || P.x !== START.x || P.y !== START.y) return;   // 이미 다른 곳으로 옮겼으면 그대로
    const c = m.rows[pp.y]?.[pp.x];
    if (c == null || SOLID[m.kind].has(c) || m.warps[`${pp.x},${pp.y}`]) return;
    if (pp.map === 'dragon' && !dragonOn && !(st && st.dragon)) return;     // 0048: 용의 굴은 열린 뒤에만 (상태가 오면 refresh 가 다시 확인)
    enterMap(pp.map, pp.x, pp.y, DIRS[pp.dir] ? pp.dir : 'down', pp.map !== START.map);
  }).catch(() => {});
  const start = () => { requestAnimationFrame(() => { fit(); if (!raf && root.isConnected) raf = requestAnimationFrame(frame); }); };
  // 시험용
  window.__safari = {
    P, maps: () => mapsOf(mapId), state: () => st, tile: tileAt, map: () => M.rows, busy: () => busy, view: () => ({ VW, VH }),
    move: (d) => { if (!P.moving && !busy && !talkQ && !menuQ) { P.dir = d; tryMove(d, performance.now()); } },   // 시험: 돌면서 바로 걷기
    tap: (d) => kick(d), b: () => pressB(), menu: () => (menuQ ? { i: menuQ.i, n: menuQ.items.length } : null),
    joy: () => ({ ...joy, dirs: joy.id != null ? joyDirs() : [] }), spray: () => ({ on: sprayOn(), left: Math.max(0, sprayUntil - Date.now()), text: sprayTime.textContent }),
    useSpray: () => useSpray(), stepMs: STEP_MS, area: () => ({ map: mapId, dist: areaDist(), zone: zoneAt(P.x, P.y) }),
    mapId: () => mapId, goto: (id, x, y, dir = 'down') => enterMap(id, x, y, dir), a: () => pressA(), talking: () => !!talkQ,
    zone: () => zoneAt(P.x, P.y), pend: () => ({ ...pend }), sandMsg: () => sandMsg(), dragon: () => dragonOn, closed: () => closed(), ballsOut: () => ballsOut(), setState: (s) => { st = { ...st, ...s }; applyDragon(); paintInfo(); }, fade: () => fade.a,
  };
  return { root, start, refresh };
}

export const safariMapForTest = { MAPS, SOLID, ENC };
