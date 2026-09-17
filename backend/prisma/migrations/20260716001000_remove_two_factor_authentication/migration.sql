DROP INDEX IF EXISTS "users_two_factor_challenge_hash_idx";

ALTER TABLE "users"
DROP COLUMN IF EXISTS "two_factor_enabled",
DROP COLUMN IF EXISTS "two_factor_secret_encrypted",
DROP COLUMN IF EXISTS "two_factor_confirmed_at",
DROP COLUMN IF EXISTS "two_factor_recovery_codes",
DROP COLUMN IF EXISTS "two_factor_last_reset_at",
DROP COLUMN IF EXISTS "two_factor_last_counter",
DROP COLUMN IF EXISTS "two_factor_challenge_hash",
DROP COLUMN IF EXISTS "two_factor_challenge_expires_at",
DROP COLUMN IF EXISTS "two_factor_challenge_attempts";
