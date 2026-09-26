"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState, useCallback } from "react";
import type { Testimonial } from "@/lib/types";

/* ============================================================
   The real testimonials live in Supabase (table: testimonials)
   and are managed from Admin > 💬 Testimonials. This component
   receives the published ones as a prop.

   If the table is still empty (or not created yet), we fall back
   to the placeholder quotes below so the landing page never shows
   an empty section.
   ============================================================ */
const PLACEHOLDER: Item[] = [
  {
    id: "p1",
    name: "Maria Santos",
    track: "cse",
    rating: 5,
    role: "CSE Professional passer",
    quote:
      "The mock exams felt like the real thing. I walked into the CSE confident because I had already seen the format. Passed Professional on my first try!",
  },
  {
    id: "p2",
    name: "Juan Dela Cruz",
    track: "let",
    rating: 5,
    role: "LET passer",
    quote:
      "I failed the LET twice before finding this reviewer. The case-based drills and Prof Ed focus showed me exactly what I was missing. Passed this year!",
  },
  {
    id: "p3",
    name: "Grace Reyes",
    track: "cse",
    rating: 5,
    role: "CSE Professional passer",
    quote:
      "₱500 for a whole season is a steal. Other reviewers charged ₱3,000 and still did not have timed exams with explanations. This one is a no-brainer.",
  },
  {
    id: "p4",
    name: "Paolo Mendoza",
    track: "let",
    rating: 5,
    role: "LET passer",
    quote:
      "The lessons are short and to the point, and I can review on my phone during lunch breaks. The mobile-friendly thing is real.",
  },
  {
    id: "p5",
    name: "Angelica Garcia",
    track: "cse",
    rating: 5,
    role: "CSE Sub-Professional passer",
    quote:
      "I loved the topic drills. I kept struggling with Math, so I just drilled Math until I got it. My score went from failing to passing in weeks.",
  },
  {
    id: "p6",
    name: "Rica Villanueva",
    track: "let",
    rating: 5,
    role: "LET passer",
    quote:
      "Teacher Ceppee is so responsive on Facebook. Any question I had, he would answer. It felt like having a personal coach.",
  },
  {
    id: "p7",
    name: "Marcos Castro",
    track: "cse",
    rating: 5,
    role: "CSE Professional passer",
    quote:
      "No fluff, no PDF floods. Just lessons, drills, and exams that actually match the real Civil Service format. Highly recommend.",
  },
  {
    id: "p8",
    name: "Kimberly Ramos",
    track: "let",
    rating: 5,
    role: "LET passer",
    quote:
      "English and Science used to be my weak points. The structure here made them my strongest. Passed the LET — and not even close to the line.",
  },
];

type Item = {
  id: string;
  name: string;
  track: "cse" | "let";
  rating: number;
  role: string;
  quote: string;
  photo?: string | null;
};

const trackStyles = {
  cse: {
    avatar: "from-[#16a34a] to-[#15803d]",
    badge: "bg-[#dcfce7] text-[#15803d]",
    dot: "bg-[#15803d]",
    ring: "ring-[#16a34a]/30",
  },
  let: {
    avatar: "from-[#d4af37] to-[#ca8a04]",
    badge: "bg-[#fef9c3] text-[#b45309]",
    dot: "bg-[#b45309]",
    ring: "ring-[#d4af37]/40",
  },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last =
    parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

function toItems(rows: Testimonial[]): Item[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    track: r.track === "LET" ? "let" : "cse",
    rating: Math.min(5, Math.max(1, Number(r.rating) || 5)),
    role:
      r.role ||
      (r.track === "LET" ? "LET reviewee" : "CSE reviewee"),
    quote: r.quote,
    photo: r.photo_url,
  }));
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          className="h-5 w-5"
          fill={i <= rating ? "#d4af37" : "#e2e8f0"}
          aria-hidden="true"
        >
          <path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L10 14.77l-5.2 2.74.99-5.79-4.21-4.1 5.82-.85z" />
        </svg>
      ))}
    </div>
  );
}

