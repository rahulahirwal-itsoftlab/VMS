import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const sequences = [
  "CREATE SEQUENCE IF NOT EXISTS employee_id_seq START WITH 1 INCREMENT BY 1;",
  "CREATE SEQUENCE IF NOT EXISTS vendor_code_seq START WITH 1 INCREMENT BY 1;",
  "CREATE SEQUENCE IF NOT EXISTS po_number_seq START WITH 1 INCREMENT BY 1;",
  "CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1 INCREMENT BY 1;",
  "CREATE SEQUENCE IF NOT EXISTS grn_number_seq START WITH 1 INCREMENT BY 1;",
  "CREATE SEQUENCE IF NOT EXISTS dc_number_seq START WITH 1 INCREMENT BY 1;",
  "CREATE SEQUENCE IF NOT EXISTS payment_number_seq START WITH 1 INCREMENT BY 1;",
];

async function init() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is missing in .env");
    process.exit(1);
  }

  console.log("Connecting to PostgreSQL to ensure sequence objects exist...");
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    for (const sql of sequences) {
      await client.query(sql);
    }
    console.log("PostgreSQL sequences created successfully.");
  } catch (err) {
    console.error("Failed creating sequences:", err.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

init();
