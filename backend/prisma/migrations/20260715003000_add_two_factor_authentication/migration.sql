ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_confirmed_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS two_factor_recovery_codes JSONB,
  ADD COLUMN IF NOT EXISTS two_factor_last_reset_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS two_factor_last_counter BIGINT,
  ADD COLUMN IF NOT EXISTS two_factor_challenge_hash TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_challenge_expires_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS two_factor_challenge_attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS users_two_factor_challenge_hash_idx ON users(two_factor_challenge_hash);
