---
title: Authentication review before an educational layer walkthrough
trigger: /review-learning
caveat: >-
  The excerpts are intentionally short and illustrative; a real review would
  quote exact lines from the pinned PR head and include actual test output.
---

# Worked example

## user

/review-learning PR #123, first focus on authentication

## assistant

Verified findings

1. [high] Tenant identity is accepted from the request body -
   `server/routes/export.ts:41-46`

   The route passes caller-authored `tenantId` to the export service without
   comparing it to the authenticated principal. A user can request another
   tenant's export. This is established by the route and the service accepting
   that value; bind tenant identity server-side before calling the service.

Unverified risks

- The sidecar may accept unsigned callbacks - its production configuration is
  not in this repository; inspect the deployed callback-auth policy.

Layer map

`HTTP route -> ExportService -> worker protocol -> object store SDK`

Learning excerpts

1. `server/routes/export.ts:41-46` - Finding evidence

   ```ts
   const { tenantId, format } = req.body
   const job = await exports.start({ tenantId, format })
   res.status(202).json(job)
   ```

   Lesson: parsing input and authorizing its authority are separate operations.
   Connection: authenticated HTTP request -> route boundary -> privileged export
   service. Does not prove: whether a gateway rejects cross-tenant values first.

2. `server/export/service.ts:72-79` - Educational

   ```ts
   const key = `${request.tenantId}/${job.id}.${request.format}`
   await worker.enqueue({ jobId: job.id, key })
   ```

   Lesson: an authorization miss becomes durable namespace selection at the
   service boundary. Connection: route input -> service key -> worker/object
   store. Does not prove: the object store's own IAM policy.

Residual risks and test gaps

- No focused test attempts a cross-tenant export.
- The production sidecar and object-store policies were not available.

## note

The authorization defect is ranked before the teaching material. The second
excerpt is labelled educational rather than promoted into another finding.
