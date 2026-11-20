-- Reading library: books -> sections, gated exactly like lessons.
--
-- The reviewer notes are a separate product from the question bank: a student opens
-- /read, picks a subject, and reads the notes section by section. Access mirrors the
-- paid model already used for lessons -- the FIRST section of every book is free (a
-- taste), everything else needs an active subscription on the book's track.

create table if not exists public.reading_books (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('CSE','LET')),
  level text not null default 'both' check (level in ('elementary','secondary','both')),
  specialization text,
  subject text not null,
  title text not null,
  volume int not null default 1,
  slug text not null,
  description text,
  source_file text,
  word_count int not null default 0,
  part_count int not null default 0,
  section_count int not null default 0,
  order_index int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (track, slug)
);

create table if not exists public.reading_sections (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.reading_books(id) on delete cascade,
  part_no int not null default 1,
  part_title text not null default '',
  section_no int not null default 1,
  title text not null,
  html text not null default '',
  word_count int not null default 0,
  order_index int not null,
  is_free boolean not null default false,
  created_at timestamptz not null default now(),
  unique (book_id, order_index)
);

create index if not exists reading_sections_book_idx
  on public.reading_sections (book_id, order_index);

create table if not exists public.reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  section_id uuid not null references public.reading_sections(id) on delete cascade,
  completed_at timestamptz,
  last_read_at timestamptz not null default now(),
  primary key (user_id, section_id)
);

create index if not exists reading_progress_user_idx on public.reading_progress (user_id);

-- ------------------------------------------------------------------ RLS
alter table public.reading_books enable row level security;
alter table public.reading_sections enable row level security;
alter table public.reading_progress enable row level security;

-- The shelf is public (it is the product's table of contents); the text is not.
drop policy if exists "reading_books_read" on public.reading_books;
create policy "reading_books_read" on public.reading_books
  for select using (is_published = true or public.is_admin());

drop policy if exists "reading_books_admin" on public.reading_books;
create policy "reading_books_admin" on public.reading_books
  for all using (public.is_admin());

-- A section is readable when it is the free sample, when the reader holds an active
-- subscription on the book's track, or when the reader is an admin.
drop policy if exists "reading_sections_read" on public.reading_sections;
create policy "reading_sections_read" on public.reading_sections
  for select using (
    is_free
    or public.is_admin()
    or exists (
      select 1 from public.reading_books b
       where b.id = reading_sections.book_id
         and b.is_published
         and public.user_has_active_sub(b.track)
    )
  );

drop policy if exists "reading_sections_admin" on public.reading_sections;
create policy "reading_sections_admin" on public.reading_sections
  for all using (public.is_admin());

drop policy if exists "reading_progress_own" on public.reading_progress;
create policy "reading_progress_own" on public.reading_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "reading_progress_admin" on public.reading_progress;
create policy "reading_progress_admin" on public.reading_progress
  for all using (public.is_admin());

-- ------------------------------------------------------------------ helpers
-- Section list for a book without shipping the HTML to the TOC page.
create or replace function public.reading_toc(p_slug text)
returns table (
  part_no int, part_title text, section_no int, id uuid, title text,
  word_count int, is_free boolean, order_index int
) language sql security definer stable set search_path = public as $$
  select s.part_no, s.part_title, s.section_no, s.id, s.title,
         s.word_count, s.is_free, s.order_index
    from public.reading_sections s
    join public.reading_books b on b.id = s.book_id
   where b.slug = p_slug and b.is_published
   order by s.order_index;
$$;

-- How many sections of this book the caller can actually open.
create or replace function public.reading_access(p_slug text)
returns table (total int, readable int, completed int)
language sql security definer stable set search_path = public as $$
  select
    (select count(*)::int from public.reading_sections s
       join public.reading_books b on b.id = s.book_id where b.slug = p_slug),
    (select count(*)::int from public.reading_sections s
       join public.reading_books b on b.id = s.book_id
      where b.slug = p_slug
        and (s.is_free or public.is_admin() or public.user_has_active_sub(b.track))),
    (select count(*)::int from public.reading_progress p
       join public.reading_sections s on s.id = p.section_id
       join public.reading_books b on b.id = s.book_id
      where b.slug = p_slug and p.user_id = auth.uid() and p.completed_at is not null);
$$;

-- Everything the shelf needs in one call: the book, how much of it the caller may
-- open, and how much of it they have finished.
create or replace function public.reading_shelf()
returns table (
  id uuid, title text, slug text, subject text, specialization text, level text,
  volume int, word_count int, section_count int, part_count int, description text,
  order_index int, readable int, completed int
) language sql security definer stable set search_path = public as $$
  select b.id, b.title, b.slug, b.subject, b.specialization, b.level, b.volume,
         b.word_count, b.section_count, b.part_count, b.description, b.order_index,
         (select count(*)::int from public.reading_sections s where s.book_id = b.id
            and (s.is_free or public.is_admin()
                 or public.user_has_active_sub(b.track)))::int,
         (select count(*)::int from public.reading_progress p
            join public.reading_sections s on s.id = p.section_id
           where s.book_id = b.id and p.user_id = auth.uid()
             and p.completed_at is not null)::int
    from public.reading_books b
   where b.is_published
   order by b.order_index, b.volume;
$$;
