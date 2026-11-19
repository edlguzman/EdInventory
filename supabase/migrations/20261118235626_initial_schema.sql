-- Initial schema: locations, categories, items, item_photos, ai_usage.
-- Every table: user_id -> auth.users (on delete cascade) + RLS "user_id = auth.uid()".
--
-- Cross-user safety: foreign keys are composite (id, user_id), so a row can only
-- reference a parent/location/category/item of the SAME user. A plain FK on id
-- alone would be checked without RLS and would let a user attach rows to another
-- user's data by guessing a uuid.

-- ---------------------------------------------------------------------------
-- Extensions and helpers
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;

-- array_to_string() is STABLE, so it cannot be used in a generated column.
-- For text[] it is in fact immutable; this wrapper declares that.
create function public.immutable_text_array_to_string(arr text[], sep text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$ select array_to_string(arr, sep) $$;

-- Normalization for search: lower case and "ё" -> "е".
-- The app must normalize search terms the same way.
create function public.normalize_search(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$ select replace(lower(t), 'ё', 'е') $$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- locations: tree of places of any depth
-- ---------------------------------------------------------------------------

create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id   uuid,
  name_ru     text not null check (char_length(btrim(name_ru)) between 1 and 200),
  name_en     text not null check (char_length(btrim(name_en)) between 1 and 200),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint locations_id_user_key unique (id, user_id),
  constraint locations_parent_fkey foreign key (parent_id, user_id)
    references public.locations (id, user_id) on delete restrict,
  constraint locations_not_own_parent check (parent_id is null or parent_id <> id)
);

create index locations_user_parent_idx on public.locations (user_id, parent_id);
create index locations_parent_idx on public.locations (parent_id);

-- Forbid cycles: a place cannot become a descendant of itself.
-- Only an UPDATE of parent_id can create a cycle (a new row has a fresh id).
create function public.locations_prevent_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  -- Serialize tree moves per user so two concurrent moves cannot form a cycle.
  perform pg_advisory_xact_lock(hashtextextended('locations_tree:' || new.user_id::text, 0));

  if exists (
    with recursive ancestors (id) as (
      select new.parent_id
      union
      select l.parent_id
      from public.locations l
      join ancestors a on l.id = a.id
      where l.parent_id is not null
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'location % cannot be moved inside its own descendant', new.id
      using errcode = 'check_violation', hint = 'location_cycle';
  end if;

  return new;
end;
$$;

create trigger locations_prevent_cycle
  before update of parent_id on public.locations
  for each row
  when (new.parent_id is distinct from old.parent_id)
  execute function public.locations_prevent_cycle();

-- Id of the place and of all its descendants (for the "everything at the dacha" filter).
-- SECURITY INVOKER: RLS applies, a user only ever sees their own places.
create function public.location_descendants(loc_id uuid)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  with recursive tree (id) as (
    select id from public.locations where id = loc_id
    union
    select l.id
    from public.locations l
    join tree t on l.parent_id = t.id
  )
  select id from tree;
$$;

-- Full path of every place in both languages: "Дача → Гараж → Стеллаж".
-- security_invoker: the view runs with the caller's rights, so RLS applies.
create view public.location_paths
with (security_invoker = true)
as
with recursive paths as (
  select
    l.id,
    l.user_id,
    l.parent_id,
    0 as depth,
    l.name_ru::text as path_ru,
    l.name_en::text as path_en,
    array[l.id] as id_path
  from public.locations l
  where l.parent_id is null
  union all
  select
    c.id,
    c.user_id,
    c.parent_id,
    p.depth + 1,
    p.path_ru || ' → ' || c.name_ru,
    p.path_en || ' → ' || c.name_en,
    p.id_path || c.id
  from public.locations c
  join paths p on c.parent_id = p.id
)
select id, user_id, parent_id, depth, path_ru, path_en, id_path
from paths;

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name_ru     text not null check (char_length(btrim(name_ru)) between 1 and 100),
  name_en     text not null check (char_length(btrim(name_en)) between 1 and 100),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint categories_id_user_key unique (id, user_id)
);

create index categories_user_idx on public.categories (user_id, sort_order);

-- Default set of categories for a user.
-- SECURITY DEFINER because it runs from a trigger on auth.users (no user session there).
-- Not callable by clients: execute is revoked below.
create function public.seed_default_categories(uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.categories (user_id, name_ru, name_en, sort_order)
  select uid, d.name_ru, d.name_en, d.sort_order
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

create function public.handle_new_user_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_default_categories(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created_seed_categories
  after insert on auth.users
  for each row
  execute function public.handle_new_user_categories();

revoke execute on function public.seed_default_categories(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user_categories() from public, anon, authenticated;

-- Users who registered before this migration (stage 2) get the default set too.
select public.seed_default_categories(u.id)
from auth.users u
where not exists (select 1 from public.categories c where c.user_id = u.id);

-- ---------------------------------------------------------------------------
-- items
-- ---------------------------------------------------------------------------

create table public.items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  location_id     uuid,
  category_id     uuid,
  name_ru         text not null check (char_length(btrim(name_ru)) between 1 and 200),
  name_en         text not null check (char_length(btrim(name_en)) between 1 and 200),
  description_ru  text check (char_length(description_ru) <= 2000),
  description_en  text check (char_length(description_en) <= 2000),
  tags            text[] not null default '{}' check (cardinality(tags) <= 50),
  search_text     text generated always as (
    public.normalize_search(
      name_ru || ' ' || name_en || ' ' ||
      coalesce(description_ru, '') || ' ' || coalesce(description_en, '') || ' ' ||
      public.immutable_text_array_to_string(tags, ' ')
    )
  ) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint items_id_user_key unique (id, user_id),
  constraint items_location_fkey foreign key (location_id, user_id)
    references public.locations (id, user_id) on delete restrict,
  -- Deleting a category clears only category_id (user_id stays).
  constraint items_category_fkey foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete set null (category_id)
);

create index items_user_created_idx on public.items (user_id, created_at desc);
create index items_location_idx on public.items (location_id);
create index items_category_idx on public.items (category_id);
create index items_search_text_trgm_idx on public.items using gin (search_text extensions.gin_trgm_ops);

create trigger items_set_updated_at
  before update on public.items
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- item_photos
-- ---------------------------------------------------------------------------

create table public.item_photos (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null,
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  storage_path  text not null unique,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint item_photos_item_fkey foreign key (item_id, user_id)
    references public.items (id, user_id) on delete cascade,
  -- Path format: {user_id}/{item_id}/{uuid}.jpg
  constraint item_photos_path_format check (
    storage_path like user_id::text || '/' || item_id::text || '/%.jpg'
  )
);

create index item_photos_item_idx on public.item_photos (item_id);
create index item_photos_user_idx on public.item_photos (user_id);
-- At most one primary photo per item.
create unique index item_photos_one_primary_idx on public.item_photos (item_id) where is_primary;

-- ---------------------------------------------------------------------------
-- ai_usage: Gemini calls, for the daily limit
-- ---------------------------------------------------------------------------

create table public.ai_usage (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  kind        text not null check (kind in ('recognize', 'voice_place', 'search')),
  created_at  timestamptz not null default now()
);

create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- (select auth.uid()) instead of auth.uid(): evaluated once per query, not per row.

alter table public.locations   enable row level security;
alter table public.categories  enable row level security;
alter table public.items       enable row level security;
alter table public.item_photos enable row level security;
alter table public.ai_usage    enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['locations', 'categories', 'items', 'item_photos'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end;
$$;

-- ai_usage: select and insert only. With update/delete a user could wipe their own
-- usage rows through the public API (the anon key is in the browser) and bypass the limit.
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));
create policy ai_usage_insert_own on public.ai_usage
  for insert to authenticated with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants (explicit, not relying on project defaults). anon gets nothing.
-- ---------------------------------------------------------------------------

revoke all on public.locations, public.categories, public.items, public.item_photos, public.ai_usage, public.location_paths
  from anon;

grant select, insert, update, delete on public.locations, public.categories, public.items, public.item_photos
  to authenticated;
grant select, insert on public.ai_usage to authenticated;
grant select on public.location_paths to authenticated;

revoke execute on function public.location_descendants(uuid) from public, anon;
grant execute on function public.location_descendants(uuid) to authenticated;
