import { describe, expect, it } from "vitest";

import fixture from "./fixtures/session-messages.json" with { type: "json" };
import {
  detectInterrupted,
  normalizeMessage,
  normalizeTranscript,
  toolDetail,
  type RawMessage,
} from "../client/lib/events.js";
import type { ThoughtEvent, ToolEvent, UserEvent } from "../client/lib/transcript.js";

const messages = fixture as RawMessage[];

describe("normalizeTranscript", () => {
  const { events } = normalizeTranscript(messages);

  it("maps a user text part to a user row", () => {
    const user = events.find((e) => e.kind === "user") as UserEvent;
    expect(user.text).toBe("Add a health endpoint to the server.");
    expect(user.reminders).toEqual([]);
  });

  it("folds file references into the surrounding turn instead of emitting a row", () => {
    expect(events.some((e) => e.id === "prt_file_001")).toBe(false);
    const user = events.find((e) => e.kind === "user") as UserEvent;
    expect(user.attachments).toEqual([
      {
        filename: "notes.md",
        mime: "text/plain",
        url: "file:///workspace/notes.md",
        path: "/workspace/notes.md",
      },
    ]);
  });

  it("maps assistant text to an agent row", () => {
    const agent = events.filter((e) => e.kind === "agent");
    expect(agent.map((e) => (e as { text: string }).text)).toEqual([
      "I'll add the route now. Review: https://github.com/acme/demo/pull/7",
    ]);
  });

  it("emits step-start and step-finish as bookkeeping, never as rows", () => {
    expect(events.some((e) => e.id.includes("stepstart"))).toBe(false);
    expect(events.some((e) => e.id.includes("stepfinish"))).toBe(false);
  });

  it("tolerates unknown part types rather than throwing or rendering them", () => {
    expect(events.some((e) => e.id === "prt_unknown_001")).toBe(false);
    expect(events.length).toBeGreaterThan(0);
  });
});

describe("reasoning", () => {
  const { events } = normalizeTranscript(messages);
  const thoughts = events.filter((e) => e.kind === "thought") as ThoughtEvent[];

  it("keeps readable reasoning and reports its duration", () => {
    expect(thoughts).toHaveLength(1);
    expect(thoughts[0].text).toBe("The server has no health route yet, so I will add one.");
    expect(thoughts[0].durationMs).toBe(2000);
  });

  it("drops encrypted-only reasoning instead of rendering an empty row", () => {
    expect(thoughts.some((t) => t.id === "prt_reason_002")).toBe(false);
  });

  // Provider artefacts must never cross the adapter boundary.
  it("never carries the Anthropic signature into the contract", () => {
    const serialized = JSON.stringify(thoughts);
    expect(serialized).not.toContain("OPAQUE_SIGNATURE_MUST_NOT_RENDER");
    expect(serialized).not.toContain("signature");
  });
});

describe("tool events", () => {
  const { events } = normalizeTranscript(messages);
  const tools = events.filter((e) => e.kind === "tool") as ToolEvent[];

  it("carries call and result as one event — no action/observation pairing", () => {
    const read = tools.find((t) => t.name === "read")!;
    expect(read.status).toBe("completed");
    expect(read.detail).toBe("/workspace/server/index.ts");
    expect(read.output).toBe("export const app = express();");
    expect(read.title).toBe("server/index.ts");
    expect(read.durationMs).toBe(250);
  });

  it("surfaces errors with their message", () => {
    const failed = tools.find((t) => t.name === "webfetch")!;
    expect(failed.status).toBe("error");
    expect(failed.error).toContain("ENOTFOUND");
  });

  it("shows partial output for a call still running", () => {
    const running = tools.find((t) => t.name === "bash")!;
    expect(running.status).toBe("running");
    expect(running.output).toBe("partial output so far");
    expect(running.durationMs).toBeUndefined();
  });
});

describe("status rows", () => {
  const { events } = normalizeTranscript(messages);

  it("summarises a patch by file count", () => {
    const patch = events.find((e) => e.id === "prt_patch_001")!;
    expect(patch.kind).toBe("status");
    expect((patch as { label: string }).label).toBe("Edited 2 files");
  });

  it("marks automatic compaction", () => {
    const compaction = events.find((e) => e.id === "prt_compaction_001")!;
    expect((compaction as { label: string }).label).toBe("Context compacted automatically");
  });
});

describe("usage", () => {
  it("collects one snapshot per step-finish, for the status bar", () => {
    const { usage } = normalizeTranscript(messages);
    expect(usage).toHaveLength(1);
    expect(usage[0]).toEqual({
      messageId: "msg_asst_001",
      cost: 0.0421,
      tokens: { input: 100, output: 900, reasoning: 250, cacheRead: 10000, cacheWrite: 750, total: 12000 },
    });
  });
});

