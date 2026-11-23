import crypto from "crypto";
import { PLANS, type PlanId, type PlanTrack } from "./paymongo";

/**
 * Xendit is the second set of rails. PayMongo paused new sign-ups, so the app
 * must be able to take money through an invoice page Xendit hosts, with the same
 * rules: the amount comes from PLANS on the server, the webhook is the only thing
 * that grants access, and the browser never names a price.
 *
 *   invoice  -> hosted page (GCash, Maya, QR Ph, card, OTC)
 *   webhook  -> x-callback-token header + { external_id, status: "PAID" }
 *   status   -> GET /v2/invoices/{id}
 */

export const XENDIT_API = () =>
  process.env.XENDIT_API_BASE?.replace(/\/$/, "") || "https://api.xendit.co";

/** "xendit" when its key is set — it wins because it can actually be opened today. */
export function activeProvider(): "xendit" | "paymongo" | null {
  if (process.env.XENDIT_SECRET_KEY) return "xendit";
  if (process.env.PAYMONGO_SECRET_KEY) return "paymongo";
  return null;
}

export function xenditConfigured(): boolean {
  return Boolean(process.env.XENDIT_SECRET_KEY);
}

function authHeader(): string {
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key) throw new Error("XENDIT_SECRET_KEY is not set");
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

export interface InvoiceArgs {
  paymentId: string;
  plan: PlanId;
  track: PlanTrack;
  email?: string | null;
  origin: string;
  examDateLabel?: string | null;
  subject?: string | null;
  major?: string | null;
}

/** Creates the invoice and returns its id + hosted page url. */
export async function createInvoice(args: InvoiceArgs): Promise<{ id: string; url: string }> {
  const plan = PLANS[args.plan];
  const what = args.major ?? args.subject ?? plan.label;
  const term =
    plan.term === "season"
      ? args.examDateLabel
        ? `until ${args.examDateLabel}`
        : "until exam day"
      : `${plan.term} days`;
  const description = `Teacher Ceppee · ${args.track} ${plan.label} — ${what} (${term})`;

  const res = await fetch(`${XENDIT_API()}/v2/invoices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
      // Xendit uses this header instead of an idempotency key body field.
      "api-version": "2022-07-31",
    },
    body: JSON.stringify({
      external_id: args.paymentId,
      amount: plan.price, // pesos; Xendit invoices are in major units
      currency: "PHP",
      description,
      // Long enough to finish a GCash transfer, short enough that abandoned
      // orders do not sit pending forever.
      invoice_duration: 60 * 60 * 24,
      success_redirect_url: `${args.origin}/payment/success?ref=${args.paymentId}`,
      failure_redirect_url: `${args.origin}/pricing?cancelled=1`,
      customer: args.email ? { email: args.email } : undefined,
      items: [{ name: description, quantity: 1, price: plan.price }],
      payment_methods: ["GCASH", "MAYA", "QRPH", "CREDIT_CARD"],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Xendit invoice failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { id?: string; invoice_url?: string };
  if (!json.id || !json.invoice_url) throw new Error("Xendit invoice: missing id or url");
  return { id: json.id, url: json.invoice_url };
}

/**
 * Xendit signs nothing; it replays a shared token in `x-callback-token`. A
 * constant-time compare keeps it from leaking through timing.
 */
export function verifyCallbackToken(header: string | null): boolean {
  const expected = process.env.XENDIT_CALLBACK_TOKEN;
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** "paid" | "pending" | "expired" for an invoice id. */
export async function invoiceStatus(id: string): Promise<"paid" | "pending" | "expired" | "unknown"> {
  const res = await fetch(`${XENDIT_API()}/v2/invoices/${id}`, {
    method: "GET",
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) return "unknown";
  const json = (await res.json()) as { status?: string };
  switch ((json.status ?? "").toUpperCase()) {
    case "PAID":
    case "SETTLED":
      return "paid";
    case "EXPIRED":
      return "expired";
    case "PENDING":
      return "pending";
    default:
      return "unknown";
  }
}
