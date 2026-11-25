-- Reverse of owner_role_enforce.sql: the functions as they were in 2.5.x.
CREATE OR REPLACE FUNCTION public.is_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION public.delete_my_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$function$;

grant execute on function public.admin_check_delete(uuid) to authenticated;
grant execute on function public.admin_create_plan(text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_create_plan_v2(text, jsonb, integer, integer) to authenticated;
grant execute on function public.admin_delete_ai_price(text, date) to authenticated;
grant execute on function public.admin_delete_plan(text) to authenticated;
grant execute on function public.admin_list_users_v2() to authenticated;
grant execute on function public.admin_list_users_v3(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_list_users_v4(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_plan_stats() to authenticated;
grant execute on function public.admin_reorder_plans(text[]) to authenticated;
grant execute on function public.admin_set_ai_price(text, date, numeric, numeric, numeric) to authenticated;
grant execute on function public.admin_set_plan(uuid, text, timestamp with time zone) to authenticated;
grant execute on function public.admin_set_status(uuid, text) to authenticated;
grant execute on function public.admin_set_status_v2(uuid, text) to authenticated;
grant execute on function public.admin_set_storage_limit(bigint) to authenticated;
grant execute on function public.admin_update_plan(text, text, text, integer, integer, integer) to authenticated;
grant execute on function public.admin_update_plan_v2(text, jsonb, integer, integer, integer) to authenticated;
grant execute on function public.admin_usage_overview() to authenticated;
grant execute on function public.admin_usage_settings() to authenticated;
