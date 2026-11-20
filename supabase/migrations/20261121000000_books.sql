-- Books (v1.8.0) — SAFE for the running version (v1.7.0): additive only.
-- New nullable columns (with checks on the new columns only: existing rows are all null),
-- a new generated search column with its index, and a new search function. The existing
-- search_text column, search_items() and similar_items() are not changed; v1.7.0 keeps
-- using them. Dropping the old column/function later is a separate deferred step.

-- 1. Book fields: language-neutral, one value each (not per RU/EN). -----------------------------
--   book_author: as printed (several authors in one line);
--   book_year:   year of the edition;
--   book_isbn:   digits only (ISBN-10 may end with X), checksum validated by the app.
alter table public.items
  add column book_author text check (book_author is null or char_length(btrim(book_author)) between 1 and 300),
  add column book_year   smallint check (book_year is null or book_year between 1400 and 2100),
  add column book_isbn   text check (book_isbn is null or book_isbn ~ '^([0-9]{9}[0-9X]|[0-9]{13})$');

-- 2. Search text v2 = v1 + author + ISBN. -------------------------------------------------------
-- The same normalization as search_text (lower case, ё -> е). A new column instead of a changed
-- one: changing a generated column means dropping it, which would break the running version.
alter table public.items add column search_text_v2 text generated always as (
  public.normalize_search(
    coalesce(name_ru, '') || ' ' || coalesce(name_en, '') || ' ' ||
    coalesce(description_ru, '') || ' ' || coalesce(description_en, '') || ' ' ||
    public.immutable_text_array_to_string(tags, ' ') || ' ' ||
    coalesce(book_author, '') || ' ' || coalesce(book_isbn, '')
  )
) stored;
create index items_search_text_v2_trgm_idx on public.items using gin (search_text_v2 extensions.gin_trgm_ops);

-- 3. search_items_v2: search_items over search_text_v2. A term that is an ISBN written with
-- hyphens or spaces ("978-5-17-...") is matched by its digits, as ISBNs are stored.
-- SECURITY INVOKER: RLS applies, so only the caller's items are searched.
create function public.search_items_v2(
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
$$;

revoke execute on function public.search_items_v2(text[], uuid, uuid, integer) from public, anon;
grant execute on function public.search_items_v2(text[], uuid, uuid, integer) to authenticated;
