import Link from "next/link";
import { getSiteStats } from "@/lib/queries";
import { TRACK_LABEL } from "@/lib/format";
import Testimonials from "@/components/Testimonials";

export const dynamic = "force-dynamic";

const features = [
  {
    icon: "📚",
    title: "Complete Video + Text Lessons",
    desc: "Every topic has lessons that mix text and video — made for every learning style.",
  },
  {
    icon: "⏱️",
    title: "Timed Mock Exams",
    desc: "Just like the real thing: a time limit, a score, and an explanation for every answer.",
  },
  {
    icon: "🎯",
    title: "Topic Practice Drills",
    desc: "Struggling with Math? Just focus on Math. Practice per topic, no pressure.",
  },
  {
    icon: "📈",
    title: "Progress Tracking",
    desc: "See how far your review has come and exactly where you still need to focus.",
  },
  {
    icon: "📱",
    title: "Mobile Friendly",
    desc: "Review anywhere — on the jeep, during breaks, or right before bed.",
  },
  {
    icon: "✅",
    title: "Verified Answers",
    desc: "Every question has an explanation — you won't just know the answer, you'll know why.",
  },
];

const faqs = [
  {
    q: "How do I pay?",
    a: "GCash or bank transfer! When you click Subscribe, the payment details appear. Send the exact amount, upload the receipt screenshot and reference number, then we verify — usually within 24 hours.",
  },
  {
    q: "How much is it and how long is my access?",
    a: "₱500 per track (CSE or LET) for the entire review season — usually 6 months, right up to the next exam. If the exam date changes, we adjust your access so you're never left hanging.",
  },
  {
    q: "Are the CSE and LET subscriptions separate?",
    a: "Yes, because they prepare you for different exams. If you're taking both, you'll need two subscriptions — but the reviewers are separate too, so it's still worth it.",
  },
  {
    q: "Is there a free trial?",
    a: "There's a free preview lesson and a free sample mock exam in each track — try it first before subscribing. No credit card, no risk.",
  },
  {
    q: "When should I start reviewing?",
    a: "The earlier the better! Even 1–2 months before the exam, our reviewer can guide you if you stay consistent. Ideally 3–6 months of steady review.",
  },
  {
    q: "What if I don't pass?",
    a: "If you don't pass the exam you reviewed for, message Teacher Ceppee on Facebook — we'll give you extended access for the next exam run.",
  },
];

