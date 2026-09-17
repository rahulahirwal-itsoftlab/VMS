// prisma.config.ts — Prisma v7 configuration
// The datasource.url here is used only by Prisma CLI commands (migrate, db push, db execute).
// The actual runtime connection uses the PrismaPg adapter in src/config/prisma.js.
import "dotenv/config";
import { defineConfig } from "prisma/config";

const normalizeDatabaseUrl = (url?: string) => {
  if (!url) return url;
  const parsed = new URL(url);
  const sslMode = parsed.searchParams.get("sslmode");
  if (sslMode && ["prefer", "require", "verify-ca"].includes(sslMode)) {
    parsed.searchParams.set("sslmode", "verify-full");
  }
  return parsed.toString();
};

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: normalizeDatabaseUrl(process.env.DIRECT_URL || process.env.DATABASE_URL),
  },
  migrations: {
    path: "prisma/migrations",
  },
});
