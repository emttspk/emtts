# Performance Audit

Date: 2026-06-07
Project: ePost.pk
Scope: login, dashboard, tracking workspace, upload workflow, label generation, queue behavior, and live production validation attempt

## Summary

I audited the main high-latency and high-uncertainty user journeys:

- login
- dashboard initialization
- tracking workspace initialization
- tracking file upload and processing
- label generation

I also attempted to verify live production metrics through Railway CLI, but the local Railway session is unauthenticated and the CLI reports `Unauthorized`. Because of that, this report combines source inspection, build verification, and UX improvements that reduce perceived latency and waiting-state confusion.

## Railway Status

- `git remote -v`: verified
- `git branch --show-current`: verified `main`
- `railway.cmd whoami`: blocked by expired OAuth session
- `railway.cmd status`: blocked by expired OAuth session
- Live Railway response-time, CPU, memory, queue-depth, and slow-query metrics: not collected in this environment

## Frontend Findings

### Login

- The login page already had inline button loading and a redirect overlay.
- I added a full-screen loading overlay during authentication and session restoration so users do not sit on a blank or uncertain screen while waiting for the dashboard.
- Source reference: [Login.tsx](/c:/Users/Nazim/Desktop/P.Post/Label%20Generator/apps/web/src/pages/Login.tsx)

### Dashboard

- Dashboard data depends on `useShipmentStats(me?.user?.id)`.
- The page previously relied on skeleton cards only, which could still feel like the app was idle.
- I added a full-screen dashboard loading overlay while the summary data is still loading.
- Source reference: [Dashboard.tsx](/c:/Users/Nazim/Desktop/P.Post/Label%20Generator/apps/web/src/pages/Dashboard.tsx)

### Tracking Workspace

- Tracking workspace loading is a composite of:
  - auth hydration
  - browser cache restore
  - batch history fetch
  - shipment stats fetch
  - complaint queue fetch
  - background job polling
- The page already had a top progress bar, but it was easy to miss what phase the system was in.
- I added a workflow stepper to the processing overlay so users can see the tracking flow moving through upload, validation, processing, sync, and completion.
- Source reference: [BulkTracking.tsx](/c:/Users/Nazim/Desktop/P.Post/Label%20Generator/apps/web/src/pages/BulkTracking.tsx)

### Upload Workflow

- The upload surface already had a progress bar, but not a clear step-by-step path.
- I added a workflow stepper to the upload dropzone so the user sees `Upload -> Validate -> Process -> Generate -> Complete`.
- Source reference: [Upload.tsx](/c:/Users/Nazim/Desktop/P.Post/Label%20Generator/apps/web/src/pages/Upload.tsx)
- Shared UI reference: [UploadDropzone.tsx](/c:/Users/Nazim/Desktop/P.Post/Label%20Generator/apps/web/src/components/UploadDropzone.tsx)

### Label Generation

- The label generation progress card already tracked stages, elapsed time, progress, and completion.
- I extended it with a visible workflow stepper so the processing state is less ambiguous.
- Source reference: [LabelGenerationProgressCard.tsx](/c:/Users/Nazim/Desktop/P.Post/Label%20Generator/apps/web/src/components/LabelGenerationProgressCard.tsx)

## Backend Findings

These endpoints and flows are the most likely sources of perceived latency because they either read multiple tables, wait on queue completion, or perform browser-to-worker polling:

- `/api/auth/login`
- `/api/auth/firebase-login`
- `/api/shipments/stats`
- `/api/tracking/upload`
- `/api/tracking/batches`
- `/api/tracking/:jobId`
- `/api/jobs/:jobId`

### Observed patterns in source

- `apps/api/src/routes/shipments.ts` performs multiple shipment reads and complaint-linked reads for the dashboard stats response.
- `apps/api/src/routes/tracking.ts` does batch history fetches, file-backed batch downloads, batch reruns, complaint prefill, and complaint submission with queue handoff.
- The label workflow depends on job status polling rather than a push/completion event stream, so the UI must be clear while the worker is still running.

## Database Audit

Potential performance pressure points I reviewed:

- repeated shipment reads for dashboard stats
- complaint-linked shipment reads
- batch history reads on tracking load
- job polling for tracking and label generation

I did not find React Query usage, so there is no query cache duplication from that library. The relevant caching is custom localStorage / IndexedDB state.

## Slowest Components

These are the components most likely to contribute to perceived slowness or uncertainty:

- [Login.tsx](/c:/Users/Nazim/Desktop/P.Post/Label%20Generator/apps/web/src/pages/Login.tsx)
- [Dashboard.tsx](/c:/Users/Nazim/Desktop/P.Post/Label%20Generator/apps/web/src/pages/Dashboard.tsx)
- [BulkTracking.tsx](/c:/Users/Nazim/Desktop/P.Post/Label%20Generator/apps/web/src/pages/BulkTracking.tsx)
- [Upload.tsx](/c:/Users/Nazim/Desktop/P.Post/Label%20Generator/apps/web/src/pages/Upload.tsx)
- [LabelGenerationProgressCard.tsx](/c:/Users/Nazim/Desktop/P.Post/Label%20Generator/apps/web/src/components/LabelGenerationProgressCard.tsx)

## Implemented Fixes

- Full-screen login loading overlay
- Full-screen dashboard initialization overlay
- Upload workflow stepper
- Tracking processing workflow stepper
- Label generation workflow stepper
- Diagnostic polling logs for job completion and terminal states

## Build

- `npm run build`: PASS

## Remaining Risks

- Live Railway performance numbers were not captured because the Railway CLI session is currently unauthenticated.
- I could not collect actual response times, CPU, memory, queue depth, or live slow-query timings in this environment.
- The timer behavior is still polling-based, so if the worker is exceptionally slow, the UI will remain in a waiting state until the job reaches a terminal status. The new overlays and stepper reduce confusion, but they do not replace backend completion events.

## Recommendation

The next best production step is to re-run the audit with an authenticated Railway session so we can collect:

1. endpoint response times
2. queue depth
3. CPU and memory
4. slow query logs

That would let us turn the source-level suspects above into measured bottlenecks.
