/**
 * Infrastructure Readiness Verification Module
 * 
 * Exports functions to check PostgreSQL and Redis connectivity
 * for use in startup sequences and validation helpers.
 * 
 * Used by:
 * - apps/api/src/startup/readiness.ts (startup classification)
 * - scripts/infra-check.mjs (CLI infrastructure check)
 * - scripts/s0-prereq.mjs (S0 prerequisite verification)
 */

import { createConnection } from 'net';

/**
 * Test TCP connection to a host:port combination
 * @param {string} host - Hostname or IP
 * @param {number} port - Port number
 * @param {number} timeoutMs - Connection timeout in milliseconds
 * @returns {Promise<boolean>} true if connection succeeds, false otherwise
 */
export async function testTcpConnection(host, port, timeoutMs = 2000) {
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

/**
 * Parse environment file
 * @param {string} content - File content
 * @returns {Object} Parsed environment variables
 */
export function parseEnv(content) {
  const env = {};
  content.split('\n').forEach((line) => {
    const [key, ...rest] = line.split('=');
    if (key && !key.startsWith('#')) {
      env[key.trim()] = rest.join('=').trim();
    }
  });
  return env;
}

/**
 * Check if Redis URL is a placeholder value
 * @param {string} url - Redis URL
 * @returns {boolean} true if placeholder detected
 */
export function isRedisUrlPlaceholder(url) {
  return /(^|[:@/])HOST([:@/]|$)|(^|[:@/])PASSWORD([:@/]|$)/i.test(url);
}

/**
 * Extract host and port from URL
 * @param {string} url - URL string (postgresql:// or redis://)
 * @returns {{host: string, port: number} | null} Extracted host and port or null if parse fails
 */
export function extractHostPort(url) {
  try {
    const u = new URL(url);
    const port = Number(u.port || (url.startsWith('postgresql') ? 5432 : 6379));
    return { host: u.hostname, port };
  } catch {
    return null;
  }
}

/**
 * Test PostgreSQL connectivity
 * @param {string} databaseUrl - Database URL
 * @returns {Promise<{success: boolean, host?: string, port?: number, error?: string}>}
 */
export async function testPostgreSQLConnection(databaseUrl) {
  if (!databaseUrl) {
    return { success: false, error: 'DATABASE_URL is missing' };
  }

  const hostPort = extractHostPort(databaseUrl);
  if (!hostPort) {
    return { success: false, error: 'Invalid DATABASE_URL format' };
  }

  const connected = await testTcpConnection(hostPort.host, hostPort.port, 3000);
  if (!connected) {
    return { success: false, error: `Cannot reach ${hostPort.host}:${hostPort.port}` };
  }

  return { success: true, host: hostPort.host, port: hostPort.port };
}

/**
 * Test Redis connectivity
 * @param {string} redisUrl - Redis URL
 * @returns {Promise<{success: boolean, host?: string, port?: number, error?: string, placeholder?: boolean}>}
 */
export async function testRedisConnection(redisUrl) {
  if (!redisUrl) {
    return { success: false, error: 'REDIS_URL is missing', placeholder: false };
  }

  if (isRedisUrlPlaceholder(redisUrl)) {
    return { success: false, error: 'REDIS_URL is a placeholder value', placeholder: true };
  }

  const hostPort = extractHostPort(redisUrl);
  if (!hostPort) {
    return { success: false, error: 'Invalid REDIS_URL format', placeholder: false };
  }

  const connected = await testTcpConnection(hostPort.host, hostPort.port, 2000);
  if (!connected) {
    return { success: false, error: `Cannot reach ${hostPort.host}:${hostPort.port}`, placeholder: false };
  }

  return { success: true, host: hostPort.host, port: hostPort.port };
}
