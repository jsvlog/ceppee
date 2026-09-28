-- ============================================================
-- ADMIN MAJORSHIP SUPPORT
--
--  1. admin_bank_list  gains p_specialization, so the Question Bank tab can be
--     filtered/browsed by majorship.
--  2. admin_clear_bank gains level / subject / specialization filters. It used to
--     delete the WHOLE track regardless of the filters on screen, while the admin
--     UI warned "this deletes every question in the current filter" - a plausible
--     way to destroy the entire bank by accident.
--
-- Both functions are DROPped first: adding a parameter changes the signature, and
-- leaving the old overload behind makes the PostgREST call ambiguous.
-- ============================================================

drop function if exists public.admin_bank_list(text, text, text, text, int, int);

create function public.admin_bank_list(
  p_track text default null,
  p_level text default null,
  p_subject text default null,
  p_specialization text default null,
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
) returns table(
  id uuid, question_text text,
  choice_a text, choice_b text, choice_c text, choice_d text,
  correct_choice text, explanation text,
  track text, level text, subject text, subtopic text, specialization text,
  difficulty smallint, is_free boolean, is_active boolean, source text,
  exam_id uuid, created_at timestamptz
) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
    select q.id, q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
           k.correct_choice, k.explanation,
           q.track, q.level, q.subject, q.subtopic, q.specialization,
           q.difficulty, q.is_free, q.is_active, q.source, q.exam_id, q.created_at
      from public.exam_questions q
      join public.question_keys k on k.question_id = q.id
     where (p_track is null or q.track = p_track)
       and (p_level is null or q.level = p_level)
       and (p_subject is null or q.subject = p_subject)
       and (p_specialization is null or q.specialization = p_specialization)
       and (p_search is null or p_search = '' or q.question_text ilike '%' || p_search || '%')
     order by q.created_at desc
     limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0));
end $$;


drop function if exists public.admin_clear_bank(text);

create function public.admin_clear_bank(
  p_track text default null,
  p_level text default null,
  p_subject text default null,
  p_specialization text default null
) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  delete from public.exam_questions
   where (p_track is null or track = p_track)
     and (p_level is null or level = p_level)
     and (p_subject is null or subject = p_subject)
     and (p_specialization is null or specialization = p_specialization);
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.admin_bank_list(text, text, text, text, text, int, int) from anon;
revoke execute on function public.admin_clear_bank(text, text, text, text) from anon;
grant execute on function public.admin_bank_list(text, text, text, text, text, int, int) to authenticated;
grant execute on function public.admin_clear_bank(text, text, text, text) to authenticated;

-- ---------- verify ----------
select proname, pg_get_function_arguments(oid) as args
  from pg_proc
 where proname in ('admin_bank_list', 'admin_clear_bank')
 order by proname;

-- how many questions carry a majorship today (should be 0 before the major load)
select count(*) filter (where specialization is not null) as tagged_with_major,
       count(*) as total
  from public.exam_questions;
