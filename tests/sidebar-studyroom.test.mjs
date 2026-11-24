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
