import Link from "next/link";

export function LockedCard({
  title,
  msg,
  backHref,
  backLabel,
  loginHref,
}: {
  title: string;
  msg: string;
  backHref: string;
  backLabel: string;
  loginHref: string;
}) {
  return (
    <div className="card relative overflow-hidden p-8 text-center sm:p-10">
      <div className="mb-4 text-5xl">🔒</div>
      <h1 className="mb-2 text-2xl font-black text-[#16331f]">{title}</h1>
      <p className="mx-auto mb-6 max-w-md text-sm text-[#5c7863]">{msg}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href={loginHref} className="btn-primary px-6 py-3 text-sm">
          Subscribe to unlock
        </Link>
        <Link
          href={backHref}
          className="rounded-xl border border-[#d9e6d3] bg-white px-6 py-3 text-sm font-semibold text-[#3d5c44]"
        >
          ← {backLabel}
        </Link>
      </div>
    </div>
  );
}

export function EmptyBank({ what, backHref, backLabel }: { what: string; backHref: string; backLabel: string }) {
  return (
    <div className="card border-[#fde68a] bg-[#fffbeb] p-8 text-center">
      <div className="mb-3 text-4xl">🧠</div>
      <h1 className="mb-2 text-xl font-black text-[#16331f]">No {what} yet</h1>
      <p className="mx-auto mb-6 max-w-md text-sm text-[#b45309]">
        The question bank is still being uploaded. As soon as items land for this section, this will fill up
        automatically — nothing to do on your side.
      </p>
      <Link href={backHref} className="rounded-xl border border-[#d9e6d3] bg-white px-6 py-3 text-sm font-semibold text-[#3d5c44]">
        ← {backLabel}
      </Link>
    </div>
  );
}

export function RunnerShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">{children}</div>;
}