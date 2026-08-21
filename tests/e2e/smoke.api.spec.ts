import { expect, test } from "@playwright/test";

// API tier — exercises the real BFF against the mock OpenCode server.
// No browser, no agent run.

const DIR = process.platform === "darwin" ? "/private/tmp/mock-project" : "/tmp/mock-project";

test.describe("health", () => {
  test("reports upstream reachability and version", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.healthy).toBe(true);
    expect(body.upstream.reachable).toBe(true);
    expect(body.upstream.version).toBe("1.18.19");
    expect(body.upstream.versionMatches).toBe(true);
  });

  test("reports the SSE bus connection", async ({ request }) => {
    const body = await (await request.get("/api/health")).json();
    expect(body.events.connected).toBe(true);
  });
});

test.describe("public app config", () => {
  test("exposes only the configured phone origin", async ({ request }) => {
    const response = await request.get("/api/app-config");
    expect(response.ok()).toBe(true);
    expect(await response.json()).toEqual({ publicAppUrl: "https://ide.e2e.example.test:8443" });
  });
});

test.describe("directory scoping", () => {
  // One OpenCode server hosts every project. A missing scope would silently
  // target whatever directory the server started in, so it must be rejected.
  test("rejects a missing directory", async ({ request }) => {
    const res = await request.get("/api/sessions");
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain("directory");
  });

  test("rejects a relative directory", async ({ request }) => {
    const res = await request.get("/api/sessions?directory=relative/path");
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain("absolute");
  });

  test("returns only sessions in the requested directory", async ({ request }) => {
    const body = await (await request.get(`/api/sessions?directory=${DIR}`)).json();
    expect(body.sessions.length).toBeGreaterThan(0);
    for (const session of body.sessions) expect(session.directory).toBe(DIR);
  });

  test("rejects a nonexistent directory before forwarding it", async ({ request }) => {
    const res = await request.get("/api/sessions?directory=/tmp/nope");
    expect(res.status()).toBe(400);
  });
});

test.describe("sessions", () => {
  test("hides archived sessions", async ({ request }) => {
    const body = await (await request.get(`/api/sessions?directory=${DIR}`)).json();
    const ids = body.sessions.map((s: { id: string }) => s.id);
    expect(ids).toContain("ses_mock_done");
    expect(ids).not.toContain("ses_mock_archived");
  });

  test("marks the busy session as running", async ({ request }) => {
    const body = await (await request.get(`/api/sessions?directory=${DIR}`)).json();
    const byId = Object.fromEntries(
      body.sessions.map((s: { id: string; running: boolean }) => [s.id, s.running]),
    );
    expect(byId.ses_mock_running).toBe(true);
    expect(byId.ses_mock_done).toBe(false);
  });

  test("normalises cost and token totals", async ({ request }) => {
    const body = await (await request.get(`/api/sessions?directory=${DIR}`)).json();
    const done = body.sessions.find((s: { id: string }) => s.id === "ses_mock_done");
    expect(done.cost).toBeCloseTo(0.0431);
    expect(done.tokens).toMatchObject({ input: 110, output: 940, cacheRead: 10400 });
  });

  // Upstream answers 500 for an unknown id; a stale bookmark should read as
  // "gone", not "the agent server is broken".
  test("an unknown session is 404, not 502", async ({ request }) => {
    const res = await request.get(`/api/sessions/ses_nope/messages?directory=${DIR}`);
    expect(res.status()).toBe(404);
  });
});

test.describe("transcript", () => {
  test("returns raw messages for the client adapter to shape", async ({ request }) => {
    const body = await (await request.get(`/api/sessions/ses_mock_done/messages?directory=${DIR}`)).json();
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBeGreaterThan(0);
    expect(body.messages[0]).toHaveProperty("info");
    expect(body.messages[0]).toHaveProperty("parts");
  });

  test("serves todos", async ({ request }) => {
    const body = await (await request.get(`/api/sessions/ses_mock_done/todos?directory=${DIR}`)).json();
    expect(body.todos.length).toBe(3);
    expect(body.todos[0]).toMatchObject({ status: "completed" });
  });
});

