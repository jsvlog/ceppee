"use client";

import { useState } from "react";
import Link from "next/link";
import type { Track } from "@/lib/types";

export interface PlanOption {
  id: "monthly" | "season";
  price: number;
  label: string;
  blurb: string;
  badge?: string;
}

/**
 * The two ways to pay, per track. Prices come from the server (they must match
 * PLANS in @/lib/paymongo); the browser only posts {track, plan} and is
 * redirected to PayMongo's hosted page — GCash, Maya, QR Ph or card.
 */
export default function PlanCheckout({
  track,
  plans,
  enabled,
  isSignedIn,
  activeUntil,
}: {
  track: Track;
  plans: PlanOption[];
  enabled: boolean;
  isSignedIn: boolean;
  activeUntil: string | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isLET = track === "LET";
  const accentBtn = isLET ? "btn-gold" : "btn-primary";

  const start = async (plan: PlanOption["id"]) => {
    setError(null);
    if (!isSignedIn) {
      window.location.href = `/login?mode=signup&next=${encodeURIComponent("/pricing")}`;
      return;
    }
    setBusy(plan);
    try {
      const res = await fetch("/api/paymongo/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track, plan }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "Could not start the checkout.");
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {activeUntil && (
        <div className={`rounded-xl px-3 py-2 text-xs font-bold ${isLET ? "bg-[#fef9c3] text-[#92400e]" : "bg-[#dcfce7] text-[#15803d]"}`}>
          ✓ Active until {activeUntil}. Buying again adds to the end, never cuts it short.
        </div>
      )}

      {plans.map((p, i) => (
        <div
          key={p.id}
          className={`rounded-2xl border-2 p-4 ${
            i === 0
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
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${isLET ? "bg-[#ca8a04] text-white" : "bg-[#16a34a] text-white"}`}>
                  {p.badge}
                </span>
              )}
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-[#16331f]">₱{p.price.toLocaleString()}</span>
              <span className="ml-1 text-xs text-[#5c7863]">{p.id === "monthly" ? "/ 30 days" : "one time"}</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-[#5c7863]">{p.blurb}</p>

          <button
            type="button"
            disabled={!enabled || busy !== null}
            onClick={() => void start(p.id)}
            className={`mt-3 w-full py-3 text-sm ${i === 0 ? accentBtn : "rounded-xl border border-[#d9e6d3] bg-white font-bold text-[#3d5c44] hover:border-[#d4af37]"} disabled:opacity-50`}
          >
            {busy === p.id ? "Opening PayMongo…" : isSignedIn ? `Pay ₱${p.price.toLocaleString()} — GCash, Maya or card` : "Create account to pay"}
          </button>
        </div>
      ))}

      {!enabled && (
        <p className="rounded-xl bg-[#fffbeb] px-3 py-2 text-xs font-semibold text-[#b45309]">
          Online payment is still being switched on. Use GCash or bank transfer from your dashboard — an admin
          approves it within 24 hours.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      <p className="text-center text-[11px] text-[#94a896]">
        Secured by PayMongo. We never see your card or GCash details.{" "}
        {isSignedIn && (
          <Link href="/dashboard" className="font-semibold underline decoration-[#d4af37] decoration-2 underline-offset-2">
            Prefer GCash transfer?
          </Link>
        )}
      </p>
    </div>
  );
}
