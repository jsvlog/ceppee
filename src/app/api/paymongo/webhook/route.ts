import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { verifyWebhook } from "@/lib/paymongo";

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
