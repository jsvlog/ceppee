"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { peso } from "@/lib/format";

interface PaymentRow {
  id: string;
  track: "CSE" | "LET";
  plan: "monthly" | "season";
  amount: number;
  status: "pending" | "paid" | "failed" | "cancelled";
  granted_expires_at: string | null;
  days_granted: number | null;
}

/**
 * The success page is cosmetic: the webhook is what grants access. So this polls
 * until the row flips to `paid`, and says so plainly instead of pretending.
 */
export default function PaymentPoller({ initial }: { initial: PaymentRow }) {
  const [row, setRow] = useState<PaymentRow>(initial);
  const [slow, setSlow] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (row.status !== "pending") return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - startedAt.current > 120000) setSlow(true);
      if (Date.now() - startedAt.current > 10 * 60000) return; // stop nagging after 10 min
      try {
        const res = await fetch(`/api/paymongo/status?ref=${row.id}`, { cache: "no-store" });
        if (res.ok) {
          const fresh = (await res.json()) as PaymentRow;
          if (!cancelled && fresh.status !== row.status) setRow(fresh);
        }
      } catch {
        /* network blip — next tick tries again */
      }
    };

    const id = window.setInterval(tick, 4000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [row.id, row.status]);

  const expiry = row.granted_expires_at
    ? new Date(row.granted_expires_at).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  if (row.status === "paid") {
    return (
      <div className="card p-8 text-center">
        <div className="mb-3 text-5xl">🎉</div>
        <h1 className="mb-2 text-2xl font-black text-[#16331f]">You&apos;re in!</h1>
        <p className="mx-auto mb-5 max-w-md text-sm text-[#3d5c44]">
          {row.track} Review is unlocked{expiry ? ` until ${expiry}` : ""}. Your XP, streaks and leaderboard
          standing carry over.
        </p>
        <div className="mx-auto mb-6 grid max-w-sm grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-[#f6faf4] p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#5c7863]">Paid</div>
            <div className="font-black text-[#16331f]">{peso(row.amount / 100)}</div>
          </div>
          <div className="rounded-xl bg-[#f6faf4] p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#5c7863]">Plan</div>
            <div className="font-black text-[#16331f]">{row.plan === "season" ? "Season pass" : "Monthly pass"}</div>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={`/review/${row.track.toLowerCase()}`} className="btn-primary px-6 py-3 text-sm">
            Start reviewing →
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl border border-[#d9e6d3] bg-white px-6 py-3 text-sm font-semibold text-[#3d5c44]"
          >
            My dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (row.status === "failed" || row.status === "cancelled") {
    return (
      <div className="card border-[#fecaca] bg-[#fef2f2] p-8 text-center">
        <div className="mb-3 text-4xl">⚠️</div>
        <h1 className="mb-2 text-xl font-black text-[#16331f]">That payment did not go through</h1>
        <p className="mx-auto mb-6 max-w-md text-sm text-[#991b1b]">
          Nothing was charged, or PayMongo cancelled the checkout. You can try again — or pay by GCash from your
          dashboard and an admin will approve it.
        </p>
        <Link href="/pricing" className="btn-primary px-6 py-3 text-sm">
          Try again
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-8 text-center">
      <div className="mb-3 animate-pulse text-4xl">⏳</div>
      <h1 className="mb-2 text-xl font-black text-[#16331f]">Confirming your payment…</h1>
      <p className="mx-auto mb-4 max-w-md text-sm text-[#5c7863]">
        PayMongo is telling us you paid. This page updates by itself — you can leave it once you see the
        confirmation, and your dashboard unlocks either way.
      </p>
      <div className="mx-auto max-w-xs rounded-xl bg-[#f6faf4] p-3 text-xs text-[#5c7863]">
        {row.track} · {row.plan === "season" ? "Season pass" : "Monthly pass"} · {peso(row.amount / 100)}
      </div>
      {slow && (
        <p className="mt-4 text-xs text-[#b45309]">
          Taking longer than usual. If GCash already showed the payment, wait a minute and refresh — or message us
          on Facebook with this reference: <span className="font-mono">{row.id.slice(0, 8)}</span>
        </p>
      )}
    </div>
  );
}
