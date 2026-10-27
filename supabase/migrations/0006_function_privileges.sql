-- Functions created in later migrations got the PostgreSQL default "EXECUTE to PUBLIC" (the 0003 default-privilege
-- change only applies to functions created by the role that ran it). Found 2026-10-28: anon could call sync,
-- admin_* (they still checked roles inside) and internal helpers like _is_open.
-- Rule from now on: EVERY migration that creates/replaces functions must end with this block (tests/rpc_test.mjs checks it).
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_admin(),
  public.ensure_profile(),
  public.accept_terms(boolean),
  public.sync(jsonb, text),
  public.self_redeem(),
  public.answer_quiz(bigint, int),
  public.evolve(int),
  public.get_ranking(int),
  public.set_prefs(boolean, int),
  public.log_client_error(text),
  public.booth_lookup(text),
  public.booth_redeem(text),
  public.screen_feed(),
  public.screen_rotating_token(text),
  public.admin_create_qr(text, text, text, text),
  public.admin_rotate_qr(text, boolean),
  public.admin_cancel_ticket(text),
  public.admin_set_role(text, text),
  public.admin_adjust_tickets(text, int),
  public.admin_unlink(text),
  public.admin_stats(),
  public.admin_make_login_codes(text[], text[]),
  public.admin_export_ranking(),
  public.admin_relink(text, text),
  public.admin_grant_monster(text, int, int),
  public.admin_set_in_ranking(text, boolean)
to authenticated;
