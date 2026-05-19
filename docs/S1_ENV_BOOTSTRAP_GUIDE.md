# Stage S1: Environment Bootstrap & Unified Local Staging Guide

**Date:** May 18, 2026  
**Status:** Staging Environment Bootstrap Hardening - Ready for Implementation  
**Audience:** Operators, DevOps, Development

---

## 1. Overview: Environment Architecture

This document describes the **canonical environment loading strategy** for Stage S1 controlled Cloudflare R2 staging. The goal is to eliminate environment drift between root tooling, API, Worker, and shell sessions, making staged R2 canaries operationally reproducible and safe.

### 1.1 Problem Addressed
- **Previous issue:** Root R2 tooling scripts read only shell env; API/Worker dev read from `apps/api/.env`
  - Result: R2 credentials and S1 flags could be present in API startup but missing in shell env
  - Effect: `npm run r2:verify` failed with missing vars even though API was configured
  - Risk: Canary preflight checks passed but runtime behavior diverged
  
- **Solution:** Unified env loader that shares a single `.env.staging.local` file across all startup paths
  - All tools use the same staging env source
  - Shell precedence always honored (shell vars override file)
  - Railway production env remains separate (no local secrets leak)

### 1.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│  ENVIRONMENT LOADING PRECEDENCE (Highest → Lowest)     │
├─────────────────────────────────────────────────────────┤
│ 1. ✓ SHELL ENVIRONMENT                                  │
│    (Explicit: VAR=value npm run ..., or sourced)        │
│                                                          │
│ 2. ✓ .env.staging.local (Unified Local Staging File)   │
│    (Canonical source: root/.env.staging.local)          │
│                                                          │
│ 3. ✓ .env App-specific File (API/Worker Dev)           │
│    (apps/api/.env via tsx --env-file)                   │
│                                                          │
│ 4. ✓ Railway/Service Runtime Env (Production)          │
│    (Railway secret variables injected at deploy)        │
│                                                          │
│ 5. ⊗ Code Defaults (Lowest)                            │
│    (Hardcoded fallbacks only)                           │
└─────────────────────────────────────────────────────────┘

ENV SOURCE PROPAGATION:

  ┌─────────────────────────────┐
  │  Root .env.staging.local    │
  │  (Canonical Source)         │
  └──────────────┬──────────────┘
                 │
     ┌───────────┼───────────┐
     │           │           │
     ▼           ▼           ▼
  npm run    npm run      npm run
  r2:*       dev:api      worker:dev
  scripts    (tsx)        (tsx)
     │           │           │
     └───────────┴───────────┘
             │
             ▼
    ✓ All tools see same R2 keys
    ✓ All tools see same S1 flags
    ✓ Canary preflight matches runtime
```

---

## 2. Quick Start: Local Staging Setup

### 2.1 Initial Setup (One Time)

```powershell
# PowerShell on Windows

# 1. Copy template to create local staging env (gitignored)
Copy-Item .env.staging.local.example .env.staging.local

# 2. Edit with real R2 credentials
notepad .env.staging.local
```

Edit these required fields:
```env
# SECTION 1: REQUIRED R2 CREDENTIALS
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_BUCKET=your-staging-bucket-name
R2_ACCESS_KEY_ID=actual-key-id
R2_SECRET_ACCESS_KEY=actual-secret-key

# SECTION 2: STAGING MODE FLAGS
STAGING_R2_ENABLED=true
ENABLE_DUAL_WRITE=true
ENABLE_R2_UPLOADS=true
ENABLE_DUAL_READ=false

# SECTION 3: CANARY CONTROLS
R2_CANARY_MODE=job-percentage
R2_CANARY_PERCENTAGE=5
R2_CANARY_MAX_JOBS=100
```

### 2.2 Load Environment Into Shell (Every Shell Session)

**PowerShell:**
```powershell
# Load .env.staging.local into current session
. .\scripts\staging-env-load.ps1

