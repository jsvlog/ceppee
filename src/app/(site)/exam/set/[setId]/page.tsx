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

/**
 * A whole paper served from one set (supabase/set-mocks.sql).
 *
 * `?mode=practice` sits the SAME paper untimed with the answer and explanation
 * after every item — `start_set_mock` already takes `p_practice` and returns the
 * key for exactly that, so practice mode needed no new SQL.
 *
 * The set may hold fewer than 150 live items; start_set_mock tops the paper up
 * from other sets of the same subject AND the same difficulty bucket.
 */
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
  const [userCtx, setRes] = await Promise.all([
    getUserContext(),
    supabase
      .from("question_sets")
      .select(
        "id, track, subject, specialization, level, set_no, title, item_count, shape_easy, shape_medium_hard, shape_extremely_hard, shape_pedagogical"
      )
      .eq("id", setId)
      .maybeSingle(),
  ]);

  const { user, subs, isAdmin } = userCtx;
  if (!user) redirect(`/login?next=/exam/set/${setId}`);

  if (!setRes.data) {
    return (
      <RunnerShell>
        <LockedCard
          title="Set not found"
          msg="This set may have been removed, or it isn't available yet."
          backHref="/review/let"
          backLabel="All sets"
          loginHref="/"
        />
      </RunnerShell>
    );
  }

  const s = setRes.data as SetRow;
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
          backLabel="Back to the campaign"
          loginHref="/dashboard"
        />
      </RunnerShell>
    );
  }

  const { data, error } = await supabase.rpc("start_set_mock", { p_set_id: s.id, p_practice: isPractice });
  if (error) console.error("start_set_mock", error.message);
  const questions = (data as (BankQuestion | PracticeQuestion)[]) ?? [];

  if (questions.length === 0) {
    return (
      <RunnerShell>
        <EmptyBank what={`questions for "${s.title}"`} backHref={backHref} backLabel="Back to the campaign" />
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
        title={`${isPractice ? "💡" : "⏱️"} ${s.title}`}
        subtitle={parts.join(" · ")}
        description={
          isPractice
            ? `Set ${s.set_no} in practice mode — untimed, with the correct answer and explanation right after every item.`
            : `Set ${s.set_no} as a full 150-item paper — timed, shuffled, and reviewed item by item when you submit.`
        }
        backHref={backHref}
        backLabel="Back to the campaign"
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
          ← Back to the {track} campaign
        </Link>
      </div>
    </RunnerShell>
  );
}
