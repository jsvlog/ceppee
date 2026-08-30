import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getUserContext, hasActiveSub } from "@/lib/queries";
import type { Topic, Track } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Topic" };

export default async function TopicPage({
  params,
}: {
  params: Promise<{ track: string; topicId: string }>;
}) {
  const { track, topicId } = await params;
  if (!["cse", "let"].includes(track)) notFound();

  const { subs } = await getUserContext();
  const subscribed = hasActiveSub(subs, track.toUpperCase() as Track);

  const supabase = await createClient();
  const { data: topic } = await supabase
    .from("topics")
    .select("*")
    .eq("id", topicId)
    .eq("track", track.toUpperCase())
    .maybeSingle();
  if (!topic) notFound();
  const t = topic as Topic;

  // Metadata list via admin (content itself is RLS-gated on the lesson page)
  const admin = getAdminClient();
  const { data: lessonRows } = await admin
    .from("lessons")
    .select("id, title, is_free, order_index")
    .eq("topic_id", topicId)
    .eq("is_published", true)
    .order("order_index");
  const lessons = (lessonRows as Array<{ id: string; title: string; is_free: boolean; order_index: number }> | null) ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <Link href={`/review/${track}`} className="mb-6 inline-block text-sm font-semibold text-[#5a6d91] hover:text-[#142a56]">
        ← Back to {track.toUpperCase()} Review
      </Link>

      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-black text-[#142a56]">{t.title}</h1>
        {t.description && <p className="text-[#5a6d91]">{t.description}</p>}
      </div>

      <div className="space-y-3">
        {(lessons ?? []).map((l, i) => {
          const unlocked = subscribed || l.is_free;
          return unlocked ? (
            <Link
              key={l.id}
              href={`/lesson/${l.id}`}
              className="card card-hover flex items-center justify-between gap-4 p-5"
            >
              <div className="flex items-center gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#e0f2fe] to-[#bae6fd] font-bold text-[#0284c7]">
                  {i + 1}
                </span>
                <div>
                  <div className="font-bold text-[#142a56]">{l.title}</div>
                  {l.is_free && <span className="text-xs font-semibold text-[#16a34a]">🎁 Free preview</span>}
                </div>
              </div>
              <span className="text-sm font-bold text-[#38bdf8]">Start →</span>
            </Link>
          ) : (
            <div key={l.id} className="card flex items-center justify-between gap-4 bg-[#eef2f7] p-5 opacity-80">
              <div className="flex items-center gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#dbe7f8] text-[#93a4c0]">
                  🔒
                </span>
                <div>
                  <div className="font-bold text-[#5a6d91]">{l.title}</div>
                  <div className="text-xs text-[#93a4c0]">Subscribe to unlock</div>
                </div>
              </div>
              <Link
                href="/dashboard"
                className="rounded-xl bg-gradient-to-br from-[#0ea5e9] to-[#38bdf8] px-4 py-2 text-xs font-bold text-white shadow"
              >
                Unlock
              </Link>
            </div>
          );
        })}
      </div>

      {(lessons ?? []).length === 0 && (
        <div className="card p-8 text-center text-sm text-[#5a6d91]">
          Wala pang lessons sa topic na ito — malapit na!
        </div>
      )}
    </div>
  );
}
