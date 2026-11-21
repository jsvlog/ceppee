import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/queries";
import PaymentPoller from "@/components/PaymentPoller";

export const metadata: Metadata = { title: "Payment" };
export const dynamic = "force-dynamic";

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const { user } = await getUserContext();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/payment/success?ref=${ref ?? ""}`)}`);
  }

  const supabase = await createClient();
  const { data } = ref
    ? await supabase
        .from("payments")
        .select("id, track, plan, amount, status, granted_expires_at, days_granted")
        .eq("id", ref)
        .maybeSingle()
    : { data: null };

  if (!data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="card p-8 text-center">
          <div className="mb-3 text-4xl">🔎</div>
          <h1 className="mb-2 text-xl font-black text-[#16331f]">We can&apos;t find that payment</h1>
          <p className="mb-6 text-sm text-[#5c7863]">
            The link may be incomplete. Check your dashboard — if access was granted it will already be there.
          </p>
          <Link href="/dashboard" className="btn-primary px-6 py-3 text-sm">
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <PaymentPoller initial={data as Parameters<typeof PaymentPoller>[0]["initial"]} />
    </div>
  );
}
