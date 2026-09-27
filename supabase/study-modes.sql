-- ============================================================
-- CEPPEE REVIEW — STUDY MODES MIGRATION
-- Run AFTER supabase/schema.sql. Safe to re-run (idempotent).
--
-- What this adds:
--   1. Tagged question BANK  (track / level / subject / subtopic / difficulty)
--   2. question_keys         — the answer key lives in a LOCKED table so mocks
--                              can never be scraped from the browser
--   3. exam blueprints       — exams DRAW questions from the bank by filter
--   4. study modes           — mock (timed) / drill (instant) / flashcards /
--                              retry-my-mistakes
--   5. study_progress        — per-question mastery per user
--   6. RPCs that do the drawing + the server-side grading
-- ============================================================

-- ============================================================
-- 1. QUESTION BANK TAGS
-- ============================================================
alter table public.exam_questions
  add column if not exists track text,
  add column if not exists level text not null default 'both',
  add column if not exists subject text,
  add column if not exists subtopic text,
  add column if not exists specialization text,
  add column if not exists difficulty smallint not null default 2,
  add column if not exists is_free boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists source text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Bank questions are NOT owned by an exam; a curated mock pins questions to itself.
alter table public.exam_questions alter column exam_id drop not null;

-- Backfill from the parent exam where an old row is still attached.
update public.exam_questions q
   set track = e.track
  from public.exams e
 where e.id = q.exam_id and q.track is null;

update public.exam_questions q
   set subject = coalesce(q.subject, e.topic)
  from public.exams e
 where e.id = q.exam_id and q.subject is null and e.topic is not null;

update public.exam_questions q
   set is_free = true
  from public.exams e
 where e.id = q.exam_id and e.is_free_preview and q.is_free = false;

-- Clear any subject label outside the official vocabulary (old free-text topics
-- like "Clerical & Reasoning" — the bank uses the CSC/PRC subject names only).
update public.exam_questions
   set subject = null
 where subject is not null
   and subject not in ('Verbal Ability','Numerical Ability','General Information',
                       'Analytical Ability','Clerical Ability',
                       'General Education','Professional Education','Specialization');

update public.exam_questions set track = 'CSE' where track is null;
alter table public.exam_questions alter column track set not null;
alter table public.exam_questions alter column track set default 'CSE';

-- ---------- 2. ANSWER KEY (locked table) ----------
create table if not exists public.question_keys (
  question_id uuid primary key references public.exam_questions(id) on delete cascade,
  correct_choice text not null check (correct_choice in ('A','B','C','D')),
  explanation text,
  updated_at timestamptz not null default now()
);

-- Only admins read this directly. Everyone else goes through a gated RPC.
alter table public.question_keys enable row level security;
drop policy if exists "keys_admin_all" on public.question_keys;
create policy "keys_admin_all" on public.question_keys
  for all using (public.is_admin()) with check (public.is_admin());

-- One-time copy of the old inline key, then remove it from the prompt table.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'exam_questions'
       and column_name = 'correct_choice'
  ) then
    execute $mig$
      insert into public.question_keys (question_id, correct_choice, explanation)
      select id, correct_choice, explanation from public.exam_questions
      where correct_choice is not null
      on conflict (question_id) do nothing
    $mig$;
    execute 'alter table public.exam_questions drop column if exists correct_choice';
    execute 'alter table public.exam_questions drop column if exists explanation';
  end if;
end $$;

-- ---------- 3. BANK CONSTRAINTS ----------
alter table public.exam_questions drop constraint if exists exam_questions_level_chk;
alter table public.exam_questions add constraint exam_questions_level_chk
  check (level in ('both','professional','subprofessional','elementary','secondary'));

alter table public.exam_questions drop constraint if exists exam_questions_track_chk;
alter table public.exam_questions add constraint exam_questions_track_chk
  check (track in ('CSE','LET'));

alter table public.exam_questions drop constraint if exists exam_questions_difficulty_chk;
alter table public.exam_questions add constraint exam_questions_difficulty_chk
  check (difficulty between 1 and 3);

