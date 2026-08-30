"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fmtDuration } from "@/lib/format";
import type { Exam, Question } from "@/lib/types";

type Phase = "intro" | "running" | "results";

interface ResultItem {
  q: Question;
  chosen: string | null;
  correct: boolean;
}

export default function ExamClient({
  exam,
  questions,
  backHref,
}: {
  exam: Exam;
  questions: Question[];
  backHref: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("intro");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(exam.duration_minutes * 60);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [score, setScore] = useState(0);
  const [saving, setSaving] = useState(false);
  const submittedRef = useRef(false);

  const isMock = exam.mode === "mock";
  const total = questions.length;

  const submit = useCallback(
    async (autoTimedOut = false) => {
      if (submittedRef.current) return;
      submittedRef.current = true;

      let s = 0;
      const res: ResultItem[] = questions.map((q) => {
        const chosen = answers[q.id] ?? null;
        const ok = chosen === q.correct_choice;
        if (ok) s++;
        return { q, chosen, correct: ok };
      });
      setResults(res);
      setScore(s);
      setPhase("results");

      setSaving(true);
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        await supabase.from("exam_attempts").insert({
          exam_id: exam.id,
          score: s,
          total,
          duration_used_seconds: exam.duration_minutes * 60 - secondsLeft,
          answers,
        });
      } catch {
        // non-fatal — results still shown
      } finally {
        setSaving(false);
      }
      if (autoTimedOut) router.refresh();
    },
    [answers, exam, questions, router, secondsLeft, total]
  );

  // Countdown timer — mock mode only (practice has no time limit)
  useEffect(() => {
    if (!isMock || phase !== "running") return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          void submit(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, submit]);

  const choose = (qid: string, choice: string) => {
    setAnswers((a) => ({ ...a, [qid]: choice }));
  };

  const goNext = () => {
    if (current < total - 1) setCurrent(current + 1);
    else void submit();
  };

  const goPrev = () => setCurrent((c) => Math.max(0, c - 1));

  /* ============ INTRO ============ */
  if (phase === "intro") {
    return (
      <div className="card relative overflow-hidden p-10 text-center">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#38bdf8]/10 blur-2xl" />
        <div className="mb-4 text-5xl">{isMock ? "⏱️" : "🎯"}</div>
        <h1 className="mb-2 text-3xl font-black text-[#142a56]">{exam.title}</h1>
        {exam.description && <p className="mx-auto mb-6 max-w-md text-sm text-[#5a6d91]">{exam.description}</p>}

        <div className="mx-auto mb-8 grid max-w-md grid-cols-3 gap-3">
          <div className="rounded-2xl bg-[#e0f2fe] p-4">
            <div className="text-2xl font-black text-[#142a56]">{total}</div>
            <div className="text-xs text-[#0284c7]">Questions</div>
          </div>
          <div className="rounded-2xl bg-[#e0f2fe] p-4">
            <div className="text-2xl font-black text-[#142a56]">{exam.duration_minutes}m</div>
            <div className="text-xs text-[#0284c7]">Time limit</div>
          </div>
          <div className="rounded-2xl bg-[#e0f2fe] p-4">
            <div className="text-2xl font-black text-[#142a56]">{isMock ? "1x" : "∞"}</div>
            <div className="text-xs text-[#0284c7]">{isMock ? "Parang totohanan" : "Relax lang"}</div>
          </div>
        </div>

        {isMock ? (
          <p className="mx-auto mb-8 max-w-md rounded-xl bg-[#e0f2fe] px-4 py-3 text-sm text-[#0369a1]">
            ⚠️ Timed exam ito. Kapag nag-start, tuloy tuloy na ang oras — parang totohanan.
            Ihanda ang sarili!
          </p>
        ) : (
          <p className="mx-auto mb-8 max-w-md rounded-xl bg-[#dcfce7] px-4 py-3 text-sm text-[#166534]">
            🎯 Practice mode: may makikita kang explanation pagkatapos pumili ng sagot.
          </p>
        )}

        <button
          onClick={() => setPhase("running")}
          className="btn-primary px-10 py-4 text-base"
        >
          {isMock ? "Simulan ang Exam →" : "Start Practice →"}
        </button>

        <div className="mt-4">
          <a href={backHref} className="text-sm text-[#5a6d91] hover:text-[#142a56]">
            ← Bumalik sa reviewer
          </a>
        </div>
      </div>
    );
  }

  /* ============ RESULTS ============ */
  if (phase === "results") {
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    const passed = pct >= (isMock ? 80 : 75);
    return (
      <div>
        <div className="card relative overflow-hidden p-10 text-center">
          <div className="absolute -left-12 -top-12 h-40 w-40 rounded-full bg-[#22c55e]/10 blur-2xl" />
          <div className="mb-2 text-5xl">{passed ? "🎉" : "💪"}</div>
          <h1 className="mb-1 text-3xl font-black text-[#142a56]">
            {passed ? "Galing mo!" : "Kaya mo yan next round!"}
          </h1>
          <p className="mb-6 text-sm text-[#5a6d91]">
            {isMock ? "Passing: 80% sa totoong CSE" : "Target: 75%+ bago mag-mock exam"}
          </p>

          <div className="relative mx-auto mb-6 h-40 w-40">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#dbe7f8" strokeWidth="12" />
              <circle
                cx="60" cy="60" r="52" fill="none"
                stroke={passed ? "#22c55e" : "#f59e0b"}
                strokeWidth="12" strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * 326.7} 326.7`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-[#142a56]">{pct}%</span>
              <span className="text-xs text-[#5a6d91]">{score}/{total}</span>
            </div>
          </div>

          <p className="mb-2 text-sm text-[#5a6d91]">
            {isMock && (
              <>Time used: <strong className="text-[#142a56]">{fmtDuration(exam.duration_minutes * 60 - secondsLeft)}</strong> </>
            )}
            {saving && "· saving..."}
          </p>

          <div className="mt-6 flex justify-center gap-3">
            <a href={backHref} className="btn-primary px-6 py-3 text-sm">
              Balik sa Reviewer
            </a>
            <a href="/dashboard" className="rounded-xl border border-[#dbe7f8] bg-white px-6 py-3 text-sm font-semibold text-[#3f4d78]">
              Dashboard
            </a>
          </div>
        </div>

        {/* Answer review */}
        <h2 className="mb-4 mt-10 text-xl font-bold text-[#142a56]">📝 Review ng sagot mo</h2>
        <div className="space-y-4">
          {results.map((r, i) => (
            <div key={r.q.id} className={`card p-6 ${r.correct ? "border-[#bbf7d0]" : "border-red-200"}`}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <span className="font-bold text-[#142a56]">
                  {i + 1}. {r.q.question_text}
                </span>
                <span className={`badge ${r.correct ? "badge-approved" : "badge-rejected"}`}>
                  {r.correct ? "✓" : "✕"}
                </span>
              </div>
              <div className="space-y-1.5 text-sm">
                {(["A", "B", "C", "D"] as const).map((c) => {
                  const isCorrect = r.q.correct_choice === c;
                  const isChosen = r.chosen === c;
                  return (
                    <div
                      key={c}
                      className={`rounded-lg px-3 py-2 ${
                        isCorrect
                          ? "bg-[#dcfce7] font-semibold text-[#166534]"
                          : isChosen
                            ? "bg-[#fee2e2] text-[#991b1b]"
                            : "text-[#5a6d91]"
                      }`}
                    >
                      {c}. {r.q[`choice_${c.toLowerCase()}` as "choice_a"]}
                      {isCorrect && " ✓"}
                      {isChosen && !isCorrect && " ✕ (sagot mo)"}
                    </div>
                  );
                })}
              </div>
              {r.q.explanation && (
                <p className="mt-3 rounded-xl bg-[#e0f2fe] px-4 py-3 text-sm text-[#0284c7]">
                  💡 {r.q.explanation}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ============ RUNNING ============ */
  const q = questions[current];
  const answeredCount = Object.keys(answers).length;
  const timeCritical = secondsLeft < 300;

  return (
    <div>
      {/* Timer bar */}
      <div className="card sticky top-20 z-30 mb-6 flex items-center justify-between p-4">
        <div className="text-sm font-semibold text-[#5a6d91]">
          Q{current + 1} of {total}
        </div>
        {isMock ? (
          <div className={`flex items-center gap-2 rounded-xl px-4 py-1.5 font-mono text-lg font-bold ${
            timeCritical ? "animate-pulse bg-red-50 text-red-600" : "bg-[#e0f2fe] text-[#142a56]"
          }`}>
            ⏱ {fmtDuration(secondsLeft)}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-[#dcfce7] px-4 py-1.5 text-sm font-bold text-[#166534]">
            🎯 Practice — walang time limit
          </div>
        )}
        <div className="text-sm text-[#5a6d91]">{answeredCount}/{total} sagot</div>
      </div>

      {/* Progress bar */}
      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-[#dbe7f8]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#0ea5e9] to-[#38bdf8] transition-all"
          style={{ width: `${((current + 1) / total) * 100}%` }}
        />
      </div>

      {/* Question card */}
      <div className="card p-8">
        <h2 className="mb-6 text-lg font-bold leading-relaxed text-[#142a56]">
          {current + 1}. {q.question_text}
        </h2>

        <div className="space-y-3">
          {(["A", "B", "C", "D"] as const).map((c) => {
            const selected = answers[q.id] === c;
            return (
              <button
                key={c}
                onClick={() => {
                  if (isMock) {
                    choose(q.id, c);
                  } else {
                    // Practice: lock in answer, show explanation immediately
                    if (answers[q.id]) return;
                    choose(q.id, c);
                  }
                }}
                className={`flex w-full items-center gap-3 rounded-2xl border-2 px-5 py-4 text-left text-sm transition ${
                  selected
                    ? "border-[#0ea5e9] bg-[#e0f2fe] font-semibold text-[#142a56]"
                    : "border-[#dbe7f8] bg-white text-[#3f4d78] hover:border-[#38bdf8]"
                }`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold ${
                  selected ? "bg-gradient-to-br from-[#0ea5e9] to-[#38bdf8] text-white" : "bg-[#e0f2fe] text-[#0284c7]"
                }`}>
                  {c}
                </span>
                {q[`choice_${c.toLowerCase()}` as "choice_a"]}
              </button>
            );
          })}
        </div>

        {/* Practice mode: instant explanation */}
        {!isMock && answers[q.id] && (
          <div className="mt-5">
            <div className={`rounded-2xl px-5 py-4 text-sm ${answers[q.id] === q.correct_choice ? "bg-[#dcfce7] text-[#166534]" : "bg-[#fee2e2] text-[#991b1b]"}`}>
              <strong>{answers[q.id] === q.correct_choice ? "✓ Tama!" : `✕ Mali — ang sagot ay ${q.correct_choice}.`}</strong>
            </div>
            {q.explanation && (
              <p className="mt-3 rounded-2xl bg-[#e0f2fe] px-5 py-4 text-sm text-[#0284c7]">
                💡 {q.explanation}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Nav buttons */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          onClick={goPrev}
          disabled={current === 0}
          className="rounded-xl border border-[#dbe7f8] bg-white px-6 py-3 text-sm font-semibold text-[#3f4d78] disabled:opacity-40"
        >
          ← Previous
        </button>

        {current < total - 1 ? (
          <button onClick={goNext} className="btn-primary px-8 py-3 text-sm">
            Next →
          </button>
        ) : (
          <button onClick={() => void submit()} className="btn-primary px-8 py-3 text-sm">
            Submit Answers ✓
          </button>
        )}
      </div>

      {/* Question navigator dots */}
      <div className="card mt-6 flex flex-wrap items-center justify-center gap-2 p-4">
        {questions.map((qq, i) => (
          <button
            key={qq.id}
            onClick={() => setCurrent(i)}
            className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
              i === current
                ? "bg-[#142a56] text-white"
                : answers[qq.id]
                  ? "bg-[#dcfce7] text-[#166534]"
                  : "bg-[#dbe7f8] text-[#93a4c0] hover:bg-[#f0e0c0]"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Mobile-friendly submit at end */}
      {current === total - 1 && answeredCount < total && (
        <p className="mt-3 text-center text-xs text-[#f59e0b]">
          ⚠️ May {total - answeredCount} pang hindi nasasagutan — pwede mong balikan gamit ang numbers sa baba.
        </p>
      )}
    </div>
  );
}