test.describe("prompting", () => {
  test("accepts a prompt asynchronously (202, not a held connection)", async ({ request }) => {
    const res = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
      data: { text: "hello" },
    });
    expect(res.status()).toBe(202);
    expect((await res.json()).accepted).toBe(true);
  });

  test("rejects an empty prompt", async ({ request }) => {
    const res = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
      data: { text: "   " },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects unsafe image attachments", async ({ request }) => {
    const res = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
      data: { text: "inspect", attachments: [{ filename: "secret", mime: "text/plain", url: "file:///etc/passwd" }] },
    });
    expect(res.status()).toBe(400);
  });

  test("creates a session", async ({ request }) => {
    const res = await request.post("/api/sessions", {
      data: { directory: DIR, title: "e2e created" },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).session.title).toBe("e2e created");
  });

  test("exposes reminder metadata without injectable body text", async ({ request }) => {
    const response = await request.get("/api/reminders");
    expect(response.ok()).toBe(true);
    const payload = await response.json();
    expect(payload.reminders.length).toBeGreaterThan(0);
    expect(payload.reminders[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      description: expect.any(String),
      triggers: expect.any(Array),
    }));
    expect(payload.reminders[0]).not.toHaveProperty("body");
    expect(payload.reminders[0]).not.toHaveProperty("enabled");
  });

  test("rejects malformed and unknown reminder ids", async ({ request }) => {
    for (const reminder of ["../etc", "", null, 42]) {
      const malformed = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
        data: { text: "go", reminder },
      });
      expect(malformed.status()).toBe(400);
    }
    const unknown = await request.post(`/api/sessions/ses_mock_done/prompt?directory=${DIR}`, {
      data: { text: "go", reminder: "not-in-catalogue" },
    });
    expect(unknown.status()).toBe(400);
  });
});

test.describe("event stream", () => {
  // Playwright's `request` fixture buffers the whole body, which never
  // completes for an intentionally-infinite SSE stream. Read the first frame
  // off the wire and abort instead.
  async function firstFrames(url: string, ms = 3_000): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(url, {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (buffer.length < 512) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes("\n\n")) break;
      }
      void reader.cancel();
      return buffer;
    } finally {
      clearTimeout(timer);
    }
  }

  test("opens with a connected frame", async ({ baseURL }) => {
    const body = await firstFrames(`${baseURL}/api/events`);
    expect(body).toContain('"type":"connected"');
  });

  test("stays open rather than closing after the first frame", async ({ baseURL }) => {
    // A stream that ends immediately would silently degrade the UI to
    // poll-only, so assert the connection is still live.
    const controller = new AbortController();
    const res = await fetch(`${baseURL}/api/events`, { signal: controller.signal });
    const reader = res.body!.getReader();
    await reader.read();
    const second = await Promise.race([
      reader.read().then(() => "data"),
      new Promise<string>((resolve) => setTimeout(() => resolve("still-open"), 1_500)),
    ]);
    controller.abort();
    expect(["data", "still-open"]).toContain(second);
  });
});

