-- Voice input into text fields (v1.3.0): new AI usage kind 'transcribe'.
-- SAFE for the running version: the list of allowed kinds only grows; v1.2.0 never writes
-- 'transcribe', and every existing row stays valid. The shared daily limit is unchanged.

alter table public.ai_usage drop constraint ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('recognize', 'voice_place', 'search', 'translate', 'transcribe'));
