"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LogoMark from "@/components/LogoMark";
import ThemeToggle from "@/components/ThemeToggle";
import UserBadgePill from "@/components/UserBadgePill";
import type { RecentStudyChat, Subscription, Track } from "@/lib/types";

export interface AppSidebarProps {
  user: { id: string; email?: string };
  profile: {
    id: string;
    full_name: string | null;
    is_admin: boolean;
    user_label?: string | null;
    user_badge_color?: string | null;
  } | null;
  isAdmin: boolean;
  subs: Subscription[];
  recentChats: RecentStudyChat[];
  streakDays: number;
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  sublabel?: string;
  icon: string;
  iconBg: string;
  match: (pathname: string) => boolean;
}

function relativeTime(iso: string): string {
  const diffSec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return "now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return `${Math.floor(diffSec / 86400)}d`;
}

export default function AppSidebar({
  user,
  profile,
  isAdmin,
  subs,
  recentChats,
  streakDays,
  children,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatPreviewOpen, setChatPreviewOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const chatPreviewRef = useRef<HTMLDivElement>(null);
  const desktopProfileRef = useRef<HTMLDivElement>(null);
  const mobileProfileRef = useRef<HTMLDivElement>(null);

  // Determine active track from URL or active subscription
  const activeSubs = subs.filter((s) => s.status === "active" && new Date(s.expires_at) > new Date());
  const defaultTrack: Track =
    pathname.includes("/cse")
      ? "CSE"
      : pathname.includes("/let")
        ? "LET"
        : activeSubs.some((s) => s.track === "CSE") && !activeSubs.some((s) => s.track === "LET")
          ? "CSE"
          : "LET";
  const trackSlug = defaultTrack.toLowerCase();

  const firstName =
    profile?.full_name?.trim().split(/\s+/)[0] ||
    user.email?.split("@")[0] ||
    "Reviewer";
  const fullName = profile?.full_name?.trim() || user.email?.split("@")[0] || "Ka-Ceppee";
  const initial = (fullName[0] || "K").toUpperCase();

  useEffect(() => {
    setMobileOpen(false);
    setChatPreviewOpen(false);
    setProfileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (chatPreviewRef.current && !chatPreviewRef.current.contains(target)) {
        setChatPreviewOpen(false);
      }
      const inDesktopProfile = desktopProfileRef.current?.contains(target) ?? false;
      const inMobileProfile = mobileProfileRef.current?.contains(target) ?? false;
      if (!inDesktopProfile && !inMobileProfile) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setProfileMenuOpen(false);
    setMobileOpen(false);
    try {
      const supabase = createClient();
      await Promise.all([
        supabase.auth.signOut(),
        fetch("/api/auth/signout", { method: "POST" }).catch(() => null),
      ]);
    } catch {
      /* continue to redirect */
    }
    window.location.href = "/";
  };

  const handleProfileNav = (href: string) => {
    setProfileMenuOpen(false);
    setMobileOpen(false);
    router.push(href);
  };

  const studyItems: NavItem[] = [
    {
      href: "/dashboard",
      label: "Dashboard",
      sublabel: "Your study space",
      icon: "🌱",
      iconBg: "bg-[#dcfce7] text-[#15803d]",
      match: (p) => p === "/dashboard",
    },
    {
      href: "/review/let",
      label: "LET Mock Boards",
      sublabel: "Campaign sets & arena",
      icon: "🍎",
      iconBg: "bg-[#fef9c3] text-[#b45309]",
      match: (p) => p.startsWith("/review/let") || (p.startsWith("/exam") && defaultTrack === "LET"),
    },
    {
      href: "/review/cse",
      label: "CSE Mock Boards",
      sublabel: "Civil service exams",
      icon: "🏛️",
      iconBg: "bg-[#dcfce7] text-[#15803d]",
      match: (p) => p.startsWith("/review/cse"),
    },
    {
      href: "/read",
      label: "Reading Materials",
      sublabel: "15 books · 3,801 sections",
      icon: "📚",
      iconBg: "bg-[#e0f2fe] text-[#0369a1]",
      match: (p) => p.startsWith("/read"),
    },
    {
      href: `/study/${trackSlug}/drill`,
      label: "Subject Drills",
      sublabel: "Instant explanations",
      icon: "🎯",
      iconBg: "bg-[#dcfce7] text-[#15803d]",
      match: (p) => p.includes("/drill"),
    },
    {
      href: `/study/${trackSlug}/flashcards`,
      label: "Flashcards",
      sublabel: "Daily active recall",
      icon: "🃏",
      iconBg: "bg-[#fef3c7] text-[#b45309]",
      match: (p) => p.includes("/flashcards"),
    },
    {
      href: `/study/${trackSlug}/mistakes`,
      label: "Retry Mistakes",
      sublabel: "Fix missed questions",
      icon: "🔁",
      iconBg: "bg-[#fee2e2] text-[#991b1b]",
      match: (p) => p.includes("/mistakes"),
    },
  ];

  const communityItems: NavItem[] = [
    {
      href: "/study-room",
      label: "Study Room",
      sublabel: "Live chat by subject & major",
      icon: "💬",
      iconBg: "bg-[#dcfce7] text-[#15803d]",
      match: (p) => p.startsWith("/study-room"),
    },
    {
      href: "/leaderboard",
      label: "Leaderboard",
      sublabel: "Daily & weekly top XP",
      icon: "🏆",
      iconBg: "bg-[#fef9c3] text-[#b45309]",
      match: (p) => p.startsWith("/leaderboard"),
    },
    {
      href: "/coaches",
      label: "Review Coaches",
      sublabel: "Ask a mentor",
      icon: "🧑‍🏫",
      iconBg: "bg-[#ede9fe] text-[#5b21b6]",
      match: (p) => p.startsWith("/coaches"),
    },
    {
      href: "/pricing",
      label: "Plans & Passes",
      sublabel: "Upgrade or add a paper",
      icon: "✨",
      iconBg: "bg-[#fef9c3] text-[#b45309]",
      match: (p) => p.startsWith("/pricing"),
    },
  ];

  if (isAdmin) {
    communityItems.push({
      href: "/admin",
      label: "Admin Control",
      sublabel: "Rooms, labels & bank",
      icon: "🛠️",
      iconBg: "bg-[#fef3c7] text-[#92400e]",
      match: (p) => p.startsWith("/admin"),
    });
  }

  const planLabel = isAdmin
    ? "Admin Pass"
    : activeSubs.length > 0
      ? `${activeSubs[0].track} Pass Active`
      : "Free Plan";

  const renderNavItem = (item: NavItem, isCollapsed: boolean) => {
    const active = item.match(pathname);
    if (isCollapsed) {
      return (
        <Link
          key={item.href}
          href={item.href}
          title={item.label}
          aria-label={item.label}
          className={`group mx-auto flex h-11 w-11 items-center justify-center rounded-2xl transition ${
            active
              ? "border-2 border-[#16a34a] border-b-[4px] bg-[#f0fdf4] shadow-sm"
              : "border border-transparent hover:bg-white/60"
          }`}
        >
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-xl border border-b-2 border-black/10 text-base transition ${
              active ? "bg-[#16a34a] text-white shadow-sm" : item.iconBg
            }`}
          >
            {item.icon}
          </span>
        </Link>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`group flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition ${
          active
            ? "border border-[#16a34a] bg-[#f0fdf4] font-extrabold text-[#15803d] shadow-sm"
            : "border border-transparent font-semibold text-[#3d5c44] hover:bg-[#f6faf4] hover:text-[#16331f]"
        }`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base transition ${
            active ? "bg-[#16a34a] text-white shadow-sm" : item.iconBg
          }`}
        >
          {item.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate leading-tight">{item.label}</div>
          {item.sublabel && (
            <div className="truncate text-[11px] font-normal text-[#5c7863]">{item.sublabel}</div>
          )}
        </div>
      </Link>
    );
  };

  const sidebarContent = (isMobileDrawer = false) => {
    const isCollapsed = collapsed && !isMobileDrawer;

    return (
      <div className="flex h-full flex-col justify-between">
        {/* Top section */}
        <div
          className={`no-scrollbar flex-1 overflow-y-auto overflow-x-hidden ${
            isCollapsed ? "px-2 pt-3 pb-3" : "px-3 pt-4 pb-4"
          }`}
        >
          {/* Brand + Collapse button */}
          {isCollapsed ? (
            <div className="mb-3 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                aria-label="Expand sidebar"
                title="Expand drawer"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d9e6d3] bg-white text-sm font-bold text-[#3d5c44] shadow-sm transition hover:border-[#16a34a] hover:text-[#16331f]"
              >
                »
              </button>
              <Link
                href="/dashboard"
                title={`${firstName}'s study desk`}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d9e6d3] bg-gradient-to-br from-[#dcfce7] via-[#f0fdf4] to-[#fef9c3] shadow-sm transition hover:border-[#16a34a]"
              >
                <LogoMark size="sm" />
              </Link>
              {activeSubs.length === 0 && !isAdmin && (
                <Link
                  href="/pricing"
                  title="Unlock Full Pass — from ₱149"
                  className="flex h-10 w-11 items-center justify-center rounded-2xl border border-[#eab308] bg-[#fffbeb] text-base shadow-sm transition hover:border-[#16a34a]"
                >
                  ✨
                </Link>
              )}
            </div>
          ) : (
            <div className="mb-4 flex items-center justify-between gap-2 px-1">
              <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
                <LogoMark size="sm" />
                <span className="truncate text-sm font-black tracking-tight text-[#16331f]">
                  Teacher Ceppee<span className="gradient-text"> Review</span>
                </span>
              </Link>
              {!isMobileDrawer ? (
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label="Collapse sidebar"
                  title="Collapse drawer"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#d9e6d3] bg-white text-xs font-bold text-[#3d5c44] hover:border-[#16a34a] hover:text-[#16331f]"
                >
                  «
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close drawer"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#d9e6d3] bg-white text-xs font-bold text-[#3d5c44]"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* User Study Desk Card */}
          {!isCollapsed && (
            <div className="mb-3 rounded-2xl border border-[#d9e6d3] bg-gradient-to-br from-[#dcfce7] via-[#f0fdf4] to-[#fef9c3] p-3.5 shadow-sm">
              <div className="flex items-center gap-3">
                <LogoMark size="sm" className="shrink-0 shadow" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-black text-[#16331f]">
                    {firstName}&apos;s study desk
                  </div>
                  <div className="mt-0.5 truncate text-[11px] font-extrabold text-[#b45309]">
                    {activeSubs.length > 0
                      ? `✓ ${activeSubs[0].track} Reviewer Active`
                      : "Ready for LET & CSE"}
                  </div>
                </div>
              </div>
              {(profile?.user_label || isAdmin) && (
                <div className="mt-2.5 flex items-center gap-1.5 border-t border-[#d9e6d3]/70 pt-2">
                  <UserBadgePill
                    label={profile?.user_label}
                    color={profile?.user_badge_color}
                    isAdmin={isAdmin}
                    size="xs"
                  />
                </div>
              )}
            </div>
          )}

          {/* Upgrade / Pass CTA Pill */}
          {!isCollapsed && activeSubs.length === 0 && !isAdmin && (
            <Link
              href="/pricing"
              className="mb-4 flex items-center justify-between rounded-xl border border-[#eab308] bg-[#fffbeb] px-3 py-2 text-xs font-extrabold text-[#b45309] shadow-sm transition hover:border-[#16a34a] hover:bg-[#f0fdf4] hover:text-[#15803d]"
            >
              <span className="flex items-center gap-2">
                <span>✨</span>
                <span>Unlock Full Pass</span>
              </span>
              <span>from ₱149 →</span>
            </Link>
          )}

          {/* Study + Community Navigation */}
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-1.5">
              {studyItems.map((item) => renderNavItem(item, true))}
              <div className="my-1 h-px w-8 bg-[#d9e6d3]" />
              {communityItems.map((item) => renderNavItem(item, true))}
            </div>
          ) : (
            <>
              <div className="mb-3">
                <div className="mb-1.5 px-2 text-[11px] font-extrabold uppercase tracking-wider text-[#5c7863]">
                  Study
                </div>
                <div className="space-y-1 rounded-2xl border border-[#d9e6d3] bg-white p-1.5 shadow-sm">
                  {studyItems.map((item) => renderNavItem(item, false))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 px-2 text-[11px] font-extrabold uppercase tracking-wider text-[#5c7863]">
                  Community &amp; Rooms
                </div>
                <div className="space-y-1 rounded-2xl border border-[#d9e6d3] bg-white p-1.5 shadow-sm">
                  {communityItems.map((item) => renderNavItem(item, false))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Bottom User Profile & Theme Bar */}
        <div
          className={`relative border-t border-[#d9e6d3] ${isCollapsed ? "bg-[#f6faf4] py-3 px-2" : "bg-white p-3"}`}
          ref={isMobileDrawer ? mobileProfileRef : desktopProfileRef}
        >
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2.5">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((o) => !o)}
                title={`${fullName} — Profile & sign out`}
                aria-label="Open profile menu"
                className="flex h-10 w-10 items-center justify-center rounded-full transition hover:opacity-90"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#16a34a] to-[#ca8a04] text-sm font-black leading-none text-white shadow-sm">
                  {initial}
                </span>
              </button>
              <ThemeToggle />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((o) => !o)}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 text-left transition hover:bg-[#f6faf4]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#16a34a] to-[#ca8a04] text-sm font-black text-white shadow-sm">
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-extrabold text-[#16331f]">{fullName}</span>
                    <span className="text-[10px] text-[#5c7863]">▾</span>
                  </div>
                  <div className="truncate text-[11px] text-[#5c7863]">Profile &amp; sign out</div>
                </div>
              </button>

              <ThemeToggle />
            </div>
          )}

          {profileMenuOpen && (
            <div
              className={`absolute z-50 rounded-2xl border border-[#d9e6d3] bg-white p-3 shadow-2xl ${
                isCollapsed
                  ? "bottom-2 left-full ml-2 w-60"
                  : "bottom-16 left-3 right-3"
              }`}
            >
              <div className="mb-2 border-b border-[#e2ece0] pb-2">
                <div className="truncate text-xs font-extrabold text-[#16331f]">{fullName}</div>
                <div className="truncate text-[11px] text-[#5c7863]">{user.email}</div>
                {(profile?.user_label || isAdmin) && (
                  <div className="mt-1.5">
                    <UserBadgePill
                      label={profile?.user_label}
                      color={profile?.user_badge_color}
                      isAdmin={isAdmin}
                      size="xs"
                    />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => handleProfileNav("/dashboard")}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-bold text-[#3d5c44] hover:bg-[#f6faf4] hover:text-[#16331f]"
                >
                  <span>🌱</span>
                  <span>My Study Desk</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleProfileNav("/study-room")}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-bold text-[#3d5c44] hover:bg-[#f6faf4] hover:text-[#16331f]"
                >
                  <span>💬</span>
                  <span>Join Study Room</span>
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleProfileNav("/admin")}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-bold text-[#b45309] hover:bg-[#fffbeb]"
                  >
                    <span>🛠️</span>
                    <span>Admin Dashboard</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={signingOut}
                  onClick={handleSignOut}
                  className="mt-1 w-full rounded-lg border border-[#fecaca] bg-[#fef2f2] px-2.5 py-2 text-left text-xs font-extrabold text-[#991b1b] hover:bg-[#fee2e2] disabled:opacity-50"
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-[#f6faf4]">
      {/* Desktop Fixed Left Sidebar */}
      <aside
        className={`hidden md:fixed md:inset-y-0 md:left-0 md:z-40 md:flex md:flex-col border-r border-[#d9e6d3] bg-[#f6faf4] transition-all duration-200 ${
          collapsed ? "md:w-[72px]" : "md:w-64"
        }`}
      >
        {sidebarContent(false)}
      </aside>

      {/* Mobile Left Drawer Overlay */}
      <div
        className={`fixed inset-0 z-50 md:hidden transition-opacity ${
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
        <aside
          className={`absolute left-0 top-0 h-full w-72 border-r border-[#d9e6d3] bg-[#f6faf4] shadow-2xl transition-transform ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidebarContent(true)}
        </aside>
      </div>

      {/* Right Main Column */}
      <div
        className={`flex min-w-0 flex-1 flex-col transition-all duration-200 ${
          collapsed ? "md:pl-[72px]" : "md:pl-64"
        }`}
      >
        {/* Top Utility Header Bar (like the LETPass reference) */}
        <header className="sticky top-0 z-30 border-b border-[#d9e6d3]/80 bg-[#f6faf4]/90 backdrop-blur-md">
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            {/* Left: Mobile Drawer Button & Quick Current Context */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation drawer"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#d9e6d3] bg-white text-[#16331f] md:hidden"
              >
                ☰
              </button>
              <Link
                href="/study-room"
                className="hidden items-center gap-1.5 rounded-full border border-[#d9e6d3] bg-white px-3 py-1 text-xs font-bold text-[#3d5c44] transition hover:border-[#16a34a] sm:inline-flex"
              >
                <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
                <span>Teacher Ceppee Study Hub</span>
              </Link>
            </div>

            {/* Right: Streak pill, Pass CTA, Study Room Popup Pill, Plan badge */}
            <div className="flex items-center gap-2">
              <Link
                href={`/review/${trackSlug}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#d9e6d3] bg-white px-3 py-1.5 text-xs font-extrabold text-[#3d5c44] transition hover:border-[#ca8a04]"
              >
                <span>🔥</span>
                <span>
                  {streakDays > 0
                    ? `${streakDays} day${streakDays === 1 ? "" : "s"} streak`
                    : "Start a streak"}
                </span>
              </Link>

              {activeSubs.length === 0 && !isAdmin && (
                <Link
                  href="/pricing"
                  className="btn-gold hidden items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-extrabold text-white sm:inline-flex"
                >
                  <span>✨</span>
                  <span>Get Exam Pass</span>
                </Link>
              )}

              {/* Study Room Chat Activity Dropdown Button */}
              <div className="relative" ref={chatPreviewRef}>
                <button
                  type="button"
                  onClick={() => setChatPreviewOpen((o) => !o)}
                  aria-label="Study Room recent messages"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#16a34a] bg-white px-3 py-1.5 text-xs font-extrabold text-[#15803d] shadow-sm transition hover:bg-[#f0fdf4]"
                >
                  <span>💬</span>
                  <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
                  <span>Study Room</span>
                </button>

                {chatPreviewOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-[#d9e6d3] bg-white p-4 shadow-2xl z-50">
                    <div className="mb-3 flex items-center justify-between border-b border-[#e2ece0] pb-2.5">
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-black text-[#16331f]">
                          <span>💬</span>
                          <span>Study Room</span>
                        </div>
                        <div className="text-[11px] text-[#5c7863]">
                          Chat with fellow LET &amp; CSE reviewees
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[10px] font-extrabold text-[#15803d]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                        Live
                      </span>
                    </div>

                    <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                      {recentChats.length === 0 ? (
                        <p className="py-6 text-center text-xs text-[#5c7863]">
                          No messages yet. Be the first to say hello in the Study Room!
                        </p>
                      ) : (
                        recentChats.map((msg) => (
                          <Link
                            key={msg.id}
                            href={`/study-room?room=${encodeURIComponent(msg.room_slug)}`}
                            className="block rounded-xl border border-[#e2ece0] bg-[#f6faf4] p-2.5 transition hover:border-[#16a34a]"
                          >
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#16a34a] text-[10px] font-black text-white">
                                  {(msg.display_name[0] || "K").toUpperCase()}
                                </span>
                                <span className="truncate text-xs font-extrabold text-[#16331f]">
                                  {msg.display_name}
                                </span>
                                <UserBadgePill
                                  label={msg.user_label}
                                  color={msg.user_badge_color}
                                  isAdmin={msg.is_admin}
                                  size="xs"
                                />
                              </div>
                              <span className="shrink-0 text-[10px] font-semibold text-[#94a896]">
                                {relativeTime(msg.created_at)}
                              </span>
                            </div>
                            <p className="line-clamp-2 text-xs text-[#3d5c44]">{msg.body}</p>
                            <div className="mt-1 text-[10px] font-bold text-[#b45309]">
                              in {msg.room_title}
                            </div>
                          </Link>
                        ))
                      )}
                    </div>

                    <Link
                      href="/study-room"
                      className="btn-primary mt-3 flex w-full items-center justify-center py-2.5 text-xs font-extrabold"
                    >
                      → Enter the Study Room
                    </Link>
                  </div>
                )}
              </div>

              <span className="hidden rounded-full border border-[#d9e6d3] bg-white px-3 py-1.5 text-xs font-extrabold text-[#3d5c44] sm:inline-flex">
                {planLabel}
              </span>
            </div>
          </div>
        </header>

        {/* Main Workspace Content */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
