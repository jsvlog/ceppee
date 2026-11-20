import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasActiveSub } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Reading Materials",
  description:
    "Review notes for every LET subject — Gen Ed, Prof Ed and all majorship areas — written to be read, not skimmed.",
};

type ShelfBook = {
  id: string;
  title: string;
  slug: string;
  subject: string;
  specialization: string | null;
  level: string;
  volume: number;
  word_count: number;
  section_count: number;
  part_count: number;
  description: string | null;
  readable: number;
  completed: number;
};

const GROUPS: { key: string; label: string; blurb: string; match: (b: ShelfBook) => boolean }[] = [
  {
    key: "gen",
    label: "General Education",
    blurb: "The 10 Gen Ed areas: communication, Filipino, history, Rizal, science, math and more.",
    match: (b) => b.subject === "General Education",
  },
  {
    key: "prof",
    label: "Professional Education",
    blurb: "The teaching side of the exam: foundations, assessment, curriculum, classroom management.",
    match: (b) => b.subject === "Professional Education",
  },
  {
    key: "major",
    label: "Majorship",
    blurb: "Your specialization paper — pick the one you filed for.",
    match: (b) => b.specialization !== null,
  },
];

function bookMeta(b: ShelfBook) {
  const hours = Math.max(1, Math.round(b.word_count / 250 / 60));
  return `${b.section_count} sections · ${hours} hours of reading`;
}

export default async function ReadShelf() {
  const supabase = await createClient();
  const { user, subs, isAdmin } = await getUserContext();
  const subscribed = isAdmin || hasActiveSub(subs, "LET");

  const { data } = await supabase.rpc("reading_shelf");
  const books = (data ?? []) as ShelfBook[];
  const totalSections = books.reduce((n, b) => n + b.section_count, 0);
  const totalWords = books.reduce((n, b) => n + b.word_count, 0);

  const started = books.filter((b) => b.completed > 0);
  const overall = totalSections ? Math.round((started.reduce((n, b) => n + b.completed, 0) / totalSections) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10 max-w-2xl">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#b45309]">Read</p>
        <h1 className="text-4xl font-black text-[#16331f] sm:text-5xl">Reading materials</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#4a6553]">
          The long version of every subject: {totalSections.toLocaleString()} sections,
          {" "}{Math.round(totalWords / 1000).toLocaleString()}k words of review notes — about{" "}
          {Math.round(totalWords / 250 / 60)} hours of reading if you go cover to cover.
          Each section is a 5–12 minute read, so you can pick it up between practice sets.
        </p>
      </div>

      {user && subscribed && overall > 0 && (
        <div className="card mb-8 p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-bold text-[#16331f]">Your reading progress</span>
            <span className="text-[#5c7863]">{overall}% of the library</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#e7efe1]">
            <div className="h-full rounded-full bg-gradient-to-r from-[#15803d] to-[#d4af37]" style={{ width: `${overall}%` }} />
          </div>
        </div>
      )}

      {!user && (
        <div className="card mb-8 flex flex-col gap-3 border-[#f3e3b8] bg-[#fffdf4] p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#6b5a20]">
            <strong className="font-bold">First section of every book is free.</strong> Log in to keep
            your place; a LET subscription unlocks everything.
          </p>
          <Link href="/login?next=/read" className="btn-primary whitespace-nowrap px-5 py-2.5 text-sm">
            Log in
          </Link>
        </div>
      )}

      {!user && books.length === 0 && (
        <p className="text-sm text-[#5c7863]">The library is being loaded — check back in a moment.</p>
      )}

      {GROUPS.map((g) => {
        const list = books.filter(g.match);
        if (!list.length) return null;
        return (
          <section key={g.key} className="mb-12">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-xl font-black text-[#16331f]">{g.label}</h2>
              <span className="text-xs font-semibold uppercase tracking-wide text-[#8aa08f]">
                {list.length} {list.length === 1 ? "book" : "books"}
              </span>
            </div>
            <p className="mb-5 max-w-2xl text-sm text-[#5c7863]">{g.blurb}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((b) => {
                const pct = b.section_count ? Math.round((b.completed / b.section_count) * 100) : 0;
                const locked = b.readable < b.section_count;
                return (
                  <Link
                    key={b.id}
                    href={`/read/${b.slug}`}
                    className="card card-hover group flex flex-col p-5"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <h3 className="text-[15px] font-bold leading-snug text-[#16331f] group-hover:text-[#15803d]">
                        {b.title}
                      </h3>
                      {locked ? (
                        <span className="shrink-0 rounded-full bg-[#f1f7ec] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#4a6553]">
                          Free sample
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#166534]">
                          Unlocked
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#8aa08f]">{bookMeta(b)}</p>
                    {b.completed > 0 && (
                      <div className="mt-4">
                        <div className="mb-1 flex justify-between text-[11px] font-semibold text-[#5c7863]">
                          <span>{b.completed} read</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e7efe1]">
                          <div className="h-full rounded-full bg-[#15803d]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                    <span className="mt-auto pt-4 text-xs font-bold text-[#15803d]">Open →</span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
