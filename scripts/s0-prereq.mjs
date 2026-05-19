#!/usr/bin/env node

/**
 * Stage S0 Prerequisite Verification
 * 
 * Validates that the system is in FULLY_READY state before S0 baseline testing.
 * Checks:
 * - PostgreSQL reachable
 * - Redis reachable  
 * - Environment correctly configured
 * - Prisma client generated
 * - No R2 flags enabled
 * 
 * Usage:
 *   node scripts/s0-prereq.mjs
 * 
 * Exit codes:
 *   0 = S0 READY
 *   1 = S0 NOT READY
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createConnection } from 'net';

const cwd = process.cwd();
const envPath = resolve(cwd, 'apps/api/.env');
const prismaDist = resolve(cwd, 'node_modules/.prisma');

// ========== HELPERS ==========

function parseEnv(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }
  const content = readFileSync(filePath, 'utf-8');
  const env = {};
  content.split('\n').forEach((line) => {
    const [key, ...rest] = line.split('=');
    if (key && !key.startsWith('#')) {
      env[key.trim()] = rest.join('=').trim();
    }
  });
  return env;
}

function testTcpConnection(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: timeoutMs });
    let connected = false;

    socket.once('connect', () => {
      connected = true;
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      resolve(false);
    });

    setTimeout(() => {
      if (!connected) {
        socket.destroy();
        resolve(false);
      }
    }, timeoutMs + 100);
  });
}

async function testPostgreSQLConnection(url) {
  try {
    const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)/);
    if (!match) {
      return false;
    }
    const [, , , host, port] = match;
    return await testTcpConnection(host, Number(port), 3000);
  } catch {
    return false;
  }
}

function isRedisUrlPlaceholder(url) {
  return /(^|[:@/])HOST([:@/]|$)|(^|[:@/])PASSWORD([:@/]|$)/i.test(url);
}

async function testRedisConnection(url) {
  if (!url || isRedisUrlPlaceholder(url)) {
    return false;
  }

  try {
    // Handle both redis://host:port and redis://user:pass@host:port formats
    const match = url.match(/^redis:\/\/(?:[^@]+@)?([^:]+):(\d+)$/);
    if (!match) {
      return false;
    }
    const [, host, port] = match;
    return await testTcpConnection(host, Number(port), 2000);
  } catch {
    return false;
  }
}

// ========== MAIN LOGIC ==========

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('STAGE S0 PREREQUISITE VERIFICATION');
  console.log('='.repeat(70) + '\n');

  let passed = 0;
  let failed = 0;

  // 1. Check .env exists
  console.log('1️⃣  Checking environment file...');
  if (!existsSync(envPath)) {
    console.log('❌ .env not found at apps/api/.env');
    failed++;
  } else {
    console.log('✅ .env found');
    passed++;
  }

  // 2. Check DATABASE_URL
  console.log('\n2️⃣  Checking DATABASE_URL...');
  const env = parseEnv(envPath);
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('❌ DATABASE_URL not set in .env');
    failed++;
  } else if (!databaseUrl.startsWith('postgresql://')) {
    console.log(`❌ DATABASE_URL has invalid format: ${databaseUrl.substring(0, 50)}...`);
    failed++;
  } else {
    console.log('✅ DATABASE_URL is configured');
    passed++;
  }

  // 3. Check REDIS_URL
  console.log('\n3️⃣  Checking REDIS_URL...');
  const redisUrl = env.REDIS_URL;
  if (!redisUrl) {
    console.log('❌ REDIS_URL not set in .env');
    failed++;
  } else if (isRedisUrlPlaceholder(redisUrl)) {
    console.log(`❌ REDIS_URL is still a placeholder: ${redisUrl}`);
    failed++;
  } else {
    console.log('✅ REDIS_URL is configured');
    passed++;
  }

  // 4. Check Prisma generated
  console.log('\n4️⃣  Checking Prisma client...');
  if (!existsSync(prismaDist)) {
    console.log('❌ Prisma client not generated. Run: npm run prisma:generate --workspace=@labelgen/api');
    failed++;
  } else {
    console.log('✅ Prisma client generated');
    passed++;
  }

  // 5. Check R2 flags disabled
  console.log('\n5️⃣  Checking R2 flags...');
  const enableDualWrite = env.ENABLE_DUAL_WRITE === 'true';
  const enableDualRead = env.ENABLE_DUAL_READ === 'true';
  const enableR2Uploads = env.ENABLE_R2_UPLOADS === 'true';
  const enableR2Downloads = env.ENABLE_R2_DOWNLOADS === 'true';

  if (enableDualWrite || enableDualRead || enableR2Uploads || enableR2Downloads) {
    console.log('❌ R2 flags must be disabled for S0:');
    if (enableDualWrite) console.log('   - ENABLE_DUAL_WRITE=true');
    if (enableDualRead) console.log('   - ENABLE_DUAL_READ=true');
    if (enableR2Uploads) console.log('   - ENABLE_R2_UPLOADS=true');
    if (enableR2Downloads) console.log('   - ENABLE_R2_DOWNLOADS=true');
    failed++;
  } else {
    console.log('✅ All R2 flags disabled (as required)');
    passed++;
  }

  // 6. Test PostgreSQL connectivity
  console.log('\n6️⃣  Testing PostgreSQL connectivity...');
  if (databaseUrl && databaseUrl.startsWith('postgresql://')) {
    const pgReachable = await testPostgreSQLConnection(databaseUrl);
    if (!pgReachable) {
      console.log('❌ PostgreSQL not reachable. Start services: docker compose up -d');
      failed++;
    } else {
      console.log('✅ PostgreSQL reachable');
      passed++;
    }
  } else {
    console.log('⏭️  Skipped (invalid DATABASE_URL)');
  }

  // 7. Test Redis connectivity
  console.log('\n7️⃣  Testing Redis connectivity...');
  if (redisUrl && !isRedisUrlPlaceholder(redisUrl)) {
    const redisReachable = await testRedisConnection(redisUrl);
    if (!redisReachable) {
      console.log('❌ Redis not reachable. Start services: docker compose up -d');
      failed++;
    } else {
      console.log('✅ Redis reachable');
      passed++;
    }
  } else {
    console.log('⏭️  Skipped (missing or placeholder REDIS_URL)');
  }

  // Final status
  console.log('\n' + '-'.repeat(70));
  console.log(`Checks Passed: ${passed}`);
  console.log(`Checks Failed: ${failed}`);
  console.log('-'.repeat(70) + '\n');

  if (failed === 0 && passed >= 5) {
    console.log('✅ S0 PREREQUISITES MET - Ready for baseline validation\n');
    console.log('Next steps:');
    console.log('  1. Start API:    npm run dev:api');
    console.log('  2. Start worker: npm run worker:dev');
    console.log('  3. Verify startup logs report FULLY_READY');
    console.log('  4. Submit test jobs and verify local artifact generation\n');
    console.log('='.repeat(70) + '\n');
    process.exit(0);
  } else {
    console.log('❌ S0 PREREQUISITES NOT MET - Fix issues above first\n');
    console.log('='.repeat(70) + '\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
