import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getBankStats,
  getRecentTrackAttempts,
  getSubjectProgress,
  getUserContext,
  hasActiveSub,
} from "@/lib/queries";
import { levelsFor, specializationsFor } from "@/lib/exam";
import TrackGameHub from "@/components/study/TrackGameHub";
import type { Exam, Level, SetCatalogRow, Track } from "@/lib/types";

export const dynamic = "force-dynamic";

const TRACKS: Record<string, Track> = { cse: "CSE", let: "LET" };

export async function generateMetadata({ params }: { params: Promise<{ track: string }> }): Promise<Metadata> {
  const { track } = await params;
  const t = TRACKS[track];
  return { title: t ? `${t} Review` : "Review" };
}

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ track: string }>;
  searchParams: Promise<{ level?: string; major?: string }>;
}) {
  const [{ track }, sp] = await Promise.all([params, searchParams]);
  const trackKey = TRACKS[track];
  if (!trackKey) notFound();

  const levelOptions = levelsFor(trackKey);
  const levelKey = (levelOptions.find((l) => l.key === sp.level)?.key ?? levelOptions[0].key) as Level;
  const majorOptions = specializationsFor(levelKey);
  const major = trackKey === "LET" && majorOptions.includes(sp.major ?? "") ? (sp.major as string) : null;

  const supabase = await createClient();

  // ONE parallel wave. This page used to await five queries in series
  // (user -> bank stats -> topics -> every lesson row -> exams), which is what
  // made a hub click feel like a page reload.
  //
  // `set_catalog` is asked for the WHOLE track (no level / majorship filters) so
  // switching level, majorship or subject afterwards is pure client state — no
  // server round-trip at all.
  const [userCtx, stats, catalogRes, examsRes] = await Promise.all([
    getUserContext(),
    getBankStats(trackKey),
    supabase.rpc("set_catalog", { p_track: trackKey, p_level: null, p_specialization: null }),
    supabase.from("exams").select("*").eq("track", trackKey).eq("is_active", true).order("order_index"),
  ]);

  const { user, subs, isAdmin } = userCtx;
  const subscribed = isAdmin || hasActiveSub(subs, trackKey);

  const [mastery, attempts] = user
    ? await Promise.all([getSubjectProgress(trackKey), getRecentTrackAttempts(user.id, trackKey)])
    : [[], []];

  return (
    <TrackGameHub
      trackKey={trackKey}
      trackSlug={track}
      initialLevel={levelKey}
      initialMajor={major}
      subscribed={subscribed}
      isSignedIn={Boolean(user)}
      stats={stats}
      allSets={(catalogRes.data as SetCatalogRow[] | null) ?? []}
      attempts={attempts}
      mastery={mastery}
      exams={(examsRes.data as Exam[] | null) ?? []}
    />
  );
}
