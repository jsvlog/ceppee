/**
 * Tagged bulk-question parser for the admin importer.
 *
 * Two paste formats are supported, and they can be mixed:
 *
 * 1. BLOCK format (one question per block, blank line between):
 *
 *      TRACK: CSE            <- optional tag lines at the very top (defaults)
 *      LEVEL: professional
 *      SUBJECT: Numerical Ability
 *
 *      1. What is 15% of 240?
 *      A) 36
 *      B) 32
 *      C) 40
 *      D) 24
 *      ANSWER: A
 *      EXPLANATION: 10% of 240 = 24, 5% = 12, so 15% = 36.
 *
 *    Any tag line may also appear inside a block to override the default.
 *
 * 2. TABLE format (paste straight from Excel/Sheets — tab separated):
 *
 *      question <TAB> A <TAB> B <TAB> C <TAB> D <TAB> ANSWER <TAB> explanation
 *
 *    A header row is detected automatically; the recognised column names are
 *    question, a, b, c, d, answer, explanation, subject, subtopic, difficulty,
 *    level, track, specialization, source, free.
 *
 * Recognised tags: TRACK, LEVEL, SUBJECT, SUBTOPIC, SPECIALIZATION, DIFFICULTY,
 * FREE, SOURCE. Lines like ANSWER:/SAGOT: and EXPLANATION:/PALIWANAG: are
 * recognised inside a block.
 */

export interface ParsedQuestion {
  order_index: number;
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_choice: string;
  explanation: string | null;
  track?: string;
  level?: string;
  subject?: string;
  subtopic?: string;
  specialization?: string;
  difficulty?: number;
  is_free?: boolean;
  source?: string;
}

// Majorship names live in one place so the admin form, the importer and the student
// drills cannot drift apart (a mismatched majorship hides a question from everyone).
import { SPECIALIZATIONS, normalizeSpecialization } from "@/lib/exam";

export interface ParsedBatch {
  defaults: Partial<ParsedQuestion>;
  questions: ParsedQuestion[];
  warnings: string[];
}

export const CSE_SUBJECTS = [
  "Verbal Ability",
  "Numerical Ability",
  "Analytical Ability",
  "Clerical Ability",
  "General Information",
];
export const LET_SUBJECTS = ["General Education", "Professional Education", "Specialization"];
export const ALL_SUBJECTS = [...CSE_SUBJECTS, ...LET_SUBJECTS];
export const ALL_LEVELS = ["both", "professional", "subprofessional", "elementary", "secondary"];

/**
 * Majorship tag values are snapped onto the official SPECIALIZATIONS list.
 * Same trap as subjects, but worse: a student's Specialization drill matches the
 * majorship EXACTLY, so a question tagged "Math" instead of "Mathematics" is never
 * served to anyone and nothing reports it. Unrecognised values are dropped with a
 * warning rather than stored, so the gap shows up as an obvious "no majorship"
 * rather than as a plausible-looking tag that silently matches nothing.
 */


const TRACK_ALIASES: Record<string, string> = {
  cse: "CSE",
  "civil service": "CSE",
  civilservice: "CSE",
  civil: "CSE",
  let: "LET",
  lpt: "LET",
  teachers: "LET",
  teacher: "LET",
};

const LEVEL_ALIASES: Record<string, string> = {
  both: "both",
  any: "both",
  all: "both",
  professional: "professional",
  prof: "professional",
  pro: "professional",
  subprofessional: "subprofessional",
  "sub-professional": "subprofessional",
  sub: "subprofessional",
  subprof: "subprofessional",
  elementary: "elementary",
  elem: "elementary",
  grade: "elementary",
  primary: "elementary",
  secondary: "secondary",
  sec: "secondary",
  highschool: "secondary",
  "high school": "secondary",
  jhs: "secondary",
  shs: "secondary",
};

const DIFFICULTY_ALIASES: Record<string, number> = {
  "1": 1, easy: 1, madali: 1, basic: 1, simple: 1,
  "2": 2, average: 2, medium: 2, moderate: 2, katamtaman: 2, normal: 2,
  "3": 3, hard: 3, difficult: 3, mahirap: 3, challenging: 3,
};