export default async function HomePage() {
  const stats = await getSiteStats();

  return (
    <div>
      {/* ===== HERO ===== */}
      <section className="gradient-hero relative overflow-hidden">
        <div className="orb orb-green -left-24 -top-24 animate-float" />
        <div className="orb orb-gold -right-20 top-32 animate-float-delayed" />
        <div className="relative mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="animate-fade-up mb-5 inline-flex items-center gap-2 rounded-full border border-[#d9e6d3] bg-white/80 px-4 py-1.5 text-sm font-semibold text-[#0369a1] shadow-sm">
              <span className="flex h-2 w-2 rounded-full bg-[#22c55e]" />
              Reviewing made easy, made by Teacher Ceppee
            </div>
            <h1 className="animate-fade-up mb-6 text-4xl font-black leading-tight tracking-tight text-[#16331f] sm:text-5xl lg:text-6xl">
              Pass the CSE or LET —<br />
              <span className="gradient-text">on your first take.</span>
            </h1>
            <p className="animate-fade-up mb-8 text-lg leading-relaxed text-[#5c7863] sm:text-xl">
              A complete online reviewer: lessons, practice drills, and realistic timed mock exams.
              The deal: <strong className="text-[#3d5c44]">₱500 per track</strong>, for the whole review season.
            </p>
            <div className="animate-fade-up mb-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="#tracks" className="btn-primary px-8 py-3.5 text-base">
                Choose Your Review →
              </Link>
              <Link href="/review/cse" className="rounded-xl border border-[#d9e6d3] bg-white px-8 py-3.5 text-base font-semibold text-[#3d5c44] shadow-sm transition hover:border-[#d4af37] hover:text-[#16331f]">
                Try Free Preview
              </Link>
            </div>
            <div className="animate-fade-up flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-[#5c7863]">
              <span>✓ {stats.lessons}+ lessons</span>
              <span>✓ {stats.questions}+ practice questions</span>
              <span>✓ {stats.exams} mock & practice exams</span>
              <span>✓ GCash / bank — no credit card needed</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TRACK CHOOSER ===== */}
      <section id="tracks" className="w-full py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-center mx-auto text-3xl font-black text-[#16331f] sm:text-4xl">
            Which exam are you reviewing for?
          </h2>
          <p className="mb-10 text-center mx-auto max-w-xl text-[#5c7863]">
            Two different exams, two dedicated reviewers. Pick the one for you.
          </p>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 justify-center">
            {/* CSE card */}
            <div className="card card-hover relative overflow-hidden p-8">
              <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#16a34a]/10 blur-2xl" />
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#dcfce7] px-4 py-1.5 text-sm font-bold text-[#15803d]">
                🏛️ For government work
              </div>
              <h3 className="mb-2 text-2xl font-extrabold text-[#16331f]">
                CSE Review
              </h3>
              <p className="mb-5 text-sm leading-relaxed text-[#5c7863]">
                Civil Service Exam — Professional and Sub-Professional. Math, English, Filipino,
                Clerical & Reasoning, and Constitution — all with lessons and drills.
              </p>
              <ul className="mb-6 space-y-2 text-sm text-[#3d5c44]">
                <li className="flex items-start gap-2"><span className="text-[#16a34a]">●</span> 5 major topics, pattern-based strategies</li>
                <li className="flex items-start gap-2"><span className="text-[#16a34a]">●</span> Timed mock exam with 170 items</li>
                <li className="flex items-start gap-2"><span className="text-[#16a34a]">●</span> Free preview lesson + sample drill</li>
              </ul>
              <div className="mb-6 flex items-baseline gap-2">
                <span className="text-3xl font-black text-[#16331f]">₱500</span>
                <span className="text-sm text-[#5c7863]">/ full review season</span>
              </div>
              <Link href="/review/cse" className="btn-primary block px-6 py-3 text-center text-sm">
                Start CSE Review
              </Link>
            </div>

            {/* LET card */}
            <div className="card card-hover relative overflow-hidden p-8">
              <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#ca8a04]/10 blur-2xl" />
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#fef9c3] px-4 py-1.5 text-sm font-bold text-[#b45309]">
                🍎 For future LPTs
              </div>
              <h3 className="mb-2 text-2xl font-extrabold text-[#16331f]">
                LET Review
              </h3>
              <p className="mb-5 text-sm leading-relaxed text-[#5c7863]">
                Licensure Examination for Teachers. Professional Education, Gen Ed English, Math,
                and Science — case-based strategies that actually work.
              </p>
              <ul className="mb-6 space-y-2 text-sm text-[#3d5c44]">
                <li className="flex items-start gap-2"><span className="text-[#ca8a04]">●</span> Professional Education focus (40% of the score)</li>
                <li className="flex items-start gap-2"><span className="text-[#ca8a04]">●</span> Case-based timed mock exams</li>
                <li className="flex items-start gap-2"><span className="text-[#ca8a04]">●</span> Free preview lesson + sample drill</li>
              </ul>
              <div className="mb-6 flex items-baseline gap-2">
                <span className="text-3xl font-black text-[#16331f]">₱500</span>
                <span className="text-sm text-[#5c7863]">/ full review season</span>
              </div>
              <Link href="/review/let" className="btn-gold block px-6 py-3 text-center text-sm">
                Start LET Review
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TEACHER CEPPEE ===== */}
      <section className="w-full py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="card relative overflow-hidden p-8 sm:p-12">
            <div className="orb orb-gold -right-16 -bottom-16 opacity-60" />
            <div className="relative grid grid-cols-1 items-center gap-10 md:grid-cols-3">
              <div className="flex justify-center">
                <div className="flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br from-[#16a34a] to-[#d4af37] text-6xl font-black text-white shadow-xl">
                  C
                </div>
              </div>
              <div className="md:col-span-2">
                <h2 className="mb-3 text-2xl font-extrabold text-[#16331f] sm:text-3xl">
                  From <span className="gradient-text">Teacher Ceppee</span>
                </h2>
                <p className="mb-4 leading-relaxed text-[#3d5c44]">
                  Years of experience teaching CSE and LET review — and thousands of Filipinos have
                  already passed with his guidance. Every lesson here comes from the proven review
                  style he uses on his Facebook page.
                </p>
                <a
                  href="https://www.facebook.com/teacherceppee"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1877f2] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#166fe5]"
                >
                  Follow on Facebook →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="w-full py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-center mx-auto text-3xl font-black text-[#16331f] sm:text-4xl">
            Why Teacher Ceppee Review?
          </h2>
          <p className="mb-10 text-center mx-auto max-w-xl text-[#5c7863]">
            This isn't just a PDF dump. It's a complete review system built for real exam day.
          </p>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 justify-center">
            {features.map((f) => (
              <div key={f.title} className="card card-hover p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#dcfce7] to-[#bbf7d0] text-2xl">
                  {f.icon}
                </div>
                <h3 className="mb-2 font-bold text-[#16331f]">{f.title}</h3>
                <p className="text-sm leading-relaxed text-[#5c7863]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <Testimonials />

      {/* ===== FAQ ===== */}
      <section id="faq" className="w-full py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-center mx-auto text-3xl font-black text-[#16331f] sm:text-4xl">
            Frequently asked questions
          </h2>
          <p className="mb-10 text-center mx-auto text-[#5c7863]">
            Have a different question? Message Teacher Ceppee on Facebook.
          </p>
          <div className="space-y-4">
            {faqs.map((f) => (
              <details key={f.q} className="card group p-5 open:shadow-lg">
                <summary className="cursor-pointer list-none font-semibold text-[#16331f] marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span className="text-[#d4af37] transition group-open:rotate-45">✦</span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[#5c7863]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="w-full py-14">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#15803d] via-[#16a34a] to-[#d4af37] p-10 text-center shadow-2xl sm:p-14">
            <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <h2 className="relative mb-3 text-3xl font-black text-white sm:text-4xl">
              Ready to pass?
            </h2>
            <p className="relative mx-auto mb-8 max-w-xl text-white/90">
              Join Teacher Ceppee's reviewees. ₱500 per track, full season — cheaper than paying
              for a single retake.
            </p>
            <div className="relative flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/review/cse" className="rounded-xl bg-white px-8 py-3.5 font-bold text-[#15803d] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl">
                CSE Review — ₱500
              </Link>
              <Link href="/review/let" className="rounded-xl border-2 border-white/70 px-8 py-3.5 font-bold text-white transition hover:bg-white/10">
                LET Review — ₱500
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
