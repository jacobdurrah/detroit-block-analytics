# Detroit Block Analytics

A comprehensive system for analyzing Detroit property data at the block level, where blocks are defined as street segments between cross streets.

## Overview

This project processes Detroit parcel data to create block-level analytics, enabling insights such as:
- Vacancy rates by block
- Recent sales activity
- Property value trends
- Tax delinquency patterns

## Features

- 🏘️ **Block Detection**: Automatically identifies street blocks using spatial analysis
- 📊 **Comprehensive Analytics**: Calculates key metrics for each block
- 🗄️ **Supabase Integration**: Stores data in a scalable PostgreSQL database
- 🔄 **Incremental Updates**: Efficiently processes only changed data
- 📈 **Historical Tracking**: Maintains analytics history for trend analysis

## Project Structure

```
detroit-block-analytics/
├── scripts/           # Data processing scripts
├── lib/              # Shared libraries and utilities
├── api/              # API endpoints
├── database/         # SQL migrations and schemas
├── docs/             # Documentation
└── tests/            # Test files
```

## Quick Start

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see `.env.example`)
4. Run database migrations: `npm run migrate`
5. Process initial data: `npm run analytics:full`

## Requirements

- Node.js 18+
- Supabase account
- Access to Detroit property data APIs
- Vercel account (for API deployment)

## API Deployment

This project includes REST API endpoints that can be deployed to Vercel:

### Deploy to Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the project directory
3. Follow the prompts to link to your Vercel account
4. Set environment variables in Vercel dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`

### API Endpoints

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for complete API documentation.

Key endpoints:
- `GET /api/blocks` - List all blocks
- `GET /api/blocks/[blockId]` - Get block details
- `GET /api/analytics/summary` - Get analytics summary
- `GET /api/search?q=query` - Search blocks and parcels

## License

MIT