import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBankStats, getUserContext } from "@/lib/queries";
import { accessUntil, canAccess } from "@/lib/access";
import { PLANS } from "@/lib/paymongo";
import PlanCheckout, { type PlanOption } from "@/components/PlanCheckout";
import type { BankStat, Track } from "@/lib/types";

export const metadata: Metadata = {
  title: "Pricing — CSE and LET review",
  description:
    "Pay only for the exam you are taking. CSE and LET are sold separately: complete packages, one subject, or a monthly pass.",
  alternates: { canonical: "/pricing" },
};
export const dynamic = "force-dynamic";

function prettyDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
}

const TRACK_COPY: Record<Track, { emoji: string; title: string; sub: string }> = {
  LET: { emoji: "🍎", title: "LET", sub: "Licensure Exam for Teachers" },
  CSE: { emoji: "🏛️", title: "CSE", sub: "Civil Service Exam" },
};

function money(n: number) {
  return `₱${n.toLocaleString()}`;
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { user, subs } = await getUserContext();
  const supabase = await createClient();

  const [{ data: settings }, letBank, cseBank] = await Promise.all([
    supabase.from("site_settings").select("key, value").in("key", ["exam_date_CSE", "exam_date_LET"]),
    getBankStats("LET"),
    getBankStats("CSE"),
  ]);

  const examDates = Object.fromEntries((settings ?? []).map((r) => [r.key as string, r.value as string])) as Record<
    string,
    string
  >;
  const enabled = Boolean(process.env.PAYMONGO_SECRET_KEY);

  const bankSize: Record<Track, number> = {
    LET: (letBank as BankStat[]).reduce((a, b) => a + b.total, 0),
    CSE: (cseBank as BankStat[]).reduce((a, b) => a + b.total, 0),
  };
  const bank: Record<Track, BankStat[]> = { LET: letBank as BankStat[], CSE: cseBank as BankStat[] };

  // ---- which family is this visitor looking at? ---------------------------
  const wanted = String(sp.track ?? "").toUpperCase();
  const ownTrack: Track | null = canAccess(subs, { track: "LET" })
    ? "LET"
    : canAccess(subs, { track: "CSE" })
      ? "CSE"
      : null;
  const track: Track = wanted === "CSE" || wanted === "LET" ? (wanted as Track) : (ownTrack ?? "LET");

  const wantedLevel = String(sp.level ?? "");
  const level: "elementary" | "secondary" =
    wantedLevel === "secondary" || wantedLevel === "elementary" ? wantedLevel : "secondary";

  const href = (t: Track, lv: "elementary" | "secondary") => `/pricing?track=${t}&level=${lv}`;
  const trackLive = bankSize[track] > 0;

  // ---- the plans for this family -----------------------------------------
  const complete =
    track === "CSE" ? PLANS.csec : level === "elementary" ? PLANS.beed : PLANS.bsed;
  const completeUntil = accessUntil(subs, { track, level });
  const monthlyUntil = accessUntil(subs, { track });
  const examLabel = prettyDate(examDates[`exam_date_${track}`]);

  // subjects / categories, with how much sits in each
  const subjectTotals = new Map<string, number>();
  for (const row of bank[track]) {
    if (!row.subject) continue;
    subjectTotals.set(row.subject, (subjectTotals.get(row.subject) ?? 0) + row.total);
  }
  const subjects = [...subjectTotals.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      until: accessUntil(subs, { track, level, subject: name }),
    }));

  const completeFeatures =
    track === "CSE"
      ? [
          "Every CSE category in one pass",
          "Drills with an explanation after every item",
          "Timed mocks scored like the real exam",
          "Score history, streaks and the leaderboard",
        ]
      : level === "elementary"
        ? [
            "Gen Ed + Prof Ed — the papers every teacher sits",
            "Your elementary specialization (BSNEd, BECEd and the rest)",
            "Sets, drills and timed mocks",
            "Reading library while your pass is active",
          ]
        : [
            "Gen Ed + Prof Ed — the papers every teacher sits",
            "Your majorship paper (18,690 items across all majors)",
            "Sets, drills and timed mocks",
            "Reading library while your pass is active",
          ];

  const completeOption: PlanOption = {
    id: complete.id,
    price: complete.price,
    label: complete.label,
    term: complete.term,
    featured: true,
    badge: "best value",
    blurb: examLabel
      ? `One payment, everything until the ${track} exam on ${examLabel}.`
      : "One payment, everything until your exam date (180 days while the date is not posted).",
    ownedUntil: completeUntil
      ? new Date(completeUntil).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
      : null,
  };

  const monthlyOption: PlanOption = {
    id: "monthly",
    price: PLANS.monthly.price,
    term: PLANS.monthly.term,
    label: track === "LET" ? `Monthly — ${level === "elementary" ? "BEED" : "BSED"}` : "Monthly pass",
    blurb:
      track === "LET"
        ? `The same ${level === "elementary" ? "elementary (BEED)" : "secondary (BSED)"} access as the complete package, for 30 days. Buy again anytime — the days stack.`
        : "Everything in CSE for 30 days. Buy again anytime — the days stack.",
    ownedUntil: monthlyUntil
      ? new Date(monthlyUntil).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
      : null,
  };

  return (
    <div className="gradient-hero relative overflow-hidden">
      <div className="orb orb-green -left-24 -top-24" />
      <div className="orb orb-gold -bottom-24 -right-20" />

      <div className="relative mx-auto max-w-5xl px-4 pt-20 pb-14 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-black text-[#16331f] sm:text-5xl">
            Pay only for <span className="gradient-text">what you take</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[#5c7863]">
            CSE and LET are separate reviews with separate passes. Pick your exam first — you will only see the
            plans that fit it.
          </p>
        </div>

        {/* ---- step 1: the exam ------------------------------------------- */}
        <p className="mb-3 text-center text-xs font-black uppercase tracking-widest text-[#94a896]">
          1 · Which exam are you taking?
        </p>
        <div className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(["CSE", "LET"] as Track[]).map((t) => {
            const on = t === track;
            const items = bankSize[t];
            return (
              <Link
                key={t}
                href={href(t, level)}
                scroll={false}
                className={`group relative overflow-hidden rounded-3xl border-2 p-6 transition ${
                  on
                    ? "border-[#16a34a] bg-white shadow-lg shadow-[#16a34a]/10"
                    : "border-[#e6efe1] bg-white/70 hover:border-[#d4af37]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{TRACK_COPY[t].emoji}</span>
                  <div>
                    <p className="text-xl font-black text-[#16331f]">{TRACK_COPY[t].title}</p>
                    <p className="text-xs text-[#5c7863]">{TRACK_COPY[t].sub}</p>
                  </div>
                  {on && (
                    <span className="ml-auto rounded-full bg-[#16a34a] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                      showing
                    </span>
                  )}
                </div>
                <p className="mt-4 text-sm font-semibold text-[#3d5c44]">
                  {items > 0 ? `${items.toLocaleString()} items in the bank` : "Content on the way"}
                </p>
                <p className="mt-1 text-xs text-[#94a896]">
                  {items > 0 ? "Lessons, drills, sets and timed mocks" : "Plans open the day the first items land"}
                </p>
              </Link>
            );
          })}
        </div>

        {!trackLive ? (
          <div className="card mx-auto max-w-2xl p-8 text-center">
            <div className="mb-3 text-4xl">{TRACK_COPY[track].emoji}</div>
            <h2 className="text-2xl font-black text-[#16331f]">{TRACK_COPY[track].title} review is coming</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-[#5c7863]">
              No {TRACK_COPY[track].title} items are in the bank yet, so there is nothing to sell you. The plans
              open the moment the first paper is loaded — nothing to sign up for.
            </p>
            <Link href={href(track === "CSE" ? "LET" : "CSE", level)} className="btn-primary mt-6 inline-block px-6 py-3">
              See the {track === "CSE" ? "LET" : "CSE"} plans
            </Link>
          </div>
        ) : (
          <>
            {/* ---- step 2: level (LET only) ------------------------------- */}
            {track === "LET" && (
              <>
                <p className="mb-3 text-center text-xs font-black uppercase tracking-widest text-[#94a896]">
                  2 · Elementary or secondary?
                </p>
                <div className="mx-auto mb-10 flex max-w-lg overflow-hidden rounded-2xl border border-[#e6efe1] bg-white p-1">
                  {(
                    [
                      { id: "elementary", label: "Elementary (BEED)", price: PLANS.beed.price },
                      { id: "secondary", label: "Secondary (BSED)", price: PLANS.bsed.price },
                    ] as const
                  ).map((o) => (
                    <Link
                      key={o.id}
                      href={href("LET", o.id)}
                      scroll={false}
                      className={`flex-1 rounded-xl px-4 py-3 text-center transition ${
                        level === o.id ? "bg-[#16331f] text-white" : "text-[#3d5c44] hover:bg-[#f4f8f1]"
                      }`}
                    >
                      <span className="block text-sm font-bold">{o.label}</span>
                      <span className={`block text-xs ${level === o.id ? "text-[#c9d8c9]" : "text-[#94a896]"}`}>
                        complete {money(o.price)}
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}

            {/* ---- step 3: the plans -------------------------------------- */}
            <p className="mb-2 text-center text-xs font-black uppercase tracking-widest text-[#94a896]">
              {track === "LET" ? "3" : "2"} · Pick your plan
            </p>
            <p className="mb-6 text-center text-sm font-semibold text-[#3d5c44]">
              You are looking at{" "}
              <span className="rounded-md bg-[#16331f] px-2 py-0.5 text-xs font-black uppercase tracking-wide text-white">
                {track}
                {track === "LET" ? ` · ${level === "elementary" ? "Elementary (BEED)" : "Secondary (BSED)"}` : ""}
              </span>{" "}
              — {money(complete.price)} complete, {money(PLANS.monthly.price)} monthly
              {subjects.length > 0 ? `, ${money(PLANS.subject.price)} per ${track === "CSE" ? "category" : "subject"}` : ""}.
            </p>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_1fr]">
              <div className="card relative overflow-hidden p-6 sm:p-8">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#dcfce7] blur-2xl" />
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#16331f] px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white">
                  {TRACK_COPY[track].emoji} {track}
                  {track === "LET" ? ` · ${level === "elementary" ? "Elementary" : "Secondary"}` : ""}
                </div>
                <h2 className="text-2xl font-black text-[#16331f]">{complete.label}</h2>
                <ul className="mt-4 mb-6 space-y-2.5 text-sm text-[#3d5c44]">
                  {completeFeatures.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dcfce7] text-xs font-bold text-[#16a34a]">
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <PlanCheckout
                  track={track}
                  plans={[completeOption]}
                  enabled={enabled}
                  isSignedIn={Boolean(user)}
                  activeUntil={null}
                  level={track === "LET" ? level : null}
                />
              </div>

              <div className="space-y-4">
                <PlanCheckout
                  track={track}
                  plans={[monthlyOption]}
                  enabled={enabled}
                  isSignedIn={Boolean(user)}
                  activeUntil={null}
                  level={track === "LET" ? level : null}
                />
                <div className="rounded-2xl border border-[#e6efe1] bg-white/80 p-5">
                  <p className="text-sm font-bold text-[#16331f]">Not sure yet?</p>
                  <p className="mt-1 text-xs text-[#5c7863]">
                    The monthly pass gives the same access as the complete package for 30 days. If you stick with
                    it, nothing is wasted — but the complete package works out cheaper if you are staying until exam day.
                  </p>
                </div>
              </div>
            </div>

            {/* ---- one subject ------------------------------------------- */}
            {subjects.length > 0 && (
              <div className="mt-12">
                <h2 className="text-center text-2xl font-black text-[#16331f]">
                  Or just one {track === "CSE" ? "category" : "subject"} — {money(PLANS.subject.price)}
                </h2>
                <p className="mx-auto mt-2 mb-6 max-w-xl text-center text-sm text-[#5c7863]">
                  A single paper, unlocked until exam day. Handy when one subject is the only thing standing
                  between you and a passing score.
                </p>
                <PlanCheckout
                  track={track}
                  level={track === "LET" ? level : null}
                  columns={2}
                  plans={subjects.map((s) => ({
                    id: "subject",
                    price: PLANS.subject.price,
                    label: s.name,
                    term: PLANS.subject.term,
                    subject: s.name,
                    blurb: `${s.count.toLocaleString()} items in the bank. Unlocked until exam day.`,
                    ownedUntil: s.until
                      ? new Date(s.until).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : null,
                  }))}
                  enabled={enabled}
                  isSignedIn={Boolean(user)}
                  activeUntil={null}
                />
              </div>
            )}
          </>
        )}

        <div className="card mx-auto mt-14 max-w-2xl p-8 text-center">
          <h2 className="mb-3 text-xl font-bold text-[#16331f]">What happens after you pay</h2>
          <div className="grid grid-cols-1 gap-4 text-sm text-[#5c7863] sm:grid-cols-3">
            <div className="rounded-2xl bg-[#dcfce7] p-4">
              <div className="mb-1 text-2xl">1️⃣</div>
              Pick a plan — you are sent to PayMongo
            </div>
            <div className="rounded-2xl bg-[#dcfce7] p-4">
              <div className="mb-1 text-2xl">2️⃣</div>
              Pay with GCash, Maya, QR Ph or card
            </div>
            <div className="rounded-2xl bg-[#dcfce7] p-4">
              <div className="mb-1 text-2xl">3️⃣</div>
              Access unlocks automatically — no waiting for approval
            </div>
          </div>
          <p className="mt-6 text-xs text-[#94a896]">
            Prefer GCash transfer? You can still send it manually from your{" "}
            <Link
              href={user ? "/dashboard" : "/login"}
              className="underline decoration-[#d4af37] decoration-2 underline-offset-2"
            >
              dashboard
            </Link>{" "}
            and an admin approves it within 24 hours.
          </p>
        </div>
      </div>
    </div>
  );
}
