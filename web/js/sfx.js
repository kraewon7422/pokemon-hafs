// 소리: 8비트 효과음 (Web Audio 로 만듦, 파일 없음) + 배경 음악 (web/audio/ 파일 2개). Respects the iOS silent switch.
// 설정 두 개 (이 폰에 기억): 효과음 localStorage 'sfx' · 배경 음악 'bgm' ('1' 켜짐 / '0' 꺼짐). 예전 'mute'='1' 이면 둘 다 꺼짐으로 시작.
let ctx = null;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 이번엔 적용 */ } };
const oldMute = lsGet('mute') === '1';
let sfxOn = lsGet('sfx') != null ? lsGet('sfx') === '1' : !oldMute;
let bgmOn = lsGet('bgm') != null ? lsGet('bgm') === '1' : !oldMute;

// iPhone Safari: 소리는 손가락을 뗄 때(touchend/click) 만 켤 수 있고, 전화·화면 잠금 뒤에는 'interrupted' 로 멈춤 → 매번 다시 깨움.
// 처음 만들 때 아주 짧은 빈 소리를 한 번 틀어야 옛 iOS 에서도 열림
export function unlockAudio() {
  if (ctx) {
    if (ctx.state !== 'running' && !document.hidden) ctx.resume?.().then(kick, () => {});
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    const src = ctx.createBufferSource(); src.buffer = ctx.createBuffer(1, 1, 22050); src.connect(ctx.destination); src.start(0);
    ctx.onstatechange = () => { if (ctx.state === 'running') kick(); };
    if (ctx.state !== 'running') ctx.resume?.().catch?.(() => {});
    kick();
  } catch { ctx = null; }
}
export const isSfxOn = () => sfxOn;
export function setSfxOn(v) { sfxOn = !!v; lsSet('sfx', sfxOn ? '1' : '0'); }
export const isBgmOn = () => bgmOn;
export function setBgmOn(v) { bgmOn = !!v; lsSet('bgm', bgmOn ? '1' : '0'); if (bgmOn) unlockAudio(); kick(); }

const N = (n) => 440 * 2 ** ((n - 69) / 12);  // midi → Hz

// notes: [[midi|null, beats], ...]
function play(notes, { bpm = 600, type = 'square', vol = 0.08 } = {}) {
  if (!sfxOn || !ctx) return;
  let t = ctx.currentTime + 0.02;
  const beat = 60 / bpm;
  for (const [n, len] of notes) {
    const d = len * beat;
    if (n != null) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = N(n);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + d * 0.95);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + d);
    }
    t += d;
  }
}

export const sfx = {
  blip:    () => play([[84, 0.5]], { vol: 0.05 }),
  select:  () => play([[76, 0.5], [88, 0.7]], { vol: 0.06 }),
  scan:    () => play([[72, 0.6], [79, 0.6], [84, 1.2]]),
  error:   () => play([[52, 1], [47, 2]], { type: 'triangle', vol: 0.12 }),
  catch:   () => play([[72, 1], [72, 1], [72, 1], [77, 3], [null, 1], [76, 1], [77, 1], [79, 1], [84, 5]], { bpm: 720 }),
  correct: () => play([[79, 1], [84, 1], [88, 2]], { bpm: 660 }),
  wrong:   () => play([[60, 1.5], [55, 3]], { type: 'triangle', vol: 0.12 }),
  evoTick: () => play([[96, 0.3]], { vol: 0.03 }),
  evolve:  () => play([[67, 1], [71, 1], [74, 1], [79, 1], [74, 1], [79, 1], [83, 4], [null, 1], [79, 1], [84, 6]], { bpm: 640 }),
  fanfare: () => { play([[67, 1], [72, 1], [76, 1], [79, 2], [null, 0.5], [76, 1], [79, 1], [84, 5]], { bpm: 600 }); play([[55, 3], [60, 3], [64, 1.5], [67, 5]], { bpm: 600, type: 'triangle', vol: 0.07 }); },   // 0038 전설 알림 (짧은 축하 곡, 효과음 스위치를 따름)
  fail:    () => play([[64, 2], [62, 2], [60, 4]], { type: 'triangle', vol: 0.1, bpm: 480 }),
  // 배틀
  ballThrow: () => play([[91, 0.4], [86, 0.4], [81, 0.4], [76, 0.4], [71, 0.6]], { bpm: 1400, vol: 0.05 }),
  ballPop:   () => play([[72, 0.5], [84, 0.5], [96, 1]], { bpm: 1200, vol: 0.07 }),
  hit:       () => play([[45, 0.6], [40, 0.8]], { type: 'sawtooth', bpm: 900, vol: 0.09 }),
  statUp:    () => play([[72, 1], [76, 1], [79, 1], [84, 1], [88, 1], [91, 2]], { bpm: 1300, vol: 0.06 }),
  statDown:  () => play([[91, 1], [88, 1], [84, 1], [79, 1], [76, 1], [72, 2]], { bpm: 1300, type: 'triangle', vol: 0.09 }),
  faint:     () => play([[67, 1], [63, 1], [58, 1], [53, 3]], { bpm: 720, type: 'triangle', vol: 0.1 }),
};

