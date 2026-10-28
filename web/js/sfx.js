// 8-bit sound effects made with Web Audio (no audio files). Respects the iOS silent switch.
let ctx = null;
let muted = (() => { try { return localStorage.getItem('mute') === '1'; } catch { return false; } })();

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) ctx = new AC();
}
export const isMuted = () => muted;
export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('mute', v ? '1' : '0'); } catch { /* ignore */ }
  if (v) stopBgm();
}

const N = (n) => 440 * 2 ** ((n - 69) / 12);  // midi → Hz

// notes: [[midi|null, beats], ...]
function play(notes, { bpm = 600, type = 'square', vol = 0.08 } = {}) {
  if (muted || !ctx) return;
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
  fail:    () => play([[64, 2], [62, 2], [60, 4]], { type: 'triangle', vol: 0.1, bpm: 480 }),
  // 배틀
  ballThrow: () => play([[91, 0.4], [86, 0.4], [81, 0.4], [76, 0.4], [71, 0.6]], { bpm: 1400, vol: 0.05 }),
  ballPop:   () => play([[72, 0.5], [84, 0.5], [96, 1]], { bpm: 1200, vol: 0.07 }),
  hit:       () => play([[45, 0.6], [40, 0.8]], { type: 'sawtooth', bpm: 900, vol: 0.09 }),
  statUp:    () => play([[72, 1], [76, 1], [79, 1], [84, 1], [88, 1], [91, 2]], { bpm: 1300, vol: 0.06 }),
  statDown:  () => play([[91, 1], [88, 1], [84, 1], [79, 1], [76, 1], [72, 2]], { bpm: 1300, type: 'triangle', vol: 0.09 }),
  faint:     () => play([[67, 1], [63, 1], [58, 1], [53, 3]], { bpm: 720, type: 'triangle', vol: 0.1 }),
};

// ───────── 배틀 배경 음악 (직접 만든 8비트 곡, 반복) ─────────
// 가: 리드 (사각파) / 나: 베이스 (삼각파). 단위 = 8분음표, 8마디 × 8칸.
const BATTLE_LEAD = [
  [76, 1], [74, 1], [72, 1], [74, 1], [76, 2], [69, 2],
  [72, 1], [74, 1], [72, 1], [69, 1], [65, 2], [69, 2],
  [71, 1], [72, 1], [74, 2], [79, 2], [74, 2],
  [68, 1], [71, 1], [76, 2], [74, 2], [71, 2],
  [81, 1], [79, 1], [76, 1], [79, 1], [81, 2], [76, 2],
  [77, 1], [76, 1], [74, 1], [72, 1], [69, 2], [72, 2],
  [74, 1], [71, 1], [67, 1], [71, 1], [68, 1], [71, 1], [76, 1], [80, 1],
  [81, 4], [null, 2], [69, 1], [71, 1],
];
const bassBar = (lo, n = 8) => Array.from({ length: n }, (_, i) => [i % 2 ? lo + 12 : lo, 1]);
const BATTLE_BASS = [
  ...bassBar(45), ...bassBar(41), ...bassBar(43), ...bassBar(40),
  ...bassBar(45), ...bassBar(41), ...bassBar(43, 4), ...bassBar(40, 4), ...bassBar(45),
];
const BGM_BPM = 330;   // 8분음표 기준
let bgm = null;        // { gain, timer }

function scheduleVoice(notes, t0, { type, vol }, out) {
  const beat = 60 / BGM_BPM;
  let t = t0;
  for (const [n, len] of notes) {
    const d = len * beat;
    if (n != null) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type; o.frequency.value = N(n);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + d * 0.9);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + d);
    }
    t += d;
  }
  return t - t0;
}

export function startBgm() {
  stopBgm();
  if (muted || !ctx) return;
  const gain = ctx.createGain();
  gain.gain.value = 1;
  gain.connect(ctx.destination);
  const loop = (t0) => {
    const len = scheduleVoice(BATTLE_LEAD, t0, { type: 'square', vol: 0.025 }, gain);
    scheduleVoice(BATTLE_BASS, t0, { type: 'triangle', vol: 0.06 }, gain);
    // 다음 바퀴는 이번 바퀴가 끝나기 1초 전에 미리 예약
    bgm.timer = setTimeout(() => loop(t0 + len), Math.max(0, (t0 + len - ctx.currentTime - 1) * 1000));
  };
  bgm = { gain, timer: null };
  loop(ctx.currentTime + 0.05);
}

export function stopBgm() {
  if (!bgm) return;
  clearTimeout(bgm.timer);
  try { bgm.gain.gain.setValueAtTime(0, ctx.currentTime); bgm.gain.disconnect(); } catch { /* ignore */ }
  bgm = null;
}
