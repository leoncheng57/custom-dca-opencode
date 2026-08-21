import type { RawMessage } from "./events.js";

export type AgentMode = "plan" | "build";

function latestModeMessage(messages: RawMessage[]): RawMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.info?.role === "user" || message.info?.role === "assistant") return message;
  }
  return undefined;
}

export function modeFromMessages(messages: RawMessage[]): AgentMode {
  const latest = latestModeMessage(messages);
  return latest?.info?.agent === "plan" ? "plan" : "build";
}

export function latestModeMessageID(messages: RawMessage[]): string | undefined {
  return latestModeMessage(messages)?.info?.id;
}