# Verify all required vars are set (no secrets printed)
npm run staging:env:check
```

**Bash/Zsh:**
```bash
# Coming soon: staging-env-load.sh script for Unix shells
# For now, manually export or use direnv
export $(cat .env.staging.local | grep -v '^#' | xargs)
npm run staging:env:check
```

### 2.3 Safety Checklist Before Canary

```powershell
# 1. Load env
. .\scripts\staging-env-load.ps1

# 2. Validate configuration (no secrets printed)
npm run staging:env:check

# 3. Verify R2 connectivity
npm run r2:verify

# 4. Check canary mode
npm run r2:canary-check

# 5. Verify rollback safety
npm run r2:rollback-check

# ✓ All passed? Safe to proceed with canary
```

---

## 3. Detailed Env Precedence Behavior

### 3.1 Shell Precedence (Highest Priority)

Any variable explicitly set in the shell session **overrides** the `.env.staging.local` file.

**Example 1: Override a single key for testing**
```powershell
# Temporarily use 100% canary (instead of 5%)
$env:R2_CANARY_PERCENTAGE = 100
npm run r2:verify   # Uses R2_CANARY_PERCENTAGE=100

# Once shell closes, reverts to .env.staging.local value
```

**Example 2: Use a different R2 bucket for isolated test**
```powershell
$env:R2_BUCKET = "test-bucket-isolated"
$env:R2_CANARY_MODE = "disabled"
npm run dev:api     # API uses isolated bucket, all jobs dual-write

# Clear override when done
Remove-Item Env:\R2_BUCKET
```

### 3.2 File Precedence (Second)

`.env.staging.local` (if exists) provides default values not overridden by shell.

```powershell
# No shell vars set → .env.staging.local is used
. .\scripts\staging-env-load.ps1
npm run r2:verify   # Uses R2_BUCKET from file

# Any var set in shell overrides file
$env:R2_BUCKET = "different-bucket"
npm run r2:verify   # Uses different-bucket (shell wins)
```

### 3.3 Railway Production Env (Third)

On Railway, service environment variables (set in Railway dashboard) provide defaults.

```yaml
# Railway deployment: services see injected env
# No .env.staging.local in container
# Shell env precedence still honored for transient overrides

API_ORIGIN: https://api.production.example.com
R2_ENDPOINT: https://prod.r2.cloudflarestorage.com
R2_BUCKET: prod-bucket
```

### 3.4 Code Defaults (Lowest)

Hardcoded fallbacks in code.ts apply only if no env var is set.

```typescript
// apps/api/src/config.ts
export const stagingConfig = {
  CANARY_MODE: (process.env.R2_CANARY_MODE || "disabled") as "disabled" | "job-percentage" | "job-count",
  // If R2_CANARY_MODE not in shell/file/Railway, default is "disabled"
};
```

---

## 4. PowerShell-Specific Behavior & Limitations

### 4.1 Session Scope

Each PowerShell terminal is an **independent session**. Env vars set in one terminal do NOT appear in another.

```powershell
# Terminal 1
$env:R2_BUCKET = "my-bucket"
npm run dev:api     # ✓ Uses R2_BUCKET=my-bucket

# Terminal 2 (different window)
npm run dev:api     # ✗ R2_BUCKET not set, falls back to file
```

**Solution:** Load `.env.staging.local` into **every** terminal that needs it.

```powershell
# New terminal → always run first
. .\scripts\staging-env-load.ps1
npm run staging:env:check
```

### 4.2 Process vs User Environment

`Set-ExecutionPolicy` and environment variables respect scopes:

```powershell
# Process scope (current terminal only) — RECOMMENDED
[Environment]::SetEnvironmentVariable("R2_BUCKET", "my-bucket", "Process")

# User scope (all future terminals, permanent until manually cleared)
# ⚠️ AVOID for R2 staging — could leak credentials in history

# System scope (all users) — NEVER use for secrets
```

The `staging-env-load.ps1` script uses **Process scope** automatically.

### 4.3 Command History Leaks

PowerShell history can leak secrets if you type them directly:

```powershell
# ✗ BAD: Secrets in command history
$env:R2_SECRET_ACCESS_KEY = "actual-key-12345"
Get-History  # Later inspection reveals key

