-- Stage 6: item search by words over items.search_text.
--
-- Used by both the instant text search (terms = the typed words) and the AI search
-- (terms = transcript words + synonyms in RU/EN from Gemini). Gemini never sees items.
--
-- Matching: every term is normalized like search_text (lower case, ё -> е). Terms of
-- 5+ characters also match without their last letter, a cheap stand-in for Russian
-- endings ("дрель" finds "дрели", "кастрюля" finds "кастрюлю").
-- Ranking: number of matching terms, then the newest first.
--
-- SECURITY INVOKER: RLS applies, so only the caller's items are searched.

create function public.search_items(
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

revoke execute on function public.search_items(text[], uuid, uuid, integer) from public, anon;
grant execute on function public.search_items(text[], uuid, uuid, integer) to authenticated;
