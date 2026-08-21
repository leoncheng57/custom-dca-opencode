export function parsePublicAppUrl(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("PUBLIC_APP_URL must be a valid HTTP(S) origin");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("PUBLIC_APP_URL must use http or https");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PUBLIC_APP_URL must be an origin without credentials, a path, query, or fragment");
  }
  return url.origin;
}

export function conversationUrl(publicAppUrl: string | null, sessionID?: unknown, directory?: unknown): string | undefined {
  if (!publicAppUrl) return undefined;
  if (typeof sessionID !== "string" || !sessionID || typeof directory !== "string" || !directory) return publicAppUrl;
  const url = new URL(`/sessions/${encodeURIComponent(sessionID)}`, publicAppUrl);
  url.searchParams.set("directory", directory);
  return url.toString();
}

export function eventClickUrl(
  publicAppUrl: string | null,
  event: { type: string; properties: Record<string, unknown>; directory?: string },
): string | undefined {
  if (!["question.asked", "permission.asked", "session.idle", "session.error"].includes(event.type)) return undefined;
  return conversationUrl(publicAppUrl, event.properties.sessionID, event.directory);
}
