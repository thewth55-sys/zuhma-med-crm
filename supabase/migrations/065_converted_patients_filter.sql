-- ============================================================
-- 065_converted_patients_filter.sql — lets the Contacts list filter
-- down to converted patients only (has a patient_profiles row — see
-- 038's "a contact becomes a patient when this row is created").
--
-- Extends filter_contacts_by_tags (025) with an extra
-- p_converted_only param rather than a new function, so the tag
-- filter and the converted-only filter compose (a staff member can
-- filter by tag AND "solo convertidos" at once). Added at the end
-- with a default, so existing callers that only pass the first four
-- args are unaffected.
--
-- The no-tag-filter path (plain PostgREST query in contacts/page.tsx)
-- doesn't need a DB function — it adds `patient_profiles!inner(id)`
-- to the select, an ordinary PostgREST embedded-resource inner join.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- Adding a parameter changes the function's arity, so CREATE OR
-- REPLACE alone would leave the old 4-arg version around as a
-- separate overload instead of replacing it — drop it explicitly so
-- there's exactly one version of this function.
DROP FUNCTION IF EXISTS public.filter_contacts_by_tags(UUID[], TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.filter_contacts_by_tags(
  p_tag_ids UUID[],
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0,
  p_converted_only BOOLEAN DEFAULT false
)
RETURNS TABLE (contact contacts, total_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH matched AS (
    -- Distinct contacts having ANY of the selected tags (OR),
    -- narrowed by the same name/phone/email search as the list, and
    -- optionally to only those that have converted to a patient.
    SELECT DISTINCT c.id, c.created_at
    FROM contacts c
    JOIN contact_tags ct ON ct.contact_id = c.id
    WHERE ct.tag_id = ANY(p_tag_ids)
      AND (
        p_search IS NULL
        OR c.name ILIKE '%' || p_search || '%'
        OR c.phone ILIKE '%' || p_search || '%'
        OR c.email ILIKE '%' || p_search || '%'
      )
      AND (
        NOT p_converted_only
        OR EXISTS (SELECT 1 FROM patient_profiles pp WHERE pp.contact_id = c.id)
      )
  ),
  page AS (
    -- count(*) OVER() is evaluated before LIMIT, so it is the full
    -- match total regardless of the page being returned.
    SELECT id, count(*) OVER() AS total_count
    FROM matched
    ORDER BY created_at DESC, id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT c AS contact, page.total_count
  FROM page
  JOIN contacts c ON c.id = page.id
  ORDER BY c.created_at DESC, c.id;
$$;

ALTER FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT, BOOLEAN) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filter_contacts_by_tags(UUID[], TEXT, INT, INT, BOOLEAN) TO authenticated;
