// server.js
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
dotenv.config();

import analyticsRoutes from './routes/analytics.js';
import authRoutes from './routes/auth.js';
import webhookRoutes from './routes/webhooks.js';
import { pool, testConnection } from './db.js';

const app = express();
const PORT = process.env.PORT || 3001;

console.log('DEBUG: process.env.BACKEND_URL:', process.env.BACKEND_URL);

// CORS
app.use(cors({
  origin: '*', 
  credentials: true
}));

// Raw body parser for webhooks FIRST (before other parsers)
app.use('/api/webhooks', express.raw({ 
  type: 'application/json',
  limit: '1mb'
}));

// Webhook routes (no auth, raw body)
app.use('/api/webhooks', webhookRoutes);

// Regular JSON parser for other routes
app.use(express.json());

// Protected routes
app.use('/api/auth', authRoutes);
app.use('/api', analyticsRoutes);

// Health checks
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/dbtest', async (req, res) => {
  try {
    const now = await testConnection();
    res.json({ ok: true, dbTime: now });
  } catch (err) {
    console.error('DB test failed', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  const webhookTestUrl = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/webhooks/test`;
  console.log(`📡 Webhook endpoint: ${webhookTestUrl}`);
});