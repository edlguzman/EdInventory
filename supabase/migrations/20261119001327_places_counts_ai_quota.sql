-- Stage 4: item counts per place, 'translate' AI kind, atomic AI quota.

-- ---------------------------------------------------------------------------
-- ai_usage: new kind 'translate' (short names of places and categories)
-- ---------------------------------------------------------------------------

alter table public.ai_usage drop constraint ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('recognize', 'voice_place', 'search', 'translate'));

-- ---------------------------------------------------------------------------
-- consume_ai_quota: check the limit and record the call in one step.
-- Rolling 24-hour window, one shared limit for all kinds.
-- A per-user advisory lock makes parallel requests queue up, so they cannot
-- all pass the check before any of them is recorded.
--
-- SECURITY INVOKER: RLS applies, rows are written for auth.uid() only.
-- p_limit comes from the server (AI_DAILY_LIMIT_PER_USER). Calling this RPC
-- directly with a large limit gives nothing: the server makes its own call
-- with its own limit before every Gemini request.
-- ---------------------------------------------------------------------------

create function public.consume_ai_quota(p_kind text, p_limit integer)
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

revoke execute on function public.consume_ai_quota(text, integer) from public, anon;
grant execute on function public.consume_ai_quota(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- location_item_counts: items directly in a place and in it with all nested places.
-- security_invoker: RLS applies.
-- ---------------------------------------------------------------------------

create view public.location_item_counts
with (security_invoker = true)
as
with recursive closure (ancestor_id, descendant_id) as (
  select id, id from public.locations
  union all
  select c.ancestor_id, l.id
  from closure c
  join public.locations l on l.parent_id = c.descendant_id
),
direct as (
  select location_id, count(*)::integer as n
  from public.items
  where location_id is not null
  group by location_id
)
select
  c.ancestor_id as location_id,
  coalesce(sum(d.n) filter (where c.descendant_id = c.ancestor_id), 0)::integer as direct_items,
  coalesce(sum(d.n), 0)::integer as total_items
from closure c
left join direct d on d.location_id = c.descendant_id
group by c.ancestor_id;

revoke all on public.location_item_counts from anon;
grant select on public.location_item_counts to authenticated;
