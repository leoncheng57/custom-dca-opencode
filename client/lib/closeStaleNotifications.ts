// client/lib/closeStaleNotifications.ts
//
// Close OS-level push notification cards when the user resolves records in-app.
// Web Push cannot be recalled by the server; only the client can close an
// already-shown notification.

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

/**
 * Close any visible OS notifications whose sessions are no longer unresolved.
 *
 * Reconciles on app foreground: after a user resolves notifications on another
 * device or in another tab, the OS notification center on this device may still
 * show stale cards. This compares currently-visible notifications against the
 * current unresolved set and closes any that are stale.
 */
export async function reconcileStaleNotifications(
  unresolvedRecords: Array<{ id: string; sessionID?: string }>,
): Promise<void> {
  try {
    if (!navigator.serviceWorker) return;
    
    const registration = await navigator.serviceWorker.ready;
    // Get ALL currently-visible notifications (no tag filter).
    const visibleNotifications = await registration.getNotifications();
    
    // Build the set of tags for currently-unresolved records.
    const unresolvedTags = new Set(unresolvedRecords.map(sessionTag));
    
    // Close any visible notification whose tag is NOT in the unresolved set.
    for (const notification of visibleNotifications) {
      // Notifications shown via showNotification() with a tag have that tag in
      // the `tag` property. Untagged notifications have `tag === ""` or
      // `tag === undefined`. We only show tagged notifications in this app, so
      // any untagged one is either stale from a previous version or shouldn't
      // be there — close it. A non-empty tag that's not in the unresolved set
      // is also stale — close it too.
      if (!notification.tag || !unresolvedTags.has(notification.tag)) {
        notification.close();
      }
    }
  } catch {
    // Best-effort cleanup, never break the refresh flow.
  }
}
