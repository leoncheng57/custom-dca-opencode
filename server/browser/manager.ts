// server/browser/manager.ts — one Chromium, one Page per conversation session.
//
// Lifecycle contract (design doc "Live Session Browser — 2026-08-27"):
//   - Chromium launches lazily on first open, never at BFF boot.
//   - One shared persistent context (shared cookie jar — deliberate trade so
//     logged-in browsing works across sessions), one Page per sessionID.
//   - Hard cap on live pages. At the cap, opening REFUSES and names the
//     sessions holding slots; it never evicts, because eviction would reload
//     work sitting in another conversation.
//   - A page not being streamed is frozen (timers halted, renderer
//     reclaimable); an idle reaper closes pages after BROWSER_IDLE_MINUTES.
//     Cookies survive reaping in the persistent profile.
//   - Popups/new tabs are intercepted, never honoured: the URL is surfaced to
//     the client so the drawer can ask "open here or in a new tab?".

import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type CDPSession, type Page } from "playwright-core";

import { assessTarget, type LiveBrowserConfig } from "./policy.js";
import {
  CapacityError,
  NavigationRefused,
  UnknownSessionError,
  validSessionID,
  type BrowserSlot,
  type LiveBrowserInputEvent,
} from "./errors.js";

const VIEWPORT = { width: 1280, height: 800 };

export interface PageState {
  sessionID: string;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  /** Set when the page tried to open a new tab; cleared once read. */
  pendingPopup: string | null;
}

interface Managed {
  page: Page;
  cdp: CDPSession;
  lastUsedAt: number;
  loading: boolean;
  pendingPopup: string | null;
  stream: { res: NodeJS.WritableStream & { destroyed?: boolean }; boundary: string } | null;
}

export class BrowserManager {
  private readonly config: LiveBrowserConfig;
  private readonly profileDir: string;
  private context: BrowserContext | null = null;
  private launching: Promise<BrowserContext> | null = null;
  private readonly pages = new Map<string, Managed>();
  private readonly reaper: NodeJS.Timeout;

  constructor(config: LiveBrowserConfig, profileDir: string) {
    this.config = config;
    this.profileDir = profileDir;
    this.reaper = setInterval(() => void this.reapIdle(), 60_000);
    this.reaper.unref();
  }

  private async contextOrLaunch(): Promise<BrowserContext> {
    if (this.context) return this.context;
    this.launching ??= (async () => {
      // 0700: the profile is a credential store an unauthenticated BFF can
      // drive; it must not be readable by other local users.
      mkdirSync(this.profileDir, { recursive: true, mode: 0o700 });
      const context = await chromium.launchPersistentContext(this.profileDir, {
        headless: true,
        viewport: VIEWPORT,
        acceptDownloads: false,
        ...(this.config.executablePath ? { executablePath: this.config.executablePath } : {}),
      });
      // The SSRF boundary, applied to every request the browser makes —
      // navigation and subresource alike — so a redirect or an <img> cannot
      // widen what the address bar allows.
      await context.route("**/*", async (route) => {
        const verdict = await assessTarget(route.request().url());
        if (verdict.ok) await route.continue().catch(() => undefined);
        else await route.abort("blockedbyclient").catch(() => undefined);
      });
      context.on("close", () => {
        this.context = null;
        this.launching = null;
        this.pages.clear();
      });
      this.context = context;
      return context;
    })().catch((error: unknown) => {
      this.launching = null;
      throw error;
    });
    return this.launching;
  }

