// backend/db.js
import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/shopdb',
});

// Optional: simple helper to test connection
export async function testConnection() {
  const client = await pool.connect();
  try {
    const r = await client.query('SELECT now() as now');
    return r.rows[0].now;
  } finally {
    client.release();
  }
}
