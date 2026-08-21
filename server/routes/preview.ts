import { Router, type Request, type Response } from "express";

const MAX_BYTES = 25 * 1024 * 1024;
const FORWARD_HEADERS = ["accept", "accept-language", "range"] as const;
const RESPONSE_HEADERS = [
  "content-type",
  "content-range",
  "accept-ranges",
  "cache-control",
  "etag",
  "last-modified",
] as const;

export function parseAllowedPorts(
  value: string | undefined,
  forbidden: number[] = [],
): Set<number> {
  const blocked = new Set(forbidden);
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => Number(entry.trim()))
      .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535 && !blocked.has(port)),
  );
}

function forwardPath(req: Request): string {
  const match = /^\/preview\/\d+(\/.*)?$/.exec(req.path);
  return match?.[1] || "/";
}

async function readLimited(body: ReadableStream<Uint8Array> | null): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks, total);
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new RangeError("preview response exceeds 25 MiB");
    }
    chunks.push(Buffer.from(value));
  }
}

export function previewRoutes(allowedPorts: Set<number>): Router {
  const router = Router();
  router.all(/^\/preview\/(\d+)(\/.*)?$/, async (req: Request, res: Response) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).set("Allow", "GET, HEAD").json({ error: "preview supports GET and HEAD only" });
      return;
    }
    const port = Number(req.params[0]);
    if (!allowedPorts.has(port)) {
      res.status(403).json({ error: "preview port is not allowlisted" });
      return;
    }

    const target = new URL(forwardPath(req), `http://127.0.0.1:${port}`);
    const original = new URL(req.originalUrl, "http://bff.invalid");
    target.search = original.search;
    const headers: Record<string, string> = {};
    for (const name of FORWARD_HEADERS) {
      const value = req.get(name);
      if (value) headers[name] = value;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        redirect: "manual",
        signal: controller.signal,
      });
      const contentLength = Number(upstream.headers.get("content-length") ?? 0);
      if (contentLength > MAX_BYTES) {
        res.status(413).json({ error: "preview response exceeds 25 MiB" });
        return;
      }
      for (const name of RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) res.set(name, value);
      }
      res.set("Content-Security-Policy", "sandbox allow-forms allow-modals allow-popups allow-scripts");
      res.set("X-Content-Type-Options", "nosniff");
      const location = upstream.headers.get("location");
      if (location) {
        const destination = new URL(location, target);
        if (destination.origin !== target.origin) {
          res.status(502).json({ error: "preview refused a cross-origin redirect" });
          return;
        }
        res.set("location", `/api/preview/${port}${destination.pathname}${destination.search}${destination.hash}`);
      }
      if (req.method === "HEAD") {
        res.status(upstream.status).end();
        return;
      }
      const body = await readLimited(upstream.body);
      res.status(upstream.status).send(body);
    } catch (error) {
      if (error instanceof RangeError) {
        res.removeHeader("content-length");
        res.removeHeader("content-range");
        res.status(413).json({ error: error.message });
      } else {
        const message = error instanceof Error && error.name === "AbortError" ? "preview timed out" : "preview target unavailable";
        res.status(502).json({ error: message });
      }
    } finally {
      clearTimeout(timeout);
    }
  });
  return router;
}
