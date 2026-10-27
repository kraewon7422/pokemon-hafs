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
};
