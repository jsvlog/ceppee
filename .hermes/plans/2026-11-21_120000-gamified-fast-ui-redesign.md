# Gamified Progression UI & Fast Webapp Redesign Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Eliminate multi-second page navigation delays on `ceppee.vercel.app` and transform `/review/[track]`, `/review/[track]/sets`, and `StudyRunner` from a generic card wall into a snappy, game-style connected progression map and arcade quiz runner while keeping the green (`#16a34a`) and gold (`#ca8a04` / `#d4af37`) brand theme.

**Architecture:** We fix the multi-second navigation bottleneck at three layers: (1) narrow `proxy.ts` / `updateSession` so public reviewer pages do not block on a Supabase Auth network round-trip in middleware and deduplicate `getUserContext()` within a request via `React.cache`, (2) parallelize all sequential Supabase queries on `/review/[track]` and `/read/[book]` with `Promise.all` and add instant `<Suspense>` loading skeletons (`loading.tsx`), and (3) replace server-round-trip filter clicks (Level, Majorship, Region tabs) with instant client-side state synced to `window.history.replaceState` + `localStorage`. On the UI layer, we replace the flat long-scroll `/review/[track]` dump and grid-of-61-cards `/review/[track]/sets` with a tactile 3D game aesthetic (raised pushable buttons, XP/Rank/Streak HUD, connected campaign path nodes with arrows, `✅ Done`, `🎯 Current`, and `🔒 Locked` states grouped by Region/Chapter, and a combo-streak + hearts/shield bar inside `StudyRunner`).

**Tech Stack:** Next.js 16.3.3 (App Router, React 19.2.8), Tailwind CSS v4 (`@import "tailwindcss"` in `src/app/globals.css`), Supabase (`@supabase/ssr`, Postgres RPCs), Node built-in test runner (`node --test --experimental-strip-types`).

---

## Current Context & Root-Cause Diagnosis

### 1. Why `https://ceppee.vercel.app` takes seconds to respond on every button click
Inspection of the live codebase revealed four compounding bottlenecks on every navigation:

1. **Middleware blocks every route on a remote Auth round-trip (`src/proxy.ts` + `src/lib/supabase/middleware.ts`):**
   `proxy.ts` runs `updateSession()` on *every* page request (`/` to `/review/let` to `/read`). Inside `updateSession()`, `await supabase.auth.getUser()` makes a network call to Supabase Auth before the route even starts rendering—even when the visitor has no `sb-*` auth cookie or is visiting a public route (`/review/let`, `/pricing`, `/coaches`).
2. **Duplicate `getUserContext()` calls in the same render (`src/app/(site)/layout.tsx` + child `page.tsx`):**
   `SiteLayout` calls `await getUserContext()` (which calls `supabase.auth.getUser()` + `profiles` + `subscriptions`). Then `TrackPage` (`/review/[track]/page.tsx`) calls `await getUserContext()` *again*. Because `getUserContext` is not wrapped in `React.cache()`, every click fires `auth.getUser()` **three times** (Middleware -> Layout -> Page) plus two redundant `profiles`/`subscriptions` queries.
3. **Sequential database waterfall in `/review/[track]/page.tsx` (lines 54–107):**
   `TrackPage` awaits `getUserContext()`, then awaits `getBankStats(trackKey)`, then awaits `topics`, then awaits `lessons` (fetching *every* published lesson row across the DB just to count them in JS!), then awaits `exams` — 5 serial network hops before sending a single byte of HTML.
4. **No `loading.tsx` boundaries + full SSR round-trips on filter clicks:**
   There are zero `loading.tsx` files in `src/app/`. Because every page exports `export const dynamic = "force-dynamic"`, clicking a `<Link>` or changing Majorship in `MajorshipPicker.tsx` (`router.push(...)`) freezes the current screen for 1.5–3 seconds waiting for the server waterfall to finish. Furthermore, `bank_stats(p_track)` in `supabase/study-modes.sql` groups only by `(track, subject, level)` and omits `specialization`, and `parseStudyParams` in `src/lib/study.ts` drops `major` when `level === "elementary"` (breaking BSNEd / BECEd drills).

### 2. Why `/review/let` feels generic and overwhelming
- `/review/let` dumps 5 sections vertically on one page: Level cards, Majorship dropdown, 4 Study Mode cards, 3 Subject cards, Full Mock Exam cards + Set Mocks banner + Free Samplers, and Topics/Lessons.
- `/review/let/sets` dumps up to **61 set cards** on a single flat grid with no completion status (`✅ Done` vs `🎯 Next` vs `🔒 Locked`) and no grouping into digestible chapters/regions.
- `StudyRunner.tsx` looks like a standard web form: flat 1px borders, no combo streak counter, no XP/progress feedback on answer reveal, and a wall of 150 tiny number buttons at the bottom.

---

## Step-by-Step Tasks

### Task 1: Pure Game Progression & Campaign Path Engine (`src/lib/game.ts`)

**Objective:** Create a pure, tested TypeScript module that computes player XP, Rank badge, combo multiplier, and transforms flat sets + previous exam attempts into a Duolingo/RPG-style connected campaign path grouped into Regions (5 sets per region) with explicit `done`, `current`, and `locked` node states.

**Files:**
- Create: `D:\hermes project\teacher ceppee\src\lib\game.ts`
- Test: `D:\hermes project\teacher ceppee\tests\game.test.mjs`

**Step 1: Write the failing test**

Create `D:\hermes project\teacher ceppee\tests\game.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  computePlayerStats,
  buildCampaignRegions,
  comboMultiplier,
} from "../src/lib/game.ts";

test("computePlayerStats calculates XP, level, rank title, and streak from attempts", () => {
  const attempts = [
    {
      id: "a1",
      score: 120,
      total: 150,
      kind: "exam",
      label: "General Education — Set 1 (set mock)",
      completed_at: "2026-11-21T08:00:00Z",
    },
    {
      id: "a2",
      score: 18,
      total: 20,
      kind: "drill",
      label: "LET — General Education",
      completed_at: "2026-11-20T08:00:00Z",
    },
  ];

  const stats = computePlayerStats(attempts, 75);
  // 120*10 + 18*10 + 150 (pass bonus on exam) = 1530 XP
  assert.equal(stats.xp, 1530);
  assert.equal(stats.level, 4); // 500 XP per level -> floor(1530/500) + 1 = 4
  assert.equal(stats.xpInLevel, 30);
  assert.equal(stats.xpForNextLevel, 500);
  assert.equal(stats.ClearedCount, undefined);
  assert.equal(stats.examsPassed, 1);
  assert.ok(stats.rankTitle.length > 0);
});

test("buildCampaignRegions groups sets into regions of 5 with connected done -> current -> locked chain", () => {
  const sets = Array.from({ length: 7 }, (_, i) => ({
    id: `set-${i + 1}`,
    track: "LET",
    subject: "General Education",
    specialization: null,
    level: "both",
    set_no: i + 1,
    title: `General Education — Set ${i + 1}`,
    target: 150,
    live: 150,
    missing: 0,
    easy: 30,
    medium_hard: 40,
    extremely_hard: 50,
    pedagogical: 30,
    shape_easy: 30,
    shape_medium_hard: 40,
    shape_extremely_hard: 50,
    shape_pedagogical: 30,
  }));

  const attempts = [
    {
      id: "att-1",
      score: 120,
      total: 150,
      kind: "exam",
      label: "General Education — Set 1 (set mock)",
      completed_at: "2026-11-21T08:00:00Z",
    },
  ];

  // Subscribed student: Set 1 is done (80% >= 75%), Set 2 is current, Sets 3..7 are available or sequential
  const regions = buildCampaignRegions(sets, attempts, {
    passingPct: 75,
    subscribed: true,
  });

  assert.equal(regions.length, 2);
  assert.equal(regions[0].regionNo, 1);
  assert.equal(regions[0].nodes.length, 5);
  assert.equal(regions[1].nodes.length, 2);

  assert.equal(regions[0].nodes[0].state, "done");
  assert.equal(regions[0].nodes[0].bestPct, 80);
  assert.equal(regions[0].nodes[0].stars, 2); // 75-89% = 2 stars, 90%+ = 3 stars

  assert.equal(regions[0].nodes[1].state, "current");
  assert.equal(regions[0].nodes[2].state, "unlocked");

  // Unsubscribed visitor: all nodes are locked
  const lockedRegions = buildCampaignRegions(sets, [], {
    passingPct: 75,
    subscribed: false,
  });
  assert.equal(lockedRegions[0].nodes[0].state, "locked");
});

test("comboMultiplier scales with consecutive right answers", () => {
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(2), 1);
  assert.equal(comboMultiplier(3), 2);
  assert.equal(comboMultiplier(5), 3);
  assert.equal(comboMultiplier(10), 5);
});
```

**Step 2: Run test to verify failure**

Run:
```bash
cd "D:/hermes project/teacher ceppee" && node --test --experimental-strip-types tests/game.test.mjs
```
Expected: FAIL — `ERR_MODULE_NOT_FOUND: Cannot find module '.../src/lib/game.ts'`

**Step 3: Write minimal implementation**

Create `D:\hermes project\teacher ceppee\src\lib\game.ts`:

```ts
import type { SetCatalogRow } from "./types.ts";

export interface AttemptSummary {
  id?: string;
  score: number;
  total: number;
  kind: "exam" | "drill" | "flashcards";
  label: string | null;
  completed_at: string;
}

export interface PlayerStats {
  xp: number;
  level: number;
  xpInLevel: number;
  xpForNextLevel: number;
  levelProgressPct: number;
  rankTitle: string;
  rankIcon: string;
  streakDays: number;
  examsPassed: number;
  totalAnswered: number;
}

const RANKS: { minLevel: number; title: string; icon: string }[] = [
  { minLevel: 1, title: "Rookie Examinee", icon: "🌱" },
  { minLevel: 3, title: "Board Challenger", icon: "⚡" },
  { minLevel: 6, title: "Quiz Tactician", icon: "🛡️" },
  { minLevel: 10, title: "Master Reviewer", icon: "🔥" },
  { minLevel: 15, title: "Topnotcher Contender", icon: "👑" },
];

export function computePlayerStats(attempts: AttemptSummary[], passingPct = 75): PlayerStats {
  let xp = 0;
  let examsPassed = 0;
  let totalAnswered = 0;

  for (const a of attempts) {
    const score = Math.max(0, Number(a.score) || 0);
    const total = Math.max(0, Number(a.total) || 0);
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    totalAnswered += total;
    xp += score * 10;
    if (a.kind === "exam" && pct >= passingPct) {
      xp += 150;
      examsPassed += 1;
    }
  }

  const xpForNextLevel = 500;
  const level = Math.floor(xp / xpForNextLevel) + 1;
  const xpInLevel = xp % xpForNextLevel;
  const levelProgressPct = Math.min(100, Math.round((xpInLevel / xpForNextLevel) * 100));

  let rank = RANKS[0];
  for (const r of RANKS) {
    if (level >= r.minLevel) rank = r;
  }

  // Compute day streak from distinct UTC dates in completed_at
  const daySet = new Set<string>();
  for (const a of attempts) {
    if (a.completed_at) {
      daySet.add(a.completed_at.slice(0, 10));
    }
  }
  const sortedDays = [...daySet].sort().reverse();
  let streakDays = 0;
  for (let i = 0; i < sortedDays.length; i++) {
    if (i === 0) {
      streakDays = 1;
    } else {
      const prev = new Date(sortedDays[i - 1] + "T00:00:00Z").getTime();
      const curr = new Date(sortedDays[i] + "T00:00:00Z").getTime();
      const diffDays = Math.round((prev - curr) / 86400000);
      if (diffDays === 1) streakDays += 1;
      else break;
    }
  }

  return {
    xp,
    level,
    xpInLevel,
    xpForNextLevel,
    levelProgressPct,
    rankTitle: rank.title,
    rankIcon: rank.icon,
    streakDays,
    examsPassed,
    totalAnswered,
  };
}

export type CampaignNodeState = "done" | "current" | "unlocked" | "locked";

export interface CampaignNode {
  set: SetCatalogRow;
  state: CampaignNodeState;
  bestPct: number | null;
  attemptsCount: number;
  stars: 0 | 1 | 2 | 3;
}

export interface CampaignRegion {
  regionNo: number;
  title: string;
  subtitle: string;
  completedCount: number;
  totalCount: number;
  nodes: CampaignNode[];
}

const REGION_TITLES = [
  "Region I · Foundation Grounds",
  "Region II · Core Mastery Trail",
  "Region III · Situational Judgement Peaks",
  "Region IV · Board Gauntlet Ridge",
  "Region V · Topnotcher Summit",
];

export function buildCampaignRegions(
  sets: SetCatalogRow[],
  attempts: AttemptSummary[],
  opts: { passingPct: number; subscribed: boolean; regionSize?: number }
): CampaignRegion[] {
  const regionSize = opts.regionSize ?? 5;
  const sorted = [...sets].sort((a, b) => a.set_no - b.set_no);

  // Map set title -> best percentage & attempts count
  const byTitle = new Map<string, { bestPct: number; count: number }>();
  for (const a of attempts) {
    if (!a.label || a.total <= 0) continue;
    const cleanLabel = a.label.replace(/\s*\(set mock\)\s*$/i, "").trim().toLowerCase();
    const pct = Math.round((a.score / a.total) * 100);
    const prev = byTitle.get(cleanLabel);
    if (!prev) {
      byTitle.set(cleanLabel, { bestPct: pct, count: 1 });
    } else {
      byTitle.set(cleanLabel, { bestPct: Math.max(prev.bestPct, pct), count: prev.count + 1 });
    }
  }

  let foundCurrent = false;
  const nodes: CampaignNode[] = sorted.map((s) => {
    const stat = byTitle.get(s.title.trim().toLowerCase());
    const bestPct = stat ? stat.bestPct : null;
    const attemptsCount = stat ? stat.count : 0;

    let stars: 0 | 1 | 2 | 3 = 0;
    if (bestPct !== null) {
      if (bestPct >= 90) stars = 3;
      else if (bestPct >= opts.passingPct) stars = 2;
      else if (bestPct >= 50) stars = 1;
    }

    if (!opts.subscribed) {
      return { set: s, state: "locked", bestPct, attemptsCount, stars };
    }

    const passed = bestPct !== null && bestPct >= opts.passingPct;
    if (passed) {
      return { set: s, state: "done", bestPct, attemptsCount, stars };
    }

    if (!foundCurrent) {
      foundCurrent = true;
      return { set: s, state: "current", bestPct, attemptsCount, stars };
    }

    return { set: s, state: "unlocked", bestPct, attemptsCount, stars };
  });

  const regions: CampaignRegion[] = [];
  for (let i = 0; i < nodes.length; i += regionSize) {
    const slice = nodes.slice(i, i + regionSize);
    const regionNo = Math.floor(i / regionSize) + 1;
    const firstNo = slice[0].set.set_no;
    const lastNo = slice[slice.length - 1].set.set_no;
    const title = REGION_TITLES[regionNo - 1] ?? `Region ${regionNo} · Frontier Sets`;
    const completedCount = slice.filter((n) => n.state === "done").length;

    regions.push({
      regionNo,
      title,
      subtitle: `Sets ${firstNo}–${lastNo} · ${slice.length * 150} items`,
      completedCount,
      totalCount: slice.length,
      nodes: slice,
    });
  }

  return regions;
}

export function comboMultiplier(streak: number): number {
  if (streak >= 10) return 5;
  if (streak >= 5) return 3;
  if (streak >= 3) return 2;
  return 1;
}
```

