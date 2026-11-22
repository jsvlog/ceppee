-- How many items sit in each majorship paper.
--
-- The ₱299 subject pass sells ONE paper, and "Specialization" is not one paper:
-- English, Filipino, Mathematics, TLE... each is its own. The pricing page needs
-- the list with counts, and it must not leak question text, so this returns
-- numbers only.

create or replace function public.bank_majors(p_track text)
returns table (level text, specialization text, total bigint)
language sql stable security definer set search_path = public as $$
  select q.level, q.specialization, count(*)::bigint
    from public.exam_questions q
   where q.track = p_track
     and q.is_active
     and q.subject = 'Specialization'
     and q.specialization is not null
   group by q.level, q.specialization
   order by count(*) desc, q.specialization;
$$;

revoke execute on function public.bank_majors(text) from public;
-- Counts only, no question text: safe for the pricing page to read while signed out.
grant execute on function public.bank_majors(text) to anon;
grant execute on function public.bank_majors(text) to authenticated, service_role;
