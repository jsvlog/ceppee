import { levelsFor, levelShort, subjectsFor, specializationsFor, timedMinutes } from "@/lib/exam";
import type { Level, Track } from "@/lib/types";

export interface StudyParams {
  level: Level;
  /** Empty = the student still has to choose on the setup screen. */
  subjects: string[];
  major: string | null;
  count: number;
  difficulty: number;
  timed: boolean;
  label: string;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseStudyParams(track: Track, raw: RawParams, defaultCount = 20): StudyParams {
  const levels = levelsFor(track);
  const wantedLevel = first(raw.level);
  const level = (levels.find((l) => l.key === wantedLevel)?.key ?? levels[0].key) as Level;

  // The majorship filter used to be allowed only at `secondary`, which silently
  // dropped the Specialization paper for BSNEd / BECEd (elementary-with-major)
  // takers, so their drill matched nothing. Validate against the level's own list
  // instead: secondary has the 11 majors, elementary only the two specialization papers.
  const majorRaw = first(raw.major);
  const allowedMajors = track === "LET" ? specializationsFor(level) : [];
  const major = majorRaw && allowedMajors.includes(majorRaw) ? majorRaw : null;

  const allowed = subjectsFor(track, level).map((s) => s.key);
  const subjects = (first(raw.subjects) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && allowed.includes(s));

  const count = Math.min(200, Math.max(5, Number(first(raw.count)) || defaultCount));
  const difficulty = Math.min(3, Math.max(0, Number(first(raw.difficulty)) || 0));
  const timed = first(raw.timed) === "1";

  const label =
    first(raw.tlabel) ||
    [`${track} ${levelShort(track, level)}`, subjects.length ? subjects.join(", ") : "Mixed"].join(" — ");

  return { level, subjects, major, count, difficulty, timed, label };
}

export function studyMinutes(count: number, track: Track): number {
  return timedMinutes(count, track);
}

/** "Verbal Ability,Numerical Ability" -> URLSearchParams-safe string */
export function subjectsParam(subjects: string[]): string {
  return subjects.join(",");
}
