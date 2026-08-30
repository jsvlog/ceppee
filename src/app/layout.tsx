import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ceppee Review — CSE & LET Reviewer Online",
    template: "%s — Ceppee Review",
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
    siteName: "Ceppee Review",
    title: "Ceppee Review — CSE & LET Reviewer Online",
    description: "Lessons, practice quizzes, and timed mock exams for CSE and LET.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
