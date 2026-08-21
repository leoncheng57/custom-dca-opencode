export function selectPhoneUrl(configuredUrl: string | null, browserOrigin: string): string {
  return configuredUrl ?? new URL(browserOrigin).origin;
}
