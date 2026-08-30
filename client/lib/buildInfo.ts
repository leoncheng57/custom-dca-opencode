export function formatBuildLabel(version: string, commit: string): string {
  return `v${version}${commit ? `+${commit}` : ""}`;
}
