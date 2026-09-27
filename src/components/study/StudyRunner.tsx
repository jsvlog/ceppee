"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fmtDuration } from "@/lib/format";
import { subjectIcon } from "@/lib/exam";
import type { BankQuestion, GradedAnswer, Level, PracticeQuestion, Track } from "@/lib/types";

const LETTERS = ["A", "B", "C", "D"] as const;

type RunnerQuestion = BankQuestion | PracticeQuestion;

function hasKey(q: RunnerQuestion): q is PracticeQuestion {
  return typeof (q as PracticeQuestion).correct_choice === "string";
}

export interface StudyRunnerProps {
  kind: "mock" | "drill" | "flashcards";
  track: Track;
  level: Level;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  backHref: string;
  backLabel?: string;
  /** Label stored on the attempt row, e.g. "CSE Professional — Full Mock Exam". */
  label: string;
  passingPct: number;
  examId?: string | null;
  /** Overrides the attempt row's kind (a timed drill is kind='drill'). */
  attemptKind?: "exam" | "drill" | "flashcards";
  questions: RunnerQuestion[];
  /** Timed papers only. */
  durationMinutes?: number;
}

type Phase = "intro" | "run" | "results";

export default function StudyRunner(props: StudyRunnerProps) {
  const {
    kind, track, level, title, subtitle, description, backHref, backLabel,
    label, passingPct, examId, questions,
  } = props;

  const isMock = kind === "mock";
  const isCards = kind === "flashcards";
  const total = questions.length;
  const totalSeconds = Math.max(1, (props.durationMinutes ?? 0) * 60);

  const [phase, setPhase] = useState<Phase>("intro");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [graded, setGraded] = useState<GradedAnswer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Flashcards
  const [deck, setDeck] = useState<PracticeQuestion[]>(() => questions.filter(hasKey));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [missedAll, setMissedAll] = useState<PracticeQuestion[]>([]);
  const [queue, setQueue] = useState<PracticeQuestion[]>([]);
  const [pass, setPass] = useState(1);

  const submittedRef = useRef(false);
  const supabase = useMemo(() => createClient(), []);

  const answeredCount = Object.keys(answers).length;

  const submitTimed = useCallback(
    async (autoTimedOut = false) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setBusy(true);
      setError(null);

      const ids = isMock ? questions.map((q) => q.id) : Object.keys(answers);
      if (ids.length === 0) {
        setBusy(false);
        submittedRef.current = false;
        setError("Answer at least one item first.");
        return;
      }

      const { data, error: rpcError } = await supabase.rpc("grade_attempt", {
        p_question_ids: ids,
        p_answers: answers,
        p_exam_id: examId ?? null,
        p_kind: props.attemptKind ?? (isMock ? "exam" : "drill"),
        p_label: label,
        p_track: track,
        p_level: level,
        p_seconds: isMock ? Math.max(0, totalSeconds - secondsLeft) : 0,
      });

      if (rpcError) {
        setError(rpcError.message);
        setBusy(false);
        submittedRef.current = false;
        return;
      }

      const rows = (data as GradedAnswer[]) ?? [];
      const order = new Map(questions.map((q, i) => [q.id, i]));
      rows.sort((a, b) => (order.get(a.question_id) ?? 0) - (order.get(b.question_id) ?? 0));
      setGraded(rows);
      setPhase("results");
      setBusy(false);
      if (autoTimedOut) window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [answers, examId, isMock, label, level, questions, secondsLeft, supabase, totalSeconds, track]
  );

  // Countdown — timed papers only
  useEffect(() => {
    if (!isMock || phase !== "run") return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          void submitTimed(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isMock, phase, submitTimed]);

  const recordSelf = useCallback(
    (questionId: string, correct: boolean) => {
      void supabase.rpc("record_answer", { p_question_id: questionId, p_correct: correct });
    },
    [supabase]
  );

  /* ============================== INTRO ============================== */
  if (phase === "intro") {
    return (
      <div className="card relative overflow-hidden p-8 text-center sm:p-10">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#d4af37]/10 blur-2xl" />
        <div className="mb-4 text-5xl">{isMock ? "⏱️" : isCards ? "🃏" : "🎯"}</div>
        <h1 className="mb-2 text-2xl font-black text-[#16331f] sm:text-3xl">{title}</h1>
        {subtitle && <p className="mb-1 text-sm font-semibold text-[#15803d]">{subtitle}</p>}
        {description && <p className="mx-auto mb-6 max-w-lg text-sm text-[#5c7863]">{description}</p>}

        <div className="mx-auto mb-8 mt-4 grid max-w-lg grid-cols-3 gap-3">
          <Stat value={String(isCards ? deck.length : total)} label="Questions" />
          <Stat value={isMock ? `${props.durationMinutes}m` : "∞"} label={isMock ? "Time limit" : "No time limit"} />
          <Stat value={`${passingPct}%`} label="Target" />
        </div>

        <p className="mx-auto mb-8 max-w-md rounded-xl bg-[#dcfce7] px-4 py-3 text-sm text-[#166534]">
          {isMock
            ? "⚠️ Once you start, the clock runs nonstop — just like the real thing. No answers are shown until you submit."
            : isCards
              ? "🃏 Read the question, think of your answer, then flip the card. Items you mark “hindi ko” come back at the end."
              : "🎯 You will see the correct answer and the explanation right after each item."}
        </p>

        <button onClick={() => setPhase("run")} className="btn-primary px-10 py-4 text-base">
          {isMock ? "Start the Exam →" : isCards ? "Start Flashcards →" : "Start Drill →"}
        </button>

        <div className="mt-4">
          <Link href={backHref} className="text-sm text-[#5c7863] hover:text-[#16331f]">
            ← {backLabel ?? "Back to reviewer"}
          </Link>
        </div>
      </div>
    );
  }

  /* ============================== FLASHCARDS ============================== */
  if (isCards && phase === "run") {
    const card = deck[index];
    if (!card) return null;

    return (
      <div>
        <RunnerHeader
          left={`Card ${index + 1} of ${deck.length}`}
          right={<span className="text-[#16331f]">✅ {knownCount} · 🔁 {missedAll.length}</span>}
          note={pass === 2 ? "Balik-aral — the ones you missed" : `${deck.length - index - 1} left`}
          progress={((index + 1) / Math.max(1, deck.length)) * 100}
        />

        <div className="card min-h-[320px] p-6 sm:p-8">
          {card.subject && (
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#94a896]">
              {subjectIcon(track, card.subject)}
              {card.subtopic ? ` · ${card.subtopic}` : card.subject ? ` · ${card.subject}` : ""}
            </p>
          )}
          <h2 className="mb-6 text-lg font-bold leading-relaxed text-[#16331f]">{card.question_text}</h2>

          <div className="space-y-2">
            {LETTERS.map((c) => {
              const isCorrect = revealed && card.correct_choice === c;
              return (
                <div
                  key={c}
                  className={`flex items-start gap-3 rounded-2xl border-2 px-4 py-3 text-sm ${
                    isCorrect
                      ? "border-[#16a34a] bg-[#dcfce7] font-semibold text-[#16331f]"
                      : "border-[#d9e6d3] bg-white text-[#3d5c44]"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                      isCorrect ? "bg-gradient-to-br from-[#16a34a] to-[#d4af37] text-white" : "bg-[#dcfce7] text-[#15803d]"
                    }`}
                  >
                    {c}
                  </span>
                  <span>{card[`choice_${c.toLowerCase()}` as "choice_a"]}</span>
                </div>
              );
            })}
          </div>

          {revealed && card.explanation && (
            <p className="mt-4 rounded-2xl bg-[#dcfce7] px-4 py-3 text-sm text-[#15803d]">💡 {card.explanation}</p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {!revealed ? (
            <button onClick={() => setRevealed(true)} className="btn-primary px-8 py-3.5 text-sm">
              Flip the card — show the answer
            </button>
          ) : (
            <>
              <button
                onClick={() => markCard(true)}
                className="btn-primary px-8 py-3.5 text-sm"
              >
                ✅ Alam ko ito
              </button>
              <button
                onClick={() => markCard(false)}
                className="rounded-xl border-2 border-[#f59e0b] bg-[#fffbeb] px-8 py-3.5 text-sm font-bold text-[#b45309]"
              >
                🔁 Hindi ko — balik-aral
              </button>
            </>
          )}
        </div>
      </div>
    );

    function markCard(knownIt: boolean) {
      recordSelf(card.id, knownIt);
      if (knownIt) setKnownCount((k) => k + 1);
      else {
        if (pass === 1) setMissedAll((m) => [...m, card]);
        if (missedAll.length < 60) setQueue((qq) => [...qq, card]);
      }

      const nextIndex = index + 1;
      if (nextIndex < deck.length) {
        setIndex(nextIndex);
        setRevealed(false);
        return;
      }
      // End of this pass — re-run the missed cards once, then finish.
      if (pass === 1 && queue.length + (knownIt ? 0 : 1) > 0) {
        const retry = knownIt ? queue : [...queue, card];
        setDeck(retry);
        setQueue([]);
        setIndex(0);
        setPass(2);
        setRevealed(false);
        return;
      }
      setPhase("results");
    }
  }

  /* ============================== RESULTS ============================== */
  if (phase === "results") {
    if (isCards) {
      const firstPass = knownCount + missedAll.length;
      const knownPct = firstPass > 0 ? Math.round((knownCount / firstPass) * 100) : 0;
      const good = knownPct >= passingPct;
      return (
        <div>
          <div className="card relative overflow-hidden p-8 text-center sm:p-10">
            <div className="mb-2 text-5xl">{good ? "🎉" : "💪"}</div>
            <h1 className="mb-1 text-2xl font-black text-[#16331f] sm:text-3xl">
              {missedAll.length === 0 ? "Perfect set!" : good ? "Solid recall!" : "Keep drilling these"}
            </h1>
            <p className="mb-6 text-sm text-[#5c7863]">
              Cards you knew on the first flip — the honest measure of what stuck.
            </p>
            <Ring pct={knownPct} label={`${knownCount}/${firstPass}`} good={good} />
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href={backHref} className="btn-primary px-6 py-3 text-sm">
                {backLabel ?? "Back to reviewer"}
              </Link>
              <Link
                href={`/study/${track.toLowerCase()}/mistakes?level=${level}`}
                className="rounded-xl border border-[#d9e6d3] bg-white px-6 py-3 text-sm font-semibold text-[#3d5c44] transition hover:border-[#d4af37]"
              >
                🔁 Retry my mistakes
              </Link>
            </div>
          </div>

          {missedAll.length > 0 && (
            <>
              <h2 className="mb-4 mt-10 text-xl font-bold text-[#16331f]">
                🔁 Cards to review again ({missedAll.length})
              </h2>
              <div className="space-y-4">
                {missedAll.map((c) => (
                  <div key={c.id} className="card border-[#fde68a] p-5">
                    <p className="mb-2 font-bold text-[#16331f]">{c.question_text}</p>
                    <p className="text-sm font-semibold text-[#166534]">
                      ✓ {c.correct_choice}. {c[`choice_${c.correct_choice.toLowerCase()}` as "choice_a"]}
                    </p>
                    {c.explanation && (
                      <p className="mt-2 rounded-xl bg-[#dcfce7] px-4 py-3 text-sm text-[#15803d]">💡 {c.explanation}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      );
    }

    const score = graded.filter((g) => g.ok).length;
    const pct = graded.length > 0 ? Math.round((score / graded.length) * 100) : 0;
    const passed = pct >= passingPct;
    const bySubject = groupBySubject(graded);

    return (
      <div>
        <div className="card relative overflow-hidden p-8 text-center sm:p-10">
          <div className="absolute -left-12 -top-12 h-40 w-40 rounded-full bg-[#22c55e]/10 blur-2xl" />
          <div className="mb-2 text-5xl">{passed ? "🎉" : "💪"}</div>
          <h1 className="mb-1 text-2xl font-black text-[#16331f] sm:text-3xl">
            {passed ? "Great job!" : "You'll get it next round!"}
          </h1>
          <p className="mb-6 text-sm text-[#5c7863]">
            Target: {passingPct}%{track === "CSE" ? " on the real CSE" : " average on the real LET"}
          </p>

          <Ring pct={pct} label={`${score}/${graded.length}`} good={passed} />

          {isMock && (
            <p className="mb-2 mt-4 text-sm text-[#5c7863]">
              Time used: <strong className="text-[#16331f]">{fmtDuration(totalSeconds - secondsLeft)}</strong>
            </p>
          )}

          {bySubject.length > 1 && (
            <div className="mx-auto mt-6 max-w-lg space-y-3 text-left">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#5c7863]">By section</h3>
              {bySubject.map((s) => (
                <div key={s.subject} className="rounded-xl border border-[#d9e6d3] p-3">
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-semibold text-[#16331f]">
                      {subjectIcon(track, s.subject)} {s.subject}
                    </span>
                    <span className="text-[#5c7863]">
                      {s.correct}/{s.total} · {s.pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#d9e6d3]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${s.pct}%`,
                        background: s.pct >= 80 ? "#16a34a" : s.pct >= 60 ? "#eab308" : "#ef4444",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={backHref} className="btn-primary px-6 py-3 text-sm">
              {backLabel ?? "Back to reviewer"}
            </Link>
            <Link
              href={`/study/${track.toLowerCase()}/mistakes?level=${level}`}
              className="rounded-xl border border-[#d9e6d3] bg-white px-6 py-3 text-sm font-semibold text-[#3d5c44] transition hover:border-[#d4af37]"
            >
              🔁 Retry my mistakes
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-[#d9e6d3] bg-white px-6 py-3 text-sm font-semibold text-[#3d5c44]"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <h2 className="mb-4 mt-10 text-xl font-bold text-[#16331f]">📝 Review your answers</h2>
        <div className="space-y-4">
          {graded.map((g, i) => (
            <div key={g.question_id} className={`card p-5 sm:p-6 ${g.ok ? "border-[#bbf7d0]" : "border-red-200"}`}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <span className="font-bold text-[#16331f]">
                  {i + 1}. {g.question_text}
                </span>
                <span className={`badge ${g.ok ? "badge-approved" : "badge-rejected"}`}>{g.ok ? "✓" : "✕"}</span>
              </div>
              {g.subject && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#94a896]">
                  {subjectIcon(track, g.subject)}
                  {g.subtopic ? ` · ${g.subtopic}` : ` · ${g.subject}`}
                </p>
              )}
              <div className="space-y-1.5 text-sm">
                {LETTERS.map((c) => {
                  const isCorrect = g.correct_choice === c;
                  const isChosen = g.chosen === c;
                  const text = g[`choice_${c.toLowerCase()}` as "choice_a"];
                  return (
                    <div
                      key={c}
                      className={`rounded-lg px-3 py-2 ${
                        isCorrect
                          ? "bg-[#dcfce7] font-semibold text-[#166534]"
                          : isChosen
                            ? "bg-[#fee2e2] text-[#991b1b]"
                            : "text-[#5c7863]"
                      }`}
                    >
                      {c}. {text}
                      {isCorrect && " ✓"}
                      {isChosen && !isCorrect && " ✕ (your answer)"}
                    </div>
                  );
                })}
                {!g.chosen && <div className="rounded-lg bg-[#fef9c3] px-3 py-2 text-xs text-[#b45309]">You left this blank.</div>}
              </div>
              {g.explanation && (
                <p className="mt-3 rounded-xl bg-[#dcfce7] px-4 py-3 text-sm text-[#15803d]">💡 {g.explanation}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ============================== DRILL / MOCK RUNNING ============================== */
  const q = questions[current];
  if (!q) return null;
  const chosen = answers[q.id];
  const answeredThis = Boolean(chosen);
  const key = hasKey(q) ? q : null;
  const isLast = current >= total - 1;
  const timeCritical = isMock && secondsLeft < 300;

  return (
    <div>
      <RunnerHeader
        left={`Q${current + 1} of ${total}`}
        right={
          isMock ? (
            <span className={timeCritical ? "animate-pulse text-red-600" : "text-[#16331f]"}>⏱ {fmtDuration(secondsLeft)}</span>
          ) : (
            <span className="text-[#166534]">🎯 No timer</span>
          )
        }
        note={`${answeredCount}/${total} answered`}
        progress={((current + 1) / Math.max(1, total)) * 100}
      />

      <div className="card p-6 sm:p-8">
        {q.subject && (
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#94a896]">
            {subjectIcon(track, q.subject)}
            {q.subtopic ? ` · ${q.subtopic}` : ` · ${q.subject}`}
          </p>
        )}
        <h2 className="mb-6 text-lg font-bold leading-relaxed text-[#16331f]">
          {current + 1}. {q.question_text}
        </h2>

        <div className="space-y-3">
          {LETTERS.map((c) => {
            const selected = chosen === c;
            const showCorrect = !isMock && answeredThis && key?.correct_choice === c;
            const showWrong = !isMock && answeredThis && selected && key && key.correct_choice !== c;
            return (
              <button
                key={c}
                onClick={() => {
                  if (isMock) setAnswers((a) => ({ ...a, [q.id]: c }));
                  else if (!answeredThis) setAnswers((a) => ({ ...a, [q.id]: c }));
                }}
                className={`flex w-full items-center gap-3 rounded-2xl border-2 px-5 py-4 text-left text-sm transition ${
                  showCorrect
                    ? "border-[#16a34a] bg-[#dcfce7] font-semibold text-[#16331f]"
                    : showWrong
                      ? "border-red-300 bg-[#fee2e2] text-[#991b1b]"
                      : selected
                        ? "border-[#16a34a] bg-[#dcfce7] font-semibold text-[#16331f]"
                        : "border-[#d9e6d3] bg-white text-[#3d5c44] hover:border-[#d4af37]"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold ${
                    selected || showCorrect
                      ? "bg-gradient-to-br from-[#16a34a] to-[#d4af37] text-white"
                      : "bg-[#dcfce7] text-[#15803d]"
                  }`}
                >
                  {c}
                </span>
                <span className="flex-1">{q[`choice_${c.toLowerCase()}` as "choice_a"]}</span>
                {showCorrect && <span className="text-[#166534]">✓</span>}
                {showWrong && <span className="text-[#991b1b]">✕</span>}
              </button>
            );
          })}
        </div>

        {!isMock && answeredThis && key && (
          <div className="mt-5">
            <div
              className={`rounded-2xl px-5 py-4 text-sm ${
                chosen === key.correct_choice ? "bg-[#dcfce7] text-[#166534]" : "bg-[#fee2e2] text-[#991b1b]"
              }`}
            >
              <strong>
                {chosen === key.correct_choice ? "✓ Tama!" : `✕ Mali — the answer is ${key.correct_choice}.`}
              </strong>
            </div>
            {key.explanation && (
              <p className="mt-3 rounded-2xl bg-[#dcfce7] px-5 py-4 text-sm text-[#15803d]">💡 {key.explanation}</p>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-4 rounded-xl bg-[#fee2e2] px-4 py-3 text-sm text-[#991b1b]">⚠️ {error}</p>}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="rounded-xl border border-[#d9e6d3] bg-white px-6 py-3 text-sm font-semibold text-[#3d5c44] disabled:opacity-40"
        >
          ← Previous
        </button>

        {isLast ? (
          <button onClick={() => void submitTimed()} disabled={busy} className="btn-primary px-8 py-3 text-sm disabled:opacity-60">
            {busy ? "Checking…" : isMock ? "Submit Exam ✓" : "Finish & See Score ✓"}
          </button>
        ) : (
          <button onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))} className="btn-primary px-8 py-3 text-sm">
            {!isMock && !answeredThis ? "Skip →" : "Next →"}
          </button>
        )}
      </div>

      {isLast && answeredCount < total && (
        <p className="mt-3 text-center text-xs text-[#f59e0b]">
          ⚠️ {total - answeredCount} item{total - answeredCount > 1 ? "s" : ""} still unanswered
          {isMock ? "" : " — they will not be counted"} — tap a number below to go back.
        </p>
      )}

      <div className="card mt-6 flex flex-wrap items-center justify-center gap-2 p-4">
        {questions.map((qq, i) => (
          <button
            key={qq.id}
            onClick={() => setCurrent(i)}
            className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
              i === current
                ? "bg-[#16331f] text-white"
                : answers[qq.id]
                  ? "bg-[#dcfce7] text-[#166534]"
                  : "bg-[#d9e6d3] text-[#94a896] hover:bg-[#dcfce7]"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================== helpers ============================== */

function groupBySubject(rows: GradedAnswer[]) {
  const map = new Map<string, { subject: string; total: number; correct: number; pct: number }>();
  rows.forEach((r) => {
    const key = r.subject ?? "General";
    const entry = map.get(key) ?? { subject: key, total: 0, correct: 0, pct: 0 };
    entry.total++;
    if (r.ok) entry.correct++;
    map.set(key, entry);
  });
  return [...map.values()]
    .map((e) => ({ ...e, pct: Math.round((e.correct / e.total) * 100) }))
    .sort((a, b) => a.pct - b.pct);
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-[#dcfce7] p-4">
      <div className="text-xl font-black text-[#16331f] sm:text-2xl">{value}</div>
      <div className="text-xs text-[#15803d]">{label}</div>
    </div>
  );
}

function Ring({ pct, label, good }: { pct: number; label: string; good: boolean }) {
  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r="52" fill="none" stroke="#d9e6d3" strokeWidth="12" />
        <circle
          cx="60" cy="60" r="52" fill="none"
          stroke={good ? "#22c55e" : "#f59e0b"}
          strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 326.7} 326.7`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-[#16331f]">{pct}%</span>
        <span className="text-xs text-[#5c7863]">{label}</span>
      </div>
    </div>
  );
}

function RunnerHeader({
  left, right, note, progress,
}: {
  left: string;
  right: React.ReactNode;
  note?: string;
  progress: number;
}) {
  return (
    <>
      <div className="card sticky top-20 z-30 mb-4 flex items-center justify-between gap-3 p-4">
        <div className="text-sm font-semibold text-[#5c7863]">{left}</div>
        <div className="rounded-xl bg-[#dcfce7] px-4 py-1.5 font-mono text-sm font-bold">{right}</div>
        <div className="text-right text-xs text-[#5c7863]">{note}</div>
      </div>
      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-[#d9e6d3]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#16a34a] to-[#d4af37] transition-all"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
    </>
  );
}
