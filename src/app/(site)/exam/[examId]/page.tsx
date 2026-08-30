import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasActiveSub } from "@/lib/queries";
import ExamClient from "./ExamClient";
import type { Exam, Question } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mock Exam" };

export default async function ExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const { user, subs } = await getUserContext();
  if (!user) redirect(`/login?next=/exam/${examId}`);

  const supabase = await createClient();
  const { data: exam } = await supabase.from("exams").select("*").eq("id", examId).maybeSingle();

  if (!exam) {
    return (
      <Shell>
        <Locked title="Exam not found" msg="It may have been removed or isn’t available to you yet." />
      </Shell>
    );
  }
  const e = exam as Exam;
  const backHref = `/review/${e.track.toLowerCase()}`;

  // Gate: free preview or subscriber only
  if (!e.is_free_preview && !hasActiveSub(subs, e.track)) {
    return (
      <Shell>
        <Locked
          title="This exam is locked 🔒"
          msg={`"${e.title}" is for ${e.track} subscribers. Subscribe from your dashboard to unlock all mock exams and drills.`}
        />
      </Shell>
    );
  }

  // Questions — RLS also blocks these for non-subscribers on paid exams
  const { data: questions } = await supabase
    .from("exam_questions")
    .select("*")
    .eq("exam_id", examId)
    .order("order_index");

  if (!questions || questions.length === 0) {
    return (
      <Shell>
        <Locked
          title="This exam has no questions yet"
          msg="Teacher Ceppee is still adding the questions to this exam. Check back soon!"
        />
      </Shell>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <ExamClient exam={e} questions={questions as Question[]} backHref={backHref} />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md px-4 py-24 text-center">{children}</div>;
}

function Locked({ title, msg }: { title: string; msg: string }) {
  return (
    <>
      <div className="mb-4 text-6xl">🔒</div>
      <h1 className="mb-2 text-2xl font-black text-[#142a56]">{title}</h1>
      <p className="mb-6 text-sm text-[#5a6d91]">{msg}</p>
      <div className="flex justify-center gap-3">
        <Link href="/dashboard" className="btn-primary px-6 py-3 text-sm">
          Go to Dashboard
        </Link>
        <Link href="/" className="rounded-xl border border-[#dbe7f8] bg-white px-6 py-3 text-sm font-semibold text-[#3f4d78]">
          Home
        </Link>
      </div>
    </>
  );
}
