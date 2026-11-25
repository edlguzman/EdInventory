-- The owner role, part 1: additive only.
-- The running version (2.5.x) keeps working: its admin functions are not touched, the owner keeps
-- role = 'admin' (old code sees an admin) and gets profiles.is_owner on top. Only the four functions
-- of the limits change (owner instead of any admin), with the same result for today's accounts.
-- Part 2 (supabase/deferred/owner_role_enforce.sql) goes after the release of 2.6.0.

-- ---------------------------------------------------------------------------
-- The owner: at most one, always an active admin. No grants and no app function change the
-- column: only SQL by hand.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column is_owner boolean not null default false,
  add constraint profiles_owner_is_active_admin check (not is_owner or (role = 'admin' and status = 'active'));

create unique index profiles_one_owner on public.profiles (is_owner) where is_owner;

-- The one current admin becomes the owner. More than one: stop (none: a fresh database).
do $$
begin
  if (select count(*) from public.profiles where role = 'admin') > 1 then
    raise exception 'more than one admin: choose the owner by hand';
  end if;
  update public.profiles set is_owner = true where role = 'admin';
end;
$$;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------
create function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and status = 'active' and role = 'admin' and is_owner
  );
$$;

-- The first line of every new admin function: an active admin, or only the owner.
create function public.admin_guard(p_owner boolean)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_owner and not public.is_owner() then
    raise exception 'owner only' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin functions with the guard. The work is done by the functions of 2.5.x, which keep their
