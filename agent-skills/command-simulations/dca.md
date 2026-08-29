---
title: A root worker is launched and observed without cmux
trigger: /dca
caveat: >-
  Authentication is omitted because the example deployment is explicitly a
  private unauthenticated BFF. Poll payloads are shortened to one message.
---

# Worked example

## user

/dca start a read-only root worker to inspect the export tests

## assistant

I will use the DCA BFF directly. This shell has `DCA_BASE_URL` set to the
deployment's private Tailscale origin; I will verify that route rather than
assuming loopback or cmux access.

## tool — bash

```
$ curl -sS --fail-with-body "$DCA_BASE_URL/api/health" | jq .
{
  "healthy": true,
  "upstream": {"reachable": true, "versionMatches": true},
  "events": {"connected": true}
}
$ curl -sS --fail-with-body -X POST "$DCA_BASE_URL/api/sessions" \
    -H 'Content-Type: application/json' \
    -d '{"directory":"/srv/app","title":"Export test audit","prompt":"Inspect export tests read-only and report findings with file lines.","mode":"plan"}'
{"session":{"id":"ses_audit_42","title":"Export test audit"}}
```

## assistant

The root session is `ses_audit_42`. Creation accepted its initial prompt; that
does not prove the turn finished, so I am polling its messages.

## tool — bash

```
$ curl -sS --fail-with-body --get \
    "$DCA_BASE_URL/api/sessions/ses_audit_42/messages" \
    --data-urlencode 'directory=/srv/app' --data-urlencode 'limit=100' | jq .
{"messages":[{"info":{"role":"assistant","time":{"completed":1788031234000}},"parts":[{"type":"text","text":"Found two uncovered branches..."}]}],"nextCursor":null,"running":false}
```

## assistant

The submitted turn now has a completed assistant message and the session is not
running. The audit found two uncovered branches and made no file changes. I used
a root because no parent accounting was requested; a Managed Child would be the
correct route if this work needed to appear under an existing parent.

## note

The example checks the BFF, upstream, and event stream separately, and it treats
session creation as acceptance rather than completion. cmux is absent because it
is not required for the lifecycle being demonstrated.
