-- Reverts 20261124000000_admin_usage.sql (app 2.3.2 does not use any of it).
-- Recorded tokens, prices and the storage limit are lost: dump them first.

begin;

drop function if exists public.admin_set_storage_limit(bigint);
drop function if exists public.admin_delete_ai_price(text, date);
drop function if exists public.admin_set_ai_price(text, date, numeric, numeric, numeric);
drop function if exists public.admin_usage_settings();
drop function if exists public.admin_list_users_v4(text, text, text, text, integer, integer);
drop function if exists public.admin_usage_overview();
drop function if exists public.ai_usage_costs(timestamptz);
drop function if exists public.record_ai_tokens(uuid, text, integer, integer, integer);
drop function if exists public.consume_ai_quota_v3(text, integer);
drop table if exists public.app_settings;
drop table if exists public.ai_prices;
drop trigger if exists ai_usage_no_tokens on public.ai_usage;
drop function if exists public.ai_usage_no_tokens_on_insert();
drop index if exists public.ai_usage_created_idx;
alter table public.ai_usage
  drop column if exists model,
  drop column if exists input_tokens,
  drop column if exists input_audio_tokens,
  drop column if exists output_tokens;

commit;
