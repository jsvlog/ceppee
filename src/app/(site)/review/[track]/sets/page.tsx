import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasActiveSub } from "@/lib/queries";
import {
  levelsFor, levelMeta, specializationsFor, levelLabel, subjectIcon,
  timedMinutes, passingPctFor,
} from "@/lib/exam";
import type { Level, SetCatalogRow, Track } from "@/lib/types";

export const dynamic = "force-dynamic";

const TRACKS: Record<string, Track> = { cse: "CSE", let: "LET" };

const meta: Record<Track, {
  label: string; emoji: string; grad: string; soft: string; text: string; btn: string;
}> = {
  CSE: {
    label: "Civil Service Exam",
    emoji: "🏛️",
    grad: "from-[#15803d] to-[#16a34a]",
    soft: "bg-[#dcfce7]",
    text: "text-[#15803d]",
    btn: "btn-primary",
  },
  LET: {
    label: "Licensure Exam for Teachers",
    emoji: "🍎",
    grad: "from-[#b45309] to-[#eab308]",
    soft: "bg-[#fef9c3]",
    text: "text-[#b45309]",
    btn: "btn-gold",
  },
};

export async function generateMetadata({ params }: { params: Promise<{ track: string }> }): Promise<Metadata> {
  const { track } = await params;
  const t = TRACKS[track];
  return { title: t ? `${t} Set Mocks` : "Set Mocks" };
}

