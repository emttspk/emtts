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
