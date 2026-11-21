"use client";

import { useEffect, useState } from "react";

/**
 * "Resets in 5h 40m". Client-side so the number stays honest while the page is
 * open; the value itself comes from the server (Asia/Manila midnight / Monday).
 * Renders nothing until mounted, which keeps the server HTML and the first client
 * paint identical.
 */
export default function ResetCountdown({ resetsAt, className = "" }: { resetsAt: string | null; className?: string }) {
  const [left, setLeft] = useState<string | null>(null);

  useEffect(() => {
    if (!resetsAt) return;
    const target = new Date(resetsAt).getTime();

    const tick = () => {
      const ms = target - Date.now();
      if (ms <= 0) {
        setLeft("any moment now");
        return;
      }
      const mins = Math.floor(ms / 60000);
      const d = Math.floor(mins / 1440);
      const h = Math.floor((mins % 1440) / 60);
      const m = mins % 60;
      setLeft(d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`);
    };

    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, [resetsAt]);

  if (!resetsAt) return null;

  return (
    <span className={className}>
      {left === null ? "Resets soon" : `Resets in ${left}`}
    </span>
  );
}
