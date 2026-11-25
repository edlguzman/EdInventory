-- Reverse of 20261125000000_owner_role.sql (only after owner_role_enforce.down.sql, if that was applied).
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

  if public.is_admin() then
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

  if not public.is_admin() then
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
    public.is_admin()
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
  -- Admin accounts: no limits (same rule as consume_ai_quota_v2).
  if exists (select 1 from public.profiles where user_id = new.user_id and role = 'admin' and status = 'active') then
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

drop function public.admin_overview_v2();
drop function public.admin_usage_overview_v2();
drop function public.admin_set_status_v3(uuid, text);
drop function public.admin_check_delete_v2(uuid);
drop function public.admin_plan_stats_v2();
drop function public.admin_update_plan_v3(text, jsonb, integer, integer, integer);
drop function public.admin_create_plan_v3(text, jsonb, integer, integer);
drop function public.admin_delete_plan_v2(text);
drop function public.admin_reorder_plans_v2(text[]);
drop function public.admin_usage_settings_v2();
drop function public.admin_set_ai_price_v2(text, date, numeric, numeric, numeric);
drop function public.admin_delete_ai_price_v2(text, date);
drop function public.admin_set_storage_limit_v2(bigint);
drop function public.admin_list_users_v5(text, text, text, text, integer, integer);
drop function public.admin_set_plan_v2(uuid, text, timestamptz);
drop function public.admin_set_role(uuid, text);
drop function public.admin_guard(boolean);
drop function public.is_owner();
alter table public.profiles drop constraint profiles_owner_is_active_admin;
alter table public.profiles drop column is_owner;
