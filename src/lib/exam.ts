import type { Level, Track } from "@/lib/types";

/**
 * Single source of truth for the exam vocabulary. Everything the student
 * chooses (level, subject, majorship) and everything the admin tags questions
 * with comes from here, so the bank and the UI can never drift apart.
 */

export interface LevelMeta {
  key: Level;
  label: string;
  short: string;
  blurb: string;
  facts: { items: string; time: string; passing: string };
  defaultSubjects: string[];
}

const SHARED_CSE = ["Verbal Ability", "Numerical Ability", "General Information"];

export const MATERIAL: Record<Track, LevelMeta[]> = {
  CSE: [
    {
      key: "professional",
      label: "CSE Professional",
      short: "Professional",
      blurb: "For 2nd level / technical and officer positions.",
      facts: { items: "170 items", time: "3 hrs 10 min", passing: "80%" },
      defaultSubjects: [...SHARED_CSE, "Analytical Ability"],
    },
    {
      key: "subprofessional",
      label: "CSE Sub-Professional",
      short: "Sub-Professional",
      blurb: "For 1st level / clerical and administrative positions.",
      facts: { items: "165 items", time: "2 hrs 40 min", passing: "80%" },
      defaultSubjects: [...SHARED_CSE, "Clerical Ability"],
    },
  ],
  LET: [
    {
      key: "elementary",
      label: "LET Elementary",
      short: "Elementary (Grades 1–6)",
      blurb: "General Education 40% + Professional Education 60%.",
      facts: { items: "150 items per subtest", time: "3–3.5 hrs per subtest", passing: "75% average" },
      defaultSubjects: ["General Education", "Professional Education"],
    },
    {
      key: "secondary",
      label: "LET Secondary",
      short: "Secondary (JHS / SHS)",
      blurb: "General Education 20% + Professional Education 40% + your Specialization 40%.",
      facts: { items: "150 items per subtest", time: "3–3.5 hrs per subtest", passing: "75% average" },
      defaultSubjects: ["General Education", "Professional Education", "Specialization"],
    },
  ],
};

export interface SubjectMeta {
  key: string;
  icon: string;
  note: string;
  /** Which levels this subject belongs to. */
  levels: Level[] | "all";
}

export const SUBJECTS: Record<Track, SubjectMeta[]> = {
  CSE: [
    {
      key: "Verbal Ability",
      icon: "📖",
      note: "English + Filipino — vocabulary, grammar, reading comprehension. Biggest section.",
      levels: "all",
    },
    {
      key: "Numerical Ability",
      icon: "➗",
      note: "No calculator. Fractions, percentages, ratios, word problems, data.",
      levels: "all",
    },
    {
      key: "Analytical Ability",
      icon: "🧩",
      note: "Word analogy, symbolic logic, assumptions, data interpretation. Professional only.",
      levels: ["professional"],
    },
    {
      key: "Clerical Ability",
      icon: "🗂️",
      note: "Filing and spelling speed. Sub-Professional only — and it decides most results.",
      levels: ["subprofessional"],
    },
    {
      key: "General Information",
      icon: "⚖️",
      note: "1987 Constitution, RA 6713, environment, peace and human rights.",
      levels: "all",
    },
  ],
  LET: [
    {
      key: "General Education",
      icon: "🎓",
      note: "English, Filipino, Math, Science, Social Studies, IT.",
      levels: "all",
    },
    {
      key: "Professional Education",
      icon: "🧑‍🏫",
      note: "Teaching principles, child development, assessment, Code of Ethics. The biggest chunk.",
      levels: "all",
    },
    {
      key: "Specialization",
      icon: "📚",
      note: "Your declared major — Secondary takers only.",
      levels: ["secondary"],
    },
  ],
};

/** Secondary LET majors (the Specialization subtest you filed for). */
export const SPECIALIZATIONS = [
  "English",
  "Filipino",
  "Mathematics",
  "Science",
  "Social Studies",
  "MAPEH",
  "TLE",
  "Values Education",
  "Araling Panlipunan",
  "Mother Tongue",
];