// ───────── 배경 음악 (파일 2개, 반복) ─────────
// 소리 크기 (headless Chrome 에서 WebAudio 로 잰 값, 2026-11-05): battle.mp3 RMS -15.4 dBFS · peak 0.0 dBFS,
//   main.m4a RMS -51.2 dBFS · peak -35.6 dBFS, wild.m4a RMS -48.4 dBFS · peak -33.6 dBFS (폰 녹음이라 아주 작음). gain = 둘 다 RMS -18 dBFS 로 맞추는 배수,
//   그 위에 BUS -6 dB → 실제 약 -24 dBFS (효과음 사각파 ≈ -22 dBFS 보다 조금 작게), peak 은 -8.5 · -8.5 · -9.2 dBFS (안 찢어짐).
// 반복: [loopStart, loopEnd] 구간을 xf 초 겹쳐 이어 붙임. battle 은 181초부터 페이드아웃이라 그 전에서, 84.15초 주기
//   (박자가 맞는 자리) 로 149.15 → 65.0 으로 돌아감. main 은 녹음 앞뒤의 빈 소리를 빼고 1.5초 겹침.
// wild (야생 만남): 앞 1.40초는 빈 소리 → 1.40초부터 시작. 빠른 도입 뒤 첫 큰 타격 = 2.74초 (onset 분석), 박 = 0.325초
//   (1.44·1.76·2.09·2.41·2.74·3.07… 에 onset). '!' · 화면 번쩍 · 포켓몬 등장은 bgmBeat() 로 이 박에 맞춤.
//   파일을 바꾸면 이름도 바꿔서 (예: battle2.mp3) 폰에 남은 옛 파일을 쓰지 않게 — sw.js 의 AUDIO 캐시는 이름으로 찾음
const TRACKS = {
  main: { url: new URL('../audio/main.m4a', import.meta.url).href, gain: 45.45, loopStart: 0.9, loopEnd: 90.0, xf: 1.5 },
  battle: { url: new URL('../audio/battle.mp3', import.meta.url).href, gain: 0.744, loopStart: 65.0, loopEnd: 149.15, xf: 0.35 },
  wild: { url: new URL('../audio/wild.m4a', import.meta.url).href, gain: 32.9, startAt: 1.40, loopStart: 2.74, loopEnd: 88.0, xf: 1.0, hit: 2.74, beat: 0.325 },
};
const BUS = 0.5;           // -6 dB
const FADE = 0.6;          // 곡을 바꿀 때 겹치는 시간 (초)
const DECODE_RATE = 32000; // 풀어 둔 소리는 메모리를 많이 씀 (189초 · 48kHz · 스테레오 ≈ 73MB) → 32kHz 로 (≈ 48MB), 안 쓰는 곡은 버림

let base = null;           // 앱이 정한 기본 곡 (학생 앱 = 'main'. 부스·운영자 화면은 정하지 않음 → 음악 없음)
const stack = [];          // 배틀·잡기 장면이 잠깐 바꾼 곡 (맨 위가 이김, name undefined = 아래 것 그대로)
let bus = null;
let voice = null;          // 지금 나오는 곡 { name, g, srcs:Set, timer, stopped }
let gen = 0;               // 곡 바꾸기 순서 (늦게 풀린 곡이 새 요청을 덮지 않게)
let kickTimer = 0;
const bytes = {};          // name → Promise<ArrayBuffer> (압축된 파일, 작음)
const decoded = {};        // name → Promise<AudioBuffer>

