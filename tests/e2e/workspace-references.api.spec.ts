import { expect, test } from "@playwright/test";

// Read-only assertions against the fixture project owned by the workspace file
// viewer specs. Nothing here mutates BFF or mock state.
const DIR = process.platform === "darwin" ? "/private/tmp/mock-files-project" : "/tmp/mock-files-project";
const references = `/api/workspace/references?directory=${encodeURIComponent(DIR)}`;

test.describe("workspace reference validation", () => {
  test("classifies each candidate and answers every request slot", async ({ request }) => {
    const paths = [
      "README.md",
      "src/index.ts",
      "src/index.ts",
      "src/deep/nested.ts",
      "src",
      "src/missing.ts",
      ".env",
      ".git/config",
      "generated.txt",
      "../../etc/passwd",
      "/etc/passwd",
      "",
    ];
    const response = await request.post(references, { data: { paths } });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { references: Array<{ path: string; status: string; resolvedPath?: string }> };

    expect(body.references.map((reference) => reference.path)).toEqual(paths);
    expect(body.references.map((reference) => reference.status)).toEqual([
      "file",
      "file",
      "file",
      "file",
      "directory",
      "missing",
      // Secrets, git internals and ignored files stay withheld, and the client
      // learns only that they are not openable.
      "forbidden",
      "forbidden",
      "forbidden",
      "invalid",
      "invalid",
      "invalid",
    ]);
    expect(body.references[0].resolvedPath).toBe("README.md");
    expect(body.references[4].resolvedPath).toBeUndefined();
  });

  test("rejects malformed and oversized batches rather than silently truncating", async ({ request }) => {
    const missingPaths = await request.post(references, { data: {} });
    expect(missingPaths.status()).toBe(400);
    expect(await missingPaths.json()).toMatchObject({ error: "'paths' must be an array" });

    const notAnArray = await request.post(references, { data: { paths: "README.md" } });
    expect(notAnArray.status()).toBe(400);

    // Dropping the overflow would render real references inert with no signal.
    const oversized = await request.post(references, {
      data: { paths: Array.from({ length: 65 }, (_, index) => `src/file-${index}.ts`) },
    });
    expect(oversized.status()).toBe(400);
    expect(await oversized.text()).toContain("64");

    const full = await request.post(references, {
      data: { paths: Array.from({ length: 64 }, () => "README.md") },
    });
    expect(full.status()).toBe(200);
  });

  test("refuses to validate outside a configured project", async ({ request }) => {
    const outside = await request.post("/api/workspace/references?directory=/etc", {
      data: { paths: ["passwd"] },
    });
    expect(outside.status()).toBe(403);

    const missingDirectory = await request.post("/api/workspace/references", { data: { paths: ["README.md"] } });
    expect(missingDirectory.status()).toBe(400);
  });

  test("stays consistent with the read route it gates", async ({ request }) => {
    // Validation must never be a wider door than the route it precedes.
    const secret = await request.get(`/api/workspace/file?directory=${encodeURIComponent(DIR)}&path=.env`);
    expect(secret.status()).toBe(403);
    const ignored = await request.get(`/api/workspace/file?directory=${encodeURIComponent(DIR)}&path=generated.txt`);
    expect(ignored.status()).toBe(403);
    const readable = await request.get(`/api/workspace/file?directory=${encodeURIComponent(DIR)}&path=src/index.ts`);
    expect(readable.status()).toBe(200);
    expect(await readable.json()).toMatchObject({ type: "text" });
  });
});
