import fetch from 'node-fetch';

export class ShopifyAPI {
  constructor(shopDomain, accessToken) {
    this.shopDomain = shopDomain;
    this.accessToken = accessToken;

    const cleanedShopDomain = shopDomain.replace(/^https?:\/\//, '');
    this.apiVersion = process.env.SHOPIFY_API_VERSION || '2023-10';

    this.baseURL = `https://${cleanedShopDomain}/admin/api/${this.apiVersion}/`;

    // CRITICAL FIX: Bind methods to the instance
    this.makeRequest = this.makeRequest.bind(this);
    this.getWebhooks = this.getWebhooks.bind(this);
    this.deleteWebhook = this.deleteWebhook.bind(this);
    this.createWebhooks = this.createWebhooks.bind(this);
    this.getCustomers = this.getCustomers.bind(this);
    this.getOrders = this.getOrders.bind(this);
    this.getProducts = this.getProducts.bind(this);
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    console.log(`🌐 Making request to: ${url}`);
    console.log(`   Method: ${options.method || 'GET'}`); 
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const responseText = await response.text(); 
    console.log(`📡 Response status: ${response.status}, body: ${responseText.substring(0, 200)}...`); 

    if (!response.ok) {
      let errorData = {};
      try {
        errorData = JSON.parse(responseText); 
      } catch (e) {
        errorData = { message: 'Non-JSON error response or empty body', raw: responseText };
      }
      console.error(
        `❌ Shopify API Request FAILED to ${url}: ${response.status} ${response.statusText}`,
        'Full Response Data:', JSON.stringify(errorData, null, 2) 
      );
      throw new Error(
        `Shopify API Error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`
      );
    }
    return responseText ? JSON.parse(responseText) : {}; 
  }

  async getWebhooks() {
    return this.makeRequest('webhooks.json');
  }

  async deleteWebhook(webhookId) {
    console.log(`🌐 Deleting webhook ID: ${webhookId}`); 
    return this.makeRequest(`webhooks/${webhookId}.json`, {
      method: 'DELETE'
    });
  }

  async createWebhooks() {
    const webhookEndpoint = `${process.env.BACKEND_URL}/api/webhooks`;
    console.log(`🔗 Creating webhooks with base URL: ${webhookEndpoint}`);

    const webhooksToManage = [
      {
        webhook: {
          topic: 'orders/create',
          address: `${webhookEndpoint}/orders/create`,
          format: 'json'
        }
      },
      {
        webhook: {
          topic: 'customers/create', 
          address: `${webhookEndpoint}/customers/create`,
          format: 'json'
        }
      },
      {
        webhook: {
          topic: 'orders/updated', 
          address: `${webhookEndpoint}/orders/update`,
          format: 'json'
        }
      },
      {
        webhook: {
          topic: 'customers/update', 
          address: `${webhookEndpoint}/customers/update`,
          format: 'json'
        }
      }
    ];

    // First, test if we can reach Shopify API
    try {
      const testResponse = await this.makeRequest('webhooks.json');
      console.log('✅ Successfully connected to Shopify API');
      console.log(`📋 Found ${testResponse.webhooks?.length || 0} existing webhooks`);
    } catch (error) {
      console.error('❌ Failed to connect to Shopify API:', error.message);
      throw new Error(`Cannot connect to Shopify API: ${error.message}`);
    }

    const expectedWebhookAddresses = webhooksToManage.map(w => w.webhook.address);

    try {
      const existing = await this.getWebhooks();
      console.log(`📋 Found ${existing.webhooks?.length || 0} existing webhooks`);
      
      for (const webhook of existing.webhooks || []) {
        if (webhook.address && expectedWebhookAddresses.includes(webhook.address)) {
          console.log(`🗑️ Deleting existing webhook: ${webhook.topic} -> ${webhook.address}`);
          await this.deleteWebhook(webhook.id);
        } else {
          console.log(`⏩ Skipping deletion of unmatched webhook: ${webhook.topic} -> ${webhook.address}`);
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not list existing webhooks:', error.message);
    }

    const results = [];
    const errors = [];
    
    for (const webhookData of webhooksToManage) {
      try {
        console.log(`🔨 Creating webhook: ${webhookData.webhook.topic} -> ${webhookData.webhook.address}`);
        
        const response = await this.makeRequest('webhooks.json', {
          method: 'POST',
          body: JSON.stringify(webhookData),
        });

        if (response.webhook) {
          results.push(response.webhook);
          console.log(`✅ Successfully created webhook: ${webhookData.webhook.topic} -> ID: ${response.webhook.id}`);
        } else {
          console.error(`❌ Unexpected response for ${webhookData.webhook.topic}:`, response);
          errors.push(`Unexpected response for ${webhookData.webhook.topic}`);
        }
      } catch (error) {
        console.error(`❌ Failed to create webhook ${webhookData.webhook.topic}:`, error.message);
        errors.push(`${webhookData.webhook.topic}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Webhook creation errors: ${errors.join(', ')}`);
    }

    return results;
  }

  async getCustomers(limit = 250) {
    console.log('🌐 Making request to get customers...');
    const data = await this.makeRequest(`customers.json?limit=${limit}`);
    return data;
  }

  async getOrders(limit = 250) {
    console.log('🌐 Making request to get orders...');
    const data = await this.makeRequest(`orders.json?limit=${limit}&status=any`);
    return data;
  }

  async getProducts(limit = 250) {
    console.log('🌐 Making request to get products...');
    const data = await this.makeRequest(`products.json?limit=${limit}`);
    return data;
  }
}