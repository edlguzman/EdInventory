-- Plans (v1.6.0), PART 2 — RESTRICTING, deferred: apply only AFTER the v1.6.0 code is deployed.
-- Breaking for v1.5.0: it does not know the 'plan_limit' error (would show "unknown error"),
-- and it still calls admin_list_users / consume_ai_quota, which are dropped here.
-- Reverse: plans_enforce.down.sql.

-- 1. Item limit in the database: no insert past the effective plan's limit, whatever the client
-- (the app, a direct API call with the anon key, a batch insert). A row-level BEFORE trigger
-- sees the rows inserted earlier by the same statement, so a batch cannot overshoot either.
-- Lowering a plan deletes nothing: only new items are blocked.
create function public.items_enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function public.items_enforce_plan_limit() from public, anon, authenticated;

create trigger items_enforce_plan_limit
  before insert on public.items
  for each row execute function public.items_enforce_plan_limit();

-- 2. Old functions the new app no longer calls.
drop function public.admin_list_users();
drop function public.consume_ai_quota(text, integer);