const SUBJECT_ALIASES: Record<string, string> = {
  verbal: "Verbal Ability",
  "verbal ability": "Verbal Ability",
  english: "Verbal Ability",
  filipino: "Verbal Ability",
  vocabulary: "Verbal Ability",
  numerical: "Numerical Ability",
  "numerical ability": "Numerical Ability",
  math: "Numerical Ability",
  mathematics: "Numerical Ability",
  "basic math": "Numerical Ability",
  analytical: "Analytical Ability",
  "analytical ability": "Analytical Ability",
  logic: "Analytical Ability",
  "abstract reasoning": "Analytical Ability",
  "word analogy": "Analytical Ability",
  clerical: "Clerical Ability",
  "clerical ability": "Clerical Ability",
  filing: "Clerical Ability",
  spelling: "Clerical Ability",
  "general information": "General Information",
  geninfo: "General Information",
  "gen info": "General Information",
  constitution: "General Information",
  "ra 6713": "General Information",
  gened: "General Education",
  "gen ed": "General Education",
  "general education": "General Education",
  profed: "Professional Education",
  "prof ed": "Professional Education",
  "professional education": "Professional Education",
  specialization: "Specialization",
  major: "Specialization",
  majorship: "Specialization",
};

const TAG_RE = /^(TRACK|LEVEL|SUBJECT|SUBTOPIC|SUB\s?TOPIC|SPECIALIZATION|MAJOR|DIFFICULTY|FREE|SOURCE|SET)\s*[:=]\s*(.+)$/i;
const CHOICE_RE = /^([A-Da-d])\s*[.)\]:-]\s*(.+)$/;
const ANSWER_RE = /^(?:ANSWER|ANS|SAGOT|TAMANG\s+SAGOT|CORRECT)\s*[:=.-]\s*([A-Da-d])\b/i;
const EXPLANATION_RE = /^(?:EXPLANATION|EXPL|PALIWANAG|RATIONALE)\s*[:=.-]\s*([\s\S]+)$/i;
const INLINE_CHOICES_RE = /^\s*A\s*[.)\]:-].*B\s*[.)\]:-].*C\s*[.)\]:-].*D\s*[.)\]:-]/i;
const QUESTION_PREFIX_RE = /^(?:Q(?:UESTION)?\s*)?\d{1,4}\s*[.)\]:-]\s*/i;

function truthy(v: string): boolean {
  return ["1", "y", "yes", "true", "oo", "opo", "free"].includes(v.trim().toLowerCase());
}

function normalizeTrack(v: string): string | null {
  const k = v.trim().toLowerCase();
  return TRACK_ALIASES[k] ?? (v.trim().toUpperCase() === "CSE" || v.trim().toUpperCase() === "LET" ? v.trim().toUpperCase() : null);
}

function normalizeLevel(v: string): string | null {
  return LEVEL_ALIASES[v.trim().toLowerCase()] ?? null;
}

