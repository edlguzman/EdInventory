-- Admin sections (v1.7.0) — SAFE for the running version (v1.6.1): new functions only.
-- No existing table, column, policy, trigger or function changes. Every function is
-- SECURITY DEFINER, checks is_admin() itself and returns no items, places or photos.

-- 1. Users, one page at a time: search by email, filters, sorting, total count. -----------------
--   p_search: part of the email, case-insensitive (% and _ are literal characters).
--   p_status: 'pending' | 'active' | 'disabled' | null (all).
--   p_plan:   effective plan code | null (all).
--   p_sort:   'new' (default) | 'old' | 'email' | 'items' | 'ai' | 'seen'. Pending accounts first.
--   total:    rows matching the filters (the same on every row; no rows past the last page).
create function public.admin_list_users_v3(
  p_search text,
  p_status text,
  p_plan text,
  p_sort text,
  p_limit integer,
  p_offset integer
)
returns table (
  user_id         uuid,
  email           text,
  status          text,
  role            text,
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  items_count     bigint,
  ai_24h          bigint,
  ai_total        bigint,
  plan_code       text,
  plan_source     text,
  plan_until      timestamptz,
  manual_plan     text,
  manual_until    timestamptz,
  total           bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pattern text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if nullif(btrim(p_search), '') is not null then
    v_pattern := '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  with base as (
    select
      p.user_id,
      u.email::text as email,
      p.status,
      p.role,
      u.created_at,
      u.last_sign_in_at,
      (select count(*) from public.items i where i.user_id = p.user_id) as items_count,
      (select count(*) from public.ai_usage a where a.user_id = p.user_id and a.created_at > now() - interval '24 hours') as ai_24h,
      (select count(*) from public.ai_usage a where a.user_id = p.user_id) as ai_total,
      e.code as plan_code,
      e.source as plan_source,
      e.until as plan_until,
      p.manual_plan,
      p.manual_until
    from public.profiles p
    join auth.users u on u.id = p.user_id
    cross join lateral public.effective_plan(p.user_id) e
    where (v_pattern is null or u.email ilike v_pattern escape '\')
      and (p_status is null or p.status = p_status)
  )
  select b.*, count(*) over () as total
  from base b
  where p_plan is null or b.plan_code = p_plan
  order by
    (b.status = 'pending') desc,
    case when p_sort = 'email' then b.email end asc,
    case when p_sort = 'items' then b.items_count end desc,
    case when p_sort = 'ai' then b.ai_24h end desc,
    case when p_sort = 'seen' then b.last_sign_in_at end desc nulls last,
    case when p_sort = 'old' then b.created_at end asc,
    b.created_at desc,
    b.user_id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.admin_list_users_v3(text, text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_users_v3(text, text, text, text, integer, integer) to authenticated;

-- 2. Numbers for the admin home screen. ----------------------------------------------------------
create function public.admin_overview()
returns table (users_count bigint, pending_count bigint, plans_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
  select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where status = 'pending'),
    (select count(*) from public.plans);
end;
$$;

revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- 3. Users per plan. ---------------------------------------------------------------------------
--   users_now:    whose effective plan it is right now (free includes everyone without a plan);
--   users_linked: who has it as a manual plan or a subscription plan, even an expired one.
--                 A plan with linked users cannot be deleted.
create function public.admin_plan_stats()
returns table (code text, users_now bigint, users_linked bigint)
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
  with eff as (
    select e.code from public.profiles p cross join lateral public.effective_plan(p.user_id) e
  )
  select
    pl.code,
    (select count(*) from eff where eff.code = pl.code),
    (select count(*) from public.profiles p where p.manual_plan = pl.code or p.subscription_plan = pl.code)
  from public.plans pl;
end;
$$;

revoke execute on function public.admin_plan_stats() from public, anon;
grant execute on function public.admin_plan_stats() to authenticated;

-- 4. A new plan, placed last. Code taken → 23505; bad values → the table's checks (23514). --------
create function public.admin_create_plan(
  p_code text,
  p_name_ru text,
  p_name_en text,
  p_item_limit integer,
  p_ai_daily_limit integer
)
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
  insert into public.plans (code, name_ru, name_en, item_limit, ai_daily_limit, sort_order)
  values (
    p_code,
    btrim(p_name_ru),
    btrim(p_name_en),
    p_item_limit,
    p_ai_daily_limit,
    coalesce((select max(sort_order) from public.plans), 0) + 10
  );
end;
$$;

revoke execute on function public.admin_create_plan(text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_create_plan(text, text, text, integer, integer) to authenticated;

-- 5. Delete a plan nobody is linked to. 'free' (everyone's fallback) never: P0011.
-- The foreign keys from profiles also refuse a linked plan (23503) if someone is assigned meanwhile.
create function public.admin_delete_plan(p_code text)
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
  if p_code = 'free' then
    raise exception 'the default plan cannot be deleted' using errcode = 'P0011';
  end if;
  perform 1 from public.plans where code = p_code for update;
  if not found then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.profiles where manual_plan = p_code or subscription_plan = p_code) then
    raise exception 'plan in use' using errcode = 'P0011';
  end if;
  delete from public.plans where code = p_code;
end;
$$;

revoke execute on function public.admin_delete_plan(text) from public, anon;
grant execute on function public.admin_delete_plan(text) to authenticated;

-- 6. New order of all plans at once: p_codes must list every plan exactly once. ------------------
create function public.admin_reorder_plans(p_codes text[])
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
  perform 1 from public.plans for update;
  if cardinality(p_codes) is distinct from (select count(*) from public.plans)
     or cardinality(p_codes) <> (select count(distinct c) from unnest(p_codes) c)
     or exists (select 1 from unnest(p_codes) c where c not in (select code from public.plans)) then
    raise exception 'the list must contain every plan once' using errcode = '22023';
  end if;
  update public.plans pl
  set sort_order = o.ord * 10
  from unnest(p_codes) with ordinality o(code, ord)
  where pl.code = o.code;
end;
$$;

revoke execute on function public.admin_reorder_plans(text[]) from public, anon;
grant execute on function public.admin_reorder_plans(text[]) to authenticated;
