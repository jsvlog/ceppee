import Link from "next/link";
import type { Testimonial } from "@/lib/types";

/* eslint-disable @next/next/no-img-element */

/**
 * Compact social-proof strip for the hero area: reviewee photos, average
 * rating, and ONE short quote. The full carousel stays further down the page
 * (#testimonials) so it never pushes the track/pricing choice below the fold.
 *
 * Renders nothing while there are no testimonials in the database.
 */

/** Pick the quote that reads best in one line: closest to ~140 chars. */
function pickQuote(items: Testimonial[]): Testimonial {
  const usable = items.filter((t) => (t.quote || "").trim().length >= 80);
  const pool = usable.length > 0 ? usable : items;
  return [...pool].sort(
    (a, b) => Math.abs(a.quote.length - 140) - Math.abs(b.quote.length - 140)
  )[0];
}

function shorten(text: string, max = 190) {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : max).trim()}…`;
}

export default function TestimonialHighlight({ items }: { items: Testimonial[] }) {
  if (!items || items.length === 0) return null;

  const withPhoto = items.filter((t) => t.photo_url);
  const shown = withPhoto.slice(0, 5);
  const extra = withPhoto.length - shown.length;
  const average = (
    items.reduce((acc, t) => acc + (Number(t.rating) || 5), 0) / items.length
  ).toFixed(1);
  const featured = pickQuote(items);

  return (
    <div className="animate-fade-up mt-10 flex justify-center">
      <div className="flex max-w-3xl flex-col items-center gap-4 rounded-2xl border border-[#d9e6d3] bg-white/85 px-6 py-4 shadow-sm backdrop-blur sm:flex-row sm:gap-5">
        {shown.length > 0 && (
          <div className="flex shrink-0 items-center">
            {shown.map((t, i) => (
              <img
                key={t.id}
                src={t.photo_url as string}
                alt={t.name}
                loading="lazy"
                className={`h-11 w-11 rounded-full object-cover ring-2 ring-white ${
                  i > 0 ? "-ml-3" : ""
                }`}
              />
            ))}
            {extra > 0 && (
              <span className="-ml-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#dcfce7] text-xs font-bold text-[#15803d] ring-2 ring-white">
                +{extra}
              </span>
            )}
          </div>
        )}

        <div className="min-w-0 text-center sm:text-left">
          <div className="flex items-center justify-center gap-1.5 sm:justify-start">
            <span className="text-sm leading-none tracking-tight text-[#d4af37]">★★★★★</span>
            <span className="text-sm font-bold text-[#16331f]">{average}/5</span>
            <span className="text-xs text-[#5c7863]">
              from {items.length} {items.length === 1 ? "passer" : "passers"}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm italic leading-snug text-[#3d5c44]">
            “{shorten(featured.quote, 150)}”
          </p>
          <div className="mt-1 text-xs font-semibold text-[#16331f]">
            — {featured.name}
            {featured.role ? (
              <span className="font-normal text-[#5c7863]"> · {featured.role}</span>
            ) : null}
          </div>
        </div>

        <Link
          href="#testimonials"
          className="shrink-0 rounded-full border border-[#d9e6d3] bg-white px-4 py-1.5 text-xs font-bold text-[#15803d] shadow-sm transition hover:border-[#d4af37] hover:bg-[#f0fdf4]"
        >
          See all ↓
        </Link>
      </div>
    </div>
  );
}
