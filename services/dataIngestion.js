// services/dataIngestion.js
import { pool } from '../db.js';
import { ShopifyAPI } from './shopifyApi.js';

export class DataIngestionService {
  constructor() {}

  async ingestTenantData(tenantId, shopDomain, accessToken) {
    const shopify = new ShopifyAPI(shopDomain, accessToken);
    
    try {
      // Ingest customers
      await this.ingestCustomers(tenantId, shopify);
      
      // Ingest orders
      await this.ingestOrders(tenantId, shopify);
      
      // Ingest products (you'll need to add products table)
      await this.ingestProducts(tenantId, shopify);
      
      console.log(`✅ Data ingestion completed for tenant ${tenantId}`);
    } catch (error) {
      console.error(`❌ Ingestion failed for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  async ingestCustomers(tenantId, shopify) {
    const { customers } = await shopify.getCustomers();
    
    for (const customer of customers) {
      await pool.query(`
        INSERT INTO customers (tenant_id, shopify_customer_id, email, name, raw)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, shopify_customer_id) 
        DO UPDATE SET email = $3, name = $4, raw = $5
      `, [
        tenantId,
        customer.id,
        customer.email,
        `${customer.first_name} ${customer.last_name}`.trim(),
        JSON.stringify(customer)
      ]);
    }
  }

  async ingestOrders(tenantId, shopify) {
    const { orders } = await shopify.getOrders();
    
    for (const order of orders) {
      await pool.query(`
        INSERT INTO orders (tenant_id, shopify_order_id, total_price, currency, created_at, raw)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tenant_id, shopify_order_id)
        DO UPDATE SET total_price = $3, currency = $4, created_at = $5, raw = $6
      `, [
        tenantId,
        order.id,
        parseFloat(order.total_price),
        order.currency,
        new Date(order.created_at),
        JSON.stringify(order)
      ]);
    }
  }

  async ingestProducts(tenantId, shopify) {
    // You'll need to add products table to init.sql first
    const { products } = await shopify.getProducts();
    console.log(`Found ${products.length} products for tenant ${tenantId}`);
    // Implementation depends on your products table schema
  }
}