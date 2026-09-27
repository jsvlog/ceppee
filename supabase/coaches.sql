-- ============================================================
-- CEPPEE REVIEW — Coaches (the review team shown on the site)
-- Run this whole file in: Supabase Dashboard > SQL Editor > New query
-- Safe to re-run (idempotent).
--
-- After running this, go to Admin > 🧑‍🏫 Coaches on the site and add
-- your first coach. The homepage section stays hidden until you do.
-- ============================================================

-- ============================================================
-- 1. COACHES TABLE
-- ============================================================
create table if not exists public.coaches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text,                                              -- e.g. "Head Review Coach"
  subjects text,                                           -- comma separated: "Math, English, Filipino"
  bio text,                                                -- short intro, 1-3 sentences
  photo_url text,                                          -- public URL in the 'coaches' bucket
  facebook_url text,                                       -- their Messenger / page link
  track text not null default 'BOTH' check (track in ('CSE', 'LET', 'BOTH')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists coaches_public_idx
  on public.coaches (is_active, sort_order, created_at);

alter table public.coaches enable row level security;

-- Anyone (even logged-out visitors) can read active coaches.
-- Admins can read everything, including hidden ones.
drop policy if exists "coaches_public_read" on public.coaches;
create policy "coaches_public_read" on public.coaches
  for select using (is_active = true or public.is_admin());

-- Admins can insert / update / delete.
drop policy if exists "coaches_admin_all" on public.coaches;
create policy "coaches_admin_all" on public.coaches
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 2. STORAGE — coach photos bucket (public read)
-- ============================================================
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

-- ============================================================
-- 3. HEAD COACH — Teacher Ceppee himself, so the site is never empty
-- ============================================================
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
-- DONE. Now open Admin > 🧑‍🏫 Coaches to add the rest of the team.
-- ============================================================
