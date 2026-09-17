import 'dotenv/config';
import pg from 'pg';
import prismaPkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DatabaseConfigError,
  sanitizeDatabaseUrl,
  validateDatabaseUrl,
} from './databaseEnv.js';

const { PrismaClient } = prismaPkg;
const { Pool } = pg;

/**
 * PrismaClient Singleton (Prisma v7 pattern)
 * Database connection is configured via adapter, not datasource url in schema.
 */
const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const NODE_ENV = process.env.NODE_ENV || 'development';
const DEFAULT_POOL_MAX = NODE_ENV === 'production' ? 5 : 3;

const normalizeDatabaseUrl = (url) => {
  validateDatabaseUrl(url);
  const parsed = new URL(url);
  const sslMode = parsed.searchParams.get('sslmode');

  if (sslMode && ['prefer', 'require', 'verify-ca'].includes(sslMode)) {
    parsed.searchParams.set('sslmode', 'verify-full');
  }

  return parsed.toString();
};

const buildPoolConfig = () => {
  const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL);
  let isNeonHost = false;
  let isPooler = false;
  try {
    const parsed = new URL(connectionString);
    isNeonHost = parsed.hostname.endsWith('.neon.tech');
    isPooler = parsed.hostname.includes('-pooler') || parsed.port === '6543';
  } catch {}

  // For serverless/pooled PostgreSQL (e.g. Neon, PgBouncer), idle connections
  // should time out client-side before the remote proxy forcefully terminates the TCP socket.
  // Neon's PgBouncer drops idle sockets after ~20-30 seconds.
  // A client-side idle timeout of 15s ensures the node-postgres pool cleanly closes idle sockets.
  const defaultIdleTimeout = isNeonHost || isPooler ? 15000 : 30000;

  return {
    connectionString,
    max: parsePositiveInt(process.env.DB_POOL_MAX, DEFAULT_POOL_MAX),
    idleTimeoutMillis: parsePositiveInt(process.env.DB_IDLE_TIMEOUT_MS, defaultIdleTimeout),
    connectionTimeoutMillis: parsePositiveInt(process.env.DB_CONNECTION_TIMEOUT_MS, 15000),
    query_timeout: parsePositiveInt(process.env.DB_QUERY_TIMEOUT_MS, 30000),
    statement_timeout: parsePositiveInt(process.env.DB_STATEMENT_TIMEOUT_MS, 30000),
    keepAlive: process.env.DB_KEEP_ALIVE !== 'false',
    keepAliveInitialDelayMillis: parsePositiveInt(process.env.DB_KEEP_ALIVE_DELAY_MS, 5000),
    allowExitOnIdle: true,
    ...(isNeonHost ? { ssl: { rejectUnauthorized: false } } : {}),
  };
};

const getDatabaseUrlInfo = () => {
  try {
    const parsed = new URL(normalizeDatabaseUrl(process.env.DATABASE_URL));
    return {
      configured: true,
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.replace(/^\//, '') || null,
      schema: parsed.searchParams.get('schema') || 'public',
      sslmode: parsed.searchParams.get('sslmode') || 'not-set',
      pooled: parsed.hostname.includes('-pooler'),
      sanitizedUrl: sanitizeDatabaseUrl(parsed.toString()),
    };
  } catch (error) {
    return {
      configured: false,
      host: null,
      port: null,
      database: null,
      schema: null,
      sslmode: null,
      pooled: false,
      errorCode: error?.code || 'DATABASE_ENV_INVALID',
    };
  }
};

const poolConfig = buildPoolConfig();

const globalForPrisma = globalThis;

const pool = globalForPrisma.__vmsPgPool ?? new Pool(poolConfig);

if (!pool.__vmsEventsAttached) {
  pool.on('error', (error) => {
    // Normal serverless/proxy lifecycle: remote proxies (such as Neon PgBouncer or AWS RDS Proxy)
    // periodically close idle TCP connections without an active query running. node-postgres
    // automatically removes the closed client from the pool and creates a fresh one on demand.
    const isNormalIdleClose =
      error?.message?.includes('Connection terminated unexpectedly') ||
      error?.code === 'ECONNRESET' ||
      error?.code === 'EPIPE' ||
      error?.code === '57P01';

    if (isNormalIdleClose) {
      if (process.env.DEBUG_DB_POOL === 'true') {
        console.debug('[DATABASE] Idle PostgreSQL connection closed by remote host (auto-reconnected on next query)');
      }
      return;
    }

    console.error('[DATABASE] PostgreSQL pool error:', {
      name: error?.name,
      code: error?.code,
      message: error?.message,
    });
  });

  pool.on('remove', () => {
    if (process.env.DEBUG_DB_POOL === 'true') {
      console.debug('[DATABASE] PostgreSQL client removed from pool (idle timeout or connection reset)');
    }
  });

  pool.__vmsEventsAttached = true;
}

const adapter = globalForPrisma.__vmsAdapter ?? new PrismaPg(pool);

const prisma = globalForPrisma.__vmsPrisma ?? new PrismaClient({
  adapter,
  log: NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

globalForPrisma.__vmsPgPool = pool;
globalForPrisma.__vmsAdapter = adapter;
globalForPrisma.__vmsPrisma = prisma;

const dbConfig = {
  environment: NODE_ENV,
  pool: {
    max: poolConfig.max,
    idleTimeoutMillis: poolConfig.idleTimeoutMillis,
    connectionTimeoutMillis: poolConfig.connectionTimeoutMillis,
    queryTimeoutMillis: poolConfig.query_timeout,
    statementTimeoutMillis: poolConfig.statement_timeout,
    keepAlive: poolConfig.keepAlive,
  },
};

const getSafeDatabaseInfo = () => ({
  ...getDatabaseUrlInfo(),
  ...dbConfig,
});

const testDatabaseConnection = async () => {
  const [result] = await prisma.$queryRaw`SELECT 1::int AS ok`;
  return result?.ok === 1;
};

const disconnectDatabase = async () => {
  await prisma.$disconnect();
  if (!pool.ended) {
    await pool.end();
  }
};

export {
  dbConfig,
  DatabaseConfigError,
  disconnectDatabase,
  getSafeDatabaseInfo,
  normalizeDatabaseUrl,
  pool,
  prisma,
  sanitizeDatabaseUrl,
  testDatabaseConnection,
  validateDatabaseUrl,
};


export default prisma;
