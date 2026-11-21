import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/queries";
import { PLANS } from "@/lib/paymongo";
import PlanCheckout, { type PlanOption } from "@/components/PlanCheckout";
import type { Track } from "@/lib/types";

export const metadata: Metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

const TRACKS: { track: Track; emoji: string; label: string; accent: string; soft: string; features: string[] }[] = [
  {
    track: "CSE",
    emoji: "🏛️",
    label: "Civil Service Exam Review",
    accent: "text-[#15803d]",
    soft: "bg-[#dcfce7]",
    features: [
      "All CSE lessons (Verbal, Numerical, Analytical, Clerical, Gen Info)",
      "Drills with an explanation after every item",
      "Full 170-item timed mocks, graded like the real thing",
      "Score history, streaks and the leaderboard",
    ],
  },
  {
    track: "LET",
    emoji: "🍎",
    label: "Licensure Exam for Teachers Review",
    accent: "text-[#b45309]",
    soft: "bg-[#fef9c3]",
    features: [
      "202 sets / 29,618 items across every majorship",
      "Gen Ed + Prof Ed + your Specialization paper",
      "Set mocks: one 150-item paper at a time, practice or timed",
      "Reading library (3.7M words) while your pass is active",
    ],
  },
];

function prettyDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
}

export default async function PricingPage() {
  const { user, subs } = await getUserContext();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", ["exam_date_CSE", "exam_date_LET"]);
  const examDates = Object.fromEntries((settings ?? []).map((r) => [r.key, r.value])) as Record<string, string>;

  const enabled = Boolean(process.env.PAYMONGO_SECRET_KEY);
  const season = PLANS.season;
  const monthly = PLANS.monthly;

  return (
    <div className="gradient-hero relative overflow-hidden">
      <div className="orb orb-green -left-24 -top-24" />
      <div className="orb orb-gold -bottom-24 -right-20" />

      <div className="relative mx-auto max-w-5xl px-4 pt-20 pb-14 sm:px-6 lg:px-8">
        <div className="mb-4 mx-auto text-center">
          <h1 className="text-4xl font-black text-[#16331f] sm:text-5xl">
            Two ways to pay, <span className="gradient-text">same reviewer</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[#5c7863]">
            Pay once until your exam date, or go month by month at ₱100. GCash, Maya, QR Ph or card — access
            unlocks by itself the moment PayMongo confirms.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2">
          {TRACKS.map((t) => {
            const examLabel = prettyDate(examDates[`exam_date_${t.track}`] ?? null);
            const active = subs.find(
              (s) => s.track === t.track && s.status === "active" && new Date(s.expires_at) > new Date()
            );
            const options: PlanOption[] = [
              {
                id: "season",
                price: season.price,
                label: season.label,
                blurb: examLabel
                  ? `One payment, access until the ${t.track} exam on ${examLabel}.`
                  : "One payment, access until your exam date (180 days while the date is not posted yet).",
                badge: "best value",
              },
              {
                id: "monthly",
                price: monthly.price,
                label: monthly.label,
                blurb: "30 days. Buy again anytime — extra days stack on top.",
              },
            ];

            return (
              <div key={t.track} className="card relative overflow-hidden p-8">
                <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full ${t.soft} blur-2xl`} />
                <div
                  className="mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold text-white"
                  style={{
                    background:
                      t.track === "CSE"
                        ? "linear-gradient(135deg,#16a34a,#d4af37)"
                        : "linear-gradient(135deg,#ca8a04,#eab308)",
                  }}
                >
                  {t.emoji} {t.track}
                </div>
                <p className={`mb-4 text-sm font-semibold ${t.accent}`}>{t.label}</p>

                <ul className="mb-6 space-y-2.5 text-sm text-[#3d5c44]">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dcfce7] text-xs font-bold text-[#16a34a]">
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>

                <PlanCheckout
                  track={t.track}
                  plans={options}
                  enabled={enabled}
                  isSignedIn={Boolean(user)}
                  activeUntil={
                    active
                      ? new Date(active.expires_at).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : null
                  }
                />
              </div>
            );
          })}
        </div>

        <div className="card mx-auto mt-12 max-w-2xl p-8 text-center">
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
