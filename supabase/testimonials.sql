-- ============================================================
-- CEPPEE REVIEW — Testimonials (real reviewee photos + messages)
-- Run this whole file in: Supabase Dashboard > SQL Editor > New query
-- Safe to re-run (idempotent).
--
-- Also already included in supabase/schema.sql (section 10b) for fresh installs.
-- ============================================================

-- ============================================================
-- 1. TESTIMONIALS TABLE
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

-- Anyone (even logged-out visitors) can read published testimonials.
-- Admins can read everything, including drafts.
drop policy if exists "testimonials_public_read" on public.testimonials;
create policy "testimonials_public_read" on public.testimonials
  for select using (is_published = true or public.is_admin());

-- Admins can insert / update / delete.
drop policy if exists "testimonials_admin_all" on public.testimonials;
create policy "testimonials_admin_all" on public.testimonials
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 2. STORAGE — testimonial photos bucket (public read)
-- ============================================================
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
-- DONE. Now go to Admin > 💬 Testimonials on the site and add
-- your first real testimonial through the panel.
-- ============================================================
