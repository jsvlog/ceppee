export function peso(n: number): string {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Unique centavo suffix so the admin can match a payment to a user */
export function generateCentavoAmount(basePrice: number): number {
  const centavos = Math.floor(Math.random() * 99) + 1;
  return +(basePrice + centavos / 100).toFixed(2);
}

export function daysUntil(dateIso: string): number {
  const ms = new Date(dateIso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function fmtDate(dateIso: string | null): string {
  if (!dateIso) return "—";
  return new Date(dateIso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function fmtDateTime(dateIso: string | null): string {
  if (!dateIso) return "—";
  return new Date(dateIso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const TRACK_LABEL: Record<string, string> = {
  CSE: "Civil Service Exam",
  LET: "Licensure Examination for Teachers",
};
