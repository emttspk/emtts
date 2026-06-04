# Railway Web Docker Hub Timeout Hardening - 2026-06-04

## Scope

Documentation-only deployment recovery and hardening note for ePost.pk / Label Generator production Web service.

No application code, business logic, environment variables, Railway settings, restart, or redeploy action was changed in this pass.

## Identity

- Git remote: `https://github.com/emttspk/emtts.git`
- Branch: `main`
- Railway workspace: `emttspk's Projects`
- Railway project: `Epost`
- Railway environment: `production`
- Linked Railway service during CLI status check: `Api`
- Affected service: `Web`

## Current Deployment State

- Web service status: `Online` but latest deployment shows `Deploy failed`.
- Latest failed Web deployment: `d02e15f5-39e1-45fa-9962-f329b8b482eb`
- Failed commit: `c0cd92edc3031f972207e82f46fd82b497b409df`
- Failed commit message: `fix: label loader, layout, and sample aliases`
- Last successful Web deployment: `857a8a7e-8e2c-4f82-8327-1004a00c2725`
- Last successful commit: `94acf4cd3a787893e4bd5250fabcb42caa0753c8`
- No newer successful Web deployment was found during the recovery follow-up check.

The public Web service remains online because Railway is still serving the prior successful image.

## Confirmed Failure Class

The failed Web deployment stopped before application build or runtime startup.

Confirmed failing log excerpt:

```text
[INFO] [internal] load metadata for docker.io/library/node:22.13.1-bookworm-slim
[ERRO] [internal] load metadata for docker.io/library/node:22.13.1-bookworm-slim
Build Failed: build daemon returned an error < failed to solve: node:22.13.1-bookworm-slim: failed to resolve source metadata for docker.io/library/node:22.13.1-bookworm-slim: failed to do request: Head "https://registry-1.docker.io/v2/library/node/manifests/22.13.1-bookworm-slim": net/http: TLS handshake timeout >
```

Classification:

- Not an `npm install` failure.
- Not a Vite build failure.
- Not a missing environment variable failure.
- Not a startup crash.
- Not a health check failure.
- Not a deployment timeout after app boot.

Root cause is an external Docker Hub/Railway builder network timeout while resolving the Node base image metadata.

## Current Image Strategy

`apps/web/Dockerfile` uses a two-stage Docker build:

- Build stage: `FROM node:22.13.1-bookworm-slim AS build`
- Runtime stage: `FROM node:22.13.1-bookworm-slim AS runtime`
- Build package install: `npm install`
- Runtime package install: `npm install --global serve@14.2.4`
- Static app serving: `serve -s dist --single -l ${PORT:-3000}`

`apps/web/railway.json` uses:

- `builder`: `DOCKERFILE`
- `dockerfilePath`: `Dockerfile`
- `startCommand`: `sh -lc 'serve -s dist --single -l ${PORT:-3000}'`
- Restart policy: `ON_FAILURE`

Railway service metadata confirms:

- Root directory: `/apps/web`
- Watch patterns: `/apps/web/**`
- Runtime: `V2`
- Builder: `DOCKERFILE`

## Hardening Recommendations

### A. Digest Pinning

Pin both Web Dockerfile stages to a verified Node image digest in a future approved implementation.

Example shape only:

```Dockerfile
FROM node:22.13.1-bookworm-slim@sha256:<verified-digest> AS build
FROM node:22.13.1-bookworm-slim@sha256:<verified-digest> AS runtime
```

Expected benefit:

- Makes the exact base image reproducible.
- Reduces risk from mutable tag movement.
- Gives operators a stable artifact reference when comparing builds.

Remaining limitation:

- Railway still needs registry/build-cache access unless the image or metadata is already cached by the builder.

### B. Railway Cache Opportunities

- Keep service-scoped Web deploys and avoid root monorepo deploys.
- Do not force cold builds unless necessary; prior Railway metadata shows one Web redeploy used `skipBuildCache: true`.
- Since Web watch patterns are `/apps/web/**`, documentation-only commits outside that path should normally be skipped by Web and should not disturb the currently serving successful image.
- A manual Web redeploy can be the lowest-risk recovery once Docker Hub/Railway builder connectivity is stable.

### C. Build Reproducibility

Future approved implementation should make package installation deterministic:

- Prefer `npm ci` instead of `npm install`.
- Ensure a lockfile is available inside the Docker build context before switching to `npm ci`.
- Because Web root directory is `/apps/web`, confirm whether a Web-local lockfile or a revised Docker build context is the safest path before changing the Dockerfile.
- Keep Vite build arguments and runtime `serve` behavior unchanged unless a separate Web deployment hardening task explicitly approves broader changes.

## Local Build Verification

Local builds completed successfully during this follow-up:

```bash
npm run build -w apps/api
npm run build -w apps/web
```

Result:

- API build: PASS
- Web build: PASS

This supports the previous audit conclusion that the failed Railway Web deployment was not caused by application compile errors or dependency resolution in the local workspace.

## Recovery Commands

Do not run recovery commands unless approved for operations.

```bash
railway deployment list --service Web --json
railway logs d02e15f5-39e1-45fa-9962-f329b8b482eb --build
railway status
railway redeploy --service Web
```

## Risk Level

Current customer-facing risk: Low to Medium.

Reason: Web is still online from the previous successful image, but the latest intended Web revision has not been promoted.

Implementation hardening risk: Low if limited to digest pinning and deterministic install changes, with local and Railway build verification before promotion.

## Estimated Recovery Time

- Simple redeploy after Docker Hub/Railway builder connectivity recovers: 5 to 15 minutes.
- Dockerfile hardening implementation plus verification: 30 to 60 minutes.
