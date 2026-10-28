// Login helpers: in-app browser escape, Google sign-in, dev password login.
import { CONFIG } from './config.js';
import { sb } from './sb.js';

// KakaoTalk / Instagram / Facebook / Line / Naver in-app browsers: Google blocks OAuth there (403 disallowed_useragent)
export function inAppBrowser() {
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/Instagram|FBAN|FBAV|Line\/|NAVER\(inapp|DaumApps|everytimeApp/i.test(ua)) return 'other';
  return null;
}
export const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(navigator.userAgent);

// Try to reopen this page in the real browser. Returns false when the user must do it by hand (iOS non-Kakao).
export function escapeInApp() {
  const url = location.href;
  const kind = inAppBrowser();
  if (kind === 'kakao') {
    location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
    return true;
  }
  if (isAndroid()) {
    const u = new URL(url);
    location.href = `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
    return true;
  }
  return false;
}

// Google sign-in. With GOOGLE_CLIENT_ID: Google Identity Services button → signInWithIdToken (no redirect,
// so it works inside an iOS home-screen app). Without it: Supabase redirect flow.
export async function renderGoogleButton(container, onError) {
  if (!CONFIG.GOOGLE_CLIENT_ID) {
    const b = document.createElement('button');
    b.className = 'btn big';
    b.textContent = '학교 구글 계정으로 시작';
    b.onclick = async () => {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } },
      });
      if (error) onError(error.message);
    };
    container.append(b);
    return;
  }
  await loadScript('https://accounts.google.com/gsi/client');
  const raw = crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
  const hashed = await sha256hex(raw);
  window.google.accounts.id.initialize({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    nonce: hashed,
    use_fedcm_for_prompt: true,
    callback: async ({ credential }) => {
      const { error } = await sb.auth.signInWithIdToken({ provider: 'google', token: credential, nonce: raw });
      if (error) onError(error.message);
    },
  });
  window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'ko', width: 260 });
}

// 아이디 계정 (0018): '<아이디>@id.local' 로 비밀번호 로그인. 운영진 아이디는 운영자가 만들어 준다
export async function idLogin(id, password) {
  const lid = String(id || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{3,15}$/.test(lid)) throw new Error('아이디는 영문으로 시작하는 4~16자예요.');
  const { error } = await sb.auth.signInWithPassword({ email: `${lid}@id.local`, password });
  if (error) throw new Error('아이디나 비밀번호가 맞지 않아요.');
}

export async function devLogin(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  // scope 'local': log out this device only (the default 'global' also ends the login on every other phone)
  try { await sb.auth.signOut({ scope: 'local' }); } catch { /* offline: local session still cleared below */ }
  try { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = resolve; s.onerror = () => reject(new Error('구글 로그인 스크립트를 불러오지 못했어요'));
    document.head.append(s);
  });
}
async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}
