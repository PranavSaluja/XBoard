import { pool } from '../db.js';
import { ShopifyAPI } from './shopifyApi.js';

export class DataIngestionService {
  constructor() {}

  async ingestTenantData(tenantId, shopDomain, accessToken) {
    const shopify = new ShopifyAPI(shopDomain, accessToken);
    
    try {
      console.log(`🚀 Starting data ingestion for tenant ${tenantId}`);
      
      await this.ingestCustomers(tenantId, shopify);
      await this.ingestOrders(tenantId, shopify);
      await this.ingestProducts(tenantId, shopify);
      
      console.log(`✅ Data ingestion completed for tenant ${tenantId}`);
    } catch (error) {
      console.error(`❌ Ingestion failed for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  async ingestCustomers(tenantId, shopify) {
    try {
      const { customers } = await shopify.getCustomers();
      console.log(`📥 Ingesting ${customers.length} customers for tenant ${tenantId}`);
      
      for (const customer of customers) {
        await pool.query(`
          INSERT INTO customers (
            tenant_id, shopify_customer_id, email, first_name, last_name, 
            name, total_spent, orders_count, raw, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (tenant_id, shopify_customer_id) 
          DO UPDATE SET 
            email = EXCLUDED.email,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            name = EXCLUDED.name,
            total_spent = EXCLUDED.total_spent,
            orders_count = EXCLUDED.orders_count,
            raw = EXCLUDED.raw,
            updated_at = EXCLUDED.updated_at
        `, [
          tenantId,
          customer.id,
          customer.email || null,
          customer.first_name || null,
          customer.last_name || null,
          `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || null,
          parseFloat(customer.total_spent || '0.00'),
          parseInt(customer.orders_count || 0),
          JSON.stringify(customer),
          customer.created_at,
          new Date().toISOString()
        ]);
      }
    } catch (error) {
      console.error('❌ Customer ingestion failed:', error);
      throw error;
    }
  }

  async ingestOrders(tenantId, shopify) {
    try {
      const { orders } = await shopify.getOrders();
      console.log(`📥 Ingesting ${orders.length} orders for tenant ${tenantId}`);
      
      for (const order of orders) {
        await pool.query(`
          INSERT INTO orders (
            tenant_id, shopify_order_id, total_price, currency, 
            customer_email, customer_name, created_at, updated_at, raw
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
          order.id,
          parseFloat(order.total_price || '0.00'),
          order.currency,
          order.customer?.email || null,
          order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : null,
          new Date(order.created_at),
          new Date().toISOString(),
          JSON.stringify(order)
        ]);
      }
    } catch (error) {
      console.error('❌ Orders ingestion failed:', error);
      throw error;
    }
  }

  async ingestProducts(tenantId, shopify) {
    try {
      const { products } = await shopify.getProducts();
      console.log(`📥 Ingesting ${products.length} products for tenant ${tenantId}`);
      
      for (const product of products) {
        await pool.query(`
          INSERT INTO products (tenant_id, shopify_product_id, title, body_html, vendor, product_type, handle, raw)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (tenant_id, shopify_product_id)
          DO UPDATE SET 
            title = EXCLUDED.title, 
            body_html = EXCLUDED.body_html, 
            vendor = EXCLUDED.vendor, 
            product_type = EXCLUDED.product_type, 
            handle = EXCLUDED.handle, 
            raw = EXCLUDED.raw
        `, [
          tenantId,
          product.id,
          product.title,
          product.body_html,
          product.vendor,
          product.product_type,
          product.handle,
          JSON.stringify(product)
        ]);
      }
    } catch (error) {
      console.error('❌ Products ingestion failed:', error);
      throw error;
    }
  }
}