// server/browser/errors.ts — error types shared by routes and manager.
//
// Separate module so routes.ts never imports manager.ts (and therefore never
// loads playwright-core) in a deployment where the live browser is disabled.

export interface BrowserSlot {
  sessionID: string;
  url: string;
  title: string;
  lastUsedAt: number;
  streaming: boolean;
}

export class CapacityError extends Error {
  readonly slots: BrowserSlot[];
  constructor(max: number, slots: BrowserSlot[]) {
    super(`browser limit reached (${slots.length} of ${max})`);
    this.slots = slots;
  }
}

export class UnknownSessionError extends Error {
  constructor(sessionID: string) {
    super(`no live browser for session ${sessionID}`);
  }
}

export class NavigationRefused extends Error {}

export type LiveBrowserInputEvent =
  | { type: "click"; x: number; y: number; button?: "left" | "right" }
  | { type: "move"; x: number; y: number }
  | { type: "scroll"; x: number; y: number; deltaY: number }
  | { type: "key"; key: string }
  | { type: "type"; text: string };

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function validSessionID(value: string): boolean {
  return SESSION_ID.test(value);
}
