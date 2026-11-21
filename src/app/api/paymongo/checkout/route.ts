import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { PLANS, createCheckoutSession, isPlanId, isTrack, paymongoConfigured } from "@/lib/paymongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/paymongo/checkout  { track, plan }
 *
 * 1. authenticate (cookie session)
 * 2. validate track/plan — the AMOUNT comes from PLANS, never the body
 * 3. write the payments row FIRST, use its id as the reference_number
 * 4. create the hosted session and hand back its url
 *
 * Nothing here grants access; only the webhook does.
 */
export async function POST(req: NextRequest) {
  if (!paymongoConfigured()) {
    return NextResponse.json(
      { error: "Online payments are not switched on yet. Use GCash or bank transfer for now." },
      { status: 503 }
    );
  }

  let user;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }
  if (!user) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { track?: string; plan?: string };
  const track = String(body.track ?? "").toUpperCase();
  const plan = String(body.plan ?? "");

  if (!isTrack(track)) {
    return NextResponse.json({ error: "Unknown track." }, { status: 400 });
  }
  if (!isPlanId(plan)) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  const admin = getAdminClient();
  const paymentId = crypto.randomUUID();

  const { error: insertError } = await admin.from("payments").insert({
    id: paymentId,
    user_id: user.id,
    track,
    plan,
    amount: PLANS[plan].amount,
    currency: "PHP",
    status: "pending",
    provider: "paymongo",
    reference_number: paymentId,
  });
  if (insertError) {
    console.error("paymongo checkout: insert failed", insertError.message);
    return NextResponse.json({ error: "Could not start the checkout. Please try again." }, { status: 500 });
  }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, "");

  try {
    const session = await createCheckoutSession({
      paymentId,
      plan,
      track,
      userId: user.id,
      email: user.email,
      origin,
    });

    const { error: updateError } = await admin
      .from("payments")
      .update({ checkout_id: session.id })
      .eq("id", paymentId);
    if (updateError) console.error("paymongo checkout: storing checkout_id failed", updateError.message);

    return NextResponse.json({ id: paymentId, url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("paymongo checkout failed", message);
    await admin
      .from("payments")
      .update({ status: "failed", failure_note: message.slice(0, 500) })
      .eq("id", paymentId);
    return NextResponse.json(
      { error: "PayMongo did not accept the checkout. Please try again in a moment." },
      { status: 502 }
    );
  }
}
