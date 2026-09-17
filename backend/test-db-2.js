import dns from 'dns';
// Force Node to use IPv4 instead of IPv6. Node 17+ defaults to IPv6, which hangs on Neon if local IPv6 is broken.
dns.setDefaultResultOrder('ipv4first');

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;

async function testConnection() {
  console.log('Testing direct Database connection...');
  console.log('Using connection string from env (masked):', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@'));
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
    ssl: { rejectUnauthorized: false }
  });
  
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  
  try {
    console.log('Executing SELECT 1...');
    const [result] = await prisma.$queryRaw`SELECT 1::int AS ok`;
    console.log('Result:', result);
    if (result && result.ok === 1) {
      console.log('Database connection successful via IPv4!');
    }
  } catch (error) {
    console.error('Database connection failed:', error.message);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

testConnection();
