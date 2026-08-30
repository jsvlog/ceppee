"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("mode") === "signup") setMode("signup");
  }, [searchParams]);

  const nextUrl = searchParams.get("next") || "/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const supabase = createClient();

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (signUpError) {
          setError(signUpError.message);
        } else if (data.session) {
          // Email confirmation disabled — auto signed in
          router.push(nextUrl);
          router.refresh();
        } else {
          setMessage("✅ Account created! Check your email for the confirmation link, then log in.");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError(signInError.message);
        } else {
          router.push(nextUrl);
          router.refresh();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gradient-hero relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-16">
      <div className="orb orb-blue -left-24 -top-24" />
      <div className="orb orb-sky -bottom-24 -right-20" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2563eb] to-[#38bdf8] text-xl font-black text-white shadow-lg">
              C
            </span>
            <span className="text-2xl font-extrabold text-[#142a56]">
              Ceppee<span className="gradient-text">Review</span>
            </span>
          </Link>
        </div>

        <div className="card p-8">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-[#e0f2fe] p-1">
            <button
              onClick={() => { setMode("login"); setError(null); setMessage(null); }}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                mode === "login" ? "bg-white text-[#142a56] shadow" : "text-[#5a6d91]"
              }`}
            >
              Log in
            </button>
            <button
              onClick={() => { setMode("signup"); setError(null); setMessage(null); }}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                mode === "signup" ? "bg-white text-[#142a56] shadow" : "text-[#5a6d91]"
              }`}
            >
              Sign up
            </button>
          </div>

          <h1 className="mb-1 text-xl font-bold text-[#142a56]">
            {mode === "login" ? "Welcome back!" : "Create your account"}
          </h1>
          <p className="mb-6 text-sm text-[#5a6d91]">
            {mode === "login"
              ? "Log in to continue your review."
              : "It's a free account — you only pay once you subscribe."}
          </p>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#3f4d78]">Full name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input-warm"
                  placeholder="Juan Dela Cruz"
                />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#3f4d78]">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-warm"
                placeholder="you@email.com"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#3f4d78]">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-warm"
                placeholder="••••••••"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm">
              {loading ? "Just a moment..." : mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-relaxed text-[#93a4c0]">
            By continuing, you agree to use Ceppee Review for your personal exam preparation.
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-[#5a6d91]">
          <Link href="/" className="hover:text-[#142a56]">← Back to homepage</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#f5f8ff]"><div className="skeleton h-10 w-48 rounded-xl" /></div>}>
      <LoginInner />
    </Suspense>
  );
}
