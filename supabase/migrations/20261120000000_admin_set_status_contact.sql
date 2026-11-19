-- admin_set_status now tells the app whom to notify: the user's email, data language
-- (for the language of the email) and the status before the change (so an email is sent
-- only when the status really changed). Same checks as before. The return type changes,
-- so the function is dropped and created again, with its grants.

drop function public.admin_set_status(uuid, text);

create function public.admin_set_status(p_user_id uuid, p_status text)
returns table (email text, data_lang text, old_status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_status not in ('active', 'disabled') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot change own account' using errcode = '42501';
  end if;

  select p.status into v_old
  from public.profiles p
  where p.user_id = p_user_id and p.role <> 'admin'
  for update;

  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  update public.profiles
  set status = p_status, status_changed_at = now()
  where user_id = p_user_id;

  return query
  select u.email::text, p.data_lang, v_old
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where p.user_id = p_user_id;
end;
$$;

revoke execute on function public.admin_set_status(uuid, text) from public, anon;
grant execute on function public.admin_set_status(uuid, text) to authenticated;
