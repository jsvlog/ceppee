# Homepage copy passes — 5 screenshots from `C:\Users\legor\Downloads\changes`

## Goal

Apply the owner's five annotated corrections to the Teacher Ceppee homepage, the coaches
section and the coach record: a new hero headline with a real package list, lesson and mock
numbers that come from the database, new final-CTA copy, a reworked LET card, and the
coach's real photo.

## Confirmed decisions (owner answered these before this plan was written)

| Shot | Where | Change |
|---|---|---|
| `1.png` | Final CTA band, bottom of `/` | Headline `Ready to pass?` → **`Ready to start your review?`**; CSE button → **`Explore CSE Review — ₱499`**; LET button → **`Explore LET Review — from ₱399`**; **both buttons white** ("same white button") |
| `2.png` | Testimonials subtitle | `…has helped get their license.` → **`…has helped them pass their exams.`** |
| `3.png` | Coaches heading + avatar | `Meet the coaches` → **`Meet Your Review Coaches`** (home section AND `/coaches`); the `TC` initials circle → **his real photo** (`public/logo.jpg`) |
| `4.png` | "Which exam are you reviewing for?" LET card | **Remove** the bullet `Professional Education focus (40% of the score)`; **add** bullets `15 mock exams for each major` and `50 mock exams for Prof Ed and Gen Ed`; show **₱399 and ₱499 both**, same font, same bold; `Start LET Review` text **bigger/bolder while the button keeps the CSE button's size** |
| `5.png` | Hero | Headline → **`Your CSE and LET Goal — A Clearer Way to Prepare`**; **delete** `The deal: from ₱149 a month, or one payment until exam day.` and put **one pill row of the five packages** in its place (`₱149 monthly · ₱299 one subject · ₱399 BEED · ₱499 BSED · ₱499 CSE`); button `Choose Your Review →` → **`Explore our packages →`**; the lessons figure must count the **reading library** (**`✓ 3,801 lessons in the reading library`**); the mock figure counts the real papers (**`✓ 200+ mock exams, unlimited attempts`**) |

(Owner typed "CSC" once — read as **CSE**.)

## Current context / assumptions

- Repo: `D:\hermes project\teacher ceppee` — Next.js 16, Tailwind 4, branch `master`.
- The homepage is one file: `src/app/(site)/page.tsx` (298 lines). Sections in order:
  hero (80–117), track chooser (119–184), "From Teacher Ceppee" (186–216),
  features (218–239), `<CoachesSection>` (242), `<Testimonials>` (245), FAQ (247–270),
  final CTA (272–295).
- Hero today: `h1` = "Pass the CSE or LET — / on your first take."; a `<p>` whose second
  sentence is the `The deal: from ₱149…` line; CTAs `Choose Your Review →` and
  `Try Free Preview`; then a feature strip
  `{stats.lessons}+ lessons · {stats.questions}+ practice questions · {stats.exams} mock & practice exams · GCash`.
- `getSiteStats()` + its `SiteStats` interface live in `src/lib/queries.ts` (10–39) and are
  consumed **only** by `page.tsx`.
- Live counts verified from Supabase today:
  - `reading_books` **15**, `reading_sections` **3,801**, 3,721,062 words.
  - `lessons` (published) **3** ← why the hero says "3+ lessons". It must stop counting this
    table and count the reading library instead.
  - `question_sets` **202 LET sets / 29,696 items** (each set = a full ~150-item paper,
    playable timed or as practice); CSE has **0 sets**. Per major 12–15 (TLE/English/BECEd
    12, Mathematics 15, rest 15). Prof Ed **21** sets, Gen Ed **25** → 46 set papers, plus
    4 LET blueprint mocks = **50**.
  - `exams` **8** rows, 2 of them 10-item free samplers — the literal "8" the owner circled.
- Prices live in one place: `PLANS` in `src/lib/paymongo.ts` (`monthly` 149, `subject` 299,
  `beed` 399, `bsed` 499, `csec` 499). The hero pills read their amounts from `PLANS` so no
  price is typed twice.
- The coach card already renders a photo when `coaches.photo_url` is set
  (`src/components/CoachesSection.tsx` 73–86); the single `coaches` row has
  `photo_url = null`, which is why the `TC` circle shows. **Photo = data only.**
