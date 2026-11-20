"use client";

import { useState } from "react";

export default function ReaderFrame({ children }: { children: React.ReactNode }) {
  const [size, setSize] = useState<"sm" | "md" | "lg">("md");

  return (
    <>
      <div className="mb-3 flex items-center justify-end gap-1.5 text-[11px] font-bold text-[#8aa08f]">
        <span className="mr-1 uppercase tracking-wide">Text</span>
        {([
          ["sm", "A−"],
          ["md", "A"],
          ["lg", "A+"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSize(key)}
            className={`rounded-lg border px-2.5 py-1 transition ${
              size === key
                ? "border-[#15803d] bg-[#15803d] text-white"
                : "border-[#d9e6d3] bg-white text-[#4a6553] hover:border-[#15803d]"
            }`}
            aria-pressed={size === key}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="reader" data-size={size}>
        {children}
      </div>
    </>
  );
}
