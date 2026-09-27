-- ============================================================
-- CEPPEE REVIEW — Supabase schema
-- Run this whole file in: Supabase Dashboard > SQL Editor > New query
-- THEN run supabase/study-modes.sql (question bank, tag columns,
-- blueprint catalogue and the study-mode RPCs).
-- Safe to re-run (idempotent).
-- ============================================================

-- ============================================================
-- 1. PROFILES (extends auth.users)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ============================================================
-- 2. is_admin() — SECURITY DEFINER
-- MUST exist BEFORE any policy that references it!
-- ============================================================
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  );
$$;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Admin sees all profiles (SECURITY DEFINER fn avoids RLS recursion)
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin());

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 3. SITE SETTINGS (editable payment details, from admin panel)
-- ============================================================
create table if not exists public.site_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "settings_read_all" on public.site_settings;
create policy "settings_read_all" on public.site_settings
  for select using (true);

drop policy if exists "settings_admin_write" on public.site_settings;
create policy "settings_admin_write" on public.site_settings
  for all using (public.is_admin());

insert into public.site_settings (key, value) values
  ('gcash_number', '0917 000 0000'),
  ('gcash_name', 'Ceppee Review'),
  ('bank_name', 'BPI'),
  ('bank_account_name', 'J. Santos'),
  ('bank_account_number', '0000-0000-00'),
  ('payment_instructions', 'Send the EXACT amount shown (including the centavos). Then upload your receipt screenshot and type the GCash reference number. Verification usually takes less than 24 hours.')
on conflict (key) do nothing;

-- ============================================================
-- 4. PAYMENT REQUESTS (manual GCash/bank queue)
-- ============================================================
create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  track text not null check (track in ('CSE','LET')),
  amount numeric(10,2) not null,
  payment_method text not null default 'gcash',
  reference_number text,
  receipt_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

create index if not exists payment_requests_user_idx on public.payment_requests(user_id);
create index if not exists payment_requests_status_idx on public.payment_requests(status);

alter table public.payment_requests enable row level security;

drop policy if exists "payreq_select_own" on public.payment_requests;
create policy "payreq_select_own" on public.payment_requests
  for select using (auth.uid() = user_id);

drop policy if exists "payreq_insert_own" on public.payment_requests;
create policy "payreq_insert_own" on public.payment_requests
  for insert with check (auth.uid() = user_id);

drop policy if exists "payreq_admin_all" on public.payment_requests;
create policy "payreq_admin_all" on public.payment_requests
  for all using (public.is_admin());

-- ============================================================
-- 5. SUBSCRIPTIONS
-- ============================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  track text not null check (track in ('CSE','LET')),
  status text not null default 'active' check (status in ('active','expired','revoked')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  payment_request_id uuid references public.payment_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, track)
);

create index if not exists subscriptions_user_idx on public.subscriptions(user_id);

alter table public.subscriptions enable row level security;

drop policy if exists "subs_select_own" on public.subscriptions;
create policy "subs_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "subs_admin_all" on public.subscriptions;
create policy "subs_admin_all" on public.subscriptions
  for all using (public.is_admin());

-- ============================================================
-- 6. TOPICS & LESSONS
-- ============================================================
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('CSE','LET')),
  title text not null,
  description text,
  order_index int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.topics enable row level security;

drop policy if exists "topics_read_published" on public.topics;
create policy "topics_read_published" on public.topics
  for select using (is_published = true or public.is_admin());

drop policy if exists "topics_admin_all" on public.topics;
create policy "topics_admin_all" on public.topics
  for all using (public.is_admin());

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references public.topics(id) on delete cascade not null,
  title text not null,
  content text not null default '',
  video_url text,
  order_index int not null default 0,
  is_published boolean not null default true,
  is_free boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lessons enable row level security;

-- Paid-content gating lives IN THE DATABASE (not just the UI):
-- non-free lessons are only readable by subscribers or admins.
-- "Subscribed" = active subscription on the lesson's track, not expired.
create or replace function public.user_has_active_sub(p_track text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = auth.uid()
      and track = p_track
      and status = 'active'
      and expires_at > now()
  );
$$;

drop policy if exists "lessons_read_published" on public.lessons;
create policy "lessons_read_published" on public.lessons
  for select using (
    (is_published = true and (is_free = true or public.user_has_active_sub((select t.track from public.topics t where t.id = topic_id))))
    or public.is_admin()
  );

drop policy if exists "lessons_admin_all" on public.lessons;
create policy "lessons_admin_all" on public.lessons
  for all using (public.is_admin());

-- ============================================================
-- 7. EXAMS & QUESTIONS
-- ============================================================
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('CSE','LET')),
  title text not null,
  description text,
  mode text not null default 'mock' check (mode in ('mock','practice')),
  topic text,
  duration_minutes int not null default 60,
  is_free_preview boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.exams enable row level security;