const wanted = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name !== undefined) return stack[i].name; return base; };
export function bgmScene(name) { base = name; kick(); }
// 잠깐 다른 곡 (배틀·잡기 장면): 돌려준 것의 set(name) 으로 바꾸고 (null = 조용히, undefined = 원래 곡), pop() 으로 끝
export function bgmPush(name) {
  const e = { name };
  stack.push(e); kick();
  return {
    set(n) { if (e.name !== n) { e.name = n; kick(); } },
    pop() { const i = stack.indexOf(e); if (i >= 0) { stack.splice(i, 1); kick(); } },
  };
}

// 여러 번 불려도 한 번만 (배틀 '다시 하기' 처럼 닫고 바로 여는 경우 음악이 왔다 갔다 하지 않게)
function kick() {
  clearTimeout(kickTimer);
  kickTimer = setTimeout(applyBgm, 60);
}

function fetchBytes(name) {
  bytes[name] ||= fetch(TRACKS[name].url).then((r) => { if (!r.ok) throw new Error(`audio ${r.status}`); return r.arrayBuffer(); })
    .catch((e) => { delete bytes[name]; throw e; });
  return bytes[name];
}
// decodeAudioData 는 받은 ArrayBuffer 를 써 버림 → 복사본으로. 옛 Safari 는 콜백 방식만 됨
function decodeWith(c, ab) {
  return new Promise((res, rej) => {
    let done = false;
    const ok = (b) => { if (!done) { done = true; res(b); } };
    const no = (e) => { if (!done) { done = true; rej(e || new Error('decode')); } };
    try { const p = c.decodeAudioData(ab, ok, no); if (p?.then) p.then(ok, no); } catch (e) { no(e); }
  });
}
function decode(name) {
  decoded[name] ||= fetchBytes(name).then(async (ab) => {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (OAC) { try { return await decodeWith(new OAC(2, 1, DECODE_RATE), ab.slice(0)); } catch { /* 아래에서 기기 속도로 */ } }
    return decodeWith(ctx, ab.slice(0));
  }).catch((e) => { delete decoded[name]; throw e; });
  return decoded[name];
}

function fadeTo(g, v, dur) {
  const t = ctx.currentTime;
  try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(v, t + dur); } catch { g.gain.value = v; }
}

// 곡 하나를 [loopStart, loopEnd] 로 끝없이: 구간 하나 = BufferSource 하나, 끝나기 xf 초 전에 다음 구간이 겹쳐 시작
function startVoice(name, buf) {
  const tr = TRACKS[name];
  const end = Math.min(tr.loopEnd, buf.duration - 0.01);
  const ls = Math.min(tr.loopStart, Math.max(0, end - 2 * tr.xf - 1));
  const g = ctx.createGain(); g.gain.value = 0; g.connect(bus);
  const v = { name, g, srcs: new Set(), timer: 0, stopped: false, loops: 0, t0: 0 };
  const seg = (when, from, fadeIn) => {
    if (v.stopped) return;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const sg = ctx.createGain(); s.connect(sg); sg.connect(g);
    const endAt = when + (end - from);
    sg.gain.setValueAtTime(fadeIn ? 0 : 1, when);
    if (fadeIn) sg.gain.linearRampToValueAtTime(1, when + tr.xf);
    sg.gain.setValueAtTime(1, endAt - tr.xf);
    sg.gain.linearRampToValueAtTime(0, endAt);
    s.start(when, from);
    s.stop(endAt + 0.05);
    v.srcs.add(s); v.loops++;
    s.onended = () => { v.srcs.delete(s); try { sg.disconnect(); } catch { /* */ } };
    // 다음 구간은 2초 전에 예약 (화면이 꺼져 타이머가 늦어져도 ctx 도 멈추므로 괜찮음)
    v.timer = setTimeout(() => seg(endAt - tr.xf, ls, true), Math.max(0, (endAt - tr.xf - ctx.currentTime - 2) * 1000));
  };
  const from0 = Math.min(tr.startAt || 0, ls);
  v.t0 = ctx.currentTime + 0.03 - from0;   // ctx 시각으로 '곡의 0초' (박 맞추기용)
  seg(ctx.currentTime + 0.03, from0, false);
  fadeTo(g, tr.gain, FADE);
  return v;
}
function stopVoice(v, dur = FADE) {
  if (!v || v.stopped) return;
  v.stopped = true;
  clearTimeout(v.timer);
  fadeTo(v.g, 0, dur);
  const at = ctx.currentTime + dur + 0.05;
  for (const s of v.srcs) { try { s.stop(at); } catch { /* */ } }
  setTimeout(() => {
    try { v.g.disconnect(); } catch { /* */ }
    if (wanted() !== v.name && voice?.name !== v.name) delete decoded[v.name];   // 안 쓰는 곡은 메모리에서 뺌 (압축 파일은 남김)
  }, (dur + 0.3) * 1000);
}

