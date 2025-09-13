// backend/server.js
import express from 'express';
import dotenv from 'dotenv';
import analyticsRoutes from './routes/analytics.js';
import cors from 'cors';
dotenv.config();

import { pool, testConnection } from './db.js';
import bodyParser from 'body-parser';
import { DataIngestionService } from './services/dataIngestion.js';

const app = express(); // Define app FIRST
app.use(cors({
  origin: '*', // Your XBoard frontend URL
  credentials: true
}));
const PORT = process.env.PORT || 3001;



// Add middleware AFTER app is defined
app.use(express.json());

// simple health
app.get('/health', (req, res) => res.json({ ok: true }));

// quick DB test endpoint
app.get('/dbtest', async (req, res) => {
  try {
    const now = await testConnection();
    res.json({ ok: true, dbTime: now });
  } catch (err) {
    console.error('DB test failed', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Tenant onboarding endpoint
app.post('/api/tenants', async (req, res) => {
  const { shopDomain, accessToken, scopes } = req.body;
  
  try {
    // Insert tenant
    const result = await pool.query(`
      INSERT INTO tenants (shop_domain, encrypted_admin_token, scopes)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [shopDomain, accessToken, scopes]);
    
    const tenantId = result.rows[0].id;
    
    // Start initial data ingestion
    const ingestionService = new DataIngestionService();
    await ingestionService.ingestTenantData(tenantId, shopDomain, accessToken);
    
    res.json({ success: true, tenantId });
  } catch (error) {
    console.error('Tenant onboarding failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manual sync trigger
app.post('/api/tenants/:tenantId/sync', async (req, res) => {
  const { tenantId } = req.params;
  
  try {
    // Get tenant info
    const tenantResult = await pool.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const tenant = tenantResult.rows[0];
    const ingestionService = new DataIngestionService();
    await ingestionService.ingestTenantData(tenantId, tenant.shop_domain, tenant.encrypted_admin_token);
    
    res.json({ success: true, message: 'Sync completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// placeholder webhook route (returns 200)
app.post('/webhooks', bodyParser.raw({ type: 'application/json' }), (req, res) => {
  res.status(200).send('ok');
});
app.use('/api', analyticsRoutes);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});