import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserContext, getStudyRooms, getStudyRoomMessages } from "@/lib/queries";
import StudyRoomClient from "./StudyRoomClient";

export const metadata: Metadata = {
  title: "Study Room — Live Chat by Subject & Major",
  description:
    "Join the Teacher Ceppee Study Room to chat with fellow LET and CSE reviewees by subject, majorship, or exam.",
};

export const dynamic = "force-dynamic";

export default async function StudyRoomPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const wantedRoom = Array.isArray(sp.room) ? sp.room[0] : sp.room;

  const [userCtx, rooms] = await Promise.all([getUserContext(), getStudyRooms()]);
  const { user, profile, isAdmin } = userCtx;

  if (!user) {
    redirect("/login?next=/study-room");
  }

  const activeRoom =
    rooms.find((r) => r.slug === wantedRoom) ??
    rooms.find((r) => r.slug === "all-majors") ??
    rooms[0] ??
    null;

  const initialMessages = activeRoom ? await getStudyRoomMessages(activeRoom.id, 80) : [];

  const fullName =
    profile?.full_name?.trim() ||
    user.email?.split("@")[0] ||
    "Ka-Ceppee";

  return (
    <StudyRoomClient
      rooms={rooms}
      initialRoomSlug={activeRoom?.slug ?? ""}
      initialMessages={initialMessages}
      currentUser={{
        id: user.id,
        fullName,
        isAdmin,
        userLabel: profile?.user_label ?? null,
        userBadgeColor: profile?.user_badge_color ?? null,
      }}
    />
  );
}
