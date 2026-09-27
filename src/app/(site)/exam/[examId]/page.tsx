import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasActiveSub } from "@/lib/queries";
import { levelLabel, passingPctFor } from "@/lib/exam";
import StudyRunner from "@/components/study/StudyRunner";
import { LockedCard, EmptyBank, RunnerShell } from "@/components/study/States";
import type { BankQuestion, Exam, PracticeQuestion, Track } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mock Exam" };

export default async function ExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const { user, subs, isAdmin } = await getUserContext();
  if (!user) redirect(`/login?next=/exam/${examId}`);

  const supabase = await createClient();
  const { data: exam } = await supabase.from("exams").select("*").eq("id", examId).maybeSingle();

  if (!exam) {
    return (
      <RunnerShell>
        <LockedCard
          title="Exam not found"
          msg="It may have been removed or isn't available to you yet."
          backHref="/"
          backLabel="Home"
          loginHref="/"
        />
      </RunnerShell>
    );
  }

  const e = exam as Exam;
  const track = e.track as Track;
  const backHref = `/review/${track.toLowerCase()}`;
  const subscribed = isAdmin || hasActiveSub(subs, track);

  if (!e.is_free_preview && !subscribed) {
    return (
      <RunnerShell>
        <LockedCard
          title="This exam is locked 🔒"
          msg={`"${e.title}" is for ${track} subscribers. Subscribe for ₱500 to unlock all mock exams, drills and flashcards.`}
          backHref={backHref}
          backLabel="Back to reviewer"
          loginHref="/dashboard"
        />
      </RunnerShell>
    );
  }

  const isPractice = e.mode === "practice";
  const rpc = isPractice ? "start_practice_exam" : "start_mock";
  const { data, error } = await supabase.rpc(rpc, { p_exam_id: e.id });
  if (error) console.error(`exam ${rpc}`, error.message);
  const questions = (data as (BankQuestion | PracticeQuestion)[]) ?? [];

  if (questions.length === 0) {
    return (
      <RunnerShell>
        <EmptyBank what={`questions for "${e.title}"`} backHref={backHref} backLabel="Back to reviewer" />
      </RunnerShell>
    );
  }

  return (
    <RunnerShell>
      <StudyRunner
        kind={isPractice ? "drill" : "mock"}
        attemptKind={isPractice ? "drill" : "exam"}
        track={track}
        level={e.level}
        title={(isPractice ? "🎁 " : "⏱️ ") + e.title}
        subtitle={levelLabel(track, e.level) + (e.is_free_preview ? " · free preview" : "")}
        description={e.description}
        backHref={backHref}
        backLabel="Back to reviewer"
        label={e.title}
        passingPct={e.passing_pct || passingPctFor(track)}
        examId={e.id}
        questions={questions}
        durationMinutes={isPractice ? undefined : e.duration_minutes}
      />

      {e.subjects && e.subjects.length > 0 && (
        <p className="mt-6 text-center text-xs text-[#94a896]">
          Sections drawn for this paper: {e.subjects.join(" · ")} · questions are shuffled every attempt
        </p>
      )}

      <div className="mt-6 text-center">
        <Link href={backHref} className="text-sm text-[#5c7863] hover:text-[#16331f]">
          ← Back to the {track} reviewer
        </Link>
      </div>
    </RunnerShell>
  );
}
