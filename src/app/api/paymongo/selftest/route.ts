import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/paymongo/selftest  (admin only)
 *
 * Signs a synthetic "payment completed" payload with HITPAY_SALT and posts it to
 * our own webhook, then reports what came back. This is the only way to prove the
 * salt in production matches the one HitPay signs with, without a live payment.
 *
 * It cannot grant access: the reference is a random id that belongs to no order,
 * so the webhook answers 200 "ignored: unknown payment" when the signature is
 * valid and 401 when it is not.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: "admins only" }, { status: 403 });

  const salt = process.env.HITPAY_SALT;
  if (!salt) {
    return NextResponse.json(
      { ok: false, reason: "HITPAY_SALT is not set in this environment", hint: "add it in Vercel and redeploy" },
      { status: 200 }
    );
  }

  const reference = `selftest-${crypto.randomUUID()}`;
  const body = new URLSearchParams({
    status: "completed",
    reference_number: reference,
    amount: "149.00",
    currency: "PHP",
    payment_id: `test_${crypto.randomUUID().slice(0, 8)}`,
    payment_type: "gcash",
  }).toString();

  const signature = crypto.createHmac("sha256", salt).update(body, "utf8").digest("hex");
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || req.nextUrl.origin;

  let status = 0;
  let text = "";
  try {
    const res = await fetch(`${origin}/api/paymongo/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Hitpay-Signature": signature },
      body,
    });
    status = res.status;
    text = (await res.text()).slice(0, 200);
  } catch (err) {
    return NextResponse.json({ ok: false, reason: "could not reach our own webhook", detail: String(err) }, { status: 200 });
  }

  const saltLooksRight = status === 200;
  return NextResponse.json({
    ok: saltLooksRight,
    webhookStatus: status,
    webhookBody: text,
    verdict: saltLooksRight
      ? "salt matches — a real HitPay callback will be accepted"
      : status === 401
        ? "salt does NOT match — copy the Salt from HitPay → Developers → API Keys into HITPAY_SALT and redeploy"
        : "webhook rejected the call for another reason — see webhookBody",
  });
}
