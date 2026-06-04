# Stable Railway Deploy Runbook

## Goal

Use deterministic service-scoped deploys and verify each service reaches `FULLY_READY` with a fresh deployment ID and current commit SHA.

## Exact Deploy Order

1. Commit the intended change set and push to `main`.
2. Deploy API first.
3. Wait for API logs to show `FULLY_READY` and the current commit SHA.
4. Deploy Web second.
5. Confirm both services report the same revision window.

## Safe Commands

Use these commands only:

```bash
railway up --service Api --detach
railway up --service Web --detach
```

Do not use:

```bash
railway up --detach
```

## Verification Commands

```bash
railway logs --service Api -n 300
railway logs --service Web -n 200
railway status
```

Verify all of the following in the logs:

- `FULLY_READY`
- `prisma_generate_ms`
- `prisma_migrate_ms`
- `redis_ready_ms`
- `render_scan_ms`
- `fully_ready_ms`
- latest commit SHA from the current push
- new deployment ID or revision marker from Railway

## Recovery Flow

1. If `railway up --service Api --detach` times out, re-run the service-scoped command instead of switching to the root monorepo deploy.
2. If logs show startup is healthy but the CLI times out, treat the deploy as unconfirmed until a new deployment ID appears in Railway logs or status.
3. If API reaches `FULLY_READY` but Web does not, redeploy Web only.

## Web Base Image Failure Recovery

If Web fails during Docker metadata resolution before `npm install`, `npm run build`, or container startup, treat it as an external image registry/build-network incident until logs prove otherwise.

Confirmed 2026-06-04 example:

```text
failed to solve: node:22.13.1-bookworm-slim: failed to resolve source metadata ... TLS handshake timeout
```

Safe response:

1. Confirm the latest Web deployment ID and status with `railway deployment list --service Web --json`.
2. Confirm the prior successful Web deployment is still serving traffic with `railway status` and a public HTTP check.
3. Do not change env vars, app code, or business logic for this failure class.
4. Retry/redeploy Web only after confirming Docker Hub/Railway builder connectivity has recovered.
5. If the failure repeats, harden the Web Dockerfile in a separate approved implementation by pinning the Node base image to a verified digest and improving install reproducibility.

Hardening candidates for a future approved implementation:

- Pin both Web Dockerfile stages from `node:22.13.1-bookworm-slim` to a verified digest.
- Prefer deterministic installs (`npm ci`) with a lockfile available inside the Docker build context.
- Preserve Railway service scope and avoid `skipBuildCache` unless intentionally forcing a cold build.
- Keep Web deploy watch patterns scoped to `/apps/web/**`; docs-only commits should remain skipped by Web.

## Rollback Flow

1. Redeploy the previous known-good commit.
2. Verify API first, then Web.
3. Confirm the rollback revision is visible in logs and that both services stay healthy.

## Readiness Criteria

Deployment is complete only when:

- API logs show `FULLY_READY`
- Web serves the latest revision
- the current commit SHA is visible in live logs
- Railway reports a fresh deployment/revision ID
- the CLI returns without timeout for the service-scoped deploy