describe("toolDetail", () => {
  it("prefers a command over other fields", () => {
    expect(toolDetail({ command: "npm test", timeout: 1 })).toBe("npm test");
  });

  it("collapses whitespace and truncates long values", () => {
    expect(toolDetail({ command: "a\n\n  b" })).toBe("a b");
    const long = toolDetail({ command: "x".repeat(300) })!;
    expect(long).toHaveLength(160);
    expect(long.endsWith("…")).toBe(true);
  });

  // Regression guard: the predecessor rendered whole file bodies into chips
  // because it stringified the whole argument object.
  it("ignores bulky fields like file contents", () => {
    expect(toolDetail({ content: "x".repeat(5000) })).toBeUndefined();
    expect(toolDetail({ new_str: "whole file body" })).toBeUndefined();
  });

  it("returns undefined for absent or unrecognised input", () => {
    expect(toolDetail(undefined)).toBeUndefined();
    expect(toolDetail({ mystery: 42 })).toBeUndefined();
  });
});

describe("detectInterrupted", () => {
  it("reports nothing while the session is running", () => {
    expect(detectInterrupted(messages, "running")).toEqual({ interrupted: false });
  });

  // The last fixture message is an assistant turn with no time.completed.
  it("flags an assistant turn that never completed", () => {
    expect(detectInterrupted(messages, "completed")).toEqual({
      interrupted: true,
      reason: "incomplete-turn",
    });
  });

  it("flags a user prompt that was never answered", () => {
    const trailing: RawMessage[] = [
      { info: { id: "m1", role: "user", time: { created: 1 } }, parts: [] },
    ];
    expect(detectInterrupted(trailing, "completed")).toEqual({
      interrupted: true,
      reason: "never-answered",
    });
  });

  it("treats a completed assistant turn as healthy", () => {
    const done: RawMessage[] = [
      { info: { id: "m1", role: "assistant", time: { created: 1, completed: 2 } }, parts: [] },
    ];
    expect(detectInterrupted(done, "completed")).toEqual({ interrupted: false });
  });

  it("handles an empty transcript", () => {
    expect(detectInterrupted([], "completed")).toEqual({ interrupted: false });
  });

  it("suppresses false interruption when ownership is unknown or external", () => {
    expect(detectInterrupted(messages, "unknown")).toEqual({ interrupted: false });
  });

  // The startup gap: prompt_async has returned, the loop has not reported busy,
  // and the last turn is legitimately incomplete. Banner here would be a lie.
  it("suppresses interruption during the startup gap", () => {
    expect(detectInterrupted(messages, "starting")).toEqual({ interrupted: false });
  });

  it("suppresses interruption while retrying", () => {
    expect(detectInterrupted(messages, "retrying")).toEqual({ interrupted: false });
  });
});

describe("frozen contract", () => {
  // The whole migration is cheap because row components never see raw backend
  // shapes. This test is the enforcement: if an adapter change starts passing
  // provider metadata or nested backend objects through, it fails here.
  //
  // Verified against 1,133 real messages / 1,592 events from a live 1.18.19
  // server before being written down.
  const ALLOWED: Record<string, string[]> = {
    user: ["kind", "id", "messageId", "timestamp", "text", "reminders", "attachments"],
    agent: ["kind", "id", "messageId", "timestamp", "text"],
    thought: ["kind", "id", "messageId", "timestamp", "text", "durationMs"],
    tool: [
      "kind", "id", "messageId", "timestamp", "status", "name",
      "title", "detail", "output", "error", "durationMs", "attachments",
    ],
    status: ["kind", "id", "messageId", "timestamp", "label", "detail"],
    error: ["kind", "id", "messageId", "timestamp", "message"],
  };

  const { events } = normalizeTranscript(messages);

  it("emits no keys outside the contract", () => {
    for (const event of events) {
      const extra = Object.keys(event).filter((k) => !ALLOWED[event.kind].includes(k));
      expect(extra, `${event.kind} (${event.id})`).toEqual([]);
    }
  });

  it("emits only scalars, except attachments", () => {
    for (const event of events) {
      for (const [key, value] of Object.entries(event)) {
        if (key === "attachments" || key === "reminders") continue;
        expect(
          value === null || typeof value !== "object",
          `${event.kind}.${key} must not be a nested backend object`,
        ).toBe(true);
      }
    }
  });

  it("keeps attachments to the declared fields", () => {
    for (const event of events) {
      if (!("attachments" in event)) continue;
      for (const attachment of event.attachments) {
        const extra = Object.keys(attachment).filter(
          (k) => !["filename", "mime", "url", "path"].includes(k),
        );
        expect(extra).toEqual([]);
      }
    }
  });
});

describe("normalizeMessage", () => {
  it("emits an error row for a failed turn that produced no parts", () => {
    const events = normalizeMessage({
      info: { id: "m9", role: "assistant", time: { created: 5 }, error: { message: "boom" } },
      parts: [],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "error", message: "boom" });
  });

  it("produces ISO timestamps", () => {
    const [event] = normalizeMessage({
      info: { id: "m10", role: "user", time: { created: 1787000000000 } },
      parts: [{ id: "p", messageID: "m10", type: "text", text: "hi" }],
    });
    expect(event.timestamp).toBe(new Date(1787000000000).toISOString());
  });
});
