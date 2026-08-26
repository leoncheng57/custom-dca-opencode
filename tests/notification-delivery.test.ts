// tests/notification-delivery.test.ts
//
// The browser half of the suppression contract.
//
// `server/notifications/service.ts` decides who gets told, and
// `tests/notifications.test.ts` covers that it stamps the verdict onto
// `notification.recorded`. Nothing covered the other end: that an open tab
// obeys the verdict rather than ringing anyway. Deleting one line —
// `recordedKind`'s `if (properties.suppressed) return null` — restores the
// over-notification bug (a desktop popup, a sound and speech for every
// delegated child's turn and every auto-approved permission, while the inbox
// swears nothing happened) and, before this file, broke no test at all.
//
// Each medium is asserted against a positive control, so an accidentally inert
// harness cannot pass by being silent for the wrong reason.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationPreferences } from "../client/lib/api.js";
import { normalizeDeviceNotificationPreferences } from "../client/lib/notificationMedia.js";
import { unlockNotificationAudio } from "../client/lib/notificationMediaBrowser.js";
import { createRecordedMediaSink } from "../client/lib/useNotifyWatcher.js";
import { SUPPRESSION_REASONS } from "../server/notifications/history.js";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "../server/notifications/preferences.js";

/** Server preferences with every browser channel on, so silence means policy. */
const preferences: NotificationPreferences = {
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  browser: {
    ...DEFAULT_NOTIFICATION_PREFERENCES.browser,
    desktop: true,
    events: { idle: true, error: true, abort: true, permission: true, question: true, parked: true },
  },
};

const devicePreferences = normalizeDeviceNotificationPreferences({
  sound: { enabled: true, volume: 0.5, profile: "distinct" },
  speech: { enabled: true, rate: 1 },
});

interface MediaCalls {
  tones: number;
  spoken: string[];
  desktop: Array<{ title: string; tag?: string }>;
}

let media: MediaCalls;

/**
 * Enough of a browser for the three media paths to be observable. `window` is
 * `globalThis` because that is what it is in a browser, so `"Notification" in
 * window` and `window.AudioContext` resolve against the stubs below.
 */
async function installBrowser(): Promise<void> {
  media = { tones: 0, spoken: [], desktop: [] };
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    state = "suspended";
    resume() { this.state = "running"; return Promise.resolve(); }
    createOscillator() {
      return {
        frequency: { value: 0 },
        type: "sine",
        connect() { return this; },
        start() { media.tones += 1; },
        stop() {},
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, linearRampToValueAtTime() {} },
        connect() { return this; },
      };
    }
  }
  class FakeUtterance {
    rate = 1;
    constructor(public text: string) {}
  }
  class FakeNotification {
    static permission = "granted";
    onclick: (() => void) | null = null;
    constructor(public title: string, options?: { tag?: string }) {
      media.desktop.push({ title, ...(options?.tag ? { tag: options.tag } : {}) });
    }
  }
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("speechSynthesis", {
    cancel() {},
    speak(utterance: FakeUtterance) { media.spoken.push(utterance.text); },
  });
  vi.stubGlobal("Notification", FakeNotification);
  // Audio stays locked until a gesture, and a locked context plays nothing —
  // which would make every negative assertion below pass for the wrong reason.
  expect(await unlockNotificationAudio()).toBe(true);
}

function recorded(properties: Record<string, unknown>) {
  return { type: "notification.recorded", properties };
}

beforeEach(installBrowser);
afterEach(() => vi.unstubAllGlobals());

