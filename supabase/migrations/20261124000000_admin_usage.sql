-- Storage and AI usage for the admin (v2.4.0). Additive and safe for app 2.3.2:
--   ai_usage        + model, input_tokens, input_audio_tokens, output_tokens (nullable; 2.3.2 never writes them)
--   ai_prices       USD per million tokens, per model, from a date on (a price change does not
--                   rewrite the past); admin functions only
--   app_settings    one row: storage limit shown to the admin
--   consume_ai_quota_v3  = v2 that also returns the id of the recorded request
--   record_ai_tokens     tokens of the caller's own request, once, shortly after it
--   admin_*              numbers only (no items, places or photos); every one checks is_admin()
-- Existing functions are not changed. Rollback: supabase/deferred/admin_usage.down.sql.

begin;

-- ---------------------------------------------------------------------------
-- Tokens of a request
-- ---------------------------------------------------------------------------
alter table public.ai_usage
  add column model text check (char_length(model) between 1 and 100),
  add column input_tokens integer check (input_tokens between 0 and 10000000),
  add column input_audio_tokens integer check (input_audio_tokens between 0 and 10000000),
  add column output_tokens integer check (output_tokens between 0 and 10000000);

create index ai_usage_created_idx on public.ai_usage (created_at);

-- A user may insert rows of their own (insert policy), but never with tokens: those come only
-- from record_ai_tokens.
create function public.ai_usage_no_tokens_on_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.model := null;
  new.input_tokens := null;
  new.input_audio_tokens := null;
  new.output_tokens := null;
  return new;
end;
$$;

create trigger ai_usage_no_tokens before insert on public.ai_usage
  for each row execute function public.ai_usage_no_tokens_on_insert();

