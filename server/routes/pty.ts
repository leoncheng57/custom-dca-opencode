// server/routes/pty.ts — browser-facing REST for the PTY terminal.
//
// Mounted only when PTY_ENABLED names a mode (see server/index.ts). Absent flag
// means these paths genuinely do not exist, which is what issue #59 asked for
// and a deliberate departure from the PREVIEW_ALLOWED_PORTS precedent of
// always-mounted-then-403: preview's inert state is a port list, this one is a
// shell.
//
// The WebSocket half lives in ./ptySocket.ts because Express 5 cannot handle an
// upgrade; both halves share the mode and the same confinement rules.

import { Router, type Request, type Response } from "express";

import { OpencodeError, type OpencodeConfig } from "../opencode/client.js";
import {
  createPty,
  getPty,
  listPtyShells,
  listPtys,
  removePty,
  updatePty,
  type Pty,
  type PtyShell,
} from "../opencode/pty.js";
import {
  PathError,
  requireWorkspaceDirectory,
  requireWorkspaceSubdirectory,
} from "../paths.js";
import {
  ptyAllowsCreate,
  ptyAllowsInput,
  ptyAllowsKill,
  ptyAllowsUpdate,
  type PtyMode,
} from "../ptyPolicy.js";

const MAX_TITLE_LENGTH = 120;
/** xterm.js will not usefully render beyond this, and upstream takes any int. */
const MAX_DIMENSION = 1000;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function fail(res: Response, error: unknown): void {
  if (error instanceof HttpError || error instanceof PathError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof OpencodeError) {
    // Upstream answers 404 PtyNotFoundError both for an unknown id and for one
    // addressed through the wrong project. Passing that through unchanged is
    // what confines a PTY to its directory.
    if (error.status >= 400 && error.status < 500) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    res.status(502).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
}

const asyncRoute =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response): void => {
    handler(req, res).catch((error: unknown) => fail(res, error));
  };

async function directoryOf(req: Request): Promise<string> {
  return requireWorkspaceDirectory(req.query.directory ?? req.body?.directory);
}

function ptyIdOf(req: Request): string {
  const value = req.params.id;
  // Upstream's own schema pins the prefix; rejecting here keeps a stray path
  // segment from being forwarded as an id.
  if (typeof value !== "string" || !/^pty[A-Za-z0-9_-]*$/.test(value)) {
    throw new HttpError(400, "invalid 'id' path parameter");
  }
  return value;
}

function bodyOf(req: Request, allowed: readonly string[]): Record<string, unknown> {
  const body = req.body;
  if (body === undefined || body === null) return {};
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "request body must be a JSON object");
  }
  const permitted = new Set([...allowed, "directory"]);
  for (const key of Object.keys(body as Record<string, unknown>)) {
    if (!permitted.has(key)) throw new HttpError(400, `unexpected body field '${key}'`);
  }
  return body as Record<string, unknown>;
}

function optionalTitle(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new HttpError(400, "'title' must be a string");
  const title = value.trim();
  if (!title) return undefined;
  if (title.length > MAX_TITLE_LENGTH) {
    throw new HttpError(400, `'title' must be at most ${MAX_TITLE_LENGTH} characters`);
  }
  // A title is echoed back into the PTY list; control characters would let it
  // rewrite the surrounding terminal render.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(title)) {
    throw new HttpError(400, "'title' must not contain control characters");
  }
  return title;
}

function dimension(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_DIMENSION) {
    throw new HttpError(400, `'size.${name}' must be an integer between 1 and ${MAX_DIMENSION}`);
  }
  return parsed;
}

function optionalSize(value: unknown): { rows: number; cols: number } | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "'size' must be an object with 'rows' and 'cols'");
  }
  const source = value as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (key !== "rows" && key !== "cols") throw new HttpError(400, `unexpected size field '${key}'`);
  }
  return { rows: dimension(source.rows, "rows"), cols: dimension(source.cols, "cols") };
}

/**
 * Resolve the shell to spawn.
 *
 * PTY_SHELL, when set, pins it: the browser may not choose. When unset the
 * browser may pick from the shells upstream itself reports as acceptable, and
 * omitting the choice lets upstream apply its own default.
 *
 * This allowlist is not pretending to be a security control — an interactive
 * shell is arbitrary execution however you spell it. Its job is to stop this
 * endpoint from also being a general-purpose "run this binary" API, which is a
 * strictly larger surface than the terminal the feature is for.
 */
