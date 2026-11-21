# Automatic online payments (GCash, cards, QR Ph) — PayMongo

## Goal

Replace "student pays via GCash, uploads a receipt, admin clicks Approve" with a
hosted checkout that activates the subscription by itself, so a student can pay at
2 a.m. and start reviewing two minutes later.

## What exists today (verified in the codebase)

- Next.js 16 App Router + Supabase. `public.payment_requests` holds the manual
  receipt flow; the admin approves from `/admin` → **Payments** tab, which calls
  `approve_payment_request(payment_id)`.
- That function (`supabase/schema.sql:316`) inserts a `public.subscriptions` row with
  `expires_at = now() + interval '180 days'`, or on `(user_id, track)` conflict adds
  180 days to the existing expiry. Access is one **pass per track**, not a monthly plan.
- `subscriptions` is unique on `(user_id, track)` with `status in (active, expired, revoked)`.
- Everything paid is gated by `hasActiveSub()` (`src/lib/queries.ts:108`) and by RLS on
  `exam_questions`; the reading library uses the same check.
- Price today: **₱500 per track**, shown as static text on `/pricing`. No price constant
  exists server-side.
- No payment SDK, no Stripe, no webhook endpoint anywhere in the repo.

That shape is a gift: a one-time payment that adds 180 days is exactly what a hosted
checkout + webhook does well. No recurring billing, no card vaulting, no dunning.

## Recommendation

**PayMongo Hosted Checkout (`/v2/checkout_sessions`) + webhook `checkout_session.payment.paid`.**

Why PayMongo over the alternatives, for a solo dev selling ₱500 passes to Filipino students:

| | PayMongo | Xendit | Stripe / Paddle |
|---|---|---|---|
| GCash | 2.23% | 3.00% + ₱11 | **no** |
| Maya | 1.79% | 2.00% + ₱11 | no |
| Cards (local Visa/MC) | 3.125% + ₱13.39 | 3.50% + ₱11 | ~3.9% + ₱? |
| QR Ph | 1.34% | 1.50% (min ₱15) + ₱11 | no |
| Hosted page (no card data on your server) | yes | yes | yes |
| Recurring | yes (cards) | yes (cards) | best in class |

On a ₱500 GCash payment PayMongo takes ~₱11.15 + 12% VAT ≈ **₱12.50**, so you keep
~₱487. Card payments keep ~₱467. All rates are VAT-exclusive plus 12% VAT on the fee.

The single hard prerequisite: **PayMongo only issues live keys to a registered business.**
Individual accounts can use test keys and are disabled 30 days after activation. To take
real money you need:
1. DTI Certificate of Business Name Registration (BNRS, online, same day, ~₱200–₱2,000
   depending on scope and whether you use a business name),
2. BIR Certificate of Registration, Form 2303 (RDO/ORUS — the slow part, usually 1–2 weeks).

Do that in parallel with the build. Until it clears, everything below runs on
`sk_test_` keys and the manual GCash flow stays live as the fallback.

If registration is off the table for now, the only honest alternatives are: keep manual
GCash, or use a merchant-of-record like Paddle/Lemon Squeezy (cards only, ~5% + fees,
no GCash — a bad fit for students). Don't build two integrations; build PayMongo and
leave the manual flow in place.

## Architecture

Three endpoints, two tables, one server-side price map.

```
/pricing  ──POST /api/checkout──►  payments row (pending)
                                        │
                                        ├──► PayMongo POST /v2/checkout_sessions
                                        │        └─► checkout_url (hosted page: GCash / card / QR Ph)
                                        │
student pays on PayMongo ───────────────┴──► POST /api/paymongo/webhook
                                                  verify signature
                                                  activate_payment(payment_id)  → subscriptions +180 days
                                                  return 200 immediately
/payment/success?ref=<payment_id>  ── reads payments row, polls while pending
```

Rules that keep this safe:

- The **client never sends an amount**. `src/lib/plans.ts` maps `track → {amount, days, name}`;
  the route reads it. A tampered request can only pick a track the user is allowed to buy.
- The **webhook is the only thing that grants access**. The success page is cosmetic.
- Activation is **idempotent**: `activate_payment` marks the payment paid only if it is
  still pending, and PayMongo retries webhooks up to 12 times.
- Nothing card-related touches the server. Hosted checkout keeps PCI scope to SAQ A.

## Tasks

### T1 — Environment variables