# ✓ GOOD: Load from file
. .\scripts\staging-env-load.ps1
# File persists; shell history doesn't reveal secrets

# ✓ GOOD: Inline within same command
R2_SECRET_ACCESS_KEY="key" npm run r2:verify
# Executed and forgotten; no history entry
```

**Recommendation:** Never type secrets directly. Always load from `.env.staging.local`.

---

## 5. Unified Environment Loading Implementation

### 5.1 Files Added/Modified

**New Files:**
- `.env.staging.local.example` — Safe template (committed to git)
- `scripts/env-loader.mjs` — Unified loader utility
- `scripts/staging-env-check.mjs` — Validation bootstrap script
- `scripts/staging-env-load.ps1` — PowerShell loader helper

**Modified Files:**
- `scripts/r2-verify.mjs` — Added `loadStagingEnv()` call
- `scripts/r2-canary-check.mjs` — Added `loadStagingEnv()` call
- `scripts/r2-rollback-check.mjs` — Added `loadStagingEnv()` call
- `apps/api/src/config.ts` — Added dev-mode staging env loader
- `apps/api/src/telemetry.ts` — Added env source tracking events
- `apps/api/src/index.ts` — Added env diagnostics emission
- `.gitignore` — Updated to protect `.env.staging.local`
- `package.json` — Added npm scripts for staging bootstrap

### 5.2 New NPM Commands

```bash
# Validate env (no secrets printed)
npm run staging:env:check

# Show how to load env into current shell
npm run staging:env:load

# Combined: env check + R2 verification
npm run staging:r2:verify
```

### 5.3 Env-Loader Utility: Core Functions

**In `scripts/env-loader.mjs`:**

```javascript
// Find and load .env.staging.local
loadStagingEnv({ verbose, silent, searchDir })
// Returns: true if loaded, false if not found

// Get diagnostic info (no secrets)
const { source, stagingFileLoaded } = getEnvSource()
// source: "shell" | "staging-file" | "railway" | "default"

// Print env status (no secrets)
logEnvDiagnostics(requiredVars)
// Shows which vars are SET (✓) or MISSING (✗)

// Validate R2 config
const { valid, missing } = validateR2Env()
// Returns: { valid: boolean, missing: string[] }

// Validate staging flags
const { warnings, valid } = validateStagingFlags()
// Returns: { staging, dualWrite, r2Uploads, dualRead, warnings }
```

---

## 6. Canary Execution Workflow (Updated)

### 6.1 Pre-Canary Operator Checklist

```markdown
## S1 Canary Preflight Checklist

**Operator:** ___________________  **Date:** ______________

### Step 1: Environment Setup
- [ ] Copy template: `Copy-Item .env.staging.local.example .env.staging.local`
- [ ] Edit .env.staging.local with real R2 credentials
- [ ] Verify secrets are NOT committed to git

### Step 2: Load Environment (Every Session)
- [ ] Open PowerShell terminal for API server
- [ ] Run: `. .\scripts\staging-env-load.ps1`
- [ ] Verify load succeeded (should show "Loaded X variables")

- [ ] Open PowerShell terminal for Worker process
- [ ] Run: `. .\scripts\staging-env-load.ps1`

- [ ] Open PowerShell terminal for root tooling
- [ ] Run: `. .\scripts\staging-env-load.ps1`

### Step 3: Validate Configuration
- [ ] Run: `npm run staging:env:check`
- [ ] Output: All required R2 vars present? ✓
- [ ] Output: Staging flags configured? ✓
- [ ] Output: No STAGING DISABLED warning? ✓

### Step 4: Verify R2 Connectivity
- [ ] Run: `npm run r2:verify`
- [ ] Output: All 7 checks passed? ✓
- [ ] Output: Bucket reachable? ✓
- [ ] Output: Presigned URL works? ✓

