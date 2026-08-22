import type { SessionSummary } from "./api.js";

export const DIRECTORY_STORAGE_KEY = "opencode.directory.v1";
export type PaletteKind = "navigation" | "action" | "conversation";

export interface PaletteCommand {
  id: string;
  kind: PaletteKind;
  title: string;
  subtitle?: string;
  group: string;
  keywords?: string[];
  to?: string;
  run?: () => void;
}

export interface PaletteNavigation {
  id: string;
  title: string;
  to: string;
  keywords?: string[];
}

export interface PaletteAction {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  run: () => void;
}

const KIND_WEIGHT: Record<PaletteKind, number> = { navigation: 0, action: 1, conversation: 2 };

/** Never says "Idle": absent status is not proof that nothing is running. */
const PALETTE_RUNTIME_SUBTITLE: Record<SessionSummary["runtime"]["state"], string> = {
  starting: "Starting",
  running: "Running",
  retrying: "Retrying",
  completed: "Finished here",
  unknown: "Status unavailable",
};

export function resolvePaletteDirectory(search: string, savedDirectory: string | null): string {
  const fromUrl = new URLSearchParams(search).get("directory")?.trim();
  return fromUrl || savedDirectory?.trim() || "";
}

export function sessionLabel(session: Pick<SessionSummary, "id" | "title">): string {
  return session.title.trim() || `Session ${session.id.slice(0, 8)}`;
}

function optionId(kind: PaletteKind, sourceId: string): string {
  return `opencode-palette-${kind}-${encodeURIComponent(sourceId)}`;
}

export function buildPaletteCommands(input: {
  navigation: PaletteNavigation[];
  actions: PaletteAction[];
  sessions: SessionSummary[];
}): PaletteCommand[] {
  return [
    ...input.navigation.map((item) => ({
      id: optionId("navigation", item.id),
      kind: "navigation" as const,
      title: item.title,
      subtitle: item.to,
      group: "Go to",
      keywords: item.keywords,
      to: item.to,
    })),
    ...input.actions.map((item) => ({
      id: optionId("action", item.id),
      kind: "action" as const,
      title: item.title,
      subtitle: item.subtitle,
      group: "Action",
      keywords: item.keywords,
      run: item.run,
    })),
    ...input.sessions.map((session) => ({
      id: optionId("conversation", session.id),
      kind: "conversation" as const,
      title: sessionLabel(session),
      subtitle: PALETTE_RUNTIME_SUBTITLE[session.runtime.state],
      group: "Conversation",
      keywords: [session.id, session.directory],
      to: `/sessions/${encodeURIComponent(session.id)}?directory=${encodeURIComponent(session.directory)}`,
    })),
  ];
}

function score(command: PaletteCommand, query: string): number {
  const terms = [command.title, ...(command.keywords ?? [])].map((term) => term.toLowerCase());
  if (terms[0].startsWith(query)) return 0;
  if (terms.some((term) => term.split(/[\s/._-]+/).some((segment) => segment.startsWith(query)))) return 1;
  if (terms.some((term) => term.includes(query))) return 2;
  return -1;
}

export function rankPaletteCommands(commands: PaletteCommand[], query: string, limit = 50): PaletteCommand[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return commands.slice(0, limit);
  return commands
    .map((command, index) => ({ command, index, score: score(command, normalized) }))
    .filter((entry) => entry.score >= 0)
    .sort(
      (left, right) =>
        left.score - right.score ||
        KIND_WEIGHT[left.command.kind] - KIND_WEIGHT[right.command.kind] ||
        left.command.title.localeCompare(right.command.title) ||
        left.index - right.index,
    )
    .slice(0, limit)
    .map((entry) => entry.command);
}
