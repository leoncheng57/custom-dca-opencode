// client/lib/notificationEvents.ts
//
// Plain-language names for the six notification events, plus the grouping the
// Settings page uses to explain them.
//
// The wire values (`idle`, `parked`, `abort`, …) are internal vocabulary. As
// checkbox labels they are close to unreadable: nothing in the word "parked"
// says "an approval you never answered", and "idle" reads like the *absence*
// of an event rather than the agent handing work back to you. The catalogue
// lives here rather than inline so the delivery matrix and the sound-by-event
// list cannot drift apart, and so the copy is testable.

import type { NotifyEvent } from "./api.js";

export type NotifyEventGroup = "waiting" | "failed" | "expected";

export interface NotifyEventGroupDescriptor {
  id: NotifyEventGroup;
  title: string;
  summary: string;
}

export interface NotifyEventDescriptor {
  event: NotifyEvent;
  label: string;
  description: string;
  group: NotifyEventGroup;
}

/**
 * Grouped by what the event means for you, not by which subsystem raised it.
 * "Waiting on you" holds every event where the run has stopped and cannot
 * continue on its own — which is why `idle` belongs there despite not being a
 * question: a finished turn is still the ball in your court.
 */
export const NOTIFY_EVENT_GROUPS: readonly NotifyEventGroupDescriptor[] = [
  {
    id: "waiting",
    title: "Waiting on you",
    summary: "The run has stopped and will not continue until you act.",
  },
  {
    id: "failed",
    title: "Something went wrong",
    summary: "The run ended in a way you did not ask for.",
  },
  {
    id: "expected",
    title: "Expected and quiet",
    summary: "Outcomes you caused yourself, so there is nothing to tell you.",
  },
];

export const NOTIFY_EVENT_CATALOGUE: readonly NotifyEventDescriptor[] = [
  {
    event: "permission",
    label: "Needs your permission",
    description: "A tool call is blocked until you approve it. Requests answered by Auto permissions never notify.",
    group: "waiting",
  },
  {
    event: "question",
    label: "Asked you a question",
    description: "The agent needs an answer before it can carry on.",
    group: "waiting",
  },
  {
    event: "parked",
    label: "Still waiting for permission",
    description: "An approval has gone unanswered past the timeout above. Sent at high priority.",
    group: "waiting",
  },
  {
    event: "idle",
    label: "Finished its turn",
    description: "The agent handed back and is waiting for your next message.",
    group: "waiting",
  },
  {
    event: "error",
    label: "Run failed",
    description: "The session stopped on an error.",
    group: "failed",
  },
  {
    event: "abort",
    label: "You stopped it",
    description: "A run you cancelled yourself, so it is off by default.",
    group: "expected",
  },
];

/**
 * The recommended profile: everything that is waiting on you, plus failures.
 *
 * This is deliberately the same set as the server's `DEFAULT_EVENTS`, and
 * `tests/notification-events.test.ts` fails if the two drift — a "Reset to
 * recommended" button that did not restore the shipped default would be a
 * quietly broken promise.
 */
export const RECOMMENDED_NOTIFY_EVENTS: Readonly<Record<NotifyEvent, boolean>> = Object.freeze(
  Object.fromEntries(
    NOTIFY_EVENT_CATALOGUE.map(({ event, group }) => [event, group !== "expected"]),
  ) as Record<NotifyEvent, boolean>,
);

export function notifyEventsInGroup(group: NotifyEventGroup): NotifyEventDescriptor[] {
  return NOTIFY_EVENT_CATALOGUE.filter((descriptor) => descriptor.group === group);
}

export function notifyEventLabel(event: NotifyEvent): string {
  return NOTIFY_EVENT_CATALOGUE.find((descriptor) => descriptor.event === event)?.label ?? event;
}

/**
 * Categories that never notify whatever the matrix says, because the BFF
 * records them with `delivery.suppressed` and sends nothing. Stating this next
 * to the checkboxes is the point: otherwise a ticked "Needs your permission"
 * that stays silent all day looks like a bug rather than Auto permissions
 * doing its job.
 */
export const NEVER_DELIVERED: readonly string[] = [
  "Sub-agent activity from delegated child sessions.",
  "Permission requests approved automatically while Auto permissions is on.",
];
