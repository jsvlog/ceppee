-- ============================================================
-- SET MOCKS: a paper built from one set, always 150 items.
--
-- A set may hold fewer than 150 live items (source duplicates, junk items, or
-- questions hidden during review). A set mock must still be a real 150-item paper,
-- and it must keep the composition the set was built with, so:
--
--   question_sets gains its own shape (easy / medium-hard / extremely-hard /
--   pedagogical) and start_set_mock() fills each hole from the SAME subject or
--   majorship AND the SAME bucket, falling back to the largest bucket only when
--   that subject has none of the missing kind left.
--
-- Shapes are per set, not universal: Prof Ed / Values / PE sets really are
-- 30/40/50/30, while Filipino / Gen Ed sets have almost no classroom-judgment
-- items and are 30/40/80/0.
-- ============================================================

alter table public.question_sets
  add column if not exists shape_easy int not null default 0,
  add column if not exists shape_medium_hard int not null default 0,
  add column if not exists shape_extremely_hard int not null default 0,
  add column if not exists shape_pedagogical int not null default 0;

-- ---------------------------------------------------------------- start_set_mock
drop function if exists public.start_set_mock(uuid, boolean);

create function public.start_set_mock(p_set_id uuid, p_practice boolean default false)
returns table(
  id uuid, order_index int, question_text text,
  choice_a text, choice_b text, choice_c text, choice_d text,
  subject text, subtopic text, bucket text,
  correct_choice text, explanation text
) language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_sets public.question_sets%rowtype;
  v_target int := 150;
  v_n int;
  b text;
  need int;
begin
  select s.* into v_sets from public.question_sets s where s.id = p_set_id;
  if not found then return; end if;
  if not coalesce(v_sets.is_active, false) and not public.is_admin() then return; end if;
  if not (public.is_admin() or public.bank_access(v_sets.track)) then return; end if;

  create temp table if not exists set_paper (
    id uuid primary key, ord int, question_text text,
    choice_a text, choice_b text, choice_c text, choice_d text,
    subject text, subtopic text, bucket text
  ) on commit drop;
  truncate set_paper;

  -- 1. the set's own live items
  insert into set_paper (id, ord, question_text, choice_a, choice_b, choice_c, choice_d,
                         subject, subtopic, bucket)
  select q.id, q.item_no, q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
         q.subject, q.subtopic, q.bucket
    from public.exam_questions q
   where q.set_id = p_set_id and q.is_active;
  select count(*) into v_n from set_paper;

  -- 2. per-bucket top-up from sibling sets of the same subject / majorship
  if v_n < v_target then
    foreach b in array array['easy', 'medium-hard', 'extremely-hard', 'pedagogical'] loop
      exit when v_n >= v_target;
      need := (case b
                 when 'easy' then v_sets.shape_easy
                 when 'medium-hard' then v_sets.shape_medium_hard
                 when 'extremely-hard' then v_sets.shape_extremely_hard
                 else v_sets.shape_pedagogical
               end
              - coalesce((select count(*) from set_paper p where p.bucket = b), 0));
      need := least(coalesce(need, 0), v_target - v_n);
      continue when need <= 0;

      insert into set_paper (id, ord, question_text, choice_a, choice_b, choice_c, choice_d,
                             subject, subtopic, bucket)
      select f.id, v_n + f.rn, f.question_text, f.choice_a, f.choice_b, f.choice_c, f.choice_d,
             f.subject, f.subtopic, f.bucket
        from (
          select q.id, row_number() over (order by random()) as rn,
                 q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
                 q.subject, q.subtopic, q.bucket
            from public.exam_questions q
           where q.is_active
             and q.track = v_sets.track
             and q.subject = v_sets.subject
             and q.specialization is not distinct from v_sets.specialization
             and q.bucket = b
             and q.set_id is distinct from p_set_id
             and not exists (select 1 from set_paper p where p.id = q.id)
           order by random()
           limit need
        ) f
      on conflict (id) do nothing;
      select count(*) into v_n from set_paper;
    end loop;
  end if;

  -- 3. that kind is exhausted in this subject: finish the paper from the rest of
  --    the same subject / majorship so it is still 150 items
  if v_n < v_target then
    insert into set_paper (id, ord, question_text, choice_a, choice_b, choice_c, choice_d,
                           subject, subtopic, bucket)
    select f.id, v_n + f.rn, f.question_text, f.choice_a, f.choice_b, f.choice_c, f.choice_d,
           f.subject, f.subtopic, f.bucket
      from (
        select q.id, row_number() over (order by random()) as rn,
               q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
               q.subject, q.subtopic, q.bucket
          from public.exam_questions q
         where q.is_active
           and q.track = v_sets.track
           and q.subject = v_sets.subject
           and q.specialization is not distinct from v_sets.specialization
           and q.set_id is distinct from p_set_id
           and not exists (select 1 from set_paper p where p.id = q.id)
         order by random()
         limit v_target - v_n
      ) f
    on conflict (id) do nothing;
  end if;

  -- 4. hand the paper back in a fresh random order
  return query
    select p.id, (row_number() over (order by random()))::int,
           p.question_text, p.choice_a, p.choice_b, p.choice_c, p.choice_d,
           p.subject, p.subtopic, p.bucket,
           case when p_practice then k.correct_choice else null end,
           case when p_practice then k.explanation else null end
      from set_paper p
      join public.question_keys k on k.question_id = p.id;
end $$;

grant execute on function public.start_set_mock(uuid, boolean) to authenticated;

-- ---------------------------------------------- admin_set_list: show the shape
drop function if exists public.admin_set_list(text);

create function public.admin_set_list(p_track text default null)
returns table(
  id uuid, track text, subject text, specialization text, level text,
  set_no int, title text, item_count int, is_active boolean,
  easy int, medium_hard int, extremely_hard int, pedagogical int,
  shape_easy int, shape_medium_hard int, shape_extremely_hard int, shape_pedagogical int,
  with_explanation int
) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
    select s.id, s.track, s.subject, s.specialization, s.level,
           s.set_no, s.title, s.item_count, s.is_active,
           count(*) filter (where q.is_active and q.bucket = 'easy')::int,
           count(*) filter (where q.is_active and q.bucket = 'medium-hard')::int,
           count(*) filter (where q.is_active and q.bucket = 'extremely-hard')::int,
           count(*) filter (where q.is_active and q.bucket = 'pedagogical')::int,
           s.shape_easy, s.shape_medium_hard, s.shape_extremely_hard, s.shape_pedagogical,
           count(*) filter (where q.is_active and coalesce(k.explanation, '') <> '')::int
      from public.question_sets s
      left join public.exam_questions q on q.set_id = s.id
      left join public.question_keys k on k.question_id = q.id
     where (p_track is null or s.track = p_track)
     group by s.id, s.track, s.subject, s.specialization, s.level, s.set_no, s.title,
              s.item_count, s.is_active,
              s.shape_easy, s.shape_medium_hard, s.shape_extremely_hard, s.shape_pedagogical
     order by s.track, s.subject, s.specialization nulls first, s.set_no;
end $$;

grant execute on function public.admin_set_list(text) to authenticated;
