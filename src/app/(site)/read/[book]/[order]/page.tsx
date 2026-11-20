import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasActiveSub } from "@/lib/queries";
import ReaderFrame from "@/components/ReaderFrame";

export const dynamic = "force-dynamic";

type Section = {
  id: string;
  book_id: string;
  part_no: number;
  part_title: string;
  section_no: number;
  title: string;
  html: string;
  word_count: number;
  order_index: number;
  is_free: boolean;
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

type Book = { id: string; title: string; slug: string; section_count: number; track: string };

export async function generateMetadata({ params }: { params: Promise<{ book: string; order: string }> }): Promise<Metadata> {
  const { book, order } = await params;
  return { title: `${book.replace(/-/g, " ")} · section ${order}` };
}

/** Save reading progress. Called from the reader form. */
async function saveProgress(formData: FormData) {
  "use server";
  const sectionId = String(formData.get("section_id") ?? "");
  const bookSlug = String(formData.get("book") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!sectionId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const now = new Date().toISOString();
    await supabase.from("reading_progress").upsert(
      { user_id: user.id, section_id: sectionId, completed_at: now, last_read_at: now },
      { onConflict: "user_id,section_id" }
    );
  }
  redirect(next ? `/read/${bookSlug}/${next}` : `/read/${bookSlug}`);
}

function readMinutes(words: number) {
  return Math.max(1, Math.round(words / 220));
}

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ book: string; order: string }>;
}) {
  const { book: slug, order } = await params;
  const orderIndex = Number(order);
  if (!Number.isFinite(orderIndex)) notFound();

  const supabase = await createClient();
  const [userCtx, bookRes, tocRes] = await Promise.all([
    getUserContext(),
    supabase.from("reading_books").select("id, title, slug, section_count, track").eq("slug", slug).maybeSingle(),
    supabase.rpc("reading_toc", { p_slug: slug }),
  ]);

  const { user, subs, isAdmin } = userCtx;
  const subscribed = isAdmin || hasActiveSub(subs, "LET");

  if (!bookRes.data) notFound();
  const book = bookRes.data as Book;

  // RLS decides: a locked section simply is not returned.
  const { data: secRow } = await supabase
    .from("reading_sections")
    .select("*")
    .eq("book_id", book.id)
    .eq("order_index", orderIndex)
    .maybeSingle();

  const tocData = tocRes.data;
  const toc = (tocData ?? []) as TocRow[];
  const current = toc.findIndex((r) => r.order_index === orderIndex);
  const prev = current > 0 ? toc[current - 1] : null;
  const next = current >= 0 && current < toc.length - 1 ? toc[current + 1] : null;
  const meta = toc[current];

  if (!secRow) {
    // a section that does not exist at all is a 404; one that exists but is locked
    // deserves the paywall panel instead
    const exists = toc.some((r) => r.order_index === orderIndex);
    if (!exists) notFound();
    const free = toc.find((r) => r.is_free);
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <div className="mb-4 text-6xl">🔒</div>
        <h1 className="mb-2 text-2xl font-black text-[#16331f]">
          {user ? "This section is for subscribers" : "Log in to read"}
        </h1>
        <p className="mb-6 text-sm text-[#5c7863]">
          {user
            ? `${book.title} has ${book.section_count} sections. The first one is free — the rest come with a LET subscription.`
            : "Log in to keep your place. The first section of every book is free."}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {free && (
            <Link href={`/read/${slug}/${free.order_index}`} className="btn-primary px-6 py-3 text-sm">
              Read the free section
            </Link>
          )}
          <Link
            href={user ? "/pricing" : `/login?next=/read/${slug}/${order}`}
            className="rounded-xl border border-[#d9e6d3] px-6 py-3 text-sm font-semibold text-[#3d5c44]"
          >
            {user ? "See plans" : "Log in"}
          </Link>
        </div>
      </div>
    );
  }

  const section = secRow as Section;
  // remember where the reader stopped (best effort; never blocks the page)
  if (user) {
    try {
      await supabase.from("reading_progress").upsert(
        { user_id: user.id, section_id: section.id, last_read_at: new Date().toISOString() },
        { onConflict: "user_id,section_id" }
      );
    } catch {
      /* progress is a nicety, not a requirement */
    }
  }

  const partRows = toc.filter((r) => r.part_no === section.part_no);
  const position = toc.filter((r) => r.part_no === section.part_no && r.order_index <= orderIndex).length;
  const progress = toc.length ? Math.round((Math.max(0, current) / toc.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/read/${slug}`} className="text-sm font-semibold text-[#5c7863] hover:text-[#16331f]">
          ← {book.title}
        </Link>
        <span className="text-xs text-[#8aa08f]">
          Section {current + 1} of {toc.length} · {readMinutes(meta?.word_count ?? section.word_count)} min
        </span>
      </div>

      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-[#e7efe1]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#15803d] to-[#d4af37]" style={{ width: `${progress}%` }} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="order-2 lg:order-1">
          <div className="lg:sticky lg:top-24">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[#8aa08f]">
              Part {section.part_no} · {partRows.length} sections
            </p>
            <p className="mb-3 text-sm font-bold text-[#16331f]">{section.part_title || `Part ${section.part_no}`}</p>
            <nav className="max-h-[60vh] space-y-0.5 overflow-y-auto pr-1">
              {partRows.map((r) => {
                const active = r.order_index === orderIndex;
                return (
                  <Link
                    key={r.id}
                    href={`/read/${slug}/${r.order_index}`}
                    className={`block rounded-lg px-3 py-2 text-[13px] leading-snug transition ${
                      active
                        ? "bg-[#15803d] font-semibold text-white"
                        : "text-[#4a6553] hover:bg-[#f1f7ec] hover:text-[#16331f]"
                    }`}
                  >
                    {r.section_no}. {r.title}
                  </Link>
                );
              })}
            </nav>
            <p className="mt-4 text-[11px] text-[#8aa08f]">
              {subscribed ? "Full book unlocked" : "Free sample · rest needs a subscription"}
            </p>
          </div>
        </aside>

        <article className="order-1 min-w-0 lg:order-2">
          <div className="card p-6 sm:p-9">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#b45309]">
              {section.part_title || `Part ${section.part_no}`} · section {position}
            </p>
            <h1 className="mb-6 text-2xl font-black leading-tight text-[#16331f] sm:text-3xl">{section.title}</h1>

            <ReaderFrame>
              <div
                className="read-content"
                dangerouslySetInnerHTML={{ __html: section.html }}
              />
            </ReaderFrame>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {prev ? (
              <Link href={`/read/${slug}/${prev.order_index}`} className="card card-hover px-5 py-3 text-sm font-semibold text-[#3d5c44]">
                ← {prev.title}
              </Link>
            ) : (
              <span />
            )}

            <form action={saveProgress}>
              <input type="hidden" name="section_id" value={section.id} />
              <input type="hidden" name="book" value={slug} />
              <input type="hidden" name="next" value={next?.order_index ?? ""} />
              <button type="submit" className="btn-primary w-full px-6 py-3 text-sm sm:w-auto">
                {next ? "Mark as read and continue →" : "Finish this book ✓"}
              </button>
            </form>

            {next ? (
              <Link href={`/read/${slug}/${next.order_index}`} className="hidden px-5 py-3 text-right text-sm font-semibold text-[#3d5c44] sm:block">
                {next.title} →
              </Link>
            ) : (
              <span />
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
