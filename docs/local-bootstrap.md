# Local Infrastructure Bootstrap Guide

Comprehensive guide for bootstrapping PostgreSQL and Redis locally for development and baseline validation (S0).

## Prerequisites

### System Requirements
- **Windows 10/11, macOS, or Linux**
- **Node.js 22+** (verify with `node --version`)
- **Docker Desktop** (recommended, optional for manual setup)
- **PowerShell** (Windows) or **bash** (Mac/Linux)

### Option A: Docker (Recommended)
- Docker Desktop installed
- `docker` and `docker compose` commands available

### Option B: Manual Service Startup (Alternative)
- PostgreSQL 16+ installed locally or accessible on localhost:5432
- Redis 7+ installed locally or accessible on localhost:6379

---

## Quick Bootstrap (Fully Automated)

If you have Docker Desktop installed, run:

```bash
npm run s0:bootstrap
```

This single command:
1. ✅ Starts PostgreSQL and Redis containers
2. ✅ Verifies connectivity
3. ✅ Fixes REDIS_URL placeholder in .env
4. ✅ Generates Prisma client
5. ✅ Runs database migrations
6. ✅ Verifies S0 prerequisites

**Expected output:** `✅ S0 PREREQUISITES MET - Ready for baseline validation`

Then proceed to [Starting Services](#starting-services).

---

## Step-by-Step Manual Bootstrap

Follow these steps if automated bootstrap doesn't work or Docker is unavailable.

### Step 1: Verify Node.js Installation

```bash
node --version
# Expected: v22.x.x or higher
```

If not version 22+, [install Node.js 22 LTS](https://nodejs.org/).

### Step 2: Check Docker & docker-compose Availability

```bash
# Windows PowerShell:
docker ps
docker compose version

# If command not found: Docker not installed (proceed to Step 3B)
# If commands work: Proceed to Step 3A
```

### Step 3A: Start Infrastructure via Docker (If Available)

```bash
# Start PostgreSQL and Redis containers
npm run infra:up

# Wait 5-10 seconds for services to initialize

# Verify containers are running
npm run infra:status
# Expected: both 'postgres' and 'redis' rows show 'Up'
```

### Step 3B: Start Infrastructure Manually (If Docker Unavailable)

**PostgreSQL:**
- Install PostgreSQL 16 from https://www.postgresql.org/download/
- Create a user `labelgen` with password `labelgen`
- Ensure database server listens on `localhost:5432`
- Create database `labelgen`

**Redis:**
- Install Redis from https://github.com/microsoftarchive/redis/releases (Windows)
- Or use `brew install redis` (macOS) / `apt install redis-server` (Linux)
- Ensure Redis listens on `localhost:6379`

**Verification:**
```bash
# Windows PowerShell:
Test-NetConnection -ComputerName localhost -Port 5432
Test-NetConnection -ComputerName localhost -Port 6379

# Both should show: TcpTestSucceeded : True
```

### Step 4: Configure Environment Files

```bash
# Copy example configs if not already present
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

**Expected `apps/api/.env` values:**
```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://labelgen:labelgen@localhost:5432/labelgen?schema=public
REDIS_URL=redis://localhost:6379
```

**Fix placeholder REDIS_URL:**

If `REDIS_URL` in `apps/api/.env` is still:
```
REDIS_URL=redis://default:PASSWORD@HOST:PORT
```

Replace it with:
```
REDIS_URL=redis://localhost:6379
```

Or use automation:
```bash
npm run infra:fix
```

### Step 5: Install Dependencies

```bash
npm install
```

### Step 6: Generate Prisma Client

```bash
npm run prisma:generate --workspace=@labelgen/api
```

**Expected output:** `Generated Prisma Client`

### Step 7: Initialize Database Schema

```bash
npm run prisma:migrate --workspace=@labelgen/api
```

**Expected output:** Prisma runs pending migrations and creates tables.

### Step 8: Verify Infrastructure Readiness

```bash
npm run infra:check
```

**Expected output:**
```
PostgreSQL reachable at localhost:5432 ✅
Redis reachable at localhost:6379 ✅
```

### Step 9: Verify S0 Prerequisites

```bash
npm run s0:prereq
```

**Expected output:**
```
Checks Passed: 7
Checks Failed: 0
✅ S0 PREREQUISITES MET - Ready for baseline validation
```

If any checks fail, follow the remediation guidance printed in the output.

---

## Starting Services

Once bootstrap is complete and S0 prerequisites verified, start the services:

### Terminal 1: Start API Server
```bash
npm run dev:api
```

**Expected startup logs:**
```
[API] Startup readiness state: FULLY_READY
[API] DB connectivity: READY [localhost:5432]
[API] Redis connectivity: READY
Server running
```

### Terminal 2: Start Worker Process
```bash
npm run worker:dev
```

**Expected startup logs:**
```
🔥 Worker initialization started
[Worker] Redis connection ready
[Worker] Listening for jobs...
```

### Terminal 3 (Optional): Start Web Frontend
```bash
npm run dev:web
```

**Expected output:**
```
  Local:   http://localhost:5173
```

---

## Troubleshooting

### PostgreSQL Connection Refused

**Problem:** `Can't reach database server at localhost:5432`

**Solutions:**
```bash
# Verify PostgreSQL is running
npm run infra:check

# If using Docker:
npm run infra:down
npm run infra:up
sleep 5

# If using manual installation:
# - Restart PostgreSQL service (Windows Services or system commands)
# - Verify DATABASE_URL in apps/api/.env is correct

# Test connectivity:
Test-NetConnection -ComputerName localhost -Port 5432
```

### Redis Placeholder Error

**Problem:** `REDIS_URL is a placeholder value`

**Solution:**
```bash
# Auto-fix:
npm run infra:fix

# Or manual fix in apps/api/.env:
# Change: REDIS_URL=redis://default:PASSWORD@HOST:PORT
# To:     REDIS_URL=redis://localhost:6379
```

### Prisma Migration Failure

**Problem:** `Failed to connect to database during migration`

**Solutions:**
```bash
# Ensure PostgreSQL is reachable:
npm run infra:check

# Try migration again:
npm run prisma:migrate --workspace=@labelgen/api

# If still fails, reset and retry:
npm run prisma:generate --workspace=@labelgen/api
npm run prisma:migrate --workspace=@labelgen/api
```

### Worker Won't Start (Retry Loop)

**Problem:** Worker keeps retrying with `Waiting for infrastructure`

**Causes & Solutions:**
```bash
# Check readiness state:
npm run s0:prereq

# If S0 prerequisites not met:
# 1. Fix any failed checks reported
# 2. Restart API: npm run dev:api
# 3. Then start worker: npm run worker:dev
```

### Docker Container Fails to Start

**Problem:** `docker compose up -d` returns errors

**Solutions:**
```bash
# Check Docker daemon is running (Docker Desktop)

# View error logs:
docker compose logs postgres
docker compose logs redis

# Restart Docker daemon and retry:
npm run infra:down
npm run infra:up
```

### Port Already in Use

**Problem:** `Address already in use` when starting services

**Solutions:**
```bash
# Find process on port 3000 (API):
netstat -ano | findstr :3000

# Find process on port 6379 (Redis):
netstat -ano | findstr :6379

# Kill process (replace PID):
taskkill /PID 12345 /F

# Or use different ports by updating .env
```

---

## Infrastructure Status Checks

### Quick Status Check
```bash
npm run infra:status
```

### Detailed Connectivity Verification
```bash
npm run infra:check
```

### Full S0 Readiness Check
```bash
npm run s0:prereq
```

### Manual Connectivity Tests

```bash
# PostgreSQL (Windows PowerShell):
Test-NetConnection -ComputerName localhost -Port 5432

# Redis (Windows PowerShell):
Test-NetConnection -ComputerName localhost -Port 6379
```

---

## Cleanup & Reset

### Stop Services (Keep Data)
```bash
npm run infra:down
```

Data persists in `pgdata` and `redisdata` Docker volumes.

### Full Reset (Delete Data)
```bash
npm run infra:down
docker volume rm labelgenerator_pgdata labelgenerator_redisdata
npm run infra:up
npm run s0:bootstrap  # Re-initialize from scratch
```

### Clean Everything
```bash
npm run infra:down
rm -rf apps/api/.env     # Remove local env
rm -rf node_modules      # Remove dependencies
npm install              # Fresh install
npm run s0:bootstrap     # Full bootstrap
```

---

## Environment Configuration

### Default Values
```
NODE_ENV=development
DATABASE_URL=postgresql://labelgen:labelgen@localhost:5432/labelgen?schema=public
REDIS_URL=redis://localhost:6379
PORT=3000
```

### Custom PostgreSQL Connection
Edit `apps/api/.env`:
```
DATABASE_URL=postgresql://username:password@hostname:port/database?schema=public
```

### Custom Redis Connection
Edit `apps/api/.env`:
```
REDIS_URL=redis://[:password]@hostname:port
```

---

## Next Steps After Bootstrap

Once S0 prerequisites are verified:

1. **Start Services:**
   ```bash
   npm run dev:api      # Terminal 1
   npm run worker:dev   # Terminal 2
   ```

2. **Verify Startup Logs:**
   - API should report `FULLY_READY`
   - Worker should show `Redis connection ready`

3. **Run S0 Baseline Validation:**
   - Follow [Stage S0 Re-Validation Procedure](../docs/storage-rollout-runbook.md#stage-s0-baseline-validation)
   - Submit test jobs
   - Verify local artifact generation
   - Verify local downloads

4. **After S0 Passes:**
   - Only then proceed to S1 (dual-write staging)

---

## Support & Diagnostics

If bootstrap fails after following all steps:

1. **Collect diagnostic info:**
   ```bash
   npm run infra:check > diagnostics.txt
   npm run s0:prereq >> diagnostics.txt
   ```

2. **Check logs:**
   ```bash
   # API logs during startup (shows readiness state)
   npm run dev:api 2>&1 | grep -i "readiness\|db\|redis"
   
   # Worker logs during startup
   npm run worker:dev 2>&1 | grep -i "redis\|connection\|waiting"
   ```

3. **Review docker logs (if using Docker):**
   ```bash
   docker compose logs postgres
   docker compose logs redis
   ```

---

**Complete. Infrastructure bootstrap helpers are now available for local development and S0 validation.**
