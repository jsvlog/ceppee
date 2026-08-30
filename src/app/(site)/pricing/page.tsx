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
    accent: "text-[#0284c7]",
    soft: "bg-[#e0f2fe]",
    features: [
      "Lahat ng CSE lessons (Math, English, Filipino, Clerical, Constitution)",
      "Topic practice drills na may explanation",
      "Full timed mock exams na parang totohanan",
      "Score history at progress tracking",
      "Access hanggang sa next CSE exam (usually 6 months)",
    ],
  },
  {
    track: "LET",
    label: "Licensure Exam for Teachers Review",
    emoji: "🍎",
    btn: "btn-violet",
    accent: "text-[#7c3aed]",
    soft: "bg-[#f5f0ff]",
    features: [
      "Professional Education lessons (40% ng score!)",
      "Gen Ed: English, Math, Science reviewers",
      "Case-based practice drills na may explanation",
      "Full timed mock exams",
      "Access hanggang sa next LET exam (usually 6 months)",
    ],
  },
];

export default async function PricingPage() {
  const { user } = await getUserContext();

  return (
    <div className="gradient-hero relative overflow-hidden">
      <div className="orb orb-blue -left-24 -top-24" />
      <div className="orb orb-violet -bottom-24 -right-20" />

      <div className="relative mx-auto max-w-5xl px-4 pt-20 pb-14 sm:px-6 lg:px-8">
        <div className="mb-4 text-center mx-auto">
          <h1 className="text-4xl font-black text-[#142a56] sm:text-5xl">
            Isang bayad, <span className="gradient-text">buong review season</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[#5a6d91]">
            ₱500 kada track. Walang monthly fees, walang hidden charges. GCash o bank transfer lang.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 justify-center">
          {plans.map((p) => (
            <div key={p.track} className="card relative overflow-hidden p-8">
              <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full ${p.soft} blur-2xl`} />
              <div className="mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold text-white" style={{ background: p.track === "CSE" ? "linear-gradient(135deg,#0ea5e9,#38bdf8)" : "linear-gradient(135deg,#8b5cf6,#d946ef)" }}>
                {p.emoji} {p.track}
              </div>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-5xl font-black text-[#142a56]">₱500</span>
                <span className="text-sm text-[#5a6d91]">/ season</span>
              </div>
              <p className={`mb-6 text-sm font-semibold ${p.accent}`}>{p.label}</p>
              <ul className="mb-8 space-y-3 text-sm text-[#3f4d78]">
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
                {user ? `Subscribe sa ${p.track}` : `Get ${p.track} Review — ₱500`}
              </Link>
            </div>
          ))}
        </div>

        <div className="card mx-auto mt-12 max-w-2xl p-8 text-center">
          <h2 className="mb-3 text-xl font-bold text-[#142a56]">Paano nagbabayad?</h2>
          <div className="grid grid-cols-1 gap-4 text-sm text-[#5a6d91] sm:grid-cols-3">
            <div className="rounded-2xl bg-[#e0f2fe] p-4">
              <div className="mb-1 text-2xl">1️⃣</div>
              Click Subscribe at makikita ang GCash/bank details
            </div>
            <div className="rounded-2xl bg-[#e0f2fe] p-4">
              <div className="mb-1 text-2xl">2️⃣</div>
              Send the exact amount, upload receipt + reference number
            </div>
            <div className="rounded-2xl bg-[#e0f2fe] p-4">
              <div className="mb-1 text-2xl">3️⃣</div>
              I-verify namin within 24 hrs — automatic na bubukas ang access
            </div>
          </div>
          <p className="mt-6 text-xs text-[#93a4c0]">
            Kung nagbago ang exam date at humaba ang season, ina-extend namin ang access ng libre. Promise yan.
          </p>
        </div>
      </div>
    </div>
  );
}
