# Phone notification support

PWA push and ntfy are independent. Either, both, or neither may be enabled. Browser
desktop notifications still require an open page; PWA push and ntfy can arrive while
the page is backgrounded or closed.

## Support matrix

| Platform | Requirements | Background/closed delivery |
|---|---|---|
| iPhone/iPad | iOS/iPadOS 16.4+, HTTPS, install with Add to Home Screen, then grant permission | PWA push or ntfy |
| Android | HTTPS and browser notification permission; installation is recommended | PWA push or ntfy |
| Desktop Chromium/Firefox | HTTPS or localhost and notification permission | PWA push; browser behavior may stop after browser exit |
| Unsupported/older browser | Use ntfy | ntfy |

## Server setup

Generate one VAPID key pair and keep it stable. Changing it invalidates existing browser
subscriptions.

```bash
npx web-push generate-vapid-keys
```

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in the BFF environment.
The subject must be a `mailto:` address or HTTPS URL. Restart the BFF, open Settings on
each device, enable PWA push, and save. Each device grants permission and registers its
own subscription. Disabling PWA push and saving removes the current device subscription
and globally stops the channel; it does not alter ntfy.

Subscriptions are stored in `.state/web-push-subscriptions.json` by default with file
mode `0600`. The public key may be returned to browsers. The private key and subscription
authentication keys are never returned by a read API or rendered in Settings. Registration
accepts at most 32 devices and only browser endpoints from the production Apple, Google,
Mozilla, and Microsoft push services; this prevents the BFF from becoming a general outbound
request proxy.

## Lifecycle and updates

The service worker does not intercept `fetch` and has no Cache Storage calls. The PWA is
not offline-capable, and live sessions, questions, permissions, and API responses always
come from the network. A newly installed worker waits until the app displays its update
notice. **Update** activates it and reloads; **Later** retains the current worker.

## Troubleshooting

- PWA push unavailable: confirm HTTPS, browser support, and all three VAPID variables.
- iPhone permission unavailable: open the installed Home Screen app, not a Safari tab.
- Test button disabled: enable PWA push, save successfully, and confirm the device says
  it is subscribed.
- Delivery stops after changing VAPID keys: disable/save, enable/save, and grant a fresh
  subscription on every device.
- Provider returns 404 or 410: the BFF removes that expired subscription automatically.
- PWA push fails but ntfy works: leave ntfy enabled while checking browser permission and
  subscription state; the channels do not disable one another.
