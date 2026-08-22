import { randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

// API tier for the terminal. What only this tier can show: the real BFF, built
// and running, answering over real HTTP against the mock agent server — so the
// route wiring, the JSON contract and the confinement responses are the ones a
// browser would actually get.
//
// Mode coverage lives elsewhere on purpose: tests/pty-server.test.ts stands up
// a BFF per mode in-process, which is cheaper and more thorough than a second
// Playwright webServer. Here the server runs PTY_ENABLED=interactive.

const DIR = process.platform === "darwin" ? "/private/tmp/mock-project" : "/tmp/mock-project";
const OTHER_DIR = process.platform === "darwin" ? "/private/tmp/mock-second-project" : "/tmp/mock-second-project";
const MOCK_URL = `http://127.0.0.1:${process.env.MOCK_OPENCODE_PORT || 4599}`;
const RUNNING = "pty_mock_running";

const scoped = (path: string, directory = DIR) => `/api${path}?directory=${encodeURIComponent(directory)}`;

test.beforeEach(async () => {
  // Scoped to this file's project: pty.ui.spec.ts owns a different one, and
  // Playwright may run both files at once against this single mock.
  await fetch(`${MOCK_URL}/test/ptys/reset?directory=${encodeURIComponent(DIR)}`);
});

test.describe("terminal capabilities", () => {
  test("reports what this deployment will actually permit", async ({ request }) => {
    const response = await request.get("/api/pty/capabilities");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      mode: "interactive",
      canCreate: true,
      canInput: true,
      canKill: true,
      canUpdate: true,
      shellPinned: false,
    });
  });

  test("advertises it through app-config so the shell can hide the nav entry", async ({ request }) => {
    const config = await (await request.get("/api/app-config")).json();
    expect(config.pty).toEqual({ enabled: true, mode: "interactive" });
  });
});

test.describe("listing and inspecting", () => {
  test("lists only the terminals of the requested project", async ({ request }) => {
    const body = await (await request.get(scoped("/pty"))).json();
    expect(body.ptys.map((pty: { id: string }) => pty.id).sort()).toEqual(["pty_mock_exited", "pty_mock_running"]);
    // Upstream's Pty has no directory field; the BFF must not invent one.
    expect(body.ptys[0]).not.toHaveProperty("directory");

    const other = await (await request.get(scoped("/pty", OTHER_DIR))).json();
    expect(other.ptys).toEqual([]);
  });

  test("requires a directory scope", async ({ request }) => {
    expect((await request.get("/api/pty")).status()).toBe(400);
  });

  test("rejects a directory outside PROJECTS_DIR", async ({ request }) => {
    expect((await request.get(scoped("/pty", "/etc"))).status()).toBe(403);
  });

  test("reports a terminal addressed through the wrong project as not found", async ({ request }) => {
    expect((await request.get(scoped(`/pty/${RUNNING}`))).status()).toBe(200);
    expect((await request.get(scoped(`/pty/${RUNNING}`, OTHER_DIR))).status()).toBe(404);
  });

  test("rejects an id that is not a pty id", async ({ request }) => {
    expect((await request.get(scoped("/pty/ses_mock_done"))).status()).toBe(400);
  });
});

test.describe("creating a terminal", () => {
  test("spawns in the project root by default", async ({ request }) => {
    const response = await request.post(scoped("/pty"), { data: { title: "scratch" } });
    expect(response.status()).toBe(201);
    const { pty } = await response.json();
    expect(pty.cwd).toBe(DIR);
    expect(pty.title).toBe("scratch");
    // The real server forces a login shell; the mock reproduces it so nothing
    // in the UI starts assuming otherwise.
    expect(pty.args).toEqual(["-l"]);
  });

  test("resolves a workspace-relative cwd", async ({ request }) => {
    const { pty } = await (await request.post(scoped("/pty"), { data: { cwd: "src" } })).json();
    expect(pty.cwd).toBe(`${DIR}/src`);
  });

  test("refuses a cwd that escapes the project", async ({ request }) => {
    // Upstream accepts any cwd, including /etc — verified live against 1.18.21.
    // This is the only thing keeping a shell inside PROJECTS_DIR.
    for (const cwd of ["../", "/etc", "src/../../", "does-not-exist"]) {
      const response = await request.post(scoped("/pty"), { data: { cwd } });
      expect(response.status(), `cwd ${cwd}`).toBeGreaterThanOrEqual(400);
      expect(response.status(), `cwd ${cwd}`).toBeLessThan(500);
    }
  });

  test("only accepts a shell the host reports as acceptable", async ({ request }) => {
    expect((await request.post(scoped("/pty"), { data: { shell: "/bin/zsh" } })).status()).toBe(201);
    expect((await request.post(scoped("/pty"), { data: { shell: "/bin/false" } })).status()).toBe(400);
    expect((await request.post(scoped("/pty"), { data: { shell: "/usr/bin/curl" } })).status()).toBe(400);
  });

  test("refuses to forward an environment or a raw command", async ({ request }) => {
    for (const data of [{ env: { LD_PRELOAD: "/tmp/evil.so" } }, { command: "/usr/bin/curl" }, { args: ["-c", "id"] }]) {
      const response = await request.post(scoped("/pty"), { data });
      expect(response.status(), JSON.stringify(data)).toBe(400);
    }
  });

  test("rejects a control-character title", async ({ request }) => {
    const response = await request.post(scoped("/pty"), { data: { title: "a\u001b[2Jb" } });
    expect(response.status()).toBe(400);
  });

  test("only lists acceptable shells", async ({ request }) => {
    const { shells } = await (await request.get(scoped("/pty/shells"))).json();
    expect(shells.map((shell: { name: string }) => shell.name)).toEqual(["bash", "zsh"]);
  });
});

