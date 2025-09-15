import express from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';

const router = express.Router();

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Webhook endpoint is working!', 
    timestamp: new Date().toISOString(),
    backend_url: process.env.BACKEND_URL
  });
});

// Webhook verification middleware
const verifyWebhook = (req, res, next) => {
  console.log('🔍 Verifying webhook...');
  
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const shopDomain = req.get('X-Shopify-Shop-Domain');
  
  console.log('Shop Domain:', shopDomain);
  console.log('HMAC received:', hmac ? 'Yes' : 'No');

  // For testing, temporarily skip verification if no secret is set or in dev mode
  if (!process.env.SHOPIFY_WEBHOOK_SECRET || process.env.NODE_ENV === 'development') {
    console.log('⚠️ Webhook verification skipped (development mode or no secret)');
    return next();
  }

  if (!hmac) {
    console.log('❌ No HMAC header found');
    return res.status(401).send('No HMAC header');
  }

  // For webhook verification, we need the raw body
  const body = req.rawBody; // Use the rawBody captured by express.raw()
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('base64');

  console.log('Hash match:', hash === hmac ? '✅' : '❌');

  if (hash !== hmac) {
    console.log('❌ Webhook verification failed');
    return res.status(401).send('Unauthorized');
  }
  
  console.log('✅ Webhook verified successfully');
  next();
};

// Middleware to capture raw body and parse JSON
const captureRawBody = (req, res, next) => {
  req.rawBody = req.body; // Store raw body for HMAC verification
  try {
    // If body is a Buffer (from express.raw), convert to string then parse
    if (Buffer.isBuffer(req.body)) {
      req.body = JSON.parse(req.body.toString());
    } else if (typeof req.body === 'string') {
      req.body = JSON.parse(req.body);
    }
    // If already an object, leave as is (e.g., if another middleware parsed it)
  } catch (e) {
    console.error('❌ Failed to parse webhook body:', e);
    return res.status(400).send('Invalid JSON');
  }
  next();
};

// Debug endpoint for testing webhook delivery
router.post('/debug', captureRawBody, (req, res) => {
  console.log('🔍 DEBUG WEBHOOK RECEIVED:');
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('Raw Body:', req.rawBody?.toString());
  res.status(200).json({ received: true, timestamp: new Date().toISOString() });
});

