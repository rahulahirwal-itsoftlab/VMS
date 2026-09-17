import { prisma, disconnectDatabase } from './src/config/prisma.js';

async function main() {
  try {
    console.log("Testing connection...");
    await prisma.$queryRaw`SELECT 1`;
    console.log("Success!");
  } catch (e) {
    console.error("Error code:", e.code);
    console.error("Driver error:", e.meta?.driverAdapterError);
    console.error("Cause:", e.meta?.driverAdapterError?.cause);
    console.error("Full Error:", e);
  } finally {
    await disconnectDatabase();
  }
}

main();