-- Paid-content gating for exams: the catalog (titles/duration) is visible to
-- everyone, but free-preview flag lets previews through for non-subscribers.
drop policy if exists "exams_read_active" on public.exams;
create policy "exams_read_active" on public.exams
  for select using (is_active = true or public.is_admin());

drop policy if exists "exams_admin_all" on public.exams;
create policy "exams_admin_all" on public.exams
  for all using (public.is_admin());

create table if not exists public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references public.exams(id) on delete cascade not null,
  order_index int not null default 0,
  question_text text not null,
  choice_a text not null,
  choice_b text not null,
  choice_c text not null,
  choice_d text not null,
  correct_choice text not null check (correct_choice in ('A','B','C','D')),
  explanation text
);

create index if not exists exam_questions_exam_idx on public.exam_questions(exam_id);

alter table public.exam_questions enable row level security;

-- Questions are only readable when the parent exam is active AND
-- (it's a free preview OR the user has an active subscription on the track).
drop policy if exists "questions_read" on public.exam_questions;
create policy "questions_read" on public.exam_questions
  for select using (
    exists (
      select 1 from public.exams e
      where e.id = exam_id
        and e.is_active = true
        and (e.is_free_preview = true or public.user_has_active_sub(e.track))
    )
    or public.is_admin()
  );

drop policy if exists "questions_admin_all" on public.exam_questions;
create policy "questions_admin_all" on public.exam_questions
  for all using (public.is_admin());

-- ============================================================
-- 8. EXAM ATTEMPTS (results history)
-- ============================================================
create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  exam_id uuid references public.exams(id) on delete cascade not null,
  score int not null,
  total int not null,
  duration_used_seconds int not null default 0,
  answers jsonb not null default '{}',
  completed_at timestamptz not null default now()
);

create index if not exists exam_attempts_user_idx on public.exam_attempts(user_id);

alter table public.exam_attempts enable row level security;

drop policy if exists "attempts_select_own" on public.exam_attempts;
create policy "attempts_select_own" on public.exam_attempts
  for select using (auth.uid() = user_id);

drop policy if exists "attempts_insert_own" on public.exam_attempts;
create policy "attempts_insert_own" on public.exam_attempts
  for insert with check (auth.uid() = user_id);

drop policy if exists "attempts_admin_all" on public.exam_attempts;
create policy "attempts_admin_all" on public.exam_attempts
  for all using (public.is_admin());

-- ============================================================
-- 9. RPC — approve / reject payment (atomic)
-- ============================================================
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

  insert into public.subscriptions (user_id, track, status, started_at, expires_at, payment_request_id)
  values (v_pay.user_id, v_pay.track, 'active', now(), now() + interval '180 days', v_pay.id)
  on conflict (user_id, track) do update
    set status = 'active',
        started_at = now(),
        expires_at = public.subscriptions.expires_at + interval '180 days',
        payment_request_id = v_pay.id;
end;
$$;

