import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AppSidebar from "@/components/AppSidebar";
import { getUserContext, getRecentStudyChat, getRecentTrackAttempts } from "@/lib/queries";
import { computePlayerStats } from "@/lib/game";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, isAdmin, subs } = await getUserContext();

  if (user) {
    const [recentChats, letAttempts] = await Promise.all([
      getRecentStudyChat(5),
      getRecentTrackAttempts(user.id, "LET"),
    ]);
    const player = computePlayerStats(letAttempts, 75);

    return (
      <AppSidebar
        user={user}
        profile={profile}
        isAdmin={isAdmin}
        subs={subs}
        recentChats={recentChats}
        streakDays={player.streakDays}
      >
        {children}
      </AppSidebar>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f6faf4]">
      <Navbar user={null} isAdmin={false} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
