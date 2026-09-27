/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import type { Coach, CoachTrack } from "@/lib/types";

/* ============================================================
   The coaches live in Supabase (table: coaches) and are managed
   from Admin > 🧑‍🏫 Coaches. This section receives the active ones
   as a prop. If there are none yet the section renders nothing,
   so the landing page never shows an empty block.
   ============================================================ */

const trackStyles: Record<
  CoachTrack,
  { ring: string; badge: string; avatar: string; label: string }
> = {
  CSE: {
    ring: "ring-[#16a34a]/30",
    badge: "bg-[#dcfce7] text-[#15803d]",
    avatar: "from-[#16a34a] to-[#15803d]",
    label: "CSE",
  },
  LET: {
    ring: "ring-[#d4af37]/40",
    badge: "bg-[#fef9c3] text-[#b45309]",
    avatar: "from-[#d4af37] to-[#ca8a04]",
    label: "LET",
  },
  BOTH: {
    ring: "ring-[#16a34a]/25",
    badge: "bg-gradient-to-r from-[#dcfce7] to-[#fef9c3] text-[#15803d]",
    avatar: "from-[#16a34a] to-[#d4af37]",
    label: "CSE & LET",
  },
};

function subjectList(subjects: string | null): string[] {
  return (subjects ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

function FacebookIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export function CoachCard({ coach }: { coach: Coach }) {
  const s = trackStyles[coach.track] ?? trackStyles.BOTH;
  const subjects = subjectList(coach.subjects);

  return (
    <article className="card card-hover relative flex w-full flex-1 flex-col overflow-hidden p-6 text-center">
      <div
        className={`absolute -right-12 -top-12 h-32 w-32 rounded-full blur-2xl ${
          coach.track === "LET" ? "bg-[#ca8a04]/10" : "bg-[#16a34a]/10"
        }`}
      />

      <div className="relative flex flex-col items-center">
        {coach.photo_url ? (
          <img
            src={coach.photo_url}
            alt={coach.name}
            loading="lazy"
            className={`mb-3 h-24 w-24 rounded-full object-cover shadow-md ring-4 ${s.ring}`}
          />
        ) : (
          <div
            className={`mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br text-2xl font-bold text-white shadow-md ${s.avatar}`}
          >
            {initials(coach.name)}
          </div>
        )}

        <h3 className="text-lg font-bold text-[#16331f]">{coach.name}</h3>

        {coach.title && (
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-[#5c7863]">
            {coach.title}
          </p>
        )}

        <span
          className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${s.badge}`}
        >
          {coach.track === "BOTH" ? "🏛️🍎" : coach.track === "CSE" ? "🏛️" : "🍎"} {s.label}
        </span>

        {subjects.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {subjects.map((sub) => (
              <span
                key={sub}
                className="rounded-full border border-[#d9e6d3] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#3d5c44]"
              >
                {sub}
              </span>
            ))}
          </div>
        )}

        {coach.bio && (
          <p className="mt-4 flex-1 text-sm leading-relaxed text-[#5c7863]">{coach.bio}</p>
        )}

        {coach.facebook_url && (
          <a
            href={coach.facebook_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#1877f2]/10 px-4 py-2 text-sm font-semibold text-[#1877f2] transition hover:bg-[#1877f2]/20"
          >
            <FacebookIcon />
            Message on Facebook
          </a>
        )}
      </div>
    </article>
  );
}

export default function CoachesSection({
  coaches,
  limit = 3,
  heading = true,
}: {
  coaches: Coach[];
  limit?: number;
  heading?: boolean;
}) {
  if (coaches.length === 0) return null;

  const shown = limit > 0 ? coaches.slice(0, limit) : coaches;
  const hidden = coaches.length - shown.length;

  return (
    <section id="coaches" className="w-full py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {heading && (
          <>
            <h2 className="mb-4 text-center mx-auto text-3xl font-black text-[#16331f] sm:text-4xl">
              Meet the <span className="gradient-text">coaches</span>
            </h2>
            <p className="mb-10 text-center mx-auto max-w-xl text-[#5c7863]">
              The people behind your review. Ask them anything — they answer personally on
              Facebook.
            </p>
          </>
        )}

        {/* flex + centre so a single coach sits in the middle, not off to the left */}
        <div className="flex flex-wrap justify-center gap-6">
          {shown.map((c) => (
            <div
              key={c.id}
              className="flex w-full sm:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)]"
            >
              <CoachCard coach={c} />
            </div>
          ))}
        </div>

        {hidden > 0 && (
          <div className="mt-8 text-center">
            <Link
              href="/coaches"
              className="inline-flex items-center gap-2 rounded-xl border border-[#d9e6d3] bg-white px-5 py-2.5 text-sm font-bold text-[#15803d] shadow-sm transition hover:border-[#d4af37] hover:text-[#16331f]"
            >
              See all {coaches.length} coaches →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