- `public/logo.jpg` is **720×720** (square), so a 96 px `rounded-full` crop is clean.
- Tests: `node --test tests/*.test.mjs` → today **10 passing**. `node --test tests/` (directory
  form) fails on this box — always use the glob.
- `.env.local` exists. `.hermes/plans/` is tracked by git, so this plan ships with the push.

## Architecture / proposed approach

Copy-and-class change only: no new pages, no new components. `getSiteStats()` gains two
honest counters — `readingLessons` from `reading_sections` and `mockPapers` from
`question_sets` — and drops the `lessons`/`exams` counts it no longer needs; the hero renders
its package pills from `PLANS`; everything else is text and Tailwind classes inside three
existing files plus one `UPDATE` on `coaches`. A source-level contract test
(`tests/site-copy.test.mjs`) is written first, because the copy lives in JSX text and
rendered-HTML assertions are brittle (React splits `{expr}` into nodes like `₱<!-- -->149`).

## Step-by-step tasks

All commands run from `D:/hermes project/teacher ceppee` in git-bash.

---

### Task 0 — Baseline (1 min)

```bash
git status -sb
node --test tests/*.test.mjs 2>&1 | tail -8
```

Expected: `## master...origin/master` (clean), `ℹ pass 10`, `ℹ fail 0`.

---

### Task 1 — Write the failing copy test (4 min)

Create `tests/site-copy.test.mjs`:

```js
// tests/site-copy.test.mjs — pins the copy the owner asked for (Nov 2026 pass).
// Source-level assertions on purpose: the copy lives in JSX text and React splits
// `{expr}` into separate text nodes, so rendered-HTML matching is brittle here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const home = () => read("src/app/(site)/page.tsx");

test("hero: new headline, no 'The deal' sentence, packages CTA", () => {
  const src = home();
  assert.match(src, /Your CSE and LET Goal —/);
  assert.match(src, /A Clearer Way to Prepare/);
  assert.ok(!src.includes("Pass the CSE or LET"), "old headline must go");
  assert.ok(!src.includes("The deal:"), "the ₱149 deal sentence must go");
  assert.match(src, /Explore our packages →/);
});

test("hero: pill row is built from PLANS, cheapest to complete", () => {
  const src = home();
  assert.match(src, /import \{ PLANS[^}]*\} from "@\/lib\/paymongo"/);
  assert.match(src, /plan: "monthly"[\s\S]*plan: "csec"/);
  assert.match(src, /₱\{PLANS\[p\.plan\]\.price\}/);
});

test("hero: lessons come from the reading library, mocks from the bank", () => {
  const src = home();
  assert.match(src, /lessons in the reading library/);
  assert.match(src, /mock exams, unlimited attempts/);
  assert.match(src, /Math\.floor\(stats\.mockPapers \/ 10\) \* 10/);
  assert.ok(!src.includes("mock & practice exams"));
  assert.ok(!src.includes("{stats.lessons}+"), "must not advertise the lessons table");
});

test("final CTA: 'Ready to start your review?' with two Explore buttons", () => {
  const src = home();
  assert.match(src, /Ready to start your review\?/);
  assert.match(src, /Explore CSE Review — ₱499/);
  assert.match(src, /Explore LET Review — from ₱399/);
  assert.ok(!src.includes("Ready to pass?"), "old headline should be gone");
});

test("final CTA: both buttons share one white button class", () => {
  const src = home();
  assert.match(src, /const ctaWhite =/);
  const uses = src.match(/\{ctaWhite\}/g) ?? [];
  assert.equal(uses.length, 2, "both CTA links must use ctaWhite");
  assert.ok(!src.includes("border-2 border-white/70"), "outlined LET button must go");
});

test("LET card: 40% bullet removed, two mock-count bullets added", () => {
  const src = home();
  assert.ok(!src.includes("Professional Education focus (40% of the score)"));
  assert.match(src, /15 mock exams for each major/);
  assert.match(src, /50 mock exams for Prof Ed and Gen Ed/);
});

test("LET card: ₱399 and ₱499 both visible, same class", () => {
  const src = home();
  assert.ok(!src.includes("/ BEED complete · ₱499 BSED"), "old combined label must go");
  assert.match(src, /₱399[\s\S]{0,120}BEED complete/);
  assert.match(src, /₱499[\s\S]{0,120}BSED complete/);
});

test("testimonials subtitle: 'helped them pass their exams'", () => {
  const t = read("src/components/Testimonials.tsx");
  assert.match(t, /helped them pass their exams\./);
  assert.ok(!t.includes("get their license"));
});

test("coaches heading is 'Meet Your Review Coaches' in both places", () => {
  const section = read("src/components/CoachesSection.tsx");
  const page = read("src/app/(site)/coaches/page.tsx");
  assert.match(section, /Review Coaches/);
  assert.match(page, /Review Coaches/);
  assert.ok(!section.includes("Meet the <span"), "old heading must go (section)");
  assert.ok(!page.includes("Meet the <span"), "old heading must go (page)");
  assert.match(page, /title: "Meet Your Review Coaches"/);
});
```

