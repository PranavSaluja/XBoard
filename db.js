// backend/db.js
import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

// CRITICAL FIX: Add SSL configuration for Render
const poolConfig = {
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/shopdb',
  // SSL configuration for Render deployment
  ssl: process.env.DATABASE_URL ? {
    rejectUnauthorized: false // Required for Render's default SSL certs
  } : false // Local development typically doesn't need SSL
};

export const pool = new Pool(poolConfig);

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