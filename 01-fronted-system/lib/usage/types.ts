/**
 * Usage Helper Types
 *
 * Shared types for the usage helper library.
 * Focused on GenAI usage metrics (tokens, requests, latency).
 */

// ============================================
// Core Usage Types
// ============================================

/**
 * GenAI usage record from BigQuery
 */
export interface GenAIUsageRecord {
  /** Usage date (YYYY-MM-DD) */
  usage_date: string
  /** Provider name (openai, anthropic, gemini, deepseek) */
  provider: string
  /** Model identifier (gpt-4, claude-3-opus, etc.) */
  model: string
  /** Number of input tokens */
  input_tokens: number
  /** Number of output tokens */
  output_tokens: number
  /** Number of cached input tokens */
  cached_tokens?: number
  /** Total API requests */
  request_count: number
  /** Successful requests */
  successful_requests?: number
  /** Failed requests */
  failed_requests?: number
  /** Average latency in milliseconds */
  avg_latency_ms?: number
  /** Time to first token in milliseconds */
  avg_ttft_ms?: number
  /** Rate limit hits */
  rate_limit_hits?: number
  /** Tokens per minute (rate) */
  tokens_per_minute?: number
  /** Total cost for this usage */
  total_cost?: number
  /** Currency code */
  currency?: string
}

/**
 * Aggregated usage summary
 */
export interface UsageSummary {
  /** Total input tokens */
  total_input_tokens: number
  /** Total output tokens */
  total_output_tokens: number
  /** Total cached tokens */
  total_cached_tokens: number
  /** Combined total tokens (input + output) */
  total_tokens: number
  /** Total API requests */
  total_requests: number
  /** Successful request count */
  successful_requests: number
  /** Failed request count */
  failed_requests: number
  /** Success rate (0-100) */
  success_rate: number
  /** Average latency in ms */
  avg_latency_ms: number
  /** Average time to first token in ms */
  avg_ttft_ms: number
  /** Total rate limit hits */
  rate_limit_hits: number
  /** Total cost */
  total_cost: number
  /** Currency */
  currency: string
  /** Number of unique providers */
  provider_count: number
  /** Number of unique models */
  model_count: number
  /** Date range covered */
  date_range: {
    start: string
    end: string
  }
}

/**
 * Usage breakdown by entity (provider, model, date)
 */
export interface UsageBreakdown {
  /** Entity key (provider name, model name, or date) */
  key: string
  /** Display name */
  name: string
  /** Total tokens (input + output) */
  total_tokens: number
  /** Input tokens */
  input_tokens: number
  /** Output tokens */
  output_tokens: number
  /** Request count */
  request_count: number
  /** Percentage of total */
  percentage: number
  /** Cost associated with this usage */
  cost?: number
  /** Color for charts */
  color?: string
}

/**
 * Token usage for display in UI
 */
export interface TokenUsage {
  /** Input tokens */
  input: number
  /** Output tokens */
  output: number
  /** Cached tokens */
  cached: number
  /** Total tokens */
  total: number
}

/**
 * Request metrics for display
 */
export interface RequestMetrics {
  /** Total requests */
  total: number
  /** Successful requests */
  successful: number
  /** Failed requests */
  failed: number
  /** Success rate percentage */
  successRate: number
  /** Average tokens per request */
  avgTokensPerRequest: number
}

/**
 * Latency metrics for display
 */
export interface LatencyMetrics {
  /** Average latency in ms */
  avgLatency: number
  /** Average time to first token in ms */
  avgTtft: number
  /** P50 latency (if available) */
  p50Latency?: number
  /** P95 latency (if available) */
  p95Latency?: number
  /** P99 latency (if available) */
  p99Latency?: number
}

// ============================================
// Chart & Table Types
// ============================================

/**
 * Usage breakdown item for charts
 */
export interface UsageBreakdownItem {
  /** Unique key */
  key: string
  /** Display name */
  name: string
  /** Value (tokens, requests, etc.) */
  value: number
  /** Percentage of total */
  percentage: number
  /** Optional count (e.g., request count) */
  count?: number
  /** Color for visualization */
  color: string
}

