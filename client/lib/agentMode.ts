import type { RawMessage } from "./events.js";

export type AgentMode = "plan" | "build";

function latestModeMessage(messages: RawMessage[]): RawMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.info?.role === "user" || message.info?.role === "assistant") return message;
  }
  return undefined;
}

export function modeFromSession(sessionAgent: string | undefined, messages: RawMessage[]): AgentMode | undefined {
  const agents = [
    sessionAgent,
    ...messages
      .filter((message) => message.info?.role === "user" || message.info?.role === "assistant")
      .map((message) => message.info?.agent),
  ].filter((agent): agent is string => typeof agent === "string" && agent.length > 0);
  if (agents.length === 0 || agents.some((agent) => agent !== "plan" && agent !== "build")) return undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const agent = messages[index].info?.agent;
    if (agent === "plan" || agent === "build") return agent;
  }
  return sessionAgent === "plan" || sessionAgent === "build" ? sessionAgent : undefined;
}

export function modeFromMessages(messages: RawMessage[]): AgentMode | undefined {
  return modeFromSession(undefined, messages);
}

export function latestModeMessageID(messages: RawMessage[]): string | undefined {
  return latestModeMessage(messages)?.info?.id;
}