-- Analytical Ability only exists on the CSE Professional paper;
-- Clerical Ability only on the CSE Sub-Professional paper.
alter table public.exam_questions drop constraint if exists exam_questions_subject_chk;
alter table public.exam_questions add constraint exam_questions_subject_chk
  check (
    subject is null
    or subject in ('Verbal Ability','Numerical Ability','General Information',
                   'Analytical Ability','Clerical Ability',
                   'General Education','Professional Education','Specialization')
  );

alter table public.exam_questions drop constraint if exists exam_questions_exclusive_chk;
alter table public.exam_questions add constraint exam_questions_exclusive_chk
  check (
    (subject = 'Analytical Ability' and level = 'professional')
    or (subject = 'Clerical Ability' and level = 'subprofessional')
    or subject is null
    or subject not in ('Analytical Ability','Clerical Ability')
  );

create index if not exists exam_questions_bank_idx
  on public.exam_questions (track, level, subject) where is_active;
create index if not exists exam_questions_pinned_idx
  on public.exam_questions (exam_id) where exam_id is not null;

-- ---------- 4. QUESTION VISIBILITY (no answer key here anymore) ----------
drop policy if exists "questions_read" on public.exam_questions;
create policy "questions_read" on public.exam_questions
  for select using (is_active = true and (is_free = true or public.user_has_active_sub(track)));

drop policy if exists "questions_admin_all" on public.exam_questions;
create policy "questions_admin_all" on public.exam_questions
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 5. EXAM BLUEPRINTS
-- ============================================================
alter table public.exams
  add column if not exists level text not null default 'both',
  add column if not exists specialization text,
  add column if not exists subjects text[],
  add column if not exists question_count int not null default 0,
  add column if not exists difficulty smallint not null default 0,
  add column if not exists passing_pct int not null default 80,
  add column if not exists order_index int not null default 0;

alter table public.exams drop constraint if exists exams_level_chk;
alter table public.exams add constraint exams_level_chk
  check (level in ('both','professional','subprofessional','elementary','secondary'));

-- ============================================================
-- 6. PROGRESS + ATTEMPTS
-- ============================================================
create table if not exists public.study_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.exam_questions(id) on delete cascade,
  attempts int not null default 0,
  correct int not null default 0,
  wrong int not null default 0,
  last_correct boolean,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index if not exists study_progress_user_idx on public.study_progress (user_id);
create index if not exists study_progress_wrong_idx on public.study_progress (user_id) where wrong > 0;

alter table public.study_progress enable row level security;

drop policy if exists "progress_select_own" on public.study_progress;
create policy "progress_select_own" on public.study_progress
  for select using (auth.uid() = user_id);

drop policy if exists "progress_upsert_own" on public.study_progress;
create policy "progress_upsert_own" on public.study_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "progress_update_own" on public.study_progress;
create policy "progress_update_own" on public.study_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "progress_admin_all" on public.study_progress;
create policy "progress_admin_all" on public.study_progress
  for all using (public.is_admin()) with check (public.is_admin());

-- Attempts now cover drills / flashcards too (no exam row needed).
alter table public.exam_attempts alter column exam_id drop not null;
alter table public.exam_attempts
  add column if not exists kind text not null default 'exam',
  add column if not exists label text,
  add column if not exists track text,
  add column if not exists level text,
  add column if not exists subject_summary text;

alter table public.exam_attempts drop constraint if exists exam_attempts_kind_chk;
alter table public.exam_attempts add constraint exam_attempts_kind_chk
  check (kind in ('exam','drill','flashcards'));

-- ============================================================
-- 7. ACCESS HELPER
-- ============================================================
create or replace function public.bank_access(p_track text)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_admin() or public.user_has_active_sub(p_track);
$$;

-- ============================================================
-- 8. DRAWING + GRADING RPCs
-- ============================================================

