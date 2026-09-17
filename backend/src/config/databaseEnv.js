const ALLOWED_SSL_MODES = new Set(['verify-full', 'require', 'prefer', 'verify-ca']);

class DatabaseConfigError extends Error {
  constructor(message, details = {}, code = 'DATABASE_URL_INVALID') {
    super(message);
    this.name = 'DatabaseConfigError';
    this.code = code;
    this.details = details;
  }
}

const sanitizeDatabaseUrl = (url) => {
  if (!url) return null;

  try {
    const parsed = new URL(String(url).trim());
    return `${parsed.protocol}//<user>:***@${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}${parsed.search}`;
  } catch {
    return '<invalid database url>';
  }
};

const validateDatabaseUrl = (url = process.env.DATABASE_URL) => {
  if (!url) {
    throw new DatabaseConfigError('DATABASE_URL is required.', {}, 'DATABASE_URL_MISSING');
  }

  const rawUrl = String(url);
  const trimmedUrl = rawUrl.trim();

  if (rawUrl !== trimmedUrl) {
    throw new DatabaseConfigError('DATABASE_URL must not contain surrounding whitespace.', {
      sanitizedUrl: sanitizeDatabaseUrl(trimmedUrl),
    });
  }

  if (/your_|placeholder|example\.com|localhost:5432\/database/i.test(trimmedUrl)) {
    throw new DatabaseConfigError('DATABASE_URL appears to be a placeholder value.', {
      sanitizedUrl: sanitizeDatabaseUrl(trimmedUrl),
    });
  }

  let parsed;
  try {
    parsed = new URL(trimmedUrl);
  } catch {
    throw new DatabaseConfigError('DATABASE_URL must be a valid URL.', {
      sanitizedUrl: '<invalid database url>',
    });
  }

  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    throw new DatabaseConfigError('DATABASE_URL must use the postgresql:// protocol.', {
      sanitizedUrl: sanitizeDatabaseUrl(trimmedUrl),
    });
  }

  if (!parsed.hostname) {
    throw new DatabaseConfigError('DATABASE_URL must include a hostname.', {
      sanitizedUrl: sanitizeDatabaseUrl(trimmedUrl),
    });
  }

  if (!parsed.pathname || parsed.pathname === '/') {
    throw new DatabaseConfigError('DATABASE_URL must include a database name.', {
      sanitizedUrl: sanitizeDatabaseUrl(trimmedUrl),
    });
  }

  if (!parsed.username || !parsed.password) {
    throw new DatabaseConfigError('DATABASE_URL must include a database role and password.', {
      sanitizedUrl: sanitizeDatabaseUrl(trimmedUrl),
    });
  }

  const sslmode = parsed.searchParams.get('sslmode');
  if (!sslmode) {
    throw new DatabaseConfigError('DATABASE_URL must include sslmode for Neon PostgreSQL.', {
      sanitizedUrl: sanitizeDatabaseUrl(trimmedUrl),
    });
  }

  if (sslmode === 'disable' || !ALLOWED_SSL_MODES.has(sslmode)) {
    throw new DatabaseConfigError('DATABASE_URL has an unsupported sslmode.', {
      sslmode,
      sanitizedUrl: sanitizeDatabaseUrl(trimmedUrl),
    }, 'DATABASE_SSL_ERROR');
  }

  return {
    protocol: parsed.protocol,
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//, ''),
    sslmode,
    pooled: parsed.hostname.includes('-pooler'),
    sanitizedUrl: sanitizeDatabaseUrl(trimmedUrl),
  };
};

export {
  DatabaseConfigError,
  sanitizeDatabaseUrl,
  validateDatabaseUrl,
};
