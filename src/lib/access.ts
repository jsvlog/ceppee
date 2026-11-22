import type { Subscription, Track } from "./types";

/** What the user is asking about: a track, and maybe a level and a subject. */
export interface AccessTarget {
  track: Track;
  level?: string | null;
  subject?: string | null;
  /** A Specialization pass names one majorship; null means "any major". */
  specialization?: string | null;
}

function liveSubs(subs: Subscription[]): Subscription[] {
  const now = Date.now();
  return subs.filter((s) => s.status === "active" && new Date(s.expires_at).getTime() > now);
}

/**
 * Mirrors public.user_can_access() in supabase/plans-v2.sql — keep the two in
 * step, or the UI will offer a subject the database refuses to serve.
 *
 *   track pass   -> everything in the track
 *   level pass   -> that level plus the shared papers (level = 'both')
 *   subject pass -> that one subject, and for Specialization only that major
 */
export function canAccess(subs: Subscription[], target: AccessTarget): boolean {
  return liveSubs(subs).some(
    (s) =>
      s.track === target.track &&
      ((s.scope ?? "track") === "track" ||
        ((s.scope === "level" &&
          (!target.level || target.level === "both" || s.level === target.level)) ||
          (s.scope === "subject" &&
            Boolean(target.subject) &&
            s.subject === target.subject &&
            (!s.specialization ||
              !target.specialization ||
              s.specialization === target.specialization))))
  );
}

/** The latest expiry among the passes that cover this target, for "unlocked until". */
export function accessUntil(subs: Subscription[], target: AccessTarget): string | null {
  const matches = liveSubs(subs).filter(
    (s) =>
      s.track === target.track &&
      ((s.scope ?? "track") === "track" ||
        (s.scope === "level" && (!target.level || target.level === "both" || s.level === target.level)) ||
        (s.scope === "subject" &&
          Boolean(target.subject) &&
          s.subject === target.subject &&
          (!s.specialization ||
            !target.specialization ||
            s.specialization === target.specialization)))
  );
  if (!matches.length) return null;
  return matches.reduce((a, b) => (new Date(a.expires_at) > new Date(b.expires_at) ? a : b)).expires_at;
}