-- ---- 8a. MOCK: prompt-only paper (NO answer key ever leaves the server) ----
drop function if exists public.start_mock(uuid);
create function public.start_mock(p_exam_id uuid)
returns table(
  id uuid, order_index int, question_text text,
  choice_a text, choice_b text, choice_c text, choice_d text,
  subject text, subtopic text
) language plpgsql security definer set search_path = public as $$
declare v public.exams%rowtype;
begin
  select e.* into v from public.exams e where e.id = p_exam_id;
  if not found then return; end if;
  if not (v.is_active or public.is_admin()) then return; end if;
  if not (public.is_admin() or v.is_free_preview or public.user_has_active_sub(v.track)) then
    return;
  end if;

  -- Curated paper: questions pinned to this exam, in order.
  if exists (select 1 from public.exam_questions q where q.exam_id = p_exam_id and q.is_active) then
    return query
      select q.id, q.order_index, q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
             q.subject, q.subtopic
        from public.exam_questions q
       where q.exam_id = p_exam_id and q.is_active
       order by q.order_index
       limit coalesce(nullif(v.question_count, 0), 100000);
    return;
  end if;

  -- Dynamic paper: draw at random from the bank so every attempt is a fresh set.
  return query
    select q.id,
           (row_number() over (order by random()))::int,
           q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
           q.subject, q.subtopic
      from public.exam_questions q
     where q.is_active
       and q.exam_id is null
       and q.track = v.track
       and (v.level = 'both' or q.level = 'both' or q.level = v.level)
       and (v.subjects is null or cardinality(v.subjects) = 0 or q.subject = any(v.subjects))
       and (v.specialization is null or q.specialization = v.specialization)
       and (coalesce(v.difficulty, 0) = 0 or q.difficulty = v.difficulty)
       and (v.is_free_preview = false or q.is_free = true)
     order by random()
     limit coalesce(nullif(v.question_count, 0), 100000);
end $$;

-- ---- 8a-bis. PRACTICE EXAM: same filters as the mock, but WITH the answer key,
--      because practice mode explains every item right away. ----
drop function if exists public.start_practice_exam(uuid);
create function public.start_practice_exam(p_exam_id uuid)
returns table(
  id uuid, order_index int, question_text text,
  choice_a text, choice_b text, choice_c text, choice_d text,
  correct_choice text, explanation text, subject text, subtopic text
) language plpgsql security definer set search_path = public as $$
declare v public.exams%rowtype;
begin
  select e.* into v from public.exams e where e.id = p_exam_id;
  if not found then return; end if;
  if not (v.is_active or public.is_admin()) then return; end if;
  if not (public.is_admin() or v.is_free_preview or public.user_has_active_sub(v.track)) then
    return;
  end if;

  if exists (select 1 from public.exam_questions q where q.exam_id = p_exam_id and q.is_active) then
    return query
      select q.id, q.order_index, q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
             k.correct_choice, k.explanation, q.subject, q.subtopic
        from public.exam_questions q
        join public.question_keys k on k.question_id = q.id
       where q.exam_id = p_exam_id and q.is_active
       order by q.order_index
       limit coalesce(nullif(v.question_count, 0), 100000);
    return;
  end if;

  return query
    select q.id,
           (row_number() over (order by random()))::int,
           q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
           k.correct_choice, k.explanation, q.subject, q.subtopic
      from public.exam_questions q
      join public.question_keys k on k.question_id = q.id
     where q.is_active
       and q.exam_id is null
       and q.track = v.track
       and (v.level = 'both' or q.level = 'both' or q.level = v.level)
       and (v.subjects is null or cardinality(v.subjects) = 0 or q.subject = any(v.subjects))
       and (v.specialization is null or q.specialization = v.specialization)
       and (coalesce(v.difficulty, 0) = 0 or q.difficulty = v.difficulty)
       and (v.is_free_preview = false or q.is_free = true)
     order by random()
     limit coalesce(nullif(v.question_count, 0), 100000);
end $$;

