-- Choosing a majorship must not empty the shared papers.
--
-- Gen Ed and Prof Ed items are tagged with specialization = NULL because every
-- LET taker sits them. The drills filtered `q.specialization = p_specialization`,
-- so the moment a student picked a majorship (Mathematics, English, ...) every
-- Gen Ed / Prof Ed drill and flashcard set returned 0 rows and the page said
-- "No questions for this selection yet" — while the hub still showed 3,737 items
-- on the same card.
--
-- New rule: a major restricts the Specialization paper only. Null-specialization
-- rows (the shared papers) come through, and another major's Specialization items
-- are still excluded, including when p_subjects is null (mixed drill).
--
-- Idempotent: drop + create, then restore the grants.

drop function if exists public.draw_drill(text, text, text[], text, int, int);
create function public.draw_drill(
  p_track text,
  p_level text default 'both',
  p_subjects text[] default null,
  p_specialization text default null,
  p_limit int default 20,
  p_difficulty int default 0
) returns table(
  id uuid, question_text text,
  choice_a text, choice_b text, choice_c text, choice_d text,
  correct_choice text, explanation text, subject text, subtopic text
) language plpgsql security definer set search_path = public as $$
begin
  if not public.bank_access(p_track) then return; end if;
  return query
    select q.id, q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
           k.correct_choice, k.explanation, q.subject, q.subtopic
      from public.exam_questions q
      join public.question_keys k on k.question_id = q.id
     where q.is_active
       and q.track = p_track
       and (p_level is null or p_level = 'both' or q.level = 'both' or q.level = p_level)
       and (p_subjects is null or cardinality(p_subjects) = 0 or q.subject = any(p_subjects))
       and (
         p_specialization is null
         or q.specialization = p_specialization
         or (q.specialization is null and q.subject <> 'Specialization')
       )
       and (coalesce(p_difficulty, 0) = 0 or q.difficulty = p_difficulty)
     order by random()
     limit greatest(1, least(coalesce(p_limit, 20), 500));
end $$;

drop function if exists public.start_timed_drill(text, text, text[], text, int, int);
create function public.start_timed_drill(
  p_track text,
  p_level text default 'both',
  p_subjects text[] default null,
  p_specialization text default null,
  p_limit int default 50,
  p_difficulty int default 0
) returns table(
  id uuid, order_index int, question_text text,
  choice_a text, choice_b text, choice_c text, choice_d text,
  subject text, subtopic text
) language plpgsql security definer set search_path = public as $$
begin
  if not public.bank_access(p_track) then return; end if;
  return query
    select q.id, (row_number() over (order by random()))::int,
           q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
           q.subject, q.subtopic
      from public.exam_questions q
     where q.is_active
       and q.track = p_track
       and (p_level is null or p_level = 'both' or q.level = 'both' or q.level = p_level)
       and (p_subjects is null or cardinality(p_subjects) = 0 or q.subject = any(p_subjects))
       and (
         p_specialization is null
         or q.specialization = p_specialization
         or (q.specialization is null and q.subject <> 'Specialization')
       )
       and (coalesce(p_difficulty, 0) = 0 or q.difficulty = p_difficulty)
     order by random()
     limit greatest(1, least(coalesce(p_limit, 50), 500));
end $$;

drop function if exists public.draw_flashcards(text, text, text[], text, int, text);
create function public.draw_flashcards(
  p_track text,
  p_level text default 'both',
  p_subjects text[] default null,
  p_specialization text default null,
  p_limit int default 30,
  p_mode text default 'new'
) returns table(
  id uuid, question_text text,
  choice_a text, choice_b text, choice_c text, choice_d text,
  correct_choice text, explanation text, subject text, subtopic text,
  seen boolean, last_correct boolean
) language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if not public.bank_access(p_track) then return; end if;
  return query
    select q.id, q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
           k.correct_choice, k.explanation, q.subject, q.subtopic,
           (sp.user_id is not null), sp.last_correct
      from public.exam_questions q
      join public.question_keys k on k.question_id = q.id
      left join public.study_progress sp
             on sp.question_id = q.id and sp.user_id = v_uid
     where q.is_active
       and q.track = p_track
       and (p_level is null or p_level = 'both' or q.level = 'both' or q.level = p_level)
       and (p_subjects is null or cardinality(p_subjects) = 0 or q.subject = any(p_subjects))
       and (
         p_specialization is null
         or q.specialization = p_specialization
         or (q.specialization is null and q.subject <> 'Specialization')
       )
       and (
         p_mode = 'all'
         or (p_mode = 'new' and sp.user_id is null)
         or (p_mode = 'seen' and sp.user_id is not null)
         or (p_mode = 'missed' and sp.wrong > 0 and coalesce(sp.last_correct, false) = false)
       )
     order by (sp.user_id is not null), random()
     limit greatest(1, least(coalesce(p_limit, 30), 500));
end $$;

revoke execute on function public.draw_drill(text, text, text[], text, int, int) from anon;
revoke execute on function public.draw_flashcards(text, text, text[], text, int, text) from anon;
revoke execute on function public.start_timed_drill(text, text, text[], text, int, int) from anon;
grant execute on function public.draw_drill(text, text, text[], text, int, int) to authenticated;
grant execute on function public.draw_flashcards(text, text, text[], text, int, text) to authenticated;
grant execute on function public.start_timed_drill(text, text, text[], text, int, int) to authenticated;
