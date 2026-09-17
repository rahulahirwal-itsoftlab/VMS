ALTER TABLE users
  ALTER COLUMN password DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS activation_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS activation_token_expires_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS activation_token_used_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS activation_sent_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS activation_last_sent_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS activation_resend_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false;

UPDATE users
SET
  activated_at = COALESCE(activated_at, created_at),
  password_set_at = COALESCE(password_set_at, created_at)
WHERE password IS NOT NULL
  AND activated_at IS NULL
  AND password_set_at IS NULL;

CREATE INDEX IF NOT EXISTS users_activation_token_hash_idx ON users(activation_token_hash);
CREATE INDEX IF NOT EXISTS users_locked_until_idx ON users(locked_until);
