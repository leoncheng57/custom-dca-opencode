import { describe, expect, it } from "vitest";

import { decidePublication, MAX_ROUTE_LENGTH, MAX_SCREENSHOTS, parseScreenshotBlock, resolveCaptureConfig, screenshotFilename } from "../scripts/pr-screenshots.js";

describe("screenshot E2E discovery", () => {
  it("skips ordinary E2E discovery but fails when capture config is required", () => {
    expect(resolveCaptureConfig({})).toBeNull();
    expect(() => resolveCaptureConfig({ PR_SCREENSHOT_REQUEST_FILE: "/tmp/request.json" }, true))
      .toThrow("requires PR_SCREENSHOT_REQUEST_FILE and PR_SCREENSHOT_OUTPUT_DIR");
    expect(resolveCaptureConfig({
      PR_SCREENSHOT_REQUEST_FILE: "/tmp/request.json",
      PR_SCREENSHOT_OUTPUT_DIR: "/tmp/output",
    }, true)).toEqual({ requestFile: "/tmp/request.json", outputDir: "/tmp/output" });
  });
});

describe("trusted screenshot publication", () => {
  const sameRepository = {
    repository: "owner/repository",
    runHeadSha: "a".repeat(40),
    prHeadSha: "a".repeat(40),
    prHeadRepository: "owner/repository",
  };

  it("publishes only a same-repository head bound to the workflow run SHA", () => {
    expect(decidePublication(sameRepository)).toEqual({ publish: true, reason: "same-repository" });
    expect(decidePublication({ ...sameRepository, prHeadRepository: "contributor/fork" }))
      .toEqual({ publish: false, reason: "fork" });
    expect(decidePublication({ ...sameRepository, prHeadSha: "b".repeat(40) }))
      .toEqual({ publish: false, reason: "sha-mismatch" });
  });
});

describe("PR screenshot requests", () => {
  it("parses routes, full-page mode, comments, and blank lines", () => {
    expect(parseScreenshotBlock([
      "Before",
      "```screenshots",
      "/?directory=/tmp/mock-project",
      "",
      "# session detail",
      "full:/sessions/ses_mock_done?directory=/tmp/mock-project",
      "```",
    ].join("\n"))).toEqual({
      blockFound: true,
      requests: [
        {
          requestedRoute: "/?directory=/tmp/mock-project",
          fullPage: false,
          filenames: {
            desktop: screenshotFilename("/?directory=/tmp/mock-project", false, 0, "desktop"),
            mobile: screenshotFilename("/?directory=/tmp/mock-project", false, 0, "mobile"),
          },
        },
        {
          requestedRoute: "/sessions/ses_mock_done?directory=/tmp/mock-project",
          fullPage: true,
          filenames: {
            desktop: screenshotFilename("/sessions/ses_mock_done?directory=/tmp/mock-project", true, 1, "desktop"),
            mobile: screenshotFilename("/sessions/ses_mock_done?directory=/tmp/mock-project", true, 1, "mobile"),
          },
        },
      ],
    });
  });

  it("returns an empty request when the block is absent or comments only", () => {
    expect(parseScreenshotBlock("No visual changes.")).toEqual({ blockFound: false, requests: [] });
    expect(parseScreenshotBlock("```screenshots\n# none\n\n```"))
      .toEqual({ blockFound: true, requests: [] });
  });

  it("creates distinct desktop and mobile filenames", () => {
    const desktop = screenshotFilename("/tools?directory=/tmp/mock-project", false, 0, "desktop");
    const mobile = screenshotFilename("/tools?directory=/tmp/mock-project", false, 0, "mobile");
    expect(desktop).toMatch(/^01-tools-directory-tmp-mock-project-[a-f0-9]{8}--desktop\.png$/u);
    expect(mobile).toMatch(/^01-tools-directory-tmp-mock-project-[a-f0-9]{8}--mobile\.png$/u);
    expect(desktop).not.toBe(mobile);
  });

  it("accepts the documentation index and fixed-slug readers", () => {
    expect(parseScreenshotBlock("```screenshots\n/docs\n/docs/architecture\n```").requests)
      .toHaveLength(2);
  });

  it("accepts the global planning page", () => {
    expect(parseScreenshotBlock("```screenshots\n/planning\n```").requests[0])
      .toMatchObject({ requestedRoute: "/planning", fullPage: false });
  });

  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/a/../secret",
    "/sessions/%2e%2e/secret",
    "/sessions/%252e%252e/secret",
    "/sessions/%2fsecret",
    "/path with space",
    "/path%20with-space",
    "/path\\secret",
    " /leading-space",
    "/trailing-space ",
  ])("rejects unsafe route %s", (route) => {
    expect(() => parseScreenshotBlock(`\`\`\`screenshots\n${route}\n\`\`\``)).toThrow(/route/);
  });

  it("rejects unknown app routes, duplicate blocks, and excessive requests", () => {
    expect(() => parseScreenshotBlock("```screenshots\n/api/settings\n```"))
      .toThrow("known UI route");
    expect(() => parseScreenshotBlock("```screenshots\n/\n```\n```screenshots\n/tools\n```"))
      .toThrow("at most one");
    const routes = Array.from({ length: MAX_SCREENSHOTS + 1 }, (_, index) => `/sessions/session-${index}`).join("\n");
    expect(() => parseScreenshotBlock(`\`\`\`screenshots\n${routes}\n\`\`\``)).toThrow("at most");
  });

  it("rejects an unclosed screenshots fence", () => {
    expect(() => parseScreenshotBlock("```screenshots\n/tools"))
      .toThrow("malformed or missing");
  });

  it("rejects excessive route length", () => {
    const route = `/sessions/${"a".repeat(MAX_ROUTE_LENGTH)}`;
    expect(() => parseScreenshotBlock(`\`\`\`screenshots\n${route}\n\`\`\``)).toThrow("exceeds");
  });
});
