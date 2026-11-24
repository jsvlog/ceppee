"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fmtDuration } from "@/lib/format";
import { subjectIcon } from "@/lib/exam";
import { comboMultiplier, starsFor } from "@/lib/game";
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
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [graded, setGraded] = useState<GradedAnswer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<"all" | "wrong">("all");

  // Game state — drills and flashcards. A timed mock is scored by the server.
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [lastXpGain, setLastXpGain] = useState<number | null>(null);

  // Flashcards
  const [deck, setDeck] = useState<PracticeQuestion[]>(() => questions.filter(hasKey));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [missedAll, setMissedAll] = useState<PracticeQuestion[]>([]);
  const [queue, setQueue] = useState<PracticeQuestion[]>([]);
  const [pass, setPass] = useState(1);

  const submittedRef = useRef(false);
  const runnerTopRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  // Scroll the question card cleanly into view whenever the question or phase advances
  useEffect(() => {
    if (phase !== "run") return;
    if (runnerTopRef.current) {
      const rect = runnerTopRef.current.getBoundingClientRect();
      // If the top of the runner is scrolled above the sticky utility bar (56px), scroll smoothly up
      if (rect.top < 56 || window.scrollY > 80) {
        const y = Math.max(0, window.scrollY + rect.top - 68);
        window.scrollTo({ top: y, behavior: "smooth" });
      }
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [current, index, phase]);

  const answeredCount = Object.keys(answers).length;

  const recordSelf = useCallback(
    (questionId: string, correct: boolean) => {
      // Instant mastery update that survives the student leaving mid-drill.
      void supabase.rpc("record_answer", { p_question_id: questionId, p_correct: correct });
    },
    [supabase]
  );

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
      const right = rows.filter((r) => r.ok).length;
      const pct = rows.length > 0 ? Math.round((right / rows.length) * 100) : 0;

      // A mock is scored by RPC, so its XP is awarded here from the graded rows:
      // 10 per correct answer plus 150 for clearing the passing mark.
      if (isMock) setXpEarned(right * 10 + (pct >= passingPct ? 150 : 0));

      setGraded(rows);
      setPhase("results");
      setBusy(false);
      if (autoTimedOut) window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [answers, examId, isMock, label, level, passingPct, props.attemptKind, questions, secondsLeft, supabase, totalSeconds, track]
  );

  // The countdown must not be re-created on every tick, so it calls through a ref.
  const submitRef = useRef(submitTimed);
  submitRef.current = submitTimed;

  useEffect(() => {
    if (!isMock || phase !== "run") return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [isMock, phase]);

  useEffect(() => {
    if (!isMock || phase !== "run" || secondsLeft > 0) return;
    void submitRef.current(true);
  }, [isMock, phase, secondsLeft]);

  const chooseAnswer = useCallback(
    (q: RunnerQuestion, letter: (typeof LETTERS)[number]) => {
      if (isMock) {
        setAnswers((a) => ({ ...a, [q.id]: letter }));
        return;
      }
      if (answers[q.id]) return; // instant-feedback modes lock the first choice
      setAnswers((a) => ({ ...a, [q.id]: letter }));

      if (hasKey(q)) {
        const isRight = q.correct_choice === letter;
        recordSelf(q.id, isRight);
        if (isRight) {
          const next = streak + 1;
          const gain = 10 * comboMultiplier(next);
          setStreak(next);
          setBestStreak((b) => Math.max(b, next));
          setXpEarned((x) => x + gain);
          setLastXpGain(gain);
        } else {
          setStreak(0);
          setLastXpGain(null);
        }
      }
    },
    [answers, isMock, recordSelf, streak]
  );

  // Hotkeys: A-D / 1-4 answer, arrows move. Ignored while typing in a field.
  useEffect(() => {
    if (phase !== "run" || isCards) return;
    const q = questions[current];
    if (!q) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      const k = e.key.toUpperCase();
      if (k === "A" || k === "1") chooseAnswer(q, "A");
      else if (k === "B" || k === "2") chooseAnswer(q, "B");
      else if (k === "C" || k === "3") chooseAnswer(q, "C");
      else if (k === "D" || k === "4") chooseAnswer(q, "D");
      else if (e.key === "ArrowRight" && current < total - 1) setCurrent((c) => c + 1);
      else if (e.key === "ArrowLeft" && current > 0) setCurrent((c) => c - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, isCards, questions, current, total, chooseAnswer]);

  /* ============================== INTRO ============================== */
  if (phase === "intro") {
    return (
      <div className="game-card relative overflow-hidden p-8 text-center sm:p-10">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#d4af37]/15 blur-2xl" />
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#dcfce7] px-4 py-1 text-xs font-extrabold uppercase tracking-wider text-[#15803d]">
          {isMock ? "⏱️ Timed stage" : isCards ? "🃏 Flashcard blitz" : "🎯 Practice arena"}
        </div>
        <h1 className="mb-2 text-2xl font-black text-[#16331f] sm:text-3xl">{title}</h1>
        {subtitle && <p className="mb-1 text-sm font-bold text-[#15803d]">{subtitle}</p>}
        {description && <p className="mx-auto mb-6 max-w-lg text-sm text-[#5c7863]">{description}</p>}

        <div className="mx-auto mb-8 mt-4 grid max-w-lg grid-cols-3 gap-3">
          <Stat value={String(isCards ? deck.length : total)} label="Questions" />
          <Stat value={isMock ? `${props.durationMinutes}m` : "∞"} label={isMock ? "Time limit" : "Untimed"} />
          <Stat value={`${passingPct}%`} label="Clear target" />
        </div>

        <p className="mx-auto mb-8 max-w-md rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm text-[#166534]">
          {isMock
            ? "⚠️ The clock does not stop. Flag tricky items with 🚩 and come back to them — clearing the mark pays a +150 XP bonus."
            : isCards
              ? "🃏 Read the card, think of your answer, then flip. Cards you mark “hindi ko” come back at the end."
              : "🎯 Right answers in a row build a combo: 3 in a row = 2× XP, 5 = 3×, 10 = 5×. Keys A–D or 1–4 work too."}
        </p>

        <button onClick={() => setPhase("run")} className="btn-arcade-green px-10 py-4 text-base">
          {isMock ? "⚔️ Start the paper" : isCards ? "🃏 Deal the cards" : "⚡ Enter the arena"} →
        </button>

        <div className="mt-5">
          <Link href={backHref} className="text-sm font-bold text-[#5c7863] hover:text-[#16331f]">
            ← {backLabel ?? "Back to the campaign"}
          </Link>
        </div>
      </div>
    );
  }

  /* ============================== FLASHCARDS ============================== */
  if (isCards && phase === "run") {
    const card = deck[index];
    if (!card) return null;

    const markCard = (knownIt: boolean) => {
      recordSelf(card.id, knownIt);
      if (knownIt) {
        const next = streak + 1;
        setStreak(next);
        setBestStreak((b) => Math.max(b, next));
        setXpEarned((x) => x + 10 * comboMultiplier(next));
        setKnownCount((k) => k + 1);
      } else {
        setStreak(0);
        if (pass === 1) setMissedAll((m) => [...m, card]);
        if (missedAll.length < 60) setQueue((qq) => [...qq, card]);
      }

      const nextIndex = index + 1;
      if (nextIndex < deck.length) {
        setIndex(nextIndex);
        setRevealed(false);
        return;
      }
      // End of a pass: replay the missed cards once, then finish.
      if (pass === 1 && queue.length + (knownIt ? 0 : 1) > 0) {
        setDeck(knownIt ? queue : [...queue, card]);
        setQueue([]);
        setIndex(0);
        setPass(2);
        setRevealed(false);
        return;
      }
      setPhase("results");
    };

    return (
      <div ref={runnerTopRef}>
        <RunnerHeader
          left={`Card ${index + 1} / ${deck.length}`}
          center={
            <div className="flex items-center gap-2 text-xs font-extrabold">
              <span className="rounded-lg bg-[#fef9c3] px-2.5 py-1 text-[#b45309]">⚡ {xpEarned} XP</span>
              {streak > 0 && <span className="rounded-lg bg-[#dcfce7] px-2.5 py-1 text-[#15803d]">🔥 {streak}</span>}
            </div>
          }
          right={<span className="text-xs font-extrabold text-[#16331f]">✅ {knownCount} · 🔁 {missedAll.length}</span>}
          progress={((index + 1) / Math.max(1, deck.length)) * 100}
        />

        <div className="flip-scene">
          <div className={`flip-card ${revealed ? "is-flipped" : ""}`}>
            {/* FRONT — question + options, nothing revealed */}
            <div className="flip-face game-card min-h-[340px] p-6 sm:p-8" aria-hidden={revealed}>
              <div className="mb-3 flex items-center justify-between gap-2">
                {card.subject && (
                  <p className="text-xs font-extrabold uppercase tracking-wide text-[#94a896]">
                    {subjectIcon(track, card.subject)}
                    {card.subtopic ? ` · ${card.subtopic}` : ` · ${card.subject}`}
                  </p>
                )}
                <span className="shrink-0 rounded-full bg-[#fef9c3] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#b45309]">
                  front
                </span>
              </div>
              <h2 className="mb-6 text-lg font-black leading-relaxed text-[#16331f]">{card.question_text}</h2>

              <div className="space-y-2.5">
                {LETTERS.map((c) => (
                  <div
                    key={c}
                    className="flex items-start gap-3 rounded-2xl border-2 border-[#d9e6d3] bg-white px-4 py-3 text-sm text-[#3d5c44]"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#dcfce7] text-xs font-black text-[#15803d]">
                      {c}
                    </span>
                    <span>{card[`choice_${c.toLowerCase()}` as "choice_a"]}</span>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-center text-xs font-semibold text-[#94a896]">
                🤔 Think of your answer first — then flip the card.
              </p>
            </div>

            {/* BACK — the answer, mirrored so it reads correctly after the flip */}
            <div className="flip-face flip-face-back game-card min-h-[340px] border-[#86efac] bg-[#f7fdf9] p-6 sm:p-8" aria-hidden={!revealed}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-extrabold uppercase tracking-widest text-[#15803d]">Answer</p>
                <span className="shrink-0 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#166534]">
                  back
                </span>
              </div>

              <p className="mb-4 text-sm font-semibold leading-relaxed text-[#3d5c44]">{card.question_text}</p>

              <div className="flex items-start gap-3 rounded-2xl border-2 border-[#16a34a] bg-[#dcfce7] px-4 py-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#16a34a] to-[#d4af37] text-base font-black text-white">
                  {card.correct_choice}
                </span>
                <span className="pt-1 text-base font-black leading-snug text-[#16331f]">
                  {card[`choice_${card.correct_choice.toLowerCase()}` as "choice_a"]}
                </span>
              </div>

              {card.explanation && (
                <p className="mt-4 rounded-2xl border border-[#86efac] bg-white px-4 py-3 text-sm leading-relaxed text-[#15803d]">
                  💡 {card.explanation}
                </p>
              )}

              <p className="mt-5 text-center text-xs font-semibold text-[#94a896]">
                Be honest — mark it below so the ones you miss come back.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {!revealed ? (
            <button onClick={() => setRevealed(true)} className="btn-arcade-gold px-8 py-3.5 text-sm">
              🃏 Flip the card
            </button>
          ) : (
            <>
              <button onClick={() => markCard(true)} className="btn-arcade-green px-8 py-3.5 text-sm">
                ✅ Alam ko ito (+{10 * comboMultiplier(streak + 1)} XP)
              </button>
              <button
                onClick={() => markCard(false)}
                className="btn-arcade-surface border-[#f59e0b] bg-[#fffbeb] px-8 py-3.5 text-sm text-[#b45309]"
              >
                🔁 Hindi ko — balik-aral
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ============================== RESULTS ============================== */
  if (phase === "results") {
    if (isCards) {
      const firstPass = knownCount + missedAll.length;
      const knownPct = firstPass > 0 ? Math.round((knownCount / firstPass) * 100) : 0;
      const good = knownPct >= passingPct;
      return (
        <div>
          <div className="game-card relative overflow-hidden p-8 text-center sm:p-10">
            <div className="mb-2 text-5xl">{missedAll.length === 0 ? "🏆" : good ? "🎉" : "💪"}</div>
            <h1 className="mb-1 text-2xl font-black text-[#16331f] sm:text-3xl">
              {missedAll.length === 0 ? "Flawless deck!" : good ? "Deck cleared!" : "Keep drilling these"}
            </h1>
            <p className="mb-4 text-sm font-bold text-[#15803d]">
              ⚡ +{xpEarned} XP{bestStreak > 1 ? ` · 🔥 best combo ${bestStreak}` : ""}
            </p>
            <Ring pct={knownPct} label={`${knownCount}/${firstPass}`} good={good} />
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href={backHref} className="btn-arcade-green px-6 py-3 text-sm">
                {backLabel ?? "Back to the campaign"}
              </Link>
              <Link
                href={`/study/${track.toLowerCase()}/mistakes?level=${level}`}
                className="btn-arcade-surface px-6 py-3 text-sm"
              >
                🔁 Retry my mistakes
              </Link>
            </div>
          </div>

          {missedAll.length > 0 && (
            <>
              <h2 className="mb-4 mt-10 text-xl font-black text-[#16331f]">
                🔁 Cards to review again ({missedAll.length})
              </h2>
              <div className="space-y-4">
                {missedAll.map((c) => (
                  <div key={c.id} className="game-card border-[#fde68a] p-5">
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
    const wrongCount = graded.length - score;
    const pct = graded.length > 0 ? Math.round((score / graded.length) * 100) : 0;
    const passed = pct >= passingPct;
    const stars = starsFor(pct, passingPct);
    const bySubject = groupBySubject(graded);
    const shown = reviewFilter === "wrong" ? graded.filter((g) => !g.ok) : graded;

    return (
      <div>
        <div className="game-card relative overflow-hidden p-8 text-center sm:p-10">
          <div className="absolute -left-12 -top-12 h-40 w-40 rounded-full bg-[#22c55e]/10 blur-2xl" />
          <div className="mb-1 text-3xl" aria-label={`${stars} of 3 stars`}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= stars ? "text-[#eab308]" : "text-[#d9e6d3]"}>
                ★
              </span>
            ))}
          </div>
          <h1 className="mb-1 text-2xl font-black text-[#16331f] sm:text-3xl">
            {passed ? "Stage cleared! 🎉" : "Not cleared yet 💪"}
          </h1>
          <p className="mb-4 text-sm font-bold text-[#15803d]">⚡ +{xpEarned} XP</p>

          <Ring pct={pct} label={`${score}/${graded.length}`} good={passed} />

          {isMock && (
            <p className="mb-2 mt-4 text-sm text-[#5c7863]">
              Time used: <strong className="text-[#16331f]">{fmtDuration(totalSeconds - secondsLeft)}</strong>
            </p>
          )}

          {bySubject.length > 1 && (
            <div className="mx-auto mt-6 max-w-lg space-y-3 text-left">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#5c7863]">By section</h3>
              {bySubject.map((s) => (
                <div key={s.subject} className="rounded-xl border border-[#d9e6d3] p-3">
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-bold text-[#16331f]">
                      {subjectIcon(track, s.subject)} {s.subject}
                    </span>
                    <span className="text-xs font-bold text-[#5c7863]">
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
            <Link href={backHref} className="btn-arcade-green px-6 py-3 text-sm">
              {backLabel ?? "Back to the campaign"}
            </Link>
            <Link
              href={`/study/${track.toLowerCase()}/mistakes?level=${level}`}
              className="btn-arcade-surface px-6 py-3 text-sm"
            >
              🔁 Retry my mistakes
            </Link>
            <Link href="/dashboard" className="btn-arcade-surface px-6 py-3 text-sm">
              Dashboard
            </Link>
          </div>
        </div>

        <div className="mb-4 mt-10 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black text-[#16331f]">📝 Answer debrief</h2>
          {wrongCount > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReviewFilter("all")}
                aria-pressed={reviewFilter === "all"}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-extrabold ${
                  reviewFilter === "all" ? "bg-[#16331f] text-white" : "border border-[#d9e6d3] bg-white text-[#3d5c44]"
                }`}
              >
                All {graded.length}
              </button>
              <button
                type="button"
                onClick={() => setReviewFilter("wrong")}
                aria-pressed={reviewFilter === "wrong"}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-extrabold ${
                  reviewFilter === "wrong" ? "bg-[#991b1b] text-white" : "border border-[#d9e6d3] bg-white text-[#991b1b]"
                }`}
              >
                Mistakes only {wrongCount}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {shown.map((g, i) => (
            <div key={g.question_id} className={`game-card p-5 sm:p-6 ${g.ok ? "border-[#bbf7d0]" : "border-red-200"}`}>
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
                {!g.chosen && (
                  <div className="rounded-lg bg-[#fef9c3] px-3 py-2 text-xs text-[#b45309]">You left this blank.</div>
                )}
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

  /* ============================== RUNNING ============================== */
  const q = questions[current];
  if (!q) return null;
  const chosen = answers[q.id];
  const answeredThis = Boolean(chosen);
  const key = hasKey(q) ? q : null;
  const isLast = current >= total - 1;
  const timeCritical = isMock && secondsLeft < 300;
  const isFlagged = Boolean(flagged[q.id]);

  // A 9-item window around the current question keeps the strip readable instead of
  // dumping 150 tiny buttons under every item (the full grid is one tap away).
  const winStart = Math.max(0, Math.min(current - 4, total - 9));
  const win = questions.slice(winStart, winStart + 9);

  return (
    <div ref={runnerTopRef}>
      <RunnerHeader
        left={`Q${current + 1} / ${total}`}
        center={
          isMock ? (
            <span
              className={`font-mono text-sm font-black ${timeCritical ? "animate-pulse text-red-600" : "text-[#16331f]"}`}
            >
              ⏱ {fmtDuration(secondsLeft)}
            </span>
          ) : (
            <div className="flex items-center gap-2 text-xs font-extrabold">
              <span className="rounded-lg bg-[#fef9c3] px-2.5 py-1 text-[#b45309]">⚡ {xpEarned} XP</span>
              {streak > 0 && (
                <span className="animate-pop rounded-lg bg-[#dcfce7] px-2.5 py-1 text-[#15803d]">
                  🔥 {streak} · {comboMultiplier(streak)}×
                </span>
              )}
            </div>
          )
        }
        right={
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-bold text-[#5c7863] sm:inline">
              {answeredCount}/{total}
            </span>
            <button
              type="button"
              onClick={() => setMapOpen((o) => !o)}
              aria-expanded={mapOpen}
              className="rounded-xl border border-[#d9e6d3] bg-white px-2.5 py-1 text-xs font-extrabold text-[#16331f] hover:border-[#d4af37]"
            >
              🗺️ {mapOpen ? "hide" : "map"}
            </button>
          </div>
        }
        progress={((current + 1) / Math.max(1, total)) * 100}
      />

      {mapOpen && (
        <div className="game-card animate-pop mb-4 p-4">
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-[#5c7863]">
            <span>Jump to any question · {answeredCount} answered</span>
            <button type="button" onClick={() => setMapOpen(false)} className="font-extrabold text-[#16331f]">
              Close ✕
            </button>
          </div>
          <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto p-1">
            {questions.map((qq, i) => (
              <button
                key={qq.id}
                type="button"
                onClick={() => {
                  setCurrent(i);
                  setMapOpen(false);
                }}
                className={`h-8 w-8 rounded-lg text-xs font-extrabold transition ${
                  i === current
                    ? "bg-[#16331f] text-white"
                    : flagged[qq.id]
                      ? "bg-[#fef9c3] text-[#b45309] ring-1 ring-[#ca8a04]"
                      : answers[qq.id]
                        ? "bg-[#dcfce7] text-[#166534]"
                        : "bg-[#eef4ea] text-[#5c7863]"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="game-card p-5 sm:p-6">
        <div className="mb-2.5 flex items-start justify-between gap-2">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[#94a896]">
            {q.subject ? `${subjectIcon(track, q.subject)} ${q.subtopic ?? q.subject}` : "Question"}
          </p>
          <button
            type="button"
            onClick={() => setFlagged((f) => ({ ...f, [q.id]: !f[q.id] }))}
            aria-pressed={isFlagged}
            className={`shrink-0 rounded-xl px-2.5 py-1 text-xs font-bold transition ${
              isFlagged ? "bg-[#fef9c3] text-[#b45309]" : "text-[#94a896] hover:bg-[#f6faf4]"
            }`}
          >
            🚩 {isFlagged ? "flagged" : "flag"}
          </button>
        </div>

        <h2 className="mb-4 text-base font-black leading-snug text-[#16331f] sm:text-lg">
          {current + 1}. {q.question_text}
        </h2>

        <div className="space-y-2">
          {LETTERS.map((c) => {
            const selected = chosen === c;
            const showCorrect = !isMock && answeredThis && key?.correct_choice === c;
            const showWrong = !isMock && answeredThis && selected && key && key.correct_choice !== c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => chooseAnswer(q, c)}
                aria-pressed={selected}
                className={`flex w-full items-center gap-3 rounded-2xl border-2 border-b-4 px-4 py-3 text-left text-sm transition ${
                  showCorrect
                    ? "animate-pop border-[#16a34a] bg-[#dcfce7] font-bold text-[#16331f]"
                    : showWrong
                      ? "animate-shake border-red-400 bg-[#fee2e2] font-semibold text-[#991b1b]"
                      : selected
                        ? "border-[#16a34a] bg-[#dcfce7] font-bold text-[#16331f]"
                        : "border-[#d9e6d3] bg-white text-[#3d5c44] hover:border-[#d4af37]"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-black ${
                    selected || showCorrect
                      ? "bg-gradient-to-br from-[#16a34a] to-[#d4af37] text-white"
                      : "bg-[#dcfce7] text-[#15803d]"
                  }`}
                >
                  {c}
                </span>
                <span className="flex-1 leading-snug">{q[`choice_${c.toLowerCase()}` as "choice_a"]}</span>
                {showCorrect && <span className="font-black text-[#166534]">✓</span>}
                {showWrong && <span className="font-black text-[#991b1b]">✕</span>}
              </button>
            );
          })}
        </div>

        {!isMock && answeredThis && key && (
          <div className="animate-pop mt-4">
            <div
              className={`flex items-center justify-between rounded-2xl px-4 py-2.5 text-sm font-extrabold ${
                chosen === key.correct_choice ? "bg-[#dcfce7] text-[#166534]" : "bg-[#fee2e2] text-[#991b1b]"
              }`}
            >
              <span>
                {chosen === key.correct_choice
                  ? `✓ Tama!${streak >= 3 ? ` 🔥 ${streak} in a row` : ""}`
                  : `✕ Mali — the answer is ${key.correct_choice}.`}
              </span>
              {chosen === key.correct_choice && lastXpGain && (
                <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs text-[#15803d]">+{lastXpGain} XP</span>
              )}
            </div>
            {key.explanation && (
              <p className="mt-2.5 rounded-2xl border border-[#86efac] bg-[#f0fdf4] px-4 py-3 text-sm leading-relaxed text-[#15803d]">
                💡 {key.explanation}
              </p>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-3 rounded-xl bg-[#fee2e2] px-4 py-2.5 text-sm text-[#991b1b]">⚠️ {error}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="btn-arcade-surface px-5 py-3 text-sm disabled:opacity-40"
        >
          ← Prev
        </button>

        <div className="hidden items-center gap-1.5 sm:flex">
          {win.map((qq, idx) => {
            const real = winStart + idx;
            return (
              <button
                key={qq.id}
                type="button"
                onClick={() => setCurrent(real)}
                className={`h-8 w-8 rounded-lg text-xs font-extrabold transition ${
                  real === current
                    ? "bg-[#16331f] text-white"
                    : answers[qq.id]
                      ? "bg-[#dcfce7] text-[#166534]"
                      : "bg-[#eef4ea] text-[#5c7863]"
                }`}
              >
                {real + 1}
              </button>
            );
          })}
        </div>

        {isLast ? (
          <button
            type="button"
            onClick={() => void submitTimed()}
            disabled={busy}
            className="btn-arcade-gold px-8 py-3 text-sm disabled:opacity-60"
          >
            {busy ? "Scoring…" : isMock ? "🏁 Submit paper ✓" : "🏆 Finish & claim XP ✓"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))}
            className="btn-arcade-green px-8 py-3 text-sm"
          >
            {!isMock && !answeredThis ? "Skip →" : "Next →"}
          </button>
        )}
      </div>

      {isLast && answeredCount < total && (
        <p className="mt-3 text-center text-xs font-bold text-[#f59e0b]">
          ⚠️ {total - answeredCount} item{total - answeredCount > 1 ? "s" : ""} still unanswered
          {isMock ? "" : " — they will not be counted"} — tap a number above to go back.
        </p>
      )}
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
      <div className="text-xs font-bold text-[#15803d]">{label}</div>
    </div>
  );
}

function Ring({ pct, label, good }: { pct: number; label: string; good: boolean }) {
  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r="52" fill="none" stroke="#d9e6d3" strokeWidth="12" />
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke={good ? "#22c55e" : "#f59e0b"}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 326.7} 326.7`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-[#16331f]">{pct}%</span>
        <span className="text-xs font-bold text-[#5c7863]">{label}</span>
      </div>
    </div>
  );
}

function RunnerHeader({
  left,
  center,
  right,
  progress,
}: {
  left: string;
  center: React.ReactNode;
  right?: React.ReactNode;
  progress: number;
}) {
  return (
    <>
      <div className="game-card sticky top-16 z-20 mb-2.5 flex items-center justify-between gap-2 px-4 py-2.5">
        <div className="text-sm font-black text-[#16331f]">{left}</div>
        <div>{center}</div>
        <div>{right}</div>
      </div>
      <div className="mb-3.5 h-2 w-full overflow-hidden rounded-full bg-[#d9e6d3]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#16a34a] to-[#d4af37] transition-all"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
    </>
  );
}
