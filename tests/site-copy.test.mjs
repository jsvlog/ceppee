// tests/site-copy.test.mjs — pins the copy the owner asked for (Nov 2026 pass).
// Source-level assertions on purpose: the copy lives in JSX text and React splits
// `{expr}` into separate text nodes, so rendered-HTML matching is brittle here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const home = () => read("src/app/(site)/page.tsx");

test("hero: new headline, no 'The deal' sentence, packages CTA", () => {
  const src = home();
  assert.match(src, /Your CSE and LET Goal —/);
  assert.match(src, /A Clearer Way to Prepare/);
  assert.ok(!src.includes("Pass the CSE or LET"), "old headline must go");
  assert.ok(!src.includes("The deal:"), "the ₱149 deal sentence must go");
  assert.match(src, /Explore our packages →/);
});

test("hero: pill row is built from PLANS, cheapest to complete", () => {
  const src = home();
  assert.match(src, /import \{ PLANS[^}]*\} from "@\/lib\/paymongo"/);
  assert.match(src, /plan: "monthly"[\s\S]*plan: "csec"/);
  assert.match(src, /₱\{PLANS\[p\.plan\]\.price\}/);
});

test("hero: lessons come from the reading library, mocks from the bank", () => {
  const src = home();
  assert.match(src, /lessons in the reading library/);
  assert.match(src, /mock exams, unlimited attempts/);
  assert.match(src, /Math\.floor\(stats\.mockPapers \/ 10\) \* 10/);
  assert.ok(!src.includes("mock & practice exams"));
  assert.ok(!src.includes("{stats.lessons}+"), "must not advertise the lessons table");
});

test("final CTA: 'Ready to start your review?' with two Explore buttons", () => {
  const src = home();
  assert.match(src, /Ready to start your review\?/);
  assert.match(src, /Explore CSE Review — ₱499/);
  assert.match(src, /Explore LET Review — from ₱399/);
  assert.ok(!src.includes("Ready to pass?"), "old headline should be gone");
});

test("final CTA: both buttons share one white button class", () => {
  const src = home();
  assert.match(src, /const ctaWhite =/);
  const uses = src.match(/\{ctaWhite\}/g) ?? [];
  assert.equal(uses.length, 2, "both CTA links must use ctaWhite");
  assert.ok(!src.includes("border-2 border-white/70"), "outlined LET button must go");
});

test("LET card: 40% bullet removed, two mock-count bullets added", () => {
  const src = home();
  assert.ok(!src.includes("Professional Education focus (40% of the score)"));
  assert.match(src, /15 mock exams for each major/);
  assert.match(src, /50 mock exams for Prof Ed and Gen Ed/);
});

test("LET card: ₱399 and ₱499 both visible, same class", () => {
  const src = home();
  assert.ok(!src.includes("/ BEED complete · ₱499 BSED"), "old combined label must go");
  assert.match(src, /₱399[\s\S]{0,120}BEED complete/);
  assert.match(src, /₱499[\s\S]{0,120}BSED complete/);
});

test("testimonials subtitle: 'helped them pass their exams'", () => {
  const t = read("src/components/Testimonials.tsx");
  assert.match(t, /helped them pass their exams\./);
  assert.ok(!t.includes("get their license"));
});

test("coaches heading is 'Meet Your Review Coaches' in both places", () => {
  const section = read("src/components/CoachesSection.tsx");
  const page = read("src/app/(site)/coaches/page.tsx");
  assert.match(section, /Review Coaches/);
  assert.match(page, /Review Coaches/);
  assert.ok(!section.includes("Meet the <span"), "old heading must go (section)");
  assert.ok(!page.includes("Meet the <span"), "old heading must go (page)");
  assert.match(page, /title: "Meet Your Review Coaches"/);
});
