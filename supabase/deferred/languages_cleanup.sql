-- DEFERRED (breaking for app 1.11): apply only after 2.0.0 is in production and with the
-- user's explicit "yes". Move to supabase/migrations/ with a new timestamp at that time.
-- Rollback: languages_cleanup.down.sql (re-creates the old columns from the new ones).
--
-- Drops the RU/EN-era columns and everything that kept them in step with the new model:
--   items: name_ru, description_ru, tags, search_text, search_text_v2
--   locations, categories: name_ru
--   profiles: data_lang
-- plus the old search functions, the old view, the sync triggers and admin_set_status.
-- plans.name_ru / name_en stay (admin *_v2 functions keep them filled; harmless).

begin;

-- Sync triggers (1.11 compatibility) and their functions.
drop trigger if exists items_sync_lang on public.items;
drop trigger if exists locations_sync_lang on public.locations;
drop trigger if exists categories_sync_lang on public.categories;
drop trigger if exists profiles_sync_lang on public.profiles;
drop function if exists public.items_sync_lang();
drop function if exists public.names_sync_lang();
drop function if exists public.profiles_sync_lang();
drop function if exists public.owner_lang(uuid);

-- Old search, duplicate check, paths, status function.
drop function if exists public.search_items(text[], uuid, uuid, integer);
drop function if exists public.search_items_v2(text[], uuid, uuid, integer);
drop function if exists public.similar_items(text[], text[], uuid, real);
drop function if exists public.admin_set_status(uuid, text);
drop view if exists public.location_paths;
drop index if exists public.items_search_text_trgm_idx;
drop index if exists public.items_search_text_v2_trgm_idx;
alter table public.items drop column search_text, drop column search_text_v2;

-- Views and sign-up functions without the old columns.
create or replace view public.location_paths_v2
with (security_invoker = true)
as
with recursive paths as (
  select
    l.id,
    l.user_id,
    l.parent_id,
    0 as depth,
    public.display_text(l.lang, p.lang, l.name_local, l.name_en)::text as path_local,
    coalesce(l.name_en, l.name_local)::text as path_en,
    array[l.id] as id_path
  from public.locations l
  left join public.profiles p on p.user_id = l.user_id
  where l.parent_id is null
  union all
  select
    c.id,
    c.user_id,
    c.parent_id,
    pa.depth + 1,
    pa.path_local || ' → ' || public.display_text(c.lang, p.lang, c.name_local, c.name_en),
    pa.path_en || ' → ' || coalesce(c.name_en, c.name_local),
    pa.id_path || c.id
  from public.locations c
  join paths pa on c.parent_id = pa.id
  left join public.profiles p on p.user_id = c.user_id
)
select id, user_id, parent_id, depth, path_local, path_en, id_path
from paths;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta_lang text := new.raw_user_meta_data ->> 'lang';
  old_mode text := new.raw_user_meta_data ->> 'data_lang';
begin
  insert into public.profiles (user_id, lang, show_english)
  values (
    new.id,
    case
      when meta_lang ~ '^[a-z]{2,3}$' then meta_lang
      when old_mode in ('en', 'ru') then old_mode
      else 'en'
    end,
    false
  );
  return new;
end;
$$;

create or replace function public.seed_default_categories(uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  with me as (
    select case when l.lang in ('ru', 'es') then l.lang else 'en' end as lang
    from (select coalesce((select p.lang from public.profiles p where p.user_id = uid), 'en') as lang) l
  )
  insert into public.categories (user_id, lang, name_local, name_en, sort_order)
  select
    uid,
    me.lang,
    case me.lang when 'ru' then d.name_ru when 'es' then d.name_es end,
    d.name_en,
    d.sort_order
  from me, (values
    ('Мебель',         'Furniture',        'Muebles',              10),
    ('Инструменты',    'Tools',            'Herramientas',         20),
    ('Кухня',          'Kitchen',          'Cocina',               30),
    ('Электроника',    'Electronics',      'Electrónica',          40),
    ('Одежда',         'Clothing',         'Ropa',                 50),
    ('Документы',      'Documents',        'Documentos',           60),
    ('Хозтовары',      'Household',        'Artículos del hogar',  70),
    ('Спорт и отдых',  'Sports & Leisure', 'Deporte y ocio',       80),
    ('Личные вещи',    'Personal items',   'Objetos personales',   90),
    ('Другое',         'Other',            'Otros',               100)
  ) as d (name_ru, name_en, name_es, sort_order);
$$;

-- Names: own language or English (name_ru is gone).
alter table public.items      drop constraint items_name_present_v2;
alter table public.locations  drop constraint locations_name_present_v2;
alter table public.categories drop constraint categories_name_present_v2;

alter table public.items drop column name_ru, drop column description_ru, drop column tags;
alter table public.locations drop column name_ru;
alter table public.categories drop column name_ru;

alter table public.items      add constraint items_name_present_v3      check (name_local is not null or name_en is not null);
alter table public.locations  add constraint locations_name_present_v3  check (name_local is not null or name_en is not null);
alter table public.categories add constraint categories_name_present_v3 check (name_local is not null or name_en is not null);

-- Every record has a language (2.0 always writes it; the triggers filled 1.11's rows).
alter table public.items      alter column lang set not null;
alter table public.locations  alter column lang set not null;
alter table public.categories alter column lang set not null;

-- Profiles: only lang + show_english.
alter table public.profiles drop column data_lang;

commit;
