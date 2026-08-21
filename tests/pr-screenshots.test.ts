import { describe, expect, it } from "vitest";

import { MAX_ROUTE_LENGTH, MAX_SCREENSHOTS, parseScreenshotBlock, screenshotFilename } from "../scripts/pr-screenshots.js";

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
          filename: screenshotFilename("/?directory=/tmp/mock-project", false, 0),
        },
        {
          requestedRoute: "/sessions/ses_mock_done?directory=/tmp/mock-project",
          fullPage: true,
          filename: screenshotFilename("/sessions/ses_mock_done?directory=/tmp/mock-project", true, 1),
        },
      ],
    });
  });

  it("returns an empty request when the block is absent or comments only", () => {
    expect(parseScreenshotBlock("No visual changes.")).toEqual({ blockFound: false, requests: [] });
    expect(parseScreenshotBlock("```screenshots\n# none\n\n```"))
      .toEqual({ blockFound: true, requests: [] });
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
