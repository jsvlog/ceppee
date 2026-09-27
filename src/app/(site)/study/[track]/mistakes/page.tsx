import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasActiveSub } from "@/lib/queries";
import { levelLabel, passingPctFor } from "@/lib/exam";
import { parseStudyParams } from "@/lib/study";
import StudyRunner from "@/components/study/StudyRunner";
import { LockedCard, RunnerShell } from "@/components/study/States";
import type { PracticeQuestion, Track } from "@/lib/types";

export const dynamic = "force-dynamic";

const TRACKS: Record<string, Track> = { cse: "CSE", let: "LET" };

export async function generateMetadata({ params }: { params: Promise<{ track: string }> }): Promise<Metadata> {
  const { track } = await params;
  return { title: TRACKS[track] ? `${TRACKS[track]} — Retry My Mistakes` : "Retry My Mistakes" };
}

export default async function MistakesPage({
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
  const p = parseStudyParams(trackKey, sp, 20);

  if (!user) redirect(`/login?next=${encodeURIComponent(backHref)}`);

  const subscribed = isAdmin || hasActiveSub(subs, trackKey);
  if (!subscribed) {
    return (
      <RunnerShell>
        <LockedCard
          title="Retry My Mistakes is for subscribers 🔒"
          msg={`Subscribe for ₱500 to unlock the mistake tracker together with all mocks, drills and flashcards for ${trackKey}.`}
          backHref={backHref}
          backLabel="Back to reviewer"
          loginHref="/dashboard"
        />
      </RunnerShell>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("draw_mistakes", {
    p_track: trackKey,
    p_level: p.level,
    p_limit: p.count,
  });
  if (error) console.error("draw_mistakes", error.message);
  const rows = (data as (PracticeQuestion & { times_wrong: number })[]) ?? [];

  if (rows.length === 0) {
    return (
      <RunnerShell>
        <div className="card relative overflow-hidden p-8 text-center sm:p-10">
          <div className="mb-4 text-5xl">🎉</div>
          <h1 className="mb-2 text-2xl font-black text-[#16331f]">Walang mistakes to retry</h1>
          <p className="mx-auto mb-6 max-w-md text-sm text-[#5c7863]">
            Either you have not taken a drill yet, or you have already fixed every item you missed for{" "}
            {levelLabel(trackKey, p.level)}. Take a mock or a subject drill and anything you get wrong lands here
            automatically.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href={`/study/${track}/drill?level=${p.level}`} className="btn-primary px-6 py-3 text-sm">
              🎯 Take a drill
            </Link>
            <Link
              href={backHref}
              className="rounded-xl border border-[#d9e6d3] bg-white px-6 py-3 text-sm font-semibold text-[#3d5c44]"
            >
              ← Back to reviewer
            </Link>
          </div>
        </div>
      </RunnerShell>
    );
  }

  return (
    <RunnerShell>
      <StudyRunner
        kind="drill"
        track={trackKey}
        level={p.level}
        title="🔁 Retry My Mistakes"
        subtitle={levelLabel(trackKey, p.level)}
        description={`${rows.length} items you previously got wrong, worst offenders first. Get one right and it leaves this list.`}
        backHref={backHref}
        backLabel="Back to reviewer"
        label={`Retry mistakes — ${levelLabel(trackKey, p.level)}`}
        passingPct={passingPctFor(trackKey)}
        questions={rows}
      />
    </RunnerShell>
  );
}