// Order created webhook
router.post('/orders/create', captureRawBody, verifyWebhook, async (req, res) => {
  try {
    const order = req.body;
    const shopDomain = req.get('X-Shopify-Shop-Domain');
    
    console.log('📦 Processing order webhook for shop:', shopDomain, 'Order ID:', order.id);

    const tenantResult = await pool.query(
      'SELECT id FROM tenants WHERE shop_domain = $1',
      [shopDomain]
    );
    
    if (tenantResult.rows.length === 0) {
      console.log('❌ Tenant not found for domain:', shopDomain);
      return res.status(404).send('Tenant not found');
    }
    
    const tenantId = tenantResult.rows[0].id;
    
    await pool.query(`
      INSERT INTO orders (
        tenant_id, shopify_order_id, total_price, currency, 
        customer_email, customer_name, created_at, updated_at, raw
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (tenant_id, shopify_order_id) 
      DO UPDATE SET 
        total_price = EXCLUDED.total_price,
        currency = EXCLUDED.currency,
        customer_email = EXCLUDED.customer_email,
        customer_name = EXCLUDED.customer_name,
        updated_at = EXCLUDED.updated_at,
        raw = EXCLUDED.raw
    `, [
      tenantId,
      order.id.toString(),
      parseFloat(order.total_price || '0.00'),
      order.currency,
      order.customer?.email || null,
      order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : null,
      order.created_at,
      new Date().toISOString(),
      JSON.stringify(order)
    ]);

    // Log webhook event
    await pool.query(`
      INSERT INTO webhook_events (tenant_id, event_type, shopify_id, shop_domain, processed_at, raw_payload)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [tenantId, 'orders/create', order.id.toString(), shopDomain, new Date(), JSON.stringify(order)]);

    console.log(`✅ Processed order webhook for tenant ${tenantId}: ${order.id}`);
    res.status(200).json({ success: true, orderId: order.id });
  } catch (error) {
    console.error('❌ Order webhook processing failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Order updated webhook
router.post('/orders/update', captureRawBody, verifyWebhook, async (req, res) => {
  try {
    const order = req.body;
    const shopDomain = req.get('X-Shopify-Shop-Domain');
    
    console.log('📦 Processing order update webhook for shop:', shopDomain, 'Order ID:', order.id);

    const tenantResult = await pool.query(
      'SELECT id FROM tenants WHERE shop_domain = $1',
      [shopDomain]
    );
    
    if (tenantResult.rows.length === 0) {
      console.log('❌ Tenant not found for domain:', shopDomain);
      return res.status(404).send('Tenant not found');
    }
    
    const tenantId = tenantResult.rows[0].id;
    
    // Update existing order
    const result = await pool.query(`
      UPDATE orders SET 
        total_price = $3,
        currency = $4,
        customer_email = $5,
        customer_name = $6,
        updated_at = $7,
        raw = $8
      WHERE tenant_id = $1 AND shopify_order_id = $2
      RETURNING id
    `, [
      tenantId,
      order.id.toString(),
      parseFloat(order.total_price || '0.00'),
      order.currency,
      order.customer?.email || null,
      order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : null,
      new Date().toISOString(),
      JSON.stringify(order)
    ]);

    // If no rows were updated, insert as new
    if (result.rowCount === 0) {
      await pool.query(`
        INSERT INTO orders (
          tenant_id, shopify_order_id, total_price, currency, 
          customer_email, customer_name, created_at, updated_at, raw
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        tenantId,
        order.id.toString(),
        parseFloat(order.total_price || '0.00'),
        order.currency,
        order.customer?.email || null,
        order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : null,
        order.created_at,
        new Date().toISOString(),
        JSON.stringify(order)
      ]);
    }

    // Log webhook event
    await pool.query(`
      INSERT INTO webhook_events (tenant_id, event_type, shopify_id, shop_domain, processed_at, raw_payload)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [tenantId, 'orders/updated', order.id.toString(), shopDomain, new Date(), JSON.stringify(order)]);

    console.log(`✅ Processed order update webhook for tenant ${tenantId}: ${order.id}`);
    res.status(200).json({ success: true, orderId: order.id });
  } catch (error) {
    console.error('❌ Order update webhook processing failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Customer created webhook
router.post('/customers/create', captureRawBody, verifyWebhook, async (req, res) => {
  try {
    const customer = req.body;
    const shopDomain = req.get('X-Shopify-Shop-Domain');
    
    console.log('👤 Processing customer webhook for shop:', shopDomain, 'Customer ID:', customer.id);

    const tenantResult = await pool.query(
      'SELECT id FROM tenants WHERE shop_domain = $1',
      [shopDomain]
    );
    
    if (tenantResult.rows.length === 0) {
      console.log('❌ Tenant not found for domain:', shopDomain);
      return res.status(404).send('Tenant not found');
    }
    
    const tenantId = tenantResult.rows[0].id;
    
    await pool.query(`
      INSERT INTO customers (
        tenant_id, shopify_customer_id, email, first_name, 
        last_name, name, total_spent, orders_count, created_at, updated_at, raw
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (tenant_id, shopify_customer_id)
      DO UPDATE SET
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        name = EXCLUDED.name,
        total_spent = EXCLUDED.total_spent,
        orders_count = EXCLUDED.orders_count,
        updated_at = EXCLUDED.updated_at,
        raw = EXCLUDED.raw
    `, [
      tenantId,
      customer.id.toString(),
      customer.email || null,
      customer.first_name || null,
      customer.last_name || null,
      `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || null,
      parseFloat(customer.total_spent || '0.00'),
      parseInt(customer.orders_count || 0),
      customer.created_at,
      new Date().toISOString(),
      JSON.stringify(customer)
    ]);

    await pool.query(`
      INSERT INTO webhook_events (tenant_id, event_type, shopify_id, shop_domain, processed_at, raw_payload)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [tenantId, 'customers/create', customer.id.toString(), shopDomain, new Date(), JSON.stringify(customer)]);

    console.log(`✅ Processed customer webhook for tenant ${tenantId}: ${customer.id}`);
    res.status(200).json({ success: true, customerId: customer.id });
  } catch (error) {
    console.error('❌ Customer webhook processing failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Customer updated webhook
router.post('/customers/update', captureRawBody, verifyWebhook, async (req, res) => {
  try {
    const customer = req.body;
    const shopDomain = req.get('X-Shopify-Shop-Domain');
    
    console.log('👤 Processing customer update webhook for shop:', shopDomain, 'Customer ID:', customer.id);

    const tenantResult = await pool.query(
      'SELECT id FROM tenants WHERE shop_domain = $1',
      [shopDomain]
    );
    
    if (tenantResult.rows.length === 0) {
      console.log('❌ Tenant not found for domain:', shopDomain);
      return res.status(404).send('Tenant not found');
    }
    
    const tenantId = tenantResult.rows[0].id;
    
    await pool.query(`
      INSERT INTO customers (
        tenant_id, shopify_customer_id, email, first_name, 
        last_name, name, total_spent, orders_count, created_at, updated_at, raw
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (tenant_id, shopify_customer_id)
      DO UPDATE SET
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        name = EXCLUDED.name,
        total_spent = EXCLUDED.total_spent,
        orders_count = EXCLUDED.orders_count,
        updated_at = EXCLUDED.updated_at,
        raw = EXCLUDED.raw
    `, [
      tenantId,
      customer.id.toString(),
      customer.email || null,
      customer.first_name || null,
      customer.last_name || null,
      `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || null,
      parseFloat(customer.total_spent || '0.00'),
      parseInt(customer.orders_count || 0),
      customer.created_at,
      new Date().toISOString(),
      JSON.stringify(customer)
    ]);

    await pool.query(`
      INSERT INTO webhook_events (tenant_id, event_type, shopify_id, shop_domain, processed_at, raw_payload)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [tenantId, 'customers/update', customer.id.toString(), shopDomain, new Date(), JSON.stringify(customer)]);

    console.log(`✅ Processed customer update webhook for tenant ${tenantId}: ${customer.id}`);
    res.status(200).json({ success: true, customerId: customer.id });
  } catch (error) {
    console.error('❌ Customer update webhook processing failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;