-- own checks (never the caller, never an admin and so never the owner).
-- admin_pending_count() stays as it is: a number for the badge on "Settings".
-- ---------------------------------------------------------------------------
create function public.admin_overview_v2()
returns table (users_count bigint, pending_count bigint, plans_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard(false);
  return query select * from public.admin_overview();
end;
$$;

create function public.admin_usage_overview_v2()
returns table (
  storage_bytes bigint, storage_limit_bytes bigint, db_bytes bigint, ai_requests_30d bigint, ai_active_users_30d bigint,
  ai_cost_30d numeric, ai_no_tokens_30d bigint, ai_no_price_30d bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard(false);
  return query select * from public.admin_usage_overview();
end;
$$;

create function public.admin_set_status_v3(p_user_id uuid, p_status text)
returns table (email text, lang text, old_status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard(false);
  return query select * from public.admin_set_status_v2(p_user_id, p_status);
end;
$$;

create function public.admin_check_delete_v2(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard(false);
  return public.admin_check_delete(p_user_id);
end;
$$;

create function public.admin_plan_stats_v2()
returns table (code text, users_now bigint, users_linked bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard(true);
  return query select * from public.admin_plan_stats();
end;
$$;

create function public.admin_update_plan_v3(p_code text, p_names jsonb, p_item_limit integer, p_ai_daily_limit integer, p_sort_order integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard(true);
  perform public.admin_update_plan_v2(p_code, p_names, p_item_limit, p_ai_daily_limit, p_sort_order);
end;
$$;

create function public.admin_create_plan_v3(p_code text, p_names jsonb, p_item_limit integer, p_ai_daily_limit integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard(true);
  perform public.admin_create_plan_v2(p_code, p_names, p_item_limit, p_ai_daily_limit);
end;
$$;

create function public.admin_delete_plan_v2(p_code text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard(true);
  perform public.admin_delete_plan(p_code);
end;
$$;

create function public.admin_reorder_plans_v2(p_codes text[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard(true);
  perform public.admin_reorder_plans(p_codes);
end;
$$;

create function public.admin_usage_settings_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard(true);
  return public.admin_usage_settings();
end;
$$;

create function public.admin_set_ai_price_v2(p_model text, p_valid_from date, p_input numeric, p_audio numeric, p_output numeric)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard(true);
  perform public.admin_set_ai_price(p_model, p_valid_from, p_input, p_audio, p_output);
end;
$$;

create function public.admin_delete_ai_price_v2(p_model text, p_valid_from date)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard(true);
  perform public.admin_delete_ai_price(p_model, p_valid_from);
end;
$$;

create function public.admin_set_storage_limit_v2(p_bytes bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard(true);
  perform public.admin_set_storage_limit(p_bytes);
end;
$$;

-- v4 + is_owner.
create function public.admin_list_users_v5(p_search text, p_status text, p_plan text, p_sort text, p_limit integer, p_offset integer)
returns table (
  user_id uuid, email text, status text, role text, created_at timestamptz, last_sign_in_at timestamptz, items_count bigint,
  ai_24h bigint, ai_total bigint, plan_code text, plan_source text, plan_until timestamptz, manual_plan text, manual_until timestamptz,
  storage_bytes bigint, ai_30d bigint, ai_cost_30d numeric, ai_no_tokens_30d bigint, ai_no_price_30d bigint, ai_kinds_30d jsonb,
  total bigint, is_owner boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.admin_guard(false);
  return query
  select
    v.user_id, v.email, v.status, v.role, v.created_at, v.last_sign_in_at, v.items_count,
    v.ai_24h, v.ai_total, v.plan_code, v.plan_source, v.plan_until, v.manual_plan, v.manual_until,
    v.storage_bytes, v.ai_30d, v.ai_cost_30d, v.ai_no_tokens_30d, v.ai_no_price_30d, v.ai_kinds_30d,
    v.total, p.is_owner
  from public.admin_list_users_v4(p_search, p_status, p_plan, p_sort, p_limit, p_offset) with ordinality v
  join public.profiles p on p.user_id = v.user_id
  order by v.ordinality;
end;
$$;

-- Like admin_set_plan, but by the owner only and for admins too (they live by their plan).
create function public.admin_set_plan_v2(p_user_id uuid, p_plan text, p_until timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard(true);
  if p_plan is not null and not exists (select 1 from public.plans where code = p_plan) then
    raise exception 'unknown plan' using errcode = '22023';
  end if;
  if p_until is not null and p_until <= now() then
    raise exception 'end date in the past' using errcode = '22023';
  end if;
  update public.profiles
  set manual_plan = p_plan, manual_until = case when p_plan is null then null else p_until end
  where user_id = p_user_id and not is_owner;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Make an active user an admin or an admin a user again. Never the owner; never a new owner.
create function public.admin_set_role(p_user_id uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.admin_guard(true);
  if p_role is null or p_role not in ('user', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  update public.profiles
  set role = p_role
  where user_id = p_user_id and not is_owner and (p_role = 'user' or status = 'active');
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- No limits: only the owner; admins live by their own plan (the one admin of today is the owner,
-- so nothing changes for anyone now).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_ai_quota_v2(p_kind text, p_fallback integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  v_item_limit integer;
  v_ai_limit integer;
  used integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_active() then
    raise exception 'account not active' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_quota:' || uid::text, 0));

  if public.is_owner() then
    insert into public.ai_usage (user_id, kind) values (uid, p_kind);
    return 'ok';
  end if;

  select pl.item_limit, pl.ai_daily_limit into v_item_limit, v_ai_limit
  from public.effective_plan(uid) e
  join public.plans pl on pl.code = e.code;

  if v_item_limit is not null and (select count(*) from public.items where user_id = uid) >= v_item_limit then
    return 'items_limit';
  end if;

  select count(*) into used
  from public.ai_usage
  where user_id = uid and created_at > now() - interval '24 hours';
  if used >= coalesce(v_ai_limit, p_fallback) then
    return 'limit';
  end if;

  insert into public.ai_usage (user_id, kind) values (uid, p_kind);
  return 'ok';
end;
$function$;

CREATE OR REPLACE FUNCTION public.consume_ai_quota_v3(p_kind text, p_fallback integer)
 RETURNS TABLE(result text, usage_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  v_item_limit integer;
  v_ai_limit integer;
  v_id uuid;
  used integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_active() then
    raise exception 'account not active' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_quota:' || uid::text, 0));

  if not public.is_owner() then
    select pl.item_limit, pl.ai_daily_limit into v_item_limit, v_ai_limit
    from public.effective_plan(uid) e
    join public.plans pl on pl.code = e.code;

    if v_item_limit is not null and (select count(*) from public.items i where i.user_id = uid) >= v_item_limit then
      return query select 'items_limit'::text, null::uuid;
      return;
    end if;

    select count(*) into used
    from public.ai_usage a
    where a.user_id = uid and a.created_at > now() - interval '24 hours';
    if used >= coalesce(v_ai_limit, p_fallback) then
      return query select 'limit'::text, null::uuid;
      return;
    end if;
  end if;

  insert into public.ai_usage (user_id, kind) values (uid, p_kind) returning id into v_id;
  return query select 'ok'::text, v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.my_plan_v2()
 RETURNS TABLE(code text, names jsonb, item_limit integer, ai_daily_limit integer, source text, until timestamp with time zone, items_count bigint, ai_used_24h bigint, is_admin boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    pl.code, pl.names, pl.item_limit, pl.ai_daily_limit, e.source, e.until,
    (select count(*) from public.items i where i.user_id = auth.uid()),
    (select count(*) from public.ai_usage a where a.user_id = auth.uid() and a.created_at > now() - interval '24 hours'),
    public.is_owner()
  from public.effective_plan(auth.uid()) e
  join public.plans pl on pl.code = e.code
  where public.is_active();
$function$;

CREATE OR REPLACE FUNCTION public.items_enforce_plan_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer;
begin
  -- The owner: no limits (same rule as consume_ai_quota_v3). Admins have their own plan.
  if exists (select 1 from public.profiles where user_id = new.user_id and is_owner and status = 'active') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('items_limit:' || new.user_id::text, 0));

  select pl.item_limit into v_limit
  from public.effective_plan(new.user_id) e
  join public.plans pl on pl.code = e.code;

  if v_limit is not null and (select count(*) from public.items where user_id = new.user_id) >= v_limit then
    raise exception 'plan_limit' using errcode = 'P0010', detail = v_limit::text;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.admin_overview_v2() from public, anon;
grant execute on function public.admin_overview_v2() to authenticated;
revoke execute on function public.admin_usage_overview_v2() from public, anon;
grant execute on function public.admin_usage_overview_v2() to authenticated;
revoke execute on function public.admin_set_status_v3(uuid, text) from public, anon;
grant execute on function public.admin_set_status_v3(uuid, text) to authenticated;
revoke execute on function public.admin_check_delete_v2(uuid) from public, anon;
grant execute on function public.admin_check_delete_v2(uuid) to authenticated;
revoke execute on function public.admin_plan_stats_v2() from public, anon;
grant execute on function public.admin_plan_stats_v2() to authenticated;
revoke execute on function public.admin_update_plan_v3(text, jsonb, integer, integer, integer) from public, anon;
grant execute on function public.admin_update_plan_v3(text, jsonb, integer, integer, integer) to authenticated;
revoke execute on function public.admin_create_plan_v3(text, jsonb, integer, integer) from public, anon;
grant execute on function public.admin_create_plan_v3(text, jsonb, integer, integer) to authenticated;
revoke execute on function public.admin_delete_plan_v2(text) from public, anon;
grant execute on function public.admin_delete_plan_v2(text) to authenticated;
revoke execute on function public.admin_reorder_plans_v2(text[]) from public, anon;
grant execute on function public.admin_reorder_plans_v2(text[]) to authenticated;
revoke execute on function public.admin_usage_settings_v2() from public, anon;
grant execute on function public.admin_usage_settings_v2() to authenticated;
revoke execute on function public.admin_set_ai_price_v2(text, date, numeric, numeric, numeric) from public, anon;
grant execute on function public.admin_set_ai_price_v2(text, date, numeric, numeric, numeric) to authenticated;
revoke execute on function public.admin_delete_ai_price_v2(text, date) from public, anon;
grant execute on function public.admin_delete_ai_price_v2(text, date) to authenticated;
revoke execute on function public.admin_set_storage_limit_v2(bigint) from public, anon;
grant execute on function public.admin_set_storage_limit_v2(bigint) to authenticated;
revoke execute on function public.admin_list_users_v5(text, text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_users_v5(text, text, text, text, integer, integer) to authenticated;
revoke execute on function public.admin_set_plan_v2(uuid, text, timestamptz) from public, anon;
grant execute on function public.admin_set_plan_v2(uuid, text, timestamptz) to authenticated;
revoke execute on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;
revoke execute on function public.admin_guard(boolean) from public, anon, authenticated;