function normalizeSubject(v: string): string | null {
  const raw = v.trim();
  const exact = ALL_SUBJECTS.find((s) => s.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  return SUBJECT_ALIASES[raw.toLowerCase().replace(/\.$/, "")] ?? null;
}

function applyTag(target: Partial<ParsedQuestion>, key: string, value: string, warnings: string[], where: string) {
  const k = key.trim().toUpperCase().replace(/\s+/g, " ");
  const v = value.trim();
  if (!v) return;

  if (k === "TRACK") {
    const t = normalizeTrack(v);
    if (!t) warnings.push(`${where}: unrecognised TRACK "${v}" (use CSE or LET) — ignored.`);
    else target.track = t;
  } else if (k === "LEVEL") {
    const l = normalizeLevel(v);
    if (!l) warnings.push(`${where}: unrecognised LEVEL "${v}" — ignored.`);
    else target.level = l;
  } else if (k === "SUBJECT") {
    const s = normalizeSubject(v);
    if (!s) {
      warnings.push(`${where}: unrecognised SUBJECT "${v}" — it will be saved as-is, but subject drills will not find it.`);
      target.subject = v;
    } else target.subject = s;
  } else if (k === "SUBTOPIC" || k === "SUB TOPIC" || k === "SUBTOPIC ") {
    target.subtopic = v;
  } else if (k === "SPECIALIZATION" || k === "MAJOR") {
    const s = normalizeSpecialization(v);
    if (!s) {
      warnings.push(
        `${where}: unrecognised MAJORSHIP "${v}" — dropped, so this question will not appear in any Specialization drill. Use one of: ${SPECIALIZATIONS.join(", ")}.`
      );
    } else target.specialization = s;
  } else if (k === "DIFFICULTY") {
    const d = DIFFICULTY_ALIASES[v.toLowerCase()];
    if (!d) warnings.push(`${where}: unrecognised DIFFICULTY "${v}" (use easy/average/hard) — ignored.`);
    else target.difficulty = d;
  } else if (k === "FREE") {
    target.is_free = truthy(v);
  } else if (k === "SOURCE" || k === "SET") {
    target.source = v;
  }
}

/** Split a single line into cells for the table format. */
function splitCells(line: string, delimiter: string): string[] {
  if (delimiter !== ",") return line.split(delimiter).map((c) => c.trim());
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const COLUMN_ALIASES: Record<string, keyof ParsedQuestion> = {
  question: "question_text",
  question_text: "question_text",
  tanong: "question_text",
  q: "question_text",
  a: "choice_a",
  choice_a: "choice_a",
  option_a: "choice_a",
  b: "choice_b",
  choice_b: "choice_b",
  option_b: "choice_b",
  c: "choice_c",
  choice_c: "choice_c",
  option_c: "choice_c",
  d: "choice_d",
  choice_d: "choice_d",
  option_d: "choice_d",
  answer: "correct_choice",
  correct: "correct_choice",
  correct_choice: "correct_choice",
  sagot: "correct_choice",
  explanation: "explanation",
  expl: "explanation",
  paliwanag: "explanation",
  rationale: "explanation",
  subject: "subject",
  topic: "subject",
  subtopic: "subtopic",
  level: "level",
  track: "track",
  difficulty: "difficulty",
  specialization: "specialization",
  major: "specialization",
  source: "source",
  set: "source",
  free: "is_free",
};

export function parseBulkQuestions(input: string): ParsedBatch {
  const text = String(input ?? "").replace(/\r\n?/g, "\n");
  if (!text.trim()) throw new Error("Nothing to import — paste the questions first.");

  const warnings: string[] = [];
  const rawLines = text.split("\n");
  const nonEmpty = rawLines.filter((l) => l.trim());

  const tabLines = nonEmpty.filter((l) => l.split("\t").length >= 6);
  const pipeLines = nonEmpty.filter((l) => l.split("|").length >= 6);
  const commaLines = nonEmpty.filter((l) => splitCells(l, ",").length >= 6);

  const isTable =
    tabLines.length > 0 && tabLines.length >= nonEmpty.length * 0.5
      ? "\t"
      : pipeLines.length > 0 && pipeLines.length >= nonEmpty.length * 0.5
        ? "|"
        : commaLines.length > 0 && commaLines.length >= nonEmpty.length * 0.5
          ? ","
          : null;

  const defaults: Partial<ParsedQuestion> = {};
  const questions: ParsedQuestion[] = [];
  const ctx = makeCtx(warnings);

  if (isTable) {
    const delim = isTable;
    let colMap: (keyof ParsedQuestion | null)[] | null = null;

    rawLines.forEach((line, lineNo) => {
      if (!line.trim()) return;
      const cells = splitCells(line, delim);

      // Header row?
      if (!colMap) {
        const looksLikeHeader = cells.some((c) => COLUMN_ALIASES[c.toLowerCase().replace(/\s+/g, "_")] === "question_text");
        if (looksLikeHeader) {
          colMap = cells.map((c) => COLUMN_ALIASES[c.toLowerCase().replace(/\s+/g, "_")] ?? null);
          return;
        }
        // Positional fallback: question, A, B, C, D, answer, explanation, subject, subtopic, difficulty
        colMap = [
          "question_text", "choice_a", "choice_b", "choice_c", "choice_d",
          "correct_choice", "explanation", "subject", "subtopic", "difficulty",
        ];
      }

      const row: Record<string, unknown> = {};
      cells.forEach((cell, i) => {
        const field = colMap![i];
        if (!field || !cell) return;
        if (field === "difficulty") {
          const d = DIFFICULTY_ALIASES[cell.toLowerCase()] ?? Number(cell);
          if (d) row.difficulty = d;
        } else if (field === "is_free") {
          row.is_free = truthy(cell);
        } else if (field === "level") {
          const l = normalizeLevel(cell);
          if (l) row.level = l;
        } else if (field === "track") {
          const t = normalizeTrack(cell);
          if (t) row.track = t;
        } else if (field === "subject") {
          row.subject = normalizeSubject(cell) ?? cell.trim();
        } else if (field === "correct_choice") {
          row.correct_choice = cell.trim().toUpperCase().charAt(0);
        } else {
          row[field] = cell.trim();
        }
      });

      pushRow(row, lineNo + 1, defaults, questions, ctx);
    });

    if (questions.length === 0) {
      throw new Error("No usable rows found. Check that the table has question, A, B, C, D and ANSWER columns.");
    }
    return { defaults, questions, warnings: finaliseWarnings(ctx, questions) };
  }

  /* ---------------- block format ---------------- */

  // Leading tag lines become the defaults for the whole paste.
  let start = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line.trim()) {
      if (start === i) start = i + 1; // leading blank lines
      continue;
    }
    const tag = line.match(TAG_RE);
    if (tag) {
      applyTag(defaults, tag[1], tag[2], warnings, `header line ${i + 1}`);
      start = i + 1;
      continue;
    }
    break;
  }

  const body = rawLines.slice(start).join("\n");
  const blocks = body.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) throw new Error("No question blocks found — separate each question with a blank line.");

  /**
   * Tags are STICKY: a bare "TRACK: LET" line part-way down the paste switches
   * every following block, which is how people actually paste a second section.
   * A block that sets its own tag always wins for that block.
   */
  const running: Partial<ParsedQuestion> = { ...defaults };

  blocks.forEach((block, bi) => {
    const where = `Question ${bi + 1}`;
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    let questionText = "";
    const choices: Record<string, string> = {};
    let answer = "";
    let explanation: string | null = null;
    const tagOverrides: Partial<ParsedQuestion> = {};

    for (const line of lines) {
      const tag = line.match(TAG_RE);
      if (tag && !questionText) {
        applyTag(tagOverrides, tag[1], tag[2], warnings, where);
        continue;
      }
      if (tag && questionText) {
        applyTag(tagOverrides, tag[1], tag[2], warnings, where);
        continue;
      }
      if (ANSWER_RE.test(line)) {
        answer = (line.match(ANSWER_RE)?.[1] ?? "").toUpperCase();
        continue;
      }
      const expl = line.match(EXPLANATION_RE);
      if (expl) {
        explanation = expl[1].trim();
        continue;
      }
      if (INLINE_CHOICES_RE.test(line)) {
        const parts = line.split(/(?=[A-Da-d]\s*[.)\]:-])/);
        parts.forEach((p) => {
          const m = p.match(CHOICE_RE);
          if (m) {
            const letter = m[1].toUpperCase();
            if (!choices[letter]) choices[letter] = m[2].trim();
          }
        });
        continue;
      }
      const choice = line.match(CHOICE_RE);
      if (choice) {
        const letter = choice[1].toUpperCase();
        if (!choices[letter]) {
          choices[letter] = choice[2].trim();
          continue;
        }
      }
      if (!questionText) {
        questionText = line.replace(QUESTION_PREFIX_RE, "").trim();
        continue;
      }
      // Continuation line of a multi-line question/choice text.
      if (!choices.A && !choices.B && !choices.C && !choices.D) questionText += " " + line;
      else if (choices.D) choices.D += " " + line;
    }

    if (!questionText) throw new Error(`${where}: no question text found.`);
    if (!choices.A || !choices.B || !choices.C || !choices.D) {
      throw new Error(`${where}: needs all four choices, formatted like "A) …", "B) …", "C) …", "D) …".`);
    }
    if (!answer) throw new Error(`${where}: no ANSWER line. Add "ANSWER: B" after the choices.`);

    const row: Record<string, unknown> = {
      ...tagOverrides,
      question_text: questionText,
      choice_a: choices.A,
      choice_b: choices.B,
      choice_c: choices.C,
      choice_d: choices.D,
      correct_choice: answer,
      explanation,
    };
    // Sticky tags: this block's tags become the defaults for the blocks below.
    Object.assign(running, tagOverrides);
    pushRow(row, bi + 1, running, questions, ctx);
  });

  return { defaults, questions, warnings: finaliseWarnings(ctx, questions) };
}

