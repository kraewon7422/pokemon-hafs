-- User decision (2026-10-27): ranking shows the masked name ("22기 강○원") by default.
-- Students can switch to "익명 트레이너" any time from the ⚙ settings button (top right) or the consent screen.
alter table public.profiles alter column show_on_board set default true;
