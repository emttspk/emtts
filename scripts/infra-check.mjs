#!/usr/bin/env node

/**
 * Infrastructure Readiness Verification Helper
 * 
 * Verifies PostgreSQL and Redis connectivity, checks environment configuration,
 * and reports readiness status for local development.
 * 
 * Usage:
 *   node scripts/infra-check.mjs [--fix-redis]
 * 
 * Exit codes:
 *   0 = FULLY_READY
 *   1 = DEGRADED_NO_DB
 *   2 = DEGRADED_NO_REDIS
 *   3 = DEGRADED_NO_DB_OR_REDIS
 *   4 = Docker/infrastructure not available
 */

import { createConnection } from 'net';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const cwd = process.cwd();
const envPath = resolve(cwd, 'apps/api/.env');
const envExamplePath = resolve(cwd, 'apps/api/.env.example');

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

function updateEnv(filePath, updates) {
  let content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
  const lines = content.split('\n');
  const updated = new Map();

  // Update existing lines
  for (let i = 0; i < lines.length; i++) {
    const [key] = lines[i].split('=');
    const trimmedKey = key?.trim();
    if (trimmedKey && updates.hasOwnProperty(trimmedKey)) {
      lines[i] = `${trimmedKey}=${updates[trimmedKey]}`;
      updated.set(trimmedKey, true);
    }
  }

  // Add missing lines
  for (const [key, value] of Object.entries(updates)) {
    if (!updated.has(key)) {
      lines.push(`${key}=${value}`);
    }
  }

  writeFileSync(filePath, lines.join('\n'), 'utf-8');
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
      return { success: false, error: 'Invalid DATABASE_URL format' };
    }
    const [, user, password, host, port] = match;
    const connected = await testTcpConnection(host, Number(port), 3000);
    if (!connected) {
      return { success: false, error: `Cannot reach ${host}:${port}` };
    }
    return { success: true, host, port: Number(port) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function isRedisUrlPlaceholder(url) {
  return /(^|[:@/])HOST([:@/]|$)|(^|[:@/])PASSWORD([:@/]|$)/i.test(url);
}

async function testRedisConnection(url) {
  if (!url || isRedisUrlPlaceholder(url)) {
    return { success: false, error: 'REDIS_URL is missing or placeholder', placeholder: true };
  }

  try {
    // Handle both redis://host:port and redis://user:pass@host:port formats
    const match = url.match(/^redis:\/\/(?:[^@]+@)?([^:]+):(\d+)$/);
    if (!match) {
      return { success: false, error: 'Invalid REDIS_URL format' };
    }
    const [, host, port] = match;
    const connected = await testTcpConnection(host, Number(port), 2000);
    if (!connected) {
      return { success: false, error: `Cannot reach ${host}:${port}` };
    }
    return { success: true, host, port: Number(port) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function checkDockerAvailable() {
  try {
    execSync('docker ps', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function checkDockerComposeAvailable() {
  try {
    execSync('docker compose version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ========== MAIN LOGIC ==========

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('INFRASTRUCTURE READINESS CHECK');
  console.log('='.repeat(70) + '\n');

  const fixRedis = process.argv.includes('--fix-redis');

  // 1. Check environment file
  console.log('📋 Checking environment configuration...');
  if (!existsSync(envPath)) {
    console.log(`⚠️  .env not found at ${envPath}`);
    console.log(`✓ Creating .env from .env.example...`);
    if (existsSync(envExamplePath)) {
      const example = readFileSync(envExamplePath, 'utf-8');
      writeFileSync(envPath, example, 'utf-8');
      console.log(`✓ .env created`);
    } else {
      console.error('❌ .env.example not found either');
      process.exit(4);
    }
  }

  const env = parseEnv(envPath);
  const databaseUrl = env.DATABASE_URL || 'postgresql://labelgen:labelgen@localhost:5432/labelgen?schema=public';
  const redisUrl = env.REDIS_URL || 'redis://default:PASSWORD@HOST:PORT';

  // 2. Test PostgreSQL
  console.log('\n🐘 Testing PostgreSQL connectivity...');
  const pgResult = await testPostgreSQLConnection(databaseUrl);
  if (pgResult.success) {
    console.log(`✅ PostgreSQL reachable at ${pgResult.host}:${pgResult.port}`);
  } else {
    console.log(`❌ PostgreSQL error: ${pgResult.error}`);
  }

  // 3. Test Redis
  console.log('\n🔴 Testing Redis connectivity...');
  if (isRedisUrlPlaceholder(redisUrl)) {
    console.log(`❌ REDIS_URL is a placeholder: ${redisUrl}`);
    if (fixRedis) {
      console.log('🔧 Fixing REDIS_URL to default local Redis...');
      updateEnv(envPath, { REDIS_URL: 'redis://localhost:6379' });
      console.log('✓ REDIS_URL updated to redis://localhost:6379');
      const newRedisUrl = 'redis://localhost:6379';
      const redisConnResult = await testRedisConnection(newRedisUrl);
      if (redisConnResult.success) {
        console.log(`✅ Redis reachable at ${redisConnResult.host}:${redisConnResult.port}`);
      } else {
        console.log(`❌ Redis error: ${redisConnResult.error}`);
      }
    }
  } else {
    const redisConnResult = await testRedisConnection(redisUrl);
    if (redisConnResult.success) {
      console.log(`✅ Redis reachable at ${redisConnResult.host}:${redisConnResult.port}`);
    } else {
      console.log(`❌ Redis error: ${redisConnResult.error}`);
    }
  }

  // 4. Check Docker availability
  console.log('\n🐳 Checking Docker availability...');
  const hasDocker = checkDockerAvailable();
  const hasDockerCompose = checkDockerComposeAvailable();
  if (hasDocker && hasDockerCompose) {
    console.log('✅ Docker and docker compose available');
  } else {
    console.log('⚠️  Docker/docker compose not available (will need manual service startup)');
  }

  // 5. Determine readiness state
  console.log('\n📊 Determining readiness state...');
  const newEnv = parseEnv(envPath);
  const newRedisUrl = fixRedis ? 'redis://localhost:6379' : newEnv.REDIS_URL;
  const redisResult = await testRedisConnection(newRedisUrl);

  let state;
  let exitCode;

  if (pgResult.success && redisResult.success) {
    state = 'FULLY_READY';
    exitCode = 0;
  } else if (!pgResult.success && !redisResult.success) {
    state = 'DEGRADED_NO_DB_OR_REDIS';
    exitCode = 3;
  } else if (!pgResult.success) {
    state = 'DEGRADED_NO_DB';
    exitCode = 1;
  } else {
    state = 'DEGRADED_NO_REDIS';
    exitCode = 2;
  }

  console.log(`\n🎯 Readiness State: ${state === 'FULLY_READY' ? '✅' : '❌'} ${state}`);

  // 6. Bootstrap guidance
  if (state !== 'FULLY_READY') {
    console.log('\n📚 Bootstrap Guidance:');
    console.log('\n1. Start Infrastructure:');
    if (hasDocker && hasDockerCompose) {
      console.log('   docker compose up -d');
      console.log('\n   Then wait 5-10 seconds for services to initialize.');
    } else {
      console.log('   • PostgreSQL: Start on localhost:5432');
      console.log('   • Redis: Start on localhost:6379');
      console.log('   • Or install Docker: https://www.docker.com/products/docker-desktop');
    }

    if (!pgResult.success) {
      console.log('\n2. Verify PostgreSQL:');
      console.log('   • Ensure DATABASE_URL=postgresql://labelgen:labelgen@localhost:5432/labelgen');
      console.log('   • Run: Test-NetConnection -ComputerName localhost -Port 5432 (Windows)');
      console.log('   • Run: nc -zv localhost 5432 (Mac/Linux)');
    }

    if (!redisResult.success) {
      console.log('\n3. Fix REDIS_URL:');
      console.log(`   • Current: ${newRedisUrl}`);
      if (isRedisUrlPlaceholder(newRedisUrl)) {
        console.log('   • Replace placeholder with: redis://localhost:6379');
        console.log('   • Run: node scripts/infra-check.mjs --fix-redis');
      }
    }

    if (!pgResult.success) {
      console.log('\n4. Initialize Database:');
      console.log('   npm run prisma:generate --workspace=@labelgen/api');
      console.log('   npm run prisma:migrate --workspace=@labelgen/api');
    }
  } else {
    console.log('\n✅ All prerequisites met! Ready for S0 validation.');
    console.log('\nNext steps:');
    console.log('  npm run dev:api                 # Start API');
    console.log('  npm run worker:dev              # Start worker (new terminal)');
    console.log('  npm run s0:prereq               # Verify FULLY_READY state');
  }

  console.log('\n' + '='.repeat(70) + '\n');

  process.exit(exitCode);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(4);
});
