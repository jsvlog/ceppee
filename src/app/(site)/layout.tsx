import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getUserContext } from "@/lib/queries";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = await getUserContext();

  return (
    <div className="flex min-h-screen flex-col bg-[#f6faf4]">
      <Navbar user={user} isAdmin={isAdmin} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
