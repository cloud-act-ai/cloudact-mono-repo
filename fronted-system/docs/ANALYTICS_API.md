# Analytics API Documentation

## Endpoints

### GET /api/mock-cost-api

Retrieve paginated cost data with filtering and aggregations.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number for pagination |
| `limit` | number | 50 | Number of records per page (max 100) |
| `service` | string | - | Filter by service name (partial match) |
| `region` | string | - | Filter by region name (partial match) |
| `account` | string | - | Filter by account name (partial match) |
| `category` | string | - | Filter by service category (partial match) |
| `search` | string | - | Search across all fields |

#### Response Schema

\`\`\`typescript
interface CostApiResponse {
  data: CostRecord[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  aggregations: {
    totalCost: number
    totalRecords: number
  }
  filters: {
    services: string[]
    regions: string[]
    accounts: string[]
    categories: string[]
  }
}
\`\`\`

#### Example Requests

**Basic request:**
\`\`\`bash
GET /api/mock-cost-api
\`\`\`

**Paginated request:**
\`\`\`bash
GET /api/mock-cost-api?page=2&limit=100
\`\`\`

**Filtered request:**
\`\`\`bash
GET /api/mock-cost-api?service=EC2&region=us-east-1
\`\`\`

**Search request:**
\`\`\`bash
GET /api/mock-cost-api?search=compute
\`\`\`

**Combined filters:**
\`\`\`bash
GET /api/mock-cost-api?page=1&limit=50&service=EC2&region=us-east-1&search=instance
\`\`\`

#### Error Responses

**500 Internal Server Error:**
\`\`\`json
{
  "error": "Failed to load cost data"
}
\`\`\`

## Data Model

### CostRecord

\`\`\`typescript
interface CostRecord {
  AvailabilityZone: string
  BilledCost: number
  BillingAccountId: string
  BillingAccountName: string
  BillingCurrency: string
  BillingPeriodEnd: string
  BillingPeriodStart: string
  ChargeCategory: string
  ServiceName: string
  ServiceCategory: string
  RegionName: string
  SubAccountName: string
  ResourceType: string
  ConsumedQuantity: number
  ConsumedUnit: string
  EffectiveCost: number
  ListCost: number
  Tags: string  // JSON string
}
\`\`\`

## Integration Examples

### React/Next.js with SWR

\`\`\`typescript
import useSWR from 'swr'

function useAnalytics(filters: Record<string, string>) {
  const params = new URLSearchParams(filters)
  const { data, error } = useSWR(
    `/api/mock-cost-api?${params}`,
    fetcher
  )
  
  return {
    data,
    isLoading: !error && !data,
    isError: error
  }
}
\`\`\`

### Fetch API

\`\`\`typescript
async function fetchCostData(page = 1, filters = {}) {
  const params = new URLSearchParams({
    page: page.toString(),
    ...filters
  })
  
  const response = await fetch(`/api/mock-cost-api?${params}`)
  if (!response.ok) throw new Error('Failed to fetch')
  
  return response.json()
}
\`\`\`

### Axios

\`\`\`typescript
import axios from 'axios'

const api = axios.create({
  baseURL: '/api'
})

export const getCostData = (params: {
  page?: number
  limit?: number
  service?: string
  region?: string
}) => {
  return api.get('/mock-cost-api', { params })
}
