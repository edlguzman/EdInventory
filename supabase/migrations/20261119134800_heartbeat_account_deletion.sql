-- Stage 7: keepalive heartbeat visible in Settings, and account deletion.

-- ---------------------------------------------------------------------------
-- system_status: one row with the time of the last keepalive.
-- Vercel Hobby keeps logs for one hour only; this row shows that the daily cron runs.
-- Not user data: every signed-in user may read it; nobody may write it directly.
-- ---------------------------------------------------------------------------

create table public.system_status (
  id                boolean primary key default true check (id), -- exactly one row
  last_keepalive_at timestamptz
);

insert into public.system_status (id) values (true);

alter table public.system_status enable row level security;

create policy system_status_read on public.system_status
  for select to authenticated using (true);

revoke all on public.system_status from anon, authenticated;
grant select on public.system_status to authenticated;

-- keepalive(): now also records the time. SECURITY DEFINER because the caller (the cron
-- route, anon key) has no write access to system_status. Known and accepted: anyone with
-- the public anon key can call it and move the timestamp; no data is exposed.
-- CREATE OR REPLACE keeps the existing grants (execute for anon, authenticated).
create or replace function public.keepalive()
returns timestamptz
language sql
volatile
security definer
set search_path = ''
as $$
  update public.system_status
  set last_keepalive_at = now()
  where id
  returning last_keepalive_at;
$$;

-- ---------------------------------------------------------------------------
-- delete_my_account(): deletes the CALLER's auth user; every app table cascades
-- (user_id ... on delete cascade). The app has no service role key, so this runs as
-- SECURITY DEFINER, but it can only ever delete auth.uid().
-- Storage files are NOT removed here (Supabase blocks direct deletes on storage.objects):
-- the server action deletes them through the Storage API first.
-- ---------------------------------------------------------------------------

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
