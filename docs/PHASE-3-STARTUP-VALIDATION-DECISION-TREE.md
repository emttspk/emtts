# Phase 3: Runtime Startup Validation Decision Tree

## Overview
This document specifies the exact 12-phase startup sequence with 5 critical decision points that govern the behavior of the LabelGen API during startup. Phase 3 implements permissive local-only behavior with strict fail-fast requirements for staging-enabled deployments.

## Core Principles
- **Local-only mode (default)**: Permissive - HTTP server starts even if infrastructure is degraded
- **Staging-enabled mode**: Strict - Infrastructure must be fully ready, fail-fast on any missing component
- **Rollback safety**: All decisions default to local-only; staging requires explicit opt-in
- **No secrets in telemetry**: All logs redact credentials
- **Observability**: Every decision point emits telemetry events

## Startup Sequence (12 Phases)

### Phase 1: Initialize and Normalize
**When:** Process startup begins  
**Actions:**
- Create Express application
- Parse environment variables
- Normalize DATABASE_URL (postgres:// → postgresql://)
- Set global crash handlers (uncaughtException, unhandledRejection)

**Telemetry Events:**
- None (initialization only)

**Decision Point 1: Path Classification**

### Phase 2: Classify Startup Path (LOCAL-ONLY vs STAGING)
**When:** After normalization, before infrastructure validation  
**Logic:**
```
IF (STAGING_R2_ENABLED == true AND ENABLE_R2_UPLOADS == true)
  → STAGING path
ELSE
  → LOCAL-ONLY path
```

**Telemetry Event:** `logStartupPathClassified()`
```typescript
{
  event: "startup_path_classified",
  path: "local-only" | "staging",
  stagingR2Enabled: boolean,
  r2UploadsEnabled: boolean,
  timestamp: ISO8601
}
```

**Implications:**
- LOCAL-ONLY: HTTP server starts regardless of infrastructure readiness
- STAGING: All infrastructure must be validated before startup continues

---

### Phase 3: Validate Infrastructure (Database and Redis)
**When:** After path classification  
**Timeout:** 5 seconds per endpoint (configurable)  
**Latency Tracking:** Measure and emit latency for each check

**3A. Database Validation Check**
```typescript
IF hasUsableDatabaseUrl():
  - Parse DATABASE_URL
  - IF production AND localhost: FAIL (invalid config)
  - Check TCP reachability to host:port (500ms timeout)
  - Record latencyMs
  EMIT: logDatabaseValidationCheck()
ELSE:
  - DATABASE_URL is missing or invalid
  EMIT: logDatabaseValidationCheck() with reachable=false
```

**Telemetry Event:** `logDatabaseValidationCheck()`
```typescript
{
  event: "database_validation_check",
  reachable: boolean,
  host?: string,
  port?: number,
  latencyMs?: number,
  issue?: string
}
```

**3B. Redis Validation Check**
```typescript
IF REDIS_URL is configured AND valid:
  - Parse REDIS_URL
  - IF production AND localhost: WARN (not fail)
  - Check TCP reachability to host:port (500ms timeout)
  - Record latencyMs
  EMIT: logRedisValidationCheck()
ELSE:
  - REDIS_URL is missing or placeholder
  EMIT: logRedisValidationCheck() with reachable=false
```

**Telemetry Event:** `logRedisValidationCheck()`
```typescript
{
  event: "redis_validation_check",
  reachable: boolean,
  host?: string,
  port?: number,
  latencyMs?: number,
  issue?: string
}
```

**Decision Point 2: Infrastructure Readiness Classification**

---

### Phase 4: Classify Infrastructure Readiness
**When:** After infrastructure validation checks  
**Logic:**
```
CLASSIFY readiness:
  IF databaseReachable == true AND redisReachable == true:
    → FULLY_READY
  ELSE IF databaseReachable == true AND redisReachable == false:
    → DEGRADED_NO_REDIS
  ELSE IF databaseReachable == false AND redisReachable == true:
    → DEGRADED_NO_DATABASE
  ELSE:
    → DEGRADED_NO_INFRASTRUCTURE
```

**Telemetry Event:** `logInfrastructureReadinessClassified()`
```typescript
{
  event: "infrastructure_readiness_classified",
  classification: "fully_ready" | "degraded_no_redis" | "degraded_no_database" | "degraded_no_infrastructure",
  databaseReachable: boolean,
  redisReachable: boolean,
  totalLatencyMs: number
}
```

---

### Phase 5: Classify Overall Startup Mode
**When:** After infrastructure classification  
**Emits:** `logStartupClassification()`

```typescript
CLASSIFY startup:
  IF path == "local-only":
    classification = "local_only_permissive"
  ELSE IF path == "staging":
    IF readiness == "fully_ready":
      classification = "staging_strict_ready"
    ELSE:
      classification = "staging_strict_degraded"
```

**Telemetry Event:** `logStartupClassification()`
```typescript
{
  event: "startup_classification",
  startupMode: "local_only_permissive" | "staging_strict_ready" | "staging_strict_degraded",
  infraReadiness: string,
  startupPath: "local-only" | "staging"
}
```

**Decision Point 3: Continue vs Fail-Fast (For Staging)**

---

### Phase 6: Enforce Staging Infrastructure Requirements (Fail-Fast)
**When:** Classification complete, before R2 validation  
**Only applies if:** Startup path == STAGING

**Logic:**
```typescript
IF startupPath == "staging":
  IF readiness != "fully_ready":
    // Staging mode requires fully ready infrastructure
    EMIT: logStagingInfrastructureCheck(decision: "fail-fast")
    LOG ERROR: "Staging startup: Infrastructure not ready"
    EXIT(1)
  ELSE:
    EMIT: logStagingInfrastructureCheck(decision: "continue")
ELSE:
  // Local-only mode: continue regardless
  EMIT: logStagingInfrastructureCheck(decision: "permissive")
  CONTINUE
```

**Telemetry Event:** `logStagingInfrastructureCheck()`
```typescript
{
  event: "staging_startup_infrastructure_check",
  decision: "fail-fast" | "continue" | "permissive",
  reason?: string,
  infraReadiness?: string
}
```

---

### Phase 7-9: R2 Validation (STAGING-ONLY)

**Phase 7: R2 Timeout Validation**
```typescript
IF startupPath == "staging":
  const timeoutMs = Number(R2_TIMEOUT_MS || 0)
  IF NOT (1000 <= timeoutMs <= 120000):
    EMIT: logR2TimeoutValidation(valid: false)
    LOG ERROR: "R2_TIMEOUT_MS invalid"
    EXIT(1)
  ELSE:
    EMIT: logR2TimeoutValidation(valid: true, timeoutMs)
```

**Telemetry Event:** `logR2TimeoutValidation()`
```typescript
{
  event: "r2_timeout_validation",
  valid: boolean,
  timeoutMs?: number,
  minMs: 1000,
  maxMs: 120000
}
```

**Phase 8: R2 Credentials Validation**
```typescript
IF startupPath == "staging":
  required = ["R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]
  missing = required.filter(k => !env[k])

  IF missing.length > 0:
    EMIT: logR2CredentialsValidation(valid: false, missing)
    LOG ERROR: "Missing R2 credentials"
    EXIT(1)
  ELSE:
    EMIT: logR2CredentialsValidation(valid: true)

  EMIT: logR2ConfigValidation(endpoint: configured, bucket: configured)
  EMIT: logR2EnvironmentValidationComplete(allValid: true)
```

**Telemetry Events:**
- `logR2CredentialsValidation()`
- `logR2ConfigValidation()`
- `logR2EnvironmentValidationComplete()`

**Phase 9: R2 Connectivity Validation**
```typescript
IF startupPath == "staging" AND credentials_valid:
  const provider = new R2StorageProvider(credentials)
  validation = await provider.validateBucketAccess()

  EMIT: logR2ConnectivityValidation(validation)

  IF validation.allValid == false:
    LOG ERROR: "R2 connectivity validation failed"
    EXIT(1)
  ELSE:
    EMIT: logStagingStartupValidationPassed()
```

**Telemetry Event:** `logR2ConnectivityValidation()`
```typescript
{
  event: "r2_connectivity_validation",
  connectivity: boolean,
  uploadable: boolean,
  downloadable: boolean,
  presignedUrl: boolean,
  allValid: boolean,
  latencyMs?: number,
  errors?: string[]
}
```

---

**Decision Point 4: Database Initialization**

### Phase 10: Database Initialization (Async)
**When:** HTTP server listening, after S1 validation  
**Behavior:** Non-blocking (doesn't prevent startup)

```typescript
IF startupPath == "staging" AND validationFailed:
  FAIL (already exited in Phase 9)

TRY:
  IF hasUsableDatabaseUrl():
    AWAIT ensureDatabaseConnection()
    EMIT: logDatabaseConnectionResult(connected: true)
  ELSE:
    EMIT: logDatabaseConnectionResult(connected: false, reason: "no_url")
CATCH:
  EMIT: logDatabaseConnectionResult(connected: false, error: message)
  LOG: "Database initialization failed (non-blocking)"
```

**Telemetry Event:** `logDatabaseConnectionResult()`
```typescript
{
  event: "database_connection_result",
  connected: boolean,
  latencyMs?: number,
  error?: string
}
```

---

### Phase 11: Metrics Initialization
**When:** After database initialization attempt  
**Action:** Initialize Prometheus metrics and gauges

**Telemetry Event:** `logStartupMetricsInitialized()`
```typescript
{
  event: "startup_metrics_initialized",
  metricsEnabled: true,
  timestamp: ISO8601
}
```

---

### Phase 12: HTTP Server Listening + Background Services
**When:** Express app bound to port  
**Action:** Start background services (cleanup cron, queue recovery, etc.)

**Telemetry Events:**
- `logHttpServerListening()`: Server bound to port
- `logBackgroundServicesInitialized()`: Cron, recovery started
- `logStartupComplete()`: Final startup event

```typescript
EMIT: logHttpServerListening(port: 3000)
START: cleanup cron, queue recovery
EMIT: logBackgroundServicesInitialized()
EMIT: logStartupComplete(mode: startupMode, timeMs: totalDuration)
```

---

## Decision Points Summary

| # | Decision Point | Local-Only Behavior | Staging Behavior |
|---|---|---|---|
| 1 | Path Classification | Permissive local-only | Strict staging |
| 2 | Infrastructure Ready? | Continue (degraded OK) | Fail-fast if degraded |
| 3 | Staging Infrastructure? | N/A | Exit(1) if not ready |
| 4 | R2 Validation | Skipped | Must pass all checks |
| 5 | Database Ready? | Non-blocking (async) | Initialized before HTTP |

---

## Degraded-Mode Matrix (LOCAL-ONLY)

| Database | Redis | Outcome |
|---|---|---|
| ✅ | ✅ | FULLY_READY → HTTP online, all features |
| ✅ | ❌ | DEGRADED_NO_REDIS → HTTP online, no queue |
| ❌ | ✅ | DEGRADED_NO_DATABASE → HTTP online, no DB routes |
| ❌ | ❌ | DEGRADED_NO_INFRASTRUCTURE → HTTP online, health checks only |

---

## Latency Thresholds

| Component | Timeout | Rationale |
|---|---|---|
| Database TCP | 500ms | Fast local/network check |
| Redis TCP | 500ms | Fast local/network check |
| R2 Validation | R2_TIMEOUT_MS (default 30s) | S3-compatible API timeout |
| Total startup | Unbounded | Staging strict, local permissive |

---

## Telemetry Events Reference

### Startup Classification Events
1. **startup_path_classified** - (Path = local-only or staging?)
2. **database_validation_check** - (Database reachable?)
3. **redis_validation_check** - (Redis reachable?)
4. **infrastructure_readiness_classified** - (Classification of readiness)
5. **startup_classification** - (Overall startup mode)
6. **staging_startup_infrastructure_check** - (Staging fail-fast check)

### R2 Validation Events (Staging Only)
7. **r2_timeout_validation** - (R2_TIMEOUT_MS valid?)
8. **r2_credentials_validation** - (R2 credentials present?)
9. **r2_config_validation** - (R2 endpoint, bucket configured?)
10. **r2_environment_validation_complete** - (All R2 env checks done?)
11. **r2_connectivity_validation** - (R2 bucket accessible?)
12. **staging_startup_validation_passed** - (All staging checks passed)

### Initialization Events
13. **database_connection_latency** - (Database connection timing)
14. **database_connection_result** - (Database connection outcome)
15. **startup_metrics_initialized** - (Metrics system ready)
16. **http_server_listening** - (Server bound to port)
17. **background_services_initialized** - (Cron, recovery started)
18. **startup_complete** - (Final: startup done)
19. **startup_validation_failure** - (Startup failed/exited)

---

## Verification Checklist

### Local-Only Startup (No Staging)
- [ ] `unset STAGING_R2_ENABLED && npm run dev:api`
- [ ] Startup messages show "local-only mode"
- [ ] Telemetry: `startup_path_classified: path=local-only`
- [ ] No R2 validation events in telemetry
- [ ] HTTP server online: `curl http://localhost:3000/health` → `{"status":"ok"}`
- [ ] Database validation shows attempt (reachable: true/false)
- [ ] Redis validation shows attempt (reachable: true/false)
- [ ] Server continues even if DB/Redis unreachable (degraded mode)

### Staging-Enabled Startup (With R2)
- [ ] `export STAGING_R2_ENABLED=true ENABLE_R2_UPLOADS=true && npm run dev:api`
- [ ] Startup messages show "staging-enabled"
- [ ] All R2 validation events present and passing
- [ ] `staging_startup_validation_passed` event emitted
- [ ] HTTP server online
- [ ] Metrics initialized correctly

### Fail-Fast Scenarios
1. **Missing Database (Staging)**
   - [ ] Startup exits(1)
   - [ ] Error: "infrastructure not ready"
   - [ ] Telemetry: `staging_startup_infrastructure_check decision=fail-fast`

2. **Missing R2 Credentials (Staging)**
   - [ ] Startup exits(1)
   - [ ] Error: "Missing required R2 startup configuration"
   - [ ] Telemetry: `r2_credentials_validation valid=false`

3. **R2 Bucket Inaccessible (Staging)**
   - [ ] Startup exits(1)
   - [ ] Error: "R2 startup validation failed"
   - [ ] Telemetry: `r2_connectivity_validation allValid=false`

### Telemetry Verification
- [ ] All events logged (18 total)
- [ ] No secrets in logs
- [ ] Timestamps present (ISO8601)
- [ ] Events in order of startup sequence

---

## Secret Redaction Rules

**NEVER log:**
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- DATABASE_URL (password component)
- REDIS_URL (password component)

**Instead log:**
- Credentials present: `boolean` (true/false)
- Endpoint configured: `boolean`
- Bucket configured: `boolean`
- Timeout set: `number` (milliseconds, never the password)

## Verified Phase 4 Completion Note

- The final live S1 canary completed successfully with exactly one authenticated upload job.
- The job flowed through upload, queue, worker, local PDF, async R2 dual-write, telemetry, and sync tracking.
- The rollback path remained instant and was validated in local-only mode.

See [PHASE-4-LIVE-CANARY-FINAL-REPORT.md](PHASE-4-LIVE-CANARY-FINAL-REPORT.md) for the exact evidence.