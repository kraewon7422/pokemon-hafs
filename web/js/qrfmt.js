// QR text formats — see docs/DESIGN.md §4. Changing these breaks printed QRs.
//   place QR:  https://<site>/s#<QR_ID>.<TOKEN>
//   bag QR:    PH1|<student_id>|<nonce>.<qr>.<token>|...
//   manual:    5 chars printed under the place QR → qr '_' + code

export function parsePlace(text) {
  const s = String(text || '').trim();
  let m = s.match(/[#?&](?:q=)?([A-Z0-9]{2,6})\.([a-z0-9]{6,12})\s*$/i) || s.match(/^([A-Z0-9]{2,6})\.([a-z0-9]{6,12})$/i);
  if (m) return { q: m[1].toUpperCase(), t: m[2].toLowerCase() };
  m = s.match(/^[A-HJ-NP-Z2-9]{5}$/i);                // manual code (no 0/O/1/I)
  if (m) return { q: '_', t: s.toUpperCase() };
  return null;
}

export const isBag = (text) => /^PH1[|/]/i.test(String(text || '').trim());

export function makeNonce() {
  const a = '0123456789abcdefghijklmnopqrstuvwxyz';
  const b = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(b, (x) => a[x % 36]).join('');
}

// bag QR v2: uppercase letters, digits and . / - only → QR "alphanumeric mode" (smaller, faster to scan) and
// safe for USB barcode scanners typing into a Korean-IME keyboard. '-' marks a manual-code ticket.
export function bagPayload(studentId, tickets) {
  return ['PH1', studentId, ...tickets.map((t) => `${t.nonce}.${t.qr_id === '_' ? '-' : t.qr_id}.${t.token}`)]
    .join('/').toUpperCase();
}

// A USB scanner typing while Windows is in 한글 mode produces jamo/syllables ("PH1" → "ㅔㅗ1").
// Map them back to the (uppercase) keys of the 2-beolsik layout. Our bag QR is uppercase-only, so case is safe.
const KEY = {
  ㅂ: 'Q', ㅈ: 'W', ㄷ: 'E', ㄱ: 'R', ㅅ: 'T', ㅛ: 'Y', ㅕ: 'U', ㅑ: 'I', ㅐ: 'O', ㅔ: 'P',
  ㅁ: 'A', ㄴ: 'S', ㅇ: 'D', ㄹ: 'F', ㅎ: 'G', ㅗ: 'H', ㅓ: 'J', ㅏ: 'K', ㅣ: 'L',
  ㅋ: 'Z', ㅌ: 'X', ㅊ: 'C', ㅍ: 'V', ㅠ: 'B', ㅜ: 'N', ㅡ: 'M',
  ㅃ: 'Q', ㅉ: 'W', ㄸ: 'E', ㄲ: 'R', ㅆ: 'T', ㅒ: 'O', ㅖ: 'P',
  ㅘ: 'HK', ㅙ: 'HO', ㅚ: 'HL', ㅝ: 'NJ', ㅞ: 'NP', ㅟ: 'NL', ㅢ: 'ML',
  ㄳ: 'RT', ㄵ: 'SW', ㄶ: 'SG', ㄺ: 'FR', ㄻ: 'FA', ㄼ: 'FQ', ㄽ: 'FT', ㄾ: 'FX', ㄿ: 'FV', ㅀ: 'FG', ㅄ: 'QT',
};
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
export function fixKoreanIME(text) {
  let out = '';
  for (const ch of String(text || '')) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) {
      const i = c - 0xac00;
      out += KEY[CHO[Math.floor(i / 588)]] + KEY[JUNG[Math.floor((i % 588) / 28)]] + (KEY[JONG[i % 28]] || '');
    } else out += KEY[ch] ?? ch;
  }
  return out;
}

export function placeUrl(site, qrId, token) {
  return `${site.replace(/\/$/, '')}/s#${qrId}.${token}`;
}

// draw a QR code onto a canvas (pixel-perfect, white quiet zone). Requires vendor/qrcode.js.
export function drawQR(canvas, text, { cell = 8, margin = 4, ecc = 'M' } = {}) {
  const qr = window.qrcode(0, ecc);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const size = (n + margin * 2) * cell;
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.isDark(r, c)) g.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
  }
  return canvas;
}
