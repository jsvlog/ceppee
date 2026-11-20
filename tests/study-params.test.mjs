import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// `src/lib/study.ts` imports "@/lib/exam" at runtime, which Node cannot resolve.
// Teach the test runner the same alias Next uses, then load the real module.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const abs = new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href;
      return nextResolve(abs, context);
    }
    return nextResolve(specifier, context);
  },
});

const { parseStudyParams } = await import("../src/lib/study.ts");

test("parseStudyParams keeps the majorship for secondary LET", () => {
  const p = parseStudyParams("LET", { level: "secondary", major: "Mathematics", subjects: "Specialization" });
  assert.equal(p.level, "secondary");
  assert.equal(p.major, "Mathematics");
  assert.deepEqual(p.subjects, ["Specialization"]);
});

test("parseStudyParams keeps the majorship for elementary-with-specialization LET", () => {
  // The bug: `level !== "secondary"` stripped this, so BSNEd / BECEd drills matched nothing.
  const p = parseStudyParams("LET", {
    level: "elementary",
    major: "Early Childhood Education",
    subjects: "Specialization",
  });
  assert.equal(p.major, "Early Childhood Education");

  const sned = parseStudyParams("LET", { level: "elementary", major: "Special Needs Education" });
  assert.equal(sned.major, "Special Needs Education");
});

test("parseStudyParams drops a major that is not offered at that level, and for CSE", () => {
  // Mathematics is a secondary paper only, so at elementary it must not survive.
  assert.equal(parseStudyParams("LET", { level: "elementary", major: "Mathematics" }).major, null);
  assert.equal(parseStudyParams("CSE", { level: "professional", major: "Mathematics" }).major, null);
  assert.equal(parseStudyParams("LET", { level: "secondary", major: "Nonsense Major" }).major, null);
});

test("parseStudyParams clamps count and difficulty and only keeps known subjects", () => {
  const p = parseStudyParams("LET", {
    level: "secondary",
    subjects: "General Education,Bogus Subject",
    count: "9999",
    difficulty: "9",
  });
  assert.deepEqual(p.subjects, ["General Education"]);
  assert.equal(p.count, 200);
  assert.equal(p.difficulty, 3);
  assert.equal(parseStudyParams("LET", { count: "1" }, 30).count, 5);
  assert.equal(parseStudyParams("LET", {}, 30).count, 30);
});
