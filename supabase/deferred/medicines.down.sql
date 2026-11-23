-- Reverts 20261123010000_medicines.sql (app 2.0.1 does not use any of it).
-- Medicine / supplement data in attrs and expires_on is lost: dump it first.

begin;

drop function if exists public.search_items_v5(text[], uuid, uuid, integer, integer);
drop index if exists public.items_search_text_v4_trgm_idx;
alter table public.items drop column if exists search_text_v4;
drop function if exists public.attrs_search_text(jsonb);
drop index if exists public.items_user_expires_idx;
alter table public.items drop column if exists kind, drop column if exists attrs, drop column if exists expires_on;

-- Default categories as in 20261122000000_languages.sql.
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

commit;
