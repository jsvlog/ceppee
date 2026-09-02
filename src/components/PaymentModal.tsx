"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { peso, generateCentavoAmount, fmtDateTime } from "@/lib/format";
import { TRACK_LABEL } from "@/lib/format";
import type { Track, PaymentRequest } from "@/lib/types";

interface Settings {
  gcash_number: string;
  gcash_name: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  payment_instructions: string;
}

export default function PaymentModal({
  track,
  basePrice,
  myRequests,
  onClose,
  onSuccess,
}: {
  track: Track;
  basePrice: number;
  myRequests: PaymentRequest[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [method, setMethod] = useState<"gcash" | "bank">("gcash");
  const [step, setStep] = useState<"pay" | "upload">("pay");
  const [amount] = useState(() => generateCentavoAmount(basePrice));
  const [reference, setReference] = useState("");
  const [pendingReq, setPendingReq] = useState<PaymentRequest | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pending = myRequests.find((r) => r.track === track && r.status === "pending");

  useEffect(() => {
    if (pending) {
      setPendingReq(pending);
      setStep("upload");
      setReference(pending.reference_number || "");
      if (pending.payment_method === "bank") setMethod("bank");
    }
    const supabase = createClient();
    supabase.from("site_settings").select("key, value").then(({ data }) => {
      if (data) {
        const map = Object.fromEntries(data.map((r) => [r.key, r.value]));
        setSettings(map as Settings);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    setError(null);
    if (method === "gcash" && !/^\d{13}$/.test(reference)) {
      setError("The GCash reference number is 13 digits (found on your GCash receipt).");
      return;
    }
    if (!file) {
      setError("Please upload a screenshot of your receipt.");
      return;
    }
    setSubmitting(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("receipts").upload(path, file);
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);

      // If re-submitting after a rejected attempt, reuse pending row
      if (pendingReq) {
        const { error: updErr } = await supabase
          .from("payment_requests")
          .update({
            reference_number: reference,
            receipt_url: urlData.publicUrl,
            status: "pending",
            amount,
            payment_method: method,
            admin_note: null,
          })
          .eq("id", pendingReq.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from("payment_requests").insert({
          user_id: user.id,
          track,
          amount,
          payment_method: method,
          reference_number: reference,
          receipt_url: urlData.publicUrl,
        });
        if (insErr) throw insErr;
      }
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="card relative max-h-[90vh] w-full max-w-lg overflow-y-auto p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[#5c7863] hover:bg-[#dcfce7]"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="mb-1 text-xs font-bold uppercase tracking-wider text-[#d4af37]">
          {track === "CSE" ? "🏛️ CSE Review" : "🍎 LET Review"} Subscription
        </div>
        <h3 className="mb-4 text-xl font-extrabold text-[#16331f]">Payment Details</h3>

        {step === "pay" && (
          <>
            {/* Amount */}
            <div className="mb-5 rounded-2xl border-2 border-dashed border-[#d4af37] bg-[#dcfce7] p-5 text-center">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#15803d]">Send the EXACT amount</div>
              <div className="my-1 text-4xl font-black text-[#16331f]">{peso(amount)}</div>
              <div className="text-xs text-[#15803d]">
                It has a few centavos so we can match your payment instantly. Send the full amount including the centavos.
              </div>
            </div>

            {/* Method switch */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setMethod("gcash")}
                className={`rounded-xl border-2 px-4 py-3 text-sm font-bold transition ${
                  method === "gcash" ? "border-[#16a34a] bg-[#dcfce7] text-[#15803d]" : "border-[#d9e6d3] text-[#5c7863]"
                }`}
              >
                📱 GCash
              </button>
              <button
                onClick={() => setMethod("bank")}
                className={`rounded-xl border-2 px-4 py-3 text-sm font-bold transition ${
                  method === "bank" ? "border-[#16a34a] bg-[#dcfce7] text-[#15803d]" : "border-[#d9e6d3] text-[#5c7863]"
                }`}
              >
                🏦 Bank Transfer
              </button>
            </div>

            {method === "gcash" ? (
              <div className="mb-4 space-y-2 rounded-2xl bg-[#f6faf4] p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#5c7863]">GCash Number</span>
                  <button
                    className="font-mono font-bold text-[#16331f] underline decoration-[#d4af37] decoration-2 underline-offset-2"
                    onClick={() => navigator.clipboard?.writeText(settings?.gcash_number || "")}
                    title="Click to copy"
                  >
                    {settings?.gcash_number || "—"}
                  </button>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5c7863]">Account Name</span>
                  <span className="font-semibold text-[#16331f]">{settings?.gcash_name || "—"}</span>
                </div>
              </div>
            ) : (
              <div className="mb-4 space-y-2 rounded-2xl bg-[#f6faf4] p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#5c7863]">Bank</span>
                  <span className="font-semibold text-[#16331f]">{settings?.bank_name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5c7863]">Account Name</span>
                  <span className="font-semibold text-[#16331f]">{settings?.bank_account_name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5c7863]">Account Number</span>
                  <button
                    className="font-mono font-bold text-[#16331f] underline decoration-[#d4af37] decoration-2 underline-offset-2"
                    onClick={() => navigator.clipboard?.writeText(settings?.bank_account_number || "")}
                    title="Click to copy"
                  >
                    {settings?.bank_account_number || "—"}
                  </button>
                </div>
              </div>
            )}

            <p className="mb-5 rounded-xl bg-[#dcfce7] px-4 py-3 text-xs leading-relaxed text-[#15803d]">
              📋 {settings?.payment_instructions}
            </p>

            <button onClick={() => setStep("upload")} className="btn-primary w-full py-3 text-sm">
              I’ve paid — Next →
            </button>
          </>
        )}

        {step === "upload" && (
          <>
            <div className="mb-5 rounded-2xl bg-[#dcfce7] p-4 text-sm text-[#166534]">
              ✅ Great! Now upload your proof of payment so we can verify it.
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-semibold text-[#3d5c44]">
                {method === "gcash" ? "13-digit GCash Reference Number" : "Reference Number (optional)"}
              </label>
              <input
                type="text"
                inputMode={method === "gcash" ? "numeric" : "text"}
                value={reference}
                onChange={(e) =>
                  method === "gcash"
                    ? setReference(e.target.value.replace(/\D/g, "").slice(0, 13))
                    : setReference(e.target.value)
                }
                maxLength={method === "gcash" ? 13 : 64}
                className="input-warm font-mono text-lg tracking-widest"
                placeholder={method === "gcash" ? "1234567890123" : "e.g. Bank ref / name"}
              />
              <p className="mt-1 text-xs text-[#5c7863]">
                {method === "gcash"
                  ? 'You’ll see it in your GCash app after paying — "Reference No."'
                  : "Bank transfer: we match using the exact amount + receipt."}
              </p>
            </div>

            <div className="mb-5">
              <label className="mb-1.5 block text-sm font-semibold text-[#3d5c44]">Receipt Screenshot</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="input-warm file:mr-3 file:rounded-lg file:border-0 file:bg-[#dcfce7] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[#15803d]"
              />
              {file && <p className="mt-1 text-xs text-[#22c55e]">✓ {file.name}</p>}
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button onClick={handleSubmit} disabled={submitting} className="btn-primary w-full py-3 text-sm">
              {submitting ? "Submitting..." : "Submit for Verification"}
            </button>
            <p className="mt-3 text-center text-xs text-[#5c7863]">
              We verify within 24 hours. Your dashboard updates once approved. 🎉
            </p>
          </>
        )}

        {/* Pending status */}
        {pendingReq?.status === "pending" && step === "upload" && pendingReq.created_at && !submitting && (
          <div className="mt-4 rounded-xl bg-[#fef3c7] px-4 py-3 text-sm text-[#0369a1]">
            ⏳ You already have a pending submission ({fmtDateTime(pendingReq.created_at)}). You can update it by submitting again.
          </div>
        )}
      </div>
    </div>
  );
}
