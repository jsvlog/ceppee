-- ============================================================
-- STUDY ROOMS & USER LABELS / BADGES
-- ============================================================
-- 1. Extend profiles with user_label (Admin, Coach, Achievement, Special Badge)
alter table public.profiles add column if not exists user_label text;
alter table public.profiles add column if not exists user_badge_color text;

-- 2. Study Rooms table (Admin creates rooms for subjects, majors, or exams)
create table if not exists public.study_rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  track text not null default 'LET' check (track in ('CSE', 'LET', 'BOTH')),
  category text not null default 'general' check (category in ('general', 'subject', 'major', 'exam')),
  subject text,
  specialization text,
  icon text not null default '💬',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.study_rooms enable row level security;

drop policy if exists "study_rooms_read_all" on public.study_rooms;
create policy "study_rooms_read_all" on public.study_rooms
  for select using (is_active = true or public.is_admin());

drop policy if exists "study_rooms_admin_all" on public.study_rooms;
create policy "study_rooms_admin_all" on public.study_rooms
  for all using (public.is_admin());

-- 3. Study Room Messages table
create table if not exists public.study_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.study_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1500),
  created_at timestamptz not null default now()
);

create index if not exists study_room_messages_room_time_idx
  on public.study_room_messages (room_id, created_at desc);

create index if not exists study_room_messages_time_idx
  on public.study_room_messages (created_at desc);

alter table public.study_room_messages enable row level security;

drop policy if exists "study_room_messages_read_auth" on public.study_room_messages;
create policy "study_room_messages_read_auth" on public.study_room_messages
  for select using (auth.uid() is not null);

drop policy if exists "study_room_messages_insert_own" on public.study_room_messages;
create policy "study_room_messages_insert_own" on public.study_room_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "study_room_messages_delete_own_or_admin" on public.study_room_messages;
create policy "study_room_messages_delete_own_or_admin" on public.study_room_messages
  for delete using (auth.uid() = user_id or public.is_admin());

-- 4. RPC: get_study_room_messages(p_room_id, p_limit)
-- Returns messages with sender's display name, is_admin, user_label, user_badge_color
-- without exposing emails or opening profiles table to full public select.
drop function if exists public.get_study_room_messages(uuid, int);
create function public.get_study_room_messages(p_room_id uuid, p_limit int default 80)
returns table(
  id uuid,
  room_id uuid,
  user_id uuid,
  body text,
  created_at timestamptz,
  display_name text,
  is_admin boolean,
  user_label text,
  user_badge_color text,
  is_me boolean
) language sql security definer set search_path = public as $$
  select sub.id,
         sub.room_id,
         sub.user_id,
         sub.body,
         sub.created_at,
         sub.display_name,
         sub.is_admin,
         sub.user_label,
         sub.user_badge_color,
         sub.is_me
    from (
      select m.id,
             m.room_id,
             m.user_id,
             m.body,
             m.created_at,
             case
               when coalesce(trim(p.full_name), '') = '' then 'Ka-Ceppee #' || left(p.id::text, 4)
               else trim(p.full_name)
             end as display_name,
             coalesce(p.is_admin, false) as is_admin,
             p.user_label,
             p.user_badge_color,
             (m.user_id = auth.uid()) as is_me
        from public.study_room_messages m
        join public.profiles p on p.id = m.user_id
       where m.room_id = p_room_id
       order by m.created_at desc
       limit greatest(1, least(coalesce(p_limit, 80), 200))
    ) sub
   order by sub.created_at asc;
$$;

