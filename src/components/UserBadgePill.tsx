import type { ReactNode } from "react";

export type BadgeColor = "green" | "gold" | "blue" | "purple" | "rose";

const BADGE_STYLES: Record<BadgeColor, string> = {
  green: "bg-[#dcfce7] text-[#15803d] border border-[#bbf7d0]",
  gold: "bg-[#fef9c3] text-[#b45309] border border-[#fde68a]",
  blue: "bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]",
  purple: "bg-[#ede9fe] text-[#5b21b6] border border-[#ddd6fe]",
  rose: "bg-[#fee2e2] text-[#991b1b] border border-[#fecaca]",
};

export const BADGE_PRESETS: { label: string; color: BadgeColor; icon: string }[] = [
  { label: "Admin", color: "gold", icon: "👑" },
  { label: "Coach", color: "green", icon: "🧑‍🏫" },
  { label: "Topnotcher", color: "gold", icon: "🏆" },
  { label: "LPT Passer", color: "green", icon: "🎓" },
  { label: "CSE Passer", color: "blue", icon: "🏛️" },
  { label: "Streak Leader", color: "rose", icon: "🔥" },
  { label: "Study Buddy", color: "purple", icon: "⭐" },
];

export function resolveBadgeColor(label: string | null | undefined, color?: string | null): BadgeColor {
  if (color && color in BADGE_STYLES) return color as BadgeColor;
  const l = (label || "").toLowerCase();
  if (l.includes("admin") || l.includes("topnotcher") || l.includes("gold") || l.includes("champion")) return "gold";
  if (l.includes("coach") || l.includes("mentor") || l.includes("lpt") || l.includes("teacher")) return "green";
  if (l.includes("cse") || l.includes("civil") || l.includes("scholar")) return "blue";
  if (l.includes("streak") || l.includes("fire") || l.includes("mvp")) return "rose";
  return "purple";
}

export function resolveBadgeIcon(label: string | null | undefined, isAdmin?: boolean): string {
  const l = (label || "").toLowerCase();
  if (l.includes("coach") || l.includes("mentor") || l.includes("teacher")) return "🧑‍🏫";
  if (l.includes("admin") || isAdmin) return "👑";
  if (l.includes("topnotcher") || l.includes("champion") || l.includes("rank")) return "🏆";
  if (l.includes("lpt") || l.includes("passer") || l.includes("grad")) return "🎓";
  if (l.includes("cse") || l.includes("civil")) return "🏛️";
  if (l.includes("streak") || l.includes("fire")) return "🔥";
  return "✦";
}

export default function UserBadgePill({
  label,
  color,
  isAdmin,
  size = "xs",
}: {
  label?: string | null;
  color?: string | null;
  isAdmin?: boolean;
  size?: "xs" | "sm";
}): ReactNode {
  const text = (label && label.trim()) || (isAdmin ? "Admin" : null);
  if (!text) return null;

  const resolvedColor = resolveBadgeColor(text, color);
  const icon = resolveBadgeIcon(text, isAdmin);
  const cls = BADGE_STYLES[resolvedColor];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-extrabold uppercase tracking-wide ${cls} ${
        size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[10px]"
      }`}
    >
      <span>{icon}</span>
      <span>{text}</span>
    </span>
  );
}
