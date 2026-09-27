"use client";

import { useRouter } from "next/navigation";

export default function MajorshipPicker({
  current,
  options,
  basePath,
  level,
}: {
  current: string | null;
  options: string[];
  /** e.g. "/review/let" — the picker builds the ?level=&major= URL itself. */
  basePath: string;
  level: string;
}) {
  const router = useRouter();

  return (
    <label className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4">
      <span className="text-sm font-bold text-[#16331f]">📚 Your majorship (Specialization)</span>
      <select
        value={current ?? ""}
        onChange={(e) => {
          if (!e.target.value) return;
          router.push(`${basePath}?level=${encodeURIComponent(level)}&major=${encodeURIComponent(e.target.value)}`);
        }}
        className="input-warm flex-1"
      >
        <option value="">— Choose your major —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <span className="text-xs text-[#5c7863]">
        {current ? "Used for your Specialization mock and drills." : "Needed before the Specialization subtest."}
      </span>
    </label>
  );
}