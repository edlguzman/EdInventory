-- Keepalive for Supabase Free (projects pause after 7 days without activity).
-- Called once a day by Vercel Cron via /api/cron/keepalive.
-- The cron route has no user session and the app has no service role key,
-- so the function is callable by anon. It reads no data: it only returns the DB clock,
-- which still guarantees the request reaches Postgres (not just the API gateway).

create function public.keepalive()
returns timestamptz
language sql
volatile
set search_path = ''
as $$ select now() $$;

revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
