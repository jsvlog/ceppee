import Image from "next/image";

const SIZES = {
  sm: { box: "h-9 w-9", ring: "p-[2px]" },
  md: { box: "h-11 w-11", ring: "p-[2px]" },
  lg: { box: "h-14 w-14", ring: "p-[3px]" },
  xl: { box: "h-36 w-36", ring: "p-1" },
} as const;

/**
 * The Teacher Ceppee avatar: the brand photo inside a green→gold ring.
 * To change the artwork just replace public/logo.jpg — nothing else to edit.
 */
export default function LogoMark({
  size = "sm",
  className = "",
  shadow = true,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  shadow?: boolean;
}) {
  const s = SIZES[size];
  return (
    <span
      className={`inline-flex ${s.box} ${s.ring} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#16a34a] to-[#d4af37] ${shadow ? "shadow-md" : ""} ${className}`}
    >
      <Image
        src="/logo.jpg"
        alt="Teacher Ceppee"
        width={320}
        height={320}
        priority
        className="h-full w-full rounded-full object-cover"
      />
    </span>
  );
}
