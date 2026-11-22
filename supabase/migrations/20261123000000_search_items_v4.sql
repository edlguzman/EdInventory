-- Search with paging and the total number found (v2.0.1). Same matching as search_items_v3
-- (left untouched for app 2.0.0): own language + English, ё→е, no Latin accents, endings
-- dropped for words of 5+ letters, ISBN with dashes or spaces, place with nested places.
-- New: p_offset for loading more, and `total` (all matches, counted before limit/offset) in
-- every row, so one call gives a page and the count. Limit up to 500 (ids for "select all").
-- Safe for the running version: a new function only.

create function public.search_items_v4(
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
  join patterns p on i.search_text_v3 like p.pattern
  where (p_category_id is null or i.category_id = p_category_id)
    and (p_location_id is null or i.location_id in (select s.id from scope s))
  group by i.id, i.created_at
  order by count(p.term) desc, i.created_at desc, i.id
  limit least(greatest(coalesce(p_limit, 50), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function public.search_items_v4(text[], uuid, uuid, integer, integer) from public, anon;
grant execute on function public.search_items_v4(text[], uuid, uuid, integer, integer) to authenticated;
