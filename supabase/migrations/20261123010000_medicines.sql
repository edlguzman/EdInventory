-- Item types and medicines (v2.1.0). Additive and safe for app 2.0.1:
--   items.kind     'item' | 'book' | 'medicine' (default 'item'; 2.0.1 never writes it)
--   items.attrs    type attributes as a JSON object (medicine / supplement fields; zod on the server)
--   items.expires_on  expiry date (month-only packaging: the last day of that month)
--   search_text_v4 = search_text_v3 + medicine active ingredients / supplement components / NDC
--   search_items_v5 = search_items_v4 over search_text_v4 (v3 / v4 stay for 2.0.x)
--   seed_default_categories: + "Medicines" and "Vitamins & supplements" for new accounts
-- Existing books get kind = 'book' (updated_at untouched). Rollback: supabase/deferred/medicines.down.sql.

begin;

alter table public.items
  add column kind text not null default 'item' check (kind in ('item', 'book', 'medicine')),
  add column attrs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attrs) = 'object' and pg_column_size(attrs) <= 16384),
  add column expires_on date check (expires_on between date '1990-01-01' and date '2100-12-31');

create index items_user_expires_idx on public.items (user_id, expires_on) where expires_on is not null;

alter table public.items disable trigger items_set_updated_at;
update public.items set kind = 'book'
where book_author is not null or book_year is not null or book_isbn is not null;
alter table public.items enable trigger items_set_updated_at;

-- Text of the type attributes that search should find: medicine active ingredient (own
-- language + English), supplement component names, NDC. Deterministic, so immutable.
create function public.attrs_search_text(a jsonb)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select concat_ws(' ',
    a ->> 'active_local',
    a ->> 'active_en',
    a ->> 'ndc',
    (select string_agg(concat_ws(' ', c ->> 'name_local', c ->> 'name_en'), ' ')
     from jsonb_array_elements(case when jsonb_typeof(a -> 'components') = 'array' then a -> 'components' else '[]'::jsonb end) as c)
  );
$$;

alter table public.items add column search_text_v4 text generated always as (
  public.normalize_search_v2(
    coalesce(name_local, '') || ' ' || coalesce(name_en, '') || ' ' ||
    coalesce(description_local, '') || ' ' || coalesce(description_en, '') || ' ' ||
    public.immutable_text_array_to_string(tags_local, ' ') || ' ' ||
    public.immutable_text_array_to_string(tags_en, ' ') || ' ' ||
    coalesce(book_author, '') || ' ' || coalesce(book_isbn, '') || ' ' ||
    coalesce(public.attrs_search_text(attrs), '')
  )
) stored;
create index items_search_text_v4_trgm_idx on public.items using gin (search_text_v4 extensions.gin_trgm_ops);

-- search_items_v4 over search_text_v4. SECURITY INVOKER (RLS).
create function public.search_items_v5(
  p_terms text[],
  p_location_id uuid default null,
  p_category_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (id uuid, score integer, total integer)
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
  select i.id, count(p.term)::integer as score, (count(*) over ())::integer as total
  from public.items i
  join patterns p on i.search_text_v4 like p.pattern
  where (p_category_id is null or i.category_id = p_category_id)
    and (p_location_id is null or i.location_id in (select s.id from scope s))
  group by i.id, i.created_at
  order by count(p.term) desc, i.created_at desc, i.id
  limit least(greatest(coalesce(p_limit, 50), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.search_items_v5(text[], uuid, uuid, integer, integer) from public, anon;
grant execute on function public.search_items_v5(text[], uuid, uuid, integer, integer) to authenticated;

-- Default categories for new accounts: + Medicines, Vitamins & supplements (before "Other").
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
