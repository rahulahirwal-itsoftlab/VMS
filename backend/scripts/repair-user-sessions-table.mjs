import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { sanitizeDatabaseUrl, validateDatabaseUrl } from '../src/config/databaseEnv.js';

const { Pool } = pg;

const normalizeDatabaseUrl = (url) => {
  validateDatabaseUrl(url);
  const parsed = new URL(url);
  const sslMode = parsed.searchParams.get('sslmode');

  if (sslMode && ['prefer', 'require', 'verify-ca'].includes(sslMode)) {
    parsed.searchParams.set('sslmode', 'verify-full');
  }

  return parsed.toString();
};

const migrationFile = new URL(
  '../prisma/migrations/20260804001000_create_user_sessions/migration.sql',
  import.meta.url,
);

const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL);
const parsedUrl = new URL(connectionString);

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 20000,
  idleTimeoutMillis: 10000,
  ...(parsedUrl.hostname.endsWith('.neon.tech') ? { ssl: { rejectUnauthorized: false } } : {}),
});

try {
  console.log('[repair-user-sessions] Connecting to', sanitizeDatabaseUrl(connectionString));
  const sql = await readFile(migrationFile, 'utf8');
  await pool.query(sql);

  const { rows } = await pool.query(`
    SELECT
      to_regclass('public.user_sessions') AS table_name,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_sessions'
          AND column_name = 'token_hash'
      ) AS has_token_hash
  `);

  if (rows[0]?.table_name !== 'user_sessions' || !rows[0]?.has_token_hash) {
    throw new Error('user_sessions table verification failed.');
  }

  console.log('[repair-user-sessions] user_sessions table is ready.');
} finally {
  await pool.end();
}
