"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { peso, fmtDate, fmtDateTime } from "@/lib/format";
import type { Track, PaymentRequest, Subscription, Topic, ExamWithCount, SiteSettings } from "@/lib/types";
import type { AdminProfile, LessonMeta } from "./page";

/* ================= helpers ================= */

async function postAdmin(action: string, payload: Record<string, unknown>) {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "May error na naganap");
  return data;
}

const trackPill = (t: Track) =>
  t === "CSE" ? "bg-[#fff0ef] text-[#f4444e]" : "bg-[#f5f0ff] text-[#7c3aed]";

/* ================= bulk question parser ================= */

function parseBulk(text: string): Array<Record<string, unknown>> {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) throw new Error("Walang naka-parse na questions.");
  return blocks.map((block, i) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const qText = lines[0].replace(/^\d+[.)]\s*/, "");
    let correct = "";
    let explanation = "";
    const choices: Record<string, string> = {};
    for (const line of lines.slice(1)) {
      const m = line.match(/^([A-Da-d])[.)]\s*(.+)$/);
      if (m) {
        choices[m[1].toUpperCase()] = m[2];
        continue;
      }
      const ans = line.match(/^(?:ANSWER|SAGOT)\s*[:=-]\s*([A-Da-d])/i);
      if (ans) {
        correct = ans[1].toUpperCase();
        continue;
      }
      const exp = line.match(/^(?:EXPLANATION|EXPL)\s*[:=-]\s*(.+)$/i);
      if (exp) {
        explanation = exp[1];
        continue;
      }
    }
    if (!qText || !choices.A || !choices.B || !choices.C || !choices.D) {
      throw new Error(`Block ${i + 1}: kulang ang question o apat na choices (A-D).`);
    }
    if (!correct) throw new Error(`Block ${i + 1}: walang ANSWER line (e.g. "ANSWER: B")`);
    return {
      order_index: i + 1,
      question_text: qText,
      choice_a: choices.A,
      choice_b: choices.B,
      choice_c: choices.C,
      choice_d: choices.D,
      correct_choice: correct,
      explanation,
    };
  });
}

/* ================= main ================= */

