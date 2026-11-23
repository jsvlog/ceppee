import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { PLANS, createCheckoutSession, isPlanId, isTrack } from "@/lib/paymongo";
import { activeProvider, createInvoice } from "@/lib/xendit";
import { createPaymentRequest } from "@/lib/hitpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/paymongo/checkout  { track, plan, subject? }
 *
 * 1. authenticate (cookie session)
 * 2. validate track/plan/subject — the AMOUNT comes from PLANS, never the body
 * 3. write the payments row FIRST (plan, scope, level, subject) and use its id
 *    as the reference_number
 * 4. create the hosted session and hand back its url
 *
 * Nothing here grants access; only the webhook does.
 */
export async function POST(req: NextRequest) {
  const provider = activeProvider();
  if (!provider) {
    return NextResponse.json({ error: "Online payment is not switched on yet." }, { status: 503 });
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

  const body = (await req.json().catch(() => ({}))) as {
    track?: string;
    plan?: string;
    subject?: string;
    major?: string;
    level?: string;
  };
  const track = String(body.track ?? "").toUpperCase();
  const planId = String(body.plan ?? "");

  if (!isTrack(track)) {
    return NextResponse.json({ error: "Unknown track." }, { status: 400 });
  }
  if (!isPlanId(planId)) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }

  const plan = PLANS[planId];
  if (!plan.tracks.includes(track)) {
    return NextResponse.json({ error: `${plan.label} is not sold for ${track}.` }, { status: 400 });
  }

  const admin = getAdminClient();

  // LET has two divisions, and the monthly pass buys one of them — the same
  // scope the complete package gives, just for 30 days. CSE has no divisions.
  let scope: "track" | "level" | "subject" = plan.scope;
  let level: "elementary" | "secondary" | null = plan.level ?? null;
  if (plan.leveled && track === "LET") {
    const wanted = String(body.level ?? "").toLowerCase();
    if (wanted !== "elementary" && wanted !== "secondary") {
      return NextResponse.json({ error: "Pick elementary (BEED) or secondary (BSED) first." }, { status: 400 });
    }
    scope = "level";
    level = wanted;
  }

  // A subject plan must name a paper the track really has, checked against the
  // bank — a made-up subject would otherwise buy a token that unlocks nothing.
  let subject: string | null = null;
  let major: string | null = null;
  if (plan.needsSubject) {
    subject = String(body.subject ?? "").trim();
    if (!subject) {
      return NextResponse.json({ error: "Pick a subject first." }, { status: 400 });
    }
    const { data: hit, error } = await admin
      .from("exam_questions")
      .select("id")
      .eq("track", track)
      .eq("is_active", true)
      .eq("subject", subject)
      .limit(1);
    if (error) {
      return NextResponse.json({ error: "Could not check the subject list." }, { status: 500 });
    }
    if (!hit || hit.length === 0) {
      return NextResponse.json({ error: `"${subject}" is not a ${track} subject.` }, { status: 400 });
    }

    // "Specialization" is not one paper — English, Filipino, Mathematics... each
    // is its own majorship, and a ₱299 pass buys exactly one of them.
    if (subject === "Specialization") {
      const wanted = String(body.major ?? "").trim();
      if (!wanted) {
        return NextResponse.json({ error: "Pick your majorship first." }, { status: 400 });
      }
      const { data: majorHit, error: majorErr } = await admin
        .from("exam_questions")
        .select("id")
        .eq("track", track)
        .eq("is_active", true)
        .eq("subject", "Specialization")
        .eq("specialization", wanted)
        .limit(1);
      if (majorErr) {
        return NextResponse.json({ error: "Could not check the majorship list." }, { status: 500 });
      }
      if (!majorHit || majorHit.length === 0) {
        return NextResponse.json({ error: `"${wanted}" is not a ${track} majorship.` }, { status: 400 });
      }
      major = wanted;
    }
  }

  const paymentId = crypto.randomUUID();

  const { error: insertError } = await admin.from("payments").insert({
    id: paymentId,
    user_id: user.id,
    track,
    plan: planId,
    scope,
    level,
    subject,
    specialization: major,
    amount: plan.amount,
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

  // The season ends on exam day; show that date on the PayMongo page when set.
  let examDateLabel: string | null = null;
  if (plan.term === "season") {
    const { data } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", `exam_date_${track}`)
      .maybeSingle();
    const value = (data as { value?: string } | null)?.value;
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      examDateLabel = new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
  }

  try {
    const session =
      provider === "hitpay"
        ? await createPaymentRequest({
            paymentId,
            plan: planId,
            track,
            email: user.email,
            origin,
            examDateLabel,
            subject,
            major,
          })
        : provider === "xendit"
        ? await createInvoice({
            paymentId,
            plan: planId,
            track,
            email: user.email,
            origin,
            examDateLabel,
            subject,
            major,
          })
        : await createCheckoutSession({
      paymentId,
      plan: planId,
      track,
      userId: user.id,
      email: user.email,
            origin,
            examDateLabel,
            subject,
          });

    const { error: updateError } = await admin
      .from("payments")
      .update({ checkout_id: session.id, provider })
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
      { error: "The payment provider did not accept the checkout. Please try again in a moment." },
      { status: 502 }
    );
  }
}
