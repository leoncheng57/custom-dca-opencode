import type { RawMessage } from "./events.js";

export type AgentMode = "plan" | "build";

function latestModeMessage(messages: RawMessage[]): RawMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.info?.role === "user") return message;
  }
  return undefined;
}

function latestUserAgent(messages: RawMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const info = messages[index].info;
    if (info?.role === "user" && typeof info.agent === "string" && info.agent.length > 0) return info.agent;
  }
  return undefined;
}

export function modeFromSession(sessionAgent: string | undefined, messages: RawMessage[]): AgentMode | undefined {
  // User messages carry the selected/session-driving agent. Assistant messages
  // can use hidden internal agents such as `compaction` and are not identity.
  const messageAgent = latestUserAgent(messages);
  const agents = [sessionAgent, messageAgent]
    .filter((agent): agent is string => typeof agent === "string" && agent.length > 0);
  if (agents.length === 0 || agents.some((agent) => agent !== "plan" && agent !== "build")) return undefined;
  if (messageAgent === "plan" || messageAgent === "build") return messageAgent;
  return sessionAgent === "plan" || sessionAgent === "build" ? sessionAgent : undefined;
}

export function modeFromMessages(messages: RawMessage[]): AgentMode | undefined {
  return modeFromSession(undefined, messages);
}

/**
 * The single foreign agent identity driving a session, when there is one.
 *
 * Mirrors the server's identity rule: session agent and the latest user
 * message agent must agree (or one be absent). Plan/Build sessions return
 * undefined here — they are the mode toggle's domain — as do sessions with
 * conflicting or missing identity, which stay unpromptable.
 */
export function foreignAgentFromSession(
  sessionAgent: string | undefined,
  messages: RawMessage[],
): string | undefined {
  const messageAgent = latestUserAgent(messages);
  const agents = [...new Set(
    [sessionAgent, messageAgent]
      .filter((agent): agent is string => typeof agent === "string" && agent.length > 0),
  )];
  if (agents.length !== 1) return undefined;
  return agents[0] === "plan" || agents[0] === "build" ? undefined : agents[0];
}

export function latestModeMessageID(messages: RawMessage[]): string | undefined {
  return latestModeMessage(messages)?.info?.id;
}
