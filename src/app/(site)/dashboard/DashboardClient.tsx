"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PaymentModal from "@/components/PaymentModal";
import { peso, daysUntil, fmtDate, fmtDateTime, TRACK_LABEL } from "@/lib/format";
import type { Track, PaymentRequest, Subscription, ExamAttempt, Exam, ExamWithCount, SubjectProgress } from "@/lib/types";

const PRICE = 500;

const trackMeta: Record<Track, { emoji: string; color: string; soft: string; btn: string; label: string }> = {
  CSE: { emoji: "🏛️", color: "text-[#15803d]", soft: "bg-[#dcfce7]", btn: "btn-primary", label: "CSE Review" },
  LET: { emoji: "🍎", color: "text-[#b45309]", soft: "bg-[#fef9c3]", btn: "btn-gold", label: "LET Review" },
};

export default function DashboardClient({
  userName,
  subs,
  requests,
  attempts,
  freeExams,
  mastery,
}: {
  userName: string;
  subs: Subscription[];
  requests: PaymentRequest[];
  attempts: (ExamAttempt & { exam?: Exam })[];
  freeExams: ExamWithCount[];
  mastery: { track: Track; rows: SubjectProgress[] }[];
}) {
  const router = useRouter();
  const [payTrack, setPayTrack] = useState<Track | null>(null);

  const getSub = (t: Track) =>
    subs.find((s) => s.track === t && s.status === "active" && new Date(s.expires_at) > new Date());

  const handlePaid = () => {
    setPayTrack(null);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="mb-1 text-3xl font-black text-[#16331f]">
        Hi, {userName}! 👋
      </h1>
      <p className="mb-8 text-[#5c7863]">Here’s the status of your review.</p>

      {/* Subscription cards */}
      <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        {(["CSE", "LET"] as Track[]).map((t) => {
          const sub = getSub(t);
          const meta = trackMeta[t];
          const days = sub ? daysUntil(sub.expires_at) : 0;
          return (
            <div key={t} className="card relative overflow-hidden p-7">
              <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full ${t === "CSE" ? "bg-[#16a34a]/10" : "bg-[#ca8a04]/10"} blur-2xl`} />
              <div className="mb-3 flex items-center justify-between">
                <span className={`inline-flex items-center gap-2 rounded-full ${meta.soft} px-4 py-1.5 text-sm font-bold ${meta.color}`}>
                  {meta.emoji} {meta.label}
                </span>
                {sub ? (
                  <span className="badge badge-active">✓ Active</span>
                ) : requests.some((r) => r.track === t && r.status === "pending") ? (
                  <span className="badge badge-pending">⏳ Verifying</span>
                ) : (
                  <span className="badge badge-expired">🔒 Locked</span>
                )}
              </div>

              {sub ? (
                <>
                  <p className="mb-1 text-sm text-[#5c7863]">
                    Access until <strong className="text-[#16331f]">{fmtDate(sub.expires_at)}</strong>
                  </p>
                  <p className="mb-5 text-xs text-[#5c7863]">{days} days left</p>
                  <Link href={`/review/${t.toLowerCase()}`} className={`${meta.btn} inline-block px-6 py-2.5 text-sm`}>
                    Continue Review →
                  </Link>
                </>
              ) : (
                <>
                  <p className="mb-5 text-sm leading-relaxed text-[#5c7863]">
                    The {TRACK_LABEL[t]} reviewer is still locked. Subscribe to unlock all lessons,
                    drills, and mock exams.
                  </p>
                  <button
                    onClick={() => setPayTrack(t)}
                    className={`${meta.btn} px-6 py-2.5 text-sm`}
                  >
                    Subscribe — {peso(PRICE)}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Study now */}
      {subs.filter((s) => s.status === "active" && new Date(s.expires_at) > new Date()).length > 0 && (
        <div className="mb-10">
          <h2 className="mb-4 text-xl font-bold text-[#16331f]">🚀 Study now</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {subs
              .filter((s) => s.status === "active" && new Date(s.expires_at) > new Date())
              .map((s) => {
                const t = s.track;
                const base = `/study/${t.toLowerCase()}`;
                const hub = `/review/${t.toLowerCase()}`;
                return (
                  <div key={s.id} className="card p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-bold text-[#16331f]">
                        {trackMeta[t].emoji} {trackMeta[t].label}
                      </span>
                      <Link href={hub} className="text-xs font-bold text-[#15803d]">
                        Open hub →
                      </Link>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Link href={`${base}/drill`} className="rounded-xl bg-[#dcfce7] px-3 py-2.5 text-center text-xs font-bold text-[#166534]">
                        🎯 Subject drill
                      </Link>
                      <Link href={`${base}/flashcards`} className="rounded-xl bg-[#dcfce7] px-3 py-2.5 text-center text-xs font-bold text-[#166534]">
                        🃏 Flashcards
                      </Link>
                      <Link href={`${base}/mistakes`} className="rounded-xl bg-[#fffbeb] px-3 py-2.5 text-center text-xs font-bold text-[#b45309]">
                        🔁 Retry mistakes
                      </Link>
                      <Link href={`${hub}#mocks`} className="rounded-xl bg-[#f1f5f9] px-3 py-2.5 text-center text-xs font-bold text-[#475569]">
                        ⏱️ Full mock
                      </Link>
                    </div>
                  </div>
                );
              })}
          </div>

          {mastery.map((m) => (
            <div key={m.track} className="card mt-4 p-5">
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

      {/* Payment history */}
      <div>
        <h2 className="mb-4 text-xl font-bold text-[#16331f]">💳 Payment history</h2>
        {requests.length === 0 ? (
          <div className="card p-6 text-sm text-[#5c7863]">Nothing yet. Once you subscribe, your payment status will show up here.</div>
        ) : (
          <div className="card divide-y divide-[#d9e6d3]">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-semibold text-[#16331f]">
                    {trackMeta[r.track].emoji} {r.track} — {peso(r.amount)}
                  </div>
                  <div className="text-xs text-[#5c7863]">
                    Ref: {r.reference_number || "—"} · {fmtDateTime(r.created_at)}
                  </div>
                  {r.admin_note && (
                    <div className="mt-1 text-xs text-[#991b1b]">Note: {r.admin_note}</div>
                  )}
                </div>
                <span className={`badge badge-${r.status}`}>
                  {r.status === "pending" ? "⏳ Verifying" : r.status === "approved" ? "✓ Approved" : "✕ Rejected"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment modal */}
      {payTrack && (
        <PaymentModal
          track={payTrack}
          basePrice={PRICE}
          myRequests={requests}
          onClose={() => setPayTrack(null)}
          onSuccess={handlePaid}
        />
      )}
    </div>
  );
}
