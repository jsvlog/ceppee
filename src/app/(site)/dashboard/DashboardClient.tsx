"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PaymentModal from "@/components/PaymentModal";
import { peso, daysUntil, fmtDate, fmtDateTime, TRACK_LABEL } from "@/lib/format";
import type { Track, PaymentRequest, Subscription, ExamAttempt, Exam, ExamWithCount } from "@/lib/types";

const PRICE = 500;

const trackMeta: Record<Track, { emoji: string; color: string; soft: string; btn: string; label: string }> = {
  CSE: { emoji: "🏛️", color: "text-[#0284c7]", soft: "bg-[#e0f2fe]", btn: "btn-primary", label: "CSE Review" },
  LET: { emoji: "🍎", color: "text-[#7c3aed]", soft: "bg-[#f5f0ff]", btn: "btn-violet", label: "LET Review" },
};

export default function DashboardClient({
  userName,
  subs,
  requests,
  attempts,
  freeExams,
}: {
  userName: string;
  subs: Subscription[];
  requests: PaymentRequest[];
  attempts: (ExamAttempt & { exam?: Exam })[];
  freeExams: ExamWithCount[];
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
      <h1 className="mb-1 text-3xl font-black text-[#142a56]">
        Hi, {userName}! 👋
      </h1>
      <p className="mb-8 text-[#5a6d91]">Here’s the status of your review.</p>

      {/* Subscription cards */}
      <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        {(["CSE", "LET"] as Track[]).map((t) => {
          const sub = getSub(t);
          const meta = trackMeta[t];
          const days = sub ? daysUntil(sub.expires_at) : 0;
          return (
            <div key={t} className="card relative overflow-hidden p-7">
              <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full ${t === "CSE" ? "bg-[#0ea5e9]/10" : "bg-[#8b5cf6]/10"} blur-2xl`} />
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
                  <p className="mb-1 text-sm text-[#5a6d91]">
                    Access until <strong className="text-[#142a56]">{fmtDate(sub.expires_at)}</strong>
                  </p>
                  <p className="mb-5 text-xs text-[#5a6d91]">{days} days left</p>
                  <Link href={`/review/${t.toLowerCase()}`} className={`${meta.btn} inline-block px-6 py-2.5 text-sm`}>
                    Continue Review →
                  </Link>
                </>
              ) : (
                <>
                  <p className="mb-5 text-sm leading-relaxed text-[#5a6d91]">
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

      {/* Free previews */}
      {freeExams.length > 0 && (
        <div className="mb-10">
          <h2 className="mb-4 text-xl font-bold text-[#142a56]">🎁 Free previews — try them!</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {freeExams.map((e) => (
              <Link
                key={e.id}
                href={`/exam/${e.id}`}
                className="card card-hover flex items-center justify-between p-5"
              >
                <div>
                  <div className="font-bold text-[#142a56]">{e.title}</div>
                  <div className="text-xs text-[#5a6d91]">{e.duration_minutes} min · {e.question_count ?? "—"} questions</div>
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
        <h2 className="mb-4 text-xl font-bold text-[#142a56]">📊 Recent exam results</h2>
        {attempts.length === 0 ? (
          <div className="card p-6 text-sm text-[#5a6d91]">
            You haven’t finished an exam yet. Once you take one, your results will show up here.
          </div>
        ) : (
          <div className="card divide-y divide-[#dbe7f8]">
            {attempts.map((a) => {
              const pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
              return (
                <div key={a.id} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <div className="font-semibold text-[#142a56]">{a.exam?.title || "Exam"}</div>
                    <div className="text-xs text-[#5a6d91]">{fmtDateTime(a.completed_at)}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-black ${pct >= 80 ? "text-[#16a34a]" : pct >= 50 ? "text-[#f59e0b]" : "text-[#ef4444]"}`}>
                      {pct}%
                    </div>
                    <div className="text-xs text-[#5a6d91]">{a.score}/{a.total} correct</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment history */}
      <div>
        <h2 className="mb-4 text-xl font-bold text-[#142a56]">💳 Payment history</h2>
        {requests.length === 0 ? (
          <div className="card p-6 text-sm text-[#5a6d91]">Nothing yet. Once you subscribe, your payment status will show up here.</div>
        ) : (
          <div className="card divide-y divide-[#dbe7f8]">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-semibold text-[#142a56]">
                    {trackMeta[r.track].emoji} {r.track} — {peso(r.amount)}
                  </div>
                  <div className="text-xs text-[#5a6d91]">
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
