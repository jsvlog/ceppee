-- ============================================================
-- QUESTION SETS  (one source file = one set of ~150 items)
--
-- The bank used to be a flat pile: every item was tagged only by
-- track/level/subject/specialization, so "Prof Ed Set 7" could not be
-- retrieved, and the 20-30-40-50 shape of a real LET paper lived nowhere.
--
-- Now:
--   question_sets      one row per source file (Prof Ed Set 1..21, Values Set 1..15 ...)
--   exam_questions     gains set_id, item_no (position in the set), bucket, item_type
--
-- bucket is the composition of the paper as the owner defines it:
--   easy | medium-hard | extremely-hard | pedagogical
-- (30 easy / 40 medium-hard / 50 extremely hard / 30 pedagogical per 150-item set;
--  sources that genuinely contain fewer teaching-situation items leave the balance
--  in extremely-hard, so no item carries a made-up tag).
--
-- Idempotent: safe to re-run.
-- ============================================================

create table if not exists public.question_sets (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('CSE','LET')),
  subject text not null,
  specialization text,
  level text not null default 'both'
    check (level in ('both','professional','subprofessional','elementary','secondary')),
  set_no int not null,
  title text not null,
  source_file text,
  item_count int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists question_sets_slug_idx
  on public.question_sets (track, subject, coalesce(specialization, ''), set_no);
create index if not exists question_sets_lookup_idx
  on public.question_sets (track, level, subject, specialization);

alter table public.question_sets enable row level security;

drop policy if exists "question_sets_read" on public.question_sets;
create policy "question_sets_read" on public.question_sets
  for select using (is_active = true or public.is_admin());

drop policy if exists "question_sets_admin_all" on public.question_sets;
create policy "question_sets_admin_all" on public.question_sets
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------ question columns
alter table public.exam_questions
  add column if not exists set_id uuid references public.question_sets(id) on delete set null,
  add column if not exists item_no int,
  add column if not exists bucket text,
  add column if not exists item_type text not null default 'content';

do $$ begin
  alter table public.exam_questions add constraint exam_questions_bucket_chk
    check (bucket is null or bucket in ('easy','medium-hard','extremely-hard','pedagogical'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.exam_questions add constraint exam_questions_item_type_chk
    check (item_type in ('content','pedagogical'));
exception when duplicate_object then null; end $$;

create index if not exists exam_questions_set_idx on public.exam_questions (set_id, item_no);
create index if not exists exam_questions_bucket_idx on public.exam_questions (track, bucket);
create index if not exists exam_questions_spec_idx
  on public.exam_questions (track, subject, specialization) where is_active;

-- ------------------------------------------------------------ admin_bank_list v2
drop function if exists public.admin_bank_list(text, text, text, text, text, int, int);

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
  exam_id uuid, created_at timestamptz,
  set_id uuid, set_no int, set_title text, item_no int, bucket text, item_type text
) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
    select q.id, q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
           k.correct_choice, k.explanation,
           q.track, q.level, q.subject, q.subtopic, q.specialization,
           q.difficulty, q.is_free, q.is_active, q.source, q.exam_id, q.created_at,
           q.set_id, s.set_no, s.title, q.item_no, q.bucket, q.item_type
      from public.exam_questions q
      join public.question_keys k on k.question_id = q.id
      left join public.question_sets s on s.id = q.set_id
     where (p_track is null or q.track = p_track)
       and (p_level is null or q.level = p_level)
       and (p_subject is null or q.subject = p_subject)
       and (p_specialization is null or q.specialization = p_specialization)
       and (p_search is null or p_search = '' or q.question_text ilike '%' || p_search || '%')
     order by s.subject, s.specialization nulls first, s.set_no, q.item_no
     limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0));
end $$;

-- ------------------------------------------------------- admin_import_questions v2
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
       track, level, subject, subtopic, specialization, difficulty, is_free, is_active, source,
       set_id, item_no, bucket, item_type)
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
      nullif(r ->> 'source', ''),
      nullif(r ->> 'set_id', '')::uuid,
      (r ->> 'item_no')::int,
      nullif(r ->> 'bucket', ''),
      coalesce(nullif(r ->> 'item_type', ''), 'content')
    ) returning id into v_id;

    insert into public.question_keys (question_id, correct_choice, explanation)
    values (v_id, upper(coalesce(nullif(r ->> 'correct_choice', ''), 'A')), nullif(r ->> 'explanation', ''))
    on conflict (question_id) do update
      set correct_choice = excluded.correct_choice, explanation = excluded.explanation;

    n := n + 1;
  end loop;

  return n;
end $$;

-- ------------------------------------------------------------ admin_clear_bank v2
drop function if exists public.admin_clear_bank(text, text, text, text);

create function public.admin_clear_bank(
  p_track text default null,
  p_level text default null,
  p_subject text default null,
  p_specialization text default null,
  p_set_id uuid default null
) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  delete from public.exam_questions
   where (p_track is null or track = p_track)
     and (p_level is null or level = p_level)
     and (p_subject is null or subject = p_subject)
     and (p_specialization is null or specialization = p_specialization)
     and (p_set_id is null or set_id = p_set_id);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------- admin_set_list (set browser)
create or replace function public.admin_set_list(p_track text default null)
returns table(
  id uuid, track text, subject text, specialization text, level text,
  set_no int, title text, item_count int, is_active boolean,
  easy int, medium_hard int, extremely_hard int, pedagogical int,
  with_explanation int
) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return query
    select s.id, s.track, s.subject, s.specialization, s.level,
           s.set_no, s.title, s.item_count, s.is_active,
           count(*) filter (where q.bucket = 'easy')::int,
           count(*) filter (where q.bucket = 'medium-hard')::int,
           count(*) filter (where q.bucket = 'extremely-hard')::int,
           count(*) filter (where q.bucket = 'pedagogical')::int,
           count(*) filter (where coalesce(k.explanation, '') <> '')::int
      from public.question_sets s
      left join public.exam_questions q on q.set_id = s.id
      left join public.question_keys k on k.question_id = q.id
     where (p_track is null or s.track = p_track)
     group by s.id, s.track, s.subject, s.specialization, s.level, s.set_no, s.title,
              s.item_count, s.is_active
     order by s.track, s.subject, s.specialization nulls first, s.set_no;
end $$;

grant execute on function public.admin_set_list(text) to authenticated;
