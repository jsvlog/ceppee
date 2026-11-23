import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { verifyWebhook } from "@/lib/paymongo";
import { verifyCallbackToken } from "@/lib/xendit";
import { verifySignature } from "@/lib/hitpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/paymongo/webhook
 *
 * The only thing that grants access. Reads the RAW body (req.text()) because the
 * signature covers those exact bytes; verify first, parse second.
 *
 * Returns 5xx only when activation itself failed, so PayMongo retries; a bad
 * signature is a 401 and changes nothing.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();

  // HitPay posts form-encoded fields and signs the raw body with HMAC-SHA256.
  const hitpaySignature = req.headers.get("hitpay-signature");
  if (hitpaySignature) {
    return handleHitpay(raw, hitpaySignature);
  }

  // Xendit calls the same endpoint with a shared token instead of a signature.
  const callbackToken = req.headers.get("x-callback-token");
  if (callbackToken) {
    return handleXendit(raw, callbackToken);
  }

  const signature = req.headers.get("paymongo-signature");

  if (!verifyWebhook(raw, signature)) {
    console.warn("paymongo webhook: bad signature");
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const data = (event.data ?? {}) as { attributes?: Record<string, unknown> };
  const type = data.attributes?.type as string | undefined;

  if (type !== "checkout_session.payment.paid") {
    return NextResponse.json({ ok: true, ignored: type ?? "unknown" });
  }

  const inner = (data.attributes?.data ?? {}) as { attributes?: Record<string, unknown> };
  const attrs = (inner.attributes ?? {}) as {
    reference_number?: string;
    metadata?: { payment_id?: string };
    payments?: { attributes?: { id?: string; status?: string; amount?: number; source?: { type?: string } } }[];
    source?: { type?: string };
  };

  const reference = attrs.reference_number ?? attrs.metadata?.payment_id;
  const payment = attrs.payments?.[0]?.attributes;

  if (!reference) {
    console.warn("paymongo webhook: paid event without a reference_number");
    return NextResponse.json({ ok: true, ignored: "no reference" });
  }
  if (payment?.status && payment.status !== "paid") {
    return NextResponse.json({ ok: true, ignored: `payment status ${payment.status}` });
  }

  const admin = getAdminClient();
  const { data: row, error: readError } = await admin
    .from("payments")
    .select("id, amount, status, track, plan")
    .eq("id", reference)
    .maybeSingle();

  if (readError) {
    console.error("paymongo webhook: could not read payment", readError.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (!row) {
    console.warn(`paymongo webhook: unknown reference ${reference}`);
    return NextResponse.json({ ok: true, ignored: "unknown reference" });
  }

  if (payment?.amount && Number(payment.amount) !== Number(row.amount)) {
    // Our amount comes from PLANS, so this should be impossible. Record it and
    // still activate — the student did pay through the session we created.
    console.warn(`paymongo webhook: amount mismatch on ${reference} (${payment.amount} vs ${row.amount})`);
  }

  const method = attrs.source?.type ?? payment?.source?.type ?? null;

  const { data: activated, error: activateError } = await admin.rpc("activate_payment", {
    p_payment_id: reference,
    p_provider_ref: payment?.id ?? null,
    p_method: method,
    p_raw: event,
  });

  if (activateError) {
    console.error("paymongo webhook: activate failed", activateError.message);
    return NextResponse.json({ ok: false, error: "activation failed" }, { status: 500 });
  }

  const result = Array.isArray(activated) ? activated[0] : activated;
  return NextResponse.json({ ok: true, payment: reference, activated: result?.activated ?? null });
}

/**
 * Xendit replay: { id, external_id, status: "PAID", paid_amount, payment_method }.
 * `external_id` is the payments.id we created, so a replayed callback is inert —
 * activate_payment() no-ops on an already-paid row.
 */
async function handleXendit(raw: string, token: string) {
  if (!verifyCallbackToken(token)) {
    console.warn("xendit webhook: bad callback token");
    return NextResponse.json({ ok: false, error: "invalid token" }, { status: 401 });
  }

  let event: {
    external_id?: string;
    id?: string;
    status?: string;
    paid_amount?: number;
    payment_method?: string;
    payment_channel?: string;
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const status = (event.status ?? "").toUpperCase();
  if (status !== "PAID" && status !== "SETTLED") {
    return NextResponse.json({ ok: true, ignored: status || "unknown" });
  }

  const paymentId = event.external_id;
  if (!paymentId) {
    console.warn("xendit webhook: paid event without external_id");
    return NextResponse.json({ ok: true, ignored: "no external_id" });
  }

  const admin = getAdminClient();
  const { data: row, error: readError } = await admin
    .from("payments")
    .select("id, amount, status")
    .eq("id", paymentId)
    .maybeSingle();
  if (readError) {
    console.error("xendit webhook: lookup failed", readError.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (!row) {
    console.warn("xendit webhook: unknown payment", paymentId);
    return NextResponse.json({ ok: true, ignored: "unknown payment" });
  }

  // Never let a small invoice pay for a bigger order.
  if (typeof event.paid_amount === "number" && event.paid_amount < row.amount / 100) {
    console.error("xendit webhook: amount mismatch", paymentId, event.paid_amount, row.amount);
    return NextResponse.json({ ok: false, error: "amount mismatch" }, { status: 400 });
  }

  const { error: actError } = await admin.rpc("activate_payment", {
    p_payment_id: paymentId,
    p_provider_ref: event.id ?? null,
    p_method: event.payment_method ?? event.payment_channel ?? null,
    p_raw: event,
  });
  if (actError) {
    // 5xx so Xendit retries; the reconcile job is the second net.
    console.error("xendit webhook: activation failed", actError.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * HitPay replay: form-encoded { status: "completed", reference_number: <payments.id>,
 * payment_id, amount }. Signed, so a forged body cannot grant access.
 */
async function handleHitpay(raw: string, signature: string) {
  if (!verifySignature(raw, signature)) {
    console.warn("hitpay webhook: bad signature");
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  const fields = new URLSearchParams(raw);
  const status = (fields.get("status") ?? "").toLowerCase();
  if (status !== "completed") {
    return NextResponse.json({ ok: true, ignored: status || "unknown" });
  }

  const paymentId = fields.get("reference_number");
  // A reference that is not one of our ids must not become a 500 — HitPay would
  // retry it forever. Ignore it instead.
  if (!paymentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) {
    return NextResponse.json({ ok: true, ignored: "reference is not one of ours" });
  }

  const admin = getAdminClient();
  const { data: row, error: readError } = await admin
    .from("payments")
    .select("id, amount, status")
    .eq("id", paymentId)
    .maybeSingle();
  if (readError) {
    console.error("hitpay webhook: lookup failed", readError.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (!row) {
    console.warn("hitpay webhook: unknown payment", paymentId);
    return NextResponse.json({ ok: true, ignored: "unknown payment" });
  }

  const paid = Number(fields.get("amount") ?? 0);
  if (paid && paid * 100 < row.amount) {
    console.error("hitpay webhook: amount mismatch", paymentId, paid, row.amount);
    return NextResponse.json({ ok: false, error: "amount mismatch" }, { status: 400 });
  }

  const method = (fields.get("payment_type") ?? fields.get("payment_method") ?? "gcash").toUpperCase();
  const { error: actError } = await admin.rpc("activate_payment", {
    p_payment_id: paymentId,
    p_provider_ref: fields.get("payment_id") ?? null,
    p_method: method,
    p_raw: Object.fromEntries(fields.entries()),
  });
  if (actError) {
    console.error("hitpay webhook: activation failed", actError.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
