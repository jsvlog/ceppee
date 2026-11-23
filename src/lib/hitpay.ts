import crypto from "crypto";
import { PLANS, type PlanId, type PlanTrack } from "./paymongo";

/**
 * HitPay — BSP-registered, accepts Philippine sole proprietors on DTI + BIR 2303,
 * and charges 2.3% on GCash with no fixed fee. It is the live gateway; Xendit and
 * PayMongo stay behind the same interface for when they open up again.
 *
 *   payment request -> hosted page (GCash, card, QR Ph)
 *   webhook         -> form-encoded body + HMAC-SHA256 in `Hitpay-Signature`
 *   status          -> GET /v1/payment-requests/{id}
 */

export const HITPAY_API = () =>
  process.env.HITPAY_API_BASE?.replace(/\/$/, "") || "https://api.hit-pay.com";

export function hitpayConfigured(): boolean {
  return Boolean(process.env.HITPAY_API_KEY);
}

function apiKey(): string {
  const key = process.env.HITPAY_API_KEY;
  if (!key) throw new Error("HITPAY_API_KEY is not set");
  return key;
}

export interface HitPayArgs {
  paymentId: string;
  plan: PlanId;
  track: PlanTrack;
  email?: string | null;
  origin: string;
  examDateLabel?: string | null;
  subject?: string | null;
  major?: string | null;
}

export async function createPaymentRequest(args: HitPayArgs): Promise<{ id: string; url: string }> {
  const plan = PLANS[args.plan];
  const what = args.major ?? args.subject ?? plan.label;
  const term =
    plan.term === "season"
      ? args.examDateLabel
        ? `until ${args.examDateLabel}`
        : "until exam day"
      : `${plan.term} days`;
  const purpose = `Teacher Ceppee · ${args.track} ${plan.label} — ${what} (${term})`;

  const res = await fetch(`${HITPAY_API()}/v1/payment-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BUSINESS-API-KEY": apiKey(),
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify({
      amount: plan.price, // pesos
      currency: "PHP",
      email: args.email ?? undefined,
      purpose,
      reference_number: args.paymentId,
      redirect_url: `${args.origin}/payment/success?ref=${args.paymentId}`,
      // GCash carries no fixed fee. QR Ph costs a flat P20, which is 13% of the
      // P149 plan, so it is only offered where it does not eat the margin.
      payment_methods: plan.price >= 29900 ? ["gcash", "card", "qrph"] : ["gcash", "card"],
      allow_repeated_payments: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HitPay payment request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { id?: string; url?: string };
  if (!json.id || !json.url) throw new Error("HitPay: missing id or url");
  return { id: json.id, url: json.url };
}

/** HMAC-SHA256 over the raw body, keyed with the salt from the dashboard. */
export function verifySignature(raw: string, header: string | null): boolean {
  const salt = process.env.HITPAY_SALT;
  if (!salt || !header) return false;
  const expected = crypto.createHmac("sha256", salt).update(raw, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header.trim());
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function requestStatus(id: string): Promise<"paid" | "pending" | "expired" | "unknown"> {
  const res = await fetch(`${HITPAY_API()}/v1/payment-requests/${id}`, {
    method: "GET",
    headers: { "X-BUSINESS-API-KEY": apiKey(), "X-Requested-With": "XMLHttpRequest" },
  });
  if (!res.ok) return "unknown";
  const json = (await res.json()) as { status?: string };
  switch ((json.status ?? "").toLowerCase()) {
    case "completed":
      return "paid";
    case "pending":
      return "pending";
    case "expired":
    case "canceled":
    case "failed":
      return "expired";
    default:
      return "unknown";
  }
}
