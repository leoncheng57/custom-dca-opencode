// server/routes/sessions.ts — the session API the SPA talks to.
//
// Every route is project-scoped. `directory` is required rather than defaulted
// because a silent default would target whichever directory the OpenCode
// server happened to start in, which is a confusing class of bug: the UI shows
// an empty list and nothing appears wrong.

import { Router, type Request, type Response } from "express";

import { OpencodeError, type OpencodeConfig } from "../opencode/client.js";
import type { EventBus } from "../opencode/events.js";
import {
  abortSession,
  createSession,
  deleteSession,
  getSession,
  listMessages,
  listSessions,
  listTodos,
  prompt,
} from "../opencode/sessions.js";

/** Resolve and validate the project scope for a request. */
function directoryOf(req: Request): string {
  const value = req.query.directory ?? req.body?.directory;
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "a 'directory' query parameter is required");
  }
  if (!value.startsWith("/")) {
    throw new HttpError(400, "'directory' must be an absolute path");
  }
  return value;
}

/**
 * Express 5 types route params as `string | string[]` (a repeated `:id` in the
 * path would produce an array). Ours never repeat, so reject the array form
 * rather than silently taking the first element.
 */
function paramOf(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || !value) {
    throw new HttpError(400, `invalid '${name}' path parameter`);
  }
  return value;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Map thrown errors onto responses without leaking stack traces.
 *
 * OpenCode answers 500 (`UnknownError`) for an unknown session id rather than
 * 404, so a stale bookmark would otherwise surface as "bad gateway". Callers
 * that know they were addressing a specific session pass `notFoundOn5xx` to
 * get the honest status instead.
 */
function fail(res: Response, error: unknown, options: { notFoundOn5xx?: boolean } = {}): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof OpencodeError) {
    if (error.status >= 400 && error.status < 500) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (options.notFoundOn5xx) {
      res.status(404).json({ error: "session not found" });
      return;
    }
    // Otherwise the agent server itself is unhealthy.
    res.status(502).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
}

const asyncRoute =
  (
    handler: (req: Request, res: Response) => Promise<void>,
    options: { notFoundOn5xx?: boolean } = {},
  ) =>
  (req: Request, res: Response): void => {
    handler(req, res).catch((error: unknown) => fail(res, error, options));
  };

/** Routes addressing one session by id: upstream 5xx most likely means gone. */
const sessionRoute = (handler: (req: Request, res: Response) => Promise<void>) =>
  asyncRoute(handler, { notFoundOn5xx: true });

export function sessionRoutes(config: OpencodeConfig, bus: EventBus): Router {
  const router = Router();

  router.get(
    "/sessions",
    asyncRoute(async (req, res) => {
      const directory = directoryOf(req);
      const limit = Number(req.query.limit ?? 100);
      const sessions = await listSessions(config, directory, {
        limit: Number.isFinite(limit) ? limit : 100,
        rootsOnly: req.query.roots === "true",
        search: typeof req.query.search === "string" ? req.query.search : undefined,
      });
      res.json({ sessions });
    }),
  );

  router.post(
    "/sessions",
    asyncRoute(async (req, res) => {
      const directory = directoryOf(req);
      const { title, agent, model, prompt: initialPrompt } = req.body ?? {};
      const session = await createSession(config, { directory, title, agent, model });
      // Fire-and-forget the opening turn so the response is not held for it.
      if (typeof initialPrompt === "string" && initialPrompt.trim()) {
        await prompt(config, directory, session.id, { text: initialPrompt, agent, model });
      }
      res.status(201).json({ session });
    }),
  );

  router.get(
    "/sessions/:id",
    sessionRoute(async (req, res) => {
      const directory = directoryOf(req);
      res.json({ session: await getSession(config, directory, paramOf(req, "id")) });
    }),
  );

  router.delete(
    "/sessions/:id",
    sessionRoute(async (req, res) => {
      const directory = directoryOf(req);
      await deleteSession(config, directory, paramOf(req, "id"));
      res.status(204).end();
    }),
  );

  router.get(
    "/sessions/:id/messages",
    sessionRoute(async (req, res) => {
      const directory = directoryOf(req);
      // Raw {info, parts} — the client adapter owns the shaping so there is
      // exactly one place that understands OpenCode's wire format.
      const [messages, session] = await Promise.all([
        listMessages(config, directory, paramOf(req, "id")),
        getSession(config, directory, paramOf(req, "id")).catch(() => null),
      ]);
      res.json({ messages, running: session?.running ?? false });
    }),
  );

  router.get(
    "/sessions/:id/todos",
    sessionRoute(async (req, res) => {
      const directory = directoryOf(req);
      res.json({ todos: await listTodos(config, directory, paramOf(req, "id")) });
    }),
  );

  router.post(
    "/sessions/:id/prompt",
    sessionRoute(async (req, res) => {
      const directory = directoryOf(req);
      const { text, agent, model } = req.body ?? {};
      if (typeof text !== "string" || !text.trim()) {
        throw new HttpError(400, "'text' is required");
      }
      await prompt(config, directory, paramOf(req, "id"), { text, agent, model });
      // 202: accepted, running server-side. Progress arrives over SSE.
      res.status(202).json({ accepted: true });
    }),
  );

  router.post(
    "/sessions/:id/abort",
    sessionRoute(async (req, res) => {
      const directory = directoryOf(req);
      await abortSession(config, directory, paramOf(req, "id"));
      res.json({ aborted: true });
    }),
  );

  /**
   * SSE fan-out. One upstream subscription serves every connected tab.
   *
   * Optionally filtered by ?directory= so a project view is not woken by
   * activity in an unrelated repo.
   */
  router.get("/events", (req: Request, res: Response) => {
    const scope = typeof req.query.directory === "string" ? req.query.directory : undefined;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx and friends buffer SSE into uselessness without this.
      "X-Accel-Buffering": "no",
    });
    res.write(`data: ${JSON.stringify({ type: "connected", properties: {} })}\n\n`);

    const onEvent = (event: { type: string; properties: unknown; directory?: string }) => {
      if (scope && event.directory && event.directory !== scope) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    bus.on("event", onEvent);

    // Keep intermediaries from closing an idle connection. Upstream sends its
    // own heartbeat but we may be filtering all of it out.
    const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15_000);

    req.on("close", () => {
      clearInterval(keepAlive);
      bus.off("event", onEvent);
    });
  });

  return router;
}