create or replace function public.reject_payment_request(p_payment_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  update public.payment_requests
     set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(), admin_note = p_note
   where id = p_payment_id and status = 'pending';
end;
$$;

-- Admin quick stats for the dashboard
create or replace function public.admin_stats()
returns json language sql security definer stable set search_path = public as $$
  select json_build_object(
    'pending_payments', (select count(*) from public.payment_requests where status = 'pending'),
    'active_cse', (select count(*) from public.subscriptions where track = 'CSE' and status = 'active' and expires_at > now()),
    'active_let', (select count(*) from public.subscriptions where track = 'LET' and status = 'active' and expires_at > now()),
    'total_users', (select count(*) from public.profiles),
    'total_exams', (select count(*) from public.exams where is_active),
    'total_questions', (select count(*) from public.exam_questions)
  );
$$;

revoke execute on function public.admin_stats() from anon;
grant execute on function public.admin_stats() to authenticated;

-- ============================================================
-- 10. STORAGE — receipts bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do update set public = true;

drop policy if exists "receipts_upload_own" on storage.objects;
create policy "receipts_upload_own" on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "receipts_read_own" on storage.objects;
create policy "receipts_read_own" on storage.objects
  for select using (
    bucket_id = 'receipts'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

-- ============================================================
-- 10b. TESTIMONIALS (real reviewee photos + messages)
-- Editable from the site: Admin > 💬 Testimonials
-- ============================================================
create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  track text not null default 'CSE' check (track in ('CSE', 'LET')),
  role text,                                             -- e.g. "CSE Professional passer"
  quote text not null,                                   -- the reviewee's message
  rating smallint not null default 5 check (rating between 1 and 5),
  photo_url text,                                        -- public URL in the 'testimonials' bucket
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists testimonials_public_idx
  on public.testimonials (is_published, sort_order, created_at desc);

alter table public.testimonials enable row level security;

drop policy if exists "testimonials_public_read" on public.testimonials;
create policy "testimonials_public_read" on public.testimonials
  for select using (is_published = true or public.is_admin());

drop policy if exists "testimonials_admin_all" on public.testimonials;
create policy "testimonials_admin_all" on public.testimonials
  for all using (public.is_admin()) with check (public.is_admin());

-- Storage bucket for testimonial photos (public = served to the landing page)
insert into storage.buckets (id, name, public)
values ('testimonials', 'testimonials', true)
on conflict (id) do update set public = true;

drop policy if exists "testimonials_photos_admin_insert" on storage.objects;
create policy "testimonials_photos_admin_insert" on storage.objects
  for insert with check (bucket_id = 'testimonials' and public.is_admin());

drop policy if exists "testimonials_photos_admin_update" on storage.objects;
create policy "testimonials_photos_admin_update" on storage.objects
  for update using (bucket_id = 'testimonials' and public.is_admin());

drop policy if exists "testimonials_photos_admin_delete" on storage.objects;
create policy "testimonials_photos_admin_delete" on storage.objects
  for delete using (bucket_id = 'testimonials' and public.is_admin());

-- ============================================================
-- 10c. COACHES (the review team shown on the site)
-- Also available standalone in supabase/coaches.sql
-- ============================================================
create table if not exists public.coaches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text,
  subjects text,
  bio text,
  photo_url text,
  facebook_url text,
  track text not null default 'BOTH' check (track in ('CSE', 'LET', 'BOTH')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists coaches_public_idx
  on public.coaches (is_active, sort_order, created_at);

alter table public.coaches enable row level security;

drop policy if exists "coaches_public_read" on public.coaches;
create policy "coaches_public_read" on public.coaches
  for select using (is_active = true or public.is_admin());

drop policy if exists "coaches_admin_all" on public.coaches;
create policy "coaches_admin_all" on public.coaches
  for all using (public.is_admin()) with check (public.is_admin());

-- Storage bucket for coach photos (public = served on the landing page)
insert into storage.buckets (id, name, public)
values ('coaches', 'coaches', true)
on conflict (id) do update set public = true;

drop policy if exists "coaches_photos_admin_insert" on storage.objects;
create policy "coaches_photos_admin_insert" on storage.objects
  for insert with check (bucket_id = 'coaches' and public.is_admin());

drop policy if exists "coaches_photos_admin_update" on storage.objects;
create policy "coaches_photos_admin_update" on storage.objects
  for update using (bucket_id = 'coaches' and public.is_admin());

drop policy if exists "coaches_photos_admin_delete" on storage.objects;
create policy "coaches_photos_admin_delete" on storage.objects
  for delete using (bucket_id = 'coaches' and public.is_admin());

-- Head coach seed so the site is never empty
insert into public.coaches (name, title, subjects, bio, facebook_url, track, sort_order, is_active)
select
  'Teacher Ceppee',
  'Head Review Coach',
  'Math, English, Filipino, General Information',
  'Years of experience teaching CSE and LET review. Thousands of Filipinos have already passed with his guidance — every lesson here comes from the review style he uses on his Facebook page.',
  'https://www.facebook.com/teacherceppee',
  'BOTH',
  1,
  true
where not exists (select 1 from public.coaches);

-- ============================================================
-- 11. SEED — topics, lessons, exams, questions (sample content)
-- Fixed UUIDs so references work; safe to re-run.
-- ============================================================

-- --- CSE topics ---
insert into public.topics (id, track, title, description, order_index) values
  ('a1000000-0000-0000-0000-000000000001', 'CSE', 'Mathematics', 'Fractions, percentages, word problems, and basic algebra — the most feared part of the CSE, made simple.', 1),
  ('a1000000-0000-0000-0000-000000000002', 'CSE', 'English Grammar & Vocabulary', 'Grammar rules, common errors, and vocabulary building for the verbal ability section.', 2),
  ('a1000000-0000-0000-0000-000000000003', 'CSE', 'Filipino', 'Bokabularyo, gramatika, at pagbasa nang may pag-unawa.', 3),
  ('a1000000-0000-0000-0000-000000000004', 'CSE', 'Clerical & Reasoning', 'Number sequences, coding-decoding, and clerical operations.', 4),
  ('a1000000-0000-0000-0000-000000000005', 'CSE', 'Philippine Constitution & Current Events', 'Key articles, rights, and what''s happening now.', 5)
on conflict (id) do nothing;

-- --- LET topics ---
insert into public.topics (id, track, title, description, order_index) values
  ('b1000000-0000-0000-0000-000000000001', 'LET', 'Professional Education', 'Principles of teaching, curriculum, assessment, and the code of ethics.', 1),
  ('b1000000-0000-0000-0000-000000000002', 'LET', 'General Education — English', 'Study and thinking skills, grammar, and literature.', 2),
  ('b1000000-0000-0000-0000-000000000003', 'LET', 'General Education — Math', 'Basic math, algebra, geometry, and problem solving.', 3),
  ('b1000000-0000-0000-0000-000000000004', 'LET', 'General Education — Science', 'Biology, physical science, and earth science essentials.', 4)
on conflict (id) do nothing;

-- --- CSE lesson (sample, free preview track) ---
insert into public.lessons (id, topic_id, title, is_free, content, order_index, is_published) values
  ('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'Welcome to CSE Review! How to use this reviewer', true,
   E'<h2>Kumusta, future Civil Servant! 🎉</h2>\n<p>This is your free preview lesson. Here''s how to get the most out of Ceppee Review:</p>\n<ul>\n<li><strong>Step 1:</strong> Read each topic''s lessons in order. Take your time — walang deadlines dito.</li>\n<li><strong>Step 2:</strong> Try the practice drills per topic para ma-check ang understanding mo.</li>\n<li><strong>Step 3:</strong> Take the timed mock exam under real exam conditions. No phone, no notes, oras na tumatakbo.</li>\n</ul>\n<blockquote>About the CSE: The Professional level has 170 items in 3 hours and 10 minutes, passing score is 80%. The Sub-Professional level has 165 items. Both include Filipino and English sections.</blockquote>\n<h3>Study tips from Teacher Ceppee</h3>\n<p>Don''t memorize — <strong>understand the pattern</strong>. Ang CSE exam ay pattern-based. Kapag naintindihan mo kung paano nag-iisip ang exam writers, mas madali kang makakita ng tamang sagot kahit hindi mo kabisado ang formula.</p>',
   1, true)
on conflict (id) do nothing;

insert into public.lessons (id, topic_id, title, content, order_index, is_published) values
  ('c1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001',
   'Fractions without tears',
   E'<h2>Working with fractions</h2>\n<p><strong>Adding fractions:</strong> same denominator? Add the numerators lang. Different denominator? Find the LCD first.</p>\n<p>Example: 1/4 + 1/6 → LCD is 12 → 3/12 + 2/12 = <strong>5/12</strong></p>\n<h3>Multiplying is EASIER than adding</h3>\n<p>Multiply straight across: (2/3) × (3/4) = 6/12 = <strong>1/2</strong>. Simplify lang pagkatapos.</p>\n<h3>Dividing = multiply by the reciprocal</h3>\n<p>(2/3) ÷ (4/5) → flip the second fraction → (2/3) × (5/4) = 10/12 = <strong>5/6</strong></p>\n<blockquote>Exam tip: sa CSE, madalas ang fractions ay naka-word problem form. Practice converting statements like "half of the remaining third" into equations.</blockquote>',
   2, true)
on conflict (id) do nothing;

-- --- LET lesson (sample) ---
insert into public.lessons (id, topic_id, title, is_free, content, order_index, is_published) values
  ('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001',
   'Welcome to LET Review! How to use this reviewer', true,
   E'<h2>Magandang araw, future LPT! 🍎</h2>\n<p>This free preview lesson shows you how the reviewer works:</p>\n<ul>\n<li><strong>Professional Education</strong> is 40% of your score — the biggest chunk. Focus dito first.</li>\n<li><strong>General Education</strong> is 20%, and your specialization is the other 40%.</li>\n<li>Passing score: 75%, walang retake ng specific subjects — bagsak lahat o pasada lahat.</li>\n</ul>\n<h3>Strategy</h3>\n<p>Ang LET ay <strong>case-based</strong>. Hindi lang definition ang tinatanong — scenarios na involve teaching situations. Sanayin ang sarili na mag-isip na teacher: "Ano ang BEST na gagawin ng guro sa sitwasyong ito?"</p>\n<blockquote>Watch for words like BEST, FIRST, and EXCEPT sa question — ito ang madalas maging sanangan bakit mali ang sagot kahit alam mo ang topic.</blockquote>',
   1, true)
on conflict (id) do nothing;

-- --- Exams & questions are NOT seeded here ---
-- The exam catalogue (CSE Professional/Sub-Professional mocks, LET Elementary
-- and Secondary mocks, free samplers) is created by supabase/study-modes.sql,
-- together with the tagged question bank, the locked answer key and the study
-- mode RPCs. Real questions are uploaded from the admin panel
-- (Admin > Question Bank), never from this file.

-- ============================================================
-- DONE! Next steps:
-- 1. Create your two admin accounts (Sign up on the site), then run:
--    update public.profiles set is_admin = true where email = 'admin1@email.com';
--    update public.profiles set is_admin = true where email = 'admin2@email.com';
-- 2. Disable "Confirm email" in Authentication > Settings for easy testing.
-- ============================================================
