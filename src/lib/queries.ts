import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Subscription, Track } from "@/lib/types";

export interface SiteStats {
  lessons: number;
  questions: number;
  exams: number;
}

// Public marketing stats. Uses the service-role client so the counts reflect the
// FULL catalog — RLS would otherwise hide paid lessons/questions from anonymous
// visitors and undercount these numbers on the homepage.
export async function getSiteStats(): Promise<SiteStats> {
  const admin = getAdminClient();
  try {
    const [lessons, questions, exams] = await Promise.all([
      admin.from("lessons").select("id", { count: "exact", head: true }).eq("is_published", true),
      admin.from("exam_questions").select("id", { count: "exact", head: true }),
      admin.from("exams").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);
    return {
      lessons: lessons.count ?? 0,
      questions: questions.count ?? 0,
      exams: exams.count ?? 0,
    };
  } catch {
    return { lessons: 0, questions: 0, exams: 0 };
  }
}

export interface UserContext {
  user: { id: string; email?: string } | null;
  profile: { id: string; full_name: string | null; is_admin: boolean } | null;
  isAdmin: boolean;
  subs: Subscription[];
}

export async function getUserContext(): Promise<UserContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null, isAdmin: false, subs: [] };

  try {
    const [{ data: profile }, { data: subs }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, is_admin").eq("id", user.id).maybeSingle(),
      supabase.from("subscriptions").select("*").eq("user_id", user.id),
    ]);
    return {
      user: { id: user.id, email: user.email },
      profile: (profile as UserContext["profile"]) ?? null,
      isAdmin: !!(profile as { is_admin?: boolean } | null)?.is_admin,
      subs: (subs as Subscription[]) ?? [],
    };
  } catch {
    return { user: { id: user.id, email: user.email }, profile: null, isAdmin: false, subs: [] };
  }
}

export function hasActiveSub(subs: Subscription[], track: Track): boolean {
  return subs.some((s) => s.track === track && s.status === "active" && new Date(s.expires_at) > new Date());
}

export function getActiveSub(subs: Subscription[], track: Track): Subscription | undefined {
  return subs.find((s) => s.track === track && s.status === "active" && new Date(s.expires_at) > new Date());
}