/**
 * Usage table row for data tables
 */
export interface UsageTableRow {
  /** Row identifier */
  id: string
  /** Display name */
  name: string
  /** Entity type (provider, model, date) */
  type: string
  /** Input tokens */
  inputTokens: number
  /** Output tokens */
  outputTokens: number
  /** Total tokens */
  totalTokens: number
  /** Request count */
  requests: number
  /** Average tokens per request */
  avgTokensPerRequest: number
  /** Daily rate (for forecasting) */
  dailyRate: number
  /** Monthly forecast */
  monthlyForecast: number
  /** Percentage of total */
  percentage: number
  /** Color for visualization */
  color: string
}

/**
 * Time series point for trend charts
 */
export interface UsageTimeSeriesPoint {
  /** Date string (YYYY-MM-DD) */
  date: string
  /** Total tokens */
  tokens: number
  /** Input tokens */
  inputTokens: number
  /** Output tokens */
  outputTokens: number
  /** Request count */
  requests: number
  /** Cost (optional) */
  cost?: number
  /** Breakdown by provider (optional) */
  byProvider?: Record<string, number>
  /** Breakdown by model (optional) */
  byModel?: Record<string, number>
}

// ============================================
// Filter & Config Types
// ============================================

/**
 * Usage filter options
 */
export interface UsageFilterOptions {
  /** Date range filter */
  dateRange?: {
    start: Date
    end: Date
  }
  /** Filter by providers */
  providers?: string[]
  /** Filter by models */
  models?: string[]
  /** Minimum token count */
  minTokens?: number
  /** Maximum token count */
  maxTokens?: number
  /** Only include successful requests */
  successfulOnly?: boolean
}

/**
 * Provider configuration for display
 */
export interface UsageProviderConfig {
  /** Display names by provider key */
  names: Record<string, string>
  /** Colors by provider key */
  colors: Record<string, string>
  /** Default color for unknown providers */
  defaultColor: string
  /** Default type label */
  defaultType?: string
}

/**
 * Model configuration for display
 */
export interface UsageModelConfig {
  /** Display names by model key */
  names: Record<string, string>
  /** Provider for each model */
  providers: Record<string, string>
  /** Token limits by model */
  contextWindows?: Record<string, number>
  /** Colors by model (inherits from provider if not set) */
  colors?: Record<string, string>
}

// ============================================
// Comparison Types
// ============================================

/**
 * Usage comparison result
 */
export interface UsageComparison {
  /** Current period data */
  current: {
    tokens: number
    requests: number
    cost: number
    label: string
  }
  /** Previous period data */
  previous: {
    tokens: number
    requests: number
    cost: number
    label: string
  }
  /** Change in tokens */
  tokenChange: number
  /** Token change percentage */
  tokenChangePercent: number
  /** Change in requests */
  requestChange: number
  /** Request change percentage */
  requestChangePercent: number
  /** Change in cost */
  costChange: number
  /** Cost change percentage */
  costChangePercent: number
  /** Overall trend */
  trend: "up" | "down" | "flat"
}

/**
 * Usage trend analysis
 */
export interface UsageTrend {
  /** Trend direction */
  direction: "increasing" | "decreasing" | "stable"
  /** Growth rate (daily) */
  dailyGrowthRate: number
  /** Projected tokens for month end */
  monthlyProjection: number
  /** Projected tokens for year end */
  annualProjection: number
  /** Days of data analyzed */
  daysAnalyzed: number
}

// ============================================
// API Response Types
// ============================================

/**
 * Usage data response from server action
 */
export interface UsageDataResponse {
  success: boolean
  data?: GenAIUsageRecord[]
  summary?: UsageSummary
  error?: string
  currency?: string
}

/**
 * Usage breakdown response
 */
export interface UsageBreakdownResponse {
  success: boolean
  data?: UsageBreakdown[]
  error?: string
}