### Step 5: Verify Canary Posture
- [ ] Run: `npm run r2:canary-check`
- [ ] Output: Canary mode: job-percentage (5%)? ✓
- [ ] Output: Dual-write: enabled? ✓
- [ ] Output: R2 uploads: enabled? ✓

### Step 6: Verify Rollback Safety
- [ ] Run: `npm run r2:rollback-check`
- [ ] Output: Storage provider: local? ✓
- [ ] Output: Dual-read: disabled? ✓
- [ ] Output: All checks passed? ✓

### Step 7: Build API & Worker
- [ ] Run: `npm run build`
- [ ] Output: No TypeScript errors? ✓
- [ ] Output: All dist files generated? ✓

### Step 8: Start API
- [ ] Terminal 1 (API): `npm run dev:api`
- [ ] Output: Server listening on :3000? ✓
- [ ] Output: [Startup Config] Feature Flags logged? ✓
- [ ] Output: [Staging] No validation errors? ✓

### Step 9: Start Worker
- [ ] Terminal 2 (Worker): `npm run worker:dev`
- [ ] Output: Worker running? ✓
- [ ] Output: Redis connected? ✓

### Step 10: Execute Single-Job Canary
- [ ] Terminal 3: `npm run canary:single`
  (or manual test job submission)
- [ ] Monitor API terminal for telemetry events
- [ ] Look for: `dual_write_canary_allowed` event
- [ ] Look for: `artifact_dual_write_success` event
- [ ] Verify: Artifact exists locally AND in R2
- [ ] Verify: No sync errors or timeouts

### Step 11: Monitor Rollback Safety
- [ ] Keep API running for 5+ minutes
- [ ] Look for: `unsynced_artifacts_gauge` metric going up/down
- [ ] Look for: No unexpected telemetry errors
- [ ] Manually disable ENABLE_DUAL_WRITE in shell:
  - `$env:ENABLE_DUAL_WRITE = 'false'`
  - Submit another test job
  - Verify: Only local write (no R2 attempt)
  - Look for: No dual_write events in telemetry

### Sign-Off
- [ ] All checks passed
- [ ] No errors observed
- [ ] Telemetry looks healthy
- [ ] Ready for broader canary?

**Approved By:** ___________________  **Time:** ______________
```

### 6.2 Monitoring During Canary

Watch for these telemetry events:

```json
// Expected during canary startup
{"event": "env_source_detected", "source": "shell"}
{"event": "staging_env_loaded", "varsLoaded": 12, "varsSkipped": 0}
{"event": "staging_startup_config", "stagingEnabled": true, ...}
{"event": "staging_canary_initialized", "canaryMode": "job-percentage", ...}

// Expected per canary job
{"event": "dual_write_canary_allowed", "reason": "percentage_allowed"}
{"event": "artifact_dual_write_success", "jobId": "...", "objectKey": "..."}
{"event": "dual_write_upload_completed", "jobId": "...", "latencyMs": 245}

// Safe to ignore
{"event": "dual_write_canary_skip", "reason": "percentage_gate"}

// Should NOT see
{"event": "env_drift_warning", ...}
{"event": "missing_required_env", ...}
{"event": "staging_startup_validation_failed", ...}
```

---

## 7. Railway Production Deployment

### 7.1 Secret Management (No Local Secrets)

On Railway, secrets are **never** stored in `.env` files or committed to git.

```yaml
# Railway dashboard → Project Settings → Variables
# Set these as Railway variables (NOT in git):

STAGING_R2_ENABLED: "false"              # S1 staging OFF in production
ENABLE_DUAL_WRITE: "false"
ENABLE_R2_UPLOADS: "false"
ENABLE_DUAL_READ: "false"
R2_ENDPOINT: "https://prod.r2.cloudflarestorage.com"
R2_BUCKET: "production-bucket"
R2_ACCESS_KEY_ID: "prod-key-id"          # Never in repo
R2_SECRET_ACCESS_KEY: "prod-secret-key"  # Never in repo
```

### 7.2 API vs Worker Service Variable Parity

Both services must have **identical** R2 and staging variables.

```yaml
# Railway: Create or update both services with same secret set

