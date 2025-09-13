-- init.sql

-- tenants table
CREATE TABLE IF NOT EXISTS tenants (
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
CREATE INDEX IF NOT EXISTS idx_tenants_shop_domain ON tenants (shop_domain);

-- webhook_events (archive raw payloads)
CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
  topic TEXT,
  shop_domain TEXT,
  received_at TIMESTAMPTZ DEFAULT now(),
  delivery_hash TEXT UNIQUE,
  raw_payload JSONB,
  processed BOOLEAN DEFAULT false,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant_id ON webhook_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events (received_at);

-- customers
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id),
  shopify_customer_id BIGINT,
  email TEXT,
  name TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, shopify_customer_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON customers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);

-- orders
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id),
  shopify_order_id BIGINT,
  total_price NUMERIC,
  currency TEXT,
  created_at TIMESTAMPTZ,
  raw JSONB,
  created_recorded_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, shopify_order_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_id ON orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);

-- products (needed for product ingestion)
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id),
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

CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products (tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_handle ON products (handle);

-- product_variants (optional but recommended)
CREATE TABLE IF NOT EXISTS product_variants (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id),
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

CREATE INDEX IF NOT EXISTS idx_product_variants_tenant_id ON product_variants (tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_shopify_id ON product_variants (product_shopify_id);

-- Optional: images table (if you want to store product images separately)
CREATE TABLE IF NOT EXISTS product_images (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id),
  shopify_image_id BIGINT,
  product_shopify_id BIGINT,
  src TEXT,
  alt TEXT,
  raw JSONB,
  created_recorded_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, shopify_image_id)
);

CREATE INDEX IF NOT EXISTS idx_product_images_tenant_id ON product_images (tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product_shopify_id ON product_images (product_shopify_id);

-- Helpful: a small table to track ingestion/backfill runs per tenant
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id SERIAL PRIMARY KEY,
  tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT, -- e.g. 'started', 'completed', 'failed'
  details JSONB
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_tenant_id ON ingestion_runs (tenant_id);
