export function selectPhoneUrl(configuredUrl: string | null, browserUrl: string): string {
  const current = new URL(browserUrl);
  const target = new URL(configuredUrl ?? current.origin);

  if (/^\/sessions\/[^/]+$/.test(current.pathname)) {
    target.pathname = current.pathname;
    target.search = current.search;
    return target.toString();
  }

  return target.origin;
}