Run it — it must FAIL (the red step):

```bash
node --test tests/site-copy.test.mjs 2>&1 | tail -8
```

Expected: `ℹ pass 0`, `ℹ fail 9`.

Commit the red test on its own:

```bash
git add tests/site-copy.test.mjs
printf '%s\n' "test: pin the Nov 2026 homepage copy pass" > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

### Task 2 — Honest stats: reading lessons + mock papers (4 min)

File: `src/lib/queries.ts`. Replace the interface (lines 10–14):

```ts
export interface SiteStats {
  lessons: number;
  questions: number;
  exams: number;
}
```

with:

```ts
export interface SiteStats {
  /** Reading-library sections — what the hero advertises as "lessons". */
  readingLessons: number;
  questions: number;
  /** Full set papers = the mock exams a student can actually sit. */
  mockPapers: number;
}
```

Then replace the body of `getSiteStats` (lines 26–38):

```ts
    const [lessons, questions, exams] = await Promise.all([
      admin.from("lessons").select("id", { count: "exact", head: true }).eq("is_published", true),
      admin.from("exam_questions").select("id", { count: "exact", head: true }),
      admin.from("exams").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);
    return {
      lessons: lessons.count ?? 0,
      questions: questions.count ?? 0,
      exams: exams.count ?? 0,
    };
  } catch {
    return { lessons: 0, questions: 0, exams: 0 };
  }
```

with:

```ts
    const [lessons, questions, papers] = await Promise.all([
      admin.from("reading_sections").select("id", { count: "exact", head: true }),
      admin.from("exam_questions").select("id", { count: "exact", head: true }),
      admin.from("question_sets").select("id", { count: "exact", head: true }),
    ]);
    return {
      readingLessons: lessons.count ?? 0,
      questions: questions.count ?? 0,
      mockPapers: papers.count ?? 0,
    };
  } catch {
    return { readingLessons: 0, questions: 0, mockPapers: 0 };
  }
```

Sanity-check that nothing else used the old fields:

```bash
grep -rn "stats.lessons\|stats.exams" src
```

Expected: only `src/app/(site)/page.tsx:107` and `:109` (both rewritten in Task 3) — no
other file. If anything else shows up, fix it in this task before moving on.

---

### Task 3 — Hero: headline, package pills, both counters, button (8 min)

File: `src/app/(site)/page.tsx`

**(a)** Let the pills read real prices — line 3 becomes two imports:

```tsx
import { TRACK_LABEL } from "@/lib/format";
```

→

```tsx
import { TRACK_LABEL } from "@/lib/format";
import { PLANS, type PlanId } from "@/lib/paymongo";
```

**(b)** Add the pill list right after the `features` array (after line 42, `];`):

```tsx
// The hero advertises what is actually for sale. Prices are read from PLANS, so a price
// change is a one-line edit in src/lib/paymongo.ts; only the order and wording of the
// five pills live here.
const HERO_PACKAGES: { plan: PlanId; label: string }[] = [
  { plan: "monthly", label: "monthly" },
  { plan: "subject", label: "one subject" },
  { plan: "beed", label: "BEED complete" },
  { plan: "bsed", label: "BSED complete" },
  { plan: "csec", label: "CSE complete" },
];
```

**(c)** Replace the headline and the "deal" sentence (lines 90–97):

```jsx
            <h1 className="animate-fade-up mb-6 text-4xl font-black leading-tight tracking-tight text-[#16331f] sm:text-5xl lg:text-6xl">
              Pass the CSE or LET —<br />
              <span className="gradient-text">on your first take.</span>
            </h1>
            <p className="animate-fade-up mb-8 text-lg leading-relaxed text-[#5c7863] sm:text-xl">
              A complete online reviewer: lessons, practice drills, and realistic timed mock exams.
              The deal: <strong className="text-[#3d5c44]">from ₱149 a month</strong>, or one payment until exam day.
            </p>
