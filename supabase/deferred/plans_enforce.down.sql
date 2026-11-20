-- Reverse of plans_enforce.sql: removes the item-limit trigger and restores the two old functions
-- exactly as in 20261119180000_profiles_approval_admin.sql (same grants).

drop trigger if exists items_enforce_plan_limit on public.items;
drop function if exists public.items_enforce_plan_limit();

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

revoke execute on function public.consume_ai_quota(text, integer) from public, anon;
grant execute on function public.consume_ai_quota(text, integer) to authenticated;
revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
