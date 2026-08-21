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
