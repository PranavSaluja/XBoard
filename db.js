// backend/db.js
import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

const isProduction = process.env.NODE_ENV === 'production';
const useRenderSslConfig = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com');

const poolConfig = {
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/shopdb',
  
  ssl: isProduction || useRenderSslConfig
    ? {
        rejectUnauthorized: false
      } 
    : false
};

export const pool = new Pool(poolConfig);

export async function testConnection() {
  let client;
  try {
    client = await pool.connect();
    const r = await client.query('SELECT now() as now');
    return r.rows[0].now;
  } catch (error) {
    console.error("Error in testConnection:", error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}