api_service:
  environment:
    R2_ENDPOINT: production-value
    R2_BUCKET: production-value
    # ... all R2 vars

worker_service:
  environment:
    R2_ENDPOINT: production-value         # ← MUST match API
    R2_BUCKET: production-value           # ← MUST match API
    # ... all R2 vars identical to api_service
```

**Verification:** 
```bash
# On Railway, check both services see the same values
railway run env | grep R2_

# api_service output
R2_ENDPOINT=https://prod.r2.cloudflarestorage.com
R2_BUCKET=prod-bucket
...

# worker_service output (should be identical)
R2_ENDPOINT=https://prod.r2.cloudflarestorage.com
R2_BUCKET=prod-bucket
...
```

### 7.3 Production vs Staging Secrets

**Staging on Railway:**
```yaml
# If running S1 staging on Railway (rare):
STAGING_R2_ENABLED: "true"
ENABLE_DUAL_WRITE: "true"
ENABLE_R2_UPLOADS: "true"
R2_ENDPOINT: "https://staging.r2.cloudflarestorage.com"
R2_BUCKET: "staging-bucket"
R2_ACCESS_KEY_ID: "staging-key"
R2_SECRET_ACCESS_KEY: "staging-secret"
```

**Production on Railway:**
```yaml
# Normal production (dual-write OFF):
STAGING_R2_ENABLED: "false"
ENABLE_DUAL_WRITE: "false"
ENABLE_R2_UPLOADS: "false"
R2_ENDPOINT: "https://prod.r2.cloudflarestorage.com"
R2_BUCKET: "production-bucket"
R2_ACCESS_KEY_ID: "prod-key"
R2_SECRET_ACCESS_KEY: "prod-secret"
```

---

## 8. Troubleshooting & Common Issues

### 8.1 "R2_BUCKET=MISSING" After Loading Script

**Problem:**
```powershell
. .\scripts\staging-env-load.ps1
npm run staging:env:check
# Output: ✗ R2_BUCKET (MISSING)
```

**Causes & Solutions:**

1. **File doesn't exist**
   ```powershell
   Test-Path ".env.staging.local"  # Should return $true
   # If $false: Copy-Item .env.staging.local.example .env.staging.local
   ```

2. **File is empty or malformed**
   ```powershell
   Get-Content ".env.staging.local" | Select-Object -First 20
   # Verify it has actual R2 keys, not just comments
   ```

3. **Wrong working directory**
   ```powershell
   Get-Location  # Should be root of repo
   # If not: cd c:\Users\Nazim\Desktop\P.Post\Label Generator
   ```

### 8.2 "env_drift_warning" in Telemetry

**Problem:**
```json
{"event": "env_drift_warning", "driftType": "flag_mismatch", ...}
```

**Cause:** API and Worker have different staging flags.

**Solution:**
1. Check API startup logs for flag values
2. Check Worker startup logs for flag values
3. Ensure both terminals loaded same `.env.staging.local`
4. Restart both with fresh shell sessions

### 8.3 R2 Verification Fails with "Timeout"

**Problem:**
```
❌ [3/7] Testing connectivity... (timeout after 5000ms)
```

**Causes & Solutions:**

1. **R2_ENDPOINT is incorrect**
   ```powershell
   # Verify format: https://account-id.r2.cloudflarestorage.com
   echo $env:R2_ENDPOINT
   ```

2. **R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY is wrong**
   ```powershell
   # Regenerate from Cloudflare R2 console
   # Copy-paste carefully (no leading/trailing spaces)
   ```

3. **Network/firewall blocking Cloudflare R2**
   ```powershell
   # Test DNS resolution
   Resolve-DnsName r2.cloudflarestorage.com
   
   # Test basic connectivity (requires curl or PowerShell 7+)
   Invoke-WebRequest -Uri "https://r2.cloudflarestorage.com" -ErrorAction SilentlyContinue
   ```

### 8.4 "Cannot Import Module" When API Starts

**Problem:**
```
Error: Cannot find module '../../../scripts/env-loader.mjs'
```

**Cause:** API running from dist/ (compiled) path.

**Solution:** This is expected and non-fatal. The env-loader is skipped in production builds. Staging env loads from:
1. `apps/api/.env` via tsx --env-file (dev)
2. Railway variables (production)

---

## 9. Anti-Patterns & What NOT To Do

### ❌ DO NOT: Commit .env.staging.local

```bash
# ✗ WRONG: This exposes real R2 secrets in git history
git add .env.staging.local
git commit -m "Add staging config"
git push

