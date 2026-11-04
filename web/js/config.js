// Public settings. The Supabase publishable key is meant to be public — security is enforced by RLS + RPC checks.
// NEVER put the service_role key here.
export const CONFIG = {
  GAME_TITLE: 'HAFS 몬스터',
  SUPABASE_URL: 'https://xubuctysllthwirusuln.supabase.co',        // staging
  SUPABASE_KEY: 'sb_publishable__nwfE6aqdvVdPCCvKu9IdA_qL5pbDAk',
  // Google OAuth web client id (Google Cloud console). Empty → falls back to Supabase redirect login.
  GOOGLE_CLIENT_ID: '842857592911-4jhb6kg5qt10su7irfld1i92oh83fi3o.apps.googleusercontent.com',
  // Shows the email/password test login. MUST be false for the real festival project.
  DEV_LOGIN: true,
  // Raise together with settings.min_client_version to tell old cached phones to reload.
  VERSION: 1,
  SYNC_INTERVAL_MS: 60_000,
  BAG_POLL_MS: 3_000,
  ATLAS_COLS: 12,
  // 팬 게임 안내 (로그인·설정·대형 화면·개인정보 처리방침에 늘 보임)
  FAN_NOTICE: '비공식 팬 게임 · 무료 학교 축제용이에요. Nintendo · Game Freak · The Pokémon Company와 관련이 없고 승인·후원을 받지 않았어요. 포켓몬 이름·그림의 권리는 원저작권자에게 있어요.',
};
