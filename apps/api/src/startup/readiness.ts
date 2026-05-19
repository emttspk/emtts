type RuntimeTarget = "API" | "WORKER";

export type StartupReadinessState =
  | "FULLY_READY"
  | "DEGRADED_NO_DB"
  | "DEGRADED_NO_REDIS"
  | "DEGRADED_NO_DB_OR_REDIS";

interface DatabaseEnvStatus {
  configured: boolean;
  host: string;
  port: number;
  localDevelopmentTarget: boolean;
  missingEnvVars: string[];
  misconfiguredEnvVars: string[];
  issue?: string;
}

interface RedisEnvStatus {
  configured: boolean;
  usable: boolean;
  placeholder: boolean;
  localInProduction: boolean;
  missingEnvVars: string[];
  misconfiguredEnvVars: string[];
  issue?: string;
}

export interface InfrastructureEnvStatus {
  database: DatabaseEnvStatus;
  redis: RedisEnvStatus;
}

export interface StartupReadinessReport {
  target: RuntimeTarget;
  state: StartupReadinessState;
  missingEnvVars: string[];
  misconfiguredEnvVars: string[];
  blockedCapabilities: string[];
  nextActions: string[];
  database: {
    configured: boolean;
    ready: boolean;
    host: string;
    port: number;
    issue?: string;
  };
  redis: {
    configured: boolean;
    usable: boolean;
    ready: boolean;
    issue?: string;
  };
}

// Stage S1 Staging Configuration Report
export interface StagingConfigReport {
  stagingEnabled: boolean;
  canaryMode: "disabled" | "job-percentage" | "job-count";
  canaryPercentage?: number;
  canaryMaxJobs?: number;
  dualWriteEnabled: boolean;
  r2UploadsEnabled: boolean;
  r2Endpoint?: string;
  r2BucketConfigured: boolean;
  credentialsConfigured: boolean;
  nextActions: string[];
}

