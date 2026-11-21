-- Bulk edit (v1.9.0): new AI usage kind 'categorize' ("Sort into categories" for selected items).
-- SAFE for the running version (v1.8.1): the list of allowed kinds only grows; v1.8.1 never writes
-- 'categorize', and every existing row stays valid. The shared daily limit is unchanged.

alter table public.ai_usage drop constraint ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('recognize', 'voice_place', 'search', 'translate', 'transcribe', 'categorize'));