async function applyBgm() {
  if (!ctx || ctx.state !== 'running' || document.hidden) return;   // 첫 터치 전 · 화면 꺼짐 → 나중에 다시
  if (!bus) { bus = ctx.createGain(); bus.gain.value = BUS; bus.connect(ctx.destination); }
  const target = bgmOn ? wanted() : null;
  const my = ++gen;   // 먼저 올림: 앞에서 풀고 있던 곡이 끝나도 이 요청을 덮지 않게
  if ((voice?.name ?? null) === target) return;
  if (!target || !TRACKS[target]) { stopVoice(voice); voice = null; return; }
  let buf;
  try { buf = await decode(target); } catch { return; }   // 오프라인 · 못 푸는 파일 → 음악 없이
  if (my !== gen || !ctx || ctx.state !== 'running') return;
  stopVoice(voice);   // 새 곡이 준비된 뒤에 겹쳐 바꿈 (그동안 앞 곡은 계속)
  voice = startVoice(target, buf);
  // 기본 곡이 나오기 시작하면 배틀 곡 파일을 미리 받아 둠 (처음 배틀에서 늦지 않게, 압축 파일만)
  if (target === 'main') setTimeout(() => { fetchBytes('battle').catch(() => {}); }, 8000);
}

// 미리 풀어 두기 (사파리존을 열 때 등): 처음 터치 뒤 · 음악이 켜져 있을 때만
export function bgmPreload(name) { if (ctx && bgmOn && TRACKS[name]) decode(name).catch(() => {}); }
// 그 곡이 실제로 나오기 시작할 때까지 기다림 (최대 ms). 나오면 true, 음악 꺼짐·못 받음·시간 초과면 false
export function bgmReady(name, ms = 1500) {
  const until = performance.now() + ms;
  return new Promise((res) => {
    const look = () => {
      if (voice?.name === name && !voice.stopped) return res(true);
      if (!bgmOn || !ctx || performance.now() > until) return res(false);
      setTimeout(look, 40);
    };
    look();
  });
}
// 지금 나오는 곡(name)의 다음 박까지 남은 ms (minMs 이상). 첫 타격(hit) 전이면 그 타격. 그 곡이 안 나오면 null
export function bgmBeat(name, minMs = 0) {
  const tr = TRACKS[name];
  if (!ctx || ctx.state !== 'running' || voice?.name !== name || voice.stopped || !tr?.beat) return null;
  const hitAt = voice.t0 + tr.hit;                      // 처음 지나는 타격만 (반복 구간은 따지지 않음)
  const now = ctx.currentTime + minMs / 1000;
  const k = now <= hitAt ? 0 : Math.ceil((now - hitAt) / tr.beat - 1e-6);
  const lat = ctx.outputLatency || ctx.baseLatency || 0;   // 스피커로 나오기까지 걸리는 시간만큼 그림을 늦춤
  return Math.max(0, (hitAt + k * tr.beat - ctx.currentTime + lat) * 1000);
}

// 화면이 꺼지거나 다른 앱으로 가면 멈춤, 돌아오면 이어서 (iOS 는 터치해야 다시 켜질 수도 → unlockAudio 가 처리)
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) { if (ctx.state === 'running') ctx.suspend?.().catch?.(() => {}); return; }
  ctx.resume?.().then(() => {
    if (bus) { const t = ctx.currentTime; bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(0, t); bus.gain.linearRampToValueAtTime(BUS, t + 0.5); }
    kick();
  }, () => {});
});
window.addEventListener('pageshow', () => { if (ctx && !document.hidden) unlockAudio(); });

// 시험용 (개발자 도구 · 자동 시험): import('./js/sfx.js').then((m) => m.__bgm())
export const __bgm = () => ({ ctx: ctx?.state ?? null, rate: ctx?.sampleRate, want: wanted(), playing: voice?.name ?? null, gain: voice ? +voice.g.gain.value.toFixed(3) : 0, loops: voice?.loops || 0, bgmOn, sfxOn, decoded: Object.keys(decoded), stack: stack.length });
