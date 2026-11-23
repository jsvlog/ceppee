import type { Metadata } from "next";
import "./globals.css";
import { THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.teacherceppee.com"),
  alternates: { canonical: "/" },
  title: {
    default: "Teacher Ceppee Review — CSE & LET Reviewer Online",
    template: "%s — Teacher Ceppee Review",
  },
  description:
    "Online reviewer for the Civil Service Exam (CSE) and Licensure Examination for Teachers (LET). Lessons, practice quizzes, and timed mock exams by Teacher Ceppee.",
  keywords: [
    "civil service exam reviewer",
    "CSE reviewer",
    "LET reviewer",
    "civil service exam philippines",
    "let exam reviewer",
    "online reviewer philippines",
  ],
  openGraph: {
    type: "website",
    url: "https://www.teacherceppee.com",
    siteName: "Teacher Ceppee Review",
    title: "Teacher Ceppee Review — CSE & LET Reviewer Online",
    description: "Lessons, practice quizzes, and timed mock exams for CSE and LET.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        {/* Applies the saved theme before anything paints — without this the page
            flashes light for a frame on every load in dark mode. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
