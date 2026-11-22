-- Reverts supabase/migrations/20261122000000_languages.sql (languages v2, app 2.0.0).
-- Only for an emergency before the deferred drop of the old columns: the old columns
-- (name_ru, description_ru, tags, data_lang) were kept in step by triggers, so 1.11 keeps
-- working after this. Records created only in a language other than ru/en (e.g. Spanish
-- with no English yet) would violate the restored *_name_present check: they are given
-- their local text as English first.

begin;

drop function if exists public.admin_set_status_v2(uuid, text);
drop function if exists public.my_plan_v2();
drop function if exists public.admin_update_plan_v2(text, jsonb, integer, integer, integer);
drop function if exists public.admin_create_plan_v2(text, jsonb, integer, integer);
drop function if exists public.plan_names_valid(jsonb);
drop trigger if exists plans_sync_names on public.plans;
drop function if exists public.plans_sync_names();
alter table public.plans drop column if exists names;

drop view if exists public.location_paths_v2;
drop function if exists public.similar_items_v2(text[], text[], uuid, real);
drop function if exists public.search_items_v3(text[], uuid, uuid, integer);
drop index if exists public.items_search_text_v3_trgm_idx;
alter table public.items drop column if exists search_text_v3;

drop trigger if exists items_sync_lang on public.items;
drop trigger if exists locations_sync_lang on public.locations;
drop trigger if exists categories_sync_lang on public.categories;
drop function if exists public.items_sync_lang();
drop function if exists public.names_sync_lang();
drop function if exists public.owner_lang(uuid);

alter table public.items disable trigger items_set_updated_at;
update public.items set name_en = coalesce(name_en, name_local) where name_ru is null and name_en is null;
alter table public.items enable trigger items_set_updated_at;
update public.locations set name_en = coalesce(name_en, name_local) where name_ru is null and name_en is null;
update public.categories set name_en = coalesce(name_en, name_local) where name_ru is null and name_en is null;

alter table public.items      drop constraint items_name_present_v2;
alter table public.locations  drop constraint locations_name_present_v2;
alter table public.categories drop constraint categories_name_present_v2;
alter table public.items      add constraint items_name_present      check (name_ru is not null or name_en is not null);
alter table public.locations  add constraint locations_name_present  check (name_ru is not null or name_en is not null);
alter table public.categories add constraint categories_name_present check (name_ru is not null or name_en is not null);

alter table public.items drop column lang, drop column name_local, drop column description_local,
  drop column tags_local, drop column tags_en;
alter table public.locations drop column lang, drop column name_local;
alter table public.categories drop column lang, drop column name_local;

drop trigger if exists profiles_sync_lang on public.profiles;
drop function if exists public.profiles_sync_lang();
revoke update (lang, show_english) on public.profiles from authenticated;
alter table public.profiles drop column lang, drop column show_english;

drop function if exists public.tags_union(text[], text[]);
drop function if exists public.tags_split_en(text[], text);
drop function if exists public.tags_split_local(text[], text);
drop function if exists public.display_text(text, text, text, text);
drop function if exists public.normalize_search_v2(text);

-- Sign-up functions as in 20261119220000_data_languages.sql.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lang text := new.raw_user_meta_data ->> 'data_lang';
begin
  insert into public.profiles (user_id, data_lang)
  values (new.id, case when lang in ('en', 'ru') then lang else 'en' end);
  return new;
end;
$$;

create or replace function public.seed_default_categories(uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.categories (user_id, name_ru, name_en, sort_order)
  select
    uid,
    case when coalesce((select p.data_lang from public.profiles p where p.user_id = uid), 'ru_en') = 'en'
      then null else d.name_ru end,
    d.name_en,
    d.sort_order
  from (values
    ('Мебель',         'Furniture',        10),
    ('Инструменты',    'Tools',            20),
    ('Кухня',          'Kitchen',          30),
    ('Электроника',    'Electronics',      40),
    ('Одежда',         'Clothing',         50),
    ('Документы',      'Documents',        60),
    ('Хозтовары',      'Household',        70),
    ('Спорт и отдых',  'Sports & Leisure', 80),
    ('Личные вещи',    'Personal items',   90),
    ('Другое',         'Other',           100)
  ) as d (name_ru, name_en, sort_order);
$$;

commit;
