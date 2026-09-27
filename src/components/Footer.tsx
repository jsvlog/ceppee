import Link from "next/link";
import LogoMark from "@/components/LogoMark";

export default function Footer() {
  return (
    <footer className="border-t border-[#d9e6d3] bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="mb-3 flex items-center gap-2.5">
              <LogoMark size="sm" shadow={false} />
              <span className="text-lg font-extrabold text-[#16331f]">
                Teacher Ceppee<span className="gradient-text"> Review</span>
              </span>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-[#5c7863]">
              Your review buddy for the Civil Service Exam and Licensure Examination for Teachers.
              Lessons, practice drills, and full mock exams — made by Teacher Ceppee.
            </p>
            <a
              href="https://www.facebook.com/teacherceppee"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1877f2]/10 px-4 py-2 text-sm font-semibold text-[#1877f2] transition hover:bg-[#1877f2]/20"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Follow Teacher Ceppee
            </a>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#5c7863]">Review</h4>
            <ul className="space-y-2 text-sm text-[#3d5c44]">
              <li><Link href="/review/cse" className="hover:text-[#15803d]">CSE Review</Link></li>
              <li><Link href="/review/let" className="hover:text-[#ca8a04]">LET Review</Link></li>
              <li><Link href="/pricing" className="hover:text-[#16331f]">Pricing</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#5c7863]">Support</h4>
            <ul className="space-y-2 text-sm text-[#3d5c44]">
              <li><Link href="/#faq" className="hover:text-[#16331f]">FAQ</Link></li>
              <li><a href="https://m.me/teacherceppee" target="_blank" rel="noopener noreferrer" className="hover:text-[#16331f]">Messenger</a></li>
              <li><Link href="/login" className="hover:text-[#16331f]">Log in</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-[#d9e6d3] pt-6 text-center text-xs text-[#94a896]">
          © {new Date().getFullYear()} Teacher Ceppee Review · Made with ☀️ in the Philippines
        </div>
      </div>
    </footer>
  );
}