async function resolveShell(
  config: OpencodeConfig,
  directory: string,
  requested: unknown,
  pinnedShell: string | null,
): Promise<string | undefined> {
  if (pinnedShell) {
    if (requested !== undefined && requested !== pinnedShell) {
      throw new HttpError(400, "the shell is pinned by PTY_SHELL on this server");
    }
    return pinnedShell;
  }
  if (requested === undefined) return undefined;
  if (typeof requested !== "string" || !requested) {
    throw new HttpError(400, "'shell' must be an absolute path to an acceptable shell");
  }
  const shells = await listPtyShells(config, directory);
  if (!shells.some((shell) => shell.acceptable && shell.path === requested)) {
    throw new HttpError(400, "'shell' is not one of the shells this host reports as acceptable");
  }
  return requested;
}

export interface PtyRouteOptions {
  mode: PtyMode;
  /** Absolute path from PTY_SHELL, or null to let the browser/upstream choose. */
  shell: string | null;
}

export function ptyRoutes(config: OpencodeConfig, options: PtyRouteOptions): Router {
  const { mode, shell: pinnedShell } = options;
  const router = Router();

  const requireMode = (allowed: boolean, action: string): void => {
    if (!allowed) {
      throw new HttpError(403, `PTY_ENABLED=${mode} does not permit ${action}`);
    }
  };

  /**
   * What this server will actually let the browser do. The UI renders from
   * this instead of guessing, so a read-only deployment never shows an input
   * caret it cannot honour.
   */
  router.get("/pty/capabilities", (_req: Request, res: Response) => {
    res.json({
      mode,
      canCreate: ptyAllowsCreate(mode),
      canInput: ptyAllowsInput(mode),
      canKill: ptyAllowsKill(mode),
      canUpdate: ptyAllowsUpdate(mode),
      shellPinned: Boolean(pinnedShell),
    });
  });

  router.get(
    "/pty/shells",
    asyncRoute(async (req, res) => {
      // Only useful for the create form, and it enumerates host configuration.
      requireMode(ptyAllowsCreate(mode), "listing shells");
      const directory = await directoryOf(req);
      const shells = await listPtyShells(config, directory);
      res.json({ shells: shells.filter((entry: PtyShell) => entry.acceptable) });
    }),
  );

  router.get(
    "/pty",
    asyncRoute(async (req, res) => {
      const directory = await directoryOf(req);
      const ptys = await listPtys(config, directory);
      // The canonical directory goes back with the list: `Pty.cwd` is canonical
      // (upstream resolved it) while the browser's ?directory= may be an alias
      // — /tmp vs /private/tmp on macOS — and the UI shortens one against the
      // other.
      res.json({ directory, ptys });
    }),
  );

  router.post(
    "/pty",
    asyncRoute(async (req, res) => {
      requireMode(ptyAllowsCreate(mode), "creating a terminal");
      const directory = await directoryOf(req);
      const body = bodyOf(req, ["cwd", "title", "shell"]);
      // cwd is workspace-relative and resolved against the validated project.
      // Upstream accepts any absolute cwd (verified: /etc succeeds), so this is
      // the only thing keeping a shell inside PROJECTS_DIR.
      const cwd = await requireWorkspaceSubdirectory(directory, body.cwd);
      const command = await resolveShell(config, directory, body.shell, pinnedShell);
      const title = optionalTitle(body.title);
      const pty = await createPty(config, directory, {
        ...(command ? { command } : {}),
        cwd,
        ...(title ? { title } : {}),
      });
      res.status(201).json({ pty });
    }),
  );

  router.get(
    "/pty/:id",
    asyncRoute(async (req, res) => {
      const directory = await directoryOf(req);
      const pty: Pty = await getPty(config, directory, ptyIdOf(req));
      res.json({ pty });
    }),
  );

  router.put(
    "/pty/:id",
    asyncRoute(async (req, res) => {
      requireMode(ptyAllowsUpdate(mode), "resizing or retitling a terminal");
      const directory = await directoryOf(req);
      const body = bodyOf(req, ["title", "size"]);
      const title = optionalTitle(body.title);
      const size = optionalSize(body.size);
      if (title === undefined && size === undefined) {
        throw new HttpError(400, "body must contain 'title' and/or 'size'");
      }
      const pty = await updatePty(config, directory, ptyIdOf(req), {
        ...(title !== undefined ? { title } : {}),
        ...(size !== undefined ? { size } : {}),
      });
      res.json({ pty });
    }),
  );

  router.delete(
    "/pty/:id",
    asyncRoute(async (req, res) => {
      requireMode(ptyAllowsKill(mode), "killing a terminal");
      const directory = await directoryOf(req);
      const removed = await removePty(config, directory, ptyIdOf(req));
      res.json({ removed: removed !== false });
    }),
  );

  return router;
}
