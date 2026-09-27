import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasActiveSub, getBankStats } from "@/lib/queries";
import { levelLabel, subjectsFor, passingPctFor } from "@/lib/exam";
import { parseStudyParams } from "@/lib/study";
import StudyRunner from "@/components/study/StudyRunner";
import DrillSetup from "@/components/study/DrillSetup";
import { LockedCard, EmptyBank, RunnerShell } from "@/components/study/States";
import type { PracticeQuestion, Track } from "@/lib/types";

export const dynamic = "force-dynamic";

const TRACKS: Record<string, Track> = { cse: "CSE", let: "LET" };

export async function generateMetadata({ params }: { params: Promise<{ track: string }> }): Promise<Metadata> {
  const { track } = await params;
  return { title: TRACKS[track] ? `${TRACKS[track]} Flashcards` : "Flashcards" };
}

export default async function FlashcardsPage({
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
  const p = parseStudyParams(trackKey, sp, 30);

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

  if (p.subjects.length === 0) {
    return (
      <RunnerShell>
        <DrillSetup
          mode="flashcards"
          track={trackKey}
          level={p.level}
          major={p.major}
          subjects={subjectsMeta}
          basePath={`/study/${track}/flashcards`}
        />
      </RunnerShell>
    );
  }

  if (!subscribed) {
    return (
      <RunnerShell>
        <LockedCard
          title="Flashcards are for subscribers 🔒"
          msg={`Subscribe for ₱500 to unlock flashcards, subject drills and the full mock exams for ${trackKey}.`}
          backHref={backHref}
          backLabel="Back to reviewer"
          loginHref="/dashboard"
        />
      </RunnerShell>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("draw_flashcards", {
    p_track: trackKey,
    p_level: p.level,
    p_subjects: p.subjects,
    p_specialization: p.major,
    p_limit: p.count,
    p_mode: "all",
  });
  if (error) console.error("draw_flashcards", error.message);
  const cards = (data as PracticeQuestion[]) ?? [];

  if (cards.length === 0) {
    return (
      <RunnerShell>
        <EmptyBank what="flashcards for this selection" backHref={backHref} backLabel="Back to reviewer" />
      </RunnerShell>
    );
  }

  return (
    <RunnerShell>
      <StudyRunner
        kind="flashcards"
        track={trackKey}
        level={p.level}
        title={`🃏 ${p.subjects.join(" + ")} Flashcards`}
        subtitle={levelLabel(trackKey, p.level)}
        description={`${cards.length} cards. Items you mark “hindi ko” come back at the end until you nail them.`}
        backHref={backHref}
        backLabel="Back to reviewer"
        label={`Flashcards — ${p.subjects.join(", ")}`}
        passingPct={passingPctFor(trackKey)}
        questions={cards}
      />
    </RunnerShell>
  );
}
