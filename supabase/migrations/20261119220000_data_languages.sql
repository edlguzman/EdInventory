-- Data languages: a per-user mode for the text of items, places and categories.
--   'en'    English only
--   'ru'    Russian only on screen; English is filled in automatically (AI) in the background
--   'ru_en' both languages (the original behavior)
-- Text in the other language is never deleted when the mode changes, only hidden.

-- ---------------------------------------------------------------------------
-- profiles.data_lang. Existing accounts keep both languages; new ones get the mode
-- chosen at sign-up from the interface language (see handle_new_user_profile).
-- Users may change this one column of their own row and nothing else.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column data_lang text not null default 'en' check (data_lang in ('en', 'ru', 'ru_en'));

update public.profiles set data_lang = 'ru_en';

create policy profiles_update_own_lang on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Column-level grant: status and role stay read-only for users.
grant update (data_lang) on public.profiles to authenticated;

-- Sign-up passes the mode in user metadata (options.data.data_lang). It is read only
-- here, once; afterwards profiles.data_lang is the only source.
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

-- ---------------------------------------------------------------------------
-- Names may now be empty in one language: name_ru and name_en are nullable, but
-- at least one is set. The existing length checks stay (a null passes a check).
-- Which name is required in which mode is enforced by the app (zod + server actions).
-- ---------------------------------------------------------------------------

alter table public.locations  alter column name_ru drop not null, alter column name_en drop not null;
alter table public.categories alter column name_ru drop not null, alter column name_en drop not null;
alter table public.items      alter column name_ru drop not null, alter column name_en drop not null;

alter table public.locations  add constraint locations_name_present  check (name_ru is not null or name_en is not null);
alter table public.categories add constraint categories_name_present check (name_ru is not null or name_en is not null);
alter table public.items      add constraint items_name_present      check (name_ru is not null or name_en is not null);

-- search_text concatenated name_ru || name_en: a null would null the whole text.
alter table public.items drop column search_text;
alter table public.items add column search_text text generated always as (
  public.normalize_search(
    coalesce(name_ru, '') || ' ' || coalesce(name_en, '') || ' ' ||
    coalesce(description_ru, '') || ' ' || coalesce(description_en, '') || ' ' ||
    public.immutable_text_array_to_string(tags, ' ')
  )
) stored;
create index items_search_text_trgm_idx on public.items using gin (search_text extensions.gin_trgm_ops);

-- Paths: each part in the requested language, or the other one if it is missing.
create or replace view public.location_paths
with (security_invoker = true)
as
with recursive paths as (
  select
    l.id,
    l.user_id,
    l.parent_id,
    0 as depth,
    coalesce(l.name_ru, l.name_en)::text as path_ru,
    coalesce(l.name_en, l.name_ru)::text as path_en,
    array[l.id] as id_path
  from public.locations l
  where l.parent_id is null
  union all
  select
    c.id,
    c.user_id,
    c.parent_id,
    p.depth + 1,
    p.path_ru || ' → ' || coalesce(c.name_ru, c.name_en),
    p.path_en || ' → ' || coalesce(c.name_en, c.name_ru),
    p.id_path || c.id
  from public.locations c
  join paths p on c.parent_id = p.id
)
select id, user_id, parent_id, depth, path_ru, path_en, id_path
from paths;

-- ---------------------------------------------------------------------------
-- Default categories by mode: English only for 'en', both languages otherwise.
-- The profile trigger (on_auth_user_created_profile) fires before this one
-- (triggers run in name order), so the mode is already known.
-- ---------------------------------------------------------------------------

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
