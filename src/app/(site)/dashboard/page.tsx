import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getUserContext, hasActiveSub, getSubjectProgress } from "@/lib/queries";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";
import type { PaymentRequest, Subscription, ExamAttempt, Exam, ExamWithCount, SubjectProgress, Track } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { user, profile, isAdmin, subs } = await getUserContext();
  if (!user) redirect("/login?next=/dashboard");
  if (isAdmin) redirect("/admin");

  let requests: PaymentRequest[] = [];
  let attempts: (ExamAttempt & { exam?: Exam })[] = [];
  let freeExams: ExamWithCount[] = [];
  let mastery: { track: Track; rows: SubjectProgress[] }[] = [];

  try {
    const admin = getAdminClient();

    const [{ data: payReqs }, { data: myAttempts }, { data: previews }] = await Promise.all([
      admin.from("payment_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      admin
        .from("exam_attempts")
        .select("*, exam:exams(title)")
        .eq("user_id", user.id)
        .order("completed_at", { ascending: false })
        .limit(10),
      admin.from("exams").select("*, exam_questions(count)").eq("is_free_preview", true).eq("is_active", true),
    ]);

    requests = (payReqs as PaymentRequest[]) ?? [];
    attempts = (myAttempts as (ExamAttempt & { exam?: Exam })[]) ?? [];
    freeExams = ((previews as unknown as (ExamWithCount & { exam_questions?: { count: number }[] })[]) ?? []).map(
      (e) => ({ ...e, pinned_count: e.exam_questions?.[0]?.count ?? 0 })
    );

    // Per-subject mastery, only for the tracks this user can actually study.
    const activeTracks = (["CSE", "LET"] as Track[]).filter((t) => hasActiveSub(subs, t));
    const loaded = await Promise.all(activeTracks.map(async (t) => ({ track: t, rows: await getSubjectProgress(t) })));
    mastery = loaded.filter((m) => m.rows.length > 0);
  } catch (e) {
    console.error("dashboard data error", e);
  }

  return (
    <DashboardClient
      userName={profile?.full_name?.split(" ")[0] || "Ka-Ceppee"}
      subs={subs}
      requests={requests}
      attempts={attempts}
      freeExams={freeExams}
      mastery={mastery}
    />
  );
}
