-- Reverts supabase/deferred/languages_cleanup.sql: the RU/EN-era columns come back, filled
-- from the new ones, with the triggers that keep them in step, so app 1.11 works again.
-- Russian text exists only for records in Russian (lang 'ru'); others get name_ru null.
-- Definitions are copied from 20261122000000_languages.sql and the schema before 2.0.0.

begin;

alter table public.items      alter column lang drop not null;
alter table public.locations  alter column lang drop not null;
alter table public.categories alter column lang drop not null;

alter table public.items
  add column name_ru text check (char_length(btrim(name_ru)) between 1 and 200),
  add column description_ru text check (char_length(description_ru) <= 2000),
  add column tags text[] not null default '{}' check (cardinality(tags) <= 50);
alter table public.locations add column name_ru text check (char_length(btrim(name_ru)) between 1 and 200);
alter table public.categories add column name_ru text check (char_length(btrim(name_ru)) between 1 and 100);
alter table public.profiles add column data_lang text not null default 'en' check (data_lang in ('en', 'ru', 'ru_en'));
grant update (data_lang) on public.profiles to authenticated;

alter table public.items disable trigger items_set_updated_at;
update public.items set
  name_ru = case when lang = 'ru' then name_local end,
  description_ru = case when lang = 'ru' then description_local end,
  tags = public.tags_union(tags_local, tags_en),
  -- 1.11 needs a Russian or English name.
  name_en = coalesce(name_en, case when lang <> 'ru' then name_local end);
alter table public.items enable trigger items_set_updated_at;
update public.locations set name_ru = case when lang = 'ru' then name_local end,
  name_en = coalesce(name_en, case when lang <> 'ru' then name_local end);
update public.categories set name_ru = case when lang = 'ru' then name_local end,
  name_en = coalesce(name_en, case when lang <> 'ru' then name_local end);
update public.profiles set data_lang = case when lang = 'ru' and show_english then 'ru_en' when lang = 'ru' then 'ru' else 'en' end;

alter table public.items      drop constraint items_name_present_v3;
alter table public.locations  drop constraint locations_name_present_v3;
alter table public.categories drop constraint categories_name_present_v3;
alter table public.items      add constraint items_name_present_v2      check (coalesce(name_local, name_en, name_ru) is not null);
alter table public.locations  add constraint locations_name_present_v2  check (coalesce(name_local, name_en, name_ru) is not null);
alter table public.categories add constraint categories_name_present_v2 check (coalesce(name_local, name_en, name_ru) is not null);