describe("notifications the server delivered", () => {
  it("plays sound, speech, and a tagged desktop notification", () => {
    const sink = createRecordedMediaSink();

    expect(sink(
      recorded({ id: "ntf_1", kind: "permission", sessionTitle: "Add a health endpoint", click: "https://ide.test/s" }),
      preferences,
      devicePreferences,
    )).toBe("permission");
    expect(media.tones).toBeGreaterThan(0);
    expect(media.spoken).toEqual(["OpenCode needs permission"]);
    // Tagged so N open tabs collapse into one OS popup instead of stacking.
    expect(media.desktop).toEqual([{ title: "Add a health endpoint", tag: "ntf_1" }]);
  });

  it("ignores a duplicate frame for a record it already rang", () => {
    const sink = createRecordedMediaSink();

    expect(sink(recorded({ id: "ntf_1", kind: "idle" }), preferences, devicePreferences)).toBe("idle");
    expect(sink(recorded({ id: "ntf_1", kind: "idle" }), preferences, devicePreferences)).toBeNull();
    expect(media.spoken).toEqual(["Session finished"]);
  });

  it("refuses a record with an unknown kind", () => {
    const sink = createRecordedMediaSink();

    for (const kind of ["server.heartbeat", "", undefined, 7]) {
      expect(sink(recorded({ id: `ntf_${String(kind)}`, kind }), preferences, devicePreferences)).toBeNull();
    }
    expect(media).toMatchObject({ tones: 0, spoken: [], desktop: [] });
  });
});

/**
 * The regression this file exists for. Every category the server records but
 * never delivers must be silent in every browser medium.
 */
describe("suppressed notifications never reach browser media", () => {
  const suppressed = [
    // Answered on the user's behalf before they ever saw it.
    ["an auto-approved permission", { id: "ntf_auto", kind: "permission", suppressed: "auto-permissions" }],
    // Recorded so the delegated child's outcome stays answerable, but the
    // parent owns its children's lifecycle.
    ["a sub-agent's finished turn", { id: "ntf_child_idle", kind: "idle", suppressed: "subagent" }],
    ["a sub-agent's question", { id: "ntf_child_question", kind: "question", suppressed: "subagent" }],
    ["a sub-agent's error", { id: "ntf_child_error", kind: "error", suppressed: "subagent" }],
    // A kind the user switched off in every channel is an instruction, not an
    // accident of configuration.
    ["a kind switched off everywhere", { id: "ntf_off", kind: "abort", suppressed: "preference-off" }],
  ] as const;

  it("covers every suppression category the server can record", () => {
    // A new reason added server-side with no case here would leave the browser
    // ringing for it, which is the failure this whole file is about.
    expect(new Set(suppressed.map(([, properties]) => properties.suppressed)))
      .toEqual(new Set(SUPPRESSION_REASONS));
  });

  it.each(suppressed)("stays silent across sound, speech, and desktop for %s", (_label, properties) => {
    const sink = createRecordedMediaSink();

    expect(sink(recorded({ ...properties }), preferences, devicePreferences)).toBeNull();
    expect(media).toMatchObject({ tones: 0, spoken: [], desktop: [] });
  });

  it("still rings for the delivered record that follows a suppressed burst", () => {
    const sink = createRecordedMediaSink();

    for (const [, properties] of suppressed) sink(recorded({ ...properties }), preferences, devicePreferences);
    expect(media).toMatchObject({ tones: 0, spoken: [], desktop: [] });

    // Positive control: the harness can make noise, so the silence above is
    // the policy and not a broken stub.
    expect(sink(recorded({ id: "ntf_root", kind: "idle" }), preferences, devicePreferences)).toBe("idle");
    expect(media.tones).toBeGreaterThan(0);
    expect(media.spoken).toEqual(["Session finished"]);
    expect(media.desktop).toEqual([{ title: "OpenCode: idle", tag: "ntf_root" }]);
  });
});

/**
 * Raw upstream events are still forwarded to this listener for the transcript
 * and the sub-agent ledger. They must remain inert here: classifying them is
 * exactly what gave the browser a second, lineage-blind opinion.
 */
describe("raw upstream events are not notifications", () => {
  const raw = [
    ["permission.asked", { id: "perm_1", sessionID: "ses_1", permission: "bash" }],
    ["session.idle", { sessionID: "ses_child" }],
    ["question.asked", { id: "que_1", sessionID: "ses_child" }],
    ["session.error", { sessionID: "ses_child", error: { name: "ProviderError" } }],
    ["notification.parked", { requestID: "perm_1", sessionID: "ses_1" }],
  ] as const;

  it.each(raw)("stays silent across sound, speech, and desktop for %s", (type, properties) => {
    const sink = createRecordedMediaSink();

    expect(sink({ type, properties: { ...properties } }, preferences, devicePreferences)).toBeNull();
    expect(media).toMatchObject({ tones: 0, spoken: [], desktop: [] });
  });
});
