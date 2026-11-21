import crypto from "crypto";

/**
 * PayMongo hosted checkout — the money side of the app.
 *
 * Two plans, both priced on the SERVER. The browser only ever sends
 * {track, plan}; the amount comes from PLANS, so a crafted request cannot buy
 * LET for ₱1.
 *
 *   monthly  ₱100  -> 30 days (extension rules live in activate_payment())
 *   season   ₱500  -> until the track's exam date, or 180 days when none is set
 *
 * Access is granted by the webhook (POST /api/paymongo/webhook) through
 * activate_payment(); never by the success page.
 */

export type PlanId = "monthly" | "season";

export interface Plan {
  id: PlanId;
  /** Pesos, for display. */
  price: number;
  /** Centavos, what PayMongo is told. 100 pesos = 10000. */
  amount: number;
  label: string;
  blurb: string;
}

export const PLANS: Record<PlanId, Plan> = {
  season: {
    id: "season",
    price: 500,
    amount: 50000,
    label: "Season pass",
    blurb: "One payment, access until your exam date.",
  },
  monthly: {
    id: "monthly",
    price: 100,
    amount: 10000,
    label: "Monthly pass",
    blurb: "30 days of access. Renew any time you need more.",
  },
};

/** Cheapest-per-day wording order: the season pass is the headline. */
export const PLAN_ORDER: PlanId[] = ["season", "monthly"];

export function isPlanId(v: unknown): v is PlanId {
  return v === "monthly" || v === "season";
}

export function isTrack(v: unknown): v is "CSE" | "LET" {
  return v === "CSE" || v === "LET";
}

export const PAYMONGO_API = () => process.env.PAYMONGO_API_BASE?.replace(/\/$/, "") || "https://api.paymongo.com";

export function paymongoConfigured(): boolean {
  return Boolean(process.env.PAYMONGO_SECRET_KEY);
}

function authHeader(): string {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) throw new Error("PAYMONGO_SECRET_KEY is not set");
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

export interface CheckoutArgs {
  paymentId: string;
  plan: PlanId;
  track: "CSE" | "LET";
  userId: string;
  email?: string | null;
  origin: string;
  examDateLabel?: string | null;
}

/** Creates the hosted checkout session and returns its id + url. */
export async function createCheckoutSession(args: CheckoutArgs): Promise<{ id: string; url: string }> {
  const plan = PLANS[args.plan];
  const itemName =
    args.track === "CSE" ? "CSE Review" : "LET Review";
  const suffix =
    args.plan === "season"
      ? args.examDateLabel
        ? ` — Season pass (until ${args.examDateLabel})`
        : " — Season pass"
      : " — Monthly pass (30 days)";

  const res = await fetch(`${PAYMONGO_API()}/v2/checkout_sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [
            { name: `${itemName}${suffix}`, amount: plan.amount, currency: "PHP", quantity: 1 },
          ],
          payment_method_types: ["card", "gcash", "qrph", "maya"],
          success_url: `${args.origin}/payment/success?ref=${args.paymentId}`,
          cancel_url: `${args.origin}/pricing?cancelled=1`,
          reference_number: args.paymentId,
          description: `Teacher Ceppee Review — ${args.track} ${plan.label}`,
          send_email_receipt: true,
          show_description: true,
          metadata: {
            payment_id: args.paymentId,
            user_id: args.userId,
            track: args.track,
            plan: args.plan,
          },
          ...(args.email
            ? { billing: { name: "", email: args.email, phone: "" } }
            : {}),
        },
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PayMongo ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    data?: { id?: string; attributes?: { checkout_url?: string } };
  };
  const id = json.data?.id;
  const url = json.data?.attributes?.checkout_url;
  if (!id || !url) throw new Error("PayMongo returned no checkout_url");
  return { id, url };
}

/**
 * `Paymongo-Signature: t=<unix>,te=<test sig>,li=<live sig>` — HMAC-SHA256 over
 * "<t>.<raw body>" with the endpoint's whsk_ secret. Uses the RAW body, so the
 * route must read req.text() before anything parses it.
 */
export function verifyWebhook(rawBody: string, header: string | null): boolean {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret || !header) return false;

  const parts = Object.fromEntries(
    header
      .split(",")
      .map((chunk) => chunk.trim().split("=", 2))
      .filter((kv) => kv.length === 2)
      .map(([k, v]) => [k, v])
  ) as Record<string, string>;

  const timestamp = parts.t;
  if (!timestamp) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  for (const candidate of [parts.te, parts.li]) {
    if (!candidate) continue;
    const a = Buffer.from(candidate, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** Sign a body the way PayMongo does — used by the tests, not by the app. */
export function signWebhookForTest(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},te=${sig},li=${sig}`;
}
