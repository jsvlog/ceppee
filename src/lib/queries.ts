import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import type { BankStat, Coach, Level, SubjectProgress, Subscription, Testimonial, Track } from "@/lib/types";

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

/**
 * Published testimonials for the landing page, newest/most important first.
 * Anonymous visitors can read these (RLS: is_published = true), so the anon
 * client is enough. Returns [] if the table does not exist yet, which makes the
 * landing page fall back to its built-in placeholder quotes.
 */
export async function getPublicTestimonials(): Promise<Testimonial[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("testimonials")
      .select("*")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) return [];
    return (data as Testimonial[]) ?? [];
  } catch {
    return [];
  }
}

/**
 * Active coaches for the "Meet the coaches" section and the /coaches page.
 * Anonymous visitors can read these (RLS: is_active = true), so the anon
 * client is enough. Returns [] if the table is missing, which hides the
 * homepage section instead of breaking the page.
 */
export async function getPublicCoaches(): Promise<Coach[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("coaches")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(60);
    if (error) return [];
    return (data as Coach[]) ?? [];
  } catch {
    return [];
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

/**
 * How many questions the bank holds for a track, per subject and level.
 * Called with the USER's session so the RPC can decide what they may see:
 * non-subscribers only get the free-preview counts.
 */
export async function getBankStats(track: Track): Promise<BankStat[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("bank_stats", { p_track: track });
    if (error) return [];
    return (data as BankStat[]) ?? [];
  } catch {
    return [];
  }
}

/** Questions available to THIS user for a track+level (0 while the bank is empty). */
export function countAvailable(stats: BankStat[], level: Level, subjects?: string[]): number {
  return stats
    .filter((s) => (level === "both" || s.level === "both" || s.level === level))
    .filter((s) => !subjects || subjects.length === 0 || (s.subject && subjects.includes(s.subject)))
    .reduce((sum, s) => sum + Number(s.accessible ?? 0), 0);
}

/** Per-subject mastery for the dashboard bars. */
export async function getSubjectProgress(track: Track): Promise<SubjectProgress[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("subject_progress", { p_track: track });
    if (error) return [];
    return (data as SubjectProgress[]) ?? [];
  } catch {
    return [];
  }
}
