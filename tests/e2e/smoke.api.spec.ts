import { expect, test } from "@playwright/test";

// API tier — exercises the real BFF against the mock OpenCode server.
// No browser, no agent run.

const DIR = "/tmp/mock-project";

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

  test("an unknown directory yields no sessions rather than an error", async ({ request }) => {
    const res = await request.get("/api/sessions?directory=/tmp/nope");
    expect(res.ok()).toBe(true);
    expect((await res.json()).sessions).toEqual([]);
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

  test("creates a session", async ({ request }) => {
    const res = await request.post("/api/sessions", {
      data: { directory: DIR, title: "e2e created" },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).session.title).toBe("e2e created");
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
