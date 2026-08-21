import { request, type OpencodeConfig } from "./client.js";

export type McpStatus =
  | { status: "connected" }
  | { status: "disabled" }
  | { status: "failed"; error: string }
  | { status: "needs_auth" }
  | { status: "needs_client_registration"; error: string };

export type McpStatusMap = Record<string, McpStatus>;

export function listMcp(config: OpencodeConfig, directory: string): Promise<McpStatusMap> {
  return request<McpStatusMap>(config, "/mcp", { directory });
}

export async function setMcpConnected(
  config: OpencodeConfig,
  directory: string,
  name: string,
  connected: boolean,
): Promise<McpStatusMap> {
  await request<boolean>(config, `/mcp/${encodeURIComponent(name)}/${connected ? "connect" : "disconnect"}`, {
    method: "POST",
    directory,
  });
  // The boolean only means the operation ran, not that connection succeeded.
  return listMcp(config, directory);
}