**Step 4: Run test to verify pass**

Run:
```bash
cd "D:/hermes project/teacher ceppee" && node --test --experimental-strip-types tests/game.test.mjs
```
Expected: PASS (3 tests passing, 0 failed).

**Step 5: Commit**

```bash
cd "D:/hermes project/teacher ceppee"
git add src/lib/game.ts tests/game.test.mjs
git commit -m "feat: add gamified XP, rank, combo, and campaign region progression engine"
```

---

### Task 2: Fix Elementary Majorship Parsing Bug in `src/lib/study.ts`

**Objective:** Allow LET Elementary takers with specialization (`Special Needs Education` and `Early Childhood Education`) to pass `?major=` into Drills and Flashcards instead of having `parseStudyParams` silently strip `major` whenever `level !== "secondary"`.

**Files:**
- Modify: `D:\hermes project\teacher ceppee\src\lib\study.ts:1-45`
- Test: `D:\hermes project\teacher ceppee\tests\study-params.test.mjs`

**Step 1: Write failing test**

Create `D:\hermes project\teacher ceppee\tests\study-params.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseStudyParams } from "../src/lib/study.ts";

test("parseStudyParams keeps major for LET secondary and LET elementary specializations", () => {
  const sec = parseStudyParams("LET", {
    level: "secondary",
    major: "Mathematics",
    subjects: "Specialization",
  });
  assert.equal(sec.major, "Mathematics");

  const elem = parseStudyParams("LET", {
    level: "elementary",
    major: "Early Childhood Education",
    subjects: "Specialization",
  });
  assert.equal(elem.major, "Early Childhood Education");

  const invalidElem = parseStudyParams("LET", {
    level: "elementary",
    major: "Mathematics",
    subjects: "Specialization",
  });
  assert.equal(invalidElem.major, null);
});
```

**Step 2: Run test to verify failure**

Run:
```bash
cd "D:/hermes project/teacher ceppee" && node --test --experimental-strip-types tests/study-params.test.mjs
```
Expected: FAIL — `elem.major` is `null` instead of `"Early Childhood Education"`.

**Step 3: Write minimal implementation**

Update `D:\hermes project\teacher ceppee\src\lib\study.ts`:

```ts
import { levelsFor, levelShort, subjectsFor, specializationsFor, timedMinutes } from "./exam.ts";
import type { Level, Track } from "./types.ts";

export interface StudyParams {
  level: Level;
  /** Empty = the student still has to choose on the setup screen. */
  subjects: string[];
  major: string | null;
  count: number;
  difficulty: number;
  timed: boolean;
  label: string;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseStudyParams(track: Track, raw: RawParams, defaultCount = 20): StudyParams {
  const levels = levelsFor(track);
  const wantedLevel = first(raw.level);
  const level = (levels.find((l) => l.key === wantedLevel)?.key ?? levels[0].key) as Level;

  const majorRaw = first(raw.major);
  const allowedMajors = track === "LET" ? specializationsFor(level) : [];
  const major =
    track === "LET" && majorRaw && allowedMajors.includes(majorRaw) ? majorRaw : null;

  const allowed = subjectsFor(track, level).map((s) => s.key);
  const subjects = (first(raw.subjects) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && allowed.includes(s));

  const count = Math.min(200, Math.max(5, Number(first(raw.count)) || defaultCount));
  const difficulty = Math.min(3, Math.max(0, Number(first(raw.difficulty)) || 0));
  const timed = first(raw.timed) === "1";

  const label =
    first(raw.tlabel) ||
    [`${track} ${levelShort(track, level)}`, subjects.length ? subjects.join(", ") : "Mixed"].join(" — ");

  return { level, subjects, major, count, difficulty, timed, label };
}

export function studyMinutes(count: number, track: Track): number {
  return timedMinutes(count, track);
}

/** "Verbal Ability,Numerical Ability" -> URLSearchParams-safe string */
export function subjectsParam(subjects: string[]): string {
  return subjects.join(",");
}
```

**Step 4: Run test to verify pass**

Run:
```bash
cd "D:/hermes project/teacher ceppee" && node --test --experimental-strip-types tests/study-params.test.mjs
```
Expected: PASS (1 test passing, 0 failed).

**Step 5: Commit**

```bash
cd "D:/hermes project/teacher ceppee"
git add src/lib/study.ts tests/study-params.test.mjs
git commit -m "fix: preserve elementary specialization major in parseStudyParams"
```

---

### Task 3: Fast Middleware & Per-Request Deduplicated Queries (`src/lib/supabase/middleware.ts` & `src/lib/queries.ts`)

**Objective:** Eliminate the 2–3x redundant Supabase Auth network round-trips on every page click by (1) skipping `supabase.auth.getUser()` in middleware when the route is public or when no `sb-` auth cookie exists, and (2) wrapping `getUserContext()` and `getBankStats()` in `React.cache()` so `SiteLayout` and `Page` share one promise per request.

**Files:**
- Modify: `D:\hermes project\teacher ceppee\src\lib\supabase\middleware.ts`
- Modify: `D:\hermes project\teacher ceppee\src\lib\queries.ts`

**Step 1: Update `src/lib/supabase/middleware.ts` to skip network round-trip on public routes and anonymous visitors**

Replace `D:\hermes project\teacher ceppee\src\lib\supabase\middleware.ts` with:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const protectedPaths = ["/dashboard", "/admin", "/exam", "/account"];
const authPaths = ["/login", "/signup"];

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isProtected = protectedPaths.some((p) => path === p || path.startsWith(p + "/"));
  const isAuthPage = authPaths.includes(path);
  const allCookies = request.cookies.getAll();
  const hasSbCookie = allCookies.some((c) => c.name.startsWith("sb-"));

  // Fast path 1: visitor has no Supabase auth cookie at all.
  // Never pay a network round-trip to Supabase Auth for anonymous traffic.
  if (!hasSbCookie) {
    if (isProtected) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  // Fast path 2: public marketing / reviewer hub pages (/review/*, /read/*, /, /pricing, /coaches).
  // Server components on those pages read the cookie directly via React.cache(getUserContext),
  // so middleware does not need to block navigation with a second auth.getUser() call.
  if (!isProtected && !isAuthPage) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

**Step 2: Deduplicate `getUserContext` and `getBankStats` with `React.cache` and add `getRecentTrackAttempts`**

Update `D:\hermes project\teacher ceppee\src\lib\queries.ts`:

```ts
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type { BankStat, Coach, ExamAttempt, Level, SubjectProgress, Subscription, Testimonial, Track } from "@/lib/types";

export interface SiteStats {
  lessons: number;
  questions: number;
  exams: number;
}

export const getSiteStats = cache(async (): Promise<SiteStats> => {
  const admin = getAdminClient();
  try {
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
});

export async function getPublicTestimonials(): Promise<Testimonial[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("testimonials")
      .select("*")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) return [];
    return (data as Testimonial[]) ?? [];
  } catch {
    return [];
  }
}

export async function getPublicCoaches(): Promise<Coach[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("coaches")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(60);
    if (error) return [];
    return (data as Coach[]) ?? [];
  } catch {
    return [];
  }
}

export interface UserContext {
  user: { id: string; email?: string } | null;
  profile: { id: string; full_name: string | null; is_admin: boolean } | null;
  isAdmin: boolean;
  subs: Subscription[];
}

export const getUserContext = cache(async (): Promise<UserContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null, isAdmin: false, subs: [] };

  try {
    const [{ data: profile }, { data: subs }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, is_admin").eq("id", user.id).maybeSingle(),
      supabase.from("subscriptions").select("*").eq("user_id", user.id),
    ]);
    return {
      user: { id: user.id, email: user.email },
      profile: (profile as UserContext["profile"]) ?? null,
      isAdmin: !!(profile as { is_admin?: boolean } | null)?.is_admin,
      subs: (subs as Subscription[]) ?? [],
    };
  } catch {
    return { user: { id: user.id, email: user.email }, profile: null, isAdmin: false, subs: [] };
  }
});

export function hasActiveSub(subs: Subscription[], track: Track): boolean {
  return subs.some((s) => s.track === track && s.status === "active" && new Date(s.expires_at) > new Date());
}

export function getActiveSub(subs: Subscription[], track: Track): Subscription | undefined {
  return subs.find((s) => s.track === track && s.status === "active" && new Date(s.expires_at) > new Date());
}

export const getBankStats = cache(async (track: Track): Promise<BankStat[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("bank_stats", { p_track: track });
    if (error) return [];
    return (data as BankStat[]) ?? [];
  } catch {
    return [];
  }
});

export function countAvailable(stats: BankStat[], level: Level, subjects?: string[]): number {
  return stats
    .filter((s) => level === "both" || s.level === "both" || s.level === level)
    .filter((s) => !subjects || subjects.length === 0 || (s.subject && subjects.includes(s.subject)))
    .reduce((sum, s) => sum + Number(s.accessible ?? 0), 0);
}

export const getSubjectProgress = cache(async (track: Track): Promise<SubjectProgress[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("subject_progress", { p_track: track });
    if (error) return [];
    return (data as SubjectProgress[]) ?? [];
  } catch {
    return [];
  }
});

/** Recent exam/drill attempts for a user on a track (powers XP, Rank, Streak, and Set completion stars). */
export const getRecentTrackAttempts = cache(async (userId: string | null, track: Track): Promise<ExamAttempt[]> => {
  if (!userId) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("exam_attempts")
      .select("id, user_id, exam_id, kind, label, track, level, score, total, duration_used_seconds, completed_at")
      .eq("user_id", userId)
      .eq("track", track)
      .order("completed_at", { ascending: false })
      .limit(120);
    if (error) return [];
    return (data as ExamAttempt[]) ?? [];
  } catch {
    return [];
  }
});
```

**Step 3: Verify TypeScript compiles cleanly**

Run:
```bash
cd "D:/hermes project/teacher ceppee" && npx tsc -p tsconfig.json --noEmit
```
Expected: exit 0 with no output.

**Step 4: Commit**

```bash
cd "D:/hermes project/teacher ceppee"
git add src/lib/supabase/middleware.ts src/lib/queries.ts
git commit -m "perf: bypass auth round-trip on public middleware paths and cache getUserContext per request"
```

---

### Task 4: Instant Loading Skeletons (`loading.tsx`) Across Reviewer, Sets, Study, Exam, and Read Routes

**Objective:** Add Next.js App Router `loading.tsx` files so clicking any navigation button immediately switches the screen (<50ms) to a game-styled skeleton HUD while the server finishes fetching data.

**Files:**
- Create: `D:\hermes project\teacher ceppee\src\app\(site)\review\[track]\loading.tsx`
- Create: `D:\hermes project\teacher ceppee\src\app\(site)\review\[track]\sets\loading.tsx`
- Create: `D:\hermes project\teacher ceppee\src\app\(site)\study\[track]\loading.tsx`
- Create: `D:\hermes project\teacher ceppee\src\app\(site)\exam\loading.tsx`
- Create: `D:\hermes project\teacher ceppee\src\app\(site)\read\loading.tsx`

**Step 1: Create `src/app/(site)/review/[track]/loading.tsx`**

```tsx
export default function ReviewTrackLoading() {
  return (
    <div>
      <section className="bg-gradient-to-br from-[#15803d] to-[#ca8a04] py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="h-7 w-44 rounded-full bg-white/25 animate-pulse" />
          <div className="mt-3 h-11 w-72 rounded-2xl bg-white/30 animate-pulse" />
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-white/20 animate-pulse" />
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 h-16 w-full rounded-2xl skeleton" />
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-2xl skeleton" />
          ))}
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl skeleton" />
          ))}
        </div>
      </section>
    </div>
  );
}
```

**Step 2: Create `src/app/(site)/review/[track]/sets/loading.tsx`**

```tsx
export default function SetsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 h-32 w-full rounded-3xl skeleton" />
      <div className="mb-6 h-14 w-full rounded-2xl skeleton" />
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 w-full rounded-2xl skeleton" />
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Create `src/app/(site)/study/[track]/loading.tsx`, `src/app/(site)/exam/loading.tsx`, and `src/app/(site)/read/loading.tsx`**

Create `D:\hermes project\teacher ceppee\src\app\(site)\study\[track]\loading.tsx`:

```tsx
export default function StudyLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-4 h-16 w-full rounded-2xl skeleton" />
      <div className="h-96 w-full rounded-3xl skeleton" />
    </div>
  );
}
```

Create `D:\hermes project\teacher ceppee\src\app\(site)\exam\loading.tsx`:

```tsx
export default function ExamLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-4 h-16 w-full rounded-2xl skeleton" />
      <div className="h-96 w-full rounded-3xl skeleton" />
    </div>
  );
}
```

Create `D:\hermes project\teacher ceppee\src\app\(site)\read\loading.tsx`:

```tsx
export default function ReadLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 h-10 w-64 rounded-2xl skeleton" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-36 rounded-2xl skeleton" />
        ))}
      </div>
    </div>
  );
}
```

**Step 4: Verify TypeScript compiles cleanly**

Run:
```bash
cd "D:/hermes project/teacher ceppee" && npx tsc -p tsconfig.json --noEmit
```
Expected: exit 0.

**Step 5: Commit**

```bash
cd "D:/hermes project/teacher ceppee"
git add "src/app/(site)/review/[track]/loading.tsx" "src/app/(site)/review/[track]/sets/loading.tsx" "src/app/(site)/study/[track]/loading.tsx" "src/app/(site)/exam/loading.tsx" "src/app/(site)/read/loading.tsx"
git commit -m "feat: add instant route loading skeletons across review, sets, study, exam, and read"
```

---

### Task 5: Tactile 3D Game UI Tokens & Micro-Animations in `src/app/globals.css`

**Objective:** Add tactile 3D pushable buttons (`btn-arcade-green`, `btn-arcade-gold`, `btn-arcade-surface`), game cards (`game-card`), pulsing current-mission node rings (`node-pulse-green`, `node-pulse-gold`), and answer reveal animations (`animate-pop`, `animate-shake`) in `src/app/globals.css` while preserving all existing green + gold brand tokens.

**Files:**
- Modify: `D:\hermes project\teacher ceppee\src\app\globals.css`

**Step 1: Append game UI CSS classes to `src/app/globals.css`**

Append at the end of `D:\hermes project\teacher ceppee\src\app\globals.css` (after line 241):

```css
/* ===== Tactile Game / Arcade UI (Green + Gold preserved) ===== */
.game-card {
  background: var(--bg-surface);
  border: 2px solid var(--border-default);
  border-bottom-width: 5px;
  border-radius: 20px;
  box-shadow: 0 6px 20px rgba(22, 51, 31, 0.06);
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.game-card-interactive:hover {
  transform: translateY(-2px);
  border-color: var(--gold-500);
  box-shadow: 0 10px 26px rgba(22, 51, 31, 0.11);
}

.game-card-interactive:active {
  transform: translateY(2px);
  border-bottom-width: 2px;
}

.btn-arcade-green {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(180deg, #22c55e 0%, #16a34a 100%);
  color: #ffffff;
  font-weight: 800;
  border-radius: 16px;
  border: 2px solid #15803d;
  border-bottom-width: 5px;
  box-shadow: 0 4px 14px rgba(22, 163, 74, 0.28);
  transition: transform 0.1s ease, filter 0.15s ease;
}
.btn-arcade-green:hover {
  filter: brightness(1.04);
  transform: translateY(-1px);
}
.btn-arcade-green:active {
  transform: translateY(3px);
  border-bottom-width: 2px;
}
.btn-arcade-green:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.btn-arcade-gold {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: linear-gradient(180deg, #eab308 0%, #ca8a04 100%);
  color: #ffffff;
  font-weight: 800;
  border-radius: 16px;
  border: 2px solid #a16207;
  border-bottom-width: 5px;
  box-shadow: 0 4px 14px rgba(202, 138, 4, 0.28);
  transition: transform 0.1s ease, filter 0.15s ease;
}
.btn-arcade-gold:hover {
  filter: brightness(1.04);
  transform: translateY(-1px);
}
.btn-arcade-gold:active {
  transform: translateY(3px);
  border-bottom-width: 2px;
}

.btn-arcade-surface {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #ffffff;
  color: var(--text-primary);
  font-weight: 700;
  border-radius: 16px;
  border: 2px solid var(--border-default);
  border-bottom-width: 5px;
  transition: transform 0.1s ease, border-color 0.15s ease, background 0.15s ease;
}
.btn-arcade-surface:hover {
  border-color: var(--gold-500);
  background: #fcfdf9;
}
.btn-arcade-surface:active {
  transform: translateY(3px);
  border-bottom-width: 2px;
}

@keyframes nodePulseGold {
  0%, 100% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.45); }
  50% { box-shadow: 0 0 0 10px rgba(234, 179, 8, 0); }
}
.node-pulse-gold {
  animation: nodePulseGold 2s infinite;
}

@keyframes nodePulseGreen {
  0%, 100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.45); }
  50% { box-shadow: 0 0 0 10px rgba(22, 163, 74, 0); }
}
.node-pulse-green {
  animation: nodePulseGreen 2s infinite;
}

@keyframes popIn {
  0% { transform: scale(0.92); opacity: 0.5; }
  60% { transform: scale(1.03); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.animate-pop {
  animation: popIn 0.22s ease-out both;
}

@keyframes wrongShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}
.animate-shake {
  animation: wrongShake 0.25s ease-in-out;
}
```

**Step 2: Commit**

```bash
cd "D:/hermes project/teacher ceppee"
git add src/app/globals.css
git commit -m "style: add tactile 3D arcade buttons, game cards, and node pulse animations"
```

---

### Task 6: Build the Interactive Game Hub Component (`src/components/study/TrackGameHub.tsx`) and Parallelize `/review/[track]/page.tsx`

**Objective:** Replace the slow, all-dumped-at-once `/review/[track]` page with:
1. A **parallelized server loader** in `/review/[track]/page.tsx` (`Promise.all` across bank stats, set catalog, subject progress, recent attempts, exams, and topics — zero sequential waterfalls).
2. A **client-driven Game Hub (`TrackGameHub.tsx`)** featuring:
   - **Player HUD Banner**: Rank badge (`🌱 Rookie Examinee` → `👑 Topnotcher Contender`), Level & XP progress bar, Streak flame counter, and Cleared Sets counter.
   - **Instant Level & Majorship Switcher**: Switching between Elementary / Secondary or picking any of the 11 Majorships updates the screen in **0ms** (filtering the preloaded set catalog client-side, syncing `?level=&major=` via `window.history.replaceState` and remembering the student's major in `localStorage` so they don't have to re-select it every visit).
   - **3 Game World Tabs** (instead of dumping everything vertically):
     - **🗺️ Campaign Map (Default):** Subject Path Selector (General Education · Professional Education · Majorship) with mastery progress bars, followed by the **Connected Progression Path** grouped into **Regions** (5 sets per Region, collapsible/expandable, connected by vertical trail arrows, showing `✅ Cleared + Stars`, `🎯 Current Mission (pulsing CTA)`, `🔓 Unlocked`, or `🔒 Locked`), plus a **"⚡ Quick 15-Item Practice Run"** button and **"⏱️ Full 150-Item Boss Paper"** button right on the active mission node!
     - **⚡ Arcade Training Arena:** Instant 1-tap launch pads for Subject Drills (with quick 10 / 20 / 50 item pill selector), Flashcard Blitz, Retry My Mistakes (`🔁`), and Full Blueprint Mock Exams.
     - **📖 Study Codex (Notes & Lessons):** Direct link to the 3.7M-word Reading Library (`/read`) and track topics.

**Files:**
- Create: `D:\hermes project\teacher ceppee\src\components\study\TrackGameHub.tsx`
- Modify: `D:\hermes project\teacher ceppee\src\app\(site)\review\[track]\page.tsx`

**Step 1: Create `src/components/study/TrackGameHub.tsx`**

Create `D:\hermes project\teacher ceppee\src\components\study\TrackGameHub.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  levelsFor,
  levelLabel,
  specializationsFor,
  subjectsFor,
  passingPctFor,
  timedMinutes,
} from "@/lib/exam";
import { peso } from "@/lib/format";
import {
  buildCampaignRegions,
  computePlayerStats,
  type AttemptSummary,
  type CampaignNode,
} from "@/lib/game";
import type {
  BankStat,
  Exam,
  Level,
  SetCatalogRow,
  SubjectProgress,
  Topic,
  Track,
} from "@/lib/types";

interface TrackGameHubProps {
  trackKey: Track;
  trackSlug: string;
  initialLevel: Level;
  initialMajor: string | null;
  subscribed: boolean;
  isSignedIn: boolean;
  stats: BankStat[];
  allSets: SetCatalogRow[];
  attempts: AttemptSummary[];
  mastery: SubjectProgress[];
  exams: Exam[];
  topics: Topic[];
  lessonCounts: Record<string, { total: number; free: number }>;
}

type HubTab = "campaign" | "arena" | "codex";

export default function TrackGameHub({
  trackKey,
  trackSlug,
  initialLevel,
  initialMajor,
  subscribed,
  isSignedIn,
  stats,
  allSets,
  attempts,
  mastery,
  exams,
  topics,
  lessonCounts,
}: TrackGameHubProps) {
  const isLET = trackKey === "LET";
  const passingPct = passingPctFor(trackKey);
  const levelOptions = levelsFor(trackKey);

  const [levelKey, setLevelKey] = useState<Level>(initialLevel);
  const [major, setMajor] = useState<string | null>(initialMajor);
  const [tab, setTab] = useState<HubTab>("campaign");
  const [quickCount, setQuickCount] = useState<number>(20);

  const subjects = useMemo(() => subjectsFor(trackKey, levelKey), [trackKey, levelKey]);
  const [activeSubject, setActiveSubject] = useState<string>(() => subjects[0]?.key ?? "General Education");
  const [openRegion, setOpenRegion] = useState<number>(1);

  const majorOptions = useMemo(
    () => (isLET ? specializationsFor(levelKey) : []),
    [isLET, levelKey]
  );
  const majorRequired = isLET && levelKey === "secondary";

  // Restore saved major from localStorage if URL didn't specify one
  useEffect(() => {
    if (!isLET) return;
    if (initialMajor && majorOptions.includes(initialMajor)) return;
    try {
      const saved = window.localStorage.getItem(`ceppee_major_${levelKey}`);
      if (saved && majorOptions.includes(saved)) {
        setMajor(saved);
      }
    } catch {
      /* ignore storage errors */
    }
  }, [isLET, levelKey, initialMajor, majorOptions]);

  // Keep URL query params in sync without triggering a slow server round-trip
  const updateLevelAndMajor = (nextLevel: Level, nextMajor: string | null) => {
    const allowedMajors = isLET ? specializationsFor(nextLevel) : [];
    const validMajor = nextMajor && allowedMajors.includes(nextMajor) ? nextMajor : null;
    setLevelKey(nextLevel);
    setMajor(validMajor);
    const nextSubjects = subjectsFor(trackKey, nextLevel);
    if (!nextSubjects.some((s) => s.key === activeSubject)) {
      setActiveSubject(nextSubjects[0]?.key ?? "General Education");
    }
    try {
      if (validMajor) {
        window.localStorage.setItem(`ceppee_major_${nextLevel}`, validMajor);
      }
      const p = new URLSearchParams({ level: nextLevel });
      if (validMajor) p.set("major", validMajor);
      window.history.replaceState(null, "", `/review/${trackSlug}?${p.toString()}`);
    } catch {
      /* ignore */
    }
  };

  const player = useMemo(
    () => computePlayerStats(attempts, passingPct),
    [attempts, passingPct]
  );

  // Filter sets for the active level, major, and selected subject path
  const visibleSets = useMemo(() => {
    return allSets.filter((s) => {
      if (s.level !== "both" && s.level !== levelKey) return false;
      if (s.subject !== activeSubject) return false;
      if (activeSubject === "Specialization") {
        if (!major) return false;
        return s.specialization === major;
      }
      return true;
    });
  }, [allSets, levelKey, activeSubject, major]);

  const regions = useMemo(
    () =>
      buildCampaignRegions(visibleSets, attempts, {
        passingPct,
        subscribed,
        regionSize: 5,
      }),
    [visibleSets, attempts, passingPct, subscribed]
  );

  // Auto-open the region containing the "current" node when switching subject/major
  useEffect(() => {
    const currentRegion = regions.find((r) => r.nodes.some((n) => n.state === "current"));
    setOpenRegion(currentRegion ? currentRegion.regionNo : 1);
  }, [activeSubject, major, levelKey, regions.length]);

  const subjectCount = (subjectKey: string) => {
    if (subjectKey === "Specialization") {
      if (!major) return 0;
      return allSets
        .filter(
          (s) =>
            (s.level === "both" || s.level === levelKey) &&
            s.subject === "Specialization" &&
            s.specialization === major
        )
        .reduce((sum, s) => sum + s.live, 0);
    }
    const fromSets = allSets
      .filter((s) => (s.level === "both" || s.level === levelKey) && s.subject === subjectKey)
      .reduce((sum, s) => sum + s.live, 0);
    if (fromSets > 0) return fromSets;
    return stats
      .filter((s) => (levelKey === "both" || s.level === "both" || s.level === levelKey) && s.subject === subjectKey)
      .reduce((sum, s) => sum + Number(s.accessible ?? 0), 0);
  };

  const masteryFor = (subjectKey: string) =>
    mastery.find((m) => m.subject === subjectKey)?.pct ?? 0;

  const studyHref = (mode: string, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ level: levelKey, ...extra });
    if (major) p.set("major", major);
    return `/study/${trackSlug}/${mode}?${p.toString()}`;
  };

  const levelExams = useMemo(
    () => exams.filter((e) => e.level === levelKey || e.level === "both" || e.is_free_preview),
    [exams, levelKey]
  );
  const mocks = levelExams.filter((e) => e.mode === "mock");
  const samplers = exams.filter((e) => e.is_free_preview);

  const primaryBtn = isLET ? "btn-arcade-gold" : "btn-arcade-green";
  const accentText = isLET ? "text-[#b45309]" : "text-[#15803d]";
  const accentSoft = isLET ? "bg-[#fef9c3]" : "bg-[#dcfce7]";
  const heroGrad = isLET
    ? "from-[#b45309] via-[#ca8a04] to-[#15803d]"
    : "from-[#14532d] via-[#15803d] to-[#ca8a04]";

  return (
    <div>
      {/* ==================== GAME HUD HEADER ==================== */}
      <section className={`relative overflow-hidden bg-gradient-to-br ${heroGrad} py-8 text-white shadow-lg`}>
        <div className="orb orb-green -left-24 -top-24 opacity-40" />
        <div className="orb orb-gold -bottom-24 -right-24 opacity-40" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-black/25 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-white backdrop-blur-sm">
                <span>{isLET ? "🍎" : "🏛️"}</span>
                <span>{isLET ? "Licensure Exam for Teachers" : "Civil Service Exam"}</span>
                <span>·</span>
                <span>{levelLabel(trackKey, levelKey)}</span>
                {major && (
                  <>
                    <span>·</span>
                    <span className="text-[#fef08a]">{major}</span>
                  </>
                )}
              </div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                {trackKey} Campaign Arena
              </h1>
              <p className="mt-1 text-sm text-white/90">
                {subscribed
                  ? "Clear each set node with 75%+ to earn stars, build your streak, and level up your rank."
                  : `Free sampler unlocked. Subscribe for ${peso(500)} to unlock all 150-item campaign sets, drills & flashcards.`}
              </p>
            </div>

            {!subscribed && (
              <Link
                href={isSignedIn ? "/dashboard" : `/login?next=/review/${trackSlug}`}
                className="btn-arcade-surface shrink-0 px-6 py-3 text-sm text-[#16331f]"
              >
                🔓 Unlock Full Campaign — {peso(500)}
              </Link>
            )}
          </div>

          {/* Player Stats HUD Bar */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/20 bg-black/20 p-3.5 backdrop-blur-sm">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-white/75">
                <span>Rank · Lv.{player.level}</span>
                <span>{player.rankIcon}</span>
              </div>
              <div className="mt-1 truncate text-base font-black text-white">{player.rankTitle}</div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#4ade80] to-[#facc15] transition-all"
                  style={{ width: `${player.levelProgressPct}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/20 bg-black/20 p-3.5 backdrop-blur-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-white/75">Total XP</div>
              <div className="mt-1 text-2xl font-black text-[#fef08a]">
                ⚡ {player.xp.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-white/75">
                {player.xpForNextLevel - player.xpInLevel} XP to Lv.{player.level + 1}
              </div>
            </div>

            <div className="rounded-2xl border border-white/20 bg-black/20 p-3.5 backdrop-blur-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-white/75">Study Streak</div>
              <div className="mt-1 text-2xl font-black text-white">
                🔥 {player.streakDays} {player.streakDays === 1 ? "day" : "days"}
              </div>
              <div className="mt-1 text-[11px] text-white/75">
                {player.totalAnswered.toLocaleString()} items answered
              </div>
            </div>

            <div className="rounded-2xl border border-white/20 bg-black/20 p-3.5 backdrop-blur-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-white/75">Papers Cleared</div>
              <div className="mt-1 text-2xl font-black text-[#86efac]">
                🏆 {player.examsPassed}
              </div>
              <div className="mt-1 text-[11px] text-white/75">Target: {passingPct}% passing</div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== INSTANT CLASS / LEVEL & MAJORSHIP BAR ==================== */}
      <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="game-card flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          {/* Level Pill Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-extrabold uppercase tracking-wider text-[#5c7863]">
              1. Division:
            </span>
            {levelOptions.map((l) => {
              const active = l.key === levelKey;
              return (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => updateLevelAndMajor(l.key, major)}
                  className={`rounded-xl px-4 py-2 text-xs font-extrabold transition sm:text-sm ${
                    active
                      ? "bg-[#16331f] text-white shadow-sm"
                      : "border border-[#d9e6d3] bg-[#f6faf4] text-[#3d5c44] hover:border-[#d4af37]"
                  }`}
                >
                  {l.short}
                </button>
              );
            })}
          </div>

          {/* Instant Majorship Pill / Select Switcher */}
          {majorOptions.length > 0 && (
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#5c7863]">
                2. Majorship{majorRequired ? ":" : " (BSNEd/BECEd):"}
              </span>
              <select
                aria-label="Choose your majorship"
                value={major ?? ""}
                onChange={(e) => updateLevelAndMajor(levelKey, e.target.value || null)}
                className="input-warm max-w-xs font-bold"
              >
                <option value="">
                  {majorRequired ? "— Pick your Majorship —" : "— No major (Plain BEEd) —"}
                </option>
                {majorOptions.map((mName) => (
                  <option key={mName} value={mName}>
                    {mName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ==================== 3 GAME WORLD MODE TABS ==================== */}
        <div className="mt-6 flex flex-wrap gap-2 border-b-2 border-[#d9e6d3] pb-3">
          {[
            {
              id: "campaign" as const,
              icon: "🗺️",
              label: "Campaign Map",
              badge: isLET ? `${visibleSets.length} sets` : `${mocks.length} mocks`,
            },
            {
              id: "arena" as const,
              icon: "⚡",
              label: "Quick Arena & Drills",
              badge: "Instant Practice",
            },
            {
              id: "codex" as const,
              icon: "📖",
              label: "Reading Notes & Lessons",
              badge: "Study Codex",
            },
          ].map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-extrabold transition ${
                  active
                    ? "bg-[#16331f] text-white shadow-md"
                    : "bg-white text-[#3d5c44] border border-[#d9e6d3] hover:border-[#d4af37]"
                }`}
              >
                <span className="text-lg">{t.icon}</span>
                <span>{t.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                    active ? "bg-[#ca8a04] text-white" : `${accentSoft} ${accentText}`
                  }`}
                >
                  {t.badge}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ==================== TAB 1: CAMPAIGN MAP (CONNECTED PROGRESSION) ==================== */}
      {tab === "campaign" && (
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Subject World Selector */}
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#5c7863]">
              Select Subject Campaign Track
            </h2>
            {isLET && (
              <Link
                href={`/review/${trackSlug}/sets?level=${levelKey}${major ? `&major=${encodeURIComponent(major)}` : ""}`}
                className="text-xs font-extrabold text-[#15803d] hover:underline"
              >
                View full set catalog ({allSets.length} sets) →
              </Link>
            )}
          </div>

          <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {subjects.map((s) => {
              const selected = activeSubject === s.key;
              const count = subjectCount(s.key);
              const pct = masteryFor(s.key);
              const isSpec = s.key === "Specialization";
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setActiveSubject(s.key)}
                  className={`game-card game-card-interactive flex flex-col p-4 text-left ${
                    selected ? "border-[#16a34a] ring-2 ring-[#16a34a]/30 bg-[#f6faf4]" : ""
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-2xl">{s.icon}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${accentSoft} ${accentText}`}>
                      {isSpec && !major ? "Pick major" : `${count.toLocaleString()} items`}
                    </span>
                  </div>
                  <div className="text-base font-black text-[#16331f]">
                    {isSpec && major ? `Majorship · ${major}` : s.key}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-[#5c7863]">{s.note}</p>
                  <div className="mt-3 w-full">
                    <div className="mb-1 flex justify-between text-[11px] font-bold text-[#5c7863]">
                      <span>Mastery</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#e2ece0]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#16a34a] to-[#eab308]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Prompt to choose majorship if Specialization selected without a major */}
          {activeSubject === "Specialization" && !major && (
            <div className="game-card mb-8 border-[#eab308] bg-[#fffbeb] p-6 text-center">
              <div className="mb-2 text-4xl">🎯</div>
              <h3 className="text-lg font-black text-[#16331f]">
                Choose your Majorship to reveal your Specialization Campaign Map
              </h3>
              <p className="mx-auto mt-1 mb-4 max-w-lg text-xs text-[#5c7863]">
                Pick one of the official PRC majorship tracks below to load your 15-set progression trail:
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {majorOptions.map((mName) => (
                  <button
                    key={mName}
                    type="button"
                    onClick={() => updateLevelAndMajor(levelKey, mName)}
                    className="btn-arcade-gold px-4 py-2 text-xs"
                  >
                    {mName}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Action Banner for the Active Subject */}
          {(activeSubject !== "Specialization" || major) && subjectCount(activeSubject) > 0 && (
            <div className="game-card mb-8 flex flex-col justify-between gap-4 bg-gradient-to-r from-[#f0fdf4] via-white to-[#fefce8] p-5 sm:flex-row sm:items-center">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-[#15803d]">
                  ⚡ Fast Warm-Up Before the 150-Item Paper
                </div>
                <div className="text-lg font-black text-[#16331f]">
                  {activeSubject === "Specialization" && major ? major : activeSubject} Quick Run
                </div>
                <p className="text-xs text-[#5c7863]">
                  Short on time? Jump straight into a 20-item instant-explanation drill or flip flashcards for this subject.
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <Link
                  href={
                    subscribed
                      ? studyHref("drill", { subjects: activeSubject, count: "20" })
                      : isSignedIn
                        ? "/dashboard"
                        : `/login?next=/review/${trackSlug}`
                  }
                  className="btn-arcade-green px-5 py-2.5 text-xs sm:text-sm"
                >
                  🎯 20-Item Quick Drill
                </Link>
                <Link
                  href={
                    subscribed
                      ? studyHref("flashcards", { subjects: activeSubject, count: "30" })
                      : isSignedIn
                        ? "/dashboard"
                        : `/login?next=/review/${trackSlug}`
                  }
                  className="btn-arcade-surface px-4 py-2.5 text-xs sm:text-sm"
                >
                  🃏 30 Flashcards
                </Link>
              </div>
            </div>
          )}

          {/* Connected Region Progression Path (for LET sets) */}
          {regions.length > 0 ? (
            <div className="space-y-6">
              {regions.map((region) => {
                const isOpen = openRegion === region.regionNo;
                const regionHasCurrent = region.nodes.some((n) => n.state === "current");
                return (
                  <div key={region.regionNo} className="game-card overflow-hidden">
                    {/* Region Header */}
                    <button
                      type="button"
                      onClick={() => setOpenRegion(isOpen ? 0 : region.regionNo)}
                      className="flex w-full items-center justify-between gap-4 bg-[#f6faf4] px-5 py-4 text-left transition hover:bg-[#eef6eb]"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black text-white ${
                            region.completedCount === region.totalCount
                              ? "bg-[#16a34a]"
                              : regionHasCurrent
                                ? "bg-[#ca8a04]"
                                : "bg-[#3d5c44]"
                          }`}
                        >
                          R{region.regionNo}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-black text-[#16331f]">{region.title}</h3>
                            {regionHasCurrent && (
                              <span className="rounded-full bg-[#fef9c3] px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-[#b45309]">
                                🎯 Active Region
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#5c7863]">{region.subtitle}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs font-extrabold text-[#16331f]">
                            {region.completedCount}/{region.totalCount} Cleared
                          </div>
                          <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-[#d9e6d3]">
                            <div
                              className="h-full rounded-full bg-[#16a34a]"
                              style={{
                                width: `${Math.round((region.completedCount / Math.max(1, region.totalCount)) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                        <span className="text-sm font-black text-[#5c7863]">{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </button>

                    {/* Connected Nodes Chain */}
                    {isOpen && (
                      <div className="divide-y divide-[#eef4ea] p-4 sm:p-6">
                        {region.nodes.map((node, idx) => (
                          <div key={node.set.id}>
                            <CampaignPathNode
                              node={node}
                              track={trackKey}
                              trackSlug={trackSlug}
                              isSignedIn={isSignedIn}
                              primaryBtn={primaryBtn}
                            />
                            {idx < region.nodes.length - 1 && (
                              <div className="my-1.5 flex items-center pl-6 text-xs font-black text-[#94a896]">
                                <span className="inline-block h-5 border-l-2 border-dashed border-[#16a34a]/50 pl-3">
                                  ↓
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Fallback when track has blueprint mocks or empty bank (e.g. CSE) */
            <div className="space-y-4">
              {mocks.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {mocks.map((e, idx) => {
                    const locked = !subscribed && !e.is_free_preview;
                    const href = locked
                      ? isSignedIn
                        ? "/dashboard"
                        : `/login?next=/review/${trackSlug}`
                      : `/exam/${e.id}`;
                    return (
                      <Link
                        key={e.id}
                        href={href}
                        className="game-card game-card-interactive flex items-center justify-between gap-4 p-5"
                      >
                        <div>
                          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[11px] font-extrabold text-[#15803d]">
                            Stage {idx + 1} · Boss Mock
                          </div>
                          <div className="text-base font-black text-[#16331f]">
                            {locked ? "🔒 " : "⏱️ "}
                            {e.title}
                          </div>
                          <div className="mt-1 text-xs text-[#5c7863]">
                            {e.question_count} items · {e.duration_minutes} min · {e.passing_pct}% to pass
                          </div>
                        </div>
                        <span className={`${primaryBtn} shrink-0 px-4 py-2 text-xs`}>
                          {locked ? "Locked" : "Battle →"}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}

              {samplers.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-[#5c7863]">
                    🎁 Free Tutorial Stage (No subscription needed)
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {samplers.map((e) => (
                      <Link
                        key={e.id}
                        href={`/exam/${e.id}`}
                        className="game-card game-card-interactive flex items-center justify-between gap-4 p-5"
                      >
                        <div>
                          <div className="font-black text-[#16331f]">🎁 {e.title}</div>
                          <div className="mt-1 text-xs text-[#5c7863]">
                            {e.question_count} items · instant explanations
                          </div>
                        </div>
                        <span className="btn-arcade-green px-4 py-2 text-xs">Play Free →</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ==================== TAB 2: QUICK ARENA & DRILLS ==================== */}
      {tab === "arena" && (
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="game-card mb-8 p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-black text-[#16331f]">⚡ Quick Practice Length</h2>
                <p className="text-xs text-[#5c7863]">
                  Choose how many items you want per round, then tap any Subject Arena below to launch immediately.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[10, 20, 30, 50].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setQuickCount(n)}
                    className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                      quickCount === n
                        ? "bg-[#16331f] text-white"
                        : "border border-[#d9e6d3] bg-white text-[#3d5c44] hover:border-[#d4af37]"
                    }`}
                  >
                    {n} items
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 1-Tap Subject Arena Cards */}
          <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {subjects.map((s) => {
              const count = subjectCount(s.key);
              const isSpec = s.key === "Specialization";
              const needsMajor = isSpec && majorRequired && !major;
              return (
                <div key={s.key} className="game-card flex flex-col p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-3xl">{s.icon}</span>
                    <span className={`rounded-lg px-2.5 py-1 text-xs font-extrabold ${accentSoft} ${accentText}`}>
                      {count.toLocaleString()} items
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-[#16331f]">
                    {isSpec && major ? `${s.key} · ${major}` : s.key}
                  </h3>
                  <p className="mt-1 mb-5 flex-1 text-xs leading-relaxed text-[#5c7863]">{s.note}</p>

                  {needsMajor ? (
                    <p className="rounded-xl bg-[#fffbeb] p-3 text-center text-xs font-bold text-[#b45309]">
                      👆 Pick your Majorship in the top bar first
                    </p>
                  ) : !subscribed ? (
                    <Link
                      href={isSignedIn ? "/dashboard" : `/login?next=/review/${trackSlug}`}
                      className="btn-arcade-surface w-full py-2.5 text-xs"
                    >
                      🔒 Subscribe to unlock
                    </Link>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href={studyHref("drill", { subjects: s.key, count: String(quickCount) })}
                        className="btn-arcade-green py-2.5 text-xs"
                      >
                        🎯 {quickCount}-Item Drill
                      </Link>
                      <Link
                        href={studyHref("flashcards", { subjects: s.key, count: String(quickCount) })}
                        className="btn-arcade-surface py-2.5 text-xs"
                      >
                        🃏 {quickCount} Cards
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Special Game Modes Row */}
          <h3 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-[#5c7863]">
            Special Challenge Modes
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Link
              href={subscribed ? studyHref("mistakes") : isSignedIn ? "/dashboard" : `/login?next=/review/${trackSlug}`}
              className="game-card game-card-interactive flex items-start gap-4 p-5"
            >
              <span className="text-3xl">🔁</span>
              <div>
                <div className="font-black text-[#16331f]">Boss Rematch: Retry Mistakes</div>
                <p className="mt-1 text-xs text-[#5c7863]">
                  Conquer the exact questions that defeated you in previous runs. Get one right and it clears from your mistake queue!
                </p>
              </div>
            </Link>

            <Link
              href={subscribed ? studyHref("drill") : isSignedIn ? "/dashboard" : `/login?next=/review/${trackSlug}`}
              className="game-card game-card-interactive flex items-start gap-4 p-5"
            >
              <span className="text-3xl">🛠️</span>
              <div>
                <div className="font-black text-[#16331f]">Custom Drill Builder</div>
                <p className="mt-1 text-xs text-[#5c7863]">
                  Mix multiple subjects, filter by difficulty (Easy / Average / Hard), or enable a custom countdown timer.
                </p>
              </div>
            </Link>

            {samplers.map((e) => (
              <Link
                key={e.id}
                href={`/exam/${e.id}`}
                className="game-card game-card-interactive flex items-start gap-4 p-5"
              >
                <span className="text-3xl">🎁</span>
                <div>
                  <div className="font-black text-[#16331f]">{e.title}</div>
                  <p className="mt-1 text-xs text-[#5c7863]">
                    {e.question_count} free preview items with instant explanations.
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ==================== TAB 3: STUDY CODEX (READING & LESSONS) ==================== */}
      {tab === "codex" && (
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {isLET && (
            <div className="game-card mb-8 flex flex-col items-start justify-between gap-4 border-[#eab308] bg-gradient-to-br from-[#fffbeb] to-white p-6 sm:flex-row sm:items-center">
              <div>
                <div className="mb-1 inline-flex rounded-full bg-[#fef9c3] px-3 py-0.5 text-xs font-extrabold text-[#b45309]">
                  📖 15 Books · 3,801 Sections
                </div>
                <h2 className="text-xl font-black text-[#16331f]">Complete LET Reading Library</h2>
                <p className="mt-1 max-w-xl text-xs text-[#5c7863]">
                  Read the deep reviewer notes for General Education, Professional Education, and every Majorship before battling the 150-item sets.
                </p>
              </div>
              <Link href="/read" className="btn-arcade-gold shrink-0 px-6 py-3 text-sm">
                Open Reading Library →
              </Link>
            </div>
          )}

          <h3 className="mb-4 text-lg font-black text-[#16331f]">📚 Topic Lessons</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((t) => (
              <Link
                key={t.id}
                href={`/review/${trackSlug}/topic/${t.id}`}
                className="game-card game-card-interactive p-5"
              >
                <div className={`mb-2 inline-flex rounded-lg px-2.5 py-0.5 text-xs font-extrabold ${accentSoft} ${accentText}`}>
                  Topic Codex
                </div>
                <h4 className="font-black text-[#16331f]">{t.title}</h4>
                <p className="mt-1 mb-4 text-xs text-[#5c7863]">{t.description}</p>
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-[#5c7863]">📖 {lessonCounts[t.id]?.total ?? 0} lessons</span>
                  <span className={accentText}>Read →</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CampaignPathNode({
  node,
  track,
  trackSlug,
  isSignedIn,
  primaryBtn,
}: {
  node: CampaignNode;
  track: Track;
  trackSlug: string;
  isSignedIn: boolean;
  primaryBtn: string;
}) {
  const { set: s, state, bestPct, attemptsCount, stars } = node;
  const isCurrent = state === "current";
  const isDone = state === "done";
  const isLocked = state === "locked";

  const examHref = isLocked
    ? isSignedIn
      ? "/dashboard"
      : `/login?next=/review/${trackSlug}`
    : `/exam/set/${s.id}`;
  const practiceHref = isLocked ? examHref : `/exam/set/${s.id}?mode=practice`;

  const badgeIcon = isDone ? "✅" : isCurrent ? "🎯" : isLocked ? "🔒" : "⚔️";

  return (
    <div
      className={`flex flex-col justify-between gap-4 rounded-2xl border-2 p-4 transition sm:flex-row sm:items-center ${
        isCurrent
          ? "border-[#ca8a04] bg-[#fffdf2] node-pulse-gold"
          : isDone
            ? "border-[#86efac] bg-[#f0fdf4]"
            : "border-[#e2ece0] bg-white"
      }`}
    >
      <div className="flex items-start gap-3.5">
        <div
          className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl font-black ${
            isDone
              ? "bg-[#16a34a] text-white"
              : isCurrent
                ? "bg-[#ca8a04] text-white"
                : "bg-[#eef4ea] text-[#3d5c44]"
          }`}
        >
          <span className="text-base leading-none">{badgeIcon}</span>
          <span className="mt-0.5 text-[10px]">#{s.set_no}</span>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-black text-[#16331f]">Set {s.set_no}</span>
            {isCurrent && (
              <span className="rounded-full bg-[#ca8a04] px-2.5 py-0.5 text-[10px] font-black uppercase text-white">
                Current Mission
              </span>
            )}
            {isDone && (
              <span className="rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[10px] font-black uppercase text-[#166534]">
                Cleared · {bestPct}%
              </span>
            )}
            {!isDone && bestPct !== null && (
              <span className="rounded-full bg-[#fef3c7] px-2.5 py-0.5 text-[10px] font-extrabold text-[#92400e]">
                Best: {bestPct}% ({attemptsCount}x)
              </span>
            )}
            <span className="text-xs" title={`${stars}/3 stars`}>
              {[1, 2, 3].map((n) => (
                <span key={n} className={n <= stars ? "text-[#eab308]" : "text-[#d9e6d3]"}>
                  ★
                </span>
              ))}
            </span>
          </div>

          <p className="mt-0.5 text-xs text-[#5c7863]">
            150 items · ⏱ {timedMinutes(150, track)}m · Mix: {s.shape_easy}E / {s.shape_medium_hard}M /{" "}
            {s.shape_extremely_hard}H / {s.shape_pedagogical}P
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!isLocked && (
          <Link
            href={practiceHref}
            className="btn-arcade-surface px-3.5 py-2 text-xs"
            title="Untimed practice mode with instant answer explanations"
          >
            💡 Practice Mode
          </Link>
        )}
        <Link href={examHref} className={`${primaryBtn} px-4 py-2 text-xs`}>
          {isLocked ? "🔒 Unlock" : isDone ? "Replay Mock →" : "⏱️ Start Timed Mock →"}
        </Link>
      </div>
    </div>
  );
}
```

**Step 2: Rewrite `src/app/(site)/review/[track]/page.tsx` to load all data in one `Promise.all` and render `TrackGameHub`**

Replace `D:\hermes project\teacher ceppee\src\app\(site)\review\[track]\page.tsx` with:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  getUserContext,
  hasActiveSub,
  getBankStats,
  getSubjectProgress,
  getRecentTrackAttempts,
} from "@/lib/queries";
import { levelsFor, specializationsFor } from "@/lib/exam";
import TrackGameHub from "@/components/study/TrackGameHub";
import type { Track, Topic, Exam, Level, SetCatalogRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const TRACKS: Record<string, Track> = { cse: "CSE", let: "LET" };

export async function generateMetadata({ params }: { params: Promise<{ track: string }> }): Promise<Metadata> {
  const { track } = await params;
  const t = TRACKS[track];
  return { title: t ? `${t} Review Campaign` : "Review" };
}

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ track: string }>;
  searchParams: Promise<{ level?: string; major?: string }>;
}) {
  const [{ track }, sp] = await Promise.all([params, searchParams]);
  const trackKey = TRACKS[track];
  if (!trackKey) notFound();

  const levelOptions = levelsFor(trackKey);
  const levelKey = (levelOptions.find((l) => l.key === sp.level)?.key ?? levelOptions[0].key) as Level;
  const hasMajorPicker = trackKey === "LET" && (levelKey === "secondary" || levelKey === "elementary");
  const majorOptions = specializationsFor(levelKey);
  const major = hasMajorPicker ? (majorOptions.includes(sp.major ?? "") ? (sp.major as string) : null) : null;

  const supabase = await createClient();
  const admin = getAdminClient();

  // Parallelize ALL queries instead of a 5-step serial waterfall!
  const [
    { user, subs, isAdmin },
    stats,
    setCatalogRes,
    topicsRes,
    lessonRowsRes,
    examsRes,
  ] = await Promise.all([
    getUserContext(),
    getBankStats(trackKey),
    supabase.rpc("set_catalog", {
      p_track: trackKey,
      p_level: null,
      p_specialization: null,
    }),
    supabase
      .from("topics")
      .select("*")
      .eq("track", trackKey)
      .eq("is_published", true)
      .order("order_index"),
    admin
      .from("lessons")
      .select("topic_id, is_free")
      .eq("is_published", true),
    supabase
      .from("exams")
      .select("*")
      .eq("track", trackKey)
      .eq("is_active", true)
      .order("order_index"),
  ]);

  const subscribed = isAdmin || hasActiveSub(subs, trackKey);

  // Fetch user-specific mastery and recent attempts in parallel when signed in
  const [mastery, attempts] = user
    ? await Promise.all([
        getSubjectProgress(trackKey),
        getRecentTrackAttempts(user.id, trackKey),
      ])
    : [[], []];

  const lessonCounts: Record<string, { total: number; free: number }> = {};
  (lessonRowsRes.data || []).forEach((l: { topic_id: string; is_free: boolean }) => {
    if (!lessonCounts[l.topic_id]) lessonCounts[l.topic_id] = { total: 0, free: 0 };
    lessonCounts[l.topic_id].total++;
    if (l.is_free) lessonCounts[l.topic_id].free++;
  });

  return (
    <TrackGameHub
      trackKey={trackKey}
      trackSlug={track}
      initialLevel={levelKey}
      initialMajor={major}
      subscribed={subscribed}
      isSignedIn={!!user}
      stats={stats}
      allSets={(setCatalogRes.data as SetCatalogRow[]) ?? []}
      attempts={attempts}
      mastery={mastery}
      exams={(examsRes.data as Exam[]) ?? []}
      topics={(topicsRes.data as Topic[]) ?? []}
      lessonCounts={lessonCounts}
    />
  );
}
```

**Step 3: Verify TypeScript compiles cleanly**

Run:
```bash
cd "D:/hermes project/teacher ceppee" && npx tsc -p tsconfig.json --noEmit
```
Expected: exit 0.

**Step 4: Commit**

```bash
cd "D:/hermes project/teacher ceppee"
git add src/components/study/TrackGameHub.tsx "src/app/(site)/review/[track]/page.tsx"
git commit -m "feat: replace static review page waterfall with instant client-filtered TrackGameHub and campaign map"
```

---

### Task 7: Support Practice Mode on Set Mocks (`/exam/set/[setId]`) and Gamify `/review/[track]/sets`

**Objective:**
1. Allow `/exam/set/[setId]?mode=practice` to pass `p_practice: true` to `start_set_mock` (the SQL RPC in `supabase/set-mocks.sql` *already* accepts `p_practice boolean` and returns keys + explanations when `true`!) and launch `StudyRunner` in untimed instant-feedback drill mode.
2. Upgrade `/review/[track]/sets` to fetch all sets + user attempts in parallel and render an instant client-filtered **Campaign Map & Region Browser (`SetCampaignBrowser.tsx`)** so switching Subject / Level / Majorship on `/review/let/sets` is also 0ms and shows `✅ Cleared`, `🎯 Next`, and `★ Stars`.

**Files:**
- Modify: `D:\hermes project\teacher ceppee\src\app\(site)\exam\set\[setId]\page.tsx`
- Create: `D:\hermes project\teacher ceppee\src\components\study\SetCampaignBrowser.tsx`
- Modify: `D:\hermes project\teacher ceppee\src\app\(site)\review\[track]\sets\page.tsx`

**Step 1: Update `src/app/(site)/exam/set/[setId]/page.tsx` to support `?mode=practice` and parallel fetch**

Replace `D:\hermes project\teacher ceppee\src\app\(site)\exam\set\[setId]\page.tsx` with:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasActiveSub } from "@/lib/queries";
import { levelLabel, passingPctFor, timedMinutes } from "@/lib/exam";
import StudyRunner from "@/components/study/StudyRunner";
import { LockedCard, EmptyBank, RunnerShell } from "@/components/study/States";
import type { BankQuestion, Level, PracticeQuestion, Track } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Set Mock" };

interface SetRow {
  id: string;
  track: Track;
  subject: string | null;
  specialization: string | null;
  level: Level;
  set_no: number;
  title: string;
  item_count: number;
  shape_easy: number;
  shape_medium_hard: number;
  shape_extremely_hard: number;
  shape_pedagogical: number;
}

export default async function SetMockPage({
  params,
  searchParams,
}: {
  params: Promise<{ setId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const [{ setId }, sp] = await Promise.all([params, searchParams]);
  const isPractice = sp.mode === "practice";

  const supabase = await createClient();
  const [{ user, subs, isAdmin }, { data: set }] = await Promise.all([
    getUserContext(),
    supabase
      .from("question_sets")
      .select(
        "id, track, subject, specialization, level, set_no, title, item_count, shape_easy, shape_medium_hard, shape_extremely_hard, shape_pedagogical"
      )
      .eq("id", setId)
      .maybeSingle(),
  ]);

  if (!user) redirect(`/login?next=/exam/set/${setId}`);

  if (!set) {
    return (
      <RunnerShell>
        <LockedCard
          title="Set not found"
          msg="This set may have been removed, or it isn't available yet."
          backHref="/review/let/sets"
          backLabel="All sets"
          loginHref="/"
        />
      </RunnerShell>
    );
  }

  const s = set as SetRow;
  const track = s.track;
  const trackSlug = track.toLowerCase();
  const backHref = `/review/${trackSlug}?level=${s.level === "both" ? "secondary" : s.level}${
    s.specialization ? `&major=${encodeURIComponent(s.specialization)}` : ""
  }`;
  const subscribed = isAdmin || hasActiveSub(subs, track);

  if (!subscribed) {
    return (
      <RunnerShell>
        <LockedCard
          title="This paper is locked 🔒"
          msg={`"${s.title}" is part of the ${track} bank. Subscribe for ₱500 to unlock every set mock, drill and flashcard.`}
          backHref={backHref}
          backLabel="Back to reviewer"
          loginHref="/dashboard"
        />
      </RunnerShell>
    );
  }

  const { data, error } = await supabase.rpc("start_set_mock", {
    p_set_id: s.id,
    p_practice: isPractice,
  });
  if (error) console.error("start_set_mock", error.message);
  const questions = (data as (BankQuestion | PracticeQuestion)[]) ?? [];

  if (questions.length === 0) {
    return (
      <RunnerShell>
        <EmptyBank what={`questions for "${s.title}"`} backHref={backHref} backLabel="Back to reviewer" />
      </RunnerShell>
    );
  }

  const parts = [
    s.subject === "Specialization" && s.specialization ? s.specialization : s.subject,
    levelLabel(track, s.level),
  ].filter(Boolean);

  const borrowed = 150 - (s.shape_easy + s.shape_medium_hard + s.shape_extremely_hard + s.shape_pedagogical);

  return (
    <RunnerShell>
      <StudyRunner
        kind={isPractice ? "drill" : "mock"}
        attemptKind={isPractice ? "drill" : "exam"}
        track={track}
        level={s.level}
        title={`${isPractice ? "💡 " : "⏱️ "}${s.title}`}
        subtitle={parts.join(" · ")}
        description={
          isPractice
            ? `Set ${s.set_no} in untimed Practice Mode — see the correct answer and explanation right after every item.`
            : `Set ${s.set_no} as a full 150-item timed paper — shuffled and graded with a full breakdown when you submit.`
        }
        backHref={backHref}
        backLabel="Back to Campaign Map"
        label={`${s.title} (set mock)`}
        passingPct={passingPctFor(track)}
        examId={null}
        questions={questions}
        durationMinutes={isPractice ? undefined : timedMinutes(questions.length, track)}
      />

      <div className="mt-6 space-y-1 text-center text-xs text-[#94a896]">
        <p>
          Composition: {s.shape_easy} easy · {s.shape_medium_hard} medium-hard · {s.shape_extremely_hard} extremely
          hard · {s.shape_pedagogical} pedagogical
        </p>
        {borrowed > 0 && (
          <p>
            This set holds fewer than 150 items on its own — the remainder comes from other {s.subject} sets of the
            same difficulty, so the paper is still 150.
          </p>
        )}
      </div>

      <div className="mt-4 text-center">
        <Link href={backHref} className="text-sm text-[#5c7863] hover:text-[#16331f]">
          ← Back to the {track} Campaign Map
        </Link>
      </div>
    </RunnerShell>
  );
}
```

**Step 2: Create `src/components/study/SetCampaignBrowser.tsx` and update `src/app/(site)/review/[track]/sets/page.tsx`**

Create `D:\hermes project\teacher ceppee\src\components\study\SetCampaignBrowser.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  levelsFor,
  levelLabel,
  specializationsFor,
  subjectIcon,
  timedMinutes,
  passingPctFor,
} from "@/lib/exam";
import { buildCampaignRegions, type AttemptSummary } from "@/lib/game";
import type { Level, SetCatalogRow, Track } from "@/lib/types";

export default function SetCampaignBrowser({
  trackKey,
  trackSlug,
  initialLevel,
  initialMajor,
  subscribed,
  signedIn,
  allSets,
  attempts,
}: {
  trackKey: Track;
  trackSlug: string;
  initialLevel: Level;
  initialMajor: string | null;
  subscribed: boolean;
  signedIn: boolean;
  allSets: SetCatalogRow[];
  attempts: AttemptSummary[];
}) {
  const isLET = trackKey === "LET";
  const levelOptions = levelsFor(trackKey);
  const [levelKey, setLevelKey] = useState<Level>(initialLevel);
  const [major, setMajor] = useState<string | null>(initialMajor);
  const [activeSubject, setActiveSubject] = useState<string>("General Education");

  const majorOptions = useMemo(() => (isLET ? specializationsFor(levelKey) : []), [isLET, levelKey]);
  const passingPct = passingPctFor(trackKey);

  const syncUrl = (nextLevel: Level, nextMajor: string | null) => {
    setLevelKey(nextLevel);
    setMajor(nextMajor);
    try {
      const p = new URLSearchParams({ level: nextLevel });
      if (nextMajor) p.set("major", nextMajor);
      window.history.replaceState(null, "", `/review/${trackSlug}/sets?${p.toString()}`);
    } catch {
      /* ignore */
    }
  };

  const filteredSets = useMemo(() => {
    return allSets.filter((r) => {
      if (r.level !== "both" && r.level !== levelKey) return false;
      if (r.subject === "Specialization") {
        if (!major) return false;
        return r.specialization === major;
      }
      return true;
    });
  }, [allSets, levelKey, major]);

  const subjectTabs = useMemo(() => {
    if (isLET) {
      return [
        { key: "General Education", label: "General Education" },
        { key: "Professional Education", label: "Professional Education" },
        { key: "Specialization", label: major ? `Majorship · ${major}` : "Majorship" },
      ];
    }
    const keys = [...new Set(filteredSets.map((s) => s.subject ?? "General"))];
    return keys.map((k) => ({ key: k, label: k }));
  }, [isLET, major, filteredSets]);

  const subjectSets = useMemo(
    () => filteredSets.filter((r) => (r.subject ?? "General") === activeSubject),
    [filteredSets, activeSubject]
  );

  const regions = useMemo(
    () =>
      buildCampaignRegions(subjectSets, attempts, {
        passingPct,
        subscribed,
        regionSize: 5,
      }),
    [subjectSets, attempts, passingPct, subscribed]
  );

  const totalSets = filteredSets.length;
  const totalItems = filteredSets.reduce((a, r) => a + r.live, 0);
  const btn = isLET ? "btn-arcade-gold" : "btn-arcade-green";
  const grad = isLET ? "from-[#b45309] to-[#eab308]" : "from-[#15803d] to-[#16a34a]";

  return (
    <div>
      <section className={`relative overflow-hidden bg-gradient-to-br ${grad} py-10`}>
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Link
            href={`/review/${trackSlug}?level=${levelKey}${major ? `&major=${encodeURIComponent(major)}` : ""}`}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-white/85 hover:text-white"
          >
            ← Back to {trackKey} Campaign Arena
          </Link>
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-black/20 px-4 py-1 text-xs font-extrabold text-white">
                {isLET ? "🍎 Licensure Exam for Teachers" : "🏛️ Civil Service Exam"} · {levelLabel(trackKey, levelKey)}
              </div>
              <h1 className="text-3xl font-black text-white sm:text-4xl">Set Mocks Campaign</h1>
              <p className="mt-1 max-w-2xl text-sm text-white/90">
                Connected 150-item papers grouped into 5-set Regions. Clear each set in Timed Mock mode or study it untimed in Practice Mode.
              </p>
            </div>
            <div className="flex gap-2.5">
              <div className="rounded-2xl bg-black/20 px-4 py-2 text-center backdrop-blur">
                <div className="text-xl font-black text-white">{totalSets}</div>
                <div className="text-[10px] font-bold uppercase text-white/75">sets</div>
              </div>
              <div className="rounded-2xl bg-black/20 px-4 py-2 text-center backdrop-blur">
                <div className="text-xl font-black text-white">{totalItems.toLocaleString()}</div>
                <div className="text-[10px] font-bold uppercase text-white/75">items</div>
              </div>
              <div className="rounded-2xl bg-black/20 px-4 py-2 text-center backdrop-blur">
                <div className="text-xl font-black text-white">{passingPct}%</div>
                <div className="text-[10px] font-bold uppercase text-white/75">target</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Instant Level & Majorship Filter Bar */}
        <div className="game-card mb-6 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#5c7863]">Level:</span>
            {levelOptions.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => syncUrl(l.key, major)}
                className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                  l.key === levelKey
                    ? "bg-[#16331f] text-white"
                    : "border border-[#d9e6d3] bg-white text-[#3d5c44] hover:border-[#d4af37]"
                }`}
              >
                {l.short}
              </button>
            ))}
          </div>

          {majorOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#5c7863]">Majorship:</span>
              <select
                aria-label="Filter sets by majorship"
                value={major ?? ""}
                onChange={(e) => syncUrl(levelKey, e.target.value || null)}
                className="input-warm max-w-xs font-bold"
              >
                <option value="">— Pick your Majorship —</option>
                {majorOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Subject Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {subjectTabs.map((st) => {
            const active = activeSubject === st.key;
            const count = filteredSets.filter((r) => (r.subject ?? "General") === st.key).length;
            return (
              <button
                key={st.key}
                type="button"
                onClick={() => setActiveSubject(st.key)}
                className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition ${
                  active
                    ? "bg-[#16331f] text-white shadow"
                    : "border border-[#d9e6d3] bg-white text-[#3d5c44] hover:border-[#d4af37]"
                }`}
              >
                <span>{subjectIcon(trackKey, st.key)}</span>
                <span>{st.label}</span>
                <span className="rounded-full bg-black/15 px-2 py-0.5 text-xs">{count}</span>
              </button>
            );
          })}
        </div>

        {activeSubject === "Specialization" && !major && (
          <div className="game-card mb-6 border-[#fde68a] bg-[#fffbeb] p-6 text-center">
            <p className="mb-3 text-sm font-black text-[#b45309]">
              👆 Select your Majorship to unlock its 15-set trail:
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {majorOptions.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => syncUrl(levelKey, o)}
                  className="btn-arcade-gold px-3.5 py-2 text-xs"
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Regions */}
        <div className="space-y-8">
          {regions.map((reg) => (
            <div key={reg.regionNo} className="game-card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#d9e6d3] pb-3">
                <div>
                  <h2 className="text-lg font-black text-[#16331f]">{reg.title}</h2>
                  <p className="text-xs text-[#5c7863]">{reg.subtitle}</p>
                </div>
                <span className="rounded-full bg-[#dcfce7] px-3 py-1 text-xs font-extrabold text-[#15803d]">
                  {reg.completedCount}/{reg.totalCount} Cleared
                </span>
              </div>

              <div className="space-y-3">
                {reg.nodes.map((node, idx) => {
                  const s = node.set;
                  const isCurrent = node.state === "current";
                  const isDone = node.state === "done";
                  const isLocked = node.state === "locked";
                  const href = isLocked
                    ? signedIn
                      ? "/dashboard"
                      : `/login?next=/review/${trackSlug}/sets`
                    : `/exam/set/${s.id}`;
                  return (
                    <div key={s.id}>
                      <div
                        className={`flex flex-col justify-between gap-3 rounded-2xl border-2 p-4 sm:flex-row sm:items-center ${
                          isCurrent
                            ? "border-[#ca8a04] bg-[#fffdf2]"
                            : isDone
                              ? "border-[#86efac] bg-[#f0fdf4]"
                              : "border-[#e2ece0] bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ${
                              isDone
                                ? "bg-[#16a34a] text-white"
                                : isCurrent
                                  ? "bg-[#ca8a04] text-white"
                                  : "bg-[#eef4ea] text-[#3d5c44]"
                            }`}
                          >
                            {isDone ? "✓" : isCurrent ? "🎯" : isLocked ? "🔒" : s.set_no}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-[#16331f]">Set {s.set_no}</span>
                              <span className="text-xs text-[#eab308]">
                                {"★".repeat(node.stars)}
                                <span className="text-[#d9e6d3]">{"★".repeat(3 - node.stars)}</span>
                              </span>
                              {node.bestPct !== null && (
                                <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-extrabold text-[#166534]">
                                  Best: {node.bestPct}%
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#5c7863]">
                              150 items · ⏱ {timedMinutes(150, trackKey)} min · {s.shape_easy}E / {s.shape_medium_hard}M /{" "}
                              {s.shape_extremely_hard}H / {s.shape_pedagogical}P
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {!isLocked && (
                            <Link href={`/exam/set/${s.id}?mode=practice`} className="btn-arcade-surface px-3 py-2 text-xs">
                              💡 Practice
                            </Link>
                          )}
                          <Link href={href} className={`${btn} px-4 py-2 text-xs`}>
                            {isLocked ? "🔒 Subscribe" : isDone ? "Replay →" : "Start Paper →"}
                          </Link>
                        </div>
                      </div>
                      {idx < reg.nodes.length - 1 && (
                        <div className="my-1 pl-5 text-xs font-black text-[#16a34a]/70">↓</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

Now replace `D:\hermes project\teacher ceppee\src\app\(site)\review\[track]\sets\page.tsx` with:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasActiveSub, getRecentTrackAttempts } from "@/lib/queries";
import { levelsFor, specializationsFor } from "@/lib/exam";
import SetCampaignBrowser from "@/components/study/SetCampaignBrowser";
import type { Level, SetCatalogRow, Track } from "@/lib/types";

export const dynamic = "force-dynamic";

const TRACKS: Record<string, Track> = { cse: "CSE", let: "LET" };

export async function generateMetadata({ params }: { params: Promise<{ track: string }> }): Promise<Metadata> {
  const { track } = await params;
  const t = TRACKS[track];
  return { title: t ? `${t} Set Mocks` : "Set Mocks" };
}

export default async function SetPickerPage({
  params,
  searchParams,
}: {
  params: Promise<{ track: string }>;
  searchParams: Promise<{ level?: string; major?: string }>;
}) {
  const [{ track }, sp] = await Promise.all([params, searchParams]);
  const trackKey = TRACKS[track];
  if (!trackKey) notFound();

  const levelOptions = levelsFor(trackKey);
  const levelKey = (levelOptions.find((l) => l.key === sp.level)?.key ?? levelOptions[0].key) as Level;
  const majorOptions = trackKey === "LET" ? specializationsFor(levelKey) : [];
  const major = majorOptions.includes(sp.major ?? "") ? (sp.major as string) : null;

  const supabase = await createClient();
  const [{ user, subs, isAdmin }, { data }] = await Promise.all([
    getUserContext(),
    supabase.rpc("set_catalog", {
      p_track: trackKey,
      p_level: null,
      p_specialization: null,
    }),
  ]);

  const subscribed = isAdmin || hasActiveSub(subs, trackKey);
  const attempts = user ? await getRecentTrackAttempts(user.id, trackKey) : [];
  const rows = (data as SetCatalogRow[]) ?? [];

  return (
    <SetCampaignBrowser
      trackKey={trackKey}
      trackSlug={track}
      initialLevel={levelKey}
      initialMajor={major}
      subscribed={subscribed}
      signedIn={!!user}
      allSets={rows}
      attempts={attempts}
    />
  );
}
```

**Step 3: Verify TypeScript compiles cleanly**

Run:
```bash
cd "D:/hermes project/teacher ceppee" && npx tsc -p tsconfig.json --noEmit
```
Expected: exit 0.

**Step 4: Commit**

```bash
cd "D:/hermes project/teacher ceppee"
git add "src/app/(site)/exam/set/[setId]/page.tsx" src/components/study/SetCampaignBrowser.tsx "src/app/(site)/review/[track]/sets/page.tsx"
git commit -m "feat: add practice mode to set mocks and gamified region trail to set picker"
```

---

### Task 8: Upgrade `StudyRunner.tsx` into an Arcade Quiz Runner (Combo Streak, XP Counter, Keyboard Shortcuts, Compact Map Drawer)

**Objective:** Transform `src/components/study/StudyRunner.tsx` so taking a practice drill or 150-item mock exam feels like a polished quiz game:
1. **Live Combo Streak & XP Bar in `RunnerHeader`**: Every consecutive right answer increments `🔥 Streak` and multiplies XP (`+10 × comboMultiplier(streak) XP`), and calls `record_answer` in drill mode so mastery updates immediately.
2. **Tactile 3D Option Tiles + Keyboard Hotkeys**: Press `1`/`A`, `2`/`B`, `3`/`C`, `4`/`D` to pick an option and `Enter`/`ArrowRight` for the next question.
3. **Collapsible Question Map Drawer**: Instead of permanently dumping 150 number buttons at the bottom of the screen, show a compact sliding 10-question window strip with a **"🗺️ Map (150)"** toggle button that opens the full grid on demand.
4. **Victory / Rank Results Screen**: Celebrates with earned XP, peak combo streak, star rating (`★ 1–3`), and a **"Review Mistakes Only"** filter toggle on the post-exam answer review list so students don't have to scroll through all 150 items to find the 18 they missed.

**Files:**
- Modify: `D:\hermes project\teacher ceppee\src\components\study\StudyRunner.tsx`

**Step 1: Replace `src/components/study/StudyRunner.tsx` with the Arcade Game Runner**

Replace `D:\hermes project\teacher ceppee\src\components\study\StudyRunner.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fmtDuration } from "@/lib/format";
import { subjectIcon } from "@/lib/exam";
import { comboMultiplier } from "@/lib/game";
import type { BankQuestion, GradedAnswer, Level, PracticeQuestion, Track } from "@/lib/types";

const LETTERS = ["A", "B", "C", "D"] as const;

type RunnerQuestion = BankQuestion | PracticeQuestion;

function hasKey(q: RunnerQuestion): q is PracticeQuestion {
  return typeof (q as PracticeQuestion).correct_choice === "string";
}

export interface StudyRunnerProps {
  kind: "mock" | "drill" | "flashcards";
  track: Track;
  level: Level;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  backHref: string;
  backLabel?: string;
  /** Label stored on the attempt row, e.g. "CSE Professional — Full Mock Exam". */
  label: string;
  passingPct: number;
  examId?: string | null;
  /** Overrides the attempt row's kind (a timed drill is kind='drill'). */
  attemptKind?: "exam" | "drill" | "flashcards";
  questions: RunnerQuestion[];
  /** Timed papers only. */
  durationMinutes?: number;
}

type Phase = "intro" | "run" | "results";

export default function StudyRunner(props: StudyRunnerProps) {
  const {
    kind, track, level, title, subtitle, description, backHref, backLabel,
    label, passingPct, examId, questions,
  } = props;

  const isMock = kind === "mock";
  const isCards = kind === "flashcards";
  const total = questions.length;
  const totalSeconds = Math.max(1, (props.durationMinutes ?? 0) * 60);

  const [phase, setPhase] = useState<Phase>("intro");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [graded, setGraded] = useState<GradedAnswer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<"all" | "wrong">("all");

  // Arcade Game State (Drills & Flashcards)
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [lastXpGain, setLastXpGain] = useState<number | null>(null);

  // Flashcards
  const [deck, setDeck] = useState<PracticeQuestion[]>(() => questions.filter(hasKey));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [missedAll, setMissedAll] = useState<PracticeQuestion[]>([]);
  const [queue, setQueue] = useState<PracticeQuestion[]>([]);
  const [pass, setPass] = useState(1);

  const submittedRef = useRef(false);
  const supabase = useMemo(() => createClient(), []);

  const answeredCount = Object.keys(answers).length;

  const recordSelf = useCallback(
    (questionId: string, correct: boolean) => {
      void supabase.rpc("record_answer", { p_question_id: questionId, p_correct: correct });
    },
    [supabase]
  );

  const handleSelectChoice = useCallback(
    (q: RunnerQuestion, letter: "A" | "B" | "C" | "D") => {
      if (isMock) {
        setAnswers((a) => ({ ...a, [q.id]: letter }));
        return;
      }
      if (answers[q.id]) return; // Already locked in during instant-feedback drill
      setAnswers((a) => ({ ...a, [q.id]: letter }));

      if (hasKey(q)) {
        const isRight = q.correct_choice === letter;
        recordSelf(q.id, isRight);
        if (isRight) {
          const nextStreak = streak + 1;
          const mult = comboMultiplier(nextStreak);
          const gain = 10 * mult;
          setStreak(nextStreak);
          setBestStreak((b) => Math.max(b, nextStreak));
          setXpEarned((x) => x + gain);
          setLastXpGain(gain);
        } else {
          setStreak(0);
          setLastXpGain(null);
        }
      }
    },
    [answers, isMock, recordSelf, streak]
  );

  const submitTimed = useCallback(
    async (autoTimedOut = false) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setBusy(true);
      setError(null);

      const ids = isMock ? questions.map((q) => q.id) : Object.keys(answers);
      if (ids.length === 0) {
        setBusy(false);
        submittedRef.current = false;
        setError("Answer at least one item first.");
        return;
      }

      const { data, error: rpcError } = await supabase.rpc("grade_attempt", {
        p_question_ids: ids,
        p_answers: answers,
        p_exam_id: examId ?? null,
        p_kind: props.attemptKind ?? (isMock ? "exam" : "drill"),
        p_label: label,
        p_track: track,
        p_level: level,
        p_seconds: isMock ? Math.max(0, totalSeconds - secondsLeft) : 0,
      });

      if (rpcError) {
        setError(rpcError.message);
        setBusy(false);
        submittedRef.current = false;
        return;
      }

      const rows = (data as GradedAnswer[]) ?? [];
      const order = new Map(questions.map((q, i) => [q.id, i]));
      rows.sort((a, b) => (order.get(a.question_id) ?? 0) - (order.get(b.question_id) ?? 0));
      const rightCount = rows.filter((r) => r.ok).length;
      if (isMock) {
        const pct = rows.length > 0 ? Math.round((rightCount / rows.length) * 100) : 0;
        setXpEarned(rightCount * 10 + (pct >= passingPct ? 150 : 0));
      }
      setGraded(rows);
      setPhase("results");
      setBusy(false);
      if (autoTimedOut) window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [answers, examId, isMock, label, level, passingPct, props.attemptKind, questions, secondsLeft, supabase, totalSeconds, track]
  );

  // Countdown — timed papers only
  useEffect(() => {
    if (!isMock || phase !== "run") return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          void submitTimed(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isMock, phase, submitTimed]);

  // Keyboard shortcuts during drill / mock run
  useEffect(() => {
    if (phase !== "run" || isCards) return;
    const q = questions[current];
    if (!q) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toUpperCase();
      if (k === "A" || k === "1") handleSelectChoice(q, "A");
      else if (k === "B" || k === "2") handleSelectChoice(q, "B");
      else if (k === "C" || k === "3") handleSelectChoice(q, "C");
      else if (k === "D" || k === "4") handleSelectChoice(q, "D");
      else if (e.key === "ArrowRight" && current < total - 1) setCurrent((c) => c + 1);
      else if (e.key === "ArrowLeft" && current > 0) setCurrent((c) => c - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, isCards, questions, current, total, handleSelectChoice]);

  /* ============================== INTRO ============================== */
  if (phase === "intro") {
    return (
      <div className="game-card relative overflow-hidden p-8 text-center sm:p-10">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#d4af37]/15 blur-2xl" />
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#dcfce7] px-4 py-1 text-xs font-extrabold uppercase tracking-wider text-[#15803d]">
          {isMock ? "⏱️ Boss Exam Stage" : isCards ? "🃏 Flashcard Blitz" : "🎯 Practice Arena"}
        </div>
        <h1 className="mb-2 text-2xl font-black text-[#16331f] sm:text-3xl">{title}</h1>
        {subtitle && <p className="mb-1 text-sm font-bold text-[#15803d]">{subtitle}</p>}
        {description && <p className="mx-auto mb-6 max-w-lg text-sm text-[#5c7863]">{description}</p>}

        <div className="mx-auto mb-8 mt-4 grid max-w-lg grid-cols-3 gap-3">
          <Stat value={String(isCards ? deck.length : total)} label="Questions" />
          <Stat value={isMock ? `${props.durationMinutes}m` : "∞"} label={isMock ? "Time limit" : "Untimed"} />
          <Stat value={`${passingPct}%`} label="Clear Target" />
        </div>

        <p className="mx-auto mb-8 max-w-md rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm font-medium text-[#166534]">
          {isMock
            ? "⚠️ Boss Rules: The timer runs nonstop. Flag tricky items with 🚩, and earn +150 Bonus XP when you clear the passing mark!"
            : isCards
              ? "🃏 Read the card, think of your answer, then flip. Cards marked “Hindi ko” re-queue until you master them."
              : "🎯 Build a combo streak! Consecutive right answers multiply your XP up to 5x. Tip: use keys A–D or 1–4."}
        </p>

        <button onClick={() => setPhase("run")} className="btn-arcade-green px-10 py-4 text-base">
          {isMock ? "⚔️ Start Boss Exam →" : isCards ? "🃏 Deal Flashcards →" : "⚡ Enter Arena →"}
        </button>

        <div className="mt-5">
          <Link href={backHref} className="text-sm font-bold text-[#5c7863] hover:text-[#16331f]">
            ← {backLabel ?? "Back to Campaign Map"}
          </Link>
        </div>
      </div>
    );
  }

  /* ============================== FLASHCARDS ============================== */
  if (isCards && phase === "run") {
    const card = deck[index];
    if (!card) return null;

    function markCard(knownIt: boolean) {
      recordSelf(card.id, knownIt);
      if (knownIt) {
        const nextStreak = streak + 1;
        setStreak(nextStreak);
        setBestStreak((b) => Math.max(b, nextStreak));
        setXpEarned((x) => x + 10 * comboMultiplier(nextStreak));
        setKnownCount((k) => k + 1);
      } else {
        setStreak(0);
        if (pass === 1) setMissedAll((m) => [...m, card]);
        if (missedAll.length < 60) setQueue((qq) => [...qq, card]);
      }

      const nextIndex = index + 1;
      if (nextIndex < deck.length) {
        setIndex(nextIndex);
        setRevealed(false);
        return;
      }
      if (pass === 1 && queue.length + (knownIt ? 0 : 1) > 0) {
        const retry = knownIt ? queue : [...queue, card];
        setDeck(retry);
        setQueue([]);
        setIndex(0);
        setPass(2);
        setRevealed(false);
        return;
      }
      setPhase("results");
    }

    return (
      <div>
        <RunnerHeader
          left={`Card ${index + 1} / ${deck.length}`}
          center={
            <div className="flex items-center gap-2 text-xs font-extrabold">
              <span className="rounded-lg bg-[#fef9c3] px-2.5 py-1 text-[#b45309]">⚡ {xpEarned} XP</span>
              {streak > 0 && (
                <span className="rounded-lg bg-[#dcfce7] px-2.5 py-1 text-[#15803d]">
                  🔥 {streak}x
                </span>
              )}
            </div>
          }
          right={<span className="text-[#16331f]">✅ {knownCount} · 🔁 {missedAll.length}</span>}
          progress={((index + 1) / Math.max(1, deck.length)) * 100}
        />

        <div className="game-card min-h-[320px] p-6 sm:p-8">
          {card.subject && (
            <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-[#94a896]">
              {subjectIcon(track, card.subject)}
              {card.subtopic ? ` · ${card.subtopic}` : card.subject ? ` · ${card.subject}` : ""}
            </p>
          )}
          <h2 className="mb-6 text-lg font-black leading-relaxed text-[#16331f]">{card.question_text}</h2>

          <div className="space-y-2.5">
            {LETTERS.map((c) => {
              const isCorrect = revealed && card.correct_choice === c;
              return (
                <div
                  key={c}
                  className={`flex items-start gap-3 rounded-2xl border-2 px-4 py-3 text-sm transition ${
                    isCorrect
                      ? "border-[#16a34a] bg-[#dcfce7] font-bold text-[#16331f] animate-pop"
                      : "border-[#d9e6d3] bg-white text-[#3d5c44]"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                      isCorrect ? "bg-gradient-to-br from-[#16a34a] to-[#d4af37] text-white" : "bg-[#dcfce7] text-[#15803d]"
                    }`}
                  >
                    {c}
                  </span>
                  <span>{card[`choice_${c.toLowerCase()}` as "choice_a"]}</span>
                </div>
              );
            })}
          </div>

          {revealed && card.explanation && (
            <p className="mt-4 rounded-2xl border border-[#86efac] bg-[#f0fdf4] px-4 py-3 text-sm text-[#15803d] animate-pop">
              💡 {card.explanation}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {!revealed ? (
            <button onClick={() => setRevealed(true)} className="btn-arcade-gold px-8 py-3.5 text-sm">
              🃏 Flip Card — Reveal Answer
            </button>
          ) : (
            <>
              <button onClick={() => markCard(true)} className="btn-arcade-green px-8 py-3.5 text-sm">
                ✅ Alam ko ito (+{10 * comboMultiplier(streak + 1)} XP)
              </button>
              <button
                onClick={() => markCard(false)}
                className="btn-arcade-surface border-[#f59e0b] bg-[#fffbeb] px-8 py-3.5 text-sm text-[#b45309]"
              >
                🔁 Hindi ko — Balik-aral
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ============================== RESULTS ============================== */
  if (phase === "results") {
    if (isCards) {
      const firstPass = knownCount + missedAll.length;
      const knownPct = firstPass > 0 ? Math.round((knownCount / firstPass) * 100) : 0;
      const good = knownPct >= passingPct;
      return (
        <div>
          <div className="game-card relative overflow-hidden p-8 text-center sm:p-10">
            <div className="mb-2 text-5xl">{good ? "🏆" : "💪"}</div>
            <h1 className="mb-1 text-2xl font-black text-[#16331f] sm:text-3xl">
              {missedAll.length === 0 ? "Flawless Deck Clear!" : good ? "Deck Cleared!" : "Keep Drilling"}
            </h1>
            <p className="mb-4 text-sm text-[#5c7863]">
              +{xpEarned} XP earned · Best streak: 🔥 {bestStreak}x
            </p>
            <Ring pct={knownPct} label={`${knownCount}/${firstPass}`} good={good} />
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href={backHref} className="btn-arcade-green px-6 py-3 text-sm">
                {backLabel ?? "Back to Campaign Map"}
              </Link>
              <Link
                href={`/study/${track.toLowerCase()}/mistakes?level=${level}`}
                className="btn-arcade-surface px-6 py-3 text-sm"
              >
                🔁 Retry My Mistakes
              </Link>
            </div>
          </div>
        </div>
      );
    }

    const score = graded.filter((g) => g.ok).length;
    const wrongCount = graded.length - score;
    const pct = graded.length > 0 ? Math.round((score / graded.length) * 100) : 0;
    const passed = pct >= passingPct;
    const stars = pct >= 90 ? 3 : passed ? 2 : pct >= 50 ? 1 : 0;
    const bySubject = groupBySubject(graded);
    const displayedReview = reviewFilter === "wrong" ? graded.filter((g) => !g.ok) : graded;

    return (
      <div>
        <div className="game-card relative overflow-hidden p-8 text-center sm:p-10">
          <div className="mb-2 text-4xl">
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= stars ? "text-[#eab308]" : "text-[#d9e6d3]"}>
                ★
              </span>
            ))}
          </div>
          <h1 className="mb-1 text-2xl font-black text-[#16331f] sm:text-3xl">
            {passed ? "Stage Cleared! 🎉" : "Stage Incomplete — Try Again! 💪"}
          </h1>
          <p className="mb-4 text-sm font-bold text-[#15803d]">
            ⚡ +{xpEarned} XP Earned {bestStreak > 1 ? `· 🔥 Best Combo: ${bestStreak}x` : ""}
          </p>

          <Ring pct={pct} label={`${score}/${graded.length}`} good={passed} />

          {isMock && (
            <p className="mb-2 mt-4 text-sm text-[#5c7863]">
              Time used: <strong className="text-[#16331f]">{fmtDuration(totalSeconds - secondsLeft)}</strong>
            </p>
          )}

          {bySubject.length > 1 && (
            <div className="mx-auto mt-6 max-w-lg space-y-3 text-left">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#5c7863]">By section</h3>
              {bySubject.map((s) => (
                <div key={s.subject} className="rounded-xl border border-[#d9e6d3] p-3">
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-bold text-[#16331f]">
                      {subjectIcon(track, s.subject)} {s.subject}
                    </span>
                    <span className="text-xs font-bold text-[#5c7863]">
                      {s.correct}/{s.total} · {s.pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#d9e6d3]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${s.pct}%`,
                        background: s.pct >= 80 ? "#16a34a" : s.pct >= 60 ? "#eab308" : "#ef4444",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={backHref} className="btn-arcade-green px-6 py-3 text-sm">
              {backLabel ?? "Back to Campaign Map"}
            </Link>
            <Link
              href={`/study/${track.toLowerCase()}/mistakes?level=${level}`}
              className="btn-arcade-surface px-6 py-3 text-sm"
            >
              🔁 Retry My Mistakes
            </Link>
            <Link href="/dashboard" className="btn-arcade-surface px-6 py-3 text-sm">
              Dashboard
            </Link>
          </div>
        </div>

        <div className="mb-4 mt-10 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black text-[#16331f]">📝 Answer Debrief ({displayedReview.length})</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setReviewFilter("all")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-extrabold ${
                reviewFilter === "all" ? "bg-[#16331f] text-white" : "border border-[#d9e6d3] bg-white text-[#3d5c44]"
              }`}
            >
              All ({graded.length})
            </button>
            <button
              type="button"
              onClick={() => setReviewFilter("wrong")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-extrabold ${
                reviewFilter === "wrong" ? "bg-[#991b1b] text-white" : "border border-[#d9e6d3] bg-white text-[#991b1b]"
              }`}
            >
              Mistakes Only ({wrongCount})
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {displayedReview.map((g, i) => (
            <div key={g.question_id} className={`game-card p-5 sm:p-6 ${g.ok ? "border-[#bbf7d0]" : "border-red-200"}`}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <span className="font-bold text-[#16331f]">
                  {i + 1}. {g.question_text}
                </span>
                <span className={`badge ${g.ok ? "badge-approved" : "badge-rejected"}`}>{g.ok ? "✓" : "✕"}</span>
              </div>
              <div className="space-y-1.5 text-sm">
                {LETTERS.map((c) => {
                  const isCorrect = g.correct_choice === c;
                  const isChosen = g.chosen === c;
                  const text = g[`choice_${c.toLowerCase()}` as "choice_a"];
                  return (
                    <div
                      key={c}
                      className={`rounded-lg px-3 py-2 ${
                        isCorrect
                          ? "bg-[#dcfce7] font-semibold text-[#166534]"
                          : isChosen
                            ? "bg-[#fee2e2] text-[#991b1b]"
                            : "text-[#5c7863]"
                      }`}
                    >
                      {c}. {text}
                      {isCorrect && " ✓"}
                      {isChosen && !isCorrect && " ✕ (your answer)"}
                    </div>
                  );
                })}
              </div>
              {g.explanation && (
                <p className="mt-3 rounded-xl bg-[#dcfce7] px-4 py-3 text-sm text-[#15803d]">💡 {g.explanation}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ============================== DRILL / MOCK RUNNING ============================== */
  const q = questions[current];
  if (!q) return null;
  const chosen = answers[q.id];
  const answeredThis = Boolean(chosen);
  const key = hasKey(q) ? q : null;
  const isLast = current >= total - 1;
  const timeCritical = isMock && secondsLeft < 300;
  const isFlagged = Boolean(flagged[q.id]);

  // Compact 9-item sliding window around current item
  const winStart = Math.max(0, Math.min(current - 4, total - 9));
  const winEnd = Math.min(total, winStart + 9);

  return (
    <div>
      <RunnerHeader
        left={`Q${current + 1} / ${total}`}
        center={
          isMock ? (
            <span className={timeCritical ? "animate-pulse text-red-600" : "text-[#16331f]"}>
              ⏱ {fmtDuration(secondsLeft)}
            </span>
          ) : (
            <div className="flex items-center gap-2 text-xs font-extrabold">
              <span className="rounded-lg bg-[#fef9c3] px-2.5 py-1 text-[#b45309]">⚡ {xpEarned} XP</span>
              {streak > 0 && (
                <span className="rounded-lg bg-[#dcfce7] px-2.5 py-1 text-[#15803d] animate-pop">
                  🔥 {streak}x ({comboMultiplier(streak)}x XP)
                </span>
              )}
            </div>
          )
        }
        right={
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-bold text-[#5c7863] sm:inline">
              {answeredCount}/{total}
            </span>
            <button
              type="button"
              onClick={() => setMapOpen((o) => !o)}
              className="rounded-xl border border-[#d9e6d3] bg-white px-2.5 py-1 text-xs font-extrabold text-[#16331f] hover:border-[#d4af37]"
            >
              🗺️ {mapOpen ? "Hide Map" : "Map"}
            </button>
          </div>
        }
        progress={((current + 1) / Math.max(1, total)) * 100}
      />

      {/* Collapsible Full Question Grid Drawer */}
      {mapOpen && (
        <div className="game-card mb-4 p-4 animate-pop">
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-[#5c7863]">
            <span>Jump to any question ({answeredCount} answered)</span>
            <button type="button" onClick={() => setMapOpen(false)} className="font-extrabold text-[#16331f]">
              Close ✕
            </button>
          </div>
          <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto p-1">
            {questions.map((qq, i) => (
              <button
                key={qq.id}
                type="button"
                onClick={() => {
                  setCurrent(i);
                  setMapOpen(false);
                }}
                className={`h-8 w-8 rounded-lg text-xs font-extrabold transition ${
                  i === current
                    ? "bg-[#16331f] text-white"
                    : flagged[qq.id]
                      ? "bg-[#fef9c3] text-[#b45309] ring-1 ring-[#ca8a04]"
                      : answers[qq.id]
                        ? "bg-[#dcfce7] text-[#166534]"
                        : "bg-[#eef4ea] text-[#5c7863]"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="game-card p-6 sm:p-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#94a896]">
            {q.subject ? `${subjectIcon(track, q.subject)} ${q.subtopic ?? q.subject}` : "Question"}
          </p>
          <button
            type="button"
            onClick={() => setFlagged((f) => ({ ...f, [q.id]: !f[q.id] }))}
            className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${
              isFlagged ? "bg-[#fef9c3] text-[#b45309]" : "text-[#94a896] hover:bg-[#f6faf4]"
            }`}
          >
            🚩 {isFlagged ? "Flagged" : "Flag"}
          </button>
        </div>

        <h2 className="mb-6 text-lg font-black leading-relaxed text-[#16331f]">
          {current + 1}. {q.question_text}
        </h2>

        <div className="space-y-3">
          {LETTERS.map((c) => {
            const selected = chosen === c;
            const showCorrect = !isMock && answeredThis && key?.correct_choice === c;
            const showWrong = !isMock && answeredThis && selected && key && key.correct_choice !== c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => handleSelectChoice(q, c)}
                className={`flex w-full items-center gap-3 rounded-2xl border-2 border-b-4 px-5 py-4 text-left text-sm transition ${
                  showCorrect
                    ? "border-[#16a34a] bg-[#dcfce7] font-bold text-[#16331f] animate-pop"
                    : showWrong
                      ? "border-red-400 bg-[#fee2e2] font-semibold text-[#991b1b] animate-shake"
                      : selected
                        ? "border-[#16a34a] bg-[#dcfce7] font-bold text-[#16331f]"
                        : "border-[#d9e6d3] bg-white text-[#3d5c44] hover:border-[#d4af37]"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-black ${
                    selected || showCorrect
                      ? "bg-gradient-to-br from-[#16a34a] to-[#d4af37] text-white"
                      : "bg-[#dcfce7] text-[#15803d]"
                  }`}
                >
                  {c}
                </span>
                <span className="flex-1">{q[`choice_${c.toLowerCase()}` as "choice_a"]}</span>
                {showCorrect && <span className="font-black text-[#166534]">✓</span>}
                {showWrong && <span className="font-black text-[#991b1b]">✕</span>}
              </button>
            );
          })}
        </div>

        {!isMock && answeredThis && key && (
          <div className="mt-5 animate-pop">
            <div
              className={`flex items-center justify-between rounded-2xl px-5 py-3.5 text-sm font-extrabold ${
                chosen === key.correct_choice ? "bg-[#dcfce7] text-[#166534]" : "bg-[#fee2e2] text-[#991b1b]"
              }`}
            >
              <span>
                {chosen === key.correct_choice
                  ? `✓ Tama! ${streak >= 3 ? `🔥 ${streak} in a row!` : ""}`
                  : `✕ Mali — Correct answer is ${key.correct_choice}.`}
              </span>
              {chosen === key.correct_choice && lastXpGain && (
                <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs text-[#15803d]">
                  +{lastXpGain} XP
                </span>
              )}
            </div>
            {key.explanation && (
              <p className="mt-3 rounded-2xl border border-[#86efac] bg-[#f0fdf4] px-5 py-4 text-sm leading-relaxed text-[#15803d]">
                💡 {key.explanation}
              </p>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-4 rounded-xl bg-[#fee2e2] px-4 py-3 text-sm text-[#991b1b]">⚠️ {error}</p>}

      {/* Action Bar + Compact Sliding Window Strip */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="btn-arcade-surface px-5 py-3 text-sm disabled:opacity-40"
        >
          ← Prev
        </button>

        <div className="hidden items-center gap-1.5 sm:flex">
          {questions.slice(winStart, winEnd).map((qq, idx) => {
            const realIdx = winStart + idx;
            return (
              <button
                key={qq.id}
                type="button"
                onClick={() => setCurrent(realIdx)}
                className={`h-8 w-8 rounded-lg text-xs font-extrabold transition ${
                  realIdx === current
                    ? "bg-[#16331f] text-white"
                    : answers[qq.id]
                      ? "bg-[#dcfce7] text-[#166534]"
                      : "bg-[#eef4ea] text-[#5c7863]"
                }`}
              >
                {realIdx + 1}
              </button>
            );
          })}
        </div>

        {isLast ? (
          <button
            type="button"
            onClick={() => void submitTimed()}
            disabled={busy}
            className="btn-arcade-gold px-8 py-3 text-sm disabled:opacity-60"
          >
            {busy ? "Scoring…" : isMock ? "🏁 Submit Boss Exam ✓" : "🏆 Finish & Claim XP ✓"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))}
            className="btn-arcade-green px-8 py-3 text-sm"
          >
            {!isMock && !answeredThis ? "Skip →" : "Next →"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================== helpers ============================== */

function groupBySubject(rows: GradedAnswer[]) {
  const map = new Map<string, { subject: string; total: number; correct: number; pct: number }>();
  rows.forEach((r) => {
    const key = r.subject ?? "General";
    const entry = map.get(key) ?? { subject: key, total: 0, correct: 0, pct: 0 };
    entry.total++;
    if (r.ok) entry.correct++;
    map.set(key, entry);
  });
  return [...map.values()]
    .map((e) => ({ ...e, pct: Math.round((e.correct / e.total) * 100) }))
    .sort((a, b) => a.pct - b.pct);
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-[#dcfce7] p-4">
      <div className="text-xl font-black text-[#16331f] sm:text-2xl">{value}</div>
      <div className="text-xs font-bold text-[#15803d]">{label}</div>
    </div>
  );
}

function Ring({ pct, label, good }: { pct: number; label: string; good: boolean }) {
  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r="52" fill="none" stroke="#d9e6d3" strokeWidth="12" />
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke={good ? "#22c55e" : "#f59e0b"}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 326.7} 326.7`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-[#16331f]">{pct}%</span>
        <span className="text-xs font-bold text-[#5c7863]">{label}</span>
      </div>
    </div>
  );
}

function RunnerHeader({
  left,
  center,
  right,
  progress,
}: {
  left: string;
  center: React.ReactNode;
  right?: React.ReactNode;
  progress: number;
}) {
  return (
    <>
      <div className="game-card sticky top-20 z-30 mb-3 flex items-center justify-between gap-2 px-4 py-3">
        <div className="text-sm font-black text-[#16331f]">{left}</div>
        <div>{center}</div>
        <div>{right}</div>
      </div>
      <div className="mb-5 h-2.5 w-full overflow-hidden rounded-full bg-[#d9e6d3]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#16a34a] to-[#d4af37] transition-all"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
    </>
  );
}
```

**Step 2: Verify TypeScript compiles cleanly**

Run:
```bash
cd "D:/hermes project/teacher ceppee" && npx tsc -p tsconfig.json --noEmit
```
Expected: exit 0.

**Step 3: Commit**

```bash
cd "D:/hermes project/teacher ceppee"
git add src/components/study/StudyRunner.tsx
git commit -m "feat: upgrade StudyRunner with combo streak XP multiplier, hotkeys, and collapsible map drawer"
```

---

### Task 9: Parallelize Reading Library & Drill Pages (`/read/[book]`, `/read/[book]/[order]`, `/study/[track]/*`)

**Objective:** Remove the remaining sequential database waterfalls in `/read/[book]/page.tsx`, `/read/[book]/[order]/page.tsx`, `/study/[track]/drill/page.tsx`, `/study/[track]/flashcards/page.tsx`, and `/exam/[examId]/page.tsx` so every page in the app resolves in a single parallel wave.

**Files:**
- Modify: `D:\hermes project\teacher ceppee\src\app\(site)\read\[book]\page.tsx:43-74`
- Modify: `D:\hermes project\teacher ceppee\src\app\(site)\read\[book]\[order]\page.tsx:72-102`
- Modify: `D:\hermes project\teacher ceppee\src\app\(site)\study\[track]\drill\page.tsx:21-48`
- Modify: `D:\hermes project\teacher ceppee\src\app\(site)\study\[track]\flashcards\page.tsx:21-48`
- Modify: `D:\hermes project\teacher ceppee\src\app\(site)\exam\[examId]\page.tsx:15-23`

**Step 1: Parallelize queries in `src/app/(site)/read/[book]/page.tsx`**

In `D:\hermes project\teacher ceppee\src\app\(site)\read\[book]\page.tsx`, replace lines 43–74 with:

```tsx
export default async function BookPage({ params }: { params: Promise<{ book: string }> }) {
  const { book: slug } = await params;
  const supabase = await createClient();

  const [
    { subs, isAdmin },
    { data: bookRow },
    { data: tocData },
    { data: accessData },
    { data: doneRows },
  ] = await Promise.all([
    getUserContext(),
    supabase.from("reading_books").select("*").eq("slug", slug).maybeSingle(),
    supabase.rpc("reading_toc", { p_slug: slug }),
    supabase.rpc("reading_access", { p_slug: slug }),
    supabase.from("reading_progress").select("section_id, completed_at").not("completed_at", "is", null),
  ]);

  if (!bookRow) notFound();
  const book = bookRow as Book;
  const subscribed = isAdmin || hasActiveSub(subs, "LET");

  const toc = (tocData ?? []) as TocRow[];
  const access = (accessData?.[0] ?? { total: toc.length, readable: toc.length, completed: 0 }) as {
    total: number;
    readable: number;
    completed: number;
  };
  const done = new Set((doneRows ?? []).map((r) => r.section_id as string));
```

**Step 2: Parallelize queries in `src/app/(site)/read/[book]/[order]/page.tsx`**

In `D:\hermes project\teacher ceppee\src\app\(site)\read\[book]\[order]\page.tsx`, replace lines 72–97 with:

```tsx
  const { book: slug, order } = await params;
  const orderIndex = Number(order);
  if (!Number.isFinite(orderIndex)) notFound();

  const supabase = await createClient();
  const [{ user, subs, isAdmin }, { data: bookRow }, { data: tocData }] = await Promise.all([
    getUserContext(),
    supabase
      .from("reading_books")
      .select("id, title, slug, section_count, track")
      .eq("slug", slug)
      .maybeSingle(),
    supabase.rpc("reading_toc", { p_slug: slug }),
  ]);
  if (!bookRow) notFound();
  const book = bookRow as Book;
  const subscribed = isAdmin || hasActiveSub(subs, "LET");

  // RLS decides: a locked section simply is not returned.
  const { data: secRow } = await supabase
    .from("reading_sections")
    .select("*")
    .eq("book_id", book.id)
    .eq("order_index", orderIndex)
    .maybeSingle();
```
And make the `reading_progress` upsert non-blocking (`void supabase.from("reading_progress").upsert(...)`) so opening a reading section does not wait on a write round-trip before rendering HTML.

**Step 3: Parallelize `getUserContext` and `getBankStats` in `drill/page.tsx`, `flashcards/page.tsx`, and `exam/[examId]/page.tsx`**

In `src/app/(site)/study/[track]/drill/page.tsx` and `src/app/(site)/study/[track]/flashcards/page.tsx`, fetch `[params, searchParams, getUserContext()]` in `Promise.all`. In `src/app/(site)/exam/[examId]/page.tsx`, fetch `[getUserContext(), supabase.from("exams").select("*").eq("id", examId).maybeSingle()]` in `Promise.all`.

**Step 4: Verify TypeScript compiles cleanly**

Run:
```bash
cd "D:/hermes project/teacher ceppee" && npx tsc -p tsconfig.json --noEmit
```
Expected: exit 0.

**Step 5: Commit**

```bash
cd "D:/hermes project/teacher ceppee"
git add "src/app/(site)/read/[book]/page.tsx" "src/app/(site)/read/[book]/[order]/page.tsx" "src/app/(site)/study/[track]/drill/page.tsx" "src/app/(site)/study/[track]/flashcards/page.tsx" "src/app/(site)/exam/[examId]/page.tsx"
git commit -m "perf: parallelize Supabase queries across read, drill, flashcards, and exam pages"
```

---

### Task 10: End-to-End Verification (Unit Tests, Typecheck, Production Build & Local HTTP Timing Probe)

**Objective:** Verify that all unit tests pass, TypeScript compiles with zero errors, the production build succeeds, and real HTTP responses from a local production server (`/review/let`, `/review/let/sets`, `/read`) render the new Game Hub and Campaign Map rapidly.

**Files:**
- Modify: `D:\hermes project\teacher ceppee\tsconfig.json` (revert any `.next-verify` injection from Next build)

**Step 1: Run the Node test suite**

Run:
```bash
cd "D:/hermes project/teacher ceppee" && node --test --experimental-strip-types tests/game.test.mjs tests/study-params.test.mjs
```
Expected: PASS (all 4 tests pass, 0 failures).

**Step 2: Run TypeScript type check**

Run:
```bash
cd "D:/hermes project/teacher ceppee" && npx tsc -p tsconfig.json --noEmit
```
Expected: exit 0.

**Step 3: Build production bundle into `.next-verify` and measure response time & rendered HTML**

Run:
```bash
cd "D:/hermes project/teacher ceppee" && NEXT_DIST_DIR=.next-verify npx next build
```
Expected: Build succeeds with all routes compiled.

Restore `tsconfig.json` if Next rewrote `include`:
```bash
cd "D:/hermes project/teacher ceppee" && git checkout -- tsconfig.json
```

Start the verification server on port 3003 and probe `/review/let?level=secondary&major=Mathematics` and `/review/let/sets?level=secondary&major=Mathematics`:
```bash
cd "D:/hermes project/teacher ceppee" && curl -s -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" "http://localhost:3003/review/let?level=secondary&major=Mathematics"
```
Expected: `HTTP 200` with the HTML containing `LET Campaign Arena`, `Campaign Map`, `Region I · Foundation Grounds`, and `Practice Mode`.

---

## Risks, Tradeoffs, and Open Questions

1. **Supabase Region Latency vs. App Waterfalls:**
   - Even with single-wave `Promise.all` queries, the first cold load still makes 1 parallel trip to Supabase. Moving Level, Majorship, Subject, and Tab switching to client state (`TrackGameHub` + `SetCampaignBrowser`) makes **all subsequent clicks on `/review/let` and `/review/let/sets` 0ms (instant)**, and adding `loading.tsx` makes cross-page transitions feel immediate (<50ms visual response).
2. **Retroactive XP & Cleared Sets:**
   - `computePlayerStats` and `buildCampaignRegions` compute XP, Level, Rank, Streak, and `✅ Cleared` set stars directly from the existing `exam_attempts` table (`label = "<Set Title> (set mock)"`), so no destructive database migration is required and students immediately see credit for papers they already completed.
3. **Practice Mode on Set Mocks:**
   - `start_set_mock(p_set_id, p_practice)` in `supabase/set-mocks.sql` already implemented `p_practice boolean default false`! Wiring `/exam/set/[setId]?mode=practice` unlocks instant-explanation practice on all 202 sets with zero SQL changes.
