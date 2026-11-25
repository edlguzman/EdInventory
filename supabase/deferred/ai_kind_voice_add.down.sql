-- Reverts 20261124010000_ai_kind_voice_add.sql. Recorded "voice_add" requests are kept as "voice_place"
-- (they still count towards the daily limit).

begin;

update public.ai_usage set kind = 'voice_place' where kind = 'voice_add';
alter table public.ai_usage drop constraint ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('recognize', 'voice_place', 'search', 'translate', 'transcribe', 'categorize'));

commit;