test.describe("resizing and killing", () => {
  test("resizes within bounds and rejects nonsense", async ({ request }) => {
    expect((await request.put(scoped(`/pty/${RUNNING}`), { data: { size: { rows: 40, cols: 120 } } })).status()).toBe(200);
    for (const size of [{ rows: 0, cols: 80 }, { rows: 40, cols: 99_999 }, { rows: 1.5, cols: 80 }]) {
      expect((await request.put(scoped(`/pty/${RUNNING}`), { data: { size } })).status(), JSON.stringify(size)).toBe(400);
    }
    expect((await request.put(scoped(`/pty/${RUNNING}`), { data: {} })).status()).toBe(400);
  });

  test("kills a terminal in its own project only", async ({ request }) => {
    expect((await request.delete(scoped(`/pty/${RUNNING}`, OTHER_DIR))).status()).toBe(404);
    const killed = await request.delete(scoped(`/pty/${RUNNING}`));
    expect(killed.status()).toBe(200);
    expect(await killed.json()).toEqual({ removed: true });
    expect((await request.get(scoped(`/pty/${RUNNING}`))).status()).toBe(404);
  });
});

test.describe("attach handshake", () => {
  // Playwright's request fixture cannot speak WebSocket, but an upgrade attempt
  // is still an HTTP request, and the refusals are HTTP responses. That is
  // exactly the part worth asserting here.
  const upgradeHeaders = (origin?: string) => ({
    Connection: "Upgrade",
    Upgrade: "websocket",
    "Sec-WebSocket-Version": "13",
    // RFC 6455 wants a fresh 16-byte nonce per handshake. Generated rather than
    // pinned: a hardcoded base64 blob is also what secret scanners flag.
    "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
    ...(origin ? { Origin: origin } : {}),
  });

  test("refuses a foreign origin", async ({ request, baseURL }) => {
    // Browsers do not apply CORS to WebSocket handshakes and opencode itself
    // accepts Origin: evil.example, so this check is the whole boundary.
    const response = await request.get(scoped(`/pty/${RUNNING}/attach`), {
      headers: upgradeHeaders("https://evil.example"),
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(403);
    expect(baseURL).toBeTruthy();
  });

  test("refuses a handshake with no Origin", async ({ request }) => {
    const response = await request.get(scoped(`/pty/${RUNNING}/attach`), {
      headers: upgradeHeaders(),
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(403);
  });

  test("refuses a terminal from another project even from a permitted origin", async ({ request, baseURL }) => {
    const response = await request.get(scoped(`/pty/${RUNNING}/attach`, OTHER_DIR), {
      headers: upgradeHeaders(baseURL as string),
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(404);
  });

  test("refuses an unknown terminal", async ({ request, baseURL }) => {
    const response = await request.get(scoped("/pty/pty_missing/attach"), {
      headers: upgradeHeaders(baseURL as string),
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(404);
  });
});

test.describe("audit trail", () => {
  test("records a terminal being started", async ({ request }) => {
    await request.post(scoped("/pty"), { data: { title: "audited" } });
    await expect
      .poll(async () => {
        const { records } = await (await request.get("/api/notifications/history?kind=pty&limit=50")).json();
        return records.some((record: { title: string }) => record.title === "Terminal started");
      })
      .toBe(true);
  });

  test("records an exit when a terminal is killed", async ({ request }) => {
    await request.delete(scoped(`/pty/${RUNNING}`));
    await expect
      .poll(async () => {
        const { records } = await (await request.get("/api/notifications/history?kind=pty&limit=50")).json();
        return records.some((record: { title: string }) => record.title === "Terminal exited");
      })
      .toBe(true);
  });
});