  /** Create or reattach the page for a session. Throws CapacityError at the cap. */
  async open(sessionID: string, initialUrl?: string): Promise<PageState> {
    const existing = this.pages.get(sessionID);
    if (existing) {
      existing.lastUsedAt = Date.now();
      if (initialUrl) await this.navigate(sessionID, { action: "goto", url: initialUrl });
      return this.state(sessionID);
    }
    if (this.pages.size >= this.config.maxPages) {
      throw new CapacityError(this.config.maxPages, this.slots());
    }
    const context = await this.contextOrLaunch();
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const managed: Managed = { page, cdp, lastUsedAt: Date.now(), loading: false, pendingPopup: null, stream: null };
    this.pages.set(sessionID, managed);

    page.on("popup", (popup) => {
      // Intercepted, not honoured: a session owns exactly one page. The URL
      // is parked for the drawer's "open here or in a new tab?" prompt.
      void (async () => {
        await popup.waitForLoadState("domcontentloaded", { timeout: 3_000 }).catch(() => undefined);
        const url = popup.url();
        if (url && url !== "about:blank") managed.pendingPopup = url;
        await popup.close().catch(() => undefined);
      })();
    });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) managed.loading = false;
    });
    page.on("close", () => {
      this.endStream(managed);
      this.pages.delete(sessionID);
    });

    if (initialUrl) {
      const verdict = await assessTarget(initialUrl);
      if (verdict.ok) {
        managed.loading = true;
        await page.goto(verdict.url, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => undefined);
        managed.loading = false;
      }
    }
    return this.state(sessionID);
  }

  async state(sessionID: string): Promise<PageState> {
    const managed = this.require(sessionID);
    const history = await managed.cdp
      .send("Page.getNavigationHistory")
      .catch(() => ({ currentIndex: 0, entries: [] as unknown[] }));
    const pendingPopup = managed.pendingPopup;
    managed.pendingPopup = null;
    return {
      sessionID,
      url: managed.page.url(),
      title: await managed.page.title().catch(() => ""),
      canGoBack: history.currentIndex > 0,
      canGoForward: history.currentIndex < history.entries.length - 1,
      loading: managed.loading,
      pendingPopup,
    };
  }

  async navigate(
    sessionID: string,
    request: { action: "goto"; url: string } | { action: "back" | "forward" | "reload" },
  ): Promise<PageState> {
    const managed = this.require(sessionID);
    managed.lastUsedAt = Date.now();
    if (request.action === "goto") {
      // Bare hostnames are a UX affordance of the address bar, not of the policy.
      const candidate = /^[a-z][a-z0-9+.-]*:/i.test(request.url) ? request.url : `https://${request.url}`;
      const verdict = await assessTarget(candidate);
      if (!verdict.ok) throw new NavigationRefused(verdict.reason);
      managed.loading = true;
      await managed.page.goto(verdict.url, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => undefined);
      managed.loading = false;
    } else if (request.action === "back") {
      await managed.page.goBack({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => undefined);
    } else if (request.action === "forward") {
      await managed.page.goForward({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => undefined);
    } else {
      await managed.page.reload({ waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => undefined);
    }
    return this.state(sessionID);
  }

  async input(sessionID: string, event: LiveBrowserInputEvent): Promise<void> {
    const managed = this.require(sessionID);
    managed.lastUsedAt = Date.now();
    const { page } = managed;
    switch (event.type) {
      case "click":
        await page.mouse.click(clamp(event.x, VIEWPORT.width), clamp(event.y, VIEWPORT.height), {
          button: event.button === "right" ? "right" : "left",
        });
        break;
      case "move":
        await page.mouse.move(clamp(event.x, VIEWPORT.width), clamp(event.y, VIEWPORT.height));
        break;
      case "scroll":
        await page.mouse.move(clamp(event.x, VIEWPORT.width), clamp(event.y, VIEWPORT.height));
        await page.mouse.wheel(0, Math.max(-2000, Math.min(2000, event.deltaY)));
        break;
      case "key":
        // Playwright validates key names; an unknown name throws rather than injects.
        await page.keyboard.press(event.key.slice(0, 32));
        break;
      case "type":
        await page.keyboard.type(event.text.slice(0, 1024));
        break;
    }
  }

  /**
   * Attach an MJPEG stream. Only the streamed page is "visible": everything
   * else stays frozen, which is what makes a cap of 10 defensible.
   */
  async attachStream(sessionID: string, res: import("express").Response): Promise<void> {
    const managed = this.require(sessionID);
    this.endStream(managed);
    managed.lastUsedAt = Date.now();
    const boundary = "opencode-live-browser-frame";
    res.writeHead(200, {
      "Content-Type": `multipart/x-mixed-replace; boundary=${boundary}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Connection: "close",
    });
    managed.stream = { res, boundary };
    await managed.cdp.send("Page.setWebLifecycleState", { state: "active" }).catch(() => undefined);

    const onFrame = (frame: { data: string; sessionId: number }) => {
      if (managed.stream?.res !== res || res.destroyed) return;
      const image = Buffer.from(frame.data, "base64");
      res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${image.byteLength}\r\n\r\n`);
      res.write(image);
      res.write("\r\n");
      managed.lastUsedAt = Date.now();
      void managed.cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => undefined);
    };
    managed.cdp.on("Page.screencastFrame", onFrame);
    await managed.cdp
      .send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: VIEWPORT.width, maxHeight: VIEWPORT.height, everyNthFrame: 2 })
      .catch(() => undefined);

    res.on("close", () => {
      managed.cdp.off("Page.screencastFrame", onFrame);
      if (managed.stream?.res === res) managed.stream = null;
      void managed.cdp.send("Page.stopScreencast").catch(() => undefined);
      // Drawer closed: halt timers so the renderer can be reclaimed.
      void managed.cdp.send("Page.setWebLifecycleState", { state: "frozen" }).catch(() => undefined);
    });
  }

  async close(sessionID: string): Promise<void> {
    const managed = this.pages.get(sessionID);
    if (!managed) return;
    this.pages.delete(sessionID);
    this.endStream(managed);
    await managed.page.close().catch(() => undefined);
  }

  slots(): BrowserSlot[] {
    return [...this.pages.entries()].map(([sessionID, managed]) => ({
      sessionID,
      url: managed.page.url(),
      title: "", // titles are fetched lazily by state(); slots stay cheap
      lastUsedAt: managed.lastUsedAt,
      streaming: managed.stream !== null,
    }));
  }

  has(sessionID: string): boolean {
    return this.pages.has(sessionID);
  }

  async shutdown(): Promise<void> {
    clearInterval(this.reaper);
    const context = this.context;
    this.context = null;
    this.pages.clear();
    await context?.close().catch(() => undefined);
  }

  private async reapIdle(): Promise<void> {
    const cutoff = Date.now() - this.config.idleMinutes * 60_000;
    for (const [sessionID, managed] of this.pages) {
      if (managed.stream === null && managed.lastUsedAt < cutoff) {
        await this.close(sessionID);
      }
    }
    // Last page reaped: shut Chromium down too so idle steady-state is ~0.
    if (this.pages.size === 0 && this.context) {
      const context = this.context;
      this.context = null;
      this.launching = null;
      await context.close().catch(() => undefined);
    }
  }

  private endStream(managed: Managed): void {
    const stream = managed.stream;
    managed.stream = null;
    if (stream && !("destroyed" in stream.res && stream.res.destroyed)) {
      try {
        stream.res.end();
      } catch {
        // already gone
      }
    }
  }

  private require(sessionID: string): Managed {
    const managed = this.pages.get(sessionID);
    if (!managed) throw new UnknownSessionError(sessionID);
    return managed;
  }
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));
}

export { CapacityError, NavigationRefused, UnknownSessionError, validSessionID };
export type { BrowserSlot, LiveBrowserInputEvent };