-- ---- 8b. TIMED DRILL (student-built paper, still prompt-only) ----
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
       and (p_specialization is null or q.specialization = p_specialization)
       and (coalesce(p_difficulty, 0) = 0 or q.difficulty = p_difficulty)
     order by random()
     limit greatest(1, least(coalesce(p_limit, 50), 500));
end $$;

-- ---- 8c. PRACTICE DRILL (instant explanation, so the key is returned) ----
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
       and (p_specialization is null or q.specialization = p_specialization)
       and (coalesce(p_difficulty, 0) = 0 or q.difficulty = p_difficulty)
     order by random()
     limit greatest(1, least(coalesce(p_limit, 20), 500));
end $$;

-- ---- 8d. FLASHCARDS ----
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
       and (p_specialization is null or q.specialization = p_specialization)
       and (
         p_mode = 'all'
         or (p_mode = 'new' and sp.user_id is null)
         or (p_mode = 'seen' and sp.user_id is not null)
         or (p_mode = 'missed' and sp.wrong > 0 and coalesce(sp.last_correct, false) = false)
       )
     order by (sp.user_id is not null), random()
     limit greatest(1, least(coalesce(p_limit, 30), 500));
end $$;

-- ---- 8e. RETRY MY MISTAKES ----
drop function if exists public.draw_mistakes(text, text, int);
create function public.draw_mistakes(
  p_track text,
  p_level text default 'both',
  p_limit int default 20
) returns table(
  id uuid, question_text text,
  choice_a text, choice_b text, choice_c text, choice_d text,
  correct_choice text, explanation text, subject text, subtopic text,
  times_wrong int
) language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.bank_access(p_track) then return; end if;
  return query
    select q.id, q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
           k.correct_choice, k.explanation, q.subject, q.subtopic, sp.wrong
      from public.study_progress sp
      join public.exam_questions q on q.id = sp.question_id and q.is_active
      join public.question_keys k on k.question_id = q.id
     where sp.user_id = v_uid
       and sp.wrong > 0
       and coalesce(sp.last_correct, false) = false
       and q.track = p_track
       and (p_level is null or p_level = 'both' or q.level = 'both' or q.level = p_level)
     order by sp.wrong desc, sp.last_seen_at desc
     limit greatest(1, least(coalesce(p_limit, 20), 200));
end $$;

-- ---- 8f. SERVER-SIDE GRADING (also writes the attempt + mastery) ----
drop function if exists public.grade_attempt(uuid[], jsonb, uuid, text, text, text, text, int);
create function public.grade_attempt(
  p_question_ids uuid[],
  p_answers jsonb,
  p_exam_id uuid default null,
  p_kind text default 'exam',
  p_label text default null,
  p_track text default null,
  p_level text default null,
  p_seconds int default 0
) returns table(
  question_id uuid, chosen text, correct_choice text, explanation text,
  ok boolean, subject text, subtopic text, question_text text,
  choice_a text, choice_b text, choice_c text, choice_d text
) language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_total int := 0;
  v_score int := 0;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  return query
    select q.id,
           nullif(p_answers ->> q.id::text, ''),
           k.correct_choice,
           k.explanation,
           (coalesce(p_answers ->> q.id::text, '') = k.correct_choice),
           q.subject, q.subtopic, q.question_text,
           q.choice_a, q.choice_b, q.choice_c, q.choice_d
      from public.exam_questions q
      join public.question_keys k on k.question_id = q.id
     where q.id = any(p_question_ids);

  select count(*),
         count(*) filter (where coalesce(p_answers ->> q.id::text, '') = k.correct_choice)
    into v_total, v_score
    from public.exam_questions q
    join public.question_keys k on k.question_id = q.id
   where q.id = any(p_question_ids);

  insert into public.study_progress (user_id, question_id, attempts, correct, wrong, last_correct, last_seen_at)
  select v_uid, q.id, 1,
         case when coalesce(p_answers ->> q.id::text, '') = k.correct_choice then 1 else 0 end,
         case when coalesce(p_answers ->> q.id::text, '') = k.correct_choice then 0 else 1 end,
         (coalesce(p_answers ->> q.id::text, '') = k.correct_choice),
         now()
    from public.exam_questions q
    join public.question_keys k on k.question_id = q.id
   where q.id = any(p_question_ids)
  -- Named constraint, not the column list: an OUT parameter also called
  -- question_id makes the plain "(user_id, question_id)" target ambiguous.
  on conflict on constraint study_progress_pkey do update
    set attempts = public.study_progress.attempts + 1,
        correct = public.study_progress.correct + excluded.correct,
        wrong = public.study_progress.wrong + excluded.wrong,
        last_correct = excluded.last_correct,
        last_seen_at = now();

  insert into public.exam_attempts
    (user_id, exam_id, kind, label, track, level, score, total, duration_used_seconds, answers)
  values
    (v_uid, p_exam_id, coalesce(p_kind, 'exam'), p_label, p_track, p_level,
     v_score, v_total, greatest(0, coalesce(p_seconds, 0)), coalesce(p_answers, '{}'::jsonb));

  return;
