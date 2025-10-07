# Byscript Hono Checker

A standalone Hono application for smart trade checking that can be deployed separately from the main application.

## Overview

This application contains the exact logic from the `checkRedisAndCheck3Commas` function, providing a `/cron-smart-trade-checker` endpoint that:

- Checks active trades from 3Commas API
- Synchronizes data between Redis and 3Commas
- Updates Firestore records with current trade status
- Handles pagination for large datasets

## Setup

### Prerequisites

- Bun runtime
- Redis instance
- Firebase Admin SDK credentials
- 3Commas API credentials

### Installation

1. Clone or copy this folder to your deployment environment
2. Install dependencies:
   ```bash
   bun install
   ```

### Environment Variables

Set the following environment variables:

```bash
THREE_COMMAS_API_KEY_CREATE_SMART_TRADE=your_3commas_api_key
THREE_COMMAS_RSA_PRIVATE_KEY_SMART_TRADE=your_rsa_private_key
```

### Dependencies Configuration

The application requires the following dependencies to be configured:

1. **Redis Client**: Replace the placeholder `redisClient` with your actual Redis connection
2. **Firebase Admin**: Replace the placeholder `adminDb` with your Firebase Admin configuration
3. **Signature Generation**: Replace the placeholder `generateSignatureRsa` with your actual RSA signature generation
4. **API Usage Tracking**: Replace the placeholder `trackApiUsage` with your actual usage tracking implementation

## Usage

### Development

```bash
bun run dev
```

### Production

```bash
bun run start
```

### API Endpoint

**GET** `/cron-smart-trade-checker`

This endpoint runs the smart trade checking logic and returns synchronization results.

## Deployment

This application is designed to be deployed separately from the main application. You can deploy it to:

- Vercel
- Railway
- Render
- Any Node.js hosting platform that supports Bun

## Code Quality

### ESLint

This project uses ESLint for code quality and consistency. The following scripts are available:

```bash
# Run linting
bun run lint

# Automatically fix linting issues
bun run lint:fix

# Lint only staged files (for pre-commit hooks)
bun run lint:staged
```

The ESLint configuration enforces:
- Double quotes for strings
- 2-space indentation
- Consistent spacing and formatting
- No trailing whitespace
- Proper variable declarations

## Notes

- The code contains the exact logic from the original `checkRedisAndCheck3Commas` function without modifications
- All operators, optional chainings, and business logic are preserved as-is
- Placeholder implementations are provided for external dependencies that need to be configured for your specific environment