```

→

```jsx
            <h1 className="animate-fade-up mb-6 text-4xl font-black leading-tight tracking-tight text-[#16331f] sm:text-5xl lg:text-6xl">
              Your CSE and LET Goal —<br />
              <span className="gradient-text">A Clearer Way to Prepare.</span>
            </h1>
            <p className="animate-fade-up mb-6 text-lg leading-relaxed text-[#5c7863] sm:text-xl">
              A complete online reviewer: lessons, practice drills, and realistic timed mock exams.
            </p>
            <div className="animate-fade-up mb-8 flex flex-wrap items-center justify-center gap-2">
              {HERO_PACKAGES.map((p) => (
                <span
                  key={p.plan}
                  className="inline-flex items-baseline gap-1.5 rounded-full border border-[#d9e6d3] bg-white/85 px-3.5 py-1.5 text-sm font-semibold text-[#3d5c44] shadow-sm"
                >
                  <strong className="text-[#16331f]">₱{PLANS[p.plan].price}</strong>
                  {p.label}
                </span>
              ))}
            </div>
```

**(d)** The primary CTA (line 100) — the note's "Explore our packages":

```jsx
                Choose Your Review →
```

→

```jsx
                Explore our packages →
```

**(e)** The feature strip (lines 107–109):

```jsx
              <span>✓ {stats.lessons}+ lessons</span>
              <span>✓ {stats.questions}+ practice questions</span>
              <span>✓ {stats.exams} mock & practice exams</span>
```

→

```jsx
              <span>✓ {stats.readingLessons.toLocaleString("en-PH")} lessons in the reading library</span>
              <span>✓ {stats.questions.toLocaleString("en-PH")}+ practice questions</span>
              <span>
                ✓ {Math.floor(stats.mockPapers / 10) * 10}+ mock exams, unlimited attempts
              </span>
```

With today's data this renders **`✓ 3,801 lessons in the reading library`**,
**`✓ 29,696+ practice questions`**, **`✓ 200+ mock exams, unlimited attempts`**.

```bash
node --test tests/site-copy.test.mjs 2>&1 | grep -E "hero:|pass |fail "
npx tsc -p tsconfig.json --noEmit
```

Expected: the three `hero:` tests pass; `tsc` prints nothing (exit 0).

Commit:

```bash
git add src/lib/queries.ts "src/app/(site)/page.tsx"
printf '%s\n' "feat(home): new hero headline, package pills from PLANS, real lesson/mock counts" > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

### Task 4 — Final CTA band (3 min)

File: `src/app/(site)/page.tsx`

**(a)** Shared white-button class, right after the imports (after the `LogoMark` import):

```tsx
// One white button, used by both calls to action in the final band — the owner asked
// for the LET button to look the same as the CSE one, not outlined.
const ctaWhite =
  "rounded-xl bg-white px-8 py-3.5 font-bold text-[#15803d] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl";
```

**(b)** Headline (line 279):

```jsx
              Ready to pass?
```

→

```jsx
              Ready to start your review?
```

**(c)** The two buttons (lines 286–291):

```jsx
              <Link href="/review/cse" className="rounded-xl bg-white px-8 py-3.5 font-bold text-[#15803d] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl">
                CSE Review — ₱499
              </Link>
              <Link href="/review/let" className="rounded-xl border-2 border-white/70 px-8 py-3.5 font-bold text-white transition hover:bg-white/10">
                LET Review — ₱399
              </Link>
```

→

```jsx
              <Link href="/review/cse" className={ctaWhite}>
                Explore CSE Review — ₱499
              </Link>
              <Link href="/review/let" className={ctaWhite}>
                Explore LET Review — from ₱399
              </Link>
```

```bash
node --test tests/site-copy.test.mjs 2>&1 | grep -E "final CTA|pass |fail "
```

Expected: both `final CTA` tests pass. Commit:

