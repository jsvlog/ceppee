import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasActiveSub } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Book = {
  id: string;
  title: string;
  slug: string;
  subject: string;
  specialization: string | null;
  level: string;
  description: string | null;
  word_count: number;
  section_count: number;
  part_count: number;
};

type TocRow = {
  part_no: number;
  part_title: string;
  section_no: number;
  id: string;
  title: string;
  word_count: number;
  is_free: boolean;
  order_index: number;
};

export async function generateMetadata({ params }: { params: Promise<{ book: string }> }): Promise<Metadata> {
  const { book } = await params;
  return { title: `${book.replace(/-/g, " ")} — reading notes` };
}

function readTime(words: number) {
  const m = Math.max(1, Math.round(words / 220));
  return `${m} min`;
}

export default async function BookPage({ params }: { params: Promise<{ book: string }> }) {
  const { book: slug } = await params;
  const supabase = await createClient();

  // One parallel wave: identity, the book, its table of contents, what the caller
  // may open, and this reader's finished sections. It used to be five serial
  // round-trips before the first byte of HTML.
  const [userCtx, bookRes, tocRes, accessRes, doneRes] = await Promise.all([
    getUserContext(),
    supabase.from("reading_books").select("*").eq("slug", slug).maybeSingle(),
    supabase.rpc("reading_toc", { p_slug: slug }),
    supabase.rpc("reading_access", { p_slug: slug }),
    supabase.from("reading_progress").select("section_id, completed_at").not("completed_at", "is", null),
  ]);

  const { subs, isAdmin } = userCtx;
  const subscribed = isAdmin || hasActiveSub(subs, "LET");

  if (!bookRes.data) notFound();
  const book = bookRes.data as Book;
  const tocData = tocRes.data;
  const accessData = accessRes.data;
  const doneRows = doneRes.data;
  const toc = (tocData ?? []) as TocRow[];
  const access = (accessData?.[0] ?? { total: toc.length, readable: toc.length, completed: 0 }) as {
    total: number;
    readable: number;
    completed: number;
  };

  // completed sections of this book, to tick them off in the list
  const done = new Set((doneRows ?? []).map((r) => r.section_id as string));

  const parts: { no: number; title: string; rows: TocRow[] }[] = [];
  for (const row of toc) {
    let part = parts.find((p) => p.no === row.part_no);
    if (!part) {
      part = { no: row.part_no, title: row.part_title || `Part ${row.part_no}`, rows: [] };
      parts.push(part);
    }
    part.rows.push(row);
  }

  const pct = access.total ? Math.round((access.completed / access.total) * 100) : 0;
  const firstLocked = toc.find((r) => !r.is_free);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <Link href="/read" className="mb-6 inline-block text-sm font-semibold text-[#5c7863] hover:text-[#16331f]">
        ← All reading materials
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#16331f] sm:text-4xl">{book.title}</h1>
        <p className="mt-2 text-sm text-[#5c7863]">
          {book.section_count} sections · {book.part_count} parts ·{" "}
          {Math.round(book.word_count / 1000).toLocaleString()}k words · about{" "}
          {Math.round(book.word_count / 250 / 60)} hours
        </p>
        {book.description && <p className="mt-2 text-sm text-[#4a6553]">{book.description}</p>}
      </div>

      <div className="card mb-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-bold text-[#16331f]">
              {access.completed} of {access.total} sections read
            </span>
            <span className="text-[#5c7863]">{pct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#e7efe1]">
            <div className="h-full rounded-full bg-gradient-to-r from-[#15803d] to-[#d4af37]" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {toc.length > 0 && (
          <Link
            href={`/read/${book.slug}/${(toc.find((r) => !done.has(r.id)) ?? toc[toc.length - 1]).order_index}`}
            className="btn-primary whitespace-nowrap px-5 py-2.5 text-center text-sm"
          >
            {access.completed > 0 ? "Continue reading" : "Start reading"}
          </Link>
        )}
      </div>

      {!subscribed && access.readable < access.total && (
        <div className="mb-8 rounded-2xl border border-[#f3e3b8] bg-[#fffdf4] p-4 text-sm text-[#6b5a20]">
          You can read the <strong>first section</strong> of this book free. The remaining{" "}
          {(access.total - access.readable).toLocaleString()} sections open with a LET subscription.
          {firstLocked && (
            <Link href="/pricing" className="ml-2 font-bold text-[#92400e] underline">
              See plans
            </Link>
          )}
        </div>
      )}

      <div className="space-y-8">
        {parts.map((part) => (
          <section key={part.no}>
            <h2 className="mb-3 flex items-baseline gap-3 text-sm font-black uppercase tracking-wide text-[#4a6553]">
              <span className="rounded-md bg-[#f1f7ec] px-2 py-0.5 text-[11px] text-[#166534]">
                Part {part.no}
              </span>
              <span className="font-semibold normal-case tracking-normal text-[#16331f]">{part.title}</span>
            </h2>
            <ol className="card divide-y divide-[#eef4ea] overflow-hidden">
              {part.rows.map((row) => {
                const locked = !row.is_free && !subscribed;
                const read = done.has(row.id);
                return (
                  <li key={row.id}>
                    <Link
                      href={`/read/${book.slug}/${row.order_index}`}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-[#f6faf4]"
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          read ? "bg-[#15803d] text-white" : "bg-[#f1f7ec] text-[#5c7863]"
                        }`}
                      >
                        {read ? "✓" : row.section_no}
                      </span>
                      <span className={`flex-1 text-sm ${locked ? "text-[#8aa08f]" : "font-medium text-[#16331f]"}`}>
                        {row.title}
                        {row.is_free && (
                          <span className="ml-2 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-bold uppercase text-[#166534]">
                            free
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-[#8aa08f]">{readTime(row.word_count)}</span>
                      {locked && <span className="shrink-0 text-xs">🔒</span>}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