end $$;

-- ---- 8g. SELF-STUDY GRADING (drill / flashcards — no attempt row) ----
drop function if exists public.record_answer(uuid, boolean);
create function public.record_answer(p_question_id uuid, p_correct boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  insert into public.study_progress (user_id, question_id, attempts, correct, wrong, last_correct, last_seen_at)
  values (v_uid, p_question_id, 1,
          case when p_correct then 1 else 0 end,
          case when p_correct then 0 else 1 end,
          p_correct, now())
  on conflict on constraint study_progress_pkey do update
    set attempts = public.study_progress.attempts + 1,
        correct = public.study_progress.correct + excluded.correct,
        wrong = public.study_progress.wrong + excluded.wrong,
        last_correct = excluded.last_correct,
        last_seen_at = now();
end $$;

-- ---- 8h. BANK SIZE (so the UI can say how many items are available) ----
drop function if exists public.bank_stats(text);
create function public.bank_stats(p_track text)
returns table(track text, subject text, level text, total bigint, accessible bigint)
language plpgsql security definer stable set search_path = public as $$
declare v_access boolean := public.bank_access(p_track);
begin
  return query
    select q.track, q.subject, q.level, count(*)::bigint,
           count(*) filter (where v_access or q.is_free)::bigint
      from public.exam_questions q
      join public.question_keys k on k.question_id = q.id
     where q.is_active and q.track = p_track
     group by q.track, q.subject, q.level;
end $$;

-- ---- 8i. PER-SUBJECT MASTERY (dashboard bars) ----
drop function if exists public.subject_progress(text);
create function public.subject_progress(p_track text)
returns table(subject text, answered bigint, correct bigint, pct int)
language plpgsql security definer stable set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  return query
    select q.subject,
           count(*)::bigint,
           count(*) filter (where sp.last_correct)::bigint,
           case when count(*) = 0 then 0
                else round(100.0 * count(*) filter (where sp.last_correct) / count(*))::int
           end
      from public.study_progress sp
      join public.exam_questions q on q.id = sp.question_id
     where sp.user_id = v_uid and q.track = p_track and q.subject is not null
     group by q.subject
     order by q.subject;
end $$;

-- ---- 8j. ADMIN: save one question (prompt + key, atomic) ----
drop function if exists public.admin_save_question(jsonb);
create function public.admin_save_question(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  v_id := nullif(p ->> 'id', '')::uuid;

  if v_id is null then
    insert into public.exam_questions
      (exam_id, order_index, question_text, choice_a, choice_b, choice_c, choice_d,
       track, level, subject, subtopic, specialization, difficulty, is_free, is_active, source)
    values (
      nullif(p ->> 'exam_id', '')::uuid,
      coalesce((p ->> 'order_index')::int, 0),
      p ->> 'question_text', p ->> 'choice_a', p ->> 'choice_b', p ->> 'choice_c', p ->> 'choice_d',
      coalesce(nullif(p ->> 'track', ''), 'CSE'),
      coalesce(nullif(p ->> 'level', ''), 'both'),
      nullif(p ->> 'subject', ''), nullif(p ->> 'subtopic', ''),
      nullif(p ->> 'specialization', ''),
      coalesce((p ->> 'difficulty')::smallint, 2),
      coalesce((p ->> 'is_free')::boolean, false),
      coalesce((p ->> 'is_active')::boolean, true),
      nullif(p ->> 'source', '')
    ) returning id into v_id;
  else
    update public.exam_questions set
      exam_id = nullif(p ->> 'exam_id', '')::uuid,
      order_index = coalesce((p ->> 'order_index')::int, order_index),
      question_text = coalesce(p ->> 'question_text', question_text),
      choice_a = coalesce(p ->> 'choice_a', choice_a),
      choice_b = coalesce(p ->> 'choice_b', choice_b),
      choice_c = coalesce(p ->> 'choice_c', choice_c),
      choice_d = coalesce(p ->> 'choice_d', choice_d),
      track = coalesce(nullif(p ->> 'track', ''), track),
      level = coalesce(nullif(p ->> 'level', ''), level),
      subject = nullif(p ->> 'subject', ''),
      subtopic = nullif(p ->> 'subtopic', ''),
      specialization = nullif(p ->> 'specialization', ''),
      difficulty = coalesce((p ->> 'difficulty')::smallint, difficulty),
      is_free = coalesce((p ->> 'is_free')::boolean, is_free),
      is_active = coalesce((p ->> 'is_active')::boolean, is_active),
      source = nullif(p ->> 'source', ''),
      updated_at = now()
    where id = v_id;
  end if;

  insert into public.question_keys (question_id, correct_choice, explanation, updated_at)
  values (v_id, upper(coalesce(nullif(p ->> 'correct_choice', ''), 'A')),
          nullif(p ->> 'explanation', ''), now())
  on conflict (question_id) do update
    set correct_choice = excluded.correct_choice,
        explanation = excluded.explanation,
        updated_at = now();

  return v_id;
end $$;

-- ---- 8k. ADMIN: bulk import a batch of tagged questions ----
drop function if exists public.admin_import_questions(jsonb);
create function public.admin_import_questions(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_id uuid;
  n int := 0;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Expected an array of questions'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(trim(r ->> 'question_text'), '') = '' then
      raise exception 'Question %: missing question text', n + 1;
    end if;
    if coalesce(trim(r ->> 'choice_a'), '') = ''
       or coalesce(trim(r ->> 'choice_b'), '') = ''
       or coalesce(trim(r ->> 'choice_c'), '') = ''
       or coalesce(trim(r ->> 'choice_d'), '') = '' then
      raise exception 'Question %: needs all four choices (A-D)', n + 1;
    end if;

    insert into public.exam_questions
      (exam_id, order_index, question_text, choice_a, choice_b, choice_c, choice_d,
       track, level, subject, subtopic, specialization, difficulty, is_free, is_active, source)
    values (
      nullif(r ->> 'exam_id', '')::uuid,
      coalesce((r ->> 'order_index')::int, n + 1),
      r ->> 'question_text', r ->> 'choice_a', r ->> 'choice_b', r ->> 'choice_c', r ->> 'choice_d',
      coalesce(nullif(r ->> 'track', ''), 'CSE'),
      coalesce(nullif(r ->> 'level', ''), 'both'),
      nullif(r ->> 'subject', ''), nullif(r ->> 'subtopic', ''),
      nullif(r ->> 'specialization', ''),
      coalesce((r ->> 'difficulty')::smallint, 2),
      coalesce((r ->> 'is_free')::boolean, false),
      true,
      nullif(r ->> 'source', '')
    ) returning id into v_id;

    insert into public.question_keys (question_id, correct_choice, explanation)
    values (v_id, upper(coalesce(nullif(r ->> 'correct_choice', ''), 'A')), nullif(r ->> 'explanation', ''))
    on conflict (question_id) do update
      set correct_choice = excluded.correct_choice, explanation = excluded.explanation;

    n := n + 1;
  end loop;

  return n;
end $$;

-- ---- 8l. ADMIN: browse the bank with keys, and bulk delete ----
drop function if exists public.admin_bank_list(text, text, text, text, int, int);
create function public.admin_bank_list(
  p_track text default null,
  p_level text default null,
  p_subject text default null,
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
       and (p_search is null or p_search = '' or q.question_text ilike '%' || p_search || '%')
     order by q.created_at desc
     limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0));
end $$;

drop function if exists public.admin_delete_questions(uuid[]);
create function public.admin_delete_questions(p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  delete from public.exam_questions where id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---- 8m. ADMIN: wipe the whole bank (fresh start before a big upload) ----
drop function if exists public.admin_clear_bank(text);
create function public.admin_clear_bank(p_track text default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  delete from public.exam_questions where p_track is null or track = p_track;
  get diagnostics n = row_count;
  return n;
end $$;

-- ============================================================
-- 9. CATALOG RESET — drop the old sample papers (they cascade to their
--    sample questions), then create the correct blueprint catalog.
--    Bank questions are NOT touched: only these fixed sample ids.
-- ============================================================
delete from public.exams where id in (
  'd1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000002',
  'd1000000-0000-0000-0000-000000000003',
  'd1000000-0000-0000-0000-000000000004',
  'd1000000-0000-0000-0000-000000000005'
);

-- CSE — Professional: 170 items / 3h10m / 80% to pass. Analytical Ability included.
-- CSE — Sub-Professional: 165 items / 2h40m / 80% to pass. Clerical Ability instead.
insert into public.exams
  (id, track, title, description, mode, topic, level, subjects, question_count,
   duration_minutes, passing_pct, is_free_preview, is_active, order_index)
values
  ('e1000000-0000-0000-0000-000000000001', 'CSE',
   'CSE Professional — Full Mock Exam',
   '170 items, 3 hours 10 minutes. Verbal, Numerical, Analytical and General Information — the real Professional paper. Randomised every attempt, so you never memorise the order.',
   'mock', null, 'professional',
   array['Verbal Ability','Numerical Ability','Analytical Ability','General Information'],
   170, 190, 80, false, true, 1),

  ('e1000000-0000-0000-0000-000000000002', 'CSE',
   'CSE Sub-Professional — Full Mock Exam',
   '165 items, 2 hours 40 minutes. Verbal, Numerical, Clerical Ability and General Information — the real Sub-Professional paper.',
   'mock', null, 'subprofessional',
   array['Verbal Ability','Numerical Ability','Clerical Ability','General Information'],
   165, 160, 80, false, true, 2),

  ('e1000000-0000-0000-0000-000000000003', 'CSE',
   'Free Preview: CSE Sampler',
   'A short free sampler from the CSE bank — see how the reviewer works before you subscribe.',
   'practice', null, 'both', null, 10, 15, 80, true, true, 3)
on conflict (id) do update set
  track = excluded.track, title = excluded.title, description = excluded.description,
  mode = excluded.mode, level = excluded.level, subjects = excluded.subjects,
  question_count = excluded.question_count, duration_minutes = excluded.duration_minutes,
  passing_pct = excluded.passing_pct, is_free_preview = excluded.is_free_preview,
  is_active = excluded.is_active, order_index = excluded.order_index;

-- LET — Elementary: Gen Ed 40% + Prof Ed 60%. Secondary: Gen Ed 20% + Prof Ed 40% +
-- Specialization 40%. Passing: 75% average, no subtest below 50%.
insert into public.exams
  (id, track, title, description, mode, topic, level, subjects, question_count,
   duration_minutes, passing_pct, is_free_preview, is_active, order_index)
values
  ('e1000000-0000-0000-0000-000000000011', 'LET',
   'LET Elementary — General Education',
   '150 items. English, Filipino, Math, Science, Social Studies and IT. Worth 40% of the Elementary LET.',
   'mock', null, 'elementary', array['General Education'],
   150, 180, 75, false, true, 1),

  ('e1000000-0000-0000-0000-000000000012', 'LET',
   'LET Elementary — Professional Education',
   '150 items. Teaching principles, child development, assessment and the Code of Ethics. Worth 60% of the Elementary LET — the biggest chunk.',
   'mock', null, 'elementary', array['Professional Education'],
   150, 210, 75, false, true, 2),

  ('e1000000-0000-0000-0000-000000000013', 'LET',
   'LET Secondary — General Education',
   '150 items. Worth 20% of the Secondary LET.',
   'mock', null, 'secondary', array['General Education'],
   150, 180, 75, false, true, 3),

  ('e1000000-0000-0000-0000-000000000014', 'LET',
   'LET Secondary — Professional Education',
   '150 items. Worth 40% of the Secondary LET.',
   'mock', null, 'secondary', array['Professional Education'],
   150, 210, 75, false, true, 4),

  ('e1000000-0000-0000-0000-000000000015', 'LET',
   'Free Preview: LET Sampler',
   'A short free sampler from the LET bank — Gen Ed and Prof Ed mixed.',
   'practice', null, 'both', null, 10, 15, 75, true, true, 5)
on conflict (id) do update set
  track = excluded.track, title = excluded.title, description = excluded.description,
  mode = excluded.mode, level = excluded.level, subjects = excluded.subjects,
  question_count = excluded.question_count, duration_minutes = excluded.duration_minutes,
  passing_pct = excluded.passing_pct, is_free_preview = excluded.is_free_preview,
  is_active = excluded.is_active, order_index = excluded.order_index;

-- ============================================================
-- 10. GRANTS
-- ============================================================
revoke execute on function public.bank_access(text) from anon;
revoke execute on function public.start_mock(uuid) from anon;
revoke execute on function public.start_practice_exam(uuid) from anon;
revoke execute on function public.start_timed_drill(text, text, text[], text, int, int) from anon;
revoke execute on function public.draw_drill(text, text, text[], text, int, int) from anon;
revoke execute on function public.draw_flashcards(text, text, text[], text, int, text) from anon;
revoke execute on function public.draw_mistakes(text, text, int) from anon;
revoke execute on function public.grade_attempt(uuid[], jsonb, uuid, text, text, text, text, int) from anon;
revoke execute on function public.record_answer(uuid, boolean) from anon;
revoke execute on function public.subject_progress(text) from anon;
revoke execute on function public.admin_save_question(jsonb) from anon, authenticated;
revoke execute on function public.admin_import_questions(jsonb) from anon, authenticated;
revoke execute on function public.admin_bank_list(text, text, text, text, int, int) from anon, authenticated;
revoke execute on function public.admin_delete_questions(uuid[]) from anon, authenticated;
revoke execute on function public.admin_clear_bank(text) from anon, authenticated;

grant execute on function public.start_mock(uuid) to authenticated;
grant execute on function public.start_practice_exam(uuid) to authenticated;
grant execute on function public.start_timed_drill(text, text, text[], text, int, int) to authenticated;
grant execute on function public.draw_drill(text, text, text[], text, int, int) to authenticated;
grant execute on function public.draw_flashcards(text, text, text[], text, int, text) to authenticated;
grant execute on function public.draw_mistakes(text, text, int) to authenticated;
grant execute on function public.grade_attempt(uuid[], jsonb, uuid, text, text, text, text, int) to authenticated;
grant execute on function public.record_answer(uuid, boolean) to authenticated;
grant execute on function public.subject_progress(text) to authenticated;
grant execute on function public.bank_stats(text) to anon, authenticated;
grant execute on function public.admin_save_question(jsonb) to authenticated;
grant execute on function public.admin_import_questions(jsonb) to authenticated;
grant execute on function public.admin_bank_list(text, text, text, text, int, int) to authenticated;
grant execute on function public.admin_delete_questions(uuid[]) to authenticated;
grant execute on function public.admin_clear_bank(text) to authenticated;
