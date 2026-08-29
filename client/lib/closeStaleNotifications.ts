// client/lib/closeStaleNotifications.ts
//
// Close OS-level push notification cards when the user resolves records in-app.
// Web Push cannot be recalled by the server; only the client can close an
// already-shown notification.
//
// Deliberately scoped to an explicit resolve action only. An earlier version
// also reconciled passively inside `refresh()`, closing any visible card whose
// tag was absent from the freshly-fetched unresolved set. That ran on every
// mounted client for every `notification.recorded` event anywhere — not just
// for the device or session that had been acted on — and correlated with
// notifications disappearing from a phone before they were read. Closing a
// card is not recoverable, so this now only runs where the user actually
// resolved something.

/**
 * Compute the OS notification tag for a record, matching the server's exact
 * formula in `server/notifications/service.ts:notificationTag()`.
 *
 * Session-scoped so each session is one replaceable slot in the OS notification
 * center. Records with no session keep their record id as the tag.
 */
export function sessionTag(record: { id: string; sessionID?: string }): string {
  return record.sessionID || record.id;
}

/**
 * Close any currently-visible OS notifications for the given tag.
 *
 * Best-effort cleanup: never throws, no-op when service workers are unsupported
 * or no notifications exist. Closing an already-closed or nonexistent
 * notification is a safe no-op.
 */
export async function closeNotificationsForTag(tag: string): Promise<void> {
  if (!tag) return;
  try {
    // Service workers are required for Web Push, but guard anyway so this
    // degrades gracefully in unsupported browsers.
    if (!navigator.serviceWorker) return;
    
    // Pages can call getNotifications() directly via the registration — no
    // message-passing to the worker needed. This returns notifications shown
    // via that registration, regardless of whether called from page or worker.
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications({ tag });
    
    // Close each matching notification. Multiple records can share one session
    // tag, but getNotifications({ tag }) already filtered to just this tag.
    for (const notification of notifications) {
      notification.close();
    }
  } catch {
    // Swallow all failures — this is best-effort cleanup that must never break
    // the resolve action it's attached to.
  }
}
