"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  levelLabel,
  levelsFor,
  passingPctFor,
  specializationsFor,
  subjectIcon,
  subjectsFor,
  timedMinutes,
} from "@/lib/exam";
import { peso } from "@/lib/format";
import {
  buildCampaignRegions,
  computePlayerStats,
  type AttemptSummary,
  type CampaignNode,
} from "@/lib/game";
import type {
  BankStat,
  Exam,
  ExamAttempt,
  Level,
  SetCatalogRow,
  SubjectProgress,
  Track,
} from "@/lib/types";

type HubTab = "campaign" | "arena";

export interface TrackGameHubProps {
  trackKey: Track;
  trackSlug: string;
  initialLevel: Level;
  initialMajor: string | null;
  subscribed: boolean;
  isSignedIn: boolean;
  stats: BankStat[];
  allSets: SetCatalogRow[];
  attempts: ExamAttempt[];
  mastery: SubjectProgress[];
  exams: Exam[];
}

const QUICK_COUNTS = [10, 20, 30, 50];

export default function TrackGameHub(props: TrackGameHubProps) {
  const {
    trackKey, trackSlug, initialLevel, initialMajor, subscribed, isSignedIn,
    stats, allSets, attempts, mastery, exams,
  } = props;

  const isLET = trackKey === "LET";
  const passingPct = passingPctFor(trackKey);
  const levelOptions = levelsFor(trackKey);

  const [levelKey, setLevelKey] = useState<Level>(initialLevel);
  const [major, setMajor] = useState<string | null>(initialMajor);
  const [tab, setTab] = useState<HubTab>("campaign");
  const [quickCount, setQuickCount] = useState(20);
  const [openRegion, setOpenRegion] = useState<number>(1);

  const subjects = useMemo(() => subjectsFor(trackKey, levelKey), [trackKey, levelKey]);
  const majorOptions = useMemo(() => (isLET ? specializationsFor(levelKey) : []), [isLET, levelKey]);
  const majorRequired = isLET && levelKey === "secondary";

  const setsFor = useCallback(
    (subjectKey: string, level: Level, maj: string | null) =>
      allSets.filter((s) => {
        if (s.level !== "both" && s.level !== level) return false;
        if (s.subject !== subjectKey) return false;
        if (subjectKey === "Specialization") return maj !== null && s.specialization === maj;
        return true;
      }),
    [allSets]
  );

  // Open on the first subject that actually holds a paper for this paper/majorship.
  const [activeSubject, setActiveSubject] = useState<string>(() => {
    const list = subjectsFor(trackKey, initialLevel);
    const withSets = list.find((s) => setsFor(s.key, initialLevel, initialMajor).length > 0);
    return withSets?.key ?? list[0]?.key ?? "";
  });

  // Remember the majorship per level so a returning student does not re-pick it.
  useEffect(() => {
    if (!isLET) return;
    if (initialMajor && majorOptions.includes(initialMajor)) return;
    try {
      const saved = window.localStorage.getItem(`ceppee_major_${levelKey}`);
      if (saved && majorOptions.includes(saved) && saved !== major) setMajor(saved);
    } catch {
      /* storage can be blocked — not worth failing the page over */
    }
  }, [isLET, levelKey, initialMajor, majorOptions, major]);

  const applySelection = useCallback(
    (nextLevel: Level, nextMajor: string | null) => {
      const allowed = isLET ? specializationsFor(nextLevel) : [];
      const validMajor = nextMajor && allowed.includes(nextMajor) ? nextMajor : null;

      setLevelKey(nextLevel);
      setMajor(validMajor);

      const nextSubjects = subjectsFor(trackKey, nextLevel);
      const keep = nextSubjects.some(
        (s) => s.key === activeSubject && setsFor(s.key, nextLevel, validMajor).length > 0
      );
      if (!keep) {
        const withSets = nextSubjects.find((s) => setsFor(s.key, nextLevel, validMajor).length > 0);
        setActiveSubject(withSets?.key ?? nextSubjects[0]?.key ?? "");
      }

      try {
        if (validMajor) window.localStorage.setItem(`ceppee_major_${nextLevel}`, validMajor);
        const p = new URLSearchParams({ level: nextLevel });
        if (validMajor) p.set("major", validMajor);
        window.history.replaceState(null, "", `/review/${trackSlug}?${p.toString()}`);
      } catch {
        /* ignore */
      }
    },
    [activeSubject, isLET, setsFor, trackKey, trackSlug]
  );

  // Back/forward still moves between levels & majors: re-read the URL on popstate.
  useEffect(() => {
    const sync = () => {
      const p = new URLSearchParams(window.location.search);
      const lvl = levelsFor(trackKey).find((l) => l.key === p.get("level"))?.key;
      if (!lvl) return;
      const maj = p.get("major");
      const allowed = isLET ? specializationsFor(lvl) : [];
      setLevelKey(lvl as Level);
      setMajor(maj && allowed.includes(maj) ? maj : null);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [isLET, trackKey]);

  const player = useMemo(() => computePlayerStats(attempts, passingPct), [attempts, passingPct]);

  const visibleSets = useMemo(
    () => setsFor(activeSubject, levelKey, major),
    [setsFor, activeSubject, levelKey, major]
  );

  const regions = useMemo(
    () => buildCampaignRegions(visibleSets, attempts, { passingPct, subscribed, regionSize: 5 }),
    [visibleSets, attempts, passingPct, subscribed]
  );

  // Follow the active region when the student switches subject / majorship.
  useEffect(() => {
    const withCurrent = regions.find((r) => r.nodes.some((n) => n.state === "current"));
    setOpenRegion(withCurrent ? withCurrent.regionNo : regions[0]?.regionNo ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubject, levelKey, major, regions.length]);

  const subjectItems = (subjectKey: string) => {
    const own = allSets
      .filter(
        (s) =>
          (s.level === "both" || s.level === levelKey) &&
          s.subject === subjectKey &&
          (subjectKey !== "Specialization" || (major !== null && s.specialization === major))
      )
      .reduce((sum, s) => sum + s.live, 0);
    if (own > 0) return own;
    return stats
      .filter((s) => (s.level === "both" || s.level === levelKey) && s.subject === subjectKey)
      .reduce((sum, s) => sum + Number(s.accessible ?? 0), 0);
  };

  const masteryFor = (subjectKey: string) => mastery.find((m) => m.subject === subjectKey)?.pct ?? 0;

  const studyHref = (mode: string, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ level: levelKey, ...extra });
    if (major) p.set("major", major);
    return `/study/${trackSlug}/${mode}?${p.toString()}`;
  };
  const gateHref = isSignedIn ? "/dashboard" : `/login?next=/review/${trackSlug}`;

  const levelExams = exams.filter((e) => e.level === levelKey || e.level === "both");
  const mocks = levelExams.filter((e) => e.mode === "mock");
  const samplers = exams.filter((e) => e.is_free_preview);

  const primaryBtn = isLET ? "btn-arcade-gold" : "btn-arcade-green";
  const accentText = isLET ? "text-[#b45309]" : "text-[#15803d]";
  const accentSoft = isLET ? "bg-[#fef9c3]" : "bg-[#dcfce7]";
  const hero = isLET
    ? "from-[#b45309] via-[#ca8a04] to-[#15803d]"
    : "from-[#14532d] via-[#15803d] to-[#ca8a04]";

  const TABS: { id: HubTab; icon: string; label: string; badge: string }[] = [
    { id: "campaign", icon: "🗺️", label: "Campaign Map", badge: isLET ? `${visibleSets.length} sets` : `${mocks.length} mocks` },
    { id: "arena", icon: "⚡", label: "Quick Arena", badge: "Drills" },
  ];

  return (
    <div>
      {/* ============================== HUD ============================== */}
      <section className={`relative overflow-hidden bg-gradient-to-br ${hero} py-8 text-white shadow-lg`}>
        <div className="orb orb-green -left-24 -top-24 opacity-40" />
        <div className="orb orb-gold -bottom-24 -right-24 opacity-40" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div>
              <div className="mb-2 inline-flex flex-wrap items-center gap-2 rounded-full bg-black/25 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-white">
                <span>{isLET ? "🍎" : "🏛️"}</span>
                <span>{isLET ? "Licensure Exam for Teachers" : "Civil Service Exam"}</span>
                <span>·</span>
                <span>{levelLabel(trackKey, levelKey)}</span>
                {major && <span className="text-[#fef08a]">· {major}</span>}
              </div>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{trackKey} Campaign Arena</h1>
              <p className="mt-1 max-w-2xl text-sm text-white/90">
                {subscribed
                  ? "Clear a set at the passing mark to light up the next node, earn stars, and keep your streak alive."
                  : `The free sampler is open. Subscribe for ${peso(500)} to unlock every 150-item set, drill and flashcard.`}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {isLET && (
                <Link href="/read" className="btn-arcade-surface px-5 py-3 text-sm">
                  📖 Reading library
                </Link>
              )}
              {!subscribed && (
                <Link href={gateHref} className="btn-arcade-surface px-6 py-3 text-sm text-[#16331f]">
                  🔓 Unlock — {peso(500)}
                </Link>
              )}
            </div>
          </div>

          {/* Player HUD */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/20 bg-black/20 p-3.5">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-white/75">
                <span>Rank · Lv.{player.level}</span>
                <span>{player.rankIcon}</span>
              </div>
              <div className="mt-1 truncate text-sm font-black text-white">{player.rankTitle}</div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#4ade80] to-[#facc15]"
                  style={{ width: `${player.levelProgressPct}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/20 bg-black/20 p-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/75">Total XP</div>
              <div className="mt-1 text-2xl font-black text-[#fef08a]">⚡ {player.xp.toLocaleString()}</div>
              <div className="mt-1 text-[11px] text-white/75">
                {player.xpForNextLevel - player.xpInLevel} XP to Lv.{player.level + 1}
              </div>
            </div>

            <div className="rounded-2xl border border-white/20 bg-black/20 p-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/75">Study streak</div>
              <div className="mt-1 text-2xl font-black text-white">
                🔥 {player.streakDays} {player.streakDays === 1 ? "day" : "days"}
              </div>
              <div className="mt-1 text-[11px] text-white/75">{player.totalAnswered.toLocaleString()} items answered</div>
            </div>

            <div className="rounded-2xl border border-white/20 bg-black/20 p-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/75">Papers cleared</div>
              <div className="mt-1 text-2xl font-black text-[#86efac]">🏆 {player.examsPassed}</div>
              <div className="mt-1 text-[11px] text-white/75">Target {passingPct}% to clear</div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== LEVEL / MAJORSHIP CONTROL BAR ==================== */}
      <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="game-card p-4 sm:p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#5c7863]">1. Division</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${accentSoft} ${accentText}`}>
                  ✓ {levelLabel(trackKey, levelKey)} — selected
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {levelOptions.map((l) => {
                  const active = l.key === levelKey;
                  return (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => applySelection(l.key, major)}
                      aria-pressed={active}
                      className={`relative flex flex-col items-start gap-0.5 rounded-2xl px-4 py-3 text-left transition sm:min-w-[190px] ${
                        active
                          ? "border-2 border-[#0b1f13] border-b-[6px] bg-[#16331f] text-white shadow-lg"
                          : "border-2 border-[#d9e6d3] border-b-[6px] bg-white text-[#3d5c44] hover:border-[#16a34a] hover:bg-[#f6faf4]"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-black">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                            active ? "bg-[#4ade80] text-[#0b1f13]" : "bg-[#eef4ea] text-[#94a896]"
                          }`}
                        >
                          {active ? "✓" : l.key === "elementary" ? "1" : "2"}
                        </span>
                        {l.key === "elementary" ? "Elementary" : "Secondary"}
                      </span>
                      <span className={`text-[11px] font-semibold ${active ? "text-[#bbf7d0]" : "text-[#94a896]"}`}>
                        {active ? "You are studying this" : "Tap to switch"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {majorOptions.length > 0 && (
              <div className="flex w-full max-w-xs flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[#5c7863]">
                    2. Majorship{majorRequired ? "" : " (optional)"}
                  </span>
                  {!major && majorRequired && (
                    <span className="rounded-full bg-[#fef3c7] px-2 py-0.5 text-[10px] font-black uppercase text-[#92400e]">
                      not picked yet
                    </span>
                  )}
                </div>
                <select
                  aria-label="Choose your majorship"
                  value={major ?? ""}
                  onChange={(e) => applySelection(levelKey, e.target.value || null)}
                  className="input-warm font-bold"
                >
                  <option value="">{majorRequired ? "— Pick your majorship —" : "— Plain BEEd (no major) —"}</option>
                  {majorOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] leading-snug text-[#5c7863]">
                  {majorRequired
                    ? "Each majorship is a separate 150-item paper."
                    : "Only BSNEd / BECEd takers sit a specialization paper."}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 border-b-2 border-[#d9e6d3] pb-3">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold transition sm:px-5 ${
                  active
                    ? "bg-[#16331f] text-white shadow-md"
                    : "border border-[#d9e6d3] bg-white text-[#3d5c44] hover:border-[#d4af37]"
                }`}
              >
                <span className="text-lg">{t.icon}</span>
                <span>{t.label}</span>
                <span
                  className={`hidden rounded-full px-2 py-0.5 text-[10px] font-black uppercase sm:inline ${
                    active ? "bg-[#ca8a04] text-white" : `${accentSoft} ${accentText}`
                  }`}
                >
                  {t.badge}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ============================== CAMPAIGN ============================== */}
      {tab === "campaign" && (
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#5c7863]">
              {isLET ? "Pick a subject campaign" : "Pick a paper"}
            </h2>
            <span className="text-xs font-bold text-[#5c7863]">{allSets.length} papers in the bank</span>
          </div>

          <div className={`mb-8 grid grid-cols-1 gap-3 ${subjects.length > 1 ? "sm:grid-cols-3" : ""}`}>
            {subjects.map((s) => {
              const selected = activeSubject === s.key;
              const count = subjectItems(s.key);
              const pct = masteryFor(s.key);
              const isSpec = s.key === "Specialization";
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setActiveSubject(s.key)}
                  aria-pressed={selected}
                  className={`game-card game-card-interactive flex flex-col p-4 text-left ${
                    selected ? "border-[#16a34a] bg-[#f6faf4] ring-2 ring-[#16a34a]/25" : ""
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-2xl">{s.icon}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${accentSoft} ${accentText}`}>
                      {isSpec && !major ? "Pick major" : `${count.toLocaleString()} items`}
                    </span>
                  </div>
                  <div className="text-base font-black text-[#16331f]">
                    {isSpec && major ? `Majorship · ${major}` : s.key}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-[#5c7863]">{s.note}</p>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[11px] font-bold text-[#5c7863]">
                      <span>Mastery</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#e2ece0]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#16a34a] to-[#eab308]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Specialization without a majorship: offer the majors as buttons. */}
          {activeSubject === "Specialization" && !major && (
            <div className="game-card mb-8 border-[#eab308] bg-[#fffbeb] p-6 text-center">
              <div className="mb-2 text-4xl">🎯</div>
              <h3 className="text-lg font-black text-[#16331f]">Pick your majorship to reveal that campaign</h3>
              <p className="mx-auto mb-4 mt-1 max-w-lg text-xs text-[#5c7863]">
                Each majorship is its own set of 150-item papers, exactly like the real subtest.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {majorOptions.map((m) => (
                  <button key={m} type="button" onClick={() => applySelection(levelKey, m)} className="btn-arcade-gold px-4 py-2 text-xs">
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Warm-up banner for the active subject */}
          {(activeSubject !== "Specialization" || major) && subjectItems(activeSubject) > 0 && (
            <div className="game-card mb-8 flex flex-col justify-between gap-4 bg-gradient-to-r from-[#f0fdf4] via-white to-[#fefce8] p-5 sm:flex-row sm:items-center">
              <div>
                <div className={`text-xs font-extrabold uppercase tracking-wider ${accentText}`}>
                  ⚡ Warm up before the 150-item paper
                </div>
                <div className="text-lg font-black text-[#16331f]">
                  {activeSubject === "Specialization" && major ? major : activeSubject} quick run
                </div>
                <p className="text-xs text-[#5c7863]">Short on time? Take a 20-item drill with instant explanations.</p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <Link
                  href={subscribed ? studyHref("drill", { subjects: activeSubject, count: "20" }) : gateHref}
                  className="btn-arcade-green px-5 py-2.5 text-xs sm:text-sm"
                >
                  {subscribed ? "🎯 20-item drill" : "🔒 20-item drill"}
                </Link>
                <Link
                  href={subscribed ? studyHref("flashcards", { subjects: activeSubject, count: "30" }) : gateHref}
                  className="btn-arcade-surface px-4 py-2.5 text-xs sm:text-sm"
                >
                  {subscribed ? "🃏 30 cards" : "🔒 30 cards"}
                </Link>
              </div>
            </div>
          )}

          {/* The map itself */}
          {regions.length > 0 ? (
            <div className="space-y-5">
              {regions.map((region) => {
                const isOpen = openRegion === region.regionNo;
                const hasCurrent = region.nodes.some((n) => n.state === "current");
                const cleared = region.completedCount === region.totalCount;
                return (
                  <div key={region.regionNo} className="game-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenRegion(isOpen ? -1 : region.regionNo)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-4 bg-[#f6faf4] px-5 py-4 text-left transition hover:bg-[#eef6eb]"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white ${
                            cleared ? "bg-[#16a34a]" : hasCurrent ? "bg-[#ca8a04]" : "bg-[#3d5c44]"
                          }`}
                        >
                          R{region.regionNo}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-black text-[#16331f]">{region.title}</h3>
                            {hasCurrent && (
                              <span className="rounded-full bg-[#fef9c3] px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-[#b45309]">
                                🎯 active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#5c7863]">{region.subtitle}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs font-extrabold text-[#16331f]">
                            {region.completedCount}/{region.totalCount} cleared
                          </div>
                          <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-[#d9e6d3]">
                            <div
                              className="h-full rounded-full bg-[#16a34a]"
                              style={{ width: `${Math.round((region.completedCount / Math.max(1, region.totalCount)) * 100)}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-sm font-black text-[#5c7863]">{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="p-4 sm:p-6">
                        {region.nodes.map((node, idx) => (
                          <div key={node.set.id}>
                            <CampaignNodeRow
                              node={node}
                              track={trackKey}
                              gateHref={gateHref}
                              primaryBtn={primaryBtn}
                              passingPct={passingPct}
                            />
                            {idx < region.nodes.length - 1 && (
                              <div className="ml-6 h-6 border-l-2 border-dashed border-[#16a34a]/40 pl-0">
                                <span className="ml-[-7px] block text-xs font-black text-[#16a34a]/60">▼</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <BlueprintMocks mocks={mocks} samplers={samplers} subscribed={subscribed} gateHref={gateHref} primaryBtn={primaryBtn} />
          )}
        </section>
      )}

      {/* ============================== ARENA ============================== */}
      {tab === "arena" && (
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="game-card mb-8 p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-xl font-black text-[#16331f]">⚡ Round length</h2>
                <p className="text-xs text-[#5c7863]">Pick how many items per round, then launch from any subject below.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setQuickCount(n)}
                    aria-pressed={quickCount === n}
                    className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                      quickCount === n
                        ? "bg-[#16331f] text-white"
                        : "border border-[#d9e6d3] bg-white text-[#3d5c44] hover:border-[#d4af37]"
                    }`}
                  >
                    {n} items
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {subjects.map((s) => {
              const count = subjectItems(s.key);
              const isSpec = s.key === "Specialization";
              const needsMajor = isSpec && !major;
              return (
                <div key={s.key} className="game-card flex flex-col p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-3xl">{s.icon}</span>
                    <span className={`rounded-lg px-2.5 py-1 text-xs font-extrabold ${accentSoft} ${accentText}`}>
                      {needsMajor ? "pick major" : `${count.toLocaleString()} items`}
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-[#16331f]">
                    {isSpec && major ? `${s.key} · ${major}` : s.key}
                  </h3>
                  <p className="mb-5 mt-1 flex-1 text-xs leading-relaxed text-[#5c7863]">{s.note}</p>

                  {needsMajor ? (
                    <p className="rounded-xl bg-[#fffbeb] p-3 text-center text-xs font-bold text-[#b45309]">
                      👆 Pick {majorRequired ? "your majorship" : "a majorship"} in the top bar first
                    </p>
                  ) : count === 0 ? (
                    <p className="rounded-xl bg-[#f6faf4] p-3 text-center text-xs font-bold text-[#94a896]">
                      Items still being uploaded
                    </p>
                  ) : !subscribed ? (
                    <Link href={gateHref} className="btn-arcade-surface w-full py-2.5 text-xs">
                      🔒 Subscribe to practice
                    </Link>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Link href={studyHref("drill", { subjects: s.key, count: String(quickCount) })} className="btn-arcade-green py-2.5 text-xs">
                        🎯 {quickCount} drill
                      </Link>
                      <Link
                        href={studyHref("flashcards", { subjects: s.key, count: String(quickCount) })}
                        className="btn-arcade-surface py-2.5 text-xs"
                      >
                        🃏 {quickCount} cards
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-[#5c7863]">Special modes</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Link
              href={subscribed ? studyHref("mistakes") : gateHref}
              className="game-card game-card-interactive flex items-start gap-4 p-5"
            >
              <span className="text-3xl">🔁</span>
              <div>
                <div className="font-black text-[#16331f]">Boss rematch: retry my mistakes</div>
                <p className="mt-1 text-xs text-[#5c7863]">
                  The exact items you got wrong. Get one right and it leaves the list.
                </p>
              </div>
            </Link>

            <Link href={subscribed ? studyHref("drill") : gateHref} className="game-card game-card-interactive flex items-start gap-4 p-5">
              <span className="text-3xl">🛠️</span>
              <div>
                <div className="font-black text-[#16331f]">Custom drill builder</div>
                <p className="mt-1 text-xs text-[#5c7863]">
                  Mix subjects, filter by difficulty, or turn on the countdown timer.
                </p>
              </div>
            </Link>

            {samplers.slice(0, 1).map((e) => (
              <Link key={e.id} href={`/exam/${e.id}`} className="game-card game-card-interactive flex items-start gap-4 p-5">
                <span className="text-3xl">🎁</span>
                <div>
                  <div className="font-black text-[#16331f]">{e.title}</div>
                  <p className="mt-1 text-xs text-[#5c7863]">{e.question_count} free items with instant explanations.</p>
                </div>
              </Link>
            ))}
          </div>

          {mocks.length > 0 && (
            <div className="mt-10">
              <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-[#5c7863]">
                Full blueprint mocks (timed, {passingPct}% to pass)
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {mocks.map((e) => {
                  const locked = !subscribed && !e.is_free_preview;
                  return (
                    <Link
                      key={e.id}
                      href={locked ? gateHref : `/exam/${e.id}`}
                      className="game-card game-card-interactive flex items-center justify-between gap-4 p-5"
                    >
                      <div>
                        <div className="font-black text-[#16331f]">
                          {locked ? "🔒 " : "⏱️ "}
                          {e.title}
                        </div>
                        <div className="mt-1 text-xs text-[#5c7863]">
                          {e.question_count} items · {e.duration_minutes} min · {e.passing_pct}% to pass
                        </div>
                      </div>
                      <span className={`${primaryBtn} shrink-0 px-4 py-2 text-xs`}>{locked ? "Locked" : "Start →"}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function CampaignNodeRow({
  node,
  track,
  gateHref,
  primaryBtn,
  passingPct,
}: {
  node: CampaignNode;
  track: Track;
  gateHref: string;
  primaryBtn: string;
  passingPct: number;
}) {
  const { set: s, state, bestPct, attemptsCount, stars } = node;
  const isCurrent = state === "current";
  const isDone = state === "done";
  const isLocked = state === "locked";

  const examHref = isLocked ? gateHref : `/exam/set/${s.id}`;
  const practiceHref = isLocked ? gateHref : `/exam/set/${s.id}?mode=practice`;

  return (
    <div
      className={`flex flex-col justify-between gap-4 rounded-2xl border-2 p-4 sm:flex-row sm:items-center ${
        isCurrent
          ? "node-pulse-gold border-[#ca8a04] bg-[#fffdf2]"
          : isDone
            ? "border-[#86efac] bg-[#f0fdf4]"
            : "border-[#e2ece0] bg-white"
      }`}
    >
      <div className="flex items-start gap-3.5">
        <div
          className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl font-black ${
            isDone ? "bg-[#16a34a] text-white" : isCurrent ? "bg-[#ca8a04] text-white" : "bg-[#eef4ea] text-[#3d5c44]"
          }`}
        >
          <span className="text-base leading-none">{isDone ? "✅" : isCurrent ? "🎯" : isLocked ? "🔒" : "⚔️"}</span>
          <span className="mt-0.5 text-[10px]">#{s.set_no}</span>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-black text-[#16331f]">Set {s.set_no}</span>
            {isCurrent && (
              <span className="rounded-full bg-[#ca8a04] px-2.5 py-0.5 text-[10px] font-black uppercase text-white">
                current mission
              </span>
            )}
            {isDone && (
              <span className="rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[10px] font-black uppercase text-[#166534]">
                cleared · {bestPct}%
              </span>
            )}
            {!isDone && bestPct !== null && (
              <span className="rounded-full bg-[#fef3c7] px-2.5 py-0.5 text-[10px] font-extrabold text-[#92400e]">
                best {bestPct}% · {attemptsCount}×
              </span>
            )}
            {bestPct !== null && (
              <span className="text-xs leading-none" aria-label={`${stars} of 3 stars`}>
                {[1, 2, 3].map((n) => (
                  <span key={n} className={n <= stars ? "text-[#eab308]" : "text-[#d9e6d3]"}>
                    ★
                  </span>
                ))}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[#5c7863]">
            {s.live} live · 150 served · ⏱ {timedMinutes(150, track)} min · {passingPct}% to clear
          </p>
          <p className="mt-0.5 text-[11px] text-[#94a896]">
            Mix: {s.shape_easy} easy · {s.shape_medium_hard} medium · {s.shape_extremely_hard} hard ·{" "}
            {s.shape_pedagogical} situational
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!isLocked && (
          <Link href={practiceHref} className="btn-arcade-surface px-3.5 py-2 text-xs" title="Untimed, with the answer and explanation after every item">
            💡 Practice
          </Link>
        )}
        <Link href={examHref} className={`${primaryBtn} px-4 py-2 text-xs`}>
          {isLocked ? "🔒 Unlock" : isDone ? "Replay mock →" : "⏱️ Start timed mock →"}
        </Link>
      </div>
    </div>
  );
}

function BlueprintMocks({
  mocks,
  samplers,
  subscribed,
  gateHref,
  primaryBtn,
}: {
  mocks: Exam[];
  samplers: Exam[];
  subscribed: boolean;
  gateHref: string;
  primaryBtn: string;
}) {
  if (mocks.length === 0 && samplers.length === 0) {
    return (
      <div className="game-card p-8 text-center">
        <div className="mb-2 text-4xl">🧠</div>
        <h3 className="mb-1 text-lg font-black text-[#16331f]">This campaign is still being built</h3>
        <p className="mx-auto mb-4 max-w-md text-sm text-[#5c7863]">
          The question bank for this paper is being uploaded. Sets and mocks appear here automatically as soon as
          they land — nothing to do on your side.
        </p>
        <Link href="/read" className="btn-arcade-surface px-5 py-2.5 text-sm">
          📖 Read the notes while you wait
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {mocks.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {mocks.map((e, idx) => {
            const locked = !subscribed && !e.is_free_preview;
            return (
              <Link
                key={e.id}
                href={locked ? gateHref : `/exam/${e.id}`}
                className="game-card game-card-interactive flex items-center justify-between gap-4 p-5"
              >
                <div>
                  <div className="mb-1 inline-flex rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[11px] font-extrabold text-[#15803d]">
                    Stage {idx + 1} · boss mock
                  </div>
                  <div className="text-base font-black text-[#16331f]">
                    {locked ? "🔒 " : "⏱️ "}
                    {e.title}
                  </div>
                  <div className="mt-1 text-xs text-[#5c7863]">
                    {e.question_count} items · {e.duration_minutes} min · {e.passing_pct}% to pass
                  </div>
                </div>
                <span className={`${primaryBtn} shrink-0 px-4 py-2 text-xs`}>{locked ? "Locked" : "Battle →"}</span>
              </Link>
            );
          })}
        </div>
      )}

      {samplers.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-[#5c7863]">
            🎁 Free tutorial stage (no subscription needed)
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {samplers.map((e) => (
              <Link key={e.id} href={`/exam/${e.id}`} className="game-card game-card-interactive flex items-center justify-between gap-4 p-5">
                <div>
                  <div className="font-black text-[#16331f]">🎁 {e.title}</div>
                  <div className="mt-1 text-xs text-[#5c7863]">{e.question_count} items · instant explanations</div>
                </div>
                <span className="btn-arcade-green px-4 py-2 text-xs">Play free →</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
