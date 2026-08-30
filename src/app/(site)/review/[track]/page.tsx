import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getUserContext, hasActiveSub } from "@/lib/queries";
import { peso } from "@/lib/format";
import type { Track, Topic, Exam, ExamWithCount } from "@/lib/types";

export const dynamic = "force-dynamic";

const TRACKS: Record<string, Track> = { cse: "CSE", let: "LET" };

const meta: Record<Track, { label: string; emoji: string; text: string; soft: string; btn: string; grad: string }> = {
  CSE: {
    label: "Civil Service Exam",
    emoji: "🏛️",
    text: "text-[#0284c7]",
    soft: "bg-[#e0f2fe]",
    btn: "btn-primary",
    grad: "from-[#0ea5e9] to-[#38bdf8]",
  },
  LET: {
    label: "Licensure Exam for Teachers",
    emoji: "🍎",
    text: "text-[#7c3aed]",
    soft: "bg-[#f5f0ff]",
    btn: "btn-violet",
    grad: "from-[#8b5cf6] to-[#d946ef]",
  },
};

export async function generateMetadata({ params }: { params: Promise<{ track: string }> }): Promise<Metadata> {
  const { track } = await params;
  const t = TRACKS[track];
  return { title: t ? `${t} Review` : "Review" };
}

export default async function TrackPage({ params }: { params: Promise<{ track: string }> }) {
  const { track } = await params;
  const trackKey = TRACKS[track];
  if (!trackKey) notFound();

  const m = meta[trackKey];
  const { user, subs } = await getUserContext();
  const subscribed = hasActiveSub(subs, trackKey);

  const supabase = await createClient();
  const admin = getAdminClient();

  // Topics are public (published) — safe via server client
  const { data: topics } = await supabase
    .from("topics")
    .select("*")
    .eq("track", trackKey)
    .eq("is_published", true)
    .order("order_index");

  // Lesson counts per topic (counts only, no content leak)
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

  // Exam catalog is public; questions are gated separately
  const { data: exams } = await supabase
    .from("exams")
    .select("*")
    .eq("track", trackKey)
    .eq("is_active", true)
    .order("mode")
    .order("title");
  const examList = (exams as ExamWithCount[]) ?? [];
  const mockExams = examList.filter((e) => e.mode === "mock");
  const practiceExams = examList.filter((e) => e.mode === "practice");

  return (
    <div>
      {/* Track header */}
      <section className={`relative overflow-hidden bg-gradient-to-br ${m.grad} py-14`}>
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
                  ? "✅ Active subscription — make the most of your review!"
                  : user
                    ? `🔒 The lessons are locked. Subscribe for ${peso(500)} to unlock everything.`
                    : `🔓 You have a free preview! Subscribe for ${peso(500)} to unlock everything.`}
              </p>
            </div>
            {!subscribed && (
              <Link
                href={user ? "/dashboard" : "/login?next=/dashboard"}
                className="rounded-xl bg-white px-7 py-3.5 font-bold text-[#142a56] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                Subscribe — {peso(500)}
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Lessons by topic */}
      <section className="w-full py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-2 text-2xl font-black text-[#142a56]">📚 Lessons & Notes</h2>
          <p className="mb-8 text-sm text-[#5a6d91]">
            Read the lessons before taking the mock exams.
            {!subscribed && " Items with 🔒 are for subscribers only."}
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 justify-center">
            {(topics as Topic[])?.map((t) => (
              <Link key={t.id} href={`/review/${track}/topic/${t.id}`} className="card card-hover p-6">
                <div className={`mb-3 inline-flex rounded-xl ${m.soft} px-3 py-1 text-xs font-bold ${m.text}`}>
                  Topic
                </div>
                <h3 className="mb-2 font-bold text-[#142a56]">{t.title}</h3>
                <p className="mb-4 text-sm leading-relaxed text-[#5a6d91]">{t.description}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#5a6d91]">
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
            <div className="card p-8 text-center text-sm text-[#5a6d91]">
              Coming soon! Teacher Ceppee is still adding lessons here.
            </div>
          )}
        </div>
      </section>

      {/* Exams */}
      <section className="w-full pb-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-2 text-2xl font-black text-[#142a56]">⏱️ Mock Exams & Practice</h2>
          <p className="mb-8 text-sm text-[#5a6d91]">
            Mock = timed, just like the real thing. Practice = instant explanation after each answer.
          </p>

          <ExamGrid exams={mockExams} subscribed={subscribed} m={m} label="Mock Exams (timed)" />
          <div className="h-6" />
          <ExamGrid exams={practiceExams} subscribed={subscribed} m={m} label="Practice Drills" />
        </div>
      </section>
    </div>
  );
}

function ExamGrid({
  exams,
  subscribed,
  m,
  label,
}: {
  exams: ExamWithCount[];
  subscribed: boolean;
  m: (typeof meta)["CSE"];
  label: string;
}) {
  if (exams.length === 0) return null;
  return (
    <div>
      <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#5a6d91]">{label}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 justify-center">
        {exams.map((e) => {
          const locked = !subscribed && !e.is_free_preview;
          return (
            <Link key={e.id} href={`/exam/${e.id}`} className="card card-hover flex items-center justify-between gap-4 p-5">
              <div>
                <div className="font-bold text-[#142a56]">
                  {locked && "🔒 "}
                  {e.title}
                </div>
                <div className="mt-1 text-xs text-[#5a6d91]">
                  {e.duration_minutes} min
                  {e.topic ? ` · ${e.topic}` : ""}
                  {e.is_free_preview ? " · 🎁 FREE preview" : ""}
                </div>
              </div>
              <span className={`rounded-xl ${m.soft} px-4 py-2 text-sm font-bold ${m.text}`}>
                {locked ? "Locked" : "Start →"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
