import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("signed-in users on / are redirected straight to /dashboard (no marketing homepage)", () => {
  const home = read("src/app/(site)/page.tsx");
  assert.match(home, /const \{ user \} = await getUserContext\(\)/);
  assert.match(home, /if \(user\) redirect\("\/dashboard"\)/);
});

test("site layout renders AppSidebar drawer for signed-in users and Navbar only for guests", () => {
  const layout = read("src/app/(site)/layout.tsx");
  assert.match(layout, /import AppSidebar from "@\/components\/AppSidebar"/);
  assert.match(layout, /if \(user\)/);
  assert.match(layout, /<AppSidebar/);
  assert.match(layout, /<Navbar user=\{null\} isAdmin=\{false\} \/>/);
});

test("left drawer organizes Mock Boards, Reading Materials, Drills, Flashcards, Study Room, and Leaderboard", () => {
  const sidebar = read("src/components/AppSidebar.tsx");
  assert.match(sidebar, /LET Mock Boards/);
  assert.match(sidebar, /CSE Mock Boards/);
  assert.match(sidebar, /Reading Materials/);
  assert.match(sidebar, /Subject Drills/);
  assert.match(sidebar, /Flashcards/);
  assert.match(sidebar, /Retry Mistakes/);
  assert.match(sidebar, /Study Room/);
  assert.match(sidebar, /Leaderboard/);
  assert.match(sidebar, /study desk/);
});

test("study room client renders channels list, chat feed, composer, and user badges", () => {
  const room = read("src/app/(site)/study-room/StudyRoomClient.tsx");
  assert.match(room, /import UserBadgePill from "@\/components\/UserBadgePill"/);
  assert.match(room, /Kwentuhan muna\?/);
  assert.match(room, /General &amp; Exam Lounges/);
  assert.match(room, /Core Subjects/);
  assert.match(room, /Majorships/);
  assert.match(room, /\/api\/study-room/);
});

test("admin panel includes Study Rooms management and User Badges / Labels", () => {
  const admin = read("src/app/(site)/admin/AdminClient.tsx");
  const api = read("src/app/api/admin/route.ts");
  assert.match(admin, /Users & Badges/);
  assert.match(admin, /Study Rooms/);
  assert.match(admin, /set_user_label/);
  assert.match(admin, /save_study_room/);
  assert.match(api, /case "set_user_label":/);
  assert.match(api, /case "save_study_room":/);
  assert.match(api, /case "delete_study_room":/);
});

test("profile menu uses separate desktop/mobile refs so mousedown outside check does not kill menu clicks, and centers icons when collapsed", () => {
  const sidebar = read("src/components/AppSidebar.tsx");
  assert.match(sidebar, /desktopProfileRef/);
  assert.match(sidebar, /mobileProfileRef/);
  assert.ok(!sidebar.includes("const profileMenuRef ="), "shared profileMenuRef causes mobile ref overwrite");
  assert.match(sidebar, /fetch\("\/api\/auth\/signout"/);
  assert.match(sidebar, /window\.location\.href = "\/"/);
  assert.match(sidebar, /mx-auto flex h-11 w-11 items-center justify-center/);
});

test("StudyRunner scrolls to top of question card on Next/Prev and fits viewport cleanly", () => {
  const runner = read("src/components/study/StudyRunner.tsx");
  assert.match(runner, /runnerTopRef/);
  assert.match(runner, /window\.scrollTo\(\{ top:/);
  assert.match(runner, /sticky top-16 z-20/);
});

test("collapsed sidebar hides native scrollbar and removes outer pill box border so icons never overlap or clip", () => {
  const sidebar = read("src/components/AppSidebar.tsx");
  const css = read("src/app/globals.css");
  assert.match(sidebar, /no-scrollbar flex-1 overflow-y-auto/);
  assert.match(css, /\.no-scrollbar::-webkit-scrollbar/);
  assert.match(sidebar, /border-2 border-\[#16a34a\] border-b-\[4px\]/);
});
