// routes/analytics.js
import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// Get dashboard overview for a tenant
router.get('/tenants/:tenantId/overview', async (req, res) => {
  const { tenantId } = req.params;
  
  try {
    // Total customers, orders, and revenue
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

// Get orders by date with optional date range filtering
router.get('/tenants/:tenantId/orders-by-date', async (req, res) => {
  const { tenantId } = req.params;
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

// Get top 5 customers by spend
router.get('/tenants/:tenantId/top-customers', async (req, res) => {
  const { tenantId } = req.params;
  
  try {
    // This requires linking customers to orders via shopify_customer_id
    // First, let's see if we have customer info in orders
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

// Get recent orders
router.get('/tenants/:tenantId/recent-orders', async (req, res) => {
  const { tenantId } = req.params;
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

export default router;