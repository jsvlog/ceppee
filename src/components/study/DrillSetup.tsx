"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Track } from "@/lib/types";

export interface SetupSubject {
  key: string;
  icon: string;
  note: string;
  count: number;
}

const COUNTS = [10, 20, 30, 50, 100];
const DIFFS = [
  { v: 0, label: "Mixed (recommended)" },
  { v: 1, label: "Easy only" },
  { v: 2, label: "Average only" },
  { v: 3, label: "Hard only" },
];

export default function DrillSetup({
  mode,
  track,
  level,
  major,
  subjects,
  basePath,
}: {
  mode: "drill" | "flashcards";
  track: Track;
  level: string;
  major: string | null;
  subjects: SetupSubject[];
  basePath: string;
}) {
  const router = useRouter();
  const available = subjects.filter((s) => s.count > 0);
  const [picked, setPicked] = useState<string[]>(
    available.length === 1 ? [available[0].key] : available.map((s) => s.key)
  );
  const [count, setCount] = useState(mode === "flashcards" ? 30 : 20);
  const [difficulty, setDifficulty] = useState(0);
  const [timed, setTimed] = useState(false);

  const total = subjects.filter((s) => picked.includes(s.key)).reduce((sum, s) => sum + s.count, 0);
  const ready = picked.length > 0 && total > 0;

  const start = () => {
    const p = new URLSearchParams({ level, subjects: picked.join(","), count: String(count) });
    if (major) p.set("major", major);
    if (difficulty) p.set("difficulty", String(difficulty));
    if (mode === "drill" && timed) p.set("timed", "1");
    router.push(`${basePath}?${p.toString()}`);
  };

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="mb-1 text-2xl font-black text-[#16331f]">
        {mode === "flashcards" ? "🃏 Build your flashcard deck" : "🎯 Build your drill"}
      </h1>
      <p className="mb-6 text-sm text-[#5c7863]">
        {mode === "flashcards"
          ? "Flip through questions like cards. Items you mark “hindi ko” come back at the end."
          : "Pick the sections you want to practice. Every answer is explained right away."}
      </p>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#5c7863]">1. Which sections?</h2>
      <div className="mb-6 space-y-2">
        {subjects.map((s) => {
          const on = picked.includes(s.key);
          const disabled = s.count === 0;
          return (
            <button
              key={s.key}
              disabled={disabled}
              onClick={() =>
                setPicked((p) => (on ? p.filter((x) => x !== s.key) : [...p, s.key]))
              }
              className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                on ? "border-[#16a34a] bg-[#dcfce7]" : "border-[#d9e6d3] bg-white hover:border-[#d4af37]"
              }`}
            >
              <span className="text-xl">{s.icon}</span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-[#16331f]">{s.key}</span>
                <span className="block text-xs text-[#5c7863]">{s.note}</span>
              </span>
              <span className="shrink-0 text-xs font-bold text-[#15803d]">
                {s.count > 0 ? `${s.count} items` : "soon"}
              </span>
            </button>
          );
        })}
      </div>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#5c7863]">
        2. How many items? <span className="font-normal normal-case text-[#94a896]">({total} available in your selection)</span>
      </h2>
      <div className="mb-6 flex flex-wrap gap-2">
        {COUNTS.map((c) => (
          <button
            key={c}
            onClick={() => setCount(c)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              count === c ? "bg-[#16331f] text-white" : "border border-[#d9e6d3] bg-white text-[#3d5c44] hover:border-[#d4af37]"
            }`}
          >
            {c}
          </button>
        ))}
        <span className="self-center text-xs text-[#5c7863]">
          (we use whatever exists if the bank has fewer)
        </span>
      </div>

      {mode === "drill" && (
        <>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#5c7863]">3. Difficulty</h2>
          <div className="mb-6 flex flex-wrap gap-2">
            {DIFFS.map((d) => (
              <button
                key={d.v}
                onClick={() => setDifficulty(d.v)}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  difficulty === d.v ? "bg-[#16331f] text-white" : "border border-[#d9e6d3] bg-white text-[#3d5c44] hover:border-[#d4af37]"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-[#d9e6d3] bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={timed}
              onChange={(e) => setTimed(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="block text-sm font-bold text-[#16331f]">⏱️ Time me (mock-style)</span>
              <span className="block text-xs text-[#5c7863]">
                No answers until you submit, and the score is saved to your history. Untick it for instant explanations.
              </span>
            </span>
          </label>
        </>
      )}

      <button onClick={start} disabled={!ready} className="btn-primary w-full px-8 py-4 text-base disabled:opacity-50">
        {ready
          ? `${mode === "flashcards" ? "Start Flashcards" : timed ? "Start Timed Drill" : "Start Drill"} →`
          : "Nothing to practice yet — the bank is still empty"}
      </button>
    </div>
  );
}