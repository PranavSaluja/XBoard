// services/shopifyApi.js
import fetch from 'node-fetch';

export class ShopifyAPI {
  constructor(shopDomain, accessToken) {
    this.shopDomain = shopDomain;
    this.accessToken = accessToken;

    // CRITICAL FIX: remove https:// prefix if it exists
    const cleanedShopDomain = shopDomain.startsWith('https://')
      ? shopDomain.substring('https://'.length)
      : shopDomain;

    this.baseURL = `https://${cleanedShopDomain}/admin/api/2023-10/`;
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Shopify API Error: ${response.statusText}`);
    }

    return response.json();
  }

  async getCustomers(limit = 250) {
    return this.makeRequest(`customers.json?limit=${limit}`);
  }

  async getOrders(limit = 250) {
    return this.makeRequest(`orders.json?limit=${limit}&status=any`);
  }

  async getProducts(limit = 250) {
    return this.makeRequest(`products.json?limit=${limit}`);
  }
}
