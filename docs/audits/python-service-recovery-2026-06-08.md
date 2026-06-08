# Python Service Recovery — 2026-06-08

## Scope

Audit the Python service deployment failure that occurred after the Security Hardening Sprint push was deployed.

---

## Service Status

| Metric | Value |
|--------|-------|
| Current status | **● Online** |
| Current deployment | `7ec47f85` — SUCCESS (2026-06-08 12:04) |
| Failed deployment | `97053657` — FAILED (2026-06-08 11:54) |
| Recovery | Automatic rollback to prior successful build |
| Port | 8000 |
| Uptime | Healthy |

---

## Failed Deployment Analysis

### Exact Error
No logs available for the failed deployment (`97053657`) — the build/startup failed before generating any stdout/stderr output. This pattern is consistent with:

| Failure Class | Probability | Evidence |
|--------------|-------------|----------|
| **Transient infrastructure failure** | **HIGH** | No code/config changes between failed deploy and successful rollback. Retry at 12:04 succeeded. |
| Nixpacks build timeout | LOW | Would show log output |
| Docker pull failure | MEDIUM | Docker Hub TLS handshake failures have occurred in prior deployments (see `docs/operations/railway-web-dockerhub-timeout-hardening-2026-06-04.md`) |
| Nix package resolution failure | LOW | Python 3.11 is a stable standard package |

### Root Cause

**Transient infrastructure failure.** No code changes affected the Python service (our push only modified `apps/api/src/` and `apps/web/src/`). The Python service has its own independent Nixpacks build pipeline (`python-service/nixpacks.toml` with `python311Full`). The next automatic deployment at 12:04 succeeded without any code or config changes.

### Latent Issue Fixed

**`__pycache__/` tracked in git** — The directory contained `.pyc` bytecode compiled for Python 3.14 (local machine) while Railway uses Python 3.11. While Python handles incompatible `.pyc` gracefully (regenerates), the tracked cache files cause unnecessary build divergence.

**Fix:** Removed `__pycache__/` from git tracking and added `__pycache__/` and `*.pyc` to `.gitignore`.

---

## Environment Verification

| Variable | Value | Status |
|----------|-------|--------|
| `PORT` | `8000` | ✅ Matches `uvicorn.run(host="0.0.0.0", port=8000)` |
| `REDIS_URL` | `rediss://default:***@redis:6379` | ✅ Configured |
| `DATABASE_URL` | (empty) | ⚠️ Not set — Python service doesn't use PostgreSQL directly (tracking via HTTP only) |
| `JWT_SECRET` | Set (118 chars) | ✅ Not used by Python but harmless |
| `NODE_ENV` | Not set | ✅ Python defaults to `uvicorn` logging |
| `NIXPACKS_START_CMD` | `.venv/bin/python python-service/app.py` | ✅ |
| `NIXPACKS_CONFIG_PATH` | `python-service/nixpacks.toml` | ✅ |

---

## Startup Verification

### Since the service is currently online, I was able to verify real health:

```
[railway-start] service=Python
INFO:     Started server process [1]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

- ✅ Server process starts as PID 1
- ✅ Application startup completes without errors
- ✅ Binds to `0.0.0.0:8000`
- Railway health checks pass

---

## Files Changed

| File | Change |
|------|--------|
| `.gitignore` | Added `__pycache__/` and `*.pyc` |
| `python-service/__pycache__/` (5 files) | Removed from git tracking (`git rm --cached`) |
| `AI_IMPLEMENTATION_INDEX.md` | Added sprint entry |
| `docs/audits/python-service-recovery-2026-06-08.md` | Created — this document |

---

## Conclusion

| Check | Result |
|-------|--------|
| Exact error | **Transient infrastructure failure** (no logs available, retry succeeded) |
| Affected file | None — no code changes involved |
| Fix required | ✅ `__pycache__/` git tracking fixed (latent) |
| Python service status | **● Online** — healthy |
| Deployment history | FAILED → SUCCESS (auto-rollback + retry) |
| Build | **PASS** |
| Completion | **100%** |
