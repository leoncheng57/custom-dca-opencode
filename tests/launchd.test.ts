import { describe, expect, it } from "vitest";
import {
  BFF_LABEL,
  DEFAULT_SUPERVISED_PORT,
  assertSupportedNodeVersion,
  escapePlistString,
  parseSupervisedPort,
  renderBffPlist,
} from "../scripts/launchd.js";

describe("LaunchAgent plist generation", () => {
  it("escapes every XML-sensitive character", () => {
    expect(escapePlistString(`a & b < c > d "quoted" 'single'`)).toBe(
      "a &amp; b &lt; c &gt; d &quot;quoted&quot; &apos;single&apos;",
    );
  });

  it("preserves argument boundaries for repository paths containing spaces", () => {
    const plist = renderBffPlist({
      repoRoot: "/Users/Example/Projects/Agent & UI",
      nodePath: "/opt/Node <current>/bin/node",
      home: "/Users/Example",
      pathValue: "/opt/Node <current>/bin:/usr/bin:/bin",
      port: 3210,
      stdoutPath: "/Users/Example/Projects/Agent & UI/.state/logs/out.log",
      stderrPath: "/Users/Example/Projects/Agent & UI/.state/logs/err.log",
    });

    expect(plist).toContain(`<string>${BFF_LABEL}</string>`);
    expect(plist).toContain("/Users/Example/Projects/Agent &amp; UI/dist/server/index.js");
    expect(plist).toContain("/opt/Node &lt;current&gt;/bin/node");
    expect(plist).toContain("<key>PATH</key>");
    expect(plist).toContain("<key>NODE_ENV</key>\n    <string>production</string>");
    expect(plist).toContain("<key>WorkingDirectory</key>");
    expect(plist).not.toContain("OPENCODE_SERVER_PASSWORD");
  });

  it("defaults away from the dev port and rejects port 3000", () => {
    expect(parseSupervisedPort(undefined)).toBe(DEFAULT_SUPERVISED_PORT);
    expect(DEFAULT_SUPERVISED_PORT).not.toBe(3000);
    expect(() => parseSupervisedPort("3000")).toThrow("conflicts with the development default");
  });

  it("rejects Node versions older than the supported runtime", () => {
    expect(() => assertSupportedNodeVersion("21.7.0")).toThrow("Node 22 or newer is required");
    expect(() => assertSupportedNodeVersion("22.0.0")).not.toThrow();
  });
});
