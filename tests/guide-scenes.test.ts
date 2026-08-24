import { describe, expect, it } from "vitest";

import { findGuideScene, guideChapters, guideScenes } from "../client/guide/scenes.js";

describe("interactive Runner guide fixtures", () => {
  it("covers every issue 53 topic with stable unique scene ids", () => {
    expect(guideChapters.map((chapter) => chapter.id)).toEqual([
      "control-plane",
      "long-sessions",
      "plan-build",
      "human-gates",
      "mobile-notifications",
      "subagents",
      "limits",
      "contribute",
    ]);
    expect(guideScenes.length).toBeGreaterThanOrEqual(16);
    expect(new Set(guideScenes.map((scene) => scene.id)).size).toBe(guideScenes.length);
    expect(guideScenes.map((scene) => scene.id)).toEqual(expect.arrayContaining([
      "system-map",
      "async-events",
      "pagination",
      "interrupted-turn",
      "plan-safety",
      "build-restoration",
      "permission-question",
      "review-control",
      "phone-handoff",
      "notification-inbox",
      "subagent-ledger",
      "exclusions",
      "troubleshooting",
    ]));
  });

  it("resolves semantic deep links without relying on array positions", () => {
    const result = findGuideScene("subagent-ledger");
    expect(result?.chapter.id).toBe("subagents");
    expect(result?.scene.title).toContain("Unknown");
    expect(findGuideScene("does-not-exist")).toBeUndefined();
  });

  it("keeps every scene explanatory and explicitly bounded", () => {
    for (const scene of guideScenes) {
      expect(scene.title.length).toBeGreaterThan(8);
      expect(scene.summary.length).toBeGreaterThan(20);
      expect(scene.rows.length).toBeGreaterThanOrEqual(3);
      expect(scene.inspector.length).toBeGreaterThanOrEqual(3);
      expect(scene.caveat.length).toBeGreaterThan(20);
    }
  });

  it("contains fictional data rather than known private or employer identifiers", () => {
    const fixtureText = JSON.stringify(guideChapters).toLowerCase();
    for (const forbidden of ["deepl", "openhands-private", "leon.cheng@", "/users/bsjl", "ses_mock_done"]) {
      expect(fixtureText).not.toContain(forbidden);
    }
    expect(fixtureText).toContain("fictional");
    expect(fixtureText).toContain("simulation");
  });
});