-- 5. RPC: get_recent_study_chat(p_limit)
-- Powers the top-bar Study Room popup preview + active count
drop function if exists public.get_recent_study_chat(int);
create function public.get_recent_study_chat(p_limit int default 5)
returns table(
  id uuid,
  room_id uuid,
  room_slug text,
  room_title text,
  user_id uuid,
  body text,
  created_at timestamptz,
  display_name text,
  is_admin boolean,
  user_label text,
  user_badge_color text
) language sql security definer set search_path = public as $$
  select m.id,
         m.room_id,
         r.slug as room_slug,
         r.title as room_title,
         m.user_id,
         m.body,
         m.created_at,
         case
           when coalesce(trim(p.full_name), '') = '' then 'Ka-Ceppee #' || left(p.id::text, 4)
           else trim(p.full_name)
         end as display_name,
         coalesce(p.is_admin, false) as is_admin,
         p.user_label,
         p.user_badge_color
    from public.study_room_messages m
    join public.study_rooms r on r.id = m.room_id
    join public.profiles p on p.id = m.user_id
   where r.is_active = true
   order by m.created_at desc
   limit greatest(1, least(coalesce(p_limit, 5), 30));
$$;

revoke execute on function public.get_study_room_messages(uuid, int) from public, anon;
revoke execute on function public.get_recent_study_chat(int) from public, anon;
grant execute on function public.get_study_room_messages(uuid, int) to authenticated;
grant execute on function public.get_recent_study_chat(int) to authenticated;

-- 6. Seed default study rooms (idempotent by slug)
insert into public.study_rooms (slug, title, subtitle, track, category, subject, specialization, icon, sort_order, is_active)
values
  ('all-majors', 'All Majors & General Lounge', 'Everyone is welcome here — ask questions, share tips, or motivate each other.', 'BOTH', 'general', null, null, '🌍', 1, true),
  ('let-gen-ed', 'General Education', 'English, Filipino, Math, Science, Social Studies & ICT discussions.', 'LET', 'subject', 'General Education', null, '🎓', 2, true),
  ('let-prof-ed', 'Professional Education', 'Teaching principles, child development, assessment & Code of Ethics.', 'LET', 'subject', 'Professional Education', null, '🧑‍🏫', 3, true),
  ('cse-lounge', 'Civil Service Exam (CSE)', 'Professional & Sub-Professional verbal, numerical, analytical & clerical review.', 'CSE', 'exam', null, null, '🏛️', 4, true),
  ('major-english', 'English Majorship', 'Linguistics, literature, campus journalism & language teaching.', 'LET', 'major', 'Specialization', 'English', '📖', 10, true),
  ('major-filipino', 'Filipino Majorship', 'Wika, panitikan, pagtuturo at pananaliksik sa Filipino.', 'LET', 'major', 'Specialization', 'Filipino', '🇵🇭', 11, true),
  ('major-mathematics', 'Mathematics Majorship', 'Algebra, calculus, geometry, statistics & problem-solving.', 'LET', 'major', 'Specialization', 'Mathematics', '➗', 12, true),
  ('major-science', 'Science Majorship', 'Biology, chemistry, physics, earth science & inquiry.', 'LET', 'major', 'Specialization', 'Science', '🔬', 13, true),
  ('major-social-science', 'Social Science Majorship', 'History, economics, politics, geography & sociology.', 'LET', 'major', 'Specialization', 'Social Science', '🗺️', 14, true),
  ('major-pe', 'Physical Education (PE)', 'Sports, wellness, movement education & coaching.', 'LET', 'major', 'Specialization', 'Physical Education', '🏃', 15, true),
  ('major-cae', 'Culture and Arts Education', 'Visual arts, music, theater, dance & cultural heritage.', 'LET', 'major', 'Specialization', 'Culture and Arts Education', '🎨', 16, true),
  ('major-tle', 'TLE Majorship', 'Home economics, ICT, agri-fishery, industrial arts & entrepreneurship.', 'LET', 'major', 'Specialization', 'TLE', '🛠️', 17, true),
  ('major-values', 'Values Education', 'Ethics, moral philosophy, personhood & EsP.', 'LET', 'major', 'Specialization', 'Values Education', '💛', 18, true),
  ('major-sned', 'Special Needs Education', 'Inclusive education, IEP, learners with disabilities & interventions.', 'LET', 'major', 'Specialization', 'Special Needs Education', '🧩', 19, true),
  ('major-beced', 'Early Childhood Education', 'ECCD, kindergarten, play-based learning & child development.', 'LET', 'major', 'Specialization', 'Early Childhood Education', '🌱', 20, true)
on conflict (slug) do nothing;
