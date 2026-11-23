"use client";

import { useState } from "react";
import Link from "next/link";
import type { Track } from "@/lib/types";
import type { PlanId } from "@/lib/paymongo";

export interface PlanOption {
  id: PlanId;
  price: number;
  label: string;
  blurb: string;
  badge?: string;
  /** The subject this option unlocks (the ₱299 plan). */
  subject?: string;
  /** The majorship this option unlocks when the subject is Specialization. */
  major?: string;
  /** Set when the buyer already owns it — the button turns into a receipt. */
  ownedUntil?: string | null;
  /** "season" shows "one time", a number shows "/ N days". */
  term: "season" | number;
  /** Rendered first, with the heavier styling. */
  featured?: boolean;
}

/**
 * The ways to pay, for one track (and one level, on LET). Prices come from the
 * server — they must match PLANS in @/lib/paymongo. The browser only posts
 * {track, plan, subject}; the amount is never sent from here.
 */
export default function PlanCheckout({
  track,
  plans,
  enabled,
  isSignedIn,
  activeUntil,
  columns = 1,
  level = null,
}: {
  track: Track;
  plans: PlanOption[];
  enabled: boolean;
  isSignedIn: boolean;
  /** Whole-track pass already running, shown as a banner. */
  activeUntil: string | null;
  columns?: 1 | 2;
  /** elementary | secondary — the monthly pass is scoped to it on LET. */
  level?: "elementary" | "secondary" | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isLET = track === "LET";
  const accentBtn = isLET ? "btn-gold" : "btn-primary";

  const start = async (plan: PlanOption) => {
    setError(null);
    if (!isSignedIn) {
      window.location.href = `/login?mode=signup&next=${encodeURIComponent("/pricing")}`;
      return;
    }
    setBusy(plan.id + (plan.subject ?? ""));
    try {
      const res = await fetch("/api/paymongo/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track,
          plan: plan.id,
          subject: plan.subject,
          major: plan.major,
          level,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        // The server says PAUSED while the payment account is being verified; a
        // student should read a sentence, not an error code.
        if (json.error === "PAUSED") {
          setError(
            "Card and GCash payments open in a few days — the review center's payment account is being verified right now. Check back shortly."
          );
          setBusy(null);
          return;
        }
        throw new Error(json.error || "Could not start the checkout.");
      }
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setBusy(null);
    }
  };

  return (
    <div className={`space-y-3 ${columns === 2 ? "sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0" : ""}`}>
      {activeUntil && (
        <div
          className={`rounded-xl px-3 py-2 text-xs font-bold sm:col-span-2 ${
            isLET ? "bg-[#fef9c3] text-[#92400e]" : "bg-[#dcfce7] text-[#15803d]"
          }`}
        >
          ✓ Active until {activeUntil}. Buying more adds to the end, never cuts it short.
        </div>
      )}

      {plans.map((p) => {
        const key = p.id + (p.subject ?? "");
        const tinted = p.featured || p.ownedUntil;
        return (
          <div
            key={key}
            className={`rounded-2xl border-2 p-4 ${
              p.ownedUntil
                ? "border-[#16a34a] bg-[#f0fdf4]"
                : p.featured
                  ? isLET
                    ? "border-[#d4af37] bg-[#fffdf5]"
                    : "border-[#16a34a] bg-[#f0fdf4]"
                  : "border-[#e6efe1] bg-white"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-[#16331f]">{p.label}</span>
                {p.badge && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white ${
                      isLET ? "bg-[#ca8a04]" : "bg-[#16a34a]"
                    }`}
                  >
                    {p.badge}
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-[#16331f]">₱{p.price.toLocaleString()}</span>
                <span className="ml-1 text-xs text-[#5c7863]">
                  {p.term === "season" ? "one time" : `/ ${p.term} days`}
                </span>
              </div>
            </div>
            <p className="mt-1 text-xs text-[#5c7863]">{p.blurb}</p>

            {p.ownedUntil ? (
              <div className="mt-3 w-full rounded-xl bg-[#16a34a] py-3 text-center text-sm font-bold text-white">
                ✓ Unlocked until {p.ownedUntil}
              </div>
            ) : (
              <button
                type="button"
                disabled={!enabled || busy !== null}
                onClick={() => void start(p)}
                className={`mt-3 w-full py-3 text-sm ${
                  tinted ? accentBtn : "rounded-xl border border-[#d9e6d3] bg-white font-bold text-[#3d5c44] hover:border-[#d4af37]"
                } disabled:opacity-50`}
              >
                {busy === key
                  ? "Opening PayMongo…"
                  : isSignedIn
                    ? `Pay ₱${p.price.toLocaleString()} — GCash or card`
                    : "Create account to pay"}
              </button>
            )}
          </div>
        );
      })}

      {!enabled && (
        <p className="rounded-xl bg-[#fffbeb] px-3 py-2 text-xs font-semibold text-[#b45309] sm:col-span-2">
          Card and GCash payments open in a few days — the review center's payment account is being
          verified right now. Everything else is ready; check back shortly.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 sm:col-span-2">
          {error}
        </p>
      )}

      <p className="text-center text-[11px] text-[#94a896] sm:col-span-2">
        Secure checkout by HitPay. We never see your card or GCash details.{" "}
        {isSignedIn && (
          <Link href="/dashboard" className="font-semibold underline decoration-[#d4af37] decoration-2 underline-offset-2">
            Prefer GCash transfer?
          </Link>
        )}
      </p>
    </div>
  );
}
