import api from '../api/axios';

/**
 * Fetch overall system health status (API & Database).
 * Endpoint: GET /health (maps to /api/health)
 * @returns {Promise<{success: boolean, status: string, api: string, database: string, timestamp: string, uptimeSeconds: number, service: string, environment: string}>}
 */
export const checkHealth = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    if (error.response?.data) {
      return error.response.data;
    }
    return {
      success: false,
      status: 'offline',
      api: 'unreachable',
      database: 'unknown',
      error: error.message || 'Unable to connect to server',
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Fetch system readiness status.
 * Endpoint: GET /health/ready (maps to /api/health/ready)
 * @returns {Promise<{success: boolean, status: string, checks: {database: string, application: string}, timestamp: string}>}
 */
export const checkReadiness = async () => {
  try {
    const response = await api.get('/health/ready');
    return response.data;
  } catch (error) {
    if (error.response?.data) {
      return error.response.data;
    }
    return {
      success: false,
      status: 'not_ready',
      checks: { database: 'down', application: 'not_ready' },
      error: error.message || 'Unable to connect to server',
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * Fetch database connection status specifically.
 * Endpoint: GET /v1/health/database (maps to /api/v1/health/database)
 * @returns {Promise<{success: boolean, status: string, database: string, timestamp: string}>}
 */
export const checkDatabaseHealth = async () => {
  try {
    const response = await api.get('/v1/health/database');
    return response.data;
  } catch (error) {
    if (error.response?.data) {
      return error.response.data;
    }
    return {
      success: false,
      status: 'degraded',
      database: 'unavailable',
      error: error.message || 'Unable to connect to database',
      timestamp: new Date().toISOString(),
    };
  }
};

export default {
  checkHealth,
  checkReadiness,
  checkDatabaseHealth,
};
