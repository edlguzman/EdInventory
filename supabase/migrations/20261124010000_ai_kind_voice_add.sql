-- AI usage kind "voice_add" (v2.5.0: items added by one voice or text phrase).
-- Safe for app 2.4.0: the list of allowed kinds only grows.
-- Rollback: supabase/deferred/ai_kind_voice_add.down.sql.

begin;

alter table public.ai_usage drop constraint ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('recognize', 'voice_place', 'search', 'translate', 'transcribe', 'categorize', 'voice_add'));

commit;
