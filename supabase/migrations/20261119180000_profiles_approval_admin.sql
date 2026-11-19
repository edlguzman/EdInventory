-- Approval mode and admin page.
-- Every account has a profile with a status (pending / active / disabled) and a role
-- (user / admin). New sign-ups are pending; only active accounts can read or write data.
-- Status lives in a table (not in the JWT) so a change takes effect immediately.

-- ---------------------------------------------------------------------------
-- profiles: users may read their own row and nothing else. No write grants at all:
-- status and role change only through the admin functions below (SECURITY DEFINER).
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id           uuid primary key references auth.users on delete cascade,
  status            text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  role              text not null default 'user' check (role in ('user', 'admin')),
  created_at        timestamptz not null default now(),
  status_changed_at timestamptz
);

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

-- Accounts that exist now are active.
insert into public.profiles (user_id, status)
select id, 'active' from auth.users
on conflict (user_id) do nothing;

-- New accounts start as pending (the column default).
create function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row
  execute function public.handle_new_user_profile();

revoke execute on function public.handle_new_user_profile() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- is_active() / is_admin(): used by RLS policies and the admin functions.
-- SECURITY DEFINER so they work regardless of the caller's grants; they only
-- ever look at auth.uid().
-- ---------------------------------------------------------------------------

create function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and status = 'active'
  );
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and status = 'active' and role = 'admin'
  );
$$;

revoke execute on function public.is_active() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_active() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: the same "own rows" policies, now only for active accounts.
-- (select ...) wrappers: evaluated once per statement, not per row.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  own constant text := 'user_id = (select auth.uid()) and (select public.is_active())';
begin
  foreach t in array array['locations', 'categories', 'items', 'item_photos'] loop
    execute format('drop policy %I on public.%I', t || '_select_own', t);
    execute format('drop policy %I on public.%I', t || '_insert_own', t);
    execute format('drop policy %I on public.%I', t || '_update_own', t);
    execute format('drop policy %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_select_own', t, own);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_insert_own', t, own);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', t || '_update_own', t, own, own);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', t || '_delete_own', t, own);
  end loop;
end;
$$;

drop policy ai_usage_select_own on public.ai_usage;
drop policy ai_usage_insert_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()) and (select public.is_active()));
create policy ai_usage_insert_own on public.ai_usage
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_active()));

-- Storage: own folder, active accounts only.
drop policy item_photos_storage_select_own on storage.objects;
drop policy item_photos_storage_insert_own on storage.objects;
drop policy item_photos_storage_update_own on storage.objects;
drop policy item_photos_storage_delete_own on storage.objects;

create policy item_photos_storage_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_active()));

create policy item_photos_storage_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_active()));

create policy item_photos_storage_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_active()))
  with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_active()));

create policy item_photos_storage_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_active()));

-- ---------------------------------------------------------------------------
-- consume_ai_quota: an inactive account gets a clear error (42501) before anything else.
-- CREATE OR REPLACE keeps the existing grants (authenticated only).
-- ---------------------------------------------------------------------------

create or replace function public.consume_ai_quota(p_kind text, p_limit integer)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  used integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_active() then
    raise exception 'account not active' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_quota:' || uid::text, 0));

  select count(*) into used
  from public.ai_usage
  where user_id = uid
    and created_at > now() - interval '24 hours';

  if used >= p_limit then
    return false;
  end if;

  insert into public.ai_usage (user_id, kind) values (uid, p_kind);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin functions. Each one checks is_admin() itself, so calling them through the
-- public API without the role gives 42501. They return accounts and numbers only:
-- never items, places, categories or photos.
-- ---------------------------------------------------------------------------

create function public.admin_list_users()
returns table (
  user_id         uuid,
  email           text,
  status          text,
  role            text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  items_count     bigint,
  ai_24h          bigint,
  ai_total        bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select
    p.user_id,
    u.email::text,
    p.status,
    p.role,
    u.created_at,
    u.last_sign_in_at,
    (select count(*) from public.items i where i.user_id = p.user_id),
    (select count(*) from public.ai_usage a where a.user_id = p.user_id and a.created_at > now() - interval '24 hours'),
    (select count(*) from public.ai_usage a where a.user_id = p.user_id)
  from public.profiles p
  join auth.users u on u.id = p.user_id
  order by u.created_at desc;
end;
$$;

create function public.admin_pending_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return (select count(*) from public.profiles where status = 'pending');
end;
$$;

-- Activate or disable an account. Not yourself, not another admin.
create function public.admin_set_status(p_user_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_status not in ('active', 'disabled') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot change own account' using errcode = '42501';
  end if;

  update public.profiles
  set status = p_status, status_changed_at = now()
  where user_id = p_user_id and role <> 'admin';

  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Deleting a user needs the service role key (their Storage files and the auth user),
-- which the server uses only after this check passes with the admin's own session.
-- Returns the email for the confirmation log; same rules as admin_set_status.
create function public.admin_check_delete(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_email text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot delete own account here' using errcode = '42501';
  end if;

  select u.email::text into target_email
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where p.user_id = p_user_id and p.role <> 'admin';

  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  return target_email;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_pending_count() from public, anon;
revoke execute on function public.admin_set_status(uuid, text) from public, anon;
revoke execute on function public.admin_check_delete(uuid) from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_pending_count() to authenticated;
grant execute on function public.admin_set_status(uuid, text) to authenticated;
grant execute on function public.admin_check_delete(uuid) to authenticated;
