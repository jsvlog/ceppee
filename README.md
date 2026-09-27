# Ceppee Review 🎓

Online reviewer SaaS for the **Civil Service Exam (CSE)** and **Licensure Examination for Teachers (LET)** — by Teacher Ceppee.

Stack: Next.js 16 · Tailwind CSS 4 · Supabase (auth, DB, storage) · Vercel

## Features

- 🏛️🍎 Two review tracks (CSE / LET), separate ₱500 subscriptions
- **Four study modes, all fed by one tagged question bank:**
  - ⏱️ **Full Mock Exam** — real item counts and real time limits (CSE Professional 170 items / 3h10m, Sub-Professional 165 / 2h40m, LET 150 per subtest). Questions are reshuffled every attempt, and the answer key never reaches the browser: grading happens server-side.
  - 🎯 **Subject Drill** — pick a section (Verbal, Numerical, Analytical, Clerical, General Info, Gen Ed, Prof Ed, Specialization), how many items and the difficulty. Instant explanation after every item.
  - 🃏 **Flashcards** — read, flip, then mark “alam ko” or “hindi ko”. Missed cards come back at the end until they stick.
  - 🔁 **Retry My Mistakes** — automatically builds a drill from the items you keep getting wrong. Fix one and it leaves the list.
- **Correct exam structure per track:** CSE Professional vs Sub-Professional (Analytical vs Clerical Ability) and LET Elementary vs Secondary (+ majorship for the Specialization subtest).
- 📊 Dashboard with per-section mastery bars and full result history.
- 📚 Lessons (text + video embeds) grouped by topic, with free-preview lessons
- 📱 Manual GCash / bank payment flow: unique centavo amount → receipt upload + 13-digit ref # → admin approval
- 🛠️ Admin panel: payment queue, users & subscriptions, topic/lesson manager, **question bank manager with tagged bulk import**, mock/exam builder, testimonials, coaches, payment settings
- 🔒 Row Level Security everywhere — paid content is gated at the database level, and the answer key lives in its own locked table

## Setup

1. **Supabase**: create a project at supabase.com (free tier works), then run in the SQL Editor, in this order:
   1. `supabase/schema.sql` — profiles, subscription/payment flow, lessons, topics, RLS
   2. `supabase/study-modes.sql` — question bank tags, the locked answer key (`question_keys`), the exam catalogue, per-question progress and every study-mode RPC
   Both files are idempotent — safe to re-run.
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

## Uploading the question bank (this is the important one)

Everything the students study comes from **one bank**. Admin → **🧠 Question Bank** → **+ Paste questions**.

Paste either format — or both mixed together:

**Block format** (one question per block, blank line between them):

```
TRACK: CSE
LEVEL: Professional
SUBJECT: Numerical Ability

1. What is 15% of 240?
A) 36
B) 32
C) 40
D) 24
ANSWER: A
EXPLANATION: 10% of 240 = 24, 5% = 12, so 15% = 36.

2. ...
```

**Table format** — paste straight out of Excel/Google Sheets (tab separated). A header row is detected automatically:

```
question	A	B	C	D	answer	explanation	subject	difficulty
What is 2+2?	3	4	5	6	B	Basic addition.	Numerical Ability	easy
```

Tag lines: `TRACK, LEVEL, SUBJECT, SUBTOPIC, SPECIALIZATION, DIFFICULTY, FREE, SOURCE`.
Answers can also be written as `SAGOT:` and explanations as `PALIWANAG:`.

Rules worth knowing:

- **Tags are sticky.** A `TRACK: LET` line half-way down the paste switches everything below it, which is how you'd paste a second section.
- **Levels:** `both` (shared by both papers), `professional`, `subprofessional`, `elementary`, `secondary`.
  - Shared CSE sections (Verbal, Numerical, General Information) should be `both` — the Professional and Sub-Professional papers then both use them.
  - `Analytical Ability` only exists on the Professional paper, `Clerical Ability` only on Sub-Professional. The importer refuses the wrong combination with a readable message.
  - LET Gen Ed / Prof Ed are `both` (Elementary and Secondary both take them). Majorship items are `specialization` + the major's name.
- **`FREE: yes`** marks sampler items — those are what non-subscribers get to try.
- **Subjects** must be one of: `Verbal Ability`, `Numerical Ability`, `Analytical Ability`, `Clerical Ability`, `General Information`, `General Education`, `Professional Education`, `Specialization`. Common shorthand is translated (`gened`, `profed`, `math`, `logic`, `gen info`…).
- Items without a subject still save, but they will not appear in subject drills — the importer warns you.
- The importer shows a live count plus any warnings/errors before you commit, and caps a single paste at 500 questions.
- **Mock exams draw from the bank**, so a mock has items as soon as the bank has items — no need to hand-assemble papers. The catalogue's item counts (170/165/150) are caps: with 40 items in the bank, the mock is a 40-item mock.

## Testimonials (real reviewee photos + messages)

The landing page carousel is powered by the `testimonials` table and managed
from the site — no code editing needed.

1. One-time: run `supabase/testimonials.sql` in the Supabase SQL Editor
   (or `supabase/schema.sql`, which already contains it).
2. Sign in as an admin → **Admin → 💬 Testimonials → + New Testimonial**.

## Dev

```bash
npm install
npm run dev
```

## Deploy

Push to GitHub → import in Vercel → add the 3 env vars → deploy.
