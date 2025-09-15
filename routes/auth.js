import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { DataIngestionService } from '../services/dataIngestion.js';
import { ShopifyAPI } from '../services/shopifyApi.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Middleware to verify JWT
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    console.log('❌ Auth: No token provided');
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('❌ Auth: Invalid or expired token', err.message);
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Register new tenant (Shopify store owner signs up)
router.post('/register', async (req, res) => {
  const { email, password, shopDomain, accessToken, scopes } = req.body;
  
  try {
    if (!email || !password || !shopDomain || !accessToken) {
        return res.status(400).json({ error: 'Missing required registration fields' });
    }

    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    const tenantResult = await pool.query(`
      INSERT INTO tenants (shop_domain, encrypted_admin_token, scopes, status, installed_at)
      VALUES ($1, $2, $3, 'active', NOW())
      RETURNING id
    `, [shopDomain, accessToken, scopes]);
    
    const tenantId = tenantResult.rows[0].id;
    
    const userResult = await pool.query(`
      INSERT INTO users (email, password_hash, tenant_id)
      VALUES ($1, $2, $3)
      RETURNING id, email, tenant_id
    `, [email, passwordHash, tenantId]);
    
    const user = userResult.rows[0];

    // Attempt to create webhooks on the Shopify store (non-blocking for registration)
    try {
      const shopifyApi = new ShopifyAPI(shopDomain, accessToken);
      const createdWebhooks = await shopifyApi.createWebhooks();
      console.log(`✅ Webhooks creation attempted for shop ${shopDomain}. Count: ${createdWebhooks.length}`);

      // Store webhook registration info in tenant table
      await pool.query(
        'UPDATE tenants SET webhook_registration = $1 WHERE id = $2',
        [JSON.stringify(createdWebhooks), tenantId]
      );
    } catch (webhookErr) {
      console.error(`⚠️ Webhook creation failed for ${shopDomain} (continuing registration):`, webhookErr.message || webhookErr);
      
      // Store the error info for debugging
      await pool.query(
        'UPDATE tenants SET webhook_registration = $1 WHERE id = $2',
        [JSON.stringify({ error: webhookErr.message, timestamp: new Date().toISOString() }), tenantId]
      );
    }

    // Start initial data ingestion (background task)
    const ingestionService = new DataIngestionService();
    ingestionService.ingestTenantData(tenantId, shopDomain, accessToken)
      .then(() => console.log(`Background ingestion started for tenant ${tenantId}`))
      .catch(err => console.error(`❌ Background ingestion failed for tenant ${tenantId}:`, err));
    
    const token = jwt.sign(
      { userId: user.id, email: user.email, tenantId: user.tenant_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        tenantId: user.tenant_id
      }
    });
    
  } catch (error) {
    console.error('❌ Registration failed:', error);
    if (error.constraint === 'tenants_shop_domain_key') {
        return res.status(400).json({ error: 'Shop domain already registered.' });
    }
    res.status(500).json({ error: 'Registration failed due to a server error.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const userResult = await pool.query(`
      SELECT u.id, u.email, u.password_hash, u.tenant_id, t.shop_domain 
      FROM users u 
      JOIN tenants t ON u.tenant_id = t.id 
      WHERE u.email = $1
    `, [email]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = userResult.rows[0];
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { userId: user.id, email: user.email, tenantId: user.tenant_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        tenantId: user.tenant_id,
        shopDomain: user.shop_domain
      }
    });
    
  } catch (error) {
    console.error('❌ Login failed:', error);
    res.status(500).json({ error: 'Login failed due to a server error.' });
  }
});

// Endpoint to manually set up webhooks for an authenticated tenant
router.post('/setup-webhooks', authenticateToken, async (req, res) => {
  try {
    console.log('🔗 Initiating manual webhook setup for user:', req.user.userId);
    
    const tenantResult = await pool.query(`
      SELECT t.shop_domain, t.encrypted_admin_token 
      FROM tenants t 
      WHERE t.id = $1
    `, [req.user.tenantId]);
    
    if (tenantResult.rows.length === 0) {
      console.log('❌ Tenant not found for authenticated user:', req.user.tenantId);
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const tenant = tenantResult.rows[0];
    console.log('🏪 Found tenant for webhook setup:', tenant.shop_domain);
    
    const shopifyApi = new ShopifyAPI(tenant.shop_domain, tenant.encrypted_admin_token);
    
    console.log(`🔗 Creating webhooks on Shopify for ${tenant.shop_domain}...`);
    const createdWebhooks = await shopifyApi.createWebhooks();
    
    // Store webhook registration info in tenant table
    await pool.query(
      'UPDATE tenants SET webhook_registration = $1 WHERE id = $2',
      [JSON.stringify(createdWebhooks), req.user.tenantId]
    );

    res.json({ 
      success: true, 
      message: `Successfully created ${createdWebhooks.length} webhooks`,
      webhooks: createdWebhooks.map(w => ({ 
        id: w.id, 
        topic: w.topic, 
        address: w.address 
      }))
    });
  } catch (error) {
    console.error('❌ Manual webhook setup failed:', error);
    
    // Store error info for debugging
    await pool.query(
      'UPDATE tenants SET webhook_registration = $1 WHERE id = $2',
      [JSON.stringify({ error: error.message, timestamp: new Date().toISOString() }), req.user.tenantId]
    ).catch(dbErr => console.error('Failed to store webhook error:', dbErr));
    
    res.status(500).json({ 
      error: 'Webhook setup failed', 
      details: error.message || 'Unknown error during webhook setup'
    });
  }
});

// Get webhook status and current webhooks from Shopify
router.get('/webhook-status', authenticateToken, async (req, res) => {
  try {
    const tenantResult = await pool.query(`
      SELECT t.shop_domain, t.encrypted_admin_token, t.webhook_registration
      FROM tenants t 
      WHERE t.id = $1
    `, [req.user.tenantId]);
    
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const tenant = tenantResult.rows[0];
    
    let currentWebhooks = [];
    let shopifyApiError = null;
    
    try {
      const shopifyApi = new ShopifyAPI(tenant.shop_domain, tenant.encrypted_admin_token);
      const webhookResponse = await shopifyApi.getWebhooks();
      currentWebhooks = webhookResponse.webhooks || [];
    } catch (error) {
      console.error('❌ Failed to fetch current webhooks from Shopify:', error);
      shopifyApiError = error.message;
    }
    
    // Get recent webhook events from our database
    const recentEvents = await pool.query(`
      SELECT event_type, shopify_id, processed_at 
      FROM webhook_events 
      WHERE tenant_id = $1 
      ORDER BY processed_at DESC 
      LIMIT 10
    `, [req.user.tenantId]);

    res.json({
      shopDomain: tenant.shop_domain,
      currentWebhooks: currentWebhooks,
      storedWebhookConfig: tenant.webhook_registration,
      recentEvents: recentEvents.rows,
      backendUrl: process.env.BACKEND_URL,
      shopifyApiError: shopifyApiError
    });
  } catch (error) {
    console.error('❌ Webhook status check failed:', error);
    res.status(500).json({ 
      error: 'Failed to check webhook status', 
      details: error.message 
    });
  }
});

export default router;