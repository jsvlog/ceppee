import test from "node:test";
import assert from "node:assert/strict";
import {
  computePlayerStats,
  buildCampaignRegions,
  comboMultiplier,
  starsFor,
} from "../src/lib/game.ts";

/** Minimal SetCatalogRow factory so each test states only what it cares about. */
function setRow(setNo, extra = {}) {
  return {
    id: `set-${setNo}`,
    track: "LET",
    subject: "General Education",
    specialization: null,
    level: "both",
    set_no: setNo,
    title: `General Education — Set ${setNo}`,
    target: 150,
    live: 150,
    missing: 0,
    easy: 30,
    medium_hard: 40,
    extremely_hard: 50,
    pedagogical: 30,
    shape_easy: 30,
    shape_medium_hard: 40,
    shape_extremely_hard: 50,
    shape_pedagogical: 30,
    ...extra,
  };
}

const attempt = (score, total, kind, label, completed_at) => ({
  score,
  total,
  kind,
  label,
  completed_at,
});

test("computePlayerStats: XP, level, rank, pass bonus, streak", () => {
  const attempts = [
    attempt(120, 150, "exam", "General Education — Set 1 (set mock)", "2026-11-21T08:00:00Z"),
    attempt(18, 20, "drill", "LET — General Education", "2026-11-20T08:00:00Z"),
  ];

  const stats = computePlayerStats(attempts, 75);
  // 120*10 + 18*10 + 150 (pass bonus) = 1530
  assert.equal(stats.xp, 1530);
  assert.equal(stats.level, 4); // 500 XP per level -> floor(1530/500)+1
  assert.equal(stats.xpInLevel, 30);
  assert.equal(stats.xpForNextLevel, 500);
  assert.equal(stats.levelProgressPct, 6);
  assert.equal(stats.examsPassed, 1);
  assert.equal(stats.totalAnswered, 170);
  assert.equal(stats.streakDays, 2); // 2026-11-20 + 2026-11-21
  assert.equal(stats.rankTitle, "Board Challenger"); // level 4
});

test("computePlayerStats: a failing exam earns no pass bonus and breaks the streak", () => {
  const stats = computePlayerStats(
    [
      attempt(50, 150, "exam", "Set 1 (set mock)", "2026-11-21T08:00:00Z"),
      attempt(50, 150, "exam", "Set 2 (set mock)", "2026-11-18T08:00:00Z"),
    ],
    75
  );
  assert.equal(stats.xp, 1000); // 50*10 + 50*10, no bonus
  assert.equal(stats.examsPassed, 0);
  assert.equal(stats.streakDays, 1); // 18th -> 21st is a 3-day gap
  assert.equal(stats.level, 3);
  assert.equal(stats.rankTitle, "Board Challenger"); // level 3 reaches the next rank
});

test("buildCampaignRegions: regions of 5, done -> current -> unlocked chain, stars", () => {
  const sets = Array.from({ length: 7 }, (_, i) => setRow(i + 1));
  const attempts = [attempt(120, 150, "exam", "General Education — Set 1 (set mock)", "2026-11-21T08:00:00Z")];

  const regions = buildCampaignRegions(sets, attempts, { passingPct: 75, subscribed: true });
  assert.equal(regions.length, 2);
  assert.equal(regions[0].nodes.length, 5);
  assert.equal(regions[1].nodes.length, 2);

  assert.equal(regions[0].nodes[0].state, "done");
  assert.equal(regions[0].nodes[0].bestPct, 80);
  assert.equal(regions[0].nodes[0].stars, 2);
  assert.equal(regions[0].nodes[1].state, "current");
  assert.equal(regions[0].nodes[2].state, "unlocked");
  assert.equal(regions[0].completedCount, 1);
  assert.equal(regions[0].title, "Region I · Foundation Grounds");
});

test("buildCampaignRegions: unsubscribed visitors see every node locked", () => {
  const regions = buildCampaignRegions([setRow(1), setRow(2)], [], {
    passingPct: 75,
    subscribed: false,
  });
  assert.deepEqual(
    regions[0].nodes.map((n) => n.state),
    ["locked", "locked"]
  );
});

test("buildCampaignRegions: two attempts on one set keep the best score", () => {
  const attempts = [
    attempt(60, 150, "exam", "General Education — Set 1 (set mock)", "2026-11-20T08:00:00Z"),
    attempt(140, 150, "exam", "General Education — Set 1 (set mock)", "2026-11-21T08:00:00Z"),
  ];
  const regions = buildCampaignRegions([setRow(1)], attempts, { passingPct: 75, subscribed: true });
  assert.equal(regions[0].nodes[0].bestPct, 93);
  assert.equal(regions[0].nodes[0].attemptsCount, 2);
  assert.equal(regions[0].nodes[0].stars, 3);
  assert.equal(regions[0].nodes[0].state, "done");
});

test("comboMultiplier and starsFor step at the documented thresholds", () => {
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(2), 1);
  assert.equal(comboMultiplier(3), 2);
  assert.equal(comboMultiplier(5), 3);
  assert.equal(comboMultiplier(10), 5);

  assert.equal(starsFor(100, 75), 3);
  assert.equal(starsFor(90, 75), 3);
  assert.equal(starsFor(89, 75), 2);
  assert.equal(starsFor(75, 75), 2);
  assert.equal(starsFor(74, 75), 1);
  assert.equal(starsFor(49, 75), 0);
});
