import type { SetCatalogRow } from "./types";

/**
 * Gamified progression engine.
 *
 * Everything here is pure and dependency-free (type-only imports) so it can be
 * unit-tested with `node --test --experimental-strip-types` and reused by both
 * server pages and client components.
 *
 * Derived entirely from rows the app already has — `exam_attempts` for progress
 * and `set_catalog()` for the set list — so no migration is needed and a student
 * sees credit for the papers they already sat.
 */

export interface AttemptSummary {
  id?: string;
  score: number;
  total: number;
  kind: "exam" | "drill" | "flashcards";
  /** The attempt's label; a set mock stores "<set title> (set mock)". */
  label: string | null;
  completed_at: string;
}

export interface PlayerStats {
  xp: number;
  level: number;
  xpInLevel: number;
  xpForNextLevel: number;
  levelProgressPct: number;
  rankTitle: string;
  rankIcon: string;
  streakDays: number;
  examsPassed: number;
  totalAnswered: number;
}

const XP_PER_LEVEL = 500;
const XP_PER_CORRECT = 10;
const XP_PASS_BONUS = 150;

const RANKS: { minLevel: number; title: string; icon: string }[] = [
  { minLevel: 1, title: "Rookie Examinee", icon: "🌱" },
  { minLevel: 3, title: "Board Challenger", icon: "⚡" },
  { minLevel: 6, title: "Quiz Tactician", icon: "🛡️" },
  { minLevel: 10, title: "Master Reviewer", icon: "🔥" },
  { minLevel: 15, title: "Topnotcher Contender", icon: "👑" },
];

/** Level -> rank title/icon. The ladder the hub's XP badge and the leaderboard share. */
export function rankForLevel(level: number): { title: string; icon: string } {
  let rank = RANKS[0];
  for (const r of RANKS) if (level >= r.minLevel) rank = r;
  return { title: rank.title, icon: rank.icon };
}

/** Order-independent: the caller passes attempts newest-first, but only dates matter. */
export function computePlayerStats(attempts: AttemptSummary[], passingPct = 75): PlayerStats {
  let xp = 0;
  let examsPassed = 0;
  let totalAnswered = 0;

  for (const a of attempts) {
    const score = Math.max(0, Number(a.score) || 0);
    const total = Math.max(0, Number(a.total) || 0);
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    totalAnswered += total;
    xp += score * XP_PER_CORRECT;
    if (a.kind === "exam" && total > 0 && pct >= passingPct) {
      xp += XP_PASS_BONUS;
      examsPassed += 1;
    }
  }

  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpInLevel = xp % XP_PER_LEVEL;
  const levelProgressPct = Math.min(100, Math.round((xpInLevel / XP_PER_LEVEL) * 100));

  const rank = rankForLevel(level);

  // Study streak = consecutive UTC days with at least one finished attempt,
  // counted back from the most recent day.
  const days = [...new Set(attempts.map((a) => (a.completed_at || "").slice(0, 10)).filter(Boolean))].sort();
  let streakDays = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (streakDays === 0) {
      streakDays = 1;
      continue;
    }
    const newer = new Date(days[i + 1] + "T00:00:00Z").getTime();
    const older = new Date(days[i] + "T00:00:00Z").getTime();
    if (Math.round((newer - older) / 86400000) === 1) streakDays += 1;
    else break;
  }

  return {
    xp,
    level,
    xpInLevel,
    xpForNextLevel: XP_PER_LEVEL,
    levelProgressPct,
    rankTitle: rank.title,
    rankIcon: rank.icon,
    streakDays,
    examsPassed,
    totalAnswered,
  };
}

export type CampaignNodeState = "done" | "current" | "unlocked" | "locked";

export interface CampaignNode {
  set: SetCatalogRow;
  state: CampaignNodeState;
  bestPct: number | null;
  attemptsCount: number;
  stars: 0 | 1 | 2 | 3;
}

export interface CampaignRegion {
  regionNo: number;
  title: string;
  subtitle: string;
  completedCount: number;
  totalCount: number;
  nodes: CampaignNode[];
}

const REGION_TITLES = [
  "Region I · Foundation Grounds",
  "Region II · Core Mastery Trail",
  "Region III · Situational Judgement Peaks",
  "Region IV · Board Gauntlet Ridge",
  "Region V · Topnotcher Summit",
];

/** Set attempts are stored as "<title> (set mock)"; map them back onto the set. */
function attemptKey(label: string): string {
  return label.replace(/\s*\(set mock\)\s*$/i, "").trim().toLowerCase();
}

export function buildCampaignRegions(
  sets: SetCatalogRow[],
  attempts: AttemptSummary[],
  opts: { passingPct: number; subscribed: boolean; regionSize?: number }
): CampaignRegion[] {
  const regionSize = opts.regionSize ?? 5;
  const sorted = [...sets].sort((a, b) => a.set_no - b.set_no);

  const byTitle = new Map<string, { bestPct: number; count: number }>();
  for (const a of attempts) {
    if (!a.label || a.total <= 0) continue;
    const key = attemptKey(a.label);
    const pct = Math.round((a.score / a.total) * 100);
    const prev = byTitle.get(key);
    byTitle.set(key, prev ? { bestPct: Math.max(prev.bestPct, pct), count: prev.count + 1 } : { bestPct: pct, count: 1 });
  }

  let currentTaken = false;
  const nodes: CampaignNode[] = sorted.map((s) => {
    const stat = byTitle.get(s.title.trim().toLowerCase());
    const bestPct = stat ? stat.bestPct : null;
    const attemptsCount = stat ? stat.count : 0;

    let stars: 0 | 1 | 2 | 3 = 0;
    if (bestPct !== null) {
      if (bestPct >= 90) stars = 3;
      else if (bestPct >= opts.passingPct) stars = 2;
      else if (bestPct >= 50) stars = 1;
    }

    if (!opts.subscribed) return { set: s, state: "locked", bestPct, attemptsCount, stars };

    if (bestPct !== null && bestPct >= opts.passingPct) {
      return { set: s, state: "done", bestPct, attemptsCount, stars };
    }
    if (!currentTaken) {
      currentTaken = true;
      return { set: s, state: "current", bestPct, attemptsCount, stars };
    }
    return { set: s, state: "unlocked", bestPct, attemptsCount, stars };
  });

  const regions: CampaignRegion[] = [];
  for (let i = 0; i < nodes.length; i += regionSize) {
    const slice = nodes.slice(i, i + regionSize);
    const regionNo = Math.floor(i / regionSize) + 1;
    regions.push({
      regionNo,
      title: REGION_TITLES[regionNo - 1] ?? `Region ${regionNo} · Frontier Sets`,
      subtitle: `Sets ${slice[0].set.set_no}–${slice[slice.length - 1].set.set_no} · ${slice.length * 150} items`,
      completedCount: slice.filter((n) => n.state === "done").length,
      totalCount: slice.length,
      nodes: slice,
    });
  }
  return regions;
}

/** XP multiplier for a consecutive-correct streak. */
export function comboMultiplier(streak: number): number {
  if (streak >= 10) return 5;
  if (streak >= 5) return 3;
  if (streak >= 3) return 2;
  return 1;
}

/** 75%+ = 2 stars, 90%+ = 3 stars, 50%+ = 1 star. */
export function starsFor(pct: number, passingPct: number): 0 | 1 | 2 | 3 {
  if (pct >= 90) return 3;
  if (pct >= passingPct) return 2;
  if (pct >= 50) return 1;
  return 0;
}
