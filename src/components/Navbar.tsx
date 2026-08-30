"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Track } from "@/lib/types";

const trackLink = (track: Track) => `/review/${track.toLowerCase()}`;

export default function Navbar({ user, isAdmin }: { user: { email?: string } | null; isAdmin: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  // Close drawer on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const linkCls = (href: string) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition ${
      pathname === href ? "text-[#f4444e]" : "text-[#57534e] hover:text-[#3d3227] hover:bg-white/70"
    }`;

  const desktopLinks = (
    <>
      <Link href={trackLink("CSE")} className={linkCls(trackLink("CSE"))}>
        CSE Review
      </Link>
      <Link href={trackLink("LET")} className={linkCls(trackLink("LET"))}>
        LET Review
      </Link>
      <Link href="/pricing" className={linkCls("/pricing")}>
        Pricing
      </Link>
      {user && (
        <Link href="/dashboard" className={linkCls("/dashboard")}>
          Dashboard
        </Link>
      )}
      {isAdmin && (
        <Link href="/admin" className={linkCls("/admin")}>
          Admin
        </Link>
      )}
    </>
  );

  const desktopAuth = user ? (
    <div className="flex items-center gap-3">
      <span className="hidden text-xs text-[#8c7a64] lg:block">{user.email}</span>
      <button
        onClick={handleSignOut}
        className="rounded-xl border border-[#f5e6cc] bg-white px-4 py-2 text-sm font-semibold text-[#57534e] transition hover:border-[#ffa94d] hover:text-[#3d3227]"
      >
        Sign out
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-3">
      <Link href="/login" className="rounded-xl px-4 py-2 text-sm font-semibold text-[#57534e] transition hover:text-[#3d3227]">
        Log in
      </Link>
      <Link href="/login?mode=signup" className="btn-primary px-5 py-2.5 text-sm">
        Start reviewing
      </Link>
    </div>
  );

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-[#f5e6cc]/80 bg-[#fffdf7]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff6b6b] to-[#ffa94d] text-lg font-black text-white shadow-md">
              C
            </span>
            <span className="text-lg font-extrabold tracking-tight text-[#3d3227]">
              Ceppee<span className="gradient-text">Review</span>
            </span>
          </Link>

          {/* Desktop */}
          <div className="hidden items-center gap-1 md:flex">{desktopLinks}</div>
          <div className="hidden md:block">{desktopAuth}</div>

          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg md:hidden"
            aria-label="Toggle menu"
          >
            <span className={`block h-0.5 w-5 bg-[#3d3227] transition ${menuOpen ? "translate-y-2 rotate-45" : ""}`} />
            <span className={`block h-0.5 w-5 bg-[#3d3227] transition ${menuOpen ? "opacity-0" : ""}`} />
            <span className={`block h-0.5 w-5 bg-[#3d3227] transition ${menuOpen ? "-translate-y-2 -rotate-45" : ""}`} />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-40 transition-opacity md:hidden ${
          menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
        <div
          className={`absolute right-0 top-0 h-full w-72 bg-[#fffdf7] shadow-2xl transition-transform ${
            menuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex flex-col gap-1 p-5 pt-20">
            {desktopLinks}
            <div className="mt-4 border-t border-[#f5e6cc] pt-4">
              {user ? (
                <>
                  <p className="mb-3 truncate px-3 text-xs text-[#8c7a64]">{user.email}</p>
                  <button onClick={handleSignOut} className="w-full rounded-xl border border-[#f5e6cc] px-4 py-2.5 text-sm font-semibold text-[#57534e]">
                    Sign out
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link href="/login" className="rounded-xl border border-[#f5e6cc] px-4 py-2.5 text-center text-sm font-semibold">
                    Log in
                  </Link>
                  <Link href="/login?mode=signup" className="btn-primary px-4 py-2.5 text-center text-sm">
                    Start reviewing
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