Add to `.env.local` (and to Vercel → Settings → Environment Variables):

```
PAYMONGO_SECRET_KEY=sk_test_...
PAYMONGO_WEBHOOK_SECRET=whsk_...
PAYMONGO_LIVE=0
SUPABASE_SERVICE_ROLE_KEY=...        # already present
```

`PAYMONGO_LIVE=1` only after the live keys land. Verify:
`grep PAYMONGO .env.local` prints the three lines and nothing is committed
(`git check-ignore .env.local` → `.env.local`).

### T2 — Tables and the activation function

Create `supabase/payments.sql`:

```sql
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  track text not null check (track in ('CSE','LET')),
  amount int not null,                       -- centavos
  days int not null default 180,
  provider text not null default 'paymongo',
  checkout_session_id text unique,
  checkout_url text,
  provider_ref text,                         -- PayMongo payment id (pay_xxx)
  payment_method text,                       -- gcash | card | qrph | maya
  status text not null default 'pending'
    check (status in ('pending','paid','failed','expired','refunded')),
  raw jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create index if not exists payments_pending_idx on public.payments (status) where status = 'pending';

alter table public.payments enable row level security;

drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments
  for select using (user_id = auth.uid());

drop policy if exists "payments_admin" on public.payments;
create policy "payments_admin" on public.payments
  for all using (public.is_admin());

-- Called only by the webhook handler (service role). Idempotent on purpose:
-- a replayed webhook changes nothing and never grants a second season.
create or replace function public.activate_payment(
  p_payment_id uuid, p_provider_ref text, p_method text, p_raw jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_pay public.payments%rowtype;
begin
  update public.payments
     set status = 'paid', paid_at = now(), provider_ref = p_provider_ref,
         payment_method = p_method, raw = coalesce(p_raw, raw)
   where id = p_payment_id and status = 'pending'
  returning * into v_pay;

  if not found then return; end if;          -- already paid or not pending

  insert into public.subscriptions (user_id, track, status, started_at, expires_at)
  values (v_pay.user_id, v_pay.track, 'active', now(), now() + (v_pay.days || ' days')::interval)
  on conflict (user_id, track) do update
    set status = 'active',
        expires_at = public.subscriptions.expires_at + (v_pay.days || ' days')::interval;
end;
$$;

revoke all on function public.activate_payment(uuid, text, text, jsonb) from public, anon, authenticated;
```

Apply: `python "D:/hermes project/QUESTION BANK/_tools/apply_sql.py" "D:/hermes project/teacher ceppee/supabase/payments.sql"`
Expected: `[]`. Then verify:
`... apply_sql.py -c "select proname from pg_proc where proname='activate_payment'"` → one row.

### T3 — Price map (single source of truth)

`src/lib/plans.ts`:

```ts
export type Track = "CSE" | "LET";

export const PAID_PLANS: Record<Track, { name: string; amount: number; days: number }> = {
  LET: { name: "LET Review — one review season", amount: 50000, days: 180 }, // ₱500 in centavos
  CSE: { name: "CSE Review — one review season", amount: 50000, days: 180 },
};

export const PLAN_LABEL = "₱500 per track · 180 days of access";
```

`/pricing` keeps its copy but reads the number from `PAID_PLANS` so the page and the
charge can never disagree.

### T4 — PayMongo client + signature check

`src/lib/paymongo.ts`:

```ts
import crypto from "node:crypto";
import { PAID_PLANS, type Track } from "@/lib/plans";

const BASE = "https://api.paymongo.com/v2";

function auth() {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) throw new Error("PAYMONGO_SECRET_KEY missing");
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

export async function createCheckoutSession(opts: {
  paymentId: string; userId: string; track: Track; origin: string;
}) {
  const plan = PAID_PLANS[opts.track];
  const res = await fetch(`${BASE}/checkout_sessions`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [{ name: plan.name, amount: plan.amount, currency: "PHP", quantity: 1 }],
          payment_method_types: ["card", "gcash", "qrph", "maya"],
          success_url: `${opts.origin}/payment/success?ref=${opts.paymentId}`,
          cancel_url: `${opts.origin}/pricing?cancelled=1`,
          reference_number: opts.paymentId,          // our payments.id, echoed in the webhook
          metadata: { user_id: opts.userId, track: opts.track, days: String(plan.days) },
          send_email_receipt: true,
        },
      },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`paymongo ${res.status}: ${JSON.stringify(json)}`);
  const a = json.data.attributes;
  return { id: json.data.id as string, url: a.checkout_url as string };
}

export function verifyWebhook(raw: string, header: string | null) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const mode = process.env.PAYMONGO_LIVE === "1" ? "li" : "te";
  const signature = parts[mode];
  if (!signature || !parts.t) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  return (
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
}
```

