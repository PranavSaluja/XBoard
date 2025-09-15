# data-ingestion-backend

This repository contains the backend service for XBoard, a multi-tenant Shopify data ingestion and analytics platform. Built with Node.js and Express.js, The application acts as a bridge between Shopify stores and a customizable analytics dashboard. It allows multiple Shopify store owners (tenants) to connect their stores, ingesting their customer, order, and product data. It provides real-time updates and historical insights through a personalized dashboard, while maintaining strict data isolation between tenants.

## Core Features

*   **Multi-Tenant Architecture:** Designed to support multiple Shopify stores with strict data isolation per tenant.
*   **Shopify API Integration:** Connects to the Shopify Admin API to retrieve customers, orders, and products.
*   **PostgreSQL Database:** Utilizes PostgreSQL for robust data storage. The database schema includes `tenants`, `users`, `customers`, `orders`, and `webhook_events` tables.
*   **Authentication & Authorization:** Implements email/password authentication with `bcryptjs` for secure password hashing and JWT (JSON Web Tokens) for API authorization.
*   **Tenant Onboarding:** Facilitates user registration where a new user connects their Shopify store (providing domain and Admin API access token), creating a new tenant and initiating data ingestion.
*   **Data Synchronization:** Provides an authenticated API endpoint to trigger manual data synchronization from Shopify for the logged-in user's store.
*   **Analytics Endpoints:** Exposes secure API endpoints to retrieve aggregated and detailed analytics data for an authenticated user's specific Shopify store.

  ## Application Flow 
<img width="1122" height="452" alt="Screenshot 2025-09-15 at 10 56 37 PM" src="https://github.com/user-attachments/assets/cf50f23a-325b-43f2-bb03-708e0d10ded5" />
<img width="1528" height="505" alt="Screenshot 2025-09-15 at 10 56 59 PM" src="https://github.com/user-attachments/assets/3d2fcec2-f13e-4681-b325-58f348bd0810" />

## High Level Design 
<img width="1057" height="659" alt="Screenshot 2025-09-15 at 11 28 52 PM" src="https://github.com/user-attachments/assets/58209ef6-598d-497e-ac7d-003db07a6ecd" />



## Setup Instructions

### Prerequisites
*   Node.js (v18+) & npm
*   Docker (for PostgreSQL)
*   A Shopify Development Store (or multiple for testing multi-tenancy)
    *   Ensure your Shopify Custom App has `read_customers`, `read_orders`, and `read_products` permissions.

### 1. Database Setup (PostgreSQL with Docker)
1.  **Start PostgreSQL container:**
    ```bash
    docker run --name shop-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres
    ```
2.  **Create database and tables:**
    ```bash
    docker exec -it shop-postgres createdb -U postgres shopdb
    docker cp migrations/init.sql shop-postgres:/init.sql
    docker exec -it shop-postgres psql -U postgres -d shopdb -f /init.sql
    ```

### 2. Backend Service
1.  **Clone this repository:**
    ```bash
    git clone https://github.com/pranavsaluja/data-ingestion-backend.git
    cd data-ingestion-backend
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Create a `.env` file** in the root directory and add the following:
    ```
    DATABASE_URL=postgres://postgres:postgres@localhost:5432/shopdb
    JWT_SECRET=your-super-secret-jwt-key-here-make-it-long-and-random
    ```
    *Replace `your-super-secret-jwt-key-here-make-it-long-and-random` with a strong, random secret key for JWT signing.*
4.  **Start the backend server:**
    ```bash
    npm run dev
    ```
    The server will be running on `http://localhost:3001`.

## API Endpoints

### Authentication (`/api/auth`)
*   `POST /api/auth/register`: Register a new user and connect their Shopify store.
*   `POST /api/auth/login`: Authenticate an existing user.

### Protected Analytics (`/api` - Requires `Authorization: Bearer <JWT>`)
*   `GET /api/me`: Get authenticated user and their tenant's basic info.
*   `POST /api/sync`: Trigger a data synchronization for the authenticated user's store.
*   `GET /api/overview`: Fetch aggregated metrics (customers, orders, revenue).
*   `GET /api/orders-by-date`: Retrieve order counts and revenue by date.
*   `GET /api/top-customers`: List top 5 customers by spend.
*   `GET /api/recent-orders`: Get the 5 most recent orders.

### Other
*   `GET /health`: Basic health check.
*   `GET /dbtest`: Test database connection.
*   `POST /webhooks`: Endpoint for receiving Shopify webhooks (currently returns 200 OK).

## Documentation
*   **Assumptions:**
    *   Shopify Admin API access token will have necessary read scopes (`read_customers`, `read_orders`, `read_products`).
    *   Shopify store domain provided during registration is accurate.
*   **High-level Architecture:** A clear separation of concerns between frontend (UI), backend (API, ingestion, authentication), and database (persistent storage). The backend acts as an intermediary, processing requests and orchestrating data flow.
*   **APIs and Data Models:** Detailed above.
*   **Next Steps to Productionize:** (Refer to project documentation or other specific requirements for this section.)