function pushRow(
  row: Record<string, unknown>,
  index: number,
  defaults: Partial<ParsedQuestion>,
  out: ParsedQuestion[],
  ctx: { warnings: string[]; missingSubject: number }
) {
  const merged = { ...defaults, ...row } as Partial<ParsedQuestion>;
  const question = String(merged.question_text ?? "").trim();
  const a = String(merged.choice_a ?? "").trim();
  const b = String(merged.choice_b ?? "").trim();
  const c = String(merged.choice_c ?? "").trim();
  const d = String(merged.choice_d ?? "").trim();
  const correct = String(merged.correct_choice ?? "").trim().toUpperCase().charAt(0);

  if (!question) throw new Error(`Question ${index}: missing the question text.`);
  if (!a || !b || !c || !d) throw new Error(`Question ${index}: needs all four choices (A-D).`);
  if (!["A", "B", "C", "D"].includes(correct)) {
    throw new Error(`Question ${index}: ANSWER must be A, B, C or D (got "${merged.correct_choice ?? ""}").`);
  }

  // `track` and `level` stay undefined when the paste did not say — the import
  // screen's own defaults (or the database default) then decide.
  const track = merged.track;
  const level = merged.level;
  const subject = merged.subject ?? undefined;

  // Catch the two level-exclusive CSE sections early, with a readable message.
  if (subject === "Analytical Ability" && level === "subprofessional") {
    throw new Error(`Question ${index}: Analytical Ability only exists on the CSE Professional paper (set LEVEL: professional).`);
  }
  if (subject === "Clerical Ability" && level === "professional") {
    throw new Error(`Question ${index}: Clerical Ability only exists on the CSE Sub-Professional paper (set LEVEL: subprofessional).`);
  }

  out.push({
    order_index: out.length + 1,
    question_text: question,
    choice_a: a,
    choice_b: b,
    choice_c: c,
    choice_d: d,
    correct_choice: correct,
    explanation: merged.explanation ? String(merged.explanation) : null,
    track,
    level,
    subject,
    subtopic: merged.subtopic ? String(merged.subtopic) : undefined,
    specialization: merged.specialization ? String(merged.specialization) : undefined,
    difficulty: merged.difficulty ?? 2,
    is_free: merged.is_free === true,
    source: merged.source ? String(merged.source) : undefined,
  });

  if (!subject) ctx.missingSubject++;
}

/** Shared context object for pushRow, so warnings can be summarised. */
type RowCtx = { warnings: string[]; missingSubject: number };

function makeCtx(warnings: string[]): RowCtx {
  return { warnings, missingSubject: 0 };
}

function finaliseWarnings(ctx: RowCtx, questions: ParsedQuestion[]) {
  if (ctx.missingSubject > 0) {
    ctx.warnings.push(
      `${ctx.missingSubject} of ${questions.length} item(s) have no SUBJECT tag — tag them so they show up in the subject drills.`
    );
  }
  return ctx.warnings;
}
