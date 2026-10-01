import prisma from '../../config/prisma.js';

const APPLICATION_STARTED_AT = Date.now();
const HEALTH_QUERY_TIMEOUT_MS = Number(process.env.HEALTH_QUERY_TIMEOUT_MS || 3000);

const withTimeout = (promise, timeoutMs) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('HEALTH_CHECK_TIMEOUT')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

export const checkDatabaseHealth = async () => {
  await withTimeout(prisma.$connect(), HEALTH_QUERY_TIMEOUT_MS);
  const [result] = await withTimeout(prisma.$queryRawUnsafe('SELECT 1::int AS ok'), HEALTH_QUERY_TIMEOUT_MS);
  if (result?.ok !== 1) {
    throw new Error('HEALTH_CHECK_FAILED');
  }
};

/**
 * Main Health Check Endpoint Controller
 * GET /api/health or GET /api/v1/health or GET /health
 */
export const getHealth = async (req, res) => {
  const requestId = req.headers['x-request-id'] || undefined;
  const timestamp = new Date().toISOString();
  const uptimeSeconds = Math.floor((Date.now() - APPLICATION_STARTED_AT) / 1000);

  try {
    await checkDatabaseHealth();
    return res.status(200).json({
      success: true,
      status: 'ok',
      api: 'healthy',
      database: 'connected',
      timestamp,
      uptimeSeconds,
      service: 'vms-backend',
      environment: process.env.NODE_ENV || 'development',
      ...(requestId && { requestId }),
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      status: 'degraded',
      api: 'healthy',
      database: 'disconnected',
      error: error.message || 'Database connection failed',
      timestamp,
      uptimeSeconds,
      service: 'vms-backend',
      environment: process.env.NODE_ENV || 'development',
      ...(requestId && { requestId }),
    });
  }
};

/**
 * Readiness Probe Endpoint Controller
 * GET /health/ready or GET /api/v1/health/ready
 */
export const getReadiness = async (req, res) => {
  const requestId = req.headers['x-request-id'] || undefined;
  const timestamp = new Date().toISOString();

  try {
    await checkDatabaseHealth();
    return res.status(200).json({
      success: true,
      status: 'ready',
      checks: {
        database: 'up',
        application: 'ready',
      },
      timestamp,
      ...(requestId && { requestId }),
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      status: 'not_ready',
      checks: {
        database: 'down',
        application: 'not_ready',
      },
      message: 'The service is temporarily unavailable.',
      error: error.message,
      timestamp,
      ...(requestId && { requestId }),
    });
  }
};

/**
 * Database Health Check Endpoint Controller
 * GET /api/v1/health/database
 */
export const getDatabaseHealth = async (req, res) => {
  const requestId = req.headers['x-request-id'] || undefined;
  const timestamp = new Date().toISOString();

  try {
    await checkDatabaseHealth();
    return res.status(200).json({
      success: true,
      status: 'ok',
      database: 'connected',
      timestamp,
      ...(requestId && { requestId }),
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      status: 'degraded',
      database: 'unavailable',
      message: 'The database is temporarily unavailable.',
      error: error.message,
      timestamp,
      ...(requestId && { requestId }),
    });
  }
};

export default {
  getHealth,
  getReadiness,
  getDatabaseHealth,
  checkDatabaseHealth,
};