/**
 * Snap a typed or pasted majorship onto one of the official SPECIALIZATIONS.
 *
 * Students' drills filter with an EXACT match (`q.specialization = v.specialization`),
 * so a question tagged "Math" instead of "Mathematics" is never shown to anyone and
 * nothing reports it. Always run user/import input through this before saving.
 * Returns null when the value is empty or unrecognised — callers should warn on the
 * unrecognised case rather than store a name the bank will never match.
 */
const SPECIALIZATION_ALIASES: Record<string, string> = {
  math: "Mathematics",
  maths: "Mathematics",
  mathematics: "Mathematics",
  eng: "English",
  english: "English",
  fil: "Filipino",
  filipino: "Filipino",
  sci: "Science",
  science: "Science",
  "social studies": "Social Studies",
  socialstudies: "Social Studies",
  soscs: "Social Studies",
  ap: "Araling Panlipunan",
  "araling panlipunan": "Araling Panlipunan",
  aralingpanlipunan: "Araling Panlipunan",
  mapeh: "MAPEH",
  tle: "TLE",
  "values education": "Values Education",
  values: "Values Education",
  esp: "Values Education",
  "mother tongue": "Mother Tongue",
  mothertongue: "Mother Tongue",
  mtb: "Mother Tongue",
  mtb_mle: "Mother Tongue",
};

export function normalizeSpecialization(v: string | null | undefined): string | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const exact = SPECIALIZATIONS.find((s) => s.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  return SPECIALIZATION_ALIASES[raw.toLowerCase().replace(/\.$/, "").replace(/[-\s]+/g, " ")] ?? null;
}

export function levelsFor(track: Track): LevelMeta[] {
  return MATERIAL[track];
}

export function levelMeta(track: Track, level: Level | string | null | undefined): LevelMeta | null {
  if (!level) return null;
  return MATERIAL[track].find((l) => l.key === level) ?? null;
}

export function levelLabel(track: Track, level: Level | string | null | undefined): string {
  if (!level || level === "both") return track === "CSE" ? "CSE (both levels)" : "LET (both levels)";
  return levelMeta(track, level)?.label ?? String(level);
}

export function levelShort(track: Track, level: Level | string | null | undefined): string {
  if (!level || level === "both") return "Both levels";
  return levelMeta(track, level)?.short ?? String(level);
}

export function subjectsFor(track: Track, level: Level | string | null | undefined): SubjectMeta[] {
  const list = SUBJECTS[track];
  if (!level || level === "both") return list;
  return list.filter((s) => s.levels === "all" || s.levels.includes(level as Level));
}

export function subjectIcon(track: Track, subject: string | null | undefined): string {
  if (!subject) return "📝";
  return SUBJECTS[track].find((s) => s.key === subject)?.icon ?? "📝";
}

/** Minutes allowed for a student-built timed paper (real CSE ≈ 1.1 min/item). */
export function timedMinutes(count: number, track: Track): number {
  const perItem = track === "CSE" ? 1.12 : 1.3;
  return Math.max(5, Math.round(count * perItem));
}

/** Passing mark: CSE needs 80%, LET needs a 75% average (no subtest under 50%). */
export function passingPctFor(track: Track): number {
  return track === "CSE" ? 80 : 75;
}

export const STUDY_MODES = [
  {
    id: "mock",
    icon: "⏱️",
    title: "Full Mock Exam",
    short: "Timed, like the real thing",
    note: "One sitting, real time limit, no peeking at answers. You get your score and a full answer review at the end.",
  },
  {
    id: "drill",
    icon: "🎯",
    title: "Subject Drill",
    short: "Pick a subject, get instant explanations",
    note: "Choose one subject (or a few) and how many items. Every answer is explained right away.",
  },
  {
    id: "flashcards",
    icon: "🃏",
    title: "Flashcards",
    short: "Flip, answer, repeat the ones you miss",
    note: "Read the question, think, flip the card. Mark it 'alam ko' or 'hindi ko' — the ones you miss come back at the end.",
  },
  {
    id: "mistakes",
    icon: "🔁",
    title: "Retry My Mistakes",
    short: "Only the items you got wrong",
    note: "Builds a drill from the questions you keep missing. This is the fastest way to gain points.",
  },
] as const;

export type StudyModeId = (typeof STUDY_MODES)[number]["id"];
