-- ============================================================
-- SET CATALOG: what the set picker screen reads.
--
-- One row per active set with what the student needs to choose a paper: the
-- subject/majorship it belongs to, how many items it really holds, and the
-- composition it will be served with (its stored shape).
--
-- security definer because it only exposes counts, never question text, and the
-- picker has to work for a visitor who is not signed in yet (they see the list,
-- the Start button asks them to log in).
-- ============================================================

drop function if exists public.set_catalog(text, text, text);

create function public.set_catalog(
  p_track text default null,
  p_level text default null,
  p_specialization text default null
)
returns table(
  id uuid, track text, subject text, specialization text, level text,
  set_no int, title text, target int, live int, missing int,
  easy int, medium_hard int, extremely_hard int, pedagogical int,
  shape_easy int, shape_medium_hard int, shape_extremely_hard int, shape_pedagogical int
) language sql stable security definer set search_path = public as $$
  select s.id, s.track, s.subject, s.specialization, s.level,
         s.set_no, s.title, 150,
         count(q.id)::int as live,
         greatest(0, 150 - count(q.id))::int as missing,
         count(q.id) filter (where q.bucket = 'easy')::int,
         count(q.id) filter (where q.bucket = 'medium-hard')::int,
         count(q.id) filter (where q.bucket = 'extremely-hard')::int,
         count(q.id) filter (where q.bucket = 'pedagogical')::int,
         s.shape_easy, s.shape_medium_hard, s.shape_extremely_hard, s.shape_pedagogical
    from public.question_sets s
    left join public.exam_questions q on q.set_id = s.id and q.is_active
   where s.is_active
     and (p_track is null or s.track = p_track)
     and (p_level is null or s.level = p_level or s.level = 'both')
     and (p_specialization is null or s.specialization is null
          or s.specialization = p_specialization)
   group by s.id, s.track, s.subject, s.specialization, s.level, s.set_no, s.title,
            s.shape_easy, s.shape_medium_hard, s.shape_extremely_hard, s.shape_pedagogical
   order by s.track, s.subject, s.specialization nulls first, s.set_no;
$$;

grant execute on function public.set_catalog(text, text, text) to anon, authenticated;
