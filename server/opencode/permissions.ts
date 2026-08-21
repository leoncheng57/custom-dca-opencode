import { request, type OpencodeConfig } from "./client.js";

export interface PermissionRequest {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
  tool?: { messageID: string; callID: string };
}

export function parsePermissionRequest(value: unknown): PermissionRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.id !== "string" || typeof source.sessionID !== "string") return null;
  const tool = source.tool && typeof source.tool === "object" && !Array.isArray(source.tool)
    ? source.tool as Record<string, unknown>
    : null;
  return {
    id: source.id,
    sessionID: source.sessionID,
    permission: typeof source.permission === "string" ? source.permission : "permission",
    patterns: Array.isArray(source.patterns) ? source.patterns.map(String) : [],
    metadata: source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)
      ? source.metadata as Record<string, unknown>
      : {},
    always: Array.isArray(source.always) ? source.always.map(String) : [],
    ...(tool && typeof tool.messageID === "string" && typeof tool.callID === "string"
      ? { tool: { messageID: tool.messageID, callID: tool.callID } }
      : {}),
  };
}

export async function listPermissions(config: OpencodeConfig, directory: string): Promise<PermissionRequest[]> {
  const value = await request<unknown>(config, "/permission", { directory });
  if (!Array.isArray(value)) return [];
  return value.map(parsePermissionRequest).filter((item): item is PermissionRequest => item !== null);
}

export async function replyPermission(
  config: OpencodeConfig,
  directory: string,
  requestID: string,
  reply: "once" | "always" | "reject",
  message?: string,
): Promise<void> {
  await request<boolean>(config, `/permission/${encodeURIComponent(requestID)}/reply`, {
    method: "POST",
    directory,
    body: { reply, ...(message !== undefined ? { message } : {}) },
  });
}
