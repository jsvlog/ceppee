# Ceppee Review 🎓

Online reviewer SaaS for the **Civil Service Exam (CSE)** and **Licensure Examination for Teachers (LET)** — by Teacher Ceppee.

Stack: Next.js 16 · Tailwind CSS 4 · Supabase (auth, DB, storage) · Vercel

## Features
- 🏛️🍎 Two review tracks (CSE / LET), separate ₱500 subscriptions
- 📚 Lessons (text + video embeds) grouped by topic, with free-preview lessons
- ⏱️ Timed mock exams + practice mode with instant explanations
- 📱 Manual GCash / bank payment flow: unique centavo amount → receipt upload + 13-digit ref # → admin approval
- 🛠️ Admin panel: payment queue, users & subscriptions (grant/extend/revoke), topic/lesson manager, exam & question manager (with bulk import), payment details settings
- 🔒 Row Level Security everywhere — paid content is gated at the database level

## Setup

1. **Supabase**: create a project at supabase.com (free tier works), then run the whole `supabase/schema.sql` in the SQL Editor.
2. **Env vars** (`.env.local` for dev; Vercel dashboard for prod):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. **Admins**: sign up on the site, then in SQL Editor:
   ```sql
   update public.profiles set is_admin = true where email = 'you@email.com';
   ```
4. **Auth settings**: Supabase Dashboard → Authentication → disable "Confirm email" (or configure SMTP).
5. **Payment details**: Admin → Settings tab — set the real GCash number/name and bank details.

## Testimonials (real reviewee photos + messages)

The landing page carousel is powered by the `testimonials` table and managed
from the site — no code editing needed.

1. One-time: run `supabase/testimonials.sql` in the Supabase SQL Editor
   (creates the table + the public `testimonials` photo bucket). Already
   included in `supabase/schema.sql` for fresh installs.
2. Sign in as an admin → **Admin → 💬 Testimonials → + New Testimonial**.
3. Upload the photo (big phone photos are auto-resized), type the name, pick
   CSE/LET, paste their message, then Save. It appears on the landing page
   immediately. Untick "Show on the landing page" to keep one hidden.

If the table is empty, the landing page falls back to the built-in sample
quotes in `src/components/Testimonials.tsx`.

## Dev

```bash
npm install
npm run dev
```

## Deploy

Push to GitHub → import in Vercel → add the 3 env vars → deploy.
