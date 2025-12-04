# Enterprise Analytics System

A comprehensive, reusable analytics dashboard system with enterprise-grade charts, data tables, and advanced filtering capabilities.

## 📁 Architecture

The analytics system is organized into reusable, modular components:

\`\`\`
├── app/
│   ├── api/
│   │   └── mock-cost-api/          # Mock API endpoint for cost data
│   │       └── route.ts
│   └── [orgSlug]/
│       └── analytics/               # Analytics dashboard page
│           └── page.tsx
├── components/
│   ├── charts/                      # Reusable chart components
│   │   ├── cost-by-service-chart.tsx
│   │   ├── cost-by-region-chart.tsx
│   │   ├── cost-trend-chart.tsx
│   │   └── cost-by-account-chart.tsx
│   └── tables/                      # Reusable table components
│       └── cost-data-table.tsx
├── lib/
│   └── types/
│       └── cost.ts                  # TypeScript interfaces
└── public/
    └── data/
        └── cost-data.csv            # Sample cost data
\`\`\`

## 🚀 Features

### 1. Reusable Chart Components

All chart components are fully reusable and accept standardized props:

\`\`\`typescript
interface ChartProps {
  data: ChartDataPoint[]
  title?: string
  description?: string
}
\`\`\`

**Available Charts:**
- `CostByServiceChart` - Bar chart showing costs by service
- `CostByRegionChart` - Pie chart showing cost distribution by region
- `CostTrendChart` - Line chart showing cost trends over time
- `CostByAccountChart` - Horizontal bar chart showing costs by account

**Example Usage:**
\`\`\`tsx
import { CostByServiceChart } from "@/components/charts/cost-by-service-chart"

const data = [
  { name: "EC2", value: 1234.56 },
  { name: "S3", value: 789.12 },
]

<CostByServiceChart 
  data={data}
  title="Custom Title"
  description="Custom description"
/>
\`\`\`

### 2. Advanced Data Table

The `CostDataTable` component includes:
- **Pagination** - Efficient data loading with page navigation
- **Advanced Filtering** - Multi-field search with dropdown filters
- **Real-time Search** - Search across all fields instantly
- **Responsive Design** - Works on all screen sizes
- **Currency Formatting** - Automatic USD formatting with precision

**Example Usage:**
\`\`\`tsx
import { CostDataTable } from "@/components/tables/cost-data-table"

<CostDataTable
  data={records}
  pagination={paginationInfo}
  filters={availableFilters}
  onFilterChange={(filters) => handleFilters(filters)}
  onPageChange={(page) => setPage(page)}
/>
\`\`\`

### 3. Mock API Endpoint

The `/api/mock-cost-api` endpoint provides a production-ready API interface:

**Supported Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Records per page (default: 50)
- `service` - Filter by service name
- `region` - Filter by region
- `account` - Filter by account name
- `category` - Filter by service category
- `search` - Search across all fields

**Example Request:**
\`\`\`bash
GET /api/mock-cost-api?page=1&limit=50&service=EC2&region=us-east-1
\`\`\`

**Response Format:**
\`\`\`json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1000,
    "totalPages": 20
  },
  "aggregations": {
    "totalCost": 12345.67,
    "totalRecords": 1000
  },
  "filters": {
    "services": ["EC2", "S3", ...],
    "regions": ["us-east-1", ...],
    "accounts": [...],
    "categories": [...]
  }
}
\`\`\`

### 4. KPI Cards

Four key performance indicators displayed at the top:
- **Total Cost** - Aggregate billing for the period
- **Total Records** - Number of cost line items
- **Active Services** - Count of unique services
- **Avg Cost/Record** - Average cost per line item

## 🔄 Replacing the Mock API

To replace the mock API with your real data source:

### Option 1: Direct Database Query

\`\`\`typescript
// app/api/cost-data/route.ts
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  
  // Your database query here
  const { data, error } = await supabase
    .from("cost_records")
    .select("*")
    .limit(parseInt(searchParams.get("limit") || "50"))
  
  return NextResponse.json({ data, ...otherInfo })
}
\`\`\`

### Option 2: External API Integration

\`\`\`typescript
// app/api/cost-data/route.ts
export async function GET(request: Request) {
  const response = await fetch(
    `https://your-api.com/costs?${searchParams}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.API_KEY}`
      }
    }
  )
  
  const data = await response.json()
  return NextResponse.json(data)
}
\`\`\`

### Option 3: AWS Cost Explorer API

\`\`\`typescript
// app/api/cost-data/route.ts
import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer"

export async function GET(request: Request) {
  const client = new CostExplorerClient({ region: "us-east-1" })
  
  const command = new GetCostAndUsageCommand({
    TimePeriod: {
      Start: "2024-09-01",
      End: "2024-10-01"
    },
    Granularity: "DAILY",
    Metrics: ["BlendedCost"]
  })
  
  const response = await client.send(command)
  // Transform and return data
}
\`\`\`

## 📊 Chart Data Transformation

Charts expect data in this format:

\`\`\`typescript
interface ChartDataPoint {
  name: string      // X-axis label
  value: number     // Y-axis value
  [key: string]: string | number  // Additional fields
}
\`\`\`

**Transform your data:**
\`\`\`typescript
// Group by service
const serviceData = records.reduce((acc, record) => {
  const service = record.ServiceName || "Unknown"
  acc[service] = (acc[service] || 0) + record.BilledCost
  return acc
}, {} as Record<string, number>)

// Convert to chart format
const chartData: ChartDataPoint[] = Object.entries(serviceData)
  .map(([name, value]) => ({ name, value }))
  .sort((a, b) => b.value - a.value)
  .slice(0, 10)  // Top 10
\`\`\`

## 🎨 Customization

### Adding New Chart Types

1. Create a new chart component:

\`\`\`typescript
// components/charts/my-custom-chart.tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer } from "@/components/ui/chart"
import { Area, AreaChart, ResponsiveContainer } from "recharts"
import type { ChartDataPoint } from "@/lib/types/cost"

export function MyCustomChart({ data, title }: { data: ChartDataPoint[], title?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || "My Chart"}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{ value: { color: "hsl(var(--chart-1))" } }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <Area dataKey="value" fill="var(--color-value)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
\`\`\`

2. Import and use in analytics page:

\`\`\`typescript
import { MyCustomChart } from "@/components/charts/my-custom-chart"

// In your page component
<MyCustomChart data={myData} title="Custom Analysis" />
\`\`\`

### Adding New Filters

Update the `CostDataTable` component to include additional filters:

\`\`\`typescript
// In cost-data-table.tsx
const [selectedCategory, setSelectedCategory] = useState<string>("all")

<Select value={selectedCategory} onValueChange={setSelectedCategory}>
  <SelectTrigger>
    <SelectValue placeholder="All Categories" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Categories</SelectItem>
    {filters?.categories.map((category) => (
      <SelectItem key={category} value={category}>{category}</SelectItem>
    ))}
  </SelectContent>
</Select>
\`\`\`

## 🔒 Security Considerations

1. **API Authentication** - The mock API currently has no auth. Add org-based authentication:

\`\`\`typescript
// app/api/cost-data/route.ts
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  // Continue with query...
}
\`\`\`

2. **Row-Level Security** - Enable RLS on cost data tables in Supabase
3. **Rate Limiting** - Add rate limiting for production use
4. **Data Validation** - Validate all query parameters

## 📦 Data Format

The system expects CSV data with these columns:

**Required Fields:**
- `BilledCost` (number) - The billed cost amount
- `ServiceName` (string) - Name of the cloud service
- `ServiceCategory` (string) - Category of service (Compute, Storage, etc.)
- `RegionName` (string) - Geographic region
- `SubAccountName` (string) - Sub-account or organizational unit

**Optional Fields:**
- `AvailabilityZone`
- `BillingAccountId`
- `ChargeCategory`
- `ResourceType`
- `ConsumedQuantity`
- `ConsumedUnit`
- `Tags` (JSON string)

## 🧪 Testing

Test the analytics system locally:

\`\`\`bash
# Start development server
npm run dev

# Navigate to analytics page
http://localhost:3000/{your-org-slug}/analytics

# Test API endpoint
curl http://localhost:3000/api/mock-cost-api?page=1&limit=10
\`\`\`

## 🚢 Production Deployment

Before deploying to production:

1. ✅ Replace mock API with real data source
2. ✅ Add authentication to API endpoints
3. ✅ Enable RLS on database tables
4. ✅ Add error boundaries
5. ✅ Implement loading states
6. ✅ Add rate limiting
7. ✅ Configure CORS if needed
8. ✅ Test with large datasets (10k+ records)
9. ✅ Optimize query performance
10. ✅ Add monitoring and logging

## 🎯 Best Practices

1. **Performance** - Use pagination for large datasets
2. **Caching** - Cache aggregated data when possible
3. **Error Handling** - Show user-friendly error messages
4. **Accessibility** - All charts have proper labels and ARIA attributes
5. **Responsive** - Test on mobile devices
6. **Type Safety** - Use TypeScript interfaces consistently
7. **Reusability** - Keep components generic and configurable

## 📝 License

This analytics system is part of your enterprise application and follows the same license.
