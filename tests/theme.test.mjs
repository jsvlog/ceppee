// tests/theme.test.mjs — the dark-mode contract.
// Source-level on purpose: the theme is CSS + an inline boot script, so there is no
// component to render, and the failure mode we care about (a token that stops being
// remapped, or the boot script dropping out of the layout) is visible in the source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const css = () => read("src/app/globals.css");

test("dark mode is class-based, not media-query based", () => {
  const src = css();
  assert.match(src, /@custom-variant dark \(&:where\(\.dark, \.dark \*\)\)/);
});

test(".dark defines the surface/text/border tokens", () => {
  const src = css();
  const block = src.slice(src.indexOf(".dark {"), src.indexOf("body {"));
  for (const token of [
    "--bg-primary",
    "--bg-surface",
    "--bg-surface-2",
    "--bg-surface-3",
    "--text-primary",
    "--text-strong",
    "--text-secondary",
    "--border-default",
  ]) {
    assert.ok(block.includes(token), `${token} missing from the .dark token block`);
  }
  assert.match(block, /color-scheme: dark/);
});

test("the literal hex classes the app uses are remapped under .dark", () => {
  const src = css();
  const remap = src.slice(src.indexOf("DARK MODE REMAP"));
  // the five colours that make up ~80% of the app
  assert.match(remap, /\.dark \.text-\\\[\\#16331f\\\]/);
  assert.match(remap, /\.dark \.text-\\\[\\#5c7863\\\]/);
  assert.match(remap, /\.dark \.bg-white/);
  assert.match(remap, /\.dark \.border-\\\[\\#d9e6d3\\\]/);
  assert.match(remap, /\.dark \.bg-\\\[\\#dcfce7\\\]/);
});

test("the boot script reads the saved theme and falls back to the OS", () => {
  const src = read("src/lib/theme.ts");
  assert.match(src, /ceppee-theme/);
  assert.match(src, /localStorage\.getItem/);
  assert.match(src, /prefers-color-scheme: dark/);
  assert.match(src, /classList\.toggle\("dark"/);
});

test("the root layout runs the boot script before painting", () => {
  const src = read("src/app/layout.tsx");
  assert.match(src, /THEME_SCRIPT/);
  assert.match(src, /dangerouslySetInnerHTML/);
  assert.match(src, /suppressHydrationWarning/);
});

test("the navbar offers the toggle on desktop and in the mobile drawer", () => {
  const src = read("src/components/Navbar.tsx");
  assert.match(src, /import ThemeToggle from "@\/components\/ThemeToggle"/);
  const uses = src.match(/<ThemeToggle \/>/g) ?? [];
  assert.equal(
    uses.length,
    3,
    "one beside the signed-in buttons, one beside Log in, one in the mobile drawer",
  );
});

test("white buttons that sit on a gradient survive dark mode", () => {
  const src = read("src/app/(site)/page.tsx");
  assert.match(src, /keep-white/);
  assert.match(read("src/app/globals.css"), /\.dark \.keep-white/);
});
