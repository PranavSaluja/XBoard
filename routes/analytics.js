// routes/analytics.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from './auth.js';
import { DataIngestionService } from '../services/dataIngestion.js';

const router = express.Router();

// Apply authentication to all analytics routes
router.use(authenticateToken);

// Get current user's tenant info
router.get('/me', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.email, t.shop_domain, t.status, t.installed_at
      FROM users u
      JOIN tenants t ON u.tenant_id = t.id
      WHERE u.id = $1
    `, [req.user.userId]);
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get dashboard overview (only for user's tenant)
router.get('/overview', async (req, res) => {
  const tenantId = req.user.tenantId; // Get from JWT, not URL
  
  try {
    const overview = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM customers WHERE tenant_id = $1) as total_customers,
        (SELECT COUNT(*) FROM orders WHERE tenant_id = $1) as total_orders,
        (SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE tenant_id = $1) as total_revenue,
        (SELECT currency FROM orders WHERE tenant_id = $1 LIMIT 1) as currency
    `, [tenantId]);
    
    res.json(overview.rows[0]);
  } catch (error) {
    console.error('Overview query failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get orders by date (only for user's tenant)
router.get('/orders-by-date', async (req, res) => {
  const tenantId = req.user.tenantId;
  const { startDate, endDate } = req.query;
  
  try {
    let query = `
      SELECT 
        DATE(created_at) as order_date,
        COUNT(*) as order_count,
        SUM(total_price) as daily_revenue
      FROM orders 
      WHERE tenant_id = $1
    `;
    
    const params = [tenantId];
    
    if (startDate && endDate) {
      query += ` AND created_at >= $2 AND created_at <= $3`;
      params.push(startDate, endDate);
    }
    
    query += ` GROUP BY DATE(created_at) ORDER BY order_date DESC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Orders by date query failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get top customers (only for user's tenant)
router.get('/top-customers', async (req, res) => {
  const tenantId = req.user.tenantId;
  
  try {
    const result = await pool.query(`
      SELECT 
        COALESCE(c.email, 'Guest Customer') as customer_email,
        COALESCE(c.name, 'Unknown') as customer_name,
        COUNT(o.id) as order_count,
        SUM(o.total_price) as total_spent
      FROM orders o
      LEFT JOIN customers c ON o.tenant_id = c.tenant_id 
      WHERE o.tenant_id = $1
      GROUP BY c.email, c.name
      ORDER BY total_spent DESC
      LIMIT 5
    `, [tenantId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Top customers query failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recent orders (only for user's tenant)
router.get('/recent-orders', async (req, res) => {
  const tenantId = req.user.tenantId;
  const limit = req.query.limit || 10;
  
  try {
    const result = await pool.query(`
      SELECT 
        id,
        shopify_order_id,
        total_price,
        currency,
        created_at
      FROM orders
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [tenantId, limit]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Recent orders query failed:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/sync', async (req, res) => {
    const tenantId = req.user.tenantId; // Get tenantId from the authenticated user's JWT
    
    try {
      const tenantResult = await pool.query('SELECT shop_domain, encrypted_admin_token FROM tenants WHERE id = $1', [tenantId]);
      if (tenantResult.rows.length === 0) {
        return res.status(404).json({ error: 'Tenant not found or inactive' });
      }
      
      const tenant = tenantResult.rows[0];
      
      // Instantiate ingestion service and use the tenant's stored token
      const ingestionService = new DataIngestionService();
      await ingestionService.ingestTenantData(tenantId, tenant.shop_domain, tenant.encrypted_admin_token);
      
      res.json({ success: true, message: 'Data sync initiated successfully.' });
      
    } catch (error) {
      console.error(`Sync failed for tenant ${tenantId}:`, error);
      res.status(500).json({ error: error.message || 'Data sync failed' });
    }
  });

export default router;