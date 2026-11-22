-- ---------------------------------------------------------------------------
-- plans-v2: four products, and access that knows WHAT was bought.
--
--   monthly  P149  everything in one track, 30 days
--   subject  P299  one subject / CSE category, until the exam date
--   beed     P399  every elementary LET paper, until the exam date
--   bsed     P499  every secondary LET paper, until the exam date
--   csec     P499  every CSE paper, until the exam date
--
-- Before this, a subscription was (user_id, track). A subject purchase cannot
-- live in that shape, so subscriptions grows scope/level/subject and access is
-- decided per question row instead of per track.
--
-- Runs after: schema.sql, study-modes.sql, paymongo.sql.
-- Safe to re-run.
-- ---------------------------------------------------------------------------
begin;

-- ---- 1. subscriptions: remember the scope of what was paid for -------------
alter table public.subscriptions add column if not exists scope text not null default 'track';
alter table public.subscriptions add column if not exists level text;
alter table public.subscriptions add column if not exists subject text;

alter table public.subscriptions drop constraint if exists subscriptions_scope_check;
alter table public.subscriptions add constraint subscriptions_scope_check
  check (scope in ('track', 'level', 'subject'));

alter table public.subscriptions drop constraint if exists subscriptions_scope_shape;
alter table public.subscriptions add constraint subscriptions_scope_shape check (
  (scope = 'track'   and level is null and subject is null)
  or (scope = 'level'   and level in ('elementary', 'secondary') and subject is null)
  or (scope = 'subject' and subject is not null)
);

-- Everything sold before this migration was a whole-track pass.
update public.subscriptions
   set scope = 'track', level = null, subject = null
 where scope is null;

-- (user_id, track) was the old key and is too coarse now: a student may hold a
-- subject pass and later a complete package. Keep one row per exact scope.
alter table public.subscriptions drop constraint if exists subscriptions_user_id_track_key;
create unique index if not exists subscriptions_user_scope_key
  on public.subscriptions (user_id, track, scope, coalesce(level, ''), coalesce(subject, ''));

-- ---- 2. payments: the order records the same scope ------------------------
alter table public.payments add column if not exists scope text;
alter table public.payments add column if not exists level text;
alter table public.payments add column if not exists subject text;

alter table public.payments drop constraint if exists payments_plan_check;
alter table public.payments add constraint payments_plan_check
  check (plan in ('monthly', 'subject', 'beed', 'bsed', 'csec', 'season'));  -- season = legacy

-- ---- 3. the one access rule, identical to canAccess() in src/lib/queries.ts
create or replace function public.user_can_access(
  p_track text,
  p_level text default null,
  p_subject text default null
) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_admin(), false) or exists (
    select 1
      from public.subscriptions s
     where s.user_id = auth.uid()
       and s.status = 'active'
       and s.expires_at > now()
       and s.track = p_track
       and (
         s.scope = 'track'
         -- A level pass covers the shared papers too: Gen Ed and Prof Ed rows
         -- carry level = 'both' because every LET taker sits them.
         or (s.scope = 'level'
             and (p_level is null or p_level = 'both' or s.level = p_level))
         or (s.scope = 'subject' and p_subject is not null and s.subject = p_subject)
       )
  );
$$;

comment on function public.user_can_access(text, text, text) is
  'True when the signed-in user may read a question row with this track/level/subject.';

revoke execute on function public.user_can_access(text, text, text) from public, anon;
grant execute on function public.user_can_access(text, text, text) to authenticated, service_role;

-- ---- 4. RLS reads the scope per row --------------------------------------
drop policy if exists "questions_read" on public.exam_questions;
create policy "questions_read" on public.exam_questions
  for select using (
    is_active = true
    and (is_free = true or public.user_can_access(track, level, subject))
  );