# ✓ RIGHT: Only commit example template
git add .env.staging.local.example
git commit -m "Add staging config template"
```

### ❌ DO NOT: Set Secrets in User/System Environment Scope

```powershell
# ✗ WRONG: Persists to disk; visible in future terminals
[Environment]::SetEnvironmentVariable("R2_SECRET_ACCESS_KEY", "key", "User")

# ✓ RIGHT: Process scope; cleared when terminal closes
[Environment]::SetEnvironmentVariable("R2_SECRET_ACCESS_KEY", "key", "Process")
# Used by staging-env-load.ps1 automatically
```

### ❌ DO NOT: Mix Local & File Config

```bash
# ✗ WRONG: Shell overrides are unclear; hard to reproduce
$env:R2_BUCKET = "one-bucket"
$env:R2_ENDPOINT = "endpoint-from-file"
# Later: Who set R2_BUCKET? Was it shell or file?

# ✓ RIGHT: All staging config from one source (.env.staging.local)
# Shell overrides only for testing: $env:R2_BUCKET = "test-bucket"
```

### ❌ DO NOT: Enable dual-read in local staging

```env
# ✗ WRONG: Staging should be local-first (writes locally, async uploads)
ENABLE_DUAL_READ=true    # Never in local staging!

# ✓ RIGHT: Local-first, sync to R2, dual-read only after validation
ENABLE_DUAL_READ=false   # Keep this OFF during S1
```

### ❌ DO NOT: Run S1 with disabled dual-write

```env
# ✗ WRONG: Staging enabled but uploads disabled — no testing happens
STAGING_R2_ENABLED=true
ENABLE_DUAL_WRITE=false  # Contradicts staging intent

# ✓ RIGHT: If staging, dual-write MUST be enabled
STAGING_R2_ENABLED=true
ENABLE_DUAL_WRITE=true
ENABLE_R2_UPLOADS=true
```

---

## 10. Environment Reference Card

### 10.1 All Configurable Variables

```env
# ========== R2 CREDENTIALS (REQUIRED FOR STAGING) ==========
R2_ENDPOINT                # https://account-id.r2.cloudflarestorage.com
R2_BUCKET                  # Your staging or prod bucket name
R2_ACCESS_KEY_ID           # From Cloudflare R2 console
R2_SECRET_ACCESS_KEY       # Keep secret!

# Alternative names (backward compat)
R2_ACCESS_KEY              # (alternative to R2_ACCESS_KEY_ID)
R2_SECRET_KEY              # (alternative to R2_SECRET_ACCESS_KEY)

# ========== STAGING FEATURE FLAGS ==========
STAGING_R2_ENABLED         # true/false — Master kill-switch for S1
ENABLE_DUAL_WRITE          # true/false — Write to both local + R2
ENABLE_R2_UPLOADS          # true/false — Async uploads after local write
ENABLE_DUAL_READ           # true/false — Read from R2 if local fails (NOT recommended for S1)

# ========== CANARY MODE CONTROLS ==========
R2_CANARY_MODE             # "disabled" | "job-percentage" | "job-count"
R2_CANARY_PERCENTAGE       # 1-100 (when R2_CANARY_MODE=job-percentage)
R2_CANARY_MAX_JOBS         # 1-999999 (when R2_CANARY_MODE=job-count)

