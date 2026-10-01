import { useState, useEffect, useCallback } from 'react';
import { checkHealth } from '../services/healthService.js';

/**
 * Custom React Hook for monitoring backend & database health status.
 * @param {number} [pollIntervalMs=0] - Optional polling interval in ms (0 to disable auto-polling)
 * @returns {{ health: object|null, loading: boolean, error: string|null, refetch: Function }}
 */
export const useHealthCheck = (pollIntervalMs = 0) => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const data = await checkHealth();
      setHealth(data);
      setError(null);
    } catch (err) {
      setError(err?.message || 'Failed to check system health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    if (pollIntervalMs > 0) {
      const interval = setInterval(fetchHealth, pollIntervalMs);
      return () => clearInterval(interval);
    }
  }, [fetchHealth, pollIntervalMs]);

  return { health, loading, error, refetch: fetchHealth };
};

export default useHealthCheck;
