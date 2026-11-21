import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/paymongo/status?ref=<payments.id>
 *
 * Read-only view of the caller's own payment, for the success page to poll.
 * RLS ("own payments read") decides visibility, so this cannot leak someone
 * else's order.
 */
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(ref)) {
    return NextResponse.json({ error: "bad reference" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("payments")
    .select("id, track, plan, amount, status, payment_method, days_granted, granted_expires_at, created_at, paid_at")
    .eq("id", ref)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