function getUrlHost(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function getUrlPort(url: string | undefined, fallbackPort: number): number {
  if (!url) return fallbackPort;
  try {
    return Number(new URL(url).port || fallbackPort);
  } catch {
    return fallbackPort;
  }
}

function isLocalHost(host: string): boolean {
  const normalized = String(host || "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "0.0.0.0";
}

export function classifyStartupReadiness(databaseReady: boolean, redisReady: boolean): StartupReadinessState {
  if (databaseReady && redisReady) return "FULLY_READY";
  if (!databaseReady && !redisReady) return "DEGRADED_NO_DB_OR_REDIS";
  if (!databaseReady) return "DEGRADED_NO_DB";
  return "DEGRADED_NO_REDIS";
}

export function getInfrastructureEnvStatus(): InfrastructureEnvStatus {
  const isProduction = process.env.NODE_ENV === "production";
  const dbUrl = String(process.env.DATABASE_URL ?? "").trim();
  const redisUrl = String(process.env.REDIS_URL ?? "").trim();
  const dbHost = getUrlHost(dbUrl);
  const dbPort = getUrlPort(dbUrl, 5432);
  const validDbProtocol = dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");

  const database: DatabaseEnvStatus = {
    configured: Boolean(dbUrl) && validDbProtocol,
    host: dbHost,
    port: dbPort,
    localDevelopmentTarget: isLocalHost(dbHost),
    missingEnvVars: dbUrl ? [] : ["DATABASE_URL"],
    misconfiguredEnvVars: [],
  };
  if (dbUrl && !validDbProtocol) {
    database.misconfiguredEnvVars.push("DATABASE_URL");
    database.issue = "DATABASE_URL must start with postgresql:// or postgres://";
  }
  if (isProduction && dbHost && isLocalHost(dbHost)) {
    database.misconfiguredEnvVars.push("DATABASE_URL");
    database.issue = "DATABASE_URL points to localhost in production";
  }
  if (!database.issue && !database.configured) {
    database.issue = dbUrl ? "DATABASE_URL is invalid" : "DATABASE_URL is missing";
  }

  const placeholderRedisUrl = /(^|[:@/])HOST([:@/]|$)|(^|[:@/])PASSWORD([:@/]|$)/i.test(redisUrl);
  const localRedisInProduction = isProduction && /(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(redisUrl);
  const usableRedisUrl = Boolean(redisUrl) && !placeholderRedisUrl && !localRedisInProduction;

  const redis: RedisEnvStatus = {
    configured: Boolean(redisUrl),
    usable: usableRedisUrl,
    placeholder: placeholderRedisUrl,
    localInProduction: localRedisInProduction,
    missingEnvVars: redisUrl ? [] : ["REDIS_URL"],
    misconfiguredEnvVars: [],
  };
  if (!redisUrl) {
    redis.issue = "REDIS_URL is missing";
  } else if (placeholderRedisUrl) {
    redis.misconfiguredEnvVars.push("REDIS_URL");
    redis.issue = "REDIS_URL is a placeholder value";
  } else if (localRedisInProduction) {
    redis.misconfiguredEnvVars.push("REDIS_URL");
    redis.issue = "REDIS_URL points to localhost in production";
  }

  return { database, redis };
}

function buildBlockedCapabilities(target: RuntimeTarget, databaseReady: boolean, redisReady: boolean): string[] {
  const blocked = new Set<string>();
  if (!databaseReady) {
    if (target === "API") {
      blocked.add("database-backed API routes");
      blocked.add("default plan seed");
      blocked.add("queue recovery from DB state");
    } else {
      blocked.add("worker job initialization");
      blocked.add("job status persistence");
      blocked.add("artifact generation pipeline");
    }
  }
  if (!redisReady) {
    if (target === "API") {
      blocked.add("Redis-backed queue recovery");
      blocked.add("worker health verification via Redis singleton lock");
    } else {
      blocked.add("BullMQ queue consumption");
      blocked.add("worker singleton lock enforcement");
    }
  }
  return Array.from(blocked);
}

function buildNextActions(envStatus: InfrastructureEnvStatus, databaseReady: boolean, redisReady: boolean): string[] {
  const actions = new Set<string>();

  if (!databaseReady) {
    if (envStatus.database.missingEnvVars.includes("DATABASE_URL")) {
      actions.add("Set DATABASE_URL in apps/api/.env or attach a PostgreSQL service before restarting.");
    } else if (envStatus.database.localDevelopmentTarget) {
      actions.add("Start PostgreSQL on localhost:5432, then verify with Test-NetConnection -ComputerName localhost -Port 5432.");
      actions.add("For local bootstrap, run npm run prisma:migrate --workspace=@labelgen/api after PostgreSQL is available.");
    } else {
      actions.add("Verify DATABASE_URL points to a reachable PostgreSQL instance and restart after connectivity is restored.");
    }
  }

  if (!redisReady) {
    if (envStatus.redis.missingEnvVars.includes("REDIS_URL")) {
      actions.add("Set REDIS_URL to a real Redis endpoint before expecting queue processing or worker singleton locking.");
    } else if (envStatus.redis.placeholder) {
      actions.add("Replace the REDIS_URL placeholder with a real Redis URL.");
    } else {
      actions.add("Verify Redis is reachable and responds to PING before expecting queue operations to succeed.");
    }
    actions.add("For local bootstrap, run docker compose up -d if Docker is installed and your compose file provides Redis.");
  }

  if (databaseReady && redisReady) {
    actions.add("No infrastructure action required. Services are fully ready.");
  }

  return Array.from(actions);
}

export function createStartupReadinessReport(
  target: RuntimeTarget,
  input: {
    databaseReady: boolean;
    redisReady: boolean;
    databaseIssue?: string;
    redisIssue?: string;
  },
): StartupReadinessReport {
  const envStatus = getInfrastructureEnvStatus();

  return {
    target,
    state: classifyStartupReadiness(input.databaseReady, input.redisReady),
    missingEnvVars: [...envStatus.database.missingEnvVars, ...envStatus.redis.missingEnvVars],
    misconfiguredEnvVars: [...envStatus.database.misconfiguredEnvVars, ...envStatus.redis.misconfiguredEnvVars],
    blockedCapabilities: buildBlockedCapabilities(target, input.databaseReady, input.redisReady),
    nextActions: buildNextActions(envStatus, input.databaseReady, input.redisReady),
    database: {
      configured: envStatus.database.configured,
      ready: input.databaseReady,
      host: envStatus.database.host,
      port: envStatus.database.port,
      issue: input.databaseIssue ?? envStatus.database.issue,
    },
    redis: {
      configured: envStatus.redis.configured,
      usable: envStatus.redis.usable,
      ready: input.redisReady,
      issue: input.redisIssue ?? envStatus.redis.issue,
    },
  };
}

export function logStartupReadinessReport(report: StartupReadinessReport) {
  console.log(`[${report.target}] Startup readiness state: ${report.state}`);
  console.log(
    `[${report.target}] DB connectivity: ${report.database.ready ? "READY" : "NOT READY"}`
      + (report.database.issue ? ` (${report.database.issue})` : "")
      + (report.database.host ? ` [${report.database.host}:${report.database.port}]` : ""),
  );
  console.log(
    `[${report.target}] Redis connectivity: ${report.redis.ready ? "READY" : "NOT READY"}`
      + (report.redis.issue ? ` (${report.redis.issue})` : ""),
  );

  if (report.missingEnvVars.length > 0) {
    console.warn(`[${report.target}] Missing env vars: ${report.missingEnvVars.join(", ")}`);
  }
  if (report.misconfiguredEnvVars.length > 0) {
    console.warn(`[${report.target}] Misconfigured env vars: ${report.misconfiguredEnvVars.join(", ")}`);
  }
  if (report.blockedCapabilities.length > 0) {
    console.warn(`[${report.target}] Blocked capabilities:`);
    report.blockedCapabilities.forEach((capability) => console.warn(`  - ${capability}`));
  }
  if (report.nextActions.length > 0) {
    console.log(`[${report.target}] Next-action guidance:`);
    report.nextActions.forEach((action) => console.log(`  - ${action}`));
  }
}

// Stage S1 Staging Config Report: Validates S1 staging readiness
export function getStagingConfigReport(): StagingConfigReport {
  // Lazy import to avoid circular dependency issues
  const stagingConfig = {
    STAGING_R2_ENABLED: process.env.STAGING_R2_ENABLED === "true",
    CANARY_MODE: (process.env.R2_CANARY_MODE || "disabled") as "disabled" | "job-percentage" | "job-count",
    CANARY_PERCENTAGE: Math.max(1, Math.min(100, parseInt(process.env.R2_CANARY_PERCENTAGE || "5", 10))),
    CANARY_MAX_JOBS: Math.max(1, parseInt(process.env.R2_CANARY_MAX_JOBS || "100", 10)),
  };
  
  const featureFlags = {
    ENABLE_DUAL_WRITE: process.env.ENABLE_DUAL_WRITE === "true",
    ENABLE_R2_UPLOADS: process.env.ENABLE_R2_UPLOADS === "true",
  };
  
  const r2Endpoint = process.env.R2_ENDPOINT;
  const r2Bucket = process.env.R2_BUCKET;
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY || "").trim();
  
  const credentialsConfigured = Boolean(accessKeyId && secretAccessKey);
  const bucketConfigured = Boolean(r2Bucket);
  
  const nextActions: string[] = [];
  
  if (!stagingConfig.STAGING_R2_ENABLED) {
    nextActions.push("Staging disabled: set STAGING_R2_ENABLED=true to enable S1 staging");
  } else {
    if (!credentialsConfigured) {
      nextActions.push("R2 credentials not configured: set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY");
    }
    if (!bucketConfigured) {
      nextActions.push("R2 bucket not configured: set R2_BUCKET");
    }
    if (!r2Endpoint) {
      nextActions.push("R2 endpoint not configured: set R2_ENDPOINT");
    }
    if (stagingConfig.CANARY_MODE !== "disabled") {
      nextActions.push(`Canary mode active: ${stagingConfig.CANARY_MODE} (${stagingConfig.CANARY_MODE === "job-percentage" ? `${stagingConfig.CANARY_PERCENTAGE}%` : `max ${stagingConfig.CANARY_MAX_JOBS} jobs`})`);
    }
  }
  
  return {
    stagingEnabled: stagingConfig.STAGING_R2_ENABLED,
    canaryMode: stagingConfig.CANARY_MODE,
    canaryPercentage: stagingConfig.CANARY_MODE === "job-percentage" ? stagingConfig.CANARY_PERCENTAGE : undefined,
    canaryMaxJobs: stagingConfig.CANARY_MODE === "job-count" ? stagingConfig.CANARY_MAX_JOBS : undefined,
    dualWriteEnabled: featureFlags.ENABLE_DUAL_WRITE,
    r2UploadsEnabled: featureFlags.ENABLE_R2_UPLOADS,
    r2Endpoint,
    r2BucketConfigured: bucketConfigured,
    credentialsConfigured,
    nextActions,
  };
}

export function logStagingConfigReport(report: StagingConfigReport) {
  if (report.stagingEnabled) {
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║  STAGE S1 STAGING MODE ENABLED                             ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log(`[S1 STAGING] Dual-write: ${report.dualWriteEnabled ? "enabled" : "disabled"}`);
    console.log(`[S1 STAGING] R2 uploads: ${report.r2UploadsEnabled ? "enabled" : "disabled"}`);
    console.log(`[S1 STAGING] Canary mode: ${report.canaryMode}`);
    if (report.canaryMode === "job-percentage") {
      console.log(`[S1 STAGING] Canary limit: ${report.canaryPercentage}% of jobs`);
    } else if (report.canaryMode === "job-count") {
      console.log(`[S1 STAGING] Canary limit: first ${report.canaryMaxJobs} jobs only`);
    }
    console.log(`[S1 STAGING] Credentials: ${report.credentialsConfigured ? "configured" : "NOT CONFIGURED"}`);
    console.log(`[S1 STAGING] Bucket: ${report.r2BucketConfigured ? "configured" : "NOT CONFIGURED"}`);
  }
  
  if (report.nextActions.length > 0) {
    console.log(`[S1 STAGING] Actions:`);
    report.nextActions.forEach((action) => console.log(`  - ${action}`));
  }
}