// server/routes/sessions.ts — the session API the SPA talks to.
//
// Every route is project-scoped. `directory` is required rather than defaulted
// because a silent default would target whichever directory the OpenCode
// server happened to start in, which is a confusing class of bug: the UI shows
// an empty list and nothing appears wrong.

import { Router, type Request, type Response } from "express";

import { OpencodeError, request, type OpencodeConfig } from "../opencode/client.js";
import type { EventBus } from "../opencode/events.js";
import { PathError, requireWorkspaceDirectory } from "../paths.js";
import {
  abortSession,
  createSession,
  deleteSession,
  getSession,
  listMessages,
  listSessions,
  listTodos,
  prompt,
  runningSessions,
  PlanToolDiscoveryError,
  type AgentMode,
} from "../opencode/sessions.js";
import type { PendingPromptDispatcher } from "../pending-prompts/dispatcher.js";
import {
  PendingPromptGuardError,
  PendingPromptLimitError,
  type PendingPromptItem,
} from "../pending-prompts/store.js";
import { createWorktree } from "../opencode/worktrees.js";
import { getModelContextLimit } from "../opencode/config.js";
import { reminderCatalogue } from "../reminders/loader.js";
import { isValidReminderId, type ReminderPreset } from "../reminders/reminders.js";

/** Resolve and validate the project scope for a request. */
async function directoryOf(req: Request): Promise<string> {
  const value = req.query.directory ?? req.body?.directory;
  return requireWorkspaceDirectory(value);
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

function promptAttachments(value: unknown): Array<{ filename: string; mime: string; url: string }> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4) throw new HttpError(400, "at most four image attachments are allowed");
  return value.map((item) => {
    const source = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const filename = typeof source.filename === "string" ? source.filename.slice(0, 200) : "image";
    const mime = typeof source.mime === "string" ? source.mime : "";
    const url = typeof source.url === "string" ? source.url : "";
    if (!/^image\/(png|jpeg|gif|webp)$/.test(mime) || !url.startsWith(`data:${mime};base64,`) || url.length > 4_200_000) {
      throw new HttpError(400, "attachments must be PNG, JPEG, GIF or WebP data URLs under 3 MiB");
    }
    return { filename, mime, url };
  });
}

function promptReminder(value: unknown): ReminderPreset | undefined {
  if (value === undefined) return undefined;
  if (!isValidReminderId(value)) throw new HttpError(400, "reminder must be a valid preset id");
  const preset = reminderCatalogue().find((item) => item.id === value);
  if (!preset) throw new HttpError(400, `unknown reminder "${value}"`);
  return preset;
}

function promptMode(value: unknown): AgentMode {
  if (value === undefined) return "build";
  if (value !== "plan" && value !== "build") throw new HttpError(400, "mode must be 'plan' or 'build'");
  return value;
}

function promptModel(value: unknown): { providerID: string; modelID: string } | undefined {
  if (value === undefined) return undefined;
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const providerID = typeof source.providerID === "string" ? source.providerID.trim() : "";
  const modelID = typeof source.modelID === "string" ? source.modelID.trim() : "";
  if (!providerID || !modelID || providerID.length > 200 || modelID.length > 200) {
    throw new HttpError(400, "model must contain providerID and modelID");
  }
  return { providerID, modelID };
}

function promptInput(body: Record<string, unknown> | undefined) {
  const { text, model, attachments, reminder } = body ?? {};
  if (typeof text !== "string" || !text.trim()) throw new HttpError(400, "'text' is required");
  return {
    text,
    mode: promptMode(body?.mode),
    model: promptModel(model),
    attachments: promptAttachments(attachments),
    reminder: promptReminder(reminder),
  };
}

