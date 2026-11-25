import 'dotenv/config';
import prisma from '../src/config/prisma.js';

const DEFAULT_ORG_ID = 'e0a1b2c3-d4e5-4f6a-8b9c-0d1e2f3a4b5c';
const DEFAULT_ORG_NAME = process.env.COMPANY_NAME || 'ACRE India Pvt Ltd';
const DEFAULT_ORG_CODE = 'ACRE_INDIA';

async function migrate() {
  console.log('[MIGRATION] Starting Organization & Multi-Tenancy DB Migration...');

  // 1. Ensure `orgs` table exists
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "orgs" (
      "id" VARCHAR(36) PRIMARY KEY,
      "name" VARCHAR(255) NOT NULL,
      "code" VARCHAR(100) UNIQUE,
      "description" TEXT,
      "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "deleted_at" TIMESTAMP WITH TIME ZONE
    );
  `);
  console.log('[MIGRATION] Table "orgs" verified.');

  // Create view "Org" for case-insensitive / PascalCase compatibility
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'Org') THEN
        CREATE OR REPLACE VIEW "Org" AS SELECT * FROM "orgs";
      END IF;
    END $$;
  `);

  // 2. Ensure default primary organization exists
  await prisma.$executeRawUnsafe(`
    INSERT INTO "orgs" ("id", "name", "code", "description", "is_active", "created_at", "updated_at")
    VALUES ($1, $2, $3, 'Default primary organization for VMS', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO UPDATE 
    SET "name" = EXCLUDED."name", "code" = EXCLUDED."code", "updated_at" = CURRENT_TIMESTAMP;
  `, DEFAULT_ORG_ID, DEFAULT_ORG_NAME, DEFAULT_ORG_CODE);
  console.log(`[MIGRATION] Primary organization ensured: ${DEFAULT_ORG_NAME} (${DEFAULT_ORG_ID})`);

  // 3. Get all public base tables (except migrations and orgs)
  const tables = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('_prisma_migrations', 'orgs')
    ORDER BY table_name;
  `;

  console.log(`[MIGRATION] Adding "org_id" foreign key to ${tables.length} tables...`);

  for (const { table_name } of tables) {
    try {
      // Add column org_id if not exists
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "${table_name}" 
        ADD COLUMN IF NOT EXISTS "org_id" VARCHAR(36);
      `);

      // Update existing records to link to default organization
      const updateResult = await prisma.$executeRawUnsafe(`
        UPDATE "${table_name}" 
        SET "org_id" = $1 
        WHERE "org_id" IS NULL;
      `, DEFAULT_ORG_ID);

      // Check if foreign key constraint exists
      const fkCheck = await prisma.$queryRawUnsafe(`
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_schema = 'public' 
          AND table_name = $1 
          AND constraint_name = $2;
      `, table_name, `fk_${table_name}_org`);

      if (fkCheck.length === 0) {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "${table_name}" 
          ADD CONSTRAINT "fk_${table_name}_org" 
          FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;
        `);
      }

      // Add index on org_id
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "idx_${table_name}_org_id" 
        ON "${table_name}"("org_id");
      `);

      console.log(`[MIGRATION] ✔ Table "${table_name}" updated with org_id FK and backfilled.`);
    } catch (err) {
      console.error(`[MIGRATION] ✖ Error on table "${table_name}":`, err.message);
      throw err;
    }
  }

  console.log('[MIGRATION] All tables successfully mapped to organizations!');
  await prisma.$disconnect();
}

migrate().catch((err) => {
  console.error('[MIGRATION] Fatal migration error:', err);
  process.exit(1);
});
