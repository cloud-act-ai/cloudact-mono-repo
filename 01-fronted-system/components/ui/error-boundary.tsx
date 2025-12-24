"use client"

import React, { type ComponentType, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode | ComponentType<{ error: Error; reset: () => void }>
  /**
   * If true, shows nothing when an error occurs (useful for background components)
   */
  silent?: boolean
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * A reusable Error Boundary component to catch client-side errors in children.
 * Prevents the entire application from crashing (triggered global-error.tsx).
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error to console (or monitoring service in production)
    console.error("ErrorBoundary caught an error:", error, errorInfo)
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.silent) {
        return null
      }

      const { fallback } = this.props

      if (React.isValidElement(fallback)) {
        return fallback
      }

      if (typeof fallback === "function") {
        const FallbackComponent = fallback as ComponentType<{ error: Error; reset: () => void }>
        return <FallbackComponent error={this.state.error!} reset={this.reset} />
      }

      // Default fallback UI
      return (
        <div className="p-4 border border-red-200 rounded-md bg-red-50 text-red-800 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <div className="flex-1">
            <h3 className="font-medium text-sm">Component Error</h3>
            <p className="text-xs text-red-600/80 mt-1">
              This section failed to load.
            </p>
          </div>
          <button
            onClick={this.reset}
            className="text-xs font-semibold px-3 py-1 bg-white border border-red-200 rounded hover:bg-red-50 transition-colors"
          >
            Retry
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
