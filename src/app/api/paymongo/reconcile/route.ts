import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { PAYMONGO_API } from "@/lib/paymongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/paymongo/reconcile
 *
 * PayMongo does not replay missed events, so an outage inside the webhook window
 * would leave a paid student locked out. This walks payments still `pending`
 * after 10 minutes, asks PayMongo what happened, and activates the ones already
 * paid. Idempotent (activate_payment no-ops on an already-paid row).
 *
 * Authorised by either an admin cookie session or `x-cron-secret: $CRON_SECRET`.
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const bearer = req.headers.get("authorization") ?? "";
  const cronOk =
    Boolean(secret) && (req.headers.get("x-cron-secret") === secret || bearer === `Bearer ${secret}`);

  if (!cronOk) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
    const admin = getAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", data.user.id).maybeSingle();
    if (!profile?.is_admin) return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ error: "payments not configured" }, { status: 503 });

  const admin = getAdminClient();
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data: pending, error } = await admin
    .from("payments")
    .select("id, track, plan, amount, checkout_id, created_at")
    .eq("status", "pending")
    .not("checkout_id", "is", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { id: string; outcome: string }[] = [];
  const auth = "Basic " + Buffer.from(`${secretKey}:`).toString("base64");

  for (const row of pending ?? []) {
    try {
      const res = await fetch(`${PAYMONGO_API()}/v2/checkout_sessions/${row.checkout_id}`, {
        headers: { Authorization: auth },
        cache: "no-store",
      });
      if (!res.ok) {
        results.push({ id: row.id, outcome: `lookup ${res.status}` });
        continue;
      }
      const json = (await res.json()) as {
        data?: {
          attributes?: {
            payment_intent?: { attributes?: { status?: string } };
            payments?: { attributes?: { id?: string; status?: string; source?: { type?: string } } }[];
          };
        };
      };
      const payment = json.data?.attributes?.payments?.[0]?.attributes;
      if (payment?.status === "paid") {
        const { error: actError } = await admin.rpc("activate_payment", {
          p_payment_id: row.id,
          p_provider_ref: payment.id ?? null,
          p_method: payment.source?.type ?? null,
          p_raw: json,
        });
        results.push({ id: row.id, outcome: actError ? `activate failed: ${actError.message}` : "activated" });
      } else {
        results.push({ id: row.id, outcome: `still ${payment?.status ?? "unpaid"}` });
      }
    } catch (err) {
      results.push({ id: row.id, outcome: err instanceof Error ? err.message : "error" });
    }
  }

  return NextResponse.json({ checked: pending?.length ?? 0, results });
}

/** POST for the admin button / manual curl. */
export async function POST(req: NextRequest) {
  return run(req);
}

/** GET for Vercel Cron (`Authorization: Bearer $CRON_SECRET`). */
export async function GET(req: NextRequest) {
  return run(req);
}
