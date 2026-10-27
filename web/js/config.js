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
};
