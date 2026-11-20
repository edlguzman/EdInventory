-- Plans (v1.6.0), PART 1 — SAFE for the running version (v1.5.0): a new table, new nullable
-- columns on profiles and new functions only. No existing function, policy or column changes.
-- The restricting part (the item-limit trigger, dropping the old functions) is deferred:
-- supabase/deferred/plans_enforce.sql, applied after the new code is deployed.

-- 1. Plans -------------------------------------------------------------------------------------
-- item_limit / ai_daily_limit: null = no limit (ai_daily_limit null = the app's fallback,
-- AI_DAILY_LIMIT_PER_USER). stripe_price_*: Stripe price ids for a future checkout (unused yet).
create table public.plans (
  code               text primary key check (code ~ '^[a-z0-9_]{1,32}$'),
  name_ru            text not null check (char_length(btrim(name_ru)) between 1 and 50),
  name_en            text not null check (char_length(btrim(name_en)) between 1 and 50),
  item_limit         integer check (item_limit is null or item_limit >= 0),
  ai_daily_limit     integer check (ai_daily_limit is null or ai_daily_limit >= 0),
  sort_order         integer not null default 0,
  stripe_price_month text unique,
  stripe_price_year  text unique,
  created_at         timestamptz not null default now()
);

insert into public.plans (code, name_ru, name_en, item_limit, ai_daily_limit, sort_order) values
  ('free',      'Free',      'Free',      200,  20,   10),
  ('plus',      'Plus',      'Plus',      500,  100,  20),
  ('pro',       'Pro',       'Pro',       1000, 300,  30),
  ('unlimited', 'Unlimited', 'Unlimited', null, 1000, 40);

alter table public.plans enable row level security;
-- Plan names and limits are not secret: active users may read them. Nobody writes directly;
-- admins change plans through admin_update_plan().
create policy plans_select_active on public.plans
  for select to authenticated using ((select public.is_active()));
revoke all on public.plans from anon, authenticated;
grant select on public.plans to authenticated;

-- 2. The user's plan: a manual plan (set by an admin) and a subscription (a future Stripe
-- webhook) are kept apart, so a subscription never overwrites the admin's decision.
-- Users cannot write any of these columns (their only column grant is data_lang).
alter table public.profiles
  add column manual_plan             text references public.plans (code) on update cascade,
  add column manual_until            timestamptz,
  add column subscription_plan       text references public.plans (code) on update cascade,
  add column subscription_status     text,
  add column subscription_period_end timestamptz,
  add column stripe_customer_id      text unique,
  add column stripe_subscription_id  text unique;

-- Admin accounts (the owner): no limits.
update public.profiles set manual_plan = 'unlimited' where role = 'admin';

-- 3. The effective plan: the only place it is computed.
--   manual plan, if set and not expired (manual_until null = no end);
--   else the subscription plan, if active/trialing (past_due: until the paid period ends);
--   else 'free'. An expired manual plan or subscription simply falls back: nothing is deleted.
-- Internal (security definer, not callable by users): wrappers below expose only the caller's own.
create function public.effective_plan(p_user uuid)
returns table (code text, source text, until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(m.code, s.code, 'free'),
    case when m.code is not null then 'manual' when s.code is not null then 'subscription' else 'default' end,
    case when m.code is not null then p.manual_until when s.code is not null then p.subscription_period_end end
  from (select 1) one
  left join public.profiles p on p.user_id = p_user
  left join lateral (
    select p.manual_plan as code
    where p.manual_plan is not null and (p.manual_until is null or p.manual_until > now())
  ) m on true
  left join lateral (
    select p.subscription_plan as code
    where p.subscription_plan is not null
      and p.subscription_period_end > now()
      and p.subscription_status in ('active', 'trialing', 'past_due')
  ) s on true;
$$;

revoke execute on function public.effective_plan(uuid) from public, anon, authenticated;

-- 4. The caller's plan for the app (Settings, limits in the UI).
create function public.my_plan()
returns table (
  code           text,
  name_ru        text,
  name_en        text,
  item_limit     integer,
  ai_daily_limit integer,
  source         text,
  until          timestamptz,
  items_count    bigint,
  ai_used_24h    bigint,
  is_admin       boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pl.code, pl.name_ru, pl.name_en, pl.item_limit, pl.ai_daily_limit, e.source, e.until,
    (select count(*) from public.items i where i.user_id = auth.uid()),
    (select count(*) from public.ai_usage a where a.user_id = auth.uid() and a.created_at > now() - interval '24 hours'),
    public.is_admin()
  from public.effective_plan(auth.uid()) e
  join public.plans pl on pl.code = e.code
  where public.is_active();
$$;

revoke execute on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- 5. AI quota by plan (replaces consume_ai_quota in the new app; the old one stays for v1.5.0).
-- Atomic per user (advisory lock). Returns 'ok' (recorded), 'limit' (daily AI limit reached)
-- or 'items_limit' (the user's items reached the plan's item limit: all AI is off). Nothing is
-- recorded unless 'ok'. Admins: recorded, never limited. Inactive account: error 42501.
create function public.consume_ai_quota_v2(p_kind text, p_fallback integer)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function public.consume_ai_quota_v2(text, integer) from public, anon;
grant execute on function public.consume_ai_quota_v2(text, integer) to authenticated;

-- 6. Admin: users with their plans (v2 of admin_list_users; the old one stays for v1.5.0).
create function public.admin_list_users_v2()
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
  manual_until    timestamptz
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
    (select count(*) from public.ai_usage a where a.user_id = p.user_id),
    e.code,
    e.source,
    e.until,
    p.manual_plan,
    p.manual_until
  from public.profiles p
  join auth.users u on u.id = p.user_id
  cross join lateral public.effective_plan(p.user_id) e
  order by u.created_at desc;
end;
$$;

revoke execute on function public.admin_list_users_v2() from public, anon;
grant execute on function public.admin_list_users_v2() to authenticated;

-- 7. Admin: set or clear a user's manual plan (p_plan null = clear; p_until null = no end).
-- Not the caller, not another admin.
create function public.admin_set_plan(p_user_id uuid, p_plan text, p_until timestamptz)
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
  if p_user_id = auth.uid() then
    raise exception 'cannot change own account' using errcode = '42501';
  end if;
  if p_plan is not null and not exists (select 1 from public.plans where code = p_plan) then
    raise exception 'unknown plan' using errcode = '22023';
  end if;
  if p_until is not null and p_until <= now() then
    raise exception 'end date in the past' using errcode = '22023';
  end if;

  update public.profiles
  set manual_plan = p_plan, manual_until = case when p_plan is null then null else p_until end
  where user_id = p_user_id and role <> 'admin';
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.admin_set_plan(uuid, text, timestamptz) from public, anon;
grant execute on function public.admin_set_plan(uuid, text, timestamptz) to authenticated;

-- 8. Admin: edit a plan's names, limits and order (takes effect at once, no rebuild).
create function public.admin_update_plan(
  p_code text,
  p_name_ru text,
  p_name_en text,
  p_item_limit integer,
  p_ai_daily_limit integer,
  p_sort_order integer
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
  update public.plans
  set name_ru = btrim(p_name_ru),
      name_en = btrim(p_name_en),
      item_limit = p_item_limit,
      ai_daily_limit = p_ai_daily_limit,
      sort_order = coalesce(p_sort_order, sort_order)
  where code = p_code;
  if not found then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.admin_update_plan(text, text, text, integer, integer, integer) from public, anon;
grant execute on function public.admin_update_plan(text, text, text, integer, integer, integer) to authenticated;