const TABS = [
  { id: "payments", label: "💰 Payments" },
  { id: "users", label: "👥 Users" },
  { id: "content", label: "📚 Lessons" },
  { id: "exams", label: "⏱️ Exams" },
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
}: {
  stats: Record<string, number>;
  payments: (PaymentRequest & { profile?: { email: string; full_name: string } })[];
  subs: (Subscription & { profile?: { email: string; full_name: string } })[];
  profiles: AdminProfile[];
  topics: Topic[];
  lessons: LessonMeta[];
  exams: (ExamWithCount & { exam_questions?: { count: number }[] })[];
  settings: SiteSettings[];
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
          <h1 className="text-3xl font-black text-[#3d3227]">🛠️ Admin Dashboard</h1>
          <p className="text-sm text-[#8c7a64]">Ceppee Review control center</p>
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
      <div className="mb-8 flex flex-wrap gap-2 rounded-2xl bg-[#fff5e0] p-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative rounded-xl px-4 py-2 text-sm font-bold transition ${
              tab === t.id ? "bg-white text-[#3d3227] shadow" : "text-[#92734a] hover:text-[#3d3227]"
            }`}
          >
            {t.label}
            {t.id === "payments" && pendingPayments.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#f4444e] text-[10px] font-black text-white">
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
            <h2 className="mb-4 text-lg font-bold text-[#3d3227]">
              ⏳ Pending verification ({pendingPayments.length})
            </h2>
            {pendingPayments.length === 0 ? (
              <div className="card p-6 text-sm text-[#8c7a64]">Walang pending. Enjoy the calm! ☕</div>
            ) : (
              <div className="space-y-5">
                {pendingPayments.map((p) => (
                  <PaymentCard
                    key={p.id}
                    p={p}
                    busy={busy}
                    onApprove={() => run("approve_payment", { payment_id: p.id }, `Approved! Na-activate na ang ${p.track} subscription.`)}
                    onReject={(note) => run("reject_payment", { payment_id: p.id, note }, "Rejected.")}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-4 text-lg font-bold text-[#3d3227]">📁 Reviewed ({reviewedPayments.length})</h2>
            <div className="card divide-y divide-[#f5e6cc]">
              {reviewedPayments.length === 0 && (
                <div className="p-6 text-sm text-[#8c7a64]">Wala pang na-review na payments.</div>
              )}
              {reviewedPayments.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                  <div>
                    <span className="font-semibold text-[#3d3227]">{p.profile?.email || "—"}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${trackPill(p.track)}`}>{p.track}</span>
                    <span className="ml-2 text-[#8c7a64]">{peso(p.amount)} · {fmtDateTime(p.created_at)}</span>
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
                    <div className="flex items-center gap-2 font-bold text-[#3d3227]">
                      {u.full_name || "—"}
                      {u.is_admin && <span className="badge badge-pending">👑 Admin</span>}
                    </div>
                    <div className="text-xs text-[#8c7a64]">{u.email}</div>
                  </div>
                  <div className="flex gap-2">
                    {(["CSE", "LET"] as Track[]).map((t) => {
                      const sub = t === "CSE" ? cseSub : letSub;
                      return (
                        <div key={t} className="rounded-xl border border-[#f5e6cc] px-3 py-2 text-center text-xs">
                          <div className={`mb-1 font-bold ${t === "CSE" ? "text-[#f4444e]" : "text-[#7c3aed]"}`}>{t}</div>
                          {sub ? (
                            <>
                              <div className="font-semibold text-[#16a34a]">✓ hanggang {fmtDate(sub.expires_at)}</div>
                              <div className="mt-1 flex justify-center gap-1">
                                <button disabled={busy} onClick={() => run("extend_sub", { user_id: u.id, track: t, days: 180 }, `${t} extended +180 days`)} className="rounded-md bg-[#fff5e0] px-2 py-1 font-bold text-[#92734a] hover:bg-[#ffe8cc]">+180d</button>
                                <button disabled={busy} onClick={() => run("revoke_sub", { user_id: u.id, track: t }, `${t} revoked`)} className="rounded-md bg-[#fee2e2] px-2 py-1 font-bold text-[#991b1b] hover:bg-[#fecaca]">Revoke</button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-[#b0a48e]">🔒 Walang sub</div>
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
                      className="self-center rounded-xl border border-[#f5e6cc] px-3 py-2 text-xs font-bold text-[#8c7a64] hover:border-[#ffa94d]"
                    >
                      {u.is_admin ? "Remove admin" : "Make admin"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {profiles.length === 0 && <div className="card p-6 text-sm text-[#8c7a64]">Wala pang users.</div>}
        </div>
      )}

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

      {/* ============ SETTINGS ============ */}
      {tab === "settings" && <SettingsTab settings={settings} busy={busy} run={run} />}
    </div>
  );
}

/* ================= sub-components ================= */

function StatCard({ label, value, hi }: { label: string; value: number; hi?: boolean }) {
  return (
    <div className={`card p-4 ${hi && value > 0 ? "border-[#ffa94d] ring-2 ring-[#ffa94d]/30" : ""}`}>
      <div className={`text-2xl font-black ${hi && value > 0 ? "text-[#f4444e]" : "text-[#3d3227]"}`}>{value}</div>
      <div className="text-xs text-[#8c7a64]">{label}</div>
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
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[#8c7a64]">Receipt</div>
          {p.receipt_url ? (
            <a href={p.receipt_url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.receipt_url} alt="Payment receipt" className="max-h-56 rounded-xl border border-[#f5e6cc] object-contain transition hover:opacity-90" />
            </a>
          ) : (
            <div className="rounded-xl bg-[#faf6ec] p-6 text-center text-sm text-[#b0a48e]">Walang screenshot</div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-2 text-sm">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-[#8c7a64]">Details</div>
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
                placeholder="Reason (optional, makikita ng user)"
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
                <button onClick={() => setShowReject(false)} className="rounded-xl border border-[#f5e6cc] px-4 text-sm text-[#8c7a64]">
                  Cancel
                </button>
              </div>
            </div>
          )}
          <p className="text-center text-xs text-[#b0a48e]">I-check: halaga + sentimo, ref number, at pangalan sa receipt.</p>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#8c7a64]">{k}</span>
      <span className="text-right text-[#3d3227]">{v}</span>
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
                track === t ? (t === "CSE" ? "bg-[#ff6b6b] text-white" : "bg-[#8b5cf6] text-white") : "border border-[#f5e6cc] bg-white text-[#8c7a64]"
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
              className={`card cursor-pointer p-4 transition ${selectedTopic === t.id ? "ring-2 ring-[#ffa94d]" : "card-hover"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-[#3d3227]">{t.title}</div>
                  <div className="text-xs text-[#8c7a64]">
                    {lessons.filter((l) => l.topic_id === t.id).length} lessons · order {t.order_index}
                    {!t.is_published && " · 🫥 draft"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={(e) => { e.stopPropagation(); setTopicModal(t); }} className="rounded-md bg-[#fff5e0] px-2 py-1 text-xs font-bold text-[#92734a]">Edit</button>
                  <button
                    disabled={busy}
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete topic "${t.title}" at lahat ng lessons nito?`)) run("delete_topic", { id: t.id }, "Topic deleted"); }}
                    className="rounded-md bg-[#fee2e2] px-2 py-1 text-xs font-bold text-[#991b1b]"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
          {trackTopics.length === 0 && <div className="card p-6 text-center text-sm text-[#8c7a64]">Wala pang topics sa {track}.</div>}
        </div>

        {/* Lessons of selected topic */}
        <div className="lg:col-span-2">
          {selectedTopic ? (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-bold text-[#3d3227]">
                  Lessons · {topics.find((t) => t.id === selectedTopic)?.title}
                </h3>
                <button
                  onClick={() => setLessonModal({ topic_id: selectedTopic, order_index: topicLessons.length + 1 })}
                  className="rounded-xl bg-gradient-to-br from-[#ff6b6b] to-[#ffa94d] px-4 py-2 text-xs font-bold text-white shadow"
                >
                  + New Lesson
                </button>
              </div>
              <div className="space-y-3">
                {topicLessons.map((l) => (
                  <div key={l.id} className="card flex items-center justify-between gap-3 p-4">
                    <div>
                      <div className="font-semibold text-[#3d3227]">{l.title}</div>
                      <div className="text-xs text-[#8c7a64]">
                        order {l.order_index}
                        {l.is_free ? " · 🎁 free" : " · 🔒 paid"}
                        {!l.is_published && " · 🫥 draft"}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setLessonModal(l)} className="rounded-md bg-[#fff5e0] px-2 py-1 text-xs font-bold text-[#92734a]">Edit</button>
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
                {topicLessons.length === 0 && <div className="card p-6 text-center text-sm text-[#8c7a64]">Wala pang lessons. Click &quot;+ New Lesson&quot;.</div>}
              </div>
            </div>
          ) : (
            <div className="card flex h-full items-center justify-center p-10 text-sm text-[#8c7a64]">
              ← Pumili ng topic para makita ang lessons
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
        <select className="input-warm" value={f.track} onChange={(e) => setF({ ...f, track: e.target.value })}>
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
            Visible sa users
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
      <Field label="Content (HTML — pwede ring plain text)">
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
            🎁 Free preview (kahit hindi subscriber, makikita)
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
    const { data } = await supabase.from("exam_questions").select("*").eq("exam_id", examId).order("order_index");
    return (data as Question[]) || [];
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button onClick={() => setExamModal({ track: "CSE", mode: "mock", duration_minutes: 60 })} className="btn-primary px-5 py-2.5 text-sm">
          + New Exam
        </button>
      </div>

      {(["CSE", "LET"] as Track[]).map((t) => (
        <section key={t}>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#8c7a64]">
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
              <div className="card p-6 text-center text-sm text-[#8c7a64]">Wala pang {t} exams.</div>
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

      {/* Import modal */}
      {importExam && (
        <Modal title="Bulk Import Questions" onClose={() => { setImportExam(null); setImportErr(null); }} wide>
          <p className="mb-3 rounded-xl bg-[#fff5e0] px-4 py-3 text-xs leading-relaxed text-[#92734a]">
            Isang question per block (hiwalay ng blank line). Format:
            <br />
            <code>1. Tanong dito{'\n'}A. choice{'\n'}B. choice{'\n'}C. choice{'\n'}D. choice{'\n'}ANSWER: B{'\n'}EXPLANATION: bakit</code>
          </p>
          <textarea
            className="input-warm font-mono text-xs"
            rows={14}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={"1. Ano ang 2+2?\nA. 3\nB. 4\nC. 5\nD. 6\nANSWER: B\nEXPLANATION: Basic addition.\n\n2. ..."}
          />
          {importErr && <div className="mt-3 rounded-xl bg-[#fee2e2] px-4 py-3 text-sm text-[#991b1b]">{importErr}</div>}
          <button
            disabled={busy || !importText.trim()}
            onClick={async () => {
              setImportErr(null);
              try {
                const questions = parseBulk(importText);
                await run("bulk_import_questions", { exam_id: importExam, questions }, `${questions.length} questions imported!`);
                setImportExam(null);
                setImportText("");
                router.refresh();
              } catch (e) {
                setImportErr(e instanceof Error ? e.message : "Parse error");
              }
            }}
            className="btn-primary mt-4 w-full py-3 text-sm"
          >
            Import Questions
          </button>
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
  const count = e.exam_questions?.[0]?.count ?? e.question_count ?? 0;
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="flex items-center gap-2 font-bold text-[#3d3227]">
            {e.is_free_preview && <span className="badge badge-approved">FREE</span>}
            {!e.is_active && <span className="badge badge-expired">INACTIVE</span>}
            {e.title}
          </div>
          <div className="text-xs text-[#8c7a64]">
            {e.mode} · {e.duration_minutes} min · {count} questions{e.topic ? ` · ${e.topic}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <button onClick={onToggle} className="rounded-md bg-[#fff5e0] px-3 py-1.5 text-xs font-bold text-[#92734a]">
            {isOpen ? "Hide" : "Questions"}
          </button>
          <button onClick={onImport} className="rounded-md bg-[#e0f2fe] px-3 py-1.5 text-xs font-bold text-[#0369a1]">Import</button>
          <button onClick={onEdit} className="rounded-md bg-[#fff5e0] px-3 py-1.5 text-xs font-bold text-[#92734a]">Edit</button>
          <button
            disabled={busy}
            onClick={() => { if (confirm(`Delete exam "${e.title}" at lahat ng questions nito?`)) void run("delete_exam", { id: e.id }, "Exam deleted"); }}
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
    <div className="border-t border-[#f5e6cc] bg-[#fffdf7] p-4">
      <div className="mb-3 flex justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-[#8c7a64]">
          {qs === null ? "Loading…" : `${qs.length} questions`}
        </span>
        <button onClick={onAdd} className="rounded-md bg-[#dcfce7] px-3 py-1.5 text-xs font-bold text-[#166534]">+ Add question</button>
      </div>
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {(qs || []).map((q, i) => (
          <div key={q.id} className="rounded-xl border border-[#f5e6cc] bg-white p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong>{i + 1}.</strong> {q.question_text}
                <div className="mt-1 text-xs text-[#8c7a64]">
                  ✓ {q.correct_choice} · {q.choice_a} / {q.choice_b} / {q.choice_c} / {q.choice_d}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => onEdit(q)} className="rounded bg-[#fff5e0] px-2 py-1 text-xs font-bold text-[#92734a]">Edit</button>
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
          <div className="p-4 text-center text-sm text-[#8c7a64]">Wala pang questions — add or import na!</div>
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
    duration_minutes: initial.duration_minutes ?? 60,
    is_free_preview: initial.is_free_preview === true,
    is_active: initial.is_active !== false,
  });
  const trackTopics = topics.filter((t) => t.track === f.track);
  return (
    <form onSubmit={(e) => { e.preventDefault(); void onSave({ ...f, id: initial.id }); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Track">
          <select className="input-warm" value={f.track} onChange={(e) => setF({ ...f, track: e.target.value, topic: "" })}>
            <option value="CSE">CSE</option>
            <option value="LET">LET</option>
          </select>
        </Field>
        <Field label="Mode">
          <select className="input-warm" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
            <option value="mock">Mock (timed, one-shot)</option>
            <option value="practice">Practice (may explanation agad)</option>
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
        <Field label="Topic label (optional)">
          <input className="input-warm" list="topic-list" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="e.g. Mathematics" />
          <datalist id="topic-list">
            {trackTopics.map((t) => (
              <option key={t.id} value={t.title} />
            ))}
          </datalist>
        </Field>
        <Field label="Duration (minutes)">
          <input type="number" className="input-warm" value={f.duration_minutes} onChange={(e) => setF({ ...f, duration_minutes: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.is_free_preview} onChange={(e) => setF({ ...f, is_free_preview: e.target.checked })} />
          🎁 Free preview (kahit sino, pwedeng i-take)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
          Active
        </label>
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
  });
  const set = (k: string, v: string | number) => setF({ ...f, [k]: v });
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
                  f.correct_choice === c.toUpperCase() ? "bg-[#22c55e] text-white" : "bg-[#fff5e0] text-[#92734a]"
                }`}
              >
                ✓
              </button>
            </div>
          </Field>
        ))}
      </div>
      <Field label="Explanation (nakikita ng user pagkatapos)">
        <textarea className="input-warm" rows={2} value={f.explanation} onChange={(e) => set("explanation", e.target.value)} />
      </Field>
      <div className="flex items-center justify-between">
        <Field label="Order">
          <input type="number" className="input-warm w-24" value={f.order_index} onChange={(e) => set("order_index", Number(e.target.value))} />
        </Field>
      </div>
      <button disabled={busy} className="btn-primary w-full py-3 text-sm">Save Question</button>
    </form>
  );
}

/* ---------- Settings tab ---------- */

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
        <h3 className="mb-4 font-bold text-[#3d3227]">📱 GCash Details</h3>
        <div className="space-y-4">
          <SettingField label="GCash Number" value={get("gcash_number")} onSave={(v) => run("save_setting", { key: "gcash_number", value: v }, "GCash number saved")} busy={busy} />
          <SettingField label="GCash Account Name" value={get("gcash_name")} onSave={(v) => run("save_setting", { key: "gcash_name", value: v }, "GCash name saved")} busy={busy} />
        </div>
      </div>
      <div className="card p-6">
        <h3 className="mb-4 font-bold text-[#3d3227]">🏦 Bank Details</h3>
        <div className="space-y-4">
          <SettingField label="Bank Name" value={get("bank_name")} onSave={(v) => run("save_setting", { key: "bank_name", value: v }, "Bank name saved")} busy={busy} />
          <SettingField label="Account Name" value={get("bank_account_name")} onSave={(v) => run("save_setting", { key: "bank_account_name", value: v }, "Account name saved")} busy={busy} />
          <SettingField label="Account Number" value={get("bank_account_number")} onSave={(v) => run("save_setting", { key: "bank_account_number", value: v }, "Account number saved")} busy={busy} />
        </div>
      </div>
      <div className="card p-6 lg:col-span-2">
        <h3 className="mb-4 font-bold text-[#3d3227]">📋 Payment Instructions (nakikita ng users sa payment modal)</h3>
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
      <label className="mb-1.5 block text-sm font-semibold text-[#57534e]">{label}</label>
      <div className="flex gap-2">
        {textarea ? (
          <textarea className="input-warm" rows={3} value={v} onChange={(e) => setV(e.target.value)} />
        ) : (
          <input className="input-warm" value={v} onChange={(e) => setV(e.target.value)} />
        )}
        <button
          disabled={busy || !dirty}
          onClick={() => void onSave(v)}
          className="shrink-0 self-stretch rounded-xl bg-gradient-to-br from-[#ff6b6b] to-[#ffa94d] px-4 text-sm font-bold text-white disabled:opacity-40"
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
      <label className="mb-1.5 block text-sm font-semibold text-[#57534e]">{label}</label>
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
          <h3 className="text-lg font-extrabold text-[#3d3227]">{title}</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-[#8c7a64] hover:bg-[#fff5e0]">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
