-- init.sql

-- Drop existing tables to ensure clean schema
DROP TABLE IF EXISTS ingestion_runs CASCADE;
DROP TABLE IF EXISTS product_images CASCADE;
DROP TABLE IF EXISTS product_variants CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS webhook_events CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- tenants table
CREATE TABLE tenants (
  id SERIAL PRIMARY KEY,
  shop_domain TEXT UNIQUE NOT NULL,
  encrypted_admin_token TEXT NOT NULL,
  scopes TEXT,
  installed_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'active',
  webhook_registration JSONB,
  last_backfill_at TIMESTAMPTZ
);

-- index to look up tenant by domain quickly
CREATE INDEX idx_tenants_shop_domain ON tenants (shop_domain);

-- users table (moved up to be referenced by other tables)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- webhook_events (archive raw payloads)
CREATE TABLE webhook_events (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, 
  shopify_id VARCHAR(255), 
  shop_domain TEXT,
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ DEFAULT now(),
  delivery_hash TEXT UNIQUE,
  raw_payload JSONB,
  processed BOOLEAN DEFAULT false,
  error TEXT
);

CREATE INDEX idx_webhook_events_tenant_id ON webhook_events (tenant_id);
CREATE INDEX idx_webhook_events_received_at ON webhook_events (received_at);
CREATE INDEX idx_webhook_events_processed_at ON webhook_events (processed_at);

-- customers table with all required columns
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_customer_id BIGINT,
  email TEXT,
  first_name TEXT,  
  last_name TEXT,
  name TEXT, -- Keep for backward compatibility
  total_spent NUMERIC DEFAULT 0.00, 
  orders_count INTEGER DEFAULT 0,   
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(), 
  UNIQUE (tenant_id, shopify_customer_id)
);

CREATE INDEX idx_customers_tenant_id ON customers (tenant_id);
CREATE INDEX idx_customers_email ON customers (email);

-- orders table with all required columns
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_order_id BIGINT,
  total_price NUMERIC,
  currency TEXT,
  customer_email TEXT,
  customer_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  raw JSONB,
  created_recorded_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, shopify_order_id)
);

CREATE INDEX idx_orders_tenant_id ON orders (tenant_id);
CREATE INDEX idx_orders_created_at ON orders (created_at);

-- products table
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_product_id BIGINT,
  title TEXT,
  body_html TEXT,
  vendor TEXT,
  product_type TEXT,
  handle TEXT,
  raw JSONB,
  created_recorded_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, shopify_product_id)
);

CREATE INDEX idx_products_tenant_id ON products (tenant_id);
CREATE INDEX idx_products_handle ON products (handle);

-- product_variants table
CREATE TABLE product_variants (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_variant_id BIGINT,
  product_shopify_id BIGINT,
  title TEXT,
  sku TEXT,
  price NUMERIC,
  inventory_quantity INT,
  raw JSONB,
  created_recorded_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, shopify_variant_id)
);

CREATE INDEX idx_product_variants_tenant_id ON product_variants (tenant_id);
CREATE INDEX idx_product_variants_product_shopify_id ON product_variants (product_shopify_id);

-- product_images table
CREATE TABLE product_images (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_image_id BIGINT,
  product_shopify_id BIGINT,
  src TEXT,
  alt TEXT,
  raw JSONB,
  created_recorded_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, shopify_image_id)
);

CREATE INDEX idx_product_images_tenant_id ON product_images (tenant_id);
CREATE INDEX idx_product_images_product_shopify_id ON product_images (product_shopify_id);

-- ingestion_runs table
CREATE TABLE ingestion_runs (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT, -- e.g. 'started', 'completed', 'failed'
  details JSONB
);

CREATE INDEX idx_ingestion_runs_tenant_id ON ingestion_runs (tenant_id);