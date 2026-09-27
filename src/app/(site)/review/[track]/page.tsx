import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getUserContext, hasActiveSub, getBankStats, countAvailable } from "@/lib/queries";
import { peso } from "@/lib/format";
import { levelsFor, levelMeta, subjectsFor, STUDY_MODES, SPECIALIZATIONS, levelLabel } from "@/lib/exam";
import MajorshipPicker from "@/components/study/MajorshipPicker";
import type { Track, Topic, Exam, ExamWithCount, Level, BankStat } from "@/lib/types";

export const dynamic = "force-dynamic";

const TRACKS: Record<string, Track> = { cse: "CSE", let: "LET" };

const meta: Record<Track, { label: string; emoji: string; text: string; soft: string; grad: string; dot: string }> = {
  CSE: {
    label: "Civil Service Exam",
    emoji: "🏛️",
    text: "text-[#15803d]",
    soft: "bg-[#dcfce7]",
    grad: "from-[#16a34a] to-[#d4af37]",
    dot: "#16a34a",
  },
  LET: {
    label: "Licensure Exam for Teachers",
    emoji: "🍎",
    text: "text-[#b45309]",
    soft: "bg-[#fef9c3]",
    grad: "from-[#ca8a04] to-[#eab308]",
    dot: "#ca8a04",
  },
};

export async function generateMetadata({ params }: { params: Promise<{ track: string }> }): Promise<Metadata> {
  const { track } = await params;
  const t = TRACKS[track];
  return { title: t ? `${t} Review` : "Review" };
}

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ track: string }>;
  searchParams: Promise<{ level?: string; major?: string }>;
}) {
  const { track } = await params;
  const sp = await searchParams;
  const trackKey = TRACKS[track];
  if (!trackKey) notFound();

  const m = meta[trackKey];
  const { user, subs, isAdmin } = await getUserContext();
  const subscribed = isAdmin || hasActiveSub(subs, trackKey);

  const levelOptions = levelsFor(trackKey);
  const levelKey = (levelOptions.find((l) => l.key === sp.level)?.key ?? levelOptions[0].key) as Level;
  const level = levelMeta(trackKey, levelKey)!;
  const wantsMajor = trackKey === "LET" && levelKey === "secondary";
  const major = wantsMajor ? (SPECIALIZATIONS.includes(sp.major ?? "") ? (sp.major as string) : null) : null;

  const supabase = await createClient();
  const admin = getAdminClient();

  const stats: BankStat[] = await getBankStats(trackKey);
  const subjects = subjectsFor(trackKey, levelKey);
  const available = countAvailable(stats, levelKey);
  const subjectCount = (subject: string) =>
    stats
      .filter((s) => (levelKey === "both" || s.level === "both" || s.level === levelKey) && s.subject === subject)
      .reduce((sum, s) => sum + Number(s.accessible ?? 0), 0);

  const base = `/review/${track}`;
  const q = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ level: levelKey, ...(major ? { major } : {}), ...extra });
    return p.toString();
  };
  const study = (mode: string, extra: Record<string, string> = {}) => `/study/${track}/${mode}?${q(extra)}`;

  const { data: topics } = await supabase
    .from("topics")
    .select("*")
    .eq("track", trackKey)
    .eq("is_published", true)
    .order("order_index");

  const { data: lessonRows } = await admin
    .from("lessons")
    .select("topic_id, is_free")
    .eq("is_published", true);
  const lessonCounts: Record<string, { total: number; free: number }> = {};
  (lessonRows || []).forEach((l: { topic_id: string; is_free: boolean }) => {
    if (!lessonCounts[l.topic_id]) lessonCounts[l.topic_id] = { total: 0, free: 0 };
    lessonCounts[l.topic_id].total++;
    if (l.is_free) lessonCounts[l.topic_id].free++;
  });

  const { data: exams } = await supabase
    .from("exams")
    .select("*")
    .eq("track", trackKey)
    .eq("is_active", true)
    .order("order_index");

  const allExams = (exams as ExamWithCount[]) ?? [];
  const levelExams = allExams.filter((e) => e.level === levelKey || e.level === "both" || e.is_free_preview);
  const mocks = levelExams.filter((e) => e.mode === "mock");
  const samplers = allExams.filter((e) => e.is_free_preview);

  return (
    <div>
      {/* Track header */}
      <section className={`relative overflow-hidden bg-gradient-to-br ${m.grad} py-12`}>
        <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-sm font-bold text-white">
                {m.emoji} {m.label}
              </div>
              <h1 className="text-4xl font-black text-white sm:text-5xl">{trackKey} Review</h1>
              <p className="mt-2 max-w-xl text-white/90">
                {subscribed
                  ? "✅ Active subscription — pick how you want to study today."
                  : user
                    ? `🔒 Subscribe for ${peso(500)} to unlock mocks, drills, flashcards and lessons.`
                    : `🔓 Free preview available. Subscribe for ${peso(500)} to unlock everything.`}
              </p>
            </div>
            {!subscribed && (
              <Link
                href={user ? "/dashboard" : "/login?next=/dashboard"}
                className="rounded-xl bg-white px-7 py-3.5 font-bold text-[#16331f] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                Subscribe — {peso(500)}
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Which paper are you taking? */}
        <div className="mb-8">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-[#5c7863]">
            {trackKey === "CSE" ? "Which level are you taking?" : "Which level are you taking?"}
          </h2>
          <p className="mb-4 text-sm text-[#5c7863]">
            {trackKey === "CSE"
              ? "Professional and Sub-Professional are different papers — verbal, numerical and general information are shared, but the fourth section differs."
              : "Elementary and Secondary are different papers. Secondary also has your Specialization (majorship) subtest."}
          </p>
          <div className="flex flex-wrap gap-3">
            {levelOptions.map((l) => {
              const active = l.key === levelKey;
              const count = countAvailable(stats, l.key);
              return (
                <Link
                  key={l.key}
                  href={`${base}?level=${l.key}`}
                  className={`card card-hover flex-1 basis-full p-5 sm:basis-0 ${active ? "ring-2 ring-[#16a34a]" : ""}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className={`text-sm font-bold ${active ? m.text : "text-[#3d5c44]"}`}>{l.short}</span>
                    {active && <span className="text-xs font-bold text-[#16a34a]">SELECTED</span>}
                  </div>
                  <p className="mb-3 text-xs text-[#5c7863]">{l.blurb}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#5c7863]">
                    <span>📄 {l.facts.items}</span>
                    <span>⏱ {l.facts.time}</span>
                    <span>🎯 {l.facts.passing}</span>
                  </div>
                  <div className="mt-3 text-xs font-semibold text-[#15803d]">{count} items unlocked</div>
                </Link>
              );
            })}
          </div>
          {wantsMajor && (
            <div className="mt-4">
              <MajorshipPicker
                current={major}
                options={SPECIALIZATIONS}
                basePath={base}
                level="secondary"
              />
            </div>
          )}
        </div>

        {/* Bank empty note */}
        {available === 0 && (
          <div className="card mb-8 border-[#fde68a] bg-[#fffbeb] p-5">
            <p className="text-sm text-[#b45309]">
              <strong>🧠 The question bank for this paper is still being uploaded.</strong> Teacher Ceppee is adding
              the items now — the modes below light up with real questions automatically as soon as they land. Nothing
              to do on your side.
            </p>
          </div>
        )}

        {/* Study modes */}
        <h2 className="mb-1 text-2xl font-black text-[#16331f]">How do you want to study?</h2>
        <p className="mb-5 text-sm text-[#5c7863]">
          Studying for {levelLabel(trackKey, levelKey)}
          {major ? ` · ${major}` : ""} — every mode uses the same question bank.
        </p>
        <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STUDY_MODES.map((mode) => {
            const isMockMode = mode.id === "mock";
            const href = isMockMode ? "#mocks" : study(mode.id);
            const locked = !subscribed && !isMockMode;
            return (
              <Link
                key={mode.id}
                href={locked ? (user ? "/dashboard" : "/login?next=/dashboard") : href}
                className={`card card-hover flex flex-col p-5 ${locked ? "opacity-70" : ""}`}
              >
                <div className="mb-2 text-3xl">{mode.icon}</div>
                <h3 className="mb-1 font-bold text-[#16331f]">
                  {locked && "🔒 "}
                  {mode.title}
                </h3>
                <p className={`mb-2 text-xs font-semibold ${m.text}`}>{mode.short}</p>
                <p className="text-xs leading-relaxed text-[#5c7863]">{mode.note}</p>
              </Link>
            );
          })}
        </div>

        {/* Subjects */}
        <h2 className="mb-1 text-2xl font-black text-[#16331f]">Practice by subject</h2>
        <p className="mb-5 text-sm text-[#5c7863]">Pick the section you want to focus on today.</p>
        <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => {
            const count = subjectCount(s.key);
            const isMajor = s.key === "Specialization";
            const needsMajor = isMajor && wantsMajor && !major;
            const drillHref = study("drill", { subjects: s.key });
            return (
              <div key={s.key} className="card flex flex-col p-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-2xl">{s.icon}</span>
                  <span className={`rounded-lg ${m.soft} px-2 py-1 text-xs font-bold ${m.text}`}>{count} items</span>
                </div>
                <h3 className="mb-1 font-bold text-[#16331f]">{s.key}</h3>
                <p className="mb-4 flex-1 text-xs leading-relaxed text-[#5c7863]">{s.note}</p>
                {needsMajor ? (
                  <p className="text-xs font-semibold text-[#b45309]">👆 Pick your majorship first</p>
                ) : count === 0 ? (
                  <p className="text-xs font-semibold text-[#94a896]">Coming soon — items being uploaded</p>
                ) : !subscribed ? (
                  <Link
                    href={user ? "/dashboard" : "/login?next=/dashboard"}
                    className="rounded-xl border border-[#d9e6d3] px-4 py-2 text-center text-xs font-bold text-[#3d5c44]"
                  >
                    🔒 Subscribe to drill this
                  </Link>
                ) : (
                  <div className="flex gap-2">
                    <Link href={drillHref} className="btn-primary flex-1 px-3 py-2 text-center text-xs">
                      🎯 Drill
                    </Link>
                    <Link
                      href={study("flashcards", { subjects: s.key })}
                      className="flex-1 rounded-xl border border-[#d9e6d3] px-3 py-2 text-center text-xs font-bold text-[#3d5c44] hover:border-[#d4af37]"
                    >
                      🃏 Cards
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Mock exams */}
        <div id="mocks" className="scroll-mt-24">
          <h2 className="mb-1 text-2xl font-black text-[#16331f]">⏱️ Full Mock Exams</h2>
          <p className="mb-5 text-sm text-[#5c7863]">
            Real item counts and real time limits. Questions are shuffled every attempt, so you can retake it without
            memorising the order.
          </p>

          {mocks.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {mocks.map((e) => (
                <MockCard key={e.id} exam={e} subscribed={subscribed} user={!!user} m={m} count={countAvailable(stats, e.level, e.subjects ?? undefined)} />
              ))}
            </div>
          ) : (
            <div className="card p-6 text-sm text-[#5c7863]">
              No mock exam for this level yet.
            </div>
          )}

          {/* Specialization mock (LET Secondary) — built from the student's major */}
          {wantsMajor && (
            <div className="card mt-4 flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
              <div>
                <div className="font-bold text-[#16331f]">
                  {!subscribed && "🔒 "}
                  LET Secondary — Specialization Mock
                </div>
                <div className="mt-1 text-xs text-[#5c7863]">
                  150 items · 3 hrs 30 min · {major ? `majorship: ${major}` : "choose your majorship above"}
                </div>
              </div>
              {!major ? (
                <span className="rounded-xl bg-[#fef9c3] px-4 py-2 text-sm font-bold text-[#b45309]">Pick majorship 👆</span>
              ) : (
                <Link
                  href={
                    subscribed
                      ? study("drill", { subjects: "Specialization", count: "150", timed: "1", tlabel: `LET Secondary Specialization — ${major}` })
                      : user
                        ? "/dashboard"
                        : "/login?next=/dashboard"
                  }
                  className="rounded-xl bg-[#ca8a04] px-5 py-2.5 text-sm font-bold text-white"
                >
                  Start →
                </Link>
              )}
            </div>
          )}

          {samplers.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#5c7863]">Free samplers (no subscription needed)</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {samplers.map((e) => (
                  <Link key={e.id} href={`/exam/${e.id}`} className="card card-hover flex items-center justify-between gap-4 p-5">
                    <div>
                      <div className="font-bold text-[#16331f]">🎁 {e.title}</div>
                      <div className="mt-1 text-xs text-[#5c7863]">{e.question_count} items · instant explanations</div>
                    </div>
                    <span className={`rounded-xl ${m.soft} px-4 py-2 text-sm font-bold ${m.text}`}>Start →</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Lessons */}
        <div className="mt-12">
          <h2 className="mb-2 text-2xl font-black text-[#16331f]">📚 Lessons & Notes</h2>
          <p className="mb-6 text-sm text-[#5c7863]">
            Read the lessons before taking the mock exams.
            {!subscribed && " Items with 🔒 are for subscribers only."}
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(topics as Topic[])?.map((t) => (
              <Link key={t.id} href={`/review/${track}/topic/${t.id}`} className="card card-hover p-6">
                <div className={`mb-3 inline-flex rounded-xl ${m.soft} px-3 py-1 text-xs font-bold ${m.text}`}>Topic</div>
                <h3 className="mb-2 font-bold text-[#16331f]">{t.title}</h3>
                <p className="mb-4 text-sm leading-relaxed text-[#5c7863]">{t.description}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#5c7863]">
                    📖 {lessonCounts[t.id]?.total ?? 0} lessons
                    {(lessonCounts[t.id]?.free ?? 0) > 0 && !subscribed && (
                      <span className="ml-2 font-semibold text-[#16a34a]">· {lessonCounts[t.id].free} free</span>
                    )}
                  </span>
                  <span className={`font-bold ${m.text}`}>Open →</span>
                </div>
              </Link>
            ))}
          </div>
          {(topics ?? []).length === 0 && (
            <div className="card p-8 text-center text-sm text-[#5c7863]">
              Coming soon! Teacher Ceppee is still adding lessons here.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MockCard({
  exam,
  subscribed,
  user,
  m,
  count,
}: {
  exam: Exam;
  subscribed: boolean;
  user: boolean;
  m: (typeof meta)["CSE"];
  count: number;
}) {
  const locked = !subscribed && !exam.is_free_preview;
  const ready = count > 0;
  const href = locked ? (user ? "/dashboard" : "/login?next=/dashboard") : `/exam/${exam.id}`;

  return (
    <Link href={href} className={`card card-hover flex items-center justify-between gap-4 p-5 ${locked ? "opacity-75" : ""}`}>
      <div>
        <div className="font-bold text-[#16331f]">
          {locked && "🔒 "}
          {exam.title}
        </div>
        <div className="mt-1 text-xs text-[#5c7863]">
          {exam.question_count} items · {exam.duration_minutes} min · {exam.passing_pct}% to pass
        </div>
        {exam.subjects && exam.subjects.length > 0 && (
          <div className="mt-1 text-xs text-[#94a896]">{exam.subjects.join(" · ")}</div>
        )}
        {!ready && <div className="mt-2 text-xs font-semibold text-[#b45309]">⏳ items being uploaded</div>}
      </div>
      <span className={`shrink-0 rounded-xl ${m.soft} px-4 py-2 text-sm font-bold ${m.text}`}>
        {locked ? "Locked" : ready ? "Start →" : "Soon"}
      </span>
    </Link>
  );
}