export default async function SetPickerPage({
  params,
  searchParams,
}: {
  params: Promise<{ track: string }>;
  searchParams: Promise<{ level?: string; major?: string }>;
}) {
  const { track } = await params;
  const sp = await searchParams;
  const trackKey = TRACKS[track];
  if (!trackKey) notFound();

  const m = meta[trackKey];
  const { user, subs, isAdmin } = await getUserContext();
  const subscribed = isAdmin || hasActiveSub(subs, trackKey);

  const levelOptions = levelsFor(trackKey);
  const levelKey = (levelOptions.find((l) => l.key === sp.level)?.key ?? levelOptions[0].key) as Level;
  const level = levelMeta(trackKey, levelKey)!;
  const majorOptions = trackKey === "LET" ? specializationsFor(levelKey) : [];
  const major = majorOptions.includes(sp.major ?? "") ? (sp.major as string) : null;
  const needsMajor = trackKey === "LET" && levelKey === "secondary";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_catalog", {
    p_track: trackKey,
    p_level: levelKey,
    p_specialization: major,
  });
  if (error) console.error("set_catalog", error.message);
  const rows = (data as SetCatalogRow[]) ?? [];

  const base = `/review/${track}/sets`;
  const link = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams({ level: levelKey });
    if (major) p.set("major", major);
    Object.entries(extra).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    return `${base}?${p.toString()}`;
  };

  const groups = trackKey === "LET"
    ? [
        { key: "General Education", label: "General Education", sets: rows.filter((r) => r.subject === "General Education") },
        { key: "Professional Education", label: "Professional Education", sets: rows.filter((r) => r.subject === "Professional Education") },
        {
          key: "Specialization",
          label: major ? `Majorship — ${major}` : "Majorship paper",
          sets: rows.filter((r) => r.subject === "Specialization"),
        },
      ]
    : Object.keys(
        rows.reduce<Record<string, SetCatalogRow[]>>((acc, r) => {
          const k = r.subject ?? "General";
          (acc[k] ||= []).push(r);
          return acc;
        }, {})
      ).map((k) => ({ key: k, label: k, sets: rows.filter((r) => (r.subject ?? "General") === k) }));

  const totalSets = rows.length;
  const totalItems = rows.reduce((a, r) => a + r.live, 0);
  const shortSets = rows.filter((r) => r.missing > 0).length;

  return (
    <div>
      {/* header */}
      <section className={`relative overflow-hidden bg-gradient-to-br ${m.grad} py-12`}>
        <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Link href={`/review/${track}?level=${levelKey}${major ? `&major=${encodeURIComponent(major)}` : ""}`}
                className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 hover:text-white">
            ← Back to the {trackKey} reviewer
          </Link>
          <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-sm font-bold text-white">
                {m.emoji} {m.label} · {levelLabel(trackKey, levelKey)}
              </div>
              <h1 className="text-4xl font-black text-white sm:text-5xl">Set Mocks</h1>
              <p className="mt-2 max-w-2xl text-white/90">
                Every set is a real {150}-item paper, the way the actual exam is built — timed, shuffled,
                and scored with a full answer review at the end.
              </p>
            </div>
            <div className="flex gap-3">
              <Mini value={String(totalSets)} label="sets" />
              <Mini value={totalItems.toLocaleString()} label="items" />
              <Mini value={`${passingPctFor(trackKey)}%`} label="target" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* how a set works */}
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { icon: "📄", title: "150 items", note: "The same length as one real subtest — no shortened practice papers." },
            { icon: "⏱️", title: `${timedMinutes(150, trackKey)} minutes`, note: "One sitting. The clock does not pause, exactly like the real thing." },
            { icon: "🎯", title: "Your answers, reviewed", note: "Score, per-section breakdown, and a written explanation for every item." },
          ].map((c) => (
            <div key={c.title} className="card flex items-start gap-3 p-4">
              <span className="text-2xl">{c.icon}</span>
              <div>
                <div className="text-sm font-bold text-[#16331f]">{c.title}</div>
                <p className="text-xs leading-relaxed text-[#5c7863]">{c.note}</p>
              </div>
            </div>
          ))}
        </div>

        {/* filters */}
        <div className="card mb-8 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#94a896]">Level</span>
            {levelOptions.map((l) => (
              <Link
                key={l.key}
                href={`${base}?level=${l.key}${major ? `&major=${encodeURIComponent(major)}` : ""}`}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                  l.key === levelKey
                    ? "bg-[#16331f] text-white"
                    : "border border-[#d9e6d3] bg-white text-[#3d5c44] hover:border-[#d4af37]"
                }`}
              >
                {l.short}
              </Link>
            ))}
          </div>

          {majorOptions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#94a896]">Majorship</span>
              {majorOptions.map((o) => (
                <Link
                  key={o}
                  href={link({ major: o })}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    o === major
                      ? "bg-[#ca8a04] text-white"
                      : "border border-[#d9e6d3] bg-white text-[#3d5c44] hover:border-[#d4af37]"
                  }`}
                >
                  {o}
                </Link>
              ))}
              {major && (
                <Link href={link({ major: null })} className="text-xs font-semibold text-[#94a896] underline">
                  clear
                </Link>
              )}
            </div>
          )}
        </div>

        {needsMajor && !major && (
          <div className="card mb-8 border-[#fde68a] bg-[#fffbeb] p-5 text-sm text-[#b45309]">
            <strong>👆 Pick your majorship first.</strong> Your specialization is its own 150-item subtest — the
            Gen Ed and Prof Ed sets below are the same for everyone, but the majorship sets change with your paper.
          </div>
        )}

        {totalSets === 0 && (
          <div className="card p-8 text-center">
            <div className="mb-2 text-4xl">📚</div>
            <h2 className="mb-1 text-lg font-bold text-[#16331f]">No sets for this paper yet</h2>
            <p className="text-sm text-[#5c7863]">
              The bank for this paper is still being uploaded. Sets appear here automatically as soon as they land.
            </p>
          </div>
        )}

        {/* groups */}
        <div className="space-y-10">
          {groups.map((g) => {
            if (g.sets.length === 0) return null;
            const items = g.sets.reduce((a, r) => a + r.live, 0);
            const icon = subjectIcon(trackKey, g.key);
            return (
              <div key={g.key}>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-[#d9e6d3] pb-3">
                  <div>
                    <h2 className="text-xl font-black text-[#16331f]">
                      {icon} {g.label}
                    </h2>
                    <p className="text-xs text-[#5c7863]">
                      {g.sets.length} sets · {items.toLocaleString()} items · one set = one paper
                    </p>
                  </div>
                  <span className={`rounded-lg ${m.soft} px-3 py-1 text-xs font-bold ${m.text}`}>
                    {g.sets.length} papers
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {g.sets.map((s) => (
                    <SetCard key={s.id} s={s} track={trackKey} subscribed={subscribed} signedIn={!!user} btn={m.btn} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {shortSets > 0 && (
          <p className="mt-10 rounded-2xl bg-[#f6faf4] px-5 py-4 text-xs leading-relaxed text-[#5c7863]">
            <strong className="text-[#3d5c44]">{shortSets} of these sets hold fewer than 150 items on their own.</strong>{" "}
            The paper is still 150: the missing items are drawn from other sets of the same subject and the same
            difficulty, so nothing is shortened and nothing is repeated within a paper.
          </p>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Mini({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/15 px-4 py-2 text-center backdrop-blur">
      <div className="text-xl font-black text-white">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/70">{label}</div>
    </div>
  );
}

function SetCard({
  s, track, subscribed, signedIn, btn,
}: {
  s: SetCatalogRow;
  track: Track;
  subscribed: boolean;
  signedIn: boolean;
  btn: string;
}) {
  const segs = [
    { n: s.shape_easy, color: "#4ade80", label: "easy" },
    { n: s.shape_medium_hard, color: "#fbbf24", label: "medium-hard" },
    { n: s.shape_extremely_hard, color: "#fb923c", label: "extremely hard" },
    { n: s.shape_pedagogical, color: "#a78bfa", label: "pedagogical" },
  ];
  const sum = segs.reduce((a, b) => a + b.n, 0) || 1;
  const href = subscribed ? `/exam/set/${s.id}` : signedIn ? "/dashboard" : "/login?next=/dashboard";

  return (
    <div className="card card-hover flex flex-col p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-base font-black text-[#16331f]">Set {s.set_no}</div>
          <div className="text-[11px] font-semibold text-[#94a896]">
            {s.live} in this set{s.missing > 0 ? ` · ${s.missing} from the same subject` : ""}
          </div>
        </div>
        <span className="rounded-lg bg-[#dcfce7] px-2 py-1 text-[10px] font-bold text-[#15803d]">150 items</span>
      </div>

      <div className="mb-2 flex h-2 w-full overflow-hidden rounded-full bg-[#eef2ec]" title={`${s.shape_easy} easy · ${s.shape_medium_hard} medium-hard · ${s.shape_extremely_hard} extremely hard · ${s.shape_pedagogical} pedagogical`}>
        {segs.map((seg) =>
          seg.n > 0 ? (
            <div key={seg.label} style={{ width: `${(seg.n / sum) * 100}%`, background: seg.color }} title={`${seg.n} ${seg.label}`} />
          ) : null
        )}
      </div>

      <div className="mb-3 grid grid-cols-4 gap-1 text-center text-[10px] text-[#5c7863]">
        {segs.map((seg) => (
          <div key={seg.label}>
            <span className="mx-auto mb-0.5 block h-1.5 w-1.5 rounded-full" style={{ background: seg.color }} />
            {seg.n}
          </div>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-3 text-[11px] text-[#5c7863]">
        <span>⏱ {timedMinutes(150, track)} min</span>
        <span>🎯 {track === "CSE" ? 80 : 75}%</span>
      </div>

      <Link href={href} className={`${btn} mt-auto block px-4 py-2.5 text-center text-sm`}>
        {subscribed ? "Start this paper →" : "🔒 Subscribe"}
      </Link>
    </div>
  );
}
