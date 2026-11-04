// 작은 GIF 읽기 (외부 라이브러리 없음): 움직이는 포켓몬 그림(운영자가 올린 GIF)을 프레임별 RGBA 로 풀어 줌.
// decodeGif(Uint8Array) → { w, h, frames: [{ rgba: Uint8ClampedArray(w*h*4), delay: ms }] }  (각 프레임 = 화면 전체, 합성 끝난 모습)
// 지원: GIF87a/89a, 전역·지역 색표, 투명색, 프레임 지우기 방식(0~3), 인터레이스. 너무 크거나 프레임이 너무 많으면 오류.

export const GIF_LIMITS = { maxSide: 512, maxFrames: 120 };

export const isGif = (u8) => u8.length > 6 && u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46;   // "GIF"

function lzw(minSize, data, npix) {
  const MAX = 4096;
  const prefix = new Int16Array(MAX), suffix = new Uint8Array(MAX), stack = new Uint8Array(MAX + 1);
  const out = new Uint8Array(npix);
  const clear = 1 << minSize, eoi = clear + 1;
  for (let c = 0; c < clear; c++) { prefix[c] = -1; suffix[c] = c; }
  let codeSize = minSize + 1, codeMask = (1 << codeSize) - 1, avail = clear + 2, old = -1, first = 0;
  let datum = 0, bits = 0, pi = 0, top = 0, op = 0;
  while (op < npix) {
    if (top === 0) {
      if (bits < codeSize) {
        if (pi >= data.length) break;
        datum |= data[pi++] << bits; bits += 8;
        continue;
      }
      let code = datum & codeMask; datum >>= codeSize; bits -= codeSize;
      if (code === clear) { codeSize = minSize + 1; codeMask = (1 << codeSize) - 1; avail = clear + 2; old = -1; continue; }
      if (code === eoi) break;
      if (old === -1) { if (code >= clear) break; stack[top++] = suffix[code]; old = code; first = code; continue; }
      const inCode = code;
      if (code >= avail) { stack[top++] = first; code = old; }          // KwKwK
      while (code >= clear) { if (top >= MAX) return out; stack[top++] = suffix[code]; code = prefix[code]; }
      first = suffix[code]; stack[top++] = first;
      if (avail < MAX) {
        prefix[avail] = old; suffix[avail] = first; avail++;
        if ((avail & codeMask) === 0 && avail < MAX) { codeSize++; codeMask += avail; }
      }
      old = inCode;
    }
    out[op++] = stack[--top];
  }
  return out;   // 데이터가 모자라면 나머지는 0 번 색 (브라우저처럼 대충 보여 줌)
}

export function decodeGif(u8) {
  if (!isGif(u8)) throw new Error('NOT_GIF');
  let p = 6;
  const rd16 = () => { const v = u8[p] | (u8[p + 1] << 8); p += 2; return v; };
  const w = rd16(), h = rd16();
  if (!w || !h || w > GIF_LIMITS.maxSide || h > GIF_LIMITS.maxSide) throw new Error('GIF_TOO_BIG');
  const packed = u8[p++]; p += 2;   // 배경색 · 비율 (안 씀)
  const readTable = (n) => { const t = u8.subarray(p, p + n * 3); p += n * 3; return t; };
  const gct = packed & 0x80 ? readTable(1 << ((packed & 7) + 1)) : null;
  const subBlocks = () => {
    const parts = []; let n = 0;
    while (p < u8.length) { const len = u8[p++]; if (!len) break; parts.push(u8.subarray(p, p + len)); n += len; p += len; }
    const all = new Uint8Array(n); let o = 0; for (const x of parts) { all.set(x, o); o += x.length; }
    return all;
  };
  const screen = new Uint8ClampedArray(w * h * 4);
  const frames = [];
  let gce = { disposal: 0, trans: -1, delay: 0 };
  while (p < u8.length) {
    const b = u8[p++];
    if (b === 0x3b) break;                                   // 끝
    if (b === 0x21) {                                        // 확장
      const label = u8[p++];
      if (label === 0xf9) {
        const d = subBlocks();
        gce = { disposal: (d[0] >> 2) & 7, trans: d[0] & 1 ? d[3] : -1, delay: (d[1] | (d[2] << 8)) * 10 };
      } else subBlocks();
      continue;
    }
    if (b !== 0x2c) break;                                   // 모르는 블록 → 여기까지
    const fx = rd16(), fy = rd16(), fw = rd16(), fh = rd16(); const ip = u8[p++];
    const lct = ip & 0x80 ? readTable(1 << ((ip & 7) + 1)) : null;
    const pal = lct || gct;
    const minSize = u8[p++];
    if (minSize < 2 || minSize > 11) throw new Error('GIF_BAD');
    const idx = lzw(minSize, subBlocks(), fw * fh);
    const saved = gce.disposal === 3 ? screen.slice() : null;
    // 인터레이스면 줄 순서 바꿈
    const rows = new Int32Array(fh);
    if (ip & 0x40) { let r = 0; for (const [s, st] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = s; y < fh; y += st) rows[r++] = y; }
    else for (let y = 0; y < fh; y++) rows[y] = y;
    if (pal) {
      for (let r = 0; r < fh; r++) {
        const sy = fy + rows[r]; if (sy >= h) continue;
        for (let x = 0; x < fw; x++) {
          const sx = fx + x; if (sx >= w) continue;
          const ci = idx[r * fw + x];
          if (ci === gce.trans || ci * 3 + 2 >= pal.length) continue;
          const o = (sy * w + sx) * 4;
          screen[o] = pal[ci * 3]; screen[o + 1] = pal[ci * 3 + 1]; screen[o + 2] = pal[ci * 3 + 2]; screen[o + 3] = 255;
        }
      }
    }
    frames.push({ rgba: screen.slice(), delay: gce.delay < 20 ? 100 : gce.delay });   // 0·1 = 브라우저처럼 0.1초
    if (frames.length > GIF_LIMITS.maxFrames) throw new Error('GIF_TOO_LONG');
    if (gce.disposal === 2) {                                  // 그 자리를 투명하게
      for (let y = fy; y < Math.min(h, fy + fh); y++) screen.fill(0, (y * w + fx) * 4, (y * w + Math.min(w, fx + fw)) * 4);
    } else if (saved) screen.set(saved);
    gce = { disposal: 0, trans: -1, delay: 0 };
  }
  if (!frames.length) throw new Error('GIF_BAD');
  return { w, h, frames };
}
