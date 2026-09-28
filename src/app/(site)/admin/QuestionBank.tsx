"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { postAdmin } from "@/lib/admin-api";
import { parseBulkQuestions, ALL_SUBJECTS } from "@/lib/bulk-import";
import { MATERIAL, SPECIALIZATIONS } from "@/lib/exam";
import { subjectIcon } from "@/lib/exam";
import type { Track } from "@/lib/types";

const PAGE_SIZE = 50;

interface BankRow {
  id: string;
  question_text: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_choice: string;
  explanation: string | null;
  track: string;
  level: string;
  subject: string | null;
  subtopic: string | null;
  specialization: string | null;
  difficulty: number;
  is_free: boolean;
  is_active: boolean;
  source: string | null;
  exam_id: string | null;
  created_at: string;
}

interface StatRow {
  track: string;
  subject: string | null;
  level: string;
  total: number;
  accessible: number;
}

const DIFF_LABEL: Record<number, string> = { 1: "Easy", 2: "Average", 3: "Hard" };

/**
 * The question bank manager — where the actual reviewer content gets uploaded.
 * Everything here lands in exam_questions + question_keys (the answer key), and
 * is immediately available to the mock exams, drills and flashcards.
 */
export default function QuestionBank({ onFlash }: { onFlash?: (ok: boolean, msg: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [track, setTrack] = useState<Track>("CSE");
  const [level, setLevel] = useState("");
  const [subject, setSubject] = useState("");
  const [major, setMajor] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState<BankRow[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [stats, setStats] = useState<StatRow[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);

  const [importText, setImportText] = useState("");
  const [importTrack, setImportTrack] = useState<Track>("CSE");
  const [importLevel, setImportLevel] = useState("both");
  const [importSubject, setImportSubject] = useState("");
  const [importFree, setImportFree] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const say = (ok: boolean, msg: string) => {
    setFlash({ ok, msg });
    onFlash?.(ok, msg);
  };

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_bank_list", {
      p_track: track || null,
      p_level: level || null,
      p_subject: subject || null,
      p_specialization: major || null,
      p_search: search || null,
      p_limit: PAGE_SIZE + 1,
      p_offset: page * PAGE_SIZE,
    });
    if (error) {
      say(false, error.message);
      setRows([]);
      return;
    }
    const list = (data as BankRow[]) ?? [];
    setHasMore(list.length > PAGE_SIZE);
    setRows(list.slice(0, PAGE_SIZE));
    setPicked([]);
  }, [page, search, subject, level, major, supabase, track]);

  const loadStats = useCallback(async () => {
    const [cse, letx] = await Promise.all([
      supabase.rpc("bank_stats", { p_track: "CSE" }),
      supabase.rpc("bank_stats", { p_track: "LET" }),
    ]);
    setStats([...((cse.data as StatRow[]) ?? []), ...((letx.data as StatRow[]) ?? [])]);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const bankTotal = stats.reduce((sum, s) => sum + Number(s.total ?? 0), 0);

  const togglePick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const preview = useMemo(() => {
    if (!importText.trim()) return null;
    try {
      return { batch: parseBulkQuestions(importText), error: null as string | null };
    } catch (e) {
      return { batch: null, error: e instanceof Error ? e.message : "Parse error" };
    }
  }, [importText]);

  const doImport = async () => {
    if (!preview?.batch) return;
    setBusy(true);
    try {
      const res = await postAdmin("import_questions", {
        questions: preview.batch.questions,
        defaults: {
          track: importTrack,
          level: importLevel === "both" ? "both" : importLevel,
          subject: importSubject || null,
          is_free: importFree,
        },
      });
      say(true, `✅ ${res.count ?? preview.batch.questions.length} questions imported into the bank.`);
      setImportText("");
      setShowImport(false);
      await Promise.all([load(), loadStats()]);
    } catch (e) {
      say(false, e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const deletePicked = async () => {
    if (picked.length === 0) return;
    if (!confirm(`Delete ${picked.length} question(s) permanently?`)) return;
    setBusy(true);
    try {
      const res = await postAdmin("delete_questions", { ids: picked });
      say(true, `Deleted ${res.deleted ?? picked.length} question(s).`);
      await Promise.all([load(), loadStats()]);
    } catch (e) {
      say(false, e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const clearBank = async () => {
    const scope = level || subject || major ? "the current filter" : `the whole ${track} bank`;
    if (!confirm(`This deletes EVERY question in ${scope}. The real reviewer content included. Continue?`)) return;
    if (!confirm("Last chance — this cannot be undone. Delete?")) return;
    setBusy(true);
    try {
      const res = await postAdmin("clear_bank", {
        track,
        level: level || undefined,
        subject: subject || undefined,
        specialization: major || undefined,
      });
      say(true, `Cleared ${res.deleted ?? 0} question(s) from ${scope}.`);
      await Promise.all([load(), loadStats()]);
    } catch (e) {
      say(false, e instanceof Error ? e.message : "Clear failed");
    } finally {
      setBusy(false);
    }
  };

  const subjectOptions = track === "CSE" ? ALL_SUBJECTS.slice(0, 5) : ALL_SUBJECTS.slice(5);

  return (
    <div className="space-y-6">
      {flash && (
        <div className={`rounded-xl px-4 py-3 text-sm ${flash.ok ? "bg-[#dcfce7] text-[#166534]" : "bg-[#fee2e2] text-[#991b1b]"}`}>
          {flash.ok ? "✅ " : "✕ "}
          {flash.msg}
        </div>
      )}

      {/* Bank size */}
      <div className="card p-5">
        <h2 className="mb-3 text-lg font-bold text-[#16331f]">🧠 Question bank — {bankTotal} items total</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(["CSE", "LET"] as Track[]).map((t) => {
            const mine = stats.filter((s) => s.track === t);
            const sum = mine.reduce((a, s) => a + Number(s.total ?? 0), 0);
            return (
              <div key={t} className="rounded-xl border border-[#d9e6d3] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-bold text-[#16331f]">{t === "CSE" ? "🏛️ CSE" : "🍎 LET"}</span>
                  <span className={`rounded-lg px-2 py-1 text-xs font-bold ${t === "CSE" ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#fef9c3] text-[#b45309]"}`}>
                    {sum} items
                  </span>
                </div>
                {mine.length === 0 ? (
                  <p className="text-xs text-[#94a896]">Empty — paste questions below to fill it.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-[#5c7863]">
                    {mine
                      .sort((x, y) => (x.subject ?? "").localeCompare(y.subject ?? ""))
                      .map((s) => (
                        <li key={`${s.subject}-${s.level}`} className="flex justify-between gap-2">
                          <span>
                            {subjectIcon(t, s.subject)} {s.subject} <span className="text-[#94a896]">({s.level})</span>
                          </span>
                          <span className="font-semibold text-[#16331f]">{s.total}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Import */}
      <div className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#16331f]">📥 Bulk import questions</h2>
            <p className="text-xs text-[#5c7863]">
              Paste from Excel (tab separated) or use the block format with A) B) C) D) and ANSWER: lines.
            </p>
          </div>
          <button onClick={() => setShowImport((v) => !v)} className="btn-primary px-5 py-2.5 text-sm">
            {showImport ? "Hide importer" : "+ Paste questions"}
          </button>
        </div>

        {showImport && (
          <>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <label className="text-sm">
                <span className="mb-1 block font-semibold text-[#3d5c44]">Track</span>
                <select className="input-warm" value={importTrack} onChange={(e) => setImportTrack(e.target.value as Track)}>
                  <option value="CSE">CSE</option>
                  <option value="LET">LET</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold text-[#3d5c44]">Level (default)</span>
                <select className="input-warm" value={importLevel} onChange={(e) => setImportLevel(e.target.value)}>
                  {MATERIAL[importTrack].map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.short}
                    </option>
                  ))}
                  <option value="both">Both levels</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold text-[#3d5c44]">Subject (default)</span>
                <select className="input-warm" value={importSubject} onChange={(e) => setImportSubject(e.target.value)}>
                  <option value="">— from the paste / none —</option>
                  {(importTrack === "CSE" ? ALL_SUBJECTS.slice(0, 5) : ALL_SUBJECTS.slice(5)).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={importFree} onChange={(e) => setImportFree(e.target.checked)} />
                🎁 Free preview items
              </label>
            </div>

            <textarea
              className="input-warm font-mono text-xs"
              rows={12}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={
                "TRACK: CSE\nLEVEL: professional\nSUBJECT: Numerical Ability\n\n1. What is 15% of 240?\nA) 36\nB) 32\nC) 40\nD) 24\nANSWER: A\nEXPLANATION: 10% of 240 = 24, 5% = 12, so 15% = 36.\n\n2. ..."
              }
            />

            {preview?.error && (
              <div className="mt-3 rounded-xl bg-[#fee2e2] px-4 py-3 text-sm text-[#991b1b]">✕ {preview.error}</div>
            )}
            {preview?.batch && (
              <div className="mt-3 rounded-xl bg-[#dcfce7] px-4 py-3 text-sm text-[#166534]">
                ✅ {preview.batch.questions.length} questions parsed and ready.
                {preview.batch.warnings.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#15803d]">
                    {preview.batch.warnings.slice(0, 8).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <button
              onClick={() => void doImport()}
              disabled={busy || !preview?.batch || preview.batch.questions.length === 0}
              className="btn-primary mt-4 w-full py-3 text-sm disabled:opacity-50"
            >
              {busy ? "Importing…" : `Import ${preview?.batch?.questions.length ?? 0} questions`}
            </button>
          </>
        )}
      </div>

      {/* Browse */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-[#d9e6d3] p-4">
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-[#3d5c44]">Track</span>
            <select
              className="input-warm"
              value={track}
              onChange={(e) => {
                setTrack(e.target.value as Track);
                setSubject("");
                setLevel("");
                setMajor("");
                setPage(0);
              }}
            >
              <option value="CSE">CSE</option>
              <option value="LET">LET</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-[#3d5c44]">Level</span>
            <select
              className="input-warm"
              value={level}
              onChange={(e) => {
                setLevel(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All levels</option>
              {MATERIAL[track].map((l) => (
                <option key={l.key} value={l.key}>
                  {l.short}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-[#3d5c44]">Subject</span>
            <select
              className="input-warm"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All subjects</option>
              {subjectOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold text-[#3d5c44]">Majorship</span>
            <select
              className="input-warm"
              value={major}
              onChange={(e) => {
                setMajor(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All majorships</option>
              {SPECIALIZATIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-semibold text-[#3d5c44]">Search</span>
            <input
              className="input-warm"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="words in the question…"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d9e6d3] bg-[#f6faf4] px-4 py-2 text-xs">
          <span className="text-[#5c7863]">
            {rows === null ? "Loading…" : `${rows.length} shown (page ${page + 1})`}
            {picked.length > 0 && ` · ${picked.length} selected`}
          </span>
          <div className="flex gap-2">
            {picked.length > 0 && (
              <button onClick={() => void deletePicked()} disabled={busy} className="rounded-md bg-[#fee2e2] px-3 py-1.5 font-bold text-[#991b1b]">
                Delete {picked.length} selected
              </button>
            )}
            <button
              onClick={() => void clearBank()}
              disabled={busy}
              className="rounded-md border border-[#fecaca] px-3 py-1.5 font-bold text-[#b91c1c]"
            >
              ⚠️ Wipe {track} bank
            </button>
          </div>
        </div>

        <div className="divide-y divide-[#d9e6d3]">
          {(rows ?? []).map((r) => (
            <div key={r.id} className="flex items-start gap-3 p-4">
              <input
                type="checkbox"
                className="mt-1"
                checked={picked.includes(r.id)}
                onChange={() => togglePick(r.id)}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#16331f]">{r.question_text}</p>
                <p className="mt-1 text-xs text-[#5c7863]">
                  ✓ {r.correct_choice}. {r[`choice_${r.correct_choice.toLowerCase()}` as "choice_a"]}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-bold">
                  <span className="rounded bg-[#dcfce7] px-2 py-0.5 text-[#15803d]">{r.level}</span>
                  {r.subject && <span className="rounded bg-[#e0f2fe] px-2 py-0.5 text-[#0369a1]">{r.subject}</span>}
                  {r.subtopic && <span className="rounded bg-[#f1f5f9] px-2 py-0.5 text-[#475569]">{r.subtopic}</span>}
                  {r.specialization && <span className="rounded bg-[#fef9c3] px-2 py-0.5 text-[#b45309]">{r.specialization}</span>}
                  <span className="rounded bg-[#f1f5f9] px-2 py-0.5 text-[#475569]">{DIFF_LABEL[r.difficulty] ?? r.difficulty}</span>
                  {r.is_free && <span className="rounded bg-[#fde68a] px-2 py-0.5 text-[#92400e]">FREE</span>}
                  {r.exam_id && <span className="rounded bg-[#ede9fe] px-2 py-0.5 text-[#5b21b6]">pinned to a mock</span>}
                </div>
                {r.explanation && <p className="mt-1.5 text-xs italic text-[#94a896]">💡 {r.explanation}</p>}
              </div>
              <button
                disabled={busy}
                onClick={async () => {
                  if (!confirm("Delete this question?")) return;
                  setBusy(true);
                  try {
                    await postAdmin("delete_question", { id: r.id });
                    await Promise.all([load(), loadStats()]);
                  } catch (e) {
                    say(false, e instanceof Error ? e.message : "Delete failed");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="shrink-0 rounded-md bg-[#fee2e2] px-2.5 py-1 text-xs font-bold text-[#991b1b]"
              >
                ✕
              </button>
            </div>
          ))}
          {rows !== null && rows.length === 0 && (
            <div className="p-8 text-center text-sm text-[#5c7863]">
              No questions match. Paste some with “+ Paste questions”, or clear the filters.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#d9e6d3] p-4">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-xl border border-[#d9e6d3] px-4 py-2 text-sm font-semibold text-[#3d5c44] disabled:opacity-40"
          >
            ← Previous
          </button>
          <button
            disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-xl border border-[#d9e6d3] px-4 py-2 text-sm font-semibold text-[#3d5c44] disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