Note: PayMongo documents two shapes for this header (older `t/te/li` over `t.body`, and a
plain `HMAC(secret, body)`). The code above implements the `t/te/li` form; if a real test
webhook fails it, log the header and add a plain-body fallback rather than guessing.

### T5 — Create the checkout (`POST /api/checkout`)

`src/app/api/checkout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PAID_PLANS, type Track } from "@/lib/plans";
import { createCheckoutSession } from "@/lib/paymongo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "login_required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const track = (body?.track ?? "LET") as Track;
  if (!(track in PAID_PLANS)) return NextResponse.json({ error: "bad_track" }, { status: 400 });

  // one open session per user per track; reuse it instead of stacking rows
  const { data: existing } = await supabase
    .from("payments").select("id, checkout_url, status")
    .eq("user_id", user.id).eq("track", track).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing?.checkout_url) return NextResponse.json({ url: existing.checkout_url });

  const plan = PAID_PLANS[track];
  const { data: row, error } = await supabase.from("payments").insert({
    user_id: user.id, track, amount: plan.amount, days: plan.days, status: "pending",
  }).select("id").single();
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });

  const origin = new URL(req.url).origin;
  const session = await createCheckoutSession({ paymentId: row.id, userId: user.id, track, origin });

  await supabase.from("payments")
    .update({ checkout_session_id: session.id, checkout_url: session.url })
    .eq("id", row.id);

  return NextResponse.json({ url: session.url });
}
```

### T6 — Webhook (`POST /api/paymongo/webhook`)

`src/app/api/paymongo/webhook/route.ts`:

```ts
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { verifyWebhook } from "@/lib/paymongo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text();                       // raw body, before any parsing
  if (!verifyWebhook(raw, req.headers.get("paymongo-signature"))) {
    return new Response("bad signature", { status: 401 });
  }

  const evt = JSON.parse(raw);
  const type = evt?.data?.attributes?.type;
  if (type !== "checkout_session.payment.paid") return Response.json({ ok: true, ignored: type });

  const attrs = evt.data.attributes.data.attributes;
  const paymentId = attrs?.reference_number;
  const paid = attrs?.payments?.[0]?.attributes;
  if (!paymentId || paid?.status !== "paid") return Response.json({ ok: true, skipped: true });

  const supa = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: row } = await supa.from("payments")
    .select("id, amount, status").eq("id", paymentId).maybeSingle();
  if (!row) return Response.json({ ok: true, unknown: paymentId });
  if (paid.amount < row.amount) return Response.json({ ok: true, underpaid: true });

  await supa.rpc("activate_payment", {
    p_payment_id: paymentId,
    p_provider_ref: paid.id,
    p_method: paid.source?.type ?? null,
    p_raw: evt,
  });

  return Response.json({ ok: true });
}
```

Register it in the PayMongo dashboard: Developers → Webhooks → Add endpoint
`https://<domain>/api/paymongo/webhook`, event `checkout_session.payment.paid` only.
Copy the `whsk_...` secret into `PAYMONGO_WEBHOOK_SECRET`.

### T7 — Wire the pricing buttons

`src/app/(site)/pricing/page.tsx` is a server component; add a small client button:

`src/components/BuyButton.tsx`:

