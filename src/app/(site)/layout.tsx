import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getUserContext } from "@/lib/queries";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = await getUserContext();

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f8ff]">
      <Navbar user={user} isAdmin={isAdmin} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
