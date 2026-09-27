"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { peso, fmtDate, fmtDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { postAdmin } from "@/lib/admin-api";
import { parseBulkQuestions } from "@/lib/bulk-import";
import { MATERIAL, subjectsFor, subjectIcon, passingPctFor } from "@/lib/exam";
import QuestionBank from "./QuestionBank";
import type { Track, PaymentRequest, Subscription, Topic, ExamWithCount, Question, SiteSettings, Testimonial, Coach, CoachTrack } from "@/lib/types";
import type { AdminProfile, LessonMeta } from "./page";

/* ================= helpers ================= */

const trackPill = (t: Track) =>
  t === "CSE" ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#fef9c3] text-[#b45309]";

/* ================= bulk question parser =================
 * Lives in @/lib/bulk-import (shared with the Question Bank tab). */

/* ================= main ================= */

const TABS = [
  { id: "payments", label: "💰 Payments" },
  { id: "users", label: "👥 Users" },
  { id: "bank", label: "🧠 Question Bank" },
  { id: "content", label: "📚 Lessons" },
  { id: "exams", label: "⏱️ Mocks & Exams" },
  { id: "testimonials", label: "💬 Testimonials" },
  { id: "coaches", label: "🧑‍🏫 Coaches" },
  { id: "settings", label: "⚙️ Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminClient({
  stats,
  payments,
  subs,
  profiles,
  topics,
  lessons,
  exams,
  settings,
  testimonials,
  coaches,
}: {
  stats: Record<string, number>;
  payments: (PaymentRequest & { profile?: { email: string; full_name: string } })[];
  subs: (Subscription & { profile?: { email: string; full_name: string } })[];
  profiles: AdminProfile[];
  topics: Topic[];
  lessons: LessonMeta[];
  exams: (ExamWithCount & { exam_questions?: { count: number }[] })[];
  settings: SiteSettings[];
  testimonials: Testimonial[];
  coaches: Coach[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("payments");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);

  const run = async (action: string, payload: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    setFlash(null);
    try {
      await postAdmin(action, payload);
      setFlash({ ok: true, msg: okMsg });
      router.refresh();
    } catch (e) {
      setFlash({ ok: false, msg: e instanceof Error ? e.message : "Error" });
    } finally {
      setBusy(false);
    }
  };

  const pendingPayments = payments.filter((p) => p.status === "pending");
  const reviewedPayments = payments.filter((p) => p.status !== "pending");

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#16331f]">🛠️ Admin Dashboard</h1>
          <p className="text-sm text-[#5c7863]">Teacher Ceppee Review control center</p>
        </div>
        {busy && <span className="badge badge-pending">Processing…</span>}
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Pending payments" value={stats.pending_payments ?? 0} hi />
        <StatCard label="Active CSE" value={stats.active_cse ?? 0} />
        <StatCard label="Active LET" value={stats.active_let ?? 0} />
        <StatCard label="Total users" value={stats.total_users ?? 0} />
        <StatCard label="Exams" value={stats.total_exams ?? 0} />
        <StatCard label="Questions" value={stats.total_questions ?? 0} />
      </div>

      {flash && (
        <div
          className={`mb-6 rounded-xl px-4 py-3 text-sm ${
            flash.ok ? "bg-[#dcfce7] text-[#166534]" : "bg-[#fee2e2] text-[#991b1b]"
          }`}
        >
          {flash.ok ? "✅ " : "✕ "}
          {flash.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-8 flex flex-wrap gap-2 rounded-2xl bg-[#dcfce7] p-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative rounded-xl px-4 py-2 text-sm font-bold transition ${
              tab === t.id ? "bg-white text-[#16331f] shadow" : "text-[#15803d] hover:text-[#16331f]"
            }`}
          >
            {t.label}
            {t.id === "payments" && pendingPayments.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#15803d] text-[10px] font-black text-white">
                {pendingPayments.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ============ PAYMENTS ============ */}
      {tab === "payments" && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-4 text-lg font-bold text-[#16331f]">
              ⏳ Pending verification ({pendingPayments.length})
            </h2>
            {pendingPayments.length === 0 ? (
              <div className="card p-6 text-sm text-[#5c7863]">No pending. Enjoy the calm! ☕</div>
            ) : (
              <div className="space-y-5">
                {pendingPayments.map((p) => (
                  <PaymentCard
                    key={p.id}
                    p={p}
                    busy={busy}
                    onApprove={() => run("approve_payment", { payment_id: p.id }, `Approved! The ${p.track} subscription is now active.`)}
                    onReject={(note) => run("reject_payment", { payment_id: p.id, note }, "Rejected.")}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-4 text-lg font-bold text-[#16331f]">📁 Reviewed ({reviewedPayments.length})</h2>
            <div className="card divide-y divide-[#d9e6d3]">
              {reviewedPayments.length === 0 && (
                <div className="p-6 text-sm text-[#5c7863]">No reviewed payments yet.</div>
              )}
              {reviewedPayments.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <div>
                    <span className="font-semibold text-[#16331f]">{p.profile?.email || "—"}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${trackPill(p.track)}`}>{p.track}</span>
                    <span className="ml-2 text-[#5c7863]">{peso(p.amount)} · {fmtDateTime(p.created_at)}</span>
                    {p.admin_note && <div className="mt-1 text-xs text-[#991b1b]">Note: {p.admin_note}</div>}
                  </div>
                  <span className={`badge badge-${p.status}`}>{p.status}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ============ USERS ============ */}
      {tab === "users" && (
        <div className="space-y-4">
          {profiles.map((u) => {
            const cseSub = subs.find((s) => s.user_id === u.id && s.track === "CSE" && s.status === "active" && new Date(s.expires_at) > new Date());
            const letSub = subs.find((s) => s.user_id === u.id && s.track === "LET" && s.status === "active" && new Date(s.expires_at) > new Date());
            return (
              <div key={u.id} className="card p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-[#16331f]">
                      {u.full_name || "—"}
                      {u.is_admin && <span className="badge badge-pending">👑 Admin</span>}
                    </div>
                    <div className="text-xs text-[#5c7863]">{u.email}</div>
                  </div>
                  <div className="flex gap-2">
                    {(["CSE", "LET"] as Track[]).map((t) => {
                      const sub = t === "CSE" ? cseSub : letSub;
                      return (
                        <div key={t} className="rounded-xl border border-[#d9e6d3] px-3 py-2 text-center text-xs">
                          <div className={`mb-1 font-bold ${t === "CSE" ? "text-[#15803d]" : "text-[#b45309]"}`}>{t}</div>
                          {sub ? (
                            <>
                              <div className="font-semibold text-[#16a34a]">✓ until {fmtDate(sub.expires_at)}</div>
                              <div className="mt-1 flex justify-center gap-1">
                                <button disabled={busy} onClick={() => run("extend_sub", { user_id: u.id, track: t, days: 180 }, `${t} extended +180 days`)} className="rounded-md bg-[#dcfce7] px-2 py-1 font-bold text-[#15803d] hover:bg-[#bbf7d0]">+180d</button>
                                <button disabled={busy} onClick={() => run("revoke_sub", { user_id: u.id, track: t }, `${t} revoked`)} className="rounded-md bg-[#fee2e2] px-2 py-1 font-bold text-[#991b1b] hover:bg-[#fecaca]">Revoke</button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-[#94a896]">🔒 No sub</div>
                              <div className="mt-1 flex justify-center">
                                <button disabled={busy} onClick={() => run("grant_sub", { user_id: u.id, track: t, days: 180 }, `${t} granted (180 days)`)} className="rounded-md bg-[#dcfce7] px-2 py-1 font-bold text-[#166534] hover:bg-[#bbf7d0]">Grant 180d</button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                    <button
                      disabled={busy}
                      onClick={() => run("make_admin", { user_id: u.id, is_admin: !u.is_admin }, u.is_admin ? "Admin removed" : "Admin granted")}
                      className="self-center rounded-xl border border-[#d9e6d3] px-3 py-2 text-xs font-bold text-[#5c7863] hover:border-[#d4af37]"
                    >
                      {u.is_admin ? "Remove admin" : "Make admin"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {profiles.length === 0 && <div className="card p-6 text-sm text-[#5c7863]">No users yet.</div>}
        </div>
      )}

      {/* ============ QUESTION BANK ============ */}
      {tab === "bank" && <QuestionBank />}

      {/* ============ CONTENT (topics + lessons) ============ */}
      {tab === "content" && (
        <ContentTab
          topics={topics}
          lessons={lessons}
          busy={busy}
          run={run}
        />
      )}

      {/* ============ EXAMS ============ */}
      {tab === "exams" && (
        <ExamsTab
          exams={exams}
          topics={topics}
          busy={busy}
          run={run}
        />
      )}

      {/* ============ TESTIMONIALS ============ */}
      {tab === "testimonials" && (
        <TestimonialsTab testimonials={testimonials} busy={busy} run={run} />
      )}

      {/* ============ COACHES ============ */}
      {tab === "coaches" && <CoachesTab coaches={coaches} busy={busy} run={run} />}

      {/* ============ SETTINGS ============ */}
      {tab === "settings" && <SettingsTab settings={settings} busy={busy} run={run} />}
    </div>
  );
}

/* ================= sub-components ================= */

function StatCard({ label, value, hi }: { label: string; value: number; hi?: boolean }) {
  return (
    <div className={`card p-4 ${hi && value > 0 ? "border-[#d4af37] ring-2 ring-[#d4af37]/30" : ""}`}>
      <div className={`text-2xl font-black ${hi && value > 0 ? "text-[#15803d]" : "text-[#16331f]"}`}>{value}</div>
      <div className="text-xs text-[#5c7863]">{label}</div>
    </div>
  );
}

function PaymentCard({
  p,
  busy,
  onApprove,
  onReject,
}: {
  p: PaymentRequest & { profile?: { email: string; full_name: string } };
  busy: boolean;
  onApprove: () => void;
  onReject: (note: string) => void;
}) {
  const [showReject, setShowReject] = useState(false);
  const [note, setNote] = useState("");

  return (
    <div className="card p-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* Receipt */}
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[#5c7863]">Receipt</div>
          {p.receipt_url ? (
            <a href={p.receipt_url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.receipt_url} alt="Payment receipt" className="max-h-56 rounded-xl border border-[#d9e6d3] object-contain transition hover:opacity-90" />
            </a>
          ) : (
            <div className="rounded-xl bg-[#eef2f7] p-6 text-center text-sm text-[#94a896]">No screenshot</div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-2 text-sm">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[#5c7863]">Details</div>
          <Row k="User" v={p.profile?.email || p.user_id} />
          <Row k="Name" v={p.profile?.full_name || "—"} />
          <Row k="Track" v={<span className={`rounded-full px-2 py-0.5 text-xs font-bold ${trackPill(p.track)}`}>{p.track}</span>} />
          <Row k="Amount" v={<strong>{peso(p.amount)}</strong>} />
          <Row k="Method" v={p.payment_method} />
          <Row k="Ref # " v={<strong className="font-mono">{p.reference_number || "—"}</strong>} />
          <Row k="Submitted" v={fmtDateTime(p.created_at)} />
        </div>

        {/* Actions */}
        <div className="flex flex-col justify-center gap-3">
          <button
            disabled={busy}
            onClick={onApprove}
            className="w-full rounded-xl bg-gradient-to-br from-[#22c55e] to-[#16a34a] py-3 font-bold text-white shadow-md transition hover:-translate-y-0.5"
          >
            ✓ APPROVE — activate {p.track}
          </button>
          {!showReject ? (
            <button
              disabled={busy}
              onClick={() => setShowReject(true)}
              className="w-full rounded-xl border border-[#fecaca] bg-white py-3 font-bold text-[#991b1b] transition hover:bg-[#fee2e2]"
            >
              ✕ Reject
            </button>
          ) : (
            <div className="space-y-2">
              <input
                className="input-warm text-sm"
                placeholder="Reason (optional, visible to the user)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => onReject(note)}
                  className="flex-1 rounded-xl bg-[#ef4444] py-2.5 text-sm font-bold text-white"
                >
                  Confirm reject
                </button>
                <button onClick={() => setShowReject(false)} className="rounded-xl border border-[#d9e6d3] px-4 text-sm text-[#5c7863]">
                  Cancel
                </button>
              </div>
            </div>
          )}
          <p className="text-center text-xs text-[#94a896]">Check: amount + centavos, reference number, and name on the receipt.</p>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#5c7863]">{k}</span>
      <span className="text-right text-[#16331f]">{v}</span>
    </div>
  );
}

/* ---------- Content tab ---------- */

function ContentTab({
  topics,
  lessons,
  busy,
  run,
}: {
  topics: Topic[];
  lessons: LessonMeta[];
  busy: boolean;
  run: (action: string, payload: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  const [track, setTrack] = useState<Track>("CSE");
  const [topicModal, setTopicModal] = useState<Partial<Topic> | null>(null);
  const [lessonModal, setLessonModal] = useState<(Partial<LessonMeta> & { content?: string; video_url?: string }) | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  const trackTopics = topics.filter((t) => t.track === track);
  const topicLessons = lessons.filter((l) => l.topic_id === selectedTopic);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {(["CSE", "LET"] as Track[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTrack(t); setSelectedTopic(null); }}
              className={`rounded-xl px-5 py-2 text-sm font-bold transition ${
                track === t ? (t === "CSE" ? "bg-[#16a34a] text-white" : "bg-[#ca8a04] text-white") : "border border-[#d9e6d3] bg-white text-[#5c7863]"
              }`}
            >
              {t === "CSE" ? "🏛️ CSE" : "🍎 LET"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setTopicModal({ track, order_index: trackTopics.length + 1 })}
          className="btn-primary px-5 py-2.5 text-sm"
        >
          + New Topic
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Topics list */}
        <div className="space-y-3">
          {trackTopics.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelectedTopic(t.id)}
              className={`card cursor-pointer p-4 transition ${selectedTopic === t.id ? "ring-2 ring-[#d4af37]" : "card-hover"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-[#16331f]">{t.title}</div>
                  <div className="text-xs text-[#5c7863]">
                    {lessons.filter((l) => l.topic_id === t.id).length} lessons · order {t.order_index}
                    {!t.is_published && " · 🫥 draft"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={(e) => { e.stopPropagation(); setTopicModal(t); }} className="rounded-md bg-[#dcfce7] px-2 py-1 text-xs font-bold text-[#15803d]">Edit</button>
                  <button
                    disabled={busy}
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete topic "${t.title}" and all its lessons?`)) run("delete_topic", { id: t.id }, "Topic deleted"); }}
                    className="rounded-md bg-[#fee2e2] px-2 py-1 text-xs font-bold text-[#991b1b]"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
          {trackTopics.length === 0 && <div className="card p-6 text-center text-sm text-[#5c7863]">No topics in {track} yet.</div>}
        </div>

        {/* Lessons of selected topic */}
        <div className="lg:col-span-2">
          {selectedTopic ? (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold text-[#16331f]">
                  Lessons · {topics.find((t) => t.id === selectedTopic)?.title}
                </h3>
                <button
                  onClick={() => setLessonModal({ topic_id: selectedTopic, order_index: topicLessons.length + 1 })}
                  className="rounded-xl bg-gradient-to-br from-[#16a34a] to-[#d4af37] px-4 py-2 text-xs font-bold text-white shadow"
                >
                  + New Lesson
                </button>
              </div>
              <div className="space-y-3">
                {topicLessons.map((l) => (
                  <div key={l.id} className="card flex items-center justify-between gap-3 p-4">
                    <div>
                      <div className="font-semibold text-[#16331f]">{l.title}</div>
                      <div className="text-xs text-[#5c7863]">
                        order {l.order_index}
                        {l.is_free ? " · 🎁 free" : " · 🔒 paid"}
                        {!l.is_published && " · 🫥 draft"}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setLessonModal(l)} className="rounded-md bg-[#dcfce7] px-2 py-1 text-xs font-bold text-[#15803d]">Edit</button>
                      <button
                        disabled={busy}
                        onClick={() => { if (confirm(`Delete lesson "${l.title}"?`)) run("delete_lesson", { id: l.id }, "Lesson deleted"); }}
                        className="rounded-md bg-[#fee2e2] px-2 py-1 text-xs font-bold text-[#991b1b]"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                {topicLessons.length === 0 && <div className="card p-6 text-center text-sm text-[#5c7863]">No lessons yet. Click &quot;+ New Lesson&quot;.</div>}
              </div>
            </div>
          ) : (
            <div className="card flex h-full items-center justify-center p-10 text-sm text-[#5c7863]">
              ← Pick a topic to see its lessons
            </div>
          )}
        </div>
      </div>

      {/* Topic modal */}
      {topicModal && (
        <Modal title={topicModal.id ? "Edit Topic" : "New Topic"} onClose={() => setTopicModal(null)}>
          <TopicForm
            initial={topicModal}
            busy={busy}
            onSave={async (payload) => { await run("save_topic", payload, "Topic saved"); setTopicModal(null); }}
          />
        </Modal>
      )}

      {/* Lesson modal */}
      {lessonModal && (
        <Modal title={lessonModal.id ? "Edit Lesson" : "New Lesson"} onClose={() => setLessonModal(null)} wide>
          <LessonForm
            initial={lessonModal}
            busy={busy}
            onSave={async (payload) => { await run("save_lesson", payload, "Lesson saved"); setLessonModal(null); }}
          />
        </Modal>
      )}
    </div>
  );
}

function TopicForm({
  initial,
  busy,
  onSave,
}: {
  initial: Partial<Topic>;
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [f, setF] = useState({
    track: initial.track || "CSE",
    title: initial.title || "",
    description: initial.description || "",
    order_index: initial.order_index ?? 1,
    is_published: initial.is_published !== false,
  });
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void onSave({ ...f, id: initial.id }); }}
      className="space-y-4"
    >
      <Field label="Track">
        <select className="input-warm" value={f.track} onChange={(e) => setF({ ...f, track: e.target.value as Track })}>
          <option value="CSE">CSE</option>
          <option value="LET">LET</option>
        </select>
      </Field>
      <Field label="Title">
        <input className="input-warm" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Mathematics" />
      </Field>
      <Field label="Description">
        <textarea className="input-warm" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <div className="flex gap-4">
        <Field label="Order">
          <input type="number" className="input-warm" value={f.order_index} onChange={(e) => setF({ ...f, order_index: Number(e.target.value) })} />
        </Field>
        <Field label="Published">
          <label className="flex h-[42px] items-center gap-2 text-sm">
            <input type="checkbox" checked={f.is_published} onChange={(e) => setF({ ...f, is_published: e.target.checked })} />
            Visible to users
          </label>
        </Field>
      </div>
      <button disabled={busy} className="btn-primary w-full py-3 text-sm">Save Topic</button>
    </form>
  );
}

function LessonForm({
  initial,
  busy,
  onSave,
}: {
  initial: Partial<LessonMeta> & { content?: string; video_url?: string };
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [f, setF] = useState({
    title: initial.title || "",
    content: initial.content || "",
    video_url: initial.video_url || "",
    order_index: initial.order_index ?? 1,
    is_published: initial.is_published !== false,
    is_free: initial.is_free === true,
  });
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void onSave({ ...f, id: initial.id, topic_id: initial.topic_id }); }}
      className="space-y-4"
    >
      <Field label="Title">
        <input className="input-warm" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </Field>
      <Field label="Video URL (optional — YouTube link)">
        <input className="input-warm" value={f.video_url} onChange={(e) => setF({ ...f, video_url: e.target.value })} placeholder="https://youtube.com/watch?v=..." />
      </Field>
      <Field label="Content (HTML — plain text works too)">
        <textarea
          className="input-warm font-mono text-xs"
          rows={14}
          value={f.content}
          onChange={(e) => setF({ ...f, content: e.target.value })}
          placeholder="<h2>Lesson title</h2><p>Content...</p>"
        />
      </Field>
      <div className="flex flex-wrap gap-6">
        <Field label="Order">
          <input type="number" className="input-warm w-24" value={f.order_index} onChange={(e) => setF({ ...f, order_index: Number(e.target.value) })} />
        </Field>
        <Field label="Visibility">
          <label className="flex h-[42px] items-center gap-2 text-sm">
            <input type="checkbox" checked={f.is_published} onChange={(e) => setF({ ...f, is_published: e.target.checked })} />
            Published
          </label>
        </Field>
        <Field label="Access">
          <label className="flex h-[42px] items-center gap-2 text-sm">
            <input type="checkbox" checked={f.is_free} onChange={(e) => setF({ ...f, is_free: e.target.checked })} />
            🎁 Free preview (visible even to non-subscribers)
          </label>
        </Field>
      </div>
      <button disabled={busy} className="btn-primary w-full py-3 text-sm">Save Lesson</button>
    </form>
  );
}

/* ---------- Exams tab ---------- */

function ExamsTab({
  exams,
  topics,
  busy,
  run,
}: {
  exams: (ExamWithCount & { exam_questions?: { count: number }[] })[];
  topics: Topic[];
  busy: boolean;
  run: (action: string, payload: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  const router = useRouter();
  const [examModal, setExamModal] = useState<Partial<ExamWithCount> | null>(null);
  const [openQuestions, setOpenQuestions] = useState<string | null>(null);
  const [questionModal, setQuestionModal] = useState<{ exam_id: string; q?: Partial<Question> } | null>(null);
  const [importExam, setImportExam] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);

  const cse = exams.filter((e) => e.track === "CSE");
  const letx = exams.filter((e) => e.track === "LET");

  const loadQuestions = async (examId: string): Promise<Question[]> => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase
      .from("exam_questions")
      .select("*")
      .eq("exam_id", examId)
      .order("order_index");
    const rows = (data as Question[]) || [];
    if (rows.length === 0) return rows;
    // The answer key lives in question_keys (admins can read it directly).
    const { data: keys } = await supabase
      .from("question_keys")
      .select("question_id, correct_choice, explanation")
      .in("question_id", rows.map((r) => r.id));
    const byId = new Map((keys ?? []).map((k: { question_id: string; correct_choice: string; explanation: string | null }) => [k.question_id, k]));
    return rows.map((r) => ({
      ...r,
      correct_choice: (byId.get(r.id)?.correct_choice as "A" | "B" | "C" | "D") ?? "A",
      explanation: byId.get(r.id)?.explanation ?? null,
    }));
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button
          onClick={() => setExamModal({ track: "CSE", mode: "mock", duration_minutes: 60, level: "both", subjects: [], question_count: 0, difficulty: 0, passing_pct: 80, order_index: 0 })}
          className="btn-primary px-5 py-2.5 text-sm"
        >
          + New Exam
        </button>
      </div>

      {(["CSE", "LET"] as Track[]).map((t) => (
        <section key={t}>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#5c7863]">
            {t === "CSE" ? "🏛️ CSE Exams" : "🍎 LET Exams"}
          </h3>
          <div className="space-y-3">
            {(t === "CSE" ? cse : letx).map((e) => (
              <ExamRow
                key={e.id}
                e={e}
                busy={busy}
                run={run}
                router={router}
                isOpen={openQuestions === e.id}
                onToggle={() => setOpenQuestions(openQuestions === e.id ? null : e.id)}
                onImport={() => setImportExam(e.id)}
                onEdit={() => setExamModal(e)}
                onAddQuestion={() => setQuestionModal({ exam_id: e.id })}
                onEditQuestion={(q) => setQuestionModal({ exam_id: e.id, q })}
                loadQuestions={loadQuestions}
              />
            ))}
            {(t === "CSE" ? cse : letx).length === 0 && (
              <div className="card p-6 text-center text-sm text-[#5c7863]">No {t} exams yet.</div>
            )}
          </div>
        </section>
      ))}

      {/* Exam modal */}
      {examModal && (
        <Modal title={examModal.id ? "Edit Exam" : "New Exam"} onClose={() => setExamModal(null)}>
          <ExamForm
            initial={examModal}
            topics={topics}
            busy={busy}
            onSave={async (payload) => { await run("save_exam", payload, "Exam saved"); setExamModal(null); }}
          />
        </Modal>
      )}

      {/* Question modal */}
      {questionModal && (
        <Modal title={questionModal.q?.id ? "Edit Question" : "New Question"} onClose={() => setQuestionModal(null)} wide>
          <QuestionForm
            initial={questionModal.q || {}}
            busy={busy}
            onSave={async (payload) => {
              await run("save_question", { ...payload, exam_id: questionModal.exam_id }, "Question saved");
              setQuestionModal(null);
              router.refresh();
            }}
          />
        </Modal>
      )}

      {/* Import modal — pins questions straight to this exam (curated paper) */}
      {importExam && (
        <Modal title="Import Questions into this Exam" onClose={() => { setImportExam(null); setImportErr(null); }} wide>
          {(() => {
            const target = exams.find((x) => x.id === importExam);
            let parsedCount = 0;
            let warnings: string[] = [];
            let parseError: string | null = null;
            if (importText.trim()) {
              try {
                const batch = parseBulkQuestions(importText);
                parsedCount = batch.questions.length;
                warnings = batch.warnings;
              } catch (e) {
                parseError = e instanceof Error ? e.message : "Parse error";
              }
            }
            return (
              <>
                <p className="mb-3 rounded-xl bg-[#dcfce7] px-4 py-3 text-xs leading-relaxed text-[#15803d]">
                  Use this only when you want a <strong>hand-picked paper</strong> (the exact items, in this order).
                  For everyday content, put the questions in the <strong>🧠 Question Bank</strong> tab instead — mocks
                  and drills then draw from it automatically.
                  <br />
                  Paste format: one block per question, blank line between them —
                  <code className="mt-1 block whitespace-pre-wrap">
                    {"1. Question here\nA) choice\nB) choice\nC) choice\nD) choice\nANSWER: B\nEXPLANATION: bakit"}
                  </code>
                  Tag lines (SUBJECT:, LEVEL:, SUBTOPIC:, DIFFICULTY:, SPECIALIZATION:, FREE:) are read too.
                  Excel/Sheets paste also works if you put question, A, B, C, D, ANSWER in the columns.
                </p>
                <textarea
                  className="input-warm font-mono text-xs"
                  rows={14}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={"1. What is 2+2?\nA) 3\nB) 4\nC) 5\nD) 6\nANSWER: B\nEXPLANATION: Basic addition.\n\n2. ..."}
                />
                {parseError && (
                  <div className="mt-3 rounded-xl bg-[#fee2e2] px-4 py-3 text-sm text-[#991b1b]">✕ {parseError}</div>
                )}
                {!parseError && parsedCount > 0 && (
                  <div className="mt-3 rounded-xl bg-[#dcfce7] px-4 py-3 text-sm text-[#166534]">
                    ✅ {parsedCount} questions ready to pin to “{target?.title ?? "this exam"}”.
                    {warnings.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                        {warnings.slice(0, 6).map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {importErr && <div className="mt-3 rounded-xl bg-[#fee2e2] px-4 py-3 text-sm text-[#991b1b]">{importErr}</div>}
                <button
                  disabled={busy || !importText.trim() || parsedCount === 0}
                  onClick={async () => {
                    setImportErr(null);
                    try {
                      const batch = parseBulkQuestions(importText);
                      await run(
                        "import_questions",
                        {
                          questions: batch.questions,
                          defaults: {
                            track: target?.track ?? "CSE",
                            level: target?.level ?? "both",
                            subject: target?.subjects?.[0] ?? null,
                            exam_id: importExam,
                          },
                        },
                        `${batch.questions.length} questions imported into this exam!`
                      );
                      setImportExam(null);
                      setImportText("");
                      router.refresh();
                    } catch (e) {
                      setImportErr(e instanceof Error ? e.message : "Parse error");
                    }
                  }}
                  className="btn-primary mt-4 w-full py-3 text-sm disabled:opacity-50"
                >
                  Pin {parsedCount || ""} questions to this exam
                </button>
              </>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}

function ExamRow({
  e,
  busy,
  run,
  router,
  isOpen,
  onToggle,
  onImport,
  onEdit,
  onAddQuestion,
  onEditQuestion,
  loadQuestions,
}: {
  e: ExamWithCount & { exam_questions?: { count: number }[] };
  busy: boolean;
  run: (action: string, payload: Record<string, unknown>, okMsg: string) => Promise<void>;
  router: ReturnType<typeof useRouter>;
  isOpen: boolean;
  onToggle: () => void;
  onImport: () => void;
  onEdit: () => void;
  onAddQuestion: () => void;
  onEditQuestion: (q: Question) => void;
  loadQuestions: (examId: string) => Promise<Question[]>;
}) {
  const pinned = e.exam_questions?.[0]?.count ?? 0;
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="flex items-center gap-2 font-bold text-[#16331f]">
            {e.is_free_preview && <span className="badge badge-approved">FREE</span>}
            {!e.is_active && <span className="badge badge-expired">INACTIVE</span>}
            {e.title}
          </div>
          <div className="text-xs text-[#5c7863]">
            {e.mode} · {e.level} · {e.duration_minutes} min · {e.passing_pct}% to pass ·{" "}
            {pinned > 0 ? `${pinned} pinned items` : `draws ${e.question_count || "all"} from the bank`}
          </div>
          {e.subjects && e.subjects.length > 0 && (
            <div className="mt-0.5 text-xs text-[#94a896]">{e.subjects.join(" · ")}</div>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <button onClick={onToggle} className="rounded-md bg-[#dcfce7] px-3 py-1.5 text-xs font-bold text-[#15803d]">
            {isOpen ? "Hide" : "Questions"}
          </button>
          <button onClick={onImport} className="rounded-md bg-[#dcfce7] px-3 py-1.5 text-xs font-bold text-[#0369a1]">Import</button>
          <button onClick={onEdit} className="rounded-md bg-[#dcfce7] px-3 py-1.5 text-xs font-bold text-[#15803d]">Edit</button>
          <button
            disabled={busy}
            onClick={() => { if (confirm(`Delete exam "${e.title}" and all its questions?`)) void run("delete_exam", { id: e.id }, "Exam deleted"); }}
            className="rounded-md bg-[#fee2e2] px-3 py-1.5 text-xs font-bold text-[#991b1b]"
          >
            ✕
          </button>
        </div>
      </div>

      {isOpen && (
        <QuestionList
          examId={e.id}
          loadQuestions={loadQuestions}
          onAdd={onAddQuestion}
          onEdit={onEditQuestion}
          busy={busy}
          run={run}
          router={router}
        />
      )}
    </div>
  );
}

function QuestionList({
  examId,
  loadQuestions,
  onAdd,
  onEdit,
  busy,
  run,
  router,
}: {
  examId: string;
  loadQuestions: (examId: string) => Promise<Question[]>;
  onAdd: () => void;
  onEdit: (q: Question) => void;
  busy: boolean;
  run: (action: string, payload: Record<string, unknown>, okMsg: string) => Promise<void>;
  router: ReturnType<typeof useRouter>;
}) {
  const [qs, setQs] = useState<Question[] | null>(null);

  const refresh = async () => setQs(await loadQuestions(examId));

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  return (
    <div className="border-t border-[#d9e6d3] bg-[#f6faf4] p-4">
      <div className="mb-3 flex justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-[#5c7863]">
          {qs === null ? "Loading…" : `${qs.length} questions`}
        </span>
        <button onClick={onAdd} className="rounded-md bg-[#dcfce7] px-3 py-1.5 text-xs font-bold text-[#166534]">+ Add question</button>
      </div>
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {(qs || []).map((q, i) => (
          <div key={q.id} className="rounded-xl border border-[#d9e6d3] bg-white p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong>{i + 1}.</strong> {q.question_text}
                <div className="mt-1 text-xs text-[#5c7863]">
                  ✓ {q.correct_choice} · {q.choice_a} / {q.choice_b} / {q.choice_c} / {q.choice_d}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => onEdit(q)} className="rounded bg-[#dcfce7] px-2 py-1 text-xs font-bold text-[#15803d]">Edit</button>
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (!confirm("Delete question?")) return;
                    await run("delete_question", { id: q.id }, "Question deleted");
                    void refresh();
                    router.refresh();
                  }}
                  className="rounded bg-[#fee2e2] px-2 py-1 text-xs font-bold text-[#991b1b]"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
        {qs !== null && qs.length === 0 && (
          <div className="p-4 text-center text-sm text-[#5c7863]">No questions yet — add or import some!</div>
        )}
      </div>
    </div>
  );
}

function ExamForm({
  initial,
  topics,
  busy,
  onSave,
}: {
  initial: Partial<ExamWithCount>;
  topics: Topic[];
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [f, setF] = useState({
    track: initial.track || "CSE",
    title: initial.title || "",
    description: initial.description || "",
    mode: initial.mode || "mock",
    topic: initial.topic || "",
    level: (initial.level as string) || "both",
    subjects: (initial.subjects as string[] | null) ?? [],
    question_count: initial.question_count ?? 0,
    difficulty: initial.difficulty ?? 0,
    passing_pct: initial.passing_pct ?? (initial.track === "LET" ? 75 : 80),
    duration_minutes: initial.duration_minutes ?? 60,
    order_index: initial.order_index ?? 0,
    is_free_preview: initial.is_free_preview === true,
    is_active: initial.is_active !== false,
  });
  const trackTopics = topics.filter((t) => t.track === f.track);
  const levelChoices = MATERIAL[f.track];
  const subjectChoices = subjectsFor(f.track, f.level === "both" ? "both" : f.level).map((s) => s.key);

  const toggleSubject = (s: string) =>
    setF((prev) => ({
      ...prev,
      subjects: prev.subjects.includes(s) ? prev.subjects.filter((x) => x !== s) : [...prev.subjects, s],
    }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); void onSave({ ...f, id: initial.id }); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Track">
          <select
            className="input-warm"
            value={f.track}
            onChange={(e) => setF({ ...f, track: e.target.value as Track, topic: "", subjects: [], level: "both", passing_pct: e.target.value === "LET" ? 75 : 80 })}
          >
            <option value="CSE">CSE</option>
            <option value="LET">LET</option>
          </select>
        </Field>
        <Field label="Mode">
          <select className="input-warm" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as "mock" | "practice" })}>
            <option value="mock">Mock (timed, no answers until submit)</option>
            <option value="practice">Practice (instant explanation)</option>
          </select>
        </Field>
      </div>

      <Field label="Title">
        <input className="input-warm" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </Field>

      <Field label="Description">
        <textarea className="input-warm" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Which paper? (level)">
          <select className="input-warm" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value, subjects: [] })}>
            <option value="both">Both levels</option>
            {levelChoices.map((l) => (
              <option key={l.key} value={l.key}>
                {l.short}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Passing mark (%)">
          <input type="number" className="input-warm" value={f.passing_pct} onChange={(e) => setF({ ...f, passing_pct: Number(e.target.value) })} />
        </Field>
      </div>

      <Field label="Sections this paper draws from">
        <div className="flex flex-wrap gap-2">
          {subjectChoices.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => toggleSubject(s)}
              className={`rounded-xl border-2 px-3 py-2 text-xs font-bold transition ${
                f.subjects.includes(s) ? "border-[#16a34a] bg-[#dcfce7] text-[#16331f]" : "border-[#d9e6d3] bg-white text-[#3d5c44]"
              }`}
            >
              {subjectIcon(f.track, s)} {s}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-[#94a896]">
          Tick nothing to draw from the whole {f.track} bank for this level.
        </p>
      </Field>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Items to draw">
          <input type="number" className="input-warm" value={f.question_count} onChange={(e) => setF({ ...f, question_count: Number(e.target.value) })} />
        </Field>
        <Field label="Duration (min)">
          <input type="number" className="input-warm" value={f.duration_minutes} onChange={(e) => setF({ ...f, duration_minutes: Number(e.target.value) })} />
        </Field>
        <Field label="Difficulty">
          <select className="input-warm" value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: Number(e.target.value) })}>
            <option value={0}>Mixed</option>
            <option value={1}>Easy only</option>
            <option value={2}>Average only</option>
            <option value={3}>Hard only</option>
          </select>
        </Field>
        <Field label="Sort order">
          <input type="number" className="input-warm" value={f.order_index} onChange={(e) => setF({ ...f, order_index: Number(e.target.value) })} />
        </Field>
      </div>

      <p className="rounded-xl bg-[#dcfce7] px-4 py-3 text-xs leading-relaxed text-[#15803d]">
        Items to draw = how many questions the student gets, taken at random from the bank every attempt (0 = use the
        questions pinned to this exam instead, in order). A question is pinned when you add it from inside this exam.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Legacy topic label (optional)">
          <input className="input-warm" list="topic-list" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="e.g. Mathematics" />
          <datalist id="topic-list">
            {trackTopics.map((t) => (
              <option key={t.id} value={t.title} />
            ))}
          </datalist>
        </Field>
        <div className="flex items-end gap-6 pb-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.is_free_preview} onChange={(e) => setF({ ...f, is_free_preview: e.target.checked })} />
            🎁 Free preview
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
            Active
          </label>
        </div>
      </div>

      <button disabled={busy} className="btn-primary w-full py-3 text-sm">Save Exam</button>
    </form>
  );
}

function QuestionForm({
  initial,
  busy,
  onSave,
}: {
  initial: Partial<Question>;
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [f, setF] = useState({
    order_index: initial.order_index ?? 1,
    question_text: initial.question_text || "",
    choice_a: initial.choice_a || "",
    choice_b: initial.choice_b || "",
    choice_c: initial.choice_c || "",
    choice_d: initial.choice_d || "",
    correct_choice: initial.correct_choice || "A",
    explanation: initial.explanation || "",
    track: (initial.track as string) || "CSE",
    level: (initial.level as string) || "both",
    subject: (initial.subject as string) || "",
    subtopic: (initial.subtopic as string) || "",
    specialization: (initial.specialization as string) || "",
    difficulty: initial.difficulty ?? 2,
    is_free: initial.is_free === true,
    is_active: initial.is_active !== false,
    source: (initial.source as string) || "",
  });
  const set = (k: string, v: string | number | boolean) => setF({ ...f, [k]: v });
  const subjectChoices = subjectsFor(f.track as Track, f.level === "both" ? "both" : f.level).map((s) => s.key);
  return (
    <form onSubmit={(e) => { e.preventDefault(); void onSave(f); }} className="space-y-3">
      <Field label="Question">
        <textarea className="input-warm" rows={2} required value={f.question_text} onChange={(e) => set("question_text", e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["a", "b", "c", "d"] as const).map((c) => (
          <Field key={c} label={`Choice ${c.toUpperCase()}${f.correct_choice === c.toUpperCase() ? " ✓" : ""}`}>
            <div className="flex gap-2">
              <input className="input-warm" required value={f[`choice_${c}`]} onChange={(e) => set(`choice_${c}`, e.target.value)} />
              <button
                type="button"
                onClick={() => set("correct_choice", c.toUpperCase())}
                title="Mark as correct"
                className={`shrink-0 rounded-xl px-3 text-sm font-bold ${
                  f.correct_choice === c.toUpperCase() ? "bg-[#22c55e] text-white" : "bg-[#dcfce7] text-[#15803d]"
                }`}
              >
                ✓
              </button>
            </div>
          </Field>
        ))}
      </div>
      <Field label="Explanation (shown to the user afterward)">
        <textarea className="input-warm" rows={2} value={f.explanation} onChange={(e) => set("explanation", e.target.value)} />
      </Field>

      <div className="rounded-2xl border border-[#d9e6d3] p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#5c7863]">
          Bank tags — these decide which mocks, drills and flashcards use this item
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Track">
            <select className="input-warm" value={f.track} onChange={(e) => setF({ ...f, track: e.target.value, subject: "" })}>
              <option value="CSE">CSE</option>
              <option value="LET">LET</option>
            </select>
          </Field>
          <Field label="Level">
            <select className="input-warm" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value, subject: "" })}>
              <option value="both">Shared by both levels</option>
              {MATERIAL[f.track as Track].map((l) => (
                <option key={l.key} value={l.key}>
                  {l.short}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Subject">
            <select className="input-warm" value={f.subject} onChange={(e) => set("subject", e.target.value)}>
              <option value="">— none —</option>
              {subjectChoices.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Subtopic (optional)">
            <input className="input-warm" value={f.subtopic} onChange={(e) => set("subtopic", e.target.value)} placeholder="e.g. Fractions" />
          </Field>
          <Field label="Majorship (Specialization only)">
            <input className="input-warm" value={f.specialization} onChange={(e) => set("specialization", e.target.value)} placeholder="e.g. Mathematics" />
          </Field>
          <Field label="Difficulty">
            <select className="input-warm" value={f.difficulty} onChange={(e) => set("difficulty", Number(e.target.value))}>
              <option value={1}>Easy</option>
              <option value={2}>Average</option>
              <option value={3}>Hard</option>
            </select>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.is_free} onChange={(e) => set("is_free", e.target.checked)} />
            🎁 Free preview item
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} />
            Active
          </label>
          <Field label="Source (optional)">
            <input className="input-warm" value={f.source} onChange={(e) => set("source", e.target.value)} placeholder="e.g. CSE Reviewer Vol. 1" />
          </Field>
        </div>
      </div>

      <Field label="Order (only matters for hand-pinned papers)">
        <input type="number" className="input-warm w-24" value={f.order_index} onChange={(e) => set("order_index", Number(e.target.value))} />
      </Field>
      <button disabled={busy} className="btn-primary w-full py-3 text-sm">Save Question</button>
    </form>
  );
}

/* ---------- Settings tab ---------- */

/* ---------- testimonials ---------- */

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "reviewee";

/**
 * Prepare a photo for upload: shrink huge phone photos (keeps the site fast)
 * and reject formats the browser can't render (iPhone HEIC).
 */
async function preparePhoto(
  file: File
): Promise<{ data: Blob; contentType: string; ext: string }> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = null;
  }

  const ext0 = (file.type.split("/")[1] || "jpg").toLowerCase();

  if (!bitmap) {
    const safe = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    if (!safe) {
      throw new Error(
        "This photo can't be read by browsers (iPhone HEIC?). Save it as JPG/PNG first, or take a screenshot of it."
      );
    }
    return { data: file, contentType: file.type, ext: ext0 };
  }

  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 1_200_000 && file.type !== "image/gif") {
    return { data: file, contentType: file.type || "image/jpeg", ext: ext0 };
  }

  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { data: file, contentType: file.type || "image/jpeg", ext: ext0 };
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
  if (!blob) return { data: file, contentType: file.type || "image/jpeg", ext: ext0 };
  return { data: blob, contentType: "image/jpeg", ext: "jpg" };
}

function MiniStars({ rating }: { rating: number }) {
  return (
    <span className="text-sm leading-none text-[#d4af37]" aria-label={`${rating} out of 5`}>
      {"★".repeat(rating)}
      <span className="text-[#e2e8f0]">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function TestimonialsTab({
  testimonials,
  busy,
  run,
}: {
  testimonials: Testimonial[];
  busy: boolean;
  run: (action: string, payload: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<"ALL" | Track>("ALL");
  const [modal, setModal] = useState<Partial<Testimonial> | null>(null);

  const shown = testimonials.filter((t) => filter === "ALL" || t.track === filter);
  const published = testimonials.filter((t) => t.is_published).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {(["ALL", "CSE", "LET"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                filter === f
                  ? f === "CSE"
                    ? "bg-[#16a34a] text-white"
                    : f === "LET"
                      ? "bg-[#ca8a04] text-white"
                      : "bg-[#16331f] text-white"
                  : "border border-[#d9e6d3] bg-white text-[#5c7863]"
              }`}
            >
              {f === "ALL" ? "All" : f}
            </button>
          ))}
        </div>
        <button
          onClick={() =>
            setModal({
              track: "CSE",
              rating: 5,
              is_published: true,
              sort_order: testimonials.length + 1,
            })
          }
          className="btn-primary px-5 py-2.5 text-sm"
        >
          + New Testimonial
        </button>
      </div>

      <p className="mb-4 text-xs text-[#5c7863]">
        {published} testimonial{published === 1 ? "" : "s"} showing on the landing page ·{" "}
        {testimonials.length - published} hidden draft{testimonials.length - published === 1 ? "" : "s"}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((t) => (
          <div key={t.id} className="card flex flex-col p-5">
            <div className="mb-3 flex items-start gap-3">
              {t.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.photo_url}
                  alt={t.name}
                  className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-[#d9e6d3]"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#16a34a] to-[#d4af37] text-sm font-bold text-white">
                  {t.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-[#16331f]">{t.name}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${trackPill(t.track)}`}>
                    {t.track}
                  </span>
                  <MiniStars rating={t.rating} />
                </div>
                <div className="truncate text-[11px] text-[#5c7863]">{t.role || "—"}</div>
              </div>
            </div>
            <p className="mb-4 line-clamp-4 flex-1 text-xs leading-relaxed text-[#3d5c44]">{t.quote}</p>
            <div className="flex items-center justify-between gap-2 border-t border-[#d9e6d3] pt-3">
              <div className="text-[10px] text-[#5c7863]">
                order {t.sort_order} ·{" "}
                {t.is_published ? (
                  <span className="font-bold text-[#15803d]">✅ published</span>
                ) : (
                  <span className="font-bold text-[#b45309]">🫥 hidden</span>
                )}
                {!t.photo_url && <span className="ml-1">· 📷 no photo</span>}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => setModal(t)}
                  className="rounded-md bg-[#dcfce7] px-2 py-1 text-xs font-bold text-[#15803d]"
                >
                  Edit
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Delete the testimonial from "${t.name}"?`))
                      void run("delete_testimonial", { id: t.id }, "Testimonial deleted");
                  }}
                  className="rounded-md bg-[#fee2e2] px-2 py-1 text-xs font-bold text-[#991b1b]"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {shown.length === 0 && (
        <div className="card p-8 text-center text-sm text-[#5c7863]">
          No testimonials {filter === "ALL" ? "yet" : `in ${filter} yet`}. Click &quot;+ New
          Testimonial&quot; to add a real one — picture, name, and message.
        </div>
      )}

      {modal && (
        <Modal
          title={modal.id ? "Edit Testimonial" : "New Testimonial"}
          onClose={() => setModal(null)}
        >
          <TestimonialForm
            initial={modal}
            busy={busy}
            onSave={async (payload) => {
              await run("save_testimonial", payload, "Testimonial saved — check the landing page!");
              setModal(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function TestimonialForm({
  initial,
  busy,
  onSave,
}: {
  initial: Partial<Testimonial>;
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [track, setTrack] = useState<Track>(initial.track ?? "CSE");
  const [role, setRole] = useState(initial.role ?? "");
  const [quote, setQuote] = useState(initial.quote ?? "");
  const [rating, setRating] = useState(initial.rating ?? 5);
  const [sortOrder, setSortOrder] = useState(initial.sort_order ?? 0);
  const [isPublished, setIsPublished] = useState(initial.is_published !== false);
  const [photoUrl, setPhotoUrl] = useState(initial.photo_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const { data, contentType, ext } = await preparePhoto(file);
      const path = `${Date.now()}-${slugify(name || "reviewee")}.${ext}`;
      const { error } = await supabase.storage.from("testimonials").upload(path, data, {
        contentType,
        upsert: false,
        cacheControl: "31536000",
      });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("testimonials").getPublicUrl(path);
      setPhotoUrl(urlData.publicUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      setErr("Please enter the name of the reviewee.");
      return;
    }
    if (!quote.trim()) {
      setErr("Please enter their testimonial message.");
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      await onSave({
        id: initial.id,
        name,
        track,
        role,
        quote,
        rating,
        sort_order: sortOrder,
        is_published: isPublished,
        photo_url: photoUrl,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded-xl bg-[#fee2e2] px-4 py-3 text-sm text-[#991b1b]">✕ {err}</div>
      )}

      {/* Photo */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-[#3d5c44]">Photo</label>
        <div className="flex items-center gap-4">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="preview"
              className="h-20 w-20 rounded-full object-cover ring-4 ring-[#dcfce7]"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#f1f5f1] text-2xl">
              📷
            </div>
          )}
          <div className="space-y-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => void pickFile(e.target.files?.[0])}
              className="block text-xs text-[#5c7863] file:mr-3 file:rounded-lg file:border-0 file:bg-[#dcfce7] file:px-3 file:py-2 file:text-xs file:font-bold file:text-[#15803d]"
            />
            <div className="text-[11px] text-[#5c7863]">
              {uploading ? "Uploading…" : "JPG or PNG. Big phone photos are resized automatically."}
            </div>
            {photoUrl && (
              <button
                onClick={() => setPhotoUrl("")}
                className="rounded-md bg-[#fee2e2] px-2 py-1 text-[11px] font-bold text-[#991b1b]"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input
            className="input-warm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Maria Santos"
          />
        </Field>
        <Field label="Track">
          <div className="flex gap-2">
            {(["CSE", "LET"] as Track[]).map((t) => (
              <button
                key={t}
                onClick={() => setTrack(t)}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold transition ${
                  track === t
                    ? t === "CSE"
                      ? "bg-[#16a34a] text-white"
                      : "bg-[#ca8a04] text-white"
                    : "border border-[#d9e6d3] bg-white text-[#5c7863]"
                }`}
              >
                {t === "CSE" ? "🏛️ CSE" : "🍎 LET"}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Role / result line (optional)">
        <input
          className="input-warm"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. CSE Professional passer"
        />
      </Field>

      <Field label="Testimonial message">
        <textarea
          className="input-warm"
          rows={5}
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          placeholder="Paste exactly what they said — Tagalog is fine."
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Stars">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                aria-label={`${n} stars`}
                className={`text-2xl leading-none transition ${
                  n <= rating ? "text-[#d4af37]" : "text-[#e2e8f0]"
                }`}
              >
                ★
              </button>
            ))}
          </div>
        </Field>
        <Field label="Order (lower shows first)">
          <input
            type="number"
            className="input-warm"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold text-[#3d5c44]">
        <input
          type="checkbox"
          checked={isPublished}
          onChange={(e) => setIsPublished(e.target.checked)}
          className="h-4 w-4"
        />
        Show on the landing page
      </label>

      <button
        onClick={() => void submit()}
        disabled={busy || saving || uploading}
        className="btn-primary w-full py-3 disabled:opacity-40"
      >
        {busy || saving ? "Saving…" : "Save testimonial"}
      </button>
    </div>
  );
}

/* ================= coaches ================= */

const coachBadge: Record<CoachTrack, string> = {
  CSE: "bg-[#dcfce7] text-[#15803d]",
  LET: "bg-[#fef9c3] text-[#b45309]",
  BOTH: "bg-gradient-to-r from-[#dcfce7] to-[#fef9c3] text-[#15803d]",
};

const coachTrackLabel: Record<CoachTrack, string> = {
  CSE: "🏛️ CSE",
  LET: "🍎 LET",
  BOTH: "🏛️🍎 CSE & LET",
};

function CoachesTab({
  coaches,
  busy,
  run,
}: {
  coaches: Coach[];
  busy: boolean;
  run: (action: string, payload: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<"ALL" | CoachTrack>("ALL");
  const [modal, setModal] = useState<Partial<Coach> | null>(null);

  const shown = coaches.filter((c) => filter === "ALL" || c.track === filter);
  const active = coaches.filter((c) => c.is_active).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {(["ALL", "CSE", "LET", "BOTH"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                filter === f
                  ? f === "CSE"
                    ? "bg-[#16a34a] text-white"
                    : f === "LET"
                      ? "bg-[#ca8a04] text-white"
                      : "bg-[#16331f] text-white"
                  : "border border-[#d9e6d3] bg-white text-[#5c7863]"
              }`}
            >
              {f === "ALL" ? "All" : f === "BOTH" ? "Both tracks" : f}
            </button>
          ))}
        </div>
        <button
          onClick={() =>
            setModal({
              track: "BOTH",
              is_active: true,
              sort_order: coaches.length + 1,
            })
          }
          className="btn-primary px-5 py-2.5 text-sm"
        >
          + New Coach
        </button>
      </div>

      <p className="mb-4 text-xs text-[#5c7863]">
        {active} coach{active === 1 ? "" : "es"} showing on the site · {coaches.length - active}{" "}
        hidden
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <div key={c.id} className="card flex flex-col p-5">
            <div className="mb-3 flex items-start gap-3">
              {c.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.photo_url}
                  alt={c.name}
                  className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-[#d9e6d3]"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#16a34a] to-[#d4af37] text-sm font-bold text-white">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-[#16331f]">{c.name}</div>
                <div className="mt-0.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${coachBadge[c.track]}`}>
                    {coachTrackLabel[c.track]}
                  </span>
                </div>
                <div className="truncate text-[11px] text-[#5c7863]">{c.title || "—"}</div>
              </div>
            </div>
            <p className="mb-1 truncate text-[11px] font-semibold text-[#3d5c44]">
              📚 {c.subjects || "no subjects listed"}
            </p>
            <p className="mb-4 line-clamp-3 flex-1 text-xs leading-relaxed text-[#5c7863]">
              {c.bio || "No bio yet."}
            </p>
            <div className="flex items-center justify-between gap-2 border-t border-[#d9e6d3] pt-3">
              <div className="text-[10px] text-[#5c7863]">
                order {c.sort_order} ·{" "}
                {c.is_active ? (
                  <span className="font-bold text-[#15803d]">✅ showing</span>
                ) : (
                  <span className="font-bold text-[#b45309]">🫥 hidden</span>
                )}
                {!c.photo_url && <span className="ml-1">· 📷 no photo</span>}
                {!c.facebook_url && <span className="ml-1">· no link</span>}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => setModal(c)}
                  className="rounded-md bg-[#dcfce7] px-2 py-1 text-xs font-bold text-[#15803d]"
                >
                  Edit
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Remove ${c.name} from the coaches list?`))
                      void run("delete_coach", { id: c.id }, "Coach removed");
                  }}
                  className="rounded-md bg-[#fee2e2] px-2 py-1 text-xs font-bold text-[#991b1b]"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {shown.length === 0 && (
        <div className="card p-8 text-center text-sm text-[#5c7863]">
          No coaches {filter === "ALL" ? "yet" : `in ${filter} yet`}. Click &quot;+ New Coach&quot;
          to add one — photo, name, subjects they teach, and their Facebook link.
          <div className="mt-2 text-xs">
            Coaches appear on the landing page (first 3) and on <b>/coaches</b>.
          </div>
        </div>
      )}

      {modal && (
        <Modal title={modal.id ? "Edit Coach" : "New Coach"} onClose={() => setModal(null)}>
          <CoachForm
            initial={modal}
            busy={busy}
            onSave={async (payload) => {
              await run("save_coach", payload, "Coach saved — check the site!");
              setModal(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function CoachForm({
  initial,
  busy,
  onSave,
}: {
  initial: Partial<Coach>;
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [title, setTitle] = useState(initial.title ?? "");
  const [subjects, setSubjects] = useState(initial.subjects ?? "");
  const [bio, setBio] = useState(initial.bio ?? "");
  const [facebookUrl, setFacebookUrl] = useState(initial.facebook_url ?? "");
  const [track, setTrack] = useState<CoachTrack>(initial.track ?? "BOTH");
  const [sortOrder, setSortOrder] = useState(initial.sort_order ?? 0);
  const [isActive, setIsActive] = useState(initial.is_active !== false);
  const [photoUrl, setPhotoUrl] = useState(initial.photo_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const { data, contentType, ext } = await preparePhoto(file);
      const path = `${Date.now()}-${slugify(name || "coach")}.${ext}`;
      const { error } = await supabase.storage.from("coaches").upload(path, data, {
        contentType,
        upsert: false,
        cacheControl: "31536000",
      });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("coaches").getPublicUrl(path);
      setPhotoUrl(urlData.publicUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      setErr("Please enter the coach's name.");
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      await onSave({
        id: initial.id,
        name,
        title,
        subjects,
        bio,
        facebook_url: facebookUrl,
        track,
        sort_order: sortOrder,
        is_active: isActive,
        photo_url: photoUrl,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded-xl bg-[#fee2e2] px-4 py-3 text-sm text-[#991b1b]">✕ {err}</div>
      )}

      {/* Photo */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-[#3d5c44]">Photo</label>
        <div className="flex items-center gap-4">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="preview"
              className="h-20 w-20 rounded-full object-cover ring-4 ring-[#dcfce7]"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#f1f5f1] text-2xl">
              📷
            </div>
          )}
          <div className="space-y-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => void pickFile(e.target.files?.[0])}
              className="block text-xs text-[#5c7863] file:mr-3 file:rounded-lg file:border-0 file:bg-[#dcfce7] file:px-3 file:py-2 file:text-xs file:font-bold file:text-[#15803d]"
            />
            <div className="text-[11px] text-[#5c7863]">
              {uploading
                ? "Uploading…"
                : "Best: a square head-and-shoulders photo. Big phone photos are resized automatically."}
            </div>
            {photoUrl && (
              <button
                onClick={() => setPhotoUrl("")}
                className="rounded-md bg-[#fee2e2] px-2 py-1 text-[11px] font-bold text-[#991b1b]"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input
            className="input-warm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Teacher Ceppee"
          />
        </Field>
        <Field label="Title / role">
          <input
            className="input-warm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Head Review Coach"
          />
        </Field>
      </div>

      <Field label="Subjects they teach (separate with commas)">
        <input
          className="input-warm"
          value={subjects}
          onChange={(e) => setSubjects(e.target.value)}
          placeholder="e.g. Math, English, Filipino"
        />
      </Field>

      <Field label="Short intro">
        <textarea
          className="input-warm"
          rows={4}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="2-3 sentences. What do they teach best? What should a reviewee ask them?"
        />
      </Field>

      <Field label="Facebook / Messenger link">
        <input
          className="input-warm"
          value={facebookUrl}
          onChange={(e) => setFacebookUrl(e.target.value)}
          placeholder="facebook.com/teacherceppee"
        />
      </Field>

      <Field label="Which track do they coach?">
        <div className="flex gap-2">
          {(["CSE", "LET", "BOTH"] as CoachTrack[]).map((t) => (
            <button
              key={t}
              onClick={() => setTrack(t)}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
                track === t
                  ? t === "CSE"
                    ? "bg-[#16a34a] text-white"
                    : t === "LET"
                      ? "bg-[#ca8a04] text-white"
                      : "bg-gradient-to-r from-[#16a34a] to-[#d4af37] text-white"
                  : "border border-[#d9e6d3] bg-white text-[#5c7863]"
              }`}
            >
              {t === "BOTH" ? "Both" : t}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Order (lower shows first)">
        <input
          type="number"
          className="input-warm"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm font-semibold text-[#3d5c44]">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4"
        />
        Show this coach on the site
      </label>

      <button
        onClick={() => void submit()}
        disabled={busy || saving || uploading}
        className="btn-primary w-full py-3 disabled:opacity-40"
      >
        {busy || saving ? "Saving…" : "Save coach"}
      </button>
    </div>
  );
}

function SettingsTab({
  settings,
  busy,
  run,
}: {
  settings: SiteSettings[];
  busy: boolean;
  run: (action: string, payload: Record<string, unknown>, okMsg: string) => Promise<void>;
}) {
  const get = (k: string) => settings.find((s) => s.key === k)?.value || "";
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="card p-6">
        <h3 className="mb-4 font-bold text-[#16331f]">📱 GCash Details</h3>
        <div className="space-y-4">
          <SettingField label="GCash Number" value={get("gcash_number")} onSave={(v) => run("save_setting", { key: "gcash_number", value: v }, "GCash number saved")} busy={busy} />
          <SettingField label="GCash Account Name" value={get("gcash_name")} onSave={(v) => run("save_setting", { key: "gcash_name", value: v }, "GCash name saved")} busy={busy} />
        </div>
      </div>
      <div className="card p-6">
        <h3 className="mb-4 font-bold text-[#16331f]">🏦 Bank Details</h3>
        <div className="space-y-4">
          <SettingField label="Bank Name" value={get("bank_name")} onSave={(v) => run("save_setting", { key: "bank_name", value: v }, "Bank name saved")} busy={busy} />
          <SettingField label="Account Name" value={get("bank_account_name")} onSave={(v) => run("save_setting", { key: "bank_account_name", value: v }, "Account name saved")} busy={busy} />
          <SettingField label="Account Number" value={get("bank_account_number")} onSave={(v) => run("save_setting", { key: "bank_account_number", value: v }, "Account number saved")} busy={busy} />
        </div>
      </div>
      <div className="card p-6 lg:col-span-2">
        <h3 className="mb-4 font-bold text-[#16331f]">📋 Payment Instructions (shown to users in the payment modal)</h3>
        <SettingField
          label="Instructions"
          textarea
          value={get("payment_instructions")}
          onSave={(v) => run("save_setting", { key: "payment_instructions", value: v }, "Instructions saved")}
          busy={busy}
        />
      </div>
    </div>
  );
}

function SettingField({
  label,
  value,
  onSave,
  busy,
  textarea,
}: {
  label: string;
  value: string;
  onSave: (v: string) => Promise<void>;
  busy: boolean;
  textarea?: boolean;
}) {
  const [v, setV] = useState(value);
  const dirty = v !== value;
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-[#3d5c44]">{label}</label>
      <div className="flex gap-2">
        {textarea ? (
          <textarea className="input-warm" rows={3} value={v} onChange={(e) => setV(e.target.value)} />
        ) : (
          <input className="input-warm" value={v} onChange={(e) => setV(e.target.value)} />
        )}
        <button
          disabled={busy || !dirty}
          onClick={() => void onSave(v)}
          className="shrink-0 self-stretch rounded-xl bg-gradient-to-br from-[#16a34a] to-[#d4af37] px-4 text-sm font-bold text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}

/* ---------- shared ---------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-[#3d5c44]">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`card max-h-[90vh] w-full overflow-y-auto p-7 ${wide ? "max-w-3xl" : "max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-[#16331f]">{title}</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-[#5c7863] hover:bg-[#dcfce7]">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
