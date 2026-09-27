import type { Metadata } from "next";
import Link from "next/link";
import { getPublicCoaches } from "@/lib/queries";
import CoachesSection from "@/components/CoachesSection";

export const metadata: Metadata = {
  title: "Meet the Coaches",
  description:
    "Meet the Teacher Ceppee Review coaches for the Civil Service Exam (CSE) and the Licensure Examination for Teachers (LET). Real reviewers, real subjects, and you can message them personally.",
};

export const dynamic = "force-dynamic";

export default async function CoachesPage() {
  const coaches = await getPublicCoaches();

  return (
    <div className="relative overflow-hidden">
      <div className="orb orb-green -left-24 -top-24" />
      <div className="orb orb-gold -right-20 top-40" />

      <section className="relative w-full pt-16 pb-4">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#d9e6d3] bg-white/80 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#15803d] shadow-sm">
            🧑‍🏫 Our review team
          </span>
          <h1 className="mx-auto mb-4 max-w-3xl text-4xl font-black text-[#16331f] sm:text-5xl">
            Meet the <span className="gradient-text">coaches</span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-[#5c7863]">
            The people who wrote your lessons, drills, and mock exams. Stuck on a topic? Message a
            coach on Facebook — they answer personally.
          </p>
        </div>
      </section>

      {coaches.length > 0 ? (
        <CoachesSection coaches={coaches} limit={0} heading={false} />
      ) : (
        <section className="relative w-full py-16">
          <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
            <div className="card p-10 text-center">
              <div className="mb-4 text-5xl">🧑‍🏫</div>
              <h2 className="mb-2 text-xl font-bold text-[#16331f]">
                The team page is being set up
              </h2>
              <p className="mb-6 text-sm leading-relaxed text-[#5c7863]">
                Coaches will appear here as soon as they are added. In the meantime, everything you
                need to pass is already inside the reviewer.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link href="/review/cse" className="btn-primary px-5 py-2.5 text-sm">
                  🏛️ Start CSE Review
                </Link>
                <Link
                  href="/review/let"
                  className="rounded-xl bg-[#ca8a04] px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-[#b45309]"
                >
                  🍎 Start LET Review
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="relative w-full pb-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="card relative overflow-hidden p-8 text-center sm:p-12">
            <div className="orb orb-gold -left-16 -top-16 opacity-60" />
            <div className="relative">
              <h2 className="mb-3 text-2xl font-black text-[#16331f] sm:text-3xl">
                Ready to start reviewing?
              </h2>
              <p className="mx-auto mb-6 max-w-lg text-sm leading-relaxed text-[#5c7863]">
                One season pass unlocks every lesson, drill, and timed mock exam for your track —
                and your coach is one message away.
              </p>
              <Link href="/pricing" className="btn-primary px-6 py-3 text-sm">
                See the ₱500 season pass →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
