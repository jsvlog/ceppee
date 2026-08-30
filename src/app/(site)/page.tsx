import Link from "next/link";
import { getSiteStats } from "@/lib/queries";
import { TRACK_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

const features = [
  {
    icon: "📚",
    title: "Complete Video + Text Lessons",
    desc: "Bawat topic may lessons na mix ng text at video — para sa lahat ng learning style.",
  },
  {
    icon: "⏱️",
    title: "Timed Mock Exams",
    desc: "Parang totohanan: may time limit, may score, may explanation sa bawat sagot.",
  },
  {
    icon: "🎯",
    title: "Topic Practice Drills",
    desc: "Mahina ka ba sa Math? Focus lang sa Math. Practice per topic, walang pressure.",
  },
  {
    icon: "📈",
    title: "Progress Tracking",
    desc: "Nakikita mo kung gaano na kalayo ang review mo at saan ka pa need mag-focus.",
  },
  {
    icon: "📱",
    title: "Mobile Friendly",
    desc: "Review kahit saan — sa jeep, sa break time, before matulog.",
  },
  {
    icon: "✅",
    title: "Verified Answers",
    desc: "May explanation ang bawat tanong — hindi mo lang malalaman ang sagot, kung bakit.",
  },
];

const faqs = [
  {
    q: "Paano magbabayad?",
    a: "GCash o bank transfer lang! Kapag nag-click ka ng Subscribe, lalabas ang payment details. Send mo ang exact amount, upload ang receipt screenshot at reference number, then i-verify namin — usually within 24 hours.",
  },
  {
    q: "Magkano at hanggang kailan ang access ko?",
    a: "₱500 per track (CSE o LET) para sa buong review season — usually 6 na buwan, sakto hanggang sa next exam. Kapag nag-bago ang exam date, ina-adjust namin ang access para hindi ka mabitin.",
  },
  {
    q: "Hiwalay ba ang CSE at LET subscription?",
    a: "Oo, dahil magkaiba ang exams na hinahanda nila. Kung pareho ang ittake mo, dalawang subscription — pero separate din ang mga reviewers kaya sulit pa rin.",
  },
  {
    q: "May free trial ba?",
    a: "May free preview lesson at libreng sample mock exam sa bawat track — try mo muna bago mag-subscribe. Walang credit card, walang risk.",
  },
  {
    q: "Kailan ako dapat mag-start ng review?",
    a: "The earlier the better! Pero kahit 1-2 months bago ang exam, kaya ng reviewer natin na i-guide ka kung consistent ka. Ideal ay 3-6 months ng steady review.",
  },
  {
    q: "Paano kung hindi ako pumasa?",
    a: "Kung hindi ka pumasa sa exam na pinagreviewan mo, i-message si Teacher Ceppee sa Facebook — bibigyan ka namin ng extended access para sa next exam run.",
  },
];

export default async function HomePage() {
  const stats = await getSiteStats();

  return (
    <div>
      {/* ===== HERO ===== */}
      <section className="gradient-hero relative overflow-hidden">
        <div className="orb orb-coral -left-24 -top-24 animate-float" />
        <div className="orb orb-amber -right-20 top-32 animate-float-delayed" />
        <div className="relative mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="animate-fade-up mb-5 inline-flex items-center gap-2 rounded-full border border-[#f5e6cc] bg-white/80 px-4 py-1.5 text-sm font-semibold text-[#92734a] shadow-sm">
              <span className="flex h-2 w-2 rounded-full bg-[#22c55e]" />
              Reviewing made easy, made by Teacher Ceppee
            </div>
            <h1 className="animate-fade-up mb-6 text-4xl font-black leading-tight tracking-tight text-[#3d3227] sm:text-5xl lg:text-6xl">
              Pasa ang CSE o LET —<br />
              <span className="gradient-text">sa first take.</span>
            </h1>
            <p className="animate-fade-up mb-8 text-lg leading-relaxed text-[#8c7a64] sm:text-xl">
              Complete online reviewer: lessons, practice drills, at timed mock exams na parang totohanan.
              Ang lagay: <strong className="text-[#57534e]">₱500 kada track</strong>, buong review season.
            </p>
            <div className="animate-fade-up mb-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="#tracks" className="btn-primary px-8 py-3.5 text-base">
                Pumili ng Review →
              </Link>
              <Link href="/review/cse" className="rounded-xl border border-[#f5e6cc] bg-white px-8 py-3.5 text-base font-semibold text-[#57534e] shadow-sm transition hover:border-[#ffa94d] hover:text-[#3d3227]">
                Try Free Preview
              </Link>
            </div>
            <div className="animate-fade-up flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-[#8c7a64]">
              <span>✓ {stats.lessons}+ lessons</span>
              <span>✓ {stats.questions}+ practice questions</span>
              <span>✓ {stats.exams} mock & practice exams</span>
              <span>✓ GCash / bank — walang credit card</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TRACK CHOOSER ===== */}
      <section id="tracks" className="w-full py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-center mx-auto text-3xl font-black text-[#3d3227] sm:text-4xl">
            Ano ang review mo?
          </h2>
          <p className="mb-10 text-center mx-auto max-w-xl text-[#8c7a64]">
            Dalawang magkaibang exam, dalawang dedicated reviewers. Piliin ang sa iyo.
          </p>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 justify-center">
            {/* CSE card */}
            <div className="card card-hover relative overflow-hidden p-8">
              <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#ff6b6b]/10 blur-2xl" />
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#fff0ef] px-4 py-1.5 text-sm font-bold text-[#f4444e]">
                🏛️ Para sa government work
              </div>
              <h3 className="mb-2 text-2xl font-extrabold text-[#3d3227]">
                CSE Review
              </h3>
              <p className="mb-5 text-sm leading-relaxed text-[#8c7a64]">
                Civil Service Exam — Professional at Sub-Professional. Math, English, Filipino,
                Clerical & Reasoning, at Constitution, lahat may lessons at drills.
              </p>
              <ul className="mb-6 space-y-2 text-sm text-[#57534e]">
                <li className="flex items-start gap-2"><span className="text-[#ff6b6b]">●</span> 5 major topics, pattern-based strategies</li>
                <li className="flex items-start gap-2"><span className="text-[#ff6b6b]">●</span> Timed mock exam na may 170 items</li>
                <li className="flex items-start gap-2"><span className="text-[#ff6b6b]">●</span> Free preview lesson + sample drill</li>
              </ul>
              <div className="mb-6 flex items-baseline gap-2">
                <span className="text-3xl font-black text-[#3d3227]">₱500</span>
                <span className="text-sm text-[#8c7a64]">/ buong review season</span>
              </div>
              <Link href="/review/cse" className="btn-primary block px-6 py-3 text-center text-sm">
                Simulan ang CSE Review
              </Link>
            </div>

            {/* LET card */}
            <div className="card card-hover relative overflow-hidden p-8">
              <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#8b5cf6]/10 blur-2xl" />
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#f5f0ff] px-4 py-1.5 text-sm font-bold text-[#7c3aed]">
                🍎 Para sa future LPTs
              </div>
              <h3 className="mb-2 text-2xl font-extrabold text-[#3d3227]">
                LET Review
              </h3>
              <p className="mb-5 text-sm leading-relaxed text-[#8c7a64]">
                Licensure Examination for Teachers. Professional Education, Gen Ed English, Math,
                at Science — case-based strategies na tumatalab.
              </p>
              <ul className="mb-6 space-y-2 text-sm text-[#57534e]">
                <li className="flex items-start gap-2"><span className="text-[#8b5cf6]">●</span> Professional Education focus (40% ng score)</li>
                <li className="flex items-start gap-2"><span className="text-[#8b5cf6]">●</span> Case-based mock exams na timed</li>
                <li className="flex items-start gap-2"><span className="text-[#8b5cf6]">●</span> Free preview lesson + sample drill</li>
              </ul>
              <div className="mb-6 flex items-baseline gap-2">
                <span className="text-3xl font-black text-[#3d3227]">₱500</span>
                <span className="text-sm text-[#8c7a64]">/ buong review season</span>
              </div>
              <Link href="/review/let" className="btn-violet block px-6 py-3 text-center text-sm">
                Simulan ang LET Review
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TEACHER CEPPEE ===== */}
      <section className="w-full py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="card relative overflow-hidden p-8 sm:p-12">
            <div className="orb orb-amber -right-16 -bottom-16 opacity-60" />
            <div className="relative grid grid-cols-1 items-center gap-10 md:grid-cols-3">
              <div className="flex justify-center">
                <div className="flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br from-[#ff6b6b] to-[#ffa94d] text-6xl font-black text-white shadow-xl">
                  C
                </div>
              </div>
              <div className="md:col-span-2">
                <h2 className="mb-3 text-2xl font-extrabold text-[#3d3227] sm:text-3xl">
                  Galing kay <span className="gradient-text">Teacher Ceppee</span>
                </h2>
                <p className="mb-4 leading-relaxed text-[#57534e]">
                  Years of experience sa pagtuturo ng CSE at LET review — at libu-libong Filipino
                  na ang natulungan para makapasa. Lahat ng lessons dito ay galing sa
                  proven na review style na ginagamit sa FB page niya.
                </p>
                <a
                  href="https://www.facebook.com/teacherceppee"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1877f2] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#166fe5]"
                >
                  Follow sa Facebook →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="w-full py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-center mx-auto text-3xl font-black text-[#3d3227] sm:text-4xl">
            Bakit Ceppee Review?
          </h2>
          <p className="mb-10 text-center mx-auto max-w-xl text-[#8c7a64]">
            Hindi ito basta PDF dump. Complete review system na ginawa para sa totoong exam day.
          </p>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 justify-center">
            {features.map((f) => (
              <div key={f.title} className="card card-hover p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fff5e0] to-[#ffe8cc] text-2xl">
                  {f.icon}
                </div>
                <h3 className="mb-2 font-bold text-[#3d3227]">{f.title}</h3>
                <p className="text-sm leading-relaxed text-[#8c7a64]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="w-full py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-center mx-auto text-3xl font-black text-[#3d3227] sm:text-4xl">
            Mga madalas itanong
          </h2>
          <p className="mb-10 text-center mx-auto text-[#8c7a64]">
            May ibang tanong? Message mo si Teacher Ceppee sa Facebook.
          </p>
          <div className="space-y-4">
            {faqs.map((f) => (
              <details key={f.q} className="card group p-5 open:shadow-lg">
                <summary className="cursor-pointer list-none font-semibold text-[#3d3227] marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span className="text-[#ffa94d] transition group-open:rotate-45">✦</span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[#8c7a64]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="w-full py-14">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#ff6b6b] via-[#ff8a5c] to-[#ffa94d] p-10 text-center shadow-2xl sm:p-14">
            <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <h2 className="relative mb-3 text-3xl font-black text-white sm:text-4xl">
              Handa ka na bang makapasa?
            </h2>
            <p className="relative mx-auto mb-8 max-w-xl text-white/90">
              Sumali na sa mga reviewees ni Teacher Ceppee. ₱500 kada track, buong season — mas mura
              kaysa isang retake fee.
            </p>
            <div className="relative flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/review/cse" className="rounded-xl bg-white px-8 py-3.5 font-bold text-[#f4444e] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl">
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
