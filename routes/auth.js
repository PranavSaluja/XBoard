// routes/auth.js
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { DataIngestionService } from '../services/dataIngestion.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Register new tenant (Shopify store owner signs up)
router.post('/register', async (req, res) => {
  const { email, password, shopDomain, accessToken, scopes } = req.body;
  
  try {
    // Check if user already exists
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create tenant first
    const tenantResult = await pool.query(`
      INSERT INTO tenants (shop_domain, encrypted_admin_token, scopes)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [shopDomain, accessToken, scopes]);
    
    const tenantId = tenantResult.rows[0].id;
    
    // Create user
    const userResult = await pool.query(`
      INSERT INTO users (email, password_hash, tenant_id)
      VALUES ($1, $2, $3)
      RETURNING id, email, tenant_id
    `, [email, passwordHash, tenantId]);
    
    const user = userResult.rows[0];
    
    // Start data ingestion
    const ingestionService = new DataIngestionService();
    ingestionService.ingestTenantData(tenantId, shopDomain, accessToken)
      .catch(err => console.error('Background ingestion failed:', err));
    
    // Generate JWT
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
        tenantId: user.tenant_id
      }
    });
    
  } catch (error) {
    console.error('Registration failed:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Find user
    const userResult = await pool.query(`
      SELECT u.*, t.shop_domain 
      FROM users u 
      JOIN tenants t ON u.tenant_id = t.id 
      WHERE u.email = $1
    `, [email]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = userResult.rows[0];
    
    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT
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
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Middleware to verify JWT
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

export default router;