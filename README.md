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

## License

MIT