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

export type PlanId = "monthly" | "subject" | "beed" | "bsed" | "csec";
export type PlanScope = "track" | "level" | "subject";
export type PlanTrack = "CSE" | "LET";

/**
 * The four products, priced here and nowhere else.
 *
 *   monthly  P149  everything in one track, 30 days (buy again to stack)
 *   subject  P299  one subject / CSE category, until the exam date
 *   beed     P399  every elementary LET paper, until the exam date
 *   bsed     P499  every secondary LET paper, until the exam date
 *   csec     P499  every CSE paper, until the exam date
 *
 * `scope` tells activate_payment() how wide the grant is; it is repeated into
 * the payments row so an old order can always be re-read.
 */
export interface Plan {
  id: PlanId;
  /** Pesos, for display. */
  price: number;
  /** Centavos, what PayMongo is told. 149 pesos = 14900. */
  amount: number;
  scope: PlanScope;
  /** Which tracks this plan may be sold for. */
  tracks: PlanTrack[];
  /** Fixed level for level-scoped plans. */
  level?: "elementary" | "secondary";
  /** True when the buyer has to name a subject (or CSE category). */
  needsSubject?: boolean;
  /** "season" = until the exam date; a number = that many days. */
  term: "season" | number;
  label: string;
  blurb: string;
}

export const PLANS: Record<PlanId, Plan> = {
  beed: {
    id: "beed",
    price: 399,
    amount: 39900,
    scope: "level",
    tracks: ["LET"],
    level: "elementary",
    term: "season",
    label: "Complete BEED",
    blurb: "Every elementary paper — Gen Ed, Prof Ed and your specialization. Until exam day.",
  },
  bsed: {
    id: "bsed",
    price: 499,
    amount: 49900,
    scope: "level",
    tracks: ["LET"],
    level: "secondary",
    term: "season",
    label: "Complete BSED",
    blurb: "Every secondary paper — Gen Ed, Prof Ed and your major. Until exam day.",
  },
  csec: {
    id: "csec",
    price: 499,
    amount: 49900,
    scope: "track",
    tracks: ["CSE"],
    term: "season",
    label: "Complete CSE",
    blurb: "Every CSE category, all 202 sets' worth of practice. Until exam day.",
  },
  subject: {
    id: "subject",
    price: 299,
    amount: 29900,
    scope: "subject",
    tracks: ["CSE", "LET"],
    needsSubject: true,
    term: "season",
    label: "One subject",
    blurb: "Only the paper you need, unlocked until exam day.",
  },
  monthly: {
    id: "monthly",
    price: 149,
    amount: 14900,
    scope: "track",
    tracks: ["CSE", "LET"],
    term: 30,
    label: "Monthly pass",
    blurb: "Everything in this track for 30 days. Buy again anytime — days stack.",
  },
};

/** What can be sold for a track, in the order the pricing page shows it. */
export function plansFor(track: PlanTrack): PlanId[] {
  return track === "CSE" ? ["csec", "subject", "monthly"] : ["beed", "bsed", "subject", "monthly"];
}

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PLANS, v);
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
  track: PlanTrack;
  userId: string;
  email?: string | null;
  origin: string;
  examDateLabel?: string | null;
  /** The subject / CSE category for the P299 plan. */
  subject?: string | null;
}

/** Creates the hosted checkout session and returns its id + url. */
export async function createCheckoutSession(args: CheckoutArgs): Promise<{ id: string; url: string }> {
  const plan = PLANS[args.plan];
  const base = args.track === "CSE" ? "CSE Review" : "LET Review";
  const what =
    plan.scope === "subject"
      ? ` — ${args.subject ?? "One subject"}`
      : plan.scope === "level"
        ? ` — ${plan.label}`
        : ` — ${plan.label}`;
  const until =
    plan.term === "season"
      ? args.examDateLabel
        ? ` (until ${args.examDateLabel})`
        : " (until exam day)"
      : ` (${plan.term} days)`;
  const itemName = `${base}${what}${until}`;

  const res = await fetch(`${PAYMONGO_API()}/v2/checkout_sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [
            { name: itemName, amount: plan.amount, currency: "PHP", quantity: 1 },
          ],
          payment_method_types: ["card", "gcash", "qrph", "maya"],
          success_url: `${args.origin}/payment/success?ref=${args.paymentId}`,
          cancel_url: `${args.origin}/pricing?cancelled=1`,
          reference_number: args.paymentId,
          description: `Teacher Ceppee Review — ${args.track} ${plan.label}${args.subject ? ` (${args.subject})` : ""}`,
          send_email_receipt: true,
          show_description: true,
          metadata: {
            payment_id: args.paymentId,
            user_id: args.userId,
            track: args.track,
            plan: args.plan,
            scope: plan.scope,
            ...(args.subject ? { subject: args.subject } : {}),
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
