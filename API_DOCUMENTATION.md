# Detroit Block Analytics API Documentation

Base URL: `https://your-project.vercel.app/api`

## Authentication

Currently, the API is public and does not require authentication. In production, you should add API key authentication.

## Endpoints

### Health Check

#### GET /api/health
Check the health status of the API and database connection.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-14T12:00:00Z",
  "database": {
    "connected": true,
    "blockCount": 1234
  },
  "lastAnalyticsRun": {
    "id": "uuid",
    "type": "full",
    "status": "completed",
    "startedAt": "2024-01-14T10:00:00Z",
    "completedAt": "2024-01-14T11:30:00Z"
  }
}
```

### Blocks

#### GET /api/blocks
Get all blocks with optional filtering.

**Query Parameters:**
- `street` (string): Filter by street name (partial match)
- `limit` (integer): Number of results (default: 100)
- `offset` (integer): Pagination offset

**Response:**
```json
{
  "blocks": [
    {
      "id": "uuid",
      "block_id": "woodward_warren_canfield",
      "street_name": "Woodward",
      "from_cross_street": "Warren",
      "to_cross_street": "Canfield",
      "created_at": "2024-01-14T10:00:00Z"
    }
  ],
  "total": 150,
  "limit": 100,
  "offset": 0
}
```

#### GET /api/blocks/[blockId]
Get details for a specific block including analytics.

**Response:**
```json
{
  "block": {
    "id": "uuid",
    "block_id": "woodward_warren_canfield",
    "street_name": "Woodward",
    "from_cross_street": "Warren",
    "to_cross_street": "Canfield",
    "analytics": {
      "total_parcels": 25,
      "vacant_parcels": 5,
      "vacancy_rate": 20.0,
      "avg_assessed_value": 50000,
      "recent_sales_count": 3,
      "tax_delinquent_percentage": 12.0
    },
    "parcel_count": 25
  }
}
```

#### GET /api/blocks/[blockId]/parcels
Get all parcels within a specific block.

**Query Parameters:**
- `limit` (integer): Number of results (default: 100)
- `offset` (integer): Pagination offset

**Response:**
```json
{
  "block_id": "woodward_warren_canfield",
  "parcels": [
    {
      "parcel_id": "01234567",
      "address": "1234 Woodward Ave",
      "taxpayer_1": "John Doe",
      "amt_assessed_value": 45000,
      "property_class": "101",
      "geometry": { "type": "Polygon", "coordinates": [...] }
    }
  ],
  "total": 25,
  "limit": 100,
  "offset": 0
}
```

### Analytics

#### GET /api/analytics/summary
Get analytics summary with filtering options.

**Query Parameters:**
- `street` (string): Filter by street name
- `minVacancy` (number): Minimum vacancy rate
- `maxVacancy` (number): Maximum vacancy rate
- `minSales` (integer): Minimum recent sales count
- `sort` (string): Sort field (vacancy_rate, recent_sales_count, avg_assessed_value)
- `order` (string): Sort order (asc, desc)
- `limit` (integer): Number of results (default: 50)

**Response:**
```json
{
  "summary": {
    "totalBlocks": 50,
    "totalParcels": 1250,
    "totalVacant": 300,
    "avgVacancyRate": 24.0,
    "totalRecentSales": 150
  },
  "blocks": [...],
  "total": 50,
  "limit": 50,
  "offset": 0
}
```

#### GET /api/analytics/distressed
Get blocks with high vacancy or tax delinquency.

**Query Parameters:**
- `street` (string): Filter by street name
- `limit` (integer): Number of results (default: 50)

**Response:**
```json
{
  "total": 25,
  "breakdown": {
    "highVacancy": 15,
    "highDelinquency": 12,
    "both": 8
  },
  "blocks": [
    {
      "block_id": "example_block",
      "vacancy_rate": 45.0,
      "tax_delinquent_percentage": 30.0
    }
  ]
}
```

#### GET /api/analytics/high-activity
Get blocks with high sales activity.

**Query Parameters:**
- `street` (string): Filter by street name
- `minSales` (integer): Minimum sales count
- `limit` (integer): Number of results (default: 50)

**Response:**
```json
{
  "total": 20,
  "marketInsights": {
    "totalSales": 250,
    "avgSalesPerBlock": 12.5,
    "maxSales": 25
  },
  "blocks": [...]
}
```

### Search

#### GET /api/search
Search blocks and parcels by various criteria.

**Query Parameters:**
- `q` (string, required): Search query
- `type` (string): Filter type (vacant, active, distressed)

**Response:**
```json
{
  "query": "woodward",
  "results": {
    "blocks": [...],
    "parcels": [...]
  },
  "counts": {
    "blocks": 10,
    "parcels": 5
  }
}
```

## Error Responses

All endpoints return errors in the following format:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad request (invalid parameters)
- `404` - Resource not found
- `405` - Method not allowed
- `500` - Internal server error
- `503` - Service unavailable

## Rate Limiting

The API is deployed on Vercel with a maximum execution time of 30 seconds per request. For large data operations, use pagination.

## CORS

All endpoints support CORS with the following headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`