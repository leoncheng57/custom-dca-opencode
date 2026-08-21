import type { MessagePage } from "./api.js";
import type { RawMessage } from "./events.js";

export interface TranscriptPages {
  newest: RawMessage[];
  older: RawMessage[];
}

export const emptyTranscriptPages = (): TranscriptPages => ({ newest: [], older: [] });

function messageIdentity(message: RawMessage): string {
  const messageID = message.info?.id ?? message.parts?.find((part) => part.messageID)?.messageID;
  if (messageID) return `message:${messageID}`;
  const partIDs = message.parts?.map((part) => part.id).filter((id): id is string => Boolean(id));
  if (partIDs?.length) return `parts:${partIDs.join("\0")}`;
  return `unknown:${JSON.stringify(message)}`;
}

function compareMessages(left: RawMessage, right: RawMessage): number {
  const created = (left.info?.time?.created ?? 0) - (right.info?.time?.created ?? 0);
  return created || messageIdentity(left).localeCompare(messageIdentity(right));
}

export function mergeMessagePages(previous: RawMessage[], incoming: RawMessage[]): RawMessage[] {
  if (incoming.length === 0) return previous;
  const byID = new Map(previous.map((message) => [messageIdentity(message), message]));
  for (const message of incoming) byID.set(messageIdentity(message), message);
  return [...byID.values()].sort(compareMessages);
}

export function refreshNewestPage(
  previous: TranscriptPages,
  incoming: RawMessage[],
  nextCursor: string | null,
  preserveOlder: boolean,
  windowLimit = 100,
): TranscriptPages {
  const newest = [...incoming].sort(compareMessages);
  // No cursor means this page is the complete upstream history. In particular,
  // an empty response is authoritative and must clear every stale row.
  if (newest.length === 0 || nextCursor === null || !preserveOlder) {
    return { newest, older: [] };
  }

  const boundary = newest[0];
  const displaced = newest.length >= windowLimit ? previous.newest : [];
  const older = mergeMessagePages(previous.older, displaced)
    .filter((message) => compareMessages(message, boundary) < 0);
  return { newest, older };
}

export function appendOlderPage(previous: TranscriptPages, incoming: RawMessage[]): TranscriptPages {
  const newestIDs = new Set(previous.newest.map(messageIdentity));
  const older = mergeMessagePages(previous.older, incoming)
    .filter((message) => !newestIDs.has(messageIdentity(message)));
  return { newest: previous.newest, older };
}

export function transcriptMessages(pages: TranscriptPages): RawMessage[] {
  if (pages.newest.length === 0) return [];
  return mergeMessagePages(pages.older, pages.newest);
}

export function invalidateOlderPages(pages: TranscriptPages, messageID?: string): TranscriptPages {
  if (pages.older.length === 0) return pages;
  if (messageID && !pages.older.some((message) => message.info?.id === messageID || message.parts?.some((part) => part.messageID === messageID))) return pages;
  return { newest: pages.newest, older: [] };
}

export function nextRevertState(previous: string | null | undefined, revert: unknown): { state: string | null; changed: boolean } {
  const state = revert === undefined || revert === null ? null : JSON.stringify(revert);
  return { state, changed: previous !== undefined && previous !== state || previous === undefined && state !== null };
}

export async function fetchAllMessagePages(
  fetchPage: (before?: string) => Promise<Pick<MessagePage, "messages" | "nextCursor">>,
): Promise<RawMessage[]> {
  let before: string | undefined;
  let messages: RawMessage[] = [];
  const seen = new Set<string>();

  do {
    const page = await fetchPage(before);
    messages = mergeMessagePages(messages, page.messages);
    if (page.nextCursor === null) return messages;
    if (seen.has(page.nextCursor)) throw new Error("Transcript pagination returned a repeated cursor");
    seen.add(page.nextCursor);
    before = page.nextCursor;
  } while (true);
}
