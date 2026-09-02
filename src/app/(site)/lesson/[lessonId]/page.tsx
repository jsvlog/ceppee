import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserContext, hasActiveSub } from "@/lib/queries";
import type { Lesson, Topic, Track } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Lesson" };

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;

  const { user, subs } = await getUserContext();

  const supabase = await createClient();
  const { data: lesson } = await supabase.from("lessons").select("*").eq("id", lessonId).maybeSingle();

  // Not found OR blocked by RLS (non-subscriber on paid lesson) → same page
  if (!lesson) {
    return <LockedOrMissing user={!!user} />;
  }
  const l = lesson as Lesson;

  const { data: topic } = await supabase.from("topics").select("*").eq("id", l.topic_id).maybeSingle();
  const t = topic as Topic | null;
  const track = (t?.track || "CSE") as Track;
  const subscribed = hasActiveSub(subs, track);
  if (l.is_free || subscribed) {
    // readable
  } else {
    return <LockedOrMissing user={!!user} />;
  }

  // Sibling lessons for prev/next navigation
  const { data: siblings } = await supabase
    .from("lessons")
    .select("id, title, order_index")
    .eq("topic_id", l.topic_id)
    .eq("is_published", true)
    .order("order_index");
  const list = siblings ?? [];
  const idx = list.findIndex((s) => s.id === l.id);
  const prev = idx > 0 ? list[idx - 1] : null;
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href={t ? `/review/${track.toLowerCase()}/topic/${t.id}` : "/dashboard"} className="mb-6 inline-block text-sm font-semibold text-[#5c7863] hover:text-[#16331f]">
        ← Back to {t?.title || "topics"}
      </Link>

      <article className="card p-8 sm:p-10">
        <h1 className="mb-6 text-3xl font-black text-[#16331f]">{l.title}</h1>

        {l.video_url && (
          <div className="mb-8 aspect-video w-full overflow-hidden rounded-2xl shadow-md">
            <iframe
              src={embedUrl(l.video_url)}
              title={l.title}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        <div className="lesson-content" dangerouslySetInnerHTML={{ __html: l.content }} />
      </article>

      <div className="mt-8 flex items-center justify-between gap-4">
        {prev ? (
          <Link href={`/lesson/${prev.id}`} className="card card-hover px-5 py-3 text-sm font-semibold text-[#3d5c44]">
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/lesson/${next.id}`} className="card card-hover px-5 py-3 text-right text-sm font-semibold text-[#3d5c44]">
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

function LockedOrMissing({ user }: { user: boolean }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="mb-4 text-6xl">🔒</div>
      <h1 className="mb-2 text-2xl font-black text-[#16331f]">
        {user ? "This lesson is still locked" : "Log in first"}
      </h1>
      <p className="mb-6 text-sm text-[#5c7863]">
        {user
          ? "This lesson is for subscribers. Subscribe from your dashboard to unlock it."
          : "Log in first to access the lessons."}
      </p>
      <div className="flex justify-center gap-3">
        {user ? (
          <Link href="/dashboard" className="btn-primary px-6 py-3 text-sm">
            Subscribe from Dashboard
          </Link>
        ) : (
          <Link href="/login?next=/dashboard" className="btn-primary px-6 py-3 text-sm">
            Log in
          </Link>
        )}
      </div>
    </div>
  );
}

function embedUrl(url: string): string {
  // YouTube watch URLs → embed
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  return url;
}
