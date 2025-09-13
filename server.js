// backend/server.js
import express from 'express';
import dotenv from 'dotenv';
import analyticsRoutes from './routes/analytics.js';
import authRoutes from './routes/auth.js';
import cors from 'cors';
dotenv.config();

import { pool, testConnection } from './db.js'; // <-- ENSURE THIS IS './db.js'
import bodyParser from 'body-parser';

const app = express();
app.use(cors({
  origin: '*', 
  credentials: true
}));
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Routes
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

// Webhooks (no auth needed)
app.post('/webhooks', bodyParser.raw({ type: 'application/json' }), (req, res) => {
  res.status(200).send('ok');
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});