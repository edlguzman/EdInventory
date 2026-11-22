-- Languages v2 (app 2.0.0): any number of languages instead of ru/en columns.
--
-- Every record (item, place, category) gets:
--   lang                 the language of its own text ('en', 'ru', 'es', ...)
--   name_local, ...      the text in that language (empty when lang = 'en')
--   name_en, ...         English, always filled (AI in the background); the only text when lang = 'en'
-- profiles gets lang ("my language": interface and records) and show_english.
--
-- SAFE for app 1.11, which keeps reading and writing the old columns until the deferred
-- migration drops them: triggers mirror name_ru <-> name_local (lang 'ru'), tags <->
-- tags_local + tags_en and data_lang <-> lang + show_english both ways, so either version
-- can write and the other sees it. 2.0 writes only the new columns.
-- Agreed exceptions (user's explicit "yes"): *_name_present is loosened (a Spanish record may
-- have only name_local until English is filled), and the two sign-up functions are replaced by
-- versions that also understand "lang" (same result for 1.11 sign-ups).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Search normalization v2: lower case, ё -> е, Latin diacritics removed (cámara = camara).
-- The app mirrors it in lib/search/normalize.ts; keep both lists identical.
create function public.normalize_search_v2(t text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select translate(lower(t),
    'ёáàâäãåāéèêëēíìîïīóòôöõøōúùûüūñçýÿ',
    'еaaaaaaaeeeeeiiiiiooooooouuuuuncyy')
$$;

-- The text shown to a user: the record's own text when it is in the user's language,
-- otherwise English (and the other one if that is empty).
create function public.display_text(rec_lang text, user_lang text, local text, en text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select case when rec_lang = user_lang then coalesce(local, en) else coalesce(en, local) end
$$;

-- Old single tags array -> local / English, by script (1.11 had no language marker):
-- 'en' records: all English; 'ru' records: Cyrillic or no Latin letters = local, Latin = English.
create function public.tags_split_local(tags text[], lang text)
returns text[]
language sql immutable parallel safe
set search_path = ''
as $$
  select case
    when lang = 'en' then '{}'::text[]
    when lang = 'ru' then coalesce(array(select t from unnest(tags) with ordinality u(t, o)
                                         where t ~ '[а-яёА-ЯЁ]' or t !~ '[a-zA-Z]' order by o), '{}')
    else coalesce(tags, '{}')
  end
$$;

create function public.tags_split_en(tags text[], lang text)
returns text[]
language sql immutable parallel safe
set search_path = ''
as $$
  select case
    when lang = 'en' then coalesce(tags, '{}')
    when lang = 'ru' then coalesce(array(select t from unnest(tags) with ordinality u(t, o)
                                         where not (t ~ '[а-яёА-ЯЁ]' or t !~ '[a-zA-Z]') order by o), '{}')
    else '{}'::text[]
  end
$$;

-- local + English without duplicates, order kept (the old tags column for 1.11).
create function public.tags_union(a text[], b text[])
returns text[]
language sql immutable parallel safe
set search_path = ''
as $$
  select coalesce(array(
    select t from (
      select t, min(o) as o from unnest(coalesce(a, '{}') || coalesce(b, '{}')) with ordinality u(t, o) group by t
    ) x order by o
  ), '{}')
$$;

-- ---------------------------------------------------------------------------
-- profiles: lang + show_english
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column lang text not null default 'en' check (lang ~ '^[a-z]{2,3}$'),
  add column show_english boolean not null default false;

update public.profiles
set lang = case data_lang when 'en' then 'en' else 'ru' end,
    show_english = (data_lang = 'ru_en');

-- Users change only these columns of their own row (existing policy profiles_update_own_lang).
grant update (lang, show_english) on public.profiles to authenticated;

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

-- ---------------------------------------------------------------------------
-- Records: lang, local text, English tags
-- ---------------------------------------------------------------------------

alter table public.items
  add column lang text check (lang ~ '^[a-z]{2,3}$'),
  add column name_local text check (char_length(btrim(name_local)) between 1 and 200),
  add column description_local text check (char_length(description_local) <= 2000),
  add column tags_local text[] not null default '{}' check (cardinality(tags_local) <= 50),
  add column tags_en text[] not null default '{}' check (cardinality(tags_en) <= 50);

alter table public.locations
  add column lang text check (lang ~ '^[a-z]{2,3}$'),
  add column name_local text check (char_length(btrim(name_local)) between 1 and 200);

alter table public.categories
  add column lang text check (lang ~ '^[a-z]{2,3}$'),
  add column name_local text check (char_length(btrim(name_local)) between 1 and 100);

-- Existing data: an account in Russian (ru, ru_en) has its records in Russian, an English
-- account in English. All of them already have English (checked before the migration).
-- updated_at must not change: the trigger that sets it is off for the copy.
alter table public.items disable trigger items_set_updated_at;

update public.items i
set lang = p.lang,
    name_local = case when p.lang = 'ru' then i.name_ru end,
    description_local = case when p.lang = 'ru' then i.description_ru end,
    tags_local = public.tags_split_local(i.tags, p.lang),
    tags_en = public.tags_split_en(i.tags, p.lang)
from public.profiles p
where p.user_id = i.user_id;

alter table public.items enable trigger items_set_updated_at;

update public.locations l
set lang = p.lang, name_local = case when p.lang = 'ru' then l.name_ru end
from public.profiles p
where p.user_id = l.user_id;

update public.categories c
set lang = p.lang, name_local = case when p.lang = 'ru' then c.name_ru end
from public.profiles p
where p.user_id = c.user_id;

-- A name in at least one place: a Spanish record may have only name_local at first.
alter table public.items      drop constraint items_name_present;
alter table public.locations  drop constraint locations_name_present;
alter table public.categories drop constraint categories_name_present;
alter table public.items      add constraint items_name_present_v2      check (coalesce(name_local, name_en, name_ru) is not null);
alter table public.locations  add constraint locations_name_present_v2  check (coalesce(name_local, name_en, name_ru) is not null);
alter table public.categories add constraint categories_name_present_v2 check (coalesce(name_local, name_en, name_ru) is not null);

-- ---------------------------------------------------------------------------
-- Mirror old <-> new columns while 1.11 may still write (dropped by the deferred migration).
-- A record without lang (written by 1.11) gets the owner's language.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Search v3: own language + English (+ author, ISBN). Old search_text* stay for 1.11.
-- ---------------------------------------------------------------------------

alter table public.items add column search_text_v3 text generated always as (
  public.normalize_search_v2(
    coalesce(name_local, '') || ' ' || coalesce(name_en, '') || ' ' ||
    coalesce(description_local, '') || ' ' || coalesce(description_en, '') || ' ' ||
    public.immutable_text_array_to_string(tags_local, ' ') || ' ' ||
    public.immutable_text_array_to_string(tags_en, ' ') || ' ' ||
    coalesce(book_author, '') || ' ' || coalesce(book_isbn, '')
  )
) stored;

create index items_search_text_v3_trgm_idx on public.items using gin (search_text_v3 extensions.gin_trgm_ops);

-- search_items_v2 over search_text_v3 with normalize_search_v2. SECURITY INVOKER (RLS).
create function public.search_items_v3(
  p_terms text[],
  p_location_id uuid default null,
  p_category_id uuid default null,
  p_limit integer default 50
)
returns table (id uuid, score integer)
language sql
stable
set search_path = ''
as $$
  with raw_terms as (
    select public.normalize_search_v2(btrim(raw)) as term
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
  join patterns p on i.search_text_v3 like p.pattern
  where (p_category_id is null or i.category_id = p_category_id)
    and (p_location_id is null or i.location_id in (select s.id from scope s))
  group by i.id, i.created_at
  order by count(p.term) desc, i.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke execute on function public.search_items_v3(text[], uuid, uuid, integer) from public, anon;
grant execute on function public.search_items_v3(text[], uuid, uuid, integer) to authenticated;

-- Similar items (duplicate check) over the local and English names.
create function public.similar_items_v2(
  p_names_local text[],
  p_names_en text[],
  p_location_id uuid default null,
  p_min real default 0.4
)
returns table (idx integer, item_id uuid, score real, in_place boolean)
language sql
stable
set search_path = ''
as $$
  with input as (
    select
      t.ord::integer as idx,
      public.normalize_search_v2(btrim(coalesce(t.loc, ''))) as loc,
      public.normalize_search_v2(btrim(coalesce(t.en, ''))) as en
    from unnest(coalesce(p_names_local, '{}'), coalesce(p_names_en, '{}')) with ordinality as t(loc, en, ord)
    where t.ord <= 30
  ),
  scope as (
    select public.location_descendants(p_location_id) as id
    where p_location_id is not null
  ),
  candidates as (
    select
      i.id,
      public.normalize_search_v2(coalesce(i.name_local, '')) as loc,
      public.normalize_search_v2(coalesce(i.name_en, '')) as en,
      coalesce(i.location_id in (select s.id from scope s), false) as in_place
    from public.items i
  )
  select distinct on (inp.idx) inp.idx, m.id, m.score, m.in_place
  from input inp
  cross join lateral (
    select c.id, c.in_place,
      greatest(
        case when inp.loc <> '' and c.loc <> '' then extensions.similarity(inp.loc, c.loc) else 0 end,
        case when inp.en <> '' and c.en <> '' then extensions.similarity(inp.en, c.en) else 0 end
      )::real as score
    from candidates c
  ) m
  where m.score >= greatest(coalesce(p_min, 0.4), 0.2)
  order by inp.idx, m.in_place desc, m.score desc;
$$;

revoke execute on function public.similar_items_v2(text[], text[], uuid, real) from public, anon;
grant execute on function public.similar_items_v2(text[], text[], uuid, real) to authenticated;

-- ---------------------------------------------------------------------------
-- Place paths: each part in the user's language where the place has it, else English.
-- ---------------------------------------------------------------------------

create view public.location_paths_v2
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

revoke all on public.location_paths_v2 from anon, authenticated;
grant select on public.location_paths_v2 to authenticated;

-- ---------------------------------------------------------------------------
-- Sign-up: "lang" from the sign-up form (old clients send data_lang), default categories
-- in that language (English only for 'en' and for languages without a list here).
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Plans: names in every language (jsonb {"en": ..., "ru": ..., "es": ...}).
-- ---------------------------------------------------------------------------

alter table public.plans add column names jsonb not null default '{}' check (jsonb_typeof(names) = 'object');

update public.plans
set names = jsonb_build_object('en', name_en, 'ru', name_ru)
  || case code
       when 'free' then '{"es": "Gratis"}'::jsonb
       when 'plus' then '{"es": "Plus"}'::jsonb
       when 'pro' then '{"es": "Pro"}'::jsonb
       when 'unlimited' then '{"es": "Ilimitado"}'::jsonb
       else '{}'::jsonb
     end;

-- 1.11's admin writes name_ru / name_en: keep names in step.
create function public.plans_sync_names()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.names = '{}'::jsonb then
      new.names := jsonb_build_object('en', new.name_en, 'ru', new.name_ru);
    end if;
  elsif new.names is not distinct from old.names
        and (new.name_en is distinct from old.name_en or new.name_ru is distinct from old.name_ru) then
    new.names := new.names || jsonb_build_object('en', new.name_en, 'ru', new.name_ru);
  end if;
  return new;
end;
$$;

create trigger plans_sync_names before insert or update on public.plans
  for each row execute function public.plans_sync_names();

-- Valid plan names: an object of language code -> 1..50 characters, English required.
create function public.plan_names_valid(p_names jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(p_names) = 'object'
    and char_length(btrim(coalesce(p_names ->> 'en', ''))) between 1 and 50
    and not exists (
      select 1 from jsonb_each(p_names) e
      where e.key !~ '^[a-z]{2,3}$'
         or jsonb_typeof(e.value) <> 'string'
         or char_length(btrim(e.value #>> '{}')) not between 1 and 50
    )
$$;

create function public.admin_create_plan_v2(p_code text, p_names jsonb, p_item_limit integer, p_ai_daily_limit integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if not public.plan_names_valid(p_names) then
    raise exception 'invalid names' using errcode = '22023';
  end if;
  insert into public.plans (code, names, name_ru, name_en, item_limit, ai_daily_limit, sort_order)
  values (
    p_code,
    p_names,
    btrim(coalesce(p_names ->> 'ru', p_names ->> 'en')),
    btrim(p_names ->> 'en'),
    p_item_limit,
    p_ai_daily_limit,
    coalesce((select max(sort_order) from public.plans), 0) + 10
  );
end;
$$;

create function public.admin_update_plan_v2(p_code text, p_names jsonb, p_item_limit integer, p_ai_daily_limit integer, p_sort_order integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if not public.plan_names_valid(p_names) then
    raise exception 'invalid names' using errcode = '22023';
  end if;
  update public.plans
  set names = p_names,
      name_ru = btrim(coalesce(p_names ->> 'ru', p_names ->> 'en')),
      name_en = btrim(p_names ->> 'en'),
      item_limit = p_item_limit,
      ai_daily_limit = p_ai_daily_limit,
      sort_order = coalesce(p_sort_order, sort_order)
  where code = p_code;
  if not found then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
end;
$$;

-- my_plan with all plan names.
create function public.my_plan_v2()
returns table (code text, names jsonb, item_limit integer, ai_daily_limit integer, source text,
               until timestamptz, items_count bigint, ai_used_24h bigint, is_admin boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pl.code, pl.names, pl.item_limit, pl.ai_daily_limit, e.source, e.until,
    (select count(*) from public.items i where i.user_id = auth.uid()),
    (select count(*) from public.ai_usage a where a.user_id = auth.uid() and a.created_at > now() - interval '24 hours'),
    public.is_admin()
  from public.effective_plan(auth.uid()) e
  join public.plans pl on pl.code = e.code
  where public.is_active();
$$;

-- admin_set_status that returns the user's language (for the e-mail).
create function public.admin_set_status_v2(p_user_id uuid, p_status text)
returns table (email text, lang text, old_status text)
language plpgsql
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
  select u.email::text, p.lang, v_old
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where p.user_id = p_user_id;
end;
$$;

revoke execute on function public.admin_create_plan_v2(text, jsonb, integer, integer) from public, anon;
revoke execute on function public.admin_update_plan_v2(text, jsonb, integer, integer, integer) from public, anon;
revoke execute on function public.my_plan_v2() from public, anon;
revoke execute on function public.admin_set_status_v2(uuid, text) from public, anon;
grant execute on function public.admin_create_plan_v2(text, jsonb, integer, integer) to authenticated;
grant execute on function public.admin_update_plan_v2(text, jsonb, integer, integer, integer) to authenticated;
grant execute on function public.my_plan_v2() to authenticated;
grant execute on function public.admin_set_status_v2(uuid, text) to authenticated;