test.describe("settings and tools", () => {
  test("global settings round-trip only public fields", async ({ request }) => {
    const saved = await request.patch("/api/settings", {
      data: { model: "anthropic/claude-opus-5", compaction: { auto: true, reserved: 4096 } },
    });
    expect(saved.ok()).toBe(true);
    expect((await saved.json()).settings).toEqual({
      model: "anthropic/claude-opus-5",
      compaction: { auto: true, reserved: 4096 },
    });
    const rejected = await request.patch("/api/settings", { data: { provider: { token: "secret" } } });
    expect(rejected.status()).toBe(400);
  });

  test("MCP action refetches resulting status", async ({ request }) => {
    const before = await (await request.get(`/api/mcp?directory=${DIR}`)).json();
    expect(before.servers.docs).toMatchObject({ status: "failed", error: "mock connection refused" });
    const after = await (await request.post(`/api/mcp/docs/connect?directory=${DIR}`)).json();
    expect(after.servers.docs).toEqual({ status: "connected" });
  });

  test("returns LSP and read-only effective permissions", async ({ request }) => {
    expect((await (await request.get(`/api/lsp?directory=${DIR}`)).json()).servers).toHaveProperty("typescript");
    expect((await (await request.get(`/api/permissions?directory=${DIR}`)).json()).permissions).toEqual({ "*": "ask", read: "allow" });
  });
});

test.describe("workspace", () => {
  test("lists directories first and reads a file", async ({ request }) => {
    const tree = await (await request.get(`/api/workspace/tree?directory=${DIR}&path=`)).json();
    expect(tree.dirs).toContainEqual(expect.objectContaining({ name: "src", type: "directory" }));
    expect(tree.files[0]).toMatchObject({ name: "README.md", type: "file" });
    const file = await (await request.get(`/api/workspace/file?directory=${DIR}&path=README.md`)).json();
    expect(file).toMatchObject({ type: "text", content: "# Mock project" });
  });

  test("rejects traversal before it reaches OpenCode", async ({ request }) => {
    const res = await request.get(`/api/workspace/file?directory=${DIR}&path=../secret`);
    expect(res.status()).toBe(400);
  });

  test("returns diffs and local git history", async ({ request }) => {
    const changes = await (await request.get(`/api/workspace/changes?directory=${DIR}&mode=git`)).json();
    expect(changes.changes[0].file).toBe("src/index.ts");
    const commits = await (await request.get(`/api/workspace/commits?directory=${DIR}`)).json();
    expect(commits.commits[0].subject).toBe("fixture");
  });
});

test.describe("preview security", () => {
  test("allows only configured ports and strips credentials", async ({ request }) => {
    const denied = await request.get("/api/preview/9999/");
    expect(denied.status()).toBe(403);
    const proxied = await request.get("/api/preview/4600/hello?q=1", {
      headers: { Authorization: "Bearer must-not-forward", Cookie: "secret=yes" },
    });
    const body = await proxied.json();
    expect(body.path).toBe("/hello?q=1");
    expect(body.authorization).toBeNull();
    expect(body.cookie).toBeNull();
    expect(proxied.headers()["x-unsafe"]).toBeUndefined();
    expect(proxied.headers()["content-security-policy"]).toContain("sandbox");
  });

  test("rewrites root-relative redirects under the proxy mount", async ({ request }) => {
    const res = await request.get("/api/preview/4600/redirect", { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toBe("/api/preview/4600/target");
  });
});

test.describe("worktrees", () => {
  test("lists and creates a ready isolated worktree", async ({ request }) => {
    const listed = await (await request.get(`/api/worktrees?directory=${DIR}`)).json();
    expect(listed.worktrees.length).toBeGreaterThan(0);
    const created = await request.post(`/api/worktrees?directory=${DIR}`, { data: { name: "e2e-isolated" } });
    expect(created.status()).toBe(201);
    expect((await created.json()).worktree.directory).toContain("e2e-isolated");
  });
});

test.describe("permission remote control", () => {
  test("lists and answers a parked permission", async ({ request }) => {
    const before = await (await request.get(`/api/permission-requests?directory=${DIR}`)).json();
    expect(before.requests).toContainEqual(expect.objectContaining({ id: "perm_mock" }));
    const reply = await request.post(`/api/permission-requests/perm_mock/reply?directory=${DIR}`, { data: { reply: "once" } });
    expect(reply.ok()).toBe(true);
    const after = await (await request.get(`/api/permission-requests?directory=${DIR}`)).json();
    expect(after.requests).toEqual([]);
  });
});
