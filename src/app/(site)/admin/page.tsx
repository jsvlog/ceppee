import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminClient } from "@/lib/supabase/admin";
import { getUserContext } from "@/lib/queries";
import AdminClient from "./AdminClient";
import type {
  PaymentRequest,
  Subscription,
  Topic,
  Exam,
  ExamWithCount,
  Question,
  SiteSettings,
} from "@/lib/types";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export interface AdminProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  is_admin: boolean;
  created_at: string;
}

export interface LessonMeta {
  id: string;
  topic_id: string;
  title: string;
  order_index: number;
  is_published: boolean;
  is_free: boolean;
}

export default async function AdminPage() {
  const { user, isAdmin } = await getUserContext();
  if (!user) redirect("/login?next=/admin");
  if (!isAdmin) redirect("/dashboard");

  const admin = getAdminClient();

  const [
    { data: stats },
    { data: payments },
    { data: subs },
    { data: profiles },
    { data: topics },
    { data: lessons },
    { data: exams },
    { data: settings },
  ] = await Promise.all([
    admin.rpc("admin_stats"),
    admin
      .from("payment_requests")
      .select("*, profile:profiles(email, full_name)")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("subscriptions")
      .select("*, profile:profiles(email, full_name)")
      .order("created_at", { ascending: false })
      .limit(500),
    admin.from("profiles").select("*").order("created_at", { ascending: false }).limit(500),
    admin.from("topics").select("*").order("track").order("order_index"),
    admin
      .from("lessons")
      .select("id, topic_id, title, order_index, is_published, is_free")
      .order("topic_id")
      .order("order_index"),
    admin
      .from("exams")
      .select("*, exam_questions(count)")
      .order("track")
      .order("title"),
    admin.from("site_settings").select("*"),
  ]);

  return (
    <AdminClient
      stats={(stats as unknown as Record<string, number>) || {}}
      payments={(payments as unknown as (PaymentRequest & { profile?: { email: string; full_name: string } })[]) || []}
      subs={(subs as unknown as (Subscription & { profile?: { email: string; full_name: string } })[]) || []}
      profiles={(profiles as AdminProfile[]) || []}
      topics={(topics as Topic[]) || []}
      lessons={(lessons as LessonMeta[]) || []}
      exams={(exams as unknown as (ExamWithCount & { exam_questions?: { count: number }[] })[]) || []}
      settings={(settings as SiteSettings[]) || []}
    />
  );
}
