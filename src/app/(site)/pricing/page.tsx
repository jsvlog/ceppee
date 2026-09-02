import type { Metadata } from "next";
import Link from "next/link";
import { getUserContext } from "@/lib/queries";

export const metadata: Metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

const plans = [
  {
    track: "CSE",
    label: "Civil Service Exam Review",
    emoji: "🏛️",
    btn: "btn-primary",
    accent: "text-[#15803d]",
    soft: "bg-[#dcfce7]",
    features: [
      "All CSE lessons (Math, English, Filipino, Clerical, Constitution)",
      "Topic practice drills with explanations",
      "Full timed mock exams, just like the real thing",
      "Score history and progress tracking",
      "Access until the next CSE exam (usually 6 months)",
    ],
  },
  {
    track: "LET",
    label: "Licensure Exam for Teachers Review",
    emoji: "🍎",
    btn: "btn-gold",
    accent: "text-[#b45309]",
    soft: "bg-[#fef9c3]",
    features: [
      "Professional Education lessons (40% of the score!)",
      "Gen Ed: English, Math, Science reviewers",
      "Case-based practice drills with explanations",
      "Full timed mock exams",
      "Access until the next LET exam (usually 6 months)",
    ],
  },
];

export default async function PricingPage() {
  const { user } = await getUserContext();

  return (
    <div className="gradient-hero relative overflow-hidden">
      <div className="orb orb-green -left-24 -top-24" />
      <div className="orb orb-gold -bottom-24 -right-20" />

      <div className="relative mx-auto max-w-5xl px-4 pt-20 pb-14 sm:px-6 lg:px-8">
        <div className="mb-4 text-center mx-auto">
          <h1 className="text-4xl font-black text-[#16331f] sm:text-5xl">
            One payment, <span className="gradient-text">the whole review season</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[#5c7863]">
            ₱500 per track. No monthly fees, no hidden charges. Just GCash or bank transfer.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 justify-center">
          {plans.map((p) => (
            <div key={p.track} className="card relative overflow-hidden p-8">
              <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full ${p.soft} blur-2xl`} />
              <div className="mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold text-white" style={{ background: p.track === "CSE" ? "linear-gradient(135deg,#16a34a,#d4af37)" : "linear-gradient(135deg,#ca8a04,#eab308)" }}>
                {p.emoji} {p.track}
              </div>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-5xl font-black text-[#16331f]">₱500</span>
                <span className="text-sm text-[#5c7863]">/ season</span>
              </div>
              <p className={`mb-6 text-sm font-semibold ${p.accent}`}>{p.label}</p>
              <ul className="mb-8 space-y-3 text-sm text-[#3d5c44]">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dcfce7] text-xs font-bold text-[#16a34a]">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={user ? "/dashboard" : "/login?mode=signup"}
                className={`${p.btn} block px-6 py-3.5 text-center text-sm`}
              >
                {user ? `Subscribe to ${p.track}` : `Get ${p.track} Review — ₱500`}
              </Link>
            </div>
          ))}
        </div>

        <div className="card mx-auto mt-12 max-w-2xl p-8 text-center">
          <h2 className="mb-3 text-xl font-bold text-[#16331f]">How to pay</h2>
          <div className="grid grid-cols-1 gap-4 text-sm text-[#5c7863] sm:grid-cols-3">
            <div className="rounded-2xl bg-[#dcfce7] p-4">
              <div className="mb-1 text-2xl">1️⃣</div>
              Click Subscribe and you'll see the GCash/bank details
            </div>
            <div className="rounded-2xl bg-[#dcfce7] p-4">
              <div className="mb-1 text-2xl">2️⃣</div>
              Send the exact amount, then upload the receipt + reference number
            </div>
            <div className="rounded-2xl bg-[#dcfce7] p-4">
              <div className="mb-1 text-2xl">3️⃣</div>
              We verify within 24 hours — access unlocks automatically
            </div>
          </div>
          <p className="mt-6 text-xs text-[#94a896]">
            If the exam date changes and the season gets longer, we extend your access for free. Promise.
          </p>
        </div>
      </div>
    </div>
  );
}
