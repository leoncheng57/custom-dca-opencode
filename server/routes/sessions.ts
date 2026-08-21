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
  ModePolicyActivationError,
  type AgentMode,
} from "../opencode/sessions.js";
import { createWorktree } from "../opencode/worktrees.js";
import {
  getModelCatalogue,
  getModelContextLimit,
  isSelectableModel,
  ModelCatalogueError,
  type ModelSelection,
} from "../opencode/config.js";
import { reminderCatalogue } from "../reminders/loader.js";
import { isValidReminderId, type ReminderPreset } from "../reminders/reminders.js";
import { eventClickUrl } from "../publicAppUrl.js";
import { parseQuestionRequests, validateQuestionAnswers, type QuestionRequest } from "../opencode/questions.js";

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
    const prefix = `data:${mime};base64,`;
    const encoded = url.startsWith(prefix) ? url.slice(prefix.length) : "";
    const validBase64 = encoded.length > 0 && encoded.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(encoded);
    const decodedBytes = validBase64 ? Buffer.byteLength(encoded, "base64") : Number.POSITIVE_INFINITY;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(mime) || !validBase64 || decodedBytes > 3 * 1024 * 1024) {
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

async function selectedModel(
  config: OpencodeConfig,
  directory: string,
  value: unknown,
): Promise<ModelSelection | undefined> {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "model must contain providerID and modelID");
  }
  const source = value as Record<string, unknown>;
  const allowed = new Set(["providerID", "modelID", "variant"]);
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) throw new HttpError(400, `unsupported model field '${key}'`);
  }
  if (typeof source.providerID !== "string" || !source.providerID.trim() ||
      typeof source.modelID !== "string" || !source.modelID.trim()) {
    throw new HttpError(400, "model must contain providerID and modelID");
  }
  if (source.variant !== undefined && (typeof source.variant !== "string" || !source.variant.trim())) {
    throw new HttpError(400, "model variant must be a non-empty string");
  }
  const model: ModelSelection = {
    providerID: source.providerID.trim(),
    modelID: source.modelID.trim(),
    ...(typeof source.variant === "string" ? { variant: source.variant.trim() } : {}),
  };
  if (!isSelectableModel(await getModelCatalogue(config, directory), model)) {
    throw new HttpError(400, `unknown or disabled model or variant "${model.providerID}/${model.modelID}${model.variant ? `/${model.variant}` : ""}"`);
  }
  return model;
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
  if (error instanceof ModePolicyActivationError) {
    res.status(502).json({ error: error.message });
    return;
  }
  if (error instanceof ModelCatalogueError) {
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

export function sessionRoutes(config: OpencodeConfig, bus: EventBus, publicAppUrl: string | null = null): Router {
  const router = Router();
  const pendingQuestions = async (directory: string): Promise<QuestionRequest[]> => {
    try {
      return parseQuestionRequests(await request<unknown>(config, "/question", { directory }));
    } catch (error) {
      throw new HttpError(502, error instanceof Error ? error.message : String(error));
    }
  };

  router.get(
    "/models",
    asyncRoute(async (req, res) => {
      const directory = await directoryOf(req);
      res.json(await getModelCatalogue(config, directory));
    }),
  );

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
      // Validate before creating an isolated worktree so rejected input has no side effects.
      const validatedModel = await selectedModel(config, projectDirectory, model);
      const directory = isolated === true
        ? (await createWorktree(
            config,
            bus,
            projectDirectory,
            typeof worktreeName === "string" ? worktreeName : undefined,
          )).directory
        : projectDirectory;
      const session = await createSession(config, { directory, title, agent: mode, model: validatedModel });
      // Fire-and-forget the opening turn so the response is not held for it.
      if (typeof initialPrompt === "string" && initialPrompt.trim()) {
        await prompt(config, directory, session.id, { text: initialPrompt, mode, model: validatedModel });
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
      const { text, model, attachments, reminder } = req.body ?? {};
      if (typeof text !== "string" || !text.trim()) {
        throw new HttpError(400, "'text' is required");
      }
      await prompt(config, directory, paramOf(req, "id"), {
        text,
        mode: promptMode(req.body?.mode),
        model: await selectedModel(config, directory, model),
        attachments: promptAttachments(attachments),
        reminder: promptReminder(reminder),
      });
      // 202: accepted, running server-side. Progress arrives over SSE.
      res.status(202).json({ accepted: true });
    }),
  );

  router.post(
    "/sessions/:id/abort",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      await abortSession(config, directory, paramOf(req, "id"));
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

  const ownedQuestion = async (directory: string, sessionID: string, requestID: string): Promise<QuestionRequest> => {
    const pending = await pendingQuestions(directory);
    const found = pending.find((item) => item.id === requestID && item.sessionID === sessionID);
    if (!found) throw new HttpError(404, "question request not found for this session");
    return found;
  };

  router.get(
    "/sessions/:id/questions",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      const sessionID = paramOf(req, "id");
      const pending = await pendingQuestions(directory);
      res.json({ requests: pending.filter((item) => item.sessionID === sessionID) });
    }),
  );

  router.post(
    "/sessions/:id/questions/:requestId/reply",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      const pending = await ownedQuestion(directory, paramOf(req, "id"), paramOf(req, "requestId"));
      const replied = await request<boolean>(config, `/question/${encodeURIComponent(pending.id)}/reply`, {
        method: "POST",
        directory,
        body: { answers: (() => {
          try {
            return validateQuestionAnswers(pending.questions, req.body?.answers);
          } catch (error) {
            throw new HttpError(400, error instanceof Error ? error.message : String(error));
          }
        })() },
      });
      if (!replied) throw new HttpError(409, "OpenCode did not accept the question reply");
      res.json({ replied: true });
    }),
  );

  router.post(
    "/sessions/:id/questions/:requestId/reject",
    sessionRoute(async (req, res) => {
      const directory = await directoryOf(req);
      const pending = await ownedQuestion(directory, paramOf(req, "id"), paramOf(req, "requestId"));
      const rejected = await request<boolean>(config, `/question/${encodeURIComponent(pending.id)}/reject`, {
        method: "POST",
        directory,
      });
      if (!rejected) throw new HttpError(409, "OpenCode did not accept the question rejection");
      res.json({ rejected: true });
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
      const properties = event.properties && typeof event.properties === "object"
        ? event.properties as Record<string, unknown>
        : {};
      res.write(`data: ${JSON.stringify({ ...event, click: eventClickUrl(publicAppUrl, { ...event, properties }) })}\n\n`);
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
