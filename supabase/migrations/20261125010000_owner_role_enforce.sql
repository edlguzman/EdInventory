-- The owner role, part 2. BREAKING for 2.5.x: apply after 2.6.0 is live
-- (dump, the owner's "yes", db push). Reverse: owner_role_enforce.down.sql, before rolling the code back.

-- 1. The admin functions of 2.5.x (they know no owner): only the new ones may call them.
revoke execute on function public.admin_check_delete(uuid) from authenticated;
revoke execute on function public.admin_create_plan(text, text, text, integer, integer) from authenticated;
revoke execute on function public.admin_create_plan_v2(text, jsonb, integer, integer) from authenticated;
revoke execute on function public.admin_delete_ai_price(text, date) from authenticated;
revoke execute on function public.admin_delete_plan(text) from authenticated;
revoke execute on function public.admin_list_users_v2() from authenticated;
revoke execute on function public.admin_list_users_v3(text, text, text, text, integer, integer) from authenticated;
revoke execute on function public.admin_list_users_v4(text, text, text, text, integer, integer) from authenticated;
revoke execute on function public.admin_overview() from authenticated;
revoke execute on function public.admin_plan_stats() from authenticated;
revoke execute on function public.admin_reorder_plans(text[]) from authenticated;
revoke execute on function public.admin_set_ai_price(text, date, numeric, numeric, numeric) from authenticated;
revoke execute on function public.admin_set_plan(uuid, text, timestamp with time zone) from authenticated;
revoke execute on function public.admin_set_status(uuid, text) from authenticated;
revoke execute on function public.admin_set_status_v2(uuid, text) from authenticated;
revoke execute on function public.admin_set_storage_limit(bigint) from authenticated;
revoke execute on function public.admin_update_plan(text, text, text, integer, integer, integer) from authenticated;
revoke execute on function public.admin_update_plan_v2(text, jsonb, integer, integer, integer) from authenticated;
revoke execute on function public.admin_usage_overview() from authenticated;
revoke execute on function public.admin_usage_settings() from authenticated;

-- 2. Deleting the own account: not the owner (there must always be one).
create or replace function public.delete_my_account()
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
  if exists (select 1 from public.profiles where user_id = uid and is_owner) then
    raise exception 'the owner cannot delete their account' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;
