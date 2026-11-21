import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserContext, hasActiveSub, getLeaderboard, getLeaderboardAround } from "@/lib/queries";
import { rankForLevel } from "@/lib/game";
import ResetCountdown from "@/components/leaderboard/ResetCountdown";
import type { LeaderboardPeriod, LeaderboardRow, Track } from "@/lib/types";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

const TRACKS: Record<string, Track> = { cse: "CSE", let: "LET" };
const SLUGS: Record<Track, string> = { CSE: "cse", LET: "let" };

const PERIODS: { key: LeaderboardPeriod; label: string; blurb: string }[] = [
  { key: "daily", label: "Today", blurb: "XP earned since midnight (Philippine time)." },
  { key: "weekly", label: "This week", blurb: "XP since Monday 00:00 (Philippine time)." },
  { key: "all", label: "All-time", blurb: "Every point since you started reviewing." },
];

const MEDALS = ["🥇", "🥈", "🥉"];

function Row({
  row,
  highlight,
  showDivider,
}: {
  row: LeaderboardRow;
  highlight?: boolean;
  showDivider?: boolean;
}) {
  const rank = rankForLevel(row.level);
  const medal = MEDALS[row.rank - 1];
  return (
    <>
      {showDivider && (
        <div className="flex items-center gap-3 px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#94a896]">
          <span className="h-px flex-1 bg-[#e6efe1]" />
          your position
          <span className="h-px flex-1 bg-[#e6efe1]" />
        </div>
      )}
      <div
        className={`flex items-center gap-3 border-t border-[#eef4ea] px-4 py-3 first:border-t-0 sm:gap-4 ${
          highlight ? "bg-[#f0fdf4] shadow-[inset_4px_0_0_0_#16a34a]" : row.rank <= 3 ? "bg-[#fffdf5]" : ""
        }`}
      >
        <div className="w-9 shrink-0 text-center">
          {medal ? (
            <span className="text-xl">{medal}</span>
          ) : (
            <span className="text-sm font-black text-[#94a896]">#{row.rank}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-extrabold text-[#16331f]">{row.display_name}</span>
            {row.is_me && (
              <span className="shrink-0 rounded-md bg-[#16a34a] px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                you
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#5c7863]">
            <span>
              {rank.icon} {rank.title}
            </span>
            <span className="text-[#c8d6c2]">·</span>
            <span>
              Lv {row.level} · {row.papers} paper{row.papers === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-base font-black tabular-nums text-[#16331f] sm:text-lg">
            {row.xp.toLocaleString()}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-[#94a896]">xp</div>
        </div>
      </div>
    </>
  );
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const { user, subs, isAdmin } = await getUserContext();
  if (!user) redirect("/login?next=/leaderboard");

  // Default to the track they actually study, so the first visit is never the
  // wrong board. Only a ?track= in the URL overrides it.
  const ownTrack: Track = hasActiveSub(subs, "LET") ? "LET" : hasActiveSub(subs, "CSE") ? "CSE" : "LET";
  const track = TRACKS[first(sp.track)?.toLowerCase() ?? ""] ?? ownTrack;

  const periodRaw = first(sp.period)?.toLowerCase();
  const period = (PERIODS.find((p) => p.key === periodRaw)?.key ?? "daily") as LeaderboardPeriod;
  const periodMeta = PERIODS.find((p) => p.key === period)!;

  const [rows, around] = await Promise.all([
    getLeaderboard(track, period, 20),
    getLeaderboardAround(track, period, 2),
  ]);

  const me = around.find((r) => r.is_me) ?? null;
  const players = around[0]?.players ?? rows.length;
  const resetsAt = around[0]?.resets_at ?? null;
  const above = me ? around.find((r) => r.rank === me.rank - 1) ?? null : null;
  const behind = above && me ? Math.max(0, above.xp + 1 - me.xp) : 0;
  const inTop = me ? me.rank <= rows.length : false;
  const isLET = track === "LET";
  const accent = isLET ? "text-[#b45309]" : "text-[#15803d]";
  const accentSoft = isLET ? "bg-[#fef9c3]" : "bg-[#dcfce7]";
  const hero = isLET
    ? "from-[#b45309] via-[#ca8a04] to-[#15803d]"
    : "from-[#14532d] via-[#15803d] to-[#ca8a04]";

  const href = (next: Partial<{ track: Track; period: LeaderboardPeriod }>) => {
    const t = next.track ?? track;
    const p = next.period ?? period;
    return `/leaderboard?track=${SLUGS[t]}&period=${p}`;
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Hero */}
      <div className={`relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br ${hero} p-6 text-white shadow-lg sm:p-8`}>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-16 -left-8 h-44 w-44 rounded-full bg-black/10" />
        <div className="relative">
          <div className="text-xs font-black uppercase tracking-[0.2em] text-white/70">Teacher Ceppee Review</div>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">🏆 Leaderboard</h1>
          <p className="mt-2 max-w-lg text-sm text-white/85">
            10 XP for every correct answer, plus 150 for passing a timed paper. Study, climb, and put your name
            where everyone can see it.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {me ? (
              <div className="rounded-2xl bg-white/15 px-4 py-2.5 backdrop-blur-sm">
                <div className="text-[10px] font-black uppercase tracking-wider text-white/70">Your rank</div>
                <div className="text-2xl font-black leading-none">
                  #{me.rank}
                  <span className="ml-1 text-sm font-bold text-white/70">of {players}</span>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-white/15 px-4 py-2.5 text-sm font-bold backdrop-blur-sm">
                You are not on the board yet — finish one drill to get on it.
              </div>
            )}
            {me && (
              <div className="rounded-2xl bg-white/15 px-4 py-2.5 backdrop-blur-sm">
                <div className="text-[10px] font-black uppercase tracking-wider text-white/70">
                  {periodMeta.label === "All-time" ? "Your XP" : `Your XP · ${periodMeta.label.toLowerCase()}`}
                </div>
                <div className="text-2xl font-black leading-none">{me.xp.toLocaleString()}</div>
              </div>
            )}
            {me && above && (
              <div className="rounded-2xl bg-black/20 px-4 py-2.5 text-xs font-bold backdrop-blur-sm">
                {behind.toLocaleString()} XP to pass {above.display_name} (#{above.rank})
              </div>
            )}
            {me && !above && (
              <div className="rounded-2xl bg-black/20 px-4 py-2.5 text-xs font-bold backdrop-blur-sm">
                👑 Top of this board — defend it.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-[#d9e6d3] bg-white p-1">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={href({ period: p.key })}
              className={`rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
                p.key === period ? "bg-[#16331f] text-white" : "text-[#3d5c44] hover:bg-[#f0fdf4]"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>

        <div className="inline-flex rounded-xl border border-[#d9e6d3] bg-white p-1">
          {(["CSE", "LET"] as Track[]).map((t) => (
            <Link
              key={t}
              href={href({ track: t })}
              className={`rounded-lg px-3.5 py-2 text-xs font-extrabold transition ${
                t === track
                  ? t === "LET"
                    ? "bg-[#ca8a04] text-white"
                    : "bg-[#15803d] text-white"
                  : "text-[#3d5c44] hover:bg-[#f0fdf4]"
              }`}
            >
              {t}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-[#5c7863]">
        <span>
          {periodMeta.blurb} {players.toLocaleString()} student{players === 1 ? "" : "s"} scored.
          {isAdmin && " You are signed in as an admin, so your own attempts are not ranked."}
        </span>
        <ResetCountdown resetsAt={resetsAt} className="font-bold text-[#3d5c44]" />
      </div>

      {/* Board */}
      {rows.length === 0 ? (
        <div className="card border-[#fde68a] bg-[#fffbeb] p-8 text-center">
          <div className="mb-3 text-4xl">🏁</div>
          <h2 className="mb-2 text-xl font-black text-[#16331f]">Nobody has scored {period === "all" ? "yet" : `${periodMeta.label.toLowerCase()}`}</h2>
          <p className="mx-auto mb-6 max-w-md text-sm text-[#b45309]">
            The first finished drill claims this board. {period === "daily" ? "It resets at midnight, so today is wide open." : "Get in early and stay on top."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href={`/review/${SLUGS[track]}`} className={isLET ? "btn-arcade-gold px-5 py-2.5 text-sm" : "btn-arcade-green px-5 py-2.5 text-sm"}>
              ⚡ Open Quick Arena
            </Link>
            <Link href={`/review/${SLUGS[track]}`} className="rounded-xl border border-[#d9e6d3] bg-white px-5 py-2.5 text-sm font-semibold text-[#3d5c44]">
              🗺️ Campaign Map
            </Link>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-[#eef4ea] bg-[#f6faf4] px-4 py-3">
            <h2 className="text-sm font-black uppercase tracking-wider text-[#16331f]">
              {isLET ? "LET" : "CSE"} · {periodMeta.label}
            </h2>
            <span className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${accentSoft} ${accent}`}>
              {isLET ? "green + gold" : "civil service"}
            </span>
          </div>

          {rows.map((r) => (
            <Row key={r.user_id} row={r} highlight={r.is_me} />
          ))}

          {/* A student outside the top 20 still sees where they stand. */}
          {me && !inTop && (
            <>
              {around.map((r, i) => (
                <Row key={r.user_id} row={r} highlight={r.is_me} showDivider={i === 0} />
              ))}
            </>
          )}
        </div>
      )}

      {me && inTop && (
        <p className="mt-3 px-1 text-[11px] text-[#5c7863]">
          You are #{me.rank} on this board. {" "}
          {above ? `${behind.toLocaleString()} XP from #${above.rank}.` : "Keep it there."}
        </p>
      )}

      <p className="mt-6 px-1 text-[11px] leading-relaxed text-[#94a896]">
        XP is counted from finished drills and timed papers, server-side — the same numbers as your level badge.
        Names show as first name + last initial; no emails are ever displayed. Admins and test accounts are not
        ranked.
      </p>
    </div>
  );
}
