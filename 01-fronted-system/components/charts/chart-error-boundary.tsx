"use client"

/**
 * ENT-001: Chart-specific Error Boundary
 *
 * Wraps chart components to prevent crashes from:
 * - NaN/Infinity in data
 * - Invalid date parsing
 * - Recharts rendering errors
 *
 * Shows a graceful fallback instead of crashing the entire dashboard.
 */

import React, { type ReactNode } from "react"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface ChartErrorBoundaryProps {
  children: ReactNode
  /** Chart title for error message context */
  chartTitle?: string
  /** Minimum height to maintain layout */
  minHeight?: number
}

interface ChartErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ChartErrorBoundary extends React.Component<
  ChartErrorBoundaryProps,
  ChartErrorBoundaryState
> {
  // FIX-018: Static displayName for React DevTools
  static displayName = "ChartErrorBoundary"

  constructor(props: ChartErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ChartErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error for monitoring (could integrate with Sentry/DataDog)
    console.error("[ChartErrorBoundary] Chart rendering failed:", {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    const { hasError, error } = this.state
    const { children, chartTitle, minHeight = 200 } = this.props

    if (hasError) {
      return (
        <Card className="overflow-hidden">
          <CardContent
            className="flex flex-col items-center justify-center text-center p-6"
            style={{ minHeight }}
          >
            <div className="rounded-full bg-amber-100 p-3 mb-3">
              <AlertCircle className="h-6 w-6 text-amber-600" />
            </div>
            <h3 className="font-medium text-[var(--text-primary)] mb-1">
              {chartTitle ? `${chartTitle} unavailable` : "Chart unavailable"}
            </h3>
            <p className="text-sm text-[var(--text-tertiary)] mb-4 max-w-xs">
              {error?.message?.includes("NaN")
                ? "Data contains invalid values"
                : "Unable to display this chart"}
            </p>
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--text-secondary)] bg-white border border-[var(--border-subtle)] rounded-lg hover:bg-[var(--surface-secondary)] transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </CardContent>
        </Card>
      )
    }

    return children
  }
}

/**
 * HOC to wrap any chart component with error boundary
 */
export function withChartErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  chartTitle?: string
) {
  const WithErrorBoundary = (props: P) => (
    <ChartErrorBoundary chartTitle={chartTitle}>
      <WrappedComponent {...props} />
    </ChartErrorBoundary>
  )

  WithErrorBoundary.displayName = `WithChartErrorBoundary(${
    WrappedComponent.displayName || WrappedComponent.name || "Component"
  })`

  return WithErrorBoundary
}