# ========== R2 OPERATION TUNING ==========
R2_MAX_CONCURRENT_STREAMS  # Default: 5 (concurrent uploads)
R2_TIMEOUT_MS              # Default: 30000 (30 seconds per operation)
R2_RETRY_LIMIT             # Default: 3 (retries on failure)

# ========== TELEMETRY & DEBUG ==========
TELEMETRY_LOG_FILE         # Path to write JSON telemetry events
STORAGE_PROVIDER           # "local" | "r2" (usually "local" for S1)
STORAGE_DIR                # Where local artifacts are stored

# ========== APP-SPECIFIC (Inherited from apps/api/.env) ==========
NODE_ENV                   # "development" | "production"
PORT                       # API port (default: 3000)
DATABASE_URL               # PostgreSQL connection string
REDIS_URL                  # Redis connection string
JWT_SECRET                 # JWT signing secret
WEB_ORIGIN                 # CORS allowed origin
API_ORIGIN                 # API origin URL
# ... many others in apps/api/.env.example
```

### 10.2 Suggested S1 Staging Configuration

```env
# Local Staging (First Canary)
STAGING_R2_ENABLED=true
ENABLE_DUAL_WRITE=true
ENABLE_R2_UPLOADS=true
ENABLE_DUAL_READ=false
R2_CANARY_MODE=job-percentage
R2_CANARY_PERCENTAGE=5
R2_CANARY_MAX_JOBS=100
TELEMETRY_LOG_FILE=./telemetry-staging.log

# Local Testing (Full Blast, No Canary)
STAGING_R2_ENABLED=true
ENABLE_DUAL_WRITE=true
ENABLE_R2_UPLOADS=true
ENABLE_DUAL_READ=false
R2_CANARY_MODE=disabled        # ALL jobs dual-write
TELEMETRY_LOG_FILE=./telemetry-testing.log

# Local Rollback Test (Staging Disabled)
STAGING_R2_ENABLED=false
ENABLE_DUAL_WRITE=false
ENABLE_R2_UPLOADS=false
ENABLE_DUAL_READ=false
```

---

## 11. Summary & Key Takeaways

| **Aspect** | **Local Staging** | **Production (Railway)** |
|---|---|---|
| **Env Source** | `.env.staging.local` (gitignored) | Railway secret variables (UI) |
| **Precedence** | Shell > File > Defaults | Shell > Railway vars > Defaults |
| **Secrets Location** | Never in git; local disk only | Railway secret manager; never in git |
| **Staging Flags** | Toggle with S1 flags (true/false) | Disabled in production (false) |
| **Canary Mode** | job-percentage (5%) | N/A (no canary in prod) |
| **Dual-Read** | false (local-first) | false (production stability) |
| **Validation** | `npm run staging:env:check` | Railway logs & startup validation |

### 11.1 Operator Workflow (Simplified)

```powershell
# 1. ONE TIME: Setup
Copy-Item .env.staging.local.example .env.staging.local
notepad .env.staging.local  # Add R2 credentials

# 2. EVERY SESSION: Load env into each terminal
. .\scripts\staging-env-load.ps1

# 3. BEFORE CANARY: Validate
npm run staging:env:check
npm run staging:r2:verify

# 4. DURING CANARY: Monitor
npm run dev:api                # Terminal 1
npm run worker:dev             # Terminal 2
# Test jobs; watch telemetry

# 5. POST-CANARY: Verify
npm run r2:rollback-check      # Ensure local-first still works
```

---

## 12. Future Enhancements

- [ ] Bash/Zsh equivalent of `staging-env-load.ps1`
- [ ] GitHub Actions CI integration for staged secrets
- [ ] Automated env parity checker (API vs Worker)
- [ ] Visual dashboard showing current env state
- [ ] Automated canary percentage ramp-up logic

---

**Document Version:** 1.0  
**Last Updated:** May 18, 2026  
**Maintained By:** DevOps / Platform Team  