function publicPendingItem(item: PendingPromptItem) {
  return {
    id: item.id,
    directory: item.directory,
    sessionID: item.sessionID,
    sequence: item.sequence,
    text: item.text,
    mode: item.mode,
    model: item.model,
    attachments: (item.attachments ?? []).map(({ filename, mime }) => ({ filename, mime })),
    reminder: item.reminder?.id,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastError: item.lastError,
  };
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
  if (error instanceof HttpError || error instanceof PathError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof PendingPromptLimitError) {
    res.status(413).json({ error: error.message });
    return;
  }
  if (error instanceof PendingPromptGuardError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof PlanToolDiscoveryError) {
    res.status(502).json({ error: error.message });
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

export function sessionRoutes(config: OpencodeConfig, bus: EventBus, pending: PendingPromptDispatcher): Router {
  const router = Router();

  router.get(
    "/sessions",
    asyncRoute(async (req, res) => {
      const directory = await directoryOf(req);
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
      const projectDirectory = await directoryOf(req);
      const { title, model, prompt: initialPrompt, isolated, worktreeName } = req.body ?? {};
      const mode = promptMode(req.body?.mode);
      const directory = isolated === true
        ? (await createWorktree(
            config,
            bus,
            projectDirectory,
            typeof worktreeName === "string" ? worktreeName : undefined,
          )).directory
        : projectDirectory;
      const session = await createSession(config, { directory, title, agent: mode, model });
      // Fire-and-forget the opening turn so the response is not held for it.
      if (typeof initialPrompt === "string" && initialPrompt.trim()) {
        await prompt(config, directory, session.id, { text: initialPrompt, mode, model });
      }
      res.status(201).json({ session });
    }),
  );

  router.get(
    "/sessions/:id",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      res.json({ session: await getSession(config, directory, paramOf(req, "id")) });
    }),
  );

  router.delete(
    "/sessions/:id",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      await deleteSession(config, directory, paramOf(req, "id"));
      res.status(204).end();
    }),
  );

  router.get(
    "/sessions/:id/messages",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
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
      const directory = await directoryOf(req);
      res.json({ todos: await listTodos(config, directory, paramOf(req, "id")) });
    }),
  );

  router.get(
    "/sessions/:id/model-limit",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      const session = await getSession(config, directory, paramOf(req, "id"));
      const providerID = session.model?.providerID;
      const modelID = session.model?.modelID;
      const context = providerID && modelID
        ? await getModelContextLimit(config, directory, providerID, modelID)
        : null;
      res.json({ context });
    }),
  );

  router.post(
    "/sessions/:id/prompt",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      await prompt(config, directory, paramOf(req, "id"), promptInput(req.body));
      // 202: accepted, running server-side. Progress arrives over SSE.
      res.status(202).json({ accepted: true });
    }),
  );

  router.post(
    "/sessions/:id/steer",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      const sessionID = paramOf(req, "id");
      const running = await runningSessions(config, directory);
      if (!running.has(sessionID)) {
        throw new HttpError(409, "session is idle; send this as a normal prompt");
      }
      // The active turn can finish after this preflight and before prompt_async.
      // That unavoidable race may make this the next normal turn; it never aborts.
      await prompt(config, directory, sessionID, promptInput(req.body));
      res.status(202).json({ accepted: true });
    }),
  );

  router.get(
    "/sessions/:id/pending-prompts",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      const state = await pending.store.get(directory, paramOf(req, "id"));
      res.json({
        items: state.items.map(publicPendingItem),
        paused: state.paused,
        pauseReason: state.pauseReason,
        phase: state.phase,
      });
    }),
  );

  router.post(
    "/sessions/:id/pending-prompts",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      const sessionID = paramOf(req, "id");
      const idempotencyKey = req.body?.idempotencyKey;
      if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_.:-]{8,200}$/.test(idempotencyKey)) {
        throw new HttpError(400, "a valid idempotencyKey is required");
      }
      const item = await pending.store.add(directory, sessionID, idempotencyKey, promptInput(req.body));
      void pending.reconcile(directory, sessionID);
      res.status(201).json({ item: publicPendingItem(item) });
    }),
  );

  router.patch(
    "/sessions/:id/pending-prompts/:itemId",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      const text = req.body?.text;
      if (typeof text !== "string" || !text.trim()) throw new HttpError(400, "'text' is required");
      const item = await pending.store.edit(directory, paramOf(req, "id"), paramOf(req, "itemId"), text);
      res.json({ item: publicPendingItem(item) });
    }),
  );

  router.delete(
    "/sessions/:id/pending-prompts/:itemId",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      await pending.store.remove(directory, paramOf(req, "id"), paramOf(req, "itemId"));
      res.status(204).end();
    }),
  );

  router.post(
    "/sessions/:id/pending-prompts/:itemId/steer",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      await pending.steer(directory, paramOf(req, "id"), paramOf(req, "itemId"));
      res.status(202).json({ accepted: true });
    }),
  );

  router.post(
    "/sessions/:id/pending-prompts/pause",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      await pending.pause(directory, paramOf(req, "id"));
      res.json({ paused: true });
    }),
  );

  router.post(
    "/sessions/:id/pending-prompts/resume",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      await pending.resume(directory, paramOf(req, "id"));
      res.json({ paused: false });
    }),
  );

  router.post(
    "/sessions/:id/abort",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      const sessionID = paramOf(req, "id");
      await pending.pause(directory, sessionID, "stopped");
      await abortSession(config, directory, sessionID);
      res.json({ aborted: true });
    }),
  );

  router.get(
    "/permission-requests",
    asyncRoute(async (req, res) => {
      const directory = await directoryOf(req);
      res.json({ requests: await request<unknown[]>(config, "/permission", { directory }) });
    }),
  );

  router.post(
    "/permission-requests/:requestId/reply",
    asyncRoute(async (req, res) => {
      const directory = await directoryOf(req);
      const reply = req.body?.reply;
      if (reply !== "once" && reply !== "always" && reply !== "reject") {
        throw new HttpError(400, "reply must be 'once', 'always' or 'reject'");
      }
      await request<boolean>(config, `/permission/${encodeURIComponent(paramOf(req, "requestId"))}/reply`, {
        method: "POST",
        directory,
        body: { reply, ...(typeof req.body?.message === "string" ? { message: req.body.message } : {}) },
      });
      res.json({ replied: true });
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
