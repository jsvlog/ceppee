"use client";

import Link from "next/link";
import { peso, daysUntil, fmtDate, fmtDateTime, TRACK_LABEL } from "@/lib/format";
import LogoMark from "@/components/LogoMark";
import type { Track, OnlinePayment, Subscription, ExamAttempt, Exam, ExamWithCount, SubjectProgress } from "@/lib/types";

const PLAN_LABEL: Record<string, string> = {
  monthly: "Monthly pass",
  subject: "One paper",
  beed: "Complete BEED",
  bsed: "Complete BSED",
  csec: "Complete CSE",
  season: "Season pass",
};

const trackMeta: Record<Track, { emoji: string; color: string; soft: string; btn: string; label: string }> = {
  CSE: { emoji: "🏛️", color: "text-[#15803d]", soft: "bg-[#dcfce7]", btn: "btn-primary", label: "CSE Review" },
  LET: { emoji: "🍎", color: "text-[#b45309]", soft: "bg-[#fef9c3]", btn: "btn-gold", label: "LET Review" },
};

export default function DashboardClient({
  userName,
  subs,
  payments,
  attempts,
  freeExams,
  mastery,
}: {
  userName: string;
  subs: Subscription[];
  payments: OnlinePayment[];
  attempts: (ExamAttempt & { exam?: Exam })[];
  freeExams: ExamWithCount[];
  mastery: { track: Track; rows: SubjectProgress[] }[];
}) {
  const getSub = (t: Track) =>
    subs.find((s) => s.track === t && s.status === "active" && new Date(s.expires_at) > new Date());

  const activeSubs = subs.filter((s) => s.status === "active" && new Date(s.expires_at) > new Date());
  const primaryTrack: Track = activeSubs.some((s) => s.track === "CSE") && !activeSubs.some((s) => s.track === "LET")
    ? "CSE"
    : "LET";
  const primarySlug = primaryTrack.toLowerCase();

  const readinessScore =
    attempts.length > 0
      ? Math.round(
          attempts.reduce((acc, a) => acc + (a.total > 0 ? (a.score / a.total) * 100 : 0), 0) /
            attempts.length
        )
      : null;

  const todayFormatted = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Greeting Header (like LETPass study space reference) */}
      <div className="mb-8 flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#bbf7d0] bg-[#dcfce7] text-2xl shadow-sm">
          🌱
        </span>
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#b45309]">
            <span className="inline-block h-3.5 w-1 rounded-full bg-[#ca8a04]" />
            <span>YOUR STUDY SPACE</span>
          </div>
          <h1 className="text-2xl font-black text-[#16331f] sm:text-3xl">
            Good day, {userName}!
          </h1>
          <p className="mt-0.5 text-sm text-[#5c7863]">
            {todayFormatted} · A little progress, every day.
          </p>
        </div>
      </div>

      {/* Main Two-Column Study Desk Grid */}
      <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-[1.55fr_1fr]">
        {/* Left Primary Column */}
        <div className="space-y-6">
          {/* Today's Starting Point Hero Card */}
          <div className="card overflow-hidden">
            <div className="border-b border-[#e2ece0] px-6 py-3.5">
              <span className="text-sm font-black text-[#16331f]">Today</span>
            </div>
            <div className="grid grid-cols-1 items-center gap-6 p-6 sm:grid-cols-[1.35fr_1fr]">
              <div>
                <div className="text-xs font-extrabold text-[#b45309]">
                  {attempts.length === 0
                    ? "Let's find your starting point."
                    : "Keep your momentum going."}
                </div>
                <h2 className="mt-1 text-2xl font-black leading-tight text-[#16331f]">
                  {attempts.length === 0
                    ? "Give today a starting point."
                    : "Ready for your next mock set?"}
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-[#5c7863]">
                  {attempts.length === 0
                    ? "Open the Campaign Map to take your first 150-item mock board or start a quick subject drill from the left drawer."
                    : `You have completed ${attempts.length} recent session${attempts.length === 1 ? "" : "s"}. Continue clearing your subject sets or review your missed items.`}
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <Link
                    href={`/review/${primarySlug}`}
                    className="btn-gold inline-flex items-center justify-center px-6 py-3 text-sm font-extrabold"
                  >
                    Open today&apos;s study →
                  </Link>
                  <Link
                    href="/read"
                    className="rounded-xl border border-[#d9e6d3] bg-[#f6faf4] px-4 py-3 text-xs font-extrabold text-[#3d5c44] transition hover:border-[#16a34a]"
                  >
                    📚 Reading Library
                  </Link>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-[#dcfce7] via-[#f0fdf4] to-[#fef9c3] p-5 text-center">
                <LogoMark size="lg" className="shadow-lg" />
                <div className="mt-3 text-xs font-black text-[#16331f]">Teacher Ceppee Review</div>
                <div className="text-[11px] font-semibold text-[#5c7863]">
                  202 Mock Sets · 3,801 Reading Sections
                </div>
              </div>
            </div>
          </div>

          {/* Study Buddy / Study Room Card */}
          <div className="card border-[#fde68a] bg-gradient-to-r from-[#fffdf4] via-white to-[#f0fdf4] p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-[#b45309]">
                  💬 A study buddy in your corner
                </div>
                <h3 className="mt-1 text-base font-black text-[#16331f]">
                  Join the Live Study Room
                </h3>
                <p className="mt-0.5 text-xs text-[#5c7863]">
                  Chat with fellow LET &amp; CSE reviewees in rooms dedicated to Gen Ed, Prof Ed, CSE, and every majorship.
                </p>
              </div>
              <Link
                href="/study-room"
                className="btn-primary shrink-0 px-5 py-2.5 text-xs font-extrabold"
              >
                Enter Study Room →
              </Link>
            </div>
          </div>

          {/* Quick Feature Shortcuts Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link
              href={`/review/${primarySlug}`}
              className="card card-hover flex flex-col items-start p-4"
            >
              <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[#fef9c3] text-lg">
                🗺️
              </span>
              <span className="text-xs font-black text-[#16331f]">Mock Boards</span>
              <span className="mt-0.5 text-[11px] text-[#5c7863]">150-item sets</span>
            </Link>
            <Link
              href="/read"
              className="card card-hover flex flex-col items-start p-4"
            >
              <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[#e0f2fe] text-lg">
                📚
              </span>
              <span className="text-xs font-black text-[#16331f]">Reading Notes</span>
              <span className="mt-0.5 text-[11px] text-[#5c7863]">15 complete books</span>
            </Link>
            <Link
              href={`/study/${primarySlug}/flashcards`}
              className="card card-hover flex flex-col items-start p-4"
            >
              <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[#fef3c7] text-lg">
                🃏
              </span>
              <span className="text-xs font-black text-[#16331f]">Flashcards</span>
              <span className="mt-0.5 text-[11px] text-[#5c7863]">Active recall</span>
            </Link>
            <Link
              href={`/study/${primarySlug}/mistakes`}
              className="card card-hover flex flex-col items-start p-4"
            >
              <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[#fee2e2] text-lg">
                🔁
              </span>
              <span className="text-xs font-black text-[#16331f]">Retry Mistakes</span>
              <span className="mt-0.5 text-[11px] text-[#5c7863]">Fix weak spots</span>
            </Link>
          </div>
        </div>

        {/* Right Status / Goal & Readiness Column */}
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex items-center justify-between gap-3 border-b border-[#e2ece0] pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fef9c3] text-lg">
                  🎯
                </span>
                <div>
                  <div className="text-xs font-semibold text-[#5c7863]">Your goal</div>
                  <div className="text-sm font-black text-[#16331f]">
                    {activeSubs.length > 0
                      ? `${activeSubs.map((s) => s.track).join(" + ")} Board Passer`
                      : "LET / CSE Board Passer"}
                  </div>
                </div>
              </div>
              <Link
                href={`/review/${primarySlug}`}
                className="rounded-lg border border-[#d9e6d3] px-2.5 py-1 text-xs font-bold text-[#3d5c44] hover:border-[#16a34a]"
              >
                Switch
              </Link>
            </div>

            <div className="border-b border-[#e2ece0] py-4">
              <div className="text-xs font-semibold text-[#5c7863]">Current readiness</div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-3xl font-black text-[#16331f]">
                  {readinessScore !== null ? readinessScore : "—"}
                </span>
                <span className="text-sm font-bold text-[#94a896]">/100</span>
              </div>
              <p className="mt-1 text-xs text-[#5c7863]">
                {readinessScore !== null
                  ? `Average across your last ${attempts.length} completed practice sets.`
                  : "Keep practising to build your first readiness reading."}
              </p>
            </div>

            <div className="pt-4">
              <div className="mb-2 text-xs font-extrabold uppercase tracking-wider text-[#5c7863]">
                Your Exam Passes
              </div>
              <div className="space-y-2.5">
                {(["LET", "CSE"] as Track[]).map((t) => {
                  const sub = getSub(t);
                  const meta = trackMeta[t];
                  const days = sub ? daysUntil(sub.expires_at) : 0;
                  return (
                    <div
                      key={t}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[#d9e6d3] bg-[#f6faf4] p-3"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-black text-[#16331f]">
                          <span>{meta.emoji}</span>
                          <span>{meta.label}</span>
                        </div>
                        <div className="text-[11px] text-[#5c7863]">
                          {sub
                            ? `Active · ${days} days left (until ${fmtDate(sub.expires_at)})`
                            : `Locked · Unlock ${TRACK_LABEL[t]}`}
                        </div>
                      </div>
                      {sub ? (
                        <Link
                          href={`/review/${t.toLowerCase()}`}
                          className="rounded-lg bg-[#dcfce7] px-3 py-1.5 text-xs font-extrabold text-[#15803d]"
                        >
                          Open →
                        </Link>
                      ) : (
                        <Link
                          href={`/pricing?track=${t}&level=secondary`}
                          className="rounded-lg bg-[#fef9c3] px-3 py-1.5 text-xs font-extrabold text-[#b45309]"
                        >
                          Unlock →
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <Link
            href="/leaderboard"
            className="card card-hover flex items-center justify-between gap-3 p-4"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#dcfce7] text-lg">
                🏆
              </span>
              <div>
                <div className="text-sm font-black text-[#16331f]">View Leaderboard</div>
                <div className="text-xs text-[#5c7863]">See daily &amp; weekly top reviewees</div>
              </div>
            </div>
            <span className="text-xs font-extrabold text-[#15803d]">Open →</span>
          </Link>
        </div>
      </div>

      {/* Mastery by section */}
      {mastery.length > 0 && (
        <div className="mb-10 space-y-4">
          {mastery.map((m) => (
            <div key={m.track} className="card p-5">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#5c7863]">
                {trackMeta[m.track].emoji} {m.track} — mastery by section
              </h3>
              <div className="space-y-3">
                {m.rows.map((r) => (
                  <div key={r.subject}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-semibold text-[#16331f]">{r.subject}</span>
                      <span className="text-xs text-[#5c7863]">
                        {r.correct}/{r.answered} · {r.pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#d9e6d3]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${r.pct}%`,
                          background: r.pct >= 80 ? "#16a34a" : r.pct >= 60 ? "#eab308" : "#ef4444",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-[#94a896]">
                Based on your last answer for each item — a section you fix stops dragging you down.
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Free previews */}
      {freeExams.length > 0 && (
        <div className="mb-10">
          <h2 className="mb-4 text-xl font-bold text-[#16331f]">🎁 Free previews — try them!</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {freeExams.map((e) => (
              <Link
                key={e.id}
                href={`/exam/${e.id}`}
                className="card card-hover flex items-center justify-between p-5"
              >
                <div>
                  <div className="font-bold text-[#16331f]">{e.title}</div>
                  <div className="text-xs text-[#5c7863]">{e.duration_minutes} min · {e.question_count ?? "—"} questions</div>
                </div>
                <span className={`text-2xl ${e.track === "CSE" ? "" : "grayscale-0"}`}>
                  {trackMeta[e.track].emoji}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent attempts */}
      <div className="mb-10">
        <h2 className="mb-4 text-xl font-bold text-[#16331f]">📊 Recent results</h2>
        {attempts.length === 0 ? (
          <div className="card p-6 text-sm text-[#5c7863]">
            You haven’t finished a mock or a drill yet. Once you take one, your results will show up here.
          </div>
        ) : (
          <div className="card divide-y divide-[#d9e6d3]">
            {attempts.map((a) => {
              const pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
              const kindLabel = a.kind === "drill" ? "🎯 Drill" : a.kind === "flashcards" ? "🃏 Flashcards" : "⏱️ Mock exam";
              return (
                <div key={a.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[#16331f]">{a.label || a.exam?.title || "Practice"}</div>
                    <div className="text-xs text-[#5c7863]">
                      {kindLabel}
                      {a.level && a.level !== "both" ? ` · ${a.level}` : ""} · {fmtDateTime(a.completed_at)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-lg font-black ${pct >= 80 ? "text-[#16a34a]" : pct >= 60 ? "text-[#f59e0b]" : "text-[#ef4444]"}`}>
                      {pct}%
                    </div>
                    <div className="text-xs text-[#5c7863]">{a.score}/{a.total} correct</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment history (PayMongo orders) */}
      <div>
        <h2 className="mb-4 text-xl font-bold text-[#16331f]">💳 Payment history</h2>
        {payments.length === 0 ? (
          <div className="card p-6 text-sm text-[#5c7863]">
            Nothing yet. Buy a pass from the pricing page and it shows up here — access unlocks by itself.
          </div>
        ) : (
          <div className="card divide-y divide-[#d9e6d3]">
            {payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-semibold text-[#16331f]">
                    {trackMeta[p.track].emoji} {p.track} — {PLAN_LABEL[p.plan] ?? p.plan} · {peso(p.amount / 100)}
                  </div>
                  <div className="text-xs text-[#5c7863]">
                    {p.subject ? `${p.subject} · ` : ""}
                    {p.payment_method ? `${p.payment_method} · ` : ""}
                    {fmtDateTime(p.created_at)}
                  </div>
                </div>
                <span className={`badge badge-${p.status === "paid" ? "active" : p.status === "pending" ? "pending" : "expired"}`}>
                  {p.status === "paid" ? "✓ Paid" : p.status === "pending" ? "⏳ Awaiting payment" : "✕ Not completed"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