-- ---- 5. the draw functions stop serving papers nobody bought --------------
-- The coarse bank_access() guard stays (it decides "may you open this track at
-- all"), and the per-row rule keeps a Gen-Ed-only buyer out of Specialization.

create or replace function public.start_mock(p_exam_id uuid)
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

  if exists (select 1 from public.exam_questions q where q.exam_id = p_exam_id and q.is_active) then
    return query
      select q.id, q.order_index, q.question_text, q.choice_a, q.choice_b, q.choice_c, q.choice_d,
             q.subject, q.subtopic
        from public.exam_questions q
       where q.exam_id = p_exam_id and q.is_active
         and (v.is_free_preview or public.user_can_access(q.track, q.level, q.subject))
       order by q.order_index
       limit coalesce(nullif(v.question_count, 0), 100000);
    return;
  end if;

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
       and (public.user_can_access(q.track, q.level, q.subject) or v.is_free_preview)
     order by random()
     limit coalesce(nullif(v.question_count, 0), 100000);
end $$;

create or replace function public.start_practice_exam(p_exam_id uuid)
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
         and (v.is_free_preview or public.user_can_access(q.track, q.level, q.subject))
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
       and (public.user_can_access(q.track, q.level, q.subject) or v.is_free_preview)
     order by random()
     limit coalesce(nullif(v.question_count, 0), 100000);
end $$;

create or replace function public.start_timed_drill(
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
       and public.user_can_access(q.track, q.level, q.subject)
     order by random()
     limit greatest(1, least(coalesce(p_limit, 50), 500));
end $$;

create or replace function public.draw_drill(
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
       and public.user_can_access(q.track, q.level, q.subject)
     order by random()
     limit greatest(1, least(coalesce(p_limit, 20), 500));
end $$;

create or replace function public.draw_flashcards(
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
       and public.user_can_access(q.track, q.level, q.subject)
     order by (sp.user_id is not null), random()
     limit greatest(1, least(coalesce(p_limit, 30), 500));
end $$;

-- Mistakes pool: same row rule, otherwise a subject buyer would be handed items
-- from papers they never bought (they answered them while holding an older pass).
create or replace function public.draw_mistakes(
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
       and q.track = p_track
       and (p_level is null or p_level = 'both' or q.level = 'both' or q.level = p_level)
       and public.user_can_access(q.track, q.level, q.subject)
     order by sp.wrong desc, random()
     limit greatest(1, least(coalesce(p_limit, 20), 200));
end $$;

-- ---- 6. activation writes the scope --------------------------------------
create or replace function public.activate_payment(
  p_payment_id uuid,
  p_provider_ref text default null,
  p_method text default null,
  p_raw jsonb default null
) returns table (activated boolean, expires_at timestamptz, days int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_pay public.payments%rowtype;
  v_scope text;
  v_level text;
  v_subject text;
  v_target timestamptz;
  v_final timestamptz;
  v_days int;
  v_season boolean;
begin
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment % not found', p_payment_id;
  end if;

  if v_pay.status = 'paid' then
    return query select false, v_pay.granted_expires_at, coalesce(v_pay.days_granted, 0);
    return;
  end if;

  -- shape the grant from the plan; the plan id came from the server, not the body
  v_season := v_pay.plan in ('subject', 'beed', 'bsed', 'csec', 'season');
  v_scope  := coalesce(v_pay.scope, case v_pay.plan when 'beed' then 'level'
                                                when 'bsed' then 'level'
                                                when 'subject' then 'subject'
                                                else 'track' end);
  v_level  := case v_pay.plan when 'beed' then 'elementary'
                              when 'bsed' then 'secondary'
                              else v_pay.level end;
  v_subject := case when v_scope = 'subject' then v_pay.subject else null end;

  if v_scope = 'subject' and v_subject is null then
    raise exception 'subject plan without a subject';
  end if;

  if v_season then
    v_target := public.season_exam_date(v_pay.track);
    if v_target is null or v_target < now() + interval '7 days' then
      v_target := now() + interval '180 days';
    end if;
  else
    v_target := now() + interval '30 days';
  end if;

  insert into public.subscriptions (user_id, track, status, started_at, expires_at, scope, level, subject)
  values (v_pay.user_id, v_pay.track, 'active', now(), v_target, v_scope, v_level, v_subject)
  on conflict (user_id, track, scope, coalesce(level, ''), coalesce(subject, '')) do update
    set status = 'active',
        expires_at = case
          when v_season then greatest(public.subscriptions.expires_at, v_target)
          else greatest(public.subscriptions.expires_at, now()) + interval '30 days'
        end
  returning expires_at into v_final;

  v_days := greatest(0, ceil(extract(epoch from (v_final - now())) / 86400)::int);

  update public.payments
     set status = 'paid',
         provider_ref = coalesce(p_provider_ref, provider_ref),
         payment_method = coalesce(p_method, payment_method),
         scope = v_scope,
         level = v_level,
         subject = v_subject,
         days_granted = v_days,
         granted_expires_at = v_final,
         paid_at = coalesce(paid_at, now()),
         activated_at = now(),
         raw = coalesce(p_raw, raw)
   where id = p_payment_id;

  return query select true, v_final, v_days;
end $$;

revoke execute on function public.activate_payment(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.activate_payment(uuid, text, text, jsonb) to service_role;

-- ---- 7. the manual GCash path grants the whole track, as it always did ----
create or replace function public.approve_payment_request(p_payment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pay public.payment_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select * into v_pay from public.payment_requests where id = p_payment_id;
  if not found then raise exception 'Payment request not found'; end if;
  if v_pay.status <> 'pending' then raise exception 'Already processed'; end if;

  update public.payment_requests
     set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_payment_id;

  insert into public.subscriptions (user_id, track, status, started_at, expires_at, scope)
  values (v_pay.user_id, v_pay.track, 'active', now(), now() + interval '180 days', 'track')
  on conflict (user_id, track, scope, coalesce(level, ''), coalesce(subject, '')) do update
    set status = 'active',
        started_at = now(),
        expires_at = public.subscriptions.expires_at + interval '180 days',
        payment_request_id = v_pay.id;
end;
$$;

commit;
