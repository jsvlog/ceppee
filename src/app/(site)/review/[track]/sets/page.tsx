import { redirect } from "next/navigation";
import { notFound } from "next/navigation";

const TRACKS = new Set(["cse", "let"]);

/**
 * The standalone set catalog is gone: every set now lives on the track's campaign
 * map (/review/<track> → "Campaign Map"), grouped into regions with cleared /
 * current / locked state, so a second list of the same 202 papers was two places
 * to keep in sync and an extra click to get anywhere.
 *
 * This route stays as a permanent entry point for old links and bookmarks.
 */
export default async function SetPickerRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ track: string }>;
  searchParams: Promise<{ level?: string; major?: string }>;
}) {
  const [{ track }, sp] = await Promise.all([params, searchParams]);
  if (!TRACKS.has(track)) notFound();

  const q = new URLSearchParams();
  if (sp.level) q.set("level", sp.level);
  if (sp.major) q.set("major", sp.major);
  const qs = q.toString();
  redirect(`/review/${track}${qs ? `?${qs}` : ""}`);
}