```bash
git add "src/app/(site)/page.tsx"
printf '%s\n' "feat(home): final CTA asks 'Ready to start your review?' with two white Explore buttons" > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

### Task 5 — LET card: bullets, both prices, button size (5 min)

File: `src/app/(site)/page.tsx`

**(a)** Bullets (lines 169–173):

```jsx
              <ul className="mb-6 space-y-2 text-sm text-[#3d5c44]">
                <li className="flex items-start gap-2"><span className="text-[#ca8a04]">●</span> Professional Education focus (40% of the score)</li>
                <li className="flex items-start gap-2"><span className="text-[#ca8a04]">●</span> Case-based timed mock exams</li>
                <li className="flex items-start gap-2"><span className="text-[#ca8a04]">●</span> Free preview lesson + sample drill</li>
              </ul>
```

→

```jsx
              <ul className="mb-6 space-y-2 text-sm text-[#3d5c44]">
                <li className="flex items-start gap-2"><span className="text-[#ca8a04]">●</span> 15 mock exams for each major</li>
                <li className="flex items-start gap-2"><span className="text-[#ca8a04]">●</span> 50 mock exams for Prof Ed and Gen Ed</li>
                <li className="flex items-start gap-2"><span className="text-[#ca8a04]">●</span> Case-based timed mock exams</li>
                <li className="flex items-start gap-2"><span className="text-[#ca8a04]">●</span> Free preview lesson + sample drill</li>
              </ul>
```

**(b)** Price row (lines 174–177):

```jsx
              <div className="mb-6 flex items-baseline gap-2">
                <span className="text-3xl font-black text-[#16331f]">₱399</span>
                <span className="text-sm text-[#5c7863]">/ BEED complete · ₱499 BSED</span>
              </div>
