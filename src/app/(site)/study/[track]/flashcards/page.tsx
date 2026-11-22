import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasActiveSub, getBankStats } from "@/lib/queries";
import { canAccess } from "@/lib/access";
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

  const p = parseStudyParams(trackKey, sp, 30);
  const backHref = `/review/${track}?level=${p.level}${p.major ? `&major=${encodeURIComponent(p.major)}` : ""}`;

  // Identity and bank stats in one wave instead of two serial round-trips.
  const [userCtx, stats] = await Promise.all([getUserContext(), getBankStats(trackKey)]);
  const { user, subs, isAdmin } = userCtx;

  if (!user) redirect(`/login?next=${encodeURIComponent(backHref)}`);

  const subscribed = isAdmin || hasActiveSub(subs, trackKey);
  // Only the papers this student actually owns (a ₱299 pass is one subject).
  const allowedSubjects = p.subjects.filter(
    (k) => isAdmin || canAccess(subs, { track: trackKey, level: p.level, subject: k })
  );
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
          msg={`A pass starts at ₱149 a month, or ₱299 for one subject until exam day.`}
          backHref={backHref}
          backLabel="Back to reviewer"
          loginHref={`/pricing?track=${trackKey}&level=${p.level}`}
        />
      </RunnerShell>
    );
  }

  if (allowedSubjects.length === 0) {
    return (
      <RunnerShell>
        <LockedCard
          title="That paper is not in your pass 🔒"
          msg={`Your pass does not cover ${p.subjects.join(", ")}. Unlock a single subject for ₱299 until exam day, or take the complete package.`}
          backHref={backHref}
          backLabel="Back to reviewer"
          loginHref={`/pricing?track=${trackKey}&level=${p.level}`}
        />
      </RunnerShell>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("draw_flashcards", {
    p_track: trackKey,
    p_level: p.level,
    p_subjects: allowedSubjects,
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