-- Old search columns and functions.
alter table public.items add column search_text text generated always as (
  public.normalize_search(
    coalesce(name_ru, '') || ' ' || coalesce(name_en, '') || ' ' ||
    coalesce(description_ru, '') || ' ' || coalesce(description_en, '') || ' ' ||
    public.immutable_text_array_to_string(tags, ' ')
  )
) stored;
create index items_search_text_trgm_idx on public.items using gin (search_text extensions.gin_trgm_ops);
alter table public.items add column search_text_v2 text generated always as (
  public.normalize_search(
    coalesce(name_ru, '') || ' ' || coalesce(name_en, '') || ' ' ||
    coalesce(description_ru, '') || ' ' || coalesce(description_en, '') || ' ' ||
    public.immutable_text_array_to_string(tags, ' ') || ' ' ||
    coalesce(book_author, '') || ' ' || coalesce(book_isbn, '')
  )
) stored;
create index items_search_text_v2_trgm_idx on public.items using gin (search_text_v2 extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION "public"."search_items"("p_terms" "text"[], "p_location_id" "uuid" DEFAULT NULL::"uuid", "p_category_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "score" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with terms as (
    select distinct public.normalize_search(btrim(raw)) as term
    from unnest(coalesce(p_terms, '{}')) as raw
    where char_length(btrim(raw)) between 1 and 60
    limit 30
  ),
  patterns as (
    select
      term,
      -- Escape LIKE wildcards in user input.
      '%' || replace(replace(replace(
        case when char_length(term) >= 5 then left(term, -1) else term end,
        '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
    from terms
  ),
  scope as (
    select public.location_descendants(p_location_id) as id
    where p_location_id is not null
  )
  select i.id, count(p.term)::integer as score
  from public.items i
  join patterns p on i.search_text like p.pattern
  where (p_category_id is null or i.category_id = p_category_id)
    and (p_location_id is null or i.location_id in (select s.id from scope s))
  group by i.id, i.created_at
  order by count(p.term) desc, i.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

CREATE OR REPLACE FUNCTION "public"."search_items_v2"("p_terms" "text"[], "p_location_id" "uuid" DEFAULT NULL::"uuid", "p_category_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "score" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $_$
  with raw_terms as (
    select public.normalize_search(btrim(raw)) as term
    from unnest(coalesce(p_terms, '{}')) as raw
    where char_length(btrim(raw)) between 1 and 60
  ),
  terms as (
    select distinct
      case
        when term ~ '^[0-9x][0-9x -]*$'
             and regexp_replace(term, '[^0-9x]', '', 'g') ~ '^([0-9]{9}[0-9x]|[0-9]{13})$'
        then regexp_replace(term, '[^0-9x]', '', 'g')
        else term
      end as term
    from raw_terms
    limit 30
  ),
  patterns as (
    select
      term,
      -- Escape LIKE wildcards in user input.
      '%' || replace(replace(replace(
        case when char_length(term) >= 5 and term !~ '^[0-9x]+$' then left(term, -1) else term end,
        '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
    from terms
  ),
  scope as (
    select public.location_descendants(p_location_id) as id
    where p_location_id is not null
  )
  select i.id, count(p.term)::integer as score
  from public.items i
  join patterns p on i.search_text_v2 like p.pattern
  where (p_category_id is null or i.category_id = p_category_id)
    and (p_location_id is null or i.location_id in (select s.id from scope s))
  group by i.id, i.created_at
  order by count(p.term) desc, i.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$_$;

CREATE OR REPLACE FUNCTION "public"."similar_items"("p_names_ru" "text"[], "p_names_en" "text"[], "p_location_id" "uuid" DEFAULT NULL::"uuid", "p_min" real DEFAULT 0.4) RETURNS TABLE("idx" integer, "item_id" "uuid", "score" real, "in_place" boolean)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with input as (
    select
      t.ord::integer as idx,
      public.normalize_search(btrim(coalesce(t.ru, ''))) as ru,
      public.normalize_search(btrim(coalesce(t.en, ''))) as en
    from unnest(coalesce(p_names_ru, '{}'), coalesce(p_names_en, '{}')) with ordinality as t(ru, en, ord)
    where t.ord <= 30
  ),
  scope as (
    select public.location_descendants(p_location_id) as id
    where p_location_id is not null
  ),
  candidates as (
    select
      i.id,
      public.normalize_search(coalesce(i.name_ru, '')) as ru,
      public.normalize_search(coalesce(i.name_en, '')) as en,
      coalesce(i.location_id in (select s.id from scope s), false) as in_place
    from public.items i
  )
  -- One best match per input: in the place first, then the highest score.
  select distinct on (inp.idx) inp.idx, m.id, m.score, m.in_place
  from input inp
  cross join lateral (
    select c.id, c.in_place,
      greatest(
        case when inp.ru <> '' and c.ru <> '' then extensions.similarity(inp.ru, c.ru) else 0 end,
        case when inp.en <> '' and c.en <> '' then extensions.similarity(inp.en, c.en) else 0 end
      )::real as score
    from candidates c
  ) m
  where m.score >= greatest(coalesce(p_min, 0.4), 0.2)
  order by inp.idx, m.in_place desc, m.score desc;
$$;

CREATE OR REPLACE FUNCTION "public"."admin_set_status"("p_user_id" "uuid", "p_status" "text") RETURNS TABLE("email" "text", "data_lang" "text", "old_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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

revoke execute on function public.search_items(text[], uuid, uuid, integer) from public, anon;
grant execute on function public.search_items(text[], uuid, uuid, integer) to authenticated;
revoke execute on function public.search_items_v2(text[], uuid, uuid, integer) from public, anon;
grant execute on function public.search_items_v2(text[], uuid, uuid, integer) to authenticated;
revoke execute on function public.similar_items(text[], text[], uuid, real) from public, anon;
grant execute on function public.similar_items(text[], text[], uuid, real) to authenticated;
revoke execute on function public.admin_set_status(uuid, text) from public, anon;
grant execute on function public.admin_set_status(uuid, text) to authenticated;

-- Old paths view (1.11) and the 2.0 view with the name_ru fallback.
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


revoke all on public.location_paths from anon, authenticated;
grant select on public.location_paths to authenticated;

create or replace view public.location_paths_v2
with (security_invoker = true)
as
with recursive paths as (
  select
    l.id,
    l.user_id,
    l.parent_id,
    0 as depth,
    public.display_text(l.lang, p.lang, l.name_local, coalesce(l.name_en, l.name_ru))::text as path_local,
    coalesce(l.name_en, l.name_local, l.name_ru)::text as path_en,
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
    pa.path_local || ' → ' || public.display_text(c.lang, p.lang, c.name_local, coalesce(c.name_en, c.name_ru)),
    pa.path_en || ' → ' || coalesce(c.name_en, c.name_local, c.name_ru),
    pa.id_path || c.id
  from public.locations c
  join paths pa on c.parent_id = pa.id
  left join public.profiles p on p.user_id = c.user_id
)
select id, user_id, parent_id, depth, path_local, path_en, id_path
from paths;


-- Sync triggers.
-- 1.11 writes data_lang, 2.0 writes lang / show_english: keep them in step.
create function public.profiles_sync_lang()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.lang is distinct from old.lang or new.show_english is distinct from old.show_english then
    new.data_lang := case
      when new.lang = 'ru' and new.show_english then 'ru_en'
      when new.lang = 'ru' then 'ru'
      else 'en'
    end;
  elsif new.data_lang is distinct from old.data_lang then
    new.lang := case new.data_lang when 'en' then 'en' else 'ru' end;
    new.show_english := new.data_lang = 'ru_en';
  end if;
  return new;
end;
$$;

create trigger profiles_sync_lang
  before update on public.profiles
  for each row execute function public.profiles_sync_lang();


create function public.owner_lang(uid uuid)
returns text
language sql stable security definer
set search_path = ''
as $$ select coalesce((select p.lang from public.profiles p where p.user_id = uid), 'en') $$;

revoke execute on function public.owner_lang(uuid) from public, anon, authenticated;

create function public.names_sync_lang()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lang is null then
    new.lang := public.owner_lang(new.user_id);
  end if;
  if new.lang = 'ru' then
    if tg_op = 'INSERT' then
      if new.name_local is null then new.name_local := new.name_ru; else new.name_ru := new.name_local; end if;
    elsif new.name_local is distinct from old.name_local or new.lang is distinct from old.lang then
      new.name_ru := new.name_local;
    elsif new.name_ru is distinct from old.name_ru then
      new.name_local := new.name_ru;
    end if;
  end if;
  return new;
end;
$$;

create function public.items_sync_lang()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_wrote_local boolean;
begin
  if new.lang is null then
    new.lang := public.owner_lang(new.user_id);
  end if;

  if new.lang = 'ru' then
    if tg_op = 'INSERT' then
      if new.name_local is null then new.name_local := new.name_ru; else new.name_ru := new.name_local; end if;
      if new.description_local is null then new.description_local := new.description_ru; else new.description_ru := new.description_local; end if;
    else
      if new.name_local is distinct from old.name_local or new.lang is distinct from old.lang then
        new.name_ru := new.name_local;
      elsif new.name_ru is distinct from old.name_ru then
        new.name_local := new.name_ru;
      end if;
      if new.description_local is distinct from old.description_local or new.lang is distinct from old.lang then
        new.description_ru := new.description_local;
      elsif new.description_ru is distinct from old.description_ru then
        new.description_local := new.description_ru;
      end if;
    end if;
  end if;

  -- Tags: 2.0 writes tags_local / tags_en, 1.11 writes tags.
  if tg_op = 'INSERT' then
    new_wrote_local := cardinality(new.tags_local) > 0 or cardinality(new.tags_en) > 0;
  else
    new_wrote_local := new.tags_local is distinct from old.tags_local or new.tags_en is distinct from old.tags_en;
  end if;
  if new_wrote_local then
    new.tags := public.tags_union(new.tags_local, new.tags_en);
  elsif tg_op = 'INSERT' or new.tags is distinct from old.tags then
    new.tags_local := public.tags_split_local(new.tags, new.lang);
    new.tags_en := public.tags_split_en(new.tags, new.lang);
  end if;
  return new;
end;
$$;

revoke execute on function public.names_sync_lang() from public, anon, authenticated;
revoke execute on function public.items_sync_lang() from public, anon, authenticated;

create trigger items_sync_lang before insert or update on public.items
  for each row execute function public.items_sync_lang();
create trigger locations_sync_lang before insert or update on public.locations
  for each row execute function public.names_sync_lang();
create trigger categories_sync_lang before insert or update on public.categories
  for each row execute function public.names_sync_lang();


-- Sign-up functions writing data_lang / name_ru again.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta_lang text := new.raw_user_meta_data ->> 'lang';
  old_mode text := new.raw_user_meta_data ->> 'data_lang';
  v_lang text;
begin
  v_lang := case
    when meta_lang ~ '^[a-z]{2,3}$' then meta_lang
    when old_mode in ('en', 'ru') then old_mode
    else 'en'
  end;
  insert into public.profiles (user_id, lang, show_english, data_lang)
  values (new.id, v_lang, false, case v_lang when 'ru' then 'ru' else 'en' end);
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
  insert into public.categories (user_id, lang, name_local, name_ru, name_en, sort_order)
  select
    uid,
    me.lang,
    case me.lang when 'ru' then d.name_ru when 'es' then d.name_es end,
    case me.lang when 'ru' then d.name_ru end,
    d.name_en,
    d.sort_order
  from me, (values
    ('Мебель',              'Furniture',              'Muebles',                  10),
    ('Инструменты',         'Tools',                  'Herramientas',             20),
    ('Кухня',               'Kitchen',                'Cocina',                   30),
    ('Электроника',         'Electronics',            'Electrónica',              40),
    ('Одежда',              'Clothing',               'Ropa',                     50),
    ('Документы',           'Documents',              'Documentos',               60),
    ('Хозтовары',           'Household',              'Artículos del hogar',      70),
    ('Спорт и отдых',       'Sports & Leisure',       'Deporte y ocio',           80),
    ('Личные вещи',         'Personal items',         'Objetos personales',       90),
    ('Лекарства',           'Medicines',              'Medicamentos',             93),
    ('Витамины и добавки',  'Vitamins & supplements', 'Vitaminas y suplementos',  96),
    ('Другое',              'Other',                  'Otros',                   100)
  ) as d (name_ru, name_en, name_es, sort_order);
$$;


commit;