```

→

```jsx
              <div className="mb-6 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <span className="text-3xl font-black text-[#16331f]">
                  ₱399 <span className="text-sm font-bold text-[#5c7863]">BEED complete</span>
                </span>
                <span className="text-3xl font-black text-[#16331f]">
                  ₱499 <span className="text-sm font-bold text-[#5c7863]">BSED complete</span>
                </span>
              </div>
```

Both amounts are `text-3xl font-black`, both labels `text-sm font-bold` — same font, same
weight, both visible.

**(c)** Both card buttons get identical geometry, with the LET text larger/bolder (lines 151
and 178):

```jsx
                <Link href="/review/cse" className="btn-primary block px-6 py-3 text-center text-sm">
```

→

```jsx
                <Link href="/review/cse" className="btn-primary block px-6 py-3.5 text-center text-base font-extrabold">
```

```jsx
              <Link href="/review/let" className="btn-gold block px-6 py-3 text-center text-sm">
```

→

```jsx
              <Link href="/review/let" className="btn-gold block px-6 py-3.5 text-center text-base font-extrabold">
```

Identical padding + identical font size = identical button height; the CSE one grows ~6 px
so the two stay the same size, which is what the note asked for.

```bash
node --test tests/site-copy.test.mjs 2>&1 | grep -E "LET card|pass |fail "
```

Expected: both `LET card` tests pass. Commit:

```bash
git add "src/app/(site)/page.tsx"
printf '%s\n' "feat(home): LET card drops the 40% bullet, shows both prices, bigger button text" > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

### Task 6 — Testimonials subtitle (2 min)

File: `src/components/Testimonials.tsx` (lines 200–204)

```jsx
        <p className="mb-10 text-center mx-auto max-w-xl text-[#5c7863]">
          Real people, real passes. A taste of the reviewees Teacher Ceppee has
          helped get their license.
        </p>
```

→

```jsx
        <p className="mb-10 text-center mx-auto max-w-xl text-[#5c7863]">
          Real people, real passes. A taste of the reviewees Teacher Ceppee has
          helped them pass their exams.
        </p>
```

```bash
node --test tests/site-copy.test.mjs 2>&1 | grep -E "testimonials|pass |fail "
```

---

### Task 7 — Coaches heading, both places (3 min)

**(a)** `src/components/CoachesSection.tsx` line 155:

```jsx
              Meet the <span className="gradient-text">coaches</span>
```

→

```jsx
              Meet Your <span className="gradient-text">Review Coaches</span>
```

**(b)** `src/app/(site)/coaches/page.tsx` line 28 — the same replacement; and line 7:

```ts
  title: "Meet the Coaches",
```

→

```ts
  title: "Meet Your Review Coaches",
```

Leave the `description` (line 9) alone — it is prose, not the heading.

```bash
node --test tests/*.test.mjs 2>&1 | tail -8
```

Expected: `ℹ pass 19`, `ℹ fail 0` (10 original + 9 new). Commit:

```bash
git add src/components/Testimonials.tsx src/components/CoachesSection.tsx "src/app/(site)/coaches/page.tsx"
printf '%s\n' "feat(copy): 'Meet Your Review Coaches' + 'helped them pass their exams'" > /tmp/msg.txt
git commit -F /tmp/msg.txt
```

---

### Task 8 — The coach photo is data, not code (3 min)

```bash
cd "D:/hermes project/QUESTION BANK/_tools"
# only if the token file is missing (it is pruned with the scratch cache):
powershell -NoProfile -ExecutionPolicy Bypass -File "C:/Users/legor/AppData/Local/hermes/skills/software-development/teacher-ceppee/scripts/restore-sb-token.ps1"
python apply_sql.py -c "update public.coaches set photo_url = '/logo.jpg' where name = 'Teacher Ceppee' and coalesce(photo_url,'') = '';"
python apply_sql.py -c "select name, photo_url from public.coaches order by sort_order;"
```

Expected: `[{"name": "Teacher Ceppee", "photo_url": "/logo.jpg"}]`.

---

### Task 9 — Full check before shipping (5 min)

```bash
cd "D:/hermes project/teacher ceppee"
node --test tests/*.test.mjs 2>&1 | tail -8
npx tsc -p tsconfig.json --noEmit
npx eslint src --max-warnings=0
```

Expected: `ℹ pass 19 / ℹ fail 0`, `tsc` silent, eslint silent.

---

### Task 10 — Prove it on a production build (10 min)

```bash
NEXT_DIST_DIR=.next-verify npx next build
```

Expected: `Compiled successfully` + route table, no errors.

```bash
NEXT_DIST_DIR=.next-verify npx next start -p 3003
```

(run with `terminal(background=true)`).

```bash
curl -s http://localhost:3003/ > /tmp/home.html
grep -o "Your CSE and LET Goal" /tmp/home.html               # expect 1 line
grep -o "A Clearer Way to Prepare" /tmp/home.html            # expect 1 line
grep -c "Pass the CSE or LET" /tmp/home.html                 # expect 0
grep -c "The deal:" /tmp/home.html                           # expect 0
grep -o "Explore our packages" /tmp/home.html                # expect 1 line
grep -o "lessons in the reading library" /tmp/home.html      # expect 1 line
grep -o "3,801" /tmp/home.html                               # expect 1+ (number is its own text node)
grep -o "one subject" /tmp/home.html | wc -l                  # expect 1 (pill)
grep -o "CSE complete" /tmp/home.html | wc -l                 # expect 1 (pill)
grep -o "₱" /tmp/home.html | wc -l                            # expect >= 8 (pills + cards + CTA)
grep -o "mock exams, unlimited attempts" /tmp/home.html      # expect 1 line
grep -o "200+ mock exams" /tmp/home.html                     # expect NOTHING — {expr} is its own node; not a failure
grep -c "Explore CSE Review — ₱499" /tmp/home.html            # expect 1
grep -o "Explore LET Review — from ₱399" /tmp/home.html       # expect 1
grep -c "Professional Education focus" /tmp/home.html         # expect 0
grep -o "50 mock exams for Prof Ed and Gen Ed" /tmp/home.html # expect 1
grep -o "Meet Your Review Coaches" /tmp/home.html            # expect 1+ (heading + <title>)
grep -o "helped them pass their exams" /tmp/home.html         # expect 1
grep -o "logo.jpg" /tmp/home.html | wc -l                     # expect >= 2 (nav LogoMark + coach card)
grep -c "border-2 border-white/70" /tmp/home.html             # expect 0
```

Then clean up:

```bash
git checkout -- tsconfig.json          # NEXT_DIST_DIR builds rewrite it
cmd //c "taskkill /PID <pid from next start> /F"
```

If the page shows the old copy, a stale `next start` still owns port 3003 — kill the real
`next/dist/bin/next start` child, not the `npx` wrapper.

---

### Task 11 — Ship (5 min)

```bash
git add -A
cat > /tmp/msg.txt <<'MSG'
polish(home): Nov 2026 owner copy pass

- hero: "Your CSE and LET Goal - A Clearer Way to Prepare", package pills from PLANS
- hero: lessons counted from the reading library (3,801), mocks from question_sets (200+)
- final CTA: "Ready to start your review?", two white Explore buttons
- LET card: drop the 40% bullet, show 399 and 499 side by side, bigger button text
- coaches: "Meet Your Review Coaches", real photo instead of the TC initials
- testimonials: "helped them pass their exams"
MSG
git commit -F /tmp/msg.txt
git push origin master
```

Vercel auto-deploys `master`. Verify the live site after ~60 s:

```bash
curl -s https://www.teacherceppee.com | grep -o "Your CSE and LET Goal"
curl -s https://www.teacherceppee.com | grep -o "lessons in the reading library"
curl -s https://www.teacherceppee.com | grep -o "Ready to start your review"
```

Expected: one line each. If one is missing, check `git log --oneline -3 origin/master`
before touching code — it is usually the deploy, not the diff.

## Tests / validation

- **Unit.** `tests/site-copy.test.mjs` — 9 source-level assertions, written first and seen
  failing (`pass 0 / fail 9`), green after Tasks 3–7. Run `node --test tests/*.test.mjs`
  → `pass 19 / fail 0`.
- **Types.** `npx tsc -p tsconfig.json --noEmit` → silent, exit 0. This is what catches a
  missed `stats.lessons` / `stats.exams` reference after the rename.
- **Lint.** `npx eslint src --max-warnings=0` → silent.
- **Build + rendered HTML.** Task 10: production build, `next start` on :3003, grep list —
  the only proof the JSX reached a real page.
- **Data.** Task 8's `select name, photo_url from coaches` — the card can only show a photo
  if that column is non-null.
- **Live.** Task 11's three curls against `https://www.teacherceppee.com`.

## Risks, tradeoffs, open questions

1. **`50 mock exams for Prof Ed and Gen Ed`** only holds if you count the 46 set papers
   (Prof Ed 21 + Gen Ed 25) plus the 4 LET blueprint mocks. Sets alone are **46**. Same for
   **`15 mock exams for each major`**: TLE, English and BECEd have **12**. Strictly-true
   wording is `up to 15 mock exams per major` / `46+ mock exams for Prof Ed and Gen Ed` —
   two strings in `page.tsx`.
2. **`200+ mock exams` describes LET only.** All 202 set papers are LET; CSE has 0 sets, yet
   the hero sits above a card selling CSE. Options: keep (owner's call), qualify the line, or
   load CSE sets. Flagged, not changed.
3. **The hero now lists five pills with ₱499 twice** (BSED complete, CSE complete). Accurate,
   but a skimming visitor may read it as a duplicate — owner chose all five.
4. **Trailing period and dash.** The owner wrote `Your CSC and LET Goal - A Clearer Way to
   Prepare`; this plan uses `Your CSE and LET Goal — A Clearer Way to Prepare.` (em dash to
   match the old headline's punctuation, period to match its sentence style). One-line change
   if he wants his exact punctuation.
5. **`3,801 lessons` is reading sections, not courses.** 15 books → 100 parts → 3,801
   sections; the old `lessons` table has 3 published rows. The number moves by itself on the
   next library reload — intended.
6. **`HERO_PACKAGES` repeats labels/order, never prices.** A price change is automatic; adding
   a sixth plan needs one entry in that const.
7. **`PLANS` is now imported into a page component.** `src/lib/paymongo.ts` reads
   `process.env` inside functions only and `page.tsx` is a server component, so nothing leaks
   to the client bundle — but do not reuse `HERO_PACKAGES` from a client component.
8. **Testimonial sentence.** `…the reviewees Teacher Ceppee has helped them pass their exams`
   doubles the object (`reviewees … them`). Owner's exact words kept; the one-word fix is
   `helped pass their exams`.
9. **Both card buttons grew** from `text-sm py-3` to `text-base py-3.5` — identical to each
   other, but both cards' CTAs are ~6 px taller than before.
10. **`Case-based timed mock exams` now sits next to two mock-count bullets** and reads
    redundant. Kept (the note only crossed out the 40% line); candidate for removal.
11. **Photo crop.** `logo.jpg` is square so the 96 px circle is clean. If it is replaced with a
    non-square photo, add `object-top` to the `img` class in `CoachesSection.tsx`.
12. **Build hygiene.** Never build into `.next` while a server serves it, and always
    `git checkout -- tsconfig.json` after a `NEXT_DIST_DIR` build.
13. **The plan file ships** (`.hermes/plans/` is tracked) — that is how this repo has worked.
