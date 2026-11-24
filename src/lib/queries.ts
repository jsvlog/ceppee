import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { canAccess, accessUntil } from "./access";
import type { BankStat, Coach, ExamAttempt, LeaderboardAround, LeaderboardRow, LeaderboardPeriod, Level, RecentStudyChat, StudyRoom, StudyRoomMessage, SubjectProgress, Subscription, Testimonial, Track } from "@/lib/types";

/** Daily | weekly | all-time — the three leaderboard windows. */
export type { LeaderboardPeriod };

export interface SiteStats {
  /** Reading-library sections — what the hero advertises as "lessons". */
  readingLessons: number;
  questions: number;
  /** Full set papers = the mock exams a student can actually sit. */
  mockPapers: number;
}

// Public marketing stats. Uses the service-role client so the counts reflect the
// FULL catalog — RLS would otherwise hide paid lessons/questions from anonymous
// visitors and undercount these numbers on the homepage.
//
// Every reader below is wrapped in React `cache()`: the site layout AND the page
// both ask for the same data in one render, and without the cache that meant two
// identical `auth.getUser()` + `profiles` + `subscriptions` round-trips per click.
export const getSiteStats = cache(async (): Promise<SiteStats> => {
  const admin = getAdminClient();
  try {
    const [lessons, questions, papers] = await Promise.all([
      admin.from("reading_sections").select("id", { count: "exact", head: true }),
      admin.from("exam_questions").select("id", { count: "exact", head: true }),
      admin.from("question_sets").select("id", { count: "exact", head: true }),
    ]);
    return {
      readingLessons: lessons.count ?? 0,
      questions: questions.count ?? 0,
      mockPapers: papers.count ?? 0,
    };
  } catch {
    return { readingLessons: 0, questions: 0, mockPapers: 0 };
  }
});

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
  profile: { id: string; full_name: string | null; is_admin: boolean; user_label?: string | null; user_badge_color?: string | null } | null;
  isAdmin: boolean;
  subs: Subscription[];
}

export const getUserContext = cache(async (): Promise<UserContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null, isAdmin: false, subs: [] };

  try {
    const [{ data: profile }, { data: subs }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, is_admin, user_label, user_badge_color").eq("id", user.id).maybeSingle(),
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
});

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
export const getBankStats = cache(async (track: Track): Promise<BankStat[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("bank_stats", { p_track: track });
    if (error) return [];
    return (data as BankStat[]) ?? [];
  } catch {
    return [];
  }
});

/** How many items sit in each majorship paper (plans v3: ₱299 buys ONE major). */
export const getBankMajors = cache(
  async (track: Track): Promise<{ level: string; specialization: string; total: number }[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("bank_majors", { p_track: track });
      if (error) return [];
      return (data as { level: string; specialization: string; total: number }[]) ?? [];
    } catch {
      return [];
    }
  }
);

/**
 * Top of the leaderboard for a track + period. XP is computed in SQL from
 * `exam_attempts` (see supabase/leaderboard.sql), never sent by the browser.
 */
export const getLeaderboard = cache(
  async (track: Track, period: LeaderboardPeriod, limit = 20): Promise<LeaderboardRow[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("leaderboard", {
        p_track: track,
        p_period: period,
        p_limit: limit,
      });
      if (error) return [];
      return (data as LeaderboardRow[]) ?? [];
    } catch {
      return [];
    }
  }
);

/**
 * The caller's row plus `span` rows each side, with the board meta (players,
 * resets_at) repeated on every row. Empty when they have no attempts in the period.
 */
export const getLeaderboardAround = cache(
  async (track: Track, period: LeaderboardPeriod, span = 2): Promise<LeaderboardAround[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("leaderboard_me", {
        p_track: track,
        p_period: period,
        p_span: span,
      });
      if (error) return [];
      return (data as LeaderboardAround[]) ?? [];
    } catch {
      return [];
    }
  }
);

/** Questions available to THIS user for a track+level (0 while the bank is empty). */
export function countAvailable(stats: BankStat[], level: Level, subjects?: string[]): number {
  return stats
    .filter((s) => (level === "both" || s.level === "both" || s.level === level))
    .filter((s) => !subjects || subjects.length === 0 || (s.subject && subjects.includes(s.subject)))
    .reduce((sum, s) => sum + Number(s.accessible ?? 0), 0);
}

/** Per-subject mastery for the dashboard bars. */
export const getSubjectProgress = cache(async (track: Track): Promise<SubjectProgress[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("subject_progress", { p_track: track });
    if (error) return [];
    return (data as SubjectProgress[]) ?? [];
  } catch {
    return [];
  }
});

/**
 * Recent finished papers for a user, newest first. Powers the campaign map's
 * `✅ Cleared` nodes, star ratings, the XP / Rank / Streak HUD and the study
 * streak — all derived from `exam_attempts`, so nothing has to be stored twice.
 */
export const getRecentTrackAttempts = cache(async (userId: string | null, track: Track): Promise<ExamAttempt[]> => {
  if (!userId) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("exam_attempts")
      .select("id, user_id, exam_id, kind, label, track, level, score, total, duration_used_seconds, answers, completed_at")
      .eq("user_id", userId)
      .eq("track", track)
      .order("completed_at", { ascending: false })
      .limit(120);
    if (error) return [];
    return (data as ExamAttempt[]) ?? [];
  } catch {
    return [];
  }
});

/** Active study rooms for the Study Room sidebar & chats page. */
export const getStudyRooms = cache(async (): Promise<StudyRoom[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("study_rooms")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data as StudyRoom[]) ?? [];
  } catch {
    return [];
  }
});

/** Recent messages across active study rooms for the top header Study Room dropdown. */
export const getRecentStudyChat = cache(async (limit = 5): Promise<RecentStudyChat[]> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_recent_study_chat", { p_limit: limit });
    if (error) return [];
    return (data as RecentStudyChat[]) ?? [];
  } catch {
    return [];
  }
});

/** Messages in a specific study room, chronological order. */
export async function getStudyRoomMessages(roomId: string, limit = 80): Promise<StudyRoomMessage[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_study_room_messages", {
      p_room_id: roomId,
      p_limit: limit,
    });
    if (error) return [];
    return (data as StudyRoomMessage[]) ?? [];
  } catch {
    return [];
  }
}