export default function Testimonials({ items }: { items?: Testimonial[] }) {
  const list = useMemo(
    () => (items && items.length > 0 ? toItems(items) : PLACEHOLDER),
    [items]
  );
  const isReal = !!(items && items.length > 0);
  const count = list.length;

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const next = useCallback(() => setIndex((i) => (i + 1) % count), [count]);
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + count) % count),
    [count]
  );

  useEffect(() => {
    if (count < 2) return;
    if (paused) return;
    const id = setInterval(next, 6000);
    return () => clearInterval(id);
  }, [paused, next, index, count]);

  // Keep the index valid when the list changes (e.g. after an admin edit)
  useEffect(() => {
    setIndex((i) => (i >= count ? 0 : i));
  }, [count]);

  const current = list[index] ?? list[0];
  const style = trackStyles[current.track];
  const average = useMemo(() => {
    const sum = list.reduce((acc, t) => acc + t.rating, 0);
    return (sum / count).toFixed(1);
  }, [list, count]);

  return (
    <section id="testimonials" className="w-full py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <h2 className="mb-4 text-center mx-auto text-3xl font-black text-[#16331f] sm:text-4xl">
          What our <span className="gradient-text">reviewees say</span>
        </h2>
        <p className="mb-10 text-center mx-auto max-w-xl text-[#5c7863]">
          Real people, real passes. A taste of the reviewees Teacher Ceppee has
          helped get their license.
        </p>

        {/* Social proof strip */}
        <div className="mb-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d9e6d3] bg-white/80 px-5 py-2 shadow-sm">
            <Stars rating={5} />
            <span className="text-sm font-bold text-[#16331f]">{average}/5</span>
            <span className="text-sm text-[#5c7863]">
              from {count} reviewee{count === 1 ? "" : "s"}
            </span>
          </div>
          {isReal && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#dcfce7] bg-[#f0fdf4] px-4 py-2 text-xs font-semibold text-[#15803d] shadow-sm">
              ✅ Passers who joined the review
            </div>
          )}
        </div>

        {/* Carousel */}
        <div
          className="relative mx-auto max-w-3xl"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Card track */}
          <div className="overflow-hidden">
            <div
              className="flex transition-transform duration-700 ease-out"
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {list.map((t) => {
                const s = trackStyles[t.track];
                return (
                  <div key={t.id} className="w-full shrink-0 px-1 flex justify-center">
                    <figure className="card card-hover relative overflow-hidden w-full p-8 sm:p-10">
                      <div
                        className={`absolute -right-12 -top-12 h-32 w-32 rounded-full blur-2xl ${
                          t.track === "cse" ? "bg-[#16a34a]/10" : "bg-[#ca8a04]/10"
                        }`}
                      />
                      <div className="relative flex flex-col items-center text-center sm:min-h-[280px]">
                        {/* Identity first: photo, name, badge */}
                        <figcaption className="flex flex-col items-center">
                          {t.photo ? (
                            <img
                              src={t.photo}
                              alt={t.name}
                              loading="lazy"
                              className={`mb-3 h-24 w-24 rounded-full object-cover shadow-md ring-4 ${s.ring}`}
                            />
                          ) : (
                            <div
                              className={`mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br text-2xl font-bold text-white shadow-md ${s.avatar}`}
                            >
                              {initials(t.name)}
                            </div>
                          )}
                          <div className="text-lg font-bold text-[#16331f]">{t.name}</div>
                          <div
                            className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${s.badge}`}
                          >
                            ✓ {t.role}
                          </div>
                        </figcaption>

                        {/* Divider with the stars in the middle */}
                        <div className="my-5 flex w-full items-center gap-3">
                          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#d9e6d3]" />
                          <Stars rating={t.rating} />
                          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#d9e6d3]" />
                        </div>

                        {/* Message at the bottom */}
                        <blockquote className="flex-1 text-base leading-relaxed text-[#3d5c44] sm:text-lg">
                          <span className={expanded[t.id] ? undefined : "line-clamp-8"}>
                            <span className="mr-1 text-2xl leading-none align-top text-[#d4af37]/40">
                              &#8220;
                            </span>
                            {t.quote}
                          </span>
                          {t.quote.length > 320 && (
                            <button
                              onClick={() =>
                                setExpanded((e) => ({ ...e, [t.id]: !e[t.id] }))
                              }
                              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#dcfce7] px-4 py-1.5 text-xs font-bold text-[#15803d] transition hover:bg-[#bbf7d0]"
                            >
                              {expanded[t.id] ? "Show less ▲" : "Read more ▼"}
                            </button>
                          )}
                        </blockquote>
                      </div>
                    </figure>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Arrows */}
          {count > 1 && (
            <>
              <button
                onClick={prev}
                aria-label="Previous testimonial"
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 flex h-11 w-11 items-center justify-center rounded-full border border-[#d9e6d3] bg-white text-xl text-[#15803d] shadow-md transition hover:scale-105 hover:bg-[#dcfce7] sm:-left-4"
              >
                &#8249;
              </button>
              <button
                onClick={next}
                aria-label="Next testimonial"
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 flex h-11 w-11 items-center justify-center rounded-full border border-[#d9e6d3] bg-white text-xl text-[#15803d] shadow-md transition hover:scale-105 hover:bg-[#dcfce7] sm:-right-4"
              >
                &#8250;
              </button>
            </>
          )}

          {/* Dots (or a counter once there are many) */}
          {count > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              {count <= 12 ? (
                list.map((t, i) => (
                  <button
                    key={t.id}
                    onClick={() => setIndex(i)}
                    aria-label={`Go to testimonial ${i + 1}`}
                    className={`h-2.5 rounded-full transition-all duration-300 ${
                      i === index ? `w-7 ${style.dot}` : "w-2.5 bg-[#d9e6d3] hover:bg-[#b8cdb2]"
                    }`}
                  />
                ))
              ) : (
                <span className="rounded-full border border-[#d9e6d3] bg-white/80 px-4 py-1.5 text-xs font-bold text-[#5c7863]">
                  {index + 1} / {count}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
