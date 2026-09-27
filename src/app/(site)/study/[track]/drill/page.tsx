import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasActiveSub, getBankStats } from "@/lib/queries";
import { levelLabel, subjectsFor, passingPctFor, timedMinutes } from "@/lib/exam";
import { parseStudyParams } from "@/lib/study";
import StudyRunner from "@/components/study/StudyRunner";
import DrillSetup from "@/components/study/DrillSetup";
import { LockedCard, EmptyBank, RunnerShell } from "@/components/study/States";
import type { BankQuestion, PracticeQuestion, Track } from "@/lib/types";

export const dynamic = "force-dynamic";

const TRACKS: Record<string, Track> = { cse: "CSE", let: "LET" };

export async function generateMetadata({ params }: { params: Promise<{ track: string }> }): Promise<Metadata> {
  const { track } = await params;
  return { title: TRACKS[track] ? `${TRACKS[track]} Drill` : "Drill" };
}

export default async function DrillPage({
  params,
  searchParams,
}: {
  params: Promise<{ track: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { track } = await params;
  const sp = await searchParams;
  const trackKey = TRACKS[track];
  if (!trackKey) notFound();

  const { user, subs, isAdmin } = await getUserContext();
  const backHref = `/review/${track}`;
  const p = parseStudyParams(trackKey, sp);

  if (!user) redirect(`/login?next=${encodeURIComponent(backHref)}`);

  const subscribed = isAdmin || hasActiveSub(subs, trackKey);
  const stats = await getBankStats(trackKey);
  const subjectsMeta = subjectsFor(trackKey, p.level).map((s) => ({
    key: s.key,
    icon: s.icon,
    note: s.note,
    count: stats
      .filter((b) => (p.level === "both" || b.level === "both" || b.level === p.level) && b.subject === s.key)
      .reduce((sum, b) => sum + Number(b.accessible ?? 0), 0),
  }));

  // No sections chosen yet -> build your drill
  if (p.subjects.length === 0) {
    return (
      <RunnerShell>
        <DrillSetup
          mode="drill"
          track={trackKey}
          level={p.level}
          major={p.major}
          subjects={subjectsMeta}
          basePath={`/study/${track}/drill`}
        />
      </RunnerShell>
    );
  }

  if (!subscribed) {
    return (
      <RunnerShell>
        <LockedCard
          title="Drills are for subscribers 🔒"
          msg={`Subscribe for ₱500 to unlock subject drills, flashcards and the full mock exams for ${trackKey}.`}
          backHref={backHref}
          backLabel="Back to reviewer"
          loginHref="/dashboard"
        />
      </RunnerShell>
    );
  }

  const supabase = await createClient();
  const rpcArgs = {
    p_track: trackKey,
    p_level: p.level,
    p_subjects: p.subjects,
    p_specialization: p.major,
    p_limit: p.count,
    p_difficulty: p.difficulty,
  };

  let questions: (BankQuestion | PracticeQuestion)[] = [];
  if (p.timed) {
    const { data, error } = await supabase.rpc("start_timed_drill", rpcArgs);
    if (error) console.error("start_timed_drill", error.message);
    questions = (data as BankQuestion[]) ?? [];
  } else {
    const { data, error } = await supabase.rpc("draw_drill", rpcArgs);
    if (error) console.error("draw_drill", error.message);
    questions = (data as PracticeQuestion[]) ?? [];
  }

  if (questions.length === 0) {
    return (
      <RunnerShell>
        <EmptyBank what="questions for this selection" backHref={backHref} backLabel="Back to reviewer" />
      </RunnerShell>
    );
  }

  const minutes = p.timed ? timedMinutes(questions.length, trackKey) : 0;

  return (
    <RunnerShell>
      <StudyRunner
        kind={p.timed ? "mock" : "drill"}
        attemptKind="drill"
        track={trackKey}
        level={p.level}
        title={p.timed ? `⏱️ ${p.label}` : `🎯 ${p.subjects.join(" + ")} Drill`}
        subtitle={levelLabel(trackKey, p.level)}
        description={
          p.timed
            ? `${questions.length} items · ${minutes} minutes — no answers until you submit.`
            : `Instant explanations after every item, plus a section-by-section breakdown at the end.`
        }
        backHref={backHref}
        backLabel="Back to reviewer"
        label={p.label}
        passingPct={passingPctFor(trackKey)}
        questions={questions}
        durationMinutes={p.timed ? minutes : undefined}
      />
    </RunnerShell>
  );
}
