const TRANSIENT_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1017', 'P2024', 'P2028']);
const TRANSIENT_DATABASE_CODES = new Set(['08000', '08003', '08006', '53300', '57P01', '57P02', '57P03']);

const TRANSIENT_MESSAGE_PATTERNS = [
  /connection terminated/i,
  /connection timeout/i,
  /query read timeout/i,
  /timeout exceeded/i,
  /econnreset/i,
  /etimedout/i,
  /remaining connection slots/i,
  /too many connections/i,
  /server closed the connection/i,
  /terminating connection/i,
  /can't reach database server/i,
  /transaction (already closed|api error|expired|timed out)/i,
];

const TRANSIENT_DATABASE_CATEGORIES = new Set([
  'DATABASE_DNS_FAILURE',
  'DATABASE_HOST_UNREACHABLE',
  'DATABASE_CONNECTION_REFUSED',
  'DATABASE_CONNECTION_TIMEOUT',
]);

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const isTransientDatabaseError = (error) => {
  return TRANSIENT_DATABASE_CATEGORIES.has(classifyDatabaseError(error));
};

const classifyDatabaseError = (error) => {
  const code = error?.code || error?.cause?.code;
  const message = `${error?.message || ''} ${error?.cause?.message || ''}`;
  const lowerMessage = message.toLowerCase();

  if (code === 'DATABASE_URL_MISSING') {
    return 'DATABASE_URL_MISSING';
  }

  if (code === 'DATABASE_SSL_ERROR') {
    return 'DATABASE_SSL_ERROR';
  }

  if (code === 'DATABASE_ENV_INVALID' || code === 'DATABASE_URL_INVALID' || error?.name === 'DatabaseConfigError') {
    return 'DATABASE_URL_INVALID';
  }

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'DATABASE_DNS_FAILURE';
  }

  if (code === 'ECONNREFUSED') {
    return 'DATABASE_CONNECTION_REFUSED';
  }

  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'EACCES') {
    return 'DATABASE_HOST_UNREACHABLE';
  }

  if (code === 'ETIMEDOUT' || /query read timeout/i.test(message) || /connection (terminated due to connection timeout|timeout|timed out)/i.test(message)) {
    return 'DATABASE_CONNECTION_TIMEOUT';
  }

  if (TRANSIENT_DATABASE_CODES.has(code)) {
    return 'DATABASE_CONNECTION_TIMEOUT';
  }

  if (code === '28P01' || code === 'P1000' || lowerMessage.includes('password authentication failed') || lowerMessage.includes('authentication failed')) {
    return 'DATABASE_AUTH_FAILED';
  }

  if (lowerMessage.includes('certificate') || lowerMessage.includes('ssl') || lowerMessage.includes('tls')) {
    return 'DATABASE_SSL_ERROR';
  }

  if (code === 'P2022' || code === '42703' || lowerMessage.includes('column') && lowerMessage.includes('does not exist')) {
    return 'DATABASE_SCHEMA_MISMATCH';
  }

  if (code === '3D000' || lowerMessage.includes('database') && lowerMessage.includes('does not exist')) {
    return 'DATABASE_NOT_FOUND';
  }

  if (code === 'P2010' && lowerMessage.includes("can't reach database server")) {
    return 'DATABASE_HOST_UNREACHABLE';
  }

  if (code === 'P1001' || code === 'P1002' || code === 'P1017') {
    return 'DATABASE_CONNECTION_TIMEOUT';
  }

  if (TRANSIENT_PRISMA_CODES.has(code) || TRANSIENT_DATABASE_CODES.has(code) || TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return 'DATABASE_CONNECTION_TIMEOUT';
  }

  return 'DATABASE_UNKNOWN_ERROR';
};

const toSafeErrorLog = (error) => ({
  name: error?.name,
  code: error?.code || error?.cause?.code,
  message: error?.message,
  category: classifyDatabaseError(error),
});

const withDatabaseRetry = async (operationName, operation, options = {}) => {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 2000;

  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < attempts && isTransientDatabaseError(error);

      if (!shouldRetry) {
        throw error;
      }

      const delayMs = Math.min(baseDelayMs * (2 ** (attempt - 1)), maxDelayMs);
      console.warn(`[DATABASE] Transient connection failure during ${operationName}; retrying connection - attempt ${attempt}/${attempts} (delay: ${delayMs}ms)`, {
        error: toSafeErrorLog(error),
      });
      await sleep(delayMs);
    }
  }

  throw lastError;
};

export {
  classifyDatabaseError,
  isTransientDatabaseError,
  toSafeErrorLog,
  withDatabaseRetry,
};
