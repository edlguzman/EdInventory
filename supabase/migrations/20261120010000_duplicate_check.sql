-- Duplicate check (v1.2.0). SAFE for the running version: one new nullable column, one
-- index, one new function. Nothing existing is changed; the current app never reads or
-- writes the new column, and old photos keep it empty.

-- 1. Same photo again: SHA-256 (hex) of the original file the photo was made from, computed
--    on the device. The app validates the format; null for old photos and for cut-outs.
alter table public.item_photos add column source_hash text;

create index item_photos_source_hash_idx on public.item_photos (user_id, source_hash)
  where source_hash is not null;

-- 2. Similar items already in the inventory: for each found item (its Russian and English
--    names, same positions in both arrays) the best matching existing item by trigram
--    similarity of the names (normalized like search: lower case, ё -> е). Items in
--    p_location_id and the places nested in it rank first. Only matches with a score of
--    at least p_min are returned.
-- SECURITY INVOKER: RLS applies, so only the caller's own (active account) items are seen.
create function public.similar_items(
  p_names_ru text[],
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

revoke execute on function public.similar_items(text[], text[], uuid, real) from public, anon;
grant execute on function public.similar_items(text[], text[], uuid, real) to authenticated;
