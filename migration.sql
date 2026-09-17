-- Migration to add missing columns to the "users" table based on UserEntity definition
ALTER TABLE "users" 
ADD COLUMN IF NOT EXISTS "first_name" TEXT,
ADD COLUMN IF NOT EXISTS "last_name" TEXT,
ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "refresh_token" TEXT,
ADD COLUMN IF NOT EXISTS "password_reset_token" TEXT,
ADD COLUMN IF NOT EXISTS "password_reset_expires" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "password_reset_otp" TEXT,
ADD COLUMN IF NOT EXISTS "password_reset_otp_expires" TIMESTAMP(3);