```tsx
"use client";
import { useState } from "react";

export default function BuyButton({ track, className, label }: { track: "CSE" | "LET"; className?: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true); setError(null);
          const res = await fetch("/api/checkout", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ track }),
          });
          const json = await res.json();
          if (res.ok && json.url) window.location.href = json.url;
          else { setBusy(false); setError(json.error === "login_required" ? "Log in first." : "Could not start checkout."); }
        }}
      >
        {busy ? "Opening GCash / card…" : label}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

Keep the manual GCash instructions below it while `PAYMONGO_LIVE=0`.

### T8 — Success page

`src/app/(site)/payment/success/page.tsx` — server component, `?ref=<paymentId>`; reads
`payments` (RLS limits it to the owner), shows "Payment received — LET unlocked until
<date>" when `status = 'paid'`, otherwise "Waiting for GCash to confirm…" plus a
`Refresh` link. Add a 5-second client poll for the pending case (max 20 tries).

### T9 — Reconciliation (the safety net)

PayMongo does not re-send missed events, and disables an endpoint after 3 consecutive
failed deliveries. Add `GET /api/payments/reconcile` guarded by
`Authorization: Bearer ${CRON_SECRET}`: loads `payments` where `status='pending'` and
`created_at < now() - interval '10 minutes'`, fetches each `checkout_session_id` from
`GET /v2/checkout_sessions/{id}`, and calls `activate_payment` for any that are paid.
Schedule it hourly (Vercel Cron or a Windows Task on the server PC) — this is also the
answer to "the webhook was down for two hours".

### T10 — Admin visibility

The `/admin` → Payments tab already lists manual requests. Add a second table under it:
online payments with columns email · track · ₱ · method · status · provider ref · paid_at,
plus a total for the month. Read-only; refunds are done in the PayMongo dashboard.

## Tests / validation

1. **Signature unit test** — `tests/paymongo-signature.test.mjs`, run `node --test tests/`:
   - build `t=1700000000`, body `{"a":1}`, compute HMAC with a known secret, assemble
     `t=...,te=<sig>,li=x` → `verifyWebhook` returns true;
   - flip one character in the body → false;
   - missing header → false.
2. **End-to-end in test mode** (dev server + `sk_test_`):
   - log in as a throwaway user, POST `/api/checkout` → 200 with a `checkout_url`;
   - open it, pay with PayMongo's test card `4343434343434345` (any future expiry, CVV 123);
   - expect: webhook 200, `payments.status='paid'`, `subscriptions.expires_at` ≈ now + 180 days;
   - re-send the same webhook body → still one `paid` row, expiry **unchanged** (idempotency);
   - send the same body with one byte changed → 401 and nothing changes;
   - pay again as the same user → expiry moves forward by another 180 days, no second row.
3. **Negative cases**: no session cookie → 401; `track: "XYZ"` → 400; unknown `ref` in a
   valid webhook → 200 with `unknown` and no activation; underpaid amount → no activation.
4. **Regression**: `hasActiveSub` flips for a `paid` row and the reading library unlocks
   (previously verified: 1 section → 374 sections).

Expected commands:
`npx tsc --noEmit` → clean; `npm run build` → compiled; `node --test tests/` → pass;
`python "D:/hermes project/QUESTION BANK/_tools/apply_sql.py" -c "select status,count(*) from public.payments group by 1"` → the payments you made.

## Risks and tradeoffs

- **Registration is the real gate.** No DTI + BIR 2303 → no live keys → no real GCash.
  Budget 1–2 weeks and start it now; the code can be finished and tested before it lands.
- **VAT and receipts.** Once registered, sales may be VAT-able (₱500 inclusive vs plus 12%)
  and buyers may ask for an official receipt. Decide with an accountant before launch;
  `send_email_receipt: true` gives a PayMongo receipt, not a BIR one.
- **No GCash auto-renew.** GCash has no merchant-initiated recurring debit here, so the
  product stays "one payment, 180 days" — which is what it already is. Card recurring is
  possible later via PayMongo Subscriptions if you ever want monthly pricing.
- **Fees on ₱500** are ₱12.50 (GCash) to ₱32.50 (cards). Keeping the price at ₱500 means
  absorbing them; `pass_on_fees: true` shifts them to the buyer but shows a higher total
  at checkout. Recommendation: absorb GCash/QR Ph, and revisit if card share grows.
- **Chargebacks cost ₱800** each and refunds keep the original fee. Keep the manual
  receipt flow available for disputes.
- **Webhook endpoint must answer in <30s** and must be HTTPS. Insert the event and return
  200; never call PayMongo back inside the handler.
- **Don't log raw webhooks with card details** into `payments.raw` forever — the payload
  has no PAN (hosted checkout), but it does carry billing name/email. Prune after 90 days
  if that matters to you.

## Open questions for the owner

1. Price stays ₱500, or ₱549/₱599 to cover the 2.5% and card fees?
2. Access length: fixed 180 days, or "until the next LET exam date" (needs an exam-date
   table and changes `activate_payment`).
3. Keep the manual GCash + receipt path permanently as a fallback (recommended until
   online volume is proven), or remove it once live?
4. Refund policy for a student who pays twice or changes track — automatic in the
   dashboard or a support email?