-- consume_ai_quota_v2 with the id of the recorded request (null when nothing was recorded).
create function public.consume_ai_quota_v3(p_kind text, p_fallback integer)
returns table (result text, usage_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Tokens of the caller's own request: once, within 15 minutes. Called with the user's session
-- (there is no other one), so a user could at most misstate their own numbers.
create function public.record_ai_tokens(p_usage_id uuid, p_model text, p_input integer, p_audio integer, p_output integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active() then
    raise exception 'account not active' using errcode = '42501';
  end if;
  update public.ai_usage
  set model = p_model,
      input_tokens = p_input,
      input_audio_tokens = least(coalesce(p_audio, 0), p_input),
      output_tokens = p_output
  where id = p_usage_id
    and user_id = auth.uid()
    and input_tokens is null
    and created_at > now() - interval '15 minutes'
    and p_model is not null and p_input is not null and p_output is not null;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Prices and settings (no access for users; the admin goes through functions)
-- ---------------------------------------------------------------------------
create table public.ai_prices (
  model text not null check (model ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  valid_from date not null,
  input_usd numeric(12, 6) not null check (input_usd between 0 and 10000),
  -- null: audio costs the same as the rest of the input.
  audio_usd numeric(12, 6) check (audio_usd between 0 and 10000),
  output_usd numeric(12, 6) not null check (output_usd between 0 and 10000),
  updated_at timestamptz not null default now(),
  primary key (model, valid_from)
);
alter table public.ai_prices enable row level security;
revoke all on public.ai_prices from public, anon, authenticated;

create table public.app_settings (
  id boolean primary key default true check (id),
  storage_limit_bytes bigint not null default 1073741824 check (storage_limit_bytes between 1048576 and 1099511627776000)
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from public, anon, authenticated;
insert into public.app_settings (id) values (true);

-- Requests since p_since with their cost at the price of their day. cost is null without tokens
-- or without a price. Internal: not callable by users.
create function public.ai_usage_costs(p_since timestamptz)
returns table (user_id uuid, kind text, has_tokens boolean, cost numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.user_id,
    a.kind,
    a.input_tokens is not null,
    (
      (a.input_tokens - coalesce(a.input_audio_tokens, 0)) * p.input_usd
      + coalesce(a.input_audio_tokens, 0) * coalesce(p.audio_usd, p.input_usd)
      + a.output_tokens * p.output_usd
    ) / 1000000
  from public.ai_usage a
  left join lateral (
    select x.input_usd, x.audio_usd, x.output_usd
    from public.ai_prices x
    where x.model = a.model and x.valid_from <= (a.created_at at time zone 'utc')::date
    order by x.valid_from desc
    limit 1
  ) p on true
  where a.created_at > p_since;
$$;

-- ---------------------------------------------------------------------------
-- Admin: numbers
-- ---------------------------------------------------------------------------
create function public.admin_usage_overview()
returns table (
  storage_bytes bigint,
  storage_limit_bytes bigint,
  db_bytes bigint,
  ai_requests_30d bigint,
  ai_active_users_30d bigint,
  ai_cost_30d numeric,
  ai_no_tokens_30d bigint,
  ai_no_price_30d bigint
)
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
    (select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint from storage.objects o),
    (select s.storage_limit_bytes from public.app_settings s),
    pg_database_size(current_database()),
    count(*),
    count(distinct c.user_id),
    coalesce(sum(c.cost), 0),
    count(*) filter (where not c.has_tokens),
    count(*) filter (where c.has_tokens and c.cost is null)
  from public.ai_usage_costs(now() - interval '30 days') c;
end;
$$;

-- admin_list_users_v3 plus storage (files in the user's folder) and AI over 30 days.
create function public.admin_list_users_v4(
  p_search text,
  p_status text,
  p_plan text,
  p_sort text,
  p_limit integer,
  p_offset integer
)
returns table (
  user_id uuid,
  email text,
  status text,
  role text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  items_count bigint,
  ai_24h bigint,
  ai_total bigint,
  plan_code text,
  plan_source text,
  plan_until timestamptz,
  manual_plan text,
  manual_until timestamptz,
  storage_bytes bigint,
  ai_30d bigint,
  ai_cost_30d numeric,
  ai_no_tokens_30d bigint,
  ai_no_price_30d bigint,
  ai_kinds_30d jsonb,
  total bigint
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
  with files as (
    select split_part(o.name, '/', 1) as folder, sum((o.metadata ->> 'size')::bigint)::bigint as bytes
    from storage.objects o
    where o.bucket_id = 'item-photos'
    group by 1
  ),
  by_kind as (
    select
      c.user_id as uid,
      c.kind as k,
      count(*) as n,
      sum(c.cost) as cost,
      count(*) filter (where not c.has_tokens) as no_tokens,
      count(*) filter (where c.has_tokens and c.cost is null) as no_price
    from public.ai_usage_costs(now() - interval '30 days') c
    group by 1, 2
  ),
  ai as (
    select
      b.uid,
      sum(b.n)::bigint as n,
      coalesce(sum(b.cost), 0) as cost,
      sum(b.no_tokens)::bigint as no_tokens,
      sum(b.no_price)::bigint as no_price,
      jsonb_agg(jsonb_build_object('kind', b.k, 'n', b.n, 'cost', b.cost) order by b.n desc, b.k) as kinds
    from by_kind b
    group by b.uid
  ),
  base as (
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
      p.manual_until,
      coalesce(f.bytes, 0) as storage_bytes,
      coalesce(ai.n, 0) as ai_30d,
      coalesce(ai.cost, 0) as ai_cost_30d,
      coalesce(ai.no_tokens, 0) as ai_no_tokens_30d,
      coalesce(ai.no_price, 0) as ai_no_price_30d,
      coalesce(ai.kinds, '[]'::jsonb) as ai_kinds_30d
    from public.profiles p
    join auth.users u on u.id = p.user_id
    cross join lateral public.effective_plan(p.user_id) e
    left join files f on f.folder = p.user_id::text
    left join ai on ai.uid = p.user_id
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
    case when p_sort = 'storage' then b.storage_bytes end desc,
    case when p_sort = 'ai' then b.ai_24h end desc,
    case when p_sort = 'seen' then b.last_sign_in_at end desc nulls last,
    case when p_sort = 'old' then b.created_at end asc,
    b.created_at desc,
    b.user_id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: prices and the storage limit
-- ---------------------------------------------------------------------------
create function public.admin_usage_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'storage_limit_bytes', (select s.storage_limit_bytes from public.app_settings s),
    'prices', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'model', p.model, 'valid_from', p.valid_from, 'input', p.input_usd, 'audio', p.audio_usd, 'output', p.output_usd
      ) order by p.model, p.valid_from desc), '[]'::jsonb)
      from public.ai_prices p
    ),
    'models', (select coalesce(jsonb_agg(m.model order by m.model), '[]'::jsonb) from (select distinct a.model from public.ai_usage a where a.model is not null) m)
  );
end;
$$;

create function public.admin_set_ai_price(p_model text, p_valid_from date, p_input numeric, p_audio numeric, p_output numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_model is null or p_valid_from is null or p_input is null or p_output is null then
    raise exception 'invalid price' using errcode = '22023';
  end if;
  insert into public.ai_prices (model, valid_from, input_usd, audio_usd, output_usd)
  values (p_model, p_valid_from, p_input, p_audio, p_output)
  on conflict (model, valid_from) do update
    set input_usd = excluded.input_usd, audio_usd = excluded.audio_usd, output_usd = excluded.output_usd, updated_at = now();
end;
$$;

create function public.admin_delete_ai_price(p_model text, p_valid_from date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  delete from public.ai_prices where model = p_model and valid_from = p_valid_from;
  if not found then
    raise exception 'price not found' using errcode = 'P0002';
  end if;
end;
$$;

create function public.admin_set_storage_limit(p_bytes bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_bytes is null then
    raise exception 'invalid limit' using errcode = '22023';
  end if;
  update public.app_settings set storage_limit_bytes = p_bytes where id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.ai_usage_no_tokens_on_insert() from public, anon, authenticated;
revoke execute on function public.ai_usage_costs(timestamptz) from public, anon, authenticated;

revoke execute on function public.consume_ai_quota_v3(text, integer) from public, anon;
revoke execute on function public.record_ai_tokens(uuid, text, integer, integer, integer) from public, anon;
revoke execute on function public.admin_usage_overview() from public, anon;
revoke execute on function public.admin_list_users_v4(text, text, text, text, integer, integer) from public, anon;
revoke execute on function public.admin_usage_settings() from public, anon;
revoke execute on function public.admin_set_ai_price(text, date, numeric, numeric, numeric) from public, anon;
revoke execute on function public.admin_delete_ai_price(text, date) from public, anon;
revoke execute on function public.admin_set_storage_limit(bigint) from public, anon;

grant execute on function public.consume_ai_quota_v3(text, integer) to authenticated;
grant execute on function public.record_ai_tokens(uuid, text, integer, integer, integer) to authenticated;
grant execute on function public.admin_usage_overview() to authenticated;
grant execute on function public.admin_list_users_v4(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_usage_settings() to authenticated;
grant execute on function public.admin_set_ai_price(text, date, numeric, numeric, numeric) to authenticated;
grant execute on function public.admin_delete_ai_price(text, date) to authenticated;
grant execute on function public.admin_set_storage_limit(bigint) to authenticated;

